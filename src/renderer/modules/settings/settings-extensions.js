// 4T-0295 (Epic 3E-0052) und 4T-0300 (Epic 3E-0053): die beiden
// Verwaltungs-Bereiche der Erweiterungen — Schalter der internen
// Erweiterungen und Vertrauens-Verwaltung der externen.
'use strict';

import { effectiveDisabledSet } from '../../../shared/extensions/extensions-core.js';
import {
  EXTENSION_CATEGORIES,
  allExtensions,
  extensionById,
} from '../../../shared/extensions/extensions.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  disableExternalExtension,
  enableExternalExtension,
  externalExtensionEntries,
  removeExternalExtension,
  rescanExternalExtensions,
} from '../extensions/extension-host.js';
import {
  applyExtensionsState,
  getDisabledExtensionIds,
} from '../extensions/extension-lifecycle.js';
import { jsonEqual } from './settings-shared.js';

// Spiegelt applyExtensionsSection (sortierte id-Listen gegen den
// wirksamen Stand).
export function dirtyExtensionsSection(draft) {
  if (!Array.isArray(draft.extensionsDisabled)) return false;
  return !jsonEqual([...draft.extensionsDisabled].sort(), [...getDisabledExtensionIds()].sort());
}

// --- Bereich Erweiterungen (4T-0295, Epic 3E-0052) --------------------------------
// Liste der internen Erweiterungen, gruppiert nach Kategorie (Render,
// Vernetzung, Werkzeuge), je Zeile Schalter, Name und Kurzbeschreibung.
// Abhaengig mit-deaktivierte Erweiterungen zeigen einen Hinweis und einen
// gesperrten Schalter (ihr eigener Schalt-Zustand bleibt erhalten und
// kehrt mit der Abhaengigkeit zurueck). Wirkung erst bei Anwenden/OK.

function renderExtensionsEditor(listEl, draft) {
  listEl.innerHTML = '';
  const effective = effectiveDisabledSet(draft.extensionsDisabled);
  for (const category of EXTENSION_CATEGORIES) {
    const extensions = allExtensions().filter((m) => m.category === category);
    if (extensions.length === 0) continue;
    const heading = document.createElement('h4');
    heading.className = 'settings-extensions-group-title';
    heading.textContent = t(`settings.extensions.category.${category}`);
    listEl.appendChild(heading);
    for (const manifest of extensions) {
      const row = document.createElement('div');
      row.className = 'settings-extension-row';
      row.dataset.extensionId = manifest.id;

      const directlyDisabled = draft.extensionsDisabled.includes(manifest.id);
      const byDependency = effective.has(manifest.id) && !directlyDisabled;

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'settings-extension-toggle';
      toggle.id = `settings-extension-${manifest.id}`;
      toggle.checked = !effective.has(manifest.id);
      toggle.disabled = byDependency;
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          draft.extensionsDisabled = draft.extensionsDisabled.filter((id) => id !== manifest.id);
        } else if (!draft.extensionsDisabled.includes(manifest.id)) {
          draft.extensionsDisabled.push(manifest.id);
        }
        // Abhaengigkeits-Hinweise der uebrigen Zeilen nachziehen.
        renderExtensionsEditor(listEl, draft);
      });

      const text = document.createElement('div');
      text.className = 'settings-extension-text';
      const name = document.createElement('label');
      name.className = 'settings-extension-name';
      name.htmlFor = toggle.id;
      name.textContent = t(manifest.nameKey);
      text.appendChild(name);
      const desc = document.createElement('div');
      desc.className = 'settings-extension-desc';
      desc.textContent = t(manifest.descKey);
      text.appendChild(desc);
      if (byDependency) {
        const hint = document.createElement('div');
        hint.className = 'settings-extension-dependency-hint';
        const names = (manifest.dependencies || [])
          .filter((dep) => effective.has(dep))
          .map((dep) => {
            const depManifest = extensionById(dep);
            return depManifest ? t(depManifest.nameKey) : dep;
          })
          .join(', ');
        hint.textContent = t('settings.extensions.dependencyHint').replace('{name}', names);
        text.appendChild(hint);
      }

      row.append(toggle, text);
      listEl.appendChild(row);
    }
  }
}

export function renderExtensionsSection(container, draft) {
  const intro = document.createElement('p');
  intro.className = 'settings-extensions-intro';
  intro.textContent = t('settings.extensions.intro');
  container.appendChild(intro);
  const list = document.createElement('div');
  list.id = 'settings-extensions-list';
  list.className = 'settings-extensions-list';
  container.appendChild(list);
  renderExtensionsEditor(list, draft);
}

export async function applyExtensionsSection(draft) {
  const next = [...draft.extensionsDisabled].sort();
  const current = [...getDisabledExtensionIds()].sort();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  // Wendet lokal an (Pipeline, UI-Hooks, Event) und persistiert; der
  // settings:set-Broadcast erreicht zusaetzlich alle Fenster inkl. diesem
  // (idempotent). Der Umschalt-Pfad in app-init rendert die Panes neu und
  // re-montiert damit auch diese Seite (Bereichsnavigation zieht nach).
  await applyExtensionsState(draft.extensionsDisabled);
}

// --- Bereich Erweiterungen (extern) (4T-0300, Epic 3E-0053) -----------------------
// Verwaltungs-Oberfläche des Vertrauensmodells. Die Liste kommt aus dem
// Host (Scan-Einträge plus Status); Aktionen laufen asynchron über den
// Host (Warn-Dialog und Entfernen-Bestätigung zeigt der Main lokalisiert).
// Zustands-Änderungen feuern scg:extensions-changed — der Modul-Listener
// unten re-rendert dann den aktiven Bereich; das manuelle Re-Render nach
// jeder Aktion deckt die No-op-Fälle ab (abgebrochener Dialog, Scan ohne
// Änderung).

const EXTERNAL_STATUS_KEYS = {
  active: 'settings.extensionsExternal.status.active',
  inactive: 'settings.extensionsExternal.status.inactive',
  confirm: 'settings.extensionsExternal.status.confirm',
  error: 'settings.extensionsExternal.status.error',
  invalid: 'settings.extensionsExternal.status.invalid',
  incompatible: 'settings.extensionsExternal.status.incompatible',
};

function buildExternalActionButton(labelKey, idSuffix, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn settings-extension-external-action';
  btn.id = `btn-ext-external-${idSuffix}`;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', async () => {
    // Doppel-Klick-Schutz während der asynchronen Aktion (Dialog, IPC).
    btn.disabled = true;
    try {
      await onClick();
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function renderExternalExtensionsList(listEl) {
  if (!listEl.isConnected && listEl.childNodes.length > 0) return;
  listEl.innerHTML = '';
  const rerender = () => {
    if (listEl.isConnected) renderExternalExtensionsList(listEl);
  };
  const entries = externalExtensionEntries();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-extensions-external-empty';
    empty.textContent = t('settings.extensionsExternal.empty');
    listEl.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'settings-extension-external-row';
    row.dataset.extensionId = entry.ok ? entry.manifest.id : entry.dirName;
    row.dataset.status = entry.status;

    const head = document.createElement('div');
    head.className = 'settings-extension-external-head';
    const name = document.createElement('span');
    name.className = 'settings-extension-name';
    name.textContent = entry.ok ? entry.manifest.name : entry.dirName;
    head.appendChild(name);
    if (entry.ok) {
      const version = document.createElement('span');
      version.className = 'settings-extension-external-version';
      version.textContent = entry.manifest.version;
      head.appendChild(version);
    }
    const status = document.createElement('span');
    status.className = 'settings-extension-external-status';
    status.dataset.status = entry.status;
    status.textContent =
      entry.status === 'incompatible'
        ? t(EXTERNAL_STATUS_KEYS.incompatible).replace('{version}', entry.manifest.apiVersion)
        : t(EXTERNAL_STATUS_KEYS[entry.status] || entry.status);
    head.appendChild(status);
    row.appendChild(head);

    if (entry.ok && entry.manifest.description) {
      const desc = document.createElement('div');
      desc.className = 'settings-extension-desc';
      desc.textContent = entry.manifest.description;
      row.appendChild(desc);
    }
    const dir = document.createElement('div');
    dir.className = 'settings-extension-external-path';
    dir.textContent = entry.dir;
    row.appendChild(dir);
    if (entry.lastError) {
      const error = document.createElement('div');
      error.className = 'settings-extension-external-error';
      error.textContent = entry.lastError;
      row.appendChild(error);
    }

    const actions = document.createElement('div');
    actions.className = 'settings-extension-external-actions';
    if (entry.ok) {
      const id = entry.manifest.id;
      if (entry.status === 'active') {
        actions.appendChild(
          buildExternalActionButton(
            'settings.extensionsExternal.action.disable',
            `disable-${id}`,
            async () => {
              await disableExternalExtension(id);
              rerender();
            },
          ),
        );
      } else if (entry.status !== 'incompatible') {
        // inactive/confirm/error: Aktivieren löst den Warn-Dialog aus,
        // wenn die installierte Version nicht bestätigt ist.
        actions.appendChild(
          buildExternalActionButton(
            'settings.extensionsExternal.action.enable',
            `enable-${id}`,
            async () => {
              await enableExternalExtension(id);
              rerender();
            },
          ),
        );
      }
      actions.appendChild(
        buildExternalActionButton(
          'settings.extensionsExternal.action.remove',
          `remove-${id}`,
          async () => {
            await removeExternalExtension(id);
            rerender();
          },
        ),
      );
    }
    if (actions.childNodes.length > 0) row.appendChild(actions);
    listEl.appendChild(row);
  }
}

export function renderExternalExtensionsSection(container) {
  const intro = document.createElement('p');
  intro.className = 'settings-extensions-intro';
  intro.textContent = t('settings.extensionsExternal.intro');
  container.appendChild(intro);

  const list = document.createElement('div');
  list.id = 'settings-extensions-external-list';
  list.className = 'settings-extensions-external-list';
  container.appendChild(list);
  renderExternalExtensionsList(list);

  const footer = document.createElement('div');
  footer.className = 'settings-extension-external-footer';
  footer.appendChild(
    buildExternalActionButton('settings.extensionsExternal.action.rescan', 'rescan', async () => {
      await rescanExternalExtensions();
      if (list.isConnected) renderExternalExtensionsList(list);
    }),
  );
  footer.appendChild(
    buildExternalActionButton(
      'settings.extensionsExternal.action.openDir',
      'open-dir',
      async () => {
        if (typeof api.openExternalExtensionsDir === 'function') {
          await api.openExternalExtensionsDir();
        }
      },
    ),
  );
  container.appendChild(footer);

  // 4T-0927 (Epic 3E-0016): Zugang zu den Entwickler-Werkzeugen, seit dem
  // Entfall des Menueeintrags samt F12 der einzige. Er steht bewusst am Ende
  // und abgesetzt in einem eigenen Block: Er betrifft kein einzelnes Paket,
  // sondern die Diagnose aller, und ist ein Werkzeug und keine Bedien-Funktion
  // der Anwendung. Der erklaerende Satz daneben sagt, wofuer er da ist —
  // ohne ihn waere die Schaltflaeche an dieser Stelle ein Raetsel.
  const diagnose = document.createElement('div');
  diagnose.className = 'settings-extension-external-diagnose';
  const hint = document.createElement('p');
  hint.className = 'settings-extension-external-diagnose-hint';
  hint.textContent = t('settings.extensionsExternal.diagnose.hint');
  diagnose.appendChild(hint);
  diagnose.appendChild(
    buildExternalActionButton(
      'settings.extensionsExternal.action.devTools',
      'devtools',
      async () => {
        if (typeof api.toggleDevTools === 'function') {
          await api.toggleDevTools();
        }
      },
    ),
  );
  container.appendChild(diagnose);
}
