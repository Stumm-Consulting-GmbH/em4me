// 4T-0544 (Epic 3E-0097): Bereich „Kalender-Systeme" — Block-Übersicht,
// Block-Detail, Validierung und Persistenz der calendarSystems-Sektion.
'use strict';

import { normalizeCalendarConfig } from '../../../shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../../shared/calendar/calendar-template.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { buildDerivedCalendarEditor } from './settings-calendar-derived.js';
import { buildCalendarEditor } from './settings-calendar-editor.js';
import {
  calSysDependents,
  calSysIdFromName,
  calSysNormalizedDraft,
  calendarConfigPersistForm,
  calendarPersistForm,
  calendarToDraft,
} from './settings-calendar-model.js';
import { renderActiveSection } from './settings-mount.js';

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
  const templateBtn = document.createElement('button');
  templateBtn.type = 'button';
  templateBtn.id = 'settings-calsys-cal-template';
  templateBtn.className = 'btn settings-calsys-cal-template';
  templateBtn.textContent = t('settings.calendar.calTemplate');
  templateBtn.addEventListener('click', () => {
    // Vorlage lokalisiert über die Kern-Fixture; die id entsteht (eindeutig)
    // erst beim Anwenden, der Entwurf trägt nur Namen und Struktur.
    const template = createGregorianTemplate({
      name: t('settings.calendar.templateName'),
      monthNames: t('settings.calendar.templateMonths').split(','),
      weekdayNames: t('settings.calendar.templateWeekdays').split(','),
      weekName: t('settings.calendar.templateWeek'),
      epochNames: [
        {
          name: t('settings.calendar.templateEpochPast'),
          abbr: t('settings.calendar.templateEpochPast'),
        },
        {
          name: t('settings.calendar.templateEpochFuture'),
          abbr: t('settings.calendar.templateEpochFuture'),
        },
      ],
      levelNames: {
        second: t('settings.calendar.templateLevelSecond'),
        minute: t('settings.calendar.templateLevelMinute'),
        hour: t('settings.calendar.templateLevelHour'),
        day: t('settings.calendar.templateLevelDay'),
        month: t('settings.calendar.templateLevelMonth'),
        year: t('settings.calendar.templateLevelYear'),
      },
      sectionNames: {
        time: t('settings.calendar.templateSectionTime'),
        date: t('settings.calendar.templateSectionDate'),
      },
      groupNames: {
        quarter: t('settings.calendar.templateQuarter'),
        halfYear: t('settings.calendar.templateHalfYear'),
      },
    });
    const normalized = normalizeCalendarConfig({
      blocks: [{ id: 'probe', calendars: [template] }],
    });
    if (!normalized) return;
    const draft = calendarToDraft(normalized.blocks[0].calendars[0]);
    draft.id = '';
    block.calendars.push(draft);
    renderActiveSection();
  });
  // 4T-0747: Anlage einer abgeleiteten Zeitrechnung (kurze Form).
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
  btnRow.append(addBtn, derivedBtn, templateBtn);
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
  intro.textContent = t('settings.calendar.intro').replace('{name}', values.areaName);
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

// 4T-0747: Vergleichs-Form einer Bezugs-Zeitrechnung ohne die Bestandteile,
// die in einer Ableitung nicht durchschlagen (Anzeige-Name und Epochen).
function calSysEffectiveForm(entry) {
  if (!entry) return null;
  const rest = { ...entry };
  delete rest.name;
  delete rest.epochs;
  return JSON.stringify(rest);
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
  // 4T-0747: Bestätigung, wenn eine wirksame Änderung an einer Bezugs-
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
}
