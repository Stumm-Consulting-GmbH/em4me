// 4T-001824 (Epic 3E-000254, E11.3, Bauplan B1 bis B6): Der Wiederanlauf eines
// liegengebliebenen Auftrags.
//
// **Die Klammer aus `intent-log.js` hinterlässt nach einem Abbruch genau eine
// von zwei Lagen.** Vor der Marke liegen höchstens Schattenkopien da, und es ist
// nichts geschehen. Nach der Marke steht ein vollständiges Protokoll im
// Sperr-Ordner, und der Auftrag ist vorbereitet, aber nicht zu Ende geführt.
// Beide Lagen sind aufräumbar; sie räumen sich aber nicht von selbst auf. Dieses
// Modul beantwortet drei Fragen: Liegt hier etwas? Darf ich es aufräumen? Was
// ist zu tun?
//
// **Aufgeräumt wird nur vorwärts und nur unter der Aufräum-Sperre** (B1). Sie
// ist eine Sperre der fünften Art in der einen Sperr-Verwaltung des Prozesses
// und erbt von ihr Frist, Bruch-Anspruch und Verwaisungs-Beurteilung (B2). Wer
// sie nicht bekommt, räumt nicht auf und wartet auch nicht: Zwei gleichzeitige
// Aufräumer wären genau der Fall, in dem eine Umbenennung zweimal ausgeführt
// und ein Beleg zweimal angefügt würde.
//
// **Jeder Schritt ist wiederholbar**, weil Erledigtes am Bestand erkannt wird
// und nicht an einem Fortschritts-Vermerk: Eine ausgeführte Umbenennung hat
// ihre Schattenkopie verbraucht, ein angefügter Beleg steht mit Vorgangs- und
// Datensatz-Kennung in der Beleg-Datei. Bricht der Wiederanlauf selbst ab,
// bleibt das Protokoll stehen, und der nächste führt zu Ende.
//
// **Es läuft kein Takt** (Entscheidung des Product Owners vom 2026-09-20). Die
// beiden Auslöser sind der nächste Auftrag an die Schreib-Schnittstelle und das
// Öffnen des Bereichs; einen dritten gibt es nicht, und ein Zeitgeber fehlt
// hier bewusst (Quelltext-Wächter in `test/unit/db-intent-recovery.test.js`).
//
// **Das Tor der Erweiterung prüft dieses Modul selbst**, anders als die
// Klammer: Das Öffnen des Bereichs ruft den Wiederanlauf auch bei
// ausgeschalteter Erweiterung, und dort gibt es keine Schreib-Schnittstelle,
// die davor stünde (E15.2; Nachweis in
// `test/unit/db-sperren-belege-aus-zustand.test.js`).
'use strict';

// 4T-001964: Vorgabe ist der frisch lesende Dateizugriff; unter einer Sperre
// liefert der Netzwerk-Client sonst den Stand vor dem Ersetzen durch einen
// anderen Rechner (Begründung in frisch-lesen.js).
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const path = require('node:path');

const { isInsideArea } = require('../area/area-path.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { nummerAus } = require('../../shared/database/record-identity.js');
const {
  RESTE_MINDESTALTER_MS,
  benenneUmMitWiederholung,
  istAbsichtsSchattenkopie,
  loeseSchattenkopie,
} = require('../documents/atomic-write.js');
const { ermittleHerkunft } = require('../herkunft.js');
const { ART_SWEEP, sperrDateiName, sperrOrdnerPfad } = require('./lock-store.js');
const { SPERR_FRIST_MS, VORGABE_PROZESS } = require('./lock-lifecycle.js');
const { belegPfadFuer, leseBelegDatei } = require('./change-log.js');
const { ABSICHT_PRAEFIX, ABSICHT_SCHEMA_VERSION, protokollName } = require('./intent-log.js');

// Die Endung des Protokolls, abgeleitet aus seiner Namensbildung und nicht ein
// zweites Mal hingeschrieben.
const ABSICHT_ENDUNG = protokollName('').slice(ABSICHT_PRAEFIX.length);

/**
 * Die Lagen eines Protokolls nach einem Wiederanlauf-Versuch. Sprachneutral;
 * die Schreib-Schnittstelle übersetzt eine hängende Lage in ihre Lage
 * `auftragHaengt`.
 */
const WIEDERANLAUF_LAGEN = Object.freeze({
  // Umbenennungen und Belege sind zu Ende geführt, Protokoll und Sperren fort.
  fertiggeschrieben: 'fertiggeschrieben',
  // Ein unvollständiges Protokoll eines nicht mehr lebenden Schreibers (B6):
  // Umbenannt war noch nichts, das Protokoll ist entfernt.
  verworfen: 'verworfen',
  // Die Aufräum-Sperre hält ein anderer.
  wirdAufgeraeumt: 'wirdAufgeraeumt',
  // Der Schreiber hält seine Sperren noch; er schreibt selbst zu Ende.
  schreiberLebt: 'schreiberLebt',
  // Eine im Protokoll genannte Datei fehlt, oder ein Pfad ist unbrauchbar.
  // Gelöscht wird dann nichts; das Protokoll bleibt stehen.
  unvollstaendig: 'unvollstaendig',
  // Ein Protokoll, das sich nicht lesen lässt, ohne als unvollständig erkannt
  // zu sein: ein Lesefehler oder eine fremde Schema-Version.
  nichtLesbar: 'nichtLesbar',
  // Eine Naht ist gescheitert. Das Protokoll bleibt stehen, der nächste
  // Wiederanlauf versucht es erneut.
  abgebrochen: 'abgebrochen',
});

const L = WIEDERANLAUF_LAGEN;
const ERLEDIGT = Object.freeze([L.fertiggeschrieben, L.verworfen]);
// 4T-001824 (Nachschärfung, Befund 1): Lagen, in denen ein anderer an dem
// Protokoll arbeitet, der Schreiber selbst oder ein Aufräumer. Sie hängen nur,
// wenn das Protokoll ohne lebenden Halter seiner Sperren liegt.
const IN_ARBEIT = Object.freeze([L.schreiberLebt, L.wirdAufgeraeumt]);

// Die Gründe, aus denen ein Protokoll nicht lesbar ist. Allein `inhalt` ist die
// Lage aus B6 (angelegt, aber nicht zu Ende geschrieben).
const UNLESBAR = Object.freeze({ inhalt: 'inhalt', schema: 'schema', lesen: 'lesen' });

/**
 * Liegt das Protokoll nach dem Versuch noch, ohne dass jemand es zu Ende
 * bringt? Dann nehmen die Tabellen, die es nennt, keine neuen Aufträge an
 * (Entscheidung des Product Owners vom 2026-09-20, B5).
 *
 * 4T-001824 (Nachschärfung, Befund 1): Arbeitet ein Lebender daran, der
 * Schreiber oder ein Aufräumer, hängt es nicht; die Sperren entscheiden, und
 * die Schnittstelle wartet wie bei jedem gleichzeitigen Auftrag. Lebend heißt
 * dabei: Jede Sperre des Protokolls liegt und hat einen lebenden Halter
 * (`ohneLebendenHalter` aus `raeumeAuf`). Fehlt eine oder ist ihr Halter fort,
 * nähme ein neuer Auftrag sie als Absturz-Rest und schriebe, bevor ein
 * späterer Wiederanlauf die ältere Fassung darüber benennt.
 *
 * @param {{lage: string, ohneLebendenHalter?: boolean}} ergebnis Ein Ergebnis
 *   aus `raeumeAuf`.
 * @returns {boolean}
 */
function haengtNoch(ergebnis) {
  if (!ergebnis || ERLEDIGT.includes(ergebnis.lage)) return false;
  if (IN_ARBEIT.includes(ergebnis.lage)) return ergebnis.ohneLebendenHalter === true;
  return true;
}

function grundVon(fehler) {
  return (fehler && fehler.code) || (fehler && fehler.message) || String(fehler);
}

function istObjekt(wert) {
  return !!wert && typeof wert === 'object' && !Array.isArray(wert);
}

// Trägt das Protokoll alles, was zum Fertigschreiben nötig ist? Geprüft wird
// die Form aus 4T-001823 (B4), nicht mehr; der Inhalt der Texte gehört der
// Schreib-Schnittstelle.
function istVollstaendig(wert, vorgangAusName) {
  if (!Number.isSafeInteger(wert.vorgang) || String(wert.vorgang) !== vorgangAusName) return false;
  const liste = (feld, pruefe) => Array.isArray(wert[feld]) && wert[feld].every(pruefe);
  return (
    liste(
      'umbenennungen',
      (u) => istObjekt(u) && typeof u.von === 'string' && typeof u.nach === 'string',
    ) &&
    liste(
      'belege',
      (b) => istObjekt(b) && typeof b.pfad === 'string' && typeof b.text === 'string',
    ) &&
    liste('sperren', istObjekt)
  );
}

// Die Tabellen eines Protokolls, wurzel-relativ, in der Reihenfolge seiner
// Sperren und ohne Doppelte.
function tabellenAus(inhalt) {
  const tabellen = [];
  for (const sperre of inhalt.sperren) {
    if (
      typeof sperre.tabelle === 'string' &&
      sperre.tabelle !== '' &&
      !tabellen.includes(sperre.tabelle)
    )
      tabellen.push(sperre.tabelle);
  }
  return tabellen;
}

// Der Vergleichs-Schlüssel eines Belegs: Vorgangs- und Datensatz-Kennung. Die
// Kennung in beiden Schreibweisen (`r-7`, `r-00007`) ergibt denselben Schlüssel.
function belegSchluessel(vorgang, id) {
  const nummer = typeof id === 'string' ? nummerAus(id) : null;
  const kennung = nummer !== null ? String(nummer) : id == null ? '' : String(id);
  return `${String(vorgang)}/${kennung}`;
}

/**
 * Erzeugt den Wiederanlauf.
 *
 * **Eine Instanz je Prozess, mit derselben Sperr-Verwaltung wie die Klammer**
 * (Verdrahtung in `src/main/app/wiring.js`).
 *
 * @param {object} deps Nähte.
 * @param {object} deps.sperrVerwaltung **Pflicht.** Die Sperr-Verwaltung des
 *   Prozesses mit `nimm`, `brich`, `nimmGeordnet`, `gibZurueck` und
 *   `lebendeSperren`.
 * @param {(rootPath: string) => Promise<object|undefined>} deps.leseKonfig
 *   **Pflicht.** Leser der Bereichs-Konfiguration (Ort des Sperr-Ordners).
 * @param {() => boolean} [deps.erweiterungAktiv] Das Tor der Erweiterung
 *   «database», bei jedem Aufruf frisch gefragt. **Fail-closed:** Fehlt die
 *   Naht, gilt die Erweiterung als ausgeschaltet.
 * @param {object} [deps.fsp] Dateizugriff.
 * @param {Function} [deps.benenneUm] Umbenennen; Vorgabe ist die gemessene
 *   Wiederhol-Schleife des gemeinsamen Schreibwegs.
 * @param {number[]} [deps.abstaende] Wiederhol-Fenster des Umbenennens.
 * @param {() => number} [deps.uhr] Jetzt in Millisekunden (Alter von
 *   Schattenkopien und unvollständigen Protokollen).
 * @param {() => object} [deps.herkunft] Benutzer und Rechner dieses Prozesses.
 * @param {(pid: number) => boolean} [deps.prozessLebt] Lebend-Prüfung, Vorgabe
 *   wie in der Sperr-Verwaltung.
 * @param {(vorgang: number|string) => boolean} [deps.laeuft] Fährt die Klammer
 *   dieses Prozesses den Vorgang gerade (4T-001824, Befund 2)? Vorgabe: nie.
 * @returns {{findeProtokolle: Function, raeumeAuf: Function,
 *   entsorgeVerwaisteSchattenkopien: Function}}
 */
function erzeugeWiederanlauf(deps) {
  const d = istObjekt(deps) ? deps : {};
  const verwaltung = d.sperrVerwaltung;
  const zugriffe = ['nimm', 'brich', 'nimmGeordnet', 'gibZurueck', 'lebendeSperren'];
  if (!verwaltung || zugriffe.some((name) => typeof verwaltung[name] !== 'function')) {
    throw new TypeError(
      `erzeugeWiederanlauf: sperrVerwaltung ist Pflicht und muss ${zugriffe.join(', ')} tragen`,
    );
  }
  // Fail-closed wie Klammer und Sperr-Speicher: Ohne den Leser ist der
  // Sperr-Ordner nicht bestimmbar.
  if (typeof d.leseKonfig !== 'function') {
    throw new TypeError('erzeugeWiederanlauf: leseKonfig ist Pflicht');
  }
  for (const naht of [
    'erweiterungAktiv',
    'benenneUm',
    'uhr',
    'herkunft',
    'prozessLebt',
    'laeuft',
  ]) {
    if (d[naht] !== undefined && typeof d[naht] !== 'function') {
      throw new TypeError(`erzeugeWiederanlauf: ${naht} ist kein Rückruf`);
    }
  }
  if (d.abstaende !== undefined && !Array.isArray(d.abstaende)) {
    throw new TypeError('erzeugeWiederanlauf: abstaende ist keine Liste von Wartezeiten');
  }
  const leseKonfig = d.leseKonfig;
  const tor = d.erweiterungAktiv || (() => false);
  const fsp = d.fsp || frischerDateizugriff;
  const benenneUm = d.benenneUm || benenneUmMitWiederholung;
  const abstaende = d.abstaende;
  const uhr = d.uhr || Date.now;
  const herkunft = d.herkunft || ermittleHerkunft;
  const prozessLebt = d.prozessLebt || VORGABE_PROZESS.lebt;
  const laeuft = d.laeuft || (() => false);

  // Bei jedem Aufruf frisch gefragt, wie in der Schreib-Schnittstelle.
  function torZu() {
    return tor() !== true;
  }

  async function existiert(pfad) {
    try {
      await fsp.stat(pfad);
      return true;
    } catch (err) {
      if (err && err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async function entferne(pfad) {
    try {
      await fsp.unlink(pfad);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }

  // --- Finden --------------------------------------------------------------------------

  // Liest ein Protokoll. «Fort» ist keine Lage, sondern ein Normalfall: Der
  // Schreiber oder ein anderer Aufräumer war schneller.
  async function leseProtokoll(pfad, vorgangAusName) {
    let roh;
    try {
      roh = await fsp.readFile(pfad, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return { fort: true };
      return { lesbar: false, grund: UNLESBAR.lesen, halter: null };
    }
    let wert;
    try {
      wert = JSON.parse(roh);
    } catch {
      // Abgerissen: Das exklusive Anlegen schreibt den Inhalt nicht atomar (B6).
      return { lesbar: false, grund: UNLESBAR.inhalt, halter: null };
    }
    if (!istObjekt(wert)) return { lesbar: false, grund: UNLESBAR.inhalt, halter: null };
    const halter = istObjekt(wert.halter) ? wert.halter : null;
    // Eine andere Schema-Version ist kein abgerissenes Protokoll, sondern ein
    // vollständiges einer anderen Programm-Fassung; es wird nie verworfen.
    if (wert.schemaVersion !== ABSICHT_SCHEMA_VERSION) {
      const fremd = Number.isInteger(wert.schemaVersion);
      return { lesbar: false, grund: fremd ? UNLESBAR.schema : UNLESBAR.inhalt, halter };
    }
    if (!istVollstaendig(wert, vorgangAusName)) {
      return { lesbar: false, grund: UNLESBAR.inhalt, halter };
    }
    return { lesbar: true, inhalt: wert };
  }

  /**
   * Findet die liegengebliebenen Protokolle eines Bereichs. Wirft nie.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @returns {Promise<{ok: true, protokolle: Array<{pfad: string, vorgang: string,
   *   lesbar: boolean, inhalt: object|null, grund?: string}>}|{ok: false, code: string,
   *   error: string}>}
   */
  async function findeProtokolle(bereichsWurzel) {
    let namen;
    let ordner;
    try {
      ordner = await sperrOrdnerPfad(bereichsWurzel, { leseKonfig });
      namen = await fsp.readdir(ordner);
    } catch (err) {
      // Vor der ersten Sperre gibt es den Ordner nicht; das ist kein Fehler.
      if (err && err.code === 'ENOENT') return { ok: true, protokolle: [] };
      return { ok: false, code: 'wiederanlaufOrdnerUnlesbar', error: grundVon(err) };
    }
    const protokolle = [];
    for (const name of namen) {
      if (!name.startsWith(ABSICHT_PRAEFIX) || !name.endsWith(ABSICHT_ENDUNG)) continue;
      const vorgang = name.slice(ABSICHT_PRAEFIX.length, name.length - ABSICHT_ENDUNG.length);
      if (vorgang === '') continue;
      const pfad = path.join(ordner, name);
      const gelesen = await leseProtokoll(pfad, vorgang);
      if (gelesen.fort) continue;
      protokolle.push({
        pfad,
        vorgang,
        lesbar: gelesen.lesbar,
        inhalt: gelesen.lesbar ? gelesen.inhalt : null,
        ...(gelesen.lesbar ? {} : { grund: gelesen.grund }),
      });
    }
    return { ok: true, protokolle };
  }

  // --- Die Aufräum-Sperre (B1, B2) -------------------------------------------------------

  // Genommen wird über die Verwaltung. Einen Absturz-Rest desselben Rechners
  // löst `nimm` selbst einmal ab; eine fremde, abgelaufene Sperre wird einmal
  // gebrochen, und `brich` prüft die Frist dabei selbst. Eine Schleife gibt es
  // nicht, und gewartet wird nicht.
  async function nimmAufraeumSperre(bereichsWurzel, gegenstand) {
    const erste = await verwaltung.nimm(bereichsWurzel, gegenstand);
    if (!erste.ok || erste.gehalten) return erste;
    const konflikt = erste.konflikt;
    if (konflikt && !konflikt.eigenerProzess && konflikt.abgelaufen) {
      return verwaltung.brich(bereichsWurzel, gegenstand, konflikt.stand);
    }
    return erste;
  }

  // 4T-001824 (Nachschärfung, Befund 3): Die Sperren eines Protokolls unter der
  // Aufräum-Sperre bekommen dieselbe Behandlung wie diese selbst. Meldet das
  // geordnete Nehmen eine fremde, abgelaufene Sperre, wird sie gebrochen und das
  // Nehmen wiederholt, bis es gelingt oder an einer lebenden Sperre scheitert.
  // Die gebrochene Sperre geht vor der Wiederholung zurück, weil das geordnete
  // Nehmen eine eigene gehaltene sonst als Konflikt meldete.
  //
  // **Begrenzt, keine offene Schleife:** höchstens so viele Durchgänge, wie das
  // Protokoll Sperren trägt, plus einer. Jeder Bruch trifft eine andere Sperre,
  // denn eine gebrochene ist danach frei; ein Auftrag eines abgestürzten fremden
  // Rechners über zwei Tabellen ist so in einem Lauf fertig statt in vier.
  async function nimmProtokollSperren(bereichsWurzel, sperren) {
    const obergrenze = sperren.length + 1;
    let ergebnis = await verwaltung.nimmGeordnet(bereichsWurzel, sperren);
    for (let durchgang = 1; durchgang < obergrenze; durchgang += 1) {
      const konflikt = ergebnis.ok && !ergebnis.gehalten ? ergebnis.konflikt : null;
      if (!konflikt || konflikt.eigenerProzess || !konflikt.abgelaufen) return ergebnis;
      const gegenstand = ergebnis.gegenstand;
      const gebrochen = await verwaltung.brich(bereichsWurzel, gegenstand, konflikt.stand);
      if (gebrochen.ok && gebrochen.gehalten)
        await verwaltung.gibZurueck(bereichsWurzel, [gegenstand]);
      ergebnis = await verwaltung.nimmGeordnet(bereichsWurzel, sperren);
    }
    return ergebnis;
  }

  // --- Nach der Marke: zu Ende schreiben (AK4, AK5, AK9) --------------------------------

  // Der erste Pfad des Protokolls, an dem nichts geschrieben werden darf: außerhalb
  // des Bereichs, eine Schattenkopie ohne Absichts-Marke oder in einem anderen
  // Verzeichnis als ihr Ziel, eine Datei, die keine Beleg-Datei ist.
  function unbrauchbarerPfad(bereichsWurzel, inhalt) {
    const drinnen = (p) => path.isAbsolute(p) && isInsideArea(bereichsWurzel, p);
    for (const { von, nach } of inhalt.umbenennungen) {
      if (!drinnen(von)) return von;
      if (!drinnen(nach) || path.dirname(von) !== path.dirname(nach)) return nach;
      if (!istAbsichtsSchattenkopie(path.basename(von))) return von;
    }
    for (const { pfad } of inhalt.belege) {
      // Die Beleg-Datei ist ihre eigene Begleit-Datei; nur dann liest
      // `leseBelegDatei` genau sie.
      if (!drinnen(pfad) || belegPfadFuer(pfad) !== pfad) return pfad;
    }
    return null;
  }

  // Erledigt ist eine Umbenennung, deren Schattenkopie fort und deren Ziel da
  // ist. Fehlt beides, ist das Protokoll nicht mehr zu Ende zu führen.
  async function benenneRestUm(umbenennungen) {
    const zahlen = { ausgefuehrt: 0, uebersprungen: 0 };
    for (const { von, nach } of umbenennungen) {
      if (await existiert(von)) {
        await benenneUm(von, nach, { abstaende });
        loeseSchattenkopie(von);
        zahlen.ausgefuehrt += 1;
      } else if (await existiert(nach)) {
        zahlen.uebersprungen += 1;
      } else {
        return { ok: false, pfad: von };
      }
    }
    return { ok: true, zahlen };
  }

  // Die intakten Belege einer Beleg-Datei, gezählt je Vorgangs- und
  // Datensatz-Kennung. Ein beschädigter Beleg zählt nicht: Ein beim Absturz
  // abgerissenes Anfügen ist nicht angefügt.
  async function zaehleBelege(pfad) {
    const gelesen = await leseBelegDatei(pfad, { fsp });
    if (!gelesen.ok) throw Object.assign(new Error(gelesen.error), { code: gelesen.code });
    const zahl = new Map();
    for (const beleg of gelesen.belege) {
      if (beleg.beschaedigt) continue;
      const schluessel = belegSchluessel(beleg.vorgang, beleg.id);
      zahl.set(schluessel, (zahl.get(schluessel) || 0) + 1);
    }
    return zahl;
  }

  // **Kein doppelter Beleg** (AK5). Gelesen wird je Beleg-Datei einmal, vor dem
  // ersten Anfügen dieses Laufs. Die Klammer fügt in der Reihenfolge des
  // Protokolls an; stehen also k Belege mit derselben Vorgangs- und
  // Datensatz-Kennung in der Datei, sind es die ersten k des Protokolls mit
  // diesen Kennungen. Gezählt statt bloß gesucht wird, weil ein Auftrag unter
  // einer Kennung zwei Belege desselben Datensatzes tragen kann: den Beleg einer
  // Fremd-Änderung und den gewöhnlichen danach (4T-001822).
  async function fuegeRestAn(belege) {
    const zahlen = { angefuegt: 0, uebersprungen: 0 };
    const vorhanden = new Map();
    for (const { pfad, text, tx, id } of belege) {
      if (!vorhanden.has(pfad)) vorhanden.set(pfad, await zaehleBelege(pfad));
      const zahl = vorhanden.get(pfad);
      const schluessel = belegSchluessel(tx, id);
      const rest = zahl.get(schluessel) || 0;
      if (rest > 0) {
        zahl.set(schluessel, rest - 1);
        zahlen.uebersprungen += 1;
        continue;
      }
      // Derselbe eine Anfüge-Aufruf wie in der Klammer.
      await fsp.appendFile(pfad, text, 'utf8');
      zahlen.angefuegt += 1;
    }
    return zahlen;
  }

  async function schreibeZuEnde(bereichsWurzel, gefunden, inhalt, gehalten, ergebnis) {
    const tabellen = tabellenAus(inhalt);
    const falsch = unbrauchbarerPfad(bereichsWurzel, inhalt);
    if (falsch !== null) return ergebnis(L.unvollstaendig, { tabellen, pfad: falsch });

    // 4T-001824 (Befund 2): Sperren, die ein gescheiterter Lauf DIESES Prozesses
    // hinterlassen hat, stehen im eigenen Register und gälten beim Nehmen als
    // Konflikt. Sie werden zuerst zurückgegeben und dann neu genommen.
    if (istEigenerRest(inhalt)) await verwaltung.gibZurueck(bereichsWurzel, inhalt.sperren);
    const genommen = await nimmProtokollSperren(bereichsWurzel, inhalt.sperren);
    if (!genommen.ok) return ergebnis(L.abgebrochen, { tabellen, grund: genommen.code || null });
    if (!genommen.gehalten) return ergebnis(L.schreiberLebt, { tabellen });
    gehalten.push(...genommen.genommen);

    // Unter allen Sperren ist entschieden, ob der Schreiber noch lebt: Er hält
    // sie, solange sein Protokoll liegt. Ist es jetzt fort, hat er selbst zu
    // Ende geschrieben, und ein Lauf auf dem vorhin gelesenen Stand fügte
    // womöglich einen längst verdichteten Beleg erneut an.
    const jetzt = await leseProtokoll(gefunden.pfad, gefunden.vorgang);
    if (jetzt.fort) return ergebnis(L.fertiggeschrieben, { tabellen, bereitsFort: true });
    if (!jetzt.lesbar) return ergebnis(L.abgebrochen, { tabellen, grund: jetzt.grund });

    const umbenannt = await benenneRestUm(jetzt.inhalt.umbenennungen);
    if (!umbenannt.ok) return ergebnis(L.unvollstaendig, { tabellen, pfad: umbenannt.pfad });
    const angefuegt = await fuegeRestAn(jetzt.inhalt.belege);
    await entferne(gefunden.pfad);
    return ergebnis(L.fertiggeschrieben, {
      tabellen,
      umbenennungen: umbenannt.zahlen,
      belege: angefuegt,
    });
  }

  // --- Unvollständiges Protokoll (B6) ------------------------------------------------------

  // Der Halter aus dem Protokoll, beurteilt nach der Regel der Sperr-Verwaltung
  // für einen Absturz-Rest: derselbe Rechner, eine Prozess-Nummer, die nicht mehr
  // lebt. Die eigene Nummer gilt hier als lebend, denn ein Protokoll kennt kein
  // Eigen-Register, und die Klammer dieses Prozesses kann es gerade schreiben.
  function halterIstFort(halter) {
    if (!istDieserRechner(halter) || halter.pid === process.pid) return false;
    return !prozessLebt(halter.pid);
  }

  // Derselbe Rechner (ohne Groß-Kleinschreibung, wie in der Sperr-Verwaltung)
  // und eine Prozess-Nummer.
  function istDieserRechner(halter) {
    if (!halter || typeof halter.rechner !== 'string' || !Number.isInteger(halter.pid))
      return false;
    const eigen = herkunft();
    const rechner = eigen && typeof eigen.rechner === 'string' ? eigen.rechner.trim() : '';
    return rechner !== '' && halter.rechner.trim().toLowerCase() === rechner.toLowerCase();
  }

  // 4T-001824 (Befund 2): Ist das Protokoll die Hinterlassenschaft eines
  // gescheiterten Laufs dieses Prozesses? Halter ist dieser Prozess, und die
  // Klammer fährt den Vorgang nicht mehr.
  function istEigenerRest(inhalt) {
    return (
      istObjekt(inhalt.halter) &&
      istDieserRechner(inhalt.halter) &&
      inhalt.halter.pid === process.pid &&
      !laeuft(inhalt.vorgang)
    );
  }

  // 4T-001824 (Nachschärfung, Befund 1): Liegt ein lesbares Protokoll, an dem ein
  // anderer arbeitet, ohne lebenden Halter seiner Sperren? Wahr, wenn eine
  // seiner Sperren fehlt oder keinen lebenden Halter hat; eine Sperre dieses
  // Prozesses zählt als lebend nur, solange seine Klammer den Vorgang fährt. Die Sperren werden VOR dem
  // Protokoll gelesen: Schreiber wie Aufräumer löschen das Protokoll, bevor sie
  // freigeben; fehlt eine Sperre und ist das Protokoll danach fort, ist er fertig.
  async function ohneLebendenHalter(bereichsWurzel, gefunden) {
    const inhalt = gefunden.inhalt;
    const lebend = await verwaltung.lebendeSperren(bereichsWurzel);
    let alle = lebend.ok;
    if (alle) {
      // Eine Sperre im eigenen Register ist nur lebend, solange die Klammer den
      // Vorgang fährt; sonst ist sie die Hinterlassenschaft eines gescheiterten
      // Laufs (Befund 2).
      const rest = istEigenerRest(inhalt);
      const namen = new Set(
        lebend.sperren
          .filter((s) => !(rest && s.konflikt.eigenerProzess))
          .map((s) => path.basename(s.pfad)),
      );
      alle = inhalt.sperren.every((s) => {
        const benannt = sperrDateiName(bereichsWurzel, s);
        return benannt.ok && namen.has(benannt.name);
      });
    }
    if (alle) return false;
    return existiert(gefunden.pfad);
  }

  async function istAelterAlsFrist(pfad) {
    try {
      return uhr() - (await fsp.stat(pfad)).mtimeMs >= SPERR_FRIST_MS;
    } catch (err) {
      // Ohne Alter kein Verwerfen: Im Zweifel bleibt das Protokoll liegen.
      void err;
      return false;
    }
  }

  // Ein unvollständiges Protokoll heißt sicher «noch nichts umbenannt»; es wird
  // nur verworfen, wenn sein Schreiber nicht mehr lebt. Solange er lebt, hält er
  // seine Sperren, und hier geschieht nichts.
  async function behandleUnlesbar(bereichsWurzel, gefunden, gelesen, ergebnis) {
    if (gelesen.grund !== UNLESBAR.inhalt) return ergebnis(L.nichtLesbar, { grund: gelesen.grund });
    const lebend = await verwaltung.lebendeSperren(bereichsWurzel);
    if (!lebend.ok) return ergebnis(L.abgebrochen, { grund: lebend.code || null });
    // Die eigene Aufräum-Sperre dieses Protokolls zählt nicht; jede andere
    // lebende Sperre kann die des Schreibers sein.
    const andere = lebend.sperren.filter(
      (s) => !(s.gegenstand.art === ART_SWEEP && s.gegenstand.id === gefunden.vorgang),
    );
    if (andere.length > 0) return ergebnis(L.schreiberLebt, { grund: gelesen.grund });
    if (!(await istAelterAlsFrist(gefunden.pfad)) && !halterIstFort(gelesen.halter)) {
      return ergebnis(L.schreiberLebt, { grund: gelesen.grund });
    }
    await entferne(gefunden.pfad);
    return ergebnis(L.verworfen, { grund: gelesen.grund });
  }

  // --- Ein Protokoll --------------------------------------------------------------------

  // 4T-001824 (Nachschärfung, Befund 1): Arbeitet ein anderer an dem Protokoll,
  // wird NACH dem Zurückgeben der eigenen Sperren festgestellt, ob es ohne
  // lebenden Halter liegt. Geprüft wird am zuletzt gelesenen Inhalt; ein Fehler
  // dabei gilt als «ohne lebenden Halter», also im Zweifel als hängend.
  async function raeumeEinesAuf(bereichsWurzel, gefunden) {
    const bekannt = { inhalt: gefunden.lesbar ? gefunden.inhalt : null };
    const ergebnis = await versucheEines(bereichsWurzel, gefunden, bekannt);
    if (!IN_ARBEIT.includes(ergebnis.lage) || bekannt.inhalt === null) return ergebnis;
    let ohne;
    try {
      ohne = await ohneLebendenHalter(bereichsWurzel, {
        pfad: gefunden.pfad,
        inhalt: bekannt.inhalt,
      });
    } catch (err) {
      void err;
      ohne = true;
    }
    return { ...ergebnis, ohneLebendenHalter: ohne };
  }

  async function versucheEines(bereichsWurzel, gefunden, bekannt) {
    const basis = {
      vorgang: gefunden.lesbar ? gefunden.inhalt.vorgang : gefunden.vorgang,
      protokoll: gefunden.pfad,
      tabellen: gefunden.lesbar ? tabellenAus(gefunden.inhalt) : [],
    };
    const ergebnis = (lage, mehr) => ({ ...basis, lage, ...mehr });
    // Alles, was dieser Lauf hält, in Nahme-Reihenfolge: zuerst die
    // Aufräum-Sperre, dann die Sperren des Protokolls. Zurückgegeben wird in
    // umgekehrter Reihenfolge, auch nach einem Wurf (AK9).
    const gehalten = [];
    try {
      const aufraeumen = { art: ART_SWEEP, id: gefunden.vorgang };
      const genommen = await nimmAufraeumSperre(bereichsWurzel, aufraeumen);
      if (!genommen.ok) return ergebnis(L.abgebrochen, { grund: genommen.code || null });
      if (!genommen.gehalten) return ergebnis(L.wirdAufgeraeumt);
      gehalten.push(aufraeumen);

      // Unter der Aufräum-Sperre frisch gelesen: Ein eben noch halb
      // geschriebenes Protokoll kann inzwischen vollständig sein.
      const gelesen = await leseProtokoll(gefunden.pfad, gefunden.vorgang);
      if (gelesen.fort) return ergebnis(L.fertiggeschrieben, { bereitsFort: true });
      if (!gelesen.lesbar)
        return await behandleUnlesbar(bereichsWurzel, gefunden, gelesen, ergebnis);
      bekannt.inhalt = gelesen.inhalt;
      return await schreibeZuEnde(bereichsWurzel, gefunden, gelesen.inhalt, gehalten, ergebnis);
    } catch (err) {
      return ergebnis(L.abgebrochen, { grund: grundVon(err) });
    } finally {
      if (gehalten.length > 0) {
        try {
          await verwaltung.gibZurueck(bereichsWurzel, gehalten);
        } catch (err) {
          // Eine nicht entfernbare Sperre bleibt liegen und wird nach den
          // Regeln der Verwaltung beurteilt; das Ergebnis dieses Laufs steht.
          void err;
        }
      }
    }
  }

  // --- Vor der Marke: Schattenkopien entsorgen (AK6) -------------------------------------

  /**
   * Entsorgt Absichts-Schattenkopien, die kein lesbares Protokoll mehr nennt
   * und die älter sind als das Mindestalter des gewöhnlichen Aufräumens (B6).
   *
   * Eine fremde Datei fällt am vollständigen Namensmuster heraus, die Zieldatei
   * ebenso. Liegt ein Protokoll, das nicht als unvollständig erkannt, sondern
   * nicht zu lesen ist, wird nichts entfernt: Es kann Schattenkopien nennen,
   * die noch gebraucht werden.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {string[]} verzeichnisse Zu durchsuchende Verzeichnisse im Bereich.
   * @returns {Promise<{ok: boolean, entfernt: string[]}>}
   */
  async function entsorgeVerwaisteSchattenkopien(bereichsWurzel, verzeichnisse) {
    const entfernt = [];
    if (torZu()) return { ok: true, entfernt };
    const gefunden = await findeProtokolle(bereichsWurzel);
    if (!gefunden.ok) return { ok: false, code: gefunden.code, entfernt };
    if (gefunden.protokolle.some((p) => !p.lesbar && p.grund !== UNLESBAR.inhalt)) {
      return { ok: true, entfernt, zurueckgestellt: true };
    }
    const genannt = new Set();
    for (const p of gefunden.protokolle) {
      if (p.lesbar) for (const { von } of p.inhalt.umbenennungen) genannt.add(pathCompareKey(von));
    }
    const jetzt = uhr();
    const gesehen = new Set();
    for (const verzeichnis of verzeichnisse) {
      if (typeof verzeichnis !== 'string' || !isInsideArea(bereichsWurzel, verzeichnis)) continue;
      if (gesehen.has(pathCompareKey(verzeichnis))) continue;
      gesehen.add(pathCompareKey(verzeichnis));
      let namen;
      try {
        namen = await fsp.readdir(verzeichnis);
      } catch (err) {
        // Verzeichnis fort oder nicht lesbar: nichts zu entsorgen.
        void err;
        continue;
      }
      for (const name of namen) {
        if (!istAbsichtsSchattenkopie(name)) continue;
        const voll = path.join(verzeichnis, name);
        if (genannt.has(pathCompareKey(voll))) continue;
        try {
          if (jetzt - (await fsp.stat(voll)).mtimeMs < RESTE_MINDESTALTER_MS) continue;
          await fsp.unlink(voll);
          entfernt.push(voll);
        } catch (err) {
          // Schon fort oder gehalten: Der nächste Lauf sieht erneut nach.
          void err;
        }
      }
    }
    return { ok: true, entfernt };
  }

  // --- Der Einstieg ---------------------------------------------------------------------

  /**
   * Räumt alle liegengebliebenen Protokolle eines Bereichs auf, jedes einzeln
   * unter seiner Aufräum-Sperre, und entsorgt danach verwaiste
   * Absichts-Schattenkopien. Wirft nie; ein gescheiterter Versuch lässt das
   * Protokoll für den nächsten stehen.
   *
   * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
   * @param {{verzeichnisse?: string[]}} [optionen] Weitere Verzeichnisse für das
   *   Entsorgen, etwa die der Tabellen eines Auftrags (4T-001824, Nachschärfung):
   *   Ein Abbruch vor der Marke hinterlässt kein Protokoll, das sie nennte.
   * @returns {Promise<{ok: true, ergebnisse: Array<object>, entsorgt: string[],
   *   erweiterungAus?: boolean}|{ok: false, code: string, error: string}>} Je
   *   Protokoll `{vorgang, protokoll, lage, tabellen, …}`.
   */
  async function raeumeAuf(bereichsWurzel, optionen) {
    if (torZu()) return { ok: true, erweiterungAus: true, ergebnisse: [], entsorgt: [] };
    const gefunden = await findeProtokolle(bereichsWurzel);
    if (!gefunden.ok) return gefunden;
    const ergebnisse = [];
    const zusaetzlich = istObjekt(optionen) ? optionen.verzeichnisse : undefined;
    const verzeichnisse = [bereichsWurzel, ...(Array.isArray(zusaetzlich) ? zusaetzlich : [])];
    for (const protokoll of gefunden.protokolle) {
      ergebnisse.push(await raeumeEinesAuf(bereichsWurzel, protokoll));
      if (protokoll.lesbar)
        for (const { nach } of protokoll.inhalt.umbenennungen)
          verzeichnisse.push(path.dirname(nach));
    }
    const entsorgt = await entsorgeVerwaisteSchattenkopien(bereichsWurzel, verzeichnisse);
    return { ok: true, ergebnisse, entsorgt: entsorgt.entfernt };
  }

  return { findeProtokolle, raeumeAuf, entsorgeVerwaisteSchattenkopien };
}

module.exports = { WIEDERANLAUF_LAGEN, haengtNoch, erzeugeWiederanlauf };
