// 4T-0213 (Epic 3E-0042): Handbuch im Tab-System.
//
// Handbuch-Seiten oeffnen als pfadlose read-only Tabs (tab.manualPage =
// Seiten-ID). Die Seiten-Registry liegt in src/shared/manual-pages.js
// (gemeinsame Quelle mit dem Main-seitigen Loader help:getManualPage).
// Gebuendelte Seiten kommen per IPC aus src/i18n/help/<id>.<lang>.md
// (Fallback Englisch im Main); generierte Seiten liefern die Generator-
// Funktionen in diesem Modul (4T-0212: Funktions-Tabelle, Tastenkuerzel).
//
// Pfadlose Tabs sind ohne Sonderbehandlung von Session-Persistenz
// (buildPanesSnapshot filtert path-lose Tabs), Auto-Save (uebergeht Tabs
// ohne Pfad), File-Watcher und Recent-Liste ausgenommen; die Read-only-
// Durchsetzung haengt an tab.editMode === false plus Guards in views.js
// (toggleEditMode, saveTab/saveTabAs, toggleTaskFromRendered) und
// live-widgets.js (Task-Klick).
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import { MANUAL_PAGES, manualPageById } from '../../shared/manual-pages.js';
import { createTab, state } from './app-state.js';
// 4T-0212: Quellen der generierten Seiten — Funktions-Gruppen und
// Registry-Shortcut-Zeilen samt Tasten-Lokalisierung. Der Modul-Zyklus
// (autocomplete-help -> tabs -> manual) ist unkritisch, weil alle
// Zugriffe erst zur Laufzeit in den Generator-Funktionen erfolgen.
import {
  HELP_FEATURE_GROUPS,
  buildHelpShortcutRows,
  localizeKey,
  splitShortcutKeys,
} from './autocomplete-help.js';
import { activatePane, activateTab } from './tabs.js';
import { applyAllLayouts, invalidatePaneRenderCache, persistState } from './views.js';

// --- Generatoren der 'generated'-Seiten (4T-0212) ---------------------------
// Beide Seiten entstehen zur Laufzeit als Markdown, damit alle vier
// View-Modi inklusive Quellcode-Ansicht sauber funktionieren und keine
// Doppelpflege zu den kanonischen Quellen (help.feature.*-Keys bzw.
// Kommando-Registry) entsteht.

// Pipe-Zeichen fuer Tabellen-Zellen escapen: vorhandene `\|`-Escapes der
// Quell-Strings zuerst neutralisieren, dann einheitlich neu escapen —
// sonst wuerde ein bereits escaptes Pipe doppelt maskiert.
export function escapeTableCell(value) {
  return String(value == null ? '' : value)
    .replace(/\\\|/g, '|')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

// Funktions-Seite: H2 pro Gruppe aus HELP_FEATURE_GROUPS, darunter eine
// dreispaltige Pipe-Tabelle (Funktion, Beschreibung, Zugang). Kurzname-
// und Zugang-Keys leiten sich aus dem Feature-Key ab
// (help.feature.<name> -> help.featureName.<name> / help.featureAccess.<name>).
export function generateFunctionsPage() {
  const lines = [];
  lines.push(`# ${t('manual.page.functions.title')}`);
  lines.push('');
  lines.push(t('manual.functions.intro'));
  lines.push('');
  for (const group of HELP_FEATURE_GROUPS) {
    lines.push(`## ${t(group.groupKey)}`);
    lines.push('');
    lines.push(
      `| ${t('manual.functions.colFunction')} | ${t('manual.functions.colDescription')} | ${t('manual.functions.colAccess')} |`,
    );
    lines.push('|---|---|---|');
    for (const featureKey of group.features) {
      const name = featureKey.replace('help.feature.', '');
      const nameCell = escapeTableCell(t(`help.featureName.${name}`));
      const descCell = escapeTableCell(t(featureKey));
      const accessCell = escapeTableCell(t(`help.featureAccess.${name}`));
      lines.push(`| **${nameCell}** | ${descCell} | ${accessCell} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Tastenkuerzel-Seite: Registry-Zeilen mit den effektiven Bindings
// (inklusive Nutzer-Overrides) plus statische Rest-Liste, identische
// Quelle wie der bisherige Popup-Reiter (buildHelpShortcutRows). Tasten
// erscheinen als Inline-Code (rendert klar und bleibt im Quellcode-Modus
// lesbar; Entscheidungspunkt aus dem Lösungsansatz, am gerenderten
// Ergebnis gewaehlt), lokalisiert ueber die bestehende localizeKey-Logik.
export function generateShortcutsPage() {
  const lines = [];
  lines.push(`# ${t('manual.page.shortcuts.title')}`);
  lines.push('');
  lines.push(t('help.shortcutsConfigurableNote'));
  lines.push('');
  lines.push(`| ${t('manual.shortcuts.colKeys')} | ${t('manual.shortcuts.colDescription')} |`);
  lines.push('|---|---|');
  for (const row of buildHelpShortcutRows()) {
    const keys = row.keys
      .map((k) => '`' + splitShortcutKeys(k).map(localizeKey).join('+') + '`')
      .join(' / ');
    lines.push(`| ${keys} | ${escapeTableCell(t(row.descKey))} |`);
  }
  return lines.join('\n');
}

const MANUAL_GENERATORS = {
  functions: generateFunctionsPage,
  shortcuts: generateShortcutsPage,
};

// Inhalt einer Seite laden (gebuendelt, IPC mit EN-Fallback) bzw.
// generieren. Liefert bei jedem Fehlerfall den lokalisierten Fehlertext,
// damit der Tab nie leer erscheint (Muster help.perspectiveTable.loadError).
export async function manualPageContent(pageId) {
  const page = manualPageById(pageId);
  if (!page) return t('manual.loadError');
  if (page.source === 'generated') {
    const generate = MANUAL_GENERATORS[page.id];
    return generate ? generate() : t('manual.loadError');
  }
  try {
    const md = await api.getManualPageContent(page.id, state.language || 'en');
    return md || t('manual.loadError');
  } catch {
    return t('manual.loadError');
  }
}

export function findManualTabAcrossPanes(pageId) {
  for (let p = 0; p < state.panes.length; p++) {
    const idx = state.panes[p].tabs.findIndex((tb) => tb.manualPage === pageId);
    if (idx >= 0) return { paneIdx: p, tabIdx: idx };
  }
  return null;
}

// Oeffnet eine Handbuch-Seite als read-only Tab in der aktiven Pane bzw.
// aktiviert den bestehenden Tab (Einfach-Instanz pro Fenster, Muster
// Datei-Links: kein Duplikat). Start-Modus ist immer 'rendered',
// unabhaengig von der Standard-Ansicht fuer neue Tabs (Hilfe wird gelesen,
// nicht bearbeitet); danach sind alle vier Modi frei waehlbar.
export async function openManualPage(pageId) {
  const page = manualPageById(pageId);
  if (!page) return;
  const existing = findManualTabAcrossPanes(pageId);
  if (existing) {
    activatePane(existing.paneIdx);
    activateTab(existing.paneIdx, existing.tabIdx);
    return;
  }
  const content = await manualPageContent(page.id);
  const targetPane = state.activePaneIndex;
  const tab = createTab(null, content, { viewMode: 'rendered' });
  tab.manualPage = page.id;
  state.panes[targetPane].tabs.push(tab);
  activatePane(targetPane);
  activateTab(targetPane, state.panes[targetPane].tabs.length - 1);
  applyAllLayouts();
  persistState();
}

// Handbuch-Link-Resolver: Links zwischen Handbuch-Seiten stehen in den
// Quellen als gewoehnliche relative Markdown-Links '<id>.md' (sauber
// lesbar im Quellcode-Modus) und werden hier gegen die Registry statt
// gegen das Dateisystem aufgeloest. Liefert die Seiten-ID oder null.
export function resolveManualHref(href) {
  const m = String(href || '').match(/^([a-z0-9-]+)\.md$/i);
  if (!m) return null;
  const page = manualPageById(m[1].toLowerCase());
  return page ? page.id : null;
}

// Offene Handbuch-Tabs neu laden bzw. generieren — beim Sprachwechsel
// (Inhalt und Tab-Titel wechseln mit) und bei Daten-Aenderungen, die
// generierte Seiten betreffen (4T-0212: Hotkey-Overrides). Das Neu-
// Zeichnen uebernimmt der Aufrufer (renderAllPanes laeuft in
// applyLanguageChange ohnehin).
export async function refreshOpenManualTabs() {
  let any = false;
  for (let p = 0; p < state.panes.length; p++) {
    for (const tab of state.panes[p].tabs) {
      if (!tab.manualPage) continue;
      const content = await manualPageContent(tab.manualPage);
      tab.content = content;
      tab.originalContent = content;
      tab.dirty = false;
      any = true;
    }
  }
  if (any) invalidatePaneRenderCache();
  return any;
}

// Verdrahtungs-Schnittstelle zum Oeffnen einer Seite ohne direkten
// Modul-Import (Muster scg:taskstates-changed): genutzt von der E2E-Suite
// und ab 4T-0216 vom Hilfe-Einstieg (menu:openHelp -> Ueberblicksseite).
document.addEventListener('scg:open-manual-page', (ev) => {
  const pageId = ev && ev.detail && ev.detail.pageId;
  if (pageId) openManualPage(pageId);
});

// Re-Export fuer Konsumenten, die nur die Registry brauchen (z.B. die
// Ueberblicks-Link-Pruefung der E2E-Suite via Bundle-Pfad nicht noetig —
// Tab-Titel laufen ueber tabDisplayName in app-state.js).
export { MANUAL_PAGES };
