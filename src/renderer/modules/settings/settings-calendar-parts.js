// 4T-0544 (Epic 3E-0097): Bausteine des Kalender-Formulars — Zahlen-Zelle,
// Segment-Zeile, Ebenen-Auswahl, Ebenen-Editor und die Editoren der
// abgeleiteten Gruppierungen.
'use strict';

import { t } from '../../i18n.js';
import { calSysNextId } from './settings-calendar-model.js';
import { renderActiveSection } from './settings-mount.js';

// Beschriftete Zahlen-Eingabe (kompakte Inline-Zelle der Editor-Zeilen).
export function buildCalSysNumCell(labelText, id, value, width, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'settings-calsys-numcell';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.id = id;
  input.className = 'settings-input settings-calsys-num';
  if (width) input.style.width = `${width}px`;
  input.value = value == null ? '' : String(value);
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(span, input);
  return wrap;
}

// Segment-Eingaben (ein Zahlen-Feld je Ebene, beschriftet mit Ebenen-Namen).
export function buildCalSysSegRow(container, labelKey, idBase, segs, levelsForLabels, onChange) {
  const row = document.createElement('div');
  row.className = 'settings-row settings-calsys-segrow';
  const label = document.createElement('label');
  label.textContent = t(labelKey);
  const cells = document.createElement('div');
  cells.className = 'settings-calsys-segcells';
  levelsForLabels.forEach((level, i) => {
    cells.appendChild(
      buildCalSysNumCell(String(level.name || level.id), `${idBase}-${i}`, segs[i], 70, (v) => {
        segs[i] = v;
        onChange();
      }),
    );
  });
  row.append(label, cells);
  container.appendChild(row);
}

// Ebenen-Editor eines Kalenders (kleinste zuerst, Pfeile tauschen Nachbarn).
export function buildCalSysLevelEditor(container, calDraft, level, levelIdx, calIdx, onChange) {
  const box = document.createElement('div');
  box.className = 'settings-calsys-level';
  const head = document.createElement('div');
  head.className = 'settings-calsys-level-head';
  const title = document.createElement('span');
  title.className = 'settings-calsys-level-title';
  title.textContent = t(
    levelIdx === 0 ? 'settings.calendar.levelSmallest' : 'settings.calendar.levelNth',
  ).replace('{n}', String(levelIdx + 1));
  const buttons = document.createElement('span');
  buttons.className = 'settings-calsys-level-buttons';
  const mkMove = (delta, label, titleKey) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn settings-calsys-level-move';
    btn.id = `settings-calsys-level-${calIdx}-${levelIdx}-${delta < 0 ? 'up' : 'down'}`;
    btn.textContent = label;
    btn.title = t(titleKey);
    const target = levelIdx + delta;
    btn.disabled = target < 0 || target >= calDraft.levels.length;
    btn.addEventListener('click', () => {
      const tmp = calDraft.levels[levelIdx];
      calDraft.levels[levelIdx] = calDraft.levels[target];
      calDraft.levels[target] = tmp;
      renderActiveSection();
    });
    return btn;
  };
  // „größer" steht weiter unten in der Liste; ▲ schiebt Richtung kleinste.
  buttons.append(
    mkMove(-1, '▲', 'settings.calendar.levelMoveUp'),
    mkMove(1, '▼', 'settings.calendar.levelMoveDown'),
  );
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-calsys-level-${calIdx}-${levelIdx}-remove`;
  removeBtn.className = 'btn settings-calsys-level-remove';
  removeBtn.textContent = t('settings.calendar.levelRemove');
  removeBtn.addEventListener('click', () => {
    calDraft.levels.splice(levelIdx, 1);
    renderActiveSection();
  });
  buttons.appendChild(removeBtn);
  head.append(title, buttons);
  box.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'settings-calsys-level-grid';
  const nameCell = document.createElement('label');
  nameCell.className = 'settings-calsys-numcell settings-calsys-level-name';
  const nameLabel = document.createElement('span');
  nameLabel.textContent = t('settings.calendar.levelName');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `settings-calsys-level-${calIdx}-${levelIdx}-name`;
  nameInput.className = 'settings-input';
  nameInput.value = level.name;
  nameInput.addEventListener('input', () => {
    level.name = nameInput.value;
    onChange();
  });
  nameCell.append(nameLabel, nameInput);
  const sectionCell = document.createElement('label');
  sectionCell.className = 'settings-calsys-numcell';
  const sectionLabel = document.createElement('span');
  sectionLabel.textContent = t('settings.calendar.levelSection');
  const sectionInput = document.createElement('input');
  sectionInput.type = 'text';
  sectionInput.id = `settings-calsys-level-${calIdx}-${levelIdx}-section`;
  sectionInput.className = 'settings-input';
  sectionInput.value = level.section;
  sectionInput.addEventListener('change', () => {
    level.section = sectionInput.value;
    // Bereichs-Wechsel verschiebt die Zeit/Datum-Grenze → Segment-Felder neu.
    renderActiveSection();
  });
  sectionCell.append(sectionLabel, sectionInput);
  grid.append(
    nameCell,
    sectionCell,
    buildCalSysNumCell(
      t('settings.calendar.levelStart'),
      `settings-calsys-level-${calIdx}-${levelIdx}-start`,
      level.start,
      60,
      (v) => {
        level.start = v;
        onChange();
      },
    ),
  );
  box.appendChild(grid);

  if (levelIdx > 0) {
    const relRow = document.createElement('div');
    relRow.className = 'settings-calsys-level-rel';
    const typeSelect = document.createElement('select');
    typeSelect.id = `settings-calsys-level-${calIdx}-${levelIdx}-type`;
    typeSelect.className = 'settings-input';
    for (const [value, key] of [
      ['factor', 'settings.calendar.relFactor'],
      ['lengths', 'settings.calendar.relLengths'],
      ['leap', 'settings.calendar.relLeap'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = t(key);
      typeSelect.appendChild(option);
    }
    typeSelect.value = level.relType || 'factor';
    if (!level.relType) level.relType = 'factor';
    typeSelect.addEventListener('change', () => {
      level.relType = typeSelect.value;
      renderActiveSection();
    });
    const typeCell = document.createElement('label');
    typeCell.className = 'settings-calsys-numcell settings-calsys-level-type';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = t('settings.calendar.levelRelType');
    typeCell.append(typeLabel, typeSelect);
    relRow.appendChild(typeCell);

    if (level.relType === 'factor') {
      relRow.appendChild(
        buildCalSysNumCell(
          t('settings.calendar.factorCount'),
          `settings-calsys-level-${calIdx}-${levelIdx}-count`,
          level.factorCount,
          70,
          (v) => {
            level.factorCount = v;
            onChange();
          },
        ),
      );
    }
    if (level.relType === 'leap') {
      const below = calDraft.levels[levelIdx - 1];
      if (below && below.relType === 'lengths') {
        const auto = document.createElement('span');
        auto.className = 'settings-calsys-leap-auto';
        auto.textContent = t('settings.calendar.leapCountAuto').replace(
          '{count}',
          String(below.table.length),
        );
        relRow.appendChild(auto);
      } else {
        relRow.appendChild(
          buildCalSysNumCell(
            t('settings.calendar.factorCount'),
            `settings-calsys-level-${calIdx}-${levelIdx}-count`,
            level.leapCount,
            70,
            (v) => {
              level.leapCount = v;
              onChange();
            },
          ),
        );
      }
      relRow.append(
        buildCalSysNumCell(
          t('settings.calendar.leapTarget'),
          `settings-calsys-level-${calIdx}-${levelIdx}-target`,
          level.leapTarget,
          60,
          (v) => {
            level.leapTarget = v;
            onChange();
          },
        ),
        buildCalSysNumCell(
          t('settings.calendar.leapExtra'),
          `settings-calsys-level-${calIdx}-${levelIdx}-extra`,
          level.leapExtra,
          60,
          (v) => {
            level.leapExtra = v;
            onChange();
          },
        ),
      );
    }
    box.appendChild(relRow);

    if (level.relType === 'lengths') {
      const tableBox = document.createElement('div');
      tableBox.className = 'settings-calsys-table';
      level.table.forEach((row, rowIdx) => {
        const tr = document.createElement('div');
        tr.className = 'settings-calsys-table-row';
        const nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.id = `settings-calsys-table-${calIdx}-${levelIdx}-${rowIdx}-name`;
        nameIn.className = 'settings-input';
        nameIn.placeholder = t('settings.calendar.tableName');
        nameIn.value = row.name;
        nameIn.addEventListener('input', () => {
          row.name = nameIn.value;
          onChange();
        });
        tr.appendChild(nameIn);
        tr.appendChild(
          buildCalSysNumCell(
            t('settings.calendar.tableLength'),
            `settings-calsys-table-${calIdx}-${levelIdx}-${rowIdx}-length`,
            row.length,
            70,
            (v) => {
              row.length = v;
              onChange();
            },
          ),
        );
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn settings-calsys-row-remove';
        del.textContent = t('settings.calendar.rowRemove');
        del.addEventListener('click', () => {
          level.table.splice(rowIdx, 1);
          renderActiveSection();
        });
        tr.appendChild(del);
        tableBox.appendChild(tr);
      });
      const addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.id = `settings-calsys-table-${calIdx}-${levelIdx}-add`;
      addRow.className = 'btn settings-calsys-row-add';
      addRow.textContent = t('settings.calendar.tableRowAdd');
      addRow.addEventListener('click', () => {
        level.table.push({ name: '', length: '' });
        renderActiveSection();
      });
      tableBox.appendChild(addRow);
      box.appendChild(tableBox);
    }

    if (level.relType === 'leap') {
      const rulesBox = document.createElement('div');
      rulesBox.className = 'settings-calsys-table';
      level.leapRules.forEach((cycle, ruleIdx) => {
        const tr = document.createElement('div');
        tr.className = 'settings-calsys-table-row';
        tr.appendChild(
          buildCalSysNumCell(
            t(ruleIdx % 2 === 0 ? 'settings.calendar.leapRuleOn' : 'settings.calendar.leapRuleOff'),
            `settings-calsys-leap-${calIdx}-${levelIdx}-${ruleIdx}`,
            cycle,
            70,
            (v) => {
              level.leapRules[ruleIdx] = v;
              onChange();
            },
          ),
        );
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn settings-calsys-row-remove';
        del.textContent = t('settings.calendar.rowRemove');
        del.addEventListener('click', () => {
          level.leapRules.splice(ruleIdx, 1);
          renderActiveSection();
        });
        tr.appendChild(del);
        rulesBox.appendChild(tr);
      });
      const addRule = document.createElement('button');
      addRule.type = 'button';
      addRule.id = `settings-calsys-leap-${calIdx}-${levelIdx}-add`;
      addRule.className = 'btn settings-calsys-row-add';
      addRule.textContent = t('settings.calendar.leapRuleAdd');
      addRule.addEventListener('click', () => {
        level.leapRules.push('');
        renderActiveSection();
      });
      rulesBox.appendChild(addRule);
      box.appendChild(rulesBox);
    }
  }
  container.appendChild(box);
}

// Auswahl-Feld über die Ebenen des Kalenders (für Zyklen und Gruppierungen).
export function buildCalSysLevelSelect(id, calDraft, current, onChange, filter) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  calDraft.levels.forEach((level, i) => {
    if (filter && !filter(level, i)) return;
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = String(level.name || level.id);
    select.appendChild(option);
  });
  if (current) select.value = current;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

// 4T-0544 (Epic 3E-0097): Editoren der abgeleiteten Gruppierungen (etwa
// Quartal) einer Kalender-Definition. Mit 4T-0988 (Epic 3E-0196) aus dem
// Kalender-Editor herausgeloest; der Rumpf ist unveraendert, die vier
// Parameter sind genau die Werte, die er zuvor aus dem umschliessenden
// Gueltigkeitsbereich las.
export function buildCalSysGroupEditors(group, calDraft, calIdx, refresh) {
  const groupsHeading = document.createElement('h4');
  groupsHeading.className = 'settings-export-group-title';
  groupsHeading.textContent = t('settings.calendar.groupsGroup');
  group.appendChild(groupsHeading);
  calDraft.groups.forEach((grp, grpIdx) => {
    const row = document.createElement('div');
    row.className = 'settings-calsys-table-row';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.id = `settings-calsys-group-${calIdx}-${grpIdx}-name`;
    nameIn.className = 'settings-input';
    nameIn.placeholder = t('settings.calendar.groupName');
    nameIn.value = grp.name;
    nameIn.addEventListener('input', () => {
      grp.name = nameIn.value;
      refresh();
    });
    row.appendChild(nameIn);
    const ofCell = document.createElement('label');
    ofCell.className = 'settings-calsys-numcell';
    const ofLabel = document.createElement('span');
    ofLabel.textContent = t('settings.calendar.groupOf');
    ofCell.append(
      ofLabel,
      buildCalSysLevelSelect(
        `settings-calsys-group-${calIdx}-${grpIdx}-of`,
        calDraft,
        grp.of,
        (v) => {
          grp.of = v;
          refresh();
        },
        (_level, i) => i < calDraft.levels.length - 1,
      ),
    );
    row.appendChild(ofCell);
    row.appendChild(
      buildCalSysNumCell(
        t('settings.calendar.groupSize'),
        `settings-calsys-group-${calIdx}-${grpIdx}-size`,
        grp.size,
        60,
        (v) => {
          grp.size = v;
          refresh();
        },
      ),
    );
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn settings-calsys-row-remove';
    del.textContent = t('settings.calendar.rowRemove');
    del.addEventListener('click', () => {
      calDraft.groups.splice(grpIdx, 1);
      renderActiveSection();
    });
    row.appendChild(del);
    group.appendChild(row);
  });
  const groupAdd = document.createElement('button');
  groupAdd.type = 'button';
  groupAdd.id = `settings-calsys-group-add-${calIdx}`;
  groupAdd.className = 'btn settings-calsys-row-add';
  groupAdd.textContent = t('settings.calendar.groupAdd');
  groupAdd.addEventListener('click', () => {
    const taken = new Set(calDraft.groups.map((g) => g.id));
    calDraft.groups.push({
      id: calSysNextId('gruppe', taken),
      name: '',
      of: calDraft.levels.length ? calDraft.levels[0].id : '',
      size: '',
    });
    renderActiveSection();
  });
  group.appendChild(groupAdd);
}
