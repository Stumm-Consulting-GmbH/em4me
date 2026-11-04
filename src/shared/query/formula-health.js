'use strict';

// 4T-002453 (Epic 3E-000378, Story 4S-001140): Formel-Gruppe «Gesundheit» der
// Formel-Bibliothek, Namensraum `health.`, mit der einen Formel
// `health.bmi(mass, height)`.
//
// **Form.** Wie `formula-humidity.js`: Das Modul liefert seine Gruppe als Daten
// `{ namespace, functions }` in der Form der Kern-Einträge (`arity: [min, max]`,
// reine `fn(args)`); die Liste der Bibliothek (`formula-library.js`) trägt sie
// ein, der Katalog registriert sie mit der Kennung der Erweiterung. Das Modul
// lädt den Katalog nicht.
//
// **Quelle.** Weltgesundheitsorganisation (WHO), Fact sheet «Obesity and
// overweight»: «body mass index (BMI): weight (kg)/height² (m²)»; WHO
// Regionalbüro für Europa, Fact sheet «Nutrition for a healthy life»
// (18. Juli 2025): «an adult who weighs 70 kg and whose height is 1.75 m will
// have a BMI of 22.9». Masse in kg, Größe in m, Ergebnis in kg/m².
//
// **Allein die Zahl.** Die Formel ordnet den Wert keiner Gewichts-Klasse zu und
// bewertet ihn nicht (Story, Abgrenzung); die Schwellen und ihre Beschränkung
// auf Erwachsene nennt das Handbuch.
//
// **Meldungen statt Werte.** Eine Masse oder Größe von 0 oder darunter, eine
// Angabe, die keine Zahl ist, und ein Ergebnis außerhalb des darstellbaren
// Zahlenbereichs ergeben einen Meldungs-Wert (`messageValue`) mit einem
// i18n-Schlüssel, der Angabe und Bereich nennt; nie einen Wert (Story, AK5 und
// AK7).
//
// Prozess-neutral (kein Electron, kein DOM).

const { coerceNumber, messageValue } = require('./query-format.js');

const PREFIX = 'query.formula.health.';
const M = Object.freeze({
  keineZahl: 'query.formula.notANumber',
  nichtDarstellbar: 'query.formula.notRepresentable',
  masse: `${PREFIX}massRange`,
  groesse: `${PREFIX}heightRange`,
});

// Eine Angabe als Zahl; ein Wahrheitswert ist hier keine Messgröße und zählt
// wie Text, der keine Zahl ist.
function zahl(v) {
  return typeof v === 'boolean' ? null : coerceNumber(v);
}

// Body-Mass-Index: Masse in kg geteilt durch das Quadrat der Größe in m. Geprüft
// wird der Reihe nach: Zahlen, Masse größer 0, Größe größer 0, darstellbares
// Ergebnis.
function bmi([m, h]) {
  const masse = zahl(m);
  const groesse = zahl(h);
  if (masse === null || groesse === null) return messageValue(M.keineZahl);
  if (!(masse > 0)) return messageValue(M.masse);
  if (!(groesse > 0)) return messageValue(M.groesse);
  const n = masse / (groesse * groesse);
  return Number.isFinite(n) ? n : messageValue(M.nichtDarstellbar);
}

const HEALTH_GROUP = Object.freeze({
  namespace: 'health',
  functions: Object.freeze({
    'health.bmi': { arity: [2, 2], fn: bmi },
  }),
});

module.exports = { HEALTH_GROUP, HEALTH_MESSAGES: M };
