// @vitest-environment jsdom
// 4T-002793 (Epic 3E-000434): Der Fenster-Teil fragt ueber die Bruecke
// `kommentarImCode`, ob ein %%-Marker in einem Code-Stueck der Anzeige liegt
// (4T-002792). Geprueft wird hier, was nur im Fenster-Teil entschieden ist:
//
//   - AK1: Der Zwischenspeicher der Kommentar-Bereiche des Editors
//     (computeCommentRanges) verfaellt beim Umschalten einer Erweiterung, weil
//     die Antwort der Bruecke am Schalt-Zustand haengt (Formel aus: ein
//     Backtick in einer Formel ist gewoehnlicher Text).
//   - Portable-Kennzeichnung: Fuer ein Dokument, das mit der Kennzeichnung
//     beginnt, fragt der Fenster-Teil die portable Fassung der Anzeige, sonst
//     die gewoehnliche; der Quelltext-Export laesst den Kommentar weg.
//
// Zur Pruefumgebung: Im gebauten Fenster-Teil gibt es den Abtaster einmal, und
// kommentar-code-frage.js meldet an ihm die Bruecke an. Unter vitest laedt der
// Editor (ueber das Sammel-Modul plugins.js) eine andere Modul-Instanz als der
// direkte Import in kommentar-code-frage.js; an ihr meldet der Kern
// (markdown.js) seinen Zerleger selbst an. Wo der Weg ueber die Bruecke
// gemessen wird, meldet der Aufbau deshalb an dieser Instanz dieselbe Frage an,
// die kommentar-code-frage.js im Programm anmeldet.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BESTAND_ZEITLIMIT } from '../../zeitlimits.js';
import { createRequire } from 'node:module';
import { EditorState } from '@codemirror/state';
import './api-stub.js';

const require = createRequire(import.meta.url);

// Der Waechter am Ende der Datei liest jedes Modul des Fenster-Teils; die
// Setzung gilt datei-weit, Begruendung wie in doku-pfade.test.js.
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });

const { computeCommentRanges } =
  await import('../../../src/renderer/modules/live/live-marker-fields.js');
const { applyExtensionsState, resetExtensionStateForTests } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { quelltextFuerExport } =
  await import('../../../src/renderer/modules/views/quelltext-export.js');
const { kommentarCodeFrage } =
  await import('../../../src/renderer/modules/app/kommentar-code-frage.js');
// Die Instanz, an der kommentar-code-frage.js die Bruecke angemeldet hat.
const { findPercentCommentRanges } =
  await import('../../../src/shared/markdown/plugins/comments.js');

const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;
const PORTABEL = '<!-- perspective-portable -->\n\n';

// Konstellationen der Klaerung (test/unit/render/prozent-kommentare.test.js).
const FALL_2 = `Die Taste \` liegt oben links.\n\nPreis vereinbart. ${K} Ende.\n\nDas Zeichen \` heißt Gravis.\n`;
const FORMEL = `Formel $a \` b$ und ${K} sowie $c \` d$ Ende\n`;
const CODE_STUECK = `Taste \` gedrückt, ${K} dann Taste \` losgelassen.\n`;

const doc = (text) => EditorState.create({ doc: text }).doc;

const kern = require('../../../src/shared/markdown/markdown.js');
// Die Instanz des Abtasters, die der Editor unter vitest liest.
const editorAbtaster = require('../../../src/shared/markdown/plugins/comments.js');

const api = window.api;
const apiVorher = {
  kommentarImCode: api.kommentarImCode,
  configureExtensions: api.configureExtensions,
};

// Die Anmeldung von kommentar-code-frage.js, an der Instanz des Editors.
function brueckeAnmelden() {
  editorAbtaster.setzeCodeFrage(
    (stueck) => kommentarCodeFrage(stueck, false),
    (stueck) => kommentarCodeFrage(stueck, true),
  );
}

beforeEach(() => {
  // Das Umschalten fuehrt die Pipeline des Kerns nach, wie im Programm.
  api.configureExtensions = (ids) => kern.configureExtensions(ids);
  api.kommentarImCode = require('../../../src/shared/markdown/plugins/comments.js').kommentarImCode;
});

afterEach(() => {
  resetExtensionStateForTests();
  kern.configureExtensions([]);
  editorAbtaster.meldeZerlegerAn(kern.md, kern.mdPortable);
  api.kommentarImCode = apiVorher.kommentarImCode;
  api.configureExtensions = apiVorher.configureExtensions;
});

describe('Zwischenspeicher der Kommentar-Bereiche im Editor (AK1)', () => {
  it('gleiche Dokument-Fassung: wechselt die Antwort der Bruecke mit dem Umschalten, liefert computeCommentRanges die neuen Bereiche', async () => {
    // Attrappe der Bruecke; der Kern bleibt aussen vor, sonst meldete sein
    // Neuaufbau an der Instanz des Editors wieder den eigenen Zerleger an.
    let imCode = false;
    api.kommentarImCode = () => imCode;
    api.configureExtensions = () => {};
    brueckeAnmelden();
    const fassung = doc(CODE_STUECK);
    expect(computeCommentRanges(fassung)).toHaveLength(1);
    // Gegenprobe: Ohne Umschalten gilt der Zwischenspeicher der Fassung weiter.
    imCode = true;
    expect(computeCommentRanges(fassung)).toHaveLength(1);
    // Umschalten einer beliebigen Erweiterung verwirft ihn.
    await applyExtensionsState(['highlight'], { persist: false });
    expect(computeCommentRanges(fassung)).toEqual([]);
    imCode = false;
    await applyExtensionsState([], { persist: false });
    expect(computeCommentRanges(fassung)).toHaveLength(1);
  });

  it('mit dem echten Kern: Formel aus macht aus den Backticks ein Code-Stueck, Formel an wieder einen Kommentar', async () => {
    const fassung = doc(FORMEL);
    expect(computeCommentRanges(fassung)).toHaveLength(1);
    await applyExtensionsState(['katex'], { persist: false });
    expect(computeCommentRanges(fassung)).toEqual([]);
    await applyExtensionsState([], { persist: false });
    expect(computeCommentRanges(fassung)).toHaveLength(1);
  });
});

describe('Dokument mit Portable-Kennzeichnung im Fenster-Teil', () => {
  function mitschreibendeBruecke() {
    const aufrufe = [];
    api.kommentarImCode = (stueck, portabel) => {
      aufrufe.push(portabel);
      return false;
    };
    return aufrufe;
  }

  it('fragt die Bruecke mit portabel === true, wenn der Text mit der Kennzeichnung beginnt', () => {
    const aufrufe = mitschreibendeBruecke();
    findPercentCommentRanges(PORTABEL + CODE_STUECK);
    expect(aufrufe.length).toBeGreaterThan(0);
    expect(aufrufe.every((p) => p === true)).toBe(true);
  });

  it('fragt sonst mit portabel === false', () => {
    const aufrufe = mitschreibendeBruecke();
    findPercentCommentRanges(CODE_STUECK);
    expect(aufrufe.length).toBeGreaterThan(0);
    expect(aufrufe.every((p) => p === false)).toBe(true);
  });

  it('der Editor fragt fuer ein solches Dokument ebenso die portable Fassung', () => {
    const aufrufe = mitschreibendeBruecke();
    brueckeAnmelden();
    computeCommentRanges(doc(PORTABEL + CODE_STUECK));
    computeCommentRanges(doc(CODE_STUECK));
    // Je Dokument eine Frage: Die Attrappe verneint, der erste Marker beginnt
    // damit einen Kommentar, der den zweiten einschliesst.
    expect(aufrufe).toEqual([true, false]);
  });

  it('der Quelltext-Export entfernt den Kommentar im gemeldeten Fall 2', () => {
    const aus = quelltextFuerExport(PORTABEL + FALL_2, true);
    expect(aus).not.toContain(GEHEIM);
    expect(aus.split('\n')).toHaveLength((PORTABEL + FALL_2).split('\n').length);
  });

  it('Gegenprobe mit dem echten Kern: ein echtes Code-Stueck bleibt auch im portablen Dokument stehen', () => {
    expect(quelltextFuerExport(PORTABEL + CODE_STUECK, true)).toContain(GEHEIM);
  });
});

// ---------------------------------------------------------------------------
// Waechter (Befund 4 der zweiten Zweitblick-Runde zu 3E-000434): Jedes Modul
// des Fenster-Teils, das den Scanner der %%-Kommentare ruft oder den Tafel-Kern
// laedt (der ihn ruft), fuehrt kommentar-code-frage.js selbst ein. Ohne die
// Anmeldung gaelte dort jeder Marker als Kommentar, auch der in einem
// Code-Stueck; die Anmeldung soll nicht daran haengen, dass ein anderes Modul
// des Buendels sie mitbringt.
describe('Anmeldung der Code-Frage in jedem Verwender des Fenster-Teils (3E-000434)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const WURZEL = path.resolve(__dirname, '..', '..', '..', 'src', 'renderer', 'modules');
  const BRAUCHT_ANMELDUNG = [
    /from '[^']*shared\/markdown\/plugins\/comments\.js'/,
    /from '[^']*shared\/kanban\/kanban-core\.js'/,
    /import \{[^}]*\b(findPercentCommentRanges|stripPercentComments)\b[^}]*\} from '[^']*shared\/markdown\/plugins\.js'/,
  ];

  function moduleUnter(ordner) {
    const treffer = [];
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) treffer.push(...moduleUnter(voll));
      else if (eintrag.name.endsWith('.js')) treffer.push(voll);
    }
    return treffer;
  }

  it('kein Verwender ohne Import von kommentar-code-frage.js', () => {
    const verwender = [];
    const ohneAnmeldung = [];
    for (const datei of moduleUnter(WURZEL)) {
      if (datei.endsWith('kommentar-code-frage.js')) continue;
      const text = fs.readFileSync(datei, 'utf8');
      if (!BRAUCHT_ANMELDUNG.some((re) => re.test(text))) continue;
      const name = path.relative(WURZEL, datei).replace(/\\/g, '/');
      verwender.push(name);
      if (!/import '[^']*app\/kommentar-code-frage\.js';/.test(text)) ohneAnmeldung.push(name);
    }
    expect(ohneAnmeldung).toEqual([]);
    // Der Waechter muss die bekannten Verwender ueberhaupt finden.
    expect(verwender).toEqual(
      expect.arrayContaining([
        'live/live-marker-fields.js',
        'views/quelltext-export.js',
        'kanban/kanban-tags.js',
        'kanban/kanban-pane.js',
      ]),
    );
  });
});
