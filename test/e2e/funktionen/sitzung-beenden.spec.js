// 4T-002788 (Epic 3E-000397): Die Sitzung mit zwei Fenstern übersteht ein
// Beenden, bei dem ein Fenster noch eine Rückfrage offen hat.
//
// SBE-01: Zwei Fenster. Im zweiten steht ein ungespeicherter Reiter, der nicht
//         vorn ist. Beim Beenden schließt das erste Fenster sofort; das zweite
//         holt den ungespeicherten Reiter nach vorn (und meldet damit seine
//         Reiter), fragt nach und wartet auf die Antwort. Vor der Behebung
//         feuerte in dieser Wartezeit die verzögerte Sicherung der
//         Fenster-Liste und schrieb den Stand mit nur noch einem Fenster über
//         den vollständigen Stand von 'before-quit'; nach dem Neustart kam ein
//         Fenster statt zwei. Der Fall stellt die Wartezeit fest ein (die
//         Antwort auf die Rückfrage kommt nach anderthalb Sekunden) und ist
//         damit, anders als der Fall der Mehr-Fenster-Sitzung in
//         regal.spec.js, nicht auf ein Zeitfenster von 500 ms angewiesen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  oeffneDokumentImFenster,
  warteAufRendererBereit,
} = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

// Wartezeit der Rückfrage: deutlich über den 500 ms der verzögerten Sicherung.
const RUECKFRAGE_MS = 1500;

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sb-'));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

// Die Rückfrage «ungespeicherte Änderungen» im Hauptprozess beantworten: nach
// der Wartezeit mit «Verwerfen» (Antwort 1). Der native Dialog ist per
// Playwright nicht bedienbar (Muster entwurfs-zwischenspeicher.spec.js).
async function rueckfrageVerzoegertVerwerfen(app, wartezeitMs) {
  await hauptSenden(
    app,
    ({ dialog }, ms) => {
      globalThis.__sbeRueckfragen = 0;
      dialog.showMessageBox = async () => {
        globalThis.__sbeRueckfragen += 1;
        await new Promise((fertig) => setTimeout(fertig, ms));
        return { response: 1 };
      };
    },
    wartezeitMs,
  );
}

// Menü-Kanal an genau dieses Fenster schicken.
async function sendeMenueKanal(app, page, kanal) {
  const fenster = await app.browserWindow(page);
  const fensterId = await hauptLesen(fenster, (w) => w.id);
  await hauptSenden(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.fensterId);
      if (win && !win.isDestroyed()) win.webContents.send(a.kanal);
    },
    { fensterId, kanal },
  );
}

test.describe('SBE-01: Mehr-Fenster-Sitzung übersteht das Beenden mit Rückfrage in einem Fenster (4T-002788)', () => {
  test('nach dem Neustart sind beide Fenster wieder da', async () => {
    const dir = makeTempDir();
    const eins = path.join(dir, 'eins.md');
    const drei = path.join(dir, 'drei.md');
    fs.writeFileSync(eins, '# Eins\n\nErstes Fenster.\n', 'utf8');
    fs.writeFileSync(drei, '# Drei\n\nZweites Fenster.\n', 'utf8');
    // Ohne den Entwurfs-Speicher fragt das Beenden auch zu einem
    // ungespeicherten neuen Dokument nach.
    const first = await launchApp({ settings: { language: 'de', keepUnsavedDrafts: false } });
    const userData = first.userData;
    let zweiterStart = null;
    try {
      await oeffneDokumentImFenster(first.app, first.page, eins);

      // Zweites Fenster derselben Applikation.
      const fensterVorher = first.app.windows().length;
      await first.page.evaluate(() => window.api.openNewWindow());
      await expect.poll(() => first.app.windows().length).toBe(fensterVorher + 1);
      const zweite = first.app.windows().find((p) => p !== first.page);
      // Ein Menü-Befehl vor dem Bereit-Zeichen des neuen Fensters verpufft.
      await warteAufRendererBereit(zweite);

      // Dort ein neues Dokument mit Inhalt (ungespeichert) …
      const reiterVorher = await zweite.locator(SEL.tabs0).count();
      await sendeMenueKanal(first.app, zweite, 'menu:new');
      await expect(zweite.locator(SEL.tabs0)).toHaveCount(reiterVorher + 1);
      const editor = zweite.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      if ((await editor.getAttribute('contenteditable')) !== 'true') {
        await zweite.locator(SEL.btnEdit).click();
      }
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      await editor.click();
      await zweite.keyboard.type('UNGESPEICHERT');
      await expect(zweite.locator(SEL.dirtyTab0).last()).toBeVisible();
      // … und danach eine Datei, deren Reiter nach vorn kommt: Der
      // ungespeicherte Reiter ist beim Beenden nicht der aktive.
      await oeffneDokumentImFenster(first.app, zweite, drei);
      await expect(zweite.locator(SEL.activeTab0)).toContainText('drei');

      await rueckfrageVerzoegertVerwerfen(first.app, RUECKFRAGE_MS);
      const beendet = first.app.waitForEvent('close');
      await hauptSenden(first.app, ({ app }) => app.quit());
      // Die Rückfrage muss wirklich gekommen sein: Ohne sie gäbe es die
      // Wartezeit nicht, in der die verzögerte Sicherung zuschlagen konnte, und
      // der Fall bliebe auch ohne die Behebung grün. Gelesen, solange der
      // Prozess während der Wartezeit noch lebt.
      await expect
        .poll(() => hauptLesen(first.app, () => globalThis.__sbeRueckfragen || 0), {
          intervals: [50],
          timeout: 10_000,
        })
        .toBe(1);
      await beendet;

      zweiterStart = await launchApp({ userData });
      await expect.poll(() => zweiterStart.app.windows().length).toBe(2);
      // Beide Dateien sind wieder da, je in einem Fenster.
      const reiterAllerFenster = async () => {
        const titel = [];
        for (const w of zweiterStart.app.windows()) {
          titel.push(await w.locator(SEL.activeTab0).innerText());
        }
        return titel.join(' | ');
      };
      await expect.poll(reiterAllerFenster).toContain('eins');
      await expect.poll(reiterAllerFenster).toContain('drei');
    } finally {
      if (zweiterStart) await closeApp(zweiterStart.app, null, { force: true });
      // Die erste Instanz hat sich selbst beendet; closeApp räumt das Profil.
      await closeApp(first.app, userData, { force: true });
      removeDir(dir);
    }
  });
});
