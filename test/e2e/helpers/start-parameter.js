// 4T-002068: Start-Parameter der Ablauf-Prüfungen — Quellstand oder gebaute
// Programmdatei.
//
// **Wofür.** Die Ablauf-Prüfungen starten die Anwendung aus dem Quellstand
// (`electron .` im Projekt-Ordner). Für eine Bestätigungs-Messung an einer
// gebauten Programmdatei — etwa ob ein am Quellstand gemessener Befund auch im
// gepackten Archiv besteht — lässt sich stattdessen eine gebaute Programmdatei
// starten. Gesteuert wird das über die Umgebungs-Variable
// `EM4ME_PROGRAMMDATEI` mit dem absoluten Pfad zur Programmdatei (bei einem
// Windows-Bau die `EM4me.exe` im entpackten Bau-Ordner `dist/win-unpacked/`,
// nicht die Portable-Hülle, die sich erst selbst entpackt und dann einen
// Kindprozess startet).
//
// **Kein Gate.** Der Weg ist für einzelne Bestätigungs-Messungen gedacht; ein
// Lauf damit ist kein Lauf-Nachweis einer Prüfdatei am Quellstand.
//
// **Ohne die Variable bleibt alles wie zuvor:** dieselben Start-Argumente
// (`'.'` voran), derselbe Arbeitsordner, dieselbe Umgebung, und die
// Frische-Prüfung des Anzeige-Bündels läuft (Stabilitätsregel 24). Mit der
// Variablen entfallen das Quellstand-Argument `'.'` und die Frische-Prüfung —
// die Programmdatei trägt ihr eigenes, beim Bau gepacktes Bündel —; das eigene
// Profil je Prüf-Instanz (`SCG_TEST_USER_DATA`) bleibt in beiden Fällen.
//
// Rein und ohne Electron, damit die Ableitung als Unit-Prüffall prüfbar ist
// (test/unit/e2e-start-parameter.test.js).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROGRAMMDATEI_VARIABLE = 'EM4ME_PROGRAMMDATEI';

/**
 * Liest den Pfad der gebauten Programmdatei aus der Umgebung.
 * @param {Record<string, string|undefined>} env
 * @returns {string|null} Pfad, oder null, wenn die Variable fehlt oder leer ist.
 */
function programmdateiAusUmgebung(env) {
  const wert = env && env[PROGRAMMDATEI_VARIABLE];
  if (typeof wert !== 'string' || wert.trim() === '') return null;
  return wert.trim();
}

/**
 * Leitet die Optionen für `electron.launch` ab.
 * @param {object} a
 * @param {Record<string, string|undefined>} a.env       Umgebung des Prüf-Prozesses.
 * @param {string}   a.appRoot                           Projekt-Wurzel (Quellstand).
 * @param {string}   a.userData                          Profil-Verzeichnis der Prüf-Instanz.
 * @param {string[]} [a.zusatzArgumente]                 Weitere Start-Argumente des Falls.
 * @returns {{ launch: object, buendelPruefen: boolean, programmdatei: string|null }}
 */
function startParameter({ env, appRoot, userData, zusatzArgumente = [] }) {
  const programmdatei = programmdateiAusUmgebung(env);
  const umgebung = { ...env, SCG_TEST_USER_DATA: userData };
  if (!programmdatei) {
    return {
      launch: { args: ['.', ...zusatzArgumente], cwd: appRoot, env: umgebung },
      buendelPruefen: true,
      programmdatei: null,
    };
  }
  if (!path.isAbsolute(programmdatei)) {
    throw new Error(
      `${PROGRAMMDATEI_VARIABLE} verlangt einen absoluten Pfad zur Programmdatei, erhalten: ${programmdatei}`,
    );
  }
  if (!fs.existsSync(programmdatei) || !fs.statSync(programmdatei).isFile()) {
    throw new Error(`${PROGRAMMDATEI_VARIABLE}: keine Datei unter ${programmdatei}`);
  }
  return {
    launch: {
      executablePath: programmdatei,
      args: [...zusatzArgumente],
      cwd: path.dirname(programmdatei),
      env: umgebung,
    },
    buendelPruefen: false,
    programmdatei,
  };
}

module.exports = { startParameter, programmdateiAusUmgebung, PROGRAMMDATEI_VARIABLE };
