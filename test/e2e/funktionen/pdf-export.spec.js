// 4T-0303 (Epic 3E-0054): E2E-Funktions-Suite — PDF-Export (PD-01 bis
// PD-06); 4T-0311 (Epic 3E-0055) ergaenzt den Quelltext-Export (PD-07,
// PD-08). PD-01/PD-04/PD-05 sind zugleich der Spike gegen die drei
// dokumentierten Fehlerbilder aus 4T-0024: Dark-Theme-Reste trotz
// Print-Setup (PD-01: Farb-Marker im PDF), nur erste Seite wegen
// height:100%/overflow:hidden (PD-01: Seitenzahl; PD-05: Layout-Reset)
// und sichtbares Source-Pane durch Selektor-Kollision (PD-04/PD-05).
//
// Der native Save-Dialog ist per Playwright nicht bedienbar; die Specs
// ersetzen dialog.showSaveDialog im Main-Prozess durch einen Stub mit
// festem Zielpfad (bzw. Abbruch). Der Dialog selbst bleibt manueller Test.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'pdf-export.md');

// Save-Dialog im Main-Prozess stubben. Zaehlt Aufrufe in einem globalen
// Marker, damit Abbruch-Tests wissen, dass der Export-Pfad gelaufen ist.
async function stubSaveDialog(app, result) {
  await app.evaluate(({ dialog }, payload) => {
    globalThis.__pdfDialogCalls = 0;
    dialog.showSaveDialog = async () => {
      globalThis.__pdfDialogCalls += 1;
      return payload;
    };
  }, result);
}

function dialogCalls(app) {
  return app.evaluate(() => globalThis.__pdfDialogCalls || 0);
}

// Kommando Strg+Umschalt+P mit Poll ausloesen, bis der Export-Pfad laeuft
// (Dialog-Stub wurde gerufen) — der Kommando-Dispatcher ist erst nach dem
// asynchronen init() aktiv (Muster openSettingsPageViaKeyboard in
// einstellungen-seite.spec.js). WICHTIG: nach dem ersten erfolgreichen
// Ausloesen NICHT weiter druecken — jeder weitere Druck startet einen
// neuen Export, dessen printing-Zustand die Statusbar (und damit den
// Ergebnis-Hinweis) verstecken wuerde. Das Ergebnis prueft der Aufrufer
// anschliessend mit einem eigenen Poll ohne Tastendruecke.
async function triggerExportOnce(page, app) {
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Control+Shift+P');
        return dialogCalls(app);
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
}

// Seitenzahl eines PDFs: Anzahl der /Type /Page-Objekte (ohne /Pages).
function pdfPageCount(buffer) {
  const raw = buffer.toString('latin1');
  const matches = raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches ? matches.length : 0;
}

// Alle FlateDecode-Streams eines PDFs entpacken und konkatenieren (fuer
// die Farb-Marker-Pruefung der Content-Streams).
function pdfInflatedStreams(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    const slice = buffer.subarray(start, end);
    try {
      out.push(zlib.inflateSync(slice).toString('latin1'));
    } catch {
      // Nicht-Flate-Stream (Fonts, Bilder) — fuer die Pruefung irrelevant.
    }
  }
  return out.join('\n');
}

function tmpPdfPath(tag) {
  return path.join(os.tmpdir(), `scg-pdf-e2e-${tag}-${Date.now()}.pdf`);
}

// Erste MediaBox des PDFs: [Breite, Hoehe] in PDF-Punkten.
function pdfMediaBox(buffer) {
  const raw = buffer.toString('latin1');
  const m = raw.match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

// 4T-0751 (Epic 3E-0146): Die Auslieferungs-Voreinstellung ist seither
// Bernstein, und der Druck folgt dem aktiven HELL-Schema. Die Positiv-
// Kontrolle unten haengt an der Textfarbe des Standard-Schemas (#1f1f1f),
// deshalb setzt dieser Fall das Schema ausdruecklich. Geprueft wird hier der
// Dark-Rest, nicht die Voreinstellung; dass der Druck der Voreinstellung
// folgt, deckt test/unit/renderer/color-schemes-apply.test.js ab.
const STANDARD_SCHEMES = {
  language: 'de',
  colorSchemes: { custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' },
};

test.describe('PD-01: Export aus dem Dark-Theme (mehrseitig, ohne Dark-Reste)', () => {
  test('PDF entsteht, hat mehrere Seiten und keine Dark-Fuellfarben', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      settings: STANDARD_SCHEMES,
    });
    const target = tmpPdfPath('dark');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Render-Pipeline abwarten: Mermaid-SVG steht im Render-Pane.
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
        timeout: 20000,
      });
      // Dark-Theme erzwingen (Fehlerbild 1 aus 4T-0024 entstand im Dark-Export).
      await page.evaluate(() => window.api.setThemePref('dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      await stubSaveDialog(app, { canceled: false, filePath: target });
      await triggerExportOnce(page, app);
      await expect.poll(() => fs.existsSync(target), { timeout: 30000 }).toBe(true);

      const buffer = fs.readFileSync(target);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // Fehlerbild 2 (nur erste Seite): das Fixture ist sicher mehrseitig.
      expect(pdfPageCount(buffer)).toBeGreaterThan(1);

      // Fehlerbild 1 (Dark-Reste): Content-Streams entpacken und Farb-Marker
      // pruefen. Chromium schreibt Graustufen als '.1216 .1216 .1216 rg'
      // (vier Nachkommastellen ohne fuehrende Null). Format-Absicherung:
      // die Light-Textfarbe #1f1f1f (.1216) MUSS vorkommen — damit ist
      // belegt, dass das erwartete Format vorliegt und die Negativ-
      // Pruefung greift.
      const streams = pdfInflatedStreams(buffer);
      expect(streams).toContain('.1216 .1216 .1216');
      // Dark-Hintergrund #1e1e1e (.1176) und Dark-Code-Hintergrund
      // #2a2a2a (.1647) duerfen nicht auftauchen — auch nicht als
      // Seiten-Grundanstrich unter den Raendern (Fenster-Hintergrundfarbe,
      // Spike-Befund in pdf:print behoben).
      expect(streams).not.toContain('.1176 .1176 .1176');
      expect(streams).not.toContain('.1647 .1647 .1647');

      // Ruecknahme: Theme wieder dunkel, Print-Zustand abgebaut.
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('body.printing')).toHaveCount(0);
      // Erfolgs-Hinweis in der Statusbar (nicht als Fehler markiert).
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/error/);
    } finally {
      try {
        fs.rmSync(target, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      await closeApp(app, userData);
    }
  });
});

test.describe('PD-02: Abbruch im Save-Dialog', () => {
  test('Abbruch erzeugt keine Datei und keinen Fehler-Hinweis', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await stubSaveDialog(app, { canceled: true });
      await triggerExportOnce(page, app);
      // Kein Fehler-Hinweis; App bleibt bedienbar (View-Wechsel wirkt).
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/error/);
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('PD-03: Fehlerpfad (Zielpfad nicht schreibbar)', () => {
  test('Schreibfehler zeigt den roten Statusbar-Hinweis', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      const badTarget = path.join(os.tmpdir(), `scg-pdf-e2e-missing-${Date.now()}`, 'x', 'out.pdf');
      await stubSaveDialog(app, { canceled: false, filePath: badTarget });
      await triggerExportOnce(page, app);
      await expect(page.locator('#statusbar-hint.error.visible')).toBeVisible({ timeout: 15000 });
      // Print-Zustand ist trotz Fehler vollstaendig zurueckgenommen.
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('PD-04: Export aus dem Quelltext-Modus mit Modus-Wiederherstellung', () => {
  test('Export gelingt und der Quelltext-Modus bleibt erhalten', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const target = tmpPdfPath('source');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
        timeout: 20000,
      });
      // In den Quelltext-Modus wechseln (Fehlerbild 3: Source-Pane im PDF).
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);

      await stubSaveDialog(app, { canceled: false, filePath: target });
      await triggerExportOnce(page, app);
      await expect.poll(() => fs.existsSync(target), { timeout: 30000 }).toBe(true);

      const buffer = fs.readFileSync(target);
      expect(pdfPageCount(buffer)).toBeGreaterThan(1);
      // Modus-Wiederherstellung: Quelltext-Ansicht ist wieder aktiv,
      // Editor sichtbar, Print-Zustand abgebaut.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      try {
        fs.rmSync(target, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      await closeApp(app, userData);
    }
  });
});

test.describe('PD-05: Print-Layout-Regeln (DOM-Spike gegen die 4T-0024-Fehlerbilder)', () => {
  test('printing-Zustand versteckt UI und loest die Hoehen-/Overflow-Kappung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Dark-Theme, damit der data-theme-Wechsel des Print-Zustands die
      // realen Verhaeltnisse des Dark-Exports abbildet.
      await page.evaluate(() => window.api.setThemePref('dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      const styles = await page.evaluate(() => {
        const root = document.documentElement;
        // Print-Zustand wie in exportActiveTabAsPdf aufbauen.
        root.setAttribute('data-theme', 'light');
        root.classList.add('printing');
        document.body.classList.add('printing');
        const probe = (sel, prop) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el)[prop] : null;
        };
        const result = {
          bodyOverflow: getComputedStyle(document.body).overflowY,
          bodyHeight: document.body.style.height || getComputedStyle(document.body).height,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          paneSourceDisplay: probe('.pane-group[data-pane="0"] .pane-source', 'display'),
          statusbarDisplay: probe('footer.statusbar', 'display'),
          tabbarDisplay: probe('.pane-group[data-pane="0"] .tabbar', 'display'),
          sidebarDisplay: probe('.pane-group[data-pane="0"] .pane-sidebar-left', 'display'),
          renderedDisplay: probe('.pane-group[data-pane="0"] .pane-rendered', 'display'),
          renderedOverflow: probe('.pane-group[data-pane="0"] .pane-rendered', 'overflowY'),
          contentDisplay: probe('.pane-group[data-pane="0"] .content', 'display'),
        };
        // Zurueckbauen.
        document.body.classList.remove('printing');
        root.classList.remove('printing');
        root.setAttribute('data-theme', 'dark');
        return result;
      });

      // Fehlerbild 2: keine Viewport-Kappung mehr.
      expect(styles.bodyOverflow).toBe('visible');
      // Fehlerbild 3: Source-Pane ist im Print-Zustand unsichtbar.
      expect(styles.paneSourceDisplay).toBe('none');
      // Fehlerbild 1: Body ist weiss (JS-Override + data-theme light).
      expect(styles.bodyBg).toBe('rgb(255, 255, 255)');
      // UI-Chrome verschwindet, Render-Pane fliesst als Block.
      expect(styles.statusbarDisplay).toBe('none');
      expect(styles.tabbarDisplay).toBe('none');
      expect(styles.sidebarDisplay).toBe('none');
      expect(styles.renderedDisplay).toBe('block');
      expect(styles.renderedOverflow).toBe('visible');
      expect(styles.contentDisplay).toBe('block');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0304 (Epic 3E-0054): Export-Einstellungen — Defaults im Bereich
// Export, Querformat-Aenderung wirkt auf den naechsten Export und ist
// persistiert (Store-Wert; derselbe Wert traegt die Neustart-Persistenz).
test.describe('PD-06: Export-Einstellungen (Bereich Export, Querformat)', () => {
  test('Defaults sichtbar; Querformat wirkt auf den Export und ist persistiert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const target = tmpPdfPath('landscape');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
        timeout: 20000,
      });

      // Einstellungs-Seite oeffnen (Poll: Dispatcher erst nach init aktiv).
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.settings-page').count();
        })
        .toBeGreaterThan(0);
      await page.locator('.settings-nav-entry[data-section-id="export"]').click();

      // Defaults: A4, Hochformat, normale Raender.
      await expect(page.locator('#settings-export-page-size')).toHaveValue('A4');
      await expect(page.locator('#settings-export-orientation')).toHaveValue('portrait');
      await expect(page.locator('#settings-export-margins')).toHaveValue('normal');

      // Querformat waehlen, OK wendet an und schliesst den Einstellungs-Tab
      // (das Seiten-DOM bleibt im versteckten .pane-system-Container stehen,
      // deshalb die Tab-Anzahl statt des DOM-Knotens pruefen).
      await page.locator('#settings-export-orientation').selectOption('landscape');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('export.pdf.landscape')))
        .toBe(true);

      // Export: das PDF ist im Querformat (A4: 842 x 595 Punkte).
      await stubSaveDialog(app, { canceled: false, filePath: target });
      await triggerExportOnce(page, app);
      await expect.poll(() => fs.existsSync(target), { timeout: 30000 }).toBe(true);
      const box = pdfMediaBox(fs.readFileSync(target));
      expect(box).not.toBeNull();
      expect(box[0]).toBeGreaterThan(box[1]);
    } finally {
      try {
        fs.rmSync(target, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      await closeApp(app, userData);
    }
  });
});

// 4T-0311 (Epic 3E-0055): Quelltext-Ansicht im PDF-Export — der Export
// folgt der aktiven Ansicht; der Quelltext-Modus druckt den Roh-Quelltext
// ueber den dedizierten Print-Block (CodeMirror ist virtualisiert und
// nicht druckbar).
test.describe('PD-07: Export aus dem Quelltext-Modus druckt den Quelltext', () => {
  test('PDF entsteht mehrseitig, Ansicht und Print-Zustand sauber zurueckgestellt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const target = tmpPdfPath('source-view');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
        timeout: 20000,
      });
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);

      await stubSaveDialog(app, { canceled: false, filePath: target });
      await triggerExportOnce(page, app);
      await expect.poll(() => fs.existsSync(target), { timeout: 30000 }).toBe(true);

      const buffer = fs.readFileSync(target);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // Das Fixture ist als Roh-Quelltext sicher mehrseitig.
      expect(pdfPageCount(buffer)).toBeGreaterThan(1);
      // Ansicht unveraendert, Print-Zustand und Print-Block abgebaut.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect(page.locator('.pdf-source-print')).toHaveCount(0);
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/error/);
    } finally {
      try {
        fs.rmSync(target, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      await closeApp(app, userData);
    }
  });
});

test.describe('PD-08: Print-Layout-Regeln des Quelltext-Drucks (DOM-Spike)', () => {
  test('printing-source zeigt den Print-Block statt des Render-Panes', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      const styles = await page.evaluate(() => {
        const root = document.documentElement;
        const content = document.querySelector('.pane-group[data-pane="0"] .content');
        // Print-Zustand des Quelltext-Exports nachbauen (Dummy-Block).
        const block = document.createElement('div');
        block.className = 'pdf-source-print hljs with-line-numbers';
        block.innerHTML =
          '<div class="pdf-source-line"><span class="pdf-source-lineno">1</span>' +
          '<span class="pdf-source-code"># Titel</span></div>';
        content.appendChild(block);
        root.classList.add('printing');
        document.body.classList.add('printing', 'printing-source');
        const probe = (sel, prop) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el)[prop] : null;
        };
        const result = {
          renderedDisplay: probe('.pane-group[data-pane="0"] .pane-rendered', 'display'),
          sourcePaneDisplay: probe('.pane-group[data-pane="0"] .pane-source', 'display'),
          blockDisplay: probe('.pdf-source-print', 'display'),
          lineDisplay: probe('.pdf-source-line', 'display'),
          whiteSpace: probe('.pdf-source-code', 'whiteSpace'),
        };
        document.body.classList.remove('printing', 'printing-source');
        root.classList.remove('printing');
        block.remove();
        return result;
      });
      // Render-Pane und Editor sind versteckt, der Print-Block fliesst.
      expect(styles.renderedDisplay).toBe('none');
      expect(styles.sourcePaneDisplay).toBe('none');
      expect(styles.blockDisplay).toBe('block');
      // Zeilennummern-Spalte aktiv, Einrueckung bleibt erhalten.
      expect(styles.lineDisplay).toBe('grid');
      expect(styles.whiteSpace).toBe('pre-wrap');
    } finally {
      await closeApp(app, userData);
    }
  });
});
