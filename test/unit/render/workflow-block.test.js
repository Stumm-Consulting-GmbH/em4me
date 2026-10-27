// 4T-002351 (Epic 3E-000184): Der gefärbte workflow-Block der Darstellung
// (src/shared/markdown/workflow-block.js) und seine Weiche in der Pipeline
// (src/shared/markdown/markdown.js).
//
// Geprüft wird das Markup, der Schutz von HTML im Text, dass der Text-Inhalt
// Zeichen für Zeichen der Quelltext bleibt (AK5), und das Tor der Erweiterung
// (`istWorkflowFence`). Durch die Pipeline lässt sich der Aus-Zustand erst
// fahren, wenn 4T-002352 die Erweiterung registriert, weil die Aus-Liste eine
// unbekannte Kennung verwirft. Dann gehört der Fall in
// test/unit/render/extensions-aus.test.js.
import { describe, it, expect } from 'vitest';
import {
  istWorkflowFence,
  workflowFenceHtml,
} from '../../../src/shared/markdown/workflow-block.js';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

// Text-Inhalt des Code-Elements ohne DOM: Tags weg, Entitäten zurück.
const textInhalt = (html) =>
  /<code[^>]*>([\s\S]*)<\/code>/
    .exec(html)[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

describe('workflowFenceHtml', () => {
  it('trägt das Gerüst eines Code-Blocks und die drei Arten als Spannen (AK1)', () => {
    const html = workflowFenceHtml('create "{{folder}}/Neu.md"\n');
    expect(html).toBe(
      '<pre><code class="hljs language-workflow">' +
        '<span class="wf-keyword">create</span> ' +
        '<span class="wf-string">&quot;<span class="wf-placeholder">{{folder}}</span>/Neu.md&quot;</span>' +
        '\n</code></pre>\n',
    );
  });

  it('schützt HTML im Text', () => {
    const html = workflowFenceHtml('notify "<script>alert(1)</script>"\n# <b>x</b>\n');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('lässt den Text-Inhalt Zeichen für Zeichen stehen (AK5)', () => {
    const inhalt =
      '# Kommentar\ncreate "{{folder}}/a.md" from-template="V {{title}}.md"\n' +
      'append "a \\"b\\" & <c>" from-section="Ä"\nfliege "x"\nmove "a""b"\n\nwait 2\n';
    expect(textInhalt(workflowFenceHtml(inhalt))).toBe(inhalt);
  });

  it('lässt Kommentar und fehlerhafte Zeilen ungefärbt', () => {
    const html = workflowFenceHtml('# Kommentar\nmove "a""b"\n');
    expect(html).not.toContain('wf-');
  });
});

describe('istWorkflowFence', () => {
  it('nimmt allein die Sprache workflow bei eingeschalteter Erweiterung', () => {
    const an = () => true;
    expect(istWorkflowFence('workflow', an)).toBe(true);
    expect(istWorkflowFence('workflows', an)).toBe(false);
    expect(istWorkflowFence('js', an)).toBe(false);
    expect(istWorkflowFence('workflow', (id) => id !== 'workflows')).toBe(false);
  });
});

describe('Weiche in der Pipeline', () => {
  const quelle = '# T\n\n```workflow\nnotify "x"\n```\n\n```js\nlet a = 1;\n```\n';

  it('färbt den workflow-Block und lässt andere Code-Blöcke unverändert', () => {
    const html = renderMarkdown(quelle);
    expect(html).toContain('<span class="wf-keyword">notify</span>');
    expect(html).toContain('class="hljs language-js"');
    expect(html.match(/wf-keyword/g)).toHaveLength(1);
  });

  // Nachzug vom 2026-10-24 (Entscheidung des Product Owners vom 2026-10-23):
  // Die gerenderte Ansicht findet über das Merkmal zu jedem Block seine
  // Kopfzeile; die Zeile ist die der öffnenden Zaun-Zeile im ganzen Dokument.
  it('trägt die Zaun-Zeile im Dokument als data-wf-zeile, auch hinter dem Dateikopf', () => {
    expect(renderMarkdown(quelle)).toContain('<pre data-wf-zeile="3"><code');
    const mitKopf = '---\nworkflow: true\nname: P\n---\n\n' + quelle;
    expect(renderMarkdown(mitKopf)).toContain('<pre data-wf-zeile="8"><code');
    expect(renderMarkdown(quelle).match(/data-wf-zeile/g)).toHaveLength(1);
  });

  it('ohne Zeilenbereich entfällt das Merkmal', () => {
    expect(workflowFenceHtml('notify "x"\n', null, {})).not.toContain('data-wf-zeile');
    expect(workflowFenceHtml('notify "x"\n', [4, 7], { sourceLineOffset: 3 })).toContain(
      '<pre data-wf-zeile="8">',
    );
  });
});
