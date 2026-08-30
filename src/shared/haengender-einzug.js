// 4T-1312 (Epic 3E-0235): Hängender Einzug umgebrochener Zeilen — die reine
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
 *   1. **Aufgaben-Zeile** (`- [ ] Text`): hinter dem Kästchen, damit die
 *      Fortsetzung unter dem Aufgaben-Text steht und nicht unter dem Kästchen.
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

  const aufgabe = /^([ \t]*)([-*+])([ \t]+)(\[[ xX]\])([ \t]+)/.exec(text);
  if (aufgabe) {
    return begrenzt(
      breiteVon(aufgabe[1], tabBreite) +
        1 +
        breiteVon(aufgabe[3], tabBreite) +
        aufgabe[4].length +
        breiteVon(aufgabe[5], tabBreite),
    );
  }

  const aufzaehlung = /^([ \t]*)([-*+])([ \t]+)/.exec(text);
  if (aufzaehlung) {
    return begrenzt(
      breiteVon(aufzaehlung[1], tabBreite) + 1 + breiteVon(aufzaehlung[3], tabBreite),
    );
  }

  const nummeriert = /^([ \t]*)(\d{1,9}[.)])([ \t]+)/.exec(text);
  if (nummeriert) {
    return begrenzt(
      breiteVon(nummeriert[1], tabBreite) +
        nummeriert[2].length +
        breiteVon(nummeriert[3], tabBreite),
    );
  }

  const eingerueckt = /^([ \t]+)\S/.exec(text);
  if (eingerueckt) return begrenzt(breiteVon(eingerueckt[1], tabBreite));

  return 0;
}

module.exports = { EINZUG_HOECHSTENS, TAB_BREITE, haengenderEinzug };
