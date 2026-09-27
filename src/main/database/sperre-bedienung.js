// 4T-001941 (Epic 3E-000257, Bauplan B1): Die Bedienung der Datensatz-Sperre
// aus der Einzel-Maske — nehmen beim Beginn der Bearbeitung, freigeben an ihrem
// Ende, brechen im Konflikt und eine Auskunft ohne zu nehmen.
//
// **Die Regeln liegen nicht hier**, sondern in der Sperr-Verwaltung
// (`lock-lifecycle.js`): Absturz-Rest, Frist, eigener Prozess und die Wege aus
// einem Konflikt. Dieses Modul bildet allein den Gegenstand aus Tabelle und
// Kennung und bringt die Ergebnisse auf eine sprachneutrale Form für den Kanal
// `database:sperre`; den Satz dazu bildet die Maske.
//
// **Der Gegenstand hat dieselbe Form wie in der Sperr-Menge eines Auftrags**
// (`baueSperrMenge` in `record-auftrag.js`): `{ art: 'record', tabelle, id }`
// mit der aufgefüllten Kennung. Nur so erkennt die Schreib-Schnittstelle die
// Sperre der Bearbeitung beim Speichern als bereits gehalten und nimmt sie
// weder ein zweites Mal noch gibt sie sie danach frei.
//
// **Electron-frei und mit hereingereichter Sperr-Verwaltung**, wie die
// Schreib-Schnittstelle: Es gibt je Prozess genau eine Verwaltung, weil ihr
// Eigen-Register nur dann weiß, welche Sperren dieses Programm hält.
//
// **Das Tor der Erweiterung ist Pflicht-Naht und wird bei jedem Aufruf frisch
// gefragt** (E15.2, Muster der Schreib-Schnittstelle): Ist die Erweiterung
// «Datenbank» aus oder fehlt das Tor, wird nichts genommen, nichts freigegeben
// und nichts gelesen.
'use strict';

const { ART_DATENSATZ, loeseGegenstand } = require('./lock-store.js');
const { SPERR_FRIST_MS } = require('./lock-lifecycle.js');
const { kennungFuer, nummerAus } = require('../../shared/database/record-identity.js');

const AKTIONEN = Object.freeze({
  nehmen: 'nehmen',
  freigeben: 'freigeben',
  brechen: 'brechen',
  auskunft: 'auskunft',
});

// Code, wenn die Kennung keine gültige interne Kennung ist. Derselbe Code, den
// der Sperr-Speicher für einen unbrauchbaren Gegenstand meldet.
const CODE_GEGENSTAND = 'sperrGegenstandUngueltig';

function ohneZugriff() {
  return { status: 'unavailable' };
}

// Ein Fehlschlag der Verwaltung reist mit seinem Code und ohne seinen Text: Der
// Text ist eine interne Beschreibung und kein Satz für den Anwender.
function fehlschlag(ergebnis) {
  return { status: 'error', code: (ergebnis && ergebnis.code) || null };
}

// Nehmen und Brechen liefern dieselbe Form. `stand` ist beim Halten der Stand
// der eigenen Sperre, im Konflikt der Stand der vorgefundenen, über den ein
// Bruch geurteilt werden muss.
function alsNahme(ergebnis) {
  if (!ergebnis || ergebnis.ok !== true) return fehlschlag(ergebnis);
  const gehalten = ergebnis.gehalten === true;
  const konflikt = gehalten ? null : ergebnis.konflikt || null;
  let stand = null;
  if (gehalten) stand = ergebnis.stand || null;
  else if (konflikt) stand = konflikt.stand || null;
  return {
    status: 'ready',
    gehalten,
    uebernommen: ergebnis.uebernommen === true,
    gebrochen: ergebnis.gebrochen === true,
    grund: ergebnis.grund || null,
    konflikt,
    stand,
    fristMs: SPERR_FRIST_MS,
  };
}

function alsFreigabe(ergebnis) {
  if (!ergebnis || ergebnis.ok !== true) return fehlschlag(ergebnis);
  return {
    status: 'ready',
    freigegeben: ergebnis.freigegeben === true,
    grund: ergebnis.grund || null,
    // Verloren: Ein anderer hat die eigene Sperre gebrochen. Die Maske meldet
    // das nach dem Speichern (Bauplan B2).
    verloren: ergebnis.verloren === true,
  };
}

// Die Auskunft über `lebendeSperren`: dieselbe Einordnung wie ein Nehm-Versuch,
// ohne etwas anzulegen. **Nicht lebend** sind dort der Absturz-Rest und die
// abgelaufene fremde Sperre; beide erscheinen hier als `lebend: false`, weil
// ein Nehm-Versuch sie übernähme beziehungsweise zum Bruch anböte.
async function auskunft(sperrVerwaltung, wurzel, gegenstand) {
  const liste = await sperrVerwaltung.lebendeSperren(wurzel);
  if (!liste || liste.ok !== true) return fehlschlag(liste);
  const gesucht = loeseGegenstand(wurzel, gegenstand);
  if (!gesucht.ok) return fehlschlag(gesucht);
  const treffer = liste.sperren.find((sperre) => {
    const g = loeseGegenstand(wurzel, sperre.gegenstand);
    return (
      g.ok &&
      g.art === gesucht.art &&
      g.schluessel === gesucht.schluessel &&
      g.kennung === gesucht.kennung
    );
  });
  return {
    status: 'ready',
    lebend: !!treffer,
    konflikt: treffer ? treffer.konflikt : null,
    fristMs: SPERR_FRIST_MS,
  };
}

/**
 * Bedient die Datensatz-Sperre eines Datensatzes.
 *
 * @param {object} p
 * @param {object} p.sperrVerwaltung Die eine Sperr-Verwaltung des Prozesses.
 * @param {() => boolean} p.erweiterungAktiv Das Tor der Erweiterung «database»;
 *   fehlt es, gilt die Erweiterung als aus.
 * @param {string} p.wurzel Wurzelpfad des Bereichs.
 * @param {'nehmen'|'freigeben'|'brechen'|'auskunft'} p.aktion
 * @param {string} p.tabelle Pfad der Tabellen-Datei (Kopf-Datei).
 * @param {string} p.kennung Interne Kennung, aufgefüllt oder nicht.
 * @param {string} [p.stand] Beim Brechen der Stand aus der Konflikt-Auskunft.
 * @returns {Promise<object>} Sprachneutrale Rückgabe mit `status`.
 */
async function bediene({
  sperrVerwaltung,
  erweiterungAktiv,
  wurzel,
  aktion,
  tabelle,
  kennung,
  stand,
}) {
  if (typeof erweiterungAktiv !== 'function' || erweiterungAktiv() !== true) return ohneZugriff();
  if (!Object.values(AKTIONEN).includes(aktion)) return ohneZugriff();
  const id = kennungFuer(nummerAus(kennung));
  if (id === null) return { status: 'error', code: CODE_GEGENSTAND };
  const gegenstand = { art: ART_DATENSATZ, tabelle, id };

  if (aktion === AKTIONEN.nehmen) return alsNahme(await sperrVerwaltung.nimm(wurzel, gegenstand));
  if (aktion === AKTIONEN.brechen) {
    // Nach einem gelungenen Bruch nimmt die Verwaltung selbst; ein zweites
    // Nehmen hier stieße auf die eigene Sperre und meldete einen Konflikt.
    return alsNahme(await sperrVerwaltung.brich(wurzel, gegenstand, stand));
  }
  if (aktion === AKTIONEN.freigeben) {
    return alsFreigabe(await sperrVerwaltung.gibFrei(wurzel, gegenstand));
  }
  return auskunft(sperrVerwaltung, wurzel, gegenstand);
}

module.exports = { AKTIONEN, bediene };
