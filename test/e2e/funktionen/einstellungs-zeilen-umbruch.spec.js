// 4T-002213 (Epic 3E-000353): Einstellungs-Zeilen brechen im schmalen Fenster
// um. EZ-01: In Einstellungen › Kalender-Systeme mit eingefügter
// gregorianischer Vorlage ragt bei 900, 780, 700 und 640 Bildpunkten
// Fensterbreite kein sichtbares Element über den rechten Rand der
// Inhaltsfläche, und die Inhaltsfläche rollt nicht waagrecht.
//
// Nachbesserung vom 2026-10-18: EZ-02 misst dasselbe auf jeder Seite der
// Einstellungs-Navigation bei 760 und 640 Bildpunkten, weil die Zusage allen
// Seiten gilt und EZ-01 allein Kalender-Systeme maß (fünf Seiten liefen über).
// EZ-03 sichert in gewöhnlicher Breite, dass die Dialoge mit derselben
// Zeilen-Klasse (Diagramm, Kanban-Einstellungen) ihre Zeilen anordnen wie vor
// dem Task: Die Zeilen-Regel des Tasks wirkte zuerst auch dort.
//
// Eigene Datei statt kalender-systeme.spec.js, weil jene über dem Zeilen-Budget
// der Prüfdateien liegt; Bereichs-Aufbau und Weg in die Kalender-Pflege folgen
// deren Muster (makeArea, bindArea, openCalendarSection, KS-01).
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufRendererBereit } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { bedieneBis } = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const TAFEL = '.pane-group[data-pane="0"] .pane-kanban .kanban-tafel';
const LIVE_GITTER = `${SEL.editorContent0} .perspective-datatable`;
const KONTEXTMENUE = '#context-menu';

function makeArea() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-ez-area-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// Öffnen, solange verborgen, klicken, sobald sichtbar (Begründung am
// gleichnamigen Helfer in kalender-systeme.spec.js, 4T-000876).
async function openSection(page, id) {
  const navEntry = page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="${id}"]`);
  await expect
    .poll(async () => {
      if (!(await navEntry.isVisible())) {
        await page.keyboard.press('Control+,');
        return false;
      }
      try {
        await navEntry.click({ timeout: 2000 });
      } catch {
        return false;
      }
      return (await navEntry.getAttribute('class')).includes('active');
    })
    .toBe(true);
}

// Messverfahren des Abnahme-Skripts (Tests/3E-000307/Abnahme/17-ueberstand.js):
// Überstand ist die rechte Kante eines sichtbaren Elements über der rechten
// Kante der Inhaltsfläche, ohne deren Rollbalken. Gelistet wird nur das
// äußerste überstehende Element, damit ein überstehender Behälter nicht
// zugleich alle seine Kinder meldet. Ein Pixel Toleranz gegen Sub-Pixel-Rundung.
// Ein Element in einem eigenen waagrecht rollenden Rahmen (overflow-x auto oder
// scroll) unterhalb der Inhaltsfläche, dessen Kasten selbst im Rand bleibt, ist
// beschnitten und kein Überstand: Die Tabelle der Task-Status rollt so in ihrem
// eigenen Rahmen, statt die Inhaltsfläche rollen zu lassen (Nachbesserung
// 2026-10-18, Standard-Muster für Daten-Tabellen in schmalen Layouts).
function messung() {
  const flaeche = document.querySelector(
    '.pane-group[data-pane="0"] .pane-system .settings-page .settings-section-content',
  );
  if (!flaeche) return null;
  const r = flaeche.getBoundingClientRect();
  const rechts = r.left + flaeche.clientLeft + flaeche.clientWidth;
  const ueber = (el) => el.getBoundingClientRect().right > rechts + 1;
  const beschnitten = (el) => {
    for (let a = el.parentElement; a && a !== flaeche; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && !ueber(a)) return true;
    }
    return false;
  };
  const ueberRand = [];
  for (const el of flaeche.querySelectorAll('*')) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0 || !ueber(el)) continue;
    if (el.parentElement && el.parentElement !== flaeche && ueber(el.parentElement)) continue;
    if (beschnitten(el)) continue;
    const text = (el.value || el.textContent || '').trim().slice(0, 30);
    ueberRand.push(`${el.tagName}.${String(el.className).split(' ')[0]}#${el.id} «${text}»`);
  }
  const aktiv = document.querySelector(
    '.pane-group[data-pane="0"] .pane-system .settings-page .settings-nav-entry.active',
  );
  return {
    fenster: window.innerWidth,
    seite: aktiv ? aktiv.dataset.sectionId : null,
    flaecheBreite: flaeche.clientWidth,
    inhalt: flaeche.querySelectorAll('*').length,
    rollt: flaeche.scrollWidth - flaeche.clientWidth,
    ueberRand,
  };
}

// Warten, bis zwei Messungen hintereinander dasselbe Ergebnis liefern und die
// Bedingung erfüllt ist (neue Breite angekommen, Seite gewechselt und gezeichnet).
async function stabileMessung(page, bedingung) {
  let letzte = null;
  let stabil = 0;
  await expect
    .poll(async () => {
      const m = await page.evaluate(messung);
      if (!m || !bedingung(m)) {
        letzte = null;
        stabil = 0;
        return 0;
      }
      const jetzt = JSON.stringify(m);
      stabil = jetzt === letzte ? stabil + 1 : 0;
      letzte = jetzt;
      return stabil;
    })
    .toBeGreaterThanOrEqual(2);
  return page.evaluate(messung);
}

// Fenster auf die Breite setzen (setContentSize, Vorbild statusleisten-
// faltung.spec.js).
async function setzeFenster(app, breite, hoehe) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, g) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.unmaximize();
      win.setContentSize(g.breite, g.hoehe);
    },
    { breite, hoehe },
  );
}

async function setzeBreite(app, page, breite) {
  await setzeFenster(app, breite, 720);
  return stabileMessung(page, (m) => m.fenster === breite);
}

function pruefe(m, wo) {
  expect(m.ueberRand, `${wo}: Element über dem rechten Rand`).toEqual([]);
  expect(m.rollt, `${wo}: Inhaltsfläche rollt waagrecht`).toBeLessThanOrEqual(0);
}

test.describe('EZ-01: Einstellungs-Zeilen bleiben im schmalen Fenster im Rahmen', () => {
  test('Kalender-Systeme mit gregorianischer Vorlage: nichts über dem Rand, kein waagrechtes Rollen', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openSection(page, 'calendarSystems');
      const addBlock = page.locator('#settings-calsys-block-add');
      await expect(addBlock).toBeVisible();
      await addBlock.click();
      await page.locator('#settings-calsys-block-name-0').fill('Welt');
      await page.locator('#settings-calsys-block-open-0').click();
      await page.locator('#settings-calsys-cal-template').selectOption('gregorian');
      await expect(page.locator('#settings-calsys-cal-name-0')).toHaveValue(
        'Gregorianischer Kalender',
      );

      for (const breite of [900, 780, 700, 640]) {
        pruefe(await setzeBreite(app, page, breite), `Breite ${breite}`);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('EZ-02: Jede Einstellungs-Seite bleibt im schmalen Fenster im Rahmen', () => {
  test('bei 760 und 640 Bildpunkten ragt auf keiner Seite etwas über den Rand, keine Seite rollt waagrecht', async () => {
    test.setTimeout(180000);
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openSection(page, 'calendarSystems');
      const seiten = await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry`)
        .evaluateAll((e) =>
          e
            .filter((x) => x.getBoundingClientRect().height > 0)
            .map((x) => ({ id: x.dataset.sectionId, text: x.textContent.trim() })),
        );
      expect(seiten.length, 'Seiten der Navigation').toBeGreaterThan(20);

      // Gesammelt statt beim ersten Befund abgebrochen, damit ein roter Lauf
      // alle betroffenen Seiten beider Breiten auf einmal nennt.
      const befunde = [];
      for (const breite of [760, 640]) {
        await setzeBreite(app, page, breite);
        for (const s of seiten) {
          await openSection(page, s.id);
          const m = await stabileMessung(
            page,
            (x) => x.fenster === breite && x.seite === s.id && x.inhalt > 0,
          );
          if (m.ueberRand.length || m.rollt > 0) {
            befunde.push(
              `Seite «${s.text}» (${s.id}), Breite ${breite}: rollt ${m.rollt}, über dem Rand ${JSON.stringify(m.ueberRand.slice(0, 6))}`,
            );
          }
        }
      }
      expect(befunde, 'Seiten mit Überstand oder waagrechtem Rollen').toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// Lage zweier Elemente zueinander: dieselbe Zeile heißt, die senkrechten
// Mittellinien liegen höchstens 2 Bildpunkte auseinander. Verglichen wird die
// Mitte, nicht die Oberkante, weil die Zeile ihre Glieder mittig ausrichtet
// (align-items: center): Eine Beschriftung beginnt dort 6 Bildpunkte unter
// ihrem Feld (gemessen 2026-10-18 am Diagramm-Dialog).
function lage(paar) {
  const mitte = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      mitte: b.top + b.height / 2,
      oben: b.top,
      unten: b.bottom,
      links: b.left,
      rechts: b.right,
    };
  };
  return { a: mitte(paar[0]), b: mitte(paar[1]) };
}

// Liefert einen Befund-Text oder null; gesammelt wird im Fall, damit ein roter
// Lauf beide Dialoge nennt.
async function nebeneinander(page, a, b, wo) {
  const l = await page.evaluate(lage, [a, b]);
  if (!l.a || !l.b) return `${wo}: ${l.a ? b : a} fehlt`;
  const abstand = Math.round(Math.abs(l.a.mitte - l.b.mitte));
  if (abstand > 2) return `${wo}: nicht in derselben Zeile (Mitten ${abstand} px auseinander)`;
  if (l.b.links < l.a.rechts) return `${wo}: nicht rechts daneben`;
  return null;
}

async function darunter(page, a, b, wo) {
  const l = await page.evaluate(lage, [a, b]);
  if (!l.a || !l.b) return `${wo}: ${l.a ? b : a} fehlt`;
  if (l.b.oben < l.a.unten - 1) return `${wo}: nicht in der Zeile darunter`;
  return null;
}

async function oeffneDemoSeite(page, name) {
  await page
    .locator('.area-file-row', { hasText: new RegExp(`^${name}$`) })
    .first()
    .click();
  await expect(page.locator(SEL.activeTab0)).toContainText(name);
}

async function sendeMenuKanal(app, kanal, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, n) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(n.kanal, ...n.args);
    },
    { kanal, args },
  );
}

test.describe('EZ-03: Dialoge mit derselben Zeilen-Klasse bleiben in gewöhnlicher Breite unverändert', () => {
  test('Diagramm: Titel-Feld neben der Beschriftung; Kanban-Einstellungen: Wähl-Knöpfe wie zuvor unter ihrem Feld', async () => {
    test.setTimeout(120000);
    const demo = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await setzeFenster(app, 1280, 800);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1280);
      const erg = await page.evaluate((p) => window.api.createDemoAreaAt(p), demo);
      expect(erg && erg.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');

      // Diagramm-Dialog: Live, Bearbeiten an, Rechtsklick in die Daten-Tabelle
      // des Abschnitts «Datatable» (Weg der Prüf-Anleitung, gemessen im
      // Nachtrag N4 der Abnahme-Messung).
      await oeffneDemoSeite(page, '03 Tables');
      await page.locator(SEL.viewBtn('live')).click();
      await bedieneBis(page.locator(SEL.btnEdit), async () =>
        (await page.locator(SEL.btnEdit).getAttribute('class')).includes('active'),
      );
      // Die Tabelle steht weiter unten; der Editor zeichnet nur, was nahe am
      // sichtbaren Ausschnitt liegt. Rollen, bis das Gitter da ist.
      await expect
        .poll(async () => {
          if (await page.locator(`${LIVE_GITTER} .pdt-grid`).count()) return true;
          await page
            .locator(`${SEL.paneSource0} .cm-scroller`)
            .first()
            .evaluate((el) => {
              el.scrollTop += 300;
            });
          return false;
        })
        .toBe(true);
      const zelle = page.locator(`${LIVE_GITTER} tbody td.pdt-cell`).first();
      const einfuegen = page.locator(`${KONTEXTMENUE} [data-menu-id="chart-insert"]`);
      await bedieneBis(zelle, () => einfuegen.isVisible(), {
        zugriff: (l) => l.click({ button: 'right', timeout: 5000 }),
      });
      await einfuegen.click();
      await expect(page.locator('#chart-dialog-title')).toBeVisible();
      const befunde = [
        await nebeneinander(
          page,
          '.chart-dialog-modal label[for="chart-dialog-title"]',
          '#chart-dialog-title',
          'Diagramm-Dialog, Titel',
        ),
      ];
      await page.keyboard.press('Escape');
      await expect(page.locator('.chart-dialog-modal')).toHaveCount(0);

      // Kanban-Einstellungen: Tafel, Bearbeiten an, Einstellungen dieser Tafel.
      await oeffneDemoSeite(page, '13 Kanban');
      await expect
        .poll(async () => {
          if (await page.locator(TAFEL).isVisible()) return true;
          await sendeMenuKanal(app, 'menu:viewChange', 'kanban');
          return page.locator(TAFEL).isVisible();
        })
        .toBe(true);
      await bedieneBis(
        page.locator(SEL.btnEdit),
        async () => (await page.locator(TAFEL).getAttribute('data-aenderbar')) === 'true',
      );
      await sendeMenuKanal(app, 'menu:kanbanBoardSettings');
      await expect(page.locator('.kanban-einstellungen-modal')).toBeVisible();
      // Wie vor 4T-002213 stehen «Ordner wählen…» und «Vorlage wählen…» in
      // der Zeile unter ihrem Feld: Die Dialog-Zeile bricht seit 3E-000319 um,
      // und die Auswahl hat ihre natürliche Breite. Gemessen am 2026-10-18 mit
      // den Stil-Dateien des Stands vor dem Task (Mitten 37 px auseinander);
      // die Annahme «daneben» der Abnahme-Messung beruhte auf einer nachgestellten
      // Zeilen-Regel ohne den Umbruch des Dialogs.
      for (const name of ['zielordner', 'vorlage']) {
        befunde.push(
          await darunter(
            page,
            `#kanban-einstellung-${name}`,
            `.kanban-einstellungen-modal [data-aktion="${name}-waehlen"]`,
            `Kanban-Einstellungen, ${name}`,
          ),
        );
      }
      expect(befunde.filter(Boolean), 'Dialog-Zeilen anders als vor 4T-002213').toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(demo);
    }
  });
});
