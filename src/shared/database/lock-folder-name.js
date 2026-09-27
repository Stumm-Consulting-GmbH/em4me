// 4T-001787 (Epic 3E-000255, E9): Der Name des Sperr-Ordners — Vorgabe-Name und
// Gültigkeits-Regel, an einer Stelle.
//
// **Warum prozess-neutral und importfrei.** Dieselbe Regel brauchen zwei
// Seiten: der Sperr-Speicher im Haupt-Prozess, der den wirksamen Namen
// auflöst, und später die Eingabe-Prüfung der Einstellung im Anzeige-Prozess
// (4T-001795). Eine zweite Regel dort wäre der Weg, auf dem beide Seiten
// auseinanderlaufen, und ein Name, den die Oberfläche annimmt, der Speicher
// aber verwirft, hieße: Die Sperre liegt in einem Ordner, den niemand mehr
// sucht.
//
// **Der führende Punkt ist die tragende Regel und keine Schikane.** Die
// Anwendung kennt genau eine Ordner-Regel (`isIgnoredDirName` in
// src/main/index/scan.js), und die hängt an einer Form: `node_modules` und
// jeder Name mit führendem Punkt. Sie hält einen Ordner aus Index,
// Volltext-Suche, Bereichs-Statistik, Verweis-Auflösung, Umbenennungs-Scan und
// Vorlagen-Scan heraus, ohne dass eine dieser Stellen den Bereich kennen muss.
// Ein frei wählbarer Name ohne diese Form zöge den Sperr-Ordner an jeder
// vergessenen Stelle stillschweigend in Index und Suche.
//
// **Die Windows-Menge gilt bewusst auf allen Plattformen**, nach dem Vorbild
// von `sanitizeNewFileName` in src/main/area/area-path.js: Ein Bereich soll
// plattformübergreifend austauschbar bleiben, und ein unter Linux erlaubter
// Ordner mit `:` wäre unter Windows unbrauchbar.
//
// Hier stehen keine Texte und keine Übersetzungs-Schlüssel: Die Codes sind
// sprachneutral, und wer eine Meldung braucht, bildet sie an seinem Bedienort
// ab.
'use strict';

// Vier Gründe für diesen Namen, der erste ist der tragende. Erstens erbt ein
// Name mit führendem Punkt den Ausschluss aus den sechs Stellen oben, ohne dass
// eine davon angefasst werden muss. Zweitens ist ein Punkt-Ordner für den
// Anwender erkennbar keiner seiner eigenen. Drittens folgt `area-` dem Präfix
// `Area_`, unter dem die Anwendung ihre übrigen Objekte in der Bereichs-Wurzel
// führt, und bleibt wie diese englisch und produktneutral. Viertens benennt die
// Mehrzahl den Inhalt.
const DEFAULT_LOCK_FOLDER_NAME = '.area-locks';

// Obergrenze der Länge. Sie schützt den Dateinamen der einzelnen Sperre: Dessen
// Pfad-Budget teilen sich Ordnername und kodierter Gegenstand, und ein
// ausufernder Ordnername ginge zu Lasten der Tabellen-Pfade.
const MAX_LOCK_FOLDER_NAME_LENGTH = 64;

// Sprachneutrale Gründe einer Abweisung. Jeder benennt seine Lage, damit ein
// Bedienort ihm eine eigene Meldung zuordnen kann, ohne einen Text zu deuten.
const LOCK_FOLDER_NAME_CODES = Object.freeze({
  leer: 'leer',
  zuLang: 'zuLang',
  reservierterName: 'reservierterName',
  ohneFuehrendenPunkt: 'ohneFuehrendenPunkt',
  nurPunkte: 'nurPunkte',
  pfadTrenner: 'pfadTrenner',
  verbotenesZeichen: 'verbotenesZeichen',
  endeUnzulaessig: 'endeUnzulaessig',
});

const PFAD_TRENNER_RE = /[\\/]/;
// Die unter Windows verbotenen Zeichen. Die Steuerzeichen stehen bewusst NICHT
// im Ausdruck, sondern werden über ihren Code-Punkt geprüft: Ein Steuerzeichen
// in einer Regex ist als Quelltext unzulässig (Entwicklungsrichtlinien,
// Kapitel 2) und in einer Zeichenklasse zusätzlich schwer zu lesen.
const VERBOTENE_ZEICHEN_RE = /[<>:"|?*]/;

function enthaeltSteuerzeichen(name) {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
// Ein Punkt oder ein Leerzeichen am Ende: Windows schneidet beides beim Anlegen
// still ab, und der angelegte Ordner trüge dann einen anderen Namen als der
// eingestellte.
const ENDE_UNZULAESSIG_RE = /[. ]$/;
const NUR_PUNKTE_RE = /^\.+$/;

// 4T-001795 (Epic 3E-000255): Die reservierten Gerätenamen von Windows. Sie
// bezeichnen dort kein Verzeichnis, sondern ein Gerät, und zwar **mit wie ohne
// Endung**: `CON` und `CON.txt` sind beide belegt. Deshalb der optionale
// Endungs-Teil im Ausdruck.
//
// **Warum die Prüfung VOR dem führenden Punkt steht.** Ein reservierter Name
// scheitert ohnehin schon an der Punkt-Regel, denn `.con` trägt den Punkt und
// ist damit kein Gerätename mehr. Was der Anwender aber eintippt, ist `CON`,
// und dann soll er den Grund erfahren, der seinen Namen unbrauchbar macht,
// statt der bloßen Form-Vorgabe. Die Regel bleibt damit eine eigene mit eigener
// Meldung, wie es die Gültigkeits-Regel des Vorgangs verlangt.
const RESERVIERTER_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Prüft einen Ordnernamen gegen die Gültigkeits-Regel.
 *
 * @param {unknown} name Der zu prüfende Name.
 * @returns {{ok: true, name: string}|{ok: false, code: string}} Der angenommene
 *   Name oder der sprachneutrale Grund der Abweisung.
 */
function pruefeSperrOrdnerName(name) {
  if (typeof name !== 'string' || name === '') {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.leer };
  }
  if (name.length > MAX_LOCK_FOLDER_NAME_LENGTH) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.zuLang };
  }
  if (RESERVIERTER_NAME_RE.test(name)) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.reservierterName };
  }
  if (!name.startsWith('.')) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.ohneFuehrendenPunkt };
  }
  if (NUR_PUNKTE_RE.test(name)) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.nurPunkte };
  }
  if (PFAD_TRENNER_RE.test(name)) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.pfadTrenner };
  }
  if (VERBOTENE_ZEICHEN_RE.test(name) || enthaeltSteuerzeichen(name)) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.verbotenesZeichen };
  }
  if (ENDE_UNZULAESSIG_RE.test(name)) {
    return { ok: false, code: LOCK_FOLDER_NAME_CODES.endeUnzulaessig };
  }
  return { ok: true, name };
}

/**
 * Der wirksame Name: der eingestellte, wenn er die Regel hält, sonst die
 * Vorgabe.
 *
 * Eine fehlende, leere und eine unzulässige Angabe sind für den Aufrufer
 * derselbe Fall — «nichts Brauchbares gesetzt» —, damit jeder Leser denselben
 * Ordner ansteuert und niemand seine eigene Rückfall-Regel baut.
 *
 * @param {unknown} name Die eingestellte Angabe.
 * @returns {string} Der wirksame Ordnername.
 */
function wirksamerSperrOrdnerName(name) {
  const geprueft = pruefeSperrOrdnerName(name);
  return geprueft.ok ? geprueft.name : DEFAULT_LOCK_FOLDER_NAME;
}

module.exports = {
  DEFAULT_LOCK_FOLDER_NAME,
  MAX_LOCK_FOLDER_NAME_LENGTH,
  LOCK_FOLDER_NAME_CODES,
  pruefeSperrOrdnerName,
  wirksamerSperrOrdnerName,
};
