// 4T-0971 (Epic 3E-0207): Nachgestellte Fehlerfälle der letzten Auffang-Ebenen,
// je Prozess-Seite einer (AK4 der Story 4S-0788).
//
// AE-01 Renderer (Weg R2): Ein unbehandelter Fehler im Fenster wird
//       protokolliert, der ungespeicherte Entwurf wandert in den
//       Entwurfs-Speicher, und das Fenster bleibt bedienbar.
// AE-02 Main (Weg M2): Eine unbehandelte Ausnahme im Haupt-Prozess wird
//       protokolliert, die Sitzung gesichert, und die Anwendung beendet sich
//       definiert.
//
// Warum überhaupt E2E: Die Unit-Fälle prüfen die Ebenen mit injizierten
// Abhängigkeiten. Sie können nicht zeigen, dass die Ebene im laufenden
// Programm überhaupt **registriert** ist und dass der echte Sicherungs-Weg
// trägt; genau das ist der Kern der Zusage.
//
// Die beiden absichtlich erzeugten Meldungen sind in
// test/konsolen-ausnahmen.json an diese Datei gebunden.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Der Renderer-Fall startet mit einer geöffneten Datei, weil «Datei -> Neu»
// erst in einem Fenster mit Reiter-System greift; ohne übergebene Datei startet
// die Anwendung ohne Reiter (Muster entwurfs-zwischenspeicher.spec.js).
const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// Marker im Text der geworfenen Fehler; er bindet die geduldeten
// Konsolen-Meldungen an genau diese Fälle.
const MARKER = 'AUFFANG-PROBE';

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Unbenannt-Tab mit Inhalt anlegen (realer Nutzungspfad: Datei -> Neu, tippen);
// Muster aus entwurfs-zwischenspeicher.spec.js.
async function legeEntwurfAn(app, page, text) {
  // Erst auf den Reiter der geöffneten Datei warten: Vor dem Aufbau des
  // Reiter-Systems geht «Datei -> Neu» ins Leere, und der Fall wäre je nach
  // Maschine mal grün und mal rot (Muster entwurfs-zwischenspeicher.spec.js).
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  const vorher = await page.locator(SEL.tabs0).count();
  await sendMenuChannel(app, 'menu:new');
  await expect(page.locator(SEL.tabs0)).toHaveCount(vorher + 1);
  const editor = page.locator(SEL.editorContent0);
  // Der frische Reiter übernimmt den Ansichts-Modus der Sitzung; steht sie auf
  // Vorschau, ist die Quell-Spalte verborgen. Umgeschaltet wird über den
  // Statusbar-Schalter, also den Weg des Anwenders.
  if (!(await editor.isVisible())) await page.locator(SEL.btnEdit).click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.type(text);
  await expect(page.locator(SEL.dirtyTab0).last()).toBeVisible();
}

function entwurfsDateien(userData) {
  try {
    return fs.readdirSync(path.join(userData, 'drafts')).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
}

// --- AE-01 --------------------------------------------------------------------

test.describe('AE-01: Auffang-Ebene des Renderers (4T-0971, Weg R2)', () => {
  test('protokolliert, sichert den Entwurf und lässt das Fenster stehen', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    const meldungen = [];
    page.on('console', (msg) => meldungen.push(msg.text()));
    try {
      await legeEntwurfAn(app, page, `${MARKER}-Inhalt`);
      expect(entwurfsDateien(userData)).toHaveLength(0);

      // Fehler im Fenster auslösen. Bewusst über einen Timer und nicht direkt
      // im evaluate: Ein Wurf im evaluate käme als dessen Rückgabe zurück und
      // erreichte das `error`-Ereignis des Fensters gar nicht.
      await page.evaluate((marker) => {
        setTimeout(() => {
          throw new Error(`${marker} Renderer`);
        }, 0);
      }, MARKER);

      // Protokoll mit Kontext (AK2).
      await expect.poll(() => meldungen.join('\n')).toContain('[renderer] unbehandelter Fehler');
      expect(meldungen.join('\n')).toContain(`${MARKER} Renderer`);

      // Weg R2, erster Teil: Der ungespeicherte Inhalt ist gesichert (AK3).
      // Geprüft wird beides, die Wirkungs-Meldung der Ebene und die Datei im
      // Entwurfs-Speicher: Die Meldung allein bewiese nur, dass die Ebene lief,
      // die Datei allein nicht, dass sie es war.
      await expect
        .poll(() => meldungen.join('\n'))
        .toContain('[renderer] Auffang-Ebene: 1 Entwurf/Entwuerfe gesichert.');
      await expect.poll(() => entwurfsDateien(userData).length).toBe(1);

      // Weg R2, zweiter Teil: Das Fenster lebt und ist bedienbar. Geprüft wird
      // die Bedienbarkeit und nicht bloß die Existenz, weil ein stehendes,
      // aber totes Fenster genau der Zustand wäre, den die Ebene verhindern
      // soll. Gezählt wird relativ: Ohne übergebene Datei startet die
      // Anwendung mit null Reitern, eine feste Zahl wäre hier eine Annahme
      // über den Startzustand statt eine Aussage über die Bedienbarkeit.
      expect(app.windows().length).toBe(1);
      const reiterVorher = await page.locator(SEL.tabs0).count();
      await sendMenuChannel(app, 'menu:new');
      await expect(page.locator(SEL.tabs0)).toHaveCount(reiterVorher + 1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- AE-02 --------------------------------------------------------------------

test.describe('AE-02: Auffang-Ebene des Haupt-Prozesses (4T-0971, Weg M2)', () => {
  test('protokolliert, sichert die Sitzung und beendet definiert', async () => {
    const { app, userData } = await launchApp();
    const ausgabe = [];
    const strom = app.process().stderr;
    if (strom) strom.on('data', (stueck) => ausgabe.push(String(stueck)));
    let beendet = false;
    try {
      // Kein Warten auf einen Reiter: Ohne übergebene Datei startet die
      // Anwendung ohne Reiter, und `launchApp` hat das Ende der
      // Renderer-Initialisierung bereits abgewartet.
      expect(app.windows().length).toBe(1);
      const geschlossen = app.waitForEvent('close');

      // Unbehandelte Ausnahme im Haupt-Prozess nachstellen. `process.emit`
      // trifft denselben Haken wie eine echte Ausnahme, ohne den Testlauf von
      // einer bestimmten Fehlerquelle abhängig zu machen.
      await app.evaluate((_elektron, marker) => {
        process.emit('uncaughtException', new Error(`${marker} Main`));
      }, MARKER);

      // Weg M2: Die Anwendung beendet sich definiert (AK3).
      await geschlossen;
      beendet = true;

      // Protokoll mit Kontext (AK1). Die Ausgabe des Haupt-Prozesses landet
      // auf dessen Fehler-Strom, nicht in der Fenster-Konsole.
      await expect.poll(() => ausgabe.join('')).toContain('[main] unbehandelte Ausnahme');
      expect(ausgabe.join('')).toContain(`${MARKER} Main`);
    } finally {
      // Nach dem definierten Beenden gibt es nichts mehr zu schließen; das
      // Profil wird trotzdem geräumt.
      if (!beendet) await closeApp(app, userData, { force: true });
      else fs.rmSync(userData, { recursive: true, force: true });
    }
  });
});
