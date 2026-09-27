// 4T-001940 (Epic 3E-000257, Bauplan B2, B3 und B7, AK2): Ein Ergebnis der
// Schreib-Schnittstelle in Anwender-Text auflösen.
//
// **Gemessen wird am deutschen Fragment**, weil der Satz der Gegenstand ist:
// Jede Lage beider Kataloge (Schnittstelle und Regel-Werk) bekommt einen
// Beispiel-Befund in der Gestalt, die ihr Erzeuger baut, und der aufgelöste
// Satz wird wörtlich verglichen. Dazu die Einsetzungs-Regeln einzeln: Listen,
// leere und mehrsprachige Meldung, Anzeige-Form, beide Positionen, Einzahl des
// Lösch-Schutzes, fehlende Ziel-Tabelle, Rückfall und Präfix bei mehreren
// Anweisungen.
//
// **Der Wächter über das Präfix** liest alle fünf Fragmente: Kein Text unter
// `database.auftrag.*` trägt mehr `{position}`; die Position setzt allein der
// Bedienort voran.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loeseLageAuf,
  loeseErgebnisAuf,
  tabellenName,
} from '../../src/shared/database/auftrag-text.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { REGEL_LAGEN } from '../../src/main/database/record-regeln.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const FRAGMENTE = Object.fromEntries(
  SPRACHEN.map((code) => [
    code,
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'fragments', code, 'database.json'), 'utf8'),
    ),
  ]),
);

function umgebung(code = 'de', mehr = {}) {
  const werte = FRAGMENTE[code];
  return {
    t: (key) => (Object.prototype.hasOwnProperty.call(werte, key) ? werte[key] : key),
    hat: (key) => Object.prototype.hasOwnProperty.call(werte, key),
    sprache: code,
    ...mehr,
  };
}

const DE = umgebung('de');
const TAB = 'C:/Bereich/Daten/Kunden.md';
const ZIEL = 'C:/Bereich/Daten/Orte.md';
const ID = 'r-00007';

function regel(code, angaben) {
  return {
    code: LAGEN.pruefBefund,
    position: 0,
    tabelle: TAB,
    id: ID,
    naht: { code, position: 0, tabelle: TAB, id: ID, ...angaben },
  };
}

// Je Code der Schnittstelle ein Beispiel-Befund und der erwartete Satz.
const SCHNITTSTELLE = [
  [
    LAGEN.erweiterungAus,
    {},
    'Die Erweiterung «Datenbank» ist ausgeschaltet; Datensätze lassen sich erst ändern, wenn sie in den Einstellungen unter Erweiterungen eingeschaltet ist.',
  ],
  [
    LAGEN.wurzelFehlt,
    {},
    'Änderungen an Datensätzen lassen sich nur in einem geöffneten Bereich speichern.',
  ],
  [LAGEN.leer, {}, 'Es gibt nichts zu speichern; die Änderung nennt keinen Datensatz.'],
  [
    LAGEN.form,
    { position: 0, feld: 'tabelle' },
    'Die Änderung ist unvollständig oder nicht auslegbar aufgebaut und wurde deshalb nicht gespeichert.',
  ],
  [
    LAGEN.tabelleAusserhalb,
    { position: 0, tabelle: TAB },
    'Die Tabelle «Kunden» liegt nicht im geöffneten Bereich oder ist keine Tabellen-Datei; von hier aus lässt sie sich nicht ändern.',
  ],
  [
    LAGEN.tabelleUnbekannt,
    { position: 0, tabelle: TAB },
    'Die Tabelle «Kunden» ist nicht lesbar oder beschreibt keine Felder; bitte ihre Definition prüfen.',
  ],
  [
    LAGEN.feldUnbekannt,
    { position: 0, tabelle: TAB, id: ID, feld: 'Farbe', angabe: 'werte' },
    'Die Tabelle «Kunden» kennt kein Feld «Farbe».',
  ],
  [
    LAGEN.typVerletzt,
    { position: 0, tabelle: TAB, id: ID, feld: 'Menge', typ: 'number', wert: 'viel' },
    'Der Wert im Feld «Menge» passt nicht zu dessen Art; bitte den Wert prüfen.',
  ],
  [
    LAGEN.pflichtFehlt,
    { position: 0, tabelle: TAB, id: ID, feld: 'Name' },
    'Das Feld «Name» muss ausgefüllt sein.',
  ],
  [
    LAGEN.datensatzUnbekannt,
    { position: 0, tabelle: TAB, id: ID },
    'Die Tabelle «Kunden» enthält keinen Datensatz r-00007; möglicherweise wurde er inzwischen gelöscht.',
  ],
  [
    LAGEN.datensatzMehrdeutig,
    { position: 0, tabelle: TAB, id: ID },
    'Der Datensatz r-00007 kommt in mehreren Dateien der Tabelle «Kunden» vor; weil nicht zu entscheiden ist, welcher gemeint ist, wurde er nicht geändert.',
  ],
  [
    LAGEN.datensatzMehrfach,
    { position: 1, tabelle: TAB, id: ID, erstePosition: 0 },
    'Der Datensatz r-00007 kommt in dieser Änderung mehr als einmal vor; jeder Datensatz darf darin nur einmal genannt sein.',
  ],
  [
    LAGEN.kennungVergeben,
    { position: 0, tabelle: TAB, id: ID },
    'Die Kennung r-00007 ist in der Tabelle «Kunden» bereits vergeben.',
  ],
  [
    LAGEN.pruefBefund,
    { position: 0, tabelle: TAB, id: ID },
    'Eine Prüfregel der Datenbank hat die Änderung abgewiesen; sie wurde nicht gespeichert.',
  ],
  [
    LAGEN.gesperrt,
    { gegenstand: null, konflikt: null },
    'Die Tabelle wird gerade von einem anderen Vorgang beschrieben; bitte gleich noch einmal versuchen.',
  ],
  [
    LAGEN.vorgangFehlt,
    { grund: 'zaehlerGesperrt' },
    'Die Änderung ließ sich nicht beginnen, weil die Datenbank sie nicht nummerieren konnte; bitte noch einmal versuchen.',
  ],
  [
    LAGEN.lesenFehlgeschlagen,
    { position: 0, tabelle: TAB },
    'Eine Datei der Tabelle «Kunden» ließ sich nicht lesen; die Änderung wurde nicht gespeichert.',
  ],
  [
    LAGEN.schreibenFehlgeschlagen,
    { tabelle: TAB },
    'Die Änderung ließ sich nicht speichern, weil eine Datei der Tabelle nicht geschrieben werden konnte; bitte noch einmal versuchen.',
  ],
  [
    LAGEN.belegFehlgeschlagen,
    {},
    'Der Änderungsbeleg zu dieser Änderung ließ sich nicht erstellen; bitte noch einmal versuchen.',
  ],
  [
    LAGEN.erwartungFehlt,
    { position: 0, tabelle: TAB, id: ID },
    'Zum Datensatz r-00007 fehlt der zuletzt angezeigte Stand; ohne ihn ließe sich eine Änderung durch andere nicht erkennen, deshalb wurde nichts gespeichert.',
  ],
  [
    LAGEN.standWeichtAb,
    {
      position: 0,
      tabelle: TAB,
      id: ID,
      geloescht: false,
      felder: [{ name: 'Name', erwartet: 'Anna', vorgefunden: 'Berta' }],
    },
    'Der Datensatz r-00007 in der Tabelle «Kunden» wurde inzwischen anderweitig geändert oder gelöscht; bitte die aktuelle Fassung ansehen und dann entscheiden, ob die eigene Änderung trotzdem gespeichert werden soll.',
  ],
  [
    LAGEN.teilweiseGeschrieben,
    { grundCode: 'x', geschriebeneDateien: [], angefuegteBelege: [] },
    'Das Speichern wurde mitten im Schreiben unterbrochen; die Anwendung schreibt die Änderung beim nächsten Speichern oder beim nächsten Öffnen des Bereichs zu Ende.',
  ],
  [
    LAGEN.haengt,
    { tabellen: ['Daten/Kunden.md', 'Daten/Orte.md'], vorgang: 'v-1' },
    'Eine frühere Änderung wurde unterbrochen und wird beim nächsten Versuch zu Ende geschrieben; bis dahin nehmen die Tabellen «Kunden» und «Orte» keine Änderungen an.',
  ],
  [
    LAGEN.unerwartet,
    { grund: 'boom' },
    'Beim Speichern ist ein unerwarteter Fehler aufgetreten; bitte noch einmal versuchen.',
  ],
];

// Je Code des Regel-Werks ein Befund in der Gestalt seines Regel-Moduls.
const REGELWERK = [
  [
    REGEL_LAGEN.schluesselDoppelt,
    { felder: ['Name', 'Ort'], wert: 'Anna · Basel', positionen: [0, 2] },
    'Der Schlüssel «Anna · Basel» in «Name» und «Ort» kommt in dieser Änderung mehr als einmal vor, in den Anweisungen 1 und 3; in der Tabelle «Kunden» darf jeder Schlüssel nur einmal vergeben sein.',
  ],
  [
    REGEL_LAGEN.schluesselDoppeltImBestand,
    { felder: ['Name'], wert: 'Anna', vorhanden: 'r-00002', anzeige: 'r-00002 (Anna)' },
    'Der Schlüssel «Anna» in «Name» ist in der Tabelle «Kunden» bereits an den Datensatz r-00002 (Anna) vergeben.',
  ],
  [
    REGEL_LAGEN.schluesselBestandUneindeutig,
    {
      felder: ['Name'],
      wert: 'Anna',
      kennungen: ['r-00002', 'r-00003'],
      anzahl: 2,
      anzeige: 'r-00002 (Anna), r-00003 (Anna)',
    },
    'Der Schlüssel «Anna» in «Name» ist in der Tabelle «Kunden» bereits mehrfach vergeben, an die Datensätze r-00002 (Anna), r-00003 (Anna). Die Änderung wurde nicht gespeichert; bitte zuerst die vorhandenen Datensätze bereinigen.',
  ],
  [
    REGEL_LAGEN.verweisZielFehlt,
    { feld: 'Ort', wert: 'Bern', zieltabelle: 'Orte' },
    'Der Wert «Bern» im Feld «Ort» verweist auf keinen vorhandenen Datensatz der Tabelle «Orte».',
  ],
  [
    REGEL_LAGEN.verweisMehrdeutig,
    { feld: 'Ort', wert: 'Bern', zieltabelle: 'Orte', anzahl: 2, kennungen: ['r-1', 'r-2'] },
    'Im Feld «Ort» passt «Bern» auf 2 Datensätze der Tabelle «Orte»; bitte den gemeinten Datensatz eindeutig wählen.',
  ],
  [
    REGEL_LAGEN.verweisTabelleUnbekannt,
    { feld: 'Ort', wert: 'Bern', zieltabelle: 'Staedte' },
    'Das Feld «Ort» verweist auf die Tabelle «Staedte», die es im Bereich nicht gibt; bitte die Definition der Tabelle «Kunden» prüfen.',
  ],
  [
    REGEL_LAGEN.verweisSchluesselMehrteilig,
    { feld: 'Ort', wert: 'Bern', zieltabelle: ZIEL },
    'Das Feld «Ort» verweist auf die Tabelle «Orte», deren Schlüssel aus mehreren Feldern besteht; ein solcher Verweis lässt sich nur über die Kennung des Datensatzes setzen, nicht über «Bern».',
  ],
  [
    REGEL_LAGEN.loeschenAbhaengige,
    {
      zieltabelle: 'Bestellungen',
      felder: ['Kunde'],
      anzahl: 3,
      erster: 'r-00011',
      anzeige: 'r-00011 (B-11)',
    },
    'Der Datensatz r-00007 lässt sich nicht löschen, weil noch 3 Datensätze der Tabelle «Bestellungen» über «Kunde» auf ihn verweisen, zum Beispiel r-00011 (B-11).',
  ],
  [
    REGEL_LAGEN.pruefregelVerletzt,
    {
      feld: 'Menge',
      wert: '0',
      regel: 'value > 0',
      meldung: 'Mindestens eins.',
      grund: 'ausdruck',
    },
    'Der Wert «0» im Feld «Menge» erfüllt die Prüfregel «value > 0» nicht. Mindestens eins.',
  ],
  [
    REGEL_LAGEN.datensatzregelVerletzt,
    { felder: ['Von', 'Bis'], regel: 'Von <= Bis', meldung: '', grund: 'ausdruck' },
    'Der Datensatz r-00007 in der Tabelle «Kunden» erfüllt die Regel «Von <= Bis» nicht.',
  ],
  [
    REGEL_LAGEN.nichtBearbeitbar,
    { anzeige: 'r-00007 (Anna)', regel: 'Status != "zu"', meldung: '', grund: 'ausdruck' },
    'Der Datensatz r-00007 (Anna) in der Tabelle «Kunden» ist nach der Regel «Status != "zu"» derzeit nicht bearbeitbar.',
  ],
  [
    REGEL_LAGEN.katalogNichtBereit,
    { grund: 'laeuft' },
    'Die Tabellen des Bereichs sind noch nicht vollständig eingelesen, deshalb ließ sich die Änderung an der Tabelle «Kunden» nicht prüfen; sie wurde nicht gespeichert. Bitte gleich noch einmal versuchen.',
  ],
  [
    REGEL_LAGEN.unerwartet,
    { regel: 'verweis', grund: 'antwortUngueltig' },
    'Eine Prüfung der Datenbank ist unerwartet gescheitert; die Änderung wurde deshalb nicht gespeichert. Grund: antwortUngueltig',
  ],
];

describe('Jede Lage beider Kataloge in deutschem Text (B7, AK2)', () => {
  it('deckt beide Kataloge vollständig ab', () => {
    expect(SCHNITTSTELLE.map(([code]) => code).sort()).toEqual(Object.values(LAGEN).sort());
    expect(REGELWERK.map(([code]) => code).sort()).toEqual(Object.values(REGEL_LAGEN).sort());
  });

  it.each(SCHNITTSTELLE)('Schnittstelle %s', (code, angaben, satz) => {
    expect(loeseLageAuf({ code, ...angaben }, DE).text).toBe(satz);
  });

  it.each(REGELWERK)('Regel-Werk %s', (code, angaben, satz) => {
    const aufgeloest = loeseLageAuf(regel(code, angaben), DE);
    expect(aufgeloest.code).toBe(code);
    expect(aufgeloest.text).toBe(satz);
  });
});

describe('Einsetzungs-Regeln (B2)', () => {
  it('Tabellen-Name ohne Ordner und Endung, auch mit Rückstrich', () => {
    expect(tabellenName('C:\\Bereich\\Kunden.md')).toBe('Kunden');
    expect(tabellenName('Daten/Orte.MD')).toBe('Orte');
    expect(tabellenName(null)).toBeNull();
  });

  it('Listen: ein, zwei und drei Einträge, «und» der Sprache', () => {
    const satz = (felder, u = DE) =>
      loeseLageAuf(regel(REGEL_LAGEN.schluesselDoppeltImBestand, { felder, wert: 'x' }), u).text;
    expect(satz(['A'])).toContain('in «A» ist');
    expect(satz(['A', 'B'])).toContain('in «A» und «B» ist');
    expect(satz(['A', 'B', 'C'])).toContain('in «A», «B» und «C» ist');
    expect(satz(['A', 'B'], umgebung('en'))).toContain('in «A» and «B» is');
    expect(satz(['A', 'B'], umgebung('it'))).toContain('in «A» e «B» è');
  });

  it('eine leere Meldung wird samt Leerraum weggelassen, nie als Klammer', () => {
    const text = loeseLageAuf(
      regel(REGEL_LAGEN.pruefregelVerletzt, { feld: 'Menge', wert: '0', regel: 'r', meldung: '' }),
      DE,
    ).text;
    expect(text).toBe('Der Wert «0» im Feld «Menge» erfüllt die Prüfregel «r» nicht.');
    expect(text).not.toMatch(/[{}]/);
  });

  it('eine Meldung in mehreren Sprachen wird nach der Rückfall-Kette aufgelöst', () => {
    const meldung = { en: 'At least one.', de: 'Mindestens eins.' };
    const lage = regel(REGEL_LAGEN.pruefregelVerletzt, {
      feld: 'M',
      wert: '0',
      regel: 'r',
      meldung,
    });
    expect(loeseLageAuf(lage, DE).text).toMatch(/ Mindestens eins\.$/);
    expect(loeseLageAuf(lage, umgebung('en')).text).toMatch(/ At least one\.$/);
    // Französisch fehlt, keine Rückfall-Sprache: die erste geschriebene Fassung.
    expect(loeseLageAuf(lage, umgebung('fr')).text).toMatch(/ At least one\.$/);
    // Mit Rückfall-Sprache: sie vor der ersten Fassung.
    expect(loeseLageAuf(lage, umgebung('fr', { rueckfallSprache: 'de' })).text).toMatch(
      / Mindestens eins\.$/,
    );
  });

  it('Anzeige-Form: die Angabe des Befunds, sonst die Kennung', () => {
    const mit = regel(REGEL_LAGEN.nichtBearbeitbar, { anzeige: 'r-00007 (Anna)', regel: 'r' });
    const ohne = regel(REGEL_LAGEN.nichtBearbeitbar, { regel: 'r' });
    expect(loeseLageAuf(mit, DE).text).toContain('Der Datensatz r-00007 (Anna) in');
    expect(loeseLageAuf(ohne, DE).text).toContain('Der Datensatz r-00007 in');
  });

  it('der doppelte Schlüssel nennt beide Positionen, ab 1 gezählt', () => {
    const text = loeseLageAuf(
      regel(REGEL_LAGEN.schluesselDoppelt, { felder: ['Name'], wert: 'x', positionen: [3, 5] }),
      DE,
    ).text;
    expect(text).toContain('in den Anweisungen 4 und 6;');
  });

  it('der Lösch-Schutz mit einem einzigen abhängigen Datensatz steht in der Einzahl', () => {
    const lage = regel(REGEL_LAGEN.loeschenAbhaengige, {
      zieltabelle: 'Bestellungen',
      felder: ['Kunde'],
      anzahl: 1,
      anzeige: 'r-00011 (B-11)',
    });
    const aufgeloest = loeseLageAuf(lage, DE);
    expect(aufgeloest.text).toBe(
      'Der Datensatz r-00007 lässt sich nicht löschen, weil noch ein Datensatz der Tabelle «Bestellungen» über «Kunde» auf ihn verweist: r-00011 (B-11).',
    );
    // Die Felder gehören der abhängigen Tabelle; die Lage steht am Kopf.
    expect(aufgeloest.felder).toBeNull();
    expect(aufgeloest.kopf).toBe(true);
  });

  it('ein Verweis ohne Ziel-Tabelle hat seine eigene Fassung', () => {
    const lage = regel(REGEL_LAGEN.verweisTabelleUnbekannt, {
      feld: 'Ort',
      wert: 'Bern',
      zieltabelle: null,
      grund: 'zielAngabeFehlt',
    });
    expect(loeseLageAuf(lage, DE).text).toBe(
      'Das Feld «Ort» ist ein Verweis, nennt aber keine Ziel-Tabelle; bitte die Definition der Tabelle «Kunden» prüfen.',
    );
  });

  it('ein Grund mit eigenem Satz wird übersetzt, sonst roh gezeigt', () => {
    const satz = (grund) =>
      loeseLageAuf(regel(REGEL_LAGEN.unerwartet, { grund }), DE).text.split('Grund: ')[1];
    expect(satz('nichtAuswertbar')).toBe('Die Regel ließ sich für diesen Wert nicht auswerten.');
    expect(satz('zielAngabeFehlt')).toBe('Die Spalte nennt keine Ziel-Tabelle.');
    expect(satz('ersetzungUngueltig')).toBe('ersetzungUngueltig');
  });

  it('ein Regel-Code ohne eigenen Text fällt auf den allgemeinen Text der Prüf-Naht zurück', () => {
    const aufgeloest = loeseLageAuf(regel('regelErfunden', { feld: 'Name' }), DE);
    expect(aufgeloest.text).toBe(
      'Eine Prüfregel der Datenbank hat die Änderung abgewiesen; sie wurde nicht gespeichert.',
    );
    expect(aufgeloest.feld).toBe('Name');
  });

  it('ein unbekannter Code und eine fehlende Lage ergeben den allgemeinen Satz', () => {
    expect(loeseLageAuf({ code: 'auftragErfunden' }, DE).text).toBe(
      'Die Änderung ließ sich nicht speichern.',
    );
    expect(loeseLageAuf(null, DE).text).toBe('Die Änderung ließ sich nicht speichern.');
  });

  it('das Präfix steht nur bei mehreren Anweisungen, ab 1 gezählt', () => {
    const lage = { code: LAGEN.pflichtFehlt, position: 1, tabelle: TAB, feld: 'Name' };
    expect(loeseLageAuf(lage, DE).text).toBe('Das Feld «Name» muss ausgefüllt sein.');
    expect(loeseLageAuf(lage, { ...DE, mehrereAnweisungen: true }).text).toBe(
      'Anweisung 2: Das Feld «Name» muss ausgefüllt sein.',
    );
    expect(loeseLageAuf(lage, { ...umgebung('fr'), mehrereAnweisungen: true }).text).toBe(
      'Instruction 2 : Le champ «Name» doit être renseigné.',
    );
  });

  it('Feld, Felder und Kopf werden aus den Angaben gelesen', () => {
    expect(loeseLageAuf({ code: LAGEN.pflichtFehlt, feld: 'Name' }, DE)).toMatchObject({
      code: LAGEN.pflichtFehlt,
      feld: 'Name',
      felder: null,
      kopf: false,
    });
    expect(
      loeseLageAuf(regel(REGEL_LAGEN.datensatzregelVerletzt, { felder: ['Von', 'Bis'] }), DE),
    ).toMatchObject({ feld: null, felder: ['Von', 'Bis'], kopf: false });
    expect(loeseLageAuf({ code: LAGEN.gesperrt }, DE)).toMatchObject({ feld: null, kopf: true });
  });
});

describe('Ergebnis als Ganzes', () => {
  it('Erfolg ergibt keine Lage, eine Abweisung je Lage einen Satz', () => {
    expect(loeseErgebnisAuf({ ok: true }, DE)).toEqual([]);
    const lagen = [
      { code: LAGEN.pflichtFehlt, position: 0, feld: 'Name' },
      { code: LAGEN.typVerletzt, position: 0, feld: 'Menge' },
    ];
    expect(loeseErgebnisAuf({ ok: false, lagen }, DE).map((l) => l.feld)).toEqual([
      'Name',
      'Menge',
    ]);
  });

  it('ein Ergebnis ohne Liste ergibt den Satz seines Codes, sonst den allgemeinen', () => {
    expect(loeseErgebnisAuf({ ok: false, code: LAGEN.leer }, DE)[0].text).toBe(
      'Es gibt nichts zu speichern; die Änderung nennt keinen Datensatz.',
    );
    expect(loeseErgebnisAuf(null, DE)[0].text).toBe('Die Änderung ließ sich nicht speichern.');
  });
});

describe('Wächter: kein Text unter database.auftrag.* trägt die Position (B3)', () => {
  it('in keiner der fünf Sprachen', () => {
    const treffer = [];
    for (const code of SPRACHEN) {
      for (const [key, wert] of Object.entries(FRAGMENTE[code])) {
        if (key.startsWith('database.auftrag.') && wert.includes('{position}'))
          treffer.push(`${code}: ${key}`);
      }
    }
    expect(treffer).toEqual([]);
  });

  it('das Präfix des Bedienorts steht in allen fünf Sprachen mit {n}', () => {
    for (const code of SPRACHEN) {
      expect(FRAGMENTE[code]['database.form.positionPrefix']).toContain('{n}');
    }
  });
});
