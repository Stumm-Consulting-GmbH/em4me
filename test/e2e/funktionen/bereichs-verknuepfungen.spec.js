// 4T-001452 (Epic 3E-000190): E2E-Funktions-Suite — Verweise über die
// Bereichs-Grenze.
//
// Geprüft wird an der REALEN Konstellation, die die Klasse K3 verlangt: zwei
// echte Bereiche auf der Platte, verknüpft über eine echte Bereichsdatei, und
// der Klick auf einen echten Kürzel-Link im gerenderten Dokument. Ein
// Ersatz-Fall mit nur einem Bereich würde genau das nicht belegen, worauf es
// ankommt — dass die Auflösung, die Öffnen-Strecke und die präzisierte
// Bereichsgrenze zusammen tragen.
//
// Der Bereich wird über den Pfad-Einstieg window.api.openAreaPath gebunden
// (Muster bereiche.spec.js); das Ziel-Dokument wird über den Main-Kanal in das
// gebundene Fenster geöffnet (Muster profil-bereich.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const PANE = '.pane-group[data-pane="0"]';
const TABS = `${PANE} .tabbar .tab`;
// 4T-001455: Die Einstellungs-Seite haengt im System-Pane der Spalte 0.
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Bereichsdatei mit einer Verknuepfung schreiben — dieselbe Sektion und
// dasselbe Format, das 4T-001450 anlegt.
function schreibeVerknuepfung(eigen, prefix, fremd) {
  const container = {
    schemaVersion: 1,
    settings: { areaLinks: [{ prefix, path: fremd, templates: false }] },
  };
  fs.writeFileSync(
    path.join(eigen, 'Area_Settings.mdda'),
    JSON.stringify(container, null, 2),
    'utf8',
  );
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

async function oeffneDatei(app, datei) {
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
  }, datei);
}

// 4T-001455: Einstellungs-Seite oeffnen (Muster VL-10 aus vorlagen.spec.js).
async function oeffneEinstellungen(page) {
  await expect
    .poll(async () => {
      if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
        await page.keyboard.press('Control+,');
      }
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
}

test.describe('BV-01: Verweis über die Bereichs-Grenze öffnen (4T-001452)', () => {
  test('Klick auf einen Kürzel-Link öffnet das Ziel im verknüpften Bereich', async () => {
    const eigen = tmpDir('em4me-bv-eigen-');
    const fremd = tmpDir('em4me-bv-fremd-');
    // Das Ziel liegt bewusst in einem UNTERORDNER: Damit belegt der Fall die
    // zweite Aufloesungs-Stufe (Namens-Suche) aus Entscheidung P1, nicht nur
    // die wurzel-relative Rechnung.
    fs.mkdirSync(path.join(fremd, 'Tief'), { recursive: true });
    fs.writeFileSync(
      path.join(fremd, 'Tief', 'Zielnotiz.md'),
      '# Zielnotiz\n\nInhalt aus dem verknuepften Bereich.\n',
      'utf8',
    );
    const quelle = path.join(eigen, 'Quelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nVerweis: [[@zt:Zielnotiz]]\n', 'utf8');
    schreibeVerknuepfung(eigen, 'zt', fremd);

    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, eigen);
      await oeffneDatei(app, quelle);
      await expect(page.locator(TABS).first()).toBeVisible();

      // Der Render-Pfad hat den Link als Verknuepfungs-Link erkannt.
      const link = page.locator(`${PANE} a.arealink[data-area-prefix="zt"]`).first();
      await expect(link).toBeVisible();

      await link.click();

      // Das Ziel ist offen — in DIESEM Fenster, obwohl es ausserhalb der
      // eigenen Bereichs-Wurzel liegt (benannte Ausnahme der Grenze, P2).
      await expect.poll(() => page.locator(TABS).count()).toBe(2);
      await expect(page.locator(`${PANE} .tabbar .tab.active .tab-title`)).toHaveText(/Zielnotiz/);
    } finally {
      await closeApp(app, userData);
      removeDir(eigen);
      removeDir(fremd);
    }
  });

  test('Ein Kürzel ohne Eintrag öffnet nichts', async () => {
    const eigen = tmpDir('em4me-bv-ohne-');
    const fremd = tmpDir('em4me-bv-fremd2-');
    fs.writeFileSync(path.join(fremd, 'Zielnotiz.md'), '# Zielnotiz\n', 'utf8');
    const quelle = path.join(eigen, 'Quelle.md');
    // Das Kuerzel 'weg' steht in keiner Verknuepfung.
    fs.writeFileSync(quelle, '# Quelle\n\nVerweis: [[@weg:Zielnotiz]]\n', 'utf8');
    schreibeVerknuepfung(eigen, 'zt', fremd);

    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, eigen);
      await oeffneDatei(app, quelle);
      await expect(page.locator(TABS).first()).toBeVisible();

      const link = page.locator(`${PANE} a.arealink[data-area-prefix="weg"]`).first();
      await expect(link).toBeVisible();
      await link.click();

      // Nichts oeffnet sich: Der Link bleibt ein unaufgeloester Wiki-Link.
      // Gekennzeichnet wird er vom Linter (4T-001454), nicht hier.
      await page.waitForTimeout(400);
      await expect(page.locator(TABS)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(eigen);
      removeDir(fremd);
    }
  });
});

// 4T-001453: Der native Dialog ist per Playwright nicht bedienbar; er wird im
// Main gestubbt und dabei protokolliert (Muster stubBestaetigung aus
// journal-nachpflege.spec.js). Unterschieden wird ueber den Dialog-TYP —
// 'warning' fuer den verschobenen Ordner, 'info' fuer das getrennte Laufwerk —,
// weil der Typ von der Sprachfassung unabhaengig ist.
async function stubMeldungen(app) {
  await app.evaluate(({ dialog }) => {
    globalThis.__bvMeldungen = [];
    dialog.showMessageBox = async (a, b) => {
      const opts = b || a || {};
      globalThis.__bvMeldungen.push({ type: opts.type, detail: opts.detail });
      return { response: 0 };
    };
  });
}

test.describe('BV-02: Verknüpfungen beim Öffnen prüfen (4T-001453)', () => {
  test('Verschobener Ordner: Warnung, und der Bereich öffnet trotzdem', async () => {
    const eigen = tmpDir('em4me-bv-verschoben-');
    // Ein Ziel-Ordner, dessen Ablage-Ort erreichbar ist, den es aber nicht
    // gibt: genau der Fall «verschoben» aus Entscheidung E4.
    const fehlend = path.join(os.tmpdir(), 'em4me-bv-gibt-es-nicht-' + Date.now());
    schreibeVerknuepfung(eigen, 'zt', fehlend);

    const { app, page, userData } = await launchApp();
    try {
      await stubMeldungen(app);
      await bindeBereich(page, eigen);

      // AK1: Der Bereich ist offen — der Befund hat das Öffnen nicht verhindert.
      await expect.poll(() => page.title()).toContain('(Bereich');
      // AK2: Die Warnung ist ergangen und nennt das betroffene Kürzel.
      await expect
        .poll(() => app.evaluate(() => (globalThis.__bvMeldungen || []).length))
        .toBeGreaterThan(0);
      const meldungen = await app.evaluate(() => globalThis.__bvMeldungen);
      expect(meldungen[0].type).toBe('warning');
      expect(meldungen[0].detail).toContain('@zt:');
    } finally {
      await closeApp(app, userData);
      removeDir(eigen);
    }
  });

  test('Nicht erreichbarer Ablage-Ort: Hinweis statt Warnung, Verknüpfung bleibt', async () => {
    const eigen = tmpDir('em4me-bv-offline-');
    // Schon der übergeordnete Ablage-Ort fehlt: der Offline-Fall. Er darf die
    // Verknüpfung nicht zerstören — sie steht nach dem Öffnen unverändert da.
    const traeger = path.join(os.tmpdir(), 'em4me-bv-traeger-' + Date.now());
    const fehlend = path.join(traeger, 'Bereich');
    schreibeVerknuepfung(eigen, 'zt', fehlend);

    const { app, page, userData } = await launchApp();
    try {
      await stubMeldungen(app);
      await bindeBereich(page, eigen);

      await expect.poll(() => page.title()).toContain('(Bereich');
      await expect
        .poll(() => app.evaluate(() => (globalThis.__bvMeldungen || []).length))
        .toBeGreaterThan(0);
      const meldungen = await app.evaluate(() => globalThis.__bvMeldungen);
      // AK4: Hinweis statt Warnung — und keine Warnung daneben.
      expect(meldungen.map((m) => m.type)).toEqual(['info']);

      // Die Verknüpfung steht unverändert in der Bereichsdatei.
      const gelesen = JSON.parse(fs.readFileSync(path.join(eigen, 'Area_Settings.mdda'), 'utf8'));
      expect(gelesen.settings.areaLinks).toHaveLength(1);
      expect(gelesen.settings.areaLinks[0].path).toBe(fehlend);
    } finally {
      await closeApp(app, userData);
      removeDir(eigen);
    }
  });
});

// 4T-001454: In die Quelltext-Ansicht wechseln, damit die Linter-Marken im
// Editor entstehen (Muster enterEditSource aus bearbeitung-und-ansicht.spec.js).
async function zeigeQuelltext(app, page) {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:viewChange', 'source');
  });
  await expect(page.locator(`${PANE} .cm-content`).first()).toBeVisible();
}

test.describe('BV-03: Der Linter kennt die Kürzel (4T-001454)', () => {
  test('Gültiger Verweis bleibt unmarkiert, unbekanntes Kürzel wird markiert', async () => {
    const eigen = tmpDir('em4me-bv-lint-');
    const fremd = tmpDir('em4me-bv-lintziel-');
    fs.writeFileSync(path.join(fremd, 'Zielnotiz.md'), '# Zielnotiz\n', 'utf8');
    const quelle = path.join(eigen, 'Quelle.md');
    fs.writeFileSync(
      quelle,
      '# Quelle\n\nGueltig: [[@zt:Zielnotiz]]\n\nUnbekannt: [[@weg:Zielnotiz]]\n',
      'utf8',
    );
    schreibeVerknuepfung(eigen, 'zt', fremd);

    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, eigen);
      await oeffneDatei(app, quelle);
      await expect(page.locator(TABS).first()).toBeVisible();
      await zeigeQuelltext(app, page);

      // AK2: Das unbekannte Kürzel ist als ungültige Verknüpfung markiert.
      const marke = page.locator(`${PANE} [data-lint-rule="invalidAreaLink"]`);
      await expect(marke.first()).toBeVisible({ timeout: 10000 });
      // AK1: Genau EINE Marke — der gültige Verweis daneben bleibt frei.
      await expect(marke).toHaveCount(1);
      await expect(marke.first()).toHaveText(/@weg:Zielnotiz/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eigen);
      removeDir(fremd);
    }
  });

  test('Ein Verweis mit Anker bleibt unmarkiert (Befund der Abnahme am 2026-09-06)', async () => {
    // Der Klick öffnete den Verweis, der Linter markierte ihn trotzdem: Die
    // Beurteilung hatte den Anker nicht abgetrennt und suchte eine Datei
    // «Zielnotiz#Kapitel Zwei». Gefunden hat das erst der Handgriff an der
    // gebauten Programmdatei — keiner der bis dahin geschriebenen Fälle
    // führte einen Anker.
    const eigen = tmpDir('em4me-bv-anker-');
    const fremd = tmpDir('em4me-bv-ankerziel-');
    fs.mkdirSync(path.join(fremd, 'Tief'), { recursive: true });
    fs.writeFileSync(
      path.join(fremd, 'Tief', 'Zielnotiz.md'),
      '# Zielnotiz\n\n## Kapitel Zwei\n\nInhalt.\n',
      'utf8',
    );
    const quelle = path.join(eigen, 'Quelle.md');
    fs.writeFileSync(
      quelle,
      '# Quelle\n\nMit Anker: [[@zt:Zielnotiz#Kapitel Zwei]]\n\nOhne: [[@zt:Zielnotiz]]\n',
      'utf8',
    );
    schreibeVerknuepfung(eigen, 'zt', fremd);

    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, eigen);
      await oeffneDatei(app, quelle);
      await expect(page.locator(TABS).first()).toBeVisible();
      await zeigeQuelltext(app, page);

      // Beide Verweise sind gültig — keine einzige Marke.
      const marke = page.locator(`${PANE} [data-lint-rule="invalidAreaLink"]`);
      const gebrochen = page.locator(`${PANE} [data-lint-rule="brokenWikiLink"]`);
      await page.waitForTimeout(600);
      await expect(marke).toHaveCount(0);
      await expect(gebrochen).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eigen);
      removeDir(fremd);
    }
  });

  test('Verschobener Bereich macht seine Verweise ungültig, ein getrennter nicht', async () => {
    const eigen = tmpDir('em4me-bv-lint2-');
    // 'zt' zeigt auf einen fehlenden Ordner, dessen Ablage-Ort erreichbar ist
    // (verschoben → ungültig); 'off' zeigt in einen fehlenden Träger
    // (offline → keine Marke). Das ist AK3 von 4T-001453 und AK4 hier.
    const verschoben = path.join(os.tmpdir(), 'em4me-bv-verschoben2-' + Date.now());
    const offline = path.join(os.tmpdir(), 'em4me-bv-traeger2-' + Date.now(), 'Bereich');
    fs.writeFileSync(
      path.join(eigen, 'Area_Settings.mdda'),
      JSON.stringify(
        {
          schemaVersion: 1,
          settings: {
            areaLinks: [
              { prefix: 'zt', path: verschoben, templates: false },
              { prefix: 'off', path: offline, templates: false },
            ],
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    const quelle = path.join(eigen, 'Quelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nA: [[@zt:X]]\n\nB: [[@off:Y]]\n', 'utf8');

    const { app, page, userData } = await launchApp();
    try {
      await stubMeldungen(app); // die Öffnen-Meldungen stören den Lauf sonst
      await bindeBereich(page, eigen);
      await oeffneDatei(app, quelle);
      await expect(page.locator(TABS).first()).toBeVisible();
      await zeigeQuelltext(app, page);

      const marke = page.locator(`${PANE} [data-lint-rule="invalidAreaLink"]`);
      await expect(marke.first()).toBeVisible({ timeout: 10000 });
      // Genau der verschobene Verweis ist markiert, der getrennte nicht.
      await expect(marke).toHaveCount(1);
      await expect(marke.first()).toHaveText(/@zt:X/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eigen);
    }
  });
});

test.describe('BV-04: Einstellungs-Oberfläche der Verknüpfungen (4T-001455)', () => {
  test('Verknüpfung anlegen, ändern und entfernen — die Bereichsdatei folgt', async () => {
    const eigen = tmpDir('em4me-bv-ui-');
    const ziel1 = tmpDir('em4me-bv-ui-ziel1-');
    const ziel2 = tmpDir('em4me-bv-ui-ziel2-');
    const mdda = path.join(eigen, 'Area_Settings.mdda');

    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, eigen);

      // --- Anlegen -----------------------------------------------------
      await oeffneEinstellungen(page);
      await page.locator('.settings-nav-entry[data-section-id="areaLinks"]').click();
      await page.locator('#settings-area-links-add').click();
      await page.locator('#settings-area-links-prefix-0').fill('zt');
      await page.locator('#settings-area-links-path-0').fill(ziel1);
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      await expect
        .poll(() => (fs.existsSync(mdda) ? JSON.parse(fs.readFileSync(mdda, 'utf8')) : null))
        .not.toBeNull();
      let stand = JSON.parse(fs.readFileSync(mdda, 'utf8'));
      expect(stand.settings.areaLinks).toEqual([{ prefix: 'zt', path: ziel1, templates: false }]);

      // --- Aendern: neuer Pfad (das ist zugleich der Weg aus 4T-001453) ---
      await oeffneEinstellungen(page);
      await page.locator('.settings-nav-entry[data-section-id="areaLinks"]').click();
      await page.locator('#settings-area-links-path-0').fill(ziel2);
      await page.locator('#settings-area-links-templates-0').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      await expect
        .poll(() => JSON.parse(fs.readFileSync(mdda, 'utf8')).settings.areaLinks[0].path)
        .toBe(ziel2);
      stand = JSON.parse(fs.readFileSync(mdda, 'utf8'));
      expect(stand.settings.areaLinks[0].templates).toBe(true);

      // --- Entfernen ----------------------------------------------------
      await oeffneEinstellungen(page);
      await page.locator('.settings-nav-entry[data-section-id="areaLinks"]').click();
      await page.locator('#settings-area-links-remove-0').click();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      // Leere Liste: die Sektion verschwindet, die Bereichsdatei bleibt.
      await expect
        .poll(() => JSON.parse(fs.readFileSync(mdda, 'utf8')).settings.areaLinks)
        .toBeUndefined();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eigen);
      removeDir(ziel1);
      removeDir(ziel2);
    }
  });
});

// 4T-001456: Bereichsdatei mit Vorlagen-Sektion und Verknuepfungen schreiben.
// Beide Bereiche brauchen eine: der eigene fuer seine Verknuepfung, der
// verknuepfte fuer seinen Vorlagen-Ordner — denn wo dessen Vorlagen liegen,
// bestimmt er selbst.
function schreibeBereichsdatei(wurzel, settings) {
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings }, null, 2),
    'utf8',
  );
}

test.describe('BV-05: Vorlagen über die Bereichs-Grenze (4T-001456)', () => {
  test('Mit Opt-in erscheint die fremde Vorlage mit ihrer Herkunft, ohne Opt-in gar nicht', async () => {
    const eigen = tmpDir('em4me-bv-vorlagen-');
    const zentral = tmpDir('em4me-bv-zentral-');

    fs.mkdirSync(path.join(eigen, 'Vorlagen'), { recursive: true });
    fs.writeFileSync(path.join(eigen, 'Vorlagen', 'EigeneVorlage.md'), 'Eigen\n', 'utf8');
    fs.mkdirSync(path.join(zentral, 'Muster'), { recursive: true });
    fs.writeFileSync(path.join(zentral, 'Muster', 'ZentralVorlage.md'), 'Zentral\n', 'utf8');
    // Der verknuepfte Bereich sagt selbst, wo seine Vorlagen liegen.
    schreibeBereichsdatei(zentral, { templates: { folder: 'Muster' } });

    // Zuerst OHNE Opt-in: die Verknuepfung steht, die Vorlagen bleiben draussen.
    schreibeBereichsdatei(eigen, {
      templates: { folder: 'Vorlagen' },
      areaLinks: [{ prefix: 'zt', path: zentral, templates: false }],
    });

    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, eigen);

      let liste = await page.evaluate(() => window.api.templatesList());
      expect(liste.templates.map((e) => e.name)).toEqual(['EigeneVorlage']);

      // Jetzt MIT Opt-in — ueber die Einstellungs-Oberflaeche, damit der Fall
      // den ganzen Weg belegt und nicht nur die Datei.
      await oeffneEinstellungen(page);
      await page.locator('.settings-nav-entry[data-section-id="areaLinks"]').click();
      await page.locator('#settings-area-links-templates-0').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      await expect
        .poll(async () => {
          const l = await page.evaluate(() => window.api.templatesList());
          return l.templates.length;
        })
        .toBe(2);

      liste = await page.evaluate(() => window.api.templatesList());
      const namen = liste.templates.map((e) => e.name).sort();
      expect(namen).toEqual(['EigeneVorlage', 'ZentralVorlage']);

      // AK6: Jeder Eintrag traegt seine Quelle; die eigene bleibt unbeschriftet.
      const fremd = liste.templates.find((e) => e.name === 'ZentralVorlage');
      const eigenerEintrag = liste.templates.find((e) => e.name === 'EigeneVorlage');
      expect(fremd.sourceKey).toBe('zt');
      expect(eigenerEintrag.sourceKey).toBe('');

      // AK2: Die fremde Vorlage ist lesbar — ueber ihre Quelle angesprochen.
      const gelesen = await page.evaluate((e) => window.api.templatesRead(e.relPath, e.sourceKey), {
        relPath: fremd.relPath,
        sourceKey: fremd.sourceKey,
      });
      expect(gelesen.ok).toBe(true);
      expect(gelesen.content).toContain('Zentral');

      // AK3: Ohne die Quelle zu nennen, greift die erste der Kette — dort gibt
      // es die Datei nicht, und ein Ausbruch bleibt verwehrt.
      const ohneQuelle = await page.evaluate(
        (rel) => window.api.templatesRead(rel, ''),
        fremd.relPath,
      );
      expect(ohneQuelle.ok).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eigen);
      removeDir(zentral);
    }
  });
});

test.describe('BV-06: Aus-Zustand der Erweiterung area-links (4T-001457)', () => {
  test('Abgeschaltet wird die Wirkung, nicht die Angabe', async () => {
    const eigen = tmpDir('em4me-bv-aus-');
    const fremd = tmpDir('em4me-bv-aus-ziel-');
    fs.writeFileSync(path.join(fremd, 'Zielnotiz.md'), '# Zielnotiz\n', 'utf8');
    schreibeVerknuepfung(eigen, 'zt', fremd);
    const mdda = path.join(eigen, 'Area_Settings.mdda');
    const vorher = fs.readFileSync(mdda, 'utf8');

    const { app, page, userData } = await launchApp();
    try {
      await stubMeldungen(app);
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['area-links']));
      await bindeBereich(page, eigen);

      // AK3: Beim Öffnen wird nicht geprüft — es ergeht keine Meldung.
      await expect.poll(() => page.title()).toContain('(Bereich');
      await page.waitForTimeout(500);
      expect(await app.evaluate(() => globalThis.__bvMeldungen || [])).toEqual([]);

      // Der Kanal antwortet, löst aber nicht auf.
      const aus = await page.evaluate(() => window.api.resolveAreaLink('zt', 'Zielnotiz.md'));
      expect(aus.ok).toBe(false);
      expect(aus.grund).toBe('abgeschaltet');

      // AK4: Die Verknüpfung steht unverändert in der Bereichsdatei.
      expect(fs.readFileSync(mdda, 'utf8')).toBe(vorher);

      // AK4, zweite Hälfte: Nach dem Einschalten wirkt sie wieder.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect
        .poll(async () => {
          const r = await page.evaluate(() => window.api.resolveAreaLink('zt', 'Zielnotiz.md'));
          return !!(r && r.ok);
        })
        .toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eigen);
      removeDir(fremd);
    }
  });
});
