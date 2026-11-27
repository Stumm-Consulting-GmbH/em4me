// 4T-002883 (Epic 3E-000452): Kein Zeitgeber überlebt das Ende seiner Prüfdatei.
//
// **Wozu.** Module des Programms entprellen mit Zeitgebern auf Modul-Ebene
// (Wortzählung 150 ms, Prüfung im Editor 300 ms, Gliederung 200 ms und weitere).
// Im Programm gibt es das Dokument, auf das der Rückruf zugreift, immer. In
// einer Prüfdatei kann der Zeitgeber noch offen sein, wenn die Datei zu Ende
// ist; feuert er, nachdem die Prüf-Umgebung abgebaut ist, scheitert der Rückruf
// (`ReferenceError: document is not defined`), und ein nicht abgefangener
// Fehler macht den ganzen Lauf rot, obwohl jeder Fall grün ist. Belegt am
// 2026-11-21 an der Wortzählung; die Messung vom 2026-11-26 fand in 72 von 271
// Prüfdateien mit Browser-Nachbildung offene Zeitgeber am Datei-Ende, aus 19
// Stellen des Programms mit einer Laufzeit ab 50 ms. Ob einer davon den Lauf
// kippt, hängt allein davon ab, wie lange der Abbau unter Last dauert.
//
// **Wie.** `fuehreBuch` hüllt die vier Zeitgeber-Funktionen der Umgebung
// (`setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`) und führt Buch
// über jeden Griff, der noch offen ist. `loescheOffene` löscht am Ende der
// Prüfdatei, was noch im Buch steht. Eingehängt wird beides in der einen
// Vorbereitungs-Datei der Unit-Suite (test/zeitgrenze-je-fall.js); deren Haken
// läuft nach den Abbau-Haken der Prüfdatei selbst.
//
// **Grenzen, bewusst.** Das Verhalten eines Zeitgebers während der Prüfdatei
// ändert sich nicht: Er feuert wie bisher, die Hülle streicht ihn dabei nur aus
// dem Buch. Gestellte Uhren (`vi.useFakeTimers`) setzen sich auf die Hülle und
// stellen sie beim Abschalten wieder her; ihre gestellten Zeitgeber stehen
// nicht im Buch und vergehen mit der gestellten Uhr. Die eigenen Zeitgeber von
// Vitest laufen über dessen gesicherte Originale an der Hülle vorbei. Nicht
// erfasst ist, was die Zeitgeber anders bezieht (`node:timers` importiert,
// `queueMicrotask`, `setImmediate`), ebenso `util.promisify(setTimeout)`, das
// über die mitgenommene Eigenschaft bei `node:timers/promises` landet, und ein
// einmaliger Zeitgeber, den `refresh()` nach dem Feuern wieder in Gang setzt.
// Und der Haken läuft nach den `afterAll`-Haken der Prüfdatei, aber vor den
// Aufräum-Funktionen, die ein `beforeAll` auf Datei-Ebene zurückgibt, und vor
// dem Aufräumen von Datei-Fixtures: Ein Zeitgeber, der erst dort entsteht,
// entgeht dem Buch (Reihenfolge in @vitest/runner; am 2026-11-26 nutzte keine
// Prüfdatei unter test/unit dieses Muster so).
//
// **Spur.** Mit `EM4ME_ZEITGEBER_SPUR=1` schreibt die Vorbereitungs-Datei je
// Prüfdatei auf die Fehler-Ausgabe, wie viele Zeitgeber am Ende gelöscht
// wurden; so lässt sich nachmessen, welche Prüfdateien welche hinterlassen.
//
// **Zähl-Spur für `setImmediate`** (4T-002945). Das Buch erfasst
// `setImmediate` bewusst nicht: Die Messung vom 2026-11-26 fand in den 130
// Prüfdateien, die über ihre Bezüge eine der sieben Stellen des Hauptprozesses
// erreichen, 200 gesetzte und am Datei-Ende keinen offenen Rückruf. Damit die
// Messung wiederholbar bleibt, zählt `zaehleSofortige` unter derselben Spur
// die gesetzten und die am Datei-Ende noch offenen Rückrufe, ohne etwas zu
// löschen; ohne die Spur wird `setImmediate` nicht angefasst.
//
//   EM4ME_ZEITGEBER_SPUR=1 npx vitest run test/unit/
//
// Jede Zeile «setImmediate … gesetzt, N am Datei-Ende offen» mit N über null
// ist der Anlass, das Buch zu erweitern. Fünf der sieben Stellen geben nur
// einmal ab, und ihr Aufrufer wartet darauf; das Risiko liegt bei den zwei
// Stellen, die einen eigenen Rückruf absetzen, auf den niemand wartet
// (Bereichs-Beobachtung und Netzpfade im Hauptprozess). Eine neue Stelle
// dieser zweiten Art ist der Anlass, die Messung zu wiederholen.

const MARKE = Symbol.for('em4me.zeitgeber-am-datei-ende');
const SOFORT_MARKE = Symbol.for('em4me.zeitgeber-am-datei-ende.sofort');
const NICHT_KOPIERT = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);

// Nimmt eigene Eigenschaften des Originals mit, allen voran die Form, die
// `util.promisify(setTimeout)` erwartet.
function uebernimmEigenschaften(ersatz, original, name) {
  for (const schluessel of Reflect.ownKeys(original)) {
    if (NICHT_KOPIERT.has(schluessel)) continue;
    try {
      Object.defineProperty(
        ersatz,
        schluessel,
        Object.getOwnPropertyDescriptor(original, schluessel),
      );
    } catch {
      /* eine nicht übertragbare Eigenschaft ändert nichts am Zeitgeber */
    }
  }
  Object.defineProperty(ersatz, 'name', { value: name, configurable: true });
  return ersatz;
}

// Hüllt die Zeitgeber-Funktionen von `ziel` und liefert das Buch. Ein zweiter
// Aufruf für dasselbe Ziel liefert dasselbe Buch und hüllt nicht doppelt.
export function fuehreBuch(ziel = globalThis) {
  if (ziel[MARKE]) return ziel[MARKE];
  const echt = {
    setTimeout: ziel.setTimeout,
    clearTimeout: ziel.clearTimeout,
    setInterval: ziel.setInterval,
    clearInterval: ziel.clearInterval,
  };
  const offen = new Set();

  function setzer(name, einmalig) {
    const original = echt[name];
    const ersatz = function (rueckruf, ...rest) {
      const empfaenger = this ?? ziel;
      if (typeof rueckruf !== 'function')
        return Reflect.apply(original, empfaenger, [rueckruf, ...rest]);
      let griff = null;
      // Ein einmaliger Zeitgeber streicht sich beim Feuern selbst aus dem Buch;
      // ein wiederkehrender bleibt stehen, bis er gelöscht wird.
      const gehuellt = einmalig
        ? function (...args) {
            offen.delete(griff);
            return Reflect.apply(rueckruf, this, args);
          }
        : rueckruf;
      griff = Reflect.apply(original, empfaenger, [gehuellt, ...rest]);
      offen.add(griff);
      return griff;
    };
    return uebernimmEigenschaften(ersatz, original, name);
  }

  function loescher(name) {
    const original = echt[name];
    const ersatz = function (griff) {
      offen.delete(griff);
      return Reflect.apply(original, this ?? ziel, [griff]);
    };
    return uebernimmEigenschaften(ersatz, original, name);
  }

  ziel.setTimeout = setzer('setTimeout', true);
  ziel.setInterval = setzer('setInterval', false);
  ziel.clearTimeout = loescher('clearTimeout');
  ziel.clearInterval = loescher('clearInterval');

  const buch = { ziel, echt, offen };
  Object.defineProperty(ziel, MARKE, { value: buch, configurable: true });
  return buch;
}

// Löscht alle Zeitgeber, die noch im Buch stehen, und liefert ihre Zahl.
// Gelöscht wird über die Originale, damit eine noch eingeschaltete gestellte
// Uhr den Aufruf nicht abfängt.
export function loescheOffene(buch) {
  const zahl = buch.offen.size;
  for (const griff of buch.offen) {
    Reflect.apply(buch.echt.clearTimeout, buch.ziel, [griff]);
    Reflect.apply(buch.echt.clearInterval, buch.ziel, [griff]);
  }
  buch.offen.clear();
  return zahl;
}

// Ob die Spur eingeschaltet ist (Kopf dieser Datei). Die Umgebung kommt vom
// Ziel, damit ein Prüffall sie stellt.
export function spurEin(ziel = globalThis) {
  return ziel.process?.env?.EM4ME_ZEITGEBER_SPUR === '1';
}

// Schreibt die Spur je Prüfdatei, wenn sie eingeschaltet ist. Umgebung und
// Ausgabe kommen vom Ziel, damit ein Prüffall beide stellt.
export function meldeSpur(zahl, ziel = globalThis) {
  if (zahl > 0 && spurEin(ziel))
    ziel.console.error(`zeitgeber-am-datei-ende: ${zahl} offene Zeitgeber gelöscht`);
}

// Zähl-Spur für `setImmediate` (Kopf dieser Datei): hüllt `setImmediate` und
// `clearImmediate` von `ziel` und zählt, was gesetzt wird und was noch offen
// ist. Gelöscht wird nichts. Ein zweiter Aufruf für dasselbe Ziel liefert
// denselben Zähler; ein Ziel ohne `setImmediate` bleibt, wie es ist.
export function zaehleSofortige(ziel = globalThis) {
  if (ziel[SOFORT_MARKE]) return ziel[SOFORT_MARKE];
  const zaehler = { gesetzt: 0, offen: new Set() };
  if (typeof ziel.setImmediate !== 'function') return zaehler;
  const echt = { setImmediate: ziel.setImmediate, clearImmediate: ziel.clearImmediate };
  ziel.setImmediate = uebernimmEigenschaften(
    function (rueckruf, ...rest) {
      const empfaenger = this ?? ziel;
      if (typeof rueckruf !== 'function')
        return Reflect.apply(echt.setImmediate, empfaenger, [rueckruf, ...rest]);
      zaehler.gesetzt++;
      let griff = null;
      const gehuellt = function (...args) {
        zaehler.offen.delete(griff);
        return Reflect.apply(rueckruf, this, args);
      };
      griff = Reflect.apply(echt.setImmediate, empfaenger, [gehuellt, ...rest]);
      zaehler.offen.add(griff);
      return griff;
    },
    echt.setImmediate,
    'setImmediate',
  );
  ziel.clearImmediate = uebernimmEigenschaften(
    function (griff) {
      zaehler.offen.delete(griff);
      return Reflect.apply(echt.clearImmediate, this ?? ziel, [griff]);
    },
    echt.clearImmediate,
    'clearImmediate',
  );
  Object.defineProperty(ziel, SOFORT_MARKE, { value: zaehler, configurable: true });
  return zaehler;
}

// Schreibt die Zähl-Spur je Prüfdatei, wenn die Spur eingeschaltet ist und
// die Prüfdatei überhaupt einen solchen Rückruf gesetzt hat.
export function meldeSofortSpur(zaehler, ziel = globalThis) {
  if (zaehler.gesetzt > 0 && spurEin(ziel))
    ziel.console.error(
      `zeitgeber-am-datei-ende: setImmediate ${zaehler.gesetzt} gesetzt, ${zaehler.offen.size} am Datei-Ende offen`,
    );
}
