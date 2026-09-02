// 4T-001187 (Epic 3E-000221, E11): E2E-Funktions-Suite der gestapelten Bedienung.
//
// **Warum an der laufenden Anwendung.** Die Unit-Ebene prüft den Bau und die
// Auslese mit einem eingespeisten Kind-Editor; was sie nicht prüfen kann, ist
// der Weg dazwischen — dass die echten Wert-Editoren der beiden Panels in den
// Kind-Zellen entstehen, dass der Debounce-Save sie einsammelt und dass am Ende
// eine verschachtelte YAML-Struktur beziehungsweise ein verschachtelter Wert in
// der Begleitdatei steht. Genau dort liegt AK5 und AK6.
//
// PP-14: Dokument-Panel — Objekt-Liste bedienen, Eintrag anlegen, Wert bis in
// den Metadaten-Block. PP-15: Block-Panel — dieselbe Bedienung, der Wert bis in
// die `.mdd`, und die bewusste Grenze, dass der Index ihn nicht abbildet.
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, F-106).
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

const OBJEKT = '.properties-objekt';
const EINTRAG = '.properties-objekt-eintrag';
const KIND = '.properties-objekt-kind';

// Eine Feld-Zeile über ihren Schlüssel: das Dokument-Panel führt ihn als
// `data-original-key` (der Wert des Eingabe-Feldes ist eine DOM-Property und
// über einen Attribut-Selektor nicht erreichbar).
function dokumentZeile(page, container, key) {
  return page.locator(`${container} .properties-field[data-original-key="${key}"]`);
}

test.describe('PP-14: Gestapelte Objekt-Bedienung im Dokument-Panel (F-106)', () => {
  test('Kind-Felder erscheinen gestapelt; ein neuer Eintrag landet als YAML-Struktur', async () => {
    const areaRoot = makeAreaAbgeleitet();
    const doc = writeDoc(areaRoot, 'sitzung.md', [
      'class: Rechnung',
      'teilnehmer:',
      '  - person: Anna',
      '    rolle: Leitung',
    ]);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();

      // AK1: Die Kind-Felder stehen gestapelt unter ihrem Feld, jedes mit
      // seiner Beschriftung und seinem eigenen Bedienelement.
      const teilnehmer = dokumentZeile(page, FIELDS, 'teilnehmer');
      await expect(teilnehmer.locator(OBJEKT)).toHaveCount(1);
      await expect(teilnehmer.locator(EINTRAG)).toHaveCount(1);
      const kinder = teilnehmer.locator(KIND);
      await expect(kinder).toHaveCount(2);
      await expect(kinder.nth(0)).toHaveAttribute('data-kind-feld', 'person');
      await expect(kinder.nth(0).locator('input')).toHaveValue('Anna');
      // AK1: Das Kind mit Wertebereich bekommt den Editor SEINES Typs — eine
      // Auswahl-Liste, nicht ein Textfeld.
      await expect(kinder.nth(1).locator('select')).toHaveCount(1);

      // AK2: Ein neuer Eintrag entsteht über den Knopf und ist leer.
      await teilnehmer.locator('.properties-objekt-add').click();
      await expect(teilnehmer.locator(EINTRAG)).toHaveCount(2);
      const zweiter = teilnehmer.locator(EINTRAG).nth(1);
      // AK3: Seine Kind-Felder sind als fehlend gekennzeichnet.
      await expect(zweiter.locator(`${KIND}.is-fehlend`)).toHaveCount(2);

      // Einen Wert eintragen und den Weg bis in den Metadaten-Block prüfen.
      await zweiter.locator(`${KIND}[data-kind-feld="person"] input`).fill('Bo');
      await page.locator(SEL.viewBtn('source')).click();
      await expect
        .poll(() => page.locator(SEL.editorContent0).innerText(), { timeout: 5000 })
        .toContain('Bo');

      // AK5: Die Struktur steht als gewöhnliches verschachteltes YAML da —
      // Listen-Striche und eingerückte Kind-Schlüssel, kein JSON-Text.
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).toContain('teilnehmer:');
      expect(text).toContain('- person: Anna');
      expect(text).toContain('rolle: Leitung');
      expect(text).toContain('- person: Bo');
      expect(text).not.toContain('{"person"');
      // AK3 bis in die Datei: Das leere `rolle` des zweiten Eintrags wurde
      // NICHT geschrieben — es bleibt fehlend, statt aufgefüllt zu werden.
      expect(text.match(/rolle:/g) || []).toHaveLength(1);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });

  test('AK2: der Entfernen-Knopf nimmt seinen Eintrag aus der Datei', async () => {
    const areaRoot = makeAreaAbgeleitet();
    const doc = writeDoc(areaRoot, 'sitzung.md', [
      'class: Rechnung',
      'teilnehmer:',
      '  - person: Anna',
      '  - person: Bo',
    ]);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();
      const teilnehmer = dokumentZeile(page, FIELDS, 'teilnehmer');
      await expect(teilnehmer.locator(EINTRAG)).toHaveCount(2);
      await teilnehmer.locator('.properties-objekt-remove').first().click();
      await expect(teilnehmer.locator(EINTRAG)).toHaveCount(1);
      await page.locator(SEL.viewBtn('source')).click();
      await expect
        .poll(() => page.locator(SEL.editorContent0).innerText(), { timeout: 5000 })
        .not.toContain('Anna');
      expect(await page.locator(SEL.editorContent0).innerText()).toContain('Bo');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-15: Gestapelte Objekt-Bedienung im Block-Panel (F-106)', () => {
  test('dieselbe Bedienung; der Wert landet in der Begleitdatei, nicht im Index', async () => {
    const areaRoot = makeAreaAbgeleitet();
    const doc = path.join(areaRoot, 'block.md');
    fs.writeFileSync(doc, '---\nclass: Rechnung\n---\n\nAbsatz mit Anker. ^abc\n', 'utf8');
    const mddPfad = doc.replace(/\.md$/, '.mdd');
    fs.writeFileSync(
      mddPfad,
      JSON.stringify(
        {
          schemaVersion: 1,
          // Pflicht-Sektion: Ohne sie weist `parseContainer` die ganze
          // Begleitdatei ab (belegter Fall aus 4T-001185).
          history: { anchors: [], packets: [] },
          blockData: {
            abc: {
              values: { adresse: { ort: 'Berlin' } },
              updated: '2026-08-25T00:00:00Z',
            },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-objekt-block-'));
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

      // AK4: Das Block-Panel bedient die Objekt-Typen genauso — die Parität
      // ist eine ausgelieferte Zusage, kein Zusatz.
      const adresse = page.locator(`${SEC} .block-props-fields .properties-field`).filter({
        has: page.locator(`${OBJEKT}[data-objekt-typ="object"]`),
      });
      await expect(adresse).toHaveCount(1);
      const ort = adresse.locator(`${KIND}[data-kind-feld="ort"] input`);
      await expect(ort).toHaveValue('Berlin');

      // AK6: Eine Änderung geht durch den Block-Schreibweg bis in die
      // Begleitdatei — und zwar als verschachtelter Wert.
      await ort.fill('Hamburg');
      await expect
        .poll(
          () => {
            try {
              const mdd = JSON.parse(fs.readFileSync(mddPfad, 'utf8'));
              const entry = mdd.blockData && mdd.blockData.abc;
              return entry && entry.values.adresse ? entry.values.adresse.ort : null;
            } catch {
              return null;
            }
          },
          { timeout: 5000 },
        )
        .toBe('Hamburg');

      // AK7, die bewusste Grenze: Der verschachtelte Wert steht in der Datei,
      // aber nicht im Bereichs-Index — eine Block-Abfrage sieht ihn nicht.
      // Geprüft an der Abfrage selbst, nicht am Index-Modul.
      const treffer = await page.evaluate(
        (p) => window.api.runFrontmatterQuery(p, 'LIST BLOCKS WHERE adresse', 'de'),
        doc,
      );
      const namen = (treffer && Array.isArray(treffer.files) ? treffer.files : []).map(
        (f) => f.name,
      );
      expect(namen).toHaveLength(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
      cleanupDir(userDataDir);
    }
  });
});
