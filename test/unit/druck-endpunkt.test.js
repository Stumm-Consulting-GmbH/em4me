// 4T-001479 (Epic 3E-000177): Der Druck-Endpunkt im Hauptprozess.
//
// Geprueft wird der Handler `print:system` am echten Modul: welche Optionen er
// aus den Export-Einstellungen bildet (AK2), wie er die drei Ausgaenge von
// webContents.print auseinanderhaelt (AK5) und dass er die Fenster-Hintergrund-
// farbe auf jedem Ausgang zuruecksetzt.
//
// Der Abbruch ist der Fall, der hier haengt: `print()` meldet ihn ueber
// dieselbe Callback-Stelle wie einen Fehler. Wuerde er als Fehler durchgehen,
// zeigte die Anwendung nach jedem "Abbrechen" im Systemdialog eine rote
// Meldung — genau das, was der PDF-Export bei seinem Speichern-Dialog seit
// jeher vermeidet.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');
const { PDF_MARGIN_PRESETS } = require('../../src/shared/pdf-options.js');

let handler;
let fenster;
let druckAufrufe;
let einstellungen;

function registriere() {
  const handlers = new Map();
  registerDialogsIpc((kanal, fn) => handlers.set(kanal, fn), {
    app: { getPath: () => 'C:\\Home' },
    dialog: {},
    shell: {},
    session: {},
    senderWindow: () => fenster,
    tForWindow: (_win, key) => key,
    getStore: () => ({ get: (k) => einstellungen[k] }),
  });
  return handlers;
}

function fensterMit(druckErgebnis) {
  const farben = [];
  return {
    zerstoert: false,
    farben,
    isDestroyed: () => false,
    getBackgroundColor: () => '#1e1e1e',
    setBackgroundColor: (c) => farben.push(c),
    webContents: {
      print: (options, callback) => {
        druckAufrufe.push(options);
        callback(druckErgebnis.success, druckErgebnis.failureReason);
      },
    },
  };
}

beforeEach(() => {
  druckAufrufe = [];
  einstellungen = {
    'export.pdf.pageSize': 'A4',
    'export.pdf.landscape': false,
    'export.pdf.margins': 'normal',
  };
  handler = registriere().get('print:system');
});

describe('print:system — Vorbelegung aus den Export-Einstellungen (AK2)', () => {
  it('gibt Format, Ausrichtung und Raender an den Systemdialog weiter', async () => {
    fenster = fensterMit({ success: true });
    await handler({});
    expect(druckAufrufe).toHaveLength(1);
    const [options] = druckAufrufe;
    expect(options.pageSize).toBe('A4');
    expect(options.landscape).toBe(false);
    expect(options.printBackground).toBe(true);
    // Raender in Pixeln, nicht in Zoll: print() rechnet anders als printToPDF.
    const erwartet = Math.round(PDF_MARGIN_PRESETS.normal * 96);
    expect(options.margins).toEqual({
      marginType: 'custom',
      top: erwartet,
      bottom: erwartet,
      left: erwartet,
      right: erwartet,
    });
  });

  it('reicht Querformat und ein anderes Papierformat durch', async () => {
    einstellungen['export.pdf.pageSize'] = 'A3';
    einstellungen['export.pdf.landscape'] = true;
    einstellungen['export.pdf.margins'] = 'narrow';
    handler = registriere().get('print:system');
    fenster = fensterMit({ success: true });
    await handler({});
    const [options] = druckAufrufe;
    expect(options.pageSize).toBe('A3');
    expect(options.landscape).toBe(true);
    expect(options.margins.top).toBe(Math.round(PDF_MARGIN_PRESETS.narrow * 96));
  });

  it('faellt bei unbrauchbaren Werten auf die Vorgaben zurueck', async () => {
    einstellungen['export.pdf.pageSize'] = 'Poster';
    einstellungen['export.pdf.landscape'] = 'ja';
    einstellungen['export.pdf.margins'] = 'riesig';
    handler = registriere().get('print:system');
    fenster = fensterMit({ success: true });
    await handler({});
    const [options] = druckAufrufe;
    expect(options.pageSize).toBe('A4');
    expect(options.landscape).toBe(false);
    expect(options.margins.top).toBe(Math.round(PDF_MARGIN_PRESETS.normal * 96));
  });

  it('setzt weder Drucker noch Kopien noch Seitenbereich — das waehlt der Dialog (E3)', async () => {
    fenster = fensterMit({ success: true });
    await handler({});
    const [options] = druckAufrufe;
    for (const feld of ['deviceName', 'copies', 'pageRanges', 'duplexMode', 'collate', 'silent']) {
      expect(options, `${feld} darf nicht vorbelegt sein`).not.toHaveProperty(feld);
    }
  });
});

describe('print:system — die drei Ausgaenge (AK5)', () => {
  it('Erfolg wird als Erfolg gemeldet', async () => {
    fenster = fensterMit({ success: true });
    expect(await handler({})).toEqual({ ok: true });
  });

  it('der Abbruch im Systemdialog ist kein Fehler', async () => {
    fenster = fensterMit({ success: false, failureReason: 'cancelled' });
    expect(await handler({})).toEqual({ ok: false, canceled: true });
  });

  it('auch die amerikanische Schreibweise gilt als Abbruch', async () => {
    fenster = fensterMit({ success: false, failureReason: 'Print job canceled by user' });
    expect(await handler({})).toEqual({ ok: false, canceled: true });
  });

  it('ein echter Fehlschlag meldet seinen Grund', async () => {
    fenster = fensterMit({ success: false, failureReason: 'Invalid printer settings' });
    expect(await handler({})).toEqual({ ok: false, error: 'Invalid printer settings' });
  });

  it('ein Fehlschlag ohne Grund meldet trotzdem einen', async () => {
    fenster = fensterMit({ success: false, failureReason: '' });
    const ergebnis = await handler({});
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.canceled).toBeUndefined();
    expect(ergebnis.error).toBeTruthy();
  });

  it('ohne Fenster geschieht nichts', async () => {
    fenster = null;
    const ergebnis = await handler({});
    expect(ergebnis.ok).toBe(false);
    expect(druckAufrufe).toEqual([]);
  });
});

describe('print:system — die Fenster-Hintergrundfarbe (Spike-Befund 4T-000303)', () => {
  it('faerbt fuer die Druck-Dauer weiss und stellt danach zurueck', async () => {
    fenster = fensterMit({ success: true });
    await handler({});
    expect(fenster.farben).toEqual(['#ffffff', '#1e1e1e']);
  });

  it('stellt auch nach einem Abbruch zurueck', async () => {
    fenster = fensterMit({ success: false, failureReason: 'cancelled' });
    await handler({});
    expect(fenster.farben).toEqual(['#ffffff', '#1e1e1e']);
  });

  it('stellt auch nach einem geworfenen Fehler zurueck', async () => {
    fenster = fensterMit({ success: true });
    fenster.webContents.print = () => {
      throw new Error('Fenster weg');
    };
    const ergebnis = await handler({});
    expect(ergebnis).toEqual({ ok: false, error: 'Fenster weg' });
    expect(fenster.farben).toEqual(['#ffffff', '#1e1e1e']);
  });
});
