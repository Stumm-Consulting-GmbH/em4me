// 4T-002738 (Epic 3E-000396): E2E-Suite «Offene Aufgaben ins Journal
// übertragen» — die Wege zum Anlegen des Eintrags der laufenden Periode. Der
// selbsttätige Übertrag hängt im gemeinsamen Öffnen-/Anlage-Pfad
// (`openJournalEntry`) und muss deshalb auf jedem Weg greifen, der dort
// hindurchläuft; die erste Datei (journal-übertrag.spec.js) belegt ihn für das
// Kommando «Heutiger Journal-Eintrag».
//
// JW-01: Kommando «Journal-Eintrag für Datum…» mit dem heutigen Datum.
// JW-02: Klick auf den heutigen Tag im Kalender-Panel.
// JW-03: Klick auf die laufende Kalenderwoche im Kalender-Panel (Wochen-Journal,
//        Quelle ist der Eintrag der Vorwoche).
// JW-04: Pfeil «nächster» im Navigations-Block des Eintrags von gestern.
// JW-05: Verweis des Navigations-Blocks auf die laufende Woche (Wochen-Journal im
//        selben Regal mit eingeschaltetem Schalter).
// JW-06: Klick auf den heutigen Tag im Zeitleisten-Block eines Wochen-Eintrags.
// JW-07: Datum einer Karte der Kanban-Tafel mit «Datum zur Tagesnotiz».
// JW-08: Gegenprobe im Kalender-Panel: Der Eintrag für gestern entsteht ohne
//        Übertrag, vorgestern bleibt unverändert.
//
// Jeder Fall prüft am Ende den Inhalt beider Dateien auf der Platte. Die Einträge
// entstehen relativ zum tatsächlichen heutigen Datum (Muster journale.spec.js);
// Wochen-Schlüssel und -Pfade kommen aus demselben Perioden-Kern wie im Programm.
// Aufgaben-Texte ASCII-sicher, damit Text-Vergleiche vom Konsolen-Encoding
// unabhängig bleiben.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { pressUntilVisible } = require('../helpers/eingabe');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { periodOf, resolveEntryPath } = require('../../../src/shared/journal-core.js');

const ZEIT = { timeout: 15000 };
const HINWEIS = '#statusbar-hint';
const UEBERTRAGEN = '»'; // Zeichen des Status «Übertragen» (»)
const CAL = '.pane-group[data-pane="0"] .sidebar-calendar';
const NAV = `${SEL.markdownBody0} .perspective-journal-nav`;
const ZEITLEISTE = `${SEL.markdownBody0} .perspective-journal-timeline`;
const TAFEL = '.pane-group[data-pane="0"] .pane-kanban .kanban-tafel';
const WOCHEN_NAME = '{{date::kkkk-KWww}}';

// Lokales Datum als yyyy-MM-dd, verschoben um `tage` (konsistent zum
// Perioden-Kern, der in Ortszeit rechnet).
function iso(tage = 0) {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Bereichsrelativer Pfad des Wochen-Eintrags, `wochen` Wochen von heute aus.
function wochenPfad(ordner, wochen = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 7 * wochen);
  const periode = periodOf(d.getTime(), 'week');
  return resolveEntryPath({ folderPattern: ordner, namePattern: WOCHEN_NAME }, periode).relPath;
}

function journal(id, name, granularity, ordner, zusatz = {}) {
  return {
    id,
    name,
    shelf: 'Tagebuch',
    granularity,
    folderPattern: ordner,
    namePattern: granularity === 'week' ? WOCHEN_NAME : '{{date}}',
    ...zusatz,
  };
}

const AN = { carryOverAuto: true };

// Bereich mit journals-Sektion und vorab geschriebenen Einträgen
// (bereichsrelativer Pfad -> Inhalt).
function makeArea(journals, dateien = {}) {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-jw-area-'));
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify(
      { schemaVersion: 1, settings: { journals: { shelves: ['Tagebuch'], journals } } },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  for (const [rel, inhalt] of Object.entries(dateien)) {
    const abs = path.join(areaRoot, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, inhalt, 'utf8');
  }
  return areaRoot;
}

// Profil: Deutsch, Kürzel für das Datums-Kommando. `ansicht` setzt den
// Standard-Ansichtsmodus; ohne ihn öffnen Dokumente gerendert, und nur dort
// stehen Navigations- und Zeitleisten-Block mit ihren Schaltflächen.
function einstellungen(ansicht = 'source') {
  return {
    language: 'de',
    ...(ansicht ? { app: { defaultViewMode: ansicht } } : {}),
    hotkeys: { 'journal.openForDate': 'Ctrl+Alt+6' },
  };
}

function removeDir(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

const datei = (areaRoot, rel) => path.join(areaRoot, ...rel.split('/'));
const lies = (abs) => (fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
const zeilen = (abs) => (lies(abs) || '').split(/\r?\n/);

async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// Eintrag der vorigen Periode: zwei offene Aufgaben, eine erledigte. `kopf`
// stellt etwa einen Navigations-Block davor.
function quelle(kopf = '') {
  return [
    kopf,
    '## Aufgaben',
    '',
    '- [ ] Angebot nachfassen',
    '- [ ] Rechnung pruefen',
    '- [x] Erledigt vorher',
    '',
  ].join('\n');
}

const NAV_BLOCK = '```perspective-journal-nav\n```\n';

// Die gemeinsame Messung: Der neue Eintrag trägt beide offenen Aufgaben unter
// «Aufgaben», der alte trägt sie mit dem Zeichen des Status, die erledigte
// bleibt; die Statusleiste meldet den Übertrag.
async function pruefeUebertrag(page, areaRoot, quelleRel, zielRel) {
  const ziel = datei(areaRoot, zielRel);
  await expect.poll(() => fs.existsSync(ziel), ZEIT).toBe(true);
  await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2', ZEIT);
  const neu = zeilen(ziel);
  const ab = neu.indexOf('## Aufgaben');
  expect(ab, `Inhalt des neuen Eintrags:\n${neu.join('\n')}`).toBeGreaterThanOrEqual(0);
  expect(neu.indexOf('- [ ] Angebot nachfassen')).toBeGreaterThan(ab);
  expect(neu.indexOf('- [ ] Rechnung pruefen')).toBeGreaterThan(
    neu.indexOf('- [ ] Angebot nachfassen'),
  );
  expect(lies(ziel)).not.toContain('Erledigt vorher');
  const alt = zeilen(datei(areaRoot, quelleRel));
  expect(alt, `Inhalt des alten Eintrags:\n${alt.join('\n')}`).toContain(
    `- [${UEBERTRAGEN}] Angebot nachfassen`,
  );
  expect(alt).toContain(`- [${UEBERTRAGEN}] Rechnung pruefen`);
  expect(alt).toContain('- [x] Erledigt vorher');
}

// Kalender-Panel im Fenster öffnen. Es erscheint erst in einem nicht leeren
// Fenster; `start` ist das gewöhnliche Dokument, das dafür geöffnet wird.
async function kalenderPanel(app, page, start) {
  fs.writeFileSync(start, '# Start\n\nText.\n', 'utf8');
  await oeffneDokumentImFenster(app, page, start);
  const cal = page.locator(CAL);
  await expect
    .poll(async () => {
      if (!(await cal.isVisible())) await page.locator('#btn-calendar').click();
      return cal.isVisible();
    }, ZEIT)
    .toBe(true);
  await expect(cal.locator('.calendar-month-label')).not.toHaveText('');
  return cal;
}

// Menü-Kanal mit Argumenten an das erste Fenster senden (Muster
// kanban-notizen.spec.js, sendeMenuKanal).
async function sendeMenuKanal(app, kanal, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, nutzlast) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(nutzlast.kanal, ...nutzlast.args);
    },
    { kanal, args },
  );
}

// --- JW-01 ---------------------------------------------------------------------------

test.describe('JW-01: Kommando «Journal-Eintrag für Datum…» mit heute (4T-002738)', () => {
  test('der Eintrag für heute entsteht mit den offenen Aufgaben von gestern', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([journal('tag', 'Tag', 'day', 'Journal', AN)], {
      [gestern]: quelle(),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      const modal = page.locator('#name-input-modal');
      await pressUntilVisible(page, 'Control+Alt+6', modal);
      await page.locator('#name-input-field').fill(iso(0));
      await page.locator('#btn-name-input-ok').click();
      await expect(modal).toBeHidden();
      await pruefeUebertrag(page, areaRoot, gestern, heute);
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(0), ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-02 ---------------------------------------------------------------------------

test.describe('JW-02: Klick auf heute im Kalender-Panel (4T-002738)', () => {
  test('der Eintrag für heute entsteht mit den offenen Aufgaben von gestern', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([journal('tag', 'Tag', 'day', 'Journal', AN)], {
      [gestern]: quelle(),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      const cal = await kalenderPanel(app, page, path.join(areaRoot, 'Start.md'));
      await cal.locator(`.calendar-day-btn.today[title="${iso(0)}"]`).click();
      await pruefeUebertrag(page, areaRoot, gestern, heute);
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(0), ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-03 ---------------------------------------------------------------------------

test.describe('JW-03: Klick auf die laufende Kalenderwoche im Kalender-Panel (4T-002738)', () => {
  test('der Wochen-Eintrag entsteht mit den offenen Aufgaben der Vorwoche', async () => {
    const vorwoche = wochenPfad('Woche', -1);
    const laufend = wochenPfad('Woche', 0);
    const areaRoot = makeArea([journal('woche', 'Woche', 'week', 'Woche', AN)], {
      [vorwoche]: quelle(),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      const cal = await kalenderPanel(app, page, path.join(areaRoot, 'Start.md'));
      const woche = periodOf(Date.now(), 'week');
      await cal.locator(`.calendar-week-btn[title="${woche.key}"]`).click();
      await pruefeUebertrag(page, areaRoot, vorwoche, laufend);
      await expect(page.locator(SEL.activeTab0)).toContainText(path.basename(laufend, '.md'), ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-04 ---------------------------------------------------------------------------

test.describe('JW-04: Pfeil «nächster» im Navigations-Block von gestern (4T-002738)', () => {
  test('der Reiter wechselt auf den neuen Eintrag, beide Dateien tragen den Übertrag', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([journal('tag', 'Tag', 'day', 'Journal', AN)], {
      [gestern]: quelle(NAV_BLOCK),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen(null) });
    try {
      await bindArea(page, areaRoot);
      await oeffneDokumentImFenster(app, page, datei(areaRoot, gestern));
      const nav = page.locator(NAV);
      await expect(nav.locator('.journal-nav-arrow')).toHaveCount(2, ZEIT);
      // Der Eintrag von gestern ist offen und gespeichert.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      await nav.locator('.journal-nav-arrow').last().click();
      await pruefeUebertrag(page, areaRoot, gestern, heute);
      // Der Reiter von gestern ist im selben Reiter durch den neuen ersetzt.
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(0), ZEIT);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-05 ---------------------------------------------------------------------------

test.describe('JW-05: Verweis des Navigations-Blocks auf die laufende Woche (4T-002738)', () => {
  test('der Wochen-Eintrag entsteht mit den offenen Aufgaben der Vorwoche', async () => {
    const heute = `Journal/${iso(0)}.md`;
    const vorwoche = wochenPfad('Woche', -1);
    const laufend = wochenPfad('Woche', 0);
    // Das Tages-Journal hat den Schalter aus; maßgeblich ist der des Wochen-Journals.
    const areaRoot = makeArea(
      [journal('tag', 'Tag', 'day', 'Journal'), journal('woche', 'Woche', 'week', 'Woche', AN)],
      { [heute]: `# Heute\n\n${NAV_BLOCK}`, [vorwoche]: quelle() },
    );
    const { app, page, userData } = await launchApp({ settings: einstellungen(null) });
    try {
      await bindArea(page, areaRoot);
      await oeffneDokumentImFenster(app, page, datei(areaRoot, heute));
      const woche = periodOf(Date.now(), 'week');
      const verweis = page.locator(
        `${NAV} .journal-nav-parents .journal-nav-link[title="${woche.key}"]`,
      );
      await expect(verweis).toHaveCount(1, ZEIT);
      await verweis.click();
      await pruefeUebertrag(page, areaRoot, vorwoche, laufend);
      await expect(page.locator(SEL.activeTab0)).toContainText(path.basename(laufend, '.md'), ZEIT);
      expect(lies(datei(areaRoot, heute))).not.toContain('Angebot nachfassen');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-06 ---------------------------------------------------------------------------

test.describe('JW-06: Klick auf heute im Zeitleisten-Block (4T-002738)', () => {
  test('der Eintrag für heute entsteht mit den offenen Aufgaben von gestern', async () => {
    // Träger des Blocks ist der Wochen-Eintrag der laufenden Woche: Sein
    // Wochen-Gitter enthält heute an jedem Wochentag.
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const traeger = wochenPfad('Woche', 0);
    const areaRoot = makeArea(
      [journal('tag', 'Tag', 'day', 'Journal', AN), journal('woche', 'Woche', 'week', 'Woche')],
      {
        [gestern]: quelle(),
        [traeger]: '# Woche\n\n```perspective-journal-timeline\nmode: week\n```\n',
      },
    );
    const { app, page, userData } = await launchApp({ settings: einstellungen(null) });
    try {
      await bindArea(page, areaRoot);
      await oeffneDokumentImFenster(app, page, datei(areaRoot, traeger));
      const zelle = page.locator(`${ZEITLEISTE} [data-jt-level="day"][data-jt-key="${iso(0)}"]`);
      await expect(zelle).toBeVisible(ZEIT);
      await zelle.click();
      await pruefeUebertrag(page, areaRoot, gestern, heute);
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(0), ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-07 ---------------------------------------------------------------------------

// Kanban-Tafel mit einer Karte, deren Datum heute ist, und der Einstellung
// «Datum zur Tagesnotiz» (Muster KB-22 in kanban-notizen.spec.js).
function tafelText() {
  const block = JSON.stringify({
    'kanban-plugin': 'board',
    'list-collapse': [false, false],
    'link-date-to-daily-note': true,
  });
  return [
    '---',
    'kanban-plugin: board',
    '---',
    '',
    '## Offen',
    '',
    `- [ ] Termin-Karte 📅 ${iso(0)}`,
    '',
    '',
    '## Fertig',
    '',
    '**Fertiggestellt**',
    '',
    '',
    '',
    '',
    '%% kanban:settings',
    '```',
    block,
    '```',
    '%%',
  ].join('\n');
}

test.describe('JW-07: Datum einer Karte der Kanban-Tafel mit heute (4T-002738)', () => {
  test('der Eintrag für heute entsteht mit den offenen Aufgaben von gestern', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([journal('tag', 'Tag', 'day', 'Journal', AN)], {
      [gestern]: quelle(),
      'Tafel.md': tafelText(),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await sendeMenuKanal(app, 'file:openExternal', [datei(areaRoot, 'Tafel.md')]);
      await expect(page.locator(SEL.activeTab0)).toContainText('Tafel', ZEIT);
      await expect
        .poll(
          async () => {
            if (await page.locator(TAFEL).isVisible()) return true;
            await sendeMenuKanal(app, 'menu:viewChange', 'kanban');
            return page.locator(TAFEL).isVisible();
          },
          { timeout: 30000 },
        )
        .toBe(true);
      const abzeichen = page.locator(`${TAFEL} .kanban-karte .task-marker-due`).first();
      await expect(abzeichen).toHaveClass(/kanban-datum-verweis/, ZEIT);
      await abzeichen.click();
      await pruefeUebertrag(page, areaRoot, gestern, heute);
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(0), ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JW-08 ---------------------------------------------------------------------------

test.describe('JW-08: Gegenprobe, Klick auf gestern im Kalender-Panel (4T-002738)', () => {
  test('der Eintrag für gestern entsteht ohne Übertrag, vorgestern bleibt unverändert', async () => {
    const vorgestern = `Journal/${iso(-2)}.md`;
    const gestern = `Journal/${iso(-1)}.md`;
    const areaRoot = makeArea([journal('tag', 'Tag', 'day', 'Journal', AN)], {
      [vorgestern]: quelle(),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      const cal = await kalenderPanel(app, page, path.join(areaRoot, 'Start.md'));
      // Am Monatsersten liegt gestern im Vormonat.
      if (iso(-1).slice(0, 7) !== iso(0).slice(0, 7)) await cal.locator('.calendar-prev').click();
      await cal
        .locator(`.calendar-day-btn[title="${iso(-1)}"]:not(.other-month)`)
        .first()
        .click();
      await expect.poll(() => fs.existsSync(datei(areaRoot, gestern)), ZEIT).toBe(true);
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(-1), ZEIT);
      expect(lies(datei(areaRoot, gestern))).not.toContain('Angebot nachfassen');
      expect(lies(datei(areaRoot, vorgestern))).toBe(quelle());
      expect(fs.existsSync(datei(areaRoot, `Journal/${iso(0)}.md`))).toBe(false);
      await expect(page.locator(HINWEIS)).not.toContainText('Offene Aufgaben übertragen');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});
