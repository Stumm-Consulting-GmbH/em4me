// 4T-002405 (Epic 3E-000266, F4 A, F5 A; Story 4S-001127, AK1 bis AK4, AK6):
// Löschen und Kopieren einer Karteikarte im Bereichs-Panel als Aufträge der
// Datenbank.
//
// Geprüft wird an den ECHTEN Kanälen (`area:trashFile`, `area:copyFile`,
// `area:confirmTrashFile`) mit den echten Weichen (`kartei-weichen.js`) und
// der echten Schreib-Schnittstelle samt Klammer des Absichts-Protokolls, am
// echten Dateisystem in temporären Ordnern (Muster `db-kartei-schreibweg.test.js`).
// Die Regeln laufen über die echte Prüf-Naht mit einer gestellten Tabellen-Sicht.
//
// **Eine eigene Prüfdatei** statt Fällen in `area-loeschen.test.js` und
// `area-kopieren.test.js`: Der Gegenstand ist die Weiche zwischen den Kanälen
// und der Schnittstelle, und der Aufbau der Schnittstelle stünde sonst zweimal.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { erzeugeKarteiWeichen } from '../../src/main/database/kartei-weichen.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { verweisRegel } from '../../src/main/database/record-regel-verweis.js';
import { schluesselRegel } from '../../src/main/database/record-regel-schluessel.js';
import { loeschschutzRegel } from '../../src/main/database/record-regel-loeschschutz.js';
import { berechtigungRegel } from '../../src/main/database/record-regel-berechtigung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import {
  belegPfadFuer,
  belegeDesDatensatzes,
  leseBelegDatei,
} from '../../src/main/database/change-log.js';
import { ART_CREATE, ART_DELETE, ART_UPDATE } from '../../src/shared/database/change-record.js';
import { verschiebeInPapierkorb } from '../../src/main/documents/papierkorb.js';
import { loeseRechte } from '../../src/shared/database/rechte.js';
import { legeRollenAus } from '../../src/shared/database/rollen-angaben.js';
import { setzeUhrVersatzAus } from '../uhr-versatz.js';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');
const { registerAreaCopyIpc } = require('../../src/main/ipc/area-copy.js');
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');

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

const ZEITPUNKT = '2026-10-27T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };
const IST_MARKDOWN = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

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
  'Autoren des Verlags.',
  '',
].join('\n');

// Ada mit fremden Angaben und Freitext, die eine Kopie zeichengleich übernimmt.
const ADA = [
  '---',
  'db-record: r-00001',
  'tags: [a, b]',
  'name: Ada',
  'ort: London',
  '---',
  '',
  'Freier Text über Ada. ![[skizze.png]]',
  '',
].join('\n');

const BUECHER = [
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
].join('\n');

function kartei() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-weichen-'));
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
    notiz: lege(wurzel, 'Autoren/Notiz.md', ['---', 'name: Notiz', '---', 'Text.', ''].join('\n')),
    bert: lege(
      wurzel,
      'Autoren/Alt/Bert.md',
      ['---', 'db-record: r-9', 'name: Bert', '---', ''].join('\n'),
    ),
    buecher: lege(wurzel, 'Buecher.md', BUECHER),
  };
}

function sichtMit(...kopfDateien) {
  return () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map(kopfDateien.map((pfad) => [pfad, ['table']])) },
  });
}

function papierkorbIn(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  return (pfad) =>
    verschiebeInPapierkorb(pfad, {
      trashItem: async (ziel) => fs.renameSync(ziel, path.join(ordner, path.basename(ziel))),
    });
}

// Ein Prozess mit Schnittstelle, Weichen und den drei Kanälen. `aktiv` ist der
// Schalter der Erweiterung «Datenbank»; der Papierkorb der Kanäle selbst
// (`shell.trashItem`) zeichnet seine Aufrufe auf, damit sichtbar ist, welcher
// Weg gegangen wurde.
function prozess(
  k,
  { regeln = [verweisRegel, schluesselRegel, loeschschutzRegel], rechteFuer, aktiv = true } = {},
) {
  const korb = path.join(k.wurzel, '..', `${path.basename(k.wurzel)}-korb`);
  tmpDirs.push(korb);
  const papierkorb = papierkorbIn(korb);
  const sperrVerwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(sperrVerwaltung);
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, ...KONFIG, papierkorb });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
    herkunft: () => HERKUNFT,
    papierkorb,
  });
  const pruefNaht = erzeugePruefNaht({
    regeln,
    tabellenSicht: sichtMit(k.autoren, k.buecher),
    fsp: fs.promises,
    ...(rechteFuer ? { rechteFuer } : {}),
  });
  const schnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
    pruefNaht,
  });
  const auftraege = [];
  const gezaehlt = {
    fuehreAuftragAus: (wurzel, auftrag) => {
      auftraege.push(auftrag);
      return schnittstelle.fuehreAuftragAus(wurzel, auftrag);
    },
  };
  const karteiWeichen = erzeugeKarteiWeichen({
    schreibSchnittstelle: gezaehlt,
    erweiterungAktiv: () => aktiv,
    fsp: fs.promises,
  });
  const shellAufrufe = [];
  const gezeigt = [];
  const handler = new Map();
  const handle = (kanal, fn) => handler.set(kanal, fn);
  const gemeinsam = {
    senderWindow: () => ({}),
    areaOfWindow: () => ({ rootPath: k.wurzel, name: 'Bereich' }),
    isMarkdownPath: IST_MARKDOWN,
    karteiWeichen,
  };
  registerAreasIpc(handle, {
    ...gemeinsam,
    dialog: {},
    shell: {
      trashItem: async (p) => {
        shellAufrufe.push(p);
        fs.renameSync(p, path.join(korb, path.basename(p)));
      },
    },
    tForWindow: (_w, key) => key,
    appRegistry: {},
    getStore: () => null,
  });
  registerAreaCopyIpc(handle, gemeinsam);
  registerDialogsIpc(handle, {
    ...gemeinsam,
    app: { getPath: () => os.tmpdir() },
    dialog: {
      showMessageBox: async (_owner, optionen) => {
        gezeigt.push(optionen);
        return { response: 0 };
      },
    },
    shell: {},
    session: {},
    tForWindow: (_w, key) => (key === 'areaPanel.deleteConfirmCard' ? 'Karte von {tabelle}' : key),
    getStore: () => null,
  });
  const kanal =
    (name) =>
    (...args) =>
      handler.get(name)({}, ...args);
  return {
    schnittstelle,
    korb,
    auftraege,
    shellAufrufe,
    gezeigt,
    loesche: kanal('area:trashFile'),
    kopiere: kanal('area:copyFile'),
    rueckfrage: kanal('area:confirmTrashFile'),
    istKarteikarte: kanal('area:istKarteikarte'),
  };
}

// Eine Änderung an Ada, damit ihre Beleg-Datei eine Kette trägt.
async function adaMitKette(p, k) {
  const ergebnis = await p.schnittstelle.fuehreAuftragAus(k.wurzel, {
    anweisungen: [
      {
        tabelle: 'Autoren/Autoren.md',
        art: 'update',
        id: 'r-00001',
        werte: { ort: 'Paris' },
        erwartet: { name: 'Ada', ort: 'London' },
      },
    ],
  });
  expect(ergebnis.ok).toBe(true);
  return lies(k.ada);
}

async function belegeVon(bezugsPfad) {
  return (await leseBelegDatei(bezugsPfad)).belege.filter((b) => !b.beschaedigt);
}

function inhalt(ordner) {
  return fs.existsSync(ordner) ? fs.readdirSync(ordner).sort() : [];
}

// --- Löschen ----------------------------------------------------------------------------------

describe('Löschen einer Karteikarte im Bereichs-Panel (4T-002405, F4 A)', () => {
  it('gibt eine nicht verwiesene Karteikarte als Lösch-Auftrag: Belege samt Lösch-Beleg an der Tabelle, Karteikarte und Beleg-Datei im Papierkorb (AK1)', async () => {
    const k = kartei();
    const p = prozess(k);
    await adaMitKette(p, k);

    const ergebnis = await p.loesche(k.ada);

    expect(ergebnis).toEqual({ ok: true, path: k.ada, datenbank: true });
    expect(p.auftraege.at(-1).anweisungen).toEqual([
      { tabelle: k.autoren, art: 'delete', id: 'r-00001', erwartet: {} },
    ]);
    const kette = await belegeDesDatensatzes(k.autoren, 'r-00001');
    expect(kette.belege.map((b) => b.art)).toEqual([ART_UPDATE, ART_DELETE]);
    expect(kette.verkettung.lueckenlos).toBe(true);
    expect(inhalt(p.korb)).toEqual(['Ada.md', 'Ada.mddl']);
    expect(fs.existsSync(k.ada)).toBe(false);
    // Der Papierkorb des Kanals selbst wird nicht gerufen: Den Weg geht die Klammer.
    expect(p.shellAufrufe).toEqual([]);
  });

  it('weist eine verwiesene Karteikarte ab, lässt sie unberührt und liefert den Grund (AK2)', async () => {
    const k = kartei();
    const p = prozess(k);
    const buch = await p.schnittstelle.fuehreAuftragAus(k.wurzel, {
      anweisungen: [
        { tabelle: 'Buecher.md', art: 'create', werte: { titel: 'Notes', autor: 'Ada' } },
      ],
    });
    expect(buch.ok).toBe(true);

    const ergebnis = await p.loesche(k.ada);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toBe('database');
    expect(ergebnis.datenbank.code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.datenbank.lagen[0].naht.code).toBe(REGEL_LAGEN.loeschenAbhaengige);
    expect(lies(k.ada)).toBe(ADA);
    expect(inhalt(p.korb)).toEqual([]);
    expect(p.shellAufrufe).toEqual([]);
  });

  it('löscht ein Dokument ohne Kennung im Kartei-Ordner und eine Datei im Unterordner wie jede Datei (AK5)', async () => {
    const k = kartei();
    const p = prozess(k);

    expect(await p.loesche(k.notiz)).toEqual({ ok: true, path: k.notiz });
    expect(await p.loesche(k.bert)).toEqual({ ok: true, path: k.bert });

    expect(p.shellAufrufe).toEqual([path.resolve(k.notiz), path.resolve(k.bert)]);
    expect(p.auftraege).toEqual([]);
  });

  it('löscht im Aus-Zustand der Erweiterung eine Karteikarte wie jede Datei', async () => {
    const k = kartei();
    const p = prozess(k, { aktiv: false });

    expect(await p.loesche(k.ada)).toEqual({ ok: true, path: k.ada });

    expect(p.shellAufrufe).toEqual([path.resolve(k.ada)]);
    expect(p.auftraege).toEqual([]);
  });
});

describe('Rückfrage vor dem Löschen einer Karteikarte (4T-002405, F4 A)', () => {
  it('beantwortet dem Lösch-Weg, ob die Datei eine Karteikarte ist', async () => {
    const k = kartei();
    const an = prozess(k);
    expect(await an.istKarteikarte(k.ada)).toBe(true);
    expect(await an.istKarteikarte(k.notiz)).toBe(false);
    expect(await an.istKarteikarte(k.bert)).toBe(false);
    expect(await an.istKarteikarte(path.join(k.wurzel, '..', 'fremd.md'))).toBe(false);
    const aus = prozess(k, { aktiv: false });
    expect(await aus.istKarteikarte(k.ada)).toBe(false);
  });

  it('nennt bei einer Karteikarte den Weg über die Datenbank samt Tabelle statt der Begleit-Datei', async () => {
    const k = kartei();
    const p = prozess(k);
    await adaMitKette(p, k);

    expect(await p.rueckfrage('Ada.md', k.ada)).toBe(true);
    expect(await p.rueckfrage('Notiz.md', k.notiz)).toBe(true);

    const [karte, notiz] = p.gezeigt;
    expect(karte.detail).toBe('areaPanel.deleteConfirmDetail Karte von Autoren');
    expect(notiz.detail).toBe('areaPanel.deleteConfirmDetail');
  });

  it('bleibt im Aus-Zustand der Erweiterung die Rückfrage einer Datei mit Begleit-Datei', async () => {
    const k = kartei();
    const p = prozess(k, { aktiv: false });
    fs.writeFileSync(belegPfadFuer(k.ada), '## Belege\n', 'utf8');

    await p.rueckfrage('Ada.md', k.ada);

    expect(p.gezeigt[0].detail).toBe(
      'areaPanel.deleteConfirmDetail areaPanel.deleteConfirmCompanion',
    );
  });
});

// --- Kopieren ---------------------------------------------------------------------------------

describe('Kopieren einer Karteikarte im Bereichs-Panel (4T-002405, F5 A)', () => {
  it('legt die Kopie als Anlege-Auftrag an: neue Kennung, Schlüssel gleich dem Namen, übrige Felder und Freitext der Vorlage, Anlege-Beleg (AK3)', async () => {
    const k = kartei();
    const p = prozess(k);
    const vorlage = await adaMitKette(p, k);
    const ketteVorher = await belegeVon(k.ada);

    const ergebnis = await p.kopiere(k.ada);

    const kopie = path.join(path.dirname(k.ada), 'Ada-1.md');
    expect(ergebnis).toMatchObject({ ok: true, path: kopie, name: 'Ada-1.md' });
    expect(lies(kopie)).toBe(
      vorlage
        .replace('db-record: r-00001', 'db-record: r-00003')
        .replace('name: Ada', 'name: Ada-1'),
    );
    expect(lies(k.autoren)).toBe(AUTOREN.replace('lastId: 2', 'lastId: 3'));
    // Die Kopie trägt allein ihren Anlege-Beleg; die Kette der Vorlage bleibt bei ihr.
    const belege = await belegeVon(kopie);
    expect(belege.map((b) => [b.art, b.id])).toEqual([[ART_CREATE, 'r-00003']]);
    expect(await belegeVon(k.ada)).toEqual(ketteVorher);
    expect(lies(k.ada)).toBe(vorlage);
  });

  it('nimmt die nächste Nummer, wenn der Name als Datei oder als Schlüssel vergeben ist', async () => {
    const k = kartei();
    lege(k.wurzel, 'Autoren/Ada-1.md', '# belegt\n');
    lege(
      k.wurzel,
      'Autoren/Zweit.md',
      ['---', 'db-record: r-00005', 'name: Ada-2', '---', ''].join('\n'),
    );
    const p = prozess(k);

    const ergebnis = await p.kopiere(k.ada);

    expect(ergebnis).toMatchObject({ ok: true, name: 'Ada-3.md' });
    expect(lies(path.join(path.dirname(k.ada), 'Ada-3.md'))).toContain('name: Ada-3\n');
    expect(fs.existsSync(path.join(path.dirname(k.ada), 'Ada-2.md'))).toBe(false);
  });

  it('legt bei einer Abweisung nichts an und liefert den Grund (AK3)', async () => {
    const k = kartei();
    const { rollen } = legeRollenAus({ roles: { gast: { Autoren: ['update'] } } });
    const p = prozess(k, {
      regeln: [berechtigungRegel],
      rechteFuer: async () => ({
        status: 'ready',
        ...loeseRechte({ rollen, tabellenNamen: ['Autoren'], defaultRole: 'gast' }),
      }),
    });
    const vorher = inhalt(path.dirname(k.ada));

    const ergebnis = await p.kopiere(k.ada);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toBe('database');
    expect(ergebnis.datenbank.lagen[0].naht.code).toBe(REGEL_LAGEN.nichtErlaubt);
    expect(inhalt(path.dirname(k.ada))).toEqual(vorher);
    expect(lies(k.autoren)).toBe(AUTOREN);
  });

  // 4T-002545 (Epic 3E-000368): Die Kopie fordert die Ausnahme von der
  // Pflicht-Prüfung ausdrücklich an und verhält sich damit wie zuvor.
  it('kopiert auch eine Vorlage, der ein Pflicht-Feld fehlt', async () => {
    const k = kartei();
    fs.writeFileSync(
      k.autoren,
      AUTOREN.replace('- name: ort\n', '- name: ort\n      required: true\n'),
    );
    const ohne = lege(
      k.wurzel,
      'Autoren/Ohne.md',
      ['---', 'db-record: r-00007', 'name: Ohne', '---', ''].join('\n'),
    );
    const p = prozess(k);

    const ergebnis = await p.kopiere(ohne);

    expect(ergebnis).toMatchObject({ ok: true, name: 'Ohne-1.md' });
    expect(p.auftraege[0].anweisungen[0].pflichtAussetzen).toBe(true);
    expect(lies(path.join(path.dirname(ohne), 'Ohne-1.md'))).toContain('name: Ohne-1\n');
  });

  it('kopiert ein Dokument ohne Kennung wie jede Datei (AK5)', async () => {
    const k = kartei();
    const p = prozess(k);

    const ergebnis = await p.kopiere(k.notiz);

    expect(ergebnis).toMatchObject({ ok: true, name: 'Notiz-1.md' });
    expect(lies(path.join(path.dirname(k.notiz), 'Notiz-1.md'))).toBe(lies(k.notiz));
    expect(p.auftraege).toEqual([]);
  });

  it('kopiert im Aus-Zustand der Erweiterung eine Karteikarte wie jede Datei', async () => {
    const k = kartei();
    const p = prozess(k, { aktiv: false });

    const ergebnis = await p.kopiere(k.ada);

    expect(ergebnis).toMatchObject({ ok: true, name: 'Ada-1.md' });
    expect(lies(path.join(path.dirname(k.ada), 'Ada-1.md'))).toBe(ADA);
    expect(p.auftraege).toEqual([]);
    expect(lies(k.autoren)).toBe(AUTOREN);
  });
});

describe('Schnittstelle: Anlegen mit Vorlage (4T-002405, F5 A)', () => {
  const mitVorlage = (karteikarte) => ({
    anweisungen: [{ tabelle: 'Autoren/Autoren.md', art: 'create', karteikarte }],
  });

  it('weist eine Vorlage ab, die keine Karteikarte dieser Tabelle ist, und legt nichts an', async () => {
    const k = kartei();
    const p = prozess(k);
    for (const vorlage of [
      'Autoren/Notiz.md',
      'Autoren/Alt/Bert.md',
      'Buecher.md',
      '../fremd.md',
    ]) {
      const ergebnis = await p.schnittstelle.fuehreAuftragAus(
        k.wurzel,
        mitVorlage({ name: 'Neu', vorlage }),
      );
      expect(ergebnis.code, vorlage).toBe(LAGEN.karteiVorlageUnbrauchbar);
    }
    expect(fs.existsSync(path.join(path.dirname(k.ada), 'Neu.md'))).toBe(false);
    expect(lies(k.autoren)).toBe(AUTOREN);
  });

  it('nimmt die Vorlage nur zusammen mit einem Namen an', async () => {
    const k = kartei();
    const p = prozess(k);
    const ergebnis = await p.schnittstelle.fuehreAuftragAus(
      k.wurzel,
      mitVorlage({ vorlage: 'Autoren/Ada.md' }),
    );
    expect(ergebnis.code).toBe(LAGEN.form);
    expect(ergebnis.lagen[0].feld).toBe('karteikarte');
  });
});
