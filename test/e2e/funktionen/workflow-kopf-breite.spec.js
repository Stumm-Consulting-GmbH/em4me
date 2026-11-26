// 4T-002815 (Epic 3E-000445): Lage des Knopfs «Starten» einer Workflow-Notiz,
// wenn eine Zeile des Dokuments breiter ist als das Fenster.
//
// Der Fall nimmt die Notiz «Abfrage schreiben» aus dem Abnahme-Paket des
// Vorhabens 3E-000431 (eine Absatz-Zeile mit rund 300 Zeichen über dem Block)
// und misst in der Live-Ansicht und in der gerenderten Ansicht die Lage des
// Knopfs gegen die sichtbare Breite: einmal mit der Vorgabe des Zeilenumbruchs
// (aus) und einmal mit `word-wrap: true` im Frontmatter, in der Live-Ansicht
// ohne Umbruch zusätzlich ganz nach rechts geblättert. Die Werte gehen als
// JSON-Zeile in die Ausgabe des Laufs (sie trugen die Messung vor der Behebung
// im Kapitel «Lösung» der Aufgabe); geprüft wird erst danach, damit ein roter
// Lauf beide Dateien vermessen hat.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const ABSATZ =
  'Dieser Workflow schreibt das Ergebnis der Abfrage-Datei «Proben-Abfrage» zweimal als ' +
  'Tabelle: unter die Überschrift «Werte» der vorbereiteten Notiz «Bericht» und in eine neue ' +
  'Notiz «Ergebnis». Er läuft nur einmal: Beim zweiten Start gibt es die Notiz «Ergebnis» ' +
  'schon, und der zweite Schritt bricht ab.';

function notiz(zusatzFrontmatter) {
  return [
    '---',
    'workflow: true',
    'name: Abfrage schreiben',
    ...zusatzFrontmatter,
    '---',
    '',
    '# Abfrage schreiben',
    '',
    ABSATZ,
    '',
    '```workflow',
    'notify "Abfrage geschrieben"',
    '```',
    '',
  ].join('\n');
}

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-kopf-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.writeFileSync(path.join(wurzel, 'Workflows', 'Vorgabe.md'), notiz([]), 'utf8');
  fs.writeFileSync(
    path.join(wurzel, 'Workflows', 'Umbruch.md'),
    notiz(['word-wrap: true']),
    'utf8',
  );
  return wurzel;
}

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

// Lage des Knopfs gegen das sichtbare Rechteck seines Rollbereichs.
async function miss(page, kopfSelektor, rollSelektor) {
  return page.evaluate(
    (a) => {
      const kopf = document.querySelector(a.kopf);
      const knopf = kopf ? kopf.querySelector('.cm-wf-starten') : null;
      const roll = document.querySelector(a.roll);
      if (!kopf || !knopf || !roll)
        return { fehlt: { kopf: !!kopf, knopf: !!knopf, roll: !!roll } };
      const r = (el) => {
        const b = el.getBoundingClientRect();
        return {
          links: Math.round(b.left),
          rechts: Math.round(b.right),
          breite: Math.round(b.width),
        };
      };
      const kb = knopf.getBoundingClientRect();
      const rb = roll.getBoundingClientRect();
      return {
        rollbereich: { ...r(roll), clientWidth: roll.clientWidth, scrollWidth: roll.scrollWidth },
        kopf: r(kopf),
        knopf: r(knopf),
        scrollLeft: Math.round(roll.scrollLeft),
        knopfSichtbar: kb.left >= rb.left && kb.right <= rb.left + roll.clientWidth,
        umbruch: !!document.querySelector(`${a.roll} .cm-lineWrapping`),
      };
    },
    { kopf: kopfSelektor, roll: rollSelektor },
  );
}

test.describe('WF-KOPF-01: Knopf «Starten» bei einer Zeile breiter als das Fenster (4T-002815)', () => {
  test('Der Knopf bleibt im sichtbaren Bereich, mit und ohne Zeilenumbruch', async () => {
    // Zwei Dokumente in je zwei Ansichten: In der Prüfmaschine brauchte der
    // Fall 48 s nach einem Aufwärm-Fall und lief als erster Fall nach dem
    // Kaltstart in die Grenze von 60 s (Lauf vom 2026-11-24).
    test.setTimeout(120000);
    const wurzel = baueBereich();
    const { app, page, userData } = await launchApp();
    const messungen = {};
    try {
      await bindeBereich(page, wurzel);
      for (const datei of ['Vorgabe.md', 'Umbruch.md']) {
        await oeffneDokumentImFenster(app, page, path.join(wurzel, 'Workflows', datei));
        await page.locator(SEL.viewBtn('live')).click();
        const liveKopf = `${PANE} .pane-source .cm-wf-kopf`;
        await expect(page.locator(liveKopf)).toHaveCount(1);
        await expect(page.locator(`${liveKopf} .cm-wf-starten`)).toHaveCount(1);
        const rollLive = `${PANE} .pane-source .cm-scroller`;
        const live = await miss(page, liveKopf, rollLive);
        // Ganz nach rechts geblättert: Der Knopf bleibt sichtbar.
        await page.evaluate((s) => {
          const roll = document.querySelector(s);
          roll.scrollLeft = roll.scrollWidth;
        }, rollLive);
        await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => fertig())));
        const geblaettert = await miss(page, liveKopf, rollLive);
        await page.evaluate((s) => {
          document.querySelector(s).scrollLeft = 0;
        }, rollLive);

        await page.locator(SEL.viewBtn('rendered')).click();
        const gerKopf = `${SEL.markdownBody0} > .cm-wf-kopf`;
        await expect(page.locator(gerKopf)).toHaveCount(1);
        const gerendert = await miss(page, gerKopf, SEL.paneRendered0);

        const fenster = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        }));
        messungen[datei] = { live, geblaettert, gerendert };
        console.log(
          'WF-KOPF-01 MESSUNG ' +
            JSON.stringify({
              datei,
              plattform: process.platform,
              fenster,
              live,
              geblaettert,
              gerendert,
            }),
        );
      }

      for (const [datei, m] of Object.entries(messungen)) {
        // AK1: in der Live-Ansicht sichtbar, ohne und mit waagerechtem Blättern.
        expect(m.live.knopfSichtbar, `${datei} live`).toBe(true);
        expect(m.geblaettert.knopfSichtbar, `${datei} live geblättert`).toBe(true);
        // Die Kopfzeile endet am rechten Rand des Sichtfensters, wie mit Umbruch.
        expect(
          Math.abs(
            m.live.kopf.rechts - (m.live.rollbereich.links + m.live.rollbereich.clientWidth),
          ),
          `${datei} rechter Rand der Kopfzeile`,
        ).toBeLessThanOrEqual(2);
        // AK2: Der Knopf steht rechts in der Kopfzeile; die gerenderte Ansicht bleibt.
        expect(
          m.live.kopf.rechts - m.live.knopf.rechts,
          `${datei} Knopf rechts`,
        ).toBeLessThanOrEqual(12);
        expect(m.gerendert.knopfSichtbar, `${datei} gerendert`).toBe(true);
      }
      // Die lange Zeile verbreitert den Inhalt ohne Umbruch tatsächlich.
      expect(messungen['Vorgabe.md'].live.umbruch).toBe(false);
      // Und die Variante mit Umbruch misst tatsächlich mit Umbruch.
      expect(messungen['Umbruch.md'].live.umbruch).toBe(true);
      expect(messungen['Vorgabe.md'].live.rollbereich.scrollWidth).toBeGreaterThan(
        messungen['Vorgabe.md'].live.rollbereich.clientWidth,
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
