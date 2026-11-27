// 4T-002941 (Epic 3E-000452): Das erschöpfte Zeitbudget des Zerlegers, als
// Schalter der Unit-Suite.
//
// **Wozu.** Der Zerleger des Editors (@codemirror/language) arbeitet mit einem
// stillschweigenden Zeitbudget: Beim Anlegen eines Zustands und nach jeder
// Änderung zerlegt er höchstens 20 Millisekunden lang und liefert den Rest im
// Nachlauf. Ohne Last reicht das für die kurzen Dokumente der Prüffälle immer;
// unter Last nicht, und ein Prüffall, der den Syntax-Baum liest, ohne auf seine
// Vollständigkeit zu warten, wird dann rot (Stabilitätsregel 38). Dieser
// Schalter stellt den Zustand ohne Last her, damit sich messen lässt, welche
// Prüffälle am stillschweigenden Budget hängen.
//
// **Schalter.** Die Umgebungs-Variable `EM4ME_ZERLEGE_BUDGET=erschoepft`. Ohne
// Variable oder leer bleibt alles unverändert. Eine andere Angabe bricht jede
// Prüfdatei ab, statt still mit vollem Budget zu laufen: Ein grüner Lauf «mit
// erschöpftem Budget» ohne erschöpftes Budget wäre eine falsche Aussage.
//
//   EM4ME_ZERLEGE_BUDGET=erschoepft npx vitest run test/unit/renderer/
//
// **Bauart.** `Date.now()` läuft für Aufrufe aus @codemirror/language (am
// Aufruf-Stapel erkannt) je Abfrage eine Sekunde weiter; der Zerleger sieht
// sein Budget damit nach dem ersten Schritt als verbraucht. Ausgenommen sind
// Aufrufe unter `ensureSyntaxTree` und `forceParsing`: Ausdrückliches Warten
// arbeitet mit der echten Uhr, sonst würden auch Prüfdateien rot, die richtig
// warten. Alle anderen Aufrufer sehen die echte Uhr.
//
// **Grenzen.** Eine gestellte Uhr von Vitest (`vi.useFakeTimers`) ersetzt
// `Date` für ihre Dauer; in dieser Zeit wirkt der Schalter nicht. Der Schalter
// ist ein Mess-Werkzeug und in keinem Gate eingehängt.

export const BUDGET_VARIABLE = 'EM4ME_ZERLEGE_BUDGET';
export const BUDGET_ERSCHOEPFT = 'erschoepft';

const MARKE = Symbol.for('em4me.zerlege-budget');
const AUS_ZERLEGER = /@codemirror[\\/]language/;
const AUSDRUECKLICH = /ensureSyntaxTree|forceParsing/;
const SPRUNG_MS = 1000;

export function istErschoepft(ziel = globalThis) {
  return !!ziel.Date[MARKE];
}

// Schaltet das erschöpfte Budget ein und liefert die Funktion, die es wieder
// abschaltet. Ist es schon eingeschaltet, bleibt alles, wie es ist, und die
// gelieferte Funktion tut nichts.
export function erschoepfe(ziel = globalThis) {
  const uhr = ziel.Date;
  if (uhr[MARKE]) return () => {};
  const echt = uhr.now;
  let vorlauf = 0;
  uhr.now = function now() {
    const stapel = new Error().stack || '';
    if (AUS_ZERLEGER.test(stapel) && !AUSDRUECKLICH.test(stapel)) {
      vorlauf += SPRUNG_MS;
      return echt.call(uhr) + vorlauf;
    }
    return echt.call(uhr);
  };
  Object.defineProperty(uhr, MARKE, { value: true, configurable: true });
  return () => {
    uhr.now = echt;
    delete uhr[MARKE];
  };
}

// Aufgerufen aus der Vorbereitungs-Datei der Unit-Suite
// (test/zeitgrenze-je-fall.js). Liefert, ob eingeschaltet wurde.
export function installiereAusUmgebung(
  umgebung = globalThis.process?.env ?? {},
  ziel = globalThis,
) {
  const angabe = umgebung[BUDGET_VARIABLE];
  if (angabe === undefined || angabe === '') return false;
  if (angabe !== BUDGET_ERSCHOEPFT)
    throw new Error(
      `${BUDGET_VARIABLE}=${angabe} ist keine bekannte Angabe; gültig ist allein «${BUDGET_ERSCHOEPFT}».`,
    );
  erschoepfe(ziel);
  return true;
}
