// 4T-0948 (Befund E-01, Story 4S-0787): Woher der Inhalt einer Wiki-Einbettung
// stammt. Ist die eingebettete Datei offen und ungespeichert geaendert, gilt
// ihr GESCHRIEBENER Stand aus der Puffer-Overlay-Schicht; sonst der Stand auf
// der Platte. Das Groessen-Limit gilt in beiden Faellen, beim Puffer als
// Byte-Laenge des bereits dekodierten Textes.
//
// Eigenes Modul aus zwei Gruenden: main.js ist eine gelistete Uebergroesse,
// deren Ratsche kein Wachstum erlaubt (scripts/datei-groessen-ausnahmen.json,
// Auflage «wer main.js vor 3E-0196 erweitert, traegt den Schnitt selbst»); und
// die Entscheidung ist ohne Electron pruefbar. Muster: save-guard.js,
// network-paths.js, self-write.js.
'use strict';

const fs = require('node:fs/promises');

// pufferText === null heisst «kein geschriebener Stand bekannt»; dann wird
// gelesen. Das Limit steht in beiden Zweigen VOR dem Beschaffen des Inhalts
// (Memory-Schutz, Muster des Bild-Resolvers).
async function liesEmbedInhalt(abs, pufferText, maxBytes) {
  const grenze = typeof maxBytes === 'number' ? maxBytes : Infinity;
  if (typeof pufferText === 'string') {
    if (Buffer.byteLength(pufferText, 'utf8') > grenze) {
      return { ok: false, error: 'file too large' };
    }
    return { ok: true, content: pufferText, ausPuffer: true };
  }
  const stat = await fs.stat(abs);
  if (stat.size > grenze) return { ok: false, error: 'file too large' };
  return { ok: true, content: await fs.readFile(abs, 'utf8'), ausPuffer: false };
}

module.exports = { liesEmbedInhalt };
