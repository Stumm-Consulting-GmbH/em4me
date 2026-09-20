// 4T-001739 (Epic 3E-000308): Die Zahl der geöffneten Markdown-Dokumente eines
// Arbeitsbereichs, gemessen am echten Handler `memory:getViewData`
// (src/main/ipc/memory.js) und nicht an einer Nachbildung.
//
// **Warum am Handler und nicht an einer ausgelagerten Funktion.** Die Zahl
// entsteht auf demselben Weg wie die Fenster-Zahl (E8): aus der
// Arbeitsbereichs-Ablage des Einstellungs-Speichers, durch
// `normalizeSavedWorkspaces` hindurch, im Vertrag der Seite. Jedes Glied dieser
// Kette kann die Zahl verändern — ein weggefilterter Eintrag der
// Normalisierung, ein anderes Feld im Vertrag —, und eine Prüfung der reinen
// Rechnung sähe davon nichts.
//
// **Die Rand-Fälle sind der eigentliche Gegenstand.** Was zählt, ist mit einem
// Satz gesagt; was NICHT zählt, ist die Entscheidung: unbenannte Reiter,
// System-Seiten, Handbuch-Seiten, fremde Dateiarten. Die ersten drei sind in
// der Ablage pfadlos und fallen schon bei der Aufzeichnung heraus
// (`buildPanesSnapshot` im Anzeige-Prozess führt nur Reiter mit Pfad). Diese
// Prüfdatei hält das fest, damit die Zusage nicht unbemerkt an einer fremden
// Bauart hängt: Ändert jene Aufzeichnung ihren Zuschnitt, fällt hier ein Fall.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerMemoryIpc } = require('../../src/main/ipc/memory.js');
const { normalizeSavedWorkspaces } = require('../../src/main/app/session-schema.js');
const {
  MEMORY_STATS_VERSION,
  aktualisiereEintrag,
  erhebe,
  statsPfad,
} = require('../../src/main/memory/memory-stats.js');

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');

// Dieselbe Erkennung, die die Verdrahtung liefert (src/main/main.js). Sie steht
// hier als Kopie ihres Ausdrucks und wird unten gegen die echte Stelle
// gehalten — eine zweite Endungs-Liste im Prüf-Bestand wäre genau der Fehler,
// den AK3 ausschliesst.
function isMarkdownPath(p) {
  if (!p) return false;
  const ext = path.extname(p).toLowerCase();
  return ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd';
}

// Fenster-Schnappschuss der Ablage: `{ bounds, maximized, panes }`, wobei eine
// Pane ihre Reiter als `paths` führt (Format aus buildPanesSnapshot).
function fenster(...pfadListen) {
  return {
    bounds: null,
    maximized: false,
    panes: pfadListen.map((pfade) => ({
      paths: pfade,
      activeIndex: pfade.length > 0 ? 0 : -1,
      tabSettings: pfade.map(() => ({ viewMode: 'rendered' })),
    })),
  };
}

function arbeitsbereich(windows, extra = {}) {
  return {
    id: 'ws-1',
    name: 'Projekt Alpha',
    color: 'green',
    open: false,
    lastOpenedAt: '2026-09-19T08:00:00Z',
    app: { area: null, windows, ...extra },
  };
}

const EINTRAG = {
  kind: 'workspace',
  key: 'workspace:ws-1',
  path: null,
  workspaceId: 'ws-1',
  name: 'Projekt Alpha',
  addedAt: '2026-09-19T08:00:00Z',
};

// Der echte Handler mit genau den Abhängigkeiten, die `memory:getViewData`
// benutzt. Der Kennzahlen-Beschleuniger bleibt unkonfiguriert und liefert
// deshalb einen leeren Stand — genau die Lage eines Arbeitsbereichs, der dort
// keinen Eintrag hat (E8).
function viewData(workspaces, entries = [EINTRAG], deps = {}) {
  const handler = new Map();
  const store = new Map([
    ['workspaces', workspaces],
    ['memoryEntries', entries],
  ]);
  registerMemoryIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: null,
    senderWindow: () => null,
    getStore: () => ({ get: (key) => store.get(key), set: () => {} }),
    broadcast: () => {},
    backlinks: null,
    resolveAreaStartPage: null,
    isMarkdownPath,
    ...deps,
  });
  return handler.get('memory:getViewData')();
}

async function ersterEintrag(workspaces) {
  const antwort = await viewData(workspaces);
  expect(antwort.ok).toBe(true);
  expect(antwort.entries).toHaveLength(1);
  return antwort.entries[0];
}

async function zahl(windows, extra = {}) {
  const eintrag = await ersterEintrag([arbeitsbereich(windows, extra)]);
  return eintrag.workspace.documents;
}

describe('Zählung über mehrere Fenster (4T-001739, AK1, AK2)', () => {
  it('zählt die Markdown-Reiter aller Fenster und aller Spalten zusammen', async () => {
    // AK2: Grundlage sind die GEÖFFNETEN Reiter der Fenster, nicht der
    // Datei-Bestand eines Ordners. Zwei Fenster, im zweiten zwei Spalten.
    const eintrag = await ersterEintrag([
      arbeitsbereich([
        fenster(['C:\\W\\eins.md', 'C:\\W\\zwei.md']),
        fenster(['C:\\W\\drei.md'], ['C:\\W\\vier.md', 'C:\\W\\fuenf.md']),
      ]),
    ]);
    expect(eintrag.workspace.documents).toBe(5);
    // Die Fenster-Zahl bleibt daneben unberührt (AK10).
    expect(eintrag.workspace.windows).toBe(2);
  });

  it('zählt denselben Pfad in zwei Fenstern zweimal', async () => {
    // AK5, festgelegte Regel: Gezählt werden Öffnungen. Die Zahl sagt, wie viel
    // der Arbeitsbereich trägt — das Gegenstück zur Fenster-Zahl —, und nicht,
    // wie viele verschiedene Dateien er berührt.
    expect(await zahl([fenster(['C:\\W\\eins.md']), fenster(['C:\\W\\eins.md'])])).toBe(2);
    // Auch innerhalb eines Fensters, in zwei Spalten.
    expect(await zahl([fenster(['C:\\W\\eins.md'], ['C:\\W\\eins.md'])])).toBe(2);
  });

  it('liefert null für einen Arbeitsbereich ohne Markdown-Dokument', async () => {
    // AK6: die Null ist eine Auskunft und keine fehlende Angabe — sie steht im
    // Vertrag als Zahl, nicht als null.
    const eintrag = await ersterEintrag([arbeitsbereich([fenster([])])]);
    expect(eintrag.workspace.documents).toBe(0);
    expect(eintrag.workspace.documents).not.toBe(null);
  });

  it('liefert null für eine leere Ablage ohne jedes Fenster', async () => {
    // Ein geschlossener Arbeitsbereich, der noch nie ein Fenster hatte.
    const eintrag = await ersterEintrag([arbeitsbereich([])]);
    expect(eintrag.workspace.documents).toBe(0);
    expect(eintrag.workspace.windows).toBe(0);
  });
});

describe('Was nicht zählt (4T-001739, AK3, AK4)', () => {
  it('zählt fremde Dateiarten nicht mit', async () => {
    // AK3: Die Endungs-Erkennung der Anwendung entscheidet; ein PDF, ein Bild
    // und eine Textdatei sind keine Markdown-Dokumente, auch wenn sie als
    // Reiter offen sind.
    expect(
      await zahl([
        fenster([
          'C:\\W\\eins.md',
          'C:\\W\\liste.txt',
          'C:\\W\\bericht.pdf',
          'C:\\W\\bild.png',
          'C:\\W\\daten.csv',
        ]),
      ]),
    ).toBe(1);
  });

  it('nimmt jede Markdown-Endung der gemeinsamen Erkennung an', async () => {
    // Die Gegenrichtung: Nicht nur `.md` zählt, sondern der ganze Satz der
    // einen Erkennung — und zwar ohne Rücksicht auf Groß- und Kleinschreibung.
    expect(
      await zahl([
        fenster([
          'C:\\W\\a.md',
          'C:\\W\\b.markdown',
          'C:\\W\\c.mdown',
          'C:\\W\\d.mkd',
          'C:\\W\\e.MD',
        ]),
      ]),
    ).toBe(5);
  });

  it('verwendet dieselbe Endungs-Erkennung wie die Verdrahtung', async () => {
    // AK3 als Aussage über die QUELLE, nicht über das Ergebnis: Der Handler
    // bekommt die Erkennung von aussen, und die Verdrahtung liefert genau die
    // eine Funktion, die auch Start-Argumente und Bereichs-Scans benutzen. Der
    // Endungs-Satz dieser Prüfdatei ist eine Kopie ihres Ausdrucks und wird
    // hier gegen die echte Stelle gehalten.
    const mainQuelle = fs.readFileSync(path.join(WURZEL, 'src', 'main', 'main.js'), 'utf8');
    expect(mainQuelle).toContain('function isMarkdownPath(p) {');
    expect(mainQuelle).toContain(
      "return ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd';",
    );
    // Und sie steht im Bündel, das an die Kanal-Module geht.
    const deps = mainQuelle.slice(mainQuelle.indexOf('const ipcDeps = {'));
    expect(deps.slice(0, 2000)).toContain('isMarkdownPath,');
  });

  it('zählt keinen pfadlosen Reiter, weil die Ablage keinen führt', async () => {
    // AK4, unbenannte und ungespeicherte Reiter sowie System- und
    // Handbuch-Seiten: Sie sind pfadlos und erreichen die Pane-Aufzeichnung
    // nicht. Gemessen wird hier die Wirkung, falls doch einmal ein pfadloser
    // Wert in der Ablage landet — die Zählung darf ihn nicht mitnehmen und
    // nicht an ihm scheitern.
    expect(await zahl([fenster([null, undefined, '', 'C:\\W\\eins.md'])])).toBe(1);
  });

  it('bleibt bei einer unbrauchbaren Ablage-Form bei null statt zu werfen', async () => {
    // Der Anzeige-Prozess gilt nicht als wohlgeformt, und die Ablage überdauert
    // Versions-Sprünge: ein Fenster ohne Panes, eine Pane ohne Pfad-Liste, ein
    // Fenster, das gar keines ist.
    const eintrag = await ersterEintrag([
      {
        id: 'ws-1',
        name: 'Projekt Alpha',
        color: 'green',
        open: false,
        lastOpenedAt: null,
        app: {
          area: null,
          windows: [{}, { panes: null }, { panes: [{}, { paths: 'keine Liste' }] }],
        },
      },
    ]);
    expect(eintrag.workspace.documents).toBe(0);
  });
});

describe('Herkunft der Zahl: die Arbeitsbereichs-Ablage (4T-001739, AK8, AK9)', () => {
  it('rechnet aus dem abgelegten Stand, ohne laufende Fenster', async () => {
    // AK8, erste Hälfte: Ein GESCHLOSSENER Arbeitsbereich (open: false) liefert
    // seine Zahl. Die Anwendung hat in diesem Lauf kein einziges Fenster, und
    // genau das ist die Lage eines nicht geöffneten Arbeitsbereichs.
    expect(await zahl([fenster(['C:\\W\\eins.md', 'C:\\W\\zwei.md'])])).toBe(2);
  });

  it('liefert für denselben Stand denselben Wert, offen oder geschlossen', async () => {
    // AK8, zweite Hälfte: Der offene Arbeitsbereich wird auf demselben Weg
    // gerechnet — `open` ist für die Zählung ohne Bedeutung, weil der Stand
    // eines offenen Arbeitsbereichs laufend in dieselbe Ablage geschrieben
    // wird. Ein zweiter Weg für den offenen Fall existiert nicht.
    const windows = [fenster(['C:\\W\\eins.md']), fenster(['C:\\W\\zwei.md'])];
    const geschlossen = await ersterEintrag([{ ...arbeitsbereich(windows), open: false }]);
    const offen = await ersterEintrag([{ ...arbeitsbereich(windows), open: true }]);
    expect(geschlossen.workspace.documents).toBe(2);
    expect(offen.workspace.documents).toBe(geschlossen.workspace.documents);
  });

  it('nimmt einen von der Normalisierung weggefilterten Eintrag nicht mit', async () => {
    // Die Kette zählt: `normalizeSavedWorkspaces` wirft einen Eintrag ohne
    // Kennung oder ohne Namen weg. Die Zahl des ÜBRIGEN Eintrags darf davon
    // unberührt bleiben — und der weggefallene darf keine Zeile erzeugen.
    const gut = arbeitsbereich([fenster(['C:\\W\\eins.md'])]);
    const antwort = await viewData([{ name: 'ohne Kennung', app: {} }, gut]);
    expect(normalizeSavedWorkspaces([{ name: 'ohne Kennung', app: {} }, gut])).toHaveLength(1);
    expect(antwort.entries).toHaveLength(1);
    expect(antwort.entries[0].workspace.documents).toBe(1);
  });

  it('meldet den Arbeitsbereich ohne Kennzahlen-Eintrag', async () => {
    // AK9: Im Kennzahlen-Beschleuniger entsteht für einen Arbeitsbereich kein
    // Eintrag (Zug-Entscheidung Z4). Der Vertrag trägt deshalb `stats: null`,
    // und die Dokument-Zahl steht NICHT dort, sondern im workspace-Teil.
    const eintrag = await ersterEintrag([arbeitsbereich([fenster(['C:\\W\\eins.md'])])]);
    expect(eintrag.stats).toBe(null);
    expect(eintrag.workspace.documents).toBe(1);
  });

  it('der Beschleuniger weist einen Arbeitsbereich ab, statt ihn aufzunehmen', async () => {
    // AK9, gegenständlich am Modul statt an einem Quelltext-Ausdruck: Beide
    // Wege des Beschleunigers antworten bei einem Arbeitsbereich mit `null` und
    // schreiben nichts. Das ist die Zug-Entscheidung Z4 als Bauart — und der
    // Grund, warum die Dokument-Zahl aus der Ablage kommt und nicht von dort.
    expect(await erhebe({ kind: 'workspace', path: null })).toBe(null);
    expect(await aktualisiereEintrag({ kind: 'workspace', key: 'workspace:ws-1' })).toBe(null);
    // Ohne konfiguriertes Benutzerprofil hat der Beschleuniger keinen Ort und
    // liefert einen leeren Stand; der Abruf der Seite läuft trotzdem durch.
    expect(statsPfad()).toBe(null);
    expect(MEMORY_STATS_VERSION).toBeGreaterThan(0);
  });
});

describe('Der übrige Vertrag bleibt unverändert (4T-001739, AK10)', () => {
  it('führt Bereich, Buch, Regal, Fenster-Zahl und Zeitpunkt weiter', async () => {
    const eintrag = await ersterEintrag([
      {
        id: 'ws-1',
        name: 'Projekt Alpha',
        color: 'green',
        open: true,
        lastOpenedAt: '2026-09-19T08:00:00Z',
        app: {
          area: { rootPath: 'C:\\W\\Bereich' },
          book: { dir: 'C:\\W\\Buch' },
          shelf: { dir: 'C:\\W\\Regal' },
          windows: [fenster(['C:\\W\\eins.md'])],
        },
      },
    ]);
    expect(eintrag.workspace).toEqual({
      area: 'C:\\W\\Bereich',
      book: 'C:\\W\\Buch',
      shelf: 'C:\\W\\Regal',
      windows: 1,
      documents: 1,
      lastOpenedAt: '2026-09-19T08:00:00Z',
    });
  });

  it('rührt die übrigen Gefäß-Arten nicht an', async () => {
    // Ein Bereichs-Eintrag bekommt keinen workspace-Teil und damit auch keine
    // Dokument-Zahl; die neue Angabe ist an den Arbeitsbereich gebunden.
    const antwort = await viewData(
      [arbeitsbereich([fenster(['C:\\W\\eins.md'])])],
      [
        EINTRAG,
        {
          kind: 'area',
          key: 'c:\\w\\bereich',
          path: 'C:\\W\\Bereich',
          workspaceId: null,
          name: 'Bereich',
          addedAt: '2026-09-19T08:00:00Z',
        },
      ],
    );
    const bereich = antwort.entries.find((e) => e.kind === 'area');
    expect(bereich.workspace).toBe(null);
    expect('documents' in bereich).toBe(false);
  });

  it('erhebt beim Abruf nichts (kein Schreibweg, kein Scan)', async () => {
    // Der Abruf der Seite darf keinen Lauf auslösen; ein Spion auf dem
    // Schreib-Weg des Speichers hält das fest.
    const set = vi.fn();
    const handler = new Map();
    const store = new Map([
      ['workspaces', [arbeitsbereich([fenster(['C:\\W\\eins.md'])])]],
      ['memoryEntries', [EINTRAG]],
    ]);
    registerMemoryIpc((kanal, fn) => handler.set(kanal, fn), {
      dialog: null,
      senderWindow: () => null,
      getStore: () => ({ get: (key) => store.get(key), set }),
      broadcast: () => {},
      backlinks: null,
      resolveAreaStartPage: null,
      isMarkdownPath,
    });
    await handler.get('memory:getViewData')();
    expect(set).not.toHaveBeenCalled();
  });
});
