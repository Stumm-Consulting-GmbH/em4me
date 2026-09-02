// Reine Helfer des Buch-Panels: Pfad-Schlüssel, Beschriftung, Leseführungs-Ziel
// und die Ziel-Berechnung der Struktur-Pflege. Ohne DOM und ohne Zustand,
// deshalb unmittelbar unit-testbar.
// 4T-000980 (Epic 3E-000196): aus modules/books/book-panel.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert). Das Modul ist das Blatt
// des Buch-Ordners: es importiert nichts aus dem Renderer.
'use strict';

import { pathCompareKey } from '../../../shared/platform.js';

// Eigener Datentyp des Zuges (Muster BOOKMARK_DND_MIME): Datei-Drops aus dem
// Explorer und Reiter-Züge tragen ihn nicht und werden so nie als
// Kapitel-Zug missdeutet.
export const BOOK_DND_MIME = 'application/x-book-chapter';

// Vergleichs-Schlüssel für Pfade: Vorwärts-Schrägstriche, ohne Schluss-Trenner,
// Schreibweise nach der zentralen Auskunft in shared/platform.js (Muster
// fileKey in src/shared/books/book-core.js).
//
// 4T-001276 (Epic 3E-000232, Befund B1): Vorher wurde hier fest kleingeschrieben.
export function pathKey(value) {
  return pathCompareKey(
    String(value || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, ''),
  );
}

// Buch-relativer Pfad einer geöffneten Datei; null, wenn sie außerhalb des
// Buch-Ordners liegt. Die Schreibweise des Ergebnisses stammt aus dem
// Datei-Pfad, verglichen wird über den Schlüssel.
//
// 4T-001276 (Epic 3E-000232, Befund B1): Der Präfix-Vergleich «liegt die Datei im
// Buch-Ordner» ist eine GRENZPRÜFUNG und geht deshalb über dieselbe zentrale
// Auskunft wie jede Gleichheits-Frage — dieselbe Art Entscheidung wie die
// Bereichs-Grenze aus 4T-001203. `pathCompareKey` ist dafür ausdrücklich
// vorgesehen («Für Gleichheits- und Präfix-Vergleiche sowie Pfad-Schlüssel von
// Caches»), eine eigene Eigenschaft braucht es nicht.
export function chapterPathFromFile(bookDir, filePath) {
  const rootRaw = String(bookDir || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const fileRaw = String(filePath || '').replace(/\\/g, '/');
  if (rootRaw === '' || fileRaw === '') return null;
  if (!pathCompareKey(fileRaw).startsWith(pathCompareKey(rootRaw) + '/')) return null;
  const rel = fileRaw.slice(rootRaw.length + 1);
  return rel === '' ? null : rel;
}

// Ziel der Leseführung: `direction` -1 zurück, +1 vor. Ohne gelesenes Kapitel
// führt „vor" an den Anfang des Buches — beim Öffnen steht der Reiter auf der
// Buch-Datei, und das erste Kapitel ist der natürliche Einstieg; „zurück"
// hat dann kein Ziel. null = kein Ziel (Rand der Lese-Ordnung).
export function readingTarget(readingOrder, currentChapter, direction) {
  const list = (Array.isArray(readingOrder) ? readingOrder : []).filter(
    (entry) => typeof entry === 'string' && entry !== '',
  );
  if (list.length === 0) return null;
  const key = pathKey(currentChapter);
  const at = key === '' ? -1 : list.findIndex((entry) => pathKey(entry) === key);
  if (direction < 0) return at > 0 ? list[at - 1] : null;
  return at + 1 < list.length ? list[at + 1] : null;
}

// Beschriftung eines Eintrags: Dateiname ohne Ordner und ohne Endung. Den
// vollen buch-relativen Pfad trägt der Tooltip der Zeile.
export function chapterLabel(relPath) {
  const name = String(relPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  return name.replace(/\.md$/i, '') || name;
}

// --- Struktur-Pflege: reine Ziel-Berechnung (4T-000845) -------------------------

// Umgebung eines Kapitels im gemeldeten Baum: Eltern-Pfad (null auf oberster
// Ebene), Index in seiner Geschwister-Liste und der Knoten selbst. null =
// nicht im Baum. Gegenstück zu locateChapter in src/shared/books/book-core.js; hier
// nötig, weil der Renderer aus dem angezeigten Baum die eine Operation
// ableitet, die er anschließend melden wird.
function locateEntry(nodes, key, parentPath = null) {
  for (let i = 0; i < (Array.isArray(nodes) ? nodes.length : 0); i++) {
    const node = nodes[i];
    if (!node || typeof node.path !== 'string') continue;
    if (pathKey(node.path) === key) return { node, index: i, parentPath };
    const found = locateEntry(node.children, key, node.path);
    if (found) return found;
  }
  return null;
}

// Alle Vergleichs-Schlüssel des Unterbaums eines Kapitels, den Knoten selbst
// eingeschlossen. Sie sind während eines Zuges als Ziel gesperrt: ein Kapitel
// kann nicht unter sich selbst wandern (Fehler 'cycle' des Kern-Moduls, hier
// schon vor dem Ablegen sichtbar gemacht).
export function subtreeKeys(tree, relPath) {
  const keys = new Set();
  const found = locateEntry(tree, pathKey(relPath));
  if (!found) return keys;
  const walk = (node) => {
    keys.add(pathKey(node.path));
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child);
  };
  walk(found.node);
  return keys;
}

// Zone einer Ablage über einem Eintrag: das obere Drittel ordnet davor, das
// untere dahinter, die Mitte hängt als Unterkapitel ein. Dieselbe Drittelung
// wie im Lesezeichen-Baum, damit Ziehen überall gleich reagiert.
export function dropZone(offsetY, height) {
  const h = Number(height) || 0;
  if (h <= 0) return 'into';
  const third = h / 3;
  if (offsetY < third) return 'before';
  if (offsetY > h - third) return 'after';
  return 'into';
}

// Die EINE Baum-Operation, die aus einer Ablage folgt; null = nichts zu tun
// (Ablage auf sich selbst, Position unverändert, gesperrtes Ziel).
//
// `target` ist { path, zone } für die Ablage über einem Eintrag und null für
// die freie Fläche des Panels (Ende der obersten Ebene). `fromUnlinked` sagt,
// ob das gezogene Kapitel aus dem Abschnitt „nicht eingehängt" stammt: dann
// hängt es neu ein ('insert'), sonst hängt es um ('move').
//
// Der Index zählt in der Ziel-Liste NACH dem Aushängen, weil das Umhängen im
// Kern-Modul aus Aushängen und Einhängen besteht; innerhalb derselben Ebene
// rückt ein Ziel unterhalb der eigenen Position deshalb um eins vor.
export function dropTreeOp(tree, sourcePath, target, fromUnlinked = false) {
  const type = fromUnlinked ? 'insert' : 'move';
  const source = String(sourcePath || '');
  if (source === '') return null;
  const blocked = fromUnlinked ? new Set() : subtreeKeys(tree, source);
  if (!target || typeof target.path !== 'string' || target.path === '') {
    return { type, path: source, parentPath: null, index: null };
  }
  const found = locateEntry(tree, pathKey(target.path));
  if (!found) return null;
  if (target.zone === 'into') {
    if (blocked.has(pathKey(target.path))) return null;
    return { type, path: source, parentPath: target.path, index: null };
  }
  const parentPath = found.parentPath;
  // Vor oder hinter einem Kapitel des eigenen Unterbaums abzulegen hieße,
  // unter den eigenen Nachfahren zu landen.
  if (parentPath !== null && blocked.has(pathKey(parentPath))) return null;
  let index = target.zone === 'before' ? found.index : found.index + 1;
  if (!fromUnlinked) {
    const src = locateEntry(tree, pathKey(source));
    if (src && pathKey(src.parentPath || '') === pathKey(parentPath || '')) {
      if (src.index < index) index -= 1;
      if (src.index === index) return null;
    }
  }
  return { type, path: source, parentPath, index };
}
