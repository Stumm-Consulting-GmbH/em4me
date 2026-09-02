// 4T-1289 (Epic 3E-0224): Unit-Tests für die Namensform und die
// Zuordnungs-Zeile der Teile großer Dokumente (src/shared/document-parts.js).
// Abgedeckt sind AK1 (Zerlegen und Bilden), AK2 (Zuordnungs-Zeile lesen und
// schreiben samt Schema-Version), AK3 (Trennschärfe zu den Unterseiten ohne
// Frontmatter-Zugriff), AK4 (Trennzeichen ohne gültige Nummer) und die
// Normalisierungs-Formen aus AK5.
import { describe, it, expect } from 'vitest';
import {
  PART_SEP,
  PART_INFIX,
  PART_DIGITS,
  PART_FRONTMATTER_KEY,
  PART_SCHEMA_VERSION,
  FIRST_PART_INDEX,
  FIRST_SUFFIXED_PART_INDEX,
  isPartBasename,
  parsePartBasename,
  buildPartBasename,
  baseBasenameOf,
  partPrefix,
  formatPartValue,
  parsePartValue,
  readPartLine,
  writePartLine,
} from '../../src/shared/document-parts.js';
import { SUBPAGE_SEP, isSubpageBasename } from '../../src/shared/subpages.js';

const SEP = PART_SEP;

describe('document-parts.js — Namensform (AK1)', () => {
  it('Trennzeichen ist U+2022 Bullet und damit ein anderes als das der Unterseiten', () => {
    expect(SEP.codePointAt(0)).toBe(0x2022);
    expect(SUBPAGE_SEP.codePointAt(0)).toBe(0x2215);
    expect(SEP).not.toBe(SUBPAGE_SEP);
  });

  it('zerlegt einen Teil-Namen in Grundname und Position', () => {
    expect(parsePartBasename(`Notizen${SEP}${PART_INFIX}00002`)).toEqual({
      base: 'Notizen',
      index: 2,
    });
    expect(parsePartBasename(`Notizen${SEP}${PART_INFIX}00017`)).toEqual({
      base: 'Notizen',
      index: 17,
    });
    expect(parsePartBasename(`Notizen${SEP}${PART_INFIX}99999`)).toEqual({
      base: 'Notizen',
      index: 99999,
    });
  });

  it('bildet den Namen eines Folgeteils mit fünfstelliger Nummer', () => {
    expect(buildPartBasename('Notizen', 2)).toBe(`Notizen${SEP}${PART_INFIX}00002`);
    expect(buildPartBasename('Notizen', 99999)).toBe(`Notizen${SEP}${PART_INFIX}99999`);
    expect(PART_DIGITS).toBe(5);
  });

  it('bildet und zerlegt verlustfrei in beide Richtungen', () => {
    for (const index of [2, 3, 42, 1234, 99999]) {
      const name = buildPartBasename('Grosses Dokument', index);
      expect(parsePartBasename(name)).toEqual({ base: 'Grosses Dokument', index });
    }
  });

  it('lehnt beim Bilden ab, was kein Folgeteil sein kann', () => {
    expect(buildPartBasename('', 2)).toBeNull();
    expect(buildPartBasename('Notizen', FIRST_PART_INDEX)).toBeNull();
    expect(buildPartBasename('Notizen', 0)).toBeNull();
    expect(buildPartBasename('Notizen', -1)).toBeNull();
    expect(buildPartBasename('Notizen', 2.5)).toBeNull();
    expect(buildPartBasename('Notizen', 100000)).toBeNull();
  });

  it('führt jeden Basename auf den Namen der Kopf-Datei zurück', () => {
    expect(baseBasenameOf(`Notizen${SEP}${PART_INFIX}00007`)).toBe('Notizen');
    expect(baseBasenameOf('Notizen')).toBe('Notizen');
    expect(partPrefix('Notizen')).toBe(`Notizen${SEP}${PART_INFIX}`);
  });
});

describe('document-parts.js — Trennschärfe zu den Unterseiten (AK3)', () => {
  it('erkennt einen Unterseiten-Namen nicht als Teil', () => {
    expect(isPartBasename(`Prozess-A${SUBPAGE_SEP}Entwurf`)).toBe(false);
    expect(isPartBasename(`A${SUBPAGE_SEP}B${SUBPAGE_SEP}C`)).toBe(false);
    expect(parsePartBasename(`Prozess-A${SUBPAGE_SEP}Entwurf`)).toBeNull();
  });

  it('erkennt einen Teil-Namen nicht als Unterseite', () => {
    expect(isSubpageBasename(`Notizen${SEP}${PART_INFIX}00002`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}00002`)).toBe(true);
  });

  it('unterscheidet ohne Zugriff auf den Frontmatter — beide Prüfungen sehen nur den Namen', () => {
    // Der Test ist die Probe aufs Exempel: Es gibt keinen Datei-Inhalt, und
    // beide Prüfungen liefern trotzdem ein Ergebnis. Genau dieser Verzicht
    // auf das Lesen des Frontmatters ist der Grund für ein eigenes Zeichen.
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}00002`)).toBe(true);
    expect(isSubpageBasename(`Prozess-A${SUBPAGE_SEP}Entwurf`)).toBe(true);
  });

  it('behandelt eine geteilte Unterseite als beides zugleich', () => {
    // Eine Unterseite, die selbst geteilt ist, trägt beide Zeichen. Die
    // Zeichen sind verschieden, also bleiben beide Aussagen richtig und der
    // Grundname behält seine Unterseiten-Form.
    const name = `Prozess-A${SUBPAGE_SEP}Entwurf${SEP}${PART_INFIX}00003`;
    expect(isSubpageBasename(name)).toBe(true);
    expect(parsePartBasename(name)).toEqual({
      base: `Prozess-A${SUBPAGE_SEP}Entwurf`,
      index: 3,
    });
  });
});

describe('document-parts.js — Trennzeichen ohne gültige Nummer (AK4)', () => {
  it('gilt als gewöhnlicher Name, wenn der Infix fehlt', () => {
    expect(isPartBasename(`Notizen${SEP}Kapitel`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}00002`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}`)).toBe(false);
  });

  it('gilt als gewöhnlicher Name bei abweichender Stellenzahl oder Nicht-Ziffern', () => {
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}2`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}0002`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}000002`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}0000x`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}00002x`)).toBe(false);
  });

  it('gilt als gewöhnlicher Name bei leerem Grundnamen', () => {
    expect(isPartBasename(`${SEP}${PART_INFIX}00002`)).toBe(false);
  });

  it('gilt als gewöhnlicher Name bei den Positionen 0 und 1', () => {
    // Die Kopf-Datei behält ihren Namen unverändert und ist Teil 1; eine
    // Datei mit dem Suffix «00001» kann deshalb kein gültiger Teil sein.
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}00000`)).toBe(false);
    expect(isPartBasename(`Notizen${SEP}${PART_INFIX}00001`)).toBe(false);
    expect(FIRST_SUFFIXED_PART_INDEX).toBe(2);
  });

  it('gilt als gewöhnlicher Name ohne Trennzeichen und bei leerer Eingabe', () => {
    expect(isPartBasename('Notizen')).toBe(false);
    expect(isPartBasename('')).toBe(false);
    expect(isPartBasename(null)).toBe(false);
    expect(isPartBasename(undefined)).toBe(false);
  });

  it('nimmt beim Zerlegen das letzte Trennzeichen', () => {
    // Ein Grundname darf das Zeichen selbst enthalten; maßgeblich ist das
    // letzte Vorkommen, weil der Suffix am Ende steht.
    expect(parsePartBasename(`Liste ${SEP} Punkte${SEP}${PART_INFIX}00004`)).toEqual({
      base: `Liste ${SEP} Punkte`,
      index: 4,
    });
  });
});

describe('document-parts.js — Normalisierungs-Formen (AK5)', () => {
  it('erkennt einen Grundnamen in zerlegter Form und liefert ihn zusammengesetzt zurück', () => {
    const nfd = 'Größe'.normalize('NFD');
    const nfc = 'Größe'.normalize('NFC');
    expect(nfd).not.toBe(nfc);
    const name = `${nfd}${SEP}${PART_INFIX}00002`;
    expect(isPartBasename(name)).toBe(true);
    expect(parsePartBasename(name)).toEqual({ base: nfc, index: 2 });
  });

  it('bildet aus beiden Formen denselben Namen', () => {
    const ausNfd = buildPartBasename('Größe'.normalize('NFD'), 2);
    const ausNfc = buildPartBasename('Größe'.normalize('NFC'), 2);
    expect(ausNfd).toBe(ausNfc);
  });

  it('führt beide Formen auf denselben Grundnamen und dasselbe Präfix', () => {
    expect(baseBasenameOf(`Größe`.normalize('NFD'))).toBe('Größe'.normalize('NFC'));
    expect(partPrefix('Größe'.normalize('NFD'))).toBe(partPrefix('Größe'.normalize('NFC')));
  });
});

describe('document-parts.js — Zuordnungs-Zeile (AK2)', () => {
  it('formt und zerlegt den Wert verlustfrei samt Schema-Version', () => {
    const wert = formatPartValue(2, 'Notizen');
    expect(wert).toBe(`v${PART_SCHEMA_VERSION}|2|Notizen`);
    expect(parsePartValue(wert)).toEqual({
      schemaVersion: PART_SCHEMA_VERSION,
      index: 2,
      base: 'Notizen',
    });
  });

  it('erlaubt im Grundnamen jedes Zeichen, auch den Feld-Trenner', () => {
    // Der Grundname ist das letzte Feld; beim Lesen wird nur zweimal
    // getrennt. Das Format braucht deshalb keine eigene Maskierung.
    const wert = formatPartValue(3, 'A|B|C');
    expect(parsePartValue(wert)).toEqual({
      schemaVersion: PART_SCHEMA_VERSION,
      index: 3,
      base: 'A|B|C',
    });
  });

  it('liefert eine unbekannte Schema-Version mit, statt die Zeile zu verwerfen', () => {
    expect(parsePartValue('v99|4|Notizen')).toEqual({
      schemaVersion: 99,
      index: 4,
      base: 'Notizen',
    });
  });

  it('verwirft einen unlesbaren Wert', () => {
    expect(parsePartValue('Notizen')).toBeNull();
    expect(parsePartValue('v1|Notizen')).toBeNull();
    expect(parsePartValue('1|2|Notizen')).toBeNull();
    expect(parsePartValue('vx|2|Notizen')).toBeNull();
    expect(parsePartValue('v1|zwei|Notizen')).toBeNull();
    expect(parsePartValue('v1|0|Notizen')).toBeNull();
    expect(parsePartValue('v1|2|')).toBeNull();
    expect(parsePartValue(42)).toBeNull();
    expect(parsePartValue(null)).toBeNull();
  });

  it('schreibt die Zeile in eine Datei ohne Frontmatter und liest sie zurück', () => {
    const quelle = '# Überschrift\n\nText.\n';
    const geschrieben = writePartLine(quelle, { index: 2, base: 'Notizen' });
    expect(geschrieben.ok).toBe(true);
    expect(geschrieben.text).toContain(
      `${PART_FRONTMATTER_KEY}: v${PART_SCHEMA_VERSION}|2|Notizen`,
    );
    expect(geschrieben.text).toContain('# Überschrift');
    expect(readPartLine(geschrieben.text)).toEqual({
      schemaVersion: PART_SCHEMA_VERSION,
      index: 2,
      base: 'Notizen',
    });
  });

  it('schreibt die Zeile als genau eine Zeile', () => {
    const geschrieben = writePartLine('Text.\n', { index: 2, base: 'Notizen' });
    const zeilen = geschrieben.text.split('\n').filter((z) => z.includes(PART_FRONTMATTER_KEY));
    expect(zeilen).toHaveLength(1);
  });

  it('lässt die übrigen Frontmatter-Felder unangetastet', () => {
    const quelle = '---\ntitle: Notizen\ntags:\n  - a\n  - b\n---\n\nText.\n';
    const geschrieben = writePartLine(quelle, { index: 3, base: 'Notizen' });
    expect(geschrieben.ok).toBe(true);
    expect(geschrieben.text).toContain('title: Notizen');
    expect(geschrieben.text).toContain('- a');
    expect(geschrieben.text).toContain('- b');
    expect(readPartLine(geschrieben.text).index).toBe(3);
  });

  it('trägt die Kopf-Datei mit Position 1 ein', () => {
    // Jede Teil-Datei trägt die Zeile, auch die Kopf-Datei; ihr Name bleibt
    // dabei unverändert, nur die Position ist 1.
    const geschrieben = writePartLine('Text.\n', { index: FIRST_PART_INDEX, base: 'Notizen' });
    expect(geschrieben.ok).toBe(true);
    expect(readPartLine(geschrieben.text).index).toBe(1);
  });

  it('entfernt die Zeile bei null und lässt den übrigen Frontmatter stehen', () => {
    const mitZeile = writePartLine('---\ntitle: Notizen\n---\n\nText.\n', {
      index: 2,
      base: 'Notizen',
    });
    const ohneZeile = writePartLine(mitZeile.text, null);
    expect(ohneZeile.ok).toBe(true);
    expect(ohneZeile.text).not.toContain(PART_FRONTMATTER_KEY);
    expect(ohneZeile.text).toContain('title: Notizen');
    expect(readPartLine(ohneZeile.text)).toBeNull();
  });

  it('weist eine ungültige Zuordnung beim Schreiben ab', () => {
    expect(writePartLine('Text.\n', { index: 0, base: 'Notizen' }).ok).toBe(false);
    expect(writePartLine('Text.\n', { index: 2.5, base: 'Notizen' }).ok).toBe(false);
    expect(writePartLine('Text.\n', { index: 2, base: '' }).ok).toBe(false);
  });

  it('liefert null, wenn die Datei keine Zeile oder keinen Frontmatter trägt', () => {
    expect(readPartLine('# Überschrift\n\nText.\n')).toBeNull();
    expect(readPartLine('---\ntitle: Notizen\n---\n\nText.\n')).toBeNull();
    expect(readPartLine('')).toBeNull();
    expect(readPartLine(null)).toBeNull();
  });

  it('liefert null bei defektem Frontmatter, statt zu werfen', () => {
    expect(readPartLine('---\ntitle: [unvollstaendig\n---\n\nText.\n')).toBeNull();
  });

  it('erhält ein Byte-Order-Mark über Lesen und Schreiben hinweg', () => {
    const quelle = '﻿---\ntitle: Notizen\n---\n\nText.\n';
    const geschrieben = writePartLine(quelle, { index: 2, base: 'Notizen' });
    expect(geschrieben.ok).toBe(true);
    expect(geschrieben.text.startsWith('﻿')).toBe(true);
    expect(geschrieben.text).toContain('title: Notizen');
    expect(readPartLine(geschrieben.text)).toEqual({
      schemaVersion: PART_SCHEMA_VERSION,
      index: 2,
      base: 'Notizen',
    });
  });

  it('erhält die Zeilenenden-Konvention der Quelle', () => {
    const geschrieben = writePartLine('---\r\ntitle: Notizen\r\n---\r\n\r\nText.\r\n', {
      index: 2,
      base: 'Notizen',
    });
    expect(geschrieben.ok).toBe(true);
    expect(geschrieben.text).toContain('\r\n');
    expect(readPartLine(geschrieben.text).index).toBe(2);
  });

  it('schreibt den Grundnamen in zusammengesetzter Form', () => {
    const geschrieben = writePartLine('Text.\n', {
      index: 2,
      base: 'Größe'.normalize('NFD'),
    });
    expect(readPartLine(geschrieben.text).base).toBe('Größe'.normalize('NFC'));
  });
});
