// 4T-000544 (Epic 3E-000097): Bereich „Kalender-Systeme" — Block-Übersicht,
// Block-Detail, Validierung und Persistenz der calendarSystems-Sektion.
'use strict';

import { normalizeCalendarConfig } from '../../../shared/calendar/calendar-config.js';
import {
  CALENDAR_TEMPLATES,
  findCalendarTemplate,
} from '../../../shared/calendar/calendar-templates.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { buildDerivedCalendarEditor } from './settings-calendar-derived.js';
import { buildCalendarEditor } from './settings-calendar-editor.js';
import { pruefeEpochenSchutz, sichereEpochenWerte } from './settings-calendar-epoch-guard.js';
import {
  calSysDependents,
  calSysIdFromName,
  calSysNormalizedDraft,
  calendarConfigPersistForm,
  calendarPersistForm,
  calendarToDraft,
} from './settings-calendar-model.js';
import { renderActiveSection } from './settings-mount.js';
import { kontextSchluessel } from './settings-kontext.js';

// Übersicht: Block-Zeilen (Name, Kalender-Zähler, Öffnen, Entfernen) plus
// „Block hinzufügen" (Muster Journal-Regale).
function renderCalendarBlocksOverview(container, values) {
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.calendar.blocksGroup');
  container.appendChild(heading);

  values.blocks.forEach((block, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-calsys-block';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `settings-calsys-block-name-${idx}`;
    input.className = 'settings-input';
    input.placeholder = t('settings.calendar.blockPlaceholder');
    input.value = block.name;
    input.addEventListener('input', () => {
      block.name = input.value;
    });
    const count = document.createElement('span');
    count.className = 'settings-calsys-block-count';
    count.textContent = t('settings.calendar.blockCount').replace(
      '{count}',
      String(block.calendars.length),
    );
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.id = `settings-calsys-block-open-${idx}`;
    openBtn.className = 'btn settings-calsys-block-open';
    openBtn.textContent = t('settings.calendar.blockOpen');
    openBtn.addEventListener('click', () => {
      values.openBlock = idx;
      renderActiveSection();
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = `settings-calsys-block-remove-${idx}`;
    removeBtn.className = 'btn settings-calsys-block-remove';
    removeBtn.textContent = t('settings.calendar.blockRemove');
    removeBtn.addEventListener('click', () => {
      values.blocks.splice(idx, 1);
      renderActiveSection();
    });
    row.append(input, count, openBtn, removeBtn);
    container.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'settings-calsys-block-add';
  addBtn.className = 'btn settings-calsys-block-add';
  addBtn.textContent = t('settings.calendar.blockAdd');
  addBtn.addEventListener('click', () => {
    values.blocks.push({ id: '', name: '', calendars: [] });
    renderActiveSection();
  });
  container.appendChild(addBtn);
}

// 4T-001997 (Epic 3E-000307): Name einer eingefügten Vorlage, der im Entwurf
// noch frei ist. Verglichen wird wie in validateCalendarSection — ohne
// Groß-/Kleinschreibung und über alle Blöcke —, damit zweimaliges Einfügen
// zwei unterscheidbare Zeitrechnungen ergibt statt einer Sperre beim Anwenden:
// «Gregorianischer Kalender», dann «Gregorianischer Kalender 2», «… 3».
export function calSysFreeTemplateName(values, baseName) {
  const taken = new Set();
  for (const block of values.blocks) {
    for (const calDraft of block.calendars) {
      taken.add(
        String(calDraft.name || '')
          .trim()
          .toLowerCase(),
      );
    }
  }
  const base = String(baseName || '').trim();
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

// 4T-001997 (Epic 3E-000307): Vorlage der Sammlung in den geöffneten Block
// einfügen. Die Definition entsteht lokalisiert über die Fabrik des Eintrags;
// die id entsteht (eindeutig) erst beim Anwenden, der Entwurf trägt nur Namen
// und Struktur. false, wenn die Normalisierung die Definition verwirft.
function insertCalendarTemplate(values, block, entry) {
  const normalized = normalizeCalendarConfig({
    blocks: [{ id: 'probe', calendars: [{ id: entry.id, ...entry.create(t) }] }],
  });
  if (!normalized || normalized.blocks[0].calendars.length === 0) return false;
  const draft = calendarToDraft(normalized.blocks[0].calendars[0]);
  draft.id = '';
  draft.name = calSysFreeTemplateName(values, draft.name);
  block.calendars.push(draft);
  return true;
}

function renderCalendarBlockDetail(container, values) {
  const block = values.blocks[values.openBlock];
  if (!block) {
    values.openBlock = null;
    renderCalendarBlocksOverview(container, values);
    return;
  }
  const head = document.createElement('div');
  head.className = 'settings-journals-detail-head';
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title settings-journals-detail-title';
  heading.textContent = t('settings.calendar.blockDetailTitle').replace(
    '{name}',
    String(block.name || '').trim() || t('settings.calendar.calUntitled'),
  );
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'settings-calsys-block-close';
  closeBtn.className = 'btn settings-calsys-block-close';
  closeBtn.textContent = t('settings.calendar.blockClose');
  closeBtn.addEventListener('click', () => {
    values.openBlock = null;
    renderActiveSection();
  });
  head.append(heading, closeBtn);
  container.appendChild(head);

  if (block.calendars.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-row-hint';
    empty.textContent = t('settings.calendar.blockEmpty');
    container.appendChild(empty);
  }
  block.calendars.forEach((calDraft, calIdx) => {
    if (calDraft.derived) buildDerivedCalendarEditor(container, block, calDraft, calIdx);
    else buildCalendarEditor(container, block, calDraft, calIdx);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'settings-calsys-cal-add';
  addBtn.className = 'btn settings-calsys-cal-add';
  addBtn.textContent = t('settings.calendar.calAdd');
  addBtn.addEventListener('click', () => {
    block.calendars.push({
      id: '',
      name: '',
      levels: [
        {
          id: 'ebene-1',
          name: '',
          namePlural: '',
          section: '',
          start: '1',
          relType: '',
          factorCount: '',
          table: [],
          leapCount: '',
          leapRules: [],
          leapTarget: '',
          leapExtra: '',
        },
      ],
      cycles: [],
      groups: [],
      epochs: [
        { name: '', abbr: '', startSegs: null },
        { name: '', abbr: '', startSegs: ['1'] },
      ],
      anchorSegs: [],
      scaleNum: '',
      scaleDen: '',
      previewInput: '',
    });
    renderActiveSection();
  });
  // 4T-001997 (Epic 3E-000307): Aufklapp-Menü der mitgelieferten Vorlagen an
  // der Stelle des früheren Vorlage-Knopfes. Es zeigt nur gelieferte Vorlagen
  // in der Reihenfolge der Sammlung; die Auswahl legt die Zeitrechnung sofort
  // an, danach steht das Menü wieder auf dem ersten Eintrag.
  const templateSelect = document.createElement('select');
  templateSelect.id = 'settings-calsys-cal-template';
  templateSelect.className = 'settings-select settings-calsys-cal-template';
  const templateMenuLabel = t('settings.calendar.templateMenu');
  templateSelect.setAttribute('aria-label', templateMenuLabel);
  const addTemplateOption = (value, label) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    templateSelect.appendChild(opt);
  };
  addTemplateOption('', templateMenuLabel);
  CALENDAR_TEMPLATES.forEach((entry) => addTemplateOption(entry.id, t(entry.nameKey)));
  templateSelect.value = '';
  templateSelect.addEventListener('change', () => {
    const entry = findCalendarTemplate(templateSelect.value);
    templateSelect.value = '';
    if (!entry || !insertCalendarTemplate(values, block, entry)) return;
    renderActiveSection();
  });
  // 4T-000747: Anlage einer abgeleiteten Zeitrechnung (kurze Form).
  const derivedBtn = document.createElement('button');
  derivedBtn.type = 'button';
  derivedBtn.id = 'settings-calsys-derived-add';
  derivedBtn.className = 'btn settings-calsys-derived-add';
  derivedBtn.textContent = t('settings.calendar.derivedAdd');
  derivedBtn.addEventListener('click', () => {
    block.calendars.push({
      id: '',
      name: '',
      derived: {
        fromId: '',
        zeroSegs: [],
        depth: '',
        labelBefore: t('settings.calendar.derivedDefaultBefore'),
        labelAfter: t('settings.calendar.derivedDefaultAfter'),
      },
      previewInput: '',
    });
    renderActiveSection();
  });
  const btnRow = document.createElement('div');
  btnRow.className = 'settings-calsys-detail-buttons';
  btnRow.append(addBtn, derivedBtn, templateSelect);
  container.appendChild(btnRow);
}

export function renderCalendarSection(container, draft) {
  const values = draft.calendar;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.calendar.loading');
    container.appendChild(loading);
    return;
  }
  if (!values.hasArea) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.id = 'settings-calsys-no-area';
    hint.textContent = t('settings.calendar.noArea');
    container.appendChild(hint);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  // 4T-001885 (Epic 3E-000189): Die Beschriftung nennt Buch bzw. Bücherregal
  // statt Bereich, sobald das Fenster an eines gebunden ist. Der eingesetzte
  // NAME bleibt derselbe wie bisher — geändert ist die Bezeichnung, nicht der
  // Name (Story 4S-000994, AK12).
  intro.textContent = t(
    kontextSchluessel({
      area: 'settings.calendar.intro',
      book: 'settings.calendar.introBook',
      shelf: 'settings.calendar.introShelf',
    }),
  ).replace('{name}', values.areaName);
  container.appendChild(intro);
  if (values.openBlock === null || values.openBlock === undefined) {
    renderCalendarBlocksOverview(container, values);
  } else {
    renderCalendarBlockDetail(container, values);
  }
}

// Harte Validierung beim Anwenden: Block-/Kalender-Namen, Eindeutigkeit der
// Kalender-Namen (Bezugsname der Wert-Syntax) und Kern-Normalisierung pro
// Kalender (ein abgelehnter Kalender blockiert mit konkretem Hinweis).
export function validateCalendarSection(draft) {
  const values = draft.calendar;
  if (!values || !values.hasArea) return null;
  const seenNames = new Set();
  for (const block of values.blocks) {
    const blockName = String(block.name || '').trim();
    if (blockName === '') return t('settings.calendar.error.blockName');
    for (const calDraft of block.calendars) {
      const calName = String(calDraft.name || '').trim();
      if (calName === '') {
        return t('settings.calendar.error.calName').replace('{block}', blockName);
      }
      const lower = calName.toLowerCase();
      if (seenNames.has(lower)) {
        return t('settings.calendar.error.duplicateName').replace('{name}', calName);
      }
      seenNames.add(lower);
      if (calDraft.derived && String(calDraft.derived.fromId || '').trim() === '') {
        return t('settings.calendar.error.derivedBase').replace('{name}', calName);
      }
      if (!calSysNormalizedDraft(calDraft, block)) {
        return t('settings.calendar.error.calInvalid')
          .replace('{name}', calName)
          .replace('{block}', blockName);
      }
    }
  }
  return null;
}

// 4T-000747: Vergleichs-Form einer Bezugs-Zeitrechnung ohne die Bestandteile,
// die in einer Ableitung nicht durchschlagen (Anzeige-Name und Epochen).
// 4T-001863 (Epic 3E-000307): Die Mehrzahl eines Einheiten-Namens verschiebt
// keinen Wert und bleibt deshalb außen vor — wer seinen Zeitrechnungen die
// Mehrzahl nachträgt, soll keine Warnung vor verschobenen Werten bekommen.
// 4T-001999 (Epic 3E-000307): Ebenso das Kennzeichen alwaysWriteEpoch — die
// Ableitung übernimmt es nicht, es verschiebt also keinen ihrer Werte.
// 4T-002065 (Epic 3E-000307): Dasselbe gilt für jede Benennung — Name und
// Positions-Namen einer Ebene, eines Zyklus oder einer Gruppierung. Der Wert
// einer Ableitung ist eine Zählung ab dem Nullpunkt; Namen gehen in keine
// Umrechnung ein, sie sind Anzeige. In der Ablage-Form tragen die Schlüssel
// name, namePlural und names auf keiner Ebene eine rechnende Angabe (Ebenen
// und Zyklen hängen über id und of zusammen), deshalb genügt der Ersetzer über
// den Schlüssel-Namen. Der Ebenen-Bereich (section) bleibt im Vergleich: Er
// trennt Datums- und Zeit-Teil und bestimmt damit die Gestalt eines Werts.
const CAL_SYS_LABEL_KEYS = new Set(['name', 'namePlural', 'names']);

function calSysEffectiveForm(entry) {
  if (!entry) return null;
  const rest = { ...entry };
  delete rest.name;
  delete rest.epochs;
  delete rest.alwaysWriteEpoch;
  return JSON.stringify(rest, (key, value) => (CAL_SYS_LABEL_KEYS.has(key) ? undefined : value));
}

// Namen der Ableitungen, deren Werte sich durch eine wirksame Änderung an
// ihrer Bezugs-Zeitrechnung verschieben würden.
function calSysAffectedDependents(values, snapshot) {
  const snapBlocks = (snapshot && snapshot.blocks) || [];
  const out = [];
  for (const block of values.blocks) {
    const snapBlock = snapBlocks.find((b) => b.id === block.id) || null;
    for (const calDraft of block.calendars) {
      if (calDraft.derived) continue;
      const dependents = calSysDependents(block, calDraft);
      if (dependents.length === 0) continue;
      const before = snapBlock
        ? snapBlock.calendars.find((c) => c.id === calDraft.id) || null
        : null;
      // Ein neu angelegter Bezug hat noch keine Werte in Dokumenten.
      if (!before) continue;
      if (calSysEffectiveForm(before) !== calSysEffectiveForm(calendarPersistForm(calDraft))) {
        out.push(...dependents);
      }
    }
  }
  return [...new Set(out)];
}

export async function applyCalendarSection(draft) {
  const values = draft.calendar;
  if (!values || !values.hasArea) return;
  // Neue Blöcke/Kalender erhalten ihre stabile id erst jetzt (Slug aus dem
  // Namen, Muster Journale).
  const takenBlocks = new Set(values.blocks.map((b) => b.id).filter(Boolean));
  for (const block of values.blocks) {
    if (!String(block.id || '').trim()) {
      block.id = calSysIdFromName(block.name, 'block', takenBlocks);
      takenBlocks.add(block.id);
    }
    const takenCals = new Set(block.calendars.map((c) => c.id).filter(Boolean));
    for (const calDraft of block.calendars) {
      if (!String(calDraft.id || '').trim()) {
        calDraft.id = calSysIdFromName(calDraft.name, 'kalender', takenCals);
        takenCals.add(calDraft.id);
      }
    }
  }
  const out = calendarConfigPersistForm(values);
  if (JSON.stringify(out) === JSON.stringify(draft.calendarSnapshot)) return;
  // 4T-000747: Bestätigung, wenn eine wirksame Änderung an einer Bezugs-
  // Zeitrechnung auch die Werte ihrer Ableitungen verschiebt.
  const affected = calSysAffectedDependents(values, draft.calendarSnapshot);
  if (affected.length > 0) {
    let confirmed;
    try {
      confirmed = await api.calendarConfirmDependents(affected);
    } catch {
      confirmed = false;
    }
    if (!confirmed) return;
  }
  // 4T-002003 (Epic 3E-000307): Bekommt eine Zeitrechnung eine neue jüngste
  // Epoche, würden gespeicherte Werte danach einen anderen Tag bezeichnen oder
  // ungültig werden. Rückfrage VOR dem Speichern; gesichert wird erst, wenn das
  // Speichern gelungen ist (Begründung in settings-calendar-epoch-guard.js).
  // Ließ sich gar nicht prüfen, wird nicht still abgebrochen, sondern gesagt,
  // dass die Änderung nicht angewendet wurde.
  const alt = draft.calendarSnapshot;
  const schutz = await pruefeEpochenSchutz(alt, out);
  if (schutz.antwort === 'abbrechen') {
    if (schutz.fehler) {
      showStatusbarHint(null, {
        text: t('settings.calendar.epochGuard.failed'),
        error: true,
        duration: 4000,
      });
    }
    return;
  }
  let result;
  try {
    result = await api.calendarSetAreaConfig(out);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
    showStatusbarHint(null, {
      text: t('settings.calendar.areaWriteFailed'),
      error: true,
      duration: 4000,
    });
    return;
  }
  draft.calendarSnapshot = out;
  if (schutz.antwort === 'sichern') await sichereEpochenWerte(alt, out, schutz.erste);
}
