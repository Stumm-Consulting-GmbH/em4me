// 4T-001794 (Epic 3E-000255, Auflage 1): Der Anteil dieses Epics am Nachweis
// des Aus-Zustands der Erweiterung «Datenbank».
//
// Die stehende Auflage verlangt, dass jede Stufe ihren Anteil am Aus-Zustand
// EINZELN nachweist. Zwei Anteile dieses Epics liegen bereits nebenan und
// werden hier nicht wiederholt: die Seite der Beleg-Ansicht in
// `test/unit/renderer/beleg-ansicht-seite.test.js` (Kapitel «Beleg-Ansicht im
// Aus-Zustand der Erweiterung «Datenbank»») und der Rückfall des
// Datensatz-Blocks auf einen gewöhnlichen Code-Block in
// `test/unit/db-record-anzeige.test.js` (Fall «hängt am Schalter der
// Datenbank-Erweiterung», in der Anzeige wie im portablen Export).
//
// Hier stehen die drei Anteile, die dort keine Heimat haben:
//
//   1. **Der Zeilen-Zugang entfällt mit dem Schalter.** Die Schaltfläche
//      «Änderungsbelege anzeigen» und die Spalte, die sie trägt, sind im
//      Aus-Zustand nicht bloß wirkungslos, sondern gar nicht erst im Markup.
//   2. **Was im Aus-Zustand bewusst WEITER greift.** Die Familien-Erkennung
//      der Beleg-Datei und der Ausschluss des Sperr-Ordners hängen an keinem
//      Schalter — das ist entschieden und keine Lücke. Eine Beleg-Datei oder
//      ein Sperr-Ordner, die nach dem Ausschalten plötzlich in Dateiliste,
//      Bereichs-Watcher oder Direkt-Öffnen auftauchten, wären eine
//      Verschlechterung ohne jeden Nutzen.
//   3. **Der Aufrufer-Wächter über die schreibenden Wege.** Sperre nehmen,
//      freigeben und brechen, Beleg schreiben und Verdichtung tragen nach
//      Konzept-Entscheidung E15.2 KEINEN eigenen Schalter: Ohne Datensätze
//      hören sie von selbst auf zu entstehen. Diese Begründung trägt genau
//      solange, wie es keinen Aufrufer gibt — und heute gibt es keinen. Der
//      erste, der hinzukommt (Schreib-Schnittstelle, Epic 3E-000254), muss
//      seinen Aus-Zustand selbst nachweisen, und diese Übergabe trägt der
//      Wächter unten maschinell statt eines Merksatzes in einem abgeschlossenen
//      Vorgang.
//
// Muster des Wächters: `atomares-schreiben-aufrufer.test.js`, einschließlich
// der Gegenprobe an einem erfundenen Quelltext. Ein Wächter ohne Gegenprobe ist
// ein Wächter, von dem niemand weiß, ob er schläft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMarkdown, configureExtensions } from '../../src/shared/markdown/markdown.js';
import { RECORD_HISTORY_ICON } from '../../src/shared/markdown/perspective-records-html.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';
import { MDDL_EXT, isMarkdownDataPath } from '../../src/shared/markdown-data-family.js';
import { createMddHistory } from '../../src/main/documents/mdd-history.js';
import { istImSperrOrdner } from '../../src/main/area/area-watch-ignore.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
// 4T-001821 (Epic 3E-000254): der erste produktive Aufrufer der schreibenden
// Wege. Sein Aus-Zustand steht in Block 3a, sein Eintrag in der Liste darunter.
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { belegPfadFuer } from '../../src/main/database/change-log.js';
import { vorgangsDateiPfad } from '../../src/main/database/vorgangs-kennung.js';
// 4T-001823 (Epic 3E-000254): die Klammer des Absichts-Protokolls, durch die die
// Schreib-Schnittstelle jeden Auftrag schreibt. Ihr Aus-Zustand steht in Block
// 3a, ihr Eintrag in der Liste darunter.
import { erzeugeAbsichtsProtokoll, protokollName } from '../../src/main/database/intent-log.js';
// 4T-001824 (Epic 3E-000254): der Wiederanlauf liegengebliebener Aufträge. Er
// nimmt Sperren und fügt Belege an; sein Aus-Zustand steht in Block 3a, sein
// Eintrag in der Liste darunter.
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
// 4T-001941 (Epic 3E-000257): die Bedienung der Datensatz-Sperre aus der Maske.
// Sie nimmt, bricht und gibt frei; ihr Aus-Zustand steht in Block 3a, ihr
// Eintrag in der Liste darunter.
import { bediene } from '../../src/main/database/sperre-bedienung.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

// Erzeugnisse des Baus, keine Quellen: Sie sind nicht versioniert, entstehen aus
// den Modulen darunter und würden den Wächter nur doppelt messen lassen.
const ERZEUGNISSE = ['src/renderer/renderer.bundle.js', 'src/renderer/mermaid.bundle.js'];

function relativZurWurzel(abs) {
  return path.relative(WURZEL, abs).split(path.sep).join('/');
}

function sammleQuellen(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...sammleQuellen(voll));
    else if (eintrag.name.endsWith('.js')) gefunden.push(voll);
  }
  return gefunden;
}

const QUELLDATEIEN = sammleQuellen(path.join(WURZEL, 'src'))
  .map(relativZurWurzel)
  .filter((rel) => !ERZEUGNISSE.includes(rel))
  .sort()
  .map((rel) => ({
    rel,
    quelltext: fs.readFileSync(path.join(WURZEL, ...rel.split('/')), 'utf8'),
  }));

function quelltextVon(rel) {
  const treffer = QUELLDATEIEN.find((datei) => datei.rel === rel);
  return treffer ? treffer.quelltext : '';
}

// --- Block 1: der Zeilen-Zugang im Aus-Zustand -----------------------------------------

// Eine Tabellen-Datei mit einem Datensatz, der eine Kennung trägt: die Lage, in
// der die Schaltfläche überhaupt entsteht.
const TABELLEN_DOKUMENT = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Name',
  '    - name: Ort',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna Muster',
  '| Basel',
  '```',
  '',
].join('\n');

// Die Klasse der Schaltfläche und die ihrer Spalte stehen im Bauer als Literale
// im zusammengesetzten Markup und sind dort nicht als Konstante abgreifbar; das
// Symbol ist es. Es wird deshalb mitgeprüft: Es ist der Teil des Markups, der
// aus dem Modul selbst stammt und nicht hier abgeschrieben ist.
const SCHALTFLAECHE = 'prc-history-btn';
const AKTIONS_SPALTE = 'prc-action';

afterEach(() => {
  configureExtensions([]);
});

describe('Aus-Zustand: der Zeilen-Zugang zu den Änderungsbelegen (4T-001794)', () => {
  it('trägt die Schaltfläche samt Spalte, solange die Erweiterung an ist', () => {
    // Die Gegenprobe zum Fall darunter. Ohne sie wäre jener auch dann grün,
    // wenn die Schaltfläche gar nicht mehr entstünde.
    expect(extensionById('database')).not.toBeNull();
    const html = renderMarkdown(TABELLEN_DOKUMENT, 'de');
    expect(html).toContain(SCHALTFLAECHE);
    expect(html).toContain(AKTIONS_SPALTE);
    expect(html).toContain(RECORD_HISTORY_ICON);
  });

  it('nimmt mit dem Schalter die Schaltfläche und ihre Spalte mit', () => {
    // Im Aus-Zustand fällt die ganze Fence auf den gewöhnlichen Code-Block
    // zurück; damit ist der Zugang nicht bloß wirkungslos, sondern gar nicht
    // erst da. Ein sichtbarer Knopf ohne Wirkung wäre das Versprechen einer
    // Ansicht, die im Aus-Zustand nichts öffnet.
    configureExtensions(['database']);
    const html = renderMarkdown(TABELLEN_DOKUMENT, 'de');
    expect(html).not.toContain(SCHALTFLAECHE);
    expect(html).not.toContain(AKTIONS_SPALTE);
    expect(html).not.toContain(RECORD_HISTORY_ICON);
    // Statt der Tabelle steht der gewöhnliche Code-Block da, und der Inhalt der
    // Fence bleibt als Rohtext erhalten, statt verloren zu gehen. Die
    // Gegenprobe auf ein nacktes `<button` taugt hier nicht: Der aufklappbare
    // Frontmatter-Block bringt ein eigenes mit, das mit der Datenbank nichts zu
    // tun hat.
    expect(html).toContain('language-perspective-records');
    expect(html).toContain('| Anna Muster');
    expect(html).not.toContain('class="perspective-records"');
  });
});

// --- Block 2: was im Aus-Zustand bewusst weiter greift ----------------------------------

// Die Erkennung des Hauptprozesses; Name und Signatur bleiben, die Liste der
// Endungen kommt aus dem gemeinsamen Modul (Muster markdown-data-familie.test.js).
const { isMddPath } = createMddHistory({
  getStore: () => null,
  areaOfWindow: () => null,
  readAreaHistoryDefault: async () => undefined,
});

const BELEG_PFAD = `C:/Bereich/Kunden${MDDL_EXT}`;

// Die drei Module, deren Unabhängigkeit vom Schalter die Zusage trägt: die
// Familien-Erkennung, der Ausschluss des Sperr-Ordners und die Auflösung seines
// wirksamen Namens.
const OHNE_SCHALTER = [
  'src/shared/markdown-data-family.js',
  'src/main/area/area-watch-ignore.js',
  'src/shared/database/lock-folder-name.js',
];

// Was einen Bezug auf die Erweiterungs-Registry ausmacht. Bewusst eng gefasst:
// Ein loses «extension» träfe `extensionOf` in der Familien-Erkennung, also
// ausgerechnet die Funktion, deren Unabhängigkeit hier belegt werden soll.
const REGISTRY_BEZUG = [
  /extensions\/extensions/,
  /\bisExtensionActive\b/,
  /\bconfigureExtensions\b/,
  /\bextensionById\b/,
  /extensions\.disabled/,
];

describe('Aus-Zustand: die Beleg-Datei bleibt eine Datei der Familie (4T-001794)', () => {
  it('erkennt die Beleg-Endung mit ausgeschalteter Erweiterung unverändert', () => {
    configureExtensions(['database']);
    expect(isMarkdownDataPath(BELEG_PFAD)).toBe(true);
    expect(isMddPath(BELEG_PFAD)).toBe(true);
  });

  it('fragt in keinem der drei Module nach dem Schalter', () => {
    // Der Struktur-Nachweis zum Fall darüber: Die beiden Erkennungen können
    // nicht am Schalter hängen, weil keines der drei Module die Registry
    // überhaupt kennt. Daran hängt die Zusage, dass Beleg-Datei und
    // Sperr-Ordner auch im Aus-Zustand aus Dateiliste, Bereichs-Watcher und
    // Direkt-Öffnen draußen bleiben — nach dem Muster des Suchraum-Schnitts,
    // der ebenso bestehen bleibt.
    const mitBezug = [];
    for (const rel of OHNE_SCHALTER) {
      const quelltext = quelltextVon(rel);
      for (const muster of REGISTRY_BEZUG) {
        if (muster.test(quelltext)) mitBezug.push(`${rel} — ${muster}`);
      }
    }
    expect(mitBezug, mitBezug.join('\n')).toEqual([]);
  });

  it('prüft eine nicht leere Menge von Modulen', () => {
    // Untere Plausibilitäts-Schranke: Ein Wächter, dessen Menge leer läuft oder
    // dessen Pfade nicht mehr stimmen, ist grün, ohne etwas geprüft zu haben.
    expect(OHNE_SCHALTER.length).toBe(3);
    for (const rel of OHNE_SCHALTER) expect(quelltextVon(rel).length).toBeGreaterThan(200);
  });
});

describe('Aus-Zustand: der Sperr-Ordner bleibt ausgeschlossen (4T-001794)', () => {
  const BEREICH = path.resolve('/bereich');

  it('hält den Ordner und alles darunter draußen, auch bei ausgeschalteter Erweiterung', () => {
    configureExtensions(['database']);
    const ordner = path.join(BEREICH, DEFAULT_LOCK_FOLDER_NAME);
    expect(istImSperrOrdner(BEREICH, DEFAULT_LOCK_FOLDER_NAME, ordner)).toBe(true);
    expect(
      istImSperrOrdner(BEREICH, DEFAULT_LOCK_FOLDER_NAME, path.join(ordner, 'd+kunden.md.lock')),
    ).toBe(true);
    // Die Gegenprobe: Ein gewöhnlicher Ordner bleibt beobachtet.
    expect(
      istImSperrOrdner(BEREICH, DEFAULT_LOCK_FOLDER_NAME, path.join(BEREICH, 'Stammdaten')),
    ).toBe(false);
  });

  it('nimmt keinen Erweiterungs-Zustand entgegen', () => {
    // Drei Parameter, und keiner davon ist ein Schalter: Wurzel, Ordnername,
    // Pfad. Es gibt damit keine Stelle, an der ein Aufrufer den Ausschluss mit
    // dem Aus-Zustand aushebeln könnte.
    expect(istImSperrOrdner.length).toBe(3);
  });
});

// --- Block 3a: der Aus-Zustand der Schreib-Schnittstelle (4T-001821, AK13) ---------------

// Der Einzel-Nachweis, den der Wächter darunter verlangt, BEVOR die
// Schreib-Schnittstelle in seine Liste eingetragen werden darf: Ist die
// Erweiterung «database» ausgeschaltet, entsteht keine Sperre, kein Beleg, keine
// Verdichtung, keine Vorgangs-Kennung und keine geänderte Tabellen-Datei.
//
// **Gemessen wird zweifach**, weil hier ein AUSBLEIBEN nachzuweisen ist: an
// Spionen auf allen Nähten (keine wird gerufen) UND am Dateisystem (nichts
// entsteht). Ein Spion allein bewiese nur, dass eine bestimmte Naht ungenutzt
// blieb; das Dateisystem allein sagte nichts darüber, ob ein anderer Weg
// genommen wurde.

const AUS_TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Name',
  '  lastId: 1',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '```',
  '',
].join('\n');

let ausTmpDirs = [];

afterEach(() => {
  for (const dir of ausTmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  ausTmpDirs = [];
});

// Alle Nähte als Spione: die Zugriffe der Sperr-Verwaltung, der atomare
// Schreibweg und der ganze Dateizugriff. Wird auch nur einer gerufen, hat die
// Schnittstelle den Bereich angefasst.
//
// 4T-001823: Dazu kommt die Klammer des Absichts-Protokolls. Sie ist ECHT und
// nicht gestellt, weil ihr eigenes Ausbleiben nachzuweisen ist; ihre Nähte
// (dieselbe Spion-Verwaltung, derselbe Spion-Dateizugriff, Durchschreiben,
// Umbenennen, Konfigurations-Leser) sind Spione, und ihr Einstieg ist
// zusätzlich beobachtet.
//
// 4T-001824: Dazu kommt der Wiederanlauf, ebenso ECHT und mit denselben
// Spionen. Sein Tor ist eine eigene Naht (`tor`), weil er beim Öffnen eines
// Bereichs ohne Schnittstelle davor gerufen wird; sein Einstieg ist beobachtet.
function ausAufbau({ tor = () => false } = {}) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-aus-'));
  ausTmpDirs.push(wurzel);
  const tabellenPfad = path.join(wurzel, 'Kunden.md');
  fs.writeFileSync(tabellenPfad, AUS_TABELLE, 'utf8');

  const sperrVerwaltung = {
    mitSperren: vi.fn(),
    gehalteneSperren: vi.fn(() => []),
    belegSperreFuer: vi.fn(),
    zaehlerSperreFuer: vi.fn(),
    // 4T-001823: die beiden Zugriffe, über die die Klammer Sperren nimmt und
    // freigibt. Das Nehmen meldet einen Konflikt, damit die Gegenprobe mit
    // eingeschaltetem Tor ohne Schreibvorgang endet.
    nimmGeordnet: vi.fn(async () => ({ ok: true, gehalten: false, konflikt: null })),
    gibZurueck: vi.fn(),
    // 4T-001824: die drei weiteren Zugriffe des Wiederanlaufs.
    nimm: vi.fn(),
    brich: vi.fn(),
    lebendeSperren: vi.fn(),
  };
  const fsp = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    stat: vi.fn(),
    // 4T-001824: Ein leerer Sperr-Ordner, damit die Gegenprobe mit
    // eingeschaltetem Tor über den Wiederanlauf hinweg bis zur Klammer kommt.
    readdir: vi.fn(async () => []),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  };
  const ersetzen = vi.fn();
  const klammerNaehte = { leseKonfig: vi.fn(), durchschreiben: vi.fn(), benenneUm: vi.fn() };
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, fsp, ...klammerNaehte });
  vi.spyOn(absichtsProtokoll, 'fuehreAuftragDurch');
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    fsp,
    leseKonfig: klammerNaehte.leseKonfig,
    benenneUm: klammerNaehte.benenneUm,
    erweiterungAktiv: tor,
  });
  vi.spyOn(wiederanlauf, 'raeumeAuf');
  const spione = [
    ...Object.values(sperrVerwaltung),
    ...Object.values(fsp),
    ersetzen,
    ...Object.values(klammerNaehte),
    absichtsProtokoll.fuehreAuftragDurch,
    wiederanlauf.raeumeAuf,
  ];
  return {
    wurzel,
    tabellenPfad,
    sperrVerwaltung,
    fsp,
    ersetzen,
    absichtsProtokoll,
    wiederanlauf,
    spione,
  };
}

function erwarteNichtsGeschehen(aufbau) {
  for (const spion of aufbau.spione) expect(spion).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(aufbau.wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
  expect(fs.existsSync(belegPfadFuer(aufbau.tabellenPfad))).toBe(false);
  expect(fs.existsSync(vorgangsDateiPfad(aufbau.wurzel))).toBe(false);
  expect(fs.readFileSync(aufbau.tabellenPfad, 'utf8')).toBe(AUS_TABELLE);
  // 4T-001823: Im Bereich liegt allein die Tabelle. Keine Schattenkopie, kein
  // Sperr-Ordner und damit kein Protokoll, keine Beleg- und keine Zähler-Datei.
  expect(fs.readdirSync(aufbau.wurzel)).toEqual(['Kunden.md']);
}

// 4T-001822 (Epic 3E-000254, B1): Ändern nennt den zuletzt gelesenen Stand, hier
// den der Aus-Tabelle. Ohne ihn endete der Auftrag bei eingeschaltetem Tor an der
// Form-Prüfung, und die Gegenprobe erreichte die Sperr-Verwaltung nicht mehr.
const AUS_AUFTRAG = {
  anweisungen: [
    {
      tabelle: 'Kunden.md',
      art: 'update',
      id: 'r-00001',
      erwartet: { Name: 'Anna' },
      werte: { Name: 'Bert' },
    },
  ],
};

describe('Aus-Zustand: die Schreib-Schnittstelle der Datenbank (4T-001821, AK13)', () => {
  it('nimmt keine Sperre, schreibt keinen Beleg und fasst keine Tabellen-Datei an', async () => {
    const aufbau = ausAufbau();
    const schnittstelle = erzeugeSchreibSchnittstelle({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      absichtsProtokoll: aufbau.absichtsProtokoll,
      wiederanlauf: aufbau.wiederanlauf,
      erweiterungAktiv: () => false,
      fsp: aufbau.fsp,
      ersetzen: aufbau.ersetzen,
    });

    const ergebnis = await schnittstelle.fuehreAuftragAus(aufbau.wurzel, AUS_AUFTRAG);

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.erweiterungAus });
    erwarteNichtsGeschehen(aufbau);
  });

  it('zieht beim Eröffnen einer Neuanlage weder Kennung noch Sperre', async () => {
    const aufbau = ausAufbau();
    const schnittstelle = erzeugeSchreibSchnittstelle({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      absichtsProtokoll: aufbau.absichtsProtokoll,
      wiederanlauf: aufbau.wiederanlauf,
      erweiterungAktiv: () => false,
      fsp: aufbau.fsp,
      ersetzen: aufbau.ersetzen,
    });

    const ergebnis = await schnittstelle.eroeffneNeuanlage(aufbau.wurzel, 'Kunden.md');

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.erweiterungAus });
    erwarteNichtsGeschehen(aufbau);
  });

  it('gilt fail-closed: ohne das Tor als Naht wirkt die Erweiterung als ausgeschaltet', async () => {
    // Der Rückfall verweigert, statt plausibel weiterzulaufen. Eine Verdrahtung,
    // die das Tor vergisst, schreibt damit nichts — und nicht alles.
    const aufbau = ausAufbau();
    const schnittstelle = erzeugeSchreibSchnittstelle({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      absichtsProtokoll: aufbau.absichtsProtokoll,
      wiederanlauf: aufbau.wiederanlauf,
      fsp: aufbau.fsp,
      ersetzen: aufbau.ersetzen,
    });

    const ergebnis = await schnittstelle.fuehreAuftragAus(aufbau.wurzel, AUS_AUFTRAG);

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.erweiterungAus });
    erwarteNichtsGeschehen(aufbau);
  });

  it('fragt das Tor bei JEDEM Auftrag neu und friert es nicht beim Aufbau ein', async () => {
    let an = true;
    const aufbau = ausAufbau({ tor: () => an });
    const schnittstelle = erzeugeSchreibSchnittstelle({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      absichtsProtokoll: aufbau.absichtsProtokoll,
      wiederanlauf: aufbau.wiederanlauf,
      erweiterungAktiv: () => an,
      // Der Dateizugriff ist hier ECHT, weil die Definition der Tabelle vor dem
      // Nehmen der Sperren gelesen wird (B2): Mit dem Spion käme der Auftrag gar
      // nicht bis zur Sperr-Verwaltung, und die Gegenprobe prüfte nichts.
      fsp: fs.promises,
      ersetzen: aufbau.ersetzen,
    });

    // Die Gegenprobe zu den drei Fällen darüber: Mit eingeschalteter Erweiterung
    // greift die Schnittstelle sehr wohl zur Sperr-Verwaltung. Ohne sie wären
    // jene Fälle auch dann grün, wenn die Schnittstelle gar nichts mehr täte.
    // 4T-001823: Die Sperren nimmt seither die Klammer; gezählt wird deshalb
    // ihr Einstieg und das geordnete Nehmen der Verwaltung darunter.
    await schnittstelle.fuehreAuftragAus(aufbau.wurzel, AUS_AUFTRAG);
    expect(aufbau.absichtsProtokoll.fuehreAuftragDurch).toHaveBeenCalledTimes(1);
    expect(aufbau.sperrVerwaltung.nimmGeordnet).toHaveBeenCalledTimes(1);
    // 4T-001824: Vor dem Auftrag sieht der Wiederanlauf in den Sperr-Ordner.
    expect(aufbau.wiederanlauf.raeumeAuf).toHaveBeenCalledTimes(1);

    an = false;
    await schnittstelle.fuehreAuftragAus(aufbau.wurzel, AUS_AUFTRAG);
    expect(aufbau.absichtsProtokoll.fuehreAuftragDurch).toHaveBeenCalledTimes(1);
    expect(aufbau.sperrVerwaltung.nimmGeordnet).toHaveBeenCalledTimes(1);
    expect(aufbau.wiederanlauf.raeumeAuf).toHaveBeenCalledTimes(1);
  });

  // 4T-001823 (Epic 3E-000254): der eigene Nachweis der Klammer, BEVOR sie in
  // die Liste darunter eingetragen wird. Die Klammer trägt kein eigenes Tor
  // (E15.2); es trägt die Schnittstelle, die sie ruft. Nachzuweisen ist
  // deshalb, dass bei ausgeschalteter Erweiterung der Einstieg der Klammer gar
  // nicht erreicht wird und damit keine ihrer Nähte: keine Sperre, keine
  // Schattenkopie, kein Protokoll, kein Beleg.
  it('ruft die Klammer des Absichts-Protokolls nicht, und sie schreibt nichts (4T-001823)', async () => {
    const aufbau = ausAufbau();
    const schnittstelle = erzeugeSchreibSchnittstelle({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      absichtsProtokoll: aufbau.absichtsProtokoll,
      wiederanlauf: aufbau.wiederanlauf,
      erweiterungAktiv: () => false,
      // Echter Dateizugriff für die Schnittstelle: Ihr Spion bewiese nur, dass
      // SIE nichts liest; die Klammer bekommt ihren eigenen Spion.
      fsp: fs.promises,
      ersetzen: aufbau.ersetzen,
    });

    const ergebnis = await schnittstelle.fuehreAuftragAus(aufbau.wurzel, AUS_AUFTRAG);

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.erweiterungAus });
    expect(aufbau.absichtsProtokoll.fuehreAuftragDurch).not.toHaveBeenCalled();
    expect(aufbau.sperrVerwaltung.nimmGeordnet).not.toHaveBeenCalled();
    erwarteNichtsGeschehen(aufbau);
  });
});

// 4T-001824 (Epic 3E-000254): der eigene Nachweis des Wiederanlaufs, BEVOR er in
// die Liste darunter eingetragen wird. Er hat zwei Aufrufer: die Schnittstelle,
// die ihn hinter ihrem Tor ruft (Fälle darüber), und das Öffnen eines Bereichs,
// das ihn auch bei ausgeschalteter Erweiterung ruft. Deshalb prüft er das Tor
// selbst, über dieselbe Art Naht wie die Schnittstelle.
//
// Ein liegendes Protokoll entsteht hier von Hand: Der Auftrag, der es
// hinterlassen hätte, gehört zur eingeschalteten Erweiterung.
function liegendesProtokoll(aufbau) {
  const ordner = path.join(aufbau.wurzel, DEFAULT_LOCK_FOLDER_NAME);
  fs.mkdirSync(ordner, { recursive: true });
  const schatten = path.join(aufbau.wurzel, '.Kunden.md.em4me-absicht-99999-1');
  fs.writeFileSync(schatten, AUS_TABELLE.replace('| Anna', '| Bert'), 'utf8');
  const alt = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(schatten, alt, alt);
  const protokoll = path.join(ordner, protokollName(1));
  const inhalt = {
    schemaVersion: 1,
    vorgang: 1,
    zeitpunkt: '2026-09-23T08:00:00Z',
    halter: { benutzer: 'anna', rechner: 'SC-026', pid: 99999 },
    umbenennungen: [{ von: schatten, nach: aufbau.tabellenPfad }],
    belege: [],
    sperren: [{ art: 'changeLog', tabelle: 'Kunden.md', id: null }],
  };
  fs.writeFileSync(protokoll, JSON.stringify(inhalt), 'utf8');
  return { protokoll, schatten };
}

describe('Aus-Zustand: der Wiederanlauf liegengebliebener Aufträge (4T-001824)', () => {
  it('liest beim Öffnen eines Bereichs nichts und nimmt keine Sperre', async () => {
    const aufbau = ausAufbau();

    const ergebnis = await aufbau.wiederanlauf.raeumeAuf(aufbau.wurzel);

    expect(ergebnis).toMatchObject({ ok: true, erweiterungAus: true, ergebnisse: [] });
    for (const spion of aufbau.spione.filter((s) => s !== aufbau.wiederanlauf.raeumeAuf))
      expect(spion).not.toHaveBeenCalled();
    expect(fs.readdirSync(aufbau.wurzel)).toEqual(['Kunden.md']);
  });

  it('räumt ein liegendes Protokoll bei ausgeschalteter Erweiterung nicht auf', async () => {
    // Echter Dateizugriff: Nachzuweisen ist, dass NICHTS geschieht, obwohl es
    // etwas zu tun gäbe. Die Verwaltung bleibt der Spion.
    const aufbau = ausAufbau();
    const liegt = liegendesProtokoll(aufbau);
    const echt = erzeugeWiederanlauf({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      leseKonfig: async () => undefined,
      erweiterungAktiv: () => false,
    });

    await echt.raeumeAuf(aufbau.wurzel);
    await echt.entsorgeVerwaisteSchattenkopien(aufbau.wurzel, [aufbau.wurzel]);

    expect(fs.existsSync(liegt.protokoll)).toBe(true);
    expect(fs.existsSync(liegt.schatten)).toBe(true);
    expect(fs.readFileSync(aufbau.tabellenPfad, 'utf8')).toBe(AUS_TABELLE);
    for (const spion of Object.values(aufbau.sperrVerwaltung)) expect(spion).not.toHaveBeenCalled();
  });

  it('räumt dasselbe Protokoll bei eingeschalteter Erweiterung auf (Gegenprobe)', async () => {
    const aufbau = ausAufbau();
    const liegt = liegendesProtokoll(aufbau);
    const echt = erzeugeWiederanlauf({
      sperrVerwaltung: aufbau.sperrVerwaltung,
      leseKonfig: async () => undefined,
      erweiterungAktiv: () => true,
    });
    aufbau.sperrVerwaltung.nimm.mockResolvedValue({ ok: true, gehalten: true });
    aufbau.sperrVerwaltung.nimmGeordnet.mockResolvedValue({
      ok: true,
      gehalten: true,
      genommen: [],
    });

    const ergebnis = await echt.raeumeAuf(aufbau.wurzel);

    expect(ergebnis.ergebnisse.map((e) => e.lage)).toEqual(['fertiggeschrieben']);
    expect(fs.existsSync(liegt.protokoll)).toBe(false);
    expect(fs.readFileSync(aufbau.tabellenPfad, 'utf8')).toContain('| Bert');
    expect(aufbau.sperrVerwaltung.nimm).toHaveBeenCalledTimes(1);
    expect(aufbau.sperrVerwaltung.gibZurueck).toHaveBeenCalledTimes(1);
  });
});

// 4T-001941 (Epic 3E-000257): der eigene Nachweis der Sperr-Bedienung, BEVOR sie in
// die Liste darunter eingetragen wird. Sie trägt ihr Tor selbst, als Pflicht-Naht
// wie die Schreib-Schnittstelle, und der Kanal `database:sperre` fragt es davor
// ein zweites Mal. Nachzuweisen ist, dass bei ausgeschalteter Erweiterung keine
// der vier Aktionen die Verwaltung erreicht und kein Sperr-Ordner entsteht.
describe('Aus-Zustand: die Bedienung der Datensatz-Sperre (4T-001941)', () => {
  const GRUND = { tabelle: 'Kunden.md', kennung: 'r-00001', stand: 'a'.repeat(64) };

  it('nimmt, bricht und gibt nichts frei und liest keine Sperre', async () => {
    for (const tor of [() => false, undefined]) {
      const aufbau = ausAufbau();
      for (const aktion of ['nehmen', 'brechen', 'freigeben', 'auskunft']) {
        const ergebnis = await bediene({
          ...GRUND,
          sperrVerwaltung: aufbau.sperrVerwaltung,
          erweiterungAktiv: tor,
          wurzel: aufbau.wurzel,
          aktion,
        });
        expect(ergebnis).toEqual({ status: 'unavailable' });
      }
      erwarteNichtsGeschehen(aufbau);
    }
  });

  it('greift bei eingeschalteter Erweiterung zur Verwaltung (Gegenprobe)', async () => {
    const aufbau = ausAufbau();
    await bediene({
      ...GRUND,
      sperrVerwaltung: aufbau.sperrVerwaltung,
      erweiterungAktiv: () => true,
      wurzel: aufbau.wurzel,
      aktion: 'nehmen',
    });
    expect(aufbau.sperrVerwaltung.nimm).toHaveBeenCalledTimes(1);
  });
});

// --- Block 3: kein Schreib-Aufrufer ohne nachgewiesenen Aus-Zustand ---------------------

// Die Module, in denen die überwachten Wege DEFINIERT werden oder intern
// zusammenarbeiten. Sie sind keine Aufrufer im Sinne dieses Wächters:
//
//   change-log.js     definiert schreibeBeleg und verdichteBeiBedarf.
//   lock-lifecycle.js definiert nimm, gibFrei, brich, nimmGeordnet, mitSperren
//                     und belegSperreFuer; die Wege rufen einander gegenseitig.
//   lock-replace.js   löst eine Sperre samt Bruch-Anspruch ab und ist der
//                     innere Teil desselben Zugriffs, aus lock-lifecycle.js
//                     herausgeschnitten.
//   lock-store.js     kennt Ort, Name und Inhalt der Sperr-Datei; die Mechanik
//                     unter demselben Lebenszyklus.
//
// Die beiden letzten tragen heute keinen der überwachten Namen; sie stehen hier,
// damit eine künftige interne Verwendung nicht wie ein neuer Aufrufer aussieht.
const DEFINITIONS_MODULE = Object.freeze([
  'src/main/database/change-log.js',
  'src/main/database/lock-lifecycle.js',
  'src/main/database/lock-replace.js',
  'src/main/database/lock-store.js',
  'src/main/database/vorgangs-kennung.js',
]);

// Die nehmenden, freigebenden, brechenden und schreibenden Wege. **Nicht dabei
// sind die lesenden**: `lebendeSperren` (benutzt von lock-folder-rename.js über
// ipc/areas.js), `gehalteneSperren`, `belegeDesDatensatzes` und die Erzeugung
// der Verwaltung in app/wiring.js. Sie legen nichts an, schreiben nichts und
// brauchen deshalb kein Tor.
//
// Gemessen am Bestand (2026-09-19) trägt KEINE Datei unter src/ außerhalb der
// beiden Definitions-Module einen dieser Namen in Aufruf-Form; auch die kurzen
// `nimm` und `brich` brauchen deshalb keine Einengung auf Dateien, welche die
// Sperr-Verwaltung kennen. Wächst die Zahl der Fehlalarme später doch, ist die
// Einengung die Antwort und nicht das Abschalten.
const UEBERWACHTE_BEZEICHNER = Object.freeze([
  'schreibeBeleg',
  'verdichteBeiBedarf',
  'nimm',
  'nimmGeordnet',
  'gibFrei',
  'gibAllesFrei',
  'brich',
  'mitSperren',
  'belegSperreFuer',
  // 4T-001820 (Epic 3E-000254): Die Naht-Fabrik der Zähler-Sperre ist der Zwilling
  // von belegSperreFuer, und das Ziehen einer Vorgangs-Kennung schreibt die
  // Zähler-Datei des Bereichs. Beide haben heute keinen produktiven Aufrufer; ihr
  // erster entsteht mit der Schreib-Schnittstelle und gehört hinter dasselbe Tor.
  'zaehlerSperreFuer',
  'zieheVorgang',
]);

// Jeder Eintrag hier ist eine Zusage: Für diese Datei ist der Aus-Zustand in
// dieser Prüfdatei einzeln nachgewiesen.
//
// 4T-001821 (Epic 3E-000254): Die Schreib-Schnittstelle ist der erste produktive
// Aufrufer von Sperre, Änderungsbeleg, Verdichtung und Vorgangs-Zähler. Ihr
// Aus-Zustand steht in Block 3a darüber, und der Eintrag hier ist danach
// entstanden — in dieser Reihenfolge, sonst wäre der Wächter nur
// stummgeschaltet und nicht erfüllt.
//
// 4T-001823 (Epic 3E-000254): Die Klammer des Absichts-Protokolls nimmt und gibt
// Sperren über die Verwaltung und fügt Belege an. Ihr Aus-Zustand steht als
// eigener Fall in Block 3a; eingetragen wurde sie danach.
//
// 4T-001824 (Epic 3E-000254): Der Wiederanlauf nimmt die Aufräum-Sperre und die
// Sperren eines Protokolls, bricht eine abgelaufene Aufräum-Sperre und fügt
// Belege an. Sein Aus-Zustand steht als eigene Fälle in Block 3a, mit dem Tor im
// Modul selbst, weil das Öffnen eines Bereichs ihn ohne Schnittstelle davor
// ruft; eingetragen wurde er danach.
//
// 4T-001941 (Epic 3E-000257): Die Bedienung der Datensatz-Sperre nimmt, bricht und
// gibt frei, im Auftrag der Maske über den Kanal `database:sperre`. Ihr
// Aus-Zustand steht als eigener Fall in Block 3a; eingetragen wurde sie danach.
const NACHGEWIESENE_AUFRUFER = Object.freeze([
  'src/main/database/intent-log.js',
  'src/main/database/intent-recovery.js',
  'src/main/database/record-auftrag.js',
  'src/main/database/sperre-bedienung.js',
]);

// Holt sich die Datei eines der beiden Definitions-Module herein? Dann zählt
// auch die bloße Destrukturierung im require als Treffer, denn wer einen dieser
// Namen auspackt, will ihn benutzen.
const HOLT_DEFINITION =
  /(?:require\(|from\s+)['"][^'"]*\/(?:change-log|lock-lifecycle|vorgangs-kennung)(?:\.js)?['"]/;

// Zeilen-Nummern der Treffer eines Musters, ohne die Vorkommen in Kommentaren:
// Der Bestand erklärt diese Wege an mehreren Stellen in Prosa, und ein Wächter,
// der Erklärungen meldet, wird abgeschaltet (Muster
// atomares-schreiben-aufrufer.test.js).
function trefferAusserhalbKommentaren(quelltext, muster) {
  const zeilen = [];
  for (const m of quelltext.matchAll(muster)) {
    const zeilenAnfang = quelltext.lastIndexOf('\n', m.index) + 1;
    const vorText = quelltext.slice(zeilenAnfang, m.index);
    if (/(^|\s)(\/\/|\*)/.test(vorText)) continue;
    zeilen.push(quelltext.slice(0, m.index).split('\n').length);
  }
  return zeilen;
}

/**
 * Sucht die schreibenden Aufrufer in einer Menge von Quelltexten.
 *
 * Die Funktion nimmt die Dateien als Eingabe und liest selbst nichts; damit
 * lässt sich ihre Gegenprobe an einem erfundenen Quelltext führen, ohne eine
 * Datei unter `src/` anzulegen.
 *
 * @param {Array<{rel: string, quelltext: string}>} dateien Zu prüfende Dateien.
 * @returns {Array<{datei: string, bezeichner: Array<string>}>} Die Fundstellen.
 */
export function findeSchreibAufrufer(dateien) {
  const treffer = [];
  for (const { rel, quelltext } of dateien) {
    if (DEFINITIONS_MODULE.includes(rel)) continue;
    const holtDefinition = HOLT_DEFINITION.test(quelltext);
    const bezeichner = [];
    for (const name of UEBERWACHTE_BEZEICHNER) {
      const aufruf = trefferAusserhalbKommentaren(quelltext, new RegExp(`\\b${name}\\s*\\(`, 'g'));
      const ausgepackt = holtDefinition
        ? trefferAusserhalbKommentaren(quelltext, new RegExp(`\\b${name}\\b`, 'g'))
        : [];
      if (aufruf.length > 0 || ausgepackt.length > 0) bezeichner.push(name);
    }
    if (bezeichner.length > 0) treffer.push({ datei: rel, bezeichner });
  }
  return treffer;
}

const ANLEITUNG =
  'Ein neuer Aufrufer der schreibenden Wege von Sperre und Änderungsbeleg. Er gehört hinter ' +
  'das Tor der Erweiterung «database»: Ist sie aus, entsteht keine Sperre, kein Beleg und ' +
  'keine Verdichtung. Weise diesen Aus-Zustand in dieser Prüfdatei mit einem eigenen Fall ' +
  'nach — und trage die Datei erst danach in NACHGEWIESENE_AUFRUFER ein. Fundstellen:';

describe('Aus-Zustand: kein Schreib-Aufrufer ohne eigenen Nachweis (4T-001794)', () => {
  it('kein Modul unter src/ nimmt eine Sperre, schreibt einen Beleg oder verdichtet', () => {
    const gefunden = findeSchreibAufrufer(QUELLDATEIEN);
    const dateien = gefunden.map((t) => t.datei);
    const fundstellen = gefunden.map((t) => `${t.datei} — ${t.bezeichner.join(', ')}`);
    expect(dateien, `${ANLEITUNG}\n${fundstellen.join('\n')}`).toEqual([...NACHGEWIESENE_AUFRUFER]);
  });

  it('liest genug Dateien, um etwas aussagen zu können', () => {
    // Ohne die Schranke wäre der Fall darüber auch dann grün, wenn das Sammeln
    // ins Leere liefe.
    expect(QUELLDATEIEN.length).toBeGreaterThanOrEqual(400);
    for (const rel of DEFINITIONS_MODULE) expect(quelltextVon(rel).length).toBeGreaterThan(200);
  });
});

describe('Aufrufer-Wächter: die Gegenprobe (4T-001794)', () => {
  const erfunden = (quelltext) => [{ rel: 'src/main/ipc/erfunden.js', quelltext }];

  it('meldet einen neuen Aufrufer des Beleg-Schreibwegs', () => {
    const treffer = findeSchreibAufrufer(
      erfunden(
        [
          "const { schreibeBeleg } = require('../database/change-log.js');",
          'async function speichere(pfad, angaben, deps) {',
          '  await schreibeBeleg(pfad, angaben, deps);',
          '}',
        ].join('\n'),
      ),
    );
    expect(treffer).toEqual([{ datei: 'src/main/ipc/erfunden.js', bezeichner: ['schreibeBeleg'] }]);
  });

  it('meldet auch einen nehmenden Sperr-Weg', () => {
    const treffer = findeSchreibAufrufer(erfunden('await verwaltung.nimm(wurzel, gegenstand);'));
    expect(treffer).toEqual([{ datei: 'src/main/ipc/erfunden.js', bezeichner: ['nimm'] }]);
  });

  it('meldet ein Vorkommen im Kommentar nicht', () => {
    const prosa = [
      '// Später ruft dieser Weg schreibeBeleg(...) und mitSperren(...) auf;',
      '// bis dahin entsteht hier kein Beleg.',
      '/**',
      ' * Auch verdichteBeiBedarf(...) gehört dann hierher.',
      ' */',
    ].join('\n');
    expect(findeSchreibAufrufer(erfunden(prosa))).toEqual([]);
  });

  it('lässt ein Definitions-Modul aus', () => {
    const selbst = [{ rel: 'src/main/database/change-log.js', quelltext: 'schreibeBeleg(a);' }];
    expect(findeSchreibAufrufer(selbst)).toEqual([]);
  });
});
