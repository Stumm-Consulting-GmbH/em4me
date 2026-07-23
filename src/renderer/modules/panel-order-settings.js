// 4T-0569 (Epic 3E-0104): Bereich „Panel-Reihenfolge" der Einstellungs-Seite.
//
// Sortiert die Panel-Zugänge — Ansichtsmenü-Untermenü „Panels" und
// Statusbar-Leiste führen dieselbe Reihenfolge — über Hoch/Runter-
// Schaltflächen pro Zeile; Zurücksetzen stellt die Modell-Reihenfolge
// her. Entwurf-/Anwenden-Logik wie der Bereich „Sidebar"
// (sidebar-settings.js, dort auch das Muster des Fremd-Änderungs-
// Abgleichs); die Wirkung übernimmt setPanelToggleOrder
// (sidebar-layout.js) für beide Bedienorte gleichzeitig und broadcastet
// an alle Fenster. Die Liste führt bewusst alle 13 Panels — auch die
// deaktivierter Erweiterungen —, damit die Reihenfolge vollständig
// pflegbar bleibt; wirksam werden deren Zugänge erst mit aktiver
// Erweiterung. Wiederverwendet die sidebar-settings-CSS-Klassen
// (identische Listen-Optik, styles.css).
'use strict';

import { t } from '../i18n.js';
import { refreshSettingsButtons, registerSettingsSection } from './settings-page.js';
import {
  defaultPanelToggleOrder,
  getPanelToggleOrder,
  setPanelToggleOrder,
} from './sidebar-layout.js';
import { panelAccessById } from '../../shared/panel-access.js';

// Entwurf lazy anlegen (Muster ensureDraft in sidebar-settings.js).
function ensureDraft(draft) {
  if (!draft.panelOrder) draft.panelOrder = getPanelToggleOrder();
  return draft.panelOrder;
}

// Referenzen des zuletzt gerenderten Bereichs: eine Reihenfolge-Änderung
// aus einem anderen Fenster (Broadcast) zieht den offenen Entwurf auf den
// neuen Ist-Stand nach; noch nicht angewendete Bereichs-Änderungen werden
// dabei bewusst verworfen (Muster sidebar-settings.js).
let lastDraft = null;
let lastBody = null;
let lastRerender = null;

document.addEventListener('scg:panel-toggle-order-changed', () => {
  if (!lastDraft || !lastDraft.panelOrder) return;
  lastDraft.panelOrder = getPanelToggleOrder();
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  refreshSettingsButtons();
});

function panelTitle(id) {
  const meta = panelAccessById(id);
  return meta ? t(meta.titleKey) : id;
}

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

function buildInto(body, draft, rerender) {
  const order = draft.panelOrder;
  const hint = document.createElement('p');
  hint.className = 'sidebar-settings-hint';
  hint.textContent = t('settings.panelOrder.hint');
  body.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'sidebar-settings-list panel-order-list';
  order.forEach((id, idx) => {
    const row = document.createElement('div');
    row.className = 'sidebar-settings-row';
    row.dataset.panelId = id;
    const label = document.createElement('span');
    label.className = 'sidebar-settings-label';
    label.textContent = panelTitle(id);
    row.appendChild(label);
    const actions = document.createElement('span');
    actions.className = 'sidebar-settings-actions';
    const move = (delta) => {
      const next = [...draft.panelOrder];
      const target = idx + delta;
      [next[idx], next[target]] = [next[target], next[idx]];
      draft.panelOrder = next;
      rerender();
    };
    actions.appendChild(
      symbolButton('panel-order-up', '↑', 'settings.panelOrder.moveUp', idx === 0, () => move(-1)),
    );
    actions.appendChild(
      symbolButton(
        'panel-order-down',
        '↓',
        'settings.panelOrder.moveDown',
        idx === order.length - 1,
        () => move(1),
      ),
    );
    row.appendChild(actions);
    list.appendChild(row);
  });
  body.appendChild(list);

  const resetRow = document.createElement('div');
  resetRow.className = 'sidebar-settings-reset-row';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn';
  resetBtn.id = 'btn-panel-order-reset';
  resetBtn.textContent = t('settings.panelOrder.reset');
  resetBtn.addEventListener('click', () => {
    draft.panelOrder = defaultPanelToggleOrder();
    rerender();
  });
  resetRow.appendChild(resetBtn);
  body.appendChild(resetRow);
}

function renderPanelOrderSection(container, draft) {
  ensureDraft(draft);
  const root = document.createElement('div');
  root.className = 'panel-order-settings';
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

// Persistiert den Entwurf; setPanelToggleOrder normalisiert, wendet auf
// Statusbar und Menü an und broadcastet. Danach den Entwurf auf den
// wirksamen Stand ziehen (Muster applySidebarSection).
async function applyPanelOrderSection(draft) {
  if (!draft.panelOrder) return;
  await setPanelToggleOrder(draft.panelOrder);
  draft.panelOrder = getPanelToggleOrder();
}

// Spiegelt applyPanelOrderSection: Entwurf gegen die wirksame Reihenfolge.
function dirtyPanelOrderSection(draft) {
  if (!draft.panelOrder) return false;
  return JSON.stringify(draft.panelOrder) !== JSON.stringify(getPanelToggleOrder());
}

registerSettingsSection({
  id: 'panelOrder',
  titleKey: 'settings.panelOrder.title',
  render: renderPanelOrderSection,
  apply: applyPanelOrderSection,
  dirty: dirtyPanelOrderSection,
});
