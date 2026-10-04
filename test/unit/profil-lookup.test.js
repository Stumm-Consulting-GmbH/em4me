// 4T-001184 (Epic 3E-000221, E1): Unit-Tests des Lookup-Feldes — die Dokumente,
// die über ein benanntes Feld auf das eigene verweisen.
//
// Zwei Schwerpunkte. Erstens die **Begrenzung**, aus demselben Grund wie beim
// Wertevorrat (4T-001158): Ein zu früh oder zu oft ausgewertetes Feld fällt in
// keinem Test auf, der mit zehn Dokumenten läuft, und schlägt im echten Bestand
// sofort durch. Gezählt werden deshalb die Auswertungen, nicht die Laufzeit.
//
// Zweitens die **Vergleichs-Regel**, weil sie der Grund ist, warum dieses Modul
// überhaupt existiert: Ein Verweis steht im Metadaten-Block in Wiki-Schreibweise,
// und der Vergleich der Abfrage-Sprache trifft diese Form nicht. Die drei
// Schreibweisen eines Verweises müssen deshalb hier zusammenfinden.
//
// Setup-/Teardown-Muster wie profil-wertevorrat.test.js: echter Index über ein
// Temp-Verzeichnis, Soft-Timer per Fake-Timer feuern.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  frontmatterQueryFor,
  lookupTreffer,
  lookupAuswertungsZaehler,
  lookupZwischenspeicherLeeren,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { zielSchluessel } from '../../src/main/index/profil-lookup.js';
import { isFilesystemCaseInsensitive } from '../../src/shared/platform.js';
// 4T-002034 (Epic 3E-000260): Das Lookup-Feld liest die Ergebnismenge der
// Antwort; eingespeiste Antworten tragen deshalb eine Menge statt der
// bisherigen Treffer-Liste `files`.
import {
  fileOrigin,
  makeResultSet,
  makeRow,
  makeState,
} from '../../src/shared/query/result-set.js';
import { displayName } from '../../src/shared/query/result-display.js';
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins.js';
// 4T-002080: Aus-Zustand der Datenbank für die gruppierte Datensatz-Abfrage
// (Muster `datensatz-abfrage-aus-zustand.test.js`).
import { HINT_DATABASE_OFF } from '../../src/main/index/query-records.js';
// 4T-002080: Aufgaben-Umgebung und der Kanal des Lookup-Felds.
import { buildTaskEnv } from '../../src/main/index/task-env.js';
import { registerProfilesIpc } from '../../src/main/ipc/profiles.js';
import * as backlinksModul from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { readCount } = require_('../../src/main/index/record-table-read.js');

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-lu-'));
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
  lookupZwischenspeicherLeeren();
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

// Ein Bestand, der die drei Schreibweisen eines Verweises, den Alias-Fall, den
// Mehrfach-Verweis, einen Fremd-Verweis und einen Treffer außerhalb der
// Eingrenzung nebeneinanderstellt.
async function bestand() {
  const root = makeRoot();
  const ziel = write(root, 'Start.md', '---\naliases:\n  - Auftakt\n---\nEinstieg.');
  write(root, 'Artikel/Eckig.md', '---\nprojekt: "[[Start]]"\n---\nText.');
  write(root, 'Artikel/MitLabel.md', '---\nprojekt: "[[Start|Anfang]]"\n---\nText.');
  write(root, 'Artikel/Blank.md', '---\nprojekt: Start\n---\nText.');
  write(root, 'Artikel/UeberAlias.md', '---\nprojekt: "[[Auftakt]]"\n---\nText.');
  write(
    root,
    'Artikel/Mehrfach.md',
    '---\nprojekt:\n  - "[[Anderes]]"\n  - "[[Start]]"\n---\nText.',
  );
  write(root, 'Artikel/Fremd.md', '---\nprojekt: "[[Anderes]]"\n---\nText.');
  write(root, 'Artikel/OhneFeld.md', '---\nart: notiz\n---\nText.');
  write(root, 'Sonstiges/Draussen.md', '---\nprojekt: "[[Start]]"\n---\nText.');
  await indexFor(ziel, 'test:lookup');
  return { root, ziel };
}

const opt = (o) => ({ from: 'FROM "Artikel"', relatedField: 'projekt', ...o });

// Eine Tabellen-Datei mit zwei Datensätzen, die selbst über `projekt` auf das
// Ziel verweist (4T-002040; seit 4T-002080 auch für die gruppierten Fälle).
async function bestandMitTabelle() {
  const root = makeRoot();
  const ziel = write(root, 'Start.md', 'Einstieg.');
  const tabelle = write(
    root,
    'Library.md',
    [
      '---',
      'projekt: "[[Start]]"',
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
  await indexFor(ziel, 'test:lookup');
  return { ziel, tabelle };
}

describe('lookupTreffer — Sammeln der verweisenden Dokumente (4T-001184)', () => {
  it('AK1: sammelt die Dokumente, die über das benannte Feld verweisen', async () => {
    const { ziel } = await bestand();
    const { status, values } = lookupTreffer(ziel, null, opt());
    expect(status).toBe('ready');
    expect([...values].sort()).toEqual(['Blank', 'Eckig', 'Mehrfach', 'MitLabel', 'UeberAlias']);
  });

  it('AK1: ein Dokument mit anderem Verweis-Ziel ist kein Treffer', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt());
    expect(values).not.toContain('Fremd');
  });

  it('AK1: ein Dokument ohne das benannte Feld ist kein Treffer', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt());
    expect(values).not.toContain('OhneFeld');
  });

  it('AK2: `from` grenzt die befragte Menge ein', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt());
    expect(values).not.toContain('Draussen');
  });

  it('AK2: ohne `from` gilt der ganze Bereich', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, { relatedField: 'projekt' });
    expect(values).toContain('Draussen');
    expect(values).toContain('Eckig');
  });

  it('ein anderes Feld liefert andere Treffer', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt({ relatedField: 'art' }));
    expect(values).toEqual([]);
  });

  it('der Feldname ist case-insensitiv', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt({ relatedField: 'Projekt' }));
    expect(values).toContain('Eckig');
  });

  it('das eigene Dokument ist nie sein eigener Treffer', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Start.md', '---\nprojekt: "[[Start]]"\n---\nText.');
    write(root, 'Artikel/A.md', '---\nprojekt: "[[Start]]"\n---\nText.');
    await indexFor(ziel, 'test:lookup');
    const { values } = lookupTreffer(ziel, null, { relatedField: 'projekt' });
    expect(values).toEqual(['A']);
  });

  // 4T-002040 (Epic 3E-000258, Festlegung 16): Eine Datensatz-Abfrage als Quelle
  // liefert keine Werte. Die Tabellen-Datei verweist selbst über das Feld auf das
  // Ziel; ohne die Regel zählte jeder ihrer Datensätze als Treffer, weil seine
  // Herkunft den Pfad der Tabellen-Datei trägt. Anker: Die Abfrage trifft zwei.
  it('Datensatz-Zeilen liefern keinen Wert, auch wenn die Tabellen-Datei verweist', async () => {
    const { ziel } = await bestandMitTabelle();
    const from = 'LIST RECORDS FROM "Library"';
    expect(frontmatterQueryFor(ziel, from).resultSet.rows).toHaveLength(2);
    expect(lookupTreffer(ziel, null, { from, relatedField: 'projekt' })).toEqual({
      status: 'ready',
      values: [],
    });
  });
});

describe('Vergleichs-Regel der Verweis-Werte (4T-001184)', () => {
  // Die Regel als reine Funktion, unabhängig vom Index — sie ist der Grund für
  // dieses Modul und soll ohne Temp-Verzeichnis nachlesbar sein.
  it('die drei Schreibweisen eines Verweises meinen dasselbe Ziel', () => {
    expect(zielSchluessel('[[Halle 3]]')).toEqual(['halle 3']);
    expect(zielSchluessel('[[Halle 3|Kurzform]]')).toEqual(['halle 3']);
    expect(zielSchluessel('Halle 3')).toEqual(['halle 3']);
  });

  it('mehrere Verweise in einem Wert zählen alle', () => {
    expect(zielSchluessel('[[A]] und [[B]]')).toEqual(['a', 'b']);
  });

  it('Groß-/Kleinschreibung und Randleerraum spielen keine Rolle', () => {
    expect(zielSchluessel('  [[HALLE 3]]  ')).toEqual(['halle 3']);
  });

  it('nicht auswertbare Werte ergeben keinen Schlüssel', () => {
    expect(zielSchluessel('')).toEqual([]);
    expect(zielSchluessel('   ')).toEqual([]);
    expect(zielSchluessel(42)).toEqual([]);
    expect(zielSchluessel(null)).toEqual([]);
    // Eine angefangene Klammer ist kein blanker Name: sonst würde aus einem
    // kaputten Wert ein Treffer auf ein Ziel, das niemand gemeint hat.
    expect(zielSchluessel('[[unvollstaendig')).toEqual([]);
  });
});

describe('Begrenzung der Auswertung (4T-001184)', () => {
  it('AK3: die Profil-Auflösung allein wertet nichts aus', async () => {
    const vorher = lookupAuswertungsZaehler();
    await bestand();
    // Kein Aufruf von lookupTreffer: der Index-Aufbau allein rechnet nichts.
    expect(lookupAuswertungsZaehler()).toBe(vorher);
  });

  it('AK4: drei Anfragen bei unverändertem Index lösen eine Auswertung aus', async () => {
    const { ziel } = await bestand();
    const vorher = lookupAuswertungsZaehler();
    lookupTreffer(ziel, null, opt());
    lookupTreffer(ziel, null, opt());
    lookupTreffer(ziel, null, opt());
    expect(lookupAuswertungsZaehler() - vorher).toBe(1);
  });

  it('AK4: verschiedene Felder sind verschiedene Einträge', async () => {
    const { ziel } = await bestand();
    const vorher = lookupAuswertungsZaehler();
    lookupTreffer(ziel, null, opt());
    lookupTreffer(ziel, null, opt({ relatedField: 'art' }));
    expect(lookupAuswertungsZaehler() - vorher).toBe(2);
  });

  it('AK4: dasselbe Feld an verschiedenen Dokumenten sind verschiedene Einträge', async () => {
    // Der Unterschied zum Wertevorrat: Ein Lookup-Ergebnis gilt je Dokument.
    const { root, ziel } = await bestand();
    const zweites = path.join(root, 'Artikel', 'Eckig.md');
    const vorher = lookupAuswertungsZaehler();
    lookupTreffer(ziel, null, opt());
    lookupTreffer(zweites, null, opt());
    expect(lookupAuswertungsZaehler() - vorher).toBe(2);
  });

  it('ein Feld ohne relatedField wird gar nicht erst ausgewertet', async () => {
    const { ziel } = await bestand();
    const vorher = lookupAuswertungsZaehler();
    expect(lookupTreffer(ziel, null, { from: 'FROM "Artikel"' }).status).toBe('unavailable');
    expect(lookupTreffer(ziel, null, {}).status).toBe('unavailable');
    expect(lookupTreffer(ziel, null, null).status).toBe('unavailable');
    expect(lookupAuswertungsZaehler()).toBe(vorher);
  });
});

describe('Weiche Fehler-Fälle (4T-001184)', () => {
  it('AK6: eine fehlerhafte Quelle ergibt ein leeres Ergebnis, keinen Wurf', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt({ from: 'FROM ((( kaputt' }));
    expect(values).toEqual([]);
  });

  it('AK6: eine Quelle ohne Treffer ist derselbe Fall und kein Fehler', async () => {
    const { ziel } = await bestand();
    const { status, values } = lookupTreffer(ziel, null, opt({ from: 'FROM "GibtsNicht"' }));
    expect(status).toBe('ready');
    expect(values).toEqual([]);
  });

  it('AK6: ohne erreichbaren Index meldet die Sicht unavailable', () => {
    expect(lookupTreffer(null, null, opt()).status).toBe('unavailable');
    const fremd = path.join(os.tmpdir(), 'nie-indexiert', 'x.md');
    expect(lookupTreffer(fremd, null, opt()).status).toBe('unavailable');
  });

  it('AK6: keine Eingabe wirft je eine Ausnahme', async () => {
    const { ziel } = await bestand();
    expect(() => lookupTreffer(ziel, null, opt({ relatedField: '   ' }))).not.toThrow();
    expect(() => lookupTreffer(ziel, null, opt({ from: '' }))).not.toThrow();
    expect(() => lookupTreffer(undefined, undefined, undefined)).not.toThrow();
  });
});

// Die Invalidierungs-Regel mit eingespeisten Abhängigkeiten. Sie ist die
// tragende Zusage dieses Tasks und lässt sich am echten Index NICHT prüfen:
// Der Watcher meldet im Unit-Umfeld keine zweite Index-Änderung, der Stand
// bliebe bei 1, und ein Test darüber wäre eine Behauptung statt eines
// Nachweises. Eingespeist werden deshalb `stand` und `auswerten` — dasselbe
// Mittel wie in 4T-001158. Die eingespeisten Treffer tragen ECHTE Pfade des
// Test-Bestands, weil der Verweis-Vergleich die Properties aus dem Index liest.
describe('Invalidierung gegen den Index-Stand (4T-001184)', () => {
  function umgebung(root, pfadeJeLauf) {
    let stand = 1;
    let laeufe = 0;
    return {
      deps: {
        stand: () => stand,
        auswerten: () => {
          const pfade = pfadeJeLauf[Math.min(laeufe, pfadeJeLauf.length - 1)];
          laeufe += 1;
          const rows = pfade.map((rel) =>
            makeRow([], fileOrigin(path.join(root, rel), path.basename(rel, '.md'))),
          );
          return {
            resultSet: makeResultSet({
              scope: 'files',
              type: 'list',
              rows,
              state: makeState('ready'),
            }),
          };
        },
      },
      standBewegen: () => {
        stand += 1;
      },
      laeufe: () => laeufe,
    };
  }

  it('AK4: bei gleichem Stand wird genau einmal ausgewertet', async () => {
    const { root, ziel } = await bestand();
    const u = umgebung(root, [['Artikel/Eckig.md'], ['Artikel/Eckig.md', 'Artikel/Blank.md']]);
    const erst = lookupTreffer(ziel, null, opt(), u.deps);
    const zweit = lookupTreffer(ziel, null, opt(), u.deps);
    expect(erst.values).toEqual(['Eckig']);
    expect(zweit.values).toEqual(['Eckig']); // aus dem Zwischenspeicher
    expect(u.laeufe()).toBe(1);
  });

  it('AK5: bewegt sich der Stand, wertet die nächste Anfrage neu aus', async () => {
    const { root, ziel } = await bestand();
    const u = umgebung(root, [['Artikel/Eckig.md'], ['Artikel/Eckig.md', 'Artikel/Blank.md']]);
    expect(lookupTreffer(ziel, null, opt(), u.deps).values).toEqual(['Eckig']);
    u.standBewegen();
    expect(lookupTreffer(ziel, null, opt(), u.deps).values).toEqual(['Eckig', 'Blank']);
    expect(u.laeufe()).toBe(2);
    // Und danach greift der Zwischenspeicher wieder.
    lookupTreffer(ziel, null, opt(), u.deps);
    expect(u.laeufe()).toBe(2);
  });

  it('AK6: ein unfertiger Index wird nicht zwischengespeichert', async () => {
    const { ziel } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        return { resultSet: makeResultSet({ state: makeState('indexing') }) };
      },
    };
    expect(lookupTreffer(ziel, null, opt(), deps).status).toBe('indexing');
    expect(lookupTreffer(ziel, null, opt(), deps).status).toBe('indexing');
    expect(laeufe).toBe(2);
  });
});

// 4T-002034 (Epic 3E-000260): Das Lookup-Feld liest Pfad und Namen der Treffer
// aus der Ergebnismenge (Herkunft der Zeilen, Anzeige-Name aus dem
// Darstellungs-Kern) statt aus der bisherigen Treffer-Liste `files`, und es
// liefert dieselben Werte (Story AK3). Solange die Antwort beide Formen trug
// (bis 4T-002035), verglich der Fall beide Quellen an derselben echten Antwort.
// Seit 4T-002035 trägt die Antwort allein die Menge; der Fall hält die
// gelesenen Treffer je Abfrage deshalb fest. Sie sind die der bisherigen
// Treffer-Liste, weil der Vergleich bis dahin an genau diesen Antworten grün
// war. Einzige gewollte Änderung seither: Die gruppierte Abfrage liefert seit
// 4T-002080 ihre Treffer wie die ungruppierte (Entscheidung F6 Option A).
describe('Ergebnismenge als Quelle (4T-002034)', () => {
  const taskEnv = {
    enabled: true,
    globalFilter: '',
    statusTypeOf: createTaskStatusTypeResolver(null),
  };

  async function bestandMitEbenen() {
    const root = makeRoot();
    const ziel = write(root, 'Start.md', 'Einstieg.');
    write(
      root,
      'Artikel/Eckig.md',
      '---\nprojekt: "[[Start]]"\n---\nText. ^e1\n\n- [ ] Artikel prüfen\n',
    );
    write(
      root,
      'Artikel/Eckig.mdd',
      JSON.stringify({
        schemaVersion: 1,
        history: { anchors: [], packets: [] },
        blockData: { e1: { values: { phase: 'roh' }, updated: '2026-07-01T10:00:00Z' } },
      }),
    );
    write(root, 'Artikel/Blank.md', '---\nprojekt: Start\n---\nText.');
    write(root, 'Artikel/Fremd.md', '---\nprojekt: "[[Anderes]]"\n---\n- [ ] Fremde Aufgabe\n');
    await indexFor(ziel, 'test:lookup-ebenen');
    return { ziel };
  }

  it('AK3: Pfad und Name je Treffer wie in der bisherigen Treffer-Liste, dieselben Werte', async () => {
    const { ziel } = await bestandMitEbenen();
    // Je Abfrage: gelesene Treffer (Anzeige-Name, wie die bisherige Liste sie
    // trug) und die Werte des Lookup-Felds.
    const erwartet = {
      'FROM "Artikel"': [
        ['Blank', 'Eckig', 'Fremd'],
        ['Blank', 'Eckig'],
      ],
      'TABLE projekt FROM "Artikel"': [
        ['Blank', 'Eckig', 'Fremd'],
        ['Blank', 'Eckig'],
      ],
      'LIST BLOCKS FROM "Artikel"': [['Eckig#^e1'], ['Eckig#^e1']],
      'TABLE BLOCKS phase FROM "Artikel"': [['Eckig#^e1'], ['Eckig#^e1']],
      'LIST TASKS FROM "Artikel"': [['Eckig', 'Fremd'], ['Eckig']],
      'TABLE TASKS description FROM "Artikel"': [['Eckig', 'Fremd'], ['Eckig']],
      // Bei Gruppierung war die flache Treffer-Liste leer; seit 4T-002080
      // liefert die gruppierte Abfrage dieselben Treffer wie die ungruppierte.
      'LIST TASKS FROM "Artikel" GROUP BY file.name': [['Eckig', 'Fremd'], ['Eckig']],
      'FROM ((( kaputt': [[], []],
    };
    let stand = 0;
    for (const [quelle, [gelesen, werte]] of Object.entries(erwartet)) {
      const antwort = frontmatterQueryFor(ziel, quelle, undefined, taskEnv);
      // Pfad und Name je Treffer aus Herkunft und Anzeige-Name der Zeilen, die
      // das Lookup-Feld liest; der Pfad ist der der Datei des Treffers.
      const rs = antwort.resultSet;
      const zeilen = rs.state.queryError ? [] : rs.rows;
      expect(zeilen.map((r) => displayName(r.origin)).sort(), quelle).toEqual(gelesen);
      for (const r of zeilen) {
        const datei = displayName(r.origin).split('#^')[0];
        expect(path.basename(r.origin.path), quelle).toBe(`${datei}.md`);
      }
      stand += 1;
      const deps = { stand: () => stand, auswerten: () => antwort };
      const { values } = lookupTreffer(ziel, null, opt({ from: quelle }), deps);
      expect([...values].sort(), quelle).toEqual(werte);
    }
  });
});

// 4T-002080 (Epic 3E-000259, Entscheidung F6 Option A des Product Owners vom
// 2026-10-03): Eine gruppierte Abfrage grenzt die Kandidaten ein wie dieselbe
// Abfrage ohne Gruppierung. Die Gruppierung ordnet die Anzeige und ändert die
// Treffer nicht; die Gruppen-Werte werden nicht zu Kandidaten, und
// Datensatz-Zeilen liefern auch gruppiert keinen.
describe('Gruppierte Abfrage als Kandidaten-Quelle (4T-002080)', () => {
  const taskEnv = {
    enabled: true,
    globalFilter: '',
    statusTypeOf: createTaskStatusTypeResolver(null),
  };

  // Datei-Ebene über den echten Weg ohne eingespeiste Abhängigkeiten, so wie
  // der Kanal des Lookup-Felds die Auswertung ruft.
  it('AK2: eine gruppierte Datei-Abfrage liefert dieselben Kandidaten wie ohne Gruppierung', async () => {
    const { ziel } = await bestand();
    const paare = [
      ['FROM "Artikel"', 'FROM "Artikel" GROUP BY projekt'],
      ['FROM "Artikel"', 'FROM "Artikel" GROUP BY file.folder'],
      ['TABLE projekt FROM "Artikel"', 'TABLE projekt FROM "Artikel" GROUP BY projekt'],
      ['LIST', 'LIST GROUP BY file.folder'],
    ];
    for (const [ohne, mit] of paare) {
      // Nicht-Vakuitäts-Probe: Die gruppierte Abfrage trägt Gruppen.
      const menge = frontmatterQueryFor(ziel, mit).resultSet;
      expect(menge.state.queryError, mit).toBeNull();
      expect(menge.groups.length, mit).toBeGreaterThan(0);
      const erwartet = lookupTreffer(ziel, null, opt({ from: ohne })).values;
      expect(erwartet.length, ohne).toBeGreaterThan(0);
      expect(lookupTreffer(ziel, null, opt({ from: mit })), mit).toEqual({
        status: 'ready',
        values: erwartet,
      });
    }
  });

  // Block- und Aufgaben-Ebene über die eingespeiste Auswertung mit
  // Aufgaben-Umgebung (Muster des Falls zu 4T-002034 oben): Der Kanal des
  // Lookup-Felds reicht keine Aufgaben-Umgebung durch, am Modul ist die
  // Aufgaben-Ebene deshalb nur so prüfbar.
  it('AK2: gruppiert und ungruppiert gleich auf Block- und Aufgaben-Ebene', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Start.md', 'Einstieg.');
    write(
      root,
      'Artikel/Eckig.md',
      '---\nprojekt: "[[Start]]"\n---\nText. ^e1\n\n- [ ] Artikel prüfen\n',
    );
    write(
      root,
      'Artikel/Eckig.mdd',
      JSON.stringify({
        schemaVersion: 1,
        history: { anchors: [], packets: [] },
        blockData: { e1: { values: { phase: 'roh' }, updated: '2026-07-01T10:00:00Z' } },
      }),
    );
    write(root, 'Artikel/Blank.md', '---\nprojekt: Start\n---\n- [ ] Blank prüfen\n');
    write(root, 'Artikel/Fremd.md', '---\nprojekt: "[[Anderes]]"\n---\n- [ ] Fremde Aufgabe\n');
    await indexFor(ziel, 'test:lookup-gruppiert');
    const paare = [
      ['LIST BLOCKS FROM "Artikel"', 'LIST BLOCKS FROM "Artikel" GROUP BY phase'],
      ['TABLE BLOCKS phase FROM "Artikel"', 'TABLE BLOCKS phase FROM "Artikel" GROUP BY phase'],
      ['LIST TASKS FROM "Artikel"', 'LIST TASKS FROM "Artikel" GROUP BY file.name'],
      ['LIST TASKS FROM "Artikel"', 'LIST TASKS FROM "Artikel" GROUP BY projekt'],
      // Bei der Tabelle ist die Spalte der Gruppen-Ausdruck: Eine gruppierte
      // Tabelle mit einer anderen Feld-Spalte ist seit 4T-002078 ein
      // Abfrage-Fehler und liefert damit, wie jede fehlerhafte Quelle, nichts.
      [
        'TABLE TASKS description FROM "Artikel"',
        'TABLE TASKS description FROM "Artikel" GROUP BY description',
      ],
    ];
    let stand = 0;
    const auswertung = (quelle) => {
      const antwort = frontmatterQueryFor(ziel, quelle, undefined, taskEnv);
      stand += 1;
      const deps = { stand: () => stand, auswerten: () => antwort };
      return { antwort, ergebnis: lookupTreffer(ziel, null, opt({ from: quelle }), deps) };
    };
    for (const [ohne, mit] of paare) {
      const ungruppiert = auswertung(ohne).ergebnis;
      const { antwort, ergebnis } = auswertung(mit);
      expect(antwort.resultSet.groups.length, mit).toBeGreaterThan(0);
      expect(ungruppiert.values.length, ohne).toBeGreaterThan(0);
      expect(ergebnis, mit).toEqual(ungruppiert);
    }
  });

  it('AK3: die Gruppen-Werte werden nicht zu Kandidaten', async () => {
    const { ziel } = await bestand();
    // Gruppiert nach Ordner: Der Gruppen-Wert ist «Artikel», ein Kandidat
    // entsteht allein aus einer Zeile, die auf das eigene Dokument verweist.
    const nachOrdner = 'FROM "Artikel" GROUP BY file.folder';
    expect(frontmatterQueryFor(ziel, nachOrdner).resultSet.groups.map((g) => g.value)).toEqual([
      'Artikel',
    ]);
    expect(lookupTreffer(ziel, null, opt({ from: nachOrdner })).values).not.toContain('Artikel');
    // Gruppiert nach Datei-Name: Fremd und OhneFeld bilden eigene Gruppen,
    // sind aber keine Kandidaten.
    const { values } = lookupTreffer(
      ziel,
      null,
      opt({ from: 'FROM "Artikel" GROUP BY file.name' }),
    );
    expect([...values].sort()).toEqual(['Blank', 'Eckig', 'Mehrfach', 'MitLabel', 'UeberAlias']);
  });

  it('AK3: Datensatz-Zeilen liefern auch gruppiert keinen Kandidaten', async () => {
    const { ziel } = await bestandMitTabelle();
    const from = 'LIST RECORDS FROM "Library" GROUP BY title';
    // Anker: Die gruppierte Abfrage trifft zwei Datensätze in zwei Gruppen.
    const menge = frontmatterQueryFor(ziel, from).resultSet;
    expect(menge.rows).toHaveLength(2);
    expect(menge.groups).toHaveLength(2);
    expect(lookupTreffer(ziel, null, { from, relatedField: 'projekt' })).toEqual({
      status: 'ready',
      values: [],
    });
  });

  it('AK3: im Aus-Zustand der Datenbank liefert eine gruppierte Datensatz-Abfrage nichts und liest keine Tabelle', async () => {
    const { ziel, tabelle } = await bestandMitTabelle();
    const from = 'LIST RECORDS FROM "Library" GROUP BY title';
    // Nicht-Vakuitäts-Probe: eingeschaltet bildet die Abfrage zwei Gruppen.
    expect(frontmatterQueryFor(ziel, from).resultSet.groups).toHaveLength(2);
    // Der Schalter wirkt zur Abfrage-Zeit (`recordsQueryFor`); ein Neuaufbau
    // aller Indizes ist hier nicht nötig und bliebe in dieser Datei nicht
    // folgenlos, weil ihre Wurzeln ohne Besitzer-Schlüssel freigegeben werden
    // und deshalb stehen bleiben.
    // Den Neuaufbau-Weg deckt `datensatz-abfrage-aus-zustand.test.js`.
    try {
      setzeDatensatzErfassung(false);
      const gelesen = readCount();
      const zugriffe = ['readFileSync', 'openSync'].map((name) => vi.spyOn(fs, name));
      const menge = frontmatterQueryFor(ziel, from).resultSet;
      expect(menge.state.hint).toBe(HINT_DATABASE_OFF);
      expect(menge.rows).toEqual([]);
      expect(lookupTreffer(ziel, null, { from, relatedField: 'projekt' })).toEqual({
        status: 'ready',
        values: [],
      });
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
// grenzte die Kandidaten eines Lookup-Felds nie ein, weil der Kanal die
// Auswertung ohne Aufgaben-Umgebung rief und jede Aufgaben-Abfrage damit ein
// Abfrage-Fehler war. Behoben über dieselbe Umgebung wie im Abfrage-Kanal
// (`buildTaskEnv`); geprüft am Modul und am Kanal selbst, jeweils ohne
// eingespeiste Auswertung.
describe('Aufgaben-Abfrage als Kandidaten-Quelle (4T-002080)', () => {
  async function bestandMitAufgaben() {
    const root = makeRoot();
    const ziel = write(root, 'Start.md', 'Einstieg.');
    write(
      root,
      'Artikel/Eckig.md',
      '---\nprojekt: "[[Start]]"\n---\n- [ ] Artikel prüfen #wichtig\n',
    );
    write(root, 'Artikel/Blank.md', '---\nprojekt: Start\n---\n- [ ] Blank prüfen\n');
    write(root, 'Artikel/OhneAufgabe.md', '---\nprojekt: "[[Start]]"\n---\nText.\n');
    write(root, 'Artikel/Fremd.md', '---\nprojekt: "[[Anderes]]"\n---\n- [ ] Fremde Aufgabe\n');
    await indexFor(ziel, 'test:lookup-aufgaben');
    return { root, ziel };
  }

  it('AK2: LIST TASKS grenzt die Kandidaten ein, gruppiert wie ungruppiert', async () => {
    const { ziel } = await bestandMitAufgaben();
    const umgebung = buildTaskEnv({});
    const ungruppiert = lookupTreffer(
      ziel,
      null,
      opt({ from: 'LIST TASKS FROM "Artikel"' }),
      null,
      null,
      umgebung,
    );
    expect(ungruppiert.status).toBe('ready');
    // Kandidaten sind die Dateien mit Aufgaben; OhneAufgabe verweist, trägt
    // aber keine Aufgabe, Fremd trägt eine, verweist aber anderswohin.
    expect([...ungruppiert.values].sort()).toEqual(['Blank', 'Eckig']);
    expect(
      lookupTreffer(
        ziel,
        null,
        opt({ from: 'LIST TASKS FROM "Artikel" GROUP BY file.name' }),
        null,
        null,
        umgebung,
      ),
    ).toEqual(ungruppiert);
  });

  it('ohne Aufgaben-Umgebung ist die Aufgaben-Abfrage ein Abfrage-Fehler und das Feld leer', async () => {
    const { ziel } = await bestandMitAufgaben();
    // Der Zustand vor 4T-002080 im Kanal; Anker für die Ursache des Befunds.
    expect(frontmatterQueryFor(ziel, 'LIST TASKS').resultSet.state.queryError.code).toBe(
      'tasksScopeDisabled',
    );
    // Ein Abfrage-Fehler ergibt beim Lookup-Feld das leere Ergebnis «unavailable».
    expect(lookupTreffer(ziel, null, opt({ from: 'LIST TASKS FROM "Artikel"' }))).toEqual({
      status: 'unavailable',
      values: [],
    });
  });

  it('ein Wechsel der Aufgaben-Einstellungen trifft einen eigenen Eintrag', async () => {
    const { ziel } = await bestandMitAufgaben();
    const quelle = opt({ from: 'LIST TASKS FROM "Artikel"' });
    const aus = buildTaskEnv({ disabledExtensions: ['tasks'] });
    expect(lookupTreffer(ziel, null, quelle, null, null, aus).values).toEqual([]);
    // Bei unverändertem Index-Stand wieder an: Der Abdruck der Umgebung steht
    // im Schlüssel, das alte leere Ergebnis bleibt deshalb nicht stehen.
    const an = buildTaskEnv({});
    expect([...lookupTreffer(ziel, null, quelle, null, null, an).values].sort()).toEqual([
      'Blank',
      'Eckig',
    ]);
    const gefiltert = buildTaskEnv({ tasksConfig: { globalFilter: '#wichtig' } });
    expect(lookupTreffer(ziel, null, quelle, null, null, gefiltert).values).toEqual(['Eckig']);
  });

  it('der Kanal profiles:lookup reicht die Aufgaben-Umgebung aus den Einstellungen durch', async () => {
    const { root, ziel } = await bestandMitAufgaben();
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
    const frage = async (from) => {
      const fragen = () =>
        handler.get('profiles:lookup')(
          { sender: { id: 4712 } },
          { path: ziel, options: { from, relatedField: 'projekt' } },
        );
      let antwort = await fragen();
      for (let i = 0; i < 500 && antwort.status === 'indexing'; i++) {
        await new Promise((fertig) => setTimeout(fertig, 10));
        antwort = await fragen();
      }
      return antwort;
    };
    // Der Global Filter aus den Einstellungen wirkt: allein die markierte Aufgabe.
    expect(await frage('LIST TASKS FROM "Artikel"')).toEqual({
      ok: true,
      status: 'ready',
      values: ['Eckig'],
    });
    expect(await frage('LIST TASKS FROM "Artikel" GROUP BY file.name')).toEqual({
      ok: true,
      status: 'ready',
      values: ['Eckig'],
    });
    // Ohne Erweiterung «Aufgaben» bleibt das Feld leer; der Abfrage-Fehler
    // ergibt beim Lookup-Feld wie bisher «unavailable».
    einstellungen['extensions.disabled'] = ['tasks'];
    expect(await frage('LIST TASKS FROM "Artikel"')).toEqual({
      ok: true,
      status: 'unavailable',
      values: [],
    });
    // Den Bedarfs-Besitzer des Kanals freigeben, damit das Aufräumen den
    // Bereichs-Index abbaut.
    const bereichsWurzel = rootForActiveFile(ziel, root);
    releaseRoot(bereichsWurzel, '4712:demand');
    openRoots.add(bereichsWurzel);
  });
});

// 4T-001275 (Epic 3E-000232, Befund B1): Pfad-Identität des Lookup-Feldes.
//
// `lookupTreffer` faltet den absoluten Pfad an zwei Stellen fest klein, statt
// die zentrale Auskunft in src/shared/platform.js zu fragen: im Schlüssel des
// Zwischenspeichers und im Selbst-Ausschluss («das eigene Dokument ist nie sein
// eigener Treffer»). Auf einem Dateisystem, das die Schreibung unterscheidet,
// sind `Start.md` und `start.md` ZWEI Dokumente — die Faltung wirft sie
// zusammen, und ein echter Treffer verschwindet.
//
// Anders als der Fall in book-core.test.js lässt sich dieser NICHT über die
// injizierte Plattform prüfen: Die Faltung sitzt inline in `lookupTreffer` und
// wirkt auf Pfade echter Dateien, die zuvor über den Index gelaufen sind. Auf
// einem case-insensitiven Dateisystem lassen sich die beiden Dateien nicht
// nebeneinander anlegen, weshalb der Fall dort übersprungen wird — der
// verbindliche Nachweis dieses Epics läuft ohnehin unter Linux
// (`node scripts/test-linux-docker.js`).
describe('Pfad-Identität und Schreibweise (4T-001275)', () => {
  it.skipIf(isFilesystemCaseInsensitive())(
    'schließt nur das eigene Dokument aus, nicht sein schreibweisen-gleiches Geschwister',
    async () => {
      const root = makeRoot();
      const ziel = write(root, 'Start.md', '---\nprojekt: "[[Start]]"\n---\nEinstieg.');
      // Ein ANDERES Dokument auf einem case-sensitiven Dateisystem, das
      // ebenfalls auf `Start` verweist und deshalb ein echter Treffer ist.
      write(root, 'start.md', '---\nprojekt: "[[Start]]"\n---\nZwilling.');
      await indexFor(ziel, 'test:lookup-schreibweise');
      const treffer = lookupTreffer(ziel, undefined, opt({ from: 'FROM ""' }));
      expect(treffer.status).toBe('ready');
      expect(treffer.values).toContain('start');
      expect(treffer.values).not.toContain('Start');
    },
  );
});
