// 4T-000947 (Story 4S-000005, AK6): Eigene Schreibvorgaenge von fremden trennen.
//
// Die Faelle laufen bewusst OHNE Wartezeit: Die Zusicherung lautet, dass die
// Zugehoerigkeit am Inhalt haengt und nicht an der Zeit. Ein Test, der eine
// Frist abwartet, wuerde genau die Eigenschaft pruefen, die hier verschwinden
// soll — und unter Last wieder wackeln (Anlass war ein lastbedingt roter Fall).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_EINTRAEGE,
  merke,
  vergiss,
  istEigenerStand,
  _anzahl,
  _hat,
  _leeren,
} from '../../src/main/documents/self-write.js';

let dir;

beforeEach(() => {
  _leeren();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selbst-schreib-'));
});

afterEach(() => {
  _leeren();
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle: Temp-Rest ist unkritisch */
  }
});

function datei(name, inhalt) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

describe('selbst-schreib: Zugehoerigkeit haengt am Inhalt', () => {
  it('erkennt den eigenen Stand wieder', async () => {
    const p = datei('a.md', '# Eigen\n');
    merke(p, '# Eigen\n');
    expect(await istEigenerStand(p)).toBe(true);
  });

  // Der Kern von AK6: Eine fremde Aenderung unmittelbar nach dem eigenen
  // Schreibvorgang muss durchkommen, sonst verschluckt die Unterdrueckung
  // genau den Fall, den der Konflikt-Dialog abfangen soll.
  it('laesst eine fremde Aenderung im selben Augenblick durch', async () => {
    const p = datei('b.md', '# Eigen\n');
    merke(p, '# Eigen\n');
    fs.writeFileSync(p, '# Fremd\n', 'utf8');
    expect(await istEigenerStand(p)).toBe(false);
  });

  // Der eigentliche Fix: Frueher verfiel der Eintrag nach 1500 ms, und eine
  // spaeter eintreffende Meldung des EIGENEN Schreibvorgangs galt als fremd.
  //
  // Die Uhr wird vorgerueckt statt abgewartet: Das laesst jeden Zeitgeber
  // ablaufen, den es gaebe, und kostet keine Sekunde Laufzeit. Mit der
  // frueheren Frist ist dieser Fall rot (Probe am 2026-08-10 gefahren), ohne
  // Zeitgeber gruen.
  it('vergisst den eigenen Stand auch nach langer Zeit nicht', async () => {
    const p = datei('c.md', '# Eigen\n');
    vi.useFakeTimers();
    try {
      merke(p, '# Eigen\n');
      expect(_anzahl()).toBe(1);
      vi.advanceTimersByTime(60_000);
      expect(_anzahl()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect(await istEigenerStand(p)).toBe(true);
  });

  it('meldet eine unlesbare Datei als fremd', async () => {
    const p = path.join(dir, 'weg.md');
    merke(p, '# Eigen\n');
    expect(await istEigenerStand(p)).toBe(false);
  });

  it('kennt keinen Stand fuer einen nie geschriebenen Pfad', async () => {
    const p = datei('d.md', '# Fremd\n');
    expect(await istEigenerStand(p)).toBe(false);
  });

  it('ersetzt den Eintrag beim naechsten eigenen Schreibvorgang', async () => {
    const p = datei('e.md', '# Erst\n');
    merke(p, '# Erst\n');
    fs.writeFileSync(p, '# Zweit\n', 'utf8');
    merke(p, '# Zweit\n');
    expect(_anzahl()).toBe(1);
    expect(await istEigenerStand(p)).toBe(true);
  });
});

describe('selbst-schreib: kein wachsender Bestand', () => {
  it('vergisst den Eintrag mit dem Ende der Beobachtung', async () => {
    const p = datei('f.md', '# Eigen\n');
    merke(p, '# Eigen\n');
    vergiss(p);
    expect(_anzahl()).toBe(0);
    expect(await istEigenerStand(p)).toBe(false);
  });

  // Pfade, deren Beobachtung nie beginnt (etwa die Begleitdateien der
  // Historie), erreichen kein vergiss(). Fuer sie greift die Obergrenze.
  it('haelt die Obergrenze ein und wirft die aeltesten Eintraege ab', () => {
    for (let i = 0; i < MAX_EINTRAEGE + 25; i++) merke(`X:/pfad/${i}.mdd`, `Inhalt ${i}`);
    expect(_anzahl()).toBe(MAX_EINTRAEGE);
  });

  it('schiebt einen erneut geschriebenen Pfad ans Ende der Verfalls-Reihenfolge', () => {
    merke('X:/pfad/alt.mdd', 'eins');
    for (let i = 0; i < MAX_EINTRAEGE - 1; i++) merke(`X:/pfad/${i}.mdd`, `Inhalt ${i}`);
    // Erneut geschrieben: der Pfad darf beim naechsten Ueberlauf nicht als
    // aeltester gelten, denn er ist gerade der aktuellste.
    merke('X:/pfad/alt.mdd', 'zwei');
    merke('X:/pfad/neu.mdd', 'drei');
    expect(_anzahl()).toBe(MAX_EINTRAEGE);
    // Gefallen ist der aelteste Fremd-Pfad, nicht der erneuerte.
    expect(_hat('X:/pfad/0.mdd')).toBe(false);
    expect(_hat('X:/pfad/alt.mdd')).toBe(true);
    expect(_hat('X:/pfad/neu.mdd')).toBe(true);
  });
});
