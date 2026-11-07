// 4T-002509 (Epic 3E-000402): Kern des Dashboards — Leser und Schreiber der
// Fence `perspective-dashboard`, dazu die Sicht, die eine Anzeige zeichnet.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM, kein
// Datei-Zugriff; Muster `canvas/canvas-core.js`). Der Kern kennt nur Text und
// ein Modell; wer ihn aufruft, bringt den Rumpf des Blocks mit.
//
// **Grammatik** nach Abschnitt 1 der Konzept-Stufe (4T-002506). Die
// lexikalische Hülle ist die der Canvas und steht in `canvas/marker-grammatik.js`.
// Darauf drei Elemente (V1 bis V5 des Product Owners, Wortschatz deutsch):
//
//   !filter <name> [titel="…"] [eigenschaft=<feld>] [vorbelegung=<wert>]
//       Inhalts-Zeilen: aufgezählte Werte, einer je Zeile.
//   !zeile
//       beginnt eine Zeile des Rasters; Inhalts-Zeilen haben keine Bedeutung.
//   !kachel <art> [titel="…"] [breite=<anteil>] [abfrage="<Abfrage-Datei>"]
//       Inhalts-Zeilen: die Abfrage, bei der Art `text` Markdown.
//
// **Modell und Sicht sind zwei Dinge** (Abschnitt 3.1): Das Modell trägt die
// Elemente samt Rohtext und wird zurückgeschrieben; die Sicht leitet daraus
// Filter, Zeilen und Kacheln samt aufgelöster Breite, Quelle und Befunden ab
// und wird angezeigt (Muster `canvasListe`). Die Befunde des Modells sind die
// der Sicht: `parseDashboardFence` setzt `model.errors` aus derselben Auswertung,
// die `dashboardSicht` nach einer Änderung erneut fährt — eine Regel, ein Ort.
//
// **Rohtext-Erhalt nach den Canvas-Regeln G1 und G2 sinngemäß:** Ein
// unbekannter Marker und eine unbekannte Angabe laufen mit ihrem Rohtext mit;
// ein unverändertes Element wird wörtlich zurückgeschrieben, nur ein
// geändertes oder neues in kanonischer Form.
//
// **Fehler-Semantik wie beim Canvas-Kern:** Ein Befund landet mit Code, Zeile
// und Detail in `model.errors` und wird nie geworfen; das Element bleibt im
// Modell. Die Zeile zählt im Rumpf des Blocks ab 1.
'use strict';

const {
  MARKER_ZEILE_RE,
  trenneZeilen,
  ohneCr,
  ermittleZeilenende,
  entschuetze,
  schuetze,
  packeWert,
  leseAngaben,
} = require('../canvas/marker-grammatik.js');
const { zaunOeffnung, schliesstZaun } = require('../markdown/fence-level.js');
const { leseBreite, kanonischeBreite, verteileBreiten } = require('./dashboard-breite.js');

// Kennung der Erweiterung. Sie steht im prozessneutralen Kern, weil Pipeline,
// Registry und Anzeige sie gleichermaßen brauchen (Muster `CANVAS_EXTENSION_ID`).
const DASHBOARD_EXTENSION_ID = 'dashboard';

// Info-Zeichenfolge des Blocks.
const DASHBOARD_FENCE = 'perspective-dashboard';

// Die Marker der Stufe 1. Was später hinzukommt, fängt bis dahin G1 auf.
const MARKER_ARTEN = new Set(['filter', 'zeile', 'kachel']);

// Die Arten der Kachel (V3), klein geschrieben; eine Vorgabe-Art gibt es nicht.
const KACHEL_ARTEN = Object.freeze(['kennzahl', 'liste', 'tabelle', 'balken', 'kreis', 'text']);

// Die Art ohne Abfrage. Alle übrigen Arten sind Daten-Arten und brauchen genau
// eine Datenquelle (V2).
const TEXT_ART = 'text';

// Name eines Filters und damit seines Platzhalters `$name` (Abschnitt 1.3):
// Buchstabe oder Unterstrich, danach Buchstaben, Ziffern, Unterstriche. Kein
// Bindestrich (Minus in der Abfrage) und kein Punkt (Feld-Pfad).
const FILTER_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

// Angaben, die kanonisch immer in Anführungszeichen stehen, wie das Beispiel
// der Konzept-Stufe sie schreibt: Titel und Ziel lesen sich so als Text und
// nicht als Wort, auch ohne Leerzeichen.
const IMMER_QUOTEN = new Set(['titel', 'abfrage']);

// Kommentar-Zeile (Abschnitt 1.5): beginnt in Spalte 0 mit `%%` und endet mit
// `%%`. Bewusst nicht der Kommentar-Scanner aus `markdown/plugins/comments.js`:
// Der liest Kommentare innerhalb einer Zeile und unpaarige Marker bis zum
// Dokument-Ende; der Block kennt nach der Konzept-Stufe allein die ganze Zeile.
const KOMMENTAR_RE = /^%%.*%%$/;

function istKommentarZeile(zeile) {
  return KOMMENTAR_RE.test(ohneCr(String(zeile == null ? '' : zeile)));
}

// --- Lesen ---------------------------------------------------------------------

function neuesElement(art, zeile) {
  return {
    art,
    name: null,
    attrs: {},
    attrFolge: [],
    inhalt: '',
    roh: { marker: '', inhalt: [] },
    geaendert: false,
    zeile,
  };
}

/**
 * Liest den Rumpf eines Dashboard-Blocks in ein Modell. Wirft nie.
 *
 * Je Element: `art` (`filter`, `zeile`, `kachel` oder `unbekannt`), `name` (der
 * erste Stellungs-Operand: Name des Filters, Art der Kachel), `operanden` (die
 * übrigen Stellungs-Operanden als Rohtext, damit eine kanonisch geschriebene
 * Zeile sie nicht verliert), `attrs`, `attrFolge`, `inhalt` (Inhalts-Zeilen ohne
 * `\r` und ohne Rückstrich-Schutz), `roh` (Marker-Zeile und Inhalts-Zeilen
 * wörtlich), `geaendert`, `zeile`; ein unbekanntes Element trägt dazu `marker`.
 *
 * @param {string} text Rumpf des Blocks ohne die Zaun-Zeilen.
 * @returns {{praeambel: string[], elemente: object[], errors: object[], zeilenende: string}}
 */
function parseDashboardFence(text) {
  const zeilen = trenneZeilen(text);
  const model = {
    praeambel: [],
    elemente: [],
    errors: [],
    zeilenende: ermittleZeilenende(zeilen),
  };
  let aktuell = null;

  for (let i = 0; i < zeilen.length; i++) {
    const roh = zeilen[i];
    const zeile = ohneCr(roh);
    if (!zeile.startsWith('!')) {
      if (aktuell) aktuell.roh.inhalt.push(roh);
      else model.praeambel.push(roh);
      continue;
    }
    const treffer = MARKER_ZEILE_RE.exec(zeile);
    const art = treffer && MARKER_ARTEN.has(treffer[1]) ? treffer[1] : 'unbekannt';
    aktuell = neuesElement(art, i + 1);
    aktuell.roh.marker = roh;
    model.elemente.push(aktuell);
    if (art === 'unbekannt') {
      // Eine Zeile mit `!`, aber ohne Marker-Wort (etwa `!= 3`), ist ebenso ein
      // unbekannter Marker: Sie bleibt mit Rohtext und Position stehen.
      aktuell.marker = treffer ? treffer[1] : '';
      continue;
    }
    const operanden = leseAngaben(aktuell, treffer[2]);
    aktuell.name = operanden.shift() || null;
    // Weitere Stellungs-Operanden hinter Name bzw. Art (etwa
    // `!kachel kennzahl Offene`) laufen mit ihrem Rohtext mit (G1 sinngemäß);
    // die Auswertung meldet sie bei Filter und Kachel mit dem Hinweis-Code
    // `zusatzUnbekannt` (Entscheidung der Sitzung vom 2026-11-03, 4T-002512).
    aktuell.operanden = operanden;
  }

  for (const el of model.elemente) {
    el.inhalt = el.roh.inhalt.map((z) => entschuetze(ohneCr(z))).join('\n');
  }
  model.errors = werteAus(model).errors;
  return model;
}

// --- Auswerten: Befunde und Sicht ------------------------------------------------

function befund(fehler, code, zeile, detail) {
  const eintrag = { code, zeile, detail: detail == null ? '' : String(detail) };
  fehler.push(eintrag);
  return eintrag;
}

// Inhalts-Zeilen eines Elements ohne Kommentar-Zeilen.
function ohneKommentare(inhalt) {
  return String(inhalt || '')
    .split('\n')
    .filter((z) => !istKommentarZeile(z));
}

// Leerzeilen am Anfang und am Ende gehören zum Satzbild des Blocks, nicht zum
// Inhalt einer Kachel; Einrückung innerhalb bleibt stehen.
function ohneRandLeerzeilen(zeilen) {
  let von = 0;
  let bis = zeilen.length;
  while (von < bis && zeilen[von].trim() === '') von++;
  while (bis > von && zeilen[bis - 1].trim() === '') bis--;
  return zeilen.slice(von, bis).join('\n');
}

// Wert einer Angabe oder `null`, wenn sie fehlt oder nur Leerraum trägt.
function angabe(el, name) {
  const wert = el.attrs[name];
  return wert == null || String(wert).trim() === '' ? null : String(wert);
}

// Zusätzliche Wörter hinter Name bzw. Art sind ein Hinweis, kein Fehler: Das
// Element bleibt gültig, die Sicht übergeht die Wörter, das Modell behält sie.
function meldeZusatz(el, melde) {
  if (Array.isArray(el.operanden) && el.operanden.length > 0) {
    melde('zusatzUnbekannt', el.operanden.join(' '));
  }
}

/**
 * `!filter`: Name, Quelle der Werte und Vorbelegung (V5, Abschnitt 1.3).
 *
 * @returns {object|null} die Sicht des Filters, `null` wenn er entfällt.
 */
function filterSicht(el, index, namen, alle) {
  const fehler = [];
  const melde = (code, detail) => alle.push(befund(fehler, code, el.zeile, detail));
  if (!el.name || !FILTER_NAME_RE.test(el.name)) {
    melde('filterOhneName', el.name || '');
    return null;
  }
  const schluessel = el.name.toLowerCase();
  if (namen.has(schluessel)) {
    melde('filterDoppelt', el.name);
    return null;
  }
  namen.add(schluessel);
  meldeZusatz(el, melde);

  const werte = ohneKommentare(el.inhalt)
    .map((z) => z.trim())
    .filter((z) => z !== '');
  const aufgezaehlt = werte.length > 0;
  // Über `angabe()` wie jede andere Angabe: Ein leeres `eigenschaft=""` ist
  // keine zweite Quelle (Review-Runde 1 von 3E-000402, Befund A3).
  if (aufgezaehlt && angabe(el, 'eigenschaft') !== null) melde('filterQuelleDoppelt', el.name);

  let vorbelegung = angabe(el, 'vorbelegung');
  if (vorbelegung !== null && aufgezaehlt) {
    // Ohne Rücksicht auf Groß- und Kleinschreibung, wie der spätere Vergleich in
    // der Abfrage; gilt dann die Schreibweise des aufgezählten Wertes.
    const klein = vorbelegung.toLowerCase();
    const passend = werte.find((w) => w.toLowerCase() === klein);
    if (passend === undefined) melde('vorbelegungUnbekannt', vorbelegung);
    vorbelegung = passend === undefined ? null : passend;
  }

  return {
    name: el.name,
    schluessel,
    titel: angabe(el, 'titel') !== null ? el.attrs.titel : el.name,
    werte: aufgezaehlt ? werte : null,
    eigenschaft: aufgezaehlt ? null : angabe(el, 'eigenschaft') || el.name,
    vorbelegung,
    zeile: el.zeile,
    index,
    fehler,
  };
}

/**
 * `!kachel`: Art, Titel, Breite und genau eine Datenquelle (V2, V3, V4).
 *
 * Die Quelle hat eine von drei Formen: `{typ: 'abfrage', text}` aus den
 * Inhalts-Zeilen ohne Kommentar-Zeilen, `{typ: 'datei', ziel}` aus `abfrage=`
 * (aufgelöst erst in D2 und D9) oder `{typ: 'text', text}` bei der Art `text`.
 * Bei einem Befund der Quelle ist sie `null`, und die Anzeige zeigt die
 * Fehler-Kachel an ihrem Platz.
 */
function kachelSicht(el, index, alle) {
  const fehler = [];
  const melde = (code, detail) => alle.push(befund(fehler, code, el.zeile, detail));
  const art = KACHEL_ARTEN.includes(el.name) ? el.name : null;
  if (art === null) melde('artUnbekannt', el.name || '');
  meldeZusatz(el, melde);

  const breite = leseBreite(el.attrs.breite);
  if (!breite.gueltig) melde('breiteUnbekannt', el.attrs.breite);

  const datei = angabe(el, 'abfrage');
  let quelle = null;
  if (art === TEXT_ART) {
    if (datei !== null) melde('textMitQuelle', datei);
    quelle = { typ: 'text', text: ohneRandLeerzeilen(String(el.inhalt || '').split('\n')) };
  } else if (art !== null) {
    // Die Prüfung der Quelle setzt eine bekannte Art voraus: Ohne Art steht
    // nicht fest, ob die Kachel überhaupt eine Abfrage braucht.
    const abfrage = ohneRandLeerzeilen(ohneKommentare(el.inhalt));
    if (abfrage !== '' && datei !== null) melde('quelleDoppelt', datei);
    else if (abfrage !== '') quelle = { typ: 'abfrage', text: abfrage };
    else if (datei !== null) quelle = { typ: 'datei', ziel: datei };
    else melde('quelleFehlt', art);
  }

  return {
    art,
    titel: angabe(el, 'titel') !== null ? el.attrs.titel : '',
    angabeBreite: breite.zwoelftel,
    breite: null,
    quelle,
    zeile: el.zeile,
    index,
    fehler,
  };
}

/**
 * Die eine Auswertung des Modells: Befunde in Zeilen-Reihenfolge der Elemente
 * und die Sicht. Rechnet allein aus dem Modell und ändert es nicht.
 */
function werteAus(model) {
  const errors = [];
  const sicht = { filter: [], zeilen: [], unbekannt: [], leer: true, errors };
  const praeambel = Array.isArray(model && model.praeambel) ? model.praeambel : [];
  const elemente = Array.isArray(model && model.elemente) ? model.elemente : [];

  // Die Präambel steht vor dem ersten Marker; ihre Zeilen-Nummer ist daher
  // ihre Stelle in der Liste. Leerzeilen und Kommentar-Zeilen sind kein Befund.
  praeambel.forEach((roh, i) => {
    const zeile = ohneCr(roh);
    if (zeile.trim() === '' || istKommentarZeile(zeile)) return;
    befund(errors, 'inhaltVorMarker', i + 1, zeile);
  });

  const namen = new Set();
  let reihe = null;
  elemente.forEach((el, index) => {
    if (el.art === 'filter') {
      const filter = filterSicht(el, index, namen, errors);
      if (filter) sicht.filter.push(filter);
    } else if (el.art === 'zeile') {
      reihe = { zeile: el.zeile, kacheln: [] };
      sicht.zeilen.push(reihe);
      const bedeutungslos = ohneKommentare(el.inhalt).find((z) => z.trim() !== '');
      if (bedeutungslos !== undefined) {
        befund(errors, 'inhaltOhneBedeutung', el.zeile, bedeutungslos);
      }
    } else if (el.art === 'kachel') {
      sicht.leer = false;
      // Kacheln vor dem ersten `!zeile` bilden eine stillschweigende erste
      // Zeile; sie trägt keine Zeilen-Nummer, weil kein Marker sie setzt.
      if (!reihe) {
        reihe = { zeile: null, kacheln: [] };
        sicht.zeilen.push(reihe);
      }
      reihe.kacheln.push(kachelSicht(el, index, errors));
    } else {
      const marker = el.marker || ohneCr((el.roh && el.roh.marker) || '');
      befund(errors, 'markerUnbekannt', el.zeile, marker);
      sicht.unbekannt.push({ marker, zeile: el.zeile, index });
    }
  });

  for (const r of sicht.zeilen) {
    const verteilt = verteileBreiten(r.kacheln.map((k) => k.angabeBreite));
    r.kacheln.forEach((k, i) => {
      k.breite = verteilt[i];
    });
  }
  // Ein Block ohne Kachel zeigt die Hinweis-Fläche; eine Zeile gibt es für eine
  // Abwesenheit nicht, daher `null`.
  if (sicht.leer) befund(errors, 'leer', null, '');
  return { sicht, errors };
}

/**
 * Die Sicht eines Modells: Filter in Block-Reihenfolge, Zeilen samt Kacheln mit
 * aufgelöster Breite (`{zwoelftel, fest}`) und Quelle, unbekannte Marker für
 * den Sammel-Hinweis, das Merkmal `leer` und alle Befunde. Wirft nie und
 * ändert das Modell nicht; nach einer Änderung am Modell zeigt sie den neuen
 * Stand.
 *
 * @param {object} model Modell aus `parseDashboardFence`.
 * @returns {{filter: object[], zeilen: object[], unbekannt: object[], leer: boolean, errors: object[]}}
 */
function dashboardSicht(model) {
  return werteAus(model).sicht;
}

// --- Schreiben -----------------------------------------------------------------

function baueMarkerZeile(el) {
  const teile = ['!' + (el.art === 'unbekannt' ? el.marker || 'unbekannt' : el.art)];
  if (el.name) teile.push(el.name);
  for (const op of el.operanden || []) teile.push(op);
  // Angaben in ihrer gelesenen Reihenfolge, danach solche, die eine Bedienung
  // in `attrs` gesetzt hat, ohne `attrFolge` zu führen.
  const folge = [...(el.attrFolge || [])];
  for (const name of Object.keys(el.attrs || {})) {
    if (!folge.includes(name)) folge.push(name);
  }
  for (const name of folge) {
    let wert = el.attrs[name];
    if (wert == null) continue;
    if (name === 'breite' && el.art === 'kachel') wert = kanonischeBreite(wert);
    teile.push(name + '=' + packeWert(wert, { immerQuoten: IMMER_QUOTEN.has(name) }));
  }
  return teile.join(' ');
}

/**
 * Schreibt ein Modell zurück. Unveränderte Elemente wörtlich (G2), geänderte
 * und neue in kanonischer Form. Ein unbekanntes Element mit Rohtext geht immer
 * wörtlich hinaus: Seine Angaben hat der Kern nie gelesen und könnte sie
 * kanonisch nur verlieren (G1).
 *
 * @param {object} model Modell aus `parseDashboardFence`.
 * @returns {string} Rumpf des Blocks.
 */
function serializeDashboardFence(model) {
  const ende = (model && model.zeilenende) || '\n';
  const cr = ende === '\r\n' ? '\r' : '';
  const zeilen = [...((model && model.praeambel) || [])];
  for (const el of (model && model.elemente) || []) {
    const wortlich = !el.geaendert || el.art === 'unbekannt';
    if (wortlich && el.roh && el.roh.marker) {
      zeilen.push(el.roh.marker, ...el.roh.inhalt);
      continue;
    }
    zeilen.push(baueMarkerZeile(el) + cr);
    if (el.inhalt !== '' && el.inhalt != null) {
      for (const z of String(el.inhalt).split('\n')) zeilen.push(schuetze(z) + cr);
    } else if (nurEineLeerzeile(el)) {
      // Leerer Inhalt heißt im Modell sowohl «keine Zeile» als auch «eine
      // Leerzeile»; der Rohtext entscheidet, damit die Gliederung des Blocks
      // byte-gleich bleibt (Review-Runde 1 von 3E-000402, Befund A4).
      zeilen.push(el.roh.inhalt[0]);
    }
  }
  return zeilen.join('\n');
}

// Hatte das Element im Bestand genau eine Inhalts-Zeile, und war sie leer?
function nurEineLeerzeile(el) {
  const roh = el.roh && Array.isArray(el.roh.inhalt) ? el.roh.inhalt : [];
  return roh.length === 1 && ohneCr(roh[0]) === '';
}

// --- Blöcke im Dokument ----------------------------------------------------------

/**
 * Findet die Dashboard-Blöcke eines Dokuments über die Zaun-Regel aus
 * `markdown/fence-level.js`. Ein Block in einem äußeren Code-Zaun ist dessen
 * wörtlicher Inhalt und wird nicht gefunden; ein nicht geschlossener Block
 * reicht bis zum Dokument-Ende. Form des Ergebnisses wie `findCanvasFences`.
 *
 * @param {string} text Dokument-Text.
 * @returns {Array<{startZeile: number, endeZeile: number, rumpf: string}>}
 *   `startZeile` ist die Zeile des öffnenden Zauns, `endeZeile` die des
 *   schließenden (ab 1); der Rumpf steht ohne `\r`.
 */
function findDashboardFences(text) {
  const zeilen = trenneZeilen(text).map(ohneCr);
  const treffer = [];
  let offen = null;
  for (let i = 0; i < zeilen.length; i++) {
    if (offen) {
      if (!schliesstZaun(zeilen[i], offen)) continue;
      if (offen.sprache === DASHBOARD_FENCE) {
        treffer.push({
          startZeile: offen.startZeile,
          endeZeile: i + 1,
          rumpf: zeilen.slice(offen.startZeile, i).join('\n'),
        });
      }
      offen = null;
      continue;
    }
    const oeffnung = zaunOeffnung(zeilen[i]);
    if (oeffnung) offen = { ...oeffnung, startZeile: i + 1 };
  }
  if (offen && offen.sprache === DASHBOARD_FENCE) {
    treffer.push({
      startZeile: offen.startZeile,
      endeZeile: zeilen.length + 1,
      rumpf: zeilen.slice(offen.startZeile).join('\n'),
    });
  }
  return treffer;
}

// Zaun-Länge nach dem Schreibweg der Canvas (`canvasFenceBlock`): Eine
// Text-Kachel darf selbst Code-Blöcke tragen, drei Rückstriche genügen nur,
// solange der Rumpf keine längere Folge enthält.
function dashboardFenceBlock(rumpf) {
  let laengste = 0;
  for (const m of String(rumpf == null ? '' : rumpf).matchAll(/`{3,}/g)) {
    laengste = Math.max(laengste, m[0].length);
  }
  const zaun = '`'.repeat(Math.max(3, laengste + 1));
  return zaun + DASHBOARD_FENCE + '\n' + rumpf + '\n' + zaun;
}

/**
 * Das Gerüst für das Kommando «Dashboard einfügen»: ein vollständiger Block
 * mit einer Zeile und einer Kennzahl-Kachel über alle Treffer, ohne
 * abschließenden Zeilenumbruch (Muster `canvasFenceBlock`). Nach der
 * Kennzahl-Regel zeigt die ungruppierte Abfrage `LIST` die Zahl der Treffer
 * (Abschnitt 1.6 der Konzept-Stufe); festgelegt in 4T-002513. Sprachneutral:
 * Der Titel steht in der Oberflächen-Sprache und kommt deshalb vom Aufrufer;
 * ohne ihn bleibt die Angabe weg.
 *
 * @param {string} [titel] Titel der Kachel, etwa «Anzahl».
 * @returns {string}
 */
function dashboardGeruest(titel) {
  const kachel = ['!kachel', 'kennzahl'];
  if (titel) kachel.push('titel=' + packeWert(titel, { immerQuoten: true }));
  return dashboardFenceBlock(['!zeile', kachel.join(' '), 'LIST'].join('\n'));
}

module.exports = {
  DASHBOARD_EXTENSION_ID,
  DASHBOARD_FENCE,
  MARKER_ARTEN,
  KACHEL_ARTEN,
  FILTER_NAME_RE,
  istKommentarZeile,
  parseDashboardFence,
  serializeDashboardFence,
  dashboardSicht,
  findDashboardFences,
  dashboardFenceBlock,
  dashboardGeruest,
};
