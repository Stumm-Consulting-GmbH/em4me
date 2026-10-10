// 4T-001312 (Epic 3E-000235): Hängender Einzug umgebrochener Zeilen — die reine
// Rechnung.
//
// Bricht der Editor eine lange Zeile um, beginnt die Fortsetzung am linken
// Rand. Bei einem Listen-Eintrag ist sie damit optisch nicht mehr von einem
// neuen Absatz zu unterscheiden, und bei verschachtelten Listen geht die Ebene
// verloren. Dieses Modul beantwortet die eine Frage, an der das hängt: Wie weit
// muss die Fortsetzung einer Zeile eingerückt werden, damit sie unter dem
// Text der ersten steht?
//
// Prozessneutral (CJS, reine Funktion, kein Editor, kein DOM), damit die
// Rechnung ohne Editor prüfbar ist; die Darstellung selbst liegt im
// Renderer-Modul editor-einzug.js.
'use strict';

const { parseListItemHead } = require('./markdown/list-outline.js');

// Obergrenze in Zeichenbreiten. Ohne sie schöbe eine tief verschachtelte Zeile
// ihre Fortsetzung so weit nach rechts, dass kaum nutzbare Restbreite bleibt;
// jenseits der Grenze ist ein etwas ungenauer Einzug besser als eine
// unleserliche Spalte.
const EINZUG_HOECHSTENS = 24;

// Vorgabe-Breite eines Tabulators. Der Editor rechnet Tabulatoren in dieselbe
// Breite um; ein hier abweichender Wert verschöbe den Einzug genau dort, wo
// mit Tabulatoren eingerückt wird.
const TAB_BREITE = 4;

// Breite einer Leerraum-Folge in Zeichen. Tabulatoren zählen als volle
// Tabulator-Breite, nicht als ein Zeichen; sonst läge der Einzug einer mit
// Tabulatoren eingerückten Zeile um ein Vielfaches daneben.
function breiteVon(text, tabBreite) {
  let breite = 0;
  for (const zeichen of String(text || '')) {
    breite += zeichen === '\t' ? tabBreite : 1;
  }
  return breite;
}

/**
 * Einzug der Fortsetzungs-Zeilen in Zeichenbreiten, 0 für „kein Einzug".
 *
 * Vier Fälle, in dieser Reihenfolge geprüft:
 *
 *   1. **Aufgaben-Zeile** (`- [ ] Text`, seit 4T-001716 auch `1. [ ] Text`
 *      und `1) [ ] Text`): hinter dem Kästchen, damit die Fortsetzung unter
 *      dem Aufgaben-Text steht und nicht unter dem Kästchen.
 *   2. **Aufzählung** (`- Text`, auch `*` und `+`): hinter der Marke.
 *   3. **Nummerierte Liste** (`1. Text`, auch `1)`): hinter Nummer und
 *      Trennzeichen; mehrstellige Nummern rücken entsprechend weiter ein.
 *   4. **Eingerückte Zeile ohne Marke**: auf ihren eigenen Einzug. Das trägt
 *      die Fortsetzungs-Zeilen mehrzeiliger Listen-Einträge.
 *
 * Eine Zeile ohne Einzug und ohne Marke bekommt 0 und bricht unverändert
 * linksbündig um.
 */
function haengenderEinzug(zeile, { tabBreite = TAB_BREITE, hoechstens = EINZUG_HOECHSTENS } = {}) {
  const text = String(zeile == null ? '' : zeile);
  const begrenzt = (wert) => Math.min(Math.max(0, wert), hoechstens);

  // 4T-001716 (Epic 3E-000301): Die Fälle 1 bis 3 liest die eine Erkennung des
  // Listenpunkt-Kopfs (E14 des Epics). Sie kennt das Kästchen auch hinter
  // einer Nummer, sodass die Fortsetzung von `1. [ ] Text` und `1) [ ] Text`
  // unter dem Aufgaben-Text beginnt statt unter dem Kästchen.
  const kopf = parseListItemHead(text);
  if (kopf) {
    const kaestchen = kopf.checkbox
      ? kopf.checkbox.length + breiteVon(kopf.checkboxGap, tabBreite)
      : 0;
    return begrenzt(
      breiteVon(kopf.indent, tabBreite) +
        kopf.marker.length +
        breiteVon(kopf.gap, tabBreite) +
        kaestchen,
    );
  }

  const eingerueckt = /^([ \t]+)\S/.exec(text);
  if (eingerueckt) return begrenzt(breiteVon(eingerueckt[1], tabBreite));

  return 0;
}

module.exports = { EINZUG_HOECHSTENS, TAB_BREITE, haengenderEinzug };
