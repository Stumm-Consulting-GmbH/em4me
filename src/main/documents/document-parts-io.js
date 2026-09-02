// 4T-1290 (Epic 3E-0224): Datei-Ebene des Lese-Wegs geteilter Dokumente.
// Findet die Teile eines Dokuments im Verzeichnis, liest sie und lässt sie
// von src/shared/document-assembly.js zu einem Dokument zusammensetzen; der
// Katalog in der Begleitdatei des ersten Teils dient als Beschleuniger.
//
// Hier liegt ausschließlich der Datei-Zugriff. Die Logik — Ordnen,
// Zusammensetzen, Katalog bauen und prüfen — liegt im geteilten Modul und ist
// dort ohne Dateisystem prüfbar.
//
// Fehler wandern als {ok:false, error} zurück, nie als Ausnahme über die
// Aufruf-Grenze (Entwicklungsrichtlinien, Kapitel 3).
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { pathCompareKey } = require('../../shared/platform.js');
const {
  orderPartFiles,
  assembleParts,
  buildCatalog,
  catalogAgrees,
  fehlendeLautKatalog,
  partInfoOf,
  getCatalog,
  setCatalog,
} = require('../../shared/document-assembly.js');
// 4T-1291: die Schreib-Reihenfolge liegt im prozessneutralen Kern, weil sie
// eine Regel ist und kein Datei-Zugriff.
const { schreibReihenfolge } = require('../../shared/document-split.js');
const { normalizeForCompare } = require('./save-guard');
// 4T-1292: Lesen und Schreiben der Zuordnungs-Zeile für die Umbenennen-Kaskade.
const { readPartLine, writePartLine, FIRST_PART_INDEX } = require('../../shared/document-parts.js');
const mddStore = require('./mdd-store');

// Endungs-Liste wie im übrigen Bestand (src/main/area/area-path.js u.a.).
const MD_EXTENSION_RE = /\.(md|markdown|mdown|mkd)$/i;

// Begleitdatei zum Dokument: gleicher Basisname, Endung .mdd. Gleiche Bildung
// wie mddPathFor in mdd-history.js; bewusst wiederholt statt dort exportiert,
// weil jene Funktion in einer Closure mit eigenen Abhängigkeiten sitzt.
function mddPathFor(mdPath) {
  const parsed = path.parse(mdPath);
  return path.join(parsed.dir, `${parsed.name}.mdd`);
}

// Ergebnis für ein Dokument, das gar nicht geteilt ist. Der schnelle Weg:
// Ohne Zuordnungs-Zeile wird kein Verzeichnis gelesen und keine Begleitdatei
// angefasst — der Regelfall darf nichts kosten.
function ungeteilt(absolute, content) {
  const basename = path.parse(absolute).name;
  return {
    ok: true,
    geteilt: false,
    path: absolute,
    text: content,
    parts: [{ index: 1, basename }],
    // 4T-1291: dieselben Felder wie im geteilten Fall, damit der Schreib-Weg
    // beide Lagen gleich behandeln kann.
    teile: [{ index: 1, basename, pfad: absolute, content }],
    grenzen: [],
    basisName: basename,
    luecken: [],
    fehlend: [],
    dubletten: [],
  };
}

// Liest den Katalog aus der Begleitdatei des ersten Teils.
// Ein fehlender oder defekter Katalog ist kein Fehler, sondern schlicht kein
// Katalog: Dann entsteht das Dokument allein aus den Dateien.
async function readCatalog(headPath) {
  let raw;
  try {
    raw = await fs.readFile(mddPathFor(headPath), 'utf8');
  } catch {
    return null;
  }
  const parsed = mddStore.parseContainer(raw);
  if (!parsed.ok) return null;
  return getCatalog(parsed.container);
}

// Schreibt den Katalog in die Begleitdatei des ersten Teils.
// Ein Fehlschlag bleibt folgenlos für das Öffnen: Der Katalog ist Cache, und
// ein nicht geschriebener Cache kostet beim nächsten Mal einen
// Verzeichnis-Durchlauf, mehr nicht. Deshalb liefert die Funktion nur, ob es
// geklappt hat, und der Aufrufer bricht daran nichts ab.
async function writeCatalog(headPath, catalog, markSelfWriting) {
  const mddPath = mddPathFor(headPath);
  let container;
  try {
    const parsed = mddStore.parseContainer(await fs.readFile(mddPath, 'utf8'));
    container = parsed.ok ? parsed.container : null;
  } catch {
    container = null;
  }
  // Keine oder defekte Begleitdatei: Für einen reinen Cache wird keine
  // angelegt und keine überschrieben. Eine defekte Datei wird im Bestand nie
  // überschrieben (mdd-store.js), und diese Zurückhaltung gilt hier erst recht.
  if (!container) return false;
  setCatalog(container, catalog);
  const serialized = mddStore.serializeContainer(container);
  try {
    if (typeof markSelfWriting === 'function') markSelfWriting(mddPath, serialized);
    await fs.writeFile(mddPath, serialized, { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

// Sucht die Teil-Dateien im Verzeichnis des Dokuments.
// Geliefert werden Basenames OHNE Endung, wie orderPartFiles sie erwartet,
// zusammen mit der Zuordnung Basename -> realer Dateiname.
async function scanPartFiles(dir) {
  let eintraege;
  try {
    eintraege = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { basenames: [], dateien: new Map() };
  }
  const basenames = [];
  const dateien = new Map();
  for (const e of eintraege) {
    if (!e.isFile()) continue;
    if (!MD_EXTENSION_RE.test(e.name)) continue;
    const basename = e.name.replace(MD_EXTENSION_RE, '');
    basenames.push(basename);
    dateien.set(pathCompareKey(basename), e.name);
  }
  return { basenames, dateien };
}

/**
 * Liest ein möglicherweise geteiltes Dokument vollständig.
 *
 * `absolute` ist der Pfad der geöffneten Datei, `content` ihr bereits
 * gelesener Inhalt (der Aufrufer hat ihn ohnehin schon). Wird ein FOLGETEIL
 * geöffnet, liefert die Funktion das Gesamt-Dokument und als `path` den Pfad
 * der Kopf-Datei: Die Anwendung führt die Teile als ein Dokument, und ein
 * Reiter auf einem Bruchstück wäre das Gegenteil der zugesicherten
 * Unsichtbarkeit.
 *
 * Liefert { ok, geteilt, path, text, parts, luecken, dubletten } oder
 * { ok:false, error }. `luecken` nennt fehlende Positionen; sie werden hier
 * nur gemeldet, das Verhalten bei einem fehlenden Teil entscheidet Paket 4.
 */
async function readAssembledDocument(absolute, content, opts = {}) {
  const info = partInfoOf(content);
  if (!info) return ungeteilt(absolute, content);

  const dir = path.dirname(absolute);
  const ext = path.extname(absolute) || '.md';
  const { basenames, dateien } = await scanPartFiles(dir);

  // Die Kopf-Datei bestimmt der Grundname aus der Zuordnungs-Zeile, nicht der
  // Name der geöffneten Datei: Sie kann selbst ein Folgeteil sein.
  const headName = dateien.get(pathCompareKey(info.base));
  // 4T-1292: Zeigt der Grundname ins Leere, die geöffnete Datei trägt aber
  // Position 1, dann IST sie die Kopf-Datei — jemand hat das Dokument außerhalb
  // der Anwendung umbenannt, ohne die Zuordnungs-Zeile nachzuziehen. Ohne
  // diesen Rückfall scheiterte das Öffnen mit einem nackten Dateifehler auf
  // einen Namen, den der Anwender längst geändert hat. Der Grundname aus der
  // Zeile ist ein Hinweis auf den Ort, die Position dagegen eine Tatsache über
  // die Datei selbst; wo beide sich widersprechen, gilt die Position.
  const selbstKopf = !headName && info.index === FIRST_PART_INDEX;
  const eigenerBasename = path.parse(absolute).name;
  const headPath = selbstKopf ? absolute : path.join(dir, headName || `${info.base}${ext}`);
  const headBasename = selbstKopf
    ? eigenerBasename
    : headName
      ? headName.replace(MD_EXTENSION_RE, '')
      : info.base;

  const geordnet = orderPartFiles(headBasename, basenames, pathCompareKey);
  const katalog = await readCatalog(headPath);
  const stimmt = catalogAgrees(katalog, headBasename, geordnet.parts, pathCompareKey);
  // 4T-1292 (Option A des Product Owners vom 2026-08-31): Die Lücken aus den
  // Dateinamen und die Vermisstenmeldung des Katalogs zusammengenommen.
  const fehlend = [
    ...new Set([...geordnet.luecken, ...fehlendeLautKatalog(katalog, geordnet.parts)]),
  ].sort((a, b) => a - b);

  const inhalte = [];
  for (const part of geordnet.parts) {
    const datei = dateien.get(pathCompareKey(part.basename));
    const pfad = path.join(dir, datei || `${part.basename}${ext}`);
    if (pathCompareKey(pfad) === pathCompareKey(absolute)) {
      // Die bereits gelesene Datei nicht ein zweites Mal von der Platte holen.
      inhalte.push({ index: part.index, basename: part.basename, pfad, content });
      continue;
    }
    try {
      const raw = await fs.readFile(pfad, 'utf8');
      // BOM abschneiden und Zeilenenden auf LF normalisieren, genau wie der
      // Lese-Weg es mit der geöffneten Datei tut (src/main/ipc/files.js).
      // Ohne das mischte ein Teil mit CRLF sich in einen LF-Puffer, und der
      // Geändert-Vergleich schlüge ohne Zutun des Anwenders an.
      inhalte.push({
        index: part.index,
        basename: part.basename,
        pfad,
        content: raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'),
      });
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err),
        fehlenderTeil: part.index,
      };
    }
  }

  // Der Katalog wird nachgezogen, wenn er den Dateien widerspricht — verworfen
  // und neu gebaut, nie repariert. Ein Fehlschlag beim Schreiben bleibt
  // folgenlos, weil er nur den nächsten Verzeichnis-Durchlauf kostet.
  //
  // 4T-1291: `opts.ohneKatalog` unterdrückt das. Der Schreib-Weg liest die
  // Teile, um den Vergleichsstand des Konflikt-Schutzes zu bilden; ein
  // Katalog-Schreiben mitten in dieser Prüfung wäre ein Nebeneffekt an einer
  // Stelle, die nur lesen soll — und er wird ohnehin nach dem Schreiben neu
  // gebaut.
  // 4T-1292: Bei einem vermissten Teil wird der Katalog NICHT nachgezogen. Er
  // ist in diesem Fall der einzige Zeuge dafür, dass es den Teil je gab; ihn
  // hier zu überschreiben hieße, den Verdacht beim Öffnen selbst zu löschen —
  // beim zweiten Öffnen sähe das Dokument wieder vollständig aus. Das ist die
  // eine Ausnahme von «verworfen und neu gebaut», und sie folgt derselben
  // Zurückhaltung wie die Regel, eine defekte Begleitdatei nie zu überschreiben.
  if (!stimmt && !opts.ohneKatalog && fehlend.length === 0) {
    await writeCatalog(headPath, buildCatalog(headBasename, geordnet.parts), opts.markSelfWriting);
  }

  const zusammen = assembleParts(inhalte);
  return {
    ok: true,
    geteilt: true,
    path: headPath,
    text: zusammen.text,
    parts: geordnet.parts,
    // 4T-1291: Die gelesenen Teile mit Pfad und Inhalt, wie der Schreib-Weg sie
    // braucht. Er bekommt damit genau die Menge und Ordnung, die der Lese-Weg
    // sieht; eine zweite Ermittlung wäre die Divergenz, die dieses Epic am
    // teuersten bezahlte.
    teile: inhalte,
    grenzen: zusammen.grenzen,
    basisName: headBasename,
    luecken: geordnet.luecken,
    // 4T-1292: alle vermissten Positionen, aus Dateinamen UND Katalog. Solange
    // sie nicht leer sind, öffnet das Dokument nur lesend und Speichern bleibt
    // gesperrt: Ein Schreiben aus dem unvollständigen Puffer verlöre den
    // fehlenden Teil endgültig — und ein Teil, der nur verspätet eintrifft
    // (Synchronisation), ergäbe hinterher einen Mischtext.
    fehlend,
    dubletten: geordnet.dubletten,
    katalogGenutzt: stimmt,
  };
}

/**
 * Liest den Platten-Stand eines Dokuments für den Schreib-Weg (4T-1291).
 *
 * Bei einem geteilten Dokument ist das der ZUSAMMENGESETZTE Stand aller Teile,
 * nicht der Inhalt der Kopf-Datei. Das ist die Voraussetzung des
 * Konflikt-Schutzes: Der Reiter hält seit dem Lese-Weg aus 4T-1290 den
 * Gesamt-Text, und ein Vergleich gegen die Kopf-Datei allein meldete bei jedem
 * geteilten Dokument einen Konflikt, den es nicht gibt.
 *
 * Liefert { ok:true, geteilt, text, teile, basisName, headPath } oder
 * { ok:false, code, error }. Eine fehlende Datei kommt mit code 'ENOENT'
 * zurück; sie ist eine Neuanlage und kein Fehler, das entscheidet der Aufrufer.
 */
async function readStateForSave(absolute) {
  let raw;
  try {
    raw = await fs.readFile(absolute, 'utf8');
  } catch (err) {
    return {
      ok: false,
      code: err && err.code,
      error: err && err.message ? err.message : String(err),
    };
  }
  const content = normalizeForCompare(raw);
  const doc = await readAssembledDocument(absolute, content, { ohneKatalog: true });
  if (!doc.ok) return { ok: false, code: 'part-missing', error: doc.error, ...doc };
  return {
    ok: true,
    geteilt: doc.geteilt,
    text: doc.text,
    teile: doc.teile,
    basisName: doc.basisName || path.parse(absolute).name,
    headPath: doc.path,
    fehlend: doc.fehlend || [],
  };
}

/**
 * Schreibt die geplanten Teile eines Dokuments.
 *
 * Geschrieben wird nur, was sich geändert hat: Im Regelfall ist das genau eine
 * Datei, weil die Zerlegung die bestehenden Grenzen erhält. Die Reihenfolge
 * kommt aus schreibReihenfolge (siehe dort, AK6).
 *
 * Liefert { ok:true, geschrieben } oder { ok:false, error, geschrieben } mit
 * den Pfaden, die bis zum Fehler geschrieben wurden.
 */
async function writeDocumentParts(headPath, teile, opts = {}) {
  const dir = path.dirname(headPath);
  const ext = path.extname(headPath) || '.md';
  const geschrieben = [];
  for (const teil of schreibReihenfolge(teile)) {
    if (!teil.geaendert) continue;
    const pfad = teil.pfad || path.join(dir, `${teil.basename}${ext}`);
    try {
      if (typeof opts.markSelfWriting === 'function') opts.markSelfWriting(pfad, teil.text);
      await fs.writeFile(pfad, teil.text, { encoding: 'utf8' });
      geschrieben.push(pfad);
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err),
        geschrieben,
      };
    }
  }
  // Der Katalog kommt zuletzt und nur als Beschleuniger: Ein Fehlschlag bleibt
  // folgenlos, weil er nur den nächsten Verzeichnis-Durchlauf kostet.
  const basisName = path.parse(headPath).name;
  await writeCatalog(
    headPath,
    buildCatalog(
      basisName,
      teile.map((t) => ({ index: t.index, basename: t.basename })),
    ),
    opts.markSelfWriting,
  );
  return { ok: true, geschrieben };
}

/**
 * Findet die FOLGETEILE eines Dokuments im selben Verzeichnis (4T-1292, AK3).
 *
 * Gesucht wird allein über den Namen: Die Teile eines Dokuments sind seine
 * Geschwister mit dem Trennzeichen und dem Grundnamen davor. Der Frontmatter
 * bleibt ungelesen — genau dafür trägt die Namensform ein eigenes Zeichen (F3).
 *
 * Die Kopf-Datei selbst ist NICHT enthalten; der Aufrufer hat sie bereits.
 * Liefert die absoluten Pfade in aufsteigender Positions-Ordnung.
 */
async function scanOwnParts(absolute) {
  const dir = path.dirname(absolute);
  const basename = path.parse(absolute).name;
  const { basenames, dateien } = await scanPartFiles(dir);
  const geordnet = orderPartFiles(basename, basenames, pathCompareKey);
  const pfade = [];
  for (const part of geordnet.parts) {
    if (part.index === 1) continue;
    const datei = dateien.get(pathCompareKey(part.basename));
    if (datei) pfade.push(path.join(dir, datei));
  }
  return pfade;
}

/**
 * Zieht die Zuordnungs-Zeile einer Datei auf einen neuen Grundnamen nach
 * (4T-1292, AK3).
 *
 * Nötig, weil die Zeile den Grundnamen trägt: Nach einem Umbenennen zeigten
 * die Teile sonst auf ein Dokument, das es nicht mehr gibt — und die Datei ist
 * die Wahrheit, nicht der Name. Die POSITION bleibt unangetastet und wird aus
 * der bestehenden Zeile übernommen, nicht aus dem Dateinamen abgeleitet.
 *
 * Eine Datei ohne lesbare Zuordnungs-Zeile wird übergangen, nicht repariert:
 * Sie ist entweder kein Teil oder ein Fremd-Eingriff, und beides ist hier nicht
 * zu heilen. Liefert { ok, geaendert } bzw. { ok:false, error, pfad }.
 */
async function rewritePartBase(pfade, neuerBase, opts = {}) {
  let geaendert = 0;
  for (const pfad of pfade || []) {
    let roh;
    try {
      roh = await fs.readFile(pfad, 'utf8');
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err), pfad };
    }
    const info = readPartLine(roh);
    if (!info) continue;
    if (info.base === neuerBase) continue;
    const geschrieben = writePartLine(roh, { index: info.index, base: neuerBase });
    if (!geschrieben.ok) return { ok: false, error: geschrieben.error, pfad };
    try {
      if (typeof opts.markSelfWriting === 'function') {
        opts.markSelfWriting(pfad, geschrieben.text);
      }
      await fs.writeFile(pfad, geschrieben.text, { encoding: 'utf8' });
      geaendert++;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err), pfad };
    }
  }
  return { ok: true, geaendert };
}

/**
 * Vereint die Teile eines Dokuments wieder zu einer Datei (4T-1293, AK3).
 *
 * **Ausschließlich auf ausdrückliche Aktion des Anwenders** (O9). Ein
 * automatisches Zusammenführen ist ausgeschlossen: Es wäre Rebalancing, und die
 * Zahl der Teile soll nie von selbst schrumpfen.
 *
 * Die Reihenfolge ist die sichere: Erst bekommt die Kopf-Datei den vollständigen
 * Text **ohne** Zuordnungs-Zeile, danach werden die Folgeteile gelöscht. Bricht
 * es dazwischen ab, trägt die Kopf-Datei bereits alles und gilt mangels
 * Zuordnungs-Zeile als ungeteilt; die verbliebenen Teil-Dateien sind dann
 * verwaist, aber nichts ist verloren. Umgekehrt wäre der Text weg.
 *
 * Liefert { ok, path, geloescht } oder { ok:false, error }.
 */
async function rejoinDocument(absolute, opts = {}) {
  const stand = await readStateForSave(absolute);
  if (!stand.ok) return { ok: false, error: stand.error, code: stand.code };
  if (!stand.geteilt) return { ok: false, error: 'nicht geteilt', code: 'not-split' };
  // Ein fehlender Teil verbietet das Vereinen aus demselben Grund wie das
  // Speichern: Der Text wäre unvollständig, und das Löschen der übrigen Teile
  // machte den Verlust endgültig.
  if (Array.isArray(stand.fehlend) && stand.fehlend.length > 0) {
    return { ok: false, error: 'fehlende Teile', code: 'parts-missing', fehlend: stand.fehlend };
  }
  const vereint = writePartLine(stand.text, null);
  if (!vereint.ok) return { ok: false, error: vereint.error };

  const kopf = stand.headPath;
  try {
    if (typeof opts.markSelfWriting === 'function') opts.markSelfWriting(kopf, vereint.text);
    await fs.writeFile(kopf, vereint.text, { encoding: 'utf8' });
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
  const geloescht = [];
  for (const teil of stand.teile) {
    if (teil.index === FIRST_PART_INDEX) continue;
    try {
      await fs.rm(teil.pfad);
      geloescht.push(teil.pfad);
    } catch (err) {
      // Ein nicht löschbarer Teil bleibt liegen und ist ab jetzt verwaist: Die
      // Kopf-Datei trägt seinen Inhalt bereits und keine Zuordnungs-Zeile mehr.
      console.warn('[teile] Teil nicht löschbar:', teil.pfad, err && err.message);
    }
  }
  // Der Katalog beschreibt eine Teilung, die es nicht mehr gibt.
  await writeCatalog(kopf, null, opts.markSelfWriting);
  return { ok: true, path: kopf, text: vereint.text, geloescht };
}

module.exports = {
  MD_EXTENSION_RE,
  mddPathFor,
  readAssembledDocument,
  readStateForSave,
  writeDocumentParts,
  readCatalog,
  writeCatalog,
  scanPartFiles,
  scanOwnParts,
  rewritePartBase,
  rejoinDocument,
};
