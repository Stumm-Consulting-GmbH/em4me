// 4T-001508 (Epic 3E-000250): Gestalt des Hinweis-Datensatzes der
// Definitions-Diagnose — der Katalog der Hinweis-Codes und der Bauplan, aus dem
// ein Hinweis entsteht.
//
// **Eigene Datei seit der Identitäts-Stufe.** Der Katalog stammt aus 4T-001506
// und lag bis dahin im Definitions-Modul. Er ist dort mit jedem Baustein
// mitgewachsen — Behälter und Beschriftung, dann Typ-Satz und Optionen, jetzt
// Kennung, Schlüssel und Anzeige-Form — und wächst weiter, mit dem Steckbrief
// und mit jeder Stufe danach. Der Schnitt folgt derselben Naht-Logik wie der von
// `property-profiles-hinweise.js` im Vorbild: Hier liegt, was EINEN Hinweis
// beschreibt, im Definitions-Modul das Lesen einer ganzen Definition. Das
// Definitions-Modul hält damit sein Datei-Budget, ohne dass die Diagnose-Fläche
// in eine Ausnahme wandert.
//
// **Eigener Katalog statt Erweiterung des Profil-Katalogs.** Die Codes hier
// beschreiben einen anderen Gegenstand, nämlich den Definitions-Behälter der
// Datenbank; `property-profiles-hinweise.js` ist ausdrücklich der Katalog der
// PROFIL-Diagnose und ein Blatt-Modul, das nichts importiert. Zwei Kataloge in
// einer Datei hätten zwei Fachlichkeiten vermischt. Die **Gestalt** bleibt
// dieselbe, damit eine Anzeige beide gleich behandeln kann:
// `{ code, index, name, key, expected }`, mit `index` als Position in der
// Definitions-Liste (`-1` für Hinweise am Behälter selbst) und `expected`
// maschinen-lesbar statt übersetzt — die Übersetzung setzt sie ein, statt sie zu
// erzeugen.
//
// Blatt-Modul: Es importiert nichts, weder aus der Datenbank noch aus dem Haus.
// Die Behälter-Schlüssel stehen deshalb hier als Zeichenketten und nicht als
// Import aus den Modulen, die sie führen; sie sind Teil der Beschreibung eines
// Hinweises und werden dort gegen die Konstanten geprüft. Seit 4T-001509 sind
// es zwei Behälter, der Definitions-Behälter der Tabelle und der Steckbrief der
// Datenbank — der Katalog trägt beide, weil beide dieselbe Diagnose-Gestalt
// haben und eine Anzeige sie gleich behandeln soll.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

// Die Codes der Angaben tragen den Namen ihrer Angabe (`type`, `label`,
// `required`, `key`, `display`); ein Prüffall hält das internen Profil und
// diesen Katalog deckungsgleich.
const HINWEIS_META = {
  // 4T-001506: der Behälter und die Gestalt eines Definitions-Eintrags.
  container: { key: 'db-table', expected: 'object' },
  fieldsNotList: { key: 'fields', expected: 'list' },
  entry: { key: null, expected: 'object' },
  name: { key: 'name', expected: null },
  duplicate: { key: 'name', expected: null },
  type: { key: 'type', expected: null }, // expected: der zulässige Spalten-Typ-Satz
  label: { key: 'label', expected: 'text-or-locale-map' },
  required: { key: 'required', expected: 'boolean' },
  // 4T-001507 (E5): Die drei Ausschlüsse tragen je einen eigenen Code, weil sie
  // je einen eigenen GRUND haben. «Unbekannter Typ» wäre für einen Autor, der
  // `object` schreibt, eine falsche Auskunft: Der Typ ist der Anwendung sehr
  // wohl bekannt, er ist an dieser Stelle ausgeschlossen — und erst die zweite
  // Aussage führt ihn zu der abhängigen Tabelle, die er stattdessen braucht.
  typeComputed: { key: 'type', expected: null }, // berechnetes Feld
  typeStructured: { key: 'type', expected: null }, // strukturierter Wert
  multipleColumn: { key: 'multiple', expected: null }, // mehrwertige Spalte
  // 4T-001507: Wertebereich, Vorgabewert und typ-eigene Angaben. Codes und
  // Ortsbezug wie in der Profil-Diagnose, weil es dasselbe Format ist (E19).
  values: { key: 'values', expected: 'list' },
  default: { key: 'default', expected: null }, // expected: der erklärte Typ
  defaultOutsideValues: { key: 'default', expected: null }, // expected: der Wertebereich
  options: { key: 'options', expected: 'object' },
  optionUnknown: { key: 'options', expected: null }, // expected: die zulässigen Schlüssel
  optionValue: { key: 'options', expected: null }, // expected: die erwartete Form
  // 4T-001508 (E5.1 bis E5.3): Identität der Datensätze. Die vier Codes hängen
  // am Behälter und nicht an einem Definitions-Eintrag; ihr `index` ist deshalb
  // immer -1.
  lastId: { key: 'lastId', expected: 'non-negative-integer' },
  key: { key: 'key', expected: 'field-name-or-list' },
  keyUnknown: { key: 'key', expected: null }, // expected: die vorhandenen Feld-Namen
  display: { key: 'display', expected: 'field-name' },
  displayUnknown: { key: 'display', expected: null }, // expected: die vorhandenen Feld-Namen
  // 4T-001509 (T1, E21.2 und E21.4): Der Steckbrief der Datenbank. Die Codes
  // hängen an seinem eigenen Behälter, nicht an einem Definitions-Eintrag; ihr
  // `index` ist deshalb immer -1. Name und Beschreibung tragen einen
  // qualifizierten Code, weil `name` hier bereits der fehlende FELD-Name eines
  // Definitions-Eintrags ist: Zwei Gegenstände teilen sich keinen Code, sonst
  // führte eine Meldung den Autor an die falsche Stelle seiner Datei.
  databaseContainer: { key: 'db-database', expected: 'object' },
  databaseName: { key: 'name', expected: 'text-or-locale-map' },
  databaseDescription: { key: 'description', expected: 'text-or-locale-map' },
  schemaVersion: { key: 'schemaVersion', expected: 'text' },
  fallbackLocale: { key: 'fallbackLocale', expected: 'locale' },
  // 4T-001510 (T1): Befunde des Katalogs. Sie entstehen nicht beim Lesen EINER
  // Datei, sondern erst im Blick über die ganze Datenbank — deshalb hängen sie
  // an keinem Schlüssel: Es ist nicht eine Angabe falsch, sondern zwei Dateien
  // beanspruchen dieselbe Rolle. `yaml` ist der dritte Fall dieser Art und
  // trägt denselben Code wie in der Profil-Diagnose, weil es dieselbe Lage ist:
  // Der Metadaten-Block der Datei ist nicht auslegbar.
  yaml: { key: null, expected: null },
  duplicateTable: { key: null, expected: null }, // name: der doppelte Tabellen-Name
  duplicateDatabase: { key: null, expected: null }, // name: der zweite Steckbrief
  // 4T-001545 (E3): Befunde am Datensatz-Block. Sie hängen an keinem
  // Frontmatter-Schlüssel, weil ihr Gegenstand der KÖRPER der Datei ist und
  // nicht ihr Metadaten-Block; ihr Ortsbezug ist die Position des Datensatzes,
  // die das Record-Modul als eigenes Feld `record` an den Hinweis hängt. Alle
  // vier sind weich: Kein Befund verwirft je einen Datensatz oder eine Zelle.
  recordStrayContent: { key: null, expected: null }, // Text außerhalb jeder Zelle
  recordCellsMissing: { key: null, expected: null }, // expected: die Zahl der Felder
  recordCellsExtra: { key: null, expected: null }, // expected: die Zahl der Felder
  recordNoDefinition: { key: null, expected: null }, // Datensätze ohne Definition
  // 4T-001546 (E3.5, E5.1): Die Angabe der Kennung am Datensatz-Marker. Sie
  // trägt ausnahmsweise einen Schlüssel, obwohl der Befund im Körper der Datei
  // liegt: `id` ist der Name der Angabe, und eine Meldung ohne ihn führte den
  // Autor nur an die Zeile, nicht an die Stelle.
  recordIdInvalid: { key: 'id', expected: 'record-id' },
};

// Baut einen Hinweis in der einheitlichen Gestalt.
function baueHinweis(code, index, name, expected) {
  const meta = HINWEIS_META[code] || { key: null, expected: null };
  return {
    code,
    index,
    name: name || null,
    key: meta.key,
    expected: expected !== undefined ? expected : meta.expected,
  };
}

// --- Der Satz zu einem Hinweis (4T-001584) --------------------------------------------
//
// **Ein Code, ein Satz, eine Stelle.** Zwei Anzeigen zeigen Befunde desselben
// Katalogs: die Übersichts-Seite der Datenbank die Fehlerlagen der Definitionen,
// der Datensatz-Block die Befunde seines Körpers. Beide übersetzen deshalb nicht
// je für sich, sondern bauen ihren Satz hier, und die Sprachdateien führen ihn
// einmal unter `database.hint.<code>`. Zwei Orte für denselben Code hießen zwei
// Formulierungen, und die zweite fiele niemandem auf.
//
// **Die Übersetzung wird hereingereicht** statt importiert, denn das Modul
// bleibt ein Blatt: Die Übersichts-Seite löst über das Werkzeug des Renderers
// auf, der Datensatz-Block über die Beschriftungs-Liste, die ihm die
// Render-Pipeline mitgibt. Beide Wege geben zu einem unbekannten Schlüssel den
// Schlüssel selbst zurück, und genau daran erkennt der Bauer die fehlende
// Fassung.

// Der Ortsbezug innerhalb einer Definitions-Liste: die Position, 1-basiert
// gezählt, mit dem Feld-Namen daneben. `index` -1 heißt «am Behälter» und hat
// keinen Ort (Muster der Profil-Diagnose).
function ortText(hinweis, uebersetze) {
  return uebersetze('database.hint.location')
    .replace('{index}', String((typeof hinweis.index === 'number' ? hinweis.index : -1) + 1))
    .replace('{name}', hinweis.name || '—');
}

// Die maschinen-lesbare Erwartung des Katalogs als Text.
function erwartungText(expected) {
  if (Array.isArray(expected)) return expected.join(', ');
  return expected === null || expected === undefined ? '' : String(expected);
}

// Die Satz-Vorlage zu einem Code, oder null, wenn keine passende vorliegt.
//
// Ein Befund am Datensatz-Block trägt die Position seines Datensatzes; fehlt
// sie, weil der Befund am ganzen Block hängt, greift die zweite Satzform
// `…ohneOrt`. Eine Grundform, die die Position nennt, taugt ohne sie nicht: Ein
// Satz mit unbesetztem Platzhalter wäre schlechter als der Rückfall.
//
// **Gefragt wird nach der zweiten Form nur, wo es sie geben kann**, also bei
// einem Befund aus dem Datensatz-Block; er ist am Feld `record` erkennbar, das
// die Diagnose einer Definition nicht führt. Der Umweg lohnt, weil ein Blick
// nach einem Schlüssel, den es nicht gibt, im Renderer eine Warnung auf der
// Konsole hinterlässt — bei jeder Fehlerlage der Übersichts-Seite eine.
function satzVorlage(code, hinweis, hatPosition, uebersetze) {
  if (!code) return null;
  const ausBlock = Object.prototype.hasOwnProperty.call(hinweis, 'record');
  if (ausBlock && !hatPosition) {
    const ohneOrt = `database.hint.${code}.ohneOrt`;
    const zweite = uebersetze(ohneOrt);
    if (zweite !== ohneOrt) return zweite;
  }
  const basis = `database.hint.${code}`;
  const text = uebersetze(basis);
  if (text === basis) return null;
  if (!hatPosition && text.includes('{position}')) return null;
  return text;
}

/**
 * Lokalisierter Satz zu einem Hinweis.
 *
 * Die Meldung je Code ist ein ganzer Satz; `{ort}` steht für die Stelle in der
 * Definitions-Liste, `{position}` für die des Datensatzes im Block, `{name}`
 * für den benannten Gegenstand und `{expected}` für die Erwartung aus dem
 * Katalog. Ein Code ohne eigenen Satz fällt auf einen Rückfall-Satz mit seiner
 * Kennung zurück, statt einen leeren Punkt zu erzeugen; kennt auch der Aufrufer
 * ihn nicht, bleibt der Code selbst stehen.
 *
 * @param {object} hinweis Hinweis in der Gestalt dieses Katalogs.
 * @param {(schluessel: string) => string} uebersetze Auflösung eines Schlüssels.
 * @returns {string} Der Satz in der Sprache des Anwenders.
 */
function hinweisSatz(hinweis, uebersetze) {
  const h = hinweis || {};
  const code = String(h.code || '');
  const hatPosition = typeof h.record === 'number';
  let text = satzVorlage(code, h, hatPosition, uebersetze);
  if (text === null) {
    const rueckfall = uebersetze('database.hint.unknown');
    if (rueckfall === 'database.hint.unknown') return code;
    return rueckfall.replace('{name}', code || '—');
  }
  if (text.includes('{ort}')) text = text.replace('{ort}', ortText(h, uebersetze));
  if (hatPosition) text = text.replace('{position}', String(h.record + 1));
  text = text.replace('{name}', h.name || '—');
  if (text.includes('{expected}')) text = text.replace('{expected}', erwartungText(h.expected));
  return text;
}

module.exports = { HINWEIS_META, baueHinweis, hinweisSatz };
