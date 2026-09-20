// 4T-001588 (Story 4S-000904, Epic 3E-000160): Die Verteilung einer
// Einstellungs-Änderung an die offenen Fenster.
//
// **Warum eigenes Modul.** Der Block stand bis hierher im Rumpf von
// `settings:set` (`settings.js:57-307`) und war damit nur über einen
// IPC-Aufruf erreichbar. Das Einlesen einer Austausch-Datei schreibt aber im
// Hauptprozess, und ein Schreibvorgang ohne diese Verteilung hinterlässt eine
// Anwendung, die den alten Stand im Speicher hält — beim allgemeinen
// Lesezeichen-Baum belegt: Der Anzeige-Prozess schreibt ihn als GANZES zurück
// (`bookmarks-tree.js:228`) und überschriebe damit beim nächsten
// Lesezeichen-Handgriff, was eben eingelesen wurde.
//
// Der Ausweg ist keine zweite Verteilung, sondern eine Naht: Der Block ist
// unverändert hierher gewandert, `settings:set` ruft ihn auf, und das Einlesen
// ruft denselben. **Keine Verhaltens-Änderung** — die einzige Anpassung ist,
// dass das auslösende Fenster als Wert hereinkommt statt aus dem Ereignis
// gelesen zu werden; `null` bedeutet «kein auslösendes Fenster», und dann
// bekommen alle Fenster die Meldung.
//
// Eigener Zustand: keiner. Der Broadcast-Weg läuft bewusst weiterhin über
// `BrowserWindow.getAllWindows()` und nicht über `broadcast()`; eine
// Angleichung wäre eine Verhaltens-Änderung (4T-000999, Stolperstein 1).
'use strict';

const { SPELLCHECK_KEY } = require('../../shared/spellcheck');
// 4T-001761 (Epic 3E-000253): Der Umfang des Datensatz-Bestands im Index haengt
// am Schalter der Erweiterung «Datenbank»; wird er umgelegt, ist jeder stehende
// Index nach der alten Regel gebaut.
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { setzeDatensatzErfassung } = require('../index/index-schalter.js');
const { alleIndizesNeuAufbauen } = require('../backlinks.js');
const { CLOCK_ALARMS_KEY } = require('../../shared/clock/clock-alarms.js');
const { CLOCK_TIMERS_KEY } = require('../../shared/clock/clock-timers.js');

// Schlüssel mit eigenem Verteil-Zweig. Ein Aufrufer, der einen ÜBERGEORDNETEN
// Pfad schreibt (das Einlesen schreibt `sidebar` als Ganzes, nicht
// `sidebar.layout`), findet hier die Kind-Schlüssel, für die er die Verteilung
// nachziehen muss. Der Gleichlauf mit den Zweigen unten hängt nicht am
// Gedächtnis: Ein Wächter-Prüffall liest die Zweige aus dem Quelltext und hält
// sie gegen diese Liste.
const VERTEIL_SCHLUESSEL = [
  SPELLCHECK_KEY,
  CLOCK_ALARMS_KEY,
  CLOCK_TIMERS_KEY,
  'restoreSession',
  'autoSave',
  'language',
  'taskStates',
  'bookmarksTree',
  'tasksConfig',
  'remindersConfig',
  'render.showFrontmatter',
  'render.headingNumbering',
  'render.frontmatterExpanded',
  'scripts.run',
  'extensions.disabled',
  'extensionsExternal.enabled',
  'sidebar.layout',
  'sidebar.layoutVariants',
  'panelToggle.order',
  'commandPlacement',
  'formatToolbar',
  'clock.options',
  'clock.stopwatch',
  'sidebar.iconHeadings',
  'sidebar.heightMode',
  'statusbar.collapseMode',
  'statusbar.unavailableMode',
  'input.cursorSprung',
  'hotkeys',
  'colorSchemes',
];

// Der eine Prefix-Zweig: `appearance.*` prüft nicht auf Gleichheit, sondern auf
// den Anfang. Wer `appearance` als Ganzes schreibt, trifft ihn nicht und zieht
// ihn über diesen Vertreter nach; die Nutzlast liest der Zweig ohnehin frisch
// aus dem Speicher, der Vertreter-Name ist also folgenlos.
const VERTEIL_PREFIXE = [{ pfad: 'appearance', vertreter: 'appearance.editorFont' }];

/**
 * Baut die Verteil-Funktion.
 *
 * @param {object} deps Abhängigkeiten aus main.js (Namen wie in settings.js).
 * @param {object} deps.BrowserWindow Electron-Fenster-Klasse.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {() => void} deps.applyMenuToAllWindows Menüs aller Fenster neu bauen.
 * @param {() => void} deps.updateAllCaptionColors Titelleisten umfärben.
 * @param {object} deps.timerChecker Timer-Prüfer.
 * @returns {(key: string, value: *, senderContents: object|null) => void}
 */
function createSettingsVerteilung(deps) {
  const { BrowserWindow, getStore, applyMenuToAllWindows, updateAllCaptionColors, timerChecker } =
    deps;
  const store = getStore();

  return function verteileEinstellung(key, value, senderContents) {
    // 4T-000581 (Epic 3E-000107): Schalter der Rechtschreibpruefung an alle
    // Fenster verteilen (Muster 'taskStates', einschliesslich des Senders —
    // der Empfangspfad rekonfiguriert die Editor-Compartments idempotent).
    if (key === SPELLCHECK_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('spellcheck:changed', value === true);
      }
    }
    // Menue-relevante Settings spiegeln sich in den Haekchen wider. Bei einem
    // Wechsel in einem Fenster muessen alle Fenster-Menues angepasst werden.
    if (key === 'restoreSession' || key === 'autoSave') applyMenuToAllWindows();
    // M-08 (4T-000185): Sprachwechsel an alle anderen offenen Fenster
    // verteilen — vorher wirkte er nur im ausloesenden Fenster, die
    // uebrigen blieben bis zum Neustart in der alten Sprache. Das
    // ausloesende Fenster hat lokal bereits umgeschaltet.
    if (key === 'language') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== senderContents) {
          w.webContents.send('language:changed', value);
        }
      }
    }
    // 4T-000204: Task-Status-Set an alle Fenster broadcasten (auch an den
    // Sender — der Empfangspfad konfiguriert idempotent Pipeline und
    // Live-Modus und rendert offene Tabs neu).
    if (key === 'taskStates') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('taskStates:changed', value);
      }
    }
    // 4T-000612 (Epic 3E-000115, PO-Testbefund EXE 0.91.0.919): Der globale
    // (allgemeine) Lesezeichen-Baum liegt im Store und erreichte andere Fenster
    // bisher nicht — nur die BEREICHS-Lesezeichen synchronisierten ueber
    // 'bookmarks:changed'. Den Wechsel jetzt an die uebrigen Fenster verteilen
    // (Muster 'language:changed', ohne das ausloesende Fenster — das hat seinen
    // Baum bereits im Speicher aktualisiert und gerendert). Der Empfangspfad
    // uebernimmt den Baum und rendert den allgemeinen Abschnitt neu.
    if (key === 'bookmarksTree') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== senderContents) {
          w.webContents.send('bookmarksTree:changed', value);
        }
      }
    }
    // 4T-000498 (Epic 3E-000090): Aufgaben-Konfiguration (Global Filter,
    // Automatiken, Einfuege-Position) an alle Fenster broadcasten (auch an
    // den Sender — Muster taskStates).
    if (key === 'tasksConfig') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('tasksConfig:changed', value);
      }
    }
    // 4T-000528 (Epic 3E-000095): Erinnerungs-Konfiguration (Default-Uhrzeit,
    // Snooze-Optionen, System-Notification) an alle Fenster; der Main-
    // Pruefer liest pro Lauf ohnehin frisch aus dem Store.
    if (key === 'remindersConfig') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('remindersConfig:changed', value);
      }
    }
    // 4T-000284 (Epic 3E-000050): Frontmatter-Anzeige an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad konfiguriert
    // idempotent die Pipeline, invalidiert den Render-Cache und rendert
    // offene Tabs neu).
    if (key === 'render.showFrontmatter') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('frontmatterDisplay:changed', value);
      }
    }
    // 4T-000471 (Epic 3E-000087): Ueberschriften-Nummerierung (Objekt { enabled,
    // startLevel }) an alle Fenster broadcasten (auch an den Sender — der
    // Empfangspfad konfiguriert idempotent die Pipeline, invalidiert den
    // Render-Cache und rendert offene Tabs neu; Live und Outline ziehen mit).
    if (key === 'render.headingNumbering') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('headingNumbering:changed', value);
      }
    }
    // 4T-000312 (Epic 3E-000055): dauerhaft ausgeklappte Frontmatter-Darstellung
    // an alle Fenster broadcasten (auch an den Sender — der Empfangspfad
    // toggelt idempotent eine Root-Klasse).
    if (key === 'render.frontmatterExpanded') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('frontmatterExpanded:changed', value);
      }
    }
    // 4T-000414 (Epic 3E-000078): Skript-Block-Schalter an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad wendet idempotent
    // an, ein unveraenderter Zustand ist dort ein No-op).
    if (key === 'scripts.run') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('perspectiveScripts:changed', value);
      }
    }
    // 4T-000292 (Epic 3E-000052): Erweiterungs-Schalt-Zustand an alle Fenster
    // broadcasten (auch an den Sender — der Empfangspfad wendet mit
    // persist:false an, ein unveraenderter Zustand ist dort ein No-op).
    // Menues neu bauen, damit Eintraege deaktivierter Erweiterungen
    // verschwinden (Filterung ueber die Kommando-Registry).
    if (key === 'extensions.disabled') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('extensions:changed', value);
      }
      applyMenuToAllWindows();
      // 4T-000630 (Epic 3E-000102): Erweiterung 'workspaces' aus -> Standard-
      // Titelleiste; ein -> Arbeitsbereichs-Farbe wieder anwenden.
      updateAllCaptionColors();
      // 4T-001761 (Epic 3E-000253, Entscheidung E-B): Der Datensatz-Bestand des
      // Index ruht mit der Erweiterung «Datenbank». Gefragt wird nach dem
      // EFFEKTIVEN Stand, damit das Abschalten der Eigenschafts-Profile die
      // Datenbank mitnimmt wie ueberall sonst. Nur eine echte Aenderung loest
      // den Neuaufbau aus; er liest die Dateien erneut und schreibt nichts an
      // ihnen (AK6).
      if (setzeDatensatzErfassung(isExtensionEnabled('database', value))) {
        alleIndizesNeuAufbauen();
      }
    }
    // 4T-000298 (Epic 3E-000053): Schalt-Zustand der EXTERNEN Erweiterungen an
    // alle Fenster broadcasten (auch an den Sender — der Empfangspfad laedt
    // Store-Stand und Scan neu und gleicht idempotent an). Die Enabled-Liste
    // wird vom Host immer als LETZTER Schluessel persistiert (nach trusted/
    // lastError), damit der Broadcast den fertigen Zustand sieht.
    if (key === 'extensionsExternal.enabled') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('extensionsExternal:changed', value);
      }
    }
    // 4T-000289 (Epic 3E-000051): Sidebar-Layout an alle Fenster broadcasten
    // (auch an den Sender — der Empfangspfad wendet mit persist:false an,
    // ein unveraendertes Layout ist dort ein No-op).
    if (key === 'sidebar.layout') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('sidebarLayout:changed', value);
      }
    }
    // 4T-000624 (Epic 3E-000119): globale Sidebar-Varianten an alle Fenster
    // broadcasten (Muster sidebar.layout: auch an den Sender, der
    // Empfangspfad normalisiert und persistiert nicht erneut).
    if (key === 'sidebar.layoutVariants') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('sidebarLayoutVariants:changed', value);
      }
    }
    // 4T-000569 (Epic 3E-000104): Panel-Toggle-Reihenfolge an alle Fenster
    // broadcasten (Muster sidebar.layout: auch an den Sender, Empfang mit
    // persist:false; die Statusbar-Anordnung und das Panel-Untermenue der
    // anderen Fenster ziehen sofort nach).
    if (key === 'panelToggle.order') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('panelToggleOrder:changed', value);
      }
    }
    // 4T-000520 (Epic 3E-000094): Kommando-Platzierung (eigene Statusbar-
    // Buttons, Kontextmenue-Sektion, Makros, Hide-Liste) an alle Fenster
    // broadcasten (Muster panelToggle.order: auch an den Sender, Empfang
    // mit persist:false; ein unveraenderter Stand ist dort ein No-op).
    if (key === 'commandPlacement') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('commandPlacement:changed', value);
      }
    }
    // 4T-000607 (Epic 3E-000114): Format-Toolbar-Belegung an alle Fenster
    // broadcasten (Muster commandPlacement).
    if (key === 'formatToolbar') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('formatToolbar:changed', value);
      }
    }
    // 4T-000372 (Epic 3E-000069): Uhr-Anzeige-Optionen an alle Fenster
    // broadcasten (Muster formatToolbar).
    if (key === 'clock.options') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clock:changed', value);
      }
    }
    // 4T-000637 (Epic 3E-000069): Wecker-Liste an alle Fenster broadcasten
    // (Muster clock.options). Der Pruefer liest pro Lauf ohnehin frisch aus
    // dem Store und braucht kein eigenes Signal.
    if (key === CLOCK_ALARMS_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockAlarms:changed', value);
      }
    }
    // 4T-000638 (Epic 3E-000069): Timer-Liste broadcasten und den Weckruf des
    // Pruefers nachziehen — ein neu gestarteter oder pausierter Timer
    // verschiebt den naechsten Ablauf.
    if (key === CLOCK_TIMERS_KEY) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockTimers:changed', value);
      }
      timerChecker.reschedule();
    }
    // Die Stoppuhr hat keine Faelligkeit und braucht deshalb nur den
    // Broadcast.
    if (key === 'clock.stopwatch') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('clockStopwatch:changed', value);
      }
    }
    // 4T-000639 (Epic 3E-000069): Panel-Ueberschriften als Icon — an alle
    // Fenster ausser dem Ausloeser (der hat lokal bereits umgeschaltet).
    if (key === 'sidebar.iconHeadings') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== senderContents) {
          w.webContents.send('sidebarIconHeadings:changed', value);
        }
      }
    }
    // 4T-000855 (Epic 3E-000164): Hoehen-Modell der Sidebar-Bloecke — an alle
    // Fenster ausser dem Ausloeser (Muster iconHeadings oben).
    if (key === 'sidebar.heightMode') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== senderContents) {
          w.webContents.send('sidebarHeightMode:changed', value);
        }
      }
    }
    // 4T-001580 (Epic 3E-000283): Falt-Modus der Statusleiste («automatisch»
    // oder «immer zusammengeklappt») — an alle Fenster ausser dem Ausloeser
    // (Muster sidebar.heightMode oben; das ausloesende Fenster hat seine
    // Leiste beim Anwenden bereits neu gefaltet).
    if (key === 'statusbar.collapseMode') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== senderContents) {
          w.webContents.send('statusbarCollapseMode:changed', value);
        }
      }
    }
    // 4T-001765 (Epic 3E-000186): Darstellung nicht aktivierbarer Schalter
    // («blass anzeigen» oder «ausblenden», E3 des Epics) — an alle Fenster
    // ausser dem Ausloeser, Muster statusbar.collapseMode darueber; das
    // ausloesende Fenster hat seine Leiste beim Anwenden bereits nachgezogen.
    if (key === 'statusbar.unavailableMode') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents !== senderContents) {
          w.webContents.send('statusbarUnavailableMode:changed', value);
        }
      }
    }
    // 4T-001576 (Epic 3E-000282): Cursor-Sprung hinter den Listen-Marker an
    // alle Fenster broadcasten (auch an den Sender — der Empfangspfad setzt
    // nur den Laufzeit-Zustand, ein unveraenderter Wert ist dort ein No-op;
    // Muster 'scripts.run' weiter oben). Die Tastenbelegung liest den Wert bei
    // jedem Tastendruck, es gibt also nichts zu rekonfigurieren.
    if (key === 'input.cursorSprung') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('cursorSprung:changed', value);
      }
    }
    // 4T-000208: Hotkey-Overrides an alle Fenster broadcasten (auch an den
    // Sender — Empfang baut Dispatcher-Map und Editor-Keymap idempotent
    // neu) und die Menue-Accelerators aller Fenster aktualisieren.
    if (key === 'hotkeys') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('hotkeys:changed', value);
      }
      applyMenuToAllWindows();
    }
    // 4T-000018: appearance.*-Aenderung an alle Fenster broadcasten, damit
    // Schriftart und -groesse sofort ueberall greifen.
    if (typeof key === 'string' && key.startsWith('appearance.')) {
      const payload = {
        editorFont: store?.get('appearance.editorFont') || undefined,
        editorSize: store?.get('appearance.editorSize') || undefined,
        renderFont: store?.get('appearance.renderFont') || undefined,
        renderSize: store?.get('appearance.renderSize') || undefined,
        // 4T-000383 (Epic 3E-000072): Inhalts-Breite in Prozent; ungesetzt
        // (Alt-Profile) faellt der Empfaenger auf den Default zurueck.
        contentWidth: store?.get('appearance.contentWidth') || undefined,
        // 4T-000575 (Epic 3E-000106): Ecken-Form der Reiter. Bewusst als echter
        // Boolean statt nach dem ||-undefined-Muster darueber: der
        // Snapshot-Merge des Empfaengers (mergeAppearanceSnapshot) filtert
        // undefined heraus, ein Abschalten wuerde dort sonst nicht ankommen
        // und ein offener Einstellungs-Entwurf die Rundung zurueckdrehen.
        roundedTabs: store?.get('appearance.roundedTabs') === true,
        // 4T-000577 (Epic 3E-000106): Hervorhebung der Cursor-Zeile, ebenfalls
        // als echter Boolean (Default an, nur explizites false schaltet ab).
        highlightActiveLine: store?.get('appearance.highlightActiveLine') !== false,
      };
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('appearance:changed', payload);
      }
    }
    // 4T-000465 (Epic 3E-000086): Farbschema-Zustand (Objekt { custom, activeLight,
    // activeDark }) an alle Fenster broadcasten (auch an den Sender — der
    // Empfangspfad normalisiert und wendet idempotent an).
    if (key === 'colorSchemes') {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('colorScheme:changed', value);
      }
    }
  };
}

/**
 * Alle Verteil-Schlüssel, die UNTER einem geschriebenen Pfad liegen.
 *
 * Das Einlesen schreibt an den Pfaden, unter denen die Ausgabe die Werte
 * abgelegt hat — `sidebar`, `panelToggle`, `appearance` —, während die
 * Verteil-Zweige auf feinere Schlüssel hören. Ohne diesen Nachlauf bliebe eine
 * eingelesene Sidebar-Anordnung bis zum nächsten Programmstart unsichtbar.
 *
 * @param {string} pfad Geschriebener Pfad.
 * @returns {string[]} Schlüssel, für die die Verteilung zusätzlich zu laufen hat.
 */
function verteilSchluesselUnter(pfad) {
  const aus = [];
  for (const schluessel of VERTEIL_SCHLUESSEL) {
    if (schluessel !== pfad && schluessel.startsWith(pfad + '.')) aus.push(schluessel);
  }
  for (const { pfad: p, vertreter } of VERTEIL_PREFIXE) {
    if (p === pfad) aus.push(vertreter);
  }
  return aus;
}

module.exports = { createSettingsVerteilung, VERTEIL_SCHLUESSEL, verteilSchluesselUnter };
