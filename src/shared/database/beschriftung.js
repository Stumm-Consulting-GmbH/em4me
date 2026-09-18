// 4T-001509 (Epic 3E-000250, E21.2): Die Beschriftung eines Datenbank-Objekts —
// einfacher Text oder Zuordnung von Sprache zu Text.
//
// **Eigene Datei, weil die Angabe nicht der Tabelle gehört.** Die Funktion
// stammt aus 4T-001506 und lag bis zum Steckbrief im Definitions-Modul, weil
// dort ihr einziger Verbraucher saß. E21.2 sagt aber ausdrücklich, dieselbe
// Angabe trage **jedes** übersetzbare Objekt: Tabelle, Feld, einzelner
// Auswahlwert und Maske, dazu Name und Beschreibung der Datenbank. Mit dem
// zweiten Verbraucher wäre sie entweder doppelt geschrieben oder quer aus dem
// Definitions-Modul geliehen worden; beides sind Nähte, die nicht halten.
// Der Schnitt folgt derselben Naht-Logik wie der von `table-hinweise.js`:
// Was einen eigenen Gegenstand beschreibt, bekommt seine eigene Datei.
//
// Blatt-Modul: Es importiert nichts, weder aus der Datenbank noch aus dem Haus.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

function istEinfachesObjekt(wert) {
  return wert !== null && typeof wert === 'object' && !Array.isArray(wert);
}

// Skalar -> getrimmter Text; null, wenn kein verwertbarer Text übrigbleibt.
// Enger normalisiert als eine Werte-Liste, aus demselben Grund wie in
// property-profiles-options.js: Ein Feldname, ein Typ-Wort, eine Beschriftung
// sind Text, und eine Zahl an dieser Stelle ist ein Irrtum und kein
// umzuwandelnder Wert.
function alsText(wert) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  return text === '' ? null : text;
}

// Beschriftung nach E21.2: einfacher Text oder Zuordnung von Sprache zu Text.
// Liefert den Text, ein normalisiertes Zuordnungs-Objekt oder null (Angabe
// nicht bildbar).
//
// **Ein defekter Eintrag setzt die ganze Zuordnung aus**, nicht nur sich
// selbst — dieselbe Regel, die `pruefePfadListe` im Options-Katalog anwendet
// und aus demselben Grund: Eine halbe Beschriftungs-Zuordnung zeigte einige
// Sprachen und ließe andere still verschwinden, und der Rückfall auf den
// technischen Namen ist ehrlicher als eine lückenhafte Übersetzung.
//
// Sprach-Kennungen werden kleingeschrieben geführt (`DE` und `de` sind
// dieselbe Sprache); die Kennungen selbst bleiben ungeprüft, weil eine fremde
// Datenbank Sprachen führen darf, welche die Anwendung nicht kennt.
function normalisiereBeschriftung(roh) {
  const text = alsText(roh);
  if (text !== null) return text;
  if (!istEinfachesObjekt(roh)) return null;
  const zuordnung = {};
  for (const [sprache, wert] of Object.entries(roh)) {
    const kennung = alsText(sprache);
    const beschriftung = alsText(wert);
    if (kennung === null || beschriftung === null) return null;
    zuordnung[kennung.toLowerCase()] = beschriftung;
  }
  return Object.keys(zuordnung).length > 0 ? zuordnung : null;
}

// Die erste Sprache, in der eine Beschriftung geschrieben ist — die Grundlage
// des Vorgabewerts der Rückfall-Sprache (E21.4). Ein einfacher Text nennt
// seine Sprache nicht und liefert deshalb nichts; nur eine Sprach-Zuordnung
// weiß, in welcher Sprache sie geschrieben wurde.
//
// «Erste» heißt die Schreib-Reihenfolge der Datei: Die Zuordnung behält die
// Reihenfolge, in der der Autor sie geschrieben hat, und die ist die einzige
// Aussage, die eine Zuordnung über den Vorrang ihrer Sprachen macht.
function ersteSprache(beschriftung) {
  if (!istEinfachesObjekt(beschriftung)) return null;
  const kennungen = Object.keys(beschriftung);
  return kennungen.length > 0 ? kennungen[0] : null;
}

// 4T-001758 (Epic 3E-000253): Die Beschriftung in der Sprache des Anwenders —
// die Rückfall-Kette aus E21.4, angewandt auf EINE Beschriftung.
//
// Ein einfacher Text ist in jeder Sprache derselbe und kommt unverändert
// zurück. Eine Sprach-Zuordnung wird in dieser Reihenfolge aufgelöst:
//
//   1. die aktive Sprache des Anwenders;
//   2. die wirksame Rückfall-Sprache der Datenbank (Stufe 2 der Kette; sie
//      kommt als Parameter, weil sie über die ganze Datenbank hinweg bestimmt
//      wird und nicht aus einer einzelnen Beschriftung folgt);
//   3. die erste geschriebene Fassung, also die Sprache, in der der Autor
//      angefangen hat.
//
// Bleibt auch die leer, liefert die Funktion null: Der letzte Schritt der Kette
// ist der technische Name, und den kennt nur der Aufrufer — eine Tabelle fällt
// auf ihren Dateinamen zurück, eine Datenbank auf ihren Ordner. Ein erfundener
// Ersatz an dieser Stelle nähme ihm die Wahl.
function loeseBeschriftung(beschriftung, sprache, rueckfallSprache = null) {
  const text = alsText(beschriftung);
  if (text !== null) return text;
  if (!istEinfachesObjekt(beschriftung)) return null;
  const kandidaten = [alsText(sprache), alsText(rueckfallSprache)];
  for (const kennung of kandidaten) {
    if (kennung === null) continue;
    const treffer = alsText(beschriftung[kennung.toLowerCase()]);
    if (treffer !== null) return treffer;
  }
  const erste = ersteSprache(beschriftung);
  return erste === null ? null : alsText(beschriftung[erste]);
}

module.exports = {
  istEinfachesObjekt,
  alsText,
  normalisiereBeschriftung,
  ersteSprache,
  loeseBeschriftung,
};
