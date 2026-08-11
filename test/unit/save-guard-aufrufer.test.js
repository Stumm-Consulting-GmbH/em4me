// 4T-0945 (Story S-0786): Waechter ueber die Schreibwege des Renderers.
//
// Der Vertrag von file:save ist rueckwaertsvertraeglich: Ohne `expected`
// schreibt der Haupt-Prozess wie zuvor. Das haelt Aufrufer entkoppelt, macht
// aber ein Vergessen unsichtbar — ein neuer Schreibweg ohne Erwartung waere
// still ungeschuetzt und faellt erst auf, wenn jemandem Arbeit verloren geht.
// Dieser Waechter macht das Vergessen sichtbar (Muster des Paritaets-Waechters
// fuer Sidebar-Panels).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDERER = path.join(WURZEL, 'src', 'renderer');

// Bewusst leer: Jeder heutige Schreibweg fuehrt einen Stand mit. Ein Eintrag
// hier braucht die Begruendung daneben, warum dieser Weg ohne Stand-Pruefung
// auskommt.
const AUSNAHMEN = [];

function jsDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...jsDateien(voll));
    else if (eintrag.name.endsWith('.js')) gefunden.push(voll);
  }
  return gefunden;
}

// Argumentliste eines Aufrufs ab der oeffnenden Klammer, mit Klammer-Zaehler
// statt Regex: Ein Aufruf enthaelt selbst Klammern und Objekt-Literale.
function argumentListe(text, abIndex) {
  let tiefe = 0;
  for (let i = abIndex; i < text.length; i++) {
    const z = text[i];
    if (z === '(') tiefe += 1;
    else if (z === ')') {
      tiefe -= 1;
      if (tiefe === 0) return text.slice(abIndex + 1, i);
    }
  }
  return text.slice(abIndex);
}

describe('save-guard: jeder Schreibweg des Renderers fuehrt einen Stand mit', () => {
  it('kein api.saveFile-Aufruf ohne expected oder force', () => {
    const ohneStand = [];
    for (const datei of jsDateien(RENDERER)) {
      const text = fs.readFileSync(datei, 'utf8');
      const relativ = path.relative(WURZEL, datei).replace(/\\/g, '/');
      if (AUSNAHMEN.includes(relativ)) continue;
      let ab = 0;
      for (;;) {
        const treffer = text.indexOf('api.saveFile(', ab);
        if (treffer < 0) break;
        const args = argumentListe(text, treffer + 'api.saveFile'.length);
        if (!/\bexpected\b/.test(args) && !/\bforce\b/.test(args)) {
          const zeile = text.slice(0, treffer).split('\n').length;
          ohneStand.push(`${relativ}:${zeile}`);
        }
        ab = treffer + 1;
      }
    }
    expect(ohneStand).toEqual([]);
  });

  it('findet die bekannten Schreibwege ueberhaupt (Anker gegen eine stumpfe Pruefung)', () => {
    const treffer = jsDateien(RENDERER).filter((d) =>
      fs.readFileSync(d, 'utf8').includes('api.saveFile('),
    );
    expect(treffer.length).toBeGreaterThanOrEqual(2);
  });
});
