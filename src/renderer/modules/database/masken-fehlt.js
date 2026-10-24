// 4T-002333 (Epic 3E-000264, Entscheidung F2 Option A, T4): Der Weg von der
// Einzel-Maske zurück in die Tabellen-Datei.
//
// **Warum das Modul so heißt** (S1 des Epics): Es trägt die Lagen der Maske
// rund um die Ablage ihres Datensatzes. Heute ist das der Handgriff «Im
// Tabellen-Dokument zeigen»; mit 4T-002334 kommt der Zustand «Datensatz fehlt»
// hinzu, wenn eine wiederhergestellte Maske ihren Datensatz nicht mehr findet.
//
// **Der Handgriff** ersetzt den früheren Klick-Weg eines Verweises im
// Fließtext: Seit 4T-002333 öffnet der Verweis die Maske
// (`views/link-navigation.js`), und die Zeile in der Tabellen-Datei erreicht
// der Anwender von dort mit einem Klick. Der Sprung selbst ist derselbe wie
// vorher beim Verweis: Kopf-Datei öffnen, dann `scrollToAnchorAfterOpen` mit
// der Kennung (Zeile `[data-rec-id]` in der Lese-Ansicht, Datensatz-Zeile im
// Quelltext, `anchor-navigation.js`).
//
// **Der Zustand «Datensatz fehlt»** (4T-002334, T5): Liefert der Kanal
// `database:datensatz` für den gebundenen Gegenstand den Code
// `auftragDatensatzUnbekannt` oder `auftragTabelleUnbekannt`, zeigt die Maske
// statt des Satzes der Schreib-Schnittstelle den Hinweis, dass der Datensatz
// nicht mehr vorhanden ist, und in der Leiste den Handgriff «Tabelle öffnen»
// (Kopf-Datei öffnen, ohne Sprung). Der Fall entsteht vor allem, wenn die
// Sitzung eine Maske wiederherstellt, deren Datensatz inzwischen gelöscht ist.
//
// **Der Sitzungs-Eintrag** (4T-002334, T1): `maskenSitzung` bildet aus dem
// Seiten-Zustand den Eintrag, den die Masken-Seite beim Register der Sitzung
// (`app/sitzungs-maske.js`) anmeldet, und den Öffner für die Wiederherstellung.
// Er steht hier und nicht in der Seite, weil die Seite an ihrem Größen-Budget
// steht und nur den Aufruf trägt.
//
// Ohne Fenster-Zustand: Öffnen, Sprung und Zustand kommen herein, damit das
// Modul in jsdom prüfbar bleibt und keine Import-Kante zu den Reitern oder zur
// Ansicht bekommt (Muster `masken-verwendung.js`).
'use strict';

import { t } from '../../i18n.js';
import { MODUS_LESEN } from './masken-felder.js';

// Die beiden Lagen-Codes des Kanals, die «Datensatz fehlt» bedeuten
// (`src/main/database/record-auftrag-pruefung.js`, Lagen-Katalog).
const FEHLT_CODES = new Set(['auftragDatensatzUnbekannt', 'auftragTabelleUnbekannt']);

/**
 * Meldet die Antwort des Kanals, dass Datensatz oder Tabelle fehlen?
 *
 * @param {object|null} daten Der Stand der Seite.
 * @returns {boolean}
 */
export function datensatzFehlt(daten) {
  return !!daten && daten.status === 'error' && FEHLT_CODES.has(daten.code);
}

// Name der Tabelle ohne Ordner und ohne Endung, wie im Kopf der Maske.
function tabellenName(pfad) {
  const text = String(pfad || '');
  const idx = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return (idx >= 0 ? text.slice(idx + 1) : text).replace(/\.md$/i, '');
}

/**
 * Der Sitzungs-Eintrag der Masken-Seite und ihr Öffner für das Register der
 * Sitzung. Eine Neuanlage und eine Seite ohne Kennung liefern keinen Eintrag.
 *
 * @param {object} seite Der Zustand der Masken-Seite.
 * @param {Function} oeffneMaske (tabellenPfad, kennung, {maske}) => void.
 * @returns {{eintrag: Function, oeffne: Function}}
 */
export function maskenSitzung(seite, oeffneMaske) {
  return {
    eintrag() {
      if (!seite || seite.neu || !seite.tabellenPfad || !seite.kennung) return null;
      return { tabelle: seite.tabellenPfad, kennung: seite.kennung, maske: seite.maske || null };
    },
    async oeffne({ tabelle, kennung, maske }) {
      oeffneMaske(tabelle, kennung, { maske: maske || null });
    },
  };
}

/**
 * Erzeugt den Handgriff einer Masken-Seite.
 *
 * @param {object} p
 * @param {Function} p.openInPane (paneIdx, pfade) => Promise<number>, der Weg der
 *   Reiter; liefert die Spalte, in der die Datei tatsächlich offen ist.
 * @param {Function} p.scrollToAnchorAfterOpen (paneIdx, anker) => void.
 * @param {object} p.state Der Zustand des Fensters (`activePaneIndex`).
 * @returns {{zeichne: Function, zeige: Function, fehltText: Function, zeichneFehlt: Function}}
 */
export function erzeugeDokumentHandgriff({ openInPane, scrollToAnchorAfterOpen, state }) {
  // Öffnet die Kopf-Datei der Tabelle und springt an die Zeile des Datensatzes.
  async function zeige(tabellenPfad, kennung) {
    if (!tabellenPfad || !kennung) return;
    const spalte = state.activePaneIndex;
    const ziel = await openInPane(spalte, [tabellenPfad]);
    scrollToAnchorAfterOpen(Number.isInteger(ziel) ? ziel : spalte, kennung);
  }

  /**
   * Hängt den Knopf an die Aktions-Leiste: nur im Lesen und nur für einen
   * gespeicherten Datensatz mit Kennung und Tabelle.
   *
   * @param {HTMLElement} leiste Die Aktions-Leiste des Kopfs.
   * @param {object} seite Der Zustand der Masken-Seite.
   */
  function zeichne(leiste, seite) {
    if (!leiste || !seite || seite.neu || seite.modus !== MODUS_LESEN) return;
    const { tabellenPfad, kennung } = seite;
    if (typeof tabellenPfad !== 'string' || !tabellenPfad) return;
    if (typeof kennung !== 'string' || !kennung) return;
    const knopf = document.createElement('button');
    knopf.className = 'db-form-btn db-form-show-in-document';
    knopf.type = 'button';
    knopf.textContent = t('database.form.action.showInDocument');
    knopf.addEventListener('click', () => void zeige(tabellenPfad, kennung));
    leiste.appendChild(knopf);
  }

  /**
   * Der Hinweis «Datensatz fehlt», oder null bei jeder anderen Lage.
   *
   * @param {object|null} daten Der Stand der Seite.
   * @param {object} seite Der Zustand der Masken-Seite.
   * @returns {string|null}
   */
  function fehltText(daten, seite) {
    if (!datensatzFehlt(daten)) return null;
    return t('database.form.missingRecord')
      .split('{id}')
      .join(String((seite && seite.kennung) || ''))
      .split('{tabelle}')
      .join(tabellenName(seite && seite.tabellenPfad));
  }

  /**
   * Hängt im Zustand «Datensatz fehlt» eine Leiste mit «Tabelle öffnen» an den
   * Kopf; bei jeder anderen Lage geschieht nichts.
   *
   * @param {HTMLElement} kopf Der Kopf der Seite.
   * @param {object|null} daten Der Stand der Seite.
   * @param {object} seite Der Zustand der Masken-Seite.
   */
  function zeichneFehlt(kopf, daten, seite) {
    if (!kopf || !seite || !datensatzFehlt(daten)) return;
    const tabellenPfad = seite.tabellenPfad;
    if (typeof tabellenPfad !== 'string' || !tabellenPfad) return;
    const leiste = document.createElement('div');
    leiste.className = 'db-form-actions';
    const knopf = document.createElement('button');
    knopf.className = 'db-form-btn db-form-open-table';
    knopf.type = 'button';
    knopf.textContent = t('database.form.action.openTable');
    knopf.addEventListener('click', () => void openInPane(state.activePaneIndex, [tabellenPfad]));
    leiste.appendChild(knopf);
    kopf.appendChild(leiste);
  }

  return { zeichne, zeige, fehltText, zeichneFehlt };
}
