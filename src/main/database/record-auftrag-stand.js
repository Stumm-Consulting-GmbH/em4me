// 4T-001822 (Epic 3E-000254, Bauplan B1, B4 bis B7; E9.2, E9.3, E22.6): Der
// Vergleich des vorgefundenen Stands mit dem zuletzt gelesenen, je Datensatz.
//
// **Die Sperre schützt gegen die eigene Anwendung, dieser Vergleich gegen alles
// andere.** Ein Datensatz bleibt eine von Hand editierbare Datei; wer sie im
// Editor öffnet, sieht keine Sperre, und ein Synchronisations-Werkzeug erst recht
// nicht. Deshalb prüft der Schreibvorgang immer (E9.2), auch mit gehaltener
// Sperre, und zwar auf dem unter der Sperre frisch gelesenen Text.
//
// **Verglichen werden die Zell-Werte je Feld** (B1), über dieselbe Auslegung, mit
// der die Schnittstelle alte und neue Werte vergleicht (`werteDes`/`zellText` aus
// dem Plan-Modul, also `zellTexte` des Zurückschreibens: demaskiert und ohne den
// Trennabstand). Weder eine Zeit noch ein Zähler (E9.3): Synchronisations-
// Werkzeuge schreiben Dateien inhaltlich unverändert neu, und eine Änderung von
// Hand zieht keinen Zähler hoch. Eine Änderung, die allein Leerraum,
// Trennabstand oder Maskierung berührt, ist damit keine Fremd-Änderung; sie
// ergäbe einen Beleg ohne geändertes Feld, den das Format zu Recht abweist.
//
// **Was bei einer Abweichung geschieht** (B6, E22.6): Ohne `erzwingen` wird der
// Auftrag abgewiesen, mit einer Lage je abweichendem Datensatz, damit der
// Anwender für jeden einzeln entscheiden kann. Mit `erzwingen` entsteht keine
// Lage; die Abweichung wird dem Schritt zugeordnet, und der Plan macht daraus den
// Beleg der Fremd-Änderung. Erzwingen übergeht die harten Regeln nicht: Typ,
// Pflicht-Angabe und Prüf-Naht laufen unverändert.
//
// **Warum ein eigenes Modul** (B5): Vergleich und Lage-Bildung sind eine eigene
// Fachlichkeit, und das Ablauf-Modul liegt nahe an seinem Größen-Budget.
// `pruefeStand` in `record-auftrag.js` bleibt die eine Einhak-Stelle im Ablauf.
//
// **Die Datei-Ebene bleibt daneben bestehen** (B4): Der atomare Schreibweg
// bekommt weiterhin den unter der Sperre gelesenen Datei-Stand als Erwartung und
// fängt die Änderung zwischen Lesen und Umbenennen, die dieser Vergleich nicht
// sehen kann.
//
// Kein Dateizugriff, keine Sperre: Das Modul arbeitet allein auf den Schritten
// und dem bereits gelesenen Bestand.
'use strict';

const { LAGEN, ART_AENDERN, ART_LOESCHEN, befund } = require('./record-auftrag-pruefung.js');
const { werteDes, zellText, datensatzVon } = require('./record-auftrag-plan.js');

// Die abweichenden Felder eines vorgefundenen Datensatzes, je genanntem Feld
// `{ name, erwartet, vorgefunden }`. Der Name ist der der Definition und nicht
// die Schreibweise des Aufrufers, weil er so in den Beleg geht.
function abweichendeFelder(schritt) {
  const karte = schritt.bestand.karte;
  const texte = werteDes(datensatzVon(schritt));
  const felder = [];
  for (const [name, erwartet] of Object.entries(schritt.anweisung.erwartet)) {
    const treffer = karte.get(name.toLowerCase());
    // Ein unbekannter Name ist vor den Sperren abgewiesen; hier kommt keiner an.
    if (!treffer) continue;
    const vorgefunden = zellText(texte, treffer.index);
    if (vorgefunden !== erwartet) felder.push({ name: treffer.feld.name, erwartet, vorgefunden });
  }
  return felder;
}

// Der von Hand gelöschte Datensatz (B7): Jedes genannte Feld weicht ab, und
// sein vorgefundener Wert fehlt.
function felderDesGeloeschten(schritt) {
  const karte = schritt.bestand.karte;
  const felder = [];
  for (const [name, erwartet] of Object.entries(schritt.anweisung.erwartet)) {
    const treffer = karte.get(name.toLowerCase());
    if (!treffer) continue;
    felder.push({ name: treffer.feld.name, erwartet, vorgefunden: null });
  }
  return felder;
}

/**
 * Prüft den vorgefundenen Stand aller Schritte eines Auftrags.
 *
 * Geprüft werden allein Ändern und Löschen; ein neuer Datensatz hat keinen
 * zuletzt gelesenen Stand. **Gemeldet werden alle abweichenden Schritte**, nicht
 * nur der erste: Ein Auftrag wirkt ganz oder gar nicht, und der Anwender soll in
 * einem Zug erfahren, bei welchen Datensätzen er entscheiden muss.
 *
 * @param {{schritte: Array<object>, bestaende?: Map<string, object>}} kontext
 *   Die Schritte aus `loeseSchritte`, je mit `anweisung`, `bestand`, `pfad`,
 *   `id` und beim von Hand gelöschten Datensatz `fehlt: true`.
 * @returns {{befunde: Array<object>, abweichungen: Map<object, {geloescht: boolean,
 *   felder: Array<{name: string, erwartet: string, vorgefunden: string|null}>}>}}
 *   `befunde` sind Lagen `auftragStandWeichtAb` der nicht erzwungenen Schritte;
 *   `abweichungen` ordnet jedem erzwungenen, abweichenden Schritt seine
 *   Abweichung zu. Erzwingen ohne Abweichung erscheint in keiner der beiden.
 */
function pruefeStaende({ schritte }) {
  const befunde = [];
  const abweichungen = new Map();
  for (const schritt of Array.isArray(schritte) ? schritte : []) {
    const { anweisung } = schritt;
    if (anweisung.art !== ART_AENDERN && anweisung.art !== ART_LOESCHEN) continue;
    const geloescht = schritt.fehlt === true;
    const felder = geloescht ? felderDesGeloeschten(schritt) : abweichendeFelder(schritt);
    if (felder.length === 0) continue;
    if (anweisung.erzwingen === true) {
      abweichungen.set(schritt, { geloescht, felder });
      continue;
    }
    befunde.push(
      befund(LAGEN.standWeichtAb, {
        position: anweisung.position,
        tabelle: anweisung.tabelle,
        id: schritt.id,
        geloescht,
        felder,
      }),
    );
  }
  return { befunde, abweichungen };
}

module.exports = { pruefeStaende };
