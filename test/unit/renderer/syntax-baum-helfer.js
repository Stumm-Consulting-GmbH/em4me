// 4T-002883 (Epic 3E-000452): Warten auf den vollständigen Syntax-Baum, bevor
// ein Prüffall einen Block der Live-Ansicht im Editor abfragt.
//
// **Warum.** Die Blöcke der Live-Ansicht (Diagramm, Datentabelle, Tabelle)
// entstehen aus dem Syntax-Baum des Editors. Der Zerleger arbeitet mit einem
// Zeitbudget: Beim Anlegen des Zustands und nach jeder Änderung des Dokuments
// zerlegt er höchstens 20 Millisekunden lang (`Work.Apply` in
// @codemirror/language) und liefert den Rest im Nachlauf. Das Programm baut
// seine Blöcke beim Nachlauf neu, dort fehlt also nichts. Ein Prüffall, der
// unmittelbar nach dem Aufbau oder nach einer Änderung einen Block abfragt,
// findet ihn dagegen nicht, wenn das Budget nicht gereicht hat; unter Last
// geschieht das, und der Fall scheitert mit einem Zugriff auf `null`. So am
// 2026-11-21 in einem vollen Lauf im Linux-Container.
//
// **Wie.** `baumVollstaendig` zerlegt das ganze Dokument zu Ende und reicht
// den neuen Baum per Transaktion in die Ansicht (`forceParsing`; das Muster
// `ensureSyntaxTree` der Prüfdateien ohne Ansicht genügt hier nicht, weil die
// Ansicht den neuen Baum erst mit einer Transaktion sieht). `liveInhalt`
// liefert den Inhalts-Knoten der Ansicht nach diesem Warten und ist der eine
// Zugang für Abfragen nach Live-Blöcken: Er deckt auch den Fall ab, dass ein
// Prüffall das Dokument geändert hat.
//
// **Zustand ohne Ansicht (4T-002941).** `zustandMitVollemBaum` zerlegt zu Ende
// und liefert einen NEUEN Zustand. `ensureSyntaxTree` allein genügt nicht,
// auch nicht in einer Schleife: Es bringt den Zerleger zu Ende und gibt den
// vollständigen Baum zurück, der Zustand selbst behält aber den Baum von
// seiner Anlage (`LanguageState.tree`), und genau den liest das Programm über
// `syntaxTree(state)`. Erst eine Transaktion übernimmt den neuen Baum. War das
// Budget bei der Anlage erschöpft, las ein Prüffall nach dem bisherigen
// Muster also weiter den unvollständigen Baum; aufgefallen ist das nie, weil
// der erste Durchlauf bei kurzen Dokumenten ohne Last fertig wird.
//
// Ein Editor ohne Sprache (etwa das Notiz-Feld) hat keinen Syntax-Baum; für
// ihn kehren beide Hilfen sofort zurück.
import {
  ensureSyntaxTree,
  forceParsing,
  language,
  syntaxTree,
  syntaxTreeAvailable,
} from '@codemirror/language';

// Obergrenze der Durchläufe; jeder zerlegt bis zu 50 Millisekunden lang.
const HOECHSTENS = 400;

const ohneSprache = (state) => !state.facet(language);

function werfeUnvollstaendig(state) {
  throw new Error(
    `syntax-baum-helfer: Syntax-Baum nach ${HOECHSTENS} Durchläufen nicht vollständig ` +
      `(Dokument mit ${state.doc.length} Zeichen, Baum bis ${syntaxTree(state).length})`,
  );
}

export function baumVollstaendig(view) {
  if (ohneSprache(view.state)) return view;
  let durchlauf = 0;
  while (!forceParsing(view, view.state.doc.length, 50) && durchlauf++ < HOECHSTENS) {
    /* weiter zerlegen */
  }
  // Nicht still aufgeben: Ein unvollständiger Baum zeigte sich sonst erst
  // später als Zugriff auf `null`, ohne seine Ursache.
  if (!syntaxTreeAvailable(view.state, view.state.doc.length)) werfeUnvollstaendig(view.state);
  return view;
}

export function liveInhalt(view) {
  return baumVollstaendig(view).contentDOM;
}

export function zustandMitVollemBaum(state) {
  if (ohneSprache(state)) return state;
  let durchlauf = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && durchlauf++ < HOECHSTENS) {
    /* weiter zerlegen */
  }
  // Die leere Transaktion übernimmt den zu Ende zerlegten Baum in den Zustand.
  const voll = state.update({}).state;
  if (!syntaxTreeAvailable(voll, voll.doc.length) || syntaxTree(voll).length < voll.doc.length)
    werfeUnvollstaendig(voll);
  return voll;
}
