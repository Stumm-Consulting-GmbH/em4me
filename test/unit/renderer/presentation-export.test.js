// @vitest-environment jsdom
// 4T-002163 (Epic 3E-000149): Die beiden Ausgaben des Foliensatzes — PDF
// (Story 4S-001054) und HTML-Seiten (Story 4S-001057).
//
// Geprueft werden die Teile, die hier entschieden sind:
//   - die Druck-Optionen im Folien-Format (Groesse, Ausrichtung, Rand),
//   - die Druck-Flaeche mit einer Seite je Folie in Entwurfsgroesse und ihre
//     Umbruch-Regeln im Stilblatt,
//   - der PDF-Endpunkt (Abbruch still, Erfolg mit Folien-Zahl, Fehler, kein
//     Foliensatz),
//   - der Ordner der HTML-Seiten: Startseite index.html mit der ersten Folie,
//     folie-001.html und folgende, Blaetter-Leiste und Blaetter-Skript,
//     eingebettete Stile, KaTeX nur bei Formeln, Notizen fehlen, Zaehlung
//     fehlender Bilder, Meldung,
//   - der Bedienweg (Registry, Menue-Ort im Untermenue «Exportieren», Bruecke,
//     Dispatcher, Erweiterung).
//
// Die Druck-Vorbereitung ist ersetzt (ihre Pruefung steht in
// druck-vorbereitung.test.js); der Format-Kern und die Render-Pipeline laufen
// echt hinter der Preload-Bruecke. Die Kanaele des Hauptprozesses prueft
// test/unit/praesentation-export-kanal.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');
const cjs = createRequire(import.meta.url);
const DE = JSON.parse(lies('src/i18n/de.json'));
const uebersetze = (k) => (k in DE ? DE[k] : k);

let tabDerKlammer = null;
const hinweise = [];

vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  // Die Klammer ruft prepare und output wie die echte; ein falsy prepare
  // bricht still ab, ein Fehler im Endpunkt kommt als Fehler zurueck.
  withPrintPreparation: async (steps) => {
    const tab = tabDerKlammer;
    const kontext = steps.prepare ? await steps.prepare(tab) : null;
    if (steps.prepare && !kontext) return { ok: false, canceled: true };
    try {
      const res = await steps.output(kontext);
      return res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || '' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
}));

// Der Schritt-Satz des erzeugten Teilbaums (Mermaid, Diagramme, Abfragen) ist
// ersetzt; geprueft wird, dass er je Folie mit dem ganzen Dokument laeuft.
const teilbaumAufrufe = [];
vi.mock('../../../src/renderer/modules/render-mermaid.js', () => ({
  applyTeilbaumSchritte: (...args) => teilbaumAufrufe.push(args),
}));

vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (key, opts) =>
    hinweise.push({ key, error: !!(opts && opts.error), text: opts && opts.text }),
}));

vi.mock('../../../src/renderer/i18n.js', async () => {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const de = JSON.parse(fsMod.readFileSync(pathMod.resolve('src/i18n/de.json'), 'utf8'));
  return { t: (k) => (k in de ? de[k] : k), intlLocale: () => 'de' };
});

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));

const paneEls = { content: null };
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
  getPaneEls: () => paneEls,
  tabDisplayName: (tab) => (tab && tab.titel) || 'Vortrag',
  withDialog: (fn) => fn(),
}));

// Die Bruecke, gestellt VOR dem Laden der Module, weil `api.js` `window.api`
// beim Laden bindet. Der Kern laeuft echt mit der Markdown-Instanz der
// Anwendung, wie im Preload.
const aufrufe = { pdf: [], html: [], katex: 0 };
let pdfZiel = { ok: true, path: 'C:\\A\\Vortrag.pdf' };
let pdfAntwort = { ok: true };
let ordnerWahl = { ok: true, path: 'C:\\A' };
let htmlAntwort = { ok: true, path: 'C:\\A\\Vortrag-Folien', name: 'Vortrag-Folien' };
let waehrendDruck = null;
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: (text, opts) =>
    lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),
  choosePdfExportTarget: async () => pdfZiel,
  printFolienPdf: async (pfad, size) => {
    aufrufe.pdf.push({ pfad, size });
    waehrendDruck = {
      seiten: paneEls.content.querySelectorAll('.presentation-druck-seite').length,
      zustand: document.body.classList.contains('printing-folien'),
    };
    return pdfAntwort;
  },
  chooseFolienHtmlOrdner: async (params) => {
    aufrufe.ordnerParams = params;
    return ordnerWahl;
  },
  writeFolienHtml: async (ordner, unterordner, dateien) => {
    aufrufe.html.push({ ordner, unterordner, dateien });
    return htmlAntwort;
  },
  readHtmlExportKatexStyles: async () => {
    aufrufe.katex += 1;
    return { ok: true, css: '.katex { font: normal 1.21em KaTeX_Main; } /* KATEX-MARKE */' };
  },
};

const folienExport = await import('../../../src/renderer/modules/views/folien-export.js');
const {
  BLAETTER_SKRIPT,
  DRUCK_ZUSTAND,
  FOLIEN_ANKER,
  STARTSEITE,
  baueDruckFlaeche,
  blaetterLeiste,
  exportiereFoliensatzAlsHtml,
  exportiereFoliensatzAlsPdf,
  folienMeldung,
  seitenName,
  themeVariablen,
} = folienExport;
const { sammleInhaltsRegeln } = await import('../../../src/renderer/modules/views/html-export.js');
const { folienPdfOptionen } = cjs('../../../src/shared/pdf-options.js');

const NOTIZ = 'Geheime Sprecher-Notiz';
const DECK = [
  '---',
  'presentation: true',
  'theme: dark',
  'paginate: true',
  'footer: Fusszeile',
  '---',
  '',
  '# Erste Folie',
  '',
  `%% ${NOTIZ} %%`,
  '',
  '---',
  '',
  '## Zweite Folie',
  '',
  'Formel $x^2$',
  '',
  '---',
  '',
  '![bg left](fehlt.png)',
  '',
  '## Dritte Folie',
  '',
].join('\n');

const praesentationsStil = document.createElement('style');
praesentationsStil.textContent = lies('src/renderer/styles/presentation.css');
document.head.appendChild(praesentationsStil);

beforeEach(() => {
  hinweise.length = 0;
  aufrufe.pdf.length = 0;
  aufrufe.html.length = 0;
  aufrufe.katex = 0;
  teilbaumAufrufe.length = 0;
  aufrufe.ordnerParams = null;
  waehrendDruck = null;
  pdfZiel = { ok: true, path: 'C:\\A\\Vortrag.pdf' };
  pdfAntwort = { ok: true };
  ordnerWahl = { ok: true, path: 'C:\\A' };
  htmlAntwort = { ok: true, path: 'C:\\A\\Vortrag-Folien', name: 'Vortrag-Folien' };
  paneEls.content = document.createElement('div');
  document.body.appendChild(paneEls.content);
  tabDerKlammer = { path: 'C:\\A\\Vortrag.md', content: DECK, viewMode: 'presentation' };
});

afterEach(() => {
  paneEls.content.remove();
  document.body.classList.remove(DRUCK_ZUSTAND);
});

// --- Druck-Optionen --------------------------------------------------------------

describe('folienPdfOptionen — Seitenformat gleich Folie (AK1)', () => {
  it('16:9: 1280 x 720 CSS-Pixel als Zoll, Querformat durch Breite, ohne Rand', () => {
    const o = folienPdfOptionen('16:9');
    expect(o.pageSize.width).toBeCloseTo(1280 / 96, 6);
    expect(o.pageSize.height).toBeCloseTo(720 / 96, 6);
    expect(o.pageSize.width).toBeGreaterThan(o.pageSize.height);
    // landscape bliebe sonst zusaetzlich gedreht (Hochformat).
    expect(o.landscape).toBe(false);
    expect(o.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(o.printBackground).toBe(true);
    expect(o.preferCSSPageSize).toBe(false);
  });

  it('4:3: 960 x 720; unbekanntes Format faellt wie in der Ansicht auf 16:9', () => {
    const vier = folienPdfOptionen('4:3');
    expect(vier.pageSize.width).toBeCloseTo(10, 6);
    expect(vier.pageSize.height).toBeCloseTo(7.5, 6);
    expect(folienPdfOptionen('21:9').pageSize).toEqual(folienPdfOptionen(null).pageSize);
    expect(folienPdfOptionen(undefined).pageSize.width).toBeCloseTo(1280 / 96, 6);
  });

  it('kennt keine Seiten-Einstellung des Dokument-Exports (AK7 der Story)', () => {
    expect(Object.keys(folienPdfOptionen('16:9')).sort()).toEqual(
      ['landscape', 'margins', 'pageSize', 'preferCSSPageSize', 'printBackground'].sort(),
    );
  });
});

// --- Druck-Flaeche -----------------------------------------------------------------

describe('baueDruckFlaeche — eine Seite je Folie in Entwurfsgroesse', () => {
  const modell = () => window.api.lesePraesentation(DECK, { kommentareAktiv: true });

  it('baut drei Seiten mit je einer Folie ohne Skalierung', () => {
    const m = modell();
    const schritte = vi.fn();
    const flaeche = baueDruckFlaeche({
      ziel: paneEls.content,
      folien: m.folien,
      kopf: m.kopf,
      render: (md) => renderMarkdown(md, 'de', { frontmatterBlock: false }),
      schritte,
    });
    expect(flaeche.parentElement).toBe(paneEls.content);
    const seiten = flaeche.querySelectorAll('.presentation-druck-seite');
    expect(seiten).toHaveLength(3);
    for (const seite of seiten) {
      expect(seite.style.width).toBe('1280px');
      expect(seite.style.height).toBe('720px');
      const slide = seite.querySelector('.presentation-slide');
      expect(slide.style.width).toBe('1280px');
      expect(slide.style.transform).toBe('');
      expect(slide.dataset.theme).toBe('dark');
    }
    // Der Schritt-Satz des Teilbaums laeuft je Folie.
    expect(schritte).toHaveBeenCalledTimes(3);
    // Seitenzahl, Fusszeile und Inhalt wie in der Ansicht.
    expect(seiten[1].querySelector('.presentation-slide-nummer').textContent).toBe('2');
    expect(seiten[0].querySelector('.presentation-slide-fuss').textContent).toBe('Fusszeile');
    expect(seiten[2].textContent).toContain('Dritte Folie');
    // Notizen stehen auf keiner Seite.
    expect(flaeche.textContent).not.toContain(NOTIZ);
  });

  // 4T-002277, AK8: PDF- und HTML-Export bauen beide auf dieser Flaeche auf;
  // jede Seite traegt die Gestaltung ihrer Folie.
  it('zeigt die Angaben je Folie auf ihrer Seite und nur dort', () => {
    const text =
      '---\npresentation: true\npaginate: true\n---\n# A\n\n---\n\n<!-- _backgroundColor: #c0392b -->\n<!-- _paginate: false -->\n<!-- footer: ab hier -->\n# B\n\n---\n\n# C\n';
    const m = window.api.lesePraesentation(text, { kommentareAktiv: true });
    const flaeche = baueDruckFlaeche({
      ziel: paneEls.content,
      folien: m.folien,
      kopf: m.kopf,
      render: (md) => renderMarkdown(md, 'de', { frontmatterBlock: false }),
    });
    const slides = [...flaeche.querySelectorAll('.presentation-slide')];
    expect(slides.map((s) => s.style.getPropertyValue('--slide-background'))).toEqual([
      '#ffffff',
      '#c0392b',
      '#ffffff',
    ]);
    const nummern = slides.map((s) => s.querySelector('.presentation-slide-nummer'));
    expect(nummern.map((n) => (n.hidden ? '' : n.textContent))).toEqual(['1', '', '3']);
    const fuesse = slides.map((s) => s.querySelector('.presentation-slide-fuss'));
    expect(fuesse.map((f) => (f.hidden ? '' : f.textContent))).toEqual(['', 'ab hier', 'ab hier']);
  });

  it('4:3 setzt 960 x 720', () => {
    const flaeche = baueDruckFlaeche({
      ziel: paneEls.content,
      folien: [{ quelltext: '# A' }],
      kopf: { size: '4:3' },
      render: (md) => renderMarkdown(md, 'de', {}),
    });
    const seite = flaeche.querySelector('.presentation-druck-seite');
    expect(seite.style.width).toBe('960px');
    expect(seite.style.height).toBe('720px');
  });

  it('das Stilblatt bricht nach jeder Seite um, nach der letzten nicht', () => {
    const css = lies('src/renderer/styles/presentation.css');
    const regel = (sel) => {
      const i = css.indexOf(`${sel} {`);
      expect(i, `Regel ${sel} fehlt`).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    expect(regel('.presentation-druck-seite')).toContain('page-break-after: always');
    expect(regel('.presentation-druck-seite:last-child')).toContain('page-break-after: auto');
    // Ausserhalb des Druck-Zustands ausserhalb des Fensters, nicht verborgen
    // (Mermaid misst Textbreiten).
    const lage = regel('.presentation-druck');
    expect(lage).toContain('position: fixed');
    expect(lage).not.toContain('display: none');
    // Die Ueberlauf-Markierung erscheint nie auf der Seite.
    expect(css).toMatch(/\.presentation-druck \.presentation-slide-ueberlauf \{\s*display: none/);
  });
});

// --- PDF-Endpunkt ------------------------------------------------------------------

describe('exportiereFoliensatzAlsPdf — Zielpfad, Druck, Rueckmeldung', () => {
  it('druckt im Folien-Format mit einer Seite je Folie und meldet die Folien-Zahl', async () => {
    expect(await exportiereFoliensatzAlsPdf()).toBe(true);
    expect(aufrufe.pdf).toEqual([{ pfad: 'C:\\A\\Vortrag.pdf', size: '16:9' }]);
    expect(waehrendDruck).toEqual({ seiten: 3, zustand: true });
    // Je Folie der Teilbaum-Schritt-Satz wie in der Ansicht: der Inhalts-Bereich
    // der Folie, der Pfad und das ganze Dokument als Quelle der Diagramme.
    expect(teilbaumAufrufe).toHaveLength(3);
    for (const [artikel, pfad, opts] of teilbaumAufrufe) {
      expect(artikel.classList.contains('praesentation-folie')).toBe(true);
      expect(pfad).toBe('C:\\A\\Vortrag.md');
      expect(opts).toEqual({ dokumentText: DECK });
    }
    // Danach ist die Flaeche wieder weg.
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
    expect(document.body.classList.contains(DRUCK_ZUSTAND)).toBe(false);
    const ende = hinweise[hinweise.length - 1];
    expect(ende.key).toBe('presentation.export.pdfOk');
    expect(ende.error).toBe(false);
    expect(ende.text).toBe(
      'Foliensatz als PDF exportiert: 3 Folien (Sprecher-Notizen nicht enthalten)',
    );
    // Waehrend des Laufs meldet sich der Export in der Statusleiste.
    expect(hinweise.some((h) => h.key === 'presentation.export.laeuft')).toBe(true);
  });

  it('Abbruch des Dialogs: kein Druck, keine Flaeche, keine Meldung', async () => {
    pdfZiel = { ok: false, canceled: true };
    expect(await exportiereFoliensatzAlsPdf()).toBe(false);
    expect(aufrufe.pdf).toHaveLength(0);
    expect(paneEls.content.childElementCount).toBe(0);
    expect(hinweise).toHaveLength(0);
  });

  it('Fehlschlag beim Schreiben wird gemeldet und raeumt auf', async () => {
    pdfAntwort = { ok: false, error: 'EACCES' };
    expect(await exportiereFoliensatzAlsPdf()).toBe(false);
    const ende = hinweise[hinweise.length - 1];
    expect(ende.error).toBe(true);
    expect(ende.text).toBe('PDF-Export des Foliensatzes fehlgeschlagen: EACCES');
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
    expect(document.body.classList.contains(DRUCK_ZUSTAND)).toBe(false);
  });

  it('ein Dokument ohne Kennzeichen exportiert nichts und sagt es', async () => {
    tabDerKlammer = { path: 'C:\\A\\Text.md', content: '# Nur Text\n', viewMode: 'rendered' };
    expect(await exportiereFoliensatzAlsPdf()).toBe(false);
    expect(aufrufe.pdf).toHaveLength(0);
    expect(hinweise.map((h) => h.key)).toEqual(['presentation.keinePraesentation']);
  });

  it('pfadloses Dokument: Vorschlag aus dem Anzeigenamen', async () => {
    const spion = vi.spyOn(window.api, 'choosePdfExportTarget');
    tabDerKlammer = { path: null, content: DECK, titel: 'Unbenannt 2', viewMode: 'rendered' };
    await exportiereFoliensatzAlsPdf();
    expect(spion).toHaveBeenCalledWith({ suggestedPath: null, suggestedName: 'Unbenannt 2.pdf' });
    spion.mockRestore();
  });
});

// --- HTML-Seiten -------------------------------------------------------------------

describe('exportiereFoliensatzAlsHtml — Ordner mit einer Seite je Folie', () => {
  async function exportiere() {
    expect(await exportiereFoliensatzAlsHtml()).toBe(true);
    expect(aufrufe.html).toHaveLength(1);
    const lauf = aufrufe.html[0];
    const datei = (name) => lauf.dateien.find((d) => d.name === name);
    return { lauf, datei };
  }

  it('schreibt index.html und folie-001.html bis folie-003.html in den gewaehlten Ordner', async () => {
    const { lauf, datei } = await exportiere();
    expect(aufrufe.ordnerParams).toEqual({ suggestedDir: 'C:\\A' });
    expect(lauf.ordner).toBe('C:\\A');
    expect(lauf.unterordner).toBe('Vortrag-Folien');
    expect(lauf.dateien.map((d) => d.name)).toEqual([
      'index.html',
      'folie-001.html',
      'folie-002.html',
      'folie-003.html',
    ]);
    // Die Startseite zeigt die erste Folie mit der Blaetter-Leiste.
    expect(datei('index.html').text).toBe(datei('folie-001.html').text);
    expect(datei('index.html').text).toContain('Erste Folie');
    expect(datei('folie-002.html').text).toContain('Zweite Folie');
  });

  it('jede Seite blaettert: Verweise und data-Ziele, an den Enden keine sinnlose Richtung', async () => {
    const { datei } = await exportiere();
    const seite = (name) => new DOMParser().parseFromString(datei(name).text, 'text/html');
    const erste = seite('folie-001.html');
    const nav1 = erste.querySelector('.praesentation-seite-nav');
    expect(nav1.querySelector('a[rel="prev"]')).toBeNull();
    expect(nav1.querySelector('.is-aus').textContent).toBe('Zurück');
    expect(nav1.querySelector('a[rel="next"]').getAttribute('href')).toBe('folie-002.html');
    expect(nav1.getAttribute('data-weiter')).toBe('folie-002.html');
    expect(nav1.hasAttribute('data-zurueck')).toBe(false);
    expect(nav1.getAttribute('data-letzte')).toBe('folie-003.html');
    expect(nav1.querySelector('.praesentation-seite-zaehler').textContent).toBe('1 / 3');

    const mitte = seite('folie-002.html').querySelector('.praesentation-seite-nav');
    expect(mitte.querySelector('a[rel="prev"]').getAttribute('href')).toBe('folie-001.html');
    expect(mitte.querySelector('a[rel="next"]').getAttribute('href')).toBe('folie-003.html');

    const letzte = seite('folie-003.html').querySelector('.praesentation-seite-nav');
    expect(letzte.querySelector('a[rel="next"]')).toBeNull();
    expect(letzte.querySelector('.is-aus').textContent).toBe('Weiter');
    expect(letzte.hasAttribute('data-weiter')).toBe(false);
    expect(letzte.getAttribute('data-erste')).toBe('folie-001.html');
  });

  it('Stile eingebettet, Blaetter-Skript als einziges Skript, Titel je Seite', async () => {
    const { datei } = await exportiere();
    const text = datei('folie-002.html').text;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    expect(doc.title).toBe('Vortrag – Folie 2 von 3');
    expect(doc.documentElement.getAttribute('lang')).toBe('de');
    const stil = doc.querySelector('style').textContent;
    // Die Regeln der Folie aus presentation.css und die eigenen der Seite.
    expect(stil).toContain('.presentation-slide {');
    expect(stil).toContain('.presentation-slide-nummer');
    expect(stil).toContain('.praesentation-seite-buehne');
    // Der Theme-Block an der Wurzel (dunkles Theme).
    expect(stil).toMatch(/:root \{[^}]*--slide-background:/);
    // Regeln des Druck-Zustands reisen nicht mit.
    expect(stil).not.toContain('.printing');
    // Kein Verweis auf eine fremde Datei.
    expect(doc.querySelectorAll('link[rel="stylesheet"], script[src]')).toHaveLength(0);
    const skripte = doc.querySelectorAll('script');
    expect(skripte).toHaveLength(1);
    expect(skripte[0].textContent).toContain("addEventListener('keydown'");
    expect(doc.querySelector('main').className).toBe('praesentation-seite');
    // Die Folie in Entwurfsgroesse, ohne Ueberlauf-Markierung.
    const slide = doc.querySelector('.presentation-slide');
    expect(slide.style.width).toBe('1280px');
    expect(doc.querySelector('.presentation-slide-ueberlauf')).toBeNull();
  });

  it('Befund vom 2026-10-10: die Folie bezieht Tabellen-, Code- und Rahmen-Farben aus ihrem Theme, nicht aus dem hellen Druck-Schema', async () => {
    // Wie in der Druck-Vorbereitung: helles Schema an der Wurzel erzwungen,
    // dazu die Syntax-Farben der Anwendung (an data-theme gebunden).
    const wurzel = document.documentElement;
    wurzel.setAttribute('data-theme', 'light');
    wurzel.style.setProperty('--bg-alt', '#f5f5f5');
    wurzel.style.setProperty('--code-bg', '#f6f8fa');
    const hljsStil = document.createElement('style');
    hljsStil.textContent = lies('src/renderer/hljs-themes.css');
    document.head.appendChild(hljsStil);
    try {
      const { datei } = await exportiere();
      const doc = new DOMParser().parseFromString(datei('folie-001.html').text, 'text/html');
      const stil = doc.querySelector('style').textContent;
      // Die Folie (Theme dark) traegt ihren Farbsatz der Code-Bloecke.
      const slide = doc.querySelector('.presentation-slide');
      expect(slide.classList).toContain('presentation-slide--syntax-dark');
      expect(slide.classList).not.toContain('presentation-slide--syntax-light');
      // Die Folien-Regel reist mit und leitet die Inhalts-Variablen aus den Slots ab.
      const regeln = Array.from(stil.matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => ({
        selektor: m[1].trim(),
        rumpf: m[2],
      }));
      const setzt = (rumpf, v) => new RegExp(`(^|[;\\s])${v}:`).test(rumpf);
      const folienRegel = regeln.find((r) => r.selektor === '.presentation-slide').rumpf;
      for (const v of ['--bg', '--fg', '--accent', '--bg-alt', '--code-bg', '--border']) {
        expect(folienRegel, v).toMatch(new RegExp(`${v}: [^;]*var\\(--slide-`));
      }
      expect(folienRegel).toContain('color-mix(in srgb');
      // Die hellen Werte stehen nur an der Wurzel; ausser ihr setzen nur die
      // Folien-Regel und die beiden Farbsaetze der Folie (Code-Flaeche) die
      // Inhalts-Variablen, die Folie ueberschreibt sie also an sich selbst.
      const folienSaetze = [
        '.presentation-slide.presentation-slide--syntax-light',
        '.presentation-slide.presentation-slide--syntax-dark',
      ];
      for (const v of ['--bg-alt', '--code-bg', '--border', '--fg', '--bg']) {
        const setzer = regeln.filter((r) => setzt(r.rumpf, v)).map((r) => r.selektor);
        expect(setzer, v).toContain('.presentation-slide');
        expect(
          setzer.filter(
            (s) => s !== ':root' && s !== '.presentation-slide' && !folienSaetze.includes(s),
          ),
          v,
        ).toEqual([]);
      }
      // Die dunkle Folie traegt ihre Helligkeit als data-theme.
      expect(slide.getAttribute('data-theme')).toBe('dark');
      // Die Syntax-Saetze der Folie reisen mit; der dunkle Satz der Anwendung nicht.
      expect(stil).toContain('.presentation-slide--syntax-dark');
      expect(stil).toContain(
        '.presentation-slide .praesentation-folie.markdown-body .hljs-keyword',
      );
      expect(stil).not.toMatch(/\[data-theme="?dark"?\] \.hljs/);
    } finally {
      hljsStil.remove();
      wurzel.removeAttribute('data-theme');
      wurzel.style.removeProperty('--bg-alt');
      wurzel.style.removeProperty('--code-bg');
    }
  });

  it('KaTeX nur auf der Seite mit Formel, einmal gelesen', async () => {
    const { datei } = await exportiere();
    expect(aufrufe.katex).toBe(1);
    expect(datei('folie-002.html').text).toContain('KATEX-MARKE');
    expect(datei('folie-001.html').text).not.toContain('KATEX-MARKE');
    expect(datei('folie-003.html').text).not.toContain('KATEX-MARKE');
  });

  it('Sprecher-Notizen stehen in keiner Seite, auch nicht im Quelltext', async () => {
    const { lauf } = await exportiere();
    for (const d of lauf.dateien) expect(d.text).not.toContain(NOTIZ);
  });

  it('meldet Folien-Zahl, Ordner und was entfallen ist (fehlendes Bild, Notizen)', async () => {
    await exportiere();
    const ende = hinweise[hinweise.length - 1];
    expect(ende.key).toBe('presentation.export.htmlOk');
    expect(ende.text).toBe(
      'Foliensatz als HTML exportiert: 3 Folien in „Vortrag-Folien“ ' +
        '(1 Bild nicht eingebettet, Sprecher-Notizen nicht enthalten)',
    );
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
    expect(document.body.classList.contains(DRUCK_ZUSTAND)).toBe(false);
  });

  it('Abbruch der Ordner-Wahl schreibt nichts und meldet nichts', async () => {
    ordnerWahl = { ok: false, canceled: true };
    expect(await exportiereFoliensatzAlsHtml()).toBe(false);
    expect(aufrufe.html).toHaveLength(0);
    expect(hinweise).toHaveLength(0);
    expect(paneEls.content.childElementCount).toBe(0);
  });

  it('Fehlschlag beim Schreiben wird gemeldet', async () => {
    htmlAntwort = { ok: false, error: 'EPERM' };
    expect(await exportiereFoliensatzAlsHtml()).toBe(false);
    const ende = hinweise[hinweise.length - 1];
    expect(ende.error).toBe(true);
    expect(ende.text).toBe('HTML-Export des Foliensatzes fehlgeschlagen: EPERM');
  });

  it('pfadloses Dokument: Ordner-Wahl ohne Vorgabe, Unterordner aus dem Anzeigenamen', async () => {
    tabDerKlammer = { path: null, content: DECK, titel: 'Entwurf', viewMode: 'presentation' };
    await exportiereFoliensatzAlsHtml();
    expect(aufrufe.ordnerParams).toEqual({ suggestedDir: null });
    expect(aufrufe.html[0].unterordner).toBe('Entwurf-Folien');
  });
});

// --- Bausteine ---------------------------------------------------------------------

describe('Bausteine der Seiten', () => {
  it('seitenName ist dreistellig, die Startseite heisst index.html', () => {
    expect(seitenName(0)).toBe('folie-001.html');
    expect(seitenName(41)).toBe('folie-042.html');
    expect(STARTSEITE).toBe('index.html');
  });

  it('blaetterLeiste bei einer einzigen Folie: beide Richtungen aus', () => {
    const html = blaetterLeiste(0, 1, uebersetze);
    const nav = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('.praesentation-seite-nav');
    expect(nav.querySelectorAll('a')).toHaveLength(0);
    expect(nav.querySelectorAll('.is-aus')).toHaveLength(2);
    expect(nav.getAttribute('aria-label')).toBe('Folien blättern');
  });

  it('das Blaetter-Skript folgt der Tasten-Tabelle der Vorfuehrung', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.body.innerHTML =
      '<nav class="praesentation-seite-nav" data-zurueck="folie-001.html" ' +
      'data-weiter="folie-003.html" data-erste="folie-001.html" data-letzte="folie-009.html"></nav>';
    const fenster = { location: { href: '' }, addEventListener: () => {} };
    new Function('document', 'window', BLAETTER_SKRIPT)(doc, fenster);
    const druecke = (key, extra = {}) => {
      fenster.location.href = '';
      doc.dispatchEvent(new window.KeyboardEvent('keydown', { key, ...extra }));
      return fenster.location.href;
    };
    expect(druecke('ArrowRight')).toBe('folie-003.html');
    expect(druecke('PageDown')).toBe('folie-003.html');
    expect(druecke(' ')).toBe('folie-003.html');
    expect(druecke(' ', { shiftKey: true })).toBe('folie-001.html');
    expect(druecke('ArrowLeft')).toBe('folie-001.html');
    expect(druecke('PageUp')).toBe('folie-001.html');
    expect(druecke('Home')).toBe('folie-001.html');
    expect(druecke('End')).toBe('folie-009.html');
    expect(druecke('ArrowRight', { ctrlKey: true })).toBe('');
    expect(druecke('a')).toBe('');
  });

  it('das Blaetter-Skript laedt nichts nach', () => {
    expect(BLAETTER_SKRIPT).not.toMatch(/fetch\(|XMLHttpRequest|import\(|src\s*=|https?:/);
  });

  it('folienMeldung: Einzahl, Mehrzahl, nur Teile ueber null', () => {
    expect(folienMeldung('presentation.export.pdfOk', { folien: 1 }, uebersetze)).toEqual({
      text: 'Foliensatz als PDF exportiert: 1 Folie',
      hinweise: false,
    });
    expect(
      folienMeldung(
        'presentation.export.htmlOk',
        { folien: 4, ordner: 'X', verweise: 2, diagramme: 1 },
        uebersetze,
      ).text,
    ).toBe(
      'Foliensatz als HTML exportiert: 4 Folien in „X“ ' +
        '(2 Verweise ohne Ziel, 1 Diagramm nicht gezeichnet)',
    );
  });

  it('themeVariablen traegt die Slots des Themes, unbekannt faellt auf light', () => {
    expect(themeVariablen({ theme: 'dark' })).toMatch(/--slide-background: [^;]+;/);
    expect(themeVariablen({ theme: 'gibtsnicht' })).toBe(themeVariablen({ theme: 'light' }));
  });

  it('die Anker-Liste der Folie erweitert die des Dokument-Exports', () => {
    expect(FOLIEN_ANKER).toEqual(
      expect.arrayContaining(['.markdown-body', '.presentation-slide', '.presentation-bg']),
    );
    const regeln = sammleInhaltsRegeln(document, FOLIEN_ANKER);
    expect(regeln).toContain('.presentation-bg-bild--cover');
    // Die Fläche der Ansicht gehört zur Oberfläche und bleibt draußen.
    expect(regeln).not.toContain('.praesentation-leiste');
    // Ohne erweiterte Liste bleibt der Dokument-Export unverändert.
    expect(sammleInhaltsRegeln(document)).not.toContain('.presentation-bg-bild--cover');
  });
});

// --- Bedienweg ---------------------------------------------------------------------

describe('Bedienweg: Registry, Menü-Ort, Brücke und Dispatcher', () => {
  const menuQuelle = lies('src/main/menu/menu.js');
  const cmd = (id) => COMMANDS.find((c) => c.id === id);

  it('beide Kommandos: im Menü, ohne Kürzel, eigener Katalog-Text, Bedingung der Präsentation', () => {
    for (const id of ['presentation.exportPdf', 'presentation.exportHtml']) {
      const c = cmd(id);
      expect(c, `${id} fehlt`).toBeTruthy();
      expect(c.menu).toBe(true);
      expect(c.defaultBindings).toEqual([]);
      expect(c.editorScoped).toBe(false);
      expect(c.availability).toBe('praesentationsDokument');
      expect(c.descKey).toMatch(/^help\.shortcut\./);
      expect(DE[c.labelKey]).toBeTruthy();
      expect(DE[c.descKey]).toBeTruthy();
    }
    expect(DE['menu.file.exportPresentationPdf']).toBe('Foliensatz als PDF exportieren…');
    expect(DE['menu.file.exportPresentationHtml']).toBe('Foliensatz als HTML exportieren…');
  });

  it('verfügbar bei einer Präsentation, auch außerhalb ihrer Ansicht; sonst sichtbar deaktiviert', () => {
    const faelle = [
      [{ praesentationTab: true, viewMode: 'presentation' }, true],
      [{ praesentationTab: true, viewMode: 'rendered' }, true],
      [{ praesentationTab: true, viewMode: 'source' }, true],
      [{ praesentationTab: false, viewMode: 'rendered' }, false],
      [{ praesentationTab: true, viewMode: 'rendered', systemTab: true }, false],
      [{ praesentationTab: true, viewMode: 'rendered', hasTab: false }, false],
    ];
    for (const id of ['presentation.exportPdf', 'presentation.exportHtml']) {
      for (const [roh, soll] of faelle) {
        const ctx = availabilityContext({ hasTab: true, ...roh });
        expect(isAvailable(cmd(id).availability, ctx), `${id} ${JSON.stringify(roh)}`).toBe(soll);
      }
    }
  });

  it('stehen im Untermenü «Exportieren» nach «Als HTML exportieren…» und vor dem portablen Markdown', () => {
    const iUnter = menuQuelle.indexOf("label: t('menu.file.export')");
    const iHtml = menuQuelle.indexOf("label: t('menu.file.exportHtml')");
    const iFolienPdf = menuQuelle.indexOf("label: t('menu.file.exportPresentationPdf')");
    const iFolienHtml = menuQuelle.indexOf("label: t('menu.file.exportPresentationHtml')");
    const iPortabel = menuQuelle.indexOf("label: t('menu.file.exportPortable')");
    expect(iUnter).toBeGreaterThan(-1);
    expect(iHtml).toBeGreaterThan(iUnter);
    expect(iFolienPdf).toBeGreaterThan(iHtml);
    expect(iFolienHtml).toBeGreaterThan(iFolienPdf);
    expect(iPortabel).toBeGreaterThan(iFolienHtml);
    const pdfEintrag = menuQuelle.slice(iFolienPdf - 200, iFolienHtml);
    expect(pdfEintrag).toContain("unless('presentation.exportPdf'");
    expect(pdfEintrag).toContain("enabled: avail('presentation.exportPdf')");
    expect(pdfEintrag).toContain("click: send('menu:presentationExportPdf')");
    const htmlEintrag = menuQuelle.slice(iFolienHtml - 200, iPortabel);
    expect(htmlEintrag).toContain("unless('presentation.exportHtml'");
    expect(htmlEintrag).toContain("click: send('menu:presentationExportHtml')");
  });

  it('Brücke, Menü-Bindung und Dispatcher führen zu den Endpunkten', () => {
    const preload = lies('src/main/preload.js');
    expect(preload).toContain("ipcRenderer.invoke('presentationPdf:print', targetPath, size)");
    expect(preload).toContain("ipcRenderer.invoke('presentationHtml:chooseFolder', params)");
    expect(preload).toContain(
      "ipcRenderer.invoke('presentationHtml:write', ordner, unterordner, dateien)",
    );
    expect(preload).toContain("ipcRenderer.on('menu:presentationExportPdf'");
    expect(preload).toContain("ipcRenderer.on('menu:presentationExportHtml'");
    const bindungen = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(bindungen).toContain(
      'api.onMenuPresentationExportPdf(() => exportiereFoliensatzAlsPdf())',
    );
    expect(bindungen).toContain(
      'api.onMenuPresentationExportHtml(() => exportiereFoliensatzAlsHtml())',
    );
    const befehle = lies('src/renderer/modules/app/app-commands.js');
    expect(befehle).toMatch(
      /'presentation\.exportPdf': \(\) => \{\s*exportiereFoliensatzAlsPdf\(\);/,
    );
    expect(befehle).toMatch(
      /'presentation\.exportHtml': \(\) => \{\s*exportiereFoliensatzAlsHtml\(\);/,
    );
  });

  it('gehören zur Erweiterung presentation und entfallen in ihrem Aus-Zustand (AK6)', () => {
    expect(extensionById('presentation').commands).toEqual(
      expect.arrayContaining(['presentation.exportPdf', 'presentation.exportHtml']),
    );
    const aus = disabledCommandIdSet(['presentation']);
    expect(aus.has('presentation.exportPdf')).toBe(true);
    expect(aus.has('presentation.exportHtml')).toBe(true);
    // Der Dokument-Export bleibt (Story 4S-001054, AK8).
    expect(aus.has('file.exportPdf')).toBe(false);
    expect(aus.has('file.exportHtml')).toBe(false);
  });
});

// --- Folie für das Publikums-Fenster (4T-002278) -----------------------------------

describe('Folien-Dokument des Publikums-Fensters (4T-002278)', () => {
  function gezeichneteHuellen() {
    const m = lesePraesentation(DECK, { md: markdownModul.md });
    const flaeche = baueDruckFlaeche({
      ziel: paneEls.content,
      folien: m.folien,
      kopf: m.kopf,
      render: (md) => renderMarkdown(md, 'de', { frontmatterBlock: false }),
    });
    return [...flaeche.querySelectorAll('.presentation-slide-huelle')];
  }

  it('eigenständiges Dokument in Entwurfsgröße, ohne Skript, mit den Folien-Regeln', async () => {
    const [huelle] = gezeichneteHuellen();
    // Die Fläche skaliert die Folie; das Dokument setzt sie zurück.
    huelle.style.width = '320px';
    huelle.querySelector('.presentation-slide').style.transform = 'scale(0.25)';
    const dok = await folienExport.baueFolienDokument(huelle, { basisStile: ['/* BASIS */'] });
    expect(dok.breite).toBe(1280);
    expect(dok.hoehe).toBe(720);
    expect(dok.html.startsWith('<!doctype html>')).toBe(true);
    expect(dok.html).toContain('Erste Folie');
    expect(dok.html).toContain('/* BASIS */');
    expect(dok.html).toContain(folienExport.PUBLIKUM_REGELN.split('\n')[0]);
    expect(dok.html).not.toMatch(/<script/i);
    expect(dok.html).not.toContain('scale(0.25)');
    expect(dok.html).toContain('width: 1280px');
    // Die Folie im Fenster bleibt unverändert.
    expect(huelle.style.width).toBe('320px');
  });

  it('KaTeX nur bei einer Formel, einmal je Fenster gelesen', async () => {
    const huellen = gezeichneteHuellen();
    const katex = vi.fn(async () => '/* KATEX */');
    const ohne = await folienExport.baueFolienDokument(huellen[0], {
      basisStile: [],
      leseKatexStile: katex,
    });
    expect(ohne.html).not.toContain('/* KATEX */');
    const mit = await folienExport.baueFolienDokument(huellen[1], {
      basisStile: [],
      leseKatexStile: katex,
    });
    expect(mit.html).toContain('/* KATEX */');
    await folienExport.baueFolienDokument(huellen[1], { basisStile: [], leseKatexStile: katex });
    expect(katex).toHaveBeenCalledTimes(1);
  });
});
