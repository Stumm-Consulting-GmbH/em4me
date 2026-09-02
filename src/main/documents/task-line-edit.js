// 4T-000504 (Epic 3E-000096): zeilen-genaue Ersetzung fuer das Rueckschreiben
// aus der Abfrage-Ansicht (Status-Toggle, Termin-Verschieben, Dialog) in
// nicht geoeffnete Quelldateien.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein IO) — der
// IPC-Handler in main.js liest/schreibt die Datei, dieses Modul rechnet
// nur den neuen Inhalt aus. Damit ist die Konflikt-Erkennung vollstaendig
// unit-testbar (Task-Vorgabe: Konflikt-Faelle mit Hinweis statt
// Blind-Schreiben).
//
// Format-Treue wie beim Link-Update (3E-000062): EOL-Stil und BOM des
// Original-Stands bleiben byte-genau erhalten — es wird ausschliesslich
// die Ziel-Zeile ersetzt bzw. eine Zeile eingefuegt, nie normalisiert.
//
// Konflikt-Modell: Die Treffer-Zeile der Abfrage traegt Zeilennummer und
// erwarteten Roh-Text. Steht der erwartete Text nicht mehr an der
// Zeilennummer (Datei zwischenzeitlich veraendert), wird er im ganzen
// Dokument gesucht: genau EIN Vorkommen -> dort schreiben (die Zeile ist
// nur verrutscht); kein Vorkommen -> reason 'missing'; mehrere ->
// reason 'ambiguous' (kein Raten zwischen identischen Zeilen).
'use strict';

// Zerlegt den Rohtext in Zeilen-Slices mit Offsets und EOL-Erhalt.
// text ist der Zeilen-Inhalt ohne Zeilenumbruch; eol der Umbruch der
// Zeile ('' fuer die letzte Zeile ohne abschliessenden Umbruch).
function sliceLines(raw) {
  const lines = [];
  let start = 0;
  for (;;) {
    const nl = raw.indexOf('\n', start);
    if (nl < 0) {
      lines.push({ start, end: raw.length, text: raw.slice(start), eol: '' });
      return lines;
    }
    const hasCr = nl > start && raw[nl - 1] === '\r';
    const end = hasCr ? nl - 1 : nl;
    lines.push({ start, end, text: raw.slice(start, end), eol: hasCr ? '\r\n' : '\n' });
    start = nl + 1;
  }
}

// Vergleichs-Text einer Zeile: das BOM der ersten Zeile zaehlt nicht zum
// Inhalt (der Index parst BOM-bereinigt, siehe parseContent in backlinks.js).
// BOM als Escape-Sequenz statt literalem Zeichen (unsichtbar, M-04).
function comparableText(lineSlice, index) {
  if (index === 0) return lineSlice.text.replace(/^\uFEFF/, '');
  return lineSlice.text;
}

// Berechnet den neuen Datei-Inhalt fuer eine Zeilen-Ersetzung.
//   raw          aktueller Roh-Inhalt der Datei
//   line         1-basierte erwartete Zeilennummer (aus dem Abfrage-Treffer)
//   expectedText erwarteter Roh-Text der Zeile (Konflikt-Absicherung)
//   newText      neuer Zeilen-Text (null/undefined = Zeile unveraendert)
//   insert       optional { text, where: 'above'|'below' } — zusaetzliche
//                Zeile relativ zur Ziel-Zeile (Wiederholungs-Instanz des
//                Toggle-Wegs), EOL folgt der Ziel-Zeile
// Rueckgabe { ok: true, newContent, line } (line = tatsaechlich getroffene
// Zeile) oder { ok: false, reason: 'missing' | 'ambiguous' }.
function computeLineReplacement(raw, { line, expectedText, newText, insert }) {
  const src = String(raw == null ? '' : raw);
  const expected = String(expectedText == null ? '' : expectedText);
  const lines = sliceLines(src);
  let idx = -1;
  const lineIdx = (line | 0) - 1;
  if (
    lineIdx >= 0 &&
    lineIdx < lines.length &&
    comparableText(lines[lineIdx], lineIdx) === expected
  ) {
    idx = lineIdx;
  } else {
    // Zeile verrutscht: eindeutige Suche im ganzen Dokument.
    for (let i = 0; i < lines.length; i++) {
      if (comparableText(lines[i], i) !== expected) continue;
      if (idx >= 0) return { ok: false, reason: 'ambiguous' };
      idx = i;
    }
    if (idx < 0) return { ok: false, reason: 'missing' };
  }
  const target = lines[idx];
  // BOM der ersten Zeile beim Ersetzen erhalten.
  const bom = idx === 0 && target.text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const replacement = newText == null ? target.text : bom + String(newText);
  // Einfuege-Zeile uebernimmt den EOL-Stil der Ziel-Zeile; am Datei-Ende
  // ohne Umbruch wird fuer 'below' ein Umbruch der dominanten Art ergaenzt.
  const eol = target.eol || (src.includes('\r\n') ? '\r\n' : '\n');
  let newLineBlock = replacement;
  if (insert && typeof insert.text === 'string') {
    if (insert.where === 'below') {
      newLineBlock = `${replacement}${eol}${insert.text}`;
    } else {
      newLineBlock = `${insert.text}${eol}${replacement}`;
    }
  }
  const newContent = src.slice(0, target.start) + newLineBlock + src.slice(target.end);
  return { ok: true, newContent, line: idx + 1 };
}

module.exports = { computeLineReplacement, sliceLines };
