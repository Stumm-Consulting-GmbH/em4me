// 4T-002641 (Epic 3E-000397): Lese-Position je Dokument, zweiter Teil.
//
// LP-05 prüft das Umbenennen und Verschieben eines geschlossenen Dokuments.
// LP-06 prüft die Stelle unter Inhalt oberhalb, der nach dem Öffnen entsteht:
// (i) Bilder, (ii) ein eingebettetes Dokument, das nach dem Herstellen wächst,
// im Produkt-Zustand, (iii) dasselbe ohne die Bildlauf-Verankerung des
// Browsers, sodass allein das zweite Setzen der Anwendung die Stelle hält.
// LP-07 prüft den Ansichts-Wechsel ohne Zwischenbild. LP-08 prüft das Ersetzen des
// Reiter-Inhalts (Journal-Pfeile): Stelle, Ablage und Verlauf je Datei.
// Test-Dokument und Messung wie im ersten Teil `lese-position.spec.js`; die
// gemeinsamen Helfer stehen in `test/e2e/helpers/lese-position.js`.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { leseJsonOderNull } = require('../helpers/dateien');
const { applyJournalProperties, periodOf } = require('../../../src/shared/journal-core.js');
const { makeBook } = require('../helpers/buch');
const {
  PANE,
  GERENDERT,
  EDITOR,
  langesDokument,
  legeAn,
  raeumeAuf,
  ansicht,
  obersteGerendert,
  obersteImEditor,
  obersteRuhig,
  rolleZu,
  nahe,
  gemerkteZeile,
  bindeBereich,
  oeffneImPanel,
  schliesseAktiven,
  starteBildMessung,
  bildMessungen,
  beende,
} = require('../helpers/lese-position');

// Pfade der Ablage, deren Datei `dateiname` heißt (klein geschrieben).
function gemerktePfade(userData, dateiname) {
  const daten = leseJsonOderNull(path.join(userData, 'lese-positionen.json'));
  const eintraege = (daten && daten.eintraege) || {};
  return Object.keys(eintraege).filter((p) => path.basename(p).toLowerCase() === dateiname);
}

// Rollt die Lese-Ansicht des aktiven Reiters `name` bis «Zeile 200», schließt
// ihn und wartet, bis die Ablage die Stelle für `dateiname` trägt.
async function merkeBei200(page, userData, name, dateiname, zeileVon) {
  await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
  await rolleZu(page, GERENDERT, '.markdown-body p', 200);
  expect(await obersteGerendert(page)).toBe(200);
  await schliesseAktiven(page, name);
  await expect
    .poll(() => nahe(gemerkteZeile(userData, dateiname), zeileVon[200]), { timeout: 10000 })
    .toBe(true);
}

// Benennt die Datei-Zeile `alt` über ihr Kontextmenü im Bereichs-Panel um,
// ohne Verweis-Nachführung (Bedienweg aus BP-07 in bereichs-panel.spec.js).
async function benenneImPanelUm(page, alt, neu) {
  await page
    .locator(`${PANE} .sidebar-area .area-file-row`)
    .filter({ hasText: new RegExp(`^${alt}$`) })
    .click({ button: 'right' });
  await page.locator('#context-menu [data-menu-id="area-file-rename"]').click();
  await expect(page.locator('#name-input-modal')).toBeVisible();
  await page.locator('#name-input-cb-updateLinks').uncheck();
  await page.locator('#name-input-field').fill(neu);
  await page.locator('#btn-name-input-ok').click();
  await expect(page.locator('#name-input-modal')).toBeHidden();
}

test.describe('LP-05: Umbenannt oder verschoben behält ein Dokument seine Stelle', () => {
  test('(i) geschlossen im Bereichs-Panel umbenannt: Stelle unter dem neuen Namen', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await oeffneImPanel(page, 'lang');
      await merkeBei200(page, userData, 'lang', 'lang.md', f.zeileVon);

      await benenneImPanelUm(page, 'lang', 'weit');
      await expect
        .poll(() => fs.existsSync(path.join(f.dir, 'weit.md')), { timeout: 5000 })
        .toBe(true);
      // Die Ablage wird gesammelt geschrieben.
      await expect
        .poll(() => gemerktePfade(userData, 'weit.md').length, { timeout: 10000 })
        .toBe(1);
      expect(gemerktePfade(userData, 'lang.md')).toEqual([]);
      expect(nahe(gemerkteZeile(userData, 'weit.md'), f.zeileVon[200])).toBe(true);

      await oeffneImPanel(page, 'weit');
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(ii) Kaskade: die Eltern-Seite umbenannt, die geschlossene Unterseite an ihrer Stelle', async () => {
    const f = legeAn();
    const SEP = '∕'; // U+2215, Trennzeichen der Unterseiten
    const teil = `lang${SEP}teil`;
    fs.copyFileSync(f.lang, path.join(f.dir, `${teil}.md`));
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, f.dir);
      await oeffneImPanel(page, teil);
      await merkeBei200(page, userData, teil, `${teil}.md`, f.zeileVon);

      await benenneImPanelUm(page, 'lang', 'weit');
      const neu = `weit${SEP}teil`;
      await expect
        .poll(() => fs.existsSync(path.join(f.dir, `${neu}.md`)), { timeout: 5000 })
        .toBe(true);
      await expect
        .poll(() => gemerktePfade(userData, `${neu}.md`).length, { timeout: 10000 })
        .toBe(1);
      expect(gemerktePfade(userData, `${teil}.md`)).toEqual([]);

      await oeffneImPanel(page, neu);
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(iii) geschlossene Kapitel-Datei in einen Unterordner verschoben: Stelle am neuen Ort', async () => {
    // Der geprüfte Weg der Anwendung, ein Dokument in einen anderen Ordner zu
    // bewegen, ist das Verschieben einer Kapitel-Datei im Buch-Panel, über den
    // dialogfreien Pfad-Einstieg wie in BO-03 (bild-ansicht.spec.js).
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-lese-position-buch-'));
    const bookDir = makeBook(parent);
    const dokument = langesDokument();
    fs.writeFileSync(path.join(bookDir, 'Schluss.md'), dokument.text, 'utf8');
    const { app, page, userData } = await launchApp();
    const oeffneKapitel = async (rel) => {
      await expect
        .poll(async () => {
          await page.evaluate((r) => window.api.books.openChapter(r), rel);
          return page.locator(`${SEL.activeTab0} .tab-title`).allTextContents();
        })
        .toContain('Schluss');
    };
    try {
      const geoeffnet = await page.evaluate((dir) => window.api.books.openPath(dir), bookDir);
      expect(geoeffnet).toMatchObject({ ok: true });
      await expect
        .poll(() => page.locator(`${SEL.tabs0} .tab-title`).allTextContents())
        .toContain('Reise');
      await oeffneKapitel('Schluss.md');
      await merkeBei200(page, userData, 'Schluss', 'schluss.md', dokument.zeileVon);

      const bewegt = await page.evaluate(
        (p) => window.api.books.moveChapterFileTo(p.relPath, p.targetDir),
        { relPath: 'Schluss.md', targetDir: path.join(bookDir, 'Teil2') },
      );
      expect(bewegt).toMatchObject({ ok: true, relPath: 'Teil2/Schluss.md' });
      const imUnterordner = () =>
        gemerktePfade(userData, 'schluss.md').map((p) => path.basename(path.dirname(p)));
      await expect.poll(imUnterordner, { timeout: 10000 }).toEqual(['Teil2']);

      await oeffneKapitel('Teil2/Schluss.md');
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(parent);
    }
  });
});

// Merkt die Stelle «Zeile 200» des langen Dokuments, beendet die Anwendung und
// öffnet es nach einem Neustart über das Bereichs-Panel, damit kein Inhalt aus
// dem Zwischenspeicher der Sitzung kommt. `geladen(page)` meldet, dass der
// Inhalt oberhalb dargestellt ist; `vorDemOeffnen(page)` läuft im zweiten Start
// vor dem Öffnen. Prüft am Ende die Stelle und gibt die Seite an `danach`.
async function oeffneNachNeustart(f, { geladen, vorDemOeffnen, danach }) {
  const erster = await launchApp();
  const userData = erster.userData;
  try {
    await bindeBereich(erster.page, f.dir);
    await oeffneImPanel(erster.page, 'lang');
    await expect.poll(() => geladen(erster.page)).toBe(true);
    await merkeBei200(erster.page, userData, 'lang', 'lang.md', f.zeileVon);
    await beende(erster.app);

    const zweiter = await launchApp({ userData });
    try {
      const page = zweiter.page;
      await bindeBereich(page, f.dir);
      if (vorDemOeffnen) await vorDemOeffnen(page);
      await oeffneImPanel(page, 'lang');
      await expect.poll(() => geladen(page)).toBe(true);
      await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 200))).toBe(true);
      await page.waitForTimeout(1500);
      expect(nahe(await obersteGerendert(page), 200)).toBe(true);
      if (danach) await danach(page);
    } finally {
      await closeApp(zweiter.app, null, { force: true });
    }
  } finally {
    await closeApp(erster.app, userData);
    raeumeAuf(f.dir);
  }
}

const einbettungDargestellt = (page) =>
  page.evaluate(
    (s) => document.querySelector(s).textContent.includes('Absatz E40'),
    SEL.markdownBody0,
  );

test.describe('LP-06: Inhalt oberhalb der Stelle entsteht nach dem Öffnen', () => {
  test('(i) Bilder ohne feste Maße oberhalb: die gemerkte Zeile steht oben', async () => {
    const f = legeAn({ bilder: 3 });
    const bilderGeladen = (page) =>
      page.evaluate((s) => {
        const bilder = [...document.querySelectorAll(`${s} img`)];
        return bilder.length === 3 && bilder.every((b) => b.complete && b.naturalHeight > 0);
      }, SEL.markdownBody0);
    await oeffneNachNeustart(f, {
      geladen: bilderGeladen,
      vorDemOeffnen: starteBildMessung,
      danach: async (page) => {
        // In keinem gezeichneten Bild stand eine andere Zeile oben.
        const messungen = await bildMessungen(page);
        expect(messungen.length).toBeGreaterThan(0);
        expect(messungen.filter((z) => !nahe(z, 200))).toEqual([]);
      },
    });
  });

  test('(ii) eingebettetes Dokument oberhalb, das nach dem Herstellen wächst: Stelle hält', async () => {
    await oeffneNachNeustart(legeAn({ einbettung: true }), { geladen: einbettungDargestellt });
  });

  test('(iii) ohne Bildlauf-Verankerung des Browsers hält das zweite Setzen die Stelle', async () => {
    // Test-Eingriff: Im Produkt-Zustand gleicht der Browser das Wachsen des
    // eingebetteten Dokuments über seine Bildlauf-Verankerung selbst aus
    // (gemessen 2026-11-13). Die eingespielte Regel schaltet sie ab und stellt
    // damit die Lage her, für die das zweite Setzen nach nachladenden Inhalten
    // als Netz da ist; ohne dieses Setzen steht danach eine frühere Zeile oben.
    await oeffneNachNeustart(legeAn({ einbettung: true }), {
      geladen: einbettungDargestellt,
      vorDemOeffnen: (page) =>
        page.addStyleTag({ content: `${GERENDERT} * , ${GERENDERT} { overflow-anchor: none; }` }),
    });
  });

  test('(iv) der Bildlauf des Anwenders geht dem zweiten Setzen vor', async () => {
    // Test-Eingriff: Gewachsen wird erst nach dem Rollen, über einen hohen
    // Block, den die Prüfung oben in die Lese-Fläche einfügt; so liegt das
    // Wachsen sicher nach dem Rad-Ereignis und innerhalb der zwei Sekunden, in
    // denen die Anwendung nachsetzt. Die Bildlauf-Verankerung bleibt im
    // Produkt-Zustand, damit die angerollte Zeile beim Wachsen oben bleibt; ohne
    // sie verschöbe das Wachsen die Ansicht auch ohne zweites Setzen.
    const f = legeAn();
    const erster = await launchApp();
    const userData = erster.userData;
    try {
      await bindeBereich(erster.page, f.dir);
      await oeffneImPanel(erster.page, 'lang');
      await merkeBei200(erster.page, userData, 'lang', 'lang.md', f.zeileVon);
      await beende(erster.app);

      const zweiter = await launchApp({ userData });
      try {
        const page = zweiter.page;
        await bindeBereich(page, f.dir);
        // Zeitpunkt des Klicks, der das Dokument öffnet; die Frist des
        // Nachsetzens beginnt erst danach.
        await page.evaluate(() => {
          window.addEventListener('pointerdown', () => (window.__lpKlick = performance.now()), {
            capture: true,
            once: true,
          });
        });
        await oeffneImPanel(page, 'lang');
        await expect
          .poll(() => obersteGerendert(page).then((z) => nahe(z, 200)), { intervals: [20] })
          .toBe(true);
        // Eingabe des Anwenders und Wachsen in einem Zug, so früh wie möglich nach
        // dem Herstellen der Stelle: Rad-Ereignis, Bildlauf auf «Zeile 350», dann
        // der hohe Block oben in der Lese-Fläche.
        const seitKlick = await page.evaluate(
          ({ container, body }) => {
            const sc = document.querySelector(container);
            sc.dispatchEvent(
              new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 0 }),
            );
            const ziel = [...sc.querySelectorAll(`${body} p`)].find((el) =>
              el.textContent.trim().startsWith('Zeile 350'),
            );
            if (!ziel) return null;
            sc.scrollTop += ziel.getBoundingClientRect().top - sc.getBoundingClientRect().top;
            const block = document.createElement('div');
            block.style.height = '3000px';
            document.querySelector(body).prepend(block);
            return performance.now() - window.__lpKlick;
          },
          { container: GERENDERT, body: SEL.markdownBody0 },
        );
        expect(seitKlick, '«Zeile 350» ist dargestellt').not.toBeNull();
        // Frist des Nachsetzens: NACHLADEN_MS in src/renderer/modules/views/lese-position.js.
        expect(
          seitKlick,
          'Der Block kam nach der Frist des Nachsetzens; der Fall beweist so nichts',
        ).toBeLessThan(2000);
        await expect.poll(() => obersteGerendert(page).then((z) => nahe(z, 350))).toBe(true);
        await page.waitForTimeout(2000);
        expect(nahe(await obersteGerendert(page), 350)).toBe(true);
      } finally {
        await closeApp(zweiter.app, null, { force: true });
      }
    } finally {
      await closeApp(erster.app, userData);
      raeumeAuf(f.dir);
    }
  });
});

// Zeichnet ab sofort nach jedem gezeichneten Bild auf, welche Ansicht die
// Spalte zeigt und welche Zeile in Editor und Lese-Ansicht oben steht (`null`
// für eine verborgene Fläche), samt Bildlauf-Lage.
async function starteWechselMessung(page) {
  await page.evaluate(
    ({ pane, editor, gerendert }) => {
      const bilder = [];
      window.__lpWechsel = bilder;
      const oben = (container, elemente) => {
        const sc = document.querySelector(container);
        if (!sc || sc.getBoundingClientRect().height === 0) return null;
        const kante = sc.getBoundingClientRect().top;
        for (const el of sc.querySelectorAll(elemente)) {
          const r = el.getBoundingClientRect();
          if (r.bottom <= kante + 1) continue;
          const m = /^Zeile (\d{3})/.exec(el.textContent.trim());
          if (m) return parseInt(m[1], 10);
        }
        return null;
      };
      const ende = Date.now() + 3000;
      const miss = () => {
        const kl = /view-(\w+)/.exec(document.querySelector(`${pane} .content`).className);
        bilder.push({
          ansicht: kl ? kl[1] : null,
          editor: oben(editor, '.cm-line'),
          gerendert: oben(gerendert, '.markdown-body p'),
          lageEditor: document.querySelector(editor).scrollTop,
          lageGerendert: document.querySelector(gerendert).scrollTop,
        });
      };
      // Gemessen nach dem Zeichnen, wie in `starteBildMessung`.
      const takt = () => {
        if (Date.now() > ende) return;
        setTimeout(miss, 0);
        requestAnimationFrame(takt);
      };
      requestAnimationFrame(takt);
    },
    { pane: PANE, editor: EDITOR, gerendert: GERENDERT },
  );
}

// Prüft die Bilder nach dem Wechsel in eine Ansicht, für die `istZiel` gilt:
// In jedem steht in der Fläche `flaeche` die Zeile `soll` oben (Toleranz zwei
// Zeilen), und nach dem ersten ändert sie sich nicht mehr.
async function pruefeWechselBilder(page, istZiel, flaeche, soll) {
  await page.waitForTimeout(3200);
  const alle = await page.evaluate(() => window.__lpWechsel || []);
  const nachher = alle.filter((b) => istZiel(b.ansicht));
  const zeilen = nachher.map((b) => b[flaeche]);
  const beleg = JSON.stringify(nachher.slice(0, 8));
  expect(zeilen.length, beleg).toBeGreaterThan(0);
  expect(
    zeilen.filter((z) => !nahe(z, soll)),
    beleg,
  ).toEqual([]);
  expect(
    zeilen.filter((z) => z !== zeilen[0]),
    beleg,
  ).toEqual([]);
}

test.describe('LP-07: Ansichts-Wechsel ohne Zwischenbild', () => {
  test('(i) Gerendert nach Quellcode: die mitgenommene Zeile steht vom ersten Bild an oben', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp({ args: [f.lang] });
    try {
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 200);
      const soll = await obersteGerendert(page);
      await starteWechselMessung(page);
      await ansicht(app, 'source');
      await pruefeWechselBilder(page, (a) => a === 'source', 'editor', soll);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(ii) Quellcode nach Gerendert: die mitgenommene Zeile steht vom ersten Bild an oben', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp({ args: [f.lang] });
    try {
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await ansicht(app, 'source');
      await expect.poll(() => obersteImEditor(page)).not.toBeNull();
      await rolleZu(page, EDITOR, '.cm-line', 220);
      // Gemessen wird, wenn der Editor vier Bilder lang ruht.
      let soll = null;
      await expect
        .poll(async () => {
          soll = await obersteRuhig(page, EDITOR, '.cm-line');
          return soll;
        })
        .not.toBeNull();
      await starteWechselMessung(page);
      await ansicht(app, 'rendered');
      await pruefeWechselBilder(page, (a) => a === 'rendered', 'gerendert', soll);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('(iii) Gerendert in den Bearbeiten-Modus (Strg+E): die Zeile steht vom ersten Bild an oben', async () => {
    const f = legeAn();
    const { app, page, userData } = await launchApp({ args: [f.lang] });
    try {
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 200);
      const soll = await obersteGerendert(page);
      await starteWechselMessung(page);
      await page.keyboard.press('Control+e');
      await pruefeWechselBilder(page, (a) => a !== null && a !== 'rendered', 'editor', soll);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// Zwei Tages-Einträge eines Journals mit dem Navigations-Block oben und dem
// langen Dokument darunter. Die Pfeile des Blocks ersetzen den Inhalt des
// Reiters (`tab-ersetzen.js`), statt einen weiteren zu öffnen.
function legeJournalAn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-lese-position-journal-'));
  const journals = {
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
  fs.writeFileSync(
    path.join(dir, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { journals } }, null, 2) + '\n',
    'utf8',
  );
  fs.mkdirSync(path.join(dir, 'Journal'));
  // Die Journal-Eigenschaften stehen schon im Eintrag: Sonst ergänzte sie die
  // Anwendung beim Blättern und verschöbe die Zeilen unter der gemerkten Stelle.
  const dokument = langesDokument();
  const rumpf = '```perspective-journal-nav\n```\n\n' + dokument.text;
  const eintrag = (datum) => {
    const ms = new Date(`${datum}T12:00:00`).getTime();
    const text = applyJournalProperties(rumpf, journals.journals[0], periodOf(ms, 'day'));
    fs.writeFileSync(path.join(dir, 'Journal', `${datum}.md`), text, 'utf8');
    return text.split('\n').length - dokument.text.split('\n').length;
  };
  const versatz = eintrag('2026-11-13');
  eintrag('2026-11-12');
  const zeileVon = (n) => dokument.zeileVon[n] + versatz;
  return { dir, a: path.join(dir, 'Journal', '2026-11-13.md'), zeileVon };
}

test.describe('LP-08: Ersetzen des Reiter-Inhalts über die Journal-Pfeile', () => {
  test('jede Datei behält ihre eigene Stelle, «Zurück» führt zu den Stellen', async () => {
    const f = legeJournalAn();
    const { app, page, userData } = await launchApp();
    // Der Pfeil wird als Ereignis ausgelöst: Ein Klick über Playwright rollte
    // den Block erst in Sicht und damit die Stelle weg, die gemerkt werden soll.
    const pfeil = (welcher) =>
      page.locator(`${GERENDERT} .perspective-journal-nav .journal-nav-arrow`)[welcher]();
    const zeigt = (name) =>
      expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(new RegExp(`^${name}`));
    const steht = (zeile) =>
      expect.poll(() => obersteGerendert(page).then((z) => nahe(z, zeile))).toBe(true);
    const gemerktBei = (datei, zeile) =>
      expect.poll(() => obersteZeileDerAblage(datei, zeile), { timeout: 10000 }).toBe(true);
    // Die Ablage führt die Dokument-Zeile des Absatzes «Zeile N» im Eintrag.
    const obersteZeileDerAblage = (datei, zeile) =>
      nahe(gemerkteZeile(userData, datei), f.zeileVon(zeile));
    try {
      await bindeBereich(page, f.dir);
      await oeffneDokumentImFenster(app, page, f.a);
      await zeigt('2026-11-13');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, '.markdown-body p', 200);

      // A durch B ersetzen: Die Stelle von A ist unter A gemerkt.
      await pfeil('first').dispatchEvent('click');
      await zeigt('2026-11-12');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await gemerktBei('2026-11-13.md', 200);
      // Momentaufnahme nach dem Schreiben des Eintrags von A; den Kern der
      // Aussage trägt `steht(1)` darunter.
      expect(obersteZeileDerAblage('2026-11-12.md', 200)).toBe(false);
      await steht(1);

      // B rollen und zurück auf A ersetzen: A steht an seiner Stelle.
      await rolleZu(page, GERENDERT, '.markdown-body p', 100);
      await pfeil('last').dispatchEvent('click');
      await zeigt('2026-11-13');
      await steht(200);
      await gemerktBei('2026-11-12.md', 100);
      // Gegenprobe: Der Eintrag von A ist nicht mit der Stelle der eben
      // verlassenen Datei B überschrieben.
      expect(obersteZeileDerAblage('2026-11-13.md', 100)).toBe(false);

      // «Zurück» führt zu B an seine Stelle, noch einmal «Zurück» zu A.
      await page.keyboard.press('Alt+ArrowLeft');
      await zeigt('2026-11-12');
      await steht(100);
      await page.keyboard.press('Alt+ArrowLeft');
      await zeigt('2026-11-13');
      await steht(200);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});
