// @vitest-environment jsdom
// 4T-002167 (Epic 3E-000347): HTML-Export eines Dokuments.
//
// Geprueft werden die Teile, die hier entschieden sind:
//   - die Datei-Huelle (reine Funktion, auch mit einem einzelnen Inhalts-
//     Element aufrufbar — der Folien-Export der Stufe 1 nutzt sie so),
//   - die Stil-Erfassung nach der Anker-Liste, gegen kuenstliche Regeln und
//     gegen die echten Stilblaetter der Anwendung,
//   - das Vorbereiten des Inhalts (Bedien-Elemente, Checkboxen, Bilder,
//     Verweise, Diagramme, kein Programm) samt Zaehlung,
//   - die Meldung und der Endpunkt (Abbruch still, Erfolg, Fehler),
//   - der Bedienweg (Registry, Menue-Ort nach dem PDF-Export, Verfuegbarkeit).
//
// Die Druck-Vorbereitung selbst ist ersetzt; ihre Pruefung steht in
// druck-vorbereitung.test.js. Die Ablauf-Faelle an der gestarteten Anwendung
// traegt 4T-002168.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(import.meta.url);

let ergebnisDerKlammer = null;
let tabDerKlammer = null;
let kommentareAn = true;
const hinweise = [];
const geschrieben = [];
let zielAntwort = { ok: true, path: 'C:\\A\\B.html' };
let schreibAntwort = { ok: true };

vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  // Die Klammer ruft prepare und output wie die echte; ihr Ergebnis ist
  // ueber ergebnisDerKlammer steuerbar, sonst das des Endpunkts.
  withPrintPreparation: async (steps) => {
    const tab = tabDerKlammer || { path: 'C:\\A\\B.md', viewMode: 'rendered' };
    const kontext = steps.prepare ? await steps.prepare(tab) : null;
    if (steps.prepare && !kontext) return { ok: false, canceled: true };
    const res = await steps.output(kontext);
    if (ergebnisDerKlammer) return ergebnisDerKlammer;
    return res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || '' };
  },
}));

vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (key, opts) =>
    hinweise.push({ key, error: !!(opts && opts.error), text: opts && opts.text }),
}));

vi.mock('../../../src/renderer/i18n.js', async () => {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const de = JSON.parse(
    fsMod.readFileSync(pathMod.resolve('src/i18n/fragments/de/document.json'), 'utf8'),
  );
  return { t: (k) => (k in de ? de[k] : k), intlLocale: () => 'de' };
});

vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    chooseHtmlExportTarget: async () => zielAntwort,
    writeHtmlExport: async (pfad, text) => {
      geschrieben.push({ pfad, text });
      return schreibAntwort;
    },
    readHtmlExportKatexStyles: async () => ({
      ok: true,
      css: '.katex { font: normal 1.21em KaTeX_Main; }',
    }),
  },
}));

const paneEls = { content: null, renderedHtml: null };
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => (id === 'comments' ? kommentareAn : true),
}));

vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
  getPaneEls: () => paneEls,
  tabDisplayName: () => 'B',
  withDialog: (fn) => fn(),
}));

const { baueHtmlDatei } = await import('../../../src/renderer/modules/views/html-export-datei.js');
const htmlExport = await import('../../../src/renderer/modules/views/html-export.js');
const {
  STIL_ANKER,
  BEDIEN_ELEMENTE,
  teileSelektorListe,
  istInhaltsSelektor,
  regelnEinesStilblatts,
  sammleInhaltsRegeln,
  variablenBlock,
  bereiteInhaltVor,
  meldungsText,
  erfasseHtmlExport,
  exportActiveTabAsHtml,
  klassenOhneDruck,
} = htmlExport;
// 4T-002188: Die Regel ist in ein gemeinsames Modul gehoben, das auch die
// Druck-Vorbereitung (PDF-Export und Druck) nutzt.
const { quelltextFuerExport } =
  await import('../../../src/renderer/modules/views/quelltext-export.js');

const DE = JSON.parse(
  fs.readFileSync(path.join(WURZEL, 'src/i18n/fragments/de/document.json'), 'utf8'),
);
const uebersetze = (k) => (k in DE ? DE[k] : k);

function stilblatt(text) {
  const el = document.createElement('style');
  el.textContent = text;
  document.head.appendChild(el);
  return el;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('class');
  hinweise.length = 0;
  geschrieben.length = 0;
  ergebnisDerKlammer = null;
  tabDerKlammer = null;
  kommentareAn = true;
  zielAntwort = { ok: true, path: 'C:\\A\\B.html' };
  schreibAntwort = { ok: true };
});

// --- Datei-Huelle ------------------------------------------------------------

describe('baueHtmlDatei — Datei-Hülle', () => {
  it('baut doctype, Sprache, Zeichensatz, Titel, Stil und Inhalt ohne Skript', () => {
    const datei = baueHtmlDatei({
      titel: 'Notiz <1> & mehr',
      sprache: 'fr',
      inhaltHtml: '<h1 id="a">Kopf</h1>',
      stile: ['.markdown-body { color: red; }', ':root { --fg: #000; }'],
    });
    expect(datei.startsWith('<!doctype html>\n<html lang="fr">')).toBe(true);
    expect(datei).toContain('<meta charset="utf-8">');
    expect(datei).toContain('<meta name="viewport"');
    expect(datei).toContain('<title>Notiz &lt;1&gt; &amp; mehr</title>');
    expect(datei).toContain('.markdown-body { color: red; }\n:root { --fg: #000; }');
    expect(datei).toContain('<main class="markdown-body">\n<h1 id="a">Kopf</h1>\n</main>');
    expect(datei).not.toMatch(/<script/i);
  });

  it('ein </style im Stil-Text beendet den Stil-Block nicht', () => {
    const datei = baueHtmlDatei({
      titel: 'x',
      sprache: 'de',
      inhaltHtml: '',
      stile: '.a::after { content: "</style><script>x()</script>"; }',
    });
    expect(datei.match(/<\/style>/g)).toHaveLength(1);
    // Der Text bleibt Inhalt des einen Stil-Blocks; ein Skript-Element entsteht nicht.
    const geparst = new DOMParser().parseFromString(datei, 'text/html');
    expect(geparst.querySelector('script')).toBeNull();
    expect(geparst.querySelectorAll('style')).toHaveLength(1);
  });

  it('nimmt ein einzelnes Inhalts-Element entgegen (Aufruf je Folie, AK9)', () => {
    const folie = document.createElement('section');
    folie.innerHTML = '<h2>Folie 1</h2><p>Text</p>';
    const datei = baueHtmlDatei({
      titel: 'Folie 1',
      sprache: 'de',
      inhaltHtml: folie.outerHTML,
      stile: '',
    });
    const geparst = new DOMParser().parseFromString(datei, 'text/html');
    expect(geparst.querySelector('main.markdown-body > section > h2').textContent).toBe('Folie 1');
    expect(geparst.title).toBe('Folie 1');
    expect(geparst.documentElement.getAttribute('lang')).toBe('de');
  });
});

// --- Stil-Erfassung ----------------------------------------------------------

describe('Stil-Erfassung nach der Anker-Liste', () => {
  it('trennt eine Selektor-Liste nur an Kommas der obersten Ebene', () => {
    expect(teileSelektorListe('.a, .b:not(.c, .d), [x="1,2"]')).toEqual([
      '.a',
      '.b:not(.c, .d)',
      '[x="1,2"]',
    ]);
  });

  it('übernimmt Inhalts-Regeln und lässt Oberfläche, Druck-Zustand und Dunkel weg', () => {
    expect(istInhaltsSelektor('.markdown-body p')).toBe(true);
    expect(istInhaltsSelektor(':root:not([data-theme="dark"]) .hljs-keyword')).toBe(true);
    expect(istInhaltsSelektor('.tabbar')).toBe(false);
    expect(istInhaltsSelektor('.katex-display')).toBe(true);
    expect(istInhaltsSelektor('.markdownbody')).toBe(false);
    expect(istInhaltsSelektor('body.printing .markdown-body')).toBe(false);
    expect(istInhaltsSelektor('body.printing.printing-source .pdf-source-print')).toBe(false);
    expect(istInhaltsSelektor("[data-theme='dark'] .markdown-body mark")).toBe(false);

    const el = stilblatt(
      [
        '.tabbar { color: red; }',
        '.markdown-body p { color: var(--fg); }',
        '.sidebar a, .markdown-body a { color: blue; }',
        'body.printing .markdown-body { padding: 0; }',
        '@media print { .markdown-body { color: green; } }',
        "[data-theme='dark'] .markdown-body mark { color: white; }",
        '@media (max-width: 600px) { .markdown-body h1 { margin: 0; } .tabbar { display: none; } }',
      ].join('\n'),
    );
    const regeln = regelnEinesStilblatts(el.sheet);
    const text = regeln.join('\n');
    expect(text).toContain('.markdown-body p {');
    expect(text).toMatch(/^\.markdown-body a \{/m);
    expect(text).not.toContain('.tabbar');
    expect(text).not.toContain('.sidebar');
    expect(text).not.toContain('printing');
    expect(text).not.toContain('green');
    expect(text).not.toContain('data-theme');
    expect(text).toMatch(/@media \(max-width: 600px\) \{\s*\.markdown-body h1/);
  });

  it('lässt das KaTeX-Stilblatt aus der allgemeinen Erfassung heraus', () => {
    stilblatt('.markdown-body em { font-style: italic; }');
    const katex = document.createElement('link');
    katex.rel = 'stylesheet';
    katex.href = 'katex/katex.css';
    document.head.appendChild(katex);
    // jsdom laedt das Blatt nicht; der Test sichert nur, dass die Erfassung
    // ohne Fehler ueber ein Blatt ohne Regeln geht.
    expect(sammleInhaltsRegeln(document)).toContain('.markdown-body em');
  });

  it('schreibt die Variablen mit ihrem berechneten Wert an der Wurzel', () => {
    stilblatt(':root { --fg: #111111; --bg: #ffffff; } .x { --nur-lokal: 1px; }');
    // Waehrend der Vorbereitung stehen die hellen Werte inline an der Wurzel.
    document.documentElement.style.setProperty('--fg', '#222222');
    const block = variablenBlock(document, window);
    expect(block.startsWith(':root {')).toBe(true);
    expect(block).toContain('--fg: #222222;');
    expect(block).toContain('--bg: #ffffff;');
    expect(block).not.toContain('--nur-lokal');
  });

  it('jedes Stilblatt der Anwendung mit .markdown-body-Treffern liefert Inhalts-Regeln', () => {
    // Gegenprobe der Anker-Liste am Bestand: Faellt eine Datei mit Inhalts-
    // Regeln aus der Erfassung, ist die Liste veraltet.
    const indexHtml = fs.readFileSync(path.join(WURZEL, 'src/renderer/index.html'), 'utf8');
    const pfade = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => p === 'styles.css' || p.startsWith('styles/'));
    expect(pfade.length).toBeGreaterThan(15);
    const ohne = [];
    let mitTreffern = 0;
    for (const p of pfade) {
      const text = fs.readFileSync(path.join(WURZEL, 'src/renderer', p), 'utf8');
      // Nur Treffer in Regeln zaehlen, nicht in Kommentaren.
      if (!text.replace(/\/\*[\s\S]*?\*\//g, '').includes('.markdown-body')) continue;
      mitTreffern += 1;
      const el = stilblatt(text);
      if (regelnEinesStilblatts(el.sheet).length === 0) ohne.push(p);
    }
    expect(mitTreffern).toBeGreaterThan(5);
    expect(ohne, 'Stilblaetter mit .markdown-body, aber ohne erfasste Regel').toEqual([]);
    expect(STIL_ANKER).toContain('.markdown-body');
  });
});

// --- Inhalt vorbereiten ------------------------------------------------------

function inhalt(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('bereiteInhaltVor — Bedien-Elemente, Bilder, Verweise, Diagramme', () => {
  it('entfernt die Bedien-Elemente nach der Liste und jedes Programm', () => {
    const w = inhalt(
      [
        '<div class="code-block-wrapper"><pre><code>x</code></pre><button class="code-copy-button">K</button></div>',
        '<table><thead><tr><th class="pdt-row-del"></th><th>A<span class="perspective-sort-icon">s</span></th></tr></thead>',
        '<tbody><tr><td class="pdt-row-del"><button class="pdt-del-btn">x</button></td><td>1</td></tr></tbody></table>',
        '<div class="pdt-add-row"><button class="pdt-add-btn">+</button></div>',
        '<div class="pev-display"><div class="pev-switcher"><button class="pev-viewbtn">t</button></div><div class="pev-add-form">f</div></div>',
        '<p onclick="boese()">Text<span class="block-meta-indicator">⚙</span></p>',
        '<script>boese()</script><iframe src="x"></iframe>',
      ].join(''),
    );
    const z = bereiteInhaltVor(w, { uebersetze });
    for (const sel of BEDIEN_ELEMENTE) expect(w.querySelector(sel), sel).toBeNull();
    expect(w.querySelector('script, iframe')).toBeNull();
    expect(w.querySelector('[onclick]')).toBeNull();
    expect(w.querySelector('pre code').textContent).toBe('x');
    expect(w.querySelectorAll('thead th')).toHaveLength(1);
    expect(w.querySelectorAll('tbody td')).toHaveLength(1);
    expect(z).toEqual({ verweise: 0, bilder: 0, diagramme: 0, formeln: false });
  });

  it('Aufgaben-Checkboxen bleiben sichtbar und werden gesperrt', () => {
    const w = inhalt(
      '<ul><li class="task-list-item"><input type="checkbox" checked> erledigt</li>' +
        '<li class="task-list-item"><input type="checkbox"> offen</li></ul>',
    );
    bereiteInhaltVor(w, { uebersetze });
    const boxen = w.querySelectorAll('input[type="checkbox"]');
    expect(boxen).toHaveLength(2);
    for (const box of boxen) expect(box.hasAttribute('disabled')).toBe(true);
    expect(boxen[0].hasAttribute('checked')).toBe(true);
  });

  it('Bild mit Daten-Adresse bleibt, Bild mit file:-Adresse wird Alternativtext und gezählt', () => {
    const w = inhalt(
      '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="eingebettet"></p>' +
        '<p><img src="https://example.org/a.png" alt="netz"></p>' +
        '<p><img src="file:///C:/Bilder/foto.png" alt="Urlaubsfoto"></p>' +
        '<p><img alt="" data-src-original="bilder/plan.jpg"></p>' +
        '<p><embed type="application/pdf" src="file:///C:/Ablage/Vertrag%20neu.pdf"></p>',
    );
    const z = bereiteInhaltVor(w, { uebersetze });
    expect(w.querySelectorAll('img')).toHaveLength(2);
    expect(w.querySelector('img[alt="eingebettet"]').getAttribute('src')).toMatch(/^data:/);
    const fehlt = [...w.querySelectorAll('span.export-bild-fehlt')].map((s) => s.textContent);
    expect(fehlt).toEqual(['Urlaubsfoto', 'plan.jpg', 'Vertrag neu.pdf']);
    expect(w.querySelector('embed')).toBeNull();
    expect(z.bilder).toBe(3);
  });

  it('Verweise nach der Regel: Anker, http und mailto bleiben, alles andere ohne Ziel', () => {
    const w = inhalt(
      '<h2 id="ziel">Ziel</h2>' +
        '<p><a href="#ziel">Sprung</a> <a href="https://example.org">Netz</a> ' +
        '<a href="mailto:a@example.org">Post</a></p>' +
        '<p><a href="Andere%20Notiz.md" class="wikilink">Andere <em>Notiz</em></a> ' +
        '<a href="#tag:projekt" class="tag-link">#projekt</a> ' +
        '<a href="anlagen/plan.pdf">Plan</a></p>' +
        '<span class="wiki-embed wiki-embed-md" data-embed-path="Teil.md">' +
        '<div class="wiki-embed-md-header"><a class="wiki-embed-md-header-link" href="#">Teil</a></div>' +
        '<div class="wiki-embed-md-body"><p>Eingebetteter Text</p></div></span>',
    );
    const z = bereiteInhaltVor(w, { uebersetze });
    const bleiben = [...w.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(bleiben).toEqual(['#ziel', 'https://example.org', 'mailto:a@example.org']);
    const ohne = [...w.querySelectorAll('span.export-verweis-ohne-ziel')];
    expect(ohne.map((s) => s.textContent)).toEqual(['Andere Notiz', '#projekt', 'Plan', 'Teil']);
    expect(ohne[0].querySelector('em')).not.toBeNull();
    expect(ohne[0].getAttribute('title')).toBe(
      DE['export.html.verweisOhneZiel'].replace('{ziel}', 'Andere Notiz.md'),
    );
    expect(ohne[1].getAttribute('title')).toContain('#projekt');
    expect(ohne[3].getAttribute('title')).toContain('Teil.md');
    // Der eingebettete Inhalt bleibt stehen.
    expect(w.querySelector('.wiki-embed-md-body p').textContent).toBe('Eingebetteter Text');
    expect(z.verweise).toBe(4);
  });

  it('zählt nicht rechtzeitig gezeichnete Diagramme und erkennt Formeln', () => {
    const w = inhalt(
      '<div class="perspective-chart" data-chart-ausgabe="not-read-in-time">Hinweis</div>' +
        '<div class="perspective-chart"><svg></svg></div>' +
        '<span class="katex"><span class="katex-mathml"><math></math></span></span>',
    );
    const z = bereiteInhaltVor(w, { uebersetze });
    expect(z.diagramme).toBe(1);
    expect(z.formeln).toBe(true);
    expect(w.querySelector('[data-chart-ausgabe]').textContent).toBe('Hinweis');
  });
});

// --- Meldung -----------------------------------------------------------------

describe('meldungsText — nur die Teile mit Zahl über null', () => {
  it('ohne Verluste nur «Als HTML exportiert»', () => {
    expect(meldungsText({ verweise: 0, bilder: 0, diagramme: 0 }, uebersetze)).toBe(
      'Als HTML exportiert',
    );
  });

  it('nennt nur, was entfallen ist, mit Einzahl und Mehrzahl', () => {
    expect(meldungsText({ verweise: 3, bilder: 0, diagramme: 1 }, uebersetze)).toBe(
      'Als HTML exportiert (3 Verweise ohne Ziel, 1 Diagramm nicht gezeichnet)',
    );
    expect(meldungsText({ verweise: 0, bilder: 1, diagramme: 0 }, uebersetze)).toBe(
      'Als HTML exportiert (1 Bild nicht eingebettet)',
    );
    expect(meldungsText({ verweise: 1, bilder: 2, diagramme: 2 }, uebersetze)).toBe(
      'Als HTML exportiert (1 Verweis ohne Ziel, 2 Bilder nicht eingebettet, ' +
        '2 Diagramme nicht gezeichnet)',
    );
  });
});

// --- Erfassen und Datei bauen -------------------------------------------------

describe('erfasseHtmlExport — Datei aus dem gerenderten Inhalt', () => {
  it('ohne Formeln kein KaTeX, Inhalts-Regeln ohne Oberfläche, kein Skript', async () => {
    stilblatt(
      ':root { --fg: #24292e; } .tabbar { color: red; } .markdown-body h1 { color: var(--fg); }',
    );
    const quelle = inhalt('<h1>Titel</h1><p>Text</p>');
    quelle.className = 'markdown-body';
    const leseKatexStile = vi.fn(async () => '.katex {}');
    const { html, zaehler } = await erfasseHtmlExport({
      quelle,
      alsElement: false,
      titel: 'Notiz',
      leseKatexStile,
    });
    expect(leseKatexStile).not.toHaveBeenCalled();
    expect(zaehler.formeln).toBe(false);
    expect(html).toContain('--fg: #24292e;');
    expect(html).toContain('.markdown-body h1 {');
    expect(html).not.toContain('.tabbar');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<main class="markdown-body">\n<h1>Titel</h1><p>Text</p>\n</main>');
    // Die Quelle selbst bleibt unberuehrt.
    expect(quelle.innerHTML).toBe('<h1>Titel</h1><p>Text</p>');
  });

  it('mit Formeln kommt das KaTeX-Stilblatt in die Datei', async () => {
    const quelle = inhalt('<p><span class="katex">x</span></p>');
    const leseKatexStile = vi.fn(async () => '.katex { font: normal 1.21em KaTeX_Main; }');
    const { html } = await erfasseHtmlExport({
      quelle,
      alsElement: false,
      titel: 'F',
      leseKatexStile,
    });
    expect(leseKatexStile).toHaveBeenCalledTimes(1);
    expect(html).toContain('KaTeX_Main');
  });

  it('übernimmt den Quelltext-Block als Element und den angezeigten Checkbox-Stand', async () => {
    const block = document.createElement('div');
    block.className = 'pdf-source-print with-line-numbers';
    block.innerHTML = '<div class="pdf-source-line"><span class="hljs-section"># Kopf</span></div>';
    const { html } = await erfasseHtmlExport({ quelle: block, alsElement: true, titel: 'Q' });
    expect(html).toContain('<div class="pdf-source-print with-line-numbers">');

    const quelle = inhalt('<input type="checkbox">');
    quelle.querySelector('input').checked = true;
    const { html: html2 } = await erfasseHtmlExport({ quelle, alsElement: false, titel: 'C' });
    expect(html2).toMatch(/<input type="checkbox"[^>]*checked/);
    expect(html2).toMatch(/<input type="checkbox"[^>]*disabled/);
  });
});

// --- Klassen der Vorfahren (Option (a) der Sitzung vom 2026-10-07) ------------------

describe('Klassen der Vorfahren — Regeln mit Wurzel- oder Bereichs-Bedingung greifen', () => {
  async function stilVon(html, selektor) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html);
    const el = dom.window.document.querySelector(selektor);
    return dom.window.getComputedStyle(el).color;
  }

  it('die Hülle ohne Klassen bleibt gültig: kein class-Attribut, kein Behälter', () => {
    const datei = baueHtmlDatei({ titel: 't', sprache: 'de', inhaltHtml: '<p>x</p>', stile: '' });
    expect(datei).toContain('<html lang="de">');
    expect(datei).toContain('<body>\n<main class="markdown-body">');
    const leer = baueHtmlDatei({
      titel: 't',
      sprache: 'de',
      inhaltHtml: '<p>x</p>',
      stile: '',
      wurzelKlassen: '',
      inhaltsKlassen: '  ',
    });
    expect(leer).toBe(datei);
  });

  it('die Hülle trägt Wurzel-Klassen an <html> und den Behälter um <main>', () => {
    const datei = baueHtmlDatei({
      titel: 't',
      sprache: 'de',
      inhaltHtml: '<p>x</p>',
      stile: '',
      wurzelKlassen: 'frontmatter-expanded',
      inhaltsKlassen: 'content view-rendered',
    });
    expect(datei).toContain('<html lang="de" class="frontmatter-expanded">');
    expect(datei).toContain(
      '<body>\n<div class="content view-rendered">\n<main class="markdown-body">\n<p>x</p>\n</main>\n</div>\n</body>',
    );
  });

  it('nimmt die Druck-Klasse aus den übernommenen Klassen', () => {
    const el = document.createElement('div');
    el.className = 'content view-rendered printing';
    expect(klassenOhneDruck(el)).toBe('content view-rendered');
    expect(klassenOhneDruck(null)).toBe('');
  });

  it(':root.frontmatter-expanded .markdown-body .x greift in der erzeugten Datei', async () => {
    stilblatt(
      ':root.frontmatter-expanded .markdown-body .x { color: rgb(1, 2, 3); }\n' +
        '.content.view-rendered .markdown-body .y { color: rgb(4, 5, 6); }',
    );
    // Zustand waehrend der Vorbereitung: Wurzel und Bereich tragen zusaetzlich
    // die Druck-Klasse.
    document.documentElement.className = 'frontmatter-expanded printing';
    const bereich = document.createElement('div');
    bereich.className = 'content view-rendered printing';
    const quelle = inhalt('<p class="x">X</p><p class="y">Y</p>');
    const { html } = await erfasseHtmlExport({
      quelle,
      alsElement: false,
      titel: 'K',
      inhaltsBereich: bereich,
    });
    // Die Regeln bleiben nicht am Druck-Filter haengen ...
    expect(html).toContain(':root.frontmatter-expanded .markdown-body .x');
    expect(html).toContain('.content.view-rendered .markdown-body .y');
    // ... die Klassen reisen ohne die Druck-Klasse mit ...
    expect(html).toContain('<html lang="de" class="frontmatter-expanded">');
    expect(html).toContain('<div class="content view-rendered">');
    // ... und beide Regeln greifen in der Datei.
    expect(await stilVon(html, '.x')).toBe('rgb(1, 2, 3)');
    expect(await stilVon(html, '.y')).toBe('rgb(4, 5, 6)');

    // Gegenprobe: ohne die Wurzel-Klasse greift die Regel nicht.
    document.documentElement.className = '';
    const { html: ohne } = await erfasseHtmlExport({ quelle, alsElement: false, titel: 'K' });
    expect(await stilVon(ohne, '.x')).not.toBe('rgb(1, 2, 3)');
  });
});

// --- Groesse einer Datei mit Formeln ------------------------------------------------

describe('Datei-Größe mit und ohne Formeln (Messung für das Lösungs-Kapitel)', () => {
  it('trägt KaTeX samt Schriften nur bei Formeln', async () => {
    const {
      katexStilMitSchriften,
      KATEX_ORDNER,
    } = require('../../../src/main/documents/katex-export-stil.js');
    if (!fs.existsSync(path.join(KATEX_ORDNER, 'katex.css'))) {
      require('../../../scripts/build-katex-assets.js').buildKatexAssets();
    }
    const katex = (await import('katex')).default;
    // Die echten Stilblaetter der Anwendung in Lade-Reihenfolge, ohne KaTeX
    // (das kommt ueber den Kanal) und ohne Erzeugnisse, die fehlen koennen.
    const indexHtml = fs.readFileSync(path.join(WURZEL, 'src/renderer/index.html'), 'utf8');
    for (const [, p] of indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
      const datei = path.join(WURZEL, 'src/renderer', p);
      if (p.startsWith('katex/') || !fs.existsSync(datei)) continue;
      stilblatt(fs.readFileSync(datei, 'utf8'));
    }
    const formel = (tex, displayMode) =>
      katex.renderToString(tex, { output: 'htmlAndMathml', displayMode, throwOnError: false });
    const mitFormeln = inhalt(
      `<h1>Formeln</h1><p>Inline ${formel('E = mc^2', false)} im Text.</p>` +
        `<p>${formel('\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}', true)}</p>`,
    );
    const ohneFormeln = inhalt('<h1>Text</h1><p>Nur Text.</p>');
    const leseKatexStile = () => katexStilMitSchriften();

    const mit = await erfasseHtmlExport({
      quelle: mitFormeln,
      alsElement: false,
      titel: 'F',
      leseKatexStile,
    });
    const ohne = await erfasseHtmlExport({
      quelle: ohneFormeln,
      alsElement: false,
      titel: 'T',
      leseKatexStile,
    });
    const kb = (s) => Math.round(Buffer.byteLength(s, 'utf8') / 1024);

    expect(mit.html).toContain('data:font/woff2;base64,');
    expect(mit.html).not.toMatch(/url\((["']?)fonts\//);
    expect(ohne.html).not.toContain('KaTeX_');
    expect(kb(mit.html) - kb(ohne.html)).toBeGreaterThan(250);
    expect(kb(mit.html)).toBeLessThan(1024);
  });
});

// --- Endpunkt ------------------------------------------------------------------

describe('exportActiveTabAsHtml — Zielpfad, Schreiben, Rückmeldung', () => {
  beforeEach(() => {
    const md = document.createElement('div');
    md.className = 'markdown-body';
    md.innerHTML = '<p><a href="Andere.md" class="wikilink">Andere</a></p>';
    paneEls.renderedHtml = md;
    paneEls.content = document.createElement('div');
  });

  it('schreibt die Datei an den gewählten Ort und meldet den Verlust', async () => {
    expect(await exportActiveTabAsHtml()).toBe(true);
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0].pfad).toBe('C:\\A\\B.html');
    expect(geschrieben[0].text.startsWith('<!doctype html>')).toBe(true);
    expect(hinweise).toEqual([
      {
        key: 'export.html.statusOk',
        error: false,
        text: 'Als HTML exportiert (1 Verweis ohne Ziel)',
      },
    ]);
  });

  it('meldet ohne Verluste nur «Als HTML exportiert»', async () => {
    paneEls.renderedHtml.innerHTML = '<p>Text</p>';
    expect(await exportActiveTabAsHtml()).toBe(true);
    expect(hinweise[0].text).toBe('Als HTML exportiert');
  });

  it('schweigt und schreibt nichts beim Abbruch des Zielpfad-Dialogs (AK3)', async () => {
    zielAntwort = { ok: false, canceled: true };
    expect(await exportActiveTabAsHtml()).toBe(false);
    expect(geschrieben).toEqual([]);
    expect(hinweise).toEqual([]);
  });

  it('meldet einen Schreib-Fehler als Fehler', async () => {
    schreibAntwort = { ok: false, error: 'Zugriff verweigert' };
    expect(await exportActiveTabAsHtml()).toBe(false);
    expect(hinweise).toEqual([
      {
        key: 'export.html.statusError',
        error: true,
        text: 'HTML-Export fehlgeschlagen: Zugriff verweigert',
      },
    ]);
  });

  // 4T-002170 (Test-Pflege-Schritt): 4S-001058 AK10 und AK9 waren nur am Code
  // belegt, nicht in der Suite.
  it('ein leeres Dokument ergibt eine gültige, leere Seite statt eines Fehlers', async () => {
    paneEls.renderedHtml.innerHTML = '';
    tabDerKlammer = { path: 'C:\\A\\Leer.md', viewMode: 'rendered', content: '' };
    expect(await exportActiveTabAsHtml()).toBe(true);
    const datei = geschrieben[0].text;
    expect(datei.startsWith('<!doctype html>')).toBe(true);
    expect(datei).toMatch(/<main class="markdown-body">\s*<\/main>/);
    expect(hinweise).toEqual([
      { key: 'export.html.statusOk', error: false, text: 'Als HTML exportiert' },
    ]);

    geschrieben.length = 0;
    hinweise.length = 0;
    tabDerKlammer = { path: 'C:\\A\\Leer.md', viewMode: 'source', content: '' };
    expect(await exportActiveTabAsHtml()).toBe(true);
    expect(geschrieben[0].text.startsWith('<!doctype html>')).toBe(true);
    expect(hinweise.map((h) => h.error)).toEqual([false]);
  });

  it('lässt das Ausgangs-Dokument unverändert und schreibt allein an das Ziel', async () => {
    const vorher = paneEls.renderedHtml.innerHTML;
    const text = '# Kopf\n\nText %% privat %% und [[Andere]]\n';
    const tab = { path: 'C:\\A\\B.md', viewMode: 'rendered', content: text };
    tabDerKlammer = tab;
    expect(await exportActiveTabAsHtml()).toBe(true);
    tab.viewMode = 'source';
    expect(await exportActiveTabAsHtml()).toBe(true);
    expect(tab.content).toBe(text);
    expect(paneEls.renderedHtml.innerHTML).toBe(vorher);
    expect(geschrieben.map((g) => g.pfad)).toEqual(['C:\\A\\B.html', 'C:\\A\\B.html']);
  });
});

// --- Private Kommentare im Quelltext-Export -----------------------------------------

describe('Private Kommentare im Quelltext-Export', () => {
  const TEXT = [
    '# Kopf',
    'Vorher %% privat eins %% nachher',
    '%% mehrzeilig',
    'geheim zwei',
    'Ende %%',
    'Code `%%bleibt%%` und \\%% bleibt auch',
    'Schluss',
  ].join('\n');

  it('entfernt die Kommentare zeilentreu und lässt Code-Spannen und \\%% stehen', () => {
    const aus = quelltextFuerExport(TEXT, true);
    expect(aus).not.toContain('privat eins');
    expect(aus).not.toContain('geheim zwei');
    expect(aus.split('\n')).toEqual([
      '# Kopf',
      'Vorher  nachher',
      '',
      '',
      '',
      'Code `%%bleibt%%` und \\%% bleibt auch',
      'Schluss',
    ]);
  });

  it('lässt das Frontmatter unberührt, wie die Render-Pipeline', () => {
    const mitKopf = '---\ntitel: "a %% b"\n---\nText %% weg %% da';
    expect(quelltextFuerExport(mitKopf, true)).toBe('---\ntitel: "a %% b"\n---\nText  da');
  });

  it('bei abgeschalteter Erweiterung bleibt der Text unverändert', () => {
    expect(quelltextFuerExport(TEXT, false)).toBe(TEXT);
  });

  it('die erzeugte Datei aus der Quelltext-Ansicht enthält den Kommentar-Text nicht', async () => {
    tabDerKlammer = {
      path: 'C:\\A\\B.md',
      viewMode: 'source',
      content: TEXT,
      showLineNumbers: true,
    };
    paneEls.content = document.createElement('div');
    expect(await exportActiveTabAsHtml()).toBe(true);
    const datei = geschrieben[0].text;
    expect(datei).not.toContain('privat eins');
    expect(datei).not.toContain('geheim zwei');
    const doc = new DOMParser().parseFromString(datei, 'text/html');
    const zeilen = doc.querySelectorAll('main .pdf-source-print .pdf-source-line');
    expect(zeilen).toHaveLength(7);
    expect(zeilen[6].querySelector('.pdf-source-lineno').textContent).toBe('7');
    expect(zeilen[6].textContent).toContain('Schluss');
    expect(zeilen[5].textContent).toContain('%%bleibt%%');
  });

  it('Gegenprobe: bei abgeschalteter Erweiterung bleibt der Text in der Datei', async () => {
    kommentareAn = false;
    tabDerKlammer = { path: 'C:\\A\\B.md', viewMode: 'source', content: TEXT };
    paneEls.content = document.createElement('div');
    expect(await exportActiveTabAsHtml()).toBe(true);
    expect(geschrieben[0].text).toContain('privat eins');
    expect(geschrieben[0].text).toContain('geheim zwei');
  });
});

// --- Bedienweg -----------------------------------------------------------------

describe('Bedienweg: Registry, Menü-Ort und Verfügbarkeit (AK2)', () => {
  const { COMMANDS } = require('../../../src/shared/commands/commands.js');
  const { isAvailable } = require('../../../src/shared/commands/command-availability.js');
  const menuQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/menu/menu.js'), 'utf8');
  const preloadQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/preload.js'), 'utf8');
  const dialogQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/ipc/dialogs.js'), 'utf8');

  it('das Kommando steht ohne Vorgabe-Kürzel in der Registry, wie der PDF-Export verfügbar', () => {
    const cmd = COMMANDS.find((c) => c.id === 'file.exportHtml');
    const pdf = COMMANDS.find((c) => c.id === 'file.exportPdf');
    expect(cmd, 'Kommando file.exportHtml fehlt').toBeTruthy();
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(true);
    expect(cmd.editorScoped).toBe(false);
    expect(cmd.labelKey).toBe('menu.file.exportHtml');
    expect(cmd.categoryKey).toBe(pdf.categoryKey);
    expect(cmd.availability).toBe('contentTab');
    expect(cmd.availability).toBe(pdf.availability);
    // Handbuch-Reiter ja, Einstellungs-Reiter nein, ohne Reiter nein.
    expect(isAvailable(cmd.availability, { hasTab: true, manualTab: true })).toBe(true);
    expect(isAvailable(cmd.availability, { hasTab: true, systemTab: true })).toBe(false);
    expect(isAvailable(cmd.availability, { hasTab: false })).toBe(false);
  });

  it('der Menü-Eintrag steht unmittelbar nach «Als PDF exportieren…»', () => {
    const iPdf = menuQuelle.indexOf("label: t('menu.file.exportPdf')");
    const iHtml = menuQuelle.indexOf("label: t('menu.file.exportHtml')");
    const iPortabel = menuQuelle.indexOf("label: t('menu.file.exportPortable')");
    expect(iPdf).toBeGreaterThan(-1);
    expect(iHtml).toBeGreaterThan(iPdf);
    expect(iPortabel).toBeGreaterThan(iHtml);
    const dazwischen = menuQuelle.slice(iPdf, iHtml);
    expect(dazwischen.match(/label: t\(/g)).toHaveLength(1);
    expect(dazwischen).not.toContain("type: 'separator'");
    const eintrag = menuQuelle.slice(iHtml, iPortabel);
    expect(eintrag).toContain("accelerator: acc('file.exportHtml')");
    expect(eintrag).toContain("enabled: avail('file.exportHtml')");
    expect(eintrag).toContain("click: send('menu:exportHtml')");
  });

  it('Vorlade-Skript und Hauptprozess führen die Kanäle des HTML-Exports', () => {
    expect(preloadQuelle).toContain("ipcRenderer.on('menu:exportHtml'");
    expect(preloadQuelle).toContain("ipcRenderer.invoke('html:chooseTarget'");
    expect(preloadQuelle).toContain("ipcRenderer.invoke('html:write'");
    expect(preloadQuelle).toContain("ipcRenderer.invoke('html:katexStyles'");
    expect(dialogQuelle).toContain("handle('html:chooseTarget'");
    expect(dialogQuelle).toContain("handle('html:write'");
    expect(dialogQuelle).toContain("handle('html:katexStyles'");
  });
});
