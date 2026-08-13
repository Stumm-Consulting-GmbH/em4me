// 4T-0520 (Epic 3E-0094): Bereich „Kommando-Platzierung" der Einstellungs-
// Seite (erweiterungs-gebunden über settingsSections der Erweiterung
// command-placement; dynamische Registrierung nach dem Muster
// panel-order-settings.js).
//
// Inhalt: Liste der eigenen Statusbar-Kommando-Buttons (Anlage über den
// Drei-Schritt-Dialog: Kommando per Filter-Suche, Icon aus dem kuratierten
// Raster, optionaler Anzeigename; Hoch/Runter, Bearbeiten, Entfernen)
// und die Hide-Liste der Standard-Statusbar-Elemente mit Zurücksetzen-
// Knopf. Entwurf-/Anwenden-Logik wie der Bereich „Panel-Reihenfolge";
// die Wirkung übernimmt setCommandPlacement (command-placement.js), das
// an alle Fenster broadcastet. Die Kontextmenü-Liste (4T-0521) und der
// Makro-Editor (4T-0522) docken als weitere Sektionen an.
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { registerSettingsSection } from './settings-page.js';
import { getCommandPlacement, setCommandPlacement } from '../command-placement.js';
import {
  STATUSBAR_HIDE_TARGETS,
  normalizeCommandPlacement,
} from '../../../shared/commands/command-placement.js';
import {
  COMMAND_ICONS,
  COMMAND_ICON_IDS,
  DEFAULT_COMMAND_ICON,
} from '../../../shared/commands/command-icons.js';
import { COMMANDS, COMMAND_CATEGORIES } from '../../../shared/commands/commands.js';
import { disabledCommandIdSet } from '../../../shared/extensions/extensions-core.js';
import { filterCommandEntries } from '../../../shared/commands/command-palette-filter.js';
import { getDisabledExtensionIds } from '../extensions/extension-lifecycle.js';
// 4T-0522: Testlauf-Knopf des Makro-Editors (führt den Entwurfs-Stand aus).
import { runMacro } from '../macros.js';

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Entwurf lazy anlegen (Muster ensureDraft in panel-order-settings.js).
function ensureDraft(draft) {
  if (!draft.commandPlacement) draft.commandPlacement = getCommandPlacement();
  return draft.commandPlacement;
}

// Referenzen des zuletzt gerenderten Bereichs: eine Änderung aus einem
// anderen Fenster (Broadcast) zieht den offenen Entwurf auf den neuen
// Ist-Stand nach; noch nicht angewendete Bereichs-Änderungen werden dabei
// bewusst verworfen (Muster panel-order-settings.js).
let lastDraft = null;
let lastBody = null;
let lastRerender = null;

document.addEventListener('scg:command-placement-changed', () => {
  if (!lastDraft || !lastDraft.commandPlacement) return;
  lastDraft.commandPlacement = getCommandPlacement();
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  refreshSettingsButtons();
});

function symbolButton(className, symbol, titleKey, disabled, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn sidebar-settings-btn ' + className;
  btn.textContent = symbol;
  btn.title = t(titleKey);
  btn.setAttribute('aria-label', t(titleKey));
  btn.disabled = !!disabled;
  if (!disabled) btn.addEventListener('click', onClick);
  return btn;
}

function subtitle(key) {
  const h = document.createElement('h4');
  h.className = 'settings-extensions-group-title';
  h.textContent = t(key);
  return h;
}

function hint(key) {
  const p = document.createElement('p');
  p.className = 'sidebar-settings-hint';
  p.textContent = t(key);
  return p;
}

// Anzeige-Label eines Eintrags: eigener Anzeigename, sonst das
// lokalisierte Kommando-Label; für nicht (mehr) registrierte Kommandos
// die rohe ID plus Hinweis (Eintrag bleibt pflegbar).
function entryDisplayLabel(entry) {
  const cmd = COMMANDS.find((c) => c.id === entry.commandId);
  if (entry.label) return entry.label;
  if (cmd) return t(cmd.labelKey);
  return `${entry.commandId} (${t('settings.commandPlacement.missingCommand')})`;
}

// --- Drei-Schritt-Dialog ---------------------------------------------------------

// Kommando-Kandidaten für die Dialog-Suche: alle Registry-Kommandos in
// Kategorie-Gruppen (Muster buildPaletteEntries), ohne die Kommandos
// deaktivierter Erweiterungen. Anders als die Palette bleibt
// app.commandPalette wählbar (als platzierter Button ist es kein No-op)
// und die Kontext-Verfügbarkeit spielt keine Rolle (gewählt wird eine
// dauerhafte Zuordnung, kein Aufruf).
function buildDialogCommandEntries() {
  const disabled = disabledCommandIdSet(getDisabledExtensionIds());
  const entries = [];
  for (const categoryKey of COMMAND_CATEGORIES) {
    for (const cmd of COMMANDS) {
      if (cmd.categoryKey !== categoryKey) continue;
      if (disabled.has(cmd.id)) continue;
      entries.push({ id: cmd.id, label: t(cmd.labelKey), group: t(categoryKey) });
    }
  }
  return entries;
}

// Zeigt den Anlage-/Bearbeitungs-Dialog (statisches Modal in index.html).
// options: titleKey (Dialog-Titel), initial (Vorbelegung beim Bearbeiten),
// withCommand/withIcon/withName (Schritt-Container ein-/ausblenden — der
// Makro-Kopf aus 4T-0522 braucht z.B. kein Kommando, der Kommando-Schritt
// weder Icon noch Name), requireName + nameLabelKey (Makro-Name als
// Pflichtfeld). Liefert den Eintrag { commandId, icon, label } oder null
// bei Abbruch.
export function showPlacementEntryDialog(options = {}) {
  const {
    titleKey,
    initial = null,
    withCommand = true,
    withIcon = true,
    withName = true,
    requireName = false,
    nameLabelKey = 'commandPlacement.dialog.nameLabel',
  } = options;
  const modal = document.getElementById('command-placement-modal');
  const titleEl = document.getElementById('command-placement-modal-title');
  const commandStep = document.getElementById('command-placement-step-command');
  const filterInput = document.getElementById('command-placement-filter');
  const commandList = document.getElementById('command-placement-command-list');
  const iconStep = document.getElementById('command-placement-step-icon');
  const iconGrid = document.getElementById('command-placement-icon-grid');
  const nameStep = document.getElementById('command-placement-step-name');
  const nameLabel = document.getElementById('command-placement-name-label');
  const nameInput = document.getElementById('command-placement-name');
  const btnCancel = document.getElementById('btn-command-placement-cancel');
  const btnOk = document.getElementById('btn-command-placement-ok');
  if (!modal || modal.hidden === false) return Promise.resolve(null);

  let selectedCommandId = initial ? initial.commandId : null;
  let selectedIcon = initial && initial.icon ? initial.icon : DEFAULT_COMMAND_ICON;
  const allEntries = withCommand ? buildDialogCommandEntries() : [];

  titleEl.textContent = t(titleKey);
  commandStep.hidden = !withCommand;
  iconStep.hidden = !withIcon;
  nameStep.hidden = !withName;
  nameLabel.textContent = t(nameLabelKey);
  filterInput.value = '';
  filterInput.placeholder = t('commandPlacement.dialog.filterPlaceholder');
  nameInput.value = initial && initial.label ? initial.label : '';
  nameInput.placeholder = '';

  return new Promise((resolve) => {
    const refreshOkState = () => {
      btnOk.disabled =
        (withCommand && !selectedCommandId) || (requireName && nameInput.value.trim() === '');
    };

    const renderCommandList = () => {
      const visible = filterCommandEntries(allEntries, filterInput.value);
      commandList.innerHTML = '';
      let lastGroup = null;
      for (const entry of visible) {
        if (entry.group !== lastGroup && entry.group !== '') {
          const groupLi = document.createElement('li');
          groupLi.className = 'template-picker-group';
          groupLi.textContent = entry.group;
          commandList.appendChild(groupLi);
        }
        lastGroup = entry.group;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'command-palette-item';
        btn.classList.toggle('active', entry.id === selectedCommandId);
        btn.dataset.commandId = entry.id;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'command-palette-name';
        nameSpan.textContent = entry.label;
        btn.appendChild(nameSpan);
        btn.addEventListener('click', () => {
          selectedCommandId = entry.id;
          commandList
            .querySelectorAll('button')
            .forEach((b) => b.classList.toggle('active', b.dataset.commandId === entry.id));
          refreshOkState();
        });
        li.appendChild(btn);
        commandList.appendChild(li);
      }
      if (visible.length === 0) {
        const li = document.createElement('li');
        li.className = 'template-picker-empty';
        li.textContent = t('commandPalette.noMatch');
        commandList.appendChild(li);
      }
    };

    const renderIconGrid = () => {
      iconGrid.innerHTML = '';
      for (const iconId of COMMAND_ICON_IDS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-toggle btn-icon command-placement-icon-choice';
        btn.classList.toggle('active', iconId === selectedIcon);
        btn.dataset.iconId = iconId;
        btn.innerHTML = COMMAND_ICONS[iconId];
        btn.addEventListener('click', () => {
          selectedIcon = iconId;
          iconGrid
            .querySelectorAll('button')
            .forEach((b) => b.classList.toggle('active', b.dataset.iconId === iconId));
        });
        iconGrid.appendChild(btn);
      }
    };

    const finish = (result) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      filterInput.removeEventListener('input', renderCommandList);
      nameInput.removeEventListener('input', refreshOkState);
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
      backdrop.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onCancel = () => finish(null);
    const onOk = () => {
      if (withCommand && !selectedCommandId) return;
      const label = nameInput.value.trim();
      finish({
        commandId: withCommand ? selectedCommandId : null,
        icon: selectedIcon,
        label: label === '' ? null : label,
      });
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    renderCommandList();
    renderIconGrid();
    refreshOkState();
    modal.addEventListener('keydown', onKeydown, true);
    filterInput.addEventListener('input', renderCommandList);
    nameInput.addEventListener('input', refreshOkState);
    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => (withCommand ? filterInput : nameInput).focus(), 0);
  });
}

// --- Eintrag-Listen-Editor -------------------------------------------------------

// Gemeinsame Listen-Komponente für Statusbar-Buttons (dieser Task) und
// Kontextmenü-Einträge (4T-0521): listKey benennt das Entwurfs-Feld
// ('statusbar' oder 'contextMenu'), die Dialog-Titel kommen pro Liste.
function buildEntryListEditor(body, draft, rerender, opts) {
  const { listKey, addTitleKey, editTitleKey, testId } = opts;
  const entries = draft.commandPlacement[listKey];
  const list = document.createElement('div');
  list.className = 'sidebar-settings-list command-placement-list';
  list.dataset.placementList = testId;
  entries.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'sidebar-settings-row command-placement-row';
    row.dataset.commandId = entry.commandId;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'command-placement-row-icon';
    iconSpan.innerHTML = COMMAND_ICONS[entry.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON];
    row.appendChild(iconSpan);
    const label = document.createElement('span');
    label.className = 'sidebar-settings-label';
    label.textContent = entryDisplayLabel(entry);
    row.appendChild(label);
    const actions = document.createElement('span');
    actions.className = 'sidebar-settings-actions';
    const move = (delta) => {
      const next = [...entries];
      const target = idx + delta;
      [next[idx], next[target]] = [next[target], next[idx]];
      draft.commandPlacement[listKey] = next;
      rerender();
    };
    actions.appendChild(
      symbolButton('command-placement-up', '↑', 'settings.commandPlacement.moveUp', idx === 0, () =>
        move(-1),
      ),
    );
    actions.appendChild(
      symbolButton(
        'command-placement-down',
        '↓',
        'settings.commandPlacement.moveDown',
        idx === entries.length - 1,
        () => move(1),
      ),
    );
    actions.appendChild(
      symbolButton('command-placement-edit', '✎', 'settings.commandPlacement.edit', false, () => {
        void showPlacementEntryDialog({ titleKey: editTitleKey, initial: entry }).then((result) => {
          if (!result) return;
          const next = [...draft.commandPlacement[listKey]];
          next[idx] = result;
          draft.commandPlacement[listKey] = next;
          rerender();
          refreshSettingsButtons();
        });
      }),
    );
    actions.appendChild(
      symbolButton(
        'command-placement-remove',
        '✕',
        'settings.commandPlacement.remove',
        false,
        () => {
          const next = [...entries];
          next.splice(idx, 1);
          draft.commandPlacement[listKey] = next;
          rerender();
        },
      ),
    );
    row.appendChild(actions);
    list.appendChild(row);
  });
  body.appendChild(list);

  const addRow = document.createElement('div');
  addRow.className = 'sidebar-settings-reset-row';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn';
  addBtn.id = `btn-command-placement-add-${testId}`;
  addBtn.textContent = t('settings.commandPlacement.addEntry');
  addBtn.addEventListener('click', () => {
    void showPlacementEntryDialog({ titleKey: addTitleKey }).then((result) => {
      if (!result) return;
      draft.commandPlacement[listKey] = [...draft.commandPlacement[listKey], result];
      rerender();
      refreshSettingsButtons();
    });
  });
  addRow.appendChild(addBtn);
  body.appendChild(addRow);
}

// --- Makro-Editor (4T-0522) ------------------------------------------------------

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

// --- Hide-Liste ------------------------------------------------------------------

function buildHideListEditor(body, draft, rerender) {
  const hiddenSet = new Set(draft.commandPlacement.hiddenButtons);
  const list = document.createElement('div');
  list.className = 'command-placement-hide-list';
  for (const target of STATUSBAR_HIDE_TARGETS) {
    const row = document.createElement('label');
    row.className = 'command-placement-hide-row';
    row.dataset.hideKey = target.key;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    // Checkbox-Semantik „sichtbar": abwählen blendet aus (Muster der
    // Ansichts-Optionen; die Persistenz speichert die Ausgeblendeten).
    checkbox.checked = !hiddenSet.has(target.key);
    checkbox.addEventListener('change', () => {
      const next = new Set(draft.commandPlacement.hiddenButtons);
      if (checkbox.checked) next.delete(target.key);
      else next.add(target.key);
      // Reihenfolge der Modell-Liste beibehalten (stabile Persistenz).
      draft.commandPlacement.hiddenButtons = STATUSBAR_HIDE_TARGETS.filter((t2) =>
        next.has(t2.key),
      ).map((t2) => t2.key);
      refreshSettingsButtons();
    });
    const labelSpan = document.createElement('span');
    labelSpan.textContent = t(target.labelKey);
    row.append(checkbox, labelSpan);
    list.appendChild(row);
  }
  body.appendChild(list);

  const resetRow = document.createElement('div');
  resetRow.className = 'sidebar-settings-reset-row';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn';
  resetBtn.id = 'btn-command-placement-hide-reset';
  resetBtn.textContent = t('settings.commandPlacement.hideReset');
  resetBtn.addEventListener('click', () => {
    draft.commandPlacement.hiddenButtons = [];
    rerender();
    refreshSettingsButtons();
  });
  resetRow.appendChild(resetBtn);
  body.appendChild(resetRow);
}

// --- Bereichs-Definition ---------------------------------------------------------

function buildInto(body, draft, rerender) {
  body.appendChild(subtitle('settings.commandPlacement.statusbarTitle'));
  body.appendChild(hint('settings.commandPlacement.statusbarHint'));
  buildEntryListEditor(body, draft, rerender, {
    listKey: 'statusbar',
    addTitleKey: 'commandPlacement.dialog.addStatusbarTitle',
    editTitleKey: 'commandPlacement.dialog.editStatusbarTitle',
    testId: 'statusbar',
  });
  // 4T-0521: zweite Liste — nutzerdefinierte Kontextmenü-Sektion, gleicher
  // Anlage-Flow und gleiches Datenmodell, eigene Reihenfolge.
  body.appendChild(subtitle('settings.commandPlacement.contextMenuTitle'));
  body.appendChild(hint('settings.commandPlacement.contextMenuHint'));
  buildEntryListEditor(body, draft, rerender, {
    listKey: 'contextMenu',
    addTitleKey: 'commandPlacement.dialog.addContextMenuTitle',
    editTitleKey: 'commandPlacement.dialog.editContextMenuTitle',
    testId: 'contextmenu',
  });
  // 4T-0522: Makro-Editor — Makro-Liste mit aufklappbarer Schritt-Liste,
  // Testlauf-Knopf und Anlage über den Dialog (Name Pflicht, Icon).
  body.appendChild(subtitle('settings.commandPlacement.macrosTitle'));
  body.appendChild(hint('settings.commandPlacement.macrosHint'));
  buildMacroEditor(body, draft, rerender);
  body.appendChild(subtitle('settings.commandPlacement.hideTitle'));
  body.appendChild(hint('settings.commandPlacement.hideHint'));
  buildHideListEditor(body, draft, rerender);
}

function renderCommandPlacementSection(container, draft) {
  ensureDraft(draft);
  const root = document.createElement('div');
  root.className = 'command-placement-settings';
  container.appendChild(root);
  const rerender = () => {
    root.innerHTML = '';
    buildInto(root, draft, rerender);
  };
  lastDraft = draft;
  lastBody = root;
  lastRerender = rerender;
  rerender();
}

// Persistiert den Entwurf; setCommandPlacement normalisiert, wendet auf
// Segment und Hide-Liste an und broadcastet. Danach den Entwurf auf den
// wirksamen Stand ziehen (Muster applyPanelOrderSection).
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
  titleKey: 'settings.commandPlacement.title',
  render: renderCommandPlacementSection,
  apply: applyCommandPlacementSection,
  dirty: dirtyCommandPlacementSection,
});
