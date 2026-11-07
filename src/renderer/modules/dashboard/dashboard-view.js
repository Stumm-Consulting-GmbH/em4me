'use strict';

// 4T-002515 (Epic 3E-000402): Der Befüllungs-Schritt der Dashboards in der
// Nachverarbeitung der gerenderten Ansicht. Das Modul beantwortet eine Frage:
// wie aus einer Daten-Kachel des Markups (`src/shared/markdown/dashboard-block.js`)
// ein Abfrage-Container wird (Konzept-Stufe 4T-002506, Abschnitt 3.3).
//
// **Warum ein Schritt vor der Abfrage-Befüllung** und keine eigene Befüllung:
// Die Kachel trägt ihre Abfrage in `data-db-query`, das Ziel einer Abfrage-Datei
// in `data-dashboard-abfrage` und die Vorgabe-Form ihrer Art in
// `data-dashboard-form`. Der Schritt setzt daraus Klasse `perspective-query`,
// `data-fm-query`, die Werte der Filter in `data-fm-params` und die Vorgabe-Form
// in `data-fm-form`. Den Rest tut die bestehende Befüllung
// (`frontmatter-query-view.js`), die gleich danach läuft; die Kachel erbt so
// Live-Nachzug, die Leerlauf-Schranke vor Druck und PDF, das Neu-Zeichnen der
// Diagramme, den Klick-Pfad und die Listen-Maske, und ein Fehler der Abfrage
// bleibt in ihrer Kachel.
//
// **Werte der Filter:** In diesem Schritt die Vorbelegungen aus dem Kopf des
// Blocks, ein Wert je Filter-Name, `null` für «alle». Die Auswahl am Kopf
// (D8) ersetzt sie. Auch ohne Filter steht ein leeres Objekt am Container: Die
// Abfrage gilt damit als Abfrage eines Dashboards, und ein Platzhalter ohne
// Filter bekommt den Hinweis des unbekannten Namens statt des Hinweises
// «außerhalb eines Dashboards».
//
// **Die Kachel mit Abfrage-Datei** (`data-dashboard-abfrage`) bekommt hier
// dieselben Werte und dieselbe Vorgabe-Form; ihr Ziel löst `dashboard-quelle.js`
// über die Brücke auf und macht sie danach zum Abfrage-Container mit der
// Abfrage-Datei als Grundpfad (4T-002517). Dafür braucht der Schritt den Pfad
// des Dokuments; ohne die Angabe (Aufruf ohne zweites Argument) bleibt diese
// Kachel, wie sie ist.
//
// Idempotent: Eine schon umgestellte Kachel wird übergangen. Der Schritt
// gehört zum Dashboard, in dem die Kachel steht; die Kacheln eines Dashboards
// in einer eingebetteten Datei nimmt er mit deren Kopf.

// Meldet beim Laden die internen Formen an, die die Kacheln wählen.
import './dashboard-formen.js';
import { loeseAbfrageKachel } from './dashboard-quelle.js';

// Der Kanal der Abfrage nimmt höchstens zwanzig Namen (src/main/ipc/index-views.js).
const HOECHSTENS_FILTER = 20;

/**
 * Die Werte der Filter eines Dashboards aus seinem Kopf: Name -> Vorbelegung
 * oder `null` für «alle».
 * @param {Element} block  `.perspective-dashboard`
 * @returns {Record<string, string|null>}
 */
export function vorbelegungenDes(block) {
  const werte = {};
  const kopf = Array.from(block.children).find((k) => k.classList.contains('dashboard-kopf'));
  if (!kopf) return werte;
  for (const filter of kopf.querySelectorAll('.dashboard-filter[data-filter-name]')) {
    if (Object.keys(werte).length >= HOECHSTENS_FILTER) break;
    const name = filter.dataset.filterName;
    const vorbelegung = filter.dataset.filterVorbelegung;
    werte[name] = typeof vorbelegung === 'string' ? vorbelegung : null;
  }
  return werte;
}

/**
 * Macht jede Daten-Kachel mit Abfrage unter `container` zum Abfrage-Container
 * und stößt die Auflösung jeder Kachel mit Abfrage-Datei an.
 * @param {ParentNode} container
 * @param {string|null} [basePath]  Pfad des Dokuments; leer bei einem pfadlosen
 *   Reiter. Fehlt er, bleiben die Kacheln mit Abfrage-Datei unberührt.
 * @returns {number} Zahl der umgestellten oder angestoßenen Kacheln
 */
export function bereiteDashboardKachelnVor(container, basePath) {
  if (!container || typeof container.querySelectorAll !== 'function') return 0;
  let anzahl = 0;
  for (const block of container.querySelectorAll('.perspective-dashboard')) {
    const params = JSON.stringify(vorbelegungenDes(block));
    for (const el of block.querySelectorAll('.dashboard-kachel-inhalt[data-db-query]')) {
      // Die Kachel eines inneren Dashboards gehört zu dessen Kopf.
      if (el.closest('.perspective-dashboard') !== block) continue;
      if (el.classList.contains('perspective-query')) continue;
      el.dataset.fmQuery = el.dataset.dbQuery;
      el.dataset.fmParams = params;
      if (el.dataset.dashboardForm) el.dataset.fmForm = el.dataset.dashboardForm;
      el.classList.add('perspective-query');
      anzahl += 1;
    }
    if (basePath === undefined) continue;
    for (const el of block.querySelectorAll('.dashboard-kachel-inhalt[data-dashboard-abfrage]')) {
      if (el.closest('.perspective-dashboard') !== block) continue;
      if (el.dataset.dashboardQuelleBase !== undefined) continue;
      el.dataset.fmParams = params;
      if (el.dataset.dashboardForm) el.dataset.fmForm = el.dataset.dashboardForm;
      loeseAbfrageKachel(el, basePath);
      anzahl += 1;
    }
  }
  return anzahl;
}
