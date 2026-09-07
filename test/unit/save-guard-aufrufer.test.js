// 4T-000945 (Story 4S-000786): Waechter ueber die Schreibwege des Renderers.
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

// 4T-001521: Der Baum wird EINMAL gelesen, nicht je Prueffall. Er umfasst 226
// Dateien, und im Linux-Container kostet jeder Zugriff ueber die Bruecke zum
// Windows-Laufwerk ein Vielfaches; vier Durchlaeufe brachten den Anker-Fall
// dort an sein Zeitlimit. Die beiden erzeugten Bundles bleiben draussen: Sie
// tragen 5 der 7,6 MB, und der Buendler minifiziert die gesuchten Marken weg —
// gemessen null Treffer in beiden, waehrend die Quellen drei bzw. einen
// liefern. Ein Waechter, dessen Suchmuster in einer Datei grundsaetzlich nicht
// vorkommen kann, misst dort nichts.
let gelesen = null;
function quellDateien() {
  if (!gelesen) {
    gelesen = jsDateien(RENDERER)
      .filter((d) => !d.endsWith('.bundle.js'))
      .map((d) => ({
        relativ: path.relative(WURZEL, d).replace(/\\/g, '/'),
        text: fs.readFileSync(d, 'utf8'),
      }))
      .filter((d) => !AUSNAHMEN.includes(d.relativ));
  }
  return gelesen;
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
    for (const { relativ, text } of quellDateien()) {
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

  // 4T-001261 (Epic 3E-000272): Der zweite Schreibweg in eine fremde Datei.
  //
  // Dieser Waechter kannte bis hierher nur `api.saveFile` — und genau durch
  // diese Luecke fiel die Ereignis-Aggregation, die in eine NICHT geoeffnete
  // fremde Datei zurueckschreibt und ihre Fremd-Aenderung am Zeitstempel
  // erkannte statt am Inhalt. Ein Waechter, der einen von zwei Wegen kennt,
  // meldet den zweiten nie.
  it('kein eventsApplyFrontmatterEdit-Aufruf ohne expectedFields', () => {
    const ohneStand = [];
    for (const { relativ, text } of quellDateien()) {
      let ab = 0;
      for (;;) {
        const treffer = text.indexOf('api.eventsApplyFrontmatterEdit(', ab);
        if (treffer < 0) break;
        const args = argumentListe(text, treffer + 'api.eventsApplyFrontmatterEdit'.length);
        if (!/\bexpectedFields\b/.test(args)) {
          ohneStand.push(`${relativ}:${text.slice(0, treffer).split('\n').length}`);
        }
        ab = treffer + 1;
      }
    }
    expect(ohneStand).toEqual([]);
  });

  it('findet die bekannten Schreibwege ueberhaupt (Anker gegen eine stumpfe Pruefung)', () => {
    const treffer = quellDateien().filter((d) => d.text.includes('api.saveFile('));
    expect(treffer.length).toBeGreaterThanOrEqual(2);
    // 4T-001261: Derselbe Anker fuer den zweiten Weg — ohne ihn liefe die
    // Pruefung oben ins Leere, sobald der Aufruf umbenannt wird.
    const feldweise = quellDateien().filter((d) =>
      d.text.includes('api.eventsApplyFrontmatterEdit('),
    );
    expect(feldweise.length).toBeGreaterThanOrEqual(1);
  });
});
