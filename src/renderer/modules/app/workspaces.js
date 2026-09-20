// 4T-000538 (Epic 3E-000098): Arbeitsbereichs-UI im Renderer — Namens-und-
// Farb-Dialog (Muster showTabGroupDialog in dialogs.js) und Verwaltungs-
// Dialog. Die Lebenszyklus-Operationen selbst liegen im Main
// (workspace:*-IPC, 4T-000537); dieses Modul liefert die Dialoge und ruft
// die Preload-Bruecke. Begriffs-Disziplin (Workshop-Punkt 2): in allen
// Texten immer voll "Arbeitsbereich".
'use strict';

import { t } from '../../i18n.js';

import { api, $ } from './api.js';
import { TAB_GROUP_COLOR_KEYS } from '../../../shared/tab-group-colors.js';

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

// 4T-001753 (Epic 3E-000308): Der Fokus, der nach dem naechsten Neuaufbau der
// Liste wiederhergestellt werden soll — { id, direction }. Ohne diesen Merker
// waere die Reihenfolge mit der Tastatur nur EINEN Schritt weit bedienbar: Die
// Liste baut sich nach jeder Verschiebung vollstaendig neu auf
// (workspaces:changed), der gedrueckte Knopf verschwindet mitsamt seinem
// Fokus, und der Fokus fiele auf den Dialog zurueck. Wer einen Arbeitsbereich
// um drei Plaetze schieben will, muesste sich dreimal neu hin-tabben.
let fokusNachAufbau = null;

function formatLastOpened(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// 4T-001753: Eine der beiden Verschiebe-Schaltflaechen einer Zeile.
//
// **Am Rand abgeblendet statt weggelassen** (AK3). Ein fehlender Knopf liesse
// die uebrigen nachruecken: «nach unten» stuende in der ersten Zeile genau
// dort, wo es in allen anderen «nach oben» steht, und ein Klick nach dem
// Neuaufbau der Liste traefe die falsche Richtung. Ein abgeblendeter Knopf
// haelt die Zeilen deckungsgleich, bleibt fuer Hilfsmittel angekuendigt und
// sagt zugleich, dass es diese Richtung hier gibt, nur eben nicht jetzt.
//
// Sichtbar ist ein Pfeil-Zeichen; die Beschriftung tragen `title` und
// `aria-label` aus den Sprachdateien (Muster der Zeilen-Knoepfe in
// clock-alarms-panel.js). Zwei Wort-Knoepfe neben Oeffnen, Umbenennen und
// Loeschen haetten die Zeile ueber die Dialog-Breite getrieben.
function verschiebeKnopf(w, richtung, aus) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn workspace-move';
  btn.dataset.workspaceMove = richtung;
  btn.textContent = richtung === 'up' ? '▲' : '▼';
  const label = richtung === 'up' ? t('workspace.manager.moveUp') : t('workspace.manager.moveDown');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.disabled = aus;
  btn.addEventListener('click', async () => {
    fokusNachAufbau = { id: w.id, direction: richtung };
    await api.workspaceReorder({ id: w.id, direction: richtung });
  });
  return btn;
}

// 4T-001753: Fokus nach dem Neuaufbau auf denselben Knopf zurueckholen. Ist er
// am neuen Ort abgeblendet (der Eintrag steht jetzt am Rand), uebernimmt die
// Gegenrichtung derselben Zeile — der Anwender bleibt damit an seinem Eintrag
// und nicht am Anfang des Dialogs.
function stelleFokusHer(listEl) {
  const ziel = fokusNachAufbau;
  fokusNachAufbau = null;
  if (!ziel) return;
  const zeile = listEl.querySelector(`.workspace-row[data-workspace-id="${CSS.escape(ziel.id)}"]`);
  if (!zeile) return;
  const gewuenscht = zeile.querySelector(`[data-workspace-move="${ziel.direction}"]`);
  const ersatz = zeile.querySelector(
    `[data-workspace-move="${ziel.direction === 'up' ? 'down' : 'up'}"]`,
  );
  const knopf = gewuenscht && !gewuenscht.disabled ? gewuenscht : ersatz;
  if (knopf && !knopf.disabled) knopf.focus();
}

async function renderManagerList(listEl) {
  const list = (await api.workspacesList()) || [];
  listEl.innerHTML = '';
  if (list.length === 0) {
    fokusNachAufbau = null;
    const empty = document.createElement('div');
    empty.className = 'workspace-manager-empty';
    empty.textContent = t('workspace.manager.empty');
    listEl.appendChild(empty);
    return;
  }
  for (const [index, w] of list.entries()) {
    const row = document.createElement('div');
    row.className = 'workspace-row';
    // 4T-001753: Adresse der Zeile fuer die Fokus-Wiederherstellung.
    row.dataset.workspaceId = w.id;

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

    // 4T-001737 (Epic 3E-000308, E3): Bereichs-Zuordnung als eigene Zeile mit
    // dem VOLLSTAENDIGEN Pfad — hier ist Platz dafuer, waehrend die
    // Menue-Beschriftung auf den Ordnernamen kuerzt (E2). Ein Arbeitsbereich
    // ohne Bindung bekommt die Zeile gar nicht (kein Platzhalter, AK3), und
    // geaendert wird die Zuordnung an dieser Stelle nicht: Sie wird gezeigt
    // (AK8). Buch- und Regal-Bindung bleiben draussen (Begruendung im
    // Loesungs-Kapitel des Tasks); wer alle drei braucht, findet sie in My
    // Extended Memory.
    if (w.areaPath) {
      const areaEl = document.createElement('div');
      areaEl.className = 'workspace-row-path';
      areaEl.textContent = t('workspace.manager.area').replace('{path}', w.areaPath);
      areaEl.title = w.areaPath;
      nameWrap.appendChild(areaEl);
    }
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

    // 4T-001753: Die beiden Verschiebe-Knoepfe stehen am ENDE der Zeile, hinter
    // den drei bestehenden Aktionen. Zwei Gruende: Sie gehoeren als Paar
    // zusammen und lesen sich am Rand der Zeile als eine Bedienung, und der
    // Bestands-Prueffall WS-06 adressiert «Umbenennen und Farbe» als zweiten
    // Knopf der Zeile — eine Einfuegung davor haette ihn stillschweigend auf
    // eine andere Schaltflaeche gerichtet.
    row.appendChild(verschiebeKnopf(w, 'up', index === 0));
    row.appendChild(verschiebeKnopf(w, 'down', index === list.length - 1));

    listEl.appendChild(row);
  }
  stelleFokusHer(listEl);
}

// "Arbeitsbereiche verwalten...": Liste mit Farbpunkt (gefuellt = offen,
// Ring = geschlossen), Offen-Status, zuletzt-geoeffnet-Angabe und seit
// 4T-001737 der Bereichs-Zuordnung mit vollem Pfad; Aktionen Oeffnen,
// Umbenennen und Farbe (ein kombinierter Dialog, Muster Tab-Gruppen),
// Loeschen (native Bestaetigung im Main) und seit 4T-001753 die beiden
// Verschiebe-Knoepfe der Reihenfolge. Aktualisiert sich bei jedem
// workspaces:changed-Broadcast, solange er offen ist — und genau darueber
// wirkt auch jede Verschiebung, ohne einen eigenen Nachzug-Weg.
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
