// 4T-0988 (Epic 3E-0196): Bereich „Darstellung" der Einstellungs-Seite.
//
// Konstanten und Helfer der Darstellungs-Werte (Schriftarten, Größen,
// Inhalts-Breite, Ecken-Form, Zeilen-Hervorhebung) samt der Anwendung auf
// die CSS-Variablen; dazu der Bereich selbst mit Live-Vorschau.
'use strict';

import { api } from '../app/api.js';
import { getEditorViewDefaults, setEditorViewDefaults } from '../app/app-state.js';
import {
  applyFrontmatterDisplay,
  applyFrontmatterExpanded,
  isFrontmatterDisplayEnabled,
  isFrontmatterExpanded,
} from '../frontmatter-display.js';
import { isNotesPreviewByDefault, setNotesPreviewByDefault } from '../panels/notes-panel.js';
import { persistSetting } from '../views/views.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';

// --- Darstellung: Konstanten und Helfer (4T-0018) -------------------------------
// Konfigurierbare Schriftart und -groesse fuer Editor und Render-Pane.
// Werte werden ueber electron-store unter dem Schluessel-Prefix appearance.*
// persistiert; eine Aenderung in einem Fenster wird vom Main an alle anderen
// Fenster broadcastet, sodass die neuen Werte sofort ueberall greifen.

export const APPEARANCE_DEFAULTS = {
  editorFont: 'Consolas',
  editorSize: 14,
  renderFont: 'Segoe UI',
  renderSize: 15,
  contentWidth: 80,
  // 4T-0575 (Epic 3E-0106): abgerundete Ecken der Dokument-Reiter und der
  // Tab-Gruppen-Koepfe. Default aus, das heutige eckige Bild bleibt damit
  // der Auslieferungszustand.
  roundedTabs: false,
  // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile im Edit-Modus.
  // Default an (PO-Festlegung: ueblicher Editor-Komfort).
  highlightActiveLine: true,
};
const APPEARANCE_SIZE_MIN = 8;
const APPEARANCE_SIZE_MAX = 32;
// 4T-0383 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht in Prozent
// der Pane-Breite (PO-Festlegung: freie Prozent-Eingabe 20 bis 100,
// Default 80). Ersetzt die feste 920-px-Begrenzung der .markdown-body-Regel.
const CONTENT_WIDTH_MIN = 20;
const CONTENT_WIDTH_MAX = 100;

function clampAppearanceSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(APPEARANCE_SIZE_MIN, Math.min(APPEARANCE_SIZE_MAX, Math.round(n)));
}

export function clampContentWidth(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(CONTENT_WIDTH_MIN, Math.min(CONTENT_WIDTH_MAX, Math.round(n)));
}

// Setzt die fuenf appearance-CSS-Variablen auf :root. Jede Schriftart kommt
// mit einer Fallback-Kette, damit nicht installierte Familien nicht zu
// kaputtem Layout fuehren.
export function applyAppearanceVars(values) {
  const root = document.documentElement;
  const editorFont = (values.editorFont || APPEARANCE_DEFAULTS.editorFont).trim();
  const renderFont = (values.renderFont || APPEARANCE_DEFAULTS.renderFont).trim();
  root.style.setProperty(
    '--editor-font-family',
    `"${editorFont}", "Cascadia Code", "Consolas", "Courier New", monospace`,
  );
  root.style.setProperty(
    '--editor-font-size',
    `${clampAppearanceSize(values.editorSize, APPEARANCE_DEFAULTS.editorSize)}px`,
  );
  root.style.setProperty(
    '--render-font-family',
    `"${renderFont}", "Segoe UI", system-ui, sans-serif`,
  );
  root.style.setProperty(
    '--render-font-size',
    `${clampAppearanceSize(values.renderSize, APPEARANCE_DEFAULTS.renderSize)}px`,
  );
  // 4T-0383: Prozent-Breite der gerenderten Ansicht (Render-Pane und
  // Reading; der PDF-Export ueberschreibt mit max-width: none).
  root.style.setProperty(
    '--content-width',
    `${clampContentWidth(values.contentWidth, APPEARANCE_DEFAULTS.contentWidth)}%`,
  );
  // 4T-0575: Ecken-Form der Reiter und Gruppen-Koepfe. Reine Root-Klasse
  // (Muster frontmatter-expanded) — die Geometrie (Radius, Abstand statt
  // Trennlinie) liegt vollstaendig im Stylesheet, damit Themes und
  // Farbschemas sie ueber --tab-radius uebersteuern koennen.
  root.classList.toggle('rounded-tabs', values.roundedTabs === true);
  // 4T-0577: Hervorhebung der Cursor-Zeile. Default an, deshalb schaltet
  // nur ein explizites false ab (Alt-Profile und leere Broadcast-Payloads
  // landen auf dem Default).
  root.classList.toggle('highlight-active-line', values.highlightActiveLine !== false);
}

export async function readAppearanceFromStore() {
  const editorFont = await api.getSetting('appearance.editorFont');
  const editorSize = await api.getSetting('appearance.editorSize');
  const renderFont = await api.getSetting('appearance.renderFont');
  const renderSize = await api.getSetting('appearance.renderSize');
  const contentWidth = await api.getSetting('appearance.contentWidth');
  const roundedTabs = await api.getSetting('appearance.roundedTabs');
  const highlightActiveLine = await api.getSetting('appearance.highlightActiveLine');
  return {
    editorFont: editorFont || APPEARANCE_DEFAULTS.editorFont,
    editorSize: clampAppearanceSize(editorSize, APPEARANCE_DEFAULTS.editorSize),
    renderFont: renderFont || APPEARANCE_DEFAULTS.renderFont,
    renderSize: clampAppearanceSize(renderSize, APPEARANCE_DEFAULTS.renderSize),
    contentWidth: clampContentWidth(contentWidth, APPEARANCE_DEFAULTS.contentWidth),
    // 4T-0575: nur explizites true rundet (Default aus, auch fuer
    // Bestands-Profile ohne gespeicherten Wert).
    roundedTabs: roundedTabs === true,
    // 4T-0577: Default an, nur explizites false schaltet ab.
    highlightActiveLine: highlightActiveLine !== false,
  };
}

// Bereinigte Darstellungs-Werte aus dem Entwurf (Pendant des frueheren
// settingsCurrentInputValues, jetzt draft- statt DOM-basiert).
function appearanceDraftValues(draft) {
  const a = (draft && draft.appearance) || {};
  return {
    editorFont: String(a.editorFont || '').trim() || APPEARANCE_DEFAULTS.editorFont,
    editorSize: clampAppearanceSize(a.editorSize, APPEARANCE_DEFAULTS.editorSize),
    renderFont: String(a.renderFont || '').trim() || APPEARANCE_DEFAULTS.renderFont,
    renderSize: clampAppearanceSize(a.renderSize, APPEARANCE_DEFAULTS.renderSize),
    contentWidth: clampContentWidth(a.contentWidth, APPEARANCE_DEFAULTS.contentWidth),
    roundedTabs: a.roundedTabs === true,
    highlightActiveLine: a.highlightActiveLine !== false,
  };
}

// Spiegelt applyAppearanceSection: bereinigte Darstellungs-Werte gegen den
// Snapshot, die drei Schalter gegen ihren Laufzeit-Zustand.
export function dirtyAppearanceSection(draft) {
  if (draft.appearance && !jsonEqual(appearanceDraftValues(draft), draft.appearanceSnapshot)) {
    return true;
  }
  if ((draft.showFrontmatter !== false) !== isFrontmatterDisplayEnabled()) return true;
  if ((draft.frontmatterExpanded === true) !== isFrontmatterExpanded()) return true;
  if (draft.editorViewDefaults && !jsonEqual(draft.editorViewDefaults, getEditorViewDefaults())) {
    return true;
  }
  return (draft.notesPreviewByDefault !== false) !== isNotesPreviewByDefault();
}

// --- Bereich Darstellung (4T-0018) ---------------------------------------------
// Vier Font-Controls mit Live-Vorschau über CSS-Variablen; Datalists
// liefern kuratierte Vorschläge, freie Eingabe ist erlaubt. Persistiert
// wird erst bei Anwenden/OK.
const MONO_FONT_SUGGESTIONS = [
  'Consolas',
  'Cascadia Code',
  'Cascadia Mono',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Courier New',
];
const PROPORTIONAL_FONT_SUGGESTIONS = [
  'Segoe UI',
  'Calibri',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Verdana',
];

function buildDatalist(id, options) {
  const datalist = document.createElement('datalist');
  datalist.id = id;
  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  }
  return datalist;
}

function buildFontInput(id, listId, draft, key) {
  const input = document.createElement('input');
  input.id = id;
  input.className = 'settings-input';
  input.type = 'text';
  input.setAttribute('list', listId);
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = (draft.appearance && draft.appearance[key]) || APPEARANCE_DEFAULTS[key];
  input.addEventListener('input', () => {
    if (!draft.appearance) return;
    draft.appearance[key] = input.value;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  // Auswahl-Trick fuer die <input list>-Felder: Chromium filtert die
  // Datalist-Optionen auf Substring-Matches des aktuellen Werts — bei
  // gefuelltem Feld bleibt damit nur ein Eintrag sichtbar. Loesung: Beim
  // ersten Maus-Klick auf ein fokussiertes-noch-nicht-Feld wird der Wert
  // zwischengespeichert und visuell auf leer gesetzt; das Dropdown zeigt
  // anschliessend alle Optionen. Geht der Fokus ohne Eingabe verloren,
  // wird der gemerkte Wert wiederhergestellt. Programmatisches value-
  // Setzen loest kein input-Event aus — die Live-Vorschau bleibt auf dem
  // letzten guten Stand.
  input.addEventListener('mousedown', () => {
    if (document.activeElement !== input && input.value) {
      input.dataset.savedValue = input.value;
      input.value = '';
    }
  });
  input.addEventListener('blur', () => {
    if (!input.value && input.dataset.savedValue) {
      input.value = input.dataset.savedValue;
    }
    delete input.dataset.savedValue;
  });
  return input;
}

// 4T-0383: opts.min/opts.max erlauben abweichende Bereiche (Inhalts-Breite
// 20 bis 100); ohne opts bleibt der Schriftgroessen-Bereich der Default.
function buildSizeInput(id, draft, key, opts) {
  const input = document.createElement('input');
  input.id = id;
  input.className = 'settings-input settings-input-size';
  input.type = 'number';
  input.min = String(opts && opts.min != null ? opts.min : APPEARANCE_SIZE_MIN);
  input.max = String(opts && opts.max != null ? opts.max : APPEARANCE_SIZE_MAX);
  input.step = '1';
  input.value = String((draft.appearance && draft.appearance[key]) || APPEARANCE_DEFAULTS[key]);
  input.addEventListener('input', () => {
    if (!draft.appearance) return;
    draft.appearance[key] = input.value;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  return input;
}

export function renderAppearanceSection(container, draft) {
  container.appendChild(
    buildSettingsRow(
      'settings.editorFont',
      buildFontInput('settings-editor-font', 'settings-mono-fonts', draft, 'editorFont'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.editorSize',
      buildSizeInput('settings-editor-size', draft, 'editorSize'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.renderFont',
      buildFontInput('settings-render-font', 'settings-proportional-fonts', draft, 'renderFont'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.renderSize',
      buildSizeInput('settings-render-size', draft, 'renderSize'),
    ),
  );
  // 4T-0383 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht in
  // Prozent (20 bis 100). Live-Vorschau wie bei den Schriftgroessen ueber
  // die CSS-Variable; Werte ausserhalb des Bereichs klemmt
  // appearanceDraftValues auf die Grenzen.
  container.appendChild(
    buildSettingsRow(
      'settings.contentWidth',
      buildSizeInput('settings-content-width', draft, 'contentWidth', {
        min: CONTENT_WIDTH_MIN,
        max: CONTENT_WIDTH_MAX,
      }),
    ),
  );
  container.appendChild(buildDatalist('settings-mono-fonts', MONO_FONT_SUGGESTIONS));
  container.appendChild(
    buildDatalist('settings-proportional-fonts', PROPORTIONAL_FONT_SUGGESTIONS),
  );
  // 4T-0575 (Epic 3E-0106): abgerundete Ecken der Dokument-Reiter und der
  // Tab-Gruppen-Koepfe. Anders als die Schalter darunter mit Live-Vorschau
  // (Muster der Schrift- und Breiten-Felder): die Wirkung ist reine
  // CSS-Geometrie, ein Re-Render der Panes faellt nicht an.
  const roundedTabs = document.createElement('input');
  roundedTabs.id = 'settings-rounded-tabs';
  roundedTabs.type = 'checkbox';
  roundedTabs.checked = draft.appearance ? draft.appearance.roundedTabs === true : false;
  roundedTabs.addEventListener('change', () => {
    if (!draft.appearance) return;
    draft.appearance.roundedTabs = roundedTabs.checked;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  container.appendChild(buildSettingsRow('settings.roundedTabs', roundedTabs));
  // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile im Edit-Modus,
  // ebenfalls mit Live-Vorschau (reine CSS-Wirkung).
  const activeLine = document.createElement('input');
  activeLine.id = 'settings-highlight-active-line';
  activeLine.type = 'checkbox';
  activeLine.checked = draft.appearance ? draft.appearance.highlightActiveLine !== false : true;
  activeLine.addEventListener('change', () => {
    if (!draft.appearance) return;
    draft.appearance.highlightActiveLine = activeLine.checked;
    applyAppearanceVars(appearanceDraftValues(draft));
  });
  container.appendChild(buildSettingsRow('settings.highlightActiveLine', activeLine));
  // 4T-0284: Frontmatter-Anzeige im Gerenderten (Render-Pane und
  // Live-Modus). Checkbox folgt der Entwurfs-Semantik: Wirkung erst bei
  // Anwenden/OK (keine Live-Vorschau — ein Re-Render aller Panes als
  // Vorschau waere teurer und inkonsistent zum Broadcast-Pfad).
  const showFm = document.createElement('input');
  showFm.id = 'settings-show-frontmatter';
  showFm.type = 'checkbox';
  showFm.checked = draft.showFrontmatter !== false;
  showFm.addEventListener('change', () => {
    draft.showFrontmatter = showFm.checked;
  });
  container.appendChild(buildSettingsRow('settings.showFrontmatter', showFm));
  // 4T-0312: dauerhaft ausgeklappte Darstellung, nur wirksam bei aktiver
  // Frontmatter-Anzeige (rein CSS-getragene Root-Klasse).
  const showFmExpanded = document.createElement('input');
  showFmExpanded.id = 'settings-frontmatter-expanded';
  showFmExpanded.type = 'checkbox';
  showFmExpanded.checked = draft.frontmatterExpanded === true;
  showFmExpanded.addEventListener('change', () => {
    draft.frontmatterExpanded = showFmExpanded.checked;
  });
  container.appendChild(buildSettingsRow('settings.showFrontmatterExpanded', showFmExpanded));
  // 4T-0359 (Epic 3E-0066): Vorschau des Notizen-Panels standardmaessig aktiv.
  const notesPreview = document.createElement('input');
  notesPreview.id = 'settings-notes-preview-default';
  notesPreview.type = 'checkbox';
  notesPreview.checked = draft.notesPreviewByDefault !== false;
  notesPreview.addEventListener('change', () => {
    draft.notesPreviewByDefault = notesPreview.checked;
  });
  container.appendChild(buildSettingsRow('settings.notesPreviewByDefault', notesPreview));
  // 4T-0572 (Epic 3E-0105): globale Voreinstellung der drei Editor-Ansicht-
  // Schalter fuer Dokumente ohne eigene Frontmatter-Angabe (Reihenfolge wie
  // Statusbar/Ansichtsmenue: Gliederung, Zeilennummern, Zeilenumbruch).
  // Wirkung erst bei Anwenden/OK; bereits offene Tabs behalten ihren Stand.
  const editorViewRows = [
    ['showFoldGutter', 'settings-editor-default-fold-gutter', 'settings.editorDefaultFoldGutter'],
    [
      'showLineNumbers',
      'settings-editor-default-line-numbers',
      'settings.editorDefaultLineNumbers',
    ],
    ['wrapLines', 'settings-editor-default-word-wrap', 'settings.editorDefaultWordWrap'],
  ];
  for (const [field, domId, labelKey] of editorViewRows) {
    const box = document.createElement('input');
    box.id = domId;
    box.type = 'checkbox';
    box.checked = draft.editorViewDefaults ? draft.editorViewDefaults[field] === true : false;
    box.addEventListener('change', () => {
      if (draft.editorViewDefaults) draft.editorViewDefaults[field] = box.checked;
    });
    container.appendChild(buildSettingsRow(labelKey, box));
  }
}

export async function applyAppearanceSection(draft) {
  // Die Font-/Breiten-Werte hängen am asynchronen Store-Laden; die drei
  // Schalter darunter sind davon unabhängig und laufen immer (4T-0554:
  // ein Anwenden vor Abschluss des Ladens verlor Schalter-Änderungen
  // sonst still — der frühere Komplett-Abbruch bei draft.appearance null
  // übersprang auch die Schalter-Blöcke).
  if (draft.appearance) {
    const values = appearanceDraftValues(draft);
    // Sechs separate setSetting-Aufrufe; der Main broadcastet bei jedem
    // appearance.*-Key an alle Fenster. Endzustand bleibt konsistent.
    await persistSetting('appearance.editorFont', values.editorFont);
    await persistSetting('appearance.editorSize', values.editorSize);
    await persistSetting('appearance.renderFont', values.renderFont);
    await persistSetting('appearance.renderSize', values.renderSize);
    await persistSetting('appearance.contentWidth', values.contentWidth);
    // 4T-0575 (Epic 3E-0106): Ecken-Form der Reiter und Gruppen-Koepfe.
    await persistSetting('appearance.roundedTabs', values.roundedTabs);
    // 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile.
    await persistSetting('appearance.highlightActiveLine', values.highlightActiveLine);
    applyAppearanceVars(values);
    // Snapshot auf den neuen Apply-Stand setzen, damit ein spaeteres
    // Abbrechen nur Aenderungen seit diesem Apply verwirft.
    draft.appearance = { ...values };
    draft.appearanceSnapshot = { ...values };
  }
  // 4T-0284: Frontmatter-Anzeige — lokal sofort anwenden (Pipeline,
  // Cache-Invalidierung, Re-Render via Event) und persistieren; der
  // settings:set-Broadcast erreicht zusaetzlich alle Fenster inkl.
  // diesem (idempotent, Muster taskStates).
  const showFrontmatter = draft.showFrontmatter !== false;
  if (showFrontmatter !== isFrontmatterDisplayEnabled()) {
    applyFrontmatterDisplay(showFrontmatter);
    await persistSetting('render.showFrontmatter', showFrontmatter);
  }
  // 4T-0312: ausgeklappte Darstellung — lokal anwenden (Root-Klasse) und
  // persistieren; der settings:set-Broadcast erreicht alle Fenster.
  const frontmatterExpanded = draft.frontmatterExpanded === true;
  if (frontmatterExpanded !== isFrontmatterExpanded()) {
    applyFrontmatterExpanded(frontmatterExpanded);
    await persistSetting('render.frontmatterExpanded', frontmatterExpanded);
  }
  // 4T-0359: Vorschau-Default des Notizen-Panels — lokal anwenden (offene Panels
  // ziehen nach) und persistieren.
  const notesPreviewByDefault = draft.notesPreviewByDefault !== false;
  if (notesPreviewByDefault !== isNotesPreviewByDefault()) {
    setNotesPreviewByDefault(notesPreviewByDefault);
    await persistSetting('notes.previewByDefault', notesPreviewByDefault);
  }
  // 4T-0572 (Epic 3E-0105): globale Voreinstellung der Editor-Ansicht-
  // Schalter — lokal anwenden (wirkt beim naechsten Tab-Erstellen) und nur
  // geaenderte Werte persistieren. Andere offene Fenster lesen die Werte
  // beim eigenen Start; bereits offene Tabs bleiben unberuehrt.
  if (draft.editorViewDefaults) {
    const liveDefaults = getEditorViewDefaults();
    const storeKeys = {
      wrapLines: 'editor.defaultWrapLines',
      showLineNumbers: 'editor.defaultLineNumbers',
      showFoldGutter: 'editor.defaultFoldGutter',
    };
    for (const [field, storeKey] of Object.entries(storeKeys)) {
      const value = draft.editorViewDefaults[field] === true;
      if (value !== liveDefaults[field]) {
        setEditorViewDefaults({ [field]: value });
        await persistSetting(storeKey, value);
      }
    }
  }
}
