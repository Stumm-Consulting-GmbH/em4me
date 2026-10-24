// 4T-002253 (Epic 3E-000262, F5 A, S6, S7): Die Auskunft über den
// Positions-Bereich einer Einzel-Maske — welche Abfrage-Datei der Platzhalter
// `{{list:…}}` meint, über welches Verweis-Feld die Positionen am Kopf hängen
// und welche Abfrage die Positionen genau dieses Kopfes liefert.
//
// **Die Zeilen kommen nicht von hier** (Muster `listen-auskunft.js`). Die
// Anzeige wertet die gelieferte Abfrage über denselben Kanal aus wie jede
// Abfrage-Datei, mit der Abfrage-Datei als Basis, und fragt danach wie jede
// Liste `database:liste`. Hier steht allein, was nur der Haupt-Prozess weiß:
// die Abfrage-Dateien des Katalogs, die Definition der Positions-Tabelle und
// damit das Verweis-Feld auf die Kopf-Tabelle.
//
// **Die Auflösung in fünf Stufen**, jede mit eigenem Hinweis: (a) die
// Abfrage-Datei über die Abfrage-Dateien des Katalogs, nach Name ohne Endung
// oder Pfad wie eine Masken-Angabe (`trifftMaskenAngabe`); (b) ihr Abfrage-Block
// der obersten Ebene nach der Zaun-Regel des Katalogs; (c) die Angabe
// `editable: true`, ohne sie bleibt der Bereich lesend mit Hinweis und die
// Antwort trägt dennoch die ergänzte Abfrage, damit er lesend zeigt; (d) das
// Verweis-Feld der Positions-Tabelle, dessen Ziel die Kopf-Tabelle ist: genau
// eines gilt, bei mehreren das hinter `BY` genannte, sonst «mehrdeutig», ohne
// eines «fehlt»; (e) die Abfrage um `<feld> = "<Kennung des Kopfes>"` ergänzt
// (`query-bedingung.js`), deren Ergebnis den Parser bestehen muss.
//
// **Dieselbe Auflösung trägt die Konsistenz-Prüfung** (`pruefePositionsBereich`):
// Sie fragt je Segment `liste` einer Masken-Datei dieselben Stufen, ohne die
// Abfrage auszuwerten, damit Maske und Prüfung auf dieselbe Frage dieselbe
// Antwort geben.
//
// **Weich nach E22:** Jede Fehlerlage ergibt `{ istListe: false, hinweis }`,
// eine nicht feststellbare `{ istListe: false, hinweis: null }`; kein Wurf über
// die Prozess-Grenze. Electron-frei; Dateizugriff, Sicht und Puffer-Auskunft
// kommen herein.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseListAngaben } = require('../../shared/database/list-angaben.js');
const { ergaenzeBedingung } = require('../../shared/query/query-bedingung.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { findeZielTabelle } = require('./datensatz-liste.js');
// 4T-002254: `abfrageDesTextes` liegt seither in `listen-auskunft.js`, weil auch die
// Übersicht die Tabelle einer Abfrage-Datei aus ihrem Block bestimmt.
const { abfrageDesTextes, liesText, tabelleDerAbfrage } = require('./listen-auskunft.js');
const {
  abfrageDateien,
  createDatabaseCatalogCache,
  rolleUndRechteDerTabelle,
  tabellenDefinition,
  trifftMaskenAngabe,
} = require('./table-catalog.js');

/** Die Hinweis-Codes des Positions-Bereichs (Katalog `table-hinweise.js`). */
const POSITIONS_HINWEISE = Object.freeze({
  dateiUnbekannt: 'listDateiUnbekannt',
  nichtBearbeitbar: 'listNichtBearbeitbar',
  beziehungFehlt: 'listBeziehungFehlt',
  beziehungMehrdeutig: 'listBeziehungMehrdeutig',
  abfrageUngueltig: 'listAbfrageUngueltig',
});

// Der Typ eines Verweis-Feldes (`record-regel-hilfen.js`, `VERWEIS_TYP`).
const VERWEIS_TYP = 'record';

function mitHinweis(code) {
  return { istListe: false, hinweis: code };
}

// Das Verweis-Feld der Positions-Tabelle auf die Kopf-Tabelle, oder ein Hinweis.
function verweisFeld({ wurzel, sicht, fields, kopfPfad, by }) {
  const kandidaten = fields.filter((feld) => {
    if (!feld || feld.type !== VERWEIS_TYP) return false;
    const angabe = feld.options && typeof feld.options.table === 'string' ? feld.options.table : '';
    if (angabe.trim() === '') return false;
    const ziel = findeZielTabelle({ wurzel, sicht, tabelle: angabe });
    return ziel !== null && pathCompareKey(ziel) === pathCompareKey(kopfPfad);
  });
  if (kandidaten.length === 1) return { feld: kandidaten[0].name };
  if (kandidaten.length === 0) return { hinweis: POSITIONS_HINWEISE.beziehungFehlt };
  const klein = typeof by === 'string' ? by.trim().toLowerCase() : '';
  const genannt = kandidaten.find((feld) => feld.name.toLowerCase() === klein);
  return genannt ? { feld: genannt.name } : { hinweis: POSITIONS_HINWEISE.beziehungMehrdeutig };
}

/**
 * Die Auskunft über einen Positions-Bereich.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`, `stat`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Index-Sicht des Bereichs.
 * @param {Map} [p.cache] Zwischenspeicher des Katalogs.
 * @param {Function} [p.bufferTextFor] Puffer-Auskunft des ungespeicherten Stands.
 * @param {string} p.datei Die Angabe des Platzhalters: Name ohne Endung oder Pfad.
 * @param {string|null} p.by Das Verweis-Feld hinter `BY`, oder null.
 * @param {{tabelle: string, kennung: string}} p.kopf Kopf-Tabelle (Pfad oder
 *   Name) und Kennung des gezeigten Kopfes.
 * @returns {Promise<object>} `{ istListe: false, hinweis }` oder `{ istListe:
 *   true, pfad, query, beziehung: { feld }, tabelle, hinweis: null }`; ohne
 *   `editable: true` `istListe: false` mit dem Hinweis und denselben Angaben.
 *   Seit 4T-002308 tragen die aufgelösten Antworten `rechte`, die Erlaubnis-Menge
 *   der Positions-Tabelle (S4), seit 4T-002311 dazu `rolle`; `p.herkunft` ist die Naht für den Anmeldenamen.
 */
async function liesPositionsListe({
  fsp,
  wurzel,
  sicht,
  cache = createDatabaseCatalogCache(),
  bufferTextFor = null,
  datei,
  by = null,
  kopf,
  herkunft = null,
}) {
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('liesPositionsListe: fsp ist Pflicht und muss readFile tragen');
  if (!sicht || !kopf || typeof datei !== 'string' || datei.trim() === '') return mitHinweis(null);
  try {
    // (a) die Abfrage-Datei über den Katalog.
    const abfragen = await abfrageDateien({ sicht, fsp, cache, bufferTextFor });
    const treffer = abfragen.find((a) => trifftMaskenAngabe(a.path, datei));
    if (!treffer) return mitHinweis(POSITIONS_HINWEISE.dateiUnbekannt);
    // (b) ihr Text und der eine Abfrage-Block der obersten Ebene.
    const text = await liesText({ fsp, pfad: treffer.path, bufferTextFor });
    if (text === null) return mitHinweis(POSITIONS_HINWEISE.dateiUnbekannt);
    const fm = extractFrontmatter(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    // (c) ohne `editable: true` lesend: Die Auflösung läuft weiter, damit der
    // Bereich die Positionen lesend zeigen kann, und der Hinweis sagt es.
    const lesend = parseListAngaben(fm.data).editable !== true;
    const query = abfrageDesTextes(fm.body);
    const tabelle = query === null ? null : tabelleDerAbfrage(query);
    const posKopf = tabelle === null ? null : findeZielTabelle({ wurzel, sicht, tabelle });
    const kopfPfad = findeZielTabelle({ wurzel, sicht, tabelle: kopf.tabelle });
    if (posKopf === null || kopfPfad === null)
      return mitHinweis(POSITIONS_HINWEISE.abfrageUngueltig);
    // (d) das Verweis-Feld auf die Kopf-Tabelle.
    const definition = await tabellenDefinition({
      sicht,
      status: 'ready',
      tabelle: posKopf,
      fsp,
      cache,
      bufferTextFor,
    });
    if (!definition.gefunden) return mitHinweis(POSITIONS_HINWEISE.abfrageUngueltig);
    const fields = Array.isArray(definition.fields) ? definition.fields : [];
    const beziehung = verweisFeld({ wurzel, sicht, fields, kopfPfad, by });
    if (beziehung.hinweis) return mitHinweis(beziehung.hinweis);
    // (e) die Abfrage um die Beziehungs-Bedingung ergänzt.
    const ergaenzt = ergaenzeBedingung(query, beziehung.feld, kopf.kennung);
    if (ergaenzt === null) return mitHinweis(POSITIONS_HINWEISE.abfrageUngueltig);
    const aufgeloest = {
      pfad: treffer.path,
      query: ergaenzt,
      beziehung: { feld: beziehung.feld },
      tabelle: definition.path,
      // 4T-002308 (S4): die Erlaubnis-Menge der Positions-Tabelle; 4T-002311:
      // dazu die geltende Rolle.
      ...(await rolleUndRechteDerTabelle({
        sicht,
        fsp,
        cache,
        bufferTextFor,
        herkunft,
        tabellenPfad: definition.path,
      })),
    };
    if (lesend)
      return { istListe: false, ...aufgeloest, hinweis: POSITIONS_HINWEISE.nichtBearbeitbar };
    return { istListe: true, ...aufgeloest, hinweis: null };
  } catch {
    return mitHinweis(null);
  }
}

// Eine Kennung, die nur dazu dient, dass die Konsistenz-Prüfung die Ergänzung
// der Abfrage am Parser prüfen kann; ausgewertet wird nichts.
const PRUEF_KENNUNG = 'r-00001';

/**
 * Prüft einen Positions-Bereich einer Masken-Datei, ohne die Abfrage
 * auszuwerten (Konsistenz-Prüfung).
 *
 * @param {object} p Wie `liesPositionsListe`, ohne `kopf.kennung`.
 * @param {string} p.kopfPfad Kopf-Datei der Tabelle der Maske.
 * @returns {Promise<string|null>} Der Hinweis-Code, oder null ohne Befund.
 */
async function pruefePositionsBereich({ kopfPfad, ...p }) {
  const antwort = await liesPositionsListe({
    ...p,
    kopf: { tabelle: kopfPfad, kennung: PRUEF_KENNUNG },
  });
  return antwort.istListe ? null : antwort.hinweis || null;
}

module.exports = { POSITIONS_HINWEISE, liesPositionsListe, pruefePositionsBereich };
