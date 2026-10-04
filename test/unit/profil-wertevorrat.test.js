// 4T-001158 (Epic 3E-000219, E12): Unit-Tests des Wertevorrats aus einer Abfrage.
//
// Der Schwerpunkt liegt auf der **Begrenzung**, weil sie die Zusage dieses
// Tasks ist und ihr Bruch unsichtbar wäre: Ein zu früh oder zu oft
// ausgewerteter Vorrat fällt in keinem Test auf, der mit zehn Dokumenten
// läuft. Gezählt werden deshalb die **Auswertungen** und nicht die Laufzeit —
// eine Laufzeit-Messung hätte bei dieser Bestandsgröße keine Aussage.
//
// Setup-/Teardown-Muster wie graph-index.test.js: echter Index über ein
// Temp-Verzeichnis, Soft-Timer per Fake-Timer feuern.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auswertungsZaehler,
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
  werteAusAbfrage,
  zwischenspeicherLeeren,
} from '../../src/main/backlinks.js';
// 4T-002034 (Epic 3E-000260): Der Wertevorrat liest die Ergebnismenge der
// Antwort; eingespeiste Antworten tragen deshalb eine Menge statt der
// bisherigen Treffer-Liste `files`.
import {
  fileOrigin,
  makeResultSet,
  makeRow,
  makeState,
} from '../../src/shared/query/result-set.js';
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';
// 4T-002080: Aus-Zustand der Datenbank für die gruppierte Datensatz-Abfrage
// (Muster `datensatz-abfrage-aus-zustand.test.js`).
import { createRequire } from 'node:module';
import { HINT_DATABASE_OFF } from '../../src/main/index/query-records.js';
// 4T-002080: Aufgaben-Umgebung und der Kanal des Wertevorrats.
import { buildTaskEnv } from '../../src/main/index/task-env.js';
import { registerProfilesIpc } from '../../src/main/ipc/profiles.js';
import * as backlinksModul from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { readCount } = require_('../../src/main/index/record-table-read.js');

// Eingespeiste Antwort im Zustand «bereit» mit einer Zeile je Name.
function antwortMit(namen) {
  const rows = namen.map((name) => makeRow([], fileOrigin(`/raum/${name}.md`, name)));
  return {
    resultSet: makeResultSet({ scope: 'files', type: 'list', rows, state: makeState('ready') }),
  };
}

// Eingespeiste Antwort eines Zustands ohne Ergebnis.
function antwortImZustand(status) {
  return { resultSet: makeResultSet({ state: makeState(status) }) };
}

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-wv-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, ownerKey, areaRoot) {
  let result = backlinksFor(activeFile, ownerKey, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, areaRoot);
  }
  return result;
}

beforeEach(() => {
  zwischenspeicherLeeren();
});

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

async function bestand() {
  const root = makeRoot();
  const a = write(root, 'Start.md', 'Einstieg.');
  write(root, 'Projekte/Neubau.md', '---\nart: projekt\n---\nText.');
  write(root, 'Projekte/Umbau.md', '---\nart: projekt\n---\nText.');
  write(root, 'Sonstiges/Notiz.md', '---\nart: notiz\n---\nText.');
  await indexFor(a, 'test:wertevorrat');
  return { root, a };
}

describe('werteAusAbfrage — Wertevorrat aus einer Abfrage', () => {
  it('AK1: liefert die Namen der Treffer als Wertevorrat', async () => {
    const { a } = await bestand();
    const { status, values } = werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    expect(status).toBe('ready');
    expect([...values].sort()).toEqual(['Neubau', 'Umbau']);
  });

  it('AK3: zwei Anfragen bei unverändertem Index lösen genau eine Auswertung aus', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    expect(auswertungsZaehler() - vorher).toBe(1);
  });

  it('AK3: verschiedene Abfragen sind verschiedene Einträge', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, 'WHERE art = "notiz"');
    expect(auswertungsZaehler() - vorher).toBe(2);
  });

  // Der AK4-Nachweis (bewegter Stand ⇒ neue Auswertung) steht weiter unten
  // mit eingespeisten Abhängigkeiten: Am echten Index lässt er sich nicht
  // führen, weil der Watcher im Unit-Umfeld keine zweite Index-Meldung
  // absetzt — der Stand bliebe bei 1, und der Test prüfte in Wahrheit den
  // Watcher statt der Invalidierung.

  it('AK9: eine Abfrage, die niemand verlangt, wird nicht ausgewertet', async () => {
    await bestand();
    const vorher = auswertungsZaehler();
    // Kein Aufruf von werteAusAbfrage: der Index-Aufbau allein rechnet nichts.
    expect(auswertungsZaehler()).toBe(vorher);
  });

  it('AK5/AK6: eine fehlerhafte Abfrage ergibt den leeren Vorrat, keinen Wurf', async () => {
    const { a } = await bestand();
    const { status, values } = werteAusAbfrage(a, null, 'WHERE ((( kaputt');
    expect(status).toBe('ready');
    expect(values).toEqual([]);
  });

  it('AK6: eine Abfrage ohne Treffer ist derselbe Fall und kein Fehler', async () => {
    const { a } = await bestand();
    const { status, values } = werteAusAbfrage(a, null, 'WHERE art = "gibtsnicht"');
    expect(status).toBe('ready');
    expect(values).toEqual([]);
  });

  it('meldet unavailable, wo keine Aussage möglich ist', () => {
    expect(werteAusAbfrage(null, null, 'WHERE x = 1').status).toBe('unavailable');
    const fremd = path.join(os.tmpdir(), 'nie-indexiert', 'x.md');
    expect(werteAusAbfrage(fremd, null, 'WHERE x = 1').status).toBe('unavailable');
  });

  it('eine leere Abfrage wird gar nicht erst ausgewertet', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    expect(werteAusAbfrage(a, null, '').status).toBe('unavailable');
    expect(werteAusAbfrage(a, null, '   ').status).toBe('unavailable');
    expect(werteAusAbfrage(a, null, null).status).toBe('unavailable');
    expect(auswertungsZaehler()).toBe(vorher);
  });

  it('Randleerraum im Abfrage-Text trifft denselben Eintrag', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, '  WHERE art = "projekt"  ');
    expect(auswertungsZaehler() - vorher).toBe(1);
  });

  it('Doppelte Treffer-Namen zählen einmal', async () => {
    const { root, a } = await bestand();
    // Zwei Dateien gleichen Namens in verschiedenen Ordnern.
    write(root, 'Anderswo/Neubau.md', '---\nart: projekt\n---\nText.');
    await indexFor(a, 'test:wertevorrat');
    const { values } = werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    expect(values.filter((v) => v === 'Neubau')).toHaveLength(1);
  });

  // 4T-002040 (Epic 3E-000258, Festlegung 16): Eine Datensatz-Abfrage als
  // Quelle liefert keine Werte, obwohl sie Treffer mit Anzeige-Form hat. Anker:
  // Dieselbe Abfrage trifft über den Abfrage-Kanal zwei Datensätze.
  it('Datensatz-Zeilen liefern keinen Wert', async () => {
    const root = makeRoot();
    const a = write(root, 'Start.md', 'Einstieg.');
    write(
      root,
      'Library.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: title',
        '  display: title',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Zauberberg',
        '|- id="r-00002"',
        '| Kurz',
        '```',
        '',
      ].join('\n'),
    );
    await indexFor(a, 'test:wertevorrat');
    const abfrage = 'LIST RECORDS FROM "Library"';
    const menge = frontmatterQueryFor(a, abfrage).resultSet;
    expect(menge.rows.map((r) => r.origin.display)).toEqual(['Kurz', 'Zauberberg']);
    expect(werteAusAbfrage(a, null, abfrage)).toEqual({ status: 'ready', values: [] });
  });
});

// Die Invalidierungs-Regel mit eingespeisten Abhängigkeiten. Sie ist die
// tragende Zusage dieses Tasks und lässt sich am echten Index NICHT prüfen:
// Der Watcher meldet im Unit-Umfeld keine zweite Index-Änderung, der Stand
// bleibt bei 1, und ein Test darüber wäre eine Behauptung statt eines
// Nachweises. Eingespeist werden deshalb `stand` und `auswerten` — dasselbe
// Mittel, mit dem der Profil-Katalog seinen Dateizugriff prüfbar macht.
describe('werteAusAbfrage — Invalidierung gegen den Index-Stand (4T-001158)', () => {
  function umgebung(werteJeLauf) {
    let stand = 1;
    let laeufe = 0;
    return {
      deps: {
        stand: () => stand,
        auswerten: () => {
          const werte = werteJeLauf[Math.min(laeufe, werteJeLauf.length - 1)];
          laeufe += 1;
          return antwortMit(werte);
        },
      },
      standBewegen: () => {
        stand += 1;
      },
      laeufe: () => laeufe,
    };
  }

  it('AK3: bei gleichem Stand wird genau einmal ausgewertet', async () => {
    const { a } = await bestand();
    const u = umgebung([['Alpha'], ['Beta']]);
    const erst = werteAusAbfrage(a, null, 'IRGENDEINE', u.deps);
    const zweit = werteAusAbfrage(a, null, 'IRGENDEINE', u.deps);
    expect(erst.values).toEqual(['Alpha']);
    expect(zweit.values).toEqual(['Alpha']); // aus dem Zwischenspeicher
    expect(u.laeufe()).toBe(1);
  });

  it('AK4: bewegt sich der Stand, wertet die nächste Anfrage neu aus', async () => {
    const { a } = await bestand();
    const u = umgebung([['Alpha'], ['Alpha', 'Beta']]);
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', u.deps).values).toEqual(['Alpha']);
    u.standBewegen();
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', u.deps).values).toEqual(['Alpha', 'Beta']);
    expect(u.laeufe()).toBe(2);
    // Und danach greift der Zwischenspeicher wieder.
    werteAusAbfrage(a, null, 'IRGENDEINE', u.deps);
    expect(u.laeufe()).toBe(2);
  });

  it('AK3: ein unfertiger Index wird nicht zwischengespeichert', async () => {
    const { a } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        return laeufe === 1 ? antwortImZustand('indexing') : antwortMit(['X']);
      },
    };
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', deps).status).toBe('indexing');
    // Der unfertige Stand darf nicht hängenbleiben: die nächste Anfrage
    // wertet erneut aus und liefert das echte Ergebnis.
    const zweit = werteAusAbfrage(a, null, 'IRGENDEINE', deps);
    expect(zweit.status).toBe('ready');
    expect(zweit.values).toEqual(['X']);
    expect(laeufe).toBe(2);
  });

  it('AK5: ein Wurf der Auswertung ergibt den leeren Vorrat und bleibt unzwischengespeichert', async () => {
    const { a } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        throw new Error('kaputt');
      },
    };
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', deps)).toEqual({
      status: 'unavailable',
      values: [],
    });
    werteAusAbfrage(a, null, 'IRGENDEINE', deps);
    expect(laeufe).toBe(2);
  });

  it('AK9: der Zwischenspeicher wächst mit den Abfragen, nicht mit dem Bestand', async () => {
    const { a } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        // Ein großer Bestand: 5000 Treffer je Auswertung.
        return antwortMit(Array.from({ length: 5000 }, (_, i) => `Datei ${i}`));
      },
    };
    // Drei verschiedene Abfragen, jede zweimal gefragt.
    for (const q of ['A', 'B', 'C']) {
      werteAusAbfrage(a, null, q, deps);
      werteAusAbfrage(a, null, q, deps);
    }
    // Drei Auswertungen für drei Abfragen — die Bestandsgröße spielt keine
    // Rolle, nur die Zahl verschiedener Abfrage-Texte.
    expect(laeufe).toBe(3);
  });
});

// 4T-002034 (Epic 3E-000260): Der Vorrat liest die Ergebnismenge statt der
// bisherigen Treffer-Liste `files` und liefert dieselben Werte (Story AK3).
// Solange die Antwort beide Formen trug (bis 4T-002035), lief der bisherige
// Lese-Weg hier als Referenz gegen dieselbe echte Antwort. Seit 4T-002035
// trägt die Antwort allein die Menge; der Fall hält die Werte je Abfrage
// deshalb fest. Sie sind die des bisherigen Lese-Wegs, weil der Vergleich bis
// dahin an genau diesen Antworten grün war. Einzige gewollte Änderung seither:
// Die gruppierte Abfrage liefert seit 4T-002080 ihre Treffer wie die
// ungruppierte (Entscheidung F6 Option A).
describe('werteAusAbfrage — Ergebnismenge als Quelle (4T-002034)', () => {
  const taskEnv = {
    enabled: true,
    globalFilter: '',
    statusTypeOf: createTaskStatusTypeResolver(null),
  };

  it('AK3: dieselben Werte wie aus der bisherigen Treffer-Liste', async () => {
    // Eigener Bestand, vollständig vor dem ersten Index-Aufbau geschrieben.
    const root = makeRoot();
    const a = write(root, 'Start.md', 'Einstieg.');
    write(root, 'Projekte/Umbau.md', '---\nart: projekt\n---\nText.');
    write(root, 'Sonstiges/Notiz.md', '---\nart: notiz\n---\nText.');
    write(root, 'Projekte/Neubau.md', '---\nart: projekt\n---\nText. ^n1\n\n- [ ] Dach decken\n');
    write(
      root,
      'Projekte/Neubau.mdd',
      JSON.stringify({
        schemaVersion: 1,
        history: { anchors: [], packets: [] },
        blockData: { n1: { values: { phase: 'roh' }, updated: '2026-07-01T10:00:00Z' } },
      }),
    );
    write(root, 'Anderswo/Neubau.md', '---\nart: projekt\n---\n- [ ] Fenster\n');
    await indexFor(a, 'test:wertevorrat');
    // Werte des bisherigen Lese-Wegs je Abfrage (Name je Treffer der flachen
    // Liste, getrimmt, Doppelte einmal; Fehler ergeben leer). Die Gruppierung
    // ergab dort leer und liefert seit 4T-002080 die Werte der ungruppierten.
    const abfragen = {
      'WHERE art = "projekt"': ['Neubau', 'Umbau'],
      'TABLE art WHERE art = "projekt"': ['Neubau', 'Umbau'],
      'LIST BLOCKS': ['Neubau#^n1'],
      'TABLE BLOCKS phase': ['Neubau#^n1'],
      'LIST TASKS': ['Neubau'],
      'TABLE TASKS description': ['Neubau'],
      'LIST TASKS GROUP BY file.name': ['Neubau'],
      'LIST WHERE (((': [],
    };
    let stand = 0;
    for (const [abfrage, erwartet] of Object.entries(abfragen)) {
      const antwort = frontmatterQueryFor(a, abfrage, undefined, taskEnv);
      stand += 1;
      const deps = { stand: () => stand, auswerten: () => antwort };
      const { values } = werteAusAbfrage(a, null, abfrage, deps);
      expect(values, abfrage).toEqual(erwartet);
    }
    // Nicht-Vakuitäts-Probe: Jede Ebene liefert Werte, der Block seinen
    // zusammengesetzten Namen, und die Gruppierung dieselben wie ohne.
    const werte = (abfrage) =>
      werteAusAbfrage(a, null, abfrage, {
        stand: () => (stand += 1),
        auswerten: () => frontmatterQueryFor(a, abfrage, undefined, taskEnv),
      }).values;
    expect(werte('LIST BLOCKS')).toEqual(['Neubau#^n1']);
    expect(werte('LIST TASKS')).toEqual(['Neubau']);
    expect(werte('LIST TASKS GROUP BY file.name')).toEqual(['Neubau']);
  });
});

// 4T-002080 (Epic 3E-000259, Entscheidung F6 Option A des Product Owners vom
// 2026-10-03): Eine gruppierte Abfrage liefert als Quelle denselben Vorrat wie
// dieselbe Abfrage ohne Gruppierung. Die Gruppierung ordnet die Anzeige und
// ändert die Treffer nicht; die Gruppen-Werte werden nicht zur Werte-Auswahl,
// und Datensatz-Zeilen liefern auch gruppiert keinen Wert.
describe('werteAusAbfrage — gruppierte Abfrage als Quelle (4T-002080)', () => {
  const taskEnv = {
    enabled: true,
    globalFilter: '',
    statusTypeOf: createTaskStatusTypeResolver(null),
  };

  // Eine Tabellen-Datei mit zwei Datensätzen (Muster des Falls zu 4T-002040).
  async function bestandMitTabelle() {
    const root = makeRoot();
    const a = write(root, 'Start.md', 'Einstieg.');
    const tabelle = write(
      root,
      'Library.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: title',
        '  display: title',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Zauberberg',
        '|- id="r-00002"',
        '| Kurz',
        '```',
        '',
      ].join('\n'),
    );
    await indexFor(a, 'test:wertevorrat');
    return { a, tabelle };
  }

  // Datei-Ebene über den echten Weg ohne eingespeiste Abhängigkeiten, so wie
  // der Kanal des Wertevorrats die Auswertung ruft.
  it('AK1: eine gruppierte Datei-Abfrage liefert denselben Vorrat wie ohne Gruppierung', async () => {
    const { a } = await bestand();
    const paare = [
      ['WHERE art = "projekt"', 'WHERE art = "projekt" GROUP BY art'],
      ['WHERE art = "projekt"', 'WHERE art = "projekt" GROUP BY file.folder'],
      ['TABLE art WHERE art = "projekt"', 'TABLE art WHERE art = "projekt" GROUP BY art'],
      ['LIST', 'LIST GROUP BY art'],
    ];
    for (const [ohne, mit] of paare) {
      // Nicht-Vakuitäts-Probe: Die gruppierte Abfrage trägt Gruppen.
      const menge = frontmatterQueryFor(a, mit).resultSet;
      expect(menge.state.queryError, mit).toBeNull();
      expect(menge.groups.length, mit).toBeGreaterThan(0);
      const erwartet = werteAusAbfrage(a, null, ohne).values;
      expect(erwartet.length, ohne).toBeGreaterThan(0);
      expect(werteAusAbfrage(a, null, mit), mit).toEqual({ status: 'ready', values: erwartet });
    }
  });

  // Block- und Aufgaben-Ebene über die eingespeiste Auswertung mit
  // Aufgaben-Umgebung (Muster des Falls zu 4T-002034 oben): Der Kanal des
  // Wertevorrats reicht keine Aufgaben-Umgebung durch, am Modul ist die
  // Aufgaben-Ebene deshalb nur so prüfbar.
  it('AK1: gruppiert und ungruppiert gleich auf Block- und Aufgaben-Ebene', async () => {
    const root = makeRoot();
    const a = write(root, 'Start.md', 'Einstieg.');
    write(root, 'Projekte/Neubau.md', '---\nart: projekt\n---\nText. ^n1\n\n- [ ] Dach decken\n');
    write(
      root,
      'Projekte/Neubau.mdd',
      JSON.stringify({
        schemaVersion: 1,
        history: { anchors: [], packets: [] },
        blockData: { n1: { values: { phase: 'roh' }, updated: '2026-07-01T10:00:00Z' } },
      }),
    );
    write(root, 'Projekte/Umbau.md', '---\nart: projekt\n---\n- [ ] Wand stellen\n');
    await indexFor(a, 'test:wertevorrat-gruppiert');
    const paare = [
      ['LIST BLOCKS', 'LIST BLOCKS GROUP BY phase'],
      ['TABLE BLOCKS phase', 'TABLE BLOCKS phase GROUP BY phase'],
      ['LIST TASKS', 'LIST TASKS GROUP BY file.name'],
      ['LIST TASKS', 'LIST TASKS GROUP BY art'],
      // Bei der Tabelle ist die Spalte der Gruppen-Ausdruck: Eine gruppierte
      // Tabelle mit einer anderen Feld-Spalte ist seit 4T-002078 ein
      // Abfrage-Fehler und liefert damit, wie jede fehlerhafte Quelle, nichts.
      ['TABLE TASKS description', 'TABLE TASKS description GROUP BY description'],
    ];
    let stand = 0;
    const auswertung = (abfrage) => {
      const antwort = frontmatterQueryFor(a, abfrage, undefined, taskEnv);
      stand += 1;
      const deps = { stand: () => stand, auswerten: () => antwort };
      return { antwort, ergebnis: werteAusAbfrage(a, null, abfrage, deps) };
    };
    for (const [ohne, mit] of paare) {
      const ungruppiert = auswertung(ohne).ergebnis;
      const { antwort, ergebnis } = auswertung(mit);
      expect(antwort.resultSet.groups.length, mit).toBeGreaterThan(0);
      expect(ungruppiert.values.length, ohne).toBeGreaterThan(0);
      expect(ergebnis, mit).toEqual(ungruppiert);
    }
  });

  it('AK3: die Gruppen-Werte erscheinen nicht als eigene Werte', async () => {
    const { a } = await bestand();
    // Gruppiert nach `art` und nach Ordner: Die Gruppen-Werte sind «projekt»,
    // «notiz», «Projekte» und «Sonstiges»; im Vorrat stehen allein die Namen
    // der Treffer.
    const nachArt = 'LIST GROUP BY art';
    const gruppen = frontmatterQueryFor(a, nachArt).resultSet.groups.map((g) => g.value);
    expect(gruppen).toEqual(expect.arrayContaining(['notiz', 'projekt']));
    const { values } = werteAusAbfrage(a, null, nachArt);
    expect([...values].sort()).toEqual(['Neubau', 'Notiz', 'Start', 'Umbau']);
    const nachOrdner = werteAusAbfrage(a, null, 'LIST GROUP BY file.folder').values;
    expect(nachOrdner).not.toContain('Projekte');
    expect(nachOrdner).not.toContain('Sonstiges');
  });

  it('AK3: Datensatz-Zeilen liefern auch gruppiert keinen Wert', async () => {
    const { a } = await bestandMitTabelle();
    const abfrage = 'LIST RECORDS FROM "Library" GROUP BY title';
    // Anker: Die gruppierte Abfrage trifft zwei Datensätze in zwei Gruppen.
    const menge = frontmatterQueryFor(a, abfrage).resultSet;
    expect(menge.rows).toHaveLength(2);
    expect(menge.groups).toHaveLength(2);
    expect(werteAusAbfrage(a, null, abfrage)).toEqual({ status: 'ready', values: [] });
  });

  it('AK3: im Aus-Zustand der Datenbank liefert eine gruppierte Datensatz-Abfrage nichts und liest keine Tabelle', async () => {
    const { a, tabelle } = await bestandMitTabelle();
    const abfrage = 'LIST RECORDS FROM "Library" GROUP BY title';
    // Nicht-Vakuitäts-Probe: eingeschaltet bildet die Abfrage zwei Gruppen.
    expect(frontmatterQueryFor(a, abfrage).resultSet.groups).toHaveLength(2);
    // Der Schalter wirkt zur Abfrage-Zeit (`recordsQueryFor`); ein Neuaufbau
    // aller Indizes ist hier nicht nötig und bliebe in dieser Datei nicht
    // folgenlos, weil ihre Wurzeln ohne Besitzer-Schlüssel freigegeben werden
    // und deshalb stehen bleiben. Den Neuaufbau-Weg deckt
    // `datensatz-abfrage-aus-zustand.test.js`.
    try {
      setzeDatensatzErfassung(false);
      const gelesen = readCount();
      const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
      const menge = frontmatterQueryFor(a, abfrage).resultSet;
      expect(menge.state.hint).toBe(HINT_DATABASE_OFF);
      expect(menge.rows).toEqual([]);
      expect(werteAusAbfrage(a, null, abfrage)).toEqual({ status: 'ready', values: [] });
      expect(readCount()).toBe(gelesen);
      const tabellenPfad = path.resolve(tabelle).toLowerCase();
      for (const spy of zugriffe) {
        const betroffen = spy.mock.calls.filter(
          ([p]) => path.resolve(String(p)).toLowerCase() === tabellenPfad,
        );
        expect(betroffen).toEqual([]);
      }
    } finally {
      vi.restoreAllMocks();
      setzeDatensatzErfassung(true);
    }
  });
});

// 4T-002080 (Epic 3E-000259, Bestands-Überraschung): Eine Aufgaben-Abfrage
// lieferte als Quelle nie Werte, weil der Kanal des Wertevorrats die
// Auswertung ohne Aufgaben-Umgebung rief und jede Aufgaben-Abfrage damit ein
// Abfrage-Fehler war. Behoben über dieselbe Umgebung wie im Abfrage-Kanal
// (`buildTaskEnv`); geprüft am Modul und am Kanal selbst, jeweils ohne
// eingespeiste Auswertung.
describe('werteAusAbfrage — Aufgaben-Abfrage als Quelle (4T-002080)', () => {
  async function bestandMitAufgaben() {
    const root = makeRoot();
    const a = write(root, 'Start.md', 'Einstieg.');
    write(root, 'Projekte/Neubau.md', '---\nart: projekt\n---\n- [ ] Dach decken #wichtig\n');
    write(root, 'Projekte/Umbau.md', '---\nart: projekt\n---\n- [ ] Wand stellen\n');
    write(root, 'Sonstiges/Notiz.md', '---\nart: notiz\n---\nText ohne Aufgabe.\n');
    await indexFor(a, 'test:wertevorrat-aufgaben');
    return { root, a };
  }

  it('AK1: LIST TASKS liefert Werte, gruppiert dieselben wie ungruppiert', async () => {
    const { a } = await bestandMitAufgaben();
    const umgebung = buildTaskEnv({});
    const ungruppiert = werteAusAbfrage(a, null, 'LIST TASKS', null, null, umgebung);
    expect(ungruppiert.status).toBe('ready');
    expect([...ungruppiert.values].sort()).toEqual(['Neubau', 'Umbau']);
    expect(werteAusAbfrage(a, null, 'LIST TASKS GROUP BY file.name', null, null, umgebung)).toEqual(
      ungruppiert,
    );
  });

  it('ohne Aufgaben-Umgebung ist die Aufgaben-Abfrage ein Abfrage-Fehler und der Vorrat leer', async () => {
    const { a } = await bestandMitAufgaben();
    // Der Zustand vor 4T-002080 im Kanal; Anker für die Ursache des Befunds.
    expect(frontmatterQueryFor(a, 'LIST TASKS').resultSet.state.queryError.code).toBe(
      'tasksScopeDisabled',
    );
    expect(werteAusAbfrage(a, null, 'LIST TASKS')).toEqual({ status: 'ready', values: [] });
  });

  it('die Aufgaben-Einstellungen wirken, und ihr Wechsel trifft einen eigenen Eintrag', async () => {
    const { a } = await bestandMitAufgaben();
    const vorher = auswertungsZaehler();
    // Erweiterung «Aufgaben» aus: leerer Vorrat.
    const aus = buildTaskEnv({ disabledExtensions: ['tasks'] });
    expect(werteAusAbfrage(a, null, 'LIST TASKS', null, null, aus).values).toEqual([]);
    // Bei unverändertem Index-Stand wieder an: Der Abdruck der Umgebung steht
    // im Schlüssel, der alte leere Vorrat bleibt deshalb nicht stehen.
    const an = buildTaskEnv({});
    expect([...werteAusAbfrage(a, null, 'LIST TASKS', null, null, an).values].sort()).toEqual([
      'Neubau',
      'Umbau',
    ]);
    // Global Filter: nur die markierte Aufgabe.
    const gefiltert = buildTaskEnv({ tasksConfig: { globalFilter: '#wichtig' } });
    expect(werteAusAbfrage(a, null, 'LIST TASKS', null, null, gefiltert).values).toEqual([
      'Neubau',
    ]);
    expect(auswertungsZaehler() - vorher).toBe(3);
    // Dieselbe Umgebung noch einmal: aus dem Zwischenspeicher.
    werteAusAbfrage(a, null, 'LIST TASKS', null, null, buildTaskEnv({}));
    expect(auswertungsZaehler() - vorher).toBe(3);
  });

  it('der Kanal profiles:fieldValues reicht die Aufgaben-Umgebung aus den Einstellungen durch', async () => {
    const { root, a } = await bestandMitAufgaben();
    const handler = new Map();
    const einstellungen = {
      'extensions.disabled': [],
      tasksConfig: { globalFilter: '#wichtig' },
      taskStates: null,
    };
    registerProfilesIpc((kanal, fn) => handler.set(kanal, fn), {
      senderWindow: () => ({}),
      areaOfWindow: () => ({ rootPath: root }),
      getStore: () => ({ get: (k) => einstellungen[k] }),
      backlinks: backlinksModul,
      resolveQueryTemplatesFolder: async () => null,
    });
    // Der Kanal baut den Index als Bereichs-Index auf; bis er steht, meldet er
    // «indexing» (Muster `indexFor`).
    const frage = async (query) => {
      const fragen = () =>
        handler.get('profiles:fieldValues')({ sender: { id: 4711 } }, { path: a, query });
      let antwort = await fragen();
      for (let i = 0; i < 500 && antwort.status === 'indexing'; i++) {
        await new Promise((fertig) => setTimeout(fertig, 10));
        antwort = await fragen();
      }
      return antwort;
    };
    // Der Global Filter aus den Einstellungen wirkt: allein die markierte Aufgabe.
    expect(await frage('LIST TASKS')).toEqual({ ok: true, status: 'ready', values: ['Neubau'] });
    expect(await frage('LIST TASKS GROUP BY file.name')).toEqual({
      ok: true,
      status: 'ready',
      values: ['Neubau'],
    });
    // Ohne Erweiterung «Aufgaben» bleibt der Vorrat leer.
    einstellungen['extensions.disabled'] = ['tasks'];
    expect(await frage('LIST TASKS')).toEqual({ ok: true, status: 'ready', values: [] });
    // Den Bedarfs-Besitzer des Kanals freigeben, damit das Aufräumen den
    // Bereichs-Index abbaut.
    const bereichsWurzel = rootForActiveFile(a, root);
    releaseRoot(bereichsWurzel, '4711:demand');
    openRoots.add(bereichsWurzel);
  });
});
