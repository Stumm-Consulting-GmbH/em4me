// 4T-002168 (Epic 3E-000347): Ablauf-Faelle des HTML-Exports (HE-01 bis
// HE-08) an der gestarteten Anwendung. Der Export laeuft ueber mehrere
// Prozesse und Module — Kommando, Zielpfad-Dialog im Hauptprozess,
// Druck-Vorbereitung mit Farbschema-Wechsel, Erfassen des gerenderten
// Inhalts, Zusammensetzen, Schreiben im Hauptprozess, Meldung in der
// Statusleiste —, und ein Unit-Fall sieht diese Kette nicht.
//
// Vorbild ist pdf-export.spec.js (PD-01 bis PD-08): Der native
// Speichern-Dialog ist per Playwright nicht bedienbar und wird im
// Hauptprozess durch einen Stub mit festem Zielpfad (bzw. Abbruch) ersetzt;
// der Dialog selbst bleibt manueller Test. Ausgeloest wird der Export ueber
// das Kommando `file.exportHtml` in der Kommando-Palette (es hat kein
// Vorgabe-Kuerzel), also ueber den Weg des Anwenders samt Kommando-Registry
// und Dispatcher. Jeder Fall endet an der Datei auf der Platte, ausgewertet
// am rohen Text, oder an ihrem Fehlen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { warteAufText } = require('../helpers/dateien');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen');
const FIXTURE = path.join(FIXTURE_DIR, 'html-export.md');
const FIXTURE_FORMEL = path.join(FIXTURE_DIR, 'html-export-formel.md');

const MODAL = '#command-palette-modal';
const FILTER = '#command-palette-filter';
const ITEM = '.command-palette-item';

// Wie PD-01: Die Pruefung der hellen Werte haengt an den Farben des
// Standard-Schemas (Text #1f1f1f, Grund #ffffff; dunkel #1e1e1e und
// #2a2a2a), nicht an der Auslieferungs-Voreinstellung.
const STANDARD_SCHEMES = {
  language: 'de',
  colorSchemes: { custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' },
};

// Speichern-Dialog im Hauptprozess stubben. Zaehlt die Aufrufe und merkt
// sich den vorgeschlagenen Pfad, damit ein Fall weiss, dass der Export-Pfad
// gelaufen ist, und welchen Zielpfad er vorgeschlagen hat.
async function stubSpeichernDialog(app, ergebnis) {
  await hauptSenden(
    app,
    ({ dialog }, payload) => {
      globalThis.__htmlDialogAufrufe = 0;
      globalThis.__htmlDialogVorschlag = null;
      dialog.showSaveDialog = async (...args) => {
        globalThis.__htmlDialogAufrufe += 1;
        const optionen = args[args.length - 1] || {};
        globalThis.__htmlDialogVorschlag = optionen.defaultPath || null;
        return payload;
      };
    },
    ergebnis,
  );
}

function dialogAufrufe(app) {
  return hauptLesen(app, () => globalThis.__htmlDialogAufrufe || 0);
}

function dialogVorschlag(app) {
  return hauptLesen(app, () => globalThis.__htmlDialogVorschlag || null);
}

// Jede Meldung der Statusleiste mitschreiben (Text und Fehler-Markierung).
// Der Hinweis blendet nach 1,5 bis 4 Sekunden aus und kann von einer
// spaeteren Meldung ueberschrieben werden; die Mitschrift macht die
// Aussage «es wurde genau dies gemeldet» und «es wurde nichts gemeldet»
// unabhaengig von diesem Zeitfenster.
async function zeichneMeldungenAuf(page) {
  await page.evaluate(() => {
    const hinweis = document.getElementById('statusbar-hint');
    window.__htmlExportMeldungen = [];
    if (window.__htmlExportBeobachter) window.__htmlExportBeobachter.disconnect();
    window.__htmlExportBeobachter = new MutationObserver(() => {
      window.__htmlExportMeldungen.push({
        text: hinweis.textContent,
        fehler: hinweis.classList.contains('error'),
      });
    });
    window.__htmlExportBeobachter.observe(hinweis, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

// Die verschiedenen mitgeschriebenen Meldungs-Texte, die den HTML-Export
// betreffen.
async function htmlMeldungen(page) {
  const alle = await page.evaluate(() => window.__htmlExportMeldungen || []);
  return [...new Set(alle.map((m) => m.text).filter((t) => t.includes('HTML')))];
}

async function htmlFehlerMeldungen(page) {
  const alle = await page.evaluate(() => window.__htmlExportMeldungen || []);
  return [...new Set(alle.filter((m) => m.fehler).map((m) => m.text))];
}

// Export ueber das Kommando `file.exportHtml` in der Kommando-Palette.
// Die Palette oeffnet ueber den Menue-Kanal (Muster KP-02), weil der
// Listener erst am Ende des asynchronen init() steht und ein Tastendruck
// in der Quelltext-Ansicht dem Editor gilt; ein erneutes Senden bei
// offener Palette ist ein No-op. Das Kommando selbst wird genau einmal
// ausgefuehrt (Enter), danach wartet der Fall auf den Dialog-Aufruf.
async function exportiereUeberPalette(page, app) {
  const vorher = await dialogAufrufe(app);
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isVisible()) return true;
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:openCommandPalette');
      });
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
  await page.locator(FILTER).fill('Als HTML exportieren');
  // 4T-002163 (Epic 3E-000149): Der Filter der Palette ist ein Teilstring
  // ohne Gross-/Kleinschreibung und trifft seither auch «Foliensatz als HTML
  // exportieren…»; kein Filtertext trennt beide. Eindeutig ist der Eintrag
  // mit genau diesem Text: Er steht genau einmal da, ist ausfuehrbar und ist
  // der aktive, den Enter ausfuehrt.
  const eintrag = page.locator(ITEM).filter({
    has: page.locator('.command-palette-name', { hasText: /^Als HTML exportieren…$/ }),
  });
  await expect(eintrag).toHaveCount(1);
  await expect(eintrag).toHaveClass(/\bactive\b/);
  await expect(eintrag).not.toHaveClass(/\bunavailable\b/);
  await page.keyboard.press('Enter');
  await expect(page.locator(MODAL)).toBeHidden();
  await expect.poll(() => dialogAufrufe(app), { timeout: 30000 }).toBe(vorher + 1);
}

// Wartet, bis die Datei vollstaendig geschrieben ist (Stabilitaetsregel 12:
// auf den Inhalt warten, nicht auf die Existenz), und liefert ihren Text.
function warteAufHtmlDatei(ziel) {
  return warteAufText(ziel, '</html>', { timeout: 30000 });
}

function neuesZielVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-html-e2e-'));
}

function raeumeAuf(verzeichnis) {
  try {
    fs.rmSync(verzeichnis, { recursive: true, force: true });
  } catch {
    /* Temp-Verzeichnis bleibt liegen; unkritisch */
  }
}

async function warteAufGerendertesFixture(page) {
  await expect(page.locator(SEL.tabs0)).toHaveCount(1);
  // Render-Pipeline abwarten: das Mermaid-Diagramm steht im Lese-Bereich.
  await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible({
    timeout: 20000,
  });
}

// Der Anteil der Datei zwischen <body> und </body>: der exportierte Inhalt
// ohne den Stil-Block (der Stil-Block nennt Klassen-Namen als Selektoren).
function koerper(html) {
  const start = html.indexOf('<body');
  const ende = html.lastIndexOf('</body>');
  return html.slice(start, ende);
}

test.describe('HE-01: Export aus dem dunklen Farbschema über das Kommando', () => {
  test('Datei ist eigenständig, hell, ohne Programm; Verweise, Bild und Checkbox nach der Regel; Anwendung steht wie vorher', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      settings: STANDARD_SCHEMES,
    });
    const verzeichnis = neuesZielVerzeichnis();
    const ziel = path.join(verzeichnis, 'export-dunkel.html');
    try {
      await warteAufGerendertesFixture(page);
      await page.evaluate(() => window.api.setThemePref('dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);

      await zeichneMeldungenAuf(page);
      await stubSpeichernDialog(app, { canceled: false, filePath: ziel });
      await exportiereUeberPalette(page, app);
      const html = await warteAufHtmlDatei(ziel);
      const inhalt = koerper(html);

      // Datei-Huelle: eigenstaendige HTML-Datei ohne Programm.
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<title>html-export</title>');
      // Ueberschriften, Liste, Tabelle.
      expect(inhalt).toMatch(/<h1[^>]*>HTML-Export-Fixture<\/h1>/);
      expect(inhalt).toMatch(/<li[^>]*>Erster Listenpunkt<\/li>/);
      expect(inhalt).toMatch(/<table[\s>]/);
      expect(inhalt).toContain('Alpha');
      // Bild als Daten-Adresse bleibt eingebettet.
      expect(inhalt).toMatch(/<img[^>]*src="data:image\/png;base64,iVBORw0KGgo/);
      expect(inhalt).not.toContain('export-bild-fehlt');
      // Wiki-Verweis: gekennzeichneter Text ohne Ziel, kein <a> mehr.
      expect(inhalt).toMatch(
        /<span class="export-verweis-ohne-ziel" title="Verweis auf ‹[^›]*html-export-ziel[^›]*›; in dieser Datei ohne Ziel">html-export-ziel<\/span>/,
      );
      expect(inhalt).not.toMatch(/<a [^>]*href="[^"#]*html-export-ziel/);
      // Sprung im Dokument bleibt ein Verweis, sein Ziel steht in der Datei.
      expect(inhalt).toMatch(/<a [^>]*href="#tabelle"/);
      expect(inhalt).toMatch(/<h2[^>]*id="tabelle"/);
      // Aufgaben-Checkboxen: angezeigter Stand, nicht bedienbar.
      const boxen = inhalt.match(/<input[^>]*type="checkbox"[^>]*>/g) || [];
      expect(boxen).toHaveLength(2);
      for (const box of boxen) expect(box).toMatch(/\sdisabled/);
      expect(boxen.filter((b) => /\schecked/.test(b))).toHaveLength(1);

      // Helle Farb-Werte, keine dunklen Reste (Grund, Text, Code-Grund).
      expect(html).toMatch(/--bg: #ffffff;/i);
      expect(html).toMatch(/--fg: #1f1f1f;/i);
      expect(html).not.toMatch(/#1e1e1e/i);
      expect(html).not.toMatch(/#2a2a2a/i);
      // Ohne Formel: kein KaTeX-Stilblatt und keine eingebetteten Schriften
      // (HE-02 ist die Gegenprobe). Gemessen wird am Stilblatt selbst — an
      // seinen Schrift-Familien und an @font-face — und an der gesetzten
      // Formel im Inhalt, nicht am blossen Wort .katex: Das Diagramm traegt in
      // seinem eigenen Stil-Block die Regel '#mermaid-… .node .katex path',
      // die als Inhalts-Regel (Anker .katex) mitreist.
      expect(html).not.toContain('KaTeX_');
      expect(html).not.toContain('@font-face');
      expect(inhalt).not.toMatch(/class="katex/);

      // Ruecknahme: dunkles Farbschema, Lese-Ansicht, kein Druck-Zustand.
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect(page.locator('html.printing')).toHaveCount(0);
      // Meldung ohne Fehler-Markierung.
      await expect
        .poll(() => htmlMeldungen(page))
        .toContain('Als HTML exportiert (1 Verweis ohne Ziel)');
      expect(await htmlFehlerMeldungen(page)).toEqual([]);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
    }
  });
});

test.describe('HE-02: Formeln reisen mit Stil und eingebetteten Schriften', () => {
  test('Datei mit Formel enthält KaTeX-Regeln und @font-face als Daten-Adresse', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE_FORMEL] });
    const verzeichnis = neuesZielVerzeichnis();
    const ziel = path.join(verzeichnis, 'formel.html');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .katex`).first()).toBeVisible({
        timeout: 20000,
      });

      await stubSpeichernDialog(app, { canceled: false, filePath: ziel });
      await exportiereUeberPalette(page, app);
      const html = await warteAufHtmlDatei(ziel);

      expect(html).not.toMatch(/<script/i);
      // Gesetzte Formel im Inhalt und die Regeln dazu im Stil-Block.
      expect(koerper(html)).toMatch(/class="katex/);
      // Das KaTeX-Stilblatt selbst: seine Grundregel und seine Schrift-Familien.
      expect(html).toMatch(/\.katex ?\{ ?font: ?normal 1\.21em KaTeX_Main/);
      expect(html).toContain('KaTeX_Main');
      // Schriften als Daten-Adresse, keine Verweise auf Schrift-Dateien.
      expect(html).toContain('@font-face');
      expect(html).toMatch(/url\(["']?data:font\/woff2;base64,/);
      expect(html).not.toMatch(/url\(["']?fonts\//);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
    }
  });
});

test.describe('HE-03: Mermaid-Diagramm steht als Grafik in der Datei', () => {
  test('Datei enthält das gezeichnete Diagramm als Inline-SVG', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const verzeichnis = neuesZielVerzeichnis();
    const ziel = path.join(verzeichnis, 'diagramm.html');
    try {
      await warteAufGerendertesFixture(page);
      await stubSpeichernDialog(app, { canceled: false, filePath: ziel });
      await exportiereUeberPalette(page, app);
      const inhalt = koerper(await warteAufHtmlDatei(ziel));

      // Das Diagramm-Element traegt ein <svg> mit dem gezeichneten Text.
      const block = inhalt.match(/class="[^"]*mermaid-block[^"]*"[\s\S]*?<\/svg>/);
      expect(block, 'Mermaid-Block mit Inline-SVG in der Datei').not.toBeNull();
      expect(block[0]).toMatch(/<svg[\s>]/);
      expect(block[0]).toContain('HTML-Datei');
      expect(inhalt).not.toMatch(/<script/i);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
    }
  });
});

test.describe('HE-04: Lese-Ansicht liefert das Dokument, Quelltext-Ansicht den Quelltext', () => {
  test('Ausgabe folgt der aktiven Ansicht, die Ansicht bleibt danach erhalten', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const verzeichnis = neuesZielVerzeichnis();
    const zielGerendert = path.join(verzeichnis, 'gerendert.html');
    const zielQuelltext = path.join(verzeichnis, 'quelltext.html');
    try {
      await warteAufGerendertesFixture(page);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);

      // Lese-Ansicht: das formatierte Dokument, kein Quelltext-Block.
      await stubSpeichernDialog(app, { canceled: false, filePath: zielGerendert });
      await exportiereUeberPalette(page, app);
      const gerendert = koerper(await warteAufHtmlDatei(zielGerendert));
      expect(gerendert).toMatch(/<h1[^>]*>HTML-Export-Fixture<\/h1>/);
      expect(gerendert).toMatch(/<table[\s>]/);
      expect(gerendert).not.toContain('class="pdf-source-print');

      // Quelltext-Ansicht: der Ausgabe-Block des Roh-Markdowns mit
      // Hervorhebung, keine gerenderten Elemente.
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      await stubSpeichernDialog(app, { canceled: false, filePath: zielQuelltext });
      await exportiereUeberPalette(page, app);
      const quelltext = koerper(await warteAufHtmlDatei(zielQuelltext));
      expect(quelltext).toMatch(/<div class="pdf-source-print hljs[^"]*"/);
      expect(quelltext).toContain('class="pdf-source-line"');
      expect(quelltext).toContain('HTML-Export-Fixture');
      expect(quelltext).toContain('| Alpha | 1 |');
      expect(quelltext).toContain('```mermaid');
      expect(quelltext).not.toMatch(/<h1[\s>]/);
      expect(quelltext).not.toMatch(/<table[\s>]/);
      expect(quelltext).not.toMatch(/<svg[\s>]/);

      // Ansicht unveraendert, Druck-Zustand und Ausgabe-Block abgebaut.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-source/);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect(page.locator('.pdf-source-print')).toHaveCount(0);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
    }
  });
});

test.describe('HE-05: Meldung in der Statusleiste nennt nur, was entfallen ist', () => {
  test('mit Verweis ohne Ziel die Zählung, ohne entfallene Teile nur «Als HTML exportiert»', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const verzeichnis = neuesZielVerzeichnis();
    const zielVerweis = path.join(verzeichnis, 'mit-verweis.html');
    const zielFormel = path.join(verzeichnis, 'ohne-verlust.html');
    try {
      await warteAufGerendertesFixture(page);

      // Dokument mit einem Wiki-Verweis: die Zaehlung im Zusatz.
      await zeichneMeldungenAuf(page);
      await stubSpeichernDialog(app, { canceled: false, filePath: zielVerweis });
      await exportiereUeberPalette(page, app);
      const mitVerweis = koerper(await warteAufHtmlDatei(zielVerweis));
      expect(mitVerweis.match(/class="export-verweis-ohne-ziel"/g) || []).toHaveLength(1);
      await expect
        .poll(() => htmlMeldungen(page))
        .toEqual(['Als HTML exportiert (1 Verweis ohne Ziel)']);

      // Dokument ohne entfallene Teile: die Meldung ohne Zusatz.
      await oeffneDokumentImFenster(app, page, FIXTURE_FORMEL);
      await expect(page.locator(`${SEL.markdownBody0} .katex`).first()).toBeVisible({
        timeout: 20000,
      });
      await zeichneMeldungenAuf(page);
      await stubSpeichernDialog(app, { canceled: false, filePath: zielFormel });
      await exportiereUeberPalette(page, app);
      const ohneVerlust = koerper(await warteAufHtmlDatei(zielFormel));
      expect(ohneVerlust).not.toContain('export-verweis-ohne-ziel');
      expect(ohneVerlust).not.toContain('export-bild-fehlt');
      await expect.poll(() => htmlMeldungen(page)).toEqual(['Als HTML exportiert']);
      expect(await htmlFehlerMeldungen(page)).toEqual([]);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
    }
  });
});

test.describe('HE-06: Abbruch im Zielpfad-Dialog', () => {
  test('Abbruch schreibt nichts und meldet nichts', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const verzeichnis = neuesZielVerzeichnis();
    const vorschlag = path.join(FIXTURE_DIR, 'html-export.html');
    const ziel = path.join(verzeichnis, 'nach-abbruch.html');
    try {
      await warteAufGerendertesFixture(page);
      expect(fs.existsSync(vorschlag)).toBe(false);

      await zeichneMeldungenAuf(page);
      await stubSpeichernDialog(app, { canceled: true });
      await exportiereUeberPalette(page, app);
      // Der Dialog schlug <Name>.html neben dem Dokument vor.
      expect(path.resolve(await dialogVorschlag(app))).toBe(vorschlag);

      // Ein zweiter Export danach laeuft nur an, wenn der abgebrochene
      // vollstaendig beendet ist (Reentranz-Schutz der Druck-Vorbereitung);
      // erst damit ist das Ausbleiben von Datei und Meldung eine Aussage.
      await stubSpeichernDialog(app, { canceled: false, filePath: ziel });
      await exportiereUeberPalette(page, app);
      await warteAufHtmlDatei(ziel);
      await expect
        .poll(() => htmlMeldungen(page))
        .toEqual(['Als HTML exportiert (1 Verweis ohne Ziel)']);

      // Der Abbruch hat keine Datei geschrieben und nichts gemeldet: Im
      // Ziel-Verzeichnis liegt allein die Datei des zweiten Laufs, neben
      // dem Dokument keine, und die einzige Meldung ist die des zweiten.
      expect(fs.readdirSync(verzeichnis)).toEqual(['nach-abbruch.html']);
      expect(fs.existsSync(vorschlag)).toBe(false);
      expect(await htmlFehlerMeldungen(page)).toEqual([]);
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
    }
  });
});

test.describe('HE-07: Großes Dokument wird vollständig ausgegeben', () => {
  test('2000 Absätze stehen in der Datei, der Bildlauf steht danach wie vorher', async () => {
    const quelle = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-html-e2e-gross-'));
    const dokument = path.join(quelle, 'grosses-dokument.md');
    const absaetze = Array.from(
      { length: 2000 },
      (_, i) => `Absatz ${String(i + 1).padStart(4, '0')} des großen Dokuments.`,
    );
    fs.writeFileSync(dokument, `# Großes Dokument\n\n${absaetze.join('\n\n')}\n`, 'utf8');
    const { app, page, userData } = await launchApp({ args: [dokument] });
    const verzeichnis = neuesZielVerzeichnis();
    const ziel = path.join(verzeichnis, 'gross.html');
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(
        page.locator(`${SEL.markdownBody0} p`, { hasText: 'Absatz 2000 des großen Dokuments.' }),
      ).toHaveCount(1, { timeout: 20000 });

      // Bildlauf in die Mitte des Dokuments; er gehoert zum Zustand, den
      // der Export zuruecklassen muss.
      const bildlaufVorher = await page.locator(SEL.paneRendered0).evaluate((el) => {
        el.scrollTop = Math.floor(el.scrollHeight / 2);
        return el.scrollTop;
      });
      expect(bildlaufVorher).toBeGreaterThan(0);

      await stubSpeichernDialog(app, { canceled: false, filePath: ziel });
      await exportiereUeberPalette(page, app);
      const inhalt = koerper(await warteAufHtmlDatei(ziel));

      const zeilen = inhalt.match(/Absatz \d{4} des großen Dokuments\./g) || [];
      expect(zeilen).toHaveLength(2000);
      expect(zeilen[0]).toBe('Absatz 0001 des großen Dokuments.');
      expect(zeilen[1999]).toBe('Absatz 2000 des großen Dokuments.');

      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect
        .poll(() => page.locator(SEL.paneRendered0).evaluate((el) => el.scrollTop))
        .toBe(bildlaufVorher);
    } finally {
      raeumeAuf(verzeichnis);
      await closeApp(app, userData);
      raeumeAuf(quelle);
    }
  });
});

test.describe('HE-08: Fehlerpfad (Zielpfad nicht schreibbar)', () => {
  test('Schreibfehler meldet rot, keine Datei, Farbschema und Ansicht wie vorher', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      settings: STANDARD_SCHEMES,
    });
    const fehlt = path.join(os.tmpdir(), `scg-html-e2e-fehlt-${Date.now()}`);
    const ziel = path.join(fehlt, 'x', 'aus.html');
    try {
      await warteAufGerendertesFixture(page);
      await page.evaluate(() => window.api.setThemePref('dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      await zeichneMeldungenAuf(page);
      await stubSpeichernDialog(app, { canceled: false, filePath: ziel });
      await exportiereUeberPalette(page, app);
      await expect
        .poll(() => htmlFehlerMeldungen(page), { timeout: 15000 })
        .toEqual([expect.stringMatching(/^HTML-Export fehlgeschlagen: .+/)]);

      // Keine Datei, und die Anwendung steht wie vorher.
      expect(fs.existsSync(ziel)).toBe(false);
      expect(fs.existsSync(fehlt)).toBe(false);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator(SEL.content0)).toHaveClass(/view-rendered/);
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect(page.locator('html.printing')).toHaveCount(0);
    } finally {
      raeumeAuf(fehlt);
      await closeApp(app, userData);
    }
  });
});
