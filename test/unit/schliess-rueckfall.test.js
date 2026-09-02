// 4T-001213 (Epic 3E-000225): Unit-Tests des Rückfalls im Schließ-Weg
// (src/main/app/schliess-rueckfall.js).
//
// Der Mangel, den der Rückfall behebt: Der Haupt-Prozess hält das Schließen an
// und wartet ohne Frist auf eine Quittung, die nur der Anzeige-Prozess erteilen
// kann. Antwortet der nicht mehr, ist das Fenster konstruktiv unschließbar, und
// das harte Beenden kostet die ungespeicherte Arbeit der **anderen** Fenster.
//
// Geprüft wird die Festlegung, deren stille Rücknahme das Verhalten unbemerkt
// umkehren würde: Gemessen wird die **Stille** des Anzeige-Prozesses, nicht die
// Dauer des Schließ-Vorgangs. Ein langsamer, aber antwortender Prozess und ein
// Anwender, der vor der Nachfrage nach ungespeicherten Inhalten überlegt, dürfen
// die Frist nie reißen — sonst verwirft der Rückfall genau die Arbeit, die er
// schützen soll.
//
// Zeit und alle Außenwirkungen sind injiziert; die Fälle laufen ohne Electron
// und ohne echtes Warten.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  erstelleSchliessRueckfall,
  erstelleErzwungenenSchluss,
  FRIST_MS,
} from '../../src/main/app/schliess-rueckfall.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'src');
const lies = (...teile) => fs.readFileSync(path.join(SRC, ...teile), 'utf8');

// Gestellte Zeit: `vor(ms)` spult vor und feuert dabei jeden fällig gewordenen
// Zeitgeber, wie es die echte Ereignisschleife täte.
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

function baueWache(zusatz = {}) {
  const zeit = baueZeit();
  const abgelaufen = [];
  const zeilen = [];
  const wache = erstelleSchliessRueckfall({
    fristMs: zusatz.fristMs || 20000,
    setTimer: zeit.setTimer,
    clearTimer: zeit.clearTimer,
    jetzt: zeit.jetzt,
    log: (text) => zeilen.push(text),
    beiAblauf: (fensterId, befund) => abgelaufen.push({ fensterId, befund }),
  });
  return { wache, zeit, abgelaufen, zeilen };
}

describe('Frist bei Stille (AK1)', () => {
  it('läuft ab, wenn der Anzeige-Prozess auf die Anfrage nie antwortet', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(7);
    zeit.vor(19999);
    expect(abgelaufen).toHaveLength(0);
    zeit.vor(1);
    expect(abgelaufen).toHaveLength(1);
    expect(abgelaufen[0].fensterId).toBe(7);
  });

  it('protokolliert den Vorfall mit Kontext (AK6)', () => {
    const { wache, zeit, zeilen } = baueWache();
    wache.starte(7);
    zeit.vor(20000);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toContain('[main]');
    expect(zeilen[0]).toContain('Fenster 7');
    expect(zeilen[0]).toContain('20000');
  });

  it('setzt nach dem Ablauf keine neue Frist — der Hinweis löst nicht zweimal aus', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(7);
    zeit.vor(20000);
    zeit.vor(200000);
    expect(abgelaufen).toHaveLength(1);
    expect(zeit.offeneTimer()).toBe(0);
  });

  it('trägt die vom Product Owner entschiedene Vorgabe von 20 Sekunden', () => {
    // Die Zahl steht im Modul und nicht in der Verdrahtung: Sie ist eine
    // Entscheidung (2026-08-26) und kein Aufruf-Parameter, den eine Stelle
    // unbemerkt anders setzt.
    expect(FRIST_MS).toBe(20000);
    expect(erstelleSchliessRueckfall({}).fristMs).toBe(20000);
  });
});

describe('Der langsame Anzeige-Prozess reißt die Frist nie (AK2)', () => {
  it('jeder abgeschlossene Aufruf ist ein Lebenszeichen und setzt sie zurück', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(7);
    // Der Anzeige-Prozess arbeitet und meldet sich alle 15 Sekunden.
    for (let i = 0; i < 10; i++) {
      zeit.vor(15000);
      wache.aufrufBegonnen(7);
      wache.aufrufBeendet(7);
    }
    expect(abgelaufen).toHaveLength(0);
    // Erst danach verstummt er.
    zeit.vor(20000);
    expect(abgelaufen).toHaveLength(1);
  });

  it('ruht, solange ein Aufruf läuft — das deckt die offene Speichern-Nachfrage', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(7);
    // Die Nachfrage nach ungespeicherten Inhalten zeigt der Haupt-Prozess; der
    // Anwender überlegt eine Viertelstunde. Sein Fenster darf ihm dabei nicht
    // unter der offenen Frage weggerissen werden.
    wache.aufrufBegonnen(7);
    zeit.vor(900000);
    expect(abgelaufen).toHaveLength(0);
    wache.aufrufBeendet(7);
    // Nach der Antwort läuft die Frist wieder, und zwar von vorn.
    zeit.vor(19999);
    expect(abgelaufen).toHaveLength(0);
    zeit.vor(1);
    expect(abgelaufen).toHaveLength(1);
  });

  it('ruht, bis der letzte von mehreren gleichzeitigen Aufrufen fertig ist', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(7);
    wache.aufrufBegonnen(7);
    wache.aufrufBegonnen(7);
    wache.aufrufBeendet(7);
    zeit.vor(100000);
    expect(abgelaufen).toHaveLength(0);
    wache.aufrufBeendet(7);
    zeit.vor(20000);
    expect(abgelaufen).toHaveLength(1);
  });

  it('zählt einen Aufruf mit, der vor der Schließ-Anfrage begann', () => {
    // Sonst liefe der Zähler ins Minus und die Frist begänne nie.
    const { wache, zeit, abgelaufen } = baueWache();
    wache.aufrufBegonnen(7);
    wache.starte(7);
    zeit.vor(100000);
    expect(abgelaufen).toHaveLength(0);
    wache.aufrufBeendet(7);
    zeit.vor(20000);
    expect(abgelaufen).toHaveLength(1);
  });
});

describe('Ende der Wache', () => {
  it('endet mit der Quittung und läuft danach nicht mehr ab', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(7);
    zeit.vor(10000);
    wache.beende(7);
    zeit.vor(100000);
    expect(abgelaufen).toHaveLength(0);
    expect(wache.istAktiv(7)).toBe(false);
    expect(zeit.offeneTimer()).toBe(0);
  });

  it('ist je Fenster getrennt: ein stummes Fenster reißt kein gesundes mit', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.starte(1);
    wache.starte(2);
    // Fenster 2 antwortet, Fenster 1 nicht.
    zeit.vor(15000);
    wache.aufrufBegonnen(2);
    wache.aufrufBeendet(2);
    zeit.vor(5000);
    expect(abgelaufen.map((a) => a.fensterId)).toEqual([1]);
    expect(wache.istAktiv(2)).toBe(true);
  });

  it('ein Lebenszeichen ohne offene Wache kostet nichts', () => {
    const { wache, zeit, abgelaufen } = baueWache();
    wache.aufrufBegonnen(9);
    wache.aufrufBeendet(9);
    zeit.vor(100000);
    expect(abgelaufen).toHaveLength(0);
    expect(wache.istAktiv(9)).toBe(false);
  });
});

describe('Handlung nach Ablauf: Hinweis mit Wahl (Entscheidung vom 2026-08-26)', () => {
  function baueSchluss(zusatz = {}) {
    const { wache, zeit, abgelaufen } = baueWache();
    const win = zusatz.win || { close: vi.fn(), isDestroyed: () => false, webContents: { id: 7 } };
    const quittiert = [];
    const frage = zusatz.frage || vi.fn(async () => true);
    const handle = erstelleErzwungenenSchluss({
      wache,
      fensterVon: (id) => (zusatz.ohneFenster ? null : id === 7 ? win : null),
      quittiere: (w) => quittiert.push(w),
      frage,
      log: () => {},
    });
    return { wache, zeit, abgelaufen, win, quittiert, frage, handle };
  }

  it('schließt das Fenster über den regulären Quittungs-Weg (AK1, AK4)', async () => {
    const { handle, win, quittiert, wache } = baueSchluss();
    wache.starte(7);
    const ausgang = await handle(7, { stilleMs: 20000 });
    expect(ausgang).toBe('geschlossen');
    // Quittung vor close(): nur so nimmt der close-Handler den quittierten
    // Zweig, und nur dort schreibt er den Sitzungs-Stand (Entscheidung E3).
    expect(quittiert).toEqual([win]);
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(wache.istAktiv(7)).toBe(false);
  });

  it('nennt dem Anwender die Dauer der Stille in Sekunden (AK3)', async () => {
    const frage = vi.fn(async () => true);
    const { handle } = baueSchluss({ frage });
    await handle(7, { stilleMs: 20000 });
    expect(frage.mock.calls[0][1]).toBe(20);
  });

  it('wartet weiter, wenn der Anwender es wählt, und schließt nichts', async () => {
    const frage = vi.fn(async () => false);
    const { handle, win, quittiert, wache, zeit, abgelaufen } = baueSchluss({ frage });
    wache.starte(7);
    const ausgang = await handle(7, { stilleMs: 20000 });
    expect(ausgang).toBe('warten');
    expect(win.close).not.toHaveBeenCalled();
    expect(quittiert).toEqual([]);
    // Die Frist beginnt von vorn, statt sofort erneut auszulösen.
    expect(wache.istAktiv(7)).toBe(true);
    zeit.vor(20000);
    expect(abgelaufen).toHaveLength(1);
  });

  it('schließt bei gescheitertem Hinweis, statt wirkungslos zu bleiben', async () => {
    const frage = vi.fn(async () => {
      throw new Error('Dialog kaputt');
    });
    const { handle, win } = baueSchluss({ frage });
    const ausgang = await handle(7, { stilleMs: 20000 });
    expect(ausgang).toBe('geschlossen');
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('fragt nicht nach, wenn das Fenster inzwischen fort ist', async () => {
    const frage = vi.fn(async () => true);
    const { handle, wache } = baueSchluss({ frage, ohneFenster: true });
    wache.starte(7);
    const ausgang = await handle(7, { stilleMs: 20000 });
    expect(ausgang).toBe('fort');
    expect(frage).not.toHaveBeenCalled();
    expect(wache.istAktiv(7)).toBe(false);
  });

  it('ein Ablauf-Fehler reißt die Wache nicht mit', () => {
    const zeit = baueZeit();
    const zeilen = [];
    const wache = erstelleSchliessRueckfall({
      setTimer: zeit.setTimer,
      clearTimer: zeit.clearTimer,
      jetzt: zeit.jetzt,
      log: (t) => zeilen.push(t),
      beiAblauf: () => {
        throw new Error('Rueckfall kaputt');
      },
    });
    wache.starte(7);
    expect(() => zeit.vor(20000)).not.toThrow();
    expect(zeilen.some((z) => z.includes('gescheitert'))).toBe(true);
  });
});

describe('Verdrahtung an den drei Nähten', () => {
  // Ohne diese Prüfungen bliebe das Modul korrekt und trotzdem wirkungslos:
  // Der Rückfall wirkt nur, wenn ihn der Schließ-Weg startet, die Quittung ihn
  // beendet und jeder IPC-Aufruf ihn füttert.
  it('der close-Handler startet die Wache, der closed-Handler beendet sie', () => {
    const quelle = lies('main', 'window-manager.js');
    expect(quelle).toContain('schliessRueckfall.starte(id)');
    expect(quelle).toContain('schliessRueckfall.beende(id)');
    // Die Wache startet im selben Zweig, der das Schließen anhält.
    const zweig = quelle.slice(quelle.indexOf('if (!confirmedClosings.has(win))'));
    expect(zweig.slice(0, 400)).toContain('schliessRueckfall.starte(id)');
  });

  it('Quittung und Abbruch beenden die Wache', () => {
    const quelle = lies('main', 'ipc', 'windows.js');
    const quittung = quelle.slice(quelle.indexOf("handle('window:confirmClose'"));
    expect(quittung.slice(0, 400)).toContain('schliessRueckfall.beende');
    const abbruch = quelle.slice(quelle.indexOf("handle('window:cancelClose'"));
    expect(abbruch.slice(0, 400)).toContain('schliessRueckfall.beende');
  });

  it('die eine Registrier-Funktion meldet Beginn und Ende jedes Aufrufs', () => {
    const quelle = lies('main', 'main.js');
    expect(quelle).toContain('schliessRueckfall.aufrufBegonnen(fensterId)');
    expect(quelle).toContain('schliessRueckfall.aufrufBeendet(fensterId)');
    // Das Ende läuft über finally: Ein gescheiterter Handler darf die Frist
    // nicht dauerhaft aussetzen, sonst wäre die Wache nach einem Fehler blind.
    expect(quelle).toContain('} finally {');
    // Kein Handler-Modul darf am Adapter vorbei registrieren.
    expect(quelle).not.toContain('(kanal, fn) => ipcMain.handle(kanal, fn)');
  });

  it('die Meldung liegt in allen fünf Sprachfassungen vor (AK3)', () => {
    const keys = [
      'window.unresponsiveTitle',
      'window.unresponsiveMessage',
      'window.unresponsiveDetail',
      'window.unresponsiveClose',
      'window.unresponsiveWait',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const daten = JSON.parse(lies('i18n', `${sprache}.json`));
      for (const key of keys) {
        expect(daten[key], `${key} fehlt in ${sprache}`).toBeTruthy();
      }
      expect(daten['window.unresponsiveMessage']).toContain('{n}');
    }
  });
});
