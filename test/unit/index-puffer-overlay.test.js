// 4T-0935 (Befund B-08): Puffer-Overlay des Index — die Schicht, mit der die
// gerenderte Ansicht den GESCHRIEBENEN Stand einer offenen Datei sieht, ohne
// dass gespeichert wurde.
//
// Geprueft wird die Schicht selbst gegen den echten Index (Temp-Verzeichnis,
// Setup-Muster aus perspective-query-index.test.js): Vorrang vor der Platte,
// Ruecknahme, Wirkung auf die drei freigeschalteten Verbraucher und — als
// Gegenstueck — die unveraenderte Platten-Sicht der uebrigen Verbraucher.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  backlinksFor,
  bufferTextFor,
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

// 4T-1203: Die Plattform-Eigenschaft wird ueber DIESELBE Modul-Instanz
// gesetzt, die overlay.js benutzt (Muster area-search.test.js).
const { setPlatformForTests } = createRequire(import.meta.url)('../../src/shared/platform.js');

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

function namen(res) {
  return res.files.map((f) => f.name).sort();
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
    expect(vorher.files.length).toBe(1);

    setBufferOverlay(
      path.join(root, 'Liste.md'),
      '# Liste\n\n- [ ] Erste Aufgabe\n- [ ] Zweite Aufgabe\n',
    );
    const nachher = frontmatterQueryFor(start, 'LIST TASKS', null, taskEnv);
    expect(nachher.files.length).toBe(2);

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

  // 4T-0950 (Befund E-03): Das Tag-Panel war bis zur Erhebung 4T-0936 NICHT
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

  // 4T-0951 (Befund E-06): dieselbe Freischaltung für den Erinnerungs-Prüfer.
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

  // 4T-0948 (Befund E-01): Die Wiki-Einbettung braucht den Roh-Text und nicht
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

  // 4T-1203 (Epic 3E-0121): Paar-Test der Zweitsuche über die zentrale
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

  // Die Trennlinie besteht weiter, sie verläuft nur woanders: Verbraucher,
  // die den Product Owner erst nach dem Hauptrelease 1 beschäftigen, lesen
  // unverändert den Platten-Stand.
  it('laesst die noch nicht freigeschalteten Verbraucher am Platten-Stand', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n\n[[Ziel]]\n');
    write(root, 'Ziel.md', '# Ziel\n');
    await indexFor(start);

    setBufferOverlay(path.join(root, 'Start.md'), '# Start\n');

    // Rückverweise (Befund E-04, verortet nach dem Release): Der im Puffer
    // entfernte Verweis steht weiterhin.
    const rueck = backlinksFor(path.join(root, 'Ziel.md'), null);
    expect(JSON.stringify(rueck)).toContain('Start.md');
  });
});
