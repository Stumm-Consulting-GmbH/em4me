// 4T-001504 (Epic 3E-000161): Wächter über die Anlage der Datei-Beobachtung.
//
// Der Vorgang fragt unter anderem, was geschieht, wenn eine der beiden
// Rückschreib-Stellen aus `src/main/ipc/index-views.js` in ein Dokument
// schreibt, das BEOBACHTET wird, aber in keinem Fenster offen ist. Die
// Bestandsaufnahme hat ergeben, dass es diesen Zustand nicht gibt: Eine
// Beobachtung entsteht ausschließlich beim Lesen einer Datei in einen Reiter
// (`file:read`) und trägt als Besitzer die `webContents`-ID genau dieses
// Fensters; mit dem letzten Besitzer endet sie (`unwatchFile`,
// `unwatchAllForOwner`).
//
// Weil diese Aussage eine ABWESENHEIT behauptet, hält sie sich nicht von
// selbst: Eine zweite Stelle, die `watchFile` aufruft — etwa ein künftiger
// Index-, Vorschau- oder Panel-Weg —, erzeugte genau den Zustand, dessen
// Nichtvorhandensein hier belegt ist, und niemand käme auf die Idee, deswegen
// diesen Vorgang noch einmal aufzuschlagen. Der Wächter macht die Erhebung
// haltbar statt sie zu einer Momentaufnahme zu machen.
//
// Er prüft NICHT, ob die Beobachtung fachlich richtig ist — nur, dass sie
// weiterhin an genau einem Ort und an das Öffnen eines Reiters gebunden
// entsteht. Kommt eine zweite Anlage-Stelle hinzu, ist das kein Fehler, aber
// eine Entscheidung: Dann sind die drei Konstellationen von 4T-001504 neu zu
// beantworten.
//
// Muster: atomares-schreiben-aufrufer.test.js (Aufrufer-Durchlauf über den
// Quelltext, Kommentarzeilen zählen nicht mit).
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

// 4T-001632: Diese Pruefung liest einen Baum des Repositoriums im Rumpf
// ihrer Prueffaelle und faellt damit unter testTimeout. Gemessen am
// 2026-09-09 vom Lese-Ort-Waechter (scripts/lese-ort-regel.js); die Regel
// steht in test/README.md, Abschnitt "Bestands-Lesungen gehoeren in den
// Modulkopf".
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = path.join(WURZEL, 'src', 'main');

// Das Beobachtungs-Modul selbst: Es definiert `watchFile` und ruft sich beim
// Umstellen auf den Abfrage-Betrieb und beim Umzug einer Beobachtung selbst
// auf. Beide Fälle setzen eine bestehende Beobachtung fort und legen keine
// neue an.
const AUSNAHMEN = [path.join('documents', 'file-watching.js')];

function jsDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...jsDateien(voll));
    else if (eintrag.name.endsWith('.js')) gefunden.push(voll);
  }
  return gefunden;
}

// `\b` vor dem Namen trennt nicht von `unwatchFile` — dort steht zwischen `n`
// und `w` keine Wortgrenze. Der Aufruf-Klammer wegen greift der Ausdruck nur
// auf Aufrufe, nicht auf die Destrukturierung `watchFile,` oder den JSDoc-Namen.
const AUFRUF = /\bwatchFile\s*\(/g;

// Liefert die Aufruf-Stellen einer Datei, Kommentarzeilen ausgenommen.
export function anlageAufrufe(quelltext) {
  const treffer = [];
  for (const m of quelltext.matchAll(AUFRUF)) {
    const zeilenAnfang = quelltext.lastIndexOf('\n', m.index) + 1;
    const vorText = quelltext.slice(zeilenAnfang, m.index);
    if (/(^|\s)(\/\/|\*)/.test(vorText)) continue;
    const zeile = quelltext.slice(0, m.index).split('\n').length;
    treffer.push({ zeile, index: m.index });
  }
  return treffer;
}

// Der IPC-Kanal, in dessen Rumpf eine Stelle liegt: der letzte `handle('…'`
// vor ihr. Ausreichend, weil die Handler eines Moduls hintereinander stehen.
export function kanalVor(quelltext, index) {
  const davor = quelltext.slice(0, index);
  const treffer = [...davor.matchAll(/handle\(\s*'([^']+)'/g)];
  return treffer.length > 0 ? treffer[treffer.length - 1][1] : null;
}

describe('Anlage der Datei-Beobachtung: genau ein Ort, gebunden an das Öffnen', () => {
  it('ruft watchFile außerhalb des Beobachtungs-Moduls nur in ipc/files.js auf', () => {
    const stellen = [];
    for (const datei of jsDateien(MAIN)) {
      const relativ = path.relative(MAIN, datei);
      if (AUSNAHMEN.includes(relativ)) continue;
      const quelltext = fs.readFileSync(datei, 'utf8');
      for (const a of anlageAufrufe(quelltext)) {
        stellen.push({ datei: relativ, zeile: a.zeile, kanal: kanalVor(quelltext, a.index) });
      }
    }
    // Die Meldung nennt die gefundenen Stellen, damit ein Fehlschlag ohne
    // zweiten Lauf lesbar ist.
    expect(stellen.map((s) => `${s.datei}:${s.zeile} (${s.kanal})`)).toEqual([
      expect.stringContaining(path.join('ipc', 'files.js')),
    ]);
  });

  it('legt die Beobachtung im Lese-Kanal an, also beim Öffnen eines Reiters', () => {
    const quelltext = fs.readFileSync(path.join(MAIN, 'ipc', 'files.js'), 'utf8');
    const stellen = anlageAufrufe(quelltext);
    expect(stellen).toHaveLength(1);
    expect(kanalVor(quelltext, stellen[0].index)).toBe('file:read');
  });

  // Negativ-Probe. Beide Fälle oben behaupten eine Abwesenheit: Ihr Grün sieht
  // genauso aus wie ein Ausdruck, der nichts mehr findet. Die Probe misst
  // deshalb an einem gebauten Quelltext, dass der Durchlauf eine zusätzliche
  // Anlage-Stelle überhaupt sieht — und dass er sich weder von `unwatchFile`
  // noch von einer Erklärung in Prosa täuschen lässt.
  it('sieht eine zusätzliche Anlage-Stelle und übergeht Kommentar und unwatchFile', () => {
    const gebaut = [
      "handle('file:read', async (event, p) => {",
      '  watchFile(p, event.sender.id);',
      '});',
      "handle('index:vorschau', async (event, p) => {",
      '  // watchFile(p, event.sender.id) waere hier der naheliegende Griff',
      '  watchFile(p, event.sender.id);',
      '  await unwatchFile(p, event.sender.id);',
      '});',
    ].join('\n');
    const stellen = anlageAufrufe(gebaut);
    expect(stellen).toHaveLength(2);
    expect(stellen.map((s) => kanalVor(gebaut, s.index))).toEqual(['file:read', 'index:vorschau']);
  });
});
