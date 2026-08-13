// 4T-0347 (Epic 3E-0062): Bereichsrelative Ordner-Anzeige. Fuer Listen, die
// Dateien aus dem gesamten Bereichs-Baum zeigen (Backlinks-Panel, Tag-Datei-
// Liste), macht der blosse Basename gleichnamige Dateien aus verschiedenen
// Ordnern ununterscheidbar. relativeDirFromRoot liefert den Ordner-Pfad einer
// Datei relativ zur Index-Wurzel (Bereichs-Wurzelordner bzw. Ordner-Wurzel);
// eine Datei direkt in der Wurzel ergibt einen leeren String, dann wird nur der
// Basename ohne Ordner-Zeile angezeigt.
'use strict';

import { api } from './app/api.js';

// root: absolute Index-Wurzel (payload.meta.wurzel); filePath: absoluter
// Datei-Pfad. Liefert den Ordner-Teil relativ zur Wurzel im nativen Trenner
// (z.B. 'Unter\\Tief') oder '' (Datei direkt in der Wurzel bzw. ungueltige
// Eingabe). Dateien ausserhalb der Wurzel (fuehrendes '..') ergeben ebenfalls
// '' — sie kommen im bereichsbewussten Index nicht vor, der Fall ist defensiv.
export function relativeDirFromRoot(root, filePath) {
  if (!root || !filePath) return '';
  const rel = api.relative(root, filePath);
  if (!rel || rel.startsWith('..')) return '';
  const dir = api.dirname(rel);
  return dir === '.' ? '' : dir;
}
