// 4T-000431 (Epic 3E-000081): Journal-Modell — Definitions-Schema der
// journals-Sektion der Bereichsdatei und ihre tolerante Normalisierung.
// 4T-001413 (Epic 3E-000244): seit dem Schnitt eine eigene Datei; zuvor der
// obere Abschnitt von journal-core.js. Der Schnitt folgt der Naht zwischen
// Modell und Perioden-Kern, die dort schon als getrennte Vorgänge angelegt war;
// die Abhängigkeit ist einseitig (der Kern lädt das Modell, nie umgekehrt).
//
// Ein Journal ist eine definierte Serie periodischer Dokumente EINER
// Granularität (Tag, Woche, Monat, Quartal, Jahr); Regale (shelves)
// gruppieren mehrere Journale. Journale existieren nur pro Bereich
// (Architekturentscheidung 2 des Epics): die Konfiguration lebt als
// Sektion `journals` in Area_Settings.mdda, nach dem bestehenden
// Sektions-Muster mit Fehler-Isolation (Vorbild templates-Sektion).
//
// Sektions-Schema:
//   journals: {
//     shelves: [name, …],
//     journals: [{
//       id            stabile Kennung (eindeutig; Persistenz-Schlüssel)
//       name          Anzeige-Name (Default: id)
//       shelf         Regal-Name oder null (kein Regal)
//       granularity   'day' | 'week' | 'month' | 'quarter' | 'year'
//       folderPattern Ordner-Schema relativ zur Bereichs-Wurzel ('' = Wurzel);
//                     Datums-Platzhalter in der Format-Syntax der Vorlagen-
//                     Engine ({{date::…}}, ausgewertet am Perioden-Start)
//       namePattern   Namens-Schema des Eintrags (ohne .md), gleiche Syntax
//       template      Vorlagen-Pfad relativ zum Vorlagen-Ordner oder null
//       startDate     'yyyy-MM-dd' oder null (keine Untergrenze)
//       endDate       'yyyy-MM-dd' oder null (offen)
//       nameProp      Frontmatter-Feldname des Journal-Namens
//       dateProp      Frontmatter-Feldname des Perioden-Datums
//       startProp     Feldname des Perioden-Starts
//       endProp       Feldname des Perioden-Endes
//     }, …]
//   }
//
// Die vier Property-Feldnamen gelten seit 4T-001404 und 4T-001405 in JEDER
// Granularität; ein Eintrag trägt sie vollständig.
//
// Normalisierung ist tolerant nach dem Fehler-Isolations-Muster der
// Bereichsdatei: defekte Einzel-Einträge entfallen (nie ein Wurf), eine
// defekte oder fehlende Sektion wirkt wie nicht konfiguriert (null) und
// setzt nur die Journal-Funktion aus, nicht den Rest des Bereichs.
//
// Prozess-neutral (kein Electron, kein DOM): Main (Datenpfad, Anlage) und
// Renderer (Panel, Einstellungen) laden dasselbe Modul.
'use strict';

// Granularitäten in fachlicher Reihenfolge fein -> grob; die Reihenfolge
// trägt zugleich die "übergeordnete Perioden"-Semantik des Navigations-
// Blocks (gröbere Granularitäten desselben Regals).
const JOURNAL_GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];

// Default-Feldnamen der automatischen Frontmatter-Properties (belegtes
// Nutzungs-Muster des PO, Referenz-Analyse Journal.md §5; der Journal-Name mit
// 4T-001405 aus dem Konstrukt-Inventar der Vault-Analyse ergänzt).
const DEFAULT_NAME_PROP = 'journal';
const DEFAULT_DATE_PROP = 'journal-date';
const DEFAULT_START_PROP = 'journal-start-date';
const DEFAULT_END_PROP = 'journal-end-date';

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// 'yyyy-MM-dd' mit Kalender-Gültigkeit (kein 2026-02-30); sonst null.
function normalizeIsoDate(v) {
  const s = cleanString(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? s : null;
}

// Einzelnes Journal normalisieren. null = Eintrag ist defekt und entfällt
// (Fehler-Isolation pro Eintrag): ohne id, ohne bekannte Granularität oder
// ohne Namens-Schema ist kein Pfad auflösbar.
function normalizeJournal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanString(value.id);
  if (id === '') return null;
  const granularity = cleanString(value.granularity);
  if (!JOURNAL_GRANULARITIES.includes(granularity)) return null;
  const namePattern = cleanString(value.namePattern);
  if (namePattern === '') return null;
  const name = cleanString(value.name) || id;
  const shelf = cleanString(value.shelf) || null;
  const folderPattern = cleanString(value.folderPattern);
  const template = cleanString(value.template) || null;
  const startDate = normalizeIsoDate(value.startDate);
  const endDate = normalizeIsoDate(value.endDate);
  return {
    id,
    name,
    shelf,
    granularity,
    folderPattern,
    namePattern,
    template,
    startDate,
    endDate,
    nameProp: cleanString(value.nameProp) || DEFAULT_NAME_PROP,
    dateProp: cleanString(value.dateProp) || DEFAULT_DATE_PROP,
    startProp: cleanString(value.startProp) || DEFAULT_START_PROP,
    endProp: cleanString(value.endProp) || DEFAULT_END_PROP,
  };
}

// Normalisiert die journals-Sektion auf { shelves, journals } oder null
// (keine Konfiguration). Regeln: Regal-Namen sind nicht-leere, eindeutige
// Strings; Journal-Einträge werden einzeln normalisiert (defekte entfallen),
// doppelte ids behalten den ersten Eintrag. Ein von einem Journal
// referenziertes, aber nicht deklariertes Regal wird der Regal-Liste
// angefügt (selbstheilend — Panel-Filter und Einstellungs-Liste zeigen
// damit jedes real genutzte Regal).
function normalizeJournalsConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const shelves = [];
  if (Array.isArray(value.shelves)) {
    for (const raw of value.shelves) {
      const name = cleanString(raw);
      if (name !== '' && !shelves.includes(name)) shelves.push(name);
    }
  }
  const journals = [];
  const seenIds = new Set();
  if (Array.isArray(value.journals)) {
    for (const raw of value.journals) {
      const journal = normalizeJournal(raw);
      if (!journal || seenIds.has(journal.id)) continue;
      seenIds.add(journal.id);
      if (journal.shelf && !shelves.includes(journal.shelf)) shelves.push(journal.shelf);
      journals.push(journal);
    }
  }
  if (shelves.length === 0 && journals.length === 0) return null;
  return { shelves, journals };
}

module.exports = {
  JOURNAL_GRANULARITIES,
  DEFAULT_NAME_PROP,
  DEFAULT_DATE_PROP,
  DEFAULT_START_PROP,
  DEFAULT_END_PROP,
  cleanString,
  normalizeIsoDate,
  normalizeJournal,
  normalizeJournalsConfig,
};
