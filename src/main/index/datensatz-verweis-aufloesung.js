// 4T-002333 (Epic 3E-000264): Auf welchen Datensatz zeigt ein Verweis
// `[[Tabelle#^…]]`?
//
// **Eine Auflösungs-Ordnung für alle Leser** (Entscheidung T2 nach E5.2 bis
// E5.4 und S7). Gültigkeit im Linter, Klick in die Maske und jede spätere
// Auskunft fragen hier und rechnen nicht selbst; sonst gälte ein Verweis, auf
// den der Klick nicht führt, oder umgekehrt. Die Reihenfolge ist fest:
//
//   1. die Kennung, lang (`r-00042`) oder kurz (`r-42`), verglichen über die
//      aufgefüllte Form, in der der Index jede Kennung führt;
//   2. sonst die Anzeige-Form eines Datensatzes (`[[Personen#^Max Müller]]`),
//      getrimmt verglichen, Groß- und Kleinschreibung wie geschrieben, und nur
//      in den Zeichen von `ANZEIGE_ANKER_MUSTER` (`record-identity.js`), die
//      auch der Verweis-Bau der Anzeige als Anker behält;
//   3. trägt mehr als ein Datensatz diese Anzeige-Form, ist der Verweis
//      mehrdeutig: Er gilt als bestehend (S7), führt aber auf keinen Datensatz.
//
// Ein Block-Anker desselben Namens geht allen dreien vor (E5.2). Diese Regel
// steht bei den Lesern, weil nur sie die Block-Anker der Datei befragen; der
// Klick-Weg unten wendet sie ebenso an wie `anchorExistsInFile` in
// `resolve.js`, und dort geht zusätzlich eine Überschrift gleicher Anker-Form
// vor, weil der Klick das `^` nicht mehr sieht.
//
// **Datenquelle ist der Platten-Stand**, dieselbe Zuordnung und derselbe
// Zwischenspeicher, aus denen `kennungInTabelle` antwortet
// (`datensatz-zugriff.js`). Überschriften- und Block-Anker sehen den Puffer
// eines offenen Dokuments ebenfalls nicht, und ein Klick, der auf einen
// Datensatz führte, den der Linter als gebrochen zeigt, wäre nicht erklärbar.
//
// Read-only-Sicht ohne eigenen Scan wie die Nachbarn in diesem Ordner.

'use strict';

const path = require('node:path');
const { kopfDateiFuer } = require('./part-files.js');
const { tabelleDerPlatte } = require('./datensatz-zugriff.js');
const { datensatzErfassungAktiv } = require('./index-schalter.js');
const {
  ANZEIGE_ANKER_MUSTER,
  kennungFuer,
  nummerAus,
} = require('../../shared/database/record-identity.js');
const { pathCompareKey } = require('../../shared/platform.js');
// Die Anker-Form einer Überschrift, wie `anchorExistsInFile` sie vergleicht.
const { githubLikeSlug } = require('../../shared/markdown/slug.js');

// Als Funktion, damit kein Aufrufer die Liste einer fremden Antwort hält.
function keiner() {
  return { status: 'keiner', kennung: null, treffers: [] };
}

/**
 * Löst den Anker eines Datensatz-Verweises gegen die Tabelle auf.
 *
 * @param {object} entry Index-Eintrag (Platten-Sicht).
 * @param {string} kopfPfad Datei, auf die der Verweis aufgelöst hat (Kopf-Datei
 *   oder Folge-Segment; die Frage geht über die Tabelle).
 * @param {string} anker Anker-Text ohne das `^`.
 * @returns {{status: 'kennung'|'anzeige'|'mehrdeutig'|'keiner', kennung: string|null,
 *   treffers: string[]}} `kennung` ist die aufgefüllte Kennung des Ziels, bei
 *   `mehrdeutig` und `keiner` null; `treffers` nennt alle passenden Kennungen.
 *   Im Aus-Zustand der Erweiterung «Datenbank» ruht der Bestand, und die
 *   Antwort ist `keiner`; ob ein Verweis dann als bestehend gilt, entscheidet
 *   der Leser.
 */
function loeseDatensatzVerweis(entry, kopfPfad, anker) {
  if (!datensatzErfassungAktiv()) return keiner();
  const text = typeof anker === 'string' ? anker.trim() : '';
  if (!text) return keiner();
  const tabelle = tabelleDerPlatte(entry, kopfPfad);
  if (!tabelle) return keiner();
  const lang = kennungFuer(nummerAus(text));
  if (lang && tabelle.nachKennung.has(lang)) {
    return { status: 'kennung', kennung: lang, treffers: [lang] };
  }
  // Eine Anzeige-Form gilt nur in den Zeichen, die der Verweis-Bau der Anzeige
  // hinter `^` behält; ein Name außerhalb würde gelten, ohne dass der Klick ihn
  // je mit Anker erreichte.
  if (!ANZEIGE_ANKER_MUSTER.test(text)) return keiner();
  const liste = tabelle.nachAnzeige ? tabelle.nachAnzeige.get(text) : null;
  if (!liste || liste.length === 0) return keiner();
  if (liste.length > 1) return { status: 'mehrdeutig', kennung: null, treffers: [...liste] };
  return { status: 'anzeige', kennung: liste[0], treffers: [liste[0]] };
}

/**
 * Ist diese Datei eine Tabellen-Datei?
 *
 * Die Kopf-Datei trägt die Marke `table` selbst; ein Folge-Segment trägt keine
 * Marke und gehört über seinen Namen zur Kopf-Datei, dieselbe Ableitung, mit
 * der die Zuordnung seine Datensätze der Tabelle zuschlägt.
 *
 * @param {object} entry Index-Eintrag.
 * @param {string} absPfad Pfad, wie der Index ihn führt.
 */
function istTabellenDatei(entry, absPfad) {
  if (!entry || !entry.dbKindsPerFile) return false;
  if (typeof absPfad !== 'string' || !absPfad) return false;
  const marken = entry.dbKindsPerFile.get(kopfDateiFuer(absPfad) || absPfad);
  return Array.isArray(marken) && marken.includes('table');
}

// Vergleichs-Schlüssel eines Pfades wie in `part-files.js`: Trenner
// vereinheitlicht, NFC wie die Datei-Schlüssel des Index, Schreibung nach dem
// Dateisystem.
function pfadSchluessel(p) {
  return pathCompareKey(path.normalize(String(p).normalize('NFC')));
}

// Der Pfad, unter dem der Index diese Datei führt. Der Klick-Weg löst seinen
// Pfad im Anzeige-Prozess auf, und auf einem Dateisystem ohne Unterscheidung
// der Schreibung darf er anders geschrieben sein als der Index-Schlüssel. Erst
// der genaue Treffer, dann ein Durchlauf über die bekannten Dateien; der
// Durchlauf fällt nur beim Klick an, nie in der Gültigkeits-Prüfung.
function indexPfadFuer(entry, absPfad) {
  if (entry.files && entry.files.has(absPfad)) return absPfad;
  if (entry.recordsPerFile && entry.recordsPerFile.has(absPfad)) return absPfad;
  const gesucht = pfadSchluessel(absPfad);
  const bekannte = entry.files ? entry.files.keys() : [];
  for (const kandidat of bekannte) {
    if (pfadSchluessel(kandidat) === gesucht) return kandidat;
  }
  return absPfad;
}

/**
 * Das Ziel eines Datensatz-Verweises für den Klick in die Maske (T3).
 *
 * @param {object} entry Index-Eintrag (Platten-Sicht).
 * @param {string} zielPfad Absoluter Pfad der Ziel-Datei des Verweises.
 * **Überschrift und Block-Anker gehen vor.** Im fertigen Link des
 * Anzeige-Prozesses ist das `^` schon entfernt; der Klick kann einen
 * Datensatz-Anker deshalb nicht von einem Überschriften-Anker unterscheiden.
 * Trägt die Ziel-Datei eine Überschrift, deren Anker-Form (`githubLikeSlug`,
 * dieselbe Quelle wie in `anchorExistsInFile`) dem Anker entspricht, oder einen
 * Block-Anker dieses Namens, springt der Klick wie bisher dorthin.
 *
 * @param {string} anker Anker-Text ohne das `^`.
 * @returns {{tabelle: string, kennung: string}|null} `tabelle` ist der Pfad der
 *   Kopf-Datei. null, wenn die Datei keine Tabelle ist, eine Überschrift oder
 *   ein Block-Anker desselben Namens vorgeht oder kein eindeutiger Datensatz
 *   passt; der Klick nimmt dann seinen bisherigen Weg.
 */
function verweisZiel(entry, zielPfad, anker) {
  if (!entry || typeof zielPfad !== 'string' || !zielPfad) return null;
  const text = typeof anker === 'string' ? anker.trim() : '';
  if (!text) return null;
  const pfad = indexPfadFuer(entry, path.resolve(zielPfad));
  if (!istTabellenDatei(entry, pfad)) return null;
  const meta = entry.anchorsPerFile && entry.anchorsPerFile.get(pfad);
  if (meta && meta.blockIds && meta.blockIds.has(text)) return null;
  if (meta && meta.headings && meta.headings.has(githubLikeSlug(text))) return null;
  const { status, kennung } = loeseDatensatzVerweis(entry, pfad, text);
  if (status !== 'kennung' && status !== 'anzeige') return null;
  return { tabelle: kopfDateiFuer(pfad) || pfad, kennung };
}

module.exports = { loeseDatensatzVerweis, istTabellenDatei, verweisZiel };
