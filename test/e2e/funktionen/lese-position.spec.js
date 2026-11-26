// 4T-002641 (Epic 3E-000397): Lese-Position je Dokument.
//
// LP-04 prüft die Stelle innerhalb der Sitzung: Ein Reiter kehrt nach dem
// Wechsel mit Schreibmarke und Bildlauf zurück, ein Ansichts-Wechsel nimmt die
// oberste sichtbare Zeile mit, auch in einem Dokument mit Diagramm oberhalb,
// und nach zwei Sekunden Ruhe im Bildlauf liegt die Stelle in der Ablage
// `lese-positionen.json` des Nutzerdaten-Verzeichnisses; nach einer Zell-Eingabe
// im Live-Modus erscheint die Tabelle nach der Rückkehr als Tabelle.
// LP-01 prüft das Wieder-Öffnen über das Bereichs-Panel (ohne ein gezeichnetes
// Bild, das zuerst oben steht) samt Schreibmarke beim ersten Wechsel in den
// Editor, LP-02 den Vorrang von Verweis und Suchtreffer (der Rückverweis auch in
// der Quellcode-Ansicht) sowie das Öffnen über ein Lesezeichen, LP-03 den
// Neustart (Merken beim Beenden, wiederhergestellte Reiter, Öffnen danach).
// LP-05 bis LP-07 stehen im zweiten Teil `lese-position-ablage.spec.js`.
//
// Test-Dokument und gemeinsame Helfer in `test/e2e/helpers/lese-position.js`
// (400 nummerierte Absätze «Zeile 001» bis «Zeile 400», gemessen wird die
// oberste sichtbare Zeile). Die Schreibmarke liest die Prüfung über die Editor-Sicht wie
// `schreibmarkenZeile` in `datenbank-tabelle.spec.js`; eine Anzeige der
// Schreibmarken-Zeile hat das Programm nicht.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { leseJsonOderNull } = require('../helpers/dateien');
const {
  PANE,
  GERENDERT,
  EDITOR,
  legeAn,
  raeumeAuf,
  ansicht,
  reiter,
  obersteGerendert,
  obersteImEditor,
  obersteRuhig,
  rolleZu,
  nahe,
  gemerkteZeile,
  bindeBereich,
  oeffneImPanel,
  schliesseAktiven,
  starteBildMessung,
  bildMessungen,
  beende,
} = require('../helpers/lese-position');

const GEZEICHNET = `${SEL.markdownBody0} .mermaid-block svg`;
const TABELLEN = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'tabellen-klick.md');

// Oberste Zeile des Editors nach einem Ansichts-Wechsel, erst gemessen, wenn
// die Anwendung die mitgenommene Stelle gesetzt hat und der Editor sie im
// folgenden Mess-Durchlauf nachkorrigiert hat (bis 2026-11-13 setzte sie sie
// erst zwei Bildschirm-Takte nach dem Wechsel; LP-07 prüft das Bild). Zeigt
// der Editor schon vorher die erwartete Zeile (er stellt beim Sichtbar-Werden
// seine letzte Lage selbst her), bestünde eine Messung sofort, und ein Rollen
// der Prüfung unmittelbar danach würde vom Setzen überschrieben (gemessen am
// 2026-11-13: in drei von 31 Läufen von LP-04 (b, c) stand der Editor nach
// `rolleZu(…, 220)` wieder auf «Zeile 200», weil das Setzen erst danach kam).
// Ist der Editor sichtbar, ist der Wechsel verarbeitet; gemessen wird vier
// Takte später.
async function obersteImEditorGesetzt(page) {
  if ((await obersteImEditor(page)) === null) return null;
  await page.evaluate(
    () =>
      new Promise((fertig) => {
        let n = 0;
        const takt = () => (++n >= 4 ? fertig() : requestAnimationFrame(takt));
        requestAnimationFrame(takt);
      }),
  );
  return obersteImEditor(page);
}

// Wartet, bis die Editor-Zeile mit `text` in vier aufeinander folgenden
// Bildschirm-Takten an derselben Stelle steht. Nach einem Ansichts-Wechsel
// misst der Editor seine Zeilen nach und die Anwendung setzt die mitgenommene
// Stelle; ein Klick auf eine vorher ermittelte Stelle träfe sonst eine andere
// Zeile (gemessen am 2026-11-13 unter Last: in LP-04 (d) landete der Text in
// «Zeile 003» statt im Diagramm, und die Lese-Ansicht zeigte das alte Diagramm).
async function zeileRuhig(page, text) {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ container, text }) =>
            new Promise((fertig) => {
              const lage = () => {
                const z = [...document.querySelectorAll(`${container} .cm-line`)].find((el) =>
                  el.textContent.includes(text),
                );
                return z ? Math.round(z.getBoundingClientRect().top) : null;
              };
              const erste = lage();
              let n = 0;
              const takt = () => {
                if (lage() !== erste || erste === null) return fertig(false);
                if (++n >= 4) return fertig(true);
                requestAnimationFrame(takt);
              };
              requestAnimationFrame(takt);
            }),
          { container: EDITOR, text },
        ),
      { intervals: [50] },
    )
    .toBe(true);
}

// Zeile und Spalte der Schreibmarke über die Editor-Sicht (Zugang wie in
// datenbank-tabelle.spec.js).
async function schreibmarke(page) {
  return page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    if (!tile || !tile.view) return null;
    const st = tile.view.state;
    const zeile = st.doc.lineAt(st.selection.main.head);
    return { text: zeile.text, spalte: st.selection.main.head - zeile.from };
  }, SEL.editorContent0);
}

// Steht die Zeile der Schreibmarke ganz im sichtbaren Ausschnitt der
// Quellcode-Ansicht? Gemessen an der Bildlauf-Fläche des Editors (4T-002783).
async function markeImBild(page) {
  return page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return false;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    if (!tile || !tile.view) return false;
    const view = tile.view;
    const k = view.coordsAtPos(view.state.selection.main.head);
    if (!k) return false;
    const r = view.scrollDOM.getBoundingClientRect();
    return k.top >= r.top - 1 && k.bottom <= r.bottom + 1;
  }, SEL.editorContent0);
}

const editorBildlauf = (page) => page.evaluate((S) => document.querySelector(S).scrollTop, EDITOR);

// Merkt für `lang.md` die Stelle «Zeile 300» in der Lese-Ansicht: öffnen über
// das Bereichs-Panel, rollen, schließen; die Ablage trägt die Stelle danach.
async function merkeLangBei300(page, f, userData) {
  await oeffneImPanel(page, 'lang');
  await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
  await rolleZu(page, GERENDERT, '.markdown-body p', 300);
  await schliesseAktiven(page, 'lang');
  await expect.poll(() => nahe(gemerkteZeile(userData, 'lang.md'), f.zeileVon[300])).toBe(true);
}

test.describe('LP-04: Lese-Position innerhalb der Sitzung', () => {
  test('(a) Reiter-Wechsel behält Schreibmarke und Bildlauf, ohne den Reiter zu ändern', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp({ args: [f.lang, f.kurz] });
    try {
      await expect(reiter(page, 'kurz')).toBeVisible();
      await reiter(page, 'lang').click();
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await page.keyboard.press('Control+e');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await rolleZu(page, EDITOR, '.cm-line', 145);
      await page.locator(`${EDITOR} .cm-line`, { hasText: 'Zeile 150' }).click();
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      expect(await schreibmarke(page)).toEqual({ text: 'Zeile 150', spalte: 4 });
      const bildlauf = await editorBildlauf(page);

      await reiter(page, 'kurz').click();
      await expect(page.locator(SEL.markdownBody0)).toContainText('Nur ein Absatz');
      await reiter(page, 'lang').click();

      await expect.poll(() => schreibmarke(page)).toEqual({ text: 'Zeile 150', spalte: 4 });
      await expect.poll(() => editorBildlauf(page)).toBeGreaterThan(bildlauf - 2);
      expect(Math.abs((await editorBildlauf(page)) - bildlauf)).toBeLessThanOrEqual(1);
      await expect(page.locator(`${PANE} .tabbar .tab.dirty`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(b, c) Ansichts-Wechsel nimmt die oberste sichtbare Zeile mit', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp({ args: [f.lang] });
    try {
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 200);
      expect(await obersteGerendert(page)).toBe(200);

      await ansicht(app, 'source');
      await expect.poll(() => obersteImEditorGesetzt(page).then((z) => nahe(z, 200))).toBe(true);
      await ansicht(app, 'rendered');
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);

      await ansicht(app, 'source');
      await expect.poll(() => obersteImEditorGesetzt(page).then((z) => nahe(z, 200))).toBe(true);
      await rolleZu(page, EDITOR, '.cm-line', 220);
      await ansicht(app, 'rendered');
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 220))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(d) die Stelle stimmt in einem Dokument mit Diagramm oberhalb', async () => {
    const f = legeAn({ mitDiagramm: true });
    const { app, page, userData } = await launchApp({ args: [f.lang] });
    try {
      await expect(page.locator(GEZEICHNET)).toBeVisible();
      await ansicht(app, 'source');
      await page.keyboard.press('Control+e');
      // Ein neuer Knoten im Diagramm: Die Lese-Ansicht zeichnet es nach dem
      // Wechsel neu, und das geht erst nach dem Darstellen fertig.
      // Die Schreibmarke muss im Diagramm stehen, sonst landete der Text
      // anderswo.
      await zeileRuhig(page, 'E[Fertig]');
      await page.locator(`${EDITOR} .cm-line`, { hasText: 'E[Fertig]' }).click();
      expect(await schreibmarke(page)).toMatchObject({ text: '  D --> E[Fertig]' });
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('E --> F[Neu]\nF --> G[Noch einer]\nG --> H[Und noch einer]');
      await rolleZu(page, EDITOR, '.cm-line', 220);

      await ansicht(app, 'rendered');
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block`)).toContainText(
        'Und noch einer',
      );
      // Gemessen wird, wenn die Lese-Ansicht vier Bilder lang ruht.
      await expect
        .poll(() => obersteRuhig(page, GERENDERT, '.markdown-body p').then((z) => nahe(z, 220)))
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(e) nach zwei Sekunden Ruhe liegt die Stelle in der Ablage', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp({ args: [f.lang] });
    try {
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 300);
      const sichtbar = await obersteGerendert(page);
      expect(sichtbar).toBe(300);
      const soll = f.zeileVon[sichtbar];
      const ablage = path.join(userData, 'lese-positionen.json');
      const eintrag = () => {
        const daten = leseJsonOderNull(ablage);
        const eintraege = (daten && daten.eintraege) || {};
        const schluessel = Object.keys(eintraege).find(
          (p) => path.basename(p).toLowerCase() === 'lang.md',
        );
        return schluessel ? eintraege[schluessel].zeileOben : null;
      };
      await expect.poll(() => nahe(eintrag(), soll), { timeout: 10000 }).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  // Im Live-Modus öffnet eine Schreibmarke in einer Tabelle deren Zelle; nach
  // einer Zell-Eingabe stand sie deshalb dort. Zurückgesetzt öffnete sie die
  // Zelle erneut (gemessen am 2026-11-13: in acht von zehn Läufen von TU-06 in
  // `tabellen-zell-uebernahme.spec.js`). Eine Marke im Text bleibt erhalten.
  test('(f) Live-Modus: nach einer Zell-Eingabe erscheint die Tabelle als Tabelle, eine Marke im Text bleibt', async () => {
    const f = legeAn();
    const tabelle = path.join(f.dir, 'tabelle.md');
    fs.copyFileSync(TABELLEN, tabelle);
    const { app, page, userData } = await launchApp({ args: [tabelle, f.kurz] });
    const zelle = page
      .locator(`${SEL.editorContent0} .cm-live-block table`)
      .first()
      .locator('tbody tr')
      .first()
      .locator('td')
      .nth(1);
    const eingabe = page.locator('.cm-live-tabelle-eingabe');
    const hinUndZurueck = async () => {
      await reiter(page, 'kurz').click();
      await expect(page.locator(SEL.editorContent0)).toContainText('Nur ein Absatz');
      await reiter(page, 'tabelle').click();
      await expect(page.locator(SEL.editorContent0)).toContainText('Absatz nach der Tabelle.');
    };
    try {
      await expect(reiter(page, 'kurz')).toBeVisible();
      await reiter(page, 'tabelle').click();
      await ansicht(app, 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(`${PANE} .pane-source-editor`)).not.toHaveClass(/read-only/);

      await zelle.click();
      await expect(eingabe).toBeVisible();
      await page.keyboard.press('End');
      await page.keyboard.type('XX');
      await hinUndZurueck();
      await expect.poll(() => zelle.textContent()).toBe('b1XX');
      // Einige Takte später noch immer zu: Der Beobachter der Auswahl öffnet
      // eine Zelle erst im nächsten Bildschirm-Takt.
      await page.waitForTimeout(300);
      await expect(eingabe).toHaveCount(0);
      await expect(zelle).toHaveText('b1XX');

      await page
        .locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Absatz nach der Tabelle.' })
        .click();
      await page.keyboard.press('Home');
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
      expect(await schreibmarke(page)).toEqual({ text: 'Absatz nach der Tabelle.', spalte: 3 });
      await hinUndZurueck();
      await expect
        .poll(() => schreibmarke(page))
        .toEqual({ text: 'Absatz nach der Tabelle.', spalte: 3 });
      await expect(eingabe).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('LP-01: Wieder geöffnet an der Lese-Stelle', () => {
  test('Lese-Ansicht: nach Schließen und Öffnen über das Bereichs-Panel wieder an Zeile 200', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await oeffneImPanel(page, 'lang');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 200);
      expect(await obersteGerendert(page)).toBe(200);
      await schliesseAktiven(page, 'lang');

      await starteBildMessung(page);
      await oeffneImPanel(page, 'lang');
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);
      await page.waitForTimeout(1500);
      expect(nahe(await obersteGerendert(page), 200)).toBe(true);
      // Kein gezeichnetes Bild zeigt das Dokument zuerst oben.
      const messungen = await bildMessungen(page);
      expect(messungen.length).toBeGreaterThan(0);
      expect(messungen.filter((z) => !nahe(z, 200))).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('Live-Modus: Schreibmarke und oberste Zeile gelten nach dem Öffnen beim Wechsel in den Editor', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await oeffneImPanel(page, 'lang');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await ansicht(app, 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await rolleZu(page, EDITOR, '.cm-line', 205);
      await page.locator(`${EDITOR} .cm-line`, { hasText: 'Zeile 210' }).click();
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      expect(await schreibmarke(page)).toEqual({ text: 'Zeile 210', spalte: 4 });
      const oben = await obersteImEditor(page);
      expect(nahe(oben, 205)).toBe(true);
      await schliesseAktiven(page, 'lang');

      await oeffneImPanel(page, 'lang');
      // Ein wieder geöffnetes Dokument erscheint in der Vorgabe-Ansicht.
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, oben))).toBe(true);
      await ansicht(app, 'live');
      await expect.poll(() => schreibmarke(page)).toEqual({ text: 'Zeile 210', spalte: 4 });
      await expect.poll(() => obersteImEditor(page).then((z) => nahe(z, oben))).toBe(true);
      await expect(page.locator(`${PANE} .tabbar .tab.dirty`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('LP-02: Ein Sprung-Ziel geht der Lese-Stelle vor', () => {
  test('(i) Verweis auf eine Überschrift öffnet an der Überschrift und bleibt dort', async () => {
    const f = legeAn({ kurzText: '# Kurz\n\nNach [[lang#Kapitel 2|Sprung]] weiter.\n' });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await merkeLangBei300(page, f, userData);
      await oeffneImPanel(page, 'kurz');
      await starteBildMessung(page);
      await page.locator(`${SEL.markdownBody0} a.wikilink`, { hasText: 'Sprung' }).click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/^lang/);
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 51))).toBe(true);
      await page.waitForTimeout(3000);
      expect(nahe(await obersteGerendert(page), 51)).toBe(true);
      // Die gemerkte Stelle stand in keinem gezeichneten Bild.
      expect((await bildMessungen(page)).filter((z) => z >= 250)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(ii) Suchtreffer im Bereich öffnet am Treffer', async () => {
    const f = legeAn({ zusatz: { 120: 'Zwiebelkuchen' } });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await merkeLangBei300(page, f, userData);
      await oeffneImPanel(page, 'kurz');
      await page.keyboard.press('Control+f');
      await page.locator('#search-input').fill('Zwiebelkuchen');
      // Nur `lang.md` trägt den Begriff (Muster der Treffer-Liste in BS-05).
      const treffer = page.locator(`${PANE} .sidebar-searchresults .search-results-item`);
      await expect(treffer).toHaveCount(1);
      await treffer.first().click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/^lang/);
      const trefferSichtbar = () =>
        page.evaluate((container) => {
          const sc = document.querySelector(container);
          const p = [...sc.querySelectorAll('.markdown-body p')].find((el) =>
            el.textContent.includes('Zwiebelkuchen'),
          );
          if (!p) return false;
          const a = sc.getBoundingClientRect();
          const b = p.getBoundingClientRect();
          return b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
        }, GERENDERT);
      await expect.poll(trefferSichtbar).toBe(true);
      await page.waitForTimeout(3000);
      expect(await trefferSichtbar()).toBe(true);
      expect(nahe(await obersteGerendert(page), 300)).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  // Rückverweis: Die Zeile des Verweises geht der gemerkten Stelle vor. «lang»
  // verweist in Zeile 040 auf «kurz»; der Klick auf seinen Eintrag im Panel
  // «Backlinks» von «kurz» öffnet «lang» dort (Bedienweg wie VZ-07 b).
  // Gemessen am 2026-11-14: Drei Sicherungen tragen den Vorrang, jede für sich
  // ausreichend: Das Öffnen liest die gemerkte Stelle gar nicht erst (Ziel
  // folgt), und der Sprung verwirft sie zweimal, im Setzen der Schreibmarke und
  // im Bildlauf der Lese-Ansicht, beide vor dem ersten gezeichneten Bild. Erst
  // ohne alle drei steht die Stelle am Reiter; dann zeigt das erste Bild sie,
  // und das zweite Setzen bei wachsendem Inhalt holt sie nach dem Sprung
  // zurück. Test-Eingriff dafür wie in LP-06 (iv) von
  // `lese-position-ablage.spec.js`: Ein hoher Block wird oben in die
  // Lese-Fläche eingefügt, nach dem Sprung, innerhalb der zwei Sekunden des
  // zweiten Setzens und ohne Eingabe davor; die Bildlauf-Verankerung des
  // Browsers hält dabei die gezeigte Zeile, solange nichts nachsetzt.
  test('(v) Rückverweis öffnet an der Zeile des Verweises und bleibt dort', async () => {
    const f = legeAn({ zusatz: { 40: '[[kurz]]' } });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await merkeLangBei300(page, f, userData);
      await oeffneImPanel(page, 'kurz');
      await page.locator('#btn-backlinks').click();
      const treffer = page.locator(`${PANE} .sidebar-backlinks .backlinks-hit`).first();
      await expect(treffer).toBeVisible({ timeout: 20000 });
      await starteBildMessung(page);
      await treffer.click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/^lang/);
      const verweisSichtbar = () =>
        page.evaluate((container) => {
          const sc = document.querySelector(container);
          const p = [...sc.querySelectorAll('.markdown-body p')].find((el) =>
            el.textContent.trim().startsWith('Zeile 040'),
          );
          if (!p) return false;
          const a = sc.getBoundingClientRect();
          const b = p.getBoundingClientRect();
          return b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
        }, GERENDERT);
      await expect.poll(verweisSichtbar).toBe(true);
      // Gewachsen wird erst, wenn der sanfte Bildlauf zur Zeile angekommen ist;
      // mitten in ihm verschöbe das Wachsen sein Ziel.
      await expect
        .poll(() => obersteRuhig(page, GERENDERT, '.markdown-body p').then((z) => nahe(z, 40)))
        .toBe(true);
      await page.evaluate((s) => {
        const block = document.createElement('div');
        block.style.height = '3000px';
        document.querySelector(s).prepend(block);
      }, SEL.markdownBody0);
      await page.waitForTimeout(3000);
      expect(await verweisSichtbar()).toBe(true);
      expect(nahe(await obersteGerendert(page), 300)).toBe(false);
      // Die gemerkte Stelle stand in keinem gezeichneten Bild.
      expect((await bildMessungen(page)).filter((z) => z >= 250)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  // 4T-002783: Rückverweis in der Quellcode-Ansicht. Der Sprung setzt die
  // Schreibmarke auf die Zeile des Verweises; bis zum 2026-11-22 holte die
  // Wiederherstellung der gemerkten Bildlauf-Lage beim Zeichnen des Reiters
  // den Ausschnitt danach an den Anfang zurück, und die Zeile stand außer
  // Sicht. Geprüft für ein geschlossenes und ein schon geöffnetes Dokument;
  // nach drei Sekunden steht die Zeile weiter im Bild.
  for (const offen of [false, true]) {
    const fall = offen ? 'Dokument schon offen' : 'Dokument geschlossen';
    test(`(vi) Rückverweis in der Quellcode-Ansicht zeigt die Zeile des Verweises, ${fall}`, async () => {
      const f = legeAn({ zusatz: { 300: '[[kurz]]' } });
      const { app, page, userData } = await launchApp({
        settings: { language: 'de', app: { defaultViewMode: 'source' } },
      });
      try {
        await bindeBereich(page, f.dir);
        if (offen) await oeffneImPanel(page, 'lang');
        await oeffneImPanel(page, 'kurz');
        await page.locator('#btn-backlinks').click();
        const treffer = page.locator(`${PANE} .sidebar-backlinks .backlinks-hit`).first();
        await expect(treffer).toBeVisible({ timeout: 20000 });
        await treffer.click();
        await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/^lang/);
        await expect
          .poll(() => schreibmarke(page))
          .toEqual({ text: 'Zeile 300 [[kurz]]', spalte: 0 });
        await expect.poll(() => markeImBild(page)).toBe(true);
        await page.waitForTimeout(3000);
        expect(await markeImBild(page)).toBe(true);
      } finally {
        await closeApp(app, userData, { force: true });
        raeumeAuf(f.dir);
      }
    });
  }

  // Ein Lesezeichen zeigt auf ein Dokument, nicht auf eine Zeile (Entscheidung
  // des Product Owners vom 2026-11-13): Es öffnet an der gemerkten Stelle, und
  // ein schon geöffnetes Dokument kommt nach vorn und bleibt, wo es steht.
  test('(iii) Lesezeichen öffnet ein geschlossenes Dokument an seiner gemerkten Stelle', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await merkeLangBei300(page, f, userData);
      const eintrag = await setzeLesezeichen(page, 'lang');
      await expect(reiter(page, 'lang')).toHaveCount(0);
      await starteBildMessung(page);
      await eintrag.click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/^lang/);
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 300))).toBe(true);
      await page.waitForTimeout(1500);
      expect(nahe(await obersteGerendert(page), 300)).toBe(true);
      // Kein gezeichnetes Bild zeigt das Dokument zuerst an einer anderen Stelle.
      expect((await bildMessungen(page)).filter((z) => !nahe(z, 300))).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(iv) Lesezeichen holt ein geöffnetes Dokument nach vorn, ohne es zu verschieben', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await oeffneImPanel(page, 'kurz');
      await oeffneImPanel(page, 'lang');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 200);
      const eintrag = await setzeLesezeichen(page, 'lang');
      await reiter(page, 'kurz').click();
      await expect(page.locator(SEL.markdownBody0)).toContainText('Nur ein Absatz');
      await eintrag.click();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(/^lang/);
      // Kein zweiter Reiter für dasselbe Dokument.
      await expect(page.locator(SEL.tabs0).filter({ hasText: 'lang' })).toHaveCount(1);
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);
      await page.waitForTimeout(1500);
      expect(nahe(await obersteGerendert(page), 200)).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// Legt über das Kontextmenü des Bereichs-Panels ein Lesezeichen auf die Datei
// `name` an (Bedienweg aus bereichs-lesezeichen.spec.js) und gibt seine Zeile
// im Lesezeichen-Panel zurück.
async function setzeLesezeichen(page, name) {
  await page
    .locator(`${PANE} .sidebar-area .area-file-row`)
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click({ button: 'right' });
  await page.locator('#context-menu [data-menu-id="area-file-bookmark"]').click();
  const eintrag = page
    .locator(`${PANE} .bookmarks-area-tree .bookmark-row`)
    .filter({ hasText: name });
  await expect(eintrag).toBeVisible();
  return eintrag;
}

const aktiverTitel = (page) => page.locator(SEL.activeTab0).locator('.tab-title');

test.describe('LP-03: Lese-Stellen überstehen den Neustart', () => {
  test('(i) sofort beendet: Stelle in der Ablage, wiederhergestellter Reiter an seiner Stelle', async () => {
    const f = legeAn();
    const erster = await launchApp({ args: [f.lang] });
    const userData = erster.userData;
    try {
      await expect(erster.page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(erster.page, GERENDERT, '.markdown-body p', 200);
      expect(await obersteGerendert(erster.page)).toBe(200);
      await beende(erster.app);
      expect(nahe(gemerkteZeile(userData, 'lang.md'), f.zeileVon[200])).toBe(true);

      const zweiter = await launchApp({ userData });
      try {
        await expect(aktiverTitel(zweiter.page)).toHaveText(/^lang/);
        await expect
          .poll(() => obersteGerendert(zweiter.page).then((z) => nahe(z, 200)))
          .toBe(true);
      } finally {
        await closeApp(zweiter.app, null, { force: true });
      }
    } finally {
      await closeApp(erster.app, userData);
      raeumeAuf(f.dir);
    }
  });

  test('(ii) zwei Reiter: der aktive an seiner Stelle, der andere beim Wechsel auf ihn', async () => {
    const f = legeAn({ zweites: true });
    const erster = await launchApp({ args: [f.lang, f.lang2] });
    const userData = erster.userData;
    const ersterReiter = (page) => page.locator(SEL.tabs0).filter({ hasNotText: 'lang2' }).first();
    try {
      const p1 = erster.page;
      await expect(reiter(p1, 'lang2')).toBeVisible();
      await ersterReiter(p1).click();
      await expect(aktiverTitel(p1)).not.toHaveText(/lang2/);
      await expect(p1.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(p1, GERENDERT, '.markdown-body p', 150);
      await reiter(p1, 'lang2').click();
      await expect(aktiverTitel(p1)).toHaveText(/lang2/);
      await rolleZu(p1, GERENDERT, '.markdown-body p', 250);
      await beende(erster.app);

      const zweiter = await launchApp({ userData });
      try {
        const p2 = zweiter.page;
        await expect(aktiverTitel(p2)).toHaveText(/lang2/);
        await expect.poll(() => obersteGerendert(p2).then((z) => nahe(z, 250))).toBe(true);
        await ersterReiter(p2).click();
        await expect(aktiverTitel(p2)).not.toHaveText(/lang2/);
        await expect.poll(() => obersteGerendert(p2).then((z) => nahe(z, 150))).toBe(true);
      } finally {
        await closeApp(zweiter.app, null, { force: true });
      }
    } finally {
      await closeApp(erster.app, userData);
      raeumeAuf(f.dir);
    }
  });

  test('(iii) geschlossen, beendet, neu gestartet: über das Bereichs-Panel an seiner Stelle', async () => {
    const f = legeAn();
    const erster = await launchApp();
    const userData = erster.userData;
    try {
      await bindeBereich(erster.page, f.dir);
      await oeffneImPanel(erster.page, 'lang');
      await expect(erster.page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(erster.page, GERENDERT, '.markdown-body p', 200);
      await schliesseAktiven(erster.page, 'lang');
      await beende(erster.app);

      const zweiter = await launchApp({ userData });
      try {
        await bindeBereich(zweiter.page, f.dir);
        await oeffneImPanel(zweiter.page, 'lang');
        await expect
          .poll(() => obersteGerendert(zweiter.page).then((z) => nahe(z, 200)))
          .toBe(true);
      } finally {
        await closeApp(zweiter.app, null, { force: true });
      }
    } finally {
      await closeApp(erster.app, userData);
      raeumeAuf(f.dir);
    }
  });
});
