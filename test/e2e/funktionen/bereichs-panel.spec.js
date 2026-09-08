// Epic 3E-000059: Bereichs-Panel — Ordnerbaum und Dateiliste.
//
// BP-01 (4T-000327): In einer leeren Bereichs-App zeigt sich das Panel
//        automatisch; der Baum zeigt Wurzel und Unterordner, die Dateiliste
//        die Markdown-Dateien des gewählten Ordners (voller Pfad als
//        Tooltip); Ordner-Klick wechselt die Dateiliste; Datei-Klick öffnet
//        den Tab; der Statusbar-Toggle blendet das Panel aus und ein.
// BP-02 (4T-000328): extern angelegte Dateien erscheinen über den
//        Verzeichnis-Watcher automatisch im Panel.
// BP-03 (4T-000328): "Neue Datei in diesem Ordner" legt an und öffnet den
//        Tab; Namens-Kollision wird gemeldet statt zu überschreiben.
// BP-05 (4T-001349): Rechtsklick auf eine Ordner-Zeile legt Unterordner und
//        Markdown-Datei im angeklickten Ordner an; Abbruch und Namens-
//        Kollision bleiben folgenlos.
// BP-06 (4T-001349): Die über das Ordner-Menü angelegte Datei durchläuft den
//        Ordner-Regel-Trigger und bekommt den Vorlagen-Inhalt.
// BP-07 (4T-001350): Umbenennen über das Kontextmenü einer Datei-Zeile, an
//        einer nicht geöffneten Datei mit eingehendem Verweis.
// BP-08 (4T-001351): Löschen über das Kontextmenü — Rückfrage mit Namen,
//        Abbruch, Zustimmung samt Reiter-Schluss, und der Abbruch der
//        Speichern-Abfrage, der auch das Löschen unterbindet.
// BP-04 (4T-000347): In einer Bereichs-App findet das Backlinks-Panel Verweise
//        aus dem gesamten Bereichs-Baum (auch aus anderen Ordnern jenseits der
//        bisherigen Tiefen-Grenze); die Quelldatei zeigt den Ordner relativ
//        zur Bereichs-Wurzel als zweite Zeile.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
// 4T-001351: Editor- und Reiter-Selektoren für den geänderten Reiter in BP-08.
const { SEL } = require('../helpers/selectors');
const { fuelleBis } = require('../helpers/eingabe');

function makeAreaTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bp-'));
  fs.writeFileSync(path.join(dir, 'alpha.md'), '# Alpha\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'beta.md'), '# Beta\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'notiz.txt'), 'keine Markdown-Datei\n', 'utf8');
  fs.mkdirSync(path.join(dir, 'Unterordner'));
  fs.writeFileSync(path.join(dir, 'Unterordner', 'gamma.md'), '# Gamma\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

test.describe('BP-01: Bereichs-Panel (4T-000327)', () => {
  test('Baum, Dateiliste, Öffnen per Klick, Tooltip und Toggle', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => page.title()).toContain('(Bereich');

      // Leere Bereichs-App: Panel automatisch sichtbar, Baum mit Wurzel
      // und Unterordner, Dateiliste des Wurzelordners ohne .txt-Datei.
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      const dirRows = section.locator('.area-dir-row');
      await expect(dirRows).toHaveCount(2);
      await expect(dirRows.nth(0)).toHaveText(/▾?.*/);
      expect(await dirRows.nth(0).getAttribute('title')).toBe(dir);
      await expect(dirRows.nth(1)).toContainText('Unterordner');

      const fileRows = section.locator('.area-file-row');
      await expect(fileRows).toHaveCount(2);
      await expect(fileRows.nth(0)).toHaveText('alpha.md');
      await expect(fileRows.nth(1)).toHaveText('beta.md');
      expect(await fileRows.nth(0).getAttribute('title')).toBe(path.join(dir, 'alpha.md'));

      // Ordner-Klick wechselt die Dateiliste auf den Unterordner.
      await dirRows.nth(1).click();
      await expect(section.locator('.area-file-row')).toHaveCount(1);
      await expect(section.locator('.area-file-row').first()).toHaveText('gamma.md');
      await expect(section.locator('.area-files-title')).toHaveText('Unterordner');

      // Datei-Klick öffnet den Tab.
      await section.locator('.area-file-row').first().click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab .tab-title')).toHaveText(
        /gamma/,
      );

      // Panel bleibt nach dem Öffnen sichtbar (Bereichs-Fenster starten mit
      // sichtbarem Panel); der Statusbar-Toggle blendet aus und wieder ein.
      await expect(section).toBeVisible();
      const btn = page.locator('#btn-area');
      await btn.click();
      await expect(section).toBeHidden();
      await btn.click();
      await expect(section).toBeVisible();
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BP-02/BP-03: Watcher-Aktualisierung und neue Datei (4T-000328)', () => {
  test('externe Anlage erscheint automatisch; neue Datei anlegen und öffnen', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await expect(section.locator('.area-file-row')).toHaveCount(2);

      // BP-02: extern angelegte Datei erscheint ohne manuelles Zutun.
      fs.writeFileSync(path.join(dir, 'delta.md'), '# Delta\n', 'utf8');
      await expect(section.locator('.area-file-row')).toHaveCount(3);
      await expect(section.locator('.area-file-row').nth(2)).toHaveText('delta.md');

      // BP-03: neue Datei über den Kopf-Button anlegen (Endung wird ergänzt).
      await section.locator('.area-new-file-btn').click();
      const input = section.locator('.area-new-file-input');
      await expect(input).toBeVisible();
      await input.fill('epsilon');
      await input.press('Enter');
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab .tab-title')).toHaveText(
        /epsilon/,
      );
      expect(fs.existsSync(path.join(dir, 'epsilon.md'))).toBe(true);
      await expect(section.locator('.area-file-row')).toHaveCount(4);

      // Kollision: gleicher Name wird gemeldet, Datei bleibt unangetastet.
      await section.locator('.area-new-file-btn').click();
      const input2 = section.locator('.area-new-file-input');
      await input2.fill('epsilon.md');
      await input2.press('Enter');
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(section.locator('.area-file-row')).toHaveCount(4);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// BP-05 (4T-001349, Epic 3E-000170): Rechtsklick auf eine Ordner-Zeile legt
// Unterordner und Markdown-Datei IM ANGEKLICKTEN Ordner an. Der Test wählt
// bewusst zuerst die Wurzel aus und klickt dann den Unterordner rechts an —
// nur so ist belegt, dass die Anlage dem angeklickten und nicht dem
// ausgewählten Ordner folgt (AK8).
test.describe('BP-05: Anlegen über das Kontextmenü (4T-001349)', () => {
  test('Unterordner und Datei im angeklickten Ordner, Abbruch und Kollision', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await expect(section.locator('.area-dir-row')).toHaveCount(2);

      // Die Wurzel ist ausgewählt; die Dateiliste zeigt ihre beiden Dateien.
      await expect(section.locator('.area-file-row')).toHaveCount(2);
      const unterordner = section.locator('.area-dir-row', { hasText: 'Unterordner' });

      // AK1/AK9: Rechtsklick zeigt beide Einträge; Escape in der Eingabe
      // hinterlässt keinen Ordner.
      await unterordner.click({ button: 'right' });
      await expect(page.locator('#context-menu [data-menu-id="area-dir-new-file"]')).toBeVisible();
      await page.locator('#context-menu [data-menu-id="area-dir-new-folder"]').click();
      const ordnerEingabe = section.locator('.area-new-folder-input');
      await expect(ordnerEingabe).toBeVisible();
      await ordnerEingabe.fill('Verworfen');
      await ordnerEingabe.press('Escape');
      await expect(section.locator('.area-new-folder-input')).toHaveCount(0);
      expect(fs.existsSync(path.join(dir, 'Unterordner', 'Verworfen'))).toBe(false);

      // AK2/AK8: Der Unterordner entsteht im angeklickten Ordner und erscheint
      // sofort im Baum (drei Zeilen: Wurzel, Unterordner, Kapitel).
      await unterordner.click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-dir-new-folder"]').click();
      await section.locator('.area-new-folder-input').fill('Kapitel');
      await section.locator('.area-new-folder-input').press('Enter');
      await expect(section.locator('.area-dir-row')).toHaveCount(3);
      await expect(section.locator('.area-dir-row').nth(2)).toContainText('Kapitel');
      expect(fs.statSync(path.join(dir, 'Unterordner', 'Kapitel')).isDirectory()).toBe(true);

      // AK5: derselbe Name ein zweites Mal wird gemeldet.
      await unterordner.click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-dir-new-folder"]').click();
      await section.locator('.area-new-folder-input').fill('Kapitel');
      await section.locator('.area-new-folder-input').press('Enter');
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(section.locator('.area-dir-row')).toHaveCount(3);
      await section.locator('.area-new-folder-input').press('Escape');

      // AK3/AK7/AK8: Die Datei entsteht im angeklickten Unterordner (nicht in
      // der ausgewählten Wurzel), bekommt die Endung und wird geöffnet.
      await unterordner.click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-dir-new-file"]').click();
      const dateiEingabe = section.locator('.area-new-file-input');
      await expect(dateiEingabe).toBeVisible();
      // 4T-001555: Die belegte Stelle. Am 2026-09-06 lief `fill` hier in sein
      // 30-Sekunden-Limit, obwohl der Locator aufgelöst hatte — Playwright
      // benannte das Feld samt Platzhalter «Dateiname…»; es nahm die Eingabe
      // nur nicht an. Isoliert war die ganze Prüfdatei danach 8 von 8 grün.
      // Eingegeben wird deshalb, bis der Wert steht.
      await fuelleBis(
        dateiEingabe,
        'Zeta',
        async () => (await dateiEingabe.inputValue()) === 'Zeta',
      );
      await dateiEingabe.press('Enter');
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab .tab-title')).toHaveText(
        /Zeta/,
      );
      expect(fs.existsSync(path.join(dir, 'Unterordner', 'Zeta.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'Zeta.md'))).toBe(false);
      // Die Dateiliste zeigt jetzt den Unterordner samt neuer Datei.
      await expect(section.locator('.area-files-title')).toHaveText('Unterordner');
      await expect(section.locator('.area-file-row')).toHaveCount(2);

      // AK11: Die panel-weiten Einträge bleiben im Ordner-Menü erreichbar.
      await unterordner.click({ button: 'right' });
      await expect(page.locator('#context-menu [data-menu-id="area-panel-graph"]')).toBeVisible();
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// BP-06 (4T-001349, AK4): Die über das Ordner-Menü angelegte Datei durchläuft
// denselben Ordner-Regel-Trigger wie der bestehende Anlage-Weg. Nachgewiesen
// wird das an der Wirkung — der Vorlagen-Inhalt steht in der neuen Datei —,
// nicht an der Gleichheit des Aufrufs (Muster VL-05 in vorlagen.spec.js).
test.describe('BP-06: Ordner-Regel bei der Anlage über das Menü (4T-001349)', () => {
  test('die im Unterordner angelegte Datei bekommt die Vorlage der Regel', async () => {
    const dir = makeAreaTree();
    const regelOrdner = path.join(dir, 'Unterordner');
    const vorlagenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bp-vorlagen-'));
    fs.writeFileSync(path.join(vorlagenDir, 'Auto.md'), 'Auto: {{title}}\nLos\n', 'utf8');
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bp-profil-'));
    fs.writeFileSync(
      path.join(userData, 'config.json'),
      JSON.stringify({
        templates: { folder: vorlagenDir, rules: [{ folder: regelOrdner, template: 'Auto.md' }] },
      }),
      'utf8',
    );
    const { app, page } = await launchApp({ userData });
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();

      await section.locator('.area-dir-row', { hasText: 'Unterordner' }).click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-dir-new-file"]').click();
      await section.locator('.area-new-file-input').fill('Regelkind');
      await section.locator('.area-new-file-input').press('Enter');

      const ziel = path.join(regelOrdner, 'Regelkind.md');
      await expect
        .poll(() => (fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : null))
        .toContain('Auto: Regelkind');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
      removeDir(vorlagenDir);
    }
  });
});

// BP-07 (4T-001350, Epic 3E-000170): Umbenennen über das Kontextmenü einer
// Datei-Zeile. Geprüft wird bewusst an einer NICHT geöffneten Datei mit einem
// eingehenden Verweis — das ist der Fall, den der bisherige Menü-Weg nicht
// kannte, und zugleich der Nachweis, dass die Verweis-Nachführung nicht am
// offenen Reiter hängt (AK3).
test.describe('BP-07: Umbenennen über das Kontextmenü (4T-001350)', () => {
  test('nicht geöffnete Datei, Vorschau, Verweis-Nachführung und Panel-Stand', async () => {
    const { app, page, userData } = await launchApp();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bpu-'));
    fs.writeFileSync(path.join(dir, 'Ziel.md'), '# Ziel\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'Quelle.md'), '# Quelle\n\nSiehe [[Ziel]].\n', 'utf8');
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await expect(section.locator('.area-file-row')).toHaveCount(2);
      // Keine Datei ist geöffnet: der Umbenennen-Weg bekommt allein den Pfad.
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(0);

      await section.locator('.area-file-row', { hasText: 'Ziel.md' }).click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-rename"]').click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await expect(page.locator('#name-input-field')).toHaveValue('Ziel');
      await page.locator('#name-input-field').fill('Zielort');
      await page.locator('#btn-name-input-ok').click();

      // AK2: dieselbe Vorschau wie beim Menü-Weg, danach der Bericht.
      await expect(page.locator('#link-preview-modal')).toBeVisible();
      await expect(page.locator('#link-preview-list')).toContainText('Quelle.md');
      await page.locator('#btn-link-preview-continue').click();
      await expect(page.locator('#link-report-modal')).toBeVisible();
      await page.locator('#btn-link-report-ok').click();

      // AK3: Datei umbenannt und der eingehende Verweis nachgeführt.
      expect(fs.existsSync(path.join(dir, 'Zielort.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'Ziel.md'))).toBe(false);
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'Quelle.md'), 'utf8'))
        .toContain('[[Zielort]]');

      // AK6: Das Panel zeigt den neuen Stand ohne Auffrischen von Hand.
      await expect(section.locator('.area-file-row', { hasText: 'Zielort.md' })).toHaveCount(1);
      await expect(section.locator('.area-file-row', { hasText: 'Ziel.md' })).toHaveCount(0);

      // AK8: Der Bestands-Index zieht nach — die Suche findet den angepassten
      // Verweis unter dem NEUEN Namen. Der Aufruf geht direkt an den
      // Such-Kanal, weil hier der Index geprüft wird und nicht die Suchleiste.
      await expect
        .poll(
          async () => {
            const res = await page.evaluate(() =>
              window.api.searchArea({ muster: 'Zielort', flags: '', aktiv: true, generation: 1 }),
            );
            return (res && res.treffer ? res.treffer : []).length;
          },
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);

      // AK4: Ist die Datei geöffnet, zeigt ihr Reiter danach den neuen Namen.
      await section.locator('.area-file-row', { hasText: 'Quelle.md' }).click();
      const tabTitel = page.locator('.pane-group[data-pane="0"] .tabbar .tab .tab-title');
      await expect(tabTitel).toHaveText(/Quelle/);
      await section.locator('.area-file-row', { hasText: 'Quelle.md' }).click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-rename"]').click();
      await page.locator('#name-input-cb-updateLinks').uncheck();
      await page.locator('#name-input-field').fill('Ursprung');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect(tabTitel).toHaveText(/Ursprung/);
      expect(fs.existsSync(path.join(dir, 'Ursprung.md'))).toBe(true);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// BP-08 (4T-001351, Epic 3E-000170): Löschen über das Kontextmenü. Der
// Bestätigungs-Dialog und der Papierkorb-Aufruf liegen im Hauptprozess und sind
// per Playwright nicht bedienbar; beide werden dort gestubbt (Muster
// journal-nachpflege.spec.js). Was der Stub NICHT ersetzt, ist die Abfolge —
// und genau die ist hier zu prüfen: Rückfrage, dann Reiter, dann Löschen.
async function stubLoeschDialoge(app, antwort) {
  await app.evaluate(({ dialog }, response) => {
    globalThis.__trashCalls = 0;
    globalThis.__trashMessage = '';
    globalThis.__trashPaths = [];
    const echterDialog = dialog.showMessageBox;
    dialog.showMessageBox = async (win, opts) => {
      // Nur die Lösch-Rückfrage steuern; die Speichern-Abfrage bleibt echt,
      // damit ihr Abbruch im Test derselbe Weg ist wie beim Anwender.
      if (opts && opts.title === 'Datei löschen') {
        globalThis.__trashCalls += 1;
        globalThis.__trashMessage = opts.message || '';
        return { response };
      }
      return echterDialog.call(dialog, win, opts);
    };
  }, antwort);
}

test.describe('BP-08: Löschen über das Kontextmenü (4T-001351)', () => {
  test('Rückfrage nennt den Namen; Abbruch lässt die Datei, Zustimmung räumt Reiter und Datei', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    // Ein Verweis auf die zu löschende Datei und ein suchbarer Inhalt in ihr —
    // beides für die Prüfung nach dem Löschen (AK8, AK9).
    fs.writeFileSync(path.join(dir, 'alpha.md'), '# Alpha\n\nAlpha-Inhalt\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'Verweis.md'), '# Verweis\n\nSiehe [[alpha]].\n', 'utf8');
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();
      await expect(section.locator('.area-file-row')).toHaveCount(3);

      // AK1/AK2: Der Eintrag ist da, die Rückfrage nennt den Dateinamen; die
      // Antwort „Abbrechen“ lässt Datei und Panel unberührt (Antwort 1).
      await stubLoeschDialoge(app, 1);
      await section.locator('.area-file-row', { hasText: 'alpha.md' }).click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-delete"]').click();
      await expect.poll(() => app.evaluate(() => globalThis.__trashCalls || 0)).toBe(1);
      expect(await app.evaluate(() => globalThis.__trashMessage)).toContain('alpha.md');
      expect(fs.existsSync(path.join(dir, 'alpha.md'))).toBe(true);
      await expect(section.locator('.area-file-row')).toHaveCount(3);

      // AK5/AK7: Zustimmung (Antwort 0). Die Datei ist geöffnet — ihr Reiter
      // schließt sich, und das Panel zeigt den neuen Stand ohne Zutun.
      await section.locator('.area-file-row', { hasText: 'alpha.md' }).click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);
      await stubLoeschDialoge(app, 0);
      await section.locator('.area-file-row', { hasText: 'alpha.md' }).click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-delete"]').click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(0);
      await expect(section.locator('.area-file-row')).toHaveCount(2);
      expect(fs.existsSync(path.join(dir, 'alpha.md'))).toBe(false);

      // AK8 (E4 des Epics): Der Verweis auf die gelöschte Datei bleibt
      // unverändert stehen — er wird zum gebrochenen Verweis, statt still
      // umgebogen zu werden.
      expect(fs.readFileSync(path.join(dir, 'Verweis.md'), 'utf8')).toContain('[[alpha]]');

      // AK9: Der Bestands-Index zieht nach — der Inhalt der gelöschten Datei
      // ist aus der Suche verschwunden.
      await expect
        .poll(
          async () => {
            const res = await page.evaluate(() =>
              window.api.searchArea({
                muster: 'Alpha-Inhalt',
                flags: '',
                aktiv: true,
                generation: 1,
              }),
            );
            return (res && res.treffer ? res.treffer : []).length;
          },
          { timeout: 15000 },
        )
        .toBe(0);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });

  test('Abbruch der Speichern-Abfrage unterbindet auch das Löschen', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaTree();
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();

      // Datei öffnen und ändern, damit die Speichern-Abfrage greift.
      await section.locator('.area-file-row', { hasText: 'alpha.md' }).click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nUngesicherte Ergänzung');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);

      // AK6: Lösch-Rückfrage bejahen, danach die Speichern-Abfrage abbrechen
      // (Antwort 2 = Abbrechen im Dialog save.btnCancel). Die Datei bleibt,
      // der Reiter bleibt offen.
      await app.evaluate(({ dialog }) => {
        globalThis.__trashCalls = 0;
        dialog.showMessageBox = async (_win, opts) => {
          if (opts && opts.title === 'Datei löschen') {
            globalThis.__trashCalls += 1;
            return { response: 0 };
          }
          return { response: 2 }; // Speichern-Abfrage: Abbrechen
        };
      });
      await section.locator('.area-file-row', { hasText: 'alpha.md' }).click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-delete"]').click();
      await expect.poll(() => app.evaluate(() => globalThis.__trashCalls || 0)).toBe(1);
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);
      expect(fs.existsSync(path.join(dir, 'alpha.md'))).toBe(true);
      await expect(section.locator('.area-file-row')).toHaveCount(2);
    } finally {
      // 4T-001351: force, weil der geaenderte Reiter beim Schliessen sonst die
      // Speichern-Abfrage stellt und der Lauf dort haengen bliebe (Muster LU-03).
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BP-04: Bereichsweiter Link-Index (4T-000347)', () => {
  test('Backlink aus anderem Ordner erscheint, Ordner relativ zur Wurzel', async () => {
    const { app, page, userData } = await launchApp();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bi-'));
    fs.mkdirSync(path.join(dir, 'ziele'));
    fs.mkdirSync(path.join(dir, 'quellen'));
    fs.writeFileSync(path.join(dir, 'ziele', 'Ziel.md'), '# Ziel\n', 'utf8');
    fs.writeFileSync(
      path.join(dir, 'quellen', 'Quelle.md'),
      '# Quelle\n\nVerweis auf [[Ziel]].\n',
      'utf8',
    );
    try {
      await page.evaluate((p) => window.api.openAreaPath(p), dir);
      await expect.poll(() => page.title()).toContain('(Bereich');

      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await expect(section).toBeVisible();

      // In den Ordner "ziele" wechseln und Ziel.md oeffnen.
      await section.locator('.area-dir-row', { hasText: 'ziele' }).click();
      await section.locator('.area-file-row', { hasText: 'Ziel.md' }).click();
      await expect(page.locator('.pane-group[data-pane="0"] .tabbar .tab')).toHaveCount(1);

      // Backlinks-Panel einblenden. Der bereichsweite Index findet die Quelle
      // aus dem anderen Ordner; bereichslos laege sie ausserhalb des Suchraums.
      await page.locator('#btn-backlinks').click();
      const bl = page.locator('.pane-group[data-pane="0"] .sidebar-backlinks');
      await expect(bl).toBeVisible();

      const group = bl.locator('.backlinks-group').first();
      await expect(group.locator('.backlinks-group-name')).toHaveText('Quelle.md', {
        timeout: 15000,
      });
      // Zweizeilig: Ordner relativ zur Bereichs-Wurzel (nicht absolut).
      await expect(group.locator('.backlinks-group-dir')).toHaveText('quellen');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});
