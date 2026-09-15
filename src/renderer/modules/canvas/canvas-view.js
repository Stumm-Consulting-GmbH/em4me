// 4T-001653 (Epic 3E-000287): Canvas-Renderer — zeichnet das Modell des Kerns
// (canvas-core.js) auf zwei Ebenen und trägt die Navigation: Fläche
// verschieben, Zoom um den Zeiger, Einpassen.
//
// **Hier verlässt die Canvas ihre beiden Vorbilder** (Entscheidung E4 des
// Konzepts «Canvas als räumliche Arbeitsfläche»). Der Karten-Inhalt ist
// gerendertes Markdown und muss bei Überlänge scrollen; ein SVG-`<text>` kann
// weder das eine noch das andere. Also:
//
//   - **Karten als HTML** in einer eigenen Ebene. Ihr Inhalt kommt aus dem
//     injizierten `renderMarkdown`, Scrollen ist eine CSS-Eigenschaft.
//   - **Verbindungen als SVG** in der Ebene darunter.
//   - **Eine gemeinsame Verschiebung und Vergrößerung** über beide, damit sie
//     beim Zoomen deckungsgleich bleiben: dieselbe `translate`/`scale`-Rechnung,
//     einmal als SVG-Transform und einmal als CSS-Transform mit
//     `transform-origin: 0 0`.
//
// **4T-001701 (Epic 3E-000288): aus der Karten-Ebene wird die Element-Ebene**
// (E4 in der Fassung vom 2026-09-12, Entscheidung des Product Owners «Weg 2
// ist freigegeben, umsetzen»). Karten, Formen und ab 4T-001702 Gruppen liegen
// in **einer** geordneten Ebene, und ihre Reihenfolge im Baum ist die
// Reihenfolge in der Fence (G3) — damit kann eine Form über **oder** unter
// einer Karte liegen. Die Karte bleibt HTML, die Form ist ein SVG in einer
// positionierten Hülle (`canvas-formen.js`). Die Verbindungen bleiben die
// eigene SVG-Ebene darunter und sind von der Reihenfolge nicht berührt.
//
// **Der Umbau ist der kleinstmögliche:** Die beiden Ebenen, ihre gemeinsame
// Verschiebung und die CSS-Klasse `canvas-karten` bleiben, wie sie waren; es
// ändert sich allein, **was** in die obere Ebene gezeichnet wird und in
// welcher Reihenfolge. Der Name der Klasse trägt seine Herkunft weiter — eine
// Umbenennung hätte Stilblatt und Prüffälle angefasst, ohne der Zeichnung
// etwas hinzuzufügen (dieselbe Abwägung wie bei `LINIEN_FARBEN` in 4T-001700).
//
// Bewusst abhängigkeitsfrei von api/i18n/app-state: Der Aufrufer injiziert `t`
// und `renderMarkdown` (Muster createMindmapView, createGraphView) — die
// Komponente bleibt zyklenfrei und in jsdom ohne window.api-Stub prüfbar.
// Farben kommen ausschließlich aus Theme-Variablen (styles/canvas.css, Klassen
// `canvas-*`); die Komponente setzt keine Farbwerte.
//
// Die reine Geometrie liegt prozessneutral in shared/canvas/canvas-geometrie.js;
// hier bleibt, was DOM, Ereignisse oder Übersetzungen braucht.
'use strict';

import { STAPEL_ARTEN } from '../../../shared/canvas/canvas-core.js';
import {
  ZOOM_MIN,
  ZOOM_MAX,
  einpassung,
  huelle,
  kartenRechteck,
  zoomUmPunkt,
} from '../../../shared/canvas/canvas-geometrie.js';
// 4T-001654: Die Bedien-Logik der Karten liegt daneben — sie trägt den Zustand
// einer angefangenen Handlung und geht den umgekehrten Weg (Ansicht -> Modell).
import { createKartenBedienung } from './canvas-bedienung.js';
// 4T-001683: Der dritte Bedienort. Er entscheidet nichts eigenes, sondern
// übersetzt eine Zeiger-Stelle in Handlungen der Bedienung daneben.
import { createCanvasKontextmenue } from './canvas-kontextmenue.js';
// 4T-001655: Zeichnung und Bedienung der Verbindungen. Die Zeichnung rechnet
// ihre Maße aus beiden Enden, die Bedienung trägt Anlegen, Auswahl und die
// Leiste an der gewählten Linie.
import { istHintergrund, zeichneLinienEbene } from './canvas-linien.js';
import { createVerbindungsBedienung } from './canvas-verbindungen.js';
// 4T-001701: Zeichnung und Bedienung der Formen. Die Zeichnung baut die Hülle
// samt Umriss, die Bedienung trägt Anlegen, Auswahl, Zug, Beschriftung und die
// Leiste an der gewählten Form.
import { zeichneForm } from './canvas-formen.js';
import { createFormenBedienung } from './canvas-formen-bedienung.js';
// 4T-001702: Zeichnung und Bedienung der Gruppen. Die Zeichnung baut Rahmen,
// Tönung und Beschriftung, die Bedienung trägt Anlegen, Auswahl, den Zug samt
// Mitgliedern, Farbe, Beschriftung und Löschen.
import { zeichneGruppe } from './canvas-gruppen.js';
import { createGruppenBedienung } from './canvas-gruppen-bedienung.js';
// 4T-001747 (Epic 3E-000289): Anzeige und Bedienung der Verweis-Karten. Der
// Körper einer Karte — eigener Text oder angezeigtes fremdes Dokument — liegt
// im Anzeige-Modul daneben, weil die Verzweigung zwischen beiden Formen dessen
// Aussage ist und hier allein die Ebene, Lage und Größe gehören.
import { baueKartenInneres } from './canvas-verweis-anzeige.js';
import { createVerweisKartenBedienung } from './canvas-verweis-karten.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Empfindlichkeit des Rad-Zooms. Gleicher Wert wie in der Mindmap-Ansicht,
// damit sich beide räumlichen Ansichten gleich anfühlen.
const ZOOM_EMPFINDLICHKEIT = 0.0015;

/**
 * Erzeugt eine Canvas-Ansicht im Container.
 *
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {Function} [options.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} [options.renderMarkdown] (text, pfad) => HTML (injiziert).
 * @param {Function} [options.nachRender] (container, pfad) => void, der
 *   Schritt-Satz des erzeugten Teilbaums (injiziert). Fehlt er, bleibt der
 *   Karten-Inhalt rohes HTML — für den Unit-Test genau richtig, im Programm
 *   nie der Fall.
 * @param {Function} [options.beiAenderung] ({flaeche, rumpf}) => boolean
 *   (injiziert, 4T-001654). Nimmt den neu serialisierten Rumpf der geänderten
 *   Fläche entgegen und stellt ihn in das Dokument; `false` heißt verworfen.
 *   Fehlt der Rückruf, ist die Fläche nur ansehbar — genau der Stand vor
 *   diesem Task und der Normalfall der Zeichnungs-Prüffälle.
 * @param {Function} [options.istAenderbar] () => boolean (injiziert, Befund 1
 *   des Product Owners vom 2026-09-10). Ist das Dokument nur ansehbar, zeichnet
 *   die Fläche keine Griffe und bietet keine schreibende Handlung an. Fehlt der
 *   Rückruf, gilt änderbar — die Einbettung, die den Anzeige-Modus nicht kennt,
 *   verhält sich wie vor diesem Befund, und der Schreibweg bleibt über
 *   `beiAenderung` eigens gesichert.
 * @param {Function} [options.neuUebergeben] () => void (injiziert, 4T-001747).
 *   Fordert von der Einbettung den **aktuellen** Flächen-Stand des Dokuments
 *   an. Gerufen, sobald eine während einer Bedien-Handlung zurückgestellte
 *   Neu-Übergabe nachgeholt wird; den zurückgestellten Schnappschuss dann noch
 *   anzuwenden setzte die Fläche auf den Stand vor der Handlung zurück
 *   (Abnahme-Befund vom 2026-09-14). Fehlt der Rückruf, bleibt es beim
 *   Schnappschuss — der Stand der jsdom-Prüffälle, die `setFlaechen` selbst
 *   rufen.
 * @param {Function} [options.rueckgaengig] () => boolean (injiziert,
 *   4T-001654). Ein Schritt zurück in der Historie des Dokuments; die Fläche
 *   kennt sie nicht und reicht die Taste nur weiter.
 * @param {Function} [options.wiederholen] () => boolean (injiziert).
 * @param {Function} [options.zeigeKontextmenue] ({x, y, eintraege}) => void
 *   (injiziert, 4T-001683). Baut das gemeinsame Kontextmenü des Fensters.
 *   Fehlt der Rückruf, hat die Fläche keinen Rechtsklick-Bedienort.
 * @param {Function} [options.schliesseKontextmenue] () => void (injiziert).
 * @param {Function} [options.kontextmenueOffen] () => boolean (injiziert).
 * @param {Function} [options.leseEinbettung] (basisPfad, ziel, anker) =>
 *   Promise<{ok, path, displayPath, content}> (injiziert, 4T-001747). Der
 *   Einbettungs-Abruf des Bestands; er füllt den Körper einer Verweis-Karte.
 *   Fehlt der Rückruf, zeigt die Verweis-Karte ihren Befund — der Stand der
 *   reinen Zeichnungs-Prüffälle.
 * @param {Function} [options.leseBild] (basisPfad, bild) => Promise<{ok, path,
 *   dataUrl}> (injiziert, 4T-001748). Der Bild-Einbettungs-Abruf des Bestands;
 *   er füllt den Körper einer Bild-Karte. Fehlt der Rückruf, zeigt die
 *   Bild-Karte ihren Befund.
 * @param {Function} [options.oeffneZiel] (doc) => Promise<boolean> (injiziert,
 *   4T-001747). Öffnet das verwiesene Dokument an der verwiesenen Stelle.
 * @param {Function} [options.oeffneBild] (bild) => Promise<boolean> (injiziert,
 *   4T-001748). Öffnet die Bild-Datei über den Anlagen-Weg der Anwendung.
 * @param {Function} [options.zielVorschlaege] () => Promise<Array<string>>
 *   (injiziert, 4T-001747). Die Namen des Bereichs-Index für die
 *   Vorschlags-Liste des Ziel-Feldes.
 * @param {Function} [options.bildVorschlaege] () => Promise<Array<string>>
 *   (injiziert, 4T-001748). Die Bild-Dateien des Bereichs für die
 *   Vorschlags-Liste des Bild-Feldes.
 * @returns {object} Controller mit setModel, fit, getStats und destroy.
 */
export function createCanvasView(container, options = {}) {
  const t = typeof options.t === 'function' ? options.t : (key) => key;
  const renderMarkdown =
    typeof options.renderMarkdown === 'function' ? options.renderMarkdown : null;
  const nachRender = typeof options.nachRender === 'function' ? options.nachRender : null;
  const beiAenderung = typeof options.beiAenderung === 'function' ? options.beiAenderung : null;
  // Befund 1 vom 2026-09-10: die eine Stelle, an der die Fläche fragt, ob das
  // Dokument änderbar ist. Zeichnung und beide Bedienungen lesen sie.
  const aenderbar = () =>
    typeof options.istAenderbar !== 'function' || options.istAenderbar() !== false;

  // Sitzungs-Zustand der Ansicht.
  //
  // 4T-001677: Ein Dokument kann mehrere Flächen tragen; die Ansicht zeigt
  // eine davon und macht die übrigen über Reiter erreichbar. Die Wahl lebt
  // **hier** und nur für die Sitzungs-Dauer — nach dem Muster des
  // Klapp-Zustands aus E8 und mit derselben Begründung: Eine reine
  // Ansichts-Handlung darf das Dokument nicht ändern, und bei einem Format
  // mit zugesagter Byte-Gleichheit wiegt das schwerer als sonst.
  let flaechen = [];
  let gewaehlt = 0;
  let model = null;
  let pfad = '';
  let hinweisSchluessel = null;
  let hinweisWerte = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  // Erst die erste Zeichnung passt ein; jede weitere behält Zoom und
  // Verschiebung, damit eine Live-Aktualisierung die Ansicht nicht zurücksetzt.
  let eingepasst = false;
  // 4T-001654: Eine Neu-Übergabe während einer laufenden Bedien-Handlung würde
  // die halb gezogene Karte oder die offene Eingabe wegzeichnen. Sie wartet
  // deshalb, bis die Handlung fertig ist — das dauert nie länger als eine
  // Bedienung, und das Dokument ändert sich in dieser Zeit nur durch sie selbst.
  let ausstehend = null;
  let bedienung = null;
  let kontextmenue = null;
  let verbindungen = null;
  let formen = null;
  let gruppen = null;
  let verweisKarten = null;

  // --- DOM-Grundgerüst -------------------------------------------------------

  const wurzelEl = document.createElement('div');
  wurzelEl.className = 'canvas-view';

  // Die Leiste sitzt **innerhalb** des Canvas-Containers und damit von selbst
  // am richtigen Ort: unterhalb der Reiterleiste der Dokumente und nur über
  // der Breite des Dokument-Bereichs, weil .pane-canvas zwischen den beiden
  // Seitenleisten liegt. Kein Eingriff in den Fenster-Aufbau nötig.
  const reiterleiste = document.createElement('div');
  reiterleiste.className = 'canvas-reiterleiste';
  reiterleiste.setAttribute('role', 'tablist');
  reiterleiste.hidden = true;

  const buehne = document.createElement('div');
  buehne.className = 'canvas-buehne';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'canvas-svg');
  const svgViewport = document.createElementNS(SVG_NS, 'g');
  svgViewport.setAttribute('class', 'canvas-viewport');
  svg.appendChild(svgViewport);
  // 4T-001655: Die Verbindungen bekommen eine eigene Gruppe im Viewport. Sie
  // wird für sich neu gezeichnet — während des Ziehens einer Karte mehrmals je
  // Sekunde (AK4) —, und die Vorschau-Linie des Anlegens liegt daneben, damit
  // ein Neuzeichnen sie nicht wegräumt.
  const linienEbene = document.createElementNS(SVG_NS, 'g');
  linienEbene.setAttribute('class', 'canvas-linien');
  svgViewport.appendChild(linienEbene);

  const kartenEbene = document.createElement('div');
  kartenEbene.className = 'canvas-karten';

  buehne.appendChild(svg);
  buehne.appendChild(kartenEbene);

  const hinweis = document.createElement('div');
  hinweis.className = 'canvas-hinweis';
  hinweis.hidden = true;

  wurzelEl.appendChild(reiterleiste);
  wurzelEl.appendChild(buehne);
  wurzelEl.appendChild(hinweis);
  container.appendChild(wurzelEl);

  // --- Hilfsfunktionen -------------------------------------------------------

  function karten() {
    if (!model || !Array.isArray(model.elemente)) return [];
    return model.elemente.filter((el) => el.art === 'karte');
  }

  function linien() {
    if (!model || !Array.isArray(model.elemente)) return [];
    return model.elemente.filter((el) => el.art === 'linie');
  }

  // 4T-001701: Die Elemente der gemeinsamen Ebene, in der Reihenfolge der
  // Fence. Welche Arten dazugehören, sagt der Kern (`STAPEL_ARTEN`) und nicht
  // eine Aufzählung hier — sonst zöge die Gruppe aus 4T-001702 an dieser
  // Stelle eine zweite Pflege nach sich.
  function stapelElemente() {
    if (!model || !Array.isArray(model.elemente)) return [];
    return model.elemente.filter((el) => STAPEL_ARTEN.has(el.art));
  }

  function anwendenTransform() {
    svgViewport.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
    kartenEbene.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function sichtMasse() {
    const rect = buehne.getBoundingClientRect ? buehne.getBoundingClientRect() : null;
    return {
      breite: rect && rect.width ? rect.width : 0,
      hoehe: rect && rect.height ? rect.height : 0,
    };
  }

  // --- Zeichnen --------------------------------------------------------------

  function zeichneKarte(el) {
    const r = kartenRechteck(el);
    const karte = document.createElement('article');
    karte.className = 'canvas-karte';
    karte.dataset.canvasId = el.id || '';
    // 4T-001654: Die Auswahl ist eine Aussage über das Element und gehört
    // deshalb an das Element, nicht allein in eine CSS-Klasse.
    karte.setAttribute('aria-selected', 'false');
    karte.style.left = `${r.x}px`;
    karte.style.top = `${r.y}px`;
    karte.style.width = `${r.b}px`;
    karte.style.height = `${r.h}px`;

    // 4T-001747: Welchen Körper die Karte bekommt — ihren eigenen Text oder den
    // Inhalt des verwiesenen Dokuments samt Kopfzeile —, entscheidet das
    // Anzeige-Modul. Der Abruf des Ziels läuft asynchron; die Karte steht
    // sofort und füllt sich nach, ohne dass die Fläche neu gezeichnet wird.
    baueKartenInneres(karte, el, {
      t,
      pfad,
      renderMarkdown,
      nachRender,
      leseEinbettung: options.leseEinbettung,
      leseBild: options.leseBild,
    });
    // 4T-001654: Griff für die Größen-Änderung, unten rechts (Muster
    // buildPanelResizer). Er steht im Baum und wird erst sichtbar, wenn die
    // Karte gewählt ist oder der Zeiger über ihr steht — ein dauerhaft
    // sichtbarer Griff je Karte machte die Fläche unruhig.
    //
    // Befund 1 vom 2026-09-10: Im nicht änderbaren Dokument entsteht er gar
    // nicht. Ihn nur unsichtbar zu schalten reichte nicht — er bliebe
    // anfassbar, und genau das war der gemeldete Fehler.
    if (aenderbar()) {
      const griff = document.createElement('div');
      griff.className = 'canvas-karte-griff';
      griff.setAttribute('aria-hidden', 'true');
      karte.appendChild(griff);
    }
    return karte;
  }

  /**
   * Zeichnet die Verbindungs-Ebene neu.
   *
   * @param {{id: string, rechteck: object}} [ueberschreibung] Live-Lage einer
   *   gezogenen Karte (4T-001655, AK4). Die Verbindungen folgen ihr, **bevor**
   *   geschrieben wird; das Modell bleibt dabei unberührt.
   */
  function zeichneLinien(ueberschreibung) {
    const nachId = new Map();
    for (const el of karten()) {
      if (el.id && !nachId.has(el.id)) nachId.set(el.id, el);
    }
    const karteZu = (id) => {
      const el = nachId.get(id) || null;
      if (!el || !ueberschreibung || ueberschreibung.id !== id) return el;
      return { ...el, ...ueberschreibung.rechteck };
    };
    zeichneLinienEbene(linienEbene, {
      linien: linien(),
      karteZu,
      gewaehlt: verbindungen ? verbindungen.gewaehlteKennung() : null,
    });
  }

  // Wiederfinden der gewählten Fläche nach einer Neu-Übergabe. Die Stelle im
  // Dokument ist der beste Anker, weil sie eine Änderung an einer anderen
  // Fläche unbeschadet übersteht; der Titel trägt, wenn die Fence verschoben
  // wurde; die Position ist der letzte Rückfall. Findet nichts, greift die
  // erste Fläche — AK7: eine gelöschte Fläche darf keine leere Ansicht
  // hinterlassen.
  function findeWieder(vorher) {
    if (!vorher || flaechen.length === 0) return 0;
    const perZeile = flaechen.findIndex((f) => f.startZeile === vorher.startZeile);
    if (perZeile >= 0) return perZeile;
    if (vorher.titel) {
      const perTitel = flaechen.findIndex((f) => f.titel === vorher.titel);
      if (perTitel >= 0) return perTitel;
    }
    return Math.min(gewaehlt, flaechen.length - 1);
  }

  // 4T-001677: Die Leiste erscheint erst ab zwei Flächen. Ein Reiter, der als
  // einziger dasteht, ist kein Zugang, sondern verschenkte Höhe.
  function zeichneReiter() {
    reiterleiste.innerHTML = '';
    reiterleiste.hidden = flaechen.length < 2;
    if (reiterleiste.hidden) return;
    flaechen.forEach((flaeche, i) => {
      const reiter = document.createElement('button');
      reiter.type = 'button';
      reiter.className = i === gewaehlt ? 'canvas-reiter canvas-reiter-aktiv' : 'canvas-reiter';
      reiter.setAttribute('role', 'tab');
      reiter.setAttribute('aria-selected', String(i === gewaehlt));
      // Der abgeleitete Titel, sonst die Zählung. Sie steht hier und nicht im
      // Kern, weil sie übersetzt werden muss und der Kern keine Sprache kennt.
      const beschriftung = flaeche.titel || t('canvas.flaecheNummer').replace('{n}', String(i + 1));
      reiter.textContent = beschriftung;
      reiter.title = beschriftung;
      reiter.addEventListener('click', () => waehleFlaeche(i));
      reiterleiste.appendChild(reiter);
    });
  }

  function waehleFlaeche(index) {
    if (index === gewaehlt || index < 0 || index >= flaechen.length) return;
    gewaehlt = index;
    model = flaechen[gewaehlt].model;
    // 4T-001654: Die gewählte Karte gehört zur alten Fläche; auf der neuen gäbe
    // es sie im besten Fall unter derselben Kennung als anderes Element.
    if (bedienung) bedienung.zuruecksetzen();
    if (verbindungen) verbindungen.zuruecksetzen();
    if (formen) formen.zuruecksetzen();
    if (gruppen) gruppen.zuruecksetzen();
    if (verweisKarten) verweisKarten.zuruecksetzen();
    // Jede Fläche hat ihr eigenes Koordinatensystem; der Ausschnitt der
    // vorigen wäre auf der neuen bedeutungslos. Deshalb wird beim Wechsel
    // eingepasst statt Zoom und Verschiebung mitzunehmen.
    zeichneReiter();
    render();
    fit();
  }

  function zeigeHinweis() {
    if (!hinweisSchluessel) {
      hinweis.hidden = true;
      hinweis.textContent = '';
      return;
    }
    hinweis.hidden = false;
    let text = t(hinweisSchluessel);
    for (const [name, wert] of Object.entries(hinweisWerte || {})) {
      text = text.replace(`{${name}}`, String(wert));
    }
    hinweis.textContent = text;
  }

  function render() {
    linienEbene.textContent = '';
    kartenEbene.innerHTML = '';
    // Befund 1 vom 2026-09-10: Die Klasse trägt allein die Zeiger-Form und die
    // Ansprechbarkeit der Karten; was die Fläche **tut**, entscheidet sie in
    // JavaScript. Eine Zusage, die nur im Stilblatt steht, hielte kein Skript.
    wurzelEl.classList.toggle('canvas-nur-ansicht', !aenderbar());
    if (!model) {
      zeigeHinweis();
      return;
    }

    // Die Reihenfolge in der Fence **ist** die Stapel-Reihenfolge (G3): Das
    // zuletzt genannte Element liegt oben, weil es zuletzt angehängt wird.
    // Verbindungen liegen als eigene Ebene unter allen Elementen — sie sind
    // Beziehung und nicht Inhalt.
    zeichneLinien();
    // 4T-001701: **Eine** Schleife über die Element-Liste statt einer je Art.
    // Genau das bindet die Reihenfolge im Baum an die Reihenfolge im Modell —
    // und zwar bei jedem Neuzeichnen, ohne zweiten Ordnungs-Träger. Ein
    // `z-index` käme hier nicht in Frage: Er wäre die zweite Quelle derselben
    // Aussage, die G3 gerade vermeidet.
    const aend = aenderbar();
    for (const el of stapelElemente()) {
      if (el.art === 'karte') kartenEbene.appendChild(zeichneKarte(el));
      else if (el.art === 'form') kartenEbene.appendChild(zeichneForm(el, aend));
      // 4T-001702: Die Gruppe ist die dritte Art derselben Ebene. Dass sie im
      // Regelfall ganz hinten liegt, ist keine Aussage dieser Schleife,
      // sondern der Stelle, an die der Kern sie beim Anlegen setzt.
      else if (el.art === 'gruppe') kartenEbene.appendChild(zeichneGruppe(el, aend));
    }

    zeigeHinweis();
    anwendenTransform();
    // 4T-001654: Die Karten sind frisch; Auswahl und eine wartende Eingabe
    // hängen an der Kennung und werden hier wieder angelegt.
    if (bedienung) bedienung.nachRender();
    // 4T-001655: Danach die Verbindungen — Auswahl, Leiste und die
    // Anschluss-Griffe an der gewählten Karte.
    if (verbindungen) verbindungen.nachRender();
    // 4T-001701: Zuletzt die Formen — Auswahl und Leiste.
    if (formen) formen.nachRender();
    // 4T-001702: und die Gruppen, aus demselben Grund.
    if (gruppen) gruppen.nachRender();
    // 4T-001747: zuletzt die Leiste an der gewählten Karte — sie hängt an der
    // Auswahl, die `bedienung.nachRender()` gerade wieder angelegt hat.
    if (verweisKarten) verweisKarten.nachRender();
  }

  // --- Navigation ------------------------------------------------------------

  let ziehen = null;

  // Das Ziehen der Fläche beginnt nur auf dem Hintergrund. Ginge es auch auf
  // einer Karte los, ließe sich in ihr weder Text markieren noch scrollen —
  // und ab 4T-001654 wäre das Ziehen der Karte selbst nicht mehr davon zu
  // unterscheiden. Was als Hintergrund gilt, sagt `istHintergrund` aus der
  // Verbindungs-Zeichnung: Seit 4T-001655 gehören die Linien samt Leiste und
  // Beschriftungs-Eingabe dazu, und die Regel steht nur an einer Stelle.
  buehne.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0 || !istHintergrund(ev.target)) return;
    ziehen = { x: ev.clientX, y: ev.clientY };
    wurzelEl.classList.add('canvas-ziehend');
  });

  // Fenster-weite Listener, weil das Ziehen über den Rand der Bühne hinausgeht.
  // Sie werden in destroy() wieder abgemeldet; ohne das überlebte jede
  // geschlossene Ansicht als Leck im Fenster (Befund der Mindmap-Ansicht).
  function beiBewegung(ev) {
    if (!ziehen) return;
    tx += ev.clientX - ziehen.x;
    ty += ev.clientY - ziehen.y;
    ziehen.x = ev.clientX;
    ziehen.y = ev.clientY;
    anwendenTransform();
  }

  function beiLoslassen() {
    if (!ziehen) return;
    ziehen = null;
    wurzelEl.classList.remove('canvas-ziehend');
  }

  window.addEventListener('mousemove', beiBewegung);
  window.addEventListener('mouseup', beiLoslassen);

  // Steht der Zeiger über einem Karten-Inhalt, der mehr trägt als er zeigt,
  // gehört das Rad der Karte und nicht der Fläche (Leitplanke 3: «Passt der
  // Inhalt nicht, wird in der Karte gescrollt»). Sonst zoomt die Fläche.
  function scrollbarerInhaltUnter(ziel) {
    if (!ziel || typeof ziel.closest !== 'function') return null;
    const inhalt = ziel.closest('.canvas-karte-inhalt');
    if (!inhalt) return null;
    return inhalt.scrollHeight > inhalt.clientHeight ? inhalt : null;
  }

  function beiRad(ev) {
    if (scrollbarerInhaltUnter(ev.target)) return;
    ev.preventDefault();
    const rect = buehne.getBoundingClientRect ? buehne.getBoundingClientRect() : null;
    const px = (ev.clientX || 0) - (rect ? rect.left : 0);
    const py = (ev.clientY || 0) - (rect ? rect.top : 0);
    const naechste = zoomUmPunkt(
      { scale, tx, ty },
      px,
      py,
      Math.exp(-(ev.deltaY || 0) * ZOOM_EMPFINDLICHKEIT),
    );
    if (naechste.scale === scale) return;
    scale = naechste.scale;
    tx = naechste.tx;
    ty = naechste.ty;
    anwendenTransform();
  }

  buehne.addEventListener('wheel', beiRad);

  // --- Bedienung der Karten (4T-001654) ---------------------------------------
  //
  // Die Ansicht reicht ihre DOM-Anker und den Blick auf Lage und Modell herein;
  // die Bedienung gibt den neu serialisierten Rumpf zurück. Kein Zustand liegt
  // doppelt vor.
  bedienung = createKartenBedienung({
    wurzelEl,
    buehne,
    kartenEbene,
    lage: () => ({ scale, tx, ty }),
    modell: () => model,
    flaeche: () => flaechen[gewaehlt] || null,
    neuZeichnen: render,
    aenderbar,
    beiAenderung,
    // 4T-001654: Die Fläche nimmt Strg+Z entgegen und gibt es weiter; die
    // Historie selbst liegt beim Editor der Spalte.
    beiRueckgaengig:
      typeof options.rueckgaengig === 'function' ? () => options.rueckgaengig() : null,
    beiWiederholen: typeof options.wiederholen === 'function' ? () => options.wiederholen() : null,
    beiFreigabe: freigabeMelden,
    // 4T-001655: Die drei Berührungspunkte zur Bedienung der Verbindungen.
    beiKartenWahl: (id) => {
      if (verbindungen) verbindungen.beiKartenWahl(id);
      // 4T-001701: Genau ein Element ist gewählt (V3), jetzt über drei Arten.
      // Gemeldet wird jeder Wechsel, gehandelt nur bei einer **neuen** Wahl:
      // Ein `null` kommt auch von der Formen-Bedienung selbst, und sie hübe
      // sich sonst die eigene Auswahl gleich wieder auf.
      if (formen && id) formen.beiFremdWahl();
      // 4T-001702: die Gruppe als vierte Art derselben Regel.
      if (gruppen && id) gruppen.beiFremdWahl();
      // 4T-001747: Die Leiste der Karte hängt an **dieser** Auswahl; sie
      // erscheint und verschwindet mit ihr.
      if (verweisKarten) verweisKarten.beiKartenWahl(id);
    },
    // 4T-001747 (F3): Der Doppelklick auf den Körper einer Verweis-Karte öffnet
    // das Ziel, statt die Rohtext-Eingabe zu öffnen — der Körper ist nicht
    // änderbar, und die Eingabe hätte dort keinen Gegenstand.
    beiVerweisKoerper: (id) => {
      if (verweisKarten) void verweisKarten.oeffneZielVon(id);
    },
    beiZugLage: (id, rechteck) => {
      if (verbindungen) verbindungen.beiZugLage(id, rechteck);
    },
    beiTasteOhneKarte: (ev) => {
      if (verbindungen) verbindungen.beiTaste(ev);
      if (gruppen) gruppen.beiTaste(ev);
      // 4T-001701: `Entf` und `Escape` richten sich nach dem gewählten
      // Element; genau eines der drei Module hat eine Auswahl, also greift
      // auch nur eines. Der Weg führt weiterhin über den einen `keydown` der
      // Fläche — ein zweiter Listener hätte eine Reihenfolge, die niemand mehr
      // überblickt.
      if (formen) formen.beiTaste(ev);
    },
    beiHintergrund: () => {
      if (verbindungen) {
        verbindungen.beendeBearbeitung();
        verbindungen.waehleLinie(null);
      }
      // 4T-001701: Der Klick daneben hebt **jede** Auswahl auf, sonst bliebe
      // eine gewählte Form samt ihrer Leiste stehen.
      if (formen) {
        formen.beendeBearbeitung();
        formen.waehleForm(null);
      }
      if (gruppen) {
        gruppen.beendeBearbeitung();
        gruppen.waehleGruppe(null);
      }
    },
  });

  // --- Bedienung der Verbindungen (4T-001655) ----------------------------------
  verbindungen = createVerbindungsBedienung({
    kartenEbene,
    svgViewport,
    t,
    modell: () => model,
    bedienung,
    zeichneLinien,
    aenderbar,
    beiFreigabe: freigabeMelden,
    // 4T-001701: Eine gewählte Verbindung hebt die Wahl einer Form auf — die
    // dritte Kante des Auswahl-Dreiecks (V3). Sie läuft über einen Rückruf und
    // nicht über einen Import, damit die Verbindungs-Bedienung die Formen
    // weiterhin nicht kennen muss.
    beiLinienWahl: () => {
      if (formen) formen.beiFremdWahl();
      if (gruppen) gruppen.beiFremdWahl();
    },
  });

  // --- Bedienung der Formen (4T-001701) ----------------------------------------
  formen = createFormenBedienung({
    kartenEbene,
    t,
    modell: () => model,
    bedienung,
    aenderbar,
    beiFreigabe: freigabeMelden,
    waehleLinie: (id) => {
      if (verbindungen) verbindungen.waehleLinie(id);
    },
    waehleGruppe: () => {
      if (gruppen) gruppen.beiFremdWahl();
    },
  });

  // --- Bedienung der Gruppen (4T-001702) ---------------------------------------
  gruppen = createGruppenBedienung({
    kartenEbene,
    t,
    modell: () => model,
    bedienung,
    aenderbar,
    beiFreigabe: freigabeMelden,
    waehleLinie: (id) => {
      if (verbindungen) verbindungen.waehleLinie(id);
    },
    waehleForm: () => {
      if (formen) formen.beiFremdWahl();
    },
  });

  // --- Bedienung der Verweis-Karten (4T-001747) ---------------------------------
  verweisKarten = createVerweisKartenBedienung({
    kartenEbene,
    t,
    modell: () => model,
    bedienung,
    aenderbar,
    beiFreigabe: freigabeMelden,
    oeffneZiel: typeof options.oeffneZiel === 'function' ? options.oeffneZiel : null,
    oeffneBild: typeof options.oeffneBild === 'function' ? options.oeffneBild : null,
    zielVorschlaege: typeof options.zielVorschlaege === 'function' ? options.zielVorschlaege : null,
    bildVorschlaege: typeof options.bildVorschlaege === 'function' ? options.bildVorschlaege : null,
  });

  // Eine zurückgestellte Neu-Übergabe kommt erst, wenn **keine** der drei
  // Bedienungen mehr etwas offen hat: Die eine weiß nichts vom Zug der anderen,
  // und ein Neuzeichnen mitten in einer Handlung zerstörte sie.
  //
  // **Übernommen wird der Stand von JETZT, nicht der zurückgestellte Schnappschuss**
  // (4T-001747, Abnahme-Befund des Product Owners vom 2026-09-14 «Verschieben
  // auf dem Canvas geht nicht»). Der zurückgestellte Schnappschuss beschreibt
  // das Dokument, wie es **vor** der Handlung aussah; die Handlung selbst hat
  // es inzwischen geändert. Ihn nachträglich anzuwenden setzt die Fläche auf
  // den Stand vor der Handlung zurück — beim Ziehen sprang die Karte im Moment
  // des Loslassens an ihren alten Platz und erst mit dem nächsten Takt der
  // Live-Aktualisierung wieder an den neuen. Schlimmer als das Springen ist,
  // dass mit ihm auch der veraltete `rumpf` der Fläche zurückkehrt: Die
  // **nächste** Handlung misst dann gegen ihn und wird verworfen.
  //
  // Gefragt wird deshalb die Einbettung, die den Dokument-Stand hält; der
  // zurückgestellte Schnappschuss bleibt allein der Rückfall für einen
  // Aufrufer ohne diesen Weg (der jsdom-Prüffall, der `setFlaechen` selbst
  // ruft).
  function freigabeMelden() {
    if (!ausstehend || blockiert()) return;
    const wartend = ausstehend;
    ausstehend = null;
    if (typeof options.neuUebergeben === 'function') options.neuUebergeben();
    else uebernimmFlaechen(wartend.neueFlaechen, wartend.opts);
  }

  function blockiert() {
    return (
      (!!bedienung && bedienung.blockiert()) ||
      (!!verbindungen && verbindungen.blockiert()) ||
      (!!formen && formen.blockiert()) ||
      (!!gruppen && gruppen.blockiert()) ||
      (!!verweisKarten && verweisKarten.blockiert())
    );
  }

  /**
   * Verschiebt das gewählte Element im Stapel (Story 4S-000932).
   *
   * **Die Ansicht ist der einzige Ort, der alle Auswahlen kennt** — jede
   * Bedienung führt ihre eigene, und genau eine davon ist gesetzt (V3). Sie
   * löst deshalb die Kennung auf und reicht sie an den einen Schreibweg
   * weiter; die Regel selbst steht im Kern, die Transaktion in der
   * Karten-Bedienung.
   *
   * Verbindungen kommen bewusst nicht vor: Sie liegen in einer eigenen Ebene
   * und sind von der Reihenfolge nicht berührt (E4).
   *
   * @param {string} befehl einer aus `STAPEL_BEFEHLE`.
   * @returns {boolean} `true`, wenn geschrieben wurde.
   */
  function verschiebeGewaehltesImStapel(befehl) {
    const id = gewaehltesElement();
    return !!id && bedienung.verschiebeImStapel(id, befehl);
  }

  /** Kennung des gewählten Elements der Stapel-Ebene, oder `null`. */
  function gewaehltesElement() {
    const karte = bedienung ? bedienung.gewaehlteKennung() : null;
    if (karte) return karte;
    const form = formen ? formen.gewaehlteKennung() : null;
    if (form) return form;
    // 4T-001702: Auch eine gewählte Gruppe bewegt sich im Stapel wie jedes
    // andere Element (AK15 der Story 4S-000931).
    return gruppen ? gruppen.gewaehlteKennung() : null;
  }

  // --- Kontextmenü der Fläche (4T-001683) --------------------------------------
  kontextmenue = createCanvasKontextmenue({
    wurzelEl,
    buehne,
    t,
    bedienung,
    verbindungen,
    formen,
    gruppen,
    verweisKarten,
    verschiebeImStapel: (id, befehl) => bedienung.verschiebeImStapel(id, befehl),
    zeigeMenue: typeof options.zeigeKontextmenue === 'function' ? options.zeigeKontextmenue : null,
    schliesseMenue:
      typeof options.schliesseKontextmenue === 'function' ? options.schliesseKontextmenue : null,
    menueOffen: typeof options.kontextmenueOffen === 'function' ? options.kontextmenueOffen : null,
  });

  /** Passt die Fläche in das Sichtfenster ein. */
  function fit() {
    // 4T-001701: über **alle** Elemente der Stapel-Ebene. Eine Fläche, deren
    // Formen außerhalb des eingepassten Ausschnitts lägen, hätte das Einpassen
    // nur halb getan.
    const rahmen = huelle(stapelElemente());
    if (!rahmen) return;
    const { breite, hoehe } = sichtMasse();
    const lage = einpassung(rahmen, breite, hoehe);
    if (!lage) return;
    scale = lage.scale;
    tx = lage.tx;
    ty = lage.ty;
    eingepasst = true;
    anwendenTransform();
  }

  // Der eigentliche Wechsel auf einen neuen Flächen-Stand; der Controller davor
  // entscheidet nur, ob er jetzt oder nach der laufenden Handlung stattfindet.
  function uebernimmFlaechen(neueFlaechen, opts) {
    const vorher = flaechen[gewaehlt] || null;
    flaechen = Array.isArray(neueFlaechen) ? neueFlaechen : [];
    // Die gewählte Fläche über eine Live-Aktualisierung hinweg wiederfinden:
    // zuerst über die Stelle im Dokument, dann über den Titel, zuletzt über
    // die Position. Ohne das spränge die Ansicht bei jedem Tastendruck auf
    // die erste Fläche zurück — und zwar genau dann, wenn der Nutzer an der
    // zweiten arbeitet.
    gewaehlt = findeWieder(vorher);
    model = flaechen[gewaehlt] ? flaechen[gewaehlt].model : null;
    pfad = typeof opts.pfad === 'string' ? opts.pfad : '';
    hinweisSchluessel = opts.hinweis || null;
    hinweisWerte = opts.hinweisWerte || null;
    zeichneReiter();
    render();
    // Einpassen erst, wenn es etwas einzupassen gibt — und nur beim ersten
    // Mal, damit eine Live-Aktualisierung Zoom und Ausschnitt nicht
    // zurücksetzt.
    if (!eingepasst && stapelElemente().length > 0) fit();
  }

  return {
    /**
     * Übernimmt die Flächen eines Dokuments und zeichnet die gewählte.
     *
     * @param {Array<object>} neueFlaechen Flächen des Dokuments, je mit
     *   `model`, `titel`, `startZeile` und (seit 4T-001654) `rumpf`.
     * @param {object} [opts]
     * @param {string} [opts.pfad] Dokument-Pfad, für die Bild-Auflösung im
     *   Karten-Inhalt.
     * @param {string} [opts.hinweis] Schlüssel eines Hinweis-Textes.
     * @param {object} [opts.hinweisWerte] Platzhalter des Hinweis-Textes.
     */
    setFlaechen(neueFlaechen, opts = {}) {
      if (blockiert()) {
        ausstehend = { neueFlaechen, opts };
        return;
      }
      uebernimmFlaechen(neueFlaechen, opts);
    },
    /**
     * Legt eine Karte an; ohne Punkt in der Mitte des sichtbaren Ausschnitts.
     * Der Weg des Kommandos aus Menü und Palette (4T-001654).
     */
    karteAnlegen(opts) {
      return bedienung ? bedienung.karteAnlegen(opts) : false;
    },
    /**
     * Legt eine Form an; ohne Punkt in der Mitte des sichtbaren Ausschnitts,
     * ohne Art als Rechteck (4T-001701). Der Weg des Kommandos aus Menü und
     * Palette; das Kontextmenü ruft dieselbe Handlung mit Klick-Stelle und Art.
     */
    formAnlegen(opts) {
      return formen ? formen.formAnlegen(opts) : false;
    },
    /**
     * Legt eine Gruppe an; ohne Punkt in der Mitte des sichtbaren Ausschnitts
     * (4T-001702). Der Weg des Kommandos aus Menü und Palette; das Kontextmenü
     * ruft dieselbe Handlung mit der Klick-Stelle.
     */
    gruppeAnlegen(opts) {
      return gruppen ? gruppen.gruppeAnlegen(opts) : false;
    },
    /**
     * Fragt das Ziel ab und legt danach eine Verweis-Karte an (4T-001747).
     * Der Weg des Kommandos aus Menü und Palette; das Kontextmenü ruft dieselbe
     * Handlung mit der Klick-Stelle.
     */
    verweisKarteAnlegen(opts) {
      return verweisKarten ? verweisKarten.verweisKarteAnlegen(opts) : false;
    },
    /** Fragt das Bild ab und legt danach eine Bild-Karte an (4T-001748). */
    bildKarteAnlegen(opts) {
      return verweisKarten ? verweisKarten.bildKarteAnlegen(opts) : false;
    },
    /** Verschiebt das gewählte Element im Stapel (Story 4S-000932). */
    verschiebeImStapel: verschiebeGewaehltesImStapel,
    /**
     * Kennung des gewählten Elements der Stapel-Ebene, oder `null`.
     *
     * Die Einbettung fragt sie, **bevor** sie verschiebt: Ein `false` des
     * Verschiebens allein sagte nicht, ob nichts gewählt war oder ob das
     * Element bereits ganz vorn lag — und der Hinweis an den Anwender muss
     * zwischen beidem unterscheiden.
     */
    gewaehltesElement,
    /** Wechselt die gezeigte Fläche; von außen für Prüfung und Bedienung. */
    waehleFlaeche,
    /**
     * Holt den Tastatur-Fokus auf die Fläche. Gerufen beim Eintritt in die
     * Ansicht: Der Editor ist dort versteckt und gibt den Fokus ab, und ohne
     * einen Träger erreichte weder `Entf` noch `Strg+Z` die Fläche (Befund des
     * Product Owners vom 2026-09-10).
     */
    fokussiere() {
      if (bedienung) bedienung.fokussiere();
    },
    fit,
    /** Setzt Zoom und Verschiebung auf den Ausgangswert zurück. */
    reset() {
      scale = 1;
      tx = 0;
      ty = 0;
      eingepasst = false;
      anwendenTransform();
    },
    getStats() {
      return {
        flaechen: flaechen.length,
        gewaehlt,
        reiterSichtbar: !reiterleiste.hidden,
        karten: karten().length,
        linien: linien().length,
        // 4T-001701: Die Zahl der Formen und die Abfolge der Element-Ebene.
        // Letztere ist die eine Aussage, an der sich die Stapel-Reihenfolge
        // ohne DOM-Umweg ablesen lässt.
        formen: stapelElemente().filter((el) => el.art === 'form').length,
        // 4T-001702: die Zahl der Gruppen, in derselben Lesart.
        gruppen: stapelElemente().filter((el) => el.art === 'gruppe').length,
        stapel: stapelElemente().map((el) => el.id),
        befunde: model && Array.isArray(model.errors) ? model.errors.length : 0,
        // 4T-001654: Kennung der gewählten Karte, `null` ohne Auswahl.
        gewaehlteKarte: bedienung ? bedienung.gewaehlteKennung() : null,
        // 4T-001655: Kennung der gewählten Verbindung. Genau eines von beiden
        // ist je gesetzt — auf der Fläche ist ein Element gewählt, nicht zwei.
        gewaehlteLinie: verbindungen ? verbindungen.gewaehlteKennung() : null,
        // 4T-001701: die dritte Auswahl. Genau eine der drei ist je gesetzt.
        gewaehlteForm: formen ? formen.gewaehlteKennung() : null,
        // 4T-001702: die vierte Auswahl. Genau eine der vier ist je gesetzt.
        gewaehlteGruppe: gruppen ? gruppen.gewaehlteKennung() : null,
        // Befund 1 vom 2026-09-10: Ohne diesen Wert ließe sich der
        // Anzeige-Modus nur an seinen Folgen ablesen.
        aenderbar: aenderbar(),
        scale,
        tx,
        ty,
      };
    },
    destroy() {
      window.removeEventListener('mousemove', beiBewegung);
      window.removeEventListener('mouseup', beiLoslassen);
      buehne.removeEventListener('wheel', beiRad);
      if (kontextmenue) kontextmenue.destroy();
      if (verweisKarten) verweisKarten.destroy();
      if (gruppen) gruppen.destroy();
      if (formen) formen.destroy();
      if (verbindungen) verbindungen.destroy();
      if (bedienung) bedienung.destroy();
      wurzelEl.remove();
    },
  };
}

export { ZOOM_MIN, ZOOM_MAX };
