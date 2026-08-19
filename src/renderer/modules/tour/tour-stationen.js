// 4T-0644 (Epic 3E-0127): Stationen-Folge der geführten Produkt-Tour.
//
// Diese Liste ist die führende Quelle für Reihenfolge, Anker und Texte der
// Tour. Aus der `id` leiten sich die beiden i18n-Schlüssel `tour.<id>.title`
// und `tour.<id>.text` ab; `anker` trägt den Wert des `data-tour`-Attributs
// am Zielelement in index.html oder `null` für eine ankerlose Karte.
//
// Bewusst ohne DOM-Zugriff, ohne driver.js-Import und ohne Seiteneffekt auf
// Modul-Ebene: Der Wächter-Test importiert die Datei unter Node und prüft
// gegen den Bestand, dass jeder genannte Anker im Fenster-Dokument existiert.
// Wer hier etwas ergänzt, ergänzt daher auch Anker und Sprachdateien.
//
// Fünf Stationen laufen ankerlos. `welcome` ist die Einstiegs-Karte und
// `companions` beschreibt die automatisch erzeugten Begleitdateien; für
// `windows`, `queries` und `nextSteps` gibt es kein dauerhaft sichtbares
// DOM-Bedienelement, weil Fenster-Verwaltung und Hilfe im nativen Menü liegen
// und Abfragen im Dokument-Inhalt leben.
'use strict';

export const TOUR_STATIONEN = [
  { id: 'welcome', anker: null },
  { id: 'views', anker: 'views' },
  { id: 'tabs', anker: 'tabs' },
  { id: 'sidebars', anker: 'sidebars' },
  { id: 'windows', anker: null },
  { id: 'areas', anker: 'areas' },
  { id: 'subpages', anker: 'subpages' },
  { id: 'queries', anker: null },
  { id: 'companions', anker: null },
  { id: 'nextSteps', anker: null },
];
