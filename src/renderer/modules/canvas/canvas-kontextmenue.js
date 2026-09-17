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
// **4T-001770 (Epic 3E-000290): der Zugang ohne Zeiger.** Seit der Karten-Liste
// übersetzt dieses Modul nicht mehr nur eine Zeiger-Stelle, sondern ebenso eine
// bekannte Element-Art in dieselbe Liste von Handlungen — und gibt sie der
// Karten-Bedienung als benannte Griffe weiter. Der Grund ist derselbe wie beim
// Menü selbst: Die Zuordnung Art → Griff steht an genau einer Stelle.
//
// **Was das Menü NICHT tut**: schließen. Es liegt im gemeinsamen Menü-Element
// des Fensters, und dessen Schließ-Wege gelten damit von selbst — Klick
// außerhalb und die Escape-Kaskade in app-input-bindings.js. Die eine
// Ausnahme ist Escape auf der Fläche selbst: Die Karten-Bedienung hält es dort
// an (es hebt die Auswahl auf), und ein offenes Menü käme nie an die Kaskade.
// Deshalb der eigene Escape-Griff in der Capture-Phase, vor der Bedienung.
'use strict';

import {
  FORM_ARTEN,
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
} from '../../../shared/canvas/canvas-core.js';
import { STAPEL_BEFEHLE } from '../../../shared/canvas/canvas-elemente.js';
import { ART_SCHLUESSEL } from './canvas-formen-leiste.js';

// 4T-001701: Beschriftungs-Schlüssel der vier Stapel-Befehle. Sie sind
// dieselben wie in Menü und Kommando-Palette — es ist dieselbe Handlung, und
// zwei Namen dafür wären zwei Funktionen im Kopf des Anwenders.
const STAPEL_SCHLUESSEL = {
  ganzNachVorn: 'command.canvas.stackFront',
  eineStufeVor: 'command.canvas.stackForward',
  eineStufeZurueck: 'command.canvas.stackBackward',
  ganzNachHinten: 'command.canvas.stackBack',
};

// 4T-001770 (Epic 3E-000290): Rückruf der Karten-Liste für «Verbindung
// anlegen…». Er wird hier angemeldet und nicht importiert: Das Panel liegt
// außerhalb dieses Ordners, und ein Import in seine Richtung zöge den
// Canvas-Ordner in den großen Datei-Zyklus des Renderers, den der
// Ordner-Import-Wächter als Ratsche eingefroren hat (Muster
// `beobachteCanvasStand` in canvas-pane.js: gemeldet statt importiert).
let verbindungsWahl = null;

/**
 * Meldet den Rückruf an, der die Ziel-Wahl einer neuen Verbindung startet.
 *
 * Ohne Anmeldung gibt es den Eintrag «Verbindung anlegen…» nicht — genau der
 * Stand der reinen Zeichnungs-Prüffälle und jeder Einbettung ohne Panel.
 *
 * @param {Function|null} fn (kennung, wurzelEl) => void. `wurzelEl` ist die
 *   Wurzel der Ansicht; das Panel löst daran die Spalte auf.
 */
export function registriereVerbindungsWahl(fn) {
  verbindungsWahl = typeof fn === 'function' ? fn : null;
}

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
 * @param {object} [ctx.formen] Steuerung der Formen-Bedienung (4T-001701).
 *   Fehlt sie, entfallen das Untermenü «Form einfügen» und die Formen-Einträge.
 * @param {object} [ctx.gruppen] Steuerung der Gruppen-Bedienung (4T-001702).
 *   Fehlt sie, entfallen «Gruppe einfügen» und die Gruppen-Einträge.
 * @param {object} [ctx.verweisKarten] Steuerung der Verweis-Karten-Bedienung
 *   (4T-001747, seit 4T-001748 auch der Bild-Karten). Fehlt sie, entfallen
 *   «Verweis setzen…», «Bild setzen…», «Ziel öffnen» und die beiden
 *   Entfernen-Einträge an der Karte sowie «Verweis-Karte anlegen» und
 *   «Bild-Karte anlegen» am Hintergrund.
 * @param {Function} [ctx.verschiebeImStapel] (id, befehl) => boolean
 *   (4T-001701). Fehlt der Rückruf, entfallen die vier Stapel-Einträge.
 * @param {Function} [ctx.zeigeMenue] ({x, y, eintraege}) => void (injiziert).
 *   Fehlt der Rückruf, gibt es kein Kontextmenü — der Stand der reinen
 *   Zeichnungs-Prüffälle.
 * @param {Function} [ctx.schliesseMenue] () => void.
 * @param {Function} [ctx.menueOffen] () => boolean.
 * @returns {object} Steuerung mit `destroy`.
 */
export function createCanvasKontextmenue(ctx) {
  const { wurzelEl, buehne, bedienung, verbindungen, formen, gruppen, verweisKarten } = ctx;
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

  // 4T-001770: Der Punkt kommt vom Aufrufer statt aus dem Ereignis. Beim
  // Rechtsklick ist es die Klick-Stelle, aus der Karten-Liste die Mitte des
  // sichtbaren Ausschnitts — die bestehende Lage-Regel ohne Zeiger. Gemerkt
  // wird er weiterhin vorab und nicht erst beim Auslösen gelesen: Das Menü
  // steht dann längst woanders, und der Zeiger ebenso.
  function hintergrundEintraege(punkt) {
    const eintraege = [
      {
        // Dieselbe Beschriftung wie in Menü und Palette: Es ist dieselbe
        // Handlung, und zwei Namen dafür wären zwei Funktionen im Kopf des
        // Anwenders.
        label: t('command.canvas.addCard'),
        dataId: 'canvas-add-card',
        action: () => bedienung.karteAnlegen(punkt),
      },
    ];
    // 4T-001701: Die sechs Arten einzeln statt eines Eintrags mit
    // anschließender Wahl (Story 4S-000930, AK3). Wer die Form hier absetzt,
    // weiß schon, welche er meint; ein zweiter Schritt wäre ein Klick zu viel.
    if (formen) {
      eintraege.push({
        label: t('canvas.formEinfuegen'),
        dataId: 'canvas-add-shape',
        submenu: FORM_ARTEN.map((art) => ({
          label: t(ART_SCHLUESSEL[art]),
          dataId: `canvas-add-shape-${art}`,
          action: () => formen.formAnlegen({ punkt, formArt: art }),
        })),
      });
    }
    // 4T-001702: Die Gruppe kommt als ein Eintrag und nicht als Untermenü —
    // es gibt nur eine Art von Gruppe, und ein Untermenü über einem einzigen
    // Eintrag wäre ein Klick ohne Wahl.
    if (gruppen) {
      eintraege.push({
        label: t('canvas.gruppeEinfuegen'),
        dataId: 'canvas-add-group',
        action: () => gruppen.gruppeAnlegen({ punkt }),
      });
    }
    // 4T-001747: Die Verweis-Karte an der Klick-Stelle. Sie steht hinter der
    // Gruppe wie im Ansichtsmenü; das Ziel wird über dasselbe Eingabe-Feld
    // abgefragt wie in der Leiste, und ohne Ziel entsteht keine Karte.
    if (verweisKarten) {
      eintraege.push({
        label: t('command.canvas.addLinkCard'),
        dataId: 'canvas-add-link-card',
        action: () => verweisKarten.verweisKarteAnlegen({ punkt }),
      });
      // 4T-001748: die Bild-Karte unmittelbar dahinter, in derselben Reihenfolge
      // wie im Ansichtsmenü. Sie fragt zuerst nach dem Bild; ohne Bild entsteht
      // keine Karte.
      eintraege.push({
        label: t('command.canvas.addImageCard'),
        dataId: 'canvas-add-image-card',
        action: () => verweisKarten.bildKarteAnlegen({ punkt }),
      });
    }
    return eintraege;
  }

  // 4T-001701: Die vier Stapel-Befehle für **jedes** Element der Ebene — Karte,
  // Form und ab 4T-001702 Gruppe. Sie hängen als Block hinter den Einträgen
  // der jeweiligen Art; ein eigenes Untermenü hätte vier kurze Namen hinter
  // einen fünften gestellt, ohne etwas zu gewinnen.
  function stapelEintraege(id) {
    if (typeof ctx.verschiebeImStapel !== 'function') return [];
    return [
      { separator: true },
      ...STAPEL_BEFEHLE.map((befehl) => ({
        label: t(STAPEL_SCHLUESSEL[befehl]),
        dataId: `canvas-stack-${befehl}`,
        action: () => ctx.verschiebeImStapel(id, befehl),
      })),
    ];
  }

  // 4T-001747 (Epic 3E-000289): Der Verweis-Block der Karte, hinter einem
  // Trenner. Er steht **hinter** den bestehenden Karten-Einträgen und vor dem
  // Stapel-Block: Text bearbeiten und Karte löschen gelten jeder Karte, der
  // Verweis ist die Eigenschaft, die nur manche tragen.
  //
  // «Ziel öffnen» und die beiden Entfernen-Einträge erscheinen nur an einer
  // Karte, die auf etwas zeigt — ein Eintrag ohne Gegenstand wäre kein Zugang.
  // Alle rufen dieselben Griffe wie Leiste und Doppelklick (B6).
  //
  // 4T-001748: «Bild setzen…» steht neben «Verweis setzen…», weil über beide
  // aus einer Text-Karte eine Verweis- oder Bild-Karte wird; «Ziel öffnen»
  // erscheint **einmal** für beide Angaben, denn sie schließen einander aus
  // (G8) und der Eintrag heißt an beiden gleich.
  function verweisEintraege(id) {
    if (!verweisKarten) return [];
    const eintraege = [
      { separator: true },
      {
        label: t('canvas.verweisSetzen'),
        dataId: 'canvas-card-link-set',
        action: () => verweisKarten.setzeVerweisAbfragen(id),
      },
      {
        label: t('canvas.bildSetzen'),
        dataId: 'canvas-card-image-set',
        action: () => verweisKarten.setzeBildAbfragen(id),
      },
    ];
    const hatVerweis = !!verweisKarten.verweisVon(id);
    const hatBild = !!verweisKarten.bildVon(id);
    if (hatVerweis || hatBild) {
      eintraege.push({
        label: t('canvas.verweisOeffnen'),
        dataId: 'canvas-card-link-open',
        action: () => verweisKarten.oeffneZielVon(id),
      });
    }
    if (hatVerweis) {
      eintraege.push({
        label: t('canvas.verweisEntfernen'),
        dataId: 'canvas-card-link-remove',
        action: () => verweisKarten.entferneVerweis(id),
      });
    }
    if (hatBild) {
      eintraege.push({
        label: t('canvas.bildEntfernen'),
        dataId: 'canvas-card-image-remove',
        action: () => verweisKarten.entferneBild(id),
      });
    }
    return eintraege;
  }

  // 4T-001770 (Epic 3E-000290): Die neue Verbindung ohne Maus. Der Eintrag
  // startet die Ziel-Wahl in der Karten-Liste; angelegt wird danach über
  // denselben Griff wie beim Zug am Anschluss-Punkt. Er erscheint nur, wenn
  // beides da ist — die Liste, die die Gegenstelle wählen lässt, und die
  // Bedienung der Verbindungen, die sie anlegt.
  function verbindungsEintraege(id) {
    if (!verbindungsWahl || !verbindungen) return [];
    return [
      {
        // Dieselbe Beschriftung wie in Menü und Palette: Es ist dieselbe
        // Handlung, und zwei Namen dafür wären zwei Funktionen im Kopf des
        // Anwenders.
        label: t('command.canvas.addConnection'),
        dataId: 'canvas-card-connect',
        action: () => verbindungsWahl(id, wurzelEl),
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
      ...verbindungsEintraege(id),
      ...verweisEintraege(id),
      ...stapelEintraege(id),
    ];
  }

  // 4T-001701: Die vierte Ziel-Art. Die Einträge rufen dieselben Griffe wie
  // Leiste, Doppelklick und `Entf` — ein zweiter Weg in dieselbe Wirkung wäre
  // ein zweiter Ort, an dem sie auseinanderlaufen kann.
  function farbUntermenue(id, angabe, mitKeiner) {
    const eintraege = LINIEN_FARB_NAMEN.map((name) => ({
      label: t(`tabGroup.color.${LINIEN_FARBEN[name]}`),
      dataId: `canvas-shape-${angabe}-${name}`,
      action: () =>
        angabe === 'rand' ? formen.setzeRand(id, name) : formen.setzeFuellung(id, name),
    }));
    if (mitKeiner) {
      eintraege.push({
        label: t('canvas.formKeineFuellung'),
        dataId: 'canvas-shape-fuellung-keine',
        action: () => formen.setzeFuellung(id, null),
      });
    }
    return eintraege;
  }

  function formEintraege(id) {
    return [
      {
        label: t('canvas.formArt'),
        dataId: 'canvas-shape-kind',
        submenu: FORM_ARTEN.map((art) => ({
          label: t(ART_SCHLUESSEL[art]),
          dataId: `canvas-shape-kind-${art}`,
          action: () => formen.setzeArt(id, art),
        })),
      },
      {
        label: t('canvas.formRand'),
        dataId: 'canvas-shape-stroke',
        submenu: farbUntermenue(id, 'rand', false),
      },
      {
        label: t('canvas.formFuellung'),
        dataId: 'canvas-shape-fill',
        submenu: farbUntermenue(id, 'fuellung', true),
      },
      {
        label: t('canvas.formBeschriftung'),
        dataId: 'canvas-shape-label',
        action: () => formen.beschrifteForm(id),
      },
      {
        label: t('canvas.formLoeschen'),
        dataId: 'canvas-shape-delete',
        action: () => formen.loescheForm(id),
      },
      ...stapelEintraege(id),
    ];
  }

  // 4T-001702: Die fünfte Ziel-Art. Farbe, Beschriftung und Löschen rufen
  // dieselben Griffe wie Leiste, Doppelklick und `Entf`; die Farb-Reihe trägt
  // den neunten Eintrag «Standardfarbe», weil es sonst keinen Weg zurück gäbe.
  function gruppenEintraege(id) {
    return [
      {
        label: t('canvas.gruppeFarbe'),
        dataId: 'canvas-group-color',
        submenu: [
          ...LINIEN_FARB_NAMEN.map((name) => ({
            label: t(`tabGroup.color.${LINIEN_FARBEN[name]}`),
            dataId: `canvas-group-color-${name}`,
            action: () => gruppen.setzeFarbe(id, name),
          })),
          {
            label: t('canvas.gruppeStandardfarbe'),
            dataId: 'canvas-group-color-standard',
            action: () => gruppen.setzeFarbe(id, null),
          },
        ],
      },
      {
        label: t('canvas.gruppeBeschriftung'),
        dataId: 'canvas-group-label',
        action: () => gruppen.beschrifteGruppe(id),
      },
      {
        label: t('canvas.gruppeLoeschen'),
        dataId: 'canvas-group-delete',
        action: () => gruppen.loescheGruppe(id),
      },
      ...stapelEintraege(id),
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

  /**
   * Die Einträge zu einer bekannten Element-Art (4T-001770).
   *
   * Die Stelle, an der Art und Handlungs-Liste zusammenkommen. Sie steht
   * eigens, weil sie zwei Fragesteller hat: den Rechtsklick, der die Art aus
   * der Zeiger-Stelle bestimmt, und die Karten-Liste, die sie schon kennt.
   *
   * Gewählt wird dabei jedes Mal: Das Menü handelt von dem Element, und ohne
   * sichtbare Auswahl bliebe offen, welches gemeint ist.
   */
  function eintraegeFuerArt(id, art) {
    // Befund 1 des Product Owners vom 2026-09-10: Im nicht änderbaren Dokument
    // gibt es keinen Eintrag — jeder von ihnen schreibt. Ein Menü mit einem
    // Hinweis «nichts möglich» wäre ein zweiter Weg, dasselbe zu sagen, das
    // die fehlenden Griffe schon sagen; deshalb erscheint es gar nicht.
    if (!bedienung.istAenderbar()) return [];
    if (art === 'linie' && verbindungen) {
      verbindungen.waehleLinie(id);
      return linienEintraege(id);
    }
    if (art === 'form' && formen) {
      formen.waehleForm(id);
      return formEintraege(id);
    }
    if (art === 'gruppe' && gruppen) {
      gruppen.waehleGruppe(id);
      return gruppenEintraege(id);
    }
    if (art === 'karte') {
      bedienung.waehleKarte(id);
      return kartenEintraege(id);
    }
    // Ohne Element gilt das Menü der Fläche. Ohne Zeiger ist seine Stelle die
    // Mitte des sichtbaren Ausschnitts — die bestehende Lage-Regel ohne
    // Zeiger, und keine zweite daneben.
    return hintergrundEintraege(bedienung.mitteDesAusschnitts());
  }

  function eintraegeFuer(ev) {
    if (!bedienung.istAenderbar()) return [];
    // Die Linie vor der Karte, weil eine Linie über einer Karte liegen kann
    // und der Treffer dann ihr gilt (4T-001655).
    const linie = verbindungen ? verbindungen.kennungAn(ev.target) : null;
    if (linie) return eintraegeFuerArt(linie, 'linie');
    // 4T-001701: Die Form vor der Karte, weil beide in derselben Ebene liegen
    // und ein Treffer eindeutig zu einer von beiden gehört; die Reihenfolge
    // hier entscheidet nichts über den Stapel, sie ist die Auswertungs-Folge.
    const form = formen ? formen.kennungAn(ev.target) : null;
    if (form) return eintraegeFuerArt(form, 'form');
    // 4T-001702: Die Gruppe wird über ihren Rand und ihre Beschriftung
    // getroffen; ihr Innenraum gehört dem, was darin liegt. Ein Rechtsklick
    // mitten in eine Gruppe meint deshalb die Karte darin oder — wenn dort
    // nichts liegt — den Hintergrund.
    const gruppe = gruppen ? gruppen.kennungAn(ev.target) : null;
    if (gruppe) return eintraegeFuerArt(gruppe, 'gruppe');
    const id = bedienung.kennungAn(ev.target);
    if (!id) return hintergrundEintraege(bedienung.flaechenPunktAus(ev));
    return eintraegeFuerArt(id, 'karte');
  }

  // --- Zugang ohne Zeiger (4T-001770) -------------------------------------------
  //
  // Die Karten-Liste bedient die Fläche ohne Maus und braucht dafür genau das,
  // was dieses Modul ohnehin führt: die Zuordnung Element-Art → Griff. Sie geht
  // deshalb von hier an die Karten-Bedienung, die der eine Eintritt der Liste
  // ist (`zeigeElement`). Eine zweite Zuordnung im Panel wäre eine zweite
  // Pflege-Stelle, die bei der nächsten neuen Handlung auseinanderliefe —
  // dieselbe Begründung, mit der B6 das Kontextmenü zur vollständigen
  // Handlungs-Liste macht.
  const elementGriffe = {
    /** Öffnet die Rohtext-Eingabe des Elements, wie es der Doppelklick tut. */
    bearbeite(id, art) {
      if (art === 'karte') return bedienung.bearbeiteKarte(id);
      if (art === 'form' && formen) return formen.beschrifteForm(id);
      if (art === 'gruppe' && gruppen) return gruppen.beschrifteGruppe(id);
      if (art === 'linie' && verbindungen) return verbindungen.beschrifteLinie(id);
      return false;
    },
    /** Löscht das Element, wie es `Entf` auf der Fläche tut. */
    loesche(id, art) {
      if (art === 'karte') return bedienung.loescheKarte(id);
      if (art === 'form' && formen) return formen.loescheForm(id);
      if (art === 'gruppe' && gruppen) return gruppen.loescheGruppe(id);
      if (art === 'linie' && verbindungen) return verbindungen.loescheLinie(id);
      return false;
    },
    /** Legt eine Verbindung zwischen zwei Karten an (Ziel-Wahl der Liste). */
    verbinde(vonId, nachId) {
      return !!verbindungen && verbindungen.verbindeKarten(vonId, nachId);
    },
    /** Öffnet das Menü an einer Stelle des Fensters, ohne Zeiger-Ereignis. */
    oeffneMenue(id, art, x, y) {
      const eintraege = eintraegeFuerArt(id, art);
      // Ein leeres Menü wird nicht gezeigt (Befund 1), wie beim Rechtsklick:
      // Ein Rahmen ohne Inhalt sähe nach einem Fehler aus, nicht nach einer
      // Aussage.
      if (eintraege.length === 0) return false;
      zeigeMenue({ x, y, eintraege });
      return true;
    },
  };
  if (typeof bedienung.uebernimmElementGriffe === 'function') {
    bedienung.uebernimmElementGriffe(elementGriffe);
  }

  // --- Ereignisse ---------------------------------------------------------------

  function beiKontextmenue(ev) {
    const ziel = ev.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // In der offenen Rohtext-Eingabe gehört der Rechtsklick der Textfläche:
    // Dort erwartet der Anwender Ausschneiden, Kopieren und Einfügen, und ein
    // eigenes Menü nähme sie ihm. Seit 4T-001655 gilt das ebenso für die
    // Beschriftungs-Eingabe der Verbindung.
    if (
      ziel.closest(
        '.canvas-karte-eingabe, .canvas-linie-eingabe, .canvas-form-eingabe, ' +
          // 4T-001747: Dasselbe gilt für das Ziel-Feld der Karten-Leiste und
          // die freistehende Ziel-Abfrage — auch dort erwartet der Anwender
          // Ausschneiden, Kopieren und Einfügen. 4T-001748: und für das
          // Bild-Feld daneben, aus demselben Grund.
          '.canvas-gruppe-eingabe, .canvas-karte-verweis-feld, .canvas-karte-bild-feld',
      )
    ) {
      return;
    }
    ev.preventDefault();
    // Eine offene Eingabe wird übernommen, wie beim Klick auf den Hintergrund:
    // Der Rechtsklick ist der Beginn einer anderen Handlung.
    bedienung.beendeBearbeitung();
    if (verbindungen) verbindungen.beendeBearbeitung();
    if (formen) formen.beendeBearbeitung();
    if (gruppen) gruppen.beendeBearbeitung();
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
      // 4T-001770: Die angemeldeten Griffe zeigen auf diese Instanz; sie gehen
      // mit ihr. Die Bedienung überlebt zwar nicht lange, aber ein Zeiger auf
      // eine gelöste Ansicht ist nie der Stand, in dem man sie zurücklässt.
      if (typeof bedienung.uebernimmElementGriffe === 'function') {
        bedienung.uebernimmElementGriffe(null);
      }
    },
  };
}
