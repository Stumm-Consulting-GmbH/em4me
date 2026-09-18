// 4T-001510 (Epic 3E-000250): Den Metadaten-Block einer Datenbank-Datei lesen,
// ohne ihren Datensatz-Körper zu lesen.
//
// **Warum das ein eigener Baustein ist.** Die Definition einer Tabelle steht im
// Frontmatter DERSELBEN Datei, die später ihre Datensätze trägt (E1), und diese
// Datei erreicht nach der Segmentierungs-Schwelle rund 0,7 MB. Der Katalog
// fragt seine Definitionen häufig ab; läse er dafür jedes Mal die ganze Datei,
// kostete eine Auskunft über zwanzig Tabellen vierzehn Megabyte. Der
// Metadaten-Block steht am Dateianfang, also wird auch nur der Anfang gelesen.
//
// **Der Rückfall ist bewusst weich.** Findet der Kopf-Ausschnitt keinen
// schließenden Marker, wird die Datei vollständig gelesen, statt einen Fehler zu
// melden: Ein ungewöhnlich großer Metadaten-Block ist zulässig, nur selten. Die
// Grenze ist damit eine Optimierung und keine Format-Zusicherung — dieselbe
// Linie, mit der die Segment-Schwelle den Format-Vertrag nicht bindet (E26.2).
//
// **Der geschriebene Stand geht vor.** Trägt die Datei einen Puffer-Overlay, ist
// sie in einem Fenster geöffnet und ungespeichert geändert; dann gilt ihr
// geschriebener Stand und die Platte wird gar nicht gelesen. Das ist die
// Puffer-Overlay-Zusicherung (E25), die für jedes Konstrukt gilt, das Daten
// anderer Stellen einbindet.
//
// Electron-frei; der Dateizugriff wird injiziert (Vorbild `profile-catalog.js`),
// der Overlay-Zugriff ebenso, damit dieses Modul ohne den Index prüfbar bleibt.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');

// Wieviel vom Dateianfang gelesen wird, bevor der Rückfall greift. 64 KiB
// fassen einige tausend Zeilen Definition; eine Tabelle mit hundert Feldern
// braucht rund ein Zwanzigstel davon.
const KOPF_BYTES = 64 * 1024;

// Nachweis statt Laufzeit-Messung: Der Test zählt, wie oft und in welcher Form
// gelesen wurde. Eine Laufzeit-Messung wäre bei Testdateien ohne Aussage
// (Muster aus `profil-wertevorrat.js`).
const zaehler = { kopf: 0, voll: 0, overlay: 0 };

function lesezaehler() {
  return { ...zaehler };
}

function lesezaehlerZuruecksetzen() {
  zaehler.kopf = 0;
  zaehler.voll = 0;
  zaehler.overlay = 0;
}

// BOM strippen wie file:read und templates:read — die Frontmatter-Erkennung
// erwartet '---' ab Byte 0.
function ohneBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Ein Byte-Ausschnitt kann ein Mehrbyte-Zeichen zerschneiden. Geschnitten wird
// deshalb am letzten vollständigen Zeilenumbruch: Der schließende Marker steht
// nach dem Format immer allein auf einer Zeile, eine angebrochene letzte Zeile
// trägt also nie den Schluss und darf entfallen.
function bisZurLetztenZeile(text) {
  const letzte = text.lastIndexOf('\n');
  return letzte < 0 ? '' : text.slice(0, letzte + 1);
}

// Liest den Metadaten-Block einer Datei.
//
// Liefert { data, parseError, quelle }: `data` das Frontmatter-Objekt (null,
// wenn die Datei keines trägt oder es nicht lesbar ist), `parseError` die
// YAML-Meldung, `quelle` eine von 'overlay' | 'kopf' | 'voll' | null (null =
// die Datei war nicht lesbar). Wirft nicht.
async function leseFrontmatterKopf({ absPath, fsp, bufferTextFor = null }) {
  const gepuffert = typeof bufferTextFor === 'function' ? bufferTextFor(absPath) : null;
  if (typeof gepuffert === 'string') {
    zaehler.overlay += 1;
    const fm = extractFrontmatter(ohneBom(gepuffert));
    return { data: fm.data, parseError: fm.parseError, quelle: 'overlay' };
  }

  let groesse;
  try {
    groesse = (await fsp.stat(absPath)).size;
  } catch {
    return { data: null, parseError: null, quelle: null };
  }

  // Kleine Dateien ganz zu lesen ist billiger als ein zweiter Systemaufruf.
  if (groesse <= KOPF_BYTES || typeof fsp.open !== 'function') return leseVoll(absPath, fsp);

  let ausschnitt;
  try {
    const griff = await fsp.open(absPath, 'r');
    try {
      const puffer = Buffer.alloc(KOPF_BYTES);
      const { bytesRead } = await griff.read(puffer, 0, KOPF_BYTES, 0);
      ausschnitt = puffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await griff.close();
    }
  } catch {
    return leseVoll(absPath, fsp);
  }

  const kopf = ohneBom(bisZurLetztenZeile(ausschnitt));
  const fm = extractFrontmatter(kopf);
  // Kein Block im Ausschnitt heißt zweierlei: Die Datei trägt keinen — dann ist
  // sie für den Katalog ohnehin uninteressant —, oder der Block reicht über die
  // Grenze hinaus. Der zweite Fall ist der seltene, und nur für ihn wird noch
  // einmal gelesen. Unterscheiden lassen sich beide am ersten Zeichen.
  if (fm.data === null && fm.parseError === null && kopf.startsWith('---'))
    return leseVoll(absPath, fsp);
  zaehler.kopf += 1;
  return { data: fm.data, parseError: fm.parseError, quelle: 'kopf' };
}

async function leseVoll(absPath, fsp) {
  let roh;
  try {
    roh = await fsp.readFile(absPath, 'utf8');
  } catch {
    return { data: null, parseError: null, quelle: null };
  }
  zaehler.voll += 1;
  const fm = extractFrontmatter(ohneBom(roh));
  return { data: fm.data, parseError: fm.parseError, quelle: 'voll' };
}

module.exports = {
  KOPF_BYTES,
  leseFrontmatterKopf,
  lesezaehler,
  lesezaehlerZuruecksetzen,
};
