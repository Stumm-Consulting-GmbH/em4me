// 4T-001853 (Epic 3E-000110): Ablauf-Fälle der Kanban-Tafel an der laufenden
// Anwendung — Anlegen und Umwandeln, das Öffnen und Verlassen der Tafel-Ansicht,
// die Bedienung der Karten, die Bedienung der Spalten und der Aus-Zustand der
// Erweiterung (AK1, AK2 des Tasks).
//
// **Warum diese Fälle gegen die echte Anwendung laufen.** Die Unit-Prüfungen der
// Ausbaustufe messen je ein Stück: den Format-Kern ohne Prozess, die Zeichnung
// und die Bedienung gegen gestellte Rückrufe, die Verdrahtung am Quelltext. Drei
// Nahtstellen sieht keine von ihnen, und genau sie benennt die Regel «E2E-Fall
// pro neuem Bedien-Weg über eine Prozess-Brücke» (test/README.md, Abschnitt
// «Abdeckungs-Matrix»): die **Prozess-Brücke** zum Rückfrage-Dialog vor dem
// Löschen einer gefüllten Spalte, die **Fokus-Führung** der eingeblendeten
// Eingabe von Karte und Spaltentitel, und die **zurückgestellte Neu-Übergabe**
// vom Editor-Schreibweg zurück in die Zeichnung.
//
// **Jeder Fall endet am Dokument-Text**, nicht an der Oberfläche: Die Tafel ist
// eine Ansicht auf den Text, und geprüft wird die Datei auf der Platte nach
// einem Speichern-Vorgang.
//
// **Die Dialoge des Betriebssystems sind ersetzt** (Muster
// canvas-austausch.spec.js): der Speichern-Dialog des unbenannten Dokuments und
// der Rückfrage-Dialog vor dem Löschen einer gefüllten Spalte. Sie sind nicht
// Gegenstand dieser Fälle, und ein Fall, der einen von ihnen öffnete, bliebe
// ohne Ersatz stehen.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, F-314).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { warteAufText } = require('../helpers/dateien');
const { bedieneBis, oeffneEinstellungsSeite, EINSTELLUNGS_SEITE } = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const TAFEL = `${PANE0} .pane-kanban .kanban-tafel`;
const SPALTEN = `${TAFEL} .kanban-spalte`;
const KARTEN = `${TAFEL} .kanban-karte`;
const KONTEXTMENUE = '#context-menu';

// Eine Tafel mit zwei Spalten: «Offen» ohne Erledigt-Kennzeichen, «Fertig» mit.
// Die Leerzeilen-Form folgt dem, was an den echten Tafeln des Product Owners
// gemessen ist: eine Leerzeile unter der Überschrift, zwei vor der nächsten.
const TAFEL_TEXT = [
  '---',
  'kanban-plugin: board',
  '---',
  '',
  '## Offen',
  '',
  '- [ ] Erste Karte',
  '- [ ] Zweite Karte',
  '',
  '',
  '## Fertig',
  '',
  '**Fertiggestellt**',
  '',
  '',
].join('\n');

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1853-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibeTafel(dir, name = 'Tafel.md', inhalt = TAFEL_TEXT) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, inhalt, 'utf8');
  return datei;
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

// Der Menü-Listener ist erst am Ende der asynchronen Renderer-Init registriert,
// und Electron-IPC puffert nicht: Ein zu früh gesendetes Ereignis verfällt
// lautlos. Deshalb wird gesendet, bis die Wirkung eintritt (Muster
// canvas-austausch.spec.js).
async function sendeBis(app, kanal, bedingung, args = []) {
  await expect
    .poll(
      async () => {
        if (await bedingung()) return true;
        await sendeMenuKanal(app, kanal, ...args);
        return bedingung();
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

// Die beiden Dialoge des Betriebssystems ersetzen. `__rueckfragen` zählt die
// Aufrufe des Rückfrage-Dialogs mit, damit ein Fall belegen kann, dass er
// gestellt beziehungsweise nicht gestellt wurde; `__antwort` steuert seine
// Antwort (0 = Löschen, 1 = Abbrechen).
async function stubDialoge(app, speicherPfad) {
  await app.evaluate(({ dialog }, pfad) => {
    globalThis.__rueckfragen = [];
    globalThis.__antwort = 1;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: pfad });
    dialog.showMessageBox = async (_win, optionen) => {
      globalThis.__rueckfragen.push(String(optionen && optionen.message));
      return { response: globalThis.__antwort };
    };
  }, speicherPfad);
}

function rueckfragen(app) {
  return app.evaluate(() => globalThis.__rueckfragen || []);
}

// Der erste Parameter eines `app.evaluate` ist IMMER das Electron-Modul; die
// eigene Nutzlast ist der zweite. Wer den ersten für seinen Wert hält, setzt
// still das Modul ein — hier hätte das die Zustimmung zur Rückfrage in einen
// Abbruch verwandelt, und zwar ohne jede Fehlermeldung.
function setzeAntwort(app, wert) {
  return app.evaluate((_elektron, w) => {
    globalThis.__antwort = w;
  }, wert);
}

// Die Tafel-Ansicht öffnen. Der Modus kommt über denselben Kanal wie der
// Menü-Eintrag «Ansicht → Tafel».
async function oeffneTafel(app, page) {
  await sendeBis(app, 'menu:viewChange', () => page.locator(TAFEL).isVisible(), ['kanban']);
}

// Das Dokument änderbar machen: Eine geöffnete Datei steht im Lese-Modus, und
// die Tafel erbt die Änderbarkeit ihres Dokuments — ohne sie bietet sie gar
// keine Bedien-Griffe an. Gemessen wird am Daten-Merkmal der Fläche und nicht am
// Zustand des Schalters (Ausgangs-Zustand als Bedingung, nicht als Nebenwirkung).
async function macheAenderbar(page) {
  await bedieneBis(page.locator(SEL.btnEdit), async () => {
    const wert = await page.locator(TAFEL).getAttribute('data-aenderbar');
    return wert === 'true';
  });
}

// Speichern und den geschriebenen Stand lesen. Der Beleg ist die Datei, nicht
// die Oberfläche.
async function speichereUndLies(app, pfad, erwarteterTeil) {
  await sendeBis(
    app,
    'menu:save',
    async () => {
      const text = fs.existsSync(pfad) ? fs.readFileSync(pfad, 'utf8') : '';
      return text.includes(erwarteterTeil);
    },
    [],
  );
  return warteAufText(pfad, erwarteterTeil);
}

// Die Karten-Zeilen eines Spalten-Abschnitts aus dem rohen Dokument-Text. Die
// Auswertung läuft bewusst über den Text selbst und nicht über den Format-Kern:
// Ein Prüffall, der sein Ergebnis mit demselben Modul liest, das es erzeugt hat,
// prüfte die Anwendung gegen sich selbst.
function kartenZeilen(text, spaltenTitel) {
  const zeilen = text.split('\n').map((z) => z.replace(/\r$/, ''));
  const start = zeilen.findIndex((z) => z.trim() === `## ${spaltenTitel}`);
  if (start < 0) return null;
  const raus = [];
  for (let i = start + 1; i < zeilen.length; i++) {
    if (/^#{1,6}\s/.test(zeilen[i]) || /^\*{3,}\s*$/.test(zeilen[i])) break;
    if (/^- \[.\] /.test(zeilen[i])) raus.push(zeilen[i]);
  }
  return raus;
}

function spaltenTitel(text) {
  return text
    .split('\n')
    .map((z) => z.replace(/\r$/, ''))
    .filter((z) => /^## /.test(z))
    .map((z) => z.slice(3).trim());
}

test.describe('KB-01: Tafel anlegen, Ansicht verlassen und wieder öffnen (F-314)', () => {
  test('das Kommando legt ein Dokument an, das bereits eine Tafel ist', async () => {
    const dir = machVerzeichnis();
    const ziel = path.join(dir, 'Neue Tafel.md');
    const { app, page, userData } = await launchApp();
    try {
      await stubDialoge(app, ziel);
      // Anlegen über das Kommando «Neue Kanban-Tafel»; es braucht kein
      // geöffnetes Dokument und öffnet die Tafel-Ansicht gleich mit.
      await sendeBis(app, 'menu:kanbanNewBoard', () => page.locator(TAFEL).isVisible());

      await expect(page.locator(SPALTEN)).toHaveCount(3);
      await expect(page.locator(`${SPALTEN} .kanban-spalte-titel`)).toHaveText([
        'Zu erledigen',
        'In Arbeit',
        'Erledigt',
      ]);
      // Die dritte Spalte hakt hineingezogene Karten ab und sagt das auch.
      await expect(page.locator(`${SPALTEN}[data-spalte="2"]`)).toHaveAttribute(
        'data-erledigt',
        'true',
      );
      await expect(
        page.locator(`${SPALTEN}[data-spalte="2"] .kanban-spalte-erledigt`),
      ).toBeVisible();
      await expect(page.locator(KARTEN)).toHaveCount(0);

      // --- Ansicht verlassen und wieder öffnen -----------------------------
      await sendeBis(app, 'menu:viewChange', () => page.locator(TAFEL).isHidden(), ['rendered']);
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await oeffneTafel(app, page);
      await expect(page.locator(SPALTEN)).toHaveCount(3);

      // --- Der Dokument-Text ------------------------------------------------
      const text = await speichereUndLies(app, ziel, 'kanban-plugin');
      expect(spaltenTitel(text)).toEqual(['Zu erledigen', 'In Arbeit', 'Erledigt']);
      expect(text).toContain('**Fertiggestellt**');
      expect(text.split('\n')[0].trim()).toBe('---');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-02: leeres Dokument in eine Tafel umwandeln (F-314)', () => {
  test('das leere Dokument trägt danach Kopf-Kennzeichen und drei Spalten', async () => {
    const dir = machVerzeichnis();
    const datei = path.join(dir, 'Leer.md');
    fs.writeFileSync(datei, '', 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await stubDialoge(app, datei);
      // Umgewandelt wird über den Editor-Schreibweg; dafür muss das Dokument
      // änderbar sein. Der Schalter ist derselbe wie für den Anwender.
      await bedieneBis(page.locator(SEL.btnEdit), () =>
        page.locator(SEL.paneSourceEditor0).isVisible(),
      );

      await sendeBis(app, 'menu:kanbanConvertToBoard', async () => {
        const text = fs.existsSync(datei) ? fs.readFileSync(datei, 'utf8') : '';
        if (text.includes('kanban-plugin')) return true;
        // Der Schreibvorgang landet zuerst im Puffer; gemessen wird an der
        // Datei, deshalb wird nach jedem Versuch gespeichert.
        await sendeMenuKanal(app, 'menu:save');
        return false;
      });

      const text = await warteAufText(datei, 'kanban-plugin');
      expect(spaltenTitel(text)).toEqual(['Zu erledigen', 'In Arbeit', 'Erledigt']);
      expect(text).toContain('**Fertiggestellt**');

      // Das umgewandelte Dokument lässt sich als Tafel ansehen.
      await oeffneTafel(app, page);
      await expect(page.locator(SPALTEN)).toHaveCount(3);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-03: Karte anlegen, bearbeiten, abhaken und löschen (F-314)', () => {
  test('die vier Handlungen wirken im Dokument-Text', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeTafel(dir);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await stubDialoge(app, datei);
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(KARTEN)).toHaveCount(2);

      // --- Anlegen ----------------------------------------------------------
      const spalte0 = page.locator(`${SPALTEN}[data-spalte="0"]`);
      await spalte0.locator('.kanban-spalte-neu').click();
      const eingabe = spalte0.locator('.kanban-karte-eingabe');
      await expect(eingabe).toBeFocused();
      await eingabe.fill('Dritte Karte');
      await eingabe.press('Enter');
      await expect(page.locator(KARTEN)).toHaveCount(3);
      let text = await speichereUndLies(app, datei, 'Dritte Karte');
      expect(kartenZeilen(text, 'Offen')).toEqual([
        '- [ ] Erste Karte',
        '- [ ] Zweite Karte',
        '- [ ] Dritte Karte',
      ]);

      // --- Bearbeiten -------------------------------------------------------
      const dritte = page.locator(`${KARTEN}[data-spalte="0"][data-karte="2"]`);
      await dritte.dblclick();
      const zweiteEingabe = spalte0.locator('.kanban-karte-eingabe');
      await expect(zweiteEingabe).toBeFocused();
      await zweiteEingabe.fill('Dritte Karte, umbenannt');
      await zweiteEingabe.press('Enter');
      text = await speichereUndLies(app, datei, 'umbenannt');
      expect(kartenZeilen(text, 'Offen')).toEqual([
        '- [ ] Erste Karte',
        '- [ ] Zweite Karte',
        '- [ ] Dritte Karte, umbenannt',
      ]);

      // --- Abhaken ----------------------------------------------------------
      // Der Klick auf das Kästchen ist dieselbe Geste wie in der Lese-Ansicht.
      await page.locator(`${KARTEN}[data-spalte="0"][data-karte="0"] .kanban-karte-kasten`).click();
      await expect(page.locator(`${KARTEN}[data-spalte="0"][data-karte="0"]`)).toHaveClass(
        /kanban-karte-erledigt/,
      );
      text = await speichereUndLies(app, datei, '- [x] Erste Karte');
      expect(kartenZeilen(text, 'Offen')[0]).toMatch(/^- \[x\] Erste Karte/);

      // --- Löschen ----------------------------------------------------------
      // Gewählt wird per Klick, gelöscht mit der Entf-Taste — ohne Rückfrage.
      const zweite = page.locator(`${KARTEN}[data-spalte="0"][data-karte="1"]`);
      await zweite.click();
      await expect(zweite).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Delete');
      await expect(page.locator(`${SPALTEN}[data-spalte="0"] .kanban-karte`)).toHaveCount(2);
      await sendeBis(app, 'menu:save', () => {
        const stand = fs.readFileSync(datei, 'utf8');
        return !stand.includes('Zweite Karte');
      });
      const letzter = fs.readFileSync(datei, 'utf8');
      expect(kartenZeilen(letzter, 'Offen').map((z) => z.replace(/ ✅ .*$/, ''))).toEqual([
        '- [x] Erste Karte',
        '- [ ] Dritte Karte, umbenannt',
      ]);
      // Die Rückfrage gehört der Spalte, nicht der Karte: Beim Löschen einer
      // Karte wird keine gestellt.
      expect(await rueckfragen(app)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-04: Spalte anlegen, umbenennen und löschen (F-314)', () => {
  test('leer ohne Rückfrage, gefüllt mit Rückfrage samt Abbruch', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeTafel(dir);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await stubDialoge(app, datei);
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(SPALTEN)).toHaveCount(2);

      // --- Anlegen ----------------------------------------------------------
      await page.locator(`${TAFEL} .kanban-spalte-hinzufuegen`).click();
      const entwurf = page.locator(`${TAFEL} .kanban-spalte-eingabe`);
      await expect(entwurf).toBeFocused();
      await entwurf.fill('Wartet');
      await entwurf.press('Enter');
      await expect(page.locator(SPALTEN)).toHaveCount(3);
      let text = await speichereUndLies(app, datei, '## Wartet');
      expect(spaltenTitel(text)).toEqual(['Offen', 'Fertig', 'Wartet']);

      // --- Umbenennen -------------------------------------------------------
      await page.locator(`${SPALTEN}[data-spalte="2"] .kanban-spalte-titel`).dblclick();
      const titelEingabe = page.locator(`${SPALTEN}[data-spalte="2"] .kanban-spalte-eingabe`);
      await expect(titelEingabe).toBeFocused();
      await titelEingabe.fill('Zurückgestellt');
      await titelEingabe.press('Enter');
      text = await speichereUndLies(app, datei, '## Zurückgestellt');
      expect(spaltenTitel(text)).toEqual(['Offen', 'Fertig', 'Zurückgestellt']);

      // --- Löschen einer leeren Spalte: ohne Rückfrage -----------------------
      await page.locator(`${SPALTEN}[data-spalte="2"] .kanban-spalte-kopf`).click({
        button: 'right',
      });
      await expect(
        page.locator(`${KONTEXTMENUE} [data-menu-id="kanban-column-delete"]`),
      ).toBeVisible();
      await page.locator(`${KONTEXTMENUE} [data-menu-id="kanban-column-delete"]`).click();
      await expect(page.locator(SPALTEN)).toHaveCount(2);
      expect(await rueckfragen(app)).toEqual([]);
      await sendeBis(app, 'menu:save', () => !fs.readFileSync(datei, 'utf8').includes('## Zurück'));

      // --- Löschen einer gefüllten Spalte: Rückfrage, erst abgebrochen -------
      await setzeAntwort(app, 1);
      await page.locator(`${SPALTEN}[data-spalte="0"] .kanban-spalte-kopf`).click({
        button: 'right',
      });
      await page.locator(`${KONTEXTMENUE} [data-menu-id="kanban-column-delete"]`).click();
      await expect.poll(async () => (await rueckfragen(app)).length).toBe(1);
      expect((await rueckfragen(app))[0]).toContain('Offen');
      // Abgebrochen heißt: nichts geschieht.
      await expect(page.locator(SPALTEN)).toHaveCount(2);
      expect(fs.readFileSync(datei, 'utf8')).toContain('- [ ] Erste Karte');

      // --- und danach bestätigt ---------------------------------------------
      await setzeAntwort(app, 0);
      await page.locator(`${SPALTEN}[data-spalte="0"] .kanban-spalte-kopf`).click({
        button: 'right',
      });
      await page.locator(`${KONTEXTMENUE} [data-menu-id="kanban-column-delete"]`).click();
      await expect.poll(async () => (await rueckfragen(app)).length).toBe(2);
      await expect(page.locator(SPALTEN)).toHaveCount(1);
      await sendeBis(app, 'menu:save', () => !fs.readFileSync(datei, 'utf8').includes('## Offen'));
      const letzter = fs.readFileSync(datei, 'utf8');
      expect(spaltenTitel(letzter)).toEqual(['Fertig']);
      expect(letzter).not.toContain('Erste Karte');
      expect(letzter).toContain('**Fertiggestellt**');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-05: Erweiterung «Kanban» abschalten und wieder einschalten (F-314)', () => {
  test('Modus und Untermenü verschwinden und kehren zurück, der Dokument-Text bleibt', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeTafel(dir);
    const vorher = fs.readFileSync(datei, 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await armiereMenueMitschrift(app);
      await oeffneTafel(app, page);
      await expect(page.locator(SPALTEN)).toHaveCount(2);
      await expect(page.locator(SEL.viewBtn('kanban'))).toBeVisible();
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining(['Kanban-Tafel', 'Tafel']));

      // --- Abschalten -------------------------------------------------------
      // Über den Weg des Anwenders, den Einstellungs-Bereich «Erweiterungen»
      // (Muster EW-03 in erweiterungen.spec.js), und nicht über einen direkten
      // Schreibzugriff auf die Einstellung: Der Bedien-Weg ist der Gegenstand.
      await schalteKanbanErweiterung(page, false);
      await expect(page.locator(TAFEL)).toBeHidden();
      await expect(page.locator(SEL.viewBtn('kanban'))).toBeHidden();
      await expect.poll(() => menueBeschriftungen(app)).not.toContain('Kanban-Tafel');
      await expect.poll(() => menueBeschriftungen(app)).not.toContain('Tafel');
      // Der Rückfall geht auf die Lese-Ansicht, nicht auf eine leere Fläche.
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      // Nichts geht verloren: Die Datei ist unberührt.
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);

      // --- Wieder einschalten -----------------------------------------------
      await schalteKanbanErweiterung(page, true);
      await expect(page.locator(SEL.viewBtn('kanban'))).toBeVisible();
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining(['Kanban-Tafel', 'Tafel']));
      await oeffneTafel(app, page);
      await expect(page.locator(SPALTEN)).toHaveCount(2);
      await expect(page.locator(KARTEN)).toHaveCount(2);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Menü-Inspektion: Die Anwendung setzt ihre Menüs PRO FENSTER (`win.setMenu`),
// `Menu.getApplicationMenu()` ist deshalb leer. Der Abgriff patcht `setMenu` des
// ersten Fensters und legt bei jedem Neubau alle Beschriftungen rekursiv ab
// (Muster arbeitsbereiche.spec.js).
async function armiereMenueMitschrift(app) {
  await app.evaluate(({ BrowserWindow }) => {
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
  return app.evaluate(() => globalThis.__menuLabels || []);
}

// Die Erweiterung «Kanban» über den Einstellungs-Bereich schalten — der Weg des
// Anwenders (Muster EW-01/EW-03 in erweiterungen.spec.js). Gewartet wird auf den
// Abschluss des Anwendens: Der Klick auf «OK» startet eine asynchrone Kette, auf
// die Playwright von sich aus nicht wartet. Geöffnet wird über den geteilten
// Helfer, der auf die Sichtbarkeit der Seite wartet statt auf ihr Vorhandensein
// (4T-001699).

async function schalteKanbanErweiterung(page, an) {
  await oeffneEinstellungsSeite(page);
  await page
    .locator(`${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="extensions"]`)
    .click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
  const schalter = page.locator('#settings-extension-kanban');
  if (an) await schalter.check();
  else await schalter.uncheck();
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();
}
