// 4T-001789 (Epic 3E-000255): Das Mitziehen der Begleit-Dateien beim
// Umbenennen und Verschieben.
//
// Bis hierher war das eine einzelne, für die Dokument-Begleitdatei
// programmierte Stelle in link-update.js: Pfad bilden, Zugriff prüfen,
// umbenennen, und alles davon in einem try mit einem LEEREN catch. Dieser
// catch fing zwei grundverschiedene Fälle mit demselben Schweigen — es gibt
// keine Begleitdatei (der Normalfall), und es gibt eine, sie lässt sich aber
// nicht bewegen (ein Fehler).
//
// Für die Dokument-Begleitdatei war das Schweigen vertretbar, weil der
// Hash-Abgleich der Historie eine verwaiste .mdd abfängt. Für die Beleg-Datei
// gibt es keinen solchen Auffang: Bleibt sie beim alten Namen zurück, findet
// sie niemand wieder, und am neuen Namen beginnt eine zweite Kette ohne
// Vorgeschichte. Ein Beleg ist nicht regenerierbar.
//
// Daraus folgen die drei Eigenschaften dieses Moduls:
//
//   1. Eine LISTE von Begleit-Datei-Arten statt einer Stelle je Art. Die
//      Mechanik hängt an der Datei NEBEN der bewegten Datei und nicht an
//      deren Art: Ob eine .md-Datei eine Tabellen-Datei ist, muss sie nicht
//      wissen, denn mitgezogen wird, was daneben liegt.
//   2. Das Merkmal `pflicht` trennt die beiden Fälle. Eine Pflicht-Art, die
//      sich nicht bewegen lässt, lässt das Umbenennen als Ganzes scheitern
//      (Entscheidung des Product Owners vom 2026-09-18, Weg a); eine
//      Nicht-Pflicht-Art behält ihr heutiges Verhalten und bekommt allein
//      einen Protokoll-Eintrag.
//   3. Jede Bewegung läuft über die Wiederhol-Schleife des gemeinsamen
//      Schreibwegs, die Rücknahme eingeschlossen. Ein stiller Fehlschlag der
//      Rücknahme hinterließe genau den Zustand, den die Entscheidung
//      vermeiden soll.
//
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');

const { MDD_EXT, MDDL_EXT, companionPathFor } = require('../../shared/markdown-data-family');
const { benenneUmMitWiederholung } = require('./atomic-write');

// Die Begleit-Datei-Arten. `pflicht` sagt, ob ein nicht bewegbares Exemplar
// das Umbenennen scheitern lässt.
//
// Die Dokument-Begleitdatei bleibt bewusst ohne Pflicht: Ihr Auffang besteht,
// und eine Änderung dort gehörte in einen eigenen Vorgang.
const BEGLEIT_ARTEN = Object.freeze([
  Object.freeze({ endung: MDD_EXT, pflicht: false }),
  Object.freeze({ endung: MDDL_EXT, pflicht: true }),
]);

// Die drei Fehlschlag-Kennungen dieses Moduls. Sie reisen unverändert bis in
// die Oberfläche; wer sie dort abbildet, liest sie von hier.
const BEGLEIT_CODES = Object.freeze(['companion', 'companion-exists', 'companion-rollback']);

// Pflicht-Arten zuerst. Scheitert eine von ihnen, ist bis dahin so wenig
// bewegt wie möglich, und die Rücknahme bleibt entsprechend kurz.
function artenInBewegungsfolge() {
  return [...BEGLEIT_ARTEN].sort((a, b) => Number(b.pflicht) - Number(a.pflicht));
}

function fehlerText(err) {
  return err && err.message ? String(err.message) : String(err);
}

// Liegt an diesem Pfad eine Datei?
async function liegtDa(pfad) {
  try {
    await fs.access(pfad);
    return true;
  } catch {
    return false;
  }
}

// Ist die Quelle vorhanden? Ausschließlich ENOENT heißt «nicht vorhanden»
// und ist kein Fehler. Jeder andere Zugriffsfehler heißt, dass wir es nicht
// wissen; dann wird bewegt statt übergangen, und der Umbenenn-Versuch nennt
// den wirklichen Grund. Ein Übergehen im Zweifel wäre genau der stille
// Fehlschlag, gegen den dieses Modul gebaut ist.
async function quelleVorhanden(pfad) {
  try {
    await fs.access(pfad);
    return true;
  } catch (err) {
    return !(err && err.code === 'ENOENT');
  }
}

// Ist die Bewegung eine reine Änderung der Groß-Klein-Schreibung desselben
// Pfads? Dann liegt am «Ziel» die Quelle selbst, und eine Kollisions-Prüfung
// würde die Bewegung ohne Grund abweisen (dieselbe Ausnahme wie die
// Kollisions-Prüfung der Umbenennen-Kaskade in ipc/rename.js).
function nurGrossKlein(von, nach) {
  return String(von).toLowerCase() === String(nach).toLowerCase();
}

// 4T-001800 (Epic 3E-000255): Dieselbe Liste für den Lösch-Weg.
//
// Der Papierkorb bewegt nichts, er nimmt weg; die Bewegungs-Funktion unten
// passt dafür nicht. Gemeinsam ist beiden Wegen aber die eigentliche Aussage
// dieses Moduls: WELCHE Datei neben einer Datei mitgeht. Deshalb liegt die
// Auskunft hier und nicht im Kanal, der löscht. Sonst kennte er die Endung ein
// zweites Mal, und die nächste Pflicht-Art käme an einem von zwei Orten an.
/**
 * Die vorhandenen Pflicht-Begleit-Pfade neben einer Datei.
 *
 * Geliefert werden allein die Pflicht-Arten. Eine Nicht-Pflicht-Art behält ihr
 * eigenes Verhalten, und für die Begleitdatei der Dokument-Historie heißt das:
 * Sie bleibt liegen, weil ihr Auffang besteht und eine Änderung dort in einen
 * eigenen Vorgang gehört.
 *
 * «Nicht vorhanden» meint ausschließlich ENOENT (siehe `quelleVorhanden`). Ein
 * anderer Zugriffsfehler heißt, dass wir es nicht wissen; dann wird der Pfad
 * genannt, und der eigentliche Vorgang nennt den wirklichen Grund, statt den
 * Fall stillschweigend zu übergehen.
 *
 * @param {string} dateiPfad Pfad der Datei, neben der gesucht wird.
 * @returns {Promise<string[]>} Pfade in der Reihenfolge der Arten-Liste.
 */
async function pflichtBegleitPfade(dateiPfad) {
  const pfade = [];
  for (const art of BEGLEIT_ARTEN) {
    if (!art.pflicht) continue;
    const pfad = companionPathFor(dateiPfad, art.endung);
    if (await quelleVorhanden(pfad)) pfade.push(pfad);
  }
  return pfade;
}

/**
 * Vorab-Prüfung VOR jeder Bewegung: Liegt am Ziel bereits eine Begleit-Datei
 * einer Pflicht-Art?
 *
 * Grund: `fs.rename` überschreibt unter Windows wie unter POSIX ein
 * vorhandenes Ziel kommentarlos. Ohne diese Prüfung vernichtete das Mitziehen
 * eine am Zielnamen liegende Beleg-Datei — etwa die zurückgebliebene einer
 * früher von Hand umbenannten Tabelle — und damit eine nicht regenerierbare
 * Spur.
 *
 * @param {string} von Bisheriger Pfad der Hauptdatei.
 * @param {string} nach Neuer Pfad der Hauptdatei.
 * @returns {Promise<{ok: true}|{ok: false, code: 'companion-exists', companionPath: string}>}
 */
async function pruefeBegleitZiele(von, nach) {
  for (const art of artenInBewegungsfolge()) {
    if (!art.pflicht) continue;
    const quelle = companionPathFor(von, art.endung);
    const ziel = companionPathFor(nach, art.endung);
    if (nurGrossKlein(quelle, ziel)) continue;
    if (!(await quelleVorhanden(quelle))) continue;
    if (await liegtDa(ziel)) {
      return { ok: false, code: 'companion-exists', companionPath: ziel };
    }
  }
  return { ok: true };
}

// Nimmt die bereits vollzogenen Bewegungen zurück, in umgekehrter
// Reihenfolge und jeweils mit der Wiederhol-Schleife. Liefert null bei Erfolg
// und sonst den Fehler, an dem die Rücknahme endgültig gescheitert ist.
async function nimmZurueck(vollzogen, abstaende) {
  for (const schritt of [...vollzogen].reverse()) {
    try {
      await benenneUmMitWiederholung(schritt.nach, schritt.von, { abstaende });
    } catch (err) {
      return err;
    }
  }
  return null;
}

/**
 * Bewegt eine Datei samt ihren Begleit-Dateien — ganz oder gar nicht.
 *
 * Reihenfolge: erst die Hauptdatei, dann die Begleit-Dateien mit den
 * Pflicht-Arten zuerst. Scheitert eine Pflicht-Art endgültig, wird alles
 * bisher Bewegte in umgekehrter Reihenfolge zurückbenannt.
 *
 * Gedacht für den Rückruf von `moveWatchEntry`: Bei einem Fehlschlag bleibt
 * die Datei-Beobachtung dadurch auf dem alten Pfad, und der zurückgenommene
 * Zustand und die Beobachtung passen zueinander.
 *
 * @param {string} von Bisheriger Pfad der Hauptdatei.
 * @param {string} nach Neuer Pfad der Hauptdatei.
 * @param {object} [opts]
 * @param {number[]} [opts.abstaende] Auslegung des Wiederhol-Fensters, wie bei
 *   `ersetzeDatei`. Angegeben wird sie in Prüffällen, damit der
 *   Ausschöpfungs-Fall nicht drei Sekunden echte Zeit verwartet.
 * @returns {Promise<{ok: true}
 *   | {ok: false, error: string}
 *   | {ok: false, code: 'companion', error: string}
 *   | {ok: false, code: 'companion-rollback', error: string, from: string, to: string}>}
 */
async function bewegeMitBegleitDateien(von, nach, opts = {}) {
  const abstaende = opts.abstaende;
  const vollzogen = [];

  try {
    await benenneUmMitWiederholung(von, nach, { abstaende });
  } catch (err) {
    // Die Hauptdatei selbst: unveränderte Antwort-Form des bisherigen Weges,
    // damit der Aufrufer diesen Fall weiterhin als allgemeinen Fehlschlag
    // meldet und nicht als Begleit-Fall.
    return { ok: false, error: fehlerText(err) };
  }
  vollzogen.push({ von, nach });

  for (const art of artenInBewegungsfolge()) {
    const quelle = companionPathFor(von, art.endung);
    const ziel = companionPathFor(nach, art.endung);
    if (quelle === ziel) continue;
    // «Nicht vorhanden» ist kein Fehler, sondern der Normalfall.
    if (!(await quelleVorhanden(quelle))) continue;
    try {
      await benenneUmMitWiederholung(quelle, ziel, { abstaende });
      vollzogen.push({ von: quelle, nach: ziel });
    } catch (err) {
      if (!art.pflicht) {
        // Unverändertes Verhalten der Dokument-Begleitdatei: kein Fehlschlag
        // des Umbenennens und keine Meldung an den Anwender. Neu ist allein
        // der Protokoll-Eintrag, damit der Fall überhaupt irgendwo steht.
        console.warn(
          '[begleit] Begleitdatei nicht mitgezogen:',
          quelle,
          '—',
          err && err.message ? err.message : err,
        );
        continue;
      }
      const ruecknahmeFehler = await nimmZurueck(vollzogen, abstaende);
      if (ruecknahmeFehler) {
        console.error(
          '[begleit] Rücknahme nach fehlgeschlagenem Mitziehen gescheitert:',
          nach,
          '—',
          ruecknahmeFehler && ruecknahmeFehler.message
            ? ruecknahmeFehler.message
            : ruecknahmeFehler,
        );
        return {
          ok: false,
          code: 'companion-rollback',
          error: fehlerText(err),
          from: von,
          to: nach,
        };
      }
      return { ok: false, code: 'companion', error: fehlerText(err) };
    }
  }

  return { ok: true };
}

module.exports = {
  BEGLEIT_ARTEN,
  BEGLEIT_CODES,
  pflichtBegleitPfade,
  pruefeBegleitZiele,
  bewegeMitBegleitDateien,
};
