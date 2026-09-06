// @vitest-environment jsdom
// 4T-001479 (Epic 3E-000177): Was die beiden Ausgabe-Wege aus dem Ergebnis der
// gemeinsamen Klammer machen.
//
// Der eine Fall, der hier zaehlt: **Abbruch meldet nichts.** Sowohl der
// Speichern-Dialog der PDF-Ausgabe als auch der Systemdialog des Drucks lassen
// sich abbrechen, und beide Male darf keine rote Meldung erscheinen. Beim
// PDF-Export ist das Bestandsverhalten (E2E-Fall PD-02); beim Druck ist es neu
// und laeuft ueber einen anderen Weg — der Abbruch kommt nicht aus dem
// Vorbereitungs-Schritt, sondern aus dem Endpunkt.
//
// Die Klammer selbst ist ersetzt; ihre eigene Pruefung steht in
// druck-vorbereitung.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let ergebnis;
const hinweise = [];

vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  withPrintPreparation: async (steps) => {
    // Der Endpunkt wird gerufen, damit ein Weg ohne Endpunkt auffiele.
    if (steps.prepare) {
      const kontext = await steps.prepare({ path: 'C:\\A\\B.md' });
      if (kontext) await steps.output(kontext);
    } else {
      await steps.output(null);
    }
    return ergebnis;
  },
}));

vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (key, opts) => hinweise.push({ key, error: !!(opts && opts.error) }),
}));

vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => `${key}: {error}`,
}));

vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    choosePdfExportTarget: async () => ({ ok: true, path: 'C:\\A\\B.pdf' }),
    printPdfToFile: async () => ({ ok: true }),
    printToSystemPrinter: async () => ({ ok: true }),
  },
}));

vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  tabDisplayName: (tab) => tab.name || 'Unbenannt',
  withDialog: (fn) => fn(),
}));

const { printActiveTab } = await import('../../../src/renderer/modules/views/print.js');
const { exportActiveTabAsPdf } = await import('../../../src/renderer/modules/views/pdf-export.js');

beforeEach(() => {
  hinweise.length = 0;
});

describe('printActiveTab — Rueckmeldung an den Anwender', () => {
  it('meldet den abgesetzten Druckauftrag', async () => {
    ergebnis = { ok: true };
    expect(await printActiveTab()).toBe(true);
    expect(hinweise).toEqual([{ key: 'print.statusOk', error: false }]);
  });

  it('schweigt beim Abbruch im Systemdialog (AK5)', async () => {
    ergebnis = { ok: false, canceled: true };
    expect(await printActiveTab()).toBe(false);
    expect(hinweise).toEqual([]);
  });

  it('meldet einen echten Fehlschlag als Fehler (AK5)', async () => {
    ergebnis = { ok: false, error: 'Drucker offline' };
    expect(await printActiveTab()).toBe(false);
    expect(hinweise).toEqual([{ key: 'print.statusError', error: true }]);
  });

  it('nimmt den eigenen Statustext, nicht den der PDF-Ausgabe', async () => {
    ergebnis = { ok: true };
    await printActiveTab();
    ergebnis = { ok: false, error: 'x' };
    await printActiveTab();
    expect(hinweise.map((h) => h.key)).toEqual(['print.statusOk', 'print.statusError']);
  });
});

describe('exportActiveTabAsPdf — unveraendert nach dem Umbau', () => {
  it('meldet die geschriebene Datei', async () => {
    ergebnis = { ok: true };
    expect(await exportActiveTabAsPdf()).toBe(true);
    expect(hinweise).toEqual([{ key: 'pdf.statusOk', error: false }]);
  });

  it('schweigt beim Abbruch im Speichern-Dialog (Bestand PD-02)', async () => {
    ergebnis = { ok: false, canceled: true };
    expect(await exportActiveTabAsPdf()).toBe(false);
    expect(hinweise).toEqual([]);
  });

  it('meldet einen Schreibfehler als Fehler (Bestand PD-03)', async () => {
    ergebnis = { ok: false, error: 'Zugriff verweigert' };
    expect(await exportActiveTabAsPdf()).toBe(false);
    expect(hinweise).toEqual([{ key: 'pdf.statusError', error: true }]);
  });
});
