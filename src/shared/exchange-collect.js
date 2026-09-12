// 4T-001587 (Story 4S-000904, Epic 3E-000160): Sammeln der Datenarten für die
// Ausgabe — welche Datenart ist vorhanden, wieviel enthält sie, und was steht
// in ihrem Abschnitt.
//
// Prozessneutral wie die Registry daneben: Die beiden Quellen kommen als
// Funktionen herein (`readPath` für den globalen Speicher, `readAreaSection`
// für die Bereichsdatei), statt dass dieses Modul sie sich holt. Damit ist das
// Sammeln ohne Electron, ohne Store und ohne Bereichsdatei prüfbar — und die
// Prüffälle können Fälle stellen, die sich an einer echten Installation nur
// mühsam herstellen ließen, etwa einen Speicher mit einem unbekannten
// Schlüssel.
//
// **Die Sammlung liest ausschließlich.** Keine Funktion dieses Moduls schreibt,
// und keine gibt einen Bezug auf einen gelesenen Wert weiter, ohne ihn zuvor
// über JSON zu kopieren: Ein Aufrufer, der den Abschnitt später verändert, darf
// damit nicht in den Speicher der laufenden Anwendung greifen.
//
// **4T-001589: Der Geheimnis-Ausschluss sitzt hier.** Die Sammlung ist die eine
// Stelle vor der Formatierung, durch die jede Datenart läuft; ein Filter je
// Datenart wäre zu vervielfältigen, und ein späterer in der Darstellung wäre
// umgehbar. Was er ausschließt und warum die Regel über den Namensraum statt
// über Namen greift, steht bei `EXTENSION_DATA_PREFIX`.
'use strict';

const {
  DATA_KINDS,
  dataKindById,
  entrySelectionOf,
  holeTief,
  setzeTief,
} = require('./exchange-data-kinds.js');
const {
  EXTENSION_DATA_PREFIX,
  isExtensionDataPath,
} = require('./extensions/extensions-external.js');

/**
 * Gilt ein gelesener Wert als vorhanden?
 *
 * Ein leeres Objekt und eine leere Liste zählen als nicht vorhanden: Der
 * Speicher hält für viele Schlüssel einen leeren Behälter, sobald ihr
 * Einstellungs-Bereich einmal geöffnet war. Eine Auswahl-Liste, die solche
 * Datenarten anböte, versprächen dem Anwender Inhalt, wo keiner ist.
 *
 * @param {*} wert
 * @returns {boolean}
 */
function istVorhanden(wert) {
  if (wert === undefined || wert === null) return false;
  if (Array.isArray(wert)) return wert.length > 0;
  if (typeof wert === 'object') return Object.keys(wert).length > 0;
  return true;
}

// Tiefe Kopie über JSON. Die gelesenen Werte gehören dem laufenden Programm;
// was in die Datei geht, ist eine Kopie. Nicht serialisierbare Anteile
// (Funktionen, undefined) fallen dabei weg — im Speicher stehen ohnehin nur
// JSON-Werte, und ein Rest, der es nicht ist, hat in einer Austausch-Datei
// nichts zu suchen.
function kopiere(wert) {
  return wert === undefined ? undefined : JSON.parse(JSON.stringify(wert));
}

/**
 * 4T-001589: Entfernt den Ablage-Raum der Erweiterungen aus einem gelesenen
 * Wert.
 *
 * **Das ist das Netz unter der Pfad-Prüfung, nicht ihr Ersatz.** Heute kann
 * kein ausgegebener Pfad einen `extensionData`-Schlüssel enthalten — die
 * Prüfung eine Ebene höher lässt den Pfad gar nicht erst zu. Der Fall, gegen
 * den dieses Netz gespannt ist, entsteht erst, wenn jemand später eine Datenart
 * mit weiterem Zuschnitt einträgt und deren Wert den Raum mitführt. Genau dafür
 * ist dieser Task von der Ausgabe getrennt geführt: Eine Zusicherung, die nur
 * aus der Abwesenheit eines Eintrags folgt, hält bis zum nächsten Eintrag.
 *
 * Entfernt wird **still**. Der Namensraum ist keine Datenart, der Anwender hat
 * ihn nicht ausgewählt, und eine Meldung darüber wäre eine Auskunft über fremde
 * Daten, die niemand bestellt hat (Entscheidung des Product Owners vom
 * 2026-09-08). Die Zusicherung erfährt er im Handbuch.
 *
 * @param {*} wert Bereits kopierter Wert.
 * @returns {*} Derselbe Wert ohne den Namensraum.
 */
function ohneErweiterungsDaten(wert) {
  if (Array.isArray(wert)) return wert.map(ohneErweiterungsDaten);
  if (wert === null || typeof wert !== 'object') return wert;
  const aus = {};
  for (const [schluessel, inhalt] of Object.entries(wert)) {
    if (schluessel === EXTENSION_DATA_PREFIX) continue;
    aus[schluessel] = ohneErweiterungsDaten(inhalt);
  }
  return aus;
}

/**
 * 4T-001590: Die einzeln wählbaren Einträge einer Datenart, oder null.
 *
 * Geliefert werden Kennung, Name und Zahl je Eintrag — nicht die Werte. Die
 * Auswahl-Liste des Anzeige-Prozesses braucht nur so viel, um eine Zeile zu
 * beschriften; die Werte bleiben im Hauptprozess wie bei der Datenart selbst.
 *
 * @param {object} auswahl Aufgelöste Auswahl-Deklaration (entrySelectionOf).
 * @param {object} values Gesammelte Werte der Datenart unter ihren Pfaden.
 * @returns {Array<{id: string, name: string, count: number}>|null}
 */
function eintraegeVon(auswahl, values) {
  const liste = holeTief(values[auswahl.path], auswahl.at);
  if (!Array.isArray(liste)) return null;
  const aus = [];
  for (const eintrag of liste) {
    if (!eintrag || typeof eintrag !== 'object' || Array.isArray(eintrag)) continue;
    const id = eintrag[auswahl.idKey];
    if (id === undefined || id === null) continue;
    const name = auswahl.nameKey ? eintrag[auswahl.nameKey] : undefined;
    aus.push({
      id: String(id),
      name: String(name === undefined || name === null ? id : name),
      count: auswahl.zaehleEintrag(eintrag),
    });
  }
  return aus;
}

/**
 * Sammelt alle Datenarten mit ihren Werten und ihrer Zahl.
 *
 * @param {object} quellen
 * @param {(pfad: string) => *} quellen.readPath Wert eines Speicher-Pfads; undefined, wenn ungesetzt.
 * @param {(sektion: string) => Promise<*>|*} [quellen.readAreaSection] Sektion der
 *   Bereichsdatei; fehlt sie oder ist kein Bereich gebunden, entfallen die
 *   bereichsgebundenen Datenarten.
 * @param {Array} [kinds] Datenarten; Vorgabe ist die Registry. Der Parameter
 *   existiert für den Wächter des Geheimnis-Ausschlusses (4T-001589), der eine
 *   erfundene Datenart mit einem Pfad im Ablage-Raum der Erweiterungen
 *   hereinreicht — er muss belegen, dass der Ausschluss NICHT an der
 *   Datenart-Liste hängt. Die echte Registry im Prüffall zu verändern wäre der
 *   Weg gewesen, den Nachbar-Fällen ihre Grundlage zu entziehen.
 * @returns {Promise<Array<{id: string, labelKey: string, count: number, hasValues: boolean, values: object}>>}
 */
async function collectDataKinds(quellen, kinds = DATA_KINDS) {
  const readPath = quellen && typeof quellen.readPath === 'function' ? quellen.readPath : null;
  if (!readPath) throw new TypeError('collectDataKinds: readPath ist keine Funktion');
  const readAreaSection =
    quellen && typeof quellen.readAreaSection === 'function' ? quellen.readAreaSection : null;

  const ergebnis = [];
  for (const kind of kinds) {
    const values = {};
    if (kind.areaSection) {
      // Ohne Bereichs-Leser gibt es die Datenart in diesem Fenster nicht; sie
      // erscheint dann gar nicht statt als leerer Eintrag.
      if (!readAreaSection) continue;
      const wert = ohneErweiterungsDaten(kopiere(await readAreaSection(kind.areaSection)));
      if (istVorhanden(wert)) values[kind.areaSection] = wert;
    } else {
      for (const pfad of kind.paths) {
        // 4T-001589: Ein Pfad im Ablage-Raum der Erweiterungen wird gar nicht
        // erst GELESEN. Das ist die erste und wichtigere der beiden Wirkungen:
        // Der Wert erreicht die Sammlung nie, statt nachträglich aus ihr
        // entfernt zu werden.
        if (isExtensionDataPath(pfad)) continue;
        const wert = ohneErweiterungsDaten(kopiere(readPath(pfad)));
        if (istVorhanden(wert)) values[pfad] = wert;
      }
    }
    const hasValues = Object.keys(values).length > 0;
    const auswahl = entrySelectionOf(kind);
    ergebnis.push({
      id: kind.id,
      labelKey: kind.labelKey,
      count: hasValues ? kind.zaehle(values) : 0,
      hasValues,
      // null heisst «nur als Ganzes wählbar» und nicht «keine Einträge
      // gefunden»: Die Auswahl-Liste unterscheidet beides, weil eine
      // Datenart ohne Untergliederung keine leere Unter-Liste zeigen soll.
      entries: auswahl && hasValues ? eintraegeVon(auswahl, values) : null,
      values,
    });
  }
  return ergebnis;
}

/**
 * 4T-001590: Reduziert die Werte einer Datenart auf die gewählten Einträge.
 *
 * Gearbeitet wird auf einer Kopie: Die gesammelten Werte gehören dem
 * Aufrufer, und die Ausgabe darf den Quellbereich nicht anfassen (AK7).
 *
 * @param {object} auswahl Aufgelöste Auswahl-Deklaration (entrySelectionOf).
 * @param {object} values Gesammelte Werte der Datenart.
 * @param {string[]} gewaehlt Kennungen der gewählten Einträge.
 * @returns {object|null} Werte mit gefilterter Liste; null, wenn keiner passt.
 */
function nurGewaehlteEintraege(auswahl, values, gewaehlt) {
  const wert = JSON.parse(JSON.stringify(values[auswahl.path]));
  const liste = holeTief(wert, auswahl.at);
  if (!Array.isArray(liste)) return null;
  const behalten = liste.filter(
    (e) => e && typeof e === 'object' && gewaehlt.includes(String(e[auswahl.idKey])),
  );
  if (behalten.length === 0) return null;
  // Die Reihenfolge bleibt die des Bestands und nicht die der Anklick-Folge —
  // dieselbe Begründung wie bei der Reihenfolge der Abschnitte weiter unten.
  return { ...values, [auswahl.path]: setzeTief(wert, auswahl.at, behalten) };
}

/**
 * Macht aus der gesammelten Lage und einer Auswahl die Abschnitte der Datei.
 *
 * Eine Auswahl, die eine unbekannte oder eine leere Datenart nennt, ist ein
 * Fehler und kein stillschweigend übergangener Eintrag: Der Anwender hat sie
 * angekreuzt und erwartete sie in der Datei (Zug-Entscheidung Z3, kein stiller
 * Teil-Vorgang).
 *
 * 4T-001590: Ein Auswahl-Element ist entweder eine Kennung (die ganze
 * Datenart) oder ein Paar `{ id, entries }` mit den Kennungen der gewählten
 * Einträge. Die Kurzform bleibt der Regelfall — wer alles mitnimmt, geht
 * unverändert denselben Weg wie zuvor; die lange Form entsteht erst, wenn der
 * Anwender innerhalb einer Datenart abwählt.
 *
 * @param {Array} gesammelt Ergebnis von collectDataKinds.
 * @param {Array<string|{id: string, entries: string[]}>} auswahl Gewählte Datenarten.
 * @param {(labelKey: string) => string} [uebersetze] Beschriftung der Überschrift je Abschnitt.
 * @returns {{ok: true, sections: Array}|{ok: false, error: string, kind?: string}}
 */
function buildExchangeSections(gesammelt, auswahl, uebersetze) {
  const liste = Array.isArray(gesammelt) ? gesammelt : [];
  const gewaehlt = Array.isArray(auswahl) ? auswahl : [];
  if (gewaehlt.length === 0) return { ok: false, error: 'no-selection' };

  const sections = [];
  const gesehen = new Set();
  for (const roh of gewaehlt) {
    const id = typeof roh === 'string' ? roh : roh && roh.id;
    const eintraege =
      roh && typeof roh === 'object' && Array.isArray(roh.entries)
        ? roh.entries.map((e) => String(e))
        : null;
    if (typeof id !== 'string' || id === '') return { ok: false, error: 'invalid-selection' };
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    const kind = dataKindById(id);
    if (!kind) return { ok: false, error: 'unknown-kind', kind: id };
    const eintrag = liste.find((k) => k.id === id);
    if (!eintrag || !eintrag.hasValues) return { ok: false, error: 'empty-kind', kind: id };

    let werte = eintrag.values;
    if (eintraege) {
      const auswahlDeklaration = entrySelectionOf(kind);
      // Eine Eintrags-Auswahl auf einer Datenart, die keine kennt, ist ein
      // Missverständnis des Aufrufers und kein stillschweigend übergangener
      // Wunsch: Er bekäme sonst mehr, als er angekreuzt hat.
      if (!auswahlDeklaration) return { ok: false, error: 'no-entry-selection', kind: id };
      werte = nurGewaehlteEintraege(auswahlDeklaration, eintrag.values, eintraege);
      if (!werte) return { ok: false, error: 'empty-kind', kind: id };
    }

    sections.push({
      name: id,
      title: typeof uebersetze === 'function' ? uebersetze(eintrag.labelKey) : undefined,
      value: werte,
    });
  }
  // Die Reihenfolge der Datei folgt der Registry, nicht der Reihenfolge der
  // Anklick-Vorgänge: Zwei Ausgaben desselben Umfangs sollen sich vergleichen
  // lassen, und dazu müssen ihre Abschnitte gleich stehen.
  sections.sort(
    (a, b) =>
      DATA_KINDS.findIndex((k) => k.id === a.name) - DATA_KINDS.findIndex((k) => k.id === b.name),
  );
  return { ok: true, sections };
}

module.exports = {
  collectDataKinds,
  buildExchangeSections,
  istVorhanden,
  ohneErweiterungsDaten,
  eintraegeVon,
};
