// 4T-002459 (Epic 3E-000367): Ereignis-Grammatik der Workflows (Story
// 4S-001142, Entscheidungen 3a, 3b und 3l der Konzept-Runde 4T-002458).
//
// Bestands-Lesung: Die sechs Beispiele sind die aus 3b; die Grenze des Bereichs
// prüft `checkAreaPath` in `src/shared/workflows/workflow-paths.js` wie bei den
// Pfaden der Befehls-Zeilen.
import { describe, it, expect } from 'vitest';
import { isFilesystemCaseInsensitive } from '../../src/shared/platform.js';
import {
  EVENT_FINDINGS,
  EVENT_PLACEHOLDERS,
  EVENT_TRIGGER,
  EVENT_TYPES,
  eventMatches,
  eventProvides,
  parseEvent,
} from '../../src/shared/workflows/workflow-event.js';

const regel = (text) => {
  const r = parseEvent(text);
  if (!r.ok) throw new Error(`nicht lesbar: ${text} (${r.code})`);
  return r.rule;
};
const befund = (text) => {
  const r = parseEvent(text);
  return [r.code, r.detail];
};
const passt = (text, type, path) => eventMatches(regel(text), { type, path });

describe('Konstanten', () => {
  it('kennt den Auslöser, die sechs Ereignisse und die Befund-Codes', () => {
    expect(EVENT_TRIGGER).toBe('event');
    expect(EVENT_TYPES).toEqual([
      'file-created',
      'file-changed',
      'file-moved',
      'task-done',
      'area-opened',
      'reminder-due',
    ]);
    expect(EVENT_PLACEHOLDERS).toEqual(['file', 'from', 'task']);
    expect(EVENT_FINDINGS).toEqual({
      unreadable: 'eventUnreadable',
      unknown: 'eventUnknown',
      outsideArea: 'eventOutsideArea',
      patternInvalid: 'eventPatternInvalid',
      filterNotAllowed: 'eventFilterNotAllowed',
    });
  });
});

describe('parseEvent — die Formen aus 3b (AK1)', () => {
  it('liest die sechs Beispiele des Lösungsansatzes', () => {
    expect(regel('file-created in "Eingang"')).toEqual({
      event: 'file-created',
      in: 'Eingang',
      matching: null,
    });
    expect(regel('file-changed in "Projekte" matching "*.md"')).toEqual({
      event: 'file-changed',
      in: 'Projekte',
      matching: '*.md',
    });
    expect(regel('file-moved in "Archiv"')).toEqual({
      event: 'file-moved',
      in: 'Archiv',
      matching: null,
    });
    expect(regel('task-done in "Wochenplan.md"')).toEqual({
      event: 'task-done',
      in: 'Wochenplan.md',
      matching: null,
    });
    expect(regel('area-opened')).toEqual({ event: 'area-opened', in: null, matching: null });
    expect(regel('reminder-due')).toEqual({ event: 'reminder-due', in: null, matching: null });
  });

  it('liest jedes Datei-Ereignis ohne Eingrenzung und mit matching allein', () => {
    for (const ereignis of ['file-created', 'file-changed', 'file-moved', 'task-done']) {
      expect(regel(ereignis)).toEqual({ event: ereignis, in: null, matching: null });
    }
    expect(regel('file-created matching "Scan-*.pdf"')).toEqual({
      event: 'file-created',
      in: null,
      matching: 'Scan-*.pdf',
    });
  });

  it('nimmt Schlüsselwörter ohne Rücksicht auf Groß- und Kleinschreibung, Werte wörtlich', () => {
    expect(regel('  File-Created   IN  "Eingang/Neu  2"  Matching "*.MD" ')).toEqual({
      event: 'file-created',
      in: 'Eingang/Neu  2',
      matching: '*.MD',
    });
  });

  it('schreibt den Ordner wurzel-relativ mit Schrägstrich, ohne Rand-Trenner', () => {
    expect(regel('file-created in "Eingang\\Scans\\"').in).toBe('Eingang/Scans');
    expect(regel('file-created in "./Eingang/"').in).toBe('Eingang');
  });

  it('liest Ordner mit Leerzeichen und Umlauten und gleicht sie ab (AK5 der Story)', () => {
    const r = regel('file-created in "Büro/Größere Ablage" matching "Übersicht *.md"');
    expect(r).toEqual({
      event: 'file-created',
      in: 'Büro/Größere Ablage',
      matching: 'Übersicht *.md',
    });
    expect(
      eventMatches(r, { type: 'file-created', path: 'Büro/Größere Ablage/Übersicht Mai.md' }),
    ).toBe(true);
    expect(eventMatches(r, { type: 'file-created', path: 'Büro/Größere/Übersicht Mai.md' })).toBe(
      false,
    );
  });
});

describe('parseEvent — Befunde (AK2)', () => {
  it('meldet ein unbekanntes Ereignis mit seinem Namen', () => {
    expect(befund('file-deleted in "Eingang"')).toEqual([
      'eventUnknown',
      { event: 'file-deleted' },
    ]);
    expect(befund('on file-created')).toEqual(['eventUnreadable', { event: 'on file-created' }]);
    expect(befund('document-saved')).toEqual(['eventUnknown', { event: 'document-saved' }]);
  });

  it('meldet einen Ordner außerhalb des Bereichs mit Art', () => {
    expect(befund('file-created in "../Fremd"')).toEqual([
      'eventOutsideArea',
      { path: '../Fremd', kind: 'parent' },
    ]);
    expect(befund('file-created in "C:/Daten"')).toEqual([
      'eventOutsideArea',
      { path: 'C:/Daten', kind: 'absolute' },
    ]);
    expect(befund('file-created in "/Eingang"')[0]).toBe('eventOutsideArea');
  });

  it('meldet eine Zeile außerhalb der Grammatik als nicht lesbar', () => {
    for (const zeile of [
      '',
      'file-created in Eingang',
      'file-created in „Eingang“',
      'file-created matching "*.md" in "Eingang"',
      'file-created in "Eingang" extra',
      'file-created in "Eingang',
      'file-created in "."',
      'file-created in ""',
    ]) {
      expect(parseEvent(zeile).code, zeile).toBe('eventUnreadable');
    }
    expect(parseEvent(42)).toEqual({ ok: false, code: 'eventUnreadable', detail: { event: '42' } });
  });

  it('meldet ein leeres Muster und ein Muster mit Pfad-Trenner', () => {
    expect(befund('file-changed matching ""')).toEqual(['eventPatternInvalid', { pattern: '' }]);
    expect(befund('file-changed matching "Projekte/*.md"')).toEqual([
      'eventPatternInvalid',
      { pattern: 'Projekte/*.md' },
    ]);
  });

  it('meldet in und matching bei area-opened und reminder-due', () => {
    expect(befund('area-opened in "Eingang"')).toEqual([
      'eventFilterNotAllowed',
      { event: 'area-opened' },
    ]);
    expect(befund('reminder-due matching "*.md"')).toEqual([
      'eventFilterNotAllowed',
      { event: 'reminder-due' },
    ]);
  });
});

describe('eventMatches — der Abgleich (AK1)', () => {
  it('trifft nur das Ereignis der Regel', () => {
    expect(passt('file-created', 'file-created', 'a.md')).toBe(true);
    expect(passt('file-created', 'file-changed', 'a.md')).toBe(false);
    expect(passt('area-opened', 'area-opened')).toBe(true);
    expect(passt('reminder-due', 'reminder-due', 'Termine.md')).toBe(true);
    expect(passt('reminder-due', 'area-opened')).toBe(false);
  });

  it('grenzt mit in auf den Ordner samt Unterordnern ein', () => {
    const r = 'file-created in "Eingang"';
    expect(passt(r, 'file-created', 'Eingang/Scan.pdf')).toBe(true);
    expect(passt(r, 'file-created', 'Eingang/2026/Okt/Scan.pdf')).toBe(true);
    // Schreibweise des Ordners: gefaltet nur auf Dateisystemen ohne Rücksicht
    // auf Groß- und Kleinschreibung (zentrale Plattform-Auskunft, Erosions-Wächter E2).
    expect(passt(r, 'file-created', 'eingang/scan.pdf')).toBe(isFilesystemCaseInsensitive());
    expect(passt(r, 'file-created', 'Eingang\\Scan.pdf')).toBe(true);
    expect(passt(r, 'file-created', 'Eingangskorb/Scan.pdf')).toBe(false);
    expect(passt(r, 'file-created', 'Archiv/Eingang/Scan.pdf')).toBe(false);
    expect(passt(r, 'file-created', 'Scan.pdf')).toBe(false);
    expect(passt(r, 'file-created', '')).toBe(false);
  });

  it('grenzt mit in auf eine Datei ein', () => {
    const r = 'task-done in "Wochenplan.md"';
    expect(passt(r, 'task-done', 'Wochenplan.md')).toBe(true);
    expect(passt(r, 'task-done', 'Wochenplan.md.bak')).toBe(false);
    expect(passt(r, 'task-done', 'Alt/Wochenplan.md')).toBe(false);
  });

  it('grenzt mit matching auf den Datei-Namen ein', () => {
    const r = 'file-changed in "Projekte" matching "*.md"';
    expect(passt(r, 'file-changed', 'Projekte/A/Plan.md')).toBe(true);
    expect(passt(r, 'file-changed', 'Projekte/A/Plan.MD')).toBe(true);
    expect(passt(r, 'file-changed', 'Projekte/A/Plan.md.tmp')).toBe(false);
    expect(passt(r, 'file-changed', 'Notizen/Plan.md')).toBe(false);
    const fragezeichen = 'file-created matching "Scan-??.pdf"';
    expect(passt(fragezeichen, 'file-created', 'x/Scan-01.pdf')).toBe(true);
    expect(passt(fragezeichen, 'file-created', 'Scan-1.pdf')).toBe(false);
    // Sonderzeichen eines regulären Ausdrucks gelten wörtlich.
    const klammern = 'file-created matching "Bericht (1).md"';
    expect(passt(klammern, 'file-created', 'Bericht (1).md')).toBe(true);
    expect(passt(klammern, 'file-created', 'Bericht 1.md')).toBe(false);
  });

  it('nimmt bei file-moved den neuen Pfad', () => {
    const r = regel('file-moved in "Archiv"');
    expect(eventMatches(r, { type: 'file-moved', path: 'Archiv/A.md', from: 'Eingang/A.md' })).toBe(
      true,
    );
    expect(eventMatches(r, { type: 'file-moved', path: 'Eingang/A.md', from: 'Archiv/A.md' })).toBe(
      false,
    );
  });

  it('trifft ohne Regel oder Ereignis nichts', () => {
    expect(eventMatches(null, { type: 'file-created', path: 'a.md' })).toBe(false);
    expect(eventMatches(regel('file-created'), null)).toBe(false);
  });
});

describe('eventProvides — Platzhalter je Ereignis (3l, AK4)', () => {
  it('liefert {{file}} außer bei area-opened', () => {
    for (const ereignis of EVENT_TYPES) {
      expect(eventProvides(ereignis, 'file'), ereignis).toBe(ereignis !== 'area-opened');
    }
  });

  it('liefert {{from}} nur bei file-moved und {{task}} nur bei task-done', () => {
    expect(EVENT_TYPES.filter((e) => eventProvides(e, 'from'))).toEqual(['file-moved']);
    expect(EVENT_TYPES.filter((e) => eventProvides(e, 'task'))).toEqual(['task-done']);
  });

  it('liefert jeden Platzhalter, der nicht vom Ereignis abhängt', () => {
    for (const name of ['date', 'time', 'area', 'title', 'folder', 'clipboard']) {
      expect(eventProvides('area-opened', name), name).toBe(true);
    }
  });

  it('liefert bei einem unbekannten Ereignis keinen Ereignis-Platzhalter', () => {
    expect(eventProvides('constructor', 'file')).toBe(false);
  });
});
