// 4T-001821 (Epic 3E-000254, E11, E12.6, E22.3, E15.2): Die Schreib-Schnittstelle
// der Datenbank — anlegen, ändern, löschen und das Eröffnen einer Neuanlage.
//
// **Die eine Stelle, durch die jede Änderung an Datensätzen läuft.** Ohne sie
// entstehen so viele Prüf-Orte wie Eingangs-Wege, und jeder neue Weg umginge die
// Prüfungen der anderen (E12.6). Die erzeugte Maske, der Daten-Austausch und der
// Paket-Import prüfen später nicht selbst, sondern hier.
//
// **Hier entsteht der erste produktive Aufrufer von Sperre, Änderungsbeleg,
// Verdichtung und Vorgangs-Zähler.** Alle vier tragen nach E15.2 kein eigenes
// Tor; es trägt, wer sie ruft, und das ist ab hier dieses Modul. Der Nachweis des
// Aus-Zustands steht als eigener Fall in
// `test/unit/db-sperren-belege-aus-zustand.test.js`, und erst danach ist dieses
// Modul dort als nachgewiesener Aufrufer eingetragen.
//
// **Geschrieben wird ausschließlich über die Klammer** (4T-001823, AK9). Ein
// Auftrag berührt schon bei einem einzigen Datensatz zwei Dateien: die
// Tabellen-Datei und ihre Beleg-Datei. Die Klammer des Absichts-Protokolls
// (`intent-log.js`) nimmt die Sperren, ruft darunter die Vorbereitung dieses
// Moduls (lesen, prüfen, Vorgangs-Kennung ziehen, Schreib-Plan als Daten
// bilden) und macht den Plan ganz oder gar nicht wirksam. Der frühere
// unmittelbare Weg, Dateien nacheinander ersetzen und danach Belege anfügen,
// ist ersatzlos entfallen; ein zweiter Weg für einfache Fälle wäre genau die
// Stelle, an der die Zusicherung später still verloren ginge. Die Einhak-Stelle
// `pruefeStand` trägt seit 4T-001822 den Vergleich je Datensatz in
// `record-auftrag-stand.js`.
//
// **Vor jedem Auftrag sieht die Schnittstelle nach einem liegengebliebenen
// Auftrag** (4T-001824, B4). Der Wiederanlauf (`intent-recovery.js`) räumt ein
// liegendes Protokoll auf, wenn er kann; kann er es nicht, nehmen die Tabellen,
// die es nennt, keinen neuen Auftrag an (Lage `auftragHaengt`). Sonst schriebe
// der alte Auftrag später seine ältere Fassung über die neuere.
//
// **Die Sperr-Verwaltung ist die eine des Prozesses** (Pflicht-Naht, AK6). Ein
// eigener Sperr-Speicher entsteht nicht: Ob ein liegengebliebener Bruch-Anspruch
// verwaist ist, beurteilt allein die Verwaltung, und ohne sie meldete ein nach
// einem Absturz zurückgebliebener Anspruch dauerhaft «in Arbeit».
//
// **Nicht hier:** ein IPC-Kanal, eine Oberfläche und ein Sprach-Schlüssel. Das
// Ergebnis ist sprachneutral (Lage-Code mit Parametern); die Anwender-Texte
// entstehen im Vorgang zu Kanal und Brücke, in allen fünf Sprachfassungen.
'use strict';

// 4T-001964: Vorgabe ist der frisch lesende Dateizugriff; unter einer Sperre
// liefert der Netzwerk-Client sonst den Stand vor dem Ersetzen durch einen
// anderen Rechner (Begründung in frisch-lesen.js).
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const path = require('node:path');

const { pathCompareKey } = require('../../shared/platform.js');
const { ersetzeDatei } = require('../documents/atomic-write.js');
const { herkunftsFelder } = require('../documents/mdd-herkunft.js');
const { ermittleHerkunft } = require('../herkunft.js');
const { zeitpunktAus } = require('../../shared/database/change-record.js');
const { naechsteKennung } = require('../../shared/database/record-identity.js');
const { schreibeHochwasserstand } = require('../../shared/database/record-write.js');
const { ART_DATENSATZ, ART_CHANGE_LOG, loeseGegenstand } = require('./lock-store.js');
const { belegPfadFuer, verdichteBeiBedarf } = require('./change-log.js');
const { zieheVorgang } = require('./vorgangs-kennung.js');
const { LAGEN, befund, pruefeAuftragForm, pruefeWerte } = require('./record-auftrag-pruefung.js');
const {
  loeseTabelle,
  leseDefinition,
  leseTabellenBestand,
} = require('./record-auftrag-bestand.js');
const {
  loeseSchritte,
  pruefePflichtAmErgebnis,
  baueSchreibPlan,
} = require('./record-auftrag-plan.js');
// 4T-001822 (Epic 3E-000254, B5): der Vergleich des vorgefundenen Stands.
const { pruefeStaende } = require('./record-auftrag-stand.js');
// 4T-001824 (Epic 3E-000254, B4): welche Lage des Wiederanlaufs noch hängt.
const { haengtNoch } = require('./intent-recovery.js');
// 4T-001924 (Epic 3E-000254, B2): die Teilung einer wachsenden Tabelle.
const { teileWachsendeTabellen } = require('./record-auftrag-teilung.js');
// 4T-001926 (Epic 3E-000256, B3): die Ersetzungen der Prüf-Naht anwenden.
const { wendeErsetzungenAn } = require('./record-regeln.js');

// 4T-001821 (Entscheidung des Product Owners vom 2026-09-20, nach dem
// Zweirechner-Lauf desselben Tages): Die Warte-Auslegung für eine belegte
// Sperre, die nach Bauart nur Sekundenbruchteile gehalten wird.
//
// **Der Anlass ist gemessen und nicht vermutet.** Unter Dauerlast auf der
// Netz-Freigabe scheiterte ein Rechner in 392 von 400 Versuchen an der belegten
// Zähler-Sperre, nach je zwanzig Anläufen über rund 0,7 Sekunden; die
// Zusicherung selbst hielt (keine Dublette, keine Lücke). Ein Auftrag, der an
// einer Sperre scheitert, die in Millisekunden wieder frei ist, verliert nichts
// — er ärgert nur den Anwender.
//
// **Wachsende Abstände**, weil ein kurzer erster Versuch den Regelfall billig
// erledigt und ein langer Schwanz die Freigabe auch dann noch erwischt, wenn
// der andere gerade auf das Netz wartet. Summe der Abstände: 4270 Millisekunden.
const WARTE_ABSTAENDE_MS = Object.freeze([10, 20, 40, 80, 160, 320, 640, 1000, 1000, 1000]);

// **Zufalls-Streuung nach oben**, damit zwei gleichzeitig gestartete Rechner
// nicht im Gleichschritt bleiben und sich bei jedem Anlauf erneut begegnen.
// Bis zu 25 Prozent; das Warte-Fenster reicht damit bis rund 5,3 Sekunden.
const WARTE_STREUUNG = 0.25;

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

function schlafe(ms) {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

// Das Ergebnis eines abgewiesenen Auftrags. Der führende Code steht oben, damit
// ein Aufrufer ohne Durchsehen der Liste weiß, woran es lag; die Liste ordnet
// jeden Befund seiner Position im Auftrag zu (AK11).
function abgewiesen(lagen) {
  return { ok: false, code: lagen[0].code, error: lagen[0].error, lagen };
}

function abgewiesenMit(code, mehr) {
  return abgewiesen([befund(code, mehr)]);
}

/**
 * Erzeugt die Schreib-Schnittstelle der Datenbank.
 *
 * @param {object} deps Nähte.
 * @param {object} deps.sperrVerwaltung **Pflicht.** Die eine Sperr-Verwaltung des
 *   Prozesses (`erzeugeSperrVerwaltung` aus `lock-lifecycle.js`).
 * @param {{fuehreAuftragDurch: Function}} deps.absichtsProtokoll **Pflicht.**
 *   Die Klammer des Absichts-Protokolls (`erzeugeAbsichtsProtokoll` aus
 *   `intent-log.js`), gebaut mit derselben Sperr-Verwaltung (4T-001823).
 * @param {{raeumeAuf: Function}} deps.wiederanlauf **Pflicht.** Der Wiederanlauf
 *   liegengebliebener Aufträge (`erzeugeWiederanlauf` aus `intent-recovery.js`),
 *   gebaut mit derselben Sperr-Verwaltung (4T-001824).
 * @param {() => boolean} deps.erweiterungAktiv **Pflicht.** Das Tor der
 *   Erweiterung «database», bei JEDEM Auftrag frisch gefragt. **Fail-closed:**
 *   Fehlt die Naht, gilt die Erweiterung als ausgeschaltet.
 * @param {(kontext: object) => {befunde: Array<object>, ersetzungen?: Array<object>}}
 *   [deps.pruefNaht] Die Einhänge-Stelle für Schlüssel, Beziehungen, Lösch-Schutz,
 *   Prüfregeln und später die Berechtigung (B2); gebaut von `erzeugePruefNaht`
 *   in `record-regeln.js` (4T-001926). Ohne sie läuft jeder Auftrag durch.
 * @param {object} [deps.fsp] Dateizugriff.
 * @param {Function} [deps.ersetzen] Der atomare Schreibweg.
 * @param {() => string} [deps.jetzt] Zeitpunkt der Belege, UTC und sekundengenau.
 * @param {() => object} [deps.herkunft] Benutzer und Rechner.
 * @returns {{fuehreAuftragAus: Function, eroeffneNeuanlage: Function}}
 */
function erzeugeSchreibSchnittstelle(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  // Ein einmal geprüfter Vertrag, der laut bricht (Entwicklungsrichtlinien,
  // Kapitel 3): Ohne die Verwaltung gäbe es keine Sperre, und eine stille
  // Weiche auf einen eigenen Speicher wäre genau die zweite Wahrheit, die AK6
  // ausschließt.
  const sperrVerwaltung = d.sperrVerwaltung;
  if (
    !sperrVerwaltung ||
    typeof sperrVerwaltung.mitSperren !== 'function' ||
    typeof sperrVerwaltung.gehalteneSperren !== 'function' ||
    typeof sperrVerwaltung.belegSperreFuer !== 'function' ||
    typeof sperrVerwaltung.zaehlerSperreFuer !== 'function'
  ) {
    throw new TypeError(
      'erzeugeSchreibSchnittstelle: sperrVerwaltung ist Pflicht und muss mitSperren, ' +
        'gehalteneSperren, belegSperreFuer und zaehlerSperreFuer tragen',
    );
  }
  // 4T-001823 (AK9): Ohne die Klammer gäbe es keinen Schreibweg. Ein stiller
  // Rückfall auf ein unmittelbares Schreiben wäre der zweite Weg, den der
  // Vorgang ausdrücklich ausschließt.
  const absichtsProtokoll = d.absichtsProtokoll;
  if (!absichtsProtokoll || typeof absichtsProtokoll.fuehreAuftragDurch !== 'function') {
    throw new TypeError(
      'erzeugeSchreibSchnittstelle: absichtsProtokoll ist Pflicht und muss fuehreAuftragDurch tragen',
    );
  }
  // 4T-001824 (B4): Ohne den Wiederanlauf sähe kein Auftrag ein liegendes
  // Protokoll, und ein neuer Auftrag überschriebe, was der alte später noch zu
  // Ende schreibt.
  const wiederanlauf = d.wiederanlauf;
  if (!wiederanlauf || typeof wiederanlauf.raeumeAuf !== 'function') {
    throw new TypeError(
      'erzeugeSchreibSchnittstelle: wiederanlauf ist Pflicht und muss raeumeAuf tragen',
    );
  }
  // Das Tor ist die einzige Naht, die OHNE Wurf fail-closed zurückfällt, und
  // zwar auf «aus»: Der Rückfall verweigert, statt plausibel weiterzulaufen.
  const tor = typeof d.erweiterungAktiv === 'function' ? d.erweiterungAktiv : () => false;
  const pruefNaht = typeof d.pruefNaht === 'function' ? d.pruefNaht : null;
  const fsp = d.fsp || frischerDateizugriff;
  const ersetzen = typeof d.ersetzen === 'function' ? d.ersetzen : ersetzeDatei;
  const jetzt = typeof d.jetzt === 'function' ? d.jetzt : () => zeitpunktAus(new Date());
  const herkunft = typeof d.herkunft === 'function' ? d.herkunft : ermittleHerkunft;
  // Die Warte-Auslegung ist als Naht übersteuerbar, damit ein Prüffall nicht
  // Sekunden echte Zeit verwartet; eine leere Liste heißt «nicht warten».
  const warteAbstaende = Array.isArray(d.warteAbstaende) ? d.warteAbstaende : WARTE_ABSTAENDE_MS;
  const zufall = typeof d.zufall === 'function' ? d.zufall : Math.random;

  // --- Das Tor und die Bereichs-Wurzel -------------------------------------------------

  // Bei jedem Auftrag frisch gefragt und nicht beim Start eingefroren: Der
  // Anwender darf die Erweiterung im laufenden Programm ausschalten.
  function torZu() {
    return tor() !== true;
  }

  // --- Warten auf eine kurz gehaltene Sperre ---------------------------------------------

  /**
   * Führt eine Nahme aus und wiederholt sie, solange der Gegenstand belegt ist.
   *
   * **Gewartet wird nur auf Sperren, die nach Bauart Sekundenbruchteile gehalten
   * werden**, also auf den Vorgangs-Zähler und die Beleg-Datei einer Tabelle.
   * Beide nimmt ausschließlich ein laufender Auftrag (samt der Verdichtung, die
   * er auslöst); kein Bedienort und keine offene Bearbeitung hält sie. Auf eine
   * belegte **Datensatz**-Sperre wird dagegen nie gewartet: Dort hält ein Mensch
   * die Sperre, und die Meldung mit ihren zwei Wegen «nur lesen» oder «brechen»
   * ist die richtige Antwort statt einer stillen Verzögerung.
   *
   * **Die Sperr-Ordnung bleibt unverletzt:** Wiederholt wird der GANZE Vorgang,
   * also das geordnete Nehmen aller Gegenstände des Auftrags. Die bereits
   * genommenen gibt `nimmGeordnet` beim Fehlschlag selbst zurück; zwischen zwei
   * Anläufen hält dieser Auftrag nichts.
   *
   * @param {() => Promise<object>} lauf Ein Anlauf; liefert das Ergebnis der Naht.
   * @param {(ergebnis: object) => boolean} wartetBei Ob auf diese Belegung
   *   gewartet werden darf.
   * @returns {Promise<object>} Das Ergebnis des letzten Anlaufs.
   */
  async function wiederholeBeiBelegung(lauf, wartetBei) {
    for (let versuch = 0; ; versuch += 1) {
      const ergebnis = await lauf();
      if (!ergebnis || ergebnis.nichtGenommen !== true) return ergebnis;
      if (versuch >= warteAbstaende.length || !wartetBei(ergebnis)) return ergebnis;
      await schlafe(Math.round(warteAbstaende[versuch] * (1 + WARTE_STREUUNG * zufall())));
    }
  }

  // Die Sperr-Naht des Vorgangs-Zählers, um das Warten gelegt. Der Zähler ist
  // je Datenbank einer und damit der eine zentrale Schreibpunkt jedes Auftrags;
  // er wird zuletzt genommen, unter ihm keine weitere, und er ist nach
  // Millisekunden wieder frei.
  function zaehlerNaht(bereichsWurzel) {
    const naht = sperrVerwaltung.zaehlerSperreFuer(bereichsWurzel);
    return (arbeit) =>
      wiederholeBeiBelegung(
        () => naht(arbeit),
        () => true,
      );
  }

  // Auf welche Belegung eines Auftrags gewartet werden darf: auf die
  // Beleg-Datei, nicht auf einen Datensatz.
  function istBelegSperre(ergebnis) {
    return !!ergebnis.gegenstand && ergebnis.gegenstand.art === ART_CHANGE_LOG;
  }

  // --- Sperr-Menge (B3) ----------------------------------------------------------------

  // Die Identität eines Sperr-Gegenstands, gebildet über DIESELBE Auflösung, die
  // auch der Speicher benutzt. Eine zweite Bildung wäre eine zweite Wahrheit
  // darüber, welche zwei Gegenstände derselbe sind.
  function identitaet(bereichsWurzel, gegenstand) {
    const gelesen = loeseGegenstand(bereichsWurzel, gegenstand);
    if (!gelesen.ok) return null;
    return [gelesen.art, gelesen.schluessel, gelesen.kennung || ''].join('/');
  }

  // Sperren, die DIESER Prozess bereits hält, gelten als genommen (B3): etwa die
  // Datensatz-Sperre einer geöffneten Bearbeitung, die beim Speichern noch steht.
  //
  // **Sie werden aus der Menge genommen und nicht erneut genommen**, und das ist
  // mehr als eine Ersparnis: `mitSperren` gibt am Ende alles zurück, was es
  // selbst genommen hat. Eine hier mitgenommene Sperre der offenen Bearbeitung
  // wäre nach dem Speichern weg, obwohl die Bearbeitung weiterläuft.
  function ohneBereitsGehaltene(bereichsWurzel, gegenstaende) {
    const eigene = new Set();
    const wurzel = pathCompareKey(bereichsWurzel);
    for (const eintrag of sperrVerwaltung.gehalteneSperren()) {
      if (typeof eintrag.bereichsWurzel !== 'string') continue;
      if (pathCompareKey(eintrag.bereichsWurzel) !== wurzel) continue;
      const schluessel = identitaet(eintrag.bereichsWurzel, eintrag.gegenstand);
      if (schluessel !== null) eigene.add(schluessel);
    }
    return gegenstaende.filter((gegenstand) => {
      const schluessel = identitaet(bereichsWurzel, gegenstand);
      // Ein nicht auflösbarer Gegenstand bleibt in der Menge: Die Verwaltung
      // meldet ihn mit ihrem eigenen Code, statt hier still zu verschwinden.
      return schluessel === null || !eigene.has(schluessel);
    });
  }

  // Jeder berührte Datensatz und je berührter Tabelle die Beleg-Datei (B3).
  //
  // **Tragend ist die Sperre der Beleg-Datei:** Zwei Aufträge an verschiedenen
  // Datensätzen derselben Tabelle schreiben dieselbe Datei neu, und die
  // Datensatz-Sperren reihen sie nicht. Sie reiht zugleich alle Schreiber der
  // Tabelle über ihre Segmente hinweg und das Fortschreiben des
  // Hochwasserstands (B4).
  //
  // **Ein Anlegen OHNE mitgebrachte Kennung bekommt keine Datensatz-Sperre.** Die
  // Kennung wird erst unter der Sperre der Beleg-Datei aus dem Hochwasserstand
  // gezogen; bis dahin kann kein anderer sie nennen, und es gibt nichts zu
  // reihen. Wer vorher «Neuanlage eröffnen» gerufen hat, bringt seine Kennung mit
  // und bekommt ihre Sperre wie jeder andere Datensatz.
  function baueSperrMenge(bereichsWurzel, anweisungen) {
    const gegenstaende = [];
    const tabellen = new Set();
    for (const anweisung of anweisungen) {
      if (anweisung.id !== null)
        gegenstaende.push({ art: ART_DATENSATZ, tabelle: anweisung.tabelle, id: anweisung.id });
      tabellen.add(anweisung.tabelle);
    }
    for (const tabelle of tabellen) gegenstaende.push({ art: ART_CHANGE_LOG, tabelle });
    return ohneBereitsGehaltene(bereichsWurzel, gegenstaende);
  }

  // Das Ergebnis einer gescheiterten Nahme auf die Meldungs-Form bringen.
  function ausSperrFehlschlag(ergebnis) {
    if (ergebnis && ergebnis.nichtGenommen === true)
      return abgewiesenMit(LAGEN.gesperrt, {
        gegenstand: ergebnis.gegenstand || null,
        konflikt: ergebnis.konflikt || null,
      });
    return abgewiesenMit(LAGEN.gesperrt, {
      gegenstand: (ergebnis && ergebnis.gegenstand) || null,
      grund: (ergebnis && ergebnis.code) || null,
    });
  }

  // Hat das Nehmen der Sperren selbst abgebrochen, oder kommt das Ergebnis aus
  // dem Auftrag? 4T-001823: Die Klammer liefert bei Erfolg `ok: true` und sonst
  // immer `lagen`, ebenso die Vorbereitung; allein ein Fehlschlag der
  // Sperr-Verwaltung trägt weder das eine noch das andere.
  function ausDerArbeit(ergebnis) {
    return (
      !!ergebnis &&
      ergebnis.nichtGenommen !== true &&
      (Array.isArray(ergebnis.lagen) || ergebnis.ok === true)
    );
  }

  // --- Die Einhak-Stelle «Stand prüfen» ---------------------------------------------------

  /**
   * Prüft den vorgefundenen Stand (Ablauf-Schritt 6, E9.2, E9.3).
   *
   * 4T-001822 (Epic 3E-000254, B5): Der Vergleich je Datensatz steht in
   * `record-auftrag-stand.js`; diese Stelle bleibt die eine Einhak-Stelle im
   * Ablauf, unter den gehaltenen Sperren und auf dem frisch gelesenen Text.
   * Befunde weisen den Auftrag ab, bevor eine Vorgangs-Kennung gezogen ist;
   * die Abweichungen erzwungener Schritte reisen zum Plan und werden dort zum
   * Beleg der Fremd-Änderung.
   *
   * @param {{schritte: Array<object>, bestaende: Map<string, object>}} kontext
   * @returns {{befunde: Array<object>, abweichungen: Map<object, object>}}
   */
  function pruefeStand(kontext) {
    return pruefeStaende(kontext);
  }

  // --- Verdichtung (AK10) ---------------------------------------------------------------

  // Ausgelöst wird sie **nach** dem Freigeben der Auftrags-Sperren, und das ist
  // keine Bequemlichkeit, sondern Notwendigkeit: Die Verdichtung verlangt die
  // Sperre der Beleg-Datei als Naht und nimmt sie über dieselbe Verwaltung. Läuft
  // sie unter der noch gehaltenen Auftrags-Sperre, meldet `nimm` die eigene
  // Sperre des Prozesses als Konflikt (`konflikt.eigenerProzess`), `mitSperren`
  // gibt `nichtGenommen` zurück, und die Verdichtung unterbliebe bei JEDEM
  // Auftrag folgenlos mit dem Grund «gesperrt» — eine Selbst-Blockade, die
  // niemand bemerkte.
  async function verdichteBeruehrte(bereichsWurzel, tabellen) {
    const ergebnisse = [];
    for (const tabelle of tabellen) {
      const ergebnis = await verdichteBeiBedarf(
        tabelle.pfad,
        { grenzen: tabelle.grenzen },
        {
          mitSperre: sperrVerwaltung.belegSperreFuer(bereichsWurzel, tabelle.pfad),
          fsp,
          ersetzen,
        },
      );
      ergebnisse.push({
        pfad: belegPfadFuer(tabelle.pfad),
        verdichtet: ergebnis && ergebnis.verdichtet === true,
        grund: (ergebnis && ergebnis.grund) || null,
        code: ergebnis && ergebnis.ok === false ? ergebnis.code : null,
      });
    }
    return ergebnisse;
  }

  // --- Ein hängender Auftrag (4T-001824, B4, B5) ------------------------------------------

  // Der Vergleichs-Schlüssel einer Tabelle, über DIESELBE Auflösung wie die
  // Sperr-Identität: `Kunden.md` und `kunden.md` sind auf Windows eine Datei.
  function tabellenSchluessel(bereichsWurzel, tabelle) {
    const gelesen = loeseGegenstand(bereichsWurzel, { art: ART_CHANGE_LOG, tabelle });
    return gelesen.ok ? gelesen.schluessel : null;
  }

  /**
   * Der Blick in den Sperr-Ordner vor jedem Auftrag (B4). Ein liegendes
   * Protokoll löst zuerst den Wiederanlauf aus; gelingt er, läuft der Auftrag
   * ohne weiteres Zutun. Gelingt er nicht, nehmen die Tabellen, die das
   * Protokoll nennt, keinen Auftrag an; ein Auftrag an andere Tabellen läuft
   * (B5), weil die Sperren des hängenden Auftrags dessen Dateien ohnehin
   * schützen. Ein unlesbares Protokoll nennt keine Tabelle und weist nichts ab:
   * Solange sein Schreiber lebt, schützen dessen Sperren die Dateien.
   *
   * @returns {Promise<object|null>} Die Abweisung oder `null`.
   */
  async function pruefeHaengendeAuftraege(bereichsWurzel, anweisungen) {
    let lauf;
    try {
      // 4T-001824 (Nachschärfung): die Verzeichnisse der Tabellen des Auftrags
      // für das Entsorgen alter Absichts-Schattenkopien. Ein Abbruch vor der
      // Marke hinterlässt kein Protokoll, das sie nennte.
      const verzeichnisse = [];
      for (const { tabelle } of anweisungen) {
        const gelesen = loeseGegenstand(bereichsWurzel, { art: ART_CHANGE_LOG, tabelle });
        if (gelesen.ok) verzeichnisse.push(path.dirname(gelesen.tabellenPfad));
      }
      lauf = await wiederanlauf.raeumeAuf(bereichsWurzel, { verzeichnisse });
    } catch (err) {
      lauf = { ok: false, code: alsText(err) };
    }
    // Fail-closed: Ohne den Blick in den Ordner ist offen, ob ein Auftrag hängt,
    // und ein Weiterschreiben darüber hinweg wäre genau der Schaden, gegen den
    // die Lage antritt.
    if (!lauf || lauf.ok !== true)
      return abgewiesenMit(LAGEN.unerwartet, { grund: lauf && lauf.code });
    const eigene = new Set(
      anweisungen
        .map((a) => tabellenSchluessel(bereichsWurzel, a.tabelle))
        .filter((s) => s !== null),
    );
    const lagen = [];
    for (const ergebnis of lauf.ergebnisse) {
      if (!haengtNoch(ergebnis)) continue;
      const betroffen = ergebnis.tabellen.some((t) =>
        eigene.has(tabellenSchluessel(bereichsWurzel, t)),
      );
      if (!betroffen) continue;
      lagen.push(
        befund(LAGEN.haengt, {
          tabellen: [...ergebnis.tabellen],
          vorgang: ergebnis.vorgang,
          protokoll: ergebnis.protokoll,
          lage: ergebnis.lage,
        }),
      );
    }
    return lagen.length > 0 ? abgewiesen(lagen) : null;
  }

  // --- Der Auftrag ----------------------------------------------------------------------

  // Die Tabellen eines Auftrags auflösen und ihre Definition lesen — vor dem
  // Nehmen der Sperren, weil Typ- und Pflicht-Prüfung nach B2 davor laufen und
  // dafür nur Auftrag und Definition brauchen.
  async function leseDefinitionen(bereichsWurzel, anweisungen) {
    const definitionen = new Map();
    const gescheitert = new Set();
    const lagen = [];
    for (const anweisung of anweisungen) {
      const tabelle = anweisung.tabelle;
      if (definitionen.has(tabelle) || gescheitert.has(tabelle)) continue;
      const aufgeloest = loeseTabelle(bereichsWurzel, tabelle);
      if (!aufgeloest.ok) {
        gescheitert.add(tabelle);
        lagen.push({ ...aufgeloest.lage, position: anweisung.position });
        continue;
      }
      const gelesen = await leseDefinition(fsp, aufgeloest.pfad, tabelle);
      if (!gelesen.ok) {
        gescheitert.add(tabelle);
        lagen.push({ ...gelesen.lage, position: anweisung.position });
        continue;
      }
      definitionen.set(tabelle, gelesen);
    }
    return { lagen, definitionen };
  }

  // Der Bestand aller berührten Tabellen, FRISCH unter der Sperre gelesen (B3).
  async function leseBestaende(bereichsWurzel, anweisungen) {
    const bestaende = new Map();
    for (const anweisung of anweisungen) {
      if (bestaende.has(anweisung.tabelle)) continue;
      const aufgeloest = loeseTabelle(bereichsWurzel, anweisung.tabelle);
      if (!aufgeloest.ok)
        return { ok: false, lagen: [{ ...aufgeloest.lage, position: anweisung.position }] };
      const gelesen = await leseTabellenBestand(fsp, aufgeloest.pfad, anweisung.tabelle);
      if (!gelesen.ok)
        return { ok: false, lagen: [{ ...gelesen.lage, position: anweisung.position }] };
      bestaende.set(anweisung.tabelle, gelesen);
    }
    return { ok: true, bestaende };
  }

  // Die Vorbereitung unter den Sperren, gerufen von der Klammer (4T-001823, B5):
  // lesen, prüfen, Vorgangs-Kennung ziehen, Schreib-Plan bilden. Sie liefert
  // immer ein Ergebnis und wirft nie über die Klammer hinaus; ein unerwarteter
  // Bruch bekommt seinen eigenen Code, statt als Sperr-Konflikt zu erscheinen.
  async function bereiteVor(bereichsWurzel, anweisungen) {
    const gelesen = await leseBestaende(bereichsWurzel, anweisungen);
    if (!gelesen.ok) return abgewiesen(gelesen.lagen);
    const bestaende = gelesen.bestaende;

    const aufgeloest = loeseSchritte(anweisungen, bestaende);
    if (!aufgeloest.ok) return abgewiesen(aufgeloest.lagen);
    const { schritte, staende } = aufgeloest;

    // 4T-001822 (Epic 3E-000254, Nachschärfung): Der vorgefundene Stand wird
    // VOR der Pflicht-Angabe am Ergebnis geprüft. Hat jemand ein Pflicht-Feld
    // von Hand geleert, ist das zuerst eine Fremd-Änderung, über die der
    // Anwender entscheiden muss; in umgekehrter Reihenfolge erführe er nur
    // «Pflicht-Angabe fehlt» und nicht, dass die Datei anders ist als gelesen.
    // Nach einem Erzwingen prüft die Pflicht-Prüfung danach das Ergebnis, und
    // ein leer bleibendes Pflicht-Feld weist weiterhin ab (E22.6).
    const stand = pruefeStand({ schritte, bestaende });
    if (stand.befunde.length > 0) return abgewiesen(stand.befunde);

    // Die Pflicht-Angaben am RESULTIERENDEN Datensatz (E22.8): Sie brauchen den
    // vorgefundenen Stand und können deshalb erst hier laufen, unter den
    // Sperren und auf dem frisch gelesenen Text.
    const amErgebnis = pruefePflichtAmErgebnis(schritte);
    if (amErgebnis.length > 0) return abgewiesen(amErgebnis);

    if (pruefNaht !== null) {
      // 4T-001926 (Epic 3E-000256, B4): Die Bereichs-Wurzel reist mit, weil die
      // Regel-Module mit ihr die Tabellen-Sicht des Bereichs erfragen.
      const geprueft = await pruefNaht({ bereichsWurzel, anweisungen, schritte, bestaende });
      let befunde = geprueft && Array.isArray(geprueft.befunde) ? geprueft.befunde : [];
      // 4T-001926 (B3, AK4): Die Ersetzungen der Naht wirken auf die Werte vor
      // dem Schreib-Plan. Der Vergleich des vorgefundenen Stands ist bereits
      // gelaufen und bleibt unberührt; eine unzulässige Ersetzung weist ab wie
      // ein Befund der Naht, und dann wird keine angewendet.
      if (befunde.length === 0)
        befunde = wendeErsetzungenAn(anweisungen, geprueft && geprueft.ersetzungen);
      // Der Befund der Naht reist als Ganzes mit, unter dem Lage-Code dieser
      // Schnittstelle: Was die Naht gefunden hat, gehört ihr, und ein
      // Überschreiben ihres eigenen Codes nähme der Meldung ihren Gegenstand.
      if (befunde.length > 0)
        return abgewiesen(
          befunde.map((eintrag) => ({
            ...befund(LAGEN.pruefBefund, {
              position: eintrag && eintrag.position,
              tabelle: eintrag && eintrag.tabelle,
              id: eintrag && eintrag.id,
            }),
            naht: eintrag,
          })),
        );
    }

    // Einmal je Auftrag, und ein Fehlschlag lässt den ganzen Auftrag scheitern
    // (E11.5): Ohne Kennung wird nichts geschrieben.
    const gezogen = await zieheVorgang(bereichsWurzel, {
      mitSperre: zaehlerNaht(bereichsWurzel),
      fsp,
      ersetzen,
    });
    if (!gezogen.ok) return abgewiesenMit(LAGEN.vorgangFehlt, { grund: gezogen.code });

    const zeitpunkt = jetzt();
    const herkunftWert = herkunft();
    const geplant = baueSchreibPlan({
      schritte,
      staende,
      bestaende,
      vorgang: gezogen.vorgang,
      zeitpunkt,
      herkunft: herkunftsFelder(herkunftWert),
      // 4T-001822: die Abweichungen der erzwungenen Schritte.
      abweichungen: stand.abweichungen,
    });
    if (!geplant.ok) return abgewiesen(geplant.lagen);

    // 4T-001924 (B2): Reißt das letzte Segment einer Tabelle die Schwelle, teilt
    // derselbe Auftrag sie; die zusätzlichen Dateien stehen im Plan und damit
    // unter der Klammer. Ein Fehlschlag des Teilers schreibt nichts.
    const geteilt = teileWachsendeTabellen(geplant.plan, bestaende);
    if (!geteilt.ok) return abgewiesen(geteilt.lagen);
    const plan = geteilt.plan;

    // Die Tabellen, deren Beleg-Datei dieser Auftrag anfassen wird; allein sie
    // kommen für eine Verdichtung in Frage.
    const beruehrt = new Map();
    for (const eintrag of plan.belege) {
      if (beruehrt.has(eintrag.tabellenPfad)) continue;
      beruehrt.set(eintrag.tabellenPfad, {
        pfad: eintrag.tabellenPfad,
        grenzen: bestaende.get(eintrag.tabelle).grenzen,
      });
    }
    // 4T-001823 (B5): Geschrieben wird hier nichts. Der Plan geht als Daten an
    // die Klammer, die ihn ganz oder gar nicht wirksam macht; Zeitpunkt und
    // Herkunft reisen mit, damit das Protokoll denselben Augenblick nennt wie
    // die Belege.
    return {
      ok: true,
      plan,
      vorgang: gezogen.vorgang,
      zeitpunkt,
      herkunft: herkunftWert,
      ergebnis: { ergebnisse: plan.ergebnisse, beruehrteTabellen: [...beruehrt.values()] },
    };
  }

  /**
   * Führt einen Auftrag aus — anlegen, ändern und löschen, einzeln und in Menge,
   * auch über mehrere Tabellen hinweg (AK1).
   *
   * Ein Auftrag ist eine Transaktion und wirkt ganz oder gar nicht (E11.1); ein
   * Teil-Speichern wird nicht angeboten (E11.4).
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {{anweisungen: Array<{tabelle: string, art: string, id?: string,
   *   werte?: object, erwartet?: object, erzwingen?: boolean}>}} auftrag Flache
   *   Liste von Anweisungen (B1); `erwartet` ist beim Ändern und Löschen Pflicht
   *   (4T-001822).
   * @returns {Promise<object>} Bei Erfolg `{ok: true, vorgang, ergebnisse,
   *   dateien, belege, verdichtung}`, sonst `{ok: false, code, error, lagen}`.
   */
  async function fuehreAuftragAus(bereichsWurzel, auftrag) {
    if (torZu()) return abgewiesenMit(LAGEN.erweiterungAus);
    if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '')
      return abgewiesenMit(LAGEN.wurzelFehlt);

    const form = pruefeAuftragForm(auftrag);
    if (!form.ok) return abgewiesen(form.lagen);
    const { anweisungen } = form;

    // 4T-001824 (B4): vor den Definitionen und vor jeder Sperre.
    const haengt = await pruefeHaengendeAuftraege(bereichsWurzel, anweisungen);
    if (haengt !== null) return haengt;

    const definitionen = await leseDefinitionen(bereichsWurzel, anweisungen);
    if (definitionen.lagen.length > 0) return abgewiesen(definitionen.lagen);

    // Hart und vollständig (E22.3, AK3): Bei irgendeinem Befund wird nichts
    // geschrieben, und keine Sperre ist bis hierher genommen.
    const befunde = pruefeWerte(anweisungen, definitionen.definitionen);
    if (befunde.length > 0) return abgewiesen(befunde);

    const vorbereiten = async () => {
      try {
        return await bereiteVor(bereichsWurzel, anweisungen);
      } catch (err) {
        return abgewiesenMit(LAGEN.unerwartet, { grund: alsText(err) });
      }
    };
    let ergebnis;
    try {
      // 4T-001823 (B5, AK9): Sperren, Vorbereitung und Schreiben laufen durch
      // die Klammer; das Warten auf eine kurz gehaltene Sperre bleibt außen um
      // sie herum. Die Sperr-Menge wird bei jedem Anlauf neu gebildet: Zwischen
      // zwei Anläufen kann dieser Prozess eine Sperre aufgenommen oder
      // freigegeben haben, und eine eingefrorene Menge ginge dann an ihr vorbei.
      ergebnis = await wiederholeBeiBelegung(
        () =>
          absichtsProtokoll.fuehreAuftragDurch({
            bereichsWurzel,
            sperren: baueSperrMenge(bereichsWurzel, anweisungen),
            vorbereiten,
          }),
        istBelegSperre,
      );
    } catch (err) {
      // Geworfen wird dort nur aus der Sperr-Verwaltung oder bei einem
      // gebrochenen Vertrag; beides ist nicht der Fehlschlag dieses Moduls.
      return abgewiesenMit(LAGEN.gesperrt, { grund: alsText(err) });
    }
    if (!ausDerArbeit(ergebnis)) return ausSperrFehlschlag(ergebnis);
    if (!ergebnis.ok) return ergebnis;

    const verdichtung = await verdichteBeruehrte(
      bereichsWurzel,
      ergebnis.ergebnis.beruehrteTabellen,
    );
    return {
      ok: true,
      vorgang: ergebnis.vorgang,
      ergebnisse: ergebnis.ergebnis.ergebnisse,
      dateien: ergebnis.dateien,
      belege: ergebnis.belege,
      verdichtung,
    };
  }

  // --- Neuanlage eröffnen (AK2, E5.1, B4) ------------------------------------------------

  /**
   * Eröffnet eine Neuanlage: zieht die interne Kennung und schreibt den
   * Hochwasserstand fort — **ohne Beleg**, weil noch kein Datensatz entstanden
   * ist (Rahmen-Punkt 6 des Epics).
   *
   * Gezogen wird beim **Eröffnen** und nicht beim Speichern (E5.1): Zwei
   * gleichzeitig eröffnete Neuanlagen bekämen sonst dieselbe Kennung, und eine
   * Position, die auf einen noch nicht gespeicherten Kopf verweist, trägt nur,
   * wenn die Kennung ab dem Anlegen existiert. Eine abgebrochene Neuanlage
   * hinterlässt damit eine Lücke in der Nummernfolge; das ist gewollt.
   *
   * Gereiht wird über die Sperre der **Beleg-Datei** der Tabelle (B4), dieselbe,
   * unter der auch ein Auftrag den Hochwasserstand fortschreibt; die
   * Definitions-Sperre gehört nicht dazu, weil kein Schema geändert wird.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {string} tabelle Pfad der Kopf-Datei, relativ zur Bereichs-Wurzel.
   * @returns {Promise<object>} `{ok: true, tabelle, pfad, kennung, nummer,
   *   hochwasserstand}` bzw. `{ok: false, code, error, lagen}`.
   */
  async function eroeffneNeuanlage(bereichsWurzel, tabelle) {
    if (torZu()) return abgewiesenMit(LAGEN.erweiterungAus);
    if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '')
      return abgewiesenMit(LAGEN.wurzelFehlt);
    if (typeof tabelle !== 'string' || tabelle.trim() === '')
      return abgewiesenMit(LAGEN.form, { tabelle });
    const aufgeloest = loeseTabelle(bereichsWurzel, tabelle.trim());
    if (!aufgeloest.ok) return abgewiesen([aufgeloest.lage]);
    // 4T-001824 (Nachschärfung, Befund 4): Das Eröffnen ist ein Aufruf dieser
    // Schnittstelle und sieht deshalb wie jeder Auftrag nach einem hängenden
    // Auftrag, bevor es seine Sperre nimmt. Ohne das übernähme es nach einem
    // Absturz die verwaiste Sperre der Beleg-Datei, schriebe den Hochwasserstand
    // fort, und der Wiederanlauf benennte danach die ältere Fassung darüber: Die
    // eben vergebene Kennung würde ein zweites Mal vergeben.
    const haengt = await pruefeHaengendeAuftraege(bereichsWurzel, [{ tabelle: tabelle.trim() }]);
    if (haengt !== null) return haengt;

    const gegenstaende = () =>
      ohneBereitsGehaltene(bereichsWurzel, [{ art: ART_CHANGE_LOG, tabelle: tabelle.trim() }]);
    const arbeit = async () => {
      {
        try {
          const gelesen = await leseDefinition(fsp, aufgeloest.pfad, tabelle.trim());
          if (!gelesen.ok) return abgewiesen([gelesen.lage]);
          const gezogen = naechsteKennung(gelesen.lastId);
          const geschrieben = schreibeHochwasserstand(gelesen.text, gezogen.hochwasserstand);
          if (!geschrieben.ok)
            return abgewiesenMit(LAGEN.schreibenFehlgeschlagen, {
              tabelle: tabelle.trim(),
              datei: aufgeloest.pfad,
              grund: geschrieben.code,
            });
          const ersetzt = await ersetzen(aufgeloest.pfad, geschrieben.text, {
            expected: gelesen.text,
          });
          if (!ersetzt || ersetzt.ok !== true)
            return abgewiesenMit(LAGEN.schreibenFehlgeschlagen, {
              tabelle: tabelle.trim(),
              datei: aufgeloest.pfad,
              grund: (ersetzt && (ersetzt.reason || ersetzt.error)) || null,
            });
          return {
            ok: true,
            tabelle: tabelle.trim(),
            pfad: aufgeloest.pfad,
            kennung: gezogen.kennung,
            nummer: gezogen.nummer,
            hochwasserstand: gezogen.hochwasserstand,
          };
        } catch (err) {
          return abgewiesenMit(LAGEN.unerwartet, { grund: alsText(err) });
        }
      }
    };
    let ergebnis;
    try {
      // Dieselbe Warte-Auslegung wie beim Auftrag: Die Sperre der Beleg-Datei
      // hält nie ein Mensch, sondern immer nur ein laufender Vorgang.
      ergebnis = await wiederholeBeiBelegung(
        () => sperrVerwaltung.mitSperren(bereichsWurzel, gegenstaende(), arbeit),
        istBelegSperre,
      );
    } catch (err) {
      return abgewiesenMit(LAGEN.gesperrt, { grund: alsText(err) });
    }
    if (ergebnis && ergebnis.nichtGenommen === true) return ausSperrFehlschlag(ergebnis);
    if (ergebnis && ergebnis.ok !== true && !Array.isArray(ergebnis.lagen))
      return ausSperrFehlschlag(ergebnis);
    return ergebnis;
  }

  return { fuehreAuftragAus, eroeffneNeuanlage };
}

module.exports = { erzeugeSchreibSchnittstelle };
