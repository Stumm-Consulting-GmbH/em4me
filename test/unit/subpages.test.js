// 4T-0336 (Epic 3E-0061): Unit-Tests fuer die Unterseiten-Namens-Logik
// (src/shared/subpages.js) — Uebersetzung Slash-Form <-> U+2215-Form,
// Segmente, Eltern-Kette, Expansion relativer Ziele, Segment-Validierung.
import { describe, it, expect } from 'vitest';
import {
  basenameValidationError,
  SUBPAGE_SEP,
  toFileBasename,
  toLogicalName,
  isSubpageBasename,
  segmentsOf,
  parentBasename,
  lastSegment,
  parentChain,
  childPrefix,
  isRelativeTarget,
  expandRelativeTarget,
  segmentValidationError,
  displayTitleFromBasename,
  splitDisplayTitle,
} from '../../src/shared/subpages.js';

const SEP = SUBPAGE_SEP;

describe('subpages.js — Uebersetzung und Segmente', () => {
  it('Trennzeichen ist U+2215 Division Slash', () => {
    expect(SEP.codePointAt(0)).toBe(0x2215);
  });

  it('uebersetzt Slash-Form und U+2215-Form verlustfrei in beide Richtungen', () => {
    expect(toFileBasename('A/B/C')).toBe(`A${SEP}B${SEP}C`);
    expect(toLogicalName(`A${SEP}B${SEP}C`)).toBe('A/B/C');
    expect(toLogicalName(toFileBasename('Prozess-A/Entwurf'))).toBe('Prozess-A/Entwurf');
  });

  it('erkennt Unterseiten-Basenames und zerlegt Segmente', () => {
    expect(isSubpageBasename('Seite')).toBe(false);
    expect(isSubpageBasename(`A${SEP}B`)).toBe(true);
    expect(segmentsOf(`A${SEP}B${SEP}C`)).toEqual(['A', 'B', 'C']);
    expect(lastSegment(`A${SEP}B${SEP}C`)).toBe('C');
    expect(lastSegment('Solo')).toBe('Solo');
  });

  it('liefert Eltern-Basename, Eltern-Kette und Kind-Praefix', () => {
    expect(parentBasename(`A${SEP}B${SEP}C`)).toBe(`A${SEP}B`);
    expect(parentBasename('Top')).toBeNull();
    expect(parentChain(`A${SEP}B${SEP}C`)).toEqual(['A', `A${SEP}B`]);
    expect(parentChain('Top')).toEqual([]);
    expect(childPrefix('A')).toBe(`A${SEP}`);
  });
});

// 4T-0585 (Epic 3E-0108): Anzeige-Titel der Titelzeile — Markdown-Endung
// weg, Unterseiten in logischer Slash-Form.
describe('subpages.js — displayTitleFromBasename', () => {
  it('entfernt Markdown-Endungen unabhängig von der Schreibweise', () => {
    expect(displayTitleFromBasename('Notiz.md')).toBe('Notiz');
    expect(displayTitleFromBasename('Notiz.MD')).toBe('Notiz');
    expect(displayTitleFromBasename('Notiz.markdown')).toBe('Notiz');
    expect(displayTitleFromBasename('Notiz.mdown')).toBe('Notiz');
    expect(displayTitleFromBasename('Notiz.mkd')).toBe('Notiz');
  });

  it('lässt Namen ohne Markdown-Endung und innere Punkte unangetastet', () => {
    expect(displayTitleFromBasename('Notiz')).toBe('Notiz');
    expect(displayTitleFromBasename('Projekt 2.1 Plan.md')).toBe('Projekt 2.1 Plan');
    expect(displayTitleFromBasename('archiv.md.bak')).toBe('archiv.md.bak');
  });

  it('übersetzt Unterseiten in die logische Slash-Form', () => {
    expect(displayTitleFromBasename(`Eltern${SEP}Kind.md`)).toBe('Eltern/Kind');
    expect(displayTitleFromBasename(`A${SEP}B${SEP}C.md`)).toBe('A/B/C');
  });

  it('bleibt bei leeren Eingaben leer', () => {
    expect(displayTitleFromBasename('')).toBe('');
    expect(displayTitleFromBasename(null)).toBe('');
  });
});

// 4T-0646 (Epic 3E-0128): Zerlegung in unveraenderlichen Eltern-Anteil und
// editierbares Segment — gemeinsame Quelle fuer Titelzeile und Dialog.
describe('subpages.js — Anzeige-Zerlegung (splitDisplayTitle)', () => {
  it('liefert bei Top-Level-Seiten einen leeren Praefix', () => {
    expect(splitDisplayTitle('Seite.md')).toEqual({ prefix: '', segment: 'Seite' });
    expect(splitDisplayTitle('Seite')).toEqual({ prefix: '', segment: 'Seite' });
  });

  it('trennt bei einer Unterseite den Eltern-Anteil samt Schraegstrich ab', () => {
    expect(splitDisplayTitle(`Eltern${SEP}Kind.md`)).toEqual({
      prefix: 'Eltern/',
      segment: 'Kind',
    });
  });

  it('trennt auch auf tieferen Ebenen nur das letzte Segment ab', () => {
    expect(splitDisplayTitle(`A${SEP}B${SEP}C.md`)).toEqual({ prefix: 'A/B/', segment: 'C' });
  });

  it('setzt Praefix und Segment wieder zum Anzeige-Titel zusammen', () => {
    const parts = splitDisplayTitle(`A${SEP}B${SEP}C.md`);
    expect(parts.prefix + parts.segment).toBe(displayTitleFromBasename(`A${SEP}B${SEP}C.md`));
  });

  it('ergibt aus Praefix plus Segment wieder den Datei-Basename', () => {
    const parts = splitDisplayTitle(`A${SEP}B.md`);
    expect(toFileBasename(parts.prefix + 'Neu')).toBe(`A${SEP}Neu`);
  });

  it('bleibt bei leeren Eingaben leer', () => {
    expect(splitDisplayTitle('')).toEqual({ prefix: '', segment: '' });
    expect(splitDisplayTitle(null)).toEqual({ prefix: '', segment: '' });
  });
});

describe('subpages.js — relative Ziele', () => {
  it('erkennt relative Formen', () => {
    expect(isRelativeTarget('/Entwurf')).toBe(true);
    expect(isRelativeTarget('..')).toBe(true);
    expect(isRelativeTarget('../')).toBe(true);
    expect(isRelativeTarget('A/B')).toBe(false);
    expect(isRelativeTarget('Seite')).toBe(false);
  });

  it('expandiert /Name gegen den aktiven Basename (auch mehrstufig)', () => {
    expect(expandRelativeTarget('A', '/Entwurf')).toBe(`A${SEP}Entwurf`);
    expect(expandRelativeTarget(`A${SEP}B`, '/C')).toBe(`A${SEP}B${SEP}C`);
    expect(expandRelativeTarget('A', '/B/C')).toBe(`A${SEP}B${SEP}C`);
  });

  it('expandiert .. auf die Elternseite; Top-Level liefert null', () => {
    expect(expandRelativeTarget(`A${SEP}B`, '..')).toBe('A');
    expect(expandRelativeTarget(`A${SEP}B${SEP}C`, '../')).toBe(`A${SEP}B`);
    expect(expandRelativeTarget('Top', '..')).toBeNull();
  });

  it('liefert null fuer leere oder nicht-relative Eingaben', () => {
    expect(expandRelativeTarget('A', '/')).toBeNull();
    expect(expandRelativeTarget('', '/X')).toBeNull();
    expect(expandRelativeTarget('A', 'B')).toBeNull();
  });
});

describe('subpages.js — Segment-Validierung', () => {
  it('akzeptiert normale Namen inklusive Leerzeichen und Umlauten', () => {
    expect(segmentValidationError('Entwurf')).toBeNull();
    expect(segmentValidationError('Mein Entwurf')).toBeNull();
    expect(segmentValidationError('Überprüfung')).toBeNull();
  });

  // 4T-0339: Basename-Validierung (Umbenennen) erlaubt das Trennzeichen,
  // prueft aber jedes Segment einzeln.
  it('basenameValidationError erlaubt U+2215, prueft Segmente einzeln', () => {
    expect(basenameValidationError('Solo Neu')).toBeNull();
    expect(basenameValidationError(`A${SEP}Entwurf`)).toBeNull();
    expect(basenameValidationError('')).toBe('empty');
    expect(basenameValidationError('a/b')).toBe('separator');
    expect(basenameValidationError(`A${SEP} x`)).toBe('edge');
    expect(basenameValidationError('x:y')).toBe('forbidden');
  });

  it('lehnt Trennzeichen, verbotene Zeichen und Randlagen ab', () => {
    expect(segmentValidationError('')).toBe('empty');
    expect(segmentValidationError('   ')).toBe('empty');
    expect(segmentValidationError('a/b')).toBe('separator');
    expect(segmentValidationError('a\\b')).toBe('separator');
    expect(segmentValidationError(`a${SEP}b`)).toBe('separator');
    expect(segmentValidationError('x:y')).toBe('forbidden');
    expect(segmentValidationError('x?y')).toBe('forbidden');
    expect(segmentValidationError(' x')).toBe('edge');
    expect(segmentValidationError('x.')).toBe('edge');
  });
});
