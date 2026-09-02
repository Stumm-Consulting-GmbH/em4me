// 4T-001172 bis 4T-001175 (Epic 3E-000220, E5): E2E-Suite des Feld-Formulars —
// alle Felder eines Dokuments samt Herkunft, die Profil-Kette und der Zugang
// über das Reiter-Kontextmenü. describe-Titel tragen die Matrix-ID (F-106).
//
// Eigene Datei neben eigenschafts-profile.spec.js: Diese Fälle prüfen die
// BEDIENUNG der Stufe 3, jene die Definitionen und ihre Wirkung im Editor;
// dazu kam das Datei-Budget, das die gemeinsame Datei überschritten hätte.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const {
  PANEL,
  FIELDS,
  ADD_BTN,
  makeArea,
  writeDoc,
  bindAreaAndOpen,
  openPropertiesPanel,
  editorContains,
  cleanupDir,
} = require('../helpers/profil-bereich');

// --- 4T-001172 bis 4T-001175 (Epic 3E-000220, E5): Feld-Formular des Dokuments ----
// PP-13 und PP-14 prüfen, was die Unit-Ebene nicht zeigen kann: dass Herkunft,
// fehlende Felder und Kette am gebauten Fenster wirklich erscheinen, und dass
// der Zugang über das Reiter-Kontextmenü dort ankommt. Genau diese Lücke hat
// beim Profil-Symbol von 1.116.0 einen Abnahme-Befund gekostet (4T-001164,
// Lehre verortet als 4T-001167): vier grüne Verdrahtungs-Prüfungen, und die
// Funktion war unsichtbar.

const ALL_FIELDS = `${PANEL} .properties-all-fields`;
const CHAIN_LEVEL = `${ALL_FIELDS} .properties-chain-level`;
const SUMMARY = `${ALL_FIELDS} .properties-all-fields-summary`;
const TAB_MENU_ITEM = (id) => `#context-menu [data-menu-id="${id}"]`;
const MENU = '.properties-suggest-menu';
const MENU_ITEM = `${MENU} .properties-suggest-item`;

test.describe('PP-13: Feld-Formular zeigt alle Felder samt Herkunft (F-106)', () => {
  test('Herkunft je Feld, fehlende Felder im Ausklapp-Bereich, Profil-Kette', async () => {
    const areaRoot = makeArea();
    // Das Dokument trägt nur die Zuordnung; status, budget (Projekt) und
    // thema (All) sind definiert, aber noch nicht im Metadaten-Block.
    const doc = writeDoc(areaRoot, 'notiz.md', ['class: Projekt']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();

      const bereich = page.locator(ALL_FIELDS);
      await expect(bereich).toHaveCount(1);

      // Die Kette nennt beide Profile in der Reihenfolge der Auflösung.
      await expect(page.locator(CHAIN_LEVEL)).toHaveCount(2);
      await expect(page.locator(CHAIN_LEVEL).nth(0)).toContainText('Projekt');
      await expect(page.locator(CHAIN_LEVEL).nth(1)).toContainText('All');

      // Die drei noch fehlenden Felder stehen im Bereich und sind als noch
      // nicht im Dokument gekennzeichnet.
      const fehlend = page.locator(`${ALL_FIELDS} .properties-field.is-nicht-im-dokument`);
      await expect(fehlend).toHaveCount(3);
      // Der Feldname steht als data-Attribut an der Feld-Zeile selbst. Über
      // das Eingabefeld ginge es nicht: Dessen Wert wird per Skript gesetzt,
      // und ein CSS-Attributselektor liest das Attribut, nicht die Property.
      for (const name of ['status', 'budget', 'thema']) {
        await expect(
          page.locator(
            `${ALL_FIELDS} .properties-field.is-nicht-im-dokument[data-original-key="${name}"]`,
          ),
        ).toHaveCount(1);
      }

      // Jedes definierte Feld trägt sein Herkunfts-Zeichen; das Zuordnungs-Feld
      // class ist undefiniert und trägt keines.
      await expect(page.locator(`${ALL_FIELDS} .properties-field-origin`)).toHaveCount(3);
      const classField = page.locator(`${FIELDS} > .properties-field[data-original-key="class"]`);
      await expect(classField).toHaveCount(1);
      await expect(classField.locator('.properties-field-origin')).toHaveCount(0);

      // Das bloße Vorhandensein des Bereichs schreibt nichts in das Dokument:
      // Die leeren Angebote bleiben draußen (4T-001172, AK5).
      await editorContains(page, 'class: Projekt');
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).not.toContain('budget:');
      expect(text).not.toContain('thema:');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-14: Zugang zum Feld-Formular über das Reiter-Kontextmenü (F-106)', () => {
  test('Eintrag öffnet den Bereich, auch wenn das Panel verborgen ist', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'notiz.md', ['class: Projekt']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      // Das Panel bleibt bewusst verborgen: Der Eintrag muss es öffnen
      // (4T-001174, AK2 — der Fall, den die Unit-Ebene nicht abdeckt).
      await expect(page.locator(PANEL)).toBeHidden();

      await page.locator(SEL.tabs0).first().click({ button: 'right' });
      const eintrag = page.locator(TAB_MENU_ITEM('tab-field-form'));
      await expect(eintrag).toHaveCount(1);
      await eintrag.click();

      await expect(page.locator(PANEL)).toBeVisible();
      const bereich = page.locator(ALL_FIELDS);
      await expect(bereich).toHaveCount(1);
      await expect(bereich).toHaveAttribute('open', '');
      await expect(page.locator(CHAIN_LEVEL)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-15: Feld-Formular und Vorschlags-Menü nebeneinander (F-106)', () => {
  // 4T-001179 (Epic 3E-000220): Regressionstest zur Regression aus der
  // Release-Abnahme 1.117.0. Die Felder des Formulars hängen bewusst im
  // selben Container wie die Felder des Dokuments; das Vorschlags-Menü zählte
  // sie dadurch als bereits vorhanden und ließ sämtliche Profil-Vorschläge
  // weg — Profil-Köpfe eingeschlossen. PP-01, PP-08 und PP-10 fielen darüber,
  // fixieren die Ursache aber nicht: Sie wären auch grün, wenn es das
  // Formular gar nicht gäbe. Dieser Fall prüft genau die Koexistenz.
  test('Der Ausklapp-Bereich nimmt dem Menü seine Profil-Vorschläge nicht', async () => {
    const areaRoot = makeArea();
    // Wie in PP-13: Das Dokument trägt nur die Zuordnung, status und budget
    // (Projekt) sowie thema (All) sind definiert und fehlen noch.
    const doc = writeDoc(areaRoot, 'notiz.md', ['class: Projekt']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();

      // Der Bereich steht mit seinen drei Angeboten und wird aufgeklappt:
      // der strengere Fall, weil dann alle Angebots-Felder sichtbar im
      // gemeinsamen Container hängen. Den zugeklappten Fall trägt PP-01.
      await expect(
        page.locator(`${ALL_FIELDS} .properties-field.is-nicht-im-dokument`),
      ).toHaveCount(3);
      await page.locator(SUMMARY).click();
      await expect(page.locator(ALL_FIELDS)).toHaveAttribute('open', '');

      // Trotzdem bietet das Menü beide Profile in Auflösungs-Reihenfolge an.
      await page.locator(ADD_BTN).click();
      const koepfe = page.locator(`${MENU_ITEM}.is-profile-head`);
      await expect(koepfe).toHaveCount(2);
      await expect(koepfe.nth(0)).toContainText('Projekt');
      await expect(koepfe.nth(1)).toContainText('All');

      // Und die Einzel-Vorschläge unter den Köpfen sind ebenso da: Sie fielen
      // derselben Ursache zum Opfer, weil sie aus denselben Gruppen stammen.
      const eingerueckt = page.locator(`${MENU_ITEM}.is-indent`);
      for (const name of ['status', 'budget', 'thema']) {
        await expect(eingerueckt.filter({ hasText: name })).toHaveCount(1);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-16: Angebote gelangen nicht ungefragt in das Dokument (F-106)', () => {
  // 4T-001179 (Epic 3E-000220): Zweiter Regressionstest der Release-Abnahme
  // 1.117.0. Die Zusage aus 4T-001172 (AK5) war für Zahlen- und Ja/Nein-Felder
  // gebrochen: Ein leeres Zahlenfeld wird als 0 gelesen, galt damit als Wert
  // und wurde geschrieben, sobald IRGENDEIN Feld einen Save auslöste. PP-13
  // konnte das nicht fangen, weil dort nie gespeichert wird — genau diese
  // Lücke schließt dieser Fall.
  test('Ein Save wegen eines anderen Feldes schreibt keine leeren Angebote', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'notiz.md', ['class: Projekt']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();

      // Ein Feld anlegen und ausfüllen: thema (Profil „All", Typ string).
      // Damit läuft ein ganz gewöhnlicher Debounce-Save.
      await page.locator(ADD_BTN).click();
      await page.locator(`${MENU_ITEM}.is-indent`).filter({ hasText: 'thema' }).click();
      await page.locator(`${PANEL} .properties-field-value input`).last().fill('Test');
      await editorContains(page, 'thema: Test');

      // budget (Zahl) und status (Auswahl) sind unberührte Angebote und
      // haben im Dokument nichts verloren.
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).not.toContain('budget');
      expect(text).not.toContain('status');
      expect(text).toContain('class: Projekt');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});
