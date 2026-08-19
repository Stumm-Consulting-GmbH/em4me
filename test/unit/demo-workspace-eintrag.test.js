// 4T-0645 (Epic 3E-0127): Regressionstest zum Datenverlust-Fehler beim
// Eintragen der Demo-Arbeitsbereiche.
//
// Fehlerbild (vom Product Owner am 2026-08-18 an der gebauten Programmdatei
// gefunden): Nach dem Anlegen der Beispiel-Sammlung standen im Menü
// "Datei → Arbeitsbereiche" NUR noch die beiden Demo-Einträge. Die produktiv
// genutzten Arbeitsbereiche des Anwenders waren verschwunden und kamen beim
// Öffnen nur noch als Applikationen ohne Namen zurück.
//
// Ursache: Die Einhänge-Stelle behandelte `workspacesState` als Getter-
// Funktion. Tatsächlich reicht die Verdrahtung das ARRAY des In-Memory-Stands
// durch (`...areaApps`). Die typeof-Weiche lief deshalb immer in den leeren
// Zweig, und der Bestand wurde ersetzt statt ergänzt.
//
// Dieser Test ruft den Handler mit dem ECHTEN Deps-Zuschnitt auf. Ein Test
// gegen die reine Bau-Funktion hätte den Fehler nicht gefunden: Die Bau-Logik
// war korrekt, falsch war die Annahme über die Schnittstelle.
import { afterEach, describe, expect, it } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');

const tempOrdner = [];

afterEach(async () => {
  while (tempOrdner.length) {
    const dir = tempOrdner.pop();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function leererZielordner() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'em4me-demo-ws-'));
  tempOrdner.push(dir);
  return dir;
}

// Deps im Zuschnitt, den main.js tatsächlich zusammenstellt: workspacesState
// ist ein ARRAY, setWorkspacesState mutiert es in-place.
function baueDeps(bestand = []) {
  const workspacesState = [...bestand];
  const gespeichert = {};
  const store = {
    get: (key) => (key === 'extensions.disabled' ? [] : undefined),
    set: (key, wert) => {
      gespeichert[key] = wert;
    },
  };
  let meldungen = 0;
  return {
    deps: {
      dialog: {},
      senderWindow: () => null,
      areaOfWindow: () => null,
      tForWindow: (_w, key) => key,
      appRegistry: {},
      openAreaPath: (p) => ({ ok: true, rootPath: p }),
      closeAreaApp: async () => ({ ok: true }),
      isMarkdownPath: (p) => p.endsWith('.md'),
      getStore: () => store,
      workspacesState,
      setWorkspacesState: (list) => {
        workspacesState.length = 0;
        if (Array.isArray(list)) workspacesState.push(...list);
      },
      workspacesChanged: () => {
        meldungen += 1;
      },
    },
    workspacesState,
    gespeichert,
    meldungen: () => meldungen,
  };
}

function registriere(deps) {
  const handler = new Map();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), deps);
  return handler;
}

const BESTAND = [
  { id: 'eigener-1', name: 'EM4me', color: 'orange', open: false, lastOpenedAt: null, app: {} },
  {
    id: 'eigener-2',
    name: 'Vertrieb-2026',
    color: 'blue',
    open: false,
    lastOpenedAt: null,
    app: {},
  },
];

describe('Eintragen der Demo-Arbeitsbereiche', () => {
  it('erhält vorhandene Arbeitsbereiche und ergänzt die neuen', async () => {
    const umgebung = baueDeps(BESTAND);
    const handler = registriere(umgebung.deps);
    const ziel = await leererZielordner();

    const ergebnis = await handler.get('demoArea:createAt')({}, ziel);
    expect(ergebnis.ok).toBe(true);

    const namen = umgebung.workspacesState.map((ws) => ws.name);
    // Der eigentliche Regressions-Anker: die beiden Bestands-Einträge stehen
    // unverändert vorn, die Demo-Einträge kommen hinzu.
    expect(namen.slice(0, 2)).toEqual(['EM4me', 'Vertrieb-2026']);
    expect(namen).toContain('Astronomy');
    expect(namen).toContain('Getting Started');
    expect(umgebung.workspacesState.length).toBe(4);
  });

  it('schreibt denselben Gesamtstand in den Speicher', async () => {
    const umgebung = baueDeps(BESTAND);
    const handler = registriere(umgebung.deps);
    const ziel = await leererZielordner();

    await handler.get('demoArea:createAt')({}, ziel);

    const abgelegt = umgebung.gespeichert.workspaces;
    expect(Array.isArray(abgelegt)).toBe(true);
    expect(abgelegt.map((ws) => ws.name)).toEqual(umgebung.workspacesState.map((ws) => ws.name));
    expect(abgelegt.length).toBe(4);
  });

  it('vergibt Kennungen ohne Kollision mit dem Bestand', async () => {
    const mitDemoId = [{ id: 'demo-1', name: 'Fremd mit gleicher Kennung', app: {} }, ...BESTAND];
    const umgebung = baueDeps(mitDemoId);
    const handler = registriere(umgebung.deps);
    const ziel = await leererZielordner();

    await handler.get('demoArea:createAt')({}, ziel);

    const ids = umgebung.workspacesState.map((ws) => ws.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(umgebung.workspacesState[0].name).toBe('Fremd mit gleicher Kennung');
  });

  it('meldet die Änderung an die Oberfläche', async () => {
    const umgebung = baueDeps(BESTAND);
    const handler = registriere(umgebung.deps);
    const ziel = await leererZielordner();

    await handler.get('demoArea:createAt')({}, ziel);
    expect(umgebung.meldungen()).toBe(1);
  });

  it('trägt bei abgeschalteter Erweiterung nichts ein und lässt den Bestand unberührt', async () => {
    const umgebung = baueDeps(BESTAND);
    umgebung.deps.getStore = () => ({
      get: (key) => (key === 'extensions.disabled' ? ['workspaces'] : undefined),
      set: () => {},
    });
    const handler = registriere(umgebung.deps);
    const ziel = await leererZielordner();

    const ergebnis = await handler.get('demoArea:createAt')({}, ziel);
    expect(ergebnis.ok).toBe(true);
    expect(umgebung.workspacesState.map((ws) => ws.name)).toEqual(['EM4me', 'Vertrieb-2026']);
  });

  it('lässt den Bestand unberührt, wenn die Anlage selbst scheitert', async () => {
    const umgebung = baueDeps(BESTAND);
    const handler = registriere(umgebung.deps);
    const ziel = await leererZielordner();
    // Nicht leerer Zielordner: die Anlage lehnt ab, bevor irgendetwas geschieht.
    await fsp.writeFile(path.join(ziel, 'belegt.md'), 'x', 'utf8');

    const ergebnis = await handler.get('demoArea:createAt')({}, ziel);
    expect(ergebnis.ok).toBe(false);
    expect(umgebung.workspacesState.map((ws) => ws.name)).toEqual(['EM4me', 'Vertrieb-2026']);
  });
});
