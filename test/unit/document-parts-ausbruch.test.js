// 4T-002811 (Epic 3E-000161): Ausbruchs-Prüffälle der Zuordnungs-Zeile geteilter
// Dokumente. Der Grundname in der Zeile `doc-part` ist Dokument-Inhalt und damit
// fremd kontrollierbar; bis einschließlich 1.161.2 bildete der Lese- und
// Speicher-Weg der Anwendung daraus ungeprüft den Pfad der Kopf-Datei. Eine
// präparierte Notiz führte so beim Öffnen auf eine Datei außerhalb des Bereichs
// und beim Speichern in sie hinein (Beleg vom 2026-11-22 an den echten Kanälen).
//
// Geprüft wird an der realen Konstellation: die echten Kanäle `file:read`,
// `file:save` und `parts:rejoin` des Hauptprozesses mit einem an den Bereich
// gebundenen Fenster und einem echten Datei-Ordner, dazu die Datei-Ebene des
// Lese- und Schreib-Wegs und die Namens-Regel selbst.
//
// Alles über `require`, damit die Plattform-Injektion (`setPlatformForTests`)
// dieselbe Modul-Instanz trifft, die die geprüften Module benutzen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { setPlatformForTests } = require('../../src/shared/platform.js');
const {
  isBlankPartBase,
  readPartLine,
  writePartLine,
  PART_SEP,
  PART_INFIX,
} = require('../../src/shared/document-parts.js');
const {
  readAssembledDocument,
  readStateForSave,
  writeDocumentParts,
  mddPathFor,
} = require('../../src/main/documents/document-parts-io.js');
const { registerFilesIpc } = require('../../src/main/ipc/files.js');
const mddStore = require('../../src/main/documents/mdd-store.js');

const tmpDirs = [];
afterEach(() => {
  setPlatformForTests(undefined);
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const lies = (p) => fs.readFileSync(p, 'utf8');
const teilName = (grund, n) => `${grund}${PART_SEP}${PART_INFIX}${String(n).padStart(5, '0')}`;

// Wegwerf-Wurzel mit einem Bereich, einem Ordner darin und einem Ordner
// «Privat» daneben, also außerhalb des Bereichs. Draußen liegen eine Datei und
// ihre Begleitdatei, wie bei eingeschalteter Historie.
function sandbox() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-teile-ausbruch-'));
  tmpDirs.push(wurzel);
  const bereich = path.join(wurzel, 'Bereich');
  const ordner = path.join(bereich, 'Geteilt');
  const aussen = path.join(wurzel, 'Privat');
  fs.mkdirSync(ordner, { recursive: true });
  fs.mkdirSync(aussen, { recursive: true });
  const geheim = path.join(aussen, 'Geheim.md');
  const geheimText = '# Privat\n\nKontonummer 1234, nur auf diesem Rechner.\n';
  fs.writeFileSync(geheim, geheimText, 'utf8');
  const geheimMdd = path.join(aussen, 'Geheim.mdd');
  const mddText = mddStore.serializeContainer(mddStore.emptyContainer());
  fs.writeFileSync(geheimMdd, mddText, 'utf8');
  return { wurzel, bereich, ordner, aussen, geheim, geheimText, geheimMdd, mddText };
}

// Eine Notiz im Ordner des Bereichs, deren Zuordnungs-Zeile den Grundnamen
// `grund` an Position `index` trägt. Die Zeile wird von Hand geschrieben, weil
// der Schreib-Weg der Anwendung einen solchen Namen nie erzeugt.
function praeparierteNotiz(ordner, grund, index = 2) {
  const notiz = path.join(ordner, 'Notiz.md');
  const wert = `v1|${index}|${grund}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const text = `---\ndoc-part: "${wert}"\n---\nHarmloser Text.\n`;
  fs.writeFileSync(notiz, text, 'utf8');
  // Vorbedingung: Die Zeile wird als Zeile gelesen; nur ihr Name ist ungültig.
  expect(readPartLine(text)).not.toBeNull();
  return { notiz, text };
}

// Die echten Kanäle mit einem Fenster, das an `bereich` gebunden ist, und mit
// eingeschalteter Historie, damit auch Beobachtung und Begleitdatei sichtbar
// werden.
function kanaele(bereich, registrieren = registerFilesIpc) {
  const handlers = new Map();
  const spur = { beobachtet: [], historieBeimOeffnen: [], historieBeimSpeichern: [] };
  registrieren((k, fn) => handlers.set(k, fn), {
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    senderWindow: () => ({ id: 1 }),
    areaOfWindow: () => ({ rootPath: bereich }),
    tForWindow: (_w, k) => k,
    isMddPath: (p) => /\.mdd[ab]?$/i.test(p),
    isMarkdownPath: (p) => /\.md$/i.test(p),
    watchFile: (p) => spur.beobachtet.push(p),
    unwatchFile: () => {},
    resolveHistoryFor: async () => ({ effective: true }),
    recordMddExternalOnOpen: async (_o, p) => spur.historieBeimOeffnen.push(p),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async (_o, p) => spur.historieBeimSpeichern.push(p),
    saveGuard: { istKonflikt: (prev, exp) => exp !== null && prev !== exp },
    pushRecent: () => {},
    getStore: () => null,
    readAreaLinks: async () => [],
  });
  const ev = { sender: { id: 1 } };
  return {
    spur,
    lese: (p) => handlers.get('file:read')(ev, p),
    speichere: (p, text, opts) => handlers.get('file:save')(ev, p, text, opts),
    vereine: (p) => handlers.get('parts:rejoin')(ev, p),
  };
}

describe('isBlankPartBase: nur ein blanker Datei-Name taugt als Grundname (4T-002811)', () => {
  it('nimmt gewöhnliche Namen an', () => {
    for (const name of ['Bericht', 'Bericht 2026', 'a.b', 'Übersicht', '...md', '..a']) {
      expect(isBlankPartBase(name), name).toBe(true);
    }
  });

  it('weist leere Werte, Punkt-Segmente, Trenner und Laufwerke auf jeder Plattform ab', () => {
    for (const plattform of ['linux', 'win32', 'darwin']) {
      setPlatformForTests(plattform);
      for (const name of [
        '',
        '.',
        '..',
        '../Geheim',
        '..\\Geheim',
        '../../Privat/Geheim',
        '..\\..\\Privat\\Geheim',
        'Ordner/Geheim',
        'Ordner\\Geheim',
        '/etc/Geheim',
        '\\\\server\\freigabe\\Geheim',
        'C:/Privat/Geheim',
        'C:\\Privat\\Geheim',
        'C:Geheim',
        'Geheim/',
      ]) {
        expect(isBlankPartBase(name), `${plattform}: ${name}`).toBe(false);
      }
    }
  });

  it('weist Steuerzeichen und Nicht-Texte ab', () => {
    for (const name of ['a\u0000b', 'a\nb', 'a\tb', 'a\u007fb']) {
      expect(isBlankPartBase(name), JSON.stringify(name)).toBe(false);
    }
    for (const wert of [null, undefined, 42, {}, ['a']]) {
      expect(isBlankPartBase(wert)).toBe(false);
    }
  });

  it('sperrt den Doppelpunkt nur unter Windows (Laufwerk, Neben-Datenstrom)', () => {
    setPlatformForTests('win32');
    expect(isBlankPartBase('Bericht:alt')).toBe(false);
    setPlatformForTests('linux');
    expect(isBlankPartBase('Bericht:alt')).toBe(true);
    setPlatformForTests('darwin');
    expect(isBlankPartBase('Bericht:alt')).toBe(true);
  });

  it('sperrt unter Windows reservierte Geräte-Namen, auch mit Endung', () => {
    setPlatformForTests('win32');
    for (const name of [
      'CON',
      'nul',
      'Aux',
      'PRN',
      'COM1',
      'lpt9',
      'NUL.md',
      'con.txt',
      'CONIN$',
      'conout$.md',
      'COM¹',
      'lpt³',
      'NUL ',
      'CON .md',
    ]) {
      expect(isBlankPartBase(name), JSON.stringify(name)).toBe(false);
    }
    for (const name of ['CONTO', 'Nullpunkt', 'COM0', 'LPT10', 'Konsole', 'CON Bericht', 'COM⁴']) {
      expect(isBlankPartBase(name), name).toBe(true);
    }
    setPlatformForTests('linux');
    expect(isBlankPartBase('CON')).toBe(true);
  });
});

// Die Ausbruchs-Formen, an denen Lese- und Speicher-Weg geprüft werden. Die
// absolute Form wird je Sandbox gebildet, weil sie den echten Ort braucht.
function ausbruchsFormen(s) {
  return [
    ['zwei Ordner hinauf mit Schrägstrich', '../../Privat/Geheim'],
    ['zwei Ordner hinauf mit Backslash', '..\\..\\Privat\\Geheim'],
    ['absoluter Pfad', path.join(s.aussen, 'Geheim')],
    ['Laufwerk am Anfang', 'C:/Privat/Geheim'],
    ['Ordner im Namen', 'Unterordner/Geheim'],
  ];
}

describe('Datei-Ebene: ein ungültiger Grundname öffnet als ungeteiltes Dokument (4T-002811)', () => {
  it('liefert für jede Ausbruchs-Form die geöffnete Datei selbst, an Position 1 und 2', async () => {
    const s = sandbox();
    for (const [form, grund] of ausbruchsFormen(s)) {
      for (const index of [1, 2]) {
        const { notiz, text } = praeparierteNotiz(s.ordner, grund, index);
        const r = await readAssembledDocument(notiz, text);
        expect(r.ok, `${form}, Position ${index}`).toBe(true);
        expect(r.geteilt, `${form}, Position ${index}`).toBe(false);
        expect(r.path, `${form}, Position ${index}`).toBe(notiz);
        expect(r.text, `${form}, Position ${index}`).toBe(text);
        const stand = await readStateForSave(notiz);
        expect(stand.headPath, `${form}, Position ${index}`).toBe(notiz);
        expect(stand.geteilt).toBe(false);
      }
    }
    expect(lies(s.geheimMdd)).toBe(s.mddText);
    expect(lies(s.geheim)).toBe(s.geheimText);
  });

  it('schreibt keinen Teil außerhalb des Ordners der Kopf-Datei', async () => {
    const s = sandbox();
    const kopf = path.join(s.ordner, 'Bericht.md');
    const r = await writeDocumentParts(kopf, [
      { index: 1, basename: 'Bericht', text: 'Kopf\n', geaendert: true },
      { index: 2, basename: 'Geheim', pfad: s.geheim, text: 'fremd\n', geaendert: true },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('outside-folder');
    expect(lies(s.geheim)).toBe(s.geheimText);
    // Nichts Halbes: Geprüft wird vor dem ersten Schreiben.
    expect(fs.existsSync(kopf)).toBe(false);
  });
});

describe('Kanäle des Hauptprozesses: die präparierte Notiz bleibt im Bereich (4T-002811)', () => {
  it('Gegenprobe: Die Datei draußen direkt zu öffnen, wird abgewiesen', async () => {
    const s = sandbox();
    const k = kanaele(s.bereich);
    expect(await k.lese(s.geheim)).toEqual({ ok: false, error: 'outside-area' });
  });

  it('öffnet für jede Ausbruchs-Form die Notiz selbst, ohne die Datei draußen zu berühren', async () => {
    const s = sandbox();
    for (const [form, grund] of ausbruchsFormen(s)) {
      const k = kanaele(s.bereich);
      const { notiz, text } = praeparierteNotiz(s.ordner, grund);
      const gelesen = await k.lese(notiz);
      // Die Historie beim Öffnen läuft ohne Warten nach; abgewartet wird ihr Eintrag.
      await vi.waitFor(() => expect(k.spur.historieBeimOeffnen).toHaveLength(1));
      expect(gelesen.ok, form).toBe(true);
      expect(gelesen.path, form).toBe(notiz);
      expect(gelesen.content, form).toBe(text);
      expect(gelesen.nurLesen, form).toBeUndefined();
      expect(k.spur.beobachtet, form).toEqual([notiz]);
      expect(k.spur.historieBeimOeffnen, form).toEqual([notiz]);
    }
    expect(lies(s.geheimMdd)).toBe(s.mddText);
    expect(lies(s.geheim)).toBe(s.geheimText);
  });

  it('der Beleg vom 2026-11-22: Speichern schreibt in die Notiz, nicht in die Datei draußen', async () => {
    const s = sandbox();
    const k = kanaele(s.bereich);
    const { notiz } = praeparierteNotiz(s.ordner, '../../Privat/Geheim');
    const gelesen = await k.lese(notiz);
    const neu = gelesen.content + 'Ein Satz des Anwenders.\n';
    const gespeichert = await k.speichere(gelesen.path, neu, { expected: gelesen.content });
    await vi.waitFor(() => expect(k.spur.historieBeimSpeichern).toHaveLength(1));
    expect(gespeichert.ok).toBe(true);
    expect(lies(notiz)).toBe(neu);
    expect(lies(s.geheim)).toBe(s.geheimText);
    expect(lies(s.geheimMdd)).toBe(s.mddText);
    expect(k.spur.historieBeimSpeichern).toEqual([notiz]);
  });

  it('Wiedervereinen einer präparierten Notiz löscht nichts und meldet «nicht geteilt»', async () => {
    const s = sandbox();
    const k = kanaele(s.bereich);
    const { notiz, text } = praeparierteNotiz(s.ordner, '../../Privat/Geheim');
    const r = await k.vereine(notiz);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not-split');
    expect(lies(notiz)).toBe(text);
    expect(lies(s.geheim)).toBe(s.geheimText);
  });

  it('Gegenprobe: Ein gültiges geteiltes Dokument öffnet, speichert und vereint wie bisher', async () => {
    const s = sandbox();
    const k = kanaele(s.bereich);
    const kopf = path.join(s.ordner, 'Bericht.md');
    const teil2 = path.join(s.ordner, `${teilName('Bericht', 2)}.md`);
    fs.writeFileSync(
      kopf,
      writePartLine('# Bericht\n\nErster Teil.\n', { index: 1, base: 'Bericht' }).text,
      'utf8',
    );
    fs.writeFileSync(
      teil2,
      writePartLine('# Zweiter Teil\n\nNoch mehr.\n', { index: 2, base: 'Bericht' }).text,
      'utf8',
    );
    fs.writeFileSync(mddPathFor(kopf), s.mddText, 'utf8');

    // Geöffnet über den Folgeteil: Der Reiter trägt die Kopf-Datei im selben Ordner.
    const gelesen = await k.lese(teil2);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.path).toBe(kopf);
    expect(gelesen.content).toContain('Erster Teil.');
    expect(gelesen.content).toContain('Noch mehr.');

    const neu = gelesen.content.replace('Noch mehr.', 'Noch mehr, geändert.');
    const gespeichert = await k.speichere(gelesen.path, neu, { expected: gelesen.content });
    expect(gespeichert.ok).toBe(true);
    expect(lies(teil2)).toContain('Noch mehr, geändert.');
    expect(lies(kopf)).toContain('Erster Teil.');

    const vereint = await k.vereine(kopf);
    expect(vereint.ok).toBe(true);
    expect(fs.existsSync(teil2)).toBe(false);
    expect(lies(kopf)).toContain('Noch mehr, geändert.');
    expect(lies(s.geheim)).toBe(s.geheimText);
  });
});

// Die zweite Linie: Jede Ordner-Prüfung hinter der Namens-Prüfung bekommt einen
// Prüffall, der ohne sie rot würde (Zweitblick zu 4T-002811, Runde 1). Dazu
// wird die vorgelagerte Sicherung im Modul-Zwischenspeicher von Node gezielt
// ersetzt und das geprüfte Modul frisch geladen; danach steht alles wieder wie
// vorher. So bleibt die geprüfte Stelle echter Code, und nur ihr Vorfeld ist
// ausgehebelt.
const PFAD_TEILE = require.resolve('../../src/shared/document-parts.js');
const PFAD_ZUSAMMENSETZEN = require.resolve('../../src/shared/document-assembly.js');
const PFAD_IO = require.resolve('../../src/main/documents/document-parts-io.js');
const PFAD_KANAELE = require.resolve('../../src/main/ipc/files.js');

// ersatz: { [Modul-Pfad]: (echteExporte) => Ersatz-Exporte }; geladen werden
// `ziele` frisch, in dieser Reihenfolge, gegen die ersetzten Module.
function ladeMitErsatz(ersatz, ziele) {
  const vorher = new Map();
  for (const p of Object.keys(ersatz)) vorher.set(p, require(p));
  const frisch = [...new Set([...ziele, PFAD_IO, PFAD_KANAELE])].filter((p) => !(p in ersatz));
  const gesichert = new Map(frisch.map((p) => [p, require.cache[p]]));
  try {
    for (const p of frisch) delete require.cache[p];
    for (const [p, bau] of Object.entries(ersatz)) {
      require.cache[p].exports = bau(vorher.get(p));
    }
    return ziele.map((p) => require(p));
  } finally {
    for (const [p, echt] of vorher) require.cache[p].exports = echt;
    for (const [p, modul] of gesichert) {
      if (modul) require.cache[p] = modul;
      else delete require.cache[p];
    }
  }
}

describe('Zweite Linie: die Ordner-Prüfungen greifen auch ohne Namens-Prüfung (4T-002811)', () => {
  it('Lese-Weg: Eine Kopf-Datei außerhalb des Ordners wird nicht gelesen', async () => {
    const s = sandbox();
    const [io] = ladeMitErsatz(
      { [PFAD_TEILE]: (echt) => ({ ...echt, isBlankPartBase: () => true }) },
      [PFAD_IO],
    );
    const { notiz, text } = praeparierteNotiz(s.ordner, '../../Privat/Geheim');
    // Ohne diese Prüfung läse der Weg schon die Begleitdatei draußen, bevor die
    // Prüfung der Teile greift; deshalb zählt hier jeder Lese-Zugriff.
    const lesen = vi.spyOn(require('node:fs/promises'), 'readFile');
    try {
      const r = await io.readAssembledDocument(notiz, text);
      expect(r.geteilt).toBe(false);
      expect(r.path).toBe(notiz);
      expect(r.text).toBe(text);
      const draussen = lesen.mock.calls
        .map(([p]) => String(p))
        .filter((p) => path.resolve(p).startsWith(s.aussen));
      expect(draussen).toEqual([]);
    } finally {
      lesen.mockRestore();
    }
    expect(lies(s.geheimMdd)).toBe(s.mddText);
  });

  it('Lese-Weg: Ein Folgeteil außerhalb des Ordners wird nicht gelesen', async () => {
    const s = sandbox();
    const [io] = ladeMitErsatz(
      {
        [PFAD_ZUSAMMENSETZEN]: (echt) => ({
          ...echt,
          orderPartFiles: () => ({
            parts: [
              { index: 1, basename: 'Bericht' },
              { index: 2, basename: '../../Privat/Geheim' },
            ],
            luecken: [],
            dubletten: [],
          }),
        }),
      },
      [PFAD_IO],
    );
    const kopf = path.join(s.ordner, 'Bericht.md');
    const text = writePartLine('# Bericht\n\nErster Teil.\n', { index: 1, base: 'Bericht' }).text;
    fs.writeFileSync(kopf, text, 'utf8');
    const r = await io.readAssembledDocument(kopf, text);
    expect(r.geteilt).toBe(false);
    expect(r.text).toBe(text);
    expect(r.text).not.toContain('Kontonummer');
  });

  it('Öffnen: Ein Kopf-Pfad außerhalb des Ordners geht nicht an den Editor', async () => {
    const s = sandbox();
    const [kanalModul] = ladeMitErsatz(
      {
        [PFAD_IO]: (echt) => ({
          ...echt,
          readAssembledDocument: async () => ({
            ok: true,
            geteilt: true,
            path: s.geheim,
            text: s.geheimText,
          }),
        }),
      },
      [PFAD_KANAELE],
    );
    const k = kanaele(s.bereich, kanalModul.registerFilesIpc);
    const { notiz } = praeparierteNotiz(s.ordner, 'Geheim');
    expect(await k.lese(notiz)).toEqual({ ok: false, error: 'outside-area' });
    expect(k.spur.beobachtet).toEqual([]);
    expect(k.spur.historieBeimOeffnen).toEqual([]);
  });

  it('Speichern: Ein Ziel-Pfad außerhalb des Ordners wird nicht beschrieben', async () => {
    const s = sandbox();
    const [kanalModul] = ladeMitErsatz(
      {
        [PFAD_IO]: (echt) => ({
          ...echt,
          readStateForSave: async () => ({
            ok: true,
            geteilt: false,
            text: s.geheimText,
            teile: [],
            basisName: 'Geheim',
            headPath: s.geheim,
            fehlend: [],
          }),
        }),
      },
      [PFAD_KANAELE],
    );
    const k = kanaele(s.bereich, kanalModul.registerFilesIpc);
    const { notiz, text } = praeparierteNotiz(s.ordner, 'Geheim');
    const r = await k.speichere(notiz, 'Fremder Text.\n', {});
    expect(r).toEqual({ ok: false, error: 'outside-folder' });
    expect(lies(s.geheim)).toBe(s.geheimText);
    expect(lies(notiz)).toBe(text);
    expect(k.spur.historieBeimSpeichern).toEqual([]);
  });
});
