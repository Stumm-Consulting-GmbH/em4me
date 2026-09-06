// 4T-001434 (Story 4S-000868, Epic 3E-000248): Der eine Schreibweg, der ganz
// oder gar nicht wirkt.
//
// Die Anwendung schrieb bis hierher an keiner Stelle absturzsicher: 44 Aufrufe
// von writeFile in 22 Dateien unter src/main/, alle unmittelbar in die
// Zieldatei. Bricht der Vorgang mitten im Schreiben ab, steht dort ein halber
// Inhalt. Solange eine Datei ein Dokument ist, ist der Schaden ein beschaedigtes
// Dokument; sobald sie einen Datenbestand traegt, ist es dessen Verlust.
//
// Der Weg ist eine Schattenkopie im SELBEN Verzeichnis und das anschliessende
// Umbenennen. Dasselbe Verzeichnis ist keine Stil-Frage: Ueber Datentraeger-
// Grenzen hinweg waere das Umbenennen ein Kopiervorgang und damit kein Vorgang
// in einem Zug mehr.
//
// ZWEI GEMESSENE GRUNDLAGEN (Spike 4T-001433 und Vormessung dieses Tasks,
// beide am 2026-09-05 auf lokaler Platte, SMB-Freigabe und Synchronisations-
// Ordner):
//
// 1. Das Umbenennen WIRKT in einem Zug. In 224.577 Leseversuchen unter
//    laufender Ersetzung sah kein Leser je einen halben, gemischten oder
//    fehlenden Inhalt. Darauf ruht die Zusicherung.
//
// 2. Das Umbenennen GELINGT aber nicht verlaesslich beim ersten Versuch. Es
//    scheitert mit EPERM, auf der Netz-Freigabe im unguenstigsten Lauf in 39
//    Prozent der Faelle und dort AUCH OHNE gleichzeitigen Leser; die Rate
//    schwankt stark (78 und 17 Fehlschlaege auf 200 in zwei aufeinander
//    folgenden Laeufen). Eine Wiederholung behebt das zuverlaessig. Deshalb
//    die Schleife unten — ohne sie schluege das Speichern auf einer Freigabe
//    regelmaessig fehl.
//
// Der Datei-Beobachter ueberlebt das Ersetzen: Auf allen drei Ablage-Orten,
// nativ wie im Abfrage-Betrieb, meldet er weiterhin 'change' und nie 'unlink'
// (Vormessung dieses Tasks). Ein 'unlink' haette dem Anwender bei jedem
// Speichern eine geloeschte Datei gemeldet.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const saveGuard = require('./save-guard');

// Wachsende Abstaende ueber rund drei Sekunden. Die Messung brauchte auf der
// Freigabe hoechstens sechs Versuche à 10 ms; im Synchronisations-Ordner
// genuegten 200 ms in einem Lauf fuer elf von 60 Ersetzungen NICHT, waehrend
// ein Fenster von mehreren Sekunden durchgehend trug. Drei Sekunden liegen
// mit Abstand ueber dem Gemessenen und unter jeder Schwelle, an der ein
// Anwender das Speichern als haengend empfaende.
const WIEDERHOL_ABSTAENDE_MS = [10, 20, 40, 80, 160, 320, 640, 1000, 1000];

// Wiederholt wird nur, wo ein fremder Zugriff die Ursache ist und Warten hilft.
// Bei ENOENT, ENOSPC und EROFS aendert Warten nichts; dort wuerde die Schleife
// den Fehler nur um das volle Fenster verschleppen.
const WIEDERHOLBAR = new Set(['EPERM', 'EBUSY', 'EACCES']);

// Marke im Namen der Schattenkopie. Der Aufraeum-Task (4T-001436) erkennt
// eigene Schattenkopien allein hieran; er darf nie eine fremde Datei anfassen.
const SCHATTEN_MARKE = 'em4me-neu';

// `.<Zielname>.em4me-neu-<PID>-<Zaehler>`
//
// Der fuehrende Punkt haelt die Schattenkopie aus Index und abgeleiteten
// Sichten: src/main/index/scan.js ueberspringt jeden Namen, der mit einem Punkt
// beginnt. Ohne ihn braeuchte es dort einen zweiten Filter.
//
// Prozess-Kennung und Zaehler halten gleichzeitige Schreibvorgaenge
// auseinander — auch zwei Fenster derselben Anwendung, die dieselbe Datei
// schreiben, und zwei Anwendungen auf einer geteilten Ablage.
const SCHATTEN_MUSTER = /^\..+\.em4me-neu-\d+-\d+$/;

let zaehler = 0;

// 4T-001436: Schattenkopien, die GERADE geschrieben werden. Das Aufraeumen
// darf keine davon anfassen, sonst zerstoerte es einen laufenden
// Schreibvorgang — auch einen zweiten im selben Verzeichnis.
const laufende = new Set();

function schattenPfad(zielPfad) {
  zaehler += 1;
  const verzeichnis = path.dirname(zielPfad);
  const name = path.basename(zielPfad);
  return path.join(verzeichnis, `.${name}.${SCHATTEN_MARKE}-${process.pid}-${zaehler}`);
}

/**
 * Ist dieser Datei-Name eine eigene Schattenkopie?
 *
 * Fuer den Aufraeum-Task. Bewusst streng: Der Name muss dem vollstaendigen
 * Muster entsprechen, nicht die Marke nur enthalten. Eine fremde Datei, die
 * zufaellig «em4me-neu» im Namen traegt, wird nie als eigene erkannt.
 *
 * @param {string} name Datei-Name ohne Pfad.
 * @returns {boolean}
 */
function istSchattenkopie(name) {
  return typeof name === 'string' && SCHATTEN_MUSTER.test(name);
}

// 4T-001436: Ab wann gilt eine Schattenkopie als zurueckgeblieben?
//
// Das Wiederhol-Fenster oben dauert rund drei Sekunden; laenger kann ein
// laufender Schreibvorgang seine Schattenkopie nicht halten. Fuenf Minuten
// liegen um zwei Groessenordnungen darueber und decken damit auch einen
// fremden Prozess auf einer geteilten Ablage ab, dessen laufende Vorgaenge
// diese Anwendung nicht kennt.
const RESTE_MINDESTALTER_MS = 5 * 60 * 1000;

// Je Verzeichnis hoechstens alle zehn Minuten nachsehen. Ohne die Drossel
// kostete jeder Schreibvorgang ein zusaetzliches Verzeichnis-Lesen, auf einer
// Netz-Freigabe der teuerste Teil des ganzen Vorgangs.
const RESTE_DROSSEL_MS = 10 * 60 * 1000;

// Verzeichnis -> Zeitpunkt des letzten Aufraeumens.
const zuletztGeraeumt = new Map();

/**
 * Entfernt zurueckgebliebene eigene Schattenkopien aus einem Verzeichnis.
 *
 * Ein Abbruch zwischen Schreiben und Umbenennen laesst eine Schattenkopie
 * liegen. Die Zusicherung ist dann gehalten — die Zieldatei traegt unveraendert
 * ihren alten Inhalt —, aber ohne Aufraeumen sammeln sich diese Dateien im
 * Ordner des Anwenders an.
 *
 * Drei Bedingungen muessen zusammenkommen, und jede fuer sich ist eine Absage
 * an das Loeschen im Zweifel:
 *
 *   1. Der Name entspricht dem VOLLSTAENDIGEN Muster einer eigenen
 *      Schattenkopie. Eine fremde Datei, die die Marke zufaellig im Namen
 *      traegt, faellt durch.
 *   2. Die Datei gehoert zu keinem laufenden eigenen Schreibvorgang.
 *   3. Sie ist aelter als das Mindestalter, deckt also auch fremde Prozesse ab.
 *
 * Die Zieldatei wird nie beruehrt: Sie traegt weder den fuehrenden Punkt noch
 * die Marke und faellt schon an Bedingung 1 heraus.
 *
 * Fehler sind kein Abbruch. Das Aufraeumen ist eine Nebensache der
 * ausloesenden Handlung, und ein nicht loeschbarer Rest ist harmloser als ein
 * fehlgeschlagenes Speichern.
 *
 * @param {string} verzeichnis
 * @param {object} [opts]
 * @param {boolean} [opts.ohneDrossel] Drossel uebergehen (fuer Pruefaelle und
 *   fuer einen ausdruecklichen Aufruf).
 * @param {number} [opts.mindestalterMs] Abweichendes Mindestalter.
 * @returns {Promise<{entfernt: string[], uebersprungen: number}>}
 */
async function raeumeSchattenkopien(verzeichnis, opts = {}) {
  const ergebnis = { entfernt: [], uebersprungen: 0 };
  const jetzt = Date.now();

  if (!opts.ohneDrossel) {
    const letzter = zuletztGeraeumt.get(verzeichnis);
    if (letzter !== undefined && jetzt - letzter < RESTE_DROSSEL_MS) return ergebnis;
  }
  zuletztGeraeumt.set(verzeichnis, jetzt);

  const mindestalter =
    typeof opts.mindestalterMs === 'number' ? opts.mindestalterMs : RESTE_MINDESTALTER_MS;

  let eintraege;
  try {
    eintraege = await fs.readdir(verzeichnis);
  } catch (err) {
    // Verzeichnis weg oder nicht lesbar: nichts aufzuraeumen.
    void err;
    return ergebnis;
  }

  for (const name of eintraege) {
    if (!istSchattenkopie(name)) continue;
    const voll = path.join(verzeichnis, name);
    if (laufende.has(voll)) {
      ergebnis.uebersprungen += 1;
      continue;
    }
    try {
      const stat = await fs.stat(voll);
      if (jetzt - stat.mtimeMs < mindestalter) {
        ergebnis.uebersprungen += 1;
        continue;
      }
      await fs.unlink(voll);
      ergebnis.entfernt.push(voll);
    } catch (err) {
      // Schon weg, gehalten oder nicht loeschbar: der naechste Lauf sieht
      // erneut nach.
      void err;
      ergebnis.uebersprungen += 1;
    }
  }
  return ergebnis;
}

function fehlerAntwort(err) {
  return {
    ok: false,
    code: err && err.code ? err.code : undefined,
    error: err && err.message ? err.message : String(err),
  };
}

/**
 * Ersetzt eine Datei ganz oder gar nicht.
 *
 * Geschrieben wird in eine Schattenkopie im selben Verzeichnis; erst das
 * anschliessende Umbenennen macht den neuen Inhalt sichtbar. Scheitert
 * irgendetwas, bleibt die Zieldatei unveraendert — auch bei einem Absturz
 * zwischen beiden Schritten, denn dann liegt nur eine Schattenkopie da.
 *
 * @param {string} zielPfad Absoluter Pfad der zu ersetzenden Datei.
 * @param {string} inhalt Neuer Inhalt.
 * @param {object} [opts]
 * @param {string} [opts.expected] Zuletzt gelesener Stand. Ist er angegeben und
 *   weicht die Datei davon ab, wird NICHT geschrieben, sondern der Konflikt
 *   gemeldet. Die Pruefung ist bewusst optional: Der Speicher-Weg in
 *   ipc/files.js liest den Stand ohnehin und prueft selbst — bei einem
 *   geteilten Dokument sogar gegen den zusammengesetzten Text aller Teile und
 *   nicht gegen die Kopf-Datei. Wer bereits geprueft hat, uebergibt nichts.
 * @param {Function} [opts.markSelfWriting] Registriert den Schreibvorgang beim
 *   Datei-Beobachter, damit er ihn nicht als fremde Aenderung meldet.
 * @param {number[]} [opts.abstaende] Auslegung des Wiederhol-Fensters in
 *   Millisekunden. Die Vorgabe stammt aus der Messung und passt fuer jeden
 *   heutigen Aufrufer; angegeben wird sie, wo ein anderes Zeitbudget gilt —
 *   und in den Pruefaellen, damit der Ausschoepfungs-Fall nicht drei Sekunden
 *   echte Zeit verwartet. Ein Zeitgeber-Ersatz waere hier der schlechtere Weg:
 *   Er haengt an der Reihenfolge der dazwischenliegenden Datei-Operationen und
 *   war im Voll-Lauf unter Last nicht verlaesslich.
 * @returns {Promise<{ok: true, versuche: number}
 *   | {ok: false, reason: 'conflict'}
 *   | {ok: false, code?: string, error: string}>}
 */
async function ersetzeDatei(zielPfad, inhalt, opts = {}) {
  if (typeof zielPfad !== 'string' || !zielPfad) {
    throw new TypeError('ersetzeDatei ohne Zielpfad aufgerufen');
  }
  // Text ODER Binaerdaten: Der PDF-Export schreibt einen Puffer, und ein halb
  // geschriebenes PDF ist genauso kaputt wie ein halbes Dokument.
  const istText = typeof inhalt === 'string';
  if (!istText && !Buffer.isBuffer(inhalt)) {
    throw new TypeError('ersetzeDatei erwartet den Inhalt als Zeichenkette oder Puffer');
  }
  // Ein uebergebener, aber unbrauchbarer Rueckruf bricht laut, statt still
  // uebergangen zu werden (Entwicklungsrichtlinien, Kapitel 3: der einmal
  // gepruefte Vertrag statt der plausiblen Weiche). Fehlt er ganz, ist das der
  // vorgesehene Fall fuer Aufrufer ohne Beobachtung.
  const markSelfWriting = opts.markSelfWriting;
  if (markSelfWriting !== undefined && typeof markSelfWriting !== 'function') {
    throw new TypeError('ersetzeDatei: markSelfWriting ist kein Rueckruf');
  }

  if (typeof opts.expected === 'string') {
    const stand = await saveGuard.readDiskState(zielPfad);
    // Eine fehlende Datei ist eine Neuanlage und kein Konflikt; jeder andere
    // Lesefehler heisst, dass der Stand nicht geprueft werden kann, und dann
    // wird nicht blind geschrieben.
    if (!stand.ok && stand.code !== 'ENOENT') return fehlerAntwort(stand);
    const vorher = stand.ok ? stand.text : null;
    if (saveGuard.istKonflikt(vorher, opts.expected)) return { ok: false, reason: 'conflict' };
  }

  const abstaende = opts.abstaende === undefined ? WIEDERHOL_ABSTAENDE_MS : opts.abstaende;
  if (!Array.isArray(abstaende)) {
    throw new TypeError('ersetzeDatei: abstaende ist keine Liste von Wartezeiten');
  }

  const schatten = schattenPfad(zielPfad);
  laufende.add(schatten);
  try {
    await fs.writeFile(schatten, inhalt, istText ? { encoding: 'utf8' } : undefined);
  } catch (err) {
    laufende.delete(schatten);
    return fehlerAntwort(err);
  }

  // Vor dem Umbenennen registrieren: Der Beobachter kann unmittelbar danach
  // feuern. Bleibt der Eintrag nach einem endgueltigen Fehlschlag stehen,
  // passt er nicht zum Datei-Stand — die Folge ist harmlos, weil
  // istEigenerStand dann false liefert und die Meldung durchgelassen statt
  // faelschlich unterdrueckt wird.
  if (markSelfWriting) markSelfWriting(zielPfad, inhalt);

  try {
    for (let versuch = 0; ; versuch += 1) {
      try {
        await fs.rename(schatten, zielPfad);
      } catch (err) {
        const code = err && err.code;
        if (!WIEDERHOLBAR.has(code) || versuch >= abstaende.length) {
          // Die Schattenkopie hat nichts bewirkt und wird entfernt, damit das
          // Aufraeumen nur findet, was ein Absturz hinterlassen hat.
          try {
            await fs.unlink(schatten);
          } catch (aufraeumFehler) {
            // Bleibt sie liegen, ist das kein Grund, den Schreibfehler zu
            // verdecken: Sie wird am Namensmuster wiedergefunden.
            void aufraeumFehler;
          }
          return fehlerAntwort(err);
        }
        await new Promise((r) => setTimeout(r, abstaende[versuch]));
        continue;
      }
      // 4T-001436: Gelegenheit zum Aufraeumen, wenn die Anwendung in diesem
      // Verzeichnis ohnehin gerade arbeitet. Gedrosselt, damit nicht jeder
      // Schreibvorgang ein zusaetzliches Verzeichnis-Lesen kostet. Bewusst
      // AUSSERHALB des try um das Umbenennen: Ein Fehler beim Aufraeumen darf
      // niemals als fehlgeschlagenes Speichern erscheinen — das Speichern ist
      // an dieser Stelle bereits gelungen.
      laufende.delete(schatten);
      try {
        await raeumeSchattenkopien(path.dirname(zielPfad));
      } catch (aufraeumFehler) {
        void aufraeumFehler;
      }
      return { ok: true, versuche: versuch + 1 };
    }
  } finally {
    laufende.delete(schatten);
  }
}

/**
 * Wie `ersetzeDatei`, wirft aber statt ein Ergebnis-Objekt zu liefern.
 *
 * 4T-001435: Die 34 umzustellenden Schreibstellen stehen samt und sonders in
 * einem try/catch, das den Wurf von `fs.writeFile` faengt und in die
 * `{ ok, error }`-Antwort des Aufrufers uebersetzt. Diese Fassung laesst genau
 * das unveraendert: Die Umstellung tauscht eine Zeile, und das Verhalten im
 * Fehlerfall bleibt Zeichen fuer Zeichen dasselbe. Wer stattdessen den
 * Rueckgabewert pruefen will — und nur wer die Konflikt-Pruefung braucht, muss
 * das —, nimmt `ersetzeDatei`.
 *
 * Der geworfene Fehler traegt `code` wie der von `fs.writeFile`, damit
 * Aufrufer, die auf `err.code` verzweigen, nichts merken.
 *
 * @param {string} zielPfad
 * @param {string|Buffer} inhalt
 * @param {object} [opts] wie bei `ersetzeDatei`, ohne `expected`.
 * @returns {Promise<void>}
 */
async function ersetzeDateiOderWirf(zielPfad, inhalt, opts = {}) {
  if (opts.expected !== undefined) {
    throw new TypeError(
      'ersetzeDateiOderWirf kennt keine Konflikt-Pruefung; dafuer ersetzeDatei verwenden',
    );
  }
  const ergebnis = await ersetzeDatei(zielPfad, inhalt, opts);
  if (ergebnis.ok) return;
  const fehler = new Error(ergebnis.error);
  if (ergebnis.code) fehler.code = ergebnis.code;
  throw fehler;
}

// Nur fuer Pruefaelle: Der Drossel-Speicher ist Modul-Zustand und muss
// zwischen zwei Faellen zuruecksetzbar sein.
function _drosselLeeren() {
  zuletztGeraeumt.clear();
}

module.exports = {
  WIEDERHOL_ABSTAENDE_MS,
  WIEDERHOLBAR,
  SCHATTEN_MARKE,
  SCHATTEN_MUSTER,
  RESTE_MINDESTALTER_MS,
  RESTE_DROSSEL_MS,
  istSchattenkopie,
  ersetzeDatei,
  ersetzeDateiOderWirf,
  raeumeSchattenkopien,
  _drosselLeeren,
};
