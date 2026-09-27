// 4T-001790 (Epic 3E-000255, E10.6, E10.7): Der Schreibweg der Änderungsbelege.
// Pfad der Beleg-Datei, Anfügen eines Belegs, Lesen der Datei und die Belege
// eines Datensatzes samt Verkettungs-Auskunft.
//
// **Warum die Trennung vom Format** (Bauplan F7, im Maßstab von E4): Das Format
// eines Belegs ist prozess-neutral und liegt in
// `src/shared/database/change-record.js`, wie die übrigen Format-Module der
// Datenbank. Hier liegt allein, was den Bestand kennt: der Ort der Datei und der
// Zugriff auf sie.
//
// **Angefügt wird in genau einem Schreibaufruf** im Anfüge-Modus des
// Dateisystems (E10.7, AK5). Die Datei wird dabei **nicht** gelesen, nicht mit
// `stat` befragt und nicht geöffnet-und-gesucht: Der Anfüge-Text trägt seine führende
// Leerzeile gerade deshalb, damit der neue Marker ohne jeden Blick in die Datei
// in Spalte 0 steht. Der erste Beleg legt die Datei an. Die Gleichzeitigkeit
// zweier Schreiber regelt die Sperr-Ordnung aus E10.5 und nicht dieses Modul.
//
// **Herkunft und Zeitpunkt kommen über Nähte herein.** Die Herkunft ermittelt
// `src/main/herkunft.js` und formt `mdd-herkunft.js`; eine zweite Ermittlung
// entsteht hier nicht (AK10). Der Zeitpunkt kommt über eine einspritzbare Uhr,
// damit die Prüffälle keinen echten Zeitpunkt vergleichen müssen.
//
// **Die Verdichtung ist ein eigener Einstieg** (4T-001791, Bauplan V5):
// `schreibeBeleg` bleibt ein reines Anfügen und wird nicht erweitert, sein
// Nachweis bleibt damit gültig. `verdichteBeiBedarf` ist der einzige Vorgang,
// der die Beleg-Datei **umschreibt** statt anzufügen, und läuft deshalb über
// den gemeinsamen atomaren Schreibweg und ausschließlich unter der Sperre der
// Beleg-Datei. Er wird beim Schreiben gerufen und braucht keinen Takt; die
// Timer-Linie ist mit E9.4 ausgeschlossen.
//
// **Nicht hier:** ein IPC-Kanal, eine Oberfläche und die Anlässe, die einen
// Beleg auslösen. Die lesende Beleg-Ansicht aus E10.14 ist ein eigener Vorgang;
// dieses Modul hat in diesem Task außer seinen Prüffällen keinen Aufrufer, und
// das ist gewollt.
'use strict';

// 4T-001964: Vorgabe ist der frisch lesende Dateizugriff; unter einer Sperre
// liefert der Netzwerk-Client sonst den Stand vor dem Ersetzen durch einen
// anderen Rechner (Begründung in frisch-lesen.js).
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');

const { MDDL_EXT, companionPathFor } = require('../../shared/markdown-data-family.js');
const {
  anfuegeText,
  baueBeleg,
  belegeZuDatensatz,
  leseBelege,
  pruefeVerkettung,
  zeitpunktAus,
} = require('../../shared/database/change-record.js');
// 4T-001791 (Epic 3E-000255, E10.9 bis E10.11): Auswahl, Spannen und die neue
// Datei-Fassung liegen prozess-neutral daneben; hier steht allein der
// Datei-Zugriff.
const {
  istUeberGroesse,
  loeseGrenzen,
  verdichte,
} = require('../../shared/database/change-compaction.js');
const { ersetzeDatei } = require('../documents/atomic-write.js');
const { herkunftsFelder } = require('../documents/mdd-herkunft.js');
const { ermittleHerkunft } = require('../herkunft.js');

// Codes der Fehlschläge. Sie tragen den Namen ihrer Lage, damit ein Aufrufer
// den unbrauchbaren Beleg vom nicht beschreibbaren Ort unterscheiden kann,
// ohne den Text zu lesen.
const LOG_CODES = Object.freeze({
  pfad: 'belegPfadFehlt',
  ungueltig: 'belegUngueltig',
  anfuegen: 'belegAnfuegenFehlgeschlagen',
  lesen: 'belegLesenFehlgeschlagen',
  // 4T-001791: Die Verdichtung verlangt die Sperre als Naht und verweigert
  // ohne sie (AK8). Eigener Code, weil die Lage keine Störung des Dateisystems
  // ist, sondern ein Aufruf, der so nicht stattfinden darf.
  ohneSperre: 'verdichtungOhneSperre',
  sperre: 'verdichtungSperreFehlgeschlagen',
  ersetzen: 'verdichtungErsetzenFehlgeschlagen',
});

// Gründe, aus denen eine Verdichtung folgenlos bleibt. Jeder ist ein
// Normalfall und kein Fehlschlag; genannt werden sie, damit ein Aufrufer die
// unterschrittene Schwelle von der abgelehnten Ersetzung unterscheiden kann.
const VERDICHTUNG_GRUENDE = Object.freeze({
  keineDatei: 'keineBelegDatei',
  unterGroesse: 'unterGroessenSchwelle',
  gedrosselt: 'gedrosselt',
  nichtsZuTun: 'keinDatensatzUeberSchwelle',
  konflikt: 'fremdeAenderung',
  // 4T-001788 (Epic 3E-000255, Bauplan L10): Die Sperre der Beleg-Datei war
  // nicht zu bekommen. Das ist kein Fehlschlag, sondern der Normalfall «jemand
  // anders arbeitet gerade an dieser Tabelle»; die Verdichtung unterbleibt
  // folgenlos bis zum nächsten Anlass.
  gesperrt: 'gesperrt',
});

// 4T-001791 (Bauplan V5): Die Größe der letzten ERGEBNISLOSEN Prüfung je Datei.
// Liegt die Datei über ihrer Größen-Schwelle, ohne dass ein Datensatz über der
// Zahl-Schwelle liegt, kostete jede weitere Prüfung erneut das Lesen der ganzen
// Datei. Erst ein Zuwachs von 64 KB löst die nächste aus. Das ist
// Arbeitsspeicher-Zustand ohne Takt und ohne Ablage; nach einem Neustart wird
// einmal geprüft.
const DROSSEL_ZUWACHS = 64 * 1024;
const zuletztErgebnislos = new Map();

// Nur für Prüffälle: Der Drossel-Speicher ist Modul-Zustand und muss zwischen
// zwei Fällen zurücksetzbar sein (Muster von atomic-write.js).
function _drosselLeeren() {
  zuletztErgebnislos.clear();
}

/**
 * Pfad der Beleg-Datei zu einer Tabellen-Datei: gleicher Ordner, gleicher
 * Basisname, Endung der Markdown-Data-Familie (E10.6, E10.7).
 *
 * @param {string} tabellenPfad
 * @returns {string}
 */
function belegPfadFuer(tabellenPfad) {
  return companionPathFor(tabellenPfad, MDDL_EXT);
}

function nahtstellen(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  return {
    fsp: d.fsp || frischerDateizugriff,
    jetzt: typeof d.jetzt === 'function' ? d.jetzt : () => zeitpunktAus(new Date()),
    herkunft: typeof d.herkunft === 'function' ? d.herkunft : ermittleHerkunft,
  };
}

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

/**
 * Fügt einen Beleg an die Beleg-Datei einer Tabelle an.
 *
 * Kein stiller Fehlschlag: Ein unbrauchbarer Beleg und ein nicht beschreibbarer
 * Ort werden beide gemeldet, je mit eigenem Code.
 *
 * @param {string} tabellenPfad Pfad der Tabellen-Datei.
 * @param {object} angaben Art, interne Kennung, Vorgangs-Kennung und berührte
 *   Felder, in der Gestalt von `baueBeleg`; Zeitpunkt und Herkunft entstehen
 *   hier.
 * @param {{fsp?: object, jetzt?: () => string, herkunft?: () => object}} [deps]
 * @returns {Promise<{ok: true, pfad: string, beleg: object, text: string}|{ok: false, code: string, error: string}>}
 */
async function schreibeBeleg(tabellenPfad, angaben, deps) {
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '')
    return { ok: false, code: LOG_CODES.pfad, error: 'Kein Pfad der Tabellen-Datei übergeben.' };
  const { fsp, jetzt, herkunft } = nahtstellen(deps);
  const pfad = belegPfadFuer(tabellenPfad);

  let beleg;
  let text;
  try {
    beleg = baueBeleg({
      ...(angaben && typeof angaben === 'object' ? angaben : {}),
      zeitpunkt: jetzt(),
      herkunft: herkunftsFelder(herkunft()),
    });
    text = anfuegeText(beleg);
  } catch (err) {
    return { ok: false, code: LOG_CODES.ungueltig, error: alsText(err) };
  }

  try {
    // Ein einziger Aufruf im Anfüge-Modus. Kein Lesen, kein stat, kein Öffnen
    // und Suchen davor: Genau das ist die Zusage aus E10.7, an der die
    // Beleg-Datei ihre Unversehrtheit hat.
    await fsp.appendFile(pfad, text, 'utf8');
  } catch (err) {
    return { ok: false, code: LOG_CODES.anfuegen, error: alsText(err) };
  }
  return { ok: true, pfad, beleg, text };
}

/**
 * Liest die Beleg-Datei einer Tabelle.
 *
 * Eine fehlende Datei heißt «keine Belege» und ist kein Fehler: Vor dem ersten
 * Beleg gibt es sie nicht.
 *
 * @param {string} tabellenPfad
 * @param {{fsp?: object}} [deps]
 * @returns {Promise<{ok: true, pfad: string, belege: object[], befunde: object[]}|{ok: false, code: string, error: string}>}
 */
async function leseBelegDatei(tabellenPfad, deps) {
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '')
    return { ok: false, code: LOG_CODES.pfad, error: 'Kein Pfad der Tabellen-Datei übergeben.' };
  const { fsp } = nahtstellen(deps);
  const pfad = belegPfadFuer(tabellenPfad);

  let inhalt;
  try {
    inhalt = await fsp.readFile(pfad, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, pfad, belege: [], befunde: [] };
    return { ok: false, code: LOG_CODES.lesen, error: alsText(err) };
  }
  const { belege, befunde } = leseBelege(inhalt);
  return { ok: true, pfad, belege, befunde };
}

/**
 * Die Belege eines Datensatzes in Datei-Reihenfolge, samt der Auskunft über ihre
 * lückenlose Verkettung (AK7).
 *
 * @param {string} tabellenPfad
 * @param {string} kennung Interne Kennung des Datensatzes.
 * @param {{fsp?: object}} [deps]
 * @returns {Promise<object>}
 */
async function belegeDesDatensatzes(tabellenPfad, kennung, deps) {
  const gelesen = await leseBelegDatei(tabellenPfad, deps);
  if (!gelesen.ok) return gelesen;
  const belege = belegeZuDatensatz(gelesen.belege, kennung);
  return {
    ok: true,
    pfad: gelesen.pfad,
    belege,
    befunde: gelesen.befunde,
    verkettung: pruefeVerkettung(belege),
  };
}

/**
 * Verdichtet die Beleg-Datei einer Tabelle, wenn die Doppelschwelle es verlangt.
 *
 * **Die Sperre ist eine Pflicht-Naht und wird nicht selbst genommen** (Bauplan
 * V1): Welche Sperren ein Schreibzug braucht und dass er sie alle vor dem
 * ersten Schreiben nimmt (E11.4), weiß die Schreib-Schnittstelle. Fehlt die
 * Naht, wird verweigert, und zwar bevor irgendetwas gelesen wird; damit ist ein
 * Umschreiben ohne Sperre nicht möglich (AK8).
 *
 * **Gemessen wird zuerst allein die Größe** (Bauplan V5): Unter der Schwelle
 * wird die Datei nicht gelesen. Erst darüber wird gelesen, die neue Fassung
 * gebildet und über den atomaren Schreibweg ersetzt, mit Konflikt-Prüfung gegen
 * den gelesenen Stand. Hat sich die Datei zwischen Lesen und Ersetzen geändert,
 * wird **nicht** ersetzt, und die Verdichtung unterbleibt folgenlos bis zum
 * nächsten Anlass (AK13).
 *
 * @param {string} tabellenPfad Pfad der Tabellen-Datei.
 * @param {{grenzen?: object}} [optionen] Die wirksamen Grenzen aus der
 *   Definition. Der Aufrufer liest sie; dieses Modul liest die Tabellen-Datei
 *   nicht.
 * @param {{mitSperre: (gegenstand: string, arbeit: () => Promise<any>) => Promise<any>,
 *   fsp?: object, ersetzen?: Function}} deps `mitSperre` ist Pflicht.
 * @returns {Promise<{ok: true, pfad: string, verdichtet: boolean, grund?: string,
 *   auskunft?: object}|{ok: false, code: string, error: string}>}
 */
async function verdichteBeiBedarf(tabellenPfad, optionen, deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  // Fail-closed und VOR jedem Zugriff: Ohne Naht wird weder gelesen noch
  // geschrieben, nicht einmal die Größe erfragt.
  if (typeof d.mitSperre !== 'function')
    return {
      ok: false,
      code: LOG_CODES.ohneSperre,
      error: 'Die Verdichtung verlangt die Sperre der Beleg-Datei als Naht mitSperre.',
    };
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '')
    return { ok: false, code: LOG_CODES.pfad, error: 'Kein Pfad der Tabellen-Datei übergeben.' };

  const { fsp } = nahtstellen(d);
  const ersetzen = typeof d.ersetzen === 'function' ? d.ersetzen : ersetzeDatei;
  const grenzen = loeseGrenzen(optionen && typeof optionen === 'object' ? optionen.grenzen : null);
  const pfad = belegPfadFuer(tabellenPfad);

  let groesse;
  try {
    groesse = (await fsp.stat(pfad)).size;
  } catch (err) {
    // Vor dem ersten Beleg gibt es die Datei nicht; das ist kein Fehler.
    if (err && err.code === 'ENOENT')
      return { ok: true, pfad, verdichtet: false, grund: VERDICHTUNG_GRUENDE.keineDatei };
    return { ok: false, code: LOG_CODES.lesen, error: alsText(err) };
  }
  if (!istUeberGroesse(groesse, grenzen))
    return { ok: true, pfad, verdichtet: false, grund: VERDICHTUNG_GRUENDE.unterGroesse };
  const letzte = zuletztErgebnislos.get(pfad);
  if (letzte !== undefined && groesse < letzte + DROSSEL_ZUWACHS)
    return { ok: true, pfad, verdichtet: false, grund: VERDICHTUNG_GRUENDE.gedrosselt };

  const arbeit = async () => {
    let inhalt;
    try {
      inhalt = await fsp.readFile(pfad, 'utf8');
    } catch (err) {
      return { ok: false, code: LOG_CODES.lesen, error: alsText(err) };
    }

    const { veraendert, text, auskunft } = verdichte(inhalt, grenzen);
    if (!veraendert) {
      zuletztErgebnislos.set(pfad, groesse);
      return { ok: true, pfad, verdichtet: false, grund: VERDICHTUNG_GRUENDE.nichtsZuTun };
    }

    // Ganz oder gar nicht: Schattenkopie im selben Verzeichnis und
    // anschließendes Umbenennen (E11.3 Stufe 1). Ein Abbruch hinterlässt die
    // Datei unverändert, nie einen Zwischenstand.
    const ergebnis = await ersetzen(pfad, text, { expected: inhalt });
    if (ergebnis && ergebnis.ok === true) {
      zuletztErgebnislos.delete(pfad);
      return { ok: true, pfad, verdichtet: true, auskunft };
    }
    if (ergebnis && ergebnis.reason === 'conflict')
      return { ok: true, pfad, verdichtet: false, grund: VERDICHTUNG_GRUENDE.konflikt };
    return {
      ok: false,
      code: LOG_CODES.ersetzen,
      error: ergebnis && ergebnis.error ? ergebnis.error : 'Das Ersetzen der Datei schlug fehl.',
    };
  };

  try {
    const ergebnis = await d.mitSperre(pfad, arbeit);
    // 4T-001788 (Bauplan L10): Der Vertrag der Naht kennt einen zweiten
    // Ausgang. Wird die Sperre nicht erlangt, führt sie die Arbeit gar nicht
    // erst aus und meldet den Konflikt; die Verdichtung bleibt dann folgenlos
    // und **setzt die Drossel nicht** — gemessen hat sie nichts, und ein
    // Drossel-Eintrag verschöbe die nächste echte Prüfung ohne Grund um 64 KB.
    //
    // **Eine abgelaufene fremde Sperre wird hier nicht selbsttätig gebrochen**,
    // auch wenn an dieser Stelle kein Mensch arbeitet: Die Regel «nie
    // selbsttätig» bleibt ohne Ausnahme. Das Ergebnis nennt `abgelaufen`, damit
    // die Schreib-Schnittstelle es sichtbar machen kann.
    if (ergebnis && ergebnis.nichtGenommen === true) {
      const konflikt = ergebnis.konflikt;
      return {
        ok: true,
        pfad,
        verdichtet: false,
        grund: VERDICHTUNG_GRUENDE.gesperrt,
        abgelaufen: konflikt ? konflikt.abgelaufen === true : false,
      };
    }
    return ergebnis;
  } catch (err) {
    return { ok: false, code: LOG_CODES.sperre, error: alsText(err) };
  }
}

module.exports = {
  LOG_CODES,
  VERDICHTUNG_GRUENDE,
  DROSSEL_ZUWACHS,
  belegPfadFuer,
  schreibeBeleg,
  leseBelegDatei,
  belegeDesDatensatzes,
  verdichteBeiBedarf,
  _drosselLeeren,
};
