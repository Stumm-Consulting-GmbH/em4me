// 4T-001908 (Epic 3E-000318): Ablauf-Fälle der Angaben auf der Karte — Termin
// setzen und entfernen, fremder Termin des Vorbild-Werkzeugs, Tags am
// Kartenfuß, Obergrenze einer Spalte, Archivieren einer Karte, der Filter über
// Strg+F und die relative Lesart der Termine (AK1, AK2 des Tasks). Die
// Kennungen setzen die der ersten Stufe fort (KB-01 bis KB-07 in
// kanban-tafel.spec.js und kanban-ziehen.spec.js).
//
// **Warum diese Fälle gegen die echte Anwendung laufen.** Die Angaben der
// Stufe laufen über mehrere Module hinweg — Format-Kern, Zeichnung der Karte,
// Kalender-Wähler, Kontextmenü, Filter-Feld, Anzeige-Schalter über die
// Einstellungs-Verteilung und der Rückschreib-Weg über den Editor. Die
// Unit-Prüfungen messen je ein Stück gegen gestellte Nachbarn; die Kette sieht
// erst der Lauf an der gestarteten Anwendung.
//
// **Jeder Fall endet am Dokument-Text**, nicht an der Oberfläche: geprüft wird
// die Datei auf der Platte nach einem Speichern-Vorgang, ausgewertet als roher
// Text und ausdrücklich nicht über den Format-Kern. Die drei Anzeige-Fälle
// (Tags am Kartenfuß, Filter, relative Termine) belegen dort das Gegenteil:
// Die Datei bleibt byte-gleich, und das Dokument wird nicht als geändert
// markiert.
//
// **Ausgangs-Zustand als Bedingung:** Die beiden Anzeige-Schalter stehen in
// einem frischen Profil auf «aus»; jeder Fall belegt diese Stellung an der
// Zeichnung, bevor er umschaltet.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, F-316, die
// Katalog-Zeile der Angaben auf der Karte).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { bedieneBis } = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const TAFEL = `${PANE0} .pane-kanban .kanban-tafel`;
const SPALTEN = `${TAFEL} .kanban-spalte`;
const KARTEN = `${TAFEL} .kanban-karte`;
const KONTEXTMENUE = '#context-menu';
const WAEHLER = '#date-picker-popup';
const FILTER = `${PANE0} .pane-kanban input.kanban-filter`;
const FILTER_LEER = `${PANE0} .pane-kanban .kanban-filter-leer`;

// Eine Tafel aus den angegebenen Karten-Zeilen in der Spalte «Offen» und einer
// leeren Spalte «Fertig» mit Erledigt-Kennzeichen. Die Leerzeilen-Form folgt
// den echten Tafeln des Product Owners (Muster kanban-tafel.spec.js).
function tafelText(karten, { einstellungen = false } = {}) {
  const zeilen = [
    '---',
    'kanban-plugin: board',
    '---',
    '',
    '## Offen',
    '',
    ...karten,
    '',
    '',
    '## Fertig',
    '',
    '**Fertiggestellt**',
    '',
    '',
  ];
  if (einstellungen) {
    // Der Einstellungs-Block des Vorbild-Werkzeugs am Dateiende.
    zeilen.push(
      '',
      '',
      '%% kanban:settings',
      '```',
      '{"kanban-plugin":"board","list-collapse":[false,false]}',
      '```',
      '%%',
    );
  }
  return zeilen.join('\n');
}

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1908-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, inhalt, name = 'Tafel.md') {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, inhalt, 'utf8');
  return datei;
}

// Der heutige Kalendertag in lokaler Zeit — dieselbe Rechnung wie die Zeichnung
// der Karte für «heute» (`lokalesDatum` in kanban-marker.js).
function heute() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

async function sendeMenuKanal(app, kanal, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, nutzlast) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(nutzlast.kanal, ...nutzlast.args);
    },
    { kanal, args },
  );
}

// Der Menü-Listener ist erst am Ende der asynchronen Renderer-Init registriert,
// und Electron-IPC puffert nicht: gesendet wird, bis die Wirkung eintritt
// (Muster kanban-tafel.spec.js). Nur für das Öffnen der Ansicht, dessen
// Wiederholung dieselbe Wirkung hat — Umschalter und Speichern gehen einmal
// über `sendeMenuKanal`.
async function sendeBis(app, kanal, bedingung, args = []) {
  await expect
    .poll(
      async () => {
        if (await bedingung()) return true;
        await sendeMenuKanal(app, kanal, ...args);
        return bedingung();
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

// Die Tafel-Ansicht öffnen. Danach sind alle Menü-Listener registriert, weil
// sie gemeinsam am Ende der Init entstehen; ein Umschalter darf dann einmal
// gesendet werden.
async function oeffneTafel(app, page) {
  await sendeBis(app, 'menu:viewChange', () => page.locator(TAFEL).isVisible(), ['kanban']);
}

// Das Dokument änderbar machen (Muster kanban-tafel.spec.js): gemessen am
// Daten-Merkmal der Fläche, nicht am Zustand des Schalters.
async function macheAenderbar(page) {
  await bedieneBis(page.locator(SEL.btnEdit), async () => {
    const wert = await page.locator(TAFEL).getAttribute('data-aenderbar');
    return wert === 'true';
  });
}

// Einmal speichern und warten, bis die Datei die Bedingung erfüllt.
//
// **Bewusst nicht gepollt gesendet** (Abweichung von den Vorbild-Dateien): Ein
// zweiter Speichern-Befehl, der eintrifft, während der erste noch schreibt,
// findet die Datei vom ersten geändert und das Dokument noch als geändert
// markiert und stellt die Konflikt-Frage «außerhalb der App geändert» — am
// 2026-09-23 so einmal in KB-03 beobachtet. Hier gibt es keinen Ersatz für den
// Dialog, der Fall bliebe stehen. Ein einzelnes Senden genügt, weil die
// Menü-Listener zu diesem Zeitpunkt registriert sind (siehe `oeffneTafel`).
async function speichere(app, datei, bedingung) {
  await sendeMenuKanal(app, 'menu:save');
  await expect.poll(() => bedingung(fs.readFileSync(datei, 'utf8')), { timeout: 15000 }).toBe(true);
  return fs.readFileSync(datei, 'utf8');
}

// Die Karten-Zeilen eines Spalten-Abschnitts aus dem rohen Dokument-Text,
// samt eingerückter Folgezeilen. Bewusst nicht über den Format-Kern (siehe
// Kopf).
function kartenZeilen(text, spaltenTitel) {
  const zeilen = text.split('\n').map((z) => z.replace(/\r$/, ''));
  const start = zeilen.findIndex((z) => z.trim() === `## ${spaltenTitel}`);
  if (start < 0) return null;
  const raus = [];
  for (let i = start + 1; i < zeilen.length; i++) {
    if (/^#{1,6}\s/.test(zeilen[i]) || /^\*{3,}\s*$/.test(zeilen[i])) break;
    if (/^- \[.\] /.test(zeilen[i]) || /^\s+\S/.test(zeilen[i])) raus.push(zeilen[i]);
  }
  return raus;
}

function karte(spalte, nr) {
  return `${KARTEN}[data-spalte="${spalte}"][data-karte="${nr}"]`;
}

async function kontextmenue(page, ziel, eintrag) {
  await page.locator(ziel).click({ button: 'right' });
  const punkt = page.locator(`${KONTEXTMENUE} [data-menu-id="${eintrag}"]`);
  await expect(punkt).toBeVisible();
  await punkt.click();
}

test.describe('KB-08: Termin über das Kontextmenü setzen und entfernen (F-316)', () => {
  test('das Abzeichen erscheint, die Zeile trägt den Termin-Marker, Entfernen nimmt beides zurück', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText(['- [ ] Erste Karte', '- [ ] Zweite Karte']);
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-marker`)).toHaveCount(0);

      // --- Setzen über den Kalender-Wähler ----------------------------------
      await kontextmenue(page, `${karte(0, 0)} .kanban-karte-inhalt`, 'kanban-card-set-date');
      await expect(page.locator(WAEHLER)).toBeVisible();
      // Ohne Termin öffnet der Wähler auf heute und allein mit dem Datum.
      await expect(page.locator('#date-picker-toggle-date')).toBeChecked();
      await expect(page.locator('#date-picker-toggle-time')).not.toBeChecked();
      const tag = page.locator(`${WAEHLER} button.date-picker-day:not(.other-month)`).first();
      const iso = await tag.getAttribute('data-iso');
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await tag.click();
      await page.locator('#date-picker-ok').click();
      await expect(page.locator(WAEHLER)).toBeHidden();

      const abzeichen = page.locator(`${karte(0, 0)} .kanban-karte-marker .task-marker-due`);
      await expect(abzeichen).toHaveText(`📅 ${iso}`);
      let text = await speichere(app, datei, (t) => t.includes(`📅 ${iso}`));
      expect(kartenZeilen(text, 'Offen')).toEqual([
        `- [ ] Erste Karte 📅 ${iso}`,
        '- [ ] Zweite Karte',
      ]);
      // Allein die eine Zeile ist gewachsen.
      expect(text).toBe(vorher.replace('- [ ] Erste Karte', `- [ ] Erste Karte 📅 ${iso}`));

      // --- Entfernen ----------------------------------------------------------
      await kontextmenue(page, `${karte(0, 0)} .kanban-karte-inhalt`, 'kanban-card-remove-date');
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-marker`)).toHaveCount(0);
      text = await speichere(app, datei, (t) => !t.includes('📅'));
      expect(text).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-09: fremder Termin wird gezeigt und beim Bearbeiten umgeschrieben (F-316)', () => {
  test('die bearbeitete Karte trägt danach den Termin-Marker, die unberührte ihre Schreibweise', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText([
      '- [ ] Angebot schreiben @{2026-10-02}',
      '- [ ] Rechnung prüfen @{2026-10-05}',
    ]);
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);

      // --- Anzeige: Abzeichen statt Rohtext -----------------------------------
      for (const [nr, datum] of [
        [0, '2026-10-02'],
        [1, '2026-10-05'],
      ]) {
        const fremd = page.locator(`${karte(0, nr)} .task-marker-due.kanban-marker-fremd`);
        await expect(fremd).toHaveText(`📅 ${datum}`);
        await expect(page.locator(`${karte(0, nr)} .kanban-karte-inhalt`)).not.toContainText('@{');
      }

      // --- Bearbeiten der ersten Karte ----------------------------------------
      // Die Eingabe zeigt den Rohtext samt fremdem Termin; geändert wird allein
      // ein Wort davor.
      await page.locator(`${karte(0, 0)} .kanban-karte-inhalt`).dblclick();
      const eingabe = page.locator(`${SPALTEN}[data-spalte="0"] .kanban-karte-eingabe`);
      await expect(eingabe).toBeFocused();
      await expect(eingabe).toHaveValue('Angebot schreiben @{2026-10-02}');
      await eingabe.fill('Angebot neu schreiben @{2026-10-02}');
      await eingabe.press('Enter');

      await expect(
        page.locator(`${karte(0, 0)} .task-marker-due:not(.kanban-marker-fremd)`),
      ).toHaveText('📅 2026-10-02');
      await expect(page.locator(`${karte(0, 1)} .kanban-marker-fremd`)).toHaveCount(1);

      const text = await speichere(app, datei, (t) => t.includes('Angebot neu schreiben'));
      expect(kartenZeilen(text, 'Offen')).toEqual([
        '- [ ] Angebot neu schreiben 📅 2026-10-02',
        '- [ ] Rechnung prüfen @{2026-10-05}',
      ]);
      // Alles außer der bearbeiteten Zeile ist byte-gleich — die unberührte
      // Karte behält die Schreibweise des Vorbild-Werkzeugs.
      expect(text).toBe(
        vorher.replace(
          '- [ ] Angebot schreiben @{2026-10-02}',
          '- [ ] Angebot neu schreiben 📅 2026-10-02',
        ),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-10: Schalter «Tags am Kartenfuß» (F-316)', () => {
  test('die Tags wandern zwischen Text und Fußreihe, das Dokument bleibt byte-gleich', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText(['- [ ] Bericht lesen #projekt', '- [ ] Ohne Tag']);
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      const inhalt = page.locator(`${karte(0, 0)} .kanban-karte-inhalt`);
      const fuss = page.locator(`${karte(0, 0)} .kanban-karte-tags`);

      // Ausgangs-Zustand: Schalter aus, das Tag steht im Text.
      await expect(fuss).toHaveCount(0);
      await expect(inhalt.locator('.tag-link')).toHaveText('#projekt');

      // --- Einschalten über das Kommando ------------------------------------
      await sendeMenuKanal(app, 'menu:kanbanSchalter', 'kanban.toggleTagsFooter');
      await expect(fuss.locator('.tag-link')).toHaveText('#projekt');
      await expect(inhalt).not.toContainText('#projekt');
      await expect(inhalt).toContainText('Bericht lesen');
      // Eine Karte ohne Tag bekommt keine Fußreihe.
      await expect(page.locator(`${karte(0, 1)} .kanban-karte-tags`)).toHaveCount(0);

      // --- Zurück -------------------------------------------------------------
      await sendeMenuKanal(app, 'menu:kanbanSchalter', 'kanban.toggleTagsFooter');
      await expect(fuss).toHaveCount(0);
      await expect(inhalt.locator('.tag-link')).toHaveText('#projekt');

      // Das Dokument ist weder geändert noch als geändert markiert.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-11: Obergrenze setzen, überschreiten und entfernen (F-316)', () => {
  test('der Titel trägt die Klammer, der Zähler zeigt n/Obergrenze und hebt die Überschreitung hervor', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText(['- [ ] Erste Karte', '- [ ] Zweite Karte', '- [ ] Dritte Karte']);
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      const spalte = page.locator(`${SPALTEN}[data-spalte="0"]`);
      const zaehler = spalte.locator('.kanban-spalte-zaehler');
      await expect(zaehler).toHaveText('3');
      await expect(spalte).not.toHaveAttribute('data-limit', /.*/);

      // --- Setzen über das Kontextmenü der Spalte ----------------------------
      await kontextmenue(
        page,
        `${SPALTEN}[data-spalte="0"] .kanban-spalte-kopf`,
        'kanban-column-set-limit',
      );
      const eingabe = spalte.locator('.kanban-spalte-limit-eingabe');
      await expect(eingabe).toBeFocused();
      await eingabe.fill('3');
      await eingabe.press('Enter');
      await expect(spalte).toHaveAttribute('data-limit', '3');
      await expect(zaehler).toHaveText('3/3');
      await expect(spalte).not.toHaveClass(/kanban-spalte-ueberschritten/);
      await expect(spalte.locator('.kanban-spalte-titel')).toHaveText('Offen');
      let text = await speichere(app, datei, (t) => t.includes('## Offen (3)'));
      expect(text).toBe(vorher.replace('## Offen', '## Offen (3)'));

      // --- Überschreiten: eine Karte mehr hineinlegen ------------------------
      await spalte.locator('.kanban-spalte-neu').click();
      const neu = spalte.locator('.kanban-karte-eingabe');
      await expect(neu).toBeFocused();
      await neu.fill('Vierte Karte');
      await neu.press('Enter');
      await expect(zaehler).toHaveText('4/3');
      await expect(spalte).toHaveClass(/kanban-spalte-ueberschritten/);
      text = await speichere(app, datei, (t) => t.includes('Vierte Karte'));
      expect(text.split('\n')).toContain('## Offen (3)');
      expect(kartenZeilen(text, 'Offen (3)')).toHaveLength(4);

      // --- Entfernen ------------------------------------------------------------
      await kontextmenue(
        page,
        `${SPALTEN}[data-spalte="0"] .kanban-spalte-kopf`,
        'kanban-column-remove-limit',
      );
      await expect(zaehler).toHaveText('4');
      await expect(spalte).not.toHaveAttribute('data-limit', /.*/);
      await expect(spalte).not.toHaveClass(/kanban-spalte-ueberschritten/);
      text = await speichere(app, datei, (t) => !t.includes('(3)'));
      // Übrig bleibt allein die hinzugelegte Karte; der Titel ist wie vorher.
      expect(text).toBe(
        vorher.replace('- [ ] Dritte Karte', '- [ ] Dritte Karte\n- [ ] Vierte Karte'),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-12: Karte archivieren und mit Strg+Z zurückholen (F-316)', () => {
  test('die Karte wandert mit Zeitstempel und Folgezeile ins Archiv, Rückgängig stellt beides her', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText(
      ['- [ ] Erste Karte', '- [ ] Zweite Karte', '  Folgezeile der zweiten Karte'],
      { einstellungen: true },
    );
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(KARTEN)).toHaveCount(2);

      // --- Archivieren über das Kontextmenü der Karte ------------------------
      await kontextmenue(page, `${karte(0, 1)} .kanban-karte-inhalt`, 'kanban-card-archive');
      await expect(page.locator(KARTEN)).toHaveCount(1);
      await expect(page.locator(TAFEL)).not.toContainText('Zweite Karte');

      const text = await speichere(app, datei, (t) => t.includes('## Archiv'));
      const zeilen = text.split('\n');
      expect(kartenZeilen(text, 'Offen')).toEqual(['- [ ] Erste Karte']);
      // Der Archiv-Abschnitt in der Form des Vorbilds: Trennlinie, Leerzeile,
      // Überschrift, Leerzeile, die Karte mit Zeitstempel samt Folgezeile.
      const trenner = zeilen.indexOf('***');
      expect(trenner).toBeGreaterThan(zeilen.indexOf('**Fertiggestellt**'));
      expect(zeilen.slice(trenner, trenner + 4)).toEqual(['***', '', '## Archiv', '']);
      expect(zeilen[trenner + 4]).toMatch(/^- \[ \] \d{4}-\d{2}-\d{2} \d{2}:\d{2} Zweite Karte$/);
      expect(zeilen[trenner + 5]).toBe('  Folgezeile der zweiten Karte');
      // Der Einstellungs-Block bleibt byte-gleich am Dateiende.
      const block = vorher.slice(vorher.indexOf('%% kanban:settings'));
      expect(text.endsWith(block)).toBe(true);
      expect(text.indexOf('%% kanban:settings')).toBeGreaterThan(trenner);

      // --- Rückgängig ---------------------------------------------------------
      // Rückgängig gehört der Fläche: Die Tafel muss den Fokus haben.
      await page.locator(`${karte(0, 0)} .kanban-karte-inhalt`).click();
      await expect(page.locator(karte(0, 0))).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Control+z');
      await expect(page.locator(KARTEN)).toHaveCount(2);
      await expect(page.locator(karte(0, 1))).toContainText('Zweite Karte');
      const zurueck = await speichere(app, datei, (t) => !t.includes('## Archiv'));
      expect(zurueck).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-13: Karten mit Strg+F filtern (F-316)', () => {
  test('das Filter-Feld engt die Karten ein, Escape stellt alle her, das Dokument bleibt', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText([
      '- [ ] Angebot schreiben',
      '- [ ] Rechnung prüfen',
      '- [ ] Angebot nachfassen',
    ]);
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      const zaehler0 = page.locator(`${SPALTEN}[data-spalte="0"] .kanban-spalte-zaehler`);
      const zaehler1 = page.locator(`${SPALTEN}[data-spalte="1"] .kanban-spalte-zaehler`);
      const verborgen = page.locator(`${KARTEN}.kanban-karte-verborgen`);
      await expect(zaehler0).toHaveText('3');
      await expect(page.locator(FILTER)).toHaveCount(0);

      // --- Strg+F führt in das Filter-Feld der Tafel -------------------------
      await page.locator(`${karte(0, 0)} .kanban-karte-inhalt`).click();
      await page.keyboard.press('Control+f');
      await expect(page.locator(FILTER)).toBeVisible();
      await expect(page.locator(FILTER)).toBeFocused();

      await page.keyboard.type('angebot');
      await expect(verborgen).toHaveCount(1);
      await expect(page.locator(karte(0, 1))).toHaveClass(/kanban-karte-verborgen/);
      await expect(page.locator(karte(0, 0))).toBeVisible();
      await expect(page.locator(karte(0, 2))).toBeVisible();
      await expect(zaehler0).toHaveText('2/3');
      await expect(zaehler1).toHaveText('0/0');
      await expect(page.locator(FILTER_LEER)).toBeHidden();

      // --- Null Treffer ----------------------------------------------------------
      await page.locator(FILTER).fill('xyz');
      await expect(verborgen).toHaveCount(3);
      await expect(zaehler0).toHaveText('0/3');
      await expect(page.locator(FILTER_LEER)).toBeVisible();
      await expect(page.locator(FILTER_LEER)).toHaveText('Keine Karte passt zum Filter.');

      // --- Escape beendet den Filter ---------------------------------------------
      await page.locator(FILTER).press('Escape');
      await expect(page.locator(FILTER)).toBeHidden();
      await expect(verborgen).toHaveCount(0);
      await expect(zaehler0).toHaveText('3');
      await expect(page.locator(FILTER_LEER)).toBeHidden();

      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-14: Schalter «Termine relativ anzeigen» (F-316)', () => {
  test('das Abzeichen eines heutigen Termins zeigt «heute», das Dokument bleibt byte-gleich', async () => {
    const dir = machVerzeichnis();
    const tag = heute();
    const vorher = tafelText([`- [ ] Heute fällig 📅 ${tag}`, `- [ ] Fremd heute @{${tag}}`]);
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      const eigen = page.locator(`${karte(0, 0)} .task-marker-due`);
      const fremd = page.locator(`${karte(0, 1)} .task-marker-due.kanban-marker-fremd`);

      // Ausgangs-Zustand: Schalter aus, das Datum steht absolut.
      await expect(eigen).toHaveText(`📅 ${tag}`);
      await expect(fremd).toHaveText(`📅 ${tag}`);

      // --- Einschalten über das Kommando ------------------------------------
      await sendeMenuKanal(app, 'menu:kanbanSchalter', 'kanban.toggleRelativeDates');
      await expect(eigen).toHaveText('📅 heute');
      await expect(fremd).toHaveText('📅 heute');
      // Die genaue Angabe bleibt einen Zeiger entfernt, im Hinweistext.
      await expect(eigen).toHaveAttribute('title', new RegExp(tag));

      // --- Zurück -------------------------------------------------------------
      await sendeMenuKanal(app, 'menu:kanbanSchalter', 'kanban.toggleRelativeDates');
      await expect(eigen).toHaveText(`📅 ${tag}`);

      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
