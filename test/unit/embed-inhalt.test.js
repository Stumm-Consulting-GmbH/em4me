// 4T-0948 (Befund E-01, Story S-0787): Woher der Inhalt einer Wiki-Einbettung
// stammt. Geprüft wird die Wahl zwischen geschriebenem Stand und Platten-Stand
// samt Größen-Limit; den Weg des Anwenders geht die E2E-Spec der Erhebung
// (test/e2e/regression/4t-0936-ungespeicherter-stand.spec.js).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liesEmbedInhalt } from '../../src/main/embed-inhalt.js';

let dir;
let datei;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-inhalt-'));
  datei = path.join(dir, 'Quelle.md');
  fs.writeFileSync(datei, 'Stand auf der Platte\n', 'utf8');
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
});

describe('embed-inhalt: Puffer vor Platte', () => {
  it('liest die Datei, wenn kein geschriebener Stand vorliegt', async () => {
    const r = await liesEmbedInhalt(datei, null, 1024);
    expect(r.ok).toBe(true);
    expect(r.ausPuffer).toBe(false);
    expect(r.content).toContain('Stand auf der Platte');
  });

  it('gibt den geschriebenen Stand ohne Datei-Zugriff heraus', async () => {
    const r = await liesEmbedInhalt(datei, 'Frisch getippt\n', 1024);
    expect(r.ok).toBe(true);
    expect(r.ausPuffer).toBe(true);
    expect(r.content).toBe('Frisch getippt\n');
    // Die Platte bleibt unberührt und ungelesen.
    expect(fs.readFileSync(datei, 'utf8')).toContain('Stand auf der Platte');
  });

  // Ein leerer Puffer ist ein gültiger geschriebener Stand: Wer den Inhalt
  // einer eingebetteten Datei löscht und nicht speichert, soll die Einbettung
  // leer sehen und nicht den alten Stand. Deshalb entscheidet der Typ und
  // nicht die Wahrheitswertigkeit.
  it('behandelt den leeren Puffer als Stand und nicht als Abwesenheit', async () => {
    const r = await liesEmbedInhalt(datei, '', 1024);
    expect(r.ausPuffer).toBe(true);
    expect(r.content).toBe('');
  });

  it('hält das Größen-Limit in beiden Zweigen ein', async () => {
    const ausDatei = await liesEmbedInhalt(datei, null, 4);
    expect(ausDatei).toEqual({ ok: false, error: 'file too large' });

    const ausPuffer = await liesEmbedInhalt(datei, 'viel zu lang für vier Bytes', 4);
    expect(ausPuffer).toEqual({ ok: false, error: 'file too large' });
  });

  // Das Limit zählt Bytes und nicht Zeichen; ein Umlaut belegt in UTF-8 zwei.
  it('misst den Puffer in Bytes', async () => {
    expect((await liesEmbedInhalt(datei, 'äää', 6)).ok).toBe(true);
    expect((await liesEmbedInhalt(datei, 'äää', 5)).ok).toBe(false);
  });
});
