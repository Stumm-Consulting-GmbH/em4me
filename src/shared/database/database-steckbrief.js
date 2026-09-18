// 4T-001509 (Epic 3E-000250, Baustein T1 und E21.4): Der Steckbrief der
// Datenbank — die einzige Stelle, an der eine Datenbank sich als GANZES
// beschreibt statt tabellenweise.
//
// Vier Angaben stehen darin: Name und Beschreibung als übersetzbare
// Beschriftungen (E21.2), die Schema-Version für den späteren Update-Weg beim
// Empfänger einer weitergegebenen Datenbank (T17) und die Rückfall-Sprache,
// nach der Beschriftungen aufgelöst werden, wenn die Sprache des Anwenders
// nicht gepflegt ist (E21.4).
//
// --- Der Ablage-Ort und wie er zustande kam ----------------------------------------
//
// **Entscheidung des Product Owners vom 2026-09-06**, auf Vorlage: Der
// Steckbrief steht im Frontmatter eines gewöhnlichen Markdown-Dokuments in der
// Datenbank — genau so, wie eine Tabelle ihre Definition trägt. Er liegt weder
// in der Bereichsdatei `Area_Settings.mdda` noch in einer Begleitdatei.
//
// Der Ort ist aus dem Entscheidungs-Baum der Ablage-Regel abgeleitet
// (Architektur, «Ablage-Regel für Daten der Anwendung») und nicht neben ihr
// gewählt, wie E10 es für die Belege und E27 für die Kartei-Tabelle vorgemacht
// haben. Der Weg durch die sechs Fragen:
//
//   Gegenstand  Die Datenbank als Ganzes. Nach Kapitel 5 des Konzepts hat der
//               Bereich die Rolle des Mandanten: Er grenzt eine Datenbank gegen
//               eine andere ab. Der Steckbrief liegt damit auf der Ebene
//               «Bereich» — die Frage, die der Baum ausdrücklich nicht
//               beantwortet und die vor ihm zu klären war.
//   F1          Nicht ableitbar; alle vier Angaben setzt der Autor.
//   F2          Beschreibt ihren Gegenstand, kein Momentzustand.
//   F3          Ebene Bereich (siehe Gegenstand).
//   F4          **Ja, und das entscheidet.** T1 nennt Markdown-Dateien als
//               Träger der Definitionen, und der Steckbrief ist ausdrücklich
//               Teil von T1. Dieselbe Frage hat bereits zweimal so entschieden:
//               bei der Tabellen-Definition (E1, benannter Mangel zu I2) und
//               bei der Kartei-Tabelle (E27), wo eine `.mdda`-Datei nach dem
//               Muster von Buch und Regal aus genau diesem Grund ausschied. Die
//               Bereichsdatei erscheint in keiner Dateiliste, die Volltext-Suche
//               sieht sie nicht, und außerhalb der Anwendung ist sie unbrauchbar.
//   F5          Gehört dem Anwender: sichtbar ins Dokument, ins Frontmatter,
//               weil es eine Aussage ÜBER das Dokument ist.
//   F6          Ohne eigenes Gewicht und nicht regenerierbar; er liegt IM
//               Bestand seiner Ebene und nicht daneben.
//
// **Was NICHT hierher gehört, obwohl das Konzept es hier verortet.** E10.5 legt
// den Hochwasserstand der Vorgangs-Kennung «in den Steckbrief». Dieser Zähler
// wächst bei JEDEM Schreibvorgang. In einem Dokument des Anwenders hätte er
// nichts zu suchen: F5 sagt, was die Anwendung führt, überschreibt sie nie mit
// Eigenem im Text des Anwenders, und F6 macht aus dem Schreib-Takt eigenes
// Gewicht. Der Steckbrief trägt damit zwei Naturen, und nur die beschreibende
// ist hier verortet. Der Ort des Zählers wird in der Stufe entschieden, die ihn
// baut (Stufe 2); hier wird er allein benannt, damit die Lücke nicht als
// Versehen erscheint. Festgehalten mit der Entscheidung vom 2026-09-06.
//
// --- Eindeutigkeit ------------------------------------------------------------------
//
// Eine Datenbank hat höchstens einen Steckbrief (I1: ein Ort je Aussage). Der
// Dateiname ist frei wie bei einer Tabellen-Datei, erkannt wird am
// Frontmatter-Behälter. Zwei Dokumente mit Steckbrief sind damit technisch
// möglich; die Auflösung gehört an die Stelle, die über eine ganze Datenbank
// blickt, also an den Katalog (4T-001510) und nicht hierher — dieses Modul
// liest EIN Dokument und weiß von keinem zweiten. Die Linie steht fest: melden,
// nie still auflösen (E9.5, E20.3).
//
// --- Kein zweites internes Profil ---------------------------------------------------
//
// Die Gestalt der Tabellen-Definition beschreibt nach E24 ein internes Profil,
// weil dort ein Wertevorrat (der Spalten-Typ-Satz) an zwei Stellen gebraucht
// wird und sonst auseinanderliefe. Der Steckbrief hat keinen Wertevorrat und
// vier feste Angaben; ein Profil wäre hier Zeremonie ohne Gegenwert. Die
// Erwägung steht hier, damit die Abweichung vom Nachbar-Modul sichtbar ist und
// nicht als Vergesslichkeit gelesen wird.
//
// Blatt-Modul innerhalb der Datenbank: Es lädt allein `beschriftung.js` und
// `table-hinweise.js`, beides Blätter; die Definitions-Seite kennt es nicht.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const {
  istEinfachesObjekt,
  alsText,
  normalisiereBeschriftung,
  ersteSprache,
} = require('./beschriftung.js');
const { baueHinweis } = require('./table-hinweise.js');

// --- Der Behälter ------------------------------------------------------------------

// Frontmatter-Schlüssel des Steckbriefs. Er liegt seit 4T-001510 im Blatt-Modul
// `behaelter.js`, weil der Link-Index ihn braucht; die Begründung der Benennung
// steht dort. Hier bleibt der Weiterreicher für die Verbraucher dieses Moduls.
const { DB_DATABASE_KEY } = require('./behaelter.js');

// Die vier Angaben, in der Reihenfolge, in der sie gelesen werden.
// Sprachneutral wie die Schlüssel des Definitions-Behälters (`fields`,
// `lastId`, `key`, `display`), aus demselben Grund.
const DB_INFO_KEYS = ['name', 'description', 'schemaVersion', 'fallbackLocale'];

// Die beiden übersetzbaren Angaben (E21.2). Beide Formen bleiben gültig, Text
// wie Sprach-Zuordnung.
const DB_LABEL_KEYS = ['name', 'description'];

// Hinweis-Code je Angabe. Name und Beschreibung tragen einen eigenen Code, weil
// `name` im Hinweis-Katalog bereits der fehlende FELD-Name eines
// Definitions-Eintrags ist und zwei Gegenstände sich keinen Code teilen dürfen.
const HINWEIS_CODE = {
  name: 'databaseName',
  description: 'databaseDescription',
  schemaVersion: 'schemaVersion',
  fallbackLocale: 'fallbackLocale',
};

// --- Normalisierung ----------------------------------------------------------------

// Die Schema-Version ist **Text und nur Text**, auch wenn sie wie eine Zahl
// aussieht. Grund ist eine stille Verfälschung: YAML liest `schemaVersion: 1.0`
// als Gleitkommazahl, und der Weg zurück in Text ergäbe `1`, also eine andere
// Version als die geschriebene. Eine Version, die sich beim Lesen ändert, ist
// für den Update-Weg aus T17 schlimmer als eine, die gemeldet entfällt. Der
// Autor schreibt sie in Anführungszeichen; der Hinweis sagt es ihm.
//
// Ausgewertet wird sie in dieser Stufe nicht (der Update-Weg gehört zu Stufe
// 6); geführt wird sie ab jetzt, weil eine Datenbank, die ohne Schema-Version
// entstanden ist, beim Empfänger später nicht gezielt aktualisiert werden kann.
function normalisiereSchemaVersion(roh) {
  return alsText(roh);
}

// Sprach-Kennung der Rückfall-Sprache, kleingeschrieben geführt wie die
// Kennungen einer Beschriftungs-Zuordnung. Gegen die fünf Sprachen der
// Anwendung wird **nicht** geprüft: Eine fremde Datenbank darf eine Sprache
// führen, die die Anwendung nicht kennt, und die Rückfall-Kette aus E21.4 hat
// für diesen Fall ihre weiteren Stufen.
function normalisiereSprache(roh) {
  const text = alsText(roh);
  return text === null ? null : text.toLowerCase();
}

function normalisiereAngabe(schluessel, roh) {
  if (DB_LABEL_KEYS.includes(schluessel)) return normalisiereBeschriftung(roh);
  if (schluessel === 'schemaVersion') return normalisiereSchemaVersion(roh);
  return normalisiereSprache(roh);
}

// --- Der Parser --------------------------------------------------------------------

// Trägt der Metadaten-Block den Steckbrief-Behälter? Die bloße ANWESENHEIT des
// Schlüssels weist die Datei aus, unabhängig davon, ob sein Inhalt brauchbar
// ist — dieselbe Regel wie bei `istTabellenDokument` und aus demselben Grund:
// Ein defekter Steckbrief ist ein Steckbrief mit einem Fehler und nicht
// plötzlich ein gewöhnliches Dokument.
function istSteckbriefDokument(data) {
  return istEinfachesObjekt(data) && data[DB_DATABASE_KEY] !== undefined;
}

// Liest den Steckbrief aus dem Frontmatter-Objekt eines Dokuments.
//
// Liefert { istSteckbrief, hints } plus — nur wenn die Datei sie trägt — die
// gelesenen Angaben { name, description, schemaVersion, fallbackLocale }. Das
// ist dieselbe Regel wie bei den Identitäts-Angaben der Tabelle und hält den
// Unterschied zwischen «keine Angabe» und «Angabe, die verworfen wurde»
// sichtbar. Fehler-Codes:
//   databaseContainer    Behälter ist kein einfaches Objekt (keine Angaben)
//   databaseName         Name weder Text noch Sprach-Zuordnung (entfällt)
//   databaseDescription  Beschreibung weder Text noch Sprach-Zuordnung (entfällt)
//   schemaVersion        Schema-Version ist kein Text (entfällt)
//   fallbackLocale       Rückfall-Sprache ist keine Sprach-Kennung (entfällt)
//
// **Ein fehlender oder unvollständiger Steckbrief macht die Datenbank nie
// unbrauchbar.** Jede Angabe fehlt für sich: Ohne Namen hat die Datenbank
// keinen und wird über ihren Ordner benannt, ohne Beschreibung fehlt Prosa,
// ohne Schema-Version fehlt dem Empfänger später der Anhaltspunkt für ein
// gezieltes Update, ohne Rückfall-Sprache greift der abgeleitete Vorgabewert
// unten. Die Tabellen bleiben in jedem dieser Fälle vollständig deutbar, weil
// jede ihre Definition selbst trägt (I3).
//
// Angaben, die dieses Modul (noch) nicht beschreibt, bleiben unangetastet und
// hinweisfrei — dieselbe Zusage, die der Definitions-Behälter über alle seine
// Stufen gehalten hat: Eine Datei, die für eine spätere Stufe geschrieben
// wurde, darf heute schon dastehen, ohne Schaden anzurichten. Das betrifft
// ausdrücklich den Hochwasserstand der Vorgangs-Kennung aus E10.5 (siehe
// Datei-Kopf).
function parseSteckbrief(data) {
  const hints = [];
  if (!istSteckbriefDokument(data)) return { istSteckbrief: false, hints };
  const behaelter = data[DB_DATABASE_KEY];
  // Ein leerer Behälter ist eine Datenbank, die sich noch nicht beschrieben hat
  // — kein Fehler, sondern der Zustand unmittelbar nach dem Anlegen.
  if (behaelter === null) return { istSteckbrief: true, hints };
  if (!istEinfachesObjekt(behaelter)) {
    hints.push(baueHinweis('databaseContainer', -1, null));
    return { istSteckbrief: true, hints };
  }

  const ergebnis = { istSteckbrief: true, hints };
  for (const schluessel of DB_INFO_KEYS) {
    const roh = behaelter[schluessel];
    // Eine nicht gesetzte Angabe ist kein Verstoß: Der Steckbrief hat keine
    // Pflichtangabe, weil eine Datenbank ohne ihn arbeitsfähig bleibt.
    if (roh === undefined || roh === null || roh === '') continue;
    const wert = normalisiereAngabe(schluessel, roh);
    if (wert === null) hints.push(baueHinweis(HINWEIS_CODE[schluessel], -1, null));
    else ergebnis[schluessel] = wert;
  }
  return ergebnis;
}

// --- Die wirksame Rückfall-Sprache --------------------------------------------------

// Welche Sprache gilt, wenn die Anwendung eine Beschriftung nicht in der
// aktiven Sprache findet? Die zweite Stufe der Rückfall-Kette aus E21.4:
//
//   1. die im Steckbrief benannte Rückfall-Sprache, wenn eine dasteht;
//   2. sonst ihr Vorgabewert, die Sprache der ERSTEN geschriebenen
//      Beschriftung;
//   3. sonst nichts — dann greifen die weiteren Stufen der Kette (erste
//      vorhandene Fassung, technischer Name), die zur Auflösung gehören und
//      nicht zum Steckbrief.
//
// **Warum der Vorgabewert überhaupt abgeleitet wird und nicht Englisch ist:**
// E21.4 weicht hier bewusst von der Anwendung ab, deren Rückfall `en` lautet.
// Für eine Add-on-Datenbank wäre das falsch, weil ein spanischer Autor Spanisch
// pflegt und ein erzwungenes Englisch einem spanischen Anwender im Zweifel gar
// nichts zeigte.
//
// Die weiteren Beschriftungen sind ein durchgereichter Parameter und keine
// eigene Suche: Dieses Modul liest ein Dokument und kennt die Tabellen der
// Datenbank nicht. Wer über die ganze Datenbank blickt, reicht deren
// Beschriftungen in Lese-Reihenfolge nach; das ist Sache des Katalogs.
function wirksameRueckfallSprache(steckbrief, weitereBeschriftungen = []) {
  if (steckbrief && steckbrief.fallbackLocale) return steckbrief.fallbackLocale;
  const kandidaten = [];
  for (const schluessel of DB_LABEL_KEYS) {
    if (steckbrief && steckbrief[schluessel] !== undefined) kandidaten.push(steckbrief[schluessel]);
  }
  kandidaten.push(...weitereBeschriftungen);
  for (const beschriftung of kandidaten) {
    const sprache = ersteSprache(beschriftung);
    if (sprache !== null) return sprache;
  }
  return null;
}

module.exports = {
  DB_DATABASE_KEY,
  DB_INFO_KEYS,
  DB_LABEL_KEYS,
  istSteckbriefDokument,
  parseSteckbrief,
  wirksameRueckfallSprache,
};
