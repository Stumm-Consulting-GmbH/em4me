// 4T-001821 (Epic 3E-000254): Die Schreib-Schnittstelle der Datenbank — die vier
// Operationen, das Meldungs-Modell und die Belege.
//
// **Gearbeitet wird am echten Dateisystem in temporären Ordnern**, mit der
// ECHTEN Sperr-Verwaltung und dem echten Beleg-Weg. Der Gegenstand ist ein
// Lesen-Rechnen-Schreiben auf mehreren Dateien samt Konflikt-Prüfung gegen den
// gelesenen Stand; eine Attrappe des Dateisystems entschiede selbst, wann sie
// einen Konflikt meldet, und prüfte damit sich selbst (Muster
// db-vorgangs-kennung.test.js).
//
// **Spione stehen nur dort, wo ein AUSBLEIBEN nachzuweisen ist.** Alles andere
// wird am Ergebnis auf der Platte gemessen.
//
// **Die Sperren stehen nebenan** in `db-record-auftrag-sperren.test.js`: die
// Sperr-Menge, der Fehlschlag mittendrin, die bereits gehaltene Sperre, zwei
// gleichzeitige Aufträge und die ausgelöste Verdichtung (AK5, AK6, AK10). Der
// Aus-Zustand der Erweiterung (AK13) steht als eigener Fall in der Prüfdatei des
// Aufrufer-Wächters, `db-sperren-belege-aus-zustand.test.js`.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN, LAGE_TEXTE } from '../../src/main/database/record-auftrag-pruefung.js';
import { BELEG_ART } from '../../src/main/database/record-auftrag-plan.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
// 4T-001824 (Epic 3E-000254): der Wiederanlauf, Pflicht-Naht der Schnittstelle.
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { belegeDesDatensatzes, belegPfadFuer } from '../../src/main/database/change-log.js';
import { ART_DELETE, ART_CREATE, ART_UPDATE } from '../../src/shared/database/change-record.js';
import { ARTEN } from '../../src/shared/database/record-write.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

const MODUL_QUELLEN = [
  'src/main/database/record-auftrag.js',
  'src/main/database/record-auftrag-pruefung.js',
  'src/main/database/record-auftrag-bestand.js',
  'src/main/database/record-auftrag-plan.js',
  // 4T-001822: Der Vergleich des vorgefundenen Stands liefert die Lage
  // «Stand weicht ab» und gehört deshalb in den Katalog-Wächter (AK12).
  'src/main/database/record-auftrag-stand.js',
].map((rel) => ({ rel, text: quelltext(rel) }));

// Die Seite der Beleg-Ansicht: An ihr hängt die zweite Hälfte von AK15. Sie wird
// hier GELESEN und nicht geändert — die Anzeige selbst prüft ihre eigene
// Prüfdatei.
const ANSICHT_QUELLE = quelltext('src/renderer/modules/database/beleg-ansicht-seite.js');

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-auftrag-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

// Eine Tabellen-Datei mit drei Feldern; `Name` trägt die Pflicht-Angabe,
// `Anzahl` den Typ `number`.
//
// **Die Datensätze stehen mit trennender Leerzeile**, also in der Gestalt, die
// eine von Hand geschriebene Tabelle hat — und die die Demo-Tabelle
// `src/demo/Library.md` gerade NICHT hat. Genau in dieser Lücke saß die
// Verdopplung des Trennabstands (behoben mit 4T-001821 in `record-write.js`);
// geprüft wird deshalb an der schwierigeren Gestalt.
function tabelle(records, { lastId = null, kopfZeilen = [], required = true } = {}) {
  const zeilen = [
    '---',
    ...kopfZeilen,
    'db-table:',
    '  fields:',
    '    - name: Name',
    ...(required ? ['      required: true'] : []),
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

// Eine Tabelle mit einem Pflicht-Wahrheitswert, für die Frage, was «nicht
// gesetzt» bei diesem Typ heißt.
function mitWahrheitswert() {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Titel',
    '    - name: Verliehen',
    '      type: boolean',
    '      required: true',
    '  lastId: 0',
    '---',
    '',
    '```perspective-records',
    '```',
    '',
  ].join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel', anzahl: '3' };
const BERT = { id: 'r-00002', name: 'Bert', ort: 'Bern', anzahl: '4' };

// 4T-001822 (Epic 3E-000254, B1): Ändern und Löschen nennen den zuletzt
// gelesenen Stand. Hier ist er der Stand der Datei, weil der Gegenstand dieser
// Prüfdatei die Schnittstelle ohne Fremd-Änderung ist; die Fremd-Änderung prüft
// `db-record-auftrag-stand.test.js`.
function gezeigt(record) {
  return { Name: record.name, Ort: record.ort, Anzahl: record.anzahl };
}

// 4T-001822: Ändern und Löschen samt Erwartung in einer Zeile. Die ausgeschriebene
// Anweisung bräche jeden Aufruf in sieben Zeilen auf, und die Prüfdatei risse
// ihr Größen-Budget, ohne einen Fall mehr zu prüfen.
function aendere(tabelle, id, erwartet, werte) {
  return { tabelle, art: 'update', id, erwartet, werte };
}

function loesche(tabelle, id, erwartet) {
  return { tabelle, art: 'delete', id, erwartet };
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

const ZEITPUNKT = '2026-09-20T08:00:00Z';
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
    // Hier ist die Sperre nicht der Gegenstand; ohne Warte-Abstände endet ein
    // Konflikt sofort, statt Sekunden echte Zeit zu verwarten. Das Warten selbst
    // prüft `db-record-auftrag-sperren.test.js`.
    warteAbstaende: [],
    ...zusatz,
  });
}

function codes(ergebnis) {
  return ergebnis.lagen.map((lage) => lage.code);
}

// --- AK1: die vier Operationen, einzeln und in Menge --------------------------------------

describe('Schreib-Schnittstelle: anlegen, ändern, löschen (4T-001821, AK1)', () => {
  it('AK1 ändert einen Datensatz und lässt alles Unberührte zeichengleich', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(true);
    const nachher = lies(pfad);
    expect(nachher).toBe(vorher.replace('| Basel', '| Chur'));
  });

  it('AK1 legt einen Datensatz an und schreibt den Hochwasserstand fort', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara', Ort: 'Chur', Anzahl: '7' } },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ergebnisse[0].id).toBe('r-00002');
    const nachher = lies(pfad);
    expect(nachher).toContain('|- id="r-00002"');
    expect(nachher).toContain('| Cara');
    expect(nachher).toContain('lastId: 2');
  });

  it('AK1 löscht einen Datensatz und nimmt seine Zeilen mit', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Kunden.md', 'r-00002', gezeigt(BERT))],
    });

    expect(ergebnis.ok).toBe(true);
    const nachher = lies(pfad);
    expect(nachher).not.toContain('|- id="r-00002"');
    expect(nachher).not.toContain('| Bert');
    // Der unberührte Datensatz bleibt zeichengleich stehen.
    expect(nachher).toContain('|- id="r-00001"\n| Anna\n| Basel\n| 3');
  });

  it('AK1 fasst mehrere Datensätze einer Tabelle in einem Auftrag zusammen', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        aendere('Kunden.md', 'r-00002', gezeigt(BERT), { Anzahl: '9' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    // Beide Änderungen stehen, und die Datei wurde EINMAL ersetzt.
    expect(ergebnis.dateien).toEqual([pfad]);
    const nachher = lies(pfad);
    expect(nachher).toContain('| Chur');
    expect(nachher).toContain('| 9');
  });

  it('AK1 wirkt über zwei Tabellen hinweg', async () => {
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const orte = lege(wurzel, 'Stamm/Orte.md', tabelle([BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        aendere('Stamm/Orte.md', 'r-00002', gezeigt(BERT), { Ort: 'Thun' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(new Set(ergebnis.dateien)).toEqual(new Set([kunden, orte]));
    expect(lies(kunden)).toContain('| Chur');
    expect(lies(orte)).toContain('| Thun');
  });
});

// --- AK1, B6: Segmente ---------------------------------------------------------------------

// Eine geteilte Tabelle nach dem Ablage-Format: Die Kopf-Datei trägt Definition
// und öffnenden Zaun, das Folge-Segment beginnt unmittelbar mit einem
// Datensatz-Marker und trägt den schließenden Zaun.
function geteilteTabelle(wurzel) {
  const kopf = [
    '---',
    'doc-part: v1|1|Gross',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '    - name: Ort',
    '    - name: Anzahl',
    '      type: number',
    '  lastId: 2',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Anna',
    '| Basel',
    '| 3',
  ].join('\n');
  const segment = [
    '---',
    'doc-part: v1|2|Gross',
    '---',
    '|- id="r-00002"',
    '| Bert',
    '| Bern',
    '| 4',
    '```',
    '',
  ].join('\n');
  return {
    kopf: lege(wurzel, 'Gross.md', kopf),
    segment: lege(wurzel, 'Gross•part-00002.md', segment),
  };
}

describe('Schreib-Schnittstelle: Segmente einer Tabelle (4T-001821, AK1, B6)', () => {
  it('AK1 ändert einen Datensatz im Folge-Segment und lässt die Kopf-Datei stehen', async () => {
    const wurzel = bereich();
    const { kopf, segment } = geteilteTabelle(wurzel);
    const kopfVorher = lies(kopf);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Gross.md', 'r-00002', gezeigt(BERT), { Ort: 'Thun' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.dateien).toEqual([segment]);
    expect(lies(kopf)).toBe(kopfVorher);
    expect(lies(segment)).toContain('| Thun');
  });

  it('AK1 trägt Datensätze verschiedener Segmente in EINEM Auftrag', async () => {
    const wurzel = bereich();
    const { kopf, segment } = geteilteTabelle(wurzel);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Gross.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        aendere('Gross.md', 'r-00002', gezeigt(BERT), { Ort: 'Thun' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(new Set(ergebnis.dateien)).toEqual(new Set([kopf, segment]));
    expect(lies(kopf)).toContain('| Chur');
    expect(lies(segment)).toContain('| Thun');
    // Eine gemeinsame Vorgangs-Kennung, eine Beleg-Datei (die der Kopf-Datei).
    expect(ergebnis.belege).toEqual([belegPfadFuer(kopf), belegPfadFuer(kopf)]);
  });

  it('AK1 legt im LETZTEN Segment an und schreibt den Stand in die Kopf-Datei', async () => {
    const wurzel = bereich();
    const { kopf, segment } = geteilteTabelle(wurzel);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [{ tabelle: 'Gross.md', art: 'create', werte: { Name: 'Cara' } }],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(segment)).toContain('|- id="r-00003"');
    expect(lies(kopf)).not.toContain('|- id="r-00003"');
    expect(lies(kopf)).toContain('lastId: 3');
  });
});

// --- AK2: Neuanlage eröffnen ----------------------------------------------------------------

describe('Schreib-Schnittstelle: Neuanlage eröffnen (4T-001821, AK2)', () => {
  it('AK2 zieht die Kennung, schreibt den Hochwasserstand fort und erzeugt KEINEN Beleg', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().eroeffneNeuanlage(wurzel, 'Kunden.md');

    expect(ergebnis).toMatchObject({ ok: true, kennung: 'r-00002', nummer: 2, hochwasserstand: 2 });
    expect(lies(pfad)).toContain('lastId: 2');
    // Kein Datensatz und kein Beleg: Es ist noch nichts entstanden.
    expect(lies(pfad)).not.toContain('|- id="r-00002"');
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('AK2 zieht zweimal nacheinander zwei verschiedene Kennungen', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const s = schnittstelle();

    const erste = await s.eroeffneNeuanlage(wurzel, 'Kunden.md');
    const zweite = await s.eroeffneNeuanlage(wurzel, 'Kunden.md');

    expect([erste.kennung, zweite.kennung]).toEqual(['r-00002', 'r-00003']);
  });

  it('AK2 nimmt eine beim Eröffnen gezogene Kennung im Auftrag entgegen', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const s = schnittstelle();
    const eroeffnet = await s.eroeffneNeuanlage(wurzel, 'Kunden.md');

    const ergebnis = await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', id: eroeffnet.kennung, werte: { Name: 'Cara' } },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ergebnisse[0].id).toBe('r-00002');
    expect(lies(pfad)).toContain('|- id="r-00002"');
    // Der Stand bleibt bei 2: Die Kennung war bereits gezogen.
    expect(lies(pfad)).toContain('lastId: 2');
  });

  it('AK2 zieht die Kennung selbst, wenn das Anlegen keine mitbringt', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([], { lastId: null }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara' } },
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Dora' } },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ergebnisse.map((e) => e.id)).toEqual(['r-00001', 'r-00002']);
  });
});

// --- AK3: Typ und Pflicht-Angabe, hart ------------------------------------------------------

describe('Schreib-Schnittstelle: Typ und Pflicht-Angabe weisen ab (4T-001821, AK3)', () => {
  it('AK3 weist eine Typ-Verletzung ab und lässt die Datei zeichengleich', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Anzahl: 'viele' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.typVerletzt);
    expect(ergebnis.lagen[0]).toMatchObject({ position: 0, feld: 'Anzahl', typ: 'number' });
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('AK3 weist eine fehlende Pflicht-Angabe ab und lässt die Datei zeichengleich', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        // Das Anlegen nennt das Pflicht-Feld gar nicht, das Ändern leert es.
        { tabelle: 'Kunden.md', art: 'create', werte: { Ort: 'Chur' } },
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Name: '  ' }),
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(codes(ergebnis)).toEqual([LAGEN.pflichtFehlt, LAGEN.pflichtFehlt]);
    expect(lies(pfad)).toBe(vorher);
  });

  it('AK3 meldet ALLE Befunde eines Auftrags und nicht nur den ersten', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Anzahl: 'viele' }),
        aendere('Kunden.md', 'r-00002', gezeigt(BERT), { Name: '' }),
        // 4T-001822: Ein Auftrag nennt einen Datensatz höchstens einmal; der
        // unbekannte Feld-Name steht deshalb an einem Anlegen statt an einer
        // zweiten Änderung von r-00002.
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara', Unbekannt: 'x' } },
      ],
    });

    expect(codes(ergebnis)).toEqual([LAGEN.typVerletzt, LAGEN.pflichtFehlt, LAGEN.feldUnbekannt]);
    expect(ergebnis.lagen.map((lage) => lage.position)).toEqual([0, 1, 2]);
    // 4T-001822: Der unbekannte Name stammt aus den Werten.
    expect(ergebnis.lagen[2]).toMatchObject({ feld: 'Unbekannt', angabe: 'werte' });
  });

  it('AK3 weist ein Pflicht-Feld ab, das der Auftrag gar nicht anfasst', async () => {
    // Entscheidung des Product Owners vom 2026-09-20 (E22.8): Geprüft wird der
    // RESULTIERENDE Datensatz. Ein von Hand leer gelassenes Pflicht-Feld wird
    // nachgepflegt, sobald der Datensatz das nächste Mal über diesen Schreibweg
    // geändert wird — auch wenn die Änderung ein ganz anderes Feld betrifft.
    const wurzel = bereich();
    const ohneNamen = { id: 'r-00001', name: '', ort: 'Basel', anzahl: '3' };
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ohneNamen], { lastId: 1 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ohneNamen), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen[0]).toMatchObject({
      code: LAGEN.pflichtFehlt,
      position: 0,
      id: 'r-00001',
      feld: 'Name',
    });
    expect(lies(pfad)).toBe(vorher);
    // Geheilt, sobald derselbe Auftrag das Feld mitfüllt.
    const geheilt = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ohneNamen), { Ort: 'Chur', Name: 'Anna' }),
      ],
    });
    expect(geheilt.ok).toBe(true);
  });

  it('AK3 lässt einen vorgefundenen typ-verletzenden Wert in Ruhe, den der Auftrag nicht anfasst', async () => {
    // Die Asymmetrie zur Pflicht-Angabe, und sie ist gewollt: Beim Lesen bleibt
    // die Typ-Linie weich (E22.3), und wer einen Wert nicht anfasst, hat ihn
    // nicht geschrieben. Abgewiesen wird allein, was der Auftrag selbst setzt.
    const wurzel = bereich();
    const kaputt = { id: 'r-00001', name: 'Anna', ort: 'Basel', anzahl: 'viele' };
    const pfad = lege(wurzel, 'Kunden.md', tabelle([kaputt], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(kaputt), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(true);
    const nachher = lies(pfad);
    expect(nachher).toContain('| Chur');
    // Der unpassende Wert bleibt unangetastet stehen.
    expect(nachher).toContain('| viele');
  });

  it('AK3 nimmt den ausdrücklich geschriebenen Wahrheitswert «falsch» als gesetzten Wert', async () => {
    // Entscheidung des Product Owners vom 2026-09-20: «Nicht gesetzt» heißt
    // leerer getrimmter Zell-Text — beim Wahrheitswert IST die leere Zelle
    // jedoch das kanonische Format für «falsch» (record-values.js kennt für ihn
    // genau zwei Texte). Ein genanntes Pflicht-Feld dieses Typs gilt damit als
    // gesetzt, ein nicht genanntes fehlt.
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Ausleihe.md', mitWahrheitswert());

    const gesetzt = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Ausleihe.md', art: 'create', werte: { Titel: 'Solaris', Verliehen: '' } },
      ],
    });
    expect(gesetzt.ok).toBe(true);
    expect(lies(pfad)).toContain('| Solaris');

    const fehlend = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [{ tabelle: 'Ausleihe.md', art: 'create', werte: { Titel: 'Cyberiade' } }],
    });
    expect(fehlend.ok).toBe(false);
    expect(fehlend.lagen[0]).toMatchObject({ code: LAGEN.pflichtFehlt, feld: 'Verliehen' });
  });

  it('AK3 lässt einen Wert durch, der zu seinem Typ passt (Gegenprobe)', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Anzahl: '12' })],
    });

    expect(ergebnis.ok).toBe(true);
    expect(lies(pfad)).toContain('| 12');
  });
});

// --- AK4: die Prüf-Naht ----------------------------------------------------------------------

describe('Schreib-Schnittstelle: die Prüf-Naht (4T-001821, AK4)', () => {
  it('AK4 weist auf Befund der Naht ab und lässt die Datei zeichengleich', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vorher = lies(pfad);
    const gesehen = [];

    const ergebnis = await schnittstelle({
      pruefNaht: (kontext) => {
        gesehen.push(kontext);
        return { befunde: [{ position: 0, regel: 'schluesselDublette' }] };
      },
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.pruefBefund);
    expect(ergebnis.lagen[0]).toMatchObject({ position: 0, naht: { regel: 'schluesselDublette' } });
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
    // Sie sieht den ganzen Auftrag und den unter Sperre gelesenen Bestand (B2).
    expect(gesehen).toHaveLength(1);
    expect(gesehen[0].anweisungen).toHaveLength(1);
    expect(gesehen[0].bestaende.get('Kunden.md').fields.map((f) => f.name)).toEqual([
      'Name',
      'Ort',
      'Anzahl',
    ]);
  });

  it('AK4 lässt ohne eingehängte Naht jeden Auftrag durch und ist damit leer', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(ergebnis.ok).toBe(true);
  });
});

// --- AK7, AK8, AK9: die Belege ---------------------------------------------------------------

async function belegeVon(pfad, kennung) {
  const gelesen = await belegeDesDatensatzes(pfad, kennung);
  expect(gelesen.ok).toBe(true);
  return gelesen;
}

describe('Schreib-Schnittstelle: die Änderungsbelege (4T-001821, AK7, AK8, AK9)', () => {
  it('AK7 schreibt je geändertem Datensatz genau einen Beleg unter derselben Kennung', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        aendere('Kunden.md', 'r-00002', gezeigt(BERT), { Ort: 'Thun' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    const anna = await belegeVon(pfad, 'r-00001');
    const bert = await belegeVon(pfad, 'r-00002');
    expect(anna.belege).toHaveLength(1);
    expect(bert.belege).toHaveLength(1);
    expect(anna.belege[0].vorgang).toBe(String(ergebnis.vorgang));
    expect(bert.belege[0].vorgang).toBe(anna.belege[0].vorgang);
    expect(anna.belege[0].felder).toEqual([{ name: 'Ort', alt: 'Basel', neu: 'Chur' }]);
  });

  it('AK7 trägt auch bei EINEM Datensatz eine Vorgangs-Kennung', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    const gelesen = await belegeVon(pfad, 'r-00001');
    expect(gelesen.belege[0].vorgang).toBe('1');
  });

  it('AK8 erzeugt Belege in zwei Beleg-Dateien unter derselben Vorgangs-Kennung', async () => {
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const orte = lege(wurzel, 'Stamm/Orte.md', tabelle([BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        aendere('Stamm/Orte.md', 'r-00002', gezeigt(BERT), { Ort: 'Thun' }),
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(fs.existsSync(belegPfadFuer(kunden))).toBe(true);
    expect(fs.existsSync(belegPfadFuer(orte))).toBe(true);
    const ausKunden = await belegeVon(kunden, 'r-00001');
    const ausOrten = await belegeVon(orte, 'r-00002');
    expect(ausKunden.belege[0].vorgang).toBe(String(ergebnis.vorgang));
    expect(ausOrten.belege[0].vorgang).toBe(String(ergebnis.vorgang));
  });

  it('AK9 erzeugt bei einer Änderung ohne geändertes Feld KEINEN Beleg', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Basel' })],
    });

    expect(ergebnis.ok).toBe(true);
    // Das Ergebnis sagt es je Anweisung, die Datei bleibt zeichengleich, und es
    // entsteht keine Beleg-Datei mit einem Beleg ohne Feld.
    expect(ergebnis.ergebnisse[0]).toMatchObject({ geaendert: false, beleg: false, felder: [] });
    expect(ergebnis.dateien).toEqual([]);
    expect(lies(pfad)).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('AK9 belegt in einer Menge nur die Datensätze, an denen sich etwas ändert', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Basel' }),
        aendere('Kunden.md', 'r-00002', gezeigt(BERT), { Ort: 'Thun' }),
      ],
    });

    expect(ergebnis.ergebnisse.map((e) => e.beleg)).toEqual([false, true]);
    expect((await belegeVon(pfad, 'r-00001')).belege).toHaveLength(0);
    expect((await belegeVon(pfad, 'r-00002')).belege).toHaveLength(1);
  });

  it('legt die Beleg-Datei mit dem ersten Beleg an', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);

    await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' })],
    });

    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(true);
  });
});

// --- AK15: das Löschen und die Beleg-Ansicht --------------------------------------------------

describe('Schreib-Schnittstelle: Löschen hinterlässt seine Belege (4T-001821, AK15)', () => {
  it('AK15 lässt die Kette mit dem Lösch-Beleg enden und hält sie lückenlos', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([], { lastId: null }));
    const s = schnittstelle();

    await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        { tabelle: 'Kunden.md', art: 'create', werte: { Name: 'Cara', Ort: 'Chur', Anzahl: '7' } },
      ],
    });
    await s.fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere(
          'Kunden.md',
          'r-00001',
          { Name: 'Cara', Ort: 'Chur', Anzahl: '7' },
          { Ort: 'Thun' },
        ),
      ],
    });
    await s.fuehreAuftragAus(wurzel, {
      anweisungen: [loesche('Kunden.md', 'r-00001', { Name: 'Cara', Ort: 'Thun', Anzahl: '7' })],
    });

    // Der Datensatz ist fort, seine Spur bleibt.
    expect(lies(pfad)).not.toContain('|- id="r-00001"');
    const gelesen = await belegeVon(pfad, 'r-00001');
    expect(gelesen.belege.map((b) => b.art)).toEqual([ART_CREATE, ART_UPDATE, ART_DELETE]);
    expect(gelesen.verkettung.lueckenlos).toBe(true);
    // Der letzte Beleg trägt den zuletzt gültigen Wert als ALTEN Wert und keinen
    // neuen; daran ist der Datensatz als gelöscht erkennbar.
    const lezter = gelesen.belege[2];
    expect(lezter.felder).toEqual([
      { name: 'Name', alt: 'Cara', neu: null },
      { name: 'Ort', alt: 'Thun', neu: null },
      { name: 'Anzahl', alt: '7', neu: null },
    ]);
  });

  it('AK15 liefert der Beleg-Ansicht die Art, an der sie das Löschen erkennt', () => {
    // Die zweite Hälfte von AK15 ohne Oberfläche: Der lesende Kanal reicht die
    // ART jedes Belegs an die Seite durch, und die Seite bildet daraus ihr Wort
    // und ihre Klasse. Geändert wird an der Seite nichts; hier steht allein der
    // Nachweis, dass die Art, die diese Schnittstelle schreibt, genau die ist,
    // die jene Seite auswertet.
    expect(BELEG_ART.delete).toBe(ART_DELETE);
    expect(ANSICHT_QUELLE).toContain('database.changeLog.kind.${art}');
    expect(ANSICHT_QUELLE).toContain('db-changelog-kind-${beleg.art}');
  });
});

// --- AK11, AK12: Meldungs-Modell und Katalog ---------------------------------------------------

describe('Schreib-Schnittstelle: das Meldungs-Modell (4T-001821, AK11)', () => {
  it('AK11 ordnet jedes Ergebnis seiner Position, Tabelle und Kennung zu', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], { lastId: 2 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        loesche('Kunden.md', 'r-00002', gezeigt(BERT)),
      ],
    });

    expect(ergebnis.ergebnisse).toEqual([
      {
        position: 0,
        tabelle: 'Kunden.md',
        id: 'r-00001',
        art: 'update',
        geaendert: true,
        beleg: true,
        felder: ['Ort'],
        // 4T-001822 (B8): kein Fremd-Beleg, und der neue Stand aller Felder.
        fremdBeleg: false,
        stand: { Name: 'Anna', Ort: 'Chur', Anzahl: '3' },
      },
      {
        position: 1,
        tabelle: 'Kunden.md',
        id: 'r-00002',
        art: 'delete',
        geaendert: true,
        beleg: true,
        felder: ['Name', 'Ort', 'Anzahl'],
        // 4T-001822 (B8): Beim Löschen gibt es keinen Stand danach.
        fremdBeleg: false,
        stand: null,
      },
    ]);
  });

  it('AK11 nennt bei einer Abweisung den führenden Code und jede Lage einzeln', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Anzahl: 'viele' })],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(ergebnis.lagen[0].code);
    expect(ergebnis.error).toBe(LAGE_TEXTE[LAGEN.typVerletzt]);
  });

  it('AK11 nennt den unbekannten Datensatz an seiner Position, ohne etwas zu schreiben', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], { lastId: 1 }));
    const vorher = lies(pfad);

    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [
        aendere('Kunden.md', 'r-00001', gezeigt(ANNA), { Ort: 'Chur' }),
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00099',
          // 4T-001822 (B7): Ohne genanntes Feld bleibt die fehlende Kennung
          // eine unbekannte; mit Feldern wäre sie ein von Hand gelöschter
          // Datensatz und damit der Gegenstand von db-record-auftrag-stand.test.js.
          erwartet: {},
          werte: { Ort: 'Thun' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.lagen[0]).toMatchObject({ code: LAGEN.datensatzUnbekannt, position: 1 });
    expect(lies(pfad)).toBe(vorher);
  });

  it('meldet den leeren Auftrag als eigene Lage und nicht als Fehler der Anwendung', async () => {
    const wurzel = bereich();
    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, { anweisungen: [] });
    expect(ergebnis.code).toBe(LAGEN.leer);
  });

  it('weist eine Tabelle außerhalb des Bereichs ab, ohne die Datei zu berühren', async () => {
    const wurzel = bereich();
    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      // 4T-001822: Die leere Erwartung hält die Form gültig, damit der Fall die
      // Bereichs-Grenze prüft und nicht die fehlende Erwartung.
      anweisungen: [aendere('../Fremd.md', 'r-00001', {}, {})],
    });
    expect(ergebnis.code).toBe(LAGEN.tabelleAusserhalb);
  });

  it('weist eine Datei ohne Definitions-Behälter als unbekannte Tabelle ab', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Notiz.md', '# Nur ein Dokument\n');
    const ergebnis = await schnittstelle().fuehreAuftragAus(wurzel, {
      anweisungen: [{ tabelle: 'Notiz.md', art: 'create', werte: { Name: 'Cara' } }],
    });
    expect(ergebnis.code).toBe(LAGEN.tabelleUnbekannt);
  });
});

describe('Schreib-Schnittstelle: der Katalog der Lagen (4T-001821, AK12)', () => {
  // Jeder Code, den die Schnittstelle liefern kann, steht im Katalog — geprüft
  // am Quelltext, weil ein Prüffall je Lage nur die Lagen fände, an die jemand
  // gedacht hat. Gesucht wird nach dem Präfix der Codes; sie stehen nirgends
  // sonst als Zeichenkette.
  const CODE_MUSTER = /'(auftrag[A-Za-z]+)'/g;

  it('AK12 kennt jeden im Quelltext gelieferten Code', () => {
    const bekannt = new Set(Object.values(LAGEN));
    const unbekannt = [];
    for (const { rel, text } of MODUL_QUELLEN) {
      for (const treffer of text.matchAll(CODE_MUSTER)) {
        if (!bekannt.has(treffer[1])) unbekannt.push(`${rel}: ${treffer[1]}`);
      }
    }
    expect(unbekannt, unbekannt.join('\n')).toEqual([]);
  });

  it('AK12 führt jeden Katalog-Eintrag über eine Zugriffs-Konstante und mit Text', () => {
    for (const [name, code] of Object.entries(LAGEN)) {
      expect(typeof code, name).toBe('string');
      expect(LAGE_TEXTE[code], name).toBeTruthy();
    }
    // Untere Plausibilitäts-Schranke: Ein Wächter, dessen Menge leer läuft, ist
    // grün, ohne etwas geprüft zu haben.
    expect(Object.keys(LAGEN).length).toBeGreaterThanOrEqual(18);
    expect(MODUL_QUELLEN.every((datei) => datei.text.length > 500)).toBe(true);
  });

  it('AK12 benutzt dieselben drei Wörter wie das Zurückschreiben und das Beleg-Format', () => {
    expect(ARTEN).toEqual(['create', 'update', 'delete']);
    expect(BELEG_ART).toEqual({ create: ART_CREATE, update: ART_UPDATE, delete: ART_DELETE });
  });
});
