// 4T-002003 (Epic 3E-000307): Die Zählung der betroffenen Kalender-Werte über
// einen Bereich (src/main/area/calendar-epoch-scan.js) und das Schreiben über
// die echte Ersetzen-Strecke.
//
// **Geprüft wird an der realen Konstellation** (Auflage der Aufgaben-Klasse K3,
// Muster area-replace.test.js und tag-umbenennung.test.js): ein echter
// Bereichs-Ordner mit mehreren Dokumenten, Begleit-Dateien mit Notizen, eine
// Tabellen-Datei mit Datensatz-Block, die echte Dokument-Historie und die
// Definitionen aus der gregorianischen Vorlage, wie die Einstellungen sie
// ablegen. Ein Offset, der nur im Prüffall stimmt, wäre hier ein Schreibfehler
// in einer fremden Datei.
//
// **Seit der Plan-Änderung vom 2026-10-01** werden Werte beiderseits der neuen
// Grenze gesichert, jeder in seine eigene neue Schreibweise. Die Fixtures
// tragen deshalb Werte vor und nach der Grenze, mit und ohne Kürzel, in
// derselben Datei.
//
// Alle Module über createRequire aus EINEM Modul-Graphen: Der Vorrat der Suche
// ist Modul-Zustand, und über zwei Vitest-Instanzen fände die Ersetzen-Strecke
// ihren Bezugs-Stand nie.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  gibBereichsVorratFrei,
  konfiguriereBereichsSuche,
  suchStandFuer,
} = require('../../src/main/area/area-search.js');
const { createEpochenSchutzScan } = require('../../src/main/area/calendar-epoch-scan.js');
const { createAreaReplace } = require('../../src/main/area/area-replace.js');
const { createMddHistory } = require('../../src/main/documents/mdd-history.js');
const mddStore = require('../../src/main/documents/mdd-store.js');
const { laufOptionen } = require('../../src/shared/calendar/calendar-epoch-guard.js');
const { createGregorianTemplate } = require('../../src/shared/calendar/calendar-template.js');

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-epochenschutz-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, inhalt) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

function lies(p) {
  return fs.readFileSync(p, 'utf8');
}

// Die echte Historie ohne Electron (Muster area-replace.test.js). Ab Werk ist
// die Historisierung AUS — und genau dann muss die Zwangs-Sicherung greifen.
function historieFuer(root) {
  const store = {
    get: (schluessel, vorgabe) => (schluessel === 'historyEnabled' ? false : vorgabe),
  };
  return createMddHistory({
    getStore: () => store,
    areaOfWindow: () => ({ rootPath: root }),
    readAreaHistoryDefault: async () => undefined,
  });
}

// Der Ermittler mit derselben Pfad-Bildung der Begleit-Datei wie `note:read`.
function ermittlerFuer(root) {
  return createEpochenSchutzScan({ mddPathFor: historieFuer(root).mddPathFor })
    .ermittleEpochenSchutz;
}

// Die Ersetzen-Strecke, wie der Kanal sie baut, samt ihrer Historie.
function streckeFuer(root) {
  const historie = historieFuer(root);
  const { ersetzeImBereich } = createAreaReplace({
    resolveHistoryFor: historie.resolveHistoryFor,
    recordMddOnSave: historie.recordMddOnSave,
  });
  return { ersetzeImBereich, historie };
}

function notizSchreiben(root, rel, text) {
  const container = mddStore.emptyContainer();
  mddStore.setNote(container, text, Date.UTC(2026, 9, 1));
  const mdd = historieFuer(root).mddPathFor(path.join(root, rel));
  fs.writeFileSync(mdd, mddStore.serializeContainer(container), 'utf8');
  return mdd;
}

// Die Sektion calendarSystems, wie die Einstellungen sie speichern: vorher mit
// zwei Epochen, nachher mit der nachgetragenen «Neu» ab 2030-01-01 (Lage der
// Messung vom 2026-09-30). Mit `zweite` bekommt auch der Vergleichskalender
// eine neue Epoche, «Zweite» ab 2035-01-01.
function sektion(mitNeu, { zweite = false } = {}) {
  const eigen = createGregorianTemplate({ id: 'eigen', name: 'Eigenkalender' });
  if (mitNeu) eigen.epochs = [...eigen.epochs, { name: 'Neu', abbr: 'Neu', start: [2030, 1, 1] }];
  const vergleich = createGregorianTemplate({ id: 'vergleich', name: 'Vergleichskalender' });
  if (zweite) {
    vergleich.epochs = [...vergleich.epochs, { name: 'Zweite', abbr: 'Zw', start: [2035, 1, 1] }];
  }
  return { blocks: [{ id: 'welt', name: 'Welt', calendars: [eigen, vergleich] }] };
}
const AUFTRAG = { alt: sektion(false), neu: sektion(true), aktiv: null };

const ALPHA = [
  '---',
  'termin: "@{Eigenkalender: 2026-09-30}"',
  '---',
  '',
  'Heute @{Eigenkalender: 2026-09-30 14:30}, früher @{Eigenkalender: 44-03-15 v. Chr.}.',
  'Gesichert @{Eigenkalender: 2026-09-30 n. Chr.}, anderer @{Vergleichskalender: 2026-09-30}.',
  'Später @{Eigenkalender: 2040-05-01}, gekennzeichnet @{Eigenkalender: 2040-05-01 n. Chr. 14:30}.',
  'Karte der Vorlage @@{14:00}.',
  '',
  '```js',
  'const beispiel = "@{Eigenkalender: 2020-05-05}";',
  '```',
  '',
].join('\n');

// Die erwartete Fassung nach dem Sichern: vor der Grenze mit dem Kürzel der
// bisherigen Epoche, ab ihr in der Jahreszählung der neuen; der Zeit-Teil
// bleibt, ein bisheriges Kürzel entfällt.
const ALPHA_GESICHERT = ALPHA.replace(
  '"@{Eigenkalender: 2026-09-30}"',
  '"@{Eigenkalender: 2026-09-30 n. Chr.}"',
)
  .replace('@{Eigenkalender: 2026-09-30 14:30}', '@{Eigenkalender: 2026-09-30 n. Chr. 14:30}')
  .replace('@{Eigenkalender: 2040-05-01}', '@{Eigenkalender: 11-05-01}')
  .replace('@{Eigenkalender: 2040-05-01 n. Chr. 14:30}', '@{Eigenkalender: 11-05-01 14:30}')
  .replace('@{Eigenkalender: 2020-05-05}', '@{Eigenkalender: 2020-05-05 n. Chr.}');

const BETA = [
  '# Plan',
  '',
  '```perspective-canvas',
  '!karte k1 x=0 y=0 b=200 h=100',
  'Abgabe @{Eigenkalender: 2027-01-15}',
  '```',
  '',
].join('\n');

// Das Fixture der Tabellen-Datei trägt einen betroffenen Wert HINTER dem
// Datensatz-Block: Ohne Rücknahme-Karte läge sein Offset um die Länge der
// geleerten Datensatz-Zeilen zu früh (Muster tag-umbenennung.test.js). Der Wert
// IM Block ist ein Feld eines Datensatzes und zählt nicht.
const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Titel',
  '---',
  '',
  'Vor dem Block @{Eigenkalender: 2026-03-01}.',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna Meier mit viel Text, damit die Verschiebung gross genug ist @{Eigenkalender: 2026-04-01}',
  '|- id="r-00002"',
  '| Bert Huber mit ebenfalls reichlich Text in dieser Datensatz-Zeile',
  '```',
  '',
  'Hinter dem Block @{Eigenkalender: 2040-05-01}.',
  '',
].join('\n');

function bereich() {
  const root = makeRoot();
  const pfade = {
    alpha: write(root, 'alpha.md', ALPHA),
    beta: write(root, 'unter/beta.md', BETA),
    tabelle: write(root, 'Kundenliste.md', TABELLE),
    gamma: write(root, 'gamma.md', '# Ohne Wert\n'),
    delta: write(root, 'delta.md', '# Mit defekter Begleit-Datei\n'),
    leer: write(root, 'leer.md', 'Nichts @{Vergleichskalender: 2026-09-30}.\n'),
  };
  // Notizen: eine an einem Dokument, das auch im Text Werte trägt (zählt als
  // EIN Dokument), eine an einem Dokument ohne Werte im Text, eine defekte.
  notizSchreiben(root, 'alpha.md', 'Rückruf @{Eigenkalender: 2026-10-02}.');
  notizSchreiben(
    root,
    'gamma.md',
    'Erst @{Eigenkalender: 2026-01-01}, dann @{Eigenkalender: 2031-02-01 08:00}.',
  );
  fs.writeFileSync(historieFuer(root).mddPathFor(pfade.delta), '{ kaputt', 'utf8');
  return { root, pfade };
}

const LEER = { vorratModus: 'leer', nachtraege: [], dateien: [], notizen: [] };

afterEach(() => {
  vi.restoreAllMocks();
  gibBereichsVorratFrei();
  konfiguriereBereichsSuche({});
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Aufraeumen ist bestes Bemuehen */
    }
  }
  tmpDirs = [];
});

describe('Epochen-Schutz: Zählung über den Bereich', () => {
  it('zählt Dokument- und Notiz-Stellen über mehrere Dokumente', async () => {
    const { root, pfade } = bereich();
    const ergebnis = await ermittlerFuer(root)(root, AUFTRAG);

    expect(ergebnis.vorratModus).toBe('vorrat');
    // Text: alpha 5 (Kopf, Fließtext vor und nach der Grenze, mit und ohne
    // Kürzel, Code), beta 1 (Canvas-Karte), Tabelle 2 (vor und hinter dem
    // Block). Notizen: alpha 1, gamma 2. Dokumente: alpha, beta, Tabelle,
    // gamma — alpha trotz Text UND Notiz einmal.
    expect(ergebnis.nachtraege).toEqual([
      {
        blockId: 'welt',
        calId: 'eigen',
        name: 'Eigenkalender',
        label: 'n. Chr.',
        werte: 11,
        dokumente: 4,
      },
    ]);
    expect(ergebnis.dateien.map((d) => d.pfad).sort()).toEqual(
      [pfade.alpha, pfade.beta, pfade.tabelle].sort(),
    );
    expect(ergebnis.notizen).toEqual(
      expect.arrayContaining([
        { pfad: pfade.alpha, anzahl: 1 },
        { pfad: pfade.gamma, anzahl: 2 },
      ]),
    );
    expect(ergebnis.notizen).toHaveLength(2);
  });

  it('liefert aufsteigende Datei-Offsets auf das `@` mit ihrem Ersatz, auch hinter einem Datensatz-Block', async () => {
    const { root, pfade } = bereich();
    const { dateien } = await ermittlerFuer(root)(root, AUFTRAG);
    const zu = (pfad) => dateien.find((d) => d.pfad === pfad);

    expect(zu(pfade.alpha).offsets).toEqual([
      ALPHA.indexOf('@{Eigenkalender: 2026-09-30}'),
      ALPHA.indexOf('@{Eigenkalender: 2026-09-30 14:30}'),
      ALPHA.indexOf('@{Eigenkalender: 2040-05-01}'),
      ALPHA.indexOf('@{Eigenkalender: 2040-05-01 n. Chr. 14:30}'),
      ALPHA.indexOf('@{Eigenkalender: 2020-05-05}'),
    ]);
    expect(zu(pfade.alpha).ersetzungen).toEqual([
      '@{Eigenkalender: 2026-09-30 n. Chr.}',
      '@{Eigenkalender: 2026-09-30 n. Chr. 14:30}',
      '@{Eigenkalender: 11-05-01}',
      '@{Eigenkalender: 11-05-01 14:30}',
      '@{Eigenkalender: 2020-05-05 n. Chr.}',
    ]);
    expect(zu(pfade.beta).offsets).toEqual([BETA.indexOf('@{Eigenkalender: 2027-01-15}')]);
    // Die Stelle hinter dem Block in DATEI-Koordinaten; der Wert im Block fehlt.
    expect(zu(pfade.tabelle)).toEqual({
      pfad: pfade.tabelle,
      offsets: [
        TABELLE.indexOf('@{Eigenkalender: 2026-03-01}'),
        TABELLE.indexOf('@{Eigenkalender: 2040-05-01}'),
      ],
      ersetzungen: ['@{Eigenkalender: 2026-03-01 n. Chr.}', '@{Eigenkalender: 11-05-01}'],
    });
    for (const d of dateien) {
      const text = lies(d.pfad);
      for (const o of d.offsets) expect(text.slice(o, o + 17)).toBe('@{Eigenkalender: ');
    }
  });

  it('liefert ohne Nachtrag das leere Ergebnis, ohne den Bereich zu lesen', async () => {
    const { root } = bereich();
    const ergebnis = await ermittlerFuer(root)(root, { alt: sektion(false), neu: sektion(false) });
    expect(ergebnis).toEqual(LEER);
    // Kein Vorrat ist entstanden: Der Bereich wurde nicht gelesen.
    expect(suchStandFuer(root, 'alpha.md')).toBeNull();
    // Ebenso bei fehlender oder unbrauchbarer Eingabe.
    expect(await ermittlerFuer(root)(root, {})).toEqual(LEER);
  });

  it('nennt die Nachträge auch dann, wenn der Bereich nicht vorgehalten ist', async () => {
    const { root } = bereich();
    // Der Deckel des Such-Vorrats ist überschritten: Es gibt keinen Stand, gegen
    // den geschrieben werden könnte, und damit auch keine Zählung.
    konfiguriereBereichsSuche({ maxVorratBytes: 1 });
    const ergebnis = await ermittlerFuer(root)(root, AUFTRAG);
    expect(ergebnis).toEqual({
      vorratModus: 'direkt',
      nachtraege: [
        {
          blockId: 'welt',
          calId: 'eigen',
          name: 'Eigenkalender',
          label: 'n. Chr.',
          werte: null,
          dokumente: null,
        },
      ],
      dateien: [],
      notizen: [],
    });
  });

  it('zählt im Bereich ohne betroffene Werte null', async () => {
    const root = makeRoot();
    write(
      root,
      'a.md',
      'Nur @{Vergleichskalender: 2040-09-30} und @{Eigenkalender: 2029-12-31 n. Chr.}.\n',
    );
    const ergebnis = await ermittlerFuer(root)(root, AUFTRAG);
    expect([ergebnis.nachtraege[0].werte, ergebnis.nachtraege[0].dokumente]).toEqual([0, 0]);
    expect([ergebnis.dateien, ergebnis.notizen]).toEqual([[], []]);
  });

  it('verlangt die Pfad-Bildung der Begleit-Datei', () => {
    expect(() => createEpochenSchutzScan({})).toThrow(TypeError);
  });
});

describe('Epochen-Schutz: Schreiben über die echte Ersetzen-Strecke', () => {
  it('schreibt jede gezählte Stelle in ihre neue Schreibweise und sichert den Vor-Stand', async () => {
    const { root, pfade } = bereich();
    const { dateien } = await ermittlerFuer(root)(root, AUFTRAG);

    const { ersetzeImBereich, historie } = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, { ...laufOptionen(), dateien });

    expect(ergebnis.fehlgeschlagen).toEqual([]);
    expect(ergebnis.veraendert).toEqual([]);
    expect(ergebnis.geaendert).toEqual(
      expect.arrayContaining([
        { pfad: pfade.alpha, anzahl: 5 },
        { pfad: pfade.beta, anzahl: 1 },
        { pfad: pfade.tabelle, anzahl: 2 },
      ]),
    );
    expect(ergebnis.geaendert).toHaveLength(3);

    // Der Datei-Inhalt Zeichen für Zeichen: nur die gezählten Stellen ändern sich.
    expect(lies(pfade.alpha)).toBe(ALPHA_GESICHERT);
    expect(lies(pfade.beta)).toBe(
      BETA.replace('@{Eigenkalender: 2027-01-15}', '@{Eigenkalender: 2027-01-15 n. Chr.}'),
    );
    expect(lies(pfade.tabelle)).toBe(
      TABELLE.replace(
        '@{Eigenkalender: 2026-03-01}',
        '@{Eigenkalender: 2026-03-01 n. Chr.}',
      ).replace('@{Eigenkalender: 2040-05-01}', '@{Eigenkalender: 11-05-01}'),
    );
    expect(lies(pfade.leer)).toBe('Nichts @{Vergleichskalender: 2026-09-30}.\n');

    // Die Zwangs-Sicherung: Der Anker der Historie trägt den Stand VOR dem
    // Schreiben, auch bei abgeschalteter Historisierung — und die Notiz in
    // derselben Begleit-Datei bleibt stehen.
    const behaelter = mddStore.parseContainer(lies(historie.mddPathFor(pfade.alpha)));
    expect(behaelter.ok).toBe(true);
    expect(behaelter.container.history.anchors[0].text).toBe(ALPHA);
    expect(mddStore.getNote(behaelter.container).text).toBe(
      'Rückruf @{Eigenkalender: 2026-10-02}.',
    );
    const tabelle = mddStore.parseContainer(lies(historie.mddPathFor(pfade.tabelle)));
    expect(tabelle.container.history.anchors[0].text).toBe(TABELLE);
  });

  it('führt zwei Zeitrechnungen in einer Datei zu einem Ziel zusammen und schreibt es in einem Lauf', async () => {
    const root = makeRoot();
    const vorher =
      'V @{Vergleichskalender: 2040-01-01} E @{Eigenkalender: 2026-09-30}\n' +
      'V @{Vergleichskalender: 2026-01-01 n. Chr.} E @{Eigenkalender: 2040-01-01}\n';
    const pfad = write(root, 'beide.md', vorher);
    const auftrag = { alt: sektion(false), neu: sektion(true, { zweite: true }), aktiv: null };

    const ergebnis = await ermittlerFuer(root)(root, auftrag);
    expect(ergebnis.nachtraege.map((n) => [n.calId, n.label, n.werte, n.dokumente])).toEqual([
      ['eigen', 'n. Chr.', 2, 1],
      ['vergleich', 'n. Chr.', 1, 1],
    ]);
    // EIN Eintrag für die Datei, Offsets aufsteigend über beide Zeitrechnungen,
    // die Texte im Gleichschritt. Der Vergleichskalender-Wert von 2026 mit
    // Kürzel liegt vor seiner neuen Grenze und bleibt richtig.
    expect(ergebnis.dateien).toEqual([
      {
        pfad,
        offsets: [
          vorher.indexOf('@{Vergleichskalender: 2040'),
          vorher.indexOf('@{Eigenkalender: 2026'),
          vorher.indexOf('@{Eigenkalender: 2040'),
        ],
        ersetzungen: [
          '@{Vergleichskalender: 6-01-01}',
          '@{Eigenkalender: 2026-09-30 n. Chr.}',
          '@{Eigenkalender: 11-01-01}',
        ],
      },
    ]);

    const { ersetzeImBereich, historie } = streckeFuer(root);
    const lauf = await ersetzeImBereich(root, { ...laufOptionen(), dateien: ergebnis.dateien });
    expect(lauf.geaendert).toEqual([{ pfad, anzahl: 3 }]);
    expect(lies(pfad)).toBe(
      'V @{Vergleichskalender: 6-01-01} E @{Eigenkalender: 2026-09-30 n. Chr.}\n' +
        'V @{Vergleichskalender: 2026-01-01 n. Chr.} E @{Eigenkalender: 11-01-01}\n',
    );
    // Eine Datei, eine Sicherung: ein Anker mit dem Vor-Stand.
    const behaelter = mddStore.parseContainer(lies(historie.mddPathFor(pfad)));
    expect(behaelter.container.history.anchors).toHaveLength(1);
    expect(behaelter.container.history.anchors[0].text).toBe(vorher);
  });
});
