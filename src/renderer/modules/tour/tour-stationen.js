// 4T-000644 (Epic 3E-000127): Stationen-Folge der geführten Produkt-Tour.
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
// Sechs Stationen laufen ankerlos. `welcome` ist die Einstiegs-Karte,
// `modes` trägt ihr Bedienelement selbst und `companions` beschreibt die
// automatisch erzeugten Begleitdateien; für `windows`, `queries` und
// `nextSteps` gibt es kein dauerhaft sichtbares DOM-Bedienelement, weil
// Fenster-Verwaltung und Hilfe im nativen Menü liegen und Abfragen im
// Dokument-Inhalt leben.
//
// 4T-001881 (Epic 3E-000185): Das optionale Feld `bedienelement` nennt ein
// Bedienelement, das die Karte dieser Station trägt; tour.js löst den Namen
// gegen seine Bau-Tafel auf. Genau eine Station führt heute eines, die Wahl
// des Arbeitsmodus.
//
// **Die Stelle der Modus-Station ist die zweite und damit begründet.** Der
// Anwender wählt den Umfang, bevor die Tour ihm die Oberfläche zeigt. Das ist
// nur deshalb unbedenklich, weil keiner der fünf Anker an einer Erweiterung
// oberhalb der Einsteiger-Stufe hängt: Die Ziele stehen in jedem Modus, und
// keine spätere Station verliert durch die Wahl ihre Hervorhebung. Der Wächter
// test/unit/tour-stationen.test.js hält genau das fest, damit ein späterer
// Anker mit Modus-Bindung auffällt, statt die Tour still zu verarmen.
'use strict';

export const TOUR_STATIONEN = [
  { id: 'welcome', anker: null },
  { id: 'modes', anker: null, bedienelement: 'arbeitsmodus' },
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
