// 4T-0193: window.api-Stub fuer Renderer-Modul-Unit-Tests (jsdom).
// Die Module binden `api` aus modules/api.js beim Laden; app-init.js
// registriert ausserdem Top-Level-IPC-Listener. Der Stub muss deshalb VOR
// dem (dynamischen) Import der Module stehen und alle top-level genutzten
// Funktionen anbieten; alles Weitere wird in den Tests nicht beruehrt.
const noop = () => {};
window.api = {
  onInitialState: noop,
  onWindowDisplayInfo: noop,
  onAppendTabFromOtherWindow: noop,
  onOpenExternal: noop,
  onLanguageChanged: noop,
  // 4T-0204: Top-Level-Listener und Pipeline-Konfiguration der
  // Task-Status-Verwaltung (app-init.js / task-states.js).
  onTaskStatesChanged: noop,
  configureTaskStates: noop,
  // 4T-0284: Pipeline-Konfiguration der Frontmatter-Anzeige
  // (frontmatter-display.js spiegelt den Zustand in den Preload).
  onFrontmatterDisplayChanged: noop,
  configureFrontmatterDisplay: noop,
  // 4T-0292: Erweiterungs-Lebenszyklus (extension-lifecycle.js spiegelt
  // den Schalt-Zustand in die Preload-Pipeline; app-init.js registriert
  // den Broadcast-Listener top-level).
  onExtensionsChanged: noop,
  configureExtensions: noop,
  // 4T-0498 (Epic 3E-0090): Pipeline-Konfiguration der Task-Marker
  // (tasks.js spiegelt Global Filter und Labels in die Preload-Pipeline).
  configureTaskMarkers: noop,
  // 4T-0279: Entwurfs-Aufbau der Einstellungs-Seite liest den Store
  // (readAppearanceFromStore) und persistiert bei Anwenden.
  getSetting: async () => undefined,
  setSetting: async () => {},
  // 4T-0582 (Epic 3E-0107): Der Einstellungs-Bereich Rechtschreibprüfung liest
  // beim Aufbau die Wortliste des Betriebssystem-Wörterbuchs.
  spellcheckListWords: async () => [],
  spellcheckRemoveWord: async () => true,
  spellcheckAddWord: async () => true,
  spellcheckReplace: async () => true,
  // 4T-0635: Der Erinnerungs-Zuhoerer meldet sich seit der Behebung am
  // Modulkopf an, nicht mehr in initReminders(). Ohne diesen Eintrag bricht
  // schon der Modul-Import. Der Handler wird festgehalten, damit ein Test die
  // Meldung des Pruefers nachstellen kann, ohne den Hauptprozess zu brauchen.
  onRemindersDue: (handler) => {
    window.__remindersDueHandler = handler;
  },
  // Die Eintrags-Liste des Erinnerungs-Dialogs zeigt den Dateinamen ueber die
  // Pfad-Bruecke des Preloads; ohne sie bricht das Rendern der Liste ab.
  basename: (p) =>
    String(p || '')
      .split(/[\\/]/)
      .pop(),
};

// Minimales DOM-Geruest fuer Module, die beim Laden Container abfragen
// (app-state.js: panesContainer.querySelectorAll('.pane-group') etc.).
document.body.innerHTML = `
  <div id="panes-container">
    <div class="pane-group" data-pane="0"></div>
    <div class="pane-group" data-pane="1"></div>
    <div class="outer-splitter"></div>
  </div>
  <div id="empty-state" class="hidden"></div>
  <span id="statusbar-hint"></span>
`;
