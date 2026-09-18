// 4T-001510 (Epic 3E-000250, E4): Die Kanäle des Katalogs — der Vertrag, über
// den die Oberfläche nach Tabellen und ihren Definitionen fragt.
//
// **Zwei Kanäle, weil der Katalog zwei Auskünfte gibt** (Entscheidung des
// Product Owners vom 2026-09-06; Begründung im Katalog-Modul):
//
//   database:overview   Steckbrief, Tabellen-Namen und Fehlerlagen
//   database:table      die vollständige Definition EINER Tabelle
//
// 4T-001758 (Epic 3E-000253): Der Überblick trägt zusätzlich die Bereichs-ART
// (`istDatenbankBereich`) und ist auch ohne offene Datei aufrufbar, sofern ein
// Bereich gebunden ist. Ein eigener Kanal für die Bereichs-Art wäre eine zweite
// Anfrage auf denselben Bestand gewesen; die Begründung steht am Feld im
// Katalog-Modul.
//
// **Warum die Oberfläche kein Frontmatter selbst liest** (E4): Der Katalog
// braucht den Bestand über die einzelne Datei hinaus und liegt deshalb im
// Haupt-Prozess; Maßstab ist die Reichweite des Zugriffs und nicht die
// Zugehörigkeit zu einem Baustein. Ein Fenster kennt nur seine eigenen
// Dokumente und könnte die Frage «welche Tabellen gibt es» gar nicht
// beantworten.
//
// Die Form folgt den Profil-Kanälen, wie E4 es vorgibt: ein Modul je
// Fachlichkeit mit gebündelten Kanälen und Deps-Objekt. Der Grundsatz der
// Abfrage-Sprache gilt auch hier — ein unvollständiger Kontext ergibt die leere
// Menge und nie ein zu großes Ergebnis.
'use strict';

const fsp = require('node:fs/promises');
const {
  createDatabaseCatalogCache,
  katalogUeberblick,
  tabellenDefinition,
} = require('../database/table-catalog.js');

/**
 * Registriert die Katalog-Kanäle.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {Function} deps.areaRootForEvent Bereichs-Wurzel des sendenden Fensters.
 * @param {object} deps.backlinks Index-Fassade (Sicht, Bedarfs-Aufbau, Puffer-Text).
 */
function registerDatabaseIpc(handle, deps) {
  const { areaRootForEvent, backlinks } = deps;
  // Ein prozessweiter Zwischenspeicher, wie ihn der Profil-Katalog führt: Der
  // Bestand ist derselbe für alle Fenster, und ein Speicher je Fenster läse
  // dieselbe Datei mehrfach.
  const cache = createDatabaseCatalogCache();

  // Gemeinsame Vorarbeit beider Kanäle: Index bei Bedarf aufbauen, Sicht holen.
  // Der Bedarfs-Aufbau steht hier und nicht im Katalog, weil er den Index
  // verändert und der Katalog eine reine Lese-Schicht bleibt.
  //
  // 4T-001758 (Epic 3E-000253): Ohne Datei, aber mit gebundenem Bereich ist der
  // Bereich die Wurzel. Die Einstellungs-Seite fragt nach der Bereichs-ART und
  // hat dabei kein Dokument zur Hand; ohne beides bleibt es bei `unavailable`,
  // und der Aufrufer bekommt eine Antwort statt eines Fehlers.
  function lage(event, filePath) {
    const areaRoot = areaRootForEvent(event);
    if (!filePath && !areaRoot) return { status: 'unavailable', meta: null, sicht: null };
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:database`, areaRoot);
    return backlinks.datenbankSicht(filePath, areaRoot);
  }

  handle('database:overview', async (event, params) => {
    const { status, meta, sicht } = lage(event, params && params.filePath);
    // Ohne bereite Sicht wird der Status durchgereicht statt einer leeren
    // Datenbank: «noch nicht bereit» und «keine Tabellen» sind zwei Aussagen,
    // und wer sie verwechselt, zeigt einem Anwender beim Öffnen eine leere Liste.
    if (!sicht)
      return {
        status,
        meta,
        istDatenbankBereich: false,
        steckbrief: null,
        tabellen: [],
        hints: [],
      };
    const ueberblick = await katalogUeberblick({
      sicht,
      status,
      fsp,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
    });
    return { ...ueberblick, meta };
  });

  handle('database:table', async (event, params) => {
    const { status, meta, sicht } = lage(event, params && params.filePath);
    if (!sicht) return { status, meta, gefunden: false, hints: [] };
    const definition = await tabellenDefinition({
      sicht,
      status,
      tabelle: params && params.tabelle,
      fsp,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
    });
    return { ...definition, meta };
  });
}

module.exports = { registerDatabaseIpc };
