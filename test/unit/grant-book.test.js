// 4T-002647 (Epic 3E-000416): Das Buch der Freigaben (AK1). Freigaben je
// Fenster, Ende mit dem Fenster, Ende je Inhaber, Übertragung, zwei Fenster
// getrennt.
//
// Bestands-Lesungen: keine. Das Buch ist rein und ohne Datei-Zugriff; die
// Wurzeln sind erfundene absolute Pfade der laufenden Plattform.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGrantBook, addonOwner, ORIGINS } = require('../../src/main/grants/grant-book.js');

const ROOT_A = path.resolve('/em4me-probe/Bereich-A');
const ROOT_B = path.resolve('/em4me-probe/Bereich-B');
const ALL = ['read', 'write', 'create'];

function area(root = ROOT_A, more = {}) {
  return { root, kind: 'area', scope: ALL, origin: 'dialog', end: 'binding', ...more };
}

describe('Freigaben-Buch: eintragen und abfragen', () => {
  it('ein Eintrag trägt beide Wurzel-Formen, Art, Umfang, Herkunft, Inhaber und Ende', () => {
    const book = createGrantBook();
    const chosen = path.resolve('/em4me-probe/Verweis');
    const e = book.grant(7, area(ROOT_A, { chosenRoot: chosen }));
    expect(e).toMatchObject({
      windowId: 7,
      root: ROOT_A,
      chosenRoot: chosen,
      kind: 'area',
      scope: ['read', 'write', 'create'],
      origin: 'dialog',
      owner: 'program',
      end: 'binding',
      transferredFrom: null,
    });
    expect(typeof e.id).toBe('string');
    expect(book.query(7)).toEqual([e]);
    expect(book.entry(7, e.id)).toBe(e);
  });

  it('ohne gewählte Form gilt die aufgelöste auch als gewählte', () => {
    const book = createGrantBook();
    expect(book.grant(1, area()).chosenRoot).toBe(ROOT_A);
  });

  it('der Umfang steht in fester Reihenfolge, ohne Doppel und ohne eingebaute Folgerung', () => {
    const book = createGrantBook();
    const e = book.grant(1, area(ROOT_A, { scope: ['write', 'read', 'write'] }));
    expect(e.scope).toEqual(['read', 'write']);
    expect(book.grant(1, area(ROOT_B, { scope: ['read'] })).scope).toEqual(['read']);
  });

  it('abgefragte Einträge lassen sich nicht verändern', () => {
    const book = createGrantBook();
    const e = book.grant(1, area());
    expect(() => {
      e.root = ROOT_B;
    }).toThrow(TypeError);
    expect(() => {
      e.scope.push('gibtsnicht');
    }).toThrow(TypeError);
    expect(() => book.query(1).push(e)).toThrow(TypeError);
    expect(book.query(1)[0].root).toBe(ROOT_A);
  });

  it('jede bekannte Herkunft lässt sich eintragen', () => {
    const book = createGrantBook();
    for (const origin of ORIGINS) book.grant(1, area(ROOT_A, { origin }));
    expect(book.query(1)).toHaveLength(ORIGINS.length);
  });

  it.each([
    ['Fenster-Kennung keine Zahl', 'eins', area()],
    ['Fenster-Kennung null', 0, area()],
    ['relative Wurzel', 1, area('Bereich')],
    ['relative gewählte Wurzel', 1, area(ROOT_A, { chosenRoot: 'Bereich' })],
    ['Wurzel mit Null-Zeichen', 1, area(`${ROOT_A}\0`)],
    ['unbekannte Art', 1, area(ROOT_A, { kind: 'gibtsnicht' })],
    ['unbekannter Umfang', 1, area(ROOT_A, { scope: ['gibtsnicht'] })],
    ['leerer Umfang', 1, area(ROOT_A, { scope: [] })],
    ['unbekannte Herkunft', 1, area(ROOT_A, { origin: 'gibtsnicht' })],
    ['unbekanntes Ende', 1, area(ROOT_A, { end: 'gibtsnicht' })],
    ['Add-on ohne Namensraum', 1, area(ROOT_A, { owner: 'import-werkzeug' })],
    ['leerer Inhaber', 1, area(ROOT_A, { owner: '' })],
  ])('bricht laut bei %s', (_name, windowId, spec) => {
    const book = createGrantBook();
    expect(() => book.grant(windowId, spec)).toThrow(TypeError);
    expect(book.query(1)).toEqual([]);
  });

  it('ein Add-on heißt «addon:<Kennung>», auch wenn seine Kennung «program» lautet', () => {
    expect(addonOwner('import-werkzeug')).toBe('addon:import-werkzeug');
    expect(addonOwner('program')).toBe('addon:program');
    expect(() => addonOwner('Gross')).toThrow(TypeError);
    const book = createGrantBook();
    book.grant(1, area(ROOT_A, { owner: addonOwner('program') }));
    expect(book.query(1, { owner: 'program' })).toEqual([]);
  });

  it('ein unbekanntes Filter-Feld bricht laut, statt alles zu treffen', () => {
    const book = createGrantBook();
    book.grant(1, area());
    expect(() => book.end(1, { gibtsnicht: 'x' })).toThrow(TypeError);
    expect(() => book.end(2, { gibtsnicht: 'x' })).toThrow(TypeError);
    expect(book.query(1)).toHaveLength(1);
  });

  it('zwei Bücher teilen keinen Zustand', () => {
    const one = createGrantBook();
    const two = createGrantBook();
    one.grant(1, area());
    expect(two.query(1)).toEqual([]);
  });
});

describe('Freigaben-Buch: Fenster', () => {
  it('zwei Fenster sind getrennt: Abfrage, Entzug und Ende wirken je Fenster', () => {
    const book = createGrantBook();
    const a = book.grant(1, area(ROOT_A));
    const b = book.grant(2, area(ROOT_B));
    expect(book.query(1)).toEqual([a]);
    expect(book.query(2)).toEqual([b]);
    expect(book.entry(1, b.id)).toBeNull();
    expect(book.revoke(1, b.id)).toBe(false);
    expect(book.query(2)).toEqual([b]);
  });

  it('entziehen nimmt genau einen Eintrag', () => {
    const book = createGrantBook();
    const a = book.grant(1, area(ROOT_A));
    const b = book.grant(1, area(ROOT_B));
    expect(book.revoke(1, a.id)).toBe(true);
    expect(book.revoke(1, a.id)).toBe(false);
    expect(book.query(1)).toEqual([b]);
  });

  it('mit dem Schließen eines Fensters enden alle seine Einträge, die des anderen bleiben', () => {
    const book = createGrantBook();
    book.grant(1, area(ROOT_A));
    book.grant(1, { root: ROOT_B, kind: 'file', scope: ['read'], origin: 'recentList' });
    book.grant(1, area(ROOT_A, { owner: addonOwner('import-werkzeug') }));
    const other = book.grant(2, area(ROOT_B));
    expect(book.endWindow(1)).toBe(3);
    expect(book.query(1)).toEqual([]);
    expect(book.query(2)).toEqual([other]);
    expect(book.endWindow(1)).toBe(0);
  });

  it('das Lösen einer Bindung beendet nur die Einträge mit Ende «binding»', () => {
    const book = createGrantBook();
    book.grant(1, area(ROOT_A));
    const file = book.grant(1, { root: ROOT_B, kind: 'file', scope: ['read'], origin: 'dialog' });
    expect(file.end).toBe('window');
    expect(book.end(1, { end: 'binding' })).toBe(1);
    expect(book.query(1)).toEqual([file]);
  });
});

describe('Freigaben-Buch: Inhaber', () => {
  it('alle Einträge eines Inhabers enden in allen Fenstern, die übrigen bleiben', () => {
    const book = createGrantBook();
    const addon = addonOwner('import-werkzeug');
    const other = addonOwner('notiz-merker');
    const p1 = book.grant(1, area(ROOT_A));
    book.grant(1, area(ROOT_A, { owner: addon, end: 'window' }));
    book.grant(2, area(ROOT_B, { owner: addon }));
    const foreign = book.grant(2, area(ROOT_B, { owner: other }));
    expect(book.endOwner(addon)).toBe(2);
    expect(book.query(1)).toEqual([p1]);
    expect(book.query(2)).toEqual([foreign]);
    expect(() => book.endOwner('gibtsnicht')).toThrow(TypeError);
  });

  it('die Abfrage lässt sich auf einen Inhaber begrenzen', () => {
    const book = createGrantBook();
    const addon = addonOwner('import-werkzeug');
    const p = book.grant(1, area(ROOT_A));
    const g = book.grant(1, area(ROOT_B, { owner: addon }));
    expect(book.query(1, { owner: 'program' })).toEqual([p]);
    expect(book.query(1, { owner: addon })).toEqual([g]);
  });
});

describe('Freigaben-Buch: Übertragung an ein anderes Fenster', () => {
  it('kopieren: Das neue Fenster erhält dieselben Angaben, das abgebende behält sie', () => {
    const book = createGrantBook();
    const chosen = path.resolve('/em4me-probe/Verweis');
    const a = book.grant(1, area(ROOT_A, { scope: ['read'], chosenRoot: chosen }));
    const res = book.transfer(1, 2, [a.id], { mode: 'copy' });
    expect(res.ok).toBe(true);
    const [fresh] = res.entries;
    expect(fresh).toMatchObject({
      windowId: 2,
      root: ROOT_A,
      chosenRoot: chosen,
      kind: 'area',
      scope: ['read'],
      origin: 'dialog',
      transferredFrom: 1,
    });
    expect(fresh.id).not.toBe(a.id);
    expect(book.query(2)).toEqual([fresh]);
    expect(book.query(1)).toEqual([a]);
  });

  it('verschieben: Das abgebende Fenster verliert den Eintrag', () => {
    const book = createGrantBook();
    const a = book.grant(1, area(ROOT_A));
    const b = book.grant(1, area(ROOT_B));
    expect(book.transfer(1, 2, [a.id], { mode: 'move' }).ok).toBe(true);
    expect(book.query(1)).toEqual([b]);
    expect(book.query(2).map((e) => e.root)).toEqual([ROOT_A]);
  });

  it('nach der Übertragung endet die Kopie mit ihrem eigenen Fenster', () => {
    const book = createGrantBook();
    const a = book.grant(1, area(ROOT_A));
    book.transfer(1, 2, [a.id], { mode: 'copy' });
    book.endWindow(1);
    expect(book.query(2)).toHaveLength(1);
    book.endWindow(2);
    expect(book.query(2)).toEqual([]);
  });

  it('eine unbekannte Kennung oder ein Griff eines Add-ons ändert nichts', () => {
    const book = createGrantBook();
    const a = book.grant(1, area(ROOT_A));
    const g = book.grant(1, area(ROOT_B, { owner: addonOwner('import-werkzeug') }));
    expect(book.transfer(1, 2, [a.id, 'gibtsnicht'], { mode: 'move' })).toEqual({
      ok: false,
      code: 'unknownId',
      id: 'gibtsnicht',
    });
    expect(book.transfer(1, 2, [a.id, g.id], { mode: 'move' })).toEqual({
      ok: false,
      code: 'notTransferable',
      id: g.id,
    });
    expect(book.query(1)).toEqual([a, g]);
    expect(book.query(2)).toEqual([]);
  });

  it('ohne ausdrücklichen Modus oder an dasselbe Fenster bricht die Übertragung laut', () => {
    const book = createGrantBook();
    const a = book.grant(1, area(ROOT_A));
    expect(() => book.transfer(1, 2, [a.id])).toThrow(TypeError);
    expect(() => book.transfer(1, 2, [a.id], { mode: 'gibtsnicht' })).toThrow(TypeError);
    expect(() => book.transfer(1, 1, [a.id], { mode: 'copy' })).toThrow(TypeError);
    expect(book.query(2)).toEqual([]);
  });
});
