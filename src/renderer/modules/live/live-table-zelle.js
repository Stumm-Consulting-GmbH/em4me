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
// wird im AKTUELLEN Dokument neu lokalisiert (`posAtDOM`) und sein Text gegen den
// Stand gehalten, mit dem das Widget gebaut wurde. Bei Abweichung — veraltetes
// DOM, zwischenzeitliche Aenderung von anderer Stelle — wird die Aenderung
// verworfen und ein Statusleisten-Hinweis gezeigt, nie falsch geschrieben.
//
// **Geschrieben wird nur die Zelle**, nicht die ganze Tabelle (Entscheidung des
// Product Owners vom 2026-09-04). Ersetzt wird genau der Inhalts-Bereich der
// bearbeiteten Zelle; der uebrige Quelltext bleibt Zeichen fuer Zeichen
// unangetastet. Der Serialisierer aus `table-edit.js` bleibt den
// Struktur-Operationen des Kontextmenues vorbehalten, wo das Neusetzen der
// ganzen Tabelle die dokumentierte Wirkung ist (Epic 3E-000109).
'use strict';

import { EditorView } from '@codemirror/view';

import { locatePipeCellPosition, parsePipeTable } from '../../../shared/markdown/table-edit.js';
import {
  blockImDokument,
  blockTextNachUebernahme,
  maskiereZellText,
  nachbarZelle,
  tabellenMasse,
  zellBereich,
  zellePosZuDokumentStelle,
} from './live-table-zell-kern.js';

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
function zeigeHinweis(schluessel) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(schluessel, { error: true, duration: 2500 }))
    .catch(() => {});
}

function hinweisVerworfen() {
  zeigeHinweis('tableEdit.hint.notFound');
}

// --- Zell-Bearbeitung --------------------------------------------------------

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
    if (!zelle.isConnected) return;
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
  offeneBearbeitung = { view, container, source, zelle, eingabe, urspruenglich, pos, quellText };
  eingabe.addEventListener('keydown', aufTastendruck);
  // Fokus-Verlust uebernimmt — aber erst im naechsten Zyklus und nur, wenn
  // dieselbe Bearbeitung noch offen ist. Ohne den Aufschub kaeme der blur des
  // Fokus-Wechsels beim Oeffnen der Zelle der Bearbeitung zuvor und schloesse
  // sie sofort wieder (Muster onRootBlur des Datatable-Editors).
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

function aufTastendruck(event) {
  if (!offeneBearbeitung) return;
  if (event.key === 'Escape') {
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
  const block = blockImDokument(bearbeitung.view, bearbeitung.container, bearbeitung.source);
  const modell = block ? parsePipeTable(block.zeilen) : null;
  if (!modell) return;
  const ziel = nachbarZelle(tabellenMasse(modell), bearbeitung.pos, richtung);
  // Am Rand der Tabelle verbraucht der Tabulator den Tastendruck trotzdem — er
  // darf nicht an den Editor durchfallen und dort einruecken. Die Pfeiltasten
  // duerfen am Rand ihre gewohnte Wirkung behalten.
  if (!ziel) {
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
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
} = {}) {
  if (!offeneBearbeitung) return;
  const bearbeitung = offeneBearbeitung;
  offeneBearbeitung = null;
  const neu = maskiereZellText(String(bearbeitung.eingabe.value || '').trim());
  const unveraendert = neu === bearbeitung.quellText;
  if (unveraendert && !ziel) {
    stelleZelleWiederHer(bearbeitung);
    return;
  }
  // Vor der Uebernahme neu lokalisieren und abgleichen: Zwischen dem Oeffnen
  // der Zelle und jetzt kann das Dokument sich geaendert haben.
  const block = blockImDokument(bearbeitung.view, bearbeitung.container, bearbeitung.source);
  const modell = block ? parsePipeTable(block.zeilen) : null;
  if (!block || !modell) {
    stelleZelleWiederHer(bearbeitung);
    hinweisVerworfen();
    return;
  }
  const bereich = zellBereich(block, modell, bearbeitung.pos);
  const transaktion = {};
  if (!unveraendert) {
    // userEvent-Annotation wie beim Datatable-Editor: Ohne sie verschmilzt die
    // programmatische Transaktion in der Editor-Historie mit dem vorherigen
    // Ereignis, und ein Undo naehme mehr zurueck als diese eine Uebernahme.
    transaktion.changes = { from: bereich.from, to: bereich.to, insert: neu };
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
  // Die Zelle bekommt ihr Aussehen zurueck, bevor die Transaktion laeuft. Ohne
  // diesen Schritt bliebe das Eingabefeld stehen, wenn die Transaktion keinen
  // Neubau der Dekorationen ausloest — und seit der Tabellen-Ausnahme in der
  // Aktiv-Signatur (4T-001345) tut eine reine Schreibmarken-Bewegung innerhalb
  // der Tabelle genau das nicht mehr. Beim Zellsprung stuenden sonst zwei
  // Zellen zugleich offen.
  stelleZelleWiederHer(bearbeitung);
  bearbeitung.view.dispatch(transaktion);
  if (fokusZurueck && !ziel) bearbeitung.view.focus();
  if (ziel) {
    // Der Auswahl-Beobachter schweigt bei einer Doc-Aenderung — sonst loeste
    // jede Uebernahme sich selbst erneut aus. Ein Sprung, der zugleich schreibt,
    // oeffnet seine Ziel-Zelle deshalb selbst; ohne Schreiben uebernimmt der
    // Beobachter, und der zweite Aufruf faellt an seiner Gleichheits-Pruefung ab.
    const anker = transaktion.selection.anchor;
    requestAnimationFrame(() => oeffneZelleFuerDokumentStelle(bearbeitung.view, anker));
  }
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
export const liveTabellenZellFokus = EditorView.updateListener.of((update) => {
  if (!update.selectionSet || update.docChanged) return;
  const view = update.view;
  const kopf = view.state.selection.main.head;
  if (!view.state.selection.main.empty) return;
  requestAnimationFrame(() => oeffneZelleFuerDokumentStelle(view, kopf));
});
