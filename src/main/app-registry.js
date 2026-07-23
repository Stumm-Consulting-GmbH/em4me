// 4T-0318 (Epic 3E-0057): App-Registry — logische Applikationen als
// Fenster-Gruppen innerhalb des einen Electron-Prozesses (Weg-B-Entscheidung:
// der Single-Instance-Lock bleibt, "Mehrfachstart" erzeugt logische Apps).
//
// Electron-frei und zustandsgekapselt (Factory statt Modul-Singleton), damit
// die Nummerierungs-Logik unit-testbar ist. main.js haelt genau eine Instanz
// und verdrahtet sie mit der windows-Map.
//
// Modell:
//   - Jedes Fenster gehoert zu genau einer App (Zuordnung bei Erstellung).
//   - Eine App ohne Bereich ist "nummeriert"; App-Nummern und Fenster-Nummern
//     (pro App) ruecken beim Schliessen lueckenlos nach, weil sie bei jedem
//     Broadcast aus der aktuellen Insertion-Order neu berechnet werden
//     (Muster der bisherigen Fenster-Nummerierung aus 4T-0012).
//   - Eine App mit Bereich (3E-0058) traegt statt der Nummer den Bereichsnamen;
//     das area-Feld ist hier bereits vorgesehen: { rootPath, name } | null.
//   - Eine App kann ein benannter Arbeitsbereich sein (4T-0537, Epic 3E-0098):
//     workspace = { id, name } | null. Arbeitsbereichs-Apps sind benannt und
//     zaehlen daher — wie Bereichs-Apps — nicht in die "App N"-Nummerierung.
//   - Die letzte schliessende Fenster-Zuordnung entfernt die App.
'use strict';

function createAppRegistry() {
  const apps = new Map(); // appId -> { id, area: null | { rootPath, name }, workspace: null | { id, name } }
  const windowToApp = new Map(); // windowId -> appId (Insertion-Order = Erzeugungsreihenfolge)
  let nextAppId = 1;

  function createApp(area = null) {
    const id = nextAppId;
    nextAppId += 1;
    apps.set(id, { id, area: area || null, workspace: null });
    return id;
  }

  function hasApp(appId) {
    return apps.has(appId);
  }

  function assignWindow(windowId, appId) {
    if (!apps.has(appId)) return false;
    windowToApp.set(windowId, appId);
    return true;
  }

  function appOf(windowId) {
    const appId = windowToApp.get(windowId);
    return appId != null && apps.has(appId) ? appId : null;
  }

  function windowsOf(appId) {
    const result = [];
    for (const [windowId, id] of windowToApp) {
      if (id === appId) result.push(windowId);
    }
    return result;
  }

  // Entfernt die Fenster-Zuordnung; eine App ohne verbleibende Fenster wird
  // geloescht. Liefert die (ehemalige) appId oder null.
  function removeWindow(windowId) {
    const appId = windowToApp.get(windowId);
    windowToApp.delete(windowId);
    if (appId != null && windowsOf(appId).length === 0) {
      apps.delete(appId);
    }
    return appId != null ? appId : null;
  }

  function getArea(appId) {
    const app = apps.get(appId);
    return app ? app.area : null;
  }

  function setArea(appId, area) {
    const app = apps.get(appId);
    if (!app) return false;
    app.area = area || null;
    return true;
  }

  // Findet die App, deren Bereich das Praedikat erfuellt (z.B. Pfad-Gleichheit
  // fuer "derselbe Bereich laeuft schon"). Liefert die appId oder null.
  function findAppByArea(predicate) {
    for (const app of apps.values()) {
      if (app.area && predicate(app.area)) return app.id;
    }
    return null;
  }

  // 4T-0537: Arbeitsbereichs-Zuordnung einer App setzen ({ id, name }) bzw.
  // loesen (null; Degradierung zur unbenannten App beim Loeschen).
  function setWorkspace(appId, workspace) {
    const app = apps.get(appId);
    if (!app) return false;
    app.workspace = workspace && workspace.id ? { id: workspace.id, name: workspace.name } : null;
    return true;
  }

  function getWorkspace(appId) {
    const app = apps.get(appId);
    return app ? app.workspace : null;
  }

  // "Derselbe Arbeitsbereich laeuft schon" (kein Doppel-Oeffnen, Workshop-
  // Punkt 3). Liefert die appId oder null.
  function findAppByWorkspaceId(workspaceId) {
    if (!workspaceId) return null;
    for (const app of apps.values()) {
      if (app.workspace && app.workspace.id === workspaceId) return app.id;
    }
    return null;
  }

  function appIds() {
    return [...apps.keys()];
  }

  function windowCount() {
    return windowToApp.size;
  }

  // Anzeige-Infos aller registrierten Fenster in einem Durchgang:
  //   appNumber        1..n ueber die Apps OHNE Bereich und OHNE Arbeitsbereich
  //                    (0 fuer Bereichs- und Arbeitsbereichs-Apps)
  //   numberedAppCount Anzahl der Apps ohne Bereich/Arbeitsbereich
  //   appCount         Anzahl aller Apps
  //   areaName/-Path   Bereichs-Daten der App (null ohne Bereich)
  //   workspaceName    Arbeitsbereichs-Name der App (null ohne Arbeitsbereich)
  //   windowNumber     1..n innerhalb der App
  //   appWindowCount   Fensterzahl der App
  function displayInfos() {
    const numbered = [...apps.values()].filter((a) => !a.area && !a.workspace);
    const numberByApp = new Map(numbered.map((a, i) => [a.id, i + 1]));
    const infos = new Map();
    for (const app of apps.values()) {
      const winIds = windowsOf(app.id);
      winIds.forEach((windowId, i) => {
        infos.set(windowId, {
          appId: app.id,
          appNumber: numberByApp.get(app.id) || 0,
          numberedAppCount: numbered.length,
          appCount: apps.size,
          areaName: app.area ? app.area.name : null,
          areaPath: app.area ? app.area.rootPath : null,
          workspaceName: app.workspace ? app.workspace.name : null,
          windowNumber: i + 1,
          appWindowCount: winIds.length,
        });
      });
    }
    return infos;
  }

  return {
    createApp,
    hasApp,
    assignWindow,
    appOf,
    windowsOf,
    removeWindow,
    getArea,
    setArea,
    findAppByArea,
    setWorkspace,
    getWorkspace,
    findAppByWorkspaceId,
    appIds,
    windowCount,
    displayInfos,
  };
}

module.exports = { createAppRegistry };
