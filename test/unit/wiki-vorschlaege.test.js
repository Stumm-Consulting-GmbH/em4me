// 4T-1307 (Epic 3E-0235): Auswahl-Regel und Klammer-Schluss der Vorschlagsliste
// fuer interne Verweise.
//
// Beide Entscheidungen liegen prozessneutral in src/shared/wiki-vorschlaege.js
// und sind deshalb ohne Editor und ohne IPC pruefbar; der Renderer haelt nur
// die Verdrahtung mit CodeMirror.
import { describe, it, expect } from 'vitest';
import {
  AUTOCOMPLETE_RENDER_LIMIT,
  waehleWikiZiele,
  trefferBereich,
  klammerSchluss,
  schreibmarkeNachUebernahme,
} from '../../src/shared/wiki-vorschlaege.js';

// Vier Dateien mit bewusst gegenlaeufiger Alphabet- und Zeit-Folge: Wer nach
// Namen sortiert, bekommt A, B, C, D; wer nach Zeit sortiert, bekommt D, C,
// B, A. Damit ist jede Verwechslung der beiden Regeln sichtbar.
const ZIELE = [
  { name: 'Alpha', kind: 'file', mtimeMs: 1000 },
  { name: 'Beta', kind: 'file', mtimeMs: 2000 },
  { name: 'Gamma', kind: 'file', mtimeMs: 3000 },
  { name: 'Delta', kind: 'file', mtimeMs: 4000 },
];

const namen = (liste) => liste.map((s) => s.name);

describe('Auswahl-Regel der Verweis-Vorschlaege (4T-1307)', () => {
  it('ohne Eingabe fuehrt die Aenderungszeit, die juengste Datei zuerst', () => {
    expect(namen(waehleWikiZiele(ZIELE, ''))).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);
  });

  it('mit Eingabe fuehrt die Treffer-Guete, nicht die Zeit', () => {
    // 'Ba' trifft 'Bau' am Anfang und 'Verbau' in der Mitte. Der Prefix-Treffer
    // steht oben, obwohl der Teiltreffer juenger ist.
    const ziele = [
      { name: 'Verbau', kind: 'file', mtimeMs: 9000 },
      { name: 'Bau', kind: 'file', mtimeMs: 1000 },
    ];
    expect(namen(waehleWikiZiele(ziele, 'ba'))).toEqual(['Bau', 'Verbau']);
  });

  it('mit Eingabe entscheidet die Zeit zwischen Gleichrangigen', () => {
    // Beide sind Prefix-Treffer und beide Dateien; erst hier greift die Zeit.
    const ziele = [
      { name: 'Bau-alt', kind: 'file', mtimeMs: 1000 },
      { name: 'Bau-neu', kind: 'file', mtimeMs: 5000 },
    ];
    expect(namen(waehleWikiZiele(ziele, 'bau'))).toEqual(['Bau-neu', 'Bau-alt']);
  });

  it('mit Eingabe stehen Dateien vor Zweitnamen, auch wenn der Zweitname juenger ist', () => {
    const ziele = [
      { name: 'Bau', kind: 'alias', mtimeMs: 9000 },
      { name: 'Bau', kind: 'file', mtimeMs: 1000 },
    ];
    expect(waehleWikiZiele(ziele, 'bau').map((s) => s.kind)).toEqual(['file', 'alias']);
  });

  it('filtert auf Teiltreffer im Namen', () => {
    expect(namen(waehleWikiZiele(ZIELE, 'am'))).toEqual(['Gamma']);
    expect(waehleWikiZiele(ZIELE, 'kommt-nicht-vor')).toEqual([]);
  });

  it('bei gleicher Zeit entscheidet der Name, damit die Folge stabil bleibt', () => {
    const ziele = [
      { name: 'Zebra', kind: 'file', mtimeMs: 7000 },
      { name: 'Apfel', kind: 'file', mtimeMs: 7000 },
    ];
    expect(namen(waehleWikiZiele(ziele, ''))).toEqual(['Apfel', 'Zebra']);
  });

  it('behandelt eine fehlende Zeit als aeltesten Stand, ohne zu stolpern', () => {
    const ziele = [
      { name: 'Ohne', kind: 'file' },
      { name: 'Mit', kind: 'file', mtimeMs: 1 },
    ];
    expect(namen(waehleWikiZiele(ziele, ''))).toEqual(['Mit', 'Ohne']);
  });

  it('haelt das Render-Limit ein', () => {
    const viele = Array.from({ length: 100 }, (_, i) => ({
      name: `Datei-${String(i).padStart(3, '0')}`,
      kind: 'file',
      mtimeMs: i,
    }));
    expect(waehleWikiZiele(viele, '')).toHaveLength(AUTOCOMPLETE_RENDER_LIMIT);
    expect(waehleWikiZiele(viele, '', 5)).toHaveLength(5);
  });

  it('liefert bei fehlender Liste eine leere Auswahl', () => {
    expect(waehleWikiZiele(null, '')).toEqual([]);
  });

  it('laesst die uebergebene Liste unveraendert', () => {
    const vorher = namen(ZIELE);
    waehleWikiZiele(ZIELE, '');
    expect(namen(ZIELE)).toEqual(vorher);
  });
});

// 4T-1339 (Epic 3E-0238): Seit die Quelle die Eigensortierung der
// Vervollstaendigungs-Bibliothek abbestellt, rechnet diese die Hervorhebung
// der getroffenen Zeichen nicht mehr selbst aus. Die Regel dafuer liegt neben
// der Auswahl-Regel, weil sie deren Filter spiegelt.
describe('Treffer-Bereich fuer die Hervorhebung (4T-1339)', () => {
  it('nennt Anfang und Ende der Fundstelle', () => {
    expect(trefferBereich('Notizbuch', 'buch')).toEqual([5, 9]);
  });

  it('achtet nicht auf Gross- und Kleinschreibung, wie der Filter', () => {
    expect(trefferBereich('Notizbuch', 'NOTIZ')).toEqual([0, 5]);
  });

  it('nimmt die erste Fundstelle, wenn die Eingabe mehrfach vorkommt', () => {
    expect(trefferBereich('Bau-Bauteil', 'bau')).toEqual([0, 3]);
  });

  it('liefert ohne Eingabe keinen Bereich', () => {
    // Die Liste ohne Eingabe ist genau die Lage, fuer die 4T-1339 die
    // Reihenfolge nach Aenderungszeit wiederherstellt; hervorzuheben ist
    // dort nichts.
    expect(trefferBereich('Notizbuch', '')).toEqual([]);
    expect(trefferBereich('Notizbuch', null)).toEqual([]);
  });

  it('liefert keinen Bereich, wenn die Eingabe nicht vorkommt', () => {
    expect(trefferBereich('Notizbuch', 'xyz')).toEqual([]);
  });
});

describe('Klammer-Schluss bei der Uebernahme (4T-1307)', () => {
  it('ergaenzt beide Klammern, wenn keine dasteht', () => {
    expect(klammerSchluss('')).toBe(']]');
    expect(klammerSchluss(' und weiter')).toBe(']]');
  });

  it('ergaenzt nichts, wenn beide bereits dastehen', () => {
    expect(klammerSchluss(']]')).toBe('');
    expect(klammerSchluss(']] und weiter')).toBe('');
  });

  it('ergaenzt die zweite, wenn eine dasteht', () => {
    expect(klammerSchluss(']')).toBe(']');
    expect(klammerSchluss('] und weiter')).toBe(']');
  });

  it('setzt die Schreibmarke immer hinter die schliessenden Klammern', () => {
    // Der Versatz haengt nicht davon ab, wieviele Klammern ergaenzt wurden:
    // nach der Uebernahme stehen hinter dem Namen genau zwei.
    expect(schreibmarkeNachUebernahme(10, 'Notiz')).toBe(17);
    expect(schreibmarkeNachUebernahme(0, '')).toBe(2);
  });
});
