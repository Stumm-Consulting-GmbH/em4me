// 4T-000277 (Epic 3E-000049): Menü-State-Normalisierung für die Menü-Factory.
//
// Der Renderer meldet den menü-relevanten Stand pro Fenster
// (reportMenuStateNow in tabs.js); diese Funktion bildet ihn zusammen mit
// den Store-Werten auf das State-Objekt ab, das buildMenu (menu.js)
// erwartet. Electron-frei ausgelagert, damit der Durchreich-Vertrag
// unit-testbar ist — Regression 4T-000277: manualTab wurde vom Renderer seit
// 4T-000213 gemeldet, im früheren getMenuState (main.js) aber nicht
// durchgereicht; die Menü-Einträge Speichern/Speichern unter/Bearbeiten
// blieben bei Handbuch-Tabs fälschlich aktiv (Klick war nur
// renderer-seitig inert).
'use strict';

// 4T-000626 (Epic 3E-000119): Varianten-Listen des Untermenüs
// „Sidebar-Anordnungen" — je Gruppe nur Einträge mit nicht-leerer
// String-ID und nicht-leerem Namen.
function normalizeVariantEntries(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (v) =>
        v && typeof v.id === 'string' && v.id !== '' && typeof v.name === 'string' && v.name !== '',
    )
    .map((v) => ({ id: v.id, name: v.name }));
}

function normalizeSidebarVariants(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    global: normalizeVariantEntries(r.global),
    area: normalizeVariantEntries(r.area),
    areaName: typeof r.areaName === 'string' && r.areaName !== '' ? r.areaName : null,
  };
}

// base: zuletzt vom Renderer gemeldeter Stand (kann fehlen, z.B. vor dem
// ersten Report eines frischen Fensters). stored: vom Aufrufer aus dem
// Settings-Store gelesene Werte plus effektive Menü-Accelerators.
function normalizeMenuState(base, stored) {
  const b = base || {};
  const s = stored || {};
  return {
    locale: b.locale || 'en',
    viewMode: b.viewMode || 'rendered',
    lineNumbers: b.lineNumbers !== undefined ? b.lineNumbers : true,
    wordWrap: !!b.wordWrap,
    togglesEnabled: !!b.togglesEnabled,
    hasActiveTab: !!b.hasActiveTab,
    // 4T-000213/4T-000277: Read-only-Kennungen des aktiven Tabs — Handbuch-
    // Seiten deaktivieren Speichern/Bearbeiten, System-Seiten
    // (Einstellungen) zusätzlich View-Modi und Export.
    manualTab: !!b.manualTab,
    systemTab: !!b.systemTab,
    restoreSession: !!s.restoreSession,
    autoSave: !!s.autoSave,
    // 4T-000322 (Epic 3E-000058): Bereichs-Bindung der App dieses Fensters
    // (main-seitig aus der App-Registry, aktiviert "Bereich schliessen").
    hasArea: !!s.hasArea,
    // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Zuordnung der App dieses
    // Fensters (aktiviert "Arbeitsbereich schliessen", dimmt "Als
    // Arbeitsbereich speichern") plus die Liste fuer das Untermenue
    // ([{ id, name, color, open }], main-seitig aus Ablage und Registry).
    hasWorkspace: !!s.hasWorkspace,
    workspaces: Array.isArray(s.workspaces) ? s.workspaces : [],
    // 4T-000843 (Epic 3E-000147): aktives Buch der App dieses Fensters
    // (main-seitig aus der Buch-Bindung, aktiviert "Buch schliessen").
    hasBook: !!s.hasBook,
    // 4T-000867/4T-000881 (Epic 3E-000162): aktives Regal der App dieses Fensters
    // (aktiviert "Buecherregal schliessen"). 4T-000881: Das Feld wurde bis dahin
    // nicht durchgereicht; der Menuepunkt blieb dadurch immer deaktiviert.
    hasShelf: !!s.hasShelf,
    recentFiles: Array.isArray(s.recentFiles) ? s.recentFiles : [],
    // 4T-000325 (Epic 3E-000058): zuletzt geoeffnete Bereiche.
    recentAreas: Array.isArray(s.recentAreas) ? s.recentAreas : [],
    // 4T-000888 (Epic 3E-000168): zuletzt geöffnete Bücher und Bücherregale —
    // dieselben Listen-Regeln wie bei den Bereichen, eigener Store-Schlüssel.
    recentBooks: Array.isArray(s.recentBooks) ? s.recentBooks : [],
    recentShelves: Array.isArray(s.recentShelves) ? s.recentShelves : [],
    // 4T-000013: Häkchen-Stand für das Gliederungs-Toggle im Ansicht-Menü.
    foldGutter: b.foldGutter !== undefined ? b.foldGutter : true,
    // 4T-000568 (Epic 3E-000104): geordnete Panel-Liste für das Panel-
    // Untermenü ([{ id, visible }], ersetzt die früheren xxxVisible-
    // Einzel-Flags — vier davon wurden hier nie durchgereicht, deren
    // Häkchen blieben dauerhaft leer). Ungültige Einträge entfallen.
    panels: Array.isArray(b.panels)
      ? b.panels
          .filter((p) => p && typeof p.id === 'string' && p.id !== '')
          .map((p) => ({ id: p.id, visible: !!p.visible }))
      : [],
    // 4T-000626 (Epic 3E-000119): Sidebar-Varianten-Listen für das Untermenü
    // „Sidebar-Anordnungen" ({ global, area, areaName }). Ungültige
    // Einträge entfallen (Muster panels).
    sidebarVariants: normalizeSidebarVariants(b.sidebarVariants),
    // 4T-000019: Fokus-Modus, Typewriter-Scroll und Edit-Modus pro Fenster
    // bzw. aktivem Tab.
    focusMode: !!b.focusMode,
    typewriterScroll: !!b.typewriterScroll,
    editMode: !!b.editMode,
    // 4T-000697 (Epic 3E-000141): Kollaps-Zustand der linken/rechten Sidebar-
    // Spalte der aktiven Pane-Group (Menü-Häkchen der beiden direkten
    // Ansichtsmenü-Einträge).
    sidebarCollapsedLeft: !!b.sidebarCollapsedLeft,
    sidebarCollapsedRight: !!b.sidebarCollapsedRight,
    // 4T-000070: Scroll-Synchronisation pro aktivem Tab.
    scrollSyncEnabled: !!b.scrollSyncEnabled,
    // 4T-000030: Theme-Vorzug für das Radio-Untermenü 'Ansicht -> Theme'.
    themePref:
      s.themePref === 'light' || s.themePref === 'dark' || s.themePref === 'system'
        ? s.themePref
        : 'system',
    // 4T-000207: effektive Menü-Accelerators (Registry plus Store-Overrides).
    hotkeys: s.hotkeys,
    // 4T-000294: Kommandos effektiv deaktivierter Erweiterungen (Menü-
    // Einträge dazu entfallen in der Menü-Factory).
    disabledCommands: Array.isArray(s.disabledCommands) ? s.disabledCommands : [],
  };
}

module.exports = { normalizeMenuState };
