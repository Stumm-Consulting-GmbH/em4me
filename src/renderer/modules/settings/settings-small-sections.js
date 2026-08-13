// 4T-0988 (Epic 3E-0196): Bündel der kleinen Einstellungs-Bereiche.
//
// Rechtschreibprüfung, Zeitstempel-Automatik, Export und Überschriften-
// Nummerierung. Der Zuschnitt folgt hier dem Umfang und nicht der
// Fachlichkeit: jeder dieser Bereiche ist für sich zu klein für ein
// eigenes Modul, und keiner teilt Zustand mit einem anderen.
'use strict';

import {
  PDF_EXPORT_DEFAULTS,
  PDF_MARGIN_PRESETS,
  PDF_PAGE_SIZES,
  normalizePdfExportSettings,
} from '../../../shared/pdf-options.js';
import { SPELLCHECK_KEY, normalizeDictionaryWords } from '../../../shared/spellcheck.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import {
  applyHeadingNumbering,
  headingNumberingStartLevel,
  isHeadingNumberingEnabled,
} from '../heading-numbering.js';
import { persistSetting } from '../views/views.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';

// Spiegelt applyExportSection (normalisierte Werte gegen den Snapshot).
export function dirtyExportSection(draft) {
  if (!draft.exportPdf) return false;
  return !jsonEqual(normalizePdfExportSettings(draft.exportPdf), draft.exportPdfSnapshot);
}

// Spiegelt applyHeadingNumberingSection (zwei Werte gegen den Laufzeit-
// Zustand).
export function dirtyHeadingNumberingSection(draft) {
  if (!draft.headingNumbering) return false;
  const enabled = draft.headingNumbering.enabled === true;
  const startLevel = draft.headingNumbering.startLevel === 2 ? 2 : 1;
  return enabled !== isHeadingNumberingEnabled() || startLevel !== headingNumberingStartLevel();
}

// --- 4T-0581/4T-0582 (Epic 3E-0107): Bereich „Rechtschreibprüfung" -----------
// Ein Schalter und die Liste der eigenen Wörterbuch-Einträge. Eine Sprach-
// Auswahl gibt es bewusst nicht: geprüft wird mit dem Prüfer des
// Betriebssystems gegen dessen Sprache (Architekturentscheidung 6 des Epics).
// Der Schalter wirkt sofort auf alle Fenster (Broadcast im Main); die
// Wörterbuch-Liste wirkt unmittelbar und kennt deshalb keinen Entwurf.

export function renderSpellcheckSection(container, draft) {
  const box = document.createElement('input');
  box.id = 'settings-spellcheck-enabled';
  box.type = 'checkbox';
  box.checked = draft.spellcheck === true;
  box.addEventListener('change', () => {
    draft.spellcheck = box.checked;
  });
  container.appendChild(buildSettingsRow('settings.spellcheck.enabled', box));

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.spellcheck.hint');
  container.appendChild(hint);

  const dictTitle = document.createElement('h4');
  dictTitle.className = 'settings-export-group-title';
  dictTitle.textContent = t('settings.spellcheck.dictionaryTitle');
  container.appendChild(dictTitle);

  const liste = document.createElement('div');
  liste.id = 'settings-spellcheck-words';
  liste.className = 'settings-spellcheck-words';
  container.appendChild(liste);
  renderSpellcheckWords(liste, draft);
}

// Zeichnet die Wortliste neu. Entfernen wirkt sofort auf das Wörterbuch des
// Betriebssystems; ein Entwurfs-Zwischenschritt wäre irreführend, weil das
// Wörterbuch nicht der Anwendung gehört und auch von außen verändert werden
// kann.
function renderSpellcheckWords(liste, draft) {
  liste.innerHTML = '';
  const woerter = normalizeDictionaryWords(draft.spellcheckWords);
  if (woerter.length === 0) {
    const leer = document.createElement('p');
    leer.className = 'settings-row-hint';
    leer.textContent = t('settings.spellcheck.dictionaryEmpty');
    liste.appendChild(leer);
    return;
  }
  for (const wort of woerter) {
    const zeile = document.createElement('div');
    zeile.className = 'settings-spellcheck-word';
    const label = document.createElement('span');
    label.textContent = wort;
    zeile.appendChild(label);
    const entfernen = document.createElement('button');
    entfernen.type = 'button';
    entfernen.className = 'btn';
    entfernen.dataset.word = wort;
    entfernen.textContent = t('settings.spellcheck.dictionaryRemove');
    entfernen.addEventListener('click', () => {
      void api.spellcheckRemoveWord(wort).then(() => {
        draft.spellcheckWords = normalizeDictionaryWords(draft.spellcheckWords).filter(
          (w) => w !== wort,
        );
        renderSpellcheckWords(liste, draft);
      });
    });
    zeile.appendChild(entfernen);
    liste.appendChild(zeile);
  }
}

export async function applySpellcheckSection(draft) {
  if (typeof draft.spellcheck !== 'boolean') return;
  if (draft.spellcheck === draft.spellcheckSnapshot) return;
  // Der Broadcast des Main-Prozesses zieht state.spellcheck und die
  // Editor-Compartments in ALLEN Fenstern nach, dieses eingeschlossen.
  await persistSetting(SPELLCHECK_KEY, draft.spellcheck);
  draft.spellcheckSnapshot = draft.spellcheck;
}

export function dirtySpellcheckSection(draft) {
  if (typeof draft.spellcheck !== 'boolean') return false;
  return draft.spellcheck !== draft.spellcheckSnapshot;
}

// --- 4T-0604 (Epic 3E-0113): Bereich „Zeitstempel" ---------------------------
// Erweiterungs-eigener Bereich der Erweiterung 'frontmatter-timestamps': zwei
// unabhängige Schalter (Erstellungs-/Änderungszeitpunkt), je ein Feldname,
// gemeinsames Format und die Anlage-Option für fehlende Felder. Store-Keys
// frontmatter.*; beim Anwenden wird der Laufzeit-Zustand
// state.frontmatterTimestamps nachgezogen, damit der Speicher-Hook ohne
// Neustart mit den neuen Werten arbeitet.

const TIMESTAMP_FORMAT_OPTION_KEYS = [
  ['datetime', 'settings.frontmatterTimestamps.formatDatetime'],
  ['date', 'settings.frontmatterTimestamps.formatDate'],
];

export function normalizeTimestampDraft(ts) {
  const v = ts || {};
  return {
    createdEnabled: v.createdEnabled === true,
    createdField: (v.createdField || '').trim() || 'created',
    updatedEnabled: v.updatedEnabled === true,
    updatedField: (v.updatedField || '').trim() || 'updated',
    format: v.format === 'date' ? 'date' : 'datetime',
    autoCreate: v.autoCreate === true,
  };
}

export function renderFrontmatterTimestampsSection(container, draft) {
  // An den Entwurf binden statt eine lose Kopie zu rendern: sonst liefen die
  // Änderungs-Handler auf ein Objekt, das die Dirty-Prüfung nicht sieht.
  if (!draft.timestamps) draft.timestamps = normalizeTimestampDraft({});
  const ts = draft.timestamps;

  const boolRow = (id, key, get, set) => {
    const box = document.createElement('input');
    box.id = id;
    box.type = 'checkbox';
    box.checked = get() === true;
    box.addEventListener('change', () => set(box.checked));
    container.appendChild(buildSettingsRow(key, box));
  };
  const textRow = (id, key, get, set, fallback) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.className = 'settings-input';
    input.value = get() || fallback;
    input.addEventListener('input', () => set(input.value));
    container.appendChild(buildSettingsRow(key, input));
  };

  boolRow(
    'settings-created-enabled',
    'settings.frontmatterTimestamps.createdEnabled',
    () => ts.createdEnabled,
    (v) => {
      ts.createdEnabled = v;
    },
  );
  textRow(
    'settings-created-field',
    'settings.frontmatterTimestamps.createdField',
    () => ts.createdField,
    (v) => {
      ts.createdField = v;
    },
    'created',
  );
  boolRow(
    'settings-updated-enabled',
    'settings.frontmatterTimestamps.updatedEnabled',
    () => ts.updatedEnabled,
    (v) => {
      ts.updatedEnabled = v;
    },
  );
  textRow(
    'settings-updated-field',
    'settings.frontmatterTimestamps.updatedField',
    () => ts.updatedField,
    (v) => {
      ts.updatedField = v;
    },
    'updated',
  );

  const format = document.createElement('select');
  format.id = 'settings-timestamp-format';
  format.className = 'settings-input';
  for (const [value, key] of TIMESTAMP_FORMAT_OPTION_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    format.appendChild(option);
  }
  format.value = ts.format === 'date' ? 'date' : 'datetime';
  format.addEventListener('change', () => {
    ts.format = format.value;
  });
  container.appendChild(buildSettingsRow('settings.frontmatterTimestamps.formatLabel', format));

  boolRow(
    'settings-timestamp-autocreate',
    'settings.frontmatterTimestamps.autoCreate',
    () => ts.autoCreate,
    (v) => {
      ts.autoCreate = v;
    },
  );

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.frontmatterTimestamps.hint');
  container.appendChild(hint);
}

export async function applyFrontmatterTimestampsSection(draft) {
  if (!draft.timestamps || !draft.timestampsSnapshot) return;
  const norm = normalizeTimestampDraft(draft.timestamps);
  if (jsonEqual(norm, draft.timestampsSnapshot)) return;
  await persistSetting('frontmatter.createdEnabled', norm.createdEnabled);
  await persistSetting('frontmatter.createdField', norm.createdField);
  await persistSetting('frontmatter.updatedEnabled', norm.updatedEnabled);
  await persistSetting('frontmatter.updatedField', norm.updatedField);
  await persistSetting('frontmatter.timestampFormat', norm.format);
  await persistSetting('frontmatter.autoCreateField', norm.autoCreate);
  state.frontmatterTimestamps = { ...norm };
  draft.timestamps = { ...norm };
  draft.timestampsSnapshot = { ...norm };
}

// Spiegelt applyFrontmatterTimestampsSection (normalisierte Werte gegen den
// Snapshot).
export function dirtyFrontmatterTimestampsSection(draft) {
  if (!draft.timestamps || !draft.timestampsSnapshot) return false;
  return !jsonEqual(normalizeTimestampDraft(draft.timestamps), draft.timestampsSnapshot);
}

// --- Bereich Export (4T-0304, Epic 3E-0054) ----------------------------------
// Drei Felder fuer den PDF-Export: Seitenformat, Ausrichtung, Raender.
// Wertelisten und Defaults kommen aus src/shared/pdf-options.js (dieselbe
// Quelle liest der Main beim Druck); persistiert wird erst bei Anwenden/OK.
// Die Format-Namen (A4, Letter, ...) sind Eigennamen und erscheinen
// unuebersetzt (Muster der Schriftart-Vorschlaege im Bereich Darstellung).

export async function readPdfExportFromStore() {
  return normalizePdfExportSettings({
    pageSize: await api.getSetting('export.pdf.pageSize'),
    landscape: await api.getSetting('export.pdf.landscape'),
    margins: await api.getSetting('export.pdf.margins'),
  });
}

// Select-Baustein: options als [wert, label]-Paare.
function buildExportSelect(id, options, value, onChange) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

export function renderExportSection(container, draft) {
  const values = draft.exportPdf || { ...PDF_EXPORT_DEFAULTS };
  // Aenderungs-Guard wie im Bereich Darstellung: solange der Store-Stand
  // nicht geladen ist, verwerfen Eingaben nichts Persistiertes.
  const set = (key, value) => {
    if (!draft.exportPdf) draft.exportPdf = { ...values };
    draft.exportPdf[key] = value;
  };

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.export.pdfGroup');
  container.appendChild(heading);

  container.appendChild(
    buildSettingsRow(
      'settings.export.pageSize',
      buildExportSelect(
        'settings-export-page-size',
        PDF_PAGE_SIZES.map((size) => [size, size]),
        values.pageSize,
        (value) => set('pageSize', value),
      ),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.export.orientation',
      buildExportSelect(
        'settings-export-orientation',
        [
          ['portrait', t('settings.export.orientation.portrait')],
          ['landscape', t('settings.export.orientation.landscape')],
        ],
        values.landscape ? 'landscape' : 'portrait',
        (value) => set('landscape', value === 'landscape'),
      ),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.export.margins',
      buildExportSelect(
        'settings-export-margins',
        Object.keys(PDF_MARGIN_PRESETS).map((level) => [
          level,
          t(`settings.export.margins.${level}`),
        ]),
        values.margins,
        (value) => set('margins', value),
      ),
    ),
  );
}

export async function applyExportSection(draft) {
  // Noch nicht aus dem Store geladen und nicht angefasst: nichts zu tun.
  if (!draft.exportPdf) return;
  const values = normalizePdfExportSettings(draft.exportPdf);
  // Nur bei tatsaechlicher Aenderung persistieren (Muster der Bereiche
  // Verhalten und Tastenkuerzel) — jedes store.set schreibt die komplette
  // Config-Datei, unnoetige Schreibvorgaenge verlaengern sonst bei jedem
  // OK die Persist-Kette aller Bereiche.
  if (JSON.stringify(values) !== JSON.stringify(draft.exportPdfSnapshot)) {
    await persistSetting('export.pdf.pageSize', values.pageSize);
    await persistSetting('export.pdf.landscape', values.landscape);
    await persistSetting('export.pdf.margins', values.margins);
    draft.exportPdfSnapshot = { ...values };
  }
  draft.exportPdf = { ...values };
}

// --- Bereich Ueberschriften-Nummerierung (4T-0471, Epic 3E-0087) -----------
// Globale Einstellung "Ueberschriften nummerieren" plus Start-Ebene (H1/H2).
// Werte leben im Entwurf; Wirkung erst bei Anwenden/OK (Muster showFrontmatter).
const HEADING_START_LEVEL_KEYS = [
  ['1', 'settings.headingNumbering.startH1'],
  ['2', 'settings.headingNumbering.startH2'],
];

export function renderHeadingNumberingSection(container, draft) {
  if (!draft.headingNumbering) {
    draft.headingNumbering = {
      enabled: isHeadingNumberingEnabled(),
      startLevel: headingNumberingStartLevel(),
    };
  }
  const values = draft.headingNumbering;

  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.headingNumbering.intro');
  container.appendChild(intro);

  const enable = document.createElement('input');
  enable.id = 'settings-number-headings';
  enable.type = 'checkbox';
  enable.checked = values.enabled === true;
  enable.addEventListener('change', () => {
    values.enabled = enable.checked;
  });
  container.appendChild(buildSettingsRow('settings.headingNumbering.enable', enable));

  const select = document.createElement('select');
  select.id = 'settings-heading-start-level';
  select.className = 'settings-input';
  for (const [value, key] of HEADING_START_LEVEL_KEYS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = String(values.startLevel === 2 ? 2 : 1);
  select.addEventListener('change', () => {
    values.startLevel = select.value === '2' ? 2 : 1;
  });
  container.appendChild(buildSettingsRow('settings.headingNumbering.startLevel', select));
}

export async function applyHeadingNumberingSection(draft) {
  if (!draft.headingNumbering) return;
  const next = {
    enabled: draft.headingNumbering.enabled === true,
    startLevel: draft.headingNumbering.startLevel === 2 ? 2 : 1,
  };
  if (
    next.enabled === isHeadingNumberingEnabled() &&
    next.startLevel === headingNumberingStartLevel()
  ) {
    return; // No-op: kein unnoetiger Broadcast/Re-Render.
  }
  applyHeadingNumbering(next.enabled, next.startLevel);
  await persistSetting('render.headingNumbering', next);
}
