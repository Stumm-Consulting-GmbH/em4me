'use strict';

// 4T-002034 (Epic 3E-000260): Darstellungs-Kern der Ergebnismenge. Das Modul
// beantwortet eine Frage: wie aus den Bausteinen einer Ergebnismenge
// (`result-set.js`) das wird, was eine Darstellung zeigt. Es trägt die
// Anzeige-Regeln, die bis 4T-002033 die Auswertung selbst gebaut hat:
// Spalten-Überschrift, Anzeige-Stücke eines Werts, Anzeige-Name eines Treffers
// (Block als `Datei#^anker`), gerundete Dringlichkeit, Gruppen-Beschriftung und
// Gruppen-Durchlauf, dazu die Datei-Zahl des Zustands «zu groß» und, seit
// 4T-002035, die Aufgaben-Treffer für Kennungs-Vorschlag und Vorgänger-Suche.
//
// Die Ergebnismenge trägt Werte, keine Anzeige (E8.1); die Anzeige entsteht
// erst hier. Die Umwandlung eines Werts in Anzeige-Stücke bleibt dabei an
// ihrer einen Stelle `formatValueSegments` im Werte-Kern `query-format.js` und
// wird von hier aus gerufen (Festlegung 2 des Epics). Das Bild entspricht nach
// der Entscheidung F3 exakt dem bisherigen: Listen kommagetrennt, Datumswerte
// im ISO-Format, Verweise als klickbare Stücke, eine nicht endliche Zahl als
// «Infinity».
//
// Prozess-neutral, ohne DOM und ohne Electron: Die Anzeige-Module des
// Anzeige-Prozesses bauen daraus ihr DOM, die Hintergrund-Nutzer des
// Haupt-Prozesses (Lookup-Feld, Wertevorrat) lesen daraus den Anzeige-Namen,
// die des Anzeige-Prozesses (Kennungs-Vorschlag, Vorgänger-Suche) die
// Aufgaben-Treffer.

const { formatValue, formatValueSegments } = require('./query-format.js');

/**
 * Überschrift einer Spalte: die aufgelöste Beschriftung (E21.6), bei den drei
 * bestehenden Ebenen Alias oder Ausdrucks-Quelltext.
 * @param {import('./result-set.js').Column} column
 * @returns {string}
 */
function columnHeader(column) {
  if (!column) return '';
  if (typeof column.label === 'string') return column.label;
  return column.alias || column.source || '';
}

/**
 * Anzeige-Stücke eines Werts für Zelle und Listen-Zusatzfeld: Text-Stücke
 * `{ text }`, Verweis-Stücke `{ link: { path, name } }`, bei Hervorhebung mit
 * `bold`. Ein fehlender Wert ergibt keine Stücke.
 * @param {import('./result-set.js').Value} value
 * @returns {Array<{ text?: string, link?: { path: string, name: string }, bold?: boolean }>}
 */
function cellSegments(value) {
  return formatValueSegments(value);
}

/**
 * Anzeige-Name eines Treffers aus seiner Herkunft: bei Datei und Aufgabe der
 * logische Datei-Name, beim Block `Datei#^anker`. Ein Datensatz heißt nach
 * seiner Anzeige-Form, ohne sie nach seiner Kennung (4T-002039, Festlegung 12
 * des Epics 3E-000258); jede unbekannte Herkunft ergibt den leeren Text.
 * @param {import('./result-set.js').Origin} origin
 * @returns {string}
 */
function displayName(origin) {
  if (origin && origin.kind === 'record') return origin.display || origin.id || '';
  if (!origin || typeof origin.name !== 'string') return '';
  if (origin.kind === 'block') return `${origin.name}#^${origin.anchor}`;
  if (origin.kind === 'file' || origin.kind === 'task') return origin.name;
  return '';
}

/**
 * Dringlichkeit einer Aufgabe auf zwei Nachkommastellen gerundet, wie sie die
 * Anzeige zeigt; die Ergebnismenge trägt sie ungerundet (Festlegung 4).
 * @param {number} n
 * @returns {number}
 */
function roundUrgency(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Beschriftung einer Gruppe aus ihrem Wert: Text-Form und Anzeige-Stücke; die
 * Gruppe ohne Wert hat keine Beschriftung (`label` null, keine Stücke), die
 * Darstellung setzt dort ihren lokalisierten Text ein.
 * @param {import('./result-set.js').Value} value
 * @returns {{ label: string|null, segments: Array<object> }}
 */
function groupTitle(value) {
  if (value === null || value === undefined) return { label: null, segments: [] };
  return { label: formatValue(value), segments: formatValueSegments(value) };
}

/**
 * Durchläuft die Gruppen-Struktur einer Ergebnismenge in ihrer Reihenfolge,
 * jede Gruppe vor ihren Untergruppen. `visit(group, level, context)` bekommt
 * den Kontext der Eltern-Ebene und gibt den Kontext für die Untergruppen
 * zurück; so baut eine Darstellung verschachtelte Knoten, ohne die Rekursion
 * selbst zu führen. Ohne Gruppen geschieht nichts.
 * @param {import('./result-set.js').ResultSet} resultSet
 * @param {(group: import('./result-set.js').Group, level: number, context: unknown) => unknown} visit
 * @param {unknown} [rootContext]
 */
function walkGroups(resultSet, visit, rootContext) {
  const groups = resultSet && Array.isArray(resultSet.groups) ? resultSet.groups : [];
  const walk = (list, level, context) => {
    for (const group of list) {
      const childContext = visit(group, level, context);
      if (Array.isArray(group.groups)) walk(group.groups, level + 1, childContext);
    }
  };
  walk(groups, 0, rootContext);
}

/**
 * 4T-002035: Aufgaben-Treffer einer Ergebnismenge als `{ path, line, taskText }`
 * aus der Herkunft ihrer Zeilen (Pfad, Zeile, Roh-Zeile), in der Reihenfolge
 * der Menge. Leer, wenn die Menge fehlt, nicht bereit ist oder einen
 * Abfrage-Fehler trägt. Die Hintergrund-Nutzer der Anzeige (Kennungs-Vorschlag,
 * Vorgänger-Suche im Aufgaben-Dialog) lesen so die Treffer von `LIST TASKS`,
 * ohne die Form der Menge zu kennen.
 * @param {import('./result-set.js').ResultSet|null|undefined} resultSet
 * @returns {Array<{ path: string, line: number, taskText: string }>}
 */
function taskHits(resultSet) {
  const state = resultSet && resultSet.state;
  if (!state || state.status !== 'ready' || state.queryError) return [];
  const rows = Array.isArray(resultSet.rows) ? resultSet.rows : [];
  const hits = [];
  for (const row of rows) {
    const origin = row && row.origin;
    if (!origin || origin.kind !== 'task' || typeof origin.raw !== 'string') continue;
    hits.push({ path: origin.path, line: origin.line, taskText: origin.raw });
  }
  return hits;
}

/**
 * Datei-Zahl des Suchraums aus dem Zustand, wie sie der Hinweis «zu groß»
 * einsetzt; ohne Angabe 0.
 * @param {import('./result-set.js').State} state
 * @returns {number}
 */
function areaFileCount(state) {
  const area = state && state.area;
  return (area && area.fileCount) || 0;
}

module.exports = {
  columnHeader,
  cellSegments,
  displayName,
  roundUrgency,
  groupTitle,
  walkGroups,
  taskHits,
  areaFileCount,
};
