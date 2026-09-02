// 4T-000476 (Epic 3E-000088): Unit-Tests fuer createMdLinkRegex und den Form-Helfer
// mdLinkTargetFromMatch aus der gemeinsamen Erkennungs-Quelle (link-scan.js).
// Die Regex erfasst seit 4T-000476 zusaetzlich die CommonMark-Destination in
// spitzen Klammern ([Text](<Mein Ziel.md>)), die Leerzeichen im Ziel erlaubt.
// Der Helfer liefert fuer beide Formen { target, anchor, angle }; Backlinks-
// Index und Rewrite-Kern lesen ausschliesslich ueber ihn (keine rohen Gruppen-
// Indizes).
import { describe, it, expect } from 'vitest';
import {
  createMdLinkRegex,
  mdLinkTargetFromMatch,
} from '../../../src/shared/markdown/link-scan.js';

// Erstes Match einer frischen Regex-Instanz auf die Eingabe.
function firstMatch(input) {
  return createMdLinkRegex().exec(input);
}

describe('link-scan — mdLinkTargetFromMatch', () => {
  it('liest die klammerlose Form (angle=false) ohne Anker', () => {
    const m = firstMatch('[Text](Ziel.md)');
    expect(mdLinkTargetFromMatch(m)).toEqual({ target: 'Ziel.md', anchor: null, angle: false });
  });

  it('liest die klammerlose Form mit Anker', () => {
    const m = firstMatch('[Text](Ziel.md#abschnitt)');
    expect(mdLinkTargetFromMatch(m)).toEqual({
      target: 'Ziel.md',
      anchor: 'abschnitt',
      angle: false,
    });
  });

  it('liest die <…>-Form (angle=true) mit Leerzeichen im Ziel', () => {
    const m = firstMatch('[Text](<Mein Ziel.md>)');
    expect(mdLinkTargetFromMatch(m)).toEqual({
      target: 'Mein Ziel.md',
      anchor: null,
      angle: true,
    });
  });

  it('liest die <…>-Form mit Anker', () => {
    const m = firstMatch('[Text](<Mein Ziel.md#kap>)');
    expect(mdLinkTargetFromMatch(m)).toEqual({
      target: 'Mein Ziel.md',
      anchor: 'kap',
      angle: true,
    });
  });
});

describe('link-scan — createMdLinkRegex', () => {
  it('trifft die <…>-Form und die klammerlose Form in einer Zeile', () => {
    const re = createMdLinkRegex();
    const targets = [];
    let m;
    while ((m = re.exec('[A](<Mit Blank.md>) und [B](Ohne.md)')) !== null) {
      targets.push(mdLinkTargetFromMatch(m).target);
    }
    expect(targets).toEqual(['Mit Blank.md', 'Ohne.md']);
  });

  it('trifft ein rohes Leerzeichen ohne Klammern NICHT', () => {
    // CommonMark-konform: ein unkodiertes Leerzeichen bricht das klammerlose
    // Ziel ab (kein gueltiger Markdown-Link).
    expect(firstMatch('[Text](Mit Blank.md)')).toBeNull();
  });
});
