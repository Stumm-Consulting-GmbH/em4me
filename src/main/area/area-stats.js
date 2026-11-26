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
//
// --- Der Stand der Zahlen (4T-000953, Epic 3E-000198, Befund E-07) -----------
// Diese Seite zeigt den GESPEICHERTEN Stand und sagt es. Das ist eine
// Entscheidung des Product Owners vom 2026-09-06 gegen die Alternative, den
// Editor-Puffer einzurechnen, wie es die sechs uebrigen Index-Sichten seit
// 4T-000935 bis 4T-000952 tun.
//
// Der Grund liegt in der Sache: Ein Teil der Kennzahlen ist gar nicht
// ueberlagerbar. Ein ungespeicherter Puffer hat keine Datei-Groesse und keine
// Aenderungszeit — Speicher-Summen, «groesste Dateien» und «zuletzt geaendert»
// koennten ihn nicht einrechnen, ohne Werte zu erfinden. Eine Seite, auf der
// die Tag-Zahl den Puffer kennt und die Speicher-Zahl nicht, waere in sich
// uneinheitlich und schwerer zu erklaeren als ein durchgehend gespeicherter
// Stand mit Hinweis.
//
// Ausgewiesen wird beides: dass die Zahlen den gespeicherten Stand zeigen, und
// wie viele offene Dokumente gerade ungespeicherte Aenderungen tragen. Die
// zweite Zahl kommt aus der Puffer-Overlay-Schicht, die fuer genau diese
// Dokumente einen Eintrag fuehrt und ihn beim Speichern, Verwerfen und
// Schliessen zuruecknimmt; sie gilt fensteruebergreifend, wie die Schicht.
//
// Ihre eine Ungenauigkeit, benannt statt versteckt: Wer tippt und die Aenderung
// von Hand wieder rueckgaengig macht, zaehlt weiter mit — der Reiter ist dann
// nicht mehr geaendert, die Schicht traegt seinen Text aber noch. Der Main-
// Prozess kennt den Aenderungs-Zustand der Reiter nicht; ihn dafuer einzuholen
// waere ein eigener Kanal fuer eine Randlage, die den Hinweis nicht falsch
// macht, sondern nur eine Anzeige zu viel liefert.
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
// .mdda ist eine Bereichs-Datei (Einstellungen, Index-Cache), .mddl traegt die
// Aenderungsbelege einer Tabellen-Datei. Alle drei zaehlen NICHT als
// Nicht-Markdown-Dateien, sondern nur im eigenen Abschnitt.
//
// 4T-001789 (Epic 3E-000255): Die Endungen kommen aus dem gemeinsamen Modul
// der Markdown-Data-Familie statt aus eigenen Konstanten dieser Datei. Ohne
// den Bezug zaehlte eine Beleg-Datei hier unter «Sonstige» der
// Nicht-Markdown-Dateien, obwohl sie eine Begleit-Datei der Anwendung ist.
const { MDD_EXT, MDDA_EXT, MDDL_EXT } = require('../../shared/markdown-data-family.js');
// 4T-002782 (Epic 3E-000392): Verweise ohne Ziel. Die Beurteilung der
// Verweise in verknüpfte Bereiche wird nur aufgerufen, nicht geändert (V8).
const { GRUND, sortiereVerweiseOhneZiel } = require('../index/verweise-ohne-ziel.js');
const {
  beurteileVerknuepfungsLinks,
  loeseVerknuepfungsLink,
  sucheNachName,
} = require('./area-link-resolve.js');
const { normalizeAreaPrefix } = require('../../shared/area-link-syntax.js');
// 4T-002783 (Epic 3E-000392): Einträge aus Folgeteilen geteilter Dokumente
// werden auf das Dokument abgebildet, wie der Editor es öffnet.
const { kopfDateiFuer, pfadSchluessel } = require('../index/part-files.js');
const { logicalNameFor } = require('../index/link-graph.js');
const { readAssembledDocument } = require('../documents/document-parts-io.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { isInsideArea } = require('./area-path.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');

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

// Rekursiver Scan der Bereichs-Wurzel. Liefert in der Vorgabe ausschliesslich
// die Index-fremden Zahlen; Markdown-Dateien werden uebersprungen, weil der
// Index sie vollstaendig kennt.
//
// 4T-001600 (Epic 3E-000191): Mit `mitMarkdown: true` zaehlt derselbe Scan die
// Markdown-Dateien und ihre Bytes mit. Die Option existiert fuer den
// Kennzahlen-Beschleuniger der Gefaess-Liste, der die Zahlen auch fuer ein
// Gefaess ohne Index braucht — und fuer Buecher und Regale, die gar keinen
// haben. Ein zweiter Scan-Code waere eine zweite Zaehl-Grundlage; die Vorgabe
// ist deshalb genau das heutige Verhalten, und collectAreaStats ruft
// unveraendert.
async function scanArea(root, { mitMarkdown = false } = {}) {
  const ergebnis = {
    ordner: 0,
    // Nur bei mitMarkdown gefuellt; in der Vorgabe bleibt der Zaehler auf
    // null stehen, weil der Index-Anteil die Markdown-Zahlen traegt.
    markdown: leererZaehler(),
    bilder: leererZaehler(),
    pdf: leererZaehler(),
    sonstige: leererZaehler(),
    mdd: leererZaehler(),
    mdda: leererZaehler(),
    // 4T-001789: Aenderungsbelege der Datenbank-Anwendungen.
    mddl: leererZaehler(),
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
      const istMarkdown = MD_EXT_RE.test(entry.name);
      if (istMarkdown && !mitMarkdown) continue;
      let bytes = 0;
      try {
        bytes = (await fs.promises.stat(full)).size;
      } catch {
        /* nicht lesbare Datei zaehlt mit Groesse 0 statt den Scan abzubrechen */
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (istMarkdown) {
        zaehle(ergebnis.markdown, bytes);
      } else if (ext === MDD_EXT) {
        zaehle(ergebnis.mdd, bytes);
        ergebnis.mddPfade.add(full.toLowerCase());
      } else if (ext === MDDA_EXT) {
        zaehle(ergebnis.mdda, bytes);
      } else if (ext === MDDL_EXT) {
        zaehle(ergebnis.mddl, bytes);
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

// 4T-000953: Zahl der offenen Dokumente mit ungespeicherten Aenderungen unter
// einer Wurzel. Injizierbar aus demselben Grund wie der Index-Leser: Der
// Unit-Test setzt seine Overlays ueber seine eigene Modul-Instanz.
function leseUngespeicherte(wurzel, deps = {}) {
  const lesen =
    typeof deps.overlaysUnder === 'function' ? deps.overlaysUnder : backlinks.overlaysUnder;
  const treffer = lesen(wurzel);
  return treffer ? treffer.size : 0;
}

// 4T-002782 (Epic 3E-000392, V8): Urteil über die Verweise in verknüpfte
// Bereiche, die der Index-Anteil gesammelt hat. Die bestehende Beurteilung
// läuft EINMAL je Erhebung mit allen Verweisen. Ihr Ordner-Scan des anderen
// Bereichs liefe aber je Verweis (Nachweis 1d); eingespeist wird deshalb eine
// Namens-Suche, die jeden Ziel-Namen je Bereich nur einmal sucht und dafür die
// unveränderte sucheNachName aufruft. «Bereich nicht erreichbar» wird nicht
// gelistet, sondern je Kürzel gezählt; der Anker im anderen Bereich bleibt
// ungeprüft. Ohne eingeschaltete Erweiterung «Bereichs-Verknüpfungen» oder
// ohne Leser der Verknüpfungen entfällt das Urteil ganz.
const VERKNUEPFT_GRUND = {
  'nicht-gefunden': GRUND.VERKNUEPFT_NICHT_GEFUNDEN,
  unbekannt: GRUND.VERKNUEPFUNG_NICHT_NUTZBAR,
  verschoben: GRUND.VERKNUEPFUNG_NICHT_NUTZBAR,
};

async function beurteileVerknuepfte(verknuepfungen, wurzel, env, deps) {
  const ergebnis = { eintraege: [], nichtErreichbar: [] };
  if (!env.verknuepfungenAktiv || typeof deps.readAreaLinks !== 'function') return ergebnis;
  if (verknuepfungen.length === 0) return ergebnis;
  const beurteile =
    typeof deps.beurteileVerknuepfungsLinks === 'function'
      ? deps.beurteileVerknuepfungsLinks
      : beurteileVerknuepfungsLinks;
  const suchen = new Map();
  const suche = (ziel, name) => {
    const schluessel = `${ziel}\u0000${name}`;
    if (!suchen.has(schluessel)) suchen.set(schluessel, sucheNachName(ziel, name));
    return suchen.get(schluessel);
  };
  // Ein Fehler beim Lesen der Verknüpfungen oder bei der Beurteilung (etwa beim
  // Lesen des anderen Bereichs) kostet nicht die ganze Statistik: Die
  // betroffenen Verweise zählen wie «nicht erreichbar» je Kürzel, die übrigen
  // Kennzahlen kommen unverändert. Zweitblick zu 3E-000392, Hinweis B6: Ein
  // Lesefehler der Verknüpfungen ließ die Verweise zuvor ohne jede Zählung
  // verschwinden.
  let urteile;
  try {
    const links = await deps.readAreaLinks(wurzel);
    urteile = await beurteile(
      links,
      verknuepfungen.map((v) => ({ prefix: v.prefix, target: v.ziel })),
      { loese: (p) => loeseVerknuepfungsLink({ ...p, suche }) },
    );
  } catch (err) {
    console.warn(
      'Bereichs-Statistik: Beurteilung der Verweise in verknüpfte Bereiche fehlgeschlagen:',
      wurzel,
      err && err.message,
    );
    urteile = verknuepfungen.map(() => ({ urteil: 'offline' }));
  }
  const offline = new Map();
  verknuepfungen.forEach((v, i) => {
    const urteil = urteile && urteile[i] && urteile[i].urteil;
    if (urteil === 'offline') {
      const kuerzel = normalizeAreaPrefix(v.prefix);
      offline.set(kuerzel, (offline.get(kuerzel) || 0) + 1);
      return;
    }
    const grund = VERKNUEPFT_GRUND[urteil];
    if (!grund) return; // 'ok' hat ein Ziel
    ergebnis.eintraege.push({
      pfad: v.pfad,
      name: v.name,
      zeile: v.zeile,
      verweis: v.verweis,
      grund,
    });
  });
  for (const [prefix, anzahl] of offline) ergebnis.nichtErreichbar.push({ prefix, anzahl });
  ergebnis.nichtErreichbar.sort((a, b) => a.prefix.localeCompare(b.prefix));
  return ergebnis;
}

// 4T-002783 (Epic 3E-000392): Ein Eintrag aus einem Folgeteil eines geteilten
// Dokuments trägt Pfad und Zeile der Teil-Datei, weil der Index jede Teil-Datei
// für sich erfasst. Der Editor öffnet das Dokument dagegen zusammengesetzt unter
// dem Pfad der Kopf-Datei: Mit dem Pfad der Teil-Datei entstünde beim Klick ein
// zweiter Reiter desselben Dokuments, und die Zeile träfe im zusammengesetzten
// Text den Teil der Kopf-Datei. Abgebildet wird deshalb auf das Dokument, wie
// der Editor es zeigt, gelesen über denselben Lese-Weg wie beim Öffnen
// (readAssembledDocument, ohne den Katalog nachzuziehen, damit die Erhebung
// nichts schreibt). assembleParts hängt von jedem Folgeteil den Rumpf ohne
// Kopf-Block und ohne Trennzeichen an; die Zeile im Dokument ist damit die Zahl
// der Zeilenumbrüche vor der Grenze des Teils plus die Zeile im Teil abzüglich
// der Zeilen seines Kopf-Blocks. Gelesen wird nur für Dokumente mit einem
// Eintrag in einem Folgeteil. Ist das Lesen nicht möglich, steht der Eintrag
// ohne Zeile unter der Kopf-Datei, wenn es sie gibt, sonst unter der Teil-Datei;
// der Klick öffnet dann das Dokument, statt an eine falsche Stelle zu springen.
//
// Zweite Linie zur Grundnamen-Prüfung in readAssembledDocument
// (Sicherheits-Review zu 4T-002783, Befund 1): Liegt der Pfad des Dokuments oder
// eines seiner Teile außerhalb des Bereichs, geht keiner dieser Pfade in die
// Antwort; der Eintrag bleibt unter der Teil-Datei ohne Zeile.
function zeilenumbrueche(text, bis) {
  let n = 0;
  for (let i = text.indexOf('\n'); i >= 0 && i < bis; i = text.indexOf('\n', i + 1)) n += 1;
  return n;
}

async function istDatei(p) {
  try {
    return (await fs.promises.stat(p)).isFile();
  } catch {
    return false;
  }
}

async function leseGeteiltesDokument(teilPfad) {
  const roh = await fs.promises.readFile(teilPfad, 'utf8');
  // BOM und Zeilenenden wie der Lese-Weg beim Öffnen (src/main/ipc/files.js).
  const ohneBom = roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh;
  const inhalt = ohneBom.replace(/\r\n/g, '\n');
  return readAssembledDocument(teilPfad, inhalt, { ohneKatalog: true });
}

// Je Folgeteil des Dokuments: Zeilen vor seinem Rumpf und Zeilen seines Kopf-Blocks.
function teilVersaetze(doc) {
  const versaetze = new Map();
  const teile = Array.isArray(doc.teile) ? doc.teile : [];
  for (let i = 1; i < teile.length; i++) {
    const grenze = Array.isArray(doc.grenzen) ? doc.grenzen[i - 1] : undefined;
    if (!Number.isInteger(grenze)) continue;
    const inhalt = String(teile[i].content || '');
    const kopfBlock = inhalt.length - extractFrontmatter(inhalt).body.length;
    versaetze.set(pfadSchluessel(teile[i].pfad), {
      pfad: doc.path,
      vor: zeilenumbrueche(String(doc.text || ''), grenze),
      kopfBlock: zeilenumbrueche(inhalt, kopfBlock),
    });
  }
  return versaetze;
}

const EIGENES_DOKUMENT = 'eigen'; // Name eines Folgeteils, die Datei ist aber ungeteilt

// Liegen der Pfad des Dokuments und alle Pfade seiner Teile im Bereich?
function imBereich(doc, wurzel) {
  const teile = Array.isArray(doc.teile) ? doc.teile : [];
  return [doc.path, ...teile.map((t) => t && t.pfad)].every((p) => isInsideArea(wurzel, p));
}

async function aufDokumenteAbbilden(eintraege, wurzel, deps) {
  if (!eintraege.some((e) => kopfDateiFuer(e.pfad))) return eintraege;
  const lesen =
    typeof deps.leseGeteiltesDokument === 'function'
      ? deps.leseGeteiltesDokument
      : leseGeteiltesDokument;
  const abbildung = new Map();
  const nimmAuf = async (teilPfad, schluessel) => {
    try {
      const doc = await lesen(teilPfad);
      if (!doc || !doc.ok) throw new Error((doc && doc.error) || 'nicht lesbar');
      if (!doc.geteilt) return abbildung.set(schluessel, EIGENES_DOKUMENT);
      if (!imBereich(doc, wurzel)) {
        console.warn('Bereichs-Statistik: geteiltes Dokument reicht über den Bereich:', teilPfad);
        return abbildung.set(schluessel, { pfad: teilPfad, ohneZeile: true });
      }
      for (const [k, v] of teilVersaetze(doc)) abbildung.set(k, v);
    } catch (err) {
      console.warn(
        'Bereichs-Statistik: geteiltes Dokument nicht lesbar:',
        teilPfad,
        err && err.message,
      );
    }
    // Ein Teil, der im Dokument nicht vorkommt (doppelte Position), oder ein
    // Lesefehler: ohne Zeile unter der Kopf-Datei, wenn es sie gibt. Der aus dem
    // Namen abgeleitete Kopf-Pfad muss nicht bestehen, etwa nach einem
    // Umbenennen außerhalb der Anwendung; dann bleibt die Teil-Datei.
    if (!abbildung.has(schluessel)) {
      const kopf = kopfDateiFuer(teilPfad);
      const pfad = (await istDatei(kopf)) ? kopf : teilPfad;
      abbildung.set(schluessel, { pfad, ohneZeile: true });
    }
  };
  const ergebnis = [];
  for (const e of eintraege) {
    if (!kopfDateiFuer(e.pfad)) {
      ergebnis.push(e);
      continue;
    }
    const schluessel = pfadSchluessel(e.pfad);
    if (!abbildung.has(schluessel)) await nimmAuf(e.pfad, schluessel);
    const a = abbildung.get(schluessel);
    if (a === EIGENES_DOKUMENT) ergebnis.push(e);
    else if (a.ohneZeile) {
      const name = a.pfad === e.pfad ? e.name : logicalNameFor(a.pfad);
      ergebnis.push({ ...e, pfad: a.pfad, name, zeile: null });
    } else {
      // Zweitblick zu 3E-000392, Hinweis A2: Ein Verweis im Kopf-Block des
      // Folgeteils steht im zusammengesetzten Text nicht; er bleibt beim
      // Dokument, aber ohne Zeile, statt auf die erste Zeile des Teils zu zeigen.
      const imTeil = Number.isInteger(e.zeile) ? e.zeile - a.kopfBlock : null;
      const zeile = imTeil !== null && imTeil >= 1 ? a.vor + imTeil : null;
      ergebnis.push({ ...e, pfad: a.pfad, name: logicalNameFor(a.pfad), zeile });
    }
  }
  return ergebnis;
}

// Zweitblick zu 3E-000392, Hinweis A1: Abbildung der abgeschalteten
// Erweiterungen auf die Schalter der Erhebung, an einer Stelle und prüfbar;
// der Kanal der Bereichs-Statistik reicht das Ergebnis unverändert weiter.
function verweisSchalter(disabled) {
  return {
    wikiVerweiseAktiv: isExtensionEnabled('wiki-links', disabled),
    verknuepfungenAktiv: isExtensionEnabled('area-links', disabled),
    canvasAktiv: isExtensionEnabled('canvas', disabled),
    dashboardAktiv: isExtensionEnabled('dashboard', disabled),
    diagrammeAktiv: isExtensionEnabled('perspective-chart', disabled),
    datentabelleAktiv: isExtensionEnabled('perspective-datatable', disabled),
  };
}

// Sammelt die Kennzahlen des Bereichs. env reicht den Status-Typ-Aufloeser
// der Aufgaben-Zustaende an den Index-Anteil durch, deps.statsFor ersetzt
// bei Bedarf den Index-Leser (siehe Kopf-Kommentar). Ist der Index nicht
// bereit, kommt allein der Status zurueck — kein Teilstand, weil halb
// gefuellte Zahlen als vollstaendig gelesen wuerden.
//
// 4T-002782 (Epic 3E-000392): env.wikiVerweiseAktiv und env.verknuepfungenAktiv
// tragen die Schalter der Erweiterungen der Wiki-Verweise und der
// Bereichs-Verknüpfungen (fehlt der erste, gilt er als an, fehlt der zweite,
// als aus), env.canvasAktiv, env.dashboardAktiv, env.diagrammeAktiv und
// env.datentabelleAktiv die Schalter der vier Block-Erweiterungen (fehlt einer,
// gilt er als an);
// deps.readAreaLinks liest die Verknüpfungen des Bereichs, und
// deps.beurteileVerknuepfungsLinks ersetzt bei Bedarf deren Beurteilung.
// 4T-002783: deps.leseGeteiltesDokument ersetzt bei Bedarf das Lesen eines
// geteilten Dokuments (aufDokumenteAbbilden).
async function collectAreaStats(areaRoot, env, deps = {}) {
  const umgebung = env || {};
  const leseIndex = typeof deps.statsFor === 'function' ? deps.statsFor : backlinks.statsFor;
  const index = leseIndex(areaRoot, {
    ...umgebung,
    verweiseOhneZiel: {
      wikiVerweiseAktiv: umgebung.wikiVerweiseAktiv !== false,
      canvasAktiv: umgebung.canvasAktiv !== false,
      dashboardAktiv: umgebung.dashboardAktiv !== false,
      diagrammeAktiv: umgebung.diagrammeAktiv !== false,
      datentabelleAktiv: umgebung.datentabelleAktiv !== false,
    },
  });
  if (!index || index.status !== 'ready') {
    return { status: (index && index.status) || 'unavailable', stand: standJetzt() };
  }
  const roh = index.verweiseOhneZiel || { eintraege: [], verknuepfungen: [] };
  const verknuepft = await beurteileVerknuepfte(roh.verknuepfungen, index.wurzel, umgebung, deps);
  const toteVerweise = await aufDokumenteAbbilden(
    [...roh.eintraege, ...verknuepft.eintraege],
    index.wurzel,
    deps,
  );
  const scan = await scanArea(index.wurzel);

  const nichtMarkdownAnzahl = scan.bilder.anzahl + scan.pdf.anzahl + scan.sonstige.anzahl;
  const nichtMarkdownBytes = scan.bilder.bytes + scan.pdf.bytes + scan.sonstige.bytes;
  // 4T-001789: Die Beleg-Dateien zaehlen zu den Begleit-Bytes. Der Abgleich
  // «Dokumente mit Begleitdatei» darunter bleibt dagegen allein an .mdd
  // gebunden: Eine Beleg-Datei gehoert zu einer Tabellen-Datei und darf dort
  // weder mitzaehlen noch als verwaiste Dokument-Begleitdatei erscheinen.
  const begleitBytes = scan.mdd.bytes + scan.mdda.bytes + scan.mddl.bytes;
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
      mddl: scan.mddl,
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
      // 4T-000953 (Befund E-07): Zahl der offenen Dokumente dieses Bereichs mit
      // ungespeicherten Aenderungen — die Grundlage des Stand-Hinweises auf der
      // Seite. Begruendung im Kopf-Kommentar.
      ungespeicherteDokumente: leseUngespeicherte(index.wurzel, deps),
    },
    // 4T-002782 (Epic 3E-000392, V7): je Verweis ohne Ziel ein Eintrag
    // {pfad, name, zeile, verweis, grund}, nach Dokument und Zeile sortiert und
    // ungekürzt; dazu je nicht erreichbarem verknüpftem Bereich die Zahl der
    // nicht beurteilten Verweise {prefix, anzahl}. 4T-002783: Ein Eintrag aus
    // einem Folgeteil steht unter dem Dokument (aufDokumenteAbbilden); seine
    // Zeile ist null, wenn das geteilte Dokument nicht lesbar war, über den
    // Bereich reicht oder der Verweis im Kopf-Block des Folgeteils steht, den
    // der Editor nicht zeigt (Zweitblick zu 3E-000392, Hinweis A2).
    verweiseOhneZiel: {
      eintraege: sortiereVerweiseOhneZiel(toteVerweise),
      nichtErreichbar: verknuepft.nichtErreichbar,
    },
  };
}

// 4T-001600: scanArea ist ab hier der eine Ordner-Scan des Hauptprozesses —
// exportiert statt nachgebaut, damit der Kennzahlen-Beschleuniger der
// Gefaess-Liste dieselben Regeln fuer uebersprungene Ordner, Datei-Gruppen und
// Begleitdateien nutzt und keine zweite Zaehl-Grundlage entsteht.
module.exports = { collectAreaStats, scanArea, verweisSchalter };
