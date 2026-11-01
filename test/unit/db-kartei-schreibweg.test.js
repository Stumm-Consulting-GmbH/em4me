// 4T-002389 (Epic 3E-000265, Schnitt 1; Story 4S-001116 AK1 bis AK4): Der
// Schreibweg der Datenbank für Karteikarten — der Bestand liefert die
// Karteikarten, eine Änderung schreibt allein die geänderten Felder in den
// Dateikopf, «Neue Karteikarte» legt eine Datei an, «Als Karteikarte aufnehmen»
// trägt die Kennung in ein vorhandenes Dokument ein.
//
// **Eine eigene Prüfdatei**, weil die Prüfdateien der Schreib-Schnittstelle und
// der Kartei-Form an ihrem Größen-Budget stehen. Die Zeilen-Ersetzung des
// Dateikopfs selbst prüft `db-karteikarte.test.js` ohne Dateizugriff.
//
// **Echtes Dateisystem in temporären Ordnern** und die echte Klammer des
// Absichts-Protokolls, wie in `db-kartei-form.test.js`; die Regeln laufen über
// die echte Prüf-Naht mit einer gestellten Tabellen-Sicht (Muster
// `db-regel-verweis.test.js`).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { leseTabellenBestand } from '../../src/main/database/record-auftrag-bestand.js';
import { werteDes } from '../../src/main/database/record-auftrag-plan.js';
import { liesDatensatzListe } from '../../src/main/database/datensatz-liste.js';
import {
  KONSISTENZ_BEFUNDE,
  pruefeKonsistenz,
} from '../../src/main/database/konsistenz-pruefung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { verweisRegel } from '../../src/main/database/record-regel-verweis.js';
import { schluesselRegel } from '../../src/main/database/record-regel-schluessel.js';
import { berechtigungRegel } from '../../src/main/database/record-regel-berechtigung.js';
import { loeschschutzRegel } from '../../src/main/database/record-regel-loeschschutz.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { ABSICHT_PRAEFIX, erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import {
  WIEDERANLAUF_LAGEN,
  erzeugeWiederanlauf,
} from '../../src/main/database/intent-recovery.js';
import {
  belegPfadFuer,
  belegeDesDatensatzes,
  leseBelegDatei,
  schreibeBeleg,
} from '../../src/main/database/change-log.js';
import { ART_CREATE, ART_DELETE, ART_UPDATE } from '../../src/shared/database/change-record.js';
import { benenneUmMitWiederholung } from '../../src/main/documents/atomic-write.js';
import { verschiebeInPapierkorb } from '../../src/main/documents/papierkorb.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import { loeseRechte } from '../../src/shared/database/rechte.js';
import { legeRollenAus } from '../../src/shared/database/rollen-angaben.js';
import { setzeUhrVersatzAus } from '../uhr-versatz.js';

// Der Wiederanlauf misst das Alter von Protokollen an Datei-Zeiten (Muster
// `db-intent-recovery.test.js`).
setzeUhrVersatzAus('vergleicht die Uhr mit Datei-Zeiten (Alter gegen Frist)');

// --- Aufbau ----------------------------------------------------------------------------------

let tmpDirs = [];
let verwaltungen = [];

afterEach(async () => {
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const ZEITPUNKT = '2026-10-25T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Die Kartei-Tabelle «Autoren» mit dem Pflicht- und Schlüssel-Feld `name`.
const AUTOREN = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '      required: true',
  '    - name: ort',
  '  key: name',
  '  lastId: 2',
  '---',
  '',
  'Autoren des Verlags, je Autor eine Karteikarte.',
  '',
].join('\n');

// Die Karteikarte «Ada» mit fremden Angaben, die eine Änderung nicht berühren
// darf: eine Fluss-Liste, ein mehrzeiliger Wert und ein Anhang-Verweis im Text.
const ADA = [
  '---',
  'db-record: r-00001',
  'tags: [a, b]',
  'name: Ada',
  'notiz: |',
  '  erste Zeile',
  '  zweite Zeile',
  'ort: London',
  'aliases:',
  '  - Gräfin',
  '---',
  '',
  'Freier Text über Ada. ![[skizze.png]]',
  '',
].join('\n');

function kartei() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-schreiben-'));
  tmpDirs.push(wurzel);
  return {
    wurzel,
    autoren: lege(wurzel, 'Autoren/Autoren.md', AUTOREN),
    ada: lege(wurzel, 'Autoren/Ada.md', ADA),
    alan: lege(
      wurzel,
      'Autoren/Alan.md',
      ['---', 'db-record: r-2', 'name: Alan Turing', 'ort: Wilmslow', '---', ''].join('\n'),
    ),
    notiz: lege(
      wurzel,
      'Autoren/Notiz.md',
      ['---', 'name: Notiz', 'tags: [x]', '---', 'Text.', ''].join('\n'),
    ),
    unterordner: lege(
      wurzel,
      'Autoren/Alt/Bert.md',
      ['---', 'db-record: r-9', 'name: Bert', '---', ''].join('\n'),
    ),
  };
}

// Die Tabellen-Sicht des Index, gestellt: bereit, mit den genannten Kopf-Dateien.
function sichtMit(...kopfDateien) {
  return () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map(kopfDateien.map((pfad) => [pfad, ['table']])) },
  });
}

// 4T-002389 (Schritt 4): Der Papierkorb im Prüfstand, ein Stummel, der die
// Datei in einen eigenen Ordner verschiebt; gerufen über den geteilten Weg des
// Bereichs-Panels, damit die Begleit-Dateien wie im Betrieb mitgehen.
function papierkorbIn(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  return (pfad) =>
    verschiebeInPapierkorb(pfad, {
      trashItem: async (ziel) => fs.renameSync(ziel, path.join(ordner, path.basename(ziel))),
    });
}

function prozess({ pruefNaht, klammer, papierkorb } = {}) {
  const sperrVerwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(sperrVerwaltung);
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({
    sperrVerwaltung,
    ...KONFIG,
    ...(papierkorb ? { papierkorb } : {}),
    ...klammer,
  });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
    herkunft: () => HERKUNFT,
    ...(papierkorb ? { papierkorb } : {}),
  });
  const schnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
    ...(pruefNaht ? { pruefNaht } : {}),
  });
  return { schnittstelle, wiederanlauf };
}

function auftrag(schnittstelle, wurzel, ...anweisungen) {
  return schnittstelle.fuehreAuftragAus(wurzel, { anweisungen });
}

const neueKarte = (name) => ({
  tabelle: 'Autoren/Autoren.md',
  art: 'create',
  karteikarte: { name },
});

// Die Belege neben einer Bezugs-Datei, Tabelle oder Karteikarte (4T-002390).
async function belegeVon(bezugsPfad) {
  return (await leseBelegDatei(bezugsPfad)).belege.filter((b) => !b.beschaedigt);
}

function mddl(bezugsPfad) {
  return belegPfadFuer(bezugsPfad);
}

// --- Schritt 1: der Bestand liefert die Karteikarten ------------------------------------------

describe('Kartei-Schreibweg: Bestand und seine Verbraucher (4T-002389, Schritt 1)', () => {
  it('führt die Karteikarten des Ordners als Datensätze, ohne Dokument ohne Kennung und ohne Unterordner', async () => {
    const k = kartei();
    const bestand = await leseTabellenBestand(fs.promises, k.autoren, 'Autoren/Autoren.md');
    expect(bestand.ok).toBe(true);
    expect(bestand.ziel).toBeNull();
    expect(
      bestand.dateien.map((d) => [path.basename(d.pfad), d.kopf, d.karteikarte === true]),
    ).toEqual([
      ['Autoren.md', true, false],
      ['Ada.md', false, true],
      ['Alan.md', false, true],
    ]);
    const ada = bestand.dateien[1].records.get('r-00001');
    expect(werteDes(ada)).toEqual(['Ada', 'London']);
    expect(bestand.dateien[2].records.has('r-00002')).toBe(true);
  });

  it('liefert der Wertehilfe die Karteikarten mit Kennung, Anzeige und Schlüssel', async () => {
    const k = kartei();
    const liste = await liesDatensatzListe({
      fsp: fs.promises,
      wurzel: k.wurzel,
      sicht: sichtMit(k.autoren)().sicht,
      tabelle: 'Autoren',
    });
    expect(liste.status).toBe('ready');
    expect(liste.datensaetze.map((d) => [d.kennung, d.schluessel])).toEqual([
      ['r-00001', 'Ada'],
      ['r-00002', 'Alan Turing'],
    ]);
  });

  it('lässt einen Verweis auf eine Karteikarte die Verweis-Regel bestehen und weist ein fehlendes Ziel ab', async () => {
    const k = kartei();
    const buecher = lege(
      k.wurzel,
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
        '  lastId: 0',
        '---',
        '',
      ].join('\n'),
    );
    const pruefNaht = erzeugePruefNaht({
      regeln: [verweisRegel],
      tabellenSicht: sichtMit(k.autoren, buecher),
      fsp: fs.promises,
    });
    const { schnittstelle } = prozess({ pruefNaht });
    const gut = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Buecher.md',
      art: 'create',
      werte: { titel: 'Notes', autor: 'Ada' },
    });
    expect(gut.ok).toBe(true);
    // Die Verweis-Regel ersetzt den Schlüssel durch die Kennung der Karteikarte.
    expect(lies(buecher)).toContain('| r-00001');
    const fehlt = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Buecher.md',
      art: 'create',
      werte: { titel: 'Compiler', autor: 'Grace' },
    });
    expect(fehlt.ok).toBe(false);
    expect(fehlt.lagen[0].naht.code).toBe(REGEL_LAGEN.verweisZielFehlt);
  });

  it('erkennt im Stand-Vergleich eine zwischenzeitlich geänderte Karteikarte und schreibt nichts', async () => {
    const k = kartei();
    const geaendert = ADA.replace('ort: London', 'ort: Paris');
    fs.writeFileSync(k.ada, geaendert, 'utf8');
    const { schnittstelle } = prozess();
    const ergebnis = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'update',
      id: 'r-00001',
      werte: { ort: 'Rom' },
      erwartet: { name: 'Ada', ort: 'London' },
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen[0]).toMatchObject({
      code: LAGEN.standWeichtAb,
      felder: [{ name: 'ort', erwartet: 'London', vorgefunden: 'Paris' }],
    });
    expect(lies(k.ada)).toBe(geaendert);
  });
});

// --- Schritt 2: Ändern ------------------------------------------------------------------------

describe('Kartei-Schreibweg: Ändern (4T-002389, Schritt 2, AK3)', () => {
  it('schreibt allein das geänderte Feld; Freitext und fremde Angaben bleiben zeichengleich', async () => {
    const k = kartei();
    const { schnittstelle } = prozess();
    const ergebnis = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'update',
      id: 'r-00001',
      werte: { name: 'Ada', ort: 'Ockham' },
      erwartet: { name: 'Ada', ort: 'London' },
    });
    expect(ergebnis.ok).toBe(true);
    expect(lies(k.ada)).toBe(ADA.replace('ort: London', 'ort: Ockham'));
    expect(ergebnis.ergebnisse[0]).toMatchObject({
      felder: ['ort'],
      stand: { name: 'Ada', ort: 'Ockham' },
    });
    // 4T-002390 (AK1): Der Beleg steht neben der Karteikarte, nicht an der Tabelle.
    const belege = await belegeVon(k.ada);
    expect(belege.map((b) => [b.art, b.id])).toEqual([[ART_UPDATE, 'r-00001']]);
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
    expect(lies(k.autoren)).toBe(AUTOREN);
  });

  it('fügt ein Feld, das der Dateikopf nicht trägt, als neue Zeile an', async () => {
    const k = kartei();
    fs.writeFileSync(
      k.alan,
      ['---', 'db-record: r-2', 'name: Alan Turing', '---', 'Text.', ''].join('\n'),
    );
    const { schnittstelle } = prozess();
    const ergebnis = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'update',
      id: 'r-00002',
      werte: { ort: 'Bletchley: Park' },
      erwartet: { name: 'Alan Turing', ort: '' },
    });
    expect(ergebnis.ok).toBe(true);
    expect(lies(k.alan)).toBe(
      [
        '---',
        'db-record: r-2',
        'name: Alan Turing',
        'ort: "Bletchley: Park"',
        '---',
        'Text.',
        '',
      ].join('\n'),
    );
  });

  // 4T-002389 (Schnitt 2): Das Löschen einer vorhandenen Karteikarte läuft
  // seither; abgewiesen bleibt das Löschen einer von Hand entfernten, die keine
  // Datei mehr hat und deren Belege niemand übertragen könnte.
  it('weist das Löschen einer von Hand entfernten Karteikarte ab und schreibt nichts', async () => {
    const k = kartei();
    fs.rmSync(k.ada);
    const { schnittstelle } = prozess({ papierkorb: papierkorbIn(path.join(k.wurzel, 'Korb')) });
    const ergebnis = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'delete',
      id: 'r-00001',
      erwartet: { name: 'Ada', ort: 'London' },
    });
    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.karteiTabelle });
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
  });
});

// --- Schritt 3: Neue Karteikarte und Aufnahme ---------------------------------------------------

describe('Kartei-Schreibweg: Neue Karteikarte (4T-002389, Schritt 3, AK1, AK4)', () => {
  it('legt «<Schlüssel>.md» mit nächster Kennung und leerem Gerüst an und hebt den Hochwasserstand', async () => {
    const k = kartei();
    const { schnittstelle } = prozess();
    const ergebnis = await auftrag(schnittstelle, k.wurzel, neueKarte('Grace Hopper'));
    expect(ergebnis.ok).toBe(true);
    const neu = path.join(path.dirname(k.autoren), 'Grace Hopper.md');
    expect(lies(neu)).toBe(
      ['---', 'db-record: r-00003', 'name: Grace Hopper', 'ort:', '---', ''].join('\n'),
    );
    expect(lies(k.autoren)).toBe(AUTOREN.replace('lastId: 2', 'lastId: 3'));
    // 4T-002390 (AK1): Der Beleg des Anlegens liegt neben der neuen Karteikarte.
    const belege = await belegeVon(neu);
    expect(belege.map((b) => [b.art, b.id])).toEqual([[ART_CREATE, 'r-00003']]);
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
    const bestand = await leseTabellenBestand(fs.promises, k.autoren, 'Autoren/Autoren.md');
    expect(bestand.dateien.some((d) => d.records.has('r-00003'))).toBe(true);
  });

  it('weist einen unzulässigen Namen, eine vorhandene Datei und eine Schlüssel-Dublette ab und legt nichts an', async () => {
    const k = kartei();
    const pruefNaht = erzeugePruefNaht({
      regeln: [schluesselRegel],
      tabellenSicht: sichtMit(k.autoren),
      fsp: fs.promises,
    });
    const { schnittstelle } = prozess({ pruefNaht });
    const vorher = fs.readdirSync(path.dirname(k.autoren)).sort();
    for (const [name, code] of [
      ['a/b', LAGEN.karteiNameUngueltig],
      ['Frage?', LAGEN.karteiNameUngueltig],
      [' Rand', LAGEN.karteiNameUngueltig],
      ['Ada', LAGEN.karteiDateiVorhanden],
    ]) {
      const ergebnis = await auftrag(schnittstelle, k.wurzel, neueKarte(name));
      expect(ergebnis.code, name).toBe(code);
    }
    const dublette = await auftrag(schnittstelle, k.wurzel, neueKarte('Alan Turing'));
    expect(dublette.code).toBe(LAGEN.pruefBefund);
    expect(dublette.lagen[0].naht.code).toBe(REGEL_LAGEN.schluesselDoppeltImBestand);
    expect(fs.readdirSync(path.dirname(k.autoren)).sort()).toEqual(vorher);
    expect(lies(k.autoren)).toBe(AUTOREN);
  });

  it('weist ohne Erlaubnis «anlegen» ab wie in der Tabellen-Form', async () => {
    const k = kartei();
    const { rollen } = legeRollenAus({ roles: { gast: { Autoren: ['update'] } } });
    const pruefNaht = erzeugePruefNaht({
      regeln: [berechtigungRegel],
      rechteFuer: async () => ({
        status: 'ready',
        ...loeseRechte({ rollen, tabellenNamen: ['Autoren'], defaultRole: 'gast' }),
      }),
    });
    const { schnittstelle } = prozess({ pruefNaht });
    const ergebnis = await auftrag(schnittstelle, k.wurzel, neueKarte('Grace Hopper'));
    expect(ergebnis.code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.lagen[0].naht.code).toBe(REGEL_LAGEN.nichtErlaubt);
    expect(fs.existsSync(path.join(path.dirname(k.autoren), 'Grace Hopper.md'))).toBe(false);
  });
});

describe('Kartei-Schreibweg: Als Karteikarte aufnehmen (4T-002389, Schritt 3, AK2)', () => {
  it('trägt Kennung ein, hebt den Hochwasserstand und lässt die übrigen Angaben zeichengleich', async () => {
    const k = kartei();
    const { schnittstelle } = prozess();
    const vorher = lies(k.notiz);
    const sicht = {
      dbKindsPerFile: new Map([[k.autoren, ['table']]]),
      files: new Map([k.autoren, k.ada, k.alan, k.notiz].map((p) => [p, []])),
    };
    const ohneKennung = async () =>
      (await pruefeKonsistenz({ fsp: fs.promises, wurzel: k.wurzel, sicht })).befunde.filter(
        (b) => b.code === KONSISTENZ_BEFUNDE.karteiOhneKennung,
      );
    expect(await ohneKennung()).toHaveLength(1);
    const ergebnis = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'create',
      karteikarte: { aufnehmen: 'Autoren/Notiz.md' },
    });
    expect(ergebnis.ok).toBe(true);
    expect(lies(k.notiz)).toBe(vorher.replace('tags: [x]\n', 'tags: [x]\ndb-record: r-00003\n'));
    expect(lies(k.autoren)).toBe(AUTOREN.replace('lastId: 2', 'lastId: 3'));
    // 4T-002390 (AK1): Der Beleg der Aufnahme liegt neben dem aufgenommenen Dokument.
    const belege = await belegeVon(k.notiz);
    expect(belege).toHaveLength(1);
    expect(belege[0]).toMatchObject({ art: ART_CREATE, id: 'r-00003' });
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
    expect(belege[0].felder.map((f) => [f.name, f.neu])).toEqual([
      ['name', 'Notiz'],
      ['ort', ''],
    ]);
    // Die Meldung der Konsistenz-Prüfung «Dokument ohne Kennung» entfällt.
    expect(await ohneKennung()).toEqual([]);
  });

  it('nimmt kein Dokument mit Kennung, keines außerhalb des Ordners und keines außerhalb des Bereichs auf', async () => {
    const k = kartei();
    const { schnittstelle } = prozess();
    for (const angabe of ['Autoren/Ada.md', 'Autoren/Alt/Bert.md', '../fremd.md']) {
      const ergebnis = await auftrag(schnittstelle, k.wurzel, {
        tabelle: 'Autoren/Autoren.md',
        art: 'create',
        karteikarte: { aufnehmen: angabe },
      });
      expect(ergebnis.code, angabe).toBe(LAGEN.karteiAufnahmeUnmoeglich);
    }
    expect(lies(k.ada)).toBe(ADA);
    expect(lies(k.autoren)).toBe(AUTOREN);
  });
});

// --- Wiederherstellung nach einem Abbruch (Schritt 1, Absichts-Protokoll) ---------------------

describe('Kartei-Schreibweg: Wiederanlauf nach einem Abbruch (4T-002389, Schritt 1)', () => {
  it('schreibt eine nach der Marke abgebrochene neue Karteikarte beim nächsten Aufräumen zu Ende', async () => {
    const k = kartei();
    let melde;
    const erreicht = new Promise((r) => (melde = r));
    let gezaehlt = 0;
    // Das erste Umbenennen nach der Marke hängt, wie ein Absturz es hinterließe.
    const klammer = {
      benenneUm: async (von, nach, opts) => {
        gezaehlt += 1;
        if (gezaehlt === 1) {
          melde();
          return new Promise(() => {});
        }
        return benenneUmMitWiederholung(von, nach, opts);
      },
    };
    void auftrag(prozess({ klammer }).schnittstelle, k.wurzel, neueKarte('Grace Hopper'));
    await erreicht;
    const sperrOrdner = path.join(k.wurzel, DEFAULT_LOCK_FOLDER_NAME);
    expect(fs.readdirSync(sperrOrdner).filter((n) => n.startsWith(ABSICHT_PRAEFIX))).toHaveLength(
      1,
    );

    const ergebnis = await prozess().wiederanlauf.raeumeAuf(k.wurzel);

    expect(ergebnis.ergebnisse[0].lage).toBe(WIEDERANLAUF_LAGEN.fertiggeschrieben);
    const neu = path.join(path.dirname(k.autoren), 'Grace Hopper.md');
    expect(lies(neu)).toContain('db-record: r-00003');
    expect(lies(k.autoren)).toContain('lastId: 3');
    // 4T-002390: Das Protokoll führt die Beleg-Datei neben der Karteikarte; der
    // Wiederanlauf ergänzt genau sie.
    expect(await belegeVon(neu)).toHaveLength(1);
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
  });
});

// --- 4T-002390: die Beleg-Datei neben der Karteikarte (Schritt 1, S4) --------------------------

describe('Kartei-Schreibweg: Belege neben der Karteikarte (4T-002390, Schritt 1, AK1, AK4)', () => {
  const aendere = (schnittstelle, wurzel, alt, neu) =>
    auftrag(schnittstelle, wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'update',
      id: 'r-00001',
      werte: { ort: neu },
      erwartet: { name: 'Ada', ort: alt },
    });

  it('führt die Kette einer Karteikarte in ihrer Beleg-Datei, lückenlos und ohne die Tabelle zu berühren', async () => {
    const k = kartei();
    const { schnittstelle } = prozess();
    expect((await aendere(schnittstelle, k.wurzel, 'London', 'Ockham')).ok).toBe(true);
    expect((await aendere(schnittstelle, k.wurzel, 'Ockham', 'Paris')).ok).toBe(true);
    const gelesen = await belegeDesDatensatzes(k.ada, 'r-00001');
    expect(gelesen.belege.map((b) => [b.art, b.felder[0].alt, b.felder[0].neu])).toEqual([
      [ART_UPDATE, 'London', 'Ockham'],
      [ART_UPDATE, 'Ockham', 'Paris'],
    ]);
    expect(gelesen.verkettung.lueckenlos).toBe(true);
    expect(fs.existsSync(mddl(k.alan))).toBe(false);
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
  });

  it('verdichtet die Beleg-Datei der Karteikarte nach den Grenzen der Tabelle, wie in der Tabellen-Form', async () => {
    const k = kartei();
    fs.writeFileSync(
      k.autoren,
      AUTOREN.replace(
        '  lastId: 2',
        '  changeLog:\n    maxBytes: 1\n    maxPerRecord: 1\n  lastId: 2',
      ),
      'utf8',
    );
    // Zwei Belege voraus, damit schon die erste Prüfung etwas zu tun findet
    // (Drossel, Begründung in `db-record-auftrag-sperren.test.js`).
    for (const [vorgang, alt, neu] of [
      [100, 'Basel', 'Chur'],
      [101, 'Chur', 'London'],
    ]) {
      const geschrieben = await schreibeBeleg(
        k.ada,
        { art: 'update', id: 'r-00001', vorgang, felder: [{ name: 'ort', alt, neu }] },
        { jetzt: () => ZEITPUNKT, herkunft: () => HERKUNFT },
      );
      expect(geschrieben.ok).toBe(true);
    }
    const { schnittstelle } = prozess();
    const ergebnis = await aendere(schnittstelle, k.wurzel, 'London', 'Ockham');
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.verdichtung).toEqual([
      expect.objectContaining({ pfad: mddl(k.ada), verdichtet: true, grund: null }),
    ]);
    const gelesen = await belegeDesDatensatzes(k.ada, 'r-00001');
    expect(gelesen.belege.map((b) => b.art)).toEqual(['merged', ART_UPDATE]);
    expect(gelesen.verkettung.lueckenlos).toBe(true);
  });

  it('beginnt eine neue Karteikarte gleichen Namens nach dem Löschen der alten mit leerer Kette', async () => {
    const k = kartei();
    const { schnittstelle } = prozess({ papierkorb: papierkorbIn(path.join(k.wurzel, 'Korb')) });
    expect((await auftrag(schnittstelle, k.wurzel, neueKarte('Grace Hopper'))).ok).toBe(true);
    const grace = path.join(path.dirname(k.autoren), 'Grace Hopper.md');
    expect(await belegeVon(grace)).toHaveLength(1);
    // 4T-002389 (Schnitt 2): gelöscht über die Datenbank, samt Übertragung.
    const geloescht = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'delete',
      id: 'r-00003',
      erwartet: { name: 'Grace Hopper', ort: '' },
    });
    expect(geloescht.ok).toBe(true);
    expect(fs.existsSync(mddl(grace))).toBe(false);
    expect((await auftrag(schnittstelle, k.wurzel, neueKarte('Grace Hopper'))).ok).toBe(true);
    const neu = await belegeVon(grace);
    expect(neu.map((b) => [b.art, b.id])).toEqual([[ART_CREATE, 'r-00004']]);
  });
});

// --- 4T-002389, Schnitt 2: Löschen (Schritt 4, F6 B) und Pflicht-Felder (F4 A) ----------------

describe('Kartei-Schreibweg: Löschen (4T-002389, Schritt 4, AK4, AK5; 4T-002390, AK4)', () => {
  const loescheAda = (schnittstelle, wurzel, ort = 'Paris') =>
    auftrag(schnittstelle, wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'delete',
      id: 'r-00001',
      erwartet: { name: 'Ada', ort },
    });

  // Zwei Änderungen, damit die Beleg-Datei der Karteikarte eine Kette trägt.
  async function adaMitKette(schnittstelle, wurzel) {
    for (const [alt, neu] of [
      ['London', 'Ockham'],
      ['Ockham', 'Paris'],
    ]) {
      const ergebnis = await auftrag(schnittstelle, wurzel, {
        tabelle: 'Autoren/Autoren.md',
        art: 'update',
        id: 'r-00001',
        werte: { ort: neu },
        erwartet: { name: 'Ada', ort: alt },
      });
      expect(ergebnis.ok).toBe(true);
    }
  }

  // Die Kette von Ada an der Tabelle: Arten, Lösch-Beleg einmal, lückenlos.
  async function erwarteKetteAnDerTabelle(k) {
    const gelesen = await belegeDesDatensatzes(k.autoren, 'r-00001');
    expect(gelesen.belege.map((b) => b.art)).toEqual([ART_UPDATE, ART_UPDATE, ART_DELETE]);
    expect(gelesen.verkettung.lueckenlos).toBe(true);
    expect(fs.existsSync(k.ada)).toBe(false);
    expect(fs.existsSync(mddl(k.ada))).toBe(false);
  }

  it('trägt Kette samt Lösch-Beleg an die Tabelle und gibt Karteikarte und Beleg-Datei in den Papierkorb', async () => {
    const k = kartei();
    const korb = path.join(k.wurzel, 'Korb');
    const { schnittstelle } = prozess({ papierkorb: papierkorbIn(korb) });
    await adaMitKette(schnittstelle, k.wurzel);
    const ergebnis = await loescheAda(schnittstelle, k.wurzel);
    expect(ergebnis.ok).toBe(true);
    await erwarteKetteAnDerTabelle(k);
    expect(fs.readdirSync(korb).sort()).toEqual(['Ada.md', 'Ada.mddl']);
    expect(lies(path.join(korb, 'Ada.md'))).toContain('ort: Paris');
    // Die Tabelle bleibt unberührt, ebenso die andere Karteikarte.
    expect(lies(k.autoren)).toBe(AUTOREN);
    const bestand = await leseTabellenBestand(fs.promises, k.autoren, 'Autoren/Autoren.md');
    expect(bestand.dateien.map((d) => path.basename(d.pfad))).toEqual(['Autoren.md', 'Alan.md']);
  });

  it('weist das Löschen einer verwiesenen Karteikarte ab wie in der Tabellen-Form', async () => {
    const k = kartei();
    const buecher = lege(
      k.wurzel,
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
        '  lastId: 0',
        '---',
        '',
      ].join('\n'),
    );
    const korb = path.join(k.wurzel, 'Korb');
    const pruefNaht = erzeugePruefNaht({
      regeln: [verweisRegel, loeschschutzRegel],
      tabellenSicht: sichtMit(k.autoren, buecher),
      fsp: fs.promises,
    });
    const { schnittstelle } = prozess({ pruefNaht, papierkorb: papierkorbIn(korb) });
    const buch = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Buecher.md',
      art: 'create',
      werte: { titel: 'Notes', autor: 'Ada' },
    });
    expect(buch.ok).toBe(true);
    const ergebnis = await loescheAda(schnittstelle, k.wurzel, 'London');
    expect(ergebnis.code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.lagen[0].naht.code).toBe(REGEL_LAGEN.loeschenAbhaengige);
    expect(lies(k.ada)).toBe(ADA);
    expect(fs.readdirSync(korb)).toEqual([]);
    expect(fs.existsSync(mddl(k.autoren))).toBe(false);
  });

  it('vollendet ein zwischen Protokoll und Anfügen abgebrochenes Löschen beim Wiederanlauf', async () => {
    const k = kartei();
    const korb = papierkorbIn(path.join(k.wurzel, 'Korb'));
    await adaMitKette(prozess({ papierkorb: korb }).schnittstelle, k.wurzel);
    let melde;
    const erreicht = new Promise((r) => (melde = r));
    // Das erste Anfügen nach der Marke hängt, wie ein Absturz es hinterließe.
    const fsp = Object.assign(Object.create(fs.promises), {
      appendFile: () => {
        melde();
        return new Promise(() => {});
      },
    });
    void loescheAda(prozess({ papierkorb: korb, klammer: { fsp } }).schnittstelle, k.wurzel);
    await erreicht;
    expect(fs.existsSync(k.ada)).toBe(true);

    const ergebnis = await prozess({ papierkorb: korb }).wiederanlauf.raeumeAuf(k.wurzel);

    expect(ergebnis.ergebnisse[0].lage).toBe(WIEDERANLAUF_LAGEN.fertiggeschrieben);
    await erwarteKetteAnDerTabelle(k);
  });

  it('vollendet ein zwischen Anfügen und Papierkorb abgebrochenes Löschen ohne doppelte Belege', async () => {
    const k = kartei();
    const korbOrdner = path.join(k.wurzel, 'Korb');
    const korb = papierkorbIn(korbOrdner);
    await adaMitKette(prozess({ papierkorb: korb }).schnittstelle, k.wurzel);
    let melde;
    const erreicht = new Promise((r) => (melde = r));
    const haengt = () => {
      melde();
      return new Promise(() => {});
    };
    void loescheAda(prozess({ papierkorb: haengt }).schnittstelle, k.wurzel);
    await erreicht;
    // Angefügt ist schon, die Karteikarte liegt noch da.
    expect((await belegeDesDatensatzes(k.autoren, 'r-00001')).belege).toHaveLength(3);
    expect(fs.existsSync(k.ada)).toBe(true);

    const ergebnis = await prozess({ papierkorb: korb }).wiederanlauf.raeumeAuf(k.wurzel);

    expect(ergebnis.ergebnisse[0]).toMatchObject({
      lage: WIEDERANLAUF_LAGEN.fertiggeschrieben,
      belege: { angefuegt: 0, uebersprungen: 1 },
    });
    await erwarteKetteAnDerTabelle(k);
    expect(fs.readdirSync(korbOrdner).sort()).toEqual(['Ada.md', 'Ada.mddl']);
  });
});

describe('Kartei-Schreibweg: Pflicht-Felder beim Anlegen (Steuer-Sitzung zu Schnitt 1, F4 A)', () => {
  it('legt das leere Gerüst auch mit weiterem Pflicht-Feld an; die Konsistenz-Prüfung meldet es', async () => {
    const k = kartei();
    fs.writeFileSync(
      k.autoren,
      AUTOREN.replace('    - name: ort\n', '    - name: ort\n      required: true\n'),
      'utf8',
    );
    const { schnittstelle } = prozess();
    const ergebnis = await auftrag(schnittstelle, k.wurzel, neueKarte('Grace Hopper'));
    expect(ergebnis.ok).toBe(true);
    const neu = path.join(path.dirname(k.autoren), 'Grace Hopper.md');
    expect(lies(neu)).toContain('ort:\n');
    const sicht = {
      dbKindsPerFile: new Map([[k.autoren, ['table']]]),
      files: new Map([k.autoren, k.ada, k.alan, neu].map((p) => [p, []])),
    };
    const pflicht = (await pruefeKonsistenz({ fsp: fs.promises, wurzel: k.wurzel, sicht })).befunde
      .filter((b) => b.code === KONSISTENZ_BEFUNDE.pflichtFehlt)
      .map((b) => b.feld);
    expect(pflicht).toEqual(['ort']);
    // Beim Ändern gilt die Pflicht am Ergebnis weiter.
    const aendern = await auftrag(schnittstelle, k.wurzel, {
      tabelle: 'Autoren/Autoren.md',
      art: 'update',
      id: 'r-00003',
      werte: { name: 'Grace B. Hopper' },
      erwartet: { name: 'Grace Hopper', ort: '' },
    });
    expect(aendern.code).toBe(LAGEN.pflichtFehlt);
  });
});
