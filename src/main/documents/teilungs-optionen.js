// 4T-001550 (Epic 3E-000251): Was beim Teilen für DIESE Datei gilt.
//
// Die eine Stelle, an der die Datenbank-Definition auf die allgemeine
// Dokument-Teilung trifft. Sie steht hier und nicht in einem der beiden
// Nachbarn, und zwar aus je eigenem Grund:
//
//   - **Nicht in der Zerlegung** (`src/shared/document-split.js`): Die
//     Definition auszulegen zieht die ganze Profil-Maschinerie nach sich, und
//     die allgemeine Teilung soll nicht an ihr hängen. Sie bekommt die
//     Feld-Namen deshalb hereingereicht.
//   - **Nicht im Kanal-Modul** (`src/main/ipc/files.js`): Dort werden Kanäle
//     verdrahtet, nicht Sachfragen beantwortet; und die Antwort wird an zwei
//     Kanälen gebraucht, beim Speichern und beim Wiedervereinen.
//
// Ohne Datei-Zugriff und ohne Electron: Der Text kommt herein, die Auskunft
// geht hinaus.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter');
const { parseTableDefinition } = require('../../shared/database/table-definition');
const { istTabellenDatei, schwelleFuer } = require('../../shared/document-split');

/**
 * Die Teilungs-Vorgaben eines Textes.
 *
 * Liefert `{ istTabelle, schwelle, segmentFelder }`:
 *   - `istTabelle`   ob die Datei eine Tabellen-Datei der Datenbank ist; daran
 *                    hängt auch, ob das erste Teilen angekündigt wird (bei der
 *                    technischen Ablage entfällt die Ankündigung, denn dort war
 *                    die Datei nie Eigentum des Anwenders).
 *   - `schwelle`     0,7 MB für die Ablage, 1 MB für ein Dokument (E26.1).
 *   - `segmentFelder` die Feld-Namen in ihrer Reihenfolge als Lese-Hilfe jedes
 *                    Folge-Segments (E26.3), sonst null.
 *
 * **Die Namen kommen aus der ausgelegten Definition**, nicht roh aus dem
 * Frontmatter: Die Auslegung verwirft ein Feld, das seine Angaben nicht
 * einhält, und eine Lese-Hilfe, die verworfene Spalten nennt, wiese den Leser
 * auf Spalten hin, die es nicht gibt.
 */
function teilungsOptionen(text) {
  const s = String(text == null ? '' : text);
  const istTabelle = istTabellenDatei(s);
  if (!istTabelle) return { istTabelle: false, schwelle: schwelleFuer(s), segmentFelder: null };
  const definition = parseTableDefinition(extractFrontmatter(s).data);
  const felder = (definition && definition.fields) || [];
  const namen = felder.map((f) => (f && typeof f.name === 'string' ? f.name : '')).filter(Boolean);
  return {
    istTabelle: true,
    schwelle: schwelleFuer(s),
    segmentFelder: namen.length > 0 ? namen : null,
  };
}

module.exports = { teilungsOptionen };
