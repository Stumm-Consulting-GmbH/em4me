// 4T-002307 (Epic 3E-000263, F1 A, S1 bis S3; AK1, AK2): Unit-Tests der Rollen
// im Steckbrief der Datenbank — die Angabe `roles` mit dem Wort `all` in allen
// drei Lagen, die feste Reihenfolge der vier Operationen, je ein Fall für jeden
// Hinweis-Code und die Regel, dass eine Rolle mit Hinweis als nicht gesetzt
// gilt. Dazu der Abgleich gegen die Tabellen, den der Katalog aufruft, und die
// Angaben für die Befunde der Konsistenz-Prüfung.
//
// Die Fälle laufen gegen das Modul selbst; wie Katalog, Übersicht und
// Konsistenz-Prüfung die Rollen weiterreichen, steht in deren Prüfdateien.
import { describe, it, expect } from 'vitest';
import {
  ROLLEN_ALLE,
  ROLLEN_HINWEISE,
  ROLLEN_OPERATIONEN,
  ZUORDNUNG_HINWEISE,
  genannteTabellen,
  legeRollenAus,
  pruefeRollenGegenTabellen,
  pruefeSteckbriefRollen,
  pruefeZuordnung,
  rollenBefundAngaben,
} from '../../src/shared/database/rollen-angaben.js';
import { DB_DATABASE_KEY } from '../../src/shared/database/behaelter.js';
import { HINWEIS_META, hinweisSatz } from '../../src/shared/database/table-hinweise.js';

// Der Steckbrief-Behälter mit der übergebenen Angabe `roles`.
function mit(roles) {
  return { name: 'Library', roles };
}

// Die Hinweise in kurzer Form: Code, Rolle, Tabelle (Schlüssel) und Wert.
function kurz(hints) {
  return hints.map((h) => [h.code, h.name, h.key, h.wert === undefined ? null : h.wert]);
}

const ALLE_VIER = ['create', 'update', 'delete', 'define'];

// Das Beispiel aus dem Plan des Epics und der Story.
const BEISPIEL = {
  librarian: 'all',
  assistant: { Library: ['update'], Loans: ['create', 'update', 'delete'] },
};

describe('Rollen im Steckbrief: Wörter und Katalog (4T-002307)', () => {
  it('trägt die vier Operationen in fester Reihenfolge und das Wort all', () => {
    expect(ROLLEN_OPERATIONEN).toEqual(ALLE_VIER);
    expect(ROLLEN_ALLE).toBe('all');
  });

  it('führt jeden Hinweis-Code im Katalog am Schlüssel roles', () => {
    expect(ROLLEN_HINWEISE).toEqual([
      'roles',
      'roleShape',
      'roleTableShape',
      'roleOperation',
      'roleTable',
    ]);
    for (const code of ROLLEN_HINWEISE)
      expect(HINWEIS_META[code], code).toMatchObject({ key: 'roles' });
    expect(HINWEIS_META.roles.expected).toBe('object');
  });
});

describe('Rollen im Steckbrief: ohne Angabe (4T-002307, AK1)', () => {
  it('liefert ohne roles ein leeres Ergebnis ohne Hinweis', () => {
    for (const behaelter of [null, undefined, {}, mit(undefined), mit(null), mit('')]) {
      const ergebnis = legeRollenAus(behaelter);
      expect(ergebnis.rollen).toEqual({});
      expect(ergebnis.hints).toEqual([]);
    }
  });

  it('hängt an eine hereingereichte Hinweis-Liste an', () => {
    const hints = [{ code: 'vorher' }];
    const ergebnis = legeRollenAus(mit('Text'), hints);
    expect(ergebnis.hints).toBe(hints);
    expect(hints.map((h) => h.code)).toEqual(['vorher', 'roles']);
  });
});

describe('Rollen im Steckbrief: Auslegung (4T-002307, AK1)', () => {
  it('liest das Beispiel des Plans', () => {
    const { rollen, hints } = legeRollenAus(mit(BEISPIEL));
    expect(hints).toEqual([]);
    expect(rollen).toEqual({
      librarian: { alle: true, operationen: {}, alleTabellen: null },
      assistant: {
        alle: false,
        operationen: { Library: ['update'], Loans: ['create', 'update', 'delete'] },
        alleTabellen: null,
      },
    });
  });

  it('nimmt all als Wert einer Rolle für alle Operationen an allen Tabellen', () => {
    for (const wert of ['all', 'ALL', ' All ']) {
      const { rollen } = legeRollenAus(mit({ admin: wert }));
      expect(rollen.admin).toEqual({ alle: true, operationen: {}, alleTabellen: null });
    }
  });

  it('nimmt all als Tabellen-Name für alle Tabellen', () => {
    const { rollen, hints } = legeRollenAus(mit({ leser: { all: ['update'], Loans: ['create'] } }));
    expect(hints).toEqual([]);
    expect(rollen.leser).toEqual({
      alle: false,
      operationen: { Loans: ['create'] },
      alleTabellen: ['update'],
    });
  });

  it('nimmt all als Eintrag einer Liste und als Wert an einer Tabelle für alle vier', () => {
    const { rollen } = legeRollenAus(mit({ a: { Loans: ['all'] }, b: { Loans: 'all' } }));
    expect(rollen.a.operationen.Loans).toEqual(ALLE_VIER);
    expect(rollen.b.operationen.Loans).toEqual(ALLE_VIER);
  });

  it('führt die Operationen in fester Reihenfolge, ohne Doppel und ohne Rücksicht auf die Schreibung', () => {
    const roles = { pfleger: { Loans: ['Define', ' delete', 'create', 'create', 'UPDATE'] } };
    const { rollen, hints } = legeRollenAus(mit(roles));
    expect(hints).toEqual([]);
    expect(rollen.pfleger.operationen.Loans).toEqual(ALLE_VIER);
  });

  it('vereinigt zwei Schreibungen von all als Tabellen-Name', () => {
    const { rollen } = legeRollenAus(mit({ r: { all: ['delete'], ALL: ['create'] } }));
    expect(rollen.r.alleTabellen).toEqual(['create', 'delete']);
  });

  it('lässt eine leere Liste und eine leere Zuordnung als Rolle ohne Erlaubnis stehen', () => {
    const { rollen, hints } = legeRollenAus(mit({ a: { Loans: [] }, b: {} }));
    expect(hints).toEqual([]);
    expect(rollen.a.operationen).toEqual({ Loans: [] });
    expect(rollen.b).toEqual({ alle: false, operationen: {}, alleTabellen: null });
  });

  it('führt Rollen-Namen wie geschrieben, auch einen Namen wie __proto__', () => {
    const roles = JSON.parse('{"Leser": "all", "leser": "all", "__proto__": "all"}');
    const { rollen } = legeRollenAus(mit(roles));
    expect(Object.keys(rollen)).toEqual(['Leser', 'leser', '__proto__']);
    expect(Object.getPrototypeOf(rollen)).toBe(Object.prototype);
  });
});

describe('Rollen im Steckbrief: Hinweise (4T-002307, AK2)', () => {
  it('meldet roles, das kein Objekt ist; dann ist keine Rolle gesetzt', () => {
    for (const roles of ['librarian', ['librarian'], 42, true]) {
      const { rollen, hints } = legeRollenAus(mit(roles));
      expect(rollen).toEqual({});
      expect(kurz(hints)).toEqual([['roles', null, 'roles', null]]);
    }
  });

  it('meldet eine Rolle, die weder all noch eine Zuordnung ist, und lässt die übrigen stehen', () => {
    const { rollen, hints } = legeRollenAus(
      mit({ a: 'update', b: ['update'], c: null, librarian: 'all' }),
    );
    expect(Object.keys(rollen)).toEqual(['librarian']);
    expect(kurz(hints)).toEqual([
      ['roleShape', 'a', 'roles', null],
      ['roleShape', 'b', 'roles', null],
      ['roleShape', 'c', 'roles', null],
    ]);
  });

  it('meldet an einer Tabelle weder Liste noch all; die Rolle gilt als nicht gesetzt', () => {
    const { rollen, hints } = legeRollenAus(mit({ a: { Library: 'update', Loans: null } }));
    expect(rollen).toEqual({});
    expect(kurz(hints)).toEqual([
      ['roleTableShape', 'a', 'Library', null],
      ['roleTableShape', 'a', 'Loans', null],
    ]);
  });

  it('meldet jede unbekannte Operation mit Rolle, Tabelle und Wort; die Rolle gilt als nicht gesetzt', () => {
    const roles = { assistant: { Loans: ['create', 'archive', 7] }, librarian: 'all' };
    const { rollen, hints } = legeRollenAus(mit(roles));
    expect(Object.keys(rollen)).toEqual(['librarian']);
    expect(kurz(hints)).toEqual([
      ['roleOperation', 'assistant', 'Loans', 'archive'],
      ['roleOperation', 'assistant', 'Loans', '7'],
    ]);
    expect(hints[0].expected).toEqual(ALLE_VIER);
    expect(hints[0].index).toBe(-1);
  });

  it('setzt Rolle, Tabelle und Wort in den Satz ein', () => {
    const { hints } = legeRollenAus(mit({ assistant: { Loans: ['archive'] } }));
    const saetze = {
      'database.hint.roleOperation': '{name}|{key}|{wert}|{expected}',
    };
    expect(hinweisSatz(hints[0], (k) => saetze[k] || k)).toBe(
      'assistant|Loans|archive|create, update, delete, define',
    );
  });
});

describe('Rollen im Steckbrief: Abgleich gegen die Tabellen (4T-002307, AK2)', () => {
  const TABELLEN = ['Library', 'Loans'];

  it('lässt Rollen mit bekannten Tabellen stehen, ohne Rücksicht auf die Schreibung', () => {
    const { rollen } = legeRollenAus(
      mit({ ...BEISPIEL, c: { loans: ['update'], all: ['create'] } }),
    );
    const geprueft = pruefeRollenGegenTabellen(rollen, TABELLEN);
    expect(geprueft.hints).toEqual([]);
    expect(geprueft.rollen).toEqual(rollen);
  });

  it('meldet je unbekannter Tabelle roleTable; die Rolle gilt als nicht gesetzt', () => {
    const { rollen } = legeRollenAus(
      mit({ assistant: { Library: ['update'], Shelves: ['update'], Rooms: [] }, librarian: 'all' }),
    );
    const geprueft = pruefeRollenGegenTabellen(rollen, TABELLEN);
    expect(Object.keys(geprueft.rollen)).toEqual(['librarian']);
    expect(kurz(geprueft.hints)).toEqual([
      ['roleTable', 'assistant', 'Shelves', null],
      ['roleTable', 'assistant', 'Rooms', null],
    ]);
    expect(geprueft.hints[0].expected).toEqual(TABELLEN);
  });

  it('prüft mit den genannten Tabellen auch eine Rolle, die beim Lesen entfallen ist', () => {
    // Der Fall der Abnahme: unbekannte Operation und unbekannte Tabelle an
    // derselben Rolle; beide Hinweise erscheinen auf einmal.
    const data = {
      [DB_DATABASE_KEY]: mit({ assistant: { Loans: ['archive'], Shelves: ['update'] } }),
    };
    expect(genannteTabellen(data)).toEqual({ assistant: ['Loans', 'Shelves'] });
    const { rollen, hints } = legeRollenAus(data[DB_DATABASE_KEY]);
    const geprueft = pruefeRollenGegenTabellen(rollen, TABELLEN, genannteTabellen(data));
    expect(kurz([...hints, ...geprueft.hints])).toEqual([
      ['roleOperation', 'assistant', 'Loans', 'archive'],
      ['roleTable', 'assistant', 'Shelves', null],
    ]);
  });

  it('nennt ohne Rollen keine Tabelle und übergeht ein Frontmatter ohne Steckbrief', () => {
    expect(genannteTabellen(null)).toEqual({});
    expect(genannteTabellen({ title: 'Notiz' })).toEqual({});
    expect(genannteTabellen({ [DB_DATABASE_KEY]: mit({ a: 'all', b: { all: [] } }) })).toEqual({
      b: [],
    });
    expect(pruefeRollenGegenTabellen({}, TABELLEN)).toEqual({ rollen: {}, hints: [] });
  });
});

describe('Rollen im Steckbrief: Angaben für die Konsistenz-Prüfung (4T-002307, AK2)', () => {
  it('liefert je Hinweis Datei, Rolle und Tabelle', () => {
    const data = {
      [DB_DATABASE_KEY]: mit({
        assistant: { Loans: ['archive'], Shelves: ['update'] },
        gast: 'lesen',
        librarian: 'all',
      }),
    };
    expect(rollenBefundAngaben(data, ['Library', 'Loans'], '/db/Datenbank.md')).toEqual([
      { datei: '/db/Datenbank.md', wert: 'assistant', zieltabelle: 'Loans' },
      { datei: '/db/Datenbank.md', wert: 'gast', zieltabelle: null },
      { datei: '/db/Datenbank.md', wert: 'assistant', zieltabelle: 'Shelves' },
    ]);
  });

  it('nennt beim unbrauchbaren roles die Angabe selbst und ist ohne Rollen leer', () => {
    const datei = '/db/Datenbank.md';
    expect(rollenBefundAngaben({ [DB_DATABASE_KEY]: mit('x') }, [], datei)).toEqual([
      { datei, wert: 'roles', zieltabelle: null },
    ]);
    expect(
      rollenBefundAngaben({ [DB_DATABASE_KEY]: mit(BEISPIEL) }, ['Library', 'Loans'], datei),
    ).toEqual([]);
    expect(rollenBefundAngaben({ [DB_DATABASE_KEY]: null }, [], datei)).toEqual([]);
  });
});

// 4T-002308 (Epic 3E-000263, F2 A, S3; AK2): Vorgabe-Rolle und Zuordnung. Form
// beim Lesen, Existenz der Rolle nach dem Abgleich gegen die Tabellen; Rollen-
// und Anmeldenamen gelten exakt wie geschrieben.
describe('Rollen im Steckbrief: Zuordnung und Vorgabe-Rolle (4T-002308)', () => {
  const mitZuordnung = (weiteres) => ({ name: 'Library', roles: BEISPIEL, ...weiteres });

  it('führt die fünf Hinweis-Codes im Katalog an ihrer Angabe (4T-002308)', () => {
    expect(ZUORDNUNG_HINWEISE).toEqual([
      'users',
      'userShape',
      'defaultRoleShape',
      'defaultRoleUnknown',
      'userRoleUnknown',
    ]);
    const angabe = (code) => HINWEIS_META[code].key;
    expect(ZUORDNUNG_HINWEISE.map(angabe)).toEqual([
      'users',
      'users',
      'defaultRole',
      'defaultRole',
      'users',
    ]);
  });

  it('liest defaultRole und users wörtlich, ohne beides leer (4T-002308)', () => {
    const ergebnis = legeRollenAus(
      mitZuordnung({ defaultRole: 'assistant', users: { MStumm: 'librarian', gast: 'Assistant' } }),
    );
    expect(ergebnis.defaultRole).toBe('assistant');
    expect(ergebnis.users).toEqual({ MStumm: 'librarian', gast: 'Assistant' });
    expect(ergebnis.hints).toEqual([]);
    for (const behaelter of [null, mit(BEISPIEL), mitZuordnung({ defaultRole: '', users: null })]) {
      const leer = legeRollenAus(behaelter);
      expect([leer.defaultRole, leer.users, leer.hints]).toEqual([null, {}, []]);
    }
  });

  it('meldet defaultRole, users und eine Zuordnung in falscher Form (4T-002308)', () => {
    const falsch = legeRollenAus(mitZuordnung({ defaultRole: 3, users: ['mstumm'] }));
    expect(kurz(falsch.hints)).toEqual([
      ['defaultRoleShape', null, 'defaultRole', null],
      ['users', null, 'users', null],
    ]);
    expect([falsch.defaultRole, falsch.users]).toEqual([null, {}]);
    const eintrag = legeRollenAus(mitZuordnung({ users: { mstumm: ['librarian'], gast: 'x' } }));
    expect(kurz(eintrag.hints)).toEqual([['userShape', 'mstumm', 'users', null]]);
    expect(eintrag.users).toEqual({ gast: 'x' });
  });

  it('prüft Vorgabe-Rolle und Zuordnung exakt gegen die Rollen (4T-002308, AK2)', () => {
    const { rollen } = legeRollenAus(mit(BEISPIEL));
    const geprueft = pruefeZuordnung({
      rollen,
      defaultRole: 'Assistant',
      users: { mstumm: 'librarian', gast: 'editor' },
    });
    expect(geprueft.defaultRole).toBeNull();
    expect(geprueft.users).toEqual({ mstumm: 'librarian' });
    expect(kurz(geprueft.hints)).toEqual([
      ['defaultRoleUnknown', 'Assistant', 'defaultRole', null],
      ['userRoleUnknown', 'gast', 'users', 'editor'],
    ]);
    expect(geprueft.hints[0].expected).toEqual(['librarian', 'assistant']);
    const satz = hinweisSatz(geprueft.hints[1], (k) =>
      k === 'database.hint.userRoleUnknown' ? '{name} -> {wert}' : k,
    );
    expect(satz).toBe('gast -> editor');
  });

  it('prüft die Zuordnung erst nach dem Abgleich gegen die Tabellen (4T-002308)', () => {
    // «assistant» entfällt an der unbekannten Tabelle «Loans»; damit nennen
    // Vorgabe-Rolle und Zuordnung eine Rolle, die es nicht mehr gibt.
    const data = {
      [DB_DATABASE_KEY]: mitZuordnung({ defaultRole: 'assistant', users: { mstumm: 'assistant' } }),
    };
    const geprueft = pruefeSteckbriefRollen(data, ['Library']);
    expect(Object.keys(geprueft.rollen)).toEqual(['librarian']);
    expect([geprueft.defaultRole, geprueft.users, geprueft.leseHinweise]).toEqual([null, {}, []]);
    expect(geprueft.pruefHinweise.map((h) => h.code)).toEqual([
      'roleTable',
      'defaultRoleUnknown',
      'userRoleUnknown',
    ]);
    expect(rollenBefundAngaben(data, ['Library'], '/d.md').map((b) => b.wert)).toEqual([
      'assistant',
      'assistant',
      'mstumm',
    ]);
    const form = { [DB_DATABASE_KEY]: mitZuordnung({ users: 'x' }) };
    expect(rollenBefundAngaben(form, ['Library', 'Loans'], '/d.md')).toEqual([
      { datei: '/d.md', wert: 'users', zieltabelle: null },
    ]);
  });
});
