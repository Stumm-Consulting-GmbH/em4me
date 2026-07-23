// 4T-0174: Regressionstests fuer Render-Pipeline-, Live-Modus- und
// Editor-Fixes: (a) R1-01 mehrzeiliges Bild im Live-Modus, (b) P-01
// Prozent im Embed-Bildnamen, (c) R2-02 Link-Aufloesung in MD-Embeds.
// Die uebrigen Befunde sind Code-Korrekturen mit bestehender Suite bzw.
// manuellen Pruefpfaden (Timing/Theme), siehe Task.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

function makeWorkDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test.describe('R1-01: Mehrzeiliges Bild crasht den Live-Modus nicht', () => {
  test('Live-Modus bleibt benutzbar, keine Page-Errors', async () => {
    const workDir = makeWorkDir('scg-md-r101-');
    const file = path.join(workDir, 'mehrzeilig.md');
    // Legales CommonMark: Zeilenumbruch im alt-Text des Bildes.
    fs.writeFileSync(file, '# Titel\n\n![alt mit\numbruch](bild.png)\n\nDanach Text.\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-live/);

      // Editor ist da und reagiert (vorher: Exception-Dauerschleife).
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('Tippen geht.');
      expect(await page.locator(SEL.editorContent0).innerText()).toContain('Tippen geht.');
      expect(pageErrors).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('P-01: Prozent im Embed-Bildnamen bricht den Voll-Render nicht ab', () => {
  test('Dokument rendert trotz %-Bildpfad', async () => {
    const workDir = makeWorkDir('scg-md-p01-');
    const file = path.join(workDir, 'prozent.md');
    // '%' gefolgt von Nicht-Hex wirft in decodeURI einen URIError;
    // das Wiki-Embed-src ist unkodiert.
    fs.writeFileSync(file, '# ProzentTest\n\n![[Bild 20%.png]]\n\nText nach dem Embed.\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Vor dem Fix blieb das Render-Pane leer (replace-Callback warf durch).
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('ProzentTest');
      await expect(page.locator(SEL.markdownBody0)).toContainText('Text nach dem Embed.');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('R2-02: Links in Markdown-Embeds lösen gegen die Embed-Datei auf', () => {
  test('Klick auf Embed-Link öffnet die Datei aus dem Embed-Verzeichnis', async () => {
    const workDir = makeWorkDir('scg-md-r202-');
    fs.mkdirSync(path.join(workDir, 'sub'));
    fs.writeFileSync(path.join(workDir, 'haupt.md'), '# Haupt\n\n![[sub/eingebettet]]\n', 'utf8');
    fs.writeFileSync(
      path.join(workDir, 'sub', 'eingebettet.md'),
      '# Eingebettet\n\nSiehe [Ziel](ziel.md).\n',
      'utf8',
    );
    // ziel.md existiert NUR im Unterordner — eine Aufloesung gegen den
    // Pane-Tab (workDir) liefe ins Leere.
    fs.writeFileSync(path.join(workDir, 'sub', 'ziel.md'), '# ZielDatei\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [path.join(workDir, 'haupt.md')] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const embedLink = page.locator('.wiki-embed-md-body a', { hasText: 'Ziel' });
      await expect(embedLink).toBeVisible();
      await embedLink.click();

      // Die Datei aus dem Embed-Verzeichnis ist als zweiter Tab offen.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/ziel/);
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('ZielDatei');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
