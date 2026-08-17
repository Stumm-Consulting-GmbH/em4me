// 4T-1067 (Epic 3E-0212): Kern des Journal-Timeline-Blocks — Modus-Modell,
// Auswertung des Fence-Bodys und Fence-Erkennung fuer den Portable-Export.
//
// Herausgeloest aus journal-core.js: Der Perioden-Kern traegt das Journal-
// Modell und die Perioden-Rechnung, die der Timeline-Block ebenso nutzt wie
// Kalender-Panel und Navigations-Block. Die Modus-Sprache dieses einen
// Blocks ist dagegen seine eigene Fachlichkeit und waechst mit ihm; sie
// gehoert deshalb in ein eigenes Modul. Ausloeser war das Datei-Groessen-
// Budget, das den Perioden-Kern nach der Aufnahme dieser Teile ueber seinen
// eingefrorenen Wert hob (4T-0878; die Ausnahmeliste darf nur schrumpfen).
//
// Prozess-neutral wie der Perioden-Kern (CJS, kein Electron, kein DOM):
// markdown.js und der Renderer laden dasselbe Modul.
'use strict';

// Die vier Modi des Timeline-Blocks, kanonisch in der Schreibweise des
// uebernommenen Bestands (Konzept-Entscheid E2). 'calendar' meint das
// Jahres-Raster aus zwoelf Monatsgittern; weil dieser geerbte Name
// irrefuehrend ist, gilt 'year' als gleichwertiger Alias und ist die im
// Handbuch empfohlene Schreibweise.
const TIMELINE_MODES = ['week', 'month', 'quarter', 'calendar'];
const TIMELINE_MODE_ALIASES = { year: 'calendar' };
const DEFAULT_TIMELINE_MODE = 'month';

// Perioden-Ebene, die ein Modus zeigt (Bezugs-Periode und Hervorhebung).
const TIMELINE_MODE_GRANULARITY = {
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  calendar: 'year',
};

// Wertet den Fence-Body des Timeline-Blocks aus. Direktiven-Zeilen nach dem
// Muster des Ereignis-Fence (`schluessel: wert`), hier mit genau einem
// erlaubten Schluessel `mode`; die Story schliesst freie Konfiguration aus.
// Leerzeilen und Kommentarzeilen (#) werden uebergangen.
//
// Liefert { ok: true, mode } oder { ok: false, error: { code, value } }.
// Ein unbekannter Wert und ein unbekannter Schluessel sind FEHLER, kein
// stiller Rueckfall auf den Default (Konzept-Entscheid E2): Ein stiller
// Rueckfall verbirgt den Tippfehler dauerhaft.
function parseTimelineFence(body) {
  const text = String(body == null ? '' : body);
  let mode = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const sep = line.indexOf(':');
    if (sep < 0) return { ok: false, error: { code: 'badLine', value: line } };
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line
      .slice(sep + 1)
      .trim()
      .toLowerCase();
    if (key !== 'mode') return { ok: false, error: { code: 'badKey', value: key } };
    const resolved = TIMELINE_MODE_ALIASES[value] || value;
    if (!TIMELINE_MODES.includes(resolved)) {
      return { ok: false, error: { code: 'badMode', value } };
    }
    mode = resolved;
  }
  return { ok: true, mode: mode || DEFAULT_TIMELINE_MODE };
}

// 4T-1066: Fence-Erkennung des Portable-Exports, mit Fence-Koerper — der
// Ersatz-Text haengt vom Modus ab, den der Koerper nennt. build(body)
// liefert den Ersatz; liefert er null, bleibt der Fence unveraendert stehen
// (Muster des Navigations-Blocks ausserhalb eines Journal-Kontexts: lieber
// der Quelltext als eine irrefuehrende Ausgabe).
//
// Der Koerper laeuft zeilenweise ueber einen tempered-greedy-Ausdruck (jede
// Zeile, die nicht die Schliess-Zeile ist); ein lazy [\s\S]*? wuerde bei
// leerem Koerper bis zur Schliess-Zeile des NAECHSTEN Fences ueberspannen.
const TIMELINE_FENCE_RE =
  /^ {0,3}(`{3,})perspective-journal-timeline[^\n]*\n((?:(?! {0,3}\1[ \t]*$)[^\n]*\n)*) {0,3}\1[ \t]*$/gm;

function replaceJournalTimelineFences(text, build) {
  const source = String(text == null ? '' : text);
  TIMELINE_FENCE_RE.lastIndex = 0;
  return source.replace(TIMELINE_FENCE_RE, (ganzer, _zaun, body) => {
    const ersatz = build(String(body == null ? '' : body));
    return ersatz == null ? ganzer : String(ersatz);
  });
}

// Enthaelt der Text ueberhaupt einen Timeline-Fence? Spart dem Export den
// Weg ueber die IPC-Bruecke, wenn nichts zu ersetzen ist.
function hasJournalTimelineFence(text) {
  TIMELINE_FENCE_RE.lastIndex = 0;
  return TIMELINE_FENCE_RE.test(String(text == null ? '' : text));
}

module.exports = {
  TIMELINE_MODES,
  DEFAULT_TIMELINE_MODE,
  TIMELINE_MODE_GRANULARITY,
  parseTimelineFence,
  replaceJournalTimelineFences,
  hasJournalTimelineFence,
};
