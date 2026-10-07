// 4T-001885 (Epic 3E-000189): Die eigenen Angaben von Buch und Bücherregal —
// Titel, Autor, Beschreibung und Titelbild.
//
// **Wo sie liegen.** Im Frontmatter der Buch- beziehungsweise Regal-Datei, und
// zwar unverändert dort, wo sie heute schon stehen und wo die Regal-Ansicht sie
// liest. Dieses Modul verlegt nichts; es macht den Zugriff nur zu einem
// benannten Weg, den der Einstellungs-Abschnitt und die Regal-Ansicht sich
// teilen.
//
// **Warum ein eigenes Modul.** Buch und Regal brauchen denselben Zugriff, aber
// `shelves.js` hängt bereits an `books.js` — der umgekehrte Weg wäre ein Zyklus.
// Die gemeinsame Fachlichkeit liegt deshalb hier, und beide Datei-Ebenen rufen
// sie. `readFrontmatterExcerpt` ist dabei aus `shelves.js` hierher gewandert und
// wird dort unverändert weiter exportiert, damit die Gefäß-Liste ihren Titel
// nach wie vor über denselben Weg bekommt.
//
// Electron-frei (nur node:fs und node:path), damit die Wege am echten
// Temp-Ordner unit-testbar sind (Muster books.js und shelves.js).
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { extractFrontmatter, writeFrontmatter } = require('../../shared/markdown/frontmatter.js');
// 4T-002068 (Epic 3E-000344): Grenzprüfung und Endungs-Liste des Titelbilds
// über den Auflöser der Einbettungen, Größen-Grenze und Lesen als
// Daten-Adresse über den gemeinsamen Baustein der Bild-Wege — keine eigene
// Fassung davon hier.
const { resolveContainedEmbedPath } = require('../documents/embed-path');
const { MAX_EMBED_IMAGE_BYTES, bildDateiAlsDaten } = require('../documents/bild-daten');

// Die vier Felder, und zwar genau diese: Sie sind der Bestand, den Buch und
// Regal heute tragen (Reißleine des Epics 3E-000189 — der Abschnitt bleibt bei
// dem, was es gibt, statt neue Angaben zu erfinden). Der Bild-Verweis heißt
// `cover`, die Bestands-Konvention des mitgelieferten Demo-Buches (4T-000850).
const ANGABEN_FELDER = ['title', 'author', 'description', 'cover'];

// Frontmatter-Auszug einer Markdown-Datei: { title, author, description,
// cover } — fehlende oder nicht lesbare Werte als null. Nicht lesbare Datei
// oder defektes Frontmatter liefert leere Werte statt eines Fehlers
// (Fehler-Isolation: die Regal-Ansicht zeigt dann den Ordner-Namen).
async function readFrontmatterExcerpt(filePath) {
  const leer = { title: null, author: null, description: null, cover: null };
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return leer;
  }
  const data = extractFrontmatter(raw).data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return leer;
  const text = (wert) => (typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : null);
  return {
    title: text(data.title),
    author: text(data.author),
    description: text(data.description),
    cover: text(data.cover),
  };
}

// Bild-Verweis auflösen: relativ zum Ordner der Datei, die ihn trägt. null,
// wenn kein Verweis gesetzt ist oder er nicht als Titelbild taugt — die
// Ansicht zeigt dann die Platzhalter-Kachel (PO-Entscheidung vom 2026-08-04),
// der Einstellungs-Abschnitt einen Hinweis.
//
// **Seit 4T-002068 mit Grenze, Endungs-Liste und Größen-Grenze** (Verdacht 2
// aus 4T-001963, gemessen an der gebauten Programmdatei: Ein Buch konnte über
// `../` oder einen absoluten Pfad jede Bilddatei des Rechners in die
// Regal-Ansicht holen). **Grenze** ist in jedem Fall der Regal-Ordner, bei
// einem Buch ohne Regal der Buch-Ordner (Entscheidung des Product Owners vom
// 2026-10-04, «Weg A»). Ein umgebender Bereich weitet sie nicht — die
// Anwendung weiß beim Regal verlässlich nur den Regal-Ordner. Die Grenze kommt
// vom Aufrufer, weil nur er weiß, zu welchem Regal die Datei gehört. Ein absoluter Pfad innerhalb der Grenze
// zählt wie ein relativer; die Grenze ist das Ziel, nicht die Schreibweise.
// Dazu die Endungs-Liste der Bild-Einbettung und höchstens 20 MB.
//
// **Die Grenzprüfung steht vor jedem Datei-Zugriff**: Auf ein Ziel außerhalb
// wird weder gelesen noch seine Größe abgefragt, denn schon der Größen-Zugriff
// auf eine Freigabe-Adresse (`\\rechner\…`) wäre die Verbindung zum fremden
// Rechner. Geprüft wird über den Auflöser der Einbettungen, ohne dessen
// Namens-Suche im Bereichs-Index: Ein Titelbild meint genau den geschriebenen
// Pfad, nicht eine gleichnamige Datei an anderer Stelle.
/**
 * @param {string} dateiPfad Buch- bzw. Regal-Datei; ihr Ordner ist der Bezug.
 * @param {string|null} imageRef Der geschriebene Verweis aus dem Frontmatter.
 * @param {string} [grenze] Grenze; ohne Angabe der Ordner der Datei.
 * @returns {Promise<string|null>} absoluter Pfad der Bilddatei oder null.
 */
async function resolveImagePath(dateiPfad, imageRef, grenze) {
  if (imageRef === null) return null;
  // Der Verweis im Frontmatter ist ein Pfad, keine Adresse. Der Auflöser
  // dekodiert seine Eingabe wie eine Adresse; encodeURI hebt das auf, sodass
  // ein Name mit `%` wörtlich gilt wie bisher. Eine nicht kodierbare
  // Zeichenfolge (einzelnes Ersatzzeichen) taugt nicht als Titelbild.
  let geschrieben;
  try {
    geschrieben = encodeURI(imageRef);
  } catch {
    return null;
  }
  const guard = resolveContainedEmbedPath(
    path.resolve(dateiPfad),
    geschrieben,
    grenze || null,
    'image',
  );
  if (!guard.ok) return null;
  try {
    const stat = await fs.stat(guard.abs);
    return stat.isFile() && stat.size <= MAX_EMBED_IMAGE_BYTES ? guard.abs : null;
  } catch {
    return null;
  }
}

/**
 * Das Titelbild als Daten-Adresse für die Regal-Ansicht (4T-002068).
 *
 * Das Anzeige-Fenster lädt Bilder allein aus Daten-Adressen; eine Pfad- oder
 * Datei-Adresse kommt deshalb nie ins Fenster. Grenze und Prüfungen wie bei
 * `resolveImagePath`.
 *
 * @param {string} dateiPfad Buch-Datei; ihr Ordner ist der Bezug.
 * @param {string|null} imageRef Der geschriebene Verweis aus dem Frontmatter.
 * @param {string} grenze Regal-Ordner.
 * @returns {Promise<string|null>} Daten-Adresse oder null (Platzhalter-Kachel).
 */
async function titelbildAlsDaten(dateiPfad, imageRef, grenze) {
  const abs = await resolveImagePath(dateiPfad, imageRef, grenze);
  return abs === null ? null : bildDateiAlsDaten(abs);
}

/**
 * Liest die vier Angaben aus dem Frontmatter einer Datei.
 *
 * Eine fehlende Angabe kommt als leerer String zurück und nicht als null: Der
 * Einstellungs-Abschnitt füllt damit sein Eingabefeld, und ein leeres Feld ist
 * dort der Normalfall und kein Fehler (Story 4S-000994, AK16).
 *
 * @param {string} baseDir Buch- bzw. Regal-Ordner.
 * @param {string} fileName Basename der Buch- bzw. Regal-Datei.
 * @param {string} [grenze] Grenze des Titelbilds (4T-002068): der Regal-Ordner,
 *   bei einem Buch ohne Regal der Buch-Ordner; ohne Angabe `baseDir`.
 * @returns {Promise<object>} { ok: true, title, author, description, cover, coverGefunden }.
 */
async function leseAngaben(baseDir, fileName, grenze) {
  const filePath = path.join(path.resolve(baseDir), fileName);
  const excerpt = await readFrontmatterExcerpt(filePath);
  // 4T-002068: dieselbe Grenze wie in der Regal-Ansicht. «Gefunden» heißt
  // damit dasselbe wie «die Regal-Ansicht zeigt es»: innerhalb der Grenze,
  // Bild-Endung, höchstens 20 MB.
  const bild = await resolveImagePath(filePath, excerpt.cover, grenze || path.resolve(baseDir));
  return {
    ok: true,
    title: excerpt.title || '',
    author: excerpt.author || '',
    description: excerpt.description || '',
    cover: excerpt.cover || '',
    // Nur eine Auskunft, nie ein Fehler: gefunden heißt vorhanden, innerhalb der
    // Grenze, Bilddatei und höchstens 20 MB (Abgrenzung der Story 4S-000994 in
    // der Fassung vom 2026-10-04).
    coverGefunden: excerpt.cover === null ? null : bild !== null,
  };
}

/**
 * Schreibt die vier Angaben in das Frontmatter einer Datei.
 *
 * Alles andere im Frontmatter bleibt unangetastet — geschrieben wird über den
 * round-trip-fähigen Weg, der Kommentare und Schlüssel-Reihenfolge erhält. Ein
 * leerer Wert entfernt sein Feld, statt es als leere Zeichenkette abzulegen.
 *
 * **Ein defektes Frontmatter wird nie überschrieben** (Muster
 * applyDatabaseSection): Der Schreib-Weg würde den Block neu aufbauen und dabei
 * alles verlieren, was darin steht. Lieber eine Meldung als ein stiller Verlust.
 *
 * @param {string} baseDir Buch- bzw. Regal-Ordner.
 * @param {string} fileName Basename der Buch- bzw. Regal-Datei.
 * @param {object} werte Die zu setzenden Angaben (nur bekannte Felder zählen).
 * @returns {Promise<object>} { ok: true } bzw. { ok: false, error, detail }.
 */
async function schreibeAngaben(baseDir, fileName, werte) {
  const filePath = path.join(path.resolve(baseDir), fileName);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: 'read-failed', detail: err && err.message ? err.message : '' };
  }
  const fm = extractFrontmatter(raw);
  if (fm.parseError) return { ok: false, error: 'invalid-frontmatter', detail: fm.parseError };
  const data =
    fm.data && typeof fm.data === 'object' && !Array.isArray(fm.data) ? { ...fm.data } : {};
  const eingabe = werte && typeof werte === 'object' ? werte : {};
  for (const feld of ANGABEN_FELDER) {
    if (!Object.prototype.hasOwnProperty.call(eingabe, feld)) continue;
    const wert = typeof eingabe[feld] === 'string' ? eingabe[feld].trim() : '';
    if (wert === '') delete data[feld];
    else data[feld] = wert;
  }
  const ergebnis = writeFrontmatter(raw, data);
  if (!ergebnis.ok) return { ok: false, error: 'write-failed', detail: ergebnis.error };
  try {
    await ersetzeDateiOderWirf(filePath, ergebnis.text);
  } catch (err) {
    return { ok: false, error: 'write-failed', detail: err && err.message ? err.message : '' };
  }
  return { ok: true };
}

module.exports = {
  ANGABEN_FELDER,
  readFrontmatterExcerpt,
  resolveImagePath,
  titelbildAlsDaten,
  leseAngaben,
  schreibeAngaben,
};
