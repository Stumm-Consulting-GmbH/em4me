// 4T-0336 (Epic 3E-0061): Unterseiten-Namens-Logik.
// Traeger der logischen Seiten-Hierarchie ist der Dateiname: das
// Unterseiten-Trennzeichen im Basename ist U+2215 (Division Slash), in
// Wiki-Links wird durchgaengig der normale Slash geschrieben. Dieses Modul
// ist die Single Source fuer die Uebersetzung zwischen beiden Formen,
// Segment-Zerlegung, Eltern-Kette und die Expansion relativer Ziele
// ('/Name' = Unterseite der aktuellen Seite, '..' = Elternseite).
// Electron-frei (CommonJS, Vorbild src/shared/markdown/slug.js).
'use strict';

// U+2215 DIVISION SLASH — NTFS-erlaubt, liegt auf keiner Tastatur und
// entsteht praktisch nie versehentlich in normalen Dateinamen (Epic-
// Architekturentscheidung: Eindeutigkeit der Unterseiten-Semantik).
const SUBPAGE_SEP = '∕';

// Logischer Name (Slash-Form, z.B. 'A/B') -> Dateiname-Basename ('A∕B').
function toFileBasename(logicalName) {
  return String(logicalName || '').replace(/\//g, SUBPAGE_SEP);
}

// Dateiname-Basename ('A∕B') -> logischer Name in Slash-Form ('A/B').
function toLogicalName(fileBasename) {
  return String(fileBasename || '')
    .split(SUBPAGE_SEP)
    .join('/');
}

// Traegt der Basename das Unterseiten-Trennzeichen?
function isSubpageBasename(basename) {
  return String(basename || '').includes(SUBPAGE_SEP);
}

// Segmente des Basenames, aeusserstes zuerst. 'A∕B∕C' -> ['A', 'B', 'C'].
function segmentsOf(basename) {
  return String(basename || '').split(SUBPAGE_SEP);
}

// Basename der Elternseite oder null bei Top-Level-Seiten.
function parentBasename(basename) {
  const s = String(basename || '');
  const idx = s.lastIndexOf(SUBPAGE_SEP);
  return idx < 0 ? null : s.slice(0, idx);
}

// Eigenes (letztes) Namens-Segment.
function lastSegment(basename) {
  const segs = segmentsOf(basename);
  return segs[segs.length - 1] || '';
}

// Eltern-Kette als Basename-Liste, aeusserste Ebene zuerst.
// 'A∕B∕C' -> ['A', 'A∕B']; Top-Level -> [].
function parentChain(basename) {
  const segs = segmentsOf(basename);
  const chain = [];
  for (let i = 1; i < segs.length; i++) {
    chain.push(segs.slice(0, i).join(SUBPAGE_SEP));
  }
  return chain;
}

// Praefix, unter dem alle Nachfahren des Basenames liegen ('A' -> 'A∕').
function childPrefix(basename) {
  return String(basename || '') + SUBPAGE_SEP;
}

// Ist das Wiki-Link-Ziel eine relative Unterseiten-Form?
// '/Name' (Unterseite der aktuellen Seite) oder '..' bzw. '../' (Eltern).
function isRelativeTarget(target) {
  const t = String(target || '').trim();
  return t === '..' || t === '../' || t.startsWith('/');
}

// Expandiert ein relatives Ziel gegen den Basename der aktiven Datei.
// Ergebnis ist immer die U+2215-Form (ohne '.md'), oder null, wenn das
// Ziel nicht aufloesbar ist ('..' auf Top-Level, leerer Rest).
// '/A/B' erlaubt tiefere relative Ziele in einem Schritt.
function expandRelativeTarget(activeBasename, target) {
  const base = String(activeBasename || '');
  const t = String(target || '').trim();
  if (!base) return null;
  if (t === '..' || t === '../') {
    return parentBasename(base);
  }
  if (t.startsWith('/')) {
    const rest = t.slice(1).trim();
    if (!rest) return null;
    return base + SUBPAGE_SEP + toFileBasename(rest);
  }
  return null;
}

// Validierung eines einzelnen Unterseiten-Segments (Anlage-Kommando,
// Umbenennen-Dialog). Liefert null (gueltig) oder einen Fehler-Code:
// 'empty' | 'separator' | 'forbidden' | 'edge'.
function segmentValidationError(segment) {
  const s = String(segment || '');
  if (!s.trim()) return 'empty';
  if (/[/\\]/.test(s) || s.includes(SUBPAGE_SEP)) return 'separator';
  // Unter Windows in Dateinamen verbotene Zeichen plus Steuerzeichen.
  // eslint-disable-next-line no-control-regex
  if (/[<>:"|?*\u0000-\u001f]/.test(s)) return 'forbidden';
  // Fuehrender/abschliessender Punkt oder Leerraum ergibt auf Windows
  // problematische Namen.
  if (/^[\s.]/.test(s) || /[\s.]$/.test(s)) return 'edge';
  return null;
}

// 4T-0585 (Epic 3E-0108): Anzeige-Titel aus einem Datei-Basename (mit oder
// ohne Endung) — Markdown-Endung entfernen, Unterseiten-Trennzeichen in die
// logische Slash-Form uebersetzen. Die Endungs-Liste entspricht dem
// Umbenennen-Fluss (views.js) und den akzeptierten Markdown-Endungen.
const MD_EXTENSION_RE = /\.(md|markdown|mdown|mkd)$/i;
function displayTitleFromBasename(basenameWithExt) {
  return toLogicalName(String(basenameWithExt || '').replace(MD_EXTENSION_RE, ''));
}

// 4T-0339 (Epic 3E-0061): Validierung eines vollstaendigen Datei-Basenames
// (Umbenennen-Dialog). Das Unterseiten-Trennzeichen ist hier erlaubt;
// jedes Segment folgt den Segment-Regeln. Liefert null oder den
// Fehler-Code des ersten ungueltigen Segments.
function basenameValidationError(basename) {
  const s = String(basename || '');
  if (!s.trim()) return 'empty';
  for (const seg of segmentsOf(s)) {
    const err = segmentValidationError(seg);
    if (err) return err;
  }
  return null;
}

module.exports = {
  SUBPAGE_SEP,
  toFileBasename,
  toLogicalName,
  isSubpageBasename,
  segmentsOf,
  parentBasename,
  lastSegment,
  parentChain,
  childPrefix,
  isRelativeTarget,
  expandRelativeTarget,
  segmentValidationError,
  basenameValidationError,
  displayTitleFromBasename,
};
