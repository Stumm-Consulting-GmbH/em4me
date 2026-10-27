// 4T-002348 (Epic 3E-000184): Die Datei- und Ordner-Befehle der Workflows im
// Hauptprozess (AK1 des Tasks, Story 4S-001102) an einem Bereich in einem
// temporären Ordner.
//
// Bestands-Lesungen: Die Umbenenn-Strecke ist die ECHTE aus
// `createLinkUpdate` (src/main/documents/link-update.js) mit echter
// Beobachtung (`createFileWatching`), Muster `begleit-dateien-mitziehen.test.js`;
// die Kaskade die ausgezogene aus src/main/documents/rename-cascade.js. Nur
// Fenster, Bücher, Start-Seite und Historie sind Attrappen. Die Randfälle E2
// (fehlender Ziel-Ordner wird angelegt), E3 (mkdir auf vorhandenen Ordner und
// close auf nicht geöffnetes Dokument gelingen) und E4 (move nimmt die
// Unterseiten mit) sind Entscheidungen des Product Owners vom 2026-10-23;
// «vorhandenes Ziel schlägt fehl» die vom 2026-10-22.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowFileSteps } = require('../../src/main/workflows/workflow-file-steps.js');
const { createRenameCascade } = require('../../src/main/documents/rename-cascade.js');
const { createLinkUpdate } = require('../../src/main/documents/link-update.js');
const { createFileWatching } = require('../../src/main/documents/file-watching.js');
const subpages = require('../../src/shared/subpages.js');
const { buildPartBasename, writePartLine } = require('../../src/shared/document-parts.js');
const {
  createWorkflowBindingFollow,
} = require('../../src/main/workflows/workflow-binding-follow.js');
const { workflowCommandId } = require('../../src/shared/workflows/workflow-command-id.js');

// Inhalt und Name eines Teils nach der Bestands-Form (src/shared/document-parts.js).
const teilText = (base, index, rumpf) => writePartLine(rumpf, { index, base }).text;
const teilName = (base, index) => `${buildPartBasename(base, index)}.md`;

const SEP = subpages.SUBPAGE_SEP;
const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);
let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Ein Bereich mit echter Umbenenn-Strecke; liefert Schritt-Ausführung und Helfer.
// 4T-002364: `extra` ergänzt Bezüge der Umbenenn-Strecke (Nachzug der Belegungen).
function welt(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-datei-'));
  tmpDirs.push(root);
  const meldungen = [];
  const broadcast = (kanal, daten) => meldungen.push({ kanal, daten });
  const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
  const lu = createLinkUpdate({
    areaOfWindow: () => ({ rootPath: root }),
    isMarkdownPath,
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    moveWatchEntry,
    mddKeyOf: (p) => p.toLowerCase(),
    mddOpenPackets: new Map(),
    mddSuspendedPaths: new Set(),
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    broadcast,
    books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
    followAreaStartPage: async () => {},
    ...(typeof extra === 'function' ? extra(root) : extra),
  });
  const deps = {
    subpages,
    isMarkdownPath,
    renameSingleFile: lu.renameSingleFile,
    sendBookStateForDirs: async () => {},
    renamesFromPairs: lu.renamesFromPairs,
    applyLinkUpdatesForRename: lu.applyLinkUpdatesForRename,
    broadcast,
  };
  const schritte = createWorkflowFileSteps({ ...deps, cascade: createRenameCascade(deps) });
  const workflowAbs = path.join(root, 'Workflows', 'Ablauf.md');
  const ctx = { root, owner: {}, event: {}, workflowAbs, backlinks: { bufferTextFor: () => null } };
  const schreibe = (rel, inhalt) => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, inhalt, 'utf8');
    return abs;
  };
  const lies = (rel) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
  const da = (rel) => fs.existsSync(path.join(root, ...rel.split('/')));
  const lauf = (keyword, args, extra = {}) =>
    schritte.runFileStep(ctx, { line: 5, keyword, args, source: null, position: null, ...extra });
  return { root, ctx, schreibe, lies, da, lauf, meldungen, workflowAbs };
}

describe('create', () => {
  it('legt eine leere Datei an, fehlende Ordner entstehen mit (E2)', async () => {
    const w = welt();
    const res = await w.lauf('create', ['Journal/2026/10/Tag.md']);
    expect(res.ok).toBe(true);
    expect(res.effect.kind).toBe('created');
    expect(w.lies('Journal/2026/10/Tag.md')).toBe('');
  });

  it('aus dem fertigen Text einer Vorlage', async () => {
    const w = welt();
    await w.lauf('create', ['Neu.md'], {
      source: { kind: 'template', path: 'Tag.md', text: '# T\n' },
    });
    expect(w.lies('Neu.md')).toBe('# T\n');
  });

  it('aus einer Datei, Puffer-Stand vor der Platte', async () => {
    const w = welt();
    const quelle = w.schreibe('Quelle.md', 'Platte');
    w.ctx.backlinks = { bufferTextFor: (p) => (p === quelle ? 'Puffer' : null) };
    await w.lauf('create', ['A.md'], { source: { kind: 'file', path: 'Quelle.md' } });
    expect(w.lies('A.md')).toBe('Puffer');
  });

  it('aus einem Abschnitt des Workflow-Dokuments', async () => {
    const w = welt();
    w.schreibe(
      'Workflows/Ablauf.md',
      '---\nworkflow: true\n---\n## Vorlage\n\nInhalt\n\n## Rest\n',
    );
    await w.lauf('create', ['B.md'], { source: { kind: 'section', name: 'Vorlage' } });
    expect(w.lies('B.md')).toBe('Inhalt');
  });

  it('fehlende Quelle und unbekannter Abschnitt: kein Datei entsteht', async () => {
    const w = welt();
    w.schreibe('Workflows/Ablauf.md', '# Nur\n');
    expect(
      (await w.lauf('create', ['C.md'], { source: { kind: 'file', path: 'Fehlt.md' } })).code,
    ).toBe('sourceMissing');
    expect(
      (await w.lauf('create', ['C.md'], { source: { kind: 'section', name: 'Fehlt' } })).code,
    ).toBe('sectionUnknown');
    expect(w.da('C.md')).toBe(false);
  });

  it('vorhandenes Ziel: Fehlschlag, die Datei bleibt byte-gleich (AK8 der Story)', async () => {
    const w = welt();
    w.schreibe('Da.md', 'alt');
    const res = await w.lauf('create', ['Da.md'], {
      source: { kind: 'template', path: 't', text: 'neu' },
    });
    expect(res).toMatchObject({ ok: false, code: 'targetExists' });
    expect(w.lies('Da.md')).toBe('alt');
  });

  it('außerhalb der Wurzel: outsideArea, nichts entsteht', async () => {
    const w = welt();
    expect((await w.lauf('create', ['../Fremd.md'])).code).toBe('outsideArea');
    expect(fs.existsSync(path.join(path.dirname(w.root), 'Fremd.md'))).toBe(false);
  });
});

describe('mkdir', () => {
  it('legt verschachtelt an; ein vorhandener Ordner gelingt ohne Änderung (E3)', async () => {
    const w = welt();
    expect((await w.lauf('mkdir', ['P/Q/R'])).effect.kind).toBe('folderCreated');
    expect(fs.statSync(path.join(w.root, 'P', 'Q', 'R')).isDirectory()).toBe(true);
    expect((await w.lauf('mkdir', ['P/Q/R'])).effect.kind).toBe('unchanged');
  });

  it('eine Datei gleichen Namens: notAFolder', async () => {
    const w = welt();
    w.schreibe('X', 'Datei');
    expect((await w.lauf('mkdir', ['X'])).code).toBe('notAFolder');
  });
});

describe('rename', () => {
  it('nimmt Unterseiten mit, der neue Name gilt wörtlich mit Endung', async () => {
    const w = welt();
    w.schreibe('Alt.md', '# Alt\n');
    w.schreibe(`Alt${SEP}Kind.md`, 'k');
    const res = await w.lauf('rename', ['Alt.md', 'Neu.md']);
    expect(res.effect.kind).toBe('renamed');
    expect(w.da('Neu.md') && w.da(`Neu${SEP}Kind.md`)).toBe(true);
    expect(w.da('Alt.md') || w.da(`Alt${SEP}Kind.md`)).toBe(false);
  });

  it('nimmt die Teile eines geteilten Dokuments mit und zieht die Zuordnungs-Zeile nach', async () => {
    const w = welt();
    w.schreibe('Kopf.md', teilText('Kopf', 1, 'A\n'));
    w.schreibe(teilName('Kopf', 2), teilText('Kopf', 2, 'B\n'));
    const res = await w.lauf('rename', ['Kopf.md', 'Haupt.md']);
    expect(res.ok).toBe(true);
    expect(w.da(teilName('Haupt', 2))).toBe(true);
    expect(w.lies(teilName('Haupt', 2))).toContain('Haupt');
  });

  it('vorhandenes Ziel: Fehlschlag, beide Dateien unverändert', async () => {
    const w = welt();
    w.schreibe('A.md', 'a');
    w.schreibe('B.md', 'b');
    expect((await w.lauf('rename', ['A.md', 'B.md'])).code).toBe('targetExists');
    expect(w.lies('A.md') + w.lies('B.md')).toBe('ab');
  });

  it('fehlende Quelle: sourceMissing; Name mit Trenner: invalidStep', async () => {
    const w = welt();
    expect((await w.lauf('rename', ['Fehlt.md', 'X.md'])).code).toBe('sourceMissing');
    w.schreibe('A.md', 'a');
    expect((await w.lauf('rename', ['A.md', '../X.md'])).code).toBe('invalidStep');
  });

  it('benennt einen Ordner um und entfernt den leeren Quell-Ordner', async () => {
    const w = welt();
    w.schreibe('Projekt/Notiz.md', 'n');
    w.schreibe('Projekt/Unter/Tief.md', 't');
    const res = await w.lauf('rename', ['Projekt', 'Archiv-Projekt']);
    expect(res.effect.kind).toBe('renamed');
    expect(w.lies('Archiv-Projekt/Unter/Tief.md')).toBe('t');
    expect(w.da('Projekt')).toBe(false);
  });
});

describe('move', () => {
  it('zieht den Verweis in einer anderen Datei nach (AK3 der Story)', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '# Ziel\n');
    w.schreibe('Verweis.md', 'Siehe [Ziel](Ziel.md).\n');
    const res = await w.lauf('move', ['Ziel.md', 'Archiv/2026']);
    expect(res.ok).toBe(true);
    expect(w.da('Archiv/2026/Ziel.md')).toBe(true);
    expect(w.lies('Verweis.md')).toBe('Siehe [Ziel](Archiv/2026/Ziel.md).\n');
    expect(w.meldungen.some((m) => m.kanal === 'linkUpdate:applied')).toBe(true);
  });

  it('nimmt die Unterseiten mit (E4)', async () => {
    const w = welt();
    w.schreibe('Seite.md', 's');
    w.schreibe(`Seite${SEP}Unter.md`, 'u');
    await w.lauf('move', ['Seite.md', 'Ablage']);
    expect(w.da(`Ablage/Seite${SEP}Unter.md`)).toBe(true);
  });

  it('vorhandenes Ziel: Fehlschlag, beide Dateien unverändert', async () => {
    const w = welt();
    w.schreibe('A.md', 'neu');
    w.schreibe('Ablage/A.md', 'alt');
    expect((await w.lauf('move', ['A.md', 'Ablage'])).code).toBe('targetExists');
    expect(w.lies('A.md') + w.lies('Ablage/A.md')).toBe('neualt');
  });

  it('verschiebt einen Ordner samt Inhalt; Ziel-Ordner fehlt und entsteht (E2)', async () => {
    const w = welt();
    w.schreibe('Alt/Eins.md', '1');
    w.schreibe('Verweis.md', '[e](Alt/Eins.md)\n');
    const res = await w.lauf('move', ['Alt', 'Archiv/2026']);
    expect(res.effect.kind).toBe('moved');
    expect(w.lies('Archiv/2026/Alt/Eins.md')).toBe('1');
    expect(w.da('Alt')).toBe(false);
    expect(w.lies('Verweis.md')).toBe('[e](Archiv/2026/Alt/Eins.md)\n');
  });

  it('einen Ordner in sich selbst zu verschieben ist ungültig', async () => {
    const w = welt();
    w.schreibe('O/a.md', 'a');
    expect((await w.lauf('move', ['O', 'O/Unter'])).code).toBe('invalidStep');
  });

  it('ein Ziel, das eine Datei ist: notAFolder', async () => {
    const w = welt();
    w.schreibe('A.md', 'a');
    w.schreibe('Datei', 'x');
    expect((await w.lauf('move', ['A.md', 'Datei'])).code).toBe('notAFolder');
  });
});

describe('copy', () => {
  it('kopiert in einen fehlenden Ordner (E2); der Abschnitt workflow der Begleitdatei reist nicht mit', async () => {
    const w = welt();
    w.schreibe('Vorlagen/Liste.md', '- [ ] a\n');
    const begleit = {
      schemaVersion: 1,
      history: { anchors: [], packets: [] },
      notes: { text: 'Notiz' },
      workflow: { runs: 3 },
    };
    w.schreibe('Vorlagen/Liste.mdd', JSON.stringify(begleit));
    const res = await w.lauf('copy', ['Vorlagen/Liste.md', 'Projekte/Neu/Liste.md']);
    expect(res.effect.kind).toBe('copied');
    expect(w.lies('Projekte/Neu/Liste.md')).toBe('- [ ] a\n');
    const kopie = JSON.parse(w.lies('Projekte/Neu/Liste.mdd'));
    expect(kopie.notes).toEqual({ text: 'Notiz' });
    expect(kopie.workflow).toBeUndefined();
  });

  it('vorhandenes Ziel: Fehlschlag, das Ziel bleibt byte-gleich', async () => {
    const w = welt();
    w.schreibe('A.md', 'neu');
    w.schreibe('B.md', 'alt');
    expect((await w.lauf('copy', ['A.md', 'B.md'])).code).toBe('targetExists');
    expect(w.lies('B.md')).toBe('alt');
  });

  it('ein geteiltes Dokument wird abgewiesen, ein Ordner ebenso', async () => {
    const w = welt();
    w.schreibe('G.md', teilText('G', 1, 'A\n'));
    expect((await w.lauf('copy', ['G.md', 'H.md'])).code).toBe('splitDocument');
    w.schreibe('Ordner/x.md', 'x');
    expect((await w.lauf('copy', ['Ordner', 'Kopie'])).code).toBe('notAFile');
  });
});

describe('open und close', () => {
  it('open auf eine fehlende Datei: fileMissing; auf einen Ordner: notAFile', async () => {
    const w = welt();
    expect((await w.lauf('open', ['Fehlt.md'])).code).toBe('fileMissing');
    w.schreibe('O/a.md', 'a');
    expect((await w.lauf('open', ['O'])).code).toBe('notAFile');
  });

  it('open und close gehen als Handgriff an das startende Fenster', async () => {
    const w = welt();
    const abs = w.schreibe('Da.md', 'x');
    expect(await w.lauf('open', ['Da.md'])).toEqual({
      ok: true,
      window: { action: 'open', path: abs },
    });
    expect(await w.lauf('close', ['Nie-offen.md'])).toEqual({
      ok: true,
      window: { action: 'close', path: path.join(w.root, 'Nie-offen.md') },
    });
  });
});

// 4T-002364 (AK3 des Tasks): Ein Workflow, den ein Workflow-Befehl innerhalb des
// Workflow-Ordners bewegt, nimmt seine Belegung mit — der Weg läuft über
// renameSingleFile der Ordner-Bewegung, je Datei ein Aufruf. Nachzug echt,
// Speicher als Wert-Baum, die Verteilung zeichnet nur auf.
describe('Belegungen eines bewegten Workflows (4T-002364)', () => {
  function weltMitBelegung(werte) {
    const verteilt = [];
    const store = { werte, get: (k) => werte[k], set: (k, v) => (werte[k] = v) };
    const w = welt((root) => {
      const folge = createWorkflowBindingFollow({
        getStore: () => store,
        verteileEinstellung: (k) => verteilt.push(k),
        ordnerJeFenster: async () => [path.join(root, 'Workflows')],
      });
      return { followWorkflowBindings: folge.nachBewegung };
    });
    return { ...w, werte, verteilt };
  }
  const ID = (rel) => workflowCommandId(rel);

  it('move in einen Unterordner nimmt das Kürzel mit', async () => {
    const w = weltMitBelegung({ hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } });
    w.schreibe('Workflows/Hallo.md', '---\nworkflow: true\n---\n');
    const res = await w.lauf('move', ['Workflows/Hallo.md', 'Workflows/Täglich']);
    expect(res.ok).toBe(true);
    expect(w.werte.hotkeys).toEqual({ [ID('Täglich/Hallo.md')]: 'Ctrl+H' });
    expect(w.verteilt).toEqual(['hotkeys']);
  });

  it('rename eines ganzen Unterordners nimmt die Plätze jeder Datei mit', async () => {
    const statusbar = [
      { commandId: ID('Alt/Eins.md'), icon: 'zap', label: null },
      { commandId: ID('Alt/Zwei.md'), icon: 'play', label: 'Zwei' },
    ];
    const w = weltMitBelegung({
      commandPlacement: { statusbar, contextMenu: [], macros: [], hiddenButtons: [] },
    });
    w.schreibe('Workflows/Alt/Eins.md', '1');
    w.schreibe('Workflows/Alt/Zwei.md', '2');
    const res = await w.lauf('rename', ['Workflows/Alt', 'Neu']);
    expect(res.ok).toBe(true);
    expect(w.werte.commandPlacement.statusbar.map((e) => e.commandId)).toEqual([
      ID('Neu/Eins.md'),
      ID('Neu/Zwei.md'),
    ]);
    expect(w.werte.commandPlacement.statusbar[1].label).toBe('Zwei');
  });

  it('move aus dem Workflow-Ordner hinaus lässt die Belegung gespeichert (O1)', async () => {
    const w = weltMitBelegung({ hotkeys: { [ID('Hallo.md')]: 'Ctrl+H' } });
    w.schreibe('Workflows/Hallo.md', 'x');
    expect((await w.lauf('move', ['Workflows/Hallo.md', 'Archiv'])).ok).toBe(true);
    expect(w.werte.hotkeys).toEqual({ [ID('Hallo.md')]: 'Ctrl+H' });
    expect(w.verteilt).toEqual([]);
  });
});
