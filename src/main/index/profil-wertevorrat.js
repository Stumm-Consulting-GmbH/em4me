// 4T-1158 (Epic 3E-0219, E12): Wertevorrat eines Feldes aus einer Abfrage.
//
// Die zweite und mächtigere der beiden neuen Wertevorrats-Quellen. Die
// Notiz-Quelle (4T-1157) bindet den Vorrat an EINE Datei und läuft deshalb
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

// wurzel + ' | ' + abfrage -> { stand, values }
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

// Werte-Liste aus dem Abfrage-Ergebnis: der Name je Treffer, getrimmt,
// Doppelte einmal. Ein Datei-Treffer trägt seinen Datei-Namen, ein
// Block- oder Task-Treffer seine zusammengesetzte Bezeichnung; beide sind
// als Wert brauchbar, und welche Ebene eine Abfrage anspricht, entscheidet
// ihr eigener Text.
function werteAusTreffern(files) {
  const werte = [];
  for (const treffer of Array.isArray(files) ? files : []) {
    const name = typeof treffer?.name === 'string' ? treffer.name.trim() : '';
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
 * @returns {{status: string, values: string[]}} status 'ready' | 'indexing' |
 *   'unavailable'; `values` ist bei jedem anderen Status leer. Der Aufrufer
 *   macht aus einem leeren Vorrat den Hinweis am Feld — eine Blockade gibt es
 *   nicht (weiche Linie, E12).
 */
function werteAusAbfrage(activeFile, areaRoot, abfrage, deps) {
  const standVon = (deps && deps.stand) || indexStand;
  const auswerten = (deps && deps.auswerten) || frontmatterQueryFor;
  const leer = { status: 'unavailable', values: [] };
  if (!activeFile || typeof abfrage !== 'string' || abfrage.trim() === '') return leer;
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return leer;

  const schluessel = `${root} | ${abfrage.trim()}`;
  const stand = standVon(root);
  const bekannt = zwischenspeicher.get(schluessel);
  if (bekannt && bekannt.stand === stand) return { status: 'ready', values: bekannt.values };

  auswertungen += 1;
  let ergebnis;
  try {
    ergebnis = auswerten(activeFile, abfrage, areaRoot);
  } catch {
    // Eine nicht auswertbare Abfrage ist ein leerer Vorrat mit Hinweis,
    // niemals ein Wurf: Das Feld bleibt bedienbar.
    return leer;
  }
  if (!ergebnis || ergebnis.status !== 'ready') {
    // 'indexing' wird durchgereicht, damit der Aufrufer «noch nicht bereit»
    // von «keine Treffer» unterscheiden kann; zwischengespeichert wird ein
    // unfertiger Stand nicht.
    return {
      status: ergebnis && ergebnis.status === 'indexing' ? 'indexing' : 'unavailable',
      values: [],
    };
  }
  // Ein Syntax- oder Funktions-Fehler der Abfrage kommt als queryError mit
  // status 'ready' zurück; auch er ergibt den leeren Vorrat mit Hinweis.
  const values = ergebnis.queryError ? [] : werteAusTreffern(ergebnis.files);

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
