// 4T-001155 (Epic 3E-000219, E9/E11): Typ-eigene Angaben einer Feld-Definition —
// der Katalog zulässiger Options-Schlüssel je Typ und ihre Prüfung.
//
// Eigene Datei seit dem Typ-Ausbau der Stufe 2: Stufe 1 hat `options` blind
// durchgereicht (ein Objekt, flach kopiert, unbewertet); mit der Prüfung je
// Typ wird daraus eine eigene Fachlichkeit, die mit jedem weiteren Typ
// wächst — der Verweis-Typ hier, die Objekt-Typen in Stufe 4. Der Schnitt
// folgt derselben Naht-Logik wie der von Stufe 1 (Fassade neben
// Datei-Format): Hier liegt, was EINE Options-Angabe prüft, im Format-Modul
// das Lesen einer ganzen Definition.
//
// Blatt-Modul: Es importiert nichts aus dem Feature und hält den
// Import-Graph damit gerichtet (Fassade → Format → Optionen).
//
// Options-Werte sind bewusst enger normalisiert als Werte-Listen: Wo eine
// Werte-Liste eine Zahl in ihren Text umwandelt (freie Nutzer-Eingabe in
// einem Wertebereich), ist eine Options-Textangabe Text — ein Ordner-Pfad,
// ein Feldname, ein benannter Modus. Eine Zahl an dieser Stelle ist ein
// Irrtum und kein umzuwandelnder Wert.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

// 4T-001507 (Epic 3E-000250, E5.5): Obergrenze der Nachkommastellen-Angabe.
// **Bewusst dieselbe Zahl wie das Vorbild** `number(n)` der Datentabelle
// (`MAX_DECIMALS` in src/shared/markdown/perspective-datatable-kopf.js), aber
// bewusst **keine** gemeinsame Konstante: Dort begrenzt sie die Kopfzeilen-
// Syntax eines eigenen Konstrukts, hier eine Angabe der Eigenschafts-Profile.
// Eine Kopplung machte aus zwei unabhängigen Grenzen eine, ohne dass jemand das
// entschieden hätte, und dieses Modul bliebe nicht das Blatt, das es ist.
const MAX_DECIMALS = 10;

function alsText(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

function pruefeZahl(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pruefeGanzzahl(v) {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

// 4T-001507 (Epic 3E-000250, E5.5): Ganzzahl in einem geschlossenen Bereich.
// Eine Längen-Angabe von null oder weniger verböte jeden Wert, eine
// Nachkommastellen-Angabe von unter null ergäbe keinen Sinn; beides ist ein
// Irrtum und keine Angabe, die still gelten soll.
function pruefeGanzzahlIm(min, max) {
  return (v) => {
    const n = pruefeGanzzahl(v);
    return n !== null && n >= min && n <= max ? n : null;
  };
}

// Ein Pfad oder eine Pfad-Liste; ein defekter Eintrag setzt die ganze Angabe
// aus, weil eine halbe Einschränkung schlechter wäre als keine.
function pruefePfadListe(v) {
  const list = Array.isArray(v) ? v : [v];
  const out = [];
  for (const item of list) {
    const s = alsText(item);
    if (s === null) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out.length > 0 ? out : null;
}

function pruefeAuswahl(erlaubt) {
  return (v) => {
    const s = alsText(v);
    return s !== null && erlaubt.includes(s) ? s : null;
  };
}

// Katalog je Typ. Ein Prüfer liefert den normalisierten Wert oder null
// (= Wert nicht bildbar, Hinweis-Code optionValue); `expected` ist die
// maschinen-lesbare Erwartung für die Meldung (Hinweis-Gestalt aus 4T-001143:
// die Übersetzung setzt sie ein, statt sie zu erzeugen).
const OPTION_SPECS = {
  // 4T-001507 (Epic 3E-000250, E5.5): Die Längen-Angabe. Sie steht am Typ
  // `string` und **nicht** an `multiline`, der als Langtext beliebiger Länge
  // definiert ist; die Zuordnung je Typ erledigt diesen Ausschluss von selbst.
  //
  // Ebenso wenig steht sie an `multistring`, und das ist eine Auslassung mit
  // Absicht: E5.5 nennt genau einen Typ, und eine Mehrfach-Textangabe kommt in
  // einer Datenbank-Spalte gar nicht vor (keine mehrwertige Spalte, E5). Für
  // Dokument-Eigenschaften bliebe sie additiv nachrüstbar, ohne dass heute
  // jemand für sie entschieden hätte.
  string: {
    maxLength: {
      expected: 'positive-integer',
      pruef: pruefeGanzzahlIm(1, Number.MAX_SAFE_INTEGER),
    },
  },
  number: {
    step: { expected: 'number', pruef: pruefeZahl },
    min: { expected: 'number', pruef: pruefeZahl },
    max: { expected: 'number', pruef: pruefeZahl },
    // 4T-001507 (E5.5): die Nachkommastellen. **Anzeige-Format, keine Rundung
    // beim Schreiben** — das Speicherformat bleibt Punkt-Dezimal und der Wert
    // unverändert; ein Wert mit mehr Stellen ist ein Hinweis
    // (`fieldDefinitionHint`), kein Anlass, etwas wegzuschreiben.
    decimals: { expected: 'integer-0-10', pruef: pruefeGanzzahlIm(0, MAX_DECIMALS) },
  },
  date: {
    shift: { expected: 'integer', pruef: pruefeGanzzahl },
  },
  link: {
    restrictTo: { expected: 'path-or-list', pruef: pruefePfadListe },
    display: { expected: 'field-name', pruef: alsText },
    sort: { expected: ['name', 'path'], pruef: pruefeAuswahl(['name', 'path']) },
  },
  // 4T-001183 (Epic 3E-000221, E1): Rechenvorschrift des Formel-Feldes. Der
  // Ausdruck bleibt hier unausgewertet Text — geprüft wird er erst bei der
  // Auswertung gegen Parser und Funktions-Katalog der Abfrage-Sprache
  // (property-profiles-abgeleitet.js). Dieselbe Arbeitsteilung wie bei
  // `valuesFrom.query` in Stufe 1: Das Format liest die Angabe, es führt sie
  // nicht aus.
  formula: {
    expression: { expected: 'expression', pruef: alsText },
  },
  // 4T-001184 (Epic 3E-000221, E1): die beiden Angaben des Lookup-Feldes. `from`
  // grenzt die befragten Dokumente ein (eine Abfrage-Quelle, hier wie
  // `valuesFrom.query` unausgewertet gelesen), `relatedField` benennt das Feld,
  // über das sie auf das eigene Dokument verweisen müssen.
  lookup: {
    from: { expected: 'query', pruef: alsText },
    relatedField: { expected: 'field-name', pruef: alsText },
  },
  // Wertevorrat-Felder: die Bedien-Option aus E11. Sie steht hier und nicht
  // unter einem Typ, weil eine Auswahl kein eigener Typ ist, sondern der
  // Wertebereich eines Typs (Konzept 6.8).
  values: {
    control: { expected: ['cycle'], pruef: pruefeAuswahl(['cycle']) },
  },
};

// Welche Options-Schlüssel an einem Feld gelten: die seines Typs plus, wenn
// das Feld einen Wertevorrat hat (feste Liste oder Quelle), die der Auswahl.
function optionSpecsFor(type, hasValueSource) {
  const spec = { ...(OPTION_SPECS[type] || {}) };
  if (hasValueSource) Object.assign(spec, OPTION_SPECS.values);
  return spec;
}

// Prüft die Options-Angaben einer Definition gegen den Katalog ihres Typs.
//
// Die weiche Linie bleibt dabei unverändert und wird ausdrücklich NICHT
// verschärft: Eine unbekannte oder unpassend belegte Angabe entfällt
// einzeln, das Feld bleibt wirksam, und die übrigen Angaben desselben
// Objekts bleiben es auch. Damit darf eine Profil-Datei, die für eine
// spätere Stufe geschrieben wurde, heute schon dastehen, ohne Schaden
// anzurichten — genau das Verhalten, das Stufe 1 für `options` insgesamt
// hatte.
//
// Liefert { options, hints }: die geprüften Angaben und je verworfenem
// Schlüssel einen Hinweis-Bauplan { code, expected }; null nur, wenn `raw`
// überhaupt kein einfaches Objekt ist (Hinweis-Code options, wie bisher).
//
// `options` bleibt ein Objekt, auch wenn nach der Prüfung nichts übrig ist.
// Das ist bewusst und hält das Verhalten aus 4T-001141: Wer eine
// Options-Angabe schreibt, sieht sie am Definitions-Objekt — der Unterschied
// zwischen «keine Angabe» und «Angabe, deren Inhalt verworfen wurde» bleibt
// damit sichtbar.
function normalizeOptions(raw, type, hasValueSource) {
  return pruefeGegenSpec(raw, optionSpecsFor(type, hasValueSource));
}

// 4T-001507 (Epic 3E-000250): Dieselbe Prüfung gegen einen **übergebenen**
// Katalog. Herausgezogen, weil die Datenbank-Spalten den geteilten Katalog um
// eigene Angaben ergänzen (der Datensatz-Verweis nennt seine Ziel-Tabelle) und
// diese Angaben nichts in einer Dokument-Eigenschaft zu suchen haben. Ohne
// diesen Einstieg müsste die Datenbank die Schleife samt weicher Linie ein
// zweites Mal führen — und zwei Fassungen derselben Regel driften.
//
// `normalizeOptions` bleibt die Fassung für Dokument-Eigenschaften und
// verhält sich unverändert; sie ist jetzt der Aufruf mit dem Katalog des Typs.
function pruefeGegenSpec(raw, spec) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const zulaessig = Object.keys(spec);
  const options = {};
  const hints = [];
  for (const key of Object.keys(raw)) {
    const eintrag = spec[key];
    if (!eintrag) {
      hints.push({ code: 'optionUnknown', expected: zulaessig });
      continue;
    }
    const wert = eintrag.pruef(raw[key]);
    if (wert === null) {
      hints.push({ code: 'optionValue', expected: eintrag.expected });
      continue;
    }
    options[key] = wert;
  }
  // Grenzen, die einander widersprechen, sind ein Wert-Fall wie jeder
  // andere: die obere Grenze entfällt, das Feld bleibt bedienbar.
  if (options.min !== undefined && options.max !== undefined && options.min > options.max) {
    delete options.max;
    hints.push({ code: 'optionValue', expected: 'max-not-below-min' });
  }
  return { options, hints };
}

module.exports = { OPTION_SPECS, MAX_DECIMALS, optionSpecsFor, normalizeOptions, pruefeGegenSpec };
