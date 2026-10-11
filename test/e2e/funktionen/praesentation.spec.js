// 4T-002164 (Epic 3E-000149): Ablauf-Faelle der Praesentations-Ansicht an der
// gestarteten Anwendung — Erkennung und Modus, die nach oeffentlichen
// Marp-Beispielen nachgebauten Dateien, Trenn-Regel und Notizen, Darstellung,
// Vorfuehrung und der Aus-Zustand der Erweiterung samt gespeichertem Modus.
// Die Ausgaben des Foliensatzes und «Neue Praesentation…» stehen in
// praesentation-export.spec.js.
//
// **Warum diese Faelle gegen die echte Anwendung laufen.** Die Unit-Pruefungen
// der Stufe messen je ein Stueck: den Format-Kern ohne Prozess, die Folie gegen
// eine gestellte Pipeline, die Vorfuehrung gegen eine gestellte Bruecke. Die
// Praesentation laeuft aber ueber beide Prozesse — die Zerlegung ueber die
// Preload-Bruecke mit der Markdown-Instanz, das Vollbild ueber den
// Hauptprozess, die Bilder ueber den Bild-Aufloeser der Preload-Seite — und
// genau diese Naht sieht nur ein Lauf gegen die gestartete Anwendung
// (test/README.md, Abschnitt «Abdeckungs-Matrix», Regel «E2E-Fall pro neuem
// Bedien-Weg ueber eine Prozess-Bruecke»).
//
// **Vollbild.** Gemessen wird am Kanal `window:setFullScreen` und nicht am
// Fenster: Der Fall legt im Hauptprozess eine Mitschrift um den echten Handler
// (Muster KS-07 in test/e2e/regression/4t-0945-b12.spec.js) und prueft Aufruf
// und Rueckgabewert — beim Start `true` mit dem Zustand davor `false`, beim
// Ende `false` mit dem Zustand davor `true`.
//
// Die Pruef-Dokumente sind synthetisch und entstehen je Fall in einem
// Wegwerf-Verzeichnis; die Marp-Nachbauten liegen versioniert unter
// test/fixtures/presentation/. describe-Titel tragen die Matrix-IDs
// (test/abdeckungs-matrix.json, F-347 und S-162).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  warteAufDateiArgument,
  oeffneDokumentImFenster,
} = require('../helpers/app');
const {
  pressUntil,
  pressUntilVisible,
  pressNachfassend,
  oeffneEinstellungsSeite,
  EINSTELLUNGS_SEITE,
} = require('../helpers/eingabe');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');
const { SEL } = require('../helpers/selectors');

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', 'fixtures', 'presentation');

const PANE0 = '.pane-group[data-pane="0"]';
const FLAECHE = `${PANE0} .pane-presentation .praesentation-flaeche`;
const ZAEHLER = `${FLAECHE} .praesentation-zaehler`;
const SLIDE = `${FLAECHE} .presentation-slide`;
const ARTIKEL = `${FLAECHE} .praesentation-folie`;
const BG_BILD = `${SLIDE} .presentation-slide-bg .presentation-bg-bild`;
const HINWEISE = `${FLAECHE} .praesentation-hinweise`;
const VORFUEHREN = `${FLAECHE} .praesentation-vorfuehren`;
const SCHALTER = SEL.viewBtn('presentation');

// Ein Pixel PNG, damit die Hintergrund-Bilder eine Datei finden.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-2164-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, zeilen) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, Array.isArray(zeilen) ? zeilen.join('\n') : zeilen, 'utf8');
  return datei;
}

// Vier Folien mit Kennzeichen; der Text jeder Folie nennt ihre Nummer.
const VIER_FOLIEN = [
  '---',
  'presentation: true',
  '---',
  '',
  '# Folie eins',
  '',
  '---',
  '',
  '## Folie zwei',
  '',
  '---',
  '',
  '## Folie drei',
  '',
  '---',
  '',
  '## Folie vier',
  '',
];

// Dasselbe ohne Kennzeichen: Die Linien sind gewoehnliche Linien.
const OHNE_KENNZEICHEN = [
  '---',
  'title: Gewöhnlich',
  '---',
  '',
  '# Kein Vortrag',
  '',
  '---',
  '',
  'Text.',
  '',
];

// Wechsel in die Ansicht «Folien» ueber Strg+8, den Weg des Anwenders. Der
// Wechsel in denselben Modus ist idempotent; ein verlorener Druck wird
// wiederholt (Stabilitaetsregel 13).
async function oeffneFolien(page) {
  await pressUntilVisible(page, 'Control+8', page.locator(FLAECHE));
}

// Blaettert mit einer Taste, bis der Zaehler den genauen Ziel-Stand zeigt. Die
// Pfeiltasten sind nicht idempotent; deshalb wird nach einer Frist
// nachgefasst statt in enger Schleife gedrueckt (Helfer pressNachfassend).
async function blaettereBis(page, taste, zaehlerText) {
  await pressNachfassend(
    page,
    taste,
    async () => (await page.locator(ZAEHLER).textContent()) === zaehlerText,
  );
}

// Mausrad-Blaettern (Abnahme vom 2026-10-10): Eine Rad-Bewegung ist nicht
// idempotent und hat eine Sperre von 250 ms, deshalb dieselbe Form wie
// pressNachfassend — ausloesen, bis zur Frist auf den GENAUEN Ziel-Stand warten,
// erst danach nachfassen. Springt eine Bewegung zu weit, wird der Fall rot.
async function radNachfassend(page, ausloesen, zaehlerText) {
  const ziel = async () => (await page.locator(ZAEHLER).textContent()) === zaehlerText;
  for (let i = 0; i < 5; i++) {
    await ausloesen();
    const bis = Date.now() + 1000;
    while (Date.now() < bis) {
      if (await ziel()) return;
      await page.waitForTimeout(25);
    }
  }
  await expect.poll(ziel, { timeout: 5000 }).toBe(true);
}

// Eine echte Rad-Bewegung ueber der Mitte der Folie.
async function radUeberFolie(page, deltaY) {
  const box = await page.locator(SLIDE).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
}

// Ein Rad-Schub: drei Ereignisse ohne Pause auf der Flaeche. Er darf genau
// eine Folie weit blaettern.
async function radSchub(page, deltaY) {
  await page.evaluate(
    ([sel, dy]) => {
      const ziel = document.querySelector(sel);
      for (let i = 0; i < 3; i++) {
        ziel.dispatchEvent(
          new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }),
        );
      }
    },
    [FLAECHE, deltaY],
  );
}

// Stand des Menue-Eintrags «Folien» nach dem naechsten Neubau des Menues.
async function folienEintrag(app) {
  return menuEintrag(await menuZustand(app, ''), 'Folien');
}

test.describe('PR-01: Präsentation erkennen, Ansicht öffnen und blättern (F-347)', () => {
  test('mit Kennzeichen verfügbar, Strg+8 öffnet, Zähler, Tasten und Mausrad blättern; ohne Kennzeichen ausgegraut', async () => {
    const dir = machVerzeichnis();
    const ohne = schreibe(dir, 'Gewöhnlich.md', OHNE_KENNZEICHEN);
    const vortrag = schreibe(dir, 'Vortrag.md', VIER_FOLIEN);
    const { app, page, userData } = await launchApp({ args: [ohne, vortrag] });
    try {
      await warteAufDateiArgument(page, vortrag);
      // --- Verfuegbar: Schalter und Menue-Eintrag aktiv --------------------
      await expect(page.locator(SCHALTER)).toBeVisible();
      await expect(page.locator(SCHALTER)).toBeEnabled();
      await expect.poll(async () => (await folienEintrag(app))?.enabled).toBe(true);

      // --- Strg+8 oeffnet die Ansicht an der ersten Folie -----------------
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await expect(page.locator(`${ARTIKEL} h1`)).toHaveText('Folie eins');
      await expect(page.locator(SCHALTER)).toHaveClass(/\bactive\b/);
      await expect.poll(async () => (await folienEintrag(app))?.checked).toBe(true);

      // --- Blaettern: Pfeil rechts, Ende, Pos1, Stillstand am Ende ----------
      await blaettereBis(page, 'ArrowRight', '2 / 4');
      await expect(page.locator(`${ARTIKEL} h2`)).toHaveText('Folie zwei');
      await pressUntil(
        page,
        'End',
        async () => (await page.locator(ZAEHLER).textContent()) === '4 / 4',
      );
      await expect(page.locator(`${ARTIKEL} h2`)).toHaveText('Folie vier');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator(ZAEHLER)).toHaveText('4 / 4');
      await expect(page.locator(`${FLAECHE} .praesentation-weiter`)).toBeDisabled();
      await pressUntil(
        page,
        'Home',
        async () => (await page.locator(ZAEHLER).textContent()) === '1 / 4',
      );
      await expect(page.locator(`${FLAECHE} .praesentation-zurueck`)).toBeDisabled();

      // --- Mausrad: nach unten vor, nach oben zurueck, ein Schub eine Folie --
      await radNachfassend(page, () => radUeberFolie(page, 100), '2 / 4');
      await radNachfassend(page, () => radSchub(page, -100), '1 / 4');
      await radNachfassend(page, () => radSchub(page, 100), '2 / 4');

      // --- Ohne Kennzeichen: Schalter und Menue-Eintrag ausgegraut ----------
      await page.locator(SEL.tabs0).filter({ hasText: 'Gewöhnlich' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Gewöhnlich');
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await expect(page.locator(SCHALTER)).toBeVisible();
      await expect(page.locator(SCHALTER)).toBeDisabled();
      await expect(page.locator(SCHALTER)).toHaveAttribute(
        'title',
        'Dieses Dokument ist keine Präsentation',
      );
      await expect.poll(async () => (await folienEintrag(app))?.enabled).toBe(false);
      // Strg+8 bleibt ohne Wirkung: die Lese-Ansicht mit ihrer Linie steht.
      await page.keyboard.press('Control+8');
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} hr`)).toHaveCount(1);
      await expect(page.locator(FLAECHE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });

  // Rueckfall beim verlorenen Kennzeichen: Die Datei wird ausserhalb der
  // Anwendung geaendert, waehrend sie in der Ansicht «Folien» steht.
  test('verliert das Dokument sein Kennzeichen, fällt die Ansicht in die Lese-Ansicht', async () => {
    const dir = machVerzeichnis();
    const vortrag = schreibe(dir, 'Vortrag.md', VIER_FOLIEN);
    const { app, page, userData } = await launchApp({ args: [vortrag] });
    try {
      await warteAufDateiArgument(page, vortrag);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      schreibe(dir, 'Vortrag.md', OHNE_KENNZEICHEN);
      await expect(page.locator(FLAECHE)).toBeHidden({ timeout: 15000 });
      await expect(page.locator(SEL.markdownBody0)).toContainText('Kein Vortrag');
      await expect(page.locator(SCHALTER)).toBeDisabled();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Die nachgebauten Marp-Dateien (test/fixtures/presentation/) samt ihren
// Bildern in ein Wegwerf-Verzeichnis kopieren; die Bilder sind ein Pixel gross
// und tragen die Namen, die die Dateien nennen.
function kopiereMarpBeispiele(dir) {
  for (const name of ['marp-vortrag.md', 'marp-hintergruende.md']) {
    fs.copyFileSync(path.join(FIXTURE_DIR, name), path.join(dir, name));
  }
  for (const bild of ['logo', 'hintergrund', 'skizze', 'erstes', 'zweites', 'drittes']) {
    fs.writeFileSync(path.join(dir, `${bild}.png`), PNG);
  }
  return {
    vortrag: path.join(dir, 'marp-vortrag.md'),
    hintergruende: path.join(dir, 'marp-hintergruende.md'),
  };
}

// Der gezeigte Zustand einer Folie: erste Ueberschrift, Zahl der
// Hintergrund-Bilder (mit Quelle), Seite der Zweiteilung.
async function folienStand(page) {
  return page.locator(SLIDE).evaluate((slide) => {
    const ueberschrift = slide.querySelector('.praesentation-folie h1, .praesentation-folie h2');
    const bilder = [...slide.querySelectorAll('.presentation-slide-bg .presentation-bg-bild')];
    let seite = null;
    if (slide.classList.contains('presentation-slide--geteilt-left')) seite = 'left';
    if (slide.classList.contains('presentation-slide--geteilt-right')) seite = 'right';
    return {
      ueberschrift: ueberschrift ? ueberschrift.textContent.trim() : null,
      bilder: bilder.filter((b) => (b.getAttribute('src') || '').length > 0).length,
      seite,
    };
  });
}

// Alle Folien von vorn nach hinten durchgehen und ihren Stand sammeln.
async function sammleFolien(page, anzahl) {
  const staende = [];
  for (let i = 1; i <= anzahl; i += 1) {
    if (i > 1) await blaettereBis(page, 'ArrowRight', `${i} / ${anzahl}`);
    await expect(page.locator(ZAEHLER)).toHaveText(`${i} / ${anzahl}`);
    staende.push(await folienStand(page));
  }
  return staende;
}

test.describe('PR-02: Marp-Dateien öffnen als Präsentation (F-347)', () => {
  test('marp: true öffnet die Ansicht; Folienzahl, Überschriften und Hintergründe wie bei Marp', async () => {
    const dir = machVerzeichnis();
    const { vortrag, hintergruende } = kopiereMarpBeispiele(dir);
    const { app, page, userData } = await launchApp({ args: [vortrag] });
    try {
      await warteAufDateiArgument(page, vortrag);
      await expect(page.locator(SCHALTER)).toBeEnabled();
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 6');
      // Notizen stehen nicht auf der Folie (HTML-Kommentar wie bei Marp).
      await expect(page.locator(ARTIKEL)).not.toContainText('Begrüßung');
      expect(await sammleFolien(page, 6)).toEqual([
        { ueberschrift: 'Das erfundene Produkt', bilder: 1, seite: 'left' },
        { ueberschrift: 'Agenda', bilder: 0, seite: null },
        { ueberschrift: 'Ausgangslage', bilder: 1, seite: null },
        { ueberschrift: 'Vorschlag', bilder: 1, seite: 'right' },
        { ueberschrift: 'Beispiel-Code', bilder: 0, seite: null },
        { ueberschrift: 'Danke', bilder: 0, seite: null },
      ]);

      // --- Zweite Datei: mehrere Hintergruende, 4:3, Theme von Marp --------
      await oeffneDokumentImFenster(app, page, hintergruende);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 5');
      await expect(page.locator(SLIDE)).toHaveAttribute('data-size', '4:3');
      // Benannte Folge von Entscheidung 3a: Das Theme `gaia` von Marp kennt
      // die Anwendung nicht; die Folie faellt auf `light` zurueck und sagt es.
      // data-theme an der Folie meint ihre Helligkeit (Entscheidung vom
      // 2026-10-10); `light` ist hell.
      await expect(page.locator(SLIDE)).toHaveAttribute('data-theme', 'light');
      await expect(page.locator(SLIDE)).toHaveClass(/presentation-slide--syntax-light/);
      await expect(page.locator(HINWEISE)).toBeVisible();
      await expect(page.locator(HINWEISE)).toContainText('gaia');
      expect(await sammleFolien(page, 5)).toEqual([
        { ueberschrift: 'Hintergründe im Nachbau', bilder: 2, seite: null },
        { ueberschrift: 'Übereinander', bilder: 3, seite: null },
        { ueberschrift: 'Zweiteilung rechts', bilder: 1, seite: 'right' },
        { ueberschrift: 'Zweiteilung mit Breite', bilder: 1, seite: 'left' },
        { ueberschrift: 'Eingepasst', bilder: 1, seite: null },
      ]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-03: Trenn-Regel an der gestarteten Anwendung (F-347)', () => {
  test('--- nach einer Überschrift trennt, Setext und *** trennen nicht', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Trenn-Regel.md', [
      '---',
      'presentation: true',
      '---',
      '',
      '# Eins',
      '---',
      '# Zwei',
      '',
      'Setext-Titel',
      '---',
      '',
      '***',
      '',
      'Ende',
      '',
    ]);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
      await expect(page.locator(`${ARTIKEL} h1`)).toHaveText('Eins');
      await blaettereBis(page, 'ArrowRight', '2 / 2');
      // Die Setext-Ueberschrift und die Linie aus Sternen stehen auf der
      // zweiten Folie, statt sie zu teilen.
      await expect(page.locator(`${ARTIKEL} h1`)).toHaveText('Zwei');
      await expect(page.locator(`${ARTIKEL} h2`)).toHaveText('Setext-Titel');
      await expect(page.locator(`${ARTIKEL} hr`)).toHaveCount(1);
      await expect(page.locator(ARTIKEL)).toContainText('Ende');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-04: Sprecher-Notizen stehen nicht auf der Folie (F-347)', () => {
  test('%%-Notiz und HTML-Kommentar bleiben unsichtbar, der Text der Folie steht', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Notizen.md', [
      '---',
      'presentation: true',
      '---',
      '',
      '# Mit Notiz',
      '',
      'Sichtbarer Text.',
      '',
      '%% Geheime Prozent-Notiz %%',
      '',
      '<!-- Geheime HTML-Notiz -->',
      '',
    ]);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 1');
      await expect(page.locator(ARTIKEL)).toContainText('Sichtbarer Text.');
      await expect(page.locator(FLAECHE)).not.toContainText('Geheime');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Eine Slot-Variable, wie sie an der Folie steht.
function slotVariable(page, name) {
  return page.locator(SLIDE).evaluate((slide, n) => slide.style.getPropertyValue(n).trim(), name);
}

test.describe('PR-05: Darstellung — Theme, Übersteuerung, Kopf, Fuß, Seitenzahl, Hintergrund, Überlauf (F-347)', () => {
  test('dark mit übersteuertem Akzent, Zeilen und Nummer, bg, bg left:40 %, Überlauf-Markierung', async () => {
    const dir = machVerzeichnis();
    fs.writeFileSync(path.join(dir, 'bild.png'), PNG);
    const voll = Array.from({ length: 40 }, (_, i) => `- Zeile ${i + 1} der zu vollen Folie`);
    const datei = schreibe(dir, 'Darstellung.md', [
      '---',
      'presentation: true',
      'theme:',
      '  name: dark',
      '  accent: "#c0392b"',
      'paginate: true',
      'header: Kopfzeile der Probe',
      'footer: Fußzeile der Probe',
      '---',
      '',
      '# Erste Folie',
      '',
      '---',
      '',
      '## Hintergrund',
      '',
      '![bg](bild.png)',
      '',
      '---',
      '',
      '## Zweiteilung',
      '',
      '![bg left:40%](bild.png)',
      '',
      'Text rechts.',
      '',
      '---',
      '',
      '## Zu voll',
      '',
      ...voll,
      '',
    ]);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      // Theme `dark` mit uebersteuertem Akzent: Slot-Variablen an der Folie;
      // data-theme meint die Helligkeit der Folie (dunkel).
      await expect(page.locator(SLIDE)).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator(SLIDE)).toHaveClass(/presentation-slide--syntax-dark/);
      expect(await slotVariable(page, '--slide-background')).toBe('#1e1e1e');
      expect(await slotVariable(page, '--slide-accent')).toBe('#c0392b');
      await expect(page.locator(HINWEISE)).toBeHidden();
      // Geometrie 16:9 in Entwurfsgroesse.
      await expect(page.locator(SLIDE)).toHaveAttribute('data-size', '16:9');
      expect(await page.locator(SLIDE).evaluate((s) => [s.style.width, s.style.height])).toEqual([
        '1280px',
        '720px',
      ]);
      // Kopf, Fuss und Seitenzahl.
      await expect(page.locator(`${SLIDE} .presentation-slide-kopf`)).toHaveText(
        'Kopfzeile der Probe',
      );
      await expect(page.locator(`${SLIDE} .presentation-slide-fuss`)).toHaveText(
        'Fußzeile der Probe',
      );
      await expect(page.locator(`${SLIDE} .presentation-slide-nummer`)).toHaveText('1');
      await expect(page.locator(`${SLIDE} .presentation-slide-nummer`)).toBeVisible();

      // --- Hintergrund-Ebene ---------------------------------------------
      await blaettereBis(page, 'ArrowRight', '2 / 4');
      await expect(page.locator(SLIDE)).toHaveClass(/presentation-slide--hintergrund/);
      await expect(page.locator(BG_BILD)).toHaveCount(1);
      await expect(page.locator(BG_BILD)).toHaveAttribute('src', /.+/);
      await expect(page.locator(`${SLIDE} .presentation-slide-nummer`)).toHaveText('2');

      // --- Zweiteilung links mit 40 % -------------------------------------
      await blaettereBis(page, 'ArrowRight', '3 / 4');
      await expect(page.locator(SLIDE)).toHaveClass(/presentation-slide--geteilt-left/);
      expect(
        await page.locator(`${SLIDE} .presentation-slide-bg`).evaluate((bg) => bg.style.width),
      ).toBe('40%');
      await expect(page.locator(ARTIKEL)).toContainText('Text rechts.');

      // --- Ueberlauf-Markierung -------------------------------------------
      await blaettereBis(page, 'ArrowRight', '4 / 4');
      await expect(page.locator(SLIDE)).toHaveClass(/presentation-slide--ueberlauf/);
      await expect(page.locator(`${FLAECHE} .presentation-slide-ueberlauf`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-06: Geometrie 4:3 (F-347)', () => {
  test('size: 4:3 setzt die Folie auf 960 × 720', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vier-zu-drei.md', [
      '---',
      'presentation: true',
      'size: 4:3',
      '---',
      '',
      '# Im Format 4:3',
      '',
    ]);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(SLIDE)).toHaveAttribute('data-size', '4:3');
      expect(await page.locator(SLIDE).evaluate((s) => [s.style.width, s.style.height])).toEqual([
        '960px',
        '720px',
      ]);
      await expect(page.locator(HINWEISE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Mitschrift um den echten Vollbild-Handler im Hauptprozess: je Aufruf der
// Wunsch und der Rueckgabewert (Zustand vor dem Aufruf). Der echte Handler
// laeuft weiter; gemessen wird am Kanal, nicht am Fenster.
async function schreibeVollbildMit(app) {
  await hauptSenden(app, ({ ipcMain }) => {
    const karte = ipcMain._invokeHandlers;
    const echt = karte.get('window:setFullScreen');
    globalThis.__vollbildAufrufe = [];
    karte.set('window:setFullScreen', async (e, ...args) => {
      const vorher = await echt(e, ...args);
      globalThis.__vollbildAufrufe.push({ an: args[0], vorher });
      return vorher;
    });
  });
}

function vollbildAufrufe(app) {
  return hauptLesen(app, () => globalThis.__vollbildAufrufe || []);
}

async function istVorfuehrung(page) {
  return page.locator('body').evaluate((b) => b.classList.contains('presentation-vorfuehrung'));
}

// Esc beendet die Vorfuehrung. Ein verlorener Druck wird nachgefasst; ein
// zweiter Druck nach dem Ende trifft die Escape-Kaskade ohne Wirkung auf die
// Ansicht.
async function beendeMitEsc(page) {
  await pressNachfassend(page, 'Escape', async () => !(await istVorfuehrung(page)));
}

// Nach dem Ende: Ansicht wieder da, Statusleiste sichtbar, Folie unveraendert,
// und der Kanal hat das Fenster auf den Zustand davor zurueckgesetzt.
async function pruefeRueckkehr(page, app, zaehlerText, aufrufeBisher) {
  await expect(page.locator('body')).not.toHaveClass(/presentation-vorfuehrung/);
  await expect(page.locator(PANE0)).not.toHaveClass(/presentation-vorfuehrung-spalte/);
  await expect(page.locator(FLAECHE)).toBeVisible();
  await expect(page.locator(SEL.statusbar)).toBeVisible();
  await expect(page.locator(ZAEHLER)).toHaveText(zaehlerText);
  await expect.poll(async () => (await vollbildAufrufe(app)).length).toBe(aufrufeBisher + 2);
  const aufrufe = await vollbildAufrufe(app);
  expect(aufrufe.slice(aufrufeBisher)).toEqual([
    { an: true, vorher: false },
    { an: false, vorher: true },
  ]);
}

async function pruefeVorfuehrungLaeuft(page) {
  await expect(page.locator('body')).toHaveClass(/presentation-vorfuehrung/);
  await expect(page.locator(PANE0)).toHaveClass(/presentation-vorfuehrung-spalte/);
  await expect(page.locator(SEL.statusbar)).toBeHidden();
  await expect(page.locator(`${SLIDE}`)).toBeVisible();
}

test.describe('PR-07: Vorführung über F5, Schaltfläche und Menü (S-162)', () => {
  test('startet im Vollbild, blättert mit Pfeil, Mausklick und Mausrad, Esc beendet und stellt die Ansicht wieder her', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vorführung.md', VIER_FOLIEN);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await schreibeVollbildMit(app);

      // --- Weg 1: F5 ------------------------------------------------------
      // Ein zweiter Druck waehrend der Vorfuehrung startet nichts Neues
      // (starteVorfuehrung kehrt bei laufender Vorfuehrung zurueck).
      await pressUntil(page, 'F5', () => istVorfuehrung(page));
      await pruefeVorfuehrungLaeuft(page);
      await expect.poll(async () => (await vollbildAufrufe(app)).length).toBe(1);
      expect((await vollbildAufrufe(app))[0]).toEqual({ an: true, vorher: false });
      await blaettereBis(page, 'ArrowRight', '2 / 4');
      // Mausklick blaettert vorwaerts — geklickt wird auf eine Stelle der
      // Folie, deren Element vorher belegt ist (Stabilitaetsregel 34).
      const box = await page.locator(SLIDE).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const getroffen = await page.evaluate(
        ([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest('.praesentation-flaeche')),
        [x, y],
      );
      expect(getroffen).toBe(true);
      await page.mouse.click(x, y);
      await expect(page.locator(ZAEHLER)).toHaveText('3 / 4');
      // Mausrad (Abnahme vom 2026-10-10): nach oben zurueck, ein Schub nach
      // unten genau eine Folie vor.
      await radNachfassend(page, () => radUeberFolie(page, -100), '2 / 4');
      await radNachfassend(page, () => radSchub(page, 100), '3 / 4');
      await pruefeVorfuehrungLaeuft(page);
      await beendeMitEsc(page);
      await pruefeRueckkehr(page, app, '3 / 4', 0);

      // --- Weg 2: Schaltflaeche «Vorfuehrung starten» -----------------------
      await expect(page.locator(VORFUEHREN)).toHaveText('Vorführung starten');
      await page.locator(VORFUEHREN).click();
      await pruefeVorfuehrungLaeuft(page);
      await expect(page.locator(ZAEHLER)).toHaveText('3 / 4');
      await beendeMitEsc(page);
      await pruefeRueckkehr(page, app, '3 / 4', 2);

      // --- Weg 3: Menue «Ansicht › Praesentation › Vorfuehrung starten» -----
      // Derselbe Kanal wie der Menue-Eintrag; ein zweites Senden bei laufender
      // Vorfuehrung startet nichts Neues.
      await expect
        .poll(async () => {
          if (await istVorfuehrung(page)) return true;
          await hauptSenden(app, ({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            if (win && !win.isDestroyed()) win.webContents.send('menu:presentationStart');
          });
          return istVorfuehrung(page);
        })
        .toBe(true);
      await pruefeVorfuehrungLaeuft(page);
      await beendeMitEsc(page);
      await pruefeRueckkehr(page, app, '3 / 4', 4);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Menue-Mitschrift aller Beschriftungen (Muster KB-05 in kanban-tafel.spec.js).
async function armiereMenueMitschrift(app) {
  await hauptSenden(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__menuCaptureArmed) return;
    win.__menuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const sammle = (items) => {
        const raus = [];
        for (const it of items || []) {
          if (it.label) raus.push(it.label);
          if (it.submenu) raus.push(...sammle(it.submenu.items));
        }
        return raus;
      };
      globalThis.__menuLabels = sammle(menu ? menu.items : []);
      return orig(menu);
    };
  });
}

function menueBeschriftungen(app) {
  return hauptLesen(app, () => globalThis.__menuLabels || []);
}

// Die Erweiterung «Praesentation» ueber den Einstellungs-Bereich schalten — der
// Weg des Anwenders (Muster KB-05).
async function schaltePraesentationsErweiterung(page, an) {
  await oeffneEinstellungsSeite(page);
  await page
    .locator(`${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="extensions"]`)
    .click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
  const schalter = page.locator('#settings-extension-presentation');
  if (an) await schalter.check();
  else await schalter.uncheck();
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();
}

test.describe('PR-08: Erweiterung «Präsentation» abschalten und wieder einschalten (F-347)', () => {
  test('Modus, Schalter und Menü entfallen, --- bleibt Linie, nichts geht verloren', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vortrag.md', VIER_FOLIEN);
    const vorher = fs.readFileSync(datei, 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await armiereMenueMitschrift(app);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining(['Folien', 'Präsentation', 'Vorführung starten']));

      // --- Abschalten -----------------------------------------------------
      await schaltePraesentationsErweiterung(page, false);
      await expect(page.locator(FLAECHE)).toBeHidden();
      await expect(page.locator(SCHALTER)).toBeHidden();
      await expect.poll(() => menueBeschriftungen(app)).not.toContain('Folien');
      await expect.poll(() => menueBeschriftungen(app)).not.toContain('Präsentation');
      await expect
        .poll(() => menueBeschriftungen(app))
        .not.toContain('Foliensatz als PDF exportieren…');
      // Rueckfall in die Lese-Ansicht; jede Trennlinie ist eine Linie.
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} hr`)).toHaveCount(3);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);

      // --- Wieder einschalten ---------------------------------------------
      await schaltePraesentationsErweiterung(page, true);
      await expect(page.locator(SCHALTER)).toBeVisible();
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining(['Folien', 'Präsentation', 'Vorführung starten']));
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Sauber beenden (before-quit persistiert die Sitzung) und warten, bis der
// Prozess weg ist (Muster SM-09 in test/e2e/smoke/smoke.spec.js).
async function beendeSauber(app) {
  await hauptSenden(app, ({ app: elektronApp }) => elektronApp.quit());
  await app.waitForEvent('close');
}

test.describe('PR-09: gespeicherter Modus bei abgeschalteter Erweiterung (F-347)', () => {
  test('nach dem Neustart steht die Präsentation in der Folien-Ansicht, ohne Erweiterung in der Lese-Ansicht', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vortrag.md', VIER_FOLIEN);
    const erster = await launchApp({ args: [datei] });
    const userData = erster.userData;
    try {
      await warteAufDateiArgument(erster.page, datei);
      await oeffneFolien(erster.page);
      await expect(erster.page.locator(ZAEHLER)).toHaveText('1 / 4');
      await beendeSauber(erster.app);

      // Gegenprobe: Mit eingeschalteter Erweiterung kehrt der Modus zurueck —
      // sonst saehe die Lese-Ansicht im dritten Start nach Rueckfall aus,
      // ohne einer zu sein.
      const zweiter = await launchApp({ userData });
      try {
        await expect(zweiter.page.locator(SEL.tabs0)).toHaveCount(1);
        await expect(zweiter.page.locator(FLAECHE)).toBeVisible();
        await expect(zweiter.page.locator(ZAEHLER)).toHaveText('1 / 4');
        await beendeSauber(zweiter.app);
      } finally {
        await closeApp(zweiter.app, null);
      }

      // Dritter Start mit abgeschalteter Erweiterung: Rueckfall auf die
      // Lese-Ansicht, `---` bleibt Linie.
      const dritter = await launchApp({
        userData,
        settings: { language: 'de', extensions: { disabled: ['presentation'] } },
      });
      try {
        await expect(dritter.page.locator(SEL.tabs0)).toHaveCount(1);
        await expect(dritter.page.locator(SEL.markdownBody0)).toBeVisible();
        await expect(dritter.page.locator(`${SEL.markdownBody0} hr`)).toHaveCount(3);
        await expect(dritter.page.locator(FLAECHE)).toBeHidden();
        await expect(dritter.page.locator(SCHALTER)).toBeHidden();
      } finally {
        await closeApp(dritter.app, null, { force: true });
      }
    } finally {
      await closeApp(erster.app, userData);
      raeumeAuf(dir);
    }
  });
});

// Befund der zweiten Abnahme vom 2026-10-10: Nach dem Schliessen aller
// Dokumente blieb die zuletzt gezeigte Folie samt Zaehler und Leiste stehen,
// und die Leer-Anzeige erschien darueber. Gemessen wird am DOM und an der
// Ansichts-Klasse der Spalte, nicht an der Sichtbarkeit des Spalten-Behaelters:
// Ohne eingeschaltetes Seiten-Panel ist dieser im Leer-Zustand ohnehin
// verborgen, und der Befund zeigte sich nur mit einem solchen Panel.
test.describe('PR-13: ohne Dokument keine Folie (F-347)', () => {
  test('alle Dokumente schließen leert die Fläche; erneut geöffnet steht die Folie wieder', async () => {
    const dir = machVerzeichnis();
    const vortrag = schreibe(dir, 'Vortrag.md', VIER_FOLIEN);
    const { app, page, userData } = await launchApp({ args: [vortrag] });
    try {
      await warteAufDateiArgument(page, vortrag);
      await oeffneFolien(page);
      await blaettereBis(page, 'ArrowRight', '2 / 4');

      // --- Alle Dokumente schliessen ---------------------------------------
      await page.locator(SEL.tabs0).first().locator('.tab-close').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
      await expect(page.locator(SEL.emptyState)).toBeVisible();
      await expect(page.locator(`${PANE0} .pane-presentation > *`)).toHaveCount(0);
      await expect(page.locator(ZAEHLER)).toHaveCount(0);
      await expect(page.locator(SLIDE)).toHaveCount(0);
      await expect(page.locator(SEL.content0)).not.toHaveClass(/\bview-presentation\b/);

      // --- Erneut oeffnen: die Folie ist wieder da -------------------------
      await oeffneDokumentImFenster(app, page, vortrag);
      await expect(page.locator(SEL.emptyState)).toBeHidden();
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText(/^\d \/ 4$/);
      await expect(page.locator(`${ARTIKEL} h1, ${ARTIKEL} h2`).first()).toBeVisible();
      await blaettereBis(page, 'End', '4 / 4');
      await expect(page.locator(`${ARTIKEL} h2`)).toHaveText('Folie vier');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
