// 4T-000544 (Epic 3E-000097): Editor eines Kalenders im Block-Detail
// (Ebenen, Epochen, Zyklen, Gruppierungen, Achsen-Abbildung, Vorschau).
'use strict';

import { cycleAt, formatTuple, parseCanonical } from '../../../shared/calendar/calendar-core.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  calSysDateLevels,
  calSysDependents,
  calSysNextId,
  calSysNormalizedDraft,
  calSysSyncSegs,
} from './settings-calendar-model.js';
import {
  buildCalSysGroupEditors,
  buildCalSysLevelEditor,
  buildCalSysLevelSelect,
  buildCalSysNumCell,
  buildCalSysSegRow,
} from './settings-calendar-parts.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow } from './settings-shared.js';

// Kalender-Editor (Formular-Gruppe eines Kalenders im Block-Detail).
export function buildCalendarEditor(container, block, calDraft, calIdx) {
  const group = document.createElement('div');
  group.className = 'settings-calsys-cal';
  const head = document.createElement('div');
  head.className = 'settings-journals-journal-head';
  const title = document.createElement('h5');
  title.className = 'settings-journals-journal-title';
  title.textContent = String(calDraft.name || '').trim() || t('settings.calendar.calUntitled');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-calsys-cal-remove-${calIdx}`;
  removeBtn.className = 'btn settings-calsys-cal-remove';
  removeBtn.textContent = t('settings.calendar.calRemove');
  removeBtn.addEventListener('click', () => {
    // 4T-000747: Löschsperre, solange Ableitungen auf diesem Kalender stehen.
    const dependents = calSysDependents(block, calDraft);
    if (dependents.length > 0) {
      api.calendarBlockedDelete(dependents);
      return;
    }
    block.calendars.splice(calIdx, 1);
    renderActiveSection();
  });
  head.append(title, removeBtn);
  group.appendChild(head);

  // 4T-000747: Dauerhafter Hinweis auf die Abhängigen, damit vor einer
  // Änderung sichtbar ist, dass sie mitwandern.
  const dependents = calSysDependents(block, calDraft);
  if (dependents.length > 0) {
    const dep = document.createElement('p');
    dep.className = 'settings-row-hint';
    dep.id = `settings-calsys-cal-dependents-${calIdx}`;
    dep.textContent = t('settings.calendar.derivedHint')
      .replace('{count}', String(dependents.length))
      .replace('{names}', dependents.join(', '));
    group.appendChild(dep);
  }

  // Weiche Validierung: Hinweis-Zeile pro Kalender, gespeist aus der
  // Kern-Normalisierung; die Vorschau nutzt denselben Normalisierungs-Stand.
  const hint = document.createElement('p');
  hint.className = 'settings-row-hint settings-calsys-invalid';
  hint.id = `settings-calsys-cal-invalid-${calIdx}`;
  const previewOut = document.createElement('p');
  previewOut.className = 'settings-row-hint settings-calsys-preview';
  previewOut.id = `settings-calsys-preview-${calIdx}`;
  const refresh = () => {
    const normalized = calSysNormalizedDraft(calDraft, block);
    hint.hidden = !!normalized;
    hint.textContent = normalized ? '' : t('settings.calendar.invalidHint');
    if (!normalized) {
      previewOut.textContent = t('settings.calendar.previewUnavailable');
      previewOut.classList.add('settings-calsys-preview-error');
      return;
    }
    const parsed = parseCanonical(normalized, calDraft.previewInput);
    if (!parsed.ok) {
      previewOut.textContent = t('settings.calendar.previewInvalidValue');
      previewOut.classList.add('settings-calsys-preview-error');
      return;
    }
    previewOut.classList.remove('settings-calsys-preview-error');
    let text = t('settings.calendar.previewOk')
      .replace('{canonical}', formatTuple(normalized, parsed.tuple) || '')
      .replace('{named}', formatTuple(normalized, parsed.tuple, { named: true }) || '');
    const cycle = normalized.cycles.length > 0 ? cycleAt(normalized, parsed.tuple) : null;
    if (cycle && cycle.positionName) {
      text += t('settings.calendar.previewCycle')
        .replace('{name}', cycle.name)
        .replace('{position}', cycle.positionName);
    }
    previewOut.textContent = text;
  };

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `settings-calsys-cal-name-${calIdx}`;
  nameInput.className = 'settings-input';
  nameInput.value = calDraft.name;
  nameInput.addEventListener('input', () => {
    calDraft.name = nameInput.value;
    title.textContent = nameInput.value.trim() || t('settings.calendar.calUntitled');
  });
  group.appendChild(buildSettingsRow('settings.calendar.calNameLabel', nameInput));
  group.appendChild(hint);

  // Ebenen (kleinste zuerst).
  const levelsHeading = document.createElement('h4');
  levelsHeading.className = 'settings-export-group-title';
  levelsHeading.textContent = t('settings.calendar.levelsGroup');
  group.appendChild(levelsHeading);
  calDraft.levels.forEach((level, levelIdx) => {
    buildCalSysLevelEditor(group, calDraft, level, levelIdx, calIdx, refresh);
  });
  const levelAdd = document.createElement('button');
  levelAdd.type = 'button';
  levelAdd.id = `settings-calsys-level-add-${calIdx}`;
  levelAdd.className = 'btn settings-calsys-row-add';
  levelAdd.textContent = t('settings.calendar.levelAdd');
  levelAdd.addEventListener('click', () => {
    const taken = new Set(calDraft.levels.map((l) => l.id));
    calDraft.levels.push({
      id: calSysNextId('ebene', taken),
      name: '',
      section: calDraft.levels.length ? calDraft.levels[calDraft.levels.length - 1].section : '',
      start: '1',
      relType: 'factor',
      factorCount: '',
      table: [],
      leapCount: '',
      leapRules: [],
      leapTarget: '',
      leapExtra: '',
    });
    renderActiveSection();
  });
  group.appendChild(levelAdd);

  const dateLevels = calSysDateLevels(calDraft.levels);

  // Epochen (konstruktiv nahtlos: nur Start-Daten, Ende = nächster Start).
  const epochsHeading = document.createElement('h4');
  epochsHeading.className = 'settings-export-group-title';
  epochsHeading.textContent = t('settings.calendar.epochsGroup');
  group.appendChild(epochsHeading);
  const epochHint = document.createElement('p');
  epochHint.className = 'settings-row-hint';
  epochHint.textContent = t('settings.calendar.epochSeamlessHint');
  group.appendChild(epochHint);
  calDraft.epochs.forEach((epoch, epochIdx) => {
    const box = document.createElement('div');
    box.className = 'settings-calsys-level';
    const headRow = document.createElement('div');
    headRow.className = 'settings-calsys-level-head';
    const label = document.createElement('span');
    label.className = 'settings-calsys-level-title';
    label.textContent =
      epochIdx === 0
        ? t('settings.calendar.epochPast')
        : t('settings.calendar.epochNth').replace('{n}', String(epochIdx + 1));
    headRow.appendChild(label);
    if (epochIdx > 0) {
      const del = document.createElement('button');
      del.type = 'button';
      del.id = `settings-calsys-epoch-remove-${calIdx}-${epochIdx}`;
      del.className = 'btn settings-calsys-row-remove';
      del.textContent = t('settings.calendar.rowRemove');
      del.addEventListener('click', () => {
        calDraft.epochs.splice(epochIdx, 1);
        renderActiveSection();
      });
      headRow.appendChild(del);
    }
    box.appendChild(headRow);
    const grid = document.createElement('div');
    grid.className = 'settings-calsys-level-grid';
    const nameCell = document.createElement('label');
    nameCell.className = 'settings-calsys-numcell settings-calsys-level-name';
    const nameLabel = document.createElement('span');
    nameLabel.textContent = t('settings.calendar.epochName');
    const epochName = document.createElement('input');
    epochName.type = 'text';
    epochName.id = `settings-calsys-epoch-${calIdx}-${epochIdx}-name`;
    epochName.className = 'settings-input';
    epochName.value = epoch.name;
    epochName.addEventListener('input', () => {
      epoch.name = epochName.value;
      refresh();
    });
    nameCell.append(nameLabel, epochName);
    const abbrCell = document.createElement('label');
    abbrCell.className = 'settings-calsys-numcell';
    const abbrLabel = document.createElement('span');
    abbrLabel.textContent = t('settings.calendar.epochAbbr');
    const abbrInput = document.createElement('input');
    abbrInput.type = 'text';
    abbrInput.id = `settings-calsys-epoch-${calIdx}-${epochIdx}-abbr`;
    abbrInput.className = 'settings-input settings-calsys-abbr';
    abbrInput.value = epoch.abbr;
    abbrInput.addEventListener('input', () => {
      epoch.abbr = abbrInput.value;
      refresh();
    });
    abbrCell.append(abbrLabel, abbrInput);
    grid.append(nameCell, abbrCell);
    box.appendChild(grid);
    if (epochIdx > 0) {
      epoch.startSegs = calSysSyncSegs(epoch.startSegs, dateLevels.length);
      buildCalSysSegRow(
        box,
        'settings.calendar.epochStart',
        `settings-calsys-epoch-${calIdx}-${epochIdx}-start`,
        epoch.startSegs,
        dateLevels,
        refresh,
      );
    }
    group.appendChild(box);
  });
  const epochAdd = document.createElement('button');
  epochAdd.type = 'button';
  epochAdd.id = `settings-calsys-epoch-add-${calIdx}`;
  epochAdd.className = 'btn settings-calsys-row-add';
  epochAdd.textContent = t('settings.calendar.epochAdd');
  epochAdd.addEventListener('click', () => {
    calDraft.epochs.push({ name: '', abbr: '', startSegs: [] });
    renderActiveSection();
  });
  group.appendChild(epochAdd);

  // Eigenständige Zyklen (Woche).
  const cyclesHeading = document.createElement('h4');
  cyclesHeading.className = 'settings-export-group-title';
  cyclesHeading.textContent = t('settings.calendar.cyclesGroup');
  group.appendChild(cyclesHeading);
  calDraft.cycles.forEach((cycle, cycleIdx) => {
    const box = document.createElement('div');
    box.className = 'settings-calsys-level';
    const headRow = document.createElement('div');
    headRow.className = 'settings-calsys-level-head';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.id = `settings-calsys-cycle-${calIdx}-${cycleIdx}-name`;
    nameIn.className = 'settings-input';
    nameIn.placeholder = t('settings.calendar.cycleName');
    nameIn.value = cycle.name;
    nameIn.addEventListener('input', () => {
      cycle.name = nameIn.value;
      refresh();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.id = `settings-calsys-cycle-remove-${calIdx}-${cycleIdx}`;
    del.className = 'btn settings-calsys-row-remove';
    del.textContent = t('settings.calendar.rowRemove');
    del.addEventListener('click', () => {
      calDraft.cycles.splice(cycleIdx, 1);
      renderActiveSection();
    });
    headRow.append(nameIn, del);
    box.appendChild(headRow);
    const relRow = document.createElement('div');
    relRow.className = 'settings-calsys-level-rel';
    const ofCell = document.createElement('label');
    ofCell.className = 'settings-calsys-numcell';
    const ofLabel = document.createElement('span');
    ofLabel.textContent = t('settings.calendar.cycleOf');
    ofCell.append(
      ofLabel,
      buildCalSysLevelSelect(
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-of`,
        calDraft,
        cycle.of,
        (v) => {
          cycle.of = v;
          refresh();
        },
      ),
    );
    relRow.append(
      ofCell,
      buildCalSysNumCell(
        t('settings.calendar.cycleLength'),
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-length`,
        cycle.length,
        60,
        (v) => {
          cycle.length = v;
          refresh();
        },
      ),
      buildCalSysNumCell(
        t('settings.calendar.cycleAnchorPosition'),
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-position`,
        cycle.anchorPosition,
        60,
        (v) => {
          cycle.anchorPosition = v;
          refresh();
        },
      ),
      buildCalSysNumCell(
        t('settings.calendar.cycleRule'),
        `settings-calsys-cycle-${calIdx}-${cycleIdx}-rule`,
        cycle.ruleIndex,
        60,
        (v) => {
          cycle.ruleIndex = v;
          refresh();
        },
      ),
    );
    box.appendChild(relRow);
    cycle.anchorSegs = calSysSyncSegs(cycle.anchorSegs, dateLevels.length);
    buildCalSysSegRow(
      box,
      'settings.calendar.cycleAnchorDate',
      `settings-calsys-cycle-${calIdx}-${cycleIdx}-anchor`,
      cycle.anchorSegs,
      dateLevels,
      refresh,
    );
    const namesIn = document.createElement('input');
    namesIn.type = 'text';
    namesIn.id = `settings-calsys-cycle-${calIdx}-${cycleIdx}-names`;
    namesIn.className = 'settings-input';
    namesIn.value = cycle.namesText;
    namesIn.addEventListener('input', () => {
      cycle.namesText = namesIn.value;
      refresh();
    });
    box.appendChild(buildSettingsRow('settings.calendar.cycleNames', namesIn));
    group.appendChild(box);
  });
  const cycleAdd = document.createElement('button');
  cycleAdd.type = 'button';
  cycleAdd.id = `settings-calsys-cycle-add-${calIdx}`;
  cycleAdd.className = 'btn settings-calsys-row-add';
  cycleAdd.textContent = t('settings.calendar.cycleAdd');
  cycleAdd.addEventListener('click', () => {
    const taken = new Set(calDraft.cycles.map((c) => c.id));
    calDraft.cycles.push({
      id: calSysNextId('zyklus', taken),
      name: '',
      of: calDraft.levels.length ? calDraft.levels[0].id : '',
      length: '',
      namesText: '',
      anchorSegs: [],
      anchorPosition: '1',
      ruleIndex: '',
    });
    renderActiveSection();
  });
  group.appendChild(cycleAdd);

  // Abgeleitete Gruppierungen (Quartal).
  buildCalSysGroupEditors(group, calDraft, calIdx, refresh);

  // Block-Achsen-Abbildung (Anker plus Skala).
  const axisHeading = document.createElement('h4');
  axisHeading.className = 'settings-export-group-title';
  axisHeading.textContent = t('settings.calendar.axisGroup');
  group.appendChild(axisHeading);
  const axisHint = document.createElement('p');
  axisHint.className = 'settings-row-hint';
  axisHint.textContent = t('settings.calendar.axisHint');
  group.appendChild(axisHint);
  const allLevelsDesc = calDraft.levels.slice().reverse();
  calDraft.anchorSegs = calSysSyncSegs(calDraft.anchorSegs, calDraft.levels.length);
  buildCalSysSegRow(
    group,
    'settings.calendar.axisAnchor',
    `settings-calsys-anchor-${calIdx}`,
    calDraft.anchorSegs,
    allLevelsDesc,
    refresh,
  );
  const scaleRow = document.createElement('div');
  scaleRow.className = 'settings-calsys-level-rel';
  scaleRow.append(
    buildCalSysNumCell(
      t('settings.calendar.axisScaleNum'),
      `settings-calsys-scale-num-${calIdx}`,
      calDraft.scaleNum,
      70,
      (v) => {
        calDraft.scaleNum = v;
        refresh();
      },
    ),
    buildCalSysNumCell(
      t('settings.calendar.axisScaleDen'),
      `settings-calsys-scale-den-${calIdx}`,
      calDraft.scaleDen,
      70,
      (v) => {
        calDraft.scaleDen = v;
        refresh();
      },
    ),
  );
  group.appendChild(scaleRow);

  // Live-Vorschau (Beispiel-Wert, kanonisch eingegeben).
  const previewHeading = document.createElement('h4');
  previewHeading.className = 'settings-export-group-title';
  previewHeading.textContent = t('settings.calendar.previewGroup');
  group.appendChild(previewHeading);
  const previewIn = document.createElement('input');
  previewIn.type = 'text';
  previewIn.id = `settings-calsys-preview-input-${calIdx}`;
  previewIn.className = 'settings-input';
  previewIn.value = calDraft.previewInput;
  previewIn.addEventListener('input', () => {
    calDraft.previewInput = previewIn.value;
    refresh();
  });
  group.appendChild(buildSettingsRow('settings.calendar.previewInput', previewIn));
  group.appendChild(previewOut);

  refresh();
  container.appendChild(group);
}
