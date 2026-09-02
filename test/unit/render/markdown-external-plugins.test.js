// 4T-000299 (Epic 3E-000053): externe markdown-it-Plugins in der Pipeline —
// Registrierung über configureExternalMarkdownPlugins, No-op-Verhalten
// und Fehler-Isolation beim Instanz-Aufbau. Das Referenz-Plugin wird wie
// im Preload-Loader per node:vm aus dem Fixture-Quelltext evaluiert
// (leerer Sandbox-Kontext, kein require/process — Spike 4T-000298).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExternalMarkdownPlugins,
} from '../../../src/shared/markdown/markdown.js';

// 4T-000826 (Epic 3E-000103): Quelle ist das real ausgelieferte Referenz-Paket
// aus addon_examples/, nicht mehr eine Attrappe unter test/fixtures.
const BEISPIEL_PLUGIN = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'addon_examples',
  'notiz-merker',
  'markdown.js',
);

function evalPluginSource(source) {
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox, { filename: 'extern-plugin.js' });
  return sandbox.module.exports;
}

afterEach(() => {
  configureExternalMarkdownPlugins([]);
});

describe('externe Markdown-Plugins (4T-000299)', () => {
  it('vm-evaluiertes Referenz-Plugin wirkt in Viewer- und Portable-Instanz', () => {
    const plugin = evalPluginSource(fs.readFileSync(BEISPIEL_PLUGIN, 'utf8'));
    expect(typeof plugin).toBe('function');
    const errors = configureExternalMarkdownPlugins([
      { id: 'notiz-merker', version: '1.0.0', plugin },
    ]);
    expect(errors).toEqual({});
    expect(renderMarkdown('Hallo >>Merker<< Welt', 'de')).toContain('ext-notiz-merker-marke');
    // Portable-Instanz: Marker in Zeile 1 schaltet auf mdPortable um.
    const portable = renderMarkdown('<!-- perspective-portable -->\n\nHallo >>Merker<< Welt', 'de');
    expect(portable).toContain('ext-notiz-merker-marke');
  });

  it('vm-Sandbox reicht kein require und kein process durch', () => {
    const probe = evalPluginSource(
      'module.exports = { hasRequire: typeof require !== "undefined", hasProcess: typeof process !== "undefined" };',
    );
    expect(probe).toEqual({ hasRequire: false, hasProcess: false });
  });

  it('leerer Satz stellt den Ausgangszustand wieder her', () => {
    const plugin = evalPluginSource(fs.readFileSync(BEISPIEL_PLUGIN, 'utf8'));
    configureExternalMarkdownPlugins([{ id: 'notiz-merker', version: '1.0.0', plugin }]);
    configureExternalMarkdownPlugins([]);
    expect(renderMarkdown('Hallo >>Merker<< Welt', 'de')).not.toContain('ext-notiz-merker-marke');
    // Ohne das Plugin bleibt die Syntax Klartext — und Klartext mit spitzen
    // Klammern erscheint im HTML maskiert.
    expect(renderMarkdown('Hallo >>Merker<< Welt', 'de')).toContain('&gt;&gt;Merker&lt;&lt;');
  });

  it('unveränderter Satz (IDs und Versionen) ist ein No-op ohne Fehler', () => {
    const plugin = evalPluginSource(fs.readFileSync(BEISPIEL_PLUGIN, 'utf8'));
    const list = [{ id: 'notiz-merker', version: '1.0.0', plugin }];
    expect(configureExternalMarkdownPlugins(list)).toEqual({});
    expect(configureExternalMarkdownPlugins(list)).toEqual({});
  });

  it('werfendes Plugin wird isoliert: Fehler gemeldet, Pipeline läuft weiter', () => {
    const gut = evalPluginSource(fs.readFileSync(BEISPIEL_PLUGIN, 'utf8'));
    const kaputt = () => {
      throw new Error('Absichtlich defekt');
    };
    const errors = configureExternalMarkdownPlugins([
      { id: 'kaputt', version: '1.0.0', plugin: kaputt },
      { id: 'notiz-merker', version: '1.0.0', plugin: gut },
    ]);
    expect(errors.kaputt).toContain('Absichtlich defekt');
    expect(errors['notiz-merker']).toBeUndefined();
    // Das intakte Plugin und der Kern rendern normal weiter.
    expect(renderMarkdown('Hallo >>Merker<< **fett**', 'de')).toContain('ext-notiz-merker-marke');
    expect(renderMarkdown('**fett**', 'de')).toContain('<strong>');
    expect(convertMarkdownPortable('Text')).toContain('Text');
  });
});
