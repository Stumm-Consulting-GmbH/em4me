// @vitest-environment jsdom
// 4T-0293 (Epic 3E-0052): Aus-Zustand der Mermaid-Erweiterung — der
// Renderer-Guard lebt (anders als bei den markdown-it-Erweiterungen) in
// der Render-Nachverarbeitung: applyMermaidIfPresent laesst den
// ```mermaid-Block bei deaktivierter Erweiterung unangetastet, und der
// Copy-Button-Skip entfaellt (der Block ist dann ein normaler Code-Block).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const lifecycle = await import('../../../src/renderer/modules/extension-lifecycle.js');
const renderMermaid = await import('../../../src/renderer/modules/render-mermaid.js');

function mermaidContainer() {
  const div = document.createElement('div');
  div.innerHTML = '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>';
  return div;
}

describe('Mermaid-Erweiterung: Aus-Zustand (4T-0293)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
  });

  it('deaktiviert: Block bleibt Code-Block und erhaelt den Copy-Button', async () => {
    await lifecycle.applyExtensionsState(['mermaid'], { persist: false });
    const div = mermaidContainer();
    await renderMermaid.applyMermaidIfPresent(div);
    expect(div.querySelector('pre > code.language-mermaid')).toBeTruthy();
    expect(div.querySelector('.mermaid-block')).toBeNull();
    renderMermaid.applyCodeCopyButtons(div);
    expect(div.querySelector('.code-copy-button')).toBeTruthy();
  });

  it('aktiv: Copy-Button-Skip fuer Mermaid-Bloecke bleibt bestehen', () => {
    const div = mermaidContainer();
    renderMermaid.applyCodeCopyButtons(div);
    expect(div.querySelector('.code-copy-button')).toBeNull();
  });
});
