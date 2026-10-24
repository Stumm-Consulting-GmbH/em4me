// 4T-002308 (Epic 3E-000263, S1, S3, S4; AK1, AK3): Unit-Tests der Auflösung
// der eigenen Rolle — vom Anmeldenamen über Zuordnung und Vorgabe-Rolle zur
// Erlaubnis-Menge je Tabelle, mit jedem Zweig der Regel und dem exakten
// Vergleich des Anmeldenamens. Dazu die Auskunft des Katalogs für die
// Lese-Kanäle, die dieselbe Antwort geben muss wie der Überblick.
import { describe, it, expect } from 'vitest';
import { loeseRechte } from '../../src/shared/database/rechte.js';
import { legeRollenAus } from '../../src/shared/database/rollen-angaben.js';
import {
  createDatabaseCatalogCache,
  katalogUeberblick,
  rechteDerSicht,
  rechteDerTabelle,
} from '../../src/main/database/table-catalog.js';
import { DB_DATABASE_KEY } from '../../src/shared/database/behaelter.js';

const ALLES = { create: true, update: true, delete: true, define: true };
const NICHTS = { create: false, update: false, delete: false, define: false };
const TABELLEN = ['Library', 'Loans', 'Shelves'];

// Die Rollen des Plans, über die Auslegung selbst gebildet.
const { rollen: ROLLEN } = legeRollenAus({
  roles: {
    librarian: 'all',
    assistant: { Library: ['update'], loans: ['create', 'update', 'delete'] },
    pfleger: { all: ['update'], Shelves: ['define'] },
  },
});

function loese(weiteres) {
  return loeseRechte({ rollen: ROLLEN, tabellenNamen: TABELLEN, ...weiteres });
}

describe('Auflösung der eigenen Rolle: Regel (4T-002308, AK1)', () => {
  it('erlaubt ohne Rollen jede Operation an jeder Tabelle (4T-002308)', () => {
    for (const rollen of [{}, undefined, null]) {
      const r = loeseRechte({
        rollen,
        users: { mstumm: 'x' },
        anmeldename: 'mstumm',
        tabellenNamen: TABELLEN,
      });
      expect([r.rolle, r.quelle]).toEqual([null, 'alles']);
      expect(r.rechte).toEqual({ Library: ALLES, Loans: ALLES, Shelves: ALLES });
    }
    expect(loeseRechte()).toEqual({ rolle: null, quelle: 'alles', rechte: {} });
  });

  it('löst einen zugeordneten Namen zu seiner Rolle auf (4T-002308)', () => {
    const r = loese({
      users: { mstumm: 'assistant' },
      defaultRole: 'librarian',
      anmeldename: 'mstumm',
    });
    expect([r.rolle, r.quelle]).toEqual(['assistant', 'zuordnung']);
    expect(r.rechte.Library).toEqual({ ...NICHTS, update: true });
    // Der Tabellen-Name der Rolle trifft ohne Rücksicht auf die Schreibung.
    expect(r.rechte.Loans).toEqual({ create: true, update: true, delete: true, define: false });
    expect(r.rechte.Shelves).toEqual(NICHTS);
  });

  it('löst einen nicht zugeordneten Namen zur Vorgabe-Rolle auf (4T-002308)', () => {
    const r = loese({
      users: { mstumm: 'assistant' },
      defaultRole: 'librarian',
      anmeldename: 'gast',
    });
    expect([r.rolle, r.quelle]).toEqual(['librarian', 'vorgabe']);
    expect(r.rechte).toEqual({ Library: ALLES, Loans: ALLES, Shelves: ALLES });
  });

  it('erlaubt ohne Zuordnung und ohne Vorgabe-Rolle alles (4T-002308)', () => {
    for (const anmeldename of ['gast', null, undefined]) {
      const r = loese({ users: { mstumm: 'assistant' }, anmeldename });
      expect([r.rolle, r.quelle]).toEqual([null, 'alles']);
      expect(r.rechte.Shelves).toEqual(ALLES);
    }
  });

  it('vergleicht den Anmeldenamen exakt: MStumm ist nicht mstumm (4T-002308)', () => {
    const users = { mstumm: 'assistant' };
    expect(loese({ users, anmeldename: 'MStumm' }).quelle).toBe('alles');
    expect(loese({ users, anmeldename: 'mstumm ' }).quelle).toBe('alles');
    expect(loese({ users, anmeldename: 'DOMAENE\\mstumm' }).quelle).toBe('alles');
    expect(loese({ users: { MStumm: 'assistant' }, anmeldename: 'MStumm' }).rolle).toBe(
      'assistant',
    );
  });

  it('vereinigt alle Tabellen und die Tabelle selbst (4T-002308)', () => {
    const r = loese({ defaultRole: 'pfleger', anmeldename: 'gast' });
    expect(r.rechte.Library).toEqual({ ...NICHTS, update: true });
    expect(r.rechte.Shelves).toEqual({ ...NICHTS, update: true, define: true });
  });

  it('übergeht eine Zuordnung oder Vorgabe auf eine Rolle, die fehlt (4T-002308)', () => {
    const r = loese({
      users: { mstumm: 'editor' },
      defaultRole: 'assistant',
      anmeldename: 'mstumm',
    });
    expect([r.rolle, r.quelle]).toEqual(['assistant', 'vorgabe']);
    const ohne = loese({
      users: { mstumm: 'editor' },
      defaultRole: 'editor',
      anmeldename: 'mstumm',
    });
    expect([ohne.rolle, ohne.quelle]).toEqual([null, 'alles']);
    // Ein geerbter Name wie `toString` ist weder Rolle noch Zuordnung.
    expect(loese({ defaultRole: 'toString', anmeldename: 'toString' }).quelle).toBe('alles');
  });

  it('setzt einen Tabellen-Namen wie __proto__ als eigene Eigenschaft (4T-002308)', () => {
    const r = loeseRechte({
      rollen: ROLLEN,
      defaultRole: 'librarian',
      tabellenNamen: ['__proto__'],
    });
    expect(Object.keys(r.rechte)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(r.rechte, '__proto__').value).toEqual(ALLES);
  });
});

// --- Auskunft des Katalogs für die Lese-Kanäle -------------------------------------

function fakeFs(dateien) {
  return {
    async stat(p) {
      if (!(p in dateien)) throw new Error('ENOENT');
      return { mtimeMs: 1, size: Buffer.byteLength(dateien[p], 'utf8') };
    },
    async readFile(p) {
      if (!(p in dateien)) throw new Error('ENOENT');
      return dateien[p];
    },
  };
}

const TABELLE = (name) => [`/db/${name}.md`, '---\ndb-table:\n  fields:\n    - name: titel\n---\n'];
const STECKBRIEF = '/db/Datenbank.md';
const DATEIEN = Object.fromEntries([
  TABELLE('Library'),
  TABELLE('Loans'),
  [
    STECKBRIEF,
    [
      '---',
      `${DB_DATABASE_KEY}:`,
      '  roles:',
      '    librarian: all',
      '    assistant:',
      '      Library: [update]',
      '  defaultRole: assistant',
      '  users:',
      '    mstumm: librarian',
      '    gast: editor',
      '---',
      '',
    ].join('\n'),
  ],
]);
const SICHT = {
  dbKindsPerFile: new Map([
    ['/db/Library.md', ['table']],
    ['/db/Loans.md', ['table']],
    [STECKBRIEF, ['database']],
  ]),
};
const als = (benutzer) => () => ({ benutzer, rechner: 'pc' });

describe('Auflösung der eigenen Rolle: Auskunft des Katalogs (4T-002308, AK3)', () => {
  it('gibt den Lese-Kanälen dieselbe Antwort wie der Überblick (4T-002308)', async () => {
    const fsp = fakeFs(DATEIEN);
    for (const benutzer of ['mstumm', 'gast', 'MStumm']) {
      const cache = createDatabaseCatalogCache();
      const u = await katalogUeberblick({
        sicht: SICHT,
        status: 'ready',
        fsp,
        cache,
        herkunft: als(benutzer),
      });
      const s = await rechteDerSicht({ sicht: SICHT, fsp, herkunft: als(benutzer) });
      expect(s.eigeneRolle).toEqual(u.eigeneRolle);
      for (const eintrag of u.tabellen) expect(s.rechte[eintrag.name]).toEqual(eintrag.rechte);
    }
    const gast = await rechteDerSicht({ sicht: SICHT, fsp, herkunft: als('gast') });
    expect(gast.eigeneRolle).toEqual({
      rolle: 'assistant',
      anmeldename: 'gast',
      quelle: 'vorgabe',
    });
    expect(gast.rechte.Loans).toEqual(NICHTS);
  });

  it('liefert die Rechte einer Tabelle, ohne Sicht null (4T-002308)', async () => {
    const fsp = fakeFs(DATEIEN);
    const p = { sicht: SICHT, fsp, herkunft: als('mstumm') };
    expect(await rechteDerTabelle({ ...p, tabellenPfad: '/db/Loans.md' })).toEqual(ALLES);
    expect(await rechteDerTabelle({ ...p, tabellenPfad: '/db/Fremd.md' })).toBeNull();
    expect(await rechteDerTabelle({ ...p, sicht: null, tabellenPfad: '/db/Loans.md' })).toBeNull();
  });

  it('erlaubt ohne Steckbrief alles und liest den Namen aus der Herkunft (4T-002308)', async () => {
    const ohne = { dbKindsPerFile: new Map([['/db/Library.md', ['table']]]) };
    const s = await rechteDerSicht({ sicht: ohne, fsp: fakeFs(DATEIEN), herkunft: als(null) });
    expect(s).toEqual({
      eigeneRolle: { rolle: null, anmeldename: null, quelle: 'alles' },
      rechte: { Library: ALLES },
    });
    // Ohne Naht gilt die Herkunft des Systems; der Name ist ein Text oder null.
    const echt = await rechteDerSicht({ sicht: ohne, fsp: fakeFs(DATEIEN) });
    expect(
      echt.eigeneRolle.anmeldename === null || typeof echt.eigeneRolle.anmeldename === 'string',
    ).toBe(true);
  });
});
