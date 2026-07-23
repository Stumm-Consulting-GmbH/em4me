// 4T-0412 (Epic 3E-0078): E2E-Funktions-Suite Skript-Blöcke
// (perspective-script). Prüft die Sandbox-Ausführung in der Render-Pane,
// den Default-aus-Zustand (Quelltext statt Ausführung) und die
// Sicherheits-Nachweise des Epics: kein Zugriff auf Parent-DOM und
// Preload-Brücke, kein Netz, Endlos-Skripte blockieren den Renderer nicht
// (Zeit-Limit greift, Ausführung asynchron). describe-Titel tragen die
// Matrix-IDs (Eintrag in test/abdeckungs-matrix.json mit 4T-0415).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Fence-Bodies als Array gefügt, damit die ```-Zäune nicht mit dem
// JS-Template-Literal kollidieren.
function scriptFence(body) {
  return ['```perspective-script', ...body, '```'].join('\n');
}

function makeDocFile(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// Profil mit aktivierter Skript-Ausführung: electron-store liest config.json
// aus dem userData-Verzeichnis (Muster dokument-historie.spec.js). Ohne den
// Seed bleibt der Default aus (eigener Test unten).
function makeUserDataWithScriptsEnabled() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-profile-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ scripts: { run: true } }));
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

test.describe('SK-01: Skript-Block — Ausführung und Fehler-Bild (Render-Pane)', () => {
  test('Ergebnis erscheint im Block; Laufzeit-Fehler zeigt Meldung und Zeile', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const doc = makeDocFile(
      dir,
      'Skript.md',
      `# Skript\n\n${scriptFence(["pq.out('Ergebnis: ' + (6 * 7));"])}\n\n${scriptFence([
        'const a = 1;',
        "throw new Error('absichtlich kaputt');",
      ])}\n`,
    );
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [doc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const blocks = page.locator(`${SEL.markdownBody0} .perspective-script`);
      await expect(blocks).toHaveCount(2);

      // Block 1: Ergebnis der Sandbox-Ausführung.
      await expect(blocks.nth(0)).toContainText('Ergebnis: 42', { timeout: 15000 });

      // Block 2: lokalisierter Fehler-Rahmen mit Original-Meldung und Zeile.
      const error = blocks.nth(1).locator('.perspective-script-error');
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText('absichtlich kaputt');
      await expect(error).toContainText('Zeile 2');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('SK-02: Skript-Block — Default aus (Quelltext statt Ausführung)', () => {
  test('ohne Aktivierung rendert der Block seinen Quelltext und keine Sandbox', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const doc = makeDocFile(
      dir,
      'Skript.md',
      `# Skript\n\n${scriptFence(["pq.out('DARF NICHT LAUFEN');"])}\n`,
    );
    const { app, page, userData } = await launchApp({ args: [doc] });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const block = page.locator(`${SEL.markdownBody0} .perspective-script`);
      await expect(block).toHaveCount(1);
      // Quelltext sichtbar als Code-Block, Ergebnis nirgends, keine Sandbox.
      await expect(block.locator('pre code')).toContainText("pq.out('DARF NICHT LAUFEN');");
      await expect(block.locator('.perspective-script-frame')).toHaveCount(0);
      // 4T-0414: Hinweis-Banner mit Verweis auf die Einstellung.
      await expect(block.locator('.perspective-script-banner')).toContainText(
        'Skript-Ausführung ist deaktiviert',
      );
      const bodyText = await page.locator(SEL.markdownBody0).textContent();
      expect(bodyText).not.toContain('Ergebnis:');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('SK-03: Skript-Sandbox — Isolation (kein Parent-DOM, kein Preload, kein Netz)', () => {
  test('Zugriffe auf Parent, Preload-Brücke und fetch scheitern nachweislich', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    // Jeder Nachweis emittiert eine Zeile 'PRUEF <name>: <befund>'.
    const doc = makeDocFile(
      dir,
      'Isolation.md',
      `# Isolation\n\n${scriptFence([
        '// DOM: das Skript läuft im Worker der Sandbox — es gibt weder',
        '// window noch document (und damit erst recht kein Parent-DOM).',
        "var domGesperrt = typeof window === 'undefined' && typeof document === 'undefined';",
        "pq.out('PRUEF dom: ' + (domGesperrt ? 'gesperrt' : 'ERREICHBAR'));",
        '// Preload-Brücke: keine api am Worker-Global.',
        "pq.out(' PRUEF api: ' + (typeof self.api === 'undefined' ? 'fehlt' : 'VORHANDEN'));",
        '// Node-Integration: kein require in der Sandbox.',
        "pq.out(' PRUEF require: ' + (typeof require === 'undefined' ? 'fehlt' : 'VORHANDEN'));",
        '// Netz: fetch muss an der Sandbox-CSP scheitern.',
        "return fetch('https://example.org/').then(",
        "  function () { pq.out(' PRUEF fetch: DURCHGELASSEN'); },",
        "  function () { pq.out(' PRUEF fetch: blockiert'); }",
        ');',
      ])}\n`,
    );
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [doc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const block = page.locator(`${SEL.markdownBody0} .perspective-script`);
      await expect(block).toContainText('PRUEF fetch:', { timeout: 15000 });
      const text = await block.textContent();
      expect(text).toContain('PRUEF dom: gesperrt');
      expect(text).toContain('PRUEF api: fehlt');
      expect(text).toContain('PRUEF require: fehlt');
      expect(text).toContain('PRUEF fetch: blockiert');
      expect(text).not.toContain('ERREICHBAR');
      expect(text).not.toContain('VORHANDEN');
      expect(text).not.toContain('DURCHGELASSEN');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-0413 (Epic 3E-0078): Referenz-Fall des PO — rekursiver Link-Baum über
// pq.pages/outlinks mit verschachtelter Listen-Ausgabe und klickbaren Zielen.
test.describe('SK-05: pq-API — rekursiver Link-Baum mit klickbaren Zielen', () => {
  test('Baum über outlinks als verschachtelte Liste; Klick öffnet das Ziel', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const treeScript = scriptFence([
      'function baum(page, gesehen) {',
      '  return {',
      '    content: pq.link(page),',
      '    children: page.file.outlinks',
      '      .map(function (l) { return pq.file(l.path); })',
      '      .filter(function (p) { return p && gesehen.indexOf(p.file.absPath) < 0; })',
      '      .map(function (p) { return baum(p, gesehen.concat([p.file.absPath])); }),',
      '  };',
      '}',
      'var start = pq.current();',
      'pq.list([baum(start, [start.file.absPath])]);',
    ]);
    makeDocFile(dir, 'Start.md', `# Start\n\nSiehe [[Alpha]] und [[Beta]].\n\n${treeScript}\n`);
    makeDocFile(dir, 'Alpha.md', '# Alpha\n\nWeiter zu [[Gamma]].\n');
    makeDocFile(dir, 'Beta.md', '# Beta\n');
    makeDocFile(dir, 'Gamma.md', '# Gamma\n');
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [path.join(dir, 'Start.md')], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const list = page.locator(`${SEL.markdownBody0} ul.perspective-script-list`);
      await expect(list).toBeVisible({ timeout: 15000 });

      // Wurzel Start; darunter Alpha und Beta; unter Alpha noch Gamma.
      const rootLink = list.locator('> li > a.perspective-query-item');
      await expect(rootLink).toHaveText('Start');
      const level2 = list.locator('> li > ul > li > a.perspective-query-item');
      await expect(level2).toHaveCount(2);
      await expect(level2.nth(0)).toHaveText('Alpha');
      await expect(level2.nth(1)).toHaveText('Beta');
      const level3 = list.locator('> li > ul > li > ul > li > a.perspective-query-item');
      await expect(level3).toHaveText('Gamma');

      // Klick über den bestehenden data-fm-path-Pfad öffnet das Ziel exakt.
      await level3.click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Gamma');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('SK-06: pq-API — Tabellen-Ausgabe und Tag-Quelle', () => {
  test('pq.table rendert Kopf und Zeilen aus pq.pages("#tag")', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const tableScript = scriptFence([
      'var seiten = pq.sort(pq.pages("#projekt"), "prio");',
      'pq.table(["Datei", "Prio"], seiten.map(function (p) {',
      '  return [pq.link(p), p.prio];',
      '}));',
    ]);
    makeDocFile(dir, 'Uebersicht.md', `# Uebersicht\n\n${tableScript}\n`);
    makeDocFile(dir, 'Alpha.md', '---\ntags: [projekt]\nprio: 2\n---\n# Alpha\n');
    makeDocFile(dir, 'Beta.md', '---\ntags: [projekt]\nprio: 1\n---\n# Beta\n');
    makeDocFile(dir, 'Gamma.md', '---\ntags: [anderes]\nprio: 9\n---\n# Gamma\n');
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [path.join(dir, 'Uebersicht.md')], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const table = page.locator(`${SEL.markdownBody0} table.perspective-script-table`);
      await expect(table).toBeVisible({ timeout: 15000 });
      await expect(table.locator('thead th').nth(0)).toHaveText('Datei');
      const rowLinks = table.locator('tbody a.perspective-query-item');
      // Nur die #projekt-Seiten, sortiert nach prio (Beta 1 vor Alpha 2).
      await expect(rowLinks).toHaveCount(2);
      await expect(rowLinks.nth(0)).toHaveText('Beta');
      await expect(rowLinks.nth(1)).toHaveText('Alpha');
      await expect(table.locator('tbody tr').nth(0).locator('td').nth(1)).toHaveText('1');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('SK-07: Skript-Block — Parität im Live-Modus', () => {
  test('Live-Modus führt den Block als Widget aus und zeigt dasselbe Ergebnis', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    makeDocFile(
      dir,
      'Skript.md',
      `# Skript\n\n${scriptFence(["pq.out('Ergebnis: ' + (6 * 7));"])}\n`,
    );
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [path.join(dir, 'Skript.md')], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      // Erst das Ergebnis im Rendered-Modus abwarten: garantiert, dass die
      // App-Initialisierung (inkl. Statusbar-Bindings) abgeschlossen ist,
      // bevor der Modus-Wechsel geklickt wird.
      await expect(page.locator(`${SEL.markdownBody0} .perspective-script`)).toContainText(
        'Ergebnis: 42',
        { timeout: 15000 },
      );
      await page.locator(SEL.viewBtn('live')).click();
      const liveBlock = page.locator(`${SEL.editorContent0} .perspective-script`);
      await expect(liveBlock).toContainText('Ergebnis: 42', { timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-0414 (Epic 3E-0078): Einstellung „Skript-Blöcke ausführen" — Umschalten
// wirkt ohne Neustart in beide Richtungen (Re-Run bzw. Quelltext-Rückfall).
test.describe('SK-08: Skript-Einstellung — Umschalten wirkt sofort', () => {
  test('Aktivieren führt den Block aus, Deaktivieren zeigt wieder den Quelltext', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const doc = makeDocFile(
      dir,
      'Skript.md',
      `# Skript\n\n${scriptFence(["pq.out('Ergebnis: ' + (6 * 7));"])}\n`,
    );
    // Ohne Profil-Seed: Default aus.
    const { app, page, userData } = await launchApp({ args: [doc] });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const block = page.locator(`${SEL.markdownBody0} .perspective-script`);
      await expect(block.locator('.perspective-script-banner')).toBeVisible({ timeout: 15000 });

      // Einstellungs-Seite öffnen (Poll-Muster: Dispatcher registriert erst
      // am Ende des asynchronen init), Bereich Verhalten, Schalter an, OK.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.settings-page').count();
        })
        .toBeGreaterThan(0);
      await page.locator('.settings-nav-entry[data-section-id="behavior"]').click();
      await page.locator('#settings-run-script-blocks').check();
      await page.locator('#btn-settings-ok').click();

      // Ohne Neustart: der Block führt aus und zeigt das Ergebnis.
      await expect(block).toContainText('Ergebnis: 42', { timeout: 15000 });
      await expect(block.locator('.perspective-script-banner')).toHaveCount(0);
      // Persistiert im Store.
      await expect.poll(() => page.evaluate(() => window.api.getSetting('scripts.run'))).toBe(true);

      // Rückweg: deaktivieren, Quelltext-Darstellung mit Banner kehrt zurück.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.settings-page').count();
        })
        .toBeGreaterThan(0);
      await page.locator('.settings-nav-entry[data-section-id="behavior"]').click();
      await page.locator('#settings-run-script-blocks').uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(block.locator('.perspective-script-banner')).toBeVisible({ timeout: 15000 });
      await expect(block.locator('pre code')).toContainText("pq.out('Ergebnis: '");
      await expect(block).not.toContainText('Ergebnis: 42');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-0416-Befund (PO-Test-Iteration 0.53.0): Sandbox-iframes eines Fensters
// teilen sich einen Renderer-Prozess; ein Endlos-Skript ließ parallel
// gestartete, harmlose Geschwister-Blöcke in deren Zeit-Limit laufen. Die
// Läufe sind seither serialisiert: jeder Block bekommt sein volles
// Zeit-Budget ab Ausführungs-Beginn.
test.describe('SK-09: Skript-Läufe serialisiert — Endlos-Skript reißt Nachbarn nicht mit', () => {
  test('Block nach einem Endlos-Skript liefert sein Ergebnis nach dessen Abbruch', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const doc = makeDocFile(
      dir,
      'Endlos-zuerst.md',
      `# Endlos zuerst\n\n${scriptFence(['while (true) {}'])}\n\n${scriptFence([
        "pq.out('Nachbar: ' + (3 + 4));",
      ])}\n`,
    );
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [doc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const blocks = page.locator(`${SEL.markdownBody0} .perspective-script`);
      await expect(blocks).toHaveCount(2);
      // Der Endlos-Block läuft in den Timeout; der Nachbar-Block wartet in
      // der Warteschlange und liefert DANACH sein Ergebnis (kein Timeout).
      await expect(blocks.nth(0).locator('.perspective-script-error')).toContainText('Zeit-Limit', {
        timeout: 20000,
      });
      await expect(blocks.nth(1)).toContainText('Nachbar: 7', { timeout: 20000 });
      await expect(blocks.nth(1).locator('.perspective-script-error')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('SK-04: Skript-Sandbox — Zeit-Limit und Renderer-Reaktionsfähigkeit', () => {
  test('Endlos-Skript läuft in den Timeout; die App bleibt währenddessen bedienbar', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-script-'));
    const doc = makeDocFile(
      dir,
      'Endlos.md',
      `# Endlos\n\n${scriptFence(['while (true) {}'])}\n\nText darunter.\n`,
    );
    const userData = makeUserDataWithScriptsEnabled();
    const { app, page } = await launchApp({ args: [doc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const block = page.locator(`${SEL.markdownBody0} .perspective-script`);
      await expect(block).toHaveCount(1);

      // Während das Endlos-Skript läuft: der Renderer reagiert (Ansicht
      // umschalten funktioniert sofort, nicht erst nach dem Timeout).
      await page.locator(SEL.viewBtn('split')).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible({ timeout: 3000 });

      // Zeit-Limit: der Block meldet den lokalisierten Abbruch (5 s Limit,
      // großzügiges Warte-Fenster für langsame CI-Läufe).
      await expect(block.locator('.perspective-script-error')).toContainText('Zeit-Limit', {
        timeout: 20000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
