// 4T-0299 (Epic 3E-0053): externe markdown-it-Plugins in der Pipeline —
// Registrierung über configureExternalMarkdownPlugins, No-op-Verhalten
// und Fehler-Isolation beim Instanz-Aufbau. Das Referenz-Plugin wird wie
// im Preload-Loader per node:vm aus dem Fixture-Quelltext evaluiert
// (leerer Sandbox-Kontext, kein require/process — Spike 4T-0298).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExternalMarkdownPlugins,
} from '../../../src/shared/markdown/markdown.js';

const FIXTURE = path.join(
  __dirname,
  '..',
  '..',
  'fixtures',
  'extensions',
  'beispiel',
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

describe('externe Markdown-Plugins (4T-0299)', () => {
  it('vm-evaluiertes Referenz-Plugin wirkt in Viewer- und Portable-Instanz', () => {
    const plugin = evalPluginSource(fs.readFileSync(FIXTURE, 'utf8'));
    expect(typeof plugin).toBe('function');
    const errors = configureExternalMarkdownPlugins([{ id: 'beispiel', version: '1.0.0', plugin }]);
    expect(errors).toEqual({});
    expect(renderMarkdown('Hallo :-) Welt', 'de')).toContain('ext-beispiel-smiley');
    // Portable-Instanz: Marker in Zeile 1 schaltet auf mdPortable um.
    const portable = renderMarkdown('<!-- perspective-portable -->\n\nHallo :-) Welt', 'de');
    expect(portable).toContain('ext-beispiel-smiley');
  });

  it('vm-Sandbox reicht kein require und kein process durch', () => {
    const probe = evalPluginSource(
      'module.exports = { hasRequire: typeof require !== "undefined", hasProcess: typeof process !== "undefined" };',
    );
    expect(probe).toEqual({ hasRequire: false, hasProcess: false });
  });

  it('leerer Satz stellt den Ausgangszustand wieder her', () => {
    const plugin = evalPluginSource(fs.readFileSync(FIXTURE, 'utf8'));
    configureExternalMarkdownPlugins([{ id: 'beispiel', version: '1.0.0', plugin }]);
    configureExternalMarkdownPlugins([]);
    expect(renderMarkdown('Hallo :-) Welt', 'de')).not.toContain('ext-beispiel-smiley');
    expect(renderMarkdown('Hallo :-) Welt', 'de')).toContain(':-)');
  });

  it('unveränderter Satz (IDs und Versionen) ist ein No-op ohne Fehler', () => {
    const plugin = evalPluginSource(fs.readFileSync(FIXTURE, 'utf8'));
    const list = [{ id: 'beispiel', version: '1.0.0', plugin }];
    expect(configureExternalMarkdownPlugins(list)).toEqual({});
    expect(configureExternalMarkdownPlugins(list)).toEqual({});
  });

  it('werfendes Plugin wird isoliert: Fehler gemeldet, Pipeline läuft weiter', () => {
    const gut = evalPluginSource(fs.readFileSync(FIXTURE, 'utf8'));
    const kaputt = () => {
      throw new Error('Absichtlich defekt');
    };
    const errors = configureExternalMarkdownPlugins([
      { id: 'kaputt', version: '1.0.0', plugin: kaputt },
      { id: 'beispiel', version: '1.0.0', plugin: gut },
    ]);
    expect(errors.kaputt).toContain('Absichtlich defekt');
    expect(errors.beispiel).toBeUndefined();
    // Das intakte Plugin und der Kern rendern normal weiter.
    expect(renderMarkdown('Hallo :-) **fett**', 'de')).toContain('ext-beispiel-smiley');
    expect(renderMarkdown('**fett**', 'de')).toContain('<strong>');
    expect(convertMarkdownPortable('Text')).toContain('Text');
  });
});
