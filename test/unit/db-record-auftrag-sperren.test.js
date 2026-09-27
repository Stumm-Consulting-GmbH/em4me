// 4T-001821 (Epic 3E-000254): Die Schreib-Schnittstelle und die Sperren — die
// gebildete Sperr-Menge, der Fehlschlag mittendrin, die bereits gehaltene
// Sperre, zwei gleichzeitige Aufträge und die ausgelöste Verdichtung (AK5, AK6,
// AK10).
//
// **Hier läuft nichts gegen eine Attrappe der Sperre.** Der Gegenstand IST die
// Sperre; eine Attrappe entschiede selbst, wann sie einen Konflikt meldet, und
// prüfte damit sich selbst. Gearbeitet wird deshalb mit der ECHTEN
// Sperr-Verwaltung an echten Temp-Verzeichnissen, und eine fremde Sperre wird
// über den echten Sperr-Speicher angelegt.
//
// **Die Nähte, die eingespritzt werden, sind zwei und je begründet:** die
// Prozess-Naht der Verwaltung, damit die Lebend-Prüfung eines fremden Halters
// nicht am laufenden Rechner hängt, und der Schreibweg, damit sich der Augenblick
// des Ersetzens beobachten lässt. Beide gehören der Verwaltung beziehungsweise
// dem Schreibweg und nicht der Schnittstelle.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
// 4T-001824 (Epic 3E-000254): der Wiederanlauf, Pflicht-Naht der Schnittstelle.
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import {
  ART_CHANGE_LOG,
  ART_COUNTER,
  ART_DATENSATZ,
  legeSperreAn,
  listeSperren,
  sperrDateiName,
} from '../../src/main/database/lock-store.js';
import {
  belegPfadFuer,
  belegeDesDatensatzes,
  schreibeBeleg,
} from '../../src/main/database/change-log.js';
import { ersetzeDatei } from '../../src/main/documents/atomic-write.js';
import { ermittleHerkunft } from '../../src/main/herkunft.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const MODUL_QUELLEN = [
  'src/main/database/record-auftrag.js',
  'src/main/database/record-auftrag-pruefung.js',
  'src/main/database/record-auftrag-bestand.js',
  'src/main/database/record-auftrag-plan.js',
].map((rel) => ({
  rel,
  text: fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8'),
}));

const VERDRAHTUNG = fs.readFileSync(path.join(ROOT, 'src', 'main', 'app', 'wiring.js'), 'utf8');

// Zeilen-Nummern der Treffer eines Musters, ohne die Vorkommen in Kommentaren
// (übernommen aus db-sperren-belege-aus-zustand.test.js).
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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-auftrag-sperre-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function tabelle(records, lastId, grenzen = null) {
  const zeilen = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '    - name: Ort',
    ...(grenzen === null
      ? []
      : [
          '  changeLog:',
          `    maxBytes: ${grenzen.maxBytes}`,
          `    maxPerRecord: ${grenzen.maxPerRecord}`,
        ]),
    ...(lastId === null ? [] : [`  lastId: ${lastId}`]),
    '---',
    '',
    '```perspective-records',
  ];
  for (const record of records)
    zeilen.push(`|- id="${record.id}"`, `| ${record.name}`, `| ${record.ort}`);
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel' };
const BERT = { id: 'r-00002', name: 'Bert', ort: 'Bern' };

// 4T-001822 (Epic 3E-000254, B1): Ändern und Löschen nennen den zuletzt
// gelesenen Stand. Hier ist er der Stand der Datei, weil der Gegenstand dieser
// Prüfdatei die Sperre ist und nicht eine Fremd-Änderung.
function gezeigt(record) {
  return { Name: record.name, Ort: record.ort };
}

function lege(wurzel, relativ, inhalt) {
  const ziel = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

const KONFIG_NAHT = { leseKonfig: async () => undefined };

function verwaltung(zusatz = {}) {
  return erzeugeSperrVerwaltung({ ...KONFIG_NAHT, ...zusatz });
}

// 4T-001823: Die Klammer des Absichts-Protokolls ist Pflicht-Naht der
// Schnittstelle und bekommt dieselbe Sperr-Verwaltung, wie in der Verdrahtung.
function schnittstelle(sperrVerwaltung, zusatz = {}) {
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, ...KONFIG_NAHT }),
    // 4T-001824: der Wiederanlauf mit derselben Verwaltung, wie in der Verdrahtung.
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      ...KONFIG_NAHT,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-09-20T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    // **Ohne Warte-Abstände, außer wo das Warten der Gegenstand ist.** Die
    // Schnittstelle wartet auf eine belegte Zähler- oder Beleg-Sperre bis zu
    // rund fünf Sekunden; ein Prüffall, der einen Konflikt zeigen will, soll
    // diese Zeit nicht verwarten.
    warteAbstaende: [],
    ...zusatz,
  });
}

function sperrOrdner(wurzel) {
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
}

function sperrDateien(wurzel) {
  try {
    return fs.readdirSync(sperrOrdner(wurzel)).sort();
  } catch {
    return [];
  }
}

function namenVon(wurzel, gegenstaende) {
  return gegenstaende.map((gegenstand) => sperrDateiName(wurzel, gegenstand).name).sort();
}

// Eine FREMDE, lebende Sperre über den echten Sperr-Speicher. Sie trägt einen
// anderen Rechner und ist damit kein Absturz-Rest; ihr Zeitpunkt ist frisch und
// damit nicht abgelaufen.
async function fremdeSperre(wurzel, gegenstand) {
  const angelegt = await legeSperreAn(
    wurzel,
    gegenstand,
    { marke: 'fremd', pid: 999999 },
    {
      ...KONFIG_NAHT,
      herkunft: () => ({ benutzer: 'bert', rechner: 'FREMD-PC' }),
      jetzt: () => new Date().toISOString().slice(0, 19) + 'Z',
    },
  );
  expect(angelegt.gehalten).toBe(true);
  return angelegt.pfad;
}

// --- AK5: alle Sperren vor dem ersten Schreibvorgang ------------------------------------

describe('Schreib-Schnittstelle: die Sperr-Menge (4T-001821, AK5, B3)', () => {
  it('AK5 hält jeden berührten Datensatz UND die Beleg-Datei, bevor etwas geschrieben ist', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], 2));
    const vorher = fs.readFileSync(pfad, 'utf8');
    let waehrenddessen = null;

    // Die Prüf-Naht läuft nach dem Nehmen der Sperren und vor dem Schreiben (B2)
    // und ist damit der Beobachtungs-Punkt, den AK5 verlangt.
    const ergebnis = await schnittstelle(verwaltung(), {
      pruefNaht: () => {
        waehrenddessen = { sperren: sperrDateien(wurzel), datei: fs.readFileSync(pfad, 'utf8') };
        return { befunde: [] };
      },
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00002',
          erwartet: gezeigt(BERT),
          werte: { Ort: 'Thun' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(waehrenddessen.sperren).toEqual(
      namenVon(wurzel, [
        { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' },
        { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00002' },
        { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' },
      ]),
    );
    // Zu diesem Zeitpunkt ist noch kein Byte geschrieben.
    expect(waehrenddessen.datei).toBe(vorher);
    // Und danach ist keine Sperre übrig.
    expect(sperrDateien(wurzel)).toEqual([]);
  });

  it('AK5 nimmt je berührter Tabelle genau eine Beleg-Sperre, auch über zwei Tabellen', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    lege(wurzel, 'Stamm/Orte.md', tabelle([BERT], 2));
    let waehrenddessen = null;

    await schnittstelle(verwaltung(), {
      pruefNaht: () => {
        waehrenddessen = sperrDateien(wurzel);
        return { befunde: [] };
      },
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
        {
          tabelle: 'Stamm/Orte.md',
          art: 'update',
          id: 'r-00002',
          erwartet: gezeigt(BERT),
          werte: { Ort: 'Thun' },
        },
      ],
    });

    expect(waehrenddessen).toEqual(
      namenVon(wurzel, [
        { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' },
        { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' },
        { art: ART_DATENSATZ, tabelle: 'Stamm/Orte.md', id: 'r-00002' },
        { art: ART_CHANGE_LOG, tabelle: 'Stamm/Orte.md' },
      ]),
    );
  });

  it('AK5 gibt bei einem Fehlschlag mittendrin alle genommenen zurück und schreibt nichts', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], 2));
    const vorher = fs.readFileSync(pfad, 'utf8');
    // Der ZWEITE Gegenstand der Ordnung ist belegt; der erste wird genommen und
    // muss zurückgegeben werden.
    const fremd = await fremdeSperre(wurzel, {
      art: ART_DATENSATZ,
      tabelle: 'Kunden.md',
      id: 'r-00002',
    });

    const ergebnis = await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00002',
          erwartet: gezeigt(BERT),
          werte: { Ort: 'Thun' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.gesperrt);
    expect(ergebnis.lagen[0].konflikt).toMatchObject({ rechner: 'FREMD-PC', benutzer: 'bert' });
    // Nichts geschrieben, kein Beleg, und allein die fremde Sperre liegt noch da:
    // ein Teil-Speichern wird nicht angeboten (E11.4).
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
    expect(sperrDateien(wurzel)).toEqual([path.basename(fremd)]);
  });

  it('AK5 weist auch den Auftrag ab, wenn allein die Beleg-Sperre belegt ist', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    await fremdeSperre(wurzel, { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' });

    const ergebnis = await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.code).toBe(LAGEN.gesperrt);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('AK5 nimmt eine bereits vom EIGENEN Prozess gehaltene Datensatz-Sperre nicht erneut', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const v = verwaltung();
    // Die Lage «offene Bearbeitung»: Die Sperre steht schon, bevor der Auftrag
    // kommt, und sie gehört diesem Prozess.
    const gehalten = await v.nimm(wurzel, {
      art: ART_DATENSATZ,
      tabelle: 'Kunden.md',
      id: 'r-00001',
    });
    expect(gehalten.gehalten).toBe(true);

    const ergebnis = await schnittstelle(v).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(fs.readFileSync(pfad, 'utf8')).toContain('| Chur');
    // Die Sperre der offenen Bearbeitung steht danach UNVERÄNDERT weiter: Der
    // Auftrag hat sie nicht genommen und darf sie deshalb nicht freigeben.
    expect(v.gehalteneSperren().map((e) => e.pfad)).toEqual([gehalten.pfad]);
    expect(fs.existsSync(gehalten.pfad)).toBe(true);
  });
});

// --- AK6: ausschließlich über die eine Verwaltung ---------------------------------------

describe('Schreib-Schnittstelle: kein zweiter Sperr-Speicher (4T-001821, AK6)', () => {
  it('AK6 verweigert den Aufbau ohne Sperr-Verwaltung', () => {
    expect(() => erzeugeSchreibSchnittstelle({ erweiterungAktiv: () => true })).toThrow(TypeError);
    expect(() =>
      erzeugeSchreibSchnittstelle({ sperrVerwaltung: { mitSperren: () => {} } }),
    ).toThrow(TypeError);
  });

  it('AK6 baut in keinem seiner Module eine eigene Verwaltung oder eine eigene Sperre', () => {
    // Der Quelltext-Wächter zum Fall darüber: Die Schnittstelle darf die
    // Verwaltung benutzen, aber nicht erzeugen, und sie darf keine Sperr-Datei
    // an ihr vorbei anlegen. Kommentare bleiben außen vor — der Bestand erklärt
    // diese Wege in Prosa, und ein Wächter, der Erklärungen meldet, wird
    // abgeschaltet (Muster db-sperren-belege-aus-zustand.test.js).
    const verboten = ['erzeugeSperrVerwaltung', 'legeSperreAn', 'entferneSperre', 'loeseSperreAb'];
    const treffer = [];
    for (const { rel, text } of MODUL_QUELLEN) {
      for (const name of verboten) {
        if (trefferAusserhalbKommentaren(text, new RegExp(`\\b${name}\\b`, 'g')).length > 0)
          treffer.push(`${rel} — ${name}`);
      }
    }
    expect(treffer, treffer.join('\n')).toEqual([]);
    // Gegenprobe: An einem erfundenen Quelltext meldet derselbe Ausdruck sehr
    // wohl. Ein Wächter ohne belegte Wirksamkeit ist eine Behauptung.
    expect(
      trefferAusserhalbKommentaren(
        'const v = erzeugeSperrVerwaltung({});',
        /\berzeugeSperrVerwaltung\b/g,
      ),
    ).toHaveLength(1);
    expect(MODUL_QUELLEN.every((datei) => datei.text.length > 500)).toBe(true);
  });

  it('AK6 bekommt in der Verdrahtung dieselbe Instanz wie der übrige Prozess', () => {
    // Die Verwaltung entsteht dort genau einmal und wird der Schnittstelle als
    // Wert gereicht; ein zweiter Aufbau wäre ein zweites Eigen-Register.
    expect(VERDRAHTUNG.match(/erzeugeSperrVerwaltung\(/g)).toHaveLength(1);
    expect(VERDRAHTUNG).toContain('erzeugeSchreibSchnittstelle({');
    expect(VERDRAHTUNG).toMatch(/erzeugeSchreibSchnittstelle\(\{\s*\n\s*sperrVerwaltung,/);
  });

  it('AK6 reicht die Naht für das Urteil über einen verwaisten Anspruch ausdrücklich herein', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    // Ein Absturz-Rest: derselbe Rechner, eine Prozess-Nummer, die nicht mehr
    // lebt. Beurteilen kann das allein die VERWALTUNG — der Speicher kennt
    // weder Frist noch Lebend-Prüfung und gilt ohne die Naht nie als verwaist.
    const eigenerRechner = ermittleHerkunft().rechner;
    await legeSperreAn(
      wurzel,
      { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' },
      { marke: 'rest', pid: 424242 },
      { ...KONFIG_NAHT, herkunft: () => ({ benutzer: 'anna', rechner: eigenerRechner }) },
    );

    const ergebnis = await schnittstelle(
      verwaltung({ prozess: { pid: process.pid, lebt: () => false } }),
    ).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(fs.readFileSync(pfad, 'utf8')).toContain('| Chur');
    expect(sperrDateien(wurzel)).toEqual([]);
  });

  it('AK6 lässt eine LEBENDE fremde Sperre unangetastet (Gegenprobe)', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const eigenerRechner = ermittleHerkunft().rechner;
    await legeSperreAn(
      wurzel,
      { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' },
      { marke: 'lebt', pid: 424242 },
      { ...KONFIG_NAHT, herkunft: () => ({ benutzer: 'anna', rechner: eigenerRechner }) },
    );

    const ergebnis = await schnittstelle(
      verwaltung({ prozess: { pid: process.pid, lebt: () => true } }),
    ).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.code).toBe(LAGEN.gesperrt);
  });
});

// --- Gleichzeitigkeit --------------------------------------------------------------------

describe('Schreib-Schnittstelle: zwei gleichzeitige Aufträge (4T-001821, B3)', () => {
  it('verliert keine Änderung, wenn zwei Aufträge verschiedene Datensätze derselben Tabelle ändern', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], 2));
    // **Zwei Programme, nicht zwei Verwaltungen in einem Programm.** Rechner und
    // Prozess-Nummer werden deshalb mitgegeben: Ohne sie trügen beide Sperren
    // denselben Rechner UND dieselbe Prozess-Nummer, und die zweite Verwaltung
    // hielte die Sperre der ersten für den Absturz-Rest einer früheren Sitzung
    // ihres eigenen Programms — die Regel aus L1, hier auf eine Lage angewandt,
    // die es im Betrieb nicht gibt (je Prozess EINE Verwaltung, AK6).
    // **Hier wird gewartet**, denn genau das ist der Gegenstand: Die Beleg-Sperre
    // hält nie ein Mensch, sondern immer nur ein laufender Auftrag, und der ist
    // nach Millisekunden fertig.
    const warten = { warteAbstaende: [5, 10, 20, 40, 80, 160], zufall: () => 0 };
    const eine = schnittstelle(
      verwaltung({
        herkunft: () => ({ benutzer: 'anna', rechner: 'PC-A' }),
        prozess: { pid: 101, lebt: () => true },
      }),
      warten,
    );
    const andere = schnittstelle(
      verwaltung({
        herkunft: () => ({ benutzer: 'bert', rechner: 'PC-B' }),
        prozess: { pid: 102, lebt: () => true },
      }),
      warten,
    );

    const [a, b] = await Promise.all([
      eine.fuehreAuftragAus(wurzel, {
        anweisungen: [
          {
            tabelle: 'Kunden.md',
            art: 'update',
            id: 'r-00001',
            erwartet: gezeigt(ANNA),
            werte: { Ort: 'Chur' },
          },
        ],
      }),
      andere.fuehreAuftragAus(wurzel, {
        anweisungen: [
          {
            tabelle: 'Kunden.md',
            art: 'update',
            id: 'r-00002',
            erwartet: gezeigt(BERT),
            werte: { Ort: 'Thun' },
          },
        ],
      }),
    ]);

    // **Beide gelingen.** Die Sperre der Beleg-Datei reiht sie, und der
    // Zweitkommende wartet, statt dem Anwender einen Konflikt zu melden, den es
    // nach Millisekunden nicht mehr gibt (Entscheidung des Product Owners vom
    // 2026-09-20). Verloren geht dabei nichts: Wer wartet, hat nichts
    // geschrieben und gibt seine bereits genommenen Sperren vorher zurück.
    expect([a.ok, b.ok], JSON.stringify([a.lagen, b.lagen])).toEqual([true, true]);
    // Verschiedene Vorgangs-Kennungen: Es sind zwei Aufträge und nicht einer.
    expect(a.vorgang).not.toBe(b.vorgang);

    const nachher = fs.readFileSync(pfad, 'utf8');
    expect(nachher).toContain('| Chur');
    expect(nachher).toContain('| Thun');
    expect((await belegeDesDatensatzes(pfad, 'r-00001')).belege).toHaveLength(1);
    expect((await belegeDesDatensatzes(pfad, 'r-00002')).belege).toHaveLength(1);
    expect(sperrDateien(wurzel)).toEqual([]);
  });

  it('meldet die belegte Beleg-Sperre erst, wenn das Warte-Fenster erschöpft ist', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const vorher = fs.readFileSync(pfad, 'utf8');
    await fremdeSperre(wurzel, { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' });

    const begonnen = Date.now();
    const ergebnis = await schnittstelle(verwaltung(), {
      warteAbstaende: [20, 20, 20],
      zufall: () => 0,
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.code).toBe(LAGEN.gesperrt);
    // Drei Abstände à 20 ms wurden tatsächlich gewartet, bevor aufgegeben wurde.
    expect(Date.now() - begonnen).toBeGreaterThanOrEqual(55);
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
  });

  it('kommt durch, wenn die belegte Beleg-Sperre während der Wartezeit frei wird', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const fremd = await fremdeSperre(wurzel, { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' });
    setTimeout(() => fs.rmSync(fremd, { force: true }), 30);

    const ergebnis = await schnittstelle(verwaltung(), {
      warteAbstaende: [10, 20, 40, 80, 160],
      zufall: () => 0,
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(fs.readFileSync(pfad, 'utf8')).toContain('| Chur');
    expect(sperrDateien(wurzel)).toEqual([]);
  });

  it('wartet ebenso auf die belegte Zähler-Sperre', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const fremd = await fremdeSperre(wurzel, { art: ART_COUNTER });
    setTimeout(() => fs.rmSync(fremd, { force: true }), 30);

    const ergebnis = await schnittstelle(verwaltung(), {
      warteAbstaende: [10, 20, 40, 80, 160],
      zufall: () => 0,
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(fs.readFileSync(pfad, 'utf8')).toContain('| Chur');
  });

  it('lässt den Auftrag an der Zähler-Sperre scheitern, wenn sie belegt bleibt', async () => {
    const wurzel = bereich();
    const pfad = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const vorher = fs.readFileSync(pfad, 'utf8');
    await fremdeSperre(wurzel, { art: ART_COUNTER });

    const ergebnis = await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    // Ohne Kennung wird nichts geschrieben (E11.5): eigene Lage, kein Beleg,
    // Datei zeichengleich.
    expect(ergebnis.code).toBe(LAGEN.vorgangFehlt);
    expect(fs.readFileSync(pfad, 'utf8')).toBe(vorher);
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('wartet NICHT auf eine belegte Datensatz-Sperre', async () => {
    // Dort hält ein Mensch die Sperre, und die Meldung mit ihren zwei Wegen ist
    // die richtige Antwort statt einer stillen Verzögerung. Gemessen wird die
    // Zeit: Mit einem langen Warte-Fenster darf der Auftrag trotzdem sofort
    // zurückkommen.
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    await fremdeSperre(wurzel, { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' });

    const begonnen = Date.now();
    const ergebnis = await schnittstelle(verwaltung(), {
      warteAbstaende: [500, 500, 500],
      zufall: () => 0,
    }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });

    expect(ergebnis.code).toBe(LAGEN.gesperrt);
    expect(ergebnis.lagen[0].konflikt).toMatchObject({ rechner: 'FREMD-PC' });
    expect(Date.now() - begonnen).toBeLessThan(400);
  });
});

// --- AK10: die Verdichtung ----------------------------------------------------------------

describe('Schreib-Schnittstelle: die ausgelöste Verdichtung (4T-001821, AK10)', () => {
  // **Zwei Belege werden vorgeschrieben**, damit die ERSTE Prüfung der
  // Verdichtung an dieser Beleg-Datei bereits etwas zu tun findet. Der Grund ist
  // die Drossel: Sie merkt sich je Datei die Größe der letzten ERGEBNISLOSEN
  // Prüfung und lässt die nächste erst nach 64 KB Zuwachs zu. Ein Prüffall, der
  // zuerst ergebnislos prüft und danach verdichten will, käme an ihr nie vorbei.
  // Jeder Fall arbeitet in einem frischen Verzeichnis und damit an einem
  // Datei-Pfad, zu dem die Drossel noch nichts weiß.
  async function seedBelege(pfad, kette) {
    for (let i = 0; i < kette.length - 1; i += 1) {
      const geschrieben = await schreibeBeleg(
        pfad,
        {
          art: 'update',
          id: 'r-00001',
          vorgang: 100 + i,
          felder: [{ name: 'Ort', alt: kette[i], neu: kette[i + 1] }],
        },
        { jetzt: () => '2026-09-19T08:00:00Z', herkunft: () => ({ benutzer: 'anna' }) },
      );
      expect(geschrieben.ok).toBe(true);
    }
  }

  it('AK10 löst nach dem Anfügen aus und läuft nicht in die eigene Sperre', async () => {
    const wurzel = bereich();
    const pfad = lege(
      wurzel,
      'Kunden.md',
      tabelle([{ id: 'r-00001', name: 'Anna', ort: 'Thun' }], 1, {
        maxBytes: 1,
        maxPerRecord: 1,
      }),
    );
    await seedBelege(pfad, ['Basel', 'Chur', 'Thun']);

    const ergebnis = await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: { Name: 'Anna', Ort: 'Thun' },
          werte: { Ort: 'Sion' },
        },
      ],
    });

    // **Die Verdichtung läuft, und sie läuft NICHT in die eigene Sperre.** Genau
    // das wäre die Selbst-Blockade: Sie nimmt ihre Sperre über dieselbe
    // Verwaltung, und unter der noch gehaltenen Auftrags-Sperre bekäme sie den
    // eigenen Prozess als Konflikt gemeldet und bliebe mit dem Grund «gesperrt»
    // folgenlos — bei JEDEM Auftrag und ohne dass es jemand bemerkte.
    expect(ergebnis.verdichtung[0]).toMatchObject({
      pfad: belegPfadFuer(pfad),
      verdichtet: true,
      grund: null,
    });
    // Der jüngste Beleg bleibt einzeln stehen, die beiden davor werden zu einer
    // Spanne zusammengefasst.
    const gelesen = await belegeDesDatensatzes(pfad, 'r-00001');
    expect(gelesen.belege.map((b) => b.art)).toEqual(['merged', 'update']);
    expect(gelesen.belege[0].felder).toEqual([{ name: 'Ort', alt: 'Basel', neu: 'Thun' }]);
    expect(gelesen.verkettung.lueckenlos).toBe(true);
  });

  it('AK10 hält die Sperre der Beleg-Datei, während die Verdichtung ersetzt', async () => {
    const wurzel = bereich();
    const pfad = lege(
      wurzel,
      'Kunden.md',
      tabelle([{ id: 'r-00001', name: 'Anna', ort: 'Thun' }], 1, {
        maxBytes: 1,
        maxPerRecord: 1,
      }),
    );
    await seedBelege(pfad, ['Basel', 'Chur', 'Thun']);
    const belegPfad = belegPfadFuer(pfad);
    const beobachtet = [];
    // Der Schreibweg als Naht: Er gehört nicht der Schnittstelle, und hier soll
    // allein der AUGENBLICK des Ersetzens sichtbar werden.
    const ersetzen = async (ziel, inhalt, optionen) => {
      if (ziel === belegPfad) beobachtet.push(sperrDateien(wurzel));
      return ersetzeDatei(ziel, inhalt, optionen);
    };

    await schnittstelle(verwaltung(), { ersetzen }).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: { Name: 'Anna', Ort: 'Thun' },
          werte: { Ort: 'Sion' },
        },
      ],
    });

    expect(beobachtet).toHaveLength(1);
    expect(beobachtet[0]).toEqual(
      namenVon(wurzel, [{ art: ART_CHANGE_LOG, tabelle: 'Kunden.md' }]),
    );
    expect(sperrDateien(wurzel)).toEqual([]);
  });

  it('AK10 löst je berührter Beleg-Datei aus und nicht je Datensatz', async () => {
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], 2));
    const orte = lege(wurzel, 'Stamm/Orte.md', tabelle([ANNA], 1));

    const ergebnis = await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00002',
          erwartet: gezeigt(BERT),
          werte: { Ort: 'Thun' },
        },
        {
          tabelle: 'Stamm/Orte.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Sion' },
        },
      ],
    });

    expect(ergebnis.verdichtung.map((e) => e.pfad).sort()).toEqual(
      [belegPfadFuer(kunden), belegPfadFuer(orte)].sort(),
    );
  });

  it('löst keine Verdichtung aus, wenn nichts belegt wurde', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));

    const ergebnis = await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Basel' },
        },
      ],
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.verdichtung).toEqual([]);
  });

  // Die Listen-Sperre der Auflistung wird hier nur gelesen; sie ist der Beleg
  // dafür, dass der Sperr-Ordner nach jedem Fall leer zurückbleibt.
  it('lässt nach jedem Auftrag keine Sperre zurück', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    await schnittstelle(verwaltung()).fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: gezeigt(ANNA),
          werte: { Ort: 'Chur' },
        },
      ],
    });
    const liste = await listeSperren(wurzel, KONFIG_NAHT);
    expect(liste.sperren).toEqual([]);
  });
});
