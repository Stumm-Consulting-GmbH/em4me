// 4T-001471 (Epic 3E-000178): E2E-Funktions-Specs des portablen Exports mit
// Diagrammen. Geprueft wird an der geschriebenen Datei UND an ihrer Anzeige
// nach dem erneuten Oeffnen — der zweite Teil ist der Kern: Die erste Fassung
// schrieb inline SVG, das in der Datei stand und beim Oeffnen spurlos
// verschwand, weil der Portable-Marker den Whitelist-Sanitizer scharf schaltet.
// Ein Test, der nur den Datei-INHALT liest, findet so etwas nie.
//
// Der native Save-Dialog ist per Playwright nicht bedienbar; die Specs ersetzen
// dialog.showSaveDialog im Main-Prozess durch einen Stub mit festem Zielpfad
// (Muster pdf-export.spec.js). Der Dialog selbst bleibt manueller Test.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'mermaid-export.md');
const BILD_KOPF = String.fromCharCode(60) + 'img alt=';
const BILD_TRENNER = 'src="data:image/svg+xml;base64,';

function makeWorkDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-mermaid-export-'));
}

// Alle eingebrannten Bilder einer exportierten Datei, als decodierte SVG.
function eingebrannteBilder(inhalt) {
  const out = [];
  let pos = 0;
  for (;;) {
    const i = inhalt.indexOf(BILD_TRENNER, pos);
    if (i < 0) break;
    const ende = inhalt.indexOf(String.fromCharCode(34), i + BILD_TRENNER.length);
    out.push(Buffer.from(inhalt.slice(i + BILD_TRENNER.length, ende), 'base64').toString('utf8'));
    pos = ende;
  }
  return out;
}

// Mermaid vergibt je Lauf eine eigene Kennung und flicht sie in den Stil-Block
// ein. Verglichen wird ohne sie; was bleibt, ist die Palette.
function ohneKennungen(svg) {
  return svg
    .split('mermaid-')
    .map((teil, i) => (i === 0 ? teil : teil.replace(/^[0-9]+/, '')))
    .join('mermaid-');
}

async function stubSaveDialog(app, zielPfad) {
  await app.evaluate(({ dialog }, ziel) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: ziel });
  }, zielPfad);
}

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function exportiere(app, page, zielPfad) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await stubSaveDialog(app, zielPfad);
  await sendMenuChannel(app, 'menu:exportPortable');
  await expect.poll(() => fs.existsSync(zielPfad), { timeout: 30000 }).toBe(true);
  await expect
    .poll(() => fs.readFileSync(zielPfad, 'utf8').includes('Schluss.'), { timeout: 30000 })
    .toBe(true);
  return fs.readFileSync(zielPfad, 'utf8');
}

test.describe('ME-01: Diagramme werden eingebrannt', () => {
  test('zwei Bilder, das fehlerhafte bleibt Quelltext, fremde Bloecke unberuehrt (AK1, AK4, AK5)', async () => {
    const ziel = path.join(makeWorkDir(), 'export.md');
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      const inhalt = await exportiere(app, page, ziel);
      const bilder = eingebrannteBilder(inhalt);
      expect(bilder).toHaveLength(2);
      for (const svg of bilder) expect(svg.startsWith('<svg')).toBe(true);
      expect(inhalt).not.toContain('graph TD;');
      expect(inhalt).not.toContain('graph LR;');
      // Kein rohes HTML: Die Bildsyntax laeuft nicht durch den Sanitizer.
      // Kein inline SVG: Es steht base64-kodiert in der Bild-Adresse.
      expect(inhalt).not.toContain('<svg ');
      expect(inhalt).not.toContain('mermaid-export');
      // AK4: das fehlerhafte Diagramm behaelt seinen Fence.
      expect(inhalt).toContain('kaputtdiagramm');
      // AK8: der fremde Code-Block bleibt, wie er ist.
      expect(inhalt).toContain('const a = 1;');
      expect(inhalt).toContain('Schluss.');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('ME-02: Unabhaengig vom Ansichts-Modus', () => {
  test('auch aus der Quelltext-Ansicht entstehen Bilder (AK2)', async () => {
    const ziel = path.join(makeWorkDir(), 'export.md');
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0 + ' .mermaid-block')).toHaveCount(0);
      const inhalt = await exportiere(app, page, ziel);
      expect(eingebrannteBilder(inhalt)).toHaveLength(2);
      expect(inhalt).not.toContain('graph TD;');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('ME-03: Unabhaengig vom Farbschema', () => {
  test('der dunkel exportierte Stand gleicht dem hell exportierten (AK3)', async () => {
    const arbeit = makeWorkDir();
    const hell = path.join(arbeit, 'hell.md');
    const dunkel = path.join(arbeit, 'dunkel.md');

    const ersteSitzung = await launchApp({ args: [FIXTURE] });
    let inhaltHell;
    try {
      inhaltHell = await exportiere(ersteSitzung.app, ersteSitzung.page, hell);
    } finally {
      await closeApp(ersteSitzung.app, ersteSitzung.userData, { force: true });
    }

    const zweiteSitzung = await launchApp({ args: [FIXTURE] });
    let inhaltDunkel;
    try {
      await expect(zweiteSitzung.page.locator(SEL.tabs0).first()).toBeVisible();
      await zweiteSitzung.page.evaluate(() =>
        document.documentElement.setAttribute('data-theme', 'dark'),
      );
      inhaltDunkel = await exportiere(zweiteSitzung.app, zweiteSitzung.page, dunkel);
    } finally {
      await closeApp(zweiteSitzung.app, zweiteSitzung.userData, { force: true });
    }

    const h = eingebrannteBilder(inhaltHell).map(ohneKennungen);
    const d = eingebrannteBilder(inhaltDunkel).map(ohneKennungen);
    expect(h).toHaveLength(2);
    expect(d).toEqual(h);
  });
});

test.describe('ME-04: Aus-Zustand der Erweiterung', () => {
  test('ohne die Diagramm-Erweiterung bleibt jeder Fence stehen (AK7)', async () => {
    const ziel = path.join(makeWorkDir(), 'export.md');
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['mermaid']));
      const inhalt = await exportiere(app, page, ziel);
      expect(eingebrannteBilder(inhalt)).toHaveLength(0);
      expect(inhalt).toContain('graph TD;');
      expect(inhalt).toContain('graph LR;');
    } finally {
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('ME-05: Die exportierte Datei zeigt ihre Diagramme', () => {
  // Der Fall, der in der ersten Fassung gefehlt hat. Geprueft wird nicht der
  // Datei-Inhalt, sondern was ein Betrachter davon SIEHT: Die Datei traegt den
  // Portable-Marker, der den Whitelist-Sanitizer scharf schaltet — inline SVG
  // verschwand dort spurlos, und der Datei-Inhalt sah trotzdem richtig aus.
  test('beim erneuten Oeffnen erscheinen die Bilder in der Anzeige (AK1)', async () => {
    const ziel = path.join(makeWorkDir(), 'export.md');

    const ersteSitzung = await launchApp({ args: [FIXTURE] });
    try {
      const inhalt = await exportiere(ersteSitzung.app, ersteSitzung.page, ziel);
      expect(inhalt).toContain(BILD_KOPF);
    } finally {
      await closeApp(ersteSitzung.app, ersteSitzung.userData, { force: true });
    }

    const zweiteSitzung = await launchApp({ args: [ziel] });
    try {
      const { app, page } = zweiteSitzung;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const bilder = page.locator(SEL.markdownBody0 + ' img');
      await expect(bilder).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        const quelle = await bilder.nth(i).getAttribute('src');
        expect(quelle.startsWith('data:image/svg+xml;base64,')).toBe(true);
        // Wirklich geladen, nicht nur im DOM: naturalWidth ist 0 bei einem
        // Bild, das der Betrachter nicht darstellen kann.
        await expect
          .poll(() => bilder.nth(i).evaluate((el) => el.complete && el.naturalWidth > 0), {
            timeout: 15000,
          })
          .toBe(true);
      }
    } finally {
      await closeApp(zweiteSitzung.app, zweiteSitzung.userData, { force: true });
    }
  });
});
