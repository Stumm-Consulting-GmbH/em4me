// 4T-002788 (Epic 3E-000397): Beim Beenden überschreibt keine Sicherung mehr
// den vollständigen Stand der Fenster.
//
// Der Befund: 'before-quit' sichert alle Fenster, danach schließen sie einzeln,
// jedes nach der Rückfrage an seinen Anzeige-Prozess. Die verzögerte Sicherung
// (500 ms nach einer Meldung der Reiter oder einer Änderung von Lage und Größe)
// war dabei nicht gesperrt. Feuerte ihr Timer, nachdem das erste von zwei
// Fenstern geschlossen war, schrieb sie den Stand mit einem Fenster über den
// vollständigen; nach dem Neustart kam ein Fenster statt zwei (Ablauf-Fälle
// SBE-01 in sitzung-beenden.spec.js und «Mehr-Fenster-Sitzung» in
// regal.spec.js, dieser in der Prüfmaschine am Zug-Zweig in 4 von 115
// Durchgängen rot).
//
// Die Behebung: Das ERSTE Fenster, das beim Beenden schließt, sichert den Stand
// ein letztes Mal vollständig und sperrt danach jede weitere Sicherung. Vorher,
// solange noch alle Fenster offen sind, darf gesichert werden; so bleibt in
// der Sitzung, was eine Rückfrage beim Beenden ändert, BEVOR das erste Fenster
// schließt. Was ein Fenster danach noch meldet (etwa eine Datei, die in der
// Rückfrage des zweiten Fensters unter neuem Namen gespeichert wird, nachdem
// das erste schon zu ist), kommt nicht mehr hinein; das ist die bewusste
// Grenze der Behebung (Task, Kapitel «Lösung»), und der Fall dazu unten zeigt
// sie mit zwei Fenstern.
//
// Gemessen wird am echten Modul `src/main/window-persistence.js` mit
// nachgebildeten Fenstern und einem Speicher, der jede Schreibung festhält.
// Die Abfolge je Fall ist die des Schließ-Pfads in `window-manager.js`, hier
// nachgebildet in `schliesse`; dass der echte Schließ-Pfad dieselben Aufrufe
// macht, ist am Quelltext geprüft, weil `window-manager.js` ohne Electron
// nicht ladbar ist (Muster neues-fenster.test.js).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWindowPersistence } = require('../../src/main/window-persistence.js');

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');
const quelle = (...teile) => fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');

function fenster(id) {
  let zerstoert = false;
  return {
    webContents: { id },
    isDestroyed: () => zerstoert,
    zerstoere: () => {
      zerstoert = true;
    },
    isFullScreen: () => false,
    isMaximized: () => false,
    isMinimized: () => false,
    getBounds: () => ({ x: 10 * id, y: 10, width: 800, height: 600 }),
    getNormalBounds: () => ({ x: 10 * id, y: 10, width: 800, height: 600 }),
  };
}

// Zwei logische Applikationen mit je einem Fenster, wie Regal und Buch im
// Prüffall der Mehr-Fenster-Sitzung; `nurEines` lässt die zweite weg.
function aufbau({ nurEines = false } = {}) {
  const windows = new Map([[1, fenster(1)]]);
  const apps = new Map([[101, [1]]]);
  if (!nurEines) {
    windows.set(2, fenster(2));
    apps.set(102, [2]);
  }
  const appRegistry = {
    appIds: () => [...apps.keys()],
    windowsOf: (appId) => apps.get(appId) || [],
    getArea: () => null,
    getWorkspace: () => null,
    getAppKey: () => null,
  };
  const geschrieben = [];
  const store = { set: (wert) => geschrieben.push(JSON.parse(JSON.stringify(wert))) };
  const p = createWindowPersistence({
    appRegistry,
    getStore: () => store,
    windows: () => windows,
    activeBooks: () => new Map(),
    activeShelves: () => new Map(),
    workspacesState: () => [],
  });
  p.lastReportedPanes.set(1, [{ tabs: ['Regal'] }]);
  if (!nurEines) p.lastReportedPanes.set(2, [{ tabs: ['Kapitel 1.md'] }]);

  let beendet = false;
  // 'before-quit' in main.js: Merker setzen, alle Fenster sichern.
  const beginneBeenden = () => {
    beendet = true;
    if (windows.size > 0) p.persistAllWindows();
  };
  // window:cancelClose: Merker zurück, die Fenster-Verwaltung hebt die Sperre auf.
  const brichBeendenAb = () => {
    beendet = false;
    p.setzeBeendenSperre(false);
  };
  const entferne = (id) => {
    windows.get(id).zerstoere();
    windows.delete(id);
    for (const [appId, liste] of apps) {
      const rest = liste.filter((w) => w !== id);
      if (rest.length === 0) apps.delete(appId);
      else apps.set(appId, rest);
    }
    p.lastReportedPanes.delete(id);
  };
  // Schließ-Pfad eines Fensters wie in window-manager.js: 'close' verwirft den
  // eigenen Timer und sichert (außerhalb des Beendens immer, beim Beenden über
  // die letzte vollständige Sicherung mit Sperre); 'closed' sperrt beim
  // Beenden ebenfalls und nimmt das Fenster aus Liste und Registry.
  const schliesse = (id) => {
    p.clearSaveBoundsTimer(id);
    if (!beendet) p.persistAllWindows();
    else p.sichereUndSperreBeimBeenden();
    if (beendet) p.setzeBeendenSperre(true);
    entferne(id);
  };
  // Ein Fenster verschwindet ohne 'close' (Schließ-Rückfall): nur 'closed'.
  const zerstoereOhneClose = (id) => {
    if (beendet) p.setzeBeendenSperre(true);
    entferne(id);
  };
  return { windows, geschrieben, p, schliesse, zerstoereOhneClose, beginneBeenden, brichBeendenAb };
}

const fensterImStand = (stand) => stand.apps.reduce((n, a) => n + a.windows.length, 0);
const letzter = (a) => a.geschrieben[a.geschrieben.length - 1];

describe('Sitzungs-Sicherung beim Beenden (4T-002788)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AK1: ein ausstehender Timer überschreibt den vollständigen Stand nicht, wenn das erste Fenster vor ihm schließt', () => {
    const a = aufbau();
    // Das zweite Fenster hat eben seine Reiter gemeldet (window:reportPanes).
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    a.beginneBeenden();
    a.schliesse(1);
    const nachErstemSchliessen = a.geschrieben.length;
    vi.advanceTimersByTime(1000); // der Timer des zweiten Fensters wäre jetzt fällig
    a.schliesse(2);
    vi.advanceTimersByTime(1000);
    expect(a.geschrieben).toHaveLength(nachErstemSchliessen);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('AK1: eine Meldung der Reiter nach dem ersten geschlossenen Fenster stößt keine Sicherung an', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1);
    const vorher = a.geschrieben.length;
    // Das zweite Fenster holt für seine Rückfrage einen Reiter nach vorn.
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    vi.advanceTimersByTime(1000);
    expect(a.geschrieben).toHaveLength(vorher);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('AK1: auch ein direkter Aufruf der Sicherung schreibt nach dem ersten geschlossenen Fenster nichts', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1);
    const vorher = a.geschrieben.length;
    a.p.persistAllWindows();
    expect(a.geschrieben).toHaveLength(vorher);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('AK1: eine Sicherung nach dem Schließen aller Fenster schreibt keine leere Liste über den Stand', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1);
    a.schliesse(2);
    const vorher = a.geschrieben.length;
    // Der Halt am Beenden-Punkt hält den Prozess nach dem letzten Fenster noch
    // bis zu zwei Sekunden am Leben. Ein Aufrufer der Sicherung in dieser Zeit
    // fände kein Fenster mehr und schriebe ohne die Sperre eine leere Liste.
    a.p.persistAllWindows();
    vi.advanceTimersByTime(1000);
    expect(a.geschrieben).toHaveLength(vorher);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('AK1: verschwindet das erste Fenster ohne den Weg über close, bleibt der Stand von before-quit der letzte', () => {
    const a = aufbau();
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    a.beginneBeenden();
    expect(a.geschrieben).toHaveLength(1);
    a.zerstoereOhneClose(1);
    vi.advanceTimersByTime(1000);
    a.schliesse(2);
    expect(a.geschrieben).toHaveLength(1);
    expect(fensterImStand(a.geschrieben[0])).toBe(2);
  });

  it('solange beim Beenden noch alle Fenster offen sind, darf die verzögerte Sicherung schreiben', () => {
    const a = aufbau();
    a.beginneBeenden();
    // Rückfrage im zweiten Fenster, noch kein Fenster geschlossen.
    a.p.lastReportedPanes.set(2, [{ tabs: ['Kapitel 1.md', 'Neu gespeichert.md'] }]);
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    vi.advanceTimersByTime(500);
    expect(a.geschrieben).toHaveLength(2);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('das erste schließende Fenster sichert den Stand ein letztes Mal, samt dem, was seit before-quit gemeldet wurde', () => {
    const a = aufbau({ nurEines: true });
    a.beginneBeenden();
    // In der Rückfrage beim Beenden unter neuem Namen gespeichert.
    a.p.lastReportedPanes.set(1, [{ tabs: ['Neu gespeichert.md'] }]);
    a.schliesse(1);
    expect(a.geschrieben).toHaveLength(2);
    expect(letzter(a).apps[0].windows[0].panes).toEqual([{ tabs: ['Neu gespeichert.md'] }]);
  });

  it('Grenze: was das zweite Fenster meldet, nachdem das erste geschlossen ist, kommt nicht mehr in die Sitzung, sein Fenster bleibt aber erhalten', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1);
    // In der Rückfrage des zweiten Fensters unter neuem Namen gespeichert.
    a.p.lastReportedPanes.set(2, [{ tabs: ['Neu gespeichert.md'] }]);
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    vi.advanceTimersByTime(1000);
    a.schliesse(2);
    expect(fensterImStand(letzter(a))).toBe(2);
    const reiter = letzter(a).apps.flatMap((app) => app.windows.flatMap((w) => w.panes));
    expect(reiter).toContainEqual({ tabs: ['Kapitel 1.md'] });
    expect(reiter).not.toContainEqual({ tabs: ['Neu gespeichert.md'] });
  });

  it('nur das erste schließende Fenster sichert; das zweite schreibt nichts mehr', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1);
    expect(a.geschrieben).toHaveLength(2);
    a.schliesse(2);
    expect(a.geschrieben).toHaveLength(2);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('AK2: außerhalb des Beendens sichert die verzögerte Sicherung nach 500 ms wie bisher', () => {
    const a = aufbau();
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    vi.advanceTimersByTime(499);
    expect(a.geschrieben).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(a.geschrieben).toHaveLength(1);
    expect(fensterImStand(a.geschrieben[0])).toBe(2);
  });

  it('AK2: das Schließen eines Fensters außerhalb des Beendens sichert wie bisher und sperrt nichts', () => {
    const a = aufbau();
    a.schliesse(1); // 'close' sichert mit beiden Fenstern
    expect(a.geschrieben).toHaveLength(1);
    expect(fensterImStand(a.geschrieben[0])).toBe(2);
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    vi.advanceTimersByTime(500);
    expect(a.geschrieben).toHaveLength(2);
    expect(fensterImStand(letzter(a))).toBe(1);
  });

  it('AK3: bricht der Anwender das Beenden ab, fällt die Sperre, und der Stand zeigt die noch offenen Fenster', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1); // nicht geändertes Fenster hat sich schon geschlossen
    const vorher = a.geschrieben.length;
    a.brichBeendenAb();
    expect(a.geschrieben).toHaveLength(vorher + 1);
    expect(fensterImStand(letzter(a))).toBe(1);
    // Danach arbeitet die verzögerte Sicherung wieder.
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    vi.advanceTimersByTime(500);
    expect(a.geschrieben).toHaveLength(vorher + 2);
  });

  it('AK3: ein Abbruch, bevor ein Fenster geschlossen hat, sichert nicht zusätzlich', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.brichBeendenAb();
    expect(a.geschrieben).toHaveLength(1);
    expect(fensterImStand(a.geschrieben[0])).toBe(2);
  });

  it('AK3: das Aufheben ohne lebendes Fenster schreibt keine leere Liste', () => {
    const a = aufbau();
    a.beginneBeenden();
    a.schliesse(1);
    a.schliesse(2);
    const vorher = a.geschrieben.length;
    a.p.setzeBeendenSperre(false);
    expect(a.geschrieben).toHaveLength(vorher);
    expect(fensterImStand(letzter(a))).toBe(2);
  });

  it('AK3: ein Abbruch ohne vorheriges Beenden sichert nicht zusätzlich', () => {
    // window:cancelClose fällt auch beim Abbruch eines einzelnen Schließens.
    const a = aufbau();
    a.p.setzeBeendenSperre(false);
    expect(a.geschrieben).toHaveLength(0);
  });

  it('das Setzen der Sperre verwirft alle ausstehenden Timer, nicht nur den eines Fensters', () => {
    const a = aufbau();
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(1));
    a.p.scheduleSaveBoundsAndPersist(a.windows.get(2));
    a.p.setzeBeendenSperre(true);
    // Aufheben ohne Fenster-Änderung: genau eine Sicherung aus dem Aufheben,
    // keine weitere aus einem übrig gebliebenen Timer.
    a.p.setzeBeendenSperre(false);
    vi.advanceTimersByTime(1000);
    expect(a.geschrieben).toHaveLength(1);
  });
});

describe('Verdrahtung der Sperre (4T-002788), am Quelltext', () => {
  const manager = quelle('src', 'main', 'window-manager.js');

  it('der Schließ-Pfad sichert außerhalb des Beendens und ruft beim Beenden die letzte Sicherung mit Sperre', () => {
    const anfang = manager.indexOf("win.on('close', (e) => {");
    expect(anfang).toBeGreaterThan(-1);
    const block = manager.slice(anfang, manager.indexOf("win.on('closed'", anfang));
    expect(block).toContain('clearSaveBoundsTimer(id);');
    expect(block).toContain('if (!isQuitting) persistAllWindows();');
    expect(block).toContain('else sichereUndSperreBeimBeenden();');
  });

  it('der closed-Pfad sperrt beim Beenden, bevor er das Fenster aus der Liste nimmt', () => {
    const anfang = manager.indexOf("win.on('closed'");
    expect(anfang).toBeGreaterThan(-1);
    const block = manager.slice(anfang, manager.indexOf('removeWindow(id)', anfang));
    const sperre = block.indexOf('if (isQuitting) setzeBeendenSperre(true);');
    expect(sperre).toBeGreaterThan(-1);
    expect(block.indexOf('windows.delete(id);')).toBeGreaterThan(sperre);
  });

  it('das Zurücknehmen des Beenden-Merkers hebt die Sperre auf', () => {
    const anfang = manager.indexOf('function setQuitting(value)');
    expect(anfang).toBeGreaterThan(-1);
    const block = manager.slice(anfang, manager.indexOf('\n  }', anfang));
    expect(block).toContain('isQuitting = !!value;');
    expect(block).toContain('if (!isQuitting) setzeBeendenSperre(false);');
  });

  it('die Verdrahtung reicht Sperre und letzte Sicherung an die Fenster-Verwaltung', () => {
    const text = quelle('src', 'main', 'app', 'wiring.js');
    const anfang = text.indexOf('createWindowManager({');
    expect(anfang).toBeGreaterThan(-1);
    const block = text.slice(anfang, text.indexOf('});', anfang));
    expect(block).toContain('setzeBeendenSperre,');
    expect(block).toContain('sichereUndSperreBeimBeenden,');
  });

  it('window:cancelClose nimmt den Beenden-Merker zurück', () => {
    const text = quelle('src', 'main', 'ipc', 'windows.js');
    const anfang = text.indexOf("handle('window:cancelClose'");
    expect(anfang).toBeGreaterThan(-1);
    const block = text.slice(anfang, text.indexOf('});', anfang));
    expect(block).toContain('setQuitting(false);');
  });
});
