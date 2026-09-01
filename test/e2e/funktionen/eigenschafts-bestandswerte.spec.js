// 4T-1340 (Epic 3E-0238): Werte-Vorschläge aus dem vorhandenen Bestand.
//
// Gemessen wird, was am Bedienelement ankommt: Trägt das Wert-Feld eine
// Vorschlagsliste, stehen die im Bereich vergebenen Werte darin, und sind die
// beiden Herkünfte unterscheidbar? Die aufgeklappte Liste selbst zeichnet der
// Browser nativ und ist der Automatisierung nicht zugänglich; ihr Inhalt und
// die Verbindung zum Eingabefeld sind es. Den Blick auf die geöffnete Liste
// nimmt die Abnahme an der gebauten Programmdatei ab.
//
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, F-273).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const {
  FIELDS,
  writeDoc,
  bindAreaAndOpen,
  openPropertiesPanel,
  cleanupDir,
} = require('../helpers/profil-bereich');

// Bereich OHNE Profil-Ordner: der Fall des Product Owners — eine gewöhnliche
// Eigenschaft, für die kein Profil einen Wertevorrat vorgibt.
function makeSchlichtenBereich() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-bestandswerte-'));
  writeDoc(areaRoot, 'a.md', ['status: Geplant']);
  writeDoc(areaRoot, 'b.md', ['status: Fertig']);
  writeDoc(areaRoot, 'c.md', ['status: Geplant']);
  return areaRoot;
}

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-bestandswerte-profil-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Das einzige Eigenschafts-Feld des Dokuments samt seiner Vorschlagsliste.
// Die Vorrichtungen tragen bewusst genau eine Eigenschaft; ein Filter über den
// Feldnamen ginge nicht, weil das Schlüssel-Feld seinen Wert als
// DOM-Eigenschaft trägt und nicht als Attribut.
async function einzigesFeld(page, erwarteterName) {
  const feld = page.locator(`${FIELDS} .properties-field`).first();
  await expect(feld).toBeVisible({ timeout: 15000 });
  await expect(feld.locator('.properties-field-key')).toHaveValue(erwarteterName);
  return feld;
}

test.describe('WB-01: die im Bereich vergebenen Werte stehen im Feld (F-273)', () => {
  test('das Wert-Feld bekommt eine Liste mit den Werten der anderen Dateien', async () => {
    const areaRoot = makeSchlichtenBereich();
    const doc = writeDoc(areaRoot, 'offen.md', ['status: Offen']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      const feld = await einzigesFeld(page, 'status');

      // Die Liste kommt auf Verlangen nach — erst wenn das Feld sein
      // Bedienelement hat, wird sie geholt.
      const eintraege = feld.locator('datalist option');
      await expect(eintraege).toHaveCount(3, { timeout: 15000 });
      expect(await eintraege.evaluateAll((os_) => os_.map((o) => o.value).sort())).toEqual([
        'Fertig',
        'Geplant',
        'Offen',
      ]);

      // Das Eingabefeld zeigt auf genau diese Liste — ohne die Verbindung
      // wäre die Liste im DOM und trotzdem unsichtbar.
      const listenId = await feld.locator('datalist').getAttribute('id');
      await expect(feld.locator('input.properties-field-value-input')).toHaveAttribute(
        'list',
        listenId,
      );

      // Jeder Eintrag trägt den Herkunfts-Hinweis; er unterscheidet die
      // Bestands-Werte von denen eines definierten Wertevorrats.
      const beschriftungen = await eintraege.evaluateAll((os_) => os_.map((o) => o.label));
      expect(beschriftungen.every((l) => l && l.length > 0)).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('WB-02: ohne Vorkommen im Bereich entsteht keine Liste (F-273)', () => {
  test('eine Eigenschaft, die es sonst nirgends gibt, bleibt ohne Vorschläge', async () => {
    // AK4: keine leere Liste — ein leeres Dropdown ist schlechter als keines.
    // Der reale Fall ist die frisch angelegte Eigenschaft: Sie steht im
    // Dokument, hat aber noch keinen Wert, und im Bereich gibt es sie sonst
    // nirgends. Die eigene Datei zählt zum Bereich; ein gesetzter Wert würde
    // sich also selbst vorschlagen (WB-01 zeigt das) und wäre hier kein
    // Nachweis.
    const areaRoot = makeSchlichtenBereich();
    const doc = writeDoc(areaRoot, 'einzeln.md', ['einzelstueck:']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      const feld = await einzigesFeld(page, 'einzelstueck');
      await page.waitForTimeout(1500);
      await expect(feld.locator('datalist option')).toHaveCount(0);
      await expect(feld.locator('input.properties-field-value-input')).not.toHaveAttribute(
        'list',
        /.+/,
      );
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('WB-03: im Aus-Zustand bleibt alles wie zuvor (F-273)', () => {
  test('bei abgeschalteter Erweiterung entsteht keine Vorschlagsliste', async () => {
    // AK5: Der Aus-Zustand stellt das Verhalten vor diesem Epic her. Das Gate
    // sitzt im Hauptprozess — die Werte werden gar nicht erst geholt.
    const areaRoot = makeSchlichtenBereich();
    const doc = writeDoc(areaRoot, 'offen.md', ['status: Offen']);
    const userData = seedProfile({ extensions: { disabled: ['property-value-suggestions'] } });
    const { app, page } = await launchApp({ userData });
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      const feld = await einzigesFeld(page, 'status');
      await page.waitForTimeout(1500);
      await expect(feld.locator('datalist option')).toHaveCount(0);
      await expect(feld.locator('input.properties-field-value-input')).not.toHaveAttribute(
        'list',
        /.+/,
      );
      // Das Feld selbst bleibt bedienbar — abgeschaltet ist die Zusatz-Quelle,
      // nicht die Eingabe.
      await expect(feld.locator('input.properties-field-value-input')).toHaveValue('Offen');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('WB-04: die Liste verkleinert sich mit der Eingabe (F-273)', () => {
  test('getippte Zeichen schränken die Vorschläge ein, ohne die Eingabe zu sperren', async () => {
    // AK2: Die Verkleinerung leistet das Bedienelement selbst; geprüft wird,
    // dass ein Wert ohne Entsprechung eingebbar bleibt — die weiche Haltung
    // des Panels gilt unverändert.
    const areaRoot = makeSchlichtenBereich();
    const doc = writeDoc(areaRoot, 'offen.md', ['status: Offen']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      const feld = await einzigesFeld(page, 'status');
      await expect(feld.locator('datalist option')).toHaveCount(3, { timeout: 15000 });
      const eingabe = feld.locator('input.properties-field-value-input');
      await eingabe.fill('Eigener Wert');
      await expect(eingabe).toHaveValue('Eigener Wert');
      // Die Liste bleibt vollständig; gefiltert wird in der Anzeige, nicht am
      // Bestand.
      await expect(feld.locator('datalist option')).toHaveCount(3);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});
