// 4T-000595/4T-000596 (Epic 3E-000111): Inline-Berechnungen {= Ausdruck =} —
// End-to-End über die drei Ansichten. IB-01: Render-Pane zeigt das Ergebnis
// als Span (Fehler als ⚠︎ mit Fehler-Klasse); IB-02: Quelltext-Modus zeigt
// den Roh-Ausdruck und färbt das Konstrukt (.cm-inline-calc-marker);
// IB-03: Live-Modus zeigt auf inaktiven Zeilen das Ergebnis-Widget
// (.cm-inline-calc), ein Klick aufs Widget setzt den Cursor ins Konstrukt
// und deckt den Roh-Ausdruck auf; IB-04: deaktivierte Erweiterung lässt die
// Syntax in allen Ansichten als Fließtext stehen. Die Rechen-Semantik selbst
// ist unit-getestet (test/unit/render/inline-calc.test.js); der
// Abdeckungs-Matrix-Eintrag liegt bei help.feature.inlineCalc (F-143).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'inline-berechnungen.md',
);

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-inline-calc-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('IB-01: Render-Pane zeigt das Ergebnis mit Tooltip (F-143)', () => {
  test('Ergebnis-Span, Datums-Arithmetik und Fehler-Zeichen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      // Ergebnis statt Roh-Ausdruck, Ausdruck als Tooltip.
      const sum = body.locator('.inline-calc', { hasText: '14' });
      await expect(sum).toBeVisible();
      await expect(sum).toHaveAttribute('title', '2+3*4');
      await expect(body).not.toContainText('{= 2+3*4 =}');
      // Datums-Arithmetik.
      await expect(body.locator('.inline-calc', { hasText: '2026-01-31' })).toBeVisible();
      // Fehler-Konstrukt: dezentes Zeichen mit Fehler-Klasse und
      // lokalisiertem Tooltip (data-i18n-title über applyTranslations).
      const err = body.locator('.inline-calc-error');
      await expect(err).toBeVisible();
      await expect(err).toContainText('⚠');
      await expect(err).toHaveAttribute('title', /Rechenausdruck/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('IB-02: Quelltext-Modus zeigt den Roh-Ausdruck eingefärbt (F-143)', () => {
  test('Editor enthält {= 2+3*4 =} und mindestens einen .cm-inline-calc-marker', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Quelltext behält den Ausdruck (keine Ersetzung).
      await expect(editor).toContainText('{= 2+3*4 =}');
      // Dezente Einfärbung des Konstrukts im Haupt-Editor (.pane-source
      // qualifiziert gegen die zweite CodeMirror-Instanz, 4T-000361).
      const marker = page.locator(`${SEL.paneSource0} .cm-inline-calc-marker`);
      await expect(marker.first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('IB-03: Live-Modus deckt auf der Cursor-Zeile auf (F-143)', () => {
  test('inaktive Zeile zeigt das Ergebnis-Widget, Klick deckt den Ausdruck auf', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Cursor steht initial auf Zeile 1 — die Rechen-Zeilen sind inaktiv
      // und zeigen Widgets: Ergebnis, Fehler-Zeichen, Datum.
      const widgets = page.locator(`${SEL.paneSource0} .cm-inline-calc`);
      const sum = widgets.filter({ hasText: '14' }).first();
      await expect(sum).toBeVisible();
      await expect(page.locator(`${SEL.paneSource0} .cm-inline-calc-error`).first()).toBeVisible();
      await expect(widgets.filter({ hasText: '2026-01-31' }).first()).toBeVisible();
      // Der Roh-Ausdruck ist auf der inaktiven Zeile ersetzt.
      await expect(editor).not.toContainText('{= 2+3*4 =}');
      // Klick aufs Widget setzt den Cursor ins Konstrukt: die Zeile wird
      // aktiv, der Roh-Ausdruck erscheint, das Ergebnis-Widget verschwindet.
      await sum.click();
      await expect(editor).toContainText('{= 2+3*4 =}');
      await expect(widgets.filter({ hasText: '14' })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('IB-04: Erweiterung inline-calc aus lässt die Syntax Fließtext (F-143)', () => {
  test('Render-Pane zeigt den Marker-Text, kein Ergebnis-Span', async () => {
    const userDataSeed = seedProfile({ extensions: { disabled: ['inline-calc'] } });
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      userData: userDataSeed,
    });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body).toContainText('{= 2+3*4 =}');
      await expect(body.locator('.inline-calc')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// IB-05 (4T-002095 und 4T-002344, Story 4S-000168 AK8 und AK9): Die Markierung
// ist über einem Rechen-Ausdruck nicht schwächer als über dem Text daneben.
// CodeMirror zeichnet die Markierung als Ebene UNTER dem Text; jede Fläche des
// Ausdrucks über dieser Ebene schwächt sie (mit 70 % Deckkraft kamen 15 % statt
// 50 % der Markierungsfarbe an). Gemessen wird deshalb die gezeichnete Farbe:
// Bildschirmfoto mit und ohne Markierungs-Ebene im selben Zustand, daraus der
// Anteil t der Markierungsfarbe S an der Farbe P über dem Grund G
// (P ≈ t·S + (1−t)·G), über dem Ausdruck und rechts daneben in derselben Zeile.
// Verlangt: über dem Ausdruck mindestens 90 % der Deckkraft der Markierungsfarbe
// (dunkel 45 %, hell 36 %) und höchstens 5 Prozentpunkte weniger als daneben;
// der Ausdruck bleibt ohne Markierung eingefärbt (AK6). Quelltext und Live,
// hell und dunkel.
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

// Häufigste Farbe je Rechteck des Bildschirmfotos (Glyphen fallen heraus),
// dekodiert im Anzeige-Prozess über eine Leinwand.
async function haeufigsteFarben(page, rechtecke) {
  const b64 = (await page.screenshot({ scale: 'css' })).toString('base64');
  return page.evaluate(
    async ({ b64, rechtecke }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const aus = {};
      for (const [name, r] of Object.entries(rechtecke)) {
        const x = Math.ceil(r.left) + 2;
        const y = Math.ceil(r.top) + 2;
        const w = Math.max(1, Math.floor(r.right) - 2 - x);
        const h = Math.max(1, Math.floor(r.bottom) - 2 - y);
        const d = ctx.getImageData(x, y, w, h).data;
        const zaehler = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
          zaehler.set(k, (zaehler.get(k) || 0) + 1);
        }
        aus[name] = [...zaehler.entries()]
          .sort((a, b) => b[1] - a[1])[0][0]
          .split(',')
          .map(Number);
      }
      return aus;
    },
    { b64, rechtecke },
  );
}

async function markierungsEbeneSichtbar(page, sichtbar) {
  await page.evaluate((s) => {
    const alt = document.getElementById('ib05-markierung-aus');
    if (s && alt) alt.remove();
    if (!s && !alt) {
      const st = document.createElement('style');
      st.id = 'ib05-markierung-aus';
      st.textContent = '.cm-selectionLayer { visibility: hidden !important; }';
      document.head.appendChild(st);
    }
  }, sichtbar);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.cm-selectionLayer')).visibility === 'visible',
      ),
    )
    .toBe(sichtbar);
}

// Anteil t der Markierungsfarbe S an P über dem Grund G (Projektion auf S−G).
function anteil(P, G, S) {
  const d = [0, 1, 2].map((i) => S[i] - G[i]);
  const n = d.reduce((a, v) => a + v * v, 0);
  return d.reduce((a, v, i) => a + v * (P[i] - G[i]), 0) / n;
}

test.describe('IB-05: Markierung über dem Rechen-Ausdruck so deutlich wie daneben (4T-002344)', () => {
  test('Quelltext und Live-Modus, hell und dunkel: Anteil der Markierungsfarbe über dem Ausdruck', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const marker = page.locator(`${SEL.paneSource0} .cm-inline-calc-marker`).first();
      const befunde = [];
      const pruefe = async (modus) => {
        await expect(marker).toBeVisible();
        await expect(
          page.locator(`${SEL.paneSource0} .cm-selectionBackground`).first(),
        ).toBeAttached();
        for (const thema of ['light', 'dark']) {
          await sendMenuChannel(app, 'menu:setTheme', thema);
          await expect
            .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
            .toBe(thema);
          const lage = await marker.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const inhalt = el.closest('.cm-content').getBoundingClientRect();
            const auswahl = getComputedStyle(
              el.closest('.cm-scroller').querySelector('.cm-selectionBackground'),
            ).backgroundColor;
            return {
              ausdruck: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
              daneben: {
                left: inhalt.right - 60,
                right: inhalt.right - 10,
                top: r.top,
                bottom: r.bottom,
              },
              auswahl,
            };
          });
          const rechtecke = { ausdruck: lage.ausdruck, daneben: lage.daneben };
          const mit = await haeufigsteFarben(page, rechtecke);
          await markierungsEbeneSichtbar(page, false);
          const ohne = await haeufigsteFarben(page, rechtecke);
          await markierungsEbeneSichtbar(page, true);
          const teile = /rgba?\(([^)]+)\)/.exec(lage.auswahl)[1].split(',').map(parseFloat);
          const S = teile.slice(0, 3);
          const alpha = teile.length > 3 ? teile[3] : 1;
          const tAusdruck = anteil(mit.ausdruck, ohne.ausdruck, S);
          const tDaneben = anteil(mit.daneben, ohne.daneben, S);
          const z = (t) => `${Math.round(t * 1000) / 10} %`;
          const ort =
            `${modus}/${thema}: über dem Ausdruck ${z(tAusdruck)} ` +
            `(${mit.ausdruck} über ${ohne.ausdruck}), daneben ${z(tDaneben)} ` +
            `(${mit.daneben} über ${ohne.daneben}), Markierung ${lage.auswahl}`;
          if (tDaneben < 0.9 * alpha) befunde.push(`Messung unplausibel, ${ort}`);
          if (tAusdruck < 0.9 * alpha || tAusdruck < tDaneben - 0.05) befunde.push(ort);
          if (String(ohne.ausdruck) === String(ohne.daneben)) {
            befunde.push(`ohne Markierung nicht eingefärbt, ${ort}`);
          }
        }
      };

      // Zeilen 3 bis 6 markieren: Die Zeile «Summe: {= 2+3*4 =} im Satz.»
      // ist ganz markiert, die Markierung reicht bis zum rechten Rand.
      const markiere = async () => {
        await page.locator(SEL.editorContent0).click();
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown');
      };

      await page.locator(SEL.viewBtn('source')).click();
      await markiere();
      await pruefe('source');

      // Live-Modus: Eine markierte Zeile ist aktiv und zeigt den Roh-Ausdruck.
      await page.locator(SEL.viewBtn('live')).click();
      await markiere();
      await pruefe('live');

      expect(befunde).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// IB-06 (4T-002450, Epic 3E-000378): Grundfunktion und Konstante im Fließtext
// nach dem Abnahme-Handgriff der Story 4S-001124 (AK11), dazu ein Rand (AK8):
// Die Wurzel einer negativen Zahl zeigt das Fehler-Zeichen wie 1/0, nie «NaN».
// Eigenes Dokument im Temp-Ordner, damit das geteilte Fixture nicht wächst.
test.describe('IB-06: Grundfunktionen und Konstanten im Fließtext (4T-002450)', () => {
  test('round(pi() * 2, 2) zeigt 6.28, pow(2, 10) zeigt 1024, sqrt(-1) das Fehler-Zeichen', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ib06-'));
    const datei = path.join(dir, 'Kreis.md');
    const text = '# Kreis\n\nUmfang {= round(pi() * 2, 2) =}, Potenz {= pow(2, 10) =}.\n\n';
    fs.writeFileSync(datei, text + 'Rand {= sqrt(-1) =}.\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const umfang = body.locator('.inline-calc', { hasText: '6.28' });
      await expect(umfang).toBeVisible();
      await expect(umfang).toHaveAttribute('title', 'round(pi() * 2, 2)');
      await expect(body.locator('.inline-calc', { hasText: '1024' })).toBeVisible();
      const rand = body.locator('.inline-calc-error');
      await expect(rand).toHaveCount(1);
      // Derselbe Fehler-Code wie eine Division durch null.
      await expect(rand).toHaveAttribute('data-i18n-title', 'inlineCalc.error.value');
      await expect(body).not.toContainText(/NaN|Infinity/);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});

// IB-07 (4T-002451, Epic 3E-000378, Story 4S-001139 AK3, AK4, AK8): die erste
// Formel der Formel-Bibliothek im Fließtext. An: der Taupunkt 9.3 nach dem
// Abnahme-Handgriff der Story, eine relative Feuchte von 120 Prozent zeigt das
// Warnzeichen mit der Bereichs-Meldung. Aus (Erweiterung im Profil
// ausgeschaltet): an derselben Stelle das Warnzeichen mit «Formel-Bibliothek
// ausgeschaltet», eine Grundfunktion rechnet weiter.
test.describe('IB-07: Formel der Formel-Bibliothek im Fließtext, an und aus (4T-002451)', () => {
  const de = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
  );
  const TEXT =
    '# Klima\n\nTaupunkt {= round(humidity.dewpoint(20, 50), 1) =} °C.\n\n' +
    'Zu feucht {= humidity.dewpoint(20, 120) =}.\n\nKreis {= round(pi(), 2) =}.\n';

  test('an: 9.3 und die Bereichs-Meldung; aus: der Hinweis der Bibliothek, pi rechnet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ib07-'));
    const datei = path.join(dir, 'Klima.md');
    fs.writeFileSync(datei, TEXT, 'utf8');
    const an = await launchApp({ args: [datei] });
    try {
      await waitForTab(an.page);
      const body = an.page.locator(SEL.markdownBody0);
      const taupunkt = body.locator('.inline-calc', { hasText: '9.3' });
      await expect(taupunkt).toBeVisible();
      await expect(taupunkt).toHaveAttribute('title', 'round(humidity.dewpoint(20, 50), 1)');
      const meldung = body.locator('.inline-calc-error');
      await expect(meldung).toHaveCount(1);
      await expect(meldung).toHaveText('⚠︎');
      await expect(meldung).toHaveAttribute(
        'title',
        de['query.formula.humidity.relativeRangeDewpoint'],
      );
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }
    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await waitForTab(aus.page);
      const body = aus.page.locator(SEL.markdownBody0);
      const hinweise = body.locator('.inline-calc-error');
      await expect(hinweise).toHaveCount(2);
      for (const i of [0, 1]) {
        await expect(hinweise.nth(i)).toHaveAttribute('title', de['query.formulaLibraryOff']);
      }
      await expect(body.locator('.inline-calc', { hasText: '3.14' })).toBeVisible();
      await expect(body).not.toContainText('9.3');
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});

// IB-08 (4T-002452, Epic 3E-000378, Story 4S-001139 AK3, AK6, AK8): eine Formel
// der Finanzmathematik im Fließtext. An: die Rate −1037.03 nach dem
// Abnahme-Handgriff der Story, eine Laufzeit von null zeigt das Warnzeichen mit
// der Bereichs-Meldung. Aus (Erweiterung im Profil ausgeschaltet): an derselben
// Stelle das Warnzeichen mit «Formel-Bibliothek ausgeschaltet», eine
// Grundfunktion rechnet weiter.
test.describe('IB-08: Formel der Finanzmathematik im Fließtext, an und aus (4T-002452)', () => {
  const de = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
  );
  const AUSDRUCK = 'round(finance.pmt(0.08/12, 10, 10000), 2)';
  const TEXT =
    `# Kredit\n\nRate {= ${AUSDRUCK} =} €.\n\n` +
    'Ohne Laufzeit {= finance.pmt(0.08/12, 0, 10000) =}.\n\nKreis {= round(pi(), 2) =}.\n';

  test('an: −1037.03 und die Bereichs-Meldung; aus: der Hinweis der Bibliothek, pi rechnet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ib08-'));
    const datei = path.join(dir, 'Kredit.md');
    fs.writeFileSync(datei, TEXT, 'utf8');
    const an = await launchApp({ args: [datei] });
    try {
      await waitForTab(an.page);
      const body = an.page.locator(SEL.markdownBody0);
      const rate = body.locator('.inline-calc', { hasText: '-1037.03' });
      await expect(rate).toBeVisible();
      await expect(rate).toHaveAttribute('title', AUSDRUCK);
      const meldung = body.locator('.inline-calc-error');
      await expect(meldung).toHaveCount(1);
      await expect(meldung).toHaveText('⚠︎');
      await expect(meldung).toHaveAttribute('title', de['query.formula.finance.periodsRange']);
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }
    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await waitForTab(aus.page);
      const body = aus.page.locator(SEL.markdownBody0);
      const hinweise = body.locator('.inline-calc-error');
      await expect(hinweise).toHaveCount(2);
      for (const i of [0, 1]) {
        await expect(hinweise.nth(i)).toHaveAttribute('title', de['query.formulaLibraryOff']);
      }
      await expect(body.locator('.inline-calc', { hasText: '3.14' })).toBeVisible();
      await expect(body).not.toContainText('1037.03');
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});

// IB-09 (4T-002453, Epic 3E-000378, Story 4S-001140 AK3, AK5, AK6, AK8): die
// Formeln für Prozent, Einheiten und Body-Mass-Index im Fließtext mit den
// Ausdrücken des Abnahme-Handgriffs der Story (ohne die Naturkonstante, die ein
// späterer Task bringt). An: 300, 98.6 und 22.9, ein Ganzes von 0 zeigt das
// Warnzeichen mit der Bereichs-Meldung. Aus (Erweiterung im Profil
// ausgeschaltet): an allen vier Stellen das Warnzeichen mit
// «Formel-Bibliothek ausgeschaltet», eine Grundfunktion rechnet weiter.
test.describe('IB-09: Formeln für Prozent, Einheiten und Body-Mass-Index im Fließtext, an und aus (4T-002453)', () => {
  const de = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
  );
  const WERTE = [
    ['percent.increase(200, 50)', '300'],
    ['round(unit.celsiustofahrenheit(37), 1)', '98.6'],
    ['round(health.bmi(70, 1.75), 1)', '22.9'],
  ];
  const TEXT =
    '# Alltag\n\n' +
    WERTE.map(([ausdruck]) => `Wert {= ${ausdruck} =}.\n\n`).join('') +
    'Ohne Ganzes {= percent.share(5, 0) =}.\n\nKreis {= round(pi(), 2) =}.\n';

  test('an: 300, 98.6, 22.9 und die Bereichs-Meldung; aus: der Hinweis der Bibliothek, pi rechnet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ib09-'));
    const datei = path.join(dir, 'Alltag.md');
    fs.writeFileSync(datei, TEXT, 'utf8');
    const an = await launchApp({ args: [datei] });
    try {
      await waitForTab(an.page);
      const body = an.page.locator(SEL.markdownBody0);
      for (const [ausdruck, ergebnis] of WERTE) {
        const span = body.locator(`.inline-calc[title="${ausdruck}"]`);
        await expect(span).toHaveText(ergebnis);
      }
      const meldung = body.locator('.inline-calc-error');
      await expect(meldung).toHaveCount(1);
      await expect(meldung).toHaveText('⚠︎');
      await expect(meldung).toHaveAttribute('title', de['query.formula.percent.wholeRange']);
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }
    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await waitForTab(aus.page);
      const body = aus.page.locator(SEL.markdownBody0);
      const hinweise = body.locator('.inline-calc-error');
      await expect(hinweise).toHaveCount(4);
      for (const i of [0, 1, 2, 3]) {
        await expect(hinweise.nth(i)).toHaveAttribute('title', de['query.formulaLibraryOff']);
      }
      await expect(body.locator('.inline-calc', { hasText: '3.14' })).toBeVisible();
      await expect(body).not.toContainText('22.9');
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});

// IB-10 (4T-002454, Epic 3E-000378, Story 4S-001140 AK3, AK6, AK8): die
// Naturkonstanten im Fließtext mit dem Ausdruck `{= const.c() =}` des
// Abnahme-Handgriffs der Story und den sehr großen und sehr kleinen Werten.
// An: 299792458, 6.02214076e+23 und 6.62607015e-34 mit allen Stellen. Aus
// (Erweiterung im Profil ausgeschaltet): an allen drei Stellen das Warnzeichen
// mit «Formel-Bibliothek ausgeschaltet», die Konstante pi des Kerns rechnet
// weiter.
test.describe('IB-10: Naturkonstanten im Fließtext, an und aus (4T-002454)', () => {
  const de = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
  );
  const WERTE = [
    ['const.c()', '299792458'],
    ['const.na()', '6.02214076e+23'],
    ['const.h()', '6.62607015e-34'],
  ];
  const TEXT =
    '# Konstanten\n\n' +
    WERTE.map(([ausdruck]) => `Wert {= ${ausdruck} =}.\n\n`).join('') +
    'Kreis {= round(pi(), 2) =}.\n';

  test('an: 299792458 und die Werte mit allen Stellen; aus: der Hinweis der Bibliothek, pi rechnet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ib10-'));
    const datei = path.join(dir, 'Konstanten.md');
    fs.writeFileSync(datei, TEXT, 'utf8');
    const an = await launchApp({ args: [datei] });
    try {
      await waitForTab(an.page);
      const body = an.page.locator(SEL.markdownBody0);
      for (const [ausdruck, ergebnis] of WERTE) {
        const span = body.locator(`.inline-calc[title="${ausdruck}"]`);
        await expect(span).toHaveText(ergebnis);
      }
      await expect(body.locator('.inline-calc-error')).toHaveCount(0);
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }
    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await waitForTab(aus.page);
      const body = aus.page.locator(SEL.markdownBody0);
      const hinweise = body.locator('.inline-calc-error');
      await expect(hinweise).toHaveCount(3);
      for (const i of [0, 1, 2]) {
        await expect(hinweise.nth(i)).toHaveAttribute('title', de['query.formulaLibraryOff']);
      }
      await expect(body.locator('.inline-calc', { hasText: '3.14' })).toBeVisible();
      await expect(body).not.toContainText('299792458');
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
