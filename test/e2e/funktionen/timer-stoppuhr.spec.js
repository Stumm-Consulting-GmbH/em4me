// 4T-000638 (Epic 3E-000069): E2E-Funktions-Suite Timer und Stoppuhr
// (Uhr-Erweiterung).
//
// Timer und Stoppuhr stehen wie die Wecker app-weit im Einstellungs-
// Speicher. Die Faelligkeit prueft der Main mit einem gezielten Weckruf auf
// den naechsten Ablauf — deshalb ist der Ablauf-Test hier schnell (kurze
// Dauer genuegt) und braucht kein Polling-Fenster wie beim Wecker.
//
// TS-01: Timer-Modus leer; ein Schnellwahl-Knopf legt einen laufenden Timer
//        an, dessen Restzeit sichtbar faellt.
// TS-02: Pause, Start und Zuruecksetzen wirken; das Zeilen-Menue loescht.
// TS-03: „Eigene Dauer" ueber den Dialog mit der Segment-Steuerung.
// TS-04: Ein ablaufender Timer meldet sich mit Dialog; „Erneut starten"
//        laesst ihn wieder laufen.
// TS-05: Stoppuhr — Start, Runde, Pause, Zuruecksetzen.
// TS-06: Ein laufender Timer ueberlebt den Neustart mit korrekter Restzeit.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const CLOCK_BTN = '#btn-clock';
const SECTION = '.pane-group .sidebar-clock';
const MODE = (m) => `.pane-group .sidebar-clock [data-clock-mode="${m}"]`;
const ROWS = '.pane-group .sidebar-clock .timer-row';
const QUICK = '.pane-group .sidebar-clock .timer-quick-btn';
const CUSTOM = '.pane-group .sidebar-clock .alarm-add-btn';
const MODAL = '#timer-modal';
const DURATION = '#timer-duration';
const DUE_MODAL = '#timer-due-modal';
const SW = '.pane-group .sidebar-clock .stopwatch-view';

// Panel oeffnen und in den gewuenschten Modus schalten (Muster wecker.spec).
async function openMode(page, mode) {
  const section = page.locator(SECTION).first();
  for (let i = 0; i < 2; i++) {
    if (await section.isVisible()) break;
    await page.click(CLOCK_BTN);
    await page.waitForTimeout(150);
  }
  await expect(section).toBeVisible();
  await page.click(MODE(mode));
  await expect(page.locator(MODE(mode)).first()).toHaveAttribute('aria-pressed', 'true');
}

// Timer-Liste direkt in den Store schreiben; startedAt bezieht sich auf die
// Uhr des laufenden Systems (Main und Renderer teilen sie).
async function seedRunningTimer(page, { id, durationMs, label }) {
  await page.evaluate(
    (t) =>
      window.api.setSetting('clock.timers', [
        {
          id: t.id,
          label: t.label,
          durationMs: t.durationMs,
          state: 'running',
          startedAt: Date.now(),
          elapsedMs: 0,
        },
      ]),
    { id, durationMs, label },
  );
}

test.describe('TS-01: Timer anlegen', () => {
  test('leerer Modus zeigt den Hinweis; die Schnellwahl startet sofort', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'timer');
      await expect(page.locator(`${SECTION} .clock-placeholder`).first()).toBeVisible();
      await expect(page.locator(ROWS)).toHaveCount(0);

      // Erster Schnellwahl-Knopf: eine Minute, sofort laufend.
      await page.locator(QUICK).first().click();
      const row = page.locator(ROWS).first();
      await expect(row).toBeVisible();
      await expect(row).toHaveClass(/running/);
      const zeit = row.locator('.timer-row-time');
      await expect(zeit).toHaveText(/^0[01]:\d{2}$/);
      // Die Restzeit faellt sichtbar (eigener Anzeige-Takt).
      const vorher = await zeit.textContent();
      await expect.poll(async () => zeit.textContent(), { timeout: 5000 }).not.toBe(vorher);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TS-02: Pause, Zuruecksetzen und Loeschen', () => {
  test('die Aktionen der Zeile wirken', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await seedRunningTimer(page, { id: 't1', durationMs: 10 * 60000, label: 'Test' });
      await openMode(page, 'timer');
      const row = page.locator(ROWS).first();
      await expect(row).toHaveClass(/running/);

      // Pause haelt die Restzeit an.
      await row.locator('.timer-action').first().click();
      await expect(row).not.toHaveClass(/running/);
      const angehalten = await row.locator('.timer-row-time').textContent();
      await page.waitForTimeout(1200);
      await expect(row.locator('.timer-row-time')).toHaveText(angehalten);

      // Zuruecksetzen stellt die volle Dauer wieder her.
      await row.locator('.timer-action.secondary').first().click();
      await expect(row.locator('.timer-row-time')).toHaveText('10:00');

      // Loeschen ueber das Zeilen-Menue.
      await row.locator('.alarm-row-menu').click();
      await page.locator('#context-menu .context-menu-item', { hasText: /.+/ }).last().click();
      await expect(page.locator(ROWS)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TS-03: Eigene Dauer', () => {
  test('der Dialog uebernimmt die Segment-Steuerung', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'timer');
      await page.click(CUSTOM);
      await expect(page.locator(MODAL)).toBeVisible();

      // Minuten-Segment steht im Fokus; Pfeil hoch erhoeht um eins.
      const minuten = page.locator(`${DURATION} [data-seg="minutes"]`);
      await expect(minuten).toHaveText('05');
      await minuten.press('ArrowUp');
      await expect(minuten).toHaveText('06');
      // Ziffern-Eingabe schiebt von rechts nach.
      const sekunden = page.locator(`${DURATION} [data-seg="seconds"]`);
      await sekunden.click();
      await sekunden.press('3');
      await expect(sekunden).toHaveText('03');

      await page.fill('#timer-label', 'Aufguss');
      await page.click('#btn-timer-ok');
      await expect(page.locator(MODAL)).toBeHidden();

      const row = page.locator(ROWS).first();
      await expect(row.locator('.timer-row-time')).toHaveText(/^06:0[23]$/);
      await expect(row.locator('.timer-row-label')).toContainText('Aufguss');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TS-04: Ablauf', () => {
  test('der Dialog erscheint und laesst den Timer erneut starten', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'timer');
      await seedRunningTimer(page, { id: 't1', durationMs: 2000, label: 'Kurz' });

      await expect(page.locator(DUE_MODAL)).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#timer-due-list')).toContainText('Kurz');
      await page.click('#btn-timer-restart');
      await expect(page.locator(DUE_MODAL)).toBeHidden();
      await expect(page.locator(ROWS).first()).toHaveClass(/running/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TS-05: Stoppuhr', () => {
  test('Start, Runde, Pause und Zuruecksetzen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openMode(page, 'stopwatch');
      const view = page.locator(SW).first();
      await expect(view.locator('.stopwatch-main')).toHaveText('00:00');
      // Ohne Lauf ist die Runden-Taste gesperrt.
      await expect(view.locator('.timer-action.secondary').first()).toBeDisabled();

      await view.locator('.timer-action').first().click();
      await expect
        .poll(async () => view.locator('.stopwatch-hundredths').textContent(), { timeout: 5000 })
        .not.toBe('.00');

      await view.locator('.timer-action.secondary').first().click();
      await expect(view.locator('.stopwatch-lap')).toHaveCount(1);

      // Pause haelt die Anzeige an.
      await view.locator('.timer-action').first().click();
      const stand = await view.locator('.stopwatch-main').textContent();
      const hundert = await view.locator('.stopwatch-hundredths').textContent();
      await page.waitForTimeout(600);
      await expect(view.locator('.stopwatch-main')).toHaveText(stand);
      await expect(view.locator('.stopwatch-hundredths')).toHaveText(hundert);

      // Zuruecksetzen loescht Zeit und Runden.
      await view.locator('.timer-action.secondary').last().click();
      await expect(view.locator('.stopwatch-main')).toHaveText('00:00');
      await expect(view.locator('.stopwatch-lap')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TS-06: Neustart', () => {
  test('ein laufender Timer rechnet nach dem Neustart korrekt weiter', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      await seedRunningTimer(first.page, { id: 't1', durationMs: 30 * 60000, label: 'Lang' });
      await openMode(first.page, 'timer');
      await expect(first.page.locator(ROWS).first()).toHaveClass(/running/);
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await openMode(second.page, 'timer');
        const row = second.page.locator(ROWS).first();
        await expect(row).toHaveClass(/running/);
        // Die Restzeit ist um die Ausfallzeit kleiner, nicht eingefroren.
        await expect(row.locator('.timer-row-time')).toHaveText(/^(29|30):\d{2}$/);
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});
