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
// Bewusst abhängigkeitsfrei von api/i18n/app-state: Der Aufrufer injiziert `t`
// und `renderMarkdown` (Muster createMindmapView, createGraphView) — die
// Komponente bleibt zyklenfrei und in jsdom ohne window.api-Stub prüfbar.
// Farben kommen ausschließlich aus Theme-Variablen (styles/canvas.css, Klassen
// `canvas-*`); die Komponente setzt keine Farbwerte.
//
// Die reine Geometrie liegt prozessneutral in shared/canvas/canvas-geometrie.js;
// hier bleibt, was DOM, Ereignisse oder Übersetzungen braucht.
'use strict';

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
 * @param {Function} [options.rueckgaengig] () => boolean (injiziert,
 *   4T-001654). Ein Schritt zurück in der Historie des Dokuments; die Fläche
 *   kennt sie nicht und reicht die Taste nur weiter.
 * @param {Function} [options.wiederholen] () => boolean (injiziert).
 * @param {Function} [options.zeigeKontextmenue] ({x, y, eintraege}) => void
 *   (injiziert, 4T-001683). Baut das gemeinsame Kontextmenü des Fensters.
 *   Fehlt der Rückruf, hat die Fläche keinen Rechtsklick-Bedienort.
 * @param {Function} [options.schliesseKontextmenue] () => void (injiziert).
 * @param {Function} [options.kontextmenueOffen] () => boolean (injiziert).
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

    const inhalt = document.createElement('div');
    // `markdown-body` bringt die Typografie der Lese-Ansicht mit; ohne sie
    // sähe derselbe Text in der Karte anders aus als im Dokument.
    inhalt.className = 'canvas-karte-inhalt markdown-body';
    if (renderMarkdown) {
      try {
        inhalt.innerHTML = renderMarkdown(el.inhalt || '', pfad);
        // Der Karten-Inhalt ist ein erzeugter Teilbaum: Ohne den Schritt-Satz
        // bliebe alles inert, was die Render-Pipeline erst befüllt oder
        // bedienbar macht (Wächter 4T-001130).
        if (nachRender) nachRender(inhalt, pfad);
      } catch {
        // Ein Render-Fehler darf die ganze Fläche nicht leeren; die Karte
        // zeigt dann ihren Klartext.
        inhalt.textContent = el.inhalt || '';
      }
    } else {
      inhalt.textContent = el.inhalt || '';
    }
    karte.appendChild(inhalt);
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
    // Verbindungen liegen als eigene Ebene unter allen Karten — sie sind
    // Beziehung und nicht Inhalt.
    zeichneLinien();
    for (const el of karten()) {
      kartenEbene.appendChild(zeichneKarte(el));
    }

    zeigeHinweis();
    anwendenTransform();
    // 4T-001654: Die Karten sind frisch; Auswahl und eine wartende Eingabe
    // hängen an der Kennung und werden hier wieder angelegt.
    if (bedienung) bedienung.nachRender();
    // 4T-001655: Danach die Verbindungen — Auswahl, Leiste und die
    // Anschluss-Griffe an der gewählten Karte.
    if (verbindungen) verbindungen.nachRender();
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
    },
    beiZugLage: (id, rechteck) => {
      if (verbindungen) verbindungen.beiZugLage(id, rechteck);
    },
    beiTasteOhneKarte: (ev) => {
      if (verbindungen) verbindungen.beiTaste(ev);
    },
    beiHintergrund: () => {
      if (!verbindungen) return;
      verbindungen.beendeBearbeitung();
      verbindungen.waehleLinie(null);
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
  });

  // Eine zurückgestellte Neu-Übergabe kommt erst, wenn **keine** der beiden
  // Bedienungen mehr etwas offen hat: Die eine weiß nichts vom Zug der anderen,
  // und ein Neuzeichnen mitten in einer Handlung zerstörte sie.
  function freigabeMelden() {
    if (!ausstehend || blockiert()) return;
    const wartend = ausstehend;
    ausstehend = null;
    uebernimmFlaechen(wartend.neueFlaechen, wartend.opts);
  }

  function blockiert() {
    return (!!bedienung && bedienung.blockiert()) || (!!verbindungen && verbindungen.blockiert());
  }

  // --- Kontextmenü der Fläche (4T-001683) --------------------------------------
  kontextmenue = createCanvasKontextmenue({
    wurzelEl,
    buehne,
    t,
    bedienung,
    verbindungen,
    zeigeMenue: typeof options.zeigeKontextmenue === 'function' ? options.zeigeKontextmenue : null,
    schliesseMenue:
      typeof options.schliesseKontextmenue === 'function' ? options.schliesseKontextmenue : null,
    menueOffen: typeof options.kontextmenueOffen === 'function' ? options.kontextmenueOffen : null,
  });

  /** Passt die Fläche in das Sichtfenster ein. */
  function fit() {
    const rahmen = huelle(karten());
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
    if (!eingepasst && karten().length > 0) fit();
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
        befunde: model && Array.isArray(model.errors) ? model.errors.length : 0,
        // 4T-001654: Kennung der gewählten Karte, `null` ohne Auswahl.
        gewaehlteKarte: bedienung ? bedienung.gewaehlteKennung() : null,
        // 4T-001655: Kennung der gewählten Verbindung. Genau eines von beiden
        // ist je gesetzt — auf der Fläche ist ein Element gewählt, nicht zwei.
        gewaehlteLinie: verbindungen ? verbindungen.gewaehlteKennung() : null,
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
      if (verbindungen) verbindungen.destroy();
      if (bedienung) bedienung.destroy();
      wurzelEl.remove();
    },
  };
}

export { ZOOM_MIN, ZOOM_MAX };
