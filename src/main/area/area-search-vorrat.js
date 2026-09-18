// 4T-001609 (Epic 3E-000252): Wie der Vorrat der Bereichs-Suche entsteht.
//
// Herausgeschnitten aus area-search.js, weil deren Datei-Budget erreicht war und
// der Deckel um eine Messung wachsen musste. Der Schnitt folgt der Fachlichkeit
// statt der Zeilenzahl und dem Muster der drei Nachbarn (area-search-cache.js,
// area-search-teile.js, area-search-gross.js): WELCHE Dateien der Bereich hat
// und WAS davon im Speicher gehalten wird, gehoert zusammen und ist von der
// Suche selbst unabhaengig — jene fragt den Vorrat nur nach seinen Texten.
//
// Der Abbruch bei einer juengeren Anfrage kommt als Rueckfrage herein
// (`istUeberholt`) statt ueber eine geteilte Generationen-Tabelle: Die Suche
// fuehrt diesen Zustand, und zwei Heimaten fuer dieselbe Aussage waeren eine zu
// viel.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const backlinks = require('../backlinks.js');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');
const { ladeCache, schreibeCache } = require('./area-search-cache.js');
const { fasseTeileZusammen } = require('./area-search-teile.js');
const { MAX_DATEI_BYTES } = require('./area-search-gross.js');
const { bereinigeSuchtext } = require('./area-search-datensaetze.js');

// Verzeichnis-Eintraege zwischen zwei Yields (Muster BUILD_BATCH_SIZE des
// Index-Aufbaus und SCAN_BATCH_SIZE der Statistik-Erhebung).
const SCAN_BATCH_SIZE = 500;

// Dateien je Lese-Welle. Genug Parallelitaet, um die Latenz zu verstecken,
// ohne den Datei-Deskriptor-Vorrat auszureizen.
const LESE_BREITE = 16;

// Obergrenze des Speicher-Vorrats, in der Groessenordnung der MAX_BYTES des
// Bereichs-Index. Darueber wird nicht vorgehalten, sondern je Lauf gelesen:
// Die Suche bleibt benutzbar, nur nicht mehr augenblicklich.
const MAX_VORRAT_BYTES = 50 * 1024 * 1024;

// Wurzel-relativer, portabler ('/') und NFC-normalisierter Schluessel —
// dieselbe Form wie im Bereichs-Index, damit beide dieselbe Datei gleich
// benennen.
function relPfad(absPfad, wurzel) {
  return path.relative(wurzel, absPfad).split(path.sep).join('/').normalize('NFC');
}

// --- Scan -------------------------------------------------------------------

// Markdown-Dateien der Bereichs-Wurzel samt Groesse und Aenderungszeit.
// Bewusst ein eigener Scan statt eines Zugriffs auf den Bereichs-Index: Der
// Index kann beim ersten Suchlauf noch im Aufbau sein ('indexing'), und eine
// halbe Datei-Liste ergaebe stillschweigend halbe Suchergebnisse. Der Scan
// kostet gemessen 27 ms je 1000 Dateien und ist damit billiger als jede
// Sonderbehandlung des Index-Zustands.
async function scanneBereich(wurzel) {
  const dateien = [];
  let uebersprungeneOrdner = 0;
  let seitYield = 0;
  const dirs = [wurzel];

  while (dirs.length > 0) {
    const dir = dirs.shift();
    let eintraege;
    try {
      eintraege = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      uebersprungeneOrdner += 1;
      console.warn('Bereichs-Suche: Ordner nicht lesbar:', dir, err && err.code);
      continue;
    }
    for (const eintrag of eintraege) {
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) {
        if (backlinks.isIgnoredDirName(eintrag.name)) continue;
        dirs.push(voll);
        continue;
      }
      if (!eintrag.isFile() || !MD_EXT_RE.test(eintrag.name)) continue;
      let st;
      try {
        st = await fs.promises.stat(voll);
      } catch {
        /* nicht lesbare Datei ueberspringen statt den Scan abzubrechen */
        continue;
      }
      dateien.push({
        abs: voll,
        rel: relPfad(voll, wurzel),
        size: st.size,
        mtimeMs: st.mtimeMs,
      });
      if (++seitYield >= SCAN_BATCH_SIZE) {
        seitYield = 0;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  // Stabile, nachvollziehbare Reihenfolge der Trefferliste. Der Scan selbst
  // liefert Verzeichnis-Reihenfolge, die sich zwischen Laeufen aendern kann.
  dateien.sort((a, b) => a.rel.localeCompare(b.rel, 'de'));
  return { dateien, uebersprungeneOrdner };
}

// --- Cache ------------------------------------------------------------------

// Liefert Map<rel, { text, mtimeMs, size }>. Fehlend, defekt oder
// versionsfremd ergibt eine leere Map: Der Cache ist ein regenerierbares
// Maschinen-Artefakt, sein Verlust kostet einen Lesevorgang und nie Daten.
// --- Vorrat -----------------------------------------------------------------

// Baut den Vorrat auf: unveraenderte Dateien kommen aus dem Cache, geaenderte
// und neue werden gelesen, entfallene fallen weg. Abgeglichen wird ueber
// Aenderungszeit und Groesse — dieselben zwei Merkmale, die auch der
// Bereichs-Index vergleicht. Ein Inhalts-Hash waere strenger, verlangte aber
// genau den Lesevorgang, den der Cache einspart.
async function baueVorrat(wurzel, istUeberholt, optionen) {
  // Der Deckel ist eine Zahl und keine Umgebung: Der Pruefstand reicht seine
  // eigene herein, statt hundert Megabyte zu schreiben, um eine
  // Fallunterscheidung zu belegen. Voreinstellung ist der Betriebswert.
  const deckel = (optionen && optionen.deckel) || MAX_VORRAT_BYTES;
  const { dateien: alle, uebersprungeneOrdner } = await scanneBereich(wurzel);
  if (istUeberholt()) return null;

  // 4T-001260: Erst die einzelnen Riesen aussortieren, dann den Deckel pruefen.
  // Die Reihenfolge ist der Kern der Behebung: Gemessen wird der Deckel an dem,
  // was tatsaechlich in den Vorrat soll, statt am ganzen Bestand.
  const dateien = alle.filter((d) => d.size <= MAX_DATEI_BYTES);
  const grosse = alle.filter((d) => d.size > MAX_DATEI_BYTES);

  const gesamtBytes = dateien.reduce((s, d) => s + d.size, 0);

  // 4T-001609 (Epic 3E-000252): Der Deckel misst, was GEHALTEN wird, und das
  // steht erst nach dem Lesen fest. Bis hierher entschied die Summe der
  // Datei-Groessen VOR dem Lesen; das war richtig, solange der Vorrat die
  // Dateien unveraendert uebernahm. Seit der Datensatz-Block draussen bleibt,
  // riessen zwanzig Tabellen den Deckel weiterhin, obwohl von ihnen nur die
  // Beschreibung im Speicher landet — und die Verschlechterung traefe dann jedes
  // Prosa-Dokument des Bereichs. Gemessen wird deshalb der bereinigte Umfang,
  // abgebrochen, sobald er den Deckel seinerseits reisst. Der Preis ist benannt
  // und angenommen: oberhalb des Deckels ein Lesevorgang bis zur Grenze, einmal
  // je Vorrats-Aufbau und nicht je Suchlauf.
  const cache = await ladeCache(wurzel);
  const texte = new Map();
  let ausCache = 0;
  let gelesen = 0;
  let gehaltenBytes = 0;
  let gesprengt = false;

  for (let i = 0; i < dateien.length && !gesprengt; i += LESE_BREITE) {
    const welle = dateien.slice(i, i + LESE_BREITE);
    const zuLesen = [];
    for (const d of welle) {
      const c = cache.get(d.rel);
      if (c && c.mtimeMs === d.mtimeMs && c.size === d.size) {
        // Der Cache haelt seit Schema-Version 2 bereits bereinigte Texte; ein
        // zweiter Durchgang waere Arbeit ohne Wirkung.
        texte.set(d.rel, {
          text: c.text,
          mtimeMs: d.mtimeMs,
          size: d.size,
          bereinigt: c.bereinigt === true,
          karte: Array.isArray(c.karte) ? c.karte : null,
        });
        gehaltenBytes += Buffer.byteLength(c.text, 'utf8');
        ausCache += 1;
      } else {
        zuLesen.push(d);
      }
    }
    if (zuLesen.length > 0) {
      const inhalte = await Promise.all(
        zuLesen.map((d) => fs.promises.readFile(d.abs, 'utf8').catch(() => null)),
      );
      for (let k = 0; k < zuLesen.length; k++) {
        if (inhalte[k] === null) continue;
        // Bereinigt wird VOR dem Cache-Schreiben, sonst lagerte der volle
        // Datensatz-Text weiterhin auf der Platte und der eingesparte Speicher
        // waere nur die halbe Wirkung.
        const b = bereinigeSuchtext(inhalte[k]);
        const text = b ? b.text : inhalte[k];
        texte.set(zuLesen[k].rel, {
          text,
          mtimeMs: zuLesen[k].mtimeMs,
          size: zuLesen[k].size,
          bereinigt: !!b,
          // 4T-001671: Die Ruecknahme-Karte reist mit dem Text, damit jeder
          // Verbraucher seinen Offset in die Datei zurueckrechnen kann.
          karte: b ? b.karte : null,
        });
        gehaltenBytes += Buffer.byteLength(text, 'utf8');
        gelesen += 1;
      }
    }
    if (istUeberholt()) return null;
    if (gehaltenBytes > deckel) gesprengt = true;
  }

  if (gesprengt) {
    // Kein Vorrat und kein Cache oberhalb des Deckels: Beides waere Speicher
    // bzw. Platte in einer Groessenordnung, die der Anwender nicht bestellt
    // hat. Die Suche laeuft dann je Lauf ueber die Platte.
    // Oberhalb des Deckels laeuft ohnehin alles direkt; die Trennung zwischen
    // kleinen und grossen Dateien spielt dort keine Rolle mehr.
    return { modus: 'direkt', dateien: alle, bytes: gesamtBytes, uebersprungeneOrdner };
  }

  // Nur schreiben, wenn sich etwas geaendert hat. Ein Suchlauf ohne
  // Datei-Aenderung soll keine Platten-Schreibvorgaenge ausloesen.
  if (gelesen > 0 || ausCache !== cache.size) {
    await schreibeCache(wurzel, texte);
  }

  // 4T-001293: Der Cache haelt die Teil-Dateien einzeln, wie sie auf der Platte
  // liegen; zusammengefuehrt wird erst danach. So bleibt der Cache-Abgleich
  // ueber Aenderungszeit und Groesse Datei fuer Datei gueltig.
  const vorrat = fasseTeileZusammen({
    modus: 'vorrat',
    texte,
    reihenfolge: dateien.map((d) => d.rel),
    // 4T-001609: die tatsaechlich gehaltene Menge, nicht die Summe der
    // Datei-Groessen — dieselbe Zahl, an der der Deckel oben gemessen hat.
    bytes: gehaltenBytes,
    uebersprungeneOrdner,
  });
  // 4T-001260: Die Riesen reisen neben dem Vorrat mit, ohne Text und ohne
  // Cache-Eintrag. Sie stehen bewusst NICHT in der Reihenfolge des Vorrats: Die
  // Teil-Datei-Zusammenfuehrung arbeitet ueber die Text-Map, und ein Kopf-Pfad
  // ohne Text gaelte ihr als «nicht im Bereich».
  return { ...vorrat, grosse };
}

module.exports = {
  SCAN_BATCH_SIZE,
  LESE_BREITE,
  MAX_VORRAT_BYTES,
  relPfad,
  scanneBereich,
  baueVorrat,
};
