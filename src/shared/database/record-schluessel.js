// 4T-001927 (Epic 3E-000256, E5.3, E22.3): Der Vergleichs-Schlüssel eines
// fachlichen Schlüssels — wie aus den Werten seiner Teile der eine Wert wird,
// über den zwei Datensätze als gleich oder verschieden gelten.
//
// **Eine Bildung, nicht zwei.** Der Index führt den Schlüssel für den Zugriff
// (`datensatz-zugriff.js`), die Schlüssel-Regel der Schreib-Schnittstelle prüft
// ihn beim Schreiben (`record-regel-schluessel.js`). Bildeten beide ihn je für
// sich, gäben sie irgendwann verschiedene Antworten auf dieselbe Frage: Die
// Regel ließe einen Schlüssel durch, den der Zugriff danach als mehrdeutig
// meldet, oder umgekehrt. Die Funktion stand bis hierher im Index-Zugriff und
// ist samt Begründung unverändert herübergezogen; ihre Festlegung
// (zeichengenau, ungetrimmt) stammt aus 4T-001611 (Epic 3E-000252).
//
// Prozess-neutral: kein Dateizugriff, keine Electron-Abhängigkeit.
'use strict';

/**
 * Vergleichs-Schlüssel aus den Werten eines fachlichen Schlüssels.
 *
 * **Verglichen wird zeichengenau** (Festlegung aus 4T-001611; das Konzept lässt
 * die Frage offen). Ein fachlicher Schlüssel ist ein **Datenwert**, kein Name:
 * Wo das Haus unabhängig von Groß- und Kleinschreibung vergleicht, tut es das
 * bei Datei-Namen, Schlagworten und Feld-Namen, weil dort das Dateisystem oder
 * die Bequemlichkeit es verlangt. `Müller` und `MÜLLER` als denselben Datensatz
 * zu führen wäre dagegen eine fachliche Aussage, die niemand getroffen hat, und
 * sie ließe sich später nicht ohne Bruch zurücknehmen. Aus demselben Grund wird
 * **nicht getrimmt**: Das Ablage-Format hält einen Wert mit führenden
 * Leerzeichen ausdrücklich für zulässig und beschneidet ihn nie.
 *
 * Der Trenner ist derselbe wie bei der Definitions-Signatur und aus demselben
 * Grund: Ohne ihn fielen die Schlüssel `['ab', 'c']` und `['a', 'bc']`
 * zusammen.
 */
const TEIL_TRENNER = '\u0000';

function schluesselKey(werte) {
  if (!Array.isArray(werte) || werte.length === 0) return null;
  return werte.map((w) => String(w == null ? '' : w)).join(TEIL_TRENNER);
}

module.exports = { TEIL_TRENNER, schluesselKey };
