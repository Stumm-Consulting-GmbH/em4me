// 4T-001581 (Epic 3E-000283): E2E-Funktions-Suite — der gebündelte
// Einstellungs-Abschnitt „Statusleiste". Kürzel SB- (Statusleisten-Bündelung).
//
// SB-01 Aufbau und Ort des Abschnitts (AK3): drei Blöcke in der
// entschiedenen Reihenfolge, Position hinter „Sidebar" und vor
// „Panel-Reihenfolge", und der Rest-Abschnitt heißt „Kontextmenü und Makros"
// (AK5). SB-02 vorbelegte Werte wirken nach dem Umzug unverändert und werden
// im neuen Abschnitt gepflegt (AK4). SB-03 Einstellungs-Suche und Sprungmarke
// auf eine umgezogene Zeile (AK6). SB-04 der Ab-Schalter der Erweiterung wirkt
// blockweise: die beiden umgezogenen Blöcke verschwinden, die Falt-Einstellung
// bleibt (E4a des Epics).
//
// Eigene Spec statt weiterer SF-Fälle in `statusleisten-faltung.spec.js`: Dort
// geht es um das Verhalten der LEISTE und die Datei trägt dafür einen Satz
// Mess- und Warte-Helfer, den hier keiner braucht — geprüft wird die
// Einstellungs-Seite. Die Datei liegt zudem am Größen-Budget für Prüfdateien.
//
// Die drei Blöcke selbst sind an ihrem alten Ort bereits geprüft und bleiben
// dort geprüft: Anlage-Flow und Hide-Liste in
// `funktionen/kommando-platzierung.spec.js` (KP-02, KP-03, seit dem Umzug über
// den Abschnitt „Statusleiste" bedient), die Falt-Einstellung in
// `funktionen/statusleisten-faltung.spec.js` (SF-11). Hier steht allein, was
// der Umzug neu zusichert.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'frontmatter.md');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const NAV_ALLGEMEIN = `${SETTINGS_PAGE} .settings-nav-group[data-nav-group="general"]`;
const NAV_STATUSLEISTE = `${NAV_ALLGEMEIN} .settings-nav-entry[data-section-id="statusbar"]`;
const NAV_REST = `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="commandPlacement"]`;
const SUCH_PANEL = '.pane-group[data-pane="0"] .sidebar-searchresults';
const SEGMENT_BUTTON = '#command-buttons .command-placement-button';

// Store-Vorbelegung (Muster seedProfile in kommando-platzierung.spec.js). Die
// Sprach-Vorbelegung gehört mit hinein, weil eine eigene settings-Angabe die
// Standard-Vorbelegung ersetzt und die Prüfungen auf deutsche Beschriftungen
// sehen.
function seedProfil(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sb-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function oeffneEinstellungen(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await oeffneEinstellungsSeite(page);
  await expect(page.locator(`${SETTINGS_PAGE} .settings-section-heading`)).toBeVisible();
}

// Beschriftungen der Blöcke des aktiven Abschnitts in Anzeige-Reihenfolge.
// Gelesen wird die Klasse, die auch die Einstellungs-Suche erntet
// (settings-search-harvest.js) — damit prüft der Fall dasselbe Markup, von dem
// SB-03 abhängt.
async function bloeckeDesAbschnitts(page) {
  return page.evaluate((sel) => {
    const titel = document.querySelectorAll(`${sel} .settings-extensions-group-title`);
    return [...titel].map((el) => (el.textContent || '').trim());
  }, SETTINGS_PAGE);
}

test.describe('SB-01: Aufbau und Ort des Abschnitts „Statusleiste"', () => {
  test('drei Blöcke, Platz hinter „Sidebar", Rest-Abschnitt umbenannt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await oeffneEinstellungen(page);

      // Der Abschnitt liegt im Block „Allgemein", unmittelbar hinter
      // „Sidebar" und vor „Panel-Reihenfolge" (F2 der Entscheidung vom
      // 2026-09-14: die drei verwandten Abschnitte untereinander).
      await expect(page.locator(NAV_STATUSLEISTE)).toBeVisible();
      const kennungen = await page.evaluate(
        (sel) =>
          [...document.querySelectorAll(`${sel} .settings-nav-entry`)].map(
            (el) => el.dataset.sectionId,
          ),
        NAV_ALLGEMEIN,
      );
      const i = kennungen.indexOf('statusbar');
      expect(
        i,
        `„Statusleiste" fehlt im Block „Allgemein": ${kennungen.join(', ')}`,
      ).toBeGreaterThan(0);
      expect(kennungen[i - 1]).toBe('sidebar');
      expect(kennungen[i + 1]).toBe('panelOrder');

      // Inhalt: die Falt-Zeile und die beiden umgezogenen Blöcke, in dieser
      // Reihenfolge (V1 der Mockup-Vorlage).
      await page.locator(NAV_STATUSLEISTE).click();
      await expect(page.locator(`${SETTINGS_PAGE} .settings-section-heading`)).toHaveText(
        'Statusleiste',
      );
      await expect(page.locator('#settings-statusbar-collapse-mode')).toBeVisible();
      expect(await bloeckeDesAbschnitts(page)).toEqual([
        'Statusbar-Buttons',
        'Standard-Buttons ausblenden',
      ]);
      // Und die Bedien-Elemente der beiden Blöcke sind wirklich hier.
      await expect(page.locator('#btn-command-placement-add-statusbar')).toBeVisible();
      await expect(page.locator('#btn-command-placement-hide-reset')).toBeVisible();

      // AK5: Der Herkunfts-Abschnitt bleibt und trägt den entschiedenen Namen;
      // Kontextmenü und Makros liegen weiter dort.
      await expect(page.locator(NAV_REST)).toHaveText('Kontextmenü und Makros');
      await page.locator(NAV_REST).click();
      await expect(page.locator(`${SETTINGS_PAGE} .settings-section-heading`)).toHaveText(
        'Kontextmenü und Makros',
      );
      expect(await bloeckeDesAbschnitts(page)).toEqual(['Editor-Kontextmenü', 'Makros']);
      await expect(page.locator('#btn-command-placement-add-contextmenu')).toBeVisible();
      await expect(page.locator('#btn-command-placement-add-macro')).toBeVisible();
      // Der Rest-Abschnitt bleibt im Block der internen Erweiterungen.
      await expect(
        page.locator(
          `${SETTINGS_PAGE} .settings-nav-group[data-nav-group="extensionsInternal"] .settings-nav-entry[data-section-id="commandPlacement"]`,
        ),
      ).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SB-02: vorbelegte Werte gelten nach dem Umzug weiter', () => {
  test('Schaltfläche und Ausblendung wirken, und sie werden im neuen Abschnitt gepflegt', async () => {
    // Vorbelegung im Store — geschrieben unter demselben Schlüssel wie vor dem
    // Umzug (`commandPlacement`). Genau das ist die Zusicherung von AK4: Der
    // Umzug hat den Ort in der Oberfläche geändert, nicht den Ablage-Ort.
    const userData = seedProfil({
      language: 'de',
      commandPlacement: {
        statusbar: [{ commandId: 'view.toggleEdit', icon: 'star', label: 'Schreiben' }],
        contextMenu: [],
        macros: [],
        hiddenButtons: ['panel:outline'],
      },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Wirkung unverändert: eigene Schaltfläche da, ausgeblendete
      // Standard-Schaltfläche weg (im DOM, aber verborgen).
      const eigene = page.locator(`${SEGMENT_BUTTON}[data-command-id="view.toggleEdit"]`);
      await expect(eigene).toBeVisible();
      await expect(eigene).toHaveAttribute('title', /^Schreiben \(/);
      await expect(page.locator('#btn-outline')).toBeHidden();

      // Gepflegt wird beides jetzt im Abschnitt „Statusleiste", und der zeigt
      // die gespeicherten Werte.
      await oeffneEinstellungen(page);
      await page.locator(NAV_STATUSLEISTE).click();
      await expect(
        page.locator(
          `${SETTINGS_PAGE} [data-placement-list="statusbar"] .command-placement-row[data-command-id="view.toggleEdit"]`,
        ),
      ).toHaveCount(1);
      const kasten = page.locator(
        `${SETTINGS_PAGE} .command-placement-hide-row[data-hide-key="panel:outline"] input`,
      );
      // Checkbox-Semantik „sichtbar": die ausgeblendete Zeile ist abgewählt.
      await expect(kasten).not.toBeChecked();

      // Und eine Änderung hier wirkt über denselben Anwenden-Weg wie vorher:
      // Der apply-Hook liegt weiter beim Abschnitt der Kommando-Platzierung,
      // ausgelöst wird er seitenweit.
      await kasten.check();
      await expect(page.locator('#btn-settings-apply')).toBeEnabled();
      await page.locator('#btn-settings-apply').click();
      await expect(page.locator('#btn-settings-apply')).toBeDisabled();
      await expect(page.locator('#btn-outline')).toBeVisible();
      // Die eigene Schaltfläche hat das Anwenden unberührt gelassen.
      await expect(eigene).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SB-03: Einstellungs-Suche und Sprungmarke', () => {
  test('eine umgezogene Zeile führt in den Abschnitt „Statusleiste"', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await oeffneEinstellungen(page);
      // Mit offener Einstellungs-Seite sucht Strg+F in den Einstellungen
      // (Muster SE-01 in suche-einstellungen.spec.js).
      await page.keyboard.press('Control+f');
      const eingabe = page.locator('#search-input');
      await expect(eingabe).toBeVisible();
      await eingabe.fill('Standard-Buttons ausblenden');
      await expect(page.locator('#search-scope')).toHaveText(/Einstellungen/);

      const panel = page.locator(SUCH_PANEL);
      await expect(panel).toBeVisible();
      const treffer = panel.locator('.search-results-item');
      await expect.poll(async () => treffer.count()).toBeGreaterThan(0);
      // Der Treffer ist dem neuen Abschnitt zugeordnet, nicht dem alten. Die
      // Gruppe traegt die Abschnitts-Kennung als Datenattribut; sie ist die
      // Sprung-Adresse und damit die belastbare Zusicherung.
      await expect(panel.locator('.search-results-group[data-gruppe="statusbar"]')).toHaveCount(1);
      await expect(
        panel.locator('.search-results-group[data-gruppe="commandPlacement"]'),
      ).toHaveCount(0);

      // Der Sprung aktiviert den Abschnitt und hebt die getroffene Zeile
      // hervor (Ernte und Sprung teilen einen Selektor).
      await treffer.first().click();
      await expect(page.locator(NAV_STATUSLEISTE)).toHaveClass(/active/);
      await expect(page.locator(`${SETTINGS_PAGE} .settings-row-hervorgehoben`)).toBeVisible();
      await expect(page.locator(`${SETTINGS_PAGE} .settings-row-hervorgehoben`)).toHaveText(
        'Standard-Buttons ausblenden',
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SB-04: Ab-Schalter der Erweiterung wirkt blockweise', () => {
  test('die umgezogenen Blöcke fehlen, die Falt-Einstellung bleibt', async () => {
    const userData = seedProfil({
      language: 'de',
      commandPlacement: {
        statusbar: [{ commandId: 'view.toggleEdit', icon: 'star', label: null }],
        contextMenu: [],
        macros: [],
        hiddenButtons: ['right:theme'],
      },
      extensions: { disabled: ['command-placement'] },
    });
    const { app, page } = await launchApp({ args: [FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await oeffneEinstellungen(page);

      // Der Rest-Abschnitt ist wie bisher ganz ausgeblendet
      // (settingsSections-Kopplung, KP-05 prüft dieselbe Zusicherung).
      await expect(page.locator(NAV_REST)).toHaveCount(0);

      // Der Abschnitt „Statusleiste" bleibt dagegen sichtbar und führt seine
      // Falt-Einstellung — sie gehört nach E7 nicht zur Erweiterung.
      await expect(page.locator(NAV_STATUSLEISTE)).toBeVisible();
      await page.locator(NAV_STATUSLEISTE).click();
      await expect(page.locator('#settings-statusbar-collapse-mode')).toBeVisible();
      // 4T-001765 (Epic 3E-000186): eigene Kennung statt der geteilten Klasse
      // — der Abschnitt trägt seither zwei Hinweise.
      await expect(page.locator('#settings-statusbar-collapse-mode-hint')).not.toBeEmpty();

      // Die beiden umgezogenen Blöcke fehlen samt ihren Bedien-Elementen.
      expect(await bloeckeDesAbschnitts(page)).toEqual([]);
      await expect(page.locator('#btn-command-placement-add-statusbar')).toHaveCount(0);
      await expect(page.locator('#btn-command-placement-hide-reset')).toHaveCount(0);

      // Wieder einschalten: Die Blöcke kehren in den Abschnitt zurück, ohne
      // dass die Seite neu geöffnet werden muss (Broadcast-Pfad
      // scg:extensions-changed).
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect(page.locator(NAV_REST)).toHaveCount(1);
      await expect.poll(async () => (await bloeckeDesAbschnitts(page)).length).toBeGreaterThan(0);
      expect(await bloeckeDesAbschnitts(page)).toEqual([
        'Statusbar-Buttons',
        'Standard-Buttons ausblenden',
      ]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
