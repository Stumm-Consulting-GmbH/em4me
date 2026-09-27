// 4T-001928 (Epic 3E-000256, E5.2, E5.4): Was eine Zelle vom Typ `record`
// trägt, und wie sie ausgelegt wird.
//
// **Zwei zulässige Inhalte, eine Auflösungs-Ordnung** (E5.4). Die Anwendung
// schreibt immer die **Kennung** des Ziels, weil sie Umbenennungen und
// Namens-Dubletten übersteht; von Hand ist daneben der **fachliche Schlüssel**
// des Ziels zulässig, weil die Hand-Änderbarkeit für die Tabellen-Datei genauso
// gilt wie für ein Prosa-Dokument. Gelesen wird in einer Ordnung: Die Kennung
// gewinnt, sonst gilt der Text als Schlüssel-Wert. Ein Schlüssel-Wert, der
// zufällig die Form einer Kennung hat, wird deshalb als Kennung gelesen; das ist
// die Ordnung und kein Versehen.
//
// **Die Kennung wird nach denselben Regeln gelesen wie überall** (E5.1, E5.2):
// aufgefüllt oder kurz (`r-00042`, `r-42`), über `nummerAus`. Das Blatt liefert
// sie **aufgefüllt** zurück, weil die Anwendung nur diese Form schreibt; die
// Kurzform einer Hand-Schreibung wird beim nächsten Schreibvorgang aufgefüllt,
// nach demselben Muster, mit dem E3.6 die Fence-Länge behandelt.
//
// **Kein Wiki-Link in der Zelle.** Die Anker-Form `[[Tabelle#^r-00042]]` aus
// E5.2 gehört dem Prosa-Verweis, weil ein Prosa-Dokument die Ziel-Tabelle nicht
// kennt und der Verweis sie deshalb nennen muss. In einer Verweis-Spalte steht
// die Ziel-Tabelle bereits in der Definition (`options.table`); eine zweite
// Nennung in der Zelle wäre eine zweite Wahrheit, die beim Umbenennen der
// Tabelle auseinanderliefe. Ein Text der Form `[[…]]` wird deshalb nicht
// ausgepackt, sondern ist ein Schlüssel-Wert wie jeder andere.
//
// **Der Schlüssel-Wert wird nicht getrimmt.** Das Ablage-Format hält einen Wert
// mit führenden Leerzeichen ausdrücklich für zulässig, und der Index vergleicht
// Schlüssel ungetrimmt (`schluesselKey` in `src/shared/database/record-schluessel.js`);
// ein getrimmter Vergleich hier träfe Datensätze, die dort als verschieden gelten.
//
// Prozess-neutral: kein Dateizugriff, keine Electron-Abhängigkeit. Heute liest
// allein die Verweis-Regel der Schreib-Schnittstelle das Blatt; die Anzeige kann
// es benutzen, sobald sie Verweise auflöst.
'use strict';

const { kennungFuer, nummerAus } = require('./record-identity.js');

// Die drei Arten einer Verweis-Zelle.
const VERWEIS_ARTEN = Object.freeze({
  leer: 'leer',
  kennung: 'kennung',
  schluessel: 'schluessel',
});

/**
 * Legt den Text einer Verweis-Zelle aus.
 *
 * @param {string} text Der Zell-Text, wie er in der Datei steht oder der
 *   Auftrag ihn nennt.
 * @returns {{art: 'leer'|'kennung'|'schluessel', wert: string}} Bei `leer` ist
 *   `wert` die leere Zeichenkette, bei `kennung` die aufgefüllte Kennung, bei
 *   `schluessel` der Text unverändert.
 */
function legeVerweisZelleAus(text) {
  // Ein Zell-Text ist immer ein Text; alles andere ist ein gebrochener Vertrag
  // des Aufrufers und wird nicht still als leer gedeutet.
  if (typeof text !== 'string')
    throw new TypeError('legeVerweisZelleAus: der Zell-Text muss eine Zeichenkette sein');
  // Leerraum allein ist keine Angabe. Das deckt sich mit «nicht gesetzt» der
  // Pflicht-Prüfung (leerer getrimmter Zell-Text).
  if (text.trim() === '') return { art: VERWEIS_ARTEN.leer, wert: '' };
  const nummer = nummerAus(text);
  if (nummer !== null) return { art: VERWEIS_ARTEN.kennung, wert: kennungFuer(nummer) };
  return { art: VERWEIS_ARTEN.schluessel, wert: text };
}

module.exports = { VERWEIS_ARTEN, legeVerweisZelleAus };
