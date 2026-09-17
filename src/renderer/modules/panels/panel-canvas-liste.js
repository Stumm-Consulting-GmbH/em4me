// 4T-001769 (Epic 3E-000290): Karten-Liste einer Canvas-Fläche (Story
// 4S-000948).
//
// **Entscheidung F1 des Product Owners vom 2026-09-15:** Die Liste ist ein
// Sidebar-Panel nach der Paritäts-Konvention und keine Klapp-Fläche innerhalb
// der Canvas-Ansicht. Sie steht damit **neben** der Fläche, bringt Platzierung,
// gemerkten Zustand, beide Bedienorte und den Panel-Wächter mit — und nimmt der
// Fläche keinen Platz weg.
//
// **Entscheidung F2 vom selben Tag:** Gezeigt werden **alle** Elemente der
// Fläche in der Reihenfolge der Fence — Karten, Formen und Gruppen —, unter
// jeder Karte ihre Verbindungen. Die Reihenfolge der Liste **ist** damit die
// Stapel-Reihenfolge (G3).
//
// **Dieses Modul zeigt an und wählt aus; es schreibt nie.** Die Daten kommen
// aus der prozessneutralen Kern-Funktion `canvasListe`, den Stand der Fläche und
// den Weg zurück auf sie liefert `canvas-pane.js`. Der eine Schreibweg der
// Fläche bleibt der eine Schreibweg (Entscheidung E11 des Konzepts) — ein
// zweiter Weg daneben müsste Rückgängig-Kette, Änderungs-Kennzeichnung und
// Rundlauf der Fence erneut einlösen. **Auch die Tasten aus 4T-001770 ändern
// daran nichts:** Sie sagen der Fläche, was geschehen soll, und die Fläche tut
// es auf ihrem einen Weg.
//
// **Entscheidung F3 des Product Owners vom 2026-09-15:** Bedient wird aus der
// Liste über die Kontextmenü-Taste, die für das gewählte Element das
// **bestehende** Kontextmenü mit allen seinen Handlungen öffnet; dazu die
// direkten Tasten Eingabe (bearbeiten) und Entfernen (löschen) sowie die
// Ziel-Wahl in der Liste für eine neue Verbindung. Eine zweite Handlungs-Liste
// für die Tastatur entsteht nicht (B6). **Sie liegen seit 4T-001771 im
// Nachbar-Modul `panel-canvas-liste-tasten.js`** — der Schnitt, den jener
// Vorgang vorgezeichnet hat, damit das Filter-Feld hier Platz findet.
//
// **Entscheidung F4 des Product Owners vom 2026-09-15 (4T-001771):** Der Ort
// der Suche in einer Fläche ist ein **Filter-Feld über dieser Liste**, und
// Strg+F führt in der Canvas-Ansicht dorthin statt in die Suchleiste. Die
// Filter-Regel selbst steht prozessneutral im Kern (`canvas-filter.js`); dieses
// Modul zeigt die Treffer an und hebt die Fundstellen hervor, die der Kern
// mitliefert — es sucht nicht ein zweites Mal.
//
// Bauform nach `search/search-panel.js` (Auswahl-Index, Klapp-Zustand,
// Fokus-Rückgabe, Tastatur-Weiche über den Fokus, Hervorhebung aus den Offsets
// des Kerns, lieferanten-neutral) und `panels/panel-outline.js` (Sprung in die
// Ansicht des Dokuments); das Filter-Feld über der Liste folgt
// `command-palette.js`.
'use strict';

import {
  canvasListeFiltern,
  normalisiereCanvasSuche,
} from '../../../shared/canvas/canvas-filter.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import {
  beobachteCanvasStand,
  canvasListenStand,
  zeigeCanvasElement,
} from '../canvas/canvas-pane.js';
import { ensurePanelTabActive, oeffnePanel, registerSidebarPanel } from '../sidebar-layout.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { persistSetting, setViewMode, showStatusbarHint } from '../views/views.js';

import {
  bestaetigeZielWahl,
  haltZielWahlAktuell,
  initCanvasListenTasten,
  starteCanvasVerbindung,
  zielWahlFuer,
  ZEILEN_WAHL,
} from './panel-canvas-liste-tasten.js';
import { applySidebarVisibility } from './panels.js';

// Der Weg des Kommandos `canvas.addConnection` läuft weiterhin über dieses
// Modul: Es ist der Einstieg, den die Kommando-Tabelle kennt, und der Auszug
// der Tasten ist ein Ortswechsel im Panel und keine neue Anschrift nach außen.
export { starteCanvasVerbindung };

// Zugeklappte Karten (Kennung). Modul-Zustand wie der Klapp-Zustand der
// Trefferliste und aus demselben Grund: Er gehört zur laufenden Sitzung, nicht
// zum Dokument — und bei einem Format mit zugesagter Byte-Gleichheit wiegt das
// schwerer als sonst (Entscheidung E8 des Konzepts).
const zugeklappt = new Set();

// Zeile, die nach dem nächsten Zeichnen den Tastatur-Fokus zurückbekommt. Ohne
// sie verlöre ein Klick auf eine Zeile den Fokus an den Dokument-Rumpf: Die
// Auswahl zeichnet die Liste neu, und das eben benutzte Element ist danach ein
// anderes (Muster `zeichneAllePanes` im Suchergebnis-Panel).
//
// 4T-001770: `{kennung, stelle}` statt der Kennung allein. Eine Verbindung
// steht **zweimal** in der Liste — einmal unter jeder ihrer beiden Karten —,
// und wer mit den Pfeiltasten auf der zweiten steht, soll nach dem Zeichnen
// nicht auf der ersten landen. Die Stelle entscheidet deshalb zuerst, die
// Kennung fängt den Fall, dass die Liste sich verschoben hat, und die Stelle
// allein den Fall, dass die Zeile ganz verschwunden ist (Löschen).
let fokus = null;

// Die Richtungs-Zeichen einer Verbindung. Sie stehen hier und nicht in fünf
// Sprachdateien, weil sie keine Sprache haben; was der Anwender vorgelesen
// bekommt, steht als übersetzte Beschriftung daneben.
const PFEILE = { vor: '→', beide: '↔', keine: '—' };

function stand(paneIdx) {
  return canvasListenStand(paneIdx);
}

function hinweis(schluessel) {
  showStatusbarHint(schluessel, { error: true, duration: 2500 });
  return false;
}

function merkeFokus(kennung, stelle) {
  fokus = { kennung, stelle };
}

// Die Beschriftung eines Elements: sein Text, sonst seine Art. Eine leere Zeile
// wäre in einer Liste, deren Zweck das Auffinden ist, die schlechteste Antwort.
function beschriftung(eintrag) {
  if (eintrag.text) return eintrag.text;
  if (eintrag.art === 'form') return t('canvas.liste.form');
  if (eintrag.art === 'gruppe') return t('canvas.liste.gruppe');
  return t('canvas.liste.ohneText');
}

function statusText(lage, paneIdx, suche, treffer) {
  // 4T-001770: Die laufende Ziel-Wahl sagt an dieser Stelle, was die Liste
  // gerade von einem will (AK7); der Umfang der Fläche steht daneben in jeder
  // Zeile und ist während der Wahl die unwichtigere Auskunft.
  if (zielWahlFuer(paneIdx)) return t('canvas.liste.zielWahl');
  if (!lage.hatDokument) return t('canvas.liste.keinDokument');
  if (lage.flaechen === 0) return t('canvas.keineFence');
  if (lage.liste.length === 0) return t('canvas.liste.leer');
  // 4T-001771 (AK9): Bei laufendem Filter zählt die Zeile die Treffer, und
  // ohne Treffer sagt sie es — die Liste wird nicht einfach leer.
  if (suche) {
    if (treffer === 0) return t('canvas.liste.keinTreffer');
    const gefunden = treffer === 1 ? 'canvas.liste.einTreffer' : 'canvas.liste.treffer';
    return t(gefunden).replace('{n}', String(treffer));
  }
  const schluessel = lage.liste.length === 1 ? 'canvas.liste.element' : 'canvas.liste.elemente';
  return t(schluessel).replace('{n}', String(lage.liste.length));
}

// --- Zeilen ------------------------------------------------------------------

// Setzt den Text eines Feldes und hebt die Fundstellen des Filters hervor
// (4T-001771, AK4). Die Bereiche kommen aus dem Kern; hier wird nicht noch
// einmal gesucht (Muster `baueTrefferZeile` im Suchergebnis-Panel).
function setzeText(el, text, stellen) {
  const bereiche = Array.isArray(stellen) ? stellen : [];
  if (bereiche.length === 0) {
    el.textContent = text;
    return;
  }
  let ab = 0;
  for (const [von, bis] of bereiche) {
    if (von > ab) el.append(document.createTextNode(text.slice(ab, von)));
    const fund = document.createElement('mark');
    fund.className = 'canvas-liste-treffer';
    fund.textContent = text.slice(von, bis);
    el.appendChild(fund);
    ab = bis;
  }
  if (ab < text.length) el.append(document.createTextNode(text.slice(ab)));
}

function baueVerbindung(verbindung, lage, paneIdx) {
  const zeile = document.createElement('button');
  zeile.type = 'button';
  zeile.className = 'canvas-liste-verbindung';
  zeile.dataset.canvasId = verbindung.id;
  // 4T-001770: Auch die Verbindung ist ein Element der einen Auswahl (V3); wer
  // mit den Pfeiltasten über ihre Zeile wandert, sieht sie hier hervorgehoben
  // wie auf der Fläche.
  if (lage.gewaehlt === verbindung.id) zeile.classList.add('selected');
  const pfeil = document.createElement('span');
  pfeil.className = 'canvas-liste-pfeil';
  pfeil.textContent = PFEILE[verbindung.richtung] || PFEILE.vor;
  const ziel = document.createElement('span');
  ziel.className = 'canvas-liste-gegenstelle';
  // Ohne eigene Beschriftung steht die Gegenstelle da; durchsucht wird sie
  // nicht, und deshalb trägt sie auch keine Hervorhebung.
  if (verbindung.text) setzeText(ziel, verbindung.text, verbindung.stellen.text);
  else ziel.textContent = verbindung.gegenstelle;
  zeile.append(pfeil, ziel);
  const schluessel = verbindung.ausgehend
    ? 'canvas.liste.verbindungZu'
    : 'canvas.liste.verbindungVon';
  zeile.title = t(schluessel).replace('{ziel}', verbindung.gegenstelle);
  // 4T-001770 (AK13): Ein Hilfsmittel liest die Liste als Liste, und jede Zeile
  // trägt ihren sprechenden Namen. `option` statt `button`, weil `aria-selected`
  // nur an einer wählbaren Zeile eine Aussage ist.
  zeile.setAttribute('role', 'option');
  zeile.setAttribute('aria-selected', String(lage.gewaehlt === verbindung.id));
  zeile.setAttribute('aria-label', zeile.title);
  zeile.addEventListener('click', () => beiZeilenKlick(paneIdx, verbindung.id));
  return zeile;
}

function baueKlappGriff(eintrag, paneIdx, offen) {
  const griff = document.createElement('button');
  griff.type = 'button';
  griff.className = 'canvas-liste-klapp';
  griff.textContent = offen ? '▾' : '▸';
  griff.title = t('canvas.liste.klappen');
  griff.setAttribute('aria-expanded', offen ? 'true' : 'false');
  griff.addEventListener('click', (ev) => {
    // Der Griff sitzt in der Zeile; ohne das Anhalten wählte sein Klick
    // zusätzlich das Element aus, und der Anwender wollte nur aufklappen.
    ev.stopPropagation();
    if (zugeklappt.has(eintrag.id)) zugeklappt.delete(eintrag.id);
    else zugeklappt.add(eintrag.id);
    zeichne(paneIdx);
  });
  return griff;
}

function baueZeile(eintrag, lage, paneIdx, offen) {
  const zeile = document.createElement('button');
  zeile.type = 'button';
  zeile.className = `canvas-liste-eintrag canvas-liste-${eintrag.art}`;
  zeile.dataset.canvasId = eintrag.id;
  // Die Auswahl ist eine Aussage über das Element (Muster der Karte auf der
  // Fläche) und nicht allein eine CSS-Klasse.
  const gewaehlt = !!lage.gewaehlt && lage.gewaehlt === eintrag.id;
  zeile.setAttribute('aria-selected', String(gewaehlt));
  if (gewaehlt) zeile.classList.add('selected');
  if (eintrag.verbindungen.length > 0) zeile.appendChild(baueKlappGriff(eintrag, paneIdx, offen));
  const text = document.createElement('span');
  text.className = 'canvas-liste-text';
  const beschriftet = beschriftung(eintrag);
  // Nur der eigene Text trägt Fundstellen; der Rückfall auf die Art des
  // Elements ist übersetzter Ersatz und wurde nicht durchsucht.
  setzeText(text, beschriftet, eintrag.text ? eintrag.stellen.text : null);
  zeile.appendChild(text);
  // 4T-001746: Worauf eine Karte zeigt, gehört in ihre Zeile — auch dann, wenn
  // sie zusätzlich eine eigene Beschriftung trägt.
  if (eintrag.ziel && eintrag.ziel !== eintrag.text) {
    const ziel = document.createElement('span');
    ziel.className = 'canvas-liste-ziel';
    setzeText(ziel, eintrag.ziel, eintrag.stellen.ziel);
    zeile.appendChild(ziel);
  }
  zeile.title = `${t('canvas.liste.' + eintrag.art)}: ${beschriftet}`;
  // 4T-001770 (AK13): Rolle und sprechender Name je Zeile, wie bei der
  // Verbindung daneben und aus demselben Grund.
  zeile.setAttribute('role', 'option');
  zeile.setAttribute('aria-label', zeile.title);
  zeile.addEventListener('click', () => beiZeilenKlick(paneIdx, eintrag.id));
  return zeile;
}

// --- Auswahl -----------------------------------------------------------------

/**
 * Wählt ein Element auf der Fläche — der Weg vom Panel zurück auf die Canvas.
 *
 * **Das Panel führt keinen eigenen Auswahl-Zustand** (Story 4S-000948): Gewählt
 * wird auf der Fläche, und die Hervorhebung in der Liste ist deren Abbild. Steht
 * das Dokument nicht in der Canvas-Ansicht, führt der Weg zuerst dorthin —
 * sofern E9 die Ansicht freigibt; andernfalls wird gesagt, warum nichts
 * geschieht (Guard-Muster der Canvas-Kommandos).
 */
function waehle(paneIdx, id, stelle = -1) {
  const lage = stand(paneIdx);
  if (!lage.inAnsicht) {
    if (!lage.verfuegbar) {
      hinweis('canvas.liste.keinWechsel');
      return;
    }
    setViewMode('canvas');
  }
  zeigeCanvasElement(paneIdx, id);
  // Der Fokus gehört zurück in die Liste: Die Fläche holt ihn beim Auswählen zu
  // sich (sie braucht ihn für Entf und Strg+Z), und ohne die Rückgabe stünde
  // der Anwender nach einem Klick in der Liste ohne Tastatur da.
  merkeFokus(id, stelle);
  zeichne(paneIdx);
}

// Der Klick auf eine Zeile — er wählt, und während der Ziel-Wahl bestätigt er
// die Gegenstelle (4T-001770). Die Ziel-Wahl ist damit auch mit der Maus zu
// Ende zu bringen; sie zu starten und dann zur Tastatur zu zwingen wäre eine
// Sackgasse für den, der sie über das Kontextmenü begonnen hat.
function beiZeilenKlick(paneIdx, id) {
  if (zielWahlFuer(paneIdx)) {
    bestaetigeZielWahl(paneIdx, id);
    return;
  }
  waehle(paneIdx, id);
}

// --- Zeichnen ----------------------------------------------------------------

function zeichne(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.canvasListList || !els.canvasListStatus) return;
  const lage = stand(paneIdx);
  haltZielWahlAktuell(paneIdx, lage);
  // 4T-001771: Das Feld ist die eine Quelle des Suchtextes; ein zweiter Zustand
  // daneben liefe bei jedem Zeichnen Gefahr, von ihm abzuweichen. Fehlt das
  // Feld (ältere Einbettung, gestelltes Grundgerüst), ist die Liste ungefiltert.
  const roh = els.canvasListFilter ? els.canvasListFilter.value : '';
  const suche = normalisiereCanvasSuche(roh);
  const eintraege = canvasListeFiltern(lage.liste, roh);
  els.canvasListStatus.textContent = statusText(lage, paneIdx, suche, eintraege.length);
  els.canvasListStatus.classList.toggle('empty', eintraege.length === 0);
  const liste = els.canvasListList;
  liste.innerHTML = '';
  // 4T-001770 (AK13): Die Liste ist eine Liste, auch für ein Hilfsmittel. Die
  // Rolle steht hier und nicht im Grundgerüst, weil die Zeilen sie ebenfalls
  // hier bekommen und beide zusammen gelesen werden müssen.
  liste.setAttribute('role', 'listbox');
  // Entscheidung E3: Im nicht änderbaren Dokument zeigt und wählt das Panel,
  // ohne eine Handlung anzubieten. Die Klasse trägt die Zusage nach außen.
  if (els.canvasListSection) {
    els.canvasListSection.classList.toggle('nur-ansicht', !lage.aenderbar);
    // 4T-001770 (AK7): Die laufende Ziel-Wahl ist an der Liste zu sehen und
    // nicht nur an ihrem Status-Text.
    els.canvasListSection.classList.toggle('ziel-wahl', !!zielWahlFuer(paneIdx));
    els.canvasListSection.classList.toggle('gefiltert', !!suche);
  }
  for (const eintrag of eintraege) {
    // Bei laufendem Filter steht jede Karte offen: Ein Treffer in einer
    // Verbindungs-Beschriftung wäre unter einer zugeklappten Karte unsichtbar,
    // und eine Trefferliste, die ihre Treffer versteckt, ist keine.
    const offen = !!suche || !zugeklappt.has(eintrag.id);
    liste.appendChild(baueZeile(eintrag, lage, paneIdx, offen));
    if (!offen) continue;
    for (const verbindung of eintrag.verbindungen) {
      liste.appendChild(baueVerbindung(verbindung, lage, paneIdx));
    }
  }
  const gewaehlt = liste.querySelector('.canvas-liste-eintrag.selected');
  if (gewaehlt && typeof gewaehlt.scrollIntoView === 'function') {
    gewaehlt.scrollIntoView({ block: 'nearest' });
  }
  setzeFokus(liste);
}

// Gibt den Tastatur-Fokus an die gemerkte Zeile zurück.
//
// Gesucht wird über das Merkmal und nicht über einen zusammengesetzten
// Selektor: Eine Kennung ist zwar schmal gehalten (der Kern lässt nur
// Buchstaben, Ziffern, Strich und Unterstrich zu), aber eine **defekte**
// Kennung bleibt nach 6.3 stehen statt verworfen zu werden — und die stünde
// dann in einem Selektor (Muster der Fokus-Rückgabe im Suchergebnis-Panel).
function setzeFokus(liste) {
  if (!fokus) return;
  const reihen = zeilen(liste);
  const anStelle = reihen[fokus.stelle] || null;
  const ziel =
    anStelle && anStelle.dataset.canvasId === fokus.kennung
      ? anStelle
      : reihen.find((el) => el.dataset.canvasId === fokus.kennung) || anStelle;
  fokus = null;
  if (ziel && typeof ziel.focus === 'function') ziel.focus();
}

function zeilen(liste) {
  return [...liste.querySelectorAll(ZEILEN_WAHL)];
}

function zeichneSichtbare(paneIdx) {
  if (state.canvasList && state.canvasList.visibleByPane[paneIdx]) zeichne(paneIdx);
}

// Die Spalte, in deren Panel ein Ereignis stattgefunden hat. Gefragt wird das
// DOM und nicht die aktive Spalte: Ein Klick in das Panel der anderen Spalte
// macht diese nicht zwangsläufig aktiv, und die Liste soll dann trotzdem die
// Fläche bedienen, zu der sie gehört.
function paneZu(ziel, feld) {
  for (let i = 0; i < state.panes.length; i++) {
    const els = getPaneEls(i);
    const wurzel = els ? els[feld] : null;
    if (wurzel && typeof wurzel.contains === 'function' && wurzel.contains(ziel)) return i;
  }
  return -1;
}

// --- Filter-Feld (4T-001771) ---------------------------------------------------
//
// Vier Tasten, alle nach dem Muster der Kommando-Palette: Tippen engt ein, die
// Eingabetaste springt zum Treffer, Pfeil ab wandert in die Liste, Escape leert
// das Feld. Was darüber hinaus in der Liste gilt, steht im Nachbar-Modul.
//
// **Ohne Drossel.** Die Suchleiste wartet `SEARCH_DEBOUNCE_MS` (150 ms,
// nachgesehen am 2026-09-15 in `search/search.js`), weil ihr Lauf über den
// ganzen Dokument-Text oder gar über einen Bereich geht und Treffer im
// Dokument markiert. Dieser Filter läuft über eine bereits gebaute Liste im
// Speicher — so viele Einträge, wie die Fläche Elemente hat — und zeichnet ein
// Seitenleisten-Panel neu; das ist derselbe Aufwand wie bei der
// Kommando-Palette, die ebenfalls bei jedem Anschlag filtert. Eine Drossel
// brächte hier nur die Verzögerung und keine Ersparnis.

// Die Zeile, auf die die Eingabetaste springt: die gewählte, wenn sie unter den
// Treffern steht, sonst die erste. Wer vor dem Tippen etwas ausgewählt hatte,
// soll nicht an den Anfang geworfen werden.
function ersteTrefferZeile(liste, gewaehlt) {
  const reihen = zeilen(liste);
  if (reihen.length === 0) return null;
  return reihen.find((el) => el.dataset.canvasId === gewaehlt) || reihen[0];
}

function springeZumTreffer(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.canvasListList) return;
  const reihen = zeilen(els.canvasListList);
  const zeile = ersteTrefferZeile(els.canvasListList, stand(paneIdx).gewaehlt);
  if (!zeile) return;
  // Auswählen, zentrieren und den Fokus in die Liste geben — von dort wandern
  // die Pfeiltasten durch die übrigen Treffer (AK5 und AK6).
  waehle(paneIdx, zeile.dataset.canvasId, reihen.indexOf(zeile));
}

// Der Fokus wandert in die Liste, **ohne** die Auswahl anzufassen — der Weg des
// Escape. Wer den Filter wegnimmt, wollte nichts auswählen; ihm dabei eine
// Auswahl auf der Fläche zu setzen und den Ausschnitt zu verschieben wäre eine
// Wirkung, um die er nicht gebeten hat.
function fokussiereListe(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.canvasListList) return;
  const zeile = ersteTrefferZeile(els.canvasListList, stand(paneIdx).gewaehlt);
  if (zeile && typeof zeile.focus === 'function') zeile.focus();
}

function beiFilterTaste(ev, paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.canvasListFilter) return;
  if (ev.key === 'Enter' || ev.key === 'ArrowDown') {
    ev.preventDefault();
    springeZumTreffer(paneIdx);
    return;
  }
  if (ev.key === 'Escape' && els.canvasListFilter.value !== '') {
    // Nicht weiterreichen: Die Escape-Kaskade des Fensters schlösse sonst
    // zusätzlich etwas, obwohl der Nutzer den Filter meinte. Bei **leerem**
    // Feld greift die Kaskade dagegen unverändert — dort gibt es nichts zu
    // leeren, und ein stumm geschlucktes Escape wäre eine Sackgasse.
    ev.preventDefault();
    ev.stopPropagation();
    els.canvasListFilter.value = '';
    zeichne(paneIdx);
    fokussiereListe(paneIdx);
  }
}

function bindeFilter(paneIdx) {
  const els = getPaneEls(paneIdx);
  const feld = els ? els.canvasListFilter : null;
  if (!feld || feld.dataset.gebunden === 'ja') return;
  feld.dataset.gebunden = 'ja';
  feld.addEventListener('input', () => zeichne(paneIdx));
  feld.addEventListener('keydown', (ev) => beiFilterTaste(ev, paneIdx));
}

/**
 * Strg+F in der Canvas-Ansicht: Panel öffnen und den Schreib-Zeiger in das
 * Filter-Feld setzen (Entscheidung F4, AK7 und AK8 der Story 4S-000950).
 *
 * **Die Weiche entscheidet hier und nicht in der Suche.** Die Suchleiste bleibt
 * unberührt — `determineSearchScope()`, die Lieferanten der Raum-Suche und das
 * Ersetzen sind nicht angefasst; der Dispatcher des Kommandos `search.open`
 * fragt allein, ob dieses Panel zuständig ist. Ist es das nicht, öffnet er die
 * Leiste wie bisher.
 *
 * Synchron in der Antwort, damit der Dispatcher sofort weiß, ob er die Leiste
 * noch öffnen soll; das Öffnen des Panels selbst läuft danach über sein
 * Versprechen weiter.
 *
 * @param {number} paneIdx Spalte, in der Strg+F gedrückt wurde.
 * @returns {boolean} true, wenn die Fläche die Suche übernimmt.
 */
export function oeffneCanvasSuche(paneIdx) {
  const idx = Number.isInteger(paneIdx) ? paneIdx : state.activePaneIndex;
  // Kein Sonderfall für die abgeschaltete Erweiterung (AK11): Ohne sie gibt es
  // die Canvas-Ansicht nicht, und `inAnsicht` ist dann nie wahr (E9).
  if (!stand(idx).inAnsicht) return false;
  void (async () => {
    await oeffnePanel('canvaslist', idx);
    const feld = (getPaneEls(idx) || {}).canvasListFilter;
    if (feld && typeof feld.focus === 'function') {
      feld.focus();
      if (typeof feld.select === 'function') feld.select();
    }
  })();
  return true;
}

// --- Sichtbarkeit und Registrierung ------------------------------------------

export function applyCanvasListVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.canvasListSection) return;
  const visible = !!(state.canvasList && state.canvasList.visibleByPane[paneIdx]);
  els.canvasListSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    bindeFilter(paneIdx);
    zeichne(paneIdx);
  }
  updateCanvasListToggleButton();
}

export function updateCanvasListToggleButton() {
  const btn = document.getElementById('btn-canvas-list');
  if (!btn) return;
  const visible = !!(state.canvasList && state.canvasList.visibleByPane[state.activePaneIndex]);
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleCanvasListPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.canvasList.visibleByPane[paneIdx];
  state.canvasList.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('canvaslist', paneIdx);
  applyCanvasListVisibility(paneIdx);
  await persistCanvasListSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistCanvasListSettings() {
  await persistSetting('canvasList.visibleColumn0', !!state.canvasList.visibleByPane[0]);
  await persistSetting('canvasList.visibleColumn1', !!state.canvasList.visibleByPane[1]);
}

export async function loadCanvasListSettings() {
  const v0 = await api.getSetting('canvasList.visibleColumn0');
  const v1 = await api.getSetting('canvasList.visibleColumn1');
  state.canvasList.visibleByPane[0] = !!v0;
  state.canvasList.visibleByPane[1] = !!v1;
}

// 4T-001771: Die Griffe für das Nachbar-Modul der Tasten. Hereingereicht statt
// importiert, damit kein Modul-Zyklus entsteht (Begründung im Kopf jenes
// Moduls).
initCanvasListenTasten({ stand, waehle, zeichne, merkeFokus, zeilen, paneZu });

// Import-Seiteneffekt wie die Panel-Registrierung darunter: Die Fläche meldet
// jeden Wechsel ihres Standes, dieses Modul zeichnet dann neu. Gemeldet statt
// abgefragt, weil eine Auswahl auf der Fläche das Dokument nicht anfasst und
// deshalb sonst niemanden erreichte (AK5, AK11).
beobachteCanvasStand(zeichneSichtbare);

registerSidebarPanel({
  id: 'canvaslist',
  titleKey: 'canvas.liste.titel',
  buttonId: 'btn-canvas-list',
  sectionClass: 'sidebar-canvaslist',
  getVisible: (paneIdx) => !!(state.canvasList && state.canvasList.visibleByPane[paneIdx]),
  getPreference: (paneIdx) => !!(state.canvasList && state.canvasList.visibleByPane[paneIdx]),
  applyVisibility: applyCanvasListVisibility,
  toggle: toggleCanvasListPanel,
});
