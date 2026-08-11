// 4T-0899 (Epic 3E-0016): Durchlauf-Pruefung der zweiten Spalte (ZS-01,
// ZS-05). Anlass ist die Bestandsaufnahme des Charter-Durchgangs: Von 71
// Funktions-Specs beruehrten nur vier die zweite Spalte, weil der gemeinsame
// Selektor-Satz durchgehend auf data-pane="0" verdrahtet war. Seit derselben
// Aufgabe liefert SEL.pane(idx) den Satz fuer eine beliebige Spalte; diese
// Spec fuehrt die Kern-Funktionen dort aus.
//
// Die Faelle pruefen bewusst die Kern-Wege, nicht einzelne Features: Gesucht
// ist die Fehlerklasse "in der zweiten Spalte anders", nicht eine Wiederholung
// der Funktions-Achse, die die Suite bereits abdeckt.
//
// KORREKTUR vom 2026-08-07: Der Probelauf vom 2026-08-06 hatte zwei Befunde
// gemeldet, die eine Entscheidung des Product Owners gebraucht haetten — der
// Ansichts-Modus erfasse beide Spalten zugleich, und die verschobene Datei
// lande rechts im Gerendert-Modus. Beides ist am laufenden Programm
// nachgemessen und **widerlegt**: Der Modus haengt am Reiter (`tab.viewMode`),
// wird je Spalte auf deren eigenes `.content` gesetzt, und `setViewMode` wirkt
// nur auf die aktive Spalte. Zwei Spalten koennen gleichzeitig verschiedene
// Modi zeigen, und der verschobene Reiter behaelt seinen.
//
// Was der Probelauf sah, war der Standard-Modus: Neue Reiter starten in
// `rendered` (`DEFAULT_VIEW_MODE`, ueber die Einstellungen aenderbar). Nach dem
// Teilen zeigt die linke Spalte den verbliebenen Reiter in **dessen** Modus;
// wer dabei die linke Spalte misst und die rechte meint, sieht genau den
// gemeldeten Effekt. Damit sind Bearbeiten, Speichern und Moduswechsel in der
// zweiten Spalte als Zusicherung nicht mehr blockiert.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');

// Eigene Vorbelegung ersetzt die des Helfers vollstaendig; die Sprach-
// Festlegung aus 4T-0751 muss deshalb hier mitgegeben werden, sonst startet die
// Anwendung englisch und die Menue-Beschriftungen unten stimmen nicht.
const SIDEBAR_SETTINGS = {
  language: 'de',
  sidebar: { layout: { left: [{ panels: ['outline'], active: 'outline' }], right: [] } },
};

const P0 = SEL.pane(0);
const P1 = SEL.pane(1);

// Sendet einen Menue-IPC-Kanal an das erste Fenster (Muster aus smoke.spec.js).
// Speichern laeuft ueber diesen Weg, weil Strg+S am nativen Menue haengt.
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Eigene Arbeitskopien statt der geteilten Fixtures: ZS-03 speichert, und ein
// geschriebener Fixture-Stand wuerde andere Specs beeinflussen.
function legeArbeitsdateien() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-zs-'));
  const a = path.join(dir, 'Links.md');
  const b = path.join(dir, 'Rechts.md');
  fs.writeFileSync(a, '# Linke Datei\n\nInhalt links.\n', 'utf8');
  fs.writeFileSync(b, '# Rechte Datei\n\nInhalt rechts.\n', 'utf8');
  return { dir, a, b };
}

// Zweite Spalte entsteht, indem der aktive Reiter nach rechts verschoben wird
// (Muster aus sidebar-layout.spec.js). Danach ist die zweite Spalte aktiv.
//
// Der Ansichts-Modus wird danach ausdruecklich gesetzt, statt ihn anzunehmen:
// Der verschobene Reiter behaelt seinen Modus, und das ist ohne Zutun der
// Standard `rendered`, in dem `.pane-source` per Stylesheet ausgeblendet ist
// (styles.css, `.content.view-rendered .pane-source`). Wer den Editor der
// zweiten Spalte braucht, schaltet ihn deshalb sichtbar. Der Aufruf wirkt nur
// auf die aktive Spalte, also nach dem Teilen auf die rechte.
async function teileNachRechts(page, modus) {
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page.locator(P1.paneGroup)).toBeVisible();
  if (modus) await page.locator(SEL.viewBtn(modus)).click();
}

test.describe('ZS-01: Inhalt der zweiten Spalte', () => {
  test('die verschobene Datei erscheint rechts, die verbliebene links', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await teileNachRechts(page);

      // Je ein Reiter pro Spalte, und der Inhalt gehoert zur jeweiligen Datei.
      await expect(page.locator(P0.tabs)).toHaveCount(1);
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await expect(page.locator(P1.editorContent)).toContainText('Inhalt rechts');
      await expect(page.locator(P0.editorContent)).toContainText('Inhalt links');
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Bringt beide Spalten in den Quelltext-Modus, damit die Editoren beider
// Spalten sichtbar sind und sich gegeneinander pruefen lassen. Danach ist die
// rechte Spalte aktiv, weil sie zuletzt angeklickt wurde.
async function beideSpaltenAufQuelltext(page) {
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page.locator(P1.paneGroup)).toBeVisible();
  await page.locator(SEL.viewBtn('source')).click();
  await page.locator(P0.tabs).first().click();
  await page.locator(SEL.viewBtn('source')).click();
  await page.locator(P1.tabs).first().click();
}

test.describe('ZS-02: Bearbeiten in der zweiten Spalte', () => {
  test('der Edit-Zustand und die Eingabe gehoeren zur aktiven Spalte', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await beideSpaltenAufQuelltext(page);

      // Edit-Modus einschalten, waehrend die rechte Spalte aktiv ist.
      await page.locator(SEL.btnEdit).click();
      // Der Lese-Zustand haengt am Tab (editor.js: classList.toggle
      // ('read-only', !tab.editMode)) und damit an der Spalte.
      await expect(page.locator(P1.paneSourceEditor)).not.toHaveClass(/read-only/);
      await expect(page.locator(P0.paneSourceEditor)).toHaveClass(/read-only/);

      // Die Eingabe landet rechts und nicht links.
      const editor = page.locator(P1.editorContent);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('Zweispaltig getippt.');
      await expect(editor).toContainText('Zweispaltig getippt.');
      await expect(page.locator(P0.editorContent)).not.toContainText('Zweispaltig getippt.');

      // Der Aenderungs-Punkt sitzt am Reiter der rechten Spalte.
      await expect(page.locator(P1.dirtyTab)).toHaveCount(1);
      await expect(page.locator(P0.dirtyTab)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('ZS-03: Speichern aus der zweiten Spalte', () => {
  test('geschrieben wird die Datei der aktiven Spalte, die andere bleibt unberuehrt', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const vorherLinks = fs.readFileSync(a, 'utf8');
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await beideSpaltenAufQuelltext(page);
      await page.locator(SEL.btnEdit).click();

      const editor = page.locator(P1.editorContent);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('Rechts gespeichert.');
      await expect(page.locator(P1.dirtyTab)).toHaveCount(1);

      await sendMenuChannel(app, 'menu:save');
      await expect(page.locator(P1.dirtyTab)).toHaveCount(0);

      expect(fs.readFileSync(b, 'utf8')).toContain('Rechts gespeichert.');
      // Die linke Datei darf der Speichern-Befehl nicht angefasst haben.
      expect(fs.readFileSync(a, 'utf8')).toBe(vorherLinks);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ZS-04 sichert genau das, was der Probelauf vom 2026-08-06 falsch gemeldet
// hatte. Beide Faelle pruefen deshalb grundsaetzlich **beide** Spalten: Ein
// Selektor ohne Spalten-Qualifizierung misst immer die erste und haette den
// urspruenglichen Fehlbefund erneut erzeugt.
test.describe('ZS-04: Ansichts-Modus der zweiten Spalte', () => {
  test('ein Modus-Wechsel trifft nur die aktive Spalte', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await teileNachRechts(page, 'source');

      // Rechts Quelltext, links unveraendert im Standard-Modus.
      await expect(page.locator(P1.content)).toHaveClass(/view-source/);
      await expect(page.locator(P0.content)).not.toHaveClass(/view-source/);

      // Linke Spalte aktivieren und dort einen dritten Modus setzen.
      await page.locator(P0.tabs).first().click();
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(P0.content)).toHaveClass(/view-live/);
      await expect(page.locator(P1.content)).toHaveClass(/view-source/);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('der verschobene Reiter behaelt seinen Modus', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);

      // Aktiven Reiter vor dem Verschieben auf einen Nicht-Standard-Modus
      // stellen; der Standard neuer Reiter ist 'rendered' (DEFAULT_VIEW_MODE).
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(P0.content)).toHaveClass(/view-source/);

      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.paneGroup)).toBeVisible();

      // Rechts steht der verschobene Reiter in seinem Modus, links der
      // verbliebene in seinem eigenen. Genau diese Verwechslung war der
      // Fehlbefund vom 2026-08-06.
      await expect(page.locator(P1.content)).toHaveClass(/view-source/);
      await expect(page.locator(P0.content)).toHaveClass(/view-rendered/);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('ZS-06: Gerenderte Ansicht der zweiten Spalte', () => {
  test('jede Spalte rendert ihr eigenes Dokument', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await teileNachRechts(page, 'rendered');
      await page.locator(P0.tabs).first().click();
      await page.locator(SEL.viewBtn('rendered')).click();

      // Beide Spalten gerendert, jede mit ihrem eigenen Inhalt.
      await expect(page.locator(P0.markdownBody)).toContainText('Linke Datei');
      await expect(page.locator(P1.markdownBody)).toContainText('Rechte Datei');
      await expect(page.locator(P0.markdownBody)).not.toContainText('Rechte Datei');
      await expect(page.locator(P1.markdownBody)).not.toContainText('Linke Datei');
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('ZS-07: Seitenleiste der zweiten Spalte', () => {
  test('die zweite Spalte baut ihre eigene Seitenleiste auf', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({
      args: [a, b],
      settings: {
        ...SIDEBAR_SETTINGS,
        // Die Sichtbarkeit eines Panels haengt an eigenen Schluesseln **je
        // Spalte** (`visibleColumn0`/`visibleColumn1`, Muster aus
        // sidebar-layout.spec.js). Beide Spalten werden hier ausdruecklich
        // sichtbar geschaltet; geprueft wird der Aufbau, nicht die Vorbelegung.
        outline: { visibleColumn0: true, visibleColumn1: true },
      },
    });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await expect(page.locator(`${P0.sidebarLeft} .sidebar-outline`)).toBeVisible();

      await teileNachRechts(page, 'source');

      // Die Seitenleiste ist je Spalte aufgebaut (app-state.js: sidebarLeft
      // wird aus dem Wurzel-Element der Spalte gelesen). Fehlt sie rechts,
      // ist die zweite Spalte nur halb eingerichtet.
      await expect(page.locator(`${P1.sidebarLeft} .sidebar-outline`)).toBeVisible();
      await expect(page.locator(`${P0.sidebarLeft} .sidebar-outline`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ZS-08 sichert genau die Fehlerklasse, die diesen ganzen Vorgang ausgeloest
// hat: ein Menue-Haken, der nicht zu dem passt, was tatsaechlich sichtbar ist.
// Das Ist-Verhalten wurde vor dem Schreiben gemessen und ist richtig — der
// Haken folgt der aktiven Spalte. Der Fall friert das ein, statt es zu raten.
test.describe('ZS-08: Menue-Haken folgt der aktiven Spalte', () => {
  test('der Haken des Panels wechselt mit der Spalte und kommt zurueck', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({
      args: [a, b],
      // Bewusst NUR die erste Spalte: die zweite zeigt das Panel damit nicht.
      settings: { ...SIDEBAR_SETTINGS, outline: { visibleColumn0: true } },
    });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await expect(page.locator(`${P0.sidebarLeft} .sidebar-outline`)).toBeVisible();

      // Spalte 0 aktiv, Panel sichtbar -> Haken gesetzt.
      const linksAktiv = await menuZustand(app, '');
      expect(menuEintrag(linksAktiv, 'Inhaltsverzeichnis')?.checked).toBe(true);

      // Teilen: Spalte 1 wird aktiv, dort ist das Panel nicht sichtbar.
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.paneGroup)).toBeVisible();
      await expect(page.locator(`${P1.sidebarLeft} .sidebar-outline`)).toBeHidden();
      const rechtsAktiv = await menuZustand(app, '');
      expect(menuEintrag(rechtsAktiv, 'Inhaltsverzeichnis')?.checked).toBe(false);

      // Zurueck auf Spalte 0: der Haken kommt wieder. Die Gegenrichtung
      // gehoert dazu, sonst wuerde ein dauerhaft entfernter Haken durchgehen.
      await page.locator(P0.tabs).first().click();
      await expect(page.locator(`${P0.sidebarLeft} .sidebar-outline`)).toBeVisible();
      const wiederLinks = await menuZustand(app, '');
      expect(menuEintrag(wiederLinks, 'Inhaltsverzeichnis')?.checked).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('ZS-05: Reiter der zweiten Spalte', () => {
  test('ein Reiter laesst sich rechts oeffnen, aktivieren und schliessen', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await teileNachRechts(page);
      await expect(page.locator(P1.tabs)).toHaveCount(1);

      // Neuer Reiter entsteht in der aktiven (rechten) Spalte. Standard-
      // Kuerzel ist Strg+N (commands.js, file.newTab), nicht Strg+T.
      await page.keyboard.press('Control+n');
      await expect(page.locator(P1.tabs)).toHaveCount(2);
      await expect(page.locator(P1.activeTab)).toHaveCount(1);
      await expect(page.locator(P0.tabs)).toHaveCount(1);

      // Schliessen fuehrt zurueck auf einen Reiter rechts.
      await page.keyboard.press('Control+w');
      await expect(page.locator(P1.tabs)).toHaveCount(1);
      await expect(page.locator(P0.tabs)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ZS-09 (4T-0942, Befund B-07): Der aktive Reiter einer Panel-Gruppe gehoert
// zu der Spalte, in der er steht. Zuvor lag er im fensterweiten Layout: Ein
// Reiter-Klick in der einen Spalte stellte die andere mit um, und zwei
// verschiedene Panels derselben Gruppe waren nebeneinander unmoeglich —
// genau der Zweck einer zweiten Spalte.
//
// Der Fall misst BEIDE Spalten. Eine einseitig messende Zusicherung traegt in
// dieser Lage nichts: Die Negativ-Probe der Stufe A hat gezeigt, dass ein
// Selektor ohne Spalten-Qualifizierung immer die erste Spalte trifft.
const GRUPPEN_SETTINGS = {
  language: 'de',
  sidebar: {
    layout: {
      left: [{ panels: ['outline', 'properties'], active: 'outline' }],
      right: [],
    },
  },
  outline: { visibleColumn0: true, visibleColumn1: true },
  properties: { visibleColumn0: true, visibleColumn1: true },
};

const REITER = (pane, id) => `${pane.sidebarLeft} .sidebar-slot-tab[data-panel-id="${id}"]`;

test.describe('ZS-09: aktiver Reiter einer Gruppe gilt je Spalte', () => {
  test('ein Reiter-Wechsel rechts laesst die linke Spalte unveraendert', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const { app, page, userData } = await launchApp({ args: [a, b], settings: GRUPPEN_SETTINGS });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);
      await teileNachRechts(page, 'source');

      // Anker: beide Spalten starten mit demselben aktiven Reiter (der
      // Layout-Wert ist die Vorgabe). Ohne diesen Beleg misst der Wechsel
      // unten nichts.
      await expect(page.locator(REITER(P0, 'outline'))).toHaveClass(/active/);
      await expect(page.locator(REITER(P1, 'outline'))).toHaveClass(/active/);

      // Wechsel NUR in der rechten Spalte.
      await page.locator(REITER(P1, 'properties')).click();

      await expect(page.locator(REITER(P1, 'properties'))).toHaveClass(/active/);
      await expect(page.locator(REITER(P1, 'outline'))).not.toHaveClass(/active/);
      // Die linke Spalte bleibt, wo sie war — das ist der Befund.
      await expect(page.locator(REITER(P0, 'outline'))).toHaveClass(/active/);
      await expect(page.locator(REITER(P0, 'properties'))).not.toHaveClass(/active/);

      // Und beide Panels stehen gleichzeitig nebeneinander.
      await expect(page.locator(`${P0.sidebarLeft} .sidebar-outline`)).toBeVisible();
      await expect(page.locator(`${P1.sidebarLeft} .sidebar-properties`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('die Wahl ueberlebt den Neustart und bleibt je Spalte getrennt', async () => {
    const { dir, a, b } = legeArbeitsdateien();
    const erste = await launchApp({ args: [a, b], settings: GRUPPEN_SETTINGS });
    const profil = erste.userData;
    try {
      await expect(erste.page.locator(P0.tabs)).toHaveCount(2);
      await teileNachRechts(erste.page, 'source');
      await erste.page.locator(REITER(P1, 'properties')).click();
      await expect(erste.page.locator(REITER(P1, 'properties'))).toHaveClass(/active/);
      // Sauber beenden, damit die Sitzung samt Spalten-Teilung persistiert
      // (Muster SM-09; ein erzwungenes Schliessen speichert sie nicht).
      await erste.app.evaluate(({ app }) => app.quit());
      await erste.app.waitForEvent('close');
    } catch (err) {
      await closeApp(erste.app, profil, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      throw err;
    }

    const zweite = await launchApp({ userData: profil, settings: null });
    try {
      await expect(zweite.page.locator(P1.tabs)).toHaveCount(1, { timeout: 15000 });
      await expect(zweite.page.locator(REITER(P1, 'properties'))).toHaveClass(/active/);
      await expect(zweite.page.locator(REITER(P0, 'outline'))).toHaveClass(/active/);
    } finally {
      await closeApp(zweite.app, profil, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
