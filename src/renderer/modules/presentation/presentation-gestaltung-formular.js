// 4T-002282 (Epic 3E-000348): Das gemeinsame Formular der sieben Folien-Slots
// (Lösungsansatz (a), Entscheidung des Product Owners vom 2026-10-14, Frage C2,
// Option (a): ein Formular-Modul für beide Oberflächen).
//
// Zwei Rahmen bedienen es:
//
// - `entwurf`: der Theme-Editor der Einstellungen (Abschnitt «Folien-Themes»,
//   settings/presentation-themes-settings.js). Jede Zeile zeigt den geltenden
//   Wert; eine Eingabe macht ihn zur Abweichung von der Basis, «Zurücksetzen»
//   nimmt die Abweichung zurück. Gespeichert wird mit Anwenden/OK der Seite.
// - `dialog`: der Dialog «Gestaltung dieser Präsentation…»
//   (presentation-gestaltung-dialog.js). Jede Zeile trägt zusätzlich die Wahl
//   «wie Theme (…)» oder «eigener Wert»; die Klammer nennt den Wert des
//   gewählten Themes, die Wahl selbst ist die Herkunfts-Anzeige (Muster
//   «wie Vorgabe» des Tafel-Dialogs). Eine Eingabe stellt die Wahl auf
//   «eigener Wert», «Zurücksetzen» auf «wie Theme».
//
// Farb-Slots bekommen einen Farbwähler und daneben das Textfeld für jeden
// gültigen CSS-Wert; `font` ein Textfeld mit Vorschlägen (Ausführungs-
// Entscheidung der Sitzung vom 2026-10-14). Jeder Wert läuft durch
// `slotWertPruefen`; ein ungültiger wird markiert und nicht übernommen.
//
// Kein Speicher, kein Fenster-Zustand: Das Modul baut Elemente und meldet
// Änderungen über einen Rückruf. Die Übersetzung kommt herein.
'use strict';

import { FOLIEN_SLOTS, slotWertPruefen } from '../../../shared/presentation/presentation-themes.js';

/** Die Slots mit Farbwähler; `font` ist der einzige ohne. */
export const FARB_SLOTS = Object.freeze(FOLIEN_SLOTS.filter((slot) => slot !== 'font'));

/** Vorschläge des Schrift-Felds: verbreitete Schrift-Stapel. */
export const SCHRIFT_VORSCHLAEGE = Object.freeze([
  "'Segoe UI', 'Helvetica Neue', 'DejaVu Sans', system-ui, sans-serif",
  'Arial, Helvetica, sans-serif',
  "Calibri, Carlito, 'Segoe UI', sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Times New Roman', Times, serif",
  "Verdana, 'DejaVu Sans', sans-serif",
  "Consolas, 'Courier New', monospace",
]);

const WIE_THEME = 'theme';
const EIGEN = 'eigen';
const UNGUELTIG_KLASSE = 'folien-gestaltung-ungueltig';

/**
 * Ein Wert als Farbe des Farbwählers (`#rrggbb`), oder null, wenn er sich
 * dort nicht zeigen lässt (Farbname, `rgb()`, Verlauf).
 *
 * @param {unknown} wert
 * @returns {string|null}
 */
export function alsFarbwaehlerWert(wert) {
  if (typeof wert !== 'string') return null;
  const s = wert.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const kurz = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  return kurz ? `#${kurz[1]}${kurz[1]}${kurz[2]}${kurz[2]}${kurz[3]}${kurz[3]}` : null;
}

function element(tag, klasse, text) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Baut das Formular.
 *
 * @param {object} angaben
 * @param {(key: string) => string} angaben.t Übersetzung.
 * @param {'entwurf'|'dialog'} angaben.rahmen
 * @param {Object<string,string>} angaben.grund die Slot-Werte des Themes, auf
 *   dem aufgebaut wird (vollständiger Satz).
 * @param {Object<string,string>} [angaben.eigene] die eigenen Werte zu Beginn
 *   (Abweichungen bzw. eigene Werte im Kopf).
 * @param {string} [angaben.idPraefix] Präfix der Element-Kennungen.
 * @param {boolean} [angaben.nurLesen] ohne Eingabe (mitgeliefertes Theme).
 * @param {(eigene: Object<string,string>) => void} [angaben.beiAenderung]
 * @returns {{element: HTMLElement, eigeneWerte: () => Object<string,string>,
 *   ungueltige: () => string[], setzeGrund: (grund: object) => void,
 *   setzeEigene: (eigene: object) => void, wirksam: () => Object<string,string>}}
 */
export function baueGestaltungsFormular(angaben) {
  const t = typeof angaben.t === 'function' ? angaben.t : (key) => key;
  const rahmen = angaben.rahmen === 'dialog' ? 'dialog' : 'entwurf';
  const praefix = angaben.idPraefix || `folien-gestaltung-${rahmen}`;
  const nurLesen = angaben.nurLesen === true;
  const melde = typeof angaben.beiAenderung === 'function' ? angaben.beiAenderung : () => {};
  let grund = { ...(angaben.grund || {}) };

  // Je Slot: eigener Wert ja/nein und der zuletzt eingegebene Text.
  const zustand = {};
  for (const slot of FOLIEN_SLOTS) {
    const start = angaben.eigene && slotWertPruefen(angaben.eigene[slot]);
    zustand[slot] = { eigen: !!start, text: start || '' };
  }

  const wurzel = element('div', `folien-gestaltung folien-gestaltung--${rahmen}`);
  const zeilen = {};

  const schriftListe = element('datalist');
  schriftListe.id = `${praefix}-schriften`;
  for (const vorschlag of SCHRIFT_VORSCHLAEGE) {
    const option = document.createElement('option');
    option.value = vorschlag;
    schriftListe.appendChild(option);
  }
  wurzel.appendChild(schriftListe);

  const gezeigt = (slot) => (zustand[slot].eigen ? zustand[slot].text : grund[slot] || '');

  function zeichneZeile(slot) {
    const z = zeilen[slot];
    const wert = gezeigt(slot);
    if (document.activeElement !== z.text) z.text.value = wert;
    if (z.farbe) z.farbe.value = alsFarbwaehlerWert(wert) || '#000000';
    const ungueltig = zustand[slot].eigen && slotWertPruefen(zustand[slot].text) === null;
    z.zeile.classList.toggle(UNGUELTIG_KLASSE, ungueltig);
    z.text.setAttribute('aria-invalid', ungueltig ? 'true' : 'false');
    z.zeile.dataset.zustand = zustand[slot].eigen ? EIGEN : WIE_THEME;
    if (z.wahl) {
      z.wahl.value = zustand[slot].eigen ? EIGEN : WIE_THEME;
      z.wahl.options[0].textContent = t('presentation.gestaltung.wieTheme').replace(
        '{wert}',
        grund[slot] || '',
      );
    }
    if (z.zuruecksetzen) z.zuruecksetzen.disabled = !zustand[slot].eigen;
  }

  function setzeEigen(slot, text) {
    zustand[slot] = { eigen: true, text };
    zeichneZeile(slot);
    melde(eigeneWerte());
  }

  function zuruecksetzen(slot) {
    zustand[slot] = { eigen: false, text: '' };
    zeichneZeile(slot);
    melde(eigeneWerte());
  }

  for (const slot of FOLIEN_SLOTS) {
    const id = `${praefix}-${slot}`;
    const zeile = element('div', 'settings-row folien-gestaltung-zeile');
    zeile.dataset.slot = slot;
    const label = element('label', null, t(`presentation.slot.${slot}`));
    label.htmlFor = id;
    zeile.appendChild(label);
    const eintrag = { zeile };

    if (rahmen === 'dialog') {
      const wahl = document.createElement('select');
      wahl.className = 'folien-gestaltung-wahl';
      wahl.dataset.teil = 'wahl';
      wahl.setAttribute('aria-label', t(`presentation.slot.${slot}`));
      for (const [wert, text] of [
        [WIE_THEME, ''],
        [EIGEN, t('presentation.gestaltung.eigenerWert')],
      ]) {
        const option = document.createElement('option');
        option.value = wert;
        option.textContent = text;
        wahl.appendChild(option);
      }
      wahl.disabled = nurLesen;
      wahl.addEventListener('change', () => {
        if (wahl.value === WIE_THEME) zuruecksetzen(slot);
        else setzeEigen(slot, zustand[slot].text || grund[slot] || '');
      });
      eintrag.wahl = wahl;
      zeile.appendChild(wahl);
    }

    if (FARB_SLOTS.includes(slot)) {
      const farbe = document.createElement('input');
      farbe.type = 'color';
      farbe.className = 'folien-gestaltung-farbe';
      farbe.dataset.teil = 'farbe';
      farbe.setAttribute('aria-label', t(`presentation.slot.${slot}`));
      farbe.disabled = nurLesen;
      farbe.addEventListener('input', () => setzeEigen(slot, farbe.value));
      eintrag.farbe = farbe;
      zeile.appendChild(farbe);
    }

    const text = document.createElement('input');
    text.type = 'text';
    text.id = id;
    text.className = 'settings-input folien-gestaltung-text';
    text.dataset.teil = 'text';
    text.spellcheck = false;
    text.readOnly = nurLesen;
    if (slot === 'font') text.setAttribute('list', schriftListe.id);
    text.addEventListener('input', () => setzeEigen(slot, text.value));
    text.addEventListener('change', () => zeichneZeile(slot));
    eintrag.text = text;
    zeile.appendChild(text);

    if (!nurLesen) {
      const knopf = element('button', 'btn folien-gestaltung-zuruecksetzen', '↺');
      knopf.type = 'button';
      knopf.dataset.aktion = 'zuruecksetzen';
      knopf.title = t('presentation.gestaltung.zuruecksetzen');
      knopf.setAttribute('aria-label', t('presentation.gestaltung.zuruecksetzen'));
      knopf.addEventListener('click', () => zuruecksetzen(slot));
      eintrag.zuruecksetzen = knopf;
      zeile.appendChild(knopf);
    }

    zeilen[slot] = eintrag;
    wurzel.appendChild(zeile);
    zeichneZeile(slot);
  }

  /** Die gültigen eigenen Werte, in Slot-Reihenfolge. */
  function eigeneWerte() {
    const aus = {};
    for (const slot of FOLIEN_SLOTS) {
      if (!zustand[slot].eigen) continue;
      const wert = slotWertPruefen(zustand[slot].text);
      if (wert !== null) aus[slot] = wert;
    }
    return aus;
  }

  return {
    element: wurzel,
    eigeneWerte,
    /** Slots mit eigenem, aber ungültigem Wert. */
    ungueltige: () =>
      FOLIEN_SLOTS.filter((s) => zustand[s].eigen && slotWertPruefen(zustand[s].text) === null),
    /** Der vollständige Satz: Grund, darüber die gültigen eigenen Werte. */
    wirksam: () => ({ ...grund, ...eigeneWerte() }),
    /** Ein anderes Theme als Grund; die eigenen Werte bleiben. */
    setzeGrund(neu) {
      grund = { ...(neu || {}) };
      for (const slot of FOLIEN_SLOTS) zeichneZeile(slot);
    },
    /** Alle eigenen Werte ersetzen (etwa nach einem Theme-Wechsel im Editor). */
    setzeEigene(neu) {
      for (const slot of FOLIEN_SLOTS) {
        const wert = neu && slotWertPruefen(neu[slot]);
        zustand[slot] = { eigen: !!wert, text: wert || '' };
        zeichneZeile(slot);
      }
    },
  };
}
