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
//
// 4T-002280 (Epic 3E-000348): **Verkleinerung statt nur Markierung**
// (Option (b) derselben Frage). Läuft der Inhalt über, wird die ganze
// Inhalts-Fläche (der Artikel) über einen Transformations-Faktor verkleinert,
// bis sie passt: Der Artikel wird um 1/Faktor größer gesetzt, sein Innenrand
// ebenso, und als Ganzes um den Faktor skaliert; Kopf, Fuß und Seitenzahl sind
// Geschwister des Artikels und bleiben unverändert. Gemessen wird in
// `pruefeUeberlauf`, das `zeichneFolie` am Ende selbst ruft; damit wirkt die
// Verkleinerung überall, wo eine Folie gezeichnet wird — Ansicht, Vorführung,
// Referenten-Ansicht, Übersicht und beide Exporte (Druck-Fläche über
// `zeichneFolie`, Publikums-Fenster und HTML-Seiten über den Klon der Folie,
// der die Angaben am Element mitnimmt). Die Markierung erscheint nur noch,
// wenn der Inhalt selbst bei der Untergrenze `VERKLEINERUNG_MIN` nicht passt.
// Nachgeladene Bilder und nachgezeichnete Diagramme lösen die Messung über
// `beobachteInhalt` erneut aus, auch auf der Druck-Fläche.
'use strict';

import { t } from '../../i18n.js';
import {
  FOLIEN_RAND,
  folienGeometrie,
  folienSkalierung,
  hintergrundAnordnung,
  hintergrundBilderZiehen,
  verkleinerungsFaktor,
} from '../../../shared/presentation/presentation-darstellung.js';
import { slotVariablen, themeAufloesen } from '../../../shared/presentation/presentation-themes.js';
import { eigeneThemes } from './presentation-themes-stand.js';

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
/**
 * Attribut am Artikel mit dem Faktor der Verkleinerung (4T-002280); ohne
 * Verkleinerung fehlt es. Das Publikums-Fenster horcht auf seine Änderung.
 */
export const VERKLEINERUNG_ATTR = 'data-verkleinerung';
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
 * Traegt die Folie ihre wirksame Gestaltung aus dem Format-Kern (4T-002277:
 * Angaben je Folie), gelten deren Slot-Werte und Farbsatz; sonst das Theme
 * des Kopfs. Die Befunde sind in beiden Faellen die der Kopf-Angabe `theme`;
 * die Befunde der Angaben je Folie fuehrt der Kern selbst.
 *
 * 4T-002281: Die Kopf-Angabe wird mit dem Katalog eigener Themes des Fensters
 * aufgelöst (presentation-themes-stand.js); ein eigenes Theme ist damit kein
 * unbekannter Name mehr.
 *
 * @param {HTMLElement} slide
 * @param {{theme?: unknown, size?: string}} kopf
 * @param {{theme: string, slots: object, syntax: string}|null} [gestaltung]
 * @returns {{name: string, befunde: Array<{code: string, detail: string}>}}
 */
export function setzeGestaltung(slide, kopf, gestaltung = null) {
  const k = kopf || {};
  const kopfTheme = themeAufloesen(k.theme, { eigene: eigeneThemes() });
  const theme =
    gestaltung && gestaltung.slots
      ? {
          name: gestaltung.theme,
          slots: gestaltung.slots,
          syntax: gestaltung.syntax,
          befunde: kopfTheme.befunde,
        }
      : kopfTheme;
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
 * @param {{quelltext?: string, gestaltung?: object}|null} angaben.folie die
 *   Folie des Format-Kerns; ihre `gestaltung` (Theme, Slots, Kopf- und
 *   Fusszeile, Seitenzahl) geht dem Kopf vor.
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
  const eigen = folie && folie.gestaltung ? folie.gestaltung : null;
  const gestaltung = setzeGestaltung(slide, k, eigen);
  const quelle = folie && typeof folie.quelltext === 'string' ? folie.quelltext : '';
  const gezogen = hintergrundBilderZiehen(quelle);
  setzeHintergrund(slide, gezogen.bilder, render);
  const artikel = teil(slide, ARTIKEL_KLASSE);
  artikel.innerHTML = gezogen.quelltext.trim() ? render(gezogen.quelltext) : '';
  // Kopf-, Fusszeile und Seitenzahl je Folie aus der Kette des Kerns
  // (4T-002277), ohne sie aus dem Kopf.
  setzeZeile(teil(slide, KOPF_KLASSE), eigen ? eigen.header : k.header, render);
  setzeZeile(teil(slide, FUSS_KLASSE), eigen ? eigen.footer : k.footer, render);
  const nummer = teil(slide, NUMMER_KLASSE);
  const zeigen = eigen
    ? eigen.seitenzahl === 'zeigen' || eigen.seitenzahl === 'halten'
    : k.paginate === true;
  const seite = eigen ? eigen.seite : (Number(index) || 0) + 1;
  nummer.hidden = !zeigen;
  nummer.textContent = zeigen ? String(seite) : '';
  beschrifteUeberlauf(huelle);
  beobachteInhalt(huelle);
  pruefeUeberlauf(huelle);
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

const laeuftUeber = (artikel) => artikel.scrollHeight > artikel.clientHeight + 1;
const RAND_SEITEN = ['Top', 'Right', 'Bottom', 'Left'];
const VERKLEINERUNG_STILE = ['right', 'bottom', 'width', 'height', 'transform', 'transformOrigin'];

// Der Innenrand des Artikels aus dem Stilblatt, in Folien-Pixeln; ohne
// Messung (etwa ohne Stilblatt) null, dann bleibt er unangetastet.
function leseInnenrand(artikel) {
  const ansicht = artikel.ownerDocument && artikel.ownerDocument.defaultView;
  if (!ansicht || typeof ansicht.getComputedStyle !== 'function') return null;
  const stil = ansicht.getComputedStyle(artikel);
  const werte = RAND_SEITEN.map((seite) => parseFloat(stil[`padding${seite}`]));
  return werte.every((w) => Number.isFinite(w)) ? werte : null;
}

/**
 * Setzt den Faktor der Verkleinerung an den Artikel (4T-002280): größer um
 * 1/Faktor, ebenso der Innenrand, skaliert um den Faktor; 1 nimmt alles zurück.
 *
 * @param {HTMLElement} artikel
 * @param {number} faktor
 * @param {number[]|null} [innenrand] oben, rechts, unten, links bei Faktor 1.
 */
export function setzeVerkleinerung(artikel, faktor, innenrand = null) {
  const stil = artikel.style;
  // Auf vier Stellen gerundet, damit Angabe, Größe und Skalierung übereinstimmen.
  const f = Math.round(Number(faktor) * 10000) / 10000;
  if (!(f < 1)) {
    for (const name of VERKLEINERUNG_STILE) stil[name] = '';
    for (const seite of RAND_SEITEN) stil[`padding${seite}`] = '';
    artikel.removeAttribute(VERKLEINERUNG_ATTR);
    return;
  }
  const prozent = `${(100 / f).toFixed(4)}%`;
  stil.right = 'auto';
  stil.bottom = 'auto';
  stil.width = prozent;
  stil.height = prozent;
  stil.transformOrigin = '0 0';
  stil.transform = `scale(${f})`;
  if (innenrand) {
    RAND_SEITEN.forEach((seite, i) => {
      stil[`padding${seite}`] = `${(innenrand[i] / f).toFixed(2)}px`;
    });
  }
  artikel.setAttribute(VERKLEINERUNG_ATTR, f.toFixed(4));
}

/**
 * Prüft, ob der Inhalt über die Folie hinausläuft; wenn ja, verkleinert sie
 * ihn auf den größten Faktor, bei dem er passt (4T-002280), und setzt die
 * Markierung nur, wenn er selbst bei der Untergrenze nicht passt.
 *
 * @param {HTMLElement} huelle
 * @returns {boolean} läuft der Inhalt nach der Verkleinerung noch über?
 */
export function pruefeUeberlauf(huelle) {
  const slide = huelle ? teil(huelle, SLIDE_KLASSE) : null;
  const artikel = slide ? teil(slide, ARTIKEL_KLASSE) : null;
  if (!artikel) return false;
  setzeVerkleinerung(artikel, 1);
  // Gelesen erst, wenn verkleinert werden muss, und dann nur einmal.
  let innenrand;
  const faktor = verkleinerungsFaktor((f) => {
    if (f < 1 && innenrand === undefined) innenrand = leseInnenrand(artikel);
    setzeVerkleinerung(artikel, f, innenrand || null);
    return !laeuftUeber(artikel);
  });
  setzeVerkleinerung(artikel, faktor, innenrand || null);
  const ueber = laeuftUeber(artikel);
  slide.classList.toggle(UEBERLAUF_ZUSTAND, ueber);
  return ueber;
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
  // 4T-002280: Eine Bühne kann ihren Rand selbst nennen (die Kacheln der
  // Übersicht ohne Rand); die Vorführung hat nie einen.
  const eigen = Number(buehne.dataset.folienRand);
  let rand = buehne.dataset.folienRand !== undefined && eigen >= 0 ? eigen : FOLIEN_RAND;
  if (document.body.classList.contains(VORFUEHRUNG_KLASSE)) rand = 0;
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
 * Ueberlauf-Pruefung. Ohne ResizeObserver (etwa in einer Test-Umgebung)
 * bleibt es bei der Pruefung nach jedem Zeichnen. Nachgeladene Bilder und
 * nachgezeichnete Diagramme beobachtet seit 4T-002280 `beobachteInhalt` an
 * jeder gezeichneten Folie, nicht nur an der Bühne der Fläche.
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
}

// Je Hülle ein Beobachter-Satz des Inhalts.
const inhaltBeobachtet = new WeakSet();

/**
 * Hängt die Beobachter des Inhalts an eine gezeichnete Folie (4T-002280): Ein
 * geladenes Bild oder ein nachgezeichnetes Diagramm ändert die Höhe des
 * Inhalts und damit Überlauf und Verkleinerung. Beobachtet wird nur die
 * Kinder-Liste; die Angaben der Verkleinerung selbst lösen nichts aus.
 *
 * @param {HTMLElement} huelle
 */
export function beobachteInhalt(huelle) {
  if (!huelle || inhaltBeobachtet.has(huelle)) return;
  inhaltBeobachtet.add(huelle);
  const pruefe = () => pruefeUeberlauf(huelle);
  // load blubbert nicht, daher in der Fang-Phase.
  huelle.addEventListener('load', pruefe, true);
  const artikel = huelle.querySelector(`.${ARTIKEL_KLASSE}`);
  if (artikel && typeof MutationObserver === 'function') {
    new MutationObserver(pruefe).observe(artikel, { childList: true, subtree: true });
  }
}
