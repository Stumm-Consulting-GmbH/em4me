// @vitest-environment jsdom
// 4T-001806 (Epic 3E-000292): Der Weg des Einlesens im Anzeige-Prozess.
//
// Geprüft wird die Naht, die dieser Task einzieht, und nur sie: dass jedes
// entstandene Dokument geöffnet wird und danach die Canvas-Ansicht zeigt
// (AK4), dass am Ende **eine** Meldung über alle gewählten Dateien steht
// (AK11), dass der Abbruch im Öffnen-Dialog stumm bleibt und ein
// weggebrochener Kanal es nicht tut, und dass Befehl, Erweiterung, Menü-Kanal,
// Brücke und Dispatcher denselben Weg rufen (AK1, AK13).
//
// Das Lesen, Übersetzen und Anlegen steht nicht hier: Es läuft vollständig im
// Hauptprozess und ist in canvas-austausch-einlesen.test.js an 18 Fällen
// abgesichert. `openInPane` und `setViewMode` sind ersetzt, weil beide eine
// aufgebaute Oberfläche samt Editor bräuchten; gemessen wird, dass sie in der
// richtigen Reihenfolge und mit den richtigen Werten gerufen werden.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const spur = [];
vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  openInPane: async (paneIdx, pfade) => {
    spur.push({ was: 'oeffnen', paneIdx, pfade });
  },
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  setViewMode: (modus) => spur.push({ was: 'ansicht', modus }),
  showStatusbarHint: (schluessel) => spur.push({ was: 'hinweis', schluessel }),
}));

const { importJsonCanvasFiles } =
  await import('../../../src/renderer/modules/views/canvas-import.js');

let antwort;
let gemeldet;

beforeEach(() => {
  spur.length = 0;
  gemeldet = [];
  antwort = {
    ok: true,
    ergebnisse: [
      {
        name: 'Plan.canvas',
        pfad: 'C:\\Bereich\\Plan.md',
        zahlen: { karten: 3, gruppen: 1, verbindungen: 1 },
        verluste: [{ schluessel: 'kartenfarbeEntfallen', anzahl: 1 }],
      },
    ],
  };
  window.api.importJsonCanvas = async () => antwort;
  window.api.showCanvasExchangeReport = async (bericht) => {
    gemeldet.push(bericht);
    return true;
  };
});

describe('Einlesen einer JSON-Canvas-Datei (4T-001806)', () => {
  it('öffnet das neue Dokument und schaltet es in die Canvas-Ansicht (AK4)', async () => {
    expect(await importJsonCanvasFiles()).toBe(true);
    expect(spur).toEqual([
      { was: 'oeffnen', paneIdx: 0, pfade: ['C:\\Bereich\\Plan.md'] },
      { was: 'ansicht', modus: 'canvas' },
    ]);
  });

  it('öffnet bei mehreren Dateien jede einzeln und schaltet jede um', async () => {
    antwort.ergebnisse = [
      { name: 'Eins.canvas', pfad: 'C:\\B\\Eins.md', zahlen: { karten: 1 }, verluste: [] },
      { name: 'Zwei.canvas', pfad: 'C:\\B\\Zwei.md', zahlen: { karten: 2 }, verluste: [] },
    ];
    await importJsonCanvasFiles();
    // Je Dokument erst öffnen, dann umschalten: setViewMode wirkt auf den
    // aktiven Reiter, und so zeigt jedes neue Dokument die Fläche.
    expect(spur.map((e) => e.was)).toEqual(['oeffnen', 'ansicht', 'oeffnen', 'ansicht']);
    expect(spur[0].pfade).toEqual(['C:\\B\\Eins.md']);
    expect(spur[2].pfade).toEqual(['C:\\B\\Zwei.md']);
  });

  it('meldet einmal über alle gewählten Dateien, mit Richtung und Abschnitten (AK11)', async () => {
    antwort.ergebnisse = [antwort.ergebnisse[0], { name: 'Kaputt.canvas', fehler: 'keinJson' }];
    await importJsonCanvasFiles();
    expect(gemeldet).toHaveLength(1);
    expect(gemeldet[0].richtung).toBe('import');
    expect(gemeldet[0].dateien).toEqual([
      {
        name: 'Plan.canvas',
        zahlen: { karten: 3, gruppen: 1, verbindungen: 1 },
        verluste: [{ schluessel: 'kartenfarbeEntfallen', anzahl: 1 }],
        fehler: null,
      },
      { name: 'Kaputt.canvas', zahlen: null, verluste: [], fehler: 'keinJson' },
    ]);
  });

  it('öffnet nichts für eine gescheiterte Datei, meldet sie aber', async () => {
    antwort.ergebnisse = [{ name: 'Kaputt.canvas', fehler: 'keineListen' }];
    expect(await importJsonCanvasFiles()).toBe(false);
    expect(spur).toEqual([]);
    expect(gemeldet).toHaveLength(1);
  });

  it('bleibt beim Abbruch im Öffnen-Dialog stumm', async () => {
    antwort = { ok: false, canceled: true };
    expect(await importJsonCanvasFiles()).toBe(false);
    expect(spur).toEqual([]);
    expect(gemeldet).toEqual([]);
  });

  it('sagt es, wenn der Kanal wegbricht — ein stiller Fehlschlag wäre nicht zu deuten', async () => {
    window.api.importJsonCanvas = async () => {
      throw new Error('Kanal weg');
    };
    expect(await importJsonCanvasFiles()).toBe(false);
    expect(spur).toEqual([{ was: 'hinweis', schluessel: 'canvas.austausch.importFehlgeschlagen' }]);
    expect(gemeldet).toEqual([]);
  });
});

describe('Verdrahtung des Befehls (AK1, AK13)', () => {
  it('steht in der Registry mit Beschriftung, Beschreibung und Bedingung', () => {
    const cmd = COMMANDS.find((c) => c.id === 'file.importJsonCanvas');
    expect(cmd).toBeTruthy();
    expect(cmd.labelKey).toBe('menu.file.importJsonCanvas');
    expect(cmd.descKey).toBe('help.shortcut.importJsonCanvas');
    expect(cmd.categoryKey).toBe('help.group.file');
    expect(cmd.menu).toBe(true);
    // Kein Vorgabe-Kürzel (Festlegung zu F2) und keine Canvas-Bedingung: Das
    // Einlesen braucht weder Reiter noch offene Fläche.
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.availability).toBe('immer');
  });

  it('hängt an der Erweiterung der Fläche (AK13)', () => {
    expect(extensionById('canvas').commands).toContain('file.importJsonCanvas');
  });

  it('steht im neuen Untermenü «Importieren», unmittelbar nach «Exportieren»', () => {
    const menue = readFileSync(path.join(wurzel, 'src/main/menu/menu.js'), 'utf8');
    expect(menue).toContain("submenuOrNull('menu.file.import', [");
    expect(menue).toContain("click: send('menu:importJsonCanvas')");
    // Der Untermenü-Punkt trägt keine eigene Freigabe-Regel; er verschwindet
    // allein mit seinem einzigen Kind (unless über die Erweiterung).
    const stelle = menue.indexOf("submenuOrNull('menu.file.import', [");
    const block = menue.slice(stelle, menue.indexOf(']),', stelle));
    expect(block).toContain("unless('file.importJsonCanvas'");
    expect(block).not.toContain('enabled: !!(state');
    // Die Reihenfolge: das Untermenü «Exportieren» steht davor.
    expect(menue.indexOf("label: t('menu.file.export'),")).toBeLessThan(stelle);
  });

  it('Menü-Kanal, Brücke und Dispatcher rufen denselben Weg', () => {
    const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:importJsonCanvas'");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.invoke('canvas:importJsonCanvas')");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuImportJsonCanvas(() => importJsonCanvasFiles())',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'file.importJsonCanvas': () => {",
    );
    // Der Kanal ist im Hauptprozess registriert und in main.js verdrahtet.
    expect(lies('src/main/ipc/canvas-import.js')).toContain("handle('canvas:importJsonCanvas'");
    expect(lies('src/main/main.js')).toContain('registerCanvasImportIpc(registriere, ipcDeps)');
  });
});
