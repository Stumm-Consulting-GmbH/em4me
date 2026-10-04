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

// 4T-001938 (Epic 3E-000257, B1; E7.3): Diese Datei IST eine Einzel-Maske. Der
// Behälter trägt die eine Angabe `table`, den Namen der Tabelle, deren
// Datensätze sie zeigt; ihr Körper ist Markdown mit Feld-Platzhaltern
// (`form-body.js`). Die Maske ist ein Dokument wie jedes andere (E7.5), und
// die Marke sagt dem Index nur, dass es sie gibt.
const DB_FORM_KEY = 'db-form';

// 4T-002081 (Epic 3E-000259, F3b; E6.6): Diese Datei IST eine Abfrage-Datei.
// Der Behälter trägt in dieser Stufe keine Angabe, insbesondere kein `table`,
// weil die Abfrage ihre Tabelle selbst über `FROM` nennt (F2 Option A: die
// Abfrage steht im Text, in genau einem Abfrage-Block). Die Angaben der
// Listen-Maske aus E7.4 kommen mit der Masken-Stufe additiv hinzu. Wie bei der
// Maske sagt die Marke dem Index nur, dass es die Datei gibt; den Block zählt
// der Katalog beim Lesen.
const DB_QUERY_KEY = 'db-query';

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
// Array kostet im Cache nichts und bleibt erweiterbar. Seit 4T-001938 trägt sie
// als dritte Marke `form`; die Verbraucher fragen je Marke mit `includes` und
// sehen die dritte deshalb nicht, solange sie nicht nach ihr fragen. Seit
// 4T-002081 kommt als vierte `query` hinzu, nach demselben Muster. Erkannt wird
// an der bloßen Anwesenheit des Schlüssels, also auch `db-query:` ohne Wert,
// weil der Behälter heute nichts trägt.
function datenbankMarken(fm) {
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return [];
  const marken = [];
  if (fm[DB_TABLE_KEY] !== undefined) marken.push('table');
  if (fm[DB_DATABASE_KEY] !== undefined) marken.push('database');
  if (fm[DB_FORM_KEY] !== undefined) marken.push('form');
  if (fm[DB_QUERY_KEY] !== undefined) marken.push('query');
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

// 4T-001791 (Epic 3E-000255, E10.11): Das Wort, mit dem die Definition eine
// Wachstums-Grenze der Änderungsbelege abschaltet. Es steht in diesem Blatt, weil
// es Notation des Frontmatters ist wie die Schlüssel darüber, und weil zwei
// Module es brauchen, die einander nicht laden sollen: die Definitions-Seite, die
// es liest, und die Verdichtung, die danach handelt. Stünde es bei der
// Verdichtung, zöge die Definitions-Seite für ein einziges Wort die ganze
// Beleg-Maschinerie nach.
//
// «Unbegrenzt» ist keine Bequemlichkeit: Eine Datenbank mit lückenlosem Nachweis
// verlöre ihren Zweck, wenn die Anwendung still verdichtete.
const UNBEGRENZT = 'unlimited';

module.exports = {
  UNBEGRENZT,
  DB_TABLE_KEY,
  DB_DATABASE_KEY,
  DB_FORM_KEY,
  DB_QUERY_KEY,
  DB_SEGMENT_FIELDS_KEY,
  SEGMENT_FIELDS_SEP,
  datenbankMarken,
  formatSegmentFelder,
  parseSegmentFelder,
};
