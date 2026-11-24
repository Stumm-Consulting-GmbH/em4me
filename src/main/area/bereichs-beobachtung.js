// 4T-002829 (Epic 3E-000446): Gemeinsame Beobachtung einer Bereichs-Wurzel.
//
// **Warum es dieses Modul gibt.** Bis Release 1.161.1 beobachteten der Index
// (src/main/index/build.js) und die Datei-Liste (src/main/area/area-apps.js)
// jede Wurzel je für sich über chokidar 4. chokidar 4 richtet je Datei und je
// Ordner ein eigenes `fs.watch` ein, und unter Windows hält jede
// Datei-Überwachung einen Zugriff auf ihren Eltern-Ordner offen (libuv,
// src/win/fs-event.c). Ein Bereich mit rund 18.000 Dateien und Ordnern auf
// einem Netzwerk-Speicher hielt so am 2026-11-22 6.588 Zugriffe und legte die
// Verbindung des Rechners zum Speicher lahm.
//
// **Das Modell.** Je Wurzel gibt es genau einen Beobachter, an dem sich alle
// Verbraucher anmelden; er endet mit der Abmeldung des letzten. Die Zahl der
// Überwachungen des Betriebssystems hängt nie an der Zahl der Dateien:
//
//   - Windows und macOS: ein `fs.watch(wurzel, { recursive: true })`. libuv
//     ruft dann ReadDirectoryChangesW mit Unterbaum auf: ein Zugriff je
//     Wurzel, Puffer 64 KB (die Obergrenze auf Netz-Freigaben).
//   - Linux: je Ordner ein `fs.watch(ordner)`; inotify meldet je Ordner auch
//     die Dateien darin. Die rekursive Option taugt dort nicht: Node 20 bildet
//     sie selbst nach und überwacht dabei jede Datei einzeln
//     (lib/internal/fs/recursive_watch.js, Marke v20.18.0).
//
// Auch eine Wurzel mit Tiefen-Grenze (Ordner eines einzeln geöffneten
// Dokuments, Tiefe 2) wird unter Windows rekursiv beobachtet, nicht je Ordner
// bis zur Grenze: Ein Dokument aus einem hoch gelegenen Ordner (Laufwerks-
// Wurzel, Benutzer-Ordner) hätte sonst Hunderte Ordner-Überwachungen, und
// genau die Zahl der Zugriffe ist der Befund. Meldungen unterhalb der Grenze
// werden allein am Pfad verworfen, ohne Datei-Abfrage (Auflage 4 der
// Plan-Freigabe vom 2026-11-23); unter Linux reichen die Ordner-Überwachungen
// nur bis zur Grenze.
//
// **Was chokidar bisher mitbrachte und hier ersetzt ist.** Ein Bestandsabbild
// (Pfad auf Ordner-Kennung, Größe, Änderungszeit) aus einem asynchronen Lauf;
// jede Meldung des Betriebssystems wird gegen das Abbild eingeordnet und als
// `add`, `change`, `unlink`, `addDir` oder `unlinkDir` an die Verbraucher
// gegeben. Neu und geändert meldet sich eine Datei erst nach dem Schreib-Ende
// (Größe und Zeit 200 ms stabil). Umbenennen erscheint als Entfernen plus Neu.
// Eine Meldung ohne Namen (Puffer-Überlauf) führt zu einem vollständigen
// Abgleich: neuer Lauf, Differenz als Meldungen.
//
// **Last-Bindung (Auflagen 1 und 2).** Jeder vollständige Abgleich fragt jede
// Datei einzeln ab. Deshalb ist die Pause nach einem Lauf mindestens das
// LAST_FAKTOR-fache seiner Dauer; auf Netz-Freigaben zusätzlich mindestens
// NETZ_ABGLEICH_MS, nach einem Überlauf mindestens UEBERLAUF_ABSTAND_MS. Nie
// laufen zwei Abgleiche zugleich; Anforderungen in der Pause ergeben einen.
//
// **Netz-Freigaben.** Meldungen von dort kommen nicht verlässlich an
// (Messungen vom 2026-08-08 und 2026-08-10, network-paths.js). Liegt die
// Wurzel auf einer Netz-Freigabe, gleicht der Beobachter zusätzlich im Takt
// ab. Der Abgleich ist asynchron, hält höchstens PARALLEL Abfragen
// gleichzeitig und keinen Zugriff offen.
//
// **Dauerhafte Fehler (Auflage 5).** Ein Fehler der Überwachung führt zu
// höchstens NEUSTART_HOECHSTZAHL Neustarts mit wachsender Wartezeit; danach,
// und sofort bei erreichter Grenze der Überwachungen, gleicht der Beobachter
// nur noch im Takt ab. Der Rückfall steht einmal im Protokoll.
//
// **Ausschlüsse (Auflage 3).** Punkt-Ordner, Punkt-Dateien und `node_modules`
// stehen nicht im Abbild (Ordner-Regel des Index, `isIgnoredDirName`).
// Meldungen von dort werden allein am Pfad eingeordnet: Je ausgeschlossenem
// Teilbaum und Sammel-Fenster gibt es höchstens eine Datei-Abfrage und eine
// Struktur-Meldung, und reine Inhalts-Änderungen lösen keine aus. Ob ein
// Verbraucher eine Meldung will, entscheidet seine eigene Ignorier-Regel,
// ebenfalls allein am Pfad.
//
// Electron-frei: Plattform, `watch`, Netz-Erkennung und Zeiten sind für
// Prüfungen einschiebbar.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathCompareKey } = require('../../shared/platform.js');
const netzPfade = require('../documents/network-paths.js');
// 4T-002829: Schnitt nach Fachlichkeit (Datei-Budget): Lauf über den Baum und
// Pfad-Regeln in -baum.js, Einordnung der Meldungen in -einordnung.js; hier
// Register, Lebenszyklus, Überwachung, Takt und Fehlerweg.
const {
  istAusgeschlossen,
  tiefeVon,
  leseBaum,
  neueGrenze,
  fehltWirklich,
  UNBEKANNT,
  naechsterAbstand,
  schliesseStill,
  LAST_FAKTOR,
} = require('./bereichs-beobachtung-baum.js');
const { EINORDNUNG, SCHREIB_ENDE_MS } = require('./bereichs-beobachtung-einordnung.js');

// Kleinster Abstand des Abgleichs auf Netz-Freigaben (Plan-Freigabe 3E-000446).
const NETZ_ABGLEICH_MS = 30 * 1000;
// Kleinster Abstand eines Abgleichs nach einem Puffer-Überlauf (Auflage 2).
const UEBERLAUF_ABSTAND_MS = 5 * 1000;
// Neustarts nach einem Fehler der Überwachung, danach Abgleich im Takt.
const NEUSTART_HOECHSTZAHL = 3;
const NEUSTART_START_MS = 1000;
// Läuft eine Überwachung nach einem Neustart so lange ohne Fehler, beginnt
// die Zählung der Neustarts von vorn (Zweitblick 6): Drei vorübergehende
// Fehler über eine lange Sitzung sind kein dauerhafter Fehler.
const NEUSTART_STABIL_MS = 10 * 60 * 1000;
// Höchstzahl gleichzeitiger Datei-Abfragen im Meldungs-Weg (Zweitblick 7);
// der vollständige Abgleich hat seine eigene Grenze (PARALLEL im Baum-Modul).
const MELDUNGS_PARALLEL = 8;
// Jeder wievielte Abgleich im Takt mit Dauer und Abfragen ins Protokoll geht
// (der erste immer); `console.info` bleibt so ein seltener Betriebs-Hinweis.
const PROTOKOLL_JEDER = 10;

// --- Einschiebbares für Prüfungen ------------------------------------------
const VORGABE = {
  watch: (p, optionen, rueckruf) => fs.watch(p, optionen, rueckruf),
  plattform: process.platform,
  netz: (p) => netzPfade.istNetzPfad(p),
  takt: NETZ_ABGLEICH_MS,
  ueberlauf: UEBERLAUF_ABSTAND_MS,
  neustart: NEUSTART_START_MS,
  stabil: NEUSTART_STABIL_MS,
  schreibEnde: SCHREIB_ENDE_MS,
};
const einstellung = { ...VORGABE };

// Wurzel-Schlüssel auf Beobachter.
const beobachter = new Map();

function rekursivMoeglich() {
  return einstellung.plattform === 'win32' || einstellung.plattform === 'darwin';
}

class Beobachter {
  constructor(wurzel, schluessel) {
    this.wurzel = wurzel;
    this.schluessel = schluessel;
    this.verbraucher = new Set();
    this.maxTiefe = 0;
    this.abbild = new Map();
    // Linux: Ordner auf Überwachung; sonst ein Eintrag für die Wurzel.
    this.ueberwachungen = new Map();
    this.gesammelt = new Map(); // Pfad -> Set der Ereignis-Arten
    this.sammelTimer = null;
    this.schreibEnde = new Map(); // Pfad -> { art, groesse, mtimeMs, timer }
    this.bereit = false;
    this.geschlossen = false;
    this.abgleichLaeuft = null;
    this.abgleichNochmal = false;
    this.abgleichTimer = null;
    this.letzteDauerMs = 0;
    // Wahr bis zum Ende des Ereignis-Schleifen-Durchlaufs, in dem ein Lauf
    // begann (Zweitblick, Runde 3: Zeitmarke statt Uhr).
    this.laufBeginntGerade = false;
    this.letztesEnde = 0;
    this.taktTimer = null;
    this.neustarts = 0;
    this.neustartTimer = null;
    this.letzterNeustart = 0;
    // Zeitpunkt der letzten Meldung je Pfad (Einordnung, gleicheAb).
    this.letzteMeldung = new Map();
    // Begrenzung der Datei-Abfragen im Meldungs-Weg, auch für den Lauf über
    // einen neu erschienenen Ordner.
    this.grenze = neueGrenze(MELDUNGS_PARALLEL);
    this.rueckfall = false;
    // Die Wurzel war beim letzten Versuch nicht lesbar (Netz getrennt,
    // Ordner entfernt); gemeldet wird nur der Übergang, nicht jeder Versuch.
    this.wurzelFehlt = false;
    this.wurzelFehler = null;
    // Zähler für Prüfungen und Nachweis: Abgleiche, Datei-Abfragen.
    this.zaehler = { abgleiche: 0, abfragen: 0, taktLaeufe: 0 };
    this.bereitPromise = null;
  }

  // --- Lebenszyklus --------------------------------------------------------

  async starte() {
    // Zuerst die Überwachung, dann der Lauf: Was während des Laufs geschieht,
    // geht nicht verloren, sondern wird danach gegen das Abbild eingeordnet.
    this.ueberwacheWurzel();
    const start = Date.now();
    try {
      await this.leseBaum(this.wurzel, this.abbild, true);
    } catch (err) {
      // Wurzel beim Start nicht lesbar (etwa ein noch nicht verbundenes
      // Netzlaufwerk): Fehler an die Verbraucher, dann Abgleich im Takt, bis
      // sie wieder lesbar ist (Zweitblick 2).
      if (this.geschlossen) return;
      this.bereit = true;
      this.fehlerAnVerbraucher(err);
      return;
    }
    if (this.geschlossen) return;
    // Auch der erste Lauf zählt für die Last-Bindung (Zweitblick 4).
    this.letzteDauerMs = Date.now() - start;
    this.letztesEnde = Date.now();
    this.bereit = true;
    this.verarbeiteGesammelt();
    this.planeTakt(this.letzteDauerMs);
  }

  schliesse() {
    this.geschlossen = true;
    for (const t of [this.sammelTimer, this.taktTimer, this.neustartTimer, this.abgleichTimer]) {
      if (t) clearTimeout(t);
    }
    for (const e of this.schreibEnde.values()) clearTimeout(e.timer);
    this.schreibEnde.clear();
    this.schliesseUeberwachungen();
    if (beobachter.get(this.schluessel) === this) beobachter.delete(this.schluessel);
  }

  schliesseUeberwachungen() {
    for (const w of this.ueberwachungen.values()) schliesseStill(w);
    this.ueberwachungen.clear();
  }

  // Höchste Tiefe, die ein Verbraucher will; ohne Grenze unendlich.
  berechneMaxTiefe() {
    let m = 0;
    for (const v of this.verbraucher) {
      if (typeof v.tiefe !== 'number') return Infinity;
      m = Math.max(m, v.tiefe);
    }
    return m;
  }

  // Eine Anmeldung mit größerer Tiefe liest das Abbild still nach: Was schon
  // da war, ist für die Verbraucher nicht neu.
  async vertiefe() {
    if (this.bereitPromise) await this.bereitPromise;
    if (this.geschlossen) return;
    const neu = new Map();
    try {
      await this.leseBaum(this.wurzel, neu, true);
    } catch {
      return;
    }
    for (const [p, e] of neu) if (!this.abbild.has(p)) this.abbild.set(p, e);
  }

  // --- Takt und Abgleich-Anforderung ---------------------------------------

  braucheTakt() {
    return this.rueckfall || this.wurzelFehlt || einstellung.netz(this.wurzel);
  }

  planeTakt(dauerMs, warteMs) {
    if (this.geschlossen || this.taktTimer || !this.braucheTakt()) return;
    const abstand = warteMs !== undefined ? warteMs : naechsterAbstand(einstellung.takt, dauerMs);
    this.taktTimer = setTimeout(async () => {
      this.taktTimer = null;
      if (this.geschlossen) return;
      // Läuft schon ein Abgleich (etwa nach einem Überlauf), zählt er als
      // dieser Takt; liegt der letzte zu kurz zurück, wartet der Takt den Rest
      // der Pause ab (Auflage 1, Zweitblick 4).
      if (this.abgleichLaeuft) {
        await this.abgleichLaeuft;
        this.planeTakt(this.letzteDauerMs);
        return;
      }
      const frei = this.letztesEnde + naechsterAbstand(einstellung.takt, this.letzteDauerMs);
      if (this.letztesEnde > 0 && Date.now() < frei) {
        this.planeTakt(this.letzteDauerMs, frei - Date.now());
        return;
      }
      const vorher = this.zaehler.abfragen;
      const dauer = await this.abgleich();
      this.zaehler.taktLaeufe++;
      if (this.zaehler.taktLaeufe % PROTOKOLL_JEDER === 1) {
        console.info(
          `Bereichs-Beobachtung: Abgleich im Takt (${this.zaehler.taktLaeufe}.), ${this.wurzel}: ` +
            `${Math.round(dauer)} ms, ${this.zaehler.abfragen - vorher} Datei-Abfragen, ` +
            `nächster in ${Math.round(naechsterAbstand(einstellung.takt, dauer) / 1000)} s`,
        );
      }
      this.planeTakt(dauer);
    }, abstand);
    if (typeof this.taktTimer.unref === 'function') this.taktTimer.unref();
  }

  // Abgleich nach einem Überlauf: nie zwei zugleich, Mindestabstand nach dem
  // letzten Lauf; Anforderungen in dieser Zeit ergeben einen (Auflage 2).
  fordereAbgleichAn() {
    if (this.geschlossen) return;
    if (!this.bereit) {
      this.abgleichNochmal = true;
      return;
    }
    if (this.abgleichLaeuft) {
      // Ein Überlauf aus demselben Durchlauf der Ereignis-Schleife, in dem der
      // Lauf begann, ist durch ihn gedeckt; erst ein späterer verlangt einen
      // weiteren Abgleich (Zweitblick, Runden 2 und 3: ein Stapel ergibt
      // einen, unabhängig von der Uhr).
      if (!this.laufBeginntGerade) this.abgleichNochmal = true;
      return;
    }
    if (this.abgleichTimer) return;
    const frei = this.letztesEnde + naechsterAbstand(einstellung.ueberlauf, this.letzteDauerMs);
    const warte = Math.max(0, frei - Date.now());
    if (this.letztesEnde === 0 || warte === 0) {
      void this.abgleich();
      return;
    }
    this.abgleichTimer = setTimeout(() => {
      this.abgleichTimer = null;
      void this.abgleich();
    }, warte);
    if (typeof this.abgleichTimer.unref === 'function') this.abgleichTimer.unref();
  }

  // --- Überwachung des Betriebssystems -------------------------------------

  ueberwacheWurzel() {
    if (this.rueckfall) return;
    if (rekursivMoeglich()) this.richteEin(this.wurzel, { recursive: true }, this.wurzel);
    else this.ueberwacheOrdner(this.wurzel);
  }

  ueberwacheOrdner(dir) {
    if (rekursivMoeglich() || this.geschlossen || this.rueckfall) return;
    if (this.ueberwachungen.has(dir)) return;
    // Je Ordner reicht bis zur Tiefen-Grenze: ein Ordner der Tiefe d meldet
    // Einträge der Tiefe d + 1.
    if (dir !== this.wurzel && tiefeVon(this.wurzel, dir) >= this.maxTiefe) return;
    this.richteEin(dir, {}, dir);
  }

  richteEin(ziel, extra, basis) {
    if (this.ueberwachungen.has(ziel)) return;
    let w;
    try {
      w = einstellung.watch(ziel, { persistent: true, ...extra }, (art, name) => {
        if (this.geschlossen) return;
        if (name === null || name === undefined || name === '') {
          // Puffer-Überlauf: Ereignisse sind verloren, der Stand nicht.
          this.fordereAbgleichAn();
          return;
        }
        this.vormerken(path.join(basis, String(name)), art);
      });
    } catch (err) {
      this.ueberwachungsFehler(ziel, err);
      return;
    }
    w.on('error', (err) => this.ueberwachungsFehler(ziel, err));
    this.ueberwachungen.set(ziel, w);
  }

  ueberwachungsFehler(ziel, err) {
    if (this.geschlossen || this.rueckfall) return;
    const code = err && err.code;
    // Grenze der Überwachungen erreicht (Linux): sofort Rückfall.
    if (code === 'ENOSPC' || code === 'EMFILE') {
      this.fallZurueck(`Grenze der Überwachungen erreicht (${code})`);
      return;
    }
    if (ziel !== this.wurzel) {
      // Ein Unterordner (Linux): Überwachung weg, der Ordner wird eingeordnet.
      schliesseStill(this.ueberwachungen.get(ziel));
      this.ueberwachungen.delete(ziel);
      this.vormerken(ziel, 'rename');
      return;
    }
    console.warn('Bereichs-Beobachtung: Fehler der Überwachung:', this.wurzel, err && err.message);
    this.schliesseUeberwachungen();
    void this.pruefeWurzelUndStarteNeu(err);
  }

  fallZurueck(grund) {
    if (this.rueckfall) return;
    this.rueckfall = true;
    console.warn(`Bereichs-Beobachtung: ${grund}; ab jetzt Abgleich im Takt:`, this.wurzel);
    this.schliesseUeberwachungen();
    if (this.neustartTimer) clearTimeout(this.neustartTimer);
    this.neustartTimer = null;
    this.planeTakt(this.letzteDauerMs);
  }

  async pruefeWurzelUndStarteNeu(err) {
    let st;
    try {
      st = await fsp.stat(this.wurzel);
    } catch {
      st = null;
    }
    if (this.geschlossen || this.rueckfall) return;
    if (!st || !st.isDirectory()) {
      this.fehlerAnVerbraucher(err || new Error('Wurzel nicht mehr vorhanden'));
      return;
    }
    if (this.letzterNeustart > 0 && Date.now() - this.letzterNeustart > einstellung.stabil) {
      this.neustarts = 0;
    }
    if (this.neustarts >= NEUSTART_HOECHSTZAHL) {
      this.fallZurueck(`${this.neustarts} Neustarts der Überwachung ohne Erfolg`);
      return;
    }
    const warte = einstellung.neustart * 2 ** this.neustarts;
    this.neustarts++;
    if (this.neustartTimer) clearTimeout(this.neustartTimer);
    this.neustartTimer = setTimeout(() => {
      this.neustartTimer = null;
      if (this.geschlossen || this.rueckfall) return;
      this.letzterNeustart = Date.now();
      this.ueberwacheWurzel();
      if (!rekursivMoeglich()) {
        for (const [p, e] of this.abbild) if (e.ordner) this.ueberwacheOrdner(p);
      }
      this.fordereAbgleichAn();
    }, warte);
    if (typeof this.neustartTimer.unref === 'function') this.neustartTimer.unref();
  }

  fehlerAnVerbraucher(err) {
    if (this.wurzelFehlt) return;
    this.wurzelFehlt = true;
    this.wurzelFehler = err;
    // Wartende Schreib-Enden fragen eine fehlende Wurzel nicht weiter ab;
    // was offen war, holt der Abgleich nach ihrer Rückkehr nach.
    for (const e of this.schreibEnde.values()) clearTimeout(e.timer);
    this.schreibEnde.clear();
    // Ohne Takt erholte sich eine lokale Wurzel nie: Der Abgleich im Takt
    // prüft, ob sie wieder lesbar ist, und richtet dann die Überwachung neu
    // ein (Zweitblick 2).
    this.planeTakt(this.letzteDauerMs);
    for (const v of [...this.verbraucher]) {
      if (typeof v.fehler !== 'function') continue;
      try {
        v.fehler(err);
      } catch (e) {
        console.warn('Bereichs-Beobachtung: Fehler im Verbraucher:', this.wurzel, e && e.message);
      }
    }
  }

  // Führt eine Datei-Abfrage des Meldungs-Wegs aus, höchstens
  // MELDUNGS_PARALLEL zugleich (Zweitblick 7); zählt sie mit.
  begrenzt(aufgabe) {
    return this.grenze(() => {
      this.zaehler.abfragen++;
      return aufgabe();
    });
  }

  // Liefert die Angaben, null für «fehlt» und UNBEKANNT für einen
  // vorübergehenden Fehler (Netz unterbrochen): Dann bleibt der Eintrag, wie
  // er ist (Hinweis des Sicherheits-Reviews, Runde 2).
  lstatBegrenzt(p) {
    return this.begrenzt(() =>
      fsp.lstat(p).catch((err) => (fehltWirklich(err) ? null : UNBEKANNT)),
    );
  }

  leseNamenBegrenzt(dir) {
    return this.begrenzt(() => fsp.readdir(dir).catch(() => null));
  }

  // Wartezeit des Schreib-Endes (für Prüfungen einschiebbar).
  schreibEndeMs() {
    return einstellung.schreibEnde;
  }

  // Unterscheidet das Dateisystem der Plattform die Schreibung nicht?
  schreibungEgal() {
    return rekursivMoeglich();
  }

  // Lauf über den Baum (bereichs-beobachtung-baum.js) mit den Werten dieses
  // Beobachters; `ueberwachen` richtet unter Linux die Ordner-Überwachungen ein.
  leseBaum(start, abbild, ueberwachen, unlesbar, grenze) {
    return leseBaum({
      unlesbar,
      grenze,
      wurzel: this.wurzel,
      start,
      abbild,
      maxTiefe: this.maxTiefe,
      zaehler: this.zaehler,
      beiOrdner: ueberwachen ? (dir) => this.ueberwacheOrdner(dir) : null,
      abgebrochen: () => this.geschlossen,
    });
  }

  // --- Vollständiger Abgleich ----------------------------------------------

  // Liefert die Dauer des (letzten) Laufs in ms.
  abgleich() {
    if (this.geschlossen || !this.bereit) return Promise.resolve(0);
    if (this.abgleichLaeuft) {
      this.abgleichNochmal = true;
      return this.abgleichLaeuft;
    }
    this.abgleichLaeuft = (async () => {
      this.abgleichNochmal = false;
      const start = Date.now();
      this.laufBeginntGerade = true;
      setImmediate(() => {
        this.laufBeginntGerade = false;
      });
      await this.gleicheAb();
      const dauer = Date.now() - start;
      this.letzteDauerMs = dauer;
      this.letztesEnde = Date.now();
      this.abgleichLaeuft = null;
      // Eine Anforderung während des Laufs bekommt ihren eigenen, gedrosselten.
      if (this.abgleichNochmal) {
        this.abgleichNochmal = false;
        this.fordereAbgleichAn();
      }
      return dauer;
    })();
    return this.abgleichLaeuft;
  }

  // --- Verteilung -----------------------------------------------------------

  melde(art, p) {
    const tiefe = tiefeVon(this.wurzel, p);
    for (const v of [...this.verbraucher]) {
      if (typeof v.tiefe === 'number' && tiefe > v.tiefe) continue;
      if (typeof v.ignoriert === 'function' && v.ignoriert(p)) continue;
      try {
        v.melde(art, p);
      } catch (err) {
        console.warn('Bereichs-Beobachtung: Fehler im Verbraucher:', p, err && err.message);
      }
    }
  }
}

// Einordnung der Meldungen und vollständiger Abgleich (-einordnung.js).
Object.assign(Beobachter.prototype, EINORDNUNG);

/**
 * Meldet einen Verbraucher an der Beobachtung einer Wurzel an.
 *
 * @param {string} wurzel Absoluter Pfad der Wurzel.
 * @param {object} verbraucher Der Verbraucher.
 * @param {(art: string, pfad: string) => void} verbraucher.melde Erhält
 *   `add`, `change`, `unlink`, `addDir` oder `unlinkDir` mit absolutem Pfad.
 * @param {(err: Error) => void} [verbraucher.fehler] Die Wurzel ist nicht
 *   (mehr) lesbar.
 * @param {(pfad: string) => boolean} [verbraucher.ignoriert] Eigene
 *   Ausschluss-Regel, allein am Pfad.
 * @param {number} [verbraucher.tiefe] Höchste Tiefe unter der Wurzel
 *   (Zählung des Index-Laufs); ohne Angabe unbegrenzt.
 * @returns {{ close: () => void, bereit: Promise<void> }} `close` meldet ab;
 *   `bereit` erfüllt sich nach dem ersten Lauf über den Baum.
 */
function beobachteWurzel(wurzel, verbraucher) {
  const aufgeloest = path.resolve(wurzel);
  const schluessel = pathCompareKey(aufgeloest);
  let b = beobachter.get(schluessel);
  let neu = false;
  if (!b || b.geschlossen) {
    b = new Beobachter(aufgeloest, schluessel);
    beobachter.set(schluessel, b);
    neu = true;
  }
  const tiefeVorher = b.maxTiefe;
  b.verbraucher.add(verbraucher);
  b.maxTiefe = b.berechneMaxTiefe();
  if (neu) {
    b.bereitPromise = b.starte();
    // Ein Netzlaufwerk, das erst nach dem Start als solches erkannt wird,
    // bekommt seinen Takt nachträglich.
    const eigen = b;
    netzPfade.beiErmittlung(() => {
      if (eigen.bereit) eigen.planeTakt(eigen.letzteDauerMs);
    });
  } else if (b.maxTiefe > tiefeVorher) {
    b.bereitPromise = b.vertiefe();
  }
  // Fehlt die Wurzel gerade, erfährt auch ein neuer Verbraucher das, statt
  // still an einem Beobachter ohne Überwachung zu hängen (Zweitblick 2). Ist
  // sie inzwischen wieder lesbar, gilt der alte Fehler nicht mehr: Dann
  // gleicht der Beobachter sofort ab, statt den Fehler zuzustellen, der den
  // Index unnötig neu aufbauen ließe (Zweitblick, Runde 2).
  if (!neu && b.wurzelFehlt && typeof verbraucher.fehler === 'function') {
    const eigen = b;
    void fsp
      .stat(eigen.wurzel)
      .then(
        (st) => st.isDirectory(),
        () => false,
      )
      .then((lesbar) => {
        if (eigen.geschlossen || !eigen.verbraucher.has(verbraucher)) return;
        if (lesbar) {
          // Scheitert der Abgleich doch, erfährt es auch dieser Verbraucher
          // (Zweitblick, Runde 3, Hinweis 4).
          void eigen.abgleich().then(() => {
            if (eigen.wurzelFehlt && !eigen.geschlossen && eigen.verbraucher.has(verbraucher)) {
              verbraucher.fehler(eigen.wurzelFehler || new Error('Wurzel nicht lesbar'));
            }
          });
          return;
        }
        if (eigen.wurzelFehlt)
          verbraucher.fehler(eigen.wurzelFehler || new Error('Wurzel nicht lesbar'));
      });
  }
  let abgemeldet = false;
  const eigener = b;
  return {
    bereit: b.bereitPromise,
    close() {
      if (abgemeldet) return;
      abgemeldet = true;
      eigener.verbraucher.delete(verbraucher);
      if (eigener.verbraucher.size === 0) eigener.schliesse();
      else eigener.maxTiefe = Math.max(eigener.berechneMaxTiefe(), 0);
    },
  };
}

// --- Nur für Prüfungen -------------------------------------------------------

/**
 * Schiebt Plattform, `watch`, Netz-Erkennung und Zeiten ein; `null` setzt den
 * jeweiligen Wert auf die Vorgabe zurück.
 *
 * @param {object} werte Einzuschiebende Werte.
 */
function _setzeFuerTest(werte = {}) {
  for (const [k, v] of Object.entries(werte)) {
    if (!(k in VORGABE)) throw new Error(`Unbekannte Einstellung: ${k}`);
    einstellung[k] = v === null ? VORGABE[k] : v;
  }
}

function _beobachterFuerTest(wurzel) {
  return beobachter.get(pathCompareKey(path.resolve(wurzel))) || null;
}

module.exports = {
  UNBEKANNT,
  beobachteWurzel,
  istAusgeschlossen,
  naechsterAbstand,
  NETZ_ABGLEICH_MS,
  UEBERLAUF_ABSTAND_MS,
  LAST_FAKTOR,
  SCHREIB_ENDE_MS,
  NEUSTART_HOECHSTZAHL,
  _setzeFuerTest,
  _beobachterFuerTest,
};
