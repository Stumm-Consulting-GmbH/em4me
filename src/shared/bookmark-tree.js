// 4T-0611 (Epic 3E-0115): Datenmodell der Bereichs-Lesezeichen.
//
// Bereichs-Lesezeichen nutzen dieselbe Knoten-Struktur wie der globale
// Lesezeichen-Baum (src/renderer/modules/bookmarks.js), aber mit Zielen
// RELATIV zur Bereichs-Wurzel. Genau das trägt die Verschiebe-Robustheit:
// die Sektion liegt in Area_Settings.mdda und wandert mit dem Bereichs-Ordner
// mit (Architekturentscheidung 1/2 des Epics).
//
// Knoten-Struktur (wie global):
//   Datei:  { type: 'file',   id, filePath, displayName?, addedAt? }
//   Ordner: { type: 'folder', id, name, expanded, children: [...] }
// Unterschied zum globalen Baum: `filePath` ist ein WURZEL-RELATIVER Pfad
// mit Vorwärts-Schrägstrichen (kein führender Schrägstrich, keine
// `..`-Segmente, kein Laufwerksbuchstabe). Die Sektion selbst ist die
// Knoten-Liste (bare Array), analog zur sidebarLayouts-Sektion.
//
// Reine Struktur- und String-Logik ohne DOM- und ohne Electron-Abhängigkeit
// (CJS, Muster src/shared/sidebar-variants.js und src/shared/journal-core.js).
// Bewusst STRING-basiert ohne node:path, damit dasselbe Modul in beiden
// Prozessen identisch läuft: Main (Datenpfad, IPC) und Renderer (Panel,
// Anlage — 4T-0612) laden es gleichermaßen. Die harte, dateisystem-nahe
// Bereichs-Grenze (Laufwerke, Groß/Klein, `..`-Auflösung) bleibt dem
// Main-Handler über isInsideArea (src/main/area-path.js) vorbehalten; dieses
// Modul liefert die dazu passende reine String-Ebene.
'use strict';

// Normalisiert einen wurzel-relativen Pfad auf die kanonische Form:
// Backslash -> Slash, leere und '.'-Segmente entfallen, '..' hebt das
// vorige Segment auf. Liefert null, wenn der Pfad ausbricht ('..' ohne
// aufhebbares Segment), absolut ist (führender Slash oder Laufwerks-Präfix
// wie C:) oder leer bleibt — solche Ziele sind für den Bereichs-Baum
// unzulässig und ihre Knoten entfallen bzw. lehnt der Schreib-Handler ab.
function normalizeRelPath(value) {
  if (typeof value !== 'string') return null;
  const slashed = value.replace(/\\/g, '/');
  // Absolut? Führender Slash (auch UNC //server) oder Laufwerks-Präfix.
  if (slashed.startsWith('/') || /^[A-Za-z]:/.test(slashed)) return null;
  const out = [];
  for (const rawSeg of slashed.split('/')) {
    const seg = rawSeg.trim();
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null; // Ausbruch über die Wurzel
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.length === 0 ? null : out.join('/');
}

// Ist der Pfad ein zulässiges wurzel-relatives Ziel (bleibt innerhalb der
// Wurzel)? Reine String-Prüfung; die dateisystem-authoritative Grenze zieht
// der Main-Handler zusätzlich über isInsideArea.
function isSafeRelPath(value) {
  return normalizeRelPath(value) !== null;
}

// Wurzel-relatives Ziel gegen eine absolute Bereichs-Wurzel auflösen. Rein
// string-basiert (Vorwärts-Schrägstriche); null bei ungültigem Ziel. Der
// Renderer nutzt das beim Öffnen eines Bereichs-Lesezeichens; Main-Code
// bevorzugt path.resolve(rootPath, relPath) für die OS-native Form.
function toAbsolute(rootAbs, relPath) {
  if (typeof rootAbs !== 'string' || rootAbs === '') return null;
  const rel = normalizeRelPath(relPath);
  if (rel === null) return null;
  const root = rootAbs.replace(/\\/g, '/').replace(/\/+$/, '');
  if (root === '') return null;
  return `${root}/${rel}`;
}

// Absolutes Ziel innerhalb einer Bereichs-Wurzel in die wurzel-relative Form
// umrechnen. Der Präfix-Vergleich ist case-insensitiv (Windows-Dateisystem),
// die zurückgegebene relative Form behält die Original-Schreibweise. Liefert
// null, wenn das Ziel außerhalb der Wurzel liegt oder die Wurzel selbst ist
// (die Wurzel ist kein Datei-Ziel). Der Renderer nutzt das beim Anlegen eines
// Bereichs-Lesezeichens (aktive Datei mit absolutem Pfad -> relatives Ziel).
function toRootRelative(rootAbs, targetAbs) {
  if (typeof rootAbs !== 'string' || typeof targetAbs !== 'string') return null;
  const root = rootAbs.replace(/\\/g, '/').replace(/\/+$/, '');
  const target = targetAbs.replace(/\\/g, '/').replace(/\/+$/, '');
  if (root === '' || target === '') return null;
  const rootLc = root.toLowerCase();
  const targetLc = target.toLowerCase();
  if (targetLc === rootLc) return null; // Wurzel selbst ist kein Ziel
  if (!targetLc.startsWith(rootLc + '/')) return null; // außerhalb der Wurzel
  return normalizeRelPath(target.slice(root.length + 1));
}

// Sammelt die ROH-filePath-Strings aller Datei-Knoten (tolerant, in
// Baum-Reihenfolge). Der Schreib-Handler nutzt die Roh-Pfade für die
// Grenz-Prüfung (ein ausbrechendes '../x' soll den Schreibvorgang ablehnen,
// nicht still bereinigt werden). Nicht-String-Pfade entfallen.
function collectBookmarkFilePaths(tree) {
  const out = [];
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      if (n.type === 'file') {
        if (typeof n.filePath === 'string') out.push(n.filePath);
      } else if (n.type === 'folder' && Array.isArray(n.children)) {
        walk(n.children);
      }
    }
  };
  walk(tree);
  return out;
}

// Einzelnen Knoten säubern; null = Knoten ist defekt und entfällt
// (Fehler-Isolation pro Knoten, Muster normalizeJournal/sanitizeSidebarVariant):
// ohne gültige id, mit unbekanntem Typ oder — bei Datei-Knoten — ohne
// auflösbares wurzel-relatives Ziel ist der Knoten wertlos.
function sanitizeBookmarkNode(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id === '') return null;
  if (raw.type === 'folder') {
    return {
      type: 'folder',
      id,
      name: typeof raw.name === 'string' ? raw.name : '',
      expanded: raw.expanded !== false,
      children: sanitizeBookmarkNodes(raw.children),
    };
  }
  if (raw.type === 'file') {
    const filePath = normalizeRelPath(raw.filePath);
    if (filePath === null) return null;
    const node = { type: 'file', id, filePath };
    if (typeof raw.displayName === 'string') node.displayName = raw.displayName;
    if (typeof raw.addedAt === 'string') node.addedAt = raw.addedAt;
    return node;
  }
  return null;
}

function sanitizeBookmarkNodes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const node = sanitizeBookmarkNode(entry);
    if (node) out.push(node);
  }
  return out;
}

// Säubert die bookmarks-Sektion (Knoten-Liste) tolerant: defekte Knoten
// entfallen, Datei-Ziele werden auf die kanonische wurzel-relative Form
// gebracht. Immer ein Array (leer bei fehlender/defekter Sektion); eine leere
// Liste entfernt die Sektion beim Schreiben (Handler-Muster sidebarLayouts).
function normalizeBookmarksTree(raw) {
  return sanitizeBookmarkNodes(raw);
}

// 4T-0612 (Epic 3E-0115): Bildet einen Knoten (Datei oder Ordner mit Unterbaum)
// auf eine neue Kopie ab, in der jeder Datei-Pfad durch mapFn(filePath) ersetzt
// ist. Trägt die Umwandlung zwischen allgemeinen und Bereichs-Lesezeichen
// (absolut <-> wurzel-relativ). Struktur, Reihenfolge, ids und optionale Felder
// (name, expanded, displayName, addedAt) bleiben erhalten. Liefert null, sobald
// mapFn für IRGENDEIN Datei-Ziel des Unterbaums null (oder keinen String)
// zurückgibt: die Umwandlung wird dann als Ganzes abgelehnt, konsistent zur
// outside-area-Semantik (ein Ziel außerhalb bricht die Relativität des
// Bereichs-Baums). Rein und prozess-neutral.
function mapBookmarkFilePaths(node, mapFn) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  if (node.type === 'folder') {
    const children = [];
    const source = Array.isArray(node.children) ? node.children : [];
    for (const child of source) {
      const mapped = mapBookmarkFilePaths(child, mapFn);
      if (mapped === null) return null;
      children.push(mapped);
    }
    return { ...node, children };
  }
  if (node.type === 'file') {
    const mapped = mapFn(node.filePath);
    if (typeof mapped !== 'string' || mapped === '') return null;
    return { ...node, filePath: mapped };
  }
  return null;
}

module.exports = {
  normalizeRelPath,
  isSafeRelPath,
  toAbsolute,
  toRootRelative,
  collectBookmarkFilePaths,
  sanitizeBookmarkNode,
  normalizeBookmarksTree,
  mapBookmarkFilePaths,
};
