// 4T-000480 (Epic 3E-000089): Kommando-Palette — filterbares Popup aller
// Registry-Kommandos. Aufbau nach dem Overlay-Muster des Vorlagen-Pickers
// (templates.js showTemplatePickerDialog): statisches Modal in index.html,
// Filter-Input mit dauerhaftem Fokus, Pfeil-Navigation ueber die
// .active-Klasse, Enter/Klick fuehrt aus, Esc/Backdrop/Abbrechen schliesst
// (Capture-Phase-keydown mit stopPropagation haelt die globale Esc-Kaskade
// heraus). Quelle ist ausschliesslich die Kommando-Registry
// (shared/commands/commands.js); die Ausfuehrung laeuft ueber den bestehenden
// Dispatch-Pfad: global dispatchte Kommandos ueber die commandHandlers-Map
// aus app-init.js (via initCommandPalette injiziert, zyklenfrei),
// editorScoped-Kommandos ueber EDITOR_COMMAND_FUNCTIONS auf der aktiven
// EditorView (derselbe Funktions-Satz wie die CodeMirror-Keymap).
//
// Verfuegbarkeit: im aktuellen Kontext nicht ausfuehrbare Kommandos
// erscheinen gedimmt (.unavailable) und sind nicht ausfuehrbar. Seit 4T-001636
// (Epic 3E-000295) SPIEGELT die Palette die Menue-Regeln nicht mehr, sondern
// liest dieselbe Quelle: das Verfuegbarkeits-Feld der Registry, ausgewertet
// ueber den Katalog in shared/commands/command-availability.js. Der
// Unterschied ist nicht kosmetisch — eine Spiegelung laeuft auseinander,
// sobald eine Seite gepflegt wird und die andere nicht, und genau das war an
// sechs Kommandos passiert. Handler-Guards bleiben als zweite Sicherung.
'use strict';

import { COMMANDS, COMMAND_CATEGORIES, mergeBindings } from '../../shared/commands/commands.js';
// 4T-000993: Anzeige-String eines Bindings aus der Binding-Schicht.
import { bindingToDisplayString } from '../../shared/commands/command-bindings.js';
// 4T-001636 (Epic 3E-000295): Verfuegbarkeits-Modell — der Katalog der
// benannten Bedingungen und der Kontext-Vertrag, den beide Prozess-Seiten
// befuellen. Die Palette entscheidet seither nicht mehr selbst.
import {
  availabilityContext,
  dokumentIstLeer,
  isAvailable,
} from '../../shared/commands/command-availability.js';
import { disabledCommandIdSet } from '../../shared/extensions/extensions-core.js';
import { filterCommandEntries } from '../../shared/commands/command-palette-filter.js';
import { t } from '../i18n.js';
import { state, activeTab } from './app/app-state.js';
// 4T-000546 (Epic 3E-000097): Verfuegbarkeits-Regel des Kalender-Kommandos
// (zyklenfreier Renderer-Zustand der Kalender-Konfiguration).
import { hasCalendarConfig } from './calendar/calendar-config.js';
import { getDisabledExtensionIds } from './extensions/extension-lifecycle.js';
import { paneEditors } from './editor/editor.js';
import { EDITOR_COMMAND_FUNCTIONS } from './editor/editor-keymaps.js';
// 4T-000590 (Epic 3E-000109): Verfuegbarkeits-Regel der table.*-Kommandos —
// zusaetzlich zum Editor-Kontext muss der Cursor in einer Tabelle stehen.
import { hasTableContext } from './editor/editor-table-tools.js';
// 4T-001697 (Epic 3E-000287): Verfuegbarkeits-Regel der drei Canvas-Kommandos.
// Dieselbe Funktion, aus der auch der gemeldete Menue-Zustand sein canvasTab
// baut (tabs.js) — eine Quelle fuer beide Prozess-Seiten, wie es die benannte
// Grenze des Modells verlangt.
import { istCanvasModusVerfuegbar } from './canvas/canvas-modus.js';
// 4T-001847 (Epic 3E-000110): Verfuegbarkeits-Regel des Tafel-Kommandos, aus
// derselben einen Quelle wie der gemeldete Menue-Zustand sein tafelTab nimmt.
import { istTafelModusVerfuegbar } from './kanban/kanban-modus.js';

function $(sel) {
  return document.querySelector(sel);
}

// Von app-init.js injizierter Ausfuehrungs-Pfad fuer global dispatchte
// Kommandos (commandHandlers-Map). Injektion statt Import, weil app-init
// dieses Modul importiert (Zyklus-Vermeidung, Muster Wiring-Objekt).
let runGlobalCommand = null;

export function initCommandPalette({ executeCommand }) {
  runGlobalCommand = typeof executeCommand === 'function' ? executeCommand : null;
}

// --- Verfuegbarkeit --------------------------------------------------------
//
// 4T-001636 (Epic 3E-000295): Die Regeln liegen nicht mehr hier. Bis zu diesem
// Vorgang fuehrte die Palette acht eigene Kontext-Mengen plus drei eigens
// behandelte Kennungen und endete auf `return true` — eine zweite Meinung
// neben den enabled-Ausdruecken des Menues, die an sechs Kommandos von ihr
// abwich (Erhebung 4T-000918). Jetzt traegt jedes Kommando seine Bedingung in
// der Registry, und hier steht nur noch der Kontext-Bau und der Abruf.
//
// Der Endpunkt `return true` ist damit weg: Was frueher stillschweigend
// durchfiel, ist heute die ausgewertete Bedingung `immer` — 61 Kommandos, an
// denen jemand sie hingeschrieben hat.

// Baut den Kontext-Vertrag aus command-availability.js an genau EINER Stelle.
// Die renderer-eigenen Felder inTable und hasCalendarConfig kommen hier dazu;
// sie tragen die drei Bedingungen ohne Menue-Eintrag.
//
// 4T-001636: hasBook und hasShelf sind neu im Palette-Kontext. Der Renderer
// besass beide Zustaende laengst (state.bookName, state.shelfName, gesetzt bei
// jeder Fenster-Meldung in app-broadcasts.js) — es fehlte kein Kanal, nur die
// Verwendung. Ohne sie KONNTEN book.close und shelf.close hier gar nicht
// richtig entschieden werden, und area.close ebenso wenig, dessen Regel den
// Bereich gegen Buch und Regal abgrenzt.
//
// sourceVisible ist als eigenes Feld entfallen: Die Bedingung sourceToggle
// leitet es aus viewMode ab, und zwar mit demselben Ausdruck, der hier stand.
// 4T-001765 (Epic 3E-000186): exportiert, weil die Statusleiste seither
// denselben Kontext braucht wie Palette und Menue — sie ist mit E6 zum
// dritten Verbraucher des Modells geworden. Der Bau bleibt an dieser EINEN
// Stelle des Renderers (benannte Grenze des Modells); die drei Aufrufer der
// Leiste reichen das Ergebnis an statusbar-availability.js weiter.
export function rendererAvailabilityContext() {
  const tab = activeTab();
  return availabilityContext({
    hasTab: !!tab,
    manualTab: !!(tab && tab.manualPage),
    systemTab: !!(tab && tab.systemPage),
    viewMode: tab ? tab.viewMode : null,
    editMode: tab ? !!tab.editMode : false,
    hasArea: !!state.areaPath,
    // 4T-000871 / 4T-000873 (Buch und Regal als Bereich).
    hasBook: !!state.bookName,
    hasShelf: !!state.shelfName,
    // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Zuordnung der eigenen App.
    hasWorkspace: !!state.workspaceName,
    // 4T-000590 (Epic 3E-000109): steht der Cursor des aktiven Editors in einer
    // Tabelle? (Dimmung der table.*-Kommandos ausserhalb von Tabellen.)
    inTable: hasTableContext(paneEditors[state.activePaneIndex]),
    // 4T-000546 (Epic 3E-000097): Bereich mit mindestens einem definierten
    // Kalender. Frueher erst im Sonderfall des einen Kommandos abgefragt, jetzt
    // ein Feld des Vertrags; der Aufruf ist eine Pruefung ueber die geladene
    // Bereichs-Konfiguration und damit billig genug fuer jeden Kontext-Bau.
    hasCalendarConfig: hasCalendarConfig(),
    // 4T-001697 (Epic 3E-000287): Traegt das aktive Dokument eine Flaeche?
    // Zehntes Feld des gemeinsamen Vertrags; im Aus-Zustand der Erweiterung
    // liefert die Funktion ohnehin false, und die Kommando-Filterung des
    // Schalters nimmt die Eintraege dann ganz heraus.
    canvasTab: istCanvasModusVerfuegbar(tab),
    // 4T-001847 (Epic 3E-000110): Ist das aktive Dokument eine Tafel? Elftes
    // Feld des gemeinsamen Vertrags; im Aus-Zustand der Erweiterung liefert die
    // Funktion ohnehin false, und die Kommando-Filterung des Schalters nimmt
    // den Eintrag dann ganz heraus.
    tafelTab: istTafelModusVerfuegbar(tab),
    // 4T-001852 (Epic 3E-000110): Ist das aktive Dokument leer? Zwoelftes Feld
    // des gemeinsamen Vertrags; es traegt das Umwandeln in eine Tafel. Dieselbe
    // Funktion, aus der auch der gemeldete Menue-Zustand sein Feld baut.
    leeresDokument: !!tab && dokumentIstLeer(tab.content),
  });
}

export function isCommandAvailable(cmd, ctx) {
  return isAvailable(cmd.availability, ctx);
}

// --- Eintrags-Aufbau ----------------------------------------------------------

// Baut die Palette-Eintraege beim Oeffnen: Registry-Reihenfolge innerhalb
// der fuenf Kategorie-Gruppen (Muster der Kuerzel-Einstellungsseite),
// Kommandos deaktivierter Erweiterungen ausgeschlossen, effektive Kuerzel
// inklusive Nutzer-Umbelegungen ueber mergeBindings.
export function buildPaletteEntries() {
  const disabled = disabledCommandIdSet(getDisabledExtensionIds());
  const effective = mergeBindings(state.hotkeyOverrides);
  const ctx = rendererAvailabilityContext();
  const entries = [];
  for (const categoryKey of COMMAND_CATEGORIES) {
    for (const cmd of COMMANDS) {
      if (cmd.categoryKey !== categoryKey) continue;
      // Die Palette listet sich nicht selbst (Ausfuehrung waere ein No-op).
      if (cmd.id === 'app.commandPalette') continue;
      if (disabled.has(cmd.id)) continue;
      // editorScoped ohne hinterlegte CM-Funktion waere nicht ausfuehrbar.
      if (cmd.editorScoped && !EDITOR_COMMAND_FUNCTIONS[cmd.id]) continue;
      const binding = (effective[cmd.id] || [])[0] || '';
      entries.push({
        id: cmd.id,
        label: t(cmd.labelKey),
        group: t(categoryKey),
        editorScoped: !!cmd.editorScoped,
        shortcut: binding ? bindingToDisplayString(binding) : '',
        available: isCommandAvailable(cmd, ctx),
      });
    }
  }
  return entries;
}

// --- Ausfuehrung --------------------------------------------------------------

function executePaletteEntry(entry) {
  if (entry.editorScoped) {
    const run = EDITOR_COMMAND_FUNCTIONS[entry.id];
    const view = paneEditors[state.activePaneIndex];
    if (run && view) {
      // Fokus zurueck in den Editor, dann die CM-Funktion wie ueber die
      // Keymap ausfuehren.
      view.focus();
      run(view);
    }
    return;
  }
  if (runGlobalCommand) runGlobalCommand(entry.id);
}

// 4T-000520 (Epic 3E-000094): zentrale Ausfuehrung per Kommando-ID fuer die
// platzierten Zugaenge (Statusbar-Buttons, Kontextmenue-Sektion) und die
// Makro-Schritte. Buendelt beide Dispatch-Pfade der Palette und liefert —
// anders als executePaletteEntry — ein Erfolgs-Signal: false bei
// unbekannter ID, gefiltertem Kommando (deaktivierte Erweiterung), im
// Kontext nicht verfuegbarem Kommando oder einem Handler, der den Aufruf
// mit false ablehnt (Guard-Konvention der commandHandlers-Map). Verzoegerte
// Fehler asynchroner Handler sind damit bewusst nicht erfassbar.
// 4T-000521 (Epic 3E-000094): Verfügbarkeits-Prädikat per Kommando-ID für die
// Kontextmenü-Sektion (Einträge erscheinen deaktiviert statt zu
// verschwinden — Konsistenz zum restlichen Menü).
export function isCommandIdAvailable(commandId) {
  const cmd = COMMANDS.find((c) => c.id === commandId);
  if (!cmd) return false;
  if (cmd.editorScoped && !EDITOR_COMMAND_FUNCTIONS[cmd.id]) return false;
  return isCommandAvailable(cmd, rendererAvailabilityContext());
}

export function executeCommandById(commandId) {
  const cmd = COMMANDS.find((c) => c.id === commandId);
  if (!cmd) return false;
  const disabled = disabledCommandIdSet(getDisabledExtensionIds());
  if (disabled.has(cmd.id)) return false;
  if (!isCommandAvailable(cmd, rendererAvailabilityContext())) return false;
  if (cmd.editorScoped) {
    const run = EDITOR_COMMAND_FUNCTIONS[cmd.id];
    const view = paneEditors[state.activePaneIndex];
    if (!run || !view) return false;
    view.focus();
    return run(view) !== false;
  }
  if (!runGlobalCommand) return false;
  return runGlobalCommand(cmd.id) !== false;
}

// --- Popup --------------------------------------------------------------------

// 4T-001500 (Epic 3E-000174): Die Overlay-Schleife traegt seit dem schnellen
// Datei-Oeffnen ZWEI Modi. Gemeinsam sind Fokus-Fuehrung, Pfeil-Navigation ueber
// die .active-Klasse, Enter und Klick, die Esc-Kaskade mit stopPropagation in
// der Capture-Phase und der Aufbau der Liste; verschieden sind Titel,
// Datenmenge, Filter, Zeilen-Inhalt und Ausfuehrung. Die Unterschiede kommen
// als Beschreibung herein (Entscheidung E1 des Product Owners vom 2026-09-06:
// ein Overlay, zwei Modul-Dateien), statt dass eine zweite Kopie dieser
// Mechanik neben der ersten steht.
//
// @param {object} modus
//   titel         Ueberschrift des Modals.
//   platzhalter   Platzhalter-Text des Eingabefelds.
//   eintraege     Die vollstaendige Menge, einmal beim Oeffnen gebaut.
//   filtere       (eintraege, eingabe) => sichtbare Eintraege.
//   gruppeVon     (eintrag) => Gruppen-Text; '' unterdrueckt die Zwischenzeile.
//   baueInhalt    (eintrag, btn) => haengt die Spans der Zeile an.
//   istVerfuegbar (eintrag) => ausfuehrbar? Nicht Verfuegbares bleibt sichtbar,
//                 aber gedimmt (Orientierung, Muster der Menue-Dimmung).
//   leerText      () => Text der leeren Liste. Bewusst eine Funktion und kein
//                 String: Der Datei-Modus sagt hier je nach Zustand der Quelle
//                 «nichts gefunden» oder «Index wird noch aufgebaut».
//   fuehreAus     (eintrag) => Wirkung. Darf asynchron sein; das Overlay
//                 schliesst vorher, wie beim Klick auf einen Wiki-Link.
export function zeigeAuswahlOverlay(modus) {
  const modal = $('#command-palette-modal');
  const filterInput = $('#command-palette-filter');
  const list = $('#command-palette-list');
  const btnCancel = $('#btn-command-palette-cancel');
  const titel = $('#command-palette-title');
  if (!modal || !list || modal.hidden === false) return Promise.resolve(null);

  const allEntries = modus.eintraege;

  return new Promise((resolve) => {
    let activeIdx = 0;
    let visible = [];

    const finish = (entry) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      filterInput.removeEventListener('input', renderList);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      if (entry) modus.fuehreAus(entry);
      resolve(entry || null);
    };
    const onCancel = () => finish(null);

    const setActive = (idx) => {
      activeIdx = Math.max(0, Math.min(idx, visible.length - 1));
      const buttons = list.querySelectorAll('button');
      buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
      const current = buttons[activeIdx];
      if (current) current.scrollIntoView({ block: 'nearest' });
    };

    const renderList = () => {
      visible = modus.filtere(allEntries, filterInput.value);
      list.innerHTML = '';
      let lastGroup = null;
      visible.forEach((entry, idx) => {
        const gruppe = modus.gruppeVon(entry);
        if (gruppe !== lastGroup && gruppe !== '') {
          const groupLi = document.createElement('li');
          groupLi.className = 'template-picker-group';
          groupLi.textContent = gruppe;
          list.appendChild(groupLi);
        }
        lastGroup = gruppe;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'command-palette-item';
        const verfuegbar = modus.istVerfuegbar(entry);
        if (!verfuegbar) {
          btn.classList.add('unavailable');
          btn.setAttribute('aria-disabled', 'true');
        }
        modus.baueInhalt(entry, btn);
        // Gedimmte Eintraege bleiben sichtbar (Orientierung), sind aber
        // nicht ausfuehrbar.
        btn.addEventListener('click', () => {
          if (verfuegbar) finish(entry);
        });
        btn.addEventListener('mousemove', () => setActive(idx));
        li.appendChild(btn);
        list.appendChild(li);
      });
      if (visible.length === 0) {
        const li = document.createElement('li');
        li.className = 'template-picker-empty';
        li.textContent = modus.leerText();
        list.appendChild(li);
      }
      setActive(0);
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIdx - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const entry = visible[activeIdx];
        if (entry && modus.istVerfuegbar(entry)) finish(entry);
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    filterInput.value = '';
    filterInput.placeholder = modus.platzhalter;
    if (titel) titel.textContent = modus.titel;
    renderList();
    modal.addEventListener('keydown', onKeydown, true);
    filterInput.addEventListener('input', renderList);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => filterInput.focus(), 0);
  });
}

// Der Kommando-Modus: unveraendertes Verhalten, nur als Beschreibung an die
// gemeinsame Schleife gereicht. Liefert weiterhin die Kommando-ID, nicht den
// Eintrag, weil die Aufrufer sie so erwarten.
export function showCommandPalette() {
  return zeigeAuswahlOverlay({
    titel: t('commandPalette.title'),
    platzhalter: t('commandPalette.filterPlaceholder'),
    eintraege: buildPaletteEntries(),
    filtere: filterCommandEntries,
    gruppeVon: (e) => e.group,
    istVerfuegbar: (e) => e.available,
    leerText: () => t('commandPalette.noMatch'),
    fuehreAus: executePaletteEntry,
    baueInhalt: (entry, btn) => {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'command-palette-name';
      nameSpan.textContent = entry.label;
      btn.appendChild(nameSpan);
      if (entry.shortcut) {
        const keySpan = document.createElement('span');
        keySpan.className = 'command-palette-shortcut';
        keySpan.textContent = entry.shortcut;
        btn.appendChild(keySpan);
      }
    },
  }).then((entry) => (entry ? entry.id : null));
}
