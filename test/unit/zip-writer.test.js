// 4T-002293 (Epic 3E-000349): Unit-Tests des ZIP-Schreibers für den
// PowerPoint-Container (AK1): Aufbau nach der PKWARE-Beschreibung, Kennzeichen,
// Prüfsumme CRC-32, Rundweg jedes Eintrags, Store-Einträge, Zeitstempel,
// Fehler bei ungültiger Eingabe und Abbruch an den Grenzen ohne ZIP64.
//
// Geöffnet wird mit dem unabhängigen Leser zip-leser-helfer.js (Entpacken und
// Prüfsumme über node:zlib), die Kompression kommt wie im Hauptprozess aus
// `deflateRawSync`.
import { describe, it, expect, beforeAll } from 'vitest';
import { deflateRawSync, crc32 as zlibCrc32 } from 'node:zlib';
import { erstelleZip, crc32, MAX_EINTRAEGE } from '../../src/shared/presentation/zip-writer.js';
import { liesZip } from './zip-leser-helfer.js';

const ZEIT = new Date(2026, 9, 17, 14, 30, 22);
const OPT = { deflate: deflateRawSync, zeitpunkt: ZEIT };
const text = (b) => Buffer.from(b).toString('utf8');

/** Ein Uint8Array, das eine Länge vorgibt, ohne den Speicher zu belegen. */
function scheinbarGross(laenge) {
  const daten = new Uint8Array(1);
  Object.defineProperty(daten, 'length', { value: laenge });
  return daten;
}

function grundVon(aufruf) {
  try {
    aufruf();
  } catch (fehler) {
    return fehler.grund;
  }
  return 'kein Fehler';
}

describe('Prüfsumme CRC-32', () => {
  it('trifft die Prüfwerte des Standards', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(
      0x414fa339,
    );
  });

  it('stimmt über alle Byte-Werte mit zlib überein', () => {
    const alle = Uint8Array.from({ length: 4096 }, (_x, i) => (i * 31 + (i >> 3)) & 0xff);
    expect(crc32(alle)).toBe(zlibCrc32(alle));
  });
});

describe('Aufbau des Archivs (AK1)', () => {
  // Im beforeAll statt beim Einsammeln: Ein Fehler des Schreibers oder Lesers
  // fällt so den Prüffällen zu, statt die ganze Datei als Lade-Fehler zu kippen.
  let archiv;
  let eintraege;
  let abschluss;
  beforeAll(() => {
    archiv = erstelleZip(
      [
        { name: '[Content_Types].xml', daten: '<Types/>' },
        { name: 'ordner/Größe.txt', daten: 'Ä Ö Ü ß € — Text' },
        {
          name: 'bild.png',
          daten: Uint8Array.from([137, 80, 78, 71, 1, 2, 3]),
          komprimieren: false,
        },
      ],
      OPT,
    );
    ({ eintraege, abschluss } = liesZip(archiv));
  });

  it('beginnt mit einem lokalen Kopf und endet mit dem Abschluss-Datensatz', () => {
    const b = Buffer.from(archiv);
    expect(b.readUInt32LE(0)).toBe(0x04034b50);
    expect(b.readUInt32LE(abschluss.verzeichnisLage)).toBe(0x02014b50);
    expect(b.readUInt32LE(b.length - 22)).toBe(0x06054b50);
    expect(abschluss).toMatchObject({
      datentraeger: 0,
      verzeichnisDatentraeger: 0,
      anzahlHier: 3,
      anzahl: 3,
      kommentarLaenge: 0,
    });
  });

  it('setzt Version 2.0, Bit 11 (UTF-8) und nicht Bit 3 (Daten-Deskriptor)', () => {
    for (const e of eintraege) {
      expect(e.version).toBe(20);
      expect(e.erzeugtVon).toBe(20);
      expect(e.kennzeichen).toBe(0x0800);
      expect(e.kennzeichen & 0x0008).toBe(0);
      expect(e.lokal.zusatzLaenge).toBe(0);
    }
  });

  it('hält die Reihenfolge und trägt [Content_Types].xml als ersten Eintrag', () => {
    expect(eintraege.map((e) => e.name)).toEqual([
      '[Content_Types].xml',
      'ordner/Größe.txt',
      'bild.png',
    ]);
    expect(eintraege[0].lage).toBe(0);
  });

  it('gibt jeden Eintrag unverändert zurück, Text als UTF-8', () => {
    expect(text(eintraege[0].daten)).toBe('<Types/>');
    expect(text(eintraege[1].daten)).toBe('Ä Ö Ü ß € — Text');
    expect([...eintraege[2].daten]).toEqual([137, 80, 78, 71, 1, 2, 3]);
  });

  it('komprimiert mit Deflate und legt Store-Einträge wörtlich ab', () => {
    expect(eintraege.map((e) => e.methode)).toEqual([8, 8, 0]);
    const store = eintraege[2];
    expect(store.gepackt).toBe(store.roh);
    expect([...archiv.subarray(store.datenLage, store.datenLage + store.gepackt)]).toEqual([
      137, 80, 78, 71, 1, 2, 3,
    ]);
  });

  it('schreibt Datum und Uhrzeit im MS-DOS-Format aus der Ortszeit', () => {
    const zeit = (14 << 11) | (30 << 5) | 11;
    const datum = ((2026 - 1980) << 9) | (10 << 5) | 17;
    for (const e of eintraege) expect([e.zeit, e.datum]).toEqual([zeit, datum]);
    const alt = liesZip(
      erstelleZip([{ name: 'a', daten: 'x' }], { ...OPT, zeitpunkt: new Date(1970, 0, 1) }),
    );
    expect([alt.eintraege[0].zeit, alt.eintraege[0].datum]).toEqual([0, (1 << 5) | 1]);
  });

  it('erzeugt für gleiche Eingabe dieselben Bytes', () => {
    const eingabe = [{ name: 'a.xml', daten: '<a/>' }];
    expect(
      Buffer.from(erstelleZip(eingabe, OPT)).equals(Buffer.from(erstelleZip(eingabe, OPT))),
    ).toBe(true);
  });

  it('erzeugt aus einer leeren Liste ein leeres, gültiges Archiv', () => {
    const leer = erstelleZip([], OPT);
    expect(leer.length).toBe(22);
    expect(liesZip(leer).abschluss.anzahl).toBe(0);
  });
});

describe('Fehler bei ungültiger Eingabe', () => {
  const eins = [{ name: 'a', daten: 'x' }];

  it('verlangt deflate und einen gültigen Zeitpunkt', () => {
    expect(() => erstelleZip(eins, { zeitpunkt: ZEIT })).toThrow(/deflate fehlt/);
    expect(() => erstelleZip(eins)).toThrow(/deflate fehlt/);
    expect(() => erstelleZip(eins, { deflate: deflateRawSync })).toThrow(/zeitpunkt/);
    expect(() => erstelleZip(eins, { ...OPT, zeitpunkt: new Date('kaputt') })).toThrow(/zeitpunkt/);
  });

  it('weist Namen ab, die leer, absolut, mit Rückstrich oder doppelt sind', () => {
    expect(() => erstelleZip([{ name: '', daten: 'x' }], OPT)).toThrow(/ohne Namen/);
    expect(() => erstelleZip([{ name: '/a', daten: 'x' }], OPT)).toThrow(/relativer Pfad/);
    expect(() => erstelleZip([{ name: 'a\\b', daten: 'x' }], OPT)).toThrow(/relativer Pfad/);
    expect(() => erstelleZip([...eins, ...eins], OPT)).toThrow(/doppelt/);
  });

  it('weist Daten, Schalter und deflate-Ergebnis falscher Art ab', () => {
    expect(() => erstelleZip('a', OPT)).toThrow(/keine Liste/);
    expect(() => erstelleZip([null], OPT)).toThrow(/Eintrag 1 fehlt/);
    expect(() => erstelleZip([{ name: 'a', daten: 5 }], OPT)).toThrow(/weder Uint8Array/);
    expect(() => erstelleZip([{ name: 'a', daten: 'x', komprimieren: 1 }], OPT)).toThrow(
      /Wahrheitswert/,
    );
    expect(() => erstelleZip(eins, { ...OPT, deflate: () => 'x' })).toThrow(/kein Uint8Array/);
  });
});

describe('Grenzen des einfachen Formats ohne ZIP64 (AK1)', () => {
  it('nimmt 65 535 Einträge an und bricht bei 65 536 ab', () => {
    const viele = (n) =>
      Array.from({ length: n }, (_x, i) => ({ name: `d${i}`, daten: '', komprimieren: false }));
    expect(MAX_EINTRAEGE).toBe(65535);
    const archiv = erstelleZip(viele(65535), OPT);
    expect(Buffer.from(archiv).readUInt16LE(archiv.length - 12)).toBe(65535);
    expect(() => erstelleZip(viele(65536), OPT)).toThrow(/65536 Einträge/);
    expect(grundVon(() => erstelleZip(viele(65536), OPT))).toBe('eintraege');
  });

  it('bricht bei einem Eintrag über 4 GiB ab, roh wie gepackt', () => {
    const roh = [{ name: 'gross', daten: scheinbarGross(2 ** 32), komprimieren: false }];
    expect(() => erstelleZip(roh, OPT)).toThrow(/über 4 GiB/);
    expect(grundVon(() => erstelleZip(roh, OPT))).toBe('groesse');
    const gepackt = { ...OPT, deflate: () => scheinbarGross(2 ** 32) };
    expect(grundVon(() => erstelleZip([{ name: 'a', daten: 'x' }], gepackt))).toBe('groesse');
  });

  it('bricht ab, wenn erst die Summe der Einträge 4 GiB übersteigt', () => {
    const halb = { ...OPT, deflate: () => scheinbarGross(2 ** 31) };
    const zwei = [
      { name: 'a', daten: 'x' },
      { name: 'b', daten: 'y' },
    ];
    expect(() => erstelleZip(zwei, halb)).toThrow(/Archiv über 4 GiB/);
    expect(grundVon(() => erstelleZip(zwei, halb))).toBe('groesse');
  });
});
