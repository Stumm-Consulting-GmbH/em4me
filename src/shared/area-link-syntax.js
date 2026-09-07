// 4T-001451 (Epic 3E-000190): Die Syntax der Bereichs-Verknuepfung im Link —
// `[[@kuerzel:Ziel]]` — als EINE Quelle fuer alle vier Stellen, die einen
// Wiki-Link unabhaengig voneinander auswerten.
//
// Warum hier und nicht bei area-links.js: Die vier Parse-Stellen liegen in
// zwei Prozessen — Render-Pfad und Index unter src/shared/, Live-Modus und
// Linter unter src/renderer/ —, waehrend das Verknuepfungs-Modell (Ablage,
// Lesen, Schreiben) im Haupt-Prozess lebt. Die Form-Regel gehoert damit
// dorthin, wo beide Seiten sie erreichen; area-links.js reicht sie weiter,
// statt sie ein zweites Mal zu fuehren (Erhebung 1 der Konzept-Stufe
// 4T-001368: vier Muster, kein gemeinsamer Kern — genau der Fehler, der hier
// nicht wiederholt wird).
//
// Warum das fuehrende At-Zeichen (Entscheidung E1 des Product Owners vom
// 2026-09-05): Es setzt die Namensraum-Marke, BEVOR ein Waechter hinsieht.
// Das Schema-Muster der beiden Oeffnen-Waechter (`link-navigation.js` und
// `main/ipc/files.js`) greift bei fuehrendem At-Zeichen nicht, weshalb sie
// unveraendert bleiben. Im gemessenen Bestand kommt das At-Zeichen in 3828
// eindeutigen Link-Zielen null mal vor, und der Doppelpunkt kann in keinem
// legalen Dateinamen stehen (`src/shared/subpages.js`).
'use strict';

// Zulaessige Kuerzel-Form: Buchstaben, Ziffern, Bindestrich und Unterstrich,
// hoechstens 32 Zeichen. Ausgeschlossen sind genau die Zeichen, welche die
// Link-Syntax bereits belegt — Doppelpunkt (Trennung zum Ziel), Rautezeichen
// (Anker), senkrechter Strich (Alias und Groessenangabe), Schraegstrich
// (Unterseiten-Form) und eckige Klammer (Link-Grenze) — dazu Leerzeichen.
const AREA_PREFIX_MUSTER = /^[A-Za-z0-9_-]{1,32}$/;

// Ein Verknuepfungs-Link am Anfang des Ziel-Teils: At-Zeichen, Kuerzel,
// Doppelpunkt, danach das Ziel. Das Ziel muss nichtleer sein — `[[@zt:]]`
// bezeichnet nichts und bleibt deshalb ein gewoehnlicher Wiki-Link, genau wie
// vor dieser Erweiterung.
const AREA_LINK_MUSTER = /^@([A-Za-z0-9_-]{1,32}):(.+)$/;

/**
 * Prueft ein Kuerzel auf die zulaessige Form.
 *
 * @param {*} value Zu pruefender Wert.
 * @returns {boolean} true, wenn der Wert ein zulaessiges Kuerzel ist.
 */
function isValidAreaPrefix(value) {
  return typeof value === 'string' && AREA_PREFIX_MUSTER.test(value);
}

/**
 * Vergleichs-Form eines Kuerzels. Kuerzel werden ohne Ruecksicht auf Gross-
 * und Kleinschreibung verglichen, aber in der eingegebenen Schreibung
 * gespeichert und angezeigt — wie die Pfad-Vergleiche des Bereichs-Modells
 * (area-path.js) und aus demselben Grund: Auf der Haupt-Plattform
 * unterscheidet schon das Dateisystem nicht.
 *
 * @param {*} value Kuerzel.
 * @returns {string} Vergleichs-Form (kleingeschrieben) oder ''.
 */
function normalizeAreaPrefix(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Trennt das Kuerzel vom Ziel-Teil eines Wiki-Links.
 *
 * Erwartet den ROHEN Ziel-Teil, also das, was vor dem Alias-Trenner steht und
 * den Anker noch enthalten darf. Die Trennung laeuft VOR Anker, Unterseiten-
 * Form und Endungs-Ergaenzung, damit diese auf dem blossen Ziel arbeiten:
 * `@zt:Datei#Kapitel` ergibt das Ziel `Datei#Kapitel`, und der Anker-Schritt
 * sieht danach dasselbe wie bei einem gewoehnlichen Link.
 *
 * Ist der Wert kein Verknuepfungs-Link, kommt er unveraendert zurueck und
 * `prefix` ist null. Das gilt ausdruecklich auch fuer die Grenzfaelle: ein
 * At-Zeichen ohne Doppelpunkt, ein unzulaessiges Kuerzel und ein leeres Ziel
 * behalten ihre heutige Bedeutung. Ein bestehender Link aendert damit sein
 * Verhalten nur, wenn er die vollstaendige neue Form traegt.
 *
 * @param {*} raw Roher Ziel-Teil eines Wiki-Links.
 * @returns {{prefix: string|null, target: string}} Kuerzel und blosses Ziel.
 */
function splitAreaLink(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const treffer = AREA_LINK_MUSTER.exec(text.trim());
  if (!treffer) return { prefix: null, target: text };
  return { prefix: treffer[1], target: treffer[2] };
}

/**
 * Kurzform fuer «ist das ein Verknuepfungs-Link».
 *
 * @param {*} raw Roher Ziel-Teil eines Wiki-Links.
 * @returns {boolean} true bei vollstaendiger Verknuepfungs-Form.
 */
function isAreaLinkTarget(raw) {
  return splitAreaLink(raw).prefix !== null;
}

/**
 * Setzt Kuerzel und Ziel wieder zur Verknuepfungs-Form zusammen. Gegenstueck
 * zu splitAreaLink; ohne Kuerzel bleibt das Ziel unveraendert.
 *
 * @param {string|null} prefix Kuerzel oder null.
 * @param {string} target Ziel.
 * @returns {string} Zusammengesetzter Ziel-Teil.
 */
function joinAreaLink(prefix, target) {
  return prefix ? `@${prefix}:${target}` : String(target ?? '');
}

module.exports = {
  AREA_PREFIX_MUSTER,
  isValidAreaPrefix,
  normalizeAreaPrefix,
  splitAreaLink,
  isAreaLinkTarget,
  joinAreaLink,
};
