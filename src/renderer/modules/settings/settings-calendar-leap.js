// 4T-002204 (Epic 3E-000338): Die Eingaben einer Schalt-Ebene im Ebenen-Editor
// der Kalender-Pflege als eigenes Modul.
//
// Herausgeschnitten aus settings-calendar-parts.js, als dessen Zeilen-Budget
// mit dem Feld «Durchläufe der Längen-Tabelle je Instanz» überschritten war.
// Die Ausnahme-Liste des Datei-Größen-Wächters darf nur schrumpfen, der Schnitt
// geht also vor der Anhebung; die Schalt-Ebene ist der passende Gegenstand:
// eine geschlossene Fachlichkeit (Form der Regel, Zahl der Einheiten, Ziel und
// Verlängerung, Teilbarkeits-Kette oder Muster), die allein am Entwurf der
// Ebene und an ihrer Nachbar-Ebene darunter hängt.
//
// Getragen werden die Zeile der Beziehung (Form, Durchläufe beziehungsweise
// Zahl, Ziel, Verlängerung) samt Auskunft und Meldung zum Schalt-Ziel sowie
// die Eingaben der Regel darunter. Der Rahmen des Ebenen-Editors bleibt in
// settings-calendar-parts.js und ruft diese Bausteine nur auf.
'use strict';

import { t } from '../../i18n.js';
import { buildCalSysNumCell } from './settings-calendar-cells.js';
import {
  calSysLeapCount,
  calSysLeapPassesText,
  calSysLeapTargetOutside,
} from './settings-calendar-model.js';
import { renderActiveSection } from './settings-mount.js';

// 4T-002001 (Epic 3E-000307): Auswahl der Form einer Schalt-Regel — nach
// Teilbarkeit (Kette «Schaltung alle … außer alle …») oder nach Muster. Ein
// Wechsel rendert den Bereich neu (Muster des Typ-Wechsels); die Eingaben der
// jeweils anderen Form bleiben im Entwurf stehen.
function buildCalSysLeapModeCell(level, calIdx, levelIdx) {
  const select = document.createElement('select');
  select.id = `settings-calsys-leapmode-${calIdx}-${levelIdx}`;
  select.className = 'settings-input';
  for (const [value, key] of [
    ['rules', 'settings.calendar.leapModeRules'],
    ['pattern', 'settings.calendar.leapModePattern'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = level.leapMode === 'pattern' ? 'pattern' : 'rules';
  select.addEventListener('change', () => {
    level.leapMode = select.value;
    renderActiveSection();
  });
  const cell = document.createElement('label');
  cell.className = 'settings-calsys-numcell settings-calsys-level-type';
  const label = document.createElement('span');
  label.textContent = t('settings.calendar.leapMode');
  cell.append(label, select);
  return cell;
}

// 4T-002001 (Epic 3E-000307): Eingaben des Schaltjahr-Musters — Länge des
// Zyklus und die Plätze der Schaltjahre als Text. Geprüft wird wie überall
// allein über die Kern-Normalisierung (Hinweis-Zeile «ungültig»).
function buildCalSysLeapPattern(box, level, calIdx, levelIdx, onChange) {
  const row = document.createElement('div');
  row.className = 'settings-calsys-level-rel';
  row.append(
    buildCalSysNumCell(
      t('settings.calendar.leapPatternCycle'),
      `settings-calsys-leappattern-cycle-${calIdx}-${levelIdx}`,
      level.leapPatternCycle,
      70,
      (v) => {
        level.leapPatternCycle = v;
        onChange();
      },
    ),
    buildCalSysNumCell(
      t('settings.calendar.leapPatternYears'),
      `settings-calsys-leappattern-years-${calIdx}-${levelIdx}`,
      level.leapPatternYears,
      320,
      (v) => {
        level.leapPatternYears = v;
        onChange();
      },
    ),
  );
  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.id = `settings-calsys-leappattern-hint-${calIdx}-${levelIdx}`;
  hint.textContent = t('settings.calendar.leapPatternHint');
  box.append(row, hint);
}

// Zeile der Beziehung einer Schalt-Ebene: Form der Regel, Durchläufe (über
// einer Längen-Tabelle) beziehungsweise Zahl der Einheiten, Schalt-Ziel und
// Verlängerung. Liefert die Meldungs-Zeile zum Schalt-Ziel; der Aufrufer hängt
// sie unter die Zeile.
export function buildCalSysLeapRow(relRow, calDraft, level, levelIdx, calIdx, onChange) {
  relRow.appendChild(buildCalSysLeapModeCell(level, calIdx, levelIdx));
  // 4T-002204 (Epic 3E-000338): Meldung an der Schalt-Ebene, wenn das
  // Schalt-Ziel nicht innerhalb der Positionen liegt. Sie nennt den Grund,
  // den sonst nur die allgemeine Hinweis-Zeile «ungültig» trüge; das
  // Anwenden sperrt weiterhin die Kern-Normalisierung. Nachgeführt wird sie
  // bei jeder Eingabe, die Ziel oder Zahl verändert.
  const outsideHint = document.createElement('p');
  outsideHint.className = 'settings-row-hint settings-calsys-invalid';
  outsideHint.id = `settings-calsys-level-${calIdx}-${levelIdx}-target-outside`;
  const below = calDraft.levels[levelIdx - 1];
  let auto = null;
  const refreshLeap = () => {
    const count = calSysLeapCount(calDraft, levelIdx);
    if (auto) {
      auto.hidden = count === null;
      auto.textContent = t('settings.calendar.leapCountAuto').replace('{count}', String(count));
    }
    const outside = calSysLeapTargetOutside(calDraft, levelIdx);
    outsideHint.hidden = !outside;
    outsideHint.textContent = outside
      ? t('settings.calendar.leapTargetOutside')
          .replace('{target}', String(outside.target))
          .replaceAll('{count}', String(outside.count))
      : '';
  };
  if (below && below.relType === 'lengths') {
    // 4T-002204: Feld «Durchläufe der Längen-Tabelle je Instanz»; die
    // Auskunft daneben nennt das Ergebnis (Durchläufe mal Zeilen).
    relRow.appendChild(
      buildCalSysNumCell(
        t('settings.calendar.leapPasses'),
        `settings-calsys-level-${calIdx}-${levelIdx}-passes`,
        calSysLeapPassesText(level),
        60,
        (v) => {
          level.leapPasses = v;
          refreshLeap();
          onChange();
        },
      ),
    );
    auto = document.createElement('span');
    auto.className = 'settings-calsys-leap-auto';
    auto.id = `settings-calsys-level-${calIdx}-${levelIdx}-count-auto`;
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
          refreshLeap();
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
        refreshLeap();
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
  refreshLeap();
  return outsideHint;
}

// Eingaben der Schalt-Regel unter der Zeile der Beziehung: das Muster oder die
// Teilbarkeits-Kette («Schaltung alle …», «außer alle …») mit Zeilen zum
// Entfernen und Hinzufügen.
export function buildCalSysLeapRules(box, level, calIdx, levelIdx, onChange) {
  if (level.leapMode === 'pattern') {
    buildCalSysLeapPattern(box, level, calIdx, levelIdx, onChange);
    return;
  }
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
