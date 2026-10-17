// 4T-002282 (Epic 3E-000348): Der Dialog «Gestaltung dieser Präsentation…»
// (Lösungsansatz (c) bis (e), Story 4S-001080).
//
// **Was er zeigt:** über dem gewählten Theme die sieben Slot-Zeilen des
// gemeinsamen Formulars (presentation-gestaltung-formular.js, Rahmen
// `dialog`), jede «wie Theme (…)» oder mit eigenem Wert, und die Theme-Wahl
// aus mitgelieferten und eigenen Themes. Ein unbekannter Name aus dem Kopf
// bleibt als eigene Option wählbar, damit «OK» ihn nicht stillschweigend
// ersetzt.
//
// **Was er zurückgibt** (Muster «Einstellungen dieser Tafel…»): eine Handlung
// samt Theme-Wahl und eigenen Werten, oder null bei Abbruch. Geschrieben wird
// nicht im Modal, sondern in `oeffneGestaltungsDialog`:
//
// - «OK»: der `theme`-Block mit `name:` und den eigenen Werten, ohne eigene
//   Werte `theme: <Name>` (Lösungsansatz (c)).
// - «Als Theme speichern…»: fragt einen Namen ab (Namens-Regel aus
//   presentation-eigene-themes.js), legt aus Basis und eigenen Werten ein
//   eigenes Theme an und schreibt `theme: <Name>` (d).
// - «Theme-Werte in die Datei übernehmen»: nur bei einem eigenen Theme; schreibt
//   dessen vollständige Slot-Werte als Block mit `name:` seiner Basis, damit die
//   Datei ohne das Theme gleich aussieht (e, Entscheidung C1, Option (a)).
//
// **Ein Rückgängig-Schritt:** Jede Handlung schreibt genau eine Ersetzung als
// eine Transaktion in den Editor der Spalte, und zwar gegen den Stand, auf dem
// der Dialog geöffnet wurde; hat sich das Dokument inzwischen geändert, wird
// verworfen und gesagt. Die Fenster-Teile (Editor, Speicher, Namens-Dialog)
// kommen als Zugang herein, weil dieser Ordner sie nicht importiert.
'use strict';

import { THEME_NAMEN, themeAufloesen } from '../../../shared/presentation/presentation-themes.js';
import {
  NAMENS_BEFUNDE,
  normalisiereThemesZustand,
  themeAbweichungen,
  themeNamePruefen,
  themeNameVergleich,
} from '../../../shared/presentation/presentation-eigene-themes.js';
import { baueGestaltungsFormular } from './presentation-gestaltung-formular.js';
import {
  kopfUnveraendert,
  leseKopfGestaltung,
  schreibeThemeInKopf,
  textAenderung,
  themeKopfWert,
} from './presentation-gestaltung-kopf.js';

/** Die i18n-Schlüssel der Namens-Befunde (Einstellungen und Dialog). */
export const NAMENS_TEXTE = Object.freeze({
  [NAMENS_BEFUNDE.leer]: 'presentation.themes.nameLeer',
  [NAMENS_BEFUNDE.mitgeliefert]: 'presentation.themes.nameMitgeliefert',
  [NAMENS_BEFUNDE.vergeben]: 'presentation.themes.nameVergeben',
});

function element(tag, klasse, text) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (text != null) el.textContent = text;
  return el;
}

function eigenesTheme(katalog, name) {
  const vergleich = themeNameVergleich(name);
  return (katalog || []).find((e) => e && themeNameVergleich(e.name) === vergleich) || null;
}

/**
 * Zeigt das Modal.
 *
 * @param {object} ctx
 * @param {Function} ctx.t Übersetzung.
 * @param {string} ctx.themeName das Theme im Kopf.
 * @param {Object<string,string>} ctx.eigene die eigenen Werte im Kopf.
 * @param {Array<object>} ctx.katalog die eigenen Themes.
 * @returns {Promise<{aktion: 'ok'|'alsTheme'|'werteUebernehmen',
 *   themeName: string, eigene: Object<string,string>}|null>}
 */
export function zeigeGestaltungsDialog(ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;
  const katalog = Array.isArray(ctx.katalog) ? ctx.katalog : [];
  const grundVon = (name) => themeAufloesen(name, { eigene: katalog }).slots;

  const modal = element('div', 'bookmark-modal folien-gestaltung-modal');
  const hintergrund = element('div', 'bookmark-modal-backdrop');
  const inhalt = element('div', 'bookmark-modal-content folien-gestaltung-inhalt');
  inhalt.setAttribute('role', 'dialog');
  inhalt.setAttribute('aria-modal', 'true');
  inhalt.setAttribute('aria-labelledby', 'folien-gestaltung-titel');
  const titel = element('h2', null, t('presentation.gestaltung.titel'));
  titel.id = 'folien-gestaltung-titel';
  inhalt.append(titel, element('p', 'settings-hint', t('presentation.gestaltung.hinweis')));

  // Theme-Wahl: mitgelieferte, dann eigene; ein unbekannter Name aus dem Kopf
  // bleibt als eigene Option stehen.
  const wahl = document.createElement('select');
  wahl.id = 'folien-gestaltung-theme';
  wahl.dataset.teil = 'theme';
  const namen = [...THEME_NAMEN, ...katalog.map((e) => e.name)];
  const bekannt = namen.some((n) => themeNameVergleich(n) === themeNameVergleich(ctx.themeName));
  for (const name of namen) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    wahl.appendChild(option);
  }
  if (!bekannt) {
    const option = document.createElement('option');
    option.value = ctx.themeName;
    option.textContent = t('presentation.gestaltung.unbekannt').replace('{name}', ctx.themeName);
    wahl.appendChild(option);
  }
  wahl.value =
    namen.find((n) => themeNameVergleich(n) === themeNameVergleich(ctx.themeName)) || ctx.themeName;
  const themeZeile = element('div', 'settings-row folien-gestaltung-themezeile');
  const themeLabel = element('label', null, t('presentation.gestaltung.theme'));
  themeLabel.htmlFor = wahl.id;
  themeZeile.append(themeLabel, wahl);
  inhalt.appendChild(themeZeile);

  const formular = baueGestaltungsFormular({
    t,
    rahmen: 'dialog',
    grund: grundVon(wahl.value),
    eigene: ctx.eigene || {},
    idPraefix: 'folien-gestaltung-dialog',
  });
  inhalt.appendChild(formular.element);

  const knoepfe = element('div', 'bookmark-modal-buttons');
  const knopf = (aktion, text, klasse = 'btn') => {
    const el = element('button', klasse, text);
    el.type = 'button';
    el.dataset.aktion = aktion;
    return el;
  };
  const alsTheme = knopf('alsTheme', t('presentation.gestaltung.alsTheme'));
  const uebernehmen = knopf('werteUebernehmen', t('presentation.gestaltung.werteUebernehmen'));
  const abbrechen = knopf('abbrechen', t('dialog.cancel'));
  const ok = knopf('ok', t('dialog.ok'), 'btn btn-primary');
  knoepfe.append(alsTheme, uebernehmen, abbrechen, ok);
  inhalt.appendChild(knoepfe);
  modal.append(hintergrund, inhalt);

  const nachWahl = () => {
    formular.setzeGrund(grundVon(wahl.value));
    // «Theme-Werte übernehmen» gilt nur für ein eigenes Theme.
    uebernehmen.disabled = !eigenesTheme(katalog, wahl.value);
  };
  wahl.addEventListener('change', nachWahl);
  nachWahl();

  return new Promise((resolve) => {
    const schliesse = (ergebnis) => {
      modal.removeEventListener('keydown', beiTaste, true);
      modal.remove();
      resolve(ergebnis);
    };
    const beiTaste = (ereignis) => {
      if (ereignis.key !== 'Escape') return;
      ereignis.preventDefault();
      ereignis.stopPropagation();
      schliesse(null);
    };
    const mit = (aktion) => () =>
      schliesse({ aktion, themeName: wahl.value, eigene: formular.eigeneWerte() });
    abbrechen.addEventListener('click', () => schliesse(null));
    hintergrund.addEventListener('click', () => schliesse(null));
    ok.addEventListener('click', mit('ok'));
    alsTheme.addEventListener('click', mit('alsTheme'));
    uebernehmen.addEventListener('click', mit('werteUebernehmen'));
    modal.addEventListener('keydown', beiTaste, true);
    document.body.appendChild(modal);
    setTimeout(() => wahl.focus(), 0);
  });
}

/**
 * Ein neues eigenes Theme aus Basis und eigenen Werten.
 *
 * @param {string} name der neue Name (geprüft).
 * @param {string} themeName das gewählte Theme.
 * @param {Object<string,string>} eigene die eigenen Werte des Dialogs.
 * @param {Array<object>} katalog die eigenen Themes.
 * @param {string} id die Kennung des neuen Themes.
 * @returns {{id: string, name: string, basis: string, slots: object}}
 */
export function themeAusDialog(name, themeName, eigene, katalog, id) {
  const aufgeloest = themeAufloesen(themeName, { eigene: katalog });
  const slots = { ...aufgeloest.slots, ...(eigene || {}) };
  return {
    id,
    name: String(name).trim(),
    basis: aufgeloest.basis,
    slots: themeAbweichungen(aufgeloest.basis, slots),
  };
}

/**
 * Der Kopf-Wert der Handlung «Theme-Werte in die Datei übernehmen»: der
 * vollständige Slot-Satz des eigenen Themes, darüber die eigenen Werte des
 * Dialogs, als Block mit `name:` seiner Basis. null, wenn das Theme kein
 * eigenes ist.
 */
export function werteUebernehmenKopfWert(themeName, eigene, katalog) {
  if (!eigenesTheme(katalog, themeName)) return null;
  const aufgeloest = themeAufloesen(themeName, { eigene: katalog });
  return themeKopfWert(aufgeloest.basis, { ...aufgeloest.slots, ...(eigene || {}) });
}

let themeIdZaehler = 0;
function neueThemeId() {
  themeIdZaehler += 1;
  return `folien-theme-${Date.now()}-${themeIdZaehler}`;
}

/**
 * Öffnet den Dialog für die Spalte und schreibt das Ergebnis.
 *
 * @param {object} zugang
 * @param {Function} zugang.t Übersetzung.
 * @param {object|null} zugang.view die EditorView der Spalte (`state.doc`,
 *   `state.readOnly`, `dispatch`).
 * @param {boolean} zugang.aenderbar ist die Präsentation änderbar?
 * @param {() => Array<object>} zugang.eigeneThemes der Katalog eigener Themes.
 * @param {(zustand: object) => Promise<boolean>} zugang.speichereThemes
 *   schreibt den Schlüssel `presentationThemes` (normalisiert).
 * @param {(opts: object) => Promise<string|null>} zugang.frageName der
 *   Namens-Dialog des Bestands (`showNameInputDialog`).
 * @param {(key: string) => void} zugang.hinweis Statusleisten-Hinweis.
 * @param {Function} [zugang.zeigeDialog] Ersatz des Modals (Prüffälle).
 * @returns {Promise<boolean>} true, wenn geschrieben wurde.
 */
export async function oeffneGestaltungsDialog(zugang) {
  const t = typeof zugang.t === 'function' ? zugang.t : (key) => key;
  const hinweis = typeof zugang.hinweis === 'function' ? zugang.hinweis : () => {};
  const view = zugang.view;
  if (!zugang.aenderbar || !view || view.state.readOnly) {
    hinweis('presentation.gestaltung.nurAenderbar');
    return false;
  }
  const ausgangsstand = view.state.doc.toString();
  const gelesen = leseKopfGestaltung(ausgangsstand);
  if (!gelesen.ok) {
    hinweis('presentation.gestaltung.kopfDefekt');
    return false;
  }
  const katalog = typeof zugang.eigeneThemes === 'function' ? zugang.eigeneThemes() : [];
  const zeige =
    typeof zugang.zeigeDialog === 'function' ? zugang.zeigeDialog : zeigeGestaltungsDialog;
  const ergebnis = await zeige({
    t,
    themeName: gelesen.themeName,
    eigene: gelesen.eigene,
    katalog,
  });
  if (!ergebnis) return false;

  let wert;
  if (ergebnis.aktion === 'alsTheme') {
    const name = await zugang.frageName({
      title: t('presentation.gestaltung.alsThemeTitel'),
      description: t('presentation.gestaltung.alsThemeHinweis'),
      initialValue: '',
      okLabel: t('presentation.gestaltung.alsThemeSpeichern'),
      validate: (eingabe) => {
        const befund = themeNamePruefen(eingabe, katalog);
        return befund ? NAMENS_TEXTE[befund] : null;
      },
    });
    if (typeof name !== 'string' || themeNamePruefen(name, katalog) !== null) return false;
    const neu = themeAusDialog(name, ergebnis.themeName, ergebnis.eigene, katalog, neueThemeId());
    const zustand = normalisiereThemesZustand({ custom: [...katalog, neu] });
    if (!(await zugang.speichereThemes(zustand))) return false;
    wert = neu.name;
  } else if (ergebnis.aktion === 'werteUebernehmen') {
    wert = werteUebernehmenKopfWert(ergebnis.themeName, ergebnis.eigene, katalog);
    if (wert === null) return false;
  } else {
    // Unverändert Übernommenes aus dem Block (unbekannte Schlüssel, ungültige
    // Werte) bleibt, solange die Zeile keinen eigenen Wert bekommt.
    wert = themeKopfWert(ergebnis.themeName, ergebnis.eigene, gelesen.extra);
    if (kopfUnveraendert(gelesen, wert)) return false;
  }

  const text = schreibeThemeInKopf(ausgangsstand, wert);
  if (text === null) {
    hinweis('presentation.gestaltung.kopfDefekt');
    return false;
  }
  if (view.state.doc.toString() !== ausgangsstand) {
    hinweis('presentation.gestaltung.verworfen');
    return false;
  }
  const aenderung = textAenderung(ausgangsstand, text);
  if (!aenderung) return false;
  view.dispatch({ changes: aenderung, userEvent: 'input' });
  return true;
}
