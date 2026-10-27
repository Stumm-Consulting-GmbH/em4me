// 4T-002347 (Epic 3E-000184): Die Bereichs-Grenze am Text eines Pfads (G6).
//
// Ein Pfad in einer Befehls-Zeile ist immer relativ zur Wurzel des Bereichs,
// in dem der Workflow gestartet wird (Sicherheits-Grenze 1f). Geprüft wird hier
// allein am Text, ohne Datei-System: absolut (Schrägstrich oder Rückstrich am
// Anfang, Laufwerks-Angabe, Freigabe-Adresse) oder mit einem Ausbruch über `..`.
// Die Auflösung gegen die echte Wurzel und die Prüfung danach bleiben im
// Hauptprozess (4T-002348); diese Prüfung ist die Vorab-Hälfte, damit ein
// Fehler vor dem ersten Schritt auffällt.
//
// **Streng bei Punkten:** Ein Segment nur aus Punkten und Leerzeichen mit
// mindestens zwei Punkten gilt als Ausbruch, weil Windows abschließende Punkte
// und Leerzeichen eines Namens entfernt und `.. ` damit zu `..` würde.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const ABSOLUT_RE = /^(?:[\\/]|[A-Za-z]:)/;
const TRENNER_RE = /[\\/]/;
const AUSBRUCH_SEGMENT_RE = /^[. ]*\.[. ]*\.[. ]*$/;

/**
 * Prüft einen Pfad-Text auf die Bereichs-Grenze.
 *
 * @param {string} text der Pfad, wie er in der Zeile steht oder gefüllt wurde.
 * @returns {null|{code: 'pathEmpty'}|{code: 'pathOutsideArea', kind: 'absolute'|'parent'}}
 */
function checkAreaPath(text) {
  const pfad = String(text == null ? '' : text);
  if (pfad.trim() === '') return { code: 'pathEmpty' };
  if (ABSOLUT_RE.test(pfad)) return { code: 'pathOutsideArea', kind: 'absolute' };
  if (pfad.split(TRENNER_RE).some((s) => AUSBRUCH_SEGMENT_RE.test(s))) {
    return { code: 'pathOutsideArea', kind: 'parent' };
  }
  return null;
}

/**
 * Prüft einen neuen Datei-Namen (`rename`): nicht leer, kein `.` oder `..`,
 * kein Trennzeichen, denn ein Name mit Pfad wäre ein `move`.
 *
 * @param {string} text der Name.
 * @returns {null|{code: 'nameInvalid'}}
 */
function checkFileName(text) {
  const name = String(text == null ? '' : text);
  const sauber = name.trim();
  if (sauber === '' || sauber === '.' || TRENNER_RE.test(name) || AUSBRUCH_SEGMENT_RE.test(name)) {
    return { code: 'nameInvalid' };
  }
  return null;
}

module.exports = { checkAreaPath, checkFileName };
