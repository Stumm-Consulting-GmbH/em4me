// 4T-001214 (Epic 3E-000225): Unit-Tests der Ausfall-Erkennung des
// Anzeige-Prozesses (src/main/app/anzeige-ausfall.js).
//
// Die Lücke, die sie schließt: Die bestehenden Auffang-Ebenen brauchen einen
// lebenden Ausführungs-Kontext. Fällt der Anzeige-Prozess selbst aus, ist
// niemand mehr da, der protokolliert, und der Anwender sitzt vor einem leeren
// Fenster.
//
// Geprüft werden die Festlegungen, deren stille Rücknahme das Verhalten
// unbemerkt umkehren würde:
//
//   1. Es sind ZWEI Fälle. Der verschwundene Prozess wird sofort behandelt, der
//      nicht antwortende erst nach einer Frist und nur, wenn er nicht
//      zurückkommt. Ohne diese Trennung meldet jeder längere Rechenvorgang
//      einen Fehler.
//   2. `clean-exit` ist kein Ausfall. Ohne den Filter erschiene bei jedem
//      gewöhnlichen Schließen eine Fehlermeldung.
//   3. Läuft bereits eine Schließ-Anfrage, schweigt diese Ebene: Sonst stünden
//      im Beenden-Fall zwei Dialoge für dasselbe Fenster übereinander.
//   4. Der zweite Ausfall desselben Fensters bietet kein Neuladen mehr
//      (Entscheidung N2 vom 2026-08-26, Zusatz gegen die Endlosschleife).
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  erstelleAnzeigeAusfall,
  STILLE_FRIST_MS,
  WIEDERHOLUNG_MS,
  HARMLOS,
} from '../../src/main/app/anzeige-ausfall.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'src');
const lies = (...teile) => fs.readFileSync(path.join(SRC, ...teile), 'utf8');

// Lässt die anstehenden Mikro-Aufgaben durchlaufen; die Behandlung wartet
// intern auf die Meldung.
const tick = () => new Promise((r) => setTimeout(r, 0));

function baueZeit() {
  let jetzt = 0;
  let naechste = 1;
  const timer = new Map();
  return {
    jetzt: () => jetzt,
    setTimer: (fn, ms) => {
      const id = naechste++;
      timer.set(id, { faellig: jetzt + ms, fn });
      return id;
    },
    clearTimer: (id) => timer.delete(id),
    vor(ms) {
      jetzt += ms;
      for (const [id, t] of [...timer]) {
        if (t.faellig <= jetzt) {
          timer.delete(id);
          t.fn();
        }
      }
    },
    offeneTimer: () => timer.size,
  };
}

function baueFenster(id = 7) {
  return {
    webContents: { id, reload: vi.fn() },
    close: vi.fn(),
    isDestroyed: () => false,
  };
}

function baue(zusatz = {}) {
  const zeit = baueZeit();
  const zeilen = [];
  const geladen = [];
  const geschlossen = [];
  const gefragt = [];
  const frage =
    zusatz.frage ||
    vi.fn(async (win, lage) => {
      gefragt.push(lage);
      return zusatz.wahl || 'neuLaden';
    });
  const ausfall = erstelleAnzeigeAusfall({
    setTimer: zeit.setTimer,
    clearTimer: zeit.clearTimer,
    jetzt: zeit.jetzt,
    log: (t) => zeilen.push(t),
    schliessenLaeuft: zusatz.schliessenLaeuft || (() => false),
    frage,
    ladeNeu: (win) => geladen.push(win),
    schliesse: (win) => geschlossen.push(win),
  });
  return { ausfall, zeit, zeilen, geladen, geschlossen, gefragt, frage };
}

describe('Der verschwundene Prozess (AK1)', () => {
  it('wird mit Grund und Beendigungs-Code protokolliert', async () => {
    const { ausfall, zeilen } = baue();
    await ausfall.prozessFort(baueFenster(), 7, { reason: 'oom', exitCode: 5 });
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toContain('[main]');
    expect(zeilen[0]).toContain('Fenster 7');
    expect(zeilen[0]).toContain('oom');
    expect(zeilen[0]).toContain('Code 5');
  });

  it('lädt die Ansicht neu, wenn der Anwender das wählt (AK3)', async () => {
    const { ausfall, geladen, geschlossen } = baue({ wahl: 'neuLaden' });
    const win = baueFenster();
    const ausgang = await ausfall.prozessFort(win, 7, { reason: 'crashed' });
    expect(ausgang).toBe('neuGeladen');
    expect(geladen).toEqual([win]);
    expect(geschlossen).toEqual([]);
  });

  it('schließt das Fenster, wenn der Anwender das wählt', async () => {
    const { ausfall, geladen, geschlossen } = baue({ wahl: 'schliessen' });
    const win = baueFenster();
    const ausgang = await ausfall.prozessFort(win, 7, { reason: 'crashed' });
    expect(ausgang).toBe('geschlossen');
    expect(geschlossen).toEqual([win]);
    expect(geladen).toEqual([]);
  });

  it('schweigt bei clean-exit — das ist das gewöhnliche Schließen', async () => {
    const { ausfall, zeilen, frage } = baue();
    const ausgang = await ausfall.prozessFort(baueFenster(), 7, { reason: HARMLOS });
    expect(ausgang).toBe('harmlos');
    expect(zeilen).toEqual([]);
    expect(frage).not.toHaveBeenCalled();
  });

  it('schweigt, solange der Schließ-Rückfall für dieses Fenster wacht', async () => {
    const { ausfall, zeilen, frage } = baue({ schliessenLaeuft: (id) => id === 7 });
    const ausgang = await ausfall.prozessFort(baueFenster(), 7, { reason: 'crashed' });
    expect(ausgang).toBe('schliessen laeuft');
    expect(zeilen).toEqual([]);
    expect(frage).not.toHaveBeenCalled();
  });

  it('meldet nichts über ein Fenster, das schon fort ist', async () => {
    const { ausfall, frage } = baue();
    const win = { ...baueFenster(), isDestroyed: () => true };
    expect(await ausfall.prozessFort(win, 7, { reason: 'crashed' })).toBe('fort');
    expect(frage).not.toHaveBeenCalled();
  });

  it('schließt bei gescheiterter Meldung, statt ungefragt neu zu laden', async () => {
    const frage = vi.fn(async () => {
      throw new Error('Dialog kaputt');
    });
    const { ausfall, geladen, geschlossen, zeilen } = baue({ frage });
    const win = baueFenster();
    expect(await ausfall.prozessFort(win, 7, { reason: 'crashed' })).toBe('geschlossen');
    expect(geladen).toEqual([]);
    expect(geschlossen).toEqual([win]);
    expect(zeilen.some((z) => z.includes('gescheitert'))).toBe(true);
  });
});

describe('Der nicht antwortende Prozess', () => {
  it('wird nicht sofort gemeldet, sondern erst nach der Frist', async () => {
    const { ausfall, zeit, zeilen, frage } = baue();
    ausfall.antwortetNicht(baueFenster(), 7);
    zeit.vor(29999);
    expect(zeilen).toEqual([]);
    expect(frage).not.toHaveBeenCalled();
    zeit.vor(1);
    await tick();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toContain('antwortet nicht');
    expect(zeilen[0]).toContain('ohne Antwort seit 30000 ms');
  });

  it('verstummt, wenn der Prozess zurückkommt', async () => {
    const { ausfall, zeit, zeilen, frage } = baue();
    ausfall.antwortetNicht(baueFenster(), 7);
    zeit.vor(20000);
    ausfall.antwortetWieder(7);
    zeit.vor(100000);
    await tick();
    expect(zeilen).toEqual([]);
    expect(frage).not.toHaveBeenCalled();
    expect(zeit.offeneTimer()).toBe(0);
  });

  it('zieht bei mehrfachem Melden nur eine Frist auf', () => {
    const { ausfall, zeit } = baue();
    const win = baueFenster();
    ausfall.antwortetNicht(win, 7);
    ausfall.antwortetNicht(win, 7);
    ausfall.antwortetNicht(win, 7);
    expect(zeit.offeneTimer()).toBe(1);
  });

  it('schweigt bei Ablauf, wenn inzwischen eine Schließ-Anfrage läuft', async () => {
    let schliesst = false;
    const { ausfall, zeit, zeilen } = baue({ schliessenLaeuft: () => schliesst });
    ausfall.antwortetNicht(baueFenster(), 7);
    schliesst = true;
    zeit.vor(30000);
    await tick();
    expect(zeilen).toEqual([]);
  });

  it('vergisst mit dem Fenster auch seine Frist', async () => {
    const { ausfall, zeit, zeilen } = baue();
    ausfall.antwortetNicht(baueFenster(), 7);
    ausfall.vergiss(7);
    zeit.vor(100000);
    await tick();
    expect(zeilen).toEqual([]);
    expect(zeit.offeneTimer()).toBe(0);
  });
});

describe('Der zweite Ausfall desselben Fensters (Zusatz zu N2)', () => {
  it('bietet kein Neuladen mehr an und schließt', async () => {
    const { ausfall, zeit, gefragt, geladen, geschlossen, zeilen } = baue({ wahl: 'neuLaden' });
    const win = baueFenster();
    await ausfall.prozessFort(win, 7, { reason: 'crashed' });
    expect(gefragt[0].wiederholung).toBe(false);
    expect(geladen).toHaveLength(1);

    zeit.vor(60000);
    const ausgang = await ausfall.prozessFort(win, 7, { reason: 'crashed' });
    expect(gefragt[1].wiederholung).toBe(true);
    expect(ausgang).toBe('geschlossen');
    expect(geladen).toHaveLength(1);
    expect(geschlossen).toEqual([win]);
    expect(zeilen[1]).toContain('Wiederholung');
  });

  it('lädt nach Ablauf der Wiederholungs-Spanne wieder neu', async () => {
    const { ausfall, zeit, geladen } = baue({ wahl: 'neuLaden' });
    const win = baueFenster();
    await ausfall.prozessFort(win, 7, { reason: 'crashed' });
    zeit.vor(WIEDERHOLUNG_MS + 1);
    await ausfall.prozessFort(win, 7, { reason: 'crashed' });
    expect(geladen).toHaveLength(2);
  });

  it('zählt je Fenster getrennt', async () => {
    const { ausfall, geladen } = baue({ wahl: 'neuLaden' });
    await ausfall.prozessFort(baueFenster(7), 7, { reason: 'crashed' });
    await ausfall.prozessFort(baueFenster(8), 8, { reason: 'crashed' });
    expect(geladen).toHaveLength(2);
  });

  it('trägt die Vorgabe-Werte der Entscheidung', () => {
    expect(STILLE_FRIST_MS).toBe(30000);
    expect(WIEDERHOLUNG_MS).toBe(120000);
    expect(HARMLOS).toBe('clean-exit');
  });
});

describe('Verdrahtung an den Plattform-Ereignissen', () => {
  // Ohne diese Prüfungen bliebe das Modul korrekt und trotzdem wirkungslos.
  it('beide Ereignis-Arten sind registriert', () => {
    const quelle = lies('main', 'main.js');
    expect(quelle).toContain("app.on('render-process-gone'");
    expect(quelle).toContain("win.on('unresponsive'");
    expect(quelle).toContain("win.on('responsive'");
    // Die Fenster-Haken hängen an browser-window-created und nicht in der
    // Fenster-Verwaltung: Die Datei steht an ihrem Größen-Budget (3E-000228).
    expect(quelle).toContain("app.on('browser-window-created'");
  });

  it('die Erkennung ist mit dem Schließ-Rückfall gekoppelt', () => {
    const quelle = lies('main', 'app', 'wiring.js');
    expect(quelle).toContain('schliessRueckfall.istAktiv');
    expect(quelle).toContain('erstelleAnzeigeAusfall');
    // Geschlossen wird über den regulären Quittungs-Weg, nicht per destroy():
    // nur so schreibt der close-Handler den Sitzungs-Stand.
    expect(quelle).not.toContain('win.destroy()');
  });

  it('die Meldung liegt in allen fünf Sprachfassungen vor (AK2)', () => {
    const keys = [
      'window.crashTitle',
      'window.crashMessage',
      'window.crashDetail',
      'window.crashRepeatDetail',
      'window.crashReload',
      'window.crashClose',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const daten = JSON.parse(lies('i18n', `${sprache}.json`));
      for (const key of keys) {
        expect(daten[key], `${key} fehlt in ${sprache}`).toBeTruthy();
      }
    }
  });
});
