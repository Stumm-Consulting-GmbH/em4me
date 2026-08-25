// 4T-1183 (Epic 3E-0221, E1): Auswertung der abgeleiteten Felder — Werte, die
// beim Lesen entstehen und nie in den Metadaten-Block geschrieben werden.
//
// **Die tragende Zusage steht in E1 und ist der Grund für dieses ganze Modul:**
// Das Öffnen eines Dokuments verändert es nicht. Ein abgeleiteter Wert entsteht
// deshalb bei der Anzeige und hinterlässt in der Datei keine Spur. Die Kehrseite
// ist bewusst in Kauf genommen — er steht nicht im Index und trägt keine
// Abfrage-Bedingung.
//
// **Kein eigener Ausdrucks-Dialekt.** Gerechnet wird mit Parser, Evaluator und
// Funktions-Katalog der Perspective-Abfrage-Sprache; ein Formel-Feld kann damit
// genau das, was eine Abfrage-Spalte kann, einschließlich Datums- und
// Dauer-Rechnung. Dieselbe Entscheidung wie bei den berechneten Spalten der
// Datentabelle (Epic-Entscheidung C2 dort), und aus demselben Grund: Zwei
// Rechen-Sprachen im selben Haus wären zwei Fehlerquellen und zwei Handbücher.
//
// **Die Kreis-Regel folgt dem Vorbild im eigenen Haus** (Konzept 6.10 verlangt
// es ausdrücklich): Fixpunkt-Auflösung über die Bezüge, was übrig bleibt, hängt
// im Kreis. Ein Selbst-Bezug ist der einfachste Kreis und fällt mit.
//
// **Ein Unterschied zur Datentabelle ist Absicht.** Dort ist ein Verweis auf
// eine nicht existierende Spalte ein Fehler (`computedBadRef`), denn die
// Spalten-Menge ist geschlossen und steht im selben Fence. Hier hängt die
// Feld-Menge an einer Profil-Auflösung, die sich mit Vererbung, Zuordnung und
// fremden Dateien ändert; ein Bezug ins Leere ist deshalb kein Fehler, sondern
// ein leerer Wert mit Hinweis (AK6 der Story, weiche Linie aus E10).
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { parseExpression, collectFieldRefs } = require('./query/perspective-query.js');
const { evaluateExpression } = require('./query/perspective-query-eval.js');
const { validateQuery } = require('./query/query-functions.js');
const { formatValue } = require('./query/query-format.js');
const { DERIVED_TYPES } = require('./property-profiles-format.js');

// Hinweis-Codes der Auswertung. Sie sind die Anzeige-Ebene und liegen deshalb
// nicht im Katalog der Definitions-Diagnose: Dieselbe Definition kann in einem
// Dokument rechnen und im nächsten ins Leere greifen.
//   derivedNoRule    keine Rechenvorschrift (options.expression fehlt)
//   derivedBadExpr   Syntax-Fehler oder unbekannte Funktion
//   derivedBadRef    Bezug auf ein Feld, das es hier nicht gibt
//   derivedCycle     Kreis-Bezug (Selbst-Bezug eingeschlossen)
const DERIVED_HINTS = ['derivedNoRule', 'derivedBadExpr', 'derivedBadRef', 'derivedCycle'];

function istAbgeleitet(def) {
  return !!def && DERIVED_TYPES.includes(def.type);
}

function ausdruckVon(def) {
  const roh = def && def.options ? def.options.expression : null;
  return typeof roh === 'string' && roh.trim() !== '' ? roh : null;
}

// Float-Rauschen normalisieren (0.1 + 0.2 -> 0.3), wie bei den berechneten
// Spalten; 12 signifikante Stellen reichen für den Anwendungsfall.
function normalizeFloat(n) {
  return Number.isFinite(n) ? parseFloat(n.toPrecision(12)) : n;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Abfrage-Wert -> Feld-Wert für die Anzeige.
//
// Ein Formel-Feld hat keinen erklärten Ergebnis-Typ — der Typ IST `formula`.
// Anders als `toComputedCell` der Datentabelle wird hier deshalb nicht gegen
// einen Soll-Typ geprüft, sondern die natürliche Entsprechung gewählt: Zahl
// bleibt Zahl, Wahrheitswert bleibt Wahrheitswert, ein Datum wird sein
// ISO-Text, alles Übrige die kanonische Anzeige-Form der Abfrage-Sprache.
// Damit gibt es hier auch keinen Typ-Konflikt-Fall.
function alsFeldWert(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? normalizeFloat(v) : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && v.kind === 'date') {
    const d = new Date(v.ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (Array.isArray(v)) return v.map((x) => formatValue(x));
  return formatValue(v);
}

/**
 * Wertet die abgeleiteten Felder eines Dokuments aus.
 *
 * Der Bezugs-Raum eines Ausdrucks sind die Felder DESSELBEN Dokuments (AK1 der
 * Story), und zwar in drei Schichten: die Werte des Metadaten-Blocks, die
 * aufgelösten Profil-Felder ohne Wert (als leer, nicht als unbekannt) und die
 * übrigen abgeleiteten Felder, gerechnet in Abhängigkeits-Reihenfolge. Die
 * mittlere Schicht ist der Grund, warum «Feld ohne Wert» und «Feld gibt es
 * nicht» auseinandergehalten werden: Nur das Zweite ist ein Hinweis.
 *
 * Weitergereicht wird an nachfolgende Ausdrücke der ROHE Abfrage-Wert, nicht
 * die Anzeige-Form — sonst verlöre eine Kette aus zwei Formeln unterwegs ihren
 * Datums- oder Dauer-Charakter und rechnete auf Text weiter.
 *
 * @param {Array} fields Aufgelöste Feld-Definitionen des Dokuments.
 * @param {object} props Werte des Metadaten-Blocks (lowercase-Schlüssel).
 * @param {object} [ctxExtra] Weitere Auswertungs-Angaben der Abfrage-Sprache
 *   (etwa `file` und `now`); sie werden unverändert durchgereicht.
 * @returns {object} Map lowercase-Feldname -> { value, hint } für jedes
 *   abgeleitete Feld. `hint` ist null oder einer der DERIVED_HINTS; bei einem
 *   Hinweis ist `value` immer null (leer mit Hinweis, nie halb gerechnet).
 */
function werteAbgeleiteteFelder(fields, props, ctxExtra) {
  const ergebnis = {};
  const defs = (Array.isArray(fields) ? fields : []).filter(istAbgeleitet);
  if (defs.length === 0) return ergebnis;

  const basis = props && typeof props === 'object' ? props : {};

  // Bekannte Namen: alles, was im Dokument steht, plus alles, was die
  // Auflösung kennt. Ein Bezug darauf ist gültig, auch wenn der Wert leer ist.
  const bekannt = new Set(Object.keys(basis).map((k) => k.toLowerCase()));
  for (const def of Array.isArray(fields) ? fields : []) {
    const n = typeof def?.name === 'string' ? def.name.trim().toLowerCase() : '';
    if (n !== '') bekannt.add(n);
  }

  // Erste Runde: parsen, Funktions-Katalog prüfen, Bezüge einsammeln.
  const abgeleitetNamen = new Set();
  for (const def of defs) {
    const n = def.name.toLowerCase();
    abgeleitetNamen.add(n);
    ergebnis[n] = { value: null, hint: null };
  }

  const rechenbar = new Map(); // name -> { def, ast, refs }
  for (const def of defs) {
    const n = def.name.toLowerCase();
    const quelle = ausdruckVon(def);
    if (quelle === null) {
      ergebnis[n].hint = 'derivedNoRule';
      continue;
    }
    const geparst = parseExpression(quelle);
    if (!geparst.ok || validateQuery(geparst.ast)) {
      ergebnis[n].hint = 'derivedBadExpr';
      continue;
    }
    const refs = [];
    collectFieldRefs(geparst.ast, refs);
    // Ein Bezug, den weder Dokument noch Auflösung kennt: leer mit Hinweis.
    // Implizite Datei-Felder (`file.…`) und der Selbstbezug (`this.…`) sind
    // Sache des Evaluators und keine Feld-Namen dieses Dokuments.
    const unbekannt = refs.find(
      (r) => !bekannt.has(r) && !r.startsWith('file.') && !r.startsWith('this.'),
    );
    if (unbekannt !== undefined) {
      ergebnis[n].hint = 'derivedBadRef';
      continue;
    }
    rechenbar.set(n, { def, ast: geparst.ast, refs });
  }

  // Zweite Runde: Fixpunkt-Auflösung über die Bezüge auf andere abgeleitete
  // Felder. Ein Feld ist auflösbar, sobald alle abgeleiteten Felder, auf die
  // es zeigt, es sind. Ein Feld mit Hinweis zählt als auflösbar — sein Wert
  // ist leer, aber es hängt in keinem Kreis und darf seine Konsumenten nicht
  // fälschlich zu Kreis-Fällen machen (Vorbild validateComputedColumns).
  const reihenfolge = [];
  const erledigt = new Set();
  for (const n of abgeleitetNamen) if (!rechenbar.has(n)) erledigt.add(n);
  let gewachsen = true;
  while (gewachsen) {
    gewachsen = false;
    for (const [n, eintrag] of rechenbar) {
      if (erledigt.has(n)) continue;
      const offen = eintrag.refs.some((r) => abgeleitetNamen.has(r) && !erledigt.has(r));
      if (offen) continue;
      erledigt.add(n);
      reihenfolge.push(n);
      gewachsen = true;
    }
  }
  for (const [n] of rechenbar) {
    if (!reihenfolge.includes(n)) ergebnis[n].hint = 'derivedCycle';
  }

  // Dritte Runde: rechnen. Der Kontext trägt die Dokument-Werte, die
  // wertlosen Profil-Felder als null und die bereits gerechneten Ergebnisse.
  const kontext = {};
  for (const k of Object.keys(basis)) kontext[k.toLowerCase()] = basis[k];
  for (const n of bekannt) if (!(n in kontext)) kontext[n] = null;
  for (const n of abgeleitetNamen) kontext[n] = null;

  for (const n of reihenfolge) {
    const { ast } = rechenbar.get(n);
    const roh = evaluateExpression(ast, { ...(ctxExtra || {}), props: kontext });
    kontext[n] = roh;
    ergebnis[n].value = alsFeldWert(roh);
  }

  return ergebnis;
}

module.exports = {
  DERIVED_HINTS,
  istAbgeleitet,
  ausdruckVon,
  alsFeldWert,
  werteAbgeleiteteFelder,
};
