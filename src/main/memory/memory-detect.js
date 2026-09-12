// 4T-001598 (Epic 3E-000191, Story 4S-000906): Art eines Ordners fuer die
// Gefaess-Liste — Regal, Buch oder Bereich.
//
// Electron-frei (nur node:fs und node:path), damit die Erkennung an echten
// Temp-Ordnern unit-testbar ist (Muster src/main/books/shelves.js).
//
// Die Reihenfolge ist nicht beliebig: Regal vor Buch, weil ein Regal-Ordner
// Buch-Ordner traegt und nicht selbst einer ist; Bereich zuletzt, weil er die
// Auffang-Art ist. Der Bestand kennt KEINE Markierung eines Bereichs — jeder
// Ordner kann Bereich sein (openAreaPath in area-apps.js) —, also faellt ein
// Ordner ohne Begleitdatei genau deshalb auf 'area' und nicht durch. Abgelehnt
// wird allein, was gar kein erreichbarer Ordner ist (Annahme A1 des Entwurfs,
// Praezisierung von AK4).
//
// Gelesen wird ueber die vorhandenen Wege: readShelfSettings, readBookSettings
// und readFrontmatterExcerpt. Ein zweiter Lese-Code waere eine zweite Wahrheit
// darueber, was ein Buch ist und wie es heisst.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { areaFromRootPath } = require('../area/area-path');
const { readBookSettings } = require('../books/books');
const { readShelfSettings, readFrontmatterExcerpt } = require('../books/shelves');
const { readBookFileName } = require('../../shared/books/book-core.js');
const { readShelfFileName } = require('../../shared/books/shelf-core.js');

// Frontmatter-Titel der benannten Datei eines Containers, sonst null. Fehlende
// oder nicht lesbare Datei liefert null statt eines Fehlers (Fehler-Isolation:
// die Liste zeigt dann den Ordner-Namen).
async function titelAusBegleitdatei(dir, dateiName) {
  if (typeof dateiName !== 'string' || dateiName === '') return null;
  const excerpt = await readFrontmatterExcerpt(path.join(dir, dateiName));
  return excerpt.title;
}

/**
 * Bestimmt die Gefaess-Art eines Ordners. Ergebnis:
 *   { ok: true, kind: 'shelf'|'book'|'area', name }
 *   { ok: false, error: 'unreachable' }     Pfad fehlt oder ist nicht lesbar
 *   { ok: false, error: 'not-a-directory' } Pfad zeigt auf eine Datei
 *
 * @param {string} dir Ordner-Pfad.
 * @returns {Promise<object>} Art und Anzeige-Name oder die Fehler-Kennung.
 */
async function detectContainerKind(dir) {
  if (typeof dir !== 'string' || dir === '') return { ok: false, error: 'unreachable' };
  const wurzel = path.resolve(dir);
  let stat;
  try {
    stat = await fs.stat(wurzel);
  } catch {
    return { ok: false, error: 'unreachable' };
  }
  if (!stat.isDirectory()) return { ok: false, error: 'not-a-directory' };

  const ordnerName = areaFromRootPath(wurzel).name;

  const regal = await readShelfSettings(wurzel);
  if (regal.ok) {
    const dateiName = readShelfFileName(regal.container);
    const titel = await titelAusBegleitdatei(wurzel, dateiName);
    // Rueckfall wie in buildShelfViewData: Frontmatter-Titel, sonst Basename
    // der Regal-Datei, sonst Ordner-Name.
    const name =
      titel !== null
        ? titel
        : typeof dateiName === 'string' && dateiName !== ''
          ? dateiName.replace(/\.[^.]+$/, '')
          : ordnerName;
    return { ok: true, kind: 'shelf', name };
  }

  const buch = await readBookSettings(wurzel);
  if (buch.ok) {
    // Rueckfall wie in buildBookEntry: Frontmatter-Titel, sonst Ordner-Name.
    const titel = await titelAusBegleitdatei(wurzel, readBookFileName(buch.container));
    return { ok: true, kind: 'book', name: titel !== null ? titel : ordnerName };
  }

  return { ok: true, kind: 'area', name: ordnerName };
}

module.exports = { detectContainerKind };
