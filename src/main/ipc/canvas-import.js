// 4T-001806 (Epic 3E-000292): Einlesen einer Datei des offenen Formats JSON
// Canvas und Anlage eines Dokuments neben ihr (Story 4S-000960).
//
// **Warum eine eigene Kanal-Gruppe.** Die Zustaendigkeit dieses Moduls laesst
// sich in einem Satz sagen: eine fremde Datei lesen und daraus ein Dokument
// machen. Das ist weder ein allgemeiner Datei-Kanal (files.js kennt Oeffnen,
// Lesen und Speichern eigener Dokumente), noch eine Sicht auf den Bereich
// (areas.js), noch eine Aufloesung von Einbettungen (embeds.js). Derselbe
// Schnitt-Grund wie bei embeds.js: Wer etwas BENUTZT, gehoert nicht in das
// Modul dessen, was er benutzt.
//
// **Der ganze Vorgang laeuft hier und nicht im Anzeige-Prozess.** Lesen,
// Pruefen, Uebersetzen, Aufloesen der fremden Pfade und Anlegen der Datei
// brauchen alle das Dateisystem und die Bereichs-Grenze. Der Anzeige-Prozess
// bekommt am Ende je Datei ihren Namen, den Pfad des neuen Dokuments und die
// Zahlen des Berichts — nie einen absoluten Pfad eines fremden Ziels und nie
// den Inhalt der gelesenen Datei.
//
// **Die tragende Annahme dieses Wegs ist UNGEPRUEFT** (Stand 2026-09-19): dass
// ein Pfad in einer solchen Datei auf die Wurzel des fremden Bestands zeigt.
// Die Spezifikation des Formats sagt dazu nichts; es ist eine Aussage ueber
// ein bestimmtes Werkzeug. Bis der Nachweis an einer Datei gefuehrt ist, die
// das fremde Werkzeug selbst geschrieben hat, gilt sie als Arbeitsregel —
// siehe `loeseFremdesZiel`, wo sie steht.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const {
  jsonCanvasNachFlaeche,
  VERLUST_POSTEN,
} = require('../../shared/canvas/canvas-austausch.js');
const { canvasFenceBlock, parseCanvasFence } = require('../../shared/canvas/canvas-core.js');
const { containmentWurzel } = require('../documents/embed-path.js');
const { isInsideArea } = require('../area/area-path.js');
const { freierDateiname } = require('../documents/attachment-path.js');

// Die Fehler-Kennzeichen, die eine einzelne Datei scheitern lassen. Sie sind
// Kennungen und keine Saetze: Die Texte entstehen im Bericht-Modul aus
// `canvas.austausch.fehler.<kennung>`, damit dieselbe Sprache-Grenze gilt wie
// fuer die Verlust-Posten.
const DATEI_FEHLER = Object.freeze({
  unlesbar: 'unlesbar',
  zuGross: 'zuGross',
  keinJson: 'keinJson',
  keineListen: 'keineListen',
  keinFreierName: 'keinFreierName',
  nichtSchreibbar: 'nichtSchreibbar',
});

/**
 * Registriert den Kanal des Einlesens.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog.
 * @param {Function} deps.senderWindow Fenster einer Anfrage.
 * @param {Function} deps.areaOfWindow Gebundener Bereich eines Fensters.
 * @param {Function} deps.tForWindow Uebersetzer in der Sprache des Fensters.
 * @param {number} deps.MAX_EMBED_BYTES Groessen-Limit fuer gelesenen Text.
 */
function registerCanvasImportIpc(handle, deps) {
  const { dialog, senderWindow, areaOfWindow, tForWindow, MAX_EMBED_BYTES } = deps;

  /**
   * Der fremde Pfad als eigenes Ziel, oder `null`, wenn er sich nicht
   * aufloesen laesst.
   *
   * **Arbeitsregel, ausdruecklich UNGEPRUEFT:** Der erste Kandidat ist der
   * Pfad relativ zur Wurzel des Bestands — das ist die Annahme, um die es
   * geht. Der zweite ist der Ort neben der gewaehlten Datei; er kostet nichts
   * und faengt den Fall, in dem die Annahme nicht traegt. Findet keiner von
   * beiden eine Datei, liefert die Funktion nichts: Der Uebersetzungs-Kern
   * schreibt dann den blossen Dateinamen, den die Namens-Suche des Bestands
   * beim Anzeigen noch finden kann, und der Bericht zaehlt den Posten.
   *
   * **Die Grenze ist dieselbe wie bei jeder Einbettung.** Ein Kandidat
   * ausserhalb der Containment-Wurzel wird uebersprungen; damit kann kein
   * `../`-Pfad einer fremden Datei auf etwas ausserhalb des Bereichs zeigen.
   */
  async function loeseFremdesZiel(fremd, wurzel, quellOrdner) {
    const bereinigt = String(fremd).replace(/\\/g, '/');
    for (const abs of [path.resolve(wurzel, bereinigt), path.resolve(quellOrdner, bereinigt)]) {
      if (!isInsideArea(wurzel, abs)) continue;
      try {
        await fs.access(abs);
      } catch {
        continue;
      }
      // Geschrieben wird relativ zum NEUEN Dokument, und das liegt neben der
      // gewaehlten Datei. Schraegstriche, weil die eigene Angabe sie fuehrt.
      const rel = path.relative(quellOrdner, abs);
      if (rel === '') continue;
      return rel.split(path.sep).join('/');
    }
    return null;
  }

  // Die Ziel-Abbildung entsteht VOR dem Uebersetzen, weil der Kern seine
  // Uebersetzung synchron abruft und die Existenz-Pruefung am Dateisystem
  // haengt. Gesammelt werden die Pfade der Datei-Knoten; doppelte Nennungen
  // werden einmal aufgeloest.
  async function zielAbbildung(objekt, wurzel, quellOrdner) {
    const pfade = new Set();
    for (const knoten of Array.isArray(objekt.nodes) ? objekt.nodes : []) {
      if (!knoten || typeof knoten !== 'object' || knoten.type !== 'file') continue;
      if (typeof knoten.file === 'string' && knoten.file !== '') pfade.add(knoten.file);
    }
    const abbildung = new Map();
    let offen = 0;
    for (const pfad of pfade) {
      const ziel = await loeseFremdesZiel(pfad, wurzel, quellOrdner);
      if (ziel) abbildung.set(pfad, ziel);
      else offen += 1;
    }
    return { abbildung, offen };
  }

  // Was im neuen Dokument steht: eine Ueberschrift mit dem Namen der Quelle
  // und darunter die Flaeche in der eigenen Fence. Die Zaun-Laenge rechnet
  // canvasFenceBlock aus dem Rumpf aus.
  function dokumentInhalt(stamm, rumpf) {
    return `# ${stamm}\n\n${canvasFenceBlock(rumpf)}\n`;
  }

  // Die Zahlen der Meldung entstehen aus dem geschriebenen Rumpf und nicht aus
  // der fremden Datei: Gemeldet wird, was ANGEKOMMEN ist.
  function zahlenAus(rumpf) {
    const elemente = parseCanvasFence(rumpf).elemente || [];
    const zaehle = (art) => elemente.filter((el) => el && el.art === art).length;
    return { karten: zaehle('karte'), gruppen: zaehle('gruppe'), verbindungen: zaehle('linie') };
  }

  // Ein freier Name neben der Quelle, nach dem Muster der Anlagen-Ablage
  // (attachment-path.freierDateiname): `<Name>.md`, dann `<Name>-2.md` und so
  // fort. Eine bestehende Datei wird nie ueberschrieben — die Namens-Suche
  // haelt den ersten Abstand, das exklusive Schreiben unten den zweiten.
  async function freierName(verzeichnis, wunsch) {
    const vorhanden = new Set();
    try {
      for (const eintrag of await fs.readdir(verzeichnis)) vorhanden.add(eintrag.toLowerCase());
    } catch {
      /* unlesbares Verzeichnis: nichts gilt als belegt, das Schreiben entscheidet */
    }
    return freierDateiname({
      verzeichnis,
      name: wunsch,
      existiert: (p) => vorhanden.has(path.basename(p).toLowerCase()),
    });
  }

  /**
   * Eine gewaehlte Datei einlesen und ihr Dokument anlegen.
   *
   * Wirft nie: Jeder Fehlschlag ist eine Kennung im Ergebnis, damit eine
   * unbrauchbare Datei nur sich selbst abbricht und nicht den Vorgang ueber
   * mehrere Dateien (Entscheidung F1 des Product Owners vom 2026-09-19).
   *
   * @returns {Promise<{name: string, pfad?: string, zahlen?: object,
   *   verluste?: Array<object>, fehler?: string}>}
   */
  async function leseUndLege(quelle, areaRoot) {
    const name = path.basename(quelle);
    let text;
    try {
      const stat = await fs.stat(quelle);
      if (stat.size > MAX_EMBED_BYTES) return { name, fehler: DATEI_FEHLER.zuGross };
      text = await fs.readFile(quelle, 'utf8');
    } catch {
      return { name, fehler: DATEI_FEHLER.unlesbar };
    }
    let objekt;
    try {
      // Wie file:read: einen Vorspann tolerieren. Eine von Hand nachbearbeitete
      // Datei kann ihn mitbringen, und JSON.parse wuerde daran scheitern.
      objekt = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      return { name, fehler: DATEI_FEHLER.keinJson };
    }
    if (!objekt || typeof objekt !== 'object') return { name, fehler: DATEI_FEHLER.keineListen };

    const quellOrdner = path.dirname(path.resolve(quelle));
    const wurzel = containmentWurzel(quellOrdner, areaRoot);
    const { abbildung, offen } = await zielAbbildung(objekt, wurzel, quellOrdner);
    const uebersetzt = jsonCanvasNachFlaeche(objekt, { zielFuerPfad: abbildung });
    if (uebersetzt.fehler) return { name, fehler: DATEI_FEHLER.keineListen };

    const stamm = path.basename(quelle, path.extname(quelle));
    const dateiname = await freierName(quellOrdner, `${stamm}.md`);
    if (!dateiname) return { name, fehler: DATEI_FEHLER.keinFreierName };
    const ziel = path.join(quellOrdner, dateiname);
    try {
      // wx: Eine bestehende Datei bleibt unangetastet, auch wenn zwischen
      // Namens-Suche und Schreiben jemand anders geschrieben hat.
      await fs.writeFile(ziel, dokumentInhalt(stamm, uebersetzt.rumpf), {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch {
      return { name, fehler: DATEI_FEHLER.nichtSchreibbar };
    }
    const verluste = uebersetzt.verluste.slice();
    if (offen > 0) verluste.push({ schluessel: VERLUST_POSTEN.zielNichtAufgeloest, anzahl: offen });
    return { name, pfad: ziel, zahlen: zahlenAus(uebersetzt.rumpf), verluste };
  }

  /**
   * 4T-001806: Datei-Menue -> Importieren -> JSON-Canvas-Datei…
   *
   * Der Kanal nimmt keine Parameter: Was gelesen wird, waehlt der Anwender im
   * Dialog des Betriebssystems, und was entsteht, bestimmt allein dieser
   * Prozess. Ein Pfad aus dem Anzeige-Prozess koennte den Vorgang sonst auf
   * eine beliebige Datei richten.
   *
   * **Die Bereichs-Grenze gilt wie beim Oeffnen eines Dokuments** und anders
   * als beim Einlesen der Einrichtung (exchange:openDialog): Hier ENTSTEHT ein
   * Dokument, und es entsteht neben der gewaehlten Datei. Laege die ausserhalb
   * des Bereichs, laege auch das neue Dokument dort — und liesse sich in einer
   * Bereichs-App nicht einmal oeffnen.
   */
  handle('canvas:importJsonCanvas', async (event) => {
    const owner = senderWindow(event);
    const area = areaOfWindow(owner);
    const auswahl = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'canvas.austausch.importTitel'),
      defaultPath: area ? area.rootPath : undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: tForWindow(owner, 'dialog.filterJsonCanvas'), extensions: ['canvas'] },
        { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
      ],
    });
    if (auswahl.canceled || !Array.isArray(auswahl.filePaths) || auswahl.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    let pfade = auswahl.filePaths;
    if (area) {
      const draussen = pfade.filter((p) => !isInsideArea(area.rootPath, p));
      if (draussen.length > 0) {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'area.outsideTitle'),
          message: tForWindow(owner, 'area.outsideOpenMessage'),
          detail: draussen.join('\n'),
          buttons: ['OK'],
        });
      }
      pfade = pfade.filter((p) => isInsideArea(area.rootPath, p));
      if (pfade.length === 0) return { ok: false, canceled: true };
    }
    const ergebnisse = [];
    for (const quelle of pfade) {
      ergebnisse.push(await leseUndLege(quelle, area ? area.rootPath : null));
    }
    return { ok: true, ergebnisse };
  });
}

module.exports = { registerCanvasImportIpc, DATEI_FEHLER };
