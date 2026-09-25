// 4T-001579 (Epic 3E-000283): E2E-Funktions-Suite — Faltung der Statusleiste
// bei knappem Platz. Kürzel SF- (Statusleisten-Faltung).
//
// SF-01 volle Breite ohne Menü-Schaltfläche (AK1), SF-02 mehrere schmale
// Breiten ohne Überlauf (AK2), SF-03 Zonen-Zuordnung der beiden Menüs (AK3),
// SF-04 Abbau in umgekehrter Anzeige-Reihenfolge, auch bei geänderter
// Sortierung (AK4), SF-05 Meldungs-Bereich bleibt sichtbar, Wort-Statistik
// darf wandern (AK5), SF-06 Wirkung und Zustand eines Elements aus dem Menü
// heraus (AK6), SF-07 Rückkehr beim Verbreitern (AK7), SF-08 kein Schwingen
// durch den Umbruch-Bereich (AK8), SF-09 ausgeblendete Standard-Schaltfläche
// erscheint weder in der Leiste noch im Menü (AK10).
//
// 4T-001580 (Epic 3E-000283): SF-11 bis SF-13 prüfen die Einstellung mit den
// beiden Werten «automatisch» und «immer zusammengeklappt» — SF-11 den
// Abschnitt „Statusleiste" samt Werte-Liste, Vorgabewert und Wirkung ohne
// Neustart (AK1), SF-12 die Menüs bei voller Breite im Zustand «immer
// zusammengeklappt» (AK3), SF-13 den Meldungs-Bereich in diesem Zustand
// (AK4). Sie stehen in dieser Datei und nicht in einer eigenen, weil sie
// dieselbe Funktionsgruppe betreffen und die Mess- und Warte-Helfer oben
// unverändert brauchen (eine Spec pro Funktionsgruppe, test/README.md).
// AK2 (Vorgabewert im unberührten Auslieferungs-Zustand) liegt als Unit-Fall
// in `test/unit/renderer/statusleisten-faltung.test.js`; AK5 (zwei offene
// Fenster) und AK6 (Neustart der gebauten Programmdatei) sind manuelle
// Handgriffe.
//
// AK9 (Tastatur und Vorlese-Software) ist im Prüf-Block als manueller
// Handgriff an der gebauten Programmdatei geführt; das Zustands-Attribut
// `aria-expanded`, das dort geprüft wird, nimmt SF-06 zusätzlich mit.
//
// Die Breite wird über die Fenster-Grenzen gesetzt (Muster KP-04 in
// kommando-platzierung.spec.js), und gewartet wird auf den Zustand, den die
// Messung herstellt — nie auf eine Zeit.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

const MENU = '#context-menu';
const KNOPF_LINKS = '#btn-statusbar-collapse-left';
const KNOPF_RECHTS = '#btn-statusbar-collapse-right';

// 4T-001580: Einstellungs-Seite und der Abschnitt „Statusleiste" (Muster
// einstellungen-seite.spec.js).
const EINSTELLUNGEN_SEITE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const NAV_ALLGEMEIN = `${EINSTELLUNGEN_SEITE} .settings-nav-group[data-nav-group="general"]`;
const NAV_STATUSLEISTE = `${NAV_ALLGEMEIN} .settings-nav-entry[data-section-id="statusbar"]`;
const FALT_MODUS_FELD = '#settings-statusbar-collapse-mode';

// Profil-Verzeichnis mit vorbefüllter Store-Datei (Muster seedProfile in
// kommando-platzierung.spec.js). Die Sprach-Vorbelegung gehört mit hinein,
// weil eine eigene settings-Angabe die Standard-Vorbelegung ersetzt.
function seedProfil(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sf-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Ein Messwert der Leiste, in einem Durchgang im Fenster erhoben. Die
// Kandidaten-Menge ist dieselbe, mit der das Modul arbeitet: `button` und
// `select` der drei Zonen ohne die beiden Menü-Knöpfe.
function messung() {
  const kennung = (el) => el.id || (el.dataset.view ? `view:${el.dataset.view}` : el.tagName);
  const leiste = document.querySelector('footer.statusbar');
  const zone = (sel) =>
    [...document.querySelectorAll(`${sel} button, ${sel} select`)].filter(
      (el) => !el.classList.contains('statusbar-collapse-toggle'),
    );
  const vorhanden = (el) => !el.hidden && !el.classList.contains('sb-user-hidden');
  const eingeklappt = (el) => el.classList.contains('sb-collapsed');
  const zonen = {
    links: zone('.statusbar-left'),
    mitte: zone('.statusbar-center'),
    rechts: zone('.statusbar-right'),
  };
  const alle = [...zonen.links, ...zonen.mitte, ...zonen.rechts];
  const leisteRect = leiste.getBoundingClientRect();
  const ergebnis = {
    leisteBreite: leiste.clientWidth,
    ueberlauf: leiste.scrollWidth - leiste.clientWidth,
    knopfLinks: !document.getElementById('btn-statusbar-collapse-left').hidden,
    knopfRechts: !document.getElementById('btn-statusbar-collapse-right').hidden,
    eingeklappt: alle.filter((el) => vorhanden(el) && eingeklappt(el)).map(kennung),
    sichtbar: alle.filter((el) => vorhanden(el) && !eingeklappt(el)).map(kennung),
    // Läuft ein sichtbares Element über den rechten Rand der Leiste hinaus?
    // Ein Pixel Toleranz gegen Sub-Pixel-Rundung.
    ueberRand: alle
      .filter((el) => vorhanden(el) && !eingeklappt(el))
      .filter((el) => el.getBoundingClientRect().right > leisteRect.right + 1)
      .map(kennung),
    hinweisEingeklappt: document
      .getElementById('statusbar-hint')
      .classList.contains('sb-collapsed'),
    zonenFolge: {},
  };
  // Je Zone die Kandidaten in Anzeige-Reihenfolge mit ihrem Faltungs-Zustand.
  for (const [name, liste] of Object.entries(zonen)) {
    ergebnis.zonenFolge[name] = liste.filter(vorhanden).map((el) => ({
      kennung: kennung(el),
      eingeklappt: eingeklappt(el),
    }));
  }
  return ergebnis;
}

async function messe(page) {
  return page.evaluate(messung);
}

// Wartet auf den zur Ruhe gekommenen Zustand der Leiste und liefert ihn.
//
// Drei Teile gehören zusammen, und keiner genügt allein: die neue Breite
// (`breitePruefung`), die Überlauf-Freiheit und die **Ruhe** — drei
// aufeinander folgende Messungen mit derselben eingeklappten Menge. Die Ruhe
// ist der tragende Teil: Unmittelbar nach einem Verbreitern ist die Leiste
// schon breit und läuft nicht über, weil noch alles eingeklappt ist. Wer dort
// abbricht, misst den Vorboten und nicht den Zustand — genau daran sind in der
// ersten Fassung dieser Spec drei Fälle gescheitert.
async function warteAufRuhe(page, breitePruefung) {
  let letzte = null;
  let stabil = 0;
  await expect
    .poll(async () => {
      const m = await messe(page);
      if (!breitePruefung(m) || m.ueberlauf > 0) {
        letzte = null;
        stabil = 0;
        return 0;
      }
      const jetzt = m.eingeklappt.join('|');
      stabil = jetzt === letzte ? stabil + 1 : 0;
      letzte = jetzt;
      return stabil;
    })
    .toBeGreaterThanOrEqual(2);
  return messe(page);
}

async function setzeBreite(app, page, breite) {
  const vorher = (await messe(page)).leisteBreite;
  await app.evaluate(({ BrowserWindow }, b) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.unmaximize();
    win.setBounds({ x: 20, y: 20, width: b, height: 720 });
  }, breite);
  return warteAufRuhe(page, (m) => m.leisteBreite !== vorher);
}

// Breiteste mögliche Lage: das Fenster füllt die Arbeitsfläche des Bildschirms
// und wird dabei nie schmaler, als es schon ist.
//
// Bis zum 2026-09-19 rief dieser Helfer `win.maximize()` und wartete darauf,
// dass die Leiste **breiter** wird als zuvor. Beides trägt nur auf einem
// Bildschirm, der breiter ist als das Prüf-Fenster. In der Linux-Prüfumgebung
// ist er es nicht: Dort läuft ein Bildschirm von 1280 px ohne Fenster-Verwalter,
// während der Start-Helfer jedem Prüf-Fenster 1600 px Inhaltsbreite gibt.
// Gemessen am 2026-09-19 im Container: Inhaltsgröße vor dem Maximieren
// [1600, 800], danach unverändert [1600, 800] — ohne Fenster-Verwalter bleibt
// das Maximieren wirkungslos. Die Wartebedingung «breiter als vorher» wurde
// deshalb nie wahr, und alle fünf Fälle, die hier vorbeikommen (SF-01, SF-07,
// SF-11, SF-12, SF-13), liefen in ihr Zeitlimit, während die sieben Fälle mit
// ausdrücklich gesetzten Fenster-Grenzen grün blieben.
//
// Gesetzt wird die Breite deshalb ausdrücklich — dasselbe Muster, mit dem diese
// Datei ihre schmalen Lagen herstellt und das ihr Kopf-Kommentar als das ihre
// benennt. Die Zusicherungen der fünf Fälle bleiben unverändert: Bei 1600 px
// ist im Container nichts eingeklappt und die Leiste läuft nicht über (dieselbe
// Messung), die volle Breite ist also eine echte volle Breite und keine
// abgeschwächte Erwartung.
//
// Die Untergrenze ist dabei nicht die Bildschirm-Breite, sondern die
// Prüf-Breite, die der Start-Helfer jedem Fenster ohnehin gibt: SF-07 kommt aus
// einer schmalen Lage von 820 px hierher, und auf die Arbeitsfläche allein
// gesetzt läge es im Container bei 1280 px — gemessen braucht die ungefaltete
// Leiste dort rund 1200 px, das wäre also eine Zusicherung auf der Kippe. Mit
// der Prüf-Breite als Untergrenze messen alle fünf Fälle dieselbe Lage.
//
// `setContentSize` statt `setBounds`, weil es die Fenster-Position nicht
// anrührt (Begründung am Start-Helfer, test/e2e/helpers/app.js); die Höhe
// wächst mit, damit die Lage der des maximierten Fensters entspricht, in der
// diese Fälle bisher gemessen haben.
//
// Der Wert spiegelt PRUEF_BREITE aus test/e2e/helpers/app.js. Bewusst als
// eigene Zahl dieser Datei und nicht als Einfuhr aus dem Start-Helfer: Der
// Helfer setzt eine Vorgabe für jeden Prüffall, hier steht die Lage, in der
// diese fünf Fälle ihre Zusicherung prüfen; beide dürfen sich unabhängig
// bewegen, solange diese hier nicht kleiner wird.
const VOLLE_BREITE_MINDESTENS = 1600;

async function volleBreite(app, page) {
  const ziel = await app.evaluate(({ BrowserWindow, screen }, mindestens) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.unmaximize();
    const [breiteIst, hoeheIst] = win.getContentSize();
    const flaeche = screen.getDisplayMatching(win.getBounds()).workAreaSize;
    const breite = Math.max(flaeche.width, breiteIst, mindestens);
    win.setContentSize(breite, Math.max(flaeche.height, hoeheIst));
    return breite;
  }, VOLLE_BREITE_MINDESTENS);
  // Zwei Pixel Spielraum gegen die Rundung zwischen Fenster-Inhaltsgröße und
  // gemessener Leisten-Breite; die Ruhe-Bedingung von warteAufRuhe bleibt
  // davon unberührt.
  return warteAufRuhe(page, (m) => m.leisteBreite >= ziel - 2);
}

// Setzt die Fensterbreite UNTER die Mindestbreite der Anwendung (600 px),
// indem die Mindestgröße des Fensters vorher herabgesetzt wird.
//
// Gebraucht wird das für genau eine Zusicherung: dass die mittlere Zone
// zuletzt zusammenklappt und ihre Elemente im rechten Menü erscheinen. Sie ist
// über die Fensterbreite allein nicht erreichbar — gemessen am 2026-09-14 sind
// bei 604 px Leisten-Breite noch sechs Panel-Schalter der linken Zone übrig,
// und mit erschöpften Seiten-Zonen braucht die Leiste nur rund 410 px. Der
// Abbau der Mitte beginnt also erst unterhalb dessen, was die Anwendung als
// Fenster zulässt. Herabgesetzt wird deshalb die Fenster-Grenze und nichts am
// Produkt; die Zusicherung «die Mitte klappt NICHT, solange die Seiten noch
// können» prüft derselbe Fall oben an einer regulären Breite.
async function setzeBreiteUnterMindestmass(app, page, breite) {
  const vorher = (await messe(page)).leisteBreite;
  await app.evaluate(({ BrowserWindow }, b) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.unmaximize();
    win.setMinimumSize(200, 200);
    win.setBounds({ x: 20, y: 20, width: b, height: 720 });
  }, breite);
  return warteAufRuhe(page, (m) => m.leisteBreite !== vorher);
}

async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Die eingeklappten Elemente einer Zone bilden immer ein zusammenhängendes
// Ende ihrer Anzeige-Reihenfolge — das ist E6 (Abbau von hinten nach vorn) in
// prüfbarer Form, und zwar unabhängig davon, wie viele Elemente die gerade
// gesetzte Breite trifft.
function pruefeEndeDerZone(folge, zonenName) {
  const zustaende = folge.map((e) => e.eingeklappt);
  const erstesEingeklappt = zustaende.indexOf(true);
  if (erstesEingeklappt < 0) return;
  expect(
    zustaende.slice(erstesEingeklappt).every(Boolean),
    `Zone ${zonenName}: eingeklappt sind nicht die letzten Elemente, sondern ${JSON.stringify(folge)}`,
  ).toBe(true);
}

test.describe('SF-01: volle Breite lässt die Leiste unverändert', () => {
  test('kein Menü-Knopf, kein eingeklapptes Element', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      const m = await volleBreite(app, page);
      expect(m.ueberlauf).toBeLessThanOrEqual(0);
      expect(m.eingeklappt).toEqual([]);
      expect(m.knopfLinks).toBe(false);
      expect(m.knopfRechts).toBe(false);
      await expect(page.locator(KNOPF_LINKS)).toBeHidden();
      await expect(page.locator(KNOPF_RECHTS)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-02: bei knappem Platz läuft nichts über den Rand', () => {
  test('an mehreren schmalen Breiten bleibt jedes sichtbare Element in der Leiste', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      for (const breite of [900, 780, 700, 640]) {
        const m = await setzeBreite(app, page, breite);
        expect(m.ueberlauf, `Breite ${breite}: Leiste läuft über`).toBeLessThanOrEqual(0);
        expect(m.ueberRand, `Breite ${breite}: Element über dem rechten Rand`).toEqual([]);
        // Es ist tatsächlich etwas eingeklappt, der Fall prüft also nicht ins
        // Leere.
        expect(m.eingeklappt.length, `Breite ${breite}: nichts eingeklappt`).toBeGreaterThan(0);
        // Und mindestens ein Menü trägt die eingeklappten Elemente.
        expect(m.knopfLinks || m.knopfRechts).toBe(true);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-03: Zonen-Zuordnung der beiden Menüs', () => {
  test('links führt die linke Zone, rechts die rechte und zuletzt die mittlere', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      // Mäßig schmal: beide Seiten-Zonen sind betroffen, die Mitte noch nicht.
      const m = await setzeBreite(app, page, 820);
      expect(m.knopfLinks).toBe(true);
      expect(m.knopfRechts).toBe(true);
      expect(m.zonenFolge.mitte.some((e) => e.eingeklappt)).toBe(false);

      const linkeKennungen = m.zonenFolge.links.filter((e) => e.eingeklappt).map((e) => e.kennung);
      const rechteKennungen = m.zonenFolge.rechts
        .filter((e) => e.eingeklappt)
        .map((e) => e.kennung);
      expect(linkeKennungen.length).toBeGreaterThan(0);

      await page.locator(KNOPF_LINKS).click();
      await expect(page.locator(MENU)).toBeVisible();
      const imLinken = await page.evaluate(() =>
        [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
          (el) => el.dataset.menuId,
        ),
      );
      expect(imLinken).toEqual(linkeKennungen.map((k) => `statusbar-overflow-${k}`));

      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();

      if (rechteKennungen.length > 0) {
        await page.locator(KNOPF_RECHTS).click();
        await expect(page.locator(MENU)).toBeVisible();
        const imRechten = await page.evaluate(() =>
          [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
            (el) => el.dataset.menuId,
          ),
        );
        expect(imRechten).toEqual(rechteKennungen.map((k) => `statusbar-overflow-${k}`));
        await page.keyboard.press('Escape');
        await expect(page.locator(MENU)).toBeHidden();
      }

      // Auch an der schmalsten regulären Breite bleibt die Mitte unberührt,
      // solange die Seiten-Zonen noch Elemente hergeben — das ist die eine
      // Hälfte von E3.
      const schmal = await setzeBreite(app, page, 620);
      expect(schmal.zonenFolge.mitte.some((e) => e.eingeklappt)).toBe(false);
      expect(schmal.zonenFolge.links.some((e) => !e.eingeklappt)).toBe(true);

      // Die andere Hälfte — die Mitte klappt und erscheint im RECHTEN Menü —
      // braucht eine Breite unterhalb der Fenster-Mindestbreite (Begründung am
      // Helfer).
      const eng = await setzeBreiteUnterMindestmass(app, page, 360);
      const mitteEingeklappt = eng.zonenFolge.mitte
        .filter((e) => e.eingeklappt)
        .map((e) => e.kennung);
      expect(mitteEingeklappt.length).toBeGreaterThan(0);
      // Und die Seiten sind dann vollständig geräumt: Die Mitte war zuletzt
      // dran.
      expect(eng.zonenFolge.links.every((e) => e.eingeklappt)).toBe(true);
      expect(eng.zonenFolge.rechts.every((e) => e.eingeklappt)).toBe(true);
      await page.locator(KNOPF_RECHTS).click();
      await expect(page.locator(MENU)).toBeVisible();
      const imRechtenEng = await page.evaluate(() =>
        [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
          (el) => el.dataset.menuId,
        ),
      );
      for (const k of mitteEingeklappt) {
        expect(imRechtenEng).toContain(`statusbar-overflow-${k}`);
      }
      // Und im linken Menü steht keines davon.
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();
      await page.locator(KNOPF_LINKS).click();
      await expect(page.locator(MENU)).toBeVisible();
      const imLinkenEng = await page.evaluate(() =>
        [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
          (el) => el.dataset.menuId,
        ),
      );
      for (const k of mitteEingeklappt) {
        expect(imLinkenEng).not.toContain(`statusbar-overflow-${k}`);
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-04: Abbau in umgekehrter Anzeige-Reihenfolge', () => {
  test('eingeklappt ist immer das Ende der Zone, auch bei geänderter Sortierung', async () => {
    // Zwei Läufe mit verschiedener Panel-Reihenfolge. Geprüft wird nicht eine
    // feste Kennung, sondern die Regel: Was eingeklappt ist, ist das Ende der
    // Anzeige-Reihenfolge — und die Anzeige-Reihenfolge kommt aus der
    // Einstellung.
    const ordnungen = [
      ['bookmarks', 'area', 'book', 'outline'],
      ['outline', 'book', 'area', 'bookmarks'],
    ];
    const gesehen = [];
    for (const ordnung of ordnungen) {
      const userData = seedProfil({ language: 'de', panelToggle: { order: ordnung } });
      const { app, page } = await launchApp({ args: [BASIS], userData });
      try {
        await warteAufReiter(page);
        const m = await setzeBreite(app, page, 780);
        pruefeEndeDerZone(m.zonenFolge.links, 'links');
        pruefeEndeDerZone(m.zonenFolge.rechts, 'rechts');
        pruefeEndeDerZone(m.zonenFolge.mitte, 'mitte');
        gesehen.push({
          folge: m.zonenFolge.links.map((e) => e.kennung),
          eingeklappt: m.zonenFolge.links.filter((e) => e.eingeklappt).map((e) => e.kennung),
        });
      } finally {
        await closeApp(app, userData, { force: true });
      }
    }
    // Die gesetzte Reihenfolge wirkt: Die vier vorangestellten Panel-Buttons
    // stehen in der Leiste in der Reihenfolge der Einstellung.
    expect(gesehen[0].folge.slice(0, 4)).toEqual([
      'btn-bookmarks',
      'btn-area',
      'btn-book',
      'btn-outline',
    ]);
    expect(gesehen[1].folge.slice(0, 4)).toEqual([
      'btn-outline',
      'btn-book',
      'btn-area',
      'btn-bookmarks',
    ]);
    // Beide Läufe klappen etwas ein — sonst prüfte die Regel oben ins Leere.
    expect(gesehen[0].eingeklappt.length).toBeGreaterThan(0);
    expect(gesehen[1].eingeklappt.length).toBeGreaterThan(0);
  });
});

test.describe('SF-05: Meldungs-Bereich und Wort-Statistik', () => {
  test('der Meldungs-Bereich bleibt an jeder Breite sichtbar, die Statistik darf wandern', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      await page.locator(SEL.viewBtn('source')).click();
      for (const breite of [900, 700, 620]) {
        const m = await setzeBreite(app, page, breite);
        expect(m.hinweisEingeklappt, `Breite ${breite}: Meldungs-Bereich eingeklappt`).toBe(false);
        expect(m.eingeklappt).not.toContain('statusbar-hint');
      }
      // Eine echte Meldung erscheint auch an der schmalsten geprüften Breite
      // (Muster B-13 in regression/4t-0904-b11.spec.js: das Kürzel meldet
      // ohne Bearbeiten-Modus den fehlenden Bezug).
      await page.keyboard.press('Control+Alt+KeyA');
      await expect(page.locator('#statusbar-hint')).not.toBeEmpty({ timeout: 5000 });
      await expect(page.locator('#statusbar-hint')).toBeVisible();
      // Die Wort-Statistik darf dagegen ins rechte Menü gewandert sein; hier
      // genügt, dass sie nicht in der Leiste über den Rand steht.
      const m = await messe(page);
      expect(m.ueberRand).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-06: Wirkung und Zustand aus dem Menü heraus', () => {
  test('der Bearbeiten-Schalter wirkt aus dem Menü und zeigt seinen Zustand', async () => {
    // Die Ausblend-Liste räumt die rechte Zone bis auf den Bearbeiten-Schalter
    // leer. Damit ist er das Element, das als erstes ins rechte Menü wandert,
    // und der Fall hängt nicht an einer geratenen Breite.
    const userData = seedProfil({
      language: 'de',
      commandPlacement: {
        statusbar: [],
        contextMenu: [],
        macros: [],
        hiddenButtons: ['right:history', 'right:theme', 'right:language', 'right:wordCount'],
      },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
      await setzeBreite(app, page, 640);
      await expect
        .poll(async () => (await messe(page)).eingeklappt.includes('btn-edit'))
        .toBe(true);

      await expect(page.locator(KNOPF_RECHTS)).toBeVisible();
      await expect(page.locator(KNOPF_RECHTS)).toHaveAttribute('aria-expanded', 'false');
      await page.locator(KNOPF_RECHTS).click();
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(KNOPF_RECHTS)).toHaveAttribute('aria-expanded', 'true');

      // Pull-up: Das Menü liegt über dem Knopf und verdeckt ihn nicht
      // (Befund des Product Owners bei der Abnahme am 2026-09-14); am rechten
      // Knopf schließt es rechtsbündig mit ihm ab.
      const menueBox = await page.locator(MENU).boundingBox();
      const knopfBox = await page.locator(KNOPF_RECHTS).boundingBox();
      expect(menueBox.y + menueBox.height).toBeLessThanOrEqual(knopfBox.y);
      expect(menueBox.x + menueBox.width).toBeLessThanOrEqual(knopfBox.x + knopfBox.width + 1);
      expect(menueBox.y).toBeGreaterThanOrEqual(0);

      const eintrag = page.locator(`${MENU} [data-menu-id="statusbar-overflow-btn-edit"]`);
      await expect(eintrag).toBeVisible();
      // Zustand wie in der Leiste: noch nicht aktiv, also ohne Häkchen.
      await expect(eintrag).not.toHaveClass(/context-menu-item-checked/);
      await eintrag.click();

      // Dieselbe Wirkung wie ein Klick in der Leiste.
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
      await expect(page.locator(MENU)).toBeHidden();
      await expect(page.locator(KNOPF_RECHTS)).toHaveAttribute('aria-expanded', 'false');

      // Und der Zustand steht beim nächsten Öffnen im Menü.
      await page.locator(KNOPF_RECHTS).click();
      await expect(
        page.locator(`${MENU} [data-menu-id="statusbar-overflow-btn-edit"]`),
      ).toHaveClass(/context-menu-item-checked/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-07: Rückkehr beim Verbreitern', () => {
  test('die Elemente kehren zurück und das leere Menü verschwindet', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      const eng = await setzeBreite(app, page, 640);
      expect(eng.eingeklappt.length).toBeGreaterThan(0);

      const mittel = await setzeBreite(app, page, 820);
      // Umgekehrte Reihenfolge: Was zuletzt gewandert ist, kommt zuerst
      // zurück — die verbleibende Menge ist deshalb eine Teilmenge der engen.
      expect(mittel.eingeklappt.length).toBeLessThan(eng.eingeklappt.length);
      for (const k of mittel.eingeklappt) expect(eng.eingeklappt).toContain(k);

      const weit = await volleBreite(app, page);
      expect(weit.eingeklappt).toEqual([]);
      expect(weit.knopfLinks).toBe(false);
      expect(weit.knopfRechts).toBe(false);
      await expect(page.locator(KNOPF_LINKS)).toBeHidden();
      await expect(page.locator(KNOPF_RECHTS)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-08: kein Schwingen im Umbruch-Bereich', () => {
  test('jede Breite hat genau einen Zustand, und er hängt nicht am Weg dorthin', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      const breiten = [1000, 960, 920, 880, 840, 800, 760, 720, 680, 640];
      const hinweg = new Map();
      for (const breite of breiten) {
        const m = await setzeBreite(app, page, breite);
        expect(m.ueberlauf, `Breite ${breite}: Überlauf`).toBeLessThanOrEqual(0);
        hinweg.set(breite, m.eingeklappt.join('|'));
      }
      // Zwischenstation außerhalb der Messreihe, damit der Rückweg nicht mit
      // der Breite beginnt, auf der der Hinweg endete (eine unveränderte
      // Breite wäre kein Breiten-Wechsel und der Warte-Zustand nie erfüllt).
      await setzeBreite(app, page, 1100);
      // Rückweg über dieselben Breiten: Der Zustand ist eine Funktion der
      // Breite, nicht ihres Vorzustands. Genau das ist die Schwing-Freiheit —
      // eine schwingende Leiste käme von oben und von unten auf verschiedene
      // Mengen. Der Ruhe-Nachweis je Breite steckt im Warte-Helfer: Er bricht
      // erst ab, wenn drei aufeinander folgende Messungen dieselbe Menge
      // zeigen.
      for (const breite of [...breiten].reverse()) {
        const m = await setzeBreite(app, page, breite);
        expect(m.eingeklappt.join('|'), `Breite ${breite}: Zustand wegabhängig`).toBe(
          hinweg.get(breite),
        );
      }
      // Monotonie: Je schmaler, desto mehr ist eingeklappt (nie weniger).
      let vorher = -1;
      for (const breite of breiten) {
        const anzahl = hinweg.get(breite).split('|').filter(Boolean).length;
        expect(
          anzahl,
          `Breite ${breite}: weniger eingeklappt als bei größerer Breite`,
        ).toBeGreaterThanOrEqual(vorher);
        vorher = anzahl;
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-09: ausgeblendete Standard-Schaltfläche', () => {
  test('was ausgeblendet ist, erscheint weder in der Leiste noch im Menü', async () => {
    const userData = seedProfil({
      language: 'de',
      commandPlacement: {
        statusbar: [],
        contextMenu: [],
        macros: [],
        hiddenButtons: ['right:theme', 'panel:outline'],
      },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      await expect(page.locator('#btn-theme')).toBeHidden();
      await expect(page.locator('#btn-outline')).toBeHidden();

      const m = await setzeBreite(app, page, 640);
      expect(m.eingeklappt).not.toContain('btn-theme');
      expect(m.eingeklappt).not.toContain('btn-outline');
      expect(m.sichtbar).not.toContain('btn-theme');
      expect(m.sichtbar).not.toContain('btn-outline');

      for (const knopf of [KNOPF_LINKS, KNOPF_RECHTS]) {
        if (!(await page.locator(knopf).isVisible())) continue;
        await page.locator(knopf).click();
        await expect(page.locator(MENU)).toBeVisible();
        const ids = await page.evaluate(() =>
          [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
            (el) => el.dataset.menuId,
          ),
        );
        expect(ids).not.toContain('statusbar-overflow-btn-theme');
        expect(ids).not.toContain('statusbar-overflow-btn-outline');
        await page.keyboard.press('Escape');
        await expect(page.locator(MENU)).toBeHidden();
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-10: anker-gebundenes Popup eines eingeklappten Elements', () => {
  test('das Historie-Menü erscheint am Pull-up-Knopf und nicht in der Fenster-Ecke', async () => {
    // Der Historie-Schalter ist das eine Element der Leiste, dessen Wirkung
    // selbst ein Popup am gemeinsamen Kontextmenü ist. Eingeklappt hat er kein
    // Rechteck; ohne Ausrichtung landete sein Menü an der Fenster-Kante
    // (gemessen: linke obere Ecke mit top = -8) und war oben abgeschnitten.
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      const m = await setzeBreite(app, page, 640);
      expect(m.eingeklappt, 'Historie-Schalter nicht eingeklappt').toContain('btn-history');

      await page.locator(KNOPF_RECHTS).click();
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator(`${MENU} > [data-menu-id="statusbar-overflow-btn-history"]`).click();

      // Gewartet wird auf den Zustand: ein offenes Menü, das nicht mehr die
      // eigenen Einträge trägt — also das fremde Popup der Historie.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const menu = document.getElementById('context-menu');
            if (menu.hidden) return false;
            return !menu.querySelector('[data-menu-id^="statusbar-overflow-"]');
          }),
        )
        .toBe(true);
      const lage = await page.evaluate(() => {
        const menu = document.getElementById('context-menu');
        const r = menu.getBoundingClientRect();
        const leiste = document.querySelector('footer.statusbar').getBoundingClientRect();
        return {
          eintraege: menu.querySelectorAll('.context-menu-item').length,
          links: Math.round(r.left),
          oben: Math.round(r.top),
          rechts: Math.round(r.right),
          unten: Math.round(r.bottom),
          fensterBreite: window.innerWidth,
          fensterHoehe: window.innerHeight,
          leisteOben: Math.round(leiste.top),
        };
      });

      // Das Popup trägt Inhalt (Wirkung vollständig) ...
      expect(lage.eintraege).toBeGreaterThan(0);
      // ... liegt vollständig im Fenster (das war der Mangel: oben
      // abgeschnitten) ...
      expect(lage.links, 'linke Kante außerhalb').toBeGreaterThanOrEqual(0);
      expect(lage.oben, 'obere Kante außerhalb').toBeGreaterThanOrEqual(0);
      expect(lage.rechts, 'rechte Kante außerhalb').toBeLessThanOrEqual(lage.fensterBreite);
      expect(lage.unten, 'untere Kante außerhalb').toBeLessThanOrEqual(lage.fensterHoehe);
      // ... und steht bei der Leiste, nicht am oberen Fensterrand. Geprüft
      // wird das Verhältnis, nicht eine Pixel-Zahl: Die Unterkante des Popups
      // liegt unterhalb der halben Fensterhöhe, also im Bereich der Leiste.
      expect(lage.unten, 'Popup nicht im Bereich der Leiste').toBeGreaterThan(
        lage.fensterHoehe / 2,
      );
      // Und rechts, wo der Pull-up-Knopf sitzt.
      expect(lage.rechts, 'Popup nicht am rechten Rand').toBeGreaterThan(lage.fensterBreite / 2);
      expect(lage.leisteOben).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- 4T-001580: die Einstellung mit ihren beiden Werten --------------------------

// Öffnet die Einstellungs-Seite über Strg+, — mit Poll, weil der
// Kommando-Dispatcher erst am Ende der asynchronen init() registriert ist
// (Muster openSettingsPageViaKeyboard in einstellungen-seite.spec.js);
// Mehrfach-Druck ist durch die Einfach-Instanz der Seite gedeckt.
async function oeffneEinstellungen(page) {
  await oeffneEinstellungsSeite(page);
}

// Wartet auf die zur Ruhe gekommene Leiste ohne Breiten-Wechsel: drei
// aufeinander folgende Messungen mit derselben eingeklappten Menge. Gebraucht
// wird das nach einer Änderung der EINSTELLUNG — dort ändert sich die Breite
// gerade nicht, `warteAufRuhe` mit seiner Breiten-Bedingung passt also nicht.
async function warteAufRuheOhneBreitenwechsel(page, pruefung) {
  let letzte = null;
  let stabil = 0;
  await expect
    .poll(async () => {
      const m = await messe(page);
      if (!pruefung(m)) {
        letzte = null;
        stabil = 0;
        return 0;
      }
      const jetzt = m.eingeklappt.join('|');
      stabil = jetzt === letzte ? stabil + 1 : 0;
      letzte = jetzt;
      return stabil;
    })
    .toBeGreaterThanOrEqual(2);
  return messe(page);
}

test.describe('SF-11: Abschnitt „Statusleiste" mit der Falt-Einstellung', () => {
  test('führt genau zwei Werte, steht auf «automatisch» und wirkt ohne Neustart', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      // Breiteste Lage: Ohne Einstellung ist bei voller Breite nichts
      // eingeklappt — so ist die Wirkung des zweiten Wertes eindeutig.
      const vorher = await volleBreite(app, page);
      expect(vorher.eingeklappt).toEqual([]);

      await oeffneEinstellungen(page);
      // Der Abschnitt liegt in der Navigations-Gruppe „Allgemein" (E4 des
      // Epics); seine Position innerhalb der Gruppe ist bewusst nicht
      // festgeschrieben, sie hängt an der Entscheidung zu 4T-001581.
      await expect(page.locator(NAV_STATUSLEISTE)).toBeVisible();
      await page.locator(NAV_STATUSLEISTE).click();
      await expect(page.locator(`${EINSTELLUNGEN_SEITE} .settings-section-heading`)).toHaveText(
        'Statusleiste',
      );

      // Genau zwei Werte, jeder mit einer Beschriftung, und ein Hinweis.
      const feld = page.locator(FALT_MODUS_FELD);
      await expect(feld).toBeVisible();
      const werte = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return [...el.options].map((o) => ({ wert: o.value, text: (o.textContent || '').trim() }));
      }, FALT_MODUS_FELD);
      expect(werte.map((w) => w.wert)).toEqual(['auto', 'always']);
      for (const w of werte) expect(w.text, `Wert ${w.wert} ohne Beschriftung`).not.toBe('');
      await expect(feld).toHaveValue('auto');
      // 4T-001765 (Epic 3E-000186): Der Abschnitt trägt seither zwei Hinweise
      // — die Zeile spricht deshalb den eigenen über seine Kennung an statt
      // über die Klasse, die beide teilen.
      const hinweis = page.locator(`${FALT_MODUS_FELD}-hint`);
      await expect(hinweis).toBeVisible();
      await expect(hinweis).not.toBeEmpty();

      // Umstellen und mit OK anwenden: Die Leiste klappt im laufenden Fenster
      // zusammen, ohne Neustart.
      await feld.selectOption('always');
      await expect(page.locator('#btn-settings-ok')).toBeVisible();
      await page.locator('#btn-settings-ok').click();
      // OK wendet an und schließt den Reiter; das Seiten-DOM bleibt als
      // verborgene System-Ansicht stehen (Muster ES-09 in
      // einstellungen-seite.spec.js, das ebenfalls auf «verborgen» prüft).
      await expect(page.locator(EINSTELLUNGEN_SEITE)).toBeHidden();

      const nachher = await warteAufRuheOhneBreitenwechsel(
        page,
        (m) => m.knopfLinks && m.knopfRechts && m.sichtbar.length === 0,
      );
      expect(nachher.sichtbar).toEqual([]);
      expect(nachher.eingeklappt.length).toBeGreaterThan(0);
      expect(nachher.ueberRand).toEqual([]);
      await expect(page.locator(KNOPF_LINKS)).toBeVisible();
      await expect(page.locator(KNOPF_RECHTS)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-12: «immer zusammengeklappt» bei voller Breite', () => {
  test('die Menüs tragen die Schaltflächen unabhängig von der Breite', async () => {
    const userData = seedProfil({ language: 'de', statusbar: { collapseMode: 'always' } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      const m = await volleBreite(app, page);
      // Breiteste mögliche Lage — und trotzdem ist die Leiste leer geräumt.
      expect(m.sichtbar).toEqual([]);
      expect(m.eingeklappt.length).toBeGreaterThan(0);
      expect(m.ueberlauf).toBeLessThanOrEqual(0);
      expect(m.knopfLinks).toBe(true);
      expect(m.knopfRechts).toBe(true);

      // Jede Zone ist vollständig eingeklappt, und beide Menüs tragen Einträge.
      for (const zone of ['links', 'mitte', 'rechts']) {
        expect(
          m.zonenFolge[zone].every((e) => e.eingeklappt),
          `Zone ${zone} nicht vollständig eingeklappt`,
        ).toBe(true);
      }
      for (const knopf of [KNOPF_LINKS, KNOPF_RECHTS]) {
        await expect(page.locator(knopf)).toBeVisible();
        await page.locator(knopf).click();
        await expect(page.locator(MENU)).toBeVisible();
        const ids = await page.evaluate(() =>
          [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
            (el) => el.dataset.menuId,
          ),
        );
        expect(ids.length, `Menü ${knopf} ohne Einträge`).toBeGreaterThan(0);
        for (const id of ids) expect(id).toMatch(/^statusbar-overflow-/);
        await page.keyboard.press('Escape');
        await expect(page.locator(MENU)).toBeHidden();
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SF-13: Meldungs-Bereich bei «immer zusammengeklappt»', () => {
  test('er bleibt sichtbar und zeigt auch in diesem Zustand eine Meldung', async () => {
    const userData = seedProfil({ language: 'de', statusbar: { collapseMode: 'always' } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      const m = await volleBreite(app, page);
      // E5: Der Meldungs-Bereich ist nie Kandidat der Faltung — auch nicht,
      // wenn jede Schaltfläche der Leiste eingeklappt ist.
      expect(m.sichtbar).toEqual([]);
      expect(m.hinweisEingeklappt).toBe(false);
      expect(m.eingeklappt).not.toContain('statusbar-hint');
      // Ohne Meldung ist der Bereich ein leerer, absolut liegender `span` ohne
      // Fläche — er ist deshalb «attached», aber nicht «visible» (Muster
      // SF-05, das die Sichtbarkeit ebenfalls erst mit Inhalt prüft).
      await expect(page.locator('#statusbar-hint')).toBeAttached();
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/sb-collapsed/);

      // Und eine echte Meldung erscheint (Muster SF-05: das Kürzel meldet ohne
      // Bearbeiten-Modus den fehlenden Bezug).
      await page.keyboard.press('Control+Alt+KeyA');
      await expect(page.locator('#statusbar-hint')).not.toBeEmpty({ timeout: 5000 });
      await expect(page.locator('#statusbar-hint')).toBeVisible();
      const danach = await messe(page);
      expect(danach.hinweisEingeklappt).toBe(false);
      expect(danach.ueberRand).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
