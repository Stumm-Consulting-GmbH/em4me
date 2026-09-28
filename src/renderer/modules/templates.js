// 4T-000426 (Epic 3E-000080): Anwendungs-Kommandos der Vorlagen.
//
// Die beiden Nutzer-Wege zur Vorlage: „Neue Datei aus Vorlage" (Auswahl-
// Popup, Dateiname mit Unterseiten-Schreibweise, Datei-Anlage über
// templates:createFile) und „Vorlage einfügen" an der Cursor-Position (eine
// Editor-Transaktion, Undo in einem Schritt). Beide Wege laufen über die
// Zwei-Phasen-Engine (4T-000425): analysieren, Dialog-Kette sequenziell
// erheben, füllen. Ein Abbruch irgendeines Dialogs bricht das GESAMTE
// Anwenden ab — es entsteht keine Datei und kein Einfüge-Text (Epic-Risiko
// „Dialog-Kette", Abbruch-Semantik). Engine-Fehler erscheinen lokalisiert
// als Statusbar-Hinweis.
'use strict';

import { t, intlLocale } from '../i18n.js';
import { api } from './app/api.js';
import { activeTab, state } from './app/app-state.js';
import { paneEditors } from './editor/editor.js';
import { openInPane } from './tabs/tabs.js';
import { showStatusbarHint, toggleEditMode } from './views/views.js';
import { showNameInputDialog } from './dialogs/dialogs.js';
import { activeNotesEditorView } from './panels/notes-panel.js';
import { analyzeTemplate, fillTemplate } from '../../shared/template-engine.js';
import { segmentValidationError, toFileBasename, toLogicalName } from '../../shared/subpages.js';
// 4T-000427: Erweiterungs-Gate des Ordner-Regel-Triggers (dieselbe Filterung
// wie Dispatcher und Menü).
import { disabledCommandIdSet } from '../../shared/extensions/extensions-core.js';
import { getDisabledExtensionIds } from './extensions/extension-lifecycle.js';

function $(sel) {
  return document.querySelector(sel);
}

// --- Auswahl-Popup ------------------------------------------------------------

// Filterbare Vorlagen-Liste (Unterordner als Gruppen). Promise liefert den
// gewählten Listen-Eintrag ({ relPath, group, name }) oder null bei Abbruch
// (Esc, Backdrop, Abbrechen-Button). Pfeiltasten bewegen die aktive Zeile,
// Enter wählt; der Filter matcht Name und Gruppe case-insensitiv.
export function showTemplatePickerDialog(templates) {
  const modal = $('#template-picker-modal');
  const filterInput = $('#template-picker-filter');
  const list = $('#template-picker-list');
  const btnCancel = $('#btn-template-picker-cancel');
  if (!modal || !list) return Promise.resolve(null);

  return new Promise((resolve) => {
    let activeIdx = 0;
    let visible = [];

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      filterInput.removeEventListener('input', renderList);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
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
      const needle = filterInput.value.trim().toLowerCase();
      visible = templates.filter(
        (e) =>
          needle === '' ||
          e.name.toLowerCase().includes(needle) ||
          e.group.toLowerCase().includes(needle) ||
          // 4T-001456: nach der Herkunft filtern — «alle Vorlagen des
          // zentralen Bereichs» ist eine Frage, die der Anwender stellt.
          String(e.sourceName || e.sourceKey || '')
            .toLowerCase()
            .includes(needle),
      );
      list.innerHTML = '';
      let lastGroup = null;
      visible.forEach((entry, idx) => {
        if (entry.group !== lastGroup && entry.group !== '') {
          const groupLi = document.createElement('li');
          groupLi.className = 'template-picker-group';
          groupLi.textContent = entry.group;
          list.appendChild(groupLi);
        }
        lastGroup = entry.group;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = entry.name;
        // 4T-001456: Herkunft je Eintrag — Träger der Vorhersagbarkeit, die
        // früher aus dem einen Ordner folgte. Die eigene Quelle bleibt
        // unbeschriftet; die Marke soll das Fremde zeigen.
        if (entry.sourceKey) {
          const herkunft = document.createElement('span');
          herkunft.className = 'template-picker-source';
          herkunft.textContent = entry.sourceName || entry.sourceKey;
          btn.appendChild(herkunft);
        }
        btn.addEventListener('click', () => finish(entry));
        btn.addEventListener('mousemove', () => setActive(idx));
        li.appendChild(btn);
        list.appendChild(li);
      });
      if (visible.length === 0) {
        const li = document.createElement('li');
        li.className = 'template-picker-empty';
        li.textContent = t('templates.picker.noMatch');
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
        if (visible[activeIdx]) finish(visible[activeIdx]);
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    filterInput.value = '';
    filterInput.placeholder = t('templates.picker.filterPlaceholder');
    renderList();
    modal.addEventListener('keydown', onKeydown, true);
    filterInput.addEventListener('input', renderList);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => filterInput.focus(), 0);
  });
}

// Auswahl-Dialog der {{select:…}}-Platzhalter: Frage als Titel, Optionen als
// Liste. Promise liefert die gewählte Option (String) oder null bei Abbruch.
export function showTemplateSelectDialog(question, options) {
  const modal = $('#template-select-modal');
  const titleEl = $('#template-select-title');
  const list = $('#template-select-list');
  const btnCancel = $('#btn-template-select-cancel');
  if (!modal || !list) return Promise.resolve(null);

  return new Promise((resolve) => {
    let activeIdx = 0;

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onCancel = () => finish(null);

    const setActive = (idx) => {
      activeIdx = Math.max(0, Math.min(idx, options.length - 1));
      const buttons = list.querySelectorAll('button');
      buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
      const current = buttons[activeIdx];
      if (current) {
        current.focus();
        current.scrollIntoView({ block: 'nearest' });
      }
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
        if (options[activeIdx] !== undefined) finish(options[activeIdx]);
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    titleEl.textContent = question;
    list.innerHTML = '';
    options.forEach((option, idx) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = option;
      btn.addEventListener('click', () => finish(option));
      btn.addEventListener('mousemove', () => setActive(idx));
      li.appendChild(btn);
      list.appendChild(li);
    });
    modal.addEventListener('keydown', onKeydown, true);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => setActive(0), 0);
  });
}

// --- Gemeinsame Bausteine des Anwendens ----------------------------------------

// Vorlagen-Liste holen und Auswahl-Popup zeigen. null = Abbruch oder kein
// nutzbarer Zustand (unkonfiguriert/leer/nicht lesbar, mit Statusbar-Hinweis).
// 4T-001955 (Epic 3E-000319): exportiert — der Dialog «Einstellungen dieser
// Tafel…» wählt die Vorlage einer Tafel über dieselbe Auswahl.
export async function pickTemplateEntry() {
  const liste = await ladeVorlagenListe();
  if (!liste.ok) {
    zeigeListenHinweis(liste.grund);
    return null;
  }
  return showTemplatePickerDialog(liste.templates);
}

// 4T-001956 (Epic 3E-000319): Die Vorlagen-Liste samt ihrer Einordnung, aus
// `pickTemplateEntry` herausgelöst, damit «Notiz aus Karte erzeugen…» dieselbe
// Liste und dieselben Hinweise nutzt, die Lagen aber selbst beantwortet (dort
// heißt «keine Vorlagen» eine leere Notiz und kein Abbruch). Rückgabe:
// `{ ok: true, templates }` oder `{ ok: false, grund }` mit `grund` aus
// `readFailed`, `noFolder`, `missing`, `empty`.
export async function ladeVorlagenListe() {
  let listResult;
  try {
    listResult = await api.templatesList();
  } catch {
    listResult = null;
  }
  if (!listResult || !listResult.ok) return { ok: false, grund: 'readFailed' };
  if (!listResult.folder) return { ok: false, grund: 'noFolder' };
  if (listResult.missing) return { ok: false, grund: 'missing' };
  if (!Array.isArray(listResult.templates) || listResult.templates.length === 0) {
    return { ok: false, grund: 'empty' };
  }
  return { ok: true, templates: listResult.templates };
}

// Die Hinweise der vier Lagen, wörtlich die bisherigen von `pickTemplateEntry`.
const LISTEN_HINWEIS = {
  readFailed: ['templates.readFailed', 3000],
  noFolder: ['templates.noFolder', 3500],
  missing: ['templates.folderMissing', 3500],
  empty: ['templates.picker.empty', 3500],
};

// 4T-001956: Zeigt den Hinweis einer Lage aus `ladeVorlagenListe`.
export function zeigeListenHinweis(grund) {
  const [key, duration] = LISTEN_HINWEIS[grund] || LISTEN_HINWEIS.readFailed;
  showStatusbarHint(key, { duration, error: true });
}

// Engine-Fehler lokalisiert in der Statusbar zeigen ({ code, name, offset }).
// 4T-000433 (Epic 3E-000081): exportiert — der Journal-Anlage-Pfad nutzt
// dieselbe Fehler-Anzeige.
export function showTemplateError(error) {
  const code = error && error.code;
  let text;
  if (code === 'unknownPlaceholder') {
    text = t('templates.error.unknownPlaceholder').replace('{name}', error.name || '');
  } else if (code === 'invalidOffset') {
    text = t('templates.error.invalidOffset').replace('{offset}', error.offset || '');
  } else if (code === 'invalidParams') {
    text = t('templates.error.invalidParams').replace('{name}', error.name || '');
  } else if (code === 'unclosed') {
    text = t('templates.error.unclosed');
  } else {
    text = t('templates.error.generic');
  }
  showStatusbarHint(null, { text, duration: 4500, error: true });
}

// Dialog-Kette der interaktiven Platzhalter, streng sequenziell in der
// Reihenfolge des ersten Vorkommens. null = Abbruch (irgendein Dialog).
// 4T-000433 (Epic 3E-000081): exportiert — der Journal-Anlage-Pfad erhebt
// die Antworten seiner Vorlage ueber dieselbe Kette.
export async function collectAnswers(inputs) {
  const answers = {};
  for (const input of inputs) {
    let value;
    if (input.kind === 'prompt') {
      value = await showNameInputDialog({
        title: input.question,
        initialValue: input.defaultValue || '',
        okLabel: t('dialog.ok'),
      });
    } else {
      value = await showTemplateSelectDialog(input.question, input.options);
    }
    if (value === null || value === undefined) return null;
    answers[input.key] = value;
  }
  return answers;
}

// {{folder}}-Wert der Zieldatei: im Bereich der wurzel-relative Ordner-Pfad
// mit '/'-Trennern ('' für die Wurzel, konsistent zum file.folder-Feld der
// Abfrage-Sprache), außerhalb eines Bereichs der absolute Ordner-Pfad.
// 4T-001956: exportiert für «Notiz aus Karte erzeugen…».
export function folderDisplayFor(dirPath) {
  if (state.areaPath) {
    const rel = api.relative(state.areaPath, dirPath);
    return rel ? rel.replace(/\\/g, '/') : '';
  }
  return dirPath;
}

// Vorlage lesen, analysieren, Dialog-Kette erheben und füllen. Rückgabe:
// { text, cursorOffsets } bei Erfolg, { cancelled: true } bei Dialog-Abbruch
// (die Aufrufer entscheiden über den Hinweis; 4T-000427 nutzt das für den
// Leer-Anlage-Hinweis der Ordner-Regel), null bei Fehler (Hinweis gezeigt).
// 4T-001956: exportiert — «Notiz aus Karte erzeugen…» füllt über denselben Weg.
export async function resolveFilledTemplate(relPath, contextBase, sourceKey) {
  let read;
  try {
    read = await api.templatesRead(relPath, sourceKey);
  } catch {
    read = null;
  }
  if (!read || !read.ok) {
    showStatusbarHint('templates.readFailed', { duration: 3000, error: true });
    return null;
  }
  const analysis = analyzeTemplate(read.content);
  if (!analysis.ok) {
    showTemplateError(analysis.error);
    return null;
  }
  const answers = await collectAnswers(analysis.inputs);
  if (answers === null) return { cancelled: true };
  const filled = fillTemplate(analysis, {
    ...contextBase,
    nowMs: Date.now(),
    // 4T-001057: Namens-Token (MMMM, EEEE …) folgen der Oberflächen-Sprache.
    locale: intlLocale(),
    clipboard: typeof api.clipboardReadText === 'function' ? api.clipboardReadText() : '',
    answers,
  });
  if (!filled.ok) {
    showTemplateError(filled.error);
    return null;
  }
  return filled;
}

// --- Neue Datei aus Vorlage -----------------------------------------------------

// Dateiname in Unterseiten-Schreibweise ('/'-Segmente) validieren: jedes
// Segment nach den Unterseiten-Regeln. Liefert den Fehler-Code des ersten
// ungültigen Segments oder null.
function logicalNameValidationError(value) {
  const s = String(value || '');
  if (!s.trim()) return 'empty';
  for (const segment of s.split('/')) {
    const err = segmentValidationError(segment);
    if (err) return err;
  }
  return null;
}

// Zielordner des Anlage-Wegs: Ordner der aktiven Datei, sonst die
// Bereichs-Wurzel; ohne beides gibt es keinen Ziel-Kontext (Hinweis).
function newFileTargetDir() {
  const tab = activeTab();
  if (tab && tab.path && !tab.manualPage && !tab.systemPage) {
    return api.dirname(tab.path);
  }
  return state.areaPath || null;
}

// Kommando „Neue Datei aus Vorlage": Zielordner klären → Vorlage wählen →
// Dateiname erfragen (Unterseiten-Schreibweise erlaubt) → Platzhalter-
// Dialoge → Datei anlegen, im Tab öffnen, Cursor auf das erste
// {{cursor}}-Ziel. Abbruch an jeder Stelle verwirft alles, es entsteht
// keine Datei. Der Zielordner steht bewusst VOR der Vorlagen-Wahl (Befund
// der Release-Test-Iteration 0.54.0): ohne aktive Datei und ohne Bereich
// fragt ein OS-Ordner-Dialog nach dem Ziel — das Kommando funktioniert
// damit auch im leeren Fenster, statt nach der Dialog-Kette abzubrechen.
export async function newFileFromTemplate() {
  let dirPath = newFileTargetDir();
  if (!dirPath) {
    let chosen;
    try {
      chosen = await api.templatesChooseFolder('target');
    } catch {
      chosen = null;
    }
    if (!chosen || !chosen.ok || !chosen.path) return;
    dirPath = chosen.path;
  }
  const entry = await pickTemplateEntry();
  if (!entry) return;
  const name = await frageNeuenDateinamen();
  if (!name) return;
  const filled = await resolveFilledTemplate(
    entry.relPath,
    { title: name, folder: folderDisplayFor(dirPath) },
    entry.sourceKey,
  );
  if (!filled || filled.cancelled) return;
  const result = await legeNeueDateiAn(dirPath, name, filled.text);
  if (!result.ok) {
    zeigeAnlageHinweis(result.error);
    return;
  }
  await oeffneNeueDatei(result.path, filled.cursorOffsets);
}

// --- 4T-001956: Bausteine des Anlage-Wegs --------------------------------------
//
// Aus `newFileFromTemplate` herausgelöst, damit «Notiz aus Karte erzeugen…»
// dieselbe Namens-Abfrage, dieselbe Anlage ohne Überschreiben und dasselbe
// Öffnen nutzt, statt sie ein zweites Mal zu schreiben. Das Verhalten von
// «Neue Datei aus Vorlage…» bleibt dabei unverändert.

// Namens-Abfrage des Anlage-Wegs (Unterseiten-Schreibweise erlaubt).
// `initialValue` belegt das Feld vor; ohne ihn bleibt es leer wie bisher.
export function frageNeuenDateinamen(initialValue) {
  const optionen = {
    title: t('templates.newFile.title'),
    description: t('templates.newFile.description'),
    placeholder: t('templates.newFile.placeholder'),
    okLabel: t('templates.newFile.ok'),
    validate: (value) => {
      const err = logicalNameValidationError(value);
      return err ? `templates.newFile.error.${err}` : null;
    },
  };
  if (typeof initialValue === 'string') optionen.initialValue = initialValue;
  return showNameInputDialog(optionen);
}

// Legt die Datei an, ohne zu überschreiben. Rückgabe `{ ok: true, path }` oder
// `{ ok: false, error }` mit `error` `exists` bzw. `failed`.
export async function legeNeueDateiAn(dirPath, name, text) {
  let result;
  try {
    result = await api.templatesCreateFile(dirPath, toFileBasename(name), text);
  } catch {
    result = null;
  }
  if (result && result.ok) return { ok: true, path: result.path };
  return { ok: false, error: result && result.error === 'exists' ? 'exists' : 'failed' };
}

// Hinweis einer gescheiterten Anlage, wörtlich der bisherige.
export function zeigeAnlageHinweis(error) {
  const key = error === 'exists' ? 'templates.newFile.exists' : 'templates.newFile.failed';
  showStatusbarHint(key, { duration: 3500, error: true });
}

// Öffnet die neue Datei in der aktiven Spalte und springt auf das erste
// {{cursor}}-Ziel.
export async function oeffneNeueDatei(filePath, cursorOffsets) {
  await openInPane(state.activePaneIndex, [filePath]);
  if (Array.isArray(cursorOffsets) && cursorOffsets.length > 0) {
    jumpToOffsetInActiveTab(cursorOffsets[0]);
  }
}

// Cursor-Sprung nach dem Öffnen der neuen Datei: Edit-Modus sicherstellen
// (toggleEditMode deckt auch den Fall der Lese-Ansicht ab, aus der es in eine
// Bearbeitungs-Ansicht wechselt) und die Selektion auf das Ziel-Offset setzen.
// 4T-001341 (Epic 3E-000238): welche das ist, entscheidet seither die Einstellung
// und nicht mehr die feste Verdrahtung auf „geteilt"; für diesen Weg ändert
// sich nichts, weil er nur den Editor braucht.
// 4T-000433 (Epic 3E-000081): exportiert — der Journal-Anlage-Pfad springt auf
// dasselbe Cursor-Ziel.
export function jumpToOffsetInActiveTab(offset) {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) return;
  if (!tab.editMode) toggleEditMode();
  const view = paneEditors[state.activePaneIndex];
  if (!view) return;
  const anchor = Math.min(offset, view.state.doc.length);
  view.dispatch({ selection: { anchor }, scrollIntoView: true });
  view.focus();
}

// --- 4T-000427: Ordner-Regel-Trigger -----------------------------------------------

// Gemeinsamer Einhak-Punkt aller Datei-Anlagen über die App (Bereichs-Panel,
// Unterseiten-Anlage): Ordner-Regel auflösen und die Vorlage in die frisch
// (leer) angelegte Datei füllen, VOR dem Öffnen im Tab. Der explizite
// Vorlagen-Weg (templates:createFile) läuft bewusst nicht hier durch —
// gewählte Vorlage hat Vorrang, die Ordner-Regel greift nicht zusätzlich.
// Dialog-Abbruch lässt die Datei leer (die Anlage selbst war gewollt) und
// meldet den lokalisierten Hinweis; Engine-/Lese-Fehler ebenso (eigener
// Hinweis aus resolveFilledTemplate). Liefert das Cursor-Ziel oder null.
async function applyFolderRuleToCreatedFile(filePath) {
  const rule = await ordnerRegelVorlage(filePath);
  if (!rule) return null;
  const title = toLogicalName(api.basename(filePath).replace(/\.(md|markdown|mdown|mkd)$/i, ''));
  const filled = await resolveFilledTemplate(
    rule.relPath,
    { title, folder: folderDisplayFor(api.dirname(filePath)) },
    rule.sourceKey,
  );
  if (!filled || filled.cancelled) {
    if (filled && filled.cancelled) {
      showStatusbarHint('templates.rule.cancelled', { duration: 3500 });
    }
    return null;
  }
  let write;
  try {
    // 4T-000945 (Story 4S-000786): Die Datei wurde gerade angelegt und ist leer.
    // Die Erwartung schuetzt zusaetzlich: Hat sie wider Erwarten Inhalt,
    // ueberschreibt die Ordner-Regel ihn nicht, sondern meldet den Konflikt
    // ueber den vorhandenen Fehler-Zweig.
    write = await api.saveFile(filePath, filled.text, { expected: '' });
  } catch {
    write = null;
  }
  if (!write || !write.ok) {
    showStatusbarHint('templates.rule.failed', { duration: 3500, error: true });
    return null;
  }
  return filled.cursorOffsets.length > 0 ? filled.cursorOffsets[0] : null;
}

// Erweiterungs-Gate: mit deaktivierter templates-Erweiterung entfällt
// auch der Anlage-Trigger (Architekturentscheidung 6 des Epics).
// 4T-001956: als eigene Auskunft herausgelöst — «Notiz aus Karte erzeugen…»
// bietet mit ausgeschalteter Erweiterung weder Ordner-Regel noch Auswahl an.
export function vorlagenErweiterungAus() {
  return disabledCommandIdSet(getDisabledExtensionIds()).has('file.newFromTemplate');
}

// Die Vorlage, die die Ordner-Regel für eine (künftige) Datei vorsieht:
// `{ relPath, sourceKey }` oder null. 4T-001956: herausgelöst, damit die Notiz
// aus einer Karte dieselbe Regel befragt wie jede neue Datei im Ordner.
export async function ordnerRegelVorlage(filePath) {
  if (vorlagenErweiterungAus()) return null;
  let rule;
  try {
    rule = await api.templatesRuleFor(filePath);
  } catch {
    rule = null;
  }
  if (!rule || !rule.ok || !rule.template) return null;
  return { relPath: rule.template, sourceKey: rule.sourceKey };
}

// Öffnet eine über die App neu angelegte Datei mit Ordner-Regel-Trigger:
// Regel anwenden (füllt die Datei auf der Platte), dann öffnen, dann Cursor
// auf das erste {{cursor}}-Ziel (wie beim expliziten Vorlagen-Weg).
export async function openCreatedFileWithRule(paneIdx, filePath) {
  const cursorOffset = await applyFolderRuleToCreatedFile(filePath);
  const landedPane = await openInPane(paneIdx, [filePath]);
  if (cursorOffset !== null) jumpToOffsetInActiveTab(cursorOffset);
  return landedPane;
}

// --- Vorlage an der Cursor-Position einfügen -------------------------------------

// Editor-Ziel des Einfüge-Kommandos: das fokussierte Notiz-Feld hat Vorrang,
// sonst der Haupt-Editor der aktiven Spalte mit Edit-Modus-Guard (Muster
// edit.insertTimestamp). null = kein editierbares Ziel.
function insertTargetView() {
  const notesView = activeNotesEditorView();
  if (notesView && !notesView.state.readOnly) return notesView;
  const tab = activeTab();
  if (!tab || !tab.editMode || tab.viewMode === 'rendered') return null;
  const view = paneEditors[state.activePaneIndex];
  return view && !view.state.readOnly ? view : null;
}

// Kommando „Vorlage einfügen": wie oben ohne Datei-Anlage; das Ergebnis wird
// an der Cursor-Position eingefügt (EINE Transaktion — Undo in einem
// Schritt), der Cursor springt auf das erste {{cursor}}-Ziel (ohne Ziel ans
// Ende des Einfüge-Texts). explicitView kommt vom Editor-Kontextmenü (der
// Rechtsklick kennt seine EditorView); der Hotkey-Pfad löst selbst auf.
export function insertTemplateCommand(explicitView) {
  const view = explicitView || insertTargetView();
  if (!view) {
    showStatusbarHint('templates.insert.noEditor', { duration: 3000, error: true });
    return false;
  }
  void runInsertFlow(view);
  return true;
}

async function runInsertFlow(view) {
  const entry = await pickTemplateEntry();
  if (!entry) return;
  const tab = activeTab();
  const targetPath = tab && tab.path ? tab.path : null;
  // {{title}} ist der logische Datei-Titel (Unterseiten-Trennzeichen als '/').
  const title = targetPath
    ? toLogicalName(api.basename(targetPath).replace(/\.(md|markdown|mdown|mkd)$/i, ''))
    : '';
  const filled = await resolveFilledTemplate(
    entry.relPath,
    { title, folder: targetPath ? folderDisplayFor(api.dirname(targetPath)) : '' },
    entry.sourceKey,
  );
  if (!filled || filled.cancelled) return;
  const range = view.state.selection.main;
  const anchor =
    range.from + (filled.cursorOffsets.length > 0 ? filled.cursorOffsets[0] : filled.text.length);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: filled.text },
    selection: { anchor },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}
