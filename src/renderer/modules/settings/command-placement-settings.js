// 4T-000520 (Epic 3E-000094): Bereich „Kommando-Platzierung" der Einstellungs-
// Seite (erweiterungs-gebunden über settingsSections der Erweiterung
// command-placement; dynamische Registrierung nach dem Muster
// panel-order-settings.js).
//
// 4T-001581 (Epic 3E-000283, E4a): Der Bereich heißt für den Anwender seit der
// Entscheidung des Product Owners vom 2026-09-14 **„Kontextmenü und Makros"**
// und trägt nur noch diese beiden Blöcke. Die zwei statusleisten-eigenen Blöcke
// — die eigenen Kommando-Schaltflächen und die Ausblend-Liste der Standard-
// Schaltflächen — stehen jetzt im Bereich „Statusleiste"
// (`statusbar-settings.js`). Die Bereichs-KENNUNG bleibt `commandPlacement`,
// weil die Erweiterung sie über `settingsSections` beansprucht und eine
// Umbenennung den Anspruch ins Leere laufen ließe; ebenso bleibt der alte
// Titel-Schlüssel `settings.commandPlacement.title` als verwaister Schlüssel
// stehen (Gleichheits-Wächter der fünf Sprachdateien).
//
// Inhalt: die nutzerdefinierte Editor-Kontextmenü-Sektion (4T-000521) und der
// Makro-Editor (4T-000522). Entwurf-/Anwenden-Logik wie der Bereich
// „Panel-Reihenfolge"; die Wirkung übernimmt setCommandPlacement
// (command-placement.js), das an alle Fenster broadcastet.
//
// **Dieses Modul persistiert `draft.commandPlacement` für BEIDE Bereiche.** Der
// Bereich „Statusleiste" schreibt in dasselbe Entwurfs-Feld, bringt dafür aber
// bewusst keinen eigenen apply-/dirty-Hook mit — zwei Hooks auf einem Feld
// schrieben doppelt (Muster historyArea/templatesArea in `settings-page.js`).
// Ist die Erweiterung abgeschaltet, ist dieser Bereich aus
// `settingsSections()` gefiltert; dann rendert der Bereich „Statusleiste" die
// beiden umgezogenen Blöcke ebenfalls nicht, und das Entwurfs-Feld entsteht
// nicht — es gibt also nichts zu persistieren.
//
// Die gemeinsamen Editor-Bausteine (Anlage-Dialog, Listen-Editor, Ausblend-
// Liste, Klein-Bausteine) liegen in `command-placement-editors.js`.
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { registerSettingsSection } from './settings-page.js';
import { getCommandPlacement, setCommandPlacement } from '../command-placement.js';
import { normalizeCommandPlacement } from '../../../shared/commands/command-placement.js';
import { COMMAND_ICONS, DEFAULT_COMMAND_ICON } from '../../../shared/commands/command-icons.js';
import { COMMANDS } from '../../../shared/commands/commands.js';
import {
  buildEntryListEditor,
  ensureCommandPlacementDraft,
  hint,
  registriereCommandPlacementWurzel,
  showPlacementEntryDialog,
  subtitle,
  symbolButton,
} from './command-placement-editors.js';
// 4T-000522: Testlauf-Knopf des Makro-Editors (führt den Entwurfs-Stand aus).
import { runMacro } from '../macros.js';

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Makro-Editor (4T-000522) ------------------------------------------------------

// Aufgeklapptes Makro (Schritt-Liste sichtbar); Modul-Zustand überlebt
// das Re-Rendern des Bereichs.
let expandedMacroId = null;

function macroStepCommandLabel(step) {
  const cmd = COMMANDS.find((c) => c.id === step.commandId);
  if (cmd) return t(cmd.labelKey);
  return `${step.commandId} (${t('settings.commandPlacement.missingCommand')})`;
}

function generateMacroId(macros) {
  let n = 1;
  while (macros.some((m) => m.id === `m${n}`)) n++;
  return `m${n}`;
}

function buildMacroStepsEditor(container, draft, macro, rerender) {
  const stepsBox = document.createElement('div');
  stepsBox.className = 'command-placement-steps';
  stepsBox.dataset.macroId = macro.id;
  macro.steps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'sidebar-settings-row command-placement-step-row';
    const label = document.createElement('span');
    label.className = 'sidebar-settings-label';
    if (step.type === 'delay') {
      label.textContent = t('settings.commandPlacement.delayStep');
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'settings-input command-placement-delay-input';
      input.min = '0';
      input.max = '10';
      input.step = '0.5';
      input.value = String(step.seconds);
      input.title = t('settings.commandPlacement.delaySeconds');
      input.setAttribute('aria-label', t('settings.commandPlacement.delaySeconds'));
      input.addEventListener('change', () => {
        const v = Number(input.value);
        step.seconds = Number.isFinite(v) ? Math.min(10, Math.max(0, v)) : 1;
        input.value = String(step.seconds);
        refreshSettingsButtons();
      });
      row.append(label, input);
      const unit = document.createElement('span');
      unit.textContent = 's';
      row.appendChild(unit);
    } else {
      label.textContent = macroStepCommandLabel(step);
      row.appendChild(label);
    }
    const actions = document.createElement('span');
    actions.className = 'sidebar-settings-actions';
    const move = (delta) => {
      const next = [...macro.steps];
      const target = idx + delta;
      [next[idx], next[target]] = [next[target], next[idx]];
      macro.steps = next;
      rerender();
    };
    actions.appendChild(
      symbolButton('macro-step-up', '↑', 'settings.commandPlacement.moveUp', idx === 0, () =>
        move(-1),
      ),
    );
    actions.appendChild(
      symbolButton(
        'macro-step-down',
        '↓',
        'settings.commandPlacement.moveDown',
        idx === macro.steps.length - 1,
        () => move(1),
      ),
    );
    actions.appendChild(
      symbolButton('macro-step-remove', '✕', 'settings.commandPlacement.remove', false, () => {
        const next = [...macro.steps];
        next.splice(idx, 1);
        macro.steps = next;
        rerender();
      }),
    );
    row.appendChild(actions);
    stepsBox.appendChild(row);
  });

  const addRow = document.createElement('div');
  addRow.className = 'sidebar-settings-reset-row';
  const addCommandBtn = document.createElement('button');
  addCommandBtn.type = 'button';
  addCommandBtn.className = 'btn macro-add-command';
  addCommandBtn.textContent = t('settings.commandPlacement.addCommandStep');
  addCommandBtn.addEventListener('click', () => {
    void showPlacementEntryDialog({
      titleKey: 'commandPlacement.dialog.addMacroStepTitle',
      withIcon: false,
      withName: false,
    }).then((result) => {
      if (!result) return;
      macro.steps = [...macro.steps, { type: 'command', commandId: result.commandId }];
      rerender();
      refreshSettingsButtons();
    });
  });
  const addDelayBtn = document.createElement('button');
  addDelayBtn.type = 'button';
  addDelayBtn.className = 'btn macro-add-delay';
  addDelayBtn.textContent = t('settings.commandPlacement.addDelayStep');
  addDelayBtn.addEventListener('click', () => {
    macro.steps = [...macro.steps, { type: 'delay', seconds: 1 }];
    rerender();
    refreshSettingsButtons();
  });
  addRow.append(addCommandBtn, addDelayBtn);
  stepsBox.appendChild(addRow);
  container.appendChild(stepsBox);
}

function buildMacroEditor(body, draft, rerender) {
  const macros = draft.commandPlacement.macros;
  const list = document.createElement('div');
  list.className = 'sidebar-settings-list command-placement-macro-list';
  macros.forEach((macro, idx) => {
    const row = document.createElement('div');
    row.className = 'sidebar-settings-row command-placement-row command-placement-macro-row';
    row.dataset.macroId = macro.id;
    const expanded = expandedMacroId === macro.id;
    row.appendChild(
      symbolButton(
        'macro-toggle',
        expanded ? '▾' : '▸',
        expanded ? 'settings.commandPlacement.collapse' : 'settings.commandPlacement.expand',
        false,
        () => {
          expandedMacroId = expanded ? null : macro.id;
          rerender();
        },
      ),
    );
    const iconSpan = document.createElement('span');
    iconSpan.className = 'command-placement-row-icon';
    iconSpan.innerHTML = COMMAND_ICONS[macro.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON];
    row.appendChild(iconSpan);
    const label = document.createElement('span');
    label.className = 'sidebar-settings-label';
    label.textContent = macro.name;
    row.appendChild(label);
    const actions = document.createElement('span');
    actions.className = 'sidebar-settings-actions';
    // Testlauf des Entwurfs-Stands: Schritte und Sub-Makros lösen gegen
    // die Entwurfs-Liste auf; die Ausführung läuft im aktuellen Kontext
    // (Einstellungs-Tab ist ein System-Tab — kontextpflichtige Schritte
    // brechen dann mit dem regulären Hinweis ab, das ist der Zweck).
    actions.appendChild(
      symbolButton('macro-test', '▶', 'settings.commandPlacement.testRun', false, () => {
        void runMacro(macro, { macros });
      }),
    );
    actions.appendChild(
      symbolButton('macro-edit', '✎', 'settings.commandPlacement.edit', false, () => {
        void showPlacementEntryDialog({
          titleKey: 'commandPlacement.dialog.editMacroTitle',
          withCommand: false,
          requireName: true,
          nameLabelKey: 'commandPlacement.dialog.macroNameLabel',
          initial: { icon: macro.icon, label: macro.name },
        }).then((result) => {
          if (!result) return;
          const next = [...macros];
          next[idx] = { ...macro, icon: result.icon, name: result.label };
          draft.commandPlacement.macros = next;
          rerender();
          refreshSettingsButtons();
        });
      }),
    );
    actions.appendChild(
      symbolButton('macro-remove', '✕', 'settings.commandPlacement.remove', false, () => {
        const next = [...macros];
        next.splice(idx, 1);
        draft.commandPlacement.macros = next;
        if (expandedMacroId === macro.id) expandedMacroId = null;
        rerender();
      }),
    );
    row.appendChild(actions);
    list.appendChild(row);
    if (expanded) buildMacroStepsEditor(list, draft, macro, rerender);
  });
  body.appendChild(list);

  const addRow = document.createElement('div');
  addRow.className = 'sidebar-settings-reset-row';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn';
  addBtn.id = 'btn-command-placement-add-macro';
  addBtn.textContent = t('settings.commandPlacement.addMacro');
  addBtn.addEventListener('click', () => {
    void showPlacementEntryDialog({
      titleKey: 'commandPlacement.dialog.addMacroTitle',
      withCommand: false,
      requireName: true,
      nameLabelKey: 'commandPlacement.dialog.macroNameLabel',
    }).then((result) => {
      if (!result) return;
      const id = generateMacroId(draft.commandPlacement.macros);
      draft.commandPlacement.macros = [
        ...draft.commandPlacement.macros,
        { id, name: result.label, icon: result.icon, steps: [] },
      ];
      expandedMacroId = id;
      rerender();
      refreshSettingsButtons();
    });
  });
  addRow.appendChild(addBtn);
  body.appendChild(addRow);
}

// --- Bereichs-Definition ---------------------------------------------------------

function buildInto(body, draft, rerender) {
  // 4T-000521: nutzerdefinierte Kontextmenü-Sektion, gleicher Anlage-Flow und
  // gleiches Datenmodell wie die Statusbar-Liste, eigene Reihenfolge.
  body.appendChild(subtitle('settings.commandPlacement.contextMenuTitle'));
  body.appendChild(hint('settings.commandPlacement.contextMenuHint'));
  buildEntryListEditor(body, draft, rerender, {
    listKey: 'contextMenu',
    addTitleKey: 'commandPlacement.dialog.addContextMenuTitle',
    editTitleKey: 'commandPlacement.dialog.editContextMenuTitle',
    testId: 'contextmenu',
  });
  // 4T-000522: Makro-Editor — Makro-Liste mit aufklappbarer Schritt-Liste,
  // Testlauf-Knopf und Anlage über den Dialog (Name Pflicht, Icon).
  body.appendChild(subtitle('settings.commandPlacement.macrosTitle'));
  body.appendChild(hint('settings.commandPlacement.macrosHint'));
  buildMacroEditor(body, draft, rerender);
}

function renderCommandPlacementSection(container, draft) {
  ensureCommandPlacementDraft(draft);
  const root = document.createElement('div');
  root.className = 'command-placement-settings';
  container.appendChild(root);
  const rerender = () => {
    root.innerHTML = '';
    buildInto(root, draft, rerender);
  };
  registriereCommandPlacementWurzel(root, rerender);
  rerender();
}

// Persistiert den Entwurf; setCommandPlacement normalisiert, wendet auf
// Segment und Hide-Liste an und broadcastet. Danach den Entwurf auf den
// wirksamen Stand ziehen (Muster applyPanelOrderSection).
//
// 4T-001581: Der Hook persistiert auch, was der Bereich „Statusleiste" in
// dasselbe Entwurfs-Feld geschrieben hat (siehe Kopf-Kommentar).
async function applyCommandPlacementSection(draft) {
  if (!draft.commandPlacement) return;
  await setCommandPlacement(draft.commandPlacement);
  draft.commandPlacement = getCommandPlacement();
}

// Spiegelt applyCommandPlacementSection: normalisierter Entwurf gegen den
// wirksamen Stand.
function dirtyCommandPlacementSection(draft) {
  if (!draft.commandPlacement) return false;
  return !jsonEqual(normalizeCommandPlacement(draft.commandPlacement), getCommandPlacement());
}

registerSettingsSection({
  id: 'commandPlacement',
  titleKey: 'settings.commandPlacement.restTitle',
  render: renderCommandPlacementSection,
  apply: applyCommandPlacementSection,
  dirty: dirtyCommandPlacementSection,
});
