// 4T-002095 (Story 4S-000168, AK8): Wächter gegen deckende Hintergründe an
// Text-Dekorationen des Editors.
//
// **Warum.** CodeMirror zeichnet die Markierung als eigene Ebene UNTER dem Text
// (Auswahl-Ebene mit z-index -1). Jede Text-Dekoration mit deckendem
// Hintergrund verdeckt sie: Markierter Text sieht an dieser Stelle unmarkiert
// aus. Belegt am Rechen-Ausdruck (`--hover`), an der Kritik-Hervorhebung und an
// der Zeile eines Containers im Live-Modus. Halbdurchsichtige Hintergründe
// (Vorbild `.cm-mark-marker`, `.cm-frontmatter-line`) lassen sie durchscheinen.
//
// **Was geprüft wird, und woher die Mengen kommen.** Die Klassen werden aus dem
// Quelltext abgeleitet (jede `Decoration.mark`/`Decoration.line` mit fester
// Klasse unter src/renderer/modules), nicht von Hand gelistet; geprüft wird
// jede Stil-Regel, die eine dieser Klassen nennt und einen Hintergrund setzt.
// Pseudo-Elemente (::before/::after) sind keine Text-Hintergründe, sondern
// gezeichnete Kästchen, und bleiben außen vor. Eine Variable gilt als
// durchscheinend, wenn jede ihrer Definitionen in styles.css es ist.
//
// **Gewollt deckend** ist allein, was es in der Regel selbst sagt: ein
// Kommentar `deckend-gewollt: <Grund>` im Regel-Körper (verdeckter Text). Die
// Ausnahme steht damit an der Stelle, die sie betrifft, und nicht in einer
// zweiten Liste, die veralten könnte.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lauf = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? lauf(path.join(d, e.name)) : [path.join(d, e.name)]));

function dekorationsKlassen() {
  const klassen = new Set();
  for (const f of lauf(path.join(wurzel, 'src/renderer/modules'))) {
    if (!f.endsWith('.js')) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/Decoration\.(?:mark|line)\(\{[^}]*?class: *'([^']+)'/g)) {
      for (const k of m[1].split(/\s+/)) klassen.add(k);
    }
  }
  return klassen;
}

const STILE = path.join(wurzel, 'src/renderer/styles.css');
const stilDateien = () => [
  STILE,
  ...lauf(path.join(wurzel, 'src/renderer/styles')).filter((f) => f.endsWith('.css')),
];

// Alle Definitionen je Variable aus styles.css (helles und dunkles Schema).
function variablen() {
  const werte = new Map();
  const text = fs.readFileSync(STILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!werte.has(m[1])) werte.set(m[1], []);
    werte.get(m[1]).push(m[2].trim());
  }
  return werte;
}

function durchscheinend(wert, vars, tiefe = 0) {
  const w = wert.replace(/\s*!important\s*$/, '').trim();
  if (/^(transparent|none|inherit|initial|unset)$/i.test(w)) return true;
  if (/^color-mix\(.*\btransparent\b.*\)$/i.test(w)) return true;
  const rgba = /^(?:rgba|hsla|rgb|hsl)\((.*)\)$/i.exec(w);
  if (rgba) {
    const teile = rgba[1].split(/[,/]/).map((t) => t.trim());
    if (teile.length < 4) return false;
    const a = teile[3].endsWith('%') ? parseFloat(teile[3]) / 100 : parseFloat(teile[3]);
    return a < 1;
  }
  const hex = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.exec(w);
  if (hex) return !/^(f|ff)$/i.test(hex[1].length === 4 ? hex[1].slice(3) : hex[1].slice(6));
  const v = /^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/.exec(w);
  if (v && tiefe < 5) {
    const defs = vars.get(v[1]);
    if (!defs || defs.length === 0) return v[2] ? durchscheinend(v[2], vars, tiefe + 1) : false;
    return defs.every((d) => durchscheinend(d, vars, tiefe + 1));
  }
  return false;
}

function erhebe() {
  const klassen = dekorationsKlassen();
  const vars = variablen();
  const befunde = [];
  let geprueft = 0;
  for (const datei of stilDateien()) {
    const roh = fs.readFileSync(datei, 'utf8');
    for (const m of roh.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selektor = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (/::?(before|after)\b/.test(selektor)) continue;
      const genannt = [...klassen].some((k) =>
        new RegExp(`\\.${k.replace(/[-]/g, '\\-')}(?![\\w-])`).test(selektor),
      );
      if (!genannt) continue;
      const koerper = m[2];
      const bg = /(?:^|[;{\s])background(?:-color)?\s*:\s*([^;]+)/.exec(
        koerper.replace(/\/\*[\s\S]*?\*\//g, ''),
      );
      if (!bg) continue;
      geprueft++;
      if (/deckend-gewollt:/.test(koerper)) continue;
      if (durchscheinend(bg[1], vars)) continue;
      const zeile = roh.slice(0, m.index).split('\n').length + 1;
      befunde.push(
        `${path.relative(wurzel, datei).replace(/\\/g, '/')}:${zeile} ${selektor} → ${bg[1].trim()}`,
      );
    }
  }
  return { klassen, geprueft, befunde };
}

// Bestands-Lesung im Modulkopf (test/README, «Bestands-Lesungen gehören in den
// Modulkopf»): Die Prüffälle bewerten nur das Ergebnis.
const ERHEBUNG = erhebe();

describe('Editor: kein deckender Hintergrund an Text-Dekorationen (4T-002095)', () => {
  it('die abgeleiteten Mengen sind nicht leer gelaufen', () => {
    const { klassen, geprueft } = ERHEBUNG;
    // Untere Plausibilitäts-Schranken: Ein still leer laufender Ausdruck machte
    // den Wächter grün, ohne zu prüfen (Entwicklungsrichtlinien, Kapitel 1).
    expect(klassen.size).toBeGreaterThanOrEqual(25);
    expect(klassen.has('cm-inline-calc-marker')).toBe(true);
    expect(geprueft).toBeGreaterThanOrEqual(8);
  });

  it('jeder Hintergrund einer Text-Dekoration lässt die Markierung durchscheinen', () => {
    expect(ERHEBUNG.befunde).toEqual([]);
  });

  it('die Bewertung kennt beide Richtungen', () => {
    const vars = new Map([
      ['--deckt', ['#efefef', '#333333']],
      ['--scheint', ['rgba(0, 0, 0, 0.1)', 'rgba(255, 255, 255, 0.2)']],
    ]);
    expect(durchscheinend('var(--deckt)', vars)).toBe(false);
    expect(durchscheinend('#fff3a3', vars)).toBe(false);
    expect(durchscheinend('rgb(1, 2, 3)', vars)).toBe(false);
    expect(durchscheinend('var(--scheint)', vars)).toBe(true);
    expect(durchscheinend('rgba(255, 243, 163, 0.55)', vars)).toBe(true);
    expect(durchscheinend('color-mix(in srgb, var(--deckt) 60%, transparent)', vars)).toBe(true);
    expect(durchscheinend('transparent', vars)).toBe(true);
  });
});
