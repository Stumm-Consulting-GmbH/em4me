// 4T-002782 (Epic 3E-000392, Story 4S-001162): Kern der Liste der Verweise
// ohne Ziel (src/main/index/verweise-ohne-ziel.js) und die zwei eigenen Felder
// des Parsers (src/main/index/parse.js).
//
// Gelesen wird über statsFor mit der Option verweiseOhneZiel, also am selben
// Index-Eintrag, den die Bereichs-Statistik liest. Jeder Fall nennt die
// Plattform, für die seine Erwartung gilt: Ein Verweis in anderer Groß- und
// Kleinschreibung findet unter Windows und macOS sein Ziel schon über das
// Dateisystem, unter Linux nicht (Epic, Kapitel «Offene Punkte / Risiken»).
// «alle Plattformen» heißt, die Erwartung hängt nicht daran.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  existingWikiTargets,
  releaseRoot,
  rootForActiveFile,
  statsFor,
} from '../../src/main/backlinks.js';
import { createRequire } from 'node:module';
import { parseContent } from '../../src/main/index/parse.js';
import { GRUND, sortiereVerweiseOhneZiel } from '../../src/main/index/verweise-ohne-ziel.js';
import { isFilesystemCaseInsensitive } from '../../src/shared/platform.js';

// Der Schalter des Datensatz-Bestands muss dieselbe Modul-Instanz treffen, die
// der Index liest; Muster area-suchraum-datensaetze.test.js.
const require_ = createRequire(import.meta.url);
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');

const T = '```';
const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ohne-ziel-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, areaRoot) {
  let result = backlinksFor(activeFile, 'test:ohne-ziel', areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, 'test:ohne-ziel', areaRoot);
  }
  return result;
}

// Ein Bereich mit je einer Schreibweise der Abweichungs-Tabelle des Epics und
// je einem Grund. Der Bereich liegt in einem Unterordner, damit ein Verweis
// «außerhalb» ein Geschwister-Verzeichnis trifft, das es wirklich gibt.
function bereichAnlegen() {
  const basis = makeRoot();
  const root = path.join(basis, 'bereich');
  write(basis, 'draussen/X.md', '# X\n');
  write(root, 'Ziel.md', '---\naliases: [Zweitname]\n---\n# Kapitel Eins\n\nAbsatz ^blk1\n');
  write(root, 'Unter/Tief.md', '# Tief\n');
  write(root, 'Ordner/Doppelt.md', '# A\n');
  write(root, 'Anderer/Doppelt.md', '# B\n');
  write(root, 'Seite.md', '# Seite\n\n[[/Unter]] [[/Fehlt-Unten]]\n');
  write(root, 'Seite∕Unter.md', '# Unterseite\n');
  write(
    root,
    'Kunden.md',
    [
      '---',
      'db-table:',
      '  fields:',
      '    - name: Kuerzel',
      '    - name: Titel',
      '  key: Kuerzel',
      '  display: Titel',
      '---',
      '',
      '# Kundenliste',
      '',
      'Ein Absatz ^r-00002',
      '',
      `${T}perspective-records`,
      '|- id="r-00001"',
      '| K-1',
      '| Anna',
      '|- id="r-00002"',
      '| K-2',
      '| Bert',
      '|- id="r-00003"',
      '| K-3',
      '| Doppel',
      '|- id="r-00004"',
      '| K-4',
      '| Doppel',
      T,
      '',
    ].join('\n'),
  );
  write(
    root,
    'Vorlagen/Notiz-Vorlage.md',
    '# {{title}}\n\nSiehe [[{{title}} Anhang]] und [[Projekte/{{folder}}]].\n\n[Datei]({{title}}.md)\n',
  );
  write(root, 'Daten.md', '# Daten\n\nUmsatz-Absatz ^umsatz\n');
  write(root, 'Abfragen/Offen.md', '# Offen\n');
  write(
    root,
    'Flaeche.md',
    [
      '# Flaeche',
      '',
      `${T}perspective-canvas`,
      '!karte k1 x=0 y=0 doc="Ziel.md#Kapitel Eins"',
      '!karte k2 x=1 y=0 doc="Fehlt-Karte"',
      T,
      '',
    ].join('\n'),
  );
  write(
    root,
    'Bericht.md',
    ['# Bericht', '', `${T}perspective-chart`, 'type: bar', 'table: [[Daten#^fehlt]]', T, ''].join(
      '\n',
    ),
  );
  write(
    root,
    'Lage.md',
    [
      '# Lage',
      '',
      `${T}perspective-dashboard`,
      '!kachel liste abfrage="Abfragen/Offen"',
      '!kachel liste abfrage=Fehlt-Abfrage',
      T,
      '',
    ].join('\n'),
  );
  const start = write(
    root,
    'Start.md',
    [
      '---', // 1
      'projekt: "[[Ziel]]"', // 2
      'fehlt: "[[Kopf-Fehlt]]"', // 3
      '---', // 4
      '# Start', // 5
      '## Abschnitt Zwei', // 6
      'Ein Block ^eigen', // 7
      '[[Ziel]] [[Fehlt]] [[Ziel#Kapitel Eins]] [[Ziel#Fehlt]] [[Ziel#^blk1]] [[Ziel#^nein]]', // 8
      '[[Zweitname]] [[Unter/Tief]] [[Seite/Unter]] [[Doppelt]] ![[Ziel]] ![[Einbett-Fehlt]]', // 9
      '[[Kunden#^r-00001]] [[Kunden#^r-00099]] [[Kunden#^Anna]] [[Kunden#^Doppel]] [[Kunden#^r-00002]] [[Kunden#^Niemand]]', // 10
      '[a](Ziel.md) [b](Fehlt.md) [c](Ziel.md#kapitel-eins) [d](Ziel.md#gibtsnicht) [e](Ziel.md#^nein) [f](../draussen/X.md) [g](<Unter/Tief.md>)', // 11
      '[[#Abschnitt Zwei]] [[#Fehlt-Hier]] [[#^eigen]] [[#^fehlt]] [h](#abschnitt-zwei) [i](#gibtsnicht) [j](#^fehlt-md)', // 12
      '`[[InlineCode]]` [web](https://example.org/a.md) [[../draussen/X]] [k](Tief.md)', // 13
      T, // 14
      '[[ImCodeBlock]]', // 15
      T, // 16
      '',
    ].join('\n'),
  );
  return { root, start };
}

function liste(root, optionen = {}) {
  const r = statsFor(root, { verweiseOhneZiel: optionen });
  expect(r.status).toBe('ready');
  return r.verweiseOhneZiel;
}

// Kurzform eines Eintrags für die Erwartungen: Datei, Zeile, Wortlaut, Grund.
function kurz(root, eintraege) {
  return eintraege.map(
    (e) =>
      `${path.relative(root, e.pfad).split(path.sep).join('/')}:${e.zeile} ${e.grund} ${e.verweis}`,
  );
}

afterEach(() => {
  setzeDatensatzErfassung(true);
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

describe('Verweise ohne Ziel: Gründe je Verweis-Art (alle Plattformen)', () => {
  it('listet jeden Verweis ohne Ziel mit Zeile, Wortlaut und Grund, und keinen sonst', async () => {
    const { root, start } = bereichAnlegen();
    await indexFor(start, root);
    const { eintraege, verknuepfungen } = liste(root);
    expect(verknuepfungen).toEqual([]);
    expect(kurz(root, sortiereVerweiseOhneZiel(eintraege))).toEqual([
      // Diagramm-Angabe auf eine Tabelle mit fehlendem Block-Anker.
      'Bericht.md:5 block-anker-fehlt [[Daten#^fehlt]]',
      // Canvas-Karte ohne Ziel.
      'Flaeche.md:5 dokument-fehlt doc="Fehlt-Karte"',
      // Dashboard-Kachel ohne Abfrage-Datei.
      'Lage.md:5 dokument-fehlt abfrage=Fehlt-Abfrage',
      // Relative Unterseiten-Form ohne Ziel; die vorhandene steht nicht da.
      'Seite.md:3 dokument-fehlt [[/Fehlt-Unten]]',
      // Wiki-Verweis im Kopf-Block (Tabellen-Zeile 7).
      'Start.md:3 dokument-fehlt [[Kopf-Fehlt]]',
      // Wiki-Verweis: Dokument, Überschrift, Block-Anker (Tabellen-Zeile 3).
      'Start.md:8 dokument-fehlt [[Fehlt]]',
      'Start.md:8 ueberschrift-fehlt [[Ziel#Fehlt]]',
      'Start.md:8 block-anker-fehlt [[Ziel#^nein]]',
      // Einbettung ohne Ziel (Tabellen-Zeile 8).
      'Start.md:9 dokument-fehlt ![[Einbett-Fehlt]]',
      // Datensatz-Anker nach dem Urteil des Kerns (Nachweis 1a).
      'Start.md:10 block-anker-fehlt [[Kunden#^r-00099]]',
      'Start.md:10 block-anker-fehlt [[Kunden#^Niemand]]',
      // Markdown-Verweise: Dokument, Überschrift, Block-Anker, außerhalb
      // (Tabellen-Zeilen 4 und 9).
      'Start.md:11 dokument-fehlt [b](Fehlt.md)',
      'Start.md:11 ueberschrift-fehlt [d](Ziel.md#gibtsnicht)',
      'Start.md:11 block-anker-fehlt [e](Ziel.md#^nein)',
      'Start.md:11 ausserhalb-bereich [f](../draussen/X.md)',
      // Anker im selben Dokument, Wiki- und Markdown-Schreibweise.
      'Start.md:12 ueberschrift-fehlt [[#Fehlt-Hier]]',
      'Start.md:12 block-anker-fehlt [[#^fehlt]]',
      'Start.md:12 ueberschrift-fehlt [i](#gibtsnicht)',
      'Start.md:12 block-anker-fehlt [j](#^fehlt-md)',
      // Wiki-Verweis aus dem Bereich hinaus, wie die Editor-Regel; und ein
      // Markdown-Pfad, der vom Dokument aus nicht trägt, obwohl der Name im
      // Bereich vorkommt (Tabellen-Zeile 5).
      'Start.md:13 ausserhalb-bereich [[../draussen/X]]',
      'Start.md:13 dokument-fehlt [k](Tief.md)',
    ]);
  });

  it('nennt nur die sechs Grund-Kennungen der Schnittstelle', () => {
    expect(Object.values(GRUND).sort()).toEqual([
      'ausserhalb-bereich',
      'block-anker-fehlt',
      'dokument-fehlt',
      'ueberschrift-fehlt',
      'verknuepft-nicht-gefunden',
      'verknuepfung-nicht-nutzbar',
    ]);
  });
});

describe('Verweise ohne Ziel: was nicht in der Liste steht (alle Plattformen)', () => {
  it('lässt Zweitname, Pfad- und Unterseiten-Form, doppelten Namen, Code, Web-Adresse und Vorlagen aus', async () => {
    const { root, start } = bereichAnlegen();
    await indexFor(start, root);
    const texte = liste(root).eintraege.map((e) => e.verweis);
    for (const verweis of [
      '[[Zweitname]]', // Tabellen-Zeile 1
      '[[Unter/Tief]]',
      '[[Seite/Unter]]',
      '[[/Unter]]',
      '[[Doppelt]]', // Tabellen-Zeile 2
      '[[Kunden#^Doppel]]', // mehrdeutiger Datensatz-Name gilt als vorhanden
      '[[Kunden#^r-00002]]', // verdeckter Datensatz: der Block-Anker trägt
      '[[InlineCode]]',
      '[[ImCodeBlock]]',
      '[web](https://example.org/a.md)',
      '[g](<Unter/Tief.md>)',
    ]) {
      expect(texte).not.toContain(verweis);
    }
    expect(liste(root).eintraege.some((e) => e.pfad.includes('Notiz-Vorlage'))).toBe(false);
  });

  it('bei ausgeschalteter Erweiterung der Wiki-Verweise bleiben Markdown, Canvas und Kachel', async () => {
    const { root, start } = bereichAnlegen();
    await indexFor(start, root);
    const { eintraege } = liste(root, { wikiVerweiseAktiv: false });
    expect(kurz(root, sortiereVerweiseOhneZiel(eintraege))).toEqual([
      'Flaeche.md:5 dokument-fehlt doc="Fehlt-Karte"',
      'Lage.md:5 dokument-fehlt abfrage=Fehlt-Abfrage',
      'Start.md:11 dokument-fehlt [b](Fehlt.md)',
      'Start.md:11 ueberschrift-fehlt [d](Ziel.md#gibtsnicht)',
      'Start.md:11 block-anker-fehlt [e](Ziel.md#^nein)',
      'Start.md:11 ausserhalb-bereich [f](../draussen/X.md)',
      'Start.md:12 ueberschrift-fehlt [i](#gibtsnicht)',
      'Start.md:12 block-anker-fehlt [j](#^fehlt-md)',
      'Start.md:13 dokument-fehlt [k](Tief.md)',
    ]);
  });
});

describe('Verweise ohne Ziel: Liste und Editor-Kern urteilen gleich (alle Plattformen)', () => {
  // Dieselben Schreibweisen wie die Messung der Konzept-Stufe: je Zeile ein
  // Wiki-Verweis im Text, gefragt in der Form, die der Editor bildet.
  const SCHREIBWEISEN = [
    'Ziel',
    'Fehlt',
    'Ziel#Kapitel Eins',
    'Ziel#Fehlt',
    'Ziel#^blk1',
    'Ziel#^nein',
    'Zweitname',
    'Unter/Tief',
    'Tief',
    'Seite/Unter',
    'Doppelt',
    'Ordner/Doppelt',
    'Name mit Leerzeichen',
    'Kunden#^r-00001',
    'Kunden#^r-00099',
    'Kunden#^Anna',
    'Kunden#^Doppel',
    'Kunden#^r-00002',
    'Kunden#^Niemand',
    '#Abschnitt',
    '#Fehlt-Hier',
    '#^eigen',
    '#^fehlt',
  ];

  async function vergleiche(datenbankAn) {
    setzeDatensatzErfassung(datenbankAn);
    const { root } = bereichAnlegen();
    write(root, 'Name mit Leerzeichen.md', '# N\n');
    const gleich = write(
      root,
      'Gleich.md',
      ['## Abschnitt', 'Block ^eigen', ...SCHREIBWEISEN.map((s) => `[[${s}|Text]]`), ''].join('\n'),
    );
    await indexFor(gleich, root);
    const editor = existingWikiTargets(gleich, SCHREIBWEISEN, root);
    expect(editor.status).toBe('ready');
    const urteilEditor = SCHREIBWEISEN.map((s) => {
      if (editor.existing.includes(s) || editor.ambiguous.includes(s)) return 'ok';
      return editor.brokenAnchor.includes(s) ? 'anker' : 'fehlt';
    });
    const eintraege = liste(root).eintraege.filter((e) => e.pfad === gleich);
    const urteilListe = SCHREIBWEISEN.map((s, i) => {
      const e = eintraege.find((x) => x.zeile === i + 3);
      if (!e) return 'ok';
      return e.grund === GRUND.DOKUMENT_FEHLT ? 'fehlt' : 'anker';
    });
    return { urteilEditor, urteilListe };
  }

  it('Datenbank an: gleiche Urteile über alle Schreibweisen', async () => {
    const { urteilEditor, urteilListe } = await vergleiche(true);
    expect(urteilListe).toEqual(urteilEditor);
    // Anker der Gleichheit: Es gibt in beiden Richtungen etwas zu vergleichen.
    expect(urteilListe.filter((u) => u === 'fehlt')).toHaveLength(1);
    // Ziel#Fehlt, Ziel#^nein, Kunden#^r-00099, Kunden#^Niemand, #Fehlt-Hier, #^fehlt.
    expect(urteilListe.filter((u) => u === 'anker')).toHaveLength(6);
  });

  it('Datenbank aus: Datensatz-Anker gelten wie im Editor als vorhanden', async () => {
    const { urteilEditor, urteilListe } = await vergleiche(false);
    expect(urteilListe).toEqual(urteilEditor);
    // Die zwei fehlenden Datensatz-Anker fallen heraus (L6 Punkt 7, Nachweis 1a).
    expect(urteilListe.filter((u) => u === 'anker')).toHaveLength(4);
  });
});

describe('Verweise ohne Ziel: Groß- und Kleinschreibung', () => {
  it('alle Plattformen: ein Wiki-Verweis in anderer Schreibung findet sein Ziel über den Namen', async () => {
    const { root, start } = bereichAnlegen();
    write(root, 'Klein.md', '[[ziel]] [[ZIEL#kapitel eins]]\n');
    await indexFor(start, root);
    expect(liste(root).eintraege.some((e) => e.pfad.endsWith('Klein.md'))).toBe(false);
  });

  it(
    isFilesystemCaseInsensitive()
      ? 'Windows und macOS: ein Markdown-Pfad in anderer Schreibung hat ein Ziel'
      : 'Linux: ein Markdown-Pfad in anderer Schreibung hat kein Ziel',
    async () => {
      const { root, start } = bereichAnlegen();
      write(root, 'Klein.md', '[a](ziel.md)\n');
      await indexFor(start, root);
      const treffer = liste(root).eintraege.filter((e) => e.pfad.endsWith('Klein.md'));
      expect(treffer.map((e) => e.grund)).toEqual(
        isFilesystemCaseInsensitive() ? [] : [GRUND.DOKUMENT_FEHLT],
      );
    },
  );
});

// Nebenbefund aus 4T-002782: Stehen gleiche Ziele mehrfach in einer Zeile,
// trägt jeder Eintrag seinen eigenen Wortlaut (vorher zweimal der erste).
describe('Verweise ohne Ziel: gleiche Ziele in einer Zeile (alle Plattformen)', () => {
  it('nennt je Stelle ihren eigenen Wortlaut, auch für die Einbettung', async () => {
    const root = makeRoot();
    const start = write(
      root,
      'Zeile.md',
      ['# Zeile', '[[Fehlt]] ![[Fehlt]] [a](Weg.md) [b](Weg.md)', ''].join('\n'),
    );
    await indexFor(start, root);
    const { eintraege } = liste(root);
    expect(kurz(root, sortiereVerweiseOhneZiel(eintraege))).toEqual([
      'Zeile.md:2 dokument-fehlt [[Fehlt]]',
      'Zeile.md:2 dokument-fehlt ![[Fehlt]]',
      'Zeile.md:2 dokument-fehlt [a](Weg.md)',
      'Zeile.md:2 dokument-fehlt [b](Weg.md)',
    ]);
  });

  // Zweitblick Runde 3 zu 4T-002783, Hinweis 1: Auf Dateisystemen ohne
  // Unterscheidung der Groß- und Kleinschreibung gilt `weg.md` als dasselbe
  // Ziel wie `Weg.md`; die Zählung muss ebenso vergleichen wie die Suche.
  it('zählt Markdown-Ziele so, wie die Wortlaut-Suche sie vergleicht', async () => {
    const root = makeRoot();
    const start = write(root, 'Fall.md', ['# Fall', '[a](Weg.md) [b](weg.md)', ''].join('\n'));
    await indexFor(start, root);
    const { eintraege } = liste(root);
    expect(kurz(root, sortiereVerweiseOhneZiel(eintraege))).toEqual([
      'Fall.md:2 dokument-fehlt [a](Weg.md)',
      'Fall.md:2 dokument-fehlt [b](weg.md)',
    ]);
  });
});

// Zweitblick zu 4T-002782, Befund 1: Verweise auf Anlagen gehören der
// Anlagen-Pflege (L1 = A, L6 Punkt 9). Runde 2, Befund 3: Als Anlage gilt eine
// Endung der Wiki-Einbettung (Bild, PDF) oder eine, die im Bereich an einer
// Nicht-Markdown-Datei vorkommt; jede andere Endung wird wie im Editor als
// Dokument beurteilt.
describe('Verweise ohne Ziel: Anlagen (alle Plattformen)', () => {
  it('lässt Verweise und Einbettungen auf fehlende Anlagen aus, fehlende Dokumente bleiben', async () => {
    const root = makeRoot();
    // Keine Bild-Datei im Bereich; eine Tabelle, damit `xlsx` als Anlage gilt.
    write(root, 'Plan.pdf', 'pdf');
    write(root, 'Vorhanden.xlsx', 'xlsx');
    const start = write(
      root,
      'Anlagen.md',
      [
        '# Anlagen',
        '[[Vertrag.pdf]] ![[fehlt.png]] [[Tabelle.xlsx#Blatt]] [[/Skizze.svg]]',
        '[[Plan.pdf]] [[Fehlt-Doku.md]] [[Fehlt-Doku]] [p](fehlt.pdf) ![b](fehlt.png)',
        '[[@zt:Bild.png]] [[@zt:Dok]]',
        '[[Version 1.2]] [[Protokoll 22.11]] [[Bericht.docx]]',
        '',
      ].join('\n'),
    );
    write(
      root,
      'Karte.md',
      ['# Karte', `${T}perspective-canvas`, '!karte k1 x=0 y=0 doc="Plan-Fehlt.pdf"', T, ''].join(
        '\n',
      ),
    );
    await indexFor(start, root);
    const { eintraege, verknuepfungen } = liste(root);
    expect(kurz(root, sortiereVerweiseOhneZiel(eintraege))).toEqual([
      'Anlagen.md:3 dokument-fehlt [[Fehlt-Doku.md]]',
      'Anlagen.md:3 dokument-fehlt [[Fehlt-Doku]]',
      'Anlagen.md:5 dokument-fehlt [[Version 1.2]]',
      'Anlagen.md:5 dokument-fehlt [[Protokoll 22.11]]',
      'Anlagen.md:5 dokument-fehlt [[Bericht.docx]]',
    ]);
    expect(verknuepfungen.map((v) => v.verweis)).toEqual(['[[@zt:Dok]]']);
  });

  // Zweitblick Runde 3, Befund 1: Die PDF gilt als Anlage, auch wenn der
  // Bereich keine PDF-Datei enthält.
  it('lässt eine fehlende PDF auch in einem Bereich ohne PDF-Datei aus', async () => {
    const root = makeRoot();
    const start = write(
      root,
      'Ohne-Pdf.md',
      ['# Ohne PDF', '[[Vertrag.pdf]] ![[Vertrag.pdf]] [[Fehlt-Doku]]', ''].join('\n'),
    );
    await indexFor(start, root);
    const { eintraege } = liste(root);
    expect(kurz(root, sortiereVerweiseOhneZiel(eintraege))).toEqual([
      'Ohne-Pdf.md:2 dokument-fehlt [[Fehlt-Doku]]',
    ]);
  });
});

// Zweitblick zu 4T-002782, Befund 2: die Form in spitzen Klammern mit
// Leerzeichen.
describe('Verweise ohne Ziel: Markdown-Anker im selben Dokument mit Leerzeichen (alle Plattformen)', () => {
  it('erfasst und beurteilt `[t](<#Abschnitt Zwei>)`', async () => {
    const root = makeRoot();
    const start = write(
      root,
      'Leer.md',
      [
        '# Leer',
        '## Abschnitt Zwei',
        '[a](<#Abschnitt Zwei>) [b](<#Fehlt Hier>) [c](#abschnitt-zwei "Titel") [d](<#Abschnitt%20Zwei>)',
        '',
      ].join('\n'),
    );
    await indexFor(start, root);
    expect(kurz(root, liste(root).eintraege)).toEqual([
      'Leer.md:3 ueberschrift-fehlt [b](<#Fehlt Hier>)',
    ]);
  });
});

// Zweitblick zu 4T-002782, Befund 3: Ist eine Block-Erweiterung aus, ist ihr
// Block gewöhnlicher Code und wird nicht beurteilt (Folge-Festlegung zu L6
// Punkt 5). Der Wiki-Verweis im Fließtext bleibt, auch auf einer Zeile, die wie
// eine Angabe oder Kachel aussieht.
describe('Verweise ohne Ziel: Schalter der Block-Erweiterungen (alle Plattformen)', () => {
  it('lässt Canvas-Karte, Kachel und Diagramm-Angabe je nach Schalter aus', async () => {
    const { root, start } = bereichAnlegen();
    write(root, 'Fliesstext.md', '# F\ntable: [[Daten#^auch-fehlt]]\n!kachel [[Fehlt-Im-Text]]\n');
    await indexFor(start, root);
    const bloecke = (optionen) =>
      kurz(root, sortiereVerweiseOhneZiel(liste(root, optionen).eintraege)).filter((z) =>
        /^(Bericht|Flaeche|Lage|Fliesstext)\.md/.test(z),
      );
    const alle = [
      'Bericht.md:5 block-anker-fehlt [[Daten#^fehlt]]',
      'Flaeche.md:5 dokument-fehlt doc="Fehlt-Karte"',
      'Fliesstext.md:2 block-anker-fehlt [[Daten#^auch-fehlt]]',
      'Fliesstext.md:3 dokument-fehlt [[Fehlt-Im-Text]]',
      'Lage.md:5 dokument-fehlt abfrage=Fehlt-Abfrage',
    ];
    expect(bloecke({})).toEqual(alle);
    expect(bloecke({ canvasAktiv: false })).toEqual(alle.filter((z) => !z.startsWith('Flaeche')));
    expect(bloecke({ dashboardAktiv: false })).toEqual(alle.filter((z) => !z.startsWith('Lage')));
    expect(bloecke({ diagrammeAktiv: false })).toEqual(
      alle.filter((z) => !z.startsWith('Bericht')),
    );
  });
});

// Entscheidung der steuernden Sitzung nach Runde 1: Text-Zellen einer
// Datentabelle sind im Aus-Zustand der Datentabelle gewöhnlicher Code, wie die
// Blöcke aus Befund 3. Das gilt für jede Verweis-Art aus einer Zelle.
describe('Verweise ohne Ziel: Text-Zellen einer Datentabelle (alle Plattformen)', () => {
  it('lässt Verweise aus Text-Zellen bei ausgeschalteter Datentabelle aus, Fließtext bleibt', async () => {
    const root = makeRoot();
    const start = write(
      root,
      'Tabelle.md',
      [
        '# Tabelle', // 1
        `${T}perspective-datatable`, // 2
        'columns: Name:text, Notiz:text', // 3
        '| [[Fehlt-Zelle]] | [z](Fehlt-Zelle.md) |', // 4
        '| [[#Fehlt-Zelle-Anker]] | [[@zt:Zelle]] |', // 5
        T, // 6
        '[[Fehlt-Text]] [[#Fehlt-Text-Anker]] [[@zt:Text]]', // 7
        '',
      ].join('\n'),
    );
    await indexFor(start, root);
    const an = liste(root);
    expect(kurz(root, an.eintraege)).toEqual([
      'Tabelle.md:4 dokument-fehlt [[Fehlt-Zelle]]',
      'Tabelle.md:4 dokument-fehlt [z](Fehlt-Zelle.md)',
      'Tabelle.md:7 dokument-fehlt [[Fehlt-Text]]',
      'Tabelle.md:5 ueberschrift-fehlt [[#Fehlt-Zelle-Anker]]',
      'Tabelle.md:7 ueberschrift-fehlt [[#Fehlt-Text-Anker]]',
    ]);
    expect(an.verknuepfungen.map((v) => v.verweis)).toEqual(['[[@zt:Zelle]]', '[[@zt:Text]]']);
    const aus = liste(root, { datentabelleAktiv: false });
    expect(kurz(root, aus.eintraege)).toEqual([
      'Tabelle.md:7 dokument-fehlt [[Fehlt-Text]]',
      'Tabelle.md:7 ueberschrift-fehlt [[#Fehlt-Text-Anker]]',
    ]);
    expect(aus.verknuepfungen.map((v) => v.verweis)).toEqual(['[[@zt:Text]]']);
  });
});

// Zweitblick zu 4T-002782, Befund 5: Ein geteiltes Dokument prüft der Editor
// zusammengesetzt unter dem Pfad der Kopf-Datei; die Liste urteilt für jeden
// Teil so wie er für das ganze Dokument.
describe('Verweise ohne Ziel: geteilte Dokumente wie im Editor (alle Plattformen)', () => {
  it('urteilt im Folgeteil über Anker und Unterseiten-Form wie der Editor-Kern', async () => {
    const root = makeRoot();
    const kopf = write(
      root,
      'Gross.md',
      ['# Kopf-Abschnitt', '[[#Kopf-Abschnitt]] [[#Teil-Abschnitt]] [[/Unter]]', ''].join('\n'),
    );
    write(
      root,
      'Gross•part-00002.md',
      [
        '## Teil-Abschnitt',
        '[[#Kopf-Abschnitt]] [[#Teil-Abschnitt]] [[/Unter]] [[/Fehlt-Unten]] [u](<#Kopf-Abschnitt>)',
        '',
      ].join('\n'),
    );
    write(root, 'Gross∕Unter.md', '# Unter\n');
    await indexFor(kopf, root);
    // Der Editor fragt für das ganze Dokument unter dem Pfad der Kopf-Datei.
    const fragen = ['#Kopf-Abschnitt', '#Teil-Abschnitt', '/Unter', '/Fehlt-Unten'];
    const editor = existingWikiTargets(kopf, fragen, root);
    expect(editor.status).toBe('ready');
    const editorFehlt = fragen.filter((f) => !editor.existing.includes(f));
    const teil = liste(root)
      .eintraege.filter((e) => e.pfad.endsWith('part-00002.md'))
      .map((e) => e.verweis.replace(/^\[\[|\]\]$/g, ''))
      .sort();
    expect(teil).toEqual(editorFehlt.sort());
    // Festgehalten, welche das sind: Die Überschrift im Folgeteil kennt die
    // Prüfung der Kopf-Datei nicht (gemeinsame Grenze von Editor und Liste).
    expect(teil).toEqual(['#Teil-Abschnitt', '/Fehlt-Unten']);
  });
});

describe('Verweise ohne Ziel: Sortierung (alle Plattformen)', () => {
  it('ordnet nach Dokument-Name, dann Pfad, dann Zeile', () => {
    const e = (name, pfad, zeile) => ({ name, pfad, zeile, verweis: 'v', grund: 'g' });
    const sortiert = sortiereVerweiseOhneZiel([
      e('Beta', '/b/Beta.md', 2),
      e('Alpha', '/z/Alpha.md', 9),
      e('Beta', '/b/Beta.md', 1),
      e('Alpha', '/a/Alpha.md', 30),
    ]);
    expect(sortiert.map((x) => `${x.pfad}:${x.zeile}`)).toEqual([
      '/a/Alpha.md:30',
      '/z/Alpha.md:9',
      '/b/Beta.md:1',
      '/b/Beta.md:2',
    ]);
  });
});

describe('parseContent: zwei eigene Felder (alle Plattformen)', () => {
  const datei = path.join(os.tmpdir(), 'em4me-feld', 'Notiz.md');

  it('erfasst Anker im selben Dokument und Verweise in verknüpfte Bereiche mit Zeile und Wortlaut', () => {
    const r = parseContent(
      datei,
      [
        '# Notiz',
        '[[#Ziel]] ![[#^blk]] [t](#abschnitt) [u](<#zwei>) ![bild](#nein) [v](<#Mit Leerzeichen>) [w](#titel "Titel")',
        '[[@zt:Da]] [[@zt:Da#Kap|Text]]',
        '`[[#Code]]` `[[@zt:Code]]`',
        T,
        '[[#Fence]] [x](#fence)',
        T,
        '',
      ].join('\n'),
    );
    expect(r.eigenAnkerVerweise).toEqual([
      { zeile: 2, wortlaut: '[[#Ziel]]', anker: 'Ziel', art: 'wiki' },
      { zeile: 2, wortlaut: '![[#^blk]]', anker: '^blk', art: 'wiki' },
      { zeile: 2, wortlaut: '[t](#abschnitt)', anker: 'abschnitt', art: 'md' },
      { zeile: 2, wortlaut: '[u](<#zwei>)', anker: 'zwei', art: 'md' },
      { zeile: 2, wortlaut: '[v](<#Mit Leerzeichen>)', anker: 'Mit Leerzeichen', art: 'md' },
      { zeile: 2, wortlaut: '[w](#titel "Titel")', anker: 'titel', art: 'md' },
    ]);
    expect(r.verknuepfungsVerweise).toEqual([
      { zeile: 3, wortlaut: '[[@zt:Da]]', prefix: 'zt', ziel: 'Da' },
      { zeile: 3, wortlaut: '[[@zt:Da#Kap|Text]]', prefix: 'zt', ziel: 'Da#Kap' },
    ]);
  });

  it('führt die Herkunft aus Kachel, Diagramm-Angabe und Text-Zellen nach der Zeile', () => {
    const r = parseContent(
      datei,
      [
        '# Notiz',
        `${T}perspective-dashboard`,
        '!kachel liste abfrage="Offen"',
        T,
        `${T}perspective-chart`,
        'table: [[Daten#^umsatz]]',
        T,
        'table: [[Daten#^text]]',
        `${T}perspective-datatable`,
        'columns: Name:text, Betrag:number',
        '| [[Zelle]] | 1 |',
        '| ohne Verweis | 2 |',
        '| [[#Anker]] | 3 |',
        T,
        '',
      ].join('\n'),
    );
    expect(r.blockVerweise).toEqual([
      { zeile: 3, art: 'kachel' },
      { zeile: 6, art: 'diagramm' },
      { zeile: 11, art: 'datentabelle' },
      { zeile: 13, art: 'datentabelle' },
    ]);
    expect(r.hits.map((h) => h.zeile)).toEqual([3, 6, 8, 11]);
  });

  it('lässt die Verweis-Treffer unverändert (Rückverweise, Verweis-Netz, Verweis-Zahlen)', () => {
    const ohne = parseContent(datei, '# Notiz\n[[Ziel]] [a](Ziel.md)\n');
    const mit = parseContent(
      datei,
      '# Notiz\n[[Ziel]] [a](Ziel.md) [[#Notiz]] [b](#notiz) [[@zt:Ziel]]\n',
    );
    const ohneAusschnitt = (hits) => hits.map(({ snippet: _s, ...rest }) => rest);
    expect(ohneAusschnitt(mit.hits)).toEqual(ohneAusschnitt(ohne.hits));
    expect(ohne.eigenAnkerVerweise).toEqual([]);
    expect(ohne.verknuepfungsVerweise).toEqual([]);
  });

  it('am Index: Verweis-Zahlen und Rückverweise bleiben durch die Felder unberührt', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Ziel.md', '# Ziel\n');
    write(root, 'Quelle.md', '# Quelle\n[[Ziel]] [[#Quelle]] [q](#quelle) [[@zt:Ziel]]\n');
    await indexFor(ziel, root);
    const zahlen = statsFor(root, {}).verweise;
    expect(zahlen.wiki).toBe(1);
    expect(zahlen.markdown).toBe(0);
    const rueck = backlinksFor(ziel, 'test:ohne-ziel', root);
    expect(rueck.status).toBe('ready');
    expect(JSON.stringify(rueck)).toContain('Quelle.md');
    expect(statsFor(root, {}).verweiseOhneZiel).toBeUndefined();
  });
});
