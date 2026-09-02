// 4T-001184 (Epic 3E-000221, E1): Auswertung eines Lookup-Feldes — die Dokumente,
// die über ein benanntes Feld auf das eigene verweisen.
//
// Zwillings-Modul zu `profil-wertevorrat.js` (4T-001158) und nach demselben
// Muster gebaut, weil es dieselben beiden Zusagen aus E8/E12 trägt:
//
// **Auswertung auf Verlangen.** Nichts wird vorab über den Gesamtbestand
// gerechnet. Der Wert entsteht, wenn ein Bedienelement ihn braucht — nicht beim
// Auflösen eines Profils. Ein Dokument mit zehn Feldern, von denen eines ein
// Lookup ist, kostet damit genau eine Auswertung; eines ohne solches Feld
// kostet keine.
//
// **Zwischenspeicher gegen den Stand des Bereichs-Index**, nicht gegen eine
// Uhr. Ein Eintrag je (Wurzel, eigene Datei, Abfrage, Feld) hält das Ergebnis
// und den Stand, gegen den es entstand. Anders als beim Wertevorrat gehört die
// EIGENE DATEI in den Schlüssel: Ein Lookup-Ergebnis gilt je Dokument, während
// ein Wertevorrat für alle Dokumente derselbe ist.
//
// **Der Vergleich läuft hier und nicht in der Abfrage — das ist der Kern des
// Moduls.** Naheliegend wäre gewesen, die Bedingung der Abfrage-Sprache zu
// überlassen (`FROM … WHERE projekt = this.file.link`). Das trifft aber nicht:
// Ein Verweis steht im Metadaten-Block in Wiki-Schreibweise (`"[[Halle 3]]"`,
// Konzept 6.12), im Index liegt er als genau dieser String, und `equalsValue`
// der Abfrage-Sprache vergleicht Link-Werte über den logischen Namen, ohne die
// Klammern abzustreifen — `[[Halle 3]]` und `Halle 3` sind dort ungleich
// (geprüft am Bestand, nicht vermutet). Die Abfrage-Sprache dafür zu ändern
// wäre ein Eingriff in ausgeliefertes Verhalten mit weit größerer Reichweite
// als dieses Feld. Also grenzt `from` die Kandidaten ein, und der Verweis-
// Vergleich läuft hier über den Index, wo die Rohwerte liegen.
//
// Read-only-Sicht ohne eigenen Scan wie die Nachbarn: Der Status wird
// durchgereicht, der Index-Aufbau bleibt Sache des Aufrufers.

'use strict';

const path = require('node:path');
const { indexes, indexStand, resolveRootInfo } = require('./store.js');
const { frontmatterQueryFor } = require('./query.js');
const { logicalNameFor } = require('./link-graph.js');
const { createWikiLinkRegex, normalizeNameKey } = require('../../shared/markdown/link-scan.js');
const { pathCompareKey } = require('../../shared/platform.js');

// Vergleichs-Schlüssel eines absoluten Datei-Pfades. Bewusst als benannte
// Funktion und nicht inline: So ist die Stelle über die injizierte Plattform
// prüfbar, statt nur unter einem echten case-sensitiven Dateisystem
// (4T-001276, Epic 3E-000232, Befund B1 — die Empfehlung stammt aus 4T-001275).
//
// Nicht zu verwechseln mit normalizeNameKey aus link-scan.js: Jener vergleicht
// WIKI-NAMEN und faltet bewusst plattform-unabhängig; dieser hier entscheidet
// über DATEI-IDENTITÄT und fragt deshalb die zentrale Auskunft.
function pfadSchluessel(absPfad) {
  return pathCompareKey(String(absPfad || ''));
}

// wurzel + ' | ' + eigene Datei + ' | ' + abfrage + ' | ' + feld
const zwischenspeicher = new Map();

// Obergrenze wie beim Wertevorrat. Er wächst mit der Zahl verschiedener
// (Dokument, Feld)-Paare, nicht mit der Bestandsgröße; beim Überlauf fällt der
// älteste Eintrag heraus (Einfüge-Reihenfolge der Map).
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

// Vergleichs-Schlüssel eines Verweis-Werts. Ein Wert kann als `[[Ziel]]`,
// `[[Ziel|Label]]` oder als blanker Name dastehen; alle drei meinen dasselbe
// Ziel. Ein Wert mit mehreren Wiki-Links liefert alle.
function zielSchluessel(wert) {
  if (typeof wert !== 'string') return [];
  const roh = wert.trim();
  if (roh === '') return [];
  const treffer = [];
  const re = createWikiLinkRegex();
  let m;
  while ((m = re.exec(roh)) !== null) treffer.push(normalizeNameKey(m[1].trim()));
  if (treffer.length > 0) return treffer;
  // Kein Wiki-Link: ein blanker Name zählt mit, weil ein Anwender ihn ohne
  // Klammern schreiben darf und dasselbe meint.
  return roh.includes('[[') ? [] : [normalizeNameKey(roh)];
}

// Zeigt der Wert des benannten Feldes auf eines der eigenen Kennzeichen?
// Listen-Werte zählen eintragsweise (ein Mehrfach-Verweis-Feld).
function zeigtAufUns(props, feld, eigene) {
  if (!props) return false;
  const wert = props[feld];
  if (wert === undefined || wert === null) return false;
  const eintraege = Array.isArray(wert) ? wert : [wert];
  for (const eintrag of eintraege) {
    for (const schluessel of zielSchluessel(eintrag)) {
      if (eigene.has(schluessel)) return true;
    }
  }
  return false;
}

// Die Kennzeichen, unter denen das eigene Dokument angesprochen werden kann:
// sein logischer Name und seine Aliase. Ohne die Aliase wäre ein Verweis, der
// den Alias nutzt, ein stiller Falsch-Negativ-Fall.
function eigeneKennzeichen(entry, absPath) {
  const menge = new Set([normalizeNameKey(logicalNameFor(absPath))]);
  for (const alias of entry.aliasesPerFile.get(absPath) || []) {
    const k = normalizeNameKey(String(alias).trim());
    if (k !== '') menge.add(k);
  }
  return menge;
}

/**
 * Treffer eines Lookup-Feldes: die Dokumente, die über `relatedField` auf die
 * aktive Datei verweisen.
 *
 * @param {string} activeFile Aktive Datei (das Verweis-Ziel und der Suchraum).
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters.
 * @param {object} optionen Typ-eigene Angaben des Feldes.
 * @param {string} [optionen.from] Abfrage-Quelle, die die Kandidaten eingrenzt;
 *   fehlt sie, gilt der ganze Bereich.
 * @param {string} optionen.relatedField Feld, über das verwiesen wird.
 * @param {object} [deps] Einspeisbare Abhängigkeiten (Vorbild 4T-001158):
 *   `stand(root)` liefert den Änderungs-Stand, `auswerten(datei, abfrage, root)`
 *   das Abfrage-Ergebnis. Im Betrieb greifen die echten; die Prüfung speist sie
 *   ein, weil sich eine zweite Index-Meldung im Unit-Umfeld nicht auslösen lässt
 *   und die Invalidierungs-Regel sonst unbewiesen bliebe.
 * @returns {{status: string, values: string[]}} status 'ready' | 'indexing' |
 *   'unavailable'; `values` ist bei jedem anderen Status leer. Der Aufrufer
 *   macht aus einem leeren Ergebnis den Hinweis am Feld — eine Blockade gibt es
 *   nicht (weiche Linie, E10).
 */
function lookupTreffer(activeFile, areaRoot, optionen, deps) {
  const standVon = (deps && deps.stand) || indexStand;
  const auswerten = (deps && deps.auswerten) || frontmatterQueryFor;
  const leer = { status: 'unavailable', values: [] };
  const opt = optionen || {};
  const feld = typeof opt.relatedField === 'string' ? opt.relatedField.trim().toLowerCase() : '';
  if (!activeFile || feld === '') return leer;
  const { root } = resolveRootInfo(activeFile, areaRoot);
  if (!root) return leer;
  // Absoluter Pfad in derselben Form, die der Index als Schlüssel führt
  // (Muster der IPC-Nachbarn in src/main/ipc/profiles.js).
  const abs = path.resolve(activeFile);
  const quelle = typeof opt.from === 'string' && opt.from.trim() !== '' ? opt.from.trim() : 'LIST';

  const schluessel = `${root} | ${pfadSchluessel(abs)} | ${quelle} | ${feld}`;
  const stand = standVon(root);
  const bekannt = zwischenspeicher.get(schluessel);
  if (bekannt && bekannt.stand === stand) return { status: 'ready', values: bekannt.values };

  auswertungen += 1;
  let ergebnis;
  try {
    ergebnis = auswerten(activeFile, quelle, areaRoot);
  } catch {
    // Eine nicht auswertbare Quelle ist ein leeres Ergebnis mit Hinweis,
    // niemals ein Wurf: Das Feld bleibt anzeigbar.
    return leer;
  }
  if (!ergebnis || ergebnis.status !== 'ready') {
    // 'indexing' wird durchgereicht, damit der Aufrufer «noch nicht bereit»
    // von «keine Treffer» unterscheiden kann; ein unfertiger Stand wird nicht
    // zwischengespeichert.
    return {
      status: ergebnis && ergebnis.status === 'indexing' ? 'indexing' : 'unavailable',
      values: [],
    };
  }
  if (ergebnis.queryError) return leer;

  const entry = indexes.get(root);
  if (!entry) return leer;
  const eigene = eigeneKennzeichen(entry, abs);
  const eigenerPfad = pfadSchluessel(abs);

  const values = [];
  for (const treffer of Array.isArray(ergebnis.files) ? ergebnis.files : []) {
    const pfad = typeof treffer?.path === 'string' ? treffer.path : '';
    if (pfad === '') continue;
    // Das eigene Dokument ist nie sein eigener Treffer, auch wenn es ein
    // Verweis-Feld auf sich selbst trägt.
    if (pfadSchluessel(pfad) === eigenerPfad) continue;
    if (!zeigtAufUns(entry.propertiesPerFile.get(pfad), feld, eigene)) continue;
    const name = typeof treffer.name === 'string' ? treffer.name.trim() : '';
    if (name === '' || values.includes(name)) continue;
    values.push(name);
  }

  if (zwischenspeicher.size >= MAX_EINTRAEGE) {
    const aeltester = zwischenspeicher.keys().next();
    if (!aeltester.done) zwischenspeicher.delete(aeltester.value);
  }
  zwischenspeicher.set(schluessel, { stand, values });
  return { status: 'ready', values };
}

module.exports = {
  lookupTreffer,
  // Prüf-Zugänge (Begrenzungs-Nachweis und Vergleichs-Regel).
  zielSchluessel,
  auswertungsZaehler,
  zwischenspeicherLeeren,
};
