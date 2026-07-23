// 4T-0176: Regressionstests fuer die Sicherheits-Haertung des Render-Pfads:
// (a) P-02 Portable-HTML-Whitelist, (b) P-03 Bild-Containment,
// (c) P-07 javascript:-Wiki-Links. M-17 (will-navigate) ist eine
// Main-Prozess-Sperre ohne bekannten Ausloesepfad — Code-Review genuegt.
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

test.describe('P-02: Portable-Marker rendert nur die Tabellen-Whitelist', () => {
  test('Export-Tabelle bleibt, eingeschleustes UI-HTML verschwindet', async () => {
    const workDir = makeWorkDir('scg-md-p02-');
    const file = path.join(workDir, 'portable.md');
    fs.writeFileSync(
      file,
      [
        '<!-- perspective-portable -->',
        '# PortableTest',
        '',
        '<table class="perspective-table"><thead><tr><th colspan="2">Kopf</th></tr></thead>',
        '<tbody><tr><td>A</td><td>B</td></tr></tbody></table>',
        '',
        '<form action="https://boese.example"><button>Anmelden</button></form>',
        '',
        '<style>body { display: none; }</style>',
        '',
        'Text danach.',
      ].join('\n'),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const body = page.locator(SEL.markdownBody0);
      // Eigene Export-Tabelle rendert weiter.
      await expect(body.locator('table.perspective-table td').first()).toHaveText('A');
      await expect(body.locator('th')).toHaveAttribute('colspan', '2');
      // Eingeschleustes Spoofing-HTML ist nicht im DOM.
      await expect(body.locator('form')).toHaveCount(0);
      await expect(body.locator('button')).toHaveCount(0);
      await expect(body.locator('style')).toHaveCount(0);
      // Und das <style> hat nicht gewirkt: das Dokument ist sichtbar.
      await expect(body.locator('h1')).toBeVisible();
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('P-03: Bild-Resolver respektiert das Dokument-Verzeichnis', () => {
  test('../-Traversal wird nicht als data-URI eingebettet', async () => {
    const workDir = makeWorkDir('scg-md-p03-');
    fs.mkdirSync(path.join(workDir, 'doc'));
    // "Geheime" Datei ausserhalb des Dokument-Ordners.
    fs.writeFileSync(path.join(workDir, 'geheim.png'), 'GEHEIM-INHALT', 'utf8');
    // Legitimes Bild im Dokument-Ordner (1x1-PNG).
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(path.join(workDir, 'doc', 'ok.png'), pngBytes);
    const file = path.join(workDir, 'doc', 'bilder.md');
    fs.writeFileSync(file, '# Bilder\n\n![ok](ok.png)\n\n![boese](../geheim.png)\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('img')).toHaveCount(2);
      // Das legitime Bild ist eingebettet, das Traversal-Ziel nicht.
      await expect(body.locator('img[src^="data:image/png"]')).toHaveCount(1);
      const srcs = await body
        .locator('img')
        .evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
      expect(srcs.some((s) => s.includes('geheim'))).toBe(true); // unaufgeloest geblieben
      expect(srcs.filter((s) => s.startsWith('data:')).length).toBe(1);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('P-07: javascript:-Wiki-Links werden nicht zu Links', () => {
  test('[[javascript:alert(1)]] rendert ohne Anker-Element', async () => {
    const workDir = makeWorkDir('scg-md-p07-');
    const file = path.join(workDir, 'links.md');
    fs.writeFileSync(file, '# Links\n\nBoese: [[javascript:alert(1)]]\n\nGut: [[Ziel]]\n', 'utf8');
    fs.writeFileSync(path.join(workDir, 'Ziel.md'), '# Ziel\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('a.wikilink')).toHaveCount(1); // nur [[Ziel]]
      const hrefs = await body
        .locator('a')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href') || ''));
      expect(hrefs.some((h) => h.toLowerCase().startsWith('javascript:'))).toBe(false);
      // Der Quelltext bleibt sichtbar (nicht verschluckt).
      await expect(body).toContainText('javascript:alert(1)');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
