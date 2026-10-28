// 4T-000544 (Epic 3E-000097): Bausteine des Kalender-Formulars — Ebenen-Auswahl,
// Ebenen-Editor und die Editoren der abgeleiteten Gruppierungen. Seit
// 4T-002204 (Epic 3E-000338) stehen die beschrifteten Zellen und die
// Segment-Zeile in settings-calendar-cells.js, die Eingaben einer Schalt-Ebene
// in settings-calendar-leap.js.
'use strict';

import { t } from '../../i18n.js';
import {
  buildCalSysNameCell,
  buildCalSysNumCell,
  buildCalSysPluralInput,
} from './settings-calendar-cells.js';
import { buildCalSysLeapRow, buildCalSysLeapRules } from './settings-calendar-leap.js';
import {
  calSysBeyondNameAt,
  calSysIsYearlyType,
  calSysNextId,
  calSysTakeOverNames,
} from './settings-calendar-model.js';
import { renderActiveSection } from './settings-mount.js';

// Ebenen-Editor eines Kalenders (kleinste zuerst, Pfeile tauschen Nachbarn).
export function buildCalSysLevelEditor(container, calDraft, level, levelIdx, calIdx, onChange) {
  const box = document.createElement('div');
  box.className = 'settings-calsys-level';
  // 4T-002363 (Epic 3E-000333): Monat und Jahr einer Jahres-Struktur folgen
  // ihrer Regel oder Tafel und sind schreibgeschützt; Name und Mehrzahl bleiben
  // bearbeitbar. Keine Ebene wandert an ihre Stelle oder über sie hinweg.
  const locked = (lv) => !!lv && calSysIsYearlyType(lv.relType);
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
    btn.disabled =
      target < 0 ||
      target >= calDraft.levels.length ||
      locked(level) ||
      locked(calDraft.levels[target]);
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
  removeBtn.disabled = locked(level);
  removeBtn.addEventListener('click', () => {
    calDraft.levels.splice(levelIdx, 1);
    renderActiveSection();
  });
  buttons.appendChild(removeBtn);
  head.append(title, buttons);
  box.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'settings-calsys-level-grid';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `settings-calsys-level-${calIdx}-${levelIdx}-name`;
  nameInput.className = 'settings-input';
  nameInput.value = level.name;
  nameInput.addEventListener('input', () => {
    level.name = nameInput.value;
    onChange();
  });
  // 4T-001863 (Epic 3E-000307): Mehrzahl neben der Einzahl; der Kurzhinweis
  // erklärt, wann welche Form erscheint.
  const pluralInput = buildCalSysPluralInput(
    `settings-calsys-level-${calIdx}-${levelIdx}-plural`,
    level,
    onChange,
  );
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
    buildCalSysNameCell('settings.calendar.levelName', nameInput),
    buildCalSysNameCell('settings.calendar.levelNamePlural', pluralInput),
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
  if (locked(level)) {
    // Bereich und Anfangswert tragen die Kennung des Monats und die Jahres-Zahl.
    sectionInput.disabled = true;
    const start = grid.querySelector(`#settings-calsys-level-${calIdx}-${levelIdx}-start`);
    if (start) start.disabled = true;
    const rel = document.createElement('p');
    rel.className = 'settings-row-hint settings-calsys-level-yearly';
    rel.id = `settings-calsys-level-${calIdx}-${levelIdx}-yearly`;
    const source = level.yearlyRel || {};
    rel.textContent =
      level.relType === 'byYear'
        ? t('settings.calendar.relByYear')
        : t(
            source.rule ? 'settings.calendar.relYearlyRule' : 'settings.calendar.relYearlyTable',
          ).replace('{name}', String(source.rule || source.table || ''));
    box.appendChild(rel);
    container.appendChild(box);
    return;
  }

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
      // 4T-002066 (Epic 3E-000307): Durchgetragene Positions-Namen werden beim
      // Wechsel auf die Längen-Tabelle zu deren Zeilen, statt verloren zu gehen.
      calSysTakeOverNames(level);
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
    // 4T-002204 (Epic 3E-000338): Die Eingaben der Schalt-Ebene stehen in
    // settings-calendar-leap.js; die Meldung zum Schalt-Ziel kommt unter die Zeile.
    const leapHint =
      level.relType === 'leap'
        ? buildCalSysLeapRow(relRow, calDraft, level, levelIdx, calIdx, onChange)
        : null;
    box.appendChild(relRow);
    if (leapHint) box.appendChild(leapHint);

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
        // 4T-002204 (Epic 3E-000338): Die neue Zeile belegt die nächste
        // Position; trägt der Entwurf für sie einen Namen ohne Feld durch,
        // übernimmt sie ihn, statt ihn zu verdecken. Die Zahl der Einheiten
        // an der Schalt-Ebene folgt über die Durchläufe von selbst.
        level.table.push({ name: calSysBeyondNameAt(level, level.table.length), length: '' });
        renderActiveSection();
      });
      tableBox.appendChild(addRow);
      box.appendChild(tableBox);
    }

    if (level.relType === 'leap') buildCalSysLeapRules(box, level, calIdx, levelIdx, onChange);
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

// 4T-000544 (Epic 3E-000097): Editoren der abgeleiteten Gruppierungen (etwa
// Quartal) einer Kalender-Definition. Mit 4T-000988 (Epic 3E-000196) aus dem
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
    // 4T-001863: eigene Klasse, damit die beschriftete Zeile umbrechen darf.
    row.className = 'settings-calsys-table-row settings-calsys-group-row';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.id = `settings-calsys-group-${calIdx}-${grpIdx}-name`;
    nameIn.className = 'settings-input';
    nameIn.value = grp.name;
    nameIn.addEventListener('input', () => {
      grp.name = nameIn.value;
      refresh();
    });
    // 4T-001863 (Epic 3E-000307): Mehrzahl neben dem Gruppierungs-Namen, beide
    // sichtbar beschriftet wie an den Ebenen statt nur über den Platzhalter.
    const pluralIn = buildCalSysPluralInput(
      `settings-calsys-group-${calIdx}-${grpIdx}-plural`,
      grp,
      refresh,
    );
    row.append(
      buildCalSysNameCell('settings.calendar.groupName', nameIn),
      buildCalSysNameCell('settings.calendar.groupNamePlural', pluralIn),
    );
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
      namePlural: '',
      of: calDraft.levels.length ? calDraft.levels[0].id : '',
      size: '',
    });
    renderActiveSection();
  });
  group.appendChild(groupAdd);
}
