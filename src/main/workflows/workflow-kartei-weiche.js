// 4T-002691 (Epic 3E-000415, Story 4S-001215, Tc Option (a)): Die
// Datei-Befehle `delete` und `copy` der Workflows auf einer Karteikarte gehen
// über DIESELBE Weiche wie das Bereichs-Panel (`database/kartei-weichen.js`).
//
// **Warum ein eigenes Modul:** Beide Schritt-Module (`workflow-file-steps.js`
// für `copy` und `move`, `workflow-maintenance-steps.js` für `delete`) brauchen
// dieselbe Anbindung: Erkennung der Karteikarte, Lauf-Marke über die Naht
// `vorSchreiben` und die Abweisung der Schnittstelle als Fehlschlag
// `dbRejected` mit ihren Lagen, nach dem Muster der Datenbank-Befehle
// (`workflow-db-steps.js`). Zweimal gebaut liefe die Abbildung der Abweisung
// in beiden Modulen auseinander.
//
// **Ohne Weiche** (Prüffälle älterer Bauart, Verdrahtung ohne Datenbank) ist
// nichts eine Karteikarte, und beide Befehle arbeiten wie bisher. Im
// Aus-Zustand der Erweiterung «Datenbank» erkennt die Weiche selbst nichts.
//
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { merkeLaufStand } = require('../documents/self-write');
const { tabellenName } = require('../database/table-catalog.js');
const { LAGEN } = require('../database/record-auftrag-pruefung.js');
const { DB_REJECTED } = require('./workflow-db-steps.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { DB_RECORD_KEY } = require('../../shared/database/behaelter.js');

/**
 * Baut die Anbindung der Datei-Befehle an die Weiche einer Karteikarte.
 *
 * @param {object} deps Abhängigkeiten der Schritt-Module.
 * @param {{karteikarteVon: Function, loescheKarteikarte: Function,
 *   kopierHandlung: Function}} [deps.karteiWeichen] Die Weiche des Panels.
 * @param {Function} [deps.merkeLaufStand] Lauf-Marke (Prüffälle).
 * @returns {{karteikarteVon: Function, loesche: Function, kopiere: Function}}
 */
function createWorkflowKarteiWeiche(deps) {
  const weichen = deps && deps.karteiWeichen ? deps.karteiWeichen : null;
  const merke =
    deps && typeof deps.merkeLaufStand === 'function' ? deps.merkeLaufStand : merkeLaufStand;

  // Die Lauf-Marke vor dem ersten Schreiben: Jede Datei des Plans (Tabelle,
  // Beleg-Datei, neue Karte) wird mit ihrem neuen Inhalt gemerkt, damit nichts
  // davon einen Ereignis-Workflow auslöst (Muster `workflow-db-steps.js`).
  const laufOptionen = {
    vorSchreiben: (dateien) => {
      for (const datei of dateien) merke(datei.pfad, datei.neu);
    },
  };

  // Die Abweisung der Weiche (`{ok: false, error: 'database', datenbank}`) als
  // Fehlschlag mit den Lagen der Schnittstelle; den Satz bildet das Fenster wie
  // bei den Datenbank-Befehlen aus den Lagen.
  function alsFehlschlag(abweisung, karte) {
    const ergebnis = (abweisung && abweisung.datenbank) || {};
    const lagen =
      Array.isArray(ergebnis.lagen) && ergebnis.lagen.length > 0
        ? ergebnis.lagen
        : [{ code: ergebnis.code || LAGEN.unerwartet }];
    return {
      ok: false,
      code: DB_REJECTED,
      detail: {
        table: tabellenName(karte.tabelle),
        record: karte.kennung,
        lagen: JSON.parse(JSON.stringify(lagen)),
      },
    };
  }

  /**
   * Die Karteikarte zu einem Pfad, oder null ohne Weiche und für jede andere Datei.
   *
   * @param {string} abs Absoluter Pfad.
   * @returns {Promise<{pfad: string, tabelle: string, kennung: string}|null>}
   */
  async function karteikarteVon(abs) {
    if (!weichen || typeof weichen.karteikarteVon !== 'function') return null;
    return weichen.karteikarteVon(abs);
  }

  /**
   * Löscht eine Karteikarte über die Weiche: Lösch-Schutz, Rechte, Lösch-Beleg;
   * Karteikarte und Beleg-Datei gehen in den Papierkorb.
   *
   * @returns {Promise<{ok: true}|object>} Erfolg oder der Fehlschlag `dbRejected`.
   */
  async function loesche(karte, wurzel) {
    const ergebnis = await weichen.loescheKarteikarte(karte, wurzel, laufOptionen);
    return ergebnis && ergebnis.ok === true ? { ok: true } : alsFehlschlag(ergebnis, karte);
  }

  /**
   * Kopiert eine Karteikarte über die Weiche in den Ordner ihrer Tabelle: neue
   * Kennung, Anlege-Beleg, der Name des Ziels als Name der Karte.
   *
   * @param {{pfad: string, tabelle: string, kennung: string}} karte Die Vorlage.
   * @param {string} wurzel Wurzel des Bereichs.
   * @param {string} zielAbs Absoluter Pfad des Ziels.
   * @param {string} angabe Das Ziel, wie der Schritt es nennt (für den Fehlschlag).
   * @returns {Promise<{ok: true}|{belegt: true}|object>} Erfolg, belegte
   *   Ziel-Datei oder ein Fehlschlag.
   */
  async function kopiere(karte, wurzel, zielAbs, angabe) {
    const handlung = await weichen.kopierHandlung(karte.pfad, wurzel);
    // Zwischen Erkennung und Handlung verschwunden: wie jede andere Abweisung.
    if (handlung === null) return alsFehlschlag(null, karte);
    const neu = neuerKartenPfad(zielAbs);
    try {
      await handlung.kopiere(path.resolve(zielAbs), laufOptionen);
      return { ok: true };
    } catch (err) {
      // Review Runde 1, Nr. 4: Die Weiche meldet `EEXIST` auch, wenn allein der
      // Schlüssel in der Tabelle vergeben ist. Im Workflow ist das Ziel fest
      // genannt: Liegt die Datei da, ist es `targetExists`, sonst eine
      // Abweisung der Datenbank. 4T-002821 (Epic 3E-000445): Die Weiche gibt ihr
      // Ergebnis am Fehler mit (`err.datenbank`); dann trägt der Fehlschlag die
      // Lagen, und das Fenster nennt den Grund, etwa den vergebenen Schlüssel.
      // Fehlt das Ergebnis, bleibt der allgemeine Satz von `dbRejected`.
      if (err && err.code === 'EEXIST') {
        if (await liegtDa(neu)) return { belegt: true };
        if (err.datenbank) return alsFehlschlag({ datenbank: err.datenbank }, karte);
        return {
          ok: false,
          code: DB_REJECTED,
          detail: { table: tabellenName(karte.tabelle), record: karte.kennung },
        };
      }
      const abweisung = handlung.abweisung();
      if (abweisung) return alsFehlschlag(abweisung, karte);
      // Review Runde 1, Nr. 3: Eine Ausnahme, die keine Abweisung ist,
      // verschwindet nicht still in `dbRejected`, sondern wird protokolliert und
      // als `writeFailed` gemeldet wie im Rückfall von `runFileStep`.
      console.error(
        '[workflow] Kopie der Karteikarte fehlgeschlagen:',
        err && err.message ? err.message : err,
      );
      return {
        ok: false,
        code: 'writeFailed',
        detail: { path: angabe, fsCode: err && err.code ? err.code : null },
      };
    }
  }

  /**
   * Der Pfad, unter dem die Weiche die Kopie anlegt: eine Karteikarte endet
   * immer auf `.md` (`neueDatei` in `record-auftrag-kartei.js`).
   *
   * @param {string} zielAbs Absoluter Pfad des Ziels.
   * @returns {string}
   */
  function neuerKartenPfad(zielAbs) {
    return path.join(path.dirname(path.resolve(zielAbs)), `${path.parse(zielAbs).name}.md`);
  }

  /**
   * 4T-002691 (Punkt 3, Halt «Hineinlegen»): Die Kartei-Tabelle, in deren
   * Ordner ein Text mit Kennung `db-record` im Dateikopf gelegt würde, oder
   * null. Den Ordner erkennt die Weiche (`karteiTabelleIn`), mit demselben
   * Maßstab wie `karteikarteVon`; ohne Weiche und im Aus-Zustand nie.
   *
   * @param {string} text Inhalt der Datei, die entstünde.
   * @param {string} zielAbs Absoluter Pfad des Ziels.
   * @returns {Promise<string|null>} Pfad der Tabelle.
   */
  async function tabelleBeimHineinlegen(text, zielAbs) {
    if (!weichen || typeof weichen.karteiTabelleIn !== 'function') return null;
    if (!traegtKennung(text)) return null;
    return weichen.karteiTabelleIn(path.dirname(path.resolve(zielAbs)));
  }

  return { karteikarteVon, loesche, kopiere, neuerKartenPfad, tabelleBeimHineinlegen };
}

async function liegtDa(pfad) {
  try {
    await fs.lstat(pfad);
    return true;
  } catch {
    return false;
  }
}

// BOM ohne unsichtbares Zeichen im Quelltext, Sinn wie in `kartei-weichen.js`.
const BOM_RE = new RegExp('^' + String.fromCharCode(0xfeff));

// Trägt der Dateikopf eines Texts die Kennung `db-record`? Dieselbe Lesart wie
// die Erkennung der Weiche (BOM weg, Dateikopf ohne Lesefehler).
function traegtKennung(text) {
  if (typeof text !== 'string' || text === '') return false;
  const kopf = extractFrontmatter(text.replace(BOM_RE, ''));
  return !kopf.parseError && !!kopf.data && kopf.data[DB_RECORD_KEY] !== undefined;
}

module.exports = { createWorkflowKarteiWeiche };
