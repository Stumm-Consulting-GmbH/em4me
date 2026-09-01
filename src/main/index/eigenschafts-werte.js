// 4T-1340 (Epic 3E-0238): Die zu einer Eigenschaft im Bereich bereits
// vergebenen Werte.
//
// **Die Werte liegen schon da.** Der Bereichs-Index führt für jede Datei ihre
// Frontmatter-Eigenschaften (`entry.propertiesPerFile`, Schlüssel klein
// geschrieben, Werte als Zeichenkette oder Liste von Zeichenketten); die
// Abfrage-Funktion baut ihren Kontext aus derselben Map. Diese Sicht liest sie
// und rechnet daraus die Wertemenge eines Feldes — ohne eine Datei erneut zu
// öffnen und ohne eine zweite Datenhaltung.
//
// **Ohne Zwischenspeicher, anders als die Abfrage-Quelle.** `profil-wertevorrat.js`
// speichert zwischen, weil eine Abfrage den Bestand auswertet: Sie parst, prüft
// jede Datei gegen einen Ausdruck und rechnet eine Ergebnis-Pipeline. Hier ist
// es ein Durchlauf über eine bereits aufgebaute Map mit einem Feld-Zugriff je
// Datei; ein Zwischenspeicher brächte die Invalidierungs-Frage mit, ohne einen
// messbaren Gewinn zu tragen. Ob die Annahme trägt, misst der Vorgang an einem
// großen Bereich, statt sie zu glauben.
//
// Read-only-Sicht ohne eigenen Scan wie die Nachbarn: Der Status wird
// durchgereicht, der Index-Aufbau bleibt Sache des Aufrufers.
'use strict';

const { indexes, resolveRootInfo } = require('./store.js');

// Wieviele Werte höchstens zurückgehen. Die Liste erscheint beim Anklicken
// eines Feldes, also in einem Moment, in dem eine Verzögerung sofort auffällt;
// und eine Liste, die länger ist als das Dropdown, hilft ohnehin niemandem.
// Der Wert liegt bewusst über dem Render-Limit der Verweis-Vorschläge (30),
// weil hier zusätzlich getippt gefiltert wird.
const MAX_WERTE = 100;

// Ein Wert je Zeile der Anzeige: Zeichenketten zählen, Listen zählen je
// Element, alles Übrige (Zahl, Wahrheitswert, verschachtelte Struktur) bleibt
// draußen. Grund: Vorgeschlagen wird in ein Text-Bedienelement, und ein
// Wahrheitswert oder eine Struktur ist dort kein sinnvoller Vorschlag.
function sammleAusWert(wert, hinein) {
  if (typeof wert === 'string') {
    const sauber = wert.trim();
    if (sauber) hinein(sauber);
    return;
  }
  if (Array.isArray(wert)) {
    for (const einzeln of wert) {
      if (typeof einzeln !== 'string') continue;
      const sauber = einzeln.trim();
      if (sauber) hinein(sauber);
    }
  }
}

/**
 * Die im Bereich vergebenen Werte einer Eigenschaft.
 *
 * @param {string} filePath eine Datei des Bereichs (bestimmt die Wurzel).
 * @param {string} feld Name der Eigenschaft; Groß- und Kleinschreibung egal.
 * @param {string|null} areaRoot Bereichs-Wurzel, falls bekannt.
 * @param {number} limit Obergrenze der Liste.
 * @returns {{status: string, values?: string[], wurzel?: string}}
 */
function eigenschaftsWerteFuerFeld(filePath, feld, areaRoot, limit = MAX_WERTE) {
  const name = typeof feld === 'string' ? feld.trim().toLowerCase() : '';
  if (!filePath || !name) return { status: 'unavailable', values: [] };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable', values: [] };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', values: [] };
  if (entry.status === 'indexing') return { status: 'indexing', values: [] };
  // W-07 (4T-0309): Fehler- und Übergroß-Status wie unavailable behandeln —
  // nicht den eingefrorenen Index eines toten Watchers als verbindlich ausgeben.
  if (entry.status === 'oversized' || entry.status === 'error') {
    return { status: 'unavailable', values: [] };
  }

  // Erste Schreibweise gewinnt: Wer «Projekt» und «projekt» im Bestand hat,
  // bekommt einen Vorschlag und nicht zwei, die dasselbe meinen. Die Map hält
  // die Kleinschreibung als Schlüssel und die gefundene Schreibweise als Wert.
  const gesehen = new Map();
  for (const props of entry.propertiesPerFile.values()) {
    if (!props) continue;
    const wert = props[name];
    if (wert === undefined) continue;
    sammleAusWert(wert, (v) => {
      const schluessel = v.toLowerCase();
      if (!gesehen.has(schluessel)) gesehen.set(schluessel, v);
    });
  }

  const werte = [...gesehen.values()].sort((a, b) => a.localeCompare(b));
  const grenze = Number.isFinite(limit) && limit > 0 ? limit : MAX_WERTE;
  return {
    status: 'ready',
    wurzel: root,
    // Gekürzt wird NACH dem Sortieren, damit die Grenze am Alphabet schneidet
    // und nicht an der zufälligen Reihenfolge der Dateien im Index.
    values: werte.slice(0, grenze),
  };
}

module.exports = { MAX_WERTE, eigenschaftsWerteFuerFeld };
