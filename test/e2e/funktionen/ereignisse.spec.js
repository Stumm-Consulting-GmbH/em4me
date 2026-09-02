// 4T-000512 (Epic 3E-000092): Ereignis-Fence — Tabellen-Rendering mit Badges
// und Differenz-Spalte, CRUD über Formularzeile und Zeilen-Bearbeitung,
// Löschen mit Bestätigung (IPC im Test auf "bestätigt" gestubbt), Read-only
// in der Lese-Ansicht. describe-Titel tragen die Funktions-IDs (EV-01 …).
// Zeit-Robustheit: Erwartungen nutzen nur richtungs-stabile Texte
// (feste Vergangenheits-Daten -> "vergangen"), nie konkrete Tages-Zähler.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'ereignisse.md');
// 4T-000722: eigene Fixture für die Gantt-Ansicht (zwei verkettete Spannen
// und ein Zeitpunkt ohne Ende; Spanne 2020 bis 2099, damit der Stichtag
// des Laufs immer innerhalb der Achse liegt).
const GANTT_FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'ereignisse-gantt.md',
);

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Editor-Helfer: geteilte Ansicht aktivieren und Fence + Quelltext-Pane liefern.
async function openSplit(page) {
  await page.locator(SEL.viewBtn('split')).click();
  const fence = page.locator(SEL.markdownBody0).locator('.perspective-events[data-ev-index="0"]');
  await expect(fence.locator('.pev-table')).toBeVisible();
  return { fence, editor: page.locator(SEL.editorContent0) };
}

test.describe('EV-01: Ereignis-Fence rendert Tabelle mit Badges und Differenz', () => {
  test('Spalten-Köpfe lokalisiert, Kategorie-Badge, Staffelung mit Richtung, Wiederkehr-Zeile', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const fence = page.locator(SEL.markdownBody0).locator('.perspective-events');
      await expect(fence.locator('.pev-table')).toBeVisible();
      // Lokalisierte Spalten-Köpfe (DE).
      await expect(fence.locator('th.pev-col-date')).toHaveText('Zeitpunkt');
      await expect(fence.locator('th.pev-col-diff')).toHaveText('Zeitdifferenz');
      // Kategorie-Badge mit lokalisiertem Label.
      await expect(fence.locator('.pev-badge[data-ev-cat="projekt"]')).toHaveText('Projekt');
      // Differenz-Spalte: Richtung und mindestens die Tages-Staffel.
      const diff = fence.locator('tr[data-ev-row="0"] td.pev-diff');
      await expect(diff.locator('.pev-diff-dir')).toHaveText('vergangen');
      await expect(diff.locator('.pev-diff-line').first()).toContainText('Tage');
      // Wiederkehrender Eintrag traegt die Wiederkehr-Zeile.
      const recurring = fence.locator('tr[data-ev-row="1"] td.pev-diff .pev-countdown');
      await expect(recurring).toContainText('Wiederkehr');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  // PO-Entscheidung C1 (2026-07-15): auch die Lese-Ansicht pflegt —
  // Anlage/Aktionen wie in geteilter und Live-Ansicht.
  test('Lese-Ansicht pflegt ebenfalls: Formularzeile sichtbar, Anlage schreibt ins Dokument', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const fence = page.locator(SEL.markdownBody0).locator('.perspective-events');
      await expect(fence.locator('.pev-table')).toBeVisible();
      // Aktions-Spalte trägt einen lokalisierten Kopf (PO-Befund C1).
      await expect(fence.locator('th.pev-col-actions')).toHaveText('Aktionen');
      const form = fence.locator('.pev-add-form');
      await expect(form).toBeVisible();
      await form.locator('.pev-form-text').fill('Aus der Lese-Ansicht');
      await form.locator('.pev-add-btn').click();
      // Reading rendert neu und zeigt den neuen Eintrag; Tab ist dirty.
      await expect(
        page.locator(SEL.markdownBody0).locator('.pev-text-main', {
          hasText: 'Aus der Lese-Ansicht',
        }),
      ).toBeVisible();
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EV-02: Anlage über die Formularzeile schreibt in den Fence', () => {
  test('Pflicht nur Text, Zeitpunkt-Default heute, Kategorie-Komfort setzt Wiederkehr, Undo in einem Schritt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      const form = fence.locator('.pev-add-form');
      await expect(form).toBeVisible();
      // Kategorie Geburtstag aktiviert die Wiederkehr automatisch.
      await form.locator('.pev-form-category').selectOption('geburtstag');
      await expect(form.locator('.pev-form-recurring-box')).toBeChecked();
      await form.locator('.pev-form-text').fill('Neuer Eintrag');
      await form.locator('.pev-add-btn').click();
      // Quelltext: neue Zeile mit heutigem Datum (JJJJ-MM-TT) und x-Flag.
      await expect(editor).toContainText(
        /\| \d{4}-\d{2}-\d{2} \|\s+\| Neuer Eintrag\s+\| geburtstag \|\s+\| x \|/,
      );
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      // Undo nimmt genau die Anlage zurueck.
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      await expect(editor).not.toContainText('Neuer Eintrag');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('leerer Text wird abgewiesen (Statusbar-Hinweis, kein Schreiben)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      const before = await editor.textContent();
      await fence.locator('.pev-add-btn').click();
      await expect(page.locator('#statusbar-hint')).toContainText('Pflichteingabe');
      expect(await editor.textContent()).toBe(before);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EV-03: Zeilen-Bearbeitung mit Sperre der übrigen Zeilen', () => {
  test('Bearbeiten übernimmt Feld-Änderungen in den Fence; Esc bricht ab', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      const row = fence.locator('tr[data-ev-row="0"]');
      await row.hover();
      await row.locator('.pev-edit-btn').click();
      await expect(row).toHaveClass(/pev-editing/);
      // Übrige Zeilen sind gesperrt (Container-Klasse).
      await expect(fence).toHaveClass(/pev-editing-locked/);
      const textInput = row.locator('.pev-edit-text');
      await textInput.fill('Projektstart Beta');
      await textInput.press('Enter');
      await expect(editor).toContainText('Projektstart Beta');
      // Abbruch-Weg: Bearbeitung öffnen, ändern, Esc — nichts geschrieben.
      const freshRow = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events tr[data-ev-row="0"]');
      await freshRow.hover();
      await freshRow.locator('.pev-edit-btn').click();
      await freshRow.locator('.pev-edit-text').fill('Verworfen');
      await freshRow.locator('.pev-edit-text').press('Escape');
      await expect(editor).not.toContainText('Verworfen');
      await expect(editor).toContainText('Projektstart Beta');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EV-04: Duplizieren und Löschen mit Bestätigung', () => {
  test('Duplizieren erzeugt Kopie; Löschen entfernt nach Bestätigung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      // Lösch-Bestätigung im Test auf "bestätigt" stubben (OS-Dialog ist
      // in Playwright nicht bedienbar; der Dialog-Inhalt ist Main-seitig).
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('events:confirmDelete');
        ipcMain.handle('events:confirmDelete', () => true);
      });
      const { fence, editor } = await openSplit(page);
      const row = fence.locator('tr[data-ev-row="1"]');
      await row.hover();
      await row.locator('.pev-dup-btn').click();
      // Kopie steht als dritte Zeile im Quelltext (zweimal derselbe Text).
      await expect(editor).toContainText(/Geburtstag Anna[\s\S]*Geburtstag Anna/);
      // Löschen der Kopie (Zeile 2 nach dem Duplizieren).
      const freshFence = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events[data-ev-index="0"]');
      const copyRow = freshFence.locator('tr[data-ev-row="2"]');
      await copyRow.hover();
      await copyRow.locator('.pev-del-btn').click();
      await expect(editor).not.toContainText(/Geburtstag Anna[\s\S]*Geburtstag Anna/);
      await expect(editor).toContainText('Geburtstag Anna');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000513 (Epic 3E-000092): Ansichts-Sortierung, Filter-Leiste und
// gespeicherte Filter (filter:-Direktiven im Fence).
test.describe('EV-05: Sortierung und Filter-Leiste', () => {
  test('Default Zeitpunkt absteigend; Kopf-Klick dreht; Filter verstecken Zeilen mit Zähler und Hervorhebung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence } = await openSplit(page);
      // Default-Sortierung Zeitpunkt absteigend: 2020 vor 1990.
      const firstRow = fence.locator('tbody tr:not(.pev-row-hidden)').first();
      await expect(firstRow).toHaveAttribute('data-ev-row', '0');
      await expect(fence.locator('th[data-ev-sort="date"]')).toHaveClass(/pev-sort-desc/);
      // Kopf-Klick dreht auf aufsteigend: 1990 zuerst.
      await fence.locator('th[data-ev-sort="date"]').click();
      await expect(fence.locator('tbody tr').first()).toHaveAttribute('data-ev-row', '1');
      await expect(fence.locator('th[data-ev-sort="date"]')).toHaveClass(/pev-sort-asc/);
      // Filter-Leiste öffnen, Volltext filtert mit Zähler und <mark>.
      await fence.locator('.pev-filter-toggle').click();
      const bar = fence.locator('.pev-filter-bar');
      await expect(bar).toBeVisible();
      await bar.locator('.pev-filter-text').fill('geburtstag');
      await expect(fence.locator('tr[data-ev-row="0"]')).toHaveClass(/pev-row-hidden/);
      await expect(fence.locator('tr[data-ev-row="1"]')).not.toHaveClass(/pev-row-hidden/);
      await expect(fence.locator('.pev-filter-count')).toHaveText('1 von 2 Einträgen');
      await expect(fence.locator('tr[data-ev-row="1"] .pev-text-main mark')).toHaveText(
        'Geburtstag',
      );
      // Aktiver Filter als Chip mit Zähler-Badge; Chip-Entfernen setzt zurück.
      await expect(fence.locator('.pev-filter-badge')).toHaveText('1');
      await expect(fence.locator('.pev-filter-chip')).toContainText('Text: geburtstag');
      await fence.locator('.pev-filter-chip-remove').click();
      await expect(fence.locator('tr[data-ev-row="0"]')).not.toHaveClass(/pev-row-hidden/);
      await expect(fence.locator('.pev-filter-count')).toHaveCount(0);
      // Kategorie-Chip plus Preset „Zukünftige" kombiniert: nichts sichtbar.
      await fence.locator('.pev-filter-cat[data-cat="geburtstag"]').click();
      await fence.locator('.pev-filter-preset').selectOption('future');
      await expect(fence.locator('.pev-filter-count')).toHaveText('0 von 2 Einträgen');
      await expect(fence.locator('.pev-filter-badge')).toHaveText('2');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EV-06: Gespeicherte Filter als filter:-Direktiven', () => {
  test('Speichern schreibt in den Fence, Anwenden setzt die Leiste, Löschen entfernt die Direktive', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      await fence.locator('.pev-filter-toggle').click();
      const bar = fence.locator('.pev-filter-bar');
      await bar.locator('.pev-filter-cat[data-cat="geburtstag"]').click();
      await bar.locator('.pev-filter-name').fill('Runde');
      await bar.locator('.pev-filter-save').click();
      // filter:-Direktive steht im Quelltext (ein Undo-Schritt).
      await expect(editor).toContainText('filter: Runde := categories=geburtstag');
      // Neu aufgebaute Leiste kennt den gespeicherten Filter; Anwenden
      // nach dem Zurücksetzen der Kategorie stellt ihn wieder her.
      const freshFence = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events[data-ev-index="0"]');
      const freshBar = freshFence.locator('.pev-filter-bar');
      await expect(freshBar.locator('.pev-filter-saved option[value="Runde"]')).toHaveCount(1);
      await freshBar.locator('.pev-filter-cat[data-cat="geburtstag"]').click(); // Kategorie wieder abwählen
      await expect(freshFence.locator('.pev-filter-count')).toHaveCount(0);
      await freshBar.locator('.pev-filter-saved').selectOption('Runde');
      await expect(freshFence.locator('.pev-filter-count')).toHaveText('1 von 2 Einträgen');
      // Die Dropdown-Auswahl bleibt nach dem Anwenden erhalten; Löschen
      // entfernt die Direktive aus dem Quelltext.
      await expect(freshFence.locator('.pev-filter-saved')).toHaveValue('Runde');
      await freshFence.locator('.pev-filter-delete').click();
      await expect(editor).not.toContainText('filter: Runde');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000514 (Epic 3E-000092): Zusatz-Ansichten — Umschalter persistiert die
// view:-Direktive, Dashboard rendert die Sektionen, der Ereignis-Klick
// springt transient zur Tabellen-Zeile (kein Dokument-Write).
test.describe('EV-09: Ansichts-Umschalter und Dashboard', () => {
  test('Umschalter schreibt view:-Direktive; Dashboard-Sektionen; Chip-Klick springt zur Tabelle', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      await expect(fence.locator('.pev-switcher')).toBeVisible();
      await fence.locator('.pev-viewbtn[data-ev-viewbtn="dashboard"]').click();
      // Direktive steht im Quelltext (ein Undo-Schritt), Dashboard sichtbar.
      await expect(editor).toContainText('view: dashboard');
      const freshFence = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events[data-ev-index="0"]');
      await expect(freshFence.locator('.pev-dashboard')).toBeVisible();
      await expect(freshFence.locator('.pev-dash-title').first()).toHaveText(
        'Anstehende Ereignisse',
      );
      // Wiederkehr-Vorkommen der Anna erscheint als anstehendes Ereignis.
      const chip = freshFence.locator('.pev-dashboard .pev-event-chip', {
        hasText: 'Geburtstag Anna',
      });
      await expect(chip.first()).toBeVisible();
      // Chip-Klick wechselt transient zur Tabelle (Direktive bleibt).
      await chip.first().click();
      await expect(freshFence.locator('.pev-table')).toBeVisible();
      await expect(editor).toContainText('view: dashboard');
      await expect(freshFence.locator('.pev-viewbtn[data-ev-viewbtn="table"]')).toHaveClass(
        /active/,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EV-10: Monats-Kalender mit Navigation', () => {
  test('Raster mit Heute-Markierung; Navigation wechselt den Monat, Heute kehrt zurück', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence } = await openSplit(page);
      await fence.locator('.pev-viewbtn[data-ev-viewbtn="month"]').click();
      const freshFence = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events[data-ev-index="0"]');
      const cal = freshFence.locator('.pev-calendar');
      await expect(cal).toBeVisible();
      await expect(cal.locator('.pev-cal-weekday')).toHaveCount(7);
      await expect(cal.locator('.pev-cal-day.pev-cal-today')).toHaveCount(1);
      const title = await cal.locator('.pev-cal-title').textContent();
      await cal.locator('.pev-cal-next').click();
      const freshCal = freshFence.locator('.pev-calendar');
      await expect(freshCal.locator('.pev-cal-title')).not.toHaveText(title);
      await freshCal.locator('.pev-cal-today-btn').click();
      await expect(freshFence.locator('.pev-calendar .pev-cal-title')).toHaveText(title);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000722 (Epic 3E-000150): Gantt-Ansicht — Umschalter persistiert die
// Direktive, Balken und Raute sitzen auf der Achse, Abhängigkeits- und
// Heute-Linie liegen als Overlay darüber, der Klick auf einen Balken
// springt transient zur Tabellen-Zeile (kein Dokument-Write).
test.describe('EV-15: Gantt-Ansicht mit Balken, Raute und Abhängigkeits-Linie', () => {
  test('Umschalter schreibt view: gantt; Achse, Balken und Overlay stehen; Balken-Klick springt zur Tabelle', async () => {
    const { app, page, userData } = await launchApp({ args: [GANTT_FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      await fence.locator('.pev-viewbtn[data-ev-viewbtn="gantt"]').click();
      await expect(editor).toContainText('view: gantt');
      const freshFence = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events[data-ev-index="0"]');
      const gantt = freshFence.locator('.pev-gantt');
      await expect(gantt).toBeVisible();
      // Eine Zeile je Ereignis, zwei Spannen als Balken, ein Zeitpunkt als Raute.
      await expect(gantt.locator('.pev-gantt-row')).toHaveCount(3);
      await expect(gantt.locator('.pev-chip-gantt-bar')).toHaveCount(2);
      await expect(gantt.locator('.pev-chip-gantt-point')).toHaveCount(1);
      // Achse mit Gitter-Marken, dazu Heute- und Abhängigkeits-Linie.
      await expect(gantt.locator('.pev-gantt-tick').first()).toBeVisible();
      await expect(gantt.locator('.pev-gantt-overlay .pev-gantt-today')).toHaveCount(1);
      await expect(gantt.locator('.pev-gantt-overlay .pev-gantt-link')).toHaveCount(1);
      // Verknüpfungs-Zähler in der Label-Spalte beider verketteter Zeilen.
      await expect(gantt.locator('.pev-gantt-link-count')).toHaveCount(2);
      // Balken-Klick wechselt transient zur Tabelle; die Direktive bleibt.
      await gantt.locator('.pev-chip-gantt-bar').first().click();
      await expect(freshFence.locator('.pev-table')).toBeVisible();
      await expect(editor).toContainText('view: gantt');
      await expect(freshFence.locator('.pev-viewbtn[data-ev-viewbtn="table"]')).toHaveClass(
        /active/,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  // 4T-001278 (Epic 3E-000232, Befund B2): Die Bedienelemente der Werkzeugleiste
  // dürfen einander nicht überlappen.
  //
  // Der Befund: Unter Linux fängt der Filter-Umschalter die Klicks auf den
  // Gantt-Knopf ab («.pev-filter-toggle intercepts pointer events»), und die
  // Gantt-Ansicht ist damit nicht erreichbar — der vollständige Ausfall einer
  // Funktion auf einer ausgelieferten Plattform. Unter Windows tritt das nicht
  // auf.
  //
  // Der Fall ist zugleich **Messung und Regressionstest**: Er prüft die
  // Überlappungs-Freiheit und legt im roten Fall die Zahlen offen, die die drei
  // Ursachen-Kandidaten trennen (gesetzte Schrift, gerenderte Geometrie,
  // Stapel-Reihenfolge). Ohne diese Ausgabe müsste ein roter Lauf unter Linux
  // eigens nachgemessen werden, und ein Container-Lauf kostet Minuten.
  test('Filter-Umschalter und Ansichts-Knöpfe überlappen einander nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [GANTT_FIXTURE] });
    try {
      await waitForTab(page);
      const { fence } = await openSplit(page);
      // Der Filter-Knopf trägt opacity: 0 und wird erst beim Überfahren des
      // Containers sichtbar — seine Klick-Fläche besteht aber unabhängig davon.
      await fence.hover();
      const filter = fence.locator('.pev-filter-toggle');
      const gantt = fence.locator('.pev-viewbtn[data-ev-viewbtn="gantt"]');
      await expect(filter).toHaveCount(1);
      await expect(gantt).toHaveCount(1);

      const mass = await fence.evaluate((el) => {
        const f = el.querySelector('.pev-filter-toggle');
        const g = el.querySelector('.pev-viewbtn[data-ev-viewbtn="gantt"]');
        const lies = (n) => {
          const r = n.getBoundingClientRect();
          const s = getComputedStyle(n);
          return {
            links: Math.round(r.left),
            rechts: Math.round(r.right),
            oben: Math.round(r.top),
            unten: Math.round(r.bottom),
            schrift: s.fontFamily,
            groesse: s.fontSize,
            zeiger: s.pointerEvents,
            deckkraft: s.opacity,
          };
        };
        return { filter: lies(f), gantt: lies(g) };
      });

      // Rechteck-Schnitt in beiden Achsen: nur dann verdeckt das eine das andere.
      const waagerecht =
        mass.filter.links < mass.gantt.rechts && mass.gantt.links < mass.filter.rechts;
      const senkrecht = mass.filter.oben < mass.gantt.unten && mass.gantt.oben < mass.filter.unten;
      expect(
        waagerecht && senkrecht,
        `Bedienelemente überlappen — die Gantt-Ansicht ist nicht erreichbar.\n` +
          `filter: ${JSON.stringify(mass.filter)}\n` +
          `gantt : ${JSON.stringify(mass.gantt)}`,
      ).toBe(false);

      // Und der Klick muss ankommen, nicht nur die Geometrie stimmen: Playwright
      // scheitert hier mit «intercepts pointer events», wenn etwas davorliegt.
      await gantt.click({ timeout: 10000 });
      await expect(fence.locator('.pev-gantt')).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Live-Modus zeigt dieselbe Gantt-Ansicht', async () => {
    const { app, page, userData } = await launchApp({ args: [GANTT_FIXTURE] });
    try {
      await waitForTab(page);
      const { fence } = await openSplit(page);
      await fence.locator('.pev-viewbtn[data-ev-viewbtn="gantt"]').click();
      await page.locator(SEL.viewBtn('live')).click();
      const liveFence = page.locator(`${SEL.editorContent0} .perspective-events`).first();
      await expect(liveFence.locator('.pev-gantt')).toBeVisible({ timeout: 15000 });
      await expect(liveFence.locator('.pev-chip-gantt-bar')).toHaveCount(2);
      await expect(liveFence.locator('.pev-gantt-overlay .pev-gantt-link')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Regressionstest zum PO-Befund C1 vom 2026-07-15: Der Kalender-Picker
// schrieb den gewählten START-Zeitpunkt nicht ins Formular-Feld (der
// Wrapper-Span trug dieselbe Klasse wie das Input; querySelector traf
// den Span). Ende-Feld war nie betroffen (eigene Klasse).
test.describe('EV-08: Kalender-Picker füllt den Formular-Zeitpunkt', () => {
  test('📅 am Start-Feld öffnet den Picker; Übernehmen schreibt das Datum ins Feld', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence } = await openSplit(page);
      const startInput = fence.locator('input.pev-form-date');
      await expect(startInput).toHaveValue('');
      await fence.locator('.pev-form-pick[data-ev-pick="date"]').click();
      // Picker öffnet mit heutigem Datum vorselektiert; OK übernimmt.
      await page.locator('#date-picker-ok').click();
      await expect(startInput).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Regressionstest zum PO-Befund C1 vom 2026-07-15 (4T-000513-Nachbesserung):
// Das Live-Block-Widget wählte nur die innere Tabelle statt des
// .perspective-events-Wrappers — damit fehlten im Live-Modus die
// data-ev-Attribute (Fence-Zuordnung, Stichtag), die Differenz-Spalte,
// die Formularzeile und die Sortierung.
test.describe('EV-07: Live-Modus trägt den vollen Funktionsumfang', () => {
  test('Wrapper, Differenz-Spalte, Sortierung und Anlage im Live-Widget', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      // Der Wrapper (nicht nur die Tabelle) steht im Widget.
      const liveFence = page.locator(`${SEL.editorContent0} .perspective-events`).first();
      await expect(liveFence.locator('.pev-table')).toBeVisible({ timeout: 15000 });
      // Differenz-Spalte ist gerechnet und lokalisiert.
      await expect(liveFence.locator('tr[data-ev-row="0"] td.pev-diff .pev-diff-dir')).toHaveText(
        'vergangen',
      );
      // Default-Sortierung aktiv (Indikator am Zeitpunkt-Kopf).
      await expect(liveFence.locator('th[data-ev-sort="date"]')).toHaveClass(/pev-sort-desc/);
      // Anlage über die Formularzeile schreibt ins Dokument; das Widget
      // baut über die Doc-Änderung neu.
      await liveFence.locator('.pev-form-text').fill('Live-Eintrag');
      await liveFence.locator('.pev-add-btn').click();
      const rebuilt = page.locator(`${SEL.editorContent0} .perspective-events`).first();
      await expect(rebuilt.locator('.pev-text-main', { hasText: 'Live-Eintrag' })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000515 (Epic 3E-000092): Aggregation über Frontmatter (Art 2) — realer
// Pfad mit Bereichs-Fixture (Muster erinnerungen.spec.js): Quell-Dateien
// mit Ereignis-Profil-Zuordnung, query:-Fence aggregiert, Titel-Fallback,
// Inline-Änderung schreibt in die NICHT geöffnete Quelle, Zeilen-Klick
// öffnet die Quell-Datei.
function makeEventsAreaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-events-'));
  fs.writeFileSync(
    path.join(dir, 'Anna.md'),
    [
      '---',
      'class: Ereignis',
      'event-date: 1990-03-10',
      'event-category: geburtstag',
      'event-recurring: true',
      '---',
      '# Anna',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Projekt.md'),
    [
      '---',
      'class: Ereignis',
      'event-date: 2020-01-01',
      'event-text: Projektstart Alpha',
      'event-category: projekt',
      '---',
      '# Projekt',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Kontakt.md'),
    ['---', 'class: Kontakt', 'event-date: 2021-05-05', '---', ''].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Uebersicht.md'),
    ['# Übersicht', '', '```perspective-events', 'query:', '```', ''].join('\n'),
    'utf8',
  );
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

async function bindArea(page, dir) {
  await page.evaluate((p) => window.api.openAreaPath(p), dir);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

async function openFileInArea(app, page, filePath) {
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
  }, filePath);
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('EV-11: Aggregation über Frontmatter (Art 2)', () => {
  test('query:-Fence aggregiert Profil-Dateien; Inline-Änderung schreibt in die nicht geöffnete Quelle; Zeilen-Klick öffnet sie', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeEventsAreaDir();
    try {
      await bindArea(page, dir);
      await openFileInArea(app, page, path.join(dir, 'Uebersicht.md'));
      const fence = page.locator(SEL.markdownBody0).locator('.perspective-events');
      // Zwei Treffer (Kontakt.md bleibt draußen); Anna mit Titel-Fallback
      // (kursiv) und Quell-Zeile; Wiederkehr-Countdown gerechnet.
      await expect(fence.locator('tbody tr')).toHaveCount(2, { timeout: 20000 });
      await expect(fence.locator('.pev-text-fallback', { hasText: 'Anna' })).toBeVisible();
      await expect(fence.locator('.pev-source').first()).toBeVisible();
      await expect(
        fence.locator('tr', { hasText: 'Anna' }).locator('.pev-countdown'),
      ).toContainText('Wiederkehr');
      // Keine Anlage-/Duplizier-/Lösch-Affordanzen in der Aggregation.
      await expect(fence.locator('.pev-add-form')).toHaveCount(0);
      await expect(fence.locator('.pev-dup-btn')).toHaveCount(0);
      // Inline-Bearbeitung: Text setzen → Frontmatter der nicht
      // geöffneten Quelle (Datei-Inhalt auf Platte).
      const row = fence.locator('tr.pev-agg-row', { hasText: 'Anna' });
      await row.hover();
      await row.locator('.pev-edit-btn').click();
      // Im Edit-Modus trägt die Zeile Inputs statt Text — den Editor
      // direkt am Fence adressieren (genau eine offene Bearbeitung).
      const editText = fence.locator('.pev-edit-text');
      await editText.fill('Anna Geburtstag');
      await editText.press('Enter');
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'Anna.md'), 'utf8'), { timeout: 10000 })
        .toContain('event-text: Anna Geburtstag');
      // Aggregation zieht über den Index nach (Fallback-Kursivierung weg).
      await expect(
        page
          .locator(SEL.markdownBody0)
          .locator('.pev-text-main:not(.pev-text-fallback)', { hasText: 'Anna Geburtstag' }),
      ).toBeVisible({ timeout: 20000 });
      // Zeilen-Klick öffnet die Quell-Datei als Tab.
      const projRow = page
        .locator(SEL.markdownBody0)
        .locator('tr.pev-agg-row', { hasText: 'Projektstart Alpha' });
      await projRow.locator('td.pev-date').click();
      await expect(page.locator(SEL.tabs0).filter({ hasText: 'Projekt' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// 4T-000516 (Epic 3E-000092): Verknüpfungen — Art 1 (Fence-intern mit
// Kennungs-Vergabe, bidirektionaler Pflege, Bereinigung beim Löschen)
// und Art 2 (Datei-zu-Datei mit Gegenrichtungs-Schreiben).
test.describe('EV-12: Verknüpfungen im Fence (Art 1)', () => {
  test('Verknüpfen vergibt Kennungen bidirektional; Indikator und Sprung; Löschen bereinigt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('events:confirmDelete');
        ipcMain.handle('events:confirmDelete', () => true);
      });
      const { fence, editor } = await openSplit(page);
      const row0 = fence.locator('tr[data-ev-row="0"]');
      await row0.hover();
      await row0.locator('.pev-link-btn').click();
      const popup = page.locator('.pev-link-popup');
      await expect(popup).toBeVisible();
      // Anna als Nachfolger von Projektstart verknüpfen.
      const annaItem = popup.locator('.pev-link-item', { hasText: 'Geburtstag Anna' });
      await annaItem.locator('.pev-link-kind', { hasText: 'Nachfolger' }).click();
      // Kennungen und beide Listen stehen im Quelltext.
      await expect(editor).toContainText(/\| e1 \|/);
      await expect(editor).toContainText(/\| e2 \|/);
      await popup.locator('.pev-link-search').press('Escape');
      await expect(page.locator('.pev-link-popup')).toHaveCount(0);
      // Indikator ⛓1 an beiden Zeilen; Aufklappen und Springen.
      const freshFence = page
        .locator(SEL.markdownBody0)
        .locator('.perspective-events[data-ev-index="0"]');
      await expect(freshFence.locator('.pev-link-ind')).toHaveCount(2);
      await freshFence.locator('tr[data-ev-row="1"] .pev-link-ind').click();
      await expect(page.locator('.pev-link-popup')).toBeVisible();
      await page.locator('.pev-link-popup .pev-link-jump', { hasText: 'Projektstart' }).click();
      await expect(page.locator('.pev-link-popup')).toHaveCount(0);
      // Löschen des verknüpften Eintrags bereinigt die Gegenseite.
      const annaRow = freshFence.locator('tr[data-ev-row="1"]');
      await annaRow.hover();
      await annaRow.locator('.pev-del-btn').click();
      await expect(editor).not.toContainText('e2');
      await expect(page.locator(SEL.markdownBody0).locator('.pev-link-ind')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EV-13: Verknüpfungen der Aggregation (Art 2)', () => {
  test('Datei-zu-Datei-Verknüpfung pflegt beide Frontmatter-Seiten (auch nicht geöffnet)', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeEventsAreaDir();
    try {
      await bindArea(page, dir);
      await openFileInArea(app, page, path.join(dir, 'Uebersicht.md'));
      const fence = page.locator(SEL.markdownBody0).locator('.perspective-events');
      await expect(fence.locator('tbody tr')).toHaveCount(2, { timeout: 20000 });
      const annaRow = fence.locator('tr.pev-agg-row', { hasText: 'Anna' });
      await annaRow.hover();
      await annaRow.locator('.pev-link-btn').click();
      const popup = page.locator('.pev-link-popup');
      await expect(popup).toBeVisible();
      const projItem = popup.locator('.pev-link-item', { hasText: 'Projektstart Alpha' });
      await projItem.locator('.pev-link-kind', { hasText: 'Nachfolger' }).click();
      // Beide Frontmatter-Seiten sind geschrieben (Gegenrichtung inklusive).
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'Anna.md'), 'utf8'), { timeout: 10000 })
        .toMatch(/event-successors:[\s\S]{0,40}Projekt/);
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'Projekt.md'), 'utf8'), { timeout: 10000 })
        .toMatch(/event-predecessors:[\s\S]{0,40}Anna/);
      // Indikator erscheint nach dem Index-Nachzug an beiden Zeilen.
      await expect(page.locator(SEL.markdownBody0).locator('.pev-link-ind')).toHaveCount(2, {
        timeout: 20000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// 4T-000653: Eine frisch geoeffnete Zeilen-Bearbeitung darf den nachlaufenden
// Vorschau-Aufbau ueberleben.
//
// Befund: In der geteilten Ansicht plant JEDE Dokument-Aenderung einen
// verzoegerten Vorschau-Aufbau (editor.js schedulePreviewUpdate, 150 ms bei
// kleinen Dokumenten). Das Bestaetigen einer Zeile schreibt in den Fence,
// aendert also das Dokument. Wer danach binnen dieser Frist die naechste
// Bearbeitung oeffnet, verliert sie: renderPreviewForPane ersetzt das
// innerHTML des Render-Panes vollstaendig, samt Eingabefeldern.
//
// Das war die Ursache der Instabilitaet von EV-03 unter Last — dort entschied
// die Maschinen-Geschwindigkeit, ob der Aufbau vor oder nach dem Tastendruck
// eintraf. Hier wird derselbe Ablauf mit einer Wartezeit ueber dem Debounce
// deterministisch geprueft, statt sich auf das Wettrennen zu verlassen.
test.describe('EV-14: Offene Zeilen-Bearbeitung überlebt den Vorschau-Aufbau', () => {
  test('Bestätigen und sofortiges Wieder-Öffnen bleibt stabil', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const { fence, editor } = await openSplit(page);
      const row = fence.locator('tr[data-ev-row="0"]');
      await row.hover();
      await row.locator('.pev-edit-btn').click();
      await row.locator('.pev-edit-text').fill('Projektstart Beta');
      await row.locator('.pev-edit-text').press('Enter');
      // Nachweis, dass die Bestaetigung wirklich ins Dokument schrieb; ohne
      // Dokument-Aenderung gaebe es keinen nachlaufenden Aufbau und der Test
      // pruefte nichts.
      await expect(editor).toContainText('Projektstart Beta');

      // Ohne Pause die naechste Bearbeitung oeffnen — genau die Lage, in der
      // der nachlaufende Vorschau-Aufbau das Feld wegzog.
      const freshRow = fence.locator('tr[data-ev-row="0"]');
      await freshRow.hover();
      await freshRow.locator('.pev-edit-btn').click();
      await freshRow.locator('.pev-edit-text').fill('Verworfen');
      await page.waitForTimeout(700);

      // Bearbeitung steht noch, mit unveraendertem Eingabewert.
      await expect(fence.locator('tr[data-ev-row="0"]')).toHaveClass(/pev-editing/);
      await expect(fence.locator('tr[data-ev-row="0"] .pev-edit-text')).toHaveValue('Verworfen');
      // Und der Abbruch-Weg funktioniert danach unveraendert.
      await fence.locator('tr[data-ev-row="0"] .pev-edit-text').press('Escape');
      await expect(editor).not.toContainText('Verworfen');
      await expect(editor).toContainText('Projektstart Beta');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
