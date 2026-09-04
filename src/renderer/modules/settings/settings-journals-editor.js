// 4T-000436 (Epic 3E-000081): Editor eines einzelnen Journals im Regal-Detail
// des Bereichs „Journale" (Felder, Pfad-Vorschau, Kennungs-Vergabe).
'use strict';

import {
  DEFAULT_DATE_PROP,
  DEFAULT_END_PROP,
  DEFAULT_NAME_PROP,
  DEFAULT_START_PROP,
  JOURNAL_GRANULARITIES,
  periodOf,
  resolveEntryPath,
} from '../../../shared/journal-core.js';
import { t } from '../../i18n.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow } from './settings-shared.js';

// Stabile Journal-id aus dem Namen (Anlage-Zeitpunkt): kebab-Slug plus
// Zähler-Suffix bei Kollision. Die id bleibt beim Umbenennen erhalten
// (Persistenz-Schlüssel, nicht sichtbar in der UI).
export function journalIdFromName(name, taken) {
  const base =
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'journal';
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

// Text-Eingabe-Zeile des Journal-Formulars (schreibt in den Entwurf).
function buildJournalInputRow(container, labelKey, id, value, placeholder, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'settings-input';
  input.placeholder = placeholder || '';
  input.value = value || '';
  input.addEventListener('input', () => onInput(input.value));
  container.appendChild(buildSettingsRow(labelKey, input));
  return input;
}

// Live-Vorschau des aufgelösten Beispiel-Pfads (heutige Periode); Schema-
// Fehler erscheinen direkt am Feld (rote Hinweis-Zeile).
function updateJournalPreview(el, journal) {
  const period = periodOf(Date.now(), journal.granularity);
  const resolved = period ? resolveEntryPath(journal, period) : { ok: false };
  if (resolved.ok) {
    el.textContent = t('settings.journals.previewLabel').replace('{path}', resolved.relPath);
    el.classList.remove('settings-journals-preview-error');
  } else {
    el.textContent = t('settings.journals.previewInvalid');
    el.classList.add('settings-journals-preview-error');
  }
}

// Formular-Gruppe eines Journals.
export function buildJournalEditor(container, values, journal, idx, snapshotById) {
  const group = document.createElement('div');
  group.className = 'settings-journals-journal';
  const head = document.createElement('div');
  head.className = 'settings-journals-journal-head';
  const title = document.createElement('h5');
  title.className = 'settings-journals-journal-title';
  title.textContent = String(journal.name || '').trim() || t('settings.journals.journalUntitled');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-journals-remove-${idx}`;
  removeBtn.className = 'btn settings-journals-remove';
  removeBtn.textContent = t('settings.journals.journalRemove');
  removeBtn.addEventListener('click', () => {
    values.journals.splice(idx, 1);
    renderActiveSection();
  });
  head.append(title, removeBtn);
  group.appendChild(head);

  const nameInput = buildJournalInputRow(
    group,
    'settings.journals.nameLabel',
    `settings-journals-name-${idx}`,
    journal.name,
    '',
    (v) => {
      journal.name = v;
      title.textContent = v.trim() || t('settings.journals.journalUntitled');
    },
  );
  nameInput.classList.add('settings-journals-name');

  // Regal-Auswahl (kein Regal oder einer der definierten Regal-Namen).
  const shelfSelect = document.createElement('select');
  shelfSelect.id = `settings-journals-shelf-${idx}`;
  shelfSelect.className = 'settings-input';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = t('settings.journals.shelfNone');
  shelfSelect.appendChild(noneOption);
  for (const shelf of values.shelves) {
    const name = String(shelf || '').trim();
    if (name === '') continue;
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    shelfSelect.appendChild(option);
  }
  shelfSelect.value = journal.shelf || '';
  shelfSelect.addEventListener('change', () => {
    journal.shelf = shelfSelect.value || null;
    // Regal-Wechsel verschiebt das Journal in eine andere Detailansicht —
    // neu rendern, damit die aktuelle Ansicht konsistent bleibt.
    renderActiveSection();
  });
  group.appendChild(buildSettingsRow('settings.journals.shelfLabel', shelfSelect));

  // Granularität.
  const granularitySelect = document.createElement('select');
  granularitySelect.id = `settings-journals-granularity-${idx}`;
  granularitySelect.className = 'settings-input';
  for (const granularity of JOURNAL_GRANULARITIES) {
    const option = document.createElement('option');
    option.value = granularity;
    option.textContent = t(`journal.granularity.${granularity}`);
    granularitySelect.appendChild(option);
  }
  granularitySelect.value = journal.granularity;
  group.appendChild(buildSettingsRow('settings.journals.granularityLabel', granularitySelect));

  // Ordner- und Namens-Schema mit Live-Vorschau des Beispiel-Pfads.
  buildJournalInputRow(
    group,
    'settings.journals.folderLabel',
    `settings-journals-folder-${idx}`,
    journal.folderPattern,
    t('settings.journals.folderPlaceholder'),
    (v) => {
      journal.folderPattern = v;
      updateJournalPreview(preview, journal);
      updateSchemaWarning();
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.namePatternLabel',
    `settings-journals-namepattern-${idx}`,
    journal.namePattern,
    t('settings.journals.namePatternPlaceholder'),
    (v) => {
      journal.namePattern = v;
      updateJournalPreview(preview, journal);
      updateSchemaWarning();
    },
  );
  const preview = document.createElement('p');
  preview.className = 'settings-row-hint settings-journals-preview';
  preview.id = `settings-journals-preview-${idx}`;
  group.appendChild(preview);
  updateJournalPreview(preview, journal);
  granularitySelect.addEventListener('change', () => {
    journal.granularity = granularitySelect.value;
    updateJournalPreview(preview, journal);
  });

  // Warnung bei Schema-Änderung eines bestehenden Journals: Dateien werden
  // nicht umbenannt, die Kalender-Punkte folgen dem neuen Schema.
  const schemaWarning = document.createElement('p');
  schemaWarning.className = 'settings-row-hint settings-journals-schema-warning';
  schemaWarning.hidden = true;
  schemaWarning.textContent = t('settings.journals.schemaChangeHint');
  group.appendChild(schemaWarning);
  const updateSchemaWarning = () => {
    const before = snapshotById.get(journal.id);
    schemaWarning.hidden = !(
      before &&
      (before.folderPattern !== String(journal.folderPattern || '').trim() ||
        before.namePattern !== String(journal.namePattern || '').trim())
    );
  };
  updateSchemaWarning();

  // Vorlage aus dem aufgelösten Vorlagen-Ordner (leer = ohne Vorlage);
  // ein konfigurierter, aber nicht (mehr) gelisteter Pfad bleibt wählbar.
  const templateSelect = document.createElement('select');
  templateSelect.id = `settings-journals-template-${idx}`;
  templateSelect.className = 'settings-input';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = t('settings.journals.templateNone');
  templateSelect.appendChild(emptyOption);
  const templateValues = [...values.templatesList];
  if (journal.template && !templateValues.includes(journal.template)) {
    templateValues.unshift(journal.template);
  }
  for (const relPath of templateValues) {
    const option = document.createElement('option');
    option.value = relPath;
    option.textContent = relPath;
    templateSelect.appendChild(option);
  }
  templateSelect.value = journal.template || '';
  templateSelect.addEventListener('change', () => {
    journal.template = templateSelect.value || null;
  });
  group.appendChild(buildSettingsRow('settings.journals.templateLabel', templateSelect));

  // Zeitraum (optional) und Property-Namen.
  buildJournalInputRow(
    group,
    'settings.journals.startLabel',
    `settings-journals-start-${idx}`,
    journal.startDate,
    'JJJJ-MM-TT',
    (v) => {
      journal.startDate = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.endLabel',
    `settings-journals-end-${idx}`,
    journal.endDate,
    'JJJJ-MM-TT',
    (v) => {
      journal.endDate = v;
    },
  );
  // 4T-001405 (Epic 3E-000244): Der Journal-Name ist die vierte Eigenschaft
  // jedes Eintrags; sein Feldname steht vor den drei Datums-Feldnamen, weil er
  // im Frontmatter des Bestands ebenfalls zuerst steht.
  buildJournalInputRow(
    group,
    'settings.journals.namePropLabel',
    `settings-journals-nameprop-${idx}`,
    journal.nameProp,
    DEFAULT_NAME_PROP,
    (v) => {
      journal.nameProp = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.datePropLabel',
    `settings-journals-dateprop-${idx}`,
    journal.dateProp,
    DEFAULT_DATE_PROP,
    (v) => {
      journal.dateProp = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.startPropLabel',
    `settings-journals-startprop-${idx}`,
    journal.startProp,
    DEFAULT_START_PROP,
    (v) => {
      journal.startProp = v;
    },
  );
  buildJournalInputRow(
    group,
    'settings.journals.endPropLabel',
    `settings-journals-endprop-${idx}`,
    journal.endProp,
    DEFAULT_END_PROP,
    (v) => {
      journal.endProp = v;
    },
  );
  container.appendChild(group);
}
