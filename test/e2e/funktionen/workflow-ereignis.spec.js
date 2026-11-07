// 4T-002463 (Epic 3E-000367): E2E-Funktions-Suite — Scharf-Schaltung und
// Anzeige eines Ereignis-Workflows an der gestarteten Anwendung (Story
// 4S-001146, AK1 bis AK4 des Tasks; Vorbild WF-SCHARF-01 der Stufe 2).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht über beide Prozesse: Schalter auf der Seite «Workflow-Läufe»,
// Kanal `workflow:setArmed` mit Prüfen vor Laufen und der Prüfsumme samt Zeile
// `event`, Lauf-Stand in der Begleitdatei, Beobachter des Bereichs, Ereignis-
// Prüfer mit Entprellung und Zustellung an das Fenster, Lauf im Fenster mit der
// Herkunft `event` und das Ereignis im letzten Lauf, gelesen über `workflow:runs`.
// Kein jsdom-Fall sieht diese Kette am Stück.
//
// WF-EREIGNIS-01: Ein Workflow mit `event: file-created in "Eingang"` steht auf
//   der Seite nicht scharf und ohne nächsten Lauf. Scharf geschaltet zeigt die
//   Spalte «Nächster Lauf» das Ereignis mit dem Ordner, die Begleitdatei trägt
//   die Prüfsumme und keinen Termin, und das Statusleisten-Element «Workflows»
//   erscheint. Eine neue Datei in «Eingang» löst genau einen Lauf aus; der
//   letzte Lauf trägt die Herkunft «Ereignis» mit der Datei, und das
//   Statusleisten-Element nennt den Workflow. Eine Änderung der Zeile `event`
//   setzt «nicht scharf: Definition geändert».
//
// Die Risiken aus 3m der Konzept-Runde 4T-002458 (Epic-Abschluss-Test, E1 in
// 4T-002467):
//
// WF-EREIGNIS-02: Derselbe Bereich in zwei Fenstern. Eine neue Datei in
//   «Eingang» ergibt genau einen Lauf, nicht je Fenster einen (Zustellung an
//   alle Fenster, Anspruch genau eines; 4T-002460).
// WF-EREIGNIS-03: Der Workflow legt selbst eine Datei in «Eingang» an. Sie
//   löst keinen weiteren Lauf aus (Lauf-Marke, 4T-002461).
//
// **Wie «kein weiterer Lauf» gemessen wird, ohne feste Pause** (Stabilitäts-
// regel 2): Nach dem ersten Lauf entsteht von außen eine zweite Datei als
// Anker. Der Prüfer wertet strikt nacheinander aus und entprellt jede Datei
// gleich lang; ein doppelter oder ein vom Workflow ausgelöster Lauf wäre vor
// dem Lauf des Ankers eingereiht worden. Steht der Anker als letzter Lauf da
// und zählt der Lauf-Stand genau zwei, gab es keinen dritten.
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Zellen über ihre Klassen
// und Daten-Attribute, Ordner und Datei über ihre Namen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufRendererBereit } = require('../helpers/app');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const {
  definitionsPruefsumme,
} = require('../../../src/main/workflows/workflow-definition-hash.js');

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .wf-runs-page`;
// Beobachter, Entprellung (2 Sekunden nach der Ruhe) und Zustellung.
const EREIGNIS_ZEIT = { timeout: 45000 };

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const NOTIFY = 'notify "Ereignis-Probe: {{file}}"';

const workflow = (ordner, befehl = NOTIFY) =>
  [
    '---',
    'workflow: true',
    'name: Ereignis-Probe',
    'trigger: event',
    `event: file-created in "${ordner}"`,
    '---',
    '',
    '```workflow',
    befehl,
    '```',
    '',
  ].join('\n');

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-ereignis-'));
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Eingang'));
  const datei = path.join(wurzel, 'Workflows', 'Ereignis-Probe.md');
  fs.writeFileSync(datei, workflow('Eingang'), 'utf8');
  return { wurzel, datei, begleitdatei: path.join(wurzel, 'Workflows', 'Ereignis-Probe.mdd') };
}

// Ein Bereich, dessen Workflow schon scharf steht (Prüfsumme in der
// Begleitdatei wie nach der Scharf-Schaltung; Muster WF-ZEIT).
function baueScharfenBereich(befehl) {
  const bereich = baueBereich();
  const text = workflow('Eingang', befehl);
  fs.writeFileSync(bereich.datei, text, 'utf8');
  const container = mddStore.emptyContainer();
  mddStore.setWorkflowArmed(container, { hash: definitionsPruefsumme(text) }, Date.now());
  fs.writeFileSync(bereich.begleitdatei, mddStore.serializeContainer(container), 'utf8');
  return bereich;
}

function laufStand(begleitdatei) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
}

// Legt eine Datei in «Eingang» von außen an und wartet, bis ihr Lauf als
// letzter im Lauf-Stand steht.
async function laufDurch(wurzel, begleitdatei, name) {
  fs.writeFileSync(
    path.join(wurzel, 'Eingang', name),
    `# ${name}
`,
    'utf8',
  );
  await expect
    .poll(() => {
      const stand = laufStand(begleitdatei);
      return stand && stand.lastRun && stand.lastRun.event ? stand.lastRun.event.file : null;
    }, EREIGNIS_ZEIT)
    .toBe(`Eingang/${name}`);
  return laufStand(begleitdatei);
}

// Der Zähler des Lauf-Stands und jede Datei-Wirkung sind Lesen-Ändern-Schreiben
// und fassen zwei gleichzeitige Läufe zweier Fenster zu einem zusammen (an
// einer Probe mit abgeschaltetem Anspruch gemessen). Die Statusleisten-Meldung
// des Laufs entsteht dagegen je Fenster; ein Mitschnitt ihrer Texte macht sie
// unabhängig vom Zeitpunkt der Messung prüfbar (Muster
// erinnerungen-alle-fenster.spec.js).
async function schneideHinweiseMit(fenster) {
  await fenster.evaluate((sel) => {
    window.__wfHinweise = [];
    const el = document.querySelector(sel);
    const merke = () => {
      if (el && el.textContent) window.__wfHinweise.push(el.textContent);
    };
    new MutationObserver(merke).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
  }, '#statusbar-hint');
}
const hinweise = (fenster) => fenster.evaluate(() => window.__wfHinweise.join(' | '));

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

test.describe('WF-EREIGNIS: Scharf-Schaltung und Anzeige eines Ereignis-Workflows (4T-002463)', () => {
  test('WF-EREIGNIS-01: scharf schalten, Ereignis in Worten, Lauf durch ein Ereignis, Definition geändert', async () => {
    test.setTimeout(120000);
    const { wurzel, datei, begleitdatei } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      const seite = page.locator(SEITE);
      await page.evaluate(() =>
        document.dispatchEvent(
          new CustomEvent('scg:open-system-page', { detail: { pageId: 'workflow-runs' } }),
        ),
      );
      await expect(seite).toBeVisible();
      const aktualisieren = page.locator(`${SEITE} .wf-runs-refresh`);
      await expect
        .poll(
          async () => {
            if (await aktualisieren.isEnabled()) await aktualisieren.click();
            return seite.locator('.wf-runs-name').count();
          },
          { timeout: 20000 },
        )
        .toBe(1);

      const zeile = seite.locator('tr', {
        has: page.locator('.wf-runs-name', { hasText: 'Ereignis-Probe' }),
      });
      const statusleiste = page.locator('#statusbar-workflows');

      // Vor der Scharf-Schaltung: Schalter da und aus, kein nächster Lauf (AK1).
      await expect(zeile.locator('.wf-runs-arm')).not.toBeChecked();
      await expect(zeile.locator('.wf-runs-next')).toHaveText('');
      await expect(statusleiste).toBeHidden();

      // Scharf schalten: das Ereignis in Worten mit dem Ordner (AK3).
      await zeile.locator('.wf-runs-arm').check();
      await expect(zeile.locator('.wf-runs-armed')).toHaveAttribute('data-status', 'armed');
      await expect(zeile.locator('.wf-runs-next')).toContainText('Eingang');
      // Prüfsumme in der Begleitdatei, kein Termin.
      const stand = laufStand(begleitdatei);
      expect(stand.armed.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(stand.nextDue ?? null).toBeNull();
      // Das Statusleisten-Element steht bei einem scharfen Ereignis-Workflow (AK4).
      await expect(statusleiste).toBeVisible();

      // Eine neue Datei in «Eingang» löst genau einen Lauf aus.
      fs.writeFileSync(path.join(wurzel, 'Eingang', 'Brief.md'), '# Brief\n', 'utf8');
      await expect.poll(() => (laufStand(begleitdatei) || {}).runs || 0, EREIGNIS_ZEIT).toBe(1);
      expect(laufStand(begleitdatei).lastRun).toMatchObject({
        status: 'ok',
        origin: 'event',
        event: { type: 'file-created', file: 'Eingang/Brief.md' },
      });

      // Die Seite zeigt die Herkunft «Ereignis» mit der Datei (AK3), das
      // Statusleisten-Element den Lauf mit dem Namen (AK4).
      await aktualisieren.click();
      const herkunft = zeile.locator('.wf-runs-origin[data-origin="event"]');
      await expect(herkunft).toContainText('Eingang/Brief.md');
      await expect(statusleiste).toContainText('Ereignis-Probe');
      await expect(statusleiste).toHaveAttribute('data-status', 'ok');

      // Eine Änderung der Zeile `event`: «nicht scharf: Definition geändert» (AK2).
      fs.writeFileSync(datei, workflow('Ablage'), 'utf8');
      await expect
        .poll(
          async () => {
            await aktualisieren.click();
            return zeile.locator('.wf-runs-armed').getAttribute('data-status');
          },
          { timeout: 20000 },
        )
        .toBe('definitionChanged');
      await expect(zeile.locator('.wf-runs-armed-changed')).toBeVisible();
      await expect(zeile.locator('.wf-runs-arm')).not.toBeChecked();
      await expect(zeile.locator('.wf-runs-next')).toHaveText('');
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });

  test('WF-EREIGNIS-02: zwei Fenster desselben Bereichs ergeben genau einen Lauf', async () => {
    test.setTimeout(120000);
    const { wurzel, begleitdatei } = baueScharfenBereich(NOTIFY);
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      // Zweites Fenster derselben Applikation, also desselben Bereichs (Muster WF-ZEIT-02).
      const neu = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow([], null));
      const zweites = await neu;
      await zweites.waitForLoadState('domcontentloaded');
      await expect.poll(() => zweites.title()).toContain('(Bereich');
      // Beide Fenster kennen den scharfen Ereignis-Workflow.
      await expect(page.locator('#statusbar-workflows')).toBeVisible(EREIGNIS_ZEIT);
      await expect(zweites.locator('#statusbar-workflows')).toBeVisible(EREIGNIS_ZEIT);
      await schneideHinweiseMit(page);
      await schneideHinweiseMit(zweites);

      const erster = await laufDurch(wurzel, begleitdatei, 'Brief.md');
      expect(erster.runs).toBe(1);
      expect(erster.lastRun).toMatchObject({ status: 'ok', origin: 'event' });
      // Anker: Ein zweiter Lauf eines der Fenster stünde vor diesem.
      const anker = await laufDurch(wurzel, begleitdatei, 'Anker.md');
      expect(anker.runs).toBe(2);
      expect(anker.lastRun).toMatchObject({ status: 'ok', origin: 'event' });
      // Die Meldung des Laufs (`notify`) steht in genau einem der beiden Fenster.
      const mitBrief = [await hinweise(page), await hinweise(zweites)].filter((h) =>
        h.includes('Brief.md'),
      );
      expect(mitBrief).toHaveLength(1);
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });

  test('WF-EREIGNIS-03: eine vom Workflow angelegte Datei löst keinen weiteren Lauf aus', async () => {
    test.setTimeout(120000);
    // Der Block legt neben jeder neuen Datei eine Antwort in «Eingang» an.
    const { wurzel, begleitdatei } = baueScharfenBereich('create "{{file}}-Antwort.md"');
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, wurzel);
      await expect(page.locator('#statusbar-workflows')).toBeVisible(EREIGNIS_ZEIT);

      const erster = await laufDurch(wurzel, begleitdatei, 'Brief.md');
      expect(erster.runs).toBe(1);
      expect(erster.lastRun).toMatchObject({ status: 'ok', origin: 'event' });
      const antwort = path.join(wurzel, 'Eingang', 'Brief.md-Antwort.md');
      expect(fs.existsSync(antwort)).toBe(true);
      // Anker: Ein Lauf durch die Antwort-Datei stünde vor diesem.
      const anker = await laufDurch(wurzel, begleitdatei, 'Anker.md');
      expect(anker.runs).toBe(2);
      expect(anker.lastRun).toMatchObject({ status: 'ok', origin: 'event' });
      // Keine Antwort auf eine Antwort.
      expect(fs.readdirSync(path.join(wurzel, 'Eingang')).sort()).toEqual([
        'Anker.md',
        'Anker.md-Antwort.md',
        'Brief.md',
        'Brief.md-Antwort.md',
      ]);
    } finally {
      await closeApp(app, userData);
      removeDir(wurzel);
    }
  });
});
