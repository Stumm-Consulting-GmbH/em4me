// 4T-000935 (Befund B-08): Puffer-Overlay des Index — die Schicht, mit der die
// gerenderte Ansicht den GESCHRIEBENEN Stand einer offenen Datei sieht, ohne
// dass gespeichert wurde.
//
// Geprueft wird die Schicht selbst gegen den echten Index (Temp-Verzeichnis,
// Setup-Muster aus perspective-query-index.test.js): Vorrang vor der Platte,
// Ruecknahme, Wirkung auf die freigeschalteten Verbraucher und — als
// Gegenstueck — die unveraenderte Platten-Sicht der uebrigen.
//
// 4T-000952 (Epic 3E-000198): Die Trennlinie ist gewandert. Freigeschaltet sind
// seither auch Rueckverweise, Graphenansicht und die Vervollstaendigung von
// Ankern und Tags (Befunde E-04, E-05 und E-08); am Platten-Stand bleibt, was
// «welche Dateien gibt es» beantwortet — die Ziel-Aufloesung des Linters.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  anchorAutocompleteSuggestions,
  backlinksFor,
  bufferOwnerFor,
  bufferTextFor,
  existingWikiTargets,
  graphFor,
  tagAutocompleteSuggestions,
  clearAllBufferOverlays,
  clearBufferOverlay,
  eventsForQuery,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
  scriptDataFor,
  setBufferOverlay,
  tagsFor,
  areaTaskLines,
} from '../../src/main/backlinks.js';

// 4T-001203: Die Plattform-Eigenschaft wird ueber DIESELBE Modul-Instanz
// gesetzt, die overlay.js benutzt (Muster area-search.test.js).
const require_ = createRequire(import.meta.url);
const { setPlatformForTests } = require_('../../src/shared/platform.js');
// 4T-000952: Der Zwischenspeicher des ueberlagerten Graphen haengt am
// Index-Eintrag. Fuer seinen Nachweis wird derselbe Eintrag gelesen, den die
// Sichten benutzen — ueber dieselbe Modul-Instanz wie oben.
const { indexes } = require_('../../src/main/index/store.js');
const { displayName } = require_('../../src/shared/query/result-display.js');
// 4T-002047: die überlagerte Sicht selbst und die realen Werkzeuge der Teilung,
// mit denen das geteilte Dokument entsteht (Speichern) und gelesen wird (Öffnen).
const { entryWithOverlay, overlaysUnder } = require_('../../src/main/index/overlay.js');
const { planeZerlegung } = require_('../../src/shared/document-split.js');
const { assembleParts } = require_('../../src/shared/document-assembly.js');

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-overlay-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
  }
  return result;
}

afterEach(() => {
  clearAllBufferOverlays();
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

// 4T-002035 (Epic 3E-000260): Die Antwort der Abfrage ist allein die
// Ergebnismenge; die Namen der Treffer kommen aus der Herkunft ihrer Zeilen.
function namen(res) {
  return res.resultSet.rows.map((r) => displayName(r.origin)).sort();
}

describe('Puffer-Overlay: Vorrang und Ruecknahme', () => {
  it('ueberlagert die Platten-Properties und faellt nach dem Loeschen zurueck', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '---\nBereich: Index\n---\n# Start\n');
    write(root, 'Alpha.md', '---\nBereich: Beruf\n---\n# Alpha\n');
    await indexFor(start);

    const query = 'bereich = "Privat"';
    expect(namen(frontmatterQueryFor(start, query, null, null))).toEqual([]);

    // Geschriebener, nicht gespeicherter Stand von Alpha.
    setBufferOverlay(path.join(root, 'Alpha.md'), '---\nBereich: Privat\n---\n# Alpha\n');
    expect(namen(frontmatterQueryFor(start, query, null, null))).toEqual(['Alpha']);

    // Platte ist unberuehrt geblieben.
    expect(fs.readFileSync(path.join(root, 'Alpha.md'), 'utf8')).toContain('Bereich: Beruf');

    clearBufferOverlay(path.join(root, 'Alpha.md'));
    expect(namen(frontmatterQueryFor(start, query, null, null))).toEqual([]);
  });

  it('nimmt eine Datei auf, die im Index noch fehlt, und gibt sie wieder frei', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '---\nBereich: Index\n---\n# Start\n');
    await indexFor(start);

    const query = 'bereich = "Privat"';
    const neu = path.join(root, 'Neu.md');
    setBufferOverlay(neu, '---\nBereich: Privat\n---\n# Neu\n');
    expect(namen(frontmatterQueryFor(start, query, null, null))).toEqual(['Neu']);

    clearBufferOverlay(neu);
    expect(namen(frontmatterQueryFor(start, query, null, null))).toEqual([]);
  });

  it('beruehrt nur die eigene Wurzel und weist Unfug ab', async () => {
    const root = makeRoot();
    const fremd = makeRoot();
    const start = write(root, 'Start.md', '---\nBereich: Index\n---\n# Start\n');
    await indexFor(start);

    setBufferOverlay(path.join(fremd, 'Fremd.md'), '---\nBereich: Privat\n---\n# Fremd\n');
    expect(namen(frontmatterQueryFor(start, 'bereich = "Privat"', null, null))).toEqual([]);

    expect(setBufferOverlay('', 'text')).toBe(false);
    expect(setBufferOverlay(path.join(root, 'X.md'), null)).toBe(false);
    expect(clearBufferOverlay(path.join(root, 'nie-gesetzt.md'))).toBe(false);
  });
});

describe('Puffer-Overlay: Reichweite der Freischaltung', () => {
  it('wirkt auf die Aufgaben-Abfrage und den Skript-Schnappschuss', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Liste.md', '# Liste\n\n- [ ] Erste Aufgabe\n');
    await indexFor(start);

    const taskEnv = { enabled: true, globalFilter: '', globalQuery: '', statusTypeOf: () => null };
    const vorher = frontmatterQueryFor(start, 'LIST TASKS', null, taskEnv);
    expect(vorher.resultSet.rows.length).toBe(1);

    setBufferOverlay(
      path.join(root, 'Liste.md'),
      '# Liste\n\n- [ ] Erste Aufgabe\n- [ ] Zweite Aufgabe\n',
    );
    const nachher = frontmatterQueryFor(start, 'LIST TASKS', null, taskEnv);
    expect(nachher.resultSet.rows.length).toBe(2);

    // Skript-Schnappschuss sieht dieselbe Datei-Menge.
    const daten = scriptDataFor(start, null);
    expect(daten.status).toBe('ready');
    expect(daten.pages.some((p) => p.file.name === 'Liste')).toBe(true);
  });

  it('wirkt auf die Ereignis-Aggregation', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Termin.md', '---\nprofil: Notiz\nevent-date: 2026-01-01\n---\n# Termin\n');
    await indexFor(start);

    const opts = { profileName: 'ereignis', assignField: 'profil' };
    expect(eventsForQuery(start, '', null, opts).events).toEqual([]);

    setBufferOverlay(
      path.join(root, 'Termin.md'),
      '---\nprofil: Ereignis\nevent-date: 2026-01-01\n---\n# Termin\n',
    );
    const events = eventsForQuery(start, '', null, opts).events;
    expect(events.length).toBe(1);
    expect(events[0].fields.date).toBe('2026-01-01');
  });

  // 4T-000950 (Befund E-03): Das Tag-Panel war bis zur Erhebung 4T-000936 NICHT
  // freigeschaltet; seit der Rang-Entscheidung des Product Owners vom
  // 2026-08-10 ist es das. Die Zusicherung hält jetzt die neue Lage.
  it('zeigt dem Tag-Panel den geschriebenen Stand', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Notiz.md', '# Notiz\n\n#platte\n');
    await indexFor(start);

    // Anker: ohne Overlay steht der gespeicherte Tag in der Liste.
    const vorher = (tagsFor(start, null, null).tags || []).map((x) => x.tag);
    expect(vorher).toContain('platte');

    setBufferOverlay(path.join(root, 'Notiz.md'), '# Notiz\n\n#puffer\n');

    const namenListe = (tagsFor(start, null, null).tags || []).map((x) => x.tag);
    expect(namenListe).toContain('puffer');
    // Der ersetzte Tag verschwindet: Das Overlay tritt an die Stelle der
    // Datei, es kommt nicht zu ihr hinzu.
    expect(namenListe).not.toContain('platte');
  });

  it('führt die Datei-Liste eines Tags aus dem geschriebenen Stand', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Notiz.md', '# Notiz\n');
    await indexFor(start);
    expect(tagsFor(start, 'frisch', null).files || []).toHaveLength(0);

    setBufferOverlay(path.join(root, 'Notiz.md'), '# Notiz\n\n#frisch\n');

    const treffer = tagsFor(start, 'frisch', null).files || [];
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toContain('Notiz.md');
  });

  // 4T-000951 (Befund E-06): dieselbe Freischaltung für den Erinnerungs-Prüfer.
  it('zeigt dem Erinnerungs-Prüfer den geschriebenen Stand', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Aufgaben.md', '# Aufgaben\n\n- [ ] Alte Aufgabe\n');
    await indexFor(start);

    // Anker: die gespeicherte Aufgabe kommt an.
    const vorher = areaTaskLines(root) || [];
    expect(vorher.map((z) => z.text).join(' ')).toContain('Alte Aufgabe');

    setBufferOverlay(
      path.join(root, 'Aufgaben.md'),
      '# Aufgaben\n\n- [ ] Frisch getippte Aufgabe\n',
    );

    const nachher = (areaTaskLines(root) || []).map((z) => z.text).join(' ');
    expect(nachher).toContain('Frisch getippte Aufgabe');
    expect(nachher).not.toContain('Alte Aufgabe');
  });

  // 4T-000948 (Befund E-01): Die Wiki-Einbettung braucht den Roh-Text und nicht
  // seinen Parse, weil ihr Anker am Text schneidet. Die Schicht führt ihn
  // seitdem mit. Geprüft wird hier die Auskunft selbst; den Weg des Anwenders
  // geht der E2E-Fall der Erhebung.
  it('gibt den geschriebenen Roh-Text einer offenen Datei heraus', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const quelle = write(root, 'Quelle.md', '# Quelle\n\nAlter Satz\n');
    await indexFor(start);

    expect(bufferTextFor(quelle)).toBe(null);

    setBufferOverlay(quelle, '# Quelle\n\nFrisch getippt\n');
    expect(bufferTextFor(quelle)).toContain('Frisch getippt');
    // Die Platte bleibt unberührt, wie bei jedem anderen Verbraucher auch.
    expect(fs.readFileSync(quelle, 'utf8')).toContain('Alter Satz');

    clearBufferOverlay(quelle);
    expect(bufferTextFor(quelle)).toBe(null);
  });

  // Eine Einbettung darf ihr Ziel anders schreiben als der geöffnete Reiter
  // ('![[quelle]]' gegen 'Quelle.md'); unter Windows ist das dieselbe Datei.
  it.runIf(process.platform === 'win32')(
    'findet das Ziel auch bei abweichender Schreibweise',
    async () => {
      const root = makeRoot();
      const start = write(root, 'Start.md', '# Start\n');
      const quelle = write(root, 'Quelle.md', '# Quelle\n');
      await indexFor(start);

      setBufferOverlay(quelle, '# Quelle\n\nFrisch getippt\n');
      expect(bufferTextFor(path.join(root, 'quelle.md'))).toContain('Frisch getippt');
    },
  );

  // 4T-001203 (Epic 3E-000121): Paar-Test der Zweitsuche über die zentrale
  // Dateisystem-Eigenschaft — macOS verhält sich wie Windows (APFS-Standard
  // case-insensitiv), Linux unterscheidet die Schreibung.
  it('Zweitsuche folgt der Dateisystem-Eigenschaft (darwin ja, linux nein)', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const quelle = write(root, 'Quelle.md', '# Quelle\n');
    await indexFor(start);
    setBufferOverlay(quelle, '# Quelle\n\nFrisch getippt\n');

    try {
      setPlatformForTests('darwin');
      expect(bufferTextFor(path.join(root, 'quelle.md'))).toContain('Frisch getippt');
      setPlatformForTests('linux');
      expect(bufferTextFor(path.join(root, 'quelle.md'))).toBe(null);
    } finally {
      setPlatformForTests(undefined);
    }
  });

  // 4T-001727 (Epic 3E-000305, Befund der Abnahme vom 2026-09-24): Die Schicht
  // weiß, WELCHES Fenster den geltenden Stand gemeldet hat. Eine aus ihm fällige
  // Erinnerung wird dort bearbeitet; auf der Platte steht ihre Zeile so nicht.
  it('merkt sich den Melder des geltenden Stands: der letzte gewinnt, Rücknahme löscht ihn', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const quelle = write(root, 'Quelle.md', '- [ ] Newsletter\n');
    await indexFor(start);
    expect(bufferOwnerFor(quelle)).toBe(null);

    setBufferOverlay(quelle, '- [ ] Newsletter ⏰ 2020-01-01 08:00\n', 7);
    expect(bufferOwnerFor(quelle)).toBe(7);
    setBufferOverlay(quelle, '- [ ] Newsletter ⏰ 2020-01-01 09:00\n', 9);
    expect(bufferOwnerFor(quelle)).toBe(9);
    // Ohne Melder-Angabe (bisherige Aufrufer) ist der Besitzer unbekannt.
    setBufferOverlay(quelle, '- [ ] Newsletter\n');
    expect(bufferOwnerFor(quelle)).toBe(null);

    setBufferOverlay(quelle, '- [ ] Newsletter ⏰ 2020-01-01 08:00\n', 7);
    try {
      setPlatformForTests('win32');
      expect(bufferOwnerFor(path.join(root, 'quelle.md'))).toBe(7);
      setPlatformForTests('linux');
      expect(bufferOwnerFor(path.join(root, 'quelle.md'))).toBe(null);
    } finally {
      setPlatformForTests(undefined);
    }
    clearBufferOverlay(quelle);
    expect(bufferOwnerFor(quelle)).toBe(null);
    expect(bufferOwnerFor('')).toBe(null);
  });

  // 4T-000952 (Befund E-04): Die Rückverweise lesen den geschriebenen Stand.
  // Beide Richtungen in einem Fall, weil sie dieselbe Umstellung prüfen: Ein im
  // Puffer entstandener Verweis erscheint, ein dort entfernter verschwindet.
  it('zeigt den Rückverweisen den geschriebenen Stand', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n\n[[Ziel]]\n');
    write(root, 'Ziel.md', '# Ziel\n');
    write(root, 'Andere.md', '# Andere\n');
    const ziel = path.join(root, 'Ziel.md');
    await indexFor(start);

    // Anker: der gespeicherte Verweis kommt an.
    expect(JSON.stringify(backlinksFor(ziel, null))).toContain('Start.md');

    // Der Verweis wird im Puffer entfernt und zugleich in einer anderen,
    // ebenfalls offenen Datei gesetzt — beides ohne Speichern.
    setBufferOverlay(path.join(root, 'Start.md'), '# Start\n');
    setBufferOverlay(path.join(root, 'Andere.md'), '# Andere\n\n[[Ziel]]\n');

    const nachher = JSON.stringify(backlinksFor(ziel, null));
    expect(nachher).toContain('Andere.md');
    expect(nachher).not.toContain('Start.md');

    // Die Platte bleibt unberührt: nach der Rücknahme gilt wieder ihr Stand.
    clearBufferOverlay(path.join(root, 'Start.md'));
    clearBufferOverlay(path.join(root, 'Andere.md'));
    const zurueck = JSON.stringify(backlinksFor(ziel, null));
    expect(zurueck).toContain('Start.md');
    expect(zurueck).not.toContain('Andere.md');
  });

  // 4T-000952 (Befund E-05): Die Graphenansicht zeigt frisch gesetzte und
  // entfernte Verbindungen. Anders als bei den übrigen Sichten genügt die
  // Overlay-Sicht auf die Index-Maps hier nicht — die Kanten sind eine eigene,
  // gecachte Ableitung (graphUeberlagert in link-graph.js).
  it('zeigt der Graphenansicht frisch gesetzte und entfernte Verbindungen', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n\n[[Ziel]]\n');
    write(root, 'Ziel.md', '# Ziel\n');
    await indexFor(start);
    const kanten = (r) =>
      (r.edges || []).map((k) => path.basename(k.from) + '->' + path.basename(k.to));

    // Anker: die gespeicherte Kante steht im Graphen.
    expect(kanten(graphFor(start, null))).toContain('Start.md->Ziel.md');

    // Verbindung im Puffer umgehängt: Start -> Ziel weg, Ziel -> Start neu.
    setBufferOverlay(start, '# Start\n');
    setBufferOverlay(path.join(root, 'Ziel.md'), '# Ziel\n\n[[Start]]\n');

    const nachher = kanten(graphFor(start, null));
    expect(nachher).toContain('Ziel.md->Start.md');
    expect(nachher).not.toContain('Start.md->Ziel.md');
  });

  // 4T-000952 (Befund E-08), erste Hälfte: eine soeben getippte Überschrift
  // steht als Anker-Vorschlag bereit. Die Kandidaten-Suche läuft dabei weiter
  // über den Eintrag — die Datei gibt es, nur ihre Anker sind neu.
  it('bietet eine soeben getippte Überschrift als Anker an', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const notiz = write(root, 'Notiz.md', '# Notiz\n\n## Alter Abschnitt\n');
    await indexFor(start);

    const vorher = anchorAutocompleteSuggestions(start, 'Notiz', 'heading', null);
    expect(vorher.suggestions).toContain('alter-abschnitt');

    setBufferOverlay(notiz, '# Notiz\n\n## Frisch getippt\n');

    const nachher = anchorAutocompleteSuggestions(start, 'Notiz', 'heading', null);
    expect(nachher.status).toBe('ready');
    expect(nachher.suggestions).toContain('frisch-getippt');
    expect(nachher.suggestions).not.toContain('alter-abschnitt');
  });

  // 4T-000952 (Befund E-08), zweite Hälfte: derselbe Stand für die Tag-
  // Vervollständigung. Das Tag-PANEL sah ihn seit 4T-000950, der Vorschlag
  // beim Tippen nicht — beide lesen jetzt dieselbe Quelle.
  it('schlägt einen soeben getippten Tag vor', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Notiz.md', '# Notiz\n\n#platte\n');
    await indexFor(start);
    const namen = (r) => (r.suggestions || []).map((x) => x.tag);

    expect(namen(tagAutocompleteSuggestions(start, null))).toContain('platte');

    setBufferOverlay(path.join(root, 'Notiz.md'), '# Notiz\n\n#puffer\n');

    const nachher = namen(tagAutocompleteSuggestions(start, null));
    expect(nachher).toContain('puffer');
    expect(nachher).not.toContain('platte');
  });

  // 4T-000952: Laufzeit-Blick, den das Epic für diesen Vorgang verlangt hat.
  // Der überlagerte Graph läuft über alle Dateien der Wurzel und wird bei
  // jeder Overlay-Meldung angefragt, beim Tippen also alle 300 ms. Er darf
  // deshalb nur dann neu entstehen, wenn sich wirklich etwas bewegt hat.
  // Geprüft wird an der Objekt-Identität: derselbe Graph = kein Neuaufbau.
  it('baut den überlagerten Graphen nur bei geänderter Overlay-Lage neu', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n\n[[Ziel]]\n');
    write(root, 'Ziel.md', '# Ziel\n');
    await indexFor(start);
    const eintrag = indexes.get(root);

    // Ohne Overlay entsteht der zweite Graph gar nicht erst.
    graphFor(start, null);
    expect(eintrag.linkGraphUeberlagert).toBe(null);

    setBufferOverlay(start, '# Start\n\n[[Ziel]]\n\n[[Andere]]\n');
    graphFor(start, null);
    const erster = eintrag.linkGraphUeberlagert;
    expect(erster).toBeTruthy();

    // Zweite Anfrage ohne Änderung: derselbe Graph, kein Neuaufbau.
    graphFor(start, null);
    expect(eintrag.linkGraphUeberlagert).toBe(erster);

    // Neue Overlay-Meldung: neuer Graph.
    setBufferOverlay(start, '# Start\n');
    graphFor(start, null);
    expect(eintrag.linkGraphUeberlagert).not.toBe(erster);
  });

  // 4T-000952: Die Trennlinie besteht weiter, sie verläuft nur woanders. Die
  // Ziel-Auflösung des Linters beantwortet «welche Dateien gibt es» — daran
  // ändert ein ungespeicherter Puffer nichts, und ihre Caches hängen am
  // Index-Eintrag.
  it('laesst die Ziel-Aufloesung des Linters am Platten-Stand', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n\n[[Ziel]]\n');
    write(root, 'Ziel.md', '# Ziel\n');
    await indexFor(start);

    // Ein Puffer, der die Zieldatei leert, nimmt ihr nicht die Existenz.
    setBufferOverlay(path.join(root, 'Ziel.md'), '');
    expect(existingWikiTargets(start, ['Ziel'], null).existing).toContain('Ziel');
  });
});

// 4T-002047 (Epic 3E-000345, Nebenbefund aus 4T-002046): Ein Dokument jenseits
// der Teilungs-Schwelle liegt in mehreren Teil-Dateien; geöffnet meldet der
// Editor es zusammengesetzt unter dem Pfad der Kopf-Datei. Die überlagerte
// Sicht führte daneben die Folge-Dateien der Platte und damit jeden Eintrag
// eines Folgeteils doppelt, in allen acht Beständen. Das Dokument entsteht hier
// über den Teiler des Speicherns und der Puffer über das Zusammensetzen wie
// beim Öffnen, also in der realen Form und nicht in einer erfundenen.
describe('Puffer-Overlay: geöffnetes geteiltes Dokument (4T-002047)', () => {
  const ANZAHL = 40;

  function grossesDokument() {
    const zeilen = ['---', 'aliases: [Gross]', 'status: offen', '---', ''];
    for (let i = 1; i <= ANZAHL; i++) {
      zeilen.push(
        `## Abschnitt ${i}`,
        '',
        `- [ ] Aufgabe ${i} #thema${i} [[Ziel${i}]] ^blk${i}`,
        '',
        'x'.repeat(60),
        '',
      );
    }
    return zeilen.join('\n');
  }

  function schreibeGeteilt(root) {
    const plan = planeZerlegung({ text: grossesDokument(), base: 'Gross', schwelle: 1500 });
    expect(plan.geteilt).toBe(true);
    expect(plan.teile.length).toBeGreaterThanOrEqual(3);
    const dateien = plan.teile.map((teil) => write(root, `${teil.basename}.md`, teil.text));
    const dokument = assembleParts(
      plan.teile.map((teil) => ({ index: teil.index, content: teil.text })),
    ).text;
    return { kopf: dateien[0], folgen: dateien.slice(1), dokument };
  }

  const sicht = (root) => entryWithOverlay(indexes.get(root), overlaysUnder(root));
  const summe = (bestand, mass) => [...bestand].reduce((n, [, wert]) => n + mass(wert), 0);
  const dateienMit = (bestand, pruefe) => [...bestand].filter(([, wert]) => pruefe(wert)).length;
  const taskEnv = { enabled: true, globalFilter: '', globalQuery: '', statusTypeOf: () => null };
  const aufgabenZeilen = (start) =>
    frontmatterQueryFor(start, 'LIST TASKS', null, taskEnv).resultSet.rows;

  it('führt jeden Eintrag genau einmal, unter dem Pfad des ersten Teils', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const { kopf, folgen, dokument } = schreibeGeteilt(root);
    await indexFor(start);
    // Vor dem Öffnen: die Platte, jede Aufgabe einmal, verteilt auf die Teile.
    expect(summe(sicht(root).tasksPerFile, (l) => l.length)).toBe(ANZAHL);
    expect(aufgabenZeilen(start)).toHaveLength(ANZAHL);

    setBufferOverlay(kopf, dokument);
    const s = sicht(root);
    // Aufgaben, Treffer, Tags, Anker: je Eintrag genau einer, alle unter dem Kopf.
    expect(summe(s.tasksPerFile, (l) => l.length)).toBe(ANZAHL);
    expect(s.tasksPerFile.get(kopf)).toHaveLength(ANZAHL);
    expect(summe(s.files, (l) => l.length)).toBe(ANZAHL);
    expect(dateienMit(s.tagsPerFile, (l) => l.includes('thema40'))).toBe(1);
    expect(summe(s.tagsPerFile, (l) => l.length)).toBe(ANZAHL);
    // Die Überschrift von Start.md kommt hinzu.
    expect(summe(s.anchorsPerFile, (a) => a.headings.size)).toBe(ANZAHL + 1);
    expect(summe(s.anchorsPerFile, (a) => a.blockIds.size)).toBe(ANZAHL);
    // Eigenschaften und Aliase: Jeder Teil trägt die Zuordnungs-Zeile im
    // Frontmatter; das geöffnete Dokument ist trotzdem genau eine Datei.
    expect(dateienMit(s.propertiesPerFile, (p) => 'doc-part' in p)).toBe(1);
    expect(dateienMit(s.aliasesPerFile, (l) => l.includes('Gross'))).toBe(1);
    // Die Folge-Dateien führen keine Einträge, ihr Schlüssel bleibt stehen.
    for (const folge of folgen) {
      expect(s.files.has(folge), folge).toBe(true);
      expect(s.files.get(folge), folge).toEqual([]);
      expect(s.tasksPerFile.get(folge), folge).toEqual([]);
      expect(s.propertiesPerFile.get(folge), folge).toEqual({});
    }
    expect([...s.files.keys()]).toEqual(expect.arrayContaining(folgen));
    // Bei den Verbrauchern: die Aufgaben-Abfrage und das Tag-Panel.
    expect(aufgabenZeilen(start)).toHaveLength(ANZAHL);
    expect(tagsFor(start, 'thema40', null).files || []).toHaveLength(1);
  });

  it('ein im Puffer gelöschter Eintrag eines Folgeteils ist nicht mehr sichtbar, danach gilt die Platte', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const { kopf, folgen, dokument } = schreibeGeteilt(root);
    await indexFor(start);
    const zeile = '- [ ] Aufgabe 40 #thema40 [[Ziel40]] ^blk40\n';
    expect(dokument).toContain(zeile);
    setBufferOverlay(kopf, dokument.replace(zeile, ''));

    const s = sicht(root);
    expect(summe(s.tasksPerFile, (l) => l.length)).toBe(ANZAHL - 1);
    expect(JSON.stringify([...s.tasksPerFile])).not.toContain('Aufgabe 40 ');
    expect(dateienMit(s.tagsPerFile, (l) => l.includes('thema40'))).toBe(0);
    expect(dateienMit(s.anchorsPerFile, (a) => a.blockIds.has('blk40'))).toBe(0);
    expect(summe(s.files, (l) => l.length)).toBe(ANZAHL - 1);
    expect(aufgabenZeilen(start)).toHaveLength(ANZAHL - 1);
    expect(tagsFor(start, 'thema40', null).files || []).toHaveLength(0);

    // Nach dem Schließen gilt wieder die Platte samt Folge-Dateien.
    clearAllBufferOverlays();
    const platte = sicht(root);
    const letzte = folgen[folgen.length - 1];
    expect(summe(platte.tasksPerFile, (l) => l.length)).toBe(ANZAHL);
    expect(JSON.stringify(platte.tasksPerFile.get(letzte))).toContain('Aufgabe 40 ');
    expect(tagsFor(start, 'thema40', null).files || []).toHaveLength(1);
  });

  it('Gegenprobe: ohne Puffer des Dokuments bleibt die Sicht die der Platte', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    const { folgen } = schreibeGeteilt(root);
    await indexFor(start);
    const eintrag = indexes.get(root);
    // Ganz ohne Puffer ist die Sicht der Eintrag selbst.
    expect(entryWithOverlay(eintrag, overlaysUnder(root))).toBe(eintrag);
    // Der Puffer eines anderen Dokuments verdeckt keine Folge-Datei.
    setBufferOverlay(start, '# Start\n\nungespeichert\n');
    const s = sicht(root);
    expect(summe(s.tasksPerFile, (l) => l.length)).toBe(ANZAHL);
    for (const folge of folgen) {
      expect(s.tasksPerFile.get(folge), folge).toBe(eintrag.tasksPerFile.get(folge));
      expect(s.propertiesPerFile.get(folge), folge).toBe(eintrag.propertiesPerFile.get(folge));
    }
  });

  // Alle acht Bestände an einem Eintrag, dessen Folge-Datei in jedem Bestand
  // etwas führt. Am realen Dokument trägt ein Folgeteil keine Datenbank-Marke
  // und außerhalb einer Tabelle keine Datensätze; die Einbindung beider
  // Bestände wird deshalb hier an der Sicht selbst geprüft.
  it('wendet die Regel auf alle acht Bestände an, mit der leeren Form je Bestand', () => {
    const dir = path.join(os.tmpdir(), 'bereich');
    const kopf = path.join(dir, 'Gross.md');
    const folge = path.join(dir, 'Gross•part-00002.md');
    const fremd = path.join(dir, 'Andere•part-00002.md');
    const anker = (h) => ({ headings: new Set([h]), blockIds: new Set([h]) });
    const bestand = (wert) =>
      new Map([
        [kopf, wert('k')],
        [folge, wert('f')],
        [fremd, wert('a')],
      ]);
    const eintrag = {
      files: bestand((x) => [{ target: x }]),
      propertiesPerFile: bestand((x) => ({ x })),
      tasksPerFile: bestand((x) => [{ text: x }]),
      dbKindsPerFile: bestand(() => ['table']),
      recordsPerFile: bestand((x) => [{ id: x }]),
      tagsPerFile: bestand((x) => [x]),
      aliasesPerFile: bestand((x) => [x]),
      anchorsPerFile: bestand(anker),
    };
    const puffer = {
      hits: [{ target: 'p' }],
      properties: { x: 'p' },
      tasks: [{ text: 'p' }],
      dbKinds: ['table'],
      records: [{ id: 'p' }],
      tags: ['p'],
      aliases: ['p'],
      headings: ['p'],
      blockIds: ['p'],
    };
    const s = entryWithOverlay(eintrag, new Map([[kopf, puffer]]));
    const leer = {
      files: [],
      propertiesPerFile: {},
      tasksPerFile: [],
      dbKindsPerFile: [],
      recordsPerFile: [],
      tagsPerFile: [],
      aliasesPerFile: [],
      anchorsPerFile: { headings: new Set(), blockIds: new Set() },
    };
    for (const [feld, leerWert] of Object.entries(leer)) {
      const sichtFeld = s[feld];
      expect(sichtFeld.get(folge), feld).toEqual(leerWert);
      expect(new Map([...sichtFeld]).get(folge), feld).toEqual(leerWert);
      expect(sichtFeld.has(folge), feld).toBe(true);
      expect(sichtFeld.size, feld).toBe(3);
      expect(sichtFeld.get(fremd), feld).toBe(eintrag[feld].get(fremd));
      expect(sichtFeld.get(kopf), feld).not.toBe(eintrag[feld].get(kopf));
      // Je Zugriff ein neuer leerer Wert: Kein Verbraucher teilt ihn.
      expect(sichtFeld.get(folge), feld).not.toBe(sichtFeld.get(folge));
    }
    // Ein Schlüssel, den der Bestand nicht führt, bleibt abwesend.
    expect(s.tasksPerFile.get(path.join(dir, 'Gross•part-00003.md'))).toBeUndefined();
  });
});
