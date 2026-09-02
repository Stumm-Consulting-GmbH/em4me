// 4T-001183 (Epic 3E-000221): Gestalt des Hinweis-Datensatzes der Profil-Diagnose
// — der Katalog der Hinweis-Codes und der Bauplan, aus dem ein Hinweis
// entsteht.
//
// **Eigene Datei seit der Stufe 4.** Der Katalog stammt aus 4T-001143 (E4) und
// lag bis dahin im Format-Modul. Er ist dort mit jedem neuen Konstrukt
// mitgewachsen — Optionen, Wertevorrats-Quellen, Vererbung, Symbol, jetzt die
// abgeleiteten Felder — und wächst in dieser Stufe weiter. Der Schnitt folgt
// derselben Naht-Logik wie die von `property-profiles-options.js`: Hier liegt,
// was EINEN Hinweis beschreibt, im Format-Modul das Lesen einer Definition.
// Das Format-Modul hält damit sein Budget, ohne dass die Diagnose-Fläche in
// eine Ausnahme-Ratsche wandert.
//
// Blatt-Modul: Es importiert nichts — weder aus dem Feature noch sonst woher.
// Damit bleibt der Import-Graph gerichtet (Fassade → Format → Hinweise, und
// Format → Optionen).
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

// 4T-001143 (Epic 3E-000218, E4): Ortsbezug des Hinweis-Datensatzes. Jeder
// Hinweis trägt neben { code, index, name } die betroffene Angabe (`key`)
// und, wo eine konkrete Erwartung besteht, ihre maschinen-lesbare, nicht
// übersetzte Form (`expected`) — die Übersetzung setzt sie ein, statt sie
// zu erzeugen. Kontextabhängige Erwartungen (Typ-Satz, erklärter Typ,
// Wertebereich) setzt die Prüfstelle beim Melden; für die übrigen Codes
// steht die Erwartung hier fest.
const HINT_META = {
  fieldsNotList: { key: 'fields', expected: 'list' },
  entry: { key: null, expected: 'object' },
  name: { key: 'name', expected: null },
  duplicate: { key: 'name', expected: null },
  type: { key: 'type', expected: null }, // expected: der zulässige Typ-Satz
  // 4T-001155: seit der Entkopplung des Mehrfach-Modus nennt die Erwartung
  // nicht mehr einen Ziel-Typ, sondern die mehrfach-fähigen Typen; die
  // Prüfstelle setzt sie beim Melden.
  multipleType: { key: 'multiple', expected: null },
  optionUnknown: { key: 'options', expected: null }, // expected: die zulässigen Schlüssel
  optionValue: { key: 'options', expected: null }, // expected: die erwartete Form
  values: { key: 'values', expected: 'list' },
  default: { key: 'default', expected: null }, // expected: der erklärte Typ
  defaultOutsideValues: { key: 'default', expected: null }, // expected: der Wertebereich
  options: { key: 'options', expected: 'object' },
  valuesFrom: { key: 'valuesFrom', expected: ['note', 'query'] },
  valuesFromConflict: { key: 'valuesFrom', expected: 'values' },
  childFieldsNotList: { key: 'fields', expected: 'list' },
  extendsMultiple: { key: 'extends', expected: 'single' },
  extendsMissing: { key: 'extends', expected: null },
  extendsCycle: { key: 'extends', expected: null },
  // 4T-001161: Symbol-Angabe eines Profils (genau ein Graphem).
  icon: { key: 'icon', expected: 'single-grapheme' },
  // 4T-001183: Wert-Angabe an einem abgeleiteten Feld. `expected` nennt die
  // betroffene Angabe, weil hier drei verschiedene Schlüssel denselben Grund
  // haben — ein Feld ohne eigenen Wert trägt keine Wert-Vorgabe.
  derivedNoValues: { key: null, expected: null },
};

// Baut einen Hinweis in der einheitlichen Gestalt { code, index, name, key,
// expected } (plus `path` bei Kind-Definitionen, vom Aufrufer ergänzt).
function buildHint(code, index, name, expected) {
  const meta = HINT_META[code] || { key: null, expected: null };
  return {
    code,
    index,
    name: name || null,
    key: meta.key,
    expected: expected !== undefined ? expected : meta.expected,
  };
}

module.exports = { HINT_META, buildHint };
