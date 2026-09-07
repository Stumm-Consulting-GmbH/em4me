// 4T-001455 (Epic 3E-000190): Bereich „Bereichs-Verknüpfungen" der Einstellungen
// — die Verknüpfungen des geöffneten Bereichs anlegen, ändern und entfernen.
//
// Eine Sektion der Gruppe „Aktueller Bereich" (`group: 'area'`), weil eine
// Verknüpfung eine Eigenschaft **dieses** Bereichs ist: Sie sagt, wie er die
// anderen anspricht, und wandert mit seiner Bereichsdatei. Vorbild ist der
// Aufbau von `settings-templates.js` (Entwurf, `validate`, `dirty`, `apply`).
//
// **Je Richtung ein eigenes Kürzel.** Was hier steht, gilt nur für diesen
// Bereich; wie umgekehrt er selbst angesprochen wird, steht in der
// Bereichsdatei des anderen und darf anders lauten (PO-Idee vom 2026-08-09).
// Die Oberfläche schreibt deshalb nie in einen fremden Bereich.
//
// Sie ist zugleich der Ort, an dem der Anwender nach einem Befund aus
// `4T-001453` den **neuen Pfad** eines verschobenen Bereichs angibt — dafür
// braucht es keinen eigenen Bedienweg, das Pfad-Feld des Eintrags ist er.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';
import { isValidAreaPrefix, normalizeAreaPrefix } from '../../../shared/area-link-syntax.js';

/**
 * Liest den Verknüpfungs-Stand für den Entwurf.
 *
 * @returns {Promise<{draft: object, snapshot: Array}>} Entwurf und Vergleichs-Stand.
 */
export async function readAreaLinksFromConfig() {
  let antwort;
  try {
    antwort = await api.getAreaLinkConfig();
  } catch {
    antwort = null;
  }
  const links = antwort && Array.isArray(antwort.links) ? antwort.links : [];
  return {
    draft: {
      hasArea: !!(antwort && antwort.hasArea),
      areaName: (antwort && antwort.areaName) || null,
      // Eigene Kopien: Der Entwurf wird bearbeitet, der Schnappschuss nicht.
      eintraege: links.map((l) => ({ prefix: l.prefix, path: l.path, templates: !!l.templates })),
    },
    snapshot: links.map((l) => ({ prefix: l.prefix, path: l.path, templates: !!l.templates })),
  };
}

// Persistenz-Form des Entwurfs: leere Zeilen entfallen still, damit eine
// angefangene und wieder verworfene Zeile nichts schreibt.
function normalisierteEintraege(values) {
  return (values.eintraege || [])
    .map((e) => ({
      prefix: String(e.prefix || '').trim(),
      path: String(e.path || '').trim(),
      templates: e.templates === true,
    }))
    .filter((e) => e.prefix !== '' || e.path !== '');
}

/**
 * Meldet, ob der Entwurf ungesicherte Änderungen trägt.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {boolean} true bei Änderungen.
 */
export function dirtyAreaLinksSection(draft) {
  const values = draft.areaLinks;
  if (!values || !values.hasArea) return false;
  return !jsonEqual(normalisierteEintraege(values), draft.areaLinksSnapshot || []);
}

/**
 * Prüft den Entwurf. Ein Fehler hält das Anwenden der GANZEN Seite an, deshalb
 * werden nur echte Hindernisse gemeldet: eine halb ausgefüllte Zeile, ein
 * unzulässiges Kürzel und ein doppelt vergebenes Kürzel.
 *
 * Bewusst NICHT geprüft wird, ob der Ordner existiert: Ein verknüpfter Bereich
 * darf auf einem getrennten Laufwerk liegen, und das Eintragen eines Pfades,
 * der gerade nicht erreichbar ist, ist ein zulässiger Vorgang (Entscheidung E4).
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {string|null} Fehlertext oder null.
 */
export function validateAreaLinksSection(draft) {
  const values = draft.areaLinks;
  if (!values || !values.hasArea) return null;
  const gesehen = new Set();
  for (const e of normalisierteEintraege(values)) {
    if (e.prefix === '' || e.path === '') return t('settings.areaLinks.error.incomplete');
    if (!isValidAreaPrefix(e.prefix)) return t('settings.areaLinks.error.prefix');
    const schluessel = normalizeAreaPrefix(e.prefix);
    if (gesehen.has(schluessel)) return t('settings.areaLinks.error.duplicate');
    gesehen.add(schluessel);
  }
  return null;
}

/**
 * Schreibt den Entwurf in die Bereichsdatei.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {Promise<void>}
 */
export async function applyAreaLinksSection(draft) {
  const values = draft.areaLinks;
  if (!values || !values.hasArea) return;
  const raus = normalisierteEintraege(values);
  if (jsonEqual(raus, draft.areaLinksSnapshot || [])) return;
  let ergebnis;
  try {
    ergebnis = await api.setAreaLinkConfig(raus);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    // Eine defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis
    // statt stiller Wirkungslosigkeit (Muster applyTemplatesSection).
    showStatusbarHint(null, { text: t('settings.areaLinks.writeFailed'), error: true });
    return;
  }
  draft.areaLinksSnapshot = raus;
}

// Eine Eintrags-Zeile: Kürzel, Ablage-Ort mit Durchsuchen-Knopf, das
// Vorlagen-Opt-in und der Entfernen-Knopf.
function baueZeile(container, values, eintrag, idx) {
  const zeile = document.createElement('div');
  zeile.className = 'settings-templates-rule-row';

  const prefixInput = document.createElement('input');
  prefixInput.type = 'text';
  prefixInput.id = `settings-area-links-prefix-${idx}`;
  prefixInput.className = 'settings-input';
  prefixInput.placeholder = t('settings.areaLinks.prefixPlaceholder');
  prefixInput.value = eintrag.prefix;
  prefixInput.addEventListener('input', () => {
    eintrag.prefix = prefixInput.value;
  });

  const pfadInput = document.createElement('input');
  pfadInput.type = 'text';
  pfadInput.id = `settings-area-links-path-${idx}`;
  pfadInput.className = 'settings-input';
  pfadInput.placeholder = t('settings.areaLinks.pathPlaceholder');
  pfadInput.value = eintrag.path;
  pfadInput.addEventListener('input', () => {
    eintrag.path = pfadInput.value;
  });

  const waehlen = document.createElement('button');
  waehlen.type = 'button';
  waehlen.id = `settings-area-links-browse-${idx}`;
  waehlen.className = 'settings-button';
  waehlen.textContent = t('settings.areaLinks.browse');
  waehlen.addEventListener('click', async () => {
    // Derselbe Ordner-Dialog wie bei den Vorlagen. Der Kanal waehlt seinen
    // Titel nach dem Zweck und ist damit schon heute nicht vorlagen-eigen
    // (Zweck 'target' seit 4T-000426); 'areaLink' tritt daneben.
    let ergebnis;
    try {
      ergebnis = await api.templatesChooseFolder('areaLink');
    } catch {
      ergebnis = null;
    }
    if (ergebnis && ergebnis.ok && ergebnis.path) {
      eintrag.path = ergebnis.path;
      renderActiveSection();
    }
  });

  const vorlagen = document.createElement('input');
  vorlagen.type = 'checkbox';
  vorlagen.id = `settings-area-links-templates-${idx}`;
  vorlagen.checked = eintrag.templates === true;
  vorlagen.title = t('settings.areaLinks.templatesHint');
  vorlagen.addEventListener('change', () => {
    eintrag.templates = vorlagen.checked;
  });

  const entfernen = document.createElement('button');
  entfernen.type = 'button';
  entfernen.id = `settings-area-links-remove-${idx}`;
  entfernen.className = 'settings-button';
  entfernen.textContent = t('settings.areaLinks.remove');
  entfernen.addEventListener('click', () => {
    values.eintraege.splice(idx, 1);
    renderActiveSection();
  });

  zeile.append(prefixInput, pfadInput, waehlen, vorlagen, entfernen);
  container.appendChild(zeile);
}

/**
 * Zeichnet den Einstellungs-Bereich.
 *
 * @param {HTMLElement} container Ziel-Element.
 * @param {object} draft Entwurf der Einstellungs-Seite.
 */
export function renderAreaLinksSection(container, draft) {
  const values = draft.areaLinks;
  if (!values) {
    const laden = document.createElement('p');
    laden.className = 'settings-row-hint';
    laden.textContent = t('settings.areaLinks.loading');
    container.appendChild(laden);
    return;
  }
  // Guard für den Übergangs-Moment eines Bereichs-Wechsels (Muster
  // renderTemplatesAreaSection); regulär ist die Sektion ohne Bereich nicht
  // erreichbar.
  if (!values.hasArea) return;

  const titel = document.createElement('h4');
  titel.className = 'settings-export-group-title';
  titel.textContent = t('settings.areaLinks.group').replace('{name}', values.areaName || '');
  container.appendChild(titel);

  const hinweis = document.createElement('p');
  hinweis.className = 'settings-row-hint';
  hinweis.textContent = t('settings.areaLinks.hint');
  container.appendChild(hinweis);

  values.eintraege.forEach((eintrag, idx) => baueZeile(container, values, eintrag, idx));

  const hinzu = document.createElement('button');
  hinzu.type = 'button';
  hinzu.id = 'settings-area-links-add';
  hinzu.className = 'settings-button';
  hinzu.textContent = t('settings.areaLinks.add');
  hinzu.addEventListener('click', () => {
    values.eintraege.push({ prefix: '', path: '', templates: false });
    renderActiveSection();
  });
  container.appendChild(buildSettingsRow('settings.areaLinks.addRow', hinzu));
}
