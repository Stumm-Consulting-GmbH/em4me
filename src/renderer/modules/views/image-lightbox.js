// Vergrößerte Darstellung eines Bildes der gerenderten Ansicht (4T-001870,
// Epic 3E-000322).
//
// Ein einfacher Klick auf ein angezeigtes Bild legt es als Überlagerung über
// das ganze Anwendungsfenster: abgedunkelter Hintergrund, das Bild so groß,
// wie Fenster und eigene Auflösung es zulassen, darunter die Beschriftung und
// zwei Schaltflächen. Aufbau und Bedienung folgen dem Überlagerungs-Muster der
// Lesezeichen-Dialoge (Abdunkelung, die per Klick schließt, Escape, Tastatur
// bleibt im Dialog); die Größen-Regel trägt allein die Gestaltung in
// `styles/dialoge-und-suche.css`, damit das Bild einer Fenster-Änderung ohne
// eigenen Zuhörer folgt.
//
// Die Fläche entsteht beim ersten Öffnen im Skript statt in `index.html`: Das
// Grundgerüst ist über seinem Zeilen-Budget eingefroren, und die Texte werden
// so bei jedem Öffnen in der aktuellen Sprache gesetzt.
//
// Der Weg ins Standardprogramm liegt NICHT hier, sondern kommt als Rückruf vom
// Klick-Pfad (`link-navigation.js`), damit Grenz-Prüfung, Rückfrage und
// Meldungen an der einen Stelle bleiben, an der sie schon immer lagen.
'use strict';

import { t } from '../../i18n.js';

const ROOT_ID = 'image-lightbox';
// Solange die Vergrößerung offen ist, liegt diese Klasse am <body>. Die
// Statusleisten-Meldung eines misslingenden Öffnens hebt sich damit über die
// Abdunkelung (E16 des Epics: Meldung wie bisher, Vergrößerung bleibt offen).
const BODY_OPEN_CLASS = 'image-lightbox-open';

let rootEl = null;
let imageEl = null;
let captionEl = null;
let openExternalBtn = null;
let closeBtn = null;
// Rückruf der aktuell gezeigten Datei; null, wenn das Bild keine eigene Datei
// hat (Daten-Quelle) und die Schaltfläche deshalb fehlt.
let openExternalCallback = null;
// Fokus vor dem Öffnen, damit er beim Schließen dorthin zurückkehrt (AK8).
let previousFocus = null;

// --- Reine Logik -----------------------------------------------------------

/**
 * Zeigt die Ansicht dieses Bild an? Maßgeblich ist der Ladezustand des
 * Elements, nicht seine Quelle (E9 des Epics): Eine fehlende Datei, ein Ziel
 * außerhalb der Wurzel und ein Bild aus dem Netz bleiben ungeladen.
 *
 * @param {HTMLImageElement} img
 * @returns {boolean}
 */
export function isImageDisplayed(img) {
  return !!img && img.complete === true && img.naturalWidth > 0 && img.naturalHeight > 0;
}

/**
 * Die Datei-Quelle, über die das Bild im Standardprogramm geöffnet wird, oder
 * '' bei einem Bild ohne eigene Datei. Gelesen wird das Attribut, das die
 * Einbettung am Bild hinterlegt; in `src` steht nach der Auflösung eine
 * Daten-Adresse.
 *
 * @param {HTMLImageElement} img
 * @returns {string}
 */
export function imageFileSource(img) {
  const quelle = (img && img.getAttribute('data-src-original')) || '';
  if (!quelle || /^(https?:|data:)/i.test(quelle)) return '';
  return quelle;
}

/**
 * Die Datei, gegen die der geschriebene Pfad eines Bildes aufzulösen ist: bei
 * einem Bild in einer eingebetteten Notiz deren Datei, sonst leer (dann gilt
 * das offene Dokument). Der Pfad im Quelltext-Attribut ist relativ zu der
 * Datei geschrieben, in der das Bild steht, und für eine eingebettete Notiz
 * ist das nicht das offene Dokument (4T-001925). Die Einbettung trägt ihre
 * Datei am Körper; bei verschachtelten Einbettungen gilt die innerste.
 *
 * @param {HTMLImageElement} img
 * @returns {string}
 */
export function imageSourceBase(img) {
  const koerper = img && img.closest ? img.closest('.wiki-embed-md-body') : null;
  return (koerper && koerper.getAttribute('data-embed-base')) || '';
}

/**
 * Der Dateiname einer Bild-Quelle: letztes Segment, URL-Kodierung aufgelöst,
 * Anker und Abfrage abgeschnitten.
 *
 * @param {string} quelle
 * @returns {string}
 */
export function fileNameFromSource(quelle) {
  if (!quelle) return '';
  const ohneZusatz = String(quelle).split(/[?#]/)[0];
  const segment = ohneZusatz.split(/[\\/]/).pop() || '';
  try {
    return decodeURI(segment);
  } catch {
    // Literales '%' im Namen: so zeigen, wie er geschrieben ist.
    return segment;
  }
}

/**
 * Beschriftung der Vergrößerung: der Alternativtext, ohne ihn der Dateiname;
 * ein Bild ohne eigene Datei und ohne Alternativtext bleibt ohne Beschriftung
 * (E11 des Epics).
 *
 * @param {HTMLImageElement} img
 * @returns {string}
 */
export function captionFor(img) {
  const alt = ((img && img.getAttribute('alt')) || '').trim();
  if (alt) return alt;
  return fileNameFromSource(imageFileSource(img));
}

// --- Fläche ----------------------------------------------------------------

function buildLightbox() {
  rootEl = document.createElement('div');
  rootEl.id = ROOT_ID;
  rootEl.className = 'image-lightbox';
  rootEl.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'image-lightbox-backdrop';
  backdrop.addEventListener('click', closeImageLightbox);

  const content = document.createElement('div');
  content.className = 'image-lightbox-content';
  content.setAttribute('role', 'dialog');
  content.setAttribute('aria-modal', 'true');

  const stage = document.createElement('div');
  stage.className = 'image-lightbox-stage';
  imageEl = document.createElement('img');
  imageEl.className = 'image-lightbox-image';
  imageEl.alt = '';
  stage.appendChild(imageEl);

  captionEl = document.createElement('div');
  captionEl.className = 'image-lightbox-caption';

  const buttons = document.createElement('div');
  buttons.className = 'image-lightbox-buttons';
  openExternalBtn = document.createElement('button');
  openExternalBtn.type = 'button';
  openExternalBtn.className = 'btn image-lightbox-open-external';
  openExternalBtn.addEventListener('click', () => {
    // E16 des Epics: Die Übergabe lässt die Vergrößerung offen, im Erfolgs-
    // wie im Fehlerfall; die Meldung zeigt der Rückruf in der Statusleiste.
    if (openExternalCallback) void openExternalCallback();
  });
  closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary image-lightbox-close';
  closeBtn.addEventListener('click', closeImageLightbox);
  buttons.append(openExternalBtn, closeBtn);

  content.append(stage, captionEl, buttons);
  rootEl.append(backdrop, content);
  document.body.appendChild(rootEl);
}

function focusableButtons() {
  return [openExternalBtn, closeBtn].filter((b) => b && !b.hidden && !b.disabled);
}

// Tastatur, solange die Vergrößerung offen ist. Am Dokument in der
// Capture-Phase, damit auch ein Tastendruck ohne Fokus in der Fläche (etwa
// nach einem Klick auf das Bild) sie erreicht. Die Weitergabe endet hier: Das
// Dokument darunter nimmt keine Eingaben an (AK3), und weder die
// Escape-Kaskade noch die Kommando-Tasten des Fensters laufen nebenher.
// Die Standard-Handlung bleibt unberührt, damit Enter und Leertaste die
// fokussierte Schaltfläche auslösen.
function onKeydown(e) {
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    closeImageLightbox();
    return;
  }
  if (e.key === 'Tab') {
    // Der Tabulator bleibt in der Fläche (AK12).
    e.preventDefault();
    const liste = focusableButtons();
    if (liste.length === 0) return;
    const idx = liste.indexOf(document.activeElement);
    const next = e.shiftKey
      ? liste[(idx <= 0 ? liste.length : idx) - 1]
      : liste[(idx + 1) % liste.length];
    next.focus();
  }
}

/**
 * Ist die Vergrößerung gerade offen?
 *
 * @returns {boolean}
 */
export function isImageLightboxOpen() {
  return !!rootEl && !rootEl.hidden;
}

/**
 * Öffnet die Vergrößerung für ein angezeigtes Bild. Jede Öffnung setzt Bild,
 * Beschriftung und Schaltfläche neu; von einer vorigen bleibt nichts stehen.
 *
 * @param {HTMLImageElement} img  das angeklickte Bild der Ansicht
 * @param {{ onOpenExternal?: (() => Promise<unknown>) | null }} [opts]
 *   Rückruf ins Standardprogramm; ohne ihn fehlt die Schaltfläche.
 * @returns {boolean} true, wenn die Vergrößerung offen ist
 */
export function openImageLightbox(img, opts = {}) {
  if (!isImageDisplayed(img)) return false;
  if (!rootEl) buildLightbox();
  const wasOpen = isImageLightboxOpen();

  imageEl.src = img.currentSrc || img.src;
  const caption = captionFor(img);
  captionEl.textContent = caption;
  captionEl.hidden = caption === '';

  openExternalCallback = typeof opts.onOpenExternal === 'function' ? opts.onOpenExternal : null;
  openExternalBtn.hidden = openExternalCallback === null;
  openExternalBtn.textContent = t('attachments.imageView.openExternal');
  closeBtn.textContent = t('attachments.imageView.close');
  rootEl
    .querySelector('.image-lightbox-content')
    .setAttribute('aria-label', t('attachments.imageView.label'));

  if (!wasOpen) {
    previousFocus = document.activeElement;
    document.addEventListener('keydown', onKeydown, true);
    document.body.classList.add(BODY_OPEN_CLASS);
  }
  rootEl.hidden = false;
  closeBtn.focus({ preventScroll: true });
  return true;
}

/**
 * Schließt die Vergrößerung; der Fokus kehrt dorthin zurück, wo er vor dem
 * Öffnen war. Ohne offene Vergrößerung ohne Wirkung.
 */
export function closeImageLightbox() {
  if (!isImageLightboxOpen()) return;
  rootEl.hidden = true;
  document.removeEventListener('keydown', onKeydown, true);
  document.body.classList.remove(BODY_OPEN_CLASS);
  imageEl.removeAttribute('src');
  openExternalCallback = null;
  const ziel = previousFocus;
  previousFocus = null;
  if (ziel && ziel.isConnected && typeof ziel.focus === 'function') {
    ziel.focus({ preventScroll: true });
  }
}
