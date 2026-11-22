// 4T-000479 (Epic 3E-000089): %%-Kommentare — End-to-End ueber die drei
// Ansichten. Privater Text zwischen %%-Markern erscheint in keiner
// gerenderten Ansicht, bleibt aber Quelltext; im Quelltext-Modus faerbt
// die App die Marker (.cm-comment-marker), im Live-Modus blendet sie den
// Kommentar auf inaktiven Zeilen aus (.cm-live-marker-hidden).
// describe-Titel tragen die Funktions-IDs (PK-01 …); der Abdeckungs-Matrix-
// Eintrag liegt bei help.feature.comments (F-111).
//
// 4T-002794 (Epic 3E-000434): PK-04 bis PK-06 pruefen die gemeldeten Faelle
// mit einzelnen Backticks ausserhalb von Code (Fall 2 unmaskiert, Fall 3
// maskiert, dazu eine Tabellen-Zeile) an der gestarteten Anwendung: Lese-
// Ansicht, Einfaerbung im Editor (die Code-Frage geht dort ueber die Bruecke
// window.api.kommentarImCode), Ausblenden im Live-Modus und die tatsaechlich
// geschriebene Datei des portablen Exports. Die Gegenprobe ist ein echtes
// Code-Stueck, das den Marker woertlich zeigt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { warteAufText } = require('../helpers/dateien');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'prozent-kommentare.md',
);

const FIXTURE_BACKTICKS = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'prozent-kommentare-backticks.md',
);

// Die drei Kommentar-Texte der Vorlage, je einer Stelle zugeordnet.
const GEHEIM_STELLEN = ['GEHEIM-FALL-ZWEI', 'GEHEIM-FALL-DREI', 'GEHEIM-TABELLE'];
const WOERTLICH = 'WOERTLICH-IM-CODE';

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('PK-01: Render-Pane zeigt keinen Kommentar-Inhalt', () => {
  test('sichtbarer Text bleibt, GEHEIM-INLINE und GEHEIM-BLOCK fehlen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body).toContainText('Sichtbarer Absatz');
      await expect(body).toContainText('Abschliessender sichtbarer Absatz');
      await expect(body).not.toContainText('GEHEIM-INLINE');
      await expect(body).not.toContainText('GEHEIM-BLOCK');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PK-02: Quelltext-Modus zeigt den Kommentar und faerbt die Marker', () => {
  test('Editor enthaelt GEHEIM-INLINE und mindestens ein .cm-comment-marker', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Kommentar bleibt Quelltext und ist im Editor sichtbar.
      await expect(editor).toContainText('GEHEIM-INLINE');
      // Einfaerbung der %%-Bereiche im Haupt-Editor (.pane-source
      // qualifiziert gegen die zweite CodeMirror-Instanz, 4T-000361).
      const marker = page.locator(`${SEL.paneSource0} .cm-comment-marker`);
      await expect(marker.first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PK-03: Live-Modus blendet den Kommentar auf inaktiven Zeilen aus', () => {
  test('bei Cursor auf Zeile 1 liegt GEHEIM in einem .cm-live-marker-hidden', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Cursor steht initial auf Zeile 1; die Kommentar-Zeilen sind
      // inaktiv und werden ausgeblendet. Das Ausblende-Element umschliesst
      // den kompletten Kommentar inklusive Marker.
      const hidden = page.locator(`${SEL.paneSource0} .cm-live-marker-hidden`);
      await expect(hidden.first()).toBeAttached();
      await expect(hidden.filter({ hasText: 'GEHEIM' }).first()).toBeAttached();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PK-04: Lese-Ansicht verbirgt den Kommentar auch zwischen einzelnen Backticks', () => {
  test('Fall 2, Fall 3 und Tabellen-Zeile ohne Kommentar, Gegenprobe im Code-Element', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE_BACKTICKS] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      // Anfang und Ende belegen, dass das ganze Dokument gerendert ist und
      // die Abwesenheit unten nicht an einer leeren Ansicht haengt.
      await expect(body).toContainText('Sichtbarer Anfang');
      await expect(body).toContainText('Sichtbares Ende');
      // Gegenprobe: das echte Code-Stueck zeigt den Marker woertlich.
      await expect(body.locator('code', { hasText: WOERTLICH })).toHaveCount(1);
      for (const geheim of GEHEIM_STELLEN) {
        await expect(body).not.toContainText(geheim);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PK-05: Editor faerbt den Kommentar als Kommentar, Live-Modus blendet ihn aus', () => {
  test('Quelltext-Modus: alle drei Stellen in .cm-comment-marker, die Gegenprobe nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE_BACKTICKS] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      await expect(editor).toContainText('Sichtbares Ende');
      // Einfaerbung im Haupt-Editor (.pane-source qualifiziert gegen die
      // zweite CodeMirror-Instanz, 4T-000361). Die Code-Frage des Fenster-
      // Teils laeuft ueber die Bruecke; ohne sie gaelten die einzelnen
      // Backticks als Code-Stueck und die Stelle bliebe ungefaerbt.
      const marker = page.locator(`${SEL.paneSource0} .cm-comment-marker`);
      for (const geheim of GEHEIM_STELLEN) {
        await expect(marker.filter({ hasText: geheim }).first()).toBeVisible();
      }
      // Gegenprobe: der Marker im echten Code-Stueck ist kein Kommentar. Erst
      // nach den positiven Treffern geprueft, damit die Einfaerbung steht.
      await expect(editor).toContainText(WOERTLICH);
      await expect(marker.filter({ hasText: WOERTLICH })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Live-Modus: bei Cursor auf Zeile 1 liegt GEHEIM-FALL-ZWEI in einem .cm-live-marker-hidden', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE_BACKTICKS] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Cursor steht initial auf Zeile 1 (Muster PK-03); die Zeile des
      // Kommentars ist inaktiv und wird samt Marker ausgeblendet.
      const hidden = page.locator(`${SEL.paneSource0} .cm-live-marker-hidden`);
      await expect(hidden.filter({ hasText: 'GEHEIM-FALL-ZWEI' }).first()).toBeAttached();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Der native Speichern-Dialog ist per Playwright nicht bedienbar; er wird im
// Hauptprozess durch einen festen Zielpfad ersetzt, und der Export wird ueber
// denselben Menue-Kanal ausgeloest wie der Menue-Eintrag (Muster
// test/e2e/funktionen/mermaid-export.spec.js). Der Dialog selbst bleibt
// manuelle Pruefung.
async function stubSaveDialog(app, zielPfad) {
  await hauptSenden(
    app,
    ({ dialog }, ziel) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: ziel });
    },
    zielPfad,
  );
}

async function sendMenuChannel(app, channel) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, kanal) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(kanal);
    },
    channel,
  );
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

test.describe('PK-06: Speichern als portables Markdown schreibt den Kommentar nicht mit', () => {
  test('die geschriebene Datei traegt keine der drei Stellen, wohl aber die Gegenprobe', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-prozent-kommentare-'));
    const ziel = path.join(dir, 'export.md');
    const { app, page, userData } = await launchApp({ args: [FIXTURE_BACKTICKS] });
    try {
      await waitForTab(page);
      await stubSaveDialog(app, ziel);
      await sendMenuChannel(app, 'menu:exportPortable');
      // Gewartet wird auf den Inhalt bis zum letzten Absatz, nicht auf die
      // Anlage der Datei (Stabilitaetsregel 12).
      const inhalt = await warteAufText(ziel, 'Sichtbares Ende');
      expect(inhalt).toContain('Sichtbarer Anfang');
      expect(inhalt).toContain(WOERTLICH);
      for (const geheim of GEHEIM_STELLEN) {
        expect(inhalt).not.toContain(geheim);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
