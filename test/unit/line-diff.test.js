// 4T-000331 (Epic 3E-000060): Unit-Tests für den zeilenbasierten Diff der
// Dokument-Historie (src/shared/line-diff.js). Kern-Eigenschaft ist der
// Roundtrip: applyOps(base, diffLines(base, neu)) === neu — darauf steht
// die gesamte Delta-Rekonstruktion der .mdd-Historie.
import { describe, it, expect } from 'vitest';
import {
  diffLines,
  applyOps,
  countChanges,
  splitLines,
  buildDiffRows,
} from '../../src/shared/line-diff.js';

// Deterministischer Pseudo-Zufall für den Property-Test (kein Math.random,
// damit Fehlschläge reproduzierbar sind).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('diffLines/applyOps Roundtrip (4T-000331)', () => {
  const cases = [
    ['', ''],
    ['', 'a'],
    ['a', ''],
    ['a\nb\nc', 'a\nb\nc'],
    ['a\nb\nc', 'a\nX\nc'],
    ['a\nb\nc', 'a\nc'],
    ['a\nc', 'a\nb\nc'],
    ['a\nb\nc\n', 'a\nb\nc'],
    ['a\nb\nc', 'c\nb\na'],
    ['Zeile 1\nZeile 2', 'Zeile 0\nZeile 1\nZeile 2\nZeile 3'],
    ['# Titel\n\nText hier.\n', '# Titel\n\nGanz anderer Text.\n\nNeuer Absatz.\n'],
  ];

  it('rekonstruiert alle Fest-Fälle exakt', () => {
    for (const [base, neu] of cases) {
      const ops = diffLines(base, neu);
      expect(applyOps(base, ops)).toBe(neu);
    }
  });

  it('liefert [] bei identischen Texten', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([]);
    expect(diffLines('', '')).toEqual([]);
  });

  it('Property-Test: 200 zufällige Editier-Paare rekonstruieren exakt', () => {
    const rand = mulberry32(20260703);
    const vocab = ['alpha', 'beta', '', '# Kopf', '- Punkt', 'Text mit Umlauten äöü'];
    for (let run = 0; run < 200; run++) {
      const lines = Array.from(
        { length: Math.floor(rand() * 40) },
        () => vocab[Math.floor(rand() * vocab.length)],
      );
      const edited = lines.slice();
      const editCount = Math.floor(rand() * 8);
      for (let e = 0; e < editCount; e++) {
        const pos = Math.floor(rand() * (edited.length + 1));
        const kind = rand();
        if (kind < 0.34 && edited.length > 0) edited.splice(Math.min(pos, edited.length - 1), 1);
        else if (kind < 0.67) edited.splice(pos, 0, vocab[Math.floor(rand() * vocab.length)]);
        else if (edited.length > 0) edited[Math.min(pos, edited.length - 1)] = 'geändert-' + e;
      }
      const base = lines.join('\n');
      const neu = edited.join('\n');
      const ops = diffLines(base, neu);
      expect(applyOps(base, ops)).toBe(neu);
    }
  });
});

describe('applyOps-Validierung (4T-000331)', () => {
  it('wirft bei Delta, das nicht zum Basistext passt', () => {
    const ops = diffLines('a\nb\nc', 'a\nX\nc');
    expect(() => applyOps('a\nANDERS\nc', ops)).toThrow(/passt nicht/);
  });

  it('wirft bei Position außerhalb des Basistexts', () => {
    expect(() => applyOps('a', [{ at: 5, del: ['x'], ins: [] }])).toThrow(/ausserhalb/);
  });
});

describe('buildDiffRows (4T-000333)', () => {
  it('baut Hunks mit Kontext und Auslassungs-Markern', () => {
    const base = ['k1', 'k2', 'k3', 'alt', 'k4', 'k5', 'k6', 'k7', 'k8'].join('\n');
    const neu = ['k1', 'k2', 'k3', 'neu', 'k4', 'k5', 'k6', 'k7', 'k8'].join('\n');
    const rows = buildDiffRows(base, diffLines(base, neu), 2);
    expect(rows.map((r) => r.type)).toEqual([
      'gap', // k1 ausgelassen
      'ctx', // k2
      'ctx', // k3
      'del', // alt
      'ins', // neu
      'ctx', // k4
      'ctx', // k5
      'gap', // Rest ausgelassen
    ]);
    expect(rows.find((r) => r.type === 'del').text).toBe('alt');
    expect(rows.find((r) => r.type === 'ins').text).toBe('neu');
  });

  it('nahe Operationen laufen ohne Zeilen-Dopplung ineinander', () => {
    const base = ['a', 'b', 'c', 'd', 'e'].join('\n');
    const neu = ['A', 'b', 'c', 'D', 'e'].join('\n');
    const rows = buildDiffRows(base, diffLines(base, neu), 2);
    // Jede Basis-Zeile erscheint höchstens einmal als ctx/del.
    const baseTexts = rows.filter((r) => r.type === 'ctx' || r.type === 'del').map((r) => r.text);
    expect(new Set(baseTexts).size).toBe(baseTexts.length);
    expect(rows.filter((r) => r.type === 'del').map((r) => r.text)).toEqual(['a', 'd']);
    expect(rows.filter((r) => r.type === 'ins').map((r) => r.text)).toEqual(['A', 'D']);
  });
});

describe('countChanges und splitLines (4T-000331)', () => {
  it('zählt eingefügte und entfernte Zeilen', () => {
    const ops = diffLines('a\nb\nc', 'a\nX\nY');
    const { added, removed } = countChanges(ops);
    expect(added).toBe(2);
    expect(removed).toBe(2);
  });

  it('splitLines behandelt leere Texte und Trailing-Newline konsistent', () => {
    expect(splitLines('')).toEqual(['']);
    expect(splitLines('a\n')).toEqual(['a', '']);
  });
});
