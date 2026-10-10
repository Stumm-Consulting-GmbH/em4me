// 4T-001312 (Epic 3E-000235): Hängender Einzug umgebrochener Zeilen im Editor.
//
// Die Rechnung prüft `test/unit/haengender-einzug.test.js`. Hier wird
// gemessen, ob sie im laufenden Editor auch ankommt: Eine umgebrochene
// Listen-Zeile muss auf ihrer zweiten Bildschirm-Zeile weiter rechts beginnen
// als auf der ersten, ein gewöhnlicher Absatz nicht.
//
// Gemessen wird über die Zeilen-Kästen des Textes selbst (Range-Rechtecke) und
// nicht über den berechneten Stilwert: Ein gesetzter Stilwert beweist nicht,
// dass die Darstellung ihm folgt.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'zeilenumbruch.md');

async function sendMenuChannel(app, channel, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Linke Kanten der Bildschirm-Zeilen einer Editor-Zeile, von oben nach unten.
// Mehr als ein Wert bedeutet: Die Zeile ist umgebrochen.
//
// Die Rechtecke eines Bereichs kommen je Textstück und nicht je
// Bildschirm-Zeile — eine hervorgehobene Zeile besteht aus mehreren Stücken.
// Gruppiert wird deshalb nach der Oberkante, und je Gruppe zählt die
// linkeste Kante.
async function linkeKanten(page, index) {
  return await page.evaluate((i) => {
    const zeilen = [...document.querySelectorAll('.cm-editor .cm-line')];
    const zeile = zeilen[i];
    if (!zeile) return null;
    const range = document.createRange();
    range.selectNodeContents(zeile);
    const reihen = new Map();
    for (const r of range.getClientRects()) {
      if (r.width <= 0) continue;
      const oben = Math.round(r.top);
      const bisher = reihen.get(oben);
      if (bisher === undefined || r.left < bisher) reihen.set(oben, r.left);
    }
    return [...reihen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, links]) => Math.round(links * 100) / 100);
  }, index);
}

test.describe('ZU-01: Hängender Einzug umgebrochener Zeilen', () => {
  test('Listen-Zeilen setzen eingerückt fort, ein Absatz bleibt linksbündig', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Die Fixture trägt den Umbruch im Frontmatter; ohne ihn gäbe es keine
      // Fortsetzungs-Zeile zu messen.
      const dekoriert = page.locator('.cm-editor .cm-line.cm-haengender-einzug');
      await expect(dekoriert.first()).toBeAttached();

      // Zeilen der Fixture: 0..2 Frontmatter, 3 leer, 4 Aufzählung, 5 leer,
      // 6 nummeriert, 7 leer, 8 Absatz.
      const aufzaehlung = await linkeKanten(page, 4);
      const nummeriert = await linkeKanten(page, 6);
      const absatz = await linkeKanten(page, 8);

      // Jede der drei Zeilen bricht um; sonst misst der Fall nichts.
      expect(aufzaehlung.length).toBeGreaterThan(1);
      expect(nummeriert.length).toBeGreaterThan(1);
      expect(absatz.length).toBeGreaterThan(1);

      // Listen-Zeilen: die Fortsetzung beginnt weiter rechts als der Anfang.
      expect(aufzaehlung[1]).toBeGreaterThan(aufzaehlung[0]);
      expect(nummeriert[1]).toBeGreaterThan(nummeriert[0]);
      // Die nummerierte Liste rückt weiter ein als die Aufzählung ('1. ' gegen
      // '- '), gemessen als Abstand der Fortsetzung zum Zeilen-Anfang.
      expect(nummeriert[1] - nummeriert[0]).toBeGreaterThan(aufzaehlung[1] - aufzaehlung[0]);
      // Alle Fortsetzungs-Zeilen liegen auf derselben Kante.
      for (const kante of aufzaehlung.slice(1)) expect(kante).toBeCloseTo(aufzaehlung[1], 1);

      // Der Absatz bleibt unverändert linksbündig.
      expect(absatz[1]).toBeCloseTo(absatz[0], 1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('im Live-Modus gilt dieselbe Einrückung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('.cm-editor .cm-line.cm-haengender-einzug').first()).toBeAttached();
      const aufzaehlung = await linkeKanten(page, 4);
      expect(aufzaehlung.length).toBeGreaterThan(1);
      expect(aufzaehlung[1]).toBeGreaterThan(aufzaehlung[0]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  // Die Einrückung ist rein darstellend. Der Nachweis dafür ist die Zuordnung
  // von Bildschirm-Position zu Text-Position: Ein Klick auf den Anfang der
  // zweiten Bildschirm-Zeile muss die Schreibmarke genau dort absetzen, nicht
  // um den Einzug versetzt.
  test('die Schreibmarke folgt dem Klick auch in der eingerückten Fortsetzung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const kanten = await linkeKanten(page, 4);
      expect(kanten.length).toBeGreaterThan(1);
      const zweiteReihe = await page.evaluate(() => {
        const zeile = [...document.querySelectorAll('.cm-editor .cm-line')][4];
        const range = document.createRange();
        range.selectNodeContents(zeile);
        const reihen = new Map();
        for (const r of range.getClientRects()) {
          if (r.width <= 0) continue;
          const oben = Math.round(r.top);
          if (!reihen.has(oben)) reihen.set(oben, r);
        }
        const sortiert = [...reihen.entries()].sort((a, b) => a[0] - b[0]);
        const r = sortiert[1][1];
        return { x: r.left + 1, y: r.top + r.height / 2 };
      });
      const leseMarke = () =>
        page.evaluate(() => {
          const el = document.querySelector('.cm-editor .cm-cursor-primary');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, height: r.height };
        });
      await page.mouse.click(zweiteReihe.x, zweiteReihe.y);
      // Die Marke folgt dem Klick erst im Mess-Zyklus des Editors, nicht im
      // Klick selbst. Gemessen am 2026-09-14 (Bild-für-Bild-Abtastung nach dem
      // Klick): Im ERSTEN Bild zeichnet CodeMirror die Marke noch an der
      // Auswahl vor dem Klick — Text-Anfang, left 57,81 / top 91 —, erst im
      // zweiten steht sie an der geklickten Stelle (left 73,20 / top 196). Ein
      // unmittelbares Auslesen trifft unter Last das erste Bild und misst dann
      // 16,98 px Abstand statt 1,59; genau so riss der Fall im E2E-Voll-Lauf
      // vom 2026-09-14, während er isoliert grün blieb. Gewartet wird deshalb
      // auf die Reihe, in die geklickt wurde. Der Fall verliert dadurch nichts:
      // Setzt der Editor die Marke dauerhaft falsch, bleibt die Reihe aus und
      // das Warten läuft ab — steht sie in der Reihe, misst die Zusicherung
      // darunter unverändert die waagerechte Lage.
      let marke = null;
      await expect
        .poll(async () => {
          marke = await leseMarke();
          return !!(
            marke &&
            marke.height > 0 &&
            marke.top < zweiteReihe.y &&
            zweiteReihe.y < marke.top + marke.height
          );
        })
        .toBe(true);
      // Die Schreibmarke steht dort, wo geklickt wurde: waagerecht am Anfang
      // der Fortsetzung, senkrecht in ihrer Reihe.
      expect(Math.abs(marke.left - zweiteReihe.x)).toBeLessThan(8);
      expect(zweiteReihe.y).toBeGreaterThan(marke.top);
      expect(zweiteReihe.y).toBeLessThan(marke.top + marke.height);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('ohne Umbruch ändert sich nichts', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      // Umbruch abschalten: die Zeile läuft dann in einer Bildschirm-Zeile
      // durch, und es gibt keine Fortsetzung, die eingerückt werden könnte.
      await page.locator('#btn-wrap').click();
      await expect.poll(async () => (await linkeKanten(page, 4)).length).toBe(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// === 4T-001716 (Epic 3E-000301): Zeilenumbruch innerhalb eines Listenpunkts ===
//
// ZU-02 bis ZU-06 prüfen am laufenden Programm, was die Unit-Fälle in
// test/unit/renderer/listen-zeilenumbruch.test.js nicht erreichen: den echten
// Tastendruck Umschalt+Eingabe, die Lage der Folgezeile und der Fortsetzung
// unter dem Aufgaben-Text in Quellcode- und Live-Ansicht (AK3, AK14), den
// verborgenen Rückstrich der Live-Ansicht (AK19) und die Listen-Operationen an
// einem Punkt mit Folgezeile (AK8). Gemessen wird wie in ZU-01 über die
// Rechtecke des Textes selbst.

const LISTEN = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'listen-zeilenumbruch.md',
);

// Ansicht wählen und das Dokument bearbeitbar schalten (Muster enterEditSource
// in bearbeitung-und-ansicht.spec.js).
async function bearbeitbar(app, page, ansicht) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', ansicht);
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Lage einer Editor-Zeile, gefunden über ein Wort in ihr: die linke Kante des
// Wort-Anfangs und die linken Kanten ihrer Bildschirm-Zeilen. Gezählt werden
// nur Text-Knoten mit Breite, damit das gezeichnete Kästchen der Live-Ansicht
// keine eigene Reihe bildet (Hinweis zu A2 der Messung vom 2026-10-07).
async function lage(page, wort) {
  return await page.evaluate((w) => {
    const zeile = [...document.querySelectorAll('.cm-editor .cm-line')].find((z) =>
      z.textContent.includes(w),
    );
    if (!zeile) return null;
    const reihen = new Map();
    let wortKante = null;
    const walker = document.createTreeWalker(zeile, NodeFilter.SHOW_TEXT);
    for (let knoten = walker.nextNode(); knoten; knoten = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(knoten);
      for (const r of range.getClientRects()) {
        if (r.width <= 0) continue;
        const oben = Math.round(r.top);
        const bisher = reihen.get(oben);
        if (bisher === undefined || r.left < bisher) reihen.set(oben, r.left);
      }
      const stelle = knoten.data.indexOf(w);
      if (wortKante === null && stelle >= 0) {
        const zeichen = document.createRange();
        zeichen.setStart(knoten, stelle);
        zeichen.setEnd(knoten, stelle + 1);
        wortKante = zeichen.getBoundingClientRect().left;
      }
    }
    const kanten = [...reihen.entries()].sort((a, b) => a[0] - b[0]).map(([, links]) => links);
    return { kanten, wortKante };
  }, wort);
}

// Breite des letzten Rückstrichs in der Zeile mit `wort`; 0 heißt verborgen.
async function rueckstrichBreite(page, wort) {
  return await page.evaluate((w) => {
    const zeile = [...document.querySelectorAll('.cm-editor .cm-line')].find((z) =>
      z.textContent.includes(w),
    );
    if (!zeile) return null;
    const walker = document.createTreeWalker(zeile, NodeFilter.SHOW_TEXT);
    let letzter = null;
    for (let knoten = walker.nextNode(); knoten; knoten = walker.nextNode()) {
      const stelle = knoten.data.lastIndexOf('\\');
      if (stelle >= 0) letzter = { knoten, stelle };
    }
    if (!letzter) return null;
    const range = document.createRange();
    range.setStart(letzter.knoten, letzter.stelle);
    range.setEnd(letzter.knoten, letzter.stelle + 1);
    return range.getBoundingClientRect().width;
  }, wort);
}

const zeilenTexte = (page) =>
  page.locator(SEL.editorContent0).locator('.cm-line').allTextContents();

// Vier Zeilen ab der Zeile mit genau dem Text `erste`; null, wenn sie fehlt.
async function block(page, erste) {
  const texte = await zeilenTexte(page);
  const i = texte.indexOf(erste);
  return i >= 0 ? texte.slice(i, i + 4) : null;
}

// Schreibmarke an das Ende der Zeile mit `wort`.
async function markeAnsEnde(page, wort) {
  await page.locator(SEL.editorContent0).locator('.cm-line', { hasText: wort }).first().click();
  await page.keyboard.press('End');
}

test.describe('ZU-02: Umschalt+Eingabe beginnt eine Folgezeile im Listenpunkt', () => {
  test('Rückstrich am Zeilenende, Folgezeile eingerückt bis zum Aufgaben-Text (AK1, AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN] });
    try {
      await bearbeitbar(app, page, 'source');
      await markeAnsEnde(page, 'Aufgabe kurz');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('Folgetext');
      await expect
        .poll(async () => (await block(page, '- [ ] Aufgabe kurz\\')) || [])
        .toEqual(['- [ ] Aufgabe kurz\\', '      Folgetext', '', '1. [ ] Nummeriert kurz']);
      await markeAnsEnde(page, 'Nummeriert kurz');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('Nachtext');
      await expect
        .poll(async () => ((await block(page, '1. [ ] Nummeriert kurz\\')) || []).slice(0, 2))
        .toEqual(['1. [ ] Nummeriert kurz\\', '       Nachtext']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('ZU-03: Fortsetzung einer Aufgabe beginnt unter dem Aufgaben-Text (AK3, AK14)', () => {
  for (const ansicht of ['source', 'live']) {
    test(`umgebrochene Aufgabe mit Strich und mit Nummer, Ansicht ${ansicht}`, async () => {
      const { app, page, userData } = await launchApp({ args: [LISTEN] });
      try {
        await bearbeitbar(app, page, ansicht);
        // Schreibmarke weit weg von beiden gemessenen Zeilen, damit die
        // Live-Ansicht dort das gezeichnete Kästchen zeigt.
        await markeAnsEnde(page, 'Drei');
        for (const wort of ['Alpha', 'Bravo']) {
          let gemessen = null;
          await expect
            .poll(async () => {
              gemessen = await lage(page, wort);
              return gemessen ? gemessen.kanten.length : 0;
            })
            .toBeGreaterThan(1);
          const abstand = Math.abs(gemessen.kanten[1] - gemessen.wortKante);
          expect(abstand, `${wort}: ${JSON.stringify(gemessen)}`).toBeLessThanOrEqual(1);
        }
      } finally {
        await closeApp(app, userData, { force: true });
      }
    });
  }
});

// Waagerechter Abstand zwischen dem Text-Anfang der Aufgabe und dem der
// Folgezeile; null, solange eine der beiden Zeilen nicht messbar ist.
async function textAbstand(page, punkt, folge) {
  const oben = await lage(page, punkt);
  const unten = await lage(page, folge);
  if (!oben || !unten || oben.wortKante === null || unten.wortKante === null) return null;
  return Math.abs(unten.wortKante - oben.wortKante);
}

// In der Live-Ansicht in drei Lagen der Schreibmarke: in einer fremden Zeile
// (Kästchen gezeichnet), in der Folgezeile (Kästchen darüber weiter
// gezeichnet, die Korrektur bleibt) und in der Aufgaben-Zeile selbst (rohes
// `[ ]`, keine Korrektur). Gewartet wird auf den Abstand selbst, weil die
// Dekorationen der Live-Ansicht der Schreibmarke erst im nächsten Aufbau
// folgen.
test.describe('ZU-04: Folgezeile nach dem Kürzel beginnt unter dem Aufgaben-Text (AK3, AK14)', () => {
  for (const ansicht of ['source', 'live']) {
    test(`Aufgabe mit Strich und mit Nummer, Ansicht ${ansicht}`, async () => {
      const { app, page, userData } = await launchApp({ args: [LISTEN] });
      try {
        await bearbeitbar(app, page, ansicht);
        const paare = [
          ['Aufgabe kurz', 'Folgetext'],
          ['Nummeriert kurz', 'Nachtext'],
        ];
        for (const [punkt, folge] of paare) {
          await markeAnsEnde(page, punkt);
          await page.keyboard.press('Shift+Enter');
          await page.keyboard.type(folge);
        }
        for (const [punkt, folge] of paare) {
          for (const marke of ['Drei', folge, punkt]) {
            await markeAnsEnde(page, marke);
            await expect
              .poll(() => textAbstand(page, punkt, folge), { message: `${punkt}, Marke ${marke}` })
              .toBeLessThanOrEqual(1);
          }
        }
      } finally {
        await closeApp(app, userData, { force: true });
      }
    });
  }
});

test.describe('ZU-05: Rückstrich in der Live-Ansicht (AK19)', () => {
  test('verborgen außerhalb der Schreibmarken-Zeile, sichtbar und löschbar in ihr', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN] });
    try {
      await bearbeitbar(app, page, 'live');
      await markeAnsEnde(page, 'anderer Punkt');
      await expect.poll(() => rueckstrichBreite(page, 'erste Zeile')).toBe(0);
      await markeAnsEnde(page, 'erste Zeile');
      await expect.poll(() => rueckstrichBreite(page, 'erste Zeile')).toBeGreaterThan(0);
      // Löschbar: Die Rücktaste am Zeilenende nimmt ihn als erstes Zeichen.
      await page.keyboard.press('Backspace');
      await expect.poll(async () => (await zeilenTexte(page)).includes('- erste Zeile')).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('ZU-06: Listen-Operationen nehmen die Folgezeile mit (AK8)', () => {
  test('Einrücken, Ausrücken und Verschieben eines Punkts mit Folgezeile', async () => {
    const { app, page, userData } = await launchApp({ args: [LISTEN] });
    try {
      await bearbeitbar(app, page, 'source');
      // Mit Rückstrich: hasText sucht ohne Groß-Kleinschreibung und träfe
      // sonst schon «zweite Zeile» weiter oben.
      await markeAnsEnde(page, 'Zwei\\');
      await page.keyboard.press('Tab');
      await expect
        .poll(() => block(page, '- Eins'))
        .toEqual(['- Eins', '  - Zwei\\', '    Fortsetzung Zwei', '- Drei']);
      await page.keyboard.press('Shift+Tab');
      await expect
        .poll(() => block(page, '- Eins'))
        .toEqual(['- Eins', '- Zwei\\', '  Fortsetzung Zwei', '- Drei']);
      await page.keyboard.press('Alt+ArrowDown');
      await expect
        .poll(() => block(page, '- Eins'))
        .toEqual(['- Eins', '- Drei', '- Zwei\\', '  Fortsetzung Zwei']);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// === 4T-001716 (Epic 3E-000301): zweite Zeile einer Aufgabe in «Gerendert» ===
//
// Entscheidung des Product Owners vom 2026-10-09 nach Beobachtung 3 der
// Abnahme: Auch in der gesetzten Darstellung beginnt die zweite Zeile einer
// Aufgabe unter dem Text der ersten Zeile und nicht unter dem Kästchen
// (hängender Einzug hinter dem Kästchen). Dasselbe gilt für eine lange
// Aufgaben-Zeile, die der Fensterrand umbricht. Gemessen wird wie oben über
// die Rechtecke des Textes selbst (Range.getClientRects() der Textknoten).

const GERENDERT = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'listen-zeilenumbruch-gerendert.md',
);

// Lage eines Listenpunkts der gesetzten Darstellung, gefunden über das erste
// Wort seines eigenen Textes: linke Kante des Wortes in der ersten Zeile
// (`erste`), linke Kante von «<Wort> zweite» in der Zeile nach dem harten
// Umbruch (`zweite`, sonst null), die linken Kanten der Bildschirm-Zeilen des
// ersten Absatzes (`kanten`; Leerraum am Anfang eines Textknotens zählt nicht),
// die Lage des Kästchens und der ersten Text-Zeile und die linke Kante des
// Punkts selbst. Text in Unterlisten gehört nicht zum Punkt.
async function gerenderteLage(page, wort) {
  return await page.evaluate((w) => {
    const body = document.querySelector('.pane-group[data-pane="0"] .pane-rendered .markdown-body');
    if (!body) return null;
    // Eigener Text des Punkts: ohne Unterlisten und ohne das Status-Zeichen im
    // Kästchen, das kein Text der Zeile ist.
    const eigeneTexte = (li) => {
      const texte = [];
      const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
      for (let k = walker.nextNode(); k; k = walker.nextNode()) {
        if (k.parentElement.closest('li') !== li) continue;
        if (k.parentElement.closest('.task-state-box')) continue;
        texte.push(k);
      }
      return texte;
    };
    const li = [...body.querySelectorAll('li')].find((el) => {
      const erster = eigeneTexte(el).find((k) => k.data.trim() !== '');
      return erster && erster.data.trim().startsWith(w);
    });
    if (!li) return null;
    const zeichenLinks = (knoten, stelle) => {
      const r = document.createRange();
      r.setStart(knoten, stelle);
      r.setEnd(knoten, stelle + 1);
      return r.getBoundingClientRect().left;
    };
    let erste = null;
    let zweite = null;
    const reihen = new Map();
    const ersterAbsatz = li.querySelector(':scope > p') || li;
    for (const knoten of eigeneTexte(li)) {
      if (erste === null) {
        const stelle = knoten.data.indexOf(w);
        if (stelle >= 0) erste = zeichenLinks(knoten, stelle);
      }
      const stelleZwei = knoten.data.indexOf(`${w} zweite`);
      if (zweite === null && stelleZwei >= 0) zweite = zeichenLinks(knoten, stelleZwei);
      if (!ersterAbsatz.contains(knoten)) continue;
      const anfang = knoten.data.length - knoten.data.trimStart().length;
      if (anfang >= knoten.data.length) continue;
      const range = document.createRange();
      range.setStart(knoten, anfang);
      range.setEnd(knoten, knoten.data.length);
      for (const r of range.getClientRects()) {
        if (r.width <= 0) continue;
        const oben = Math.round(r.top);
        const bisher = reihen.get(oben);
        if (bisher === undefined || r.left < bisher.links) {
          reihen.set(oben, { links: r.left, oben: r.top, unten: r.bottom });
        }
      }
    }
    const zeilen = [...reihen.entries()].sort((a, b) => a[0] - b[0]).map(([, z]) => z);
    const kasten = li.querySelector(
      ':scope > label > input, :scope > p > label > input, :scope > .task-state-box, :scope > p > .task-state-box',
    );
    const kastenRect = kasten ? kasten.getBoundingClientRect() : null;
    const runde = (x) => (x === null ? null : Math.round(x * 100) / 100);
    return {
      erste: runde(erste),
      zweite: runde(zweite),
      kanten: zeilen.map((z) => runde(z.links)),
      ersteZeile: zeilen.length
        ? { oben: runde(zeilen[0].oben), unten: runde(zeilen[0].unten) }
        : null,
      kasten: kastenRect
        ? {
            links: runde(kastenRect.left),
            oben: runde(kastenRect.top),
            mitte: runde((kastenRect.top + kastenRect.bottom) / 2),
          }
        : null,
      punktLinks: runde(li.getBoundingClientRect().left),
    };
  }, wort);
}

test.describe('ZU-07: Zweite Zeile einer Aufgabe in «Gerendert» unter dem Text', () => {
  test('harter Umbruch und Fensterrand, Aufzählung und Nummer, verschachtelt', async () => {
    const { app, page, userData } = await launchApp({ args: [GERENDERT] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(
        page.locator(SEL.markdownBody0).locator('li.task-list-item').first(),
      ).toBeVisible();
      const mitUmbruch = ['Kilo', 'Lima', 'Mike', 'Papa', 'Quebec', 'Romeo', 'Uniform'];
      const gemessen = {};
      for (const wort of mitUmbruch) {
        await expect
          .poll(async () => {
            gemessen[wort] = await gerenderteLage(page, wort);
            return !!(gemessen[wort] && gemessen[wort].zweite !== null);
          })
          .toBe(true);
      }
      for (const wort of ['Sierra', 'Tango', 'Victor', 'Whiskey', 'Xray', 'Yankee']) {
        gemessen[wort] = await gerenderteLage(page, wort);
        expect(gemessen[wort], wort).not.toBeNull();
      }
      const protokoll = JSON.stringify(gemessen);

      // Harter Umbruch: Aufgabe mit Strich, erledigte, nummerierte,
      // verschachtelte Aufgabe und Aufgabe mit erweitertem Status-Zeichen;
      // dazu der gewöhnliche Listenpunkt (Romeo) und die Aufgabe mit zwei
      // Absätzen (Uniform). Die zweite Zeile beginnt an der Kante des ersten
      // Wortes.
      for (const wort of mitUmbruch) {
        const { erste, zweite } = gemessen[wort];
        expect(Math.abs(zweite - erste), `${wort}: ${protokoll}`).toBeLessThanOrEqual(1);
      }

      // Fensterrand: Die lange Aufgaben-Zeile bricht um, und jede weitere
      // Bildschirm-Zeile beginnt an der Kante des ersten Wortes.
      for (const wort of ['Sierra', 'Tango']) {
        const { erste, kanten } = gemessen[wort];
        expect(kanten.length, `${wort}: ${protokoll}`).toBeGreaterThan(1);
        for (const kante of kanten.slice(1)) {
          expect(Math.abs(kante - erste), `${wort}: ${protokoll}`).toBeLessThanOrEqual(1);
        }
      }

      // Das Kästchen steht vor dem Text und senkrecht in der ersten Zeile.
      for (const wort of ['Kilo', 'Lima', 'Mike', 'Papa', 'Quebec', 'Sierra', 'Tango', 'Uniform']) {
        const { kasten, ersteZeile, erste } = gemessen[wort];
        expect(kasten, `${wort}: ${protokoll}`).not.toBeNull();
        expect(kasten.links, `${wort}: ${protokoll}`).toBeLessThan(erste);
        expect(kasten.mitte, `${wort}: ${protokoll}`).toBeGreaterThan(ersteZeile.oben);
        expect(kasten.mitte, `${wort}: ${protokoll}`).toBeLessThan(ersteZeile.unten);
      }

      // Eine Unterliste unter einer Aufgabe rückt nicht weiter ein als unter
      // einem gewöhnlichen Punkt: Der Einzug gilt dem Text, nicht der Liste.
      const unterAufgabe = gemessen.Whiskey.punktLinks - gemessen.Victor.punktLinks;
      const unterPunkt = gemessen.Yankee.punktLinks - gemessen.Xray.punktLinks;
      expect(Math.abs(unterAufgabe - unterPunkt), protokoll).toBeLessThanOrEqual(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
