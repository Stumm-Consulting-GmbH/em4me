'use strict';

// 4T-002453 (Epic 3E-000378, Story 4S-001140): Formel-Gruppe «Prozentrechnung»
// der Formel-Bibliothek, Namensraum `percent.`.
//
// **Form.** Wie `formula-humidity.js`: Das Modul liefert seine Gruppe als Daten
// `{ namespace, functions }` in der Form der Kern-Einträge (`arity: [min, max]`,
// reine `fn(args)`); die Liste der Bibliothek (`formula-library.js`) trägt sie
// ein, der Katalog registriert sie mit der Kennung der Erweiterung. Das Modul
// lädt den Katalog nicht.
//
// **Rechnung.** Die üblichen Rechen-Regeln der Prozentrechnung, wie die Story
// sie in ihrer Tabelle festlegt (Quelle «Rechen-Regel»):
//
//   percent.share(part, whole)   = part / whole · 100
//   percent.change(old, new)     = (new − old) / old · 100, negativ bei Abnahme
//   percent.increase(value, p)   = value · (1 + p / 100)
//   percent.decrease(value, p)   = value · (1 − p / 100)
//   percent.base(w, p)           = w / (p / 100)
//
// **Form der Angaben.** Prozent-Angaben und Prozent-Ergebnisse sind
// Prozentzahlen, also 19 für 19 Prozent (Story, «Form der Angaben»); eine
// Prozent-Schreibweise wie `19%` kennt die Sprache nicht.
//
// **Meldungen statt Werte.** Ein Ganzes von 0 beim Anteil, ein alter Wert von 0
// bei der Änderung und ein Prozent von 0 beim Grundwert, durch die geteilt
// würde, eine Angabe, die keine Zahl ist, und ein Ergebnis außerhalb des
// darstellbaren Zahlenbereichs ergeben einen Meldungs-Wert (`messageValue`)
// mit einem i18n-Schlüssel, der Angabe und Bereich nennt; nie einen Wert (Story,
// AK5 und AK7).
//
// Prozess-neutral (kein Electron, kein DOM).

const { coerceNumber, messageValue } = require('./query-format.js');

const PREFIX = 'query.formula.percent.';
const M = Object.freeze({
  keineZahl: 'query.formula.notANumber',
  nichtDarstellbar: 'query.formula.notRepresentable',
  ganzes: `${PREFIX}wholeRange`,
  alterWert: `${PREFIX}oldValueRange`,
  prozent: `${PREFIX}percentRange`,
});

// Eine Angabe als Zahl; ein Wahrheitswert ist hier kein Betrag und zählt wie
// Text, der keine Zahl ist.
function zahl(v) {
  return typeof v === 'boolean' ? null : coerceNumber(v);
}

// Endliches Ergebnis oder die Meldung des Zahlenbereichs; −0 wird zu 0.
function ergebnis(n) {
  if (!Number.isFinite(n)) return messageValue(M.nichtDarstellbar);
  return n === 0 ? 0 : n;
}

// Bereiche der Angaben; eine Angabe ohne `gilt` hat keine Einschränkung.
const BELIEBIG = {};
const GANZES = { gilt: (w) => w !== 0, meldung: M.ganzes };
const ALTER_WERT = { gilt: (o) => o !== 0, meldung: M.alterWert };
const PROZENT_TEILER = { gilt: (p) => p !== 0, meldung: M.prozent };

// Prüft die Angaben der Reihe nach: erst ob sie Zahlen sind, dann je Angabe
// ihren Bereich, und rechnet; ein Meldungs-Wert geht unverändert durch.
function formel(bereiche, rechnung) {
  return (args) => {
    const werte = args.map(zahl);
    if (werte.some((n) => n === null)) return messageValue(M.keineZahl);
    for (let i = 0; i < bereiche.length; i++) {
      if (bereiche[i].gilt && !bereiche[i].gilt(werte[i])) {
        return messageValue(bereiche[i].meldung);
      }
    }
    return ergebnis(rechnung(...werte));
  };
}

const PERCENT_GROUP = Object.freeze({
  namespace: 'percent',
  functions: Object.freeze({
    'percent.share': {
      arity: [2, 2],
      fn: formel([BELIEBIG, GANZES], (part, whole) => (part / whole) * 100),
    },
    'percent.change': {
      arity: [2, 2],
      fn: formel([ALTER_WERT, BELIEBIG], (alt, neu) => ((neu - alt) / alt) * 100),
    },
    'percent.increase': {
      arity: [2, 2],
      fn: formel([BELIEBIG, BELIEBIG], (wert, p) => wert * (1 + p / 100)),
    },
    'percent.decrease': {
      arity: [2, 2],
      fn: formel([BELIEBIG, BELIEBIG], (wert, p) => wert * (1 - p / 100)),
    },
    'percent.base': {
      arity: [2, 2],
      fn: formel([BELIEBIG, PROZENT_TEILER], (w, p) => w / (p / 100)),
    },
  }),
});

module.exports = { PERCENT_GROUP, PERCENT_MESSAGES: M };
