// 4T-001959 (Epic 3E-000319): Ablauf-Fälle der dritten Ausbaustufe der
// Kanban-Tafel — Einstellungen der Tafel samt globaler Vorgabe und Archiv,
// Notiz aus einer Karte, Angaben der verlinkten Notiz, Verweis-Klick,
// Datums-Klick zur Tagesnotiz und der Aus-Zustand der Erweiterung (AK1, AK2
// des Tasks). Die Kennungen setzen die der ersten beiden Stufen fort (KB-01
// bis KB-14 in kanban-tafel.spec.js, kanban-ziehen.spec.js und
// kanban-angaben.spec.js).
//
// **Warum diese Fälle gegen die echte Anwendung laufen.** Die Funktionen der
// Stufe laufen über beide Prozesse: der Dialog über Menü-Kanal und
// Kontextmenü, die Vorgaben über die Einstellungs-Verteilung, die Notiz über
// Vorlagen-Liste, Anlage und Öffnen im Hauptprozess, die Angaben über den
// Lese-Kanal zum Kopf der verlinkten Notiz, das Datum über den Journal-Weg des
// Bereichs. Die Unit-Prüfungen stellen jede dieser Nahtstellen durch einen
// Nachbarn nach; die Kette sieht erst der Lauf.
//
// **Jeder schreibende Fall endet an der Datei auf der Platte**, ausgewertet am
// rohen Text und ausdrücklich nicht über den Format-Kern (Muster der Vorbild-
// Dateien). Die Einstellungen der Tafel stehen im Einstellungs-Block am
// Dateiende; ein Fall, der einen Schlüssel setzt und wieder zurücknimmt, endet
// byte-gleich mit dem Ausgang.
//
// **Ausgangs-Zustand als Bedingung:** Bearbeiten-Modus, Tafel-Ansicht, die
// Einstellung in bekannter Stellung und, wo nötig, ein Bereich mit
// Tages-Journal werden hergestellt und an der Zeichnung belegt, bevor ein Fall
// handelt.
//
// describe-Titel tragen die Matrix-Kennungen der beiden Katalog-Zeilen der
// Stufe 3 (4T-001960): F-330 «Einstellungen der Tafel» für KB-15 bis KB-17,
// F-331 «Karten und Notizen» für KB-18 bis KB-23, KB-24 beide.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { warteAufText } = require('../helpers/dateien');
const {
  bedieneBis,
  oeffneEinstellungsSeite,
  pressUntilVisible,
  EINSTELLUNGS_SEITE,
} = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const TAFEL = `${PANE0} .pane-kanban .kanban-tafel`;
const SPALTEN = `${TAFEL} .kanban-spalte`;
const KARTEN = `${TAFEL} .kanban-karte`;
const KONTEXTMENUE = '#context-menu';
const DIALOG = '.kanban-einstellungen-modal';
const WAEHLER = '#date-picker-popup';
const PALETTE = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';

// Der Einstellungs-Block des Vorbild-Werkzeugs mit den Grund-Schlüsseln.
const GRUND_BLOCK = '{"kanban-plugin":"board","list-collapse":[false,false]}';

// Eine Tafel aus Karten-Zeilen in «Offen», einer leeren Spalte «Fertig» mit
// Erledigt-Kennzeichen und, wenn angegeben, dem Einstellungs-Block am Ende.
// Die Leerzeilen-Form folgt den echten Tafeln (Muster kanban-angaben.spec.js).
function tafelText(karten, blockJson = GRUND_BLOCK) {
  const zeilen = [
    '---',
    'kanban-plugin: board',
    '---',
    '',
    '## Offen',
    '',
    ...karten,
    '',
    '',
    '## Fertig',
    '',
    '**Fertiggestellt**',
    '',
    '',
  ];
  if (blockJson) zeilen.push('', '', '%% kanban:settings', '```', blockJson, '```', '%%');
  return zeilen.join('\n');
}

// Der Block mit zusätzlichen Schlüsseln, in der Reihenfolge der Angabe.
function blockMit(zusatz) {
  return JSON.stringify({ 'kanban-plugin': 'board', 'list-collapse': [false, false], ...zusatz });
}

// Die JSON-Zeile des Einstellungs-Blocks, roh gelesen.
function blockZeile(text) {
  const zeilen = text.split('\n');
  const marke = zeilen.indexOf('%% kanban:settings');
  return marke < 0 ? null : zeilen[marke + 2];
}

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1959-'));
}

function raeumeAuf(...dirs) {
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
    }
  }
}

function schreibe(dir, name, inhalt) {
  const datei = path.join(dir, name);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, inhalt, 'utf8');
  return datei;
}

// Ein kräftig rotes PNG von 48 × 48 Pixeln — sichtbar, falls jemand den Lauf
// ansieht (test/README.md, Material für Sicht-Prüfungen).
function schreibePng(datei) {
  const seite = 48;
  const chunk = (typ, daten) => {
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(daten.length);
    const inhalt = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
    const pruef = Buffer.alloc(4);
    pruef.writeUInt32BE(zlib.crc32(inhalt) >>> 0);
    return Buffer.concat([laenge, inhalt, pruef]);
  };
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(seite, 0);
  kopf.writeUInt32BE(seite, 4);
  kopf.set([8, 2, 0, 0, 0], 8);
  const zeile = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(seite * 3, Buffer.from([220, 0, 0])),
  ]);
  const roh = Buffer.concat(Array.from({ length: seite }, () => zeile));
  fs.writeFileSync(
    datei,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', kopf),
      chunk('IDAT', zlib.deflateSync(roh)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

// Der heutige Kalendertag in lokaler Zeit (Muster kanban-angaben.spec.js).
function heute() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
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

// Gesendet wird, bis die Wirkung eintritt — nur für das Öffnen der Ansicht,
// dessen Wiederholung dieselbe Wirkung hat (Muster kanban-angaben.spec.js).
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

async function oeffneTafel(app, page) {
  await sendeBis(app, 'menu:viewChange', () => page.locator(TAFEL).isVisible(), ['kanban']);
}

async function macheAenderbar(page) {
  await bedieneBis(page.locator(SEL.btnEdit), async () => {
    const wert = await page.locator(TAFEL).getAttribute('data-aenderbar');
    return wert === 'true';
  });
}

// Einmal speichern und warten, bis die Datei die Bedingung erfüllt — bewusst
// nicht gepollt gesendet (Begründung in kanban-angaben.spec.js, `speichere`).
async function speichere(app, datei, bedingung) {
  await sendeMenuKanal(app, 'menu:save');
  await expect.poll(() => bedingung(fs.readFileSync(datei, 'utf8')), { timeout: 15000 }).toBe(true);
  return fs.readFileSync(datei, 'utf8');
}

// Eine Datei in das Fenster öffnen, über den Kanal, den der Hauptprozess für
// eine von außen übergebene Datei nutzt (Muster profil-bereich.js).
async function oeffneDatei(app, page, datei, titel) {
  await sendeMenuKanal(app, 'file:openExternal', [datei]);
  await expect(page.locator(SEL.activeTab0)).toContainText(titel);
}

// Zurück zum Reiter der Tafel; die Tafel-Ansicht ist am Dokument gemerkt.
async function zurueckZurTafel(page, titel = 'Tafel') {
  await page.locator(SEL.tabs0, { hasText: titel }).first().click();
  await expect(page.locator(SEL.activeTab0)).toContainText(titel);
  await expect(page.locator(TAFEL)).toBeVisible();
}

function karte(spalte, nr) {
  return `${KARTEN}[data-spalte="${spalte}"][data-karte="${nr}"]`;
}

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

async function kontextmenue(page, ziel, eintrag) {
  await page.locator(ziel).click({ button: 'right' });
  const punkt = page.locator(`${KONTEXTMENUE} [data-menu-id="${eintrag}"]`);
  await expect(punkt).toBeVisible();
  await punkt.click();
}

// Den Dialog «Einstellungen dieser Tafel…» über den Menü-Kanal öffnen — den
// Kanal, den der Eintrag im Untermenü «Ansicht → Kanban-Tafel» sendet. Einmal
// gesendet: Die Menü-Listener stehen, weil die Tafel-Ansicht bereits über
// denselben Weg geöffnet ist.
async function oeffneDialogUeberMenue(app, page) {
  await sendeMenuKanal(app, 'menu:kanbanBoardSettings');
  await expect(page.locator(DIALOG)).toBeVisible();
}

async function uebernimm(page) {
  await page.locator(`${DIALOG} [data-aktion="uebernehmen"]`).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);
}

test.describe('KB-15: Einstellungen dieser Tafel setzen, zurücksetzen und rückgängig machen (F-330)', () => {
  test('der Block trägt allein den geänderten Schlüssel, die Karte zeigt die Wirkung, ein Rückgängig-Schritt nimmt ein Übernehmen zurück', async () => {
    const dir = machVerzeichnis();
    const tag = heute();
    const vorher = tafelText(['- [ ] Bericht lesen #projekt', `- [ ] Heute fällig 📅 ${tag}`]);
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      const fuss = page.locator(`${karte(0, 0)} .kanban-karte-tags`);
      const termin = page.locator(`${karte(0, 1)} .task-marker-due`);
      await expect(fuss).toHaveCount(0);
      await expect(termin).toHaveText(`📅 ${tag}`);

      // --- Über das Menü: «Tags am Kartenfuß» auf «an» -----------------------
      await oeffneDialogUeberMenue(app, page);
      const tags = page.locator('#kanban-einstellung-tagsAmFuss');
      await expect(tags).toHaveValue('vorgabe');
      await expect(tags.locator('option[value="vorgabe"]')).toHaveText('wie Vorgabe (aus)');
      await tags.selectOption('an');
      await uebernimm(page);
      await expect(fuss.locator('.tag-link')).toHaveText('#projekt');
      let text = await speichere(app, datei, (t) => t.includes('"move-tags"'));
      expect(blockZeile(text)).toBe(blockMit({ 'move-tags': true }));
      expect(text).toBe(vorher.replace(GRUND_BLOCK, blockMit({ 'move-tags': true })));

      // --- Über das Kontextmenü des Spalten-Kopfs: zurück auf «wie Vorgabe» --
      await kontextmenue(
        page,
        `${SPALTEN}[data-spalte="0"] .kanban-spalte-kopf`,
        'kanban-board-settings',
      );
      await expect(page.locator(DIALOG)).toBeVisible();
      await expect(tags).toHaveValue('an');
      await tags.selectOption('vorgabe');
      await uebernimm(page);
      await expect(fuss).toHaveCount(0);
      text = await speichere(app, datei, (t) => !t.includes('"move-tags"'));
      expect(text).toBe(vorher);

      // --- Zwei Änderungen in einem Übernehmen, ein Rückgängig-Schritt -------
      await oeffneDialogUeberMenue(app, page);
      await tags.selectOption('an');
      await page.locator('#kanban-einstellung-termineRelativ').selectOption('an');
      await uebernimm(page);
      await expect(fuss.locator('.tag-link')).toHaveText('#projekt');
      await expect(termin).toHaveText('📅 heute');
      text = await speichere(app, datei, (t) => t.includes('"show-relative-date"'));
      expect(blockZeile(text)).toBe(blockMit({ 'move-tags': true, 'show-relative-date': true }));

      // Rückgängig gehört der Fläche: Die Tafel muss den Fokus haben.
      await page.locator(`${karte(0, 1)} .kanban-karte-inhalt`).click();
      await expect(page.locator(karte(0, 1))).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Control+z');
      await expect(fuss).toHaveCount(0);
      await expect(termin).toHaveText(`📅 ${tag}`);
      text = await speichere(app, datei, (t) => !t.includes('"move-tags"'));
      expect(text).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-16: globale Vorgabe im Abschnitt «Kanban-Tafel» der Einstellungen (F-330)', () => {
  test('eine Tafel ohne eigene Einstellung folgt der Vorgabe, eine Tafel mit eigener nicht', async () => {
    const dir = machVerzeichnis();
    const ohne = tafelText(['- [ ] Erste Karte #projekt']);
    const mit = tafelText(['- [ ] Zweite Karte #projekt'], blockMit({ 'move-tags': false }));
    const dateiOhne = schreibe(dir, 'Tafel ohne Einstellung.md', ohne);
    const dateiMit = schreibe(dir, 'Tafel mit Einstellung.md', mit);
    const { app, page, userData } = await launchApp({ args: [dateiOhne] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      const fuss = page.locator(`${karte(0, 0)} .kanban-karte-tags`);
      await expect(fuss).toHaveCount(0);

      // --- Vorgabe «Tags am Kartenfuß» einschalten -----------------------------
      await oeffneEinstellungsSeite(page);
      await page
        .locator(`${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="kanban"]`)
        .click();
      const schalter = page.locator('#settings-kanban-tagsAmFuss');
      await expect(schalter).not.toBeChecked();
      await schalter.check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();

      await zurueckZurTafel(page, 'Tafel ohne Einstellung');
      await expect(fuss.locator('.tag-link')).toHaveText('#projekt');

      // --- Die Tafel mit eigener Einstellung bleibt bei «aus» ---------------------
      await oeffneDatei(app, page, dateiMit, 'Tafel mit Einstellung');
      await expect(page.locator(TAFEL)).toBeHidden();
      await oeffneTafel(app, page);
      await expect(page.locator(karte(0, 0))).toContainText('Zweite Karte');
      await expect(fuss).toHaveCount(0);
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-inhalt .tag-link`)).toHaveText(
        '#projekt',
      );

      // Die Vorgabe schreibt in keine Tafel.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(dateiOhne, 'utf8')).toBe(ohne);
      expect(fs.readFileSync(dateiMit, 'utf8')).toBe(mit);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-17: das Archiv folgt den Einstellungen der Tafel (F-330)', () => {
  test('ohne Zeitstempel und mit Obergrenze 1 bleibt allein die zuletzt archivierte Karte', async () => {
    const dir = machVerzeichnis();
    const block = blockMit({ 'archive-with-date': false, 'max-archive-size': 1 });
    const vorher = tafelText(
      ['- [ ] Erste Karte', '- [ ] Zweite Karte', '- [ ] Dritte Karte'],
      block,
    );
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(KARTEN)).toHaveCount(3);

      await kontextmenue(page, `${karte(0, 0)} .kanban-karte-inhalt`, 'kanban-card-archive');
      await expect(page.locator(KARTEN)).toHaveCount(2);
      await expect(page.locator(karte(0, 0))).toContainText('Zweite Karte');
      await kontextmenue(page, `${karte(0, 0)} .kanban-karte-inhalt`, 'kanban-card-archive');
      await expect(page.locator(KARTEN)).toHaveCount(1);

      const text = await speichere(
        app,
        datei,
        (t) => t.includes('## Archiv') && !t.includes('Erste Karte'),
      );
      const zeilen = text.split('\n');
      expect(kartenZeilen(text, 'Offen')).toEqual(['- [ ] Dritte Karte']);
      const trenner = zeilen.indexOf('***');
      expect(zeilen.slice(trenner, trenner + 5)).toEqual([
        '***',
        '',
        '## Archiv',
        '',
        '- [ ] Zweite Karte',
      ]);
      // Allein die zuletzt archivierte Karte, ohne Zeitstempel; die erste ist
      // über die Obergrenze hinausgefallen.
      expect(kartenZeilen(text, 'Archiv')).toEqual(['- [ ] Zweite Karte']);
      expect(text).not.toContain('Erste Karte');
      expect(blockZeile(text)).toBe(block);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-18: Notiz aus Karte mit Zielordner und Vorlage der Tafel (F-331)', () => {
  test('die Notiz entsteht gefüllt im Zielordner, die Karte trägt den Verweis, Rückgängig lässt die Datei stehen', async () => {
    const dir = machVerzeichnis();
    const vorlagen = machVerzeichnis();
    schreibe(vorlagen, 'Karten-Notiz.md', '---\ntyp: karte\n---\n# {{title}}\n\nAus der Tafel.\n');
    fs.mkdirSync(path.join(dir, 'Notizen'));
    const zeile = '- [ ] Angebot schreiben #kunde 📅 2026-10-02';
    const vorher = tafelText(
      [zeile, '- [ ] Zweite Karte'],
      blockMit({ 'new-note-folder': 'Notizen', 'new-note-template': 'Karten-Notiz.md' }),
    );
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const notiz = path.join(dir, 'Notizen', 'Angebot schreiben.md');
    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: { language: 'de', templates: { folder: vorlagen } },
    });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);

      await kontextmenue(page, `${karte(0, 0)} .kanban-karte-inhalt`, 'kanban-card-note');
      // Ohne Rückfrage: Ordner und Vorlage kommen aus der Tafel.
      const inhalt = await warteAufText(notiz, '# Angebot schreiben');
      expect(inhalt).toContain('typ: karte');
      expect(inhalt).toContain('Aus der Tafel.');
      expect(inhalt).not.toContain('{{title}}');
      // Die Notiz öffnet sich in einem eigenen Dokument, die Tafel bleibt offen.
      await expect(page.locator(SEL.activeTab0)).toContainText('Angebot schreiben');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      await zurueckZurTafel(page);
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-inhalt a.wikilink`)).toHaveText(
        'Angebot schreiben',
      );
      const neu = '- [ ] [[Angebot schreiben]] #kunde 📅 2026-10-02';
      let text = await speichere(app, datei, (t) => t.includes('[[Angebot schreiben]]'));
      expect(kartenZeilen(text, 'Offen')).toEqual([neu, '- [ ] Zweite Karte']);
      expect(text).toBe(vorher.replace(zeile, neu));

      // --- Rückgängig: der Kartentext kommt zurück, die Datei bleibt -----------
      await page.locator(`${karte(0, 1)} .kanban-karte-inhalt`).click();
      await expect(page.locator(karte(0, 1))).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Control+z');
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-inhalt`)).toContainText(
        'Angebot schreiben',
      );
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-inhalt a.wikilink`)).toHaveCount(0);
      text = await speichere(app, datei, (t) => !t.includes('[[Angebot schreiben]]'));
      expect(text).toBe(vorher);
      expect(fs.readFileSync(notiz, 'utf8')).toBe(inhalt);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir, vorlagen);
    }
  });
});

test.describe('KB-19: Notiz aus Karte ohne Einstellung, bei gleichem Namen (F-331)', () => {
  test('verweisen legt nichts an, ein anderer Name führt in die Auswahl mit «Keine Vorlage»', async () => {
    const dir = machVerzeichnis();
    const vorlagen = machVerzeichnis();
    schreibe(vorlagen, 'Besprechung.md', '# {{title}}\n\nBesprechung.\n');
    const vorhandenA = schreibe(dir, 'Angebot schreiben.md', 'Vorhanden A.\n');
    const vorhandenB = schreibe(dir, 'Rechnung prüfen.md', 'Vorhanden B.\n');
    const vorher = tafelText(['- [ ] Angebot schreiben', '- [ ] Rechnung prüfen']);
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const neueNotiz = path.join(dir, 'Rechnung prüfen 2.md');
    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: { language: 'de', templates: { folder: vorlagen } },
    });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      const auswahl = page.locator('#template-select-modal');

      // --- Weg 1: auf das vorhandene Dokument verweisen --------------------------
      await kontextmenue(page, `${karte(0, 0)} .kanban-karte-inhalt`, 'kanban-card-note');
      await expect(auswahl).toBeVisible();
      await expect(page.locator('#template-select-title')).toHaveText(
        'Es gibt bereits ein Dokument «Angebot schreiben». Wie soll es weitergehen?',
      );
      await page
        .locator('#template-select-list button', {
          hasText: 'Auf das vorhandene Dokument verweisen',
        })
        .click();
      await expect(auswahl).toBeHidden();
      await expect(page.locator(`${karte(0, 0)} .kanban-karte-inhalt a.wikilink`)).toHaveText(
        'Angebot schreiben',
      );
      // Nichts angelegt, nichts geöffnet.
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      expect(fs.readFileSync(vorhandenA, 'utf8')).toBe('Vorhanden A.\n');

      // --- Weg 2: einen anderen Namen wählen, dann «Keine Vorlage» --------------
      await kontextmenue(page, `${karte(0, 1)} .kanban-karte-inhalt`, 'kanban-card-note');
      await expect(auswahl).toBeVisible();
      await page
        .locator('#template-select-list button', { hasText: 'Anderen Namen wählen…' })
        .click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await expect(page.locator('#name-input-field')).toHaveValue('Rechnung prüfen');
      await page.locator('#name-input-field').fill('Rechnung prüfen 2');
      await page.locator('#btn-name-input-ok').click();
      const picker = page.locator('#template-picker-modal');
      await expect(picker).toBeVisible();
      const eintraege = page.locator('#template-picker-list button');
      await expect(eintraege.first()).toHaveText('Keine Vorlage (leere Notiz)');
      await expect(
        page.locator('#template-picker-list button', { hasText: 'Besprechung' }),
      ).toHaveCount(1);
      await eintraege.first().click();
      await expect(picker).toBeHidden();
      await expect.poll(() => fs.existsSync(neueNotiz)).toBe(true);
      expect(fs.readFileSync(neueNotiz, 'utf8')).toBe('');
      expect(fs.readFileSync(vorhandenB, 'utf8')).toBe('Vorhanden B.\n');
      await expect(page.locator(SEL.activeTab0)).toContainText('Rechnung prüfen 2');

      await zurueckZurTafel(page);
      const text = await speichere(app, datei, (t) => t.includes('[[Rechnung prüfen 2]]'));
      expect(kartenZeilen(text, 'Offen')).toEqual([
        '- [ ] [[Angebot schreiben]]',
        '- [ ] [[Rechnung prüfen 2]]',
      ]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir, vorlagen);
    }
  });
});

test.describe('KB-20: Angaben der verlinkten Notiz auf der Karte (F-331)', () => {
  test('Feldwahl setzen zeigt Name und Wert, verborgenen Namen, Bild und gekürzten Wert; eine geänderte Notiz erscheint nach der Rückkehr', async () => {
    const dir = machVerzeichnis();
    const lang = `Beginn ${'eine lange Beschreibung der Arbeit '.repeat(12)}Ende`;
    schreibePng(path.join(dir, 'bild.png'));
    const notiz = schreibe(
      dir,
      'Projekt A.md',
      [
        '---',
        'status: offen',
        'kunde: Müller',
        'bild: bild.png',
        `text: ${lang}`,
        '---',
        '',
        'Inhalt.',
        '',
      ].join('\n'),
    );
    const vorher = tafelText([
      '- [ ] Arbeit an [[Projekt A]]',
      '- [ ] Verweis auf [[Gibt es nicht]]',
      '- [ ] Ohne Verweis',
    ]);
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      // Ohne Feldwahl: keine Angaben.
      await expect(page.locator(`${KARTEN} .kanban-karte-angaben`)).toHaveCount(0);

      // --- Feldwahl im Dialog setzen ---------------------------------------------
      await oeffneDialogUeberMenue(app, page);
      const felder = [
        ['status', 'Status', false],
        ['kunde', '', true],
        ['bild', 'Bild', false],
        ['text', 'Text', false],
      ];
      for (const [nr, [schluessel, name, verbergen]] of felder.entries()) {
        await page.locator(`${DIALOG} [data-aktion="feld-hinzufuegen"]`).click();
        const feld = page.locator(`${DIALOG} .kanban-einstellungen-feld`).nth(nr);
        await feld.locator('[data-teil="feld"]').fill(schluessel);
        await feld.locator('[data-teil="bezeichnung"]').fill(name);
        if (verbergen) await feld.locator('[data-teil="verbergen"]').check();
      }
      await expect(page.locator('#kanban-einstellung-feldwahl')).toHaveValue('eigen');
      await uebernimm(page);

      const angaben = page.locator(`${karte(0, 0)} .kanban-karte-angaben .kanban-angabe`);
      await expect(angaben).toHaveCount(4);
      await expect(angaben.nth(0)).toHaveText('Status: offen');
      await expect(angaben.nth(1)).toHaveText('Müller');
      await expect(angaben.nth(1).locator('.kanban-angabe-name')).toHaveCount(0);
      const bild = angaben.nth(2).locator('img.kanban-angabe-bild');
      await expect(bild).toHaveAttribute('src', /^data:image\/png/);
      await expect(bild).toHaveAttribute('alt', 'Bild');
      // Der lange Wert ist gekürzt; der volle Wert steht im Hinweistext.
      await expect(angaben.nth(3)).toHaveAttribute('title', `Text: ${lang}`);
      expect(await angaben.nth(3).evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(
        true,
      );
      // Fehlendes Ziel und Karte ohne Verweis: nichts, und keine Meldung (die
      // Konsole prüft der Start-Helfer bei jedem Fall).
      await expect(page.locator(`${karte(0, 1)} .kanban-karte-angaben`)).toHaveCount(0);
      await expect(page.locator(`${karte(0, 2)} .kanban-karte-angaben`)).toHaveCount(0);

      const text = await speichere(app, datei, (t) => t.includes('"metadata-keys"'));
      expect(JSON.parse(blockZeile(text))['metadata-keys']).toEqual([
        { metadataKey: 'status', label: 'Status', shouldHideLabel: false, containsMarkdown: false },
        { metadataKey: 'kunde', label: '', shouldHideLabel: true, containsMarkdown: false },
        { metadataKey: 'bild', label: 'Bild', shouldHideLabel: false, containsMarkdown: false },
        { metadataKey: 'text', label: 'Text', shouldHideLabel: false, containsMarkdown: false },
      ]);
      // Die verlinkte Notiz wird nur gelesen.
      expect(fs.readFileSync(notiz, 'utf8')).toContain('status: offen');

      // --- Notiz ändern und zur Tafel zurückkehren -------------------------------
      await oeffneDatei(app, page, notiz, 'Projekt A');
      await bedieneBis(page.locator(SEL.btnEdit), async () => {
        const klasse = (await page.locator(SEL.paneSourceEditor0).getAttribute('class')) || '';
        return !klasse.includes('read-only');
      });
      await bedieneBis(page.locator(SEL.viewBtn('source')), () =>
        page.locator(SEL.editorContent0).isVisible(),
      );
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      for (let i = 0; i < 'offen'.length; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('erledigt');
      await speichere(app, notiz, (t) => t.includes('status: erledigt'));

      await zurueckZurTafel(page);
      await expect(angaben.nth(0)).toHaveText('Status: erledigt');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-21: Verweis auf der Karte öffnet sein Ziel (F-331)', () => {
  test('der Klick öffnet das Ziel ohne Wahl der Karte, auch im nicht änderbaren Dokument; der Doppelklick öffnet keine Eingabe', async () => {
    const dir = machVerzeichnis();
    schreibe(dir, 'Ziel-Notiz.md', '# Ziel-Notiz\n\nAngekommen.\n');
    const vorher = tafelText([
      '- [ ] Siehe [[Ziel-Notiz|Anzeige-Text]] bitte',
      '- [ ] Zweite Karte',
    ]);
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      // Ausgangs-Zustand: nicht änderbar.
      await expect(page.locator(TAFEL)).toHaveAttribute('data-aenderbar', 'false');
      const verweis = page.locator(`${karte(0, 0)} .kanban-karte-inhalt a.wikilink`);
      await expect(verweis).toHaveText('Anzeige-Text');

      await verweis.click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel-Notiz');
      await expect(page.locator(SEL.markdownBody0)).toContainText('Angekommen.');

      // --- Im Bearbeiten-Modus: keine Wahl, keine Eingabe ------------------------
      await zurueckZurTafel(page);
      await macheAenderbar(page);
      await expect(page.locator(karte(0, 0))).not.toHaveAttribute('aria-selected', 'true');
      await verweis.dblclick();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel-Notiz');
      await zurueckZurTafel(page);
      await expect(page.locator(`${TAFEL} .kanban-karte-eingabe`)).toHaveCount(0);
      await expect(page.locator(karte(0, 0))).not.toHaveAttribute('aria-selected', 'true');

      // Das Tafel-Dokument bleibt unberührt.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Bereichs-Wurzel mit einem Tages-Journal (Muster journale.spec.js).
function machBereichMitJournal() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1959-bereich-'));
  const journale = {
    shelves: ['Tagebuch'],
    journals: [
      {
        id: 'tag',
        name: 'Tag',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'Journal',
        namePattern: '{{date}}',
      },
    ],
  };
  schreibe(
    wurzel,
    'Area_Settings.mdda',
    JSON.stringify({ schemaVersion: 1, settings: { journals: journale } }, null, 2) + '\n',
  );
  return wurzel;
}

test.describe('KB-22: Karten-Datum öffnet den Journal-Eintrag des Tages (F-331)', () => {
  test('mit Einstellung trägt das Abzeichen den Verweis-Stil und legt den Eintrag an; ohne öffnet es den Kalender-Wähler', async () => {
    const wurzel = machBereichMitJournal();
    const vorher = tafelText(
      ['- [ ] Termin-Karte 📅 2026-10-02', '- [ ] Ohne Datum'],
      blockMit({ 'link-date-to-daily-note': true }),
    );
    const datei = schreibe(wurzel, 'Tafel.md', vorher);
    const eintrag = path.join(wurzel, 'Journal', '2026-10-02.md');
    const { app, page, userData } = await launchApp();
    try {
      await expect
        .poll(async () => {
          const r = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
          return !!(r && r.ok !== false);
        })
        .toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');
      await oeffneDatei(app, page, datei, 'Tafel');
      await oeffneTafel(app, page);
      const abzeichen = page.locator(`${karte(0, 0)} .task-marker-due`);
      await expect(abzeichen).toHaveClass(/kanban-datum-verweis/);
      await expect(abzeichen).toHaveAttribute('title', /Journal-Eintrag des Tages öffnen/);
      await expect(page.locator(`${karte(0, 1)} .task-marker-due`)).toHaveCount(0);

      // --- Klick im nicht änderbaren Dokument: der Eintrag entsteht und öffnet sich
      expect(fs.existsSync(eintrag)).toBe(false);
      await abzeichen.click();
      await expect.poll(() => fs.existsSync(eintrag)).toBe(true);
      await expect(page.locator(SEL.activeTab0)).toContainText('2026-10-02');
      await expect(page.locator(WAEHLER)).toBeHidden();
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);

      // --- Einstellung aus: der Klick öffnet den Kalender-Wähler ------------------
      await zurueckZurTafel(page);
      await macheAenderbar(page);
      await oeffneDialogUeberMenue(app, page);
      const wahl = page.locator('#kanban-einstellung-datumZurTagesnotiz');
      await expect(wahl).toHaveValue('an');
      await wahl.selectOption('aus');
      await uebernimm(page);
      await expect(abzeichen).not.toHaveClass(/kanban-datum-verweis/);
      await abzeichen.click();
      await expect(page.locator(WAEHLER)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(WAEHLER)).toBeHidden();
      const text = await speichere(app, datei, (t) =>
        t.includes('"link-date-to-daily-note":false'),
      );
      expect(text).toBe(
        vorher.replace('"link-date-to-daily-note":true', '"link-date-to-daily-note":false'),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(wurzel);
    }
  });
});

test.describe('KB-23: Karten-Datum einer Tafel außerhalb eines Bereichs (F-331)', () => {
  test('trotz Einstellung kein Verweis-Stil und keine Meldung; der Klick öffnet den Kalender-Wähler', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText(
      ['- [ ] Termin-Karte 📅 2026-10-02'],
      blockMit({ 'link-date-to-daily-note': true }),
    );
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      const abzeichen = page.locator(`${karte(0, 0)} .task-marker-due`);
      await expect(abzeichen).toHaveText('📅 2026-10-02');
      await abzeichen.click();
      // Der Klick nimmt den Weg des Wählers und nicht den des Verweises.
      await expect(page.locator(WAEHLER)).toBeVisible();
      await expect(abzeichen).not.toHaveClass(/kanban-datum-verweis/);
      await expect(page.locator('#statusbar-hint')).toHaveText('');
      await page.keyboard.press('Escape');
      await expect(page.locator(WAEHLER)).toBeHidden();
      expect(fs.readdirSync(dir)).toEqual(['Tafel.md']);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Die Erweiterung «Kanban» über den Einstellungs-Bereich schalten (Muster
// KB-05 in kanban-tafel.spec.js).
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

async function paletteTreffer(page, text) {
  await pressUntilVisible(page, 'Control+k', page.locator(PALETTE));
  await page.locator(PALETTE_FILTER).fill(text);
  const anzahl = await page.locator(PALETTE_ITEM, { hasText: text }).count();
  await page.keyboard.press('Escape');
  await expect(page.locator(PALETTE)).toBeHidden();
  return anzahl;
}

test.describe('KB-24: Erweiterung «Kanban» aus — Abschnitt und Kommandos der Stufe (F-330, F-331)', () => {
  test('der Abschnitt «Kanban-Tafel» der Einstellungen und die beiden Kommandos verschwinden', async () => {
    const dir = machVerzeichnis();
    const vorher = tafelText(['- [ ] Erste Karte']);
    const datei = schreibe(dir, 'Tafel.md', vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    const abschnitt = page.locator(
      `${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="kanban"]`,
    );
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await page.locator(`${karte(0, 0)} .kanban-karte-inhalt`).click();

      // Gegenprobe im An-Zustand: Abschnitt und Kommandos sind da.
      expect(await paletteTreffer(page, 'Einstellungen dieser Tafel')).toBe(1);
      expect(await paletteTreffer(page, 'Notiz aus Karte erzeugen')).toBe(1);
      await oeffneEinstellungsSeite(page);
      await expect(abschnitt).toHaveCount(1);

      await schalteKanbanErweiterung(page, false);
      await expect(page.locator(TAFEL)).toBeHidden();
      await oeffneEinstellungsSeite(page);
      await expect(
        page.locator(`${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="extensions"]`),
      ).toHaveCount(1);
      await expect(abschnitt).toHaveCount(0);
      await zurueckZurTafelDokument(page);
      expect(await paletteTreffer(page, 'Einstellungen dieser Tafel')).toBe(0);
      expect(await paletteTreffer(page, 'Notiz aus Karte erzeugen')).toBe(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Im Aus-Zustand gibt es keine Tafel-Ansicht; zurück geht es allein zum Reiter.
async function zurueckZurTafelDokument(page) {
  await page.locator(SEL.tabs0, { hasText: 'Tafel' }).first().click();
  await expect(page.locator(SEL.activeTab0)).toContainText('Tafel');
}
