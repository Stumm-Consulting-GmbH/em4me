// 4T-002404 (Epic 3E-000266, F1 A, F3 A, S2, S3): Die Prüfung einer
// Karteikarte beim Speichern als Text.
//
// **Melden, nie abweisen.** Das Speichern im Editor und im Eigenschafts-Editor
// ist ein Dokument-Schreibweg ohne Abweisung (E27.5, Härte-Revision E22.3).
// Diese Prüfung läuft deshalb **nach** dem Schreiben, liefert ihre Befunde als
// Angabe im Ergebnis des Speicherns und ändert dessen Ausgang nie: Sie wirft
// nicht nach außen, und ein Fehler in ihr wird protokolliert und ergibt keine
// Befunde. Das Vorbild des Anschlusses ist der Schutz der Definition
// (`definitions-schutz.js`), das Vorbild der Folge ist er gerade nicht: Er weist
// ab, diese Prüfung meldet.
//
// **Dieselbe Prüfung wie die Konsistenz-Prüfung** (S1). Geprüft wird über
// `pruefeKarteikarte` in `datensatz-pruefung.js`, mit denselben Funktionen,
// denselben Befund-Codes und demselben Bestand: Typ, Pflicht-Angabe,
// Prüfregeln des Feldes und des Datensatzes, Verweis auf einen fehlenden
// Datensatz und die Schlüssel-Dublette (S2). Was mehrere Karteikarten zugleich
// betrifft und keinem Wert zuzuordnen ist (doppelte Kennung, abweichender
// Profil-Typ, zwei Kartei-Tabellen im Ordner), bleibt der Konsistenz-Prüfung.
//
// **Welche Dateien geprüft werden.** Allein eine Karteikarte im Sinne von
// `karteikartenArt`: im Ordner genau einer Kartei-Tabelle, keine andere
// Datenbank-Datei, keine Vorlage, mit brauchbarer Kennung `db-record`. Ein
// Dokument ohne Kennung im Kartei-Ordner wird nicht geprüft; es bleibt der
// Befund der Konsistenz-Prüfung. Ein Dateikopf ohne `db-record` endet vor jedem
// Zugriff auf Index und Dateisystem, damit das Speichern gewöhnlicher Dokumente
// nichts kostet.
//
// **Der gespeicherte Stand.** Die Sicht des Index kommt ohne die Puffer offener
// Reiter (Muster des Definitions-Schutzes); den Inhalt der Tabelle und ihrer
// Karteikarten liest der Bestand frisch von der Platte, auf der die eben
// gespeicherte Fassung bereits steht.
//
// Im Aus-Zustand der Erweiterung «Datenbank» prüft das Modul nichts.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { DB_RECORD_KEY } = require('../../shared/database/behaelter.js');
const { istKarteiForm } = require('../../shared/database/table-definition.js');
const {
  KARTEIKARTEN_ARTEN,
  imOrdnerDerTabelle,
  karteikartenArt,
} = require('../../shared/database/karteikarte.js');
const { kopfDateien, neuerLauf, bestandFuer } = require('./record-regel-hilfen.js');
const { vorlagenPruefer } = require('./konsistenz-pruefung-kartei.js');
const { HERKUNFT, pruefeKarteikarte } = require('./datensatz-pruefung.js');

// BOM als Escape-Form wie in `definitions-schutz.js`.
const BOM_RE = new RegExp('^﻿');

// Die eine Kartei-Tabelle im Ordner des Dokuments, oder null bei keiner oder
// zweien (dann gehören die Dokumente des Ordners keiner, wie in der
// Konsistenz-Prüfung).
async function karteiTabelleZu(lauf, sicht, pfad) {
  const karteien = [];
  for (const kopf of kopfDateien(sicht)) {
    if (!imOrdnerDerTabelle(pfad, kopf)) continue;
    const ziel = await bestandFuer(lauf, kopf);
    if (ziel && ziel.ok && istKarteiForm(ziel.definition)) karteien.push(kopf);
  }
  return karteien.length === 1 ? karteien[0] : null;
}

/**
 * Baut die Prüfung der Verdrahtung.
 *
 * @param {object} deps Nähte.
 * @param {(pfad: string, bereichsWurzel: string|null) => {status: string,
 *   meta: object|null, sicht: object|null}} deps.tabellenSicht Die Sicht des
 *   Index zur Datei, ohne Puffer; die Wurzel steht in `meta.wurzel`.
 * @param {() => boolean} deps.erweiterungAktiv Schalter der Erweiterung «Datenbank».
 * @param {(fenster: object|null) => Promise<string|null>} [deps.vorlagenOrdner]
 *   Wirksamer Vorlagen-Ordner des Fensters; ohne ihn gilt kein Dokument als Vorlage.
 * @param {object} deps.fsp Dateizugriff (`readFile`).
 * @returns {(auftrag: {pfad: string, text: string, fenster?: object|null,
 *   bereichsWurzel?: string|null}) => Promise<Array<object>|null>} Liefert die
 *   Befunde einer Karteikarte (leer bei einem regelkonformen Dateikopf) oder
 *   null, wenn die Datei keine Karteikarte ist oder nicht geprüft wurde.
 */
function erzeugeSpeicherPruefung({ tabellenSicht, erweiterungAktiv, vorlagenOrdner = null, fsp }) {
  if (typeof tabellenSicht !== 'function' || typeof erweiterungAktiv !== 'function')
    throw new TypeError('erzeugeSpeicherPruefung: tabellenSicht und erweiterungAktiv sind Pflicht');
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('erzeugeSpeicherPruefung: fsp ist Pflicht und muss readFile tragen');

  async function pruefe({ pfad, text, fenster, bereichsWurzel }) {
    if (!erweiterungAktiv()) return null;
    if (typeof pfad !== 'string' || typeof text !== 'string') return null;
    const kopf = extractFrontmatter(text.replace(BOM_RE, ''));
    const frontmatter = kopf.parseError ? null : kopf.data;
    if (!frontmatter || frontmatter[DB_RECORD_KEY] === undefined) return null;
    const lage = tabellenSicht(pfad, bereichsWurzel) || {};
    const wurzel = lage.meta && typeof lage.meta.wurzel === 'string' ? lage.meta.wurzel : null;
    if (lage.status !== 'ready' || !lage.sicht || !wurzel) return null;
    const { sicht } = lage;
    const lauf = neuerLauf({
      bereichsWurzel: wurzel,
      schritte: [],
      bestaende: new Map(),
      tabellenSicht: () => ({ status: 'ready', sicht }),
      fsp,
    });
    const tabelle = await karteiTabelleZu(lauf, sicht, pfad);
    if (tabelle === null) return null;
    const ordner = typeof vorlagenOrdner === 'function' ? await vorlagenOrdner(fenster) : null;
    const istVorlage = vorlagenPruefer(wurzel, ordner);
    const art = karteikartenArt({ pfad, frontmatter, tabellenPfad: tabelle, istVorlage });
    if (art.art !== KARTEIKARTEN_ARTEN.karteikarte) return null;
    const ergebnis = await pruefeKarteikarte({
      lauf,
      sicht,
      kopf: tabelle,
      pfad,
      herkunft: HERKUNFT.speichern,
    });
    return ergebnis ? ergebnis.befunde : null;
  }

  return async function pruefeBeimSpeichern({ pfad, text, fenster = null, bereichsWurzel = null }) {
    try {
      return await pruefe({ pfad, text, fenster, bereichsWurzel });
    } catch (err) {
      // Die Prüfung meldet nur; ihr Fehler darf das Speichern nicht berühren.
      console.warn('Prüfung der Karteikarte beim Speichern fehlgeschlagen:', pfad, err);
      return null;
    }
  };
}

module.exports = { erzeugeSpeicherPruefung };
