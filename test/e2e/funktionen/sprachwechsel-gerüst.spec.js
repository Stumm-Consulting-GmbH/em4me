// 4T-002190 (Epic 3E-000353): E2E-Funktions-Suite — Texte des Fenster-Gerüsts
// beim Sprachwechsel. Kürzel SG- (Sprachwechsel-Gerüst).
//
// SG-01 der Kurzhinweis der Dokument-Historie in der Statusleiste: Er hängt vom
// Zustand ab, trägt einen Platzhalter und blieb nach dem Sprachwechsel bis zum
// nächsten Reiter-Wechsel oder Speichern in der alten Sprache (Story
// 4S-000465, AK8). SG-02 die Vorlese-Texte der dreizehn Elemente, die bis
// dahin fest in einer Sprache im Gerüst standen (Story 4S-000655, AK1 und
// AK7), in allen fünf Sprachen. Dass künftig kein Element ohne
// Übersetzungs-Merkmal hinzukommt, hält der Unit-Wächter
// `test/unit/renderer/gerüst-vorlese-texte.test.js`.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  warteAufDateiArgument,
  warteAufRendererBereit,
} = require('../helpers/app');

const KATALOG = {
  de: require('../../../src/i18n/de.json'),
  en: require('../../../src/i18n/en.json'),
  fr: require('../../../src/i18n/fr.json'),
  es: require('../../../src/i18n/es.json'),
  it: require('../../../src/i18n/it.json'),
};
const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// Element und der Schlüssel, dessen Text es vorlesen soll. Wo der Kurzhinweis
// vom Zustand abhängt, ist es der Kurzname des Elements aus der Ausblend-Liste
// der Statusleiste; in der Suchleiste derselbe Schlüssel wie der Kurzhinweis.
const VORLESE_TEXTE = [
  ['#command-buttons', 'statusbar.group.commands'],
  ['.statusbar .view-toggle', 'statusbar.group.views'],
  ['#statusbar-wordcount', 'help.featureName.wordCount'],
  ['#btn-edit', 'menu.view.edit'],
  ['#btn-scroll-sync', 'menu.view.scrollSync'],
  ['#btn-history', 'help.featureName.history'],
  ['#btn-theme', 'help.featureName.theme'],
  ['#btn-search-help', 'search.helpTitle'],
  ['#btn-search-prev', 'search.prevTitle'],
  ['#btn-search-next', 'search.nextTitle'],
  ['#btn-search-close', 'search.closeTitle'],
  ['#btn-search-replace', 'search.btnReplaceTitle'],
  ['#btn-search-replace-all', 'search.btnReplaceAllTitle'],
];

// Alle Kurzhinweise, die die Dokument-Historie in einer Sprache tragen kann:
// drei Zustände mal drei Herkünfte der wirksamen Einstellung.
function historienHinweise(katalog) {
  const out = [];
  for (const zustand of ['active', 'paused', 'inactive']) {
    for (const herkunft of ['file', 'area', 'app']) {
      out.push(
        katalog[`statusbar.history.${zustand}`].replace(
          '{source}',
          katalog[`history.source.${herkunft}`],
        ),
      );
    }
  }
  return out;
}

// Sprache, deren Katalog den Kurzhinweis kennt, sonst null.
function spracheDesHinweises(hinweis) {
  for (const sprache of ['de', 'en']) {
    if (historienHinweise(KATALOG[sprache]).includes(hinweis)) return sprache;
  }
  return null;
}

function vorleseTexte(page) {
  return page.evaluate(
    (liste) => liste.map(([sel]) => document.querySelector(sel).getAttribute('aria-label')),
    VORLESE_TEXTE,
  );
}

test.describe('SG-01: Kurzhinweis der Dokument-Historie', () => {
  test('folgt dem Sprachwechsel sofort, ohne Reiter-Wechsel und ohne Speichern', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await warteAufDateiArgument(page, BASIS);
      const historie = page.locator('#btn-history');
      const sprache = async () => spracheDesHinweises(await historie.getAttribute('title'));
      await expect.poll(sprache).toBe('de');
      await page.locator('#lang-select').selectOption('en');
      await expect.poll(sprache).toBe('en');
      // Erst der zweite Wechsel ist aussagekräftig: Beim ersten fiel am Stand
      // vor der Behebung die erste Verfügbarkeits-Meldung der Ansichten
      // Canvas, Tafel und Präsentation nach dem Öffnen des Dokuments in den
      // Wechsel und setzte den Kurzhinweis zufällig mit neu (am Ablauf-
      // Prüfstand gemessen); danach blieb er in der alten Sprache.
      await page.locator('#lang-select').selectOption('de');
      await expect.poll(sprache).toBe('de');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SG-02: Vorlese-Texte des Fenster-Gerüsts', () => {
  test('folgen der eingestellten Sprache in allen fünf Sprachen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // 4T-002190, Nachtrag nach dem Epic-Abschluss-Test: launchApp kehrt
      // zurück, bevor bindUi() den Empfänger der Sprach-Auswahl angemeldet hat.
      // Ein Wechsel davor setzt nur den Wert der Auswahl, die Oberfläche bleibt
      // in der Startsprache, und der Poll unten wartet vergeblich (am
      // Prüfstand gemessen: drei von zehn Starts). Gewartet wird deshalb auf die
      // Bedienbarkeit, nicht auf das Vorhandensein der Auswahl. SG-01 braucht
      // das nicht: Das Datei-Argument öffnet erst nach dem Ende der init().
      await warteAufRendererBereit(page);
      for (const sprache of ['en', 'fr', 'es', 'it', 'de']) {
        await page.locator('#lang-select').selectOption(sprache);
        const katalog = KATALOG[sprache];
        await expect
          .poll(() => vorleseTexte(page))
          .toEqual(VORLESE_TEXTE.map(([, key]) => katalog[key]));
      }
    } finally {
      await closeApp(app, userData);
    }
  });
});
