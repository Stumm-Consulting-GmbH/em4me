// 4T-001712 (Epic 3E-000300): E2E-Funktions-Specs der Uebernahme einer
// Zell-Eingabe auf jedem Weg aus dem Feld heraus. Gemessen hatte der
// Konzept-Task `4T-001710` zwoelf Wege (Mess-Ablaeufe M01 bis M10); auf acht
// davon ging die Eingabe verloren. Jeder im Pruefrahmen erreichbare Weg hat hier
// einen eigenen Fall; der Verlust des Fensterfokus (M05) ist im Pruefrahmen nicht
// ausloesbar und bleibt ein Handgriff an der gebauten Programmdatei.
//
// Ausgangslage aller Faelle: Zelle `b1` der ersten Tabelle oeffnen, `XX`
// anhaengen, dann den Weg gehen. Die Zellen der Fixture-Tabelle in
// Dokument-Reihenfolge: 0 A, 1 B, 2 C (Kopf); 3 a1, 4 b1, 5 c1; 6 a2, 7 leer,
// 8 c2.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'tabellen-klick.md');
const ZWEITE = '# Zweites Dokument\n\nNur Fliesstext.\n';

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Schreibbare Kopien der Fixture: Die Faelle speichern oder wechseln das
// Dokument, und die Fixture selbst bleibt unberuehrt.
function kopien() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-zell-uebernahme-'));
  const erste = path.join(dir, 'tabellen.md');
  const zweite = path.join(dir, 'zweites.md');
  fs.copyFileSync(FIXTURE, erste);
  fs.writeFileSync(zweite, ZWEITE, 'utf8');
  return { dir, erste, zweite };
}

async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const ersteTabelle = (page) => page.locator(`${SEL.editorContent0} .cm-live-block table`).first();
const eingabe = (page) => page.locator('.cm-live-tabelle-eingabe');
const zelleB1 = (page) => ersteTabelle(page).locator('tbody tr').first().locator('td').nth(1);
const zeile = (page, text) =>
  page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: text }).first();

async function datenZeile(page, index) {
  return await ersteTabelle(page).evaluate(
    (t, i) =>
      Array.from(t.querySelectorAll('tbody tr')[i].querySelectorAll('td')).map(
        (c) => c.textContent,
      ),
    index,
  );
}

// Der Quelltext des Dokuments, gelesen aus dem Editor selbst — ohne Wechsel
// der Ansicht, denn der Wechsel ist hier selbst einer der geprueften Wege.
async function quelltext(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    return tile && tile.view ? tile.view.state.doc.toString() : null;
  }, SEL.editorContent0);
}

// Zelle `b1` oeffnen und `XX` anhaengen; das Feld bleibt offen.
async function tippeInB1(page) {
  await zelleB1(page).click();
  await expect(eingabe(page)).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.type('XX');
  await expect(eingabe(page)).toHaveValue('b1XX');
}

async function erwarteUebernommen(page) {
  await expect.poll(async () => (await datenZeile(page, 0))[1]).toBe('b1XX');
  expect(await quelltext(page)).toContain('| a1 | b1XX | c1 |');
}

test.describe('TU-01: Klick weit unterhalb der Tabelle (M01)', () => {
  test('die Eingabe steht danach in der Zelle und im Quelltext (AK1, AK2, AK9)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await zeile(page, 'Ein Code-Block als Gegenprobe').click();
      await expect(eingabe(page)).toHaveCount(0);
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-02: Klick direkt unter die Tabelle (M01b)', () => {
  test('die Eingabe steht danach in der Zelle und im Quelltext (AK1)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await zeile(page, 'Absatz nach der Tabelle.').click();
      await expect(eingabe(page)).toHaveCount(0);
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-03: Klick in eine andere Zelle derselben Tabelle (M02)', () => {
  test('die Eingabe ist uebernommen, und die angeklickte Zelle ist offen (AK7)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      const c1 = ersteTabelle(page).locator('tbody tr').first().locator('td').nth(2);
      await c1.click();
      await expect(c1).toHaveClass(/cm-live-tabelle-bearbeitet/);
      await expect(eingabe(page)).toHaveValue('c1');
      expect(await quelltext(page)).toContain('| a1 | b1XX | c1 |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001969: Beim Klick in eine andere Zelle laufen zwei Schritte gegeneinander,
// die Uebernahme der offenen Eingabe (aufgeschoben aus dem Fokus-Verlust) und
// das Oeffnen der angeklickten Zelle (aufgeschoben in den naechsten Frame).
// Welcher zuerst kommt, hing vom Rechner ab: TU-03 war auf dem Rechner des
// Zug-Clones und unter Linux gruen, auf dem Stamm-Rechner stets rot. Die beiden
// Faelle erzwingen je eine Reihenfolge, damit der Nachweis nicht am Takt des
// Rechners haengt. Gezogen wird nur der Aufschub der Seite, nicht das Programm.
async function erzwingeReihenfolge(page, zuerst) {
  await page.evaluate((z) => {
    window.__vorher = { raf: window.requestAnimationFrame, st: window.setTimeout };
    if (z === 'uebernahme') {
      // Jeder Frame kommt spaeter als jede aufgeschobene Null-Frist.
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (f) => raf(() => window.__vorher.st.call(window, f, 60));
    } else {
      // Jede Null-Frist kommt spaeter als der naechste Frame.
      const st = window.setTimeout.bind(window);
      window.setTimeout = (f, d, ...a) => st(f, d ? d : 120, ...a);
    }
  }, zuerst);
}

async function stelleReihenfolgeWiederHer(page) {
  await page.evaluate(() => {
    window.requestAnimationFrame = window.__vorher.raf;
    window.setTimeout = window.__vorher.st;
  });
}

for (const zuerst of ['uebernahme', 'oeffnen']) {
  test.describe(`TU-03${zuerst === 'uebernahme' ? 'a' : 'b'}: Klick in eine andere Zelle, ${zuerst === 'uebernahme' ? 'Uebernahme vor dem Oeffnen' : 'Oeffnen vor der Uebernahme'} (4T-001969)`, () => {
    test('die Eingabe ist uebernommen, und die angeklickte Zelle ist offen', async () => {
      const { app, page, userData } = await launchApp({ args: [FIXTURE] });
      try {
        await liveBearbeiten(app, page);
        await tippeInB1(page);
        await erzwingeReihenfolge(page, zuerst);
        const c1 = ersteTabelle(page).locator('tbody tr').first().locator('td').nth(2);
        await c1.click();
        await expect(c1).toHaveClass(/cm-live-tabelle-bearbeitet/);
        await expect(eingabe(page)).toHaveValue('c1');
        await stelleReihenfolgeWiederHer(page);
        expect(await quelltext(page)).toContain('| a1 | b1XX | c1 |');
      } finally {
        await closeApp(app, userData, { force: true });
      }
    });
  });
}

test.describe('TU-04: Klick in einen anderen Block, eine zweite Tabelle (M03)', () => {
  test('die Eingabe ist uebernommen, die Zelle der zweiten Tabelle ist offen (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      const zweiteTabelle = page.locator(`${SEL.editorContent0} .cm-live-block table`).nth(1);
      await zweiteTabelle.locator('tbody td').first().click();
      await expect(eingabe(page)).toHaveValue('z1');
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-05: Klick auf die Statusleiste (M03b)', () => {
  test('eine Bedienflaeche ausserhalb des Dokuments uebernimmt ebenso (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      // Eine Stelle der Statusleiste, die keine Schaltflaeche traegt — der
      // Klick soll nichts ausloesen ausser dem Verlassen des Feldes.
      const stelle = await page.evaluate((S) => {
        const leiste = document.querySelector(S);
        const r = leiste.getBoundingClientRect();
        const y = r.top + r.height / 2;
        for (let x = r.left + r.width / 2; x < r.right; x += 4) {
          const el = document.elementFromPoint(x, y);
          if (el && leiste.contains(el) && !el.closest('button, input, select, a, [role]'))
            return { x, y };
        }
        return null;
      }, SEL.statusbar);
      expect(stelle).not.toBeNull();
      await page.mouse.click(stelle.x, stelle.y);
      await expect(eingabe(page)).toHaveCount(0);
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-06: Wechsel des geoeffneten Dokuments (M04)', () => {
  test('die Eingabe ist nach der Rueckkehr da, und das Dokument gilt als geaendert (AK3)', async () => {
    const { erste, zweite } = kopien();
    const { app, page, userData } = await launchApp({ args: [erste, zweite] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await page.locator(SEL.tabs0).nth(0).click();
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await page.locator(SEL.tabs0).nth(1).click();
      await expect(page.locator(SEL.tabs0).nth(1)).toHaveClass(/active/);
      await page.locator(SEL.tabs0).nth(0).click();
      await expect(page.locator(SEL.tabs0).nth(0)).toHaveClass(/active/);
      await expect(ersteTabelle(page)).toBeVisible();
      await erwarteUebernommen(page);
      await expect(page.locator(SEL.tabs0).nth(0)).toHaveClass(/dirty/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-07: Wechsel der Ansicht, Live zu Quelltext (M06)', () => {
  test('die Eingabe steht danach im Quelltext (AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(`${SEL.editorContent0} .cm-live-block`)).toHaveCount(0);
      await expect
        .poll(async () =>
          page
            .locator(SEL.editorContent0)
            .evaluate((el) =>
              Array.from(el.querySelectorAll('.cm-line')).map((z) => z.textContent),
            ),
        )
        .toContain('| a1 | b1XX | c1 |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-08: Speichern mit Strg+S (M07)', () => {
  test('die Datei auf der Platte enthaelt die Eingabe, die Zelle bleibt offen (AK11)', async () => {
    const { erste } = kopien();
    const { app, page, userData } = await launchApp({ args: [erste] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await page.keyboard.press('Control+s');
      await expect.poll(() => fs.readFileSync(erste, 'utf8')).toContain('| a1 | b1XX | c1 |');
      await expect(page.locator(SEL.tabs0).first()).not.toHaveClass(/dirty/);
      // Wie im Fliesstext beendet das Speichern die Arbeit an der Stelle nicht:
      // Die Zelle ist wieder offen, und Weitertippen landet in ihr.
      await expect(eingabe(page)).toHaveValue('b1XX');
      await page.keyboard.type('Y');
      await expect(eingabe(page)).toHaveValue('b1XXY');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-09: Schliessen des Dokuments ueber das Schliess-Kreuz (M08)', () => {
  test('die Eingabe gilt als ungespeicherte Aenderung, es kommt die Nachfrage (AK12)', async () => {
    const { erste, zweite } = kopien();
    const { app, page, userData } = await launchApp({ args: [erste, zweite] });
    try {
      // Die Nachfrage ist ein Dialog des Hauptprozesses; hier gezaehlt und mit
      // «Abbrechen» beantwortet, damit das Dokument offen bleibt.
      await app.evaluate(({ dialog }) => {
        globalThis.__nachfragen = 0;
        dialog.showMessageBox = async () => {
          globalThis.__nachfragen += 1;
          return { response: 2 };
        };
      });
      await page.locator(SEL.tabs0).nth(0).click();
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await page.locator(SEL.tabs0).nth(0).hover();
      await page.locator(SEL.tabs0).nth(0).locator('.tab-close').click();
      await expect.poll(() => app.evaluate(() => globalThis.__nachfragen || 0)).toBe(1);
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-10: Geleerte Zelle, dann Klick nach aussen (M09)', () => {
  test('auch der leere Inhalt wird uebernommen (AK10)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await zelleB1(page).click();
      await expect(eingabe(page)).toBeVisible();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await expect(eingabe(page)).toHaveValue('');
      await zeile(page, 'Ein Code-Block als Gegenprobe').click();
      await expect(eingabe(page)).toHaveCount(0);
      await expect.poll(async () => (await datenZeile(page, 0))[1]).toBe('');
      expect(await quelltext(page)).toMatch(/\n\| a1 \|\s*\| c1 \|\n/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-11: Rechtsklick in die Zelle waehrend der Eingabe (M10)', () => {
  test('die Eingabe geht nicht verloren (AK1)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await zelleB1(page).click({ button: 'right' });
      await expect(page.locator('#context-menu')).toBeVisible();
      await zeile(page, 'Ein Code-Block als Gegenprobe').click();
      await expect(page.locator('#context-menu')).toBeHidden();
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-12: Aenderungs-Zustand und Rueckgaengig nach der Uebernahme', () => {
  test('das Dokument gilt als geaendert, ein Strg+Z nimmt die Uebernahme zurueck (AK8)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await zeile(page, 'Ein Code-Block als Gegenprobe').click();
      await erwarteUebernommen(page);
      await expect(page.locator(SEL.tabs0).first()).toHaveClass(/dirty/);
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await datenZeile(page, 0))[1]).toBe('b1');
      expect(await quelltext(page)).toContain('| a1 | b1 | c1 |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Eine Aenderung von anderer Seite, waehrend das Feld offen ist — so, wie sie
// ein Befehl ueber das Anwendungs-Menue ausloesen koennte. `alt` wird in der
// Tabelle durch `neu` ersetzt.
async function fremdeAenderung(page, alt, neu) {
  await page.evaluate(
    ({ P, von, nach }) => {
      const el = document.querySelector(P);
      let tile = el.cmTile;
      while (tile.parent) tile = tile.parent;
      const view = tile.view;
      const stelle = view.state.doc.toString().indexOf(von);
      view.dispatch({ changes: { from: stelle, to: stelle + von.length, insert: nach } });
    },
    { P: SEL.editorContent0, von: alt, nach: neu },
  );
}

test.describe('TU-13: Fremde Aenderung an einer anderen Zelle waehrend der Eingabe', () => {
  test('die Eingabe wird uebernommen, die fremde Aenderung bleibt stehen (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await fremdeAenderung(page, '| a2 |', '| A2 |');
      await zeile(page, 'Ein Code-Block als Gegenprobe').click();
      await expect(eingabe(page)).toHaveCount(0);
      await erwarteUebernommen(page);
      expect(await quelltext(page)).toContain('| A2 |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TU-14: Fremde Aenderung an derselben Zelle waehrend der Eingabe', () => {
  test('die Bearbeitung bleibt mit dem Text offen, die Eingabetaste uebernimmt sie (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await fremdeAenderung(page, '| b1 |', '| fremd |');
      // Die fremde Aenderung baut das Widget neu, das Feld verliert dabei den
      // Fokus, und die Uebernahme trifft auf den Konflikt. Nicht geschrieben,
      // nicht verworfen: Das Feld steht mit der Eingabe wieder in der Zelle,
      // hat den Fokus, und der Hinweis nennt die beiden Wege.
      await expect(eingabe(page)).toHaveValue('b1XX');
      await expect(eingabe(page)).toBeFocused();
      await expect(page.locator('#statusbar-hint')).toContainText('Eingabetaste');
      expect(await quelltext(page)).toContain('| a1 | fremd | c1 |');
      await page.keyboard.press('Enter');
      await expect(eingabe(page)).toHaveCount(0);
      await erwarteUebernommen(page);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Escape verwirft die Eingabe, die fremde Aenderung bleibt (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await tippeInB1(page);
      await fremdeAenderung(page, '| b1 |', '| fremd |');
      await expect(eingabe(page)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(eingabe(page)).toHaveCount(0);
      await expect.poll(async () => (await datenZeile(page, 0))[1]).toBe('fremd');
      expect(await quelltext(page)).toContain('| a1 | fremd | c1 |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
