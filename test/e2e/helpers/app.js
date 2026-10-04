// 4T-000166: Gemeinsamer E2E-Helper — App-Start mit isoliertem Temp-Profil.
//
// Jeder Lauf bekommt ein frisches userData-Verzeichnis (SCG_TEST_USER_DATA,
// siehe Hook in src/main/main.js). Damit beruehren Tests nie das echte
// Nutzer-Profil unter %APPDATA% und starten ohne Session-Restore-Altlast.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron, test, expect } = require('@playwright/test');
const { SEL } = require('./selectors');
const { hauptSenden, hauptLesen } = require('./haupt-zugriff');
const { PANEL_ACCESS, DEFAULT_PANEL_TOGGLE_ORDER } = require('../../../src/shared/panel-access.js');
// 4T-001101: Zustands-Anteil der Profil-Vorbelegung aus der einen Quelle.
const { schreibeProfilVorbelegung } = require('../../../scripts/profil-vorbelegung.js');

// Projekt-Wurzel (test/e2e/helpers -> drei Ebenen hoch).
const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

// 4T-001481 / 4T-001475: Frische-Tor des Renderer-Bündels.
//
// Die Prüffälle starten die Anwendung gegen das erzeugte
// `src/renderer/renderer.bundle.js`. Gebaut wird es vom npm-Hook `pretest:e2e`,
// der bei `npm run test:e2e` und damit beim Gate-Weg greift — nicht aber bei
// einem direkten `npx playwright test <datei>`. Dort lief die Suite bis hierher
// lautlos gegen ein beliebig altes Bündel (Fehlerklasse L9, Belege 4T-001478 und
// 4T-001410).
//
// **Warum der Aufruf in launchApp steht und nicht im Modulkopf.** Ein Wurf beim
// Laden des Moduls träfe auch `playwright test --list`: Die Auflistung lädt
// jede Prüfdatei und durchläuft die Registrierungs-Phase, führt aber keinen Fall
// aus. `scripts/test-kennzahlen.js` gewinnt die Kennzahl «Automatische
// Prüfungen» genau daraus (4T-000831), und ein Wächter im Modulkopf hätte sie
// erneut eingefroren — derselbe Vorfall, den 4T-001322 für den Pflicht-Zugang
// bereits einmal aufräumen musste. In `launchApp` stellt sich die Frage nicht:
// Eine Auflistung startet keine Anwendung, also fragt sie auch nicht nach dem
// Bündel. Geprüft wird vor dem Start und damit vor jeder Wartezeit; das Ergebnis
// wird je Worker einmal ermittelt.
//
// Über den Gate-Weg bleibt der Wächter still, weil dessen `pre`-Kette
// unmittelbar davor gebaut hat — es gibt keine Sonderbehandlung für ihn, die
// Stille ist die Folge des frischen Bündels. Der Wächter selbst baut nicht: Ein
// Werkzeug, das den Arbeitsbaum ändert, ist ausgeschlossen (E7/E8).
//
// Dieser Helfer ist die einzige Stelle des Projekts, die Electron für die
// E2E-Suite startet (nachgesehen an `test/e2e/**`, nicht angenommen); ein Fall,
// der am Tor vorbeikäme, existiert nicht.
const { fordereFrischesBuendel } = require('../../../scripts/bundle-frische.js');
const { startParameter, programmdateiAusUmgebung } = require('./start-parameter');

let buendelGeprueft = false;
function pruefeBuendelEinmal() {
  // Der Befund selbst wird bei jedem Fall geworfen — er soll keinen Lauf
  // durchlassen —, der Datei-Durchlauf läuft nur beim ersten Start je Worker.
  if (buendelGeprueft) return;
  fordereFrischesBuendel(APP_ROOT);
  buendelGeprueft = true;
}

// 4T-000372 (Epic 3E-000069): Bereitschafts-Marker der Renderer-Init.
// applyPanelButtonOrder() sortiert die Statusbar-Panel-Buttons ganz am Ende
// von init() in die Modell-Reihenfolge; statisch steht in index.html ein
// anderer Button vorn. Der erste Button des Segments ist damit das spaeteste
// beobachtbare Init-Ergebnis und aus dem Zugangs-Modell abgeleitet (kein
// hartkodierter Wert, der bei Reihenfolge-Aenderungen still veraltet).
const FIRST_PANEL_BUTTON_ID = PANEL_ACCESS.find(
  (p) => p.id === DEFAULT_PANEL_TOGGLE_ORDER[0],
).buttonId;

/**
 * Wartet, bis die asynchrone Renderer-init() durchgelaufen ist.
 *
 * Hintergrund (4T-000372): waitForLoadState('domcontentloaded') deckt nur die
 * Listener auf Modulkopf-Ebene ab. init() laeuft danach mit vielen
 * await-Schritten weiter und registriert dort unter anderem den
 * reminders:due-Listener und die Panel-Sichtbarkeiten aus dem Store. Specs,
 * die unmittelbar nach dem Start einen Bereich binden (openAreaPath), lieferten
 * deshalb ein Rennen: fire-and-forget-Events des Main-Prozesses konnten
 * eintreffen, bevor ihr Listener existierte (ipcRenderer.on puffert nicht).
 * Das Rennen ging lange knapp zugunsten der Tests aus und kippte, als das
 * Renderer-Bundle um die Uhr-Module wuchs — betroffen waren ER-08
 * (Erinnerungen) und BIC-01 (Bereichs-Index-Cache).
 *
 * Bewusst weich: ein Ausbleiben des Markers laesst den Start NICHT scheitern,
 * damit dieser Helfer keine neue Fehlerquelle fuer Specs wird, die die
 * Statusbar gar nicht aufbauen. Der Test scheitert dann wie bisher an seiner
 * eigentlichen Assertion.
 */
async function waitForRendererInit(page) {
  try {
    await page.waitForFunction(
      (expected) => {
        const btn = document.querySelector('.statusbar .source-toggles > button');
        return !!btn && btn.id === expected;
      },
      FIRST_PANEL_BUTTON_ID,
      { timeout: 15000 },
    );
  } catch {
    // Marker nicht erreicht — bewusst kein harter Fehlschlag, siehe oben.
  }
}

/**
 * 4T-001948: Wartet, bis die Renderer-init() GENAU DIESER Seite durch ist.
 *
 * Gebraucht von Fällen, die einem weiteren Fenster (nicht dem ersten aus
 * launchApp) einen Befehl des Hauptprozesses schicken, etwa `menu:newWindow`
 * über `webContents.send`. Die Empfänger dieser Menü-Kanäle meldet erst
 * bindUi() an (app-init.js, bindMenuEvents), und ipcRenderer.on puffert nicht:
 * Ein Befehl, der vorher ankommt, geht ohne Spur verloren. Der Titel eines
 * Fensters steht dagegen früher und ist deshalb nur ein Vorbote. Gemessen an
 * LA-06 unter Rechenlast: In 2 von 20 Durchgängen fehlte das Zeichen beim
 * Senden, und das zweite Fenster kam auch in 120 s nicht.
 *
 * Gewartet wird auf `body[data-renderer-ready]`, das die Anwendung nach
 * bindUi() und initDone setzt (app-init.js). Anders als waitForRendererInit
 * bewusst HART: Der nächste Schritt braucht genau diesen Zustand, und ein
 * stilles Weiterlaufen ergäbe wieder das ausbleibende Fenster statt einer
 * Meldung am Ort der Ursache.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout] Wartezeit in Millisekunden.
 */
async function warteAufRendererBereit(page, timeout = 15000) {
  await page.waitForSelector('body[data-renderer-ready]', { state: 'attached', timeout });
}

/**
 * 4T-001578, geteilt seit 4T-001689: Wartet, bis der Eintrag des beim Start
 * übergebenen Dokuments im Dokument-Streifen der ersten Spalte steht und der
 * aktive ist.
 *
 * **Gemessene Ursache.** `launchApp` wartet ein Datei-Argument nicht ab. Der
 * Hauptprozess schickt es erst nach dem Laden des Fensters
 * (src/main/app/startup.js, `did-finish-load`), die Oberfläche öffnet es nach
 * ihrer Initialisierung und **aktiviert** seinen Eintrag
 * (app-broadcasts.js, `onOpenExternal`; tabs.js, `openInPane`). Was ein Fall in
 * dieser Lücke selbst öffnet, gerät danach in den Hintergrund: Seine Elemente
 * sind vorhanden, aber nicht sichtbar. Gemessen an `VL-09` (Einstellungs-Seite,
 * 2026-09-14) und `BS-07` (Statistik-Seite, 2026-10-01: in einem von acht
 * Durchgängen stand die Statistik-Seite 81 ms vor dem Dokument im Streifen,
 * danach war das Dokument aktiv).
 *
 * **Mehrere Datei-Argumente** öffnet die Oberfläche nacheinander, am Ende ist
 * das **letzte** aktiv; genannt wird deshalb das letzte. Erlaubt ist ein Name
 * oder ein Pfad; verglichen wird der Name ohne Markdown-Endung, weil der
 * Eintrag sich ohne sie beschriftet (4T-001724).
 *
 * **Warum `launchApp` nicht selbst wartet.** Ein Teil der Fälle braucht genau
 * die Lücke: Wer nach dem Start einen Bereich an dasselbe Fenster bindet, muss
 * das tun, bevor das Dokument als geöffnet gemeldet ist, sonst öffnet der
 * Bereich in einem neuen Fenster (src/main/area/area-apps.js, `appHasOpenFiles`).
 * Dazu kommen Starts mit wiederhergestellter Sitzung und Fälle, die ausdrücklich
 * kein Dokument erwarten. Ein pauschales Warten bräche sie; deshalb ruft der
 * Fall diesen Helfer an der Stelle auf, an der er die Vorbedingung braucht —
 * vor dem ersten Schritt, der einen weiteren Eintrag öffnet oder aktiviert
 * (test/README.md, Stabilitätsregel 32). Wer Bereich UND Dokument im selben
 * Fenster braucht, startet ohne Datei-Argument und nimmt
 * `oeffneDokumentImFenster` (unten).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} dateiname Name oder Pfad des (letzten) Datei-Arguments.
 */
async function warteAufDateiArgument(page, dateiname) {
  await expect(page.locator(SEL.activeTab0)).toContainText(
    path.basename(dateiname).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
  );
}

/**
 * 4T-001689: Öffnet Dokumente in GENAU DEM Fenster der Seite, auf demselben
 * Weg wie ein Datei-Argument beim Start, und wartet auf den aktiven Eintrag
 * des letzten.
 *
 * **Wofür.** Für Fälle, die einen Bereich an das Startfenster binden und
 * danach ein Dokument darin brauchen. Mit Datei-Argument zu starten und dann zu
 * binden ist ein Rennen: Ist das Dokument schon als geöffnet gemeldet, bindet
 * der Bereich nicht mehr an dieses Fenster, sondern öffnet ein eigenes
 * (src/main/area/area-apps.js, `appHasOpenFiles`; `openAreaPath` meldet dann
 * `createdNew` statt `boundExisting`). Gemessen unter Rechenlast an `BS-07` der
 * Bereichs-Statistik in 5 von 6 Durchgängen. Der Fall stellt deshalb den
 * Zustand in fester Reihenfolge her — ohne Datei-Argument starten, binden,
 * dann diesen Helfer —, statt das Rennen gewinnen zu müssen.
 *
 * **Derselbe Weg wie beim Start.** Der Hauptprozess schickt Start-Dateien als
 * Nachricht `file:openExternal` mit der Liste der Pfade
 * (src/main/app/startup.js); die Oberfläche öffnet sie in `onOpenExternal`
 * (src/renderer/modules/app/app-broadcasts.js) über `openInPane`. Genau diese
 * Nachricht geht hier an das Fenster der Seite, benannt über
 * `app.browserWindow(page)` statt über eine Fenster-Position.
 *
 * **Genau einmal, nach der Bereitschaft.** Die Nachricht ist nicht idempotent:
 * Zwei überlappende Sendungen legen zwei Einträge derselben Datei an
 * (Messung in rueckschreib-beobachtung.spec.js). Gesendet wird deshalb einmal,
 * nach `warteAufRendererBereit`, über `hauptSenden` (Befehl ohne Rückgabe,
 * Stabilitätsregel 31). Die Bereichs-Bindung lädt das Fenster nicht neu
 * (Zweig `boundExisting` in area-apps.js), die Bereitschaft bleibt also stehen.
 *
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {import('@playwright/test').Page} page
 * @param {string|string[]} pfade Ein Pfad oder mehrere, in Öffnungs-Reihenfolge.
 */
async function oeffneDokumentImFenster(app, page, pfade) {
  const liste = Array.isArray(pfade) ? pfade : [pfade];
  await warteAufRendererBereit(page);
  const fenster = await app.browserWindow(page);
  const fensterId = await hauptLesen(fenster, (w) => w.id);
  await hauptSenden(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.fensterId);
      if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', a.liste);
    },
    { fensterId, liste },
  );
  await warteAufDateiArgument(page, liste[liste.length - 1]);
}

// 4T-000751 (Epic 3E-000146): Vorbelegung des frischen Profils. Die Anwendung
// liefert seither Englisch als Voreinstellung aus; die Specs pruefen aber
// gegen deutsche Oberflaechen-Texte. Ohne diese Vorbelegung haetten sie die
// Sprache des Pruef-Rechners geerbt (auf einem englischsprachigen System
// waren sie schon vor der Umstellung rot). Deutsch statt Englisch, weil ein
// Umschreiben von rund zwanzig Spec-Dateien Aufwand ohne Gewinn waere; den
// ausgelieferten Zustand deckt die eigene Spec voreinstellungen.spec.js ab,
// die ohne Vorbelegung startet.
// 4T-000644 (Epic 3E-000127): Merker der gefuehrten Produkt-Tour. Ohne ihn liefe
// die Tour beim ersten Start JEDER Spec automatisch an und legte ihr Overlay
// ueber die Oberflaeche; die Klicks der Faelle liefen dann ins Leere.
//
// Der Merker steht bewusst NICHT nur in DEFAULT_TEST_SETTINGS, sondern wird
// jeder Vorbelegung beigemischt (siehe launchApp): Ein Fall mit eigener
// settings-Angabe umgeht die Vorbelegung vollstaendig, und genau diese sechs
// Faelle (pdf-export, zweite-spalte, 4t-0945-b12) haetten die Tour sonst
// gesehen. Unberuehrt bleibt allein `settings: null` — das ist die bewusste
// Aussage 'leerer Speicher, echter Erststart'.
//
// 4T-001101 (Epic 3E-000156): Der Zustands-Anteil (der Tour-Merker und jeder
// kuenftige Erststart-Merker) lebt seither in scripts/profil-vorbelegung.js,
// der einen Quelle aller App-startenden Werkzeuge; das Foto-Werkzeug der
// Webseite hatte dieselbe Falle mit eigener Liste ein zweites Mal gestellt
// (Auslieferung 1.114.0). Hier bleibt nur die aufrufer-eigene Darstellung.
const DEFAULT_TEST_SETTINGS = { language: 'de' };

// Schreibt die Vorbelegung in die config.json des Profils, bevor Electron
// startet: Zustands-Anteil aus der einen Quelle, darueber die Angabe des
// Falls. conf legt fehlende Defaults beim Start selbst nach, hier stehen
// deshalb nur die abweichenden Werte.
function seedSettings(userData, settings) {
  if (!settings) return;
  schreibeProfilVorbelegung(userData, settings);
}

// 4T-000901 (Epic 3E-000016): Zentrale Beobachtung der Konsole. Ein Fehler in der
// Entwickler-Konsole ist ein Fehler, auch wenn die Oberflaeche ihn nicht zeigt;
// bis hierher pruefte ihn genau ein Fall der Smoke-Suite, die uebrigen rund 570
// liefen daran vorbei.
//
// Der Zuhoerer haengt am 'window'-Ereignis der Anwendung und damit VOR
// firstWindow(). Der Befund aus 4T-000900 zeigte, warum das noetig ist: Der
// bisherige Fall registrierte ihn erst nach dem Hochfahren und blieb deshalb
// gruen, obwohl waehrend des Starts ein Fehler gemeldet wurde. Ueber dasselbe
// Ereignis werden auch weitere Fenster erfasst, ohne dass eine Spec etwas tun
// muss.
//
// Erfasst werden Konsolen-Eintraege vom Typ 'error' und unbehandelte Ausnahmen
// des Renderers ('pageerror'). Warnungen bleiben bewusst aussen vor: Ihr
// Rauschen wuerde den Waechter entwerten.
const KONSOLEN_AUSNAHMEN = require('../../konsolen-ausnahmen.json');

// Geduldet wird eine Meldung nur, wenn der Eintrag passt UND — sofern er eine
// Spec nennt — der Fall aus genau dieser Datei stammt. Ohne diese Bindung
// haette eine Ausnahme wie 'ERR_FILE_NOT_FOUND' projektweit gegolten und ein
// real fehlendes Symbol der Auslieferung mitverdeckt.
//
// Gefiltert wird erst bei der Auswertung, nicht im Ereignis-Zuhoerer: Dieser
// feuert auch ausserhalb eines laufenden Falls, wo die Spec-Zuordnung fehlt.
function istGeduldet(text, specDatei) {
  return KONSOLEN_AUSNAHMEN.eintraege.some(
    (e) => text.includes(e.enthaelt) && (!e.spec || specDatei.endsWith(e.spec)),
  );
}

function beobachteKonsole(app) {
  const funde = [];
  app.__konsolenFunde = funde;
  app.on('window', (page) => {
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Die Herkunft gehoert dazu: Eine Meldung wie 'Failed to load resource'
      // nennt die betroffene Adresse nicht im Text, und ohne sie ist nicht
      // entscheidbar, ob eine ausgelieferte Datei fehlt oder ein Testfall
      // absichtlich ins Leere greift.
      const ort = msg.location && msg.location() ? msg.location().url : '';
      funde.push(`${msg.text()}${ort ? ` [${ort}]` : ''}`);
    });
    page.on('pageerror', (err) => {
      // Die Meldung allein taugt zur Diagnose oft nicht: Bei einem
      // 'Cannot read properties of undefined' gibt es dutzende Kandidaten im
      // Renderer. Die erste Stapel-Zeile nennt die Stelle und macht aus dem
      // Raten ein Nachschlagen; der Rest des Stapels bliebe Rauschen.
      const stelle = (err && err.stack ? String(err.stack).split('\n')[1] : '') || '';
      const text = err && err.message ? err.message : String(err);
      funde.push(`pageerror: ${text}${stelle ? ` [${stelle.trim()}]` : ''}`);
    });
  });
}

// 4T-001579 (Epic 3E-000283): Prüf-Breite des Fensters.
//
// **Warum das hier steht und nicht in den betroffenen Prüffällen.** Die
// Statusleiste klappt seit diesem Vorgang bei knappem Platz in zwei
// Pull-up-Menüs zusammen, statt über den rechten Fensterrand hinauszulaufen.
// Gemessen am 2026-09-14 braucht sie mit geöffnetem Dokument rund **1280 px**;
// die Anwendung öffnet ihr Fenster aber mit **1200 px**. Vier Elemente
// (Rückverweise, ausgehende Verweise, Theme-Schalter, Sprach-Wahl) sind damit
// im Auslieferungs-Fenster eingeklappt und nicht mehr unmittelbar anklickbar.
// Das ist **kein** Fehler der Faltung: Vor ihr lagen genau diese Elemente
// außerhalb des sichtbaren Bereichs — der Mangel, den das Epic behebt.
//
// Für die Prüf-Umgebung heißt das: Ein Prüffall, der eine Schaltfläche der
// Leiste anklickt, prüfte ohne diese Breite die Faltung statt seiner eigenen
// Sache. Betroffen sind rund zehn Prüfdateien über fünf Elemente hinweg, und
// die Menge wächst mit jeder weiteren Schaltfläche. Deshalb setzt die eine
// Stelle, die alle Prüffälle durchlaufen, eine Breite mit Luft; wer eine
// schmale Lage **prüfen** will, setzt die Fenster-Grenzen weiterhin selbst
// (Muster FT-05, KP-04 und die SF-Fälle der Faltung).
//
// Die Höhe bleibt bewusst auf dem Auslieferungs-Wert 800, damit sich an den
// höhen-abhängigen Zusicherungen (Spalten-Überlauf der Seitenleiste) nichts
// verschiebt. Ist der Bildschirm schmaler als 1600, klemmt das Fenster-System
// die Breite — dann gilt dieselbe Lage wie vor dieser Ergänzung.
//
// **Gesetzt wird die Inhalts-Größe, nicht das Fenster-Rechteck** (Muster
// scripts/web-bildschirmfotos.js). Das ist nicht Geschmack, sondern gemessen:
// Eine erste Fassung setzte `setBounds({x: 0, y: 0, width, height})` und
// VERSCHOB damit das Fenster. Danach war `MEM-06` in vier von sechs Läufen der
// Datei rot, mit «electronApplication.evaluate: Execution context was
// destroyed» im zweiten Palette-Aufruf — also ohne verletzte Erwartung. Ohne
// Größen-Setzung war dieselbe Datei 3 von 3 grün, mit `setContentSize`
// ebenfalls 3 von 3 (gemessen am 2026-09-14). Der Auslöser war das Verschieben,
// nicht die Breite; `setContentSize` rührt die Position nicht an und gibt der
// Leiste ihre Breite genauer, weil der Fenster-Rahmen nicht mitzählt.
const PRUEF_BREITE = 1600;
const PRUEF_HOEHE = 800;

async function setzePruefBreite(app) {
  try {
    await hauptSenden(
      app,
      ({ BrowserWindow }, masse) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.setContentSize(masse.breite, masse.hoehe);
      },
      { breite: PRUEF_BREITE, hoehe: PRUEF_HOEHE },
    );
  } catch {
    // Kein Fenster (oder schon geschlossen): Der Prüffall scheitert dann an
    // seiner eigenen Zusicherung und nicht hier — wie beim Bereitschafts-
    // Marker oben.
  }
}

/**
 * Startet die App mit frischem Temp-Profil.
 * @param {object} [opts]
 * @param {string[]} [opts.args]      Zusaetzliche CLI-Argumente (z.B. Dateipfad).
 * @param {string}   [opts.userData]  Bestehendes Profil-Verzeichnis wiederverwenden
 *                                    (Session-Restore-Tests); Default: frisches Temp-Verzeichnis.
 * @param {object|null} [opts.settings] Vorbelegung der config.json; Default
 *                                    DEFAULT_TEST_SETTINGS (Sprache Deutsch).
 *                                    Eine eigene Angabe ersetzt die Sprache,
 *                                    bekommt aber weiterhin den Tour-Merker
 *                                    untergelegt (4T-000644, siehe TOUR_GESEHEN).
 *                                    null startet ohne jede Vorbelegung und
 *                                    zeigt damit den Auslieferungszustand —
 *                                    dort laeuft die Produkt-Tour an, und der
 *                                    Fall raeumt sie per schliesseTour() weg.
 * @returns {Promise<{ app: import('@playwright/test').ElectronApplication,
 *                     page: import('@playwright/test').Page,
 *                     userData: string }>}
 */
async function launchApp(opts = {}) {
  // 4T-001481: Frische-Tor vor jedem Start — Begründung am Helfer oben.
  // 4T-002068: Es entfällt allein beim Start einer gebauten Programmdatei,
  // die ihr eigenes gepacktes Bündel trägt (start-parameter.js).
  if (!programmdateiAusUmgebung(process.env)) pruefeBuendelEinmal();
  const userData = opts.userData || fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-e2e-'));
  // 4T-000644: Tour-Merker als Unterlage jeder Vorbelegung (Begruendung an
  // DEFAULT_TEST_SETTINGS); eine eigene Angabe des Falls liegt darueber und
  // gewinnt. Die Unterlage legt seit 4T-001101 die eine Quelle bei.
  const vorbelegung = 'settings' in opts ? opts.settings : DEFAULT_TEST_SETTINGS;
  seedSettings(userData, vorbelegung);
  // 4T-002068: Quellstand (`electron .`) oder, mit EM4ME_PROGRAMMDATEI, eine
  // gebaute Programmdatei; das eigene Profil bleibt in beiden Fällen.
  const { launch } = startParameter({
    env: process.env,
    appRoot: APP_ROOT,
    userData,
    zusatzArgumente: opts.args || [],
  });
  const app = await electron.launch(launch);
  beobachteKonsole(app);
  const page = await app.firstWindow();
  // firstWindow() resolved, bevor das Renderer-Bundle geladen ist. Die
  // Modulkopf-IPC-Listener (z.B. tab:appendFromOtherWindow) existieren erst
  // nach der Modul-Ausfuehrung; type=module ist deferred und laeuft vor
  // DOMContentLoaded — danach gehen keine gesendeten Events mehr verloren.
  await page.waitForLoadState('domcontentloaded');
  // 4T-000372 (Epic 3E-000069): zusaetzlich das Ende der asynchronen init()
  // abwarten — Begruendung am Helfer waitForRendererInit.
  await waitForRendererInit(page);
  await setzePruefBreite(app);
  return { app, page, userData };
}

/**
 * 4T-000644 (Epic 3E-000127): Ein angelaufenes Tour-Overlay wegraeumen.
 *
 * Gebraucht wird das nur von Faellen, die mit `settings: null` und ohne
 * gesetzten Merker starten — dort ist der Erststart echt, und die Tour legt
 * ihr Overlay ueber die Oberflaeche. Ihre eigentlichen Pruefungen bleiben
 * dadurch unveraendert: Sie laufen wie bisher gegen die freie Oberflaeche.
 *
 * Geschlossen wird ueber den Schliessen-Knopf des Popovers und nicht per
 * Escape, weil Escape zusaetzlich die Escape-Behandlung der Anwendung
 * ausloesen wuerde (Suchleiste, Menues) und der Fall damit von einem
 * Nebeneffekt abhinge, den er nicht meint.
 *
 * Bewusst geduldig und bewusst weich: Die Tour haengt am Ende der
 * asynchronen Renderer-Init, deshalb wird auf sie gewartet; bleibt sie aus
 * (Merker doch gesetzt), ist das kein Fehler, sondern der Normalfall aller
 * uebrigen Specs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout] Wartezeit auf das Overlay in Millisekunden.
 * @returns {Promise<boolean>} true, wenn eine Tour geschlossen wurde.
 */
async function schliesseTour(page, timeout = 10000) {
  const popover = page.locator('.driver-popover.em4me-tour');
  try {
    await popover.waitFor({ state: 'visible', timeout });
  } catch {
    return false;
  }
  await page.locator('.driver-popover-close-btn').click();
  await popover.waitFor({ state: 'detached', timeout: 10000 });
  return true;
}

/**
 * Beendet die App und raeumt das Temp-Profil auf. Windows-robust: Datei-
 * Handles koennen kurz nach dem Schliessen noch gesperrt sein, deshalb
 * try/catch mit Retry-Optionen statt hartem Fehlschlag.
 *
 * opts.force: beendet per app.exit(0) ohne before-quit und ohne Dialoge.
 * Pflicht fuer Tests, die absichtlich dirty Buffer hinterlassen — der
 * normale Close-Pfad wuerde sonst im nativen Speichern-Dialog haengen
 * und den Worker-Teardown blockieren.
 */
// 4T-000901: Auswertung am Ende eines Falls. Sie laeuft in closeApp, weil jede
// Spec ihn ohnehin im finally aufruft — so greift der Waechter, ohne dass eine
// Spec etwas dafuer tun muss.
//
// Ist der Fall bereits aus eigenem Grund rot, wird nur angehaengt statt
// geworfen: Ein Wurf aus dem finally-Block wuerde den urspruenglichen Fehler
// verdecken und die Diagnose verschlechtern.
function pruefeKonsolenFunde(app) {
  const roh = (app && app.__konsolenFunde) || [];
  if (roh.length === 0) return;
  let specDatei = '';
  try {
    specDatei = (test.info().file || '').replace(/\\/g, '/');
  } catch {
    // Ausserhalb eines laufenden Falls: keine Spec-Bindung, nichts geduldet.
  }
  const funde = roh.filter((f) => !istGeduldet(f, specDatei));
  if (funde.length === 0) return;
  const liste = funde.map((f, i) => `  ${i + 1}. ${f}`).join('\n');
  const meldung =
    `Konsolen-Fehler waehrend des Laufs (${funde.length}):\n${liste}\n` +
    'Beheben, oder bei einer Meldung von aussen einen begruendeten Eintrag in ' +
    'test/konsolen-ausnahmen.json aufnehmen.';
  let schonRot = false;
  try {
    schonRot = test.info().errors.length > 0;
  } catch {
    // Ausserhalb eines laufenden Falls (z.B. globaler Teardown): dann werfen.
  }
  if (schonRot) {
    test.info().annotations.push({ type: 'konsolen-fehler', description: meldung });
    return;
  }
  throw new Error(meldung);
}

async function closeApp(app, userData, opts = {}) {
  if (app) {
    try {
      if (opts.force) {
        await hauptSenden(app, ({ app: electronApp }) => {
          electronApp.exit(0);
        }).catch(() => {});
      }
      await app.close();
    } catch {
      // App war bereits beendet (z.B. Session-Restore-Test mit eigenem Quit).
    }
  }
  if (userData) {
    try {
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Verzeichnis bleibt im OS-Temp liegen; unkritisch.
    }
  }
  // Zuletzt, damit Beenden und Aufraeumen in jedem Fall gelaufen sind.
  pruefeKonsolenFunde(app);
}

module.exports = {
  launchApp,
  closeApp,
  schliesseTour,
  warteAufRendererBereit,
  warteAufDateiArgument,
  oeffneDokumentImFenster,
  APP_ROOT,
};
