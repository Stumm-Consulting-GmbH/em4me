// 4T-002082 (Epic 3E-000259): Vorlagen-Ausschluss der Abfrage. Das Modul
// beantwortet eine Frage: ob ein Kandidat einer Abfrage herausfällt, weil er im
// Vorlagen-Ordner liegt (Konzept-Entscheidung E6.7, Festlegungen 16 und 17 des
// Epics, Frage F4 Option A).
//
// **Der Ordner kommt herein, er wird hier nicht ermittelt.** Welcher Ordner
// wirksam ist (Bereich vor global, im Aus-Zustand der Erweiterung «Vorlagen»
// keiner), entscheidet der Aufrufer im Hauptprozess einmal je Lauf
// (`resolveQueryTemplatesFolder` in `src/main/area/area-config.js`); der
// Erzeuger reicht ihn als Angabe durch wie die Aufgaben-Umgebung. Ohne Ordner
// gibt es keinen Ausschluss, und der Aufrufer bekommt `null` statt eines
// Prädikats, das nie zutrifft.
//
// **Die Ausnahme nach F4 Option A**, am Quellen-Baum festgelegt: Ein Ordner der
// Quelle nennt den Vorlagen-Ordner ausdrücklich, wenn er **positiv** steht
// (unter einer geraden Zahl von Verneinungen) und auf den Vorlagen-Ordner selbst
// oder einen seiner Unterordner zeigt. `AND` und `OR` reichen die Nennung
// durch, Klammern ebenso. Ein solcher Ordner gibt genau seinen eigenen Inhalt
// frei: Wer `FROM "Vorlagen/Besprechung"` schreibt, bekommt diesen Unterordner,
// nicht die übrigen Vorlagen. Ein Ordner **oberhalb** des Vorlagen-Ordners
// (auch die Wurzel `""`) nennt ihn nicht, und eine Verneinung
// (`FROM -"Vorlagen"`) erst recht nicht. Schlagwort und Verweis-Bezug sind
// keine Ordner-Angabe und nennen nie etwas.
//
// **Vergleich als Datei-Identität** über `normalizeForCompare`
// (`src/main/area/area-path.js`): absolut aufgelöst, Schreibweise nach der
// Plattform-Eigenschaft. Das ist derselbe Vergleich, mit dem die Ordner-Regeln
// der Vorlagen Dateien im Vorlagen-Ordner ausnehmen (`matchFolderRule`), damit
// beide Stellen denselben Ordner meinen.
//
// Electron-frei und ohne Zustand; die Prüfung je Kandidat ist ein Präfix-
// Vergleich auf einem einmal je Lauf gebildeten Schlüssel.
'use strict';

const path = require('node:path');
const { normalizeForCompare } = require('../area/area-path.js');

// Liegt der Pfad-Schlüssel `key` im Ordner-Schlüssel `folderKey` (der Ordner
// selbst zählt mit)? Präfix-Nachbarn (`Vorlagen2` neben `Vorlagen`) zählen nicht.
function isInside(folderKey, key) {
  return key === folderKey || key.startsWith(folderKey + path.sep);
}

// Eine Ordner-Angabe der Quelle als absoluter Pfad. Die Angabe ist relativ zur
// Wurzel des Suchraums; führende und schließende Trenner fallen weg wie bei der
// Ordner-Quelle selbst (`normFolder` in `src/shared/query/query-sources.js`),
// sonst zeigte `"/Vorlagen"` auf die Wurzel des Laufwerks.
function folderValuePath(root, value) {
  const rel = String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return path.resolve(root, rel);
}

// Sammelt die Ordner-Angaben, die positiv stehen; eine doppelte Verneinung ist
// wieder positiv (dieselbe Regel wie `collectTables` der Datensatz-Ebene).
function positiveFolderValues(node, negated, out) {
  if (!node) return out;
  switch (node.type) {
    case 'srcOr':
    case 'srcAnd':
      positiveFolderValues(node.left, negated, out);
      positiveFolderValues(node.right, negated, out);
      break;
    case 'srcNot':
      positiveFolderValues(node.operand, !negated, out);
      break;
    case 'srcFolder':
      if (!negated) out.push(node.value);
      break;
    default:
      break;
  }
  return out;
}

/**
 * Baut den Vorlagen-Ausschluss eines Abfrage-Laufs.
 *
 * @param {object} p Parameter.
 * @param {string} p.root Wurzel des Suchraums; Ordner-Angaben der Quelle sind
 *   relativ zu ihr.
 * @param {string|null|undefined} p.templatesFolder Wirksamer Vorlagen-Ordner als
 *   absoluter Pfad, oder nichts (kein Ordner gewählt, Erweiterung aus).
 * @param {object|null} p.source Quellen-Baum der Abfrage (`ast.source`).
 * @returns {null|{ excludes: (absPath: string) => boolean }} `null` ohne Ordner;
 *   sonst sagt `excludes`, ob ein Kandidat mit diesem absoluten Pfad herausfällt:
 *   im Vorlagen-Ordner und von keiner ausdrücklichen Nennung freigegeben. Auf der
 *   Datensatz-Ebene ist der Pfad die Kopf-Datei der Tabelle; eine Tabelle, die
 *   die Quelle als Pfad anspricht (`"Vorlagen/Bücher.md"`), ist damit von genau
 *   dieser Angabe freigegeben, weil sie als Ordner gelesen auf die Datei selbst
 *   zeigt.
 */
function createTemplateExclusion({ root, templatesFolder, source }) {
  const folderKey = normalizeForCompare(templatesFolder);
  if (folderKey === null || typeof root !== 'string' || root === '') return null;
  const named = [];
  for (const value of positiveFolderValues(source, false, [])) {
    const key = normalizeForCompare(folderValuePath(root, value));
    if (key !== null && isInside(folderKey, key)) named.push(key);
  }
  return {
    excludes(absPath) {
      const key = normalizeForCompare(absPath) || '';
      if (!isInside(folderKey, key)) return false;
      return !named.some((n) => isInside(n, key));
    },
  };
}

module.exports = { createTemplateExclusion };
