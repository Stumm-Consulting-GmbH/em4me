// @vitest-environment jsdom
// 4T-0284 (Epic 3E-0050): Default-Logik der Frontmatter-Anzeige
// (Setting render.showFrontmatter): Default an, nur explizites false
// schaltet ab — auch für Bestands-Nutzer ohne gespeicherten Wert.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const fmDisplay = await import('../../../src/renderer/modules/frontmatter-display.js');

describe('frontmatter-display (4T-0284)', () => {
  beforeEach(() => {
    fmDisplay.setFrontmatterDisplayEnabled(true);
  });

  it('Default ist eingeschaltet', () => {
    expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(true);
  });

  it('nur explizites false schaltet ab; undefined/null bleiben an', () => {
    fmDisplay.setFrontmatterDisplayEnabled(false);
    expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(false);
    fmDisplay.setFrontmatterDisplayEnabled(undefined);
    expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(true);
    fmDisplay.setFrontmatterDisplayEnabled(null);
    expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(true);
  });

  it('Bestands-Nutzer ohne gespeicherten Wert: Store-Init schaltet an', async () => {
    // api-stub: getSetting liefert undefined (kein gespeicherter Wert).
    fmDisplay.setFrontmatterDisplayEnabled(false);
    await fmDisplay.initFrontmatterDisplayFromStore();
    expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(true);
  });

  it('applyFrontmatterDisplay setzt den Zustand und feuert das Konsumenten-Event', () => {
    let fired = 0;
    const listener = () => {
      fired += 1;
    };
    document.addEventListener('scg:frontmatter-display-changed', listener);
    try {
      fmDisplay.applyFrontmatterDisplay(false);
      expect(fired).toBe(1);
      expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(false);
      fmDisplay.applyFrontmatterDisplay(true);
      expect(fired).toBe(2);
      expect(fmDisplay.isFrontmatterDisplayEnabled()).toBe(true);
    } finally {
      document.removeEventListener('scg:frontmatter-display-changed', listener);
    }
  });
});
