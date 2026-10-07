// 4T-002068 (Epic 3E-000344): Eine Bilddatei als Daten-Adresse lesen — die
// Lese-Hälfte der geprüften Bild-Wege im Hauptprozess.
//
// **Warum ein eigenes Modul.** Seit die Bild-Angabe der Inhalts-Regel des
// Anzeige-Fensters allein Daten-Adressen zulässt (`img-src data:` in
// src/renderer/index.html), erreicht ein lokales Bild das Fenster nur noch als
// Daten-Adresse, die ein geprüfter Weg auf der Node-Seite einsetzt. Zwei
// solche Wege lesen im Hauptprozess: die Bilder aus dem Kopf verlinkter
// Notizen einer Kanban-Tafel (src/main/ipc/embeds.js) und das Titelbild von
// Buch und Regal (src/main/books/angaben.js). Größen-Grenze, MIME-Zuordnung
// und das Lesen selbst stehen deshalb hier, statt in jedem Weg eine eigene
// Fassung zu tragen.
//
// **Was hier NICHT geprüft wird: die Grenze und die Endung.** Beides prüft der
// Aufrufer VOR dem Aufruf über den Auflöser der Einbettungen
// (`resolveContainedEmbedPath` in embed-path.js), denn schon der
// Größen-Zugriff auf eine Freigabe-Adresse wäre die Verbindung zum fremden
// Rechner. Ein Pfad, der hier ankommt, hat die Grenzprüfung bestanden.
//
// Electron-frei (nur node:fs und node:path), damit unit-prüfbar.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

// 4T-001486 (Epic 3E-000199): Größen-Limit und MIME-Zuordnung der
// Bild-Einbettung. Beide stammen aus dem bisherigen synchronen Weg im Preload
// (P-03, 4T-000176); seit 4T-002068 hier, weil das Titelbild sie mitbenutzt.
const MAX_EMBED_IMAGE_BYTES = 20 * 1024 * 1024;
const EMBED_IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

function mimeForImageExt(ext) {
  return EMBED_IMAGE_MIME[ext] || 'application/octet-stream';
}

/**
 * Liest eine Bilddatei als Daten-Adresse.
 *
 * Der Pfad muss die Grenzprüfung des Aufrufers bereits bestanden haben
 * (Kopf-Kommentar). Geprüft wird hier allein, dass er eine Datei ist und die
 * Größen-Grenze einhält — vor dem Lesen, damit eine übergroße Datei nie in den
 * Speicher kommt.
 *
 * @param {string} abs Absoluter Pfad der Bilddatei.
 * @returns {Promise<string|null>} Daten-Adresse, oder null, wenn die Datei
 *   fehlt, keine Datei ist, zu groß oder nicht lesbar ist.
 */
async function bildDateiAlsDaten(abs) {
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile() || stat.size > MAX_EMBED_IMAGE_BYTES) return null;
    const daten = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return `data:${mimeForImageExt(ext)};base64,${daten.toString('base64')}`;
  } catch {
    // Zwischen Auflösen und Lesen verschwunden oder gesperrt: kein Bild, wie
    // bei einem Verweis, der nie aufzulösen war.
    return null;
  }
}

module.exports = { MAX_EMBED_IMAGE_BYTES, mimeForImageExt, bildDateiAlsDaten };
