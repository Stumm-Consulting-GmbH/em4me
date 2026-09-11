// 4T-001435 (Story 4S-000868, Epic 3E-000248): Wächter über die Schreibwege
// des Haupt-Prozesses.
//
// Die Zusicherung «ganz oder gar nicht» gilt erst, wenn sie überall gilt. Eine
// einzige übersehene Schreibstelle ist genau die, an der später eine Datei
// zerreißt, und sie ist von außen nicht von den umgestellten zu unterscheiden.
// Ohne diesen Wächter wächst der alte Weg zurück, sobald jemand eine neue
// Funktion baut: `fs.writeFile` ist der naheliegende Griff, und nichts an ihm
// sieht falsch aus.
//
// DIE REGEL, und warum sie zwei Wege zulässt:
//
//   Wer eine Datei ERSETZT, nimmt den gemeinsamen Weg aus atomic-write.js.
//   Wer eine Datei EXKLUSIV ANLEGT (`flag: 'wx'`), darf `fs.writeFile` nehmen:
//   Dort ist das Anlegen selbst schon die Zusicherung, denn die Datei entsteht
//   ganz oder gar nicht, und es gibt keinen alten Inhalt, der verloren gehen
//   könnte. Genau zehn Stellen im Bestand arbeiten so.
//
// Muster: save-guard-aufrufer.test.js, einschließlich der Argument-Zerlegung
// über einen Klammer-Zähler statt über einen regulären Ausdruck — ein Aufruf
// enthält selbst Klammern und Objekt-Literale.
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

// Der gemeinsame Schreibweg selbst: Er IST die Schattenkopie samt Umbenennen
// und kann sich nicht über sich selbst schreiben.
const AUSNAHMEN = [path.join('documents', 'atomic-write.js')];

function jsDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...jsDateien(voll));
    else if (eintrag.name.endsWith('.js')) gefunden.push(voll);
  }
  return gefunden;
}

// Argumentliste eines Aufrufs ab der öffnenden Klammer, mit Klammer-Zähler.
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

const AUFRUF = /\bwriteFile(Sync)?\s*\(/g;

// Liefert die ersetzenden Schreibaufrufe einer Datei, also alle ohne `wx`.
export function ersetzendeAufrufe(quelltext) {
  const treffer = [];
  for (const m of quelltext.matchAll(AUFRUF)) {
    const start = m.index + m[0].length - 1;
    // Kommentarzeilen zählen nicht: Der Bestand erklärt den alten Weg an
    // mehreren Stellen in Prosa, und ein Wächter, der Erklärungen meldet,
    // wird abgeschaltet.
    const zeilenAnfang = quelltext.lastIndexOf('\n', m.index) + 1;
    const vorText = quelltext.slice(zeilenAnfang, m.index);
    if (/(^|\s)(\/\/|\*)/.test(vorText)) continue;

    const argumente = argumentListe(quelltext, start);
    if (/flag:\s*'wx'/.test(argumente)) continue;
    const zeile = quelltext.slice(0, m.index).split('\n').length;
    treffer.push({ zeile, text: argumente.replace(/\s+/g, ' ').trim().slice(0, 80) });
  }
  return treffer;
}

describe('Schreibwege des Haupt-Prozesses: kein direktes Ersetzen', () => {
  it('kein Modul unter src/main ersetzt eine Datei am gemeinsamen Weg vorbei', () => {
    const befunde = [];
    for (const datei of jsDateien(MAIN)) {
      const rel = path.relative(MAIN, datei);
      if (AUSNAHMEN.includes(rel)) continue;
      for (const t of ersetzendeAufrufe(fs.readFileSync(datei, 'utf8'))) {
        befunde.push(`${rel.split(path.sep).join('/')}:${t.zeile} — ${t.text}`);
      }
    }
    expect(
      befunde,
      'Direktes Ersetzen am gemeinsamen Weg vorbei. Wer eine Datei ersetzt, nimmt ' +
        'ersetzeDatei bzw. ersetzeDateiOderWirf aus documents/atomic-write.js; wer sie ' +
        `exklusiv anlegt, nimmt fs.writeFile mit flag 'wx':\n${befunde.join('\n')}`,
    ).toEqual([]);
  });

  // Die Gegenprobe hält den Wächter ehrlich: Ein Wächter, der nichts findet,
  // weil sein Muster nicht greift, ist von einem sauberen Bestand nicht zu
  // unterscheiden (Fehlerklasse L11: Konfiguration statt Wirkung).
  it('meldet einen eingefügten Verstoß', () => {
    const verstoss = `
      async function speichern(pfad, text) {
        await fs.writeFile(pfad, text, { encoding: 'utf8' });
      }
    `;
    const gefunden = ersetzendeAufrufe(verstoss);
    expect(gefunden).toHaveLength(1);
    expect(gefunden[0].text).toContain('pfad, text');
  });

  it('meldet auch die synchrone Fassung', () => {
    const verstoss = `fs.writeFileSync(pfad, text, 'utf8');`;
    expect(ersetzendeAufrufe(verstoss)).toHaveLength(1);
  });

  it('laesst das exklusive Anlegen durch', () => {
    const erlaubt = `await fs.writeFile(ziel, '', { encoding: 'utf8', flag: 'wx' });`;
    expect(ersetzendeAufrufe(erlaubt)).toEqual([]);
  });

  it('laesst das exklusive Anlegen auch mehrzeilig durch', () => {
    const erlaubt = `
      await fs.writeFile(bookSettingsPathFor(bookDir), serializeBookContainer(container), {
        encoding: 'utf8',
        flag: 'wx',
      });
    `;
    expect(ersetzendeAufrufe(erlaubt)).toEqual([]);
  });

  it('meldet eine Erwaehnung in einem Kommentar nicht', () => {
    const prosa = `
      // Bewusst kein fs.cp: der Weg ueber readFile/writeFile(ziel, daten) ist
      // aus der asar heraus zuverlaessig.
    `;
    expect(ersetzendeAufrufe(prosa)).toEqual([]);
  });

  // Der Bestand nach der Umstellung: genau die zehn exklusiven Anlagen bleiben.
  // Wächst diese Zahl, ist das kein Fehler, sondern eine Frage — deshalb steht
  // sie hier und nicht als Obergrenze im Wächter oben.
  it('haelt die Zahl der exklusiven Anlagen fest', () => {
    let anlagen = 0;
    for (const datei of jsDateien(MAIN)) {
      const quelltext = fs.readFileSync(datei, 'utf8');
      for (const m of quelltext.matchAll(AUFRUF)) {
        const start = m.index + m[0].length - 1;
        const zeilenAnfang = quelltext.lastIndexOf('\n', m.index) + 1;
        if (/(^|\s)(\/\/|\*)/.test(quelltext.slice(zeilenAnfang, m.index))) continue;
        if (/flag:\s*'wx'/.test(argumentListe(quelltext, start))) anlagen += 1;
      }
    }
    expect(anlagen).toBe(10);
  });
});
