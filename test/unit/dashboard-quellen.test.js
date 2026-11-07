// 4T-002510 (Epic 3E-000402): Die Dienste des Dashboards im Hauptprozess
// (src/main/index/dashboard-quellen.js), ihre Kanäle (src/main/ipc/dashboard.js),
// die Prüfung der Filter-Werte am Abfrage-Kanal (src/main/ipc/index-views.js)
// und der Brücken-Anteil (src/main/preload-dashboard.js).
//
// Geprüft wird am **echten Index** über ein Temp-Verzeichnis (Muster
// eigenschafts-werte.test.js): Die Werte eines Filters und die Namens-Suche
// der Abfrage-Datei hängen an der Form, in der der Index sie führt, und ein
// gestellter Index ließe genau diese Frage offen. Die Kanäle werden über eine
// Registrier-Funktion gefangen, die die Handler in eine Map legt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  ensureIndexForDemand,
  releaseRoot,
  rootForActiveFile,
  setBufferOverlay,
  clearAllBufferOverlays,
} from '../../src/main/backlinks.js';
import {
  filterWerte,
  abfrageDatei,
  abfrageBloecke,
  ABFRAGE_DATEI_FEHLT,
  ABFRAGE_DATEI_NICHT_LESBAR,
  KEINE_ABFRAGE_DATEI,
  ABFRAGE_DATEI_OHNE_BLOCK,
  ABFRAGE_DATEI_MEHRERE_BLOECKE,
} from '../../src/main/index/dashboard-quellen.js';
import {
  registerDashboardIpc,
  dashboardAn,
  pruefeAbfrageParams,
  MAX_PARAMS,
  MAX_PARAM_WERT,
} from '../../src/main/ipc/dashboard.js';
import { registerIndexViewsIpc } from '../../src/main/ipc/index-views.js';
import { dashboardBruecke } from '../../src/main/preload-dashboard.js';
import { setzeDatensatzErfassung } from '../../src/main/index/index-schalter.js';

const OWNER = 'test:dashboard-quellen';
const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dashquellen-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile, OWNER, null);
  openRoots.add(rootForActiveFile(activeFile, null));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, OWNER, null);
  }
  return result;
}

const ABFRAGE = '```perspective-query\nLIST FROM "Projekte"\n```';

function abfrageText(koerper, kopf = 'db-query:') {
  return `---\n${kopf}\n---\n${koerper}\n`;
}

// Ein Bereich mit Status-Werten, einer Liste, einer Vorlage und drei
// Abfrage-Dateien je Fehler-Art.
async function bereich() {
  const root = makeRoot();
  const start = write(root, 'Start.md', 'Dashboard.');
  write(root, 'A.md', '---\nstatus: offen\n---\nText.');
  write(root, 'B.md', '---\nstatus: [erledigt, Offen, wartet]\n---\nText.');
  write(root, 'C.md', '---\nprioritaet: hoch\n---\nText.');
  write(root, 'Vorlagen/V.md', '---\nstatus: vorlagenwert\n---\nText.');
  write(root, 'Abfragen/Offene.md', abfrageText(`Einleitung.\n\n${ABFRAGE}`));
  write(root, 'Abfragen/Ohne.md', abfrageText('Kein Block.'));
  write(root, 'Abfragen/Zwei.md', abfrageText(`${ABFRAGE}\n\n${ABFRAGE}`));
  write(root, 'Abfragen/Gewoehnlich.md', `Ohne Marke.\n\n${ABFRAGE}\n`);
  await indexFor(start);
  return { root, start };
}

afterEach(() => {
  clearAllBufferOverlays();
  vi.useFakeTimers();
  for (const root of openRoots) {
    releaseRoot(root, OWNER);
    releaseRoot(root, '7:demand');
  }
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

describe('filterWerte (AK1)', () => {
  it('liefert Einzel- und Listen-Werte je Element, entdoppelt und geordnet', async () => {
    const { start } = await bereich();
    const r = filterWerte(start, 'Status', null, null);
    expect(r.status).toBe('ready');
    expect(r.values).toEqual(['erledigt', 'offen', 'vorlagenwert', 'wartet']);
  });

  it('lässt aus, was im Vorlagen-Ordner liegt', async () => {
    const { root, start } = await bereich();
    const r = filterWerte(start, 'status', null, path.join(root, 'Vorlagen'));
    expect(r.values).toEqual(['erledigt', 'offen', 'wartet']);
  });

  it('eine im Suchraum nicht vorhandene Eigenschaft ergibt eine leere Menge ohne Fehler', async () => {
    const { start } = await bereich();
    const r = filterWerte(start, 'gibtesnicht', null, null);
    expect(r).toMatchObject({ status: 'ready', values: [] });
  });

  it('sieht den ungespeicherten Stand einer geöffneten Datei', async () => {
    const { root, start } = await bereich();
    setBufferOverlay(path.join(root, 'C.md'), '---\nstatus: neu\n---\nText.');
    expect(filterWerte(start, 'status', null, null).values).toContain('neu');
  });
});

describe('abfrageDatei (AK2, AK3)', () => {
  it('liefert für eine gültige Abfrage-Datei den einen Block und den Pfad, relativ und über den Namen', async () => {
    const { root, start } = await bereich();
    const erwartet = path.join(root, 'Abfragen', 'Offene.md');
    for (const ziel of ['Abfragen/Offene', 'Offene', 'Abfragen/Offene.md']) {
      const r = await abfrageDatei({ basePath: start, ziel, areaRoot: null });
      expect(r).toEqual({
        ok: true,
        pfad: erwartet,
        abfrage: 'LIST FROM "Projekte"',
        quelle: 'platte',
      });
    }
  });

  it('meldet jeden der vier Fehlerfälle mit seinem Code und dem genannten Namen', async () => {
    const { start } = await bereich();
    const fall = (ziel) => abfrageDatei({ basePath: start, ziel, areaRoot: null });
    expect(await fall('Fehlt')).toMatchObject({
      ok: false,
      code: ABFRAGE_DATEI_FEHLT,
      name: 'Fehlt',
    });
    expect(await fall('Gewoehnlich')).toEqual({
      ok: false,
      code: KEINE_ABFRAGE_DATEI,
      name: 'Gewoehnlich',
    });
    expect(await fall('Ohne')).toEqual({ ok: false, code: ABFRAGE_DATEI_OHNE_BLOCK, name: 'Ohne' });
    expect(await fall('Zwei')).toEqual({
      ok: false,
      code: ABFRAGE_DATEI_MEHRERE_BLOECKE,
      name: 'Zwei',
    });
  });

  it('erkennt die Marke auch bei ausgeschalteter Datenbank (Befund 4 der Konzept-Stufe)', async () => {
    // Der Index wird bei ruhendem Datensatz-Bestand aufgebaut, wie es das
    // Ausschalten der Datenbank bewirkt; die Marke kommt aus dem Text der Datei.
    setzeDatensatzErfassung(false);
    try {
      const { start } = await bereich();
      const r = await abfrageDatei({ basePath: start, ziel: 'Offene', areaRoot: null });
      expect(r).toMatchObject({ ok: true, abfrage: 'LIST FROM "Projekte"' });
      expect(await abfrageDatei({ basePath: start, ziel: 'Gewoehnlich', areaRoot: null })).toEqual({
        ok: false,
        code: KEINE_ABFRAGE_DATEI,
        name: 'Gewoehnlich',
      });
    } finally {
      setzeDatensatzErfassung(true);
    }
  });

  it('ein Ziel außerhalb der Grenze ist nicht gefunden und wird nicht gelesen', async () => {
    const { root } = await bereich();
    const draussen = makeRoot();
    write(draussen, 'Fremd.md', abfrageText(ABFRAGE));
    const unten = write(root, 'Unter/Dash.md', 'Dashboard.');
    const rel = path.relative(path.dirname(unten), path.join(draussen, 'Fremd.md'));
    const r = await abfrageDatei({ basePath: unten, ziel: rel, areaRoot: root });
    expect(r).toMatchObject({ ok: false, code: ABFRAGE_DATEI_FEHLT });
    expect(r).not.toHaveProperty('abfrage');
  });

  it('eine gefundene, aber zu große Abfrage-Datei ist nicht lesbar statt nicht zu finden (Befund A2)', async () => {
    const { start } = await bereich();
    const r = await abfrageDatei({ basePath: start, ziel: 'Offene', areaRoot: null, maxBytes: 4 });
    expect(r).toEqual({ ok: false, code: ABFRAGE_DATEI_NICHT_LESBAR, name: 'Offene' });
    expect(ABFRAGE_DATEI_NICHT_LESBAR).toBe('abfrageDateiNichtLesbar');
  });

  it('eine zwischen Auflösung und Lesen gelöschte Abfrage-Datei fehlt und ist nicht «nicht lesbar» (Zweitblick Runde 2)', async () => {
    // Stufe 3 der Auflösung liefert den Treffer aus dem Index ohne
    // Existenz-Prüfung; erst das Lesen stößt auf ENOENT.
    const { root, start } = await bereich();
    fs.rmSync(path.join(root, 'Abfragen', 'Offene.md'));
    const r = await abfrageDatei({ basePath: start, ziel: 'Offene', areaRoot: null });
    expect(r).toMatchObject({ ok: false, code: ABFRAGE_DATEI_FEHLT, name: 'Offene' });
    expect(r).not.toHaveProperty('abfrage');
  });

  it('der ungespeicherte Stand der Abfrage-Datei gilt (AK3)', async () => {
    const { root, start } = await bereich();
    const datei = path.join(root, 'Abfragen', 'Ohne.md');
    setBufferOverlay(datei, abfrageText('```perspective-query\nTABLE status\n```'));
    const r = await abfrageDatei({ basePath: start, ziel: 'Abfragen/Ohne', areaRoot: null });
    expect(r).toMatchObject({ ok: true, abfrage: 'TABLE status', quelle: 'puffer' });
  });

  it('zählt nur Blöcke der obersten Ebene, ein zitierter Block zählt nicht', () => {
    const text = ['````markdown', ABFRAGE, '````', '', ABFRAGE].join('\n');
    expect(abfrageBloecke(text)).toEqual(['LIST FROM "Projekte"']);
  });
});

// --- Kanäle ------------------------------------------------------------------------

function kanaele(register, deps) {
  const handler = new Map();
  register((kanal, fn) => handler.set(kanal, fn), deps);
  return handler;
}

function dashboardDeps({ areaRoot = null, aus = [] } = {}) {
  return {
    senderWindow: () => null,
    areaRootForEvent: () => areaRoot,
    getStore: () => ({ get: (k) => (k === 'extensions.disabled' ? aus : null) }),
    backlinks: { ensureIndexForDemand },
    resolveQueryTemplatesFolder: async () => null,
    MAX_EMBED_BYTES: 5 * 1024 * 1024,
  };
}

const EVENT = { sender: { id: 7 } };

describe('Kanäle des Dashboards (AK4)', () => {
  it('liefern bei eingeschaltetem Schalter die Werte und die Abfrage', async () => {
    const { start } = await bereich();
    const h = kanaele(registerDashboardIpc, dashboardDeps());
    const werte = await h.get('dashboard:filterWerte')(EVENT, {
      filePath: start,
      eigenschaft: 'status',
    });
    expect(werte.values).toContain('wartet');
    const datei = await h.get('dashboard:abfrageDatei')(EVENT, {
      basePath: start,
      ziel: 'Offene',
    });
    expect(datei).toMatchObject({ ok: true, abfrage: 'LIST FROM "Projekte"' });
  });

  it('weisen einen Aufruf bei ausgeschaltetem Schalter ab', async () => {
    const { start } = await bereich();
    const h = kanaele(registerDashboardIpc, dashboardDeps({ aus: ['dashboard'] }));
    const abgewiesen = { ok: false, code: 'abgewiesen' };
    expect(
      await h.get('dashboard:filterWerte')(EVENT, { filePath: start, eigenschaft: 'status' }),
    ).toEqual(abgewiesen);
    expect(
      await h.get('dashboard:abfrageDatei')(EVENT, { basePath: start, ziel: 'Offene' }),
    ).toEqual(abgewiesen);
  });

  // 4T-002513: Seit der Registrierung trägt die Registry den Schalter allein;
  // die Zusatz-Prüfung der rohen Liste ist zurückgebaut. Ohne Abhängigkeit:
  // Ein ausgeschaltetes Abfrage-Diagramm lässt das Dashboard an.
  it('lesen den Schalter aus der Registry', () => {
    const store = (aus) => ({ get: () => aus });
    expect(dashboardAn(store(['dashboard']))).toBe(false);
    expect(dashboardAn(store(['query-chart', 'perspective-datatable']))).toBe(true);
    expect(dashboardAn(store([]))).toBe(true);
    expect(dashboardAn(null)).toBe(true);
  });

  it('weisen einen Pfad außerhalb des Bereichs ohne Inhalt ab', async () => {
    const { start } = await bereich();
    const anderer = makeRoot();
    const h = kanaele(registerDashboardIpc, dashboardDeps({ areaRoot: anderer }));
    const abgewiesen = { ok: false, code: 'abgewiesen' };
    expect(
      await h.get('dashboard:filterWerte')(EVENT, { filePath: start, eigenschaft: 'status' }),
    ).toEqual(abgewiesen);
    expect(
      await h.get('dashboard:abfrageDatei')(EVENT, { basePath: start, ziel: 'Offene' }),
    ).toEqual(abgewiesen);
  });

  it('weisen fehlgeformte Parameter ab', async () => {
    const h = kanaele(registerDashboardIpc, dashboardDeps());
    const fw = h.get('dashboard:filterWerte');
    const ad = h.get('dashboard:abfrageDatei');
    const abgewiesen = { ok: false, code: 'abgewiesen' };
    expect(await fw(EVENT, null)).toEqual(abgewiesen);
    expect(await fw(EVENT, { filePath: 'relativ.md', eigenschaft: 'status' })).toEqual(abgewiesen);
    expect(await fw(EVENT, { filePath: 42, eigenschaft: 'status' })).toEqual(abgewiesen);
    expect(
      await fw(EVENT, { filePath: path.resolve('x.md'), eigenschaft: 'x'.repeat(201) }),
    ).toEqual(abgewiesen);
    expect(await ad(EVENT, { basePath: path.resolve('x.md'), ziel: '' })).toEqual(abgewiesen);
    expect(await ad(EVENT, { basePath: path.resolve('x.md'), ziel: ['a'] })).toEqual(abgewiesen);
  });
});

describe('Filter-Werte am Abfrage-Kanal (AK4)', () => {
  it('pruefeAbfrageParams: gültig sind fehlende Werte und ein einfaches Objekt in den Grenzen', () => {
    expect(pruefeAbfrageParams(undefined)).toBe(true);
    expect(pruefeAbfrageParams({})).toBe(true);
    expect(pruefeAbfrageParams({ status: 'offen', prio: null })).toBe(true);
    const zwanzig = Object.fromEntries(
      Array.from({ length: MAX_PARAMS }, (_, i) => [`f${i}`, 'x']),
    );
    expect(pruefeAbfrageParams(zwanzig)).toBe(true);
    expect(pruefeAbfrageParams({ s: 'x'.repeat(MAX_PARAM_WERT) })).toBe(true);
  });

  it('pruefeAbfrageParams: zu viele Namen, zu langer Wert, falscher Typ', () => {
    const einundzwanzig = Object.fromEntries(
      Array.from({ length: MAX_PARAMS + 1 }, (_, i) => [`f${i}`, 'x']),
    );
    expect(pruefeAbfrageParams(einundzwanzig)).toBe(false);
    expect(pruefeAbfrageParams({ s: 'x'.repeat(MAX_PARAM_WERT + 1) })).toBe(false);
    expect(pruefeAbfrageParams({ s: 3 })).toBe(false);
    expect(pruefeAbfrageParams({ s: ['a'] })).toBe(false);
    expect(pruefeAbfrageParams(null)).toBe(false);
    expect(pruefeAbfrageParams(['a'])).toBe(false);
    expect(pruefeAbfrageParams('status=offen')).toBe(false);
    expect(pruefeAbfrageParams(new Map())).toBe(false);
  });

  function abfrageKanal() {
    const aufrufe = [];
    const backlinks = {
      ensureIndexForDemand: () => {},
      frontmatterQueryFor: (...args) => {
        aufrufe.push(args);
        return { resultSet: 'gelaufen' };
      },
    };
    const h = kanaele(registerIndexViewsIpc, {
      senderWindow: () => null,
      areaOfWindow: () => null,
      areaRootForEvent: () => null,
      getStore: () => null,
      backlinks,
      resolveQueryTemplatesFolder: async () => null,
    });
    return { lauf: h.get('frontmatterQuery:run'), aufrufe };
  }

  it('frontmatterQuery:run reicht gültige Werte unverändert weiter', async () => {
    const { lauf, aufrufe } = abfrageKanal();
    const werte = { status: 'offen', prio: null };
    const r = await lauf(EVENT, { filePath: '/x.md', query: 'LIST', lang: 'de', params: werte });
    expect(r).toEqual({ resultSet: 'gelaufen' });
    expect(aufrufe[0][6]).toEqual({ status: 'offen', prio: null });
    // Ohne Werte bleibt der Aufruf, wie er war.
    await lauf(EVENT, { filePath: '/x.md', query: 'LIST' });
    expect(aufrufe[1][6]).toBeUndefined();
  });

  it('frontmatterQuery:run weist ungültige Werte ohne Lauf ab', async () => {
    const { lauf, aufrufe } = abfrageKanal();
    const r = await lauf(EVENT, { filePath: '/x.md', query: 'LIST', params: { s: 3 } });
    expect(r.resultSet.state.status).toBe('error');
    expect(aufrufe).toHaveLength(0);
  });
});

describe('Brücke des Dashboards', () => {
  it('bindet die drei Aufrufe an ihre Kanäle, Werte nur, wenn sie da sind', () => {
    const invoke = vi.fn();
    const b = dashboardBruecke({ invoke });
    expect(Object.keys(b)).toEqual([
      'runFrontmatterQuery',
      'dashboardFilterWerte',
      'dashboardAbfrageDatei',
    ]);
    b.runFrontmatterQuery('/a.md', 'LIST', 'de');
    b.runFrontmatterQuery('/a.md', null, 'de', { s: null });
    b.dashboardFilterWerte('/a.md', 'status');
    b.dashboardAbfrageDatei('/a.md', 'Offene');
    expect(invoke.mock.calls).toEqual([
      ['frontmatterQuery:run', { filePath: '/a.md', query: 'LIST', lang: 'de' }],
      ['frontmatterQuery:run', { filePath: '/a.md', query: '', lang: 'de', params: { s: null } }],
      ['dashboard:filterWerte', { filePath: '/a.md', eigenschaft: 'status' }],
      ['dashboard:abfrageDatei', { basePath: '/a.md', ziel: 'Offene' }],
    ]);
  });
});
