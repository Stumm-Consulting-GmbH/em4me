// 4T-0318 (Epic 3E-0057): Unit-Tests für die App-Registry
// (src/main/app/app-registry.js) — logische Applikationen als Fenster-Gruppen.
// Kern: lückenloses Nachrücken der App- und Fenster-Nummern beim Schließen
// und die Sonderrolle der Bereichs-Apps (keine App-Nummer, Bereichsname).
import { describe, it, expect } from 'vitest';
import { createAppRegistry } from '../../src/main/app/app-registry.js';

function infosFor(reg) {
  return reg.displayInfos();
}

describe('createAppRegistry (4T-0318)', () => {
  it('ordnet Fenster ihrer App zu und nummeriert app-lokal', () => {
    const reg = createAppRegistry();
    const app1 = reg.createApp();
    const app2 = reg.createApp();
    reg.assignWindow(101, app1);
    reg.assignWindow(102, app1);
    reg.assignWindow(201, app2);

    const infos = infosFor(reg);
    expect(infos.get(101)).toMatchObject({
      appNumber: 1,
      numberedAppCount: 2,
      windowNumber: 1,
      appWindowCount: 2,
    });
    expect(infos.get(102)).toMatchObject({ appNumber: 1, windowNumber: 2, appWindowCount: 2 });
    expect(infos.get(201)).toMatchObject({ appNumber: 2, windowNumber: 1, appWindowCount: 1 });
  });

  it('Fenster-Nummern rücken innerhalb der App lückenlos nach', () => {
    const reg = createAppRegistry();
    const app1 = reg.createApp();
    reg.assignWindow(1, app1);
    reg.assignWindow(2, app1);
    reg.assignWindow(3, app1);
    reg.removeWindow(2);
    const infos = infosFor(reg);
    expect(infos.get(1).windowNumber).toBe(1);
    expect(infos.get(3).windowNumber).toBe(2);
    expect(infos.get(1).appWindowCount).toBe(2);
  });

  it('App-Nummern rücken nach, wenn eine App komplett schließt', () => {
    const reg = createAppRegistry();
    const app1 = reg.createApp();
    const app2 = reg.createApp();
    const app3 = reg.createApp();
    reg.assignWindow(1, app1);
    reg.assignWindow(2, app2);
    reg.assignWindow(3, app3);
    // Letztes Fenster von App 1 schließt -> App 1 verschwindet, 2 und 3 rücken nach.
    reg.removeWindow(1);
    expect(reg.hasApp(app1)).toBe(false);
    const infos = infosFor(reg);
    expect(infos.get(2).appNumber).toBe(1);
    expect(infos.get(3).appNumber).toBe(2);
    expect(infos.get(2).numberedAppCount).toBe(2);
  });

  it('Bereichs-Apps tragen keine App-Nummer und zählen nicht als nummerierte App', () => {
    const reg = createAppRegistry();
    const normal = reg.createApp();
    const area = reg.createApp({ rootPath: 'C:\\Notizen', name: 'Notizen' });
    reg.assignWindow(1, normal);
    reg.assignWindow(2, area);
    const infos = infosFor(reg);
    expect(infos.get(1)).toMatchObject({ appNumber: 1, numberedAppCount: 1, areaName: null });
    expect(infos.get(2)).toMatchObject({
      appNumber: 0,
      numberedAppCount: 1,
      appCount: 2,
      areaName: 'Notizen',
      areaPath: 'C:\\Notizen',
    });
  });

  it('setArea/getArea/findAppByArea verwalten die Bereichs-Bindung', () => {
    const reg = createAppRegistry();
    const app1 = reg.createApp();
    reg.assignWindow(1, app1);
    expect(reg.getArea(app1)).toBeNull();
    expect(reg.setArea(app1, { rootPath: 'C:\\A', name: 'A' })).toBe(true);
    expect(reg.getArea(app1)).toMatchObject({ name: 'A' });
    expect(reg.findAppByArea((a) => a.rootPath === 'C:\\A')).toBe(app1);
    expect(reg.findAppByArea((a) => a.rootPath === 'C:\\B')).toBeNull();
    reg.setArea(app1, null);
    expect(reg.getArea(app1)).toBeNull();
  });

  it('assignWindow auf unbekannte App schlägt fehl, removeWindow ist idempotent', () => {
    const reg = createAppRegistry();
    expect(reg.assignWindow(1, 999)).toBe(false);
    expect(reg.removeWindow(1)).toBeNull();
    const app1 = reg.createApp();
    reg.assignWindow(1, app1);
    expect(reg.removeWindow(1)).toBe(app1);
    expect(reg.removeWindow(1)).toBeNull();
    expect(reg.windowCount()).toBe(0);
    expect(reg.appIds()).toEqual([]);
  });
});

// 4T-0537 (Epic 3E-0098): Arbeitsbereichs-Zuordnung — benannte Apps tragen
// { id, name }, zählen nicht in die "App N"-Nummerierung und liefern ihren
// Namen über displayInfos (Fenster-Titel-Grundlage für 4T-0538).
describe('Arbeitsbereichs-Zuordnung (4T-0537)', () => {
  it('setWorkspace/getWorkspace/findAppByWorkspaceId verwalten die Zuordnung', () => {
    const reg = createAppRegistry();
    const app1 = reg.createApp();
    reg.assignWindow(1, app1);
    expect(reg.getWorkspace(app1)).toBeNull();
    expect(reg.setWorkspace(app1, { id: 'ws-1', name: 'Projekt Alpha' })).toBe(true);
    expect(reg.getWorkspace(app1)).toEqual({ id: 'ws-1', name: 'Projekt Alpha' });
    expect(reg.findAppByWorkspaceId('ws-1')).toBe(app1);
    expect(reg.findAppByWorkspaceId('ws-2')).toBeNull();
    expect(reg.findAppByWorkspaceId(null)).toBeNull();
    expect(reg.setWorkspace(999, { id: 'x', name: 'X' })).toBe(false);
  });

  it('setWorkspace(null) löst die Zuordnung (Degradierung beim Löschen)', () => {
    const reg = createAppRegistry();
    const app1 = reg.createApp();
    reg.assignWindow(1, app1);
    reg.setWorkspace(app1, { id: 'ws-1', name: 'Projekt Alpha' });
    expect(reg.setWorkspace(app1, null)).toBe(true);
    expect(reg.getWorkspace(app1)).toBeNull();
    expect(reg.findAppByWorkspaceId('ws-1')).toBeNull();
    // Degradierte App ist wieder nummeriert.
    expect(reg.displayInfos().get(1).appNumber).toBe(1);
  });

  it('Arbeitsbereichs-Apps tragen keine App-Nummer und liefern workspaceName', () => {
    const reg = createAppRegistry();
    const normal = reg.createApp();
    const ws = reg.createApp();
    reg.setWorkspace(ws, { id: 'ws-1', name: 'Projekt Alpha' });
    reg.assignWindow(1, normal);
    reg.assignWindow(2, ws);
    const infos = reg.displayInfos();
    expect(infos.get(1)).toMatchObject({
      appNumber: 1,
      numberedAppCount: 1,
      workspaceName: null,
    });
    expect(infos.get(2)).toMatchObject({
      appNumber: 0,
      numberedAppCount: 1,
      appCount: 2,
      workspaceName: 'Projekt Alpha',
    });
  });

  it('Arbeitsbereich mit Bereichs-Bindung liefert beide Namen', () => {
    const reg = createAppRegistry();
    const ws = reg.createApp({ rootPath: 'C:\\Notizen', name: 'Notizen' });
    reg.setWorkspace(ws, { id: 'ws-1', name: 'Projekt Alpha' });
    reg.assignWindow(1, ws);
    expect(reg.displayInfos().get(1)).toMatchObject({
      areaName: 'Notizen',
      workspaceName: 'Projekt Alpha',
    });
  });

  it('die Zuordnung verschwindet mit dem letzten Fenster der App', () => {
    const reg = createAppRegistry();
    const ws = reg.createApp();
    reg.setWorkspace(ws, { id: 'ws-1', name: 'Projekt Alpha' });
    reg.assignWindow(1, ws);
    reg.removeWindow(1);
    expect(reg.hasApp(ws)).toBe(false);
    expect(reg.findAppByWorkspaceId('ws-1')).toBeNull();
  });
});
