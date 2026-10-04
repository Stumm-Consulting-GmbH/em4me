// @vitest-environment jsdom
// 4T-002034 (Epic 3E-000260): Vergleichs-Prüffall «vorher gleich nachher»
// (Festlegung 7 des Epics). Liste und Tabelle der Datei- und Block-Ebene
// entstehen seit diesem Task allein aus der Ergebnismenge (`resultSet`); das
// sichtbare Bild bleibt nach der Entscheidung F3 exakt gleich.
//
// **Vorgehen.** Für einen festen Satz Abfragen entstehen die Antworten echt
// über `frontmatterQueryFor` auf einem Wegwerf-Bereich, die Zustände ohne
// Index-Lauf über `stateResponse`. Jede Antwort wird über den Einstieg der
// Befüllung (`buildQueryListDom`) gezeichnet. Das HTML jedes Falls ist als
// Momentaufnahme eingefroren (`__snapshots__/`); sie wurde am 2026-09-30
// einmal mit dem ALTEN Bau-Weg aus den bisherigen Antwort-Feldern
// aufgenommen, bevor die Anzeige umgeschaltet wurde. Seither prüft jeder Lauf
// den neuen Weg gegen diese Vorlage. Eine Aktualisierung der Momentaufnahme
// ist ein bewusster, gelesener Schritt (test/README.md, Abschnitt «Snapshots
// der Render-Pipeline»): Sie heißt, dass sich das Bild der Abfrage-Ausgabe
// ändert.
//
// **Allein aus der Menge.** Bis 4T-002035 zeichnete der Prüffall jeden Fall
// außer der Aufgaben-Liste ein zweites Mal aus einer Antwort, die NUR die
// Ergebnismenge trug. Seit 4T-002035 liest auch die Aufgaben-Liste allein die
// Menge, und die bisherigen Antwort-Felder sind entfallen: Jede Antwort des
// Erzeugers trägt nur noch das Feld `resultSet` (hier je Fall geprüft), und
// jeder Fall zeichnet damit allein aus der Menge (nach einem strukturierten
// Klon, wie über die Prozess-Grenze) gegen die Vorlage.
//
// **Aufgaben-Liste (4T-002035).** Die zwei Aufgaben-Listen des ersten Bereichs
// stehen in der Momentaufnahme. Die weiteren Fälle der Aufgaben-Liste laufen
// auf einem eigenen Aufgaben-Bereich; ihre Vorlage liegt in
// test/fixtures/query/ergebnismenge-aufgaben.json, damit die Momentaufnahme
// byte-gleich bleibt. Sie wurde am 2026-09-30 einmal mit dem ALTEN Bau-Weg der
// Aufgaben-Liste aufgenommen, bevor umgeschaltet wurde; ein fehlender Eintrag
// ist ein Fehler und wird nie selbsttätig ergänzt.
//
// **Maschinen-Unabhängigkeit.** Pfade im HTML (Treffer-Pfad, Titel) tragen die
// Wegwerf-Wurzel; sie wird durch `<ROOT>` ersetzt, Rückstriche werden zu
// Schrägstrichen. Datums-Werte stammen aus lokalen Datums-Literalen und einer
// lokal gesetzten Änderungszeit, damit keine Zeitzone und kein Tagesdatum in
// die Vorlage eingeht; Aufgaben tragen keine Termine vor 2099.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import {
  alleIndizesNeuAufbauen,
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../../src/main/backlinks.js';
import { stateResponse } from '../../../src/main/index/query-result-set.js';
import { validateResultSet } from '../../../src/shared/query/result-set.js';
import { createTaskStatusTypeResolver } from '../../../src/shared/markdown/plugins.js';

const require_ = createRequire(import.meta.url);
const { setzeDatensatzErfassung } = require_('../../../src/main/index/index-schalter.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

// Eigener Besitzer-Schlüssel, damit der Neuaufbau des Aus-Zustands die Wurzel
// wieder aufbaut (Muster datensatz-aus-zustand.test.js).
const BESITZER = 'test-vorher-nachher:0';

// --- Wegwerf-Bereich --------------------------------------------------------

// Nachbild der Demo-Seite «08 Queries» (Kapitel, Themen, Schlagworte,
// Verweise), dazu Projekt-Dateien für alle Werte-Arten, Block-Daten, eine
// Aufgaben-Datei und eine Datenbank-Tabelle für den Aus-Zustand.
const RIESIG = '1' + '0'.repeat(309);
const DATEIEN = {
  '08 Queries.md':
    '---\nchapter: 8\ntitle: Queries\ntopic: syntax\ntags: [demo]\n---\n# Queries\nZurück zu [[00 Welcome]].\n',
  '00 Welcome.md':
    '---\nchapter: 0\ntitle: Welcome\ntopic: intro\ntags: [demo]\n---\n# Welcome\nWeiter zu [[08 Queries]].\n',
  '01 Basics.md':
    '---\nchapter: 1\ntitle: Basics\ntopic: syntax\ntags: [demo, planning]\n---\n# Basics\nSiehe [[00 Welcome]] und [[08 Queries]].\n',
  '02 Tables.md':
    '---\nchapter: 2\ntitle: Tables\ntopic: tables\ntags: [demo]\n---\n# Tables\nSiehe [[00 Welcome]].\n',
  '09 Diagrams.md':
    '---\nchapter: 9\ntitle: Diagrams\ntopic: visual\ntags: [demo, planning]\n---\n# Diagrams\nSiehe [[00 Welcome]] und [[08 Queries]].\n',
  'Projekte/Alpha.md':
    '---\nprio: 3\n---\n# Alpha\nSiehe [[Beta]] und [[00 Welcome]].\n\nAufgabe eins. ^a1\n\nAufgabe zwei. ^a2\n',
  'Projekte/Beta.md': '---\nprio: 10\ntags: [projekt]\n---\n# Beta\n\nPunkt. ^b1\n',
  // In Anführungszeichen, damit der Wert als Zahl-Text ankommt und erst die
  // Rechnung ihn über die Grenze der Zahl-Darstellung hebt (Entscheidung 4
  // aus 4T-002033: heute «Infinity»).
  'Projekte/Gamma.md': `---\nriesig: "${RIESIG}"\n---\n# Gamma\n`,
  'Aufgaben.md':
    '# Aufgaben\n\n- [ ] Konzept schreiben #wichtig\n- [x] Kickoff halten\n- [ ] Review planen 📅 2099-01-01\n',
  'Kunden.md': [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Titel',
    '  key: Kürzel',
    '---',
    '',
    '# Kundenliste',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| K-1',
    '| Anna',
    '```',
    '',
  ].join('\n'),
};

function mddWith(blockData) {
  return JSON.stringify({ schemaVersion: 1, history: { anchors: [], packets: [] }, blockData });
}

// 4T-002035: Eigener Aufgaben-Bereich für die Fälle der Aufgaben-Liste. Er
// liegt in einer zweiten Wurzel, damit die Aufgaben der ersten und mit ihnen
// die eingefrorenen Momentaufnahmen unverändert bleiben. Er trägt Überschriften
// (Gruppen ein- und zweistufig, Aufgaben ohne Überschrift als Gruppe ohne
// Wert), eine blockierte Aufgabe, eine doppelt vergebene Kennung, alle
// Prioritäten und nur Termine, deren Dringlichkeits-Anteil vom Tagesdatum
// unabhängig ist (weit in der Vergangenheit oder nach 2099).
const AUFGABEN_DATEIEN = {
  'Start.md': '# Start\n\nÜbersicht.\n',
  'Haus.md': [
    '# Haus',
    '',
    '## Rohbau',
    '',
    '- [ ] Dach decken #bau 🆔 dach01 ⏫ 📅 2099-03-01',
    '- [ ] Fenster setzen ⛔ dach01 📅 2099-04-01',
    '- [x] Keller ausheben ✅ 2026-01-05',
    '',
    '## Ausbau',
    '',
    '- [ ] Doppelt eins 🆔 dup111 🔼',
    '- [ ] Doppelt zwei 🆔 dup111 ⏳ 2000-01-01',
    '- [/] In Arbeit 🛫 2099-01-01 🔽',
    '',
  ].join('\n'),
  'Garten.md': [
    '- [ ] Rasen mähen #garten 🔺 📅 2000-01-01',
    '- [ ] Hecke schneiden [[Haus]] ⏬',
    '',
  ].join('\n'),
};

let root;
let aktiv;
let tmpDir;
let root2;
let aktiv2;
let tmpDir2;

function write(rel, content, basis = tmpDir) {
  const p = path.join(basis, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function warteAufIndex() {
  const result = await warteAuf(aktiv);
  if (aktiv2) await warteAuf(aktiv2);
  return result;
}

async function warteAuf(datei) {
  let result = backlinksFor(datei, BESITZER);
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    result = backlinksFor(datei, BESITZER);
  }
  return result;
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-vn-'));
  tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-vn-aufgaben-'));
  for (const [rel, inhalt] of Object.entries(AUFGABEN_DATEIEN)) write(rel, inhalt, tmpDir2);
  aktiv2 = path.join(tmpDir2, 'Start.md');
  root2 = rootForActiveFile(aktiv2);
  for (const [rel, inhalt] of Object.entries(DATEIEN)) write(rel, inhalt);
  write(
    'Projekte/Alpha.mdd',
    mddWith({
      a1: { values: { status: 'offen', prio: 2 }, updated: '2026-07-01T10:00:00Z' },
      a2: { values: { status: 'erledigt', prio: 9 }, updated: '2026-07-05T10:00:00Z' },
    }),
  );
  write(
    'Projekte/Beta.mdd',
    mddWith({ b1: { values: { status: 'offen' }, updated: '2026-07-02T10:00:00Z' } }),
  );
  const alpha = path.join(tmpDir, 'Projekte/Alpha.md');
  fs.utimesSync(alpha, new Date(2020, 0, 1), new Date(2020, 0, 1));
  aktiv = path.join(tmpDir, '08 Queries.md');
  root = rootForActiveFile(aktiv);
  await warteAufIndex();
});

afterAll(() => {
  setzeDatensatzErfassung(true);
  vi.useFakeTimers();
  releaseRoot(root, BESITZER);
  releaseRoot(root2, BESITZER);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  for (const verzeichnis of [tmpDir, tmpDir2]) {
    try {
      fs.rmSync(verzeichnis, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
});

// --- Der feste Satz Abfragen ------------------------------------------------

const taskEnv = (enabled = true) => ({
  enabled,
  globalFilter: '',
  statusTypeOf: createTaskStatusTypeResolver(null),
});

// [Name, Abfrage-Text] je Fall; alle über den echten Index.
const ABFRAGEN = [
  // Die sechs Datei-Abfragen der Demo-Seite «08 Queries».
  ['demo: Tabelle mit Alias', 'TABLE chapter AS "Ch.", topic AS "Topic"\nFROM #demo\nSORT chapter'],
  ['demo: Liste', 'LIST FROM #planning SORT file.name'],
  ['demo: Liste mit Zusatzfeld', 'LIST topic WHERE topic = "syntax"'],
  ['demo: FROM Verweis', 'LIST FROM [[00 Welcome]] SORT file.name'],
  [
    'demo: FROM leerer Verweis mit bold()',
    'TABLE bold(title) AS "Page", topic AS "Topic"\nFROM [[]]\nSORT chapter',
  ],
  ['demo: this.', 'LIST FROM #demo WHERE chapter > this.chapter SORT chapter'],
  // Tabellen-Formen und Wünsche.
  ['Tabelle WITHOUT ID', 'TABLE WITHOUT ID file.link AS "Seite", chapter FROM #demo SORT chapter'],
  ['Liste COLUMNS 3', 'LIST FROM #demo SORT chapter COLUMNS 3'],
  ['Liste COLUMNS 1', 'LIST FROM #demo SORT chapter COLUMNS 1'],
  ['Tabelle COLUMNS 2 (Hinweis)', 'TABLE chapter FROM #demo SORT chapter COLUMNS 2'],
  // Werte aller Arten: Zahl, Wahrheitswert, Datum, Dauer, Verweis, Listen, fehlend.
  [
    'Tabelle Werte-Arten',
    'TABLE prio * 2 AS "Doppelt", prio > 5, date(2026-07-01) AS "Datum", dur(3d) AS "Dauer", ' +
      'file.link, file.outlinks, file.tags, gibtsnicht FROM "Projekte" SORT file.name',
  ],
  ['Tabelle Änderungszeit', 'TABLE file.mtime FROM "Projekte" WHERE file.name = "Alpha"'],
  ['Liste Überlauf', 'LIST riesig * 2 WHERE file.name = "Gamma"'],
  ['Tabelle Überlauf', 'TABLE riesig * 2 AS "Überlauf", riesig WHERE file.name = "Gamma"'],
  [
    'Tabelle Hervorhebung',
    'TABLE "Kap. " + bold(chapter) AS "Kapitel", bold(file.link) FROM #demo SORT chapter LIMIT 3',
  ],
  ['Liste mit Verweis-Liste', 'LIST file.outlinks FROM "Projekte" SORT file.name'],
  // 4T-002076 (Epic 3E-000259): bis dahin der Fall «Fehler: GROUP BY außerhalb
  // der Aufgaben», gezielt neu aufgenommen. Die Menge trägt jetzt Gruppen.
  // 4T-002077: erneut gezielt neu aufgenommen, die Anzeige zeichnet die Gruppen
  // (Überschrift je Kapitel, darunter die Treffer) statt der flachen Liste.
  ['Dateien: Liste gruppiert', 'LIST FROM #demo GROUP BY chapter'],
  // 4T-002078: neu aufgenommen, die gruppierte Tabelle mit einer Zeile je Gruppe.
  [
    'Dateien: Tabelle gruppiert mit Aggregaten',
    'TABLE count() AS "Anzahl", sum(chapter) AS "Kapitel" FROM #demo GROUP BY topic',
  ],
  ['Liste leer', 'LIST WHERE chapter > 100'],
  ['Tabelle leer', 'TABLE chapter WHERE chapter > 100'],
  // Block-Ebene.
  ['Blöcke: Liste', 'LIST BLOCKS'],
  ['Blöcke: Liste mit Zusatzfeld', 'LIST BLOCKS status'],
  ['Blöcke: Tabelle', 'TABLE BLOCKS status, prio SORT prio'],
  ['Blöcke: Tabelle WITHOUT ID', 'TABLE BLOCKS WITHOUT ID status'],
  ['Blöcke: Liste COLUMNS 2', 'LIST BLOCKS COLUMNS 2'],
  // Aufgaben-Ebene: Tabelle und, seit 4T-002035, auch die Liste aus der Menge;
  // die weiteren Fälle der Aufgaben-Liste stehen in AUFGABEN_ABFRAGEN.
  ['Aufgaben: Tabelle', 'TABLE TASKS description, line'],
  ['Aufgaben: Tabelle WITHOUT ID', 'TABLE TASKS WITHOUT ID description'],
  ['Aufgaben: Liste', 'LIST TASKS'],
  ['Aufgaben: Liste gruppiert', 'LIST TASKS GROUP BY file.name'],
  // Abfrage-Fehler mit und ohne Zusatz-Angaben.
  ['Fehler: Syntax', 'LIST WHERE ((('],
  ['Fehler: unbekannte Funktion', 'LIST WHERE gibtsnicht(1)'],
  ['Fehler: doppelte Klausel', 'LIST WHERE a = 1 WHERE b = 2'],
  ['Fehler: Layout außerhalb der Aufgaben', 'LIST SHORT'],
  ['Fehler: COLUMNS außerhalb des Bereichs', 'LIST COLUMNS 9'],
];

function antwort(abfrage) {
  return frontmatterQueryFor(aktiv, abfrage, undefined, taskEnv(), 'de-DE');
}

// Zustände ohne ausgewerteten Lauf: echte Antworten des Erzeugers, soweit der
// Index sie herstellt, sonst über stateResponse (Muster 4T-002033).
function zustandsFaelle() {
  return [
    ['Zustand: nicht verfügbar', frontmatterQueryFor(null, 'LIST')],
    [
      'Zustand: Aufgaben ausgeschaltet',
      frontmatterQueryFor(aktiv, 'LIST TASKS', undefined, taskEnv(false)),
    ],
    [
      'Zustand: zu groß',
      stateResponse('oversized', { area: { root, fileCount: 2500, byteSize: 9_000_000 } }),
    ],
    ['Zustand: zu groß ohne Zahl', stateResponse('oversized', { area: { root } })],
    ['Zustand: Index im Aufbau', stateResponse('indexing', { area: { root } })],
    ['Zustand: Index-Fehler', stateResponse('error', { area: { root } })],
  ];
}

// Zustände, die die Anzeige selbst setzt (ohne Ergebnismenge).
const ANZEIGE_ZUSTAENDE = [
  ['Anzeige: Laden', { status: 'loading' }],
  ['Anzeige: pfadloser Reiter', { status: 'unavailable' }],
  ['Anzeige: Kanal-Fehler', { status: 'error' }],
];

// 4T-002035: Fälle der Aufgaben-Liste im Aufgaben-Bereich. Ihre Vorlage liegt
// nicht in der Momentaufnahme, sondern in einer eigenen Datei unter
// test/fixtures/query/, damit die Momentaufnahme aus 4T-002034 byte-gleich
// bleibt; aufgenommen am 2026-09-30 einmal mit dem ALTEN Bau-Weg der
// Aufgaben-Liste aus den bisherigen Antwort-Feldern, bevor umgeschaltet wurde.
const AUFGABEN_ABFRAGEN = [
  // Die Aufgaben-Abfrage der Demo-Seite «08 Queries» im Wortlaut.
  ['Aufgaben-Bereich: Demo offene Aufgaben', 'LIST TASKS WHERE status.type = "TODO"'],
  ['Aufgaben-Bereich: Liste', 'LIST TASKS'],
  ['Aufgaben-Bereich: GROUP BY eine Stufe', 'LIST TASKS GROUP BY heading'],
  ['Aufgaben-Bereich: GROUP BY zwei Stufen', 'LIST TASKS GROUP BY heading, priority'],
  ['Aufgaben-Bereich: HIDE', 'LIST TASKS HIDE due, backlink, tags, count, id'],
  ['Aufgaben-Bereich: SHOW urgency', 'LIST TASKS SHOW urgency'],
  ['Aufgaben-Bereich: SHORT', 'LIST TASKS SHORT'],
  ['Aufgaben-Bereich: Zusatz-Spalte', 'LIST TASKS heading'],
  [
    'Aufgaben-Bereich: gruppiert mit Hervorhebung und Zusatz-Spalte',
    'LIST TASKS bold(heading) GROUP BY bold(heading)',
  ],
  [
    'Aufgaben-Bereich: gruppiert mit Layout',
    'LIST TASKS GROUP BY heading SHOW urgency HIDE count SHORT',
  ],
  ['Aufgaben-Bereich: COLUMNS', 'LIST TASKS COLUMNS 3'],
  ['Aufgaben-Bereich: SORT und LIMIT', 'LIST TASKS SORT description LIMIT 3'],
  ['Aufgaben-Bereich: leer', 'LIST TASKS WHERE status.type = "CANCELLED"'],
];

const VORLAGE_PFAD = path.join(dir, '../../fixtures/query/ergebnismenge-aufgaben.json');

function antwortAufgaben(abfrage, enabled = true) {
  return frontmatterQueryFor(aktiv2, abfrage, undefined, taskEnv(enabled), 'de-DE');
}

// --- Zeichnen und Vergleichen -----------------------------------------------

function normalisiert(html) {
  let out = html;
  for (const r of [root, tmpDir, root2, tmpDir2]) out = out.split(r).join('<ROOT>');
  return out.replace(/\\/g, '/');
}

function zeichne(payload) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom(structuredClone(payload), tStub));
  return normalisiert(host.innerHTML);
}

// Befunde des Prüfers ohne den einen bekannten: Eine nicht endliche Zahl
// (Überlauf einer Rechnung) bleibt nach Entscheidung 4 aus 4T-002033 roh in der
// Menge, weil das Bild «Infinity» zeigen muss; der Prüfer meldet sie als
// `nonFiniteNumber`, der Produktiv-Pfad ruft ihn nicht.
function befunde(rs) {
  return validateResultSet(rs).filter((f) => f.code !== 'nonFiniteNumber');
}

// Ende des Übergangs (4T-002035): Die Antwort des Erzeugers trägt allein die
// Ergebnismenge, keine bisherigen Felder mehr.
function alleinDieMenge(payload, name) {
  expect(Object.keys(payload), name).toEqual(['resultSet']);
  expect(befunde(payload.resultSet), name).toEqual([]);
}

describe('Vergleich vorher gleich nachher (4T-002034)', () => {
  it.each(ABFRAGEN)('%s', (name, abfrage) => {
    const payload = antwort(abfrage);
    alleinDieMenge(payload, name);
    expect(zeichne(payload)).toMatchSnapshot();
  });

  it('Zustände des Erzeugers', () => {
    for (const [name, payload] of zustandsFaelle()) {
      alleinDieMenge(payload, name);
      expect(zeichne(payload), name).toMatchSnapshot(name);
    }
  });

  it('Zustände der Anzeige ohne Ergebnismenge', () => {
    for (const [name, payload] of ANZEIGE_ZUSTAENDE) {
      expect(zeichne(payload), name).toMatchSnapshot(name);
    }
  });

  it('der Satz trifft jede Werte-Art, beide Ebenen und alle Zustände', () => {
    // Schutz gegen einen stillen Schwund des Satzes: Fällt eine Werte-Art oder
    // ein Zustand heraus, prüfte der Vergleich weniger, als er behauptet.
    const arten = new Set();
    const ebenen = new Set();
    for (const [, abfrage] of ABFRAGEN) {
      const rs = antwort(abfrage).resultSet;
      if (rs.scope) ebenen.add(`${rs.scope}:${rs.type}`);
      for (const row of rs.rows) {
        for (const v of row.values) {
          if (v === null) arten.add('fehlend');
          else if (Array.isArray(v)) arten.add('list');
          else if (typeof v === 'object') arten.add(v.kind);
          else if (typeof v === 'number' && !Number.isFinite(v)) arten.add('nicht-endlich');
          else arten.add(typeof v);
        }
      }
    }
    for (const art of [
      'fehlend',
      'list',
      'date',
      'dur',
      'link',
      'rich',
      'number',
      'boolean',
      'string',
      'nicht-endlich',
    ]) {
      expect(arten, art).toContain(art);
    }
    for (const e of [
      'files:list',
      'files:table',
      'blocks:list',
      'blocks:table',
      'tasks:table',
      'tasks:list',
    ]) {
      expect(ebenen, e).toContain(e);
    }
    const status = new Set(zustandsFaelle().map(([, p]) => p.resultSet.state.status));
    expect([...status].sort()).toEqual(['error', 'indexing', 'oversized', 'ready', 'unavailable']);
  });
});

// --- Aufgaben-Liste gegen die festgehaltene Vorlage (4T-002035) -------------

describe('Aufgaben-Liste vorher gleich nachher (4T-002035)', () => {
  const vorlage = JSON.parse(readFileSync(VORLAGE_PFAD, 'utf8'));

  // Fehlt ein Eintrag, schlägt der Fall fehl; die Vorlage wird nie selbsttätig
  // ergänzt, weil sie das Bild des ALTEN Wegs festhält.
  function gegenVorlage(name, payload) {
    alleinDieMenge(payload, name);
    expect(Object.hasOwn(vorlage, name), `Vorlage fehlt: ${name}`).toBe(true);
    expect(zeichne(payload), name).toBe(vorlage[name]);
  }

  it.each(AUFGABEN_ABFRAGEN)('%s', (name, abfrage) => {
    gegenVorlage(name, antwortAufgaben(abfrage));
  });

  it('Aufgaben-Bereich: Aufgaben ausgeschaltet', () => {
    gegenVorlage('Aufgaben-Bereich: Aufgaben ausgeschaltet', antwortAufgaben('LIST TASKS', false));
  });

  it('die Vorlage trägt genau die Fälle des Satzes', () => {
    const namen = [
      ...AUFGABEN_ABFRAGEN.map(([name]) => name),
      'Aufgaben-Bereich: Aufgaben ausgeschaltet',
    ];
    expect(Object.keys(vorlage).sort()).toEqual(namen.sort());
  });

  it('der Satz trifft Gruppen, Layout, Kennzeichnungen und Zusatz-Spalte', () => {
    // Schwund-Schutz wie oben: Jedes Merkmal der Aufgaben-Liste kommt vor.
    const mengen = AUFGABEN_ABFRAGEN.map(([, abfrage]) => antwortAufgaben(abfrage).resultSet);
    const zeilen = mengen.flatMap((rs) => rs.rows);
    expect(zeilen.some((r) => r.taskInfo.blocked)).toBe(true);
    expect(zeilen.some((r) => r.taskInfo.duplicateId)).toBe(true);
    // Eine Dringlichkeit mit mehr als zwei Nachkommastellen entsteht nur aus
    // einem Termin nahe am Tagesdatum und steht deshalb nicht im Satz; die
    // Rundung prüft frontmatter-query-view.test.js an einer gebauten Menge.
    expect(new Set(zeilen.map((r) => r.taskInfo.urgency)).size).toBeGreaterThan(4);
    const gruppiert = mengen.filter((rs) => rs.groups !== null);
    expect(gruppiert.some((rs) => rs.groups.some((g) => g.groups !== null))).toBe(true);
    expect(gruppiert.some((rs) => rs.groups.some((g) => g.value === null))).toBe(true);
    expect(mengen.some((rs) => rs.wishes.show.includes('urgency'))).toBe(true);
    expect(mengen.some((rs) => rs.wishes.hide.length > 0)).toBe(true);
    expect(mengen.some((rs) => rs.wishes.short)).toBe(true);
    expect(mengen.some((rs) => rs.wishes.layoutColumns !== null)).toBe(true);
    expect(mengen.some((rs) => rs.columns.length > 0)).toBe(true);
    expect(mengen.some((rs) => rs.rows.length === 0)).toBe(true);
    const zeichen = new Set(zeilen.map((r) => r.origin.raw.slice(3, 4)));
    expect([...zeichen].sort()).toEqual([' ', '/', 'x']);
  });
});

// --- Aus-Zustand der Datenbank-Erweiterung ----------------------------------

// Festlegung 12 des Epics: Die drei Ebenen hängen nicht am Datenbank-Schalter.
// Ausgeschaltet und neu aufgebaut liefern und zeigen Datei-, Block- und
// Aufgaben-Ebene dasselbe wie eingeschaltet, auch mit einer Datenbank-Tabelle
// im Bereich; die Ergebnismenge bleibt gültig und in Zeilen, Werten und
// Herkunft gleich. 4T-002034 prüfte Datei- und Block-Ebene, 4T-002035 hat die
// Aufgaben-Ebene ergänzt.
describe('Aus-Zustand der Erweiterung «Datenbank» (4T-002034, 4T-002035)', () => {
  it('alle drei Ebenen liefern und zeigen unverändert', async () => {
    const faelle = [
      ...ABFRAGEN.map(
        ([, abfrage]) =>
          () =>
            antwort(abfrage),
      ),
      ...AUFGABEN_ABFRAGEN.map(
        ([, abfrage]) =>
          () =>
            antwortAufgaben(abfrage),
      ),
    ];
    const lauf = () =>
      faelle.map((f) => {
        const payload = f();
        expect(befunde(payload.resultSet)).toEqual([]);
        return { html: zeichne(payload), rows: payload.resultSet.rows };
      });
    const an = lauf();
    // Nicht-Vakuitäts-Probe: Die Tabellen-Datei steht im Bereich und wird
    // von einer Datei-Abfrage getroffen; alle drei Ebenen liefern Zeilen.
    const alle = antwort('LIST').resultSet.rows.map((r) => r.origin.name);
    expect(alle).toContain('Kunden');
    const arten = new Set(an.flatMap(({ rows }) => rows.map((r) => r.origin.kind)));
    expect([...arten].sort()).toEqual(['block', 'file', 'task']);
    setzeDatensatzErfassung(false);
    alleIndizesNeuAufbauen();
    await warteAufIndex();
    try {
      const aus = lauf();
      expect(aus).toEqual(an);
      expect(antwort('LIST').resultSet.rows.map((r) => r.origin.name)).toEqual(alle);
    } finally {
      setzeDatensatzErfassung(true);
      alleIndizesNeuAufbauen();
      await warteAufIndex();
    }
  });
});
