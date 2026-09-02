// --- Datei-Aktionen: Unterseite anlegen, Umbenennen, Loesen -----------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
// Die drei Bedienwege am Dateinamen samt ihrem gemeinsamen Ausfuehrungs-Teil
// und dem zentralen Nachzug nach einem Umbenennen (Broadcast erreicht alle
// Fenster).
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
// 4T-000336 (Epic 3E-000061): Unterseiten-Namens-Logik.
import {
  SUBPAGE_SEP,
  basenameValidationError,
  isSubpageBasename,
  lastSegment,
  parentBasename,
  segmentValidationError,
  toFileBasename,
  toLogicalName,
} from '../../../shared/subpages.js';
import { activeTab, state, withDialog } from '../app/app-state.js';
import { updateWindowTitle } from '../editor/editor.js';
// 4T-000585 (Epic 3E-000108): Titelzeile — nach Umbenennen den angezeigten
// Dateinamen nachziehen (Laufzeit-Zyklus ueber title-line.js ist unkritisch,
// Muster format-toolbar/editor-context-menu).
import { updateTitleLineForPane } from './title-line.js';
import { scheduleSubpagesRender } from '../panels/panel-subpages.js';
// 4T-000991 (Epic 3E-000196): bookmarks.js ist in den Feature-Ordner bookmarks/
// geteilt; der Existenz-Hinweis gehoert zum Datenmodell.
import { updateBookmarkPathsForRename } from '../bookmarks/bookmarks.js';
import { noteBookmarkFileExistence } from '../bookmarks/bookmarks-tree.js';
import { openInPane } from '../tabs/tabs.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
// 4T-000427 (Epic 3E-000080): Ordner-Regel-Trigger der Unterseiten-Anlage.
// Laufzeit-Zyklus file-actions <-> templates ist unkritisch (Funktionsaufrufe
// erst zur Laufzeit; Muster der dokumentierten Modularisierungs-Zyklen).
import { openCreatedFileWithRule } from '../templates.js';

import { runLinkUpdatePreview, showLinkUpdateReport } from './link-update.js';
import { invalidatePaneRenderCache } from './pane-render.js';
import { saveTab } from './save-export.js';
import { updateSubpageBreadcrumb } from './subpage-breadcrumb.js';
import { renderTabbar } from './tabbar.js';
import { persistState, showStatusbarHint } from './views.js';

// --- Unterseite anlegen (4T-000338, Epic 3E-000061) ------------------------------
// Kommando 'file.newSubpage' bzw. Menue 'Datei -> Neue Unterseite...':
// fragt das Namens-Segment per Dialog ab, laesst den Main die Datei
// '<aktiver Basename>∕<Segment>.md' im Ordner der aktiven Datei anlegen
// (beliebige Tiefe, weil der aktive Basename selbst eine Unterseite sein
// kann) und oeffnet sie als Tab. Existiert die Zieldatei, wird sie
// geoeffnet statt ueberschrieben.
export async function createSubpageForActiveFile() {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('subpage.create.noFile', { duration: 2500, error: true });
    return;
  }
  const logicalName = toLogicalName(
    api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
  );
  const segment = await showNameInputDialog({
    title: t('subpage.create.title'),
    description: t('subpage.create.description').replace('{page}', logicalName),
    placeholder: t('subpage.create.placeholder'),
    okLabel: t('subpage.create.ok'),
    validate: (value) => {
      const err = segmentValidationError(value);
      return err ? `subpage.create.error.${err}` : null;
    },
  });
  if (!segment) return;
  let result;
  try {
    result = await api.createSubpage(tab.path, segment);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    showStatusbarHint('subpage.create.failed', { duration: 2500, error: true });
    return;
  }
  if (result.existed) {
    showStatusbarHint('subpage.create.exists', { duration: 2500 });
    await openInPane(state.activePaneIndex, [result.path]);
    return;
  }
  // 4T-000427 (Epic 3E-000080): frisch angelegte Unterseiten durchlaufen den
  // Ordner-Regel-Trigger (Vorlage füllen, öffnen, Cursor-Sprung); bereits
  // existierende Dateien (existed) sind keine Anlage und bleiben unberührt.
  await openCreatedFileWithRule(state.activePaneIndex, result.path);
}

// --- Datei umbenennen (4T-000339, Epic 3E-000061) --------------------------------
// Kommando 'file.rename' bzw. Menue/Tab-Kontextmenue: fragt den neuen
// Basename per Dialog ab (Vorbelegung aktueller Name ohne Extension) und
// laesst den Main die Datei im selben Ordner umbenennen. Der Nachzug in
// Tabs, Lesezeichen, Per-Datei-Settings und Sitzung laeuft zentral ueber
// den 'file:renamed'-Broadcast (handleFileRenamed), damit auch andere
// Fenster mit derselben Datei nachziehen.
export async function renameFileForTab(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane ? pane.tabs[tabIdx] : null;
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  // Ungespeicherte Aenderungen zuerst sichern — der Pfad wechselt, ein
  // Dirty-Stand darf nicht am alten Namen haengen bleiben.
  if (tab.dirty) {
    const saved = await saveTab(paneIdx, tabIdx);
    if (!saved) return;
  }
  const currentBase = api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, '');
  // 4T-000340: drei Ebenen-Faelle einheitlich als "eigenes Namens-Segment
  // aendern". Bei Unterseiten wird nur das letzte Segment editiert (die
  // Eltern-Kette bleibt), bei Top-Level-Seiten der ganze Basename. Der
  // Nachfahren-Scan liefert die Anzahl fuer den Kaskaden-Hinweis im Dialog.
  const isSub = isSubpageBasename(currentBase);
  let descendantCount = 0;
  try {
    const scan = await api.subpageDescendants(tab.path);
    if (scan && scan.ok && Array.isArray(scan.files)) descendantCount = scan.files.length;
  } catch {
    /* Scan-Fehler: Kaskade laeuft trotzdem, nur der Hinweis entfaellt */
  }
  let description = isSub
    ? t('rename.descriptionSegment').replace('{name}', toLogicalName(currentBase))
    : t('rename.description').replace('{name}', currentBase);
  if (descendantCount > 0) {
    description += ' ' + t('rename.cascadeHint').replace('{n}', String(descendantCount));
  }
  // 4T-000646 (Epic 3E-000128): Bei einer Unterseite nennt die Beschreibung die
  // Wirkung des Vollname-Schalters, bevor er betaetigt wird.
  if (isSub) description += ' ' + t('rename.fullNameHint');
  // 4T-000346 (Epic 3E-000062): Checkbox-Vorbelegung aus den App-Einstellungen
  // (beide Standard an). Die Vorschau-Checkbox haengt an der Update-Checkbox.
  const defaultUpdate = (await api.getSetting('renameUpdateLinks')) !== false;
  const defaultPreview = (await api.getSetting('renameLinkPreview')) !== false;
  // 4T-000646: Vollname-Schalter. Er wechselt Vorbelegung und Pruefung zwischen
  // Segment- und Vollname-Modus; im Vollname-Modus wird die logische
  // Slash-Schreibweise angezeigt und akzeptiert (U+2215-Uebersetzung wie in
  // der Titelzeile), sonst waere der Eltern-Anteil gar nicht eingebbar — das
  // Trennzeichen liegt auf keiner Tastatur.
  const logicalPrefix = isSub ? toLogicalName(parentBasename(currentBase)) + '/' : '';
  const checkboxes = [
    { id: 'updateLinks', label: t('rename.updateLinks'), checked: defaultUpdate },
    {
      id: 'showPreview',
      label: t('rename.showPreview'),
      checked: defaultPreview,
      requires: 'updateLinks',
    },
  ];
  if (isSub) {
    checkboxes.push({
      id: 'fullName',
      label: t('rename.fullName'),
      checked: false,
      onChange: (checked, field) => {
        const v = String(field.value || '').trim();
        if (checked) {
          field.value = v.startsWith(logicalPrefix) ? v : logicalPrefix + v;
        } else {
          field.value = v.startsWith(logicalPrefix)
            ? v.slice(logicalPrefix.length)
            : v.split('/').pop();
        }
        field.focus();
      },
    });
  }
  const input = await showNameInputDialog({
    title: t('rename.title'),
    description,
    initialValue: isSub ? lastSegment(currentBase) : currentBase,
    okLabel: t('rename.ok'),
    validate: (value, cbs) => {
      const fullName = !!(cbs && cbs.fullName);
      if (isSub && !fullName) {
        const err = segmentValidationError(value);
        if (!err) return null;
        // Segment-Modus: das Trennzeichen ist im Segment nicht erlaubt —
        // der Fehlertext der Unterseiten-Anlage passt dort exakt.
        if (err === 'separator') return 'subpage.create.error.separator';
        return `rename.error.${err}`;
      }
      // Vollname-Modus einer Unterseite: Slash-Form pruefen. Top-Level-Seiten
      // bleiben unveraendert beim bisherigen Verhalten.
      const err = basenameValidationError(isSub ? toFileBasename(value) : value);
      return err ? `rename.error.${err}` : null;
    },
    checkboxes,
  });
  if (!input) return;
  const fullName = !!(input.checkboxes && input.checkboxes.fullName);
  let newBase;
  if (!isSub) {
    newBase = input.value;
  } else if (fullName) {
    newBase = toFileBasename(input.value);
  } else {
    newBase = parentBasename(currentBase) + SUBPAGE_SEP + input.value;
  }
  if (newBase === currentBase) return;
  const updateLinks = !!(input.checkboxes && input.checkboxes.updateLinks);
  const showPreview = updateLinks && !!(input.checkboxes && input.checkboxes.showPreview);

  await applyRename(tab, newBase, updateLinks, showPreview);
}

// 4T-000774 (Epic 3E-000128): gemeinsamer Ausfuehrungs-Teil von Umbenennen und
// Loesen — optionale Vorschau, der Aufruf selbst, Fehler- und Ergebnis-
// Bericht. Beide Bedienwege unterscheiden sich nur im Dialog davor und im
// gebildeten Ziel-Basename.
async function applyRename(tab, newBase, updateLinks, showPreview) {
  // 4T-000346: optionale Vorschau vor der Umbenennung. Abbrechen bricht den
  // gesamten Vorgang ab (es ist noch nichts passiert).
  if (showPreview) {
    const proceed = await withDialog(() => runLinkUpdatePreview(tab.path, newBase));
    if (!proceed) return;
  }

  let result;
  try {
    result = await api.renameFile(tab.path, newBase, updateLinks);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    if (result && result.code === 'partial') {
      // 4T-000340: Teilfehler-Bericht — wie viele Dateien umbenannt wurden.
      showStatusbarHint(null, {
        text: t('rename.partial')
          .replace('{done}', String(result.renamedCount || 0))
          .replace('{total}', String(result.totalCount || 0)),
        duration: 4000,
        error: true,
      });
      return;
    }
    const key = result && result.code === 'exists' ? 'rename.exists' : 'rename.failed';
    showStatusbarHint(key, { duration: 2500, error: true });
    return;
  }
  // 4T-000346: Ergebnis-Bericht — nur bei aktivem Link-Update (PO-Anforderung);
  // ohne Update bleibt das bisherige Verhalten (Statusbar-Hinweise).
  if (updateLinks && result.linkUpdate) {
    await withDialog(() => showLinkUpdateReport(result));
  }
}

// --- Unterseite loesen (4T-000774, Epic 3E-000128) -------------------------------
// Kommando 'file.detachSubpage' bzw. Menue/Tab-Kontextmenue: macht aus einer
// Unterseite eine eigenstaendige Seite. Technisch ist das die Umbenennung auf
// das eigene letzte Namens-Segment — der Main bildet die Ziel-Paare ueber
// Praefix-Ersetzung, weshalb eigene Unterseiten mitwandern, die Kollisions-
// pruefung ueber alle Ziele vorab laeuft und die Verweis-Nachfuehrung
// unveraendert greift. Der Ziel-Name ist im Dialog aenderbar, damit eine
// Kollision auf der Zielebene an Ort und Stelle aufloesbar ist.
export async function detachSubpageForTab(paneIdx, tabIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane ? pane.tabs[tabIdx] : null;
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  const currentBase = api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, '');
  if (!isSubpageBasename(currentBase)) {
    showStatusbarHint('detach.notSubpage', { duration: 3000, error: true });
    return;
  }
  // Ungespeicherte Aenderungen zuerst sichern (Semantik des Umbenennens).
  if (tab.dirty) {
    const saved = await saveTab(paneIdx, tabIdx);
    if (!saved) return;
  }
  let descendantCount = 0;
  try {
    const scan = await api.subpageDescendants(tab.path);
    if (scan && scan.ok && Array.isArray(scan.files)) descendantCount = scan.files.length;
  } catch {
    /* Scan-Fehler: das Loesen laeuft trotzdem, nur der Hinweis entfaellt */
  }
  const target = lastSegment(currentBase);
  let description = t('detach.description')
    .replace('{name}', toLogicalName(currentBase))
    .replace('{target}', target);
  if (descendantCount > 0) {
    description += ' ' + t('rename.cascadeHint').replace('{n}', String(descendantCount));
  }
  const defaultUpdate = (await api.getSetting('renameUpdateLinks')) !== false;
  const defaultPreview = (await api.getSetting('renameLinkPreview')) !== false;
  const input = await showNameInputDialog({
    title: t('detach.title'),
    description,
    initialValue: target,
    okLabel: t('detach.ok'),
    validate: (value) => {
      // Das Ergebnis ist eine eigenstaendige Seite: ein Schraegstrich waere
      // das Umhaengen unter eine andere Seite und liegt ausserhalb des Umfangs.
      const err = segmentValidationError(value);
      if (!err) return null;
      if (err === 'separator') return 'subpage.create.error.separator';
      return `rename.error.${err}`;
    },
    checkboxes: [
      { id: 'updateLinks', label: t('rename.updateLinks'), checked: defaultUpdate },
      {
        id: 'showPreview',
        label: t('rename.showPreview'),
        checked: defaultPreview,
        requires: 'updateLinks',
      },
    ],
  });
  if (!input) return;
  const newBase = input.value;
  if (newBase === currentBase) return;
  const updateLinks = !!(input.checkboxes && input.checkboxes.updateLinks);
  const showPreview = updateLinks && !!(input.checkboxes && input.checkboxes.showPreview);
  await applyRename(tab, newBase, updateLinks, showPreview);
}

export function detachActiveSubpage() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  return detachSubpageForTab(state.activePaneIndex, pane.activeIndex);
}

export function renameActiveFile() {
  const pane = state.panes[state.activePaneIndex];
  if (!pane || pane.activeIndex < 0) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  return renameFileForTab(state.activePaneIndex, pane.activeIndex);
}

// Zentraler Nachzug nach einem Umbenennen (Broadcast erreicht alle
// Fenster): Tab-Pfade und -Titel, Per-Datei-Settings, Lesezeichen,
// Backlinks-Anmeldung; die Sitzungs-Persistenz schreibt den neuen Stand.
export async function handleFileRenamed(oldPath, newPath) {
  if (!oldPath || !newPath) return;
  let touchedActive = false;
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    let touchedPane = false;
    for (let i = 0; i < pane.tabs.length; i++) {
      const tab = pane.tabs[i];
      if (tab.path !== oldPath) continue;
      tab.path = newPath;
      tab.missing = false;
      touchedPane = true;
      if (p === state.activePaneIndex && i === pane.activeIndex) touchedActive = true;
    }
    if (touchedPane) renderTabbar(p);
  }
  // Backlinks-Owner-Registrierung folgt dem neuen Pfad (gleiche Wurzel;
  // die Paar-Buchung request/release muss den neuen Namen kennen).
  if (state.backlinks && Array.isArray(state.backlinks.currentFileByPane)) {
    for (let p = 0; p < state.backlinks.currentFileByPane.length; p++) {
      if (state.backlinks.currentFileByPane[p] === oldPath) {
        state.backlinks.currentFileByPane[p] = newPath;
      }
    }
  }
  try {
    await updateBookmarkPathsForRename(oldPath, newPath);
  } catch {
    /* Lesezeichen-Nachzug scheitert nicht hart */
  }
  noteBookmarkFileExistence(newPath, true);
  if (touchedActive) updateWindowTitle();
  invalidatePaneRenderCache();
  // 4T-000341: Breadcrumb und Unterseiten-Sektion folgen dem neuen Namen.
  for (let p = 0; p < state.panes.length; p++) {
    updateSubpageBreadcrumb(p);
    if (state.subpages && state.subpages.visibleByPane[p]) scheduleSubpagesRender(p);
    // 4T-000585 (Epic 3E-000108): Titelzeile zeigt den neuen Namen.
    updateTitleLineForPane(p);
  }
  persistState();
}

// --- Teile wieder vereinen (4T-001293, Epic 3E-000224) ---------------------------
// Kommando 'file.rejoinParts' bzw. Menue-Eintrag: macht aus einem geteilten
// Dokument wieder eine einzelne Datei. Der Befehl ist der EINZIGE Weg dorthin
// (O9); automatisch geschieht das nie, weil es Rebalancing waere und die Zahl
// der Teile nie von selbst schrumpfen soll.
//
// Bestaetigung und Schwellen-Warnung fuehrt der Haupt-Prozess, wo auch die
// Teilungs-Ankuendigung sitzt: Beide gehoeren zur selben Fachlichkeit und
// stuenden im Renderer ein zweites Mal.
export async function rejoinActiveDocumentParts() {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showStatusbarHint('rename.noFile', { duration: 2500, error: true });
    return;
  }
  // Ungespeicherte Aenderungen zuerst sichern — dieselbe Semantik wie beim
  // Umbenennen. Sonst vereinte der Befehl den Platten-Stand, waehrend der
  // Puffer einen neueren traegt.
  const paneIdx = state.activePaneIndex;
  if (tab.dirty && !(await saveTab(paneIdx, state.panes[paneIdx].activeIndex))) return;
  const res = await withDialog(() => api.rejoinParts(tab.path));
  if (!res || !res.ok) {
    if (res && res.code === 'canceled') return;
    const schluessel =
      res && res.code === 'not-split'
        ? 'statusbar.rejoinNotSplit'
        : res && res.code === 'parts-missing'
          ? 'statusbar.rejoinPartsMissing'
          : 'statusbar.rejoinFailed';
    showStatusbarHint(schluessel, { duration: 5000, error: true });
    return;
  }
  // Der Text hat sich geaendert: Die Zuordnungs-Zeile ist fort. Der Reiter
  // zieht den geschriebenen Stand nach, sonst meldete das naechste Speichern
  // einen Konflikt gegen den eigenen Vorgang.
  if (typeof res.text === 'string') {
    tab.content = res.text;
    tab.originalContent = res.text;
    tab.dirty = false;
  }
  invalidatePaneRenderCache();
  renderTabbar(paneIdx);
  showStatusbarHint('statusbar.rejoinDone', { duration: 4000 });
}
