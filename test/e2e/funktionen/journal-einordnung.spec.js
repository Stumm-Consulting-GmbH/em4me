// 4T-001489 (Epic 3E-000276): Die zeitliche Einordnung des Journal-Navigations-
// Blocks formuliert ueber `Intl.RelativeTimeFormat`. Der Task fuehrte die
// Unterstuetzung der Einheit «Quartal» als offenen Punkt, weil von ihr der
// Zuschnitt abhing: Faellt sie aus, braucht allein das Quartal eine eigene
// Uebersetzungs-Schablone in fuenf Sprachen.
//
// **Warum dieser Fall auf der Ablauf-Ebene steht und nicht bei den
// Unit-Faellen.** Die Zusicherung gilt der Laufzeit-Umgebung der ANWENDUNG. Ein
// Unit-Lauf misst Node und dessen ICU-Fassung; die Anwendung laeuft auf
// Electron mit einer eigenen. Nur hier wuerde ein Wegfall bei einem
// Electron-Sprung sichtbar — und genau dann muesste der Rueckfall kommen.
// Der Unit-Fall in `journal-nav-einordnung.test.js` deckt die Schicht darueber,
// also dass die Zeile der Standard-Formulierung folgt; er kann diese Frage
// nicht beantworten.
//
// **Warum eine eigene Datei.** `journale.spec.js` fuehrt die Kommandos und den
// Anlage-Pfad und hatte mit diesem Fall ihr Zeilen-Budget ueberschritten. Der
// Schnitt folgt der Fachlichkeit: Hier steht, worauf sich die Darstellung des
// Blocks verlaesst, dort, was der Anwender ausloest.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

test.describe('JR-16: Relative Zeitangaben in der Laufzeit der Anwendung (4T-001489)', () => {
  test('Intl beherrscht alle fuenf Perioden-Einheiten in allen fuenf Sprachen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Ohne Datei-Argument gibt es keinen Reiter; gewartet wird auf die
      // Statusleiste, die zur leeren Anwendung gehoert.
      await expect(page.locator(SEL.statusbar)).toBeVisible();
      // 4T-000391 (Nachtrag): Die Liste kommt als Argument in den Anzeige-
      // Prozess. Eine Node-Konstante ist in page.evaluate nicht sichtbar; die
      // erste Fassung nannte sie dort direkt, und der Fall fiel erst im
      // Epic-Abschluss-Test mit einer ReferenceError auf.
      const befund = await page.evaluate((sprachen) => {
        const einheiten = ['day', 'week', 'month', 'quarter', 'year'];
        const luecken = [];
        for (const sprache of sprachen) {
          for (const einheit of einheiten) {
            try {
              const text = new Intl.RelativeTimeFormat(sprache, { numeric: 'auto' }).format(
                -1,
                einheit,
              );
              // Eine Formulierung, die nur aus Zahl und Trennzeichen besteht,
              // waere ein stiller Rueckfall und keine Uebersetzung.
              if (!text || !/\p{L}/u.test(text)) luecken.push(`${sprache}/${einheit}: "${text}"`);
            } catch (fehler) {
              luecken.push(`${sprache}/${einheit}: ${fehler.name}`);
            }
          }
        }
        return luecken;
      }, LOCALE_CODES);
      expect(befund).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
