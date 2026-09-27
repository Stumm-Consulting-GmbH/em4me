// 4T-001789 (Epic 3E-000255): Die Endungen der Markdown-Data-Familie an genau
// einer Stelle.
//
// Bis hierher führte jede Stelle, die eine Datei der Familie erkennen musste,
// ihre eigene Liste: die Erkennung des Hauptprozesses, die Bereichs-Statistik
// und die Öffnen-Abweisung der Oberfläche. Drei Kopien derselben Aussage
// bedeuten, dass eine neue Endung an drei Orten nachgezogen werden muss, und
// die vergessene Stelle meldet sich nicht, sie verhält sich nur anders. Die
// Beleg-Datei ist die vierte Endung der Familie; eine vierte Kopie anzulegen
// hieße, den Fehler der fünften vorzubereiten.
//
// Prozess-neutral (CommonJS, Vorbild src/shared/document-parts.js): reine
// Daten und reine Funktionen, ohne Electron, ohne DOM und bewusst ohne
// `node:path`. Der Renderer bündelt dieses Modul mit, und sein Bau kennt keine
// Node-Bausteine; die Pfad-Arbeit steht deshalb als Zeichenketten-Arbeit hier.
'use strict';

// Die vier Endungen der Familie. Ihre Bedeutung:
//   .mdd   Begleitdatei genau eines Dokuments (Historie, Block-Daten).
//   .mdda  Bereichs-Datei (Einstellungen, Index-Zwischenspeicher).
//   .mddb  Alt-Form der Bereichs-Datei; wird beim Lesen still migriert.
//   .mddl  Änderungsbelege einer Tabellen-Datei («Markdown Data Log»).
const MDD_EXT = '.mdd';
const MDDA_EXT = '.mdda';
const MDDB_EXT = '.mddb';
const MDDL_EXT = '.mddl';

// Reihenfolge ohne Bedeutung; die Liste ist eine Menge und wird nur durchsucht.
const MARKDOWN_DATA_EXTS = Object.freeze([MDD_EXT, MDDA_EXT, MDDB_EXT, MDDL_EXT]);

// Letzter Pfad-Trenner. Beide Formen, weil ein Pfad die Anwendung je nach
// Herkunft mit Schrägstrich oder mit umgekehrtem Schrägstrich erreicht.
function separatorIndex(value) {
  return Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
}

/**
 * Endung eines Pfades, kleingeschrieben und mit führendem Punkt.
 *
 * Verhält sich wie `path.extname` samt seiner Sonderregel: Ein Name, der nur
 * mit einem Punkt beginnt ('.mdd'), ist eine versteckte Datei ohne Endung und
 * nicht die Endung selbst.
 *
 * @param {string} p Datei-Pfad oder Datei-Name.
 * @returns {string} Endung mit Punkt oder leere Zeichenkette.
 */
function extensionOf(p) {
  if (!p) return '';
  const value = String(p);
  const name = value.slice(separatorIndex(value) + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot).toLowerCase();
}

/**
 * Gehört diese Datei zur Markdown-Data-Familie?
 *
 * Geprüft wird ausschließlich die Endung, nie der Inhalt. Das ist Absicht: An
 * dieser Erkennung hängen der Bereichs-Beobachter, das Direkt-Öffnen und die
 * Öffnen-Abweisung der Oberfläche, und keiner der drei darf dafür eine Datei
 * lesen müssen.
 *
 * @param {string} p Datei-Pfad oder Datei-Name.
 * @returns {boolean}
 */
function isMarkdownDataPath(p) {
  if (!p) return false;
  return MARKDOWN_DATA_EXTS.includes(extensionOf(p));
}

/**
 * Pfad einer Begleit-Datei: gleicher Ordner, gleicher Basisname, andere Endung.
 *
 * @param {string} documentPath Pfad der Datei, zu der die Begleit-Datei gehört.
 * @param {string} extension Endung der Begleit-Datei, mit führendem Punkt.
 * @returns {string}
 */
function companionPathFor(documentPath, extension) {
  const value = String(documentPath == null ? '' : documentPath);
  const cut = separatorIndex(value);
  const name = value.slice(cut + 1);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return value.slice(0, cut + 1) + stem + extension;
}

module.exports = {
  MDD_EXT,
  MDDA_EXT,
  MDDB_EXT,
  MDDL_EXT,
  MARKDOWN_DATA_EXTS,
  extensionOf,
  isMarkdownDataPath,
  companionPathFor,
};
