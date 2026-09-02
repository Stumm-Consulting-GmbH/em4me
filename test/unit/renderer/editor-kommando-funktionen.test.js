// @vitest-environment jsdom
// 4T-000900 (Epic 3E-000016), Register-Paar 7: Vollstaendigkeits-Waechter ueber
// EDITOR_COMMAND_FUNCTIONS in src/renderer/modules/editor/editor-keymaps.js
// (4T-001002, Epic 3E-000196: die Tabelle zog mit dem Keymap-Auszug aus editor.js
// dorthin um).
//
// Die Registry markiert 45 Kommandos als editorScoped; ausgefuehrt werden sie
// ausschliesslich ueber diese Tabelle. Fehlt dort ein Eintrag, faellt das an
// zwei Stellen still aus: buildEditorCommandKeymap ueberspringt das Kommando
// (`if (!run) continue;`), das Kuerzel bleibt also wirkungslos, und die
// Kommando-Palette blendet es aus (`if (cmd.editorScoped && !…) continue;`).
// Weder ein Gate noch die Oberflaeche zeigt etwas an — dieselbe Fehlerklasse,
// die der Dispatcher-Waechter fuer die uebrigen Kommandos abdeckt und die
// dort ausdruecklich ausgenommen sind.
//
// Geprueft wird gegen das IMPORTIERTE Modul, nicht gegen den Quelltext. Das
// ist hier nicht Geschmackssache, sondern notwendig: Die Tabelle setzt sich
// aus literalen Schluesseln, zwei Spreads (FORMAT_COMMANDS,
// TABLE_COMMAND_FUNCTIONS) und einer per Object.fromEntries erzeugten Menge
// zusammen. Ein Quelltext-Scan sieht davon nur die literalen Schluessel und
// meldete bei der Erhebung am 2026-08-07 erst 7, dann 33 statt 45 Eintraege —
// er haette also reihenweise Fehlalarme erzeugt. Anders als bei app-init.js
// ist der Editor-Zweig im Unit-Kontext ladbar (Muster:
// tabellen-und-wordcount.test.js).
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

const keymaps = await import('../../../src/renderer/modules/editor/editor-keymaps.js');
const { EDITOR_COMMAND_FUNCTIONS } = keymaps;

const editorKommandos = COMMANDS.filter((c) => c.editorScoped).map((c) => c.id);
const hinterlegt = Object.keys(EDITOR_COMMAND_FUNCTIONS);

describe('Editor-Kommando-Funktionen: Vollständigkeit (4T-000900)', () => {
  it('jedes editorScoped-Kommando hat eine hinterlegte Funktion', () => {
    // Untere Schranke gegen ein stilles Leerlaufen beider Mengen.
    expect(editorKommandos.length).toBeGreaterThan(40);
    expect(hinterlegt.length).toBeGreaterThan(40);
    const ohne = editorKommandos.filter((id) => typeof EDITOR_COMMAND_FUNCTIONS[id] !== 'function');
    expect(
      ohne,
      `editorScoped ohne Funktion (Kürzel wirkungslos, fehlt in der Palette): ${ohne.join(', ')}`,
    ).toEqual([]);
  });

  it('jede hinterlegte Funktion gehört zu einem editorScoped-Kommando', () => {
    // Gegenrichtung: Ein Eintrag ohne Registry-Kommando ist toter Code — er
    // ist über kein Kürzel und über keine Palette erreichbar.
    const verwaist = hinterlegt.filter((id) => !editorKommandos.includes(id));
    expect(verwaist, `Funktion ohne Registry-Kommando: ${verwaist.join(', ')}`).toEqual([]);
  });
});
