// 4T-001993 (Epic 3E-000188): Die beiden Kanäle zum portablen Betrieb am ECHTEN
// Handler (src/main/ipc/windows.js): `app:portablerBetrieb` liefert die Auskunft
// für den Dialog «Über EM4me», `app:oeffneDatenOrdner` öffnet den Daten-Ordner
// im Dateimanager des Betriebssystems.
//
// Die tragenden Fälle sind drei, und jeder misst eine Zusage des Tasks:
//
//   - **Portabel:** Die Auskunft nennt genau den Daten-Ordner aus der Erkennung,
//     und das Öffnen reicht genau diesen Pfad an die Shell.
//   - **Nicht portabel** (installierte Fassung, Start aus den Quellen,
//     Testlauf): Die Auskunft kommt ohne Pfad, und das Öffnen ruft die Shell
//     gar nicht erst — es meldet das zurück, statt still zu scheitern.
//   - **Kein Pfad vom Fenster:** Was der Anzeige-Prozess mitgibt, bleibt
//     unbeachtet. Der Kanal ist kein allgemeiner «öffne beliebigen
//     Pfad»-Zugang (Entwicklungsrichtlinien, Kapitel 6: schmale Endpunkte).
//
// Die Shell ist ein Spion, weil die Zusage genau an ihrem Aufruf hängt; ein
// echter Aufruf öffnete während des Testlaufs ein Fenster des Dateimanagers.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWindowsIpc } = require('../../src/main/ipc/windows.js');

const DATEN_ORDNER = 'D:\\Programme\\EM4me\\Data';

// Der echte Handler mit genau den Abhängigkeiten, die die beiden Kanäle
// benutzen. `portablerBetrieb` hat die Form, die main.js aus
// ermittlePortablenBetrieb erhält.
function aufbau(portablerBetrieb, openPathErgebnis = '') {
  const shell = { openPath: vi.fn(async () => openPathErgebnis) };
  const handler = new Map();
  registerWindowsIpc((kanal, fn) => handler.set(kanal, fn), {
    shell,
    portablerBetrieb: Object.freeze(portablerBetrieb),
  });
  return {
    shell,
    auskunft: (...args) => handler.get('app:portablerBetrieb')({}, ...args),
    oeffnen: (...args) => handler.get('app:oeffneDatenOrdner')({}, ...args),
  };
}

const PORTABEL = { portabel: true, datenOrdner: DATEN_ORDNER, beschreibbar: true };
const NICHT_PORTABEL = { portabel: false, datenOrdner: null, beschreibbar: null };

describe('app:portablerBetrieb — Auskunft (4T-001993)', () => {
  it('meldet im portablen Betrieb den Pfad des Daten-Ordners', () => {
    // 4T-001993 (AK2): Die Zeile im Dialog nennt genau diesen Pfad.
    const u = aufbau(PORTABEL);
    expect(u.auskunft()).toEqual({ portabel: true, datenOrdner: DATEN_ORDNER });
  });

  it('meldet außerhalb des portablen Betriebs «nicht portabel» ohne Pfad', () => {
    // 4T-001993 (AK4): Die installierte Fassung erfährt keinen Ort; der Dialog
    // bleibt dort unverändert.
    const u = aufbau(NICHT_PORTABEL);
    expect(u.auskunft()).toEqual({ portabel: false, datenOrdner: null });
  });

  it('gibt die Schreib-Probe nicht nach außen', () => {
    // 4T-001993: Der Dialog braucht allein Zustand und Ort; das Feld
    // `beschreibbar` ist eine Angabe des Programmstarts und bleibt dort.
    const u = aufbau(PORTABEL);
    expect(Object.keys(u.auskunft()).sort()).toEqual(['datenOrdner', 'portabel']);
  });
});

describe('app:oeffneDatenOrdner — Öffnen (4T-001993)', () => {
  it('öffnet im portablen Betrieb genau den Daten-Ordner', async () => {
    // 4T-001993 (AK3)
    const u = aufbau(PORTABEL);
    expect(await u.oeffnen()).toEqual({ ok: true });
    expect(u.shell.openPath).toHaveBeenCalledTimes(1);
    expect(u.shell.openPath).toHaveBeenCalledWith(DATEN_ORDNER);
  });

  it('ignoriert einen vom Fenster mitgegebenen Pfad', async () => {
    // 4T-001993: Sicherheits-Zusage des Kanals. Egal was der Anzeige-Prozess
    // schickt — Zeichenkette, Objekt mit Pfad-Feld, mehrere Werte —, geöffnet
    // wird der Daten-Ordner aus der Erkennung und nichts sonst.
    const u = aufbau(PORTABEL);
    await u.oeffnen('C:\\Windows\\System32');
    await u.oeffnen({ path: 'C:\\Users' }, '..\\..');
    expect(u.shell.openPath.mock.calls).toEqual([[DATEN_ORDNER], [DATEN_ORDNER]]);
  });

  it('tut außerhalb des portablen Betriebs nichts und meldet das zurück', async () => {
    // 4T-001993 (AK4): kein Aufruf der Shell, auch nicht mit einem Pfad vom
    // Fenster.
    const u = aufbau(NICHT_PORTABEL);
    expect(await u.oeffnen()).toEqual({ ok: false, error: 'not portable' });
    expect(await u.oeffnen('C:\\Users')).toEqual({ ok: false, error: 'not portable' });
    expect(u.shell.openPath).not.toHaveBeenCalled();
  });

  it('meldet einen Fehlschlag der Shell als Ergebnis statt als Ausnahme', async () => {
    // 4T-001993: shell.openPath meldet einen Fehler als nicht leere
    // Zeichenkette; der Kanal reicht sie im IPC-Muster { ok, error } weiter.
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const u = aufbau(PORTABEL, 'Failed to open path');
      expect(await u.oeffnen()).toEqual({ ok: false, error: 'Failed to open path' });
      expect(warnung).toHaveBeenCalledTimes(1);
    } finally {
      warnung.mockRestore();
    }
  });
});
