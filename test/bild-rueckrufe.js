// 4T-002945 (Epic 3E-000452): Rückrufe des nächsten Bilds sofort, als Schalter
// der Unit-Suite. Stellt den Zustand unter Last her.
//
// **Wozu.** In der Browser-Nachbildung feuern die Rückrufe des nächsten Bilds
// (`requestAnimationFrame`) im Takt von rund 16 Millisekunden. Ohne Last ist
// ein Fall mit seiner Editor-Ansicht vorher fertig und abgebaut; der Rückruf
// läuft dann nie, und was er aufruft, wird nie geprüft. Unter Last feuert er
// zwischen Fall und Abbau, und ein Fehler darin macht den Lauf rot, obwohl
// jeder Fall grün ist (so am 2026-11-21, Anlass von test/browser-nachbildung.js).
// Im gewöhnlichen Lauf zeigt sich das nicht: Am 2026-11-26 fragte dort keine
// einzige Prüfdatei die fehlenden Layout-Funktionen ab, mit diesem Schalter
// fünf.
//
// **Schalter.** Die Umgebungs-Variable `EM4ME_BILD_RUECKRUFE=sofort`. Ohne
// Variable oder leer bleibt alles unverändert; eine andere Angabe bricht jede
// Prüfdatei ab.
//
//   EM4ME_BILD_RUECKRUFE=sofort npx vitest run test/unit/renderer/
//
// **Bauart.** `requestAnimationFrame` reiht den Rückruf als Kleinst-Schritt
// ein statt als Zeitgeber: Er läuft, sobald der laufende Code zum ersten Mal
// abgibt, also spätestens zwischen dem Rumpf eines Falls und seinem Abbau. Ein
// Fehler im Rückruf wird nicht gefangen und macht den Lauf rot, wie unter
// Last. Ruft ein Rückruf in seinem Rumpf wieder `requestAnimationFrame` auf,
// geht das bis zu einer Kettenlänge von 20 sofort weiter und danach über den
// gewöhnlichen Zeitgeber, damit eine Dauer-Animation den Lauf nicht anhält.
// Die Grenze zählt nur die Anforderung im Rumpf des Rückrufs: Fordert ein
// Rückruf erst nach einem `await` wieder an, beginnt die Zählung neu, und eine
// solche Schleife liefe unter dem Schalter als endlose Folge von
// Kleinst-Schritten (am 2026-11-26 gab es das weder im Programm noch in einer
// Prüfdatei).
//
// **Die Griffe sind positiv, aus einem eigenen hohen Bereich.** Die
// Editor-Bibliothek liest jeden Griff unter null als «nichts angefordert»
// (`measureScheduled < 0`, `delayedFlush < 0` in @codemirror/view): Mit
// negativen Griffen forderte sie bei jedem Anstoß erneut an und bräche nie
// ab, und Rückrufe liefen doppelt. So war die erste Fassung gebaut; der
// Zweitblick hat es gefunden.
//
// **Grenzen.** Ohne Browser-Nachbildung gibt es die Funktion nicht, und der
// Schalter tut nichts. Er ist ein Mess- und Prüf-Werkzeug und in keinem Gate
// eingehängt.

export const RUECKRUF_VARIABLE = 'EM4ME_BILD_RUECKRUFE';
export const RUECKRUFE_SOFORT = 'sofort';

const MARKE = Symbol.for('em4me.bild-rueckrufe-sofort');
const KETTE_HOECHSTENS = 20;
// Erster eigener Griff. Die Nachbildung zählt ihre Griffe von eins an hoch;
// der Abstand hält beide Bereiche in jeder Prüfdatei auseinander.
export const ERSTER_GRIFF = 2 ** 30;

export function sindSofort(ziel = globalThis) {
  return typeof ziel.requestAnimationFrame === 'function' && !!ziel.requestAnimationFrame[MARKE];
}

// Schaltet ein und liefert die Funktion, die wieder abschaltet. Ohne
// `requestAnimationFrame` am Ziel oder bei schon eingeschaltetem Schalter
// bleibt alles, wie es ist.
export function rueckrufeSofort(ziel = globalThis) {
  if (typeof ziel.requestAnimationFrame !== 'function' || sindSofort(ziel)) return () => {};
  const echt = {
    requestAnimationFrame: ziel.requestAnimationFrame,
    cancelAnimationFrame: ziel.cancelAnimationFrame,
  };
  const wartend = new Map();
  let naechste = ERSTER_GRIFF;
  // Das Glied der Kette, dessen Rückruf gerade läuft; 0 außerhalb jedes
  // Rückrufs. Die Kleinst-Schritte laufen nacheinander und nie verschachtelt,
  // deshalb trägt jede Anforderung ihr Glied selbst mit.
  let laufendesGlied = 0;
  const anfordern = function requestAnimationFrame(rueckruf) {
    const glied = laufendesGlied + 1;
    if (glied > KETTE_HOECHSTENS) return echt.requestAnimationFrame.call(ziel, rueckruf);
    const griff = naechste++;
    wartend.set(griff, rueckruf);
    ziel.queueMicrotask(() => {
      if (!wartend.has(griff)) return;
      wartend.delete(griff);
      laufendesGlied = glied;
      try {
        rueckruf(ziel.performance.now());
      } finally {
        laufendesGlied = 0;
      }
    });
    return griff;
  };
  Object.defineProperty(anfordern, MARKE, { value: true });
  const abbrechen = function cancelAnimationFrame(griff) {
    // Ein eigener Griff steht in der eigenen Liste oder ist schon gelaufen;
    // alles darunter gehört der Nachbildung.
    if (griff >= ERSTER_GRIFF) wartend.delete(griff);
    else echt.cancelAnimationFrame.call(ziel, griff);
  };
  ziel.requestAnimationFrame = anfordern;
  ziel.cancelAnimationFrame = abbrechen;
  return () => {
    ziel.requestAnimationFrame = echt.requestAnimationFrame;
    ziel.cancelAnimationFrame = echt.cancelAnimationFrame;
  };
}

// Aufgerufen aus der Vorbereitungs-Datei der Unit-Suite
// (test/zeitgrenze-je-fall.js). Liefert, ob eingeschaltet wurde.
export function installiereAusUmgebung(
  umgebung = globalThis.process?.env ?? {},
  ziel = globalThis,
) {
  const angabe = umgebung[RUECKRUF_VARIABLE];
  if (angabe === undefined || angabe === '') return false;
  if (angabe !== RUECKRUFE_SOFORT)
    throw new Error(
      `${RUECKRUF_VARIABLE}=${angabe} ist keine bekannte Angabe; gültig ist allein «${RUECKRUFE_SOFORT}».`,
    );
  if (typeof ziel.requestAnimationFrame !== 'function') return false;
  rueckrufeSofort(ziel);
  return true;
}
