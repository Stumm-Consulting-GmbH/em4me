// 4T-001345/4T-001346 (Epic 3E-000239): Der rechnende Kern der Zell-Eingabe in
// der gerenderten Pipe-Tabelle — Block-Zuordnung, Zell-Bereich, Zellsprung und
// Maskierung. Ohne DOM und ohne Editor-Zugriff ausser der Lese-Schnittstelle
// einer View (`posAtDOM`, `state.doc`), damit die Entscheidungen, in denen ein
// Irrtum in die Datei des Anwenders ginge, ohne laufenden Editor pruefbar sind.
//
// Herausgeloest aus live-table-zelle.js, als jene Datei ihr Groessen-Budget riss
// (515 von 500 Zeilen). Der Schnitt folgt nicht der Zeilenzahl, sondern der
// Fachlichkeit: hier das Rechnen, dort das Bedienen.
'use strict';

import { locatePipeCell, locatePipeCellPosition } from '../../../shared/markdown/table-edit.js';
// Lokalisiert den Tabellen-Block des Containers im aktuellen Dokument und
// bestaetigt ihn gegen den Stand, mit dem das Widget gebaut wurde. `null`, wenn
// die Zuordnung nicht zweifelsfrei gelingt — dann wird nichts geschrieben.
export function blockImDokument(view, container, source) {
  let pos;
  try {
    pos = view.posAtDOM(container);
  } catch {
    return null;
  }
  if (typeof pos !== 'number' || pos < 0) return null;
  const doc = view.state.doc;
  const from = pos;
  const to = pos + String(source).length;
  if (to > doc.length) return null;
  // Der Abgleich Zeichen fuer Zeichen ist zugleich die Bestaetigung der
  // Zuordnung: Steht an der DOM-Position noch genau der Text, aus dem das
  // Widget gebaut wurde, ist der Block gefunden; sonst nicht.
  if (doc.sliceString(from, to) !== String(source)) return null;
  return { from, to, zeilen: String(source).split('\n') };
}

// Der Dokument-Bereich, den eine Zell-Uebernahme ersetzt: genau der
// Inhalts-Bereich der Zelle, nicht die Zeile und nicht die Tabelle. Bei einer
// leeren Zelle fallen `from` und `to` zusammen — geschrieben wird dann in das
// Padding vor der schliessenden Pipe, wie es der Bestands-Zellsprung tut.
export function zellBereich(block, modell, pos) {
  const stelle = locatePipeCellPosition(block.zeilen, modell, pos);
  const from = block.from + stelle.offset;
  return { from, to: from + (stelle.contentEnd - stelle.contentStart), stelle };
}

// --- Zellsprung (4T-001346) --------------------------------------------------

// Die Masse der gerenderten Tabelle: Kopfzeile plus Datenzeilen mal Spalten.
// Die Trennzeile kommt darin nicht vor — markdown-it erzeugt sie nicht, und der
// Sprung ueberspringt sie damit von selbst statt durch eine eigene Regel (AK6).
export function tabellenMasse(modell) {
  return { zeilen: modell.rows.length, spalten: modell.columnCount };
}

// Die Nachbarzelle in einer der vier Richtungen, oder `null` am Rand der
// Tabelle. `vor` und `zurueck` laufen in Lese-Reihenfolge ueber die Zeilen
// hinweg, `hoch` und `runter` bleiben in ihrer Spalte.
//
// **Am Ende der Tabelle ist Schluss** (AK4): Es wird keine Zeile angelegt. Das
// unterscheidet den Sprung in der gerenderten Ansicht bewusst vom Zellsprung im
// Quelltext (`handleTableTab`, editor-keymaps.js), der dort eine neue Zeile
// anhaengt — dessen Verhalten bleibt unveraendert (AK8). Der Unterschied ist
// keine Unstimmigkeit, sondern folgt der Abgrenzung der Story: Struktur-
// Operationen bleiben beim Kontextmenue.
export function nachbarZelle(masse, pos, richtung) {
  const spalten = Math.max(1, masse.spalten);
  const reihen = masse.zeilen + 1; // Kopfzeile plus Datenzeilen
  const reihe = pos.rowKind === 'header' ? 0 : Math.max(0, pos.rowIndex) + 1;
  const spalte = Math.max(0, Math.min(pos.col, spalten - 1));
  let zielReihe;
  let zielSpalte = spalte;
  if (richtung === 'vor' || richtung === 'zurueck') {
    const schritt = richtung === 'vor' ? 1 : -1;
    const linear = reihe * spalten + spalte + schritt;
    if (linear < 0 || linear >= reihen * spalten) return null;
    zielReihe = Math.floor(linear / spalten);
    zielSpalte = linear % spalten;
  } else {
    zielReihe = reihe + (richtung === 'runter' ? 1 : -1);
    if (zielReihe < 0 || zielReihe >= reihen) return null;
  }
  return zielReihe === 0
    ? { rowKind: 'header', rowIndex: 0, col: zielSpalte }
    : { rowKind: 'body', rowIndex: zielReihe - 1, col: zielSpalte };
}

// Die logische Zell-Position und der Zeichen-Offset darin, zu einer Stelle im
// Dokument. `null`, wenn die Stelle in keiner Zelle liegt.
export function zellePosZuDokumentStelle(zeilen, modell, relativeStelle) {
  let rest = relativeStelle;
  let zeile = 0;
  while (zeile < zeilen.length && rest > zeilen[zeile].length) {
    rest -= zeilen[zeile].length + 1;
    zeile++;
  }
  if (zeile >= zeilen.length) return null;
  const roh = locatePipeCell(zeilen, modell, zeile, rest);
  // Die Trennzeile ist keine Zelle. Wer dort landet — etwa mit der Pfeiltaste
  // von oben in eine Tabelle ohne Datenzeilen —, bekommt die Kopfzelle
  // derselben Spalte.
  const pos = roh.rowKind === 'separator' ? { rowKind: 'header', rowIndex: 0, col: roh.col } : roh;
  const stelle = locatePipeCellPosition(zeilen, modell, pos);
  const offset = Math.max(
    0,
    Math.min(rest - stelle.contentStart, stelle.contentEnd - stelle.contentStart),
  );
  return { pos, offset: zeile === stelle.line ? offset : 0 };
}

// Ein als Text eingegebenes Pipe-Zeichen wuerde die Tabelle in zwei Zellen
// zerschneiden; es wird deshalb maskiert. Bereits maskierte Pipes bleiben es.
// Zeilenumbrueche kann ein einzeiliges Eingabefeld nicht liefern, Tabulatoren
// werden abgefangen, bevor sie im Wert landen.
export function maskiereZellText(text) {
  return String(text).replace(/\\?\|/g, '\\|');
}

// Der Block-Text, wie er nach der Uebernahme dasteht — gebraucht, um die
// Ziel-Stelle eines Sprungs im NEUEN Dokument zu berechnen. Die Ersetzung wird
// dafuer lokal auf den Block angewandt, statt auf die Transaktion zu warten.
export function blockTextNachUebernahme(block, bereich, neu) {
  const alt = block.zeilen.join('\n');
  return alt.slice(0, bereich.from - block.from) + neu + alt.slice(bereich.to - block.from);
}

// Uebernimmt die offene Bearbeitung. `ziel` ist die logische Zell-Position, zu
// der die Schreibmarke danach springt (Zellsprung, 4T-001346); ohne sie bleibt
// sie stehen.
//
// **Aenderung und Sprung gehen in EINER Transaktion.** Zwei getrennte
// Transaktionen haetten zwei Eintraege in der Editor-Historie erzeugt, und ein
// Undo naehme dann erst den Sprung und danach die Aenderung zurueck — der
// Anwender muesste zweimal drucken fuer einen Handgriff (AK6 aus 4T-001345).
