// 4T-002310 (Epic 3E-000263, F3 A, S1, S5, S6): Der Schutz der Definition beim
// Schreiben einer ganzen Datei als Text.
//
// **Warum hier und nicht an der Schreib-Schnittstelle.** Die Definition einer
// Tabelle und der Steckbrief der Datenbank haben keinen Schreibweg über die
// Schnittstelle; sie werden im Editor als Text gespeichert (`file:save`, auch
// unter neuem Namen über `file:saveAs`) oder von Suchen und Ersetzen im Bereich
// in Menge umgeschrieben (`areaReplace:run`). Alle drei Wege rufen diese eine
// Prüfung, bevor sie schreiben. Ein Schutz, der am Einzel-Speichern greift und
// an der Massen-Ersetzung oder am Speichern unter nicht, wäre eine Lücke.
//
// **Was als Definition gilt** (S5): der Behälter `db-table` einer
// Tabellen-Datei und der Behälter `db-database` des Steckbriefs, jeweils als
// Ganzes. Datensatz-Block, Prosa-Teil und Frontmatter-Schlüssel außerhalb des
// Behälters gehören nicht dazu; Masken- und Abfrage-Dateien ebenso wenig.
// **Ausgenommen ist der Hochwasserstand `lastId`** (Entscheidung der Sitzung vom
// 2026-10-18): Ihn führt die Anwendung, wenn sie Kennungen vergibt, nicht der
// Autor der Definition. Er fällt auf beiden Seiten aus dem Vergleich; sonst wiese
// der Schutz ein Speichern ab, nur weil die Schnittstelle inzwischen eine Kennung
// gezogen hat.
//
// **Verglichen wird der ausgelegte Behälter, nicht der Text.** Beide Stände
// werden mit derselben YAML-Auslegung gelesen wie überall in der Anwendung
// (`extractFrontmatter`, JSON-Schema) und über eine stabile Form mit sortierten
// Schlüsseln verglichen. Eine Umformatierung, andere Anführungszeichen oder eine
// andere Reihenfolge der Schlüssel zählen damit nicht als Änderung; die
// Reihenfolge in Listen zählt, weil die Reihenfolge der Felder die Spalten der
// Datensätze bestimmt. Gegenüber der Rückgabe von `parseTableDefinition` hat
// die rohe Auslegung zwei Vorzüge: Sie erfasst auch Angaben, die der Parser
// (noch) nicht kennt oder verwirft und die eine spätere Stufe wirksam machte,
// und sie besteht allein aus JSON-Werten, ohne übersetzte Ausdrücke.
//
// **Unverändert heißt frei, ohne die Rechte zu lesen** (Story AK4). Erst eine
// geänderte Definition fragt die Erlaubnis-Menge der eigenen Rolle über
// dieselbe Auflösung wie die Schnittstelle (`rechteZumSchreiben`): Eine
// Tabellen-Datei verlangt `define` an ihrer Tabelle, der Steckbrief `define` an
// allen Tabellen der Datenbank. Ohne geltende Rolle ist alles erlaubt (E12.5);
// ist die Erlaubnis-Menge nicht bestimmbar, wird abgewiesen (fail closed, wie
// an der Schnittstelle nach der Entscheidung der Sitzung vom 2026-10-18).
//
// **Die Rechte kommen aus dem gespeicherten Stand.** Die Sicht wird ohne die
// Puffer offener Reiter gefragt: Ein ungespeicherter, gerade unlesbarer
// Steckbrief verlöre im Puffer seine Marke, und die Datenbank erschiene dann
// ohne Rollen. Eine neue Tabelle, die der Index noch nicht kennt, wird als
// zusätzlicher Name aufgelöst, damit eine Rolle mit `define` an allen Tabellen
// sie anlegen darf.
//
// Im Aus-Zustand der Erweiterung «Datenbank» prüft das Modul nichts (S11).
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter');
const {
  DB_TABLE_KEY,
  DB_DATABASE_KEY,
  datenbankMarken,
} = require('../../shared/database/behaelter');
const { tabellenName } = require('./table-catalog.js');

// Platzhalter in der stabilen Form: ein fehlender Behälter und ein Frontmatter,
// das sich nicht auslegen lässt, sind zwei verschiedene Stände und keiner
// gleicht einem Behälter, den die Datei tatsächlich trägt.
const FEHLT = '\u0000fehlt';
const UNLESBAR = '\u0000unlesbar';

// Stabile Form eines JSON-Werts: Schlüssel sortiert, Listen in ihrer Reihenfolge.
function stabil(wert) {
  if (Array.isArray(wert)) return `[${wert.map(stabil).join(',')}]`;
  if (wert && typeof wert === 'object') {
    const teile = Object.keys(wert)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stabil(wert[k])}`);
    return `{${teile.join(',')}}`;
  }
  return wert === undefined ? JSON.stringify(FEHLT) : JSON.stringify(wert);
}

// BOM als Escape-Form wie in index-views.js, kein unsichtbares Zeichen im Quelltext.
const BOM_RE = new RegExp('^\uFEFF');

// Frontmatter eines Textes; ein fehlender Text (neue Datei) hat keines.
function frontmatterVon(text) {
  if (typeof text !== 'string') return { data: null, lesbar: true };
  const fm = extractFrontmatter(text.replace(BOM_RE, ''));
  return { data: fm.parseError ? null : fm.data, lesbar: !fm.parseError };
}

function behaelterForm(fm, schluessel) {
  if (!fm.lesbar) return UNLESBAR;
  if (!fm.data || fm.data[schluessel] === undefined) return FEHLT;
  const wert = fm.data[schluessel];
  if (schluessel === DB_TABLE_KEY && wert && typeof wert === 'object' && !Array.isArray(wert)) {
    const { lastId: _hochwasser, ...definition } = wert;
    return stabil(definition);
  }
  return stabil(wert);
}

/**
 * Welche Definitionen trägt die Datei vor oder nach der Änderung, und haben
 * sie sich geändert? Reine Funktion, ohne Rechte.
 *
 * @param {string|null} alterText Gespeicherter Stand (null bei neuer Datei).
 * @param {string} neuerText Der Stand, der geschrieben werden soll.
 * @returns {{tabelle: boolean, steckbrief: boolean, tabelleGeaendert: boolean,
 *   steckbriefGeaendert: boolean}} `tabelle` und `steckbrief` sagen, ob einer
 *   der beiden Stände die Marke trägt.
 */
function vergleicheDefinition(alterText, neuerText) {
  const alt = frontmatterVon(alterText);
  const neu = frontmatterVon(neuerText);
  const marken = new Set([...datenbankMarken(alt.data), ...datenbankMarken(neu.data)]);
  const tabelle = marken.has('table');
  const steckbrief = marken.has('database');
  return {
    tabelle,
    steckbrief,
    tabelleGeaendert:
      tabelle && behaelterForm(alt, DB_TABLE_KEY) !== behaelterForm(neu, DB_TABLE_KEY),
    steckbriefGeaendert:
      steckbrief && behaelterForm(alt, DB_DATABASE_KEY) !== behaelterForm(neu, DB_DATABASE_KEY),
  };
}

// Die Erlaubnis `define` an einer Tabelle, ohne Rücksicht auf die Schreibung
// des Namens wie in `rechte.js`; eine Tabelle, die die Menge nicht kennt, hat
// keine Erlaubnis.
function darfDefinieren(rechte, name) {
  const klein = String(name).toLowerCase();
  const treffer = Object.keys(rechte || {}).find((n) => n.toLowerCase() === klein);
  return treffer !== undefined && !!rechte[treffer] && rechte[treffer].define === true;
}

/**
 * Baut die Prüfung der Verdrahtung.
 *
 * @param {object} deps Nähte.
 * @param {(pfad: string, bereichsWurzel: string|null) => {status: string,
 *   meta: object|null}} deps.tabellenSicht Die Sicht des Index zur Datei, ohne
 *   Puffer; liefert die Wurzel der Datenbank in `meta.wurzel`.
 * @param {(wurzel: string, optionen: {zusatzNamen: string[]}) => Promise<object>}
 *   deps.rechteFuer Die Rechte-Funktion (`erzeugeRechteFuer`).
 * @param {() => boolean} deps.erweiterungAktiv Schalter der Erweiterung «Datenbank».
 * @returns {(auftrag: {pfad: string, bereichsWurzel?: string|null,
 *   alterText: string|null, neuerText: string}) => Promise<object>} Liefert
 *   `{ abgewiesen: false, lage }` oder `{ abgewiesen: true, code, art, tabelle,
 *   rolle?, grund? }`.
 */
function erzeugeDefinitionsSchutz({ tabellenSicht, rechteFuer, erweiterungAktiv }) {
  if (typeof tabellenSicht !== 'function' || typeof rechteFuer !== 'function')
    throw new TypeError('erzeugeDefinitionsSchutz: tabellenSicht und rechteFuer sind Pflicht');
  return async function pruefeDefinitionsSchutz({
    pfad,
    bereichsWurzel = null,
    alterText,
    neuerText,
  }) {
    if (typeof erweiterungAktiv === 'function' && !erweiterungAktiv())
      return { abgewiesen: false, lage: 'ausgeschaltet' };
    const v = vergleicheDefinition(alterText, neuerText);
    if (!v.tabelle && !v.steckbrief) return { abgewiesen: false, lage: 'keineDefinition' };
    if (!v.tabelleGeaendert && !v.steckbriefGeaendert)
      return { abgewiesen: false, lage: 'unveraendert' };

    const art = v.steckbriefGeaendert ? 'steckbrief' : 'tabelle';
    const eigene = v.tabelle ? tabellenName(pfad) : null;
    const lage = tabellenSicht(pfad, bereichsWurzel) || {};
    const wurzel = lage.meta && typeof lage.meta.wurzel === 'string' ? lage.meta.wurzel : null;
    let antwort;
    if (lage.status !== 'ready' || !wurzel) {
      antwort = { status: typeof lage.status === 'string' ? lage.status : 'unavailable' };
    } else {
      antwort = await rechteFuer(wurzel, { zusatzNamen: eigene ? [eigene] : [] });
    }
    if (!antwort || antwort.status !== 'ready' || !antwort.rechte) {
      const grund =
        antwort && typeof antwort.status === 'string' ? antwort.status : 'antwortUngueltig';
      return { abgewiesen: true, code: 'defineRechteNichtBestimmbar', art, tabelle: eigene, grund };
    }
    if (typeof antwort.rolle !== 'string') return { abgewiesen: false, lage: 'keineRolle' };

    // Zuerst die eigene Tabelle, danach beim Steckbrief alle übrigen in fester
    // Reihenfolge, damit die Meldung bei gleichem Stand dieselbe Tabelle nennt.
    const pflicht = [];
    if (v.tabelleGeaendert || (v.steckbriefGeaendert && eigene)) pflicht.push(eigene);
    if (v.steckbriefGeaendert) pflicht.push(...Object.keys(antwort.rechte).sort());
    const fehlt = pflicht.find((name) => name !== null && !darfDefinieren(antwort.rechte, name));
    if (fehlt !== undefined)
      return {
        abgewiesen: true,
        code: 'defineNichtErlaubt',
        art,
        tabelle: fehlt,
        rolle: antwort.rolle,
      };
    return { abgewiesen: false, lage: 'erlaubt' };
  };
}

/**
 * Der Satz einer Abweisung für den Editor, in der Sprache des Fensters.
 *
 * @param {object} urteil Abweisung aus der Prüfung.
 * @param {(key: string) => string} t Übersetzung.
 * @returns {string}
 */
function abweisungsText(urteil, t) {
  const schluessel =
    urteil.code === 'defineNichtErlaubt'
      ? `database.schutz.${urteil.art === 'steckbrief' ? 'defineSteckbrief' : 'defineTabelle'}`
      : 'database.schutz.defineRechteNichtBestimmbar';
  const werte = { rolle: urteil.rolle || '', tabelle: urteil.tabelle || '' };
  return String(t(schluessel)).replace(/\{(rolle|tabelle)\}/g, (_, k) => werte[k]);
}

module.exports = { erzeugeDefinitionsSchutz, vergleicheDefinition, abweisungsText };
