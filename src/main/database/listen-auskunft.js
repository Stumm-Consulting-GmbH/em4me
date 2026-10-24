// 4T-002249 (Epic 3E-000262, F2 A, S1, S2): Die Auskunft über eine
// Listen-Maske — ob eine Abfrage-Datei eine ist, aus welcher Tabelle ihre Zeilen
// stammen, welche Spalte welches Feld zeigt und welche Maske ein Klick öffnet.
//
// **Die Zeilen kommen nicht von hier.** Die Ergebnismenge liegt im Anzeige-
// Prozess bereits vor, ausgewertet über den Abfrage-Kanal in jeder befüllten
// Ansicht; sie trägt je Zeile ihre Herkunft. Was ihr fehlt, ist allein, was nur
// der Haupt-Prozess weiß: die Definition der Quell-Tabelle und damit die
// Feld-Zuordnung je Spalte, dazu die Masken-Dateien des Bestands. Eine zweite
// Auswertung derselben Abfrage hieße zwei Mengen, die auseinanderlaufen können,
// sobald zwischen beiden Läufen jemand speichert.
//
// **Bearbeitbar ist eine Spalte, deren Quelltext genau ein Feld der
// Quell-Tabelle nennt** (S2). Verglichen wird wie die Abfrage-Sprache ein Feld
// auflöst (`resolveRecordField`): ohne Rücksicht auf die Schreibung, die eigenen
// Angaben `record.id` und `record.table` vor einem gleichnamigen Feld, `this.`
// und `file.` vor jedem Feld, ein Feld mit Punkt im Namen vor einem Pfad.
// Gerechnete Spalten, Pfade über Verweis-Felder und Aggregate nennen kein Feld
// der Tabelle und bleiben lesend. Eine falsche Zuordnung machte in den
// Folge-Tasks die falsche Zelle schreibbar, ohne dass ein Fehler erschiene; die
// Zuordnung ist deshalb lieber zu eng als zu weit.
//
// **Die Quell-Tabelle ist genau eine**, sonst ist die Datei keine Listen-Maske:
// Nennt der Aufrufer die Kopf-Datei der Herkunft, gilt sie; sonst muss die
// Abfrage genau eine Tabelle positiv nennen und keine Hülle (dieselbe
// Auslegung wie die Auswertung der Ebene, `checkRecordsQuery`, und dieselbe
// Auflösung des Namens, `findeZielTabelle`). Zwei Tabellen in einer Menge
// hätten zwei Feld-Zuordnungen, und eine Spalte könnte je Zeile etwas anderes
// bedeuten.
//
// **Weich nach E22:** Jede Fehlerlage, ob Datei nicht lesbar, Tabelle nicht
// auflösbar oder ein Bruch, den keine Lage beschreibt, ergibt
// `{ istListe: false }`; die Abfrage-Datei zeigt dann die Ergebnis-Tabelle wie
// zuvor. Kein Wurf über die Prozess-Grenze.
//
// Electron-frei; Dateizugriff, Sicht und Puffer-Auskunft kommen herein wie bei
// `datensatz-auskunft.js`. Die Prüfung der Anfrage gegen die Bereichs-Grenze
// leistet der Kanal vor dem Aufruf.
//
// 4T-002250 (Epic 3E-000262, F4 A, S3): **Änderbarkeit je Zeile.** Der Aufrufer
// nennt die Kennungen der gelieferten Zeilen; die Auskunft wertet die Bedingung
// `editable` der Definition für jede am vorgefundenen Datensatz aus und nennt
// die nicht änderbaren (`nichtAenderbar`). Ausgewertet wird wie im Regel-Werk
// (`record-regel-bearbeitbar.js`) und in der Auskunft der Maske
// (`datensatz-auskunft.js`): Kontext aus den Zell-Texten des Schreibwegs,
// `wertePruefregel` aus dem prozess-neutralen Auswerter. Die Tabelle wird dafür
// **einmal** gelesen, über denselben Bestands-Leser wie die
// Schreib-Schnittstelle, nie je Kennung. Ohne Bedingung ist die Liste leer und
// nichts wird gelesen. **Fail-closed:** Lässt sich der Bestand nicht lesen,
// gelten alle genannten Zeilen als nicht änderbar, ebenso eine Kennung, die
// keinen oder mehr als einen Datensatz trifft; die Zeile bietet dann keine
// Bearbeitung an, und der Schreibvorgang prüft ohnehin selbst.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { zaunOeffnung, schliesstZaun } = require('../../shared/markdown/fence-level.js');
const { parseListAngaben } = require('../../shared/database/list-angaben.js');
const { baueHinweis } = require('../../shared/database/table-hinweise.js');
const { parseQuery } = require('../../shared/query/perspective-query.js');
const { checkRecordsQuery } = require('../index/query-records.js');
const { findeZielTabelle } = require('./datensatz-liste.js');
const { kennungFuer, nummerAus } = require('../../shared/database/record-identity.js');
const {
  baueRegelKontext,
  wertePruefregel,
  gesperrteFelder,
} = require('../../shared/database/record-check-eval.js');
const { werteDes, zellText } = require('./record-auftrag-plan.js');
const { leseTabellenBestand, dateiFuerKennung } = require('./record-auftrag-bestand.js');
const {
  createDatabaseCatalogCache,
  maskenDerTabelle,
  maskenZuordnung,
  rolleUndRechteDerTabelle,
  tabellenDefinition,
  trifftMaskenAngabe,
} = require('./table-catalog.js');

// Die Antwort jeder Lage, in der die Datei keine Listen-Maske ist oder es sich
// nicht feststellen lässt. Als Funktion, damit kein Aufrufer ein geteiltes
// Objekt in der Hand hält.
function keineListe() {
  return { istListe: false };
}

// Die Sprache des Abfrage-Blocks, wie im Katalog (`zaehleAbfrageBloecke`).
const ABFRAGE_SPRACHE = 'perspective-query';

// 4T-002254: aus `positions-auskunft.js` hierher verlegt, weil auch
// `fremdeMaskenDerAbfragen` den Block einer Abfrage-Datei liest.
// Der Text des ersten Abfrage-Blocks der obersten Ebene, oder null.
function abfrageDesTextes(body) {
  let offen = null;
  let zeilen = null;
  for (const zeile of String(body == null ? '' : body).split('\n')) {
    if (offen) {
      if (schliesstZaun(zeile, offen)) {
        if (zeilen !== null) return zeilen.join('\n');
        offen = null;
        continue;
      }
      if (zeilen !== null) zeilen.push(zeile.replace(/\r$/, ''));
      continue;
    }
    offen = zaunOeffnung(zeile);
    if (offen && offen.sprache === ABFRAGE_SPRACHE) zeilen = [];
  }
  return zeilen === null ? null : zeilen.join('\n');
}

// Der Text der Abfrage-Datei: der ungespeicherte Stand vor der Platte, wie ihn
// auch die Auswertung der Abfrage liest; sonst die Datei. Null, wenn beides
// fehlt.
async function liesText({ fsp, pfad, bufferTextFor }) {
  const gepuffert = typeof bufferTextFor === 'function' ? bufferTextFor(pfad) : null;
  if (typeof gepuffert === 'string') return gepuffert;
  try {
    return String(await fsp.readFile(pfad, 'utf8'));
  } catch {
    return null;
  }
}

// Die eine Tabelle, die die Abfrage positiv nennt, oder null. Eine Hülle
// (`ancestors(…)`, `descendants(…)`) macht die Menge mehrdeutig, weil ihre
// Mitglieder aus jeder erreichten Tabelle stammen können.
function tabelleDerAbfrage(query) {
  const geparst = parseQuery(String(query || ''));
  if (!geparst.ok || geparst.ast.scope !== 'records') return null;
  const geprueft = checkRecordsQuery(geparst.ast);
  if (geprueft.error) return null;
  const { positive, positiveHulls } = geprueft.tables;
  if (positive.size !== 1 || positiveHulls.length > 0) return null;
  return [...positive][0];
}

// Die Namen, die vor jedem Feld der Tabelle aufgelöst werden
// (`query-record-fields.js`, `perspective-query-eval.js`).
const EIGENE_ANGABEN = new Set(['record.id', 'record.table']);
const VORRANG_PRAEFIXE = ['this.', 'file.'];

/**
 * Das Feld einer Spalte nach S2: der Feld-Name der Definition, wenn der
 * Quelltext nach Trimmen genau ein Feld der Tabelle nennt, sonst null.
 *
 * @param {string} quelle Quelltext des Spalten-Ausdrucks.
 * @param {Array<{name: string}>} fields Die Felder der Definition.
 * @returns {string|null}
 */
function feldDerSpalte(quelle, fields) {
  if (typeof quelle !== 'string') return null;
  const klein = quelle.trim().toLowerCase();
  if (klein === '' || EIGENE_ANGABEN.has(klein)) return null;
  if (VORRANG_PRAEFIXE.some((p) => klein.startsWith(p))) return null;
  const feld = fields.find(
    (f) => f && typeof f.name === 'string' && f.name.toLowerCase() === klein,
  );
  return feld ? feld.name : null;
}

// Die Maske, die ein Klick auf eine Zeile öffnet: die mit `form` genannte, wenn
// sie eine Masken-Datei DIESER Tabelle ist. Nennt `form` die Masken-Datei einer
// anderen Tabelle oder keine, gilt die Standard-Maske, und ein Hinweis sagt es;
// erst hier ist das prüfbar, weil der Katalog die Tabelle der Abfrage nicht
// kennt (4T-002248).
async function maskeDerListe({ sicht, fsp, cache, tabellenPfad, form }) {
  if (form === null) return { maske: null, hinweis: null };
  const eigene = await maskenDerTabelle({ sicht, fsp, cache, tabellenPfad });
  const treffer = eigene.masken.find((p) => trifftMaskenAngabe(p, form));
  if (treffer) return { maske: treffer, hinweis: null };
  const { zugeordnet } = await maskenZuordnung({ sicht, fsp, cache });
  const fremd = zugeordnet.find((m) => trifftMaskenAngabe(m.path, form));
  const hinweis = fremd
    ? baueHinweis('listFormDateiFremd', -1, form, fremd.table)
    : baueHinweis('listFormDateiUnbekannt', -1, form);
  return { maske: null, hinweis };
}

// 4T-002250 (S3): Ist der Datensatz mit dieser Kennung nach der Bedingung
// änderbar? Eine Kennung, die keinen Datensatz eindeutig trifft, ist es nicht.
// 4T-002312: Die Antwort trägt dazu die gesperrten Felder der Zeile, aus
// demselben Kontext; `aenderbar` false heißt nicht änderbar, die Felder zählen
// dann nicht.
function zeileDes(bestand, editable, kennung) {
  const id = kennungFuer(nummerAus(kennung));
  if (id === null) return { aenderbar: false, gesperrt: [] };
  const fundort = dateiFuerKennung(bestand, id);
  if (!fundort.ok) return { aenderbar: false, gesperrt: [] };
  const datei = bestand.dateien.find((d) => d.pfad === fundort.pfad);
  const texte = werteDes(datei.records.get(id));
  const kontext = baueRegelKontext(
    bestand.fields,
    bestand.fields.map((_feld, i) => zellText(texte, i)),
  );
  if (editable !== null && wertePruefregel(editable, { kontext }).erfuellt !== true)
    return { aenderbar: false, gesperrt: [] };
  return { aenderbar: true, gesperrt: gesperrteFelder(bestand.fields, kontext) };
}

// Trägt die Definition eine Bedingung, an der Tabelle oder an einem Feld?
function hatBedingung(definition) {
  const fields = Array.isArray(definition.fields) ? definition.fields : [];
  return !!definition.editable || fields.some((feld) => feld && feld.editable);
}

/**
 * Die Kennungen der genannten Zeilen, deren Datensatz nach der Bedingung
 * `editable` der Definition nicht änderbar ist (4T-002250, S3), und seit
 * 4T-002312 je änderbarer Zeile die nach ihrer Bedingung gesperrten Felder.
 *
 * @param {object} p
 * @param {object} p.fsp Dateizugriff.
 * @param {object} p.definition Die Definition aus dem Katalog (`editable`, `fields`, `path`).
 * @param {string[]} p.kennungen Die Kennungen der gelieferten Zeilen.
 * @returns {Promise<{nichtAenderbar: string[], gesperrteFelder: Object<string, string[]>}>}
 *   `nichtAenderbar` in der Reihenfolge der Anfrage, ohne Doppel;
 *   `gesperrteFelder` je Kennung mit mindestens einem gesperrten Feld.
 */
async function zeilenSperren({ fsp, definition, kennungen }) {
  const gefragt = [...new Set(kennungen)];
  const leer = { nichtAenderbar: [], gesperrteFelder: {} };
  if (!hatBedingung(definition) || gefragt.length === 0) return leer;
  let bestand;
  try {
    bestand = await leseTabellenBestand(fsp, definition.path, definition.path);
  } catch {
    bestand = null;
  }
  if (!bestand || !bestand.ok) return { ...leer, nichtAenderbar: gefragt };
  // Die Bedingungen aus demselben Text, aus dem die Zell-Texte stammen.
  if (!hatBedingung(bestand.definition)) return leer;
  const editable = bestand.definition.editable || null;
  const ergebnis = { nichtAenderbar: [], gesperrteFelder: {} };
  for (const kennung of gefragt) {
    let zeile;
    try {
      zeile = zeileDes(bestand, editable, kennung);
    } catch {
      zeile = { aenderbar: false, gesperrt: [] };
    }
    if (!zeile.aenderbar) ergebnis.nichtAenderbar.push(kennung);
    else if (zeile.gesperrt.length > 0) ergebnis.gesperrteFelder[kennung] = zeile.gesperrt;
  }
  return ergebnis;
}

/**
 * Die Auskunft über eine Listen-Maske.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`, `stat`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Index-Sicht des Bereichs; ohne sie keine Auskunft.
 * @param {Map} [p.cache] Zwischenspeicher des Katalogs.
 * @param {Function} [p.bufferTextFor] Puffer-Auskunft des ungespeicherten Stands.
 * @param {string} p.pfad Absoluter Pfad der Abfrage-Datei.
 * @param {string} p.query Text der Abfrage.
 * @param {string[]} p.spalten Quelltexte der Spalten der Ergebnismenge.
 * @param {string|null} p.tabelle Kopf-Datei aus der Herkunft der Zeilen, oder null.
 * @param {string[]} [p.kennungen] Kennungen der gelieferten Zeilen (4T-002250).
 * @param {Function} [p.herkunft] Naht für den Anmeldenamen (4T-002308).
 * @returns {Promise<object>} `{ istListe: false }` oder `{ istListe: true,
 *   angaben: { editable, form, allow }, tabelle: { path, name }, maske,
 *   spalten: Array<{ index, feld }>, nichtAenderbar: string[], gesperrteFelder, hinweise,
 *   rechte, rolle }`; `gesperrteFelder` seit 4T-002312 je Kennung die gesperrten Felder;
 *   `rechte` ist seit 4T-002308 die Erlaubnis-Menge der Tabelle (S4), `rolle`
 *   seit 4T-002311 die geltende Rolle oder null.
 */
async function liesListe({
  fsp,
  wurzel,
  sicht,
  cache = createDatabaseCatalogCache(),
  bufferTextFor = null,
  pfad,
  query,
  spalten,
  tabelle,
  kennungen = [],
  herkunft = null,
}) {
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('liesListe: fsp ist Pflicht und muss readFile tragen');
  if (!sicht) return keineListe();
  try {
    const text = await liesText({ fsp, pfad, bufferTextFor });
    if (text === null) return keineListe();
    const fm = extractFrontmatter(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    const angaben = parseListAngaben(fm.data);
    if (!angaben.istListe) return keineListe();

    const angabe =
      typeof tabelle === 'string' && tabelle !== '' ? tabelle : tabelleDerAbfrage(query);
    const kopf = angabe === null ? null : findeZielTabelle({ wurzel, sicht, tabelle: angabe });
    if (kopf === null) return keineListe();
    const definition = await tabellenDefinition({
      sicht,
      status: 'ready',
      tabelle: kopf,
      fsp,
      cache,
      bufferTextFor,
    });
    if (!definition.gefunden) return keineListe();

    const fields = Array.isArray(definition.fields) ? definition.fields : [];
    const gewaehlt = await maskeDerListe({
      sicht,
      fsp,
      cache,
      tabellenPfad: definition.path,
      form: angaben.form,
    });
    return {
      istListe: true,
      angaben: { editable: angaben.editable, form: angaben.form, allow: [...angaben.allow] },
      tabelle: { path: definition.path, name: definition.name },
      maske: gewaehlt.maske,
      spalten: (spalten || []).map((quelle, index) => ({
        index,
        feld: feldDerSpalte(quelle, fields),
      })),
      // 4T-002250, 4T-002312: nicht änderbare Zeilen und gesperrte Felder je Zeile.
      ...(await zeilenSperren({ fsp, definition, kennungen })),
      hinweise: gewaehlt.hinweis ? [...angaben.hints, gewaehlt.hinweis] : [...angaben.hints],
      // 4T-002308 (S4): die Erlaubnis-Menge der Tabelle, kein eigener Kanal;
      // 4T-002311: dazu die geltende Rolle für den Hinweis-Text der Masken.
      ...(await rolleUndRechteDerTabelle({
        sicht,
        fsp,
        cache,
        bufferTextFor,
        herkunft,
        tabellenPfad: definition.path,
      })),
    };
  } catch {
    return keineListe();
  }
}

// 4T-002253: `liesText` und `tabelleDerAbfrage` auch für die Auskunft über den
// Positions-Bereich einer Maske (`positions-auskunft.js`).
// 4T-002254 (Epic 3E-000262): Der Hinweis «fremde Maske» für die Übersicht. Der
// Katalog prüft die Angabe `form` einer Abfrage-Datei nur gegen alle
// Masken-Dateien, weil er die Tabelle der Abfrage nicht kennt; ob die getroffene
// Maske zu einer anderen Tabelle gehört, entscheidet dieselbe Regel wie in
// `liesListe` (`maskeDerListe`), mit der Tabelle aus dem Block der Datei. Lässt
// sich die Tabelle nicht bestimmen, unterbleibt der Hinweis, statt geraten zu
// werden. Ergänzt wird an Ort und Stelle in `hints` des Eintrags, damit die
// Übersicht ihn unter den Fehlerlagen der Datei zeigt wie den Fall «unbekannt».
async function fremdeMaskenDerAbfragen({
  abfragen,
  wurzel,
  sicht,
  fsp,
  cache = createDatabaseCatalogCache(),
  bufferTextFor = null,
}) {
  if (!Array.isArray(abfragen) || !sicht || !wurzel) return;
  for (const eintrag of abfragen) {
    if (!eintrag || eintrag.editable !== true || typeof eintrag.form !== 'string') continue;
    if ((eintrag.hints || []).some((h) => h && h.code === 'listFormDateiUnbekannt')) continue;
    try {
      const text = await liesText({ fsp, pfad: eintrag.path, bufferTextFor });
      if (text === null) continue;
      const fm = extractFrontmatter(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
      const angabe = tabelleDerAbfrage(abfrageDesTextes(fm.body));
      const kopf = angabe === null ? null : findeZielTabelle({ wurzel, sicht, tabelle: angabe });
      if (kopf === null) continue;
      const definition = await tabellenDefinition({
        sicht,
        status: 'ready',
        tabelle: kopf,
        fsp,
        cache,
        bufferTextFor,
      });
      if (!definition.gefunden) continue;
      const { hinweis } = await maskeDerListe({
        sicht,
        fsp,
        cache,
        tabellenPfad: definition.path,
        form: eintrag.form,
      });
      if (hinweis && hinweis.code === 'listFormDateiFremd') eintrag.hints.push(hinweis);
    } catch {
      // Weich nach E22: ohne Auskunft kein Hinweis, die Übersicht bleibt.
    }
  }
}

module.exports = {
  abfrageDesTextes,
  feldDerSpalte,
  fremdeMaskenDerAbfragen,
  liesListe,
  liesText,
  tabelleDerAbfrage,
};
