// 4T-002034 (Epic 3E-000260): Darstellungs-Kern der Ergebnismenge
// (src/shared/query/result-display.js). Er trägt die Anzeige-Regeln, die bis
// 4T-002033 die Auswertung selbst gebaut hat: Spalten-Überschrift,
// Anzeige-Stücke eines Werts, Anzeige-Name eines Treffers, gerundete
// Dringlichkeit, Gruppen-Beschriftung und -Durchlauf, Datei-Zahl des Zustands;
// seit 4T-002035 die Aufgaben-Treffer für Kennungs-Vorschlag und Vorgänger-Suche.
// Das Bild bleibt nach der Entscheidung F3 exakt gleich; die Handbuch-Zusage
// (Listen kommagetrennt, Datum im ISO-Format, Verweise klickbar) und die
// nicht endliche Zahl («Infinity») sind deshalb eigene Fälle.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  columnHeader,
  cellSegments,
  displayName,
  roundUrgency,
  groupTitle,
  walkGroups,
  taskHits,
  areaFileCount,
} from '../../src/shared/query/result-display.js';
import {
  makeColumn,
  fileOrigin,
  blockOrigin,
  taskOrigin,
  recordOrigin,
  makeRow,
  makeTaskInfo,
  makeGroup,
  makeState,
  makeResultSet,
} from '../../src/shared/query/result-set.js';
import { formatValueSegments } from '../../src/shared/query/query-format.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

describe('columnHeader', () => {
  it('Alias, sonst Quelltext, über die aufgelöste Beschriftung', () => {
    expect(columnHeader(makeColumn({ name: 'ch', label: 'Ch.', alias: 'Ch.', source: 'ch' }))).toBe(
      'Ch.',
    );
    expect(
      columnHeader(makeColumn({ name: 'prio * 2', label: 'prio * 2', source: 'prio * 2' })),
    ).toBe('prio * 2');
  });

  it('ohne Beschriftung fällt sie auf Alias und Quelltext zurück', () => {
    expect(columnHeader({ alias: 'A', source: 'x' })).toBe('A');
    expect(columnHeader({ alias: null, source: 'x' })).toBe('x');
    expect(columnHeader(null)).toBe('');
  });
});

describe('cellSegments', () => {
  it('ruft die eine Umwandlung formatValueSegments und liefert dasselbe', () => {
    const werte = [
      'Text',
      42,
      true,
      null,
      { kind: 'date', ms: new Date(2026, 6, 1).getTime() },
      { kind: 'dur', ms: 3 * 86_400_000 },
      { kind: 'link', path: '/r/Ziel.md', name: 'Ziel' },
      { kind: 'rich', segs: [{ text: 'a', bold: true }] },
      ['x', { kind: 'link', path: '/r/B.md', name: 'B' }],
    ];
    for (const v of werte) expect(cellSegments(v)).toEqual(formatValueSegments(v));
  });

  it('Handbuch-Zusage: Listen kommagetrennt, Datum im ISO-Format, Verweise als Verweis-Stück', () => {
    expect(cellSegments(['a', 'b', 'c'])).toEqual([
      { text: 'a' },
      { text: ', ' },
      { text: 'b' },
      { text: ', ' },
      { text: 'c' },
    ]);
    expect(cellSegments({ kind: 'date', ms: new Date(2026, 6, 1).getTime() })).toEqual([
      { text: '2026-07-01' },
    ]);
    expect(cellSegments({ kind: 'date', ms: new Date(2026, 6, 1, 9, 5, 7).getTime() })).toEqual([
      { text: '2026-07-01 09:05:07' },
    ]);
    expect(cellSegments({ kind: 'link', path: '/r/Ziel.md', name: 'Ziel' })).toEqual([
      { link: { path: '/r/Ziel.md', name: 'Ziel' } },
    ]);
  });

  it('nicht endliche Zahlen wie bisher als Text, fehlender Wert ohne Stücke', () => {
    expect(cellSegments(Infinity)).toEqual([{ text: 'Infinity' }]);
    expect(cellSegments(-Infinity)).toEqual([{ text: '-Infinity' }]);
    expect(cellSegments(null)).toEqual([]);
    expect(cellSegments('')).toEqual([]);
  });

  it('gibt Kopien heraus; die Stücke eines hervorgehobenen Werts bleiben unberührt', () => {
    const wert = { kind: 'rich', segs: [{ text: 'a', bold: true }] };
    cellSegments(wert)[0].text = 'verändert';
    expect(wert.segs[0].text).toBe('a');
  });

  // 4T-002040 (Epic 3E-000258): Der Datensatz-Verweis zeigt die Anzeige-Form
  // seines Ziels, ohne sie die Kennung, als Stück mit Klick-Ziel; ohne Pfad der
  // Ziel-Tabelle bleibt er Text. Die Text-Form (string(), Gruppen-Beschriftung)
  // ist dieselbe und nie «[object Object]».
  it('Datensatz-Verweis: Anzeige-Form als Stück mit Klick-Ziel, ohne sie die Kennung', () => {
    const ref = { kind: 'record', table: 'Library', id: 'r-00001', display: 'Zauberberg' };
    const ziel = { path: '/r/Library.md', table: 'Library', id: 'r-00001' };
    expect(cellSegments({ ...ref, path: ziel.path })).toEqual([
      { record: { ...ziel, name: 'Zauberberg' } },
    ]);
    expect(cellSegments({ ...ref, display: '', path: ziel.path })).toEqual([
      { record: { ...ziel, name: 'r-00001' } },
    ]);
    expect(cellSegments(ref)).toEqual([{ text: 'Zauberberg' }]);
    expect(groupTitle({ ...ref, path: ziel.path }).label).toBe('Zauberberg');
    expect(cellSegments([ref, { ...ref, id: 'r-00002', display: 'Kurz' }])).toEqual([
      { text: 'Zauberberg' },
      { text: ', ' },
      { text: 'Kurz' },
    ]);
  });
});

describe('displayName', () => {
  it('Datei und Aufgabe: logischer Datei-Name; Block: Datei#^anker', () => {
    expect(displayName(fileOrigin('/r/Alpha.md', 'Alpha'))).toBe('Alpha');
    expect(displayName(taskOrigin('/r/Alpha.md', 'Alpha', 3, '- [ ] x'))).toBe('Alpha');
    expect(displayName(blockOrigin('/r/Alpha.md', 'Alpha', 'a1'))).toBe('Alpha#^a1');
  });

  // 4T-002039: Der Datensatz heißt nach seiner Anzeige-Form, ohne sie nach
  // seiner Kennung (Festlegung 12 des Epics 3E-000258).
  it('Datensatz-Herkunft: Anzeige-Form, ohne sie die Kennung', () => {
    const mitAnzeige = { ...recordOrigin('kunden', 'r-00001'), display: 'Anna' };
    expect(displayName(mitAnzeige)).toBe('Anna');
    expect(displayName({ ...recordOrigin('kunden', 'r-00001'), display: null })).toBe('r-00001');
    expect(displayName(recordOrigin('kunden', 'r-00001'))).toBe('r-00001');
  });

  it('unbekannte Herkunft ergibt den leeren Text', () => {
    expect(displayName({ kind: 'neu', name: 'X' })).toBe('');
    expect(displayName(null)).toBe('');
  });
});

describe('roundUrgency', () => {
  it('zwei Nachkommastellen wie bisher (Math.round auf Hundertstel)', () => {
    expect(roundUrgency(1.95 + 12 - (8 * 9.6) / 21)).toBe(10.29);
    expect(roundUrgency(8.8)).toBe(8.8);
    expect(roundUrgency(0.005)).toBe(0.01);
  });
});

describe('groupTitle', () => {
  it('Text-Form und Anzeige-Stücke aus dem Gruppen-Wert', () => {
    expect(groupTitle('Alpha')).toEqual({ label: 'Alpha', segments: [{ text: 'Alpha' }] });
    expect(groupTitle({ kind: 'rich', segs: [{ text: 'A', bold: true }] })).toEqual({
      label: 'A',
      segments: [{ text: 'A', bold: true }],
    });
    expect(groupTitle(3)).toEqual({ label: '3', segments: [{ text: '3' }] });
  });

  it('die Gruppe ohne Wert hat keine Beschriftung', () => {
    expect(groupTitle(null)).toEqual({ label: null, segments: [] });
  });
});

describe('walkGroups', () => {
  const rs = (groups) => makeResultSet({ groups, state: makeState('ready') });

  it('durchläuft in der Reihenfolge der Menge, jede Gruppe vor ihren Untergruppen', () => {
    const menge = rs([
      makeGroup('A', [0, 1], [makeGroup('x', [0]), makeGroup('y', [1])]),
      makeGroup(null, [2]),
    ]);
    const besucht = [];
    walkGroups(menge, (g, level) => besucht.push(`${level}:${g.value}`));
    expect(besucht).toEqual(['0:A', '1:x', '1:y', '0:null']);
  });

  it('reicht den Kontext der Eltern-Ebene an die Untergruppen weiter', () => {
    const menge = rs([makeGroup('A', [0], [makeGroup('x', [0])]), makeGroup('B', [1])]);
    const wurzel = { name: 'wurzel', kinder: [] };
    walkGroups(
      menge,
      (g, _level, eltern) => {
        const knoten = { name: g.value, kinder: [] };
        eltern.kinder.push(knoten);
        return knoten;
      },
      wurzel,
    );
    expect(wurzel).toEqual({
      name: 'wurzel',
      kinder: [
        { name: 'A', kinder: [{ name: 'x', kinder: [] }] },
        { name: 'B', kinder: [] },
      ],
    });
  });

  it('ohne Gruppen geschieht nichts', () => {
    let aufrufe = 0;
    walkGroups(rs(null), () => (aufrufe += 1));
    walkGroups(null, () => (aufrufe += 1));
    expect(aufrufe).toBe(0);
  });
});

// 4T-002035 (Epic 3E-000260): Aufgaben-Treffer für Kennungs-Vorschlag und
// Vorgänger-Suche aus der Herkunft der Zeilen.
describe('taskHits', () => {
  const zeile = (line, raw) =>
    makeRow(
      [],
      taskOrigin('/r/Aufgaben.md', 'Aufgaben', line, raw),
      makeTaskInfo({ urgency: 1.95, blocked: false, duplicateId: false }),
    );
  const bereit = (rows, extra) =>
    makeResultSet({ scope: 'tasks', type: 'list', rows, state: makeState('ready', extra) });

  it('Pfad, Zeile und Roh-Zeile je Aufgaben-Zeile in der Reihenfolge der Menge', () => {
    expect(taskHits(bereit([zeile(7, '- [ ] B 🆔 b1'), zeile(3, '- [x] A')]))).toEqual([
      { path: '/r/Aufgaben.md', line: 7, taskText: '- [ ] B 🆔 b1' },
      { path: '/r/Aufgaben.md', line: 3, taskText: '- [x] A' },
    ]);
  });

  it('leer ohne Menge, im Zustand ungleich «bereit» und bei einem Abfrage-Fehler', () => {
    expect(taskHits(null)).toEqual([]);
    expect(taskHits(undefined)).toEqual([]);
    expect(taskHits(makeResultSet({ state: makeState('indexing') }))).toEqual([]);
    const fehler = { code: 'tasksScopeDisabled', message: '', pos: -1 };
    expect(taskHits(makeResultSet({ state: makeState('ready', { queryError: fehler }) }))).toEqual(
      [],
    );
  });

  it('übergeht Zeilen ohne Aufgaben-Herkunft', () => {
    const menge = bereit([makeRow([], fileOrigin('/r/Alpha.md', 'Alpha')), zeile(2, '- [ ] X')]);
    expect(taskHits(menge)).toEqual([{ path: '/r/Aufgaben.md', line: 2, taskText: '- [ ] X' }]);
  });
});

describe('areaFileCount', () => {
  it('Datei-Zahl aus dem Suchraum des Zustands, ohne Angabe 0', () => {
    expect(areaFileCount(makeState('oversized', { area: { root: '/r', fileCount: 2500 } }))).toBe(
      2500,
    );
    expect(areaFileCount(makeState('oversized', { area: { root: '/r' } }))).toBe(0);
    expect(areaFileCount(makeState('unavailable'))).toBe(0);
    expect(areaFileCount(null)).toBe(0);
  });
});

describe('Stellung des Moduls', () => {
  it('prozess-neutral: lädt allein den Werte-Kern, kein DOM, kein Electron', () => {
    const quelle = fs.readFileSync(
      path.join(dir, '../../src/shared/query/result-display.js'),
      'utf8',
    );
    const requires = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(requires).toEqual(['./query-format.js']);
    expect(quelle).not.toMatch(/\bdocument\b|\bwindow\b|electron/);
  });
});
