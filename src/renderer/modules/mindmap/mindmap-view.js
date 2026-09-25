// 4T-001046 (Epic 3E-000151): Mindmap-Renderer — zeichnet einen Knoten-Baum des
// Kerns (mindmap-core.js) als SVG und trägt die gesamte Interaktion: Klappen
// einzeln und rekursiv, Zoom um den Zeiger, Verschieben der Fläche,
// Einpassen, Notiz-Popover und den Sprung zur Quellzeile.
//
// Die reinen Formen (Kanten-Pfad, Anfasser-Lage, Notiz-Symbol) liegen seit
// 4T-001049 in mindmap-formen.js; hier bleibt, was Sitzungs-Zustand, Ereignisse
// oder Übersetzungen braucht.
//
// Bewusst abhängigkeitsfrei von api/i18n/app-state: Der Aufrufer injiziert t
// und den Sprung-Rückruf (Muster createGraphView, 4T-000454) — die Komponente
// bleibt zyklenfrei und in jsdom ohne window.api-Stub testbar. Farben kommen
// ausschließlich aus Theme-Variablen (styles/mindmap.css, Klassen mindmap-*);
// die Komponente setzt keine Farbwerte.
//
// Der Klapp-Zustand lebt hier und nur für die Sitzungs-Dauer (Konzept-
// Entscheidung vom 2026-08-14): Er wird weder in das Dokument noch in eine
// Begleitdatei geschrieben. Über eine Neu-Übergabe des Baums (Live-
// Aktualisierung) hinweg bleibt er erhalten, weil er an einem Schlüssel aus
// Quellzeile und Titel hängt und nicht an der Knoten-Identität.
//
// 4T-001893 (Epic 3E-000324): Die Ansicht trägt die Treffer der Suchleiste —
// Hervorhebung, aktueller Treffer, Aufklappen der Vorfahren und das Zentrieren
// eines Knotens. Was ein Treffer ist und welcher der aktuelle, entscheidet
// mindmap-suche.js; hier liegt nur, was die Zeichnung dafür können muss. Die
// Treffer hängen am selben Schlüssel wie der Klapp-Zustand und überleben
// deshalb jede Neu-Zeichnung.
'use strict';

import { layoutMindmap } from '../../../shared/mindmap-core.js';
// Die reinen Formen der Zeichnung liegen seit 4T-001049 nebenan; hier bleibt,
// was Zustand, Ereignisse und Übersetzung braucht.
import {
  SVG_NS,
  ANFASSER_RADIUS,
  anfasserLage,
  kantenPfad,
  notizSymbol,
  wuchs,
} from './mindmap-formen.js';

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 5;
// Unterhalb dieser Maus-Bewegung (px) gilt ein Ziehen als Klick.
const CLICK_MOVE_THRESHOLD = 3;
// Höhe einer Textzeile im Knoten; hält Messung und Zeichnung beieinander.
const ZEILEN_HOEHE = 18;

// Ast-Farben: Nummern statt Werte. Die Zuordnung Nummer zu Farbe steht im
// Stilblatt (mindmap-ast-1 bis mindmap-ast-8), damit die Farbschemas sie
// tragen und die Komponente farbfrei bleibt.
const AST_FARBEN = 8;

let instanzZaehler = 0;

/**
 * Erzeugt eine Mindmap-Ansicht im Container.
 *
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {Function} [options.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} [options.onJumpToLine] (zeile) => void, Klick auf den Text.
 * @returns {object} Controller mit setTree, fit, getStats und destroy.
 */
export function createMindmapView(container, options = {}) {
  const t = typeof options.t === 'function' ? options.t : (key) => key;
  const onJumpToLine = typeof options.onJumpToLine === 'function' ? options.onJumpToLine : () => {};
  const instanzId = ++instanzZaehler;

  // Sitzungs-Zustand.
  const eingeklappt = new Set(); // Schlüssel der eingeklappten Knoten
  let baum = null;
  let darstellung = {};
  let gekappt = false;
  let sichtbareKnoten = 0;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  // 4T-001893: Treffer der Suche als Schlüssel-Mengen; die gezeichneten Knoten
  // je Schlüssel, damit eine neue Treffer-Lage ohne Neu-Zeichnung anliegt.
  let treffer = new Set();
  let trefferNotiz = new Set();
  let trefferAktuell = null;
  const gruppen = new Map();

  // DOM-Grundgerüst: Wrapper mit SVG, Hinweis-Zeile und Notiz-Popover.
  const wurzelEl = document.createElement('div');
  wurzelEl.className = 'mindmap-view';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'mindmap-svg');
  svg.setAttribute('data-mindmap-id', String(instanzId));
  const viewport = document.createElementNS(SVG_NS, 'g');
  viewport.setAttribute('class', 'mindmap-viewport');
  const kantenEbene = document.createElementNS(SVG_NS, 'g');
  kantenEbene.setAttribute('class', 'mindmap-kanten');
  const knotenEbene = document.createElementNS(SVG_NS, 'g');
  knotenEbene.setAttribute('class', 'mindmap-knoten');
  viewport.appendChild(kantenEbene);
  viewport.appendChild(knotenEbene);
  svg.appendChild(viewport);
  const hinweis = document.createElement('div');
  hinweis.className = 'mindmap-hinweis';
  hinweis.hidden = true;
  const popover = document.createElement('div');
  popover.className = 'mindmap-popover';
  popover.hidden = true;
  wurzelEl.appendChild(svg);
  wurzelEl.appendChild(hinweis);
  wurzelEl.appendChild(popover);
  container.appendChild(wurzelEl);

  // --- Hilfsfunktionen -------------------------------------------------------

  // Schlüssel eines Knotens für den Klapp-Zustand. Quellzeile plus Titel
  // überlebt eine Neu-Übergabe des Baums, solange die Stelle dieselbe ist.
  function schluessel(knoten) {
    return `${knoten.zeile == null ? '?' : knoten.zeile}:${knoten.titel}`;
  }

  function alleKnoten(wurzel) {
    const out = [];
    const lauf = (k) => {
      out.push(k);
      (k.kinder || []).forEach(lauf);
    };
    if (wurzel) lauf(wurzel);
    return out;
  }

  // Sichtbare Knoten: wie alleKnoten, aber unter einem eingeklappten Knoten
  // wird nicht weitergelaufen.
  function sichtbareListe() {
    const out = [];
    const lauf = (k) => {
      out.push(k);
      if (eingeklappt.has(schluessel(k))) return;
      (k.kinder || []).forEach(lauf);
    };
    if (baum) lauf(baum);
    return out;
  }

  function anwendenTransform() {
    viewport.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
  }

  // Textmessung im echten Browser. Liefert die Umgebung keine Breite (jsdom),
  // gibt die Funktion null zurück und der Kern schätzt selbst.
  function messen(knoten) {
    const mess = document.createElementNS(SVG_NS, 'text');
    mess.setAttribute('class', 'mindmap-titel');
    mess.textContent = knoten.titel || '';
    knotenEbene.appendChild(mess);
    let breite;
    try {
      breite = typeof mess.getComputedTextLength === 'function' ? mess.getComputedTextLength() : 0;
    } catch {
      breite = 0;
    }
    mess.remove();
    if (!breite) return null;
    const hoechst = Number.isFinite(darstellung.hoechstBreite) ? darstellung.hoechstBreite : 320;
    const zeilen = Math.max(1, Math.ceil(breite / hoechst));
    return {
      breite: Math.min(breite, hoechst) + 20,
      hoehe: ZEILEN_HOEHE * zeilen + 10,
    };
  }

  // Ast-Farbnummer: je Kind der Wurzel eine, ab der Einfrier-Ebene erbt der
  // ganze Teilbaum die Farbe seines Hauptastes (Muster colorFreezeLevel).
  function farbNummer(knoten, tiefe, geerbt, index) {
    const einfrier = Number.isFinite(darstellung.farbEinfrierEbene)
      ? darstellung.farbEinfrierEbene
      : 1;
    if (tiefe === 0) return 0;
    if (tiefe <= einfrier) return (index % AST_FARBEN) + 1;
    return geerbt;
  }

  // --- Zeichnen --------------------------------------------------------------

  function zeichneKnoten(knoten, farbe) {
    // 4T-001049: Die Wuchsrichtung des Knotens bestimmt, wo Beschriftung,
    // Anfasser und Notiz-Symbol sitzen. Der Text bleibt in **jeder** Lage
    // waagerecht (AK6): Gedreht wird die Anordnung, nie die Beschriftung.
    const { nachLinks } = wuchs(knoten);

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'mindmap-knoten-gruppe');
    g.setAttribute('data-mindmap-farbe', String(farbe));
    g.setAttribute('data-mindmap-schluessel', schluessel(knoten));
    g.setAttribute('transform', `translate(${knoten.x} ${knoten.y})`);

    const titel = document.createElementNS(SVG_NS, 'text');
    titel.setAttribute('class', 'mindmap-titel');
    titel.setAttribute('dy', '0.32em');
    // Bei Wuchs nach links steht der Text am rechten Rand des Knotens, damit
    // die freie Fläche zum Ast-Ende hin liegt wie in der Gegenrichtung.
    if (nachLinks) {
      titel.setAttribute('x', String(knoten.breite));
      titel.setAttribute('text-anchor', 'end');
    }
    titel.textContent = knoten.titel || '';
    if (knoten.zeile != null) {
      titel.classList.add('mindmap-titel-springbar');
      titel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onJumpToLine(knoten.zeile);
      });
    }
    g.appendChild(titel);

    // Unterstreichung des Textes. Bei waagerechtem Wuchs ist ihr Ende
    // zugleich das Ast-Ende, an dem die Kante zum Kind ansetzt; bei
    // senkrechtem Wuchs bleibt sie reine Beschriftungs-Linie, weil die Kante
    // dort oben oder unten aus dem Knoten geht.
    const linie = document.createElementNS(SVG_NS, 'line');
    linie.setAttribute('class', 'mindmap-unterstrich');
    linie.setAttribute('x1', '0');
    linie.setAttribute('x2', String(knoten.breite));
    linie.setAttribute('y1', String(knoten.hoehe / 2 - 2));
    linie.setAttribute('y2', String(knoten.hoehe / 2 - 2));
    g.appendChild(linie);

    const hatKinder = (knoten.kinder || []).length > 0;
    if (hatKinder) {
      const anfasser = document.createElementNS(SVG_NS, 'circle');
      const zu = eingeklappt.has(schluessel(knoten));
      anfasser.setAttribute(
        'class',
        zu ? 'mindmap-anfasser mindmap-anfasser-zu' : 'mindmap-anfasser',
      );
      const { cx, cy } = anfasserLage(knoten);
      anfasser.setAttribute('cx', String(cx));
      anfasser.setAttribute('cy', String(cy));
      anfasser.setAttribute('r', String(ANFASSER_RADIUS));
      const titelEl = document.createElementNS(SVG_NS, 'title');
      titelEl.textContent = t('mindmap.toggle');
      anfasser.appendChild(titelEl);
      anfasser.addEventListener('click', (ev) => {
        ev.stopPropagation();
        klappen(knoten, ev.ctrlKey || ev.metaKey);
      });
      g.appendChild(anfasser);
    }

    if ((knoten.notizen || []).length > 0) {
      g.appendChild(zeichneNotizSymbol(knoten));
    }

    gruppen.set(schluessel(knoten), { g, knoten });
    markiere(g, knoten);
    return g;
  }

  // --- Treffer der Suche (4T-001893) -------------------------------------------

  function kindMitKlasse(g, klasse) {
    for (const kind of g.children) {
      if ((kind.getAttribute('class') || '').split(' ').includes(klasse)) return kind;
    }
    return null;
  }

  // Hervorhebung eines Knotens nach der aktuellen Treffer-Lage. Der Rahmen liegt
  // als erstes Kind **hinter** der Beschriftung und verdeckt sie nicht; der
  // Hinweis «Treffer in der Notiz» erscheint als Kurzinfo über dem Knoten, weil
  // die Fundstelle dann nicht allein im sichtbaren Titel steht.
  function markiere(g, knoten) {
    const key = schluessel(knoten);
    const istTreffer = treffer.has(key);
    const inNotiz = istTreffer && trefferNotiz.has(key);
    g.classList.toggle('mindmap-treffer', istTreffer);
    g.classList.toggle('mindmap-treffer-aktuell', istTreffer && key === trefferAktuell);
    g.classList.toggle('mindmap-treffer-notiz', inNotiz);
    const rahmen = kindMitKlasse(g, 'mindmap-treffer-rahmen');
    if (istTreffer && !rahmen) {
      const neu = document.createElementNS(SVG_NS, 'rect');
      neu.setAttribute('class', 'mindmap-treffer-rahmen');
      neu.setAttribute('x', '-4');
      neu.setAttribute('y', String(-(knoten.hoehe || ZEILEN_HOEHE) / 2));
      neu.setAttribute('width', String((knoten.breite || 0) + 8));
      neu.setAttribute('height', String(knoten.hoehe || ZEILEN_HOEHE));
      neu.setAttribute('rx', '4');
      g.insertBefore(neu, g.firstChild);
    } else if (!istTreffer && rahmen) {
      rahmen.remove();
    }
    const hinweisEl = kindMitKlasse(g, 'mindmap-treffer-hinweis');
    if (inNotiz && !hinweisEl) {
      const neu = document.createElementNS(SVG_NS, 'title');
      neu.setAttribute('class', 'mindmap-treffer-hinweis');
      neu.textContent = t('search.mindmapNoteHit');
      g.appendChild(neu);
    } else if (!inNotiz && hinweisEl) {
      hinweisEl.remove();
    }
  }

  function setzeTreffer(liste, aktuell, notizListe) {
    treffer = new Set(liste || []);
    trefferNotiz = new Set(notizListe || []);
    trefferAktuell = aktuell == null ? null : aktuell;
    for (const { g, knoten } of gruppen.values()) markiere(g, knoten);
  }

  // Der Weg von der Wurzel zum Knoten mit dem Schlüssel, oder null.
  function pfadZu(key) {
    const pfad = [];
    const lauf = (k) => {
      pfad.push(k);
      if (schluessel(k) === key) return true;
      for (const kind of k.kinder || []) if (lauf(kind)) return true;
      pfad.pop();
      return false;
    };
    return baum && lauf(baum) ? pfad : null;
  }

  // Öffnet alle eingeklappten Vorfahren des Knotens; der Knoten selbst bleibt,
  // wie er ist. Gezeichnet wird nur, wenn sich etwas geöffnet hat.
  function klappeAufBis(key) {
    const pfad = pfadZu(key);
    if (!pfad) return false;
    let geaendert = false;
    for (const k of pfad.slice(0, -1)) {
      if (eingeklappt.delete(schluessel(k))) geaendert = true;
    }
    if (geaendert) render();
    return geaendert;
  }

  // Rückt einen gezeichneten Knoten in die Mitte des Sichtfensters. **Zentriert
  // und nicht eingepasst** wie `zentriereAuf` der räumlichen Arbeitsfläche: Die
  // Vergrößerung bleibt, damit das Weiterschalten den Maßstab nicht ändert.
  function zentriereKnoten(key) {
    const eintrag = gruppen.get(key);
    if (!eintrag || eintrag.knoten.x == null) return false;
    const { knoten } = eintrag;
    const rect = svg.getBoundingClientRect();
    const breite = rect && rect.width ? rect.width : 800;
    const hoehe = rect && rect.height ? rect.height : 600;
    tx = breite / 2 - (knoten.x + (knoten.breite || 0) / 2) * scale;
    ty = hoehe / 2 - knoten.y * scale;
    anwendenTransform();
    return true;
  }

  // Das Symbol selbst zeichnet mindmap-formen.js; hier kommt nur der Klick
  // dazu, weil das Popover Sitzungs-Zustand der Ansicht ist.
  function zeichneNotizSymbol(knoten) {
    const gruppe = notizSymbol(knoten, t('mindmap.note'));
    gruppe.addEventListener('click', (ev) => {
      ev.stopPropagation();
      zeigeNotizen(knoten, ev);
    });
    return gruppe;
  }

  function zeigeNotizen(knoten, ev) {
    popover.innerHTML = '';
    for (const notiz of knoten.notizen || []) {
      const teil = document.createElement('div');
      teil.className = `mindmap-notiz mindmap-notiz-${notiz.art}`;
      if (notiz.art === 'absatz' && notiz.html) teil.innerHTML = notiz.html;
      else teil.textContent = notiz.text || '';
      popover.appendChild(teil);
    }
    // 4T-001054: Erst einblenden, dann die Lage bestimmen — die eigene Größe
    // steht erst fest, wenn das Popover im Layout ist. Anschließend wird es in
    // die sichtbare Fläche geklemmt, damit es an einem Knoten am rechten oder
    // unteren Rand nicht außerhalb landet (zweite mögliche Ursache des
    // Befunds «Popover öffnet nicht»).
    popover.hidden = false;
    const rect = svg.getBoundingClientRect();
    const breite = rect && rect.width ? rect.width : 0;
    const hoehe = rect && rect.height ? rect.height : 0;
    let links = (ev.clientX || 0) - (rect ? rect.left : 0) + 12;
    let oben = (ev.clientY || 0) - (rect ? rect.top : 0) + 12;
    if (breite && hoehe) {
      const eigen = popover.getBoundingClientRect();
      const eigenBreite = eigen.width || 0;
      const eigenHoehe = eigen.height || 0;
      links = Math.max(4, Math.min(links, breite - eigenBreite - 4));
      oben = Math.max(4, Math.min(oben, hoehe - eigenHoehe - 4));
    }
    popover.style.left = `${links}px`;
    popover.style.top = `${oben}px`;
  }

  function verbergeNotizen() {
    popover.hidden = true;
  }

  function klappen(knoten, rekursiv) {
    const umschalten = (k, zu) => {
      if (zu) eingeklappt.add(schluessel(k));
      else eingeklappt.delete(schluessel(k));
    };
    const zu = !eingeklappt.has(schluessel(knoten));
    umschalten(knoten, zu);
    if (rekursiv) {
      for (const k of alleKnoten(knoten)) {
        if (k !== knoten && (k.kinder || []).length > 0) umschalten(k, zu);
      }
    }
    render();
  }

  function render() {
    verbergeNotizen();
    kantenEbene.innerHTML = '';
    knotenEbene.innerHTML = '';
    gruppen.clear();
    if (!baum) {
      hinweis.hidden = false;
      hinweis.textContent = t('mindmap.empty');
      return;
    }

    // Klapp-Zustand auf den Baum übertragen, damit der Kern ihn kennt.
    for (const k of alleKnoten(baum)) k.eingeklappt = eingeklappt.has(schluessel(k));

    // Einmal probemessen: Liefert die Umgebung keine Textbreite (jsdom),
    // bleibt die Schätzung des Kerns, und die Anordnung stimmt trotzdem.
    const kannMessen = messen(baum) !== null;
    layoutMindmap(baum, { ...darstellung, messen: kannMessen ? messen : undefined });

    const sichtbar = [];
    const lauf = (knoten, tiefe, farbe, index) => {
      const eigene = farbNummer(knoten, tiefe, farbe, index);
      sichtbar.push({ knoten, farbe: eigene });
      if (knoten.eingeklappt) return;
      (knoten.kinder || []).forEach((kind, i) =>
        lauf(kind, tiefe + 1, eigene, tiefe === 0 ? i : index),
      );
    };
    lauf(baum, 0, 0, 0);
    sichtbareKnoten = sichtbar.length;

    for (const { knoten, farbe } of sichtbar) {
      if (knoten.eingeklappt) continue;
      for (const kind of knoten.kinder || []) {
        const pfad = document.createElementNS(SVG_NS, 'path');
        pfad.setAttribute('class', 'mindmap-kante');
        pfad.setAttribute('data-mindmap-farbe', String(farbe === 0 ? 1 : farbe));
        pfad.setAttribute('d', kantenPfad(knoten, kind, darstellung.linienfuehrung));
        kantenEbene.appendChild(pfad);
      }
    }
    for (const { knoten, farbe } of sichtbar) {
      knotenEbene.appendChild(zeichneKnoten(knoten, farbe));
    }

    const leer = sichtbar.length <= 1 && (baum.kinder || []).length === 0;
    if (leer) {
      hinweis.hidden = false;
      hinweis.textContent = t('mindmap.empty');
    } else if (gekappt) {
      hinweis.hidden = false;
      hinweis.textContent = t('mindmap.truncated').replace('{count}', String(sichtbar.length));
    } else {
      hinweis.hidden = true;
    }
  }

  // --- Interaktion -----------------------------------------------------------

  let ziehen = null;

  svg.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    ziehen = { x: ev.clientX, y: ev.clientY, bewegt: 0 };
    wurzelEl.classList.add('mindmap-ziehend');
  });

  // Fenster-weite Listener, weil das Ziehen über den SVG-Rand hinausgeht.
  // Sie werden in destroy() wieder abgemeldet; ohne das überlebte jede
  // geschlossene Ansicht als Leck im Fenster.
  function beiBewegung(ev) {
    if (!ziehen) return;
    const dx = ev.clientX - ziehen.x;
    const dy = ev.clientY - ziehen.y;
    ziehen.bewegt += Math.abs(dx) + Math.abs(dy);
    ziehen.x = ev.clientX;
    ziehen.y = ev.clientY;
    tx += dx;
    ty += dy;
    anwendenTransform();
  }

  function beiLoslassen() {
    if (!ziehen) return;
    if (ziehen.bewegt <= CLICK_MOVE_THRESHOLD) verbergeNotizen();
    ziehen = null;
    wurzelEl.classList.remove('mindmap-ziehend');
  }

  window.addEventListener('mousemove', beiBewegung);
  window.addEventListener('mouseup', beiLoslassen);

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const px = (ev.clientX || 0) - (rect ? rect.left : 0);
    const py = (ev.clientY || 0) - (rect ? rect.top : 0);
    const naechste = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale * Math.exp(-ev.deltaY * 0.0015)));
    if (naechste === scale) return;
    // Fixpunkt-Zoom: Der Punkt unter dem Zeiger bleibt unter dem Zeiger.
    tx = px - ((px - tx) / scale) * naechste;
    ty = py - ((py - ty) / scale) * naechste;
    scale = naechste;
    anwendenTransform();
  });

  // --- Steuerung von außen ---------------------------------------------------

  // 4T-001049: Eingepasst wird über die **sichtbaren** Knoten und über beide
  // Achsen. Vorher schlug das Bild links an und maß nur bis zum rechten Rand;
  // das trug, solange die Wurzel links saß, und ließ die Lagen rechts, oben
  // und unten außerhalb des Sichtfensters landen. Verborgene Knoten bleiben
  // draußen, weil sie noch die Lage einer früheren Rechnung tragen.
  function fit() {
    if (!baum) return;
    const rect = svg.getBoundingClientRect();
    const breite = rect && rect.width ? rect.width : 800;
    const hoehe = rect && rect.height ? rect.height : 600;
    const knoten = sichtbareListe().filter((k) => k.x != null);
    if (knoten.length === 0) return;
    const links = Math.min(...knoten.map((k) => k.x));
    const rechts = Math.max(...knoten.map((k) => k.x + (k.breite || 0)));
    const oben = Math.min(...knoten.map((k) => k.y - (k.hoehe || 0) / 2));
    const unten = Math.max(...knoten.map((k) => k.y + (k.hoehe || 0) / 2));
    const spanneX = Math.max(1, rechts - links);
    const spanneY = Math.max(1, unten - oben);
    scale = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, Math.min(breite / spanneX, hoehe / spanneY) * 0.9),
    );
    tx = (breite - spanneX * scale) / 2 - links * scale;
    ty = (hoehe - spanneY * scale) / 2 - oben * scale;
    anwendenTransform();
  }

  return {
    /**
     * Übernimmt einen Baum des Kerns und zeichnet ihn.
     * Zoom und Verschiebung bleiben erhalten, damit eine Live-Aktualisierung
     * die Ansicht nicht zurücksetzt.
     */
    setTree(neuerBaum, opts = {}) {
      baum = neuerBaum || null;
      darstellung = opts.darstellung || {};
      gekappt = Boolean(opts.gekappt);
      if (baum && opts.anfangsTiefe != null && eingeklappt.size === 0) {
        // Anfangs ausgeklappte Tiefe: Alles darunter startet eingeklappt.
        const lauf = (k, tiefe) => {
          if (tiefe >= opts.anfangsTiefe && (k.kinder || []).length > 0) {
            eingeklappt.add(schluessel(k));
          }
          (k.kinder || []).forEach((kind) => lauf(kind, tiefe + 1));
        };
        lauf(baum, 0);
      }
      render();
    },
    fit,
    getStats() {
      return { sichtbareKnoten, gekappt, eingeklappt: eingeklappt.size, treffer: treffer.size };
    },
    /**
     * 4T-001893: Alle Knoten des Baums in Zeichen-Reihenfolge, auch die in
     * eingeklappten Teilbäumen, mit Schlüssel, Titel und den Texten der Notizen.
     * Knoten jenseits der Obergrenze des Kerns sind gar nicht im Baum.
     */
    knotenFuerSuche() {
      return alleKnoten(baum).map((k) => ({
        schluessel: schluessel(k),
        titel: k.titel || '',
        notizen: (k.notizen || []).map((n) => (n && n.text) || ''),
      }));
    },
    /** 4T-001893: Treffer-Lage setzen (Schlüssel, aktueller, Treffer in der Notiz). */
    setzeTreffer,
    /** 4T-001893: Alle Hervorhebungen entfernen; Zoom und Lage bleiben. */
    loescheTreffer() {
      setzeTreffer([], null, []);
    },
    klappeAufBis,
    zentriereKnoten,
    destroy() {
      window.removeEventListener('mousemove', beiBewegung);
      window.removeEventListener('mouseup', beiLoslassen);
      verbergeNotizen();
      wurzelEl.remove();
    },
  };
}
