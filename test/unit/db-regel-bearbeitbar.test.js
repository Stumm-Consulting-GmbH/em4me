// 4T-001932 (Epic 3E-000256, E22.7, E12.4): Die bedingte Bearbeitbarkeit im
// Regel-Werk der Schreib-Schnittstelle — die Angabe `editable` der Definition,
// hart angewandt auf den vorgefundenen Datensatz vor dem Ändern und Löschen.
//
// **Echte Schreib-Schnittstelle, echte Sperr-Verwaltung, echtes Dateisystem** in
// temporären Ordnern (Muster `db-regel-pruefregeln.test.js` und
// `db-regel-verweis.test.js`). Die Regel hängt über die echte Fabrik
// `erzeugePruefNaht` an der Schnittstelle; ob ein Auftrag abgewiesen wird,
// entscheidet die Datei. Allein die Tabellen-Sicht des Index ist ein Fake: Die
// Regel braucht sie nicht, die Naht reicht sie nur durch.
//
// Der Vorrat ist ein Beleg-Kopf mit dem Feld `status` («offen», «gebucht») und
// der Bedingung `status != "gebucht"`, wie ein Autor sie ins Frontmatter
// schreibt.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { bearbeitbarRegel } from '../../src/main/database/record-regel-bearbeitbar.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { belegPfadFuer } from '../../src/main/database/change-log.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { parseTableDefinition } from '../../src/shared/database/table-definition.js';

// --- Aufbau ------------------------------------------------------------------------------

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-bearbeitbar-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, relativ, inhalt) {
  const ziel = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

// Die Fremd-Änderung: ein Umschreiben von Hand, an der Schnittstelle vorbei
// (Muster `db-record-auftrag-stand.test.js`). Der Ersatz muss treffen.
function vonHand(pfad, alt, neu) {
  const vorher = lies(pfad);
  expect(vorher.includes(alt), `von Hand: «${alt}» nicht gefunden`).toBe(true);
  fs.writeFileSync(pfad, vorher.replace(alt, neu), 'utf8');
  return lies(pfad);
}

// Die Zeilen eines Datensatzes; die Zell-Texte stehen in der Reihenfolge der Felder.
function datensatzZeilen([id, ...texte]) {
  return [`|- id="${id}"`, ...texte.map((text) => (text === '' ? '|' : `| ${text}`))];
}

// Eine ungeteilte Tabelle: die Definition als fertige Frontmatter-Zeilen, die
// Datensätze mit trennender Leerzeile.
function tabelle(definitionsZeilen, records = []) {
  const zeilen = ['---', ...definitionsZeilen, '---', '', '```perspective-records'];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(...datensatzZeilen(record));
  });
  zeilen.push('```', '');
  return zeilen.join('\n');
}

// Der Beleg-Kopf: der fachliche Schlüssel `nummer` ist zugleich die
// Anzeige-Form, `bedingung` die Zeilen der Angabe `editable` (ohne sie: keine).
function kopfDefinition(bedingung = []) {
  return [
    'db-table:',
    '  fields:',
    '    - name: nummer',
    '    - name: status',
    '  key: nummer',
    ...bedingung,
    '  lastId: 3',
  ];
}

const MIT_MELDUNG = [
  '  editable:',
  `    rule: 'status != "gebucht"'`,
  '    message: Ein gebuchter Beleg ist abgeschlossen.',
];
const ALS_TEXT = [`  editable: 'status != "gebucht"'`];

const OFFEN = ['r-00001', 'B-1', 'offen'];
const GEBUCHT = ['r-00002', 'B-2', 'gebucht'];
const GEBUCHT_2 = ['r-00003', 'B-3', 'gebucht'];

// Der zuletzt gelesene Stand eines Datensatzes, wie ihn der Aufrufer mitgibt.
function gelesen([, nummer, status]) {
  return { nummer, status };
}

const ZEITPUNKT = '2026-09-24T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };

// Dieselben Nähte wie in `db-record-auftrag.test.js` und in der Verdrahtung.
function schnittstelle(zusatz = {}) {
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
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
    ...zusatz,
  });
}

// Die Tabellen-Sicht des Index als Fake: bereit, mit genau den genannten
// Kopf-Dateien als Tabellen.
function sichtMit(...kopfDateien) {
  return () => ({
    status: 'ready',
    sicht: { dbKindsPerFile: new Map(kopfDateien.map((pfad) => [pfad, ['table']])) },
  });
}

function neu(werte) {
  return { tabelle: 'Beleg.md', art: 'create', werte };
}

function aendere(id, erwartet, werte, mehr = {}) {
  return { tabelle: 'Beleg.md', art: 'update', id, erwartet, werte, ...mehr };
}

function loesche(id, erwartet) {
  return { tabelle: 'Beleg.md', art: 'delete', id, erwartet };
}

// Ein Bereich mit dem Beleg-Kopf an der echten Naht, allein mit dieser Regel.
function belege(bedingung = MIT_MELDUNG, records = [OFFEN, GEBUCHT, GEBUCHT_2]) {
  const wurzel = bereich();
  const pfad = lege(wurzel, 'Beleg.md', tabelle(kopfDefinition(bedingung), records));
  const pruefNaht = erzeugePruefNaht({
    regeln: [bearbeitbarRegel],
    tabellenSicht: sichtMit(pfad),
    fsp,
  });
  return { wurzel, pfad, s: schnittstelle({ pruefNaht }) };
}

function nahte(ergebnis) {
  return ergebnis.lagen.map((lage) => lage.naht);
}

// Der erwartete Befund zum gebuchten Kopf an Position 0.
function gesperrt(mehr = {}) {
  return {
    code: REGEL_LAGEN.nichtBearbeitbar,
    position: 0,
    tabelle: 'Beleg.md',
    id: 'r-00002',
    anzeige: 'r-00002 (B-2)',
    regel: 'status != "gebucht"',
    meldung: 'Ein gebuchter Beleg ist abgeschlossen.',
    grund: 'ausdruck',
    ...mehr,
  };
}

describe('Bearbeitbarkeit: das Regel-Modul', () => {
  it('ist eingefroren und trägt seinen Namen', () => {
    expect(bearbeitbarRegel.name).toBe('bearbeitbar');
    expect(Object.isFrozen(bearbeitbarRegel)).toBe(true);
    expect(typeof bearbeitbarRegel.pruefe).toBe('function');
  });

  it('bricht laut bei einem gebrochenen Vertrag', () => {
    expect(() => bearbeitbarRegel.pruefe({ schritte: undefined })).toThrow(TypeError);
  });
});

// --- AK2: gebuchter Kopf ------------------------------------------------------------------

describe('Bearbeitbarkeit: gebuchter Kopf (4T-001932, AK2)', () => {
  it('weist das Ändern ab, nennt Kennung, Anzeige-Form, Regel und Meldung, Datei zeichengleich', async () => {
    const { wurzel, pfad, s } = belege();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', gelesen(GEBUCHT), { nummer: 'B-2a' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([LAGEN.pruefBefund]);
    expect(nahte(ergebnis)).toEqual([gesperrt()]);
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('weist das Löschen ab, Datei zeichengleich', async () => {
    const { wurzel, pfad, s } = belege();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('r-00002', gelesen(GEBUCHT))],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toEqual([gesperrt()]);
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('trägt ohne Meldungstext die leere Meldung; die Regel nennt der Anwender-Text', async () => {
    const { wurzel, s } = belege(ALS_TEXT);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', gelesen(GEBUCHT), { nummer: 'B-2a' })],
    });

    expect(nahte(ergebnis)).toEqual([gesperrt({ meldung: '' })]);
  });

  it('reicht eine Meldung in mehreren Sprachen unaufgelöst weiter', async () => {
    const { wurzel, s } = belege([
      '  editable:',
      `    rule: 'status != "gebucht"'`,
      '    message:',
      '      de: Gebucht.',
      '      en: Posted.',
    ]);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('r-00002', gelesen(GEBUCHT))],
    });

    expect(nahte(ergebnis)).toEqual([gesperrt({ meldung: { de: 'Gebucht.', en: 'Posted.' } })]);
  });

  it('nennt allein die Kennung, wenn die Anzeige-Spalte leer ist', async () => {
    const { wurzel, s } = belege(MIT_MELDUNG, [['r-00002', '', 'gebucht']]);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('r-00002', { nummer: '', status: 'gebucht' })],
    });

    expect(nahte(ergebnis)).toEqual([gesperrt({ anzeige: 'r-00002' })]);
  });
});

// --- AK2, AK3: offener Kopf, alter Zustand, Anlegen ------------------------------------------

describe('Bearbeitbarkeit: der vorgefundene Zustand zählt (4T-001932, AK2, AK3)', () => {
  it('lässt Ändern und Löschen eines offenen Kopfs durch', async () => {
    const { wurzel, pfad, s } = belege();

    const geaendert = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gelesen(OFFEN), { nummer: 'B-1a' })],
    });
    expect(geaendert.ok, JSON.stringify(geaendert.lagen)).toBe(true);
    expect(lies(pfad)).toContain('|- id="r-00001"\n| B-1a\n| offen');

    const geloescht = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('r-00001', { nummer: 'B-1a', status: 'offen' })],
    });
    expect(geloescht.ok, JSON.stringify(geloescht.lagen)).toBe(true);
    expect(lies(pfad)).not.toContain('r-00001');
  });

  it('weist ab, wenn der Auftrag den gebuchten Kopf selbst auf offen setzt', async () => {
    const { wurzel, pfad, s } = belege();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', gelesen(GEBUCHT), { status: 'offen' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toEqual([gesperrt()]);
    expect(lies(pfad)).toBe(vorher);
  });

  it('lässt das Buchen eines offenen Kopfs durch; gesperrt ist erst der nächste Auftrag', async () => {
    const { wurzel, pfad, s } = belege();

    const gebucht = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gelesen(OFFEN), { status: 'gebucht' })],
    });
    expect(gebucht.ok, JSON.stringify(gebucht.lagen)).toBe(true);
    expect(lies(pfad)).toContain('|- id="r-00001"\n| B-1\n| gebucht');

    const danach = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', { nummer: 'B-1', status: 'gebucht' }, { status: 'offen' })],
    });
    expect(nahte(danach)).toMatchObject([{ code: REGEL_LAGEN.nichtBearbeitbar, id: 'r-00001' }]);
  });

  it('lässt das Anlegen unberührt, auch mit gebuchtem Status', async () => {
    const { wurzel, pfad, s } = belege();

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [neu({ nummer: 'B-4', status: 'gebucht' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('|- id="r-00004"\n| B-4\n| gebucht');
  });
});

// --- AK4: ohne Angabe und mit unbrauchbarer Angabe ------------------------------------------

describe('Bearbeitbarkeit: ohne oder mit unbrauchbarer Angabe (4T-001932, AK4)', () => {
  it('lässt ohne Angabe Ändern und Löschen eines gebuchten Kopfs durch', async () => {
    const { wurzel, pfad, s } = belege([]);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00002', gelesen(GEBUCHT), { nummer: 'B-2a' }),
        loesche('r-00003', gelesen(GEBUCHT_2)),
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const nachher = lies(pfad);
    expect(nachher).toContain('|- id="r-00002"\n| B-2a\n| gebucht');
    expect(nachher).not.toContain('r-00003');
  });

  const UNBRAUCHBAR = [
    ['editableUnknownField', [`  editable: 'stauts != "gebucht"'`]],
    ['editableExpr', [`  editable: 'status !='`]],
    ['editable', ['  editable:', `    - 'status != "gebucht"'`]],
    ['editable', ['  editable: 5']],
    ['editable', ['  editable:', '    message: ohne Regel']],
  ];

  for (const [code, bedingung] of UNBRAUCHBAR) {
    it(`${code}: ${bedingung.join(' ').trim()} entfällt, und die Tabelle bleibt bearbeitbar`, async () => {
      const { wurzel, pfad, s } = belege(bedingung);
      const definition = parseTableDefinition(extractFrontmatter(lies(pfad)).data);
      expect(definition.hints.map((h) => h.code)).toEqual([code]);
      expect('editable' in definition).toBe(false);

      const ergebnis = await s.fuehreAuftragAus(wurzel, {
        anweisungen: [
          aendere('r-00002', gelesen(GEBUCHT), { nummer: 'B-2a' }),
          loesche('r-00003', gelesen(GEBUCHT_2)),
        ],
      });

      expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
      expect(lies(pfad)).not.toContain('r-00003');
    });
  }

  it('eine unbrauchbare Meldung entfällt, die Bedingung sperrt weiter', async () => {
    const { wurzel, pfad, s } = belege([
      '  editable:',
      `    rule: 'status != "gebucht"'`,
      '    message: 42',
    ]);
    const definition = parseTableDefinition(extractFrontmatter(lies(pfad)).data);
    expect(definition.hints.map((h) => h.code)).toEqual(['editableMessage']);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('r-00002', gelesen(GEBUCHT))],
    });

    expect(nahte(ergebnis)).toEqual([gesperrt({ meldung: '' })]);
  });
});

// --- AK5: leeres Feld und nicht auswertbare Bedingung ----------------------------------------

describe('Bearbeitbarkeit: leeres Feld und nicht auswertbare Bedingung (4T-001932, AK5)', () => {
  const OHNE_STATUS = ['r-00001', 'B-1', ''];

  it('ein leeres Feld ist kein Sonderfall: status != "gebucht" lässt es durch', async () => {
    const { wurzel, pfad, s } = belege(ALS_TEXT, [OHNE_STATUS]);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gelesen(OHNE_STATUS), { nummer: 'B-1a' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('|- id="r-00001"\n| B-1a\n|');
  });

  it('ein leeres Feld ist kein Sonderfall: status = "offen" sperrt es', async () => {
    const { wurzel, pfad, s } = belege([`  editable: 'status = "offen"'`], [OHNE_STATUS]);
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gelesen(OHNE_STATUS), { nummer: 'B-1a' })],
    });

    expect(nahte(ergebnis)).toEqual([
      gesperrt({
        id: 'r-00001',
        anzeige: 'r-00001 (B-1)',
        regel: 'status = "offen"',
        meldung: '',
      }),
    ]);
    expect(lies(pfad)).toBe(vorher);
  });

  it('eine nicht auswertbare Bedingung gilt als nicht erfüllt und nennt den Grund', async () => {
    // Rechnen mit einem Text liefert keinen Wert. `status > 5` wäre hier kein
    // Beispiel: Der Vergleich eines Texts mit einer Zahl wird ausgewertet und
    // ist schlicht nicht erfüllt (Grund `ausdruck`).
    const { wurzel, pfad, s } = belege([`  editable: 'status * 2'`]);
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gelesen(OFFEN), { nummer: 'B-1a' })],
    });

    expect(nahte(ergebnis)).toEqual([
      gesperrt({
        id: 'r-00001',
        anzeige: 'r-00001 (B-1)',
        regel: 'status * 2',
        meldung: '',
        grund: 'nichtAuswertbar',
      }),
    ]);
    expect(lies(pfad)).toBe(vorher);
  });
});

// --- AK6: mehrere gesperrte Datensätze ------------------------------------------------------

describe('Bearbeitbarkeit: mehrere gesperrte Datensätze (4T-001932, AK6)', () => {
  it('meldet jeden gesperrten Datensatz an seiner Position', async () => {
    const { wurzel, pfad, s } = belege();
    const vorher = lies(pfad);

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00002', gelesen(GEBUCHT), { nummer: 'B-2a' }),
        aendere('r-00001', gelesen(OFFEN), { nummer: 'B-1a' }),
        loesche('r-00003', gelesen(GEBUCHT_2)),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toEqual([
      gesperrt(),
      gesperrt({ position: 2, id: 'r-00003', anzeige: 'r-00003 (B-3)' }),
    ]);
    expect(lies(pfad)).toBe(vorher);
  });
});

// --- Der von Hand gelöschte Datensatz --------------------------------------------------------

describe('Bearbeitbarkeit: von Hand gelöscht, erzwungen wieder angelegt (4T-001932)', () => {
  it('der zuletzt gelesene Stand «gebucht» sperrt die Wiederanlage', async () => {
    const { wurzel, pfad, s } = belege();
    const ohneKopf = vonHand(pfad, '|- id="r-00002"\n| B-2\n| gebucht\n\n', '');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', gelesen(GEBUCHT), { status: 'offen' }, { erzwingen: true })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(nahte(ergebnis)).toEqual([gesperrt()]);
    expect(lies(pfad)).toBe(ohneKopf);
  });

  it('der zuletzt gelesene Stand «offen» lässt sie durch', async () => {
    const { wurzel, pfad, s } = belege();
    vonHand(pfad, '|- id="r-00001"\n| B-1\n| offen\n\n', '');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gelesen(OFFEN), { status: 'gebucht' }, { erzwingen: true })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('|- id="r-00001"\n| B-1\n| gebucht');
  });
});
