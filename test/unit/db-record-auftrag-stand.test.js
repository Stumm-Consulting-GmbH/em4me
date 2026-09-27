// 4T-001822 (Epic 3E-000254, Bauplan B1 bis B8; E9.2, E9.3, E10.2, E22.6): Die
// Schreib-Schnittstelle erkennt eine Fremd-Änderung beim Schreiben, weist sie ab
// oder belegt sie beim Erzwingen.
//
// **Gearbeitet wird am echten Dateisystem in temporären Ordnern**, mit der
// ECHTEN Sperr-Verwaltung und dem echten Beleg-Weg (Muster
// db-record-auftrag.test.js). Die Fremd-Änderung ist hier wörtlich eine: Der
// Prüffall schreibt die Tabellen-Datei zwischen zwei Aufträgen von Hand um, mit
// `fs.writeFileSync` und an der Schnittstelle vorbei, so wie es ein Editor oder
// ein Synchronisations-Werkzeug täte.
//
// **Der harte Rand ist die Zusage «genau ein Fremd-Beleg»** und wird über drei
// aufeinanderfolgende Schreibvorgänge geprüft, weil sich ein Fehler in der
// Fortschreibung des Stands erst ab dem zweiten zeigt; die Gegenprobe führt den
// alten Stand weiter und muss an jedem der drei scheitern.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN, LAGE_TEXTE } from '../../src/main/database/record-auftrag-pruefung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
// 4T-001824 (Epic 3E-000254): der Wiederanlauf, Pflicht-Naht der Schnittstelle.
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { belegeDesDatensatzes, belegPfadFuer } from '../../src/main/database/change-log.js';
import { vorgangsDateiPfad } from '../../src/main/database/vorgangs-kennung.js';
import {
  ART_CREATE,
  ART_EXTERNAL,
  ART_UPDATE,
  pruefeVerkettung,
} from '../../src/shared/database/change-record.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-auftrag-stand-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

// Dieselbe Gestalt wie in db-record-auftrag.test.js: drei Felder, `Name` mit
// Pflicht-Angabe, `Anzahl` vom Typ `number`, Datensätze mit trennender
// Leerzeile wie in einer von Hand geschriebenen Tabelle.
function tabelle(records, { lastId = null } = {}) {
  const zeilen = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '      required: true',
    '    - name: Ort',
    '    - name: Anzahl',
    '      type: number',
    ...(lastId === null ? [] : [`  lastId: ${lastId}`]),
    '---',
    '',
    '```perspective-records',
  ];
  records.forEach((record, i) => {
    if (i > 0) zeilen.push('');
    zeilen.push(
      `|- id="${record.id}"`,
      `| ${record.name}`,
      `| ${record.ort}`,
      `| ${record.anzahl}`,
    );
  });
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel', anzahl: '3' };
const BERT = { id: 'r-00002', name: 'Bert', ort: 'Bern', anzahl: '4' };

// Der Stand, den ein Aufrufer gezeigt hat: alle Felder des Datensatzes.
function gezeigt(record) {
  return { Name: record.name, Ort: record.ort, Anzahl: record.anzahl };
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

// Die Fremd-Änderung: ein Umschreiben von Hand, an der Schnittstelle vorbei.
// Der Ersatz muss treffen; ein Prüffall, dessen Fremd-Änderung ins Leere geht,
// prüft den unveränderten Stand und wäre grün, ohne etwas zu zeigen.
function vonHand(pfad, alt, neu) {
  const vorher = lies(pfad);
  expect(vorher.includes(alt), `von Hand: «${alt}» nicht gefunden`).toBe(true);
  fs.writeFileSync(pfad, vorher.replace(alt, neu), 'utf8');
  return lies(pfad);
}

const ZEITPUNKT = '2026-09-23T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };

// 4T-001823: Die Klammer des Absichts-Protokolls ist Pflicht-Naht der
// Schnittstelle und bekommt dieselbe Sperr-Verwaltung, wie in der Verdrahtung.
function schnittstelle(zusatz = {}) {
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    // 4T-001824: der Wiederanlauf mit derselben Verwaltung, wie in der Verdrahtung.
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

function aendere(id, erwartet, werte, mehr = {}) {
  return { tabelle: 'Kunden.md', art: 'update', id, erwartet, werte, ...mehr };
}

async function belegeVon(pfad, kennung) {
  const gelesen = await belegeDesDatensatzes(pfad, kennung);
  expect(gelesen.ok).toBe(true);
  return gelesen.belege;
}

function arten(belege) {
  return belege.map((beleg) => beleg.art);
}

// Ein Datensatz, den die Schnittstelle selbst angelegt hat: Seine Kette beginnt
// mit dem Beleg des Anlegens, und die Verkettungs-Auskunft über die ganze Kette
// ist damit mehr als eine Auskunft über zwei Belege.
async function angelegt(s) {
  const wurzel = bereich();
  const pfad = lege(wurzel, 'Kunden.md', tabelle([], { lastId: 0 }));
  const ergebnis = await s.fuehreAuftragAus(wurzel, {
    anweisungen: [{ tabelle: 'Kunden.md', art: 'create', werte: gezeigt(ANNA) }],
  });
  expect(ergebnis.ok).toBe(true);
  expect(ergebnis.ergebnisse[0].id).toBe('r-00001');
  return { wurzel, pfad };
}

// --- AK1, AK2: verglichen wird der Inhalt, unter der Sperre frisch gelesen --------------

describe('Stand prüfen: unveränderter und abweichender Stand (4T-001822, AK1, AK2)', () => {
  it('AK1 lässt den Auftrag bei unverändertem Stand durch', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0]).toMatchObject({ geaendert: true, fremdBeleg: false });
    expect(lies(pfad)).toContain('| Chur');
  });

  it('AK2 lässt den Auftrag durch, wenn allein die Änderungszeit der Datei abweicht', async () => {
    // Ein Synchronisations-Werkzeug schreibt Dateien inhaltlich unverändert neu
    // (E9.3). Verglichen wird der Inhalt; eine neue Änderungszeit ist keine
    // Fremd-Änderung.
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    fs.writeFileSync(pfad, lies(pfad), 'utf8');
    const spaeter = new Date(Date.now() + 3600 * 1000);
    fs.utimesSync(pfad, spaeter, spaeter);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect((await belegeVon(pfad, 'r-00001')).map((b) => b.art)).toEqual([ART_UPDATE]);
  });

  it('AK2 weist eine von Hand geänderte Zelle ab, lässt die Datei zeichengleich und belegt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vonHandGeaendert = vonHand(pfad, '| Basel', '| Zug');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Anzahl: '5' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.standWeichtAb);
    expect(ergebnis.error).toBe(LAGE_TEXTE[LAGEN.standWeichtAb]);
    expect(ergebnis.lagen).toEqual([
      {
        code: LAGEN.standWeichtAb,
        error: LAGE_TEXTE[LAGEN.standWeichtAb],
        position: 0,
        tabelle: 'Kunden.md',
        id: 'r-00001',
        geloescht: false,
        felder: [{ name: 'Ort', erwartet: 'Basel', vorgefunden: 'Zug' }],
      },
    ]);
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
    // Abgewiesen, bevor eine Vorgangs-Kennung gezogen ist.
    expect(fs.existsSync(vorgangsDateiPfad(wurzel))).toBe(false);
  });

  it('AK2 vergleicht nur die genannten Felder; die Verantwortung dafür liegt beim Aufrufer', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    vonHand(pfad, '| Basel', '| Zug');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', { Name: 'Anna', Anzahl: '3' }, { Anzahl: '5' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('| Zug');
  });
});

// --- AK3, AK4: ganz oder gar nicht ------------------------------------------------------

describe('Stand prüfen: ein Auftrag über mehrere Datensätze (4T-001822, AK3, AK4)', () => {
  it('AK4 schreibt nichts, wenn einer von zwei Datensätzen abweicht, und nennt ihn', async () => {
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const orte = lege(wurzel, 'Stamm/Orte.md', tabelle([BERT], { lastId: 2 }));
    const kundenVorher = lies(kunden);
    const orteVorher = vonHand(orte, '| Bern', '| Thun');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        {
          tabelle: 'Stamm/Orte.md',
          art: 'update',
          id: 'r-00002',
          erwartet: gezeigt(BERT),
          werte: { Anzahl: '9' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0]).toMatchObject({
      code: LAGEN.standWeichtAb,
      position: 1,
      tabelle: 'Stamm/Orte.md',
      id: 'r-00002',
      felder: [{ name: 'Ort', erwartet: 'Bern', vorgefunden: 'Thun' }],
    });
    expect(lies(kunden)).toBe(kundenVorher);
    expect(lies(orte)).toBe(orteVorher);
    expect(fs.existsSync(belegPfadFuer(kunden))).toBe(false);
    expect(fs.existsSync(belegPfadFuer(orte))).toBe(false);
  });

  it('AK3 meldet ALLE abweichenden Datensätze eines Auftrags und nicht nur den ersten', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    vonHand(pfad, '| Basel', '| Zug');
    const vorher = vonHand(pfad, '| 4', '| 40');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00001', gezeigt(ANNA), { Name: 'Anja' }),
        aendere('r-00002', gezeigt(BERT), { Name: 'Berta' }),
      ],
    });

    expect(ergebnis.lagen.map((lage) => [lage.code, lage.position, lage.id])).toEqual([
      [LAGEN.standWeichtAb, 0, 'r-00001'],
      [LAGEN.standWeichtAb, 1, 'r-00002'],
    ]);
    expect(ergebnis.lagen[1].felder).toEqual([
      { name: 'Anzahl', erwartet: '4', vorgefunden: '40' },
    ]);
    expect(lies(pfad)).toBe(vorher);
  });
});

// --- AK5, AK6, AK11: erzwingen -----------------------------------------------------------

describe('Stand prüfen: Erzwingen schreibt und belegt die Fremd-Änderung (4T-001822, AK5, AK6, AK11)', () => {
  it('AK5 schreibt die eigene Fassung und legt zuerst den Fremd-Beleg, dann den Änderungs-Beleg an', async () => {
    const s = schnittstelle();
    const { wurzel, pfad } = await angelegt(s);
    vonHand(pfad, '| Basel', '| Zug');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: true })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0]).toMatchObject({
      geaendert: true,
      beleg: true,
      fremdBeleg: true,
      felder: ['Ort'],
      stand: { Name: 'Anna', Ort: 'Chur', Anzahl: '3' },
    });
    expect(lies(pfad)).toContain('| Chur');
    expect(lies(pfad)).not.toContain('| Zug');

    const belege = await belegeVon(pfad, 'r-00001');
    expect(arten(belege)).toEqual([ART_CREATE, ART_EXTERNAL, ART_UPDATE]);
    const [, fremd, eigen] = belege;
    // Der Fremd-Beleg: vom erwarteten zum vorgefundenen Wert, unter der
    // Vorgangs-Kennung des Auftrags, der ihn festgestellt hat (B3) ...
    expect(fremd.felder).toEqual([{ name: 'Ort', alt: 'Basel', neu: 'Zug' }]);
    expect(fremd.vorgang).toBe(String(ergebnis.vorgang));
    // ... und OHNE Urheber (AK6, E10.2): Wer erzwingt, hat die fremde Änderung
    // nicht vorgenommen.
    expect(fremd.benutzer).toBeNull();
    expect(fremd.rechner).toBeNull();
    // Der gewöhnliche Beleg: vom vorgefundenen zum eigenen Wert, mit Urheber.
    expect(eigen.felder).toEqual([{ name: 'Ort', alt: 'Zug', neu: 'Chur' }]);
    expect(eigen.vorgang).toBe(String(ergebnis.vorgang));
    expect(eigen.benutzer).toBe('anna');
    expect(eigen.rechner).toBe('SC-026');
  });

  it('AK11 hält die Kette über Anlegen, Fremd-Änderung und Erzwingen lückenlos', async () => {
    const s = schnittstelle();
    const { wurzel, pfad } = await angelegt(s);
    vonHand(pfad, '| Basel', '| Zug');

    await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: true })],
    });

    const gelesen = await belegeDesDatensatzes(pfad, 'r-00001');
    expect(gelesen.verkettung).toEqual({ lueckenlos: true, luecken: [] });
    // Gegenprobe: Ohne den Fremd-Beleg klaffte zwischen Anlegen und Änderung die
    // Lücke Basel/Zug. Die Auskunft ist lückenlos, WEIL er dasteht.
    const ohneFremd = gelesen.belege.filter((beleg) => beleg.art !== ART_EXTERNAL);
    expect(pruefeVerkettung(ohneFremd).lueckenlos).toBe(false);
  });

  it('erzeugt nur den Fremd-Beleg und schreibt nichts, wenn die eigene Fassung der vorgefundenen gleicht', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vonHandGeaendert = vonHand(pfad, '| Basel', '| Zug');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Zug' }, { erzwingen: true })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0]).toMatchObject({
      geaendert: false,
      beleg: true,
      fremdBeleg: true,
      felder: [],
      stand: { Name: 'Anna', Ort: 'Zug', Anzahl: '3' },
    });
    expect(ergebnis.dateien).toEqual([]);
    expect(lies(pfad)).toBe(vonHandGeaendert);
    const belege = await belegeVon(pfad, 'r-00001');
    expect(arten(belege)).toEqual([ART_EXTERNAL]);
    expect(belege[0].felder).toEqual([{ name: 'Ort', alt: 'Basel', neu: 'Zug' }]);
  });

  it('ist ohne Abweichung wirkungslos: kein Fremd-Beleg', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: true })],
    });

    expect(ergebnis.ergebnisse[0].fremdBeleg).toBe(false);
    expect(arten(await belegeVon(pfad, 'r-00001'))).toEqual([ART_UPDATE]);
  });
});

// --- AK7, AK8: genau ein Fremd-Beleg --------------------------------------------------------

describe('Stand prüfen: genau ein Fremd-Beleg über drei Folge-Schreibvorgänge (4T-001822, AK7, AK8)', () => {
  it('AK7 erzeugt nach dem Erzwingen keinen zweiten Fremd-Beleg, wenn der Aufrufer den neuen Stand führt', async () => {
    const s = schnittstelle();
    const { wurzel, pfad } = await angelegt(s);
    vonHand(pfad, '| Basel', '| Zug');

    const erzwungen = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: true })],
    });
    expect(erzwungen.ok).toBe(true);

    // Der Aufrufer führt den zurückgegebenen Stand als nächste Erwartung (AK8).
    let stand = erzwungen.ergebnisse[0].stand;
    for (const anzahl of ['4', '5', '6']) {
      const folge = await s.fuehreAuftragAus(wurzel, {
        anweisungen: [aendere('r-00001', stand, { Anzahl: anzahl })],
      });
      expect(folge.ok, JSON.stringify(folge.lagen)).toBe(true);
      expect(folge.ergebnisse[0].fremdBeleg).toBe(false);
      expect(folge.ergebnisse[0].stand).toEqual({ Name: 'Anna', Ort: 'Chur', Anzahl: anzahl });
      stand = folge.ergebnisse[0].stand;
    }

    const belege = await belegeVon(pfad, 'r-00001');
    expect(belege.filter((beleg) => beleg.art === ART_EXTERNAL)).toHaveLength(1);
    expect(arten(belege)).toEqual([
      ART_CREATE,
      ART_EXTERNAL,
      ART_UPDATE,
      ART_UPDATE,
      ART_UPDATE,
      ART_UPDATE,
    ]);
    expect(pruefeVerkettung(belege).lueckenlos).toBe(true);
  });

  it('AK7 weist jeden Folge-Schreibvorgang ab, der den ALTEN Stand weiterführt (Gegenprobe)', async () => {
    const s = schnittstelle();
    const { wurzel, pfad } = await angelegt(s);
    vonHand(pfad, '| Basel', '| Zug');
    const alt = gezeigt(ANNA);

    await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', alt, { Ort: 'Chur' }, { erzwingen: true })],
    });
    const nachErzwingen = lies(pfad);

    for (const anzahl of ['4', '5', '6']) {
      const folge = await s.fuehreAuftragAus(wurzel, {
        anweisungen: [aendere('r-00001', alt, { Anzahl: anzahl })],
      });
      // Abgewiesen, nicht still belegt: Die eigene Fassung weicht vom alten
      // Stand ab, und ohne Erzwingen entsteht kein zweiter Fremd-Beleg.
      expect(folge.ok).toBe(false);
      expect(folge.lagen[0]).toMatchObject({
        code: LAGEN.standWeichtAb,
        felder: [{ name: 'Ort', erwartet: 'Basel', vorgefunden: 'Chur' }],
      });
    }

    expect(lies(pfad)).toBe(nachErzwingen);
    const belege = await belegeVon(pfad, 'r-00001');
    expect(belege.filter((beleg) => beleg.art === ART_EXTERNAL)).toHaveLength(1);
  });

  it('AK8 gibt je Anweisung den Stand aller Felder zurück, beim Löschen null', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara' } },
        aendere('r-00001', gezeigt(ANNA), { Ort: 'Basel' }),
        { tabelle: 'Kunden.md', art: 'delete', id: 'r-00002', erwartet: gezeigt(BERT) },
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse.map((e) => e.stand)).toEqual([
      // Angelegt: nicht genannte Felder sind leer.
      { Name: 'Cara', Ort: '', Anzahl: '' },
      // Nicht geändert: der vorgefundene Stand, auch bei `geaendert: false`.
      { Name: 'Anna', Ort: 'Basel', Anzahl: '3' },
      null,
    ]);
    expect(ergebnis.ergebnisse.map((e) => e.fremdBeleg)).toEqual([false, false, false]);
  });
});

// --- AK9: Erzwingen übergeht die harten Regeln nicht ----------------------------------------

describe('Stand prüfen: Erzwingen und die harten Regeln (4T-001822, AK9)', () => {
  it('AK9 weist einen erzwungenen Auftrag mit Typ-Verletzung ab und schreibt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vonHandGeaendert = vonHand(pfad, '| Basel', '| Zug');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Anzahl: 'viele' }, { erzwingen: true })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.typVerletzt);
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('AK9 weist einen erzwungenen Auftrag ab, der ein Pflicht-Feld am Ergebnis leer lässt', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    // Von Hand geleert: Der resultierende Datensatz hätte keinen Namen.
    const vonHandGeaendert = vonHand(pfad, '| Anna', '|');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: true })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen[0]).toMatchObject({ code: LAGEN.pflichtFehlt, feld: 'Name' });
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });
});

// --- AK10: eine fremde Änderung an einem ANDEREN Datensatz ----------------------------------

describe('Stand prüfen: fremde Änderung an einem anderen Datensatz (4T-001822, AK10)', () => {
  it('AK10 lässt den eigenen Auftrag gelingen und die fremde Zeile zeichengleich stehen', async () => {
    // Der Vergleich gilt dem Datensatz und nicht der Datei (B4): Die Datei-Ebene
    // allein meldete die fremde Änderung an Bert ebenso wie eine an Anna, und
    // mit der Auskunft «die Datei hat sich geändert» kann niemand etwas anfangen.
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    vonHand(pfad, '| Bern', '| Zug');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    const nachher = lies(pfad);
    expect(nachher).toContain('| Chur');
    expect(nachher).toContain('|- id="r-00002"\n| Bert\n| Zug\n| 4');
    // Keine Spur einer Fremd-Änderung am eigenen und keine am fremden Datensatz.
    expect(arten(await belegeVon(pfad, 'r-00001'))).toEqual([ART_UPDATE]);
    expect(await belegeVon(pfad, 'r-00002')).toEqual([]);
  });
});

// --- B1: Leerraum, Trennabstand und Maskierung sind keine Fremd-Änderung --------------------

describe('Stand prüfen: Umformatierung von Hand ist keine Fremd-Änderung (4T-001822, B1)', () => {
  async function aendertOhneFremdBeleg(wurzel, pfad, erwartet) {
    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', erwartet, { Anzahl: '5' })],
    });
    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0].fremdBeleg).toBe(false);
    expect(arten(await belegeVon(pfad, 'r-00001'))).toEqual([ART_UPDATE]);
  }

  it('B1 übergeht den fehlenden Leerraum hinter dem Zell-Marker', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    vonHand(pfad, '| Basel', '|Basel');
    await aendertOhneFremdBeleg(wurzel, pfad, gezeigt(ANNA));
  });

  it('B1 übergeht einen von Hand vergrößerten Trennabstand hinter dem Datensatz', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    vonHand(pfad, '| 3\n\n|- id="r-00002"', '| 3\n\n\n\n|- id="r-00002"');
    await aendertOhneFremdBeleg(wurzel, pfad, gezeigt(ANNA));
  });

  it('B1 übergeht eine von Hand entfernte Maskierung, die den Wert nicht ändert', async () => {
    // Eine Fortsetzungs-Zeile, die mit `!` beginnt, wird maskiert geschrieben;
    // unmaskiert gelesen ergibt sie denselben Wert.
    const wurzel = bereich();
    const mehrzeilig = { ...ANNA, ort: 'Basel\n\\!Nord' };
    const pfad = lege(wurzel, 'Kunden.md', tabelle([mehrzeilig, BERT], { lastId: 2 }));
    vonHand(pfad, '\\!Nord', '!Nord');
    await aendertOhneFremdBeleg(wurzel, pfad, { ...gezeigt(ANNA), Ort: 'Basel\n!Nord' });
  });
});

// --- B7: der von Hand gelöschte Datensatz ---------------------------------------------------

describe('Stand prüfen: der von Hand gelöschte Datensatz (4T-001822, B7)', () => {
  const BERT_BLOCK = '\n\n|- id="r-00002"\n| Bert\n| Bern\n| 4';

  it('B7 weist Ändern und Löschen ohne Erzwingen mit «gelöscht» ab', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    const vonHandGeaendert = vonHand(pfad, BERT_BLOCK, '');

    const aendern = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', gezeigt(BERT), { Ort: 'Thun' })],
    });
    const loeschen = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'delete', id: 'r-00002', erwartet: { Name: 'Bert' } },
      ],
    });

    expect(aendern.ok).toBe(false);
    expect(aendern.lagen).toEqual([
      {
        code: LAGEN.standWeichtAb,
        error: LAGE_TEXTE[LAGEN.standWeichtAb],
        position: 0,
        tabelle: 'Kunden.md',
        id: 'r-00002',
        geloescht: true,
        felder: [
          { name: 'Name', erwartet: 'Bert', vorgefunden: null },
          { name: 'Ort', erwartet: 'Bern', vorgefunden: null },
          { name: 'Anzahl', erwartet: '4', vorgefunden: null },
        ],
      },
    ]);
    expect(loeschen.ok).toBe(false);
    expect(loeschen.lagen[0]).toMatchObject({
      code: LAGEN.standWeichtAb,
      geloescht: true,
      felder: [{ name: 'Name', erwartet: 'Bert', vorgefunden: null }],
    });
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('B7 legt den Datensatz beim erzwungenen Ändern unter seiner Kennung wieder an', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    vonHand(pfad, BERT_BLOCK, '');
    const s = schnittstelle();

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', gezeigt(BERT), { Ort: 'Thun' }, { erzwingen: true })],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0]).toMatchObject({
      art: 'update',
      geaendert: true,
      beleg: true,
      fremdBeleg: true,
      stand: { Name: 'Bert', Ort: 'Thun', Anzahl: '4' },
    });
    const nachher = lies(pfad);
    expect(nachher).toContain('|- id="r-00002"\n| Bert\n| Thun\n| 4');
    // Der Hochwasserstand bleibt: Die Kennung lag bereits darunter.
    expect(nachher).toContain('lastId: 2');
    expect(nachher).not.toContain('lastId: 3');

    const belege = await belegeVon(pfad, 'r-00002');
    expect(arten(belege)).toEqual([ART_EXTERNAL, ART_CREATE]);
    expect(belege[0].felder).toEqual([
      { name: 'Name', alt: 'Bert', neu: null },
      { name: 'Ort', alt: 'Bern', neu: null },
      { name: 'Anzahl', alt: '4', neu: null },
    ]);
    expect(belege[0].benutzer).toBeNull();
    expect(belege[1].felder).toEqual([
      { name: 'Name', alt: null, neu: 'Bert' },
      { name: 'Ort', alt: null, neu: 'Thun' },
      { name: 'Anzahl', alt: null, neu: '4' },
    ]);
    expect(pruefeVerkettung(belege).lueckenlos).toBe(true);

    // Der zurückgegebene Stand trägt den nächsten Schreibvorgang.
    const folge = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00002', ergebnis.ergebnisse[0].stand, { Anzahl: '8' })],
    });
    expect(folge.ok, JSON.stringify(folge.lagen)).toBe(true);
  });

  it('B7 schreibt beim erzwungenen Löschen nichts und belegt allein die Fremd-Änderung', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    const vonHandGeaendert = vonHand(pfad, BERT_BLOCK, '');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'delete',
          id: 'r-00002',
          erwartet: gezeigt(BERT),
          erzwingen: true,
        },
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0]).toMatchObject({
      art: 'delete',
      geaendert: false,
      beleg: true,
      fremdBeleg: true,
      stand: null,
    });
    expect(ergebnis.dateien).toEqual([]);
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(arten(await belegeVon(pfad, 'r-00002'))).toEqual([ART_EXTERNAL]);
  });
});

// --- B1: die Angabe `erwartet` am Auftrag ---------------------------------------------------

describe('Stand prüfen: die Angaben erwartet und erzwingen (4T-001822, B1, B6)', () => {
  it('B1 weist Ändern und Löschen ohne erwartet ab, bevor etwas gelesen ist', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'update', id: 'r-00001', werte: { Ort: 'Chur' } },
        { tabelle: 'Kunden.md', art: 'delete', id: 'r-00002' },
        { tabelle: 'Kunden.md', art: 'update', id: 'r-00001', erwartet: ['Anna'], werte: {} },
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toBe(LAGE_TEXTE[LAGEN.erwartungFehlt]);
    expect(
      ergebnis.lagen.map(({ code, position, tabelle, id }) => [code, position, tabelle, id]),
    ).toEqual([
      [LAGEN.erwartungFehlt, 0, 'Kunden.md', 'r-00001'],
      [LAGEN.erwartungFehlt, 1, 'Kunden.md', 'r-00002'],
      [LAGEN.erwartungFehlt, 2, 'Kunden.md', 'r-00001'],
    ]);
    expect(lies(pfad)).toBe(vorher);
  });

  it('B1 lässt erwartet beim Anlegen ohne Wirkung', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([], { lastId: 0 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara' }, erwartet: 'Unsinn' },
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(lies(pfad)).toContain('| Cara');
  });

  it('B1 weist einen unbekannten Feld-Namen und einen Nicht-Text in erwartet ab', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const unbekannt = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', { Wohnort: 'Basel' }, { Ort: 'Chur' })],
    });
    expect(unbekannt.lagen[0]).toMatchObject({
      code: LAGEN.feldUnbekannt,
      position: 0,
      feld: 'Wohnort',
      // Nachschärfung: Der Name stammt aus der Erwartung, nicht aus den Werten.
      angabe: 'erwartet',
    });

    const keinText = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', { Anzahl: 3 }, { Ort: 'Chur' })],
    });
    expect(keinText.lagen[0]).toMatchObject({ code: LAGEN.form, feld: 'Anzahl' });
  });

  it('B6 nimmt erzwingen nur als Wahrheitswert', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: 'ja' })],
    });

    expect(ergebnis.lagen[0]).toMatchObject({ code: LAGEN.form, feld: 'erzwingen' });
  });

  it('B6 wirkt an der einzelnen Anweisung und nicht am ganzen Auftrag', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    vonHand(pfad, '| Basel', '| Zug');
    const vorher = vonHand(pfad, '| Bern', '| Thun');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00001', gezeigt(ANNA), { Anzahl: '5' }, { erzwingen: true }),
        aendere('r-00002', gezeigt(BERT), { Anzahl: '6' }),
      ],
    });

    // Bert hat niemand erzwungen: Der ganze Auftrag wirkt nicht.
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0]).toMatchObject({ code: LAGEN.standWeichtAb, id: 'r-00002' });
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });
});

// --- Nachschärfung: ein Datensatz je Auftrag höchstens einmal -------------------------------

describe('Stand prüfen: derselbe Datensatz zweimal in einem Auftrag (4T-001822, Nachschärfung)', () => {
  it('weist zwei Änderungen desselben Datensatzes vor den Sperren ab und schreibt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        aendere('r-00001', gezeigt(ANNA), { Name: 'Anja' }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toEqual([
      {
        code: LAGEN.datensatzMehrfach,
        error: LAGE_TEXTE[LAGEN.datensatzMehrfach],
        position: 1,
        tabelle: 'Kunden.md',
        id: 'r-00001',
        erstePosition: 0,
      },
    ]);
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
    expect(fs.existsSync(vorgangsDateiPfad(wurzel))).toBe(false);
  });

  it('weist Ändern und Löschen derselben Kennung ab', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00002', gezeigt(BERT), { Ort: 'Thun' }),
        aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        { tabelle: 'Kunden.md', art: 'delete', id: 'r-00002', erwartet: gezeigt(BERT) },
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen).toHaveLength(1);
    expect(ergebnis.lagen[0]).toMatchObject({
      code: LAGEN.datensatzMehrfach,
      position: 2,
      id: 'r-00002',
      erstePosition: 0,
    });
    expect(lies(pfad)).toBe(vorher);
  });

  it('lässt zweimal Anlegen ohne Kennung weiterhin zu', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([], { lastId: 0 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara' } },
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Dora' } },
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse.map((e) => e.id)).toEqual(['r-00001', 'r-00002']);
  });
});

// --- Nachschärfung: Fremd-Änderung vor Pflicht-Angabe ---------------------------------------

describe('Stand prüfen: ein von Hand geleertes Pflicht-Feld (4T-001822, Nachschärfung)', () => {
  it('meldet ohne Erzwingen die Fremd-Änderung und nicht die fehlende Pflicht-Angabe', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vonHandGeaendert = vonHand(pfad, '| Anna', '|');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([LAGEN.standWeichtAb]);
    expect(ergebnis.lagen[0].felder).toEqual([{ name: 'Name', erwartet: 'Anna', vorgefunden: '' }]);
    expect(lies(pfad)).toBe(vonHandGeaendert);
  });

  it('weist beim Erzwingen ohne Namen in den Werten die fehlende Pflicht-Angabe ab', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vonHandGeaendert = vonHand(pfad, '| Anna', '|');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('r-00001', gezeigt(ANNA), { Ort: 'Chur' }, { erzwingen: true })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen.map((lage) => lage.code)).toEqual([LAGEN.pflichtFehlt]);
    expect(ergebnis.lagen[0]).toMatchObject({ feld: 'Name', id: 'r-00001' });
    expect(lies(pfad)).toBe(vonHandGeaendert);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('gelingt beim Erzwingen mit Namen in den Werten und belegt external und update', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    vonHand(pfad, '| Anna', '|');

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('r-00001', gezeigt(ANNA), { Name: 'Anna', Ort: 'Chur' }, { erzwingen: true }),
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.ergebnisse[0].stand).toEqual({ Name: 'Anna', Ort: 'Chur', Anzahl: '3' });
    const belege = await belegeVon(pfad, 'r-00001');
    expect(arten(belege)).toEqual([ART_EXTERNAL, ART_UPDATE]);
    expect(belege[0].felder).toEqual([{ name: 'Name', alt: 'Anna', neu: '' }]);
    expect(belege[1].felder).toEqual([
      { name: 'Name', alt: '', neu: 'Anna' },
      { name: 'Ort', alt: 'Basel', neu: 'Chur' },
    ]);
    expect(pruefeVerkettung(belege).lueckenlos).toBe(true);
  });
});

// --- Katalog (AK12 aus 4T-001821) -----------------------------------------------------------

describe('Stand prüfen: die neuen Lagen im Katalog (4T-001822, B8, Nachschärfung)', () => {
  it('führt die drei Codes im geschlossenen Katalog und mit Entwickler-Text', () => {
    expect(LAGEN.datensatzMehrfach).toBe('auftragDatensatzMehrfach');
    expect(LAGE_TEXTE[LAGEN.datensatzMehrfach]).toBe(
      'Der Auftrag nennt denselben Datensatz mehr als einmal.',
    );
    expect(LAGEN.erwartungFehlt).toBe('auftragErwartungFehlt');
    expect(LAGEN.standWeichtAb).toBe('auftragStandWeichtAb');
    expect(LAGE_TEXTE[LAGEN.erwartungFehlt]).toBe(
      'Die Anweisung nennt keinen zuletzt gelesenen Stand.',
    );
    expect(LAGE_TEXTE[LAGEN.standWeichtAb]).toBe(
      'Der vorgefundene Stand des Datensatzes weicht vom zuletzt gelesenen ab.',
    );
  });
});
