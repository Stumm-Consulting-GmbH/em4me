// 4T-002407 (Epic 3E-000266, F6 A, S4): Die Sichten einer Karteikarte, in der
// Lese-Ansicht eingeblendet.
//
// Die Tabellen-Definition nennt mit `views` Abfrage-Dateien; der Katalog ordnet
// sie zu und liefert sie je Tabelle als `sichten` im Überblick der Datenbank.
// Zeigt die Lese- oder die geteilte Ansicht eine Karteikarte, setzt dieses
// Modul je Sicht einen Block unter den Dateikopf und vor den Freitext: eine
// Kopfzeile wie bei einer Einbettung und darunter den Körper der Abfrage-Datei.
//
// **Bezug der Abfrage ist die Karteikarte.** Der Körper durchläuft den
// Schritt-Satz des erzeugten Teilbaums, aber mit dem Pfad der KARTEIKARTE als
// Bezug und nicht mit dem der Abfrage-Datei wie bei einer Einbettung. Die
// Befüllung der Abfrage gibt diesen Pfad als Träger-Datei an den Haupt-Prozess
// (`fillOneQueryContainer` in `frontmatter-query-view.js`, Kanal
// `frontmatterQuery:run`), und dort meint `this.` die Träger-Datei
// (`selfAbs` in `src/main/index/query.js`). So zeigt «die Bücher dieses
// Autors» unter jeder Karteikarte die Bücher ihres Autors. Die Auflösung von
// Verweisen im Körper bleibt bei der Abfrage-Datei (`data-embed-base`), weil
// der Text dort geschrieben ist.
//
// **Nie bearbeitbar, nie in der Datei.** Der Block entsteht allein im
// gezeichneten Baum; der Schritt-Satz des Teilbaums schaltet die
// Bearbeitbarkeit ab. Er erscheint nur, wo die Dateikopf-Zeile mit dem Pfad des
// Dokuments gezeichnet wird (`frontmatter-line.js`, gerufen aus der vollen
// Pipeline der Lese- und der geteilten Ansicht), nie im Block-Widget der
// Live-Ansicht, das ohne Pfad ruft (S4). Die Zeilen-Marken des Körpers werden
// entfernt, weil sie Zeilen der Abfrage-Datei meinen und der Abgleich der
// geteilten Ansicht sie sonst der Karteikarte zuordnete.
//
// **Keine Einbettungs-Hülle.** Der Block trägt eigene Klassen statt
// `wiki-embed`, damit das Auffrischen der Einbettungen ihn nicht als
// Einbettung neu zeichnet; mit dem Pfad der Abfrage-Datei als Bezug wäre die
// Karteikarte als Bezug verloren.
//
// **Ein Blatt-Modul ohne Rück-Import.** Schritt-Satz, aktives Dokument einer
// Spalte und das Öffnen einer Datei kommen über `initKarteikartenSichten` aus
// `views/pane-render.js`; ein Import der Pipeline oder des Zustands von hier
// zöge dieses Modul in den eingefrorenen Datei-Zyklus des Anzeige-Prozesses.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { renderedPaneIndex } from '../views/pane-lookup.js';
import { pathCompareKey } from '../../../shared/platform.js';
import { datenbankAuskunft } from './datenbank-bereich.js';
import { karteikarteAus } from './karteikarte-erkennung.js';

const HUELLE = 'db-card-views';

// Die hereingereichte Umgebung; ohne sie blendet das Modul nichts ein.
let teilbaumSchritte = null;
let aktivesDokument = () => null;
let oeffne = () => {};

// Je Container die Nummer des jüngsten Laufs: Ein späteres Zeichnen macht ein
// früheres ungültig, bevor dessen Antworten eintreffen.
const laeufe = new WeakMap();

/**
 * Reicht die Umgebung herein (einmal, aus `views/pane-render.js`).
 *
 * @param {object} umgebung
 * @param {Function} umgebung.schritte Der Schritt-Satz des erzeugten Teilbaums
 *   (`applyTeilbaumSchritte`).
 * @param {(paneIdx: number) => object|null} umgebung.aktivesDokument Das
 *   geöffnete Dokument einer Spalte.
 * @param {(pfad: string) => void} umgebung.oeffne Öffnet eine Datei in der
 *   aktiven Spalte.
 */
export function initKarteikartenSichten(umgebung) {
  teilbaumSchritte = typeof umgebung.schritte === 'function' ? umgebung.schritte : null;
  if (typeof umgebung.aktivesDokument === 'function') aktivesDokument = umgebung.aktivesDokument;
  if (typeof umgebung.oeffne === 'function') oeffne = umgebung.oeffne;
}

// Der Text des Dokuments, das der Container zeigt: der Reiter seiner Spalte,
// sofern er dieses Dokument zeigt, also auch ein noch nicht gespeicherter Stand.
function textDes(container, basePath) {
  const tab = aktivesDokument(renderedPaneIndex(container));
  if (!tab || typeof tab.content !== 'string' || typeof tab.path !== 'string') return null;
  return pathCompareKey(tab.path) === pathCompareKey(basePath) ? tab.content : null;
}

function entferne(container) {
  for (const alt of container.querySelectorAll(`:scope > .${HUELLE}`)) alt.remove();
}

/**
 * Blendet die Sichten einer Karteikarte in den gezeichneten Baum ein.
 * Gerufen synchron aus der Dateikopf-Zeile; die Auskunft der Datenbank und die
 * Abfrage-Dateien kommen danach. Ein Dokument, das keine Karteikarte ist,
 * kostet allein die Prüfung seines Textes. Der synchrone Teil (Lauf-Nummer,
 * Entfernen alter Blöcke) läuft vor dem ersten Warten.
 *
 * @param {Element} container Der gezeichnete Baum der Ansicht.
 * @param {string} basePath Pfad des gezeigten Dokuments.
 * @returns {Promise<void>} Erfüllt, wenn alle Blöcke gefüllt sind.
 */
export async function blendeSichtenEin(container, basePath) {
  if (!container || typeof basePath !== 'string' || basePath === '') return;
  const lauf = (laeufe.get(container) || 0) + 1;
  laeufe.set(container, lauf);
  entferne(container);
  if (!teilbaumSchritte || !isExtensionActive('database')) return;
  const text = textDes(container, basePath);
  // Ohne Kennung im Text keine Karteikarte; die Auskunft wird gar nicht gefragt.
  if (typeof text !== 'string' || !text.includes('db-record')) return;
  await zeichne(container, basePath, text, lauf);
}

async function zeichne(container, basePath, text, lauf) {
  let auskunft;
  try {
    auskunft = await datenbankAuskunft();
  } catch {
    return;
  }
  const gilt = () => laeufe.get(container) === lauf && container.isConnected;
  if (!gilt() || !isExtensionActive('database')) return;
  const karte = karteikarteAus(basePath, text, auskunft.tabellen);
  if (!karte) return;
  const tabelle = auskunft.tabellen.find(
    (e) =>
      e && typeof e.path === 'string' && pathCompareKey(e.path) === pathCompareKey(karte.tabelle),
  );
  const sichten = tabelle && Array.isArray(tabelle.sichten) ? tabelle.sichten : [];
  if (sichten.length === 0) return;
  const huelle = document.createElement('div');
  huelle.className = HUELLE;
  const bloecke = sichten.map(() => huelle.appendChild(document.createElement('div')));
  setzeEin(container, huelle);
  await Promise.all(sichten.map((sicht, i) => fuelle(bloecke[i], sicht, basePath, gilt)));
}

// Unter den Dateikopf, vor den Freitext; ohne gezeichnete Dateikopf-Zeile
// (Anzeige des Dateikopfs abgeschaltet) an den Anfang.
function setzeEin(container, huelle) {
  const kopf = container.querySelector(':scope > .frontmatter-block');
  if (kopf) kopf.after(huelle);
  else container.prepend(huelle);
}

async function fuelle(block, sicht, basePath, gilt) {
  block.className = 'db-card-view';
  const name = typeof sicht.name === 'string' ? sicht.name : '';
  if (typeof sicht.path !== 'string') {
    zeigeFehlend(block, name);
    return;
  }
  let ergebnis;
  try {
    ergebnis = await api.readEmbedFile(basePath, zielZurKarte(basePath, sicht.path), null);
  } catch {
    ergebnis = null;
  }
  if (!gilt()) return;
  if (!ergebnis || !ergebnis.ok) {
    zeigeFehlend(block, name);
    return;
  }
  const text = typeof ergebnis.content === 'string' ? ergebnis.content : '';
  block.appendChild(kopfzeile(ergebnis.path || sicht.path));
  const koerper = document.createElement('div');
  koerper.className = 'db-card-view-body wiki-embed-md-body markdown-body';
  koerper.dataset.embedBase = ergebnis.path || sicht.path;
  koerper.innerHTML = api.renderMarkdown(text, koerper.dataset.embedBase, {
    frontmatterBlock: false,
  });
  for (const el of koerper.querySelectorAll('[data-source-line]'))
    el.removeAttribute('data-source-line');
  block.appendChild(koerper);
  // Der Bezug ist die Karteikarte, nicht die Abfrage-Datei (Datei-Kopf).
  teilbaumSchritte(koerper, basePath, { dokumentText: text });
}

/**
 * 4T-002499: Das Ziel für den Lese-Kanal der Einbettungen, relativ zum Ordner
 * der Karteikarte. Der Kanal deutet ein Ziel, das mit «/» beginnt, als
 * Unterseite des Dokuments (`![[/Name]]`, `subpages.isRelativeTarget`); unter
 * Linux und macOS beginnt so jeder absolute Pfad, und die Sicht galt dort als
 * fehlend. Relativ geschrieben geht die Abfrage-Datei hinein wie ein
 * geschriebener Verweis neben dem Dokument. Ohne gemeinsame Wurzel (anderes
 * Laufwerk, anderer Server oder andere Freigabe eines Netzwerk-Pfads) bleibt das
 * Ziel unverändert; das kommt nur unter Windows vor, und dort beginnt es nie mit
 * «/». Die Abschnitte werden mit `pathCompareKey` verglichen, unter Windows also
 * ohne Rücksicht auf die Schreibung.
 *
 * @param {string} basePath Pfad der Karteikarte.
 * @param {string} ziel Absoluter Pfad der Abfrage-Datei aus dem Katalog.
 * @returns {string}
 */
export function zielZurKarte(basePath, ziel) {
  const von = String(basePath).split(/[\\/]/).slice(0, -1);
  const nach = String(ziel).split(/[\\/]/);
  let gemeinsam = 0;
  while (
    gemeinsam < von.length &&
    gemeinsam < nach.length - 1 &&
    pathCompareKey(von[gemeinsam]) === pathCompareKey(nach[gemeinsam])
  )
    gemeinsam += 1;
  if (gemeinsam < wurzelLaenge(von)) return ziel;
  return [...von.slice(gemeinsam).map(() => '..'), ...nach.slice(gemeinsam)].join('/');
}

// Zahl der Abschnitte, die die Wurzel eines zerlegten Pfads bilden: vier bei
// einem Netzwerk-Pfad (`\\server\freigabe`, zwei leere Abschnitte davor), sonst
// einer, das Laufwerk «C:» oder unter Linux und macOS der leere Abschnitt vor
// dem ersten «/». Über die Wurzel hinaus führt «..» nicht.
function wurzelLaenge(teile) {
  return teile[0] === '' && teile[1] === '' ? 4 : 1;
}

function dateiNameOhneEndung(pfad) {
  const name = String(pfad).split(/[\\/]/).pop() || '';
  return name.replace(/\.md$/i, '');
}

function kopfzeile(pfad) {
  const kopf = document.createElement('div');
  kopf.className = 'db-card-view-header wiki-embed-md-header';
  const marke = document.createElement('span');
  marke.className = 'db-card-view-label';
  marke.textContent = t('database.card.viewLabel');
  kopf.appendChild(marke);
  const link = document.createElement('a');
  link.className = 'db-card-view-link wiki-embed-md-header-link';
  link.href = '#';
  link.title = t('database.card.viewTitle');
  link.textContent = dateiNameOhneEndung(pfad);
  link.addEventListener('click', (e) => {
    e.preventDefault();
    // Sonst liefe der Klick zusätzlich durch den delegierten Klick-Weg der
    // Ansicht (Muster der Kopfzeile einer Einbettung).
    e.stopPropagation();
    oeffne(pfad);
  });
  kopf.appendChild(link);
  return kopf;
}

function zeigeFehlend(block, name) {
  block.classList.add('db-card-view-missing');
  block.textContent = t('database.card.viewMissing').split('{name}').join(name);
}
