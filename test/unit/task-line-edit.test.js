// 4T-0504 (Epic 3E-0096): Unit-Tests des prozessneutralen Zeilen-Ersetzungs-
// Kerns (src/main/task-line-edit.js). Geprueft werden Konflikt-Erkennung
// (exakte Zeile, verrutschte eindeutige Zeile, fehlend, mehrdeutig),
// Format-Treue (EOL-Stil pro Zeile, BOM der ersten Zeile) sowie die
// Einfuege-Semantik (above/below, letzte Zeile ohne Umbruch, newText null).
import { describe, it, expect } from 'vitest';
import { computeLineReplacement, sliceLines } from '../../src/main/task-line-edit.js';

// --- 1. Exakte Ziel-Zeile ----------------------------------------------------------
describe('computeLineReplacement — exakte Ziel-Zeile', () => {
  it('ersetzt die Zeile an der erwarteten Zeilennummer', () => {
    const raw = 'a\n- [ ] Task\nb';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res.ok).toBe(true);
    expect(res.line).toBe(2);
    expect(res.newContent).toBe('a\n- [x] Task\nb');
  });
});

// --- 2. Verrutschte, aber eindeutige Zeile -----------------------------------------
describe('computeLineReplacement — verrutschte eindeutige Zeile', () => {
  it('findet die eindeutige Zeile trotz falscher Zeilennummer und meldet die reale Zeile', () => {
    const raw = 'a\n- [ ] Task\nb';
    // Erwartete Zeile 1 traegt 'a', der erwartete Text steht real auf Zeile 2.
    const res = computeLineReplacement(raw, {
      line: 1,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res.ok).toBe(true);
    expect(res.line).toBe(2);
    expect(res.newContent).toBe('a\n- [x] Task\nb');
  });

  it('findet die Zeile auch bei out-of-range Zeilennummer', () => {
    const raw = 'a\n- [ ] Task\nb';
    const res = computeLineReplacement(raw, {
      line: 99,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res.ok).toBe(true);
    expect(res.line).toBe(2);
  });
});

// --- 3. Kein Treffer -> missing ----------------------------------------------------
describe('computeLineReplacement — fehlende Zeile', () => {
  it('meldet reason missing, wenn der erwartete Text nirgends steht', () => {
    const raw = 'a\nb\nc';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Nichts',
      newText: '- [x] Nichts',
    });
    expect(res).toEqual({ ok: false, reason: 'missing' });
  });
});

// --- 4. Mehrdeutigkeit -------------------------------------------------------------
describe('computeLineReplacement — identische Duplikat-Zeilen', () => {
  const raw = '- [ ] Dup\nx\n- [ ] Dup';

  it('meldet reason ambiguous bei falscher Zeilennummer und zwei identischen Zeilen', () => {
    // Zeile 2 traegt 'x' -> Suche findet zwei Vorkommen -> mehrdeutig.
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Dup',
      newText: '- [x] Dup',
    });
    expect(res).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('trifft trotz Duplikat exakt, wenn die Zeilennummer stimmt', () => {
    const res = computeLineReplacement(raw, {
      line: 1,
      expectedText: '- [ ] Dup',
      newText: '- [x] Dup',
    });
    expect(res.ok).toBe(true);
    expect(res.line).toBe(1);
    // Nur das erste Vorkommen wird ersetzt.
    expect(res.newContent).toBe('- [x] Dup\nx\n- [ ] Dup');
  });
});

// --- 5. EOL-Treue ------------------------------------------------------------------
describe('computeLineReplacement — EOL-Stil', () => {
  it('erhaelt CRLF in einer CRLF-Datei', () => {
    const raw = 'a\r\n- [ ] Task\r\nb\r\n';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\r\n- [x] Task\r\nb\r\n');
    // Keine LF-Normalisierung: jeder Umbruch bleibt CRLF.
    expect(res.newContent).not.toMatch(/[^\r]\n/);
  });
});

// --- 6. BOM-Treue ------------------------------------------------------------------
describe('computeLineReplacement — BOM der ersten Zeile', () => {
  it('vergleicht BOM-frei und erhaelt das BOM im Ergebnis (Ersetzung von Zeile 1)', () => {
    const raw = '﻿- [ ] Task\nb';
    const res = computeLineReplacement(raw, {
      line: 1,
      expectedText: '- [ ] Task', // ohne BOM
      newText: '- [x] Task',
    });
    expect(res.ok).toBe(true);
    expect(res.line).toBe(1);
    expect(res.newContent).toBe('﻿- [x] Task\nb');
    expect(res.newContent.startsWith('﻿')).toBe(true);
  });
});

// --- 7. Einfuegen relativ zur Ziel-Zeile -------------------------------------------
describe('computeLineReplacement — insert above/below', () => {
  it('fuegt below unterhalb der Ziel-Zeile ein (EOL der Ziel-Zeile)', () => {
    const raw = 'a\n- [ ] Task\nb';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
      insert: { text: '- [ ] Task', where: 'below' },
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\n- [x] Task\n- [ ] Task\nb');
  });

  it('fuegt above oberhalb der Ziel-Zeile ein', () => {
    const raw = 'a\n- [ ] Task\nb';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
      insert: { text: '- [ ] Neu', where: 'above' },
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\n- [ ] Neu\n- [x] Task\nb');
  });

  it('uebernimmt den CRLF-Stil der Ziel-Zeile fuer die Einfuege-Zeile', () => {
    const raw = 'a\r\n- [ ] Task\r\nb\r\n';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
      insert: { text: '- [ ] Task', where: 'below' },
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\r\n- [x] Task\r\n- [ ] Task\r\nb\r\n');
  });
});

// --- 8. Einfuegen an der letzten Zeile ohne Umbruch --------------------------------
describe('computeLineReplacement — letzte Zeile ohne End-Umbruch', () => {
  it('ergaenzt fuer below den dominanten Umbruch (LF)', () => {
    const raw = 'a\n- [ ] Task';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
      insert: { text: '- [ ] Task', where: 'below' },
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\n- [x] Task\n- [ ] Task');
  });

  it('ergaenzt fuer below den dominanten Umbruch (CRLF)', () => {
    const raw = 'a\r\n- [ ] Task';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
      insert: { text: '- [ ] Task', where: 'below' },
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\r\n- [x] Task\r\n- [ ] Task');
  });
});

// --- 9. newText null (nur Einfuegen) -----------------------------------------------
describe('computeLineReplacement — newText null', () => {
  it('laesst die Ziel-Zeile stehen und fuegt nur die Einfuege-Zeile hinzu', () => {
    const raw = 'a\n- [ ] Task\nb';
    const res = computeLineReplacement(raw, {
      line: 2,
      expectedText: '- [ ] Task',
      newText: null,
      insert: { text: '- [ ] Task', where: 'below' },
    });
    expect(res.ok).toBe(true);
    expect(res.newContent).toBe('a\n- [ ] Task\n- [ ] Task\nb');
  });
});

// --- 10. Leere Datei / Zeile 0 -----------------------------------------------------
describe('computeLineReplacement — Grenzfaelle leere Datei / Zeile 0', () => {
  it('leere Datei meldet missing', () => {
    const res = computeLineReplacement('', {
      line: 1,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res).toEqual({ ok: false, reason: 'missing' });
  });

  it('Zeile 0 faellt auf die Suche zurueck und meldet missing ohne Treffer', () => {
    const res = computeLineReplacement('a\nb', {
      line: 0,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res).toEqual({ ok: false, reason: 'missing' });
  });

  it('Zeile 0 findet eine eindeutige Zeile ueber die Suche', () => {
    const res = computeLineReplacement('a\n- [ ] Task\nb', {
      line: 0,
      expectedText: '- [ ] Task',
      newText: '- [x] Task',
    });
    expect(res.ok).toBe(true);
    expect(res.line).toBe(2);
  });
});

// --- 11. sliceLines Basis ----------------------------------------------------------
describe('sliceLines', () => {
  it('zerlegt LF-Text mit EOL-Erhalt und leerer letzter Zeile ohne Umbruch', () => {
    expect(sliceLines('a\nb')).toEqual([
      { start: 0, end: 1, text: 'a', eol: '\n' },
      { start: 2, end: 3, text: 'b', eol: '' },
    ]);
  });

  it('erkennt CRLF als Umbruch der Zeile', () => {
    const lines = sliceLines('a\r\nb');
    expect(lines[0]).toEqual({ start: 0, end: 1, text: 'a', eol: '\r\n' });
    expect(lines[1].text).toBe('b');
    expect(lines[1].eol).toBe('');
  });

  it('leerer Text ergibt genau eine leere Zeile ohne Umbruch', () => {
    expect(sliceLines('')).toEqual([{ start: 0, end: 0, text: '', eol: '' }]);
  });

  it('abschliessender Umbruch erzeugt eine leere letzte Zeile', () => {
    const lines = sliceLines('a\n');
    expect(lines.length).toBe(2);
    expect(lines[0].text).toBe('a');
    expect(lines[1].text).toBe('');
  });
});
