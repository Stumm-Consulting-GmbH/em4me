// 4T-002386 (Epic 3E-000265, Schritt 4; Story AK3, AK4): Die Tabellen-Datei
// einer Tabelle in Kartei-Form (`storage: cards`) braucht keinen
// Datensatz-Körper, und ein Datensatz-Block in ihr trägt keine Datensätze.
//
// **Eine eigene Prüfdatei**, weil die Prüfdateien der berührten Module an ihrem
// Größen-Budget stehen. Die Fälle folgen dem Weg einer Datei durch die
// Anwendung: Anzeige des Blocks mit dem Hinweis, Konsistenz-Prüfung mit dem
// Befund, Erfassung im Index, Lesen der Datensatz-Ebene und der Zwischen-Schutz
// der Schreib-Schnittstelle bis 4T-002389.
//
// **Echtes Dateisystem in temporären Ordnern**, wie die Prüfdateien der
// Konsistenz-Prüfung und der Schreib-Schnittstelle; für das Lesen der
// Datensatz-Ebene dazu ein echter Bereichs-Index (Muster
// `record-table-read.test.js`). Seit 4T-002387 (Schnitt C) dazu der Hinweis
// auf ein Profil-Feld mit anderem Typ als die Tabelle, über den echten Zugang
// zu den Profil-Feldern mit einem Profil-Ordner im temporären Bereich.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { renderMarkdown, configureExtensions } from '../../src/shared/markdown/markdown.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { parseTableDefinition } from '../../src/shared/database/table-definition.js';
import {
  KONSISTENZ_BEFUNDE,
  pruefeKonsistenz,
} from '../../src/main/database/konsistenz-pruefung.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';
import { readRecordTable, clearCaches } from '../../src/main/index/record-table-read.js';
import { erzeugeProfilFelderZugang } from '../../src/main/documents/profil-felder.js';
import { karteikartenWerte, feldTextVon } from '../../src/shared/database/karteikarte.js';

const require_ = createRequire(import.meta.url);
const { erfasseDatensaetze, definitionAusText, vergissAlleDefinitionen } = require_(
  '../../src/main/index/datensatz-erfassung.js',
);

// --- Aufbau ----------------------------------------------------------------------------------

let tmpDirs = [];
const openRoots = new Set();

afterEach(() => {
  configureExtensions([]);
  vergissAlleDefinitionen();
  clearCaches();
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

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Der Dateikopf einer Tabelle mit zwei Feldern, auf Wunsch in Kartei-Form.
function kopf({ kartei = true, zusatz = [] } = {}) {
  return [
    '---',
    ...zusatz,
    'db-table:',
    ...(kartei ? ['  storage: cards'] : []),
    '  fields:',
    '    - name: name',
    '      required: true',
    '    - name: ort',
    '  key: name',
    '  lastId: 2',
    '---',
  ];
}

// Ein Datensatz-Block, wie ihn die Tabellen-Form führt. Der zweite Datensatz
// trägt dieselbe Kennung und lässt das Pflichtfeld leer: In der Tabellen-Form
// wären das drei Befunde, in der Kartei-Form ist es keiner.
const BLOCK = [
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '',
  '|- id="r-00001"',
  '|',
  '| Bern',
  '```',
];

function karteiMitBlock(optionen) {
  return [...kopf(optionen), '', 'Einleitender Text.', '', ...BLOCK, ''].join('\n');
}

function karteiMitText() {
  return [...kopf(), '', 'Autoren des Verlags, je Autor eine Karteikarte.', ''].join('\n');
}

// Die 1-basierte Zeile des öffnenden Zauns, am Text gemessen statt abgezählt.
function zaunZeile(text) {
  return text.split('\n').indexOf('```perspective-records') + 1;
}

// --- Hinweis in der Anzeige des Blocks (Story AK3, AK4) ---------------------------------------

describe('Kartei-Form: Hinweis am Datensatz-Block (4T-002386, AK4, AK5)', () => {
  it('meldet einen Datensatz-Block in einer Kartei-Tabelle in jeder Sprache als Satz', () => {
    const de = renderMarkdown(karteiMitBlock(), 'de');
    expect(de).toContain('data-rec-code="recordStorageCards"');
    expect(de).toContain('Die Tabelle legt in Kartei-Form ab (storage: cards)');
    const en = renderMarkdown(karteiMitBlock(), 'en');
    expect(en).toContain('The table is stored as a card index (storage: cards)');
    expect(en).not.toContain('database.hint.recordStorageCards');
  });

  it('meldet freien Text in einer Kartei-Tabelle nirgends', () => {
    const text = karteiMitText();
    expect(parseTableDefinition(extractFrontmatter(text).data)).toMatchObject({
      storage: 'cards',
      hints: [],
    });
    const html = renderMarkdown(text, 'de');
    expect(html).not.toContain('recordStorageCards');
    expect(html).not.toContain('prc-hints');
    expect(html).toContain('Autoren des Verlags');
  });

  it('lässt den Datensatz-Block einer Tabelle in Tabellen-Form ohne den Hinweis', () => {
    const html = renderMarkdown(karteiMitBlock({ kartei: false }), 'de');
    expect(html).toContain('class="perspective-records"');
    expect(html).not.toContain('recordStorageCards');
  });
});

// --- Befund der Konsistenz-Prüfung (Story AK4) ------------------------------------------------

const NUR_LESEN = { readFile: (...args) => fs.promises.readFile(...args) };

function sicht(tabellen) {
  return { dbKindsPerFile: new Map(tabellen.map((p) => [p, ['table']])) };
}

describe('Kartei-Form: Befund der Konsistenz-Prüfung (4T-002386, AK5)', () => {
  it('meldet den Block mit Datei und Zeile und prüft seine Zeilen nicht als Datensätze', async () => {
    const wurzel = bereich();
    const text = karteiMitBlock();
    const pfad = lege(wurzel, 'Autoren.md', text);
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sicht([pfad]),
    });
    expect(ergebnis.status).toBe('ready');
    expect(ergebnis.befunde.map((b) => b.code)).toEqual([KONSISTENZ_BEFUNDE.karteiMitDatensaetzen]);
    expect(ergebnis.befunde[0]).toMatchObject({
      code: 'konsistenzKarteiMitDatensaetzen',
      tabelle: 'Autoren',
      pfad,
      datei: pfad,
      zeile: zaunZeile(text),
      id: null,
    });
    expect(ergebnis.tabellen).toEqual([{ name: 'Autoren', pfad, datensaetze: 0, befunde: 1 }]);
  });

  it('findet an einer Kartei-Tabelle mit freiem Text keinen Befund', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Autoren.md', karteiMitText());
    const ergebnis = await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht: sicht([pfad]) });
    expect(ergebnis.befunde).toEqual([]);
    expect(ergebnis.tabellen[0].datensaetze).toBe(0);
  });

  it('lässt einen Verweis auf eine Zeile des Blocks ins Leere gehen', async () => {
    const wurzel = bereich();
    const autoren = lege(wurzel, 'Autoren.md', karteiMitBlock());
    const buecher = lege(
      wurzel,
      'Buecher.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: titel',
        '    - name: autor',
        '      type: record',
        '      options:',
        '        table: Autoren',
        '  lastId: 1',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Faust',
        '| r-00001',
        '```',
        '',
      ].join('\n'),
    );
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sicht([autoren, buecher]),
    });
    expect(ergebnis.befunde.map((b) => b.code).sort()).toEqual(
      [KONSISTENZ_BEFUNDE.karteiMitDatensaetzen, KONSISTENZ_BEFUNDE.verweisZielFehlt].sort(),
    );
  });
});

// --- Befunde der Karteikarten (4T-002387, Story 4S-001114 AK4, AK5) ----------------------------

// Eine Sicht, die zusätzlich die Markdown-Dokumente des Bereichs führt, wie
// `files` des Index; Masken und Abfragen bleiben ungemarkt, damit allein die
// Erkennung sie ausschließt.
function sichtMitDokumenten(tabellen, dokumente) {
  return {
    dbKindsPerFile: new Map(tabellen.map((p) => [p, ['table']])),
    files: new Map([...tabellen, ...dokumente].map((p) => [p, []])),
  };
}

function karte(kopfzeilen) {
  return ['---', ...kopfzeilen, '---', '', 'Freier Text.', ''].join('\n');
}

function ordner(wurzel, name) {
  const pfad = path.join(wurzel, name);
  fs.mkdirSync(pfad, { recursive: true });
  return pfad;
}

const CODES = (ergebnis) => ergebnis.befunde.map((b) => b.code);

describe('Kartei-Form: Befunde der Karteikarten (4T-002387, AK2, AK3)', () => {
  it('meldet das Dokument ohne Kennung und keine andere Datei des Ordners', async () => {
    const wurzel = bereich();
    const tabelle = lege(wurzel, 'Autoren.md', karteiMitText());
    const dokumente = [
      lege(wurzel, 'Ada Lovelace.md', karte(['db-record: r-00001', 'name: Ada'])),
      lege(wurzel, 'Alan Turing.md', karte(['db-record: r-00002', 'name: Alan'])),
      lege(wurzel, 'Notiz.md', karte(['name: Notiz'])),
      lege(wurzel, 'Buecher.md', [...kopf({ kartei: false }), ''].join('\n')),
      lege(wurzel, 'Autoren Form.md', karte(['db-form:', '  table: Autoren'])),
      lege(wurzel, 'Autoren Liste.md', karte(['db-query:'])),
      lege(wurzel, 'Datenbank.md', karte(['db-database:', '  name: Verlag'])),
      lege(wurzel, 'Ada Lovelace•part-00002.md', karte(['doc-part: v1|2|Ada Lovelace'])),
      lege(ordner(wurzel, 'Anhang'), 'Skizze.md', karte(['name: Skizze'])),
    ];
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([tabelle], dokumente),
    });
    expect(CODES(ergebnis)).toEqual([KONSISTENZ_BEFUNDE.karteiOhneKennung]);
    expect(ergebnis.befunde[0]).toMatchObject({
      tabelle: 'Autoren',
      pfad: tabelle,
      datei: path.join(wurzel, 'Notiz.md'),
      wert: 'Notiz',
      grund: null,
      id: null,
    });
    // 4T-002389: Die beiden Karteikarten zählen seit dem Schreibweg als
    // Datensätze der Tabelle, weil der Bestand sie führt.
    expect(ergebnis.tabellen).toEqual([
      { name: 'Autoren', pfad: tabelle, datensaetze: 2, befunde: 1 },
    ]);
  });

  it('meldet eine unbrauchbare Kennung mit eigenem Code', async () => {
    const wurzel = bereich();
    const tabelle = lege(wurzel, 'Autoren.md', karteiMitText());
    const notiz = lege(wurzel, 'Notiz.md', karte(['db-record: abc']));
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([tabelle], [notiz]),
    });
    expect(ergebnis.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.karteiKennungUnbrauchbar,
        datei: notiz,
        wert: 'Notiz',
      }),
    ]);
  });

  // 4T-002405 (Epic 3E-000266, F2 A, AK4): Dateiname und Schlüssel sind zwei
  // Werte. Nach dem Umbenennen heißt die Datei anders als ihr Schlüssel; das
  // ist ein erlaubter Zustand und kein Befund.
  it('meldet nichts, wenn Dateiname und Schlüssel einer Karteikarte auseinanderlaufen', async () => {
    const wurzel = bereich();
    const tabelle = lege(wurzel, 'Autoren.md', karteiMitText());
    const dokumente = [
      lege(wurzel, 'Ada King.md', karte(['db-record: r-00001', 'name: Ada Lovelace'])),
      lege(wurzel, 'Alan Turing.md', karte(['db-record: r-00002', 'name: Alan Turing'])),
    ];
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([tabelle], dokumente),
    });
    expect(ergebnis.befunde).toEqual([]);
    expect(ergebnis.tabellen).toEqual([
      { name: 'Autoren', pfad: tabelle, datensaetze: 2, befunde: 0 },
    ]);
  });

  it('meldet eine Kennung, die zwei Karteikarten tragen, an beiden', async () => {
    const wurzel = bereich();
    const tabelle = lege(wurzel, 'Autoren.md', karteiMitText());
    const ada = lege(wurzel, 'Ada.md', karte(['db-record: r-00001']));
    const alan = lege(wurzel, 'Alan.md', karte(['db-record: r-1']));
    const cara = lege(wurzel, 'Cara.md', karte(['db-record: r-00003']));
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([tabelle], [ada, alan, cara]),
    });
    const gemeinsam = {
      code: KONSISTENZ_BEFUNDE.kennungDoppelt,
      tabelle: 'Autoren',
      pfad: null,
      id: 'r-00001',
      kennungen: ['r-00001'],
    };
    // 4T-002389: Die Karteikarten ohne Wert im Pflicht-Feld melden seit dem
    // Schreibweg zusätzlich die fehlende Pflicht-Angabe; hier zählt die Dublette.
    const dubletten = ergebnis.befunde.filter((b) => b.code === KONSISTENZ_BEFUNDE.kennungDoppelt);
    expect(dubletten).toEqual([
      expect.objectContaining({ ...gemeinsam, datei: ada, anzeige: 'Ada' }),
      expect.objectContaining({ ...gemeinsam, datei: alan, anzeige: 'Alan' }),
    ]);
  });

  it('meldet zwei Kartei-Tabellen im selben Ordner an beiden und prüft die Dokumente nicht', async () => {
    const wurzel = bereich();
    const autoren = lege(wurzel, 'Autoren.md', karteiMitText());
    const verlage = lege(wurzel, 'Verlage.md', karteiMitText());
    const dokumente = [
      lege(wurzel, 'Ada.md', karte(['db-record: r-00001'])),
      lege(wurzel, 'Alan.md', karte(['db-record: r-00001'])),
      lege(wurzel, 'Notiz.md', karte(['name: Notiz'])),
    ];
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([autoren, verlage], dokumente),
    });
    expect(ergebnis.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.karteiOrdnerMehrdeutig,
        tabelle: 'Autoren',
        datei: autoren,
        zieltabelle: 'Verlage',
      }),
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.karteiOrdnerMehrdeutig,
        tabelle: 'Verlage',
        datei: verlage,
        zieltabelle: 'Autoren',
      }),
    ]);
    expect(ergebnis.tabellen.map((t) => t.befunde)).toEqual([1, 1]);
  });

  it('lässt eine Tabelle in Tabellen-Form im Ordner aus der Mehrdeutigkeit', async () => {
    const wurzel = bereich();
    const autoren = lege(wurzel, 'Autoren.md', karteiMitText());
    const buecher = lege(wurzel, 'Buecher.md', [...kopf({ kartei: false }), ''].join('\n'));
    const notiz = lege(wurzel, 'Notiz.md', karte(['name: Notiz']));
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([autoren, buecher], [notiz]),
    });
    expect(CODES(ergebnis)).toEqual([KONSISTENZ_BEFUNDE.karteiOhneKennung]);
    expect(ergebnis.befunde[0].tabelle).toBe('Autoren');
  });

  it('prüft Dokumente im Ordner einer Tabelle in Tabellen-Form nicht als Karteikarten', async () => {
    const wurzel = bereich();
    const buecher = lege(wurzel, 'Buecher.md', [...kopf({ kartei: false }), ''].join('\n'));
    const notiz = lege(wurzel, 'Notiz.md', karte(['name: Notiz']));
    const ergebnis = await pruefeKonsistenz({
      fsp: NUR_LESEN,
      wurzel,
      sicht: sichtMitDokumenten([buecher], [notiz]),
    });
    expect(ergebnis.befunde).toEqual([]);
  });

  it('übergeht Dokumente im Vorlagen-Ordner', async () => {
    const wurzel = bereich();
    const vorlagen = ordner(wurzel, 'Vorlagen');
    const tabelle = lege(vorlagen, 'Autoren.md', karteiMitText());
    const notiz = lege(vorlagen, 'Notiz.md', karte(['name: Notiz']));
    const sicht = sichtMitDokumenten([tabelle], [notiz]);
    const mit = await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht, vorlagenOrdner: vorlagen });
    expect(mit.befunde).toEqual([]);
    const ohne = await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht, vorlagenOrdner: null });
    expect(CODES(ohne)).toEqual([KONSISTENZ_BEFUNDE.karteiOhneKennung]);
  });
});

// --- Abweichender Typ eines Profil-Feldes (4T-002387, Schnitt C, AK6) -------------------------

// Ein Bereich mit Profil-Ordner und dem Profil «Person», das `ort` mit dem
// angegebenen Typ führt; der Zugang ist derselbe wie im Kanal der Prüfung.
async function profilZugang(wurzel, typ) {
  const profile = ordner(wurzel, 'Profile');
  lege(profile, 'Person.md', karte(['fields:', '  - name: Ort', `    type: ${typ}`]));
  const zugang = erzeugeProfilFelderZugang({
    readAreaProfilesConfig: async () => ({ folder: 'Profile' }),
  });
  return zugang(wurzel);
}

// Eine Kartei-Tabelle mit einer Karteikarte, die das Profil «Person» zuordnet.
function karteMitProfil(wurzel) {
  const tabelle = lege(wurzel, 'Autoren.md', karteiMitText());
  const ada = lege(
    wurzel,
    'Ada Lovelace.md',
    karte(['db-record: r-00001', 'class: Person', 'name: Ada', 'ort: London']),
  );
  return { tabelle, ada, sicht: sichtMitDokumenten([tabelle], [ada]) };
}

describe('Kartei-Form: abweichender Typ eines Profil-Feldes (4T-002387, AK6)', () => {
  it('bleibt bei gleichem Typ still', async () => {
    const wurzel = bereich();
    const { sicht } = karteMitProfil(wurzel);
    const profilFelder = await profilZugang(wurzel, 'string');
    const ergebnis = await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht, profilFelder });
    expect(ergebnis.befunde).toEqual([]);
  });

  it('meldet einen anderen Typ mit Feld, Profil und beiden Typen', async () => {
    const wurzel = bereich();
    const { tabelle, ada, sicht } = karteMitProfil(wurzel);
    const profilFelder = await profilZugang(wurzel, 'number');
    const ergebnis = await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht, profilFelder });
    expect(ergebnis.befunde).toEqual([
      expect.objectContaining({
        code: KONSISTENZ_BEFUNDE.karteiProfilTypAbweichend,
        tabelle: 'Autoren',
        pfad: tabelle,
        datei: ada,
        wert: 'Ada Lovelace',
        feld: 'ort',
        profil: 'Person',
        typTabelle: 'string',
        typProfil: 'number',
      }),
    ]);
    // Die Datenbank liest weiter nach der Tabelle: `ort` bleibt Text.
    const definition = parseTableDefinition(extractFrontmatter(karteiMitText()).data);
    const frontmatter = extractFrontmatter(fs.readFileSync(ada, 'utf8')).data;
    expect(feldTextVon(karteikartenWerte(frontmatter, definition), 'ort')).toBe('London');
  });

  it('prüft ohne Zugang zu den Profilen und ohne wirksame Profile keine Typen', async () => {
    const wurzel = bereich();
    const { sicht } = karteMitProfil(wurzel);
    await profilZugang(wurzel, 'number');
    const ohne = await pruefeKonsistenz({ fsp: NUR_LESEN, wurzel, sicht });
    expect(ohne.befunde).toEqual([]);
    // Ohne Profil-Ordner wirkt allein das interne Profil «Ereignis»; ist auch
    // seine Erweiterung aus, gibt es keine Profile und keinen Zugang.
    const ohneOrdner = erzeugeProfilFelderZugang({
      readAreaProfilesConfig: async () => undefined,
      getStore: () => ({ get: () => ['events'] }),
    });
    expect(await ohneOrdner(wurzel)).toBe(null);
  });
});

// --- Erfassung im Index und Lesen der Datensatz-Ebene (Story AK4) -----------------------------

// Ein Folge-Segment, wie es die Teilung schreibt: Zuordnungs-Zeile im Kopf,
// der Rumpf beginnt mit einem Datensatz-Marker.
const SEGMENT = [
  '---',
  'doc-part: v1|2|Autoren',
  '---',
  '|- id="r-00003"',
  '| Cara',
  '| Chur',
  '```',
  '',
].join('\n');

describe('Kartei-Form: keine Datensätze im Index (4T-002386, AK5)', () => {
  it('erfasst aus dem Block einer Kartei-Tabelle nichts, in der Tabellen-Form schon', () => {
    expect(erfasseDatensaetze(karteiMitBlock(), null)).toBeNull();
    const tabelle = erfasseDatensaetze(karteiMitBlock({ kartei: false }), null);
    expect(tabelle.records.map((r) => r.id)).toEqual(['r-00001', 'r-00001']);
  });

  it('erfasst auch aus einem Folge-Segment nichts, das die Kartei-Form erbt', () => {
    const kartei = definitionAusText(karteiMitBlock({ zusatz: ['doc-part: v1|1|Autoren'] }));
    const tabelle = definitionAusText(
      karteiMitBlock({ kartei: false, zusatz: ['doc-part: v1|1|Autoren'] }),
    );
    expect(erfasseDatensaetze(SEGMENT, kartei)).toBeNull();
    expect(erfasseDatensaetze(SEGMENT, tabelle).records.map((r) => r.id)).toEqual(['r-00003']);
    // Die Signatur wechselt mit der Form, damit ein zwischengespeichertes
    // Segment nach dem Umstellen neu gelesen wird.
    expect(kartei.signatur).not.toBe(tabelle.signatur);
  });

  it('liefert beim Lesen der Datensatz-Ebene eine leere Liste mit unveränderter Definition', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Autoren.md', karteiMitBlock());
    let antwort = backlinksFor(pfad);
    openRoots.add(rootForActiveFile(pfad));
    for (let i = 0; i < 500 && antwort.status === 'indexing'; i++) {
      await new Promise((fertig) => setTimeout(fertig, 10));
      antwort = backlinksFor(pfad);
    }
    expect(antwort.status).toBe('ready');
    const tabelle = readRecordTable(rootForActiveFile(pfad), 'Autoren');
    expect(tabelle.records).toEqual([]);
    expect(tabelle.byId.size).toBe(0);
    expect(tabelle.definition.fields.map((f) => f.name)).toEqual(['name', 'ort']);
    expect(tabelle.definition.key).toEqual(['name']);
  });
});

// --- Zwischen-Schutz der Schreib-Schnittstelle (Story AK4; seit 4T-002389 nur noch Teile) -----

function schnittstelle() {
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-10-25T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
  });
}

describe('Kartei-Form: Zwischen-Schutz der Schreib-Schnittstelle (4T-002386, AK5)', () => {
  // 4T-002389: Ein Anlegen ohne Angabe der Karteikarte hat keine Ziel-Datei.
  it('weist ein Anlegen ohne Angabe der Karteikarte ab und schreibt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Autoren.md', karteiMitText());
    const vorher = fs.readFileSync(pfad, 'utf8');
    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [{ tabelle: 'Autoren.md', art: 'create', werte: { name: 'Cara' } }],
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.karteiNameFehlt);
    expect(ergebnis.lagen).toEqual([
      expect.objectContaining({
        code: 'auftragKarteiNameFehlt',
        tabelle: 'Autoren.md',
        position: 0,
      }),
    ]);
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
  });

  it('weist das Eröffnen einer Neuanlage ab, bevor eine Kennung gezogen ist', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Autoren.md', karteiMitText());
    const vorher = fs.readFileSync(pfad, 'utf8');
    const ergebnis = await schnittstelle().eroeffneNeuanlage(wurzel, 'Autoren.md');
    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.karteiTabelle });
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
  });
});
