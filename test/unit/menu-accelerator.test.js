// 4T-0900 (Epic 3E-0016), Register-Paar 8: Waechter ueber die
// Accelerator-Anzeige der Menue-Eintraege.
//
// Die Registry markiert ein Kommando mit `menu: true`, wenn es einen
// Menue-Eintrag hat und dort sein belegtes Kuerzel anzeigt. Der Menue-Aufbau
// holt das Kuerzel ueber `acc('<id>')`; fehlt der Aufruf, bleibt der Eintrag
// ohne Kuerzel-Anzeige. Das faellt nicht auf, weil das Kuerzel selbst weiter
// wirkt — die Tasten laufen ueber den Dispatcher, nicht ueber das Menue.
// Genau diese Lage hatte Befund L-06 (4T-0890) fuer sieben Umschalter.
//
// Geprueft wird gegen den QUELLTEXT: menu.js ist Hauptprozess-Code und laedt
// Electron, ist im Unit-Kontext also nicht importierbar. Die acc-Aufrufe sind
// literal und damit stabil auslesbar; die eine dynamische Stelle
// (`acc(meta.commandId)` im Panel-Untermenue) wird nicht handgepflegt
// ausgenommen, sondern aus dem Panel-Zugangs-Modell abgeleitet — sonst waere
// die Ausnahme selbst wieder ein Register, das veralten kann.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../src/shared/commands.js';
import { DEFAULT_PANEL_TOGGLE_ORDER, PANEL_ACCESS } from '../../src/shared/panel-access.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const menuQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/menu.js'), 'utf8');

const literaleAccZiele = [
  ...new Set([...menuQuelle.matchAll(/acc\('([\w.]+)'\)/g)].map((m) => m[1])),
];
const menuKommandos = COMMANDS.filter((c) => c.menu).map((c) => c.id);
const alleIds = new Set(COMMANDS.map((c) => c.id));

// Die Umschalter der Sidebar-Panels bekommen ihren Accelerator in einer
// Schleife ueber das Zugangs-Modell, nicht als literaler Aufruf.
const ueberPanelSchleife = new Set(
  DEFAULT_PANEL_TOGGLE_ORDER.map((id) => PANEL_ACCESS.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p.commandId)
    .filter(Boolean),
);

describe('Menü-Accelerator: Registry und Menü-Aufbau (4T-0900)', () => {
  it('jedes Menü-Kommando bekommt seinen Accelerator', () => {
    // Untere Schranken gegen ein stilles Leerlaufen der Auswertungen.
    expect(menuKommandos.length).toBeGreaterThan(50);
    expect(literaleAccZiele.length).toBeGreaterThan(40);
    expect(ueberPanelSchleife.size).toBeGreaterThan(10);

    const ohne = menuKommandos.filter(
      (id) => !literaleAccZiele.includes(id) && !ueberPanelSchleife.has(id),
    );
    expect(
      ohne,
      `menu:true ohne Accelerator-Aufruf (Kürzel bliebe unsichtbar): ${ohne.join(', ')}`,
    ).toEqual([]);
  });

  it('jeder Accelerator-Aufruf nennt ein Menü-Kommando der Registry', () => {
    // Gegenrichtung, fängt vor allem Tippfehler und übrig gebliebene Aufrufe
    // nach einer Umbenennung: Der Aufruf liefert dann still undefined.
    const unbekannt = literaleAccZiele.filter((id) => !alleIds.has(id));
    expect(unbekannt, `acc() auf unbekanntes Kommando: ${unbekannt.join(', ')}`).toEqual([]);

    const ohneFlag = literaleAccZiele.filter((id) => !menuKommandos.includes(id));
    expect(ohneFlag, `acc() auf Kommando ohne menu:true: ${ohneFlag.join(', ')}`).toEqual([]);
  });
});
