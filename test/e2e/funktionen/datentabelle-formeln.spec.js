// 4T-002451 (Epic 3E-000378, Story 4S-001139 AK3, AK4, AK8): Formeln der
// Formel-Bibliothek in der berechneten Spalte einer Datentabelle.
//
// **Warum eine eigene Datei.** datentabelle.spec.js steht an seinem
// Zeilen-Budget; die Fälle der Formel-Gruppen der Stufen 2 und 3 kommen hierher.
// describe-Titel tragen die Funktions-IDs in der Folge von datentabelle.spec.js
// (DT-20 …); die Matrix-Einträge liegen bei help.feature.formulaHumidity (F-395,
// DT-20), help.feature.formulaFinance (F-396, DT-21) und den drei Gruppen von
// 4T-002453, help.feature.formulaPercent (F-397), help.feature.formulaUnit
// (F-398) und help.feature.formulaHealth (F-403), alle mit DT-22.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const de = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
);

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dt20-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

function entferneOrdner(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// DT-20: an der Taupunkt 9.3 in der Zeile 20 °C und 50 %, in der Zeile mit
// 120 % der Strich mit der Bereichs-Meldung beim Darüberfahren; aus (Erweiterung
// im Profil ausgeschaltet) der Strich mit «Formel-Bibliothek ausgeschaltet» in
// jeder Zelle der Spalte, die Grundfunktion daneben rechnet, und die Tabelle
// bleibt ohne Fehlerkasten.
test.describe('DT-20: Formel der Formel-Bibliothek in der berechneten Spalte, an und aus (4T-002451)', () => {
  test('an: 9.3 und die Bereichs-Meldung; aus: der Hinweis der Bibliothek je Zelle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dt20-'));
    const datei = path.join(dir, 'Klima.md');
    const spalten =
      'columns: Temp:number, Feuchte:number, ' +
      'Taupunkt:number = round(humidity.dewpoint(Temp, Feuchte), 1), ' +
      'Kreis:number(2) = round(pi() * Temp, 2)';
    fs.writeFileSync(
      datei,
      `# Klima\n\n\`\`\`perspective-datatable\n${spalten}\n| 20 | 50 |\n| 20 | 120 |\n\`\`\`\n`,
      'utf8',
    );
    const zelle = (page, zeile, spalte) =>
      page
        .locator(SEL.markdownBody0)
        .locator(`.pdt-grid tr[data-dt-row="${zeile}"] td[data-dt-col="${spalte}"]`);

    const an = await launchApp({ args: [datei] });
    try {
      await expect(an.page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(zelle(an.page, 0, 2)).toHaveText('9.3');
      await expect(zelle(an.page, 0, 2)).toHaveClass(/pdt-computed/);
      const meldung = zelle(an.page, 1, 2);
      await expect(meldung).toHaveText('—');
      await expect(meldung).toHaveClass(/pdt-cell-error/);
      await expect(meldung).toHaveAttribute(
        'title',
        de['query.formula.humidity.relativeRangeDewpoint'],
      );
      await expect(an.page.locator(`${SEL.markdownBody0} .pdt-errors`)).toHaveCount(0);
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }

    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await expect(aus.page.locator(SEL.tabs0).first()).toBeVisible();
      for (const zeile of [0, 1]) {
        await expect(zelle(aus.page, zeile, 2)).toHaveText('—');
        await expect(zelle(aus.page, zeile, 2)).toHaveAttribute(
          'title',
          de['query.formulaLibraryOff'],
        );
      }
      await expect(zelle(aus.page, 0, 3)).toHaveText('62.83');
      await expect(aus.page.locator(`${SEL.markdownBody0} .pdt-errors`)).toHaveCount(0);
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      entferneOrdner(dir);
    }
  });
});

// DT-21 (4T-002452, Story 4S-001139 AK3, AK6, AK8): die Rate der Story in zwei
// berechneten Spalten, einmal aus den Feldern der Zeile, einmal mit dem
// Ausdruck des Abnahme-Handgriffs. An −1037.03 in beiden Spalten der Zeile mit
// 10 Monaten; in der Zeile mit Laufzeit 0 der Strich mit der Bereichs-Meldung,
// die feste Spalte rechnet. Aus der Strich mit «Formel-Bibliothek
// ausgeschaltet» in jeder Zelle beider Spalten, ohne Fehlerkasten.
test.describe('DT-21: Formel der Finanzmathematik in der berechneten Spalte, an und aus (4T-002452)', () => {
  test('an: −1037.03 in beiden Spalten und die Bereichs-Meldung; aus: der Hinweis je Zelle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dt21-'));
    const datei = path.join(dir, 'Kredit.md');
    const spalten =
      'columns: Zins:number, Monate:number, Betrag:number, ' +
      'Rate:number = round(finance.pmt(Zins / 12, Monate, Betrag), 2), ' +
      'Fest:number = round(finance.pmt(0.08/12, 10, 10000), 2)';
    fs.writeFileSync(
      datei,
      `# Kredit\n\n\`\`\`perspective-datatable\n${spalten}\n| 0.08 | 10 | 10000 |\n| 0.08 | 0 | 10000 |\n\`\`\`\n`,
      'utf8',
    );
    const zelle = (page, zeile, spalte) =>
      page
        .locator(SEL.markdownBody0)
        .locator(`.pdt-grid tr[data-dt-row="${zeile}"] td[data-dt-col="${spalte}"]`);

    const an = await launchApp({ args: [datei] });
    try {
      await expect(an.page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(zelle(an.page, 0, 3)).toHaveText('-1037.03');
      await expect(zelle(an.page, 0, 4)).toHaveText('-1037.03');
      await expect(zelle(an.page, 1, 4)).toHaveText('-1037.03');
      const meldung = zelle(an.page, 1, 3);
      await expect(meldung).toHaveText('—');
      await expect(meldung).toHaveClass(/pdt-cell-error/);
      await expect(meldung).toHaveAttribute('title', de['query.formula.finance.periodsRange']);
      await expect(an.page.locator(`${SEL.markdownBody0} .pdt-errors`)).toHaveCount(0);
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }

    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await expect(aus.page.locator(SEL.tabs0).first()).toBeVisible();
      for (const zeile of [0, 1]) {
        for (const spalte of [3, 4]) {
          await expect(zelle(aus.page, zeile, spalte)).toHaveText('—');
          await expect(zelle(aus.page, zeile, spalte)).toHaveAttribute(
            'title',
            de['query.formulaLibraryOff'],
          );
        }
      }
      await expect(aus.page.locator(`${SEL.markdownBody0} .pdt-errors`)).toHaveCount(0);
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      entferneOrdner(dir);
    }
  });
});

// DT-22 (4T-002453, Story 4S-001140 AK3, AK5, AK6, AK8): der Body-Mass-Index
// des Abnahme-Handgriffs in einer berechneten Spalte, daneben eine Spalte der
// Prozentrechnung und eine der Einheiten-Umrechnung aus den Feldern der Zeile.
// An 22.9, 105 und 68.9 in der Zeile 70 kg und 1.75 m; in der Zeile mit
// Größe 0 der Strich mit der Bereichs-Meldung, die beiden übrigen Spalten
// rechnen. Aus der Strich mit «Formel-Bibliothek ausgeschaltet» in jeder Zelle
// der drei Spalten, ohne Fehlerkasten.
test.describe('DT-22: Formeln für Prozent, Einheiten und Body-Mass-Index in der berechneten Spalte, an und aus (4T-002453)', () => {
  test('an: 22.9, 105, 68.9 und die Bereichs-Meldung; aus: der Hinweis je Zelle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dt22-'));
    const datei = path.join(dir, 'Person.md');
    const spalten =
      'columns: Masse:number, Größe:number, ' +
      'BMI:number = round(health.bmi(Masse, Größe), 1), ' +
      'Mehr:number = percent.increase(Masse, 50), ' +
      'Zoll:number = round(unit.metertoinch(Größe), 1)';
    fs.writeFileSync(
      datei,
      `# Person\n\n\`\`\`perspective-datatable\n${spalten}\n| 70 | 1.75 |\n| 70 | 0 |\n\`\`\`\n`,
      'utf8',
    );
    const zelle = (page, zeile, spalte) =>
      page
        .locator(SEL.markdownBody0)
        .locator(`.pdt-grid tr[data-dt-row="${zeile}"] td[data-dt-col="${spalte}"]`);

    const an = await launchApp({ args: [datei] });
    try {
      await expect(an.page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(zelle(an.page, 0, 2)).toHaveText('22.9');
      await expect(zelle(an.page, 0, 3)).toHaveText('105');
      await expect(zelle(an.page, 0, 4)).toHaveText('68.9');
      const meldung = zelle(an.page, 1, 2);
      await expect(meldung).toHaveText('—');
      await expect(meldung).toHaveClass(/pdt-cell-error/);
      await expect(meldung).toHaveAttribute('title', de['query.formula.health.heightRange']);
      await expect(zelle(an.page, 1, 3)).toHaveText('105');
      await expect(an.page.locator(`${SEL.markdownBody0} .pdt-errors`)).toHaveCount(0);
    } finally {
      await closeApp(an.app, an.userData, { force: true });
    }

    const aus = await launchApp({
      args: [datei],
      userData: seedProfile({ extensions: { disabled: ['formula-library'] } }),
    });
    try {
      await expect(aus.page.locator(SEL.tabs0).first()).toBeVisible();
      for (const zeile of [0, 1]) {
        for (const spalte of [2, 3, 4]) {
          await expect(zelle(aus.page, zeile, spalte)).toHaveText('—');
          await expect(zelle(aus.page, zeile, spalte)).toHaveAttribute(
            'title',
            de['query.formulaLibraryOff'],
          );
        }
      }
      await expect(aus.page.locator(`${SEL.markdownBody0} .pdt-errors`)).toHaveCount(0);
    } finally {
      await closeApp(aus.app, aus.userData, { force: true });
      entferneOrdner(dir);
    }
  });
});
