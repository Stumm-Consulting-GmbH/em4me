// 4T-1185 (Epic 3E-0221, E1): E2E-Funktions-Suite der abgeleiteten Felder.
//
// **Warum diese Fälle E2E laufen und nicht als Unit-Prüfung genügen.** Die
// tragende Zusage aus E1 lautet: Das Öffnen eines Dokuments verändert es nicht.
// Ob sie hält, entscheidet sich nicht am DOM, sondern an der Datei — und die
// Kette dorthin führt über Debounce-Save, `writeFrontmatter` und den
// Block-Schreibweg in die `.mdd`. Genau dieses Muster hat in Stufe 3 einen
// Fehler getragen (4T-1179: ungefragt geschriebene Metadaten-Felder), den die
// Unit-Ebene nicht gefunden hat. Die Fälle prüfen deshalb den Datei-Inhalt.
//
// PP-12: Dokument-Panel — Formel-Wert sichtbar, nicht bearbeitbar, nicht in der
// Datei; Kreis-Bezug leer mit Hinweis. PP-13: Block-Panel — dieselbe Anzeige,
// und die `.mdd` bleibt ohne den abgeleiteten Schlüssel. describe-Titel tragen
// die Matrix-IDs (test/abdeckungs-matrix.json, F-106).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const {
  PANE0,
  PANEL,
  FIELDS,
  makeAreaAbgeleitet,
  writeDoc,
  bindAreaAndOpen,
  openPropertiesPanel,
  cleanupDir,
} = require('../helpers/profil-bereich');

const ABGELEITET = '.properties-field-abgeleitet';

// Eine abgeleitete Feld-Zeile über ihren Feldnamen finden. Sie stehen hinter
// den Dokument-Feldern, ein Zugriff über `.last()` wäre also von deren Zahl
// abhängig; und über den Wert des Schlüssel-Feldes lässt sich nicht filtern,
// weil der eine DOM-Property und kein Attribut ist. Das Attribut setzt
// `sperreAbgeleitetesFeld` an jeder abgeleiteten Zeile.
function abgeleiteteZeile(page, container, key) {
  return page.locator(`${container} .properties-field[data-abgeleitet-feld="${key}"]`);
}

// Eine gewöhnliche Feld-Zeile über ihren Schlüssel: das Dokument-Panel führt
// ihn als `data-original-key`.
function dokumentZeile(page, container, key) {
  return page.locator(`${container} .properties-field[data-original-key="${key}"]`);
}

test.describe('PP-12: Abgeleitete Felder im Dokument-Panel (F-106)', () => {
  test('Formel-Wert erscheint gerechnet, ist gesperrt und landet nicht in der Datei', async () => {
    const areaRoot = makeAreaAbgeleitet();
    const doc = writeDoc(areaRoot, 'rechnung.md', ['class: Rechnung', 'netto: 100', 'steuer: 19']);
    const vorher = fs.readFileSync(doc, 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();

      // AK1: Der Wert entsteht bei der Anzeige — 100 + 19.
      const brutto = abgeleiteteZeile(page, FIELDS, 'brutto');
      await expect(brutto).toHaveCount(1);
      await expect(brutto.locator(ABGELEITET)).toHaveText('119');

      // AK4: nicht bearbeitbar. Kein Eingabe-Element, Schlüssel und
      // Typ-Wechsler gesperrt, kein Löschen-Knopf.
      await expect(brutto.locator('.properties-field-value input')).toHaveCount(0);
      await expect(brutto.locator('.properties-field-key')).toBeDisabled();
      await expect(brutto.locator('.properties-field-type')).toBeDisabled();
      await expect(brutto.locator('.properties-field-delete')).toHaveCount(0);

      // AK8: Der Kreis-Bezug bleibt leer und trägt seinen Hinweis, statt zu
      // fehlen — ein fehlendes Feld wäre für den Anwender nicht erklärbar.
      const kreis = abgeleiteteZeile(page, FIELDS, 'kreis');
      await expect(kreis).toHaveCount(1);
      await expect(kreis.locator(`${ABGELEITET}[data-hinweis="derivedCycle"]`)).toHaveCount(1);

      // AK5, der eigentliche Nachweis: Eine Eingabe in ein ECHTES Feld löst
      // den Schreibweg aus; danach steht der abgeleitete Wert trotzdem nicht
      // im Metadaten-Block. Ohne diesen Auslöser prüfte der Fall nur, dass
      // ohne Schreibvorgang nichts geschrieben wird — das wäre keine Aussage.
      //
      // Geprüft wird der **Dokument-Inhalt im Editor** und nicht die Datei auf
      // der Platte: Der Properties-Schreibweg schreibt in den Puffer, und auf
      // die Platte kommt er erst mit Auto-Save oder Strg+S. Der Puffer ist
      // genau das, was gespeichert würde — dasselbe Mittel nutzt PP-01.
      const netto = dokumentZeile(page, FIELDS, 'netto');
      await netto.locator('.properties-field-value input').fill('200');
      await page.locator(SEL.viewBtn('source')).click();
      await expect
        .poll(() => page.locator(SEL.editorContent0).innerText(), { timeout: 5000 })
        .toContain('netto: 200');
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).not.toContain('brutto');
      expect(text).not.toContain('kreis');
      expect(text).not.toContain('posten');
      // Die übrigen Zeilen sind unverändert geblieben.
      expect(text).toContain('class: Rechnung');
      expect(text).toContain('steuer: 19');

      // Und die Datei selbst hat kein abgeleitetes Feld bekommen — sie ist
      // ohnehin unverändert, weil ohne Auto-Save nichts geschrieben wurde.
      const aufPlatte = fs.readFileSync(doc, 'utf8');
      expect(aufPlatte).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-13: Abgeleitete Felder im Block-Panel (F-106)', () => {
  test('dieselbe Anzeige wie im Dokument-Panel; die Begleitdatei bleibt ohne den Wert', async () => {
    const areaRoot = makeAreaAbgeleitet();
    const doc = path.join(areaRoot, 'block.md');
    fs.writeFileSync(
      doc,
      '---\nclass: Rechnung\nnetto: 100\nsteuer: 19\n---\n\nAbsatz mit Anker. ^abc\n',
      'utf8',
    );
    // **Der Block trägt eigene Werte, und das ist der Punkt.** Ein Formel-Feld
    // am Block rechnet über die Felder DIESES Blocks, nicht über den
    // Metadaten-Block des Dokuments — der Block erbt die Definitionen, nicht
    // die Werte. Die 100 und die 19 im Frontmatter oben gehören dem Dokument;
    // damit die Zeile hier rechnet, bekommt der Anker eigene.
    fs.writeFileSync(
      doc.replace(/\.md$/, '.mdd'),
      JSON.stringify(
        {
          schemaVersion: 1,
          // Die history-Sektion ist Pflicht: Ohne sie weist `parseContainer`
          // die ganze Begleitdatei ab, und die Block-Daten kämen nie an.
          history: { anchors: [], packets: [] },
          blockData: {
            abc: { values: { netto: 40, steuer: 2 }, updated: '2026-08-25T00:00:00Z' },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    // Quell-Ansicht für die Cursor-Folge des Block-Panels (Muster PP-05).
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-abgeleitet-block-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ app: { defaultViewMode: 'source' } }),
      'utf8',
    );
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:toggleBlockProps');
      });
      const SEC = `${PANE0} .sidebar-blockprops`;
      await expect(page.locator(SEC)).toBeVisible();
      await page.locator(SEL.editorContent0).getByText('Absatz mit Anker.').click();
      await expect(page.locator(`${SEC} .block-props-add-btn`)).toBeVisible();
      await expect(page.locator(PANEL)).toHaveAttribute('data-profiles', 'on');

      // AK2: Das Block-Panel erbt die Datei-Auflösung und zeigt dieselben
      // abgeleiteten Felder — die Parität ist eine ausgelieferte Zusage.
      const FELDER = `${SEC} .block-props-fields`;
      const brutto = abgeleiteteZeile(page, FELDER, 'brutto');
      await expect(brutto).toHaveCount(1);
      await expect(brutto.locator(ABGELEITET)).toHaveText('42');
      await expect(brutto.locator('.properties-field-value input')).toHaveCount(0);
      await expect(brutto.locator('.properties-field-key')).toBeDisabled();
      await expect(brutto.locator('.properties-field-delete')).toHaveCount(0);

      // AK6, der eigentliche Nachweis: Eine Eingabe in ein ECHTES Block-Feld
      // löst den Schreibweg aus. Anders als im Dokument-Panel geht er direkt
      // in die Begleitdatei — hier ist der Datei-Nachweis also unmittelbar
      // führbar und braucht kein Auto-Save.
      const netto = page
        .locator(`${FELDER} .properties-field`)
        .filter({ hasNot: page.locator(`[data-hinweis], ${ABGELEITET}`) })
        .first();
      await netto.locator('.properties-field-value input').fill('50');
      const mddPfad = doc.replace(/\.md$/, '.mdd');
      await expect
        .poll(
          () => {
            try {
              const mdd = JSON.parse(fs.readFileSync(mddPfad, 'utf8'));
              const entry = mdd.blockData && mdd.blockData.abc;
              return entry ? entry.values.netto : null;
            } catch {
              return null;
            }
          },
          { timeout: 5000 },
        )
        .toBe(50);
      // Die Begleitdatei trägt danach genau die beiden echten Werte und
      // keinen abgeleiteten Schlüssel.
      const mdd = JSON.parse(fs.readFileSync(mddPfad, 'utf8'));
      expect(Object.keys(mdd.blockData.abc.values).sort()).toEqual(['netto', 'steuer']);
      const roh = fs.readFileSync(mddPfad, 'utf8');
      expect(roh).not.toContain('brutto');
      expect(roh).not.toContain('kreis');
      expect(roh).not.toContain('posten');

      // Und der gerechnete Wert zieht mit: 50 + 2.
      await expect(brutto.locator(ABGELEITET)).toHaveText('52');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
      cleanupDir(userDataDir);
    }
  });
});
