// 4T-002022 (Epic 3E-000192): Hinweis an der Stelle eines nicht zeichenbaren
// Diagramms und Zeile der ausgelassenen Werte unter einem gezeichneten.
//
// Schwester-Modul von chart-view.js und dort der Aufrufer der Bausteine (der
// portable Export in chart-export.js nimmt allein den Satz der Auslass-Zeile,
// `auslassSatz`, 4T-002025): Der Schritt
// der Befüllung (`zeichne`) trägt Lese-Ansicht, geteilte Ansicht, Live-Modus,
// Teilbaum und das Neu-Zeichnen beim Farb- und Sprachwechsel, und damit gehen
// Hinweis und Auslass-Zeile überall denselben Weg.
//
// **Der Grund kommt als Kennung aus der Brücke** (`buildChart`,
// src/main/preload-diagramme.js): `reason` in der festen Reihenfolge des
// Format-Kerns, `detail` als Anlass, `missingKey` als Name einer fehlenden oder
// unbekannten Angabe des Blocks und dazu `tableName` und `file`, damit der
// Hinweis den Namen nennen kann, ohne den Block hier ein zweites Mal zu lesen.
// Liegen mehrere Gründe zugleich vor, hat der Format-Kern schon den ersten
// gewählt; hier wird nur noch übersetzt.
//
// **Text des Anwenders** (Tabellen-Name, Datei-Name, Spalten-Kennung,
// Zeilen-Eintrag) wird ausschließlich über `textContent` eingesetzt, nie als
// HTML. Die Platzhalter werden in einem Durchgang über eine Ersetzungs-Funktion
// gefüllt, nicht über eine Ersetzungs-Zeichenkette, die Muster wie `$&`
// auswerten würde; ein eingesetzter Wert wird nicht erneut durchsucht, auch
// wenn ein Satz zwei Platzhalter mit Anwender-Text trägt.
//
// Übersetzt wird über die mitgegebene Funktion `uebersetze` (im Programm `t`
// aus i18n.js), damit die Prüfdatei jede der fünf Sprachfassungen ohne
// geladenen Katalog einsetzen kann. Das Modul importiert nichts.
'use strict';

// Anlässe des Grundes «Art verträgt die Daten nicht» -> Schlüssel.
const ART_SCHLUESSEL = {
  negative: 'chart.hint.reason.typeNegative',
  zeros: 'chart.hint.reason.typeZeros',
  'multiple-series': 'chart.hint.reason.typeMultipleSeries',
  'missing-type': 'chart.hint.reason.typeUnknown',
  'unknown-type': 'chart.hint.reason.typeUnknown',
};

function text(wert) {
  return wert == null ? '' : String(wert);
}

/**
 * Der Schlüssel des Grund-Satzes und die Werte seiner Platzhalter.
 *
 * @param {{reason: string, detail: (string|null), missingKey?: (string|null),
 *   tableName?: (string|null), file?: (string|null)}} erg Ergebnis
 *   `undrawable` der Brücke.
 * @returns {{key: string, werte: object}|null} null bei einem unbekannten Grund.
 */
export function hinweisGrund(erg) {
  const detail = text(erg && erg.detail);
  const name = text(erg && erg.tableName);
  switch (erg && erg.reason) {
    case 'document-missing':
      return {
        key: 'chart.hint.reason.documentMissing',
        werte: { file: text(erg.file) || detail },
      };
    case 'table-missing':
      // 4T-002023: Zeigt der Bezug auf ein anderes Dokument, nennt der Satz
      // dieses Dokument; «in diesem Dokument» wäre dort falsch. Den Namen des
      // anderen Dokuments trägt die Brücke im Feld `file` (null beim eigenen).
      if (!name) return { key: 'chart.hint.reason.tableNotNamed', werte: {} };
      return text(erg.file)
        ? { key: 'chart.hint.reason.tableMissingInFile', werte: { name, file: text(erg.file) } }
        : { key: 'chart.hint.reason.tableMissing', werte: { name } };
    case 'table-other-kind':
      return { key: 'chart.hint.reason.tableOtherKind', werte: { name } };
    case 'table-invalid':
      return { key: 'chart.hint.reason.tableInvalid', werte: { name } };
    case 'selection-invalid':
      // Allein das eigene Feld entscheidet: Eine Spalte kann selbst `labels`
      // heißen, ihre Nennung bleibt dann eine Nennung.
      return erg.missingKey != null
        ? { key: 'chart.hint.reason.selectionKeyMissing', werte: { key: text(erg.missingKey) } }
        : { key: 'chart.hint.reason.selectionInvalid', werte: { entry: detail } };
    case 'values-not-numeric':
      return { key: 'chart.hint.reason.valuesNotNumeric', werte: { column: detail } };
    case 'no-numbers':
      return { key: 'chart.hint.reason.noNumbers', werte: {} };
    case 'type-unsupported':
      return { key: ART_SCHLUESSEL[detail] || 'chart.hint.reason.typeUnknown', werte: {} };
    default:
      return null;
  }
}

// Alle Platzhalter in einem Durchgang: Ein eingesetzter Wert wird nicht noch
// einmal nach Platzhaltern durchsucht (der Satz zum anderen Dokument trägt zwei
// mit Anwender-Text). Die Ersetzung über eine Funktion wertet keine Muster wie
// `$&` aus.
function fuelle(vorlage, werte) {
  return text(vorlage).replace(/\{(\w+)\}/g, (platz, name) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? text(werte[name]) : platz,
  );
}

/**
 * Der Satz mit dem Grund, übersetzt und mit eingesetzten Namen.
 *
 * @param {object} erg Ergebnis `undrawable` der Brücke.
 * @param {function(string): string} uebersetze Übersetzungs-Funktion.
 * @returns {string} leer bei einem unbekannten Grund.
 */
export function hinweisText(erg, uebersetze) {
  const grund = hinweisGrund(erg);
  return grund ? fuelle(uebersetze(grund.key), grund.werte) : '';
}

/**
 * Der Hinweis-Kasten an der Stelle des Diagramms: Überschrift und Satz mit dem
 * Grund. Vorlese-tauglich als Anmerkung (`role="note"`).
 *
 * @param {object} erg Ergebnis `undrawable` der Brücke.
 * @param {function(string): string} uebersetze Übersetzungs-Funktion.
 * @returns {HTMLElement}
 */
export function baueHinweis(erg, uebersetze) {
  return kastenMitSatz(hinweisText(erg, uebersetze), uebersetze);
}

/**
 * 4T-002025: Der Hinweis in Druck und PDF an der Stelle eines Diagramms, dessen
 * Tabelle in einem anderen Dokument bis zur Zeit-Grenze nicht gelesen ist. Ein
 * Zustand der Ausgabe, kein Grund des Format-Kerns; Form wie `baueHinweis`.
 *
 * @param {function(string): string} uebersetze Übersetzungs-Funktion.
 * @returns {HTMLElement}
 */
export function baueHinweisNichtRechtzeitig(uebersetze) {
  return kastenMitSatz(uebersetze('chart.hint.reason.notReadInTime'), uebersetze);
}

function kastenMitSatz(satz, uebersetze) {
  const kasten = document.createElement('div');
  kasten.className = 'perspective-chart-hint';
  kasten.setAttribute('role', 'note');
  const titel = document.createElement('div');
  titel.className = 'perspective-chart-hint-title';
  titel.textContent = uebersetze('chart.hint.title');
  kasten.appendChild(titel);
  if (satz) {
    const grund = document.createElement('div');
    grund.className = 'perspective-chart-hint-reason';
    grund.textContent = satz;
    kasten.appendChild(grund);
  }
  return kasten;
}

/**
 * Der Satz mit der Zahl der ausgelassenen Werte, Einzahl oder Mehrzahl.
 * 4T-002025: eigene Funktion, weil der portable Export denselben Satz unter
 * das Bild schreibt (chart-export.js); die Regel steht damit einmal.
 *
 * @param {number} anzahl Zahl der ausgelassenen Werte.
 * @param {function(string): string} uebersetze Übersetzungs-Funktion.
 * @returns {string} leer ohne ausgelassene Werte.
 */
export function auslassSatz(anzahl, uebersetze) {
  const n = Number(anzahl) || 0;
  if (n <= 0) return '';
  const vorlage = uebersetze(n === 1 ? 'chart.omitted.one' : 'chart.omitted.other');
  return fuelle(vorlage, { n: String(n) });
}

/**
 * Die Zeile unter einem gezeichneten Diagramm mit der Zahl der ausgelassenen
 * Werte; ohne ausgelassene Werte keine Zeile.
 *
 * @param {number} anzahl Zahl der ausgelassenen Werte.
 * @param {function(string): string} uebersetze Übersetzungs-Funktion.
 * @returns {HTMLElement|null}
 */
export function baueAuslassZeile(anzahl, uebersetze) {
  const satz = auslassSatz(anzahl, uebersetze);
  if (!satz) return null;
  const zeile = document.createElement('div');
  zeile.className = 'perspective-chart-omitted';
  zeile.textContent = satz;
  return zeile;
}
