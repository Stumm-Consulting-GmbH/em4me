// 4T-001902 (Epic 3E-000318): Das Archivieren einer Karte — die Karte samt
// Folgezeilen aus ihrer Spalte in den Archiv-Abschnitt am Dateiende.
//
// Prozessneutral wie die Nachbarn: reine Funktion Text→Text, kein DOM, kein
// Electron, kein Datei-Zugriff, keine Uhr und keine Sprache. Zeitstempel und
// Überschrift eines neuen Archivs bringt der Aufrufer mit. Eine eigene Datei
// statt eines weiteren Abschnitts in `kanban-operationen.js`, weil das
// Archivieren als einzige Operation zwei Bereiche der Tafel zugleich
// umschreibt und eine eigene Grammatik trägt (Anlage, Zeitstempel,
// Obergrenze); Rahmen und Rückgabe-Form sind dieselben.
//
// **Die Form folgt dem Vorbild** (Version 2.0.51, gelesen am 2026-09-23):
// Trennlinie, Leerzeile, Überschrift, Leerzeile, Karten (`list.ts:431`); eine
// einzeln archivierte Karte kommt **unten** hinzu (`boardModifiers.ts:240`);
// der Zeitstempel steht vor dem Titel, verbunden mit einem Leerzeichen und
// ohne Trenner (`boardModifiers.ts:40–55`, Vorgaben `StateManager.ts:
// 230–249`).
//
// **Drei Abweichungen vom Vorbild, alle gewollt:** Der Zeitstempel ist fest an
// statt über einen Schalter (Vorgabe dort aus), die Obergrenze ist fest 100
// statt einstellbar mit Vorgabe «unbegrenzt» (Entscheidung des Product Owners
// vom 2026-09-23; einstellbar erst in der Stufe 3), und die Überschrift kommt
// vom Aufrufer statt aus der Sprach-Einstellung des Vorbilds.
'use strict';

const { leseTafel, ohneCr, crVon, istLeer, ARCHIV_TRENNER } = require('./kanban-core.js');
const {
  mitTafel,
  holeSpalte,
  holeKarte,
  neueZeile,
  endeEinfuegeIndex,
  pruefeEinzeiler,
} = require('./kanban-operationen.js');

// Die Obergrenze des Archivs in Karten. Übersteigt das Archiv sie nach dem
// Anfügen, fallen die ältesten — die obersten — heraus, wie im Vorbild
// `archive.slice(maxArchiveLength * -1)` (`Kanban.tsx:149–158`).
const ARCHIV_OBERGRENZE = 100;

// Die Überschrift eines neu angelegten Archivs, wenn der Aufrufer keine
// mitbringt: das englische Wort des Vorbilds (`t('Archive')`), das es ohne
// Sprach-Einstellung selbst schreibt.
const ARCHIV_UEBERSCHRIFT_VORGABE = 'Archive';

// Das Vorgabe-Format des Vorbilds, `YYYY-MM-DD HH:mm`.
const ZEITSTEMPEL_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

// Der Zeitstempel hinter das Kästchen und vor den Titel. Kopf und Abstand der
// Zeile bleiben, wie sie sind; eine Karte ohne Text bekommt den einen Abstand,
// den das Vorbild zwischen Kästchen und Titel immer schreibt.
function mitZeitstempel(zeile, aufgabe, zeitstempel) {
  const kopf = `${aufgabe.indent}${aufgabe.bullet}${aufgabe.bulletGap}[${aufgabe.statusChar}]`;
  const inhalt = zeile.slice(kopf.length + aufgabe.statusGap.length);
  const abstand = aufgabe.statusGap || ' ';
  return kopf + abstand + zeitstempel + (inhalt === '' ? '' : ' ' + inhalt);
}

/**
 * Fügt einen Block ein. Liegt die Stelle am Ende einer Datei **ohne**
 * Schluss-Umbruch, bekommt die bisher letzte Zeile ihr Zeilenende und der
 * Block verliert das seine, damit die Datei so endet wie vorher.
 */
function fuegeEin(model, index, block) {
  const ziel = endeEinfuegeIndex(model, index);
  if (ziel < model.zeilen.length) {
    model.zeilen.splice(ziel, 0, ...block);
    return;
  }
  const letzte = model.zeilen.length - 1;
  model.zeilen[letzte] = neueZeile(model, ohneCr(model.zeilen[letzte]));
  block[block.length - 1] = ohneCr(block[block.length - 1]);
  model.zeilen.push(...block);
}

// Wohin die Karte in einem vorhandenen Archiv kommt: hinter die letzte
// Archiv-Karte, in einem leeren Archiv hinter die Leerzeile unter der
// Überschrift.
function archivEinfuegeIndex(model, archiv) {
  const karten = archiv.karten;
  if (karten.length > 0) return karten[karten.length - 1].letzteZeile + 1;
  const nach = archiv.ueberschriftZeile + 1;
  return istLeer(model.zeilen[nach]) && nach <= archiv.bisZeile ? nach + 1 : nach;
}

// Ein neues Archiv in der Form des Vorbilds, am Ende der letzten Spalte und
// vor einem Einstellungs-Block, dem wie beim Vorbild zwei Leerzeilen
// vorangehen (`common.ts:29–39`).
function legeArchivAn(model, ueberschrift, block) {
  const index = model.einstellungen ? model.einstellungen.vonZeile : model.zeilen.length;
  const ziel = endeEinfuegeIndex(model, index);
  const kopf = [ARCHIV_TRENNER, '', `## ${ueberschrift}`, ''];
  if (ziel > 0 && !istLeer(model.zeilen[ziel - 1])) kopf.unshift('');
  const fuss = model.einstellungen ? ['', ''] : [];
  fuegeEin(model, index, [
    ...kopf.map((z) => neueZeile(model, z)),
    ...block,
    ...fuss.map((z) => neueZeile(model, z)),
  ]);
}

// Hält das Archiv bei der Obergrenze. Gezählt wird am frisch gelesenen
// Zeilen-Puffer, entfernt wird von hinten nach vorn, damit die Zeilen-Nummern
// der übrigen gültig bleiben.
function kuerzeArchiv(model) {
  const archiv = leseTafel(model.zeilen.join('\n')).archiv;
  if (!archiv) return;
  const ueberschuss = archiv.karten.length - ARCHIV_OBERGRENZE;
  for (let i = ueberschuss - 1; i >= 0; i--) {
    const karte = archiv.karten[i];
    model.zeilen.splice(karte.zeile, karte.letzteZeile - karte.zeile + 1);
  }
}

/**
 * Archiviert eine Karte: nimmt sie samt Folgezeilen aus ihrer Spalte und
 * schreibt sie ans Ende des Archiv-Abschnitts. Fehlt der Abschnitt, entsteht
 * er; ein vorhandenes, auch fremdes Archiv wird mit Überschrift und Bestand
 * unverändert weitergeführt. Das Status-Zeichen bleibt, wie es ist.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, zeitstempel?: string,
 *   ueberschrift?: string}} angaben `zeitstempel` als `YYYY-MM-DD HH:mm`;
 *   fehlt er, kommt die Karte ohne Zeitstempel ins Archiv. `ueberschrift` gilt
 *   nur für ein neu angelegtes Archiv.
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function archiviereKarte(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    const zeitstempel = angaben.zeitstempel == null ? null : String(angaben.zeitstempel);
    if (zeitstempel !== null && !ZEITSTEMPEL_RE.test(zeitstempel))
      return { code: 'zeitstempelUngueltig', detail: zeitstempel };
    let ueberschrift = ARCHIV_UEBERSCHRIFT_VORGABE;
    if (angaben.ueberschrift != null) {
      const geprueft = pruefeEinzeiler(angaben.ueberschrift);
      if (geprueft === null)
        return { code: 'ungueltigeUeberschrift', detail: String(angaben.ueberschrift) };
      ueberschrift = geprueft.trim();
    }

    const block = model.zeilen.slice(karte.zeile, karte.letzteZeile + 1);
    if (zeitstempel !== null) {
      block[0] = mitZeitstempel(ohneCr(block[0]), karte.aufgabe, zeitstempel) + crVon(block[0]);
    }
    // Erst einfügen, dann entnehmen: Archiv und Einstellungs-Block liegen
    // hinter jeder Spalte, das Einfügen verschiebt die Karte also nicht.
    if (model.archiv) fuegeEin(model, archivEinfuegeIndex(model, model.archiv), block);
    else legeArchivAn(model, ueberschrift, block);
    model.zeilen.splice(karte.zeile, karte.letzteZeile - karte.zeile + 1);
    kuerzeArchiv(model);
    return null;
  });
}

module.exports = {
  ARCHIV_OBERGRENZE,
  archiviereKarte,
};
