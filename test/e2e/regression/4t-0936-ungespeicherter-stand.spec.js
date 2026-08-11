// 4T-0936: Erhebung «Funktionen auf ungespeichertem Stand».
//
// Anordnung des Product Owners vom 2026-08-08: Jede Funktionalität arbeitet auf
// dem GESCHRIEBENEN Stand des offenen Dokuments, nicht auf seinem zuletzt
// gespeicherten. Diese Datei hält die erhobenen Befunde als lauffähige Fälle
// fest, damit sie nicht nur beschrieben, sondern nachstellbar sind.
//
// Die Fälle prüfen den SOLL-Zustand. Solange ein Befund besteht, trägt sein
// Fall die Markierung `test.fail()`: Er gilt dann als bestanden und wird rot,
// sobald jemand den Befund behebt. Wer ihn behebt, entfernt die Markierung und
// hat damit unmittelbar seine Zusicherung. Seit 4T-0950 (E-03) und 4T-0948
// (E-01) trägt kein Fall dieser Datei mehr eine Markierung; die verbliebenen
// Befunde der Erhebung sind nach dem Hauptrelease 1 in 3E-0198 verortet und
// bekommen ihre Fälle dort, wo sie behoben werden.
//
// Jeder Fall trägt seinen ANKER: Vor der Messung wird belegt, dass der
// Ausgangs-Stand sichtbar ist. Ohne ihn wäre ein «nicht wirksam» kein Befund,
// sondern ein Nicht-Ergebnis (Lehre aus der Messreihe zu 4T-0925).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

function makeDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function bearbeitenAn(page, modus) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn(modus)).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
}

test.describe('UG: Funktionen auf ungespeichertem Stand (Erhebung 4T-0936)', () => {
  // Befund E-01: Ein Wiki-Embed liest die eingebettete Datei vom Datenträger
  // (main.js, Kanal embed:read). Ist sie in einem anderen Reiter offen und
  // geändert, zeigte das Embed den zuletzt gespeicherten Stand.
  // 4T-0948 hat den Befund behoben: Die Markierung ist entfernt, der Fall
  // gilt jetzt regulär als Zusicherung des behobenen Zustands.
  test('E-01 Wiki-Embed zeigt den geschriebenen Stand der Quelle', async () => {
    const dir = makeDir('scg-md-ug01-');
    const quelle = path.join(dir, 'Quelle.md');
    const huelle = path.join(dir, 'Huelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nAlter Satz\n', 'utf8');
    fs.writeFileSync(huelle, '# Huelle\n\n![[Quelle]]\n', 'utf8');

    // Beide Dateien offen: erst die Hülle (Pane 0), dann die Quelle.
    const { app, page, userData } = await launchApp({ args: [huelle, quelle] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('split')).click();
      await page.locator(SEL.btnEdit).click();

      // Anker: Das Embed zeigt den Ausgangs-Satz überhaupt an.
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('Alter Satz', {
        timeout: 15000,
      });

      // In der Quelle schreiben, NICHT speichern (zweiter Reiter derselben Spalte).
      await page.locator(`${SEL.tabs0}`, { hasText: 'Quelle' }).first().click();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' — frisch getippt');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Zurück zur Hülle: Das Embed zeigt den geschriebenen Stand.
      await page.locator(`${SEL.tabs0}`, { hasText: 'Huelle' }).first().click();
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('frisch getippt', {
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // 4T-0948, AK2: Dasselbe mit Anker. Der Ausschnitt wird am Text geschnitten
  // (extractEmbedSnippet), weshalb die Schicht seit 4T-0948 den Roh-Text führt
  // und nicht nur seinen Parse. Ohne diesen Fall bliebe genau das ungeprüft.
  test('E-01/AK2 Anker-Einbettung schneidet im geschriebenen Stand', async () => {
    const dir = makeDir('scg-md-ug01b-');
    const quelle = path.join(dir, 'Quelle.md');
    const huelle = path.join(dir, 'Huelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\n## Kapitel\n\nAlter Absatz\n', 'utf8');
    fs.writeFileSync(huelle, '# Huelle\n\n![[Quelle#Kapitel]]\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [huelle, quelle] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('split')).click();
      await page.locator(SEL.btnEdit).click();

      // Anker der Messung: Der Ausschnitt steht und zeigt den Ausgangs-Text.
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('Alter Absatz', {
        timeout: 15000,
      });

      await page.locator(`${SEL.tabs0}`, { hasText: 'Quelle' }).first().click();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' — im Kapitel getippt');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      await page.locator(`${SEL.tabs0}`, { hasText: 'Huelle' }).first().click();
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('im Kapitel getippt', {
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // 4T-0948, AK3: Das Gegenstück. Ist das Ziel nicht offen, gibt es keinen
  // geschriebenen Stand, und es bleibt beim Datei-Inhalt. Der Fall prüft, dass
  // die neue Abzweigung nur greift, wo sie soll: Getippt wird in der Hülle,
  // was dieselbe Melde-Strecke auslöst wie im Fall E-01.
  test('E-01/AK3 nicht geöffnetes Ziel bleibt beim Datei-Inhalt', async () => {
    const dir = makeDir('scg-md-ug01c-');
    const quelle = path.join(dir, 'Quelle.md');
    const huelle = path.join(dir, 'Huelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nNur auf der Platte\n', 'utf8');
    fs.writeFileSync(huelle, '# Huelle\n\n![[Quelle]]\n', 'utf8');

    // Nur die Hülle ist offen.
    const { app, page, userData } = await launchApp({ args: [huelle] });
    try {
      await bearbeitenAn(page, 'split');
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('Nur auf der Platte', {
        timeout: 15000,
      });

      // In der Hülle tippen: Das meldet ihren Stand und stößt den Nachzug an.
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nZusatz in der Huelle\n');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Die Einbettung steht unverändert; der eigene Zusatz ist gerendert.
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('Zusatz in der Huelle', {
        timeout: 15000,
      });
      await expect(page.locator(SEL.markdownBody0).first()).toContainText('Nur auf der Platte');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // 4T-0948, Variante B (Entscheidung des Product Owners vom 2026-08-11):
  // Stehen Hülle und Quelle NEBENEINANDER, ändern sich Text und Pfad der
  // Hülle beim Tippen nicht. Weder der Render-Zwischenspeicher der Spalte
  // noch die eq()-Prüfung des Live-Widgets baut ihr DOM dann neu, und der
  // Kanal-Fix allein bliebe hier wirkungslos.
  //
  // Der Fall fasst die linke Spalte nach dem Teilen bewusst NICHT mehr an:
  // Genau das ist die Zusicherung. Ein Klick oder Reiter-Wechsel dort würde
  // die Messung entwerten, weil er den Nachzug ersetzt.
  test('E-01/B nebeneinander zieht die Einbettung ohne Zutun nach', async () => {
    const dir = makeDir('scg-md-ug01d-');
    const quelle = path.join(dir, 'Quelle.md');
    const huelle = path.join(dir, 'Huelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nAlter Satz\n', 'utf8');
    fs.writeFileSync(huelle, '# Huelle\n\n![[Quelle]]\n', 'utf8');

    const P0 = SEL.pane(0);
    const P1 = SEL.pane(1);
    const { app, page, userData } = await launchApp({ args: [huelle, quelle] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);

      // Die Quelle nach rechts schieben; links bleibt die Hülle stehen.
      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.paneGroup)).toBeVisible();
      await expect(page.locator(P1.tabs)).toHaveCount(1);

      // Anker: Die Einbettung links zeigt den Ausgangs-Satz.
      await expect(page.locator(P0.markdownBody).first()).toContainText('Alter Satz', {
        timeout: 15000,
      });

      // Rechts schreiben, NICHT speichern. Die aktive Spalte ist nach dem
      // Teilen die rechte, der Moduswechsel wirkt also dort.
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await page.locator(P1.editorContent).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' — nebenan getippt');
      await expect(page.locator(P1.dirtyTab).first()).toBeVisible();

      // Links, ohne einen einzigen Griff in diese Spalte.
      await expect(page.locator(P0.markdownBody).first()).toContainText('nebenan getippt', {
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // 4T-0948, Parität: Dieselbe Lage im Live-Modus. Sie ist der schärfere
  // Fall, weil das Live-Widget sein DOM behält, solange Quelltext und
  // Basis-Pfad gleich bleiben (eq()), und ein Voll-Render der Spalte es gar
  // nicht erreichte. Der Nachzug greift deshalb an der Einbettung selbst an
  // und nicht an der Spalte.
  test('E-01/B-live Live-Modus zieht die Einbettung ohne Zutun nach', async () => {
    const dir = makeDir('scg-md-ug01e-');
    const quelle = path.join(dir, 'Quelle.md');
    const huelle = path.join(dir, 'Huelle.md');
    fs.writeFileSync(quelle, '# Quelle\n\nAlter Satz\n', 'utf8');
    fs.writeFileSync(huelle, '# Huelle\n\n![[Quelle]]\n', 'utf8');

    const P0 = SEL.pane(0);
    const P1 = SEL.pane(1);
    const liveEmbed = `${P0.paneSource} .cm-live-embed`;
    const { app, page, userData } = await launchApp({ args: [huelle, quelle] });
    try {
      await expect(page.locator(P0.tabs)).toHaveCount(2);

      await page.locator(P0.tabs, { hasText: 'Quelle' }).first().click();
      await page.keyboard.press('Control+Alt+ArrowRight');
      await expect(page.locator(P1.paneGroup)).toBeVisible();

      // Links auf Live schalten (der Moduswechsel wirkt auf die aktive Spalte).
      await page.locator(P0.tabs).first().click();
      await page.locator(SEL.viewBtn('live')).click();

      // Anker: Die Live-Einbettung zeigt den Ausgangs-Satz.
      await expect(page.locator(liveEmbed).first()).toContainText('Alter Satz', {
        timeout: 15000,
      });

      // Rechts aktivieren und dort schreiben, NICHT speichern.
      await page.locator(P1.tabs).first().click();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await page.locator(P1.editorContent).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' — live nebenan getippt');
      await expect(page.locator(P1.dirtyTab).first()).toBeVisible();

      // Links, ohne Griff in diese Spalte.
      await expect(page.locator(liveEmbed).first()).toContainText('live nebenan getippt', {
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Befund E-02: Die Bereichs-Suche kannte den geschriebenen Stand allein von
  // der AKTIVEN Datei, deren Text der Renderer mitschickt (geprüft in
  // funktionen/bereichs-suche.spec.js, BS-02). Jedes andere offene Dokument
  // wurde im Stand seiner letzten Speicherung durchsucht.
  //
  // Die Erhebung führte den Fall nicht als Messung, weil ihr Versuch am Anker
  // scheiterte. 4T-0949 hat ihn geholt: Der Bereich wird über den Pfad-Einstieg
  // gebunden, wie es die Funktions-Spec seit 4T-0616 vormacht.
  //
  // Die Konstruktion beider Fälle ist die Zusicherung: Nach dem Schreiben wird
  // auf die ANDERE Datei gewechselt, damit die geänderte gerade nicht die
  // aktive ist. Ohne diesen Wechsel liefe die Messung in den bereits
  // bestehenden Weg und bewiese nichts.
  const BESTANDSWORT = 'Quittenbrot';
  const FRISCHWORT = 'Holunderblues';
  const gruppen = (page) =>
    page.locator(
      '.pane-group[data-pane="0"] .sidebar-searchresults .search-results-group .search-results-group-title',
    );
  const treffer = (page) =>
    page.locator('.pane-group[data-pane="0"] .sidebar-searchresults .search-results-item');

  async function bereichBinden(page, dir) {
    const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
    expect(res.boundExisting).toBe(true);
    await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
  }

  async function sucheOeffnen(page, begriff) {
    await expect(page.locator(SEL.tabs0).first()).toBeVisible();
    await page.keyboard.press('Control+f');
    const eingabe = page.locator('#search-input');
    await expect(eingabe).toBeVisible();
    await eingabe.fill(begriff);
  }

  // Legt einen Bereich mit zwei Dateien an; nur die zweite trägt das Wort.
  function bereichMitZweiDateien(praefix) {
    const dir = makeDir(praefix);
    fs.writeFileSync(path.join(dir, 'Start.md'), '# Start\n\nOhne Fundstelle.\n', 'utf8');
    fs.writeFileSync(
      path.join(dir, 'Zweite.md'),
      `# Zweite\n\nHier steht ${BESTANDSWORT}.\n`,
      'utf8',
    );
    return dir;
  }

  test('E-02 Bereichs-Suche findet frisch Getipptes in einer nicht aktiven Datei', async () => {
    test.setTimeout(120000);
    const dir = bereichMitZweiDateien('scg-md-ug02-');
    const { app, page, userData } = await launchApp({
      args: [path.join(dir, 'Start.md'), path.join(dir, 'Zweite.md')],
    });
    try {
      await bereichBinden(page, dir);

      // Anker: Der Ausgangs-Text ist über die Bereichs-Suche auffindbar.
      await sucheOeffnen(page, BESTANDSWORT);
      await expect(page.locator('#search-scope')).toHaveText(/Bereich/i);
      await expect(gruppen(page)).toHaveCount(1);
      await page.keyboard.press('Escape');

      // In der zweiten Datei schreiben, NICHT speichern.
      await page.locator(`${SEL.tabs0}`, { hasText: 'Zweite' }).first().click();
      await page.keyboard.press('Control+e');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(`\n\nUnd dazu ${FRISCHWORT}.`);
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Auf die erste Datei wechseln: Die geänderte ist jetzt nicht mehr aktiv.
      await page.locator(`${SEL.tabs0}`, { hasText: 'Start' }).first().click();
      // Dritter Anker, und der wichtigste: Der Wechsel hat gegriffen. Bliebe die
      // geänderte Datei aktiv, liefe die Messung in den bereits bestehenden
      // Weg über den mitgeschickten Stand und bewiese nichts.
      await expect(page.locator(SEL.activeTab0)).toHaveText(/Start/);

      // Zweiter Anker: Auf der Platte steht das Wort NICHT. Ohne diesen Beleg
      // wäre ein Treffer auch mit einem stillen Speichern erklärbar.
      expect(fs.readFileSync(path.join(dir, 'Zweite.md'), 'utf8')).not.toContain(FRISCHWORT);

      // Das frisch getippte Wort wird gefunden, obwohl nichts gespeichert ist.
      //
      // Geprüft wird die TREFFERZEILE und nicht der Gruppen-Titel. Die erste
      // Fassung sah nur den Titel «Zweite» und war deshalb auch ohne die
      // Umstellung grün: Die Liste trug noch das Ergebnis des Anker-Laufs, der
      // dieselbe Datei traf, während im Suchfeld längst das neue Wort stand.
      // Ein Gruppen-Titel sagt nur, WELCHE Datei traf, nicht WOMIT.
      await sucheOeffnen(page, FRISCHWORT);
      await expect
        .poll(() => treffer(page).allTextContents())
        .toEqual([expect.stringContaining(FRISCHWORT)]);
      await expect(gruppen(page).first()).toHaveText(/Zweite/);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Gegenprobe: Was im Puffer entfernt wurde, darf die Suche nicht mehr
  // finden. Ohne diesen Fall bliebe offen, ob der Puffer den Platten-Stand
  // wirklich ERSETZT oder nur ergänzt.
  test('E-02 Bereichs-Suche findet Gelöschtes nicht mehr', async () => {
    test.setTimeout(120000);
    const dir = bereichMitZweiDateien('scg-md-ug02b-');
    const { app, page, userData } = await launchApp({
      args: [path.join(dir, 'Start.md'), path.join(dir, 'Zweite.md')],
    });
    try {
      await bereichBinden(page, dir);

      // Anker: Der Ausgangs-Text ist auffindbar.
      await sucheOeffnen(page, BESTANDSWORT);
      await expect(gruppen(page)).toHaveCount(1);
      await page.keyboard.press('Escape');

      // Den Text in der zweiten Datei ersetzen, NICHT speichern.
      await page.locator(`${SEL.tabs0}`, { hasText: 'Zweite' }).first().click();
      await page.keyboard.press('Control+e');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('# Zweite\n\nNichts mehr davon.');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      // Zweiter Anker: Der Puffer trägt das Wort wirklich nicht mehr. Ohne
      // diesen Beleg misst der Fall unten nur, dass irgendetwas nichts findet.
      await expect(editor).not.toContainText(BESTANDSWORT);

      await page.locator(`${SEL.tabs0}`, { hasText: 'Start' }).first().click();
      await expect(page.locator(SEL.activeTab0)).toHaveText(/Start/);

      // Der gelöschte Text wird nicht mehr gefunden; die Platte trägt ihn noch.
      await sucheOeffnen(page, BESTANDSWORT);
      // Die Liste der Gruppen-Titel statt ihrer Zahl: Ein Fehlschlag nennt
      // damit die Datei, die noch trifft, statt nur eine Anzahl.
      await expect.poll(() => gruppen(page).allTextContents()).toEqual([]);
      expect(fs.readFileSync(path.join(dir, 'Zweite.md'), 'utf8')).toContain(BESTANDSWORT);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Befund E-03: Das Tag-Panel bezieht seine Liste aus dem Index
  // (backlinks.tagsFor, ohne Puffer-Overlay). Ein gerade getippter Tag des
  // offenen Dokuments fehlt.
  // 4T-0950 hat den Befund behoben: Die Markierung ist entfernt, der Fall
  // gilt jetzt regulär als Zusicherung des behobenen Zustands.
  //
  // Der Fall geht bewusst den Weg des ANWENDERS und nicht den der Schicht:
  // Er blendet das Tag-Panel ein und liest dessen Anzeige. Die erste Fassung
  // rief window.api.requestTags unmittelbar auf; sie war grün, während das
  // Panel im Test des Product Owners leer blieb, weil niemand es neu zeichnen
  // ließ. Eine Zusicherung, die an der Oberfläche vorbeigreift, deckt genau
  // die Strecke nicht ab, auf der der Fehler sitzt.
  test('E-03 Tag-Panel zeigt einen frisch getippten Tag', async () => {
    const dir = makeDir('scg-md-ug03-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, '# Notiz\n\n#bestandstag\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    const baum = page.locator('.pane-group[data-pane="0"] .tags-tree');
    try {
      await bearbeitenAn(page, 'source');
      // Tag-Panel einblenden (Statusleisten-Schalter, der Weg des Anwenders).
      await page.locator('#btn-tags').click();

      // Anker: der gespeicherte Tag steht im Panel. Der Bereichs-Index braucht
      // dafür seinen Anlauf.
      await expect(baum).toContainText('bestandstag', { timeout: 20000 });

      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n#frischertag');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Ohne Speichern: der neue Tag erscheint, der ersetzte Stand bleibt.
      await expect(baum).toContainText('frischertag', { timeout: 15000 });
      await expect(baum).toContainText('bestandstag');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
