// 4T-001510 (Epic 3E-000250): Die beiden Frontmatter-Behälter der Datenbank und
// die Marke, die eine Datei als Tabelle oder als Steckbrief ausweist.
//
// 4T-001550 (Epic 3E-000251): dazu die **Lese-Hilfe des Folge-Segments** (E26.3).
// Sie ist kein dritter Behälter — sie sagt nicht, was eine Datei IST, sondern
// hilft dem Menschen, der ein Folge-Segment allein öffnet. Sie steht hier, weil
// sie denselben Gegenstand hat wie die beiden anderen: ein sprachneutraler
// Frontmatter-Schlüssel der Datenbank, dessen Inhalt dieses Modul nicht auslegt.
// Ein eigenes Modul für zwei importfreie Funktionen wäre teurer als der Zuwachs.
//
// **Warum die Schlüssel hier stehen und nicht in ihren Modulen.** Der Link-Index
// muss beim Parsen jeder Datei wissen, ob sie einen der beiden Behälter trägt.
// Er lädt dafür dieses Blatt und nicht die beiden Auslege-Module: Die
// Definitions-Seite zieht die ganze Profil-Maschinerie nach sich, und der Index
// braucht von ihr kein einziges Zeichen — er merkt sich die Marke, nicht den
// Inhalt. Beide Auslege-Module reichen ihre Konstante unverändert weiter, damit
// sich für ihre Verbraucher nichts ändert.
//
// **Sprachneutral und kleingeschrieben** wie `doc-part` in
// `src/shared/document-parts.js`: Ein übersetzter Schlüssel bräche jede Datei
// beim ersten Sprachwechsel der Oberfläche.
//
// Blatt-Modul: Es importiert nichts. Prozess-neutral (kein Electron, kein DOM).
'use strict';

// Diese Datei IST eine Datenbank-Tabelle: Der Behälter trägt die
// Feld-Definitionen und die Angaben zur Tabelle als Ganzes.
//
// Die Abkürzung steht vorn und damit an hervorgehobener Stelle. Der Einwand aus
// E3.1 gegen `perspective-dbtable` trifft hier nicht: Er galt der Fence, die
// sich in der `perspective-*`-Familie um einen einzigen Buchstaben von
// `perspective-datatable` unterschieden hätte. Im Frontmatter steht der
// Schlüssel neben `doc-part` und hat keinen verwechselbaren Nachbarn.
const DB_TABLE_KEY = 'db-table';

// Diese Datei IST die Datenbank: Der Behälter trägt ihren Steckbrief.
//
// Das Präfix ist der Namensraum, das Wort dahinter der Gegenstand. Kürzer gingen
// `db-info` und `db-profile`; das erste sagt nicht, WAS die Datei ist, und das
// zweite führte die Verwechslung mit dem Eigenschafts-Profil wieder ein, die E24
// ausschließt.
const DB_DATABASE_KEY = 'db-database';

// Welche Behälter erklärt dieses Frontmatter-Objekt?
//
// **Nur die Marke, nie der Inhalt.** Der Index führt, DASS eine Datei sich als
// Tabelle oder als Steckbrief ausweist; die Definition holt der Katalog aus der
// Datei. Zwei Gründe: Die abfragbaren Properties des Index verwerfen
// verschachtelte Angaben ohnehin, und der Definitions-Behälter im Cache
// verdoppelte einen Bestand, der seine Wahrheit in der Datei hat (E26.4).
//
// Damit bleibt die Auskunft, was sie sein soll: «welche Dateien sind überhaupt
// zu betrachten», ohne die der Katalog über alle Dateien des Bereichs laufen
// müsste — die zweite Scan-Infrastruktur, die die Architektur für die ganze
// Perspective-Familie ausschließt.
//
// Eine Liste und kein Wahrheitswert, weil eine Datei beides erklären darf; ein
// Array kostet im Cache nichts und bleibt erweiterbar.
function datenbankMarken(fm) {
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return [];
  const marken = [];
  if (fm[DB_TABLE_KEY] !== undefined) marken.push('table');
  if (fm[DB_DATABASE_KEY] !== undefined) marken.push('database');
  return marken;
}

// --- Lese-Hilfe des Folge-Segments (4T-001550, E26.3) ---------------------------------

// Schlüssel der Feld-Namen im Frontmatter eines Folge-Segments.
//
// **Warum es sie überhaupt gibt.** Die Kopf-Datei ist ohne die Anwendung
// deutbar, weil sie Definition und Daten zugleich zeigt — die tragende
// Begründung von E3.2. Ein Folge-Segment ist es nicht: Es trägt nach O6 nur
// Zugehörigkeit, Position und Schema-Version, und die Zellen stehen nach E3.3
// positionsbasiert ohne Kopfzeile. Wer allein diese Datei öffnet, sähe eine
// Folge unbenannter Werte.
const DB_SEGMENT_FIELDS_KEY = 'db-fields';

// Trenner der Namensliste. Ein Leerzeichen auf beiden Seiten, weil die Liste
// für ein menschliches Auge geschrieben ist und nicht für einen Parser; beim
// Lesen wird ohnehin getrimmt.
const SEGMENT_FIELDS_SEP = ' | ';

// Formt die Namensliste eines Folge-Segments.
//
// **Sie ist Lese-Hilfe ohne Vertragswirkung** (E26.3). Bei Widerspruch gewinnt
// die Definition der Kopf-Datei, und genau deshalb braucht der Trenner keine
// Maskierung: Ein Feld-Name, der ihn selbst enthält, macht die Liste mehrdeutig,
// aber nicht falsch — sie bindet nichts. Eine Maskierung an dieser Stelle wäre
// Aufwand für eine Genauigkeit, die die Angabe gar nicht beansprucht.
//
// Liefert null bei leerer Liste; dann bleibt der Schlüssel weg, statt leer
// dazustehen.
function formatSegmentFelder(namen) {
  if (!Array.isArray(namen)) return null;
  const liste = namen
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter((n) => n.length > 0);
  return liste.length === 0 ? null : liste.join(SEGMENT_FIELDS_SEP);
}

// Zerlegt die Namensliste eines Folge-Segments. Liefert immer ein Array; eine
// fehlende oder unlesbare Angabe ergibt die leere Liste, weil ihr Fehlen kein
// Fehler ist — sie ist eine Hilfe, und eine Datei ohne sie bleibt gültig.
function parseSegmentFelder(wert) {
  if (typeof wert !== 'string') return [];
  return wert
    .split('|')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

module.exports = {
  DB_TABLE_KEY,
  DB_DATABASE_KEY,
  DB_SEGMENT_FIELDS_KEY,
  SEGMENT_FIELDS_SEP,
  datenbankMarken,
  formatSegmentFelder,
  parseSegmentFelder,
};
