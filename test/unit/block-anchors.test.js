// 4T-000363 (Epic 3E-000067): Unit-Tests fuer die gemeinsame Block-Anker-Quelle
// (src/shared/block-anchors.js): Extraktion in Textreihenfolge, Ueberspringen von
// Frontmatter und Fenced-Code, Duplikat-Erkennung, ID-Validierung und die
// kollisionsfreie ID-Generierung.
import { describe, it, expect } from 'vitest';
import {
  BLOCK_ANCHOR_RE,
  isValidBlockAnchorId,
  extractBlockAnchors,
  blockAnchorForLine,
  rewriteAnchorReferences,
  generateBlockAnchorId,
} from '../../src/shared/block-anchors.js';

describe('extractBlockAnchors (4T-000363)', () => {
  it('findet Anker am Zeilenende und auf eigener Zeile, in Reihenfolge', () => {
    const text = ['# Titel', '', 'Ein Absatz. ^a1b2c3', '', '^eigen', '', 'Noch was ^zweiter'].join(
      '\n',
    );
    const { order, lineById } = extractBlockAnchors(text);
    expect(order).toEqual(['a1b2c3', 'eigen', 'zweiter']);
    expect(lineById.get('a1b2c3')).toBe(3);
    expect(lineById.get('eigen')).toBe(5);
    expect(lineById.get('zweiter')).toBe(7);
  });

  it('meldet Duplikate; das erste Vorkommen zaehlt', () => {
    const text = ['Erst ^dup', 'Mitte', 'Nochmal ^dup'].join('\n');
    const { order, duplicates, lineById } = extractBlockAnchors(text);
    expect(order).toEqual(['dup']);
    expect([...duplicates]).toEqual(['dup']);
    expect(lineById.get('dup')).toBe(1);
  });

  it('ueberspringt Anker in Fenced-Code-Bloecken', () => {
    const text = ['Echt ^real', '```', 'Code ^fake', '```', 'Wieder ^real2'].join('\n');
    const { order } = extractBlockAnchors(text);
    expect(order).toEqual(['real', 'real2']);
  });

  it('ueberspringt Anker im YAML-Frontmatter', () => {
    const text = ['---', 'title: X ^nichtanker', '---', 'Body ^echt'].join('\n');
    const { order } = extractBlockAnchors(text);
    expect(order).toEqual(['echt']);
  });

  it('erlaubt Umlaute und Unicode in der ID', () => {
    const { order } = extractBlockAnchors('Zeile ^grün-2');
    expect(order).toEqual(['grün-2']);
  });

  it('leerer Text liefert keine Anker', () => {
    const { order, duplicates } = extractBlockAnchors('');
    expect(order).toEqual([]);
    expect(duplicates.size).toBe(0);
  });
});

describe('isValidBlockAnchorId (4T-000363)', () => {
  it('akzeptiert erlaubte Zeichen', () => {
    expect(isValidBlockAnchorId('a1b2c3')).toBe(true);
    expect(isValidBlockAnchorId('grün_2-x')).toBe(true);
  });
  it('lehnt leere, Sonder- und Whitespace-haltige IDs ab', () => {
    expect(isValidBlockAnchorId('')).toBe(false);
    expect(isValidBlockAnchorId('mit raum')).toBe(false);
    expect(isValidBlockAnchorId('^caret')).toBe(false);
    expect(isValidBlockAnchorId('punkt.')).toBe(false);
    expect(isValidBlockAnchorId(null)).toBe(false);
  });
});

describe('generateBlockAnchorId (4T-000363)', () => {
  it('liefert eine gueltige, 6-stellige ID', () => {
    const id = generateBlockAnchorId(new Set());
    expect(id).toHaveLength(6);
    expect(isValidBlockAnchorId(id)).toBe(true);
    expect(BLOCK_ANCHOR_RE.test(' ^' + id)).toBe(true);
  });

  it('vermeidet Kollisionen mit bestehenden IDs', () => {
    // Jede neue ID wird sofort in `existing` aufgenommen; die Funktion muss
    // fortlaufend eine unbelegte ID liefern, ohne haengen zu bleiben.
    const existing = new Set();
    for (let i = 0; i < 500; i++) existing.add(generateBlockAnchorId(existing));
    expect(existing.size).toBe(500);
  });

  it('akzeptiert auch ein Array als existing', () => {
    const id = generateBlockAnchorId(['abc123', 'def456']);
    expect(['abc123', 'def456']).not.toContain(id);
  });
});

describe('blockAnchorForLine (4T-000364)', () => {
  const text = [
    'Absatz eins mit Anker. ^aaa', // 1
    '', // 2
    'Zweiter Absatz,', // 3
    'geht weiter bis Anker. ^bbb', // 4
    '', // 5
    'Absatz ohne Anker.', // 6
  ].join('\n');

  it('findet den Anker des Absatzes, in dem der Cursor steht', () => {
    expect(blockAnchorForLine(text, 1)).toBe('aaa');
    // Cursor in Zeile 3, Anker in Zeile 4 desselben Absatzes.
    expect(blockAnchorForLine(text, 3)).toBe('bbb');
    expect(blockAnchorForLine(text, 4)).toBe('bbb');
  });

  it('liefert null auf einer Leerzeile', () => {
    expect(blockAnchorForLine(text, 2)).toBeNull();
    expect(blockAnchorForLine(text, 5)).toBeNull();
  });

  it('liefert null für einen Absatz ohne Anker', () => {
    expect(blockAnchorForLine(text, 6)).toBeNull();
  });

  it('ignoriert Anker in Fenced-Code', () => {
    const t2 = ['```', 'code ^fake', '```'].join('\n');
    expect(blockAnchorForLine(t2, 2)).toBeNull();
  });
});

describe('rewriteAnchorReferences (4T-000364)', () => {
  it('schreibt Anker-Definition und eingehende Verweise um', () => {
    const text = [
      'Ein Absatz mit Daten. ^alt',
      '',
      'Verweis: [[#^alt]] und [[Datei#^alt]] und [[Datei#^alt|Text]].',
    ].join('\n');
    const out = rewriteAnchorReferences(text, 'alt', 'neu');
    expect(out).toContain('^neu');
    expect(out).not.toContain('^alt');
    expect(out).toContain('[[#^neu]]');
    expect(out).toContain('[[Datei#^neu]]');
    expect(out).toContain('[[Datei#^neu|Text]]');
  });

  it('lässt Fenced-Code und ungültige/gleiche IDs unberührt', () => {
    const fenced = ['```', 'code ^alt', '```'].join('\n');
    expect(rewriteAnchorReferences(fenced, 'alt', 'neu')).toBe(fenced);
    expect(rewriteAnchorReferences('X ^alt', 'alt', 'alt')).toBe('X ^alt');
    expect(rewriteAnchorReferences('X ^alt', 'alt', 'mit raum')).toBe('X ^alt');
  });
});
