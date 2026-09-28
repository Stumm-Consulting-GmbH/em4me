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

import {
  buildEmptyTableRow,
  locatePipeCell,
  locatePipeCellPosition,
  parsePipeTable,
} from '../../../shared/markdown/table-edit.js';
// Lokalisiert den Tabellen-Block des Containers im aktuellen Dokument und
// bestaetigt ihn gegen den Stand, mit dem das Widget gebaut wurde. `null`, wenn
// die Zuordnung nicht zweifelsfrei gelingt — dann wird nichts geschrieben.
//
// Nur fuer das OEFFNEN einer Zelle: Dort ist der Container frisch gefunden und
// haengt im Baum. Waehrend einer offenen Bearbeitung taugt er nicht mehr als
// Schluessel, siehe `blockAmAnker`.
export function blockImDokument(view, container, source) {
  let pos;
  try {
    pos = view.posAtDOM(container);
  } catch {
    return null;
  }
  return blockAmAnker(view.state.doc, pos, source);
}

// 4T-001712 (Epic 3E-000300): Der Tabellen-Block an seiner Dokument-Stelle,
// bestaetigt gegen den Stand beim Oeffnen der Zelle.
//
// **Warum die Stelle und nicht der Anzeige-Knoten.** Gemessen am 2026-09-24
// (`4T-001710`, Ablauf M11): Verlaesst die Schreibmarke die Editor-Zeile, die
// das Tabellen-Widget traegt, zeichnet der Editor diese Zeile neu und legt das
// Widget-DOM neu an. Der alte Knoten haengt dann aus, `posAtDOM` liefert fuer
// ihn eine falsche Stelle, und die Uebernahme verwarf die Eingabe. Die
// Dokument-Stelle ueberlebt jeden solchen Neuaufbau; sie wird beim Oeffnen
// festgehalten und durch jede Aenderung fortgeschrieben (`ankerNachAenderung`).
//
// Der Abgleich Zeichen fuer Zeichen ist zugleich die Bestaetigung der
// Zuordnung: Steht an der Stelle noch genau der Text, aus dem die Bearbeitung
// hervorging, ist der Block gefunden; sonst nicht, und es wird nichts
// geschrieben.
export function blockAmAnker(doc, von, source) {
  if (typeof von !== 'number' || von < 0) return null;
  const text = String(source);
  const to = von + text.length;
  if (to > doc.length) return null;
  if (doc.sliceString(von, to) !== text) return null;
  return { from: von, to, zeilen: text.split('\n') };
}

// 4T-001712: Schreibt die Dokument-Stelle eines Blocks durch eine Aenderung
// fort. Eine Einfuegung genau an der Stelle steht VOR dem Block und schiebt ihn
// nach hinten (Zuordnung nach rechts). Eine Aenderung im Block verschiebt die
// Stelle nicht; sie faellt erst beim Abgleich in `blockAmAnker` auf.
export function ankerNachAenderung(von, aenderungen) {
  return aenderungen.mapPos(von, 1);
}

// 4T-001712: Der Quelltext der Zelle an einer logischen Stelle, oder `null`,
// wenn die Tabelle diese Zelle nicht (mehr) hat. Anders als
// `locatePipeCellPosition` klemmt diese Funktion nicht: Eine fehlende Zelle ist
// hier eine Antwort. Gebraucht fuer die Frage, ob eine Eingabe in eine
// inzwischen von anderer Seite geaenderte Tabelle noch an ihre Zelle darf.
export function zellTextAn(zeilen, pos) {
  const modell = parsePipeTable(zeilen);
  if (!modell || !pos || !(pos.col >= 0 && pos.col < modell.columnCount)) return null;
  if (pos.rowKind === 'header') return modell.header[pos.col];
  const zeile = modell.rows[pos.rowIndex];
  return zeile ? zeile[pos.col] : null;
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
// **Am Ende der Tabelle liefert der Sprung `null`**, auch in Richtung `vor`.
// Diese Funktion bleibt reine Navigation. Dass der Tabulator dort seit 4T-001711
// (Epic 3E-000300, Entscheidung E1) eine neue Zeile anlegt wie der Zellsprung im
// Quelltext (`handleTableTab`, editor-keymaps.js), entscheidet
// `legtTabulatorZeileAn` unten; die Zeile selbst baut `neueZeileAmEnde`.
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

// 4T-001711 (Epic 3E-000300, E1): Legt dieser Tastendruck eine neue Zeile an?
// Genau dann, wenn der Tabulator vorwaerts gedrueckt wird und es keine naechste
// Zelle mehr gibt — also in der letzten Zelle der letzten Zeile, bei einer
// Tabelle nur mit Kopfzeile in deren letzter Zelle (AK9). Rueckwaerts entsteht
// nie eine Zeile (AK5), und die Pfeiltaste rechts am Ende der letzten Zelle
// traegt zwar dieselbe Richtung `vor`, legt aber keine an.
export function legtTabulatorZeileAn(masse, pos, taste, richtung) {
  if (taste !== 'Tab' || richtung !== 'vor') return false;
  return nachbarZelle(masse, pos, richtung) === null;
}

// 4T-001711: Die neue leere Zeile am Tabellenende. `blockText` ist der Text des
// Blocks, wie er nach einer etwaigen Zell-Uebernahme dasteht, `spalten` die
// Spaltenzahl der Tabelle. Geliefert werden der einzufuegende Text — er kommt
// hinter die letzte Zeile, also an das Ende des Blocks — und die Stelle der
// ersten Zelle der neuen Zeile relativ zum Block-Anfang. Die Zeile hat dieselbe
// Form wie beim Zellsprung im Quelltext (`buildEmptyTableRow`), damit beide
// Ansichten denselben Quelltext erzeugen (AK2, AK8).
export function neueZeileAmEnde(blockText, spalten) {
  const einfuegen = '\n' + buildEmptyTableRow(Math.max(1, spalten));
  const zeilen = (String(blockText) + einfuegen).split('\n');
  const modell = parsePipeTable(zeilen);
  const ziel = { rowKind: 'body', rowIndex: modell.rows.length - 1, col: 0 };
  const stelle = locatePipeCellPosition(zeilen, modell, ziel);
  return { einfuegen, zielOffset: stelle.offset, ziel };
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
