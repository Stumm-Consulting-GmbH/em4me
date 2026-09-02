// @vitest-environment jsdom
// 4T-000412 (Epic 3E-000078): Whitelist-Übersetzer und Ergebnis-Aufbau der
// Skript-Blöcke (perspective-script-view.js). Sicherheits-Nachweise auf
// Unit-Ebene: nicht erlaubte Elemente und Attribute werden verworfen,
// Links laufen ausschließlich über den data-fm-path-Klick-Pfad, der
// Ausgabe-Deckel greift. Der t-Stub liest die echte de.json, damit
// Platzhalter-Ersetzung und Key-Existenz gleich mitgetestet werden.
// 4T-000413: md-Knoten (Pipeline-Rendering über den api-Stub, Entfernen
// dynamischer Platzhalter) und Anker der Link-Knoten.
import './api-stub.js';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildScriptOutputDom,
  renderScriptResult,
  renderSourceFallback,
} from '../../../src/renderer/modules/query/perspective-script-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

function render(output, basePath) {
  const host = document.createElement('div');
  host.appendChild(buildScriptOutputDom(output, basePath || '', tStub));
  return host;
}

describe('perspective-script-view buildScriptOutputDom (4T-000412)', () => {
  it('Text-Knoten werden als Text angehängt (kein HTML-Parsing)', () => {
    const host = render([{ kind: 'text', text: '<b>kein HTML</b> & Text' }]);
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toBe('<b>kein HTML</b> & Text');
  });

  it('erlaubte Elemente mit class/title entstehen; Struktur bleibt erhalten', () => {
    const host = render([
      {
        kind: 'el',
        tag: 'p',
        attrs: { class: 'meine-klasse', title: 'Titel' },
        children: [
          { kind: 'text', text: 'Hallo ' },
          { kind: 'el', tag: 'strong', attrs: {}, children: [{ kind: 'text', text: 'Welt' }] },
        ],
      },
    ]);
    const p = host.querySelector('p.meine-klasse');
    expect(p).not.toBeNull();
    expect(p.getAttribute('title')).toBe('Titel');
    expect(p.querySelector('strong').textContent).toBe('Welt');
  });

  it('nicht erlaubte Elemente werden verworfen, ihre Kinder bleiben sichtbar', () => {
    const host = render([
      {
        kind: 'el',
        tag: 'script',
        attrs: {},
        children: [{ kind: 'text', text: 'sichtbar' }],
      },
      { kind: 'el', tag: 'iframe', attrs: {}, children: [] },
      { kind: 'el', tag: 'img', attrs: { src: 'x.png' }, children: [] },
      { kind: 'el', tag: 'form', attrs: {}, children: [] },
    ]);
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('form')).toBeNull();
    expect(host.textContent).toBe('sichtbar');
  });

  it('nicht erlaubte Attribute (Event-Handler, style, id, href) werden verworfen', () => {
    const host = render([
      {
        kind: 'el',
        tag: 'div',
        attrs: {
          onclick: 'alert(1)',
          style: 'position:fixed',
          id: 'kollision',
          href: 'javascript:alert(1)',
          class: 'ok',
        },
        children: [],
      },
    ]);
    const div = host.querySelector('div.ok');
    expect(div).not.toBeNull();
    expect(div.getAttributeNames().sort()).toEqual(['class']);
  });

  it('colspan/rowspan nur auf Zellen und nur numerisch validiert', () => {
    const host = render([
      {
        kind: 'el',
        tag: 'table',
        attrs: {},
        children: [
          {
            kind: 'el',
            tag: 'tr',
            attrs: { colspan: '2' },
            children: [
              { kind: 'el', tag: 'td', attrs: { colspan: '3' }, children: [] },
              { kind: 'el', tag: 'td', attrs: { rowspan: 'böse' }, children: [] },
            ],
          },
        ],
      },
    ]);
    const cells = host.querySelectorAll('td');
    expect(cells[0].getAttribute('colspan')).toBe('3');
    expect(cells[1].hasAttribute('rowspan')).toBe(false);
    expect(host.querySelector('tr').hasAttribute('colspan')).toBe(false);
  });

  it('link-Knoten: Klick-Pfad über data-fm-path, kein Skript-Schema möglich', () => {
    const host = render([
      { kind: 'link', path: '/raum/Alpha.md', label: 'Alpha' },
      { kind: 'link', path: 'javascript:alert(1)', label: 'Böse' },
    ]);
    const links = host.querySelectorAll('a.perspective-query-item');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('#');
    expect(links[0].dataset.fmPath).toBe('/raum/Alpha.md');
    expect(links[0].textContent).toBe('Alpha');
    // Auch ein bösartiger "Pfad" landet nie im href, nur im data-Attribut
    // (der zentrale Klick-Pfad öffnet ausschließlich Index-Dateien).
    expect(links[1].getAttribute('href')).toBe('#');
    expect(links[1].dataset.fmPath).toBe('javascript:alert(1)');
  });

  it('list-Knoten: verschachtelte Einträge werden zu geschachtelten Listen', () => {
    const host = render([
      {
        kind: 'list',
        items: [
          {
            content: [{ kind: 'text', text: 'Wurzel' }],
            children: [{ content: [{ kind: 'text', text: 'Kind' }], children: [] }],
          },
        ],
      },
    ]);
    const root = host.querySelector('ul.perspective-script-list');
    expect(root).not.toBeNull();
    const li = root.querySelector('li');
    expect(li.firstChild.textContent).toBe('Wurzel');
    expect(li.querySelector('ul li').textContent).toBe('Kind');
  });

  it('table-Knoten: Kopf- und Datenzellen aus Segmenten', () => {
    const host = render([
      {
        kind: 'table',
        headers: [[{ kind: 'text', text: 'A' }], [{ kind: 'text', text: 'B' }]],
        rows: [
          [[{ kind: 'text', text: '1' }], [{ kind: 'text', text: '2' }]],
          [[{ kind: 'text', text: '3' }], [{ kind: 'text', text: '4' }]],
        ],
      },
    ]);
    const table = host.querySelector('table.perspective-script-table');
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll('th')].map((el) => el.textContent)).toEqual(['A', 'B']);
    expect([...table.querySelectorAll('td')].map((el) => el.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('Tiefen-Deckel: zu tiefe Verschachtelung wird gekappt und gemeldet', () => {
    // 40 Ebenen tiefe el-Kette (Deckel liegt bei 32).
    let node = { kind: 'text', text: 'tief' };
    for (let i = 0; i < 40; i++) {
      node = { kind: 'el', tag: 'div', attrs: {}, children: [node] };
    }
    const host = render([node]);
    const note = [...host.querySelectorAll('.perspective-script-status')].find(
      (el) => el.textContent === de['script.outputTruncated'],
    );
    expect(note).toBeTruthy();
  });

  it('link-Knoten mit Anker: data-fm-anchor für den Block-Sprung (4T-000413)', () => {
    const host = render([
      { kind: 'link', path: '/raum/Alpha.md', label: 'Alpha#^abc', anchor: 'abc' },
    ]);
    const a = host.querySelector('a.perspective-query-item');
    expect(a.dataset.fmAnchor).toBe('^abc');
  });

  it('md-Knoten: Pipeline-HTML wird eingebettet, dynamische Platzhalter entfernt (4T-000413)', () => {
    window.api.renderMarkdown = (text, basePath, opts) => {
      expect(text).toBe('**fett**');
      expect(basePath).toBe('/raum/Basis.md');
      expect(opts).toEqual({ frontmatterBlock: false });
      return (
        '<p><strong>fett</strong></p>' +
        '<div class="perspective-script" data-script-source="x"></div>' +
        '<div class="perspective-query" data-fm-query="y"></div>'
      );
    };
    try {
      const host = render([{ kind: 'md', text: '**fett**' }], '/raum/Basis.md');
      const md = host.querySelector('.perspective-script-md');
      expect(md).not.toBeNull();
      expect(md.querySelector('strong').textContent).toBe('fett');
      // Keine rekursive Ausführung: Skript- und Abfrage-Platzhalter fliegen raus.
      expect(md.querySelector('.perspective-script')).toBeNull();
      expect(md.querySelector('.perspective-query')).toBeNull();
    } finally {
      delete window.api.renderMarkdown;
    }
  });

  it('md-Knoten ohne Pipeline (api-Fehler): Rückfall auf die Text-Darstellung', () => {
    window.api.renderMarkdown = () => {
      throw new Error('Pipeline nicht verfügbar');
    };
    try {
      const host = render([{ kind: 'md', text: '**fett**' }]);
      const md = host.querySelector('.perspective-script-md');
      expect(md.textContent).toBe('**fett**');
      expect(md.querySelector('strong')).toBeNull();
    } finally {
      delete window.api.renderMarkdown;
    }
  });

  it('unbekannte Knoten-Arten werden verworfen (Whitelist-Prinzip)', () => {
    const host = render([
      { kind: 'html', html: '<script>alert(1)</script>' },
      { kind: 'text', text: 'ok' },
    ]);
    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).toBe('ok');
  });
});

describe('perspective-script-view renderScriptResult (4T-000412)', () => {
  it('result: Ausgabe wird über den Whitelist-Übersetzer aufgebaut', () => {
    const el = document.createElement('div');
    renderScriptResult(
      el,
      { type: 'result', output: [{ kind: 'text', text: 'Hallo' }] },
      '',
      tStub,
    );
    expect(el.textContent).toBe('Hallo');
  });

  it('error: lokalisierter Rahmen mit Original-Meldung und Zeile', () => {
    const el = document.createElement('div');
    renderScriptResult(el, { type: 'error', message: 'kaputt', line: 3 }, '', tStub);
    const err = el.querySelector('.perspective-script-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toContain('kaputt');
    expect(err.textContent).toContain('Zeile 3');
    expect(err.textContent).not.toContain('{message}');
  });

  it('error ohne Zeile: keine Zeilen-Angabe', () => {
    const el = document.createElement('div');
    renderScriptResult(el, { type: 'error', message: 'kaputt', line: null }, '', tStub);
    expect(el.querySelector('.perspective-script-error').textContent).not.toContain('Zeile');
  });

  it('timeout: lokalisierter Hinweis mit eingesetzten Sekunden', () => {
    const el = document.createElement('div');
    renderScriptResult(el, { type: 'timeout' }, '', tStub);
    const err = el.querySelector('.perspective-script-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toContain('5');
    expect(err.textContent).not.toContain('{seconds}');
  });
});

describe('perspective-script-view renderSourceFallback (4T-000414)', () => {
  it('Aus-Zustand: Hinweis-Banner plus Quelltext als Code-Block', () => {
    const el = document.createElement('div');
    renderSourceFallback(el, "pq.out('x');", tStub);
    const banner = el.querySelector('.perspective-script-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toBe(de['script.disabledBanner']);
    const code = el.querySelector('pre code.language-perspective-script');
    expect(code).not.toBeNull();
    expect(code.textContent).toBe("pq.out('x');");
    // Kein iframe, keine Ausführung im Aus-Zustand.
    expect(el.querySelector('iframe')).toBeNull();
  });
});
