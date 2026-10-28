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
//
// 4T-002217 (SD-04, SD-05): Der Treffer steht nach jedem Sprung im mittleren
// Drittel des sichtbaren Bereichs, am Anfang und am Ende des Inhalts am Rand
// und vollständig sichtbar; kurzer Inhalt rollt nicht. Lage-Rechnung in
// `helpers/treffer-lage.js`, gemeinsam mit den übrigen Such-Wegen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { erwarteTrefferInDerMitte } = require('../helpers/treffer-lage');

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
    // 4T-002217: «gezeigt» heißt seither im mittleren Drittel, nicht bloß
    // irgendwo im sichtbaren Bereich (gemeinsame Lage-Rechnung).
    const art = imEditor ? 'editor' : 'gerendert';
    await page.keyboard.press('Enter');
    await erwarteTrefferInDerMitte(page, { art, zeileEnthaelt: 'Erster' });
    await expect(zaehler).toHaveText('1 / 3');
    if (imEditor) {
      expect((await lage(page, imEditor)).schreibmarke).toBe(`Erster ${BEGRIFF} hier.`);
    }

    // Zweite Eingabetaste: erst jetzt der nächste Treffer.
    await page.keyboard.press('Enter');
    await expect(zaehler).toHaveText('2 / 3');
    await erwarteTrefferInDerMitte(page, { art, zeileEnthaelt: 'Zweiter' });
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

// ---------------------------------------------------------------------------
// 4T-002217 (Epic 3E-000355): Lage des Treffers nach dem Sprung.
//
// ZUSICHERUNG, keine Behebung: Die Fälle sind am Stand ihrer Anlage grün. Sie
// halten das gemessene Verhalten fest (Messungen vom 2026-10-10 und
// 2026-10-17, 112 Messpunkte), damit es nicht unbemerkt verloren geht. Vorher
// verlangten die Fälle nur «im sichtbaren Bereich»; ein Treffer am Rand
// bestand sie.
//
// Prüf-Dokument wie in der Messung: 400 Absätze, rund 23 Fensterhöhen, das
// Suchwort in Absatz 5 (Roll-Lage bleibt am Anfang), 200 (Mitte erreichbar)
// und 395 (Roll-Lage am Ende). Bedien-Wege der Mess-Prüfdatei: Eingabetaste,
// Umschalt+Eingabetaste, die beiden Knöpfe der Suchleiste, F3 und Umschalt+F3,
// dazu der Sprung vom letzten zum ersten Treffer und zurück.
const LAGE_BEGRIFF = 'Quittenmus';

function lageText(n = 400, ersatz = {}) {
  const z = ['# Lage 4T-002217', ''];
  for (let i = 1; i <= n; i++) {
    if (ersatz[i]) z.push(...ersatz[i], '');
    else if (i === 5 || i === 200 || i === 395) {
      z.push(`Absatz ${i}: hier steht ${LAGE_BEGRIFF}.`, '');
    } else z.push(`Absatz ${i}: Fülltext ohne Suchwort.`, '');
  }
  return z.join('\n');
}

// Ansicht wählen; die Editor-Ansichten zusätzlich bearbeitbar machen und die
// Schreibmarke an den Anfang setzen, damit der erste Sprung von oben kommt.
async function lageAnsicht(page, modus) {
  await page.locator(SEL.viewBtn(modus)).click();
  await expect(page.locator(SEL.viewBtn(modus))).toHaveClass(/active/);
  if (modus === 'rendered') return;
  const inhalt = page.locator(SEL.editorContent0);
  if ((await inhalt.getAttribute('contenteditable')) !== 'true') {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(inhalt).toHaveAttribute('contenteditable', 'true');
  await inhalt.locator('.cm-line').first().click();
  await page.keyboard.press('Control+Home');
}

// Startet die Anwendung mit einem Prüf-Dokument und gibt die Seite an `ablauf`.
async function lageFall(text, ablauf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2217-dokument-'));
  const datei = path.join(dir, 'lage.md');
  fs.writeFileSync(datei, text, 'utf8');
  const { app, page, userData } = await launchApp({ args: [datei] });
  try {
    await expect(page.locator(SEL.tabs0).first()).toBeVisible();
    await ablauf(page);
  } finally {
    await closeApp(app, userData, { force: true });
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Verzeichnis bleibt liegen; unkritisch.
    }
  }
}

async function lageSuche(page, gesamt) {
  await page.keyboard.press('Control+f');
  await expect(page.locator(SEL.searchInput)).toBeVisible();
  await page.locator(SEL.searchInput).fill(LAGE_BEGRIFF);
  await expect(page.locator(SEL.searchCount)).toHaveText(`1 / ${gesamt}`);
}

// Ein Handgriff, dann Zähler und Lage. `rand` ist die Roll-Lage, die das
// Prüf-Dokument an dieser Stelle festlegt (Anfang, Mitte erreichbar, Ende).
async function lageSchritt(page, art, [griff, zaehler, absatz, rand]) {
  if (griff === 'Knopf Vorheriger') await page.locator('#btn-search-prev').click();
  else if (griff === 'Knopf Nächster') await page.locator('#btn-search-next').click();
  else await page.keyboard.press(griff);
  await expect(page.locator(SEL.searchCount)).toHaveText(zaehler);
  await erwarteTrefferInDerMitte(page, {
    art,
    rand,
    zeileEnthaelt: `Absatz ${absatz}:`,
    schritt: `${griff} -> ${zaehler}`,
  });
}

const LAGE_SCHRITTE = [
  ['Enter', '1 / 3', 5, 'Anfang'],
  ['Enter', '2 / 3', 200, 'nein'],
  ['Enter', '3 / 3', 395, 'Ende'],
  ['Enter', '1 / 3', 5, 'Anfang'],
  ['Shift+Enter', '3 / 3', 395, 'Ende'],
  ['Knopf Vorheriger', '2 / 3', 200, 'nein'],
  ['Knopf Nächster', '3 / 3', 395, 'Ende'],
  ['F3', '1 / 3', 5, 'Anfang'],
  ['Shift+F3', '3 / 3', 395, 'Ende'],
];

// Zeilen-Texte, die der Editor der Spalte gerade als Editor-Zeilen zeichnet.
function editorZeilen(page) {
  return page.evaluate(() => {
    const p = document.querySelector('.pane-group[data-pane="0"] .pane-source');
    return [...p.querySelectorAll('.cm-line')].map((l) => l.textContent);
  });
}

// Rollt den Editor so, dass die Zeile mit `text` mittig steht (ohne `text` an
// den Anfang). Die Lage der Zeile kommt aus der CodeMirror-Sicht (Zugang wie in
// `helpers/treffer-lage.js`), weil die Höhen außerhalb des gezeichneten
// Bereichs geschätzt sind und sich beim Rollen noch ändern.
function editorRollen(page, text) {
  return page.evaluate((suche) => {
    const p = document.querySelector('.pane-group[data-pane="0"] .pane-source');
    const roll = p.querySelector('.cm-scroller');
    if (!suche) {
      roll.scrollTop = 0;
      return Math.round(roll.scrollTop);
    }
    let kachel = p.querySelector('.cm-content').cmTile;
    while (kachel && kachel.parent) kachel = kachel.parent;
    const sicht = kachel && kachel.view;
    const block = sicht.lineBlockAt(sicht.state.doc.toString().indexOf(suche));
    roll.scrollTop = block.top - roll.clientHeight / 2;
    return Math.round(roll.scrollTop);
  }, text || '');
}

test.describe('SD-04: Treffer im mittleren Drittel, am Anfang und Ende am Rand (4T-002217)', () => {
  const ANSICHTEN = { source: 'Quellcode', split: 'Geteilt', live: 'Live', rendered: 'Gerendert' };
  for (const [modus, name] of Object.entries(ANSICHTEN)) {
    test(`4T-002217: ${name} — jeder Sprung vor und zurück, mit Tasten und Knöpfen, auch vom letzten zum ersten Treffer`, async () => {
      test.setTimeout(120000);
      const art = modus === 'rendered' ? 'gerendert' : 'editor';
      await lageFall(lageText(), async (page) => {
        await lageAnsicht(page, modus);
        await lageSuche(page, 3);
        for (const schritt of LAGE_SCHRITTE) await lageSchritt(page, art, schritt);
      });
    });
  }

  // Ein Block, den die Live-Ansicht als Widget zeichnet, klappt beim Sprung zur
  // Quelle auf; seine Höhe ändert sich dabei. Gemessen am 2026-10-10 mit dem
  // Treffer in der Mitte (Code-Block). Eine Tabelle klappt nicht auf; ihre
  // Treffer zeichnet das Widget selbst (4T-002342, SD-07 unten).
  test('4T-002217: Live — Treffer in einem Code-Block, der als Widget gezeichnet ist, steht nach dem Aufklappen in der Mitte', async () => {
    test.setTimeout(120000);
    const text = lageText(400, {
      5: ['Absatz 5: Fülltext ohne Suchwort.'],
      200: ['```js', `const absatz200 = '${LAGE_BEGRIFF}';`, '```'],
      395: ['Absatz 395: Fülltext ohne Suchwort.'],
    });
    await lageFall(text, async (page) => {
      await lageAnsicht(page, 'live');
      // Vorbedingung: Der Block ist als Widget gezeichnet — seine Zaun-Zeile
      // ist keine Editor-Zeile, die Nachbar-Absätze sind es. Dafür einmal zum
      // Block rollen und danach zurück an den Anfang. Gerollt wird in jedem
      // Durchgang neu, bis die Nachbar-Absätze gezeichnet sind: Die Höhen
      // werden beim Zeichnen genauer und verschieben den Block noch.
      await expect
        .poll(async () => {
          await editorRollen(page, '```js');
          const z = await editorZeilen(page);
          return (
            z.some((t) => t.startsWith('Absatz 199:')) && z.some((t) => t.startsWith('Absatz 201:'))
          );
        })
        .toBe(true);
      expect((await editorZeilen(page)).some((t) => t.startsWith('```'))).toBe(false);
      await expect.poll(() => editorRollen(page)).toBe(0);

      await lageSuche(page, 1);
      await page.keyboard.press('Enter');
      await expect(page.locator(SEL.searchCount)).toHaveText('1 / 1');
      await erwarteTrefferInDerMitte(page, {
        art: 'editor',
        rand: 'nein',
        zeileEnthaelt: 'const absatz200',
      });
      // Der Block steht jetzt als Quelle da.
      expect((await editorZeilen(page)).some((t) => t.startsWith('```js'))).toBe(true);
    });
  });
});

// Behebung (4T-002217, Vorlage P1 vom 2026-10-17): Ein Treffer in einem
// eingeklappten Hinweis-Kasten (`> [!note]-`, gerendert als `details` ohne
// `open`) blieb in «Gerendert» unsichtbar — der Zähler zeigte «2 / 3», die
// Ansicht rollte nicht. Gemessen am 2026-10-17 vorwärts und rückwärts. Der
// Sprung öffnet den Kasten und holt den Treffer in die Mitte; der Kasten bleibt
// beim Weiterblättern offen. Rot-Probe am unveränderten Stand: rot.
const KASTEN = '.pane-group[data-pane="0"] .pane-rendered details';

function kastenText() {
  return lageText(400, {
    200: ['> [!note]- Eingeklappt', `> Absatz 200: hier steht ${LAGE_BEGRIFF}.`],
  });
}

test.describe('SD-06: Treffer in einem eingeklappten Hinweis-Kasten (4T-002217)', () => {
  test('4T-002217: Gerendert — der Sprung öffnet den Kasten und zeigt den Treffer in der Mitte, vorwärts und rückwärts, der Kasten bleibt offen', async () => {
    test.setTimeout(120000);
    await lageFall(kastenText(), async (page) => {
      await lageAnsicht(page, 'rendered');
      // Vorbedingung: genau ein Kasten, geschlossen.
      await expect(page.locator(KASTEN)).toHaveCount(1);
      await expect(page.locator(KASTEN)).not.toHaveAttribute('open', '');
      await lageSuche(page, 3);

      await lageSchritt(page, 'gerendert', ['Enter', '1 / 3', 5, 'Anfang']);
      await expect(page.locator(KASTEN)).not.toHaveAttribute('open', '');
      await lageSchritt(page, 'gerendert', ['Enter', '2 / 3', 200, 'nein']);
      await expect(page.locator(KASTEN)).toHaveAttribute('open', '');
      // Weiterblättern lässt ihn offen.
      await lageSchritt(page, 'gerendert', ['Enter', '3 / 3', 395, 'Ende']);
      await expect(page.locator(KASTEN)).toHaveAttribute('open', '');

      // Rückwärts in den wieder geschlossenen Kasten: von Hand zuklappen wie
      // der Anwender (Klick auf den Titel), dann der Knopf «Vorheriger», weil
      // der Klick den Fokus aus der Suchleiste nimmt.
      await page.locator(`${KASTEN} > summary`).click();
      await expect(page.locator(KASTEN)).not.toHaveAttribute('open', '');
      await expect(page.locator(SEL.searchCount)).toHaveText('3 / 3');
      await lageSchritt(page, 'gerendert', ['Knopf Vorheriger', '2 / 3', 200, 'nein']);
      await expect(page.locator(KASTEN)).toHaveAttribute('open', '');
    });
  });
});

// Gegenprobe (AK7): Ein Inhalt, der in den sichtbaren Bereich passt, rollt beim
// Sprung nicht — gemessen am 2026-10-17 in allen drei Ansichten mit
// `scrollMax 0`. Die Zusicherung «rollt nicht» schließt eine Roll-Lage außer 0
// aus; der Treffer ist vollständig sichtbar.
test.describe('SD-05: Kurzer Inhalt rollt beim Sprung nicht (4T-002217)', () => {
  test('4T-002217: Quellcode, Live und Gerendert — jeder Sprung, auch vom letzten zum ersten Treffer, lässt die Roll-Lage bei 0', async () => {
    test.setTimeout(120000);
    const kurz = ['# Kurz 4T-002217', ''];
    for (let i = 1; i <= 3; i++) kurz.push(`Absatz ${i}: ${LAGE_BEGRIFF}.`, '');
    await lageFall(kurz.join('\n'), async (page) => {
      for (const modus of ['source', 'live', 'rendered']) {
        const art = modus === 'rendered' ? 'gerendert' : 'editor';
        await lageAnsicht(page, modus);
        await lageSuche(page, 3);
        for (const schritt of [
          ['Enter', '1 / 3', 1, 'rollt nicht'],
          ['Enter', '2 / 3', 2, 'rollt nicht'],
          ['Enter', '3 / 3', 3, 'rollt nicht'],
          ['Enter', '1 / 3', 1, 'rollt nicht'],
          ['Shift+Enter', '3 / 3', 3, 'rollt nicht'],
        ]) {
          await lageSchritt(page, art, schritt);
        }
        await page.keyboard.press('Escape');
        await expect(page.locator(SEL.searchBar)).toBeHidden();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 4T-002342 (Epic 3E-000365, Story 4S-001098): Treffer in den Zellen einer
// Tabelle der Live-Ansicht. Die Tabelle steht dort als gezeichnetes Widget und
// klappt bei Schreibmarke nicht zur Quelle auf; die Treffer-Dekoration des
// Editors erreichte ihre Zellen deshalb nicht (Nachmessung vom 2026-10-22). Das
// Widget zeichnet die Treffer jetzt selbst, mit den Klassen des Fließtexts.
// Ränder: ein Treffer in der Kopfzeile und zwei Treffer in einer Zelle.
// Rot-Probe am unveränderten Stand: rot (Kapitel «Lösung» des Tasks).
function tabellenText() {
  return [
    '# Tabelle 4T-002342',
    '',
    `Absatz 1: hier steht ${LAGE_BEGRIFF}.`,
    '',
    `| Kopf ${LAGE_BEGRIFF} | Spalte B |`,
    '| --- | --- |',
    `| Gelee | ${LAGE_BEGRIFF} und ${LAGE_BEGRIFF} |`,
    '| Birne | ohne |',
    '',
    `Absatz 2: wieder ${LAGE_BEGRIFF}.`,
    '',
  ].join('\n');
}

// Die Treffer-Elemente in der gezeichneten Tabelle der Live-Ansicht: je
// Element Zelle, Kopfzeile, Reihenfolge in seiner Zelle und ob es der aktuelle
// Treffer ist. Dazu, ob die Tabelle als Widget steht und ob ihre Quelle als
// Editor-Zeile sichtbar ist.
function tabellenTreffer(page) {
  return page.evaluate((pane) => {
    const p = document.querySelector(`${pane} .pane-source`);
    const tabelle = p.querySelector('.cm-live-block table');
    const treffer = tabelle
      ? [...tabelle.querySelectorAll('.cm-search-match')].map((e) => {
          const zelle = e.closest('th, td');
          return {
            text: e.textContent,
            zelle: zelle ? zelle.textContent : null,
            kopf: !!e.closest('thead'),
            nr: zelle ? [...zelle.querySelectorAll('.cm-search-match')].indexOf(e) : -1,
            aktuell: e.classList.contains('cm-search-match-current'),
          };
        })
      : [];
    return {
      widget: !!tabelle,
      quelleSichtbar: [...p.querySelectorAll('.cm-line')].some((l) =>
        l.textContent.startsWith('| Kopf'),
      ),
      treffer,
      aktuell: treffer.filter((t) => t.aktuell),
    };
  }, PANE);
}

test.describe('SD-07: Treffer in Tabellen-Zellen der Live-Ansicht (4T-002342)', () => {
  test('4T-002342: Live — alle Treffer der Tabelle hervorgehoben, der aktuelle wandert hinein und hinaus, nach dem Schließen keiner', async () => {
    test.setTimeout(120000);
    const zelle = `${LAGE_BEGRIFF} und ${LAGE_BEGRIFF}`;
    const kopf = `Kopf ${LAGE_BEGRIFF}`;
    await lageFall(tabellenText(), async (page) => {
      await lageAnsicht(page, 'live');
      await lageSuche(page, 5);

      // Nach dem Tippen: alle drei Treffer der Tabelle hervorgehoben (Kopfzeile
      // und zwei in einer Zelle), keiner davon der aktuelle.
      let stand = await tabellenTreffer(page);
      expect(stand.widget, 'Die Tabelle steht nicht als Widget').toBe(true);
      expect(stand.treffer.map((t) => [t.zelle, t.kopf, t.nr, t.text])).toEqual([
        [kopf, true, 0, LAGE_BEGRIFF],
        [zelle, false, 0, LAGE_BEGRIFF],
        [zelle, false, 1, LAGE_BEGRIFF],
      ]);
      expect(stand.aktuell).toEqual([]);

      // Vorwärts: Fließtext, Kopfzeile, erster und zweiter Treffer der Zelle,
      // wieder Fließtext. Je Schritt höchstens ein aktueller Treffer in der
      // Tabelle, und die Tabelle klappt nicht auf.
      const schritte = [
        ['Enter', '1 / 5', null],
        ['Enter', '2 / 5', [kopf, 0]],
        ['Enter', '3 / 5', [zelle, 0]],
        ['Enter', '4 / 5', [zelle, 1]],
        ['Enter', '5 / 5', null],
        ['Shift+Enter', '4 / 5', [zelle, 1]],
        ['Shift+Enter', '3 / 5', [zelle, 0]],
        ['Shift+Enter', '2 / 5', [kopf, 0]],
        ['Shift+Enter', '1 / 5', null],
      ];
      for (const [taste, zaehler, ziel] of schritte) {
        await page.keyboard.press(taste);
        await expect(page.locator(SEL.searchCount)).toHaveText(zaehler);
        await expect
          .poll(async () => (await tabellenTreffer(page)).aktuell.map((t) => [t.zelle, t.nr]), {
            message: `${taste} -> ${zaehler}`,
          })
          .toEqual(ziel ? [ziel] : []);
        stand = await tabellenTreffer(page);
        expect(stand.treffer, `${taste} -> ${zaehler}: alle drei bleiben`).toHaveLength(3);
        expect(stand.widget && !stand.quelleSichtbar, `${taste} -> ${zaehler}`).toBe(true);
      }

      // Schließen der Suche: keine Zelle trägt eine Hervorhebung.
      await page.locator(SEL.searchInput).focus();
      await page.keyboard.press('Escape');
      await expect(page.locator(SEL.searchBar)).toBeHidden();
      await expect.poll(async () => (await tabellenTreffer(page)).treffer).toEqual([]);
      expect((await tabellenTreffer(page)).widget).toBe(true);
    });
  });
});
