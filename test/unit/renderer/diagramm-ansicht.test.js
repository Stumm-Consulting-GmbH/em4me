// @vitest-environment jsdom
// 4T-002021 (Epic 3E-000192): Der Schritt der Diagramme im Anzeige-Prozess
// (src/renderer/modules/charts/chart-view.js) und der Text einer Einbettung
// (chart-embedding.js).
//
// Die Brücke `api.buildChart` ist hier eine Attrappe: Gegenstand ist, was der
// Schritt aus ihrem Ergebnis macht und welche Angaben er ihr reicht, nicht das
// Zeichnen selbst (test/unit/preload-diagramme.test.js). Dass die Grafik in der
// realen Anordnung sichtbar ist, weist die Ablauf-Prüfdatei
// test/e2e/funktionen/diagramme.spec.js nach.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

const aufrufe = [];
let antwort = null;
window.api.buildChart = (text, body, optionen, tabellenDokument) => {
  aufrufe.push({ text, body, optionen, tabellenDokument });
  if (antwort instanceof Error) throw antwort;
  return typeof antwort === 'function' ? antwort(text, body, optionen, tabellenDokument) : antwort;
};
// 4T-002023: Der Lese-Kanal des anderen Dokuments, je Prüffall gestellt.
const lesungen = [];
let lies = async () => ({ ok: false, error: 'not found' });
window.api.readChartTableDocument = (basePath, file) => {
  lesungen.push({ basePath, file });
  return lies(basePath, file);
};

const {
  CHART_IDLE_TIMEOUT_MS,
  applyPerspectiveChartsIfPresent,
  chartColorKey,
  frischeDiagrammeAuf,
  laufendeDiagrammLesungenCount,
  meldeDiagrammZielAenderung,
  waitForChartsIdle,
  warteAufDiagrammeDerAusgabe,
  zeichneDiagrammeFuerAusgabe,
} = await import('../../../src/renderer/modules/charts/chart-view.js');
const { zielStand, gleicherPfad, merkeZiel, zielPruefer } =
  await import('../../../src/renderer/modules/charts/chart-targets.js');
const { dokumentTextEinerEinbettung } =
  await import('../../../src/renderer/modules/charts/chart-embedding.js');
const { setColorSchemeState } = await import('../../../src/renderer/modules/color-schemes.js');
const { BASE_DEFAULTS } = await import('../../../src/shared/color-schemes.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.resolve(HERE, '..', '..', '..', 'src', 'renderer');

// Bestands-Lesung im Modulkopf (test/README.md, «Bestands-Lesungen gehören in
// den Modulkopf»): alle Quell-Module des Anzeige-Prozesses, die den Zeichner
// oder die Zeichen-Bibliothek nennen, und der erzeugte Stand, falls gebaut.
const ZEICHNER_TREFFER = [];
let GEPRUEFTE_MODULE = 0;
(function gehe(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const voll = path.join(dir, e.name);
    if (e.isDirectory()) gehe(voll);
    else if (e.name.endsWith('.js') && !e.name.endsWith('.bundle.js')) {
      GEPRUEFTE_MODULE += 1;
      if (/chart-draw|echarts\.bundle/.test(fs.readFileSync(voll, 'utf8'))) {
        ZEICHNER_TREFFER.push(path.relative(RENDERER, voll));
      }
    }
  }
})(RENDERER);
const BUNDLE = path.join(RENDERER, 'renderer.bundle.js');
const BUNDLE_TEXT = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : null;

function container(...bodies) {
  const wurzel = document.createElement('div');
  wurzel.className = 'markdown-body';
  bodies.forEach((body, i) => {
    const block = document.createElement('div');
    block.className = 'perspective-chart';
    block.dataset.chartIndex = String(i);
    block.dataset.chartSource = body;
    wurzel.appendChild(block);
  });
  document.body.appendChild(wurzel);
  return wurzel;
}

const GEZEICHNET = { status: 'drawn', svg: '<svg role="img"><title>T</title></svg>', omitted: 2 };

// Ein Versprechen, das der Prüffall selbst einlöst: So lässt sich die
// Reihenfolge zweier Antworten des Lese-Kanals festlegen.
function aufschub() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Länger als die Entprellung des Beobachters (50 ms): Ein geplantes Neu-Zeichnen
// ist danach gelaufen.
const warte = () => new Promise((r) => setTimeout(r, 120));

// 4T-002153: Das Zurücksetzen der Farben am Wurzel-Element ist für den
// Beobachter der Diagramm-Ansicht ein Farbwechsel; er plant ein entprelltes
// Neu-Zeichnen (50 ms), das sonst in den nächsten Prüffall fällt und dort eine
// zweite Lesung beginnt. Gesetzt wird deshalb nur, was abweicht, und ein
// geplantes Neu-Zeichnen läuft hier bei leerem `body` ab, nach dem Muster des
// Aufbaus im Block «Ausgabe in Druck und PDF».
beforeEach(async () => {
  aufrufe.length = 0;
  lesungen.length = 0;
  lies = async () => ({ ok: false, error: 'not found' });
  antwort = GEZEICHNET;
  document.body.innerHTML = '';
  const wurzel = document.documentElement;
  if (!wurzel.hasAttribute('style') && wurzel.getAttribute('data-theme') === 'light') return;
  wurzel.removeAttribute('style');
  wurzel.setAttribute('data-theme', 'light');
  await warte();
});

describe('Der Zeichner bleibt aus dem Anzeige-Prozess (4T-002021, D2)', () => {
  it('kein Modul unter src/renderer lädt den Zeichner oder die Zeichen-Bibliothek', () => {
    // Ein statischer Import zöge rund ein halbes Megabyte in das Bündel des
    // Anzeige-Prozesses; gezeichnet wird über die Brücke im Preload.
    // Untere Schranke gegen einen leer laufenden Scan: Findet er verdächtig
    // wenige Module, liest der Wächter den falschen Baum.
    expect(GEPRUEFTE_MODULE).toBeGreaterThan(300);
    expect(ZEICHNER_TREFFER).toEqual([]);
  });

  it('der erzeugte Stand des Anzeige-Prozesses enthält die Bibliothek nicht', () => {
    // Nur prüfbar, wenn gebaut ist; der Bau ist Vorbedingung jeder Ablauf-Prüfung.
    if (BUNDLE_TEXT === null) return;
    expect(BUNDLE_TEXT).not.toMatch(/zrender|echarts\.bundle/);
  });
});

describe('Schritt der Befüllung: Ergebnis am Container (4T-002021, D4)', () => {
  it('gezeichnet: Grafik im Container, Zustand und ausgelassene Werte', () => {
    const wurzel = container('table: ^umsatz');
    applyPerspectiveChartsIfPresent(wurzel, '/a/Dok.md', { dokumentText: 'TEXT' });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.querySelector('svg')).not.toBeNull();
    expect(block.dataset.chartState).toBe('drawn');
    expect(block.dataset.chartOmitted).toBe('2');
    expect(aufrufe[0].text).toBe('TEXT');
    expect(aufrufe[0].body).toBe('table: ^umsatz');
  });

  it('nicht zeichenbar: Kennungen als Attribute, Hinweis statt Code-Block, kein HTML', () => {
    // 4T-002022: Der vorläufige Rückfall auf den Block-Inhalt ist durch den
    // Hinweis ersetzt (Texte: test/unit/renderer/diagramm-hinweis.test.js).
    antwort = {
      status: 'undrawable',
      reason: 'selection-invalid',
      detail: '<img src=x>',
      tableName: 'umsatz',
      file: null,
    };
    const wurzel = container('table: ^<b>fehlt</b>');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: '' });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.classList.contains('perspective-chart--undrawable')).toBe(true);
    expect(block.dataset.chartReason).toBe('selection-invalid');
    expect(block.dataset.chartDetail).toBe('<img src=x>');
    expect(block.querySelector('img')).toBeNull();
    expect(block.querySelector('b')).toBeNull();
    expect(block.querySelector('pre')).toBeNull();
    expect(block.querySelector('.perspective-chart-hint[role="note"]')).not.toBeNull();
    // Ohne geladenen Katalog steht der Schlüssel; der Satz entsteht trotzdem.
    expect(block.querySelector('.perspective-chart-hint-reason')).not.toBeNull();
  });

  it('anderes Dokument: Kennzeichen am Container, leer, bis die Lesung antwortet', async () => {
    antwort = { status: 'pending', target: { file: 'B', name: 'x' } };
    const offen = aufschub();
    lies = () => offen.promise;
    const wurzel = container('table: [[B#^x]]');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: '' });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.dataset.chartPending).toBe('other-document');
    expect(block.dataset.chartState).toBe('pending');
    expect(block.dataset.chartRefFile).toBe('B');
    expect(block.childNodes).toHaveLength(0);
    offen.resolve({ ok: false, error: 'not found' });
    await waitForChartsIdle();
  });

  it('ein Fehler der Brücke bricht die Ansicht nicht ab: Rückfall auf den Code-Block', () => {
    antwort = new TypeError('kaputt');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wurzel = container('a: 1', 'b: 2');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: '' });
    const [erster, zweiter] = wurzel.querySelectorAll('.perspective-chart');
    expect(erster.dataset.chartState).toBe('error');
    expect(zweiter.dataset.chartState).toBe('error');
    expect(erster.querySelector('pre code').textContent).toBe('a: 1');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ein schon gezeichnetes Diagramm eines inneren Teilbaums bleibt unberührt', () => {
    const wurzel = container('x');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: 'INNEN' });
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: 'AUSSEN' });
    expect(aufrufe.map((a) => a.text)).toEqual(['INNEN']);
  });
});

describe('Schritt der Befüllung: Angaben an die Brücke (4T-002021, D6, D8)', () => {
  it('eindeutige Kennungen je Ansicht und Container', () => {
    const wurzel = container('a', 'b');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: '', kennung: 'p1' });
    expect(aufrufe.map((a) => a.optionen.idPrefix)).toEqual(['ch-p1-0', 'ch-p1-1']);
    const zweite = container('c');
    applyPerspectiveChartsIfPresent(zweite, '', { dokumentText: '' });
    const dritte = container('d');
    applyPerspectiveChartsIfPresent(dritte, '', { dokumentText: '', art: 'live' });
    const [, , teil, live] = aufrufe.map((a) => a.optionen.idPrefix);
    expect(teil).toMatch(/^ch-t\d+-0$/);
    expect(live).toMatch(/^ch-l\d+-0$/);
  });

  it('Farben aus den wirksamen Variablen, Rückfall nach dem Modus, durchsichtiger Hintergrund', () => {
    const wurzel = document.documentElement;
    wurzel.style.setProperty('--fg', '#112233');
    wurzel.style.setProperty('--fg-muted', '#445566');
    wurzel.setAttribute('data-theme', 'dark');
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    const { colors } = aufrufe[0].optionen;
    expect(colors.text).toBe('#112233');
    expect(colors.muted).toBe('#445566');
    expect(colors.background).toBe('transparent');
    expect(colors.palette[0]).toBe('#7ea6d8');
  });

  it('ohne gesetzte Variablen gelten die Standard-Farben des Modus', () => {
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    expect(aufrufe[0].optionen.colors.text).toBe('#1f1f1f');
    expect(aufrufe[0].optionen.colors.muted).toBe('#6a6a6a');
    // 4T-002030: auch die zehn Reihen-Farben, als Rückfall je Platz.
    expect(aufrufe[0].optionen.colors.palette).toEqual(
      Array.from({ length: 10 }, (_, i) => BASE_DEFAULTS.light[`chart${i + 1}`]),
    );
  });

  // 4T-002030 (Epic 3E-000192): Das Farbschema ist die einzige Quelle der
  // Reihen-Farben; gelesen werden die wirksamen Werte der zehn Variablen.
  it('Reihen-Farben aus den zehn Variablen des Farbschemas, in der Reihenfolge der Reihen', () => {
    const wurzel = document.documentElement;
    wurzel.style.setProperty('--chart-1', '#010203');
    wurzel.style.setProperty('--chart-10', '#0a0b0c');
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    const { palette } = aufrufe[0].optionen.colors;
    expect(palette).toHaveLength(10);
    expect(palette[0]).toBe('#010203');
    expect(palette[9]).toBe('#0a0b0c');
    expect(palette.slice(1, 9)).toEqual(
      Array.from({ length: 8 }, (_, i) => BASE_DEFAULTS.light[`chart${i + 2}`]),
    );
  });

  it('die Schrift der gerenderten Ansicht, aufgelöst und ohne doppelte Anführungszeichen', () => {
    const wurzel = document.documentElement;
    wurzel.style.setProperty('--font-ui', '"Segoe UI", system-ui, sans-serif');
    wurzel.style.setProperty('--render-font-family', 'var(--font-ui)');
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    expect(aufrufe[0].optionen.fontFamily).toBe("'Segoe UI', system-ui, sans-serif");
  });

  it('die Vorlese-Texte kommen übersetzt herein', () => {
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    const texte = aufrufe[0].optionen.descriptionTexts;
    expect(Object.keys(texte).sort()).toEqual(
      [
        'bar',
        'categoriesOne',
        'categoriesOther',
        'donut',
        'line',
        'pie',
        'seriesOne',
        'seriesOther',
      ].sort(),
    );
  });

  it('der Dokument-Text der Vollansicht wird bei jedem Zeichnen neu gelesen', () => {
    let puffer = 'ERSTER';
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: () => puffer });
    puffer = 'ZWEITER';
    expect(aufrufe[0].text).toBe('ERSTER');
    // Das Neu-Zeichnen nach einem Farbwechsel prüft der nächste Block.
  });
});

describe('Neu zeichnen beim Farbwechsel (4T-002021, D7)', () => {
  it('ein neues Farbschema zeichnet die Ansicht neu, mit dem aktuellen Puffer', async () => {
    let puffer = 'VORHER';
    const wurzel = container('a');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => puffer });
    expect(aufrufe).toHaveLength(1);
    puffer = 'NACHHER';
    document.documentElement.style.setProperty('--fg', '#aa0000');
    await warte();
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[1].text).toBe('NACHHER');
    expect(aufrufe[1].optionen.colors.text).toBe('#aa0000');
    // Der Container zeigt die neue Grafik an Ort und Stelle; ein
    // übersprungenes Neu-Rendern der Ansicht (Render-Skip-Cache) hält damit
    // keine alten Farben fest.
    expect(wurzel.querySelector('.perspective-chart').dataset.chartState).toBe('drawn');
  });

  it('der Wechsel Hell/Dunkel zeichnet ebenso neu, entprellt zu einem Durchgang', async () => {
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.setProperty('--fg', '#e6e6e6');
    await warte();
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[1].optionen.colors.palette[0]).toBe('#7ea6d8');
  });

  it('ein Live-Widget wird nicht an Ort und Stelle umgezeichnet', async () => {
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);
    const widget = container('a');
    editor.appendChild(widget);
    applyPerspectiveChartsIfPresent(widget, '', { dokumentText: '', art: 'live' });
    document.documentElement.style.setProperty('--fg', '#00aa00');
    await warte();
    expect(aufrufe).toHaveLength(1);
  });

  // 4T-002030: der Weg der Einstellungs-Seite. Ein Farbwähler ruft über die
  // Vorschau `setColorSchemeState` (settings-color-schemes.js,
  // previewColorSchemes), das die abweichende Farbe als Variable am
  // Wurzel-Element setzt; Kennung der Live-Widgets und Ansicht folgen.
  it('die Änderung einer Reihen-Farbe im Farbschema setzt die Variable und zeichnet neu', async () => {
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    const vorher = chartColorKey();
    setColorSchemeState({
      custom: [{ id: 'c1', name: 'C', base: 'light', colors: { chart1: '#123456' } }],
      activeLight: 'c1',
      activeDark: 'amber-dark',
    });
    expect(document.documentElement.style.getPropertyValue('--chart-1')).toBe('#123456');
    expect(chartColorKey()).not.toBe(vorher);
    await warte();
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[1].optionen.colors.palette[0]).toBe('#123456');
    // Zurück auf ein mitgeliefertes Schema: die Variable ist geräumt, es
    // gilt wieder die Vorgabe.
    setColorSchemeState({ custom: [], activeLight: 'standard-light', activeDark: 'amber-dark' });
    expect(document.documentElement.style.getPropertyValue('--chart-1')).toBe('');
    await warte();
    expect(aufrufe[2].optionen.colors.palette[0]).toBe(BASE_DEFAULTS.light.chart1);
  });

  it('die Farb-Kennung der Live-Widgets folgt Modus und Farbschema', () => {
    const vorher = chartColorKey();
    document.documentElement.style.setProperty('--fg', '#123456');
    const schema = chartColorKey();
    document.documentElement.setAttribute('data-theme', 'dark');
    const modus = chartColorKey();
    expect(new Set([vorher, schema, modus]).size).toBe(3);
  });
});

// 4T-002023 (Epic 3E-000192, Story 4S-001023): Die Tabelle in einem anderen
// Dokument — Lesen über den Kanal, zweite Frage an die Brücke, Wettlauf,
// Zusammenlegen, Barriere und Auffrischen. Die Attrappe der Brücke antwortet
// wie die echte: ohne Antwort des Kanals `pending`, mit Text gezeichnet, ohne
// Text «Dokument fehlt».
describe('Tabelle in einem anderen Dokument (4T-002023)', () => {
  const BEZUG = 'table: [[A#^umsatz]]';

  function wieDieBruecke(_text, body, _optionen, dokument) {
    const file = /\[\[([^#]+)#/.exec(body)[1];
    if (!dokument) return { status: 'pending', target: { file, name: 'umsatz' } };
    if (dokument.ok !== true) {
      return { status: 'undrawable', reason: 'document-missing', detail: file, file };
    }
    return { status: 'drawn', svg: `<svg><title>${dokument.content}</title></svg>`, omitted: 0 };
  }

  beforeEach(() => {
    antwort = wieDieBruecke;
  });

  it('liest das andere Dokument und zeichnet mit seinem Text (AK1)', async () => {
    lies = async () => ({ ok: true, path: 'C:\\x\\A.md', content: 'STAND-1', quelle: 'platte' });
    const wurzel = container(BEZUG);
    applyPerspectiveChartsIfPresent(wurzel, 'C:\\x\\B.md', { dokumentText: 'B' });
    await waitForChartsIdle();
    const block = wurzel.querySelector('.perspective-chart');
    expect(lesungen).toEqual([{ basePath: 'C:\\x\\B.md', file: 'A' }]);
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[1].tabellenDokument).toMatchObject({ ok: true, content: 'STAND-1' });
    expect(block.dataset.chartState).toBe('drawn');
    expect(block.dataset.chartTarget).toBe('C:\\x\\A.md');
    expect(block.dataset.chartPending).toBeUndefined();
    expect(block.querySelector('title').textContent).toBe('STAND-1');
  });

  it('ein fehlendes Dokument: Hinweis, Ort der Suche und Warten auf das Verzeichnis (AK8)', async () => {
    lies = async () => ({ ok: false, error: 'not found', path: '/x/A.md', indexBereit: false });
    const wurzel = container(BEZUG);
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.dataset.chartState).toBe('undrawable');
    expect(block.dataset.chartReason).toBe('document-missing');
    expect(block.dataset.chartTarget).toBe('/x/A.md');
    expect(block.dataset.chartWartet).toBe('index');
    expect(block.querySelector('.perspective-chart-hint')).not.toBeNull();
  });

  it('mehrere Diagramme auf dieselbe Tabelle lesen einmal (AK3)', async () => {
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'S' });
    const wurzel = container(BEZUG, BEZUG, BEZUG);
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    expect(lesungen).toHaveLength(1);
    for (const block of wurzel.querySelectorAll('.perspective-chart')) {
      expect(block.dataset.chartState).toBe('drawn');
    }
  });

  it('die Barriere wartet auf laufende Lesungen und zählt sie', async () => {
    const offen = aufschub();
    lies = () => offen.promise;
    const wurzel = container(BEZUG);
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    expect(laufendeDiagrammLesungenCount()).toBe(1);
    let fertig = false;
    const warten = waitForChartsIdle().then(() => {
      fertig = true;
    });
    await Promise.resolve();
    expect(fertig).toBe(false);
    offen.resolve({ ok: true, path: '/x/A.md', content: 'S' });
    await warten;
    expect(laufendeDiagrammLesungenCount()).toBe(0);
    expect(wurzel.querySelector('.perspective-chart').dataset.chartState).toBe('drawn');
  });

  it('die Barriere gibt nach ihrer Zeit-Grenze nach, wenn eine Lesung hängt', async () => {
    const offen = aufschub();
    lies = () => offen.promise;
    applyPerspectiveChartsIfPresent(container(BEZUG), '/x/B.md', { dokumentText: '' });
    // Schein-Uhr: Die Zeit-Grenze wird vorgestellt, nicht abgewartet.
    vi.useFakeTimers();
    try {
      let fertig = false;
      const warten = waitForChartsIdle(5000).then(() => (fertig = true));
      await vi.advanceTimersByTimeAsync(4999);
      expect(fertig).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await warten;
      expect(fertig).toBe(true);
      expect(laufendeDiagrammLesungenCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    offen.resolve({ ok: false });
    await waitForChartsIdle();
  });

  it('ein veraltetes Ergebnis wird verworfen: das jüngere Zeichnen gewinnt', async () => {
    const alt = aufschub();
    const neu = aufschub();
    const antworten = [alt.promise, neu.promise];
    lies = () => antworten.shift();
    const wurzel = container(BEZUG);
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    meldeDiagrammZielAenderung('/x/A.md');
    const auffrischen = frischeDiagrammeAuf(wurzel, '/x/A.md');
    expect(lesungen).toHaveLength(2);
    neu.resolve({ ok: true, path: '/x/A.md', content: 'NEU' });
    await auffrischen;
    alt.resolve({ ok: true, path: '/x/A.md', content: 'ALT' });
    await waitForChartsIdle();
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.querySelector('title').textContent).toBe('NEU');
  });

  it('eine Meldung trennt neue Lesungen von einer laufenden vom alten Stand', async () => {
    const alt = aufschub();
    lies = () => alt.promise;
    const eins = container(BEZUG);
    applyPerspectiveChartsIfPresent(eins, '/x/B.md', { dokumentText: '' });
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'NEU' });
    // Ohne Meldung schließt ein zweites Diagramm an die laufende Lesung an …
    const zwei = container(BEZUG);
    applyPerspectiveChartsIfPresent(zwei, '/x/B.md', { dokumentText: '' });
    expect(lesungen).toHaveLength(1);
    // … nach der Meldung fragt ein drittes neu.
    meldeDiagrammZielAenderung('/x/A.md');
    const drei = container(BEZUG);
    applyPerspectiveChartsIfPresent(drei, '/x/B.md', { dokumentText: '' });
    expect(lesungen).toHaveLength(2);
    alt.resolve({ ok: true, path: '/x/A.md', content: 'ALT' });
    await waitForChartsIdle();
    expect(drei.querySelector('title').textContent).toBe('NEU');
  });

  it('Auffrischen trifft nur Diagramme dieses Ziels, gleich in welcher Schreibweise des Pfads', async () => {
    let stand = 'EINS';
    lies = async (_basis, file) => ({ ok: true, path: `C:\\x\\${file}.md`, content: stand });
    const wurzel = container(BEZUG, 'table: [[Anders#^umsatz]]', 'table: ^eigen');
    antwort = (text, body, optionen, dokument) =>
      body === 'table: ^eigen' ? GEZEICHNET : wieDieBruecke(text, body, optionen, dokument);
    applyPerspectiveChartsIfPresent(wurzel, 'C:\\x\\B.md', { dokumentText: '' });
    await waitForChartsIdle();
    expect(lesungen).toHaveLength(2);
    stand = 'ZWEI';
    meldeDiagrammZielAenderung('c:/X/a.md');
    expect(await frischeDiagrammeAuf(wurzel, 'c:/X/a.md')).toBe(1);
    const [a, anders] = wurzel.querySelectorAll('.perspective-chart');
    expect(lesungen.map((l) => l.file)).toEqual(['A', 'Anders', 'A']);
    expect(a.querySelector('title').textContent).toBe('ZWEI');
    expect(anders.querySelector('title').textContent).toBe('EINS');
  });

  it('ohne Pfad frischen allein die Diagramme mit fehlendem Dokument auf (Verzeichnis bereit)', async () => {
    let da = false;
    lies = async (_basis, file) =>
      file === 'A' && !da
        ? { ok: false, error: 'not found', path: '/x/A.md', indexBereit: false }
        : { ok: true, path: `/x/${file}.md`, content: file };
    const wurzel = container(BEZUG, 'table: [[C#^umsatz]]');
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    da = true;
    meldeDiagrammZielAenderung(null);
    expect(await frischeDiagrammeAuf(wurzel, null)).toBe(1);
    const [a] = wurzel.querySelectorAll('.perspective-chart');
    expect(lesungen.map((l) => l.file)).toEqual(['A', 'C', 'A']);
    expect(a.dataset.chartState).toBe('drawn');
    expect(a.dataset.chartWartet).toBeUndefined();
  });

  it('kein Flackern: beim Auffrischen bleibt das alte Bild stehen, bis das neue da ist (W6)', async () => {
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'ALT' });
    const wurzel = container(BEZUG);
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    const offen = aufschub();
    lies = () => offen.promise;
    meldeDiagrammZielAenderung('/x/A.md');
    const auffrischen = frischeDiagrammeAuf(wurzel, '/x/A.md');
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.dataset.chartState).toBe('pending');
    expect(block.querySelector('title').textContent).toBe('ALT');
    offen.resolve({ ok: true, path: '/x/A.md', content: 'NEU' });
    await auffrischen;
    expect(block.querySelector('title').textContent).toBe('NEU');
  });

  it('ein neues Live-Widget zeigt bis zur Antwort das zuletzt gezeichnete Bild', async () => {
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'ALT' });
    applyPerspectiveChartsIfPresent(container(BEZUG), '/x/B.md', { dokumentText: '', art: 'live' });
    await waitForChartsIdle();
    const offen = aufschub();
    lies = () => offen.promise;
    const nachfolger = container(BEZUG);
    applyPerspectiveChartsIfPresent(nachfolger, '/x/B.md', { dokumentText: '', art: 'live' });
    const block = nachfolger.querySelector('.perspective-chart');
    expect(block.dataset.chartState).toBe('pending');
    expect(block.querySelector('title').textContent).toBe('ALT');
    // Die Lese-Ansicht bekommt keinen Platzhalter; ihr Container bleibt ohnehin.
    const ansicht = container(BEZUG);
    applyPerspectiveChartsIfPresent(ansicht, '/x/B.md', { dokumentText: '' });
    expect(ansicht.querySelector('.perspective-chart').childNodes).toHaveLength(0);
    offen.resolve({ ok: true, path: '/x/A.md', content: 'NEU' });
    await waitForChartsIdle();
    expect(block.querySelector('title').textContent).toBe('NEU');
  });

  it('ein Live-Widget wird nicht an Ort und Stelle aufgefrischt, sein Schlüssel-Stand zählt', async () => {
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'S' });
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);
    const widget = container(BEZUG);
    editor.appendChild(widget);
    applyPerspectiveChartsIfPresent(widget, '/x/L.md', { dokumentText: '', art: 'live' });
    await waitForChartsIdle();
    const vorher = zielStand('/x/L.md', 'A');
    meldeDiagrammZielAenderung('/x/A.md');
    expect(zielStand('/x/L.md', 'A')).not.toBe(vorher);
    expect(await frischeDiagrammeAuf(editor, '/x/A.md')).toBe(1);
    expect(lesungen).toHaveLength(1);
    // Eine Meldung über fehlende Ziele lässt ein gefundenes unberührt.
    const gefunden = zielStand('/x/L.md', 'A');
    meldeDiagrammZielAenderung(null);
    expect(zielStand('/x/L.md', 'A')).toBe(gefunden);
  });

  it('der Pfad-Vergleich gleicht Trenner und Schreibweise an, leer trifft nie', () => {
    expect(gleicherPfad('C:\\Daten\\Ä.md', 'c:/daten/ä.md')).toBe(true);
    expect(gleicherPfad('C:\\Daten\\A.md', 'C:\\Daten\\B.md')).toBe(false);
    expect(gleicherPfad('', '')).toBe(false);
    expect(gleicherPfad(undefined, null)).toBe(false);
  });

  it('der Pfad-Vergleich hält zerlegte und zusammengesetzte Umlaute für gleich (NFD gegen NFC)', () => {
    const nfc = '/Daten/Übersicht.md'.normalize('NFC');
    const nfd = '/Daten/Übersicht.md'.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(gleicherPfad(nfd, nfc)).toBe(true);
    expect(zielPruefer([nfd])(nfc)).toBe(true);
  });

  it('eine Meldung nennt viele Dateien: ein Durchlauf, jedes betroffene Diagramm einmal (V1)', async () => {
    let stand = 'EINS';
    lies = async (_basis, file) => ({ ok: true, path: `/x/${file}.md`, content: stand });
    const wurzel = container(BEZUG, 'table: [[C#^umsatz]]', 'table: [[D#^umsatz]]');
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    stand = 'ZWEI';
    const menge = new Set(['/x/A.md', '/x/C.md', '/x/nicht-da.md']);
    meldeDiagrammZielAenderung(menge);
    expect(await frischeDiagrammeAuf(wurzel, menge)).toBe(2);
    expect(lesungen.map((l) => l.file)).toEqual(['A', 'C', 'D', 'A', 'C']);
    const titel = [...wurzel.querySelectorAll('.perspective-chart title')].map(
      (t) => t.textContent,
    );
    expect(titel).toEqual(['ZWEI', 'ZWEI', 'EINS']);
  });

  it('ein Diagramm in einer Einbettung im Live-Modus wird an Ort und Stelle neu gezeichnet (F2)', async () => {
    let stand = 'ALT';
    lies = async () => ({ ok: true, path: '/x/A.md', content: stand });
    // Die Einbettung hängt im Editor, ihr Teilbaum ist aber kein Live-Widget:
    // Er wird mit der Art «Ansicht» befüllt (applyTeilbaumSchritte).
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);
    const einbettung = container(BEZUG);
    editor.appendChild(einbettung);
    applyPerspectiveChartsIfPresent(einbettung, '/x/Notiz.md', { dokumentText: '' });
    await waitForChartsIdle();
    stand = 'NEU';
    meldeDiagrammZielAenderung('/x/A.md');
    expect(await frischeDiagrammeAuf(editor, '/x/A.md')).toBe(1);
    expect(einbettung.querySelector('title').textContent).toBe('NEU');
    // Dieselbe Weiche beim Farbwechsel: Auch dort zeichnet es neu.
    const vorher = aufrufe.length;
    document.documentElement.style.setProperty('--fg', '#abcdef');
    await new Promise((r) => setTimeout(r, 120));
    await waitForChartsIdle();
    expect(aufrufe.length).toBeGreaterThan(vorher);
    expect(aufrufe.at(-1).optionen.colors.text).toBe('#abcdef');
  });

  it('eine Meldung während der ersten Lesung eines Live-Widgets führt zu einer zweiten (F3)', async () => {
    const erste = aufschub();
    const antworten = [
      erste.promise,
      Promise.resolve({ ok: true, path: '/x/A.md', content: 'NEU' }),
    ];
    lies = () => antworten.shift();
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);
    const widget = container(BEZUG);
    editor.appendChild(widget);
    applyPerspectiveChartsIfPresent(widget, '/x/F3.md', { dokumentText: '', art: 'live' });
    // Der Pfad ist noch unbekannt: Die Meldung zählt keinen Stand hoch, und der
    // Editor baut das Widget nicht neu.
    const standVorher = zielStand('/x/F3.md', 'A');
    meldeDiagrammZielAenderung('/x/A.md');
    await frischeDiagrammeAuf(editor, '/x/A.md');
    expect(zielStand('/x/F3.md', 'A')).toBe(standVorher);
    erste.resolve({ ok: true, path: '/x/A.md', content: 'ALT' });
    await waitForChartsIdle();
    expect(lesungen).toHaveLength(2);
    expect(widget.querySelector('title').textContent).toBe('NEU');
  });

  it('Obergrenze der Ziel-Einträge: der älteste fällt, der Stand beginnt dann wieder bei null (V5)', () => {
    merkeZiel('/v5/B.md', 'Erstes', '/v5/Erstes.md', false);
    meldeDiagrammZielAenderung('/v5/Erstes.md');
    expect(zielStand('/v5/B.md', 'Erstes')).toBe('1');
    for (let i = 0; i < 1000; i++) merkeZiel('/v5/B.md', `Z${i}`, `/v5/Z${i}.md`, false);
    expect(zielStand('/v5/B.md', 'Erstes')).toBe('0');
    expect(zielStand('/v5/B.md', 'Z999')).toBe('0');
  });

  it('nach einem Farbwechsel steht kein Platzhalter in alten Farben (V5)', async () => {
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'ALT' });
    applyPerspectiveChartsIfPresent(container(BEZUG), '/x/V5.md', {
      dokumentText: '',
      art: 'live',
    });
    await waitForChartsIdle();
    document.documentElement.style.setProperty('--fg', '#123123');
    const offen = aufschub();
    lies = () => offen.promise;
    const nachfolger = container(BEZUG);
    applyPerspectiveChartsIfPresent(nachfolger, '/x/V5.md', { dokumentText: '', art: 'live' });
    expect(nachfolger.querySelector('.perspective-chart').childNodes).toHaveLength(0);
    offen.resolve({ ok: true, path: '/x/A.md', content: 'NEU' });
    await waitForChartsIdle();
  });
});

// 4T-002025 (Epic 3E-000192): Druck und PDF zeichnen die Diagramme sofort mit
// den hellen Farben, die die Druck-Vorbereitung gesetzt hat, statt auf das
// entprellte Neu-Zeichnen des Beobachters zu warten; zurück geht es über den
// Beobachter. Nachgestellt wird allein das Setzen und Zurückstellen der
// Farben am Wurzel-Element (print-preparation.js, Schritt 3 und `finally`).
describe('Ausgabe in Druck und PDF (4T-002025)', () => {
  const HELL_ERSTE = BASE_DEFAULTS.light.chart1;
  const DUNKEL_ERSTE = BASE_DEFAULTS.dark.chart1;

  function druckFarbenSetzen() {
    const wurzel = document.documentElement;
    wurzel.style.setProperty('--fg', BASE_DEFAULTS.light.text);
    wurzel.style.setProperty('--chart-1', HELL_ERSTE);
    wurzel.setAttribute('data-theme', 'light');
  }

  function druckFarbenZuruecknehmen() {
    const wurzel = document.documentElement;
    wurzel.style.removeProperty('--fg');
    wurzel.style.removeProperty('--chart-1');
    wurzel.setAttribute('data-theme', 'dark');
  }

  // Brücke: ein Verweis auf ein anderes Dokument wartet auf die Lesung, sonst
  // eine Grafik, deren Titel die erste Reihen-Farbe trägt.
  const FARBE_IM_TITEL = (_text, body, optionen, dokument) =>
    body.includes('[[') && !dokument
      ? { status: 'pending', target: { file: 'A', name: 'umsatz' } }
      : { status: 'drawn', svg: `<svg><title>${optionen.colors.palette[0]}</title></svg>` };

  beforeEach(async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    // Ein Neu-Zeichnen aus dem Aufbau (Wechsel auf Dunkel) ist vorbei, bevor
    // der Fall zählt.
    await warte();
  });

  it('verwirft das geplante Neu-Zeichnen des Beobachters und zeichnet sofort hell (AK3)', async () => {
    applyPerspectiveChartsIfPresent(container('a', 'b'), '', { dokumentText: '' });
    aufrufe.length = 0;
    druckFarbenSetzen();
    // Die Einträge sind zugestellt, der Zeitgeber des Beobachters (50 ms) ist
    // gestellt, aber noch nicht abgelaufen.
    await new Promise((r) => setTimeout(r, 0));
    zeichneDiagrammeFuerAusgabe();
    expect(aufrufe).toHaveLength(2);
    for (const a of aufrufe) expect(a.optionen.colors.palette[0]).toBe(HELL_ERSTE);
    // Der verworfene Zeitgeber zeichnet nicht ein zweites Mal.
    await warte();
    expect(aufrufe).toHaveLength(2);
  });

  it('verwirft auch noch nicht zugestellte Einträge des Beobachters', async () => {
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    aufrufe.length = 0;
    druckFarbenSetzen();
    zeichneDiagrammeFuerAusgabe();
    expect(aufrufe).toHaveLength(1);
    await warte();
    expect(aufrufe).toHaveLength(1);
  });

  it('nach der Ausgabe zeichnet der Beobachter im aktiven Farbschema zurück (AK16)', async () => {
    applyPerspectiveChartsIfPresent(container('a'), '', { dokumentText: '' });
    druckFarbenSetzen();
    zeichneDiagrammeFuerAusgabe();
    aufrufe.length = 0;
    druckFarbenZuruecknehmen();
    await warte();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].optionen.colors.palette[0]).toBe(DUNKEL_ERSTE);
  });

  it('ein Diagramm auf ein anderes Dokument liest neu, die Barriere wartet auf die helle Grafik (AK10)', async () => {
    antwort = FARBE_IM_TITEL;
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'S' });
    const wurzel = container('table: [[A#^umsatz]]');
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.querySelector('title').textContent).toBe(DUNKEL_ERSTE);
    const offen = aufschub();
    lies = () => offen.promise;
    druckFarbenSetzen();
    zeichneDiagrammeFuerAusgabe();
    expect(laufendeDiagrammLesungenCount()).toBe(1);
    let fertig = false;
    const warten = waitForChartsIdle().then(() => {
      fertig = true;
    });
    await Promise.resolve();
    expect(fertig).toBe(false);
    offen.resolve({ ok: true, path: '/x/A.md', content: 'S' });
    await warten;
    expect(block.dataset.chartState).toBe('drawn');
    expect(block.querySelector('title').textContent).toBe(HELL_ERSTE);
    druckFarbenZuruecknehmen();
    await warte();
    await waitForChartsIdle();
  });

  it('ein Live-Widget wird nicht an Ort und Stelle umgezeichnet', () => {
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);
    const widget = container('a');
    editor.appendChild(widget);
    applyPerspectiveChartsIfPresent(widget, '', { dokumentText: '', art: 'live' });
    aufrufe.length = 0;
    druckFarbenSetzen();
    zeichneDiagrammeFuerAusgabe();
    expect(aufrufe).toHaveLength(0);
  });

  // Durchsicht vom 2026-09-30 (D1): Antwortet die Lesung bis zur Zeit-Grenze
  // nicht, druckte die Ausgabe vorher still das alte (dunkle) oder ein leeres
  // Bild. Jetzt steht beim Druck-Aufruf der Hinweis, nach der Antwort die Grafik.
  it('eine Lesung ohne Antwort bis zur Zeit-Grenze: beim Druck-Aufruf der Hinweis, danach die Grafik', async () => {
    antwort = FARBE_IM_TITEL;
    lies = async () => ({ ok: true, path: '/x/A.md', content: 'S' });
    const wurzel = container('table: [[A#^umsatz]]');
    applyPerspectiveChartsIfPresent(wurzel, '/x/B.md', { dokumentText: '' });
    await waitForChartsIdle();
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.querySelector('title').textContent).toBe(DUNKEL_ERSTE);
    const offen = aufschub();
    lies = () => offen.promise;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    druckFarbenSetzen();
    // Schein-Uhr: Die Zeit-Grenze wird vorgestellt, nicht abgewartet.
    vi.useFakeTimers();
    try {
      const stand = { markiert: null };
      warteAufDiagrammeDerAusgabe(wurzel, zeichneDiagrammeFuerAusgabe(wurzel)).then(
        (n) => (stand.markiert = n),
      );
      await vi.advanceTimersByTimeAsync(CHART_IDLE_TIMEOUT_MS - 1);
      expect(stand.markiert).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      // Der Stand im Augenblick des Druck-Aufrufs: kein altes Bild, der Hinweis
      // in der Form der übrigen (ohne geladenen Katalog steht der Schlüssel).
      expect(stand.markiert).toBe(1);
      expect(block.querySelector('svg')).toBeNull();
      expect(block.dataset.chartAusgabe).toBe('not-read-in-time');
      expect(block.classList.contains('perspective-chart--undrawable')).toBe(true);
      const satz = block.querySelector('.perspective-chart-hint-reason').textContent;
      expect(satz).toBe('chart.hint.reason.notReadInTime');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('nicht rechtzeitig'), 'A');
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
      // Auch bei einem roten Fall: keine hängende Lesung für die folgenden.
      offen.resolve({ ok: true, path: '/x/A.md', content: 'S' });
    }
    await waitForChartsIdle();
    expect(block.querySelector('.perspective-chart-hint')).toBeNull();
    expect(block.querySelector('title').textContent).toBe(HELL_ERSTE);
    expect(block.dataset.chartAusgabe).toBeUndefined();
    expect(block.classList.contains('perspective-chart--undrawable')).toBe(false);
    druckFarbenZuruecknehmen();
    await warte();
    await waitForChartsIdle();
  });

  // Durchsicht vom 2026-09-30 (D2): Gezeichnet und abgewartet wird allein in
  // der gedruckten Spalte; eine hängende Lesung einer anderen Spalte hält die
  // Ausgabe nicht auf, und nach dem Zurückstellen stehen beide Spalten richtig.
  it('nur die gedruckte Spalte: keine Wartezeit auf fremde Lesungen, danach beide Spalten dunkel', async () => {
    antwort = FARBE_IM_TITEL;
    const haengt = aufschub();
    lies = () => haengt.promise;
    const gedruckt = container('table: ^umsatz');
    const andere = container('table: [[A#^umsatz]]');
    applyPerspectiveChartsIfPresent(gedruckt, '/x/B.md', { dokumentText: '' });
    applyPerspectiveChartsIfPresent(andere, '/x/C.md', { dokumentText: '' });
    const fremd = andere.querySelector('.perspective-chart');
    expect(fremd.dataset.chartState).toBe('pending');
    aufrufe.length = 0;
    druckFarbenSetzen();
    try {
      const stand = { markiert: null };
      warteAufDiagrammeDerAusgabe(gedruckt, zeichneDiagrammeFuerAusgabe(gedruckt)).then(
        (n) => (stand.markiert = n),
      );
      // Ohne Zeit-Grenze erfüllt: Das Neu-Zeichnen der gedruckten Spalte liest nichts.
      await new Promise((r) => setTimeout(r, 0));
      expect(stand.markiert).toBe(0);
      expect(aufrufe.map((a) => a.body)).toEqual(['table: ^umsatz']);
      expect(gedruckt.querySelector('title').textContent).toBe(HELL_ERSTE);
      expect(fremd.querySelector('.perspective-chart-hint')).toBeNull();
    } finally {
      druckFarbenZuruecknehmen();
      haengt.resolve({ ok: true, path: '/x/A.md', content: 'S' });
    }
    await warte();
    await waitForChartsIdle();
    expect(gedruckt.querySelector('title').textContent).toBe(DUNKEL_ERSTE);
    expect(fremd.dataset.chartState).toBe('drawn');
    expect(fremd.querySelector('title').textContent).toBe(DUNKEL_ERSTE);
  });
});

describe('Der Text einer Einbettung (4T-002021, Lösungsansatz g)', () => {
  it('ohne Anker ist der gelesene Inhalt das ganze Dokument', async () => {
    const lies = vi.fn();
    expect(await dokumentTextEinerEinbettung(lies, 'perspective-chart', null)).toBe(
      'perspective-chart',
    );
    expect(lies).not.toHaveBeenCalled();
  });

  it('ein Ausschnitt ohne Diagramm wird nicht nachgelesen', async () => {
    const lies = vi.fn();
    expect(await dokumentTextEinerEinbettung(lies, 'Absatz', '^abschnitt')).toBe('Absatz');
    expect(lies).not.toHaveBeenCalled();
  });

  it('ein Ausschnitt mit Diagramm bezieht sich auf das ganze Dokument', async () => {
    const lies = vi.fn(async () => ({ ok: true, content: 'GANZ' }));
    expect(await dokumentTextEinerEinbettung(lies, '```perspective-chart', 'Kapitel')).toBe('GANZ');
    expect(lies).toHaveBeenCalledTimes(1);
  });

  it('ist das Dokument nicht lesbar, bleibt der Ausschnitt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lies = vi.fn(async () => {
      throw new Error('weg');
    });
    expect(await dokumentTextEinerEinbettung(lies, 'perspective-chart', 'K')).toBe(
      'perspective-chart',
    );
    expect(
      await dokumentTextEinerEinbettung(async () => ({ ok: false }), 'perspective-chart', 'K'),
    ).toBe('perspective-chart');
    warn.mockRestore();
  });
});
