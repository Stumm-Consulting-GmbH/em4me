// @vitest-environment jsdom
// 4T-002025 (Epic 3E-000192): Das Diagramm zu einer Datentabelle im portablen
// Export (src/renderer/modules/charts/chart-export.js) und sein Aufruf in der
// Kette des Exports (src/renderer/modules/views/save-export.js).
//
// Die Brücke `api.buildChart` ist in den meisten Fällen die ECHTE Funktion
// des Preloads (src/main/preload-diagramme.js) samt Zeichner: So stehen die
// Farben, die der Export wählt, als Farben im gezeichneten Bild, und der Fall
// am Lese-Ende sieht die Datei so, wie die Anwendung sie beim Wieder-Öffnen
// darstellt. Wo es um die Angaben an die Brücke oder um einen Fehler der
// Brücke geht, steht eine Attrappe (`antwort`). Dass ein fremder Betrachter das
// Bild zeigt, liegt außerhalb der Anwendung (Story, Zuständigkeits-Filter);
// den Ablauf am gebauten Programm weist test/e2e/funktionen/diagramme-export.spec.js
// nach.
//
// Der Aus-Zustand der Erweiterung im Export wird hier geprüft und nicht in
// test/unit/render/extensions-aus.test.js, wie der Prüf-Block des Tasks es
// nennt: Jene Datei steht an ihrem Zeilen-Budget.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import deDict from '../../../src/i18n/de.json';
import enDict from '../../../src/i18n/en.json';
import { buildChart } from '../../../src/main/preload-diagramme.js';

const KATALOGE = { de: deDict, en: enDict };
global.fetch = vi.fn(async (url) => {
  const code = /\/([a-z]{2})\.json$/.exec(String(url))[1];
  return { ok: true, json: async () => KATALOGE[code] };
});

// null: die echte Brücke; sonst ein Wert, eine Funktion oder ein Fehler.
const aufrufe = [];
let antwort = null;
window.api.buildChart = (text, body, optionen, tabellenDokument) => {
  aufrufe.push({ text, body, optionen, tabellenDokument });
  if (antwort instanceof Error) throw antwort;
  if (typeof antwort === 'function') return antwort(text, body, optionen, tabellenDokument);
  if (antwort !== null) return antwort;
  return buildChart(text, body, optionen, tabellenDokument);
};
const lesungen = [];
let lies = async () => ({ ok: false, error: 'not found' });
window.api.readChartTableDocument = (basePath, file) => {
  lesungen.push({ basePath, file });
  return lies(basePath, file);
};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { replaceChartFencesForExport, helleExportFarben, markiereKartenDiagrammeFuerExport } =
  await import('../../../src/renderer/modules/charts/chart-export.js');
const { CHART_IDLE_TIMEOUT_MS } =
  await import('../../../src/renderer/modules/charts/chart-view.js');
const { baueAuslassZeile } = await import('../../../src/renderer/modules/charts/chart-hint.js');
const { setColorSchemeState } = await import('../../../src/renderer/modules/color-schemes.js');
const { applyExtensionsState, resetExtensionStateForTests } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { BASE_DEFAULTS, CHART_SLOT_IDS } = await import('../../../src/shared/color-schemes.js');
const { DARK_CHART_PALETTE } = await import('../../../src/shared/charts/chart-call-options.js');
const { sanitizePortableHtmlBlock } =
  await import('../../../src/shared/markdown/portable-sanitizer.js');
const { convertMarkdownPortable, renderMarkdown } =
  await import('../../../src/shared/markdown/markdown.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { exportCurrentTabAsPortable } =
  await import('../../../src/renderer/modules/views/save-export.js');

// --- Prüf-Material ---------------------------------------------------------

const Z = '`'.repeat(3);
const TABELLE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  Z,
  '^umsatz',
].join('\n');
const BALKEN = 'table: ^umsatz\ntype: bar\nlabels: Monat\nvalues: Einnahmen, Ausgaben\n';
const DONUT = 'table: ^umsatz\ntype: donut\nlabels: Monat\nvalues: Einnahmen\n';
const FEHLT = 'table: ^fehlt\ntype: bar\nlabels: Monat\nvalues: Einnahmen\n';
const FREMD = 'table: [[Bericht#^umsatz]]\ntype: bar\nlabels: Monat\nvalues: Einnahmen\n';

const block = (body) => `${Z}perspective-chart\n${body}${Z}`;
const dokument = (...teile) => teile.join('\n\n') + '\n';

const GEZEICHNET = { status: 'drawn', svg: '<svg role="img"></svg>', omitted: 0 };
const BILD_KOPF = '<img alt="';
const QUELLE_KOPF = '" src="data:image/svg+xml;base64,';

// Alle Bilder eines Texts: Alternativtext und entschlüsseltes SVG.
function bilder(text) {
  const out = [];
  let ab = 0;
  for (;;) {
    const i = text.indexOf(BILD_KOPF, ab);
    if (i < 0) return out;
    const q = text.indexOf(QUELLE_KOPF, i);
    const ende = text.indexOf('"', q + QUELLE_KOPF.length);
    const b64 = text.slice(q + QUELLE_KOPF.length, ende);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    out.push({ alt: text.slice(i + BILD_KOPF.length, q), svg: new TextDecoder().decode(bytes) });
    ab = ende;
  }
}

beforeEach(async () => {
  aufrufe.length = 0;
  lesungen.length = 0;
  antwort = null;
  lies = async () => ({ ok: false, error: 'not found' });
  resetExtensionStateForTests();
  setColorSchemeState({ custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' });
  document.documentElement.setAttribute('data-theme', 'light');
  if (i18n.getLanguage() !== 'de') await i18n.loadTranslations('de');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Hell, unabhängig von der Anzeige (AK5) ----------------------------------

describe('Helle Angaben aus dem aktiven hellen Farbschema (AK5)', () => {
  it('bei dunklem Modus und dunklem eigenem Schema: die Werte des hellen Schemas', async () => {
    setColorSchemeState({
      custom: [{ id: 'd1', name: 'D', base: 'dark', colors: { chart1: '#abcdef', bg: '#101010' } }],
      activeLight: 'standard-light',
      activeDark: 'd1',
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    antwort = GEZEICHNET;
    await replaceChartFencesForExport(dokument(block(BALKEN)), { dokumentText: '' });
    const { colors, fontFamily, idPrefix } = aufrufe[0].optionen;
    const hell = BASE_DEFAULTS.light;
    expect(colors).toEqual({
      text: hell.text,
      muted: hell.textMuted,
      background: hell.bg,
      palette: CHART_SLOT_IDS.map((id) => hell[id]),
    });
    expect(colors.palette).toHaveLength(10);
    // Keine Schrift der Anwendung: Der Empfänger hat sie nicht.
    expect(fontFamily).toBeUndefined();
    expect(idPrefix).toMatch(/^chx-\d+$/);
  });

  it('ein eigenes helles Schema bestimmt Text, Hintergrund und Reihen-Farben', () => {
    setColorSchemeState({
      custom: [
        {
          id: 'h1',
          name: 'H',
          base: 'light',
          colors: { chart1: '#123456', chart10: '#654321', text: '#202020', bg: '#fdf6e3' },
        },
      ],
      activeLight: 'h1',
      activeDark: 'standard-dark',
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    const farben = helleExportFarben();
    expect(farben.text).toBe('#202020');
    expect(farben.background).toBe('#fdf6e3');
    expect(farben.palette[0]).toBe('#123456');
    expect(farben.palette[9]).toBe('#654321');
    expect(farben.muted).toBe(BASE_DEFAULTS.light.textMuted);
  });

  it('das gezeichnete Bild trägt Hintergrund, Text und Reihen-Farben des hellen Schemas', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const text = dokument(TABELLE, block(BALKEN));
    const [bild] = bilder(await replaceChartFencesForExport(text, { dokumentText: text }));
    const hell = BASE_DEFAULTS.light;
    expect(bild.svg).toContain(`fill="${hell.bg}"`);
    expect(bild.svg).toContain(hell.text);
    expect(bild.svg).toContain(hell.chart1);
    expect(bild.svg).toContain(hell.chart2);
    for (const dunkel of DARK_CHART_PALETTE.slice(0, 2)) expect(bild.svg).not.toContain(dunkel);
    // Der Hintergrund ist nie durchsichtig: dunkler Text auf durchsichtigem
    // Grund wäre in einem dunklen Betrachter unlesbar.
    expect(bild.svg).not.toMatch(/fill="(transparent|none)"[^>]*width="720"/);
  });
});

// --- Bild an der Stelle des Blocks (AK4, AK6, AK11, AK14, AK15) --------------

describe('Bild an der Stelle des Blocks', () => {
  it('Balken mit zwei Reihen und Donut werden zu Bildern, jedes an seiner Stelle (AK11, AK14)', async () => {
    const text = dokument('# Bericht', TABELLE, block(BALKEN), 'Zwischentext', block(DONUT));
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    const gefunden = bilder(aus);
    expect(gefunden).toHaveLength(2);
    expect(aus.indexOf('Zwischentext')).toBeGreaterThan(aus.indexOf(BILD_KOPF));
    expect(aus.lastIndexOf(BILD_KOPF)).toBeGreaterThan(aus.indexOf('Zwischentext'));
    expect(aus).not.toContain('perspective-chart');
    // Der Rest des Dokuments bleibt byte-gleich, die Tabelle eingeschlossen.
    expect(aus.startsWith(dokument('# Bericht', TABELLE))).toBe(true);
    expect(gefunden[0].svg).toContain(BASE_DEFAULTS.light.chart2);
  });

  it('alle vier Arten werden zu Bildern, je mit der Vorlese-Beschreibung ihrer Art (AK11)', async () => {
    const arten = ['line', 'bar', 'pie', 'donut'].map(
      (art) => `table: ^umsatz\ntype: ${art}\nlabels: Monat\nvalues: Einnahmen\n`,
    );
    const text = dokument(TABELLE, ...arten.map(block));
    const gefunden = bilder(await replaceChartFencesForExport(text, { dokumentText: text }));
    expect(gefunden).toHaveLength(4);
    expect(gefunden.map((b) => /<desc[^>]*>([^<]*)</.exec(b.svg)[1].split(' ')[0])).toEqual([
      'Liniendiagramm',
      'Balkendiagramm',
      'Kreisdiagramm',
      'Donut-Diagramm',
    ]);
  });

  it('die Tabelle bleibt im echten Export eine Tabelle, nur der Block wird Bild (AK6)', async () => {
    const text = dokument(TABELLE, block(BALKEN));
    const portabel = convertMarkdownPortable(text);
    const aus = await replaceChartFencesForExport(portabel, { dokumentText: text });
    expect(aus).toContain('<table');
    expect(aus).toContain('Januar');
    expect(bilder(aus)).toHaveLength(1);
    expect(aus.split('<table').length - 1).toBe(1);
  });

  it('Lese-Ende: das Bild übersteht den Sanitizer und erscheint beim Wieder-Öffnen (AK4, AK15)', async () => {
    const text = dokument(TABELLE, block(BALKEN));
    const aus = await replaceChartFencesForExport(convertMarkdownPortable(text), {
      dokumentText: text,
    });
    const zeile = aus.split('\n').find((z) => z.startsWith(BILD_KOPF));
    const gefiltert = sanitizePortableHtmlBlock(zeile);
    expect(gefiltert).toContain('src="data:image/svg+xml;base64,');
    expect(gefiltert).toContain('alt="Diagramm zu einer Tabelle"');
    // Die Datei trägt den Marker des portablen Exports; die Anwendung zeigt
    // sie mit dem Sanitizer — das Bild steht danach im gerenderten Dokument.
    const html = renderMarkdown(aus, 'de');
    const wurzel = document.createElement('div');
    wurzel.innerHTML = html;
    const img = wurzel.querySelector('img[src^="data:image/svg+xml;base64,"]');
    expect(img).not.toBeNull();
    expect(img.getAttribute('alt')).toBe('Diagramm zu einer Tabelle');
    expect(wurzel.querySelector('table')).not.toBeNull();
  });

  // Durchsicht vom 2026-09-30 (D4): Das Bild ersetzte den Block samt seiner
  // Einrückung und rutschte damit aus dem Listenpunkt.
  it('Lese-Ende: ein Diagramm unter einem Listenpunkt bleibt als Bild im Listenpunkt', async () => {
    const rumpf = BALKEN.split('\n').join('\n  ');
    for (const vor of ['- Punkt\n\n', '- Punkt\n']) {
      const text = `${TABELLE}\n\n${vor}  ${Z}perspective-chart\n  ${rumpf}${Z}\n- Zwei\n`;
      const aus = await replaceChartFencesForExport(convertMarkdownPortable(text), {
        dokumentText: text,
      });
      expect(bilder(aus), vor).toHaveLength(1);
      const wurzel = document.createElement('div');
      wurzel.innerHTML = renderMarkdown(aus, 'de');
      const img = wurzel.querySelector('img[src^="data:image/svg+xml;base64,"]');
      expect(img, vor).not.toBeNull();
      expect(img.closest('li'), vor).toBe(wurzel.querySelector('li'));
      expect(wurzel.querySelectorAll('li')).toHaveLength(2);
    }
  });

  // Durchsicht vom 2026-09-30 (D3): Ein bis zum Textende offener Block blieb
  // Code, obwohl die Ansicht ihn zeichnet.
  it('Lese-Ende: ein bis zum Textende offener Block wird zum Bild wie in der Ansicht', async () => {
    const text = `${TABELLE}\n\nText\n\n${Z}perspective-chart\n${BALKEN}`;
    const aus = await replaceChartFencesForExport(convertMarkdownPortable(text), {
      dokumentText: text,
    });
    expect(bilder(aus)).toHaveLength(1);
    expect(aus).not.toContain('perspective-chart');
    expect(aus).toContain('Text');
    const wurzel = document.createElement('div');
    wurzel.innerHTML = renderMarkdown(aus, 'de');
    expect(wurzel.querySelector('img[src^="data:image/svg+xml;base64,"]')).not.toBeNull();
    // Nicht zeichenbar: der offene Block bleibt stehen.
    const fehlt = `${TABELLE}\n\n${Z}perspective-chart\n${FEHLT}`;
    const portabel = convertMarkdownPortable(fehlt);
    expect(await replaceChartFencesForExport(portabel, { dokumentText: fehlt })).toBe(portabel);
  });

  it('gleiche Blöcke werden einmal gezeichnet und beide ersetzt', async () => {
    const text = dokument(TABELLE, block(BALKEN), block(BALKEN));
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    expect(aufrufe).toHaveLength(1);
    expect(bilder(aus)).toHaveLength(2);
  });

  it('verschiedene Blöcke bekommen verschiedene Kennungs-Präfixe', async () => {
    antwort = GEZEICHNET;
    await replaceChartFencesForExport(dokument(block(BALKEN), block(DONUT)), {});
    const praefixe = aufrufe.map((a) => a.optionen.idPrefix);
    expect(new Set(praefixe).size).toBe(2);
  });
});

// --- Alternativtext ----------------------------------------------------------

describe('Alternativtext des Bilds', () => {
  it('ist der feste Text der Anwendung in der eingestellten Sprache', async () => {
    const text = dokument(TABELLE, block(BALKEN));
    expect(bilder(await replaceChartFencesForExport(text, { dokumentText: text }))[0].alt).toBe(
      'Diagramm zu einer Tabelle',
    );
    await i18n.loadTranslations('en');
    expect(bilder(await replaceChartFencesForExport(text, { dokumentText: text }))[0].alt).toBe(
      'Chart of a table',
    );
  });

  it('nimmt keinen Text des Anwenders in ein Attribut', async () => {
    const titel = 'title: Umsatz "x" onerror="alert(1)\n';
    const text = dokument(TABELLE, block(BALKEN + titel));
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    const zeile = aus.split('\n').find((z) => z.startsWith(BILD_KOPF));
    expect(zeile).not.toContain('onerror');
    expect(bilder(aus)[0].alt).toBe('Diagramm zu einer Tabelle');
  });
});

// --- Unverändert stehen lassen (AK8, AK13) -----------------------------------

describe('Der Block bleibt byte-gleich stehen', () => {
  it('ein nicht zeichenbares Diagramm (AK8)', async () => {
    const text = dokument(TABELLE, block(FEHLT), block(BALKEN));
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    expect(aus).toContain(block(FEHLT));
    expect(bilder(aus)).toHaveLength(1);
    expect(aus.startsWith(dokument(TABELLE, block(FEHLT)))).toBe(true);
  });

  it('nur nicht zeichenbare Diagramme: der Text ist unverändert', async () => {
    const text = dokument('Kopf', block(FEHLT), 'Fuß  ');
    expect(await replaceChartFencesForExport(text, { dokumentText: text })).toBe(text);
  });

  it('bei ausgeschalteter Erweiterung: kein Aufruf der Brücke, Text unverändert (AK13)', async () => {
    await applyExtensionsState(['perspective-chart'], { persist: false });
    const text = dokument(TABELLE, block(BALKEN));
    expect(await replaceChartFencesForExport(text, { dokumentText: text })).toBe(text);
    expect(aufrufe).toHaveLength(0);
  });

  it('abhängig mit ausgeschaltet über die Datentabelle: ebenso unverändert (AK13)', async () => {
    await applyExtensionsState(['perspective-datatable'], { persist: false });
    const text = dokument(TABELLE, block(BALKEN));
    expect(await replaceChartFencesForExport(text, { dokumentText: text })).toBe(text);
  });

  it('ein Fehler der Brücke lässt den Block stehen, warnt und bricht den Export nicht ab', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    antwort = (text, body, optionen, doc) => {
      if (body === DONUT) throw new Error('kaputt');
      return buildChart(text, body, optionen, doc);
    };
    const text = dokument(TABELLE, block(DONUT), block(BALKEN));
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    expect(aus).toContain(block(DONUT));
    expect(bilder(aus)).toHaveLength(1);
    expect(warnung).toHaveBeenCalled();
  });

  it('ein unbekanntes Ergebnis der Brücke lässt den Block stehen', async () => {
    const text = dokument(block(BALKEN));
    for (const erg of [{ status: 'drawn' }, { status: 'weird' }, 'x']) {
      antwort = () => erg;
      expect(await replaceChartFencesForExport(text, { dokumentText: text })).toBe(text);
    }
  });

  it('ohne Diagramm-Block: kein Aufruf der Brücke', async () => {
    const text = dokument(TABELLE, `${Z}mermaid\ngraph TD;\n${Z}`);
    expect(await replaceChartFencesForExport(text, { dokumentText: text })).toBe(text);
    expect(aufrufe).toHaveLength(0);
  });
});

// --- Stand im Augenblick der Ausgabe (AK9, AK10) -----------------------------

describe('Der Stand im Augenblick der Ausgabe (AK9)', () => {
  it('aufgelöst wird gegen den übergebenen Text des Reiters, nicht gegen den Export-Text', async () => {
    // Im Export-Text ist die Tabelle schon eine HTML-Tabelle; gefunden wird
    // sie im Text des Reiters, der auch ungespeichert sein kann.
    const reiter = dokument(TABELLE.replace('| 100 |', '| 777 |'), block(BALKEN));
    const aus = await replaceChartFencesForExport(dokument(block(BALKEN)), {
      dokumentText: reiter,
    });
    expect(aufrufe[0].text).toBe(reiter);
    // Die Werte stehen nicht als Text im Bild; verglichen wird mit dem Bild
    // desselben Blocks über dem geänderten und über dem alten Stand.
    const optionen = aufrufe[0].optionen;
    const svg = bilder(aus)[0].svg;
    expect(svg).toBe(buildChart(reiter, BALKEN, optionen).svg);
    expect(svg).not.toBe(buildChart(dokument(TABELLE, block(BALKEN)), BALKEN, optionen).svg);
  });
});

describe('Tabelle in einem anderen Dokument (AK10)', () => {
  const text = dokument(block(FREMD));
  const kontext = { dokumentText: text, basePath: 'C:\\Bereich\\Plan.md' };

  it('zwei Aufrufe: erst das Ziel, nach dem Lesen mit der Antwort', async () => {
    lies = async () => ({ ok: true, path: 'C:\\Bereich\\Bericht.md', content: TABELLE });
    const aus = await replaceChartFencesForExport(text, kontext);
    expect(lesungen).toEqual([{ basePath: 'C:\\Bereich\\Plan.md', file: 'Bericht' }]);
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[0].tabellenDokument).toBeUndefined();
    expect(aufrufe[1].tabellenDokument.content).toBe(TABELLE);
    expect(bilder(aus)).toHaveLength(1);
  });

  it('zwei Diagramme auf dasselbe Dokument lesen es einmal', async () => {
    lies = async () => ({ ok: true, content: TABELLE });
    const zwei = dokument(block(FREMD), block(FREMD.replace('type: bar', 'type: pie')));
    const aus = await replaceChartFencesForExport(zwei, { ...kontext, dokumentText: zwei });
    expect(lesungen).toHaveLength(1);
    expect(bilder(aus)).toHaveLength(2);
  });

  it('ein fehlendes Dokument lässt den Block stehen', async () => {
    expect(await replaceChartFencesForExport(text, kontext)).toBe(text);
    expect(lesungen).toHaveLength(1);
  });

  it('ein unbenannter Reiter liest nicht und lässt den Block stehen', async () => {
    expect(await replaceChartFencesForExport(text, { dokumentText: text, basePath: '' })).toBe(
      text,
    );
    expect(lesungen).toHaveLength(0);
  });

  it('ein Fehler des Lese-Kanals lässt den Block stehen und warnt', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lies = async () => {
      throw new Error('Kanal');
    };
    expect(await replaceChartFencesForExport(text, kontext)).toBe(text);
    expect(warnung).toHaveBeenCalled();
  });

  it('nach Ablauf der Zeit-Grenze bleibt der Block stehen', async () => {
    vi.useFakeTimers();
    lies = () => new Promise(() => {});
    let fertig = null;
    replaceChartFencesForExport(text, kontext).then((v) => {
      fertig = v;
    });
    await vi.advanceTimersByTimeAsync(CHART_IDLE_TIMEOUT_MS - 1);
    expect(fertig).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(fertig).toBe(text);
  });

  it('eine Antwort knapp vor der Grenze wird gezeichnet', async () => {
    vi.useFakeTimers();
    lies = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true, content: TABELLE }), CHART_IDLE_TIMEOUT_MS - 1);
      });
    let fertig = null;
    replaceChartFencesForExport(text, kontext).then((v) => {
      fertig = v;
    });
    await vi.advanceTimersByTimeAsync(CHART_IDLE_TIMEOUT_MS);
    expect(bilder(fertig)).toHaveLength(1);
  });
});

// --- Aufruf in der Kette des portablen Exports (AK9, AK12) --------------------

describe('Portabler Export des aktiven Reiters (save-export.js)', () => {
  let gespeichert;

  beforeEach(() => {
    gespeichert = [];
    window.api.convertMarkdownPortable = (text) => convertMarkdownPortable(text);
    window.api.saveFileAs = async (pfad, inhalt) => {
      gespeichert.push({ pfad, inhalt });
      return { ok: true, path: pfad };
    };
    window.api.showSaveError = async () => {};
  });

  function reiter(content, extra = {}) {
    const tab = { path: 'C:\\Bereich\\Plan.md', content, originalContent: '', dirty: true };
    state.panes = [{ tabs: [{ ...tab, ...extra }], activeIndex: 0, groups: [], selection: [] }];
    state.activePaneIndex = 0;
    return state.panes[0].tabs[0];
  }

  it('schreibt den ungespeicherten Stand des Reiters als Bild und lässt den Reiter unverändert', async () => {
    const inhalt = dokument(TABELLE.replace('| 90  |', '| 555 |'), block(BALKEN));
    const tab = reiter(inhalt);
    expect(await exportCurrentTabAsPortable()).toBe(true);
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].pfad).toBe('C:\\Bereich\\Plan-portable.md');
    const [bild] = bilder(gespeichert[0].inhalt);
    const optionen = aufrufe[0].optionen;
    expect(bild.svg).toBe(buildChart(inhalt, BALKEN, optionen).svg);
    expect(bild.svg).not.toBe(buildChart(dokument(TABELLE, block(BALKEN)), BALKEN, optionen).svg);
    expect(gespeichert[0].inhalt).toContain('<table');
    expect(tab.content).toBe(inhalt);
    expect(tab.dirty).toBe(true);
    expect(aufrufe[0].text).toBe(inhalt);
  });

  it('reicht den Pfad des Reiters an den Lese-Kanal des anderen Dokuments', async () => {
    lies = async () => ({ ok: true, content: TABELLE });
    reiter(dokument(block(FREMD)));
    await exportCurrentTabAsPortable();
    expect(lesungen).toEqual([{ basePath: 'C:\\Bereich\\Plan.md', file: 'Bericht' }]);
    expect(bilder(gespeichert[0].inhalt)).toHaveLength(1);
  });

  it('löst ein Diagramm in einer Karte gegen seinen Karten-Text auf (Canvas-Fläche)', async () => {
    const inhalt = MIT_FLAECHE;
    const tab = reiter(inhalt);
    await exportCurrentTabAsPortable();
    const aus = gespeichert[0].inhalt;
    expect(bilder(aus)).toHaveLength(3);
    expect(aus).toContain(block(BALKEN));
    expect(aus).not.toContain('perspective-chart-karte-');
    expect(tab.content).toBe(inhalt);
  });
});

// --- Diagramme in Karten einer Canvas-Fläche (Entscheidung vom 2026-09-30) ----

const ZL = '`'.repeat(4);
const KARTE_OHNE_TABELLE = block(BALKEN);
const KARTE_MIT_TABELLE = [TABELLE, '', block(BALKEN)].join('\n');
const KARTE_ANDERE_WERTE = [TABELLE.replace('| 100 |', '| 555 |'), '', block(BALKEN)].join('\n');
// Karte 1 nennt die Tabelle des Dokuments, Karte 2 und 3 tragen je eine eigene
// Tabelle mit demselben Namen, aber anderen Werten. Der Block des Dokuments hat
// denselben Inhalt wie die drei Karten-Blöcke.
const MIT_FLAECHE = dokument(
  '# Fläche',
  TABELLE,
  block(BALKEN),
  [
    `${ZL}perspective-canvas`,
    '!karte k1 x=0 y=0 b=300 h=200',
    KARTE_OHNE_TABELLE,
    '!karte k2 x=400 y=0 b=300 h=300',
    KARTE_MIT_TABELLE,
    '!karte k3 x=800 y=0 b=300 h=300',
    KARTE_ANDERE_WERTE,
    ZL,
  ].join('\n'),
  'Schluss.',
);

async function exportiereMitFlaeche(text, basePath = '') {
  const m = markiereKartenDiagrammeFuerExport(text);
  return replaceChartFencesForExport(convertMarkdownPortable(m.text), {
    dokumentText: text,
    basePath,
    karten: m.karten,
  });
}

describe('Diagramm in einer Karte: dasselbe wie die Canvas-Ansicht', () => {
  it('Tabelle in derselben Karte: Bild; Tabelle nur im Dokument: der Block bleibt', async () => {
    const aus = await exportiereMitFlaeche(MIT_FLAECHE);
    // Bild des Dokuments, Bild der Karten 2 und 3; Karte 1 behält ihren Block.
    expect(bilder(aus)).toHaveLength(3);
    expect(aus.split(block(BALKEN))).toHaveLength(2);
    expect(aus.indexOf(block(BALKEN))).toBeGreaterThan(aus.indexOf(BILD_KOPF));
    expect(aus).not.toContain('perspective-chart-karte-');
    // Die Karten-Tabelle bleibt Tabelle (AK6).
    expect(aus.split('<table').length - 1).toBe(3);
  });

  it('gleicher Block-Inhalt in Karte und Dokument geht verschieden aus', async () => {
    const aus = await exportiereMitFlaeche(MIT_FLAECHE);
    const texte = aufrufe.map((a) => a.text);
    expect(texte).toContain(MIT_FLAECHE);
    expect(texte).toContain(KARTE_OHNE_TABELLE);
    // Das Dokument zeichnet, die Karte ohne eigene Tabelle nicht.
    const ohne = aufrufe.find((a) => a.text === KARTE_OHNE_TABELLE);
    expect(buildChart(ohne.text, ohne.body, ohne.optionen).status).toBe('undrawable');
    expect(bilder(aus)[0].svg).toBe(
      buildChart(MIT_FLAECHE, BALKEN, aufrufe.find((a) => a.text === MIT_FLAECHE).optionen).svg,
    );
  });

  it('zwei Karten mit gleichnamigen Tabellen zeichnen je ihre eigenen Werte', async () => {
    const aus = await exportiereMitFlaeche(MIT_FLAECHE);
    const [, zwei, drei] = bilder(aus);
    expect(zwei.svg).not.toBe(drei.svg);
    const auftrag = (text) => aufrufe.find((a) => a.text === text);
    const a2 = auftrag(KARTE_MIT_TABELLE);
    const a3 = auftrag(KARTE_ANDERE_WERTE);
    expect(zwei.svg).toBe(buildChart(a2.text, BALKEN, a2.optionen).svg);
    expect(drei.svg).toBe(buildChart(a3.text, BALKEN, a3.optionen).svg);
  });

  it('ein anderes Dokument wird aus der Karte vom Pfad des Reiters aus gelesen', async () => {
    lies = async () => ({ ok: true, content: TABELLE });
    const text = dokument(
      [`${ZL}perspective-canvas`, '!karte k1 x=0 y=0 b=300 h=200', block(FREMD), ZL].join('\n'),
      'Schluss.',
    );
    const aus = await exportiereMitFlaeche(text, 'C:\\Bereich\\Plan.md');
    expect(lesungen).toEqual([{ basePath: 'C:\\Bereich\\Plan.md', file: 'Bericht' }]);
    expect(aufrufe[0].text).toBe(block(FREMD));
    expect(bilder(aus)).toHaveLength(1);
  });

  it('ohne zeichenbares Diagramm ist der Export derselbe wie ohne Marken', async () => {
    const text = dokument(
      [`${ZL}perspective-canvas`, '!karte k1 x=0 y=0 b=300 h=200', block(FEHLT), ZL].join('\n'),
      'Schluss.',
    );
    expect(await exportiereMitFlaeche(text)).toBe(convertMarkdownPortable(text));
  });

  it('im Aus-Zustand bleibt jeder Block Code und jede Marke wird zurückgesetzt (AK13)', async () => {
    const m = markiereKartenDiagrammeFuerExport(MIT_FLAECHE);
    expect(m.karten.length).toBeGreaterThan(0);
    await applyExtensionsState(['perspective-chart'], { persist: false });
    // Schon markiert, dann ausgeschaltet: Die Marken gehen trotzdem zurück.
    const aus = await replaceChartFencesForExport(convertMarkdownPortable(m.text), {
      dokumentText: MIT_FLAECHE,
      karten: m.karten,
    });
    expect(aus).toBe(convertMarkdownPortable(MIT_FLAECHE));
    expect(markiereKartenDiagrammeFuerExport(MIT_FLAECHE).karten).toEqual([]);
    expect(aufrufe).toHaveLength(0);
  });
});

// --- Zeile der ausgelassenen Werte (Entscheidung vom 2026-09-30) -------------

// Zwei ausgelassene Werte in «Einnahmen» (leere Zelle, Text), einer in
// «Ausgaben» der zweiten Tabelle (leere Zelle).
const TABELLE_LUECKEN = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100  | 80 |',
  '| Februar |      | 95 |',
  '| März    | viel | 70 |',
  Z,
  '^luecken',
].join('\n');
const TABELLE_EINE_LUECKE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Ausgaben:number',
  '| Januar  | 80 |',
  '| Februar |    |',
  Z,
  '^eine',
].join('\n');
const LUECKEN_BALKEN = 'table: ^luecken\ntype: bar\nlabels: Monat\nvalues: Einnahmen\n';
const EINE_LUECKE = 'table: ^eine\ntype: bar\nlabels: Monat\nvalues: Ausgaben\n';
// Der Punkt am Satzende trägt den Rückstrich, der ihn wörtlich macht.
const MEHRZAHL = '*2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind\\.*';
const EINZAHL = '*1 Wert wurde ausgelassen, weil seine Zelle leer oder nicht lesbar ist\\.*';

// Die exportierte Datei, wie die Anwendung sie beim Wieder-Öffnen zeigt.
function wiederGeoeffnet(aus) {
  const wurzel = document.createElement('div');
  wurzel.innerHTML = renderMarkdown(aus, 'de');
  return wurzel;
}

describe('Zeile der ausgelassenen Werte unter dem Bild', () => {
  it('Mehrzahl: eigene Zeile in Kursiv-Schreibweise, durch eine Leerzeile vom Bild getrennt', async () => {
    const text = dokument(TABELLE_LUECKEN, block(LUECKEN_BALKEN), 'Schluss.');
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    const zeilen = aus.split('\n');
    const i = zeilen.findIndex((z) => z.startsWith(BILD_KOPF));
    expect(zeilen.slice(i + 1, i + 4)).toEqual(['', MEHRZAHL, '']);
    // Hinter der Zeile folgt eine Leerzeile: Der folgende Text wird nicht Teil
    // ihres Absatzes, auch wenn er direkt unter dem Zaun stand.
    expect(aus).toMatch(/sind\\\.\*\n\n+Schluss\.\n$/);
    const dicht = `${TABELLE_LUECKEN}\n\n${block(LUECKEN_BALKEN)}\nDarunter.\n`;
    const p = wiederGeoeffnet(await replaceChartFencesForExport(dicht, { dokumentText: dicht }));
    expect([...p.querySelectorAll('p')].map((x) => x.textContent)).toContain('Darunter.');
  });

  it('Einzahl', async () => {
    const text = dokument(TABELLE_EINE_LUECKE, block(EINE_LUECKE));
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    expect(aus).toContain(`\n\n${EINZAHL}\n`);
    expect(aus).not.toContain('Werte wurden');
  });

  it('ohne ausgelassene Werte keine Zeile', async () => {
    const text = dokument(TABELLE, block(BALKEN), 'Schluss.');
    const aus = await replaceChartFencesForExport(text, { dokumentText: text });
    expect(bilder(aus)).toHaveLength(1);
    expect(aus).not.toContain('ausgelassen');
    expect(aus).not.toMatch(/^\*/m);
  });

  it('der Wortlaut ist der der Ansicht, auch in einer zweiten Sprache', async () => {
    for (const sprache of ['de', 'en']) {
      await i18n.loadTranslations(sprache);
      const text = dokument(TABELLE_LUECKEN, block(LUECKEN_BALKEN));
      const aus = await replaceChartFencesForExport(text, { dokumentText: text });
      const em = wiederGeoeffnet(aus).querySelector('p > em');
      expect(em.textContent, sprache).toBe(baueAuslassZeile(2, i18n.t).textContent);
    }
  });

  it('Lese-Ende: nach dem Sanitizer steht die Zeile als Text unter dem Bild', async () => {
    const text = dokument(TABELLE_LUECKEN, block(LUECKEN_BALKEN), 'Schluss.');
    const aus = await replaceChartFencesForExport(convertMarkdownPortable(text), {
      dokumentText: text,
    });
    const wurzel = wiederGeoeffnet(aus);
    const img = wurzel.querySelector('img[src^="data:image/svg+xml;base64,"]');
    expect(img).not.toBeNull();
    const em = wurzel.querySelector('p > em');
    expect(em.textContent).toBe(
      '2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.',
    );
    // Die Zeile folgt dem Bild, gleich danach, und vor dem Rest des Dokuments.
    const alle = [...wurzel.querySelectorAll('img, p')];
    const nachBild = alle[alle.indexOf(img) + 1];
    expect(nachBild).toBe(em.parentElement);
    expect(em.parentElement.textContent).toBe(em.textContent);
  });

  it('unter einem Listenpunkt tragen Bild und Zeile die Einrückung und bleiben im Punkt', async () => {
    const rumpf = LUECKEN_BALKEN.split('\n').join('\n  ');
    const text = `${TABELLE_LUECKEN}\n\n- Punkt\n\n  ${Z}perspective-chart\n  ${rumpf}${Z}\n- Zwei\n`;
    const aus = await replaceChartFencesForExport(convertMarkdownPortable(text), {
      dokumentText: text,
    });
    expect(aus).toContain(`\n\n  ${MEHRZAHL}\n`);
    const wurzel = wiederGeoeffnet(aus);
    const erster = wurzel.querySelector('li');
    expect(erster.querySelector('img')).not.toBeNull();
    expect(erster.querySelector('em').textContent).toMatch(/^2 Werte wurden ausgelassen/);
    expect(wurzel.querySelectorAll('li')).toHaveLength(2);
  });

  it('ein Diagramm in einer Karte bekommt dieselbe Zeile', async () => {
    const text = dokument(
      [
        `${ZL}perspective-canvas`,
        '!karte k1 x=0 y=0 b=300 h=300',
        [TABELLE_LUECKEN, '', block(LUECKEN_BALKEN)].join('\n'),
        ZL,
      ].join('\n'),
      'Schluss.',
    );
    const aus = await exportiereMitFlaeche(text);
    expect(bilder(aus)).toHaveLength(1);
    expect(aus).toContain(`\n\n${MEHRZAHL}\n`);
    expect(aus).not.toContain('perspective-chart-karte-');
  });
});
