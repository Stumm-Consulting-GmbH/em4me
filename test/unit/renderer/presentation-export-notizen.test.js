// @vitest-environment jsdom
// 4T-002283 (Epic 3E-000348): Sprecher-Notizen im HTML- und PDF-Export
// (Story 4S-001083).
//
// Geprüft wird:
//   - der Schalter «Sprecher-Notizen mitgeben» der Einstellungs-Seite
//     «Export» (Gruppe «Foliensatz», Vorgabe aus, Entwurf, Anwenden) und die
//     Vorgabe im Speicher (AK1),
//   - der HTML-Export mit eingeschaltetem Schalter: ein zugeklappter
//     Notiz-Bereich mit Beschriftung je Folie mit Notizen, keiner sonst, die
//     Notizen gerendert durch die Markdown-Pipeline und die Einbettung der
//     Folie, das Blätter-Skript unverändert (AK2),
//   - der PDF-Export mit eingeschaltetem Schalter: hinter jeder Folie mit
//     Notizen eine Notiz-Seite im Folien-Format mit Folien-Nummer (AK3),
//   - ausgeschaltet beide Exporte wie in Stufe 1 samt Meldung (AK4),
//   - die Meldung mit der Zahl der mitgegebenen Notizen (AK5).
//
// Harness wie presentation-export.test.js: Druck-Vorbereitung ersetzt, Kern
// und Render-Pipeline echt hinter der Brücke.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');
const DE = JSON.parse(lies('src/i18n/de.json'));
const uebersetze = (k) => (k in DE ? DE[k] : k);

let tabDerKlammer = null;
const hinweise = [];
const gespeichert = [];

vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  withPrintPreparation: async (steps) => {
    const kontext = await steps.prepare(tabDerKlammer);
    if (!kontext) return { ok: false, canceled: true };
    const res = await steps.output(kontext);
    return res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || '' };
  },
}));

const teilbaumAufrufe = [];
vi.mock('../../../src/renderer/modules/render-mermaid.js', () => ({
  applyTeilbaumSchritte: (...args) => teilbaumAufrufe.push(args),
}));

vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (key, opts) =>
    hinweise.push({ key, error: !!(opts && opts.error), text: opts && opts.text }),
  persistSetting: async (key, value) => gespeichert.push([key, value]),
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

vi.mock('../../../src/renderer/modules/heading-numbering.js', () => ({
  applyHeadingNumbering: () => {},
  headingNumberingStartLevel: () => 1,
  isHeadingNumberingEnabled: () => false,
}));

const paneEls = { content: null };
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
  getPaneEls: () => paneEls,
  tabDisplayName: (tab) => (tab && tab.titel) || 'Vortrag',
  withDialog: (fn) => fn(),
}));

// Die Brücke, gestellt VOR dem Laden der Module (`api.js` bindet beim Laden).
let schalter;
let druckSeiten = null;
const html = [];
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: (text, opts) =>
    lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),
  getSetting: async (key) => (key === 'export.folien.notizen' ? schalter : undefined),
  choosePdfExportTarget: async () => ({ ok: true, path: 'C:\\A\\Vortrag.pdf' }),
  printFolienPdf: async () => {
    druckSeiten = Array.from(paneEls.content.querySelectorAll('.presentation-druck-seite'));
    return { ok: true };
  },
  chooseFolienHtmlOrdner: async () => ({ ok: true, path: 'C:\\A' }),
  writeFolienHtml: async (ordner, unterordner, dateien) => {
    html.push(dateien);
    return { ok: true, path: 'C:\\A\\Vortrag-Folien', name: 'Vortrag-Folien' };
  },
  readHtmlExportKatexStyles: async () => ({ ok: true, css: '/* KATEX */' }),
};

const {
  BLAETTER_SKRIPT,
  DRUCK_ZUSTAND,
  exportiereFoliensatzAlsHtml,
  exportiereFoliensatzAlsPdf,
  folienMeldung,
} = await import('../../../src/renderer/modules/views/folien-export.js');
const notizen = await import('../../../src/renderer/modules/views/folien-export-notizen.js');
const einstellungen =
  await import('../../../src/renderer/modules/settings/settings-small-sections.js');

const DECK = [
  '---',
  'presentation: true',
  '---',
  '',
  '# Erste Folie',
  '',
  '%% Erste Notiz mit **Fettem** %%',
  '',
  '---',
  '',
  '## Zweite Folie',
  '',
  '---',
  '',
  '![bg left](fehlt.png)',
  '',
  '## Dritte Folie',
  '',
  '<!-- Notiz mit [Verweis](https://example.org) -->',
  '',
  '%% <script>alert(1)</script> %%',
  '',
].join('\n');

beforeEach(() => {
  hinweise.length = 0;
  gespeichert.length = 0;
  teilbaumAufrufe.length = 0;
  html.length = 0;
  druckSeiten = null;
  schalter = true;
  paneEls.content = document.createElement('div');
  document.body.appendChild(paneEls.content);
  tabDerKlammer = { path: 'C:\\A\\Vortrag.md', content: DECK, viewMode: 'presentation' };
});

afterEach(() => {
  paneEls.content.remove();
  document.body.classList.remove(DRUCK_ZUSTAND);
});

const letzteMeldung = () => hinweise[hinweise.length - 1];

// --- Einstellungs-Seite «Export» (AK1) ---------------------------------------

describe('Schalter «Sprecher-Notizen mitgeben» (AK1)', () => {
  it('steht in der Gruppe «Foliensatz» nach «PDF-Export», Vorgabe aus', () => {
    const behaelter = document.createElement('div');
    einstellungen.renderExportSection(behaelter, {});
    const titel = Array.from(behaelter.querySelectorAll('h4')).map((h) => h.textContent);
    expect(titel).toEqual(['PDF-Export', 'Foliensatz']);
    const box = behaelter.querySelector('#settings-export-folien-notizen');
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    expect(behaelter.querySelector('label[for="settings-export-folien-notizen"]').textContent).toBe(
      'Sprecher-Notizen mitgeben',
    );
  });

  it('Entwurf, Änderungs-Anzeige und Anwenden schreiben genau den Schalter', async () => {
    const draft = {};
    const behaelter = document.createElement('div');
    einstellungen.renderExportSection(behaelter, draft);
    expect(einstellungen.dirtyExportSection(draft)).toBe(false);
    const box = behaelter.querySelector('#settings-export-folien-notizen');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(einstellungen.dirtyExportSection(draft)).toBe(true);
    await einstellungen.applyExportSection(draft);
    expect(gespeichert).toEqual([['export.folien.notizen', true]]);
    expect(einstellungen.dirtyExportSection(draft)).toBe(false);
    // Unverändert angewendet: kein weiterer Schreibvorgang.
    await einstellungen.applyExportSection(draft);
    expect(gespeichert).toHaveLength(1);
  });

  it('der geladene Stand: nur true schaltet ein, und er erscheint im Schalter', async () => {
    for (const [wert, erwartet] of [
      [undefined, false],
      ['true', false],
      [1, false],
      [true, true],
    ]) {
      schalter = wert;
      expect(await einstellungen.readFolienExportFromStore()).toEqual({ notizen: erwartet });
    }
    const behaelter = document.createElement('div');
    const draft = { exportFolien: { notizen: true }, exportFolienSnapshot: { notizen: true } };
    einstellungen.renderExportSection(behaelter, draft);
    expect(behaelter.querySelector('#settings-export-folien-notizen').checked).toBe(true);
  });

  it('die Vorgabe im Speicher ist aus, der Schlüssel derselbe wie beim Export', () => {
    expect(lies('src/main/app/settings-store.js')).toContain(
      'export: { folien: { notizen: false } }',
    );
    expect(notizen.NOTIZEN_EINSTELLUNG).toBe('export.folien.notizen');
  });
});

// --- PDF (AK3, AK4, AK5) ------------------------------------------------------

describe('PDF: Notiz-Seite hinter jeder Folie mit Notizen', () => {
  it('eingeschaltet: Folie 1, ihre Notizen, Folie 2, Folie 3, ihre Notizen', async () => {
    expect(await exportiereFoliensatzAlsPdf()).toBe(true);
    const art = druckSeiten.map((s) =>
      s.classList.contains('presentation-druck-notizen') ? `N${s.dataset.folie}` : 'F',
    );
    expect(art).toEqual(['F', 'N0', 'F', 'F', 'N2']);
    // Folien-Format: die Folie fest, die Notiz-Seite mindestens eine Seite
    // hoch; längere Notizen laufen auf Folge-Seiten desselben Formats weiter.
    for (const seite of druckSeiten) {
      expect(seite.style.width).toBe('1280px');
      const notiz = seite.classList.contains('presentation-druck-notizen');
      expect(notiz ? seite.style.minHeight : seite.style.height).toBe('720px');
      if (notiz) expect(seite.style.overflow).toBe('visible');
    }
    const [, erste, , , dritte] = druckSeiten;
    expect(erste.querySelector('.presentation-druck-notizen-kopf').textContent).toBe(
      'Folie 1 – Notizen',
    );
    expect(dritte.querySelector('.presentation-druck-notizen-kopf').textContent).toBe(
      'Folie 3 – Notizen',
    );
    // Gerendert durch die Pipeline, nie als Roh-HTML.
    expect(erste.querySelector('strong').textContent).toBe('Fettem');
    expect(dritte.querySelector('a[href="https://example.org"]')).not.toBeNull();
    expect(dritte.querySelector('script')).toBeNull();
    expect(dritte.textContent).toContain('<script>alert(1)</script>');
    const herkunft = Array.from(dritte.querySelectorAll('.presentation-druck-notiz')).map(
      (n) => n.dataset.herkunft,
    );
    expect(herkunft).toEqual(['html', 'prozent']);
    // Der Schritt-Satz läuft auch über die Notizen (Diagramme, Formeln).
    expect(teilbaumAufrufe).toHaveLength(5);
    expect(letzteMeldung().text).toBe(
      'Foliensatz als PDF exportiert: 3 Folien, 3 Sprecher-Notizen mitgegeben',
    );
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
  });

  it('ausgeschaltet: eine Seite je Folie und die Meldung der Stufe 1 (AK4)', async () => {
    schalter = false;
    expect(await exportiereFoliensatzAlsPdf()).toBe(true);
    expect(druckSeiten).toHaveLength(3);
    expect(paneEls.content.querySelector('.presentation-druck-notizen')).toBeNull();
    expect(teilbaumAufrufe).toHaveLength(3);
    expect(letzteMeldung().text).toBe(
      'Foliensatz als PDF exportiert: 3 Folien (Sprecher-Notizen nicht enthalten)',
    );
  });
});

// --- HTML (AK2, AK4, AK5) -----------------------------------------------------

describe('HTML: zugeklappter Notiz-Bereich je Folie mit Notizen', () => {
  async function seiten() {
    expect(await exportiereFoliensatzAlsHtml()).toBe(true);
    const dateien = html[0];
    return (name) => dateien.find((d) => d.name === name).text;
  }
  function bereiche(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return { doc, details: doc.querySelectorAll('details') };
  }

  it('eingeschaltet: Bereich nur auf Folien mit Notizen, zugeklappt, beschriftet', async () => {
    const seite = await seiten();
    expect(seite('index.html')).toBe(seite('folie-001.html'));
    const eins = bereiche(seite('folie-001.html'));
    expect(eins.details).toHaveLength(1);
    const bereich = eins.details[0];
    expect(bereich.hasAttribute('open')).toBe(false);
    expect(bereich.classList.contains('praesentation-seite-notizen')).toBe(true);
    expect(bereich.querySelector('summary').textContent).toBe('Notizen');
    expect(bereich.querySelector('strong').textContent).toBe('Fettem');
    // Zwischen Folie und Blätter-Leiste.
    expect(bereich.previousElementSibling.className).toBe('praesentation-seite-buehne');
    expect(bereich.nextElementSibling.tagName).toBe('NAV');
    expect(bereiche(seite('folie-002.html')).details).toHaveLength(0);
    expect(seite('folie-002.html')).not.toContain('praesentation-seite-notizen');
    const drei = bereiche(seite('folie-003.html'));
    expect(drei.details).toHaveLength(1);
    expect(drei.details[0].querySelector('a[href="https://example.org"]')).not.toBeNull();
    // Das Blätter-Skript bleibt das einzige Skript und unverändert.
    for (const name of ['folie-001.html', 'folie-003.html']) {
      const skripte = bereiche(seite(name)).doc.querySelectorAll('script');
      expect(skripte).toHaveLength(1);
      expect(skripte[0].textContent.trim()).toBe(BLAETTER_SKRIPT);
    }
  });

  it('meldet Folien, Ordner und mitgegebene Notizen; Entfallenes bleibt genannt (AK5)', async () => {
    await seiten();
    expect(letzteMeldung().text).toBe(
      'Foliensatz als HTML exportiert: 3 Folien in „Vortrag-Folien“, ' +
        '3 Sprecher-Notizen mitgegeben (1 Bild nicht eingebettet)',
    );
  });

  it('ausgeschaltet: keine Notizen auf den Seiten und die Meldung der Stufe 1 (AK4)', async () => {
    schalter = false;
    const seite = await seiten();
    for (const name of ['folie-001.html', 'folie-002.html', 'folie-003.html']) {
      expect(bereiche(seite(name)).details).toHaveLength(0);
      expect(seite(name)).not.toContain('Fettem');
    }
    expect(letzteMeldung().text).toBe(
      'Foliensatz als HTML exportiert: 3 Folien in „Vortrag-Folien“ ' +
        '(1 Bild nicht eingebettet, Sprecher-Notizen nicht enthalten)',
    );
  });
});

describe('Meldung mit der Zahl der mitgegebenen Notizen (AK5)', () => {
  it('Einzahl, Mehrzahl, ohne Notizen kein Teil', () => {
    const m = (mitgegeben) =>
      folienMeldung('presentation.export.pdfOk', { folien: 2, mitgegeben }, uebersetze).text;
    expect(m(1)).toBe('Foliensatz als PDF exportiert: 2 Folien, 1 Sprecher-Notiz mitgegeben');
    expect(m(4)).toBe('Foliensatz als PDF exportiert: 2 Folien, 4 Sprecher-Notizen mitgegeben');
    expect(m(0)).toBe('Foliensatz als PDF exportiert: 2 Folien');
  });

  it('zählt nur Notizen mit Text', () => {
    const modell = {
      folien: [{ notizen: [{ text: 'a' }, { text: '   ' }] }, { notizen: [] }, {}],
    };
    expect(notizen.mitgegebeneNotizen(modell)).toBe(1);
  });
});
