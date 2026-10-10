// 4T-000616 (Epic 3E-000116): E2E-Funktions-Suite — Bereichs-Suche.
//
// Kern der Zusage: Wer in einer Datei eines geoeffneten Bereichs sucht,
// findet auch, was in einer ANDEREN, nicht geoeffneten Datei desselben
// Bereichs steht. Geprueft werden der Trefferraum, der Rang der offenen
// Datei samt ihrem ungespeicherten Stand, die Markierung im Text ohne Klick,
// der Sprung in eine fremde Datei, der Durchlauf ueber die Datei-Grenze und
// das unveraenderte Verhalten ohne Bereich.
//
// Der Bereich wird ueber den Pfad-Einstieg window.api.openAreaPath gebunden
// (Muster bereiche.spec.js und bereichs-lesezeichen.spec.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { pressNachfassend } = require('../helpers/eingabe');

const PANE = '.pane-group[data-pane="0"]';
const PANEL = `${PANE} .sidebar-searchresults`;
const BEGRIFF = 'Zwiebelkuchen';

// Der Suchbegriff ist bewusst ein Kunstwort: So kann kein Treffer aus einer
// mitgelieferten Datei oder aus der Oberflaeche stammen.
function makeAreaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bereichssuche-'));
  fs.writeFileSync(
    path.join(dir, 'start.md'),
    `# Start\n\nHier steht ${BEGRIFF} einmal.\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'zweite.md'),
    `# Zweite\n\n${BEGRIFF} und noch einmal ${BEGRIFF}.\n`,
    'utf8',
  );
  fs.mkdirSync(path.join(dir, 'unter'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'unter', 'dritte.md'),
    `# Dritte\n\nAuch hier: ${BEGRIFF}.\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'ohne.md'), '# Ohne\n\nNichts zu finden.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

// 4T-001689: Bereich und Dokument im selben Fenster entstehen in fester
// Reihenfolge — ohne Datei-Argument starten, binden, dann das Dokument mit
// oeffneDokumentImFenster öffnen. Mit Datei-Argument zu starten und danach zu
// binden ist ein Rennen: Ist das Dokument schon gemeldet, öffnet der Bereich
// ein eigenes Fenster, und die Zusicherung unten wird rot (gemessen unter
// Rechenlast; test/README.md, Regel 32).
async function bindArea(page, dir) {
  const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
  expect(res.boundExisting).toBe(true);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

// Die Tastatur-Bindings stehen erst am Ende des asynchronen init(); ein
// sichtbarer Reiter ist das Bereitschafts-Signal (Muster der Smoke-Suite und
// der Handbuch-Such-Spec).
async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function sucheOeffnen(page, begriff) {
  await warteAufReiter(page);
  await page.keyboard.press('Control+f');
  const input = page.locator('#search-input');
  await expect(input).toBeVisible();
  await input.fill(begriff);
}

// Die Gruppen-Koepfe der Trefferliste in ihrer Reihenfolge.
function gruppen(page) {
  return page.locator(`${PANEL} .search-results-group .search-results-group-title`);
}

// Der Suchlauf im Bereich laeuft ueber die Prozess-Grenze und ist damit
// asynchron; ohne dieses Warten liest ein Test die noch leere Liste.
async function warteAufTreffer(page, anzahlGruppen) {
  await expect(gruppen(page)).toHaveCount(anzahlGruppen);
}

test.describe('BS-01: Trefferraum ueber alle Bereichs-Dateien', () => {
  test('findet Fundstellen in Dateien, die gar nicht geoeffnet sind', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'start.md'));
      await sucheOeffnen(page, BEGRIFF);

      // Die Suchleiste weist den Bereich als Suchraum aus.
      await expect(page.locator('#search-scope')).toHaveText(/Bereich/i);

      // Drei Dateien tragen den Begriff, 'ohne.md' nicht.
      await expect(gruppen(page)).toHaveCount(3);
      const titel = await gruppen(page).allTextContents();
      expect(titel.some((t) => t.includes('zweite'))).toBe(true);
      expect(titel.some((t) => t.includes('unter/dritte'))).toBe(true);
      expect(titel.some((t) => t.includes('ohne'))).toBe(false);

      // 4T-001525 (Epic 3E-000169, AK6): Die Auswahl-Ebene des bereichsweiten
      // Ersetzens erscheint erst mit dem Ersetzen-Modus. Bei der gewoehnlichen
      // Suche ist die Liste die von 4T-000759 — kein Ankreuzfeld, kein Raster.
      // Die Zusicherung haengt hier an einem Fall, der den Bereich ohnehin
      // bindet und sucht; ein eigener Fall kostete einen Programm-Start fuer
      // zwei Zusicherungen (E2E-Budget der Release-Abnahme).
      await expect(page.locator(`${PANEL} .search-results-check`)).toHaveCount(0);
      await expect(page.locator(`${PANEL} .search-results-list`)).not.toHaveClass(/auswahl-modus/);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// B-01 (4T-000904): Dieser Fall ist zugleich der szenario-treue Regressionstest
// zur stillen Ausnahme in setCurrentMatch. Er stellt genau die gemeldete Lage
// her — geoeffneter Bereich (Geltungsbereich 'area') plus offene Datei im
// Editor, deren Treffer ueber performSourceSearch als Editor-Positionen
// entstehen. Rot wurde er nicht an einer eigenen Zusicherung, sondern ueber den
// Konsolen-Waechter aus 4T-000901: Die Ausnahme brach die Markierung still ab.
test.describe('BS-02: offene Datei zuerst, mit ihrem Editor-Stand', () => {
  test('stellt die offene Datei voran und findet Ungespeichertes', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'start.md'));
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);
      // Die offene Datei steht an erster Stelle der Liste.
      await expect(gruppen(page).first()).toHaveText(/start/);
      await page.keyboard.press('Escape');

      // Ungespeicherte Ergaenzung im Editor: Der Bearbeiten-Modus schreibt in
      // tab.content, und genau der wandert mit dem Suchauftrag hinueber.
      await page.keyboard.press('Control+e');
      // Der Selektor muss mit .pane-source qualifiziert sein: '.cm-content'
      // allein trifft auch die Notiz-CodeMirror-Instanz der Sidebar.
      const editor = page.locator(`${PANE} .pane-source .cm-content`);
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(`\n\nNachtrag mit ${BEGRIFF} und ${BEGRIFF}.`);

      await sucheOeffnen(page, BEGRIFF);
      await expect(gruppen(page).first()).toHaveText(/start/);
      // Einer aus der Datei plus zwei ungespeicherte.
      const ersteZahl = page
        .locator(`${PANEL} .search-results-group .search-results-group-count`)
        .first();
      await expect(ersteZahl).toHaveText('3');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BS-03: Markierung im Text ohne Klick', () => {
  test('markiert die Treffer der offenen Datei sofort', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'zweite.md'));
      await sucheOeffnen(page, BEGRIFF);
      // Ohne einen einzigen Klick in die Liste stehen die Marken im Text.
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match`)).toHaveCount(2);
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match-current`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BS-04: Sprung in eine andere Datei', () => {
  test('oeffnet die Zieldatei und hebt die Fundstelle hervor', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'start.md'));
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);

      // Treffer einer FREMDEN Datei anklicken.
      const zeile = page
        .locator(`${PANEL} .search-results-group`, { hasText: 'unter/dritte' })
        .locator('xpath=following-sibling::button[contains(@class,"search-results-item")][1]');
      await zeile.click();

      await expect.poll(() => page.title()).toContain('dritte');
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match-current`)).toHaveCount(1);
      // Reihenfolge mit Anker start.md: start(1), unter/dritte(1), zweite(2).
      // Der angeklickte Fund ist damit global der zweite — und bleibt es, weil
      // die Liste sich durch den Sprung nicht umsortiert.
      await expect(page.locator('#search-count')).toHaveText('2 / 4');
      // Die Gruppen-Reihenfolge ueberlebt den Sprung unveraendert.
      await expect(gruppen(page).first()).toHaveText(/start/);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BS-05: Durchlauf ueber die Datei-Grenze', () => {
  test('F3 laeuft aus der offenen Datei in die naechste weiter', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'start.md'));
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);
      // start.md steht als offene Datei vorn und traegt genau einen Treffer.
      // 4T-002107: Der erste Druck zeigt diesen Treffer (Zaehler «1 / 4»,
      // Datei bleibt); erst der zweite muss in eine andere Datei fuehren.
      // Bis dahin uebersprang der erste Druck den aktuellen Treffer.
      await page.keyboard.press('F3');
      await expect(page.locator('#search-count')).toHaveText('1 / 4');
      expect(await page.title()).toContain('start');
      // Nachfassend: Der erste Druck hat in der kurzen Datei keine sichtbare
      // Wirkung, ein verlorener (4T-001410) faellt erst hier auf.
      await pressNachfassend(page, 'F3', async () => !(await page.title()).includes('start'));
      await expect.poll(() => page.title(), { timeout: 15000 }).not.toContain('start');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });

  // Befund des Product Owners vom 2026-07-29: Der Zaehler lief nie ueber die
  // Datei hinaus, er zeigte „1 von 4" in drei verschiedenen Dateien. Ursache
  // war die Umsortierung der Liste bei jedem Sprung; die Anker-Datei haelt sie
  // jetzt stabil. Ohne diese Korrektur ist dieser Fall rot.
  test('der Zaehler laeuft ueber alle Treffer des Bereichs, nicht je Datei', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'start.md'));
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);

      const zaehler = page.locator('#search-count');
      await expect(zaehler).toHaveText('1 / 4');
      // 4T-002107: Erst der Klick auf den ersten Eintrag der Liste springt ihn
      // an. Ohne ihn zeigte der erste F3-Druck diesen Treffer (Zaehler bleibt
      // «1 / 4»), und ein Druck ohne sichtbare Wirkung liesse sich hier nicht
      // als zugestellt belegen. Ein angesprungener Treffer wird beim naechsten
      // Druck verlassen — genau die Folge, die dieser Fall misst.
      await page.locator(`${PANEL} .search-results-item`).first().click();
      await expect(zaehler).toHaveText('1 / 4');
      // 4T-001410: Der Druck wird zugestellt, nicht bloss abgeschickt. Gemessen
      // am 2026-09-05 geht unter Last ein F3 verloren, ohne dass die Anwendung
      // eine Bedingung dafuer setzt; `pressUntil` scheidet aus, weil F3 den
      // Zeiger je Druck weiterrueckt. Erwartet wird deshalb der GENAUE
      // Zielstand: Ein doppelt zugestellter Druck faellt damit auf, statt sich
      // in einer weichen Bedingung zu verstecken.
      const gesehen = ['1 / 4'];
      for (const ziel of ['2 / 4', '3 / 4', '4 / 4']) {
        await pressNachfassend(page, 'F3', async () => (await zaehler.textContent()) === ziel);
        gesehen.push((await zaehler.textContent()).trim());
      }
      expect(gesehen).toEqual(['1 / 4', '2 / 4', '3 / 4', '4 / 4']);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// 4T-001561 (Epic 3E-000280): Die Tastatur-Führung der Trefferliste trug bis
// dahin genau einen Druck — das Neuzeichnen verwarf den Fokus. Der Fall misst
// deshalb ZWEI Bewegungen und den Sprung danach; mit einem Druck wäre er auch
// vor der Behebung grün gewesen.
test.describe('BS-07: Tastatur-Führung der Trefferliste', () => {
  test('bewegt sich zweimal und springt dann in die Zieldatei', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, dir);
      await oeffneDokumentImFenster(app, page, path.join(dir, 'start.md'));
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);

      // Reihenfolge mit Anker start.md: start(1), unter/dritte(1), zweite(2).
      const zeilen = page.locator(`${PANEL} .search-results-item`);
      await zeilen.first().focus();
      // 4T-001533 (Epic 3E-000175): Zwischen den beiden Drücken wird auf die
      // Wirkung des ersten gewartet. Gemessen am 2026-09-08 über elf Läufe
      // zweier Stände fiel der Fall in vier davon, und zwar ausschließlich in
      // den langsamen (34 s gegen 22 bis 27 s): Der zweite Druck traf ein,
      // bevor die Fokus-Rückgabe des ersten fertig war, landete damit außerhalb
      // des Panels und erreichte den Handler nicht.
      //
      // **Bewusst kein Wiederhol-Helfer.** `pressUntil` scheidet aus, weil
      // ArrowDown die Auswahl je Druck weiterrückt; `pressNachfassend` ist an
      // dieser Stelle gemessen ebenfalls falsch — es fasst nach einer Sekunde
      // nach, und unter genau der Last, die den Fall überhaupt fallen lässt,
      // trifft das den bloß langsamen statt den verlorenen Druck: Die Auswahl
      // springt dann über das Ziel hinaus und die Bedingung wird nie wahr
      // (belegt am 2026-09-08). Hier ist der Druck nicht verloren, er kommt
      // nur zu früh — dagegen hilft das Warten und nicht das Nachfassen.
      //
      // **Die Zusicherung des Falls bleibt unverändert** (4T-001561): Zwei
      // Bewegungen kommen an, nicht bloß eine. Gemessen wird jetzt jede
      // einzeln, statt beide gegen ein Rennen mit dem Neuzeichnen zu setzen.
      await page.keyboard.press('ArrowDown');
      await expect(zeilen.nth(1)).toHaveClass(/selected/);
      await page.keyboard.press('ArrowDown');
      // Die dritte Zeile ist gewählt — das belegt, dass der zweite Druck
      // angekommen ist.
      await expect(zeilen.nth(2)).toHaveClass(/selected/);

      await page.keyboard.press('Enter');
      await expect.poll(() => page.title()).toContain('zweite');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BS-06: ohne Bereich bleibt es bei der Dokument-Suche', () => {
  test('durchsucht eine lose Datei nur in sich selbst', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      // Bewusst KEIN bindArea: Die Datei ist lose geoeffnet.
      await sucheOeffnen(page, BEGRIFF);
      await expect(page.locator('#search-scope')).not.toHaveText(/Bereich/i);
      // Die Trefferliste bleibt leer, die Marken stehen im Dokument.
      await expect(gruppen(page)).toHaveCount(0);
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// 4T-002099: Der Sprung in eine andere Datei rollt in der Lese-Ansicht zur
// Fundstelle. BS-04 prüft nur, DASS die Fundstelle hervorgehoben ist; in einer
// kurzen Datei ist sie ohnehin sichtbar. Vor der Behebung setzte das Rendern
// des aktivierten Ziel-Reiters die gemerkte Roll-Lage nachträglich zurück, und
// die Fundstelle blieb unterhalb des sichtbaren Bereichs.
test.describe('BS-08: Sprung rollt zur Fundstelle (4T-002099)', () => {
  test('4T-002099: Klick auf einen Treffer weit unten in einer nicht geöffneten Datei bringt die Fundstelle in den sichtbaren Bereich', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const absaetze = [];
    for (let i = 1; i <= 300; i++) absaetze.push(`Absatz ${i}: Fülltext ohne den Suchbegriff.`);
    fs.writeFileSync(
      path.join(dir, 'lang.md'),
      `# Lang\n\n${absaetze.join('\n\n')}\n\nGanz unten steht Quittengelee.\n`,
      'utf8',
    );
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, 'Quittengelee');
      await warteAufTreffer(page, 1);
      await page.locator(`${PANEL} .search-results-item`).first().click();

      await expect.poll(() => page.title()).toContain('lang');
      const aktuell = page.locator(`${PANE} .pane-rendered mark.mdv-match-current`);
      await expect(aktuell).toHaveCount(1);
      const sichtbar = () =>
        page.evaluate((pane) => {
          const roll = document.querySelector(`${pane} .pane-rendered`);
          const mark = roll && roll.querySelector('mark.mdv-match-current');
          if (!mark) return false;
          const r = mark.getBoundingClientRect();
          const c = roll.getBoundingClientRect();
          return r.top >= c.top && r.bottom <= c.bottom;
        }, PANE);
      await expect.poll(sichtbar).toBe(true);
      // Auch nach dem abgeschlossenen Render-Zyklus des Ziel-Reiters.
      await page.waitForTimeout(500);
      expect(await sichtbar()).toBe(true);
      await expect(page.locator('#search-count')).toHaveText('1 / 1');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// 4T-002107: «Die erste Eingabetaste soll zum ersten Treffer springen»
// (Entscheidung des Product Owners vom 2026-10-03). Die offene Datei führt die
// Trefferliste an und trägt den ersten Treffer weit unten; nach dem Tippen ist
// er markiert, aber nicht angerollt. Vorher ging die erste Eingabetaste von
// dort zum ZWEITEN Treffer, der erste wurde nie gezeigt.
test.describe('BS-09: Die erste Eingabetaste zeigt den ersten Treffer (4T-002107)', () => {
  test('4T-002107: Tippen bewegt nichts, die erste Eingabetaste zeigt «1 / 6», die zweite «2 / 6»', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const absaetze = [];
    for (let i = 1; i <= 200; i++) absaetze.push(`Absatz ${i}: Fülltext ohne den Suchbegriff.`);
    // start.md: drei Treffer, alle unterhalb des ersten Bildschirms; dazu zwei
    // in zweite.md und einer in unter/dritte.md.
    fs.writeFileSync(
      path.join(dir, 'start.md'),
      `# Start\n\n${absaetze.join('\n\n')}\n\nErster ${BEGRIFF} unten.\n\n` +
        `${absaetze.slice(0, 40).join('\n\n')}\n\nZweiter ${BEGRIFF} unten.\n\nDritter ${BEGRIFF}.\n`,
      'utf8',
    );
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);
      const zaehler = page.locator('#search-count');
      await expect(zaehler).toHaveText('1 / 6');
      const aktuell = page.locator(`${PANE} .pane-rendered mark.mdv-match-current`);
      await expect(aktuell).toHaveCount(1);
      const lage = () =>
        page.evaluate((pane) => {
          const roll = document.querySelector(`${pane} .pane-rendered`);
          const mark = roll && roll.querySelector('mark.mdv-match-current');
          if (!mark) return { sichtbar: false, absatz: '', rollen: roll ? roll.scrollTop : -1 };
          const r = mark.getBoundingClientRect();
          const c = roll.getBoundingClientRect();
          return {
            sichtbar: r.top >= c.top && r.bottom <= c.bottom,
            absatz: (mark.closest('p') || mark).textContent,
            rollen: roll.scrollTop,
          };
        }, PANE);
      // Das Tippen markiert den ersten Treffer, rollt aber nicht.
      const vorher = await lage();
      expect(vorher.rollen).toBe(0);
      expect(vorher.sichtbar).toBe(false);
      expect(vorher.absatz).toContain('Erster');

      await page.keyboard.press('Enter');
      await expect
        .poll(async () => {
          const l = await lage();
          return l.sichtbar && l.absatz.startsWith('Erster');
        })
        .toBe(true);
      await expect(zaehler).toHaveText('1 / 6');
      expect(await page.title()).toContain('start');

      await page.keyboard.press('Enter');
      await expect(zaehler).toHaveText('2 / 6');
      await expect
        .poll(async () => {
          const l = await lage();
          return l.sichtbar && l.absatz.startsWith('Zweiter');
        })
        .toBe(true);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// 4T-002107: B-10 (4T-000904) im Bereichs-Raum. Bei geöffnetem Bereich lief der
// Markier-Weg der offenen Datei nach JEDEM Suchlauf und setzte im Editor die
// Schreibmarke auf den aktuellen Treffer. Gemessen am 2026-10-03 in Quellcode
// und Geteilt: Aus «Termin», getippt in einer anderen Zeile, wurde ein «T» dort
// und ein «ermin» mitten im Treffer. Szenario-treu wie die B-10-Spec: Suche
// offen, Schreibmarke in einer anderen Zeile, erstes Zeichen, Pause über das
// Debounce hinaus, restliche Zeichen — in beiden Editor-Ansichten.
test.describe('BS-10: Tippen bei offener Bereichs-Suche schreibt an der Schreibmarke (4T-002107)', () => {
  for (const modus of ['source', 'split']) {
    test(`4T-002107: ${modus} — Suchlauf bewegt die Schreibmarke nicht, getippter Text bleibt in seiner Zeile`, async () => {
      test.setTimeout(120000);
      const dir = makeAreaDir();
      const fuell = [];
      for (let i = 1; i <= 120; i++) fuell.push(`Fülltext ${i}.`);
      fs.writeFileSync(
        path.join(dir, 'start.md'),
        `# Start\n\nNotiz: \n\n${fuell.join('\n\n')}\n\nHier steht ${BEGRIFF} unten.\n\n` +
          `${fuell.slice(0, 40).join('\n\n')}\n\nNoch einmal ${BEGRIFF} ganz unten.\n`,
        'utf8',
      );
      const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
      try {
        await bindArea(page, dir);
        await warteAufReiter(page);
        await page.locator(SEL.viewBtn(modus)).click();
        await page.locator(SEL.btnEdit).click();
        const editor = page.locator(SEL.editorContent0);
        await expect(editor).toHaveAttribute('contenteditable', 'true');
        await editor.locator('.cm-line', { hasText: 'Notiz:' }).click();
        await page.keyboard.press('End');

        await page.keyboard.press('Control+f');
        await page.locator('#search-input').fill(BEGRIFF);
        await warteAufTreffer(page, 3);
        await expect(page.locator('#search-count')).toHaveText('1 / 5');
        // Der Suchlauf hat die Schreibmarke nicht auf den Treffer gezogen.
        await page.waitForTimeout(400);
        await expect(editor.locator('.cm-activeLine')).toHaveText(/^Notiz:\s*$/);

        // Zurück in den Editor an dieselbe Stelle und tippen.
        await editor.locator('.cm-line', { hasText: 'Notiz:' }).click();
        await page.keyboard.press('End');
        await page.keyboard.type('T');
        await page.waitForTimeout(400);
        await page.keyboard.type('ermin');
        await page.waitForTimeout(400);

        const text = await editor.innerText();
        expect(text).toContain('Notiz: Termin');
        expect(text).not.toContain(`ermin${BEGRIFF}`);
        expect(text).not.toContain(`${BEGRIFF}ermin`);

        // Die Gegenrichtung: Der Sprung bewegt weiterhin, auch innerhalb der
        // offenen Datei. Der zweite Sprung dort wurde von der ersten Fassung
        // dieser Behebung durch die Roll-Wiederherstellung des Reiters wieder
        // zurückgesetzt (Schreibmarke auf dem Treffer, Ansicht oben).
        await page.keyboard.press('Control+f');
        const zaehler = page.locator('#search-count');
        const aktuellSichtbar = (anfang) =>
          page.evaluate(
            ({ pane, text: t }) => {
              const roll = document.querySelector(`${pane} .pane-source .cm-scroller`);
              const m = roll && roll.querySelector('.cm-search-match-current');
              const zeile = m && m.closest('.cm-line');
              if (!zeile) return false;
              const r = m.getBoundingClientRect();
              const c = roll.getBoundingClientRect();
              return r.top >= c.top && r.bottom <= c.bottom && zeile.textContent.startsWith(t);
            },
            { pane: PANE, text: anfang },
          );
        await page.keyboard.press('Enter');
        await expect.poll(() => aktuellSichtbar('Hier steht')).toBe(true);
        await expect(zaehler).toHaveText('1 / 5');
        await page.keyboard.press('Enter');
        await expect(zaehler).toHaveText('2 / 5');
        await expect.poll(() => aktuellSichtbar('Noch einmal')).toBe(true);
        await page.waitForTimeout(300);
        expect(await aktuellSichtbar('Noch einmal')).toBe(true);
      } finally {
        await closeApp(app, userData, { force: true });
        removeDir(dir);
      }
    });
  }
});

// 4T-002113: Der Sprung in ein anderes Dokument, vorwärts wie rückwärts, zeigt
// den aktuellen Treffer als aktuellen. Gemeldet am gebauten Programm für den
// Rückwärts-Sprung; gemessen am 2026-10-03 traf es jede Richtung und jede
// Suche in «Gerendert»: Der aktuelle Treffer trug seine Klasse, aber die Regel
// der Hervorhebung `==Text==` gab ihm dieselbe Farbe wie allen übrigen. Die
// Fälle messen deshalb die berechnete Farbe und nicht bloß die Klasse.
//
// Die Ansicht des Ziels folgt der Regel des Öffnens, in beiden Richtungen
// gleich: Ein noch nicht geöffnetes Dokument öffnet in der Standard-Ansicht
// der Einstellungen (im Prüf-Profil «Gerendert»), ein geöffnetes behält seine
// eigene Ansicht. Die Ansicht des Ausgangs-Dokuments spielt keine Rolle.
function makeDatenDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bereichssuche-4t2113-'));
  fs.writeFileSync(
    path.join(dir, 'start.md'),
    `# Start\n\nOben ${BEGRIFF}.\n\nUnten ${BEGRIFF}.\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'daten.md'),
    `# Daten\n\nErster ${BEGRIFF} hier.\n\nZweiter ${BEGRIFF} hier.\n\nDritter ${BEGRIFF} hier.\n`,
    'utf8',
  );
  return dir;
}

// Der aktuelle Treffer der Lese-Ansicht: wie viele Marken die Klasse tragen,
// ob die eine sichtbar ist, in welchem Absatz sie steht und ob ihre Farbe sich
// von der jeder übrigen Marke unterscheidet.
function aktuellerTrefferGerendert(page) {
  return page.evaluate((pane) => {
    const roll = document.querySelector(`${pane} .pane-rendered`);
    const marken = [...roll.querySelectorAll('mark.mdv-match')];
    const aktuelle = marken.filter((m) => m.classList.contains('mdv-match-current'));
    const farbe = (m) => getComputedStyle(m).backgroundColor;
    const m = aktuelle[0];
    const r = m && m.getBoundingClientRect();
    const c = roll.getBoundingClientRect();
    const uebrige = marken.filter((x) => x !== m).map(farbe);
    return {
      anzahl: aktuelle.length,
      sichtbar: !!m && r.top >= c.top && r.bottom <= c.bottom,
      absatz: m ? (m.closest('p') || m).textContent : '',
      abgehoben: !!m && uebrige.length > 0 && uebrige.every((f) => f !== farbe(m)),
    };
  }, PANE);
}

function aktiveAnsicht(page) {
  return page.locator('.view-toggle .view-btn.active').getAttribute('data-view');
}

async function sucheInQuellcode(page) {
  await page.locator(SEL.viewBtn('source')).click();
  await sucheOeffnen(page, BEGRIFF);
  await warteAufTreffer(page, 2);
  await expect(page.locator('#search-count')).toHaveText('1 / 5');
}

test.describe('BS-11: Sprung in ein anderes Dokument zeigt den aktuellen Treffer (4T-002113)', () => {
  // Reihenfolge mit Anker start.md: start(2), daten(3). Rückwärts von «1 / 5»
  // landet auf dem dritten Treffer in daten.md, vorwärts der dritte Druck auf
  // dem ersten (der erste Druck zeigt «1 / 5», 4T-002107).
  const faelle = [
    { richtung: 'rückwärts', tasten: ['Shift+Enter'], zaehler: '5 / 5', absatz: 'Dritter' },
    {
      richtung: 'vorwärts',
      tasten: ['Enter', 'Enter', 'Enter'],
      zaehler: '3 / 5',
      absatz: 'Erster',
    },
  ];
  for (const fall of faelle) {
    test(`4T-002113: ${fall.richtung} aus «Quellcode» in ein nicht geöffnetes Dokument — Standard-Ansicht, genau ein aktueller Treffer, sichtbar und farblich abgehoben`, async () => {
      test.setTimeout(120000);
      const dir = makeDatenDir();
      const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
      try {
        await bindArea(page, dir);
        await warteAufReiter(page);
        await sucheInQuellcode(page);
        const zaehler = page.locator('#search-count');
        for (const [i, taste] of fall.tasten.entries()) {
          await page.keyboard.press(taste);
          if (i < fall.tasten.length - 1) await expect(zaehler).toHaveText(`${i + 1} / 5`);
        }
        await expect.poll(() => page.title()).toContain('daten');
        await expect(zaehler).toHaveText(fall.zaehler);
        await expect.poll(() => aktiveAnsicht(page)).toBe('rendered');
        await expect
          .poll(async () => {
            const a = await aktuellerTrefferGerendert(page);
            return a.anzahl === 1 && a.sichtbar && a.absatz.startsWith(fall.absatz);
          })
          .toBe(true);
        // Auch nach dem abgeschlossenen Render-Zyklus des Ziel-Reiters.
        await page.waitForTimeout(500);
        const a = await aktuellerTrefferGerendert(page);
        expect(a.anzahl).toBe(1);
        expect(a.sichtbar).toBe(true);
        expect(a.abgehoben).toBe(true);
      } finally {
        await closeApp(app, userData);
        removeDir(dir);
      }
    });
  }

  test('4T-002113: rückwärts in ein Dokument, das in «Quellcode» schon offen ist — es behält seine Ansicht, genau ein aktueller Treffer, sichtbar', async () => {
    test.setTimeout(120000);
    const dir = makeDatenDir();
    const { app, page, userData } = await launchApp({
      args: [path.join(dir, 'daten.md'), path.join(dir, 'start.md')],
    });
    try {
      await bindArea(page, dir);
      await warteAufReiter(page);
      await page.locator(SEL.tabs0, { hasText: 'daten' }).click();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.tabs0, { hasText: 'start' }).click();
      await sucheInQuellcode(page);
      await page.keyboard.press('Shift+Enter');
      await expect.poll(() => page.title()).toContain('daten');
      await expect(page.locator('#search-count')).toHaveText('5 / 5');
      await expect.poll(() => aktiveAnsicht(page)).toBe('source');
      const aktuell = () =>
        page.evaluate((pane) => {
          const roll = document.querySelector(`${pane} .pane-source .cm-scroller`);
          const alle = [...roll.querySelectorAll('.cm-search-match-current')];
          const r = alle[0] && alle[0].getBoundingClientRect();
          const c = roll.getBoundingClientRect();
          const zeile = alle[0] && alle[0].closest('.cm-line');
          return {
            anzahl: alle.length,
            sichtbar: !!r && r.top >= c.top && r.bottom <= c.bottom,
            zeile: zeile ? zeile.textContent : '',
          };
        }, PANE);
      await expect
        .poll(async () => {
          const a = await aktuell();
          return a.anzahl === 1 && a.sichtbar && a.zeile.startsWith('Dritter');
        })
        .toBe(true);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// 4T-002129: Sprung während des Suchlaufs im Bereich. Der Lauf geht über die
// Prozess-Grenze; ein Sprung, der vor seinem Ergebnis kommt, wird vorgemerkt
// und auf diesem Ergebnis ausgeführt, statt den alten Bestand zu bedienen und
// danach überschrieben zu werden. Nach den Treffern der offenen Datei folgen
// die übrigen in Pfad-Reihenfolge: Der zweite steht in unter/dritte.md
// (gemessen mit zwei Eingabetasten nach abgewartetem Ergebnis).
test.describe('BS-12: Sprung während des Suchlaufs (4T-002129)', () => {
  for (const [druecke, datei] of [
    [2, 'dritte'],
    [1, 'start'],
  ]) {
    test(`4T-002129: neuer Begriff, sofort ${druecke}× Eingabetaste — «${druecke} / 4» in ${datei}.md, nach einer Sekunde unverändert`, async () => {
      test.setTimeout(120000);
      const dir = makeAreaDir();
      const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
      try {
        await bindArea(page, dir);
        await warteAufReiter(page);
        await page.keyboard.press('Control+f');
        await expect(page.locator('#search-input')).toBeVisible();
        await page.keyboard.type(BEGRIFF, { delay: 20 });
        for (let i = 0; i < druecke; i++) await page.keyboard.press('Enter');
        await warteAufTreffer(page, 3);
        await page.waitForTimeout(1000);
        await expect(page.locator('#search-count')).toHaveText(`${druecke} / 4`);
        await expect.poll(() => page.title()).toContain(datei);
        await expect(page.locator(`${PANE} .pane-rendered mark.mdv-match-current`)).toHaveCount(1);
      } finally {
        await closeApp(app, userData);
        removeDir(dir);
      }
    });
  }
});
