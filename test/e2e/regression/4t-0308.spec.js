// 4T-000308 (Epic 3E-000048): Regressionstest fuer W-14 aus dem Code-Audit
// 4T-000275. Ein bei der Sitzungswiederherstellung nicht lesbarer Tab wurde
// zuvor still verworfen (und beim naechsten persistState() dauerhaft aus der
// Sitzung entfernt); jetzt bleibt er als missing-Tab erhalten, plus ein
// Statusbar-Hinweis. B-03 und W-13 (Tab-Transfer zwischen Fenstern mit
// nicht lesbarer Ziel-Datei bzw. dirty Ziel-Tab) sind ueber native
// Konflikt-/Fehler-Dialoge und ein nicht deterministisch simulierbares
// readFile-Timing gefuehrt und im manuellen EXE-Test der Gesamtabnahme
// abgedeckt (siehe Task-Loesung 4T-000308).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

test.describe('SR-01: Session-Restore einer geloeschten Datei (W-14, 4T-000308)', () => {
  test('nicht lesbarer Tab bleibt als missing-Tab erhalten statt still verworfen', async () => {
    // Datei in einem eigenen Temp-Ordner anlegen, damit sie nach dem Quit
    // geloescht werden kann.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sr-'));
    const file = path.join(workDir, 'fluechtig.md');
    fs.writeFileSync(file, '# Fluechtig\n\nInhalt.\n', 'utf8');

    const first = await launchApp({ args: [file] });
    const userData = first.userData;
    try {
      await expect(first.page.locator(SEL.tabs0)).toHaveCount(1);
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      // Datei zwischen den Laeufen loeschen — Restore trifft auf einen
      // Lesefehler.
      fs.rmSync(file, { force: true });

      const second = await launchApp({ userData });
      try {
        // Tab bleibt erhalten (nicht verworfen) und ist als missing markiert.
        await expect(second.page.locator(SEL.tabs0)).toHaveCount(1);
        await expect(second.page.locator(SEL.tabs0).first()).toHaveClass(/tab-missing/);
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
      fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
