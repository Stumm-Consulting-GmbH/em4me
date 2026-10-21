// 4T-002227 (Epic 3E-000356, Story 4S-000028): Ablauf-Prüfungen der Seite
// «Arbeitsbereiche», die das Pop-up «Arbeitsbereiche verwalten» ablöst.
//
// Die Bestands-Fälle der Verwaltung (WS-05 bis WS-08: Aus-Zustand, kleines
// Fenster über der Seite, Pfad-Zeile, Reihenfolge samt Tastatur) stehen weiter
// in arbeitsbereiche.spec.js und sind dort auf die Seite umgestellt. Hier
// stehen die Zusagen, die erst mit der Seite entstehen:
//
// WS-09: Menüpunkt und Kommando öffnen die Seite als Reiter «Arbeitsbereiche»,
//        kein Pop-up; ein zweites Öffnen aktiviert dieselbe Seite; sie trägt
//        keine Schaltflächen-Leiste und kehrt nach einem Neustart nicht
//        zurück (AK1, AK6).
// WS-10: Angaben je Zeile, der lange Name bei 1280 Bildpunkten ungekürzt und
//        einzeilig, solange seine Zelle dafür breit genug ist, sonst umbrochen
//        (AK2, Story-AK21). Die nötige Breite hängt an der Schrift des Systems
//        (unter Linux DejaVu Sans, rund ein Viertel breiter als Segoe UI);
//        dass sie bei 1280 reicht, ist allein unter Windows zugesichert
//        (4T-002337).
// WS-11: Öffnen und Löschen über die Schaltflächen der Seite, die Rückfrage
//        mit Vorbelegung Abbruch (AK3); nach dem letzten Löschen der Hinweis
//        der leeren Liste (AK8).
// WS-12: Änderungen aus einem zweiten Fenster erscheinen ohne erneutes Öffnen
//        (AK5).
// WS-13: Kleinste Fensterbreite, mit und ohne Seitenleiste: nichts ragt über
//        den Rand, kein waagrechtes Rollen, Schaltflächen unter dem Text (AK7);
//        die Fensterbreite darf bei Anzeige-Skalierung um bis zu zwei
//        Bildpunkte über der Mindestbreite liegen (4T-002337).
// WS-14: Dreißig Arbeitsbereiche: senkrechtes Rollen, der letzte Eintrag
//        erreichbar (AK8).
//
// Native Rückfragen des Hauptprozesses sind per Playwright nicht bedienbar;
// WS-11 ersetzt `dialog.showMessageBox` zur Laufzeit (Muster stubCancelDialog in
// entwurfs-zwischenspeicher.spec.js) und hält fest, mit welcher Vorbelegung die
// Rückfrage gestellt wurde.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufDateiArgument } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const {
  SEITE,
  oeffneArbeitsbereicheSeite,
  paletteTreffer,
} = require('../helpers/arbeitsbereiche-seite');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// Ein Name von mehr als 40 Zeichen und ein tief verschachtelter Ordner: die
// beiden Ränder, an denen das Pop-up kürzte.
const LANGER_NAME = 'Kundenprojekt Stadtwerke Nordheide – Netzausbau 2027 und Förderanträge';

function makeLongAreaDir() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ws-seite-'));
  const dir = path.join(
    basis,
    'Kunden',
    'Stadtwerke-Nordheide',
    'Netzausbau-2027',
    'Arbeitsunterlagen-und-Foerderantraege-des-Jahres',
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n\nInhalt.\n', 'utf8');
  return { basis, dir };
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

// Weiteren Arbeitsbereich mit eigenem Fenster anlegen und auf dessen Laden
// warten (Muster WS-07).
async function legeAn(app, page, name, color) {
  const winPromise = app.waitForEvent('window');
  const ergebnis = await page.evaluate((a) => window.api.workspaceCreate(a), { name, color });
  expect(ergebnis.ok).toBe(true);
  const neu = await winPromise;
  await neu.waitForLoadState('domcontentloaded');
  return neu;
}

// Fenstergröße setzen und warten, bis die Anzeige sie übernommen hat. Bei
// einer Anzeige-Skalierung wie 125 % rechnet Windows die Breite über
// Geräte-Bildpunkte zurück und rundet dabei um bis zu einen Bildpunkt auf
// (setSize 600 ergibt 601); verlangt ist deshalb eine Breite von höchstens
// zwei Bildpunkten über der gesetzten, nie darunter (4T-002337).
async function setzeFenster(app, page, breite) {
  const fenster = await app.browserWindow(page);
  await hauptSenden(fenster, (w, b) => w.setSize(b, 800), breite);
  await expect
    .poll(async () => {
      const ist = await page.evaluate(() => window.outerWidth);
      return ist >= breite && ist <= breite + 2 ? breite : ist;
    })
    .toBe(breite);
}

const titelReiter = (page) =>
  page.locator(`${SEL.tabs0} .tab-title`, { hasText: /^Arbeitsbereiche$/ });

test.describe('WS-09: Öffnen als Reiter, zweites Öffnen, keine Rückkehr (4T-002227)', () => {
  test('Menü und Kommando öffnen eine Seite ohne Pop-up, die den Neustart nicht überdauert', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      // Regel 32: Erst muss das Datei-Argument im Streifen stehen, sonst
      // schöbe es sich vor die Seite.
      await warteAufDateiArgument(first.page, 'basis.md');
      await first.page.evaluate(() =>
        window.api.workspaceSaveAs({ name: 'Neustart', color: 'green' }),
      );
      await expect.poll(() => first.page.title()).toContain('(Arbeitsbereich Neustart)');

      const seite = await oeffneArbeitsbereicheSeite(first.app, first.page);
      await expect(titelReiter(first.page)).toHaveCount(1);
      await expect(first.page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(
        'Arbeitsbereiche',
      );
      await expect(seite.locator('.workspaces-page-heading')).toHaveText('Arbeitsbereiche');
      await expect(seite.locator('.workspaces-page-note')).toBeVisible();
      // Kein Pop-up: Weder das alte Markup noch ein anderes Modal steht offen.
      await expect(first.page.locator('#workspace-manager-modal')).toHaveCount(0);
      await expect(first.page.locator('.bookmark-modal:not([hidden])')).toHaveCount(0);
      // AK6: Keine Schaltflächen-Leiste — jede Schaltfläche der Seite gehört
      // zu einer Zeile.
      await expect(seite.locator('.workspace-row')).toHaveCount(1);
      await expect(seite.locator('button')).toHaveCount(5);
      await expect(seite.locator('.workspace-row button')).toHaveCount(5);

      // Zweites Öffnen über das Kommando: die bestehende Seite wird aktiv, es
      // entsteht keine zweite. Vorher ein anderes Dokument aktivieren, damit die
      // Aktivierung etwas zu tun hat; geklickt wird der Reiter selbst, weil er
      // die Klicks seines Titels abfängt.
      await first.page
        .locator(SEL.tabs0)
        .filter({ has: first.page.locator('.tab-title', { hasText: /^basis$/ }) })
        .click();
      await expect(first.page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(/basis/);
      await expect
        .poll(() => paletteTreffer(first.app, first.page, 'Arbeitsbereiche verwalten'))
        .toBe(1);
      await first.page.keyboard.press('Enter');
      await expect(first.page.locator('#command-palette-modal')).toBeHidden();
      await expect(first.page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(
        'Arbeitsbereiche',
      );
      await expect(titelReiter(first.page)).toHaveCount(1);
      await expect(first.page.locator(SEITE)).toHaveCount(1);

      // AK6: Nach dem Neustart kommt der Arbeitsbereich samt Dokument zurück,
      // die Seite nicht. Das zurückgekehrte Dokument ist der Beleg, dass die
      // Wiederherstellung durchgelaufen ist, bevor die Abwesenheit zählt.
      await hauptSenden(first.app, ({ app }) => app.quit());
      await first.app.waitForEvent('close');
      const second = await launchApp({ userData });
      try {
        await expect(
          second.page.locator(`${SEL.tabs0} .tab-title`, { hasText: /^basis/ }),
        ).toBeVisible();
        await expect(titelReiter(second.page)).toHaveCount(0);
        await expect(second.page.locator(SEITE)).toHaveCount(0);
      } finally {
        await closeApp(second.app, null, { force: true });
      }
    } finally {
      await closeApp(first.app, userData, { force: true });
    }
  });
});

test.describe('WS-10: Angaben je Zeile und ungekürzter Name (4T-002227)', () => {
  test('Farbpunkt, Name, Pfad, Zustand; der lange Name steht bei 1280 ungekürzt, einzeilig, wo die Breite reicht', async () => {
    const { app, page, userData } = await launchApp();
    const { basis, dir } = makeLongAreaDir();
    try {
      const gebunden = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(gebunden.boundExisting).toBe(true);
      await page.evaluate(
        (name) => window.api.workspaceSaveAs({ name, color: 'blue' }),
        LANGER_NAME,
      );
      await legeAn(app, page, 'Schreibwerkstatt', 'green');
      const liste = await page.evaluate(() => window.api.workspacesList());
      expect(LANGER_NAME.length).toBeGreaterThanOrEqual(40);

      await setzeFenster(app, page, 1280);
      const seite = await oeffneArbeitsbereicheSeite(app, page);
      const zeilen = seite.locator('.workspace-row');
      await expect(zeilen).toHaveCount(2);
      await expect(seite.locator('.workspace-row-name')).toHaveText([
        LANGER_NAME,
        'Schreibwerkstatt',
      ]);
      // Farbpunkt mit Zustand: gefüllt für geöffnet — beide Fenster sind offen.
      await expect(zeilen.nth(0).locator('.workspace-dot.open')).toHaveCount(1);
      await expect(zeilen.nth(1).locator('.workspace-dot.open')).toHaveCount(1);
      // Zustand und letztes Öffnen in der Meta-Zeile.
      await expect(zeilen.nth(0).locator('.workspace-row-meta')).toContainText('offen');
      await expect(zeilen.nth(0).locator('.workspace-row-meta')).toContainText('zuletzt geöffnet');
      // Pfad-Zeile nur beim gebundenen Arbeitsbereich, mit dem vollen Pfad.
      await expect(zeilen.nth(0).locator('.workspace-row-path')).toContainText(liste[0].areaPath);
      await expect(zeilen.nth(1).locator('.workspace-row-path')).toHaveCount(0);

      // Der lange Name: nichts abgeschnitten, keine Auslassungspunkte, und
      // einzeilig genau dann, wenn er einzeilig in seine Zelle passt (Story
      // AK21: «einzeilig, solange die Seite dafür breit genug ist»). Die
      // einzeilige Breite misst ein unsichtbarer Klon ohne Umbruch neben dem
      // Element, also in derselben Schrift, Größe und Stärke.
      const mass = await zeilen
        .nth(0)
        .locator('.workspace-row-name')
        .evaluate((el) => {
          const bereich = document.createRange();
          bereich.selectNodeContents(el);
          const zeilenZahl = new Set([...bereich.getClientRects()].map((r) => Math.round(r.top)))
            .size;
          const klon = el.cloneNode(true);
          klon.removeAttribute('id');
          Object.assign(klon.style, {
            position: 'absolute',
            visibility: 'hidden',
            whiteSpace: 'nowrap',
            width: 'auto',
            maxWidth: 'none',
          });
          el.parentElement.appendChild(klon);
          const bedarf = klon.getBoundingClientRect().width;
          klon.remove();
          return {
            zeilenZahl,
            bedarf,
            zelle: el.getBoundingClientRect().width,
            voll: el.scrollWidth,
            sichtbar: el.clientWidth,
            ellipse: getComputedStyle(el).textOverflow,
          };
        });
      const passt = mass.bedarf <= mass.zelle + 0.5;
      if (passt) expect(mass.zeilenZahl).toBe(1);
      else expect(mass.zeilenZahl).toBeGreaterThan(1);
      // Auf Windows begrenzt: Mit Segoe UI passt der Name bei 1280 in die
      // Zelle (berechnet rund 454 von rund 509 Bildpunkten). Schwester-Zeile
      // auf allen Plattformen ist die Bedingung darüber.
      if (process.platform === 'win32') expect(passt).toBe(true);
      expect(mass.voll).toBeLessThanOrEqual(mass.sichtbar);
      expect(mass.ellipse).not.toBe('ellipsis');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(basis);
    }
  });
});

test.describe('WS-11: Öffnen und Löschen von der Seite (4T-002227)', () => {
  test('Öffnen holt einen geschlossenen Arbeitsbereich, Löschen fragt mit Vorbelegung Abbruch', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Ein geschlossener Arbeitsbereich: angelegt und sein Fenster wieder
      // geschlossen. Das Schließen beendet das Fenster während des Aufrufs.
      const zweites = await legeAn(app, page, 'Zu', 'red');
      await zweites.evaluate(() => void window.api.workspaceClose()).catch(() => {});
      await expect
        .poll(async () => (await page.evaluate(() => window.api.workspacesList()))[0])
        .toMatchObject({ name: 'Zu', open: false });

      const seite = await oeffneArbeitsbereicheSeite(app, page);
      const zeile = seite.locator('.workspace-row');
      await expect(zeile.locator('.workspace-dot.open')).toHaveCount(0);
      const knopf = (i) => zeile.locator('.workspace-row-actions .btn:not(.workspace-move)').nth(i);

      // Öffnen: ein neues Fenster entsteht, die Seite zeigt den Zustand nach.
      const neuesFenster = app.waitForEvent('window');
      await knopf(0).click();
      await (await neuesFenster).waitForLoadState('domcontentloaded');
      await expect(zeile.locator('.workspace-dot.open')).toHaveCount(1);

      // Löschen mit «Abbrechen»: Die Rückfrage kommt aus dem Hauptprozess, ihre
      // Vorbelegung ist der Abbruch, und der Eintrag bleibt.
      await hauptSenden(app, ({ dialog }) => {
        globalThis.__rueckfragen = [];
        dialog.showMessageBox = async (_fenster, optionen) => {
          globalThis.__rueckfragen.push(optionen || _fenster);
          return { response: globalThis.__antwort };
        };
        globalThis.__antwort = 1;
      });
      await knopf(2).click();
      await expect.poll(() => hauptLesen(app, () => globalThis.__rueckfragen.length)).toBe(1);
      const optionen = await hauptLesen(app, () => globalThis.__rueckfragen[0]);
      expect(optionen.defaultId).toBe(1);
      expect(optionen.cancelId).toBe(1);
      expect(optionen.message).toContain('Zu');
      await expect(zeile).toHaveCount(1);
      expect(await page.evaluate(() => window.api.workspacesList())).toHaveLength(1);

      // Löschen bestätigt: Die Zeile verschwindet, und die leere Liste zeigt
      // ihren Hinweis statt einer Zeile (AK8).
      await hauptSenden(app, () => {
        globalThis.__antwort = 0;
      });
      await knopf(2).click();
      await expect(zeile).toHaveCount(0);
      await expect(seite.locator('.workspaces-page-placeholder')).toHaveText(
        'Noch keine Arbeitsbereiche angelegt.',
      );
      expect(await page.evaluate(() => window.api.workspacesList())).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('WS-12: Änderungen aus einem anderen Fenster (4T-002227)', () => {
  test('Umbenennen, Farbwechsel und Anlegen aus Fenster zwei erscheinen auf der offenen Seite', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await page.evaluate(() => window.api.workspaceSaveAs({ name: 'Eins', color: 'blue' }));
      const zweites = await legeAn(app, page, 'Zwei', 'green');
      const seite = await oeffneArbeitsbereicheSeite(app, page);
      await expect(seite.locator('.workspace-row-name')).toHaveText(['Eins', 'Zwei']);

      const id = (await page.evaluate(() => window.api.workspacesList()))[0].id;
      await zweites.evaluate(
        (wid) => window.api.workspaceRename({ id: wid, name: 'Eins umbenannt' }),
        id,
      );
      await zweites.evaluate((wid) => window.api.workspaceSetColor({ id: wid, color: 'red' }), id);
      await expect(seite.locator('.workspace-row-name')).toHaveText(['Eins umbenannt', 'Zwei']);
      await expect(
        seite.locator('.workspace-row').nth(0).locator('.workspace-dot'),
      ).toHaveAttribute('style', /--tab-group-red/);

      await legeAn(app, zweites, 'Drei', 'cyan');
      await expect(seite.locator('.workspace-row-name')).toHaveText([
        'Eins umbenannt',
        'Zwei',
        'Drei',
      ]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Misst die Ränder der Seite in ihrem Roll-Bereich: waagrechtes Überstehen,
// Elemente jenseits des Randes und die Lage der Schaltflächen-Gruppe zum Text.
function randMessung(page) {
  return page.locator(SEITE).evaluate((seite) => {
    const bereich = seite.closest('.pane-system');
    const rahmen = bereich.getBoundingClientRect();
    const draussen = [...seite.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > rahmen.right + 0.5 || r.left < rahmen.left - 0.5);
      })
      .map((el) => el.className);
    const zeilen = [...seite.querySelectorAll('.workspace-row')].map((zeile) => {
      const text = zeile.querySelector('.workspace-row-text').getBoundingClientRect();
      const aktionen = zeile.querySelector('.workspace-row-actions').getBoundingClientRect();
      return { unter: aktionen.top >= text.bottom - 0.5 };
    });
    return {
      quer: bereich.scrollWidth - bereich.clientWidth,
      seitenBreite: Math.round(rahmen.width),
      draussen,
      zeilen,
    };
  });
}

test.describe('WS-13: Kleinste Fensterbreite mit und ohne Seitenleiste (4T-002227)', () => {
  test('nichts ragt über den Rand, kein waagrechtes Rollen, Schaltflächen unter dem Text', async () => {
    const { app, page, userData } = await launchApp();
    const { basis, dir } = makeLongAreaDir();
    try {
      // Gebundener Bereich: Die Seitenleiste zeigt ihn und nimmt der Seite
      // Breite weg — genau die Lage, die das Mockup nicht gemessen hatte.
      const gebunden = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(gebunden.boundExisting).toBe(true);
      await page.evaluate(
        (name) => window.api.workspaceSaveAs({ name, color: 'blue' }),
        LANGER_NAME,
      );
      const liste = await page.evaluate(() => window.api.workspacesList());
      await setzeFenster(app, page, 600);
      const seite = await oeffneArbeitsbereicheSeite(app, page);

      const links = page.locator('.pane-group[data-pane="0"] .pane-sidebar-left');
      await expect(links).toBeVisible();
      await expect.poll(async () => (await links.boundingBox()).width).toBeGreaterThan(100);
      const mitLeiste = await randMessung(page);
      expect(mitLeiste.quer).toBeLessThanOrEqual(0);
      expect(mitLeiste.draussen).toEqual([]);
      expect(mitLeiste.zeilen).toEqual([{ unter: true }]);
      await expect(seite.locator('.workspace-row-name')).toHaveText(LANGER_NAME);
      await expect(seite.locator('.workspace-row-path')).toContainText(liste[0].areaPath);

      // Seitenleiste einklappen: Die Seite wird breiter, die Regeln gelten
      // weiter, weil sie an der Breite der Seite hängen.
      const fenster = await app.browserWindow(page);
      await hauptSenden(fenster, (w) => w.webContents.send('menu:toggleSidebarLeft'));
      await expect(links).toHaveClass(/collapsed/);
      await expect
        .poll(async () => (await randMessung(page)).seitenBreite)
        .toBeGreaterThan(mitLeiste.seitenBreite);
      const ohneLeiste = await randMessung(page);
      expect(ohneLeiste.quer).toBeLessThanOrEqual(0);
      expect(ohneLeiste.draussen).toEqual([]);
      expect(ohneLeiste.zeilen).toEqual([{ unter: true }]);
      await expect(seite.locator('.workspace-row-name')).toHaveText(LANGER_NAME);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(basis);
    }
  });
});

test.describe('WS-14: Dreißig Arbeitsbereiche (4T-002227)', () => {
  test('die Seite rollt senkrecht, der letzte Eintrag ist erreichbar und sein ▼ abgeblendet', async () => {
    // Vorbelegt statt angelegt: Dreißig Anlagen öffneten dreißig Fenster. Die
    // Einträge sind geschlossen, damit beim Start keiner wiederhergestellt wird.
    const workspaces = Array.from({ length: 30 }, (_, i) => ({
      id: `ws-${String(i + 1).padStart(2, '0')}`,
      name: `Arbeitsbereich ${String(i + 1).padStart(2, '0')}`,
      color: 'blue',
      open: false,
      lastOpenedAt: null,
      app: { area: null, windows: [] },
    }));
    const { app, page, userData } = await launchApp({
      settings: { language: 'de', workspaces },
    });
    try {
      const seite = await oeffneArbeitsbereicheSeite(app, page);
      const zeilen = seite.locator('.workspace-row');
      await expect(zeilen).toHaveCount(30);
      const roll = await seite.evaluate((el) => {
        const bereich = el.closest('.pane-system');
        return {
          senkrecht: bereich.scrollHeight - bereich.clientHeight,
          quer: bereich.scrollWidth - bereich.clientWidth,
        };
      });
      expect(roll.senkrecht).toBeGreaterThan(0);
      expect(roll.quer).toBeLessThanOrEqual(0);

      const letzte = zeilen.nth(29);
      await letzte.scrollIntoViewIfNeeded();
      await expect(letzte).toBeInViewport();
      await expect(letzte.locator('.workspace-row-name')).toHaveText('Arbeitsbereich 30');
      await expect(letzte.locator('[data-workspace-move="down"]')).toBeDisabled();
      await expect(letzte.locator('[data-workspace-move="up"]')).toBeEnabled();
    } finally {
      await closeApp(app, userData);
    }
  });
});
