// 4T-001737 (Epic 3E-000308): Die Bereichs-Zuordnung eines Arbeitsbereichs an
// ihren beiden Quellen — der Label-Bildung des Untermenues
// (src/main/menu/menu-workspaces.js) und dem Kanal `workspace:list`
// (src/main/ipc/windows.js).
//
// **Warum an diesen beiden Stellen und nicht an der Abbildung dazwischen.**
// Die Angabe stand immer schon am Quell-Objekt der Ablage und wurde nur nie
// mitgenommen; die Lücke lag an drei Orten mit EINER Ursache. Zwei davon sind
// elektron-frei prüfbar und hier gemessen, der dritte (die Abbildung in
// menu-apply.js) lädt über menu.js Electron und ist deshalb im E2E-Fall
// WS-07 der Arbeitsbereichs-Spec gefasst, wo ohnehin das fertige Menü-Label
// zählt.
//
// **Die tragenden Fälle sind vier**, und jeder misst eine Entscheidung, die
// man auch anders hätte treffen können:
//
//   - **Ohne Bindung nur der Name** (AK3): kein Trennstrich, kein Platzhalter.
//     Ein Test allein über den gebundenen Fall wäre auch bei einem
//     hängenden Gedankenstrich grün.
//   - **Der Ordnername statt des Pfades** (E2), und zwar aus BEIDEN
//     Trenner-Schreibweisen: Eine abgelegte Bindung kann von einem anderen
//     Rechner stammen, deshalb darf die Ableitung nicht an der Plattform des
//     Lesers hängen.
//   - **Die Kappung je Bestandteil** (AK4): Der Name darf dem Ordnernamen den
//     Platz nicht nehmen. Ein gemeinsames Budget für die ganze Zeile hätte
//     bei langem Namen genau die Hälfte gezeigt, die man schon kennt.
//   - **Die Reihenfolge Kappen-vor-Maskieren**: Das kaufmännische Und wird
//     verdoppelt, weil Windows es sonst als Mnemonic liest; würde vor der
//     Kappung maskiert, könnte die Kappung ein '&&'-Paar auseinanderschneiden.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ordnerName,
  workspaceMenuLabel,
  createWorkspacesSubmenuBuilder,
  LABEL_TEIL_MAX,
} = require('../../src/main/menu/menu-workspaces.js');
const { registerWindowsIpc } = require('../../src/main/ipc/windows.js');

// Übersetzung im Test: der Schlüssel selbst, damit die Zuordnung sichtbar
// bleibt (Muster menu-recent.test.js).
const t = (key) => key;

describe('ordnerName (4T-001737)', () => {
  it('nimmt den letzten Bestandteil eines Windows-Pfades', () => {
    // 4T-001737
    expect(ordnerName('C:\\Werke\\Notizen')).toBe('Notizen');
  });

  it('nimmt den letzten Bestandteil eines POSIX-Pfades', () => {
    // 4T-001737: dieselbe Ableitung ohne Rücksicht auf die Plattform des
    // Lesers — die Ablage wandert mit dem Benutzerprofil.
    expect(ordnerName('/home/matthias/Werke/Notizen')).toBe('Notizen');
  });

  it('übergeht abschliessende Trenner beider Schreibweisen', () => {
    // 4T-001737
    expect(ordnerName('C:\\Werke\\Notizen\\')).toBe('Notizen');
    expect(ordnerName('/home/werke/notizen//')).toBe('notizen');
  });

  it('liefert den Ordnernamen auch bei gemischten Trennern', () => {
    // 4T-001737
    expect(ordnerName('C:/Werke\\Unterordner/Notizen')).toBe('Notizen');
  });

  it('liefert null, wo kein Ordnername ableitbar ist', () => {
    // 4T-001737: leer, kein String, nur Trenner — alle drei sind «keine
    // Bindung» und nicht «Bindung mit leerem Namen».
    expect(ordnerName('')).toBe(null);
    expect(ordnerName(null)).toBe(null);
    expect(ordnerName(undefined)).toBe(null);
    expect(ordnerName('/')).toBe(null);
    expect(ordnerName('\\\\')).toBe(null);
  });
});

describe('workspaceMenuLabel (4T-001737, E2)', () => {
  it('setzt Name und Ordnernamen einzeilig mit Gedankenstrich zusammen', () => {
    // 4T-001737 (AK1, AK2)
    expect(workspaceMenuLabel({ name: 'Projekt Alpha', areaPath: 'C:\\Werke\\Notizen' })).toBe(
      'Projekt Alpha — Notizen',
    );
  });

  it('nennt NUR den Ordnernamen, nicht den ganzen Pfad', () => {
    // 4T-001737 (AK2): Eine Menü-Beschriftung ist einzeilig; ein voller Pfad
    // sprengte jede brauchbare Menü-Breite.
    const label = workspaceMenuLabel({
      name: 'Alpha',
      areaPath: 'C:\\Werke\\Kunden\\2026\\Notizen',
    });
    expect(label).toBe('Alpha — Notizen');
    expect(label).not.toContain('Kunden');
  });

  it('trägt ohne Bindung allein den Namen — kein Trenner, kein Platzhalter', () => {
    // 4T-001737 (AK3)
    expect(workspaceMenuLabel({ name: 'Recherche', areaPath: null })).toBe('Recherche');
    expect(workspaceMenuLabel({ name: 'Recherche' })).toBe('Recherche');
    expect(workspaceMenuLabel({ name: 'Recherche', areaPath: '' })).toBe('Recherche');
  });

  it('kappt Name und Ordnernamen je einzeln und setzt ein Auslassungszeichen', () => {
    // 4T-001737 (AK4): Beide Bestandteile bleiben lesbar; die Kappung trifft
    // je Teil und nicht die Zeile als Ganzes.
    const langerName = 'N'.repeat(LABEL_TEIL_MAX + 25);
    const langerOrdner = 'O'.repeat(LABEL_TEIL_MAX + 25);
    const label = workspaceMenuLabel({
      name: langerName,
      areaPath: `C:\\Werke\\${langerOrdner}`,
    });
    expect(label).toBe(`${'N'.repeat(LABEL_TEIL_MAX)}… — ${'O'.repeat(LABEL_TEIL_MAX)}…`);
    // Die Gesamtlänge ist damit nach oben gedeckelt (zwei Teile, Trenner,
    // zwei Auslassungszeichen) und wächst nicht mit der Eingabe.
    expect(label.length).toBe(2 * LABEL_TEIL_MAX + 2 + ' — '.length);
  });

  it('lässt einen Namen genau an der Grenze unangetastet', () => {
    // 4T-001737 (AK4): Die Grenze ist einschliessend; ein Name von genau
    // LABEL_TEIL_MAX Zeichen bekommt KEIN Auslassungszeichen.
    const grenze = 'N'.repeat(LABEL_TEIL_MAX);
    expect(workspaceMenuLabel({ name: grenze })).toBe(grenze);
  });

  it('zerreisst bei der Kappung kein Ersatz-Paar', () => {
    // 4T-001737: Gezählt werden Code-Punkte, nicht Code-Einheiten — ein halbes
    // Ersatz-Paar erschiene im Menü als Fragezeichen-Kästchen.
    const label = workspaceMenuLabel({ name: '\u{1F4D8}'.repeat(LABEL_TEIL_MAX + 5) });
    expect(Array.from(label)).toHaveLength(LABEL_TEIL_MAX + 1); // plus Auslassung
    expect(label).not.toContain('\uFFFD');
  });

  it('verdoppelt das kaufmännische Und in beiden Bestandteilen', () => {
    // 4T-001737 (M-12, 4T-000173): Windows läse ein einzelnes '&' als
    // Mnemonic-Markierung.
    expect(workspaceMenuLabel({ name: 'Hund & Katz', areaPath: 'C:\\A & B' })).toBe(
      'Hund && Katz — A && B',
    );
  });

  it('maskiert NACH der Kappung, damit kein Paar auseinanderfällt', () => {
    // 4T-001737: Der Name endet genau an der Grenze auf '&'. Wäre vor der
    // Kappung maskiert worden, stünde am Ende ein einzelnes '&' — und das
    // verschluckte Windows samt dem folgenden Zeichen.
    const name = `${'N'.repeat(LABEL_TEIL_MAX - 1)}&${'N'.repeat(10)}`;
    const label = workspaceMenuLabel({ name });
    expect(label).toBe(`${'N'.repeat(LABEL_TEIL_MAX - 1)}&&…`);
  });
});

describe('createWorkspacesSubmenuBuilder (4T-001737)', () => {
  const ctx = (workspaces, actions = {}) =>
    createWorkspacesSubmenuBuilder({
      t,
      acc: () => undefined,
      avail: () => true,
      send: (channel) => () => channel,
      actions,
      workspaces,
      dotIcon: () => null,
    });

  it('beschriftet jeden Listen-Eintrag mit Name und Bereichs-Zuordnung', () => {
    // 4T-001737 (AK1)
    const items = ctx([
      { id: 'a', name: 'Alpha', color: 'green', open: true, areaPath: 'C:\\Werke\\Notizen' },
      { id: 'b', name: 'Beta', color: 'blue', open: false, areaPath: null },
    ])();
    expect(items.slice(0, 2).map((i) => i.label)).toEqual(['Alpha — Notizen', 'Beta']);
  });

  it('hält die vier Lebenszyklus-Aktionen hinter einem Trenner', () => {
    // 4T-001737 (AK7): Der Auszug aus der Menü-Fabrik darf an den vier
    // Aktionen nichts geändert haben — Reihenfolge, Schlüssel und Kanäle
    // stehen unverändert.
    const items = ctx([{ id: 'a', name: 'Alpha', color: 'green', open: true }])();
    expect(items).toHaveLength(6);
    expect(items[1]).toEqual({ type: 'separator' });
    expect(items.slice(2).map((i) => i.label)).toEqual([
      'menu.file.workspaceSaveAs',
      'menu.file.workspaceCreate',
      'menu.file.workspaceClose',
      'menu.file.workspaceManage',
    ]);
    expect(items.slice(2).map((i) => i.click())).toEqual([
      'menu:workspaceSaveAs',
      'menu:workspaceCreate',
      'menu:workspaceClose',
      'menu:workspaceManage',
    ]);
  });

  it('meldet die leere Liste als inaktiven Platzhalter', () => {
    // 4T-001737 (AK7)
    const items = ctx([])();
    expect(items[0]).toEqual({ label: 'menu.file.workspacesEmpty', enabled: false });
  });

  it('nimmt die Farbpunkt-Bitmap herein und ruft die Öffnen-Aktion mit der Kennung', () => {
    // 4T-001737 (AK7): Der Farbpunkt bleibt, wo er war; das Modul erzeugt ihn
    // nicht selbst, damit es electron-frei bleibt.
    const actions = { openWorkspace: vi.fn() };
    const dotIcon = vi.fn(() => ({ bitmap: true }));
    const build = createWorkspacesSubmenuBuilder({
      t,
      acc: () => undefined,
      avail: () => true,
      send: (channel) => () => channel,
      actions,
      workspaces: [{ id: 'a7', name: 'Alpha', color: 'cyan', open: true }],
      dotIcon,
    });
    const items = build();
    expect(dotIcon).toHaveBeenCalledWith('cyan', true);
    expect(items[0].icon).toEqual({ bitmap: true });
    items[0].click();
    expect(actions.openWorkspace).toHaveBeenCalledWith('a7');
  });

  it('bleibt ohne Liste und ohne Aktion stumm statt zu werfen', () => {
    // 4T-001737: defensiver Aufruf vor dem ersten Renderer-Report.
    const build = createWorkspacesSubmenuBuilder({
      t,
      acc: () => undefined,
      avail: () => true,
      send: (channel) => () => channel,
      actions: null,
      workspaces: null,
      dotIcon: null,
    });
    const items = build();
    expect(items[0]).toEqual({ label: 'menu.file.workspacesEmpty', enabled: false });
    expect(() => items[2].click()).not.toThrow();
  });
});

// --- workspace:list (E3) ------------------------------------------------------

// Der echte Handler mit genau den Abhängigkeiten, die `workspace:list`
// benutzt. Mehr hereinzugeben hiesse, einen halben Hauptprozess zu stellen;
// die übrigen Kanäle der Gruppe werden hier nicht gerufen.
function listHandler(workspacesState) {
  const handler = new Map();
  registerWindowsIpc((kanal, fn) => handler.set(kanal, fn), {
    appRegistry: { findAppByWorkspaceId: (id) => (id === 'offen' ? 7 : null) },
    workspacesState,
  });
  return handler.get('workspace:list');
}

describe('workspace:list — Bereichs-Zuordnung (4T-001737, E3)', () => {
  it('liefert areaPath je Arbeitsbereich mit dem VOLLSTAENDIGEN Pfad', () => {
    // 4T-001737 (AK5, AK6): Der Dialog hat Platz dafür und zeigt ihn ungekürzt;
    // erst die Menü-Beschriftung kürzt auf den Ordnernamen.
    const liste = listHandler([
      {
        id: 'offen',
        name: 'Alpha',
        color: 'green',
        lastOpenedAt: '2026-09-19T08:00:00Z',
        app: { area: { rootPath: 'C:\\Werke\\Kunden\\2026\\Notizen' }, windows: [] },
      },
    ])();
    expect(liste).toEqual([
      {
        id: 'offen',
        name: 'Alpha',
        color: 'green',
        open: true,
        lastOpenedAt: '2026-09-19T08:00:00Z',
        areaPath: 'C:\\Werke\\Kunden\\2026\\Notizen',
      },
    ]);
  });

  it('liefert areaPath als null, wo keine Bindung besteht', () => {
    // 4T-001737 (AK3): null heisst «keine Bindung»; die Anzeige lässt die
    // Zeile dann ganz weg statt einen Platzhalter zu setzen.
    const liste = listHandler([
      {
        id: 'b',
        name: 'Beta',
        color: 'blue',
        lastOpenedAt: null,
        app: { area: null, windows: [] },
      },
      { id: 'c', name: 'Gamma', color: 'red', lastOpenedAt: null },
    ])();
    expect(liste.map((w) => w.areaPath)).toEqual([null, null]);
  });

  it('bildet die Ablage in ihrer Reihenfolge ab, ohne zu sortieren', () => {
    // 4T-001737/4T-001753 (E12): Die Reihenfolge der Ablage IST die angezeigte.
    // Eine Sortierung hier wäre eine zweite Ordnungs-Angabe.
    const liste = listHandler([
      { id: 'z', name: 'Zulu', color: 'green', lastOpenedAt: null },
      { id: 'a', name: 'Alpha', color: 'green', lastOpenedAt: null },
      { id: 'm', name: 'Mike', color: 'green', lastOpenedAt: null },
    ])();
    expect(liste.map((w) => w.name)).toEqual(['Zulu', 'Alpha', 'Mike']);
  });
});
