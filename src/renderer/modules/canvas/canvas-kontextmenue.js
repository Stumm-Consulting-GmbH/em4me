// 4T-001683 (Epic 3E-000287): Kontextmenü der Canvas-Fläche — der dritte
// Bedienort neben Doppelklick und Kommando-Palette (Anordnung des Product
// Owners vom 2026-09-10).
//
// **Warum ein eigenes Modul.** Ansicht und Bedienung liegen beide nahe am
// Datei-Budget, und das Menü ist eine dritte Fachlichkeit: Es entscheidet
// nichts, sondern übersetzt eine Zeiger-Stelle in eine Liste von Handlungen,
// die es anderswo schon gibt. Es ruft ausschließlich die benannten Griffe der
// Karten-Bedienung — ein zweiter Weg in dieselbe Wirkung wäre ein zweiter Ort,
// an dem sie auseinanderlaufen kann.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein
// `i18n`, keine Menü-Helfer des Fensters. Die Beschriftungen kommen über das
// injizierte `t`, das Bauen des Menüs über den injizierten Rückruf `zeigeMenue`
// (umgesetzt in app-init.js über das gemeinsame Menü-Element). Ein Import der
// Menü-Helfer wäre der kürzere Weg und zöge den Canvas-Ordner in den grossen
// Datei-Zyklus des Renderers, den der Ordner-Import-Wächter eingefroren hat.
//
// **Was das Menü NICHT tut**: schließen. Es liegt im gemeinsamen Menü-Element
// des Fensters, und dessen Schließ-Wege gelten damit von selbst — Klick
// außerhalb und die Escape-Kaskade in app-input-bindings.js. Die eine
// Ausnahme ist Escape auf der Fläche selbst: Die Karten-Bedienung hält es dort
// an (es hebt die Auswahl auf), und ein offenes Menü käme nie an die Kaskade.
// Deshalb der eigene Escape-Griff in der Capture-Phase, vor der Bedienung.
'use strict';

/**
 * Verdrahtet das Kontextmenü mit einer gezeichneten Fläche.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.wurzelEl Wurzel der Ansicht (trägt den Escape-Griff).
 * @param {HTMLElement} ctx.buehne Bühne; sie trägt Hintergrund und Karten.
 * @param {Function} ctx.t Übersetzungs-Funktion (injiziert).
 * @param {object} ctx.bedienung Steuerung der Karten-Bedienung.
 * @param {object} [ctx.verbindungen] Steuerung der Verbindungs-Bedienung
 *   (4T-001655). Fehlt sie, kennt das Menü nur Hintergrund und Karte.
 * @param {Function} [ctx.zeigeMenue] ({x, y, eintraege}) => void (injiziert).
 *   Fehlt der Rückruf, gibt es kein Kontextmenü — der Stand der reinen
 *   Zeichnungs-Prüffälle.
 * @param {Function} [ctx.schliesseMenue] () => void.
 * @param {Function} [ctx.menueOffen] () => boolean.
 * @returns {object} Steuerung mit `destroy`.
 */
export function createCanvasKontextmenue(ctx) {
  const { wurzelEl, buehne, bedienung, verbindungen } = ctx;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  function zeigeMenue(daten) {
    if (typeof ctx.zeigeMenue === 'function') ctx.zeigeMenue(daten);
  }

  function schliesseMenue() {
    if (typeof ctx.schliesseMenue === 'function') ctx.schliesseMenue();
  }

  function menueOffen() {
    return typeof ctx.menueOffen === 'function' && ctx.menueOffen() === true;
  }

  // --- Einträge je Ziel-Art -----------------------------------------------------
  //
  // **Die erweiterbare Stelle.** Jede Ziel-Art der Fläche bekommt hier ihre
  // Liste, und `eintraegeFuer` wählt sie aus. 4T-001655 hängt die Verbindungen
  // als dritte Art daneben, ohne den Ereignis-Weg darunter anzufassen.

  function hintergrundEintraege(ev) {
    // Die Klick-Stelle wird jetzt gemerkt und nicht erst beim Auslösen
    // gelesen: Das Menü steht dann längst woanders, und der Zeiger ebenso.
    const punkt = bedienung.flaechenPunktAus(ev);
    return [
      {
        // Dieselbe Beschriftung wie in Menü und Palette: Es ist dieselbe
        // Handlung, und zwei Namen dafür wären zwei Funktionen im Kopf des
        // Anwenders.
        label: t('command.canvas.addCard'),
        dataId: 'canvas-add-card',
        action: () => bedienung.karteAnlegen(punkt),
      },
    ];
  }

  function kartenEintraege(id) {
    return [
      {
        label: t('canvas.karteBearbeiten'),
        dataId: 'canvas-card-edit',
        action: () => bedienung.bearbeiteKarte(id),
      },
      {
        label: t('canvas.karteLoeschen'),
        dataId: 'canvas-card-delete',
        action: () => bedienung.loescheKarte(id),
      },
    ];
  }

  // 4T-001655: Die dritte Ziel-Art. Sie steht vor der Karte, weil eine Linie
  // über einer Karte liegen kann und der Treffer dann ihr gilt; die vier
  // Einträge rufen dieselben Griffe wie Leiste, Doppelklick und `Entf`.
  function linienEintraege(id) {
    return [
      {
        label: t('canvas.linieRichtung'),
        dataId: 'canvas-line-direction',
        action: () => verbindungen.schalteRichtungVon(id),
      },
      {
        label: t('canvas.linieUmkehren'),
        dataId: 'canvas-line-reverse',
        action: () => verbindungen.kehreUmVon(id),
      },
      {
        label: t('canvas.linieBeschriftung'),
        dataId: 'canvas-line-label',
        action: () => verbindungen.beschrifteLinie(id),
      },
      {
        label: t('canvas.linieLoeschen'),
        dataId: 'canvas-line-delete',
        action: () => verbindungen.loescheLinie(id),
      },
    ];
  }

  function eintraegeFuer(ev) {
    // Befund 1 des Product Owners vom 2026-09-10: Im nicht änderbaren Dokument
    // gibt es keinen Eintrag — jeder der fünf schreibt. Ein Menü mit einem
    // Hinweis «nichts möglich» wäre ein zweiter Weg, dasselbe zu sagen, das
    // die fehlenden Griffe schon sagen; deshalb erscheint es gar nicht.
    if (!bedienung.istAenderbar()) return [];
    const linie = verbindungen ? verbindungen.kennungAn(ev.target) : null;
    if (linie) {
      // Wie bei der Karte: Der Rechtsklick wählt, damit Menü und Auswahl
      // dasselbe Ziel meinen.
      verbindungen.waehleLinie(linie);
      return linienEintraege(linie);
    }
    const id = bedienung.kennungAn(ev.target);
    if (!id) return hintergrundEintraege(ev);
    // Rechtsklick wählt die Karte: Das Menü handelt von ihr, und ohne
    // sichtbare Auswahl bliebe offen, welche gemeint ist.
    bedienung.waehleKarte(id);
    return kartenEintraege(id);
  }

  // --- Ereignisse ---------------------------------------------------------------

  function beiKontextmenue(ev) {
    const ziel = ev.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // In der offenen Rohtext-Eingabe gehört der Rechtsklick der Textfläche:
    // Dort erwartet der Anwender Ausschneiden, Kopieren und Einfügen, und ein
    // eigenes Menü nähme sie ihm. Seit 4T-001655 gilt das ebenso für die
    // Beschriftungs-Eingabe der Verbindung.
    if (ziel.closest('.canvas-karte-eingabe, .canvas-linie-eingabe')) return;
    ev.preventDefault();
    // Eine offene Eingabe wird übernommen, wie beim Klick auf den Hintergrund:
    // Der Rechtsklick ist der Beginn einer anderen Handlung.
    bedienung.beendeBearbeitung();
    if (verbindungen) verbindungen.beendeBearbeitung();
    const eintraege = eintraegeFuer(ev);
    // Ein leeres Menü wird nicht gezeigt (Befund 1): Ein Rahmen ohne Inhalt
    // sähe nach einem Fehler aus, nicht nach einer Aussage.
    if (eintraege.length === 0) return;
    zeigeMenue({ x: ev.clientX, y: ev.clientY, eintraege });
  }

  function beiTaste(ev) {
    if (ev.key !== 'Escape' || !menueOffen()) return;
    // Vorrang vor der Auswahl-Aufhebung der Bedienung: Wer ein offenes Menü
    // wegdrückt, meint das Menü. Deshalb Capture-Phase und stopPropagation.
    ev.preventDefault();
    ev.stopPropagation();
    schliesseMenue();
  }

  buehne.addEventListener('contextmenu', beiKontextmenue);
  wurzelEl.addEventListener('keydown', beiTaste, true);

  return {
    destroy() {
      buehne.removeEventListener('contextmenu', beiKontextmenue);
      wurzelEl.removeEventListener('keydown', beiTaste, true);
    },
  };
}
