// 4T-001747 (Epic 3E-000289): Abnahme-Befund des Product Owners vom 2026-09-14
// an der gebauten Programmdatei — «Anlegen geht. Verschieben auf dem Canvas
// geht nicht. Inhalt der Datei wird nicht angezeigt. Wenn ich etwas anderes
// anlege, dann verschwindet die Karte wieder.»
//
// **Warum dieser Prüffall gegen die echte Anwendung läuft und nicht in jsdom.**
// Die Unit-Prüfungen des Vorgangs rufen die Bedienung mit gestellten Rückrufen:
// Der Einbettungs-Abruf ist gestellt, der Schreibweg ist gestellt, und die
// Neu-Übergabe des Dokuments stellt der Prüffall selbst. Genau an diesen drei
// Nahtstellen lagen die drei Befunde — der Auflöser weist ein Ziel ohne Endung
// ab, die zurückgestellte Neu-Übergabe kam nach der Handlung mit dem Stand von
// davor zurück, und die Ziel-Abfrage blieb ohne `Enter` für immer stehen. Ein
// gestellter Nachbar kann keinen davon zeigen.
//
// Geprüft wird die ganze Strecke am Weg des Anwenders: Kommando, Ziel-Eingabe,
// Bestätigen, Karte auf der Fläche, Inhalt des Ziel-Dokuments im Körper, Ziehen
// der Karte, der Bestand der Karte beim nächsten Anlegen — und der Abbruch der
// Ziel-Abfrage, wenn der Anwender danebenklickt. 4T-001748 kommt mit derselben
// Strecke für die Bild-Karte dazu, weil sie dieselben drei Stellen benutzt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const CANVAS = `${PANE0} .canvas-view`;
const BUEHNE = `${CANVAS} .canvas-buehne`;
const KARTEN = `${CANVAS} .canvas-karte`;
const VERWEIS_KARTE = `${CANVAS} .canvas-karte-verweis`;
const BILD_KARTE = `${CANVAS} .canvas-karte-bild-karte`;
const ZIEL_ABFRAGE = `${CANVAS} .canvas-karte-ziel-eingabe`;
const ZIEL_FELD = `${ZIEL_ABFRAGE} .canvas-karte-verweis-feld`;
const BILD_FELD = `${ZIEL_ABFRAGE} .canvas-karte-bild-feld`;

const ZIEL_TEXT = 'Inhalt des Ziel-Dokuments.';

// Ein Bild von einem Pixel, damit die Bild-Karte eine echte Datei bekommt.
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmM' +
  'IQAAAABJRU5ErkJggg==';

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1747-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function sendeMenuKanal(app, kanal, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, nutzlast) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(nutzlast.kanal, ...nutzlast.args);
    },
    { kanal, args },
  );
}

// Bereich mit Ziel-Dokument, Bild und einer Fläche, die bereits eine Text-Karte
// trägt: Ohne ein vorhandenes Element hätte die Fläche nichts einzupassen, und
// die Mitte des sichtbaren Ausschnitts wäre nicht bestimmt.
//
// Das Ziel-Dokument heißt **ohne** Endung, wie der Anwender es schreibt — genau
// diese Schreibweise war der erste Befund.
function baueBereich(dir) {
  fs.writeFileSync(path.join(dir, 'Verweis-Test.md'), `# Verweis-Test\n\n${ZIEL_TEXT}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'Punkt.png'), Buffer.from(PIXEL_PNG, 'base64'));
  const flaeche = path.join(dir, 'Flaeche.md');
  fs.writeFileSync(
    flaeche,
    [
      '# Fläche',
      '',
      '```perspective-canvas',
      '!karte k1 x=0 y=0 b=240 h=120',
      'Bestandskarte',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return flaeche;
}

// Bearbeitbarer Quelltext-Modus, danach die Canvas-Ansicht. Beides über den
// Menü-Weg, wie es die Bestands-Specs tun.
async function oeffneFlaeche(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendeMenuKanal(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(`${PANE0} .pane-source-editor`)).not.toHaveClass(/read-only/);
  await sendeMenuKanal(app, 'menu:viewChange', 'canvas');
  await expect(page.locator(CANVAS)).toBeVisible();
  await expect(page.locator(KARTEN)).toHaveCount(1);
}

// Der Dokument-Text, wie ihn der Puffer der Spalte trägt.
//
// Gelesen wird der Editor und nicht die Datei: Die Fläche schreibt in den
// Puffer, und ein Speichern dazwischen brächte nur eine zweite Fehlerquelle.
// Der Editor ist in der Canvas-Ansicht per CSS versteckt, sein Inhalt aber im
// Baum.
async function pufferText(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.pane-group[data-pane="0"] .pane-source .cm-content');
    if (!el) return '';
    return [...el.querySelectorAll('.cm-line')].map((z) => z.textContent).join('\n');
  });
}

async function lage(page, wahl) {
  return page.locator(wahl).evaluate((el) => ({ left: el.style.left, top: el.style.top }));
}

test.describe('4T-001747/4T-001748: Karten mit Verweis und Bild anlegen (Abnahme 2026-09-14)', () => {
  test('Verweis-Karte: anlegen, Inhalt zeigen, ziehen, beim nächsten Anlegen stehen bleiben', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueBereich(dir);
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneFlaeche(app, page);

      // --- Anlegen über das Kommando -------------------------------------------
      await sendeMenuKanal(app, 'menu:canvasAddLinkCard');
      const feld = page.locator(ZIEL_FELD);
      await expect(feld).toBeVisible();
      await feld.fill('Verweis-Test');
      await feld.press('Enter');

      // Die Ziel-Abfrage ist weg — bliebe sie stehen, hielte der Anwender sie
      // für die Karte, die er angelegt hat (so sah es der Product Owner).
      await expect(page.locator(ZIEL_ABFRAGE)).toHaveCount(0);

      // Die Karte steht in der Fence.
      expect(await pufferText(page)).toContain('doc="Verweis-Test"');

      // Befund «Inhalt der Datei wird nicht angezeigt»: Die Karte trägt
      // Kopfzeile und Körper, und im Körper steht der Text des Ziel-Dokuments.
      // Das Ziel ist ohne Endung geschrieben — genau daran scheiterte der
      // Abruf, weil der Einbettungs-Auflöser eine Markdown-Endung verlangt.
      await expect(page.locator(VERWEIS_KARTE)).toHaveCount(1);
      await expect(page.locator(`${VERWEIS_KARTE} .canvas-karte-kopf`)).toContainText(
        'Verweis-Test',
      );
      await expect(page.locator(`${VERWEIS_KARTE} .canvas-karte-koerper`)).toContainText(ZIEL_TEXT);

      // --- Ziehen ----------------------------------------------------------------
      //
      // Befund «Verschieben auf dem Canvas geht nicht»: Die Live-Aktualisierung
      // wird während einer laufenden Bedien-Handlung zurückgestellt und kam
      // danach mit dem Stand von **vor** der Handlung zurück — die Karte sprang
      // im Moment des Loslassens an ihren alten Platz.
      //
      // Die Pause mitten im Zug ist der Kern dieses Falls und keine Zierde: Sie
      // lässt den 200-ms-Takt der Live-Aktualisierung **während** des Zuges
      // fällig werden, und erst dann gibt es eine zurückgestellte Übergabe, die
      // beim Loslassen nachgeholt wird. Ohne sie liefe der Fall am Befund
      // vorbei.
      const vorher = await lage(page, VERWEIS_KARTE);
      const kasten = await page.locator(`${VERWEIS_KARTE} .canvas-karte-kopf`).boundingBox();
      const mx = kasten.x + kasten.width / 2;
      const my = kasten.y + kasten.height / 2;
      await page.mouse.move(mx, my);
      await page.mouse.down();
      await page.mouse.move(mx + 60, my + 40, { steps: 5 });
      await page.waitForTimeout(400);
      await page.mouse.move(mx + 120, my + 80, { steps: 5 });
      await page.mouse.up();

      // Unmittelbar nach dem Loslassen, ohne Wartezeit: Die Karte bleibt, wohin
      // sie gezogen wurde.
      const nachher = await lage(page, VERWEIS_KARTE);
      expect(nachher).not.toEqual(vorher);
      expect(await pufferText(page)).toMatch(/!karte k2 x=(?!0 y=0\b)/);

      // Und sie bleibt es auch, wenn der Takt der Live-Aktualisierung durch ist.
      await page.waitForTimeout(400);
      expect(await lage(page, VERWEIS_KARTE)).toEqual(nachher);

      // --- Etwas anderes anlegen --------------------------------------------------
      // Befund «Wenn ich etwas anderes anlege, dann verschwindet die Karte».
      await sendeMenuKanal(app, 'menu:canvasAddCard');
      await expect(page.locator(KARTEN)).toHaveCount(3);
      await expect(page.locator(VERWEIS_KARTE)).toHaveCount(1);
      await expect(page.locator(`${VERWEIS_KARTE} .canvas-karte-koerper`)).toContainText(ZIEL_TEXT);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });

  // Das Öffnen des Ziels lief über **denselben** Auflöser wie die Anzeige und
  // trug damit denselben Fehler: Ein Ziel ohne Endung wurde mit
  // `extension not allowed` abgewiesen, und der Doppelklick auf den Körper
  // brachte statt des Dokuments nur den Hinweis «Ziel nicht gefunden».
  test('Ziel öffnen: der Doppelklick auf den Körper lädt das verwiesene Dokument', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueBereich(dir);
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneFlaeche(app, page);

      await sendeMenuKanal(app, 'menu:canvasAddLinkCard');
      const feld = page.locator(ZIEL_FELD);
      await expect(feld).toBeVisible();
      await feld.fill('Verweis-Test');
      await feld.press('Enter');
      await expect(page.locator(`${VERWEIS_KARTE} .canvas-karte-koerper`)).toContainText(ZIEL_TEXT);

      await page.locator(`${VERWEIS_KARTE} .canvas-karte-koerper`).dblclick();
      await expect(page.locator(SEL.tabs0, { hasText: 'Verweis-Test' })).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });

  test('Ziel-Abfrage bricht beim Danebenklicken ab und lässt die Fläche weiterarbeiten', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueBereich(dir);
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneFlaeche(app, page);

      await sendeMenuKanal(app, 'menu:canvasAddLinkCard');
      const feld = page.locator(ZIEL_FELD);
      await expect(feld).toBeVisible();
      await feld.fill('Verweis-Test');

      // Danebenklicken statt `Enter`. Der Kopf des Moduls sagt zu, dass der
      // Fokus-Verlust abbricht; ohne die Umsetzung blieb das Feld stehen, und
      // mit ihm blieb die Fläche für jede Neu-Übergabe gesperrt.
      const buehne = await page.locator(BUEHNE).boundingBox();
      await page.mouse.click(buehne.x + 24, buehne.y + 24);
      await expect(page.locator(ZIEL_ABFRAGE)).toHaveCount(0);

      // Nichts angelegt — ein Abbruch ist ein Abbruch.
      await expect(page.locator(KARTEN)).toHaveCount(1);
      expect(await pufferText(page)).not.toContain('doc=');

      // Und die Fläche nimmt weiterhin Handlungen und Neu-Übergaben an.
      await sendeMenuKanal(app, 'menu:canvasAddCard');
      await expect(page.locator(KARTEN)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });

  test('Bild-Karte: anlegen, Bild zeigen und beim nächsten Anlegen stehen bleiben', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueBereich(dir);
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneFlaeche(app, page);

      await sendeMenuKanal(app, 'menu:canvasAddImageCard');
      const feld = page.locator(BILD_FELD);
      await expect(feld).toBeVisible();
      await feld.fill('Punkt.png');
      await feld.press('Enter');

      await expect(page.locator(ZIEL_ABFRAGE)).toHaveCount(0);
      expect(await pufferText(page)).toContain('bild="Punkt.png"');
      await expect(page.locator(BILD_KARTE)).toHaveCount(1);
      await expect(page.locator(`${BILD_KARTE} .canvas-karte-kopf`)).toContainText('Punkt.png');
      await expect(page.locator(`${BILD_KARTE} img.canvas-karte-bild`)).toHaveCount(1);

      await sendeMenuKanal(app, 'menu:canvasAddCard');
      await expect(page.locator(KARTEN)).toHaveCount(3);
      await expect(page.locator(`${BILD_KARTE} img.canvas-karte-bild`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
