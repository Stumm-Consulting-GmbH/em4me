// 4T-000888 (Epic 3E-000168): Unit-Tests für den Aufbau der „Zuletzt
// geöffnet"-Untermenüs (src/main/menu/menu-recent.js). Der Aufbau saß bis zum
// Auszug in menu.js und war dort nicht prüfbar, weil das Modul Electron lädt;
// als eigenes elektron-freies Modul ist er es. Vier Aufrufer teilen ihn sich
// (Dateien, Bereiche, Bücher, Bücherregale), deshalb sichert der Test die
// Eigenschaften ab, auf die sich alle vier verlassen.
import { describe, it, expect, vi } from 'vitest';
import { createRecentListBuilder } from '../../src/main/menu/menu-recent.js';

// 4T-001250 (Epic 3E-000124): Wirts-gerechter Pfad aus der gewachsenen
// Windows-Schreibweise. Die Faelle dieser Datei pruefen Fach-Logik und NICHT
// die Windows-Pfad-Syntax; mit fest verdrahteten Laufwerksbuchstaben liefen
// sie trotzdem nur unter Windows, weil path.resolve 'C:\...' auf anderen
// Plattformen als RELATIVEN Pfad liest und das Arbeitsverzeichnis davorsetzt.
//
// Der Laufwerksbuchstabe wird zum ERSTEN Pfad-Segment und nicht etwa
// weggelassen: Sonst faenden 'C:\Daten' und 'D:\Daten' auf der Zielplattform
// zusammen, und gerade die Faelle, die verschiedene Laufwerke auseinander
// halten sollen, schluegen ins Gegenteil um (belegt am 2026-08-28).
// Klein geschrieben, damit zwei Schreibweisen desselben Laufwerks dasselbe
// Segment ergeben und die Schreibweisen-Faelle weiter greifen.
//
// Unter Windows ist der Umrechner die Identitaet, die Haupt-Plattform prueft
// also unveraendert weiter.
const P = (w) =>
  process.platform === 'win32'
    ? w
    : `/${w[0].toLowerCase()}/${w.slice(3)}`.split('\\').join('/').replace(/\/+/g, '/');

// Übersetzung im Test: der Key selbst, damit die Zuordnung sichtbar bleibt.
const t = (key) => key;

describe('createRecentListBuilder (4T-000888)', () => {
  it('meldet die leere Liste mit dem übergebenen Leer-Text als inaktiven Eintrag', () => {
    // 4T-000888
    const build = createRecentListBuilder(t, {});
    expect(build([], 'menu.file.recentBooksEmpty', 'openRecentBook', 'clearRecentBooks')).toEqual([
      { label: 'menu.file.recentBooksEmpty', enabled: false },
    ]);
  });

  it('zeigt Basisnamen, unterscheidet Gleichnamige über den Eltern-Ordner', () => {
    // 4T-000888
    const build = createRecentListBuilder(t, {});
    const items = build(
      [
        P('C:\\Werke\\Reise\\Reise.md'),
        P('C:\\Archiv\\Reise\\Reise.md'),
        P('C:\\Werke\\Antike.md'),
      ],
      'leer',
      'open',
      'clear',
    );
    // Die drei Pfad-Einträge; danach folgen Trenner und „Liste löschen".
    expect(items.slice(0, 3).map((i) => i.label)).toEqual([
      'Reise.md (Reise)',
      'Reise.md (Reise)',
      'Antike.md',
    ]);
    // Der volle Pfad bleibt am Eintrag (toolTip, macOS) erhalten.
    expect(items[0].toolTip).toBe(P('C:\\Werke\\Reise\\Reise.md'));
  });

  it('escapt & im Anzeige-Label (Windows läse es sonst als Mnemonic)', () => {
    // 4T-000888
    const build = createRecentListBuilder(t, {});
    const [eintrag] = build([P('C:\\Werke\\Hund & Katz')], 'leer', 'open', 'clear');
    expect(eintrag.label).toBe('Hund && Katz');
    expect(eintrag.toolTip).toBe(P('C:\\Werke\\Hund & Katz'));
  });

  it('ruft die benannten Aktionen: Eintrag mit vollem Pfad, Löschen ohne Argument', () => {
    // 4T-000888
    const actions = { openRecentShelf: vi.fn(), clearRecentShelves: vi.fn() };
    const build = createRecentListBuilder(t, actions);
    const items = build(
      [P('C:\\Regale\\Bibliothek')],
      'leer',
      'openRecentShelf',
      'clearRecentShelves',
    );
    expect(items).toHaveLength(3); // Eintrag, Trenner, „Liste löschen"
    expect(items[1]).toEqual({ type: 'separator' });
    expect(items[2].label).toBe('menu.file.recentClear');
    items[0].click();
    items[2].click();
    expect(actions.openRecentShelf).toHaveBeenCalledWith(P('C:\\Regale\\Bibliothek'));
    expect(actions.clearRecentShelves).toHaveBeenCalledWith();
  });

  it('bleibt bei fehlender Aktion stumm statt zu werfen', () => {
    // 4T-000888
    const build = createRecentListBuilder(t, null);
    const items = build([P('C:\\Werke\\Antike.md')], 'leer', 'openRecent', 'clearRecent');
    expect(() => {
      items[0].click();
      items[2].click();
    }).not.toThrow();
  });
});
