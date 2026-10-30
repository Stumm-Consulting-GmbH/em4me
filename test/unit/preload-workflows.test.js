// 4T-002348 (Epic 3E-000184): Die Brücken-Anteile der Workflow-Ausführung und
// der Umzug der vier Puffer-Aufträge aus `preload.js`.
//
// Bestands-Lesungen: Die Brücken-Module laden ihre Kanäle mit einem
// hereingereichten `ipcRenderer` (Muster `index-rundruf.test.js`,
// `preload-diagramme.test.js`). Die Namen der vier umgezogenen Einträge
// (`remindersEdit`, `onRemindersEdit`, `taskQueryEdit`, `onTaskQueryEdit`)
// verwenden src/renderer/modules/reminders.js und task-query-actions.js; sie
// müssen unverändert bleiben. `preload.js` wird als Text gelesen, weil es
// Electron lädt.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { workflowsBridge } = require('../../src/main/preload-workflows.js');
const { bufferEditBridge } = require('../../src/main/preload-buffer-overlay.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = fs.readFileSync(
  path.resolve(HERE, '..', '..', 'src', 'main', 'preload.js'),
  'utf8',
);

function attrappe() {
  const aufrufe = [];
  const zuhoerer = new Map();
  const ipc = {
    invoke: async (...args) => {
      aufrufe.push(args);
      return { ok: true };
    },
    on: (kanal, fn) => zuhoerer.set(kanal, fn),
  };
  return { ipc, aufrufe, zuhoerer };
}

describe('workflowsBridge', () => {
  it('trägt die Einträge mit ihren Kanälen', async () => {
    const { ipc, aufrufe, zuhoerer } = attrappe();
    const bruecke = workflowsBridge(ipc);
    expect(Object.keys(bruecke)).toEqual([
      'workflowStep',
      'onWorkflowBufferEdit',
      'workflowBufferEditDone',
      'workflowRecordRun',
      // 4T-002355: Liste und Konfiguration des Workflow-Ordners.
      'workflowFolderList',
      'onWorkflowFolderChanged',
      'workflowGetConfig',
      'workflowSetAreaConfig',
      // 4T-002355 (Teil 2): Untermenü «Datei → Workflows», «Neuer Workflow …»
      // und «Starten» im Kontextmenü des Bereichs-Panels.
      'onWorkflowMenuAction',
      'workflowSetFolder',
      'workflowCreate',
      'workflowFileInfo',
      // 4T-002350: Seite «Workflow-Läufe».
      'workflowRuns',
      // 4T-002421: Lauf nach Zeitplan.
      'onWorkflowDue',
      'workflowScheduleClaim',
      'workflowScheduleRelease',
      'workflowScheduleFinished',
      'workflowScheduleOpen',
      'workflowSetArmed',
      'workflowArmedState',
    ]);
    await bruecke.workflowStep('/w.md', { line: 1 });
    await bruecke.workflowBufferEditDone({ requestId: 'k', ok: true });
    await bruecke.workflowRecordRun('/w.md', { status: 'ok' });
    await bruecke.workflowFolderList();
    await bruecke.workflowGetConfig();
    await bruecke.workflowSetAreaConfig({ folder: 'Abläufe' });
    await bruecke.workflowSetFolder('/Abläufe');
    await bruecke.workflowCreate('Wochenrückblick');
    await bruecke.workflowFileInfo('/Notizen/w.md');
    await bruecke.workflowScheduleClaim('k1');
    await bruecke.workflowScheduleRelease('k1');
    await bruecke.workflowScheduleFinished('k1');
    await bruecke.workflowScheduleOpen();
    // 4T-002422: Scharf-Schaltung und Scharf-Zustand einer Datei.
    await bruecke.workflowSetArmed('/w.md', true);
    await bruecke.workflowArmedState('/w.md');
    expect(aufrufe).toEqual([
      ['workflow:step', { workflowPath: '/w.md', step: { line: 1 } }],
      ['workflow:bufferEditDone', { requestId: 'k', ok: true }],
      ['workflow:recordRun', { workflowPath: '/w.md', run: { status: 'ok' } }],
      ['workflow:folderList'],
      ['workflow:getConfig'],
      ['workflow:setAreaConfig', { folder: 'Abläufe' }],
      ['workflow:setFolder', { folder: '/Abläufe' }],
      ['workflow:create', { name: 'Wochenrückblick' }],
      ['workflow:fileInfo', '/Notizen/w.md'],
      ['workflow:scheduleClaim', { key: 'k1' }],
      ['workflow:scheduleRelease', { key: 'k1' }],
      ['workflow:scheduleFinished', { key: 'k1' }],
      ['workflow:scheduleOpen'],
      ['workflow:setArmed', { workflowPath: '/w.md', armed: true }],
      ['workflow:armedState', { workflowPath: '/w.md' }],
    ]);
    // 4T-002421: Die Zustellung kommt ohne das Ereignis an.
    const faellig = [];
    bruecke.onWorkflowDue((nutzlast) => faellig.push(nutzlast));
    zuhoerer.get('workflow:due')({}, { items: [] });
    expect(faellig).toEqual([{ items: [] }]);
    const empfangen = [];
    bruecke.onWorkflowBufferEdit((auftrag) => empfangen.push(auftrag));
    zuhoerer.get('workflow:bufferEdit')({}, { requestId: 'k' });
    expect(empfangen).toEqual([{ requestId: 'k' }]);
    // Die Meldung trägt keine Nutzlast; der Empfänger fragt nach.
    let gemeldet = 0;
    bruecke.onWorkflowFolderChanged((...args) => {
      gemeldet += 1;
      expect(args).toEqual([]);
    });
    zuhoerer.get('workflow:folderChanged')({}, 'ignoriert');
    expect(gemeldet).toBe(1);
    // 4T-002355 (Teil 2): Der Handgriff des Menüs kommt ohne das Ereignis an.
    const aktionen = [];
    bruecke.onWorkflowMenuAction((aktion) => aktionen.push(aktion));
    zuhoerer.get('workflow:menuAction')({}, { kind: 'new' });
    expect(aktionen).toEqual([{ kind: 'new' }]);
  });
});

describe('bufferEditBridge (Umzug aus preload.js)', () => {
  it('trägt die vier Puffer-Aufträge mit unveränderten Namen und Kanälen', async () => {
    const { ipc, aufrufe, zuhoerer } = attrappe();
    const bruecke = bufferEditBridge(ipc);
    expect(Object.keys(bruecke)).toEqual([
      'remindersEdit',
      'onRemindersEdit',
      'taskQueryEdit',
      'onTaskQueryEdit',
    ]);
    await bruecke.remindersEdit({ a: 1 });
    await bruecke.taskQueryEdit({ b: 2 });
    expect(aufrufe).toEqual([
      ['reminders:edit', { a: 1 }],
      ['taskQuery:edit', { b: 2 }],
    ]);
    const empfangen = [];
    bruecke.onRemindersEdit((x) => empfangen.push(['r', x]));
    bruecke.onTaskQueryEdit((x) => empfangen.push(['t', x]));
    zuhoerer.get('reminders:edit')({}, 1);
    zuhoerer.get('taskQuery:edit')({}, 2);
    expect(empfangen).toEqual([
      ['r', 1],
      ['t', 2],
    ]);
  });

  it('preload.js spreizt beide Brücken und trägt die Einträge nicht mehr selbst', () => {
    expect(PRELOAD).toContain('...bufferEditBridge(ipcRenderer),');
    expect(PRELOAD).toContain('...workflowsBridge(ipcRenderer),');
    expect(PRELOAD).not.toContain("ipcRenderer.invoke('reminders:edit'");
    expect(PRELOAD).not.toContain("ipcRenderer.invoke('taskQuery:edit'");
  });
});
