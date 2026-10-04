// 4T-002082 (Epic 3E-000259): Vorlagen-Ausschluss an der Quellen-Ebene der
// Abfrage (Konzept-Entscheidung E6.7, Festlegungen 16 bis 19, F4 Option A).
//
// Geprüft wird in drei Schichten, jede an ihrer echten Stelle:
//   - der Erzeuger aller Ebenen (`frontmatterQueryFor`) auf einem Wegwerf-Bereich
//     mit Vorlagen-Ordner, Unterordner und Präfix-Nachbar: Datei, Block, Aufgabe
//     und Datensatz, die Ausnahme über `FROM` und der Fall ohne Ordner;
//   - Lookup-Feld und Wertevorrat, die denselben Ordner bekommen und dieselben
//     Treffer sehen, samt ihrem Zwischenspeicher bei einem Wechsel des Ordners;
//   - die Auflösung des Ordners je Fenster (`resolveQueryTemplatesFolder`) gegen
//     eine echte Bereichsdatei: Bereich vor global, verknüpfter Bereich ohne
//     Wirkung, Erweiterung aus, kein Ordner gewählt, kein veralteter Stand.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// `perspective-query-records.test.js`. Der Messlauf läuft nur auf Zuruf:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/perspective-query-templates.test.js`.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';
import {
  backlinksFor,
  frontmatterQueryFor,
  lookupTreffer,
  releaseRoot,
  rootForActiveFile,
  werteAusAbfrage,
} from '../../src/main/backlinks.js';
import { displayName } from '../../src/shared/query/result-display.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
// Statisch importiert, damit die Module samt ihren Importen in der Import-Kette
// dieser Prüfdatei stehen (Auswahl des Prüf-Ausschnitts).
import { createTemplateExclusion } from '../../src/main/index/query-templates.js';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import {
  normalizeTemplatesConfig,
  resolveTemplatesConfig,
} from '../../src/main/documents/templates.js';
import mddStore from '../../src/main/documents/mdd-store.js';

const require_ = createRequire(import.meta.url);
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { clearCaches } = require_('../../src/main/index/record-table-read.js');
const lookup = require_('../../src/main/index/profil-lookup.js');
const wertevorrat = require_('../../src/main/index/profil-wertevorrat.js');

// --- Fixtures ---------------------------------------------------------------

// Eine Datenbank-Tabelle mit einer Spalte `title` als Anzeige-Form.
function table(titles) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: title',
    '  display: title',
    '---',
    '',
    '```perspective-records',
    ...titles.flatMap((t, i) => [`|- id="r-${String(i + 1).padStart(5, '0')}"`, `| ${t}`]),
    '```',
    '',
  ].join('\n');
}

function mddWith(blockData) {
  return JSON.stringify({ schemaVersion: 1, history: { anchors: [], packets: [] }, blockData });
}

const BLOCK = { values: { status: 'offen' }, updated: '2026-10-03T10:00:00Z' };

// Ein Dokument mit Eigenschaft, Verweis auf die Start-Datei, Aufgabe und Block.
function note(title, task, anchor) {
  return [
    '---',
    'art: notiz',
    'projekt: "[[Start]]"',
    '---',
    `# ${title}`,
    '',
    `- [ ] ${task}`,
    '',
    `Absatz. ^${anchor}`,
    '',
  ].join('\n');
}

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot(prefix = 'em4me-pqt-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Ohne Bereichs-Wurzel indexiert der Ordner der Datei; mit ihr der Bereich, der
// keine Größen-Grenze kennt (für den Messlauf mit 2000 Dateien, der dafür auch
// länger auf den Aufbau wartet).
async function indexFor(activeFile, areaRoot, versuche = 500) {
  let result = backlinksFor(activeFile, 'pqt', areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < versuche && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, 'pqt', areaRoot);
  }
  expect(result.status).toBe('ready');
  return rootForActiveFile(activeFile, areaRoot);
}

// Der Bereich: eine echte Notiz, zwei Vorlagen (eine im Unterordner), ein
// Präfix-Nachbar `Vorlagen2`, eine echte und eine Vorlagen-Tabelle.
async function bereich() {
  const root = makeRoot();
  const start = write(root, 'Start.md', '# Start\n');
  write(root, 'Projekte/Echt.md', note('Echt', 'Echte Aufgabe', 'e1'));
  write(root, 'Projekte/Echt.mdd', mddWith({ e1: BLOCK }));
  write(root, 'Vorlagen/Besprechung.md', note('Besprechung', 'Vorlagen-Aufgabe', 'v1'));
  write(root, 'Vorlagen/Besprechung.mdd', mddWith({ v1: BLOCK }));
  write(root, 'Vorlagen/Unter/Tief.md', note('Tief', 'Tiefe Aufgabe', 't1'));
  write(root, 'Vorlagen/Unter/Tief.mdd', mddWith({ t1: BLOCK }));
  write(root, 'Vorlagen2/Nachbar.md', note('Nachbar', 'Nachbar-Aufgabe', 'n1'));
  write(root, 'Vorlagen2/Nachbar.mdd', mddWith({ n1: BLOCK }));
  write(root, 'Library.md', table(['Zauberberg']));
  write(root, 'Vorlagen/Buecher.md', table(['Muster-Buch', 'Zweites Muster']));
  const wurzel = await indexFor(start);
  return { root: wurzel, start, vorlagen: path.join(wurzel, 'Vorlagen') };
}

const TASK_ENV = { enabled: true, globalFilter: '', globalQuery: '', statusTypeOf: () => 'TODO' };

// Die Ergebnismenge eines Laufs, geprüft gegen den Format-Vertrag.
function menge(b, abfrage, templatesFolder) {
  const payload = frontmatterQueryFor(
    b.start,
    abfrage,
    undefined,
    TASK_ENV,
    'de-DE',
    templatesFolder,
  );
  expect(validateResultSet(payload.resultSet), abfrage).toEqual([]);
  expect(payload.resultSet.state.queryError, abfrage).toBeFalsy();
  return payload.resultSet;
}

// Anzeige-Namen der Treffer; bei Datensätzen Tabelle und Kennung.
function namen(rs) {
  return rs.rows.map((r) =>
    r.origin.kind === 'record' ? `${r.origin.table}:${r.origin.id}` : displayName(r.origin),
  );
}

beforeEach(() => {
  lookup.zwischenspeicherLeeren();
  wertevorrat.zwischenspeicherLeeren();
});

afterEach(() => {
  vergissAlleDefinitionen();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- Vier Ebenen (AK1) --------------------------------------------------------

describe('Vorlagen sind auf keiner Ebene ein Treffer (AK1)', () => {
  it('Datei-Ebene: Vorlage und Vorlage im Unterordner fallen heraus, der Präfix-Nachbar bleibt', async () => {
    const b = await bereich();
    const abfrage = 'LIST WHERE art = "notiz"';
    expect(namen(menge(b, abfrage, b.vorlagen))).toEqual(['Echt', 'Nachbar']);
    // Ohne Ordner (Erweiterung aus oder keiner gewählt) bleibt alles.
    expect(namen(menge(b, abfrage, null))).toEqual(['Besprechung', 'Echt', 'Nachbar', 'Tief']);
  });

  it('Block-Ebene: Blöcke einer Vorlage fallen heraus', async () => {
    const b = await bereich();
    expect(namen(menge(b, 'LIST BLOCKS', b.vorlagen))).toEqual(['Echt#^e1', 'Nachbar#^n1']);
    expect(namen(menge(b, 'LIST BLOCKS', null))).toHaveLength(4);
  });

  it('Aufgaben-Ebene: Aufgaben einer Vorlage fallen heraus', async () => {
    const b = await bereich();
    const ohne = menge(b, 'LIST TASKS', b.vorlagen);
    const pfade = ohne.rows.map((r) => r.origin.path);
    expect(pfade.some((p) => p.includes(`${path.sep}Vorlagen${path.sep}`))).toBe(false);
    expect(ohne.rows).toHaveLength(2);
    expect(menge(b, 'LIST TASKS', null).rows).toHaveLength(4);
  });

  it('Datensatz-Ebene: eine Tabelle im Vorlagen-Ordner liefert keinen Datensatz', async () => {
    const b = await bereich();
    expect(namen(menge(b, 'LIST RECORDS FROM "Buecher"', b.vorlagen))).toEqual([]);
    expect(namen(menge(b, 'LIST RECORDS FROM "Buecher"', null))).toEqual([
      'Buecher:r-00001',
      'Buecher:r-00002',
    ]);
    // Eine Tabelle außerhalb ist unberührt, auch neben der Vorlagen-Tabelle.
    expect(namen(menge(b, 'LIST RECORDS FROM "Library" OR "Buecher"', b.vorlagen))).toEqual([
      'Library:r-00001',
    ]);
  });

  it('der Ausschluss wirkt vor der Bedingung: auch eine Bedingung, die nur die Vorlage trifft, liefert nichts', async () => {
    const b = await bereich();
    expect(namen(menge(b, 'LIST WHERE file.name = "Besprechung"', b.vorlagen))).toEqual([]);
  });
});

// --- Ausnahme über FROM (AK3) ---------------------------------------------------

describe('Ausnahme: FROM nennt den Vorlagen-Ordner ausdrücklich (AK3, F4 Option A)', () => {
  it('der Ordner selbst gibt alle Vorlagen frei, samt Unterordner', async () => {
    const b = await bereich();
    // `Buecher` ist als Datei ein gewöhnlicher Treffer der Datei-Ebene.
    expect(namen(menge(b, 'LIST FROM "Vorlagen"', b.vorlagen))).toEqual([
      'Besprechung',
      'Buecher',
      'Tief',
    ]);
    expect(namen(menge(b, 'LIST TASKS FROM "Vorlagen"', b.vorlagen))).toHaveLength(2);
    expect(namen(menge(b, 'LIST BLOCKS FROM "Vorlagen"', b.vorlagen))).toEqual([
      'Besprechung#^v1',
      'Tief#^t1',
    ]);
  });

  it('ein Unterordner gibt genau seinen Inhalt frei, nicht die übrigen Vorlagen', async () => {
    const b = await bereich();
    expect(namen(menge(b, 'LIST FROM "Vorlagen/Unter"', b.vorlagen))).toEqual(['Tief']);
    // Über die Bedingung käme Besprechung in Frage, bleibt aber ausgeschlossen.
    const abfrage = 'LIST FROM "Vorlagen/Unter" OR "Projekte" OR "Vorlagen2" WHERE art = "notiz"';
    expect(namen(menge(b, abfrage, b.vorlagen))).toEqual(['Echt', 'Nachbar', 'Tief']);
    expect(
      namen(menge(b, 'LIST FROM "Vorlagen/Unter" OR -"Projekte" WHERE art = "notiz"', b.vorlagen)),
    ).toEqual(['Nachbar', 'Tief']);
  });

  it('in einer Verknüpfung mit OR, AND und doppelter Verneinung gilt die Nennung', async () => {
    const b = await bereich();
    const notiz = ' WHERE art = "notiz"';
    expect(namen(menge(b, `LIST FROM "Projekte" OR "Vorlagen"${notiz}`, b.vorlagen))).toEqual([
      'Besprechung',
      'Echt',
      'Tief',
    ]);
    expect(namen(menge(b, 'LIST FROM ("Vorlagen" AND -"Vorlagen/Unter")', b.vorlagen))).toEqual([
      'Besprechung',
      'Buecher',
    ]);
    expect(namen(menge(b, `LIST FROM -(-"Vorlagen")${notiz}`, b.vorlagen))).toEqual([
      'Besprechung',
      'Tief',
    ]);
  });

  it('keine Nennung: die Wurzel, eine Verneinung, ein Präfix-Nachbar', async () => {
    const b = await bereich();
    expect(namen(menge(b, 'LIST FROM ""', b.vorlagen))).toEqual([
      'Echt',
      'Library',
      'Nachbar',
      'Start',
    ]);
    expect(namen(menge(b, 'LIST FROM -"Projekte"', b.vorlagen))).toEqual([
      'Library',
      'Nachbar',
      'Start',
    ]);
    expect(namen(menge(b, 'LIST FROM -"Vorlagen"', b.vorlagen))).not.toContain('Tief');
    expect(namen(menge(b, 'LIST FROM "Vorlagen2"', b.vorlagen))).toEqual(['Nachbar']);
  });

  it('Datensatz-Ebene: der Pfad durch den Vorlagen-Ordner nennt ihn, der bloße Name nicht', async () => {
    const b = await bereich();
    expect(namen(menge(b, 'LIST RECORDS FROM "Vorlagen/Buecher.md"', b.vorlagen))).toEqual([
      'Buecher:r-00001',
      'Buecher:r-00002',
    ]);
    expect(namen(menge(b, 'LIST RECORDS FROM "Buecher"', b.vorlagen))).toEqual([]);
    // Ein bloßer Name über OR gibt die Tabelle nicht frei, der Pfad daneben schon.
    expect(
      namen(menge(b, 'LIST RECORDS FROM "Buecher" OR "Vorlagen/Buecher.md"', b.vorlagen)),
    ).toHaveLength(2);
  });
});

// --- Prüf-Kern ohne Index -------------------------------------------------------

describe('createTemplateExclusion: Form-Regel am Quellen-Baum', () => {
  const root = path.resolve(os.tmpdir(), 'em4me-pqt-kern');
  const vorlagen = path.join(root, 'Vorlagen');
  const src = (value) => ({ type: 'srcFolder', value });

  it('ohne Ordner kein Ausschluss', () => {
    expect(createTemplateExclusion({ root, templatesFolder: null, source: null })).toBeNull();
    expect(createTemplateExclusion({ root, templatesFolder: '', source: null })).toBeNull();
  });

  it('führende Trenner und Rückwärts-Striche zeigen wie die Ordner-Quelle auf die Wurzel', () => {
    const ex = createTemplateExclusion({
      root,
      templatesFolder: vorlagen,
      source: src('/Vorlagen/'),
    });
    expect(ex.excludes(path.join(vorlagen, 'A.md'))).toBe(false);
    const ex2 = createTemplateExclusion({
      root,
      templatesFolder: vorlagen,
      source: src('Vorlagen\\Unter'),
    });
    expect(ex2.excludes(path.join(vorlagen, 'Unter', 'B.md'))).toBe(false);
    expect(ex2.excludes(path.join(vorlagen, 'A.md'))).toBe(true);
  });

  it('ein globaler Ordner außerhalb der Wurzel schließt nichts im Bereich aus', () => {
    const fremd = path.resolve(os.tmpdir(), 'em4me-pqt-anderswo');
    const ex = createTemplateExclusion({ root, templatesFolder: fremd, source: null });
    expect(ex.excludes(path.join(root, 'Vorlagen', 'A.md'))).toBe(false);
    expect(ex.excludes(path.join(fremd, 'A.md'))).toBe(true);
  });
});

// --- Lookup-Feld und Wertevorrat (AK4) -----------------------------------------

describe('Lookup-Feld und Wertevorrat sehen dieselben Treffer (AK4)', () => {
  it('Wertevorrat ohne Vorlagen, und der Zwischenspeicher folgt dem Ordner', async () => {
    const b = await bereich();
    const abfrage = 'LIST WHERE art = "notiz"';
    const mit = werteAusAbfrage(b.start, b.root, abfrage, null, b.vorlagen);
    expect(mit).toEqual({ status: 'ready', values: ['Echt', 'Nachbar'] });
    // Derselbe Index-Stand, anderer Ordner: kein Rückgriff auf den alten Vorrat.
    const ohne = werteAusAbfrage(b.start, b.root, abfrage, null, null);
    expect(ohne.values).toEqual(['Besprechung', 'Echt', 'Nachbar', 'Tief']);
    expect(werteAusAbfrage(b.start, b.root, abfrage, null, b.vorlagen).values).toEqual([
      'Echt',
      'Nachbar',
    ]);
  });

  it('Lookup-Feld ohne Vorlagen, und der Zwischenspeicher folgt dem Ordner', async () => {
    const b = await bereich();
    const optionen = { relatedField: 'projekt' };
    expect(lookupTreffer(b.start, b.root, optionen, null, b.vorlagen)).toEqual({
      status: 'ready',
      values: ['Echt', 'Nachbar'],
    });
    expect(lookupTreffer(b.start, b.root, optionen, null, null).values).toEqual([
      'Besprechung',
      'Echt',
      'Nachbar',
      'Tief',
    ]);
    // Mit ausdrücklicher Quelle sieht das Feld die Vorlagen wie die Abfrage.
    expect(
      lookupTreffer(
        b.start,
        b.root,
        { ...optionen, from: 'LIST FROM "Vorlagen"' },
        null,
        b.vorlagen,
      ).values,
    ).toEqual(['Besprechung', 'Tief']);
  });
});

// --- Auflösung des Ordners je Fenster (AK2, AK5) ---------------------------------

describe('resolveQueryTemplatesFolder: wirksamer Ordner je Fenster (AK2, AK5, AK6)', () => {
  function bereichsDatei(root, settings) {
    write(root, 'Area_Settings.mdda', JSON.stringify({ schemaVersion: 1, settings }));
  }

  function konfig(werte) {
    const store = { get: (k) => werte[k] };
    return createAreaConfig({
      getStore: () => store,
      areaOfWindow: (win) => (win && win.area) || null,
      markSelfWriting: vi.fn(),
      mddStore,
      attachmentPath: {},
      resolveTemplatesConfig,
      normalizeTemplatesConfig,
    });
  }

  it('Bereich vor global; ohne Bereichs-Sektion gilt der globale Ordner', async () => {
    const root = makeRoot();
    const global = makeRoot('em4me-pqt-global-');
    const win = { area: { rootPath: root } };
    const cfg = konfig({ 'templates.folder': global });
    expect(await cfg.resolveQueryTemplatesFolder(win)).toBe(path.resolve(global));
    bereichsDatei(root, { templates: { folder: 'Vorlagen' } });
    expect(await cfg.resolveQueryTemplatesFolder(win)).toBe(path.join(root, 'Vorlagen'));
    // Ein Fenster ohne Bereich sieht den globalen Ordner.
    expect(await cfg.resolveQueryTemplatesFolder({})).toBe(path.resolve(global));
  });

  it('eine Bereichs-Sektion ohne Ordner übersteuert den globalen vollständig', async () => {
    const root = makeRoot();
    bereichsDatei(root, { templates: { rules: [{ folder: '', template: 'X.md' }] } });
    const cfg = konfig({ 'templates.folder': makeRoot('em4me-pqt-global-') });
    expect(await cfg.resolveQueryTemplatesFolder({ area: { rootPath: root } })).toBeNull();
  });

  it('der Ordner eines verknüpften Bereichs zählt nicht', async () => {
    const root = makeRoot();
    const fremd = makeRoot('em4me-pqt-fremd-');
    bereichsDatei(fremd, { templates: { folder: 'Fremd-Vorlagen' } });
    bereichsDatei(root, {
      templates: { folder: 'Vorlagen' },
      areaLinks: [{ prefix: 'zt', path: fremd, templates: true }],
    });
    const win = { area: { rootPath: root } };
    const cfg = konfig({});
    // Die Vorlagen-Auswahl führt beide Quellen, die Abfrage nur die eigene.
    const kette = (await cfg.resolveTemplatesForWindow(win)).sources.map((q) => q.folder);
    expect(kette).toEqual([path.join(root, 'Vorlagen'), path.join(fremd, 'Fremd-Vorlagen')]);
    expect(await cfg.resolveQueryTemplatesFolder(win)).toBe(path.join(root, 'Vorlagen'));
    // Ohne eigenen Ordner bleibt es bei keinem, auch wenn der verknüpfte einen hat.
    bereichsDatei(root, { areaLinks: [{ prefix: 'zt', path: fremd, templates: true }] });
    expect(await cfg.resolveQueryTemplatesFolder(win)).toBeNull();
  });

  it('Erweiterung «Vorlagen» aus oder kein Ordner gewählt: kein Ordner', async () => {
    const root = makeRoot();
    bereichsDatei(root, { templates: { folder: 'Vorlagen' } });
    const win = { area: { rootPath: root } };
    expect(
      await konfig({ 'extensions.disabled': ['templates'] }).resolveQueryTemplatesFolder(win),
    ).toBeNull();
    expect(
      await konfig({}).resolveQueryTemplatesFolder({ area: { rootPath: makeRoot() } }),
    ).toBeNull();
  });

  it('kein veralteter Stand: ein Wechsel der Bereichsdatei wirkt beim nächsten Lauf', async () => {
    const root = makeRoot();
    const win = { area: { rootPath: root } };
    const cfg = konfig({});
    bereichsDatei(root, { templates: { folder: 'Vorlagen' } });
    expect(await cfg.resolveQueryTemplatesFolder(win)).toBe(path.join(root, 'Vorlagen'));
    bereichsDatei(root, { templates: { folder: 'Muster' } });
    expect(await cfg.resolveQueryTemplatesFolder(win)).toBe(path.join(root, 'Muster'));
  });
});

// --- Messlauf auf Zuruf -----------------------------------------------------------

// Misst eine Abfrage über 2000 Datensätze und eine über 2000 Dateien, je mit
// und ohne Vorlagen-Ordner (warm, Median aus fünf Läufen nach einem
// Aufwärm-Lauf). Läuft nur auf Zuruf und nie unter dem Gate.
function medianMs(fn) {
  fn();
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[2];
}

describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Vorlagen-Ausschluss (4T-002082)', () => {
  it(
    'misst den Ausschluss bei 2000 Datensätzen und 2000 Dateien',
    async () => {
      const root = makeRoot();
      const titles = Array.from({ length: 2000 }, (_, i) => `Titel ${i}`);
      write(root, 'Big.md', table(titles));
      for (let i = 0; i < 2000; i++)
        write(root, `Dateien/D${i}.md`, `---\nn: ${i}\n---\n# D${i}\n`);
      for (let i = 0; i < 20; i++) write(root, `Vorlagen/V${i}.md`, `---\nn: ${i}\n---\n# V${i}\n`);
      const start = write(root, 'Start.md', '# Start\n');
      await indexFor(start, root, 6000);
      const vorlagen = path.join(root, 'Vorlagen');
      const lauf = (abfrage, ordner) => () =>
        frontmatterQueryFor(start, abfrage, root, TASK_ENV, 'de-DE', ordner);
      const zeilen = [];
      for (const abfrage of ['TABLE RECORDS title FROM "Big"', 'LIST WHERE n >= 0']) {
        const ohne = medianMs(lauf(abfrage, null));
        const mit = medianMs(lauf(abfrage, vorlagen));
        zeilen.push(
          `${abfrage}: ohne Ordner ${ohne.toFixed(1)} ms, mit Ordner ${mit.toFixed(1)} ms`,
        );
      }
      // Die Zeilen sind das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
      // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
      // eslint-disable-next-line no-console
      console.log(`Messlauf Vorlagen-Ausschluss:\n${zeilen.join('\n')}`);
    },
    PROZESS_ZEITLIMIT,
  );
});
