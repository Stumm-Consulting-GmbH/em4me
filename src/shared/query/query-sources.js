// 4T-1070 (Epic 3E-0211): Quellen-Auswertung der Perspective-Query-Sprache
// (FROM-Ebene), herausgelöst aus perspective-query-eval.js. Der Schnitt wurde
// vom Datei-Größen-Budget erzwungen, folgt aber der Naht, die der Kern schon
// als eigenes Kapitel führte: Hier steht ausschließlich die Frage, ob eine
// Datei zur Quellen-Menge einer Abfrage gehört (Ordner, Tag, Link-Bezug,
// Selbstbezug samt ihren Verknüpfungen); die Werte-Frage bleibt im Kern.
//
// Stellung im Ordner `query/`: Blatt wie query-format.js. Das Modul lädt
// nichts aus dem eigenen Ordner, und der Kern lädt von hier — der Import-Graph
// bleibt damit kreisfrei. Die Ordner-Normalisierung liegt hier und nicht im
// Kern, weil sie der eine Ordner-Begriff der Sprache ist und außer der
// Quellen-Ebene auch der Funktions-Katalog sie braucht.
//
// Prozess-neutral (kein Electron, kein DOM), kein eval.
'use strict';

const { pathCompareKey } = require('../platform.js');

// Normalisiert eine Ordner-Angabe der Quelle: Backslashes zu '/', führende und
// schließende Slashes weg, Schreibweise nach der zentralen Auskunft.
//
// 4T-1276 (Epic 3E-0232, Befund B1): Vorher wurde hier fest kleingeschrieben
// mit der Begründung «Windows-Dateisystem ist case-insensitiv». Ein Ordner ist
// Datei-Identität; die Tag-Vergleiche weiter unten (srcTag) sind es NICHT und
// bleiben deshalb bewusst plattform-unabhängig tolerant — ein Tag ist ein
// logischer Name, dieselbe Abgrenzung wie bei den Wiki-Namen in
// shared/markdown/link-scan.js.
function normFolder(s) {
  return pathCompareKey(
    String(s || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, ''),
  );
}

// Prüft eine Datei (über ihren Abfrage-Kontext) gegen den FROM-Quellen-AST.
// Ohne Quelle (node null) gehört jede Datei dazu.
function matchesSource(node, ctx) {
  if (!node) return true;
  const f = ctx && ctx.file;
  switch (node.type) {
    case 'srcOr':
      return matchesSource(node.left, ctx) || matchesSource(node.right, ctx);
    case 'srcAnd':
      return matchesSource(node.left, ctx) && matchesSource(node.right, ctx);
    case 'srcNot':
      return !matchesSource(node.operand, ctx);
    case 'srcFolder': {
      if (!f || typeof f.folder !== 'string') return false;
      const wanted = normFolder(node.value);
      if (!wanted) return true; // leerer Ordner-String = Wurzel = alles
      const folder = normFolder(f.folder);
      return folder === wanted || folder.startsWith(wanted + '/');
    }
    case 'srcTag': {
      if (!f || !Array.isArray(f.tags)) return false;
      const wanted = String(node.value).toLowerCase();
      // Hierarchisch: #projekt trifft auch projekt/unterprojekt.
      return f.tags.some((t) => {
        const tl = String(t).toLowerCase();
        return tl === wanted || tl.startsWith(wanted + '/');
      });
    }
    // 4T-1070 (Epic 3E-0211): Selbstbezugs-Quelle. Ziel ist die Träger-Datei
    // selbst, ihr Pfad steht im Selbst-Kontext — es braucht also keine
    // Wiki-Auflösung. Ohne Träger-Kontext liefert die Quelle die LEERE Menge
    // und nicht 'alles', damit ein unvollständiger Kontext nie zu einem zu
    // großen Ergebnis führt (Konzept-Entscheid E2).
    case 'srcSelf': {
      const selfFile = ctx && ctx.self && ctx.self.file;
      if (!f || !selfFile || typeof selfFile.absPath !== 'string') return false;
      const target = pathCompareKey(selfFile.absPath);
      // mode 'in':  Dateien, die auf die Träger-Datei verlinken.
      // mode 'out': Dateien, auf die die Träger-Datei verlinkt.
      const links = node.mode === 'in' ? f.outlinks : f.inlinks;
      if (!Array.isArray(links)) return false;
      return links.some((l) => pathCompareKey(String(l.path)) === target);
    }
    case 'srcLink': {
      if (!f || !ctx || typeof ctx.resolveLinkTarget !== 'function') return false;
      const targetPaths = ctx.resolveLinkTarget(node.target);
      if (!targetPaths || targetPaths.size === 0) return false;
      // mode 'in':  Dateien, die auf X verlinken  -> eigene outlinks treffen X.
      // mode 'out': Dateien, auf die X verlinkt   -> eigene inlinks kommen von X.
      const links = node.mode === 'in' ? f.outlinks : f.inlinks;
      if (!Array.isArray(links)) return false;
      return links.some((l) => targetPaths.has(pathCompareKey(String(l.path))));
    }
    default:
      return false;
  }
}

module.exports = { normFolder, matchesSource };
