// IPC-Kanal-Gruppe Kopieren im Bereich: die Datei-Kopie aus dem Kontextmenue
// des Bereichs-Panels — Namensfindung, Bereichs-Grenze und die Begleitdaten.
//
// 4T-001731 (Epic 3E-000306). Kanal-Gruppe: area:copyFile.
//
// **Eigenes Modul und nicht in areas.js**, aus beiden Gruenden, die das Projekt
// dafuer kennt. Fachlich: Die drei Nachbar-Kanaele dort legen an, loeschen oder
// listen — jeder ein einzelner Datei-Vorgang. Dieser hier ist eine Abfolge mit
// eigener Namensfindung, eigenem Wettlauf-Rueckfall und einem Aufraeum-Weg,
// wenn nur ein Teil gelang; das ist eine eigene Sorgfalt (Muster
// views/file-trash.js im Anzeige-Prozess). Und der Groesse nach: areas.js steht
// bei 481 von 500 Code-Zeilen und haette den Zusatz nicht getragen.
//
// Electron-frei wie areas.js: Was vom Fenster gebraucht wird, kommt als Deps
// herein; damit laeuft der ECHTE Handler im Prueffall.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea, kopierNameKandidat } = require('../area/area-path');
// 4T-001731: Die Begleitdatei zum Dokument (.mdd) — Pfad-Bildung und
// Container-Format. mddPathFor kommt aus document-parts-io.js, weil es dort
// bereits exportiert am Modul-Rand liegt; eine dritte eigene Fassung derselben
// Bildung waere eine Quelle zu viel.
const { mddPathFor } = require('../documents/document-parts-io');
const mddStore = require('../documents/mdd-store');
// 4T-001731: Erkennung eines geteilten Dokuments (siehe GETEILTE DOKUMENTE).
const { readPartLine } = require('../../shared/document-parts');

// Obergrenze der Nummern-Suche. Ein Ordner mit derart vielen Kopien desselben
// Dokuments ist kein regulaerer Zustand; die Grenze verhindert eine
// Endlosschleife, falls der Schreibversuch dauerhaft EEXIST meldet. Gleicher
// Wert und gleicher Grund wie MAX_NAMENS_VERSUCHE in attachment-path.js.
const MAX_NUMMER = 1000;

// --- Begleitdaten (Entscheidungen E2, E3 und E9 des Epics) ----------------------
//
// **Der Bestand weicht von der Annahme des Epics ab, und das ist der
// wesentliche Befund dieses Kanals.** E2 und E3 sprechen von der
// "Begleitdatei mit den Block-Eigenschaften" und der "Aenderungs-Historie" wie
// von zwei Dateien. Es ist EINE: Die .mdd traegt beides als getrennte
// Sektionen desselben Containers (`history`, `blockData`, dazu `notes` und den
// Teil-Katalog; mdd-store.js, Kopf-Kommentar). Kopieren heisst deshalb nicht
// "Datei mitnehmen oder nicht", sondern: eine NEUE Begleitdatei aus den
// Sektionen bauen, die mitreisen sollen.
//
// **Das Kriterium ist eines, nicht drei** (E9, Ausfuehrungs-Entscheidung vom
// 2026-09-18 im Rahmen von E2 und E3): Beschreibt die Angabe die SACHE, reist
// sie mit; beschreibt sie den WEG zu ihr, bleibt sie zurueck.
//
//   - `blockData` (E2) — Inhalt des Dokuments, reist mit.
//   - `notes`     (E9) — die Dokument-Notiz ist ebenso vom Anwender
//     geschriebener Inhalt am Dokument; die Begruendung von E2 ("ohne sie waere
//     die Kopie inhaltlich unvollstaendig, obwohl der Text stimmt") trifft auf
//     sie woertlich zu. Uebernommen wird der Text MIT seinem Zeitstempel: Die
//     Notiz ist nicht neu geschrieben, sie ist mitgekommen.
//   - `history`   (E3) — der Werdegang der Vorlage, bleibt als EINZIGE Sektion
//     zurueck. Deshalb steht in der neuen Begleitdatei eine LEERE Historie
//     (emptyContainer) und nicht die der Vorlage.
//
// Der Teil-Katalog eines geteilten Dokuments erreicht diese Funktion nie: Ein
// geteiltes Dokument weist der Handler vorher ab (E10, siehe GETEILTE
// DOKUMENTE). Kaeme kuenftig eine weitere Sektion hinzu, waere sie an diesem
// einen Kriterium einzuordnen — und diese Funktion die einzige Stelle, die sich
// aendert.
function uebernommeneSektionen(container) {
  const out = {};
  const blockData = mddStore.getAllBlockData(container);
  if (Object.keys(blockData).length > 0) out.blockData = blockData;
  const notiz = mddStore.getNote(container);
  if (notiz) {
    // Form der Sektion wie mdd-store sie schreibt: `text` immer, `updated` nur
    // als Zeichenkette. `getNote` liefert bei fehlendem Zeitstempel null, und
    // ein `updated: null` waere eine Form, die der Bestand nicht kennt.
    out.notes = notiz.updated ? { text: notiz.text, updated: notiz.updated } : { text: notiz.text };
  }
  return out;
}

/**
 * Baut die Begleitdatei der Kopie, falls die Vorlage eine hat und etwas
 * mitreist.
 *
 * Liefert `{ ok: true, begleitdatei: boolean }` oder `{ ok: false, error }`.
 * Eine FEHLENDE Begleitdatei der Vorlage ist kein Fehler, sondern der
 * Regelfall (Dokument ohne Block-Eigenschaften und ohne Historie). Eine
 * DEFEKTE ebenso: Sie wird nicht gelesen und nicht nachgebaut, und die Kopie
 * entsteht trotzdem — dieselbe Fehler-Isolation, mit der der uebrige Bestand
 * eine defekte .mdd behandelt (mdd-store.js: aussetzen, nie ueberschreiben,
 * nie abstuerzen).
 */
async function kopiereBegleitdatei(quelle, ziel) {
  let roh;
  try {
    roh = await fs.readFile(mddPathFor(quelle), 'utf8');
  } catch {
    return { ok: true, begleitdatei: false };
  }
  const geparst = mddStore.parseContainer(roh);
  if (!geparst.ok) return { ok: true, begleitdatei: false };
  const sektionen = uebernommeneSektionen(geparst.container);
  if (Object.keys(sektionen).length === 0) return { ok: true, begleitdatei: false };
  const container = { ...mddStore.emptyContainer(), ...sektionen };
  try {
    // wx: exklusives Anlegen. Eine fremde Begleitdatei am Ziel-Namen bleibt
    // unangetastet — sie kann nur zu einer Datei gehoeren, die dann auch
    // existiert, und dann waere die Kopie schon an der Datei gescheitert.
    await fs.writeFile(mddPathFor(ziel), mddStore.serializeContainer(container), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
  return { ok: true, begleitdatei: true };
}

/**
 * Kopiert unter der ersten FREIEN Nummer (Entscheidung E1 des Epics).
 *
 * Gezaehlt wird von 1 aufwaerts, und genommen wird die erste Nummer, deren
 * Name frei ist — nicht die um eins erhoehte hoechste. Eine Luecke in der
 * Folge wird damit gefuellt, und keine vorhandene Datei ueberschrieben.
 *
 * **Der Wettlauf ist keine Extra-Behandlung, sondern derselbe Weg.** Ob ein
 * Name schon beim ersten Blick belegt war oder erst zwischen Pruefung und
 * Schreibversuch von aussen entstand, unterscheidet der Kanal nicht: Beide
 * melden sich als EEXIST des exklusiven Schreibversuchs, und beide fuehren auf
 * die naechste Nummer. Genau deshalb gibt es hier keine vorgeschaltete
 * Existenz-Pruefung — sie waere ein zweiter, schwaecherer Massstab neben dem
 * einen, der zaehlt.
 *
 * Die Kopier-Handlung kommt als `kopiere` herein (Vorbild: die
 * Existenz-Pruefung in attachment-path.js). Damit ist der Wettlauf-Rueckfall
 * pruefbar, ohne dass ein Prueffall das Dateisystem austricksen muesste.
 *
 * @param {object} p Parameter.
 * @param {string} p.dateiName Dateiname der Vorlage (ohne Ordner).
 * @param {string} p.ordner Ordner, in dem die Kopie entsteht.
 * @param {(ziel: string) => Promise<void>} p.kopiere Exklusiver Kopier-Versuch.
 * @param {(ziel: string) => boolean} p.istImBereich Grenz-Pruefung des Ziels.
 * @returns {Promise<object>} { ok: true, ziel, name, nummer } bzw. { ok: false, error }.
 */
async function kopiereMitFreierNummer({ dateiName, ordner, kopiere, istImBereich }) {
  for (let nummer = 1; nummer <= MAX_NUMMER; nummer++) {
    const name = kopierNameKandidat(dateiName, nummer);
    if (!name) return { ok: false, error: 'invalid name' };
    const ziel = path.join(ordner, name);
    // Doppelte Absicherung der Grenze (Muster attachments.js): Die Namens-
    // Bildung hat sie schon geprueft, der Schreibvorgang prueft das Ergebnis
    // erneut.
    if (!istImBereich(ziel)) return { ok: false, error: 'outside-area' };
    try {
      await kopiere(ziel);
    } catch (err) {
      if (err && err.code === 'EEXIST') continue;
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, ziel, name, nummer };
  }
  return { ok: false, error: 'kein-freier-name' };
}

// Raeumt eine halb entstandene Kopie weg. Aufgerufen, wenn die Datei schon
// liegt, die Begleitdatei aber scheiterte: Zurueck bleibt sonst eine Kopie, die
// inhaltlich unvollstaendig ist, ohne dass man es ihr ansieht (AK10). Die
// Vorlage wird dabei nie angefasst — entfernt wird ausschliesslich, was dieser
// Aufruf selbst angelegt hat.
async function raeumeAuf(ziel) {
  await fs.rm(mddPathFor(ziel), { force: true }).catch(() => {});
  await fs.rm(ziel, { force: true }).catch(() => {});
}

/**
 * Registriert den Kopier-Kanal des Bereichs-Panels.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 */
function registerAreaCopyIpc(handle, deps) {
  const { senderWindow, areaOfWindow, isMarkdownPath } = deps;

  // 4T-001731 (Epic 3E-000306): "Kopieren" — legt eine Kopie der Datei im
  // selben Ordner an, benannt nach der ersten freien Nummer.
  //
  // **Die Grenze wird hier geprueft und nicht dem Aufrufer geglaubt**
  // (Entscheidung E7 des Epics): Der Kanal nimmt einen Pfad entgegen, also
  // prueft er ihn selbst — Bereichs-Zugehoerigkeit der Vorlage, Dateiart, und
  // dass das Ziel wieder im Bereich landet. Die Prueffolge ist die der
  // Nachbar-Kanaele in areas.js.
  //
  // **GETEILTE DOKUMENTE werden abgewiesen**, und das ist keine Vorsicht,
  // sondern die Vermeidung eines Schadens: Die Kopf-Datei eines geteilten
  // Dokuments traegt eine Zuordnungs-Zeile mit dem GRUNDNAMEN der Vorlage
  // (shared/document-parts.js). Eine Kopie davon behaelt diese Zeile — und
  // damit gilt sie der Anwendung als Kopf DESSELBEN Dokuments: Das Oeffnen der
  // Kopie fuehrt nach document-parts-io.readAssembledDocument auf die Vorlage,
  // und ein Speichern schriebe in deren Teil-Dateien. Eine Kopie, die
  // heimlich das Original bearbeitet, ist schlechter als keine. Die Zeile
  // stattdessen zu entfernen, waere die andere Falle: Die Kopie truege dann nur
  // den Text des ersten Teils und waere still unvollstaendig. Was hier richtig
  // waere — alle Teile mitkopieren und umnummerieren —, ist ein eigenes
  // Vorhaben mit eigenen Fragen (fehlender Teil, Abbruch mittendrin). Die
  // Abweisung ist deshalb **entschieden und nicht vorlaeufig**: E10 des Epics
  // (Ausfuehrungs-Entscheidung vom 2026-09-18). Der Kanal sagt Nein, und der
  // Anwender erfaehrt es.
  handle('area:copyFile', async (event, filePath) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    if (typeof filePath !== 'string' || !filePath || !isInsideArea(area.rootPath, filePath)) {
      return { ok: false, error: 'outside-area' };
    }
    if (!isMarkdownPath(filePath)) return { ok: false, error: 'not a document' };
    const quelle = path.resolve(filePath);
    let inhalt;
    try {
      // Ein Ordner wird hier abgewiesen (E4 des Epics): readFile auf ein
      // Verzeichnis meldet EISDIR. Der Lese-Versuch ersetzt damit die
      // Typ-Abfrage und liefert zugleich den Inhalt fuer die Teil-Erkennung —
      // ein Statten davor waere ein zweiter Zugriff auf dieselbe Frage.
      inhalt = await fs.readFile(quelle, 'utf8');
    } catch (err) {
      if (err && (err.code === 'EISDIR' || err.code === 'ERR_FS_EISDIR')) {
        return { ok: false, error: 'is-directory' };
      }
      if (err && err.code === 'ENOENT') return { ok: false, error: 'missing-source' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    if (readPartLine(inhalt)) return { ok: false, error: 'split-document' };

    const ergebnis = await kopiereMitFreierNummer({
      dateiName: path.basename(quelle),
      ordner: path.dirname(quelle),
      istImBereich: (ziel) => isInsideArea(area.rootPath, ziel),
      kopiere: (ziel) => fs.copyFile(quelle, ziel, fs.constants.COPYFILE_EXCL),
    });
    if (!ergebnis.ok) return ergebnis;

    const begleit = await kopiereBegleitdatei(quelle, ergebnis.ziel);
    if (!begleit.ok) {
      await raeumeAuf(ergebnis.ziel);
      return { ok: false, error: begleit.error };
    }
    return {
      ok: true,
      path: ergebnis.ziel,
      name: ergebnis.name,
      begleitdatei: begleit.begleitdatei,
    };
  });
}

module.exports = {
  registerAreaCopyIpc,
  // Fuer die Prueffaelle und als benannte Teile der Fachlichkeit.
  kopiereMitFreierNummer,
  kopiereBegleitdatei,
  MAX_NUMMER,
};
