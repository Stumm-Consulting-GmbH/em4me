// 4T-002107 (Epic 3E-000323): Die Dokument-Suche in den Ansichten Quellcode,
// Live und Gerendert — der erste Sprung nach dem Tippen.
//
// Kern der Zusage (Entscheidung des Product Owners vom 2026-10-03): «Die erste
// Eingabetaste soll zum ersten Treffer springen.» Das Tippen ermittelt die
// Treffer neu und markiert den ersten als aktuellen («1 / n»), bewegt aber
// weder Schreibmarke noch Bildlauf (B-10, 4T-000904). Vor der Behebung ging die
// erste Eingabetaste von dort zum ZWEITEN Treffer; der als «1 / n» gemeldete
// war nie zu sehen. Jetzt zeigt die erste Eingabetaste ihn, erst die zweite
// geht weiter.
//
// Alle drei Ansichten, weil der Ansichts-Modus Teil des Szenarios ist
// (Stabilitätsregel aus B-10): Quellcode und Live laufen über die Editor-
// Markierung, Gerendert über die Markierung der Lese-Ansicht.
//
// 4T-002125 (SD-02): In «Gerendert» trägt jeder Treffer eine Kontur, die ihn
// vom Textmarker `==Text==` unterscheidet, auch wenn er in einem liegt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PANE = '.pane-group[data-pane="0"]';
const BEGRIFF = 'Quittentreffer';

// Drei Treffer, alle weit unterhalb des ersten Bildschirms; der erste ist also
// nach dem Tippen nicht zu sehen, solange sich nichts bewegt.
function langerText() {
  const z = ['# Probe 4T-002107', '', 'Zeile oben ohne Begriff.', ''];
  for (let i = 1; i <= 120; i++) z.push(`Fülltext ${i}.`, '');
  z.push(`Erster ${BEGRIFF} hier.`, '');
  for (let i = 1; i <= 40; i++) z.push(`Mitte ${i}.`, '');
  z.push(`Zweiter ${BEGRIFF} hier.`, '');
  for (let i = 1; i <= 40; i++) z.push(`Unten ${i}.`, '');
  z.push(`Dritter ${BEGRIFF} hier.`, '');
  return z.join('\n');
}

// Die Lage der Suche in der aktiven Spalte: Bildlauf, Zeile der Schreibmarke
// (nur im Editor) und die Zeile des aktuellen Treffers samt Sichtbarkeit.
function lage(page, imEditor) {
  return page.evaluate(
    ({ pane, editor }) => {
      const p = document.querySelector(pane);
      const roll = editor
        ? p.querySelector('.pane-source .cm-scroller')
        : p.querySelector('.pane-rendered');
      const aktuell = editor
        ? p.querySelector('.pane-source .cm-search-match-current')
        : p.querySelector('.pane-rendered mark.mdv-match-current');
      const marke = editor ? p.querySelector('.pane-source .cm-activeLine') : null;
      let treffer = '';
      let sichtbar = false;
      if (aktuell) {
        const r = aktuell.getBoundingClientRect();
        const c = roll.getBoundingClientRect();
        sichtbar = r.top >= c.top && r.bottom <= c.bottom;
        const zeile = aktuell.closest(editor ? '.cm-line' : 'p');
        treffer = zeile ? zeile.textContent : '';
      }
      return {
        rollen: Math.round(roll.scrollTop),
        schreibmarke: marke ? marke.textContent : '',
        treffer,
        sichtbar,
      };
    },
    { pane: PANE, editor: imEditor },
  );
}

async function fall(modus) {
  const imEditor = modus !== 'rendered';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2107-dokument-'));
  const datei = path.join(dir, 'probe.md');
  fs.writeFileSync(datei, langerText(), 'utf8');
  const { app, page, userData } = await launchApp({ args: [datei] });
  try {
    await expect(page.locator(SEL.tabs0).first()).toBeVisible();
    await page.locator(SEL.viewBtn(modus)).click();
    if (imEditor) {
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`).first().click();
      await page.keyboard.press('Control+Home');
    }

    // Tippen: der erste Treffer ist der aktuelle, aber nichts bewegt sich.
    await page.keyboard.press('Control+f');
    await expect(page.locator(SEL.searchBar)).toBeVisible();
    await page.locator(SEL.searchInput).fill(BEGRIFF);
    const zaehler = page.locator(SEL.searchCount);
    await expect(zaehler).toHaveText('1 / 3');
    // Eine Abwesenheit braucht ein Zeitfenster: Die Bewegung, die es nicht
    // geben darf, käme mit dem Suchlauf selbst oder im Bild-Takt danach.
    await page.waitForTimeout(400);
    const vorher = await lage(page, imEditor);
    expect(vorher.rollen, 'Das Tippen hat die Ansicht gerollt').toBe(0);
    expect(vorher.sichtbar).toBe(false);
    if (imEditor) expect(vorher.schreibmarke).toBe('# Probe 4T-002107');

    // Erste Eingabetaste: derselbe Treffer, jetzt gezeigt und ausgewählt.
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => {
        const l = await lage(page, imEditor);
        return l.sichtbar && l.treffer.startsWith('Erster');
      })
      .toBe(true);
    await expect(zaehler).toHaveText('1 / 3');
    if (imEditor) {
      expect((await lage(page, imEditor)).schreibmarke).toBe(`Erster ${BEGRIFF} hier.`);
    }

    // Zweite Eingabetaste: erst jetzt der nächste Treffer.
    await page.keyboard.press('Enter');
    await expect(zaehler).toHaveText('2 / 3');
    await expect
      .poll(async () => {
        const l = await lage(page, imEditor);
        return l.sichtbar && l.treffer.startsWith('Zweiter');
      })
      .toBe(true);
  } finally {
    await closeApp(app, userData, { force: true });
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Verzeichnis bleibt liegen; unkritisch.
    }
  }
}

// 4T-002125: Ein Treffer ist in «Gerendert» von einem Textmarker `==Text==`
// unterscheidbar, auch innerhalb eines Textmarkers. Beide sind <mark>-Elemente
// mit fast gleichem Gelb; unterschieden werden sie durch die Kontur, die nur
// Treffer tragen. Gemessen wird der berechnete Stil, nicht die Klasse — der
// Fehler aus 4T-002113 lag genau zwischen beiden.
const TEXTMARKER_PROBE = [
  '# Probe 4T-002125',
  '',
  'Ein ==markierter Satz== ohne das Suchwort.',
  '',
  `Ein ==${BEGRIFF} im Textmarker== mitten im Satz.`,
  '',
  `Ein ${BEGRIFF} ohne Markierung.`,
  '',
  `Noch ein ${BEGRIFF} am Ende.`,
  '',
].join('\n');

// Alle <mark> der Lese-Ansicht: Treffer und Textmarker, mit Kontur und Breite.
function marken(page) {
  return page.evaluate((pane) => {
    const p = document.querySelector(pane);
    return Array.from(p.querySelectorAll('.pane-rendered .markdown-body mark')).map((m) => {
      const s = getComputedStyle(m);
      const kontur = s.boxShadow !== 'none' || s.outlineStyle !== 'none';
      return {
        text: m.textContent,
        treffer: m.classList.contains('mdv-match'),
        aktuell: m.classList.contains('mdv-match-current'),
        imTextmarker: !!(m.parentElement && m.parentElement.closest('mark:not(.mdv-match)')),
        kontur,
        schatten: s.boxShadow,
        breite: Math.round(m.getBoundingClientRect().width * 100) / 100,
      };
    });
  }, PANE);
}

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

test.describe('SD-02: Treffer sind vom Textmarker unterscheidbar (4T-002125)', () => {
  for (const schema of ['light', 'dark']) {
    test(`4T-002125: Gerendert, ${schema === 'light' ? 'hell' : 'dunkel'} — jeder Treffer trägt eine Kontur, auch im Textmarker, der Textmarker ohne Treffer keine`, async () => {
      test.setTimeout(120000);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2125-textmarker-'));
      const datei = path.join(dir, 'probe.md');
      fs.writeFileSync(datei, TEXTMARKER_PROBE, 'utf8');
      const { app, page, userData } = await launchApp({ args: [datei] });
      try {
        await expect(page.locator(SEL.tabs0).first()).toBeVisible();
        await sendMenuChannel(app, 'menu:setTheme', schema);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
          .toBe(schema);
        await page.locator(SEL.viewBtn('rendered')).click();
        await expect(page.locator(`${PANE} .pane-rendered .markdown-body mark`)).toHaveCount(2);
        const vorher = await marken(page);
        expect(vorher.every((m) => !m.kontur)).toBe(true);

        await page.keyboard.press('Control+f');
        await page.locator(SEL.searchInput).fill(BEGRIFF);
        const zaehler = page.locator(SEL.searchCount);
        await expect(zaehler).toHaveText('1 / 3');
        // Zweite Eingabetaste: Der Treffer im Textmarker ist dann ein übriger,
        // der Fall, in dem er vorher unsichtbar war.
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await expect(zaehler).toHaveText('2 / 3');

        const nachher = await marken(page);
        const treffer = nachher.filter((m) => m.treffer);
        const textmarker = nachher.filter((m) => !m.treffer);
        expect(treffer).toHaveLength(3);
        expect(textmarker).toHaveLength(2);
        expect(
          treffer.every((m) => m.kontur),
          JSON.stringify(treffer),
        ).toBe(true);
        const ohneTreffer = textmarker.find((m) => m.text === 'markierter Satz');
        expect(ohneTreffer.kontur, JSON.stringify(ohneTreffer)).toBe(false);
        // Der Treffer im Textmarker ist ein eigenes Element mit eigener Kontur,
        // der Textmarker um ihn herum trägt keine.
        const imTextmarker = treffer.find((m) => m.imTextmarker);
        expect(imTextmarker, JSON.stringify(nachher)).toBeTruthy();
        expect(imTextmarker.aktuell).toBe(false);
        expect(imTextmarker.kontur).toBe(true);
        expect(textmarker.every((m) => !m.kontur)).toBe(true);
        // Der aktuelle Treffer hebt sich vom übrigen ab.
        const aktuell = treffer.filter((m) => m.aktuell);
        expect(aktuell).toHaveLength(1);
        expect(
          treffer.filter((m) => !m.aktuell).every((m) => m.schatten !== aktuell[0].schatten),
        ).toBe(true);
        // Kein Text verschiebt sich: Die Textmarker sind so breit wie vorher.
        // Toleranz unter einem halben Pixel, weil schon das Aufteilen des
        // Textknotens in ein eigenes <mark> die Laufweite um Hundertstel ändert
        // (gemessen 192,28 gegen 192,30); ein Rahmen von 1 px schlüge mit 2 px
        // Breite zu Buche.
        textmarker.forEach((m, i) => expect(m.breite).toBeCloseTo(vorher[i].breite, 0));
      } finally {
        await closeApp(app, userData, { force: true });
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {
          // Temp-Verzeichnis bleibt liegen; unkritisch.
        }
      }
    });
  }
});

test.describe('SD-01: Die erste Eingabetaste zeigt den ersten Treffer (4T-002107)', () => {
  const ANSICHTEN = { source: 'Quellcode', live: 'Live', rendered: 'Gerendert' };
  for (const [modus, name] of Object.entries(ANSICHTEN)) {
    test(`4T-002107: ${name} — Tippen bewegt nichts, die erste Eingabetaste zeigt «1 / 3», die zweite «2 / 3»`, async () => {
      test.setTimeout(120000);
      await fall(modus);
    });
  }
});

// 4T-002129 (SD-03): Ein Sprung bleibt, wo er ist. Gemeldet war «nach einem
// Wechsel des Farbschemas fällt 2 / 3 auf 1 / 3 zurück». Die Aufzeichnung
// zeigte als Auslöser nicht das Farbschema, sondern die gedrosselte Eingabe:
// Wer die Leiste mit stehendem Begriff wieder öffnet, den Begriff noch einmal
// einträgt und binnen 150 ms zweimal die Eingabetaste drückt, dessen Sprung
// warf der verspätete Suchlauf auf den ersten Treffer zurück. Geprüft werden
// beide Lesarten: die gemeldete Abfolge samt Farbschema und der Wechsel des
// Farbschemas bei offener Suche, dazu ein neuer Begriff mit schneller Taste.
function aktuellerTreffer(page) {
  return page.evaluate((pane) => {
    const p = document.querySelector(pane);
    const treffer = Array.from(p.querySelectorAll('.pane-rendered mark.mdv-match'));
    return `${treffer.findIndex((m) => m.classList.contains('mdv-match-current')) + 1} von ${treffer.length}`;
  }, PANE);
}

// Startet die Probe in «Gerendert», öffnet die Suche mit dem Begriff und gibt
// dem Fall den Zähler und die Prüfung «bleibt nach einer Sekunde stehen».
async function sprungFall(ablauf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2129-sprung-'));
  const datei = path.join(dir, 'probe.md');
  fs.writeFileSync(datei, TEXTMARKER_PROBE, 'utf8');
  const { app, page, userData } = await launchApp({ args: [datei] });
  const zaehler = page.locator(SEL.searchCount);
  const bleibt = async (text, nr) => {
    // Eine Abwesenheit braucht ein Zeitfenster: Der Rückfall kam gemessen
    // innerhalb von 600 ms.
    await page.waitForTimeout(1000);
    await expect(zaehler).toHaveText(text);
    expect(await aktuellerTreffer(page)).toBe(nr);
  };
  try {
    await expect(page.locator(SEL.tabs0).first()).toBeVisible();
    await sendMenuChannel(app, 'menu:setTheme', 'light');
    await page.locator(SEL.viewBtn('rendered')).click();
    await page.keyboard.press('Control+f');
    await page.locator(SEL.searchInput).fill(BEGRIFF);
    await expect(zaehler).toHaveText('1 / 3');
    await ablauf({ app, page, zaehler, bleibt });
  } finally {
    await closeApp(app, userData, { force: true });
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Verzeichnis bleibt liegen; unkritisch.
    }
  }
}

test.describe('SD-03: Ein Sprung bleibt nach dem Neuzeichnen stehen (4T-002129)', () => {
  test('4T-002129: Gerendert — «2 / 3» bleibt nach erneutem Eintragen des Begriffs und nach dem Farbschema-Wechsel', async () => {
    test.setTimeout(120000);
    await sprungFall(async ({ app, page, zaehler, bleibt }) => {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await bleibt('2 / 3', '2 von 3');
      await page.keyboard.press('Escape');

      // Die gemeldete Abfolge: Farbschema wechseln, Leiste mit stehendem
      // Begriff öffnen, denselben Begriff eintragen, sofort zweimal Enter.
      await sendMenuChannel(app, 'menu:setTheme', 'dark');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('dark');
      await page.keyboard.press('Control+f');
      await page.locator(SEL.searchInput).fill(BEGRIFF);
      await expect(zaehler).toHaveText('1 / 3');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await bleibt('2 / 3', '2 von 3');

      // Farbschema-Wechsel bei offener Suche auf «2 / 3».
      await sendMenuChannel(app, 'menu:setTheme', 'light');
      await bleibt('2 / 3', '2 von 3');
    });
  });

  test('4T-002129: Gerendert — ein neuer Begriff gilt vor dem Sprung, wenn die Eingabetaste schneller ist als die Eingabe-Drossel', async () => {
    test.setTimeout(120000);
    await sprungFall(async ({ page, bleibt }) => {
      await page.locator(SEL.searchInput).fill('Ein');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await bleibt('2 / 4', '2 von 4');
    });
  });
});
