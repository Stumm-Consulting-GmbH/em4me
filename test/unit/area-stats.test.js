// 4T-000619 (Epic 3E-000117): Unit-Tests der Kennzahlen-Erhebung eines Bereichs
// (statsFor im Index plus ergaenzender Scan in area-stats.js). Alle
// Erwartungswerte sind am angelegten Fixture-Verzeichnis von Hand
// nachgerechnet und stehen als Zahl im Test, nicht als Rechnung.
// Setup-/Teardown-Muster wie graph-index.test.js (Temp-Verzeichnis,
// Soft-Timer per Fake-Timer feuern).
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  clearAllBufferOverlays,
  overlaysUnder,
  releaseRoot,
  rootForActiveFile,
  setBufferOverlay,
  statsFor,
} from '../../src/main/backlinks.js';
import { collectAreaStats, verweisSchalter } from '../../src/main/area/area-stats.js';
import { registerIndexViewsIpc } from '../../src/main/ipc/index-views.js';
import { createTaskStatusTypeResolver } from '../../src/shared/markdown/plugins/tasks.js';
import { readAssembledDocument } from '../../src/main/documents/document-parts-io.js';
import { writePartLine } from '../../src/shared/document-parts.js';
import { emptyContainer, serializeContainer } from '../../src/main/documents/mdd-store.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-'));
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

// Aufloeser der Aufgaben-Zustaende in der Auslieferungs-Belegung: '/' laeuft,
// '-' ist abgebrochen, ' ' und 'x' sind die festen Basis-Zeichen.
function statusTypeOf(ch) {
  if (ch === 'x' || ch === 'X') return 'DONE';
  if (ch === '-') return 'CANCELLED';
  if (ch === '/') return 'IN_PROGRESS';
  if (ch === ' ') return 'TODO';
  return null;
}

// Fixture-Bereich mit bekanntem Bestand:
//   Markdown  4 Dateien (Start, Ziel, Unter/Tief, Verwaist)
//   Ordner    2 (Unter, Anlagen); .git bleibt draussen
//   Bilder    1 (12 Bytes), PDF 1 (5 Bytes), Sonstige 1 (3 Bytes)
//   .mdd      1 zu Start.md (7 Bytes), .mdda 1 (9 Bytes)
//   Aufgaben  4 Zeilen: offen, laufend, erledigt, abgebrochen
//   Verweise  Start -> Ziel (wiki), Ziel -> Unter/Tief (markdown)
function makeFixture() {
  const root = makeRoot();
  const start = write(
    root,
    'Start.md',
    [
      '---',
      'tags: [projekt]',
      'aliases: [Anfang]',
      '---',
      '',
      '#notiz',
      '',
      'Siehe [[Ziel]].',
      '',
    ].join('\n'),
  );
  write(
    root,
    'Ziel.md',
    [
      '---',
      'tags: [projekt, wichtig]',
      'status: aktiv',
      '---',
      '',
      '- [ ] offene Aufgabe',
      '- [/] laufende Aufgabe',
      '- [x] erledigte Aufgabe',
      '- [-] abgebrochene Aufgabe',
      '',
      'Verweis auf [Tief](Unter/Tief.md).',
      '',
    ].join('\n'),
  );
  write(root, 'Unter/Tief.md', '# Tief\n\nInhalt ohne Verweise.\n');
  write(root, 'Verwaist.md', '# Verwaist\n\nNiemand verweist hierher.\n');
  write(root, 'Anlagen/bild.png', 'PNG-Attrappe'); // 12 Bytes
  write(root, 'Anlagen/blatt.pdf', 'PDF-A'); // 5 Bytes
  write(root, 'Anlagen/daten.csv', 'a;b'); // 3 Bytes
  write(root, 'Start.mdd', 'mdd-Rst'); // 7 Bytes
  write(root, 'Area_Settings.mdda', 'mdda-Rest'); // 9 Bytes
  write(root, '.git/config', 'darf nicht gezaehlt werden');
  return { root, start };
}

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

describe('statsFor — Index-Anteil der Bereichs-Statistik (4T-000619)', () => {
  it('zaehlt Tags und Eigenschaften je Datei, absteigend sortiert', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-index', root);

    const stats = statsFor(root, { statusTypeOf });
    expect(stats.status).toBe('ready');
    // projekt in beiden Dateien, notiz und wichtig in je einer.
    expect(stats.tags).toEqual([
      { name: 'projekt', dateien: 2 },
      { name: 'notiz', dateien: 1 },
      { name: 'wichtig', dateien: 1 },
    ]);
    const tagsEintrag = stats.eigenschaften.find((e) => e.name === 'tags');
    expect(tagsEintrag).toEqual({ name: 'tags', dateien: 2 });
    expect(stats.eigenschaften.find((e) => e.name === 'status')).toEqual({
      name: 'status',
      dateien: 1,
    });
    expect(stats.aliase).toBe(1);
  });

  it('teilt die Aufgaben ueberschneidungsfrei in offen, erledigt und abgebrochen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-tasks', root);

    const { aufgaben } = statsFor(root, { statusTypeOf });
    expect(aufgaben).toEqual({ gesamt: 4, offen: 2, erledigt: 1, abgebrochen: 1 });
    expect(aufgaben.offen + aufgaben.erledigt + aufgaben.abgebrochen).toBe(aufgaben.gesamt);
  });

  // 4T-002737 (Epic 3E-000396): Eine mit dem Status «Übertragen» (», Typ
  // «Keine Aufgabe») gekennzeichnete Zeile zählt in der Statistik nicht.
  it('zählt eine Zeile mit dem Status «Übertragen» nicht', async () => {
    const { root, start } = makeFixture();
    write(root, 'Gestern.md', '- [»] übertragene Aufgabe\n');
    await indexFor(start, 'test:stats-uebertragen', root);

    // Die echte Auflösung der vorbelegten Status: Ohne den Status «Übertragen»
    // hätte das Zeichen keine Bedeutung, und die Zeile zählte als offen.
    const { aufgaben } = statsFor(root, { statusTypeOf: createTaskStatusTypeResolver(null) });
    expect(aufgaben).toEqual({ gesamt: 4, offen: 2, erledigt: 1, abgebrochen: 1 });
    // Gegenprobe: Eine Auflösung, die das Zeichen nicht kennt, zählt die Zeile mit.
    expect(statsFor(root, { statusTypeOf }).aufgaben.gesamt).toBe(5);
  });

  it('zaehlt Verweise nach Art und die Dateien ohne eingehenden Verweis', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-links', root);

    const { verweise, auffaelligkeiten } = statsFor(root, { statusTypeOf });
    expect(verweise.wiki).toBe(1);
    expect(verweise.markdown).toBe(1);
    // Ziel und Unter/Tief haben je einen eingehenden Verweis; Start und
    // Verwaist haben keinen.
    expect(verweise.ohneEingehende).toBe(2);
    expect(auffaelligkeiten.meistverlinkt.map((e) => e.name).sort()).toEqual(['Tief', 'Ziel']);
    expect(auffaelligkeiten.groesste).toHaveLength(4);
    expect(auffaelligkeiten.groesste[0].bytes).toBeGreaterThanOrEqual(
      auffaelligkeiten.groesste[3].bytes,
    );
  });

  it('reicht den Status durch, statt Teilzahlen zu liefern', () => {
    expect(statsFor(null, { statusTypeOf })).toEqual({ status: 'unavailable' });
    expect(statsFor(path.join(os.tmpdir(), 'em4me-nie-indexiert'), { statusTypeOf })).toEqual({
      status: 'unavailable',
    });
  });
});

describe('collectAreaStats — Zusammenfuehrung mit dem Ordner-Scan (4T-000619)', () => {
  it('zaehlt Ordner, Nicht-Markdown-Dateien und Begleitdateien am Fixture', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-scan', root);

    const stats = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(stats.status).toBe('ready');
    expect(stats.dateien.markdown).toBe(4);
    expect(stats.dateien.ordner).toBe(2);
    expect(stats.dateien.nichtMarkdown).toEqual({
      bilder: 1,
      pdf: 1,
      sonstige: 1,
      gesamt: 3,
    });
    // Begleitdateien zaehlen NICHT als Nicht-Markdown-Dateien.
    expect(stats.begleit.mdd).toEqual({ anzahl: 1, bytes: 7 });
    expect(stats.begleit.mdda).toEqual({ anzahl: 1, bytes: 9 });
    expect(stats.begleit.mitMdd).toBe(1);
    expect(stats.begleit.vonMarkdown).toBe(4);
  });

  it('setzt die Speicher-Summe genau aus den angezeigten Teilen zusammen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-bytes', root);

    const { speicher } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(speicher.nichtMarkdown).toBe(20); // 12 + 5 + 3
    expect(speicher.begleit).toBe(16); // 7 + 9
    expect(speicher.gesamt).toBe(speicher.markdown + speicher.nichtMarkdown + speicher.begleit);
    expect(speicher.markdown).toBeGreaterThan(0);
  });

  it('laesst Punkt-Ordner in Datei-, Ordner- und Byte-Zahlen gleichermassen draussen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-ignore', root);

    const stats = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    // .git/config waere sonst eine „sonstige" Datei und .git ein Ordner.
    expect(stats.dateien.ordner).toBe(2);
    expect(stats.dateien.nichtMarkdown.sonstige).toBe(1);
    expect(stats.hinweise.uebersprungeneOrdner).toBe(0);
  });

  it('traegt einen sekundengenauen UTC-Zeitstempel und wiederholt sich stabil', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-stand', root);

    const erste = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    const zweite = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(erste.stand).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(zweite.dateien).toEqual(erste.dateien);
    expect(zweite.speicher).toEqual(erste.speicher);
    expect(zweite.inhalte).toEqual(erste.inhalte);
  });

  it('liefert ohne Bereich nur den Status', async () => {
    const stats = await collectAreaStats(null, { statusTypeOf }, { statsFor });
    expect(stats.status).toBe('unavailable');
    expect(stats.dateien).toBeUndefined();
  });
});

// 4T-000953 (Epic 3E-000198, Befund E-07): Die Seite zeigt den GESPEICHERTEN
// Stand und weist ihn aus. Geprüft wird deshalb zweierlei: dass die Zahlen
// sich durch einen Puffer NICHT bewegen (das ist die Entscheidung des Product
// Owners vom 2026-09-06, kein Versehen), und dass die Zahl der offenen
// Dokumente mit ungespeicherten Änderungen stimmt (das ist der Hinweis, der
// die Entscheidung trägt).
describe('collectAreaStats — Stand-Ausweis bei ungespeicherten Änderungen (4T-000953)', () => {
  afterEach(() => {
    clearAllBufferOverlays();
  });

  it('meldet die Zahl der offenen Dokumente mit ungespeicherten Änderungen', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-ungespeichert', root);

    // Anker: ohne Puffer meldet die Seite nichts auszuweisen.
    const ohne = await collectAreaStats(root, { statusTypeOf }, { statsFor, overlaysUnder });
    expect(ohne.hinweise.ungespeicherteDokumente).toBe(0);

    setBufferOverlay(start, '# Start\n\n#frisch\n');
    const eins = await collectAreaStats(root, { statusTypeOf }, { statsFor, overlaysUnder });
    expect(eins.hinweise.ungespeicherteDokumente).toBe(1);

    // Ein zweites offenes Dokument desselben Bereichs zählt mit; eines
    // AUSSERHALB der Wurzel nicht — die Zahl gehört zu diesem Bereich.
    setBufferOverlay(path.join(root, 'Unter', 'Tief.md'), '# Tief\n');
    setBufferOverlay(path.join(os.tmpdir(), 'em4me-fremd-Datei.md'), '# Fremd\n');
    const zwei = await collectAreaStats(root, { statusTypeOf }, { statsFor, overlaysUnder });
    expect(zwei.hinweise.ungespeicherteDokumente).toBe(2);
  });

  it('lässt die Kennzahlen selbst unberührt — die Seite bleibt am gespeicherten Stand', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-unveraendert', root);
    const vorher = await collectAreaStats(root, { statusTypeOf }, { statsFor, overlaysUnder });

    // Ein Puffer, der einen Tag hinzufügt und den Text verlängert. Beides
    // würde sich in den Zahlen zeigen, wenn die Seite ihn einrechnete.
    setBufferOverlay(start, '# Start\n\n#ganzfrischertag\n\nVerlaengerung.\n');
    const nachher = await collectAreaStats(root, { statusTypeOf }, { statsFor, overlaysUnder });

    expect(nachher.tags).toEqual(vorher.tags);
    expect(nachher.speicher).toEqual(vorher.speicher);
    expect(nachher.dateien).toEqual(vorher.dateien);
    expect(nachher.inhalte).toEqual(vorher.inhalte);
    // … und der Hinweis sagt genau das aus, was die Zahlen verschweigen.
    expect(nachher.hinweise.ungespeicherteDokumente).toBe(1);
  });
});

// 4T-001516 (Epic 3E-000172): Die Waisen-Liste und der Ausschluss der
// Start-Seite. Beide entstehen an derselben Zeile der Erhebung; die Tests
// pruefen deshalb durchgehend Liste UND Kennzahl gegeneinander, statt eine
// von beiden zu glauben.
describe('statsFor — Dateien ohne eingehenden Verweis (4T-001516)', () => {
  it('nennt die Waisen namentlich, nach Namen sortiert, und deckt sich mit der Kennzahl', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-waisen', root);

    const { verweise, auffaelligkeiten } = statsFor(root, { statusTypeOf });
    // Ziel und Unter/Tief werden verwiesen; Start und Verwaist nicht.
    expect(auffaelligkeiten.unverlinkt.map((e) => e.name)).toEqual(['Start', 'Verwaist']);
    expect(auffaelligkeiten.unverlinkt).toHaveLength(verweise.ohneEingehende);
  });

  it('laesst eine festgelegte Start-Seite aus Liste UND Kennzahl heraus', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-startseite', root);

    const mit = statsFor(root, { statusTypeOf, startPage: path.join(root, 'Start.md') });
    expect(mit.auffaelligkeiten.unverlinkt.map((e) => e.name)).toEqual(['Verwaist']);
    expect(mit.verweise.ohneEingehende).toBe(1);
  });

  it('verhaelt sich ohne Start-Seiten-Option wie bisher', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-ohne-startseite', root);

    for (const env of [{ statusTypeOf }, { statusTypeOf, startPage: null }]) {
      const stats = statsFor(root, env);
      expect(stats.verweise.ohneEingehende).toBe(2);
      expect(stats.auffaelligkeiten.unverlinkt.map((e) => e.name)).toEqual(['Start', 'Verwaist']);
    }
  });

  it('laesst Datei-Anzahl, Byte-Summe und die drei Nachbar-Listen unberuehrt', async () => {
    const { root, start } = makeFixture();
    await indexFor(start, 'test:stats-unberuehrt', root);

    const ohne = statsFor(root, { statusTypeOf });
    const mit = statsFor(root, { statusTypeOf, startPage: path.join(root, 'Start.md') });
    // Die ausgeschlossene Datei bleibt eine Datei: sie ist nur keine Waise.
    expect(mit.markdown).toEqual(ohne.markdown);
    expect(mit.auffaelligkeiten.groesste).toEqual(ohne.auffaelligkeiten.groesste);
    expect(mit.auffaelligkeiten.juengste).toEqual(ohne.auffaelligkeiten.juengste);
    expect(mit.auffaelligkeiten.meistverlinkt).toEqual(ohne.auffaelligkeiten.meistverlinkt);
  });

  it('kuerzt die Liste nicht auf die zehn der Nachbar-Listen (Entscheidung V4)', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', 'Siehe [[Ziel]].\n');
    write(root, 'Ziel.md', '# Ziel\n');
    for (let i = 1; i <= 12; i++) write(root, `Waise-${String(i).padStart(2, '0')}.md`, '# frei\n');
    await indexFor(start, 'test:stats-ungekuerzt', root);

    const { verweise, auffaelligkeiten } = statsFor(root, { statusTypeOf });
    // 12 angelegte Waisen plus Start.md, auf das niemand verweist.
    expect(verweise.ohneEingehende).toBe(13);
    expect(auffaelligkeiten.unverlinkt).toHaveLength(13);
    expect(auffaelligkeiten.groesste).toHaveLength(10); // die Nachbar-Liste kuerzt weiter
  });
});

// 4T-002782 (Epic 3E-000392, Story 4S-001162): Die Verweise ohne Ziel in der
// Antwort der Erhebung. Der Kern des Urteils hat seine eigene Prüfdatei
// (verweise-ohne-ziel.test.js); hier stehen Antwort-Form, Sortierung, das
// mehrfache Vorkommen, die Verweise in verknüpfte Bereiche und das
// Erhebungs-Prinzip (nichts geschrieben, kein Teilstand).
describe('collectAreaStats — Verweise ohne Ziel (4T-002782)', () => {
  function bereichMitToten() {
    const root = makeRoot();
    const start = write(
      root,
      'B-Start.md',
      ['# Start', 'Erst [[Fehlt]].', '', 'Dann [[Fehlt]] und [x](Weg.md).', '[[Fehlt]]', ''].join(
        '\n',
      ),
    );
    write(root, 'A-Notiz.md', '# Notiz\n\n[[Ziel#Gibt es nicht]]\n');
    write(root, 'Ziel.md', '# Ziel\n');
    write(
      root,
      'Verknuepft.md',
      '[[@zt:Da]] [[@zt:Nicht-Da]] [[@xx:Egal]] [[@vs:Weg]] [[@off:A]] [[@off:B]]\n',
    );
    return { root, start };
  }

  it('listet je Stelle einen Eintrag, nach Dokument und Zeile sortiert, ohne Obergrenze', async () => {
    const { root, start } = bereichMitToten();
    await indexFor(start, 'test:stats-ohne-ziel', root);
    const { verweiseOhneZiel } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(
      verweiseOhneZiel.eintraege.map((e) => `${e.name}:${e.zeile} ${e.grund} ${e.verweis}`),
    ).toEqual([
      'A-Notiz:3 ueberschrift-fehlt [[Ziel#Gibt es nicht]]',
      // Derselbe tote Verweis an drei Stellen ergibt drei Einträge (L6 Punkt 4).
      'B-Start:2 dokument-fehlt [[Fehlt]]',
      'B-Start:4 dokument-fehlt [[Fehlt]]',
      'B-Start:4 dokument-fehlt [x](Weg.md)',
      'B-Start:5 dokument-fehlt [[Fehlt]]',
    ]);
    expect(verweiseOhneZiel.eintraege[0]).toEqual({
      pfad: path.join(root, 'A-Notiz.md'),
      name: 'A-Notiz',
      zeile: 3,
      verweis: '[[Ziel#Gibt es nicht]]',
      grund: 'ueberschrift-fehlt',
    });
    // Ohne eingeschaltete Bereichs-Verknüpfungen bleiben deren Verweise unbeurteilt.
    expect(verweiseOhneZiel.nichtErreichbar).toEqual([]);
  });

  it('beurteilt Verweise in verknüpfte Bereiche mit einem Aufruf je Erhebung', async () => {
    const { root, start } = bereichMitToten();
    await indexFor(start, 'test:stats-verknuepft', root);
    const urteilJeZiel = {
      Da: 'ok',
      'Nicht-Da': 'nicht-gefunden',
      Egal: 'unbekannt',
      Weg: 'verschoben',
    };
    const aufrufe = [];
    const beurteileVerknuepfungsLinks = async (links, anfragen) => {
      aufrufe.push({ links, anfragen });
      return anfragen.map((a) => ({
        ...a,
        urteil: a.prefix === 'off' ? 'offline' : urteilJeZiel[a.target],
      }));
    };
    const readAreaLinks = async () => [{ prefix: 'zt', path: '/irgendwo' }];
    const stats = await collectAreaStats(
      root,
      { statusTypeOf, verknuepfungenAktiv: true },
      { statsFor, readAreaLinks, beurteileVerknuepfungsLinks },
    );
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].anfragen).toHaveLength(6);
    const verknuepft = stats.verweiseOhneZiel.eintraege.filter((e) => e.name === 'Verknuepft');
    expect(verknuepft.map((e) => `${e.grund} ${e.verweis}`)).toEqual([
      'verknuepft-nicht-gefunden [[@zt:Nicht-Da]]',
      'verknuepfung-nicht-nutzbar [[@xx:Egal]]',
      'verknuepfung-nicht-nutzbar [[@vs:Weg]]',
    ]);
    expect(stats.verweiseOhneZiel.nichtErreichbar).toEqual([{ prefix: 'off', anzahl: 2 }]);
  });

  it('ruft die Beurteilung bei ausgeschalteter Erweiterung nicht auf', async () => {
    const { root, start } = bereichMitToten();
    await indexFor(start, 'test:stats-verknuepft-aus', root);
    let aufrufe = 0;
    const deps = {
      statsFor,
      readAreaLinks: async () => [],
      beurteileVerknuepfungsLinks: async () => {
        aufrufe += 1;
        return [];
      },
    };
    const aus = await collectAreaStats(root, { statusTypeOf, verknuepfungenAktiv: false }, deps);
    // Wiki-Verweise aus: die Bereichs-Verknüpfungen hängen an ihnen.
    const wikiAus = await collectAreaStats(
      root,
      { statusTypeOf, wikiVerweiseAktiv: false, verknuepfungenAktiv: true },
      deps,
    );
    expect(aufrufe).toBe(0);
    for (const stats of [aus, wikiAus]) {
      expect(stats.verweiseOhneZiel.eintraege.some((e) => e.verweis.includes('@'))).toBe(false);
      expect(stats.verweiseOhneZiel.nichtErreichbar).toEqual([]);
    }
    expect(wikiAus.verweiseOhneZiel.eintraege.map((e) => e.verweis)).toEqual(['[x](Weg.md)']);
  });

  // Zweitblick zu 4T-002782, Runde 3, Befund 2: Ziele mit einer Endung, die
  // keine Markdown-Endung ist, gelten in einem verknüpften Bereich als Anlage.
  // Die Namens-Suche dort findet nur Markdown-Dateien; `[[@zt:Handbuch.docx]]`
  // stünde sonst als «nicht gefunden» in der Liste, obwohl die Datei im
  // Unterordner liegt. Der eigene Bereich enthält keine docx-Datei.
  it('lässt Anlagen in verknüpften Bereichen aus, auch ohne ihre Endung im eigenen Bereich', async () => {
    const root = makeRoot();
    const verknuepft = makeRoot();
    write(verknuepft, 'Unterordner/Handbuch.docx', 'docx');
    const start = write(
      root,
      'Notiz.md',
      [
        '# Notiz',
        '[[@zt:Unterordner/Handbuch.docx]] [[@zt:Handbuch.docx]] [[@zt:Fehlt-Doku]]',
        '',
      ].join('\n'),
    );
    await indexFor(start, 'test:stats-verknuepft-anlage', root);
    const stats = await collectAreaStats(
      root,
      { statusTypeOf, verknuepfungenAktiv: true },
      { statsFor, readAreaLinks: async () => [{ prefix: 'zt', path: verknuepft }] },
    );
    expect(stats.verweiseOhneZiel.eintraege.map((e) => `${e.grund} ${e.verweis}`)).toEqual([
      'verknuepft-nicht-gefunden [[@zt:Fehlt-Doku]]',
    ]);
  });

  // Zweitblick zu 4T-002782, Befund 4: Ein Fehler der Beurteilung kostet nicht
  // die ganze Statistik.
  it('zählt bei einem Fehler der Beurteilung die Verweise als nicht erreichbar und liefert den Rest', async () => {
    const { root, start } = bereichMitToten();
    await indexFor(start, 'test:stats-verknuepft-fehler', root);
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const stats = await collectAreaStats(
        root,
        { statusTypeOf, verknuepfungenAktiv: true },
        {
          statsFor,
          readAreaLinks: async () => [{ prefix: 'zt', path: '/irgendwo' }],
          beurteileVerknuepfungsLinks: async () => {
            throw new Error('Freigabe getrennt');
          },
        },
      );
      expect(stats.status).toBe('ready');
      expect(stats.dateien.markdown).toBe(4);
      expect(stats.verweiseOhneZiel.eintraege.some((e) => e.verweis.includes('@'))).toBe(false);
      expect(stats.verweiseOhneZiel.eintraege).toHaveLength(5);
      expect(stats.verweiseOhneZiel.nichtErreichbar).toEqual([
        { prefix: 'off', anzahl: 2 },
        { prefix: 'vs', anzahl: 1 },
        { prefix: 'xx', anzahl: 1 },
        { prefix: 'zt', anzahl: 2 },
      ]);
      expect(warnung).toHaveBeenCalledTimes(1);
      expect(String(warnung.mock.calls[0][0])).toContain('verknüpfte Bereiche');
      expect(warnung.mock.calls[0]).toContain('Freigabe getrennt');
    } finally {
      warnung.mockRestore();
    }
  });

  // Zweitblick zu 3E-000392, Hinweis B6: Ein Lesefehler der Verknüpfungen
  // zählt die Verweise wie ein Fehler der Beurteilung, statt sie zu verschlucken.
  it('zählt bei einem Lesefehler der Verknüpfungen die Verweise als nicht erreichbar', async () => {
    const { root, start } = bereichMitToten();
    await indexFor(start, 'test:stats-verknuepft-lesefehler', root);
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const stats = await collectAreaStats(
        root,
        { statusTypeOf, verknuepfungenAktiv: true },
        {
          statsFor,
          readAreaLinks: async () => {
            throw new Error('Bereichsdatei nicht lesbar');
          },
        },
      );
      expect(stats.status).toBe('ready');
      expect(stats.verweiseOhneZiel.eintraege).toHaveLength(5);
      expect(stats.verweiseOhneZiel.nichtErreichbar).toEqual([
        { prefix: 'off', anzahl: 2 },
        { prefix: 'vs', anzahl: 1 },
        { prefix: 'xx', anzahl: 1 },
        { prefix: 'zt', anzahl: 2 },
      ]);
      expect(warnung).toHaveBeenCalledTimes(1);
      expect(warnung.mock.calls[0]).toContain('Bereichsdatei nicht lesbar');
    } finally {
      warnung.mockRestore();
    }
  });

  // Zweitblick zu 3E-000392, Hinweis A1: Die Abbildung, mit der der Kanal der
  // Bereichs-Statistik die abgeschalteten Erweiterungen in Schalter der Erhebung
  // übersetzt. Eine vertippte Kennung gälte als stets eingeschaltet; der Fall
  // schaltet jede einzeln ab und erwartet genau ihren Schalter aus.
  it('bildet jede abgeschaltete Erweiterung auf ihren Schalter der Erhebung ab', () => {
    const paare = [
      ['wiki-links', 'wikiVerweiseAktiv'],
      ['area-links', 'verknuepfungenAktiv'],
      ['canvas', 'canvasAktiv'],
      ['dashboard', 'dashboardAktiv'],
      ['perspective-chart', 'diagrammeAktiv'],
      ['perspective-datatable', 'datentabelleAktiv'],
    ];
    expect(Object.keys(verweisSchalter([])).sort()).toEqual(paare.map(([, k]) => k).sort());
    for (const [, schalter] of paare) expect(verweisSchalter([])[schalter]).toBe(true);
    for (const [id, schalter] of paare) expect(verweisSchalter([id])[schalter]).toBe(false);
  });

  // Zweitblick zu 3E-000392, Runde 2, Hinweis 2: Der Kanal reicht die Schalter
  // aus dem Speicher und den Leser der Verknüpfungen an die Erhebung durch.
  // Der Speicher meldet die abgeschaltete Erweiterung erst nach der
  // Registrierung, damit deren Start-Stand anderer Schalter unberührt bleibt.
  it('reicht im Kanal areaStats:collect die Schalter und den Leser der Verknüpfungen durch', async () => {
    let aus = [];
    const aufrufe = [];
    const readAreaLinks = async () => [];
    const handlers = new Map();
    registerIndexViewsIpc((name, fn) => handlers.set(name, fn), {
      senderWindow: () => null,
      areaOfWindow: () => null,
      areaRootForEvent: () => '/bereich',
      getStore: () => ({ get: (k) => (k === 'extensions.disabled' ? aus : null) }),
      backlinks: {},
      collectAreaStats: (...args) => {
        aufrufe.push(args);
        return null;
      },
      sucheImBereich: () => null,
      gibBereichsVorratFrei: () => {},
      readAreaProfilesConfig: () => null,
      resolveAreaStartPage: () => null,
      readAreaLinks,
      resolveHistoryFor: () => null,
      readPreviousTextFor: () => null,
      recordMddOnSave: () => {},
    });
    const kanal = handlers.get('areaStats:collect');
    await kanal({});
    aus = ['area-links'];
    await kanal({});
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[0][0]).toBe('/bereich');
    expect(aufrufe[0][2].readAreaLinks).toBe(readAreaLinks);
    expect(aufrufe[0][1]).toMatchObject(verweisSchalter([]));
    expect(aufrufe[1][1]).toMatchObject({ ...verweisSchalter([]), verknuepfungenAktiv: false });
  });

  // Zweitblick zu 4T-002782, Befund 3: Die Schalter der Block-Erweiterungen
  // wirken in der Erhebung (die Abbildung im Kanal prüfen die Fälle davor).
  it('reicht die Schalter von Canvas, Dashboard, Diagrammen und Datentabelle an die Erhebung weiter', async () => {
    const root = makeRoot();
    const T = '```';
    const start = write(
      root,
      'Bloecke.md',
      [
        '# Blöcke',
        `${T}perspective-canvas`,
        '!karte k1 x=0 y=0 doc="Fehlt-Karte"',
        T,
        `${T}perspective-dashboard`,
        '!kachel liste abfrage="Fehlt-Abfrage"',
        T,
        `${T}perspective-chart`,
        'table: [[Fehlt-Daten#^umsatz]]',
        T,
        `${T}perspective-datatable`,
        'columns: Name:text',
        '| [[Fehlt-Zelle]] |',
        T,
        '',
      ].join('\n'),
    );
    await indexFor(start, 'test:stats-bloecke', root);
    const zeilen = async (env) =>
      (
        await collectAreaStats(root, { statusTypeOf, ...env }, { statsFor })
      ).verweiseOhneZiel.eintraege.map((e) => e.zeile);
    expect(await zeilen({})).toEqual([3, 6, 9, 13]);
    expect(await zeilen({ canvasAktiv: false })).toEqual([6, 9, 13]);
    expect(await zeilen({ dashboardAktiv: false })).toEqual([3, 9, 13]);
    expect(await zeilen({ diagrammeAktiv: false })).toEqual([3, 6, 13]);
    expect(await zeilen({ datentabelleAktiv: false })).toEqual([3, 6, 9]);
  });

  it('schreibt nichts in den Bereich und liefert ohne bereiten Index keinen Teilstand', async () => {
    const { root, start } = bereichMitToten();
    await indexFor(start, 'test:stats-ohne-ziel-lesend', root);
    // Den Zwischenspeicher des Index schreibt der Index-Aufbau verzögert, nicht
    // die Erhebung; er bleibt deshalb aus dem Vergleich.
    const stand = () =>
      fs
        .readdirSync(root, { recursive: true })
        .filter((rel) => !rel.endsWith('Area_Cache.mdda'))
        .sort()
        .map((rel) => `${rel}:${fs.statSync(path.join(root, rel)).mtimeMs}`);
    const vorher = stand();
    await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(stand()).toEqual(vorher);

    const nie = await collectAreaStats(
      path.join(os.tmpdir(), 'em4me-nie-indexiert'),
      {},
      { statsFor },
    );
    expect(nie.status).toBe('unavailable');
    expect(nie.verweiseOhneZiel).toBeUndefined();
  });
});

// 4T-002783 (Epic 3E-000392): Ein Eintrag aus einem Folgeteil eines geteilten
// Dokuments steht unter dem Dokument und seiner Zeile, wie der Editor es
// zusammengesetzt unter dem Pfad der Kopf-Datei öffnet. Die Zeilen sind von
// Hand nachgerechnet: Die Kopf-Datei trägt drei Zeilen Kopf-Block und zwei
// Zeilen Text, jeder Folgeteil drei Zeilen Kopf-Block, die im Dokument fehlen.
describe('collectAreaStats — Verweise ohne Ziel in Folgeteilen (4T-002783)', () => {
  function geteiltesDokument(root) {
    const teil = (i, text) => writePartLine(text, { index: i, base: 'Gross' }).text;
    const kopf = write(root, 'Gross.md', teil(1, '# Kopf\nErst [[Fehlt-Kopf]].\n'));
    write(root, 'Gross•part-00002.md', teil(2, '## Teil\nText\nDann [[Fehlt-Teil]].\n'));
    write(root, 'Gross•part-00003.md', teil(3, '[[Fehlt-Drei]] am Anfang\n'));
    return kopf;
  }

  it('bildet die Einträge auf das Dokument und seine Zeile ab und schreibt nichts', async () => {
    const root = makeRoot();
    const kopf = geteiltesDokument(root);
    // Gültige Begleitdatei der Kopf-Datei: Ohne sie schriebe der Lese-Weg den
    // Katalog ohnehin nicht, und der Fall bewiese das Nicht-Schreiben nicht
    // (Zweitblick zu 4T-002783, Befund 3).
    write(root, 'Gross.mdd', serializeContainer(emptyContainer()));
    await indexFor(kopf, 'test:stats-folgeteile', root);
    const stand = () =>
      fs
        .readdirSync(root, { recursive: true })
        .filter((rel) => !rel.endsWith('Area_Cache.mdda'))
        .sort()
        .map((rel) => {
          const s = fs.statSync(path.join(root, rel));
          return `${rel}:${s.mtimeMs}:${s.size}`;
        });
    const vorher = stand();
    const { verweiseOhneZiel } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    expect(stand()).toEqual(vorher);
    expect(verweiseOhneZiel.eintraege.map((e) => `${e.name}:${e.zeile} ${e.verweis}`)).toEqual([
      'Gross:5 [[Fehlt-Kopf]]',
      'Gross:8 [[Fehlt-Teil]]',
      'Gross:9 [[Fehlt-Drei]]',
    ]);
    for (const e of verweiseOhneZiel.eintraege) expect(e.pfad).toBe(kopf);
    // Gegenprobe am Text, den der Editor öffnet: Jede Zeile trägt ihren Verweis.
    const doc = await readAssembledDocument(kopf, fs.readFileSync(kopf, 'utf8'));
    const zeilen = doc.text.split('\n');
    for (const e of verweiseOhneZiel.eintraege) expect(zeilen[e.zeile - 1]).toContain(e.verweis);
  });

  // Zweitblick zu 3E-000392, Hinweis A2: Ein Verweis im Kopf-Block eines
  // Folgeteils steht im zusammengesetzten Text nicht. Er bleibt beim Dokument,
  // aber ohne Zeile, statt auf die erste Zeile des Teils zu zeigen.
  it('nennt einen Verweis im Kopf-Block eines Folgeteils beim Dokument ohne Zeile', async () => {
    const root = makeRoot();
    const teil = (i, text) => writePartLine(text, { index: i, base: 'Meta' }).text;
    const kopf = write(root, 'Meta.md', teil(1, '# Meta\nText\n'));
    write(
      root,
      'Meta•part-00002.md',
      teil(2, '---\nquelle: "[[Fehlt-Meta]]"\n---\n## Teil\n[[Fehlt-Rumpf]]\n'),
    );
    await indexFor(kopf, 'test:stats-folgeteil-kopfblock', root);
    const { verweiseOhneZiel } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    const sicht = verweiseOhneZiel.eintraege.map(
      (e) => `${path.basename(e.pfad)}:${e.zeile} ${e.verweis}`,
    );
    expect(sicht).toContain('Meta.md:null [[Fehlt-Meta]]');
    const rumpf = verweiseOhneZiel.eintraege.find((e) => e.verweis === '[[Fehlt-Rumpf]]');
    const doc = await readAssembledDocument(kopf, fs.readFileSync(kopf, 'utf8'));
    expect(doc.text.split('\n')[rumpf.zeile - 1]).toContain('[[Fehlt-Rumpf]]');
  });

  it('lässt eine ungeteilte Datei mit Teil-Namen stehen und nennt ohne Lesen das Dokument ohne Zeile', async () => {
    const root = makeRoot();
    const kopf = geteiltesDokument(root);
    // Name eines Folgeteils, aber ohne Zuordnungs-Zeile: Der Editor öffnet sie als
    // eigenes Dokument, der Eintrag bleibt, wie er ist.
    const solo = write(root, 'Solo•part-00002.md', '# Solo\n[[Fehlt-Solo]]\n');
    await indexFor(kopf, 'test:stats-folgeteile-rueckfall', root);
    const gelesen = [];
    const { verweiseOhneZiel } = await collectAreaStats(
      root,
      { statusTypeOf },
      {
        statsFor,
        leseGeteiltesDokument: async (p) => {
          gelesen.push(path.basename(p));
          if (p === solo) return { ok: true, geteilt: false, path: p };
          throw new Error('Lesefehler der Probe');
        },
      },
    );
    const sicht = verweiseOhneZiel.eintraege.map(
      (e) => `${path.basename(e.pfad)}:${e.zeile} ${e.verweis}`,
    );
    expect(sicht).toEqual([
      'Gross.md:null [[Fehlt-Teil]]',
      'Gross.md:null [[Fehlt-Drei]]',
      'Gross.md:5 [[Fehlt-Kopf]]',
      'Solo•part-00002.md:2 [[Fehlt-Solo]]',
    ]);
    // Je Teil-Datei höchstens ein Lese-Versuch, die Kopf-Datei nie.
    expect(gelesen.sort()).toEqual([
      'Gross•part-00002.md',
      'Gross•part-00003.md',
      'Solo•part-00002.md',
    ]);
  });

  // Zweitblick zu 4T-002783, Befund 4: Der aus dem Namen abgeleitete Kopf-Pfad
  // muss nicht bestehen. Fehlt die Kopf-Datei, bleibt der Eintrag unter der
  // Teil-Datei ohne Zeile, statt auf eine Datei zu zeigen, die es nicht gibt.
  it('lässt den Eintrag bei fehlender Kopf-Datei unter der Teil-Datei ohne Zeile', async () => {
    const root = makeRoot();
    const kopf = geteiltesDokument(root);
    const waise = write(
      root,
      'Weg•part-00002.md',
      writePartLine('## Rest\n[[Fehlt-Waise]]\n', { index: 2, base: 'Weg' }).text,
    );
    await indexFor(kopf, 'test:stats-folgeteile-ohne-kopf', root);
    const { verweiseOhneZiel } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    const eintrag = verweiseOhneZiel.eintraege.find((e) => e.verweis === '[[Fehlt-Waise]]');
    expect(eintrag).toMatchObject({ pfad: waise, zeile: null });
    expect(fs.existsSync(path.join(root, 'Weg.md'))).toBe(false);
  });

  // Sicherheits-Review zu 4T-002783, Befund 1, zweite Linie: Liefert der Lese-Weg
  // für ein Dokument Pfade außerhalb des Bereichs, geht keiner davon in die
  // Antwort. Der Leser ist präpariert, weil der echte Lese-Weg solche Pfade seit
  // der Grundnamen-Prüfung nicht mehr liefert (Fall darunter).
  it('nimmt keinen Pfad außerhalb des Bereichs in die Antwort (präparierter Leser)', async () => {
    const root = makeRoot();
    const kopf = geteiltesDokument(root);
    await indexFor(kopf, 'test:stats-folgeteile-aussen', root);
    const fremd = path.join(path.dirname(root), 'Fremd', 'Tagebuch.md');
    const teil2 = path.join(root, 'Gross•part-00002.md');
    const { verweiseOhneZiel } = await collectAreaStats(
      root,
      { statusTypeOf },
      {
        statsFor,
        leseGeteiltesDokument: async (p) => ({
          ok: true,
          geteilt: true,
          path: fremd,
          text: 'a\nb\nc\n',
          teile: [
            { pfad: fremd, content: 'a\nb\n' },
            { pfad: p, content: fs.readFileSync(p, 'utf8') },
          ],
          grenzen: [4],
        }),
      },
    );
    const sicht = verweiseOhneZiel.eintraege.map((e) => `${e.pfad}:${e.zeile} ${e.verweis}`);
    expect(sicht).toContain(`${teil2}:null [[Fehlt-Teil]]`);
    for (const e of verweiseOhneZiel.eintraege) {
      expect(path.relative(root, e.pfad).startsWith('..'), e.pfad).toBe(false);
    }
  });

  // Erste Linie, am echten Lese-Weg: Ein Grundname mit Pfad-Anteil macht die
  // Datei zu einem ungeteilten Dokument, und ihr Eintrag behält Pfad und Zeile
  // (Zeile 4 hinter drei Zeilen Kopf-Block). Ohne die Grundnamen-Prüfung läse der
  // Lese-Weg die Datei außerhalb als Kopf-Datei, und der Eintrag verlöre seine Zeile.
  it('liest einen Folgeteil mit Pfad im Grundnamen nicht über den Bereich hinaus', async () => {
    const root = makeRoot();
    const kopf = geteiltesDokument(root);
    const aussen = path.join(path.dirname(root), `${path.basename(root)}-Fremd.md`);
    fs.writeFileSync(aussen, 'Zeile 1\nZeile 2\nZeile 3\nZeile 4\n', 'utf8');
    tmpDirs.push(aussen);
    const base = `../${path.basename(root)}-Fremd`;
    const teil = write(
      root,
      'Fremd•part-00002.md',
      writePartLine('[[Fehlt-Fremd]]\n', { index: 2, base }).text,
    );
    await indexFor(kopf, 'test:stats-folgeteile-grundname', root);
    const { verweiseOhneZiel } = await collectAreaStats(root, { statusTypeOf }, { statsFor });
    const eintrag = verweiseOhneZiel.eintraege.find((e) => e.verweis === '[[Fehlt-Fremd]]');
    expect(eintrag).toMatchObject({ pfad: teil, zeile: 4 });
    for (const e of verweiseOhneZiel.eintraege) {
      expect(path.relative(root, e.pfad).startsWith('..'), e.pfad).toBe(false);
    }
  });
});
