// 4T-002406 (Epic 3E-000266, F7 A): Ist ein geöffnetes Dokument eine
// Karteikarte, und welcher Datensatz ist es?
//
// **Dieselbe Erkennung wie die Handgriffe der Kartei-Form** (`karteikarte-anlegen.js`):
// Die Kartei-Tabelle kommt aus dem Überblick der Datenbank (Feld `storage` je
// Tabelle) zusammen mit der Regel der Karteikarte, das Dokument liegt im selben
// Ordner wie genau eine Kartei-Tabelle (`imOrdnerDerTabelle`). Ob es eine
// Karteikarte ist, sagt `karteikartenArt` am Dateikopf, dieselbe Funktion wie im
// Haupt-Prozess; gelesen wird der Text des Reiters, also auch ein noch nicht
// gespeicherter Stand.
//
// **Zwei Fassungen derselben Frage.** Die Verfügbarkeit eines Kommandos wird
// synchron entschieden (Kontext der Kommando-Palette), deshalb liest
// `karteikarteImReiterSofort` die zuletzt bereite Auskunft
// (`tabellenSofort`). Der Handgriff selbst wartet auf die frische Auskunft
// (`karteikarteImReiter`).
//
// **Ein Blatt-Modul.** Die Kommando-Palette fragt hier für ihren Kontext, und
// die Reiter-Verwaltung importiert die Palette; ein Import der Reiter oder der
// Ansichten von hier schlösse einen Kreis. Das Modul liest deshalb nur den
// Überblick der Datenbank, den Schalter der Erweiterung und geteilte Regeln.
'use strict';

import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
import {
  imOrdnerDerTabelle,
  karteikartenArt,
  KARTEIKARTEN_ARTEN,
} from '../../../shared/database/karteikarte.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { datenbankAuskunft, tabellenSofort } from './datenbank-bereich.js';

// Der Pfad eines Reiters, der ein Dokument zeigt, oder null bei einer System-
// oder Handbuch-Seite.
function dokumentPfad(tab) {
  if (!tab || tab.systemPage || tab.manualPage) return null;
  return typeof tab.path === 'string' && tab.path !== '' ? tab.path : null;
}

/**
 * Der Datensatz eines Dokuments, wenn es eine Karteikarte ist.
 *
 * @param {string} pfad Pfad des Dokuments.
 * @param {string} text Text des Dokuments.
 * @param {object[]|null} tabellen Die Tabellen des Überblicks (`path`, `storage`).
 * @returns {{tabelle: string, kennung: string}|null} Pfad der Kartei-Tabelle und
 *   Kennung; null für jedes andere Dokument, bei keiner oder zwei
 *   Kartei-Tabellen im Ordner und ohne Überblick.
 */
export function karteikarteAus(pfad, text, tabellen) {
  if (typeof pfad !== 'string' || pfad === '' || typeof text !== 'string') return null;
  if (!Array.isArray(tabellen)) return null;
  const karteien = tabellen.filter(
    (e) =>
      e && e.storage === 'cards' && typeof e.path === 'string' && imOrdnerDerTabelle(pfad, e.path),
  );
  if (karteien.length !== 1) return null;
  // Ohne Dateikopf keine Kennung; der Text wird dann nicht ausgelegt.
  const ohneBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!ohneBom.startsWith('---')) return null;
  const kopf = extractFrontmatter(text);
  if (kopf.parseError || !kopf.data) return null;
  const tabelle = karteien[0].path;
  const art = karteikartenArt({ pfad, frontmatter: kopf.data, tabellenPfad: tabelle });
  return art.art === KARTEIKARTEN_ARTEN.karteikarte ? { tabelle, kennung: art.kennung } : null;
}

/**
 * Ist das Dokument des Reiters eine Karteikarte? Ohne Warten, aus der zuletzt
 * bereiten Auskunft; im Aus-Zustand der Erweiterung «Datenbank» nie.
 *
 * @param {object|null} tab Der Reiter.
 * @returns {{tabelle: string, kennung: string}|null}
 */
export function karteikarteImReiterSofort(tab) {
  if (!isExtensionActive('database')) return null;
  const pfad = dokumentPfad(tab);
  if (pfad === null) return null;
  return karteikarteAus(pfad, tab.content, tabellenSofort());
}

/**
 * Dieselbe Frage mit der frischen Auskunft, für den Handgriff.
 *
 * @param {object|null} tab Der Reiter.
 * @returns {Promise<{tabelle: string, kennung: string}|null>}
 */
export async function karteikarteImReiter(tab) {
  if (!isExtensionActive('database')) return null;
  const pfad = dokumentPfad(tab);
  if (pfad === null) return null;
  const auskunft = await datenbankAuskunft();
  return karteikarteAus(pfad, tab.content, auskunft.tabellen);
}
