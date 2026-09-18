// 4T-001508 (Epic 3E-000250, E5.1 bis E5.3): Die Identität eines Datensatzes —
// die interne Kennung samt ihrem Hochwasserstand, der fachliche Schlüssel und
// die Anzeige-Form.
//
// **Die Identität entsteht in der Definition, nicht in den Daten.** Das ist der
// Kern von E5.1 und der Grund für dieses Modul: Wer die nächste Kennung aus dem
// Bestand ableitet, muss alle Segmente einer großen Tabelle lesen — und er
// vergibt die Kennung des gelöschten höchsten Datensatzes ein zweites Mal. Ein
// wiederverwendeter Schlüssel ist in einem Datenspeicher mit Belegen, Verweisen
// und weitergegebenen Add-ons ein Datenverlust ohne Fehlermeldung.
//
// **Das Haus-Vorbild ist hier ausdrücklich ein Gegenbeispiel** und wird nicht
// kopiert: Die Ereignisse vergeben ihre Kennungen erst bei der ersten
// Verknüpfung und nehmen dabei die **kleinste freie** Nummer
// (`nextEventId` in src/shared/events/events-core.js). Für ein Dokument mit
// einer Handvoll Einträgen ist das richtig; für eine Datenbank ist es der
// beschriebene Datenverlust.
//
// Blatt-Modul innerhalb der Datenbank: Es lädt weder `table-definition.js` noch
// `table-columns.js` (die Richtung ist umgekehrt) und aus dem Haus nichts.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

// --- Die Kennung -------------------------------------------------------------------

// Kennzeichen vor der laufenden Nummer, **für jede Tabelle dasselbe**
// (Entscheidung des Product Owners vom 2026-09-06). Das Konzept schreibt in
// seinem Beispiel `p-` für eine Personen-Tabelle, sagt aber nirgends, woher der
// Buchstabe kommt; die Frage war damit offen.
//
// Nicht gewählt wurde die Ableitung aus dem Tabellen-Namen. Sie hätte die
// Kennung sprechender gemacht, aber zwei Preise gehabt: eine Ausweich-Regel für
// Tabellen mit gleichem Anfangsbuchstaben und, schwerer wiegend, einen Bruch der
// Zusage aus E3, dass das **Umbenennen einer Tabelle folgenlos** bleibt und die
// Daten nicht anfasst. Nach einer Umbenennung trüge jeder vorhandene Datensatz
// ein Kennzeichen, das nicht mehr zu seiner Tabelle passt.
//
// Die Tabelle steht im Verweis ohnehin davor (`[[Personen#^r-00042]]`); das
// Kennzeichen muss sie nicht ein zweites Mal nennen. Es unterscheidet die
// Datensatz-Kennung von einem gewöhnlichen Block-Anker, und das genügt.
const RECORD_ID_PREFIX = 'r-';

// **Mindest-Breite ohne Obergrenze** (E5.1): `r-00042` bis `r-99999`, danach
// `r-100000`. Die Sortier-Optik des Regelfalls bleibt erhalten, ohne eine
// Grenze einzuziehen, deren Überschreitung ein Formatbruch wäre — die
// zehntausendundeinte Zeile einer Tabelle darf keine Formatentscheidung
// erzwingen.
const RECORD_ID_MIN_DIGITS = 5;

// Eine Kennung ist gültig, wenn sie das Kennzeichen trägt und danach nur
// Ziffern. Führende Nullen sind erlaubt und bedeutungslos: `r-00042` und
// `r-42` bezeichnen denselben Datensatz, geschrieben wird immer die
// aufgefüllte Form.
const RECORD_ID_RE = new RegExp(`^${RECORD_ID_PREFIX}(\\d+)$`);

// Nummer -> Kennung. Nur eine positive ganze Zahl ergibt eine; alles andere
// liefert null, statt eine erfundene Kennung zu bilden.
function kennungFuer(nummer) {
  if (typeof nummer !== 'number' || !Number.isInteger(nummer) || nummer < 1) return null;
  return RECORD_ID_PREFIX + String(nummer).padStart(RECORD_ID_MIN_DIGITS, '0');
}

// Kennung -> Nummer, oder null. Nimmt beide Schreibweisen an (aufgefüllt und
// nicht aufgefüllt), weil eine von Hand geschriebene Datei die kürzere tragen
// darf und der nächste Schreibvorgang sie ohnehin auffüllt — dasselbe Muster,
// mit dem E3 die Fence-Länge repariert.
function nummerAus(kennung) {
  if (typeof kennung !== 'string') return null;
  const treffer = RECORD_ID_RE.exec(kennung.trim());
  if (!treffer) return null;
  const nummer = parseInt(treffer[1], 10);
  return Number.isSafeInteger(nummer) && nummer >= 1 ? nummer : null;
}

// --- Der Hochwasserstand -----------------------------------------------------------

// Höchste je vergebene Nummer einer Tabelle. Eine Zahl unter null gibt es
// nicht; null (keine Angabe) heißt «noch keine Kennung vergeben» und ist der
// Zustand einer frisch angelegten Tabelle.
function normalisiereHochwasserstand(roh) {
  if (typeof roh !== 'number' || !Number.isInteger(roh) || roh < 0) return null;
  return roh;
}

// Die nächste Kennung und der Stand danach.
//
// **Gezogen wird beim Eröffnen einer Neuanlage, nicht beim Speichern**
// (Präzisierung aus der E7-Runde). Zwei gleichzeitig eröffnete Neuanlagen
// bekämen sonst dieselbe Kennung, und eine Maske, in der eine Position auf
// einen noch nicht gespeicherten Kopf verweist, trägt nur, wenn die Kennung ab
// dem Anlegen existiert. **Eine abgebrochene Neuanlage hinterlässt damit eine
// Lücke in der Nummernfolge. Das ist gewollt** und entspricht dem Verhalten der
// Sequenzen etablierter Datenbanksysteme; die Alternative wäre die
// Wiederverwendung, die E5.1 ausschließt.
//
// Reine Funktion: Sie zieht die Kennung und liefert den neuen Stand zurück,
// **sie schreibt ihn nicht**. Wer sie ruft, hält den Stand fest — dieselbe
// Trennung, mit der die Werkzeuge dieses Projekts nie von sich aus den
// Arbeitsbaum ändern.
function naechsteKennung(hochwasserstand) {
  const stand = normalisiereHochwasserstand(hochwasserstand) || 0;
  const nummer = stand + 1;
  return { kennung: kennungFuer(nummer), nummer, hochwasserstand: nummer };
}

// --- Fachlicher Schlüssel und Anzeige-Form -----------------------------------------

function alsText(wert) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  return text === '' ? null : text;
}

// Der fachliche Schlüssel als Liste von Feld-Namen (E5.3). **Optional**, weil
// eine Bewegungs- oder Messwert-Tabelle keinen sinnvollen menschenlesbaren
// Schlüssel hat und ein erzwungener eine Pflichtangabe ohne Gegenwert wäre.
// Einteilig ist der Regelfall, mehrteilig zulässig; ein einzelner Name darf
// deshalb ohne Liste dastehen, nach dem Muster von `exclude` in der
// Profil-Vererbung.
//
// **Ein Schlüssel-Teil darf selbst ein Datensatz-Verweis sein** (Prüfstein
// Medien-Ausleihe: die Zwischentabelle hat einen Schlüssel aus zwei Verweisen).
// Hier steht dazu nichts Besonderes, und das ist der Punkt — ein Schlüssel-Teil
// ist ein Feld-Name, und welchen Typ dieses Feld trägt, spielt keine Rolle.
//
// **Ein defekter Teil setzt den ganzen Schlüssel aus**, wie eine defekte
// Pfad-Liste im Options-Katalog: Ein halber Schlüssel ist kein Schlüssel,
// sondern eine falsche Eindeutigkeits-Zusage.
function normalisiereSchluessel(roh, bekannteFelder) {
  if (roh === undefined || roh === null) return { schluessel: null, code: null };
  const liste = Array.isArray(roh) ? roh : [roh];
  if (liste.length === 0) return { schluessel: null, code: 'key' };
  const namen = [];
  for (const eintrag of liste) {
    const name = alsText(eintrag);
    if (name === null) return { schluessel: null, code: 'key' };
    if (!trifftFeld(name, bekannteFelder)) return { schluessel: null, code: 'keyUnknown' };
    if (!namen.some((v) => v.toLowerCase() === name.toLowerCase())) namen.push(name);
  }
  return { schluessel: namen, code: null };
}

// Die Anzeige-Form: der Name des Feldes, mit dem ein Datensatz benannt wird,
// wenn ihn etwas anzeigt (E5.3). Vorbild im Haus ist `link.display`, das
// dasselbe eine Ebene tiefer tut.
function normalisiereAnzeigeForm(roh, bekannteFelder) {
  if (roh === undefined || roh === null) return { anzeige: null, code: null };
  const name = alsText(roh);
  if (name === null) return { anzeige: null, code: 'display' };
  if (!trifftFeld(name, bekannteFelder)) return { anzeige: null, code: 'displayUnknown' };
  return { anzeige: name, code: null };
}

function trifftFeld(name, bekannteFelder) {
  const liste = Array.isArray(bekannteFelder) ? bekannteFelder : [];
  return liste.some((feld) => String(feld && feld.name).toLowerCase() === name.toLowerCase());
}

// Welches Feld benennt einen Datensatz? Die Auflösung in einer Funktion, damit
// jede Anzeige dieselbe Antwort bekommt:
//
//   1. die ausdrückliche Anzeige-Form, wenn eine dasteht;
//   2. sonst der fachliche Schlüssel, **wenn er einteilig ist** — dann fallen
//      beide zusammen (E5.3), und eine eigene Angabe wäre Zeremonie;
//   3. sonst nichts.
//
// **Der dritte Fall ist benannt und kein Mangel:** Eine Tabelle ohne fachlichen
// Schlüssel und ohne Anzeige-Form ist zulässig (E5.3). Auf sie führt kein
// handgeschriebener Verweis, und die Anwendung benennt ihre Datensätze über die
// interne Kennung. Genau das liefert `null` hier — die Anzeige weiß damit, dass
// sie auf die Kennung zurückfällt, statt eine leere Zeile zu zeigen.
function anzeigeSpalte(definition) {
  if (!definition || typeof definition !== 'object') return null;
  if (definition.display) return definition.display;
  const schluessel = definition.key;
  if (Array.isArray(schluessel) && schluessel.length === 1) return schluessel[0];
  return null;
}

module.exports = {
  RECORD_ID_PREFIX,
  RECORD_ID_MIN_DIGITS,
  kennungFuer,
  nummerAus,
  normalisiereHochwasserstand,
  naechsteKennung,
  normalisiereSchluessel,
  normalisiereAnzeigeForm,
  anzeigeSpalte,
};
