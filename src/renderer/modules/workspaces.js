// 4T-0538 (Epic 3E-0098): Arbeitsbereichs-UI im Renderer — Namens-und-
// Farb-Dialog (Muster showTabGroupDialog in dialogs.js) und Verwaltungs-
// Dialog. Die Lebenszyklus-Operationen selbst liegen im Main
// (workspace:*-IPC, 4T-0537); dieses Modul liefert die Dialoge und ruft
// die Preload-Bruecke. Begriffs-Disziplin (Workshop-Punkt 2): in allen
// Texten immer voll "Arbeitsbereich".
'use strict';

import { t } from '../i18n.js';

import { api, $ } from './api.js';
import { TAB_GROUP_COLOR_KEYS } from '../../shared/tab-group-colors.js';

// Namens-und-Farb-Dialog: Titel pro Anwendungsfall, Name plus Acht-Farben-
// Swatches. Liefert { name, color } oder null (Abbruch). OK mit leerem
// Namen bleibt im Dialog (der Main lehnt leere Namen ohnehin ab).
function showWorkspaceDialog(opts) {
  const modal = $('#workspace-modal');
  const titleEl = $('#workspace-modal-title');
  const input = $('#workspace-name');
  const colorsEl = $('#workspace-colors');
  const btnOk = $('#btn-workspace-ok');
  const btnCancel = $('#btn-workspace-cancel');
  if (!modal || !titleEl || !input || !colorsEl) return Promise.resolve(null);

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    input.value = (opts && opts.name) || '';
    input.placeholder = t('workspace.dialog.namePlaceholder');
    btnOk.textContent = t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');

    let selected = TAB_GROUP_COLOR_KEYS.includes(opts && opts.color)
      ? opts.color
      : TAB_GROUP_COLOR_KEYS[0];
    colorsEl.innerHTML = '';
    for (const key of TAB_GROUP_COLOR_KEYS) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'tab-group-swatch' + (key === selected ? ' selected' : '');
      sw.dataset.color = key;
      sw.title = t(`tabGroup.color.${key}`);
      sw.style.setProperty('--tab-group-color', `var(--tab-group-${key})`);
      sw.addEventListener('click', () => {
        selected = key;
        colorsEl
          .querySelectorAll('.tab-group-swatch')
          .forEach((b) => b.classList.toggle('selected', b === sw));
      });
      colorsEl.appendChild(sw);
    }

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onOk = () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      finish({ name, color: selected });
    };
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

// "Als Arbeitsbereich speichern..." (Weg a): benennt die laufende
// Applikation samt aller Fenster; der Main haelt den Eintrag danach
// laufend aktuell.
export async function saveWorkspaceAs() {
  const result = await showWorkspaceDialog({ title: t('workspace.dialog.saveAsTitle') });
  if (!result) return;
  await api.workspaceSaveAs(result);
}

// "Neuer Arbeitsbereich..." (Weg b): legt leer an und oeffnet sofort ein
// neues leeres Fenster als dessen Applikation.
export async function createWorkspace() {
  const result = await showWorkspaceDialog({ title: t('workspace.dialog.createTitle') });
  if (!result) return;
  await api.workspaceCreate(result);
}

// "Arbeitsbereich schliessen": Kaskade ueber den Dirty-Pfad im Main
// (Abbruch stoppt, der Stand bleibt eingefroren gespeichert).
export function closeWorkspace() {
  void api.workspaceClose();
}

// --- Verwaltungs-Dialog -------------------------------------------------------

let managerOpen = false;
let changeListenerAttached = false;

function formatLastOpened(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function renderManagerList(listEl) {
  const list = (await api.workspacesList()) || [];
  listEl.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'workspace-manager-empty';
    empty.textContent = t('workspace.manager.empty');
    listEl.appendChild(empty);
    return;
  }
  for (const w of list) {
    const row = document.createElement('div');
    row.className = 'workspace-row';

    const dot = document.createElement('span');
    dot.className = 'workspace-dot' + (w.open ? ' open' : '');
    dot.style.setProperty('--workspace-color', `var(--tab-group-${w.color})`);
    dot.title = w.open ? t('workspace.manager.stateOpen') : t('workspace.manager.stateClosed');
    row.appendChild(dot);

    const nameWrap = document.createElement('div');
    nameWrap.className = 'workspace-row-text';
    const nameEl = document.createElement('div');
    nameEl.className = 'workspace-row-name';
    nameEl.textContent = w.name;
    nameWrap.appendChild(nameEl);
    const metaEl = document.createElement('div');
    metaEl.className = 'workspace-row-meta';
    const stateText = w.open
      ? t('workspace.manager.stateOpen')
      : t('workspace.manager.stateClosed');
    const lastText = formatLastOpened(w.lastOpenedAt);
    metaEl.textContent = lastText
      ? `${stateText} · ${t('workspace.manager.lastOpened').replace('{date}', lastText)}`
      : stateText;
    nameWrap.appendChild(metaEl);
    row.appendChild(nameWrap);

    const btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    btnOpen.className = 'btn';
    btnOpen.textContent = t('workspace.manager.open');
    btnOpen.addEventListener('click', () => {
      void api.workspaceOpen(w.id);
    });
    row.appendChild(btnOpen);

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn';
    btnEdit.textContent = t('workspace.manager.rename');
    btnEdit.addEventListener('click', async () => {
      const result = await showWorkspaceDialog({
        title: t('workspace.dialog.renameTitle'),
        name: w.name,
        color: w.color,
      });
      if (!result) return;
      if (result.name !== w.name) await api.workspaceRename({ id: w.id, name: result.name });
      if (result.color !== w.color) await api.workspaceSetColor({ id: w.id, color: result.color });
    });
    row.appendChild(btnEdit);

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn';
    btnDelete.textContent = t('workspace.manager.delete');
    btnDelete.addEventListener('click', async () => {
      const confirm = await api.workspaceConfirmDelete(w.name);
      if (confirm && confirm.confirmed) await api.workspaceDelete(w.id);
    });
    row.appendChild(btnDelete);

    listEl.appendChild(row);
  }
}

// "Arbeitsbereiche verwalten...": Liste mit Farbpunkt (gefuellt = offen,
// Ring = geschlossen), Offen-Status und zuletzt-geoeffnet-Angabe; Aktionen
// Oeffnen, Umbenennen und Farbe (ein kombinierter Dialog, Muster
// Tab-Gruppen), Loeschen (native Bestaetigung im Main). Aktualisiert sich
// bei jedem workspaces:changed-Broadcast, solange er offen ist.
export async function showWorkspaceManager() {
  const modal = $('#workspace-manager-modal');
  const listEl = $('#workspace-manager-list');
  const btnClose = $('#btn-workspace-manager-close');
  if (!modal || !listEl || !btnClose) return;

  if (!changeListenerAttached) {
    changeListenerAttached = true;
    api.onWorkspacesChanged(() => {
      if (managerOpen) void renderManagerList(listEl);
    });
  }

  btnClose.textContent = t('dialog.close');
  await renderManagerList(listEl);

  const backdrop = modal.querySelector('.bookmark-modal-backdrop');
  const finish = () => {
    managerOpen = false;
    modal.hidden = true;
    modal.removeEventListener('keydown', onKeydown, true);
    btnClose.removeEventListener('click', finish);
    backdrop.removeEventListener('click', finish);
  };
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  };

  modal.addEventListener('keydown', onKeydown, true);
  btnClose.addEventListener('click', finish);
  backdrop.addEventListener('click', finish);

  managerOpen = true;
  modal.hidden = false;
  setTimeout(() => btnClose.focus(), 0);
}
