// 4T-001788 (Epic 3E-000255, E9, Bauplan L1 bis L11): Der Lebenszyklus der
// Datensatz-Sperre — nehmen, freigeben, brechen und der Umgang mit einer Sperre,
// deren Halter nicht mehr da ist.
//
// **Der Speicher allein sperrt nicht.** `lock-store.js` kennt Ort, Name, Inhalt
// und die Zugriffe, `lock-replace.js` das Ablösen samt Bruch-Anspruch; hier
// liegen die Regeln darüber: wann eine belegte Sperre ein Absturz-Rest ist,
// wann eine fremde zum Bruch angeboten wird, was beim Freigeben geschieht und
// in welcher Reihenfolge mehrere genommen werden.
//
// **«Derselbe Rechner» heißt: derselbe Rechner UND ein nicht mehr laufender
// Prozess** (L1). E9.4 nennt den Absturz-Rest auf demselben Rechner «sicher
// erkennbar» — sicher ist er nur mit einer Lebend-Prüfung, denn derselbe
// Rechnername trifft auch auf drei lebende Halter zu: ein zweites Fenster
// derselben Anwendung, eine zweite Instanz mit anderem Profil-Ordner und einen
// zweiten angemeldeten Benutzer auf einem Terminal-Server. Eine stille Übernahme
// nähme jedem dieser drei die Sperre unter der Hand weg. Eine wiederverwendete
// Prozess-Nummer lässt umgekehrt einen Rest wie eine lebende Sperre aussehen;
// das verzögert bis zur Frist und zerstört nichts.
//
// **Es läuft kein Takt** (L11). Kein Erneuerungs-Intervall, kein Aufräum-Lauf,
// kein Timer. Eine abgelaufene Sperre wird nie selbsttätig entfernt, sondern
// höchstens zum Bruch **angeboten**; die Wartezeiten der Umbenennen-Schleife
// gehören dem Schreibweg und sind kein Hintergrund-Lauf.
//
// **Nicht hier:** ein IPC-Kanal, eine Oberfläche, ein Sprach-Schlüssel. Der
// Bedienweg entsteht mit der erzeugten Maske; die Auskunft im Konflikt ist hier
// ein sprachneutrales Daten-Ergebnis. Ebenso wenig liegt hier die ANWENDUNG der
// Sperr-Ordnung in einem Auftrag über mehrere Dateien — die gehört zur
// Schreib-Schnittstelle.
'use strict';

const {
  ART_CHANGE_LOG,
  ART_COUNTER,
  SPERR_CODES,
  entferneSperre,
  legeSperreAn,
  leseSperre,
  listeSperren,
  loeseGegenstand,
  zufallsMarke,
} = require('./lock-store.js');
// Das Ablösen liegt seit dem Bruch-Anspruch (L6a) in einem eigenen Modul; es
// benutzt die Helfer des Speichers und ist trotzdem derselbe fünfte Zugriff.
const { ABLOESE_GRUENDE, loeseSperreAb } = require('./lock-replace.js');
const { ordneSperrGegenstaende } = require('../../shared/database/lock-order.js');
const { ermittleHerkunft } = require('../herkunft.js');

// 4T-001788 (L7, AK6): Die Frist, nach der eine FREMDE Sperre zum Bruch
// angeboten wird. E9.4 legt die Größenordnung fest, nämlich Stunden statt
// Minuten, weil Uhren auseinanderlaufen dürfen; der konkrete Wert ist eine Wahl
// im entschiedenen Rahmen und steht an genau dieser einen Stelle.
//
// **Nach unten** begrenzt die Uhren-Abweichung: Auf zeitsynchronisierten
// Rechnern liegt sie im Sekundenbereich, auf einem nicht synchronisierten
// Rechner kann sie Minuten bis zu einer Stunde betragen; alles unter zwei
// Stunden riskiert, eine **lebende** Sperre als abgelaufen anzubieten.
//
// **Nach oben** begrenzt der blockierte Kollege: Eine Sperre wird beim Beginn
// einer Bearbeitung genommen und beim Speichern oder Verwerfen freigegeben, und
// eine reale Bearbeitung eines einzelnen Datensatzes dauert Minuten. Eine Frist
// von einem ganzen Arbeitstag hielte einen zweiten Anwender ohne Not fest.
//
// **Vier Stunden** liegen zwischen beidem und kosten wenig, weil nach Ablauf
// nicht entfernt, sondern nur der Bruch angeboten wird; ein zu großzügiger Wert
// verzögert also, er zerstört nichts. **Nicht übersteuerbar:** E10.11 macht die
// Verdichtungs-Vorgabe ausdrücklich übersteuerbar, für die Frist sagt E9.4
// nichts dergleichen, und eine Schraube ohne belegten Bedarf ist eine Schraube,
// die jemand falsch stellt.
const SPERR_FRIST_MS = 4 * 60 * 60 * 1000;

// Die beiden Wege aus einem Konflikt, und es gibt keinen dritten (AK3):
// Stillschweigendes Überschreiben gibt es nicht.
const WEG_LESEN = 'lesen';
const WEG_BRECHEN = 'brechen';
const NUR_LESEN = Object.freeze([WEG_LESEN]);
const LESEN_ODER_BRECHEN = Object.freeze([WEG_LESEN, WEG_BRECHEN]);

// Gründe, aus denen ein Bruch oder eine Freigabe folgenlos bleibt. Jeder ist ein
// Normalfall und kein Fehlschlag; genannt werden sie, damit ein Aufrufer die
// noch laufende Frist von der fremd gewordenen Sperre unterscheiden kann, ohne
// den Text zu lesen.
const LEBEN_CODES = Object.freeze({
  vorFrist: 'sperrBruchVorFrist',
  eigenerProzess: 'sperrBruchEigenerProzess',
  standAbweichend: 'sperrBruchStandAbweichend',
  ohneStand: 'sperrBruchOhneStand',
  nichtGehalten: 'sperreNichtGehalten',
  // 4T-001788 (L6a): Ein anderer löst dieselbe Sperre gerade ab. Ein eigener
  // Grund und nicht «Stand abweichend», weil der Stand hier gerade NICHT
  // abweicht: Der Bruch war richtig beurteilt, er kam nur zu spät.
  inArbeit: 'sperrBruchInArbeit',
});

// Die Vorgabe der Lebend-Prüfung. `process.kill(pid, 0)` sendet kein Signal,
// sondern fragt nur nach: «kein solcher Prozess» (ESRCH) heißt tot, «keine
// Berechtigung» (EPERM) heißt lebend, denn den Prozess GIBT es, er gehört nur
// einem anderen Benutzer. Jede andere Lage gilt als lebend, weil eine Sperre im
// Zweifel stehen bleibt.
const VORGABE_PROZESS = Object.freeze({
  pid: process.pid,
  lebt(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return !err || err.code !== 'ESRCH';
    }
  },
});

function alsText(wert) {
  if (typeof wert !== 'string') return null;
  const getrimmt = wert.trim();
  return getrimmt === '' ? null : getrimmt;
}

function loeseProzessNaht(roh) {
  if (!roh || typeof roh !== 'object') return VORGABE_PROZESS;
  // Ein übergebener, aber unvollständiger Vertrag bricht laut, statt still auf
  // die Vorgabe zurückzufallen (Entwicklungsrichtlinien, Kapitel 3): Eine halbe
  // Prozess-Naht führte dazu, dass die Lebend-Prüfung gegen den echten Rechner
  // liefe, während der Prüffall glaubt, sie in der Hand zu haben.
  if (!Number.isInteger(roh.pid) || typeof roh.lebt !== 'function') {
    throw new TypeError('erzeugeSperrVerwaltung: prozess braucht pid (ganze Zahl) und lebt()');
  }
  return roh;
}

/**
 * Erzeugt die Sperr-Verwaltung eines Prozesses.
 *
 * **Das Eigen-Register ist der Kern dieser Fabrik** (L4): Sie führt, welche
 * Sperren DIESER Prozess hält. Daran hängen drei Zusagen — ein Nehm-Versuch auf
 * eine eigene Sperre ist der Fall «zweites Fenster» und wird weder als
 * Absturz-Rest übernommen noch gebrochen; freigegeben wird nur, was im Register
 * steht, eine fremde Sperre entfernt die Freigabe nie; und die eigene
 * Prozess-Nummer auf einer Sperre OHNE Register-Eintrag ist der Absturz-Rest
 * einer früheren Programm-Sitzung.
 *
 * @param {object} deps Nähte. `leseKonfig` ist Pflicht und wird samt allen
 *   übrigen Speicher-Nähten (`fsp`, `jetzt`, `herkunft`, `normalisiere`,
 *   `benenneUm`, `zufall`) unverändert an den Sperr-Speicher gereicht, ergänzt
 *   um die beiden Nähte des Bruch-Anspruchs (`pid`, `anspruchVerwaist`). Dazu
 *   kommen `uhr` (Millisekunden, Vorgabe `Date.now`) und `prozess`
 *   (`{pid, lebt(pid)}`).
 * @returns {object} Die Zugriffe der Verwaltung.
 */
function erzeugeSperrVerwaltung(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const uhr = typeof d.uhr === 'function' ? d.uhr : Date.now;
  const prozess = loeseProzessNaht(d.prozess);
  const herkunft = typeof d.herkunft === 'function' ? d.herkunft : ermittleHerkunft;
  const zufall = typeof d.zufall === 'function' ? d.zufall : zufallsMarke;

  // Pfad der Sperr-Datei -> {bereichsWurzel, gegenstand, stand}.
  const register = new Map();

  // --- Frist ---------------------------------------------------------------------------

  // Alter einer Sperre in Millisekunden, oder null, wenn es sich nicht bestimmen
  // lässt. Zuerst zählt der Zeitpunkt aus dem Inhalt; fehlt er oder ist er
  // unlesbar, die Änderungszeit der Datei, die der Speicher mitliefert. Fehlt
  // auch sie, gilt die Sperre als nicht abgelaufen.
  function alterMs(halter, geaendertMs) {
    const ausInhalt = halter ? Date.parse(String(halter.zeitpunkt)) : Number.NaN;
    if (Number.isFinite(ausInhalt)) return uhr() - ausInhalt;
    if (typeof geaendertMs === 'number' && Number.isFinite(geaendertMs)) return uhr() - geaendertMs;
    return null;
  }

  // Abgelaufen ab Alter GLEICH Frist: Die Grenze gehört zur abgelaufenen Seite,
  // damit sie an genau einer Stelle liegt und nicht zwischen zwei Vergleichen.
  function istAbgelaufen(halter, geaendertMs) {
    const alter = alterMs(halter, geaendertMs);
    return alter !== null && alter >= SPERR_FRIST_MS;
  }

  // --- Einordnung einer belegten Sperre (L1) -------------------------------------------

  function istAbsturzRest(halter) {
    if (!halter) return false; // Halter unbekannt: gilt als fremd
    const rechner = alsText(halter.rechner);
    const eigenerRechner = alsText(herkunft().rechner);
    if (rechner === null || eigenerRechner === null) return false;
    // Ohne Groß-Kleinschreibung: Windows meldet denselben Rechner je nach
    // Quelle in verschiedener Schreibweise.
    if (rechner.toLowerCase() !== eigenerRechner.toLowerCase()) return false;
    if (!Number.isInteger(halter.pid)) return false; // ohne Prozess-Nummer: fremd
    // Die eigene Nummer OHNE Register-Eintrag ist der Rest einer früheren
    // Sitzung dieses Programms; der Register-Fall ist vorher abgefangen.
    if (halter.pid === prozess.pid) return true;
    return !prozess.lebt(halter.pid);
  }

  // Die Auskunft, die ein Aufrufer im Konflikt bekommt (AK3). Sie ist
  // sprachneutral: Sie nennt die Tatsachen, nicht ihren Text.
  function beurteile(belegt) {
    const halter = belegt.halter || null;
    const eigenerProzess = register.has(belegt.pfad);
    const abgelaufen = istAbgelaufen(halter, belegt.geaendertMs);
    return {
      absturzRest: !eigenerProzess && istAbsturzRest(halter),
      konflikt: {
        benutzer: halter ? alsText(halter.benutzer) : null,
        rechner: halter ? alsText(halter.rechner) : null,
        zeitpunkt: halter ? alsText(halter.zeitpunkt) : null,
        halterUnbekannt: halter === null,
        eigenerProzess,
        abgelaufen,
        // Gebrochen wird nur, was fremd UND abgelaufen ist. Die eigene Sperre
        // des laufenden Prozesses kennt nur den Weg «nur lesen».
        wege: !eigenerProzess && abgelaufen ? LESEN_ODER_BRECHEN : NUR_LESEN,
        stand: belegt.stand,
      },
    };
  }

  // 4T-001788 (L6a): Die Beurteilung eines liegengebliebenen Bruch-Anspruchs.
  // Sie steht HIER und nicht im Speicher, weil sie dieselben beiden Regeln
  // benutzt, die auch über eine Sperre urteilen: Absturz-Rest oder abgelaufen.
  // Eine zweite Auslegung im Speicher wäre die Stelle, an der ein Anspruch als
  // verwaist gilt, während sein Halter noch arbeitet.
  function anspruchVerwaist(inhalt, geaendertMs) {
    return istAbsturzRest(inhalt) || istAbgelaufen(inhalt, geaendertMs);
  }

  // Die Nähte für den Speicher: alles, was der Aufrufer gegeben hat, plus die
  // beiden des Bruch-Anspruchs. **Abgeleitetes Objekt statt Änderung an `d`**,
  // denn `d` gehört dem Aufrufer, und die bestehende Weitergabe aller übrigen
  // Nähte bleibt damit unverändert.
  const speicher = { ...d, pid: prozess.pid, anspruchVerwaist };

  // --- Nehmen (L7, AK1, AK2, AK4) ------------------------------------------------------

  // Das Anlegen IST die Prüfung: ein einziger exklusiver Schreibaufruf samt
  // Inhalt. Ein vorheriges Nachsehen gibt es auf diesem Weg nicht.
  function anlegen(bereichsWurzel, gegenstand) {
    return legeSperreAn(
      bereichsWurzel,
      gegenstand,
      { marke: zufall(), pid: prozess.pid },
      speicher,
    );
  }

  function alsGehalten(bereichsWurzel, gegenstand, angelegt, uebernommen, gebrochen) {
    register.set(angelegt.pfad, { bereichsWurzel, gegenstand, stand: angelegt.stand });
    return {
      ok: true,
      gehalten: true,
      uebernommen,
      gebrochen,
      stand: angelegt.stand,
      pfad: angelegt.pfad,
    };
  }

  function alsKonflikt(belegt, gebrochen) {
    return {
      ok: true,
      gehalten: false,
      gebrochen,
      konflikt: beurteile(belegt).konflikt,
      pfad: belegt.pfad,
    };
  }

  /**
   * Nimmt die Sperre eines Gegenstands.
   *
   * Ist sie belegt, entscheidet L1: Ein Absturz-Rest desselben Rechners wird
   * ohne Rückfrage abgelöst und **einmal** erneut angelegt; ist der Platz danach
   * wieder belegt, wird der Konflikt gemeldet. Eine Schleife gibt es nicht — sie
   * wäre ein Kampf zweier Prozesse um denselben Platz.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
   * @returns {Promise<object>} `{ok, gehalten, uebernommen, stand, pfad}` bzw.
   *   `{ok: true, gehalten: false, konflikt}` bzw. `{ok: false, code, error}`.
   */
  async function nimm(bereichsWurzel, gegenstand) {
    const erste = await anlegen(bereichsWurzel, gegenstand);
    if (!erste.ok) return erste;
    if (erste.gehalten) return alsGehalten(bereichsWurzel, gegenstand, erste, false, false);
    if (!beurteile(erste).absturzRest) return alsKonflikt(erste, false);

    const abgeloest = await loeseSperreAb(bereichsWurzel, gegenstand, erste.stand, speicher);
    if (!abgeloest.ok) return abgeloest;
    // Ein anderer löst denselben Rest gerade ab (L6a). Dann wird hier **nicht**
    // angelegt, sondern der Konflikt gemeldet: Wer in dieses Fenster hinein
    // schriebe, machte genau den Doppel-Halter, gegen den der Anspruch antritt.
    if (abgeloest.grund === ABLOESE_GRUENDE.inArbeit) return alsKonflikt(erste, false);
    const zweite = await anlegen(bereichsWurzel, gegenstand);
    if (!zweite.ok) return zweite;
    if (zweite.gehalten) return alsGehalten(bereichsWurzel, gegenstand, zweite, true, false);
    return alsKonflikt(zweite, false);
  }

  // --- Brechen (L7, AK5) ---------------------------------------------------------------

  function abgewiesen(grund, belegt) {
    return {
      ok: true,
      gehalten: false,
      gebrochen: false,
      grund,
      konflikt: beurteile(belegt).konflikt,
      pfad: belegt.pfad,
    };
  }

  /**
   * Bricht eine fremde, abgelaufene Sperre.
   *
   * **Die Mechanik prüft die Frist selbst** und verlässt sich nicht auf den
   * Aufrufer: Eine Oberfläche, die den Bruch anbietet, hat ihre Auskunft aus
   * einem früheren Augenblick, und zwischen Anzeige und Klick kann eine frische
   * Sperre entstanden sein. Genau dafür trägt der Aufruf den **Stand**, über den
   * geurteilt wurde.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
   * @param {string} stand Stand aus der Konflikt-Auskunft.
   * @returns {Promise<object>}
   */
  async function brich(bereichsWurzel, gegenstand, stand) {
    if (typeof stand !== 'string' || stand === '') {
      return {
        ok: false,
        code: LEBEN_CODES.ohneStand,
        error: 'Der Bruch verlangt den Stand der Sperre, über die geurteilt wurde.',
      };
    }
    const gelesen = await leseSperre(bereichsWurzel, gegenstand, speicher);
    if (!gelesen.ok) return gelesen;
    // Inzwischen verschwunden: Wer bricht, will die Sperre halten, und das ist
    // dann das gewöhnliche Nehmen. Ein Fehlschlag hier zwänge den Anwender zu
    // einem zweiten Handgriff ohne jeden Gewinn.
    if (!gelesen.vorhanden) return nimm(bereichsWurzel, gegenstand);
    if (register.has(gelesen.pfad)) return abgewiesen(LEBEN_CODES.eigenerProzess, gelesen);
    if (gelesen.stand !== stand) return abgewiesen(LEBEN_CODES.standAbweichend, gelesen);
    if (!istAbgelaufen(gelesen.halter, gelesen.geaendertMs)) {
      return abgewiesen(LEBEN_CODES.vorFrist, gelesen);
    }

    const abgeloest = await loeseSperreAb(bereichsWurzel, gegenstand, gelesen.stand, speicher);
    if (!abgeloest.ok) return abgeloest;
    if (abgeloest.grund === ABLOESE_GRUENDE.inArbeit) {
      // Ein anderer bricht dieselbe Sperre gerade (L6a). Angelegt wird hier
      // nichts. Gemeldet wird der Konflikt mit der FRISCH gelesenen Sperre,
      // weil der andere sie in derselben Sekunde durch seine eigene ersetzt
      // haben kann und eine Auskunft von vorhin den Anwender in die Irre
      // führte. Ist sie ganz fort, ist das der gewöhnliche Nehm-Weg wie oben.
      const frisch = await leseSperre(bereichsWurzel, gegenstand, speicher);
      if (!frisch.ok) return frisch;
      if (!frisch.vorhanden) return nimm(bereichsWurzel, gegenstand);
      return abgewiesen(LEBEN_CODES.inArbeit, frisch);
    }
    const angelegt = await anlegen(bereichsWurzel, gegenstand);
    if (!angelegt.ok) return angelegt;
    if (angelegt.gehalten) return alsGehalten(bereichsWurzel, gegenstand, angelegt, false, true);
    return alsKonflikt(angelegt, false);
  }

  // --- Freigeben (L7, AK1) -------------------------------------------------------------

  /**
   * Gibt eine gehaltene Sperre frei — beim Speichern wie beim Verwerfen.
   *
   * Es gibt keinen dritten Weg aus der Bearbeitung und deshalb keine zweite
   * Funktion. Freigegeben wird nur, was im Eigen-Register steht; eine fremde
   * Sperre wird nie entfernt. Hat jemand die eigene Sperre inzwischen gebrochen,
   * bleibt die Datei **unberührt** und das Ergebnis meldet den Verlust.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
   * @returns {Promise<object>}
   */
  async function gibFrei(bereichsWurzel, gegenstand) {
    const gelesen = await leseSperre(bereichsWurzel, gegenstand, speicher);
    if (!gelesen.ok) return gelesen;
    const eintrag = register.get(gelesen.pfad);
    if (eintrag === undefined) {
      return {
        ok: true,
        freigegeben: false,
        grund: LEBEN_CODES.nichtGehalten,
        pfad: gelesen.pfad,
      };
    }
    // Verloren ist die Sperre in zwei Lagen: Ein anderer hält inzwischen an
    // ihrem Platz, oder sie ist ganz verschwunden, weil der andere gebrochen UND
    // bereits wieder freigegeben hat. Beide Male hat während der eigenen
    // Bearbeitung jemand anders schreiben können, und genau das muss der
    // Aufrufer erfahren; die zweite Lage nennt keinen Halter mehr.
    if (!gelesen.vorhanden || gelesen.stand !== eintrag.stand) {
      register.delete(gelesen.pfad);
      return {
        ok: true,
        freigegeben: false,
        verloren: true,
        konflikt: gelesen.vorhanden ? beurteile(gelesen).konflikt : null,
        pfad: gelesen.pfad,
      };
    }
    const entfernt = await entferneSperre(bereichsWurzel, gegenstand, speicher);
    // Scheitert das Entfernen, bleibt der Register-Eintrag stehen: Die Sperre
    // liegt weiterhin da, und wer sie hält, weiß es dann auch.
    if (!entfernt.ok) return entfernt;
    register.delete(gelesen.pfad);
    return { ok: true, freigegeben: true, entfernt: entfernt.entfernt, pfad: gelesen.pfad };
  }

  /**
   * Die **lebenden** Sperren eines Bereichs (4T-001795, N2).
   *
   * **Die Einordnung liegt hier und wird nirgends nachgebildet.** Wer wissen
   * will, ob in einem Bereich gerade jemand arbeitet, fragt dieselbe Mechanik,
   * die auch über einen Nehm-Versuch urteilt; eine zweite Auslegung von
   * «lebend» wäre die Stelle, an der eine Umbenennung einem Kollegen die
   * Markierung unter der Hand wegnimmt.
   *
   * Lebend ist die Sperre des eigenen Prozesses sowie jede, die weder
   * Absturz-Rest noch abgelaufen ist. Ein unbekannter Halter gilt als lebend,
   * bis die Änderungszeit seiner Datei die Frist überschreitet.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @returns {Promise<{ok: true, ordner: string, sperren: Array<object>}
   *   |{ok: false, code: string, error: string}>}
   */
  async function lebendeSperren(bereichsWurzel) {
    const liste = await listeSperren(bereichsWurzel, speicher);
    if (!liste.ok) return liste;
    const lebend = [];
    for (const sperre of liste.sperren) {
      const urteil = beurteile(sperre);
      if (!urteil.konflikt.eigenerProzess && (urteil.absturzRest || urteil.konflikt.abgelaufen)) {
        continue;
      }
      lebend.push({
        pfad: sperre.pfad,
        gegenstand: sperre.gegenstand,
        konflikt: urteil.konflikt,
      });
    }
    return { ok: true, ordner: liste.ordner, sperren: lebend };
  }

  /** @returns {Array<object>} Die Sperren, die dieser Prozess hält. */
  function gehalteneSperren() {
    return [...register.entries()].map(([pfad, eintrag]) => ({
      pfad,
      bereichsWurzel: eintrag.bereichsWurzel,
      gegenstand: eintrag.gegenstand,
      stand: eintrag.stand,
    }));
  }

  /** Gibt alle gehaltenen Sperren frei, etwa beim Beenden der Anwendung. */
  async function gibAllesFrei() {
    const ergebnisse = [];
    for (const eintrag of gehalteneSperren()) {
      ergebnisse.push(await gibFrei(eintrag.bereichsWurzel, eintrag.gegenstand));
    }
    return { ok: true, ergebnisse };
  }

  // --- Geordnetes Nehmen (L8, L9, AK7, AK8) --------------------------------------------

  // Nimmt bereits genommene Sperren in UMGEKEHRTER Reihenfolge zurück: Wer
  // zuletzt genommen hat, gibt zuerst zurück, damit das Zeitfenster, in dem eine
  // Teilmenge gehalten wird, so kurz wie möglich bleibt.
  async function gibZurueck(bereichsWurzel, genommen) {
    const zurueck = [];
    for (let i = genommen.length - 1; i >= 0; i -= 1) {
      zurueck.push(await gibFrei(bereichsWurzel, genommen[i]));
    }
    return zurueck;
  }

  /**
   * Nimmt mehrere Sperren in der verbindlichen Ordnung.
   *
   * Scheitert eine, werden **alle** bereits genommenen wieder freigegeben, und
   * es wirkt nichts (AK8). Das Ergebnis nennt den Gegenstand, an dem es
   * scheiterte, samt Konflikt-Auskunft.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {Array<{art: string, tabelle: string, id?: string|number}>} gegenstaende
   * @returns {Promise<object>}
   */
  async function nimmGeordnet(bereichsWurzel, gegenstaende) {
    if (!Array.isArray(gegenstaende)) {
      return {
        ok: false,
        code: SPERR_CODES.gegenstand,
        error: 'nimmGeordnet erwartet eine Liste von Gegenständen.',
      };
    }
    const aufgeloest = [];
    for (const roh of gegenstaende) {
      const eintrag = loeseGegenstand(bereichsWurzel, roh);
      if (!eintrag.ok) return eintrag;
      aufgeloest.push(eintrag);
    }

    const genommen = [];
    for (const eintrag of ordneSperrGegenstaende(aufgeloest)) {
      const gegenstand = { art: eintrag.art, tabelle: eintrag.relativ, id: eintrag.kennung };
      const ergebnis = await nimm(bereichsWurzel, gegenstand);
      if (ergebnis.ok && ergebnis.gehalten) {
        genommen.push(gegenstand);
        continue;
      }
      const zurueckgenommen = await gibZurueck(bereichsWurzel, genommen);
      if (!ergebnis.ok) return { ...ergebnis, gegenstand, zurueckgenommen };
      return {
        ok: true,
        gehalten: false,
        gegenstand,
        konflikt: ergebnis.konflikt,
        zurueckgenommen,
      };
    }
    return { ok: true, gehalten: true, genommen };
  }

  /**
   * Führt eine Arbeit unter mehreren Sperren aus und gibt danach frei — auch
   * wenn die Arbeit wirft.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {Array<object>} gegenstaende
   * @param {() => Promise<any>} arbeit
   * @returns {Promise<any>} Das Ergebnis der Arbeit, oder
   *   `{ok: true, nichtGenommen: true, konflikt, gegenstand}`.
   */
  async function mitSperren(bereichsWurzel, gegenstaende, arbeit) {
    if (typeof arbeit !== 'function') {
      throw new TypeError('mitSperren: arbeit ist kein Rückruf');
    }
    const genommen = await nimmGeordnet(bereichsWurzel, gegenstaende);
    if (!genommen.ok) return genommen;
    if (!genommen.gehalten) {
      return {
        ok: true,
        nichtGenommen: true,
        konflikt: genommen.konflikt,
        gegenstand: genommen.gegenstand,
      };
    }
    try {
      return await arbeit();
    } finally {
      await gibZurueck(bereichsWurzel, genommen.genommen);
    }
  }

  /**
   * Die Naht `mitSperre(pfad, arbeit)` für die Verdichtung der Beleg-Datei
   * (L10, AK12).
   *
   * Der übergebene Pfad ist die Beleg-Datei selbst; gesperrt wird ihr
   * **Gegenstand**, also die Beleg-Datei der Tabelle, und zwar über den
   * geordneten Nehm-Vorgang. Damit läuft die Verdichtung auf demselben Weg wie
   * jeder andere Schreibzug und nicht auf einem zweiten daneben.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {string} tabellenPfad Pfad der Tabellen-Datei.
   * @returns {(pfad: string, arbeit: () => Promise<any>) => Promise<any>}
   */
  function belegSperreFuer(bereichsWurzel, tabellenPfad) {
    const gegenstaende = [{ art: ART_CHANGE_LOG, tabelle: tabellenPfad }];
    return (_pfad, arbeit) => mitSperren(bereichsWurzel, gegenstaende, arbeit);
  }

  /**
   * Die Naht `mitSperre(arbeit)` für den Vorgangs-Zähler eines Bereichs
   * (4T-001820, Bauplan B2).
   *
   * Gebaut nach dem Vorbild von `belegSperreFuer` und aus demselben Grund: Das
   * Zähler-Modul bindet die Sperr-Verwaltung **nicht** selbst ein, sondern
   * verlangt seine Sperre als Naht und verweigert ohne sie. Damit bleibt der
   * Nachweis für den ausgeschalteten Zustand der Erweiterung an **einer**
   * Stelle, nämlich bei der Schreib-Schnittstelle, die als einzige die
   * Verwaltung dieses Prozesses kennt und die Naht hereinreicht.
   *
   * Der Gegenstand ist der **Bereich als Ganzes** und trägt deshalb keinen
   * Pfad; die Naht nimmt anders als die der Verdichtung nur die Arbeit
   * entgegen.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @returns {(arbeit: () => Promise<any>) => Promise<any>}
   */
  function zaehlerSperreFuer(bereichsWurzel) {
    const gegenstaende = [{ art: ART_COUNTER }];
    return (arbeit) => mitSperren(bereichsWurzel, gegenstaende, arbeit);
  }

  return {
    nimm,
    gibFrei,
    brich,
    nimmGeordnet,
    // 4T-001823 (Epic 3E-000254): Der Rückweg des geordneten Nehmens, damit die
    // Klammer des Absichts-Protokolls die Sperren eines Auftrags über dieselbe
    // Regel zurückgibt und keine zweite Fassung der umgekehrten Reihenfolge
    // führt. `mitSperren` taugt dort nicht, weil es auch nach der Marke freigäbe.
    gibZurueck,
    mitSperren,
    lebendeSperren,
    gehalteneSperren,
    gibAllesFrei,
    belegSperreFuer,
    zaehlerSperreFuer,
  };
}

module.exports = {
  SPERR_FRIST_MS,
  LEBEN_CODES,
  WEG_LESEN,
  WEG_BRECHEN,
  // Exportiert, damit die Lebend-Prüfung an einem echten Kindprozess gemessen
  // werden kann statt an der Attrappe, die ein Prüffall sonst einspritzt. Genau
  // diese Naht trägt die Zusage aus L1, und eine Attrappe prüfte die Attrappe.
  VORGABE_PROZESS,
  erzeugeSperrVerwaltung,
};
