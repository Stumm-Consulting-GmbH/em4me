// 4T-001848 (Epic 3E-000110): Zeichnung der Tafel — Spalten, Karten, Zähler,
// Erledigt-Zustand und die beiden leeren Zustände.
//
// **Abhängigkeits-frei wie `canvas-view.js` und `canvas-karten.js`**
// (Injektions-Bauweise): kein `app-state`, kein `api`, kein `i18n`. Übersetzung,
// Markdown-Kette, Schritt-Satz des erzeugten Teilbaums und die Auskunft über die
// Änderbarkeit kommen als Optionen herein. Damit ist dieses Modul ohne Preload
// und ohne Fenster-Zustand prüfbar, und der Ordner bleibt frei vom großen
// Datei-Zyklus des Anzeige-Prozesses.
//
// **Der Karten-Inhalt läuft durch die vorhandene Render-Kette, je Karte**
// (Entscheidung dieses Vorgangs, Weg A; Begründung im Lösungs-Kapitel). Die
// Karte schickt ihren Text samt eingerückten Folgezeilen als **ein**
// Markdown-Fragment durch denselben Aufruf, den die Lese-Ansicht und die
// Canvas-Karte benutzen, mit dem Pfad des Dokuments als Bezug: gleiche
// Verweis-Auflösung, gleiche Bild-Basis, gleiches Sanitizing. Nachgebaut wird
// nichts.
//
// **Der Erledigt-Zustand geht ausdrücklich NICHT durch die Kette.** Er wird aus
// dem Modell gezeichnet, weil das Kästchen einer Aufgaben-Zeile in der
// Lese-Ansicht ein bedienbares Listen-Element ist; auf der Karte ist es eine
// Zustands-Anzeige. Ein durchgereichtes `<li>` brächte die Listen-Struktur mit,
// die auf der Karte nichts zu suchen hat.
'use strict';

import { baueTagFuss, trenneKartenTags } from './kanban-tags.js';
import { baueMarkerReihe, ohneVorbildTermin } from './kanban-marker.js';

// Klassen-Namen an einer Stelle: Die Bedien-Vorgänge dieser Ausbaustufe suchen
// ihre Elemente über sie, und eine zweite Schreibweise irgendwo wäre ein
// stiller Fehlgriff.
export const TAFEL_KLASSE = 'kanban-tafel';
export const SPALTE_KLASSE = 'kanban-spalte';
// 4T-001907: Die Einhänge-Stelle im Kopf der Tafel. Ein Element dieser Klasse
// im Container überlebt jede Zeichnung — die Filter-Leiste der Suche
// (`kanban-suche.js`). Es bleibt im Baum stehen, statt entfernt und neu
// eingesetzt zu werden, weil ein entferntes Eingabefeld den Tastatur-Fokus
// verliert: Der Filter würde beim ersten Nachzug mitten im Wort verlassen.
export const KOPF_KLASSE = 'kanban-filter-leiste';
export const KARTE_KLASSE = 'kanban-karte';

// Die Befund-Codes des Format-Kerns, für die es einen eigenen Satz gibt. Ein
// unbekannter Code erscheint als er selbst statt als leere Zeile — eine
// Erweiterung des Kerns darf die Anzeige nicht stumm machen.
const BEFUND_SCHLUESSEL = {
  keinKopf: 'kanban.befund.keinKopf',
  kopfUnlesbar: 'kanban.befund.kopfUnlesbar',
  keinKennzeichen: 'kanban.befund.keinKennzeichen',
  einstellungsBlockOffen: 'kanban.befund.einstellungsBlockOffen',
};

function uebersetzer(anzeige) {
  return typeof anzeige.t === 'function' ? anzeige.t : (key) => key;
}

/**
 * Nimmt den gemeinsamen Einzug der Folgezeilen weg.
 *
 * Die Folgezeilen stehen im Dokument unter der Aufgaben-Zeile und sind
 * eingerückt; als Markdown-Fragment gelesen wäre derselbe Einzug ein
 * Code-Block. Entfernt wird der **kleinste gemeinsame** Einzug, damit eine
 * tiefer eingerückte Unterliste ihre Stufe behält.
 */
function ohneGemeinsamenEinzug(zeilen) {
  const inhaltsZeilen = zeilen.filter((z) => z.trim() !== '');
  if (inhaltsZeilen.length === 0) return zeilen.map(() => '');
  let kleinster = Infinity;
  for (const zeile of inhaltsZeilen) {
    const treffer = /^[ \t]*/.exec(zeile)[0];
    if (treffer.length < kleinster) kleinster = treffer.length;
  }
  return zeilen.map((z) => (z.trim() === '' ? '' : z.slice(kleinster)));
}

/**
 * Das Markdown-Fragment einer Karte: ihr Text und darunter ihre Folgezeilen.
 *
 * @param {object} karte Karte aus dem Modell des Format-Kerns.
 * @param {string[]} zeilen Zeilen-Puffer des Modells.
 * @returns {string}
 */
export function kartenFragment(karte, zeilen) {
  const text = karte && karte.text != null ? String(karte.text) : '';
  const folge = Array.isArray(karte && karte.folgeZeilen) ? karte.folgeZeilen : [];
  if (folge.length === 0) return text;
  const roh = folge.map((nr) => String(zeilen[nr] == null ? '' : zeilen[nr]).replace(/\r$/, ''));
  return [text, ...ohneGemeinsamenEinzug(roh)].join('\n');
}

// Der gerenderte Körper einer Karte. Ein Render-Fehler darf die ganze Tafel
// nicht leeren; die Karte zeigt dann ihren Klartext (Muster baueTextKarte der
// Canvas).
function baueKoerper(fragment, anzeige) {
  const inhalt = document.createElement('div');
  // `markdown-body` bringt die Typografie der Lese-Ansicht mit; ohne sie sähe
  // derselbe Text auf der Karte anders aus als im Dokument.
  inhalt.className = 'kanban-karte-inhalt markdown-body';
  if (typeof anzeige.renderMarkdown === 'function') {
    try {
      inhalt.innerHTML = anzeige.renderMarkdown(fragment, anzeige.pfad || '');
      // Der Karten-Inhalt ist ein erzeugter Teilbaum: Ohne den Schritt-Satz
      // bliebe alles inert, was die Render-Kette erst befüllt oder bedienbar
      // macht (Wächter 4T-001130).
      if (typeof anzeige.nachRender === 'function') anzeige.nachRender(inhalt, anzeige.pfad || '');
    } catch {
      inhalt.textContent = fragment;
    }
  } else {
    inhalt.textContent = fragment;
  }
  return inhalt;
}

/**
 * Baut das Element einer Karte.
 *
 * @param {object} karte Karte aus dem Modell.
 * @param {number} spalteNr Nummer ihrer Spalte im Modell.
 * @param {number} kartenNr Nummer der Karte in ihrer Spalte.
 * @param {string[]} zeilen Zeilen-Puffer des Modells.
 * @param {object} anzeige Injizierte Umgebung.
 * @returns {HTMLElement}
 */
export function zeichneKarte(karte, spalteNr, kartenNr, zeilen, anzeige) {
  const t = uebersetzer(anzeige);
  const el = document.createElement('article');
  el.className = KARTE_KLASSE;
  // Die Zeilen-Nummern sind der Rückweg ins Dokument: Die Bedien-Vorgänge
  // dieser Ausbaustufe schreiben über sie, statt die Karte im Text zu suchen.
  el.dataset.spalte = String(spalteNr);
  el.dataset.karte = String(kartenNr);
  el.dataset.zeile = String(karte.zeile);
  el.dataset.letzteZeile = String(karte.letzteZeile);
  el.dataset.status = karte.status == null ? ' ' : String(karte.status);
  // Auswahl und Tastatur-Erreichbarkeit: Die Karte ist eine Fläche, die man
  // ansehen und wählen kann — beides bleibt auch im nicht änderbaren Dokument
  // (Story 4S-000972, AK8).
  el.tabIndex = 0;
  el.setAttribute('aria-selected', 'false');
  if (karte.abgehakt) el.classList.add('kanban-karte-erledigt');

  const kasten = document.createElement('span');
  kasten.className = 'kanban-karte-kasten';
  // Das Zeichen im Kästchen ist das des Dokuments und wird als **Text**
  // gesetzt: Der Status-Katalog der Anwendung kennt frei belegte Zeichen, und
  // ein Zeichen aus fremdem Inhalt geht nie als Markup hinaus.
  kasten.textContent = karte.abgehakt ? String(karte.status) : '';
  const beschriftung = t(karte.abgehakt ? 'kanban.erledigt' : 'kanban.offen');
  kasten.title = beschriftung;
  kasten.setAttribute('role', 'img');
  kasten.setAttribute('aria-label', beschriftung);
  el.appendChild(kasten);

  // 4T-001904 (Story 4S-000980): Bei eingeschaltetem Schalter «Tags am
  // Kartenfuß» verlassen die Tags den angezeigten Text und stehen als eigene
  // Reihe unter ihm. Getrennt wird am Fragment und nur für die Anzeige; das
  // Dokument bleibt unberührt (AK4). Ohne Tag entsteht keine Reihe (AK5), und
  // bei ausgeschaltetem Schalter zeichnet die Karte wie bisher.
  //
  // 4T-001903 (Story 4S-000979): Ein lesbarer Vorbild-Termin verlässt den
  // angezeigten Text und steht als Abzeichen in der Reihe darunter, mit den
  // Marker-Segmenten der Zeile. Auch das nur für die Anzeige; die Reihe steht
  // zwischen Text und Tag-Fuß.
  const fragment = ohneVorbildTermin(kartenFragment(karte, zeilen), karte);
  const getrennt =
    anzeige.tagsAmFuss === true ? trenneKartenTags(fragment) : { text: fragment, tags: [] };
  el.appendChild(baueKoerper(getrennt.text, anzeige));
  const reihe = baueMarkerReihe(karte, {
    t,
    relativ: anzeige.terminRelativ === true,
    locale: anzeige.locale,
    jetzt: anzeige.jetzt,
    aenderbar: anzeige.aenderbar !== false,
  });
  if (reihe) el.appendChild(reihe);
  const fuss = baueTagFuss(getrennt.tags);
  if (fuss) el.appendChild(fuss);
  return el;
}

/**
 * Der Karten-Zähler einer Spalte, mit Obergrenze als «n/Obergrenze».
 *
 * 4T-001905 (Story 4S-000981): Überschreitet die Spalte ihre Obergrenze, trägt
 * sie die Klasse `kanban-spalte-ueberschritten`, und das Stilblatt hebt den
 * Zähler hervor. **Das ist ein Hinweis, keine Sperre** (Entscheidung des
 * Product Owners vom 2026-09-21): Anlegen und Hineinziehen bleiben möglich.
 * Erst n **größer** als die Obergrenze ist eine Überschreitung; eine volle
 * Spalte ist genau das, was die Obergrenze erlaubt. Der Hinweistext sagt die
 * Überschreitung auch in Worten, damit sie nicht allein an der Farbe hängt.
 */
function zeichneZaehler(spalte, el, t) {
  const anzahl = spalte.karten.length;
  const limit = Number.isSafeInteger(spalte.limit) && spalte.limit >= 1 ? spalte.limit : null;
  const zaehler = document.createElement('span');
  zaehler.className = 'kanban-spalte-zaehler';
  if (limit === null) {
    zaehler.textContent = String(anzahl);
    zaehler.title = t('kanban.kartenZahl').replace('{anzahl}', String(anzahl));
  } else {
    el.dataset.limit = String(limit);
    const ueber = anzahl > limit;
    if (ueber) el.classList.add('kanban-spalte-ueberschritten');
    zaehler.textContent = `${anzahl}/${limit}`;
    zaehler.title = t(ueber ? 'kanban.kartenZahlUeberschritten' : 'kanban.kartenZahlLimit')
      .replace('{anzahl}', String(anzahl))
      .replace('{limit}', String(limit));
  }
  zaehler.setAttribute('aria-label', zaehler.title);
  return zaehler;
}

function zeichneSpalte(spalte, spalteNr, zeilen, anzeige, aenderbar) {
  const t = uebersetzer(anzeige);
  const el = document.createElement('section');
  el.className = SPALTE_KLASSE;
  el.dataset.spalte = String(spalteNr);
  el.dataset.titelZeile = String(spalte.titelZeile);
  el.dataset.endeZeile = String(spalte.endeZeile);
  if (spalte.erledigt) el.dataset.erledigt = 'true';

  const kopf = document.createElement('header');
  kopf.className = 'kanban-spalte-kopf';
  const titel = document.createElement('h2');
  titel.className = 'kanban-spalte-titel';
  // Der Spalten-Titel ist der Rohtext der Überschrift und geht als Text
  // hinaus. Markdown im Titel zu rendern wäre eine eigene Zusage, die weder
  // Story noch Vorbild machen.
  //
  // 4T-001905 (Story 4S-000981): Die Obergrenze steht im Dokument als Zahl in
  // Klammern am Titel-Ende; auf der Tafel gehört sie zum Zähler und nicht in
  // die Überschrift (AK1).
  const text = spalte.titelOhneLimit == null ? spalte.titel : spalte.titelOhneLimit;
  titel.textContent = text;
  titel.title = text;
  kopf.appendChild(titel);
  kopf.appendChild(zeichneZaehler(spalte, el, t));
  // 4T-001851 (Story 4S-000976, AK5): Die Einstellung «hakt hineingezogene
  // Karten ab» ist eine Eigenschaft der Spalte und steht deshalb an ihrem Kopf.
  // Bis hierher lag der Zustand allein im Daten-Merkmal `data-erledigt` und war
  // damit auswertbar, aber unsichtbar; ein Schalter ohne sichtbare Wirkung ist
  // für den Anwender kein Schalter. Als Zeichen gesetzt, mit Beschriftung für
  // Vorlese-Programme (Muster des Karten-Kästchens darunter).
  if (spalte.erledigt) {
    const marke = document.createElement('span');
    marke.className = 'kanban-spalte-erledigt';
    marke.textContent = '✓';
    marke.title = t('kanban.spalteHaktAb');
    marke.setAttribute('role', 'img');
    marke.setAttribute('aria-label', marke.title);
    kopf.appendChild(marke);
  }
  el.appendChild(kopf);

  const liste = document.createElement('div');
  liste.className = 'kanban-spalte-karten';
  if (spalte.karten.length === 0) {
    // AK9: Eine leere Spalte sagt, dass sie leer ist. Eine Fläche ohne
    // Erklärung sieht aus wie ein Fehler der Anwendung.
    const leer = document.createElement('p');
    leer.className = 'kanban-leer-hinweis';
    leer.textContent = t('kanban.keineKarten');
    liste.appendChild(leer);
  } else {
    spalte.karten.forEach((karte, nr) => {
      liste.appendChild(zeichneKarte(karte, spalteNr, nr, zeilen, anzeige));
    });
  }
  el.appendChild(liste);
  // 4T-001849 (Story 4S-000973, AK1): Der Weg zur neuen Karte steht am Fuss
  // ihrer Spalte — dort, wo sie entsteht. Im nicht änderbaren Dokument
  // entfällt er vollständig statt deaktiviert zu erscheinen: Eine Handlung
  // anzubieten, die am Ende verworfen wird, ist schlimmer als sie gar nicht
  // erst anzubieten (Befund des Product Owners vom 2026-09-10 an der
  // räumlichen Arbeitsfläche).
  if (aenderbar) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'kanban-spalte-neu';
    knopf.textContent = t('kanban.karteHinzufuegen');
    knopf.title = t('kanban.karteHinzufuegen');
    el.appendChild(knopf);
  }
  return el;
}

function zeichneHinweis(text, klasse) {
  const el = document.createElement('p');
  el.className = `kanban-leer-hinweis ${klasse}`;
  el.textContent = text;
  return el;
}

// Die Befunde des Format-Kerns als verständlicher Kasten. Ein Befund führt nie
// zu einer leeren Fläche: Was der Kern lesen konnte, steht weiterhin darunter.
function zeichneBefunde(befunde, anzeige) {
  const t = uebersetzer(anzeige);
  const kasten = document.createElement('div');
  kasten.className = 'kanban-befunde';
  kasten.setAttribute('role', 'note');
  const titel = document.createElement('p');
  titel.className = 'kanban-befunde-titel';
  titel.textContent = t('kanban.befundeTitel');
  kasten.appendChild(titel);
  const liste = document.createElement('ul');
  for (const befund of befunde) {
    const zeile = document.createElement('li');
    const ort = document.createElement('span');
    ort.className = 'kanban-befund-zeile';
    ort.textContent = t('kanban.befundZeile').replace('{zeile}', String(befund.zeile));
    zeile.appendChild(ort);
    const satz = document.createElement('span');
    const schluessel = BEFUND_SCHLUESSEL[befund.code];
    satz.textContent = schluessel ? t(schluessel) : String(befund.code);
    zeile.appendChild(satz);
    liste.appendChild(zeile);
  }
  kasten.appendChild(liste);
  return kasten;
}

/**
 * Zeichnet die Tafel in den Container der Spalte.
 *
 * Der Container wird geleert und neu gefüllt; die Tafel ist damit immer der
 * Stand des übergebenen Modells und nie eine Mischung aus zwei Ständen.
 * Stehen bleibt allein die Einhänge-Stelle `KOPF_KLASSE` (4T-001907).
 *
 * @param {Element} container Container der Ansicht (`.pane-kanban`).
 * @param {object} model Modell aus `leseTafel` des Format-Kerns.
 * @param {object} [anzeige]
 * @param {Function} [anzeige.t] Übersetzungs-Funktion (injiziert).
 * @param {string} [anzeige.pfad] Pfad des Dokuments — Bezug für Verweise und Bilder.
 * @param {Function} [anzeige.renderMarkdown] (text, pfad, optionen) => HTML.
 * @param {Function} [anzeige.nachRender] (container, pfad) => void.
 * @param {boolean} [anzeige.aenderbar] Erbt die Änderbarkeit des Dokuments.
 * @param {boolean} [anzeige.tagsAmFuss] Schalter «Tags am Kartenfuß» (4T-001904).
 * @param {boolean} [anzeige.terminRelativ] Schalter «Termine relativ anzeigen» (4T-001903).
 * @param {string} [anzeige.locale] Sprach-Kennung der relativen Lesart (4T-001903).
 * @param {Date} [anzeige.jetzt] Bezugs-Zeitpunkt der relativen Lesart (4T-001903).
 * @returns {Element} der Wurzel-Knoten der Tafel.
 */
export function zeichneTafel(container, model, anzeige = {}) {
  const t = uebersetzer(anzeige);
  for (const kind of [...container.childNodes]) {
    if (!(kind.classList && kind.classList.contains(KOPF_KLASSE))) kind.remove();
  }
  const wurzel = document.createElement('div');
  wurzel.className = TAFEL_KLASSE;
  // **Die eine Auskunfts-Stelle über die Änderbarkeit der Fläche.** Die Fläche
  // erbt sie von ihrem Dokument (Entscheidung des Bestands vom 2026-09-09); die
  // Bedien-Vorgänge 4T-001849 bis 4T-001851 fragen dieses Merkmal und tragen
  // keine eigene Bedingung. Die Klasse ist die sichtbare Hälfte, das
  // Daten-Merkmal die auswertbare (Muster `canvas-nur-ansicht`).
  const aenderbar = anzeige.aenderbar !== false;
  wurzel.dataset.aenderbar = aenderbar ? 'true' : 'false';
  if (!aenderbar) wurzel.classList.add('kanban-nur-ansicht');
  container.appendChild(wurzel);

  const zeilen = model && Array.isArray(model.zeilen) ? model.zeilen : [];
  const befunde = model && Array.isArray(model.befunde) ? model.befunde : [];

  if (!model || !model.istTafel) {
    // Der Fall entsteht, wenn der Kopf-Schlüssel zwischen Modus-Wechsel und
    // Zeichnung verschwindet. Er endet nie in einer leeren Fläche — schon weil
    // der Anwender sonst nicht wüsste, ob die Anwendung noch arbeitet.
    wurzel.appendChild(zeichneHinweis(t('kanban.keineTafel'), 'kanban-keine-tafel'));
    if (befunde.length > 0) wurzel.appendChild(zeichneBefunde(befunde, anzeige));
    return wurzel;
  }

  if (befunde.length > 0) wurzel.appendChild(zeichneBefunde(befunde, anzeige));

  const spalten = Array.isArray(model.spalten) ? model.spalten : [];
  if (spalten.length === 0) {
    // AK9: Eine Tafel ohne Spalten ist gültig und leer (F3 des Format-Kerns),
    // kein Befund — und sagt das auch.
    wurzel.appendChild(zeichneHinweis(t('kanban.keineSpalten'), 'kanban-keine-spalten'));
  }

  // 4T-001851: Der Streifen entsteht **auch ohne Spalte**, weil die Schaltfläche
  // «Spalte hinzufügen» an seinem Ende sitzt. Bis hierher kehrte die Zeichnung
  // bei einer leeren Tafel vorher um; dann gäbe es für die erste Spalte einer
  // frisch angelegten Tafel keinen Weg — und eine leere Tafel ist ein gültiger
  // Bestand (F3 des Format-Kerns, belegt an einer echten Tafel).
  const streifen = document.createElement('div');
  streifen.className = 'kanban-spalten';
  spalten.forEach((spalte, nr) => {
    streifen.appendChild(zeichneSpalte(spalte, nr, zeilen, anzeige, aenderbar));
  });
  // 4T-001851 (Story 4S-000975, AK1): Der Weg zur neuen Spalte steht am Ende des
  // Streifens — dort, wo sie entsteht; dieselbe Überlegung wie bei der Karte am
  // Fuss ihrer Spalte. Im nicht änderbaren Dokument entfällt er vollständig
  // statt deaktiviert zu erscheinen (AK9 des Tasks).
  if (aenderbar) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'kanban-spalte-hinzufuegen';
    knopf.textContent = t('kanban.spalteHinzufuegen');
    knopf.title = t('kanban.spalteHinzufuegen');
    streifen.appendChild(knopf);
  }
  wurzel.appendChild(streifen);
  return wurzel;
}

/**
 * Wählt eine Karte und hebt die vorherige Auswahl auf.
 *
 * Die Auswahl ist eine Aussage über die Karte und steht deshalb am Element,
 * nicht allein in einer Klasse (Muster der Canvas-Karte). Sie bleibt im nicht
 * änderbaren Dokument erlaubt: Auswählen schreibt nichts.
 *
 * @param {Element} container Container der Ansicht.
 * @param {Element|null} karte Zu wählende Karte oder null zum Aufheben.
 */
export function waehleKarte(container, karte) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  for (const el of container.querySelectorAll(`.${KARTE_KLASSE}`)) {
    const gewaehlt = el === karte;
    el.setAttribute('aria-selected', gewaehlt ? 'true' : 'false');
    el.classList.toggle('kanban-karte-gewaehlt', gewaehlt);
  }
}

/** Die Zeilen-Nummer der gewählten Karte oder null. */
export function gewaehlteKartenZeile(container) {
  if (!container || typeof container.querySelector !== 'function') return null;
  const el = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
  if (!el) return null;
  const nr = Number(el.dataset.zeile);
  return Number.isFinite(nr) ? nr : null;
}

/**
 * Merkt sich Roll-Stand und Auswahl, damit der Nachzug beim Tippen sie nicht
 * wegwirft.
 *
 * Ohne diesen Erhalt spränge die Tafel bei jedem Tastendruck an den Anfang
 * zurück — die Zeichnung baut den Baum neu auf, und ein neuer Baum rollt bei
 * null.
 */
export function merkeZustand(container) {
  if (!container || typeof container.querySelector !== 'function') return null;
  const streifen = container.querySelector('.kanban-spalten');
  return {
    zeile: gewaehlteKartenZeile(container),
    links: streifen ? streifen.scrollLeft : 0,
    spalten: [...container.querySelectorAll('.kanban-spalte-karten')].map((el) => el.scrollTop),
  };
}

/** Stellt den gemerkten Stand nach der Zeichnung wieder her. */
export function stelleZustandHer(container, zustand) {
  if (!container || !zustand || typeof container.querySelector !== 'function') return;
  const streifen = container.querySelector('.kanban-spalten');
  if (streifen) streifen.scrollLeft = zustand.links || 0;
  const listen = [...container.querySelectorAll('.kanban-spalte-karten')];
  listen.forEach((el, nr) => {
    if (zustand.spalten && zustand.spalten[nr] != null) el.scrollTop = zustand.spalten[nr];
  });
  if (zustand.zeile == null) return;
  // Die Karte wird über ihre Zeilen-Nummer wiedergefunden und nicht über ihren
  // Platz in der Spalte: Die Zeile **ist** ihre Kennung im Dokument. Gibt es
  // sie nicht mehr, bleibt die Tafel ohne Auswahl — nie mit der falschen.
  const karte = container.querySelector(`.${KARTE_KLASSE}[data-zeile="${zustand.zeile}"]`);
  if (karte) waehleKarte(container, karte);
}
