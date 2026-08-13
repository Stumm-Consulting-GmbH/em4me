// 4T-0791 (Epic 3E-0125): Bereiche „Anlagen" und Bereichs-Übersteuerung
// (Ablage-Form und Ordnername beim Einfügen und Ziehen).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow } from './settings-shared.js';

// --- Bereich Vorlagen (4T-0428, Epic 3E-0080) ----------------------------------
// Globaler Vorlagen-Ordner und globale Ordner-Regeln (Store-Keys
// templates.folder/templates.rules) plus — bei Bereichs-Fenstern — die
// Bereichs-Konfiguration in der templates-Sektion der Bereichsdatei.
// Bereichs-Werte übersteuern die globalen VOLLSTÄNDIG (keine Misch-
// Auflösung; Architekturentscheidung 2 des Epics). Änderungen wirken ohne
// Neustart: Auswahl-Popup und Regel-Trigger lesen die Konfiguration frisch
// pro Aufruf (kein Cache, Epic-Entscheidung aus 4T-0424).

// --- Anlagen (4T-0791, Epic 3E-0125) ----------------------------------------
// Vier Ablage-Formen; 'bereich' erscheint nur in der Bereichs-Sektion, weil er
// ohne Bereich keinen Bezug hätte. Die Reihenfolge ist die der Anzeige.
const ATTACHMENT_FORMS = ['neben', 'fest', 'dokument'];
const ATTACHMENT_AREA_FORMS = ['neben', 'fest', 'dokument', 'bereich'];
// Nur diese beiden Formen brauchen einen Ordnernamen; bei den übrigen ist das
// Feld inaktiv (es bleibt sichtbar, damit die Zeile nicht springt).
const ATTACHMENT_FORMS_WITH_NAME = new Set(['fest', 'bereich']);

export async function readAttachmentsFromConfig() {
  let config;
  try {
    config = await api.attachmentsGetConfig();
  } catch {
    config = null;
  }
  const global = {
    form: (config && config.global && config.global.form) || 'dokument',
    ordnername: (config && config.global && config.global.ordnername) || 'Anlagen',
  };
  // Eine fehlende Bereichs-Sektion ist der Wert „Wie allgemein"; sie wird
  // deshalb NICHT auf die Voreinstellung normalisiert.
  const areaRoh = config && config.area;
  const area = {
    form: (areaRoh && areaRoh.form) || '',
    ordnername: (areaRoh && areaRoh.ordnername) || global.ordnername,
  };
  return {
    draft: {
      hasArea: !!(config && config.hasArea),
      areaName: (config && config.areaName) || '',
      global,
      area,
    },
    snapshot: { global: { ...global }, area: areaRoh ? { ...areaRoh } : null },
  };
}

// Baut die Auswahl der Ablage-Form plus das Namensfeld. `istBereich` steuert,
// ob der zentrale Bereichs-Ordner und der Rückfall „Wie allgemein" angeboten
// werden.
function buildAttachmentRows(container, teil, istBereich) {
  const select = document.createElement('select');
  select.id = istBereich ? 'settings-attachments-area-form' : 'settings-attachments-form';
  select.className = 'settings-input';
  if (istBereich) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('settings.attachments.form.inherit');
    select.appendChild(opt);
  }
  for (const form of istBereich ? ATTACHMENT_AREA_FORMS : ATTACHMENT_FORMS) {
    const opt = document.createElement('option');
    opt.value = form;
    opt.textContent = t(`settings.attachments.form.${form}`);
    select.appendChild(opt);
  }
  select.value = teil.form;
  select.addEventListener('change', () => {
    teil.form = select.value;
    renderActiveSection();
  });
  container.appendChild(buildSettingsRow('settings.attachments.form', select));

  const nameInput = document.createElement('input');
  nameInput.id = istBereich ? 'settings-attachments-area-folder' : 'settings-attachments-folder';
  nameInput.className = 'settings-input';
  nameInput.type = 'text';
  nameInput.value = teil.ordnername;
  nameInput.disabled = !ATTACHMENT_FORMS_WITH_NAME.has(teil.form);
  nameInput.addEventListener('input', () => {
    teil.ordnername = nameInput.value;
  });
  container.appendChild(buildSettingsRow('settings.attachments.folder', nameInput));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.attachments.folderHint');
  container.appendChild(hint);
}

export function renderAttachmentsSection(container, draft) {
  const values = draft.attachments;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.attachments.loading');
    container.appendChild(loading);
    return;
  }
  buildAttachmentRows(container, values.global, false);
}

export function renderAttachmentsAreaSection(container, draft) {
  const values = draft.attachments;
  if (!values) return;
  // Guard für den Übergangs-Moment eines Bereichs-Wechsels (Muster
  // renderTemplatesAreaSection); regulär ist die Sektion ohne Bereich nicht
  // erreichbar.
  if (!values.hasArea) return;
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.attachments.areaGroup').replace('{name}', values.areaName);
  container.appendChild(heading);
  buildAttachmentRows(container, values.area, true);
}

// Ein Ordnername mit Pfad-Anteilen wird abgewiesen, nicht zurechtgebogen; die
// gleiche Regel setzt der Ablage-Kern im Hauptprozess durch.
function validateAttachmentsPart(teil, formen) {
  if (!teil || !formen.has(teil.form)) return null;
  const wert = (teil.ordnername || '').trim();
  if (wert === '' || wert === '.' || wert === '..' || /^\.+$/.test(wert)) {
    return t('settings.attachments.invalidFolder');
  }
  if (/[\\/<>:"|?*]/.test(wert)) return t('settings.attachments.invalidFolder');
  return null;
}

export function validateAttachmentsSection(draft) {
  const values = draft.attachments;
  if (!values) return null;
  return validateAttachmentsPart(values.global, ATTACHMENT_FORMS_WITH_NAME);
}

export function validateAttachmentsAreaSection(draft) {
  const values = draft.attachments;
  if (!values || !values.hasArea || !values.area.form) return null;
  return validateAttachmentsPart(values.area, ATTACHMENT_FORMS_WITH_NAME);
}

// Persistiert beide Teile. Der apply-Hook hängt an der allgemeinen Sektion;
// die Bereichs-Sektion teilt den Entwurf und hat bewusst keinen eigenen, sonst
// schriebe sie doppelt (Muster templatesArea).
export async function applyAttachmentsSection(draft) {
  const values = draft.attachments;
  if (!values) return;
  const snap = draft.attachmentsSnapshot || {};
  const globalOut = { form: values.global.form, ordnername: values.global.ordnername.trim() };
  if (JSON.stringify(globalOut) !== JSON.stringify(snap.global)) {
    try {
      await api.attachmentsSetGlobalConfig(globalOut);
    } catch {
      /* Persistenz-Fehler bleibt ohne Abbruch der übrigen Bereiche */
    }
  }
  if (values.hasArea) {
    const areaOut = values.area.form
      ? { form: values.area.form, ordnername: values.area.ordnername.trim() }
      : null;
    if (JSON.stringify(areaOut) !== JSON.stringify(snap.area)) {
      try {
        await api.attachmentsSetAreaConfig(areaOut);
      } catch {
        /* wie oben */
      }
    }
  }
}

export function dirtyAttachmentsSection(draft) {
  const values = draft.attachments;
  if (!values) return false;
  const snap = draft.attachmentsSnapshot || {};
  const globalOut = { form: values.global.form, ordnername: values.global.ordnername.trim() };
  if (JSON.stringify(globalOut) !== JSON.stringify(snap.global)) return true;
  if (!values.hasArea) return false;
  const areaOut = values.area.form
    ? { form: values.area.form, ordnername: values.area.ordnername.trim() }
    : null;
  return JSON.stringify(areaOut) !== JSON.stringify(snap.area);
}
