// @vitest-environment jsdom
// 4T-002517 (Epic 3E-000402): Die Kachel mit Abfrage-Datei (Story 4S-001183,
// V2 und AK5). Geprüft werden:
//   - die geteilte Erkennung der Angabe `abfrage=` (link-scan-dashboard.js),
//     über den Format-Kern und gegen ihn gehalten;
//   - der Verweis-Parser des Bereichs-Index (parse.js) und die Rückverweise am
//     echten Index, dazu die ausgehenden Verweise der offenen Datei;
//   - der Nachzug beim Umbenennen (link-rewrite.js) mit Dokumentname und
//     relativem Pfad, und am Umschreiber der Hauptprozess-Seite mit Vorschau,
//     zwei Dashboards und der Auflösung danach (die reale Konstellation des
//     Tasks ohne Oberfläche);
//   - der gemeinsame Auflöser (ziel-aufloesung.js) an den Angaben der Kachel;
//   - die Anzeige (dashboard-quelle.js): Grundpfad der Abfrage ist die
//     Abfrage-Datei (AK4), Fehler-Kachel mit dem genannten Namen, Neu-Auflösung
//     beim Index-Nachzug.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import './renderer/api-stub.js';

import { parseContent } from '../../src/main/index/parse.js';
import { computeLinkRewrites } from '../../src/shared/link-rewrite.js';
import {
  dashboardVerweisFunde,
  angabeSpanne,
} from '../../src/shared/markdown/link-scan-dashboard.js';
import { dashboardVerweisFunde as ueberLinkScan } from '../../src/shared/markdown/link-scan.js';
import { parseDashboardFence } from '../../src/shared/dashboard/dashboard-core.js';
import { entpackeWert } from '../../src/shared/canvas/marker-grammatik.js';
import { renderDashboardBlock } from '../../src/shared/markdown/dashboard-block.js';
import { createLinkUpdate } from '../../src/main/documents/link-update.js';
import { abfrageDatei } from '../../src/main/index/dashboard-quellen.js';
import { loeseZielDreistufig } from '../../src/main/index/ziel-aufloesung.js';
import {
  backlinksFor,
  releaseRoot,
  rootForActiveFile,
  setBufferOverlay,
  clearAllBufferOverlays,
} from '../../src/main/backlinks.js';
import * as subpages from '../../src/shared/subpages.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../src/i18n/de.json'), 'utf8'));
vi.mock('../../src/renderer/i18n.js', async (original) => ({
  ...(await original()),
  t: (key) => de[key] ?? key,
}));

const { extractOutgoingLinks } =
  await import('../../src/renderer/modules/panels/panel-outgoing.js');
const { bereiteDashboardKachelnVor } =
  await import('../../src/renderer/modules/dashboard/dashboard-view.js');
const { warteAufDashboardQuellen, planeQuellNachzug, OVERLAY_EREIGNIS } =
  await import('../../src/renderer/modules/dashboard/dashboard-quelle.js');
const { waitForFrontmatterQueriesIdle } =
  await import('../../src/renderer/modules/query/frontmatter-query-view.js');

const OWNER = 'test:link-rewrite-dashboard';
const QUELLE = 'C:/bereich/Dashboard.md';
const zeilen = (...z) => z.join('\n');

// Ein Dokument mit einem Dashboard-Block; der Block beginnt in Zeile 3.
function dashboard(...rumpf) {
  return zeilen('# Lage', '', '```perspective-dashboard', ...rumpf, '```', '');
}

let tmpDirs = [];
const openRoots = new Set();

function makeRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dash-quelle-'));
  tmpDirs.push(d);
  return d;
}

function schreibe(root, rel, inhalt) {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

const lies = (p) => fs.readFileSync(p, 'utf8');
const ABFRAGE_TEXT = zeilen('---', 'db-query:', '---', '```perspective-query', 'LIST', '```', '');

async function indexFuer(datei, areaRoot = null) {
  let erg = backlinksFor(datei, OWNER, areaRoot);
  openRoots.add(rootForActiveFile(datei, areaRoot));
  for (let i = 0; i < 500 && erg.status === 'indexing'; i++) {
    await new Promise((r) => setTimeout(r, 10));
    erg = backlinksFor(datei, OWNER, areaRoot);
  }
  return erg;
}

afterEach(() => {
  for (const r of openRoots) releaseRoot(r, OWNER);
  openRoots.clear();
  clearAllBufferOverlays();
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
  document.body.textContent = '';
  vi.useRealTimers();
});

// --- Geteilte Erkennung -----------------------------------------------------------

describe('Erkennung der Angabe abfrage= (link-scan-dashboard.js)', () => {
  it('findet je Kachel mit Abfrage-Datei Zeile, Wert und Spanne, sonst nichts', () => {
    const text = dashboard(
      '!filter status',
      '!zeile',
      '!kachel kennzahl titel="Offen" abfrage="Abfragen/Offen"',
      '!kachel liste abfrage=Erledigt breite=halb',
      '!kachel tabelle',
      'LIST',
    );
    const lines = text.split('\n');
    const funde = dashboardVerweisFunde(lines);
    expect(funde.map((f) => [f.zeilenIndex, f.wert, f.quotiert])).toEqual([
      [5, 'Abfragen/Offen', true],
      [6, 'Erledigt', false],
    ]);
    for (const f of funde) {
      expect(lines[f.zeilenIndex].slice(f.rohStart, f.rohStart + f.rohLen)).toBe(f.rohWert);
      expect(lines[f.zeilenIndex].slice(f.nameStart, f.rohStart)).toBe('abfrage=');
    }
    // Dieselbe Regel über link-scan.js, die Heimat aller Verweis-Erkennungen.
    expect(ueberLinkScan(lines)).toEqual(funde);
  });

  it('wirksam ist das letzte Vorkommen, ein Titel mit «abfrage=» ist keine Angabe', () => {
    const lines = dashboard(
      '!kachel kennzahl titel="x abfrage=Falsch" abfrage=Erste abfrage="Zweite Datei"',
    ).split('\n');
    const [fund] = dashboardVerweisFunde(lines);
    expect(fund.wert).toBe('Zweite Datei');
    expect(fund.rohWert).toBe('"Zweite Datei"');
  });

  it('zählt jede Kachel-Art, aber keinen Block in einem äußeren Zaun und keinen im Kopf-Block', () => {
    const text = zeilen(
      '---',
      'notiz: |',
      '  ```perspective-dashboard',
      '  !kachel liste abfrage=ImKopf',
      '  ```',
      '---',
      '````text',
      '```perspective-dashboard',
      '!kachel liste abfrage=Zitiert',
      '```',
      '````',
      '```perspective-dashboard',
      '!kachel text abfrage=BeiText',
      'Text',
      '!kachel kennzahl abfrage=Doppelt',
      'LIST',
      '```',
    );
    const lines = text.split('\n');
    const funde = dashboardVerweisFunde(lines, 6);
    expect(funde.map((f) => f.wert)).toEqual(['BeiText', 'Doppelt']);
  });

  it('ohne Dashboard-Block entsteht nichts, auch nicht für eine leere Angabe', () => {
    expect(dashboardVerweisFunde(['# Nur Text', '!kachel liste abfrage=X'])).toEqual([]);
    expect(dashboardVerweisFunde(dashboard('!kachel liste abfrage=""').split('\n'))).toEqual([]);
    expect(dashboardVerweisFunde(null)).toEqual([]);
  });

  // Der Wächter der Zusage «keine zweite Grammatik»: Die Spanne liest denselben
  // Wert, den der Format-Kern in `attrs` legt, über eine Tabelle von Zeilen.
  it('die Spanne trifft genau den Wert, den der Format-Kern liest', () => {
    const faelle = [
      '!kachel liste abfrage=A',
      '!kachel liste   abfrage="Mit Leerraum"  titel=t',
      '!kachel liste abfrage="mit \\"Zitat\\" und \\\\"',
      '!kachel liste abfrage=A abfrage=B',
      '!kachel liste titel="abfrage=Nein" abfrage=Ja',
      '!kachel liste "abfrage"=Nein abfrage=Ja',
      '!kachel\tliste\tabfrage=Tab',
    ];
    for (const zeile of faelle) {
      const el = parseDashboardFence(zeile).elemente[0];
      const spanne = angabeSpanne(zeile, 'abfrage');
      expect(entpackeWert(spanne.rohWert)).toBe(el.attrs.abfrage);
      expect(zeile.slice(spanne.rohStart, spanne.rohStart + spanne.rohLen)).toBe(spanne.rohWert);
    }
  });
});

// --- Verweis-Parser des Bereichs-Index ------------------------------------------------

describe('Verweis-Parser: Kachel mit Abfrage-Datei', () => {
  const ohneStelle = ({ zeile: _z, snippet: _s, ...rest }) => rest;

  it('erzeugt einen Treffer an der Kachel-Zeile, wie ein Wiki-Verweis auf dasselbe Ziel', () => {
    const text = dashboard('!kachel kennzahl titel="Offen" abfrage="Abfragen/Offen"');
    const [hit] = parseContent(QUELLE, text).hits;
    expect(hit.zeile).toBe(4);
    expect(hit.snippet).toContain('!kachel kennzahl');
    const [vergleich] = parseContent(QUELLE, 'Siehe [[Abfragen/Offen]].').hits;
    expect(ohneStelle(hit)).toEqual(ohneStelle(vergleich));
  });

  it('ein Ziel, das es nicht gibt, bleibt ein offener Verweis wie im Körper', () => {
    const [hit] = parseContent(QUELLE, dashboard('!kachel liste abfrage=Fehlt')).hits;
    const [koerper] = parseContent(QUELLE, '[[Fehlt]]').hits;
    expect(ohneStelle(hit)).toEqual(ohneStelle(koerper));
  });

  it('relative Unterseiten-Form wird expandiert, ein Ziel @kürzel: zählt nicht', () => {
    const hits = parseContent(
      QUELLE,
      dashboard('!kachel liste abfrage=/Teil', '!kachel liste abfrage="@ab:Fremd"'),
    ).hits;
    expect(hits.map((h) => h.zielBasename)).toEqual([`Dashboard${subpages.SUBPAGE_SEP}Teil`]);
  });

  it('am echten Index: das Dashboard steht unter den Rückverweisen der Abfrage-Datei', async () => {
    const root = makeRoot();
    const ziel = schreibe(root, 'Abfragen/Offen.md', ABFRAGE_TEXT);
    schreibe(root, 'Dashboard.md', dashboard('!kachel liste abfrage="Abfragen/Offen"'));
    const erg = await indexFuer(ziel, root);
    expect(erg.status).toBe('ready');
    const gruppe = erg.results.find((g) => path.basename(g.quelldatei) === 'Dashboard.md');
    expect(gruppe).toBeTruthy();
    expect(gruppe.hits[0].zeile).toBe(4);
  });
});

// --- Ausgehende Verweise der offenen Datei -----------------------------------------------

describe('Ausgehende Verweise: Kachel mit Abfrage-Datei', () => {
  it('erscheint als Einbettung der Abfrage-Datei an der Kachel-Zeile', () => {
    const links = extractOutgoingLinks(
      dashboard('!kachel liste titel="Offen" abfrage="Abfragen/Offen"', '!kachel liste', 'LIST'),
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ type: 'embed', target: 'Abfragen/Offen', line: 4 });
  });
});

// --- Nachzug beim Umbenennen -------------------------------------------------------------

describe('Nachzug der Angabe abfrage= beim Umbenennen (AK3)', () => {
  const umbenennung = (alt, neu, ordner = 'C:/bereich') => ({
    oldBase: alt,
    newBase: neu,
    oldAbs: `${ordner}/${alt}.md`,
    newAbs: `${ordner}/${neu}.md`,
  });

  it('Dokumentname: nur der Wert ändert sich, in der Schreibform des Bestands', () => {
    const text = dashboard(
      '!kachel kennzahl titel="Offen" abfrage="Offen" breite=halb',
      '!kachel liste abfrage=Offen',
      '!kachel liste abfrage=Anderes',
    );
    const erg = computeLinkRewrites(text, {
      renames: [umbenennung('Offen', 'Offene Punkte')],
      contextPath: QUELLE,
    });
    expect(erg.changed).toBe(true);
    expect(erg.newContent).toBe(
      dashboard(
        '!kachel kennzahl titel="Offen" abfrage="Offene Punkte" breite=halb',
        '!kachel liste abfrage="Offene Punkte"',
        '!kachel liste abfrage=Anderes',
      ),
    );
    // Die Vorschau nennt die Zeile und die ganze Kachel-Zeile.
    expect(erg.hits[0]).toEqual({
      zeile: 4,
      alt: '!kachel kennzahl titel="Offen" abfrage="Offen" breite=halb',
      neu: '!kachel kennzahl titel="Offen" abfrage="Offene Punkte" breite=halb',
      typ: 'dashboard-abfrage',
    });
  });

  it('relativer Pfad mit Endung und Unterseiten-Form ziehen nach', () => {
    const text = dashboard(
      '!kachel liste abfrage="Abfragen/Offen.md"',
      '!kachel liste abfrage=/Teil',
    );
    const erg = computeLinkRewrites(text, {
      renames: [
        umbenennung('Offen', 'Neu', 'C:/bereich/Abfragen'),
        umbenennung(`Dashboard${subpages.SUBPAGE_SEP}Teil`, 'Eigenständig'),
      ],
      contextPath: QUELLE,
    });
    expect(erg.newContent).toBe(
      dashboard('!kachel liste abfrage="Abfragen/Neu.md"', '!kachel liste abfrage=Eigenständig'),
    );
  });

  it('CRLF, ein Block im äußeren Zaun und ein Wiki-Verweis im Block bleiben stehen', () => {
    const text = zeilen(
      '````text',
      '```perspective-dashboard',
      '!kachel liste abfrage=Offen',
      '```',
      '````',
      '```perspective-dashboard',
      '!kachel text',
      '[[Offen]]',
      '!kachel liste abfrage=Offen',
      '```',
    ).replace(/\n/g, '\r\n');
    const erg = computeLinkRewrites(text, {
      renames: [umbenennung('Offen', 'Neu')],
      contextPath: QUELLE,
    });
    expect(erg.hits.map((h) => h.zeile)).toEqual([9]);
    const vorher = text.split('\r\n');
    vorher[8] = '!kachel liste abfrage=Neu';
    expect(erg.newContent).toBe(vorher.join('\r\n'));
  });

  it('reale Konstellation: Vorschau, Umbenennen, Quelltext beider Dashboards und Auflösung danach', async () => {
    const root = makeRoot();
    const alt = schreibe(root, 'Abfragen/Offen.md', ABFRAGE_TEXT);
    const per = schreibe(root, 'Übersicht.md', dashboard('!kachel liste abfrage="Offen"'));
    const rel = schreibe(
      root,
      'Abfragen/Lage.md',
      dashboard('!kachel kennzahl titel="Offen" abfrage="Offen.md"'),
    );
    const linkUpdate = createLinkUpdate({
      areaOfWindow: () => ({ rootPath: root }),
      isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
      resolveHistoryFor: async () => ({ effective: false }),
      readPreviousTextFor: async () => null,
      recordMddOnSave: async () => {},
    });
    const neu = path.join(root, 'Abfragen', 'Offene Punkte.md');
    const paare = [{ from: alt, to: neu }];

    const vorschau = await linkUpdate.computeLinkUpdatePreview({}, paare, neu);
    expect(vorschau.map((v) => [path.basename(v.path), v.count]).sort()).toEqual([
      ['Lage.md', 1],
      ['Übersicht.md', 1],
    ]);

    fs.renameSync(alt, neu);
    await linkUpdate.applyLinkUpdatesForRename({}, paare, neu);
    expect(lies(per)).toBe(dashboard('!kachel liste abfrage="Offene Punkte"'));
    expect(lies(rel)).toBe(dashboard('!kachel kennzahl titel="Offen" abfrage="Offene Punkte.md"'));

    // Ergebnis der Kacheln danach: Beide Ziele lösen auf die umbenannte Datei auf.
    await indexFuer(neu, root);
    for (const [doc, ziel] of [
      [per, 'Offene Punkte'],
      [rel, 'Offene Punkte.md'],
    ]) {
      const erg = await abfrageDatei({ basePath: doc, ziel, areaRoot: root });
      expect(erg).toMatchObject({ ok: true, pfad: neu, abfrage: 'LIST' });
    }
  });
});

// --- Gemeinsamer Auflöser ------------------------------------------------------------------

describe('Gemeinsamer Auflöser an den Angaben der Kachel (ziel-aufloesung.js)', () => {
  const grund = (root, basePath, ziel, extra = {}) =>
    loeseZielDreistufig({
      basePath,
      ziel,
      areaRoot: root,
      subpages,
      resolveWikiTargetInIndex: () => null,
      ...extra,
    });

  it('ein Puffer-Stand zählt in Stufe 1 nur mit der Angabe pufferText', async () => {
    const root = makeRoot();
    const doc = schreibe(root, 'Dashboard.md', '');
    const ohne = await grund(root, doc, 'Neu.md');
    expect(ohne).toMatchObject({ ok: false, error: 'not found', indexBereit: false });
    const mit = await grund(root, doc, 'Neu.md', { pufferText: () => 'Text' });
    expect(mit).toEqual({ ok: true, abs: path.join(root, 'Neu.md') });
  });

  it('ein relatives Ziel mit fremder Endung bleibt bei der Kachel ein Markdown-Dokument', async () => {
    const root = makeRoot();
    const doc = schreibe(root, 'Dashboard.md', '');
    const datei = schreibe(root, `Dashboard${subpages.SUBPAGE_SEP}Stand 2026.11.md`, '');
    expect(await grund(root, doc, '/Stand 2026.11', { relativStetsMarkdown: true })).toEqual({
      ok: true,
      abs: datei,
    });
    expect(await grund(root, doc, '/Stand 2026.11')).toMatchObject({ ok: false });
  });

  it('ein Ziel außerhalb der Grenze wird nicht gefunden, ein Ziel @kürzel: nicht aufgelöst', async () => {
    const root = makeRoot();
    const doc = schreibe(root, 'innen/Dashboard.md', '');
    schreibe(root, 'Draußen.md', '');
    const innen = path.join(root, 'innen');
    expect(await grund(innen, doc, '../Draußen.md')).toEqual({
      ok: false,
      error: 'outside area root',
    });
    expect((await grund(innen, doc, '@ab:Fremd')).ok).toBe(false);
  });

  it('ein Treffer der Namens-Suche ohne Markdown-Endung zählt bei der Kachel nicht', async () => {
    const root = makeRoot();
    const doc = schreibe(root, 'Dashboard.md', '');
    const bild = schreibe(root, 'sub/Offen.png', '');
    const index = () => ({ status: 'ready', candidates: [bild] });
    expect(
      await grund(root, doc, 'Offen.md', {
        resolveWikiTargetInIndex: index,
        trefferNurMarkdown: true,
      }),
    ).toMatchObject({ ok: false, error: 'not found', indexBereit: true });
    expect(await grund(root, doc, 'Offen.md', { resolveWikiTargetInIndex: index })).toEqual({
      ok: false,
      error: 'extension not allowed',
    });
  });
});

// --- Anzeige: Kachel mit Abfrage-Datei (AK1, AK2, AK4) ---------------------------------------

describe('Anzeige der Kachel mit Abfrage-Datei (dashboard-quelle.js)', () => {
  const kanal = { antworten: new Map(), aufrufe: [], ergebnis: null };

  function richteKanaeleEin() {
    kanal.aufrufe = [];
    window.api.dashboardAbfrageDatei = async (basePath, ziel) => {
      kanal.aufrufe.push({ art: 'datei', basePath, ziel });
      return kanal.antworten.get(ziel) || { ok: false, code: 'abfrageDateiFehlt', name: ziel };
    };
    window.api.runFrontmatterQuery = async (basePath, query, _lang, params) => {
      kanal.aufrufe.push({ art: 'abfrage', basePath, query, params });
      return { status: 'unavailable' };
    };
  }

  function dashboardIn(rumpf) {
    const host = document.createElement('div');
    host.innerHTML = renderDashboardBlock(rumpf, {
      lineStart: 1,
      lineEnd: 10,
      index: 0,
      L: (key) => key,
      enabled: () => true,
      env: { lang: 'de' },
    });
    document.body.appendChild(host);
    return host;
  }

  async function bereit() {
    await warteAufDashboardQuellen();
    await waitForFrontmatterQueriesIdle();
  }

  it('fragt mit der Abfrage-Datei als Grundpfad: this. meint sie (AK4)', async () => {
    richteKanaeleEin();
    kanal.antworten.set('Abfragen/Offen', {
      ok: true,
      pfad: '/raum/Abfragen/Offen.md',
      abfrage: 'LIST WHERE this.file.name',
      quelle: 'platte',
    });
    const host = dashboardIn(
      '!filter status vorbelegung=offen\n!kachel liste abfrage="Abfragen/Offen"',
    );
    expect(bereiteDashboardKachelnVor(host, '/raum/Dashboard.md')).toBe(1);
    await bereit();
    expect(kanal.aufrufe).toEqual([
      { art: 'datei', basePath: '/raum/Dashboard.md', ziel: 'Abfragen/Offen' },
      {
        art: 'abfrage',
        basePath: '/raum/Abfragen/Offen.md',
        query: 'LIST WHERE this.file.name',
        params: { status: 'offen' },
      },
    ]);
    const el = host.querySelector('[data-dashboard-abfrage]');
    expect(el.classList.contains('perspective-query')).toBe(true);
    expect(el.dataset.fmBase).toBe('/raum/Abfragen/Offen.md');
    expect(el.dataset.fmForm).toBe('liste');
    // Idempotent: ein zweiter Lauf stößt nichts erneut an.
    expect(bereiteDashboardKachelnVor(host, '/raum/Dashboard.md')).toBe(0);
  });

  it('zeigt bei keiner Abfrage-Datei den Hinweis mit dem genannten Namen (AK2)', async () => {
    richteKanaeleEin();
    kanal.antworten.set('Notiz', { ok: false, code: 'keineAbfrageDatei', name: 'Notiz' });
    const host = dashboardIn('!kachel liste abfrage=Notiz\n!kachel liste abfrage=Gibts$&Nicht');
    bereiteDashboardKachelnVor(host, '/raum/Dashboard.md');
    await bereit();
    const [erste, zweite] = host.querySelectorAll('.dashboard-kachel');
    expect(erste.classList.contains('dashboard-kachel-fehler')).toBe(true);
    expect(erste.querySelector('.dashboard-hinweis').textContent).toContain('«Notiz»');
    expect(erste.querySelector('.dashboard-hinweis-zeile').textContent).toContain('1');
    expect(zweite.querySelector('.dashboard-hinweis').textContent).toContain('«Gibts$&Nicht»');
    expect(host.querySelector('.perspective-query')).toBeNull();
    expect(kanal.aufrufe.filter((a) => a.art === 'abfrage')).toEqual([]);
  });

  it('ohne Pfad (ungespeichertes Dokument) der Hinweis der Abfrage-Kacheln ohne Anfrage; ohne Angabe bleibt die Kachel unberührt (Befund B1)', async () => {
    richteKanaeleEin();
    const host = dashboardIn('!kachel liste abfrage=Offen');
    expect(bereiteDashboardKachelnVor(host)).toBe(0);
    expect(host.querySelector('[data-dashboard-quelle-base]')).toBeNull();
    bereiteDashboardKachelnVor(host, null);
    await bereit();
    expect(kanal.aufrufe).toEqual([]);
    // Derselbe Hinweis wie eine Kachel mit Abfrage im Block («erst nach dem
    // Speichern verfügbar»), nicht «nicht zu finden», und keine Fehler-Kachel.
    const el = host.querySelector('[data-dashboard-abfrage]');
    expect(el.querySelector('.perspective-query-status').textContent).toBe(de['query.unavailable']);
    expect(host.querySelector('.dashboard-hinweis')).toBeNull();
    expect(host.querySelector('.dashboard-kachel-fehler')).toBeNull();
    expect(el.classList.contains('perspective-query')).toBe(false);
  });

  it('zeigt eine nicht lesbare Abfrage-Datei mit ihrem eigenen Hinweis (Befund A2)', async () => {
    richteKanaeleEin();
    kanal.antworten.set('Riesig', { ok: false, code: 'abfrageDateiNichtLesbar', name: 'Riesig' });
    const host = dashboardIn('!kachel liste abfrage=Riesig');
    bereiteDashboardKachelnVor(host, '/raum/Dashboard.md');
    await bereit();
    expect(host.querySelector('.dashboard-hinweis').textContent).toContain(
      de['dashboard.hint.abfrageDateiNichtLesbar'].replace('{detail}', 'Riesig'),
    );
    expect(host.querySelector('.dashboard-kachel-fehler')).not.toBeNull();
  });

  it('löst beim Index-Nachzug neu auf: eine geänderte Abfrage-Datei wirkt sofort (AK1)', async () => {
    richteKanaeleEin();
    const antwort = (abfrage) => ({ ok: true, pfad: '/raum/Offen.md', abfrage, quelle: 'platte' });
    kanal.antworten.set('Offen', antwort('LIST'));
    const host = dashboardIn('!kachel liste abfrage=Offen');
    bereiteDashboardKachelnVor(host, '/raum/Dashboard.md');
    await bereit();
    const el = host.querySelector('[data-dashboard-abfrage]');
    expect(el.dataset.fmQuery).toBe('LIST');

    kanal.antworten.set('Offen', antwort('LIST FROM "Neu"'));
    vi.useFakeTimers();
    document.dispatchEvent(new CustomEvent(OVERLAY_EREIGNIS));
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    await bereit();
    expect(el.dataset.fmQuery).toBe('LIST FROM "Neu"');
    expect(kanal.aufrufe.filter((a) => a.art === 'abfrage').map((a) => a.query)).toEqual([
      'LIST',
      'LIST FROM "Neu"',
    ]);

    // Fällt die Datei weg, wird die Kachel zur Fehler-Kachel und kein
    // Abfrage-Container mehr; der Live-Nachzug der Befüllung übergeht sie.
    kanal.antworten.delete('Offen');
    vi.useFakeTimers();
    planeQuellNachzug();
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    await bereit();
    expect(el.classList.contains('perspective-query')).toBe(false);
    expect(el.dataset.fmBase).toBeUndefined();
    expect(el.textContent).toContain('«Offen»');
  });

  it('der Name des Overlay-Ereignisses ist der des Editors', () => {
    const quelle = readFileSync(
      path.join(dir, '../../src/renderer/modules/editor/editor.js'),
      'utf8',
    );
    const m = quelle.match(/export const INDEX_OVERLAY_EVENT = '([^']+)'/);
    expect(m && m[1]).toBe(OVERLAY_EREIGNIS);
  });

  it('der ungespeicherte Stand der Abfrage-Datei gilt im Hauptprozess (Kanal liest den Puffer)', async () => {
    const root = makeRoot();
    const doc = schreibe(root, 'Dashboard.md', dashboard('!kachel liste abfrage=Offen'));
    const ziel = schreibe(root, 'Offen.md', ABFRAGE_TEXT);
    setBufferOverlay(ziel, ABFRAGE_TEXT.replace('LIST', 'TABLE status'));
    const erg = await abfrageDatei({ basePath: doc, ziel: 'Offen', areaRoot: root });
    expect(erg).toMatchObject({ ok: true, abfrage: 'TABLE status', quelle: 'puffer' });
  });
});
