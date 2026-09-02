// 4T-000469 (Epic 3E-000087): Nummerierungs-Kern der Gliederungs-Nummerierung.
//
// Reine Zaehl- und Marker-Logik fuer automatische Ueberschriften-Nummern.
// Aufgaben des Moduls:
// - Zeilenende-Marker erkennen (parseHeadingMarker): `{-}` nimmt eine
//   Ueberschrift aus, `{+}` bezieht sie ein (beide Richtungen, PO-Entscheidung
//   2026-07-08); `\{-}`/`\{+}` bleibt Literal. Der Marker wirkt nur ganz am
//   Zeilenende (nach optionalem Leerraum); Text dahinter macht ihn zu Literal.
// - Hierarchische Nummern berechnen (computeHeadingNumbers): pro Ueberschrift
//   die Nummer (1, 1.1, 2.3.1 …) oder null, plus den um den Marker bereinigten
//   Titel und ob sie ausgenommen ist.
//
// Zaehl-Regeln (bewusste Festlegungen des Epics, im Handbuch dokumentiert):
// - Gezaehlt wird hierarchisch ab der Start-Ebene (startLevel 1 = ab H1,
//   2 = ab H2). Ueberschriften oberhalb der Start-Ebene (level < startLevel)
//   werden nicht nummeriert und beeinflussen die Zaehler nicht.
// - Uebersprungene Ebenen (z.B. H1 direkt auf H3) zaehlen als 1.
// - Ausgenommene Ueberschriften zaehlen nicht mit und setzen keine
//   Unterzaehler zurueck; ihre Unter-Ueberschriften zaehlen unter dem
//   letzten nummerierten Vorfahren weiter.
// - Wirksamkeit pro Ueberschrift: Marker `{-}`/`{+}` schlaegt den
//   uebergebenen Dokument-Zustand `enabled`. Die Aufloesung global -> Dokument
//   passiert ausserhalb (renderMarkdown bzw. Renderer) und erreicht den Kern
//   als fertiges `enabled`.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM): die
// Render-Pipeline (plugins.js core-Ruler), der Live-Modus und die
// Gliederungs-Ansicht (Renderer) sowie die Tests laden dasselbe Modul und
// erhalten damit identische Nummern in allen Ausgabewegen.
'use strict';

// Zeilenende-Marker: optionaler Escape-Backslash, dann `{-}` oder `{+}`,
// dann nur noch Leerraum bis zum Ende. Genau ein Backslash escaped den
// Marker (mehrfache Backslashes sind ein bewusst nicht gesondert behandelter
// Rand-Fall).
const END_MARKER_RE = /(\\?)\{([-+])\}[ \t]*$/;

// Trailing-Leerraum eines Titels entfernen (der Rest bleibt originalgetreu,
// insbesondere Inline-Markdown des Titels).
function trimTrailing(text) {
  return String(text == null ? '' : text).replace(/[ \t]+$/, '');
}

// Erkennt einen Zeilenende-Marker in einem Roh-Ueberschriftstitel.
// Rueckgabe:
//   marker    'exclude' bei `{-}`, 'include' bei `{+}`, sonst null
//             (kein Marker oder escaped).
//   cleanTitle Titel ohne den wirksamen Marker; ein escapter Marker wird
//             zum Literal aufgeloest (Backslash entfernt), damit die
//             Anzeige `{-}` statt `\{-}` zeigt.
//
// Der Roh-Titel ist in beiden Welten der Quelltext des Titels (Render-
// Pipeline: Inline-Content vor der markdown-it-Escape-Aufloesung; Live/
// Outline: die Quelltext-Zeile) — die Marker-Erkennung ist damit ueberall
// identisch.
function parseHeadingMarker(rawTitle) {
  const title = String(rawTitle == null ? '' : rawTitle);
  const m = title.match(END_MARKER_RE);
  if (!m) return { marker: null, cleanTitle: trimTrailing(title) };
  const before = title.slice(0, m.index);
  if (m[1] === '\\') {
    // Escapter Marker: kein Steuerzeichen, `\{X}` wird literales `{X}`.
    return { marker: null, cleanTitle: trimTrailing(`${before}{${m[2]}}`) };
  }
  return {
    marker: m[2] === '-' ? 'exclude' : 'include',
    cleanTitle: trimTrailing(before),
  };
}

// Normalisiert die Start-Ebene auf 1 oder 2 (Default 1).
function normalizeStartLevel(startLevel) {
  return startLevel === 2 ? 2 : 1;
}

// Berechnet die Nummern fuer eine Ueberschriften-Liste.
//   headings: Array von { level: 1..6, rawTitle: string } in Dokument-
//             Reihenfolge.
//   ctx:      { enabled: boolean, startLevel: 1|2 } — der bereits aufgeloeste
//             Dokument-Zustand (global -> Dokument) und die Start-Ebene.
// Rueckgabe: Array gleicher Laenge mit
//   { number: string|null, cleanTitle: string, excluded: boolean }.
//   number ist null, wenn die Ueberschrift nicht nummeriert wird; excluded
//   ist true genau dann, wenn number null ist (Marker, Start-Ebene oder
//   Dokument-Zustand).
function computeHeadingNumbers(headings, ctx) {
  const list = Array.isArray(headings) ? headings : [];
  const enabled = !!(ctx && ctx.enabled);
  const startLevel = normalizeStartLevel(ctx && ctx.startLevel);
  const counters = []; // counters[d] = Zaehlerstand der Tiefe d (0-basiert)
  const out = [];
  for (const h of list) {
    const level = h && Number.isInteger(h.level) ? h.level : 1;
    const { marker, cleanTitle } = parseHeadingMarker(h && h.rawTitle);
    // Oberhalb der Start-Ebene: nie nummeriert, ohne Zaehler-Einfluss.
    if (level < startLevel) {
      out.push({ number: null, cleanTitle, excluded: true });
      continue;
    }
    // Wirksamkeit: Marker schlaegt den Dokument-Zustand.
    let numbered;
    if (marker === 'exclude') numbered = false;
    else if (marker === 'include') numbered = true;
    else numbered = enabled;
    if (!numbered) {
      // Ausgenommen: keine Nummer, kein Inkrement, kein Reset tieferer
      // Ebenen — die Unter-Ueberschriften zaehlen unter dem letzten
      // nummerierten Vorfahren weiter.
      out.push({ number: null, cleanTitle, excluded: true });
      continue;
    }
    const depth = level - startLevel; // 0-basierte Tiefe in der Hierarchie
    // Uebersprungene Zwischenebenen mit 1 auffuellen.
    for (let d = 0; d < depth; d++) {
      if (counters[d] === undefined) counters[d] = 1;
    }
    counters[depth] = (counters[depth] || 0) + 1;
    counters.length = depth + 1; // tiefere Ebenen verwerfen (Reset)
    out.push({ number: counters.join('.'), cleanTitle, excluded: false });
  }
  return out;
}

module.exports = {
  parseHeadingMarker,
  computeHeadingNumbers,
  normalizeStartLevel,
};
