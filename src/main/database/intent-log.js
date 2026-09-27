// 4T-001823 (Epic 3E-000254, E11.2 bis E11.5, Bauplan B1 bis B5): Die Klammer
// eines Auftrags über mehrere Dateien, das Absichts-Protokoll.
//
// **Ein Auftrag wirkt ganz oder gar nicht, auch über mehrere Dateien.** Schon
// eine einzige Datensatz-Änderung schreibt die Tabellen-Datei neu und fügt
// einen Beleg an ihre Beleg-Datei an. Nacheinander geschrieben, hinterließe ein
// Absturz zwischen beiden eine Änderung ohne Beleg, und bei mehreren Tabellen
// den Kopf ohne seine Positionen.
//
// **Vorbereiten statt Zurückrollen** (E11.3). Die fünf Schritte:
//
//   1. Alle Sperren nehmen, geordnet, über die eine Verwaltung des Prozesses.
//      Darunter bildet der Rückruf `vorbereiten` den Schreib-Plan (B5): Der
//      Bestand wird erst unter den Sperren gelesen, ein Plan kann also nicht
//      vor ihnen übergeben werden.
//   2. Alle neuen Fassungen als Schattenkopien schreiben und durchschreiben,
//      jede im Verzeichnis ihrer Zieldatei; keine Zieldatei wird berührt.
//   3. Das Protokoll exklusiv im Sperr-Ordner anlegen und durchschreiben.
//      **Sein vollständiges, durchgeschriebenes Vorliegen ist die Marke.**
//   4. Alle Umbenennungen, danach die Beleg-Texte anfügen.
//   5. Protokoll löschen, Sperren freigeben.
//
// Vor der Marke hat ein Abbruch nichts bewirkt: Es liegen höchstens
// Schattenkopien da, und die werden auf jedem geordneten Fehlerpfad entfernt.
// **Nach der Marke gibt es nur noch vorwärts** (AK10). Kein Pfad entfernt dann
// eine Schattenkopie oder setzt eine Zieldatei zurück; ein Fehler lässt
// Protokoll und Sperren stehen, und fertiggestellt wird im Wiederanlauf
// (4T-001824). Ein Undo-Protokoll müsste genau dann schreiben, wenn gerade
// etwas schiefgeht.
//
// 4T-001924 (Epic 3E-000254, Bauplan B1): **Eine anzulegende Datei.** Teilt die
// Schreib-Schnittstelle eine Tabelle, entsteht im selben Auftrag ein neues
// Folge-Segment. Die Schritte tragen das ohne Umbau: Die Schattenkopie entsteht
// neben einer Zieldatei, die es noch nicht gibt, das Umbenennen auf einen freien
// Namen ist der Normalfall, und der Wiederanlauf benennt um, ohne das Ziel zu
// lesen. **Was fehlte, war die Gegenrichtung:** Eine Datei, die zwischen Lesen und
// Marke auf anderem Weg entstanden ist, wäre sonst still überschrieben worden,
// weil ein gelesener Stand von `null` keine Prüfung auslöst. Ein Plan-Eintrag
// mit `anlegen: true` trägt deshalb `gelesen: null`, und unmittelbar vor der
// Marke wird für ihn geprüft, dass die Zieldatei **nicht** existiert; sonst
// scheitert der Auftrag wie bei einer Fremd-Änderung (Grund `exists`), ohne dass
// eine Zieldatei berührt ist. Jeder andere Eintrag trägt seinen gelesenen Stand
// als Text; ein fehlender wäre genau die Lücke, durch die still geschrieben würde.
//
// **Was dieses Modul nicht kennt:** Datensätze, Feld-Typen und Belege als
// Inhalt. Was in den Dateien steht, hat die Schreib-Schnittstelle bestimmt; hier
// kommen fertige Texte an. Ebenso wenig gibt es hier eine eigene
// Sperr-Verwaltung (sie kommt als Naht), eine eigene Namensform der
// Schattenkopien (B2, sie kommt vom gemeinsamen Schreibweg) oder ein eigenes
// Wiederhol-Fenster des Umbenennens (AK13).
//
// **Das Tor der Erweiterung trägt nicht dieses Modul,** sondern die
// Schreib-Schnittstelle, die es ruft (E15.2). Der Nachweis des Aus-Zustands
// steht in `test/unit/db-sperren-belege-aus-zustand.test.js`.
'use strict';

// 4T-001964: Vorgabe ist der frisch lesende Dateizugriff; unter einer Sperre
// liefert der Netzwerk-Client sonst den Stand vor dem Ersetzen durch einen
// anderen Rechner (Begründung in frisch-lesen.js).
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const path = require('node:path');

const {
  benenneUmMitWiederholung,
  durchschreibeDatei,
  loeseSchattenkopie,
  pruefeVorgefundenenStand,
  raeumeSchattenkopien,
  schreibeSchattenkopie,
} = require('../documents/atomic-write.js');
const { herkunftsFelder } = require('../documents/mdd-herkunft.js');
const { ermittleHerkunft } = require('../herkunft.js');
const { zeitpunktAus } = require('../../shared/database/change-record.js');
const { schreibeExklusiv, sperrOrdnerPfad } = require('./lock-store.js');
const { belegPfadFuer } = require('./change-log.js');
const { LAGEN, befund } = require('./record-auftrag-pruefung.js');

// 4T-001823 (B4): Schema-Version des Protokolls. Ein Protokoll aus einer
// älteren Programm-Fassung bleibt damit erkennbar, statt stillschweigend
// fehlgedeutet zu werden.
const ABSICHT_SCHEMA_VERSION = 1;

// 4T-001823 (B4): `absicht-<Vorgangs-Kennung>.json`. Die Vorgangs-Kennung ist je
// Datenbank eindeutig und macht den Namen eindeutig je Auftrag; das Präfix
// unterscheidet das Protokoll von den Sperr-Dateien (Endung `.lock`) und von den
// beiseite gelegten Dateien des Ablösens, und der Wiederanlauf findet
// liegengebliebene Protokolle daran.
const ABSICHT_PRAEFIX = 'absicht-';
const ABSICHT_ENDUNG = '.json';

/**
 * Der Dateiname des Protokolls eines Auftrags.
 *
 * @param {number} vorgang Vorgangs-Kennung.
 * @returns {string}
 */
function protokollName(vorgang) {
  return `${ABSICHT_PRAEFIX}${vorgang}${ABSICHT_ENDUNG}`;
}

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

// Der Grund eines Fehlschlags für die Lage: aus einem Ergebnis des Schreibwegs
// wie bisher `reason` oder der Text, aus einem geworfenen Fehler sein Code.
function grundVon(fehler) {
  if (fehler && !(fehler instanceof Error) && typeof fehler === 'object') {
    return fehler.reason || fehler.error || fehler.code || null;
  }
  return (fehler && fehler.code) || alsText(fehler);
}

// Die Meldungs-Form der Schreib-Schnittstelle, damit ein Ergebnis dieses Moduls
// ohne Übersetzung durchgereicht werden kann.
function abgewiesen(lage) {
  return { ok: false, code: lage.code, error: lage.error, lagen: [lage] };
}

// Der Vertrag mit dem Rückruf `vorbereiten`, einmal geprüft und laut brechend
// (Entwicklungsrichtlinien, Kapitel 3). Die Vorgangs-Kennung bildet den
// Dateinamen des Protokolls und muss deshalb eine ganze Zahl sein.
//
// 4T-001924 (B1): Der gelesene Stand ist Teil des Vertrags. Eine zu ersetzende
// Datei trägt ihn als Text, eine anzulegende (`anlegen: true`) trägt `null`.
// Beides andersherum ließe die Prüfung vor der Marke leerlaufen.
function pruefeVorbereitet(vorbereitet) {
  const { plan, vorgang } = vorbereitet;
  if (!Number.isSafeInteger(vorgang) || vorgang < 1) {
    throw new TypeError('fuehreAuftragDurch: vorbereiten liefert keine gültige Vorgangs-Kennung');
  }
  if (!plan || !Array.isArray(plan.dateien) || !Array.isArray(plan.belege)) {
    throw new TypeError('fuehreAuftragDurch: vorbereiten liefert keinen Schreib-Plan');
  }
  for (const eintrag of plan.dateien) {
    if (!eintrag || typeof eintrag.pfad !== 'string' || typeof eintrag.neu !== 'string') {
      throw new TypeError('fuehreAuftragDurch: eine Datei des Plans trägt keinen Pfad oder Text');
    }
    if (eintrag.anlegen !== undefined && typeof eintrag.anlegen !== 'boolean') {
      throw new TypeError('fuehreAuftragDurch: anlegen ist kein Wahrheitswert');
    }
    const erwartet =
      eintrag.anlegen === true ? eintrag.gelesen === null : typeof eintrag.gelesen === 'string';
    if (!erwartet) {
      throw new TypeError(
        'fuehreAuftragDurch: eine Datei des Plans trägt keinen gelesenen Stand, der zu anlegen passt',
      );
    }
  }
  for (const eintrag of plan.belege) {
    if (
      !eintrag ||
      typeof eintrag.tabellenPfad !== 'string' ||
      typeof eintrag.text !== 'string' ||
      !eintrag.angaben ||
      typeof eintrag.angaben !== 'object'
    ) {
      throw new TypeError('fuehreAuftragDurch: ein Beleg des Plans trägt keinen Pfad oder Text');
    }
  }
}

/**
 * Erzeugt die Klammer des Absichts-Protokolls.
 *
 * **Eine Instanz je Prozess, mit der einen Sperr-Verwaltung des Prozesses**
 * (Verdrahtung in `src/main/app/wiring.js`).
 *
 * @param {object} deps Nähte.
 * @param {object} deps.sperrVerwaltung **Pflicht.** Die Sperr-Verwaltung des
 *   Prozesses mit `nimmGeordnet` und `gibZurueck`.
 * @param {(rootPath: string) => Promise<object|undefined>} deps.leseKonfig
 *   **Pflicht.** Der Leser der Bereichs-Konfiguration, aus dem der Sperr-Ordner
 *   als Ort des Protokolls bestimmt wird.
 * @param {object} [deps.fsp] Dateizugriff für Protokoll und Belege.
 * @param {() => string} [deps.jetzt] Zeitpunkt, falls `vorbereiten` keinen liefert.
 * @param {() => object} [deps.herkunft] Herkunft, falls `vorbereiten` keine liefert.
 * @param {(pfad: string) => Promise<void>} [deps.durchschreiben] Durchschreiben
 *   auf den Datenträger (B1); im Betrieb immer die Vorgabe.
 * @param {Function} [deps.benenneUm] Umbenennen; Vorgabe ist die gemessene
 *   Wiederhol-Schleife des gemeinsamen Schreibwegs (AK13).
 * @param {number[]} [deps.abstaende] Wiederhol-Fenster des Umbenennens; ohne
 *   Angabe gilt das gemessene des Schreibwegs.
 * @returns {{fuehreAuftragDurch: Function, laeuft: Function}} `laeuft` seit
 *   4T-001824 (Register der laufenden Vorgänge).
 */
function erzeugeAbsichtsProtokoll(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const sperrVerwaltung = d.sperrVerwaltung;
  if (
    !sperrVerwaltung ||
    typeof sperrVerwaltung.nimmGeordnet !== 'function' ||
    typeof sperrVerwaltung.gibZurueck !== 'function'
  ) {
    throw new TypeError(
      'erzeugeAbsichtsProtokoll: sperrVerwaltung ist Pflicht und muss nimmGeordnet und gibZurueck tragen',
    );
  }
  // Fail-closed wie der Sperr-Speicher: Ohne den Leser ist der Sperr-Ordner
  // nicht bestimmbar, und ein Rückfall auf den Vorgabe-Namen legte das
  // Protokoll neben die Sperren statt zu ihnen.
  if (typeof d.leseKonfig !== 'function') {
    throw new TypeError('erzeugeAbsichtsProtokoll: leseKonfig ist Pflicht');
  }
  for (const naht of ['durchschreiben', 'benenneUm', 'jetzt', 'herkunft']) {
    if (d[naht] !== undefined && typeof d[naht] !== 'function') {
      throw new TypeError(`erzeugeAbsichtsProtokoll: ${naht} ist kein Rückruf`);
    }
  }
  if (d.abstaende !== undefined && !Array.isArray(d.abstaende)) {
    throw new TypeError('erzeugeAbsichtsProtokoll: abstaende ist keine Liste von Wartezeiten');
  }
  const leseKonfig = d.leseKonfig;
  const fsp = d.fsp || frischerDateizugriff;
  const jetzt = d.jetzt || (() => zeitpunktAus(new Date()));
  const herkunft = d.herkunft || ermittleHerkunft;
  const durchschreiben = d.durchschreiben || durchschreibeDatei;
  const benenneUm = d.benenneUm || benenneUmMitWiederholung;
  const abstaende = d.abstaende;

  // 4T-001824 (Nachschärfung, Befund 2): Die Vorgänge, die DIESE Klammer gerade
  // fährt. Eingetragen wird, sobald die Vorgangs-Kennung feststeht, also schon
  // vor dem Anlegen des Protokolls: Ein vollständig geschriebenes, aber noch
  // nicht durchgeschriebenes Protokoll ist bereits lesbar, und der Wiederanlauf
  // dieses Prozesses darf es dann nicht für die Hinterlassenschaft eines
  // gescheiterten Laufs halten. Ausgetragen wird im `finally` des Einstiegs.
  const laufend = new Set();

  // --- Schritt 1 und 5: Sperren -------------------------------------------------------

  // 4T-001823 (Nachschärfung): Zurückgegeben wird über den Rückweg der
  // Verwaltung selbst, in umgekehrter Reihenfolge des Nehmens. Eine eigene
  // Fassung dieser Regel gibt es hier nicht; `mitSperren` taugt nicht, weil es
  // auch nach der Marke freigäbe.
  function gibZurueck(bereichsWurzel, genommen) {
    return sperrVerwaltung.gibZurueck(bereichsWurzel, genommen);
  }

  // --- Vor der Marke: Schritte 2 und 3 ------------------------------------------------

  // Entfernt die Schattenkopien eines abgebrochenen Auftrags. Gerufen wird das
  // **ausschließlich** vor der Marke; danach wäre es ein Zurückrollen.
  async function entferneSchattenkopien(umbenennungen) {
    for (const { von } of umbenennungen) {
      try {
        await fsp.unlink(von);
      } catch (err) {
        // Schon fort oder nicht entfernbar: Eine liegengebliebene Schattenkopie
        // hat nichts bewirkt und wird am Namensmuster wiedergefunden
        // (`raeumeSchattenkopien`); sie ist kein Grund, den eigentlichen
        // Fehlschlag zu verdecken.
        void err;
      }
      loeseSchattenkopie(von);
    }
  }

  // Zieht ein Protokoll zurück, dessen Anlegen oder Durchschreiben gescheitert
  // ist. Die Marke gilt erst als gesetzt, wenn das Protokoll durchgeschrieben
  // ist (AK5); bis dahin darf es fort. Liefert, ob es sicher nicht mehr da ist.
  async function zieheProtokollZurueck(protokoll) {
    try {
      await fsp.unlink(protokoll);
      return true;
    } catch (err) {
      return !!err && err.code === 'ENOENT';
    }
  }

  // Schritt 2 samt der Stand-Prüfung. Liefert `null` oder die Angaben der Lage,
  // an der es scheiterte; die bis dahin geschriebenen Schattenkopien stehen in
  // jedem Fall in `umbenennungen`, damit sie entfernt werden können.
  async function schreibeSchattenkopien(plan, umbenennungen) {
    // Jede neue Fassung als Schattenkopie im Verzeichnis ihrer Zieldatei,
    // durchgeschrieben (B1, B2).
    for (const eintrag of plan.dateien) {
      // 4T-001823 (Nachschärfung): mit der Marke der Absichts-Schattenkopien,
      // die kein Aufräumen anfasst; ein Wiederanlauf braucht sie.
      const geschrieben = await schreibeSchattenkopie(eintrag.pfad, eintrag.neu, {
        durchschreiben,
        marke: 'absicht',
      });
      if (!geschrieben.ok) {
        if (geschrieben.schatten) umbenennungen.push({ von: geschrieben.schatten });
        return { tabelle: eintrag.tabelle, datei: eintrag.pfad, grund: grundVon(geschrieben) };
      }
      umbenennungen.push({
        von: geschrieben.schatten,
        nach: eintrag.pfad,
        tabelle: eintrag.tabelle,
      });
    }

    // Die Zieldateien tragen noch den gelesenen Stand. Die Sperren reihen nur
    // die Schreiber dieser Anwendung; wer die Tabellen-Datei zwischen Lesen und
    // Marke auf anderem Weg gespeichert hat, würde sonst still überschrieben.
    // Geprüft wird so spät wie möglich, also unmittelbar vor der Marke, mit
    // derselben Prüfung, die der gemeinsame Schreibweg beim Ersetzen fährt.
    //
    // 4T-001924 (B1): Eine anzulegende Datei hat keinen gelesenen Stand; für sie
    // gilt die Gegenrichtung, sie darf noch nicht da sein.
    for (const eintrag of plan.dateien) {
      const stand =
        eintrag.anlegen === true
          ? await pruefeNochNichtDa(eintrag.pfad)
          : await pruefeVorgefundenenStand(eintrag.pfad, eintrag.gelesen);
      if (!stand.ok)
        return { tabelle: eintrag.tabelle, datei: eintrag.pfad, grund: grundVon(stand) };
    }
    return null;
  }

  // 4T-001924 (B1): Existiert die Zieldatei einer anzulegenden Datei schon? Dann
  // hat sie jemand zwischen Lesen und Marke angelegt, etwa ein zweiter Auftrag,
  // der dieselbe Tabelle geteilt hat, und das Umbenennen überschriebe sie still.
  // Gefragt wird nach dem Eintrag selbst (`lstat`), weil das Umbenennen den
  // Eintrag ersetzt und nicht das, worauf er zeigt. Ein anderer Fehler als
  // «nicht da» heißt, dass nicht geprüft werden kann, und dann wird nicht blind
  // geschrieben.
  async function pruefeNochNichtDa(pfad) {
    try {
      await fsp.lstat(pfad);
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true };
      return { ok: false, reason: grundVon(err) };
    }
    return { ok: false, reason: 'exists' };
  }

  // Schritte 2 und 3. Liefert entweder die gesetzte Marke oder ein fertiges
  // Ergebnis; im zweiten Fall ist keine Zieldatei berührt, und die Sperren gibt
  // der Aufrufer frei, außer das Ergebnis sagt `sperrenHalten`.
  async function setzeMarke(bereichsWurzel, genommen, vorbereitet) {
    const { plan, vorgang } = vorbereitet;
    const umbenennungen = [];
    const scheitern = async (mehr, code = LAGEN.schreibenFehlgeschlagen) => {
      await entferneSchattenkopien(umbenennungen);
      return { ok: false, ergebnis: abgewiesen(befund(code, mehr)) };
    };

    let belege;
    let inhalt;
    try {
      const fehlschlag = await schreibeSchattenkopien(plan, umbenennungen);
      if (fehlschlag !== null) return scheitern(fehlschlag);

      // Das Protokoll. Die Belege tragen den fertigen Anfüge-Text, weil ein
      // Wiederanlauf ihn sonst aus Angaben neu bauen müsste, die mit dem
      // abgestürzten Prozess verloren sind (B4).
      belege = plan.belege.map((eintrag) => ({
        pfad: belegPfadFuer(eintrag.tabellenPfad),
        text: eintrag.text,
        tx: eintrag.angaben.vorgang,
        id: eintrag.angaben.id,
        tabelle: eintrag.tabelle,
      }));
      const wer = vorbereitet.herkunft === undefined ? herkunft() : vorbereitet.herkunft;
      inhalt = {
        schemaVersion: ABSICHT_SCHEMA_VERSION,
        vorgang,
        zeitpunkt: typeof vorbereitet.zeitpunkt === 'string' ? vorbereitet.zeitpunkt : jetzt(),
        halter: { ...herkunftsFelder(wer), pid: process.pid },
        umbenennungen: umbenennungen.map(({ von, nach }) => ({ von, nach })),
        belege: belege.map(({ pfad, text, tx, id }) => ({ pfad, text, tx, id })),
        sperren: genommen,
      };
    } catch (err) {
      // Ein Bruch vor der Marke, den keine benannte Lage beschreibt: Noch ist
      // keine Zieldatei berührt.
      return scheitern({ grund: alsText(err) }, LAGEN.unerwartet);
    }

    // Schritt 3: das Protokoll, exklusiv angelegt und durchgeschrieben (B3).
    let protokoll;
    try {
      protokoll = path.join(
        await sperrOrdnerPfad(bereichsWurzel, { leseKonfig }),
        protokollName(vorgang),
      );
      await schreibeExklusiv(fsp, protokoll, `${JSON.stringify(inhalt, null, 2)}\n`);
    } catch (err) {
      // Ein fremdes Protokoll gleichen Namens wird nie angefasst; ein eigenes,
      // das halb entstanden sein kann, wird zurückgezogen.
      const fort =
        protokoll === undefined || (err && err.code === 'EEXIST')
          ? true
          : await zieheProtokollZurueck(protokoll);
      if (!fort)
        return { ok: false, sperrenHalten: true, ergebnis: liegenGeblieben(protokoll, err) };
      return scheitern({ datei: protokoll || null, grund: grundVon(err) });
    }
    try {
      await durchschreiben(protokoll);
    } catch (err) {
      if (!(await zieheProtokollZurueck(protokoll))) {
        return { ok: false, sperrenHalten: true, ergebnis: liegenGeblieben(protokoll, err) };
      }
      return scheitern({ datei: protokoll, grund: grundVon(err) });
    }
    return { ok: true, protokoll, umbenennungen, belege };
  }

  // Ein Protokoll, das sich nach einem Fehlschlag nicht zurückziehen ließ, kann
  // vollständig daliegen und ist dann eine Marke. Es bleibt samt Schattenkopien
  // und Sperren stehen; das ist dieselbe Lage wie ein Fehler nach der Marke.
  function liegenGeblieben(protokoll, err) {
    return abgewiesen(
      befund(LAGEN.teilweiseGeschrieben, {
        grundCode: LAGEN.schreibenFehlgeschlagen,
        datei: protokoll,
        grund: grundVon(err),
        geschriebeneDateien: [],
        angefuegteBelege: [],
        protokoll,
      }),
    );
  }

  // --- Nach der Marke: Schritte 4 und 5, nur vorwärts ---------------------------------

  // Keine Zeile hier entfernt eine Schattenkopie, stellt eine Zieldatei wieder
  // her oder schreibt einen alten Stand zurück (AK10; Quelltext-Wächter in
  // `test/unit/db-intent-log.test.js`). Ein Fehler lässt alles stehen, was der
  // Wiederanlauf braucht: Protokoll, übrige Schattenkopien und Sperren.
  async function vollende(bereichsWurzel, genommen, vorbereitet, marke) {
    const dateien = [];
    const angefuegt = [];
    const steht = (grundCode, mehr) =>
      abgewiesen(
        befund(LAGEN.teilweiseGeschrieben, {
          ...mehr,
          grundCode,
          geschriebeneDateien: [...dateien],
          angefuegteBelege: [...angefuegt],
          protokoll: marke.protokoll,
        }),
      );

    // Schritt 4: umbenennen, danach anfügen.
    for (const { von, nach, tabelle } of marke.umbenennungen) {
      try {
        await benenneUm(von, nach, { abstaende });
      } catch (err) {
        return steht(LAGEN.schreibenFehlgeschlagen, { tabelle, datei: nach, grund: grundVon(err) });
      }
      loeseSchattenkopie(von);
      dateien.push(nach);
    }
    for (const { pfad, text, tabelle } of marke.belege) {
      try {
        // Derselbe eine Anfüge-Aufruf wie `schreibeBeleg` (E10.7): kein Lesen,
        // kein Öffnen und Suchen davor.
        await fsp.appendFile(pfad, text, 'utf8');
      } catch (err) {
        return steht(LAGEN.belegFehlgeschlagen, { tabelle, datei: pfad, grund: grundVon(err) });
      }
      angefuegt.push(pfad);
    }

    // Schritt 5: Ein Protokoll, das nicht fort ist, ist weiterhin eine Marke;
    // dann bleiben auch die Sperren, damit der Wiederanlauf weiß, was er
    // freizugeben hat.
    try {
      await fsp.unlink(marke.protokoll);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') {
        return steht(LAGEN.schreibenFehlgeschlagen, {
          datei: marke.protokoll,
          grund: grundVon(err),
        });
      }
    }
    await gibZurueck(bereichsWurzel, genommen);
    return {
      ok: true,
      vorgang: vorbereitet.vorgang,
      dateien,
      belege: angefuegt,
      protokoll: null,
      ergebnis: vorbereitet.ergebnis,
    };
  }

  // --- Nach Schritt 5: Aufräumen in den Verzeichnissen ---------------------------------

  // 4T-001823 (Nachschärfung): die Gelegenheit zum Aufräumen, die auch der
  // gemeinsame Schreibweg nach jedem Ersetzen nutzt, einmal je Verzeichnis der
  // umbenannten Zieldateien und mit dessen Drossel. Entfernt werden dabei nur
  // gewöhnliche, zurückgebliebene Schattenkopien, nie die eines Auftrags. Ein
  // Fehler ist folgenlos, weil der Auftrag an dieser Stelle bereits gelungen ist.
  async function raeumeVerzeichnisseAuf(dateien) {
    for (const verzeichnis of new Set(dateien.map((pfad) => path.dirname(pfad)))) {
      try {
        await raeumeSchattenkopien(verzeichnis);
      } catch (err) {
        void err;
      }
    }
  }

  // --- Der Einstieg -------------------------------------------------------------------

  /**
   * Führt einen Auftrag ganz oder gar nicht aus (B5).
   *
   * @param {object} auftrag
   * @param {string} auftrag.bereichsWurzel Wurzelpfad des Bereichs.
   * @param {Array<object>} auftrag.sperren Die Sperr-Gegenstände des Auftrags.
   * @param {() => Promise<object>} auftrag.vorbereiten Läuft unter den Sperren;
   *   liefert `{ok: true, plan, vorgang, zeitpunkt, herkunft, ergebnis}` oder
   *   eine Abweisung, die unverändert zurückkommt. Jede Datei des Plans trägt
   *   `{pfad, tabelle, gelesen, neu}`, eine anzulegende dazu `anlegen: true`
   *   und `gelesen: null` (4T-001924).
   * @returns {Promise<object>} `{ok: true, vorgang, dateien, belege, protokoll:
   *   null, ergebnis}`; bei belegter Sperre `{ok: true, nichtGenommen: true,
   *   konflikt, gegenstand}`; sonst eine Abweisung in der Meldungs-Form der
   *   Schreib-Schnittstelle, nach der Marke mit der Lage «teilweise
   *   geschrieben» und dem Pfad des stehen gebliebenen Protokolls.
   */
  async function fuehreAuftragDurch({ bereichsWurzel, sperren, vorbereiten }) {
    if (typeof vorbereiten !== 'function') {
      throw new TypeError('fuehreAuftragDurch: vorbereiten ist kein Rückruf');
    }

    // Schritt 1: alle Sperren, bevor irgendetwas gelesen oder geschrieben ist.
    const genommen = await sperrVerwaltung.nimmGeordnet(bereichsWurzel, sperren);
    if (!genommen.ok) return genommen;
    if (!genommen.gehalten) {
      return {
        ok: true,
        nichtGenommen: true,
        konflikt: genommen.konflikt,
        gegenstand: genommen.gegenstand,
      };
    }
    const gehalten = genommen.genommen;

    let vorbereitet;
    try {
      vorbereitet = await vorbereiten();
      if (vorbereitet && vorbereitet.ok === true) pruefeVorbereitet(vorbereitet);
    } catch (err) {
      await gibZurueck(bereichsWurzel, gehalten);
      throw err;
    }
    // Eine Abweisung aus der Vorbereitung: Nichts ist geschrieben.
    if (!vorbereitet || vorbereitet.ok !== true) {
      await gibZurueck(bereichsWurzel, gehalten);
      return vorbereitet;
    }

    // Ein Auftrag, der nichts ändert, braucht keine Marke: Es gibt nichts, was
    // ganz oder gar nicht wirken könnte.
    if (vorbereitet.plan.dateien.length === 0 && vorbereitet.plan.belege.length === 0) {
      await gibZurueck(bereichsWurzel, gehalten);
      return {
        ok: true,
        vorgang: vorbereitet.vorgang,
        dateien: [],
        belege: [],
        protokoll: null,
        ergebnis: vorbereitet.ergebnis,
      };
    }

    // 4T-001824 (Befund 2): von hier bis zum Ende von Schritt 5 im Register der
    // laufenden Vorgänge, auch wenn ein Schritt wirft.
    const kennung = String(vorbereitet.vorgang);
    laufend.add(kennung);
    try {
      const marke = await setzeMarke(bereichsWurzel, gehalten, vorbereitet);
      if (!marke.ok) {
        if (!marke.sperrenHalten) await gibZurueck(bereichsWurzel, gehalten);
        return marke.ergebnis;
      }
      const ergebnis = await vollende(bereichsWurzel, gehalten, vorbereitet, marke);
      if (ergebnis.ok) await raeumeVerzeichnisseAuf(ergebnis.dateien);
      return ergebnis;
    } finally {
      laufend.delete(kennung);
    }
  }

  /**
   * Fährt diese Klammer den Vorgang gerade (4T-001824, Befund 2)?
   *
   * Der Wiederanlauf desselben Prozesses fragt das, bevor er die Sperren eines
   * Protokolls, dessen Halter dieser Prozess ist, als Hinterlassenschaft eines
   * gescheiterten Laufs zurückgibt.
   *
   * @param {number|string} vorgang Vorgangs-Kennung.
   * @returns {boolean}
   */
  function laeuft(vorgang) {
    return laufend.has(String(vorgang));
  }

  return { fuehreAuftragDurch, laeuft };
}

module.exports = {
  ABSICHT_SCHEMA_VERSION,
  ABSICHT_PRAEFIX,
  protokollName,
  erzeugeAbsichtsProtokoll,
};
