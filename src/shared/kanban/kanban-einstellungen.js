// 4T-001846 (Epic 3E-000110): Der eine Wert des Einstellungs-Blocks, den eine
// Spalten-Änderung nachführen muss.
//
// Prozessneutral wie der Kern nebenan; die einzige Abhängigkeit ist sein
// Zeilen-Werkzeug.
//
// **Warum überhaupt ein Eingriff in einen Rest** (Entscheidung E-B dieses
// Tasks): Der Einstellungs-Block des Vorbilds führt unter `list-collapse` einen
// Wahrheitswert **je Spalte**, in der Reihenfolge der Spalten. Bliebe die Liste
// beim Anlegen, Löschen und Verschieben einer Spalte stehen, hätte das
// Vorbild-Werkzeug nach der ersten Spalten-Änderung die falschen Spalten
// eingeklappt — ein stiller Schaden an fremden Daten, und zwar an Daten, die
// diese Anwendung gar nicht deutet.
//
// **Wie schmal der Eingriff ist:** Geändert wird ausschließlich der Text
// zwischen den eckigen Klammern dieses einen Schlüssels, und die Einträge, die
// bleiben, behalten ihren Wortlaut zeichengenau. Der übrige Block — Zeile,
// Schlüssel-Reihenfolge, Abstände, Code-Zaun, der abschließende `%%` — bleibt
// byte-gleich; ein Neuschreiben der JSON-Zeile aus einem geparsten Objekt käme
// nicht in Frage, weil es jede fremde Angabe umformatieren würde.
//
// **Vier Lagen, in denen nichts geschieht** (E-B): kein Block, kein Schlüssel,
// eine Listen-Länge, die schon vorher nicht zur Spaltenzahl passt, oder eine
// nicht lesbare JSON-Zeile. In allen vieren bleibt der Block unangetastet und
// es wird nichts angelegt — wer die Lage nicht versteht, repariert sie nicht.
'use strict';

const { ohneCr, crVon } = require('./kanban-core.js');

const LIST_COLLAPSE_SCHLUESSEL = 'list-collapse';

// Genau eine Fanggruppe für den Klammer-Inhalt. Verschachtelte Klammern kann es
// nicht geben: Der Wert ist eine flache Liste von Wahrheitswerten, und ein
// anderer Inhalt scheitert unten an der Token-Prüfung.
const LIST_COLLAPSE_RE = /("list-collapse"[ \t]*:[ \t]*\[)([^\][]*)(\])/;

// Der Wert, mit dem eine neu angelegte Spalte in die Liste kommt: nicht
// eingeklappt. Er steht hier und nicht an der Aufruf-Stelle, weil er zur
// Grammatik des fremden Blocks gehört und nicht zur Bedienung.
const NEUER_EINTRAG = 'false';

function tokenVon(inhalt) {
  return inhalt.trim() === '' ? [] : inhalt.split(',');
}

/**
 * Führt `list-collapse` einer Spalten-Änderung nach. Mutiert höchstens die eine
 * JSON-Zeile des übergebenen Zeilen-Puffers.
 *
 * @param {Array<string>} zeilen Zeilen-Puffer des Modells.
 * @param {object|null} einstellungen der Block aus `leseTafel`.
 * @param {number} spaltenZahl Zahl der Spalten **vor** der Änderung.
 * @param {{art: string, index?: number, von?: number, nach?: number}} aenderung
 *   `einfuegen` mit `index`, `entfernen` mit `index`, `verschieben` mit `von`
 *   und `nach` (beide als Index in der Liste, `nach` nach dem Entnehmen).
 * @returns {boolean} true, wenn die Zeile geändert wurde; false in jeder der
 *   vier Unterlassungs-Lagen.
 */
function passeListCollapseAn(zeilen, einstellungen, spaltenZahl, aenderung) {
  if (!einstellungen || einstellungen.jsonZeile == null) return false;
  const index = einstellungen.jsonZeile;
  const roh = zeilen[index];
  if (typeof roh !== 'string') return false;
  const cr = crVon(roh);
  const text = ohneCr(roh);

  // Die Lesbarkeits-Schranke: Was nicht als JSON aufgeht, wird nicht angefasst.
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    return false;
  }
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return false;
  const liste = daten[LIST_COLLAPSE_SCHLUESSEL];
  if (!Array.isArray(liste)) return false;
  // Passt die Länge schon vorher nicht zur Spaltenzahl, ist die Liste nicht die,
  // für die diese Nachführung gedacht ist. Dann gilt: Hände weg.
  if (liste.length !== spaltenZahl) return false;

  const treffer = LIST_COLLAPSE_RE.exec(text);
  if (!treffer) return false;
  const tokens = tokenVon(treffer[2]);
  if (tokens.length !== spaltenZahl) return false;
  if (!tokens.every((t) => t.trim() === 'true' || t.trim() === 'false')) return false;

  if (!wendeAn(tokens, aenderung)) return false;

  const vorn = treffer.index + treffer[1].length;
  const neu = text.slice(0, vorn) + tokens.join(',') + text.slice(vorn + treffer[2].length);
  zeilen[index] = neu + cr;
  return true;
}

// Die drei Änderungen auf der Token-Liste. Ein Index außerhalb des Bereichs
// lässt die Liste unberührt und meldet es — lieber ein unveränderter fremder
// Block als ein falsch verschobener.
function wendeAn(tokens, aenderung) {
  const art = aenderung && aenderung.art;
  if (art === 'einfuegen') {
    const i = aenderung.index;
    if (!Number.isInteger(i) || i < 0 || i > tokens.length) return false;
    tokens.splice(i, 0, NEUER_EINTRAG);
    return true;
  }
  if (art === 'entfernen') {
    const i = aenderung.index;
    if (!Number.isInteger(i) || i < 0 || i >= tokens.length) return false;
    tokens.splice(i, 1);
    return true;
  }
  if (art === 'verschieben') {
    const { von, nach } = aenderung;
    if (!Number.isInteger(von) || von < 0 || von >= tokens.length) return false;
    if (!Number.isInteger(nach) || nach < 0 || nach >= tokens.length) return false;
    const [wert] = tokens.splice(von, 1);
    tokens.splice(nach, 0, wert);
    return true;
  }
  return false;
}

module.exports = {
  LIST_COLLAPSE_SCHLUESSEL,
  passeListCollapseAn,
};
