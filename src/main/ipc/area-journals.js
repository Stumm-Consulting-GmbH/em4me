// 4T-000431 bis 4T-000434 (Epic 3E-000081) und 4T-001406/4T-001407 (Epic
// 3E-000244): IPC-Kanaele der Journale — Konfigurations-Sektion der
// Bereichsdatei, Existenz und Anlage eines Eintrags, Existenz-Batch der
// Kalender-Punkte und die Nachpflege bestehender Eintraege (einzeln, im Stapel
// und der Ordner-Scan davor).
//
// 4T-001407: Seit dem Schnitt eine eigene Datei; zuvor der Journal-Abschnitt von
// area-features.js. Der Journal-Anteil war mit 262 von 507 Zeilen der groesste
// jener Datei und waechst mit dem Epic weiter; die Naht zwischen den
// Bereichs-Sektionen war dort schon als Abschnitts-Kommentar angelegt. Die
// Registrierung bleibt eingehaengt: area-features.js ruft sie mit denselben
// Abhaengigkeiten auf, main.js aendert sich nicht.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { isInsideArea } = require('../area/area-path');
const { normalizeJournalsConfig } = require('../../shared/journal-core');
// 4T-001406 (Epic 3E-000244): die Nachpflege-Regel liegt in einem eigenen Modul.
const { ergaenzeJournalProperties } = require('../../shared/journal-nachpflege');
const selbstSchreib = require('../documents/self-write');

const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Journal-Kanaele. Die Abhaengigkeiten kommen unveraendert aus
 * der Registrierung der bereichsgebundenen Funktionen.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion.
 * @param {object} deps Abhaengigkeiten.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {object} deps.mddStore Container-Kern der Begleitdateien.
 * @param {Function} deps.readAreaJournalsConfig Journal-Sektion der Bereichsdatei lesen.
 */
function registerJournalIpc(handle, deps) {
  const { senderWindow, areaOfWindow, broadcast, mddStore, readAreaJournalsConfig } = deps;

  // --- 4T-000431 (Epic 3E-000081): Journal-Konfiguration (journals-Sektion) -------

  // Konfigurations-Stand des Bereichs, normalisiert. Journale existieren nur
  // pro Bereich (Architekturentscheidung 2 des Epics): ohne Bereich liefert
  // der Handler hasArea false und config null; die Aufrufer (Panel, Kommandos,
  // Einstellungen) zeigen den lokalisierten Hinweis.
  handle('journals:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const raw = area ? await readAreaJournalsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      rootPath: area ? area.rootPath : null,
      config: normalizeJournalsConfig(raw),
    };
  });

  // journals-Sektion der Bereichsdatei schreiben (config = Objekt) bzw.
  // entfernen (config = null). Muster templates:setAreaConfig: die
  // Bereichsdatei entsteht erst beim ersten tatsaechlichen Setzen, eine
  // defekte Bereichsdatei wird nie ueberschrieben. Nach dem Schreiben geht
  // 'journals:changed' an alle Fenster (Payload rootPath; die Renderer
  // desselben Bereichs ziehen Panel und Kommandos nach).
  handle('journals:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalized = normalizeJournalsConfig(config);
      if (normalized) container.settings.journals = normalized;
      else delete container.settings.journals;
      if (raw === null && !normalized) {
        return { ok: true, config: null }; // nichts gesetzt und keine Datei: nichts anzulegen
      }
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      broadcast('journals:changed', { rootPath: area.rootPath });
      return { ok: true, config: normalized };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-000433 (Epic 3E-000081): Existenz eines aufgeloesten Eintrags-Pfads
  // (bereichsrelativ). Die Aufloesung selbst macht der Renderer ueber den
  // Perioden-Kern; hier nur Pfad-Sicherung (harte Bereichs-Grenze) und stat.
  handle('journals:statEntry', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      const stat = await fs.stat(abs);
      return { ok: true, path: abs, exists: stat.isFile() };
    } catch {
      return { ok: true, path: abs, exists: false };
    }
  });

  // 4T-000433: Journal-Eintrag anlegen — Ordner-Kette erzeugen und die Datei
  // mit dem fertig gefuellten Inhalt schreiben (Vorlagen-Dialoge laufen im
  // Renderer VOR der Anlage; Abbruch dort erzeugt keine Datei). 'wx' statt
  // Ueberschreiben: existiert die Datei inzwischen (Race), meldet existed
  // und der Renderer oeffnet nur. Dieser Pfad ist bewusst getrennt von
  // area:createFile und triggert keine Ordner-Regel (die Journal-Vorlage
  // hat Vorrang, Task-Vorgabe Vorrang-Regel).
  handle('journals:createEntry', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    const content = typeof (params && params.content) === 'string' ? params.content : '';
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: abs, existed: false };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: true, path: abs, existed: true };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-001406 (Epic 3E-000244): Journal-Eigenschaften eines BESTEHENDEN
  // Eintrags nachpflegen. Lesen, Ergaenzen und Schreiben liegen zusammen im
  // Hauptprozess, damit zwischen Lesen und Schreiben kein Zeitfenster mit
  // veraltetem Renderer-Stand entsteht; die Perioden-Rechnung bleibt im
  // Renderer, der die fertigen Eigenschaften mitschickt. Geschrieben wird nur,
  // wenn wirklich etwas fehlt (`geaendert`), damit ein vollstaendiger Eintrag
  // seinen Aenderungs-Zeitstempel behaelt.
  handle('journals:ergaenzeProperties', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPath = params && params.relPath;
    if (typeof relPath !== 'string' || !relPath) return { ok: false, error: 'invalid path' };
    // Die Eigenschaften kommen aus dem Renderer: flaches Objekt, nur nicht-leere
    // String-Werte. Alles andere entfaellt still, statt in eine Datei des
    // Anwenders zu gelangen.
    const roh = params && params.properties;
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
      return { ok: false, error: 'invalid properties' };
    }
    const properties = {};
    for (const [key, wert] of Object.entries(roh)) {
      if (typeof key === 'string' && key !== '' && typeof wert === 'string' && wert !== '') {
        properties[key] = wert;
      }
    }
    if (Object.keys(properties).length === 0) return { ok: true, geaendert: false };
    const abs = path.resolve(area.rootPath, relPath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, error: 'outside-area' };
    try {
      const vorher = await fs.readFile(abs, { encoding: 'utf8' });
      const { geaendert, text } = ergaenzeJournalProperties(vorher, properties);
      if (!geaendert) return { ok: true, geaendert: false };
      markSelfWriting(abs, text);
      await fs.writeFile(abs, text, { encoding: 'utf8' });
      return { ok: true, geaendert: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-001407 (Epic 3E-000244): Alle Markdown-Dateien unterhalb eines
  // bereichsrelativen Ordners fuer die Massen-Nachpflege. Der Ordner ist der
  // statische Praefix des Ordner-Schemas, also der kleinste Ordner, der alle
  // Eintraege des Journals sicher enthaelt; welche davon zu einer Periode
  // gehoeren, entscheidet der Renderer ueber die Perioden-Zuordnung. Die
  // Kappung schuetzt vor einem versehentlich auf die Bereichs-Wurzel
  // zeigenden Praefix.
  handle('journals:scanEintraege', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const roh = params && params.ordner;
    const ordner = typeof roh === 'string' ? roh : '';
    const wurzel = ordner === '' ? area.rootPath : path.resolve(area.rootPath, ordner);
    if (!isInsideArea(area.rootPath, wurzel) && wurzel !== area.rootPath) {
      return { ok: false, error: 'outside-area' };
    }
    const MAX = 20000;
    const gefunden = [];
    let gekappt = false;
    const lauf = (abs) => {
      if (gekappt) return;
      let eintraege;
      try {
        eintraege = fsSync.readdirSync(abs, { withFileTypes: true });
      } catch {
        return; // fehlender oder unlesbarer Ordner: nichts zu holen
      }
      for (const e of eintraege) {
        if (gefunden.length >= MAX) {
          gekappt = true;
          return;
        }
        const kind = path.join(abs, e.name);
        if (e.isDirectory()) lauf(kind);
        else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
          gefunden.push(path.relative(area.rootPath, kind).split(path.sep).join('/'));
        }
      }
    };
    lauf(wurzel);
    return { ok: true, relPaths: gefunden, gekappt };
  });

  // 4T-001407: Massen-Nachpflege. Ein Aufruf statt einer IPC-Runde je Eintrag —
  // bei einem Bestand in der Groessenordnung des Product Owners (rund 1320
  // Journal-Notizen) waere das je Eintrag der teuerste Teil des Laufs. Es gilt
  // dieselbe Ergaenzungs-Regel wie beim Oeffnen; ein Fehler an einer einzelnen
  // Datei bricht den Lauf nicht ab, sondern wird gezaehlt.
  handle('journals:ergaenzePropertiesBatch', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const eintraege = Array.isArray(params && params.eintraege) ? params.eintraege : [];
    let geaendert = 0;
    let unveraendert = 0;
    let fehler = 0;
    for (const eintrag of eintraege.slice(0, 20000)) {
      const relPath = eintrag && eintrag.relPath;
      const roh = eintrag && eintrag.properties;
      if (typeof relPath !== 'string' || !relPath || !roh || typeof roh !== 'object') {
        fehler++;
        continue;
      }
      const properties = {};
      for (const [key, wert] of Object.entries(roh)) {
        if (typeof key === 'string' && key !== '' && typeof wert === 'string' && wert !== '') {
          properties[key] = wert;
        }
      }
      const abs = path.resolve(area.rootPath, relPath);
      if (!isInsideArea(area.rootPath, abs)) {
        fehler++;
        continue;
      }
      try {
        const vorher = await fs.readFile(abs, { encoding: 'utf8' });
        const ergebnis = ergaenzeJournalProperties(vorher, properties);
        if (!ergebnis.geaendert) {
          unveraendert++;
          continue;
        }
        markSelfWriting(abs, ergebnis.text);
        await fs.writeFile(abs, ergebnis.text, { encoding: 'utf8' });
        geaendert++;
      } catch {
        fehler++;
      }
    }
    return { ok: true, geaendert, unveraendert, fehler };
  });

  // 4T-000434 (Epic 3E-000081): Existenz-Batch fuer die Kalender-Punkte — ein
  // Aufruf pro sichtbarem Monat statt einem stat-IPC pro Tag (begrenzter
  // Scan, Epic-Risiko Performance). Pfad-Sicherung pro Eintrag; unsichere
  // Pfade entfallen still. Kappung als Schutz gegen entartete Aufrufer.
  //
  // 4T-001065 (Epic 3E-000212): Kappung von 500 auf 1000 angehoben. Der
  // Jahres-Modus des Journal-Timeline-Blocks fragt bei einem Tages-Journal
  // 371 Pfade in einem Aufruf ab (am Kalenderjahr 2026 ausgezaehlt: zwoelf
  // Gitter mit 441 Zellen, davon 371 verschiedene Tage); mit 500 lag der
  // Regelbetrieb ohne nennenswerte Reserve unter der Grenze, und eine
  // greifende Kappung waere STILL — fehlende Punkte statt einer Meldung.
  // Der Schutz gegen entartete Aufrufer bleibt, er sitzt nur nicht mehr
  // dicht am realen Bedarf.
  handle('journals:entriesExist', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const relPaths = Array.isArray(params && params.relPaths) ? params.relPaths : [];
    const exists = {};
    await Promise.all(
      relPaths.slice(0, 1000).map(async (relPath) => {
        if (typeof relPath !== 'string' || !relPath) return;
        const abs = path.resolve(area.rootPath, relPath);
        if (!isInsideArea(area.rootPath, abs)) return;
        try {
          exists[relPath] = (await fs.stat(abs)).isFile();
        } catch {
          exists[relPath] = false;
        }
      }),
    );
    return { ok: true, exists };
  });
}

module.exports = { registerJournalIpc };
