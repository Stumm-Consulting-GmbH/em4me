// 4T-002309 (Epic 3E-000263, S1, S6, S12; AK1, AK3): Unit-Tests der
// Berechtigung im Regel-Werk der Schreib-Schnittstelle — je Anweisung Tabelle
// und Operation gegen die Erlaubnis-Menge der eigenen Rolle.
//
// **Die Erlaubnis-Menge entsteht über die echte Auflösung** (`legeRollenAus` und
// `loeseRechte`), nicht von Hand: So prüft jeder Fall die Gestalt, die die Naht
// im gebauten Programm hereinreicht. Die Regel selbst liest nichts; der Weg
// über die Naht steht in den letzten Fällen, mit `rechteFuer` als Naht.
//
// **Nicht bestimmbar heißt abweisen** (Entscheidung der Sitzung vom 2026-10-18):
// Die Rechte-Funktion der Verdrahtung (`erzeugeRechteFuer`) wird gegen eine
// nicht bereite Sicht, einen fehlenden, einen nicht lesbaren und einen
// fehlerhaften Steckbrief geprüft, damit «keine Rollen» und «nicht bestimmbar»
// getrennt bleiben.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as backlinks from '../../src/main/backlinks.js';
import {
  berechtigungRegel,
  erzeugeRechteFuer,
  istErlaubt,
  nameDerAngabe,
} from '../../src/main/database/record-regel-berechtigung.js';
import { REGEL_LAGEN, erzeugePruefNaht } from '../../src/main/database/record-regeln.js';
import { loeseRechte } from '../../src/shared/database/rechte.js';
import { legeRollenAus } from '../../src/shared/database/rollen-angaben.js';

const WURZEL = path.resolve('/bereich');
const TABELLEN = ['Library', 'Loans'];

// Die Rollen des Plans, über die Auslegung selbst gebildet.
const { rollen: ROLLEN } = legeRollenAus({
  roles: {
    librarian: 'all',
    assistant: { Library: ['update'], Loans: ['create', 'update', 'delete'] },
    leser: { all: ['update'] },
    gast: { Loans: ['update'] },
  },
});

// Der Kontext der Naht für eine Rolle; `anmeldename` trifft die Zuordnung.
function kontextFuer(weiteres, anweisungen) {
  const { rolle, rechte } = loeseRechte({ rollen: ROLLEN, tabellenNamen: TABELLEN, ...weiteres });
  return { bereichsWurzel: WURZEL, anweisungen, rechte, rolle };
}

function anweisung(art, tabelle = 'Library.md', id = 'r-00001', position = 0) {
  return { position, tabelle, art, id: art === 'create' ? null : id };
}

function codes(antwort) {
  return antwort.befunde.map((b) => b.code);
}

describe('Berechtigung: erlaubt und verboten je Operation (4T-002309, AK1)', () => {
  it('lässt eine erlaubte Operation ohne Befund und ohne Ersetzung durch (4T-002309)', () => {
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ defaultRole: 'assistant' }, [anweisung('update')]),
    );
    expect(antwort).toEqual({ befunde: [], ersetzungen: [] });
  });

  it('meldet je verbotener Operation einen Befund mit Tabelle, Operation und Rolle (4T-002309)', () => {
    const anweisungen = [
      anweisung('create', 'Library.md', null, 0),
      anweisung('update', 'Library.md', 'r-00002', 1),
      anweisung('delete', 'Library.md', 'r-00003', 2),
    ];
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ defaultRole: 'assistant' }, anweisungen),
    );
    expect(codes(antwort)).toEqual([REGEL_LAGEN.nichtErlaubt, REGEL_LAGEN.nichtErlaubt]);
    expect(antwort.befunde).toEqual([
      {
        code: 'regelNichtErlaubt',
        position: 0,
        tabelle: 'Library.md',
        id: null,
        operation: 'create',
        rolle: 'assistant',
      },
      {
        code: 'regelNichtErlaubt',
        position: 2,
        tabelle: 'Library.md',
        id: 'r-00003',
        operation: 'delete',
        rolle: 'assistant',
      },
    ]);
    expect(antwort.ersetzungen).toEqual([]);
  });

  it('prüft jede Tabelle für sich, auch in einem Auftrag über zwei Tabellen (4T-002309)', () => {
    const anweisungen = [
      anweisung('delete', 'Daten/Loans.md', 'r-00004', 0),
      anweisung('delete', 'Library.md', 'r-00001', 1),
    ];
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ defaultRole: 'assistant' }, anweisungen),
    );
    expect(antwort.befunde.map((b) => b.position)).toEqual([1]);
  });

  it('findet die Tabelle ohne Rücksicht auf die Schreibung (4T-002309)', () => {
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ defaultRole: 'assistant' }, [anweisung('update', 'library.md')]),
    );
    expect(antwort.befunde).toEqual([]);
  });
});

describe('Berechtigung: Lagen der Rolle (4T-002309, AK3)', () => {
  it('meldet ohne Rollen nichts, wie bisher (E12.5) (4T-002309)', () => {
    const { rolle, rechte } = loeseRechte({ rollen: {}, tabellenNamen: TABELLEN });
    const antwort = berechtigungRegel.pruefe({
      bereichsWurzel: WURZEL,
      anweisungen: [anweisung('delete'), anweisung('create')],
      rechte,
      rolle,
    });
    expect(rolle).toBeNull();
    expect(antwort.befunde).toEqual([]);
  });

  it('meldet bei Rollen ohne Zuordnung und ohne Vorgabe-Rolle nichts (4T-002309)', () => {
    const antwort = berechtigungRegel.pruefe(kontextFuer({}, [anweisung('delete')]));
    expect(antwort.befunde).toEqual([]);
  });

  it('meldet bei einer Rolle mit all nichts, auch für jede Operation (4T-002309)', () => {
    const anweisungen = ['create', 'update', 'delete'].map((art, i) =>
      anweisung(art, 'Loans.md', `r-0000${i + 1}`, i),
    );
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ users: { mstumm: 'librarian' }, anmeldename: 'mstumm' }, anweisungen),
    );
    expect(antwort.befunde).toEqual([]);
  });

  it('nimmt die Vorgabe-Rolle, wenn der Anmeldename nicht zugeordnet ist (4T-002309)', () => {
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ defaultRole: 'gast', users: { mstumm: 'librarian' }, anmeldename: 'anna' }, [
        anweisung('update'),
      ]),
    );
    expect(antwort.befunde.map((b) => b.rolle)).toEqual(['gast']);
  });

  it('wendet all als Tabellen-Name auf jede Tabelle an (4T-002309)', () => {
    const anweisungen = [
      anweisung('update', 'Library.md', 'r-00001', 0),
      anweisung('update', 'Loans.md', 'r-00002', 1),
      anweisung('delete', 'Loans.md', 'r-00003', 2),
    ];
    const antwort = berechtigungRegel.pruefe(kontextFuer({ defaultRole: 'leser' }, anweisungen));
    expect(antwort.befunde.map((b) => [b.position, b.operation])).toEqual([[2, 'delete']]);
  });

  it('verbietet an einer Tabelle, die die Rolle nicht nennt, jede Operation (4T-002309)', () => {
    const anweisungen = ['create', 'update', 'delete'].map((art, i) =>
      anweisung(art, 'Library.md', `r-0000${i + 1}`, i),
    );
    const antwort = berechtigungRegel.pruefe(kontextFuer({ defaultRole: 'gast' }, anweisungen));
    expect(antwort.befunde.map((b) => b.operation)).toEqual(['create', 'update', 'delete']);
  });

  it('verbietet bei geltender Rolle auch eine Tabelle außerhalb der Erlaubnis-Menge (4T-002309)', () => {
    const antwort = berechtigungRegel.pruefe(
      kontextFuer({ defaultRole: 'leser' }, [anweisung('update', 'Unbekannt.md')]),
    );
    expect(codes(antwort)).toEqual([REGEL_LAGEN.nichtErlaubt]);
  });
});

describe('Berechtigung: die gemeinsame Antwort für Regel und Neuanlage (4T-002309)', () => {
  it('istErlaubt antwortet ohne Rolle mit ja und bei Rolle ohne Menge mit nein (4T-002309)', () => {
    expect(istErlaubt({ rolle: null, rechte: {} }, 'Library', 'delete')).toBe(true);
    expect(istErlaubt({ rolle: 'gast', rechte: null }, 'Library', 'delete')).toBe(false);
    const { rolle, rechte } = loeseRechte({
      rollen: ROLLEN,
      defaultRole: 'gast',
      tabellenNamen: TABELLEN,
    });
    expect(istErlaubt({ rolle, rechte }, 'Loans', 'update')).toBe(true);
    expect(istErlaubt({ rolle, rechte }, 'Loans', 'create')).toBe(false);
  });

  it('nameDerAngabe bildet den Namen wie der Katalog, ohne Ordner und Endung (4T-002309)', () => {
    expect(nameDerAngabe(WURZEL, 'Daten/Library.md')).toBe('Library');
    expect(nameDerAngabe(WURZEL, 'Loans.MD')).toBe('Loans');
  });
});

describe('Berechtigung: Fehler und Vertrag der Naht (4T-002309, B2)', () => {
  const auftrag = {
    bereichsWurzel: WURZEL,
    anweisungen: [anweisung('update')],
    schritte: [],
    bestaende: new Map(),
  };

  it('macht aus einem Fehler beim Bestimmen der Erlaubnis-Menge regelUnerwartet (4T-002309)', async () => {
    let gefragt = 0;
    const naht = erzeugePruefNaht({
      regeln: [berechtigungRegel],
      rechteFuer: async () => {
        gefragt += 1;
        throw new Error('Steckbrief nicht lesbar');
      },
    });
    const antwort = await naht(auftrag);
    expect(gefragt).toBe(1);
    expect(antwort.befunde).toEqual([
      {
        code: REGEL_LAGEN.unerwartet,
        position: null,
        tabelle: null,
        id: null,
        regel: 'berechtigung',
        grund: 'Steckbrief nicht lesbar',
      },
    ]);
  });

  it('weist ab, wenn die Naht ohne rechteFuer gebaut ist, statt durchzulassen (4T-002309)', async () => {
    const antwort = await erzeugePruefNaht({ regeln: [berechtigungRegel] })(auftrag);
    expect(codes(antwort)).toEqual([REGEL_LAGEN.unerwartet]);
    expect(antwort.befunde[0].regel).toBe('berechtigung');
  });

  it('lässt bei bestimmter Menge ohne Rollen durch (E12.5) (4T-002309)', async () => {
    const naht = erzeugePruefNaht({
      regeln: [berechtigungRegel],
      rechteFuer: async () => ({ status: 'ready', rolle: null, rechte: {} }),
    });
    expect((await naht(auftrag)).befunde).toEqual([]);
  });

  it('weist ab, wenn die Erlaubnis-Menge nicht bestimmbar ist, einmal je Auftrag (4T-002309)', async () => {
    const zwei = {
      ...auftrag,
      anweisungen: [anweisung('update'), anweisung('delete', 'Loans.md')],
    };
    for (const [antwort, grund] of [
      [{ status: 'indexing' }, 'indexing'],
      [{ status: 'steckbriefNichtLesbar' }, 'steckbriefNichtLesbar'],
      [{ rolle: null, rechte: {} }, 'antwortUngueltig'],
      [{ status: 'ready', rolle: 'gast' }, 'antwortUngueltig'],
      [null, 'antwortUngueltig'],
    ]) {
      const naht = erzeugePruefNaht({
        regeln: [berechtigungRegel],
        rechteFuer: async () => antwort,
      });
      expect((await naht(zwei)).befunde, grund).toEqual([
        {
          code: REGEL_LAGEN.rechteNichtBestimmbar,
          position: 0,
          tabelle: 'Library.md',
          id: 'r-00001',
          grund,
        },
      ]);
    }
  });

  it('weist eine unbrauchbare Anweisungs-Liste laut ab (4T-002309)', () => {
    expect(() => berechtigungRegel.pruefe({ rechte: {}, rolle: 'gast' })).toThrow(TypeError);
  });
});

// --- Die Rechte-Funktion der Verdrahtung (Entscheidung der Sitzung vom 2026-10-18) ---------

function fakeFs(dateien, unlesbar = []) {
  return {
    async stat(p) {
      if (!(p in dateien)) throw new Error('ENOENT');
      return { mtimeMs: 1, size: Buffer.byteLength(dateien[p], 'utf8') };
    },
    async readFile(p) {
      if (!(p in dateien) || unlesbar.includes(p)) throw new Error('EACCES');
      return dateien[p];
    },
  };
}

const KOPF = '/db/Library.md';
const STECKBRIEF = '/db/Datenbank.md';
const MIT_ROLLEN = [
  '---',
  'db-database:',
  '  roles:',
  '    assistant:',
  '      Library: [update]',
  '  defaultRole: assistant',
  '---',
  '',
].join('\n');

function sichtMit(steckbrief) {
  const marken = [[KOPF, ['table']]];
  if (steckbrief) marken.push([STECKBRIEF, ['database']]);
  return { status: 'ready', sicht: { dbKindsPerFile: new Map(marken) } };
}

function rechteFuerMit(antwort, dateien, unlesbar) {
  return erzeugeRechteFuer({
    tabellenSicht: () => antwort,
    fsp: fakeFs(dateien, unlesbar),
    herkunft: () => ({ benutzer: 'anna', rechner: 'pc' }),
  });
}

describe('Berechtigung: die Rechte-Funktion trennt «keine Rollen» von «nicht bestimmbar» (4T-002309)', () => {
  const dateien = { [KOPF]: '---\ndb-table:\n  fields:\n    - name: titel\n---\n' };

  it('meldet eine nicht bereite Sicht mit ihrem Status (4T-002309)', async () => {
    for (const status of ['indexing', 'oversized', 'unavailable']) {
      const rechteFuer = rechteFuerMit({ status, meta: null, sicht: null }, dateien);
      expect(await rechteFuer('/db')).toEqual({ status });
    }
    expect(await rechteFuerMit(null, dateien)('/db')).toEqual({ status: 'unavailable' });
    expect(await rechteFuerMit({ status: 'ready', sicht: null }, dateien)('/db')).toEqual({
      status: 'sichtFehlt',
    });
  });

  it('gilt ohne Steckbrief als bestimmt ohne Rollen (4T-002309)', async () => {
    const antwort = await rechteFuerMit(sichtMit(false), dateien)('/db');
    expect(antwort).toMatchObject({ status: 'ready', rolle: null });
    expect(antwort.rechte.Library.delete).toBe(true);
  });

  it('löst einen lesbaren Steckbrief mit Rollen auf (4T-002309)', async () => {
    const antwort = await rechteFuerMit(sichtMit(true), { ...dateien, [STECKBRIEF]: MIT_ROLLEN })(
      '/db',
    );
    expect(antwort).toMatchObject({ status: 'ready', rolle: 'assistant' });
    expect(antwort.rechte.Library).toMatchObject({ update: true, delete: false });
  });

  it('meldet einen fehlenden, nicht lesbaren oder fehlerhaften Steckbrief als nicht bestimmbar (4T-002309)', async () => {
    const markiert = sichtMit(true);
    expect(await rechteFuerMit(markiert, dateien)('/db')).toEqual({
      status: 'steckbriefNichtLesbar',
    });
    const mit = { ...dateien, [STECKBRIEF]: MIT_ROLLEN };
    expect(await rechteFuerMit(markiert, mit, [STECKBRIEF])('/db')).toEqual({
      status: 'steckbriefNichtLesbar',
    });
    const kaputt = { ...dateien, [STECKBRIEF]: '---\ndb-database: [\n---\n' };
    expect(await rechteFuerMit(markiert, kaputt)('/db')).toEqual({
      status: 'steckbriefFehlerhaft',
    });
  });

  it('verlangt eine Sicht-Naht (4T-002309)', () => {
    expect(() => erzeugeRechteFuer({ fsp: fakeFs({}) })).toThrow(TypeError);
  });
});

describe('Berechtigung: Befund bei nicht bestimmbarer Menge direkt an der Regel (4T-002309)', () => {
  it('meldet regelRechteNichtBestimmbar an der ersten Anweisung, auch ohne Rolle (4T-002309)', () => {
    const antwort = berechtigungRegel.pruefe({
      bereichsWurzel: WURZEL,
      anweisungen: [anweisung('create', 'Loans.md', null, 3)],
      rechte: null,
      rolle: null,
      rechteNichtBestimmbar: 'oversized',
    });
    expect(antwort).toEqual({
      befunde: [
        {
          code: 'regelRechteNichtBestimmbar',
          position: 3,
          tabelle: 'Loans.md',
          id: null,
          grund: 'oversized',
        },
      ],
      ersetzungen: [],
    });
  });
});

// --- Nachtrag 4T-002310: die Rechte aus dem gespeicherten Stand -----------------------------

describe('Berechtigung: ein ungespeichert unlesbarer Steckbrief öffnet keinen Weg vorbei (4T-002310)', () => {
  it('weist den Auftrag nach dem gespeicherten Steckbrief ab, nicht nach dem Puffer (4T-002310)', async () => {
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-berechtigung-puffer-'));
    const steckbrief = path.join(wurzel, 'Datenbank.md');
    const kopf = path.join(wurzel, 'Library.md');
    fs.writeFileSync(steckbrief, MIT_ROLLEN, 'utf8');
    fs.writeFileSync(kopf, '---\ndb-table:\n  fields:\n    - name: titel\n---\n', 'utf8');
    let lage = backlinks.backlinksFor(kopf, undefined, wurzel);
    for (let i = 0; i < 500 && lage.status === 'indexing'; i++) {
      await new Promise((r) => setTimeout(r, 10));
      lage = backlinks.backlinksFor(kopf, undefined, wurzel);
    }
    const herkunft = () => ({ benutzer: 'anna', rechner: 'pc' });
    // Derselbe Aufbau wie in der Verdrahtung: Sicht des gespeicherten Stands.
    const gespeichert = erzeugeRechteFuer({
      tabellenSicht: (w) => backlinks.datenbankSicht(null, w, { ohnePuffer: true }),
      fsp,
      herkunft,
    });
    const mitPuffer = erzeugeRechteFuer({
      tabellenSicht: (w) => backlinks.datenbankSicht(null, w),
      fsp,
      herkunft,
    });
    const loeschen = {
      bereichsWurzel: wurzel,
      anweisungen: [{ position: 0, tabelle: 'Library.md', art: 'delete', id: 'r-00001' }],
      schritte: [],
      bestaende: new Map(),
    };
    try {
      backlinks.setBufferOverlay(steckbrief, '---\ndb-database: [\n---\n');
      const naht = erzeugePruefNaht({ regeln: [berechtigungRegel], rechteFuer: gespeichert });
      const antwort = await naht(loeschen);
      expect(antwort.befunde).toEqual([
        {
          code: REGEL_LAGEN.nichtErlaubt,
          position: 0,
          tabelle: 'Library.md',
          id: 'r-00001',
          operation: 'delete',
          rolle: 'assistant',
        },
      ]);
      // Gegenprobe: Über die Sicht mit Puffer erschiene die Datenbank ohne Rollen.
      const offen = erzeugePruefNaht({ regeln: [berechtigungRegel], rechteFuer: mitPuffer });
      expect((await offen(loeschen)).befunde).toEqual([]);
    } finally {
      backlinks.clearAllBufferOverlays();
      backlinks.releaseRoot(backlinks.rootForActiveFile(kopf, wurzel));
      fs.rmSync(wurzel, { recursive: true, force: true });
    }
  });
});
