// 4T-001787 (Epic 3E-000255, E9): Der Sperr-Speicher — Ort, Name, Inhalt und
// die vier Zugriffe anlegen, lesen, auflisten, entfernen.
//
// **Der Ort ist abgeleitet und nicht gewählt** (Ablage-Regel für Daten der
// Anwendung): ein eigener Ordner in der Bereichs-Wurzel, darin **eine Datei je
// Sperre**. Eine Datei je Sperre ist die einzige Gestalt, die das exklusive
// Anlegen tragen kann, denn dort ist das Anlegen selbst die Prüfung; eine
// Sektion in einer gemeinsamen Datei kennt das Primitiv nicht, und ein
// Lesen-Prüfen-Schreiben an ihrer Stelle wäre genau der Wettlauf, gegen den die
// Sperre antritt.
//
// **Der Ordnername wird bei jedem Zugriff frisch gelesen** und nie
// zwischengespeichert. Ein Zwischenspeicher machte das Fenster, in dem zwei
// Rechner in verschiedene Ordner schreiben, unbegrenzt lang; ohne ihn bleibt es
// auf die Dauer einer Umbenennung beschränkt.
//
// **Der Dateiname kodiert den Gegenstand umkehrbar**, und zwar über den
// wurzel-relativen Pfad der Tabellen-Datei, **kleingeschrieben und nach NFC
// normalisiert**. Das ist keine Kosmetik: Auf Windows und auf einer Freigabe
// bezeichnen `Kunden.md` und `kunden.md` dieselbe Datei, und ohne diese
// Normalisierung bekämen zwei Rechner zwei verschiedene Sperren für denselben
// Gegenstand — die Sperre versagte still. Die ursprüngliche Schreibweise steht
// im Inhalt.
//
// **Nicht hier:** der Lebenszyklus der Sperre. Nehmen, Freigeben, Frist, Bruch
// und Sperr-Ordnung sind ein eigener Vorgang (4T-001788) und setzen auf diesem
// Speicher auf. Dieses Modul kennt keinen Timer, keine Frist und keine
// Reihenfolge; es hat in diesem Task außer seinen Prüffällen keinen Aufrufer,
// und das ist gewollt. Ebenso wenig gibt es hier einen IPC-Kanal, eine
// Oberfläche oder einen Sprach-Schlüssel.
//
// 4T-001788 (Epic 3E-000255, Bauplan L3, L5, L6): Der Speicher bekommt den
// **dritten Gegenstand** (die Beleg-Datei einer Tabelle) und in seinen
// Ergebnissen den **Stand** einer Sperre. Der Lebenszyklus selbst bleibt
// draußen; was hier hinzukommt, ist Mechanik, die er braucht, und keine Regel
// über Frist, Bruch oder Reihenfolge.
//
// 4T-001820 (Epic 3E-000254, Bauplan B1): Der Speicher bekommt den **vierten
// Gegenstand**, den Vorgangs-Zähler des Bereichs. Er ist der erste, der keine
// Datei im Bereich bezeichnet, sondern den Bereich selbst; Dateiname und
// Umkehrung tragen deshalb nur seine Marke. Die Reihenfolge, in der er genommen
// wird, liegt wie bei den drei anderen nicht hier, sondern in der Sperr-Ordnung.
//
// **Der fünfte Zugriff, das Ablösen, liegt in `lock-replace.js`** (L6a). Mit
// dem Bruch-Anspruch ist er so umfangreich geworden, dass er dieses Modul über
// sein Datei-Budget gehoben hätte. Er ist deshalb **kein** zweiter
// Zugriffs-Weg neben diesem hier: Er benutzt die Helfer dieses Moduls, also
// Nähte, Ort, exklusives Schreiben, Lesen und Änderungszeit, die dafür mit
// ausgereicht werden. Die Richtung ist eindeutig und zyklenfrei,
// `lock-replace.js` importiert hier und nie umgekehrt.
'use strict';

const crypto = require('node:crypto');
// 4T-001964: Vorgabe ist der frisch lesende Dateizugriff; unter einer Sperre
// liefert der Netzwerk-Client sonst den Stand vor dem Ersetzen durch einen
// anderen Rechner (Begründung in frisch-lesen.js).
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const path = require('node:path');

// Die Bereichs-Grenze der Anwendung, eine einzige Innerhalb-Prüfung für alle
// Grenz-Pfade. area/ importiert seinerseits nichts aus database/ — kein
// Ordner-Zyklus (Entwicklungsrichtlinien, Kapitel 1).
const { isInsideArea } = require('../area/area-path.js');
// Der wirksame Ordnername kommt aus DIESER Regel und nicht aus einer zweiten
// Rückfall-Regel je Leser (AK11).
const { normalisiereDatenbankKonfig } = require('../area/area-config.js');
const { kennungFuer, nummerAus } = require('../../shared/database/record-identity.js');
// Zeitpunkt-Form der Datenbank: UTC, sekundengenau. Eine zweite Formatierung
// entsteht hier nicht.
const { zeitpunktAus } = require('../../shared/database/change-record.js');
const { herkunftsFelder } = require('../documents/mdd-herkunft.js');
const { ermittleHerkunft } = require('../herkunft.js');
// 4T-001788 (L6): Das Umbenennen ist der Anspruch beim Ablösen, und es gelingt
// auf einer Netz-Freigabe nicht verlässlich beim ersten Versuch (gemessene
// Grundlage im Kopf von atomic-write.js). Es läuft deshalb über dieselbe
// Wiederhol-Schleife wie jedes andere Umbenennen der Anwendung; eine zweite
// wäre eine zweite Auslegung desselben Fensters.
const { benenneUmMitWiederholung } = require('../documents/atomic-write.js');

// Versions-Kennung des Sperr-Inhalts (Entwicklungsrichtlinien, Kapitel 12: jedes
// persistierte Format trägt eine im Datenbestand).
const SPERR_SCHEMA_VERSION = 1;

// Obergrenze des Dateinamens. Ein längerer Name wird **abgewiesen statt
// gekürzt**: Ein gekürzter Name wäre nicht mehr eindeutig, und zwei Tabellen mit
// langem gemeinsamem Pfad-Anfang teilten sich dann eine Sperre.
const MAX_SPERR_DATEINAME = 240;

const SPERR_ENDUNG = '.lock';
// Das Trennzeichen kommt in der kodierten Form nie vor: encodeURIComponent
// schreibt ein `+` als `%2B`. Auf allen Ziel-Systemen ist es zulässig.
const TRENNER = '+';

const ART_DATENSATZ = 'record';
const ART_DEFINITION = 'definition';
// 4T-001788 (L3): Die Beleg-Datei einer Tabelle ist ein **eigener** Gegenstand.
// Die Definitions-Sperre dafür mitzubenutzen wäre falsch, weil sie «das Schema
// wird geändert» bedeutet: Ein Kollege, der die Definition bearbeitet, hielte
// damit jede Verdichtung an, und umgekehrt hielte eine laufende Verdichtung ihn
// von der Definition fern.
const ART_CHANGE_LOG = 'changeLog';
// 4T-001820 (Epic 3E-000254, Bauplan B1): Die **vierte** Art, der Vorgangs-Zähler
// des Bereichs. Ihr Gegenstand ist der Bereich als Ganzes und nicht eine Datei
// in ihm: Der Zähler ist je Datenbank einer, und eine Sperre je Tabelle schützte
// ihn gerade nicht. Sie trägt deshalb als einzige Art weder Tabelle noch interne
// Kennung.
const ART_COUNTER = 'counter';
// 4T-001824 (Epic 3E-000254, Bauplan B1): Die **fünfte** Art, die Aufräum-Sperre
// eines liegengebliebenen Absichts-Protokolls. Wie der Zähler bezeichnet sie
// keine Datei im Bereich; anders als er trägt sie eine Kennung, nämlich die
// Vorgangs-Kennung des Protokolls. So gibt es je Protokoll genau eine
// Aufräum-Sperre, und die Protokolle zweier Aufträge halten einander nicht auf.
const ART_SWEEP = 'sweep';

// Marke im Dateinamen je Art. Ein Objekt statt dreier Konstanten, damit
// Namensbildung und Umkehrung aus **derselben** Zuordnung lesen und eine vierte
// Art nicht an zwei Stellen nachgetragen werden muss.
//
// Die Buchstaben sind die Anfangsbuchstaben der englischen Art-Namen; `c` folgt
// diesem Muster (4T-001820, B1), ebenso `s` (4T-001824, B1).
const MARKE_JE_ART = Object.freeze({
  [ART_DATENSATZ]: 'r',
  [ART_DEFINITION]: 'd',
  [ART_CHANGE_LOG]: 'l',
  [ART_COUNTER]: 'c',
  [ART_SWEEP]: 's',
});
const ART_JE_MARKE = Object.freeze(
  Object.fromEntries(Object.entries(MARKE_JE_ART).map(([art, marke]) => [marke, art])),
);

// Codes der Fehlschläge. Sie tragen den Namen ihrer Lage, damit ein Aufrufer den
// unbrauchbaren Gegenstand vom nicht beschreibbaren Ort unterscheiden kann, ohne
// den Text zu lesen (Muster change-log.js).
const SPERR_CODES = Object.freeze({
  wurzel: 'sperrWurzelFehlt',
  ohneKonfigNaht: 'sperrOhneKonfigNaht',
  gegenstand: 'sperrGegenstandUngueltig',
  ausserhalb: 'sperrGegenstandAusserhalbBereich',
  nameZuLang: 'sperrDateinameZuLang',
  nameUnlesbar: 'sperrDateinameUnlesbar',
  anlegen: 'sperrAnlegenFehlgeschlagen',
  auflisten: 'sperrAuflistenFehlgeschlagen',
  entfernen: 'sperrEntfernenFehlgeschlagen',
  abloesen: 'sperrAbloesenFehlgeschlagen',
});

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

function fehler(code, text) {
  return { ok: false, code, error: text };
}

// Einspritzbare Nähte nach dem Vorbild change-log.js: Dateisystem, Uhr,
// Herkunft und die Normalisierung. Der Leser der Bereichs-Konfiguration ist
// **keine** Vorgabe, sondern Pflicht (siehe pruefeKonfigNaht).
function nahtstellen(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  return {
    fsp: d.fsp || frischerDateizugriff,
    jetzt: typeof d.jetzt === 'function' ? d.jetzt : () => zeitpunktAus(new Date()),
    herkunft: typeof d.herkunft === 'function' ? d.herkunft : ermittleHerkunft,
    normalisiere:
      typeof d.normalisiere === 'function' ? d.normalisiere : normalisiereDatenbankKonfig,
    // 4T-001788 (L6): Umbenennen und Zufall als Nähte, damit ein Prüffall den
    // Wettlauf auf der Freigabe und die Namensbildung in der Hand hat.
    benenneUm: typeof d.benenneUm === 'function' ? d.benenneUm : benenneUmMitWiederholung,
    zufall: typeof d.zufall === 'function' ? d.zufall : zufallsMarke,
    // 4T-001788 (L6a): Die beiden Nähte des Bruch-Anspruchs. Die eigene
    // Prozess-Nummer steht in seinem Inhalt, und die Beurteilung eines
    // liegengebliebenen Anspruchs kommt von der Verwaltung herein.
    //
    // **Ohne die Naht gilt ein Anspruch nie als verwaist**, und das ist kein
    // Versehen: Dieses Modul kennt weder Frist noch Lebend-Prüfung, und eine
    // eigene Auslegung hier wäre die zweite Wahrheit darüber, wann ein Halter
    // fort ist. Im Zweifel bleibt der Anspruch also stehen, genau wie eine
    // Sperre im Zweifel stehen bleibt.
    pid: Number.isInteger(d.pid) ? d.pid : process.pid,
    anspruchVerwaist: typeof d.anspruchVerwaist === 'function' ? d.anspruchVerwaist : null,
  };
}

// Acht Byte als 16 Hex-Zeichen. Dieselbe Breite trägt die Marke im Inhalt einer
// Sperre (4T-001788, L5); eine zweite Erzeugung entsteht dafür nicht.
function zufallsMarke() {
  return crypto.randomBytes(8).toString('hex');
}

// 4T-001788 (L5): Der **Stand** einer Sperre, der SHA-256-Wert ihres rohen
// Datei-Inhalts. Über ihn laufen alle Vergleiche «ist das noch die Sperre, über
// die geurteilt wurde». Ein leerer oder unlesbarer Inhalt bekommt den Stand des
// leeren Textes, damit es keinen Sonderwert gibt, den ein Aufrufer vergessen
// könnte.
function standVon(text) {
  return crypto
    .createHash('sha256')
    .update(typeof text === 'string' ? text : '', 'utf8')
    .digest('hex');
}

// Der EINE exklusive Schreibvorgang der Sperre. Das Anlegen, der Bruch-Anspruch
// und das Zurückstellen beim Ablösen laufen alle hierüber, damit `flag: 'wx'`
// an genau einer Stelle steht (Wächter
// test/unit/atomares-schreiben-aufrufer.test.js). Genau deshalb ist er
// exportiert: `lock-replace.js` benutzt ihn, statt ein zweites `wx` zu
// schreiben.
function schreibeExklusiv(fsp, pfad, text) {
  return fsp.writeFile(pfad, text, { encoding: 'utf8', flag: 'wx' });
}

// Fail-closed wie die Sperr-Naht der Verdichtung: Ohne den Leser der
// Bereichs-Konfiguration ist der Ordner nicht bestimmbar, und ein Rückfall auf
// den Vorgabe-Namen wäre genau die stille Weiche, die eine Sperre ins Leere
// zeigen lässt. Deshalb wird verweigert, bevor irgendetwas geschieht.
function pruefeKonfigNaht(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  if (typeof d.leseKonfig !== 'function') {
    return fehler(
      SPERR_CODES.ohneKonfigNaht,
      'Der Sperr-Speicher verlangt den Leser der Bereichs-Konfiguration als Naht leseKonfig.',
    );
  }
  return { ok: true };
}

// --- Ordner ---------------------------------------------------------------------------

/**
 * Der wirksame Name des Sperr-Ordners eines Bereichs, bei jedem Aufruf frisch
 * gelesen.
 *
 * Eine fehlende, defekte oder unbrauchbar befüllte Bereichsdatei führt auf den
 * Vorgabe-Namen und nicht auf einen Fehler (AK12): Das ist die bestehende
 * Fehler-Regel der Bereichs-Sektionen, und eine Sperre, die an einer defekten
 * Einstellungs-Datei scheiterte, hielte den Anwender ohne Not auf.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{leseKonfig: (rootPath: string) => Promise<object|undefined>, normalisiere?: Function}} deps
 * @returns {Promise<string>} Der wirksame Ordnername.
 */
async function sperrOrdnerName(bereichsWurzel, deps) {
  const { normalisiere } = nahtstellen(deps);
  let roh;
  try {
    roh = await deps.leseKonfig(bereichsWurzel);
  } catch {
    roh = undefined; // defekte oder unlesbare Bereichsdatei wirkt wie «nicht gesetzt»
  }
  return normalisiere(roh).lockFolderName;
}

/**
 * Der Pfad des Sperr-Ordners eines Bereichs.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {object} deps Nähte, `leseKonfig` ist Pflicht.
 * @returns {Promise<string>} Absoluter Pfad des Ordners.
 */
async function sperrOrdnerPfad(bereichsWurzel, deps) {
  return path.join(bereichsWurzel, await sperrOrdnerName(bereichsWurzel, deps));
}

// --- Gegenstand und Dateiname ---------------------------------------------------------

/**
 * Der Gegenstand, aufgelöst: Art, wurzel-relativer Pfad in ursprünglicher
 * Schreibweise, sein Vergleichs-Schlüssel, die aufgefüllte Kennung und die
 * nackte Nummer.
 *
 * 4T-001788 (L8): Die Auflösung ist **exportiert**, weil die Sperr-Ordnung auf
 * ihrem Vergleichs-Schlüssel und ihrer Nummer arbeitet. Beide entstehen damit
 * genau einmal; eine zweite Bildung wäre eine zweite Wahrheit darüber, welche
 * zwei Gegenstände derselbe sind.
 *
 * Für die Art `counter` ist der Gegenstand der Bereich selbst: `relativ` und
 * `schluessel` sind leer, `tabellenPfad` ist die Wurzel.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{art: string, tabelle?: string, id?: string|number}} gegenstand
 * @returns {{ok: true, art: string, tabellenPfad: string, relativ: string, schluessel: string,
 *   kennung: string|null, nummer: number|null}|{ok: false, code: string, error: string}}
 */
function loeseGegenstand(bereichsWurzel, gegenstand) {
  if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') {
    return fehler(SPERR_CODES.wurzel, 'Keine Bereichs-Wurzel übergeben.');
  }
  const g = gegenstand && typeof gegenstand === 'object' ? gegenstand : {};
  if (MARKE_JE_ART[g.art] === undefined) {
    return fehler(SPERR_CODES.gegenstand, `Unbekannte Art der Sperre: ${String(g.art)}.`);
  }
  // 4T-001820 (B1): Der Zähler sperrt den Bereich als Ganzes. Tabelle und
  // Kennung werden **abgewiesen** statt übergangen: Wer hier eine Tabelle
  // mitgibt, meint etwas anderes als diese Sperre, und ein stillschweigend
  // verworfenes Feld wäre genau die Stelle, an der zwei verschiedene
  // Gegenstände denselben Dateinamen bekämen.
  if (g.art === ART_COUNTER) {
    if (g.tabelle !== undefined && g.tabelle !== null && g.tabelle !== '') {
      return fehler(SPERR_CODES.gegenstand, 'Die Zähler-Sperre trägt keine Tabelle.');
    }
    if (g.id !== undefined && g.id !== null && g.id !== '') {
      return fehler(SPERR_CODES.gegenstand, 'Die Zähler-Sperre trägt keine interne Kennung.');
    }
    return {
      ok: true,
      art: ART_COUNTER,
      tabellenPfad: path.resolve(bereichsWurzel),
      relativ: '',
      schluessel: '',
      kennung: null,
      nummer: null,
    };
  }
  if (g.art === ART_SWEEP) return loeseAufraeumGegenstand(bereichsWurzel, g);
  if (typeof g.tabelle !== 'string' || g.tabelle === '') {
    return fehler(SPERR_CODES.gegenstand, 'Kein Pfad der Tabellen-Datei übergeben.');
  }
  const absolut = path.resolve(bereichsWurzel, g.tabelle);
  // Vor jedem Dateizugriff: Ein Gegenstand, dessen Pfad aus dem Bereich
  // hinausführt, wird abgewiesen (harte Bereichsgrenzen).
  if (!isInsideArea(bereichsWurzel, absolut)) {
    return fehler(
      SPERR_CODES.ausserhalb,
      `Der Gegenstand liegt außerhalb des Bereichs: ${g.tabelle}`,
    );
  }
  const relativ = path.relative(bereichsWurzel, absolut).split(path.sep).join('/');
  if (relativ === '') {
    return fehler(SPERR_CODES.gegenstand, 'Die Bereichs-Wurzel selbst ist kein Gegenstand.');
  }
  let kennung = null;
  let nummer = null;
  if (g.art === ART_DATENSATZ) {
    // Beide Schreibweisen der Kennung ergeben denselben Namen: `r-42` und
    // `r-00042` bezeichnen denselben Datensatz, geschrieben wird immer die
    // aufgefüllte Form. Die nackte Nummer kommt hinzu, weil der Aufrufer sie
    // beim Anlegen ohnehin in der Hand hat.
    nummer = typeof g.id === 'number' ? g.id : nummerAus(g.id);
    kennung = kennungFuer(nummer);
    if (kennung === null) {
      return fehler(SPERR_CODES.gegenstand, `Keine gültige interne Kennung: ${String(g.id)}`);
    }
  }
  return {
    ok: true,
    art: g.art,
    tabellenPfad: absolut,
    relativ,
    schluessel: relativ.normalize('NFC').toLowerCase(),
    kennung,
    nummer,
  };
}

// 4T-001824 (Epic 3E-000254, B1): Die Aufräum-Sperre eines Protokolls. Wie der
// Zähler sperrt sie keine Datei, sondern einen Gegenstand des Bereichs; eine
// Tabelle wird deshalb abgewiesen und nicht übergangen. Ihre Kennung ist die
// Vorgangs-Kennung des Protokolls, als ganze Zahl oder als Text, weil der
// Wiederanlauf sie bei einem unlesbaren Protokoll allein aus dessen Dateinamen
// kennt. Ein Text mit Leerraum am Rand wird abgewiesen: `7` und ` 7` ergäben
// zwei Sperren für dasselbe Protokoll.
function loeseAufraeumGegenstand(bereichsWurzel, g) {
  if (g.tabelle !== undefined && g.tabelle !== null && g.tabelle !== '') {
    return fehler(SPERR_CODES.gegenstand, 'Die Aufräum-Sperre trägt keine Tabelle.');
  }
  let kennung = null;
  if (Number.isSafeInteger(g.id) && g.id >= 0) kennung = String(g.id);
  else if (typeof g.id === 'string' && g.id !== '' && g.id === g.id.trim()) kennung = g.id;
  if (kennung === null) {
    return fehler(
      SPERR_CODES.gegenstand,
      `Keine gültige Kennung eines Protokolls: ${String(g.id)}`,
    );
  }
  return {
    ok: true,
    art: ART_SWEEP,
    tabellenPfad: path.resolve(bereichsWurzel),
    relativ: '',
    schluessel: '',
    kennung,
    nummer: null,
  };
}

// Kodiert einen Pfad für den Dateinamen. Zusätzlich zu encodeURIComponent das
// Zeichen `*`, das jene Funktion stehen lässt und Windows verbietet.
function kodiere(text) {
  return encodeURIComponent(text).replace(/\*/g, '%2A');
}

// Die Zahl der Teile im Dateinamen je Art, für Namensbildung und Umkehrung aus
// **derselben** Zuordnung: Datensatz drei (Marke, Pfad, Kennung), Definition und
// Beleg-Datei zwei, der Zähler einen, weil er keinen Gegenstand in der
// Bereichs-Wurzel benennt, sondern die Wurzel selbst. Die Aufräum-Sperre zwei
// (Marke, Kennung des Protokolls; 4T-001824).
const TEILE_JE_ART = Object.freeze({
  [ART_DATENSATZ]: 3,
  [ART_DEFINITION]: 2,
  [ART_CHANGE_LOG]: 2,
  [ART_COUNTER]: 1,
  [ART_SWEEP]: 2,
});

/**
 * Der Dateiname einer Sperre: `r+<Pfad>+<Kennung>.lock` für einen Datensatz,
 * `d+<Pfad>.lock` für die Definition, `l+<Pfad>.lock` für die Beleg-Datei,
 * `c.lock` für den Vorgangs-Zähler des Bereichs und `s+<Vorgangs-Kennung>.lock`
 * für die Aufräum-Sperre eines Protokolls (4T-001824).
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{art: string, tabelle?: string, id?: string|number}} gegenstand
 * @returns {{ok: true, name: string, art: string, relativ: string, kennung: string|null,
 *   tabellenPfad: string}|{ok: false, code: string, error: string}}
 */
function sperrDateiName(bereichsWurzel, gegenstand) {
  const g = loeseGegenstand(bereichsWurzel, gegenstand);
  if (!g.ok) return g;
  const marke = MARKE_JE_ART[g.art];
  const teile = [marke];
  // 4T-001824 (B1): Die Aufräum-Sperre trägt an zweiter Stelle die Kennung ihres
  // Protokolls statt eines Pfades, kodiert wie ein Pfad.
  if (g.art === ART_SWEEP) teile.push(kodiere(g.kennung));
  else if (TEILE_JE_ART[g.art] >= 2) teile.push(kodiere(g.schluessel));
  if (g.art === ART_DATENSATZ) teile.push(g.kennung);
  const name = teile.join(TRENNER) + SPERR_ENDUNG;
  if (name.length > MAX_SPERR_DATEINAME) {
    return fehler(
      SPERR_CODES.nameZuLang,
      `Der Dateiname der Sperre überschreitet ${MAX_SPERR_DATEINAME} Zeichen (${name.length}).`,
    );
  }
  return {
    ok: true,
    name,
    art: g.art,
    relativ: g.relativ,
    kennung: g.kennung,
    tabellenPfad: g.tabellenPfad,
  };
}

/**
 * Die Umkehrung: aus dem Dateinamen zurück auf den Gegenstand.
 *
 * Der Pfad kommt in der normalisierten Schreibweise zurück, also
 * kleingeschrieben; die ursprüngliche steht im Inhalt der Datei.
 *
 * @param {unknown} name Dateiname im Sperr-Ordner.
 * @returns {{ok: true, gegenstand: {art: string, tabelle: string, id: string|null}}
 *   |{ok: false, code: string, error: string}}
 */
function gegenstandAusDateiName(name) {
  const unlesbar = (grund) => fehler(SPERR_CODES.nameUnlesbar, grund);
  if (typeof name !== 'string' || !name.endsWith(SPERR_ENDUNG)) {
    return unlesbar(`Kein Dateiname einer Sperre: ${String(name)}`);
  }
  const teile = name.slice(0, -SPERR_ENDUNG.length).split(TRENNER);
  const art = ART_JE_MARKE[teile[0]];
  if (art === undefined) {
    return unlesbar(`Unbekannte Marke im Dateinamen: ${name}`);
  }
  if (teile.length !== TEILE_JE_ART[art]) {
    return unlesbar(`Unerwarteter Aufbau des Dateinamens: ${name}`);
  }
  // 4T-001820 (B1): Der Zähler nennt keinen Gegenstand unterhalb der Wurzel; der
  // Name besteht allein aus seiner Marke.
  if (art === ART_COUNTER) {
    return { ok: true, gegenstand: { art: ART_COUNTER, tabelle: null, id: null } };
  }
  let tabelle;
  try {
    tabelle = decodeURIComponent(teile[1]);
  } catch {
    return unlesbar(`Die Kodierung des Pfades ist unlesbar: ${name}`);
  }
  if (tabelle === '') return unlesbar(`Der Dateiname nennt keinen Gegenstand: ${name}`);
  // 4T-001824 (B1): Der zweite Teil der Aufräum-Sperre ist die Kennung ihres
  // Protokolls und keine Tabelle.
  if (art === ART_SWEEP) return { ok: true, gegenstand: { art, tabelle: null, id: tabelle } };
  if (art !== ART_DATENSATZ) {
    return { ok: true, gegenstand: { art, tabelle, id: null } };
  }
  const kennung = kennungFuer(nummerAus(teile[2]));
  if (kennung === null) return unlesbar(`Keine gültige interne Kennung im Dateinamen: ${name}`);
  return { ok: true, gegenstand: { art: ART_DATENSATZ, tabelle, id: kennung } };
}

// --- Inhalt ---------------------------------------------------------------------------

// Der Inhalt einer Sperr-Datei. Der Gegenstand steht in **ursprünglicher**
// Schreibweise, damit die Auskunft über eine Sperre den Pfad so nennt, wie der
// Anwender ihn kennt; der Dateiname trägt die normalisierte Form.
//
// Zusatz-Felder eines Aufrufers werden übernommen, überschreiben die Kern-Felder
// aber nie: Was die Sperre über sich selbst aussagt, gehört diesem Modul.
function baueInhalt(benannt, zeitpunkt, herkunft, zusatz) {
  const inhalt = {
    schemaVersion: SPERR_SCHEMA_VERSION,
    art: benannt.art,
  };
  // 4T-001820 (B1): Der Zähler benennt keine Tabelle. Eine leere Angabe wäre
  // eine Aussage über einen Gegenstand, den es nicht gibt; sie entfällt.
  if (benannt.relativ !== '') inhalt.tabelle = benannt.relativ;
  if (benannt.kennung !== null) inhalt.id = benannt.kennung;
  Object.assign(inhalt, herkunftsFelder(herkunft));
  inhalt.zeitpunkt = zeitpunkt;
  if (zusatz && typeof zusatz === 'object' && !Array.isArray(zusatz)) {
    for (const [feld, wert] of Object.entries(zusatz)) {
      if (!(feld in inhalt)) inhalt[feld] = wert;
    }
  }
  return inhalt;
}

// Liest eine Sperr-Datei. **Ein leerer, unbrauchbarer oder nicht lesbarer Inhalt
// heißt «belegt, Halter unbekannt» und nie «frei»** (E9, P5): Zwischen dem
// Anlegen und dem Schreiben des Inhalts kann ein anderer Rechner die Datei
// bereits sehen, und eine beschädigte Sperre darf niemandem den Zugriff öffnen.
// Allein das nachweisliche Fehlen der Datei heißt «frei».
async function lies(fsp, pfad) {
  let roh;
  try {
    roh = await fsp.readFile(pfad, 'utf8');
  } catch (err) {
    // Der rohe Inhalt bleibt `null`, wo er nicht gelesen werden konnte: Das
    // Ablösen darf eine Sperre nur zurückstellen, deren Bytes es kennt.
    if (err && err.code === 'ENOENT') return gelesen(false, null, null);
    return gelesen(true, null, null);
  }
  if (typeof roh !== 'string') return gelesen(true, null, null);
  if (roh.trim() === '') return gelesen(true, null, roh);
  try {
    const wert = JSON.parse(roh);
    const brauchbar = wert && typeof wert === 'object' && !Array.isArray(wert);
    return gelesen(true, brauchbar ? wert : null, roh);
  } catch {
    return gelesen(true, null, roh);
  }
}

function gelesen(vorhanden, halter, roh) {
  return { vorhanden, halter, roh, stand: standVon(roh) };
}

// 4T-001788 (L7): Die Änderungszeit der Sperr-Datei, der Rückfall der
// Frist-Rechnung. Der Lebenszyklus greift dafür **nicht** selbst auf den
// Sperr-Ordner zu; ein zweiter Zugriffs-Weg neben dem Speicher wäre genau die
// Stelle, an der zwei Auslegungen des Ordnernamens auseinanderliefen.
//
// Erfragt wird sie nur, wenn der Inhalt keinen **auslegbaren** Zeitpunkt trägt:
// Sonst kostete jede Sperr-Lesung einen zweiten Weg über das Netz für eine
// Angabe, die niemand ansieht. Gemessen wird die Auslegbarkeit und nicht bloß
// das Dasein des Feldes, denn ein unlesbarer Zeitpunkt ist für die Frist
// dasselbe wie ein fehlender.
async function aenderungsZeit(fsp, pfad, halter) {
  if (halter && Number.isFinite(Date.parse(String(halter.zeitpunkt)))) return null;
  try {
    return (await fsp.stat(pfad)).mtimeMs;
  } catch {
    // Keine Änderungszeit heißt «Alter unbekannt», und ein unbekanntes Alter
    // gilt als nicht abgelaufen. Ein Fehlschlag hier darf die Auskunft über die
    // Sperre nicht scheitern lassen.
    return null;
  }
}

// Ort einer Sperre: Name zuerst, Ordner danach. Die Reihenfolge ist die Zusage,
// dass ein Gegenstand außerhalb des Bereichs abgewiesen wird, **bevor** auch nur
// die Bereichs-Konfiguration gelesen wird.
async function ortFuer(bereichsWurzel, gegenstand, deps) {
  const naht = pruefeKonfigNaht(deps);
  if (!naht.ok) return naht;
  const benannt = sperrDateiName(bereichsWurzel, gegenstand);
  if (!benannt.ok) return benannt;
  const ordner = await sperrOrdnerPfad(bereichsWurzel, deps);
  return { ok: true, ordner, pfad: path.join(ordner, benannt.name), benannt };
}

// --- Die vier Zugriffe ----------------------------------------------------------------

/**
 * Legt eine Sperre an. **Das Anlegen ist die Prüfung**: Es läuft über das
 * exklusive Primitiv des Dateisystems in einem einzigen Schreibaufruf samt
 * Inhalt. Ein vorheriges Nachsehen gibt es nicht; es wäre genau der Wettlauf,
 * gegen den die Sperre antritt.
 *
 * «Schon vorhanden» ist kein Fehler, sondern das Ergebnis «belegt», zusammen mit
 * dem gelesenen Inhalt der bestehenden Sperre.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
 * @param {object} [zusatz] Optionale Zusatz-Felder für den Inhalt.
 * @param {object} deps Nähte; `leseKonfig` ist Pflicht.
 * @returns {Promise<object>} `{ok: true, gehalten, belegt, …}` bzw. `{ok: false, code, error}`.
 */
async function legeSperreAn(bereichsWurzel, gegenstand, zusatz, deps) {
  const ort = await ortFuer(bereichsWurzel, gegenstand, deps);
  if (!ort.ok) return ort;
  const { fsp, jetzt, herkunft } = nahtstellen(deps);
  const inhalt = baueInhalt(ort.benannt, jetzt(), herkunft(), zusatz);
  const text = `${JSON.stringify(inhalt, null, 2)}\n`;

  const schreibe = () => schreibeExklusiv(fsp, ort.pfad, text);
  try {
    await schreibe();
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // Der Ordner entsteht bei der ersten Sperre — und erst dann, damit ein
      // bloßes Nachsehen keinen Ordner in der Wurzel des Anwenders hinterlässt.
      try {
        await fsp.mkdir(ort.ordner, { recursive: true });
        await schreibe();
      } catch (zweiter) {
        return erledigeAnlegeFehler(zweiter, fsp, ort);
      }
      return angelegt(ort, inhalt, text);
    }
    return erledigeAnlegeFehler(err, fsp, ort);
  }
  return angelegt(ort, inhalt, text);
}

function angelegt(ort, inhalt, text) {
  return {
    ok: true,
    gehalten: true,
    belegt: false,
    ordner: ort.ordner,
    pfad: ort.pfad,
    inhalt,
    stand: standVon(text),
  };
}

async function erledigeAnlegeFehler(err, fsp, ort) {
  if (!err || err.code !== 'EEXIST') return fehler(SPERR_CODES.anlegen, alsText(err));
  const gelesen = await lies(fsp, ort.pfad);
  return {
    ok: true,
    gehalten: false,
    belegt: true,
    ordner: ort.ordner,
    pfad: ort.pfad,
    halter: gelesen.halter,
    halterUnbekannt: gelesen.halter === null,
    stand: gelesen.stand,
    geaendertMs: await aenderungsZeit(fsp, ort.pfad, gelesen.halter),
  };
}

/**
 * Liest die Sperre eines Gegenstands.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
 * @param {object} deps Nähte; `leseKonfig` ist Pflicht.
 * @returns {Promise<object>} `{ok: true, vorhanden, halter, halterUnbekannt, …}`.
 */
async function leseSperre(bereichsWurzel, gegenstand, deps) {
  const ort = await ortFuer(bereichsWurzel, gegenstand, deps);
  if (!ort.ok) return ort;
  const { fsp } = nahtstellen(deps);
  const gelesen = await lies(fsp, ort.pfad);
  return {
    ok: true,
    ordner: ort.ordner,
    pfad: ort.pfad,
    vorhanden: gelesen.vorhanden,
    halter: gelesen.halter,
    halterUnbekannt: gelesen.vorhanden && gelesen.halter === null,
    stand: gelesen.stand,
    geaendertMs: gelesen.vorhanden ? await aenderungsZeit(fsp, ort.pfad, gelesen.halter) : null,
  };
}

/**
 * Listet alle Sperren des Bereichs samt ihrem Gegenstand.
 *
 * **Fremde Dateien im Ordner werden übergangen und nicht angefasst**: Der Ordner
 * gehört der Anwendung, aber er liegt im Bestand des Anwenders, und was sie
 * nicht geschrieben hat, löscht sie auch nicht.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {object} deps Nähte; `leseKonfig` ist Pflicht.
 * @returns {Promise<object>} `{ok: true, ordner, sperren: []}` bzw. `{ok: false, code, error}`.
 */
async function listeSperren(bereichsWurzel, deps) {
  const naht = pruefeKonfigNaht(deps);
  if (!naht.ok) return naht;
  if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') {
    return fehler(SPERR_CODES.wurzel, 'Keine Bereichs-Wurzel übergeben.');
  }
  const { fsp } = nahtstellen(deps);
  const ordner = await sperrOrdnerPfad(bereichsWurzel, deps);
  let eintraege;
  try {
    eintraege = await fsp.readdir(ordner, { withFileTypes: true });
  } catch (err) {
    // Vor der ersten Sperre gibt es den Ordner nicht; das ist kein Fehler.
    if (err && err.code === 'ENOENT') return { ok: true, ordner, sperren: [] };
    return fehler(SPERR_CODES.auflisten, alsText(err));
  }
  const sperren = [];
  for (const eintrag of eintraege) {
    if (!eintrag.isFile()) continue;
    const gedeutet = gegenstandAusDateiName(eintrag.name);
    if (!gedeutet.ok) continue; // fremde Datei: übergehen, nicht anfassen
    const pfad = path.join(ordner, eintrag.name);
    const gelesen = await lies(fsp, pfad);
    if (!gelesen.vorhanden) continue; // zwischenzeitlich freigegeben
    sperren.push({
      name: eintrag.name,
      pfad,
      gegenstand: gedeutet.gegenstand,
      halter: gelesen.halter,
      halterUnbekannt: gelesen.halter === null,
      stand: gelesen.stand,
      // 4T-001795 (Epic 3E-000255, N2): Die Änderungszeit gehört auch hierher.
      // Die Einordnung «lebend» läuft über dieselbe Frist-Rechnung wie ein
      // Nehm-Versuch, und die fällt ohne auslegbaren Zeitpunkt im Inhalt auf die
      // Änderungszeit zurück. Ohne sie wäre eine Sperre mit unbrauchbarem
      // Inhalt hier ewig lebend und hielte jede Umbenennung auf. Erfragt wird
      // sie auf demselben Weg wie beim Lesen einer einzelnen Sperre, also nur,
      // wo der Inhalt keinen auslegbaren Zeitpunkt trägt.
      geaendertMs: await aenderungsZeit(fsp, pfad, gelesen.halter),
    });
  }
  return { ok: true, ordner, sperren };
}

/**
 * Entfernt eine Sperre — allein über ihren eigenen Pfad im Sperr-Ordner.
 *
 * «Nicht vorhanden» ist kein Fehler: Wer freigibt, will danach keine Sperre
 * vorfinden, und ob sie vorher da war, ändert daran nichts.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
 * @param {object} deps Nähte; `leseKonfig` ist Pflicht.
 * @returns {Promise<object>} `{ok: true, pfad, entfernt}` bzw. `{ok: false, code, error}`.
 */
async function entferneSperre(bereichsWurzel, gegenstand, deps) {
  const ort = await ortFuer(bereichsWurzel, gegenstand, deps);
  if (!ort.ok) return ort;
  const { fsp } = nahtstellen(deps);
  try {
    await fsp.unlink(ort.pfad);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { ok: true, ordner: ort.ordner, pfad: ort.pfad, entfernt: false };
    }
    return fehler(SPERR_CODES.entfernen, alsText(err));
  }
  return { ok: true, ordner: ort.ordner, pfad: ort.pfad, entfernt: true };
}

module.exports = {
  SPERR_CODES,
  SPERR_SCHEMA_VERSION,
  MAX_SPERR_DATEINAME,
  ART_DATENSATZ,
  ART_DEFINITION,
  ART_CHANGE_LOG,
  ART_COUNTER,
  ART_SWEEP,
  sperrOrdnerName,
  sperrOrdnerPfad,
  zufallsMarke,
  loeseGegenstand,
  sperrDateiName,
  gegenstandAusDateiName,
  standVon,
  legeSperreAn,
  leseSperre,
  listeSperren,
  entferneSperre,
  // 4T-001788 (L6a): Die Helfer, die das Ablösen in `lock-replace.js` benutzt.
  // Sie sind **nicht** für beliebige Aufrufer gedacht, sondern die Naht des
  // herausgeschnittenen fünften Zugriffs: Er soll den Ort, das exklusive
  // Schreiben, das Lesen und die Änderungszeit aus DIESEM Modul nehmen, statt
  // sie ein zweites Mal auszulegen.
  alsText,
  fehler,
  nahtstellen,
  ortFuer,
  schreibeExklusiv,
  lies,
  aenderungsZeit,
};
