// --- Unterseiten-Breadcrumb (4T-000341, Epic 3E-000061) -------------------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import {
  isSubpageBasename,
  lastSegment,
  parentChain,
  toLogicalName,
} from '../../../shared/subpages.js';
import { getPaneEls, state } from '../app/app-state.js';
import { openInPane } from '../tabs/tabs.js';

// Zeigt ueber dem Dokument die Eltern-Kette der aktiven Unterseite mit
// klickbaren Segmenten. Zwei Instanzen pro Pane (Render- und Source-Pane);
// data-host steuert den Ansichts-Modus: 'rendered' fuer Reading/Geteilt,
// 'source' fuer Live. Normale Seiten, Handbuch-/System-Tabs und der reine
// Quelltext-Modus bleiben ohne Breadcrumb. Portable- und PDF-Export sind
// nicht betroffen (Element liegt ausserhalb des markdown-body; Print-CSS
// blendet zusaetzlich aus). Nicht aufloesbare Zwischen-Ebenen erscheinen
// gekennzeichnet und sind nicht klickbar (Stil analog gebrochener Links).
const subpageBreadcrumbTokens = [0, 0];

export async function updateSubpageBreadcrumb(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.subpageBreadcrumbs || els.subpageBreadcrumbs.length === 0) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const token = ++subpageBreadcrumbTokens[paneIdx];
  const hideAll = () => {
    for (const el of els.subpageBreadcrumbs) {
      el.hidden = true;
      el.innerHTML = '';
    }
  };
  const base =
    tab && tab.path && !tab.manualPage && !tab.systemPage
      ? api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, '')
      : '';
  if (!base || !isSubpageBasename(base)) {
    hideAll();
    return;
  }
  // Eltern-Kette aufloesen: erst die Datei im eigenen Ordner (Konvention),
  // dann eindeutiger Index-Treffer; sonst als fehlend kennzeichnen.
  const resolvedChain = [];
  for (const ancestor of parentChain(base)) {
    let target = null;
    try {
      const cand = await api.resolveLink(tab.path, ancestor + '.md');
      if (cand && (await api.fileExists(cand))) {
        target = cand;
      } else {
        const idx = await api.resolveWikiTargetInIndex(tab.path, toLogicalName(ancestor));
        if (idx && idx.status === 'ready' && idx.candidates.length === 1) {
          target = idx.candidates[0];
        }
      }
    } catch {
      /* unaufloesbar — als fehlend kennzeichnen */
    }
    resolvedChain.push({ ancestor, target });
  }
  // Async-Race: Tab koennte inzwischen gewechselt haben.
  if (token !== subpageBreadcrumbTokens[paneIdx]) return;
  const buildInto = (el) => {
    el.innerHTML = '';
    const addSep = () => {
      const sep = document.createElement('span');
      sep.className = 'subpage-crumb-sep';
      sep.textContent = '/';
      el.appendChild(sep);
    };
    resolvedChain.forEach((item, i) => {
      if (i > 0) addSep();
      const label = lastSegment(item.ancestor);
      if (item.target) {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'subpage-crumb';
        a.textContent = label;
        a.title = item.target;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openInPane(paneIdx, [item.target]);
        });
        el.appendChild(a);
      } else {
        const s = document.createElement('span');
        s.className = 'subpage-crumb is-missing';
        s.textContent = label;
        s.title = t('subpages.crumbMissing');
        el.appendChild(s);
      }
    });
    addSep();
    const current = document.createElement('span');
    current.className = 'subpage-crumb-current';
    current.textContent = lastSegment(base);
    el.appendChild(current);
  };
  const mode = tab.viewMode || 'rendered';
  for (const el of els.subpageBreadcrumbs) {
    const host = el.dataset.host;
    const show = host === 'rendered' ? mode === 'rendered' || mode === 'split' : mode === 'live';
    if (!show) {
      el.hidden = true;
      el.innerHTML = '';
      continue;
    }
    buildInto(el);
    el.hidden = false;
  }
}
