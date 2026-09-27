// 4T-001788 (Epic 3E-000255, E9, AK7): Die Sperr-Ordnung als eigenständig
// prüfbare Funktion — zuerst nach Tabelle, dann nach interner Kennung.
//
// **Warum die Funktion für sich geprüft wird und nicht über den Nehm-Vorgang:**
// Die Ordnung ist rein und hat kein Dateisystem; ein Fall, der sie über vier
// angelegte Sperr-Dateien misst, prüfte die Reihenfolge der Datei-Zugriffe und
// nicht die Regel. Ihre Anwendung im geordneten Nehmen steht in
// `db-sperr-lebenszyklus.test.js`.
//
// **Der Gleichlauf der Art-Namen ist selbst ein Prüf-Gegenstand.** Das
// Ordnungs-Modul liegt prozess-neutral unter `src/shared/` und importiert den
// Sperr-Speicher deshalb nicht; es führt die drei Art-Namen als eigene
// Konstanten. Ein Fall unten hält beide Seiten zusammen — ohne ihn liefe die
// Ordnung bei einer Umbenennung still ins Leere und sortierte jeden Gegenstand
// auf denselben Rang.
import { describe, it, expect } from 'vitest';

import {
  ART_CHANGE_LOG,
  ART_COUNTER,
  ART_DATENSATZ,
  ART_DEFINITION,
  ART_SWEEP,
  RANG_JE_ART,
  ordneSperrGegenstaende,
  vergleicheCodePunkte,
} from '../../src/shared/database/lock-order.js';
import * as sperrSpeicher from '../../src/main/database/lock-store.js';

const {
  ART_CHANGE_LOG: SPEICHER_CHANGE_LOG,
  ART_COUNTER: SPEICHER_COUNTER,
  ART_DATENSATZ: SPEICHER_DATENSATZ,
  ART_DEFINITION: SPEICHER_DEFINITION,
  ART_SWEEP: SPEICHER_SWEEP,
  loeseGegenstand,
} = sperrSpeicher;

// Ein aufgelöster Gegenstand in der Gestalt, die `loeseGegenstand` liefert: der
// Vergleichs-Schlüssel der Tabelle, die Art und die nackte Nummer.
function datensatz(tabelle, nummer) {
  return { schluessel: tabelle, art: ART_DATENSATZ, nummer };
}
function definition(tabelle) {
  return { schluessel: tabelle, art: ART_DEFINITION, nummer: null };
}
function belege(tabelle) {
  return { schluessel: tabelle, art: ART_CHANGE_LOG, nummer: null };
}
// 4T-001820 (Epic 3E-000254, B1): Der Vorgangs-Zähler hat keinen Tabellen-
// Schlüssel — sein Gegenstand ist der Bereich als Ganzes.
function zaehler() {
  return { schluessel: '', art: ART_COUNTER, nummer: null };
}
// 4T-001824 (Epic 3E-000254, B1): Die Aufräum-Sperre eines Protokolls hat
// ebenfalls keinen Tabellen-Schlüssel.
function aufraeumen() {
  return { schluessel: '', art: ART_SWEEP, nummer: null };
}

// Kurzform einer geordneten Liste, damit die Erwartung in einer Zeile lesbar
// bleibt: `kunden.md/definition`, `kunden.md/record-7`.
function kurz(liste) {
  return liste.map((e) => `${e.schluessel}/${e.art}${e.nummer === null ? '' : `-${e.nummer}`}`);
}

describe('Sperr-Ordnung: zuerst die Tabelle, dann die Kennung (4T-001788, AK7)', () => {
  it('ordnet zuerst nach dem Vergleichs-Schlüssel der Tabelle', () => {
    const geordnet = ordneSperrGegenstaende([
      definition('rechnungen.md'),
      definition('kunden.md'),
      definition('artikel.md'),
    ]);

    expect(kurz(geordnet)).toEqual([
      'artikel.md/definition',
      'kunden.md/definition',
      'rechnungen.md/definition',
    ]);
  });

  it('ordnet innerhalb einer Tabelle Definition, Datensätze, Beleg-Datei', () => {
    const geordnet = ordneSperrGegenstaende([
      belege('kunden.md'),
      datensatz('kunden.md', 42),
      definition('kunden.md'),
    ]);

    expect(kurz(geordnet)).toEqual([
      'kunden.md/definition',
      'kunden.md/record-42',
      'kunden.md/changeLog',
    ]);
  });

  it('ordnet die Datensätze aufsteigend nach Nummer und nicht nach ihrem Text', () => {
    // Der tragende Fall: Als Text stünde `r-00010` vor `r-00009`. Die Ordnung
    // arbeitet auf der NUMMER, und genau dafür liefert die Gegenstands-Auflösung
    // sie mit.
    const geordnet = ordneSperrGegenstaende([
      datensatz('kunden.md', 10),
      datensatz('kunden.md', 9),
      datensatz('kunden.md', 100),
      datensatz('kunden.md', 2),
    ]);

    expect(geordnet.map((e) => e.nummer)).toEqual([2, 9, 10, 100]);
  });

  it('bringt Tabellen und Arten gemeinsam in die verbindliche Reihenfolge', () => {
    const geordnet = ordneSperrGegenstaende([
      datensatz('rechnungen.md', 3),
      belege('kunden.md'),
      datensatz('kunden.md', 5),
      definition('rechnungen.md'),
      datensatz('kunden.md', 1),
      definition('kunden.md'),
    ]);

    expect(kurz(geordnet)).toEqual([
      'kunden.md/definition',
      'kunden.md/record-1',
      'kunden.md/record-5',
      'kunden.md/changeLog',
      'rechnungen.md/definition',
      'rechnungen.md/record-3',
    ]);
  });

  it('entfernt Doppelte und behält den ersten Eintrag', () => {
    const erster = datensatz('kunden.md', 7);
    const zweiter = { ...datensatz('kunden.md', 7), merkmal: 'zweiter' };
    const geordnet = ordneSperrGegenstaende([erster, zweiter, definition('kunden.md')]);

    expect(kurz(geordnet)).toEqual(['kunden.md/definition', 'kunden.md/record-7']);
    expect(geordnet[1]).toBe(erster);
  });

  it('hält Datensatz, Definition und Beleg-Datei derselben Tabelle auseinander', () => {
    // Drei Gegenstände mit demselben Schlüssel sind NICHT derselbe; wer sie
    // zusammenwürfe, nähme zwei der drei Sperren nie.
    const geordnet = ordneSperrGegenstaende([
      definition('kunden.md'),
      belege('kunden.md'),
      datensatz('kunden.md', 1),
      definition('kunden.md'),
    ]);

    expect(geordnet).toHaveLength(3);
  });

  it('reicht die Einträge unverändert durch, samt mitgeführter Felder', () => {
    // Der geordnete Nehm-Vorgang führt an jedem Eintrag den Pfad und die
    // Kennung mit; verlöre die Ordnung sie, müsste er sie ein zweites Mal
    // bilden.
    const eintrag = { ...datensatz('kunden.md', 1), relativ: 'Kunden.md', kennung: 'r-00001' };

    expect(ordneSperrGegenstaende([eintrag])[0]).toBe(eintrag);
  });

  it('gibt die leere Liste unverändert zurück und verändert die Eingabe nicht', () => {
    const eingabe = [datensatz('b.md', 2), datensatz('a.md', 1)];

    expect(ordneSperrGegenstaende([])).toEqual([]);
    ordneSperrGegenstaende(eingabe);
    expect(kurz(eingabe)).toEqual(['b.md/record-2', 'a.md/record-1']);
  });
});

// --- 4T-001820: der Vorgangs-Zähler steht zuletzt ----------------------------------------

describe('Sperr-Ordnung: der Vorgangs-Zähler zuletzt (4T-001820, AK6)', () => {
  it('stellt ihn hinter ALLE Tabellen und nicht vor die erste', () => {
    // Der tragende Fall. Sein Schlüssel ist leer, und im Code-Punkt-Vergleich
    // stünde der leere Schlüssel vor jedem anderen — also an der genau falschen
    // Stelle. Die Ordnung nimmt bereichsweite Gegenstände deshalb aus dem
    // Tabellen-Vergleich heraus.
    const geordnet = ordneSperrGegenstaende([
      zaehler(),
      belege('rechnungen.md'),
      definition('artikel.md'),
      datensatz('kunden.md', 5),
    ]);

    expect(kurz(geordnet)).toEqual([
      'artikel.md/definition',
      'kunden.md/record-5',
      'rechnungen.md/changeLog',
      '/counter',
    ]);
  });

  it('bleibt auch dann letzter, wenn er zuerst in der Liste steht', () => {
    const geordnet = ordneSperrGegenstaende([zaehler(), definition('a.md')]);

    expect(geordnet.map((e) => e.art)).toEqual([ART_DEFINITION, ART_COUNTER]);
  });

  it('kommt nur einmal vor, auch bei mehrfacher Nennung', () => {
    expect(ordneSperrGegenstaende([zaehler(), zaehler(), zaehler()])).toHaveLength(1);
  });

  it('weist einen Zähler MIT Tabellen-Schlüssel ab, statt ihn einzusortieren', () => {
    // Zwei verschiedene Gegenstände unter derselben Art wären ein Irrtum des
    // Aufrufers, von dem die Sperre nur einen kennt.
    expect(() =>
      ordneSperrGegenstaende([{ schluessel: 'kunden.md', art: ART_COUNTER, nummer: null }]),
    ).toThrow(TypeError);
  });

  it('nimmt die Gestalt entgegen, die die Gegenstands-Auflösung liefert', () => {
    // Die Kopplung an den Speicher: Die Ordnung arbeitet auf AUFGELÖSTEN
    // Gegenständen, und ein Fall gegen eine hier nachgebaute Gestalt prüfte den
    // Nachbau.
    const aufgeloest = loeseGegenstand('/bereich', { art: ART_COUNTER });

    expect(aufgeloest).toMatchObject({ ok: true, schluessel: '', nummer: null });
    expect(ordneSperrGegenstaende([aufgeloest, definition('a.md')])[1]).toBe(aufgeloest);
  });
});

// --- 4T-001824: die Aufräum-Sperre steht zuerst -----------------------------------------

describe('Sperr-Ordnung: die Aufräum-Sperre zuerst (4T-001824, B1)', () => {
  it('ordnet alle fünf Arten: Aufräum-Sperre, Tabellen, Zähler', () => {
    // Die vollständige Rang-Folge. Die Aufräum-Sperre wird als erste und
    // allein genommen, unter ihr folgen die im Protokoll genannten Sperren;
    // sie steht deshalb vor jeder Tabelle und nicht wie der Zähler dahinter.
    const geordnet = ordneSperrGegenstaende([
      zaehler(),
      belege('kunden.md'),
      datensatz('kunden.md', 5),
      aufraeumen(),
      definition('kunden.md'),
    ]);

    expect(kurz(geordnet)).toEqual([
      '/sweep',
      'kunden.md/definition',
      'kunden.md/record-5',
      'kunden.md/changeLog',
      '/counter',
    ]);
    expect(Object.entries(RANG_JE_ART).sort((a, b) => a[1] - b[1])).toEqual([
      [ART_SWEEP, 0],
      [ART_DEFINITION, 1],
      [ART_DATENSATZ, 2],
      [ART_CHANGE_LOG, 3],
      [ART_COUNTER, 4],
    ]);
  });

  it('stellt sie auch vor eine Tabelle, deren Schlüssel im Code-Punkt-Vergleich vorn läge', () => {
    // Ein Schlüssel aus Satzzeichen stünde vor jedem Buchstaben; die Seite der
    // bereichsweiten Arten entscheidet vor dem Tabellen-Vergleich.
    const geordnet = ordneSperrGegenstaende([definition('!.md'), aufraeumen()]);

    expect(geordnet.map((e) => e.art)).toEqual([ART_SWEEP, ART_DEFINITION]);
  });

  it('weist eine Aufräum-Sperre MIT Tabellen-Schlüssel ab', () => {
    expect(() =>
      ordneSperrGegenstaende([{ schluessel: 'kunden.md', art: ART_SWEEP, nummer: null }]),
    ).toThrow(TypeError);
  });

  it('nimmt die Gestalt entgegen, die die Gegenstands-Auflösung liefert', () => {
    const aufgeloest = loeseGegenstand('/bereich', { art: ART_SWEEP, id: 7 });

    expect(aufgeloest).toMatchObject({ ok: true, schluessel: '', kennung: '7', nummer: null });
    expect(ordneSperrGegenstaende([definition('a.md'), aufgeloest])[0]).toBe(aufgeloest);
  });
});

// --- Der Vergleich selbst ---------------------------------------------------------------

describe('Sperr-Ordnung: Code-Punkt-Vergleich statt sprachabhängiger Sortierung', () => {
  it('ordnet Groß- und Kleinbuchstaben nach Code-Punkt und nicht nach Sprache', () => {
    // In der deutschen Sortierung stünde `a` vor `B`; nach Code-Punkten steht
    // jeder Großbuchstabe vor jedem Kleinbuchstaben. Der Fall hielte einen
    // Wechsel auf localeCompare fest.
    expect(vergleicheCodePunkte('B', 'a')).toBeLessThan(0);
    expect('B'.localeCompare('a')).toBeGreaterThan(0);
  });

  it('ordnet Umlaute nach Code-Punkt und nicht nach deutscher Lesart', () => {
    // Nach deutscher Sortierung gehört `ä` neben `a` und damit vor `z`; nach
    // Code-Punkten steht es dahinter.
    expect(vergleicheCodePunkte('ä', 'z')).toBeGreaterThan(0);
    expect(vergleicheCodePunkte('a', 'ä')).toBeLessThan(0);
  });

  it('ordnet ein Zeichen jenseits der Grundebene hinter jedes Zeichen darunter', () => {
    // Der Grund, aus dem der Vergleich nicht `<` benutzt: Jener misst
    // UTF-16-Code-EINHEITEN, und dort stünde das Ersatzpaar des Emojis VOR dem
    // Zeichen U+E000. Nach Code-Punkten ist es umgekehrt.
    const hoch = String.fromCodePoint(0x1f600);
    const privat = String.fromCodePoint(0xe000);

    expect(vergleicheCodePunkte(hoch, privat)).toBeGreaterThan(0);
    expect(hoch < privat).toBe(true);
  });

  it('meldet den kürzeren Schlüssel als kleiner, wenn er ein Anfang des längeren ist', () => {
    expect(vergleicheCodePunkte('kunden.md', 'kunden.md.alt')).toBeLessThan(0);
    expect(vergleicheCodePunkte('kunden.md', 'kunden.md')).toBe(0);
  });

  it('sortiert eine Tabellen-Liste mit Umlauten deterministisch', () => {
    const geordnet = ordneSperrGegenstaende([
      definition('über.md'),
      definition('zebra.md'),
      definition('apfel.md'),
    ]);

    expect(geordnet.map((e) => e.schluessel)).toEqual(['apfel.md', 'zebra.md', 'über.md']);
  });
});

// --- Der Vertrag bricht laut ------------------------------------------------------------

describe('Sperr-Ordnung: unbrauchbare Eingaben brechen laut (Entwicklungsrichtlinien, Kapitel 3)', () => {
  it.each([
    ['keine Liste', undefined],
    ['kein Feld-Objekt', null],
    ['eine Zeichenkette', 'kunden.md'],
  ])('weist %s als Ganzes ab', (_lage, eingabe) => {
    expect(() => ordneSperrGegenstaende(eingabe)).toThrow(TypeError);
  });

  it.each([
    ['kein Objekt', 'kunden.md'],
    ['ohne Schlüssel', { art: ART_DEFINITION, nummer: null }],
    ['mit leerem Schlüssel', { schluessel: '', art: ART_DEFINITION, nummer: null }],
    ['mit unbekannter Art', { schluessel: 'kunden.md', art: 'segment', nummer: null }],
    ['Datensatz ohne Nummer', { schluessel: 'kunden.md', art: ART_DATENSATZ, nummer: null }],
  ])('weist einen Eintrag %s ab, statt ihn still zu übergehen', (_lage, eintrag) => {
    // Eine Ordnung, die einen Gegenstand verschluckt, nähme seine Sperre nicht,
    // ohne dass es jemand merkte.
    expect(() => ordneSperrGegenstaende([definition('a.md'), eintrag])).toThrow(TypeError);
  });
});

// --- Gleichlauf mit dem Sperr-Speicher ---------------------------------------------------

describe('Sperr-Ordnung: dieselben Art-Namen wie der Sperr-Speicher (4T-001788, L8)', () => {
  it('führt die fünf Arten unter denselben Namen (4T-001824)', () => {
    // 4T-001820 (AK7): Die vierte Art kommt hinzu. Ohne diesen Gleichlauf liefe
    // die Ordnung bei einer Umbenennung still ins Leere und sortierte jeden
    // Gegenstand auf denselben Rang.
    // 4T-001824 (B1): die fünfte, die Aufräum-Sperre.
    expect([ART_DATENSATZ, ART_DEFINITION, ART_CHANGE_LOG, ART_COUNTER, ART_SWEEP]).toEqual([
      SPEICHER_DATENSATZ,
      SPEICHER_DEFINITION,
      SPEICHER_CHANGE_LOG,
      SPEICHER_COUNTER,
      SPEICHER_SWEEP,
    ]);
  });

  it('kennt jede Art des Speichers und keine darüber hinaus', () => {
    // Der Durchlauf-Wächter zum Fall darüber: Eine fünfte Art im Speicher, die
    // hier fehlt, führte dazu, dass ihre Sperre in keiner Ordnung vorkäme — und
    // der Fall oben bliebe grün, weil er eine feste Liste vergleicht.
    const artenDesSpeichers = Object.keys(sperrSpeicher)
      .filter((name) => name.startsWith('ART_'))
      .map((name) => sperrSpeicher[name])
      .sort();
    const artenDerOrdnung = Object.keys(RANG_JE_ART).sort();

    expect(artenDerOrdnung).toEqual(artenDesSpeichers);
    // 4T-001824: fünf Arten seit der Aufräum-Sperre.
    expect(artenDerOrdnung.length).toBeGreaterThanOrEqual(5);
  });
});
