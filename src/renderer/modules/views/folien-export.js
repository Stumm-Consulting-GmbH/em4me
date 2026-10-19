// --- Ausgaben des Foliensatzes (4T-002163, Epic 3E-000149) -----------------------
// PDF (Story 4S-001054) und HTML-Seiten (Story 4S-001057) einer Praesentation,
// als vierter und fuenfter Endpunkt der gemeinsamen Druck-Vorbereitung
// (print-preparation.js), nach dem Vorbild von pdf-export.js und
// html-export.js.
//
// **Druck-Flaeche.** Beide Wege bauen nach dem Ziel-Dialog eine Flaeche mit
// JEDER Folie in ihrer Entwurfsgroesse (1280 x 720, bei 4:3 960 x 720), ohne
// Skalierung, je Folie eine Seite. Gezeichnet wird jede Folie mit derselben
// Funktion wie in der Ansicht (presentation-folie.js, `zeichneFolie`) und
// derselben Render-Pipeline, und der Schritt-Satz des erzeugten Teilbaums
// laeuft wie fuer die gezeigte Folie (Diagramme, Formeln, Tabellen-Diagramme).
// Die Flaeche haengt im Inhalts-Bereich der aktiven Spalte, damit die
// Barrieren der Vorbereitung (Mermaid hell neu zeichnen, Diagramme zu Tabellen
// abwarten) sie mit erfassen; ausserhalb des Druck-Zustands liegt sie
// ausserhalb des Fensters statt verborgen, weil Mermaid Textbreiten misst und
// in einem verborgenen Knoten Breite 0 bekaeme. Im Druck-Zustand
// (body.printing.printing-folien) ist sie das Einzige, was die Spalte zeigt.
//
// **Warum die gemeinsame Vorbereitung und kein eigener Lauf:** Sie bringt den
// Reentranz-Schutz, das helle Farbschema, die Barrieren und die vollstaendige
// Ruecknahme mit; ein eigener Lauf haette genau diese Strecke ein zweites Mal
// gebaut. Was sie zusaetzlich tut — die Spalte fuer die Dauer in die
// Lese-Ansicht zu schalten und das Dokument dort neu zu zeichnen —, ist fuer
// den Foliensatz ueberzaehlig, aber folgenlos (verdeckt und zurueckgenommen).
//
// **PDF:** Zielpfad ueber den Dialog des Dokument-PDFs, dann printToPDF im
// Folien-Format ohne Rand (Kanal presentationPdf:print, Optionen in
// src/shared/pdf-options.js). Jede Seite bricht nach ihrer Folie um.
//
// **HTML:** Ziel ist ein Ordner. Je Folie eine Seite `folie-001.html` …, dazu
// die Startseite `index.html` mit der ersten Folie. Jede Seite entsteht ueber
// die Datei-Huelle des Dokument-Exports (`baueHtmlDatei`) mit dem geklonten
// Geruest der Folie, den Inhalts-Stilen nach der um die Folien-Klassen
// erweiterten Anker-Liste, KaTeX nur bei Formeln und einem kleinen,
// eingebetteten Blaetter-Skript ohne Fremd-Code. Die Schaltflaechen «Zurueck»
// und «Weiter» sind gewoehnliche Verweise und blaettern auch ohne Skript.
// **Bilder:** Die Render-Pipeline liefert Bilder der Folie als `data:`-Adressen
// (Bild-Aufloeser); sie bleiben in der Seite eingebettet, und die Seite ist
// damit ohne Nachladen eigenstaendig. Das ist die Umsetzungs-Form der
// Entscheidung «Bilder in den Ordner kopiert» (H1): Der Ordner enthaelt alle
// Bilder, eingebettet in die Seiten statt als eigene Dateien.
//
// **Sprecher-Notizen** stehen nie im Quelltext einer Folie (der Format-Kern
// entfernt sie vor dem Zerlegen). Mit dem Schalter «Sprecher-Notizen
// mitgeben» (4T-002283) kommen sie als eigene Seite hinter ihre Folie ins PDF
// und als zugeklappter Notiz-Bereich auf die HTML-Seite, und die Meldung nennt
// ihre Zahl (folien-export-notizen.js); ohne ihn nennt die Meldung sie als
// entfallen (Grundsatz «bestmoeglicher Ersatz, nie still»).
'use strict';

import { intlLocale, t } from '../../i18n.js';

import {
  folienGeometrie,
  hintergrundBilderZiehen,
} from '../../../shared/presentation/presentation-darstellung.js';
import { slotVariablen, themeAufloesen } from '../../../shared/presentation/presentation-themes.js';
import { api } from '../app/api.js';
import { getPaneEls, state, tabDisplayName, withDialog } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  ARTIKEL_KLASSE,
  HUELLE_KLASSE,
  SLIDE_KLASSE,
  UEBERLAUF_KLASSE,
  baueFolie,
  zeichneFolie,
} from '../presentation/presentation-folie.js';
// Der Schritt-Satz des erzeugten Teilbaums. Der Ordner views/ darf ihn
// importieren (print-preparation.js tut es ebenso); die Folien-Flaeche der
// Ansicht bekommt ihn dagegen hereingereicht, weil ihr Ordner sonst in den
// Datei-Zyklus des Renderers geriete.
import { applyTeilbaumSchritte } from '../render-mermaid.js';
// 4T-002278: Die Vorführung im eigenen Fenster bekommt den Bauer des
// Folien-Dokuments von hier gereicht.
import { registriereFolienDokumentBauer } from '../presentation/presentation-publikum.js';
import { eigeneThemes } from '../presentation/presentation-themes-stand.js';

import {
  NOTIZEN_SEITEN_REGELN,
  baueNotizSeite,
  mitgegebeneNotizen,
  notizBereichVon,
  notizenMitgeben,
} from './folien-export-notizen.js';
import { baueHtmlDatei } from './html-export-datei.js';
import {
  EXPORT_REGELN,
  STIL_ANKER,
  bereiteInhaltVor,
  klassenOhneDruck,
  leseKatexStileUeberHauptprozess,
  sammleInhaltsRegeln,
  variablenBlock,
} from './html-export.js';
import { withPrintPreparation } from './print-preparation.js';
import { showStatusbarHint } from './views.js';

/** Klassen der Druck-Flaeche; Lage und Umbruch stehen in presentation.css. */
export const DRUCK_KLASSE = 'presentation-druck';
export const DRUCK_SEITE_KLASSE = 'presentation-druck-seite';
/** Klasse am body fuer die Dauer einer Foliensatz-Ausgabe. */
export const DRUCK_ZUSTAND = 'printing-folien';

/** Inhalts-Anker der Folien-Seite: die des Dokument-Exports und die der Folie. */
export const FOLIEN_ANKER = [...STIL_ANKER, '.presentation-slide', '.presentation-bg'];

/** Name der Startseite und der Seite einer Folie (null-basiert). */
export const STARTSEITE = 'index.html';
export function seitenName(index) {
  return `folie-${String(index + 1).padStart(3, '0')}.html`;
}

// Eigene Regeln der Folien-Seite: dunkler Grund wie in der Vorfuehrung, die
// Folie mittig, darunter die Blaetter-Leiste. Ohne Skript steht die Folie in
// Entwurfsgroesse (die Buehne rollt); mit Skript passt sie sich ein.
export const FOLIEN_SEITEN_REGELN = [
  'html, body { margin: 0; height: 100%; background: #000; }',
  'body { display: flex; flex-direction: column; }',
  'main.praesentation-seite { flex: 1 1 auto; min-height: 0; display: flex; ' +
    'flex-direction: column; }',
  '.praesentation-seite-buehne { flex: 1 1 0; min-height: 0; overflow: auto; display: flex; ' +
    'align-items: center; justify-content: center; }',
  '.praesentation-seite-buehne .presentation-slide-huelle { position: relative; ' +
    'flex: 0 0 auto; box-shadow: none; }',
  `.${UEBERLAUF_KLASSE} { display: none !important; }`,
  '.praesentation-seite-nav { flex: 0 0 auto; display: flex; align-items: center; ' +
    'justify-content: center; gap: 16px; padding: 8px; ' +
    'font: 14px/1.4 system-ui, sans-serif; color: #e8e8e8; }',
  '.praesentation-seite-knopf { color: #e8e8e8; text-decoration: none; padding: 4px 14px; ' +
    'border: 1px solid #666; border-radius: 4px; }',
  'a.praesentation-seite-knopf:hover, a.praesentation-seite-knopf:focus-visible ' +
    '{ border-color: #bbb; outline: none; }',
  '.praesentation-seite-knopf.is-aus { opacity: 0.4; }',
  '.praesentation-seite-zaehler { min-width: 5em; text-align: center; ' +
    'font-variant-numeric: tabular-nums; }',
].join('\n');

// Das Blaetter-Skript jeder Seite: dieselbe Tasten-Tabelle wie in der
// Vorfuehrung (Pfeile, Leertaste, Umschalt+Leertaste, Bild auf/ab, Pos1/Ende),
// die Ziele aus den data-Attributen der Leiste, dazu die gleichmaessige
// Einpassung der Folie in das Fenster. Kein Fremd-Code, kein Nachladen.
export const BLAETTER_SKRIPT = `(function () {
  'use strict';
  var nav = document.querySelector('.praesentation-seite-nav');
  function ziel(name) { return nav ? nav.getAttribute('data-' + name) : null; }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var adresse;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': adresse = ziel('weiter'); break;
      case ' ': case 'Spacebar': adresse = ziel(e.shiftKey ? 'zurueck' : 'weiter'); break;
      case 'ArrowLeft': case 'PageUp': adresse = ziel('zurueck'); break;
      case 'Home': adresse = ziel('erste'); break;
      case 'End': adresse = ziel('letzte'); break;
      default: return;
    }
    e.preventDefault();
    if (adresse) window.location.href = adresse;
  });
  var buehne = document.querySelector('.praesentation-seite-buehne');
  var huelle = buehne && buehne.querySelector('.presentation-slide-huelle');
  var folie = huelle && huelle.querySelector('.presentation-slide');
  if (!folie) return;
  var breite = folie.offsetWidth;
  var hoehe = folie.offsetHeight;
  function einpassen() {
    var s = Math.min(buehne.clientWidth / breite, buehne.clientHeight / hoehe);
    if (!isFinite(s) || s <= 0) return;
    buehne.style.overflow = 'hidden';
    huelle.style.width = breite * s + 'px';
    huelle.style.height = hoehe * s + 'px';
    folie.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', einpassen);
  einpassen();
})();`;

function escapeText(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(wert) {
  return escapeText(wert).replace(/"/g, '&quot;');
}

/**
 * Liest das Dokument als Praesentation ueber die Bruecke zum Format-Kern;
 * die Kommentar-Erweiterung entscheidet, ob `%%`-Spannen Notizen sind.
 *
 * @param {object} tab
 * @returns {object|null} das Modell oder null, wenn es keine Praesentation ist.
 */
export function leseFoliensatz(tab) {
  if (!tab || typeof api.lesePraesentation !== 'function') return null;
  const modell = api.lesePraesentation(tab.content, {
    kommentareAktiv: isExtensionActive('comments'),
    eigeneThemes: eigeneThemes(),
  });
  if (!modell || !modell.istPraesentation || !Array.isArray(modell.folien)) return null;
  return modell;
}

/** Zahl der Sprecher-Notizen im Foliensatz. */
export function notizenZahl(modell) {
  const folien = (modell && modell.folien) || [];
  return folien.reduce((s, f) => s + (Array.isArray(f.notizen) ? f.notizen.length : 0), 0);
}

/**
 * Baut die Druck-Flaeche: je Folie eine Seite in Entwurfsgroesse mit der
 * gezeichneten Folie. Die Flaeche haengt zuerst am Ziel, dann wird gezeichnet,
 * damit nachgelagerte Schritte (Mermaid misst) einen Knoten im Dokument haben.
 *
 * @param {object} angaben
 * @param {Element} angaben.ziel Eltern-Element der Flaeche.
 * @param {Array<object>} angaben.folien Folien des Format-Kerns.
 * @param {object} angaben.kopf Kopf des Format-Kerns.
 * @param {(markdown: string) => string} angaben.render Render-Pipeline.
 * @param {(artikel: Element) => void} [angaben.schritte] Schritt-Satz je Folie.
 * @param {boolean} [angaben.notizen] hinter jeder Folie mit Notizen deren Seite.
 * @returns {HTMLElement} die Flaeche.
 */
export function baueDruckFlaeche({ ziel, folien, kopf, render, schritte, notizen }) {
  const doc = ziel.ownerDocument;
  const flaeche = doc.createElement('div');
  flaeche.className = DRUCK_KLASSE;
  flaeche.setAttribute('aria-hidden', 'true');
  ziel.appendChild(flaeche);
  const geometrie = folienGeometrie(kopf && kopf.size);
  (folien || []).forEach((folie, index) => {
    const seite = doc.createElement('div');
    seite.className = DRUCK_SEITE_KLASSE;
    seite.style.width = `${geometrie.breite}px`;
    seite.style.height = `${geometrie.hoehe}px`;
    const huelle = baueFolie();
    huelle.style.width = `${geometrie.breite}px`;
    huelle.style.height = `${geometrie.hoehe}px`;
    seite.appendChild(huelle);
    flaeche.appendChild(seite);
    zeichneFolie(huelle, { folie, index, kopf, render });
    const artikel = huelle.querySelector(`.${ARTIKEL_KLASSE}`);
    if (schritte && artikel) schritte(artikel);
    if (!notizen) return;
    const angaben = { folie, index, geometrie, seitenKlasse: DRUCK_SEITE_KLASSE, render };
    const notizSeite = baueNotizSeite(doc, angaben);
    if (!notizSeite) return;
    flaeche.appendChild(notizSeite);
    if (schritte) schritte(notizSeite.lastElementChild);
  });
  return flaeche;
}

// Die Flaeche in der aktiven Spalte des Dokuments; der Druck-Zustand der
// Ausgabe kommt an den body.
export function haengeDruckFlaecheAn(paneIdx, tab, modell, notizen) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.content) throw new Error('keine Spalte fuer den Foliensatz');
  const flaeche = baueDruckFlaeche({
    ziel: els.content,
    folien: modell.folien,
    kopf: modell.kopf,
    render: (markdown) => api.renderMarkdown(markdown, tab.path, { frontmatterBlock: false }),
    // Klasse «erzeugter Teilbaum» (Waechter render-teilbaum-schritte.test.js):
    // derselbe Schritt-Satz wie fuer die gezeigte Folie in presentation-pane.js
    // — Darstellung und Befuellung ohne Bearbeitbarkeit, das ganze Dokument
    // als Quelle der Diagramm-Tabellen.
    schritte: (artikel) => applyTeilbaumSchritte(artikel, tab.path, { dokumentText: tab.content }),
    notizen,
  });
  document.body.classList.add(DRUCK_ZUSTAND);
  return flaeche;
}

export function entferneDruckFlaeche(flaeche) {
  if (flaeche) flaeche.remove();
  document.body.classList.remove(DRUCK_ZUSTAND);
}

// Der Name des Dokuments ohne Endung, fuer Datei- und Ordner-Vorschlaege
// (4T-002294: auch fuer den Vorschlag der PowerPoint-Datei).
export function basisName(tab) {
  if (tab.path) {
    const datei = tab.path.split(/[\\/]/).pop() || '';
    return datei.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  }
  return String(tabDisplayName(tab) || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
}

export function ordnerVon(pfad) {
  const i = Math.max(pfad.lastIndexOf('/'), pfad.lastIndexOf('\\'));
  return i > 0 ? pfad.slice(0, i) : null;
}

function zahlTeil(n, schluessel, uebersetze) {
  if (n === 1) return uebersetze(`${schluessel}One`);
  return uebersetze(`${schluessel}Many`).replace('{n}', String(n));
}

/**
 * Die Statusleisten-Meldung einer Foliensatz-Ausgabe: der Grund-Satz mit der
 * Zahl der Folien und, nur wenn etwas entfallen ist, die Liste dazu.
 *
 * @param {string} schluessel `presentation.export.pdfOk` oder `...htmlOk`.
 * @param {{folien: number, ordner?: string, notizen?: number, mitgegeben?: number,
 *   verweise?: number, bilder?: number, diagramme?: number}} angaben
 *   `notizen` zaehlt entfallene, `mitgegeben` mitgegebene Notizen.
 * @param {(key: string) => string} [uebersetze]
 * @returns {{text: string, hinweise: boolean}}
 */
export function folienMeldung(schluessel, angaben, uebersetze = t) {
  const a = angaben || {};
  let grund = uebersetze(schluessel)
    .replace('{folien}', zahlTeil(a.folien || 0, 'presentation.export.folien', uebersetze))
    .replace('{ordner}', String(a.ordner || ''));
  if (a.mitgegeben > 0) {
    grund = uebersetze('export.folien.mitNotizen')
      .replace('{meldung}', grund)
      .replace('{notizen}', zahlTeil(a.mitgegeben, 'export.folien.notizenMit', uebersetze));
  }
  const teile = [];
  if (a.verweise > 0) teile.push(zahlTeil(a.verweise, 'export.html.verweise', uebersetze));
  if (a.bilder > 0) teile.push(zahlTeil(a.bilder, 'export.html.bilder', uebersetze));
  if (a.diagramme > 0) teile.push(zahlTeil(a.diagramme, 'export.html.diagramme', uebersetze));
  if (a.notizen > 0) teile.push(uebersetze('presentation.export.notizenEntfallen'));
  if (!teile.length) return { text: grund, hinweise: false };
  return {
    text: uebersetze('presentation.export.mitHinweisen')
      .replace('{meldung}', grund)
      .replace('{hinweise}', teile.join(', ')),
    hinweise: true,
  };
}

// Mit Schalter die Zahl der mitgegebenen, ohne die der entfallenen Notizen.
function notizAngaben(modell, mitNotizen) {
  return mitNotizen ? { mitgegeben: mitgegebeneNotizen(modell) } : { notizen: notizenZahl(modell) };
}

export function meldeLauf() {
  showStatusbarHint('presentation.export.laeuft', { duration: 60000 });
}

function meldeFehler(schluessel, fehler) {
  showStatusbarHint(schluessel, {
    duration: 3000,
    error: true,
    text: t(schluessel).replace('{error}', fehler || ''),
  });
}

export function meldeKeinFoliensatz() {
  showStatusbarHint('presentation.keinePraesentation', { duration: 2500, error: true });
}

/**
 * Exportiert den Foliensatz des aktiven Dokuments als PDF, eine Folie je Seite
 * im Folien-Format. Returnt true bei geschriebener Datei.
 *
 * @returns {Promise<boolean>}
 */
export async function exportiereFoliensatzAlsPdf() {
  let flaeche = null;
  let modell = null;
  let mitNotizen = false;
  try {
    const outcome = await withPrintPreparation({
      prepare: async (tab) => {
        modell = leseFoliensatz(tab);
        if (!modell) {
          meldeKeinFoliensatz();
          return null;
        }
        const name = basisName(tab);
        const suggestedPath = tab.path
          ? tab.path.replace(/\.(md|markdown|mdown|mkd)$/i, '') + '.pdf'
          : null;
        const suggestedName = !tab.path && name ? `${name}.pdf` : null;
        const ziel = await withDialog(() =>
          api.choosePdfExportTarget({ suggestedPath, suggestedName }),
        );
        if (!ziel || !ziel.ok || !ziel.path) return null;
        mitNotizen = await notizenMitgeben();
        meldeLauf();
        flaeche = haengeDruckFlaecheAn(state.activePaneIndex, tab, modell, mitNotizen);
        return { path: ziel.path, size: modell.kopf && modell.kopf.size };
      },
      output: async (ziel) => {
        try {
          const antwort = await api.printFolienPdf(ziel.path, ziel.size);
          if (!antwort || !antwort.ok)
            return { ok: false, error: (antwort && antwort.error) || '' };
          return { ok: true };
        } finally {
          entferneDruckFlaeche(flaeche);
          flaeche = null;
        }
      },
    });
    if (outcome.ok) {
      const meldung = folienMeldung('presentation.export.pdfOk', {
        folien: modell.folien.length,
        ...notizAngaben(modell, mitNotizen),
      });
      showStatusbarHint('presentation.export.pdfOk', {
        duration: meldung.hinweise ? 4000 : 2000,
        text: meldung.text,
      });
      return true;
    }
    if (outcome.canceled) return false;
    meldeFehler('presentation.export.pdfFehler', outcome.error);
    return false;
  } finally {
    entferneDruckFlaeche(flaeche);
  }
}

/**
 * Baut aus den gezeichneten Folien der Druck-Flaeche die Seiten des Ordners.
 *
 * @param {object} angaben
 * @param {Element} angaben.flaeche Die Druck-Flaeche.
 * @param {Array<object>} angaben.folien Folien des Format-Kerns.
 * @param {string} angaben.titel Anzeigename des Dokuments.
 * @param {string[]} angaben.basisStile Stil-Bloecke aller Seiten.
 * @param {() => Promise<string>} [angaben.leseKatexStile] KaTeX samt Schriften.
 * @param {string} [angaben.sprache] Sprach-Angabe der Seiten.
 * @param {string} [angaben.wurzelKlassen] Klassen fuer <html>.
 * @param {(key: string) => string} [angaben.uebersetze]
 * @returns {Promise<{dateien: Array<{name: string, text: string}>,
 *   zaehler: {verweise: number, bilder: number, diagramme: number}}>}
 */
export async function baueFolienSeiten({
  flaeche,
  folien,
  titel,
  basisStile,
  leseKatexStile,
  sprache,
  wurzelKlassen,
  uebersetze = t,
}) {
  const huellen = Array.from(flaeche.querySelectorAll(`.${HUELLE_KLASSE}`));
  const anzahl = huellen.length;
  const zaehler = { verweise: 0, bilder: 0, diagramme: 0 };
  const dateien = [];
  let katex = null;
  for (let i = 0; i < anzahl; i += 1) {
    const behaelter = flaeche.ownerDocument.createElement('div');
    behaelter.appendChild(huellen[i].cloneNode(true));
    // Hintergrund-Bilder ohne Quelle laesst die Folie stillschweigend weg;
    // hier werden sie als entfallen gezaehlt (Story 4S-001057, AK8).
    const folie = folien[i] || {};
    const erwartet = hintergrundBilderZiehen(folie.quelltext || '').bilder.length;
    const gezeigt = behaelter.querySelectorAll('.presentation-bg-bild').length;
    zaehler.bilder += Math.max(0, erwartet - gezeigt);
    for (const marke of behaelter.querySelectorAll(`.${UEBERLAUF_KLASSE}`)) marke.remove();
    const z = bereiteInhaltVor(behaelter, { uebersetze });
    // Der Notiz-Bereich (4T-002283) aus der Notiz-Seite der Flaeche, durch
    // dieselbe Einbettung wie die Folie; nur, wenn die Folie eine hat.
    const notizen = notizBereichVon(flaeche, i, bereiteInhaltVor, uebersetze);
    for (const k of ['verweise', 'bilder', 'diagramme']) {
      zaehler[k] += z[k] + (notizen ? notizen.z[k] : 0);
    }
    const stile = [...basisStile];
    if (z.formeln || (notizen && notizen.z.formeln)) {
      if (katex === null) katex = await (leseKatexStile || leseKatexStileUeberHauptprozess)();
      stile.push(katex);
    }
    stile.push(FOLIEN_SEITEN_REGELN);
    if (notizen) stile.push(NOTIZEN_SEITEN_REGELN);
    const text = baueHtmlDatei({
      titel: uebersetze('presentation.export.seitenTitel')
        .replace('{titel}', String(titel || ''))
        .replace('{nummer}', String(i + 1))
        .replace('{gesamt}', String(anzahl)),
      sprache: sprache || intlLocale(),
      inhaltHtml: [
        `<div class="praesentation-seite-buehne">${behaelter.innerHTML}</div>`,
        notizen ? notizen.html : '',
        blaetterLeiste(i, anzahl, uebersetze),
      ]
        .filter(Boolean)
        .join('\n'),
      stile,
      wurzelKlassen,
      hauptKlassen: 'praesentation-seite',
      skript: BLAETTER_SKRIPT,
    });
    if (i === 0) dateien.push({ name: STARTSEITE, text });
    dateien.push({ name: seitenName(i), text });
  }
  return { dateien, zaehler };
}

/**
 * Die Blaetter-Leiste einer Seite: «Zurueck», Zaehler, «Weiter». An der ersten
 * und der letzten Folie ist die sinnlose Richtung kein Verweis.
 *
 * @param {number} index null-basiert.
 * @param {number} anzahl
 * @param {(key: string) => string} [uebersetze]
 * @returns {string}
 */
export function blaetterLeiste(index, anzahl, uebersetze = t) {
  const zurueck = index > 0 ? seitenName(index - 1) : null;
  const weiter = index < anzahl - 1 ? seitenName(index + 1) : null;
  const daten = [
    zurueck ? ` data-zurueck="${zurueck}"` : '',
    weiter ? ` data-weiter="${weiter}"` : '',
    index > 0 ? ` data-erste="${seitenName(0)}"` : '',
    index < anzahl - 1 ? ` data-letzte="${seitenName(anzahl - 1)}"` : '',
  ].join('');
  const knopf = (adresse, rel, schluessel) => {
    const text = escapeText(uebersetze(schluessel));
    return adresse
      ? `<a class="praesentation-seite-knopf" href="${adresse}" rel="${rel}">${text}</a>`
      : `<span class="praesentation-seite-knopf is-aus" aria-disabled="true">${text}</span>`;
  };
  const zaehler = uebersetze('presentation.zaehler')
    .replace('{aktuell}', String(index + 1))
    .replace('{gesamt}', String(anzahl));
  return [
    `<nav class="praesentation-seite-nav" aria-label="${escapeAttr(
      uebersetze('presentation.export.navigation'),
    )}"${daten}>`,
    knopf(zurueck, 'prev', 'presentation.zurueck'),
    `<span class="praesentation-seite-zaehler">${escapeText(zaehler)}</span>`,
    knopf(weiter, 'next', 'presentation.weiter'),
    '</nav>',
  ].join('\n');
}

/**
 * Der Variablen-Block des Themes an der Wurzel der Seite. Die Folie traegt
 * dieselben Werte als Stil-Attribut; der Block haelt sie zusaetzlich fuer
 * Regeln ausserhalb der Folie bereit.
 *
 * @param {object} kopf
 * @returns {string}
 */
export function themeVariablen(kopf) {
  const theme = themeAufloesen(kopf && kopf.theme, { eigene: eigeneThemes() });
  const zeilen = Object.entries(slotVariablen(theme.slots)).map(([n, w]) => `  ${n}: ${w};`);
  return `:root {\n${zeilen.join('\n')}\n}`;
}

/**
 * Exportiert den Foliensatz des aktiven Dokuments als Ordner mit einer
 * HTML-Seite je Folie und der Startseite. Returnt true bei geschriebenem
 * Ordner.
 *
 * @returns {Promise<boolean>}
 */
export async function exportiereFoliensatzAlsHtml() {
  let flaeche = null;
  let modell = null;
  let ergebnis = null;
  let mitNotizen = false;
  try {
    const outcome = await withPrintPreparation({
      prepare: async (tab) => {
        modell = leseFoliensatz(tab);
        if (!modell) {
          meldeKeinFoliensatz();
          return null;
        }
        const wahl = await withDialog(() =>
          api.chooseFolienHtmlOrdner({ suggestedDir: tab.path ? ordnerVon(tab.path) : null }),
        );
        if (!wahl || !wahl.ok || !wahl.path) return null;
        mitNotizen = await notizenMitgeben();
        meldeLauf();
        const name = basisName(tab) || t('presentation.export.ordnerOhneName');
        flaeche = haengeDruckFlaecheAn(state.activePaneIndex, tab, modell, mitNotizen);
        return {
          ordner: wahl.path,
          unterordner: t('presentation.export.unterordner').replace('{name}', name),
          titel: tabDisplayName(tab),
        };
      },
      output: async (ziel) => {
        try {
          const doc = document;
          const seiten = await baueFolienSeiten({
            flaeche,
            folien: modell.folien,
            titel: ziel.titel,
            basisStile: [
              variablenBlock(doc, doc.defaultView),
              themeVariablen(modell.kopf),
              sammleInhaltsRegeln(doc, FOLIEN_ANKER),
              EXPORT_REGELN,
            ],
            wurzelKlassen: klassenOhneDruck(doc.documentElement),
          });
          const antwort = await api.writeFolienHtml(ziel.ordner, ziel.unterordner, seiten.dateien);
          if (!antwort || !antwort.ok)
            return { ok: false, error: (antwort && antwort.error) || '' };
          ergebnis = { ...seiten.zaehler, ordner: antwort.name || '' };
          return { ok: true };
        } finally {
          entferneDruckFlaeche(flaeche);
          flaeche = null;
        }
      },
    });
    if (outcome.ok) {
      const meldung = folienMeldung('presentation.export.htmlOk', {
        ...ergebnis,
        folien: modell.folien.length,
        ...notizAngaben(modell, mitNotizen),
      });
      showStatusbarHint('presentation.export.htmlOk', {
        duration: meldung.hinweise ? 4000 : 2000,
        text: meldung.text,
      });
      return true;
    }
    if (outcome.canceled) return false;
    meldeFehler('presentation.export.htmlFehler', outcome.error);
    return false;
  } finally {
    entferneDruckFlaeche(flaeche);
  }
}

// --- Folie für das Publikums-Fenster (4T-002278, Epic 3E-000348) ------------
// Dasselbe Verfahren wie bei den HTML-Seiten, für eine einzelne, bereits
// gezeichnete Folie der Fläche: geklont, auf ihre Entwurfsgröße
// zurückgesetzt (die Fläche skaliert sie), ohne Bedien- und Programm-
// Elemente (bereiteInhaltVor), mit den Inhalts-Stilen der Seite und ohne
// Skript. Das Publikums-Fenster passt den Rahmen als Ganzes ein.

/** Eigene Regeln des Folien-Dokuments im Publikums-Fenster. */
export const PUBLIKUM_REGELN = [
  'html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }',
  'main.praesentation-publikum { margin: 0; padding: 0; }',
  '.praesentation-publikum .presentation-slide-huelle { position: absolute; left: 0; top: 0; ' +
    'box-shadow: none; }',
  `.${UEBERLAUF_KLASSE} { display: none !important; }`,
].join('\n');

// KaTeX samt Schriften, einmal je Fenster gelesen.
let publikumKatex = null;

/**
 * Baut aus einer gezeichneten Folie das eigenständige Dokument des
 * Publikums-Fensters.
 *
 * @param {Element} huelle Hülle der gezeichneten Folie.
 * @param {object} [angaben]
 * @param {string[]} [angaben.basisStile] Vorgabe: die Stile dieses Fensters.
 * @param {() => Promise<string>} [angaben.leseKatexStile]
 * @param {string} [angaben.sprache]
 * @param {(key: string) => string} [angaben.uebersetze]
 * @returns {Promise<{html: string, breite: number, hoehe: number}|null>}
 */
export async function baueFolienDokument(huelle, angaben = {}) {
  const slide = huelle ? huelle.querySelector(`.${SLIDE_KLASSE}`) : null;
  if (!slide) return null;
  const doc = huelle.ownerDocument;
  const { breite, hoehe } = folienGeometrie(slide.dataset.size);
  const behaelter = doc.createElement('div');
  const klon = huelle.cloneNode(true);
  klon.style.width = `${breite}px`;
  klon.style.height = `${hoehe}px`;
  const klonSlide = klon.querySelector(`.${SLIDE_KLASSE}`);
  if (klonSlide) klonSlide.style.transform = '';
  behaelter.appendChild(klon);
  for (const marke of behaelter.querySelectorAll(`.${UEBERLAUF_KLASSE}`)) marke.remove();
  const uebersetze = angaben.uebersetze || t;
  const z = bereiteInhaltVor(behaelter, { uebersetze });
  const stile = angaben.basisStile
    ? [...angaben.basisStile]
    : [variablenBlock(doc, doc.defaultView), sammleInhaltsRegeln(doc, FOLIEN_ANKER), EXPORT_REGELN];
  if (z.formeln) {
    if (publikumKatex === null) {
      publikumKatex = await (angaben.leseKatexStile || leseKatexStileUeberHauptprozess)();
    }
    stile.push(publikumKatex);
  }
  stile.push(PUBLIKUM_REGELN);
  const html = baueHtmlDatei({
    titel: '',
    sprache: angaben.sprache || intlLocale(),
    inhaltHtml: behaelter.innerHTML,
    stile,
    wurzelKlassen: klassenOhneDruck(doc.documentElement),
    hauptKlassen: 'praesentation-publikum',
  });
  return { html, breite, hoehe };
}

registriereFolienDokumentBauer((huelle) => baueFolienDokument(huelle));
