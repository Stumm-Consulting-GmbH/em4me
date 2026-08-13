// @vitest-environment jsdom
// 4T-0292 (Epic 3E-0052): Renderer-Lebenszyklus des Erweiterungs-Systems —
// Zustands-Uebergaenge, Laufzeit-Hooks (attach-Muster), Konsumenten-Event
// und Persistenz-Verhalten (persist:false beim Broadcast-Empfang).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { EXTENSIONS_DISABLED_KEY } from '../../../src/shared/extensions/extensions.js';

const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

describe('extension-lifecycle (4T-0292)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
  });

  it('Default: alles aktiv, unbekannte IDs sind Kern und aktiv', () => {
    expect(lifecycle.isExtensionActive('katex')).toBe(true);
    expect(lifecycle.isExtensionActive('gibtsnicht')).toBe(true);
    expect(lifecycle.getDisabledExtensionIds()).toEqual([]);
  });

  it('applyExtensionsState schaltet um, feuert das Event und ruft Hooks', async () => {
    const calls = [];
    lifecycle.attachExtensionRuntime('katex', {
      activate: () => calls.push('activate'),
      deactivate: () => calls.push('deactivate'),
    });
    let eventDetail = null;
    const listener = (ev) => {
      eventDetail = ev.detail;
    };
    document.addEventListener('scg:extensions-changed', listener);
    try {
      expect(await lifecycle.applyExtensionsState(['katex'], { persist: false })).toBe(true);
      expect(lifecycle.isExtensionActive('katex')).toBe(false);
      expect(calls).toEqual(['deactivate']);
      expect(eventDetail.changed).toContain('katex');
      // Unveraenderter Zustand ist ein No-op ohne weitere Hook-Aufrufe.
      expect(await lifecycle.applyExtensionsState(['katex'], { persist: false })).toBe(false);
      expect(calls).toEqual(['deactivate']);
      // Wieder einschalten ruft activate.
      expect(await lifecycle.applyExtensionsState([], { persist: false })).toBe(true);
      expect(calls).toEqual(['deactivate', 'activate']);
      expect(lifecycle.isExtensionActive('katex')).toBe(true);
    } finally {
      document.removeEventListener('scg:extensions-changed', listener);
    }
  });

  it('unbekannte IDs werden normalisiert und sind kein Zustandswechsel', async () => {
    expect(await lifecycle.applyExtensionsState(['voellig-fremd'], { persist: false })).toBe(false);
    expect(lifecycle.getDisabledExtensionIds()).toEqual([]);
  });

  it('attachExtensionRuntime nach Deaktivierung bringt den Hook auf Stand', async () => {
    await lifecycle.applyExtensionsState(['katex'], { persist: false });
    const calls = [];
    lifecycle.attachExtensionRuntime('katex', {
      deactivate: () => calls.push('deactivate'),
    });
    expect(calls).toEqual(['deactivate']);
  });

  it('fehlerhafte Hooks brechen das Umschalten nicht ab (Isolation)', async () => {
    lifecycle.attachExtensionRuntime('katex', {
      deactivate: () => {
        throw new Error('kaputt');
      },
    });
    expect(await lifecycle.applyExtensionsState(['katex'], { persist: false })).toBe(true);
    expect(lifecycle.isExtensionActive('katex')).toBe(false);
  });

  it('persistiert per Default ueber den angehaengten Persist-Helfer', async () => {
    const persisted = [];
    lifecycle.attachExtensionPersistence(async (key, value) => {
      persisted.push([key, value]);
      return true;
    });
    await lifecycle.applyExtensionsState(['katex']);
    expect(persisted).toEqual([[EXTENSIONS_DISABLED_KEY, ['katex']]]);
    // Broadcast-Empfang (persist:false) schreibt nicht erneut.
    await lifecycle.applyExtensionsState([], { persist: false });
    expect(persisted.length).toBe(1);
  });
});
