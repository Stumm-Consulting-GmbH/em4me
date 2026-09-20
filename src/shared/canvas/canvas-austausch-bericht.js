// 4T-001805 (Epic 3E-000292): Die Ergebnis-Meldung des Austauschs mit dem
// offenen Format JSON Canvas — aus den gezaehlten Posten des Kerns werden
// Saetze.
//
// **Warum neben dem Kern und nicht in ihm.** `canvas-austausch.js` traegt
// Schluessel und keine Saetze; ein Modul, das Saetze bildete, braeuchte eine
// Sprache und haette damit seine Prozess-Neutralitaet verloren. Diese Datei
// bildet die Saetze — und bleibt selbst sprachfrei, weil sie den Uebersetzer
// als Argument bekommt statt ihn zu importieren. Sie ist damit ohne Electron
// und ohne Renderer vollstaendig pruefbar.
//
// **Eine Funktion fuer beide Richtungen.** Ausgabe und Einlesen zaehlen
// dieselben dreizehn Posten aus demselben Katalog; zwei Fassungen liefen
// auseinander, sobald eine Haelfte einen Posten lernt, den die andere nicht
// kennt (dieselbe Begruendung wie beim gemeinsamen Kern).
'use strict';

const { VERLUST_POSTEN } = require('./canvas-austausch.js');

// Der Schluessel-Raum der Meldung. Ein Posten heisst hier wie im Kern; damit
// ist die Zuordnung eine Namens-Gleichheit und keine zweite Tafel, die
// veralten koennte.
const BERICHT_PRAEFIX = 'canvas.austausch.verlust.';

// Die Reihenfolge der Zeilen ist die Reihenfolge des Katalogs im Kern und
// nicht die des Auftretens: Derselbe Vorgang soll denselben Bericht liefern.
const POSTEN_FOLGE = Object.freeze(Object.keys(VERLUST_POSTEN));

// 4T-001806: Ein Posten, dessen SATZ von der Richtung abhaengt — der gezaehlte
// Posten bleibt derselbe. Beim Ausgeben bleibt ein nicht aufgeloestes Ziel so
// stehen, wie es auf der Karte steht; beim Einlesen wird stattdessen der
// blosse Dateiname geschrieben. Zwei Vorgaenge, zwei Saetze, eine Zahl; ein
// vierzehnter Posten waere dafuer der falsche Griff, weil der Katalog des
// Kerns die Verlust-ARTEN nennt und nicht ihre Formulierungen.
const RICHTUNGS_POSTEN = Object.freeze(['zielNichtAufgeloest']);

// 4T-001806: Der Schluessel-Raum der Fehler, die eine einzelne Datei scheitern
// lassen. Sie sind kein Verlust-Posten: Ein Verlust sagt, was nicht mitkam,
// ein Fehler sagt, dass gar nichts entstanden ist.
const FEHLER_PRAEFIX = 'canvas.austausch.fehler.';

function textMit(t, schluessel, werte) {
  let text = String(t(schluessel));
  for (const [name, wert] of Object.entries(werte || {})) {
    text = text.split(`{${name}}`).join(String(wert));
  }
  return text;
}

/**
 * Die Zeilen des Verlust-Berichts, je Posten eine mit seiner Anzahl.
 *
 * Ein Posten ohne Anzahl und ein unbekannter Schluessel erscheinen nicht: Der
 * Bericht nennt, was geschehen ist, und nicht, was haette geschehen koennen.
 *
 * @param {Array<{schluessel: string, anzahl: number}>} verluste Liste des Kerns.
 * @param {(key: string) => string} t Uebersetzer der aufrufenden Prozess-Seite.
 * @param {'export'|'import'} [richtung] Waehlt den Satz der richtungs-abhaengigen Posten.
 * @returns {string[]}
 */
function verlustZeilen(verluste, t, richtung) {
  const zaehler = new Map();
  for (const posten of Array.isArray(verluste) ? verluste : []) {
    if (!posten || typeof posten.schluessel !== 'string') continue;
    const anzahl = Number(posten.anzahl);
    if (!Number.isFinite(anzahl) || anzahl <= 0) continue;
    zaehler.set(posten.schluessel, (zaehler.get(posten.schluessel) || 0) + anzahl);
  }
  const zeilen = [];
  for (const schluessel of POSTEN_FOLGE) {
    const anzahl = zaehler.get(schluessel);
    if (!anzahl) continue;
    const zusatz = richtung === 'import' && RICHTUNGS_POSTEN.includes(schluessel) ? 'Import' : '';
    zeilen.push(textMit(t, `${BERICHT_PRAEFIX}${schluessel}${zusatz}`, { n: anzahl }));
  }
  return zeilen;
}

// 4T-001806: Die Zeilen EINER gelesenen Datei — ihre Kopfzeile mit dem Namen
// und darunter, eingerueckt, entweder ihr Fehler oder ihre Verlust-Posten.
//
// Auch bei einer einzigen Datei steht die Kopfzeile: Wer mehrere Dateien
// waehlt, braucht sie, und ein Bericht, der bei einer Datei anders aufgebaut
// ist als bei zweien, ist zweimal zu lesen statt einmal.
function dateiZeilen(datei, t) {
  const zeilen = [textMit(t, 'canvas.austausch.dateiKopf', { datei: String(datei.name || '') })];
  if (datei.fehler) {
    zeilen.push(`  ${String(t(`${FEHLER_PRAEFIX}${datei.fehler}`))}`);
    return zeilen;
  }
  const eigene = verlustZeilen(datei.verluste, t, 'import');
  if (eigene.length === 0) zeilen.push(`  ${String(t('canvas.austausch.ohneVerlust'))}`);
  else for (const zeile of eigene) zeilen.push(`  ${zeile}`);
  return zeilen;
}

/**
 * Die vollstaendige Ergebnis-Meldung eines Austausch-Vorgangs.
 *
 * @param {object} daten
 * @param {'export'|'import'} [daten.richtung] Ausgabe oder Einlesen.
 * @param {{karten?: number, gruppen?: number, verbindungen?: number}} [daten.zahlen]
 *   Was uebertragen wurde.
 * @param {number} [daten.uebrigeFlaechen] Weitere Flaechen des Dokuments.
 * @param {Array<{schluessel: string, anzahl: number}>} [daten.verluste]
 * @param {Array<{name: string, zahlen?: object, verluste?: Array<object>, fehler?: string}>}
 *   [daten.dateien] 4T-001806: Die gelesenen Dateien des Einlesens. Sind sie
 *   angegeben, entsteht je Datei ein Abschnitt, und die Zahlen des Kopfes sind
 *   ihre Summe — das ist der EINE gemeinsame Bericht ueber alle gewaehlten
 *   Dateien. Ohne sie bleibt die Form der Ausgabe unveraendert.
 * @param {(key: string) => string} t Uebersetzer der aufrufenden Prozess-Seite.
 * @returns {{titel: string, kopf: string, zeilen: string[], ok: string}}
 */
function austauschBericht(daten, t) {
  const d = daten && typeof daten === 'object' ? daten : {};
  const dateien = Array.isArray(d.dateien)
    ? d.dateien.filter((e) => e && typeof e === 'object')
    : [];
  const zahl = (wert) => {
    const n = Number(wert);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  };
  // Die Zahlen des Kopfes: bei mehreren Dateien die Summe ihrer Zahlen, sonst
  // die mitgegebenen. Gezaehlt wird an einer Stelle, damit Kopf und Abschnitte
  // nicht auseinanderlaufen koennen.
  const zahlen =
    dateien.length > 0
      ? dateien.reduce(
          (summe, datei) => {
            const eigene = datei.zahlen && typeof datei.zahlen === 'object' ? datei.zahlen : {};
            summe.karten += zahl(eigene.karten);
            summe.gruppen += zahl(eigene.gruppen);
            summe.verbindungen += zahl(eigene.verbindungen);
            return summe;
          },
          { karten: 0, gruppen: 0, verbindungen: 0 },
        )
      : d.zahlen && typeof d.zahlen === 'object'
        ? d.zahlen
        : {};
  const kopfSchluessel =
    d.richtung === 'import' ? 'canvas.austausch.kopfImport' : 'canvas.austausch.kopfExport';
  const zeilen = [];
  if (dateien.length > 0) {
    for (const datei of dateien) zeilen.push(...dateiZeilen(datei, t));
  } else {
    zeilen.push(...verlustZeilen(d.verluste, t, d.richtung));
  }
  const uebrige = zahl(d.uebrigeFlaechen);
  if (uebrige > 0) {
    zeilen.push(textMit(t, 'canvas.austausch.uebrigeFlaechen', { n: uebrige }));
  }
  // Der leere Bericht ist selbst eine Aussage und bleibt deshalb nicht stumm:
  // «nichts entfallen» ist genau das, was der Anwender wissen will.
  if (zeilen.length === 0) zeilen.push(String(t('canvas.austausch.ohneVerlust')));
  return {
    titel: String(t('canvas.austausch.titel')),
    kopf: textMit(t, kopfSchluessel, {
      karten: zahl(zahlen.karten),
      gruppen: zahl(zahlen.gruppen),
      verbindungen: zahl(zahlen.verbindungen),
    }),
    zeilen,
    ok: String(t('canvas.austausch.ok')),
  };
}

module.exports = {
  austauschBericht,
  verlustZeilen,
  BERICHT_PRAEFIX,
  FEHLER_PRAEFIX,
  POSTEN_FOLGE,
  RICHTUNGS_POSTEN,
};
