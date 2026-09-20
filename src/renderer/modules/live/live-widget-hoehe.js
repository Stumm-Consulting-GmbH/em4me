// 4T-001722 (Epic 3E-000303): Höhen-Meldung eines Live-Block-Widgets an den
// Editor.
//
// **Das Problem, das dieses Modul löst.** CodeMirror misst die Höhe eines
// Block-Widgets, wenn es es einhängt, und danach nur, wenn ihm etwas einen
// Grund dazu gibt. Sein DOMObserver hält einen `ResizeObserver` ausschließlich
// auf dem Scroll-Container (`@codemirror/view`, Konstruktor von `DOMObserver`:
// `this.resizeScroll.observe(view.scrollDOM)`), und der `MutationObserver`
// daneben sieht eine Höhen-Änderung per CSS **nicht** — es ändert sich kein
// Knoten, kein Attribut und kein Text, nur die berechnete Gestalt. Ein Widget,
// das seine Höhe nach dem Einhängen selbst ändert, meldet das deshalb selbst.
// Sonst behält der Editor sein altes Maß, und alles, was er daraus zeichnet —
// Auswahl-Ebene, Schreibmarke, Zeilennummern —, bleibt an der alten Stelle
// stehen, während der Text mitwandert.
//
// **Gemessen am 2026-09-18** an der gebauten Programmdatei, Metadaten-Zeile im
// Live-Modus: 113,95 px Versatz beim Auf- und beim Zuklappen, deterministisch
// über fünf Durchgänge (Streuung 0,00 px).
//
// **Warum `requestMeasure` allein nicht genügt — und wann doch.** Die
// Schnittstellen-Beschreibung von CodeMirror nennt für ein Widget mit
// veränderlicher Höhe genau `requestMeasure` (Kommentar an `block` in
// `index.d.ts`). Die Nachmessung liest die Zeilen-Höhen aber nur dann neu, wenn
// `ViewState.measure` das für nötig hält, und dessen Bedingung lautet im Kern
// «der Inhalts-Knoten ist anders hoch als beim letzten Mal»
// (`measureContent = refresh || mustMeasureContent || contentDOMHeight != domRect.height`).
// Genau diese Bedingung greift bei einem **kurzen** Dokument nicht: CodeMirror
// gibt seinem Inhalts-Knoten `min-height: 100%`, sodass dessen Rechteck die
// Höhe des Sichtbereichs behält, solange der Text kürzer ist. Die Höhen-Änderung
// des Widgets bleibt für den eigenen Abgleich damit unsichtbar.
//
// Gemessen am 2026-09-18, dieselbe Bedien-Folge in zwei Dokumenten:
//
// | Dokument | Rechteck des Inhalts-Knotens vor/nach | Höhen-Karte vor/nach | Versatz danach |
// |---|---|---|---|
// | 90 Zeilen (Text höher als der Sichtbereich) | 1815,69 → 1888,86 | 1815,69 → 1888,86 | 2,00 px (Sollwert) |
// | 12 Zeilen (Text kürzer als der Sichtbereich) | 683,75 → 683,75 | 240,69 → 240,69 | −71,17 px |
//
// Im kurzen Dokument heilt auch ein von außen gerufenes `requestMeasure` nichts;
// erst die ausdrückliche Marke «Inhalt neu messen» bringt die Höhen-Karte auf
// 313,86 und den Versatz auf den Sollwert. Deshalb setzt die Meldung diese Marke
// und ruft danach `requestMeasure`.
//
// **Das ist eine gekennzeichnete Abweichung vom veröffentlichten Weg.** Die
// Marke `viewState.mustMeasureContent` steht nicht in der
// Schnittstellen-Beschreibung von CodeMirror. Sie wird deshalb nur gesetzt,
// wenn sie vorhanden ist; fehlt sie nach einer Aktualisierung der Bibliothek,
// bleibt der veröffentlichte Aufruf allein stehen — dann trägt der kurze Fall
// wieder den Fehler, und **der Prüffall FM-04 fällt darüber**, weil seine
// Vorlage ein kurzes Dokument ist. Der Bruch ist damit sichtbar und nicht still.
'use strict';

import { EditorView } from '@codemirror/view';

// **Je Widget-DOM genau ein Beobachter, und der Schlüssel ist das DOM-Element
// und nicht das Widget.** Am CodeMirror-Quelltext geprüft: Ist ein neues Widget
// `eq()`-gleich zum alten, übernimmt der Tile-Cache dessen DOM
// (`TileCache.findWidget`), `toDOM` läuft nicht, und `destroy` des alten Widgets
// läuft ebenfalls nicht (`destroyDropped` ruft es nur für ein Tile, das gar
// nicht wiederverwendet wird). Am Widget geführt, verwaiste der Beobachter beim
// Wiederverwenden oder hinge doppelt; am DOM geführt, lebt er genau so lange wie
// das Element, das er beobachtet.
const beobachterJeDom = new WeakMap();

/**
 * Meldet dem Editor, dass er die Höhen seines Inhalts neu zu messen hat.
 *
 * Zwei Schritte, beide nötig (Begründung samt Messwerten im Modul-Kopf): die
 * Marke «Inhalt neu messen», soweit die Bibliothek sie führt, und danach der
 * veröffentlichte Aufruf, der die Messung bestellt.
 *
 * @param {import('@codemirror/view').EditorView} view
 */
function meldeHoehenAenderung(view) {
  const zustand = view.viewState;
  if (zustand && 'mustMeasureContent' in zustand) zustand.mustMeasureContent = true;
  view.requestMeasure();
}

/**
 * Lässt ein Widget-Wurzelelement seine eigene Höhe beobachten und meldet jede
 * Änderung dem Editor.
 *
 * Ein zweiter Aufruf für dasselbe Element hängt keinen zweiten Beobachter an,
 * sondern gibt die Aufräum-Funktion des ersten zurück.
 *
 * @param {Element} dom Wurzelelement des Widgets.
 * @returns {() => void} Aufräum-Funktion; trennt den Beobachter.
 */
export function beobachteWidgetHoehe(dom) {
  // Ohne Element oder ohne `ResizeObserver` gibt es nichts zu beobachten. Die
  // Prüfung auf das Konstrukt ist dieselbe, die CodeMirror selbst vorschaltet;
  // sie hält das Modul zugleich in einer DOM-Umgebung ohne Layout-Motor lauffähig.
  if (!dom || typeof ResizeObserver !== 'function') return () => {};
  const vorhanden = beobachterJeDom.get(dom);
  if (vorhanden) return vorhanden.aufraeumen;
  let letzteHoehe = null;
  const beobachter = new ResizeObserver(() => {
    const hoehe = dom.getBoundingClientRect().height;
    // **Nur die Höhe zählt.** Eine reine Breiten-Änderung (Fenster,
    // Seitenleiste, Aufteilung) sieht CodeMirror über seinen eigenen Beobachter
    // am Scroll-Container; sie hier noch einmal zu melden wäre doppelte Arbeit.
    // Zugleich ist dieser Vergleich die Schranke gegen eine Rückkopplung: Eine
    // Nachmessung, die die Höhe nicht ändert, löst keine zweite aus.
    if (letzteHoehe !== null && Math.abs(hoehe - letzteHoehe) < 0.01) return;
    letzteHoehe = hoehe;
    // **Der EditorView wird erst hier aufgelöst**, nicht beim Bauen des Widgets
    // festgehalten: `toDOM` kann laufen, bevor das Element im Editor hängt, und
    // ein dort festgehaltener View wäre für die Lebensdauer des Widgets `null`.
    const editorEl = typeof dom.closest === 'function' ? dom.closest('.cm-editor') : null;
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    if (!view) return;
    // Die Nachmessung bündelt selbst je Animations-Bild; eine eigene Drossel
    // wäre nur eine zweite, schlechtere. Während eines weichen Übergangs feuert
    // der Beobachter je Bild, und die Ebenen wandern mit dem Text mit, statt
    // nach dem Übergang nachzuspringen.
    meldeHoehenAenderung(view);
  });
  const aufraeumen = () => {
    const eintrag = beobachterJeDom.get(dom);
    if (eintrag && eintrag.beobachter === beobachter) beobachterJeDom.delete(dom);
    beobachter.disconnect();
  };
  beobachterJeDom.set(dom, { beobachter, aufraeumen });
  beobachter.observe(dom);
  return aufraeumen;
}

/**
 * Trennt den Beobachter eines Widget-Wurzelelements, falls einer hängt.
 *
 * Gedacht für `destroy(dom)` eines Widgets: Dort liegt das Element vor, die
 * Aufräum-Funktion aus dem Bau-Schritt aber nicht mehr.
 *
 * @param {Element} dom Wurzelelement des Widgets.
 */
export function loeseWidgetHoehenBeobachtung(dom) {
  const eintrag = dom ? beobachterJeDom.get(dom) : null;
  if (eintrag) eintrag.aufraeumen();
}
