// 4T-0213 (Epic 3E-0042): Handbuch-Infrastruktur (HB-01 bis HB-06).
//
// Handbuch-Seiten oeffnen als pfadlose read-only Tabs im Tab-System.
// Geoeffnet wird ueber die Verdrahtungs-Schnittstelle
// 'scg:open-manual-page' (CustomEvent; ab 4T-0216 haengt der Hilfe-
// Einstieg F1/Menue am selben Pfad). Die Sprache wird zu Test-Beginn
// deterministisch auf Deutsch gestellt (frisches Profil startet sonst
// mit der OS-Locale).
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
// 4T-0360 (Epic 3E-0066): Seiten-Registry als Quelle der Pruefliste (siehe BUNDLED_PAGES).
const { MANUAL_PAGES } = require('../../../src/shared/manual/manual-pages');

async function openManualPage(page, pageId) {
  await page.evaluate((id) => {
    document.dispatchEvent(new CustomEvent('scg:open-manual-page', { detail: { pageId: id } }));
  }, pageId);
}

// Wartet, bis die UI-Bindings der App stehen, und stellt dann die
// Zielsprache ein. Hintergrund: launchApp kehrt nach domcontentloaded
// zurueck, die Listener (Sprach-Select, Menue-IPC) entstehen aber erst am
// Ende des asynchronen init() — einmalige Events davor verpuffen. Das
// Bereitschafts-Signal ist ein Sprachwechsel-Roundtrip mit Retry; der
// zweite Flip (fr -> it) kann nur mit registriertem change-Listener
// gelingen, unabhaengig von der OS-Startsprache.
async function setLanguage(page, lang) {
  const html = page.locator('html');
  await expect
    .poll(async () => {
      await page.locator('#lang-select').selectOption('fr');
      return html.getAttribute('lang');
    })
    .toBe('fr');
  await expect
    .poll(async () => {
      await page.locator('#lang-select').selectOption('it');
      return html.getAttribute('lang');
    })
    .toBe('it');
  await page.locator('#lang-select').selectOption(lang);
  await expect(html).toHaveAttribute('lang', lang);
}

test.describe('HB-01: Handbuch-Seite öffnen', () => {
  test('Überblicksseite öffnet als Tab mit gerendertem Inhalt, ohne Dirty-Marker', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      const tabs = page.locator(SEL.tabs0);
      await expect(tabs).toHaveCount(1);
      // 4T-0216: Hilfe im leeren App-Zustand verlaesst den Empty-State
      // (gewollt — die Seite oeffnet als normaler Tab).
      await expect(page.locator(SEL.emptyState)).toBeHidden();
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText('Handbuch');
      // Start-Modus ist Gerendert; Inhalt der Ueberblicksseite sichtbar.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('Handbuch');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HB-02: Einfach-Instanz pro Seite', () => {
  test('zweites Öffnen derselben Seite erzeugt keinen zweiten Tab', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await openManualPage(page, 'overview');
      // Kein Duplikat; der bestehende Tab bleibt aktiv.
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HB-03: Read-only-Durchsetzung', () => {
  test('Edit-Toggle bleibt wirkungslos, Stift deaktiviert, kein Dirty-Marker', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Statusbar-Stift ist fuer Handbuch-Tabs deaktiviert.
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      // In den Quellcode-Modus wechseln und Strg+E versuchen: der Editor
      // bleibt read-only. CodeMirror haelt contenteditable=true und
      // verwirft Eingaben auf Transaktionsebene (EditorState.readOnly,
      // sichtbar als aria-readonly) — deshalb Verhaltens-Asserts:
      // aria-readonly bleibt true, Tippen erzeugt weder Text noch Dirty.
      await page.locator(SEL.viewBtn('source')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      await expect(editor).toHaveAttribute('aria-readonly', 'true');
      await page.keyboard.press('Control+e');
      await expect(editor).toHaveAttribute('aria-readonly', 'true');
      await editor.click();
      await page.keyboard.type('XYZ-READONLY-PROBE');
      await expect(editor).not.toContainText('XYZ-READONLY-PROBE');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HB-04: Alle vier View-Modi', () => {
  test('Source, Split, Live und Rendered sind nutzbar', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      const content = page.locator(SEL.content0);

      await page.locator(SEL.viewBtn('source')).click();
      await expect(content).toHaveClass(/view-source/);
      await page.locator(SEL.viewBtn('split')).click();
      await expect(content).toHaveClass(/view-split/);
      await page.locator(SEL.viewBtn('live')).click();
      await expect(content).toHaveClass(/view-live/);
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('aria-readonly', 'true');
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(content).toHaveClass(/view-rendered/);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HB-05: Interne Navigation und Sprachwechsel', () => {
  test('interner Link öffnet die Ziel-Seite; Sprachwechsel wechselt Inhalt und Titel', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Klick auf den internen Link zur Perspective Table-Seite (Registry-Link
      // 'perspective-table.md', kein Dateisystem-Ziel).
      await page.locator(`${SEL.markdownBody0} a[href="perspective-table.md"]`).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(
        'Perspective Table',
      );
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('Perspective Table');

      // Erneuter Klick vom Ueberblick aus aktiviert den bestehenden Tab
      // (kein Duplikat).
      await page.locator(SEL.tabs0).first().click();
      await page.locator(`${SEL.markdownBody0} a[href="perspective-table.md"]`).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // Sprachwechsel zur Laufzeit: Ueberblick-Tab wechselt Inhalt + Titel.
      await page.locator(SEL.tabs0).first().click();
      await setLanguage(page, 'en');
      await expect(page.locator(SEL.tabs0).first().locator('.tab-title')).toHaveText('Manual');
      await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText('Manual');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HB-06: Schließen ohne Rückfrage', () => {
  test('Handbuch-Tab schließt ohne Dialog', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await page.locator(SEL.tabs0).first().locator('.tab-close').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
      await expect(page.locator(SEL.emptyState)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0212: generierte Seiten — Funktions-Tabelle und Tastenkuerzel.

test.describe('HB-07: Generierte Funktions-Seite', () => {
  test('fünf Gruppen-Tabellen mit Kurznamen in der ersten Spalte', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'functions');
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText('Funktionen');
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('h1')).toHaveText('Funktionen');
      // Fuenf Gruppen (H2) mit je einer Tabelle.
      await expect(body.locator('h2')).toHaveCount(5);
      await expect(body.locator('h2').first()).toHaveText('Datei und Sitzung');
      await expect(body.locator('table')).toHaveCount(5);
      // Kurzname der ersten Funktion (fett in der ersten Spalte).
      await expect(
        body.locator('table').first().locator('tbody tr').first().locator('td').first(),
      ).toHaveText('Dateien öffnen');
      // Spaltenkoepfe der dreispaltigen Tabelle.
      const headers = body.locator('table').first().locator('thead th');
      await expect(headers).toHaveCount(3);
      await expect(headers.nth(2)).toHaveText('Zugang');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0214/4T-0215: gebuendelte Seiten in allen fuenf Sprachen — jede Seite
// laedt (kein Fallback-/Fehlertext), traegt ein H1 und ist in der
// Quellcode-Ansicht linter-sauber (keine Marker).
// 4T-0360 (Epic 3E-0066): dynamisch aus der Seiten-Registry statt fester
// Aufzaehlung — jede gebuendelte Seite wird geprueft, neue Seiten ziehen
// automatisch nach (schliesst die zuvor unvollstaendige Liste, z.B. history,
// sidebar, subpages, context-menu, notes).
const BUNDLED_PAGES = MANUAL_PAGES.filter((p) => p.source === 'bundled').map((p) => p.id);
const ALL_LANGS = ['de', 'en', 'fr', 'es', 'it'];

test.describe('HB-09: Themen-Seiten laden linter-sauber (fünf Sprachen)', () => {
  test('alle gebündelten Seiten in jeder Sprache: Inhalt da, keine Linter-Marker', async () => {
    test.setTimeout(300000);
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      for (const lang of ALL_LANGS) {
        await page.locator('#lang-select').selectOption(lang);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        for (const pageId of BUNDLED_PAGES) {
          await openManualPage(page, pageId);
          const body = page.locator(SEL.markdownBody0);
          await expect(body.locator('h1').first()).toBeVisible();
          // Kein Lade-Fehlertext (manual.loadError, sprachuebergreifend
          // an den Kern-Woertern erkennbar).
          await expect(body).not.toContainText(
            /konnte nicht geladen|could not be loaded|n'a pas pu|No se pudo cargar|Impossibile caricare/,
          );
          // Quellcode-Ansicht: Lint-Lauf abwarten (300-ms-Debounce plus
          // IPC), dann duerfen keine Marker stehen.
          await page.locator(SEL.viewBtn('source')).click();
          await expect(page.locator(SEL.editorContent0)).toBeVisible();
          await page.waitForTimeout(700);
          await expect(page.locator('.cm-linter-mark')).toHaveCount(0);
          // Zurueck in die Lese-Ansicht und Tab schliessen (naechste Seite
          // startet frisch; haelt die Tab-Leiste klein).
          await page.locator(SEL.viewBtn('rendered')).click();
          await page.locator(SEL.activeTab0).locator('.tab-close').click();
        }
      }
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0215: Sprachwechsel bei offenem Tab — Titel und Inhalt wechseln in
// jede Sprache; der interne Ueberblicks-Link funktioniert pro Fassung.
test.describe('HB-10: Sprachfassungen und interne Links', () => {
  const TITLES = { en: 'Manual', fr: 'Manuel', es: 'Manual', it: 'Manuale', de: 'Handbuch' };
  test('Überblick wechselt Titel/Inhalt pro Sprache; perspective-table-Link öffnet überall', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      for (const lang of ALL_LANGS) {
        await page.locator('#lang-select').selectOption(lang);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        // Tab-Titel und H1 der offenen Seite folgen der Sprache.
        await expect(page.locator(SEL.tabs0).first().locator('.tab-title')).toHaveText(
          TITLES[lang],
        );
        await expect(page.locator(SEL.markdownBody0).locator('h1')).toHaveText(TITLES[lang]);
        // Interner Link der jeweiligen Fassung oeffnet die Ziel-Seite.
        await page.locator(`${SEL.markdownBody0} a[href="perspective-table.md"]`).click();
        await expect(page.locator(SEL.tabs0)).toHaveCount(2);
        await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(
          'Perspective Table',
        );
        await page.locator(SEL.activeTab0).locator('.tab-close').click();
        await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      }
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('HB-08: Generierte Tastenkürzel-Seite', () => {
  test('zeigt Default-Binding und spiegelt eine Binding-Änderung', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'shortcuts');
      await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText('Tastenkürzel');
      const body = page.locator(SEL.markdownBody0);
      // Bekanntes Default-Binding der Suche (lokalisiert 'Strg+F').
      await expect(body.locator('table code', { hasText: 'Strg+F' })).toHaveCount(1);

      // Binding ueber die Einstellungs-Seite aendern (Muster HK-01):
      // search.open auf Strg+Alt+F — die offene Handbuch-Seite generiert
      // sich nach dem hotkeys-Broadcast neu. 4T-0279: die Einstellungen
      // sind ein eigener Tab (Shortcuts-Tab wandert in den Hintergrund);
      // OK schliesst den Einstellungs-Tab, der Shortcuts-Tab wird wieder
      // aktiv und zeigt den regenerierten Stand.
      const settingsPage = page.locator('.pane-group[data-pane="0"] .pane-system .settings-page');
      await page.evaluate(() => {
        document.dispatchEvent(
          new CustomEvent('scg:open-system-page', { detail: { pageId: 'settings' } }),
        );
      });
      await expect(settingsPage).toBeVisible();
      await page.locator('.settings-nav-entry[data-section-id="hotkeys"]').click();
      const row = page.locator('.hotkey-row[data-command-id="search.open"]');
      await row.scrollIntoViewIfNeeded();
      await row.locator('.hotkey-edit').click();
      await page.keyboard.press('Control+Alt+F');
      await expect(row).not.toHaveClass(/capturing/);
      await page.locator('#btn-settings-ok').click();
      await expect(settingsPage).toBeHidden();

      await expect(body.locator('table code', { hasText: 'Strg+Alt+F' })).toHaveCount(1);
      await expect(body.locator('table code', { hasText: 'Strg+F' })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0649 (Epic 3E-0126): Die Ueberblicksseite fuehrt die Bildmarke. Sie
// haengt an einem relativen Pfad, der gegen das Renderer-Verzeichnis
// aufloest — Handbuch-Tabs sind pfadlos. Ein gebrochener Pfad faellt sonst
// nirgends auf: Der Markdown-Linter meldet fehlende Bild-Ziele nicht, und
// die gerenderte Seite zeigt bloss den Alt-Text. Deshalb wird hier der
// tatsaechliche Lade-Zustand geprueft (naturalWidth), nicht die blosse
// Existenz des Elements.
test.describe('HB-11: Bildmarke auf der Überblicksseite', () => {
  test('Logo ist eingebunden, geladen und auf Anzeigegröße begrenzt', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await setLanguage(page, 'de');
      await openManualPage(page, 'overview');
      const logo = page.locator(SEL.markdownBody0).locator('img[src$="em4me-logo.svg"]');
      await expect(logo).toHaveCount(1);
      await expect(logo).toBeVisible();
      // naturalWidth > 0 heisst: die Datei wurde wirklich gefunden und
      // dekodiert. Bei totem Pfad bliebe der Wert 0.
      await expect.poll(async () => logo.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
      // Die Groesse kommt aus dem Stylesheet, nicht aus einer Groessen-
      // Angabe im Markdown (die haengt an der Erweiterung „Figuren").
      const breite = await logo.evaluate((el) => el.getBoundingClientRect().width);
      expect(breite).toBeGreaterThan(80);
      expect(breite).toBeLessThan(120);

      // 4T-0643: Unter dem Logo steht der ausgeschriebene Claim — und NICHT
      // zusaetzlich der Alt-Text als Bildunterschrift. Die Erweiterung
      // „Figuren" wuerde ihn dort sonst wiederholen (PO-Befund).
      const body = page.locator(SEL.markdownBody0);
      await expect(body.getByText('extended memory for me')).toBeVisible();
      const bildunterschrift = body.locator('figure:has(img[src$="em4me-logo.svg"]) figcaption');
      if ((await bildunterschrift.count()) > 0) {
        await expect(bildunterschrift).toBeHidden();
      }
      // Der Alt-Text bleibt am Bild erhalten (Linter-Regel und Barrierefreiheit).
      await expect(logo).toHaveAttribute('alt', 'EM4me');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0758 (Epic 3E-0142): Sammel-Abruf aller gebuendelten Seiten. Grundlage
// der Suche ueber das ganze Handbuch; im Unit-Test ist der IPC gestellt,
// hier laeuft er real ueber Preload und Main.
test.describe('HB-12: Sammel-Abruf aller Handbuch-Seiten', () => {
  test('liefert jede gebündelte Seite mit Inhalt, mit Englisch-Fallback', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp();
    try {
      const seiten = await page.evaluate(() => window.api.getAllManualPages('de'));
      expect(Array.isArray(seiten)).toBe(true);
      expect(seiten.map((s) => s.id).sort()).toEqual([...BUNDLED_PAGES].sort());
      for (const s of seiten) {
        expect(s.text.length, `Seite ohne Inhalt: ${s.id}`).toBeGreaterThan(0);
      }

      // Unbekannte Sprache faellt auf Englisch zurueck (Verhalten des
      // Einzel-Loaders, das der Sammel-Abruf teilt).
      const fallback = await page.evaluate(() => window.api.getAllManualPages('xx'));
      const uebersichtDe = seiten.find((s) => s.id === 'overview').text;
      const uebersichtFallback = fallback.find((s) => s.id === 'overview').text;
      expect(uebersichtFallback.length).toBeGreaterThan(0);
      expect(uebersichtFallback).not.toBe(uebersichtDe);
    } finally {
      await closeApp(app, userData);
    }
  });
});
