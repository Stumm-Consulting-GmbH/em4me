// 4T-002161 (Epic 3E-000149): Die Folie der Praesentations-Ansicht - feste
// Geometrie mit gleichmaessiger Skalierung, Gestaltung ueber die Folien-Slots
// des Themes, Hintergrund-Bilder und Zweiteilung nach Marp, Seitenzahl, Kopf-
// und Fusszeile und die Markierung eines Ueberlaufs.
//
// Die Flaeche (presentation-pane.js) baut die Folie einmal mit `baueFolie`,
// zeichnet sie je Aenderung mit `zeichneFolie` und passt sie bei jeder
// Groessen-Aenderung ihrer Buehne mit `passeFolieEin` ein. Die Regeln ohne DOM
// (Geometrie, Skalierungs-Formel, `bg`-Grammatik) stehen im prozessneutralen
// Modul src/shared/presentation/presentation-darstellung.js, die Themes in
// presentation-themes.js; hier steht nur ihre Anwendung auf das DOM.
//
// **Bilder nur ueber den Bild-Aufloeser** (Sicherheits-Pflicht aus 3E-000344):
// Ein Hintergrund-Bild wird in seinem Wortlaut (`![bg ...](pfad)`) durch die
// Render-Pipeline gereicht, die der Aufrufer hereinreicht (im Fenster
// `api.renderMarkdown`, die relative Pfade ueber den Bild-Aufloeser der
// Preload-Seite zu `data:`-Adressen macht und alles ausserhalb der Grenze
// ohne Quelle laesst). Verwendet wird das so erzeugte `<img>`-Element selbst,
// eingepasst ueber Klassen; es gibt keinen Weg ueber ein Stil-Attribut mit
// einer Bild-Adresse. Ein Bild ohne Quelle (fehlende Datei, ausserhalb der
// Grenze) entfaellt, die Folie erscheint ohne es.
//
// **Ueberlauf** (Entscheidung 4a, Option (a)): Der Inhalt wird an der Folie
// abgeschnitten; laeuft er ueber (scrollHeight > clientHeight), traegt die
// Folie die Klasse `presentation-slide--ueberlauf`, und die Markierung am
// unteren Rand wird sichtbar. In der Vorfuehrung (Klasse
// `presentation-vorfuehrung` am body, gesetzt von 4T-002162) blendet das
// Stilblatt sie aus.
'use strict';

import { t } from '../../i18n.js';
import {
  FOLIEN_RAND,
  folienGeometrie,
  folienSkalierung,
  hintergrundAnordnung,
  hintergrundBilderZiehen,
} from '../../../shared/presentation/presentation-darstellung.js';
import { slotVariablen, themeAufloesen } from '../../../shared/presentation/presentation-themes.js';

/** Klassen der Folie; Groessen und Farben stehen im Stilblatt presentation.css. */
export const HUELLE_KLASSE = 'presentation-slide-huelle';
export const SLIDE_KLASSE = 'presentation-slide';
export const BG_KLASSE = 'presentation-slide-bg';
export const INHALT_BEREICH_KLASSE = 'presentation-slide-inhalt';
export const ARTIKEL_KLASSE = 'praesentation-folie';
export const KOPF_KLASSE = 'presentation-slide-kopf';
export const FUSS_KLASSE = 'presentation-slide-fuss';
export const NUMMER_KLASSE = 'presentation-slide-nummer';
export const UEBERLAUF_KLASSE = 'presentation-slide-ueberlauf';
export const UEBERLAUF_ZUSTAND = 'presentation-slide--ueberlauf';
/** Praefix der Klasse fuer den Farbsatz der Code-Bloecke (`...light`, `...dark`). */
export const SYNTAX_KLASSE = 'presentation-slide--syntax-';
const SYNTAX_SAETZE = ['light', 'dark'];
/** Klasse am body waehrend der Vorfuehrung (4T-002162). */
export const VORFUEHRUNG_KLASSE = 'presentation-vorfuehrung';

const teil = (wurzel, klasse) => wurzel.querySelector(`.${klasse}`);

function element(tag, klasse) {
  const el = document.createElement(tag);
  el.className = klasse;
  return el;
}

/**
 * Baut das Geruest einer Folie: Huelle (skalierte Groesse) und darin die Folie
 * in Entwurfsgroesse mit Hintergrund-Ebene, Inhalts-Bereich (Kopf, Inhalt,
 * Fuss, Nummer) und Ueberlauf-Markierung.
 *
 * @returns {HTMLElement} die Huelle.
 */
export function baueFolie() {
  const huelle = element('div', HUELLE_KLASSE);
  const slide = element('section', SLIDE_KLASSE);
  const bg = element('div', BG_KLASSE);
  bg.setAttribute('aria-hidden', 'true');
  const inhalt = element('div', INHALT_BEREICH_KLASSE);
  const kopf = element('div', KOPF_KLASSE);
  const artikel = element('article', `markdown-body ${ARTIKEL_KLASSE}`);
  const fuss = element('div', FUSS_KLASSE);
  const nummer = element('div', NUMMER_KLASSE);
  kopf.hidden = true;
  fuss.hidden = true;
  nummer.hidden = true;
  inhalt.append(kopf, artikel, fuss, nummer);
  const ueberlauf = element('div', UEBERLAUF_KLASSE);
  ueberlauf.setAttribute('role', 'img');
  slide.append(bg, inhalt, ueberlauf);
  huelle.append(slide);
  return huelle;
}

/**
 * Setzt Theme und Geometrie an die Folie.
 *
 * @param {HTMLElement} slide
 * @param {{theme?: unknown, size?: string}} kopf
 * @returns {{name: string, befunde: Array<{code: string, detail: string}>}}
 */
export function setzeGestaltung(slide, kopf) {
  const k = kopf || {};
  const theme = themeAufloesen(k.theme);
  for (const [name, wert] of Object.entries(slotVariablen(theme.slots))) {
    slide.style.setProperty(name, wert);
  }
  // data-theme an der Folie meint ihre Helligkeit (light/dark), nicht den
  // Theme-Namen: Die Regeln der Anwendung, die an data-theme haengen (Callouts,
  // Abzeichen, Kritik-Markierungen), folgen so der Folie (Entscheidung der
  // Steuerung vom 2026-10-10).
  slide.dataset.theme = theme.syntax;
  // Befund der Abnahme vom 2026-10-10: Der Farbsatz der Code-Bloecke folgt dem
  // Theme, nicht dem Farbschema der Anwendung (Regeln in presentation.css).
  for (const satz of SYNTAX_SAETZE) {
    slide.classList.toggle(`${SYNTAX_KLASSE}${satz}`, satz === theme.syntax);
  }
  const geometrie = folienGeometrie(k.size);
  slide.dataset.size = geometrie.format;
  slide.style.width = `${geometrie.breite}px`;
  slide.style.height = `${geometrie.hoehe}px`;
  return { name: theme.name, befunde: theme.befunde };
}

// Ein Schnipsel ueber die Pipeline; ein Fehler darin laesst ihn leer, die
// Folie erscheint ohne ihn.
function sicherGerendert(render, markdown) {
  try {
    const html = render(markdown);
    return typeof html === 'string' ? html : '';
  } catch {
    return '';
  }
}

// Das erste <img> eines gerenderten Schnipsels, sofern es eine Quelle hat.
function bildAus(html) {
  const vorlage = document.createElement('template');
  vorlage.innerHTML = html;
  const img = vorlage.content.querySelector('img');
  if (!img || !img.getAttribute('src')) return null;
  return img;
}

function setzeHintergrund(slide, bilder, render) {
  const bg = teil(slide, BG_KLASSE);
  const bereich = teil(slide, INHALT_BEREICH_KLASSE);
  const anordnung = hintergrundAnordnung(bilder);
  bg.replaceChildren();
  slide.classList.remove('presentation-slide--geteilt-left', 'presentation-slide--geteilt-right');
  bg.classList.toggle('is-vertikal', anordnung.vertikal);
  bg.style.width = '';
  bereich.style.left = '';
  bereich.style.right = '';
  if (anordnung.seite) {
    slide.classList.add(`presentation-slide--geteilt-${anordnung.seite}`);
    bg.style.width = anordnung.breite;
    bereich.style[anordnung.seite] = anordnung.breite;
  }
  for (const bild of bilder) {
    const img = bildAus(sicherGerendert(render, bild.markdown));
    if (!img) continue;
    const groesse = bild.angabe ? bild.angabe.groesse : 'cover';
    const prozent = /%$/.test(groesse);
    img.className = `presentation-bg-bild presentation-bg-bild--${prozent ? 'prozent' : groesse}`;
    img.dataset.bgGroesse = groesse;
    img.removeAttribute('width');
    img.removeAttribute('height');
    if (prozent) img.style.width = groesse;
    const zelle = element('div', 'presentation-bg-zelle');
    zelle.append(img);
    bg.append(zelle);
  }
  slide.classList.toggle('presentation-slide--hintergrund', bg.childElementCount > 0);
}

// Inline-Markdown einer Kopf- oder Fusszeile: gerendert ueber die Pipeline,
// genommen wird der Inhalt des ersten Absatzes (wie Marp, das sie inline
// rendert). Ergibt der Text keinen Absatz (etwa `# Titel`), steht er als Text.
function setzeZeile(el, text, render) {
  const roh = typeof text === 'string' ? text.trim() : '';
  if (!roh) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  const vorlage = document.createElement('template');
  vorlage.innerHTML = sicherGerendert(render, roh);
  const absatz = vorlage.content.querySelector('p');
  if (absatz) el.replaceChildren(...absatz.childNodes);
  else el.textContent = roh;
}

/**
 * Zeichnet eine Folie in ihr Geruest.
 *
 * @param {HTMLElement} huelle Ergebnis von baueFolie.
 * @param {object} angaben
 * @param {{quelltext?: string}|null} angaben.folie die Folie des Format-Kerns.
 * @param {number} angaben.index Null-basiert; die Seitenzahl ist index + 1.
 * @param {object} [angaben.kopf] Kopf des Format-Kerns (`theme`, `paginate`,
 *   `header`, `footer`, `size`).
 * @param {(markdown: string) => string} angaben.render Die Render-Pipeline
 *   samt Bild-Aufloeser, gebunden an den Pfad des Dokuments.
 * @returns {{name: string, befunde: Array<{code: string, detail: string}>}}
 *   das gezeigte Theme und seine Befunde.
 */
export function zeichneFolie(huelle, { folie, index, kopf, render }) {
  const slide = teil(huelle, SLIDE_KLASSE);
  const k = kopf || {};
  const gestaltung = setzeGestaltung(slide, k);
  const quelle = folie && typeof folie.quelltext === 'string' ? folie.quelltext : '';
  const gezogen = hintergrundBilderZiehen(quelle);
  setzeHintergrund(slide, gezogen.bilder, render);
  const artikel = teil(slide, ARTIKEL_KLASSE);
  artikel.innerHTML = gezogen.quelltext.trim() ? render(gezogen.quelltext) : '';
  setzeZeile(teil(slide, KOPF_KLASSE), k.header, render);
  setzeZeile(teil(slide, FUSS_KLASSE), k.footer, render);
  const nummer = teil(slide, NUMMER_KLASSE);
  nummer.hidden = k.paginate !== true;
  nummer.textContent = k.paginate === true ? String((Number(index) || 0) + 1) : '';
  beschrifteUeberlauf(huelle);
  return gestaltung;
}

/** Setzt den Titel der Ueberlauf-Markierung (auch beim Sprachwechsel). */
export function beschrifteUeberlauf(huelle) {
  const marke = huelle ? teil(huelle, UEBERLAUF_KLASSE) : null;
  if (!marke) return;
  const text = t('presentation.ueberlauf');
  marke.title = text;
  marke.setAttribute('aria-label', text);
}

/**
 * Prueft, ob der Inhalt ueber die Folie hinauslaeuft, und setzt den Zustand.
 *
 * @param {HTMLElement} huelle
 * @returns {boolean}
 */
export function pruefeUeberlauf(huelle) {
  const slide = huelle ? teil(huelle, SLIDE_KLASSE) : null;
  const artikel = slide ? teil(slide, ARTIKEL_KLASSE) : null;
  if (!artikel) return false;
  const laeuftUeber = artikel.scrollHeight > artikel.clientHeight + 1;
  slide.classList.toggle(UEBERLAUF_ZUSTAND, laeuftUeber);
  return laeuftUeber;
}

/**
 * Passt die Folie gleichmaessig in ihre Buehne ein (zentriert, Rand ringsum).
 * In der Vorfuehrung (4T-002162) ohne Rand: Die Folie fuellt den Bildschirm
 * in einer Richtung ganz, der Rest bleibt schwarz.
 *
 * @param {HTMLElement} buehne Element mit der verfuegbaren Flaeche.
 * @returns {number|null} die gesetzte Skala oder null ohne Messung.
 */
export function passeFolieEin(buehne) {
  const huelle = buehne ? teil(buehne, HUELLE_KLASSE) : null;
  const slide = huelle ? teil(huelle, SLIDE_KLASSE) : null;
  if (!slide) return null;
  const breite = buehne.clientWidth;
  const hoehe = buehne.clientHeight;
  // Eine verborgene Buehne misst 0; dann bleibt die letzte Einpassung.
  if (!breite && !hoehe) return null;
  const geometrie = folienGeometrie(slide.dataset.size);
  const rand = document.body.classList.contains(VORFUEHRUNG_KLASSE) ? 0 : FOLIEN_RAND;
  const { skala, breite: b, hoehe: h } = folienSkalierung(breite, hoehe, geometrie, rand);
  huelle.style.width = `${b}px`;
  huelle.style.height = `${h}px`;
  slide.style.transform = `scale(${skala})`;
  return skala;
}

// Je Buehne ein Beobachter-Satz.
const beobachtet = new WeakSet();

/**
 * Haengt die Beobachter an eine Buehne: Groessen-Aenderung -> Einpassung und
 * Ueberlauf-Pruefung; nachgeladene Bilder und nachgezeichnete Diagramme im
 * Inhalt -> Ueberlauf-Pruefung. Ohne ResizeObserver/MutationObserver (etwa in
 * einer Test-Umgebung) bleibt es bei der Pruefung nach jedem Zeichnen.
 *
 * @param {HTMLElement} buehne
 */
export function beobachteBuehne(buehne) {
  if (!buehne || beobachtet.has(buehne)) return;
  beobachtet.add(buehne);
  const huelle = () => teil(buehne, HUELLE_KLASSE);
  const pruefe = () => {
    const h = huelle();
    if (h) pruefeUeberlauf(h);
  };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      passeFolieEin(buehne);
      pruefe();
    }).observe(buehne);
  }
  // Ein geladenes Bild aendert die Hoehe des Inhalts (load blubbert nicht,
  // daher in der Fang-Phase).
  buehne.addEventListener('load', pruefe, true);
  const artikel = buehne.querySelector(`.${ARTIKEL_KLASSE}`);
  if (artikel && typeof MutationObserver === 'function') {
    new MutationObserver(pruefe).observe(artikel, { childList: true, subtree: true });
  }
}
