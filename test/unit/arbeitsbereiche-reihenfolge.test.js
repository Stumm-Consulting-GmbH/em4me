// 4T-001753 (Epic 3E-000308): Der Kanal `workspace:reorder` am ECHTEN Handler
// (src/main/ipc/windows.js), dazu die Wiederherstellung der Reihenfolge beim
// Start (src/main/app/session-schema.js).
//
// **Die tragenden Fälle sind vier**, und jeder misst eine Entscheidung, die man
// auch anders hätte treffen können:
//
//   - **Die Eingabe-Prüfung** (Sicherheit): Der Anzeige-Prozess gilt nicht als
//     wohlgeformt. Eine unbekannte Kennung und eine Richtung, die keine ist,
//     werden abgewiesen, und der Stand bleibt dabei unangetastet — gemessen am
//     Array, nicht am Rückgabewert.
//   - **Der Zuschnitt «eine Bewegung statt einer Folge»** (E12, Wahl dieses
//     Tasks): Die Zusicherung «es geht kein Arbeitsbereich verloren» ist
//     Bauart, nicht Prüfung. Der Fall hält fest, dass die Menge der Kennungen
//     bei jeder Bewegung dieselbe bleibt.
//   - **Die Ränder**: «nach oben» am ersten und «nach unten» am letzten
//     Eintrag ändern nichts und schreiben nichts — kein `persistAllWindows`,
//     kein Broadcast. Ein Fall, der nur den Rückgabewert prüfte, wäre auch bei
//     einem überflüssigen Schreibvorgang grün.
//   - **Keine zweite Ordnungs-Angabe**: Der Eintrag bekommt kein Sortier-Feld;
//     die Reihenfolge des Arrays ist die einzige Quelle, und
//     `normalizeSavedWorkspaces` baut sie beim Start unverändert wieder auf.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { normalizeSavedWorkspaces } from '../../src/main/app/session-schema.js';

const require = createRequire(import.meta.url);
const { registerWindowsIpc } = require('../../src/main/ipc/windows.js');

// Der echte Handler mit genau den Abhängigkeiten, die `workspace:reorder`
// benutzt. Die beiden Wirkungs-Wege sind Spione, weil die Zusicherung «sofort
// gespeichert» und «Menü baut sich neu» gerade an ihrem Aufruf hängt.
function aufbau(namen) {
  const workspacesState = namen.map((name) => ({
    id: `id-${name}`,
    name,
    color: 'green',
    lastOpenedAt: null,
    app: { area: null, windows: [] },
  }));
  const persistAllWindows = vi.fn();
  const workspacesChanged = vi.fn();
  const updateAllCaptionColors = vi.fn();
  const broadcastDisplayInfo = vi.fn();
  const handler = new Map();
  registerWindowsIpc((kanal, fn) => handler.set(kanal, fn), {
    appRegistry: { findAppByWorkspaceId: () => null },
    workspacesState,
    persistAllWindows,
    workspacesChanged,
    updateAllCaptionColors,
    broadcastDisplayInfo,
  });
  return {
    reorder: handler.get('workspace:reorder'),
    list: handler.get('workspace:list'),
    workspacesState,
    persistAllWindows,
    workspacesChanged,
    updateAllCaptionColors,
    broadcastDisplayInfo,
    namenJetzt: () => workspacesState.map((w) => w.name),
  };
}

describe('workspace:reorder — Umordnung (4T-001753, E12)', () => {
  it('schiebt einen Eintrag aus der Mitte nach oben und speichert sofort', () => {
    // 4T-001753 (AK4): Stand aendern, persistAllWindows(), workspacesChanged()
    // — derselbe Dreischritt wie bei workspace:rename und workspace:setColor.
    const u = aufbau(['A', 'B', 'C']);
    expect(u.reorder({}, { id: 'id-B', direction: 'up' })).toEqual({ ok: true, moved: true });
    expect(u.namenJetzt()).toEqual(['B', 'A', 'C']);
    expect(u.persistAllWindows).toHaveBeenCalledTimes(1);
    expect(u.workspacesChanged).toHaveBeenCalledTimes(1);
  });

  it('schiebt einen Eintrag aus der Mitte nach unten', () => {
    // 4T-001753
    const u = aufbau(['A', 'B', 'C']);
    expect(u.reorder({}, { id: 'id-B', direction: 'down' })).toEqual({ ok: true, moved: true });
    expect(u.namenJetzt()).toEqual(['A', 'C', 'B']);
  });

  it('faerbt nichts um und meldet keine Anzeige-Infos', () => {
    // 4T-001753: Weder Farbe noch Name aendern sich, also laufen die beiden
    // Nachbar-Wege der uebrigen Aenderungs-Kanaele hier NICHT mit. Ein
    // ueberfluessiger Aufruf faerbte alle Fenster bei jeder Verschiebung neu.
    const u = aufbau(['A', 'B']);
    u.reorder({}, { id: 'id-B', direction: 'up' });
    expect(u.updateAllCaptionColors).not.toHaveBeenCalled();
    expect(u.broadcastDisplayInfo).not.toHaveBeenCalled();
  });

  it('verliert bei jeder Bewegung keinen Eintrag und verdoppelt keinen', () => {
    // 4T-001753 (AK8): Die Zusicherung ist Bauart und nicht Pruefung — eine
    // Bewegung um eine Position kann per Konstruktion nichts unterschlagen.
    const u = aufbau(['A', 'B', 'C', 'D']);
    const menge = () => [...u.workspacesState.map((w) => w.id)].sort();
    const vorher = menge();
    for (const [id, direction] of [
      ['id-D', 'up'],
      ['id-A', 'down'],
      ['id-C', 'up'],
      ['id-B', 'down'],
    ]) {
      u.reorder({}, { id, direction });
      expect(menge()).toEqual(vorher);
      expect(u.workspacesState).toHaveLength(4);
    }
  });
});

describe('workspace:reorder — Raender (4T-001753, AK3)', () => {
  it('laesst "nach oben" am ersten Eintrag den Stand unberuehrt und schreibt nicht', () => {
    // 4T-001753: Kein Fehler, sondern die Randlage — der Dialog blendet die
    // sinnlose Richtung ab, und ein Aufruf ueber die Bruecke soll deswegen
    // nicht scheitern. Aber er darf auch nicht speichern.
    const u = aufbau(['A', 'B', 'C']);
    expect(u.reorder({}, { id: 'id-A', direction: 'up' })).toEqual({ ok: true, moved: false });
    expect(u.namenJetzt()).toEqual(['A', 'B', 'C']);
    expect(u.persistAllWindows).not.toHaveBeenCalled();
    expect(u.workspacesChanged).not.toHaveBeenCalled();
  });

  it('laesst "nach unten" am letzten Eintrag den Stand unberuehrt', () => {
    // 4T-001753
    const u = aufbau(['A', 'B', 'C']);
    expect(u.reorder({}, { id: 'id-C', direction: 'down' })).toEqual({ ok: true, moved: false });
    expect(u.namenJetzt()).toEqual(['A', 'B', 'C']);
    expect(u.persistAllWindows).not.toHaveBeenCalled();
  });

  it('bleibt beim einzigen Eintrag in beiden Richtungen stumm', () => {
    // 4T-001753: Beide Richtungen sind hier Rand.
    const u = aufbau(['A']);
    expect(u.reorder({}, { id: 'id-A', direction: 'up' })).toEqual({ ok: true, moved: false });
    expect(u.reorder({}, { id: 'id-A', direction: 'down' })).toEqual({ ok: true, moved: false });
    expect(u.namenJetzt()).toEqual(['A']);
    expect(u.persistAllWindows).not.toHaveBeenCalled();
  });
});

describe('workspace:reorder — Eingabe-Pruefung im Hauptprozess (4T-001753)', () => {
  it('weist eine unbekannte Kennung ab, ohne den Stand anzutasten', () => {
    // 4T-001753 (AK8): Der Anzeige-Prozess gilt nicht als wohlgeformt.
    const u = aufbau(['A', 'B']);
    expect(u.reorder({}, { id: 'id-Z', direction: 'up' })).toEqual({
      ok: false,
      error: 'unknown workspace',
    });
    expect(u.namenJetzt()).toEqual(['A', 'B']);
    expect(u.persistAllWindows).not.toHaveBeenCalled();
  });

  it('weist eine Richtung ab, die keine ist', () => {
    // 4T-001753: Nur die beiden bekannten Woerter gelten; alles andere ist
    // keine Bewegung und wird nicht geraten.
    const u = aufbau(['A', 'B']);
    for (const richtung of [undefined, null, '', 'oben', 'UP', 0, 1, {}]) {
      expect(u.reorder({}, { id: 'id-A', direction: richtung })).toEqual({
        ok: false,
        error: 'invalid direction',
      });
    }
    expect(u.namenJetzt()).toEqual(['A', 'B']);
    expect(u.persistAllWindows).not.toHaveBeenCalled();
  });

  it('weist einen fehlenden oder falsch geformten Parameter-Satz ab', () => {
    // 4T-001753: Die Kennungs-Pruefung greift vor der Richtungs-Pruefung,
    // deshalb meldet der leere Aufruf die unbekannte Kennung.
    const u = aufbau(['A', 'B']);
    for (const params of [undefined, null, {}, { direction: 'up' }, { id: 42, direction: 'up' }]) {
      expect(u.reorder({}, params)).toEqual({ ok: false, error: 'unknown workspace' });
    }
    expect(u.namenJetzt()).toEqual(['A', 'B']);
  });
});

describe('Die Reihenfolge der Ablage ist die einzige Ordnung (4T-001753, AK7)', () => {
  it('workspace:list bildet den umgeordneten Stand unveraendert ab', () => {
    // 4T-001753 (AK5): Untermenue und Dialog lesen denselben Stand; ein
    // zweiter Ordnungs-Begriff im Kanal wuerde sie auseinanderlaufen lassen.
    const u = aufbau(['A', 'B', 'C']);
    u.reorder({}, { id: 'id-C', direction: 'up' });
    expect(u.list().map((w) => w.name)).toEqual(['A', 'C', 'B']);
  });

  it('der Eintrag bekommt kein Sortier-Feld', () => {
    // 4T-001753 (AK7): Die Umordnung aendert die POSITION, nicht den Eintrag.
    // Ein zusaetzliches Feld waere die zweite Quelle, die E12 ausschliesst.
    const u = aufbau(['A', 'B']);
    const vorherFelder = Object.keys(u.workspacesState[0]).sort();
    u.reorder({}, { id: 'id-B', direction: 'up' });
    for (const eintrag of u.workspacesState) {
      expect(Object.keys(eintrag).sort()).toEqual(vorherFelder);
    }
    expect(vorherFelder).not.toContain('order');
    expect(vorherFelder).not.toContain('sortIndex');
  });

  it('normalizeSavedWorkspaces stellt die abgelegte Reihenfolge beim Start wieder her', () => {
    // 4T-001753 (AK6): Die Dauerhaftigkeit haengt an dieser einen Stelle —
    // sie darf nicht sortieren, sondern nur filtern.
    const abgelegt = ['C', 'A', 'B'].map((name) => ({
      id: `id-${name}`,
      name,
      color: 'green',
      open: false,
      lastOpenedAt: null,
      app: { area: null, windows: [] },
    }));
    expect(normalizeSavedWorkspaces(abgelegt).map((w) => w.name)).toEqual(['C', 'A', 'B']);
  });

  it('haelt die Reihenfolge auch dort, wo ein Eintrag als unbrauchbar entfaellt', () => {
    // 4T-001753: Ein weggefilterter Eintrag darf die uebrigen nicht umstellen.
    const abgelegt = [
      { id: 'id-C', name: 'C', color: 'green', app: { windows: [] } },
      { id: '', name: 'Kaputt', color: 'green', app: { windows: [] } },
      { id: 'id-A', name: 'A', color: 'green', app: { windows: [] } },
    ];
    expect(normalizeSavedWorkspaces(abgelegt).map((w) => w.name)).toEqual(['C', 'A']);
  });
});
