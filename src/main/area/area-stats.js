// 4T-000619 (Epic 3E-000117): Kennzahlen-Erhebung eines Bereichs.
//
// Zwei Anteile: Der Bereichs-Index (backlinks.statsFor) liefert alles, was
// er ohnehin fuehrt — Markdown-Zahlen, Tags, Eigenschaften, Aufgaben,
// Verweise, Aliase und die Top-Listen. Dieses Modul erhebt den Rest, den der
// Index nicht kennt (Ordner, Nicht-Markdown-Dateien, Begleitdateien), und
// fuehrt beide Anteile zu einem Anzeige-freien Daten-Objekt zusammen.
//
// Der Scan laeuft asynchron mit Batch-Yielding wie der Index-Aufbau, damit
// der Main-Prozess auch bei grossen Bereichen ansprechbar bleibt, und nutzt
// mit isIgnoredDirName und MD_EXT_RE dieselben Regeln wie Initial-Scan und
// Watcher. Eine eigene Kopie duerfte auseinanderlaufen und ergaebe
// widerspruechliche Datei- und Ordner-Zahlen.
//
// Byte-Summen sind bewusst zusammengesetzt statt eigenstaendig gemessen:
// Markdown-Bytes kommen aus dem Index, die uebrigen aus dem Scan, und die
// Gesamt-Summe ist die Summe genau der angezeigten Teile. So geht auf der
// Seite keine Differenz auf, die niemand erklaeren kann.
//
// Der Index-Anteil ist injizierbar (deps.statsFor, Muster reminder-check.js
// mit deps.taskLines): Der Unit-Test baut seinen Fixture-Index ueber seine
// eigene Modul-Instanz auf und reicht deren Leser herein. Ohne die Naht
// laese die Erhebung aus einer zweiten Instanz, deren Index leer ist.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const backlinks = require('../backlinks.js');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');

// Datei-Typ-Gruppen der Nicht-Markdown-Zaehlung. Alles, was in keine Gruppe
// faellt, zaehlt als „Sonstige"; die Gruppen sind eine Lese-Hilfe, keine
// vollstaendige Typologie.
const BILD_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);

// Begleitdateien der Anwendung: .mdd gehoert zu genau einem Dokument,
// .mdda ist eine Bereichs-Datei (Einstellungen, Index-Cache). Beide zaehlen
// NICHT als Nicht-Markdown-Dateien, sondern nur im eigenen Abschnitt.
const MDD_EXT = '.mdd';
const MDDA_EXT = '.mdda';

// Verzeichnis-Eintraege zwischen zwei Yields (Muster BUILD_BATCH_SIZE des
// Index-Aufbaus).
const SCAN_BATCH_SIZE = 500;

function leererZaehler() {
  return { anzahl: 0, bytes: 0 };
}

function zaehle(ziel, bytes) {
  ziel.anzahl += 1;
  ziel.bytes += bytes;
}

// Rekursiver Scan der Bereichs-Wurzel. Liefert ausschliesslich die
// Index-fremden Zahlen; Markdown-Dateien werden uebersprungen, weil der
// Index sie vollstaendig kennt.
async function scanArea(root) {
  const ergebnis = {
    ordner: 0,
    bilder: leererZaehler(),
    pdf: leererZaehler(),
    sonstige: leererZaehler(),
    mdd: leererZaehler(),
    mdda: leererZaehler(),
    // Kleingeschriebene absolute Pfade aller .mdd-Dateien, fuer den Abgleich
    // „wie viele Markdown-Dateien haben eine Begleitdatei".
    mddPfade: new Set(),
    uebersprungeneOrdner: 0,
  };
  let seitYield = 0;
  const dirs = [root];
  while (dirs.length > 0) {
    const dir = dirs.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      ergebnis.uebersprungeneOrdner += 1;
      console.warn('Bereichs-Statistik: Ordner nicht lesbar:', dir, err && err.code);
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (backlinks.isIgnoredDirName(entry.name)) continue;
        ergebnis.ordner += 1;
        dirs.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (MD_EXT_RE.test(entry.name)) continue;
      let bytes = 0;
      try {
        bytes = (await fs.promises.stat(full)).size;
      } catch {
        /* nicht lesbare Datei zaehlt mit Groesse 0 statt den Scan abzubrechen */
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === MDD_EXT) {
        zaehle(ergebnis.mdd, bytes);
        ergebnis.mddPfade.add(full.toLowerCase());
      } else if (ext === MDDA_EXT) {
        zaehle(ergebnis.mdda, bytes);
      } else if (BILD_EXTS.has(ext)) {
        zaehle(ergebnis.bilder, bytes);
      } else if (ext === '.pdf') {
        zaehle(ergebnis.pdf, bytes);
      } else {
        zaehle(ergebnis.sonstige, bytes);
      }
      if (++seitYield >= SCAN_BATCH_SIZE) {
        seitYield = 0;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }
  return ergebnis;
}

// Begleitdatei zu einem Dokument: gleicher Basisname, Endung .mdd (dieselbe
// Konvention wie mddPathFor in main.js und mddCompanionPath in backlinks.js).
function mddPfadZu(mdPfad) {
  const parsed = path.parse(mdPfad);
  return path.join(parsed.dir, `${parsed.name}${MDD_EXT}`);
}

// Zeitstempel des Standes: UTC nach ISO 8601, sekundengenau (Konvention des
// Projekts fuer persistierte und ausgelieferte Zeitangaben). Die lokale
// Darstellung macht die Seite.
function standJetzt() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Sammelt die Kennzahlen des Bereichs. env reicht den Status-Typ-Aufloeser
// der Aufgaben-Zustaende an den Index-Anteil durch, deps.statsFor ersetzt
// bei Bedarf den Index-Leser (siehe Kopf-Kommentar). Ist der Index nicht
// bereit, kommt allein der Status zurueck — kein Teilstand, weil halb
// gefuellte Zahlen als vollstaendig gelesen wuerden.
async function collectAreaStats(areaRoot, env, deps = {}) {
  const leseIndex = typeof deps.statsFor === 'function' ? deps.statsFor : backlinks.statsFor;
  const index = leseIndex(areaRoot, env);
  if (!index || index.status !== 'ready') {
    return { status: (index && index.status) || 'unavailable', stand: standJetzt() };
  }
  const scan = await scanArea(index.wurzel);

  const nichtMarkdownAnzahl = scan.bilder.anzahl + scan.pdf.anzahl + scan.sonstige.anzahl;
  const nichtMarkdownBytes = scan.bilder.bytes + scan.pdf.bytes + scan.sonstige.bytes;
  const begleitBytes = scan.mdd.bytes + scan.mdda.bytes;
  const mitMdd = index.dateiPfade.filter((p) =>
    scan.mddPfade.has(mddPfadZu(p).toLowerCase()),
  ).length;

  return {
    status: 'ready',
    stand: standJetzt(),
    wurzel: index.wurzel,
    dateien: {
      markdown: index.markdown.anzahl,
      nichtMarkdown: {
        bilder: scan.bilder.anzahl,
        pdf: scan.pdf.anzahl,
        sonstige: scan.sonstige.anzahl,
        gesamt: nichtMarkdownAnzahl,
      },
      ordner: scan.ordner,
    },
    speicher: {
      gesamt: index.markdown.bytes + nichtMarkdownBytes + begleitBytes,
      markdown: index.markdown.bytes,
      nichtMarkdown: nichtMarkdownBytes,
      begleit: begleitBytes,
    },
    eigenschaften: { verschieden: index.eigenschaften.length, liste: index.eigenschaften },
    tags: { verschieden: index.tags.length, liste: index.tags },
    begleit: {
      mdd: scan.mdd,
      mdda: scan.mdda,
      mitMdd,
      vonMarkdown: index.markdown.anzahl,
    },
    inhalte: {
      aufgaben: index.aufgaben,
      verweise: index.verweise,
      aliase: index.aliase,
    },
    auffaelligkeiten: index.auffaelligkeiten,
    hinweise: {
      uebersprungeneOrdner: index.uebersprungeneOrdner + scan.uebersprungeneOrdner,
    },
  };
}

module.exports = { collectAreaStats };
