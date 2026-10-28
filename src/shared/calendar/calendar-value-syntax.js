// 4T-000546 (Epic 3E-000097): Wert-Syntax der Kalender im Dokument.
// 4T-002363 (Epic 3E-000333): aus calendar-core.js als eigene Fachlichkeit
// geschnitten (Größen-Budget des Kerns); der Kern lädt dieses Blatt-Modul und
// reicht parseCalendarValueRaw und findCalendarValues unter denselben Namen
// weiter, damit kein Aufrufer sich ändert. Das Modul lädt nichts aus dem Ordner.
'use strict';

// Wert-Syntax im Dokument (4T-000546):
// `@{Kalendername: Wert}` — eine Zeile, keine geschachtelten Klammern; der
// erste Doppelpunkt trennt Name und Wert (Kalendernamen mit Doppelpunkt
// sind nicht adressierbar, dokumentierte Grenze). Gemeinsame Erkennungs-
// Quelle für Markdown-Pipeline, Editor-Dekoration und Portable-Export
// (keine Regex-Kopien; Code-Kontexte schliessen die Konsumenten aus).

// 4T-001902: Der Auslöser darf nicht von einem weiteren `@` eingeleitet sein.
// `@@{14:00}` ist die Uhrzeit einer Kanban-Karte des Vorbild-Werkzeugs; ohne
// die Sperre läse der Scanner das innere `@{14:00}` als Wert «00» eines
// Kalenders namens «14».
const CALENDAR_VALUE_SCAN_RE = /(?<!@)@\{[^{}\n]*\}/g;

// Zerlegt ein rohes Vorkommen (inklusive `@{`/`}`) in Name und Wert;
// null, wenn die Form nicht passt (leerer Name oder Wert).
function parseCalendarValueRaw(raw) {
  const s = String(raw == null ? '' : raw);
  if (!s.startsWith('@{') || !s.endsWith('}')) return null;
  const inner = s.slice(2, -1);
  if (inner.includes('{') || inner.includes('}') || inner.includes('\n')) return null;
  const colon = inner.indexOf(':');
  if (colon < 0) return null;
  const name = inner.slice(0, colon).trim();
  const value = inner.slice(colon + 1).trim();
  if (name === '' || value === '') return null;
  return { name, value };
}

// Alle Wert-Vorkommen eines Texts: [{ from, to, name, value, raw }].
function findCalendarValues(text) {
  const out = [];
  const source = String(text == null ? '' : text);
  CALENDAR_VALUE_SCAN_RE.lastIndex = 0;
  let m;
  while ((m = CALENDAR_VALUE_SCAN_RE.exec(source)) !== null) {
    const parsed = parseCalendarValueRaw(m[0]);
    if (!parsed) continue;
    out.push({ from: m.index, to: m.index + m[0].length, raw: m[0], ...parsed });
  }
  return out;
}

module.exports = { parseCalendarValueRaw, findCalendarValues };
