// 4T-001377 (Epic 3E-000156): Geteilte Erkennung von Datei-Manager-Produktnamen
// in nutzer-sichtbaren Texten — Stil-Regel 4 der Entwicklungsrichtlinien
// (Kapitel 13): Gattungsname statt Produktname, seit die Anwendung auch unter
// Linux läuft.
//
// Ein Helfer statt zweier Listen: Der Wächter aus 4T-001279 prüfte allein die
// fünf Sprachdateien; die Regel gilt aber ebenso für Handbuch-Seiten und README,
// und dort standen am 2026-09-01 sechs Verstöße unbemerkt im Bestand, während die
// Suite grün lief. Beide Prüfdateien (i18n.test.js für den Katalog,
// hilfetext-stil.test.js für Handbuch und README) lesen dieselbe Liste und
// dieselbe Erkennung; eine zweite Fassung liefe der ersten hinterher (L5).
//
// Die Liste ist bewusst eng: nur Produktnamen von Datei-Managern, in den
// Schreibungen der fünf Sprachfassungen. Eine echte Plattform-Bindung («setzt
// Windows 11 voraus») ist kein Produktname und bleibt erlaubt.
import fs from 'node:fs';

export const VERBOTEN = [
  'Explorer', // Windows, deutsche und englische Fassung («Datei-Explorer», «file explorer»)
  'Explorateur', // französisch
  'Explorador', // spanisch
  'Esplora risorse', // italienisch, Windows bis 10
  'Esplora file', // italienisch, Windows 10 und 11
  'Finder', // macOS
  'Nautilus', // GNOME
  'Thunar', // Xfce
  'Dolphin', // KDE
];

// Wortgrenzen und Groß-Kleinschreibung: «file explorer» und «esplora risorse»
// aus den historischen Fundstellen stehen klein; ein Vergleich, der nur die
// Großschreibung kennt, hätte sie erneut übersehen.
const MUSTER = VERBOTEN.map((name) => ({
  name,
  re: new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu'),
}));

/** Produktnamen in einem Wörterbuch (Katalog-Schlüssel → Text). */
export function produktnamenIn(dict, quelle) {
  const funde = [];
  for (const [key, wert] of Object.entries(dict)) {
    if (typeof wert !== 'string') continue;
    for (const { name, re } of MUSTER)
      if (re.test(wert)) funde.push(`${quelle} / ${key}: "${name}"`);
  }
  return funde;
}

/**
 * Produktnamen in einem Prosa-Text, zeilenweise. Eingezäunte Code-Blöcke
 * bleiben außen vor: Beispiel-Pfade und Kommandos sind keine Benennung eines
 * Werkzeugs, und die Regel richtet sich an die Benennung.
 */
export function produktnamenImText(text, quelle) {
  const funde = [];
  let imZaun = false;
  String(text)
    .split('\n')
    .forEach((zeile, i) => {
      if (/^\s*(```|~~~)/.test(zeile)) {
        imZaun = !imZaun;
        return;
      }
      if (imZaun) return;
      for (const { name, re } of MUSTER)
        if (re.test(zeile)) funde.push(`${quelle} Zeile ${i + 1}: "${name}"`);
    });
  return funde;
}

/** Produktnamen in einer Datei; fehlt sie, gibt es keinen Fund und keinen Fehler. */
export function produktnamenInDatei(pfad, quelle) {
  return fs.existsSync(pfad) ? produktnamenImText(fs.readFileSync(pfad, 'utf8'), quelle) : [];
}
