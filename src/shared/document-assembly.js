// 4T-001290 (Epic 3E-000224): Zusammensetzen der Teile eines großen Dokuments.
// Gegenstück zu src/shared/document-parts.js: Jenes erkennt und benennt die
// Teile, dieses ordnet sie und fügt sie zu einem Dokument zusammen.
//
// Prozessneutral und ohne Datei-Zugriff — es bekommt fertige Namens- und
// Inhalts-Listen und gibt Text und Katalog zurück; das Lesen der Dateien
// übernimmt der Haupt-Prozess. Electron-frei (CommonJS, Vorbild
// src/shared/subpages.js).
//
// Zwei Spuren mit klarer Rangfolge (Architektur, Kapitel «Teilung großer
// Dokumente»): Die Zuordnungs-Zeile in jeder Datei ist die Wahrheit, der
// Katalog in der Begleitdatei des ersten Teils ist Cache. Widerspricht der
// Katalog den Dateien, wird er verworfen und neu gebaut — nie umgekehrt.
'use strict';

const { extractFrontmatter } = require('./markdown/frontmatter.js');
const {
  parsePartBasename,
  baseBasenameOf,
  readPartLine,
  FIRST_PART_INDEX,
} = require('./document-parts.js');

// Schema-Version des Katalogs. Eigene Version, unabhängig von der der
// Zuordnungs-Zeile: Der Katalog ist Cache und darf sich fortentwickeln, ohne
// die Dateien des Anwenders anzufassen. Konstanten-Muster wie
// MDD_SCHEMA_VERSION in src/main/documents/mdd-store.js.
const PARTS_CATALOG_SCHEMA_VERSION = 1;

// Ordnet die gefundenen Teil-Dateien eines Dokuments nach ihrer Position.
//
// Eingabe ist eine Liste von Basenames OHNE Endung, wie sie ein
// Verzeichnis-Durchlauf liefert; `headBasename` ist der Name der Kopf-Datei.
// Die Kopf-Datei darf in der Liste stehen oder fehlen, sie wird in beiden
// Fällen als Teil 1 geführt.
//
// Liefert { parts, luecken, dubletten }:
//   parts     — nach Position aufsteigend, je { index, basename }
//   luecken   — fehlende Positionen zwischen 1 und der höchsten gefundenen
//   dubletten — Positionen, die mehr als einmal vorkommen
//
// Die beiden Befund-Listen werden hier nur ERHOBEN, nicht behandelt: Was bei
// einem fehlenden Teil geschieht, entscheidet der Aufrufer (Nur-Lesen mit
// Angabe des fehlenden Teils, Paket 4).
// Die Namen gehen UNVERÄNDERT durch, so wie das Dateisystem sie geliefert
// hat. Zum Vergleich wird normalisiert, gespeichert wird das Original: Geöffnet
// werden muss später die reale Datei, und ihre Schreibweise darf von der
// erwarteten abweichen.
function orderPartFiles(headBasename, basenames, vergleich) {
  const key = typeof vergleich === 'function' ? vergleich : (s) => String(s);
  const head = key(baseBasenameOf(headBasename));
  const gefunden = new Map();
  const dubletten = [];
  for (const name of basenames || []) {
    const parsed = parsePartBasename(name);
    if (!parsed) continue;
    if (key(parsed.base) !== head) continue;
    if (gefunden.has(parsed.index)) {
      dubletten.push(parsed.index);
      continue;
    }
    gefunden.set(parsed.index, name);
  }
  const parts = [{ index: FIRST_PART_INDEX, basename: headBasename }];
  for (const index of [...gefunden.keys()].sort((a, b) => a - b)) {
    parts.push({ index, basename: gefunden.get(index) });
  }
  const hoechste = parts[parts.length - 1].index;
  const luecken = [];
  for (let i = FIRST_PART_INDEX; i < hoechste; i++) {
    if (!parts.some((p) => p.index === i)) luecken.push(i);
  }
  return { parts, luecken, dubletten: dubletten.sort((a, b) => a - b) };
}

// Fügt die Teile zu einem Dokument zusammen.
//
// Eingabe: nach Position geordnete Liste, je { index, content }.
// Ergebnis: { text }.
//
// Zwei Regeln, beide aus der Zusicherung der Unsichtbarkeit:
//   - Die Kopf-Datei geht UNVERÄNDERT ein, samt ihrem Frontmatter und der
//     darin stehenden Zuordnungs-Zeile. Sie ist die Spur, an der der Anwender
//     die Teilung überhaupt erkennen kann (Festlegung F6).
//   - Von jedem Folgeteil geht nur der Rumpf ein. Sein Frontmatter trägt
//     ausschließlich die technische Zuordnung; stünde er im Puffer, sähe der
//     Anwender mitten im Text YAML-Blöcke, und die Teilung wäre alles andere
//     als unsichtbar.
//
// Die Rümpfe werden OHNE Trennzeichen aneinandergehängt. Das ist die
// Umkehr-Eigenschaft, an der die Zerlegung (Paket 3) sich auszurichten hat:
// Wer so schneidet, dass das schlichte Aneinanderhängen den Ausgangstext
// ergibt, kann verlustfrei zerlegen und zusammensetzen.
//
// 4T-001291 (Paket 3): Zusätzlich zum Text kommen die `grenzen` zurück — die
// Offsets im zusammengesetzten Text, an denen der jeweils NÄCHSTE Teil
// beginnt (also ein Eintrag weniger als Teile). Der Schreib-Weg braucht sie,
// um die bestehenden Teil-Grenzen zu erhalten, statt das Dokument bei jedem
// Speichern neu aufzuteilen. Sie fallen in derselben Schleife an, die den
// Text ohnehin baut; sie zweitens zu berechnen hieße, das Zusammensetzen ein
// zweites Mal zu implementieren — und genau diese Divergenz zwischen Lese-
// und Schreib-Weg wäre der teuerste denkbare Fehler dieses Epics.
function assembleParts(parts) {
  const stuecke = [];
  const grenzen = [];
  let laenge = 0;
  const liste = parts || [];
  for (let i = 0; i < liste.length; i++) {
    const part = liste[i];
    const content = String(part && part.content != null ? part.content : '');
    const stueck =
      part && part.index === FIRST_PART_INDEX ? content : extractFrontmatter(content).body;
    if (i > 0) grenzen.push(laenge);
    stuecke.push(stueck);
    laenge += stueck.length;
  }
  return { text: stuecke.join(''), grenzen };
}

// Baut den Katalog aus den geordneten Teilen.
// Er trägt bewusst nur, was das Auffinden beschleunigt: Position und Name.
// Der Inhalt bleibt draußen — ein Cache, der Inhalte doppelt hielte, wäre eine
// zweite Wahrheit und genau das, was die Rangfolge ausschließt.
function buildCatalog(headBasename, parts) {
  return {
    schemaVersion: PARTS_CATALOG_SCHEMA_VERSION,
    base: baseBasenameOf(headBasename),
    parts: (parts || []).map((p) => ({ index: p.index, basename: p.basename })),
  };
}

// Stimmt der Katalog mit den real gefundenen Teilen überein?
//
// Geprüft wird auf Gleichheit von Grundname, Positionen und Namen. Eine
// fremde oder fehlende Schema-Version gilt als Nicht-Übereinstimmung, nicht
// als Fehler: Der Katalog ist Cache, und ein Cache, den man nicht sicher
// lesen kann, wird verworfen und neu gebaut.
//
// `vergleich` ist die Schlüssel-Funktion für Datei-Namen und muss die des
// Dateisystems sein (pathCompareKey aus src/shared/platform.js). Sie wird
// hereingereicht statt hier bestimmt, damit dieses Modul plattformfrei bleibt
// und im Test beide Fälle prüfbar sind. Ohne Angabe wird case-sensitiv
// verglichen, also die strengere Annahme.
function catalogAgrees(catalog, headBasename, parts, vergleich) {
  const key = typeof vergleich === 'function' ? vergleich : (s) => String(s);
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return false;
  if (catalog.schemaVersion !== PARTS_CATALOG_SCHEMA_VERSION) return false;
  if (!Array.isArray(catalog.parts)) return false;
  if (key(catalog.base) !== key(baseBasenameOf(headBasename))) return false;
  const ist = parts || [];
  if (catalog.parts.length !== ist.length) return false;
  for (let i = 0; i < ist.length; i++) {
    const a = catalog.parts[i];
    const b = ist[i];
    if (!a || a.index !== b.index) return false;
    if (key(a.basename) !== key(b.basename)) return false;
  }
  return true;
}

// Trägt der Datei-Inhalt eine Zuordnungs-Zeile, ist das Dokument also
// überhaupt geteilt? Bequemer Durchgriff auf document-parts.js, damit der
// Lese-Weg nur ein Modul kennen muss.
function partInfoOf(content) {
  return readPartLine(content);
}

// Welche Positionen nennt der Katalog, die im Verzeichnis nicht (mehr) da
// sind? (4T-001292, Entscheidung des Product Owners vom 2026-08-31, Option A.)
//
// Das ist die EINE Frage, für die der Katalog als Zeuge gilt, obwohl er sonst
// nur Cache ist. Der Grund ist ein Loch in der Erkennung: Eine Lücke in der
// Mitte zeigen die Dateinamen selbst, ein fehlender LETZTER Teil nicht — das
// Dokument sähe aus wie ein kürzeres, denn keine Datei kennt die Soll-Anzahl.
// Die Zuordnungs-Zeile trägt sie bewusst nicht, weil sie sonst bei jedem neuen
// Teil in allen bestehenden nachgezogen werden müsste, also genau das
// Rebalancing, das die Ablage-Regeln ausschließen.
//
// Die Rangfolge «bei Widerspruch gewinnt die Datei» bleibt dabei unangetastet:
// Der Katalog darf melden, dass etwas FEHLT, nie aber Inhalt oder Ordnung
// bestimmen. Und die Aussage geht nur in eine Richtung — nennt er WENIGER
// Teile als gefunden, ist er schlicht veraltet und wird verworfen wie bisher.
function fehlendeLautKatalog(catalog, parts) {
  if (!catalog || !Array.isArray(catalog.parts)) return [];
  const vorhanden = new Set((parts || []).map((p) => p && p.index));
  const fehlend = [];
  for (const eintrag of catalog.parts) {
    const index = eintrag && eintrag.index;
    if (!Number.isInteger(index)) continue;
    if (!vorhanden.has(index) && !fehlend.includes(index)) fehlend.push(index);
  }
  return fehlend.sort((a, b) => a - b);
}

// --- Katalog-Sektion der Begleitdatei ---------------------------------------
//
// Der Katalog wohnt als Sektion `parts` im Container der `.mdd` des ersten
// Teils. Gelesen und geschrieben wird er HIER und nicht in
// src/main/documents/mdd-store.js, aus zwei Gründen: Der Container reicht
// unbekannte Sektionen bauartbedingt unverändert durch (parseContainer gibt
// das geparste Objekt zurück, serializeContainer schreibt es vollständig), das
// Wissen um die Sektion muss dort also nicht liegen; und der Katalog gehört
// fachlich zu diesem Modul, das ihn baut und prüft. Der Datei-Zugriff bleibt
// beim Haupt-Prozess, hier wird nur auf dem Container-Objekt gearbeitet.
//
// Fehler-Isolation nach dem Muster der `notes`-Sektion in mdd-store.js: Eine
// fehlende oder defekte Sektion setzt den Katalog aus, nie den Container. Das
// ist bei einem Cache die richtige Härte — was nicht sicher lesbar ist, wird
// verworfen und neu gebaut.
function getCatalog(container) {
  const parts = container && container.parts;
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return null;
  if (parts.schemaVersion !== PARTS_CATALOG_SCHEMA_VERSION) return null;
  if (typeof parts.base !== 'string' || !parts.base) return null;
  if (!Array.isArray(parts.parts)) return null;
  return parts;
}

// Schreibt den Katalog in den Container; null entfernt die Sektion (beim
// Wiedervereinen und sobald ein Dokument nicht mehr geteilt ist).
function setCatalog(container, catalog) {
  if (!container || typeof container !== 'object') return container;
  if (!catalog) delete container.parts;
  else container.parts = catalog;
  return container;
}

module.exports = {
  PARTS_CATALOG_SCHEMA_VERSION,
  orderPartFiles,
  assembleParts,
  buildCatalog,
  catalogAgrees,
  fehlendeLautKatalog,
  partInfoOf,
  getCatalog,
  setCatalog,
};
