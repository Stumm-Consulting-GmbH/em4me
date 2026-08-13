// 4T-0581 (Epic 3E-0107): Gemeinsame Konstanten und reine Helfer der
// Rechtschreibpruefung.
//
// Geprueft wird ausschliesslich mit dem Pruefer des Betriebssystems. Die
// Anwendung bringt kein eigenes Woerterbuch mit und setzt die Pruefsprache
// NICHT: Electron uebernimmt sie von selbst aus dem Betriebssystem, und jeder
// eigene setSpellCheckerLanguages-Aufruf stoesst den Download eines
// Hunspell-Woerterbuchs aus dem Netz an (gemessen am 2026-08-02 an
// Electron 33; Architekturentscheidung 6 des Epics). Der Waechter
// test/unit/spellcheck.test.js haelt das Verbot maschinell fest.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron, kein
// DOM): Main (Broadcast des Schalters), Renderer (Editor-Compartment,
// Einstellungs-Bereich, Kontextmenue) und die Tests laden dasselbe Modul.
'use strict';

// Store-Schluessel des Schalters. Default ist AUS: Unterkringelungen stoeren
// in Markdown-Quelltext (Syntax, Pfade, Code) leicht, und ein Text in einer
// anderen Sprache als der des Betriebssystems waere durchgehend markiert.
// Die Aktivierung ist deshalb eine bewusste Entscheidung des Nutzers
// (Architekturentscheidung 5 des Epics).
const SPELLCHECK_KEY = 'editor.spellcheck';

// ID der schaltbaren Erweiterung (src/shared/extensions/extensions.js).
const SPELLCHECK_EXTENSION_ID = 'spellcheck';

// Wert des spellcheck-Attributs der Editor-Flaeche. Beide Bedingungen muessen
// zutreffen: der Schalter des Einstellungs-Bereichs UND die Erweiterung.
// CodeMirror setzt von Haus aus 'false'; der Aus-Zustand ist damit exakt das
// Verhalten ohne diese Erweiterung.
function spellcheckAttributeValue(enabled, extensionActive) {
  return enabled === true && extensionActive === true ? 'true' : 'false';
}

// Normalisiert den Store-Wert zum Schalter-Zustand. Alles ausser einem echten
// true bedeutet aus (fehlender Wert, Altbestand, defekter Store).
function normalizeSpellcheckSetting(raw) {
  return raw === true;
}

// Bereinigt die Woerterbuch-Liste des Betriebssystems fuer die Anzeige:
// nur nicht-leere Zeichenketten, ohne Duplikate, gebietsschema-unabhaengig
// sortiert (localeCompare waere je nach Systemsprache verschieden und
// machte den Snapshot-Vergleich der Tests unzuverlaessig).
function normalizeDictionaryWords(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const wort of raw) {
    if (typeof wort !== 'string') continue;
    const getrimmt = wort.trim();
    if (getrimmt === '' || out.includes(getrimmt)) continue;
    out.push(getrimmt);
  }
  return out.sort();
}

module.exports = {
  SPELLCHECK_KEY,
  SPELLCHECK_EXTENSION_ID,
  spellcheckAttributeValue,
  normalizeSpellcheckSetting,
  normalizeDictionaryWords,
};
