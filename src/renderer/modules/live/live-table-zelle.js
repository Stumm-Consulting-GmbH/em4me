// 4T-001345 (Epic 3E-000239): Zell-Eingabe in der gerenderten Pipe-Tabelle der
// Live-Ansicht. Seit der Aufklapp-Ausnahme (Entscheidung E2, live-block-field.js)
// bleibt die Tabelle stehen, waehrend die Schreibmarke in ihr steht; ohne
// Eingabe-Weg waere sie damit unbrauchbar.
//
// **Architektur — uebernommen vom Zell-Editor der Datentabellen**
// (`perspective-datatable-editor.js`), Entscheidung des Product Owners vom
// 2026-09-04. Der Quelltext bleibt die eine Quelle (Entscheidung E1): Die
// bearbeitete Zelle wird zu einem Eingabefeld, und die Uebernahme schreibt als
// Editor-Transaktion in das Dokument zurueck. Aenderungs-Zustand, Undo und Redo,
// Speichern und der Neuaufbau der Anzeige laufen damit ueber die vorhandenen
// Wege; eine zweite Datenhaltung fuer die Tabelle entsteht nicht.
//
// **Der Abgleich vor jeder Uebernahme** ist derselbe Schutz wie dort: Der Block
// wird im AKTUELLEN Dokument an seiner Stelle gelesen und sein Text gegen den
// Stand beim Oeffnen gehalten; bei Abweichung wird nie falsch geschrieben.
//
// **4T-001712 (Epic 3E-000300): Keine Eingabe geht mehr verloren.** Die Stelle
// des Blocks ist seither ein Dokument-Anker statt des Anzeige-Knotens (Grund in
// `blockAmAnker`, live-table-zell-kern.js), und die Wege, auf denen das Dokument
// den Editor verlaesst oder gelesen wird, uebernehmen die offene Eingabe vorher
// (`uebernimmOffeneZellEingabe`). Kann eine Uebernahme trotzdem nicht erfolgen,
// weil die Tabelle von anderer Seite geaendert wurde, bleibt die Bearbeitung
// mit dem Text offen, statt ihn zu verwerfen; Escape bleibt der eine Weg, eine
// Eingabe absichtlich zu verwerfen.
//
// **Geschrieben wird nur die Zelle**, nicht die ganze Tabelle (Entscheidung des
// Product Owners vom 2026-09-04). Ersetzt wird genau der Inhalts-Bereich der
// bearbeiteten Zelle; der uebrige Quelltext bleibt Zeichen fuer Zeichen
// unangetastet. Der Serialisierer aus `table-edit.js` bleibt den
// Struktur-Operationen des Kontextmenues vorbehalten, wo das Neusetzen der
// ganzen Tabelle die dokumentierte Wirkung ist (Epic 3E-000109).
'use strict';

import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

import { locatePipeCellPosition, parsePipeTable } from '../../../shared/markdown/table-edit.js';
import {
  ankerNachAenderung,
  blockAmAnker,
  blockImDokument,
  blockTextNachUebernahme,
  legtTabulatorZeileAn,
  maskiereZellText,
  nachbarZelle,
  neueZeileAmEnde,
  tabellenMasse,
  zellBereich,
  zellePosZuDokumentStelle,
  zellTextAn,
} from './live-table-zell-kern.js';
// 4T-001713 (Epic 3E-000300): die Vorschlagsliste am Eingabefeld der Zelle.
import {
  attachCellSuggestions,
  closeCellSuggestions,
  handleCellSuggestionKey,
} from './live-table-suggestions.js';
// 4T-002048: Anker-Zeilen am Tabellenende gehören nicht zur Tabelle.
import { tabelleOhneAnkerZeilen } from './live-block-anker.js';

// Genau eine offene Zell-Bearbeitung app-weit (Muster des Datatable-Editors).
let offeneBearbeitung = null;

// --- Kontext und Block-Zuordnung --------------------------------------------

// Der Editor hinter einem Widget-Container, samt der Frage, ob in ihm
// geschrieben werden darf. `null`, wenn der Container in keinem Editor haengt —
// so bleiben Lese-Ansicht und Render-Pane strukturell aussen vor.
export function editorKontext(container) {
  const editorEl = container && container.closest ? container.closest('.cm-editor') : null;
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  if (!view) return null;
  // Ein einziges Kriterium, und es traegt beide Faelle: Der Editor ausserhalb
  // des Bearbeiten-Modus ist schreibgeschuetzt, und Handbuch-Tabs sind es
  // dauerhaft — `toggleEditMode` (views.js) laesst sie gar nicht erst in den
  // Bearbeiten-Modus. Ueber den Tab-Zustand zu gehen, brauchte einen Import
  // von `app-state` und `editor` und zoege dieses Modul in die grosse
  // Import-Zyklen-Komponente des Renderers hinein (Waechter
  // `ordner-import-zyklen`); der Zustand des Editors sagt dasselbe.
  const bearbeitbar = !view.state.readOnly;
  return { view, bearbeitbar };
}

// --- Wiederfinden nach einem Widget-Neubau -----------------------------------
//
// Zwischen dem Klick und dem Oeffnen der Zelle kann das Live-Feld seine
// Dekorationen neu gebaut haben; das Widget traegt dann ein frisches DOM, und
// der angeklickte Knoten haengt nicht mehr im Baum. Gemessen am 2026-09-04 beim
// allerersten Klick eines Dokuments: Die unberuehrte Anfangs-Selektion ist eine
// eigene Flanke der Rebuild-Signatur (4T-000283), also rebaut genau der erste
// Klick immer. Wiedergefunden wird ueber die Dokument-Position des Blocks und
// die logische Zell-Position — beide ueberleben den Neubau, DOM-Knoten nicht.
// Muster: relocateContainer/focusCellAfterUpdate des Datatable-Editors.

export function findeContainer(view, blockPos) {
  const kaesten = view.dom ? view.dom.querySelectorAll('.cm-live-block') : [];
  for (const kasten of kaesten) {
    let pos;
    try {
      pos = view.posAtDOM(kasten);
    } catch {
      continue;
    }
    if (pos === blockPos) return kasten;
  }
  return null;
}

export function findeZelle(container, pos) {
  const tabelle = container ? container.querySelector('table') : null;
  if (!tabelle) return null;
  if (pos.rowKind === 'header') return tabelle.querySelectorAll('thead th')[pos.col] || null;
  const zeile = tabelle.querySelectorAll('tbody tr')[pos.rowIndex];
  return zeile ? zeile.querySelectorAll('td')[pos.col] || null : null;
}

// Der Hinweis in der Statusleiste kommt ueber einen Laufzeit-Import: Ein
// statischer Bezug auf `views.js` zoege dieses Modul in die grosse
// Import-Zyklen-Komponente des Renderers (Waechter `ordner-import-zyklen`,
// der dynamische Zugriff ist dort der vorgesehene Ausweg). Ein Fehlschlag
// bleibt folgenlos: Der Hinweis ist Beiwerk, das Verwerfen der Aenderung ist
// die eigentliche Wirkung und schon geschehen.
function zeigeHinweis(schluessel, duration = 2500) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(schluessel, { error: true, duration }))
    .catch(() => {});
}

function hinweisVerworfen() {
  zeigeHinweis('tableEdit.hint.notFound');
}

// --- Uebernahme nach einer Aenderung von anderer Seite (4T-001712) ----------
//
// Waehrend das Eingabefeld offen ist, kann das Dokument sich von anderer Seite
// aendern — ein Befehl ueber das Anwendungs-Menue, ein Neuladen der Datei. Der
// Abgleich gegen den Stand beim Oeffnen schlaegt dann fehl. Frueher war das der
// Weg, auf dem die Eingabe verworfen wurde; jetzt gilt eine Stufung:
//
// 1. Traegt die Zelle an derselben logischen Stelle noch den Text, mit dem die
//    Bearbeitung begann, betrifft die fremde Aenderung eine andere Stelle. Die
//    Eingabe wird in den aktuellen Stand geschrieben, die fremde Aenderung
//    bleibt unberuehrt.
// 2. Ist die Zelle selbst geaendert, wird nicht geschrieben — sonst ueberschriebe
//    die Eingabe unbemerkt eine andere. Die Bearbeitung bleibt mit dem Text
//    offen und sichtbar in der Zelle, der Hinweis nennt die beiden Wege:
//    Eingabetaste uebernimmt die Eingabe in den jetzigen Stand, Escape verwirft
//    sie.
// 3. Steht an der Stelle keine Tabelle mehr, gibt es keine Zelle, in der der
//    Text zu zeigen oder zu schreiben waere. Das ist der einzige Fall, in dem
//    eine Eingabe nicht erhalten bleibt, und er meldet sich mit einem Hinweis.

// Der Quelltext der Tabelle, die an der Stelle `von` beginnt — aus dem
// Syntaxbaum, also unabhaengig davon, ob ihr Widget gerade angezeigt wird.
// 4T-002048: ohne die Anker-Zeilen am Ende, wie das Widget sie zeigt; sonst
// spränge der Tabulator in eine nicht angezeigte Zeile, und eine neue Zeile
// am Ende käme hinter die Anker-Zeile. Exportiert für den Prüffall.
export function tabellenQuelleAm(state, von) {
  let quelle = null;
  syntaxTree(state).iterate({
    from: von,
    to: von,
    enter(node) {
      if (quelle === null && node.name === 'Table' && node.from === von) {
        quelle = tabelleOhneAnkerZeilen(state.doc.sliceString(node.from, node.to));
      }
      return quelle === null;
    },
  });
  return quelle;
}

// Der Block, in den eine Uebernahme schreibt (Stufe 1), oder `null`.
function blockFuerUebernahme(bearbeitung) {
  const { view, blockVon, source, pos, quellText } = bearbeitung;
  const block = blockAmAnker(view.state.doc, blockVon, source);
  if (block) return block;
  const aktuell = tabellenQuelleAm(view.state, blockVon);
  if (aktuell === null || zellTextAn(aktuell.split('\n'), pos) !== quellText) return null;
  bearbeitung.source = aktuell;
  return blockAmAnker(view.state.doc, blockVon, aktuell);
}

// Stufen 2 und 3. Liefert `'offen'`, wenn die Bearbeitung offen bleibt.
function halteBearbeitungOffen(bearbeitung) {
  const aktuell = tabellenQuelleAm(bearbeitung.view.state, bearbeitung.blockVon);
  const zellText = aktuell === null ? null : zellTextAn(aktuell.split('\n'), bearbeitung.pos);
  // Hat der Neuaufbau des Widgets das Eingabefeld ausgehaengt, kommt es in die
  // Zelle an derselben logischen Stelle des neuen Widgets zurueck.
  if (zellText !== null && !bearbeitung.eingabe.isConnected) {
    const container = findeContainer(bearbeitung.view, bearbeitung.blockVon);
    const zelle = container ? findeZelle(container, bearbeitung.pos) : null;
    if (zelle) {
      bearbeitung.urspruenglich = zelle.innerHTML;
      bearbeitung.container = container;
      bearbeitung.zelle = zelle;
      zelle.textContent = '';
      zelle.appendChild(bearbeitung.eingabe);
      zelle.classList.add('cm-live-tabelle-bearbeitet');
    }
  }
  if (zellText === null || !bearbeitung.eingabe.isConnected) {
    hinweisVerworfen();
    return null;
  }
  // Der Stand wird auf den jetzigen gesetzt: Die naechste Uebernahme — ein
  // bewusster zweiter Handgriff nach dem Hinweis — schreibt in die Zelle, die
  // der Anwender mit seiner Eingabe darin vor sich sieht.
  bearbeitung.source = aktuell;
  bearbeitung.quellText = zellText;
  offeneBearbeitung = bearbeitung;
  bearbeitung.eingabe.focus();
  zeigeHinweis('tableEdit.hint.keptOpen', 6000);
  return 'offen';
}

// --- Zell-Bearbeitung --------------------------------------------------------

// 4T-001713: Wo die Vorschlagsliste ihren gedachten Quelltext-Stand ansetzt —
// Editor, Inhalts-Bereich der offenen Zelle im Dokument und das Zell-Element.
// Gelesen über den Dokument-Anker wie die Übernahme; steht die Tabelle dort
// nicht mehr unverändert, gibt es keine Vorschläge statt falscher.
function vorschlagsLage() {
  const bearbeitung = offeneBearbeitung;
  if (!bearbeitung) return null;
  const block = blockAmAnker(bearbeitung.view.state.doc, bearbeitung.blockVon, bearbeitung.source);
  const modell = block ? parsePipeTable(block.zeilen) : null;
  if (!modell) return null;
  const bereich = zellBereich(block, modell, bearbeitung.pos);
  return {
    view: bearbeitung.view,
    range: { from: bereich.from, to: bereich.to },
    cell: bearbeitung.zelle,
  };
}

// Ist eine Bearbeitung offen, und gehoert das Ereignis zu ihrem Eingabefeld?
// Der Klick-Pfad am Container darf sie dann nicht erneut oeffnen.
export function ereignisGehoertZurBearbeitung(ziel) {
  return !!(offeneBearbeitung && ziel && ziel.closest && ziel.closest('.cm-live-tabelle-eingabe'));
}

// Oeffnet die Zelle zur Eingabe. `pos` ist die logische Zell-Position aus dem
// gerenderten Baum, `source` der Quelltext des Blocks.
export function oeffneZellBearbeitung({ view, container, source, zelle, pos, offset = null }) {
  if (offeneBearbeitung) {
    if (offeneBearbeitung.zelle === zelle) return;
    uebernehmeBearbeitung();
    // 4T-001712: Blieb die bisherige Bearbeitung offen, weil sie sich nicht
    // uebernehmen liess, oeffnet sich keine zweite daneben.
    if (offeneBearbeitung) return;
    // 4T-001969: Die Uebernahme hat das Widget neu gebaut, der angeklickte
    // Zell-Knoten ist nicht mehr im Dokument. Die Schreibmarke steht aber in der
    // gemeinten Zelle, durch die Uebernahme fortgeschrieben; also im naechsten
    // Frame von ihr aus neu suchen, statt still abzubrechen. Kein Kreislauf: Beim
    // zweiten Anlauf ist keine Bearbeitung mehr offen. Bis dahin blieb die Zelle
    // zu, sobald das Oeffnen vor der aufgeschobenen Uebernahme lief — auf dem
    // Stamm-Rechner stets, auf anderen Rechnern nie (Befund TU-03).
    if (!zelle.isConnected) {
      requestAnimationFrame(() =>
        oeffneZelleFuerDokumentStelle(view, view.state.selection.main.head),
      );
      return;
    }
  }
  const block = blockImDokument(view, container, source);
  if (!block) {
    hinweisVerworfen();
    return;
  }
  const modell = parsePipeTable(block.zeilen);
  // Strukturell fehlerhafte Tabelle: nicht bearbeiten, sondern dem
  // Quelltext-Weg ueberlassen (Entscheidung E4 des Epics).
  if (!modell) {
    zeigeHinweis('tableEdit.hint.blocked');
    return;
  }
  const stelle = locatePipeCellPosition(block.zeilen, modell, pos);
  const zeilenText = block.zeilen[stelle.line] || '';
  const quellText = zeilenText.slice(stelle.contentStart, stelle.contentEnd);

  const eingabe = document.createElement('input');
  eingabe.type = 'text';
  eingabe.className = 'cm-live-tabelle-eingabe';
  eingabe.value = quellText;
  // AK3, ohne Layout-Sprung: Das Eingabefeld bekommt die Breite, welche die
  // Zelle vor ihm hatte. Ohne diese Festlegung setzt der Browser seine eigene
  // Vorgabebreite an (rund 150 px bei size=20), und die Spalte ruckt beim
  // Oeffnen auseinander — gemessen am 2026-09-04: 124 px Tabellenbreite vor
  // dem Klick, 266 px danach. `size = 1` nimmt der Vorgabe zusaetzlich ihre
  // Wirkung auf die Mindestbreite der Spalte.
  // Gemessen wird die INNERE Breite der Zelle (Inhalt samt Polster, ohne
  // Rahmen). Genau sie fuellt das Eingabefeld aus, sobald das Polster beim
  // Bearbeiten auf null geht; die aeussere Breite der Zelle bleibt damit, was
  // sie war. `clientWidth` rundet auf ganze Pixel, die Tabelle wandert also um
  // Bruchteile eines Pixels — sichtbar ist das nicht, und die
  // Fliesskomma-Werte des Stils taugen hier nicht als Ersatz: `width` liefert
  // fuer eine Tabellenzelle nicht die Breite, die das Tabellen-Layout ihr
  // zuweist (gemessen am 2026-09-04: 25 px Fehlbetrag).
  eingabe.size = 1;
  eingabe.style.width = zelle.clientWidth + 'px';
  const urspruenglich = zelle.innerHTML;
  zelle.textContent = '';
  zelle.appendChild(eingabe);
  zelle.classList.add('cm-live-tabelle-bearbeitet');
  // 4T-001712: `blockVon` ist der Dokument-Anker des Blocks; das
  // Beobachter-Stueck unten schreibt ihn durch jede Aenderung fort.
  const blockVon = block.from;
  offeneBearbeitung = {
    view,
    container,
    source,
    zelle,
    eingabe,
    urspruenglich,
    pos,
    quellText,
    blockVon,
  };
  eingabe.addEventListener('keydown', aufTastendruck);
  attachCellSuggestions(eingabe, vorschlagsLage);
  // Fokus-Verlust uebernimmt — aber erst im naechsten Zyklus und nur, wenn
  // dieselbe Bearbeitung noch offen ist. Ohne den Aufschub kaeme der blur des
  // Fokus-Wechsels beim Oeffnen der Zelle der Bearbeitung zuvor und schloesse
  // sie sofort wieder (Muster onRootBlur des Datatable-Editors).
  //
  // 4T-001712: Der Aufschub war die Stelle, an der die Eingabe verloren ging —
  // zwischen blur und Uebernahme baut der Editor das Widget neu. Seit die
  // Uebernahme ihren Block ueber den Dokument-Anker findet, uebersteht sie
  // jeden solchen Neuaufbau; der Aufschub bleibt deshalb, wie er ist. Die Wege,
  // die das Dokument ohne blur verlassen oder lesen (Speichern, Schliessen,
  // Dokument- und Ansichts-Wechsel), rufen `uebernimmOffeneZellEingabe`.
  eingabe.addEventListener('blur', () => {
    const meine = offeneBearbeitung;
    setTimeout(() => {
      if (offeneBearbeitung !== meine) return;
      uebernehmeBearbeitung();
    }, 0);
  });
  eingabe.focus();
  // Die Schreibmarke landet dort, wo geklickt wurde — nicht vor einer
  // vollstaendigen Auswahl, wie sie ein Wert-Editor setzen wuerde. Der
  // Datatable-Editor waehlt alles aus, weil dort ein Wert ersetzt wird; hier
  // wird Text bearbeitet, und AK3 aus 4T-001344 verlangt die angeklickte
  // Stelle. Ohne Klick-Offset (Tastatur-Weg) steht sie am Zell-Ende.
  const marke = offset == null ? quellText.length : Math.max(0, Math.min(offset, quellText.length));
  eingabe.setSelectionRange(marke, marke);
}

// 4T-001346: Welche Richtung meint dieser Tastendruck? `null`, wenn der
// Tastendruck im Eingabefeld bleibt.
//
// Die Pfeiltasten links und rechts wirken erst am RAND des Zell-Textes; davor
// bewegen sie die Schreibmarke im Feld, wie es jedes Textfeld tut (AK5). Hoch
// und runter haben in einem einzeiligen Feld keine eigene Bedeutung und
// springen deshalb immer. Ein Tastendruck mit gezogener Auswahl bewegt zuerst
// die Auswahl.
function richtungDesTastendrucks(event, eingabe) {
  if (event.key === 'Tab') return event.shiftKey ? 'zurueck' : 'vor';
  if (event.key === 'ArrowUp') return 'hoch';
  if (event.key === 'ArrowDown') return 'runter';
  const auswahl = eingabe.selectionStart !== eingabe.selectionEnd;
  if (auswahl) return null;
  if (event.key === 'ArrowLeft' && eingabe.selectionStart === 0) return 'zurueck';
  if (event.key === 'ArrowRight' && eingabe.selectionStart === String(eingabe.value).length)
    return 'vor';
  return null;
}

// 4T-001861: Das gemeinsame Kontextmenue des Fensters, gelesen am Element statt
// ueber `app-state` — derselbe Grund wie beim Hinweis oben: kein statischer
// Bezug in die grosse Import-Zyklen-Komponente.
function kontextmenueOffen() {
  const menue = document.getElementById('context-menu');
  return !!(menue && !menue.hidden);
}

function aufTastendruck(event) {
  if (!offeneBearbeitung) return;
  // 4T-001713: Bei offener Vorschlagsliste gehören ihr Pfeile, Bild-Tasten,
  // Eingabetaste und Escape; die Zell-Bedienung sieht sie dann nicht.
  if (handleCellSuggestionKey(event)) return;
  if (event.key === 'Escape') {
    // 4T-001861: Steht nach einem Rechtsklick in die Zelle das Kontextmenue
    // offen, schliesst Escape das Menue und laesst die Eingabe stehen. Der
    // Tastendruck geht deshalb unberuehrt an die Escape-Kaskade des Fensters
    // (app-input-bindings.js), statt die Bearbeitung zu verwerfen.
    if (kontextmenueOffen()) return;
    event.preventDefault();
    event.stopPropagation();
    brichBearbeitungAb();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    // Nach einer Uebernahme per Taste gehoert der Fokus zurueck in den Editor;
    // nach einem Fokus-Verlust bleibt er, wo der Anwender hingeklickt hat.
    uebernehmeBearbeitung({ fokusZurueck: true });
    return;
  }
  const richtung = richtungDesTastendrucks(event, offeneBearbeitung.eingabe);
  if (!richtung) return;
  const bearbeitung = offeneBearbeitung;
  const block = blockFuerUebernahme(bearbeitung);
  const modell = block ? parsePipeTable(block.zeilen) : null;
  if (!modell) return;
  const masse = tabellenMasse(modell);
  const ziel = nachbarZelle(masse, bearbeitung.pos, richtung);
  // Am Rand der Tabelle verbraucht der Tabulator den Tastendruck trotzdem — er
  // darf nicht an den Editor durchfallen und dort einruecken. Die Pfeiltasten
  // duerfen am Rand ihre gewohnte Wirkung behalten.
  if (!ziel) {
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      // 4T-001711: Vorwaerts am Tabellenende legt er eine neue Zeile an und
      // oeffnet deren erste Zelle; rueckwaerts bleibt er stehen.
      if (legtTabulatorZeileAn(masse, bearbeitung.pos, event.key, richtung)) {
        uebernehmeBearbeitung({ neueZeile: true });
      }
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  // Der Sprung setzt die Schreibmarke; geoeffnet wird die Ziel-Zelle vom
  // Auswahl-Beobachter, der auch den Klick- und den Pfeiltasten-Weg von aussen
  // bedient. Ein Mechanismus statt dreier.
  const zielRand = richtung === 'zurueck' || richtung === 'hoch' ? 'ende' : 'anfang';
  uebernehmeBearbeitung({ ziel, zielRand });
}

function stelleZelleWiederHer(bearbeitung) {
  // 4T-001713: Mit der Zell-Eingabe endet auch ihre Vorschlagsliste.
  closeCellSuggestions();
  const { zelle, urspruenglich } = bearbeitung;
  if (!zelle.isConnected) return;
  zelle.classList.remove('cm-live-tabelle-bearbeitet');
  zelle.innerHTML = urspruenglich;
}

export function brichBearbeitungAb() {
  if (!offeneBearbeitung) return;
  const bearbeitung = offeneBearbeitung;
  offeneBearbeitung = null;
  stelleZelleWiederHer(bearbeitung);
  bearbeitung.view.focus();
}

export function uebernehmeBearbeitung({
  fokusZurueck = false,
  ziel = null,
  zielRand = 'anfang',
  neueZeile = false,
  bleibOffen = false,
} = {}) {
  if (!offeneBearbeitung) return;
  const bearbeitung = offeneBearbeitung;
  offeneBearbeitung = null;
  const roh = String(bearbeitung.eingabe.value || '');
  const neu = maskiereZellText(roh.trim());
  const unveraendert = neu === bearbeitung.quellText;
  // 4T-001712: Wer nur liest (Speichern), findet ohne Aenderung nichts zu
  // schreiben; die Zelle bleibt dann einfach offen.
  if (unveraendert && bleibOffen) {
    offeneBearbeitung = bearbeitung;
    return;
  }
  if (unveraendert && !ziel && !neueZeile) {
    stelleZelleWiederHer(bearbeitung);
    return;
  }
  // Vor der Uebernahme an der Stelle des Blocks lesen und abgleichen: Zwischen
  // dem Oeffnen der Zelle und jetzt kann das Dokument sich geaendert haben.
  // 4T-001712: ueber den Dokument-Anker, nicht ueber den Widget-Knoten, und bei
  // Abweichung wird die Eingabe nicht verworfen (Stufung oben).
  const block = blockFuerUebernahme(bearbeitung);
  const modell = block ? parsePipeTable(block.zeilen) : null;
  if (!block || !modell) return halteBearbeitungOffen(bearbeitung);
  const bereich = zellBereich(block, modell, bearbeitung.pos);
  const transaktion = {};
  const aenderungen = [];
  if (!unveraendert) aenderungen.push({ from: bereich.from, to: bereich.to, insert: neu });
  if (neueZeile) {
    // 4T-001711: Die neue Zeile geht in DIESELBE Transaktion wie die
    // Uebernahme — ein Rueckgaengig-Schritt fuer beides (AK6). Eingefuegt wird
    // am Ende des Blocks; die Zielstelle rechnet auf dem Block-Text nach der
    // Uebernahme, weil die Transaktion beide Aenderungen zugleich anwendet.
    const textDanach = unveraendert
      ? block.zeilen.join('\n')
      : blockTextNachUebernahme(block, bereich, neu);
    const anlage = neueZeileAmEnde(textDanach, modell.columnCount);
    aenderungen.push({ from: block.to, insert: anlage.einfuegen });
    transaktion.selection = { anchor: block.from + anlage.zielOffset };
    transaktion.scrollIntoView = true;
  }
  if (aenderungen.length > 0) {
    // userEvent-Annotation wie beim Datatable-Editor: Ohne sie verschmilzt die
    // programmatische Transaktion in der Editor-Historie mit dem vorherigen
    // Ereignis, und ein Undo naehme mehr zurueck als diese eine Uebernahme.
    transaktion.changes = aenderungen;
    transaktion.userEvent = 'input';
  }
  if (ziel) {
    const zeilenDanach = unveraendert
      ? block.zeilen
      : blockTextNachUebernahme(block, bereich, neu).split('\n');
    const zielStelle = locatePipeCellPosition(zeilenDanach, modell, ziel);
    // Die Schreibmarke landet dort, wo sie beim Weiterlesen hingehoerte: am
    // Anfang der naechsten Zelle, am Ende der vorigen. Landete sie beim
    // Rueckwaerts-Gehen ebenfalls am Anfang, liefe die Pfeiltaste links nur noch
    // von Zell-Anfang zu Zell-Anfang und erreichte den Text nie (AK5).
    const laenge = zielStelle.contentEnd - zielStelle.contentStart;
    transaktion.selection = {
      anchor: block.from + zielStelle.offset + (zielRand === 'ende' ? laenge : 0),
    };
    transaktion.scrollIntoView = true;
  }
  if (bleibOffen) {
    // 4T-001712: Speichern beendet die Arbeit an der Stelle nicht, wie im
    // Fliesstext. Die Schreibmarke steht danach, wo sie im Feld stand —
    // umgerechnet auf den geschriebenen Text (vorne gekuerzt, Pipes maskiert).
    const vorMarke = roh.slice(0, bearbeitung.eingabe.selectionStart ?? roh.length);
    const marke = Math.min(maskiereZellText(vorMarke.trimStart()).length, neu.length);
    transaktion.selection = { anchor: bereich.from + marke };
  }
  // Die Zelle bekommt ihr Aussehen zurueck, bevor die Transaktion laeuft. Ohne
  // diesen Schritt bliebe das Eingabefeld stehen, wenn die Transaktion keinen
  // Neubau der Dekorationen ausloest — und seit der Tabellen-Ausnahme in der
  // Aktiv-Signatur (4T-001345) tut eine reine Schreibmarken-Bewegung innerhalb
  // der Tabelle genau das nicht mehr. Beim Zellsprung stuenden sonst zwei
  // Zellen zugleich offen.
  stelleZelleWiederHer(bearbeitung);
  bearbeitung.view.dispatch(transaktion);
  if (fokusZurueck && !ziel) bearbeitung.view.focus();
  if (ziel || neueZeile || bleibOffen) {
    // Der Auswahl-Beobachter schweigt bei einer Doc-Aenderung — sonst loeste
    // jede Uebernahme sich selbst erneut aus. Ein Sprung, der zugleich schreibt,
    // oeffnet seine Ziel-Zelle deshalb selbst; ohne Schreiben uebernimmt der
    // Beobachter, und der zweite Aufruf faellt an seiner Gleichheits-Pruefung ab.
    const anker = transaktion.selection.anchor;
    requestAnimationFrame(() => oeffneZelleFuerDokumentStelle(bearbeitung.view, anker));
  }
}

// 4T-001712 (Epic 3E-000300): Uebernimmt eine offene Zell-Eingabe, bevor ein Weg
// das Dokument aus dem Editor nimmt oder liest. Gemessen am 2026-09-24
// (`4T-001710`, Ablaeufe M04, M07, M08): Speichern mit Strg+S verlaesst das
// Feld gar nicht, und Schliessen und Dokument-Wechsel wirken, bevor die
// aufgeschobene Uebernahme laeuft — die Datei wurde ohne die Eingabe
// geschrieben, das Dokument galt beim Schliessen als unveraendert.
//
// Gerufen wird sie am Anfang von Speichern, Schliessen, Aktivieren eines
// anderen Dokuments, Wechsel der Ansicht und des Bearbeiten-Modus sowie beim
// Schliessen des Fensters — also VOR der Umstellung des aktiven Reiters, denn
// der Editor schreibt jede Aenderung in den gerade aktiven Reiter.
// `bleibOffen` nutzt das Speichern: Die Zelle ist danach wieder offen.
//
// Rueckgabe `false`, wenn die Eingabe nicht uebernommen werden konnte und die
// Bearbeitung deshalb offen bleibt (Stufe 2 oben). Wer das Dokument aus dem
// Editor nimmt, bricht dann ab: Sonst ginge mit dem Dokument auch die Eingabe.
export function uebernimmOffeneZellEingabe({ bleibOffen = false } = {}) {
  if (!offeneBearbeitung) return true;
  return uebernehmeBearbeitung({ bleibOffen }) !== 'offen';
}

// --- Der eine Weg in eine Zelle (4T-001346) ----------------------------------
//
// **Warum ein Beobachter der Auswahl und nicht drei Klick-Pfade.** In die Zelle
// fuehren drei Wege: der Klick, der Zellsprung und die Pfeiltaste von ausserhalb
// der Tabelle. Alle drei enden darin, dass die Schreibmarke an einer Stelle des
// Tabellen-Quelltextes steht — genau das ist die gemeinsame Bedingung. Der
// Beobachter oeffnet daraufhin die Zelle, in der die Marke steht; die drei Wege
// muessen nichts weiter tun als die Marke zu setzen.
//
// Der Aufschub in den naechsten Frame ist noetig, weil die Auswahl-Aenderung die
// Live-Dekorationen neu bauen kann und der Zell-Knoten dabei ausgetauscht wird.

// Oeffnet die Zelle, in der die Stelle `kopf` des Dokuments liegt — falls sie in
// einem Tabellen-Widget liegt und dort geschrieben werden darf.
export function oeffneZelleFuerDokumentStelle(view, kopf) {
  if (!view || !view.dom || view.state.readOnly) return;
  const kaesten = view.dom.querySelectorAll('.cm-live-block[data-tabellen-laenge]');
  for (const container of kaesten) {
    const laenge = Number(container.dataset.tabellenLaenge);
    if (!Number.isFinite(laenge)) continue;
    let von;
    try {
      von = view.posAtDOM(container);
    } catch {
      continue;
    }
    if (typeof von !== 'number' || kopf < von || kopf > von + laenge) continue;
    const source = view.state.doc.sliceString(von, von + laenge);
    const zeilen = source.split('\n');
    const modell = parsePipeTable(zeilen);
    if (!modell) return;
    const treffer = zellePosZuDokumentStelle(zeilen, modell, kopf - von);
    if (!treffer) return;
    if (offeneBearbeitung && offeneBearbeitung.container === container) {
      const offen = offeneBearbeitung.pos;
      if (
        offen.rowKind === treffer.pos.rowKind &&
        offen.rowIndex === treffer.pos.rowIndex &&
        offen.col === treffer.pos.col
      )
        return;
    }
    const zelle = findeZelle(container, treffer.pos);
    if (!zelle) return;
    oeffneZellBearbeitung({
      view,
      container,
      source,
      zelle,
      pos: treffer.pos,
      offset: treffer.offset,
    });
    return;
  }
}

// Beobachter der Auswahl. Bei einer Doc-Aenderung bleibt er still: Die
// Uebernahme einer Zelle aendert das Dokument und wuerde sich sonst selbst
// erneut ausloesen.
//
// 4T-001712: Derselbe Beobachter schreibt den Dokument-Anker einer offenen
// Bearbeitung durch jede Aenderung fort, damit die Uebernahme ihren Block auch
// dann findet, wenn davor im Dokument etwas eingefuegt oder entfernt wurde.
export const liveTabellenZellFokus = EditorView.updateListener.of((update) => {
  if (update.docChanged && offeneBearbeitung && offeneBearbeitung.view === update.view) {
    offeneBearbeitung.blockVon = ankerNachAenderung(offeneBearbeitung.blockVon, update.changes);
  }
  if (!update.selectionSet || update.docChanged) return;
  const view = update.view;
  const kopf = view.state.selection.main.head;
  if (!view.state.selection.main.empty) return;
  requestAnimationFrame(() => oeffneZelleFuerDokumentStelle(view, kopf));
});
