// 4T-001792 (Epic 3E-000255, AK2 bis AK5 und AK7 bis AK9): Die lesende
// Beleg-Ansicht am Datensatz in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Seite ist ein neu eingeführtes, dauerhaft sichtbares Bedien-Element, und die
// Entwicklungsrichtlinien verlangen dafür einen Fall, der es sichtbar rendert
// statt nur seinen Quelltext zu lesen. Drei Zusagen lassen sich ausschließlich
// hier zeigen:
//
//   1. Die Kette reicht von der Beleg-Datei über den Kanal bis in das DOM. Der
//      Kanal prüft den gebundenen Bereich des Fensters, und den gibt es erst in
//      der laufenden Anwendung.
//   2. Der mehrzeilige Wert erscheint auch WIRKSAM mehrzeilig. Das hängt an der
//      Stil-Regel `white-space: pre-wrap`; ein jsdom-Fall kennt die
//      CSS-Kaskade nicht, und genau diese Divergenz-Klasse hat den
//      Abnahme-Befund von 1.116.0 verursacht.
//   3. Fehlender und leerer Wert sind auch optisch unterscheidbar, nicht nur
//      im Text.
//
// **Der Zugang an der Datensatz-Zeile steht in der zweiten Beschreibung**
// (DB-BEL-02, Bauplan Z1 bis Z6): Variante 1 der Entscheidung des Product
// Owners vom 2026-09-18, die Schaltfläche am Zeilen-Anfang, je einmal in der
// Lese-Ansicht, in der Live-Ansicht und über die Tastatur. Der Weg über das
// Verdrahtungs-Ereignis `scg:open-change-log` bleibt daneben bestehen — Muster
// `scg:open-system-page` und `scg:open-manual-page` —, weil die Fälle der
// Seite selbst nicht vom Zugang abhängen sollen: Ein Fehler am Zugang machte
// sonst jede Aussage über die Anzeige mit rot.
//
// **Warum der Zugang HIER geprüft wird und nicht nur in jsdom** (AK6 und die
// Oberflächen-Leitlinie zum neu eingeführten Bedienelement): Die Schaltfläche
// ist im Ruhezustand durchsichtig und wird erst beim Überfahren der Zeile und
// bei Tastatur-Fokus sichtbar; das hängt an `opacity` im Stilblatt, und die
// CSS-Kaskade kennt ein jsdom-Fall nicht. Dazu die Live-Ansicht, in der der
// abgefangene Maus-Druck den Block nicht zum Quelltext aufklappen darf — das
// braucht den echten Editor.
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Ein frisches Profil steht
// auf Englisch, und die Anzeige-Texte werden deshalb gegen die Menge der fünf
// Sprachfassungen gehalten. Alles Übrige ist sprachfrei, weil es Struktur oder
// Daten des angelegten Bestands ist.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
const { LOCALE_CODES } = require('../../../src/shared/locales.js');
// Der Aufbau nimmt den SCHREIB-Weg, die Prüfung den Lese-Weg: Ein Prüffall, der
// seine Ausgangslage mit derselben Funktion herstellt, die er prüft, prüft sie
// gegen sich selbst.
const { schreibeBeleg } = require('../../../src/main/database/change-log.js');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .db-changelog-page`;
const KENNUNG = 'r-00001';
// 4T-001792: Der zweite Datensatz der Tabelle, ohne eigene Belege — Ziel des
// Zeilen-Wechsels im Tastatur-Fall.
const KENNUNG_ZWEIT = 'r-00002';
// Der Datensatz-Block und der Griff einer Zeile, je in Lese- und Live-Ansicht.
const BLOCK_LESE = `${SEL.markdownBody0} .perspective-records`;
const BLOCK_LIVE = `${SEL.editorContent0} .perspective-records`;
const griffIn = (block, kennung) => `${block} tr[data-rec-id="${kennung}"] .prc-history-btn`;
const ADRESSE_ALT = 'Beispielweg 3\n4051 Basel';
const ADRESSE_NEU = 'Musterweg 7\n3000 Bern';

function inAllenSprachen(key) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]);
}

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Feste Uhr und feste Herkunft, damit der Bestand wiederholbar ist.
function naht(takte) {
  let i = 0;
  return {
    jetzt: () => takte[Math.min(i++, takte.length - 1)],
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
  };
}

// Ein Datenbank-Bereich mit Steckbrief, einer Tabelle «Kunden» und einer
// bereitgestellten Beleg-Lage, die alle Darstellungs-Fälle enthält.
async function baueBereich() {
  const wurzel = tmpDir('em4me-beleg-ansicht-');
  fs.writeFileSync(
    path.join(wurzel, 'Datenbank.md'),
    ['---', 'db-database:', '  name: Mini-CRM', '---', '', 'Beschreibung.', ''].join('\n'),
    'utf8',
  );
  const tabelle = path.join(wurzel, 'Kunden.md');
  fs.writeFileSync(
    tabelle,
    [
      '---',
      'db-table:',
      '  fields:',
      '    - name: Name',
      '      type: string',
      '    - name: Adresse',
      '      type: string',
      '---',
      '',
      '```perspective-records',
      `|- id="${KENNUNG}"`,
      '| Anna Muster',
      '| Musterweg 9',
      // 4T-001792: Ein zweiter Datensatz, damit der Tastatur-Weg eine Zeile hat,
      // zu der er wechseln kann. Er trägt bewusst KEINEN Beleg: Sein Griff führt
      // damit auf die leere Lage, und das ist ebenfalls ein gültiges Ergebnis.
      `|- id="${KENNUNG_ZWEIT}"`,
      '| Beat Beispiel',
      '| Seeweg 1',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );

  const takte = naht([
    '2026-09-18T08:00:00Z',
    '2026-09-18T09:00:00Z',
    '2026-09-18T10:00:00Z',
    '2026-09-18T11:00:00Z',
    '2026-09-18T12:00:00Z',
  ]);
  const belege = [
    // Anlegen: beide alten Werte FEHLEN.
    {
      art: 'create',
      id: KENNUNG,
      vorgang: '1',
      felder: [
        { name: 'Name', neu: 'Anna Muster' },
        { name: 'Adresse', neu: ADRESSE_ALT },
      ],
    },
    // Änderung mit mehrzeiligem Wert auf beiden Seiten.
    {
      art: 'update',
      id: KENNUNG,
      vorgang: '2',
      felder: [{ name: 'Adresse', alt: ADRESSE_ALT, neu: ADRESSE_NEU }],
    },
    // Verdichtete Spanne: fehlender alter und LEERER neuer Wert, kein Urheber.
    {
      art: 'merged',
      id: KENNUNG,
      felder: [{ name: 'Notiz', alt: null, neu: '' }],
      verdichtung: { anzahl: 42, seit: '2026-06-01T08:00:00Z', arten: ['update'] },
    },
    // Änderung von außen: gekennzeichnet, ohne Urheber, mit eigener
    // Beschriftung der beiden Werte.
    {
      art: 'external',
      id: KENNUNG,
      felder: [{ name: 'Ort', alt: 'Bern', neu: 'Zürich' }],
    },
    // Ein Beleg, der NICHT anschließt: Sein alter Wert der Adresse ist nicht
    // der neue des Belegs davor.
    {
      art: 'update',
      id: KENNUNG,
      vorgang: '3',
      felder: [{ name: 'Adresse', alt: 'Ganz anderer Wert', neu: 'Musterweg 9\n3000 Bern' }],
    },
  ];
  for (const angaben of belege) {
    const erg = await schreibeBeleg(tabelle, angaben, takte);
    if (!erg.ok) throw new Error(`Beleg nicht geschrieben: ${erg.code} ${erg.error}`);
  }
  // Ein abgerissener Beleg am Dateiende, wie ihn ein abgebrochener
  // Schreibvorgang hinterlässt: Die Angabe nennt ein berührtes Feld, die Zellen
  // fehlen.
  fs.appendFileSync(
    path.join(wurzel, 'Kunden.mddl'),
    `\n|- id="${KENNUNG}" kind="update" at="2026-09-18T13:00:00Z" tx="4" n="1"\n| Adresse\n`,
    'utf8',
  );
  return { wurzel, tabelle };
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

// Die Tabellen-Datei als Reiter öffnen, ohne den Zugang zu benutzen, den die
// Fälle darunter prüfen (Muster `openFileInArea` in `ereignisse.spec.js`).
async function oeffneTabelle(app, page, tabelle) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
    },
    tabelle,
  );
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function oeffneAnsicht(page, tabelle) {
  await page.evaluate(
    ({ filePath, recordId }) => {
      document.dispatchEvent(
        new CustomEvent('scg:open-change-log', { detail: { filePath, recordId } }),
      );
    },
    { filePath: tabelle, recordId: KENNUNG },
  );
}

test.describe('DB-BEL-01: Lesende Beleg-Ansicht am Datensatz (4T-001792)', () => {
  test('Belege, Verdichtung, Fremd-Änderung, Unterbrechungen und Werte', async () => {
    const { wurzel, tabelle } = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneAnsicht(page, tabelle);

      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });

      // Der Kopf nennt Datensatz und Tabellen-Datei.
      const kopf = seite.locator('.db-changelog-heading');
      await expect(kopf).toContainText(KENNUNG);
      await expect(kopf).toContainText('Kunden.md');

      // AK2: sechs Belege, jüngster zuerst. Der jüngste ist der abgerissene.
      const eintraege = seite.locator('.db-changelog-entry');
      await expect(eintraege).toHaveCount(6);
      await expect(eintraege.nth(0).locator('.db-changelog-issue')).toHaveCount(1);
      // Der älteste gezeigte Beleg ist das Anlegen; es nennt beide neuen Werte
      // und keinen alten.
      const aeltester = eintraege.nth(5);
      await expect(aeltester.locator('.db-changelog-field-name').nth(0)).toHaveText('Name');
      await expect(aeltester.locator('.db-changelog-value-missing')).toHaveCount(2);

      // AK2: Benutzer und Rechner stehen an den gewöhnlichen Belegen.
      await expect(aeltester.locator('.db-changelog-user')).toHaveText('anna');
      await expect(aeltester.locator('.db-changelog-machine')).toHaveText('SC-026');

      // AK3: der verdichtete Beleg nennt die Zahl der ersetzten Änderungen und
      // zeigt keinen Urheber.
      const verdichtet = seite.locator('.db-changelog-kind-merged');
      await expect(verdichtet).toHaveCount(1);
      await expect(verdichtet.locator('.db-changelog-merged-count')).toContainText('42');
      await expect(verdichtet.locator('.db-changelog-user')).toHaveCount(0);
      // Fehlender und leerer Wert stehen an genau diesem Beleg nebeneinander.
      await expect(verdichtet.locator('.db-changelog-value-missing')).toHaveCount(1);
      await expect(verdichtet.locator('.db-changelog-value-empty')).toHaveCount(1);

      // AK3: die Änderung von außen ist gekennzeichnet, ohne Urheber, und ihre
      // beiden Werte tragen eigene Beschriftungen.
      const extern = seite.locator('.db-changelog-kind-external');
      await expect(extern).toHaveCount(1);
      await expect(extern.locator('.db-changelog-external')).toHaveCount(1);
      await expect(extern.locator('.db-changelog-user')).toHaveCount(0);
      const erwartet = await extern.locator('.db-changelog-value-label').nth(0).textContent();
      expect(inAllenSprachen('database.changeLog.col.expected')).toContain(erwartet);
      const vorgefunden = await extern.locator('.db-changelog-value-label').nth(1).textContent();
      expect(inAllenSprachen('database.changeLog.col.found')).toContain(vorgefunden);
      // Die Daten selbst sind sprachfrei.
      await expect(extern.locator('.db-changelog-value-text').nth(0)).toHaveText('Bern');
      await expect(extern.locator('.db-changelog-value-text').nth(1)).toHaveText('Zürich');

      // Bauplan S5: zwei Unterbrechungen der Spur, verschieden gestaltet.
      await expect(seite.locator('.db-changelog-break')).toHaveCount(2);
      await expect(seite.locator('.db-changelog-break-damaged')).toHaveCount(1);
      const wertBruch = seite.locator('.db-changelog-break-value');
      await expect(wertBruch).toHaveCount(1);
      await expect(wertBruch).toContainText('Adresse');
      const bruchTexte = inAllenSprachen('database.changeLog.break.damaged');
      const bruchText = await seite.locator('.db-changelog-break-damaged').textContent();
      expect(bruchTexte).toContain(bruchText);

      // AK9: Der mehrzeilige Wert steht unverfälscht im Text UND wirkt in der
      // Anzeige mehrzeilig. Ohne die Stil-Regel wäre er eine einzige Zeile.
      const adresse = seite.locator('.db-changelog-value-text', { hasText: '4051 Basel' }).first();
      await expect(adresse).toHaveText(ADRESSE_ALT);
      const umbruch = await adresse.evaluate((el) => getComputedStyle(el).whiteSpace);
      expect(umbruch).toBe('pre-wrap');
      const hoehen = await adresse.evaluate((el) => [el.clientHeight, el.scrollWidth]);
      expect(hoehen[0]).toBeGreaterThan(20);

      // AK7 und AK9: Fehlender und leerer Wert sind auch optisch verschieden.
      const fehltStil = await seite
        .locator('.db-changelog-value-missing')
        .first()
        .evaluate((el) => getComputedStyle(el).fontStyle);
      const leerStil = await seite
        .locator('.db-changelog-value-empty')
        .first()
        .evaluate((el) => getComputedStyle(el).borderStyle);
      expect(fehltStil).toBe('italic');
      expect(leerStil).toContain('dashed');

      // AK4: kein Weg, einen Beleg zu ändern, zu löschen oder anzulegen. Die
      // eine Schaltfläche lädt neu.
      await expect(seite.locator('button')).toHaveCount(1);
      await expect(seite.locator('button')).toHaveClass(/db-changelog-refresh/);
      for (const tag of ['input', 'select', 'textarea', 'form']) {
        await expect(seite.locator(tag)).toHaveCount(0);
      }
      // Und sie lädt wirklich neu, ohne die Ansicht zu verlieren.
      await seite.locator('button').click();
      await expect(seite.locator('.db-changelog-entry')).toHaveCount(6);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('ein Datensatz ohne Belege zeigt die leere Lage statt eines Fehlers (AK7)', async () => {
    const { wurzel, tabelle } = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      // Derselbe Bestand, aber ein Datensatz, zu dem kein Beleg existiert.
      await page.evaluate(
        ({ filePath }) => {
          document.dispatchEvent(
            new CustomEvent('scg:open-change-log', {
              detail: { filePath, recordId: 'r-09999' },
            }),
          );
        },
        { filePath: tabelle },
      );
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      await expect(seite.locator('.db-changelog-entry')).toHaveCount(0);
      const satz = await seite.locator('.db-changelog-empty').textContent();
      expect(inAllenSprachen('database.changeLog.empty')).toContain(satz);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-001792 (Epic 3E-000255, AK6): Der Zugang an der Datensatz-Zeile —
// Variante 1 der Entscheidung des Product Owners vom 2026-09-18.
//
// Der Aufbau öffnet die Tabellen-Datei über den Weg, den die Anwendung von
// außen anbietet, und nicht über den Zugang, den die Fälle prüfen (Regel «Der
// Aufbau eines Prüffalls ist nicht sein Gegenstand»).
test.describe('DB-BEL-02: Zugang von der Datensatz-Zeile (4T-001792)', () => {
  test('Lese-Ansicht: der Griff ist erst beim Überfahren sichtbar und öffnet die Belege', async () => {
    const { wurzel, tabelle } = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);

      const block = page.locator(BLOCK_LESE);
      await expect(block.locator('table.prc-table')).toBeVisible({ timeout: 20000 });
      // Zwei Zeilen, zwei Griffe, und der Griff steht in der ERSTEN Zelle.
      await expect(block.locator('tr.prc-row')).toHaveCount(2);
      await expect(block.locator('.prc-history-btn')).toHaveCount(2);
      const erste = block.locator('tr.prc-row').first();
      await expect(erste.locator('td').first()).toHaveClass(/prc-action/);

      const griff = page.locator(griffIn(BLOCK_LESE, KENNUNG));
      // **Erkennbarkeit ohne Dauer-Lärm** (AK6): Im Ruhezustand ist der Griff
      // durchsichtig, beim Überfahren der Zeile erscheint er. Gemessen an der
      // gerechneten Deckkraft und nicht an einer Klasse — die CSS-Kaskade ist
      // genau das, was ein jsdom-Fall nicht kennt.
      expect(await griff.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
      await erste.hover();
      await expect.poll(async () => griff.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      // Und er behält seinen Platz: Die Spalte ist im Ruhezustand nicht leer
      // geschaltet, sondern nur unsichtbar, sonst sprang die Tabelle.
      const breite = await griff.evaluate((el) => el.getBoundingClientRect().width);
      expect(breite).toBeGreaterThan(0);

      await griff.click();
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      // Geöffnet ist die Geschichte GENAU dieses Datensatzes.
      await expect(seite.locator('.db-changelog-heading')).toContainText(KENNUNG);
      await expect(seite.locator('.db-changelog-entry')).toHaveCount(6);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('Live-Ansicht: der Maus-Druck klappt den Block nicht auf, der Klick öffnet trotzdem', async () => {
    const { wurzel, tabelle } = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await page.locator(SEL.viewBtn('live')).click();

      const block = page.locator(BLOCK_LIVE);
      await expect(block.locator('table.prc-table')).toBeVisible({ timeout: 20000 });
      const griff = page.locator(griffIn(BLOCK_LIVE, KENNUNG));
      const kasten = await griff.boundingBox();
      expect(kasten).not.toBeNull();

      // **Der tragende Nachweis dieses Falls.** Ein echter Maus-Druck auf den
      // Griff setzte ohne `preventDefault` die Schreibmarke in die Fence, und
      // der Block klappte zum Quelltext auf — der Anwender sähe statt der
      // Tabelle den Rohtext, und die Seite käme nie. Geprüft wird mit
      // getrenntem Druck und Loslassen, weil ein zusammengesetzter Klick den
      // Zwischenzustand nicht zeigt.
      await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
      await page.mouse.down();
      await expect(block.locator('table.prc-table')).toBeVisible();

      // Und das Loslassen bringt den Klick trotzdem an: Ein verhindertes
      // `mousedown` unterdrückt Auswahl und Fokus-Wechsel, nicht das
      // Klick-Ereignis. Genau darauf beruht die Entscheidung, auf `click` zu
      // hören und nicht auf `mousedown` (Bauplan S12).
      await page.mouse.up();
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      await expect(seite.locator('.db-changelog-heading')).toContainText(KENNUNG);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('Tastatur: ein Tabulator-Stopp je Tabelle, Pfeiltaste wechselt die Zeile, Eingabetaste öffnet', async () => {
    const { wurzel, tabelle } = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);

      const block = page.locator(BLOCK_LESE);
      await expect(block.locator('table.prc-table')).toBeVisible({ timeout: 20000 });
      // **Genau EIN Tabulator-Stopp je Tabelle** (Bauplan Z5): Eine Tabelle
      // trägt bis zu 2000 Zeilen, und 2000 Stopps wären keine Erreichbarkeit,
      // sondern eine Tastatur-Falle.
      await expect(block.locator('.prc-history-btn[tabindex="0"]')).toHaveCount(1);
      await expect(block.locator('.prc-history-btn[tabindex="-1"]')).toHaveCount(1);

      const erster = page.locator(griffIn(BLOCK_LESE, KENNUNG));
      await erster.focus();
      // Bei Tastatur-Fokus wird der Griff sichtbar, ohne dass die Maus im Spiel
      // ist — sonst bediente man hier einen unsichtbaren Knopf.
      await expect
        .poll(async () => erster.evaluate((el) => getComputedStyle(el).opacity))
        .toBe('1');

      // Die Pfeiltaste wechselt die Zeile und nimmt den Tabulator-Stopp mit.
      await page.keyboard.press('ArrowDown');
      const zweiter = page.locator(griffIn(BLOCK_LESE, KENNUNG_ZWEIT));
      await expect(zweiter).toBeFocused();
      await expect(zweiter).toHaveAttribute('tabindex', '0');
      await expect(erster).toHaveAttribute('tabindex', '-1');

      // Die Eingabetaste löst aus, ohne dass der Zugang eigens darauf hört:
      // Sie erzeugt den nativen Klick der Schaltfläche.
      await page.keyboard.press('Enter');
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      await expect(seite.locator('.db-changelog-heading')).toContainText(KENNUNG_ZWEIT);
      // Der zweite Datensatz hat keine Belege; die leere Lage ist kein Fehler.
      await expect(seite.locator('.db-changelog-entry')).toHaveCount(0);
      const satz = await seite.locator('.db-changelog-empty').textContent();
      expect(inAllenSprachen('database.changeLog.empty')).toContain(satz);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
