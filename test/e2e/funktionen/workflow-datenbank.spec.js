// 4T-002545 (Epic 3E-000368, Stories 4S-001196 und 4S-001200): E2E-Funktions-
// Suite — die Schreib-Schritte der Datenbank an der gestarteten Anwendung
// (AK1, AK4 des Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht über beide Prozesse: Knopf «Starten» über dem Block, Prüfen vor
// Laufen samt Rückfrage nach den Tabellen, Lauf im Fenster, Schritt-Kanal
// `workflow:step` mit seiner Prüfung, Schritt-Modul mit der Auflösung über den
// Index des Bereichs, die eine Schreib-Schnittstelle der Verdrahtung mit Prüf-
// Naht und Rechten, die Lauf-Marke an der Naht, der Beobachter des Bereichs
// und der Ereignis-Prüfer. Die Unit-Fälle stellen je einen Nachbarn als
// Attrappe; erst hier läuft sie am Stück.
//
// WF-DB-01: Ein von Hand gestarteter Workflow legt in «Library» einen
//   Datensatz an, ändert einen vorhandenen über seine Kennung und unmittelbar
//   danach den eben angelegten über seine Anzeige-Form (4T-002545, Nachtrag zu
//   E3: der Index steht vor jeder Auflösung auf dem Stand der eigenen
//   Schreibvorgänge, ohne Abhängigkeit vom Zeitabstand). Danach steht alles in
//   der Tabellen-Datei, und der letzte Lauf nennt je Schritt Tabelle,
//   Datensatz und Vorgangs-Kennung. Zwei scharfe Ereignis-Workflows warten auf
//   eine neue und eine geänderte Datei im Ordner der Tabelle: Das Schreiben
//   des Workflows löst keinen von beiden aus.
//
// WF-DB-02 (4T-002546, Story 4S-001197): `db-query` schreibt das Ergebnis einer
//   Abfrage-Datei nach dem Vorbild «Long Books» des Demo-Bereichs unter eine
//   Überschrift; ein zweiter Lauf ersetzt die Tabelle, statt eine zweite
//   anzuhängen, und der Rest der Notiz bleibt zeichengleich. Seit dem Nachtrag
//   vom 2026-11-10 trägt der Datensatz-Verweis die Anzeige-Form als
//   Anzeigetext: Die gerenderte und die Live-Ansicht der Notiz zeigen den
//   Titel des Buchs wie die Abfrage-Ansicht.
//
// WF-DB-03 (4T-002547, Stories 4S-001198 und 4S-001199): `db-for-each` über
//   dieselbe Abfrage-Datei ändert jeden gelieferten Datensatz über
//   `{{record:id}}` mit einem Wert aus `{{record:pages}}`; danach liest eine
//   Zeile `{{db:Library:Zauberberg:pages}}` frisch, und ein mit `as "neu"`
//   angelegter Datensatz wird über `{{created:neu}}` geändert und nach der
//   einen Bestätigung vor dem Lauf wieder gelöscht. Der Kanal `workflow:dbRead`
//   läuft hier mit der echten Prüfung im Hauptprozess. Seit dem Nachzug zu
//   4T-002547 nennt die Bestätigung das Ziel in Worten, ohne rohen Platzhalter.
//
// WF-DB-04 (4T-002548, Stories 4S-001201 und 4S-001202): `db-open` öffnet die
//   Maske des Buchs «Solaris», `db-check` meldet das Ergebnis der Konsistenz-
//   Prüfung einer Tabelle mit zu niedrigem Hochwasserstand in der Statuszeile,
//   und ein zweiter Workflow öffnet mit `db-open-list` eine Abfrage-Datei mit
//   Listen-Maske. Sprachfrei geprüft an Tabellen- und Datensatz-Namen.
//
// WF-DB-05 (Nachzug zu 4T-002548, Story 4S-001201, AK5): Steht die Maske eines
//   Buchs in ungespeicherter Bearbeitung, wartet `db-open` auf die Antwort der
//   Rückfrage. «Weiter bearbeiten» beendet den Lauf mit eigenem Grund, die
//   getippte Bearbeitung bleibt; im zweiten Lauf öffnet «Verwerfen» das Ziel,
//   und der Lauf endet gelungen. Belegt ist hier das Ergebnis: Der Lauf endet
//   mit `dbOpenEditContinued`, und die Bearbeitung bleibt unverändert. Dass der
//   Schritt solange wartet, belegt der Unit-Fall in
//   `test/unit/renderer/workflow-db-open-warten.test.js`; die Momentaufnahmen
//   des Lauf-Stands beim Erscheinen der Rückfrage sind hier nur Vorbedingung.
//
// **Wie «kein Ereignis-Lauf» gemessen wird, ohne feste Pause** (Stabilitäts-
// regel 2, Muster WF-EREIGNIS-03): Nach dem Lauf entsteht von außen eine Datei
// im Ordner der Tabelle als Anker und wird danach von außen geändert. Der
// Prüfer wertet strikt nacheinander aus und entprellt jede Datei gleich lang;
// ein Lauf durch die Tabellen-Datei wäre vor dem des Ankers eingereiht worden.
// Steht der Anker als letzter Lauf da und zählt der Lauf-Stand je Wächter
// genau einen Lauf, gab es keinen durch die Tabellen-Datei.
//
// **Sprachfrei geprüft:** Ergebnisse an den Dateien und am Lauf-Stand der
// Begleitdateien.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const {
  definitionsPruefsumme,
} = require('../../../src/main/workflows/workflow-definition-hash.js');

const PANE = '.pane-group[data-pane="0"]';
// Beobachter, Entprellung (2 Sekunden nach der Ruhe) und Zustellung.
const EREIGNIS_ZEIT = { timeout: 45000 };

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
  '  display: title',
  '  lastId: 1',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Solaris',
  '| 224',
  '```',
  '',
].join('\n');

function workflowText(name, kopf, zeilen) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    ...kopf,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');
}

// Ein scharfer Ereignis-Workflow: Prüfsumme in der Begleitdatei wie nach der
// Scharf-Schaltung (Muster WF-EREIGNIS).
function legeWaechterAn(ordner, name, ereignis) {
  const text = workflowText(name, ['trigger: event', `event: ${ereignis}`], [`notify "${name}"`]);
  const datei = path.join(ordner, `${name}.md`);
  fs.writeFileSync(datei, text, 'utf8');
  const container = mddStore.emptyContainer();
  mddStore.setWorkflowArmed(container, { hash: definitionsPruefsumme(text) }, Date.now());
  const begleitdatei = path.join(ordner, `${name}.mdd`);
  fs.writeFileSync(begleitdatei, mddStore.serializeContainer(container), 'utf8');
  return begleitdatei;
}

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-datenbank-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  const workflows = path.join(wurzel, 'Workflows');
  fs.mkdirSync(workflows);
  fs.mkdirSync(path.join(wurzel, 'Daten'));
  const library = path.join(wurzel, 'Daten', 'Library.md');
  fs.writeFileSync(library, LIBRARY, 'utf8');
  const probe = path.join(workflows, 'Schreib-Probe.md');
  fs.writeFileSync(
    probe,
    workflowText(
      'Schreib-Probe',
      [],
      [
        'db-create "Library" title="Probe-Buch" pages="120"',
        'db-update "Library" "r-00001" pages="225"',
        'db-update "Library" "Probe-Buch" pages="130"',
      ],
    ),
    'utf8',
  );
  return {
    wurzel,
    library,
    probe,
    probeStand: path.join(workflows, 'Schreib-Probe.mdd'),
    neu: legeWaechterAn(workflows, 'Wächter-Neu', 'file-created in "Daten"'),
    geaendert: legeWaechterAn(workflows, 'Wächter-Geändert', 'file-changed in "Daten"'),
  };
}

function laufStand(begleitdatei) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
}

const ereignisDatei = (begleitdatei) => {
  const stand = laufStand(begleitdatei);
  return stand && stand.lastRun && stand.lastRun.event ? stand.lastRun.event.file : null;
};

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

test.describe('WF-DB: Schreib-Schritte der Datenbank (4T-002545)', () => {
  test('WF-DB-01: anlegen und ändern über die Schreib-Schnittstelle, kein Ereignis-Lauf an der Tabellen-Datei', async () => {
    test.setTimeout(150000);
    const b = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, b.wurzel);
      // Beide Wächter sind scharf, sobald das Statusleisten-Element erscheint.
      await expect(page.locator('#statusbar-workflows')).toBeVisible(EREIGNIS_ZEIT);

      await oeffneDokumentImFenster(app, page, b.probe);
      await page.locator(SEL.viewBtn('live')).click();
      const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopf).toHaveCount(1);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      await kopf.locator('.cm-wf-starten').click();

      // Der Lauf ist durch: beide Schritte gelungen, mit Spur je Schritt (AK1, AK5).
      await expect
        .poll(() => (laufStand(b.probeStand) || {}).lastRun || null, { timeout: 30000 })
        .toMatchObject({ status: 'ok' });
      const journal = laufStand(b.probeStand).lastRun.journal;
      expect(journal.map((e) => [e.command, e.table, e.record])).toEqual([
        ['db-create', 'Library', 'r-00002'],
        ['db-update', 'Library', 'r-00001'],
        ['db-update', 'Library', 'r-00002'],
      ]);
      for (const e of journal) expect(e.transaction).toBeGreaterThan(0);
      expect(journal[1].transaction).toBeGreaterThan(journal[0].transaction);
      expect(journal[2].transaction).toBeGreaterThan(journal[1].transaction);
      const text = fs.readFileSync(b.library, 'utf8');
      expect(text).toContain('|- id="r-00002"');
      expect(text).toMatch(/\| Probe-Buch\r?\n\| 130/);
      expect(text).toMatch(/\| Solaris\r?\n\| 225/);

      // Anker von außen: erst eine neue Datei, dann ihre Änderung (AK4).
      const anker = path.join(b.wurzel, 'Daten', 'Anker.md');
      fs.writeFileSync(anker, '# Anker\n', 'utf8');
      await expect.poll(() => ereignisDatei(b.neu), EREIGNIS_ZEIT).toBe('Daten/Anker.md');
      fs.writeFileSync(anker, '# Anker\n\nZweite Fassung.\n', 'utf8');
      await expect.poll(() => ereignisDatei(b.geaendert), EREIGNIS_ZEIT).toBe('Daten/Anker.md');
      // Je Wächter genau ein Lauf, und zwar der des Ankers.
      expect(laufStand(b.neu).runs).toBe(1);
      expect(laufStand(b.geaendert).runs).toBe(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });

  test('WF-DB-02: db-query schreibt die Tabelle unter eine Überschrift, ein zweiter Lauf ersetzt sie', async () => {
    test.setTimeout(120000);
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbquery-'));
    fs.writeFileSync(
      path.join(wurzel, 'Area_Settings.mdda'),
      JSON.stringify(
        { schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } },
        null,
        2,
      ),
      'utf8',
    );
    fs.mkdirSync(path.join(wurzel, 'Workflows'));
    fs.mkdirSync(path.join(wurzel, 'Daten'));
    fs.writeFileSync(path.join(wurzel, 'Daten', 'Library.md'), LIBRARY, 'utf8');
    fs.writeFileSync(
      path.join(wurzel, 'Long Books.md'),
      [
        '---',
        'db-query:',
        'minpages: 100',
        '---',
        '',
        '```perspective-query',
        'TABLE RECORDS pages',
        'FROM "Library"',
        'WHERE pages > this.minpages',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const uebersicht = path.join(wurzel, 'Übersicht.md');
    const vorher = '# Übersicht\n\n## Lange Bücher\n\n## Danach\nbleibt\n';
    fs.writeFileSync(uebersicht, vorher, 'utf8');
    const probe = path.join(wurzel, 'Workflows', 'Abfrage-Probe.md');
    fs.writeFileSync(
      probe,
      workflowText(
        'Abfrage-Probe',
        [],
        ['db-query "Long Books.md" into "Übersicht.md" under "Lange Bücher"'],
      ),
      'utf8',
    );
    const stand = path.join(wurzel, 'Workflows', 'Abfrage-Probe.mdd');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(app, page, probe);
      await page.locator(SEL.viewBtn('live')).click();
      const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopf).toHaveCount(1);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      const tabelle =
        /## Lange Bücher\r?\n\r?\n\| [^|]+ \| [^|]+ \|\r?\n\| --- \| --- \|\r?\n\| \[\[Library#\^r-00001\\\|Solaris\]\] \| 224 \|\r?\n\r?\n## Danach\r?\nbleibt/;
      for (const runs of [1, 2]) {
        await kopf.locator('.cm-wf-starten').click();
        await expect.poll(() => (laufStand(stand) || {}).runs || 0, { timeout: 30000 }).toBe(runs);
        expect(laufStand(stand).lastRun).toMatchObject({ status: 'ok' });
        const text = fs.readFileSync(uebersicht, 'utf8');
        expect(text).toMatch(tabelle);
        // Genau eine Tabelle: eine Trennzeile.
        expect(text.split(/\r?\n/).filter((z) => z === '| --- | --- |')).toHaveLength(1);
      }
      // Sichtbar wie in der Abfrage-Ansicht: der Titel, nicht die Kennung.
      await oeffneDokumentImFenster(app, page, uebersicht);
      await page.locator(SEL.viewBtn('rendered')).click();
      const gerendert = page.locator(`${SEL.markdownBody0} table a.wikilink`);
      await expect(gerendert).toHaveText('Solaris');
      await page.locator(SEL.viewBtn('live')).click();
      const live = page.locator(`${PANE} .pane-source table a.wikilink`);
      await expect(live).toHaveText('Solaris');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
  test('WF-DB-03: db-for-each mit record, db und created über beide Prozesse', async () => {
    test.setTimeout(120000);
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbschleife-'));
    fs.writeFileSync(
      path.join(wurzel, 'Area_Settings.mdda'),
      JSON.stringify(
        { schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } },
        null,
        2,
      ),
      'utf8',
    );
    fs.mkdirSync(path.join(wurzel, 'Workflows'));
    fs.mkdirSync(path.join(wurzel, 'Daten'));
    const library = path.join(wurzel, 'Daten', 'Library.md');
    fs.writeFileSync(
      library,
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: title',
        '    - name: pages',
        '      type: number',
        '    - name: loanNote',
        '  display: title',
        '  lastId: 3',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Solaris',
        '| 224',
        '| ',
        '|- id="r-00002"',
        '| Zauberberg',
        '| 1000',
        '| ',
        '|- id="r-00003"',
        '| Kurz',
        '| 80',
        '| ',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(wurzel, 'Long Books.md'),
      [
        '---',
        'db-query:',
        'minpages: 100',
        '---',
        '',
        '```perspective-query',
        'TABLE RECORDS title, pages',
        'FROM "Library"',
        'WHERE pages > this.minpages',
        'SORT pages DESC',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const probe = path.join(wurzel, 'Workflows', 'Schleifen-Probe.md');
    fs.writeFileSync(
      probe,
      workflowText(
        'Schleifen-Probe',
        [],
        [
          'db-for-each "Long Books.md"',
          '  db-update "Library" "{{record:id}}" loanNote="lang: {{record:pages}} Seiten"',
          'end',
          'db-update "Library" "Kurz" loanNote="Zauberberg {{db:Library:Zauberberg:pages}}"',
          'db-create "Library" title="Neu-Buch" pages="50" as "neu"',
          'db-update "Library" "{{created:neu}}" pages="60"',
          'db-delete "Library" "{{created:neu}}"',
        ],
      ),
      'utf8',
    );
    const stand = path.join(wurzel, 'Workflows', 'Schleifen-Probe.mdd');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(app, page, probe);
      await page.locator(SEL.viewBtn('live')).click();
      const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopf).toHaveCount(1);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      await kopf.locator('.cm-wf-starten').click();
      // Die eine Bestätigung vor dem Lauf nennt das Ziel der db-delete, seit
      // 4T-002547 in Worten: die Tabelle, aber kein roher Platzhalter.
      await expect(page.locator('#link-preview-modal')).toBeVisible();
      const zeile = page.locator('#link-preview-modal .link-update-row-main');
      await expect(zeile).toHaveCount(1);
      await expect(zeile).toContainText('Library');
      await expect(zeile).not.toContainText('{{');
      await page.locator('#btn-link-preview-continue').click();

      await expect
        .poll(() => (laufStand(stand) || {}).lastRun || null, { timeout: 30000 })
        .toMatchObject({ status: 'ok' });
      const journal = laufStand(stand).lastRun.journal;
      // Reihenfolge der Abfrage (pages absteigend), je Datensatz genau einmal.
      expect(journal.map((e) => [e.command, e.record])).toEqual([
        ['db-update', 'r-00002'],
        ['db-update', 'r-00001'],
        ['db-update', 'r-00003'],
        ['db-create', 'r-00004'],
        ['db-update', 'r-00004'],
        ['db-delete', 'r-00004'],
      ]);
      const text = fs.readFileSync(library, 'utf8');
      expect(text).toMatch(/\| Zauberberg\r?\n\| 1000\r?\n\| lang: 1000 Seiten/);
      expect(text).toMatch(/\| Solaris\r?\n\| 224\r?\n\| lang: 224 Seiten/);
      expect(text).toMatch(/\| Kurz\r?\n\| 80\r?\n\| Zauberberg 1000/);
      expect(text).not.toContain('r-00004');
      expect(text).not.toContain('{{');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
  test('WF-DB-04: db-open zeigt die Maske, db-check meldet, db-open-list öffnet die Listen-Maske', async () => {
    test.setTimeout(120000);
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbmasken-'));
    fs.writeFileSync(
      path.join(wurzel, 'Area_Settings.mdda'),
      JSON.stringify(
        { schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } },
        null,
        2,
      ),
      'utf8',
    );
    fs.mkdirSync(path.join(wurzel, 'Workflows'));
    fs.mkdirSync(path.join(wurzel, 'Daten'));
    fs.writeFileSync(path.join(wurzel, 'Daten', 'Library.md'), LIBRARY, 'utf8');
    // Zwei Datensätze, aber der Hochwasserstand steht auf 1: ein Befund.
    fs.writeFileSync(
      path.join(wurzel, 'Daten', 'Kaputt.md'),
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: title',
        '  lastId: 1',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| A',
        '|- id="r-00002"',
        '| B',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(wurzel, 'Alle Bücher.md'),
      [
        '---',
        'db-query:',
        '  editable: true',
        '---',
        '',
        '```perspective-query',
        'TABLE RECORDS title, pages FROM "Library"',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const masken = path.join(wurzel, 'Workflows', 'Masken-Probe.md');
    fs.writeFileSync(
      masken,
      workflowText('Masken-Probe', [], ['db-open "Library" "Solaris"', 'db-check "Kaputt"']),
      'utf8',
    );
    const listen = path.join(wurzel, 'Workflows', 'Listen-Probe.md');
    fs.writeFileSync(
      listen,
      workflowText('Listen-Probe', [], ['db-open-list "Alle Bücher.md"']),
      'utf8',
    );
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      for (const [datei, stand] of [
        [masken, path.join(wurzel, 'Workflows', 'Masken-Probe.mdd')],
        [listen, path.join(wurzel, 'Workflows', 'Listen-Probe.mdd')],
      ]) {
        await oeffneDokumentImFenster(app, page, datei);
        await page.locator(SEL.viewBtn('live')).click();
        const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
        await expect(kopf).toHaveCount(1);
        await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
        await kopf.locator('.cm-wf-starten').click();
        await expect
          .poll(() => (laufStand(stand) || {}).lastRun || null, { timeout: 30000 })
          .toMatchObject({ status: 'ok' });
        if (datei === masken) {
          const maske = page.locator(`${PANE} .pane-system .db-form-page`);
          await expect(maske).toBeVisible({ timeout: 20000 });
          await expect(maske.locator('.db-form-heading')).toHaveText('Library');
          await expect(maske.locator('.db-form-record')).toContainText('Solaris');
          // Die Benachrichtigung von db-check nennt die Zahl der Befunde und
          // dahinter die Tabelle mit dem Befund; der Anker trägt in allen fünf
          // Sprachen («1 Befund in ‹Kaputt›», «1 constat dans ‹ Kaputt ›» …).
          await expect(page.locator('#statusbar-hint')).toContainText(/\b1\b\D*‹\s?Kaputt\s?›/);
        }
      }
      await expect(page.locator(SEL.activeTab0)).toContainText('Alle Bücher');
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(page.locator(`${SEL.markdownBody0} .db-list table.db-list-table`)).toBeVisible({
        timeout: 20000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('WF-DB-05: db-open wartet auf die Rückfrage der Maske bei ungespeicherter Bearbeitung', async () => {
    test.setTimeout(120000);
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbwarten-'));
    fs.writeFileSync(
      path.join(wurzel, 'Area_Settings.mdda'),
      JSON.stringify(
        { schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } },
        null,
        2,
      ),
      'utf8',
    );
    fs.mkdirSync(path.join(wurzel, 'Workflows'));
    fs.mkdirSync(path.join(wurzel, 'Daten'));
    const library = path.join(wurzel, 'Daten', 'Library.md');
    fs.writeFileSync(
      library,
      LIBRARY.replace('lastId: 1', 'lastId: 2').replace(
        '| 224\n',
        '| 224\n|- id="r-00002"\n| Zauberberg\n| 1000\n',
      ),
      'utf8',
    );
    const probe = path.join(wurzel, 'Workflows', 'Warte-Probe.md');
    fs.writeFileSync(
      probe,
      workflowText('Warte-Probe', [], ['db-open "Library" "Zauberberg"']),
      'utf8',
    );
    const stand = path.join(wurzel, 'Workflows', 'Warte-Probe.mdd');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      // Die Maske von «Solaris» in Bearbeitung, mit getipptem, ungespeichertem Titel.
      await page.evaluate((filePath) => {
        document.dispatchEvent(
          new CustomEvent('scg:open-form', { detail: { filePath, recordId: 'r-00001' } }),
        );
      }, library);
      const maske = page.locator(`${PANE} .pane-system .db-form-page`);
      await expect(maske.locator('.db-form-record')).toContainText('Solaris', { timeout: 20000 });
      await maske.locator('.db-form-edit').click();
      const eingabe = maske.locator('.db-form-input').first();
      await expect(eingabe).toBeVisible();
      await eingabe.fill('Solaris getippt');

      const starte = async () => {
        await oeffneDokumentImFenster(app, page, probe);
        await page.locator(SEL.viewBtn('live')).click();
        const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
        await expect(kopf).toHaveCount(1);
        await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
        await kopf.locator('.cm-wf-starten').click();
        await expect(maske.locator('.db-form-confirm')).toBeVisible({ timeout: 20000 });
      };

      // Erster Lauf: Der Schritt wartet; «Weiter bearbeiten» beendet ihn mit Grund.
      await starte();
      // Vorbedingung, kein Beleg des Wartens (siehe Kopf): noch kein Lauf verbucht.
      expect(laufStand(stand)).toBe(null);
      await maske.locator('.db-form-confirm-back').click();
      await expect
        .poll(() => (laufStand(stand) || {}).lastRun || null, { timeout: 30000 })
        .toMatchObject({ status: 'failed', code: 'dbOpenEditContinued' });
      await expect(maske.locator('.db-form-confirm')).toHaveCount(0);
      await expect(eingabe).toHaveValue('Solaris getippt');

      // Zweiter Lauf: «Verwerfen» öffnet das Ziel, der Lauf endet gelungen.
      await starte();
      // Vorbedingung, kein Beleg des Wartens (siehe Kopf): nur der erste Lauf verbucht.
      expect(laufStand(stand).runs).toBe(1);
      await maske.locator('.db-form-confirm-discard').click();
      await expect.poll(() => (laufStand(stand) || {}).runs || 0, { timeout: 30000 }).toBe(2);
      expect(laufStand(stand).lastRun).toMatchObject({ status: 'ok' });
      await expect(maske.locator('.db-form-record')).toContainText('Zauberberg');
      // Verworfen heißt verworfen: In der Tabelle steht der alte Titel.
      expect(fs.readFileSync(library, 'utf8')).not.toContain('Solaris getippt');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
