// 4T-001765 (Epic 3E-000186): E2E-Funktions-Suite — Darstellung nicht
// aktivierbarer Schalter der Statusleiste. Kürzel SD- (Schalter-Darstellung).
//
// SD-01 die Auswahl im Abschnitt „Statusleiste" samt Werte-Liste, Vorgabewert
// und Wirkung ohne Neustart (AK3), SD-02 der Wert «blass anzeigen» je Zone:
// vorhanden, stillgelegt, ohne Wirkung auf Klick (AK4), SD-03 der Wert
// «ausblenden» je Zone samt Rückkehr, sobald der Schalter wieder aktivierbar
// ist (AK5), SD-04 das Zusammenspiel mit der Faltung: ein ausgeblendeter
// Schalter erscheint auch im Pull-up-Menü nicht (AK6), SD-05 der Vorrang der
// Ausblend-Liste und das unveränderte erweiterungs-bedingte Verschwinden
// (AK7), SD-06 das unveränderte Ansichtsmenü in beiden Werten (AK8, E4 des
// Epics).
//
// Eigene Spec statt weiterer SF-Fälle in `statusleisten-faltung.spec.js`: Dort
// geht es um die Antwort der Leiste auf ihre eigene BREITE, hier um ihre
// Antwort auf den Zustand des Dokuments; die Mess- und Warte-Helfer jener
// Datei braucht hier keiner, und sie liegt zudem am Größen-Budget für
// Prüfdateien. AK1, AK2 und der Vorgabewert im unberührten
// Auslieferungs-Zustand liegen als Unit-Fälle in
// `test/unit/renderer/statusleisten-schalter-darstellung.test.js` bzw.
// `test/unit/command-availability.test.js`; zwei offene Fenster und der
// Neustart der gebauten Programmdatei sind manuelle Handgriffe.
//
// **Wie die Zustände hergestellt werden — ohne Kunstgriff, aus dem Bestand:**
// Ein frisch geöffnetes Dokument steht in der Leseansicht, und dort sind die
// drei Editor-Schalter (Umbruch, Zeilennummern, Gliederung) nicht aktivierbar;
// liegt die Einstellungs-Seite vorn, sind es die sechs Ansichts-Schalter, der
// Stift und die Dokument-Historie. Beide Lagen entstehen mit einem Klick und
// kehren mit einem Klick zurück.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');
const DE = require('../../../src/i18n/de.json');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

const MENU = '#context-menu';
const KNOPF_LINKS = '#btn-statusbar-collapse-left';
const KNOPF_RECHTS = '#btn-statusbar-collapse-right';

const EINSTELLUNGEN_SEITE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const NAV_STATUSLEISTE = `${EINSTELLUNGEN_SEITE} .settings-nav-entry[data-section-id="statusbar"]`;
const FELD = '#settings-statusbar-unavailable-mode';

// Die zwölf Schalter der Ziel-Liste, in Leisten-Reihenfolge, dazu ein
// Panel-Schalter und die Sprach-Wahl als Gegenprobe (sie kennen den Zustand
// «nicht aktivierbar» nicht und dürfen sich in keinem Wert bewegen).
const MITTE_EDITOR = ['btn-fold-gutter', 'btn-numbers', 'btn-wrap'];
const MITTE_ANSICHT = ['live', 'source', 'split', 'rendered', 'mindmap', 'canvas'].map(
  (a) => `view:${a}`,
);
const RECHTS = ['btn-edit', 'btn-scroll-sync', 'btn-history'];
const UNBETEILIGT = ['btn-outline', 'lang-select'];
const ALLE = [...MITTE_EDITOR, ...MITTE_ANSICHT, ...RECHTS, ...UNBETEILIGT];

function seedProfil(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sd-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Zustand der Leiste in einem Durchgang im Fenster erhoben: je Schalter, ob er
// im DOM steht, ob er Fläche hat, ob er stillgelegt ist und welche der drei
// Sichtbarkeits-Klassen er trägt. Dazu die Reihenfolge der sichtbaren
// Elemente je Zone — AK6 der Story verlangt die Rückkehr an denselben Platz.
function messung(kennungen) {
  const finde = (k) =>
    k.startsWith('view:')
      ? document.querySelector(`.view-toggle .view-btn[data-view="${k.slice(5)}"]`)
      : document.getElementById(k);
  const schalter = {};
  for (const k of kennungen) {
    const el = finde(k);
    schalter[k] = {
      da: !!el,
      sichtbar: !!el && el.getClientRects().length > 0,
      stillgelegt: !!el && el.disabled === true,
      versteckt: !!el && el.classList.contains('sb-unavailable-hidden'),
      nutzerVersteckt: !!el && el.classList.contains('sb-user-hidden'),
      eingeklappt: !!el && el.classList.contains('sb-collapsed'),
      hiddenAttribut: !!el && el.hidden === true,
    };
  }
  const folge = (sel) =>
    [...document.querySelectorAll(`${sel} button, ${sel} select`)]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.id || (el.dataset.view ? `view:${el.dataset.view}` : el.tagName));
  return {
    schalter,
    folge: {
      mitte: folge('.statusbar-center'),
      rechts: folge('.statusbar-right'),
      links: folge('.statusbar-left'),
    },
    aktiveAnsichten: [...document.querySelectorAll('.view-toggle .view-btn.active')].map(
      (el) => el.dataset.view,
    ),
  };
}

async function messe(page, kennungen = ALLE) {
  return page.evaluate(messung, kennungen);
}

async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Öffnet die Einstellungs-Seite über Strg+, (Muster oeffneEinstellungen in
// statusleisten-faltung.spec.js — gepollt, weil der Kommando-Dispatcher erst
// am Ende der asynchronen init() registriert ist).
async function oeffneEinstellungen(page) {
  await oeffneEinstellungsSeite(page);
}

// Wählt im Abschnitt „Statusleiste" den Wert und wendet mit OK an.
async function setzeWert(page, wert) {
  await page.locator(NAV_STATUSLEISTE).click();
  await page.locator(FELD).selectOption(wert);
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(EINSTELLUNGEN_SEITE)).toBeHidden();
}

// Wartet auf den Zustand eines Schalters, statt auf eine Zeit: Die Klasse
// wird im selben Durchgang wie `disabled` gesetzt, die Faltung rechnet danach
// aber im nächsten Bild neu.
async function warteAufVersteckt(page, kennung, erwartet) {
  await expect
    .poll(async () => (await messe(page, [kennung])).schalter[kennung].versteckt)
    .toBe(erwartet);
}

test.describe('SD-01: die Auswahl im Abschnitt „Statusleiste"', () => {
  test('genau zwei Werte, Vorgabe «blass anzeigen», Wirkung ohne Neustart', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      // Ausgangslage: Leseansicht, die drei Editor-Schalter sind stillgelegt
      // und stehen blass an ihrem Platz — das heutige Verhalten.
      const vorher = await messe(page);
      for (const k of MITTE_EDITOR) {
        expect(vorher.schalter[k].stillgelegt, k).toBe(true);
        expect(vorher.schalter[k].sichtbar, k).toBe(true);
        expect(vorher.schalter[k].versteckt, k).toBe(false);
      }

      await oeffneEinstellungen(page);
      await page.locator(NAV_STATUSLEISTE).click();
      await expect(page.locator(`${EINSTELLUNGEN_SEITE} .settings-section-heading`)).toHaveText(
        'Statusleiste',
      );

      // Genau zwei Werte, jeder mit Beschriftung, dazu die Kurz-Erläuterung.
      const feld = page.locator(FELD);
      await expect(feld).toBeVisible();
      const werte = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return [...el.options].map((o) => ({ wert: o.value, text: (o.textContent || '').trim() }));
      }, FELD);
      expect(werte.map((w) => w.wert)).toEqual(['blass', 'ausgeblendet']);
      for (const w of werte) expect(w.text, `Wert ${w.wert} ohne Beschriftung`).not.toBe('');
      await expect(feld).toHaveValue('blass');
      const hinweis = page.locator(`${FELD}-hint`);
      await expect(hinweis).toBeVisible();
      await expect(hinweis).not.toBeEmpty();
      // Die Zeile trägt ihre eigene Beschriftung und steht neben dem
      // Zusammenklappen, nicht an seiner Stelle.
      await expect(page.locator('#settings-statusbar-collapse-mode')).toBeVisible();

      // Umstellen und anwenden: Die Wirkung tritt im laufenden Fenster ein.
      await setzeWert(page, 'ausgeblendet');
      for (const k of MITTE_EDITOR) await warteAufVersteckt(page, k, true);
      const nachher = await messe(page);
      for (const k of MITTE_EDITOR) {
        expect(nachher.schalter[k].da, k).toBe(true);
        expect(nachher.schalter[k].sichtbar, k).toBe(false);
      }
      // Und die Wahl ist gespeichert: Die Einstellungs-Seite zeigt sie wieder.
      await oeffneEinstellungen(page);
      await page.locator(NAV_STATUSLEISTE).click();
      await expect(page.locator(FELD)).toHaveValue('ausgeblendet');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SD-02: Wert «blass anzeigen» — der Bestand bleibt', () => {
  test('je Zone vorhanden, stillgelegt und ohne Wirkung auf Klick', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufReiter(page);
      const reiterVorher = await page.locator(SEL.tabs0).count();
      await oeffneEinstellungen(page);

      // Mit der Einstellungs-Seite vorn sind die sechs Ansichts-Schalter, der
      // Stift und die Dokument-Historie nicht aktivierbar — alle drei
      // betroffenen Gruppen in einer Lage.
      const m = await messe(page);
      for (const k of [...MITTE_ANSICHT, ...MITTE_EDITOR, 'btn-edit', 'btn-history']) {
        // Die Arbeitsfläche steht nur bei eingeschalteter Erweiterung in der
        // Leiste; ist sie da, gilt für sie dasselbe.
        if (!m.schalter[k].da || m.schalter[k].hiddenAttribut) continue;
        expect(m.schalter[k].stillgelegt, k).toBe(true);
        expect(m.schalter[k].sichtbar, `${k} nicht sichtbar`).toBe(true);
        expect(m.schalter[k].versteckt, `${k} trägt die Ausblend-Klasse`).toBe(false);
      }
      // Der Bildlauf-Gleichlauf hängt allein an einem geöffneten Reiter und
      // bleibt deshalb bedienbar — Bestand, hier nur festgehalten.
      expect(m.schalter['btn-scroll-sync'].stillgelegt).toBe(false);

      // Klick ohne Wirkung: `force`, weil Playwright einen stillgelegten
      // Schalter sonst nicht anklickt — geprüft wird ja gerade, dass der
      // Klick nichts tut.
      await page.locator('.view-toggle .view-btn[data-view="source"]').click({ force: true });
      await page.locator('#btn-history').click({ force: true });
      await page.locator('#btn-edit').click({ force: true });
      await expect(page.locator(EINSTELLUNGEN_SEITE)).toBeVisible();
      const danach = await messe(page);
      expect(danach.aktiveAnsichten, 'ein stillgelegter Schalter hat geschaltet').toEqual(
        m.aktiveAnsichten,
      );
      // Die Historie hätte eine System-Seite geöffnet, der Stift den
      // Bearbeitungs-Modus umgeschaltet: Beides ist am Reiter-Bestand
      // messbar.
      expect(await page.locator(SEL.tabs0).count()).toBe(reiterVorher + 1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SD-03: Wert «ausblenden» — weg, solange es nicht geht', () => {
  test('je Zone verschwunden, und zurück an seinem Platz, sobald es wieder geht', async () => {
    const userData = seedProfil({ language: 'de', statusbar: { unavailableMode: 'ausgeblendet' } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);

      // Mittlere Zone: Leseansicht — die drei Editor-Schalter sind weg, die
      // Ansichts-Schalter bleiben, und die übrigen Elemente behalten ihre
      // Reihenfolge.
      await warteAufVersteckt(page, 'btn-wrap', true);
      const leseansicht = await messe(page);
      for (const k of MITTE_EDITOR) {
        expect(leseansicht.schalter[k].versteckt, k).toBe(true);
        expect(leseansicht.schalter[k].sichtbar, k).toBe(false);
        expect(leseansicht.folge.mitte, k).not.toContain(k);
      }
      for (const k of ['view:live', 'view:source', 'view:split', 'view:rendered']) {
        expect(leseansicht.schalter[k].sichtbar, k).toBe(true);
      }
      for (const k of RECHTS) expect(leseansicht.schalter[k].sichtbar, k).toBe(true);
      for (const k of UNBETEILIGT) expect(leseansicht.schalter[k].sichtbar, k).toBe(true);

      // Rückkehr an denselben Platz: Quelltext-Ansicht wählen.
      await page.locator('.view-toggle .view-btn[data-view="source"]').click();
      await warteAufVersteckt(page, 'btn-wrap', false);
      const quelltext = await messe(page);
      for (const k of MITTE_EDITOR) {
        expect(quelltext.schalter[k].sichtbar, k).toBe(true);
        expect(quelltext.schalter[k].stillgelegt, k).toBe(false);
      }
      // Die Reihenfolge der Zone ist die des Bestands: die drei
      // Editor-Schalter vor den Ansichts-Schaltern.
      const sichtbareAnsichten = MITTE_ANSICHT.filter((k) => quelltext.schalter[k].sichtbar);
      expect(quelltext.folge.mitte).toEqual([...MITTE_EDITOR, ...sichtbareAnsichten]);

      // Rechte Zone und Ansichts-Schalter: Einstellungs-Seite vorn.
      await oeffneEinstellungen(page);
      await warteAufVersteckt(page, 'btn-edit', true);
      const system = await messe(page);
      for (const k of [...MITTE_ANSICHT, 'btn-edit', 'btn-history']) {
        if (!system.schalter[k].da || system.schalter[k].hiddenAttribut) continue;
        expect(system.schalter[k].sichtbar, k).toBe(false);
        expect(system.folge.rechts, k).not.toContain(k);
      }
      expect(system.schalter['btn-scroll-sync'].sichtbar).toBe(true);
      // Die linke Zone ist unberührt — die Panel-Schalter kennen den Zustand
      // nicht (E5 des Epics).
      expect(system.folge.links).toEqual(leseansicht.folge.links);

      // Und zurück auf das Dokument: alles wieder da, in derselben Folge.
      await page.locator(SEL.tabs0).first().click();
      await warteAufVersteckt(page, 'btn-edit', false);
      const zurueck = await messe(page);
      expect(zurueck.folge.rechts).toEqual(quelltext.folge.rechts);
      expect(zurueck.folge.mitte).toEqual(quelltext.folge.mitte);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SD-04: Zusammenspiel mit der Faltung', () => {
  test('ein ausgeblendeter Schalter erscheint auch im Pull-up-Menü nicht', async () => {
    // Beide Einstellungen zusammen: «immer zusammengeklappt» räumt die Leiste
    // unabhängig von der Breite in die beiden Menüs (SF-12), «ausblenden»
    // nimmt die nicht aktivierbaren Schalter heraus. Damit hängt der Fall an
    // keiner Fensterbreite.
    const userData = seedProfil({
      language: 'de',
      statusbar: { collapseMode: 'always', unavailableMode: 'ausgeblendet' },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      await warteAufVersteckt(page, 'btn-wrap', true);

      const eintraege = [];
      for (const knopf of [KNOPF_LINKS, KNOPF_RECHTS]) {
        await expect(page.locator(knopf)).toBeVisible();
        await page.locator(knopf).click();
        await expect(page.locator(MENU)).toBeVisible();
        eintraege.push(
          ...(await page.evaluate(() =>
            [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
              (el) => el.dataset.menuId,
            ),
          )),
        );
        await page.keyboard.press('Escape');
        await expect(page.locator(MENU)).toBeHidden();
      }

      // Kein ausgeblendeter Schalter im Menü ...
      for (const k of MITTE_EDITOR) {
        expect(eintraege, `${k} steht im Pull-up-Menü`).not.toContain(`statusbar-overflow-${k}`);
      }
      // ... und die Menüs sind trotzdem gefüllt: Was aktivierbar ist, wandert
      // wie bisher hinein (sonst wäre der Fall auch bei leerem Menü grün).
      expect(eintraege.length).toBeGreaterThan(0);
      expect(eintraege).toContain('statusbar-overflow-btn-edit');
      for (const id of eintraege) expect(id).toMatch(/^statusbar-overflow-/);

      // Gegenprobe im Zustand, in dem die drei Schalter aktivierbar sind:
      // Dann stehen sie im Menü — die Messung rechnet also wirklich mit der
      // jeweils gültigen Menge und schließt sie nicht dauerhaft aus.
      await page.locator(KNOPF_RECHTS).click();
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator('#context-menu [data-menu-id="statusbar-overflow-view:source"]').click();
      await warteAufVersteckt(page, 'btn-wrap', false);
      await page.locator(KNOPF_RECHTS).click();
      await expect(page.locator(MENU)).toBeVisible();
      const jetzt = await page.evaluate(() =>
        [...document.querySelectorAll('#context-menu > .context-menu-item')].map(
          (el) => el.dataset.menuId,
        ),
      );
      expect(jetzt).toContain('statusbar-overflow-btn-wrap');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SD-05: Vorrang der Ausblend-Liste, Erweiterungen unberührt', () => {
  test('eine abgewählte Schaltfläche bleibt in beiden Werten weg', async () => {
    const userData = seedProfil({
      language: 'de',
      commandPlacement: { hiddenButtons: ['right:edit'] },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      // Wert «blass anzeigen» (Vorgabe): Der Stift ist am offenen Dokument
      // aktivierbar und trotzdem weg — die Ausblend-Liste wirkt vor der Wahl.
      const blass = await messe(page, ['btn-edit', 'btn-history']);
      expect(blass.schalter['btn-edit'].da).toBe(true);
      expect(blass.schalter['btn-edit'].nutzerVersteckt).toBe(true);
      expect(blass.schalter['btn-edit'].sichtbar).toBe(false);
      expect(blass.schalter['btn-edit'].stillgelegt).toBe(false);
      expect(blass.schalter['btn-edit'].versteckt).toBe(false);
      expect(blass.schalter['btn-history'].sichtbar).toBe(true);

      // Und im Wert «ausblenden» ebenso: Er bleibt weg, und die Klasse der
      // Ausblend-Liste bleibt die, die ihn wegnimmt.
      await oeffneEinstellungen(page);
      await setzeWert(page, 'ausgeblendet');
      await warteAufReiter(page);
      const versteckt = await messe(page, ['btn-edit']);
      expect(versteckt.schalter['btn-edit'].nutzerVersteckt).toBe(true);
      expect(versteckt.schalter['btn-edit'].sichtbar).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('das erweiterungs-bedingte Verschwinden bleibt, wie es ist', async () => {
    const userData = seedProfil({
      language: 'de',
      statusbar: { unavailableMode: 'ausgeblendet' },
      extensions: { disabled: ['mindmap'] },
    });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await warteAufReiter(page);
      const m = await messe(page, ['view:mindmap', 'view:source']);
      // Der Schalter der abgeschalteten Erweiterung ist über das
      // `hidden`-Attribut weg und nicht über die neue Klasse: «gibt es nicht»
      // bleibt von «geht gerade nicht» getrennt.
      expect(m.schalter['view:mindmap'].da).toBe(true);
      expect(m.schalter['view:mindmap'].hiddenAttribut).toBe(true);
      expect(m.schalter['view:mindmap'].sichtbar).toBe(false);
      expect(m.schalter['view:source'].sichtbar).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- SD-06: das Ansichtsmenü bleibt unverändert (E4 des Epics) -----------------

// Menü-Inspektion über den setMenu-Interceptor (Muster armPanelMenuCapture in
// panel-zugänge.spec.js — Menu.getApplicationMenu() ist leer, die App setzt
// Fenster-Menüs über win.setMenu). Erfasst wird der ganze Teilbaum des
// Ansichtsmenüs mit Beschriftung und Freigabe-Zustand je Eintrag.
async function armeMenueAufnahme(app) {
  // Erkannt wird das Ansichtsmenü an seinem Inhalt und nicht an seiner
  // Beschriftung: Die trägt das Tastatur-Kürzel-Zeichen («&Ansicht»), und
  // darauf soll der Fall nicht angewiesen sein.
  await app.evaluate(({ BrowserWindow }, merkmal) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__sdMenuArmed) return;
    win.__sdMenuArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const sammle = (items) => {
        const out = [];
        for (const it of items || []) {
          out.push({ label: it.label || '', enabled: it.enabled !== false });
          if (it.submenu) out.push(...sammle(it.submenu.items || []));
        }
        return out;
      };
      for (const top of (menu ? menu.items : []) || []) {
        const eintraege = sammle(top.submenu ? top.submenu.items : []);
        if (!eintraege.some((e) => e.label === merkmal)) continue;
        globalThis.__sdMenu = eintraege;
        break;
      }
      return orig(menu);
    };
  }, DE['menu.view.source']);
}

async function menueNeubau(app) {
  await expect
    .poll(async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('menu:togglePanel', 'notes');
          win.webContents.send('menu:togglePanel', 'notes');
        }
      });
      const eintraege = await app.evaluate(() => globalThis.__sdMenu || []);
      return eintraege.length;
    })
    .toBeGreaterThan(0);
  return app.evaluate(() => globalThis.__sdMenu || []);
}

test.describe('SD-06: das Ansichtsmenü ist in beiden Werten unverändert', () => {
  test('die Einträge stehen da und sind blass, statt zu verschwinden', async () => {
    const userData = seedProfil({ language: 'de', statusbar: { unavailableMode: 'ausgeblendet' } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    // Die Beschriftungen der betroffenen Einträge aus der Sprachdatei — die
    // Kennungen der Kommandos stehen im Menü nicht.
    const betroffen = [
      'menu.view.rendered',
      'menu.view.split',
      'menu.view.source',
      'menu.view.live',
      'menu.view.edit',
      'menu.view.history',
      'menu.view.wordWrap',
      'menu.view.lineNumbers',
      'menu.view.foldGutter',
    ].map((k) => DE[k]);
    try {
      await warteAufReiter(page);
      await armeMenueAufnahme(app);
      await oeffneEinstellungen(page);
      await warteAufVersteckt(page, 'btn-edit', true);

      // Wert «ausblenden», Einstellungs-Seite vorn: In der Leiste sind die
      // Schalter weg — im Menü stehen ihre Einträge weiter da.
      const menue = await menueNeubau(app);
      const labels = menue.map((e) => e.label);
      for (const label of betroffen) {
        expect(labels, `Eintrag «${label}» fehlt im Ansichtsmenü`).toContain(label);
      }
      // Und sie sind dort blass, nicht bedienbar — die Trennung «gibt es
      // nicht» gegen «geht gerade nicht» bleibt am Menü erhalten.
      for (const label of [DE['menu.view.source'], DE['menu.view.edit']]) {
        const eintrag = menue.find((e) => e.label === label);
        expect(eintrag.enabled, `«${label}» ist auf der System-Seite freigegeben`).toBe(false);
      }

      // Derselbe Blick im Wert «blass anzeigen»: unverändert.
      await setzeWert(page, 'blass');
      await oeffneEinstellungen(page);
      const menue2 = await menueNeubau(app);
      const labels2 = menue2.map((e) => e.label);
      for (const label of betroffen) {
        expect(labels2, `Eintrag «${label}» fehlt im Wert «blass»`).toContain(label);
      }
      expect(labels2).toEqual(labels);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
