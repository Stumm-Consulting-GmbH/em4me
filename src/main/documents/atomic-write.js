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

// 4T-001823 (Epic 3E-000254): Die Schattenkopien eines Datenbank-Auftrags sind
// vorbereitete Fassungen, die ein Absichts-Protokoll referenziert. Nach einem
// Absturz hinter der Marke stellt der Wiederanlauf sie fertig; ein Aufräumen,
// das sie nach fünf Minuten entfernte, nähme ihm genau das, was er braucht.
// Sie tragen deshalb eine eigene Marke:
//
// `.<Zielname>.em4me-absicht-<PID>-<Zähler>`
//
// `SCHATTEN_MUSTER` erkennt diese Form NICHT, und damit fasst
// `raeumeSchattenkopien` sie nie an. Der führende Punkt hält sie wie jede
// Schattenkopie aus Index und abgeleiteten Sichten. Die Namensform steht allein
// in diesem Modul.
const ABSICHT_MARKE = 'em4me-absicht';
const ABSICHT_MUSTER = /^\..+\.em4me-absicht-\d+-\d+$/;

let zaehler = 0;

// 4T-001436: Schattenkopien, die GERADE geschrieben werden. Das Aufraeumen
// darf keine davon anfassen, sonst zerstoerte es einen laufenden
// Schreibvorgang — auch einen zweiten im selben Verzeichnis.
const laufende = new Set();

// 4T-001823: Die Marke ist wählbar, das Verzeichnis nicht; es ist immer das
// der Zieldatei.
function schattenPfad(zielPfad, marke = SCHATTEN_MARKE) {
  zaehler += 1;
  const verzeichnis = path.dirname(zielPfad);
  const name = path.basename(zielPfad);
  return path.join(verzeichnis, `.${name}.${marke}-${process.pid}-${zaehler}`);
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

/**
 * Ist dieser Datei-Name die Schattenkopie eines Datenbank-Auftrags?
 *
 * 4T-001823 (Epic 3E-000254): für die Klammer des Absichts-Protokolls und
 * ihren Wiederanlauf. Ebenso streng wie `istSchattenkopie`: Der Name muss dem
 * vollständigen Muster entsprechen.
 *
 * @param {string} name Datei-Name ohne Pfad.
 * @returns {boolean}
 */
function istAbsichtsSchattenkopie(name) {
  return typeof name === 'string' && ABSICHT_MUSTER.test(name);
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
 * Schreibt eine Datei auf den Datenträger durch.
 *
 * 4T-001823 (Epic 3E-000254, Bauplan B1): Die Fähigkeit steht hier und nur
 * hier, damit sie genau einmal im Haus steht. Durchgeschrieben werden allein
 * die Daten (`datasync`); die Metadaten-Form `sync` bringt für eine Marke
 * nichts hinzu, und unter Windows behandelt das Betriebssystem beide gleich.
 * Das **Verzeichnis** wird bewusst nicht durchgeschrieben: Unter Windows
 * scheitert das an einem geöffneten Verzeichnis mit `EPERM`, und Windows ist
 * die Haupt-Plattform. Für Linux ist das eine benannte Lücke.
 *
 * @param {string} pfad Absoluter Pfad einer bestehenden Datei.
 * @returns {Promise<void>} Wirft den Fehler des Dateisystems unverändert.
 */
async function durchschreibeDatei(pfad) {
  const handle = await fs.open(pfad, 'r+');
  try {
    await handle.datasync();
  } finally {
    await handle.close();
  }
}

/**
 * Prüft den vorgefundenen Stand einer Zieldatei gegen den zuletzt gelesenen.
 *
 * 4T-001823 (Epic 3E-000254): herausgelöst aus `ersetzeDatei`, damit die
 * Klammer des Absichts-Protokolls, die Schreiben und Umbenennen trennt,
 * dieselbe Prüfung benutzt und keine zweite Auslegung von «fehlende Datei ist
 * kein Konflikt» entsteht.
 *
 * @param {string} zielPfad Absoluter Pfad der Zieldatei.
 * @param {string} [erwartet] Zuletzt gelesener Stand; fehlt er, wird nicht geprüft.
 * @returns {Promise<{ok: true}|{ok: false, reason: 'conflict'}|{ok: false, code?: string, error: string}>}
 */
async function pruefeVorgefundenenStand(zielPfad, erwartet) {
  if (typeof erwartet !== 'string') return { ok: true };
  const stand = await saveGuard.readDiskState(zielPfad);
  // Eine fehlende Datei ist eine Neuanlage und kein Konflikt; jeder andere
  // Lesefehler heißt, dass der Stand nicht geprüft werden kann, und dann wird
  // nicht blind geschrieben.
  if (!stand.ok && stand.code !== 'ENOENT') return fehlerAntwort(stand);
  const vorher = stand.ok ? stand.text : null;
  if (saveGuard.istKonflikt(vorher, erwartet)) return { ok: false, reason: 'conflict' };
  return { ok: true };
}

/**
 * Schreibt die Schattenkopie einer Zieldatei, ohne die Zieldatei zu berühren.
 *
 * 4T-001823 (Epic 3E-000254, Bauplan B2): der schritt-getrennte Zugang des
 * gemeinsamen Schreibwegs. Die Klammer des Absichts-Protokolls schreibt ALLE
 * Schattenkopien eines Auftrags, bevor die erste Zieldatei umbenannt wird; sie
 * bekommt den Namen deshalb von hier, damit die Namensform und damit das
 * Aufräumen über `istSchattenkopie` nur einmal im Haus stehen. `ersetzeDatei`
 * benutzt denselben Zugang.
 *
 * Die Schattenkopie bleibt im Aufräum-Schutz registriert, bis der Aufrufer sie
 * mit `loeseSchattenkopie` löst; das Aufräumen fasst sie bis dahin nicht an.
 * Scheitert das Schreiben, ist die Registrierung bereits gelöst. Scheitert erst
 * das Durchschreiben, nennt das Ergebnis den Pfad der vollständig
 * geschriebenen Schattenkopie, damit der Aufrufer sie entfernen kann.
 *
 * @param {string} zielPfad Absoluter Pfad der Zieldatei.
 * @param {string|Buffer} inhalt Neuer Inhalt.
 * @param {object} [opts]
 * @param {(pfad: string) => Promise<void>} [opts.durchschreiben] Schreibt die
 *   Schattenkopie auf den Datenträger durch; fehlt die Naht, wird nicht
 *   durchgeschrieben.
 * @param {'absicht'} [opts.marke] 4T-001823: `'absicht'` bildet den Namen mit
 *   `ABSICHT_MARKE`, den das Aufräumen nie anfasst; ohne Angabe entsteht die
 *   gewöhnliche Schattenkopie.
 * @returns {Promise<{ok: true, schatten: string}
 *   |{ok: false, code?: string, error: string, schatten?: string}>}
 */
async function schreibeSchattenkopie(zielPfad, inhalt, opts = {}) {
  const istText = typeof inhalt === 'string';
  const durchschreiben = opts.durchschreiben;
  if (durchschreiben !== undefined && typeof durchschreiben !== 'function') {
    throw new TypeError('schreibeSchattenkopie: durchschreiben ist kein Rückruf');
  }
  if (opts.marke !== undefined && opts.marke !== 'absicht') {
    throw new TypeError('schreibeSchattenkopie: unbekannte Marke');
  }
  const schatten = schattenPfad(
    zielPfad,
    opts.marke === 'absicht' ? ABSICHT_MARKE : SCHATTEN_MARKE,
  );
  laufende.add(schatten);
  try {
    await fs.writeFile(schatten, inhalt, istText ? { encoding: 'utf8' } : undefined);
  } catch (err) {
    laufende.delete(schatten);
    return fehlerAntwort(err);
  }
  if (durchschreiben) {
    try {
      await durchschreiben(schatten);
    } catch (err) {
      laufende.delete(schatten);
      return { ...fehlerAntwort(err), schatten };
    }
  }
  return { ok: true, schatten };
}

/**
 * Löst eine Schattenkopie aus dem Aufräum-Schutz.
 *
 * 4T-001823 (Epic 3E-000254, Bauplan B2): das Gegenstück zu
 * `schreibeSchattenkopie`, gerufen nach dem gelungenen Umbenennen oder nach dem
 * Entfernen einer nicht mehr gebrauchten Schattenkopie.
 *
 * @param {string} schatten Pfad der Schattenkopie.
 * @returns {void}
 */
function loeseSchattenkopie(schatten) {
  laufende.delete(schatten);
}

// 4T-001964: Öffnet eine Datei mit Schreibrecht und schließt den Griff sofort,
// ohne zu schreiben. Das entzieht dem Client eines anderen Rechners seine
// Lease; Begründung bei `benenneUmMitWiederholung`.
async function oeffneUndSchliesse(pfad) {
  const griff = await fs.open(pfad, 'r+');
  await griff.close();
}

/**
 * Benennt eine Datei um und wiederholt, wo ein fremder Zugriff die Ursache ist.
 *
 * 4T-001789 (Epic 3E-000255): Die Schleife stand bis hierher im Rumpf von
 * `ersetzeDatei` und war damit an das Ersetzen einer Datei gebunden. Sie gilt
 * aber fuer jedes Umbenennen: Die gemessene Fehlschlag-Rate von bis zu 39
 * Prozent auf einer Netz-Freigabe (Kopf-Kommentar, Grundlage 2) haengt am
 * Vorgang und nicht daran, was vorher geschrieben wurde. Das Mitziehen der
 * Begleit-Dateien beim Umbenennen und seine Ruecknahme fahren deshalb dieselbe
 * Schleife; eine zweite waere eine zweite Auslegung desselben Fensters.
 *
 * Wirft den LETZTEN Fehler unveraendert, samt `code`. Der Aufrufer entscheidet,
 * ob das ein Fehlschlag seines Vorgangs ist — hier ist es nur das Ende der
 * Wiederholungen.
 *
 * 4T-001964 (Epic 3E-000254, Befund vom 2026-09-27, Diagnose-Lauf d4 auf der
 * Netz-Freigabe): Vor dem ersten Umbenennen wird die Zieldatei einmal mit
 * Schreibrecht geöffnet und sofort wieder geschlossen. Der Client eines
 * anderen Rechners, der die Datei zuvor selbst gelesen hat, hält seinen Griff
 * samt Lease zurück und bedient das nächste Öffnen daraus; er sah nach dem
 * Ersetzen in sieben von acht Durchgängen den ALTEN Stand, auch beim Lesen mit
 * Schreibrecht. Das Umbenennen allein entzieht ihm die Lease nicht, das Öffnen
 * der Zieldatei durch den Schreiber dagegen schon: Danach sah der andere
 * Rechner in 24 von 24 Durchgängen den frischen Stand, auch beim gewöhnlichen
 * Lesen, für rund 5 ms. Der Griff wird VOR dem Umbenennen geschlossen; bleibt
 * er offen, scheitert das Umbenennen mit EPERM. Das Öffnen steht hier und
 * nicht bei den Aufrufern, damit jeder Schreibweg der Anwendung gedeckt ist,
 * Dokumente wie Datenbestand. Jeder Fehler des Öffnens wird geschluckt: Eine
 * fehlende Zieldatei ist eine Neuanlage, eine gesperrte oder
 * schreibgeschützte scheitert wie bisher erst am Umbenennen. Ein Verzeichnis
 * als Ziel wird bewusst nicht vorab ausgesondert: Unter Windows öffnet `r+`
 * ein Verzeichnis ohne Fehler, das Schließen folgt sofort, und ein
 * zusätzliches Nachsehen kostete auf der Freigabe bei jedem Umbenennen einen
 * weiteren Rundlauf. Das Sperr-Ordner-Umbenennen, der einzige Aufrufer mit
 * einem Verzeichnis, benennt ohnehin nur auf einen freien Pfad um.
 *
 * @param {string} von Bisheriger Pfad.
 * @param {string} nach Neuer Pfad.
 * @param {object} [opts]
 * @param {number[]} [opts.abstaende] Auslegung des Wiederhol-Fensters in
 *   Millisekunden, wie bei `ersetzeDatei`.
 * @param {((pfad: string) => Promise<void>)|false} [opts.oeffneZiel]
 *   4T-001964: Öffnet und schließt die Zieldatei vor dem Umbenennen; Vorgabe
 *   ist `oeffneUndSchliesse`. `false` schaltet den Schritt ab, für Prüffälle,
 *   die allein die Wiederhol-Schleife messen.
 * @returns {Promise<{versuche: number}>} Zahl der gefahrenen Versuche.
 */
async function benenneUmMitWiederholung(von, nach, opts = {}) {
  const abstaende = opts.abstaende === undefined ? WIEDERHOL_ABSTAENDE_MS : opts.abstaende;
  if (!Array.isArray(abstaende)) {
    throw new TypeError('benenneUmMitWiederholung: abstaende ist keine Liste von Wartezeiten');
  }
  const oeffneZiel = opts.oeffneZiel === undefined ? oeffneUndSchliesse : opts.oeffneZiel;
  if (oeffneZiel !== false && typeof oeffneZiel !== 'function') {
    throw new TypeError('benenneUmMitWiederholung: oeffneZiel ist weder Rückruf noch false');
  }
  // 4T-001964: genau einmal je Aufruf, nicht je Wiederhol-Versuch.
  if (oeffneZiel) {
    try {
      await oeffneZiel(nach);
    } catch (err) {
      // Fehlende, gesperrte oder schreibgeschützte Zieldatei: Das Umbenennen
      // läuft unverändert und urteilt selbst.
      void err;
    }
  }
  for (let versuch = 0; ; versuch += 1) {
    try {
      await fs.rename(von, nach);
      return { versuche: versuch + 1 };
    } catch (err) {
      const code = err && err.code;
      if (!WIEDERHOLBAR.has(code) || versuch >= abstaende.length) throw err;
      await new Promise((r) => setTimeout(r, abstaende[versuch]));
    }
  }
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

  // 4T-001823: Die Stand-Prüfung und das Schreiben der Schattenkopie laufen
  // über dieselben Zugänge wie in der Klammer des Absichts-Protokolls; das
  // Verhalten dieses Weges ist unverändert.
  const stand = await pruefeVorgefundenenStand(zielPfad, opts.expected);
  if (!stand.ok) return stand;

  const abstaende = opts.abstaende === undefined ? WIEDERHOL_ABSTAENDE_MS : opts.abstaende;
  if (!Array.isArray(abstaende)) {
    throw new TypeError('ersetzeDatei: abstaende ist keine Liste von Wartezeiten');
  }

  const geschrieben = await schreibeSchattenkopie(zielPfad, inhalt);
  if (!geschrieben.ok) return geschrieben;
  const schatten = geschrieben.schatten;

  // Vor dem Umbenennen registrieren: Der Beobachter kann unmittelbar danach
  // feuern. Bleibt der Eintrag nach einem endgueltigen Fehlschlag stehen,
  // passt er nicht zum Datei-Stand — die Folge ist harmlos, weil
  // istEigenerStand dann false liefert und die Meldung durchgelassen statt
  // faelschlich unterdrueckt wird.
  if (markSelfWriting) markSelfWriting(zielPfad, inhalt);

  try {
    let versuche;
    try {
      // 4T-001789: Die Wiederhol-Schleife liegt jetzt in
      // benenneUmMitWiederholung; das Verhalten dieses Weges ist unveraendert.
      ({ versuche } = await benenneUmMitWiederholung(schatten, zielPfad, { abstaende }));
    } catch (err) {
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
    return { ok: true, versuche };
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
  // 4T-001823: die Marke der Schattenkopien eines Datenbank-Auftrags.
  ABSICHT_MARKE,
  ABSICHT_MUSTER,
  istAbsichtsSchattenkopie,
  RESTE_MINDESTALTER_MS,
  RESTE_DROSSEL_MS,
  istSchattenkopie,
  benenneUmMitWiederholung,
  // 4T-001823 (Epic 3E-000254, B1, B2): der schritt-getrennte Zugang für die
  // Klammer des Absichts-Protokolls.
  durchschreibeDatei,
  pruefeVorgefundenenStand,
  schreibeSchattenkopie,
  loeseSchattenkopie,
  ersetzeDatei,
  ersetzeDateiOderWirf,
  raeumeSchattenkopien,
  _drosselLeeren,
};
