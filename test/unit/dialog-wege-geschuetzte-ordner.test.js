// 4T-002827 (Epic 3E-000416): Die sieben Wege, die nach einem eigenen
// Datei-Dialog selbst schreiben oder anlegen, weisen ein Ziel in den
// geschützten Ordnern ab (Entscheidung V5, Antwort a).
//
// Geprüft wird an der realen Konstellation: die echte Prüfung der
// Anmelde-Stelle (`createChannelGuard`) über die echte Liste der geschützten
// Ordner eines Wegwerf-Profils, die echten Handler und ein Dialog-Ersatz, der
// nacheinander die Wahl des Anwenders liefert und danach abbricht. Je Weg
// steht ein Fall «abgewiesen» und, wo der Weg ohne Fenster-Verwaltung zu Ende
// läuft, die Gegenprobe «frei».
//
// Dazu der Wächter: Jede Stelle in `src/main`, die einen Datei-Dialog öffnet,
// steht in der Tafel unten, entweder als geprüfter Weg oder mit dem Grund,
// warum sie selbst nichts schreibt. Ein neuer Dialog ändert die Zahl der
// Stellen seiner Datei, und der Wächter verlangt seine Einordnung.
import { describe, it, expect, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

const require = createRequire(import.meta.url);
// Der Wächter liest den Bestand unter src/main im Rumpf seiner Fälle.
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createChannelGuard } = require('../../src/main/ipc/channel-guard.js');
const { resolveProgramList } = require('../../src/main/grants/binding-grants.js');
const {
  DIALOG_WEGE,
  weiseGeschuetztesZielAb,
} = require('../../src/main/ipc/protected-dialog-target.js');
const { registerFilesIpc } = require('../../src/main/ipc/files.js');
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');
const { registerCanvasImportIpc } = require('../../src/main/ipc/canvas-import.js');
const { registerLocalesIpc } = require('../../src/main/ipc/locales.js');
const { createBookApps } = require('../../src/main/books/book-apps.js');
const { createShelfApps } = require('../../src/main/books/shelf-apps.js');

const DE = {
  ...require('../../src/i18n/fragments/de/area.json'),
  ...require('../../src/i18n/fragments/de/canvas.json'),
};
const t = (_win, key) => DE[key] || key;
const WURZEL = path.resolve(__dirname, '..', '..');

// Wegwerf-Profil: Programm-Ordner, Nutzerdaten (Einstellungs-Ordner), ein
// Heimat-Ordner und ein Ordner außerhalb.
const BASE = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dialogwege-')));
const PROGRAM = path.join(BASE, 'Programm');
const DATA = path.join(BASE, 'Daten');
const HOME = path.join(BASE, 'Heim');
const OUTSIDE = path.join(BASE, 'Draussen');
for (const dir of [PROGRAM, path.join(DATA, 'locales'), HOME, OUTSIDE]) {
  fs.mkdirSync(dir, { recursive: true });
}
const START = {
  execPath: path.join(PROGRAM, 'EM4me.exe'),
  userDataFolder: DATA,
  portableMode: { portabel: false, datenOrdner: null },
};
// Beide geschützten Orte: der Ordner des Programms und der Einstellungs-Ordner.
const GESCHUETZT = [
  ['Programm-Ordner', PROGRAM],
  ['Einstellungs-Ordner', DATA],
];

afterAll(() => {
  try {
    fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
});

function pruefung() {
  const guard = createChannelGuard({
    protectedFolders: resolveProgramList(START),
    areaRootOf: () => null,
    warn: vi.fn(),
  });
  return guard.checkTarget;
}

// Dialog-Ersatz: liefert nacheinander die Ziele aus `wahl`, danach Abbruch.
function dialogMit(wahl) {
  const offen = [...wahl];
  const d = {
    aufrufe: [],
    meldungen: [],
    showSaveDialog: async (_win, optionen) => {
      d.aufrufe.push(optionen);
      const ziel = offen.shift();
      return ziel ? { canceled: false, filePath: ziel } : { canceled: true };
    },
    showOpenDialog: async (_win, optionen) => {
      d.aufrufe.push(optionen);
      const ziel = offen.shift();
      return ziel ? { canceled: false, filePaths: [ziel] } : { canceled: true, filePaths: [] };
    },
    showMessageBox: async (_win, optionen) => {
      d.meldungen.push(optionen);
      return { response: 0 };
    },
  };
  return d;
}

function erwarteSchutzMeldung(d, ziel) {
  const schutz = d.meldungen.filter((m) => m.type === 'warning');
  expect(schutz).toHaveLength(1);
  expect(schutz[0].title).toBe(DE['area.protectedFolderTitle']);
  expect(schutz[0].message).toBe(DE['area.protectedFolderMessage']);
  expect(schutz[0].detail).toBe(ziel);
}

// --- file:saveAs ---------------------------------------------------------------------

function speichernUnter(d) {
  const handlers = new Map();
  registerFilesIpc((k, fn) => handlers.set(k, fn), {
    dialog: d,
    senderWindow: () => null,
    areaOfWindow: () => null,
    tForWindow: t,
    isMddPath: () => false,
    isMarkdownPath: (p) => /\.md$/i.test(p),
    watchFile: () => {},
    unwatchFile: () => {},
    resolveHistoryFor: async () => ({ effective: false }),
    recordMddExternalOnOpen: async () => {},
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    saveGuard: { istKonflikt: () => false },
    pushRecent: () => {},
    getStore: () => null,
    readAreaLinks: async () => [],
    checkTarget: pruefung(),
  });
  return (vorschlag) => handlers.get('file:saveAs')({ sender: { id: 1 } }, vorschlag, '# Text');
}

describe('file:saveAs (4T-002827)', () => {
  it.each(GESCHUETZT)('weist ein Ziel im %s ab und öffnet den Dialog erneut', async (_n, ort) => {
    const ziel = path.join(ort, 'Notiz.md');
    const d = dialogMit([ziel]);
    const ergebnis = await speichernUnter(d)(ziel);
    expect(ergebnis).toEqual({ ok: false, canceled: true });
    expect(d.aufrufe).toHaveLength(2);
    // Review-Befund Z3: ohne Bereich der Benutzerordner, nie der abgewiesene Ordner.
    expect(d.aufrufe[1].defaultPath).toBe(path.join(os.homedir(), 'Notiz.md'));
    erwarteSchutzMeldung(d, ziel);
    expect(fs.existsSync(ziel)).toBe(false);
  });

  it('speichert nach der Abweisung am frei gewählten Ort', async () => {
    const frei = path.join(OUTSIDE, 'Notiz.md');
    const d = dialogMit([path.join(PROGRAM, 'Notiz.md'), frei]);
    const ergebnis = await speichernUnter(d)(null);
    expect(ergebnis).toMatchObject({ ok: true, path: frei });
    expect(fs.readFileSync(frei, 'utf8')).toBe('# Text');
    expect(fs.existsSync(path.join(PROGRAM, 'Notiz.md'))).toBe(false);
  });
});

// --- demoArea:create -----------------------------------------------------------------

function demoBereich(d) {
  const handlers = new Map();
  registerAreasIpc((k, fn) => handlers.set(k, fn), {
    dialog: d,
    senderWindow: () => null,
    areaOfWindow: () => null,
    tForWindow: t,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.md$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
    checkTarget: pruefung(),
  });
  return () => handlers.get('demoArea:create')({ sender: { id: 1 } });
}

describe('demoArea:create (4T-002827)', () => {
  it.each(GESCHUETZT)('legt im %s keinen Demo-Bereich an', async (_n, ort) => {
    const ziel = path.join(ort, 'Demo');
    const d = dialogMit([ziel]);
    const ergebnis = await demoBereich(d)();
    expect(ergebnis).toEqual({ ok: false, error: 'guard:protectedFolder' });
    erwarteSchutzMeldung(d, ziel);
    expect(fs.existsSync(ziel)).toBe(false);
  });
});

// --- books:createDialog und shelves:createDialog ----------------------------------------

function appDeps() {
  const none = () => {};
  const registry = {
    getArea: () => null,
    setArea: none,
    windowsOf: () => [],
    appOf: () => 7,
  };
  return {
    appRegistry: registry,
    getStore: () => null,
    windows: new Map(),
    lastReportedPanes: new Map(),
    activeShelves: () => new Map(),
    activeBooks: new Map(),
    areaOfWindow: () => null,
    startAreaWatcher: none,
    focusFirstAppWindow: none,
    broadcastDisplayInfo: none,
    applyMenuToAllWindows: none,
    tForWindow: t,
    persistAllWindows: none,
    createWindow: none,
    closeAppWindows: none,
    recentLists: { pushRecentEntry: none },
    appIdOfWindow: () => 7,
    sendWhenLoaded: none,
    appHasOpenFilesOutside: () => false,
    openBookApp: none,
  };
}

describe('books:createDialog (4T-002827)', () => {
  it.each(GESCHUETZT)('legt im %s kein Buch an', async (_n, ort) => {
    const ziel = path.join(ort, 'Roman');
    const d = dialogMit([ziel]);
    const ergebnis = await createBookApps(appDeps()).createBookDialog(null, {
      dialog: d,
      checkTarget: pruefung(),
    });
    expect(ergebnis).toEqual({ ok: false, error: 'guard:protectedFolder' });
    erwarteSchutzMeldung(d, ziel);
    expect(fs.existsSync(ziel)).toBe(false);
  });
});

// Review-Befund Z1 vom 2026-11-22: Die Menü-Befehle rufen den Dialog ohne
// Optionen (menu/menu-apply.js); die Prüfung kommt aus der Verdrahtung.
describe('«Neues Buch…» und «Neues Bücherregal…» aus dem Menü (Review-Befund Z1)', () => {
  it.each(GESCHUETZT)('legen im %s nichts an', async (_n, ort) => {
    for (const [anlegen, name] of [
      [(deps) => createBookApps(deps).createBookDialog(null), 'Roman'],
      [(deps) => createShelfApps(deps).createShelfDialog(null), 'Regal'],
    ]) {
      const ziel = path.join(ort, name);
      const d = dialogMit([ziel]);
      const ergebnis = await anlegen({ ...appDeps(), checkTarget: pruefung(), dialog: d });
      expect(ergebnis).toEqual({ ok: false, error: 'guard:protectedFolder' });
      erwarteSchutzMeldung(d, ziel);
      expect(fs.existsSync(ziel)).toBe(false);
    }
  });
});

describe('shelves:createDialog (4T-002827)', () => {
  it.each(GESCHUETZT)('legt im %s kein Regal an', async (_n, ort) => {
    const ziel = path.join(ort, 'Regal');
    const d = dialogMit([ziel]);
    const ergebnis = await createShelfApps(appDeps()).createShelfDialog(null, {
      dialog: d,
      checkTarget: pruefung(),
    });
    expect(ergebnis).toEqual({ ok: false, error: 'guard:protectedFolder' });
    erwarteSchutzMeldung(d, ziel);
    expect(fs.existsSync(ziel)).toBe(false);
  });
});

// --- canvas:importJsonCanvas ------------------------------------------------------------

const FLAECHE = JSON.stringify({
  nodes: [{ id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: '## Ziel' }],
  edges: [],
});

function canvasImport(d, checkTarget = pruefung()) {
  const handlers = new Map();
  registerCanvasImportIpc((k, fn) => handlers.set(k, fn), {
    dialog: d,
    senderWindow: () => null,
    areaOfWindow: () => null,
    tForWindow: t,
    MAX_EMBED_BYTES: Infinity,
    checkTarget,
  });
  return () => handlers.get('canvas:importJsonCanvas')({ sender: { id: 1 } });
}

describe('canvas:importJsonCanvas (4T-002827)', () => {
  it.each(GESCHUETZT)(
    'liest eine Datei im %s, legt dort aber kein Dokument an',
    async (_n, ort) => {
      const quelle = path.join(ort, 'Flaeche.canvas');
      fs.writeFileSync(quelle, FLAECHE);
      try {
        const d = dialogMit([quelle]);
        const ergebnis = await canvasImport(d)();
        expect(ergebnis.ok).toBe(true);
        expect(ergebnis.ergebnisse).toEqual([
          { name: 'Flaeche.canvas', fehler: 'geschuetzterOrdner' },
        ]);
        expect(fs.existsSync(path.join(ort, 'Flaeche.md'))).toBe(false);
        expect(DE['canvas.austausch.fehler.geschuetzterOrdner']).toBeTruthy();
      } finally {
        fs.rmSync(quelle, { force: true });
      }
    },
  );

  // Review-Befund Z1 der Runde 5 vom 2026-11-22: «gehört zum Programm» nur
  // beim Grund protectedFolder, jeder andere Grund bekommt den eigenen Text.
  it('meldet ein nicht prüfbares Ziel mit eigenem Fehler', async () => {
    const quelle = path.join(OUTSIDE, 'Ungeprueft.canvas');
    fs.writeFileSync(quelle, FLAECHE);
    try {
      const abweisend = async () => ({ ok: false, error: 'guard:danglingLink' });
      const ergebnis = await canvasImport(dialogMit([quelle]), abweisend)();
      expect(ergebnis.ergebnisse).toEqual([
        { name: 'Ungeprueft.canvas', fehler: 'zielNichtPruefbar' },
      ]);
      expect(fs.existsSync(path.join(OUTSIDE, 'Ungeprueft.md'))).toBe(false);
      expect(DE['canvas.austausch.fehler.zielNichtPruefbar']).toBeTruthy();
    } finally {
      fs.rmSync(quelle, { force: true });
    }
  });

  it('legt neben einer Datei außerhalb das Dokument an', async () => {
    const quelle = path.join(OUTSIDE, 'Flaeche.canvas');
    fs.writeFileSync(quelle, FLAECHE);
    const ergebnis = await canvasImport(dialogMit([quelle]))();
    expect(ergebnis.ergebnisse[0].fehler).toBeUndefined();
    expect(fs.existsSync(path.join(OUTSIDE, 'Flaeche.md'))).toBe(true);
  });
});

// --- locales:saveTemplate und locales:updateDialog ---------------------------------------

function sprachKanal(d, kanal) {
  const handlers = new Map();
  registerLocalesIpc((k, fn) => handlers.set(k, fn), {
    dialog: d,
    app: { getPath: (art) => (art === 'home' ? HOME : DATA) },
    BrowserWindow: { getAllWindows: () => [] },
    senderWindow: () => null,
    tForWindow: t,
    getStore: () => null,
    checkTarget: pruefung(),
  });
  return () => handlers.get(kanal)({ sender: { id: 1 } });
}

// Eine eingespielte eigene Sprache, die «Sprachdatei aktualisieren» anbietet.
fs.writeFileSync(
  path.join(DATA, 'locales', 'nl.json'),
  JSON.stringify({ '@@locale': 'nl', '@@name': 'Nederlands', 'area.outsideTitle': 'Buiten' }),
);

describe.each([
  ['locales:saveTemplate', 'Vorlage.json'],
  ['locales:updateDialog', 'nl-Sprache.json'],
])('%s (4T-002827)', (kanal, name) => {
  it.each(GESCHUETZT)('weist ein Ziel im %s ab und öffnet den Dialog erneut', async (_n, ort) => {
    const ziel = path.join(ort, name);
    const d = dialogMit([ziel]);
    const ergebnis = await sprachKanal(d, kanal)();
    expect(ergebnis).toEqual({ ok: false, canceled: true });
    expect(d.aufrufe).toHaveLength(2);
    expect(d.aufrufe[1].defaultPath).toBe(path.join(HOME, name));
    erwarteSchutzMeldung(d, ziel);
    expect(fs.existsSync(ziel)).toBe(false);
  });

  it('schreibt nach der Abweisung am frei gewählten Ort', async () => {
    const frei = path.join(OUTSIDE, name);
    const d = dialogMit([path.join(PROGRAM, name), frei]);
    const ergebnis = await sprachKanal(d, kanal)();
    expect(ergebnis.ok).toBe(true);
    expect(fs.existsSync(frei)).toBe(true);
    expect(fs.existsSync(path.join(PROGRAM, name))).toBe(false);
  });
});

// --- Text der Meldung je Grund (Review-Befund Z4) ----------------------------------------

describe('Meldung je Grund der Abweisung (Review-Befund Z4)', () => {
  it.each(['guard:resolveFailed', 'guard:danglingLink', 'guard:protectedListUnavailable'])(
    'meldet bei %s «Ziel nicht prüfbar» statt «gehört zum Programm»',
    async (grund) => {
      const d = dialogMit([]);
      const ziel = path.join(OUTSIDE, 'Notiz.md');
      const abweisung = await weiseGeschuetztesZielAb({
        checkTarget: async () => ({ ok: false, error: grund }),
        dialog: d,
        owner: null,
        tForWindow: t,
        kanal: 'file:saveAs',
        ziel,
        umfang: 'write',
      });
      expect(abweisung).toEqual({ ok: false, error: grund });
      expect(d.meldungen).toHaveLength(1);
      expect(d.meldungen[0].title).toBe(DE['area.targetUncheckedTitle']);
      expect(d.meldungen[0].message).toBe(DE['area.targetUncheckedMessage']);
      expect(d.meldungen[0].detail).toBe(ziel);
    },
  );
});

// --- Wächter: jede Dialog-Stelle ist eingeordnet -----------------------------------------

// Je Datei die Stellen mit Datei-Dialog in ihrer Reihenfolge: der Kanal (oder
// die Funktion hinter dem Kanal) und `geprueft` für einen Weg aus
// `DIALOG_WEGE`, sonst der Grund, warum die Stelle selbst nichts schreibt.
const LESEN = 'wählt eine Datei oder einen Ordner zum Lesen; geschrieben wird dort nicht';
const FOLGE =
  'liefert das Ziel an den Anzeige-Prozess; geschrieben wird über einen erklärten Kanal';
const STUFE2 = 'öffnet einen Ordner als Bereich, Buch oder Regal; die Bindung prüft Stufe 2';
const DIALOG_STELLEN = {
  'src/main/books/book-apps.js': [
    ['openBookDialog', STUFE2],
    ['books:createDialog', 'geprueft'],
  ],
  'src/main/books/shelf-apps.js': [
    ['openShelfDialog', STUFE2],
    ['shelves:createDialog', 'geprueft'],
  ],
  'src/main/ipc/areas.js': [
    ['area:open', STUFE2],
    ['demoArea:create', 'geprueft'],
  ],
  'src/main/ipc/books.js': [
    [
      'books:moveChapterFile',
      'verschiebt im Buch; der Fall «Buch in einem geschützten Ordner oder ihn enthaltend» ist Stufe 2 (Review-Befund S3)',
    ],
    ['books:reassignChapterDialog', LESEN],
  ],
  'src/main/ipc/canvas-import.js': [['canvas:importJsonCanvas', 'geprueft']],
  'src/main/ipc/dialogs.js': [
    ['pdf:chooseTarget', FOLGE],
    ['pptx:chooseTarget', FOLGE],
    ['html:chooseTarget', FOLGE],
  ],
  'src/main/ipc/exchange.js': [['exchange:openDialog', LESEN]],
  'src/main/ipc/files.js': [
    ['file:openDialog', LESEN],
    ['file:saveAs', 'geprueft'],
  ],
  'src/main/ipc/locales.js': [
    ['locales:saveTemplate und locales:updateDialog', 'geprueft'],
    ['locales:openDialog', LESEN],
  ],
  'src/main/ipc/memory.js': [['memory:addFromDialog', LESEN]],
  'src/main/ipc/presentation-export-bilder.js': [['presentationImages:chooseFolder', FOLGE]],
  'src/main/ipc/presentation-export.js': [['presentationHtml:chooseFolder', FOLGE]],
  'src/main/ipc/profiles.js': [['profiles:chooseFolder', LESEN]],
  'src/main/ipc/templates.js': [['templates:chooseFolder', FOLGE]],
};
// Review-Befund S2 vom 2026-11-22: Erkannt werden auch die Sync-Fassungen, der
// Zugriff über eckige Klammern und das Herauslösen aus dem Dialog-Modul. Die
// Hülle der portablen Fassung (app/portabler-betrieb.js) ruft die Dialoge nur
// über eine Variable auf und braucht deshalb keine Ausnahme mehr; ein Aufruf
// über einen frei errechneten Namen bleibt außerhalb dessen, was ein
// Text-Muster erkennen kann.
const DIALOG_MUSTER =
  /\bshow(Save|Open)Dialog(Sync)?\s*\(|\[\s*['"`]show(Save|Open)Dialog(Sync)?['"`]\s*\]|\{[^}]*\bshow(Save|Open)Dialog(Sync)?\b[^}]*\}\s*=/g;

function jsDateien(ordner) {
  const out = [];
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) out.push(...jsDateien(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function lies(rel) {
  return fs.readFileSync(path.join(WURZEL, rel), 'utf8');
}

// Review-Befund Z3 der Runde 5 vom 2026-11-22: Holt ein Modul `name` aus
// seinen Abhängigkeiten? Gezählt wird nur ein Eintrag einer Destrukturierung
// `const { … } = deps`, nicht ein Kommentar oder ein Wort irgendwo davor.
function holtAusDeps(text, name) {
  for (const treffer of text.matchAll(/const\s*\{([^{}]*)\}\s*=\s*deps\b/g)) {
    const eintraege = treffer[1]
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((e) => e.trim());
    if (eintraege.includes(name)) return true;
  }
  return false;
}

describe('Wächter: Datei-Dialoge gegen die geprüften Wege (4T-002827)', () => {
  it('jede Datei mit Datei-Dialog ist mit allen ihren Stellen eingeordnet', () => {
    const gefunden = {};
    for (const datei of jsDateien(path.join(WURZEL, 'src', 'main'))) {
      const rel = path.relative(WURZEL, datei).split(path.sep).join('/');
      const n = (fs.readFileSync(datei, 'utf8').match(DIALOG_MUSTER) || []).length;
      if (n > 0) gefunden[rel] = n;
    }
    const erwartet = Object.fromEntries(
      Object.entries(DIALOG_STELLEN).map(([rel, stellen]) => [rel, stellen.length]),
    );
    expect(gefunden).toEqual(erwartet);
  });

  it('jeder geprüfte Weg fragt die Prüfung mit seinem Kanal', () => {
    for (const [kanal, rel] of Object.entries(DIALOG_WEGE)) {
      const text = lies(rel);
      expect(text, `${kanal} in ${rel}`).toContain('weiseGeschuetztesZielAb');
      expect(text, `${kanal} in ${rel}`).toMatch(new RegExp(`'${kanal}'`));
    }
    const geprueft = Object.values(DIALOG_STELLEN)
      .flat()
      .filter(([, grund]) => grund === 'geprueft').length;
    // Die beiden Sprachdatei-Wege teilen sich eine Dialog-Stelle.
    expect(Object.keys(DIALOG_WEGE)).toHaveLength(geprueft + 1);
  });

  it('das Muster erkennt jede Schreibweise eines Datei-Dialogs (Review-Befund S2)', () => {
    const proben = [
      'dialog.showSaveDialog(win, {})',
      'dialog.showOpenDialogSync(win, {})',
      "dialog['showSaveDialogSync'](win)",
      'const { showOpenDialog } = dialog;',
    ];
    for (const probe of proben) expect(probe.match(DIALOG_MUSTER), probe).toHaveLength(1);
    expect('// showSaveDialog im Kommentar'.match(DIALOG_MUSTER)).toBeNull();
  });

  // Review-Befund Z2 vom 2026-11-22: Der Baustein prüft nichts ohne
  // checkTarget. Deshalb muss jeder Aufrufer die Prüfung bekommen, auch die
  // Menü-Befehle, die den Buch- und Regal-Dialog ohne Optionen rufen.
  it('die Prüfung erreicht jeden Weg aus main.js', () => {
    expect(lies('src/main/main.js').match(/checkTarget: channelGuard\.checkTarget/g)).toHaveLength(
      2,
    );
    const wiring = lies('src/main/app/wiring.js');
    expect(wiring).toMatch(/\bcheckTarget,\s*\} = deps/);
    expect(wiring.match(/bindingGrants,\s*checkTarget,\s*\}\);/g)).toHaveLength(2);
    for (const rel of ['src/main/books/book-apps.js', 'src/main/books/shelf-apps.js']) {
      const text = lies(rel);
      expect(text, rel).toMatch(/\bcheckTarget,\s*\} = deps/);
      expect(text, rel).toContain('checkTarget: options.checkTarget || checkTarget,');
    }
    expect(lies('src/main/ipc/books.js')).toMatch(
      /createBookDialog\(senderWindow\(event\), \{ checkTarget \}\)/,
    );
    expect(lies('src/main/ipc/shelves.js')).toMatch(
      /createShelfDialog\(senderWindow\(event\), \{ checkTarget \}\)/,
    );
    for (const rel of new Set(Object.values(DIALOG_WEGE))) {
      if (rel.startsWith('src/main/books/')) continue;
      expect(holtAusDeps(lies(rel), 'checkTarget'), rel).toBe(true);
    }
  });

  // Review-Befund Z3 der Runde 5 vom 2026-11-22: Die Anlage eines Workflows
  // öffnet keinen Dialog und steht deshalb nicht in DIALOG_WEGE; ihre Prüfung
  // reist über ipcDeps und registerWorkflowsIpc und wird hier eigens gehalten.
  it('die Prüfung erreicht die Anlage eines Workflows', () => {
    const main = lies('src/main/main.js');
    const ipcDeps = main.slice(main.indexOf('const ipcDeps = {'));
    expect(ipcDeps.slice(0, ipcDeps.indexOf('\n  };'))).toContain(
      'checkTarget: channelGuard.checkTarget,',
    );
    expect(main).toContain('registerWorkflowsIpc(registriere, ipcDeps);');
    expect(lies('src/main/ipc/workflows.js')).toContain('registerWorkflowFolderIpc(handle, deps);');
    const ordner = lies('src/main/ipc/workflow-folder.js');
    expect(holtAusDeps(ordner, 'checkTarget')).toBe(true);
    expect(ordner).toMatch(/await checkTarget\(\s*'workflow:create'/);
  });

  it('die Probe der Destrukturierung übersieht keinen Kommentar (Review-Befund Z3)', () => {
    expect(holtAusDeps('const {\n  dialog,\n  checkTarget,\n} = deps;', 'checkTarget')).toBe(true);
    expect(holtAusDeps('const { dialog, checkTarget } = deps;', 'checkTarget')).toBe(true);
    expect(
      holtAusDeps('const {\n  dialog,\n  // checkTarget kommt später\n} = deps;', 'checkTarget'),
    ).toBe(false);
    expect(holtAusDeps('// checkTarget\nconst { dialog } = deps;', 'checkTarget')).toBe(false);
  });
});
