// 4T-001906 (Epic 3E-000318): Karte archivieren — der Eintrag im Kontextmenü
// der Karte und der Weg des Kommandos «Karte auf der Tafel archivieren».
//
// **Warum ein eigenes Modul neben `kanban-bedienung.js`.** Die Karten-Bedienung
// steht nahe an ihrem Zeilen-Budget (Muster `kanban-termin.js`). Das Archivieren
// bringt zwei eigene Angaben mit — den Zeitstempel und die Überschrift eines
// neuen Archivs — und benutzt sonst den Weg des Löschens: Die Karte verlässt
// ihre Spalte, die Auswahl rückt auf die Nachbar-Karte, ein Schreibvorgang, ein
// Rückgängig-Schritt. Diesen Weg bekommt das Modul als Rückruf herein
// (`nimmHeraus`), statt einen zweiten zu bauen.
//
// **Der Zeitstempel ist die lokale Zeit der Anwendung** in der Form
// `YYYY-MM-DD HH:mm`, gebildet von derselben Hilfe wie beim Kommando
// «Zeitstempel einfügen» (`formatTimestamp`): Notiz-Text in der Zeit des
// Anwenders, minutengenau, ohne Zeitzone. Es ist zugleich das Vorgabe-Format
// des Vorbild-Werkzeugs (Beleg in 4T-001902).
//
// **Die Überschrift eines neuen Archivs** kommt aus dem Katalog
// (`kanban.archivUeberschrift`) und trägt je Sprache das Wort, das das
// Vorbild-Werkzeug selbst schreibt und wiedererkennt. Ein vorhandenes Archiv
// behält seine Überschrift; der Kern erkennt es an der Trennlinie und nicht am
// Wortlaut.
//
// **Kein Umschreiben fremder Termine beim Archivieren** (Entscheidung des
// Product Owners vom 2026-09-21): Die Karte wandert mit ihrer Zeile, wie sie
// ist; umgeschrieben wird allein beim Bearbeiten (`kanban-termin.js`).
'use strict';

import { archiviereKarte } from '../../../shared/kanban/kanban-archiv.js';
import { formatTimestamp } from '../../../shared/commands/command-bindings.js';

const UEBERSCHRIFT_SCHLUESSEL = 'kanban.archivUeberschrift';

/**
 * Die Angaben, mit denen der Kern eine Karte archiviert.
 *
 * Liefert die Übersetzung nur ihren Schlüssel zurück — kein Wörterbuch
 * geladen —, bleibt die Überschrift offen, und der Kern schreibt das englische
 * Wort des Vorbilds. Ein Schlüssel als Überschrift im Dokument des Anwenders
 * wäre ein sichtbarer Fehler, den kein Rückgängig-Schritt erklärt.
 *
 * @param {Function} t Übersetzungs-Funktion.
 * @param {Date} [jetzt] Zeitpunkt des Archivierens.
 * @returns {{zeitstempel: string, ueberschrift?: string}}
 */
export function archivAngaben(t, jetzt = new Date()) {
  const wort = typeof t === 'function' ? t(UEBERSCHRIFT_SCHLUESSEL) : null;
  const angaben = { zeitstempel: formatTimestamp(jetzt) };
  if (typeof wort === 'string' && wort.trim() !== '' && wort !== UEBERSCHRIFT_SCHLUESSEL) {
    angaben.ueberschrift = wort;
  }
  return angaben;
}

/**
 * Verdrahtet das Archivieren mit der Karten-Bedienung.
 *
 * @param {object} ctx
 * @param {Function} [ctx.t] Übersetzungs-Funktion.
 * @param {Function} ctx.aenderbar () => boolean.
 * @param {Function} ctx.nimmHeraus (karteEl, operation, angaben) => boolean —
 *   der Weg, auf dem eine Karte ihre Spalte verlässt: offene Eingabe an ihr
 *   verwerfen, Auswahl auf die Nachbar-Karte vormerken, eine Transaktion.
 * @returns {object}
 */
export function createArchivBedienung(ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  /** Archiviert eine Karte; ein Rückgängig-Schritt. */
  function archiviere(karteEl) {
    if (!karteEl || !ctx.aenderbar()) return false;
    return ctx.nimmHeraus(karteEl, archiviereKarte, archivAngaben(t));
  }

  /**
   * Der Eintrag im Kontextmenü einer Karte. Im nicht änderbaren Dokument gibt
   * es keinen; dort erscheint das Menü ohnehin nicht.
   */
  function kartenEintraege(karteEl) {
    if (!karteEl || !ctx.aenderbar()) return [];
    return [
      {
        label: t('kanban.karteArchivieren'),
        dataId: 'kanban-card-archive',
        action: () => archiviere(karteEl),
      },
    ];
  }

  return { archiviere, kartenEintraege };
}
