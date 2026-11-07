'use strict';

// 4T-002517 (Epic 3E-000402): Die Kachel mit Abfrage-Datei (`abfrage="…"`,
// Story 4S-001183, V2). Das Modul beantwortet eine Frage: wie aus dem Ziel, das
// die Kachel nennt, die Abfrage wird, die sie zeigt.
//
// **Auflösung über die Brücke** `dashboardAbfrageDatei` (Kanal
// `dashboard:abfrageDatei`, 4T-002510): Der Hauptprozess löst das Ziel mit der
// Grenze der Einbettung auf, prüft die Marke `db-query` und liefert genau einen
// Abfrage-Block. Ein Pfad aus dem Block ist nie vertrauenswürdig, deshalb liest
// dieses Modul selbst nichts (Entwicklungsrichtlinien, Kapitel 6).
//
// **Bei Erfolg** wird die Kachel zum Abfrage-Container wie eine Kachel mit
// Abfrage im Block (`dashboard-view.js`), mit einem Unterschied: Grundpfad der
// Abfrage ist die Abfrage-Datei, nicht das Dashboard-Dokument. `this.` und eine
// leere Verweis-Quelle meinen sie, wie bei ihrer Einbettung nach Story 4S-001040.
// Die Befüllung (`befuelleAbfrageContainer`) merkt sich den Grundpfad in
// `data-fm-base`; ihr Live-Nachzug fragt deshalb weiter mit der Abfrage-Datei.
//
// **Bei Fehler** zeigt die Kachel an ihrem Platz den Hinweis mit dem genannten
// Namen (`abfrageDateiFehlt`, `abfrageDateiNichtLesbar`, `keineAbfrageDatei`,
// `abfrageDateiOhneBlock`, `abfrageDateiMehrereBloecke`), in der Form der Hinweise des Blocks
// (`src/shared/markdown/dashboard-block.js`), und ist kein Abfrage-Container.
//
// **Beim Index-Nachzug wird neu aufgelöst** (AK1 des Tasks): Ändert sich der
// Text der Abfrage-Datei, ändert sich die Abfrage, die die Befüllung kennt, und
// das sieht nur, wer neu fragt. Angestoßen von der Index-Invalidierung (nach
// dem Speichern) und vom Puffer-Overlay (ungespeicherter Stand, den der Kanal
// ebenfalls liest), gebündelt wie `refreshVisibleFrontmatterQueries`. Bleibt
// die Abfrage gleich, übernimmt der Live-Nachzug der Befüllung den Rest.

import { api } from '../app/api.js';
import { t } from '../../i18n.js';
import { befuelleAbfrageContainer, buildQueryListDom } from '../query/frontmatter-query-view.js';

const HINWEIS = 'dashboard.hint.';
const FEHLER_CODES = new Set([
  'abfrageDateiFehlt',
  'abfrageDateiNichtLesbar',
  'keineAbfrageDatei',
  'abfrageDateiOhneBlock',
  'abfrageDateiMehrereBloecke',
]);
const NACHZUG_MS = 150;

// Name des Ereignisses des Puffer-Overlays, gleichlautend mit
// `INDEX_OVERLAY_EVENT` in `src/renderer/modules/editor/editor.js`. Nicht
// importiert, weil editor.js über render-mermaid.js dieses Modul lädt; ein
// Prüffall hält beide Zeichenketten gleich.
export const OVERLAY_EREIGNIS = 'scg:index-overlay-changed';

// Laufende Nummer je Kachel: Nur die jüngste Antwort zählt.
const auftraege = new WeakMap();
// Offene Auflösungen, für `warteAufDashboardQuellen` (Druck und PDF).
const offen = new Set();
let gebunden = false;
let nachzugTimer = null;

/**
 * Löst das Ziel einer Kachel mit Abfrage-Datei auf und befüllt sie.
 * @param {HTMLElement} el  `.dashboard-kachel-inhalt[data-dashboard-abfrage]`
 * @param {string|null} basePath  Pfad des Dokuments mit dem Dashboard; leer bei
 *   einem pfadlosen Reiter
 * @returns {Promise<void>}
 */
export function loeseAbfrageKachel(el, basePath) {
  el.dataset.dashboardQuelleBase = basePath || '';
  bindeNachzug();
  return aufloesen(el);
}

/**
 * Wartet, bis keine Auflösung einer Abfrage-Datei mehr unterwegs ist. Die
 * Leerlauf-Schranke der Abfrage-Befüllung sieht eine Kachel erst, wenn sie
 * Abfrage-Container ist; wer vor Druck oder PDF auf alle Kacheln wartet, wartet
 * zuerst hierauf.
 * @returns {Promise<void>}
 */
export async function warteAufDashboardQuellen() {
  while (offen.size > 0) await Promise.allSettled([...offen]);
}

/** Löst alle sichtbaren Kacheln mit Abfrage-Datei gebündelt neu auf. */
export function planeQuellNachzug() {
  if (nachzugTimer) return;
  nachzugTimer = setTimeout(() => {
    nachzugTimer = null;
    const els = document.querySelectorAll('[data-dashboard-abfrage][data-dashboard-quelle-base]');
    for (const el of els) aufloesen(el);
  }, NACHZUG_MS);
}

function bindeNachzug() {
  if (gebunden) return;
  gebunden = true;
  if (api && typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(planeQuellNachzug);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener(OVERLAY_EREIGNIS, planeQuellNachzug);
  }
}

function aufloesen(el) {
  const nr = (auftraege.get(el) || 0) + 1;
  auftraege.set(el, nr);
  const lauf = frage(el).then((antwort) => {
    if (auftraege.get(el) !== nr) return;
    if (!el.dataset.dashboardQuelleBase) {
      zeigeUngespeichert(el);
    } else if (antwort && antwort.ok === true && typeof antwort.abfrage === 'string') {
      zeigeAbfrage(el, antwort);
    } else {
      zeigeFehler(el, antwort);
    }
  });
  offen.add(lauf);
  return lauf.finally(() => offen.delete(lauf));
}

async function frage(el) {
  const basePath = el.dataset.dashboardQuelleBase;
  const ziel = el.dataset.dashboardAbfrage || '';
  // Ohne Pfad (Unbenannt, Handbuch) gibt es kein Dokument, gegen das das Ziel
  // aufgelöst würde; der Kanal nimmt nur absolute Pfade.
  if (!basePath || !api || typeof api.dashboardAbfrageDatei !== 'function') return null;
  try {
    return await api.dashboardAbfrageDatei(basePath, ziel);
  } catch {
    return null;
  }
}

function zeigeAbfrage(el, antwort) {
  setzeFehlerKachel(el, false);
  const gleich =
    el.classList.contains('perspective-query') &&
    el.dataset.fmQuery === antwort.abfrage &&
    el.dataset.fmBase === antwort.pfad;
  if (gleich) return;
  el.dataset.fmQuery = antwort.abfrage;
  el.classList.add('perspective-query');
  befuelleAbfrageContainer(el, antwort.pfad);
}

// Review-Runde 1 von 3E-000402, Befund B1: Ohne Pfad (Unbenannt, Handbuch)
// gibt es nichts, gegen das das Ziel aufgelöst würde. Die Kachel zeigt dann
// denselben Hinweis wie eine Kachel mit Abfrage im Block («erst nach dem
// Speichern verfügbar», `query.unavailable`), wie es das Handbuch im Abschnitt
// «Suchraum» zusagt, und ist weder Abfrage-Container noch Fehler-Kachel.
function zeigeUngespeichert(el) {
  el.classList.remove('perspective-query');
  delete el.dataset.fmQuery;
  delete el.dataset.fmBase;
  el.replaceChildren(buildQueryListDom({ status: 'unavailable' }, t));
  setzeFehlerKachel(el, false);
}

function zeigeFehler(el, antwort) {
  // Kein Abfrage-Container mehr: Der Live-Nachzug der Befüllung übergeht die
  // Kachel, bis eine neue Auflösung gelingt.
  el.classList.remove('perspective-query');
  delete el.dataset.fmQuery;
  delete el.dataset.fmBase;
  const code = antwort && FEHLER_CODES.has(antwort.code) ? antwort.code : 'abfrageDateiFehlt';
  const genannt = antwort && typeof antwort.name === 'string' && antwort.name ? antwort.name : '';
  const name = genannt || el.dataset.dashboardAbfrage || '';
  el.replaceChildren(hinweisListe(code, name, kachelZeile(el)));
  setzeFehlerKachel(el, true);
}

function kachelZeile(el) {
  const kachel = el.closest('.dashboard-kachel');
  return kachel ? kachel.dataset.dashboardZeile || null : null;
}

function setzeFehlerKachel(el, an) {
  const kachel = el.closest('.dashboard-kachel');
  if (kachel) kachel.classList.toggle('dashboard-kachel-fehler', an);
}

// Ein Hinweis wie `hinweisPunkt` in dashboard-block.js: Zeile im Block und
// Text; der Ersatz über eine Funktion, damit ein `$` im Namen kein Muster ist.
function hinweisListe(code, name, zeile) {
  const liste = document.createElement('ul');
  liste.className = 'dashboard-hinweise';
  const punkt = document.createElement('li');
  punkt.className = 'dashboard-hinweis';
  if (zeile) {
    const z = document.createElement('span');
    z.className = 'dashboard-hinweis-zeile';
    z.textContent = t(HINWEIS + 'zeile').replace('{zeile}', () => String(zeile));
    punkt.append(z, ' ');
  }
  punkt.append(t(HINWEIS + code).replace('{detail}', () => name));
  liste.appendChild(punkt);
  return liste;
}
