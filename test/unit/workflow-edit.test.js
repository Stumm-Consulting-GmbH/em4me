// 4T-002348 (Epic 3E-000184): Die fünf Inhalts- und Dateikopf-Bearbeitungen an
// einem Text (`applyContentEdit`), die eine Regel für Datei und Puffer.
//
// Bestands-Lesungen: Die Überschriften-Suche folgt `headingSections`
// (src/shared/markdown/heading-sections.js), der Dateikopf wird über
// `writeFrontmatter` (src/shared/markdown/frontmatter.js) geschrieben. Die
// Randfälle E3 (replace ohne Vorkommen schlägt fehl, remove-property ohne
// Eigenschaft gelingt ohne Änderung) und E5 (insert under direkt unter der
// Überschrift) sind Entscheidungen des Product Owners vom 2026-10-23.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyContentEdit } = require('../../src/shared/workflows/workflow-edit.js');

const BOM = String.fromCharCode(0xfeff);

const append = (text) => ({ op: 'append', text });
const under = (heading, text) => ({ op: 'insert', position: { kind: 'under', heading }, text });
const atStart = (text) => ({ op: 'insert', position: { kind: 'atStart' }, text });

describe('append', () => {
  it('hängt an ein Dateiende mit Zeilenumbruch an und endet selbst mit einem', () => {
    expect(applyContentEdit('# A\n', append('neu'))).toEqual({
      ok: true,
      text: '# A\nneu\n',
      changed: true,
    });
  });

  it('stellt einen Zeilenumbruch voran, wenn er am Dateiende fehlt', () => {
    expect(applyContentEdit('# A', append('neu\n')).text).toBe('# A\nneu\n');
  });

  it('eine CRLF-Datei bleibt CRLF, auch im eingefügten Text', () => {
    expect(applyContentEdit('a\r\nb\r\n', append('x\ny')).text).toBe('a\r\nb\r\nx\r\ny\r\n');
  });

  it('ein Byte-Order-Zeichen bleibt am Anfang', () => {
    expect(applyContentEdit(`${BOM}# A\n`, append('x')).text).toBe(`${BOM}# A\nx\n`);
  });

  it('ein leerer Inhalt ändert nichts', () => {
    expect(applyContentEdit('# A\n', append(''))).toEqual({
      ok: true,
      text: '# A\n',
      changed: false,
    });
  });
});

describe('insert … at-start', () => {
  it('setzt nach dem Dateikopf ein, nicht davor', () => {
    expect(applyContentEdit('---\na: 1\n---\n# T\n', atStart('Neu')).text).toBe(
      '---\na: 1\n---\nNeu\n# T\n',
    );
  });

  it('ohne Dateikopf an Zeile 1', () => {
    expect(applyContentEdit('# T\n', atStart('Neu')).text).toBe('Neu\n# T\n');
  });

  it('Byte-Order-Zeichen und Dateikopf zusammen', () => {
    expect(applyContentEdit(`${BOM}---\na: 1\n---\nRest`, atStart('X')).text).toBe(
      `${BOM}---\na: 1\n---\nX\nRest`,
    );
  });
});

describe('insert … under (E5: direkt unter der Überschrift)', () => {
  const text = '# Titel\n\n## Protokoll\nalt\n\n## Ende\n';

  it('fügt direkt unter der Überschrift vor dem bisherigen Inhalt ein', () => {
    expect(applyContentEdit(text, under('Protokoll', '- neu')).text).toBe(
      '# Titel\n\n## Protokoll\n- neu\nalt\n\n## Ende\n',
    );
  });

  it('findet die Überschrift über ihre Kennung wie from-section', () => {
    expect(applyContentEdit(text, under('protokoll', 'x')).ok).toBe(true);
  });

  it('unbekannte Überschrift: headingUnknown', () => {
    expect(applyContentEdit(text, under('Fehlt', 'x'))).toEqual({
      ok: false,
      code: 'headingUnknown',
    });
  });

  it('doppelte Überschrift: headingAmbiguous', () => {
    expect(applyContentEdit('## A\n## A\n', under('A', 'x'))).toEqual({
      ok: false,
      code: 'headingAmbiguous',
    });
  });

  it('eine Überschrift im Code-Block zählt nicht', () => {
    const mitCode = '```\n## Protokoll\n```\n## Protokoll\nalt\n';
    expect(applyContentEdit(mitCode, under('Protokoll', 'x')).text).toBe(
      '```\n## Protokoll\n```\n## Protokoll\nx\nalt\n',
    );
  });

  it('die letzte Überschrift der Datei ohne Zeilenumbruch', () => {
    expect(applyContentEdit('# A\n## Ende', under('Ende', 'x')).text).toBe('# A\n## Ende\nx\n');
  });

  it('eine Zeile im Dateikopf zählt nicht als Überschrift', () => {
    expect(applyContentEdit('---\na: 1\n---\n# a\n', under('a', 'x')).text).toBe(
      '---\na: 1\n---\n# a\nx\n',
    );
  });

  it('CRLF bleibt erhalten', () => {
    expect(applyContentEdit('# A\r\nalt\r\n', under('A', 'x')).text).toBe('# A\r\nx\r\nalt\r\n');
  });
});

describe('replace (jedes Vorkommen, E3)', () => {
  it('ersetzt jedes von drei Vorkommen (AK3 der Story 4S-001103)', () => {
    expect(
      applyContentEdit('P und P und P', { op: 'replace', search: 'P', replacement: 'Q' }),
    ).toEqual({ ok: true, text: 'Q und Q und Q', changed: true });
  });

  it('ohne Vorkommen: textNotFound', () => {
    expect(applyContentEdit('abc', { op: 'replace', search: 'x', replacement: 'y' })).toEqual({
      ok: false,
      code: 'textNotFound',
    });
  });

  it('beachtet Groß- und Kleinschreibung und liest keinen regulären Ausdruck', () => {
    expect(
      applyContentEdit('a.b A.B', { op: 'replace', search: 'a.b', replacement: '-' }).text,
    ).toBe('- A.B');
  });

  it('trifft auch im Dateikopf', () => {
    expect(
      applyContentEdit('---\nt: PROJEKT\n---\nPROJEKT\n', {
        op: 'replace',
        search: 'PROJEKT',
        replacement: 'Neu',
      }).text,
    ).toBe('---\nt: Neu\n---\nNeu\n');
  });
});

describe('setProperty und removeProperty', () => {
  const kopf = '---\n# Kommentar\nzeta: 1\nAlpha: "x"\ntags:\n  - a\n  - b\n---\nText\n';

  it('setzt eine neue Eigenschaft; Reihenfolge und Schreibweise der übrigen bleiben', () => {
    const neu = applyContentEdit(kopf, { op: 'setProperty', key: 'status', value: 'offen' }).text;
    expect(neu).toBe(
      '---\n# Kommentar\nzeta: 1\nAlpha: "x"\ntags:\n  - a\n  - b\nstatus: offen\n---\nText\n',
    );
  });

  it('ändert eine vorhandene Eigenschaft an ihrer Stelle', () => {
    const neu = applyContentEdit(kopf, { op: 'setProperty', key: 'zeta', value: 2 }).text;
    expect(neu).toBe('---\n# Kommentar\nzeta: 2\nAlpha: "x"\ntags:\n  - a\n  - b\n---\nText\n');
  });

  it('ein gleicher Wert ändert nichts', () => {
    expect(applyContentEdit(kopf, { op: 'setProperty', key: 'zeta', value: 1 }).changed).toBe(
      false,
    );
  });

  it('eine Zahl bleibt eine Zahl', () => {
    expect(applyContentEdit('# T\n', { op: 'setProperty', key: 'n', value: 3 }).text).toBe(
      '---\nn: 3\n---\n# T\n',
    );
  });

  it('ohne Dateikopf entsteht einer', () => {
    expect(applyContentEdit('Text\n', { op: 'setProperty', key: 'a', value: 'b' }).text).toBe(
      '---\na: b\n---\nText\n',
    );
  });

  it('entfernt eine vorhandene Eigenschaft', () => {
    expect(applyContentEdit(kopf, { op: 'removeProperty', key: 'Alpha' }).text).toBe(
      '---\n# Kommentar\nzeta: 1\ntags:\n  - a\n  - b\n---\nText\n',
    );
  });

  it('eine fehlende Eigenschaft zu entfernen gelingt ohne Änderung (E3)', () => {
    expect(applyContentEdit(kopf, { op: 'removeProperty', key: 'fehlt' })).toEqual({
      ok: true,
      text: kopf,
      changed: false,
    });
  });

  it('mit der letzten Eigenschaft entfällt der Dateikopf', () => {
    expect(
      applyContentEdit('---\na: 1\n---\nText\n', { op: 'removeProperty', key: 'a' }).text,
    ).toBe('Text\n');
  });

  it('ein defekter Dateikopf: frontmatterInvalid, für beide Befehle', () => {
    const defekt = '---\na: [\n---\nText\n';
    expect(applyContentEdit(defekt, { op: 'setProperty', key: 'a', value: 1 }).code).toBe(
      'frontmatterInvalid',
    );
    expect(applyContentEdit(defekt, { op: 'removeProperty', key: 'a' }).code).toBe(
      'frontmatterInvalid',
    );
  });
});

describe('ungültige Bearbeitung', () => {
  it('unbekannte Art und fehlende Position: invalidStep', () => {
    expect(applyContentEdit('x', { op: 'delete' }).code).toBe('invalidStep');
    expect(applyContentEdit('x', { op: 'insert', text: 'y' }).code).toBe('invalidStep');
    expect(applyContentEdit('x', null).code).toBe('invalidStep');
  });
});
