// === 4T-0073 (Epic 3E-0013): Outgoing-Links-Panel ===========================
// 4T-0990 (Epic 3E-0196): aus panels.js in den Ordner panels/ ausgezogen,
// samt eigener Panel-Registrierung am Modul-Ende.
// Extrahiert Wiki-Links, Wiki-Embeds und interne Markdown-Links der aktiven
// Datei. Pro Re-Render Token-Walk ueber den Text — kein globaler Index. Die
// Reihenfolge im Panel folgt der Dokument-Reihenfolge.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { showAliasDialog } from '../dialogs/dialogs.js';
// 4T-0294 (Epic 3E-0052): Outgoing-Links gehören zur Wiki-Link-Erweiterung —
// ihre Auswertung ist Wiki-Syntax-Auswertung. Deaktiviert verschwindet das
// Panel; die Sichtbarkeits-Preference bleibt persistiert und greift beim
// Wiedereinschalten.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { openInPane, reportMenuStateNow } from '../tabs/tabs.js';
import { normalizedAnchorId, scrollToAnchorAfterOpen } from '../views/anchor-navigation.js';
import { tryResolveByAlias } from '../views/link-navigation.js';
import { isAllEmpty, persistSetting, showStatusbarHint } from '../views/views.js';
// 4T-0337 (Epic 3E-0061): Unterseiten — relative Ziele expandieren und
// Index-Fallback im Outgoing-Klick (Paritaet zum Wiki-Link-Klick-Pfad).
import {
  expandRelativeTarget,
  isRelativeTarget,
  toFileBasename,
} from '../../../shared/subpages.js';

import { applySidebarVisibility } from './panels.js';

// Erkennung (R3-14/4T-0183: Kommentar an die implementierte Regex
// angeglichen — die Nur-Anker-Form [[#Heading]] wird nicht erfasst):
//   - Wiki-Link        [[Ziel]] / [[Ziel|Label]] / [[Ziel#Heading]]
//   - Wiki-Embed       ![[Ziel]] (Bild, PDF, Markdown, Other) plus Label/Anchor-Form
//   - Markdown-Link    [Text](pfad.md), nur intern (kein http/https/mailto/tel/ftp)
//
// Bereinigung: Fenced-Code-Bloecke (``` und ~~~) werden uebersprungen, ebenso
// Inline-Code (`...`-Bereiche pro Zeile maskiert), damit ein `[[foo]]` im
// Code-Beispiel keinen Eintrag erzeugt. Markdown-Image-Syntax (`![alt](...)`)
// wird ausgenommen, weil sie Asset-Einbettung ist und nicht in den Vernetzungs-
// Blick gehoert; Wiki-Bild-Embeds werden hingegen mitgelistet.
export function extractOutgoingLinks(text) {
  const links = [];
  if (!text) return links;
  const lines = text.split(/\r?\n/);
  // R3-14 (4T-0183): oeffnenden Fence-Marker merken und nur mit dem
  // passenden Typ schliessen — vorher toggelte jeder ```- ODER ~~~-
  // Zeilenstart den Zustand, sodass z.B. eine ```-Zeile innerhalb eines
  // ~~~-Fences den Block faelschlich beendete.
  let inFence = false;
  let fenceChar = '';
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    // Fenced-Code-Wechsel erkennen (am Anfang der Zeile, optional eingerueckt).
    const fenceMatch = original.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }
    if (inFence) continue;
    // Inline-Code pro Zeile maskieren, damit `[[foo]]` in `...` nicht matcht.
    const line = original.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));

    // Wiki-Link / Wiki-Embed
    //   group 1: optionales '!' fuer Embed
    //   group 2: Ziel-Datei (vor # und vor |)
    //   group 3: optionaler Anker (Heading oder ^block-id)
    //   group 4: optionales Label/Width (nach |)
    const wikiRe = /(!)?\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g;
    let m;
    while ((m = wikiRe.exec(line)) !== null) {
      const isEmbed = m[1] === '!';
      const target = m[2].trim();
      const anchor = m[3] ? m[3].trim() : '';
      links.push({
        type: isEmbed ? 'embed' : 'wikiLink',
        target,
        anchor,
        line: i + 1,
        snippet: snippetAroundIndex(original, m.index),
      });
    }

    // Markdown-Link. Image-Syntax `![alt](url)` ausnehmen: wenn das Zeichen
    // direkt vor '[' ein '!' ist, ueberspringen wir den Treffer.
    const mdRe = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    while ((m = mdRe.exec(line)) !== null) {
      if (m.index > 0 && line[m.index - 1] === '!') continue;
      const label = m[1].trim();
      const url = m[2].trim();
      // Externe URLs und Schema-Pseudo-URLs ausnehmen.
      if (/^(?:https?:|mailto:|tel:|ftp:|file:|#)/i.test(url)) continue;
      // In-Page-Anker `[Text](#anker)` werden oben durch `^#` schon ausgesperrt.
      // Anker aus dem Pfad extrahieren.
      let pureUrl = url;
      let anchor = '';
      const hashIdx = url.indexOf('#');
      if (hashIdx >= 0) {
        pureUrl = url.substring(0, hashIdx);
        anchor = url.substring(hashIdx + 1);
      }
      if (!pureUrl) continue;
      links.push({
        type: 'markdownLink',
        target: pureUrl,
        anchor,
        label,
        line: i + 1,
        snippet: snippetAroundIndex(original, m.index),
      });
    }
  }
  return links;
}

export function snippetAroundIndex(line, idx) {
  // R3-12 (4T-0183): Fenster um den Treffer-Index zentrieren. Vorher
  // zeigten lange Zeilen unabhaengig von der Treffer-Position die ersten
  // 80 Zeichen — der Link selbst war dann nicht im Snippet sichtbar.
  const raw = String(line || '');
  const trimmed = raw.trim();
  if (trimmed.length <= 80) return trimmed;
  const center = Math.max(0, Math.min(raw.length, idx | 0));
  let start = Math.max(0, center - 30);
  const end = Math.min(raw.length, start + 80);
  if (end - start < 80) start = Math.max(0, end - 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < raw.length ? '…' : '';
  return prefix + raw.substring(start, end).trim() + suffix;
}

export function scheduleOutgoingRender(paneIdx) {
  if (!state.outgoing) return;
  const timers = state.outgoing.updateTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    renderOutgoingLinks(paneIdx);
  }, 150);
}

export function renderOutgoingLinks(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outgoingResults || !els.outgoingStatus) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  els.outgoingResults.innerHTML = '';
  els.outgoingStatus.hidden = true;
  els.outgoingStatus.textContent = '';
  if (!tab) {
    els.outgoingStatus.hidden = false;
    els.outgoingStatus.textContent = t('outgoing.empty');
    return;
  }
  const links = extractOutgoingLinks(tab.content || '');
  if (links.length === 0) {
    els.outgoingStatus.hidden = false;
    els.outgoingStatus.textContent = t('outgoing.empty');
    return;
  }
  for (const link of links) {
    const entry = document.createElement('div');
    entry.className = 'outgoing-entry';

    const meta = document.createElement('span');
    meta.className = 'outgoing-meta';
    meta.textContent = t('outgoing.line').replace('{line}', String(link.line));
    entry.appendChild(meta);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'outgoing-type-badge outgoing-type-' + link.type;
    const typeKey =
      link.type === 'embed'
        ? 'outgoing.type.embed'
        : link.type === 'markdownLink'
          ? 'outgoing.type.markdownLink'
          : 'outgoing.type.wikiLink';
    const typeShort = link.type === 'embed' ? 'E' : link.type === 'markdownLink' ? 'M' : 'W';
    typeBadge.textContent = typeShort;
    typeBadge.title = t(typeKey);
    entry.appendChild(typeBadge);

    const targetEl = document.createElement('span');
    targetEl.className = 'outgoing-target';
    targetEl.textContent = link.target + (link.anchor ? '#' + link.anchor : '');
    entry.appendChild(targetEl);

    if (link.snippet) {
      const snip = document.createElement('div');
      snip.className = 'outgoing-snippet';
      snip.textContent = link.snippet;
      entry.appendChild(snip);
    }

    entry.title = link.snippet || '';
    entry.addEventListener('click', () => {
      openOutgoingTarget(paneIdx, link, tab.path);
    });
    els.outgoingResults.appendChild(entry);
  }
}

export async function openOutgoingTarget(paneIdx, link, sourcePath) {
  if (!link || !sourcePath) return;
  try {
    // resolveLink resolvt nur den Dateipfad gegen das Quelldatei-Verzeichnis;
    // die `.md`-Ergaenzung fuer Wiki-Links/Embeds ohne Extension liegt sonst
    // im wikiLinksPlugin (src/shared/markdown/plugins.js). Hier muessen wir die gleiche Logik
    // anwenden, sonst zeigt resolveLink auf `<dir>/ziel` und fileExists
    // schlaegt fehl. Markdown-Links tragen die Extension bereits im Quelltext.
    let resolveTarget = link.target;
    if (link.type === 'wikiLink' || link.type === 'embed') {
      // 4T-0337 (Epic 3E-0061): relative Unterseiten-Ziele ('/Name', '..')
      // gegen die Quell-Datei expandieren (U+2215-Form).
      if (isRelativeTarget(resolveTarget)) {
        const ownBase = api.basename(sourcePath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
        const expanded = expandRelativeTarget(ownBase, resolveTarget);
        if (!expanded) {
          showStatusbarHint('outgoing.notOpenable', { duration: 2500, error: true });
          return;
        }
        resolveTarget = expanded;
      }
      const hasExtension = /\.[a-z0-9]{1,8}$/i.test(resolveTarget);
      if (!hasExtension) resolveTarget += '.md';
    }
    const resolved = await api.resolveLink(sourcePath, resolveTarget);
    if (!resolved) return;
    const exists = await api.fileExists(resolved);
    if (!exists) {
      // Alias-Fallback nur fuer Wiki-Links und Embeds (Markdown-Links sind
      // explizite Pfade, dort gibt es keine Aliases).
      if (link.type === 'wikiLink' || link.type === 'embed') {
        // 4T-0337: deterministischer Same-Dir-Versuch ('/' -> U+2215) vor
        // dem Index-Fallback, wie im Wiki-Link-Klick-Pfad.
        if (/[/\\]/.test(resolveTarget)) {
          const translated = toFileBasename(resolveTarget.replace(/\\/g, '/'));
          const cand = await api.resolveLink(sourcePath, translated);
          if (cand && (await api.fileExists(cand))) {
            const realPane = await openInPane(paneIdx, [cand]);
            if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
            return;
          }
        }
        // 4T-0337: Index-Fallback wie im Wiki-Link-Klick-Pfad (B-13 plus
        // Unterseiten-Form), damit Panel-Klicks dieselben Ziele erreichen.
        const logical = resolveTarget
          .replace(/\.(md|markdown|mdown|mkd)$/i, '')
          .replace(/\\/g, '/')
          .replace(/^(\.\.?\/)+/, '');
        try {
          const idx = await api.resolveWikiTargetInIndex(sourcePath, logical);
          if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
            const target =
              idx.candidates.length === 1
                ? idx.candidates[0]
                : await showAliasDialog(logical, idx.candidates);
            if (target) {
              const realPane = await openInPane(paneIdx, [target]);
              if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
            }
            return;
          }
        } catch {
          /* Index nicht verfuegbar — weiter zum Alias-Fallback */
        }
        const aliasTarget = await tryResolveByAlias(sourcePath, resolved);
        if (aliasTarget) {
          // R3-06/R4-09 (4T-0186): Anker normalisieren (Slug bzw. ^-Strip)
          // und der tatsaechlichen Ziel-Pane folgen.
          const realPane = await openInPane(paneIdx, [aliasTarget]);
          if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
          return;
        }
      }
      // W-16 (4T-0309): kein stiller No-op — Ziel existiert nicht (und kein
      // Alias-Treffer). Rueckmeldung wie bei Backlinks/Bookmarks.
      showStatusbarHint('outgoing.notOpenable', { duration: 2500, error: true });
      return;
    }
    const isMd = await api.isMarkdownPath(resolved);
    if (!isMd) {
      // W-16 (4T-0309): Nicht-Markdown-Ziel — Klick blieb sonst reaktionslos.
      showStatusbarHint('outgoing.notOpenable', { duration: 2500, error: true });
      return;
    }
    const realPane = await openInPane(paneIdx, [resolved]);
    if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
  } catch (err) {
    console.warn('[4T-0073] Outgoing-Link konnte nicht geoeffnet werden', err);
  }
}

export function applyOutgoingVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outgoingSection) return;
  // 4T-0075: Outgoing-Links im Empty-State zwangsweise unsichtbar.
  // 4T-0294: bei deaktivierter Wiki-Link-Erweiterung ebenso.
  const visible =
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.outgoing.visibleByPane[paneIdx];
  els.outgoingSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderOutgoingLinks(paneIdx);
  }
  updateOutgoingToggleButton();
}

export function updateOutgoingToggleButton() {
  const btn = document.getElementById('btn-outgoing-links');
  if (!btn) return;
  const visible = !!state.outgoing.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleOutgoingPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.outgoing.visibleByPane[paneIdx];
  state.outgoing.visibleByPane[paneIdx] = next;
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('outgoing', paneIdx);
  applyOutgoingVisibility(paneIdx);
  await persistOutgoingSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistOutgoingSettings() {
  await persistSetting('outgoing.visibleColumn0', !!state.outgoing.visibleByPane[0]);
  await persistSetting('outgoing.visibleColumn1', !!state.outgoing.visibleByPane[1]);
}

export async function loadOutgoingSettings() {
  const v0 = await api.getSetting('outgoing.visibleColumn0');
  const v1 = await api.getSetting('outgoing.visibleColumn1');
  state.outgoing.visibleByPane[0] = !!v0;
  state.outgoing.visibleByPane[1] = !!v1;
}

// === 4T-0287 (Epic 3E-0051): Panel-Registrierung =============================
// Import-Seiteneffekt: getVisible spiegelt die effektive Sichtbarkeits-Logik
// aus applyOutgoingVisibility inklusive Empty-State-Override (4T-0075).
registerSidebarPanel({
  id: 'outgoing',
  titleKey: 'outgoing.title',
  buttonId: 'btn-outgoing-links',
  sectionClass: 'sidebar-outgoing',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('wiki-links') &&
    !!(state.outgoing && state.outgoing.visibleByPane[paneIdx]),
  applyVisibility: applyOutgoingVisibility,
  toggle: toggleOutgoingPanel,
});
