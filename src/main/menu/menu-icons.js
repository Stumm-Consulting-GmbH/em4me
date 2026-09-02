// Icon-Zeichnung fuer Menue-Eintraege des Fenster-Menues.
//
// 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Farbpunkte. Native Menues koennen
// Haekchen und Icon nicht kombinieren; das Farbpunkt-Icon traegt daher beide
// Informationen (PO-Freigabe der Plan-Runde): gefuellter Kreis = offen, Ring =
// geschlossen, jeweils in der Arbeitsbereichs-Farbe. Gezeichnet als rohe
// BGRA-Bitmap (premultiplied Alpha, weiche Kante), 16 px plus
// 32-px-Repraesentation fuer HiDPI; pro (Farbe, Zustand) gecacht.
//
// 4T-000887 (Epic 3E-000168): aus menu.js herausgeloest. Die Bitmap-Zeichnung ist
// eine eigene Fachlichkeit neben dem Menue-Baum und hat dort nur mitgewohnt.
'use strict';

const { nativeImage } = require('electron');
const { TAB_GROUP_COLOR_VALUES } = require('../../shared/tab-group-colors');

const dotIconCache = new Map();

function drawDotBitmap(size, hex, filled) {
  const buf = Buffer.alloc(size * size * 4);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const c = (size - 1) / 2;
  const outer = size * 0.42;
  const inner = size * 0.26;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c));
      let alpha = Math.max(0, Math.min(1, outer - d + 0.5));
      if (!filled) alpha = Math.min(alpha, Math.max(0, Math.min(1, d - inner + 0.5)));
      const i = (y * size + x) * 4;
      buf[i] = Math.round(b * alpha);
      buf[i + 1] = Math.round(g * alpha);
      buf[i + 2] = Math.round(r * alpha);
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

function workspaceDotIcon(colorKey, open) {
  const key = `${colorKey}:${open ? 'o' : 'c'}`;
  const cached = dotIconCache.get(key);
  if (cached !== undefined) return cached;
  const hex = TAB_GROUP_COLOR_VALUES[colorKey] || TAB_GROUP_COLOR_VALUES.blue;
  let icon;
  try {
    icon = nativeImage.createFromBitmap(drawDotBitmap(16, hex, open), { width: 16, height: 16 });
    icon.addRepresentation({
      scaleFactor: 2.0,
      width: 32,
      height: 32,
      buffer: drawDotBitmap(32, hex, open),
    });
  } catch {
    // Defensiv: ohne Icon bleibt der Menue-Eintrag voll funktionsfaehig.
    icon = null;
  }
  dotIconCache.set(key, icon);
  return icon;
}

module.exports = { workspaceDotIcon };
