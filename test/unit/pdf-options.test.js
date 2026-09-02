// 4T-000303/4T-000304 (Epic 3E-000054): Unit-Tests des printToPDF-Options-
// Mappings (src/shared/pdf-options.js) — Defaults, Validierung ungueltiger
// Store-Werte und Rand-Stufen-Abbildung.
import { describe, it, expect } from 'vitest';
import {
  PDF_PAGE_SIZES,
  PDF_MARGIN_PRESETS,
  PDF_EXPORT_DEFAULTS,
  normalizePdfExportSettings,
  printToPdfOptions,
} from '../../src/shared/pdf-options.js';

describe('normalizePdfExportSettings', () => {
  it('liefert die Defaults A4/Hochformat/normal ohne Eingabe', () => {
    for (const raw of [undefined, null, {}, 'A4', 42]) {
      expect(normalizePdfExportSettings(raw)).toEqual(PDF_EXPORT_DEFAULTS);
    }
  });

  it('uebernimmt gueltige Werte unveraendert', () => {
    const s = normalizePdfExportSettings({ pageSize: 'Letter', landscape: true, margins: 'wide' });
    expect(s).toEqual({ pageSize: 'Letter', landscape: true, margins: 'wide' });
  });

  it('faellt bei ungueltigen Einzel-Werten feldweise auf die Defaults zurueck', () => {
    const s = normalizePdfExportSettings({ pageSize: 'A7', landscape: 'ja', margins: 'riesig' });
    expect(s).toEqual(PDF_EXPORT_DEFAULTS);
    const t = normalizePdfExportSettings({ pageSize: 'A3', landscape: 1, margins: 'narrow' });
    expect(t).toEqual({ pageSize: 'A3', landscape: false, margins: 'narrow' });
  });

  it('alle angebotenen Formate und Rand-Stufen passieren die Validierung', () => {
    for (const pageSize of PDF_PAGE_SIZES) {
      expect(normalizePdfExportSettings({ pageSize }).pageSize).toBe(pageSize);
    }
    for (const margins of Object.keys(PDF_MARGIN_PRESETS)) {
      expect(normalizePdfExportSettings({ margins }).margins).toBe(margins);
    }
  });
});

describe('printToPdfOptions', () => {
  it('baut die Default-Optionen mit printBackground und normalem Rand', () => {
    expect(printToPdfOptions(undefined)).toEqual({
      pageSize: 'A4',
      landscape: false,
      printBackground: true,
      margins: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
    });
  });

  it('bildet die Rand-Stufen auf die Zoll-Werte ab (schmal/normal/breit)', () => {
    expect(printToPdfOptions({ margins: 'narrow' }).margins.top).toBe(0.4);
    expect(printToPdfOptions({ margins: 'normal' }).margins.top).toBe(0.8);
    expect(printToPdfOptions({ margins: 'wide' }).margins.top).toBe(1.2);
    // Alle vier Seiten identisch.
    const m = printToPdfOptions({ margins: 'wide' }).margins;
    expect(m).toEqual({ top: 1.2, bottom: 1.2, left: 1.2, right: 1.2 });
  });

  it('reicht Querformat und Format durch', () => {
    const o = printToPdfOptions({ pageSize: 'A5', landscape: true });
    expect(o.pageSize).toBe('A5');
    expect(o.landscape).toBe(true);
  });
});
