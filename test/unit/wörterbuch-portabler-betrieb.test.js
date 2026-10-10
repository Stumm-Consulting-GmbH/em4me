// 4T-001991 (Epic 3E-000188): Die Wörterbuch-Kanäle der Rechtschreibprüfung im
// portablen Betrieb, am ECHTEN Handler (src/main/ipc/dialogs.js).
//
// Anlass ist die Messung am gebauten Programm vom 2026-09-28: «Zum Wörterbuch
// hinzufügen» legte das Wort nicht nur im Daten-Ordner ab, sondern auch im
// Wörterbuch des Windows-Benutzers. Entscheidung des Product Owners vom
// 2026-09-28: Die portable Fassung bietet die Aufnahme nicht an. Die
// Oberfläche blendet sie aus; der Haupt-Prozess führt sie zusätzlich auch dann
// nicht aus, wenn ein Fenster sie verlangt. Dasselbe gilt für das Entfernen,
// weil es laut Schnittstellen-Beschreibung der Laufzeit-Umgebung ebenfalls in
// das Wörterbuch des Betriebssystems schreibt. Das Auflisten bleibt.
//
// Die Sitzung der Laufzeit-Umgebung ist ein Spion, weil die Zusage genau an
// ihrem Aufruf hängt: Portabel wird sie nicht gerufen, nicht portabel wie
// bisher. Einen Schalter, der den portablen Betrieb im Testlauf vortäuscht,
// gibt es nicht; die Auskunft wird hier als Abhängigkeit eingeschoben, in der
// Form, die main.js aus ermittlePortablenBetrieb erhält.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');

const PORTABEL = { portabel: true, datenOrdner: 'D:\\Programme\\EM4me\\Data', beschreibbar: true };
const NICHT_PORTABEL = { portabel: false, datenOrdner: null, beschreibbar: null };

function aufbau(portablerBetrieb, { aufnahme = true, entfernen = true, woerter = [] } = {}) {
  const defaultSession = {
    addWordToSpellCheckerDictionary: vi.fn(() => aufnahme),
    removeWordFromSpellCheckerDictionary: vi.fn(() => entfernen),
    listWordsInSpellCheckerDictionary: vi.fn(async () => woerter),
  };
  const handler = new Map();
  registerDialogsIpc((kanal, fn) => handler.set(kanal, fn), {
    app: {},
    dialog: {},
    shell: {},
    session: { defaultSession },
    senderWindow: () => null,
    tForWindow: (_win, key) => key,
    getStore: () => null,
    portablerBetrieb: Object.freeze(portablerBetrieb),
  });
  return {
    defaultSession,
    aufnehmen: (...args) => handler.get('spellcheck:addWord')({}, ...args),
    entfernen: (...args) => handler.get('spellcheck:removeWord')({}, ...args),
    auflisten: () => handler.get('spellcheck:listWords')({}),
  };
}

describe('spellcheck:addWord im portablen Betrieb (4T-001991)', () => {
  it('ruft die Laufzeit-Umgebung nicht und meldet das zurück', () => {
    const u = aufbau(PORTABEL);
    expect(u.aufnehmen('Probewort')).toEqual({ ok: false, error: 'not portable' });
    expect(u.defaultSession.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
  });

  it('bleibt gesperrt, gleich was das Fenster schickt', () => {
    // Der Riegel steht vor der Prüfung des Worts: Auch ein unbrauchbarer Wert
    // erreicht die Laufzeit-Umgebung nicht, und die Meldung ist dieselbe.
    const u = aufbau(PORTABEL);
    for (const wert of ['Probewort', '', '   ', null, 42, { wort: 'x' }]) {
      expect(u.aufnehmen(wert), JSON.stringify(wert)).toEqual({
        ok: false,
        error: 'not portable',
      });
    }
    expect(u.defaultSession.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
  });
});

describe('spellcheck:addWord außerhalb des portablen Betriebs (4T-001991)', () => {
  it('reicht das Wort wie bisher an die Laufzeit-Umgebung', () => {
    const u = aufbau(NICHT_PORTABEL);
    expect(u.aufnehmen('Probewort')).toEqual({ ok: true });
    expect(u.defaultSession.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(1);
    expect(u.defaultSession.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('Probewort');
  });

  it('meldet eine Ablehnung der Laufzeit-Umgebung', () => {
    const u = aufbau(NICHT_PORTABEL, { aufnahme: false });
    expect(u.aufnehmen('Probewort')).toEqual({ ok: false });
  });

  it('weist ein unbrauchbares Wort ab, ohne die Laufzeit-Umgebung zu rufen', () => {
    const u = aufbau(NICHT_PORTABEL);
    for (const wert of ['', '   ', null, 42]) {
      expect(u.aufnehmen(wert)).toEqual({ ok: false, error: 'invalid word' });
    }
    expect(u.defaultSession.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
  });
});

describe('spellcheck:removeWord (4T-001991)', () => {
  it('ruft im portablen Betrieb die Laufzeit-Umgebung nicht', () => {
    const u = aufbau(PORTABEL);
    expect(u.entfernen('Probewort')).toEqual({ ok: false, error: 'not portable' });
    expect(u.defaultSession.removeWordFromSpellCheckerDictionary).not.toHaveBeenCalled();
  });

  it('entfernt außerhalb des portablen Betriebs wie bisher', () => {
    const u = aufbau(NICHT_PORTABEL);
    expect(u.entfernen('Probewort')).toEqual({ ok: true });
    expect(u.defaultSession.removeWordFromSpellCheckerDictionary).toHaveBeenCalledWith('Probewort');
  });
});

describe('spellcheck:listWords (4T-001991)', () => {
  it('listet in beiden Betriebsarten das Wörterbuch des Programms', async () => {
    // Das Auflisten liest allein das Wörterbuch des Programms, das im
    // portablen Betrieb im Daten-Ordner liegt; es bleibt deshalb erlaubt.
    for (const betrieb of [PORTABEL, NICHT_PORTABEL]) {
      const u = aufbau(betrieb, { woerter: ['Alpha', 'Beta'] });
      expect(await u.auflisten()).toEqual(['Alpha', 'Beta']);
      expect(u.defaultSession.listWordsInSpellCheckerDictionary).toHaveBeenCalledTimes(1);
    }
  });
});
