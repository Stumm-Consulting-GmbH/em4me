// 4T-002503 (Epic 3E-000403): Nachzug der Wiki-Verweise im Kopf-Block beim
// Umbenennen (Story 4S-001180, AK5).
//
// Gearbeitet wird über den Umschreiber der Hauptprozess-Seite
// (`applyLinkUpdatesForRename` in src/main/documents/link-update.js), den die
// Kaskade des Umbenennens ruft, an echten Temp-Verzeichnissen — wie in
// link-update-suchraum.test.js. Geprüft wird der Datei-Stand nach dem Lauf.
//
// Zusage: Ein Wiki-Verweis als Zeichenketten-Wert der obersten Ebene oder als
// Zeichenketten-Eintrag einer Liste der obersten Ebene zieht nach wie im
// Körper; Anführungszeichen, Anzeige-Text, Anker, Reihenfolge, Leerzeilen und
// Kommentare bleiben Byte für Byte, und der Kopf-Block bleibt gültiges YAML.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { createLinkUpdate } from '../../src/main/documents/link-update.js';

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-lu-kopf-'));
  tmpDirs.push(dir);
  return dir;
}

function schreibe(root, rel, inhalt) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

const lies = (p) => fs.readFileSync(p, 'utf8');
const zeilen = (...z) => z.join('\n');

// Die Abhängigkeiten, die der Nachzug braucht: Bereichs-Bindung,
// Markdown-Erkennung und eine abgeschaltete Historisierung.
function makeLinkUpdate(bereich) {
  return createLinkUpdate({
    areaOfWindow: () => ({ rootPath: bereich }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
  });
}

// Benennt im Bereich `Alt.md` in `Neu.md` um (nur der Nachzug, die Datei
// selbst wird umbenannt wie in der Kaskade, bevor die Verweise nachziehen).
async function benenneAltInNeu(bereich) {
  const alt = path.join(bereich, 'Alt.md');
  const neu = path.join(bereich, 'Neu.md');
  fs.renameSync(alt, neu);
  return makeLinkUpdate(bereich).applyLinkUpdatesForRename({}, [{ from: alt, to: neu }], neu);
}

// Der Kopf-Block eines Textes als YAML-Text (ohne Begrenzungs-Zeilen).
function kopfBlock(text) {
  const z = text.split('\n');
  const ende = z.indexOf('---', 1);
  return z.slice(1, ende).join('\n');
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('Nachzug der Kopf-Block-Verweise beim Umbenennen (4T-002503)', () => {
  it('Einzel-Verweis als Wert zieht nach, der Körper ebenso', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const quelle = schreibe(
      bereich,
      'Quelle.md',
      zeilen('---', 'projekt: "[[Alt]]"', '---', 'Siehe [[Alt]].', ''),
    );
    const res = await benenneAltInNeu(bereich);
    expect(res.failed).toEqual([]);
    expect(lies(quelle)).toBe(zeilen('---', 'projekt: "[[Neu]]"', '---', 'Siehe [[Neu]].', ''));
  });

  it('Liste mit zwei Verweisen zieht je Eintrag nach', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const quelle = schreibe(
      bereich,
      'Quelle.md',
      zeilen('---', 'bezug:', '  - "[[Alt]]"', '  - "[[Alt|Anzeige]]"', '---', 'Text.', ''),
    );
    await benenneAltInNeu(bereich);
    expect(lies(quelle)).toBe(
      zeilen('---', 'bezug:', '  - "[[Neu]]"', '  - "[[Neu|Anzeige]]"', '---', 'Text.', ''),
    );
  });

  it('Anzeige-Text und Anker bleiben, Flow-Liste und einfache Anführungszeichen ebenso', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const quelle = schreibe(
      bereich,
      'Quelle.md',
      zeilen(
        '---',
        "einzel: '[[Alt#Kapitel|Zum Kapitel]]'",
        'flow: ["[[Alt#^block]]", "[[Bestand]]"]',
        '---',
        '',
      ),
    );
    await benenneAltInNeu(bereich);
    expect(lies(quelle)).toBe(
      zeilen(
        '---',
        "einzel: '[[Neu#Kapitel|Zum Kapitel]]'",
        'flow: ["[[Neu#^block]]", "[[Bestand]]"]',
        '---',
        '',
      ),
    );
  });

  it('außerhalb des Ziel-Namens byte-gleich: Reihenfolge, Leerzeilen, Kommentare, CRLF', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const vorher = [
      '---',
      '# Kommentar oben',
      'titel: Notiz   ',
      '',
      'projekt:   "[[Alt]]"   # Kommentar am Wert',
      'zahl: 3',
      '---',
      'Text.',
      '',
    ].join('\r\n');
    const quelle = schreibe(bereich, 'Quelle.md', vorher);
    await benenneAltInNeu(bereich);
    expect(lies(quelle)).toBe(vorher.replace('[[Alt]]', '[[Neu]]'));
  });

  it('der Kopf-Block bleibt nach dem Umschreiben gültiges YAML mit dem neuen Ziel', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const quelle = schreibe(
      bereich,
      'Quelle.md',
      zeilen('---', 'projekt: "[[Alt]]"', 'bezug:', '  - "[[Alt|A]]"', '---', ''),
    );
    await benenneAltInNeu(bereich);
    const daten = yaml.load(kopfBlock(lies(quelle)), { schema: yaml.JSON_SCHEMA });
    expect(daten).toEqual({ projekt: '[[Neu]]', bezug: ['[[Neu|A]]'] });
  });

  it('verschachtelte Struktur bleibt außen vor', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const vorher = zeilen('---', 'gruppe:', '  kind: "[[Alt]]"', '---', 'Text.', '');
    const quelle = schreibe(bereich, 'Quelle.md', vorher);
    const res = await benenneAltInNeu(bereich);
    expect(lies(quelle)).toBe(vorher);
    expect(res.updated.map((u) => path.basename(u.path))).not.toContain('Quelle.md');
  });

  it('Datei ohne Kopf-Block: Körper zieht nach wie bisher', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const quelle = schreibe(bereich, 'Quelle.md', zeilen('# Quelle', 'Siehe [[Alt]].', ''));
    await benenneAltInNeu(bereich);
    expect(lies(quelle)).toBe(zeilen('# Quelle', 'Siehe [[Neu]].', ''));
  });

  it('Kopf-Block ohne betroffenen Verweis bleibt byte-gleich und wird nicht geschrieben', async () => {
    const bereich = makeRoot();
    schreibe(bereich, 'Alt.md', '# Alt\n');
    const vorher = zeilen('---', 'projekt: "[[Bestand]]"', 'titel: Alt', '---', 'Text.', '');
    const quelle = schreibe(bereich, 'Quelle.md', vorher);
    const res = await benenneAltInNeu(bereich);
    expect(lies(quelle)).toBe(vorher);
    expect(res.updated.map((u) => path.basename(u.path))).not.toContain('Quelle.md');
  });
});
