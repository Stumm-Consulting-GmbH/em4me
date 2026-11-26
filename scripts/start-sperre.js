// 4T-002762 (Epic 3E-000430): Sperre gegen Browser- und Programm-Starts am
// Bildschirm des Rechners.
//
// Die Regel des Auftraggebers fuer alle Projekte verbietet jeden Browser-Start
// direkt unter Windows, auch ohne Fenster und auch zum Testen einer Sperre;
// ebenso jeden Start der Anwendung am Bildschirm des Arbeitsrechners. Erlaubt
// ist beides nur abgeschirmt: im Linux-Container des Pruefstands oder in der
// Windows-Pruefmaschine. Dieses Modul ist die eine Stelle, die das entscheidet;
// die Start-Stellen fragen es, statt die Regel je fuer sich nachzubauen.
//
// Aufbau nach dem Vorbild scripts/gate-zugang.js: eine reine Entscheidung mit
// hereingereichter Umgebung (ohne Repositorium und ohne Rechner pruefbar), ein
// Einsprung, der die echte Umgebung liest, und eine Funktion, die bei «nicht
// erlaubt» mit Meldung abweist.
//
// Bewusst KEIN Not-Aus und keine Umgebungsvariable, die die Sperre abschaltet:
// Ein Schalter, den eine Sitzung setzen kann, ist der bequemere Weg an der Regel
// vorbei, und genau den soll es nicht geben.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Arten eines Starts. `browser`: ein Browser von Playwright, auch ohne Fenster.
// `anwendung`: die Anwendung selbst (Electron), gebunden an ihre Start-Stellen
// mit 4T-002759 (Start-Hilfe der Ablauf-Prüfungen, Bildschirmfotos,
// Blockade-Hilfe, Ablauf-Anteil des Gate-Wegs, Frühwarnung der Kommandos).
const ARTEN = Object.freeze(['browser', 'anwendung']);

// 4T-002759: Unter Linux ist ein Start nur im Container erlaubt. Erkannt wird er
// an den Merkmal-Dateien, die die Container-Laufzeit selbst anlegt (Docker
// `/.dockerenv`, Podman `/run/.containerenv`); ein Linux-Rechner außerhalb trägt
// keine davon. Damit gilt die Erkennung für jeden Container des Projekts, nicht
// nur für den des Prüfstands.
const CONTAINER_MERKMALE = Object.freeze(['/.dockerenv', '/run/.containerenv']);

// Fester Rechnername der Windows-Pruefmaschine, gesetzt in der unbeaufsichtigten
// Einrichtung: scripts/pruefstand-windows/autounattend.xml, Zeile 120
// (`<ComputerName>em4me-pruefst</ComputerName>`). Windows meldet ihn in
// Grossbuchstaben, verglichen wird deshalb ohne Gross-/Kleinschreibung.
const PRUEFMASCHINE_RECHNERNAME = 'em4me-pruefst';

// Der abgeschirmte Weg je Art, als Teil der Abweisung.
const WEG = Object.freeze({
  browser:
    'Browser-Prüfungen laufen im Linux-Container: node scripts/test-linux-docker.js test ' +
    '(Unit-Suite samt den Browser-Prüffällen). Der Webseiten-Bau gibt seinen ' +
    'Diagramm-Schritt unter Windows selbst in den Container; er braucht dafür den ' +
    'Container-Dienst (Docker Desktop).',
  anwendung:
    'Ablauf-Prüfungen laufen abgeschirmt: node scripts/test-windows-vm.js e2e --nur <muster> ' +
    '(Windows-Prüfmaschine) oder node scripts/test-linux-docker.js e2e --nur <muster> ' +
    '(Linux-Container). Ist keiner der beiden verfügbar, ist der Schritt angehalten: ' +
    'melden und an anderem weiterarbeiten, nie auf den Rechner ausweichen (Tafel ' +
    '«Abgeschirmte Wege je Schritt» in test/README.md).',
});

/**
 * Reine Entscheidung: Ist ein Start dieser Art in dieser Umgebung erlaubt?
 *
 * @param {object} umgebung
 * @param {'browser'|'anwendung'} umgebung.art Art des Starts.
 * @param {string} umgebung.plattform Wert wie `process.platform`.
 * @param {string} umgebung.rechnername Wert wie `os.hostname()`.
 * @param {boolean} umgebung.internesWerkzeugVorhanden Liegt scripts/gate-lauf.js
 *   neben diesem Modul? Im oeffentlichen Quellcode-Export fehlt es; dort ist die
 *   Sperre aus (Begruendung an `pruefeZugang` in scripts/gate-zugang.js).
 * @param {boolean} [umgebung.imContainer] Laeuft der Prozess in einem Container?
 *   Zaehlt nur unter Linux (4T-002759).
 * @returns {{erlaubt: boolean, grund: string, weg: string|null}}
 */
function entscheideStart({ art, plattform, rechnername, internesWerkzeugVorhanden, imContainer }) {
  if (!ARTEN.includes(art))
    throw new Error(`start-sperre: unbekannte Art "${art}" (bekannt: ${ARTEN.join(', ')}).`);
  if (!internesWerkzeugVorhanden)
    return {
      erlaubt: true,
      grund: 'ohne internes Werkzeug (Quellcode-Export): Sperre aus',
      weg: null,
    };
  // 4T-002759: Linux nur im Container (Anordnung vom 2026-11-21: «unter Linux im
  // Container»). Ein Linux-Arbeitsrechner hat einen Bildschirm wie jeder andere.
  if (plattform === 'linux') {
    if (imContainer) return { erlaubt: true, grund: 'Linux-Container', weg: null };
    return {
      erlaubt: false,
      grund: 'Linux außerhalb eines Containers: nichts am Bildschirm des Rechners',
      weg: WEG[art],
    };
  }
  if (plattform !== 'win32')
    return {
      erlaubt: true,
      grund: `Plattform ${plattform}: kein Bildschirm des Rechners`,
      weg: null,
    };
  if (String(rechnername || '').toLowerCase() === PRUEFMASCHINE_RECHNERNAME)
    return { erlaubt: true, grund: 'Windows-Prüfmaschine', weg: null };
  return {
    erlaubt: false,
    grund:
      `Windows außerhalb der Prüfmaschine (Rechner ${rechnername || 'unbekannt'}): ` +
      'nichts am Bildschirm des Rechners, kein Browser direkt unter Windows, auch nicht ohne Fenster',
    weg: WEG[art],
  };
}

// Liegt das interne Werkzeug neben diesem Modul? Getrennt gehalten, damit die
// Entscheidung rein bleibt (Muster `zugangswegVorhanden` in gate-zugang.js).
function internesWerkzeugVorhanden() {
  return fs.existsSync(path.join(__dirname, 'gate-lauf.js'));
}

// Laeuft der Prozess in einem Container? Getrennt gehalten wie oben.
function imContainer() {
  return CONTAINER_MERKMALE.some((datei) => fs.existsSync(datei));
}

// Einsprung mit der echten Umgebung. `quellen` ist fuer Prueffaelle
// hereinreichbar, damit die Verdrahtung selbst geprueft werden kann.
function startErlaubt(art, quellen = {}) {
  const {
    plattform = process.platform,
    rechnername = os.hostname(),
    werkzeug = internesWerkzeugVorhanden,
    container = imContainer,
  } = quellen;
  return entscheideStart({
    art,
    plattform,
    rechnername,
    internesWerkzeugVorhanden: werkzeug(),
    imContainer: plattform === 'linux' && container(),
  });
}

// Meldungstext einer Abweisung. Eigene Funktion, damit Prueffaelle ihn ohne
// geworfenen Fehler lesen koennen.
function abweisungsText(art, entscheidung) {
  return (
    `Start abgewiesen (${art === 'browser' ? 'Browser' : 'Anwendung'}): ${entscheidung.grund}.\n` +
    `Abgeschirmter Weg: ${entscheidung.weg}\n` +
    'Grundlage: Regel des Auftraggebers «nichts am Bildschirm des Rechners», Anforderung 4S-001237.'
  );
}

// Weist einen nicht erlaubten Start mit Meldung ab; wirft dann, sonst nichts.
// `entscheidung` ist fuer Prueffaelle hereinreichbar, sonst gilt die echte
// Umgebung.
function sichereStart(art, entscheidung = startErlaubt(art)) {
  if (entscheidung.erlaubt) return;
  throw new Error(abweisungsText(art, entscheidung));
}

// Gate-Weg (scripts/gate-lauf.js, Kommandozeilen-Zweig): Weist das Gate `e2e`
// und `ausschnitt --ablauf` am Rechner ab, bevor eine Prüfung startet. Gibt
// true zurück, wenn abgewiesen; die Meldung geht an `ausgabe`.
function ablaufAbgewiesen(
  auswertung,
  entscheidung = startErlaubt('anwendung'),
  ausgabe = console.error,
) {
  const name = auswertung && auswertung.name;
  const optionen = (auswertung && auswertung.optionen) || {};
  const ablauf = name === 'e2e' || (name === 'ausschnitt' && Boolean(optionen.ablauf));
  if (!ablauf || entscheidung.erlaubt) return false;
  ausgabe(abweisungsText('anwendung', entscheidung));
  return true;
}

module.exports = {
  entscheideStart,
  startErlaubt,
  sichereStart,
  abweisungsText,
  ablaufAbgewiesen,
  imContainer,
  CONTAINER_MERKMALE,
  internesWerkzeugVorhanden,
  ARTEN,
  PRUEFMASCHINE_RECHNERNAME,
  WEG,
};
