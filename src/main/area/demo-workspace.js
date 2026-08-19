// 4T-0645 (Epic 3E-0127): Zustands-Vorlage der Beispiel-Sammlung als benannte
// Arbeitsbereiche materialisieren.
//
// Warum ueberhaupt: Die Beispiel-Sammlung ist ein Ordner, der Sitzungs-Zustand
// dagegen ein Store-Eintrag ('workspaces'). Ein Kopiervorgang kann per
// Konstruktion keine Applikationen, Fenster und Reiter-Gruppen mitbringen.
// Die Sammlung fuehrt deshalb eine Vorlage mit relativen Pfaden, und dieses
// Modul loest sie gegen den erst zur Laufzeit bekannten Zielordner auf.
//
// Die Vorlage liegt NEBEN src/demo/ (src/demo-workspace.json) und nicht darin:
// Sie ist Programm-Beigabe und wuerde als technische Datei zwischen den
// Beispiel-Dokumenten im Zielordner des Anwenders als Fremdkoerper stehen.
//
// Modul ist zur Ladezeit electron-frei (unit-testbar), Muster demo-area.js.
// Es schreibt NICHT in den Store: es baut die Eintraege, das Eintragen bleibt
// beim Aufrufer. Damit bleibt die reine Bau-Logik ohne Store-Attrappe pruefbar.
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { TAB_GROUP_COLOR_KEYS } = require('../../shared/tab-group-colors');

// Ablageort der Vorlage (wandert ueber die src/**-Packliste in die EXE).
const DEMO_WORKSPACE_TEMPLATE = path.join(__dirname, '..', '..', 'demo-workspace.json');

// Pane-Snapshot der Vorlage in das persistierte Format bringen. Die Pfade sind
// in der Vorlage relativ und werden hier gegen den Zielordner aufgeloest;
// Backslashes entstehen dabei plattformgerecht ueber path.join.
function resolvePane(pane, targetDir) {
  const rawPaths = Array.isArray(pane && pane.paths) ? pane.paths : [];
  const paths = rawPaths
    .filter((p) => typeof p === 'string' && p)
    .map((p) => path.join(targetDir, p));
  const rawGroups = Array.isArray(pane && pane.groups) ? pane.groups : [];
  const groups = rawGroups
    .filter((g) => g && typeof g === 'object')
    .map((g) => ({
      name: typeof g.name === 'string' ? g.name : '',
      // Eine Farbe ausserhalb der Acht-Farben-Palette wuerde spaeter still auf
      // die erste normalisiert; hier faellt sie sichtbar in denselben Wert,
      // aber bereits an der Quelle.
      color: TAB_GROUP_COLOR_KEYS.includes(g.color) ? g.color : TAB_GROUP_COLOR_KEYS[0],
      collapsed: !!g.collapsed,
    }));
  const rawSettings = Array.isArray(pane && pane.tabSettings) ? pane.tabSettings : [];
  // Die tabSettings-Indizes fluchten mit den Tab-Indizes (Vertrag aus
  // restorePanes); ein fehlender Eintrag heisst "keine Gruppe".
  const tabSettings = paths.map((_, j) => {
    const s = rawSettings[j];
    const gi = s && Number.isInteger(s.group) ? s.group : -1;
    return gi >= 0 && gi < groups.length ? { group: gi } : {};
  });
  const activeIndex =
    Number.isInteger(pane && pane.activeIndex) && pane.activeIndex >= 0 ? pane.activeIndex : 0;
  return {
    paths,
    activeIndex: paths.length === 0 ? 0 : Math.min(activeIndex, paths.length - 1),
    groups,
    tabSettings,
  };
}

// Baut die Arbeitsbereichs-Eintraege einer Vorlage fuer einen Zielordner.
// makeId erzeugt die Ablage-Kennungen und ist injizierbar, damit der Bau in
// Tests deterministisch bleibt; open ist bewusst false, weil die Anlage den
// Bereich selbst oeffnet und ein zweiter offener Stand daneben irrefuehrt.
function buildDemoWorkspaces(template, targetDir, makeId) {
  if (!template || typeof template !== 'object') return [];
  if (typeof targetDir !== 'string' || !targetDir) return [];
  const list = Array.isArray(template.workspaces) ? template.workspaces : [];
  const nextId = typeof makeId === 'function' ? makeId : (i) => `demo-${i + 1}`;
  const result = [];
  list.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) return;
    const rawWindows = Array.isArray(entry.windows) ? entry.windows : [];
    const windows = rawWindows
      .filter((w) => w && typeof w === 'object')
      .map((w) => ({
        panes: (Array.isArray(w.panes) ? w.panes : [])
          .filter((p) => p && typeof p === 'object')
          .map((p) => resolvePane(p, targetDir)),
      }))
      // Ein Fenster ohne jeden Reiter traegt nichts bei und wuerde beim
      // Wiederherstellen als leeres Fenster aufgehen.
      .filter((w) => w.panes.some((p) => p.paths.length > 0));
    if (windows.length === 0) return;
    result.push({
      id: nextId(i),
      name,
      color: TAB_GROUP_COLOR_KEYS.includes(entry.color) ? entry.color : TAB_GROUP_COLOR_KEYS[0],
      open: false,
      lastOpenedAt: null,
      app: { area: { rootPath: targetDir }, windows },
    });
  });
  return result;
}

// Liest die Vorlage und baut die Eintraege. Eine fehlende oder defekte Vorlage
// liefert eine leere Liste statt zu werfen: Die Anlage der Sammlung selbst ist
// dann trotzdem gelungen, und ein fehlender Arbeitsbereich ist kein Grund, dem
// Anwender den kopierten Bestand zu verweigern (Muster der Bereichsdatei, die
// bei Defekt wie "nicht konfiguriert" wirkt).
async function loadDemoWorkspaces(targetDir, makeId, templatePath = DEMO_WORKSPACE_TEMPLATE) {
  let template;
  try {
    template = JSON.parse(await fsp.readFile(templatePath, 'utf8'));
  } catch (err) {
    console.warn('[demo-workspace] Vorlage nicht lesbar:', err && err.message ? err.message : err);
    return [];
  }
  return buildDemoWorkspaces(template, targetDir, makeId);
}

module.exports = { DEMO_WORKSPACE_TEMPLATE, buildDemoWorkspaces, loadDemoWorkspaces };
