// 4T-001158 (Epic 3E-000219, E12): Wertevorrat eines Feldes aus einer Abfrage.
//
// Die zweite und mächtigere der beiden neuen Wertevorrats-Quellen. Die
// Notiz-Quelle (4T-001157) bindet den Vorrat an EINE Datei und läuft deshalb
// über den mtime-Abgleich des Profil-Katalogs; eine Abfrage hat überhaupt
// keine einzelne Datei — sie hängt am Bestand. Daraus folgen die beiden
// Festlegungen aus E12, die dieses Modul trägt:
//
// **Auswertung auf Verlangen.** Nichts wird vorab über den Gesamtbestand
// gerechnet. Der Vorrat entsteht, wenn ein Bedienelement ihn braucht — nicht
// beim Auflösen eines Profils. Ein Dokument mit zehn Feldern, von denen eines
// eine Abfrage-Quelle hat, kostet damit genau eine Auswertung; eines ohne
// solches Feld kostet keine.
//
// **Zwischenspeicher gegen den Stand des Bereichs-Index**, nicht gegen eine
// Uhr: Eine Uhr rechnete ohne Änderung neu und mit Änderung zu spät. Der
// Stand kommt aus `indexStand` (store.js) und zählt hoch, sobald der Index
// sich als geändert meldet. Ein Eintrag je (Wurzel, Abfrage-Text) hält das
// Ergebnis und den Stand, gegen den es entstand.
//
// Read-only-Sicht ohne eigenen Scan wie die Nachbarn: Der Status wird
// durchgereicht, der Index-Aufbau bleibt Sache des Aufrufers.

'use strict';

const { indexStand, resolveRootInfo } = require('./store.js');
const { frontmatterQueryFor } = require('./query.js');
// 4T-002034 (Epic 3E-000260): Die Treffer kommen aus der Ergebnismenge der
// Antwort (Zeilen mit Herkunft), der Anzeige-Name aus dem Darstellungs-Kern.
const { displayName } = require('../../shared/query/result-display.js');

// wurzel + ' | ' + Vorlagen-Ordner + ' | ' + Abdruck der Aufgaben-Umgebung
// + ' | ' + abfrage -> { stand, values }
const zwischenspeicher = new Map();

// Obergrenze des Zwischenspeichers. Er wächst mit der Zahl VERSCHIEDENER
// Abfrage-Texte, nicht mit der Bestandsgröße; eine Handvoll Profil-Felder
// erzeugt eine Handvoll Einträge. Die Grenze ist trotzdem gesetzt, damit ein
// erzeugter oder wechselnder Abfrage-Text ihn nicht unbegrenzt füllt — beim
// Überlauf fällt der älteste Eintrag heraus (Einfüge-Reihenfolge der Map).
const MAX_EINTRAEGE = 200;

// Nur diese Zähler-Funktion kennt der Test: wie oft tatsächlich ausgewertet
// wurde. Der Nachweis der Begrenzung zählt Auswertungen und nicht Laufzeit —
// eine Laufzeit-Messung wäre bei zehn Testdateien ohne Aussage.
let auswertungen = 0;

function auswertungsZaehler() {
  return auswertungen;
}

// Nur für Tests: Zwischenspeicher und Zähler zurücksetzen.
function zwischenspeicherLeeren() {
  zwischenspeicher.clear();
  auswertungen = 0;
}

// Werte-Liste aus der Ergebnismenge: der Anzeige-Name je Zeile, getrimmt,
// Doppelte einmal. Ein Datei- oder Aufgaben-Treffer trägt seinen Datei-Namen,
// ein Block-Treffer seine zusammengesetzte Bezeichnung `Datei#^anker`; beide
// sind als Wert brauchbar, und welche Ebene eine Abfrage anspricht,
// entscheidet ihr eigener Text.
//
// 4T-002034 (Epic 3E-000260): Gelesen werden die Zeilen, die bisher die flache
// Treffer-Liste `files` der Antwort trug.
//
// 4T-002080 (Epic 3E-000259, Entscheidung F6 Option A des Product Owners vom
// 2026-10-03): Eine gruppierte Abfrage liefert ihre Treffer wie eine
// ungruppierte. Die Zeilen einer gruppierten Menge sind vollständig (Konzept
// E8.4), die Gruppen ordnen allein die Anzeige; gelesen werden deshalb die
// Zeilen und nie die Gruppen, die Gruppen-Werte werden also nicht zur
// Werte-Auswahl. Bis dahin lieferte eine gruppierte Abfrage hier den leeren
// Vorrat, erhalten aus der Zeit, als die flache Treffer-Liste bei Gruppierung
// leer war.
//
// 4T-002040 (Epic 3E-000258, Festlegung 16): Zeilen mit Datensatz-Herkunft
// liefern keinen Wert. Welcher Wert aus einem Datensatz in eine
// Dokument-Eigenschaft gehörte, Anzeige-Form oder Kennung, ist eine Frage der
// Verweise aus Fließtext und hier nicht vorweggenommen.
function werteAusTreffern(menge) {
  const zeilen = Array.isArray(menge.rows) ? menge.rows : [];
  const werte = [];
  for (const zeile of zeilen) {
    if (zeile && zeile.origin && zeile.origin.kind === 'record') continue;
    const name = displayName(zeile && zeile.origin).trim();
    if (name === '' || werte.includes(name)) continue;
    werte.push(name);
  }
  return werte;
}

/**
 * Wertevorrat eines Feldes aus seiner Abfrage-Quelle.
 *
 * @param {string} activeFile Aktive Datei (bestimmt den Suchraum).
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters.
 * @param {string} abfrage Der Abfrage-Text aus `valuesFrom.query`.
 * @param {object} [deps] Einspeisbare Abhängigkeiten (Vorbild: der injizierte
 *   Dateizugriff des Profil-Katalogs). `stand(root)` liefert den Änderungs-
 *   Stand, `auswerten(activeFile, abfrage, areaRoot)` das Abfrage-Ergebnis.
 *   Im Betrieb greifen die echten; die Prüfung speist sie ein, weil sich eine
 *   zweite Index-Meldung im Unit-Umfeld nicht auslösen lässt und die
 *   Invalidierungs-Regel sonst unbewiesen bliebe.
 * @param {string|null} [templatesFolder] Wirksamer Vorlagen-Ordner des Fensters
 *   (4T-002082, Epic 3E-000259): Der Vorrat sieht dieselben Treffer wie die
 *   Abfrage, also keine Vorlagen. Er gehört in den Schlüssel des
 *   Zwischenspeichers, weil ein Wechsel des Ordners den Index-Stand nicht
 *   berührt und sonst den alten Vorrat stehen ließe.
 * @param {object|null} [taskEnv] Aufgaben-Umgebung der Abfrage aus
 *   `buildTaskEnv` (task-env.js; 4T-002080, Epic 3E-000259): Ohne sie ist
 *   eine Aufgaben-Abfrage ein Abfrage-Fehler und der Vorrat leer. Ihr
 *   Fingerabdruck gehört aus demselben Grund wie der Vorlagen-Ordner in den
 *   Schlüssel: Eine geänderte Aufgaben-Einstellung berührt den Index-Stand
 *   nicht.
 * @returns {{status: string, values: string[]}} status 'ready' | 'indexing' |
 *   'unavailable'; `values` ist bei jedem anderen Status leer. Der Aufrufer
 *   macht aus einem leeren Vorrat den Hinweis am Feld — eine Blockade gibt es
 *   nicht (weiche Linie, E12).
 */
function werteAusAbfrage(activeFile, areaRoot, abfrage, deps, templatesFolder, taskEnv) {
  const standVon = (deps && deps.stand) || indexStand;
  const auswerten = (deps && deps.auswerten) || frontmatterQueryFor;
  const leer = { status: 'unavailable', values: [] };
  if (!activeFile || typeof abfrage !== 'string' || abfrage.trim() === '') return leer;
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return leer;

  const ordner = templatesFolder || '';
  const umgebung = taskEnv || undefined;
  const abdruck = umgebung && typeof umgebung.fingerprint === 'string' ? umgebung.fingerprint : '';
  const schluessel = `${root} | ${ordner} | ${abdruck} | ${abfrage.trim()}`;
  const stand = standVon(root);
  const bekannt = zwischenspeicher.get(schluessel);
  if (bekannt && bekannt.stand === stand) return { status: 'ready', values: bekannt.values };

  auswertungen += 1;
  let ergebnis;
  try {
    ergebnis = auswerten(activeFile, abfrage, areaRoot, umgebung, undefined, ordner || null);
  } catch {
    // Eine nicht auswertbare Abfrage ist ein leerer Vorrat mit Hinweis,
    // niemals ein Wurf: Das Feld bleibt bedienbar.
    return leer;
  }
  // 4T-002034: Zustand, Abfrage-Fehler und Treffer allein aus der Ergebnismenge.
  const menge = ergebnis && ergebnis.resultSet;
  const status = menge && menge.state ? menge.state.status : null;
  if (status !== 'ready') {
    // 'indexing' wird durchgereicht, damit der Aufrufer «noch nicht bereit»
    // von «keine Treffer» unterscheiden kann; zwischengespeichert wird ein
    // unfertiger Stand nicht.
    return { status: status === 'indexing' ? 'indexing' : 'unavailable', values: [] };
  }
  // Ein Syntax- oder Funktions-Fehler der Abfrage steht als queryError im
  // Zustand «bereit»; auch er ergibt den leeren Vorrat mit Hinweis.
  const values = menge.state.queryError ? [] : werteAusTreffern(menge);

  if (zwischenspeicher.size >= MAX_EINTRAEGE) {
    const aeltester = zwischenspeicher.keys().next();
    if (!aeltester.done) zwischenspeicher.delete(aeltester.value);
  }
  zwischenspeicher.set(schluessel, { stand, values });
  return { status: 'ready', values };
}

module.exports = {
  werteAusAbfrage,
  // Prüf-Zugänge (Begrenzungs-Nachweis).
  auswertungsZaehler,
  zwischenspeicherLeeren,
};
