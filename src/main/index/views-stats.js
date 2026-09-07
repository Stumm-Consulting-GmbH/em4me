// 4T-001466 (Epic 3E-000173): Index-Anteil der Bereichs-Statistik, aus
// views.js herausgeloest.
//
// Anlass war das Datei-Groessen-Budget: Nach dem Rebase des Zuges 3E-000274
// auf 1.129.1 trug views.js die Zuwaechse beider Seiten und stand bei 515 von
// 500 Zeilen. Geschnitten statt Ausnahme, weil die Datei Logik ist und keine
// Aufzaehlung — die benannte Ausnahme des Konzepts «Test-Strategie und
// Qualitaetssicherung», Kapitel 9, trifft auf sie nicht zu.
//
// Die Naht ist die Sicht selbst: statsFor ist die groesste der sieben Sichten
// und die einzige, deren drei Helfer (TOP_N, sortiereHaeufigkeit, dateiKopf)
// ausschliesslich sie nutzt. views.js re-exportiert sie unveraendert weiter,
// sodass backlinks.js und jeder andere Aufrufer nichts merkt.
'use strict';

const path = require('node:path');
const { parseTaskLine } = require('../../shared/tasks/task-markers.js');
const { indexes } = require('./store.js');
const { buildLinkGraph, logicalNameFor } = require('./link-graph.js');
// 4T-001516: Datei-Identitaet vergleicht sich nach den Regeln der Plattform,
// nicht nach einer festen Kleinschreibung (Befund B1 des Epics 3E-000232).
const { pathCompareKey } = require('../../shared/platform.js');

// 4T-000619 (Epic 3E-000117): Index-Anteil der Bereichs-Statistik — alle
// Kennzahlen, die der Index ohnehin fuehrt. Read-only-View wie graphFor:
// Status wird durchgereicht, kein eigener Scan, kein ensureIndex. Den
// Index-fremden Anteil (Nicht-Markdown, Ordner, Begleitdateien) erhebt
// src/main/area/area-stats.js und fuehrt beide Anteile zusammen.
//
// env.statusTypeOf ist der Status-Typ-Aufloeser der Aufgaben-Zustaende
// (createTaskStatusTypeResolver in main.js); ohne ihn gelten allein die
// festen Basis-Zeichen ' ' = offen und 'x'/'X' = erledigt.
// env.startPage ist die Start-Seite des Bereichs als absoluter Pfad (4T-001516,
// siehe unten); ohne sie gilt jede Datei ohne eingehenden Verweis als Waise.
function statsFor(areaRoot, env) {
  let root;
  try {
    root = areaRoot ? path.resolve(areaRoot) : null;
  } catch {
    root = null;
  }
  if (!root) return { status: 'unavailable' };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable' };
  if (entry.status === 'indexing') return { status: 'indexing', wurzel: root };
  if (entry.status === 'oversized') return { status: 'oversized', wurzel: root };
  if (entry.status === 'error') return { status: 'error', wurzel: root };

  // Haeufigkeiten: je Tag bzw. je Eigenschafts-Schluessel die Anzahl DATEIEN.
  // Fundstellen zaehlt der Index nicht (er fuehrt Zuordnungen, keine Treffer-
  // Listen); die Seite spricht deshalb durchgehend von Dateien.
  const tags = [];
  for (const [tag, dateien] of entry.tagMap) tags.push({ name: tag, dateien: dateien.size });
  const eigenschaftsZaehler = new Map();
  for (const props of entry.propertiesPerFile.values()) {
    for (const schluessel of Object.keys(props || {})) {
      eigenschaftsZaehler.set(schluessel, (eigenschaftsZaehler.get(schluessel) || 0) + 1);
    }
  }
  const eigenschaften = [...eigenschaftsZaehler].map(([name, dateien]) => ({ name, dateien }));
  sortiereHaeufigkeit(tags);
  sortiereHaeufigkeit(eigenschaften);

  // Aufgaben nach Zustand. Die drei Kategorien sind vollstaendig und
  // ueberschneidungsfrei: NON_TASK zaehlt gar nicht, DONE und CANCELLED
  // haben ihre eigene Kategorie, alles Uebrige gilt als offen — auch ein
  // Zeichen ohne Status-Semantik, das ist eine Checkbox ohne Haken.
  const statusTypeOf =
    env && typeof env.statusTypeOf === 'function' ? env.statusTypeOf : () => null;
  const aufgaben = { gesamt: 0, offen: 0, erledigt: 0, abgebrochen: 0 };
  for (const taskLines of entry.tasksPerFile.values()) {
    for (const tl of taskLines) {
      const model = parseTaskLine(tl.text);
      if (!model) continue;
      const typ = statusTypeOf(model.statusChar);
      if (typ === 'NON_TASK') continue;
      aufgaben.gesamt += 1;
      if (typ === 'DONE') aufgaben.erledigt += 1;
      else if (typ === 'CANCELLED') aufgaben.abgebrochen += 1;
      else aufgaben.offen += 1;
    }
  }

  // Roh-Zahlen der ausgehenden Verweise, getrennt nach Link-Art.
  let wikiVerweise = 0;
  let mdVerweise = 0;
  for (const treffer of entry.files.values()) {
    for (const h of treffer) {
      if (h.linkTyp === 'wiki') wikiVerweise += 1;
      else if (h.linkTyp === 'md') mdVerweise += 1;
    }
  }

  // 4T-001516 (Epic 3E-000172): Die Start-Seite des Bereichs ist keine Waise —
  // sie ist der Einstieg und hat schon deshalb keinen eingehenden Verweis
  // noetig. Sie kommt als Option herein (env.startPage, absoluter Pfad), nicht
  // als eigener Zugriff auf die Bereichsdatei; damit bleibt der Index frei von
  // Wissen ueber sie und die Erhebung ohne Bereichs-Konfiguration pruefbar
  // (Muster env.statusTypeOf). Ausgeschlossen wird an der ZAEHL-Stelle: Zahl
  // und Liste entstehen aus derselben Zeile und koennen nicht auseinanderlaufen.
  const startSeite =
    env && typeof env.startPage === 'string' && env.startPage
      ? pathCompareKey(env.startPage)
      : null;
  if (!entry.linkGraph) entry.linkGraph = buildLinkGraph(entry);
  const { inMap } = entry.linkGraph;
  const unverlinkt = [];
  const eingehendJeDatei = [];
  for (const absPath of entry.files.keys()) {
    const anzahl = (inMap.get(absPath) || []).length;
    const kopf = dateiKopf(absPath);
    if (anzahl === 0 && pathCompareKey(absPath) !== startSeite) unverlinkt.push(kopf);
    eingehendJeDatei.push({ ...kopf, eingehend: anzahl });
  }
  unverlinkt.sort((a, b) => a.name.localeCompare(b.name));

  const groesste = [];
  const juengste = [];
  for (const absPath of entry.files.keys()) {
    groesste.push({ ...dateiKopf(absPath), bytes: entry.fileSizes.get(absPath) || 0 });
    const stat = entry.fileStats.get(absPath);
    juengste.push({ ...dateiKopf(absPath), mtimeMs: (stat && stat.mtimeMs) || 0 });
  }
  groesste.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  juengste.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  eingehendJeDatei.sort((a, b) => b.eingehend - a.eingehend || a.name.localeCompare(b.name));

  return {
    status: 'ready',
    wurzel: root,
    markdown: { anzahl: entry.fileCount, bytes: entry.byteSize },
    dateiPfade: [...entry.files.keys()],
    tags,
    eigenschaften,
    aliase: entry.aliasMap.size,
    aufgaben,
    verweise: { wiki: wikiVerweise, markdown: mdVerweise, ohneEingehende: unverlinkt.length },
    auffaelligkeiten: {
      groesste: groesste.slice(0, TOP_N),
      juengste: juengste.slice(0, TOP_N),
      meistverlinkt: eingehendJeDatei.filter((e) => e.eingehend > 0).slice(0, TOP_N),
      // 4T-001516: Bewusst UNGEKUERZT, anders als die drei Nachbar-Listen
      // (Entscheidung V4). Eine gekuerzte Waisen-Liste beantwortete die Frage
      // nicht, die sie stellt: Welche Dateien haengen frei? Zehn davon zu
      // kennen hilft nur, wenn es hoechstens zehn sind.
      unverlinkt,
    },
    uebersprungeneOrdner: entry.skippedDirs || 0,
  };
}

// 4T-000619: Laenge der Top-Listen der Auffaelligkeiten.
const TOP_N = 10;

// Absteigend nach Anzahl, bei Gleichstand alphabetisch — deterministische
// Ordnung, damit wiederholte Aufrufe dieselbe Liste liefern.
function sortiereHaeufigkeit(liste) {
  liste.sort((a, b) => b.dateien - a.dateien || a.name.localeCompare(b.name));
}

// Anzeige-Kopf einer Datei fuer die Top-Listen: voller Pfad (Klick-Ziel und
// Tooltip) plus logischer Name (Anzeige, U+2215-Form der Unterseiten).
function dateiKopf(absPath) {
  return { pfad: absPath, name: logicalNameFor(absPath) };
}

module.exports = { statsFor };
