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
  // 4T-001833 (Epic 3E-000254): Eine unmaskierte Zeile, die wie ein Code-Zaun
  // beginnt und als Inhalt gelesen wird. Ebenso weich: Die Zeile bleibt Inhalt,
  // der nächste Schreibvorgang maskiert sie.
  recordFenceLine: { key: null, expected: null },
  // 4T-001546 (E3.5, E5.1): Die Angabe der Kennung am Datensatz-Marker. Sie
  // trägt ausnahmsweise einen Schlüssel, obwohl der Befund im Körper der Datei
  // liegt: `id` ist der Name der Angabe, und eine Meldung ohne ihn führte den
  // Autor nur an die Zeile, nicht an die Stelle.
  recordIdInvalid: { key: 'id', expected: 'record-id' },
  // 4T-001791 (E10.11): Die Übersteuerung der Wachstums-Grenze der
  // Änderungsbelege. Die drei Codes hängen am Behälter der Tabelle und nicht an
  // einem Definitions-Eintrag, weil die Angaben die Tabelle als Ganzes
  // betreffen; ihr `index` ist deshalb immer -1. Jede Angabe trägt ihren
  // eigenen Code, damit die Meldung den Autor an die Zeile führt, die er
  // ändern muss, und nicht an den Behälter darüber.
  changeLog: { key: 'changeLog', expected: 'object' },
  changeLogMaxBytes: { key: 'maxBytes', expected: 'positive-integer-or-unlimited' },
  changeLogMaxPerRecord: { key: 'maxPerRecord', expected: 'positive-integer-or-unlimited' },
  // 4T-001930 (Epic 3E-000256, E22): Die Prüfregeln. Die Feld-Regeln hängen an
  // ihrem Definitions-Eintrag und tragen dessen Stelle; die Datensatz-Regeln
  // hängen am Behälter, ihr `index` ist deshalb immer -1, und ihr `name` ist der
  // Text der Regel, weil sie an keinem Feld hängen, das sie benennen könnte.
  // **Zwei Reichweiten teilen sich keinen Code**, dieselbe Regel wie bei `name`
  // und `databaseName`: Ein Satz, der die Stelle in der Definitions-Liste nennt,
  // taugt für eine Regel am Behälter nicht, und einer ohne Stelle führte den
  // Autor bei einer Feld-Regel nicht zum Feld.
  check: { key: 'check', expected: 'rule-text-or-object' },
  checkRegex: { key: 'check', expected: 'regex' },
  checkExpr: { key: 'check', expected: 'expression' },
  checkFieldRef: { key: 'check', expected: 'value' }, // der einzige zulässige Bezug
  checkUnknownRule: { key: 'check', expected: null }, // expected: der Katalog der Regel-Namen
  checkMessage: { key: 'message', expected: 'text-or-locale-map' },
  checksNotList: { key: 'checks', expected: 'list' },
  checksEntry: { key: 'checks', expected: 'rule-text-or-object' },
  checksExpr: { key: 'checks', expected: 'expression' },
  checkUnknownField: { key: 'checks', expected: null }, // expected: die vorhandenen Feld-Namen
  checksMessage: { key: 'message', expected: 'text-or-locale-map' },
  // 4T-001932 (Epic 3E-000256, E22.7): Die Bearbeitbarkeits-Bedingung. Sie hängt
  // am Behälter wie eine Datensatz-Regel, ihr `index` ist deshalb immer -1 und
  // ihr `name` der Text der Bedingung. Eigene Codes statt der `checks*`-Codes,
  // weil die Sätze eine andere Folge nennen: Eine unbrauchbare Bedingung
  // entfällt, und die Tabelle bleibt bearbeitbar. Alle vier tragen den
  // Schlüssel der Angabe, auch die Meldung, damit der Autor die eine Stelle
  // findet, an der die Bedingung steht.
  editable: { key: 'editable', expected: 'rule-text-or-object' },
  editableExpr: { key: 'editable', expected: 'expression' },
  editableUnknownField: { key: 'editable', expected: null }, // expected: die vorhandenen Feld-Namen
  editableMessage: { key: 'message', expected: 'text-or-locale-map' },
  // 4T-002312 (Epic 3E-000263, F4 A): dieselbe Bedingung am Feld. Sie hängt an
  // ihrem Definitions-Eintrag und trägt dessen Stelle und Feld-Namen wie eine
  // Feld-Regel; eigene Codes, weil die Folge eine andere ist: Das Feld bleibt
  // bearbeitbar, nicht die Tabelle.
  fieldEditable: { key: 'editable', expected: 'rule-text-object-or-boolean' },
  fieldEditableExpr: { key: 'editable', expected: 'expression' },
  fieldEditableUnknownField: { key: 'editable', expected: null }, // expected: die vorhandenen Feld-Namen
  fieldEditableMessage: { key: 'message', expected: 'text-or-locale-map' },
  // 4T-001938 (Epic 3E-000257, B5): Die Einzel-Maske. `formTable` hängt am
  // Behälter der Masken-Datei und trägt den Schlüssel seiner einen Angabe. Die
  // beiden Befunde am Körper hängen an keinem Frontmatter-Schlüssel, weil ihr
  // Gegenstand der Körper ist, wie bei den Befunden am Datensatz-Block; ihr
  // Ortsbezug ist die Zeile im Körper, die `form-body.js` als Feld `zeile` an
  // den Hinweis hängt.
  formTable: { key: 'table', expected: 'text' },
  formPlatzhalterUnbekannt: { key: null, expected: null }, // name: der Inhalt der Klammern
  formFeldUnbekannt: { key: null, expected: null }, // name: der geschriebene Feld-Name
  // 4T-002183 (Epic 3E-000261, S5): ein Wert-Platzhalter, dessen Ausdruck sich
  // nicht lesen lässt. Ortsbezug wie bei den beiden Befunden darüber die Zeile.
  formAusdruckUngueltig: { key: null, expected: null }, // name: der Ausdruck
  // 4T-002186 (Epic 3E-000261, E7.8, S5): die drei Fehlerbilder der bedingten
  // Bereiche, Ortsbezug wie oben die Zeile im Körper; `name` ist beim offenen
  // Bereich und bei der ungültigen Bedingung der Text der Bedingung, beim `end`
  // ohne Bereich leer.
  formEndOhneWhen: { key: null, expected: null },
  formWhenOhneEnd: { key: null, expected: null }, // name: die Bedingung
  formBedingungUngueltig: { key: null, expected: null }, // name: die Bedingung
  // 4T-002252 (Epic 3E-000262, F6 A): ein Punkt-Name in Wert oder Bedingung,
  // dessen Kopf kein Feld der Definition ist; auch die Maske meldet so ein
  // Ziel-Feld, das die Ziel-Tabelle nicht führt. Ortsbezug die Zeile.
  formPfadUnbekannt: { key: null, expected: null }, // name: der Pfad
  // 4T-001943 (Epic 3E-000257, B2): Befund des Katalogs an einer Masken-Datei. Er
  // entsteht erst im Blick über alle Dateien, wie `duplicateTable`, und trägt
  // den Schlüssel der Angabe, die die unbekannte Tabelle nennt. Der frühere
  // Befund «mehrere Masken-Dateien» ist mit 4T-002184 entfallen: Mehrere Masken
  // je Tabelle sind seither erlaubt (F2 A).
  formTabelleUnbekannt: { key: 'table', expected: null }, // name: die genannte Tabelle
  // 4T-002184 (Epic 3E-000261, F1 A, F2 A): Die Angabe `form` der
  // Tabellen-Definition, die die Standard-Maske nennt. Alle drei hängen am
  // Behälter der Tabelle (`index` -1) und tragen den Schlüssel ihrer Angabe.
  // `form` entsteht beim Lesen der Definition (kein brauchbarer Name), die
  // beiden übrigen erst im Katalog, weil nur er alle Masken-Dateien kennt. In
  // allen drei Fällen gilt die Regel «ohne Angabe»: die erste Masken-Datei der
  // Tabelle nach Pfad, sonst die erzeugte Maske.
  form: { key: 'form', expected: 'form-file-name' },
  formDateiUnbekannt: { key: 'form', expected: null }, // name: die Angabe
  formDateiFremd: { key: 'form', expected: null }, // name: die Angabe, expected: deren Tabelle
  // 4T-002081 (Epic 3E-000259, Festlegungen 13 und 14): Befunde des Katalogs an
  // Abfrage-Dateien. Ihr Gegenstand ist der Text der Datei, nicht der Behälter
  // `db-query`, der nichts trägt; sie hängen deshalb an keinem Schlüssel. Die
  // Datei bleibt in beiden Fällen ein gewöhnliches Dokument. Die Codes heißen
  // nach der Fence und nicht nach dem Block, weil «Block» die Zeichenfolge
  // «lock» trägt und der Wächter der Sperr-Texte (`db-sperr-ordnername.test.js`)
  // jeden Sprach-Schlüssel mit ihr als Text zur Sperre läse.
  queryOhneFence: { key: null, expected: null },
  queryMehrereFences: { key: null, expected: null }, // name: die Zahl der Abfrage-Blöcke
  // 4T-002248 (Epic 3E-000262, F1 A): Die Angaben der Listen-Maske im Behälter
  // `db-query` (`list-angaben.js`). Alle hängen am Behälter (`index` -1) und
  // tragen den Schlüssel ihrer Angabe, damit die Meldung den Autor an die eine
  // Zeile führt. Die Folge ist in jedem Fall benannt: Eine unbrauchbare Angabe
  // entfällt, und die Datei bleibt eine lesbare Abfrage-Datei. Der Schlüssel
  // einer unbekannten Angabe ist die Angabe selbst; der Katalog kann ihn
  // deshalb nicht vorgeben, und der Hinweis trägt ihn einzeln.
  listEditable: { key: 'editable', expected: 'boolean' },
  listForm: { key: 'form', expected: 'form-file-name' },
  listAllow: { key: 'allow', expected: 'list-of-operations' },
  listAllowUnbekannt: { key: 'allow', expected: null }, // name: das Wort, expected: die Handgriffe
  listOhneEditable: { key: 'editable', expected: null },
  listAngabeUnbekannt: { key: null, expected: null }, // name und key: der Schlüssel
  // Befund des Katalogs wie `formDateiUnbekannt`: Erst er kennt alle
  // Masken-Dateien. Ob die Maske zur Tabelle der Abfrage gehört, ist hier noch
  // nicht prüfbar, weil die Tabelle erst aus `FROM` folgt.
  listFormDateiUnbekannt: { key: 'form', expected: null }, // name: die Angabe
  // 4T-002249 (S1): Befund der Listen-Auskunft, die als erste die Tabelle aus
  // `FROM` kennt: `form` trifft eine Masken-Datei, aber die einer anderen
  // Tabelle. Gestalt wie `formDateiFremd` der Tabellen-Definition.
  listFormDateiFremd: { key: 'form', expected: null }, // name: die Angabe, expected: deren Tabelle
  // 4T-002253 (Epic 3E-000262, F5 A, S6): Befunde des Positions-Bereichs
  // `{{list:…}}` einer Masken-Datei, gestellt von der Auskunft
  // (`positions-auskunft.js`), die als einzige Abfrage-Dateien und Definitionen
  // kennt. Ortsbezug wie bei den Befunden am Körper die Zeile; `name` ist die
  // Angabe des Platzhalters. Die übrige Maske bleibt in jedem Fall bedienbar.
  listDateiUnbekannt: { key: null, expected: null }, // name: die Abfrage-Datei
  listNichtBearbeitbar: { key: null, expected: null }, // name: die Abfrage-Datei
  listBeziehungFehlt: { key: null, expected: null }, // name: die Abfrage-Datei
  listBeziehungMehrdeutig: { key: null, expected: null }, // name: die Abfrage-Datei
  listAbfrageUngueltig: { key: null, expected: null }, // name: die Abfrage-Datei
  // 4T-002307 (Epic 3E-000263, S3, S6): Die Rollen im Steckbrief
  // (`rollen-angaben.js`). Alle hängen am Behälter `db-database` (`index` -1),
  // `name` ist die Rolle. Bei den drei Hinweisen an einer Tabelle trägt der
  // Hinweis den Tabellen-Namen einzeln in `key`, weil er der Schlüssel ist, unter
  // dem die unbrauchbare Angabe steht (Muster `listAngabeUnbekannt`), und die
  // unbekannte Operation in `wert`. Die Folge ist in jedem Fall benannt: Die
  // betroffene Rolle gilt als nicht gesetzt, bei `roles` jede. `roleTable`
  // entsteht nicht beim Lesen, sondern im Katalog, der als einziger die
  // Tabellen kennt.
  roles: { key: 'roles', expected: 'object' },
  roleShape: { key: 'roles', expected: 'all-or-object' },
  roleTableShape: { key: 'roles', expected: 'all-or-list-of-operations' },
  roleOperation: { key: 'roles', expected: null }, // expected: die Operationen
  roleTable: { key: 'roles', expected: null }, // expected: die vorhandenen Tabellen-Namen
  // 4T-002308 (Epic 3E-000263, F2 A, S3): Zuordnung `users` und Vorgabe-Rolle
  // `defaultRole` im Steckbrief (`rollen-angaben.js`), am Behälter (`index` -1).
  // Die betroffene Angabe gilt als nicht gesetzt: bei `users` jede Zuordnung,
  // bei `userShape` und `userRoleUnknown` die eine (`name` der Anmeldename,
  // `wert` die genannte Rolle), bei den beiden übrigen die Vorgabe-Rolle.
  // `defaultRoleUnknown` und `userRoleUnknown` entstehen erst nach dem Abgleich
  // gegen die Tabellen, wenn die Rollen endgültig sind.
  users: { key: 'users', expected: 'object' },
  userShape: { key: 'users', expected: 'role-name' },
  defaultRoleShape: { key: 'defaultRole', expected: 'role-name' },
  defaultRoleUnknown: { key: 'defaultRole', expected: null }, // name: die Rolle, expected: die Rollen
  userRoleUnknown: { key: 'users', expected: null }, // name: der Anmeldename, wert: die Rolle
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
  if (typeof hinweis.zeile !== 'number' && text.includes('{zeile}')) return null;
  return text;
}

/**
 * Lokalisierter Satz zu einem Hinweis.
 *
 * Die Meldung je Code ist ein ganzer Satz; `{ort}` steht für die Stelle in der
 * Definitions-Liste, `{position}` für die des Datensatzes im Block, `{zeile}`
 * für die Zeile im Körper einer Maske (4T-001938), `{name}`
 * für den benannten Gegenstand und `{expected}` für die Erwartung aus dem
 * Katalog. Seit 4T-002307 dazu `{key}` für den Schlüssel, den der Hinweis
 * einzeln trägt, und `{wert}` für einen geschriebenen Wert; beide nur dort, wo
 * ein Satz sie nennt (die Rollen im Steckbrief nennen Rolle, Tabelle und
 * Operation zugleich). Ein Code ohne eigenen Satz fällt auf einen Rückfall-Satz mit seiner
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
  // 4T-001938: Ein Befund am Masken-Körper nennt seine Zeile, gezählt ab 1.
  if (typeof h.zeile === 'number') text = text.replace('{zeile}', String(h.zeile));
  text = text.replace('{name}', h.name || '—');
  if (text.includes('{key}')) text = text.replace('{key}', h.key || '—');
  if (text.includes('{wert}')) text = text.replace('{wert}', h.wert || '—');
  if (text.includes('{expected}')) text = text.replace('{expected}', erwartungText(h.expected));
  return text;
}

module.exports = { HINWEIS_META, baueHinweis, hinweisSatz };
