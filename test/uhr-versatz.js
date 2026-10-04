// 4T-002064 (Epic 3E-000156): Die verschobene Uhr der Unit-Suite.
//
// **Wozu.** Ein Prüffall mit festem Kalender-Termin, dessen Erwartung an
// «heute» hängt, wird an einem bestimmbaren Tag rot, und zwar an einem, an dem
// niemand an ihm arbeitet (4T-002063). Läuft die Suite mit einer um Jahre
// verschobenen Uhr, wird derselbe Fall heute rot. Den Lauf fährt das Gate
// `test:uhr` der vollen Gates (scripts/gate-uhr.js).
//
// **Schalter.** Die Umgebungs-Variable `EM4ME_UHR_VERSATZ` mit einer ISO-Dauer
// aus Jahren, Monaten, Wochen und Tagen (`P1D`, `P1M`, `P1Y`, `P5Y`, `P1Y2M3D`,
// auch negativ: `-P8D`). Ohne Variable oder leer bleibt alles unverändert. Eine
// unlesbare Angabe bricht jede Prüfdatei ab, statt still unverschoben zu laufen:
// Ein grüner «verschobener» Lauf ohne Verschiebung wäre eine falsche Aussage.
//
// **Bauart (gemessen am 2026-10-02, Lösungs-Kapitel des Vorgangs).** Die
// Verschiebung ist ein fester Abstand in Millisekunden, einmal je Prüfdatei aus
// der Kalender-Dauer gerechnet. `Date` wird durch einen Konstruktor ersetzt, der
// allein den argumentlosen Aufruf (`new Date()`, `Date()`, `Date.now()`) um den
// Abstand verschiebt; jeder Aufruf mit Argument bleibt unberührt. Die Uhr läuft
// damit weiter — Dauern aus zwei `Date.now()` bleiben richtig —, und
// `performance.now()` sowie `process.hrtime` sind nicht berührt.
//
// Zwei Wechselwirkungen mit den gestellten Uhren von Vitest, beide gemessen:
//
// - `vi.useFakeTimers()` liest beim Einschalten `Date.now()` und merkt sich den
//   vorgefundenen Konstruktor; `vi.useRealTimers()` setzt genau diesen zurück.
//   Eine gestellte Uhr hat damit Vorrang, und danach gilt wieder die
//   verschobene.
// - `vi.setSystemTime()` **ohne** vorheriges `vi.useFakeTimers()` ersetzt `Date`
//   durch eine eigene Attrappe, und `vi.useRealTimers()` setzt danach den
//   Konstruktor zurück, den Vitest **beim Laden** gesehen hat — den
//   unverschobenen. Deshalb ist `globalThis.Date` hier eine Eigenschaft mit
//   Zugriffs-Funktionen: Wer den unverschobenen Konstruktor zurückschreibt,
//   bekommt den verschobenen; jeder andere Wert gilt, wie er geschrieben ist.
//
// **Grenzen.** Kindprozesse (git, node, npm aus einem Prüffall) laufen mit der
// echten Uhr; ebenso eigene Fenster-Kontexte (`JSDOM` mit `runScripts`),
// `Intl.DateTimeFormat().format()` ohne Argument und Datei-Zeiten des
// Dateisystems. Eine Prüfdatei, die die Uhr mit einer dieser zweiten Uhren
// vergleicht, setzt die Verschiebung aus (`setzeUhrVersatzAus`).

import process from 'node:process';

// Name der Umgebungs-Variable. Dieselbe Zeichenkette steht in
// scripts/gate-uhr.js, das den Wächter-Lauf damit startet; diese Datei bezieht
// sie bewusst nicht von dort, weil sie mit der Suite in den öffentlichen
// Quellcode-Export geht und das Gate-Modul nicht. Den Gleichlauf beider hält
// test/unit/gate-uhr.test.js.
export const UHR_VARIABLE = 'EM4ME_UHR_VERSATZ';

// Zustand je globalem Objekt. `Symbol.for`, damit eine zweite Auswertung dieses
// Moduls im selben Prozess denselben Zustand findet und nicht doppelt verschiebt.
const MARKE = Symbol.for('em4me.uhr-versatz');

// ISO-8601-Dauer ohne Zeit-Anteil: Jahre, Monate, Wochen, Tage, optional negativ.
const ISO_DAUER = /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/;

/**
 * Abstand in Millisekunden, um den eine ISO-Dauer den Zeitpunkt `bezugMs`
 * verschiebt. Kalender-genau in UTC: `P1M` ab dem 31. Januar landet nach den
 * Regeln von `Date` am 2. oder 3. März. Leer oder fehlend heißt 0.
 *
 * @throws {Error} bei einer unlesbaren Angabe
 */
export function versatzInMs(angabe, bezugMs, Echt = Date) {
  const text = String(angabe ?? '').trim();
  if (text === '') return 0;
  const treffer = ISO_DAUER.exec(text);
  if (!treffer || !/\d/.test(text)) {
    throw new Error(
      `${UHR_VARIABLE}="${text}" ist keine ISO-Dauer aus Jahren, Monaten, Wochen und Tagen ` +
        '(Beispiele: P1D, P1M, P1Y, P5Y, -P8D).',
    );
  }
  const vorzeichen = treffer[1] ? -1 : 1;
  const [jahre, monate, wochen, tage] = treffer.slice(2).map((t) => vorzeichen * Number(t || 0));
  const ziel = new Echt(bezugMs);
  ziel.setUTCFullYear(
    ziel.getUTCFullYear() + jahre,
    ziel.getUTCMonth() + monate,
    ziel.getUTCDate() + 7 * wochen + tage,
  );
  return ziel.getTime() - bezugMs;
}

/**
 * Ein `Date`-Ersatz, der allein den argumentlosen Aufruf um `versatzMs`
 * verschiebt. Instanzen sind echte Datums-Objekte mit dem Prototyp von `Echt`;
 * `instanceof` gilt deshalb gegen beide Konstruktoren.
 */
export function verschobeneUhr(Echt, versatzMs) {
  function Uhr(...args) {
    if (!new.target) return new Echt(Echt.now() + versatzMs).toString();
    return Reflect.construct(Echt, args.length === 0 ? [Echt.now() + versatzMs] : args, new.target);
  }
  Object.setPrototypeOf(Uhr, Echt);
  Uhr.prototype = Echt.prototype;
  Uhr.now = () => Echt.now() + versatzMs;
  return Uhr;
}

/**
 * Verschiebt `ziel.Date` um `versatzMs`. Ein zweiter Aufruf am selben Ziel
 * liefert den bestehenden Zustand, statt doppelt zu verschieben.
 *
 * @returns {{echt: Function, uhr: Function, versatzMs: number, entferne: Function}}
 */
export function installiere(ziel, versatzMs) {
  if (ziel[MARKE]) return ziel[MARKE];
  const vorher = Object.getOwnPropertyDescriptor(ziel, 'Date');
  const echt = ziel.Date;
  const uhr = verschobeneUhr(echt, versatzMs);
  let aktuell = uhr;
  Object.defineProperty(ziel, 'Date', {
    configurable: true,
    enumerable: vorher ? vorher.enumerable : false,
    get: () => aktuell,
    set: (wert) => {
      aktuell = wert === echt ? uhr : wert;
    },
  });
  const zustand = {
    echt,
    uhr,
    versatzMs,
    entferne() {
      if (vorher) Object.defineProperty(ziel, 'Date', vorher);
      else delete ziel.Date;
      delete ziel[MARKE];
    },
  };
  Object.defineProperty(ziel, MARKE, { value: zustand, configurable: true });
  return zustand;
}

/** Zustand der Verschiebung am Ziel oder null. */
export function zustand(ziel = globalThis) {
  return ziel[MARKE] || null;
}

/**
 * Die echte Zeit in Millisekunden, unabhängig von einer Verschiebung. Für
 * Prüffälle des Wächters selbst, die einen Termin relativ zur echten Uhr bauen.
 */
export function echteZeit(ziel = globalThis) {
  const z = zustand(ziel);
  return (z ? z.echt : ziel.Date).now();
}

/**
 * Setzt die Verschiebung für die aufrufende Prüfdatei aus. Aufzurufen auf der
 * obersten Ebene der Prüfdatei, nach den Importen; die nächste Prüfdatei
 * verschiebt wieder.
 *
 * Gedacht allein für Prüfdateien, die die Uhr mit einer **zweiten** Uhr
 * vergleichen, die die Verschiebung nicht erreicht: Datei-Zeiten des
 * Dateisystems (Alter einer Datei gegen eine Frist) oder die Uhr eines
 * Kindprozesses. Unter Verschiebung sähe eine eben angelegte Datei um die
 * Verschiebung gealtert aus, und ein Kindprozess wartete auf einen Zeitpunkt,
 * den seine Uhr erst Jahre später erreicht. Solche Fälle sind keine
 * Wanduhr-Abhängigkeit, sondern eine Grenze der Bauart; die Liste der
 * aussetzenden Prüfdateien steht im Lösungs-Kapitel von 4T-002064 und in
 * Regel 33 von test/README.md. Ein Fall, der einen festen Kalender-Termin
 * gegen «heute» prüft, setzt nicht aus, sondern stellt die Uhr.
 *
 * @param {string} grund welche zweite Uhr verglichen wird (Pflicht)
 * @returns {boolean} ob eine Verschiebung ausgesetzt wurde
 */
export function setzeUhrVersatzAus(grund, ziel = globalThis) {
  if (String(grund ?? '').trim().length < 10) {
    throw new Error('setzeUhrVersatzAus braucht einen Grund: welche zweite Uhr wird verglichen?');
  }
  const z = zustand(ziel);
  if (!z) return false;
  z.entferne();
  return true;
}

/**
 * Liest die Umgebungs-Variable und verschiebt die Uhr, wenn sie gesetzt ist.
 * Aufgerufen aus der Vorbereitungs-Datei der Unit-Suite (test/zeitgrenze-je-fall.js).
 */
export function installiereAusUmgebung(umgebung = process.env, ziel = globalThis) {
  const angabe = umgebung[UHR_VARIABLE];
  if (angabe === undefined || String(angabe).trim() === '') return null;
  if (ziel[MARKE]) return ziel[MARKE];
  return installiere(ziel, versatzInMs(angabe, ziel.Date.now(), ziel.Date));
}
