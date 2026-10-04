// 4T-001813 (Epic 3E-000156): Prüffälle des Bausteins für den Zugriff der
// Ablauf-Prüfungen auf den Hauptprozess (`test/e2e/helpers/haupt-zugriff.js`).
//
// Der Baustein unterscheidet Befehl und Abfrage, weil das Fehlerbild «Execution
// context was destroyed» gemessen nur die Rückmeldung verliert, nicht die
// Ausführung (Ursache im Kopf des Helfers). Geprüft wird hier sein Verhalten an
// einem nachgebildeten Anwendungs-Objekt, ohne Electron: Ein Lauf der echten
// Konstellation kostet Sekunden und trifft das Fehlerbild nur in einem Teil
// der Durchgänge; die Entscheidungs-Logik selbst ist deterministisch.
//
// Eingabe dieser Prüfdatei: der Helfer selbst.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  hauptSenden,
  hauptLesen,
  LESE_HOECHSTZAHL,
  SPUR_PRAEFIX,
} = require('../e2e/helpers/haupt-zugriff.js');

// Die Meldung, wie Playwright sie nach dem Umschreiben von «Promise was
// collected» wirft (rewriteError in playwright-core).
const VERLOREN =
  'electronApplication.evaluate: Execution context was destroyed, most likely because of a navigation';

// Ein Anwendungs-Objekt, dessen evaluate der Reihe nach die vorgegebenen
// Antworten liefert: ein Error-Objekt wird geworfen, alles andere zurückgegeben.
function appMit(antworten) {
  const evaluate = vi.fn(async () => {
    const naechste = antworten.shift();
    if (naechste instanceof Error) throw naechste;
    return naechste;
  });
  return { evaluate };
}

// 4T-002061: Dieselbe Meldung über einen Fenster-Griff aus
// app.browserWindow(page). Das Präfix ist hier angenommen, nicht gemessen; das
// Erkennungsmuster des Bausteins hängt nicht an ihm.
const VERLOREN_GRIFF =
  'jSHandle.evaluate: Execution context was destroyed, most likely because of a navigation';

let ausgabe;
function spurZeilen() {
  return ausgabe.mock.calls.map((a) => a.join(' ')).filter((z) => z.startsWith(SPUR_PRAEFIX));
}

afterEach(() => {
  if (ausgabe) ausgabe.mockRestore();
  ausgabe = undefined;
});

function spurBeobachten() {
  ausgabe = vi.spyOn(console, 'log').mockImplementation(() => {});
}

describe('hauptSenden: Befehl ohne gebrauchte Rückgabe', () => {
  it('reicht Rumpf und Argument unverändert an app.evaluate', async () => {
    spurBeobachten();
    const app = appMit([42]);
    const rumpf = () => 1;
    expect(await hauptSenden(app, rumpf, { a: 1 })).toBeUndefined();
    expect(app.evaluate).toHaveBeenCalledTimes(1);
    expect(app.evaluate).toHaveBeenCalledWith(rumpf, { a: 1 });
    // Im grünen Normalfall bleibt die Ausgabe leer.
    expect(spurZeilen()).toEqual([]);
  });

  it('wertet genau dieses Fehlerbild als abgesetzt, ohne zweiten Aufruf', async () => {
    spurBeobachten();
    const app = appMit([new Error(VERLOREN), 'nie abgeholt']);
    expect(await hauptSenden(app, () => 1)).toBeUndefined();
    expect(app.evaluate).toHaveBeenCalledTimes(1);
    expect(spurZeilen()).toHaveLength(1);
    expect(spurZeilen()[0]).toContain('Senden');
  });

  it('wirft jeden anderen Fehler unverändert weiter', async () => {
    spurBeobachten();
    const fremd = new Error('Target page, context or browser has been closed');
    const app = appMit([fremd]);
    await expect(hauptSenden(app, () => 1)).rejects.toBe(fremd);
    expect(app.evaluate).toHaveBeenCalledTimes(1);
    expect(spurZeilen()).toEqual([]);
  });

  it('nimmt einen Fenster-Griff als Ziel und setzt ab, ohne zweiten Aufruf', async () => {
    spurBeobachten();
    const griff = appMit([new Error(VERLOREN_GRIFF), 'nie abgeholt']);
    const rumpf = (w) => w.webContents.send('menu:newWindow');
    expect(await hauptSenden(griff, rumpf)).toBeUndefined();
    expect(griff.evaluate).toHaveBeenCalledTimes(1);
    expect(griff.evaluate).toHaveBeenCalledWith(rumpf, undefined);
    expect(spurZeilen()).toHaveLength(1);
  });
});

describe('hauptLesen: Abfrage ohne Nebenwirkung', () => {
  it('liefert die Rückgabe des Rumpfes', async () => {
    spurBeobachten();
    const app = appMit([['eins', 'zwei']]);
    expect(await hauptLesen(app, () => 1, 'x')).toEqual(['eins', 'zwei']);
    expect(app.evaluate).toHaveBeenCalledTimes(1);
    expect(spurZeilen()).toEqual([]);
  });

  it('stellt die Abfrage bei diesem Fehlerbild erneut, bis sie ankommt', async () => {
    spurBeobachten();
    const rumpf = () => 1;
    const app = appMit([new Error(VERLOREN), new Error(VERLOREN), 'angekommen']);
    expect(await hauptLesen(app, rumpf, 7)).toBe('angekommen');
    expect(app.evaluate).toHaveBeenCalledTimes(3);
    // Jeder Versuch mit demselben Rumpf und Argument.
    for (const aufruf of app.evaluate.mock.calls) expect(aufruf).toEqual([rumpf, 7]);
    expect(spurZeilen()).toHaveLength(2);
    expect(spurZeilen()[0]).toContain('Lesen');
  });

  it('gibt nach der Höchstzahl auf und wirft den letzten Fehler mit Hinweis', async () => {
    spurBeobachten();
    expect(LESE_HOECHSTZAHL).toBe(10);
    const fehler = Array.from({ length: LESE_HOECHSTZAHL + 1 }, () => new Error(VERLOREN));
    const letzter = fehler[LESE_HOECHSTZAHL - 1];
    const app = appMit(fehler);
    const wurf = await hauptLesen(app, () => 1).catch((e) => e);
    expect(app.evaluate).toHaveBeenCalledTimes(LESE_HOECHSTZAHL);
    expect(wurf).toBeInstanceOf(Error);
    expect(wurf.cause).toBe(letzter);
    // Der Fingerabdruck bleibt in der Meldung, damit eine Quarantäne-Suche
    // ihn weiter findet; dazu der Hinweis auf die gemessene Ursache.
    expect(wurf.message).toContain('Execution context was destroyed');
    expect(wurf.message).toContain('Promise was collected');
    expect(wurf.message).toContain('haupt-zugriff.js');
    expect(spurZeilen()).toHaveLength(LESE_HOECHSTZAHL);
  });

  it('wirft jeden anderen Fehler sofort und unverändert weiter', async () => {
    spurBeobachten();
    const fremd = new TypeError('Cannot read properties of undefined');
    const app = appMit([new Error(VERLOREN), fremd, 'nie abgeholt']);
    await expect(hauptLesen(app, () => 1)).rejects.toBe(fremd);
    expect(app.evaluate).toHaveBeenCalledTimes(2);
  });

  it('nimmt einen Fenster-Griff als Ziel und stellt die Abfrage erneut', async () => {
    spurBeobachten();
    const griff = appMit([new Error(VERLOREN_GRIFF), 7]);
    const rumpf = (w) => w.id;
    expect(await hauptLesen(griff, rumpf)).toBe(7);
    expect(griff.evaluate).toHaveBeenCalledTimes(2);
    for (const aufruf of griff.evaluate.mock.calls) expect(aufruf).toEqual([rumpf, undefined]);
    expect(spurZeilen()).toHaveLength(1);
  });
});
