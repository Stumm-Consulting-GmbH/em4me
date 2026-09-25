// 4T-000282/4T-000283 (Epic 3E-000050): E2E-Funktions-Specs der Frontmatter-
// Anzeige — Render-Pane (Zeile, Pin) und Live-Modus (Block-Widget,
// Demaskierung) inklusive Paritäts-Abgleich der beiden Modi.
// 4T-001722 (Epic 3E-000303): FM-04 — Auswahl, Schreibmarke und Zeilennummern
// wandern beim Auf- und Zuklappen der Metadaten-Zeile mit.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'frontmatter.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('FM-01: Frontmatter-Zeile im Render-Pane', () => {
  test('zusammengeklappte Zeile mit Feldanzahl, Klick pinnt das Klartext-YAML', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toBeVisible();
      // Feldanzahl aus den geparsten Daten (titel, tags, zahl).
      const count = block.locator('.frontmatter-count');
      await expect(count).toHaveAttribute('data-fm-count', '3');
      await expect(count).not.toHaveText('');
      // Zusammengeklappt: YAML-<pre> hat Höhe 0.
      const yaml = block.locator('pre.frontmatter-yaml');
      await expect(yaml).not.toBeVisible();
      // Klick pinnt: Klasse is-pinned, YAML sichtbar mit Original-Inhalt.
      await block.locator('.frontmatter-header').click();
      await expect(block).toHaveClass(/is-pinned/);
      await expect(yaml).toBeVisible();
      await expect(yaml).toContainText('titel: Frontmatter-Fixture');
      // Kein ---Marker im Klartext-YAML.
      await expect(yaml).not.toContainText('---');
      // Erneuter Klick löst den Pin.
      await block.locator('.frontmatter-header').click();
      await expect(block).not.toHaveClass(/is-pinned/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('data-source-line der Body-Elemente zählt Gesamt-Dokument-Zeilen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      // '# Frontmatter-Anzeige' steht in Zeile 7 des Gesamt-Dokuments
      // (5 Frontmatter-Zeilen + Leerzeile davor). Regression 4T-000282.
      const h1 = page.locator(`${SEL.markdownBody0} h1`);
      await expect(h1).toHaveAttribute('data-source-line', '7');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toHaveAttribute('data-source-line', '1');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('FM-02: Frontmatter-Block-Widget im Live-Modus', () => {
  test('Widget maskiert die YAML-Zeilen, Pfeiltasten-Eintritt demaskiert, Verlassen maskiert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Widget mit der zusammengeklappten Zeile ist da (auch bei
      // Initial-Cursor auf Position 0). Maskiert verschmelzen die fünf
      // Frontmatter-Zeilen zu EINER Editor-Zeile, die das Widget trägt;
      // demaskiert erscheinen die fünf dekorierten Quelltext-Zeilen.
      const widget = page.locator('.cm-live-frontmatter .frontmatter-block');
      await expect(widget).toBeVisible();
      await expect(page.locator('.cm-frontmatter-line')).toHaveCount(1);
      // Tastatur-Eintritt: Editor fokussieren, Cursor von Position 0 in
      // den Block bewegen — demaskiert zum editierbaren Quelltext mit
      // der bestehenden Zeilen-Dekoration.
      await editor.click({ position: { x: 5, y: 200 } });
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.cm-frontmatter-line')).toHaveCount(5);
      await expect(page.locator('.cm-live-frontmatter')).toHaveCount(0);
      // Verlassen (Cursor ans Dokument-Ende) maskiert wieder.
      await page.keyboard.press('Control+End');
      await expect(page.locator('.cm-live-frontmatter .frontmatter-block')).toBeVisible();
      await expect(page.locator('.cm-frontmatter-line')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Parität: Live-Widget nutzt dasselbe Markup wie das Render-Pane', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const widget = page.locator('.cm-live-frontmatter .frontmatter-block');
      await expect(widget).toBeVisible();
      // Gleiche Struktur-Klassen wie im Render-Pane (eine Markup-Quelle).
      await expect(widget.locator('.frontmatter-header')).toHaveCount(1);
      await expect(widget.locator('.frontmatter-count')).toHaveAttribute('data-fm-count', '3');
      await expect(widget.locator('pre.frontmatter-yaml')).toHaveCount(1);
      // Pin funktioniert im Widget wie im Render-Pane.
      await widget.locator('.frontmatter-header').click();
      await expect(widget).toHaveClass(/is-pinned/);
      await expect(widget.locator('pre.frontmatter-yaml')).toBeVisible();
      // Klick ins aufgeklappte YAML demaskiert zum Quelltext.
      await widget.locator('pre.frontmatter-yaml').click();
      await expect(page.locator('.cm-frontmatter-line').first()).toBeVisible();
      await expect(page.locator('.cm-live-frontmatter')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000312 (Epic 3E-000055): dauerhaft ausgeklappte Frontmatter-Darstellung
// (Darstellungs-Schalter, Setting render.frontmatterExpanded). Wirkt im
// Render-Pane und im Live-Widget (gleiche Klassen) und damit im PDF.
test.describe('FM-03: Frontmatter dauerhaft ausgeklappt', () => {
  test('Schalter haelt das YAML ohne Hover offen, wirkt im Live-Widget und persistiert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toBeVisible();
      const yaml = block.locator('pre.frontmatter-yaml');
      // Default: zugeklappt.
      await expect(yaml).not.toBeVisible();

      // Einstellungs-Seite: Schalter im Bereich Darstellung aktivieren.
      await oeffneEinstellungsSeite(page);
      await page.locator('#settings-frontmatter-expanded').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Render-Pane: YAML dauerhaft offen ohne Hover und ohne Pin.
      await expect(page.locator('html')).toHaveClass(/frontmatter-expanded/);
      await expect(yaml).toBeVisible();
      await expect(yaml).toContainText('titel: Frontmatter-Fixture');
      await expect(block).not.toHaveClass(/is-pinned/);
      // Persistiert im Store.
      await expect
        .poll(() => page.evaluate(() => window.api.getSetting('render.frontmatterExpanded')))
        .toBe(true);

      // Live-Modus: Widget-YAML ebenfalls offen.
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const widget = page.locator('.cm-live-frontmatter .frontmatter-block');
      await expect(widget).toBeVisible();
      await expect(widget.locator('pre.frontmatter-yaml')).toBeVisible();

      // Print-Zustand (PDF): das YAML bleibt im Druck offen und ohne
      // Hoehen-Kappung (max-height none statt der 45vh-Hover-Grenze).
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const printMaxHeight = await page.evaluate(() => {
        document.documentElement.classList.add('printing');
        document.body.classList.add('printing');
        const el = document.querySelector(
          '.pane-group[data-pane="0"] .markdown-body pre.frontmatter-yaml',
        );
        const value = el ? getComputedStyle(el).maxHeight : null;
        document.body.classList.remove('printing');
        document.documentElement.classList.remove('printing');
        return value;
      });
      expect(printMaxHeight).toBe('none');

      // Schalter wieder aus: YAML klappt zu, Hover-/Pin-Verhalten zurueck.
      await oeffneEinstellungsSeite(page);
      await page.locator('#settings-frontmatter-expanded').uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator('html')).not.toHaveClass(/frontmatter-expanded/);
      await expect(yaml).not.toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001722 (Epic 3E-000303): Was auf Zeilen zeigt, wandert mit der Höhe der
// Metadaten-Zeile mit — Auswahl-Hervorhebung, Schreibmarke und Zeilennummern.
//
// **Warum jeder Fall eine eigene App-Instanz bekommt.** Gemessen am 2026-09-18:
// Nach dem ersten Aufklappen ist der Editor nachgemessen, und ein zweites
// Aufklappen in derselben Instanz beweist nichts mehr — der Fehlerzustand vor
// der Behebung war genau der ungemessene Erst-Zustand. Aus demselben Grund wird
// in diesen Fällen **nicht gescrollt**: Scrollen war einer der Auslöser, die den
// Versatz von selbst heilten.
//
// **Der Sollwert ist nicht null.** Auswahl-Rechteck und Textzeile beginnen um
// 2,00 px versetzt (Zeilen-Innenabstand der Auswahl-Ebene), die Zeilennummer
// liegt bei 0,00. Geprüft wird deshalb der Abstand gegen seinen Sollwert und
// nicht gegen null; die Toleranz von 1,5 px liegt unter dem Fehlbetrag, den der
// Fehler erzeugte (113,95 px in der Messung), und über der Rundung des Layouts.
const FM04_MARKER = 'Absatz unter dem Frontmatter-Block.';
const FM04_SOLL_AUSWAHL = 2.0;
const FM04_TOLERANZ = 1.5;

// Legt die Mess-Funktionen im Fenster ab. Kein `eval` und kein `new Function`
// (die Inhalts-Sicherheits-Regel der Anwendung verbietet beides): Playwright
// überträgt die Funktion selbst.
async function installiereFm04Messung(page, paneSelektor) {
  await page.evaluate((P) => {
    window.__fmView = () => {
      const el = document.querySelector(P + ' .cm-content');
      if (!el || !el.cmTile) return null;
      let tile = el.cmTile;
      while (tile.parent) tile = tile.parent;
      return (tile && tile.view) || null;
    };
    window.__fmHoehe = () => {
      const w = document.querySelector(P + ' .cm-live-frontmatter');
      return w ? Math.round(w.getBoundingClientRect().height * 100) / 100 : null;
    };
    window.__fmMess = (markerText, zeilenNummer) => {
      const oben = (el) => (el ? Math.round(el.getBoundingClientRect().top * 100) / 100 : null);
      let zeile = null;
      for (const l of document.querySelectorAll(P + ' .cm-line')) {
        if (!zeile && l.textContent.includes(markerText)) zeile = l;
      }
      let gutter = null;
      for (const g of document.querySelectorAll(P + ' .cm-lineNumbers .cm-gutterElement')) {
        if (g.textContent.trim() === String(zeilenNummer)) {
          gutter = g;
          break;
        }
      }
      const auswahl = [];
      for (const s of document.querySelectorAll(
        P + ' .cm-selectionLayer .cm-selectionBackground',
      )) {
        auswahl.push(oben(s));
      }
      const marke = document.querySelector(P + ' .cm-cursorLayer .cm-cursor');
      const view = window.__fmView();
      const zeileTop = oben(zeile);
      const abstand = (wert) =>
        wert === null || zeileTop === null ? null : Math.round((wert - zeileTop) * 100) / 100;
      return {
        zeileTop,
        auswahlAnzahl: auswahl.length,
        auswahlAbstand: auswahl.length ? abstand(Math.min(...auswahl)) : null,
        markeAbstand: abstand(oben(marke)),
        nummerAbstand: abstand(oben(gutter)),
        widgetHoehe: window.__fmHoehe(),
        inhaltsHoehe: view ? Math.round(view.contentHeight * 100) / 100 : null,
      };
    };
    // Zeitreihe je Bild des Übergangs. Liefert Höhe und Abstände zusammen,
    // damit sich hinterher unterscheiden lässt, ob ein Abstand während einer
    // Bewegung oder im Stillstand gemessen wurde.
    window.__fmReihe = (markerText, zeilenNummer, dauerMs) =>
      new Promise((fertig) => {
        const proben = [];
        const start = performance.now();
        const bild = () => {
          const jetzt = performance.now();
          const p = window.__fmMess(markerText, zeilenNummer);
          p.dt = Math.round(jetzt - start);
          proben.push(p);
          if (jetzt - start < dauerMs) requestAnimationFrame(bild);
          else fertig(proben);
        };
        requestAnimationFrame(bild);
      });
  }, paneSelektor);
}

// Wartet ohne Schlaf-Pause auf zwei gleiche Widget-Höhen in Folge. `bedingung`
// grenzt die erwartete Richtung ein, damit die Wartezeit vor einem verzögerten
// Übergang nicht schon als Stillstand durchgeht (die Gestaltungs-Regel setzt
// beim Zuklappen 0,3 s Verzögerung, in denen die Höhe unverändert steht).
async function warteHoeheStabil(page, bedingung = () => true) {
  let vorige = null;
  let letzte = null;
  await expect
    .poll(
      async () => {
        const h = await page.evaluate(() => window.__fmHoehe());
        const stabil = vorige !== null && h !== null && Math.abs(h - vorige) < 0.01 && bedingung(h);
        vorige = h;
        letzte = h;
        return stabil;
      },
      { timeout: 15000, intervals: new Array(60).fill(50) },
    )
    .toBe(true);
  return letzte;
}

// Live-Modus mit Zeilennummern, Schreibmarke im Editor und einer Auswahl über
// vier Zeilen ab der Marker-Zeile.
async function ruesteFm04Auf(app, page) {
  await waitForTab(page);
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await installiereFm04Messung(page, SEL.paneSource0);
  if ((await page.locator(`${SEL.paneSource0} .cm-lineNumbers`).count()) === 0) {
    await page.locator('#btn-numbers').click();
  }
  await expect(page.locator(`${SEL.paneSource0} .cm-lineNumbers`)).toHaveCount(1);
  await expect(page.locator('.cm-live-frontmatter .frontmatter-block')).toBeVisible();
  // Klick in den Text: setzt die Schreibmarke und gibt dem Editor den Fokus
  // (ohne Fokus zeichnet CodeMirror keine Schreibmarke).
  await page.locator(SEL.editorContent0).click({ position: { x: 20, y: 120 } });
  const zeilenNummer = await page.evaluate((marker) => {
    const view = window.__fmView();
    const doc = view.state.doc;
    let ziel = -1;
    for (let i = 1; i <= doc.lines; i++) {
      if (doc.line(i).text.includes(marker)) {
        ziel = i;
        break;
      }
    }
    view.dispatch({
      selection: { anchor: doc.line(ziel).from, head: doc.line(Math.min(ziel + 3, doc.lines)).to },
    });
    view.focus();
    return ziel;
  }, FM04_MARKER);
  expect(zeilenNummer).toBeGreaterThan(0);
  await expect(
    page.locator(`${SEL.paneSource0} .cm-selectionLayer .cm-selectionBackground`).first(),
  ).toBeVisible();
  return zeilenNummer;
}

function messeFm04(page, zeilenNummer) {
  return page.evaluate(([m, n]) => window.__fmMess(m, n), [FM04_MARKER, zeilenNummer]);
}

// Prüft den ruhenden Zustand: alles, was auf Zeilen zeigt, liegt an seiner Zeile.
function erwarteInDeckung(mess) {
  expect(mess.auswahlAnzahl).toBeGreaterThan(0);
  expect(Math.abs(mess.auswahlAbstand - FM04_SOLL_AUSWAHL)).toBeLessThan(FM04_TOLERANZ);
  expect(Math.abs(mess.nummerAbstand)).toBeLessThan(FM04_TOLERANZ);
}

test.describe('FM-04: Auswahl, Schreibmarke und Zeilennummern wandern mit', () => {
  test('Aufklappen per Hover: Auswahl, Schreibmarke und Zeilennummer bleiben an ihrer Zeile', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      const nummer = await ruesteFm04Auf(app, page);
      const vor = await messeFm04(page, nummer);
      erwarteInDeckung(vor);

      await page.locator('.cm-live-frontmatter .frontmatter-header').hover();
      const hoehe = await warteHoeheStabil(page, (h) => h > vor.widgetHoehe + 1);
      expect(hoehe).toBeGreaterThan(vor.widgetHoehe + 1);

      const nach = await messeFm04(page, nummer);
      // Der Text ist nach unten gerückt — das ist gewollt und die Voraussetzung
      // dafür, dass die Prüfung überhaupt etwas aussagt.
      expect(nach.zeileTop).toBeGreaterThan(vor.zeileTop + 1);
      erwarteInDeckung(nach);
      // Die Schreibmarke behält ihren Abstand zur Marker-Zeile.
      expect(Math.abs(nach.markeAbstand - vor.markeAbstand)).toBeLessThan(FM04_TOLERANZ);
      // Der Editor hat die neue Höhe übernommen: sein Inhalts-Maß wächst um
      // genau die Zunahme des Widgets. Genau das blieb vor der Behebung stehen.
      const zunahmeWidget = nach.widgetHoehe - vor.widgetHoehe;
      const zunahmeInhalt = nach.inhaltsHoehe - vor.inhaltsHoehe;
      expect(Math.abs(zunahmeInhalt - zunahmeWidget)).toBeLessThan(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Zuklappen: nach dem Verlassen mit der Maus liegt alles wieder an seiner Zeile', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      const nummer = await ruesteFm04Auf(app, page);
      const zu = await messeFm04(page, nummer);
      await page.locator('.cm-live-frontmatter .frontmatter-header').hover();
      const offeneHoehe = await warteHoeheStabil(page, (h) => h > zu.widgetHoehe + 1);
      const offen = await messeFm04(page, nummer);
      erwarteInDeckung(offen);

      // Maus weg vom Widget (Reiterleiste, kein Scrollen): der Block klappt zu.
      await page.mouse.move(600, 10);
      await warteHoeheStabil(page, (h) => h < offeneHoehe - 1);
      const nach = await messeFm04(page, nummer);
      // Der Text ist wieder nach oben gerückt.
      expect(nach.zeileTop).toBeLessThan(offen.zeileTop - 1);
      erwarteInDeckung(nach);
      expect(Math.abs(nach.markeAbstand - zu.markeAbstand)).toBeLessThan(FM04_TOLERANZ);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Feststellen per Klick: Auswahl und Zeilennummer bleiben an ihrer Zeile', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      const nummer = await ruesteFm04Auf(app, page);
      const vor = await messeFm04(page, nummer);
      // Der Klick auf die Kopfzeile stellt fest; er nimmt dem Editor dabei den
      // Fokus, weshalb hier Auswahl und Zeilennummer geprüft werden und nicht
      // die Schreibmarke — ohne Fokus wird sie nicht gezeichnet.
      await page.locator('.cm-live-frontmatter .frontmatter-header').click();
      await expect(page.locator('.cm-live-frontmatter .frontmatter-block')).toHaveClass(
        /is-pinned/,
      );
      await warteHoeheStabil(page, (h) => h > vor.widgetHoehe + 1);
      const nach = await messeFm04(page, nummer);
      expect(nach.zeileTop).toBeGreaterThan(vor.zeileTop + 1);
      erwarteInDeckung(nach);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Gegenprobe: mit dem Dauer-Schalter entsteht gar keine Höhen-Änderung', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      settings: { language: 'de', render: { frontmatterExpanded: true } },
    });
    try {
      const nummer = await ruesteFm04Auf(app, page);
      const vor = await messeFm04(page, nummer);
      erwarteInDeckung(vor);
      await page.locator('.cm-live-frontmatter .frontmatter-header').hover();
      const hoehe = await warteHoeheStabil(page);
      // Dauerhaft offen: das Überfahren ändert nichts, auch nicht die Höhe.
      expect(Math.abs(hoehe - vor.widgetHoehe)).toBeLessThan(1);
      const nach = await messeFm04(page, nummer);
      expect(Math.abs(nach.zeileTop - vor.zeileTop)).toBeLessThan(1);
      erwarteInDeckung(nach);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Während des Übergangs: im Stillstand liegt jedes Bild in Deckung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      const nummer = await ruesteFm04Auf(app, page);
      const vor = await messeFm04(page, nummer);
      const reihe = page.evaluate(([m, n]) => window.__fmReihe(m, n, 900), [FM04_MARKER, nummer]);
      await page.locator('.cm-live-frontmatter .frontmatter-header').hover();
      const proben = await reihe;
      expect(proben.length).toBeGreaterThan(20);
      // Die Höhe hat sich in der Reihe tatsächlich geändert; sonst prüfte der
      // Fall nur Stillstand.
      const hoehen = proben.map((p) => p.widgetHoehe);
      expect(Math.max(...hoehen) - Math.min(...hoehen)).toBeGreaterThan(1);

      // **Die Erwartung gilt für den Stillstand, nicht für die Bewegung.** Die
      // Nachmessung des Editors kommt ein Bild nach der Höhen-Änderung; während
      // einer laufenden Bewegung hinken die Ebenen deshalb um die Strecke der
      // letzten Bilder nach (gemessen am 2026-09-18: bis zu 95 px in den zwei
      // steilsten Bildern des Übergangs, weil die Höhen-Kappung früh erreicht
      // wird). Was der Fehler ausmachte, war nicht dieses Nachhinken, sondern
      // der **bleibende** Versatz: Sobald die Höhe zwei Bilder lang steht, muss
      // alles in Deckung liegen — vor dem Übergang, während seiner Pausen und
      // nach seinem Ende.
      let stillstaende = 0;
      for (let i = 2; i < proben.length; i++) {
        const p = proben[i];
        if (Math.abs(p.widgetHoehe - proben[i - 1].widgetHoehe) >= 0.01) continue;
        if (Math.abs(proben[i - 1].widgetHoehe - proben[i - 2].widgetHoehe) >= 0.01) continue;
        stillstaende++;
        expect(Math.abs(p.auswahlAbstand - FM04_SOLL_AUSWAHL)).toBeLessThan(FM04_TOLERANZ);
        expect(Math.abs(p.nummerAbstand)).toBeLessThan(FM04_TOLERANZ);
      }
      // Vor dem Übergang und nach seinem Ende liegen zusammen genug ruhende
      // Bilder, dass die Prüfung oben etwas gesehen hat.
      expect(stillstaende).toBeGreaterThan(10);
      // Und am Ende der Reihe ist der Block offen.
      const letzte = proben[proben.length - 1];
      expect(letzte.widgetHoehe).toBeGreaterThan(vor.widgetHoehe + 1);
      erwarteInDeckung(letzte);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
