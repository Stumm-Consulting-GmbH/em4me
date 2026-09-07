// 4T-000952 (Epic 3E-000198): Die Index-Verbraucher lesen den GESCHRIEBENEN
// Stand — Befunde E-04 (Rückverweise), E-05 (Graphenansicht) und E-08
// (Vervollständigung von Ankern und Tags) der Erhebung 4T-000936.
//
// Die Erhebung hält ihre Fälle in `4t-0936-ungespeicherter-stand.spec.js` und
// vermerkt dort, dass die nach dem Hauptrelease 1 verorteten Befunde ihre Fälle
// bekommen, wo sie behoben werden. Das ist hier.
//
// Zwei Konstruktions-Regeln aus jener Datei gelten unverändert weiter:
//
// Jeder Fall trägt seinen ANKER — vor der Messung wird belegt, dass der
// Ausgangs-Stand sichtbar ist. Ohne ihn wäre ein «nicht wirksam» kein Befund,
// sondern ein Nicht-Ergebnis.
//
// Und gemessen wird am Weg des ANWENDERS, nicht an der Schicht darunter: Die
// Fälle blenden das Panel ein und lesen seine Anzeige, statt die IPC-Funktion
// aufzurufen. Die Lehre steht bei E-03 der Erhebung — eine Fassung, die
// window.api unmittelbar rief, war grün, während das Panel im Test des Product
// Owners leer blieb, weil niemand es neu zeichnen ließ. Genau diese Strecke
// (Meldung der Overlay-Schicht -> Auffrischung des Verbrauchers) ist bei allen
// drei Befunden die zweite Hälfte des Fixes.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BACKLINKS = '.pane-group[data-pane="0"] .backlinks-results';
const GRAPH_NOTE = '.pane-group[data-pane="0"] .sidebar-filegraph .filegraph-note';
const TOOLTIP = '.cm-tooltip-autocomplete';
const LABEL = '.cm-tooltip-autocomplete .cm-completionLabel';

function makeDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Quelltext-Modus mit Schreibrecht in Spalte 0.
//
// Sie wird vor JEDEM Schreiben aufgerufen und nicht einmal zu Beginn: Der
// Ansichts-Modus haengt am REITER, nicht an der Spalte, und diese Faelle
// wechseln zwischen zwei Reitern hin und her. Ein einmaliges Umschalten zu
// Beginn liess den Editor nach dem ersten Wechsel unsichtbar zurueck.
//
// Der Bearbeiten-Schalter ist ein Umschalter — geklickt wird deshalb nur,
// wenn die Editor-Huelle wirklich noch im Lese-Zustand steht (4T-000577:
// das contenteditable-Attribut taugt dafuer nicht, die Klasse read-only
// schon).
async function bearbeitenAn(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('source')).click();
  const huelle = page.locator(SEL.paneSourceEditor0);
  await expect(huelle).toBeVisible();
  if (await huelle.evaluate((el) => el.classList.contains('read-only'))) {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(huelle).not.toHaveClass(/read-only/);
}

async function reiterWaehlen(page, name) {
  await page.locator(SEL.tabs0, { hasText: name }).first().click();
  await expect(page.locator(SEL.activeTab0)).toHaveText(new RegExp(name));
}

// Ans Dokument-Ende schreiben, ohne zu speichern; der schmutzige Reiter ist der
// Beleg, dass wirklich nichts auf der Platte steht.
async function tippenOhneSpeichern(page, text) {
  await bearbeitenAn(page);
  await page.locator(SEL.editorContent0).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
}

// Warten, bis die Vorschlags-Liste den erwarteten Eintrag führt, und sie dann
// zurückgeben. Nachgetriggert wird dabei.
//
// Nachgetriggert wird aus zwei Gründen, die beide gemessen sind. Der erste
// Trigger einer Sitzung stößt den Index-Aufbau erst an und liefert noch
// 'indexing' (B-18, 4T-000187) — das Muster steht so in
// funktionen/schlagwort-vorschlaege.spec.js. Und ein mit Escape geschlossener
// Vorschlags-Kasten öffnet an derselben Stelle nicht von selbst wieder; nach
// einem Reiter-Wechsel und erneuter Eingabe braucht es die kurze Rücknahme
// des letzten Zeichens, damit die Vervollständigung neu greift.
//
// `letztesZeichen` ist das letzte Zeichen der bereits getippten Eingabe: Es
// wird zurückgenommen und sofort wieder gesetzt, die Eingabe bleibt also
// unverändert.
//
// **Gewartet wird auf den ERWARTETEN Eintrag, nicht auf irgendeinen.** Die
// erste Fassung brach ab, sobald die Liste überhaupt etwas zeigte — und
// zeigte damit gelegentlich noch den Stand von vorher. Isoliert war sie grün,
// im Verbund mit den übrigen Specs rot: Der geschriebene Stand erreicht den
// Hauptprozess verzögert, und unter Last liegt der erste Treffer eben davor.
// Die unausgesprochene Annahme war «wenn Vorschläge da sind, sind es die
// neuen» (Fehlerklasse L10). Die Warte-Bedingung liefert jetzt den Zustand
// und nicht die Zeit, wie es test/README.md verlangt.
async function vorschlaegeMit(page, letztesZeichen, erwartet) {
  const labels = page.locator(LABEL);
  let gesehen = [];
  await expect
    .poll(
      async () => {
        if ((await page.locator(TOOLTIP).count()) > 0) {
          gesehen = await labels.allTextContents();
          if (gesehen.includes(erwartet)) return true;
        }
        await page.keyboard.press('Backspace');
        await page.keyboard.type(letztesZeichen);
        return false;
      },
      { timeout: 30000, intervals: [500] },
    )
    .toBe(true);
  return gesehen.join(' ');
}

test.describe('UV: Index-Verbraucher auf geschriebenem Stand (4T-000952)', () => {
  // Befund E-04, AK1. Der Verweis entsteht in der einen Datei und muss beim
  // Ziel erscheinen — deshalb wird nach dem Tippen auf den Ziel-Reiter
  // gewechselt und dort gemessen.
  //
  // Der Anker haengt an einer DRITTEN Datei, die nur auf der Platte liegt und
  // schon einen Verweis auf das Ziel traegt. Ein leeres Panel taugt dafuer
  // nicht: Es ist von einem Panel, das gar nicht arbeitet, nicht zu
  // unterscheiden — und ein leeres div ist ohnehin nicht «sichtbar». Sie
  // belegt zugleich, dass der Puffer den Platten-Stand ERGAENZT, wo er ihn
  // nicht ersetzt: Der Bestands-Verweis bleibt am Ende stehen.
  test('E-04 Rückverweise zeigen einen frisch getippten Verweis', async () => {
    const dir = makeDir('scg-md-uv04-');
    const ziel = path.join(dir, 'Ziel.md');
    const quelle = path.join(dir, 'Quelle.md');
    fs.writeFileSync(ziel, '# Ziel\n\nInhalt.\n', 'utf8');
    fs.writeFileSync(quelle, '# Quelle\n\nNoch ohne Verweis.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'Bestand.md'), '# Bestand\n\nSiehe [[Ziel]].\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [ziel, quelle] });
    try {
      await bearbeitenAn(page);
      await page.locator('#btn-backlinks').click();

      // Anker: Das Panel arbeitet und zeigt den gespeicherten Verweis aus der
      // dritten Datei. Der Bereichs-Index braucht dafür seinen Anlauf.
      await reiterWaehlen(page, 'Ziel');
      await expect(page.locator(BACKLINKS)).toContainText('Bestand', { timeout: 20000 });
      await expect(page.locator(BACKLINKS)).not.toContainText('Quelle');

      // In der Quelle den Verweis setzen, NICHT speichern.
      await reiterWaehlen(page, 'Quelle');
      await tippenOhneSpeichern(page, '\n\nSiehe [[Ziel]].\n');

      // Zurück zum Ziel: Der frische Verweis steht in den Rückverweisen, der
      // gespeicherte weiterhin daneben.
      await reiterWaehlen(page, 'Ziel');
      await expect(page.locator(BACKLINKS)).toContainText('Quelle', { timeout: 20000 });
      await expect(page.locator(BACKLINKS)).toContainText('Bestand');

      // Zweiter Anker: Auf der Platte steht der Verweis nicht.
      expect(fs.readFileSync(quelle, 'utf8')).not.toContain('[[Ziel]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Gegenprobe zu E-04: Was im Puffer entfernt wird, verschwindet auch aus den
  // Rückverweisen. Ohne sie bliebe offen, ob der Puffer den Platten-Stand
  // wirklich ERSETZT oder nur ergänzt.
  test('E-04 Rückverweise verlieren einen im Puffer entfernten Verweis', async () => {
    const dir = makeDir('scg-md-uv04b-');
    const ziel = path.join(dir, 'Ziel.md');
    const quelle = path.join(dir, 'Quelle.md');
    fs.writeFileSync(ziel, '# Ziel\n\nInhalt.\n', 'utf8');
    fs.writeFileSync(quelle, '# Quelle\n\nSiehe [[Ziel]].\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [ziel, quelle] });
    try {
      await bearbeitenAn(page);
      await page.locator('#btn-backlinks').click();

      // Anker: Der gespeicherte Verweis steht im Panel.
      await reiterWaehlen(page, 'Ziel');
      await expect(page.locator(BACKLINKS)).toContainText('Quelle', { timeout: 20000 });

      // In der Quelle alles ersetzen, NICHT speichern.
      await reiterWaehlen(page, 'Quelle');
      await bearbeitenAn(page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('# Quelle\n\nOhne Verweis.');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await expect(editor).not.toContainText('[[Ziel]]');

      await reiterWaehlen(page, 'Ziel');
      await expect(page.locator(BACKLINKS)).not.toContainText('Quelle', { timeout: 20000 });

      // Die Platte trägt den Verweis weiterhin.
      expect(fs.readFileSync(quelle, 'utf8')).toContain('[[Ziel]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Befund E-05, AK2. Gemessen wird am Datei-Graph-Panel, und zwar an seinem
  // Einzelknoten-Hinweis: Er steht genau dann, wenn die aktive Datei im
  // Umfeld-Graphen allein bleibt. Damit hängt die Messung an der KANTE — dem,
  // was der Befund betrifft — und nicht an einer Zeichenfläche, die sich
  // schlecht auslesen lässt.
  test('E-05 Graphenansicht zeigt eine frisch getippte Verbindung', async () => {
    const dir = makeDir('scg-md-uv05-');
    const solo = path.join(dir, 'Solo.md');
    const quelle = path.join(dir, 'Quelle.md');
    fs.writeFileSync(solo, '# Solo\n\nOhne Verbindungen.\n', 'utf8');
    fs.writeFileSync(quelle, '# Quelle\n\nNoch ohne Verweis.\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [solo, quelle] });
    try {
      await bearbeitenAn(page);
      await page.locator('#btn-filegraph').click();

      // Anker: Solo steht im Graphen allein, der Hinweis ist sichtbar.
      await reiterWaehlen(page, 'Solo');
      await expect(page.locator(GRAPH_NOTE)).toBeVisible({ timeout: 20000 });

      // In der Quelle einen Verweis auf Solo setzen, NICHT speichern.
      await reiterWaehlen(page, 'Quelle');
      await tippenOhneSpeichern(page, '\n\nZu [[Solo]].\n');

      // Zurück zu Solo: Die Verbindung ist da, der Einzelknoten-Hinweis weg.
      await reiterWaehlen(page, 'Solo');
      await expect(page.locator(GRAPH_NOTE)).toBeHidden({ timeout: 20000 });
      expect(fs.readFileSync(quelle, 'utf8')).not.toContain('[[Solo]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Befund E-08, AK3, erste Hälfte: eine soeben getippte Überschrift steht als
  // Anker-Vorschlag bereit. Getippt wird in der EINEN Datei, vorgeschlagen wird
  // in der anderen — der Vorschlag kommt also nicht aus dem eigenen Puffer,
  // sondern aus der Overlay-Schicht des Hauptprozesses.
  test('E-08 Anker-Vervollständigung kennt eine frisch getippte Überschrift', async () => {
    const dir = makeDir('scg-md-uv08a-');
    const start = path.join(dir, 'Start.md');
    const notiz = path.join(dir, 'Notiz.md');
    fs.writeFileSync(start, '# Start\n\nText.\n', 'utf8');
    fs.writeFileSync(notiz, '# Notiz\n\n## Alter Abschnitt\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [start, notiz] });
    try {
      await bearbeitenAn(page);

      // Anker: Der gespeicherte Abschnitt wird vorgeschlagen. Die Liste führt
      // die Anker in ihrer Slug-Form («Alter Abschnitt» -> «alter-abschnitt»),
      // weil genau diese Form hinter dem «#» im Wiki-Link steht. Der erste
      // Trigger stößt zugleich den Index-Aufbau an (B-18, 4T-000187), deshalb
      // der Poll mit Nachtriggern.
      await reiterWaehlen(page, 'Start');
      await tippenOhneSpeichern(page, '\n\n[[Notiz#');
      await vorschlaegeMit(page, '#', 'alter-abschnitt');
      await page.keyboard.press('Escape');

      // In der Notiz die Überschrift ersetzen, NICHT speichern.
      await reiterWaehlen(page, 'Notiz');
      await bearbeitenAn(page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('# Notiz\n\n## Frisch Getippt');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Zurück in Start erneut auslösen: Die neue Überschrift steht zur Wahl,
      // die ersetzte nicht mehr.
      await reiterWaehlen(page, 'Start');
      await bearbeitenAn(page);
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('[[Notiz#');
      const anker = await vorschlaegeMit(page, '#', 'frisch-getippt');
      expect(anker).not.toContain('alter-abschnitt');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Befund E-08, zweite Hälfte: dasselbe für die Schlagwort-Vervollständigung.
  // Das Tag-PANEL sah den geschriebenen Stand seit 4T-000950, der Vorschlag
  // beim Tippen nicht — beide lesen jetzt dieselbe Quelle.
  test('E-08 Schlagwort-Vervollständigung kennt ein frisch getipptes Schlagwort', async () => {
    const dir = makeDir('scg-md-uv08b-');
    const start = path.join(dir, 'Start.md');
    const notiz = path.join(dir, 'Notiz.md');
    fs.writeFileSync(start, '# Start\n\nText.\n', 'utf8');
    fs.writeFileSync(notiz, '# Notiz\n\n#bestandstag\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [start, notiz] });
    try {
      await bearbeitenAn(page);

      // Anker: Das gespeicherte Schlagwort wird vorgeschlagen (mit Nachtriggern
      // gegen den noch laufenden Index-Aufbau).
      await reiterWaehlen(page, 'Start');
      await tippenOhneSpeichern(page, '\n\n#bestand');
      await vorschlaegeMit(page, 'd', 'bestandstag');
      await page.keyboard.press('Escape');

      // In der Notiz ein anderes Schlagwort setzen, NICHT speichern.
      await reiterWaehlen(page, 'Notiz');
      await tippenOhneSpeichern(page, '\n#frischertag\n');

      // Zurück in Start: Das frische Schlagwort steht zur Wahl.
      await reiterWaehlen(page, 'Start');
      await bearbeitenAn(page);
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n#frisch');
      await vorschlaegeMit(page, 'h', 'frischertag');
      expect(fs.readFileSync(notiz, 'utf8')).not.toContain('frischertag');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
