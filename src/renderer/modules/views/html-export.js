// --- HTML-Export (4T-002167, Epic 3E-000347) -----------------------------------
// Dritter Endpunkt der gemeinsamen Druck-Vorbereitung (print-preparation.js),
// nach dem Vorbild von pdf-export.js: Zielpfad-Dialog im Normal-Layout, dann
// innerhalb der Vorbereitung — helles Farbschema, Diagramme hell gezeichnet,
// Abfragen, Journal- und Skript-Bloecke fertig — den fertig gerenderten Inhalt
// erfassen und zu einer eigenstaendigen Datei zusammensetzen. Die Huelle
// selbst baut html-export-datei.js (reine Funktion, fuer den Folien-Export der
// Stufe 1 wiederverwendbar); hier liegt alles DOM-Abhaengige:
//
//   - Stile: die Inhalts-Regeln aus document.styleSheets nach STIL_ANKER, die
//     Farb- und Schrift-Variablen aus den berechneten Werten der Vorbereitung,
//     KaTeX samt Schriften nur bei Formeln (Hauptprozess, html:katexStyles).
//   - Bedien-Elemente nach BEDIEN_ELEMENTE entfernen, Aufgaben-Checkboxen
//     sperren, kein Skript in der Ausgabe.
//   - Bilder: Daten- und http(s)-Adressen bleiben, jedes andere Bild (und jede
//     PDF-Einbettung) wird durch seinen Text ersetzt und gezaehlt.
//   - Verweise: Sprungziele im Dokument, http(s) und mailto bleiben, jeder
//     andere Verweis wird zu einem gekennzeichneten Text und gezaehlt.
//   - Meldung in der Statusleiste, mit Zusatz nur bei Verlusten
//     (Grundsatz «bestmoeglicher Ersatz, nie still»).
'use strict';

import { intlLocale, t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state, tabDisplayName, withDialog } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';

import { baueHtmlDatei } from './html-export-datei.js';
import { buildPdfSourcePrintElement } from './pdf-source-print.js';
import { withPrintPreparation } from './print-preparation.js';
import { quelltextFuerExport } from './quelltext-export.js';
import { showStatusbarHint } from './views.js';

// Inhalts-Regeln tragen einen dieser Anker im Selektor; alle anderen Regeln
// gehoeren zur Oberflaeche (Leisten, Reiter, Seitenleisten) und bleiben draussen.
export const STIL_ANKER = [
  '.markdown-body',
  '.pdf-source-print',
  '.hljs',
  '.katex',
  '.mermaid-block',
  '.perspective-chart',
];

// Bedien-Elemente, die in der Datei nichts bewirken und deshalb entfallen.
// Grundlage ist die Liste, die der Druck ausblendet (body.printing in
// styles/export-historie-und-statistik.css), ergaenzt um die Filter-Leisten
// und Editoren der Ereignis- und Datentabellen-Bloecke, die in der Anwendung
// ueber Ansichts-Klassen verborgen werden, die es in der Datei nicht gibt.
export const BEDIEN_ELEMENTE = [
  // Kopier-Knopf der Code-Bloecke
  '.code-copy-button',
  // Sortier-Griff der sortierbaren Tabellen
  '.perspective-sort-icon',
  // Zugang und Klapp-Griff des Canvas-Blocks
  '.canvas-block-aktionen',
  // Aktions-Spalte und Schaltflaeche des Datensatz-Blocks
  '.prc-action',
  '.prc-action-head',
  // Block-Eigenschaften-Zeichen
  '.block-meta-indicator',
  // Kopfzeile des workflow-Blocks mit Prüf-Ergebnis und Knopf «Starten»
  '.cm-wf-kopf',
  // Ereignis-Block: Ansichts-Umschalter, Filter-Leiste und ihr Schalter,
  // Erfassungs-Zeile, Aktions-Spalte und Kalender-Blaetterknoepfe
  '.pev-switcher',
  '.pev-filter-toggle',
  '.pev-filter-bar',
  '.pev-add-form',
  '.pev-col-actions',
  '.pev-actions',
  '.pev-cal-nav',
  '.pev-link-popup',
  // Datentabellen-Block: Filter-Zeile und ihr Schalter, Loesch-Spalte und
  // Zeile-hinzufuegen-Knopf
  '.pdt-filter-toggle',
  '.pdt-filter-row',
  '.pdt-row-del',
  '.pdt-add-row',
];

// Elemente, die ein Programm tragen oder laden koennten; die Datei enthaelt keins.
const PROGRAMM_ELEMENTE = ['script', 'iframe', 'object', 'noscript', 'template'];

// Eigene Regeln der Datei: Grund der Seite, der Quelltext-Block (in der
// Anwendung ausserhalb des Drucks verborgen) und die beiden Ersatz-Formen.
export const EXPORT_REGELN = [
  'html, body { margin: 0; background: var(--bg); color: var(--fg); }',
  '.pdf-source-print { display: block; font-family: var(--editor-font-family); ' +
    'font-size: 10pt; line-height: 1.5; }',
  '.export-verweis-ohne-ziel { color: var(--accent); text-decoration: underline dotted; ' +
    'text-underline-offset: 2px; cursor: help; }',
  '.export-bild-fehlt { color: var(--fg-muted); font-style: italic; ' +
    'border: 1px dashed var(--border); border-radius: 3px; padding: 0 4px; }',
].join('\n');

// Ein Anker gilt auch fuer seine Ableitungen mit Bindestrich (.hljs-keyword,
// .katex-display, .mermaid-block-error), nicht aber fuer laengere Namen ohne
// Trenner.
//
// 4T-002163 (Epic 3E-000149): Der Folien-Export ruft dieselbe Erfassung mit
// einer erweiterten Anker-Liste (die Klassen der Folie); deshalb ist das Muster
// aus einer Liste baubar und nicht nur fest.
export function ankerMuster(anker) {
  return new RegExp(
    `(${anker.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w])`,
  );
}
const ANKER_MUSTER = ankerMuster(STIL_ANKER);
// Regeln des Druck-Zustands (html.printing, body.printing, .printing-source).
const DRUCK_MUSTER = /\.printing(?![\w])/;
// Regeln des dunklen Farbschemas; die Datei ist immer hell. Die helle Form
// `:not([data-theme="dark"])` bleibt (vor der Klammer steht dort `(`).
const DUNKEL_MUSTER = /(^|[^(])\[data-theme=["']?dark["']?\]/;
const KATEX_STILBLATT = /(^|\/)katex\/katex\.css$/i;

/**
 * Zerlegt eine Selektor-Liste an den Kommas der obersten Ebene (nicht in
 * Klammern, eckigen Klammern oder Anfuehrungszeichen).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function teileSelektorListe(text) {
  const teile = [];
  let tiefe = 0;
  let zitat = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i];
    if (zitat) {
      if (z === '\\') i += 1;
      else if (z === zitat) zitat = null;
      continue;
    }
    if (z === '"' || z === "'") zitat = z;
    else if (z === '(' || z === '[') tiefe += 1;
    else if (z === ')' || z === ']') tiefe -= 1;
    else if (z === ',' && tiefe === 0) {
      teile.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  teile.push(text.slice(start).trim());
  return teile.filter(Boolean);
}

/**
 * Gehoert ein einzelner Selektor zum Inhalt? Ja, wenn er einen Anker traegt
 * und weder dem Druck-Zustand noch dem dunklen Farbschema gilt.
 *
 * @param {string} selektor
 * @param {RegExp} [muster] Anker-Muster (Vorgabe: STIL_ANKER).
 * @returns {boolean}
 */
export function istInhaltsSelektor(selektor, muster = ANKER_MUSTER) {
  return muster.test(selektor) && !DRUCK_MUSTER.test(selektor) && !DUNKEL_MUSTER.test(selektor);
}

function regelnLesen(behaelter) {
  try {
    return Array.from(behaelter.cssRules || []);
  } catch {
    // Ein fremdes Stilblatt verweigert den Zugriff; es traegt keine Inhalts-Regeln.
    return [];
  }
}

function inhaltsRegelnAus(regeln, muster = ANKER_MUSTER) {
  const aus = [];
  for (const regel of regeln) {
    if (typeof regel.selectorText === 'string') {
      const behalten = teileSelektorListe(regel.selectorText).filter((s) =>
        istInhaltsSelektor(s, muster),
      );
      if (!behalten.length) continue;
      const text = regel.cssText;
      aus.push(`${behalten.join(', ')} ${text.slice(text.indexOf('{'))}`);
      continue;
    }
    if (regel.media && regel.cssRules) {
      const bedingung = regel.media.mediaText || regel.conditionText || '';
      if (/\bprint\b/i.test(bedingung)) continue;
      const innen = inhaltsRegelnAus(regelnLesen(regel), muster);
      if (innen.length) aus.push(`@media ${bedingung} {\n${innen.join('\n')}\n}`);
      continue;
    }
    if (regel.cssRules && /^@supports/i.test(regel.cssText || '')) {
      const innen = inhaltsRegelnAus(regelnLesen(regel), muster);
      if (innen.length) aus.push(`@supports ${regel.conditionText} {\n${innen.join('\n')}\n}`);
    }
    // @font-face, @keyframes und Uebriges: nicht Teil der Inhalts-Stile; die
    // Schriften von KaTeX kommen gesondert (html:katexStyles).
  }
  return aus;
}

/**
 * Die Inhalts-Regeln eines Stilblatts, als Liste von Regel-Texten.
 *
 * @param {CSSStyleSheet} blatt
 * @param {RegExp} [muster] Anker-Muster (Vorgabe: STIL_ANKER).
 * @returns {string[]}
 */
export function regelnEinesStilblatts(blatt, muster = ANKER_MUSTER) {
  return inhaltsRegelnAus(regelnLesen(blatt), muster);
}

/**
 * Die Inhalts-Regeln aller geladenen Stilblaetter in Lade-Reihenfolge, ohne
 * das KaTeX-Stilblatt (das kommt nur bei Formeln, mit Schriften).
 *
 * @param {Document} [doc]
 * @param {string[]} [anker] Anker-Liste (Vorgabe STIL_ANKER; der Folien-Export
 *   reicht sie um die Klassen der Folie erweitert herein).
 * @returns {string}
 */
export function sammleInhaltsRegeln(doc = document, anker = STIL_ANKER) {
  const muster = anker === STIL_ANKER ? ANKER_MUSTER : ankerMuster(anker);
  const aus = [];
  for (const blatt of Array.from(doc.styleSheets || [])) {
    if (blatt.href && KATEX_STILBLATT.test(blatt.href)) continue;
    aus.push(...regelnEinesStilblatts(blatt, muster));
  }
  return aus.join('\n');
}

function sammleVariablenNamen(regeln, namen) {
  for (const regel of regeln) {
    if (regel.style) {
      for (let i = 0; i < regel.style.length; i += 1) {
        const name = regel.style[i];
        if (name && name.startsWith('--')) namen.add(name);
      }
    }
    if (regel.cssRules) sammleVariablenNamen(regelnLesen(regel), namen);
  }
}

/**
 * Der Variablen-Block der Datei: jede in den Stilblaettern oder am
 * Wurzel-Element gesetzte Variable mit ihrem berechneten Wert an der Wurzel.
 * Waehrend der Vorbereitung stehen dort die hellen Werte (pdfColorOverrides),
 * die Datei traegt sie also, ohne die Liste der Farb-Felder zu kennen.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {string}
 */
export function variablenBlock(doc = document, win = window) {
  const namen = new Set();
  for (const blatt of Array.from(doc.styleSheets || [])) {
    sammleVariablenNamen(regelnLesen(blatt), namen);
  }
  const wurzelStil = doc.documentElement.style;
  for (let i = 0; i < wurzelStil.length; i += 1) {
    if (wurzelStil[i].startsWith('--')) namen.add(wurzelStil[i]);
  }
  const berechnet = win.getComputedStyle(doc.documentElement);
  const zeilen = [];
  for (const name of namen) {
    const wert = (
      berechnet.getPropertyValue(name) ||
      wurzelStil.getPropertyValue(name) ||
      ''
    ).trim();
    if (wert) zeilen.push(`  ${name}: ${wert};`);
  }
  return `:root {\n${zeilen.join('\n')}\n}`;
}

function dateiName(adresse) {
  const ohneZusatz = String(adresse || '').split(/[?#]/)[0];
  const letzter = ohneZusatz.split(/[\\/]/).pop() || '';
  try {
    return decodeURIComponent(letzter);
  } catch {
    return letzter;
  }
}

function ersetzeDurchSpan(element, klasse, text, titel) {
  const span = element.ownerDocument.createElement('span');
  span.className = klasse;
  if (titel) span.setAttribute('title', titel);
  span.textContent = text;
  element.replaceWith(span);
  return span;
}

function verweisZiel(a) {
  if (a.classList.contains('wiki-embed-md-header-link')) {
    const einbettung = a.closest('.wiki-embed');
    return (einbettung && einbettung.getAttribute('data-embed-path')) || a.textContent || '';
  }
  const href = a.getAttribute('href') || '';
  if (href.startsWith('#tag:')) return `#${href.slice(5)}`;
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

function bleibtVerweis(a) {
  if (a.classList.contains('wiki-embed-md-header-link')) return false;
  const href = (a.getAttribute('href') || '').trim();
  if (/^(https?:|mailto:)/i.test(href)) return true;
  // Sprungziel im selben Dokument; ein nacktes '#' und Tag-Verweise haben
  // in der Datei kein Ziel.
  return href.startsWith('#') && href.length > 1 && !href.startsWith('#tag:');
}

/**
 * Bereitet einen geklonten Inhalt fuer die Datei vor (veraendert ihn in place)
 * und zaehlt, was dabei entfallen ist.
 *
 * @param {Element} wurzel Behaelter mit dem geklonten Inhalt.
 * @param {object} [opts]
 * @param {(key: string) => string} [opts.uebersetze] Uebersetzung (Vorgabe t).
 * @returns {{verweise: number, bilder: number, diagramme: number, formeln: boolean}}
 */
export function bereiteInhaltVor(wurzel, opts = {}) {
  const uebersetze = opts.uebersetze || t;
  const zaehler = { verweise: 0, bilder: 0, diagramme: 0, formeln: false };

  for (const el of wurzel.querySelectorAll(PROGRAMM_ELEMENTE.join(', '))) el.remove();
  for (const el of wurzel.querySelectorAll(BEDIEN_ELEMENTE.join(', '))) el.remove();

  // Ereignis-Behandler als Attribute (on...) tragen Programm-Text und fallen
  // weg; javascript:-Adressen behandelt die Verweis-Regel unten (kein Ziel).
  for (const el of wurzel.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }

  // Aufgaben-Checkboxen bleiben sichtbar, sind aber nicht bedienbar.
  for (const box of wurzel.querySelectorAll('input[type="checkbox"]')) {
    box.setAttribute('disabled', '');
  }

  for (const bild of wurzel.querySelectorAll('img')) {
    const src = (bild.getAttribute('src') || '').trim();
    if (/^(data:|https?:)/i.test(src)) continue;
    const herkunft =
      bild.getAttribute('data-src-original') || bild.getAttribute('data-anwendungsbild') || src;
    const text =
      bild.getAttribute('alt') || dateiName(herkunft) || uebersetze('export.html.bildOhneText');
    ersetzeDurchSpan(bild, 'export-bild-fehlt', text);
    zaehler.bilder += 1;
  }
  for (const einbettung of wurzel.querySelectorAll('embed')) {
    const text =
      dateiName(einbettung.getAttribute('src')) || uebersetze('export.html.bildOhneText');
    ersetzeDurchSpan(einbettung, 'export-bild-fehlt', text);
    zaehler.bilder += 1;
  }

  const vorlage = uebersetze('export.html.verweisOhneZiel');
  for (const a of wurzel.querySelectorAll('a')) {
    if (!a.hasAttribute('href') && !a.classList.contains('wiki-embed-md-header-link')) continue;
    if (bleibtVerweis(a)) continue;
    const span = a.ownerDocument.createElement('span');
    span.className = 'export-verweis-ohne-ziel';
    span.setAttribute('title', vorlage.replace('{ziel}', verweisZiel(a)));
    while (a.firstChild) span.appendChild(a.firstChild);
    a.replaceWith(span);
    zaehler.verweise += 1;
  }

  zaehler.diagramme = wurzel.querySelectorAll('[data-chart-ausgabe="not-read-in-time"]').length;
  zaehler.formeln = !!wurzel.querySelector('.katex');
  return zaehler;
}

function zahlTeil(n, schluessel, uebersetze) {
  if (n === 1) return uebersetze(`${schluessel}One`);
  return uebersetze(`${schluessel}Many`).replace('{n}', String(n));
}

/**
 * Die Statusleisten-Meldung nach dem Export: «Als HTML exportiert», und nur
 * wenn etwas entfallen ist, der Zusatz mit den Teilen, deren Zahl ueber null
 * liegt.
 *
 * @param {{verweise: number, bilder: number, diagramme: number}} zaehler
 * @param {(key: string) => string} [uebersetze]
 * @returns {string}
 */
export function meldungsText(zaehler, uebersetze = t) {
  const teile = [];
  if (zaehler.verweise > 0)
    teile.push(zahlTeil(zaehler.verweise, 'export.html.verweise', uebersetze));
  if (zaehler.bilder > 0) teile.push(zahlTeil(zaehler.bilder, 'export.html.bilder', uebersetze));
  if (zaehler.diagramme > 0) {
    teile.push(zahlTeil(zaehler.diagramme, 'export.html.diagramme', uebersetze));
  }
  if (!teile.length) return uebersetze('export.html.statusOk');
  return uebersetze('export.html.statusOkMitHinweisen').replace('{hinweise}', teile.join(', '));
}

// Uebertraegt den angezeigten Stand der Checkboxen auf den Klon: cloneNode
// kopiert Attribute, nicht den Zustand einer Checkbox, die seit dem Rendern
// umgeschaltet wurde.
function checkboxStandUebertragen(quelle, klon) {
  const original = quelle.querySelectorAll('input[type="checkbox"]');
  const kopie = klon.querySelectorAll('input[type="checkbox"]');
  if (original.length !== kopie.length) return;
  original.forEach((box, i) => {
    if (box.checked) kopie[i].setAttribute('checked', '');
    else kopie[i].removeAttribute('checked');
  });
}

/**
 * Erfasst einen gerenderten Inhalt und baut daraus den Datei-Text.
 *
 * @param {object} teile
 * @param {Element} teile.quelle Das gerenderte Inhalts-Element.
 * @param {boolean} teile.alsElement true: das Element selbst uebernehmen
 *   (Quelltext-Block), sonst nur seinen Inhalt (.markdown-body).
 * @param {string} teile.titel Titel der Datei.
 * @param {Element} [teile.inhaltsBereich] Der Inhalts-Bereich der Spalte
 *   (`.content`); seine Klassen umschliessen den Inhalt in der Datei.
 * @param {() => Promise<string>} [teile.leseKatexStile] Liefert das
 *   KaTeX-Stilblatt mit Schriften (Vorgabe: Hauptprozess).
 * @returns {Promise<{html: string, zaehler: object}>}
 */
export async function erfasseHtmlExport({
  quelle,
  alsElement,
  titel,
  inhaltsBereich,
  leseKatexStile,
}) {
  const doc = quelle.ownerDocument;
  const behaelter = doc.createElement('div');
  if (alsElement) behaelter.appendChild(quelle.cloneNode(true));
  else
    for (const kind of Array.from(quelle.childNodes)) behaelter.appendChild(kind.cloneNode(true));
  checkboxStandUebertragen(quelle, behaelter);

  const zaehler = bereiteInhaltVor(behaelter);
  const stile = [variablenBlock(doc, doc.defaultView), sammleInhaltsRegeln(doc)];
  if (zaehler.formeln) {
    const lesen = leseKatexStile || leseKatexStileUeberHauptprozess;
    stile.push(await lesen());
  }
  stile.push(EXPORT_REGELN);
  // Option (a) der Sitzung vom 2026-10-07: Die Klassen der Vorfahren reisen
  // mit, damit Inhalts-Regeln mit einer Bedingung an Wurzel oder
  // Inhalts-Bereich (`:root.frontmatter-expanded ...`, `.content.view-rendered
  // ...`) auch in der Datei greifen und sie dem angezeigten Stand folgt.
  const html = baueHtmlDatei({
    titel,
    sprache: intlLocale(),
    inhaltHtml: behaelter.innerHTML,
    stile,
    wurzelKlassen: klassenOhneDruck(doc.documentElement),
    inhaltsKlassen: klassenOhneDruck(inhaltsBereich),
  });
  return { html, zaehler };
}

// Die Klassen eines Elements ohne die des Druck-Zustands, den die Vorbereitung
// fuer die Dauer des Laufs setzt.
export function klassenOhneDruck(element) {
  if (!element || !element.classList) return '';
  return Array.from(element.classList)
    .filter((k) => k !== 'printing')
    .join(' ');
}

// 4T-002163: auch vom Folien-Export gerufen (eine Seite je Folie mit Formeln).
export async function leseKatexStileUeberHauptprozess() {
  const antwort = await api.readHtmlExportKatexStyles();
  if (!antwort || !antwort.ok) {
    throw new Error((antwort && antwort.error) || 'KaTeX-Stil nicht lesbar');
  }
  return antwort.css;
}

// Exportiert den gerenderten Inhalt des aktiven Reiters als HTML-Datei.
// Returnt true bei geschriebener Datei.
export async function exportActiveTabAsHtml() {
  let zaehler = null;
  const outcome = await withPrintPreparation({
    // Zielpfad wie beim PDF: Dokument mit Pfad -> <Name>.html im selben
    // Ordner; pfadloser Reiter -> Anzeigename im Home-Verzeichnis (Aufloesung
    // im Main). Abbruch: still, kein Hinweis.
    prepare: async (tab) => {
      const paneIdx = state.activePaneIndex;
      const quelltext = tab.viewMode === 'source';
      const titel = tabDisplayName(tab);
      let suggestedPath = null;
      let suggestedName = null;
      if (tab.path) {
        suggestedPath = tab.path.replace(/\.(md|markdown|mdown|mkd)$/i, '') + '.html';
      } else {
        const base = String(titel || '')
          .replace(/[\\/:*?"<>|]/g, '_')
          .trim();
        if (base) suggestedName = `${base}.html`;
      }
      const target = await withDialog(() =>
        api.chooseHtmlExportTarget({ suggestedPath, suggestedName }),
      );
      if (!target || !target.ok || !target.path) return null;
      return { path: target.path, paneIdx, quelltext, titel, tab };
    },
    // Inhalt erfassen, Datei bauen, ueber den Hauptprozess schreiben.
    output: async (ziel) => {
      const els = getPaneEls(ziel.paneIdx);
      // Aus der Quelltext-Ansicht entsteht der Block hier aus dem bereinigten
      // Text, nach derselben Regel wie der Print-Block der Druck-Vorbereitung
      // (quelltext-export.js, seit 4T-002188 auch fuer PDF und Druck). Er
      // wird hier gebaut statt uebernommen, weil die Klammer ihren Block nur
      // in die Spalte haengt und dem Endpunkt nicht uebergibt.
      const quelle = ziel.quelltext
        ? buildPdfSourcePrintElement(
            quelltextFuerExport(ziel.tab.content, isExtensionActive('comments')),
            { showLineNumbers: !!ziel.tab.showLineNumbers },
          )
        : els.renderedHtml;
      if (!quelle) return { ok: false, error: 'kein gerenderter Inhalt' };
      const erfasst = await erfasseHtmlExport({
        quelle,
        alsElement: ziel.quelltext,
        titel: ziel.titel,
        inhaltsBereich: els.content,
      });
      const antwort = await api.writeHtmlExport(ziel.path, erfasst.html);
      if (!antwort || !antwort.ok) {
        return { ok: false, error: (antwort && antwort.error) || '' };
      }
      zaehler = erfasst.zaehler;
      return { ok: true };
    },
  });

  if (outcome.ok) {
    const verluste = !!zaehler && zaehler.verweise + zaehler.bilder + zaehler.diagramme > 0;
    showStatusbarHint('export.html.statusOk', {
      duration: verluste ? 4000 : 1500,
      text: meldungsText(zaehler || { verweise: 0, bilder: 0, diagramme: 0 }),
    });
    return true;
  }
  if (outcome.canceled) return false;
  showStatusbarHint('export.html.statusError', {
    duration: 3000,
    error: true,
    text: t('export.html.statusError').replace('{error}', outcome.error || ''),
  });
  return false;
}
