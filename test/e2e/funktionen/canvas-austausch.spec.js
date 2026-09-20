// 4T-001806 (Epic 3E-000292): E2E-Funktions-Fall über beide Richtungen des
// Austauschs mit dem offenen Format JSON Canvas — Fläche ausgeben, Datei
// einlesen, Ergebnis ansehen (AK14 des Tasks, AK30 der Story 4S-000960).
//
// **Warum dieser Fall gegen die echte Anwendung läuft.** Die Unit-Prüfungen
// beider Wege messen je eine Hälfte: Der Übersetzungs-Kern läuft ohne Prozess,
// der Anzeige-Weg gegen gestellte Kanäle, die Haupt-Prozess-Seite gegen ein
// Temp-Verzeichnis ohne Anwendung. Was keine von ihnen zeigt, ist die Strecke
// als Ganzes — dass die ausgegebene Datei von der eigenen Gegenrichtung
// gelesen wird und dass das entstandene Dokument danach wirklich eine Fläche
// zeigt.
//
// **Die drei Dialoge des Betriebssystems sind ersetzt** (Muster
// einrichtungs-einlesen.spec.js): Speichern-Dialog, Öffnen-Dialog und der
// Meldungs-Dialog des Berichts. Sie sind nicht Gegenstand dieses Wegs, und ein
// Fall, der einen von ihnen öffnete, bliebe ohne Stub stehen.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, S-154).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const CANVAS = `${PANE0} .canvas-view`;
const KARTEN = `${CANVAS} .canvas-karte`;
const GRUPPEN = `${CANVAS} .canvas-gruppe`;

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1806-'));
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

// Die drei Dialoge des Betriebssystems ersetzen. Der Speichern- und der
// Öffnen-Dialog liefern denselben festen Pfad; die Meldung wird gezählt,
// damit die Auslöse-Schleifen wissen, wann ein Weg gelaufen ist.
async function stubDialoge(app, canvasPfad) {
  await app.evaluate(({ dialog }, pfad) => {
    globalThis.__meldungen = [];
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: pfad });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pfad] });
    dialog.showMessageBox = async (_win, optionen) => {
      globalThis.__meldungen.push(optionen);
      return { response: 0 };
    };
  }, canvasPfad);
}

function meldungen(app) {
  return app.evaluate(() => (globalThis.__meldungen || []).map((m) => m.message));
}

// Eine Fläche mit allem, worauf es für den Rundlauf ankommt: eine Gruppe, zwei
// Karten und eine Verbindung zwischen ihnen.
function baueFlaeche(dir) {
  const flaeche = path.join(dir, 'Flaeche.md');
  fs.writeFileSync(
    flaeche,
    [
      '# Fläche',
      '',
      '```perspective-canvas',
      '!gruppe g1 x=-40 y=-40 b=600 h=260 farbe=grün',
      'Vorbereitung',
      '!karte k1 x=0 y=0 b=220 h=120',
      'Zielbild',
      '!karte k2 x=300 y=0 b=220 h=120',
      'Umsetzung',
      '!linie e1 k1 -> k2 von=rechts nach=links',
      'folgt aus',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return flaeche;
}

async function oeffneCanvasAnsicht(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendeMenuKanal(app, 'menu:viewChange', 'canvas');
  await expect(page.locator(CANVAS)).toBeVisible();
  await expect(page.locator(KARTEN)).toHaveCount(2);
}

test.describe('CA-01: Fläche ausgeben und wieder einlesen (S-154)', () => {
  test('die ausgegebene Datei wird zu einem neuen Dokument mit derselben Fläche', async () => {
    const dir = machVerzeichnis();
    const flaeche = baueFlaeche(dir);
    const canvasPfad = path.join(dir, 'Flaeche.canvas');
    const { app, page, userData } = await launchApp({ args: [flaeche] });
    try {
      await oeffneCanvasAnsicht(app, page);
      await stubDialoge(app, canvasPfad);

      // --- Ausgabe ---------------------------------------------------------
      // Der Menü-Listener ist erst am Ende des asynchronen init() registriert;
      // deshalb wird der Kanal wiederholt gesendet, bis die Datei dasteht
      // (Muster oeffneAuswahl in einrichtungs-ausgabe.spec.js).
      await expect
        .poll(
          async () => {
            if (!fs.existsSync(canvasPfad)) {
              await sendeMenuKanal(app, 'menu:exportJsonCanvas');
            }
            return fs.existsSync(canvasPfad);
          },
          { timeout: 30000 },
        )
        .toBe(true);

      const ausgegeben = JSON.parse(fs.readFileSync(canvasPfad, 'utf8'));
      expect(Object.keys(ausgegeben)).toEqual(['nodes', 'edges']);
      expect(ausgegeben.nodes.map((k) => k.id)).toEqual(['g1', 'k1', 'k2']);
      expect(ausgegeben.edges).toHaveLength(1);
      // Lage und Größe gehen unverändert über (Festlegung des Epics).
      expect(ausgegeben.nodes[1]).toMatchObject({ type: 'text', x: 0, y: 0, width: 220 });

      // --- Einlesen --------------------------------------------------------
      // Der Name «Flaeche.md» ist belegt; das neue Dokument bekommt die Zahl.
      const neuesDokument = path.join(dir, 'Flaeche-2.md');
      await expect
        .poll(
          async () => {
            if (!fs.existsSync(neuesDokument)) {
              await sendeMenuKanal(app, 'menu:importJsonCanvas');
            }
            return fs.existsSync(neuesDokument);
          },
          { timeout: 30000 },
        )
        .toBe(true);

      const text = fs.readFileSync(neuesDokument, 'utf8');
      expect(text.startsWith('# Flaeche\n\n```perspective-canvas\n')).toBe(true);
      expect(text).toContain('!gruppe g1 x=-40 y=-40 b=600 h=260 farbe=grün');
      expect(text).toContain('!linie e1 k1 -> k2 von=rechts nach=links');
      // Die ausgegebene Datei bleibt unangetastet.
      expect(JSON.parse(fs.readFileSync(canvasPfad, 'utf8'))).toEqual(ausgegeben);

      // --- Das Ergebnis in der Anwendung -----------------------------------
      // Das neue Dokument ist geöffnet, aktiv und zeigt die Canvas-Ansicht mit
      // denselben Elementen.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(CANVAS)).toBeVisible();
      await expect(page.locator(KARTEN)).toHaveCount(2);
      await expect(page.locator(GRUPPEN)).toHaveCount(1);

      // Beide Vorgänge haben je eine Meldung hinterlassen.
      const gezeigt = await meldungen(app);
      expect(gezeigt).toHaveLength(2);
    } finally {
      await closeApp(app, userData);
      raeumeAuf(dir);
    }
  });
});
