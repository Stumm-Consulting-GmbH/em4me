// 4T-000644 (Epic 3E-000127): E2E-Funktions-Suite — geführte Produkt-Tour (S-136).
//
// Der Prüfgegenstand ist genau das, was nur die gebaute Anwendung zeigt: dass
// die Tour beim echten Erststart von selbst anläuft, dass ein Abbruch sie
// dauerhaft stilllegt, dass der Weg von Hand danach weiter offen steht und dass
// ein Durchlauf bis zur letzten Station geht. Die Merker-Mechanik dahinter
// prüft test/unit/renderer/tour-erststart.test.js am Modul, die Kopplung der
// Stations-Anker an das Markup test/unit/tour-stationen.test.js.
//
// PT-01: Erststart mit leerem Speicher — die Tour läuft von selbst an.
// PT-02: Sofort-Abbruch legt den Merker; der Neustart desselben Profils bleibt frei.
// PT-03: Der Start von Hand über das Menü läuft unabhängig vom Merker.
// PT-04: Der Menü-Eintrag steht zwischen Handbuch- und Über-Eintrag.
// PT-05: Durchlauf über alle Stationen bis „Fertig".
//
// PT-02 und PT-05 beenden die Tour ohne jede Verweildauer, und das ist
// Prüfgegenstand, nicht Bequemlichkeit: Bis zum 2026-08-19 schrieb tour.js den
// Merker allein über `onDestroyed`, und driver.js ruft diesen Haken erst,
// nachdem sein rAF-Übergang auf die Station durch ist (Vorgabe 400 ms). Ein
// sofortiger Abbruch blieb damit unverbucht. Seit der Umstellung auf
// `onDestroyStarted` hängt die Schreibung nicht mehr am Übergang; die beiden
// Fälle halten genau das fest und würden bei einem Rückfall wieder rot.
//
// Zwei Eigenheiten des Aufbaus, beide am Bestand begründet:
//
//   Leerer Speicher heißt englische Oberfläche. Der Auslieferungszustand ist
//   Englisch (belegt in voreinstellungen.spec.js, VE-01), und ein Profil mit
//   `language: 'de'` wäre kein leerer Speicher mehr. PT-01 prüft deshalb gegen
//   en.json; die übrigen Fälle legen ein Profil mit Sprache, aber ohne Merker
//   an und prüfen gegen de.json.
//
//   Die Stations-Zahl steht nirgends im Prüfcode. tour-stationen.js ist ein
//   ES-Modul und für diese CommonJS-Spec nicht ladbar; die Zahl käme also nur
//   als Kopie herein und veraltete still. Stattdessen liest PT-05 die
//   Gesamtzahl aus der Fortschritts-Anzeige und hält die Zahl der Schritte
//   dagegen — die Spec bleibt damit richtig, wenn eine Station hinzukommt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { menuZustand } = require('../helpers/menu-zustand');

const I18N_DIR = path.resolve(__dirname, '..', '..', '..', 'src', 'i18n');
const texte = (lang) => JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8'));
const DE = texte('de');
const EN = texte('en');

const POPOVER = '.driver-popover.em4me-tour';
const TITEL = `${POPOVER} .driver-popover-title`;
const TEXT = `${POPOVER} .driver-popover-description`;
const FORTSCHRITT = `${POPOVER} .driver-popover-progress-text`;
const WEITER = `${POPOVER} .driver-popover-next-btn`;
const ZURUECK = `${POPOVER} .driver-popover-prev-btn`;
const SCHLIESSEN = `${POPOVER} .driver-popover-close-btn`;

// Profil mit vorbefüllter config.json, aber OHNE Tour-Merker (Muster
// seedProfile in uhr-kalender.spec.js). Genau diese Lücke ist hier der
// Prüf-Aufbau: Sie ist der Zustand vor dem allerersten Start.
function seedProfilOhneMerker(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-produkt-tour-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Den Fortschritts-Satz der Sprachdatei zu einem Muster machen: Die laufende
// Nummer steht fest, die Gesamtzahl bleibt offen. Gebraucht wird das dort, wo
// die Zahl der Stationen nicht zum Prüfgegenstand gehört; eine Kopie der Zahl
// veraltete still (Begründung im Kopf der Datei).
function fortschrittMuster(vorlage, aktuell) {
  const roh = vorlage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^${roh.replace('\\{\\{current\\}\\}', String(aktuell)).replace('\\{\\{total\\}\\}', '\\d+')}$`,
  );
}

// Tolerant gegen den Moment, in dem die Datei gerade geschrieben wird (Muster
// readConfig in voreinstellungen.spec.js).
function readConfig(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

// Den Menü-Kanal senden, den der native Klick auslösen würde. Native Menüs sind
// aus Playwright nicht klickbar (Muster sendMenuChannel in handbuch.spec.js).
async function sendeMenuKanal(app, kanal) {
  await app.evaluate(({ BrowserWindow }, k) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send(k);
  }, kanal);
}

// Ende der Renderer-Init abwarten. Der Erststart-Anlauf der Tour hängt
// unmittelbar hinter diesem Signal; wer belegen will, dass die Tour NICHT
// anläuft, braucht diesen Zeitpunkt als Bezug.
async function warteAufBereitschaft(page) {
  await page.waitForSelector('body[data-renderer-ready]', { timeout: 20000 });
}

test.describe('PT-01: Erststart mit leerem Speicher (S-136)', () => {
  test('die Tour läuft von selbst an und zeigt ihre erste Station', async () => {
    // settings: null heißt hier wörtlich leerer Speicher — kein Merker, keine
    // Sprache. Damit ist es der einzige Fall der Suite, der den Erststart eines
    // frisch installierten Programms zeigt.
    const { app, page, userData } = await launchApp({ settings: null });
    try {
      const popover = page.locator(POPOVER);
      await expect(popover).toBeVisible();
      // Erste Station, in der Sprache des Auslieferungszustands.
      await expect(page.locator(TITEL)).toHaveText(EN['tour.welcome.title']);
      await expect(page.locator(TEXT)).toHaveText(EN['tour.welcome.text']);
      // Die Bedien-Texte kommen aus den Sprachdateien und nicht aus driver.js.
      await expect(page.locator(WEITER)).toHaveText(EN['tour.next']);
      await expect(page.locator(SCHLIESSEN)).toBeVisible();
      // Fortschritts-Anzeige: driver.js ersetzt die beiden Platzhalter, der
      // Satzbau kommt aus der Sprachdatei.
      await expect(page.locator(FORTSCHRITT)).toHaveText(fortschrittMuster(EN['tour.progress'], 1));
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('PT-02: Sofort-Abbruch und Neustart (S-136)', () => {
  test('der Sofort-Abbruch legt den Merker, der Neustart bleibt frei von der Tour', async () => {
    const userData = seedProfilOhneMerker({ language: 'de' });
    const erste = await launchApp({ userData, settings: null });
    try {
      await expect(erste.page.locator(POPOVER)).toBeVisible();
      await expect(erste.page.locator(TITEL)).toHaveText(DE['tour.welcome.title']);
      // Abbruch über den Schließen-Knopf, OHNE jede Verweildauer: Der Klick
      // fällt mitten in den Stations-Übergang von driver.js. Genau dieser
      // Zeitpunkt ist der Prüfgegenstand (Begründung im Kopf der Datei).
      await erste.page.locator(SCHLIESSEN).click();
      await expect(erste.page.locator(POPOVER)).toHaveCount(0);
      // Der Abbruch schreibt den Merker genauso wie ein Abschluss. Geprüft wird
      // er auf der Platte und nicht im Speicher, weil erst die Datei den
      // Neustart überdauert.
      await expect.poll(() => readConfig(userData).tourSeen).toBe(true);
    } finally {
      // Profil bewusst behalten: Es ist der Prüf-Gegenstand des zweiten Starts.
      await closeApp(erste.app);
    }

    const zweite = await launchApp({ userData, settings: null });
    try {
      await warteAufBereitschaft(zweite.page);
      // Kurz nachfassen: Der Anlauf hängt hinter dem Bereitschafts-Signal, eine
      // Prüfung im selben Augenblick wäre auch dann grün, wenn die Tour
      // gleich darauf doch erschiene.
      await zweite.page.waitForTimeout(1000);
      await expect(zweite.page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await closeApp(zweite.app, userData);
    }
  });
});

test.describe('PT-03: Start von Hand (S-136)', () => {
  test('der Menü-Weg startet die Tour und fasst den Merker nicht an', async () => {
    // Merker bewusst auf false: Er ist gesetzt (die Tour läuft also nicht von
    // selbst an) und zugleich vom geschriebenen Wert true unterscheidbar. Ein
    // Schreiben durch den Weg von Hand fiele damit auf.
    const { app, page, userData } = await launchApp({
      settings: { language: 'de', tourSeen: false },
    });
    try {
      await warteAufBereitschaft(page);
      await expect(page.locator(POPOVER)).toHaveCount(0);

      await sendeMenuKanal(app, 'menu:startTour');
      await expect(page.locator(POPOVER)).toBeVisible();
      await expect(page.locator(TITEL)).toHaveText(DE['tour.welcome.title']);

      // Ein zweiter Aufruf über dem laufenden Overlay hinterlässt genau eines:
      // zwei übereinander wären nicht bedienbar.
      await sendeMenuKanal(app, 'menu:startTour');
      await expect(page.locator(POPOVER)).toHaveCount(1);

      await page.locator(SCHLIESSEN).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);
      // Der Weg von Hand liest und schreibt den Merker nicht: Der gesetzte Wert
      // steht unverändert da.
      await page.waitForTimeout(500);
      expect(readConfig(userData).tourSeen).toBe(false);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('PT-04: Menü-Zugang (S-136)', () => {
  test('«Produkt-Tour» steht zwischen Handbuch- und Über-Eintrag', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await warteAufBereitschaft(page);
      // Leerer Titel-Teil: Ein-Fenster-Lage, jeder Titel enthält ihn (Muster
      // erweiterungen-extern.spec.js).
      const menu = await menuZustand(app, '');
      const stelle = (label) => menu.findIndex((e) => e.label === label);
      const handbuch = stelle(DE['menu.help.help']);
      const tour = stelle(DE['menu.help.tour']);
      const ueber = stelle(DE['menu.help.about']);
      expect(handbuch, 'Handbuch-Eintrag nicht erfasst').toBeGreaterThan(-1);
      expect(tour, 'Menü-Eintrag «Produkt-Tour» fehlt').toBeGreaterThan(-1);
      expect(ueber, 'Über-Eintrag nicht erfasst').toBeGreaterThan(-1);
      expect(handbuch, 'Reihenfolge Handbuch -> Produkt-Tour verletzt').toBeLessThan(tour);
      expect(tour, 'Reihenfolge Produkt-Tour -> Über verletzt').toBeLessThan(ueber);
      // Der Eintrag ist bedienbar und nicht nur vorhanden.
      expect(menu[tour].enabled).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('PT-05: Durchlauf bis zur letzten Station (S-136)', () => {
  test('Weiter führt durch alle Stationen, Fertig räumt das Overlay ab', async () => {
    const userData = seedProfilOhneMerker({ language: 'de' });
    const { app, page } = await launchApp({ userData, settings: null });
    try {
      await expect(page.locator(POPOVER)).toBeVisible();
      // Gesamtzahl aus der Fortschritts-Anzeige lesen statt sie zu kopieren
      // (Begründung im Kopf der Datei).
      const ersterFortschritt = await page.locator(FORTSCHRITT).textContent();
      const zahlen = ersterFortschritt.match(/\d+/g) || [];
      expect(zahlen.length, `Fortschritt ohne zwei Zahlen: ${ersterFortschritt}`).toBe(2);
      const gesamt = Number(zahlen[1]);
      expect(gesamt).toBeGreaterThan(1);

      // Auf der ersten Station ist der Zurück-Knopf abgeschaltet.
      await expect(page.locator(ZURUECK)).toBeDisabled();
      await expect(page.locator(WEITER)).toHaveText(DE['tour.next']);

      // Durchlauf: Auf jeder Station Titel und Text prüfen, dann weiter. Auf
      // der letzten trägt derselbe Knopf den Abschluss-Text.
      for (let station = 1; station <= gesamt; station++) {
        await expect(page.locator(FORTSCHRITT)).toHaveText(
          DE['tour.progress']
            .replace('{{current}}', String(station))
            .replace('{{total}}', String(gesamt)),
        );
        // Kein Rückfall auf den rohen i18n-Schlüssel: Ein fehlender Text zeigte
        // hier den Bezeichner statt eines Satzes.
        await expect(page.locator(TITEL)).not.toHaveText(/^tour\./);
        await expect(page.locator(TEXT)).not.toHaveText(/^tour\./);
        await expect(page.locator(WEITER)).toHaveText(
          station === gesamt ? DE['tour.done'] : DE['tour.next'],
        );
        await page.locator(WEITER).click();
      }

      // Nach dem Abschluss ist das Overlay weg — samt Platzhalter-Element und
      // Körper-Klasse von driver.js, sonst bliebe die Oberfläche gesperrt.
      await expect(page.locator(POPOVER)).toHaveCount(0);
      await expect(page.locator('.driver-overlay')).toHaveCount(0);
      expect(await page.evaluate(() => document.body.classList.contains('driver-active'))).toBe(
        false,
      );
      // Ein Abschluss legt den Merker genauso wie ein Abbruch — und wie dort
      // fällt der Klick auf «Fertig» ohne Verweildauer in den Stations-Übergang.
      await expect.poll(() => readConfig(userData).tourSeen).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});
