// 4T-002282 (Epic 3E-000348): Einstellungs-Abschnitt «Folien-Themes» — der
// Theme-Editor der Präsentations-Ansicht (Lösungsansatz (b), Entscheidung des
// Product Owners vom 2026-10-14, Frage C2, Option (a)).
//
// Nach dem Vorbild `kanban-settings.js`: Registrierung als Modul-Seiteneffekt,
// geladen von app-init; der Abschnitt hängt über das Registry-Feld
// `settingsSections` an der Erweiterung `presentation`, steht damit im Block
// «Erweiterungen (intern)» und verschwindet mit ihr. Verwaltung und
// Slot-Zeilen nach dem Vorbild der Farbschema-Seite (settings-color-schemes.js):
// Auswahl, «Neu» aus einer Vorlage, «Duplizieren», «Umbenennen» über das
// Namensfeld, «Löschen», darunter das gemeinsame Formular
// (presentation-gestaltung-formular.js, Rahmen `entwurf`) und eine
// Vorschau-Folie, die live mitgeht und mit `zeichneFolie` gezeichnet wird.
//
// **Speicher:** der Schlüssel `presentationThemes` aus 4T-002281, in der
// Form `{ custom: [ { id, name, basis, slots } ] }` mit `slots` als den
// Abweichungen von der Basis. Geschrieben wird erst mit Anwenden/OK und
// immer normalisiert (`normalisiereThemesZustand`); die Namens-Regel prüft der
// validate-Haken und hält Anwenden/OK bei einem ungültigen Namen an.
'use strict';

import { t } from '../../i18n.js';
import {
  FOLIEN_THEMES,
  FOLIEN_THEME_SYNTAX,
  THEME_NAMEN,
} from '../../../shared/presentation/presentation-themes.js';
import {
  PRESENTATION_THEMES_KEY,
  normalisiereThemesZustand,
  themeNamePruefen,
} from '../../../shared/presentation/presentation-eigene-themes.js';
import { eigeneThemes, setzeEigeneThemes } from '../presentation/presentation-themes-stand.js';
import { baueGestaltungsFormular } from '../presentation/presentation-gestaltung-formular.js';
import { NAMENS_TEXTE } from '../presentation/presentation-gestaltung-dialog.js';
import {
  baueFolie,
  beobachteBuehne,
  passeFolieEin,
  zeichneFolie,
} from '../presentation/presentation-folie.js';
import { persistSetting } from '../views/views.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';
import { registerSettingsSection } from './settings-page.js';

export const SECTION_ID = 'presentationThemes';

let idZaehler = 0;
function neueId() {
  idZaehler += 1;
  return `folien-theme-${Date.now()}-${idZaehler}`;
}

function entwurf(draft) {
  if (!draft.presentationThemes) {
    const zustand = normalisiereThemesZustand({ custom: eigeneThemes() });
    draft.presentationThemes = {
      zustand: structuredClone(zustand),
      snapshot: structuredClone(zustand),
      aktivId: zustand.custom.length > 0 ? zustand.custom[0].id : null,
    };
  }
  const e = draft.presentationThemes;
  if (!e.zustand.custom.some((theme) => theme.id === e.aktivId)) {
    e.aktivId = e.zustand.custom.length > 0 ? e.zustand.custom[0].id : null;
  }
  return e;
}

/** Ein freier Name nach dem Muster «Neues Theme», «Neues Theme 2», …. */
export function freierName(basisName, liste) {
  if (themeNamePruefen(basisName, liste) === null) return basisName;
  for (let n = 2; n < 1000; n += 1) {
    const name = `${basisName} ${n}`;
    if (themeNamePruefen(name, liste) === null) return name;
  }
  return `${basisName} ${Date.now()}`;
}

// --- Vorschau-Folie --------------------------------------------------------

function maskiere(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Die Vorschau zeigt festen Beispiel-Text aus dem Katalog; eine Überschrift
// (`# `), ein Absatz mit hervorgehobenem Verweis (`@ `) und sonst Absätze.
// Kein Markdown des Anwenders läuft hier durch, deshalb genügt das Maskieren.
function vorschauRender(quelltext) {
  return String(quelltext)
    .split('\n')
    .filter((zeile) => zeile.trim() !== '')
    .map((zeile) => {
      if (zeile.startsWith('# ')) return `<h1>${maskiere(zeile.slice(2))}</h1>`;
      if (zeile.startsWith('@ ')) return `<p><a href="#">${maskiere(zeile.slice(2))}</a></p>`;
      return `<p>${maskiere(zeile)}</p>`;
    })
    .join('');
}

/**
 * Zeichnet die Vorschau-Folie eines Slot-Satzes.
 *
 * @param {HTMLElement} huelle Ergebnis von baueFolie.
 * @param {string} basis die Basis des Themes (Farbsatz der Code-Blöcke).
 * @param {Object<string,string>} slots der vollständige Slot-Satz.
 */
export function zeichneVorschau(huelle, basis, slots) {
  zeichneFolie(huelle, {
    folie: {
      quelltext: [
        `# ${t('presentation.themes.vorschauTitel')}`,
        t('presentation.themes.vorschauText'),
        `@ ${t('presentation.themes.vorschauVerweis')}`,
      ].join('\n'),
      gestaltung: {
        theme: basis,
        slots,
        syntax: FOLIEN_THEME_SYNTAX[basis] || 'light',
        header: t('presentation.themes.vorschauKopf'),
        footer: t('presentation.themes.vorschauFuss'),
        seitenzahl: 'zeigen',
        seite: 1,
      },
    },
    index: 0,
    kopf: {},
    render: vorschauRender,
  });
}

// --- Abschnitt ---------------------------------------------------------------

function knopf(id, text, aktion) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn';
  el.id = id;
  el.textContent = text;
  el.addEventListener('click', aktion);
  return el;
}

function renderVerwaltung(container, e) {
  const liste = e.zustand.custom;
  const aktiv = liste.find((theme) => theme.id === e.aktivId) || null;

  if (liste.length > 0) {
    const auswahl = document.createElement('select');
    auswahl.id = 'settings-folien-theme-auswahl';
    auswahl.className = 'settings-input';
    for (const theme of liste) {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.name;
      auswahl.appendChild(option);
    }
    auswahl.value = e.aktivId;
    auswahl.addEventListener('change', () => {
      e.aktivId = auswahl.value;
      renderActiveSection();
    });
    container.appendChild(buildSettingsRow('presentation.themes.auswahl', auswahl));
  } else {
    const leer = document.createElement('p');
    leer.className = 'settings-hint';
    leer.textContent = t('presentation.themes.keine');
    container.appendChild(leer);
  }

  // Neu aus Vorlage und, bei gewähltem Theme, Duplizieren und Löschen.
  const aktionen = document.createElement('div');
  aktionen.className = 'settings-row folien-themes-aktionen';
  const vorlage = document.createElement('select');
  vorlage.id = 'settings-folien-theme-vorlage';
  vorlage.className = 'settings-input';
  vorlage.setAttribute('aria-label', t('presentation.themes.vorlage'));
  for (const name of THEME_NAMEN) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    vorlage.appendChild(option);
  }
  const vorlageLabel = document.createElement('label');
  vorlageLabel.htmlFor = vorlage.id;
  vorlageLabel.textContent = t('presentation.themes.vorlage');
  aktionen.append(
    vorlageLabel,
    vorlage,
    knopf('settings-folien-theme-neu', t('presentation.themes.neu'), () => {
      const id = neueId();
      liste.push({
        id,
        name: freierName(t('presentation.themes.neuerName'), liste),
        basis: vorlage.value,
        slots: {},
      });
      e.aktivId = id;
      renderActiveSection();
    }),
  );
  if (aktiv) {
    aktionen.append(
      knopf('settings-folien-theme-duplizieren', t('presentation.themes.duplizieren'), () => {
        const id = neueId();
        const name = freierName(`${aktiv.name} ${t('presentation.themes.kopieZusatz')}`, liste);
        liste.push({ id, name, basis: aktiv.basis, slots: { ...aktiv.slots } });
        e.aktivId = id;
        renderActiveSection();
      }),
      knopf('settings-folien-theme-loeschen', t('presentation.themes.loeschen'), () => {
        e.zustand.custom = liste.filter((theme) => theme.id !== aktiv.id);
        e.aktivId = null;
        renderActiveSection();
      }),
    );
  }
  container.appendChild(aktionen);
  return aktiv;
}

function renderBearbeitung(container, aktiv) {
  // Umbenennen über das Namensfeld; die Namens-Regel meldet sich sofort und
  // beim Anwenden über den validate-Haken.
  const name = document.createElement('input');
  name.type = 'text';
  name.id = 'settings-folien-theme-name';
  name.className = 'settings-input';
  name.value = aktiv.name;
  const fehler = document.createElement('div');
  fehler.className = 'folien-themes-fehler';
  fehler.setAttribute('role', 'alert');
  const zeigeBefund = (liste) => {
    const befund = themeNamePruefen(name.value, liste, aktiv.id);
    fehler.textContent = befund ? t(NAMENS_TEXTE[befund]) : '';
    fehler.hidden = !befund;
  };
  container.appendChild(buildSettingsRow('presentation.themes.name', name));
  container.appendChild(fehler);

  const basis = document.createElement('p');
  basis.className = 'settings-hint';
  basis.textContent = t('presentation.themes.basis').replace('{name}', aktiv.basis);
  container.appendChild(basis);

  const raster = document.createElement('div');
  raster.className = 'folien-themes-raster';
  const buehne = document.createElement('div');
  buehne.className = 'folien-gestaltung-vorschau';
  buehne.setAttribute('aria-label', t('presentation.themes.vorschau'));
  const huelle = baueFolie();
  buehne.appendChild(huelle);

  const grund = { ...FOLIEN_THEMES[aktiv.basis] };
  const formular = baueGestaltungsFormular({
    t,
    rahmen: 'entwurf',
    grund,
    eigene: aktiv.slots,
    idPraefix: 'settings-folien-theme',
    beiAenderung: (eigene) => {
      aktiv.slots = eigene;
      zeichneVorschau(huelle, aktiv.basis, formular.wirksam());
    },
  });
  raster.append(formular.element, buehne);
  container.appendChild(raster);
  zeichneVorschau(huelle, aktiv.basis, formular.wirksam());
  // Eingepasst wird, sobald die Bühne eine Größe hat; die Beobachter passen
  // bei jeder Größen-Änderung nach.
  beobachteBuehne(buehne);
  if (typeof requestAnimationFrame === 'function')
    requestAnimationFrame(() => passeFolieEin(buehne));
  return { name, zeigeBefund };
}

export function renderPresentationThemesSection(container, draft) {
  const e = entwurf(draft);
  const hinweis = document.createElement('p');
  hinweis.className = 'settings-hint';
  hinweis.textContent = t('presentation.themes.hinweis');
  container.appendChild(hinweis);
  const aktiv = renderVerwaltung(container, e);
  if (!aktiv) return;
  const { name, zeigeBefund } = renderBearbeitung(container, aktiv);
  name.addEventListener('input', () => {
    aktiv.name = name.value;
    zeigeBefund(e.zustand.custom);
  });
  // Die Auswahl zeigt den neuen Namen nach dem Verlassen des Felds.
  name.addEventListener('change', () => renderActiveSection());
  zeigeBefund(e.zustand.custom);
}

/** Der Fehlertext des ersten ungültigen Namens, sonst null. */
export function validatePresentationThemesSection(draft) {
  if (!draft.presentationThemes) return null;
  const liste = draft.presentationThemes.zustand.custom;
  for (const theme of liste) {
    const befund = themeNamePruefen(theme.name, liste, theme.id);
    if (befund) return `${theme.name || '…'}: ${t(NAMENS_TEXTE[befund])}`;
  }
  return null;
}

export function dirtyPresentationThemesSection(draft) {
  if (!draft.presentationThemes) return false;
  const e = draft.presentationThemes;
  return !jsonEqual(normalisiereThemesZustand(e.zustand), e.snapshot);
}

export async function applyPresentationThemesSection(draft) {
  if (!dirtyPresentationThemesSection(draft)) return;
  const e = draft.presentationThemes;
  const zustand = normalisiereThemesZustand(e.zustand);
  if (!(await persistSetting(PRESENTATION_THEMES_KEY, zustand))) return;
  // Das eigene Fenster sofort, die übrigen über die Verteilung (sie erreicht
  // auch dieses; der Katalog übergeht einen unveränderten Stand).
  setzeEigeneThemes(zustand);
  e.zustand = structuredClone(zustand);
  e.snapshot = structuredClone(zustand);
}

registerSettingsSection({
  id: SECTION_ID,
  titleKey: 'presentation.themes.titel',
  render: renderPresentationThemesSection,
  validate: validatePresentationThemesSection,
  apply: applyPresentationThemesSection,
  dirty: dirtyPresentationThemesSection,
});
