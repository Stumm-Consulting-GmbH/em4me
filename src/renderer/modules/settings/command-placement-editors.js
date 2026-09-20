// 4T-001581 (Epic 3E-000283): gemeinsame Editor-Bausteine der
// Kommando-Platzierung, ausgezogen aus `command-placement-settings.js`.
//
// **Warum ein eigenes Modul.** Mit der Entscheidung des Product Owners vom
// 2026-09-14 (E4a des Epics) stehen zwei der vier Blöcke im Einstellungs-
// Abschnitt „Statusleiste" und zwei im Abschnitt „Kontextmenü und Makros".
// Beide Seiten brauchen dieselben Bausteine — den Anlage-Dialog, den
// Listen-Editor, die Ausblend-Liste und die drei Klein-Bausteine für
// Unterschrift, Hinweis und Symbol-Knopf. Kopiert werden sie nicht, und aus
// dem Abschnitts-Modul heraus sollten sie auch nicht kommen: Ein Modul, das
// sich beim Import selbst als Einstellungs-Abschnitt anmeldet, ist keine
// Bibliothek — der Import allein verschöbe die Anmelde-Reihenfolge.
//
// Das Datenmodell bleibt eines: Beide Abschnitte arbeiten auf demselben
// Entwurfs-Feld `draft.commandPlacement`, und persistiert wird es an genau
// einer Stelle (dem apply-Hook des Abschnitts „Kontextmenü und Makros",
// Muster historyArea/templatesArea in `settings-page.js`).
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { pageState } from './settings-shared.js';
import { getCommandPlacement } from '../command-placement.js';
import { STATUSBAR_HIDE_TARGETS } from '../../../shared/commands/command-placement.js';
import {
  COMMAND_ICONS,
  COMMAND_ICON_IDS,
  DEFAULT_COMMAND_ICON,
} from '../../../shared/commands/command-icons.js';
import { COMMANDS, COMMAND_CATEGORIES } from '../../../shared/commands/commands.js';
import { disabledCommandIdSet } from '../../../shared/extensions/extensions-core.js';
import { filterCommandEntries } from '../../../shared/commands/command-palette-filter.js';
import { getDisabledExtensionIds } from '../extensions/extension-lifecycle.js';

// Entwurf lazy anlegen (Muster ensureDraft in panel-order-settings.js). Beide
// Abschnitte rufen das; wer zuerst rendert, legt das Feld an.
export function ensureCommandPlacementDraft(draft) {
  if (!draft.commandPlacement) draft.commandPlacement = getCommandPlacement();
  return draft.commandPlacement;
}

// --- Nachführung bei Änderungen aus einem anderen Fenster -------------------------

// Eine Änderung aus einem anderen Fenster (Broadcast) zieht den offenen Entwurf
// auf den neuen Ist-Stand nach; noch nicht angewendete Bereichs-Änderungen
// werden dabei bewusst verworfen (Muster panel-order-settings.js).
//
// Seit 4T-001581 sind es ZWEI Wurzeln, die auf diesem Entwurfs-Feld arbeiten
// können, und deshalb steht hier eine Menge statt eines Merkers. Bezug ist der
// Seiten-Entwurf selbst und nicht eine festgehaltene Entwurfs-Referenz: Die
// Einstellungs-Suche rendert jeden Abschnitt einmal in einen abgekoppelten
// Container mit einem Wegwerf-Entwurf (settings-search-harvest.js), und ein
// Merker hätte danach auf diesen gezeigt (Muster statusbar-settings.js).
const nachfuehrungen = new Set();

function raeumeNachfuehrungen() {
  for (const eintrag of [...nachfuehrungen]) {
    if (!eintrag.wurzel.isConnected) nachfuehrungen.delete(eintrag);
  }
}

export function registriereCommandPlacementWurzel(wurzel, neuAufbauen) {
  raeumeNachfuehrungen();
  nachfuehrungen.add({ wurzel, neuAufbauen });
}

document.addEventListener('scg:command-placement-changed', () => {
  const draft = pageState.draft;
  if (draft && draft.commandPlacement) draft.commandPlacement = getCommandPlacement();
  raeumeNachfuehrungen();
  for (const eintrag of nachfuehrungen) eintrag.neuAufbauen();
  refreshSettingsButtons();
});

// --- Klein-Bausteine -------------------------------------------------------------

export function symbolButton(className, symbol, titleKey, disabled, onClick) {
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

export function subtitle(key) {
  const h = document.createElement('h4');
  h.className = 'settings-extensions-group-title';
  h.textContent = t(key);
  return h;
}

export function hint(key) {
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
// Makro-Kopf aus 4T-000522 braucht z.B. kein Kommando, der Kommando-Schritt
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

// Gemeinsame Listen-Komponente für Statusbar-Buttons (4T-000520) und
// Kontextmenü-Einträge (4T-000521): listKey benennt das Entwurfs-Feld
// ('statusbar' oder 'contextMenu'), die Dialog-Titel kommen pro Liste.
export function buildEntryListEditor(body, draft, rerender, opts) {
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

// --- Hide-Liste ------------------------------------------------------------------

export function buildHideListEditor(body, draft, rerender) {
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
