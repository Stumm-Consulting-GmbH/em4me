// 4T-000538 (Epic 3E-000098): Arbeitsbereichs-UI im Renderer — Namens-und-
// Farb-Dialog (Muster showTabGroupDialog in dialogs.js) und Verwaltungs-
// Dialog. Die Lebenszyklus-Operationen selbst liegen im Main
// (workspace:*-IPC, 4T-000537); dieses Modul liefert die Dialoge und ruft
// die Preload-Bruecke. Begriffs-Disziplin (Workshop-Punkt 2): in allen
// Texten immer voll "Arbeitsbereich".
//
// 4T-002227 (Epic 3E-000356): Der Verwaltungs-Dialog ist abgelöst durch die
// Seite «Arbeitsbereiche» (workspaces-page.js). Hier bleibt das kleine Fenster
// für Name und Farbe, das «Als Arbeitsbereich speichern…», «Neuer
// Arbeitsbereich…» und die Seite gemeinsam nutzen; deshalb wird es exportiert.
'use strict';

import { t } from '../../i18n.js';

import { api, $ } from './api.js';
import { TAB_GROUP_COLOR_KEYS } from '../../../shared/tab-group-colors.js';

// Namens-und-Farb-Dialog: Titel pro Anwendungsfall, Name plus Acht-Farben-
// Swatches. Liefert { name, color } oder null (Abbruch). OK mit leerem
// Namen bleibt im Dialog (der Main lehnt leere Namen ohnehin ab).
export function showWorkspaceDialog(opts) {
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
