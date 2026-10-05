// 4T-002021 (Epic 3E-000192): Der Vorspann eines Diagramm-Widgets im
// Live-Modus — allein der Block, den der Name benennt, samt Namens-Zeile.
//
// **Warum ein Vorspann.** Das Block-Widget rendert einen Block für sich. Ein
// Diagramm hängt aber an einem anderen Block, seiner Datentabelle, und braucht
// deren Zahlen auch dort, wo nur es selbst gerendert wird. Vorbild ist der
// Datensatz-Block, der den Frontmatter-Block mitbekommt (live-block-field.js).
//
// **Dieselbe Antwort wie in der Lese-Ansicht.** Der Vorspann ist Eingabe des
// Format-Kerns (`buildChartInput` über die Brücke). Er ist so gebaut, dass der
// Kern an ihm dasselbe Ergebnis liefert wie am ganzen Dokument: Es zählt das
// **erste Vorkommen des Namens im Text**, erkannt vom Baustein der Heimat
// (`extractBlockAnchors`, derselbe, den der Kern benutzt), und der Vorspann
// trägt genau die Zeilen, an denen der Kern seine Entscheidung festmacht —
// die Namens-Zeile selbst, und steht sie allein, die Zeile davor; endet dort
// ein Code-Block, den ganzen Block ab seiner Öffner-Zeile. Benennt das erste
// Vorkommen keine Datentabelle (ein Absatz, eine gewöhnliche Tabelle, ein
// anderer Code-Block), antwortet der Kern am Vorspann wie am Dokument mit
// «Tabelle anderer Art»; fehlt der Name, ist der Vorspann leer.
//
// **Warum nicht das ganze Dokument.** Der Aufbau der Dekorationen läuft bei
// jeder Änderung, und genau diese Dokumente werden groß (Entwicklungs-
// richtlinien, Kapitel 5, «Keine Voll-Dokument-Arbeit pro Tastendruck»). Als
// Vorspann ginge das ganze Dokument in den Schlüssel jedes Widgets ein und
// zeichnete das Diagramm bei jedem Tastendruck neu. Die Anker werden einmal je
// Dokument-Stand ermittelt, am geteilten Voll-Text (`getDocText`, eine
// Serialisierung je Stand für alle Verbraucher) und nur, wenn das Dokument ein
// Diagramm-Widget trägt — derselbe Weg, auf dem der Aufbau der Widgets schon
// die Kommentar- und die Definitionslisten-Bereiche ermittelt.
//
// 4T-002072 (Epic 3E-000192): **Der Name in der Kopf-Angabe `table:`.** Ist das
// erste Vorkommen des Namens der Kopf-Name einer Datentabelle (Träger
// `datentabelle` in der Heimat), ist der Vorspann ihr ganzer Zaun von der
// Öffner- bis zur Schluss-Zeile, bei offenem Zaun bis zum Dokument-Ende. Der
// Kern findet den Namen darin an derselben Zeile und liest denselben Rumpf wie
// im ganzen Dokument.
'use strict';

import { getDocText } from '../app/api.js';
import { ankerZeileAllein, extractBlockAnchors } from '../../../shared/block-anchors.js';
import { parseChartSpec, parseTableRef } from '../../../shared/markdown/perspective-chart.js';

// Dokument-Stand -> Ergebnis der Heimat (Zeile und Träger des ersten
// Vorkommens je Name). Identitäts-Cache: ein neuer Stand ist ein neues Objekt,
// der alte fällt mit ihm weg.
const ankerJeStand = new WeakMap();

function ankerVon(doc) {
  let anker = ankerJeStand.get(doc);
  if (!anker) {
    anker = extractBlockAnchors(getDocText(doc));
    ankerJeStand.set(doc, anker);
  }
  return anker;
}

/**
 * Name der Tabelle, die ein Diagramm-Block im selben Dokument nennt.
 *
 * @param {string} body Inhalt des Blocks `perspective-chart`
 * @returns {string|null} null bei fehlender Angabe oder anderem Dokument
 */
export function chartTableName(body) {
  const ref = parseTableRef(parseChartSpec(body).table);
  return ref && ref.kind === 'same' ? ref.name : null;
}

/**
 * 4T-002023 (Epic 3E-000192): Geschriebener Name des anderen Dokuments, dessen
 * Tabelle ein Diagramm-Block nennt.
 *
 * @param {string} body Inhalt des Blocks `perspective-chart`
 * @returns {string|null} null bei fehlender Angabe oder Tabelle im selben Dokument
 */
export function chartOtherTarget(body) {
  const ref = parseTableRef(parseChartSpec(body).table);
  return ref && ref.kind === 'other' ? ref.file : null;
}

/**
 * Inhalt eines Code-Blocks aus dem Syntax-Baum (ohne Zaun und Info-String).
 *
 * @returns {string}
 */
export function fenceBody(state, syntaxNode) {
  for (let kind = syntaxNode.firstChild; kind; kind = kind.nextSibling) {
    if (kind.name === 'CodeText') return state.doc.sliceString(kind.from, kind.to);
  }
  return '';
}

// Der Vorspann zu einem Namen nach dem Ergebnis der Heimat.
function vorspannFuer(doc, zaeune, name, heimat) {
  const zeile = heimat.lineById.get(name);
  if (zeile == null) return '';
  // 4T-002072: Kopf-Name einer Datentabelle — ihr ganzer Zaun.
  const traeger = heimat.traegerById.get(name);
  if (traeger && traeger.art === 'datentabelle') {
    const bis = Math.min(traeger.zaunBis ?? doc.lines, doc.lines);
    return doc.sliceString(doc.line(traeger.zaunVon).from, doc.line(bis).to);
  }
  const anker = doc.line(zeile);
  // Anker am Ende einer Inhalts-Zeile: Der Kern entscheidet allein an ihr.
  // 4T-002048: Die Frage «allein in der Zeile?» stellt die Heimat.
  if (ankerZeileAllein(anker.text) !== name) return anker.text;
  // Anker allein: Er gehört zum Block davor, Leerzeilen trennen nicht.
  let davor = zeile - 1;
  while (davor >= 1 && doc.line(davor).text.trim() === '') davor--;
  if (davor < 1) return anker.text;
  const zaun = zaeune.find((z) => z.toLine === davor);
  const von = zaun ? doc.lineAt(zaun.from).from : doc.line(davor).from;
  return doc.sliceString(von, anker.to);
}

/**
 * Vorspann je genanntem Namen.
 *
 * @param {EditorState} state
 * @param {Array<{from: number, toLine: number}>} zaeune Code-Blöcke des
 *   Dokuments, gesammelt im Durchlauf des Aufbaus (Beginn und letzte Zeile).
 * @param {string[]} namen Die von Diagrammen genannten Namen.
 * @returns {Map<string, string>} Name -> Vorspann; '' für einen Namen, der im
 *   Dokument nicht vorkommt.
 */
export function diagrammVorspaenne(state, zaeune, namen) {
  const treffer = new Map();
  if (namen.length === 0) return treffer;
  const heimat = ankerVon(state.doc);
  for (const name of namen) {
    if (!treffer.has(name)) {
      treffer.set(name, vorspannFuer(state.doc, zaeune, name, heimat));
    }
  }
  return treffer;
}

/**
 * Schlüssel des Diagramm-Widgets: Art, wirksame Darstellung (Farben und
 * Sprache), Vorspann und Block-Inhalt. Ändert sich einer davon, ist das Widget
 * ein anderes und wird neu gebaut und neu gezeichnet.
 *
 * @param {function(string): string} hash Text-Hash des Live-Modus
 * @param {string} farben Kennung der wirksamen Darstellung (Farben, seit
 *   4T-002022 samt Sprache)
 * @param {string} vorspann
 * @param {string} source Quelltext des Blocks samt Zaun
 * @param {string} [zielStand] 4T-002023: Stand des anderen Dokuments, dessen
 *   Tabelle der Block nennt (`zielStand` in charts/chart-targets.js). Er ändert
 *   sich, wenn die Anwendung eine Änderung dieses Dokuments meldet; dann ist
 *   das Widget ein anderes und liest neu. Leer für eine Tabelle im selben
 *   Dokument, deren Schlüssel damit unverändert bleibt.
 * @returns {string}
 */
export function chartWidgetKey(hash, farben, vorspann, source, zielStand = '') {
  const basis = `perspective-chart:${hash(farben)}:${hash(vorspann)}:${hash(source)}`;
  return zielStand ? `${basis}:${zielStand}` : basis;
}
