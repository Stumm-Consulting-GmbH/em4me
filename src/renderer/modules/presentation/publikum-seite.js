// 4T-002278 (Epic 3E-000348): Die Seite des Publikums-Fensters der
// Präsentation (src/renderer/publikum.html), gebündelt über den eigenen
// Einstieg publikum-einstieg.js zu src/renderer/publikum.bundle.js.
//
// **Was die Seite tut:** Sie zeigt die fertig gezeichnete Folie, die das
// Hauptfenster liefert, und meldet Tasten, Mausklick und Mausrad an das
// Hauptfenster zurück; geblättert wird dort. Sie hält keinen Folien-Zustand
// und braucht keine Markdown-Pipeline.
//
// **Wie die Folie erscheint:** als eigenständiges HTML-Dokument in einem
// Rahmen mit `sandbox=""` (keine Skripte, keine Formulare, keine Navigation
// nach außen), der die Inhalts-Regel der Seite erbt. Der Rahmen hat die
// Entwurfsgröße der Folie und wird als Ganzes gleichmäßig in das Fenster
// eingepasst; er nimmt keine Zeiger-Ereignisse an, damit Tastatur-Fokus,
// Klick und Rad bei dieser Seite bleiben und nicht im Rahmen verschwinden.
//
// Ohne Abhängigkeit zu anderen Modulen des Renderers: Die Seite ist bewusst
// schmal, und ihr Bündel enthält nur diese Datei.
'use strict';

/** Klassen der Seite (publikum.html). */
export const BUEHNE_KLASSE = 'publikum-buehne';
export const RAHMEN_KLASSE = 'publikum-folie';

/**
 * Der Faktor, mit dem eine Folie gleichmäßig in die Bühne passt.
 *
 * @param {number} buehneBreite
 * @param {number} buehneHoehe
 * @param {number} breite Entwurfsbreite der Folie.
 * @param {number} hoehe Entwurfshöhe der Folie.
 * @returns {number} 0, wenn nichts zu messen ist.
 */
export function einpassFaktor(buehneBreite, buehneHoehe, breite, hoehe) {
  if (!(breite > 0) || !(hoehe > 0) || !(buehneBreite > 0) || !(buehneHoehe > 0)) return 0;
  return Math.min(buehneBreite / breite, buehneHoehe / hoehe);
}

/**
 * Die Eingabe eines Tastendrucks: Esc beendet die Vorführung, jede andere
 * Taste ohne Strg, Alt und Meta geht an das Hauptfenster, das nach seiner
 * Tasten-Tabelle blättert (presentation-pane.js, `richtungAusTaste`).
 *
 * @param {KeyboardEvent} ereignis
 * @returns {object|null}
 */
export function eingabeAusTaste(ereignis) {
  if (!ereignis || typeof ereignis.key !== 'string') return null;
  if (ereignis.key === 'Escape') return { art: 'beenden' };
  if (ereignis.ctrlKey || ereignis.altKey || ereignis.metaKey) return null;
  return {
    art: 'taste',
    key: ereignis.key,
    shiftKey: !!ereignis.shiftKey,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  };
}

/**
 * Die Eingabe einer Rad-Bewegung; die Sperre gegen mehrere Folien je
 * Rad-Schub hält das Hauptfenster.
 *
 * @param {WheelEvent} ereignis
 * @returns {object|null}
 */
export function eingabeAusRad(ereignis) {
  if (!ereignis) return null;
  const deltaY = Number(ereignis.deltaY) || 0;
  if (deltaY === 0 || ereignis.ctrlKey) return null;
  return { art: 'rad', deltaY, ctrlKey: false };
}

// Tasten, deren Vorgabe-Wirkung der Seite unterbleibt.
const ABGEFANGEN = new Set([
  'Escape',
  'ArrowRight',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

/**
 * Startet die Seite: verdrahtet Brücke und Ereignisse und holt die zuletzt
 * gelieferte Folie.
 *
 * @param {Window} fenster
 * @param {{bereit: Function, onFolie: Function, eingabe: Function}} bruecke
 * @returns {{zeigeFolie: Function, einpassen: Function}|null}
 */
export function starte(fenster, bruecke) {
  const doc = fenster && fenster.document;
  const buehne = doc ? doc.querySelector(`.${BUEHNE_KLASSE}`) : null;
  const rahmen = doc ? doc.querySelector(`.${RAHMEN_KLASSE}`) : null;
  if (!buehne || !rahmen || !bruecke) return null;
  let geometrie = null;

  function einpassen() {
    if (!geometrie) return;
    const { breite, hoehe } = geometrie;
    const s = einpassFaktor(buehne.clientWidth, buehne.clientHeight, breite, hoehe);
    if (!s) return;
    rahmen.style.left = `${(buehne.clientWidth - breite * s) / 2}px`;
    rahmen.style.top = `${(buehne.clientHeight - hoehe * s) / 2}px`;
    rahmen.style.transform = `scale(${s})`;
  }

  function zeigeFolie(folie) {
    if (!folie || typeof folie.html !== 'string') return;
    geometrie = { breite: folie.breite, hoehe: folie.hoehe };
    rahmen.style.width = `${folie.breite}px`;
    rahmen.style.height = `${folie.hoehe}px`;
    rahmen.srcdoc = folie.html;
    rahmen.hidden = false;
    einpassen();
  }

  function melde(eingabe) {
    if (eingabe) Promise.resolve(bruecke.eingabe(eingabe)).catch(() => {});
  }

  fenster.addEventListener(
    'keydown',
    (ereignis) => {
      const eingabe = eingabeAusTaste(ereignis);
      if (!eingabe) return;
      if (ABGEFANGEN.has(ereignis.key)) ereignis.preventDefault();
      melde(eingabe);
    },
    true,
  );
  fenster.addEventListener(
    'wheel',
    (ereignis) => {
      const eingabe = eingabeAusRad(ereignis);
      if (!eingabe) return;
      ereignis.preventDefault();
      melde(eingabe);
    },
    { capture: true, passive: false },
  );
  fenster.addEventListener('click', () => melde({ art: 'klick' }), true);
  fenster.addEventListener('contextmenu', (ereignis) => ereignis.preventDefault(), true);
  fenster.addEventListener('resize', einpassen);

  bruecke.onFolie(zeigeFolie);
  Promise.resolve(bruecke.bereit()).then(
    (folie) => {
      if (folie && !geometrie) zeigeFolie(folie);
    },
    () => {},
  );
  return { zeigeFolie, einpassen };
}
