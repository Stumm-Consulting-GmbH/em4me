// 4T-0781 (Epic 3E-0161): Vollstaendigkeits-Waechter ueber die Dispatcher-Map
// commandHandlers in src/renderer/modules/app/app-commands.js (bis 4T-1001 lag
// sie in app-init.js).
//
// Kommando-Palette und Tasten-Dispatcher fuehren ein Kommando ausschliesslich
// ueber diese Map aus: executeCommandById holt den Handler dort und liefert
// ohne ihn false, der Tasten-Dispatcher bricht ohne Wirkung ab. Ein
// Registry-Kommando ohne Eintrag erscheint deshalb in Palette und
// Kuerzel-Einstellung, tut dort aber nichts — genau das war bei drei
// Kommandos der Fall (graph.openArea, history.open, view.toggleBlockProps).
//
// Editor-gebundene Kommandos (editorScoped) haben ihren eigenen
// Ausfuehrungs-Pfad ueber EDITOR_COMMAND_FUNCTIONS in command-palette.js und
// brauchen keinen Eintrag; sie sind hier ausgenommen.
//
// Geprueft wird gegen den QUELLTEXT, nicht gegen das importierte Modul:
// app-commands.js zieht beim Import den halben Renderer nach sich (CodeMirror,
// DOM-Verdrahtung, Modul-Seiteneffekte) und ist im Unit-Kontext nicht
// ladbar. Die Map ist ein Objektliteral mit einer Zeile je Schluessel und
// damit stabil auslesbar; bricht diese Form, faellt der Test durch die
// Plausibilitaets-Pruefung unten auf und nicht still.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_COMMANDS = path.resolve(
  HERE,
  '..',
  '..',
  '..',
  'src',
  'renderer',
  'modules',
  'app',
  'app-commands.js',
);

// Schluessel-Menge der Map aus dem Quelltext: ab 'export const
// commandHandlers = {' bis zur schliessenden Zeile '};' am Zeilenanfang.
function dispatcherKeys() {
  const quelle = fs.readFileSync(APP_COMMANDS, 'utf8');
  const start = quelle.indexOf('export const commandHandlers = {');
  expect(
    start,
    'Dispatcher-Map nicht gefunden — Struktur von app-commands.js geändert?',
  ).toBeGreaterThan(-1);
  const ende = quelle.indexOf('\n};', start);
  expect(ende, 'Ende der Dispatcher-Map nicht gefunden').toBeGreaterThan(start);
  const block = quelle.slice(start, ende);
  return new Set([...block.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]));
}

describe('Kommando-Dispatcher — Vollständigkeit der Map (4T-0781)', () => {
  const keys = dispatcherKeys();
  const dispatchbar = COMMANDS.filter((c) => !c.editorScoped);

  it('liest eine plausible Anzahl Einträge aus der Quelle', () => {
    // Untere Schranke gegen ein stilles Leerlaufen des Ausdrucks: Bricht die
    // Form der Map, liefert der Reguläre Ausdruck wenige oder keine Treffer,
    // und der Vollständigkeits-Test unten wäre grün aus dem falschen Grund.
    expect(keys.size).toBeGreaterThan(50);
  });

  it('jedes nicht editor-gebundene Registry-Kommando hat einen Eintrag', () => {
    const ohne = dispatchbar.filter((c) => !keys.has(c.id)).map((c) => c.id);
    expect(
      ohne,
      'Ohne Eintrag in commandHandlers (Palette und belegtes Kürzel laufen ins Leere): ' +
        ohne.join(', '),
    ).toEqual([]);
  });

  it('kein Eintrag zeigt auf ein Kommando, das die Registry nicht kennt', () => {
    const bekannt = new Set(COMMANDS.map((c) => c.id));
    const verwaist = [...keys].filter((id) => !bekannt.has(id));
    expect(verwaist, `Eintrag ohne Registry-Kommando: ${verwaist.join(', ')}`).toEqual([]);
  });

  it('editor-gebundene Kommandos brauchen keinen Eintrag und haben auch keinen', () => {
    // Gegenrichtung als Absicherung der Ausnahme: Ein editorScoped-Kommando
    // in der Map wäre ein zweiter Ausführungs-Pfad neben
    // EDITOR_COMMAND_FUNCTIONS und damit eine Divergenz-Quelle.
    const doppelt = COMMANDS.filter((c) => c.editorScoped && keys.has(c.id)).map((c) => c.id);
    expect(doppelt, `Editor-Kommando mit zweitem Ausführungs-Pfad: ${doppelt.join(', ')}`).toEqual(
      [],
    );
  });
});
