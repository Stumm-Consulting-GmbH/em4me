// 4T-0608 (Epic 3E-0114): Bereich „Format-Toolbar" der Einstellungs-Seite
// (erweiterungs-gebunden über settingsSections der Erweiterung toolbar;
// dynamische Registrierung nach dem Muster command-placement-settings.js).
//
// Inhalt: die Belegungs-Liste der Toolbar (Kommando-Einträge über den
// Drei-Schritt-Dialog der Kommando-Platzierung, dazu Trenner und das
// Überschrift-Menü als Spezial-Einträge; Hoch/Runter, Bearbeiten,
// Entfernen) plus „Auf Standard zurücksetzen". Entwurf-/Anwenden-Logik
// wie der Bereich „Kommando-Platzierung"; die Wirkung übernimmt
// setFormatToolbar (format-toolbar.js), das an alle Fenster broadcastet.
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { registerSettingsSection } from './settings-page.js';
import { getFormatToolbar, setFormatToolbar } from '../editor/format-toolbar.js';
import {
  defaultFormatToolbarEntries,
  normalizeFormatToolbar,
} from '../../../shared/format-toolbar.js';
import { COMMAND_ICONS, DEFAULT_COMMAND_ICON } from '../../../shared/commands/command-icons.js';
import { COMMANDS } from '../../../shared/commands/commands.js';
import { showPlacementEntryDialog } from './command-placement-settings.js';

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Entwurf lazy anlegen (Muster ensureDraft in command-placement-settings.js).
function ensureDraft(draft) {
  if (!draft.formatToolbar) draft.formatToolbar = getFormatToolbar();
  return draft.formatToolbar;
}

// Broadcast aus einem anderen Fenster zieht den offenen Entwurf auf den
// neuen Ist-Stand nach (noch nicht angewendete Änderungen entfallen).
let lastDraft = null;
let lastBody = null;
let lastRerender = null;

document.addEventListener('scg:format-toolbar-changed', () => {
  if (!lastDraft || !lastDraft.formatToolbar) return;
  lastDraft.formatToolbar = getFormatToolbar();
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

function hint(key) {
  const p = document.createElement('p');
  p.className = 'sidebar-settings-hint';
  p.textContent = t(key);
  return p;
}

// Anzeige-Label und Icon eines Belegungs-Eintrags: Kommando-Einträge wie
// in der Kommando-Platzierung (Anzeigename, sonst Kommando-Label, sonst
// rohe ID mit Hinweis), Trenner und Überschrift-Menü mit festem Label.
function entryDisplay(entry) {
  if (entry.type === 'separator') {
    return { icon: COMMAND_ICONS.minus, label: t('settings.formatToolbar.separatorEntry') };
  }
  if (entry.type === 'headings') {
    return { icon: COMMAND_ICONS.heading, label: t('settings.formatToolbar.headingsEntry') };
  }
  const cmd = COMMANDS.find((c) => c.id === entry.commandId);
  const label =
    entry.label ||
    (cmd
      ? t(cmd.labelKey)
      : `${entry.commandId} (${t('settings.commandPlacement.missingCommand')})`);
  return { icon: COMMAND_ICONS[entry.icon] || COMMAND_ICONS[DEFAULT_COMMAND_ICON], label };
}

function buildEntryList(body, draft, rerender) {
  const entries = draft.formatToolbar.entries;
  const list = document.createElement('div');
  list.className = 'sidebar-settings-list command-placement-list';
  list.dataset.placementList = 'formattoolbar';
  entries.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'sidebar-settings-row command-placement-row';
    if (entry.type === 'command') row.dataset.commandId = entry.commandId;
    else row.dataset.entryType = entry.type;
    const display = entryDisplay(entry);
    const iconSpan = document.createElement('span');
    iconSpan.className = 'command-placement-row-icon';
    iconSpan.innerHTML = display.icon;
    row.appendChild(iconSpan);
    const label = document.createElement('span');
    label.className = 'sidebar-settings-label';
    label.textContent = display.label;
    row.appendChild(label);
    const actions = document.createElement('span');
    actions.className = 'sidebar-settings-actions';
    const move = (delta) => {
      const next = [...entries];
      const target = idx + delta;
      [next[idx], next[target]] = [next[target], next[idx]];
      draft.formatToolbar.entries = next;
      rerender();
    };
    actions.appendChild(
      symbolButton('format-toolbar-up', '↑', 'settings.commandPlacement.moveUp', idx === 0, () =>
        move(-1),
      ),
    );
    actions.appendChild(
      symbolButton(
        'format-toolbar-down',
        '↓',
        'settings.commandPlacement.moveDown',
        idx === entries.length - 1,
        () => move(1),
      ),
    );
    // Bearbeiten (Icon/Anzeigename/Kommando) nur für Kommando-Einträge —
    // Trenner und Überschrift-Menü haben nichts zu bearbeiten.
    if (entry.type === 'command') {
      actions.appendChild(
        symbolButton('format-toolbar-edit', '✎', 'settings.commandPlacement.edit', false, () => {
          void showPlacementEntryDialog({
            titleKey: 'formatToolbar.dialog.editTitle',
            initial: entry,
          }).then((result) => {
            if (!result) return;
            const next = [...draft.formatToolbar.entries];
            next[idx] = { type: 'command', ...result };
            draft.formatToolbar.entries = next;
            rerender();
            refreshSettingsButtons();
          });
        }),
      );
    }
    actions.appendChild(
      symbolButton('format-toolbar-remove', '✕', 'settings.commandPlacement.remove', false, () => {
        const next = [...entries];
        next.splice(idx, 1);
        draft.formatToolbar.entries = next;
        rerender();
      }),
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
  addBtn.id = 'btn-format-toolbar-add';
  addBtn.textContent = t('settings.formatToolbar.addEntry');
  addBtn.addEventListener('click', () => {
    void showPlacementEntryDialog({ titleKey: 'formatToolbar.dialog.addTitle' }).then((result) => {
      if (!result) return;
      draft.formatToolbar.entries = [
        ...draft.formatToolbar.entries,
        { type: 'command', ...result },
      ];
      rerender();
      refreshSettingsButtons();
    });
  });
  const addSepBtn = document.createElement('button');
  addSepBtn.type = 'button';
  addSepBtn.className = 'btn';
  addSepBtn.id = 'btn-format-toolbar-add-separator';
  addSepBtn.textContent = t('settings.formatToolbar.addSeparator');
  addSepBtn.addEventListener('click', () => {
    draft.formatToolbar.entries = [...draft.formatToolbar.entries, { type: 'separator' }];
    rerender();
    refreshSettingsButtons();
  });
  // Das Überschrift-Menü gibt es höchstens einmal (weitere Exemplare
  // wären funktionsgleich; der Knopf ist dann gesperrt).
  const hasHeadings = entries.some((e) => e.type === 'headings');
  const addHeadingsBtn = document.createElement('button');
  addHeadingsBtn.type = 'button';
  addHeadingsBtn.className = 'btn';
  addHeadingsBtn.id = 'btn-format-toolbar-add-headings';
  addHeadingsBtn.textContent = t('settings.formatToolbar.addHeadings');
  addHeadingsBtn.disabled = hasHeadings;
  if (!hasHeadings) {
    addHeadingsBtn.addEventListener('click', () => {
      draft.formatToolbar.entries = [...draft.formatToolbar.entries, { type: 'headings' }];
      rerender();
      refreshSettingsButtons();
    });
  }
  addRow.append(addBtn, addSepBtn, addHeadingsBtn);
  body.appendChild(addRow);

  const resetRow = document.createElement('div');
  resetRow.className = 'sidebar-settings-reset-row';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn';
  resetBtn.id = 'btn-format-toolbar-reset';
  resetBtn.textContent = t('settings.formatToolbar.reset');
  resetBtn.addEventListener('click', () => {
    draft.formatToolbar.entries = defaultFormatToolbarEntries();
    rerender();
    refreshSettingsButtons();
  });
  resetRow.appendChild(resetBtn);
  body.appendChild(resetRow);
}

function renderFormatToolbarSection(container, draft) {
  ensureDraft(draft);
  const root = document.createElement('div');
  root.className = 'format-toolbar-settings';
  container.appendChild(root);
  const rerender = () => {
    root.innerHTML = '';
    root.appendChild(hint('settings.formatToolbar.hint'));
    buildEntryList(root, draft, rerender);
  };
  lastDraft = draft;
  lastBody = root;
  lastRerender = rerender;
  rerender();
}

// Persistiert den Entwurf; setFormatToolbar normalisiert, wendet auf die
// Leisten an und broadcastet. Danach den Entwurf auf den wirksamen Stand
// ziehen (Muster applyCommandPlacementSection).
async function applyFormatToolbarSection(draft) {
  if (!draft.formatToolbar) return;
  await setFormatToolbar(draft.formatToolbar);
  draft.formatToolbar = getFormatToolbar();
}

function dirtyFormatToolbarSection(draft) {
  if (!draft.formatToolbar) return false;
  return !jsonEqual(normalizeFormatToolbar(draft.formatToolbar), getFormatToolbar());
}

registerSettingsSection({
  id: 'formatToolbar',
  titleKey: 'settings.formatToolbar.title',
  render: renderFormatToolbarSection,
  apply: applyFormatToolbarSection,
  dirty: dirtyFormatToolbarSection,
});
