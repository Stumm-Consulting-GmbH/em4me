// 4T-001483 (Epic 3E-000275): Der Aufgaben-Treffer der Abfrage-Ausgabe steht im
// Textfluss statt im umbrechenden Flex-Kasten.
//
// **Befund des Product Owners vom 2026-09-06** an seinem Wochen-Journal, das die
// Aufgaben der zugehoerigen Tage ueber eine Abfrage einsammelt: Eine
// ausformulierte Aufgabe zerfiel dort in drei Bloecke untereinander — Zeile 1
// nur das Status-Kaestchen, Zeile 2 der Text, Zeile 3 die Plaketten. Ursache
// war die Treffer-Zeile als Flex-Container mit `flex-wrap`, in dem jedes
// Anzeige-Element ein eigener, unteilbarer Umbruch-Block ist.
//
// **Warum die Faelle Rechtecke messen und keine Stilwerte** (Muster aus
// `aufgaben-darstellung.spec.js`): Ein gesetzter `text-indent` beweist nicht,
// dass die Darstellung ihm folgt. Gemessen wird die Lage der Text-Stuecke
// zueinander, also genau das, was der Product Owner gesehen hat.
//
// **Warum langer und kurzer Treffer in derselben Fixture stehen:** Der Fehler
// trat nur bei langer Beschreibung auf, weil kurze Treffer nebeneinander Platz
// finden. Der kurze Treffer ist die Gegenprobe zu AK4 — er darf sich durch die
// Umstellung nicht veraendert haben.
//
// **Die Gegenprobe traegt TF-01 allein**, am 2026-09-07 am zurueckgenommenen
// Stand der Formatvorlage gemessen: TF-01 rot, TF-02 und TF-03 gruen. Das ist
// kein Mangel der beiden anderen, sondern ihre Rolle. TF-03 sichert zu, dass
// der kurze Treffer sich NICHT veraendert, und muss deshalb auf beiden Staenden
// gruen sein. TF-02 bewacht eine Nebenwirkung, die erst mit dem neuen Einzug
// entstehen kann: Vor der Umstellung gab es keinen negativen Erst-Zeilen-Einzug,
// den ein Nachkomme haette erben koennen.
//
// Termine mit 2099er-Jahr (Stabilitaetsregel 9 aus test/README.md).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const DUE = '\u{1F4C5}'; // Kalender-Symbol (faelliger Termin)
const QUERY_FENCE = ['```perspective-query', 'LIST TASKS', '```'].join('\n');

// Die lange Beschreibung ist bewusst ein zusammenhaengender Satz und keine
// Zeichen-Wueste: Sie muss ueber die Breite der Ausgabe hinausreichen UND an
// Wortgrenzen umbrechen koennen, sonst misst der Fall nicht den Umbruch,
// sondern seine Verhinderung.
const LANG =
  'Den Ordner Eingang durchsehen, die offenen Vorgaenge des Vortags uebertragen ' +
  'und anschliessend die Rueckmeldungen aus der Woche zu einem Vermerk ' +
  'zusammenfassen, damit die Wochen-Uebersicht wieder vollstaendig ist';
const KURZ = 'Kurz';

function aufgabenContent() {
  return [
    '# Aufgaben',
    '',
    `- [ ] ${LANG} ${DUE} 2099-01-01`,
    `- [ ] ${KURZ} ${DUE} 2099-02-02`,
    '',
  ].join('\n');
}

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-trefferfluss-'));
  fs.writeFileSync(path.join(dir, 'Uebersicht.md'), `# Uebersicht\n\n${QUERY_FENCE}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'Aufgaben.md'), aufgabenContent(), 'utf8');
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Lage der Anzeige-Elemente eines Treffers in Bildschirm-Koordinaten. Die
// Beschreibung wird ueber ihre einzelnen Zeilen-Rechtecke gelesen, weil genau
// deren Zahl und Lage die Frage nach dem Umbruch beantwortet; ihre Element-Box
// waere bei zwei Zeilen ein Rechteck ueber beide und damit stumm.
async function trefferLage(page, index) {
  return await page.evaluate(
    ({ sel, idx }) => {
      const rund = (wert) => Math.round(wert * 100) / 100;
      const kasten = (r) => ({
        left: rund(r.left),
        right: rund(r.right),
        top: rund(r.top),
        bottom: rund(r.bottom),
      });
      const li = document.querySelectorAll(`${sel} .perspective-query-task`)[idx];
      const desc = li.querySelector('.perspective-query-task-desc');
      const bereich = document.createRange();
      bereich.selectNodeContents(desc);
      const zeilen = [...bereich.getClientRects()].filter((r) => r.width > 0).map(kasten);
      const plaketten = [...li.querySelectorAll('.task-marker')].map((el) => {
        const box = el.getBoundingClientRect();
        const r = document.createRange();
        r.selectNodeContents(el);
        const stuecke = [...r.getClientRects()].filter((x) => x.width > 0);
        return {
          text: el.textContent,
          ...kasten(box),
          // Positiv = der Inhalt steht links ausserhalb seiner eigenen Box.
          // Das ist der in 3E-000240 vermessene Vererbungs-Fehler.
          ueberstandLinks: stuecke.length
            ? rund(box.left - Math.min(...stuecke.map((x) => x.left)))
            : 0,
        };
      });
      const status = li.querySelector('.perspective-query-task-status');
      return { kaestchen: kasten(status.getBoundingClientRect()), zeilen, plaketten };
    },
    { sel: SEL.markdownBody0, idx: index },
  );
}

async function abfrageBereit(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await expect(page.locator(SEL.markdownBody0)).toBeVisible();
  const treffer = page.locator(`${SEL.markdownBody0} .perspective-query-task`);
  await expect(treffer).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator(`${SEL.markdownBody0} .task-marker`).first()).toBeVisible({
    timeout: 15000,
  });
}

test.describe('TF-01: Langer Aufgaben-Treffer als zusammenhaengender Textblock', () => {
  test('Beschreibung bricht in sich um, Kaestchen und erste Plakette bleiben in ihrer Zeile', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Uebersicht.md')] });
    try {
      await abfrageBereit(page);
      const lage = await trefferLage(page, 0);

      // Voraussetzung des Falls: Die Beschreibung reicht ueber die Breite der
      // Ausgabe hinaus. Ohne Umbruch misst der Rest nichts.
      expect(lage.zeilen.length).toBeGreaterThan(1);

      const erste = lage.zeilen[0];
      const letzte = lage.zeilen[lage.zeilen.length - 1];

      // AK1/AK3: Das Kaestchen steht links vor dem Beginn der Beschreibung und
      // in derselben Zeile — nicht darueber. Vor der Umstellung lag es als
      // eigenes Flex-Element in einer eigenen Zeile oberhalb.
      expect(lage.kaestchen.right).toBeLessThanOrEqual(erste.left + 1);
      expect(lage.kaestchen.top).toBeLessThan(erste.bottom);
      expect(lage.kaestchen.bottom).toBeGreaterThan(erste.top);

      // AK3: Die Fortsetzung steht eingerueckt unter ihrem Beginn, nicht unter
      // dem Kaestchen. Der haengende Einzug traegt.
      for (const zeile of lage.zeilen.slice(1)) {
        expect(Math.abs(zeile.left - erste.left)).toBeLessThanOrEqual(1);
      }
      expect(erste.left).toBeGreaterThan(lage.kaestchen.left + 1);

      // AK2: Die erste Plakette steht unmittelbar hinter dem letzten Wort und
      // in dessen Zeile. Vor der Umstellung stand sie eine Zeile tiefer am
      // linken Rand.
      const [plakette] = lage.plaketten;
      expect(plakette.left).toBeGreaterThanOrEqual(letzte.right - 1);
      expect(plakette.top).toBeLessThan(letzte.bottom);
      expect(plakette.bottom).toBeGreaterThan(letzte.top);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TF-02: Plaketten des Treffers erben den negativen Einzug nicht', () => {
  test('der Inhalt jeder Plakette bleibt in ihrer eigenen Box', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Uebersicht.md')] });
    try {
      await abfrageBereit(page);
      // AK6: Der haengende Einzug wird ueber einen negativen
      // Erst-Zeilen-Einzug hergestellt, und `text-indent` vererbt sich auf
      // jeden Block-Container. Ohne den Ruecksetzer auf den Nachkommen
      // schoeben die Plaketten ihren eigenen Inhalt nach links — der in
      // 3E-000240 an der Editor-Zeile vermessene Fehler.
      for (const index of [0, 1]) {
        const lage = await trefferLage(page, index);
        expect(lage.plaketten.length).toBeGreaterThan(0);
        for (const plakette of lage.plaketten) {
          expect(plakette.ueberstandLinks).toBeLessThanOrEqual(0.5);
        }
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TF-03: Kurzer Aufgaben-Treffer bleibt einzeilig', () => {
  test('Kaestchen, Beschreibung und Plakette stehen nebeneinander in einer Zeile', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Uebersicht.md')] });
    try {
      await abfrageBereit(page);
      // AK4: Die Gegenprobe zum langen Treffer. Der kurze Fall sah schon vor
      // der Umstellung richtig aus und muss es geblieben sein.
      const lage = await trefferLage(page, 1);
      expect(lage.zeilen.length).toBe(1);
      const [zeile] = lage.zeilen;
      const [plakette] = lage.plaketten;
      expect(lage.kaestchen.right).toBeLessThanOrEqual(zeile.left + 1);
      expect(lage.kaestchen.top).toBeLessThan(zeile.bottom);
      expect(plakette.left).toBeGreaterThanOrEqual(zeile.right - 1);
      expect(plakette.top).toBeLessThan(zeile.bottom);
      expect(plakette.bottom).toBeGreaterThan(zeile.top);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
