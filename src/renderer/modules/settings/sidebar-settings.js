// 4T-0289 (Epic 3E-0051): Bereich „Sidebar" der Einstellungs-Seite.
//
// Dockt über registerSettingsSection() an die Bereichs-Registry (3E-0049)
// an und bietet die übersichtliche Gesamt-Konfiguration des globalen
// Sidebar-Layouts: pro Seite (links, rechts) die Slots in Reihenfolge,
// Reiter-Gruppen als Block, Aktionen Verschieben/Seitenwechsel/Gruppieren/
// Lösen/Auflösen plus Zurücksetzen auf das Default-Layout. Der Bereich
// folgt der Entwurf-/OK-/Anwenden-Logik der Seite; alle Aktionen arbeiten
// auf denselben reinen Modell-Operationen wie das Drag-and-Drop (4T-0287,
// sidebar-layout.js), wirken aber erst bei Anwenden/OK.
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { registerSettingsSection } from './settings-page.js';
import {
  HEIGHT_MODE_GROUP,
  HEIGHT_MODE_PANEL,
  SIDEBAR_SIDES,
  applySidebarLayout,
  defaultSidebarLayout,
  dissolveGroup,
  getIconHeadings,
  getPanelHeightMode,
  getSidebarLayout,
  groupPanelWith,
  knownPanelIds,
  movePanelRelativeTo,
  movePanelToNewSlot,
  setIconHeadings,
  setPanelHeightMode,
  sidebarPanelById,
} from '../sidebar-layout.js';
// 4T-0624 (Epic 3E-0119): benannte Sidebar-Varianten — die Verwaltung
// (speichern, anwenden, umbenennen, überschreiben, löschen) wirkt sofort,
// nicht über den Bereichs-Entwurf (Muster Drag-and-Drop-Sofort-Wirkung).
// 4T-0625: die Bereichs-Varianten (Ablage in der Bereichsdatei) haben
// einen eigenen Einstellungs-Bereich „Sidebar-Varianten" in der
// Navigations-Gruppe „Aktueller Bereich" (PO-Testbefund 0.77.0: sie
// gehören nicht in den allgemeinen Sidebar-Bereich); hier registriert,
// weil er die Zeilen-Bausteine des Varianten-Blocks wiederverwendet.
import {
  applySidebarVariant,
  deleteAreaVariant,
  deleteGlobalVariant,
  getAreaVariants,
  getGlobalVariants,
  overwriteAreaVariant,
  overwriteGlobalVariant,
  showRenameVariantDialog,
  showSaveAreaVariantDialog,
  showSaveVariantDialog,
} from '../sidebar-variants.js';

function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

// Entwurf lazy anlegen: resetPageState (settings-page.js) kennt dynamische
// Bereiche nicht; der erste Render der Sitzung zieht die Kopie des
// aktuellen Layouts.
function ensureDraft(draft) {
  if (!draft.sidebarLayout) draft.sidebarLayout = cloneLayout(getSidebarLayout());
  // 4T-0639 (Epic 3E-0069): Der Icon-Schalter gehört wie das Layout in den
  // Entwurf — er wirkt erst bei Anwenden oder OK und lässt sich mit
  // Abbrechen verwerfen (PO-Testbefund 2026-07-20; ein erster Entwurf ließ
  // ihn sofort wirken, das war falsch).
  if (typeof draft.sidebarIconHeadings !== 'boolean') {
    draft.sidebarIconHeadings = getIconHeadings();
  }
  // 4T-0855 (Epic 3E-0164): Das Höhen-Modell folgt demselben Entwurfs-Muster
  // wie der Icon-Schalter.
  if (typeof draft.sidebarHeightMode !== 'string') {
    draft.sidebarHeightMode = getPanelHeightMode();
  }
  return draft.sidebarLayout;
}

// Referenzen des zuletzt gerenderten Bereichs: ein Drag-and-Drop in der
// Sidebar wirkt sofort auf das globale Layout — ein danach angewendeter
// alter Bereichs-Entwurf würde die Änderung rückgängig machen (Muster
// R5-08 Appearance-Snapshot). Der Event-Listener zieht deshalb den
// Entwurf auf den neuen Ist-Stand nach; noch nicht angewendete Bereichs-
// Änderungen werden dabei bewusst verworfen (Sofort-Wirkung des
// Drag-and-Drop hat Vorrang).
let lastDraft = null;
let lastBody = null;
let lastRerender = null;

document.addEventListener('scg:sidebar-layout-changed', () => {
  if (!lastDraft || !lastDraft.sidebarLayout) return;
  lastDraft.sidebarLayout = cloneLayout(getSidebarLayout());
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  // 4T-0554: Der Abgleich kann offene Bereichs-Änderungen verwerfen —
  // Speicher-Status der Seiten-Schaltflächen nachziehen.
  refreshSettingsButtons();
});

// 4T-0639 (Epic 3E-0069): Kommt der Icon-Zustand aus einem anderen Fenster,
// zieht der offene Entwurf auf den neuen Ist-Stand nach (Muster oben).
document.addEventListener('scg:sidebar-icon-headings-changed', () => {
  if (!lastDraft || typeof lastDraft.sidebarIconHeadings !== 'boolean') return;
  lastDraft.sidebarIconHeadings = getIconHeadings();
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  refreshSettingsButtons();
});

// 4T-0855 (Epic 3E-0164): Dasselbe für das Höhen-Modell, wenn es aus einem
// anderen Fenster kommt.
document.addEventListener('scg:sidebar-height-mode-changed', () => {
  if (!lastDraft || typeof lastDraft.sidebarHeightMode !== 'string') return;
  lastDraft.sidebarHeightMode = getPanelHeightMode();
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  refreshSettingsButtons();
});

// 4T-0624: Varianten-Änderungen (auch aus anderen Fenstern) rendern die
// offenen Bereiche neu; der Layout-Entwurf bleibt dabei unberührt.
document.addEventListener('scg:sidebar-variants-changed', () => {
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  if (
    lastVariantsAreaBody &&
    lastVariantsAreaBody.isConnected &&
    typeof lastVariantsAreaRerender === 'function'
  ) {
    lastVariantsAreaRerender();
  }
});

function panelTitle(id) {
  const def = sidebarPanelById(id);
  return def ? t(def.titleKey) : id;
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

function buildPanelRow(id, opts, ops) {
  const row = document.createElement('div');
  row.className = 'sidebar-settings-row';
  row.dataset.panelId = id;
  const label = document.createElement('span');
  label.className = 'sidebar-settings-label';
  label.textContent = panelTitle(id);
  row.appendChild(label);
  const actions = document.createElement('span');
  actions.className = 'sidebar-settings-actions';
  if (opts.grouped) {
    actions.appendChild(
      symbolButton('sidebar-settings-ungroup', '⇱', 'settings.sidebar.ungroup', false, () =>
        ops.ungroup(id),
      ),
    );
  } else {
    actions.appendChild(
      symbolButton('sidebar-settings-up', '↑', 'settings.sidebar.moveUp', opts.isFirst, () =>
        ops.moveUp(id),
      ),
    );
    actions.appendChild(
      symbolButton('sidebar-settings-down', '↓', 'settings.sidebar.moveDown', opts.isLast, () =>
        ops.moveDown(id),
      ),
    );
    actions.appendChild(
      symbolButton(
        'sidebar-settings-group-with',
        '⧉',
        'settings.sidebar.groupWithAbove',
        opts.isFirst,
        () => ops.groupWithAbove(id),
      ),
    );
  }
  actions.appendChild(
    symbolButton('sidebar-settings-side', '⇄', 'settings.sidebar.switchSide', false, () =>
      ops.switchSide(id),
    ),
  );
  row.appendChild(actions);
  return row;
}

function buildInto(body, draft, rerender) {
  const layout = draft.sidebarLayout;
  // Aktionen erzeugen ueber die reinen Operationen einen neuen Entwurf und
  // rendern den Bereich neu; No-ops (identische Referenz) bleiben folgenlos.
  const commit = (next) => {
    if (next !== layout) {
      draft.sidebarLayout = next;
      rerender();
    }
  };
  const makeOps = (side, slots, slotIdx) => ({
    moveUp: (id) => commit(movePanelRelativeTo(layout, id, slots[slotIdx - 1].panels[0], 'before')),
    moveDown: (id) =>
      commit(movePanelRelativeTo(layout, id, slots[slotIdx + 1].panels[0], 'after')),
    groupWithAbove: (id) => commit(groupPanelWith(layout, id, slots[slotIdx - 1].panels[0])),
    ungroup: (id) => commit(movePanelToNewSlot(layout, id, side, slotIdx + 1)),
    switchSide: (id) =>
      commit(
        movePanelToNewSlot(layout, id, side === 'left' ? 'right' : 'left', Number.MAX_SAFE_INTEGER),
      ),
  });

  const hint = document.createElement('p');
  hint.className = 'sidebar-settings-hint';
  hint.textContent = t('settings.sidebar.hint');
  body.appendChild(hint);

  // 4T-0639 (Epic 3E-0069): Überschriften als Icon statt Text. Läuft wie
  // die Anordnung über den Entwurf und wirkt erst bei Anwenden oder OK
  // (PO-Festlegung 2026-07-20).
  const iconRow = document.createElement('label');
  iconRow.className = 'settings-row';
  const iconInput = document.createElement('input');
  iconInput.type = 'checkbox';
  iconInput.id = 'settings-sidebar-icon-headings';
  iconInput.checked = draft.sidebarIconHeadings === true;
  iconInput.addEventListener('change', () => {
    draft.sidebarIconHeadings = iconInput.checked;
    refreshSettingsButtons();
  });
  const iconLabel = document.createElement('span');
  iconLabel.textContent = t('settings.sidebar.iconHeadings');
  iconRow.append(iconInput, iconLabel);
  body.appendChild(iconRow);

  // 4T-0855 (Epic 3E-0164): Höhen-Modell der Blöcke. Läuft wie der
  // Icon-Schalter über den Entwurf und wirkt erst bei Anwenden oder OK.
  const modeRow = document.createElement('label');
  modeRow.className = 'settings-row';
  const modeLabel = document.createElement('span');
  modeLabel.textContent = t('settings.sidebar.heightMode');
  const modeSelect = document.createElement('select');
  modeSelect.id = 'settings-sidebar-height-mode';
  for (const [wert, key] of [
    [HEIGHT_MODE_PANEL, 'settings.sidebar.heightMode.panel'],
    [HEIGHT_MODE_GROUP, 'settings.sidebar.heightMode.group'],
  ]) {
    const opt = document.createElement('option');
    opt.value = wert;
    opt.textContent = t(key);
    modeSelect.appendChild(opt);
  }
  modeSelect.value =
    draft.sidebarHeightMode === HEIGHT_MODE_GROUP ? HEIGHT_MODE_GROUP : HEIGHT_MODE_PANEL;
  modeSelect.addEventListener('change', () => {
    draft.sidebarHeightMode = modeSelect.value;
    refreshSettingsButtons();
  });
  modeRow.append(modeLabel, modeSelect);
  body.appendChild(modeRow);
  const modeHint = document.createElement('p');
  modeHint.className = 'sidebar-settings-hint';
  modeHint.textContent = t('settings.sidebar.heightMode.hint');
  body.appendChild(modeHint);

  for (const side of SIDEBAR_SIDES) {
    const heading = document.createElement('h4');
    heading.className = 'sidebar-settings-side-title';
    heading.textContent = t(side === 'left' ? 'settings.sidebar.left' : 'settings.sidebar.right');
    body.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'sidebar-settings-list';
    list.dataset.side = side;
    body.appendChild(list);
    const slots = layout[side];
    if (slots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-settings-empty';
      empty.textContent = t('settings.sidebar.empty');
      list.appendChild(empty);
      continue;
    }
    slots.forEach((slot, slotIdx) => {
      const ops = makeOps(side, slots, slotIdx);
      const isFirst = slotIdx === 0;
      const isLast = slotIdx === slots.length - 1;
      if (slot.panels.length > 1) {
        const group = document.createElement('div');
        group.className = 'sidebar-settings-group';
        const head = document.createElement('div');
        head.className = 'sidebar-settings-group-head';
        const label = document.createElement('span');
        label.textContent = t('settings.sidebar.group');
        head.appendChild(label);
        const dissolve = document.createElement('button');
        dissolve.type = 'button';
        dissolve.className = 'btn sidebar-settings-dissolve';
        dissolve.textContent = t('settings.sidebar.dissolve');
        dissolve.addEventListener('click', () => commit(dissolveGroup(layout, slot.panels[0])));
        head.appendChild(dissolve);
        group.appendChild(head);
        for (const id of slot.panels) {
          group.appendChild(buildPanelRow(id, { grouped: true }, ops));
        }
        list.appendChild(group);
      } else {
        list.appendChild(buildPanelRow(slot.panels[0], { grouped: false, isFirst, isLast }, ops));
      }
    });
  }

  const actions = document.createElement('div');
  actions.className = 'sidebar-settings-reset-row';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.id = 'btn-sidebar-layout-reset';
  reset.className = 'btn';
  reset.textContent = t('settings.sidebar.reset');
  reset.addEventListener('click', () => {
    draft.sidebarLayout = defaultSidebarLayout(knownPanelIds());
    rerender();
  });
  actions.appendChild(reset);
  body.appendChild(actions);

  buildVariantsInto(body);
}

// 4T-0624 (Epic 3E-0119): Verwaltungs-Block der benannten Varianten.
// Alle Aktionen wirken sofort; das Neu-Rendern übernimmt der
// scg:sidebar-variants-changed-Listener (bzw. beim Anwenden der
// scg:sidebar-layout-changed-Abgleich).
function variantActionButton(labelKey, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn sidebar-settings-btn ' + className;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', onClick);
  return btn;
}

function buildVariantRow(variant, scope) {
  const isArea = scope === 'area';
  const row = document.createElement('div');
  row.className = 'sidebar-settings-row sidebar-variants-row';
  row.dataset.variantId = variant.id;
  row.dataset.variantScope = scope;
  const label = document.createElement('span');
  label.className = 'sidebar-settings-label';
  label.textContent = variant.name;
  row.appendChild(label);
  const actions = document.createElement('span');
  actions.className = 'sidebar-settings-actions';
  actions.appendChild(
    variantActionButton('settings.sidebarVariants.apply', 'sidebar-variants-apply', () => {
      void applySidebarVariant(variant);
    }),
  );
  actions.appendChild(
    variantActionButton('settings.sidebarVariants.rename', 'sidebar-variants-rename', () => {
      void showRenameVariantDialog(variant, scope);
    }),
  );
  actions.appendChild(
    variantActionButton('settings.sidebarVariants.overwrite', 'sidebar-variants-overwrite', () => {
      void (isArea ? overwriteAreaVariant(variant.id) : overwriteGlobalVariant(variant.id));
    }),
  );
  actions.appendChild(
    variantActionButton('settings.sidebarVariants.delete', 'sidebar-variants-delete', () => {
      void (isArea ? deleteAreaVariant(variant.id) : deleteGlobalVariant(variant.id));
    }),
  );
  row.appendChild(actions);
  return row;
}

// Eine Varianten-Liste; die leere Liste zeigt den Leer-Hinweis.
// scope 'global' | 'area' steuert die Ziel-Aktionen der Zeilen.
function buildVariantList(body, variants, scope) {
  const list = document.createElement('div');
  list.className = 'sidebar-settings-list sidebar-variants-list';
  list.dataset.variantScope = scope;
  body.appendChild(list);
  if (variants.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-settings-empty';
    empty.textContent = t('settings.sidebarVariants.empty');
    list.appendChild(empty);
  } else {
    for (const variant of variants) list.appendChild(buildVariantRow(variant, scope));
  }
}

function buildVariantSaveRow(body, buttonId, onClick) {
  const saveRow = document.createElement('div');
  saveRow.className = 'sidebar-settings-reset-row sidebar-variants-save-row';
  const save = document.createElement('button');
  save.type = 'button';
  save.id = buttonId;
  save.className = 'btn';
  save.textContent = t('settings.sidebarVariants.save');
  save.addEventListener('click', onClick);
  saveRow.appendChild(save);
  body.appendChild(saveRow);
}

// Globale Varianten im allgemeinen Sidebar-Bereich. Der Speichern-Dialog
// bietet bei geöffnetem Bereich weiterhin die Ziel-Option (derselbe
// Dialog wie Menü und Kommando).
function buildVariantsInto(body) {
  const heading = document.createElement('h4');
  heading.className = 'sidebar-settings-side-title';
  heading.textContent = t('settings.sidebarVariants.title');
  body.appendChild(heading);
  const hint = document.createElement('p');
  hint.className = 'sidebar-settings-hint';
  hint.textContent = t('settings.sidebarVariants.hint');
  body.appendChild(hint);
  buildVariantList(body, getGlobalVariants(), 'global');
  buildVariantSaveRow(body, 'btn-sidebar-variant-save', () => {
    void showSaveVariantDialog();
  });
}

// 4T-0625: Bereichs-Sektion „Sidebar-Varianten" (Navigations-Gruppe
// „Aktueller Bereich", erscheint nur bei geöffnetem Bereich). Der
// Speichern-Knopf legt direkt im Bereich ab (ohne Ziel-Option).
let lastVariantsAreaBody = null;
let lastVariantsAreaRerender = null;

function renderSidebarVariantsAreaSection(container) {
  const body = document.createElement('div');
  body.className = 'sidebar-settings sidebar-variants-area';
  container.appendChild(body);
  const rerender = () => {
    body.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'sidebar-settings-hint';
    hint.textContent = t('settings.sidebarVariants.areaHint');
    body.appendChild(hint);
    buildVariantList(body, getAreaVariants(), 'area');
    buildVariantSaveRow(body, 'btn-sidebar-variant-save-area', () => {
      void showSaveAreaVariantDialog();
    });
  };
  lastVariantsAreaBody = body;
  lastVariantsAreaRerender = rerender;
  rerender();
}

function renderSidebarSection(container, draft) {
  ensureDraft(draft);
  const body = document.createElement('div');
  body.className = 'sidebar-settings';
  container.appendChild(body);
  const rerender = () => {
    body.innerHTML = '';
    buildInto(body, draft, rerender);
  };
  lastDraft = draft;
  lastBody = body;
  lastRerender = rerender;
  rerender();
}

async function applySidebarSection(draft) {
  // Bereich in dieser Sitzung nie geöffnet: nichts anzuwenden.
  if (!draft.sidebarLayout) return;
  // applySidebarLayout normalisiert, ist bei unverändertem Layout ein
  // No-op und broadcastet sonst an alle Fenster.
  await applySidebarLayout(draft.sidebarLayout);
  draft.sidebarLayout = cloneLayout(getSidebarLayout());
  // 4T-0639: Icon-Zustand der Überschriften; setIconHeadings ist bei
  // unverändertem Wert ein No-op und zieht sonst Rendering, Breiten-
  // Untergrenze und Broadcast nach.
  if (typeof draft.sidebarIconHeadings === 'boolean') {
    await setIconHeadings(draft.sidebarIconHeadings);
    draft.sidebarIconHeadings = getIconHeadings();
  }
  // 4T-0855: Höhen-Modell; setPanelHeightMode ist bei unverändertem Wert ein
  // No-op und zieht sonst Rendering und Broadcast nach.
  if (typeof draft.sidebarHeightMode === 'string') {
    await setPanelHeightMode(draft.sidebarHeightMode);
    draft.sidebarHeightMode = getPanelHeightMode();
  }
}

// Spiegelt applySidebarSection (4T-0554): Entwurfs-Layout gegen das
// wirksame Layout; der scg:sidebar-layout-changed-Abgleich oben hält den
// Entwurf bei Sofort-Wirkungen (Drag-and-Drop) synchron.
function dirtySidebarSection(draft) {
  if (!draft.sidebarLayout) return false;
  // 4T-0639: auch der Icon-Schalter zählt als offene Änderung.
  if (
    typeof draft.sidebarIconHeadings === 'boolean' &&
    draft.sidebarIconHeadings !== getIconHeadings()
  ) {
    return true;
  }
  // 4T-0855: auch das Höhen-Modell zählt als offene Änderung.
  if (
    typeof draft.sidebarHeightMode === 'string' &&
    draft.sidebarHeightMode !== getPanelHeightMode()
  ) {
    return true;
  }
  return JSON.stringify(draft.sidebarLayout) !== JSON.stringify(getSidebarLayout());
}

registerSettingsSection({
  id: 'sidebar',
  titleKey: 'settings.sidebar.title',
  render: renderSidebarSection,
  apply: applySidebarSection,
  dirty: dirtySidebarSection,
});

// 4T-0625 (Epic 3E-0119): Bereichs-Varianten der Sidebar unter
// „Aktueller Bereich" (nur bei geöffnetem Bereich sichtbar; Aktionen
// wirken sofort, daher ohne apply/dirty).
registerSettingsSection({
  id: 'sidebarVariants',
  titleKey: 'settings.sidebarVariants.areaTitle',
  group: 'area',
  render: renderSidebarVariantsAreaSection,
});
