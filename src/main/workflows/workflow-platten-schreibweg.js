// 4T-002689 (Epic 3E-000415, Story 4S-001215): Der Schreibweg der Text-Befehle
// auf die Platte — für ein gewöhnliches wie für ein in Teile zerlegtes Dokument.
//
// **Warum ein eigener Weg.** Bis hierher las der Platten-Weg der Inhalts-Befehle
// allein die Kopf-Datei, roh, und schrieb sie zurück. In einem geteilten
// Dokument hängte `append` damit an das Ende des ERSTEN Teils, also mitten ins
// Dokument, und `insert` und `replace` fanden eine Stelle in einem späteren Teil
// nicht (Beleg im Task, 2026-11-14). Dieser Weg liest den zusammengesetzten
// Stand, wendet die Bearbeitung auf das ganze Dokument an und schreibt die Teile
// so, wie es das Speichern von Hand tut.
//
// **Dieselben Bausteine in derselben Reihenfolge wie `file:save`**
// (`src/main/ipc/files.js`), ohne jenes Modul anzufassen (technische Festlegung
// vom 2026-11-14): Stand mit den Teilen (`readStateForSave`), Sperre bei
// fehlenden Teilen, Teilungs-Planung (`planeZerlegung` mit `teilungsOptionen`),
// Sicherung des alten Gesamt-Stands, wenn mehr als eine Datei geschrieben wird,
// Schreiben (`writeDocumentParts` oder die ganze Datei), Historie
// (`recordMddOnSave`). Dass beide Wege ein geteiltes Dokument gleich lesen und
// gleich schreiben, hält der Wächter-Prüffall in
// `test/unit/workflow-geteilte-dokumente.test.js` fest.
//
// **Bewusst NICHT übernommen** aus `file:save`:
//   - die Konflikt-Prüfung: Der Weg liest und schreibt in einem Zug, ohne einen
//     erwarteten Stand aus einem Editor; `file:save` prüft ohne `expected`
//     ebenso wenig (Begründung im Kapitel «Lösung» des Tasks);
//   - die Rückfrage beim ersten Teilen: Hebt ein Workflow ein gewöhnliches
//     Dokument erstmals über die Schwelle, wird es ungeteilt geschrieben, ohne
//     Frage und ohne Halt; geteilt wird beim nächsten Speichern von Hand mit der
//     gewohnten Rückfrage (Entscheidung des Auftraggebers vom 2026-11-14). Eine
//     Tabellen-Datei teilt der Weg wie das Speichern von Hand, dort fragt auch
//     der Editor nicht;
//   - die Prüfungen der Datenbank (Schutz der Definition, Prüfung einer
//     Karteikarte): An ihre Stelle tritt seit 4T-002690 das strengere Urteil
//     der Text-Befehle (`workflow-db-urteil.js`), hereingereicht als
//     `optionen.pruefe` und gerufen, bevor eine Datei geschrieben wird.
//
// **Lauf-Marke statt Selbst-Schreib-Marke** (4T-002461): Jede geschriebene
// Datei, auch jeder Teil und die Begleitdatei mit dem Katalog, bekommt vor dem
// Schreiben die Lauf-Marke über die Schreib-Marke der Bausteine. Die
// Selbst-Schreib-Marke bleibt aus, damit ein ungeändert geöffnetes Dokument in
// jedem Fenster neu lädt.
//
// Eigener Zustand: keiner.
'use strict';

const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { merkeLaufStand } = require('../documents/self-write');
const fs = require('node:fs/promises');
const {
  readAssembledDocument,
  readStateForSave,
  writeDocumentParts,
} = require('../documents/document-parts-io');
const {
  readPartLine,
  writePartLine,
  baseBasenameOf,
  FIRST_PART_INDEX,
} = require('../../shared/document-parts');
const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { teilungsOptionen } = require('../documents/teilungs-optionen');
const { planeZerlegung } = require('../../shared/document-split');
const { assembleParts } = require('../../shared/document-assembly');
const { applyContentEdit } = require('../../shared/workflows/workflow-edit.js');

// Byte-Order-Zeichen, als Code gebildet, damit es nicht unsichtbar im Quelltext steht.
const BOM = String.fromCharCode(0xfeff);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

function fehlerCode(err) {
  return err && err.code ? err.code : null;
}

// --- Grenze des Bereichs für Pfade aus Dokument-Inhalt ------------------------
//
// Sicherheits-Review, Runde 1 (blockierend): Der Grundname in der
// Zuordnungs-Zeile `doc-part` ist Dokument-Inhalt. Der Lese-Weg der Teile bildet
// daraus den Pfad der Kopf-Datei (`path.join(dir, base + ext)`), und ein
// Grundname mit `../`, Rückstrich oder Laufwerk führte aus dem Bereich heraus;
// ebenso ein Teil, der als Verweis nach außen zeigt. Deshalb gilt hier, BEVOR
// der Lese-Weg der Teile läuft: Kopf-Datei, Teile und Begleitdatei liegen im
// Ordner der genannten Datei, der Grundname ist ein blanker Name, und jede
// vorhandene Datei des Dokuments besteht dieselbe Prüfung wie ein genannter
// Schritt-Pfad (`resolveAreaPath`: Text, Innerhalb-Prüfung, echter Ort). Nach
// dem Lesen werden die gelieferten Pfade erneut gegen den Ordner gehalten, vor
// dem Schreiben jeder Ziel-Pfad. Fehlschlag ist `outsideArea`.

// Ein blanker Datei-Name: kein Trenner, kein Laufwerk, kein Punkt-Segment. Der
// Doppelpunkt ist unter Windows ganz gesperrt (Laufwerk, Neben-Datenstrom); auf
// den übrigen Plattformen ist er ein gewöhnliches Zeichen eines Datei-Namens
// und nur als Laufwerks-Angabe am Anfang gesperrt, wie bei einem Schritt-Pfad.
function blankerName(name) {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..') return false;
  if (/[\\/]/.test(name) || /^[A-Za-z]:/.test(name)) return false;
  return process.platform !== 'win32' || !name.includes(':');
}

function gleicherOrdner(a, b) {
  return pathCompareKey(path.dirname(path.resolve(a))) === pathCompareKey(path.resolve(b));
}

// Derselbe Weg wie für einen genannten Schritt-Pfad (`workflow-area-path.js`).
async function imBereich(root, abs) {
  const rel = path.relative(path.resolve(root || ''), abs);
  if (rel === '' || path.isAbsolute(rel)) return false;
  return (await resolveAreaPath(root, rel.split(path.sep).join('/'))).ok;
}

/**
 * Prüft die Datei-Menge eines möglicherweise geteilten Dokuments gegen die
 * Grenze, bevor etwas davon gelesen wird.
 *
 * @param {string} root Wurzel des Bereichs.
 * @param {string} abs genannte, bereits gegen die Wurzel geprüfte Datei.
 * @param {string} anzeige Pfad für den Satz eines Halts.
 * @returns {Promise<{ok: true, dir: string}|{ok: false, code: string, detail: object}>}
 */
async function pruefeDokumentOrt(root, abs, anzeige) {
  const ausserhalb = fehlschlag('outsideArea', { path: anzeige });
  const dir = path.dirname(abs);
  if (!(await imBereich(root, abs))) return ausserhalb;
  let inhalt;
  try {
    inhalt = ohneBom(await fs.readFile(abs, 'utf8')).replace(/\r\n/g, '\n');
  } catch {
    return { ok: true, dir };
  }
  const info = readPartLine(inhalt);
  if (!info) return { ok: true, dir };
  if (!blankerName(info.base)) return ausserhalb;
  // Kopf, Teile und Begleitdatei tragen den Grundnamen der Zeile oder den der
  // genannten Datei (Rückfall des Lese-Wegs, wenn der Grundname ins Leere zeigt).
  const grundnamen = [info.base, baseBasenameOf(path.parse(abs).name)].map((p) =>
    pathCompareKey(p),
  );
  let namen;
  try {
    namen = await fs.readdir(dir);
  } catch {
    return ausserhalb;
  }
  const eigeneEndung = (path.extname(abs) || '.md').toLowerCase();
  for (const name of namen) {
    if (!gehoertZumDokument(name, grundnamen, eigeneEndung)) continue;
    if (!(await imBereich(root, path.join(dir, name)))) return ausserhalb;
  }
  return { ok: true, dir };
}

// Endungs-Liste wie im Lese-Weg der Teile (`document-parts-io.js`).
const MD_ENDUNG_RE = /\.(md|markdown|mdown|mkd)$/i;

// Sicherheits-Review, Runde 2 (Hinweis 2): Zum Dokument gehören die Namen, die
// der Lese-Weg der Teile öffnet: Kopf-Datei und Teile mit Markdown-Endung und
// die Begleitdatei `.mdd`, je mit dem Grundnamen. Runde 3 (Hinweis): dazu die
// Endung der genannten Datei, denn fehlt eine Kopf-Datei mit Markdown-Endung,
// bildet der Lese-Weg den Kopf-Pfad mit ihr (ein Ziel `notiz.txt` führt auf
// `<Grundname>.txt`). Eine fremde Nachbar-Datei mit demselben Namens-Anfang
// (`Bericht.alt.md`, `Bericht.assets`) gehört nicht dazu und hält ein
// gewöhnliches geteiltes Dokument nicht an.
function gehoertZumDokument(name, grundnamen, eigeneEndung) {
  const teile = path.parse(name);
  const endung = teile.ext.toLowerCase();
  if (endung !== '.mdd' && endung !== eigeneEndung && !MD_ENDUNG_RE.test(name)) return false;
  return (
    grundnamen.includes(pathCompareKey(teile.name)) ||
    grundnamen.includes(pathCompareKey(baseBasenameOf(teile.name)))
  );
}

// Nach dem Lesen: Kopf-Datei und jeder gelesene Teil liegen im geprüften Ordner
// und bestehen die Prüfung des echten Orts. Sicherheits-Review, Runde 2
// (Hinweis 1): Die Prüfung vor dem Lesen hängt am Namens-Vergleich; diese hier
// prüft jeden Pfad, den der Lese-Weg wirklich geliefert hat, unabhängig davon,
// wie das Datei-System Namen gleichsetzt, bevor ein Inhalt an den Aufrufer geht.
async function standImOrdner(root, stand, dir) {
  const pfade = [stand.headPath, ...(stand.teile || []).map((t) => t.pfad)].filter(Boolean);
  for (const p of pfade) {
    if (!gleicherOrdner(p, dir) || !(await imBereich(root, p))) return false;
  }
  return true;
}

// Der Stand vor der Bearbeitung, mit der Sperre bei fehlenden Teilen. Ein Teil,
// der laut Dateinamen oder Katalog fehlt oder sich nicht lesen lässt, hält den
// Lauf an: Ein Schreiben aus dem unvollständigen Stand verlöre ihn endgültig,
// genau wie beim Speichern aus dem Editor.
async function liesStand(root, ziel) {
  const anzeige = typeof ziel.rel === 'string' ? ziel.rel : ziel.abs;
  // Sicherheits-Review, Runde 1: die Grenze im Baustein selbst, damit kein
  // Aufrufer sie vergessen kann (Abschnitt «Grenze des Bereichs» oben).
  const ort = await pruefeDokumentOrt(root, ziel.abs, anzeige);
  if (!ort.ok) return ort;
  const stand = await readStateForSave(ziel.abs);
  if (!stand.ok && stand.code === 'part-missing') {
    return fehlschlag('partsMissing', { path: anzeige, teile: String(stand.fehlenderTeil) });
  }
  if (!stand.ok) return fehlschlag('targetMissing', { path: anzeige, fsCode: stand.code || null });
  if (stand.fehlend.length > 0) {
    return fehlschlag('partsMissing', { path: anzeige, teile: stand.fehlend.join(', ') });
  }
  if (!(await standImOrdner(root, stand, ort.dir))) {
    return fehlschlag('outsideArea', { path: anzeige });
  }
  return { ...stand, ordner: ort.dir };
}

/**
 * Der Pfad, unter dem die Anwendung ein Dokument führt (Zweitblick, Runde 1):
 * bei einem Folgeteil eines geteilten Dokuments die Kopf-Datei, sonst der Pfad
 * selbst. Ein Fenster hält ein geteiltes Dokument immer unter dem Pfad der
 * Kopf-Datei (Lese-Weg `file:read`); wer mit dem Pfad eines Folgeteils nach
 * dem Besitzer eines ungespeicherten Stands fragt, fände ihn nicht.
 *
 * Der Regelfall kostet ein Lesen der genannten Datei: Ohne Zuordnungs-Zeile
 * oder mit Position 1 ist sie selbst die Kopf-Datei. Nur ein Folgeteil wird
 * über den Lese-Weg der Teile aufgelöst, ohne den Katalog zu schreiben.
 *
 * Sicherheits-Review, Runde 1: Vor jedem Lesen prüft `pruefeDokumentOrt` die
 * Datei-Menge des Dokuments gegen den Ordner und die Bereichs-Wurzel, danach
 * wird der aufgelöste Kopf-Pfad selbst noch einmal geprüft.
 *
 * @param {string} root Wurzel des Bereichs.
 * @param {string} abs absoluter Pfad einer vorhandenen, gegen die Wurzel geprüften Datei.
 * @param {string} anzeige Pfad für den Satz eines Halts.
 * @returns {Promise<{ok: true, kopf: string}|{ok: false, code: string, detail: object}>}
 *   bei einem Lesefehler `kopf` gleich `abs`; Code `outsideArea`.
 */
async function kopfPfadVon(root, abs, anzeige) {
  const ort = await pruefeDokumentOrt(root, abs, anzeige);
  if (!ort.ok) return ort;
  let inhalt;
  try {
    inhalt = ohneBom(await fs.readFile(abs, 'utf8')).replace(/\r\n/g, '\n');
  } catch {
    return { ok: true, kopf: abs };
  }
  const info = readPartLine(inhalt);
  if (!info || info.index === FIRST_PART_INDEX) return { ok: true, kopf: abs };
  const doc = await readAssembledDocument(abs, inhalt, { ohneKatalog: true });
  const kopf = doc.ok && typeof doc.path === 'string' ? doc.path : abs;
  if (kopf === abs) return { ok: true, kopf };
  // Die Kopf-Datei trägt ihre eigene Zuordnungs-Zeile; sie wird wie die
  // genannte Datei geprüft, bevor ein Aufrufer sie liest oder schreibt.
  if (!gleicherOrdner(kopf, ort.dir)) return fehlschlag('outsideArea', { path: anzeige });
  const kopfOrt = await pruefeDokumentOrt(root, kopf, anzeige);
  return kopfOrt.ok ? { ok: true, kopf } : kopfOrt;
}

/**
 * Ein Dokument so, wie die Anwendung es führt (Zweitblick, Runden 1 und 2): der
 * Pfad der Kopf-Datei und der Text des ganzen Dokuments, also der
 * ungespeicherte Stand eines Fensters, sonst bei einem geteilten Dokument der
 * zusammengesetzte Stand aller Teile (samt Zuordnungs-Zeile im Dateikopf, wie
 * ihn der Editor zeigt) und bei einem ungeteilten die Datei roh, nur ohne
 * Byte-Order-Zeichen, wie vor 4T-002689. Fehlt ein Teil, hält der Schritt an.
 *
 * @param {object} backlinks Index mit `bufferTextFor`.
 * @param {string} root Wurzel des Bereichs.
 * @param {string} abs absoluter Pfad, auch eines Folgeteils.
 * @param {string} anzeige Pfad für den Satz eines Halts.
 * @param {string} fehlt Code, wenn sich die Datei nicht lesen lässt.
 * @returns {Promise<{ok: true, kopf: string, text: string}|{ok: false, code: string, detail: object}>}
 */
async function liesDokument(backlinks, root, abs, anzeige, fehlt) {
  const aufgeloest = await kopfPfadVon(root, abs, anzeige);
  if (!aufgeloest.ok) return aufgeloest;
  const kopf = aufgeloest.kopf;
  const puffer =
    backlinks && typeof backlinks.bufferTextFor === 'function'
      ? backlinks.bufferTextFor(kopf)
      : null;
  if (typeof puffer === 'string') return { ok: true, kopf, text: ohneBom(puffer) };
  let roh;
  try {
    roh = ohneBom(await fs.readFile(kopf, 'utf8'));
  } catch (err) {
    return fehlschlag(fehlt, { path: anzeige, fsCode: fehlerCode(err) });
  }
  if (!readPartLine(roh)) return { ok: true, kopf, text: roh };
  const stand = await readStateForSave(kopf);
  if (!stand.ok && stand.code === 'part-missing') {
    return fehlschlag('partsMissing', { path: anzeige, teile: String(stand.fehlenderTeil) });
  }
  if (!stand.ok) return fehlschlag(fehlt, { path: anzeige, fsCode: stand.code || null });
  if (stand.fehlend.length > 0) {
    return fehlschlag('partsMissing', { path: anzeige, teile: stand.fehlend.join(', ') });
  }
  if (!(await standImOrdner(root, stand, path.dirname(kopf)))) {
    return fehlschlag('outsideArea', { path: anzeige });
  }
  return { ok: true, kopf, text: stand.text };
}

/**
 * Der Text einer Quelle (`from-file`) als ganzes Dokument, ohne Zuordnungs-Zeile
 * (Zweitblick, Runde 1, Befund 2). Eine ungeteilte Quelle kommt wortgleich an
 * (Runde 2, Befund 1).
 *
 * @param {object} backlinks Index mit `bufferTextFor`.
 * @param {string} root Wurzel des Bereichs.
 * @param {string} abs absoluter Pfad der Quelle.
 * @param {string} anzeige Pfad für den Satz eines Halts.
 * @returns {Promise<{ok: true, text: string}|{ok: false, code: string, detail: object}>}
 *   Codes `partsMissing`, `sourceMissing`, `outsideArea`.
 */
async function liesQuelle(backlinks, root, abs, anzeige) {
  const dokument = await liesDokument(backlinks, root, abs, anzeige, 'sourceMissing');
  if (!dokument.ok) return dokument;
  return { ok: true, text: ohneZuordnung(dokument.text) };
}

// Der zusammengesetzte Stand trägt die Zuordnungs-Zeile der Kopf-Datei im
// Dateikopf, auch im Puffer eines Fensters. In einen anderen Text eingesetzt
// gehört sie nicht dorthin: Stünde sie am Anfang des Ziels, gälte dieses als
// Teil eines fremden Dokuments. Entfernt wird sie wie beim Wiedervereinen;
// ein Dateikopf, der nur sie trug, entfällt dabei ganz.
//
// Zweitblick, Runde 2: Nur ein Text MIT Zuordnungs-Zeile wird bereinigt, jeder
// andere geht unverändert durch; `writePartLine` gibt den Dateikopf über die
// YAML-Bibliothek neu aus (Leerraum und Listen-Einrückung normalisiert, ein
// Dateikopf aus Kommentaren entfällt), und das darf eine Quelle ohne Teilung
// nie treffen. Bei einer geteilten Quelle bleibt diese Normalisierung als
// benannte offene Stelle (Kapitel «Lösung» des Tasks).
function ohneZuordnung(text) {
  if (!readPartLine(text)) return text;
  const ohne = writePartLine(text, null);
  return ohne.ok ? ohne.text : text;
}

function ohneBom(text) {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Baut den Schreibweg der Text-Befehle auf die Platte.
 *
 * @param {object} deps
 * @param {Function} deps.resolveHistoryFor Auflösung der Historisierungs-Schaltung.
 * @param {Function} deps.recordMddOnSave Historien-Paket beim Speichern schreiben.
 * @returns {{schreibeBearbeitung: Function}}
 */
function createPlattenSchreibweg({ resolveHistoryFor, recordMddOnSave }) {
  // Teilung planen und die Dateien schreiben; liefert den geschriebenen
  // Gesamt-Stand. Wirft bei einem Schreibfehler.
  async function schreibe(ctx, stand, zielPfad, neu, recordHistory) {
    const owner = ctx.owner;
    const teilung = teilungsOptionen(neu);
    const plan = planeZerlegung({
      text: neu,
      base: stand.basisName,
      schwelle: teilung.schwelle,
      bestand: stand.geteilt ? stand.teile : [],
      segmentFelder: teilung.segmentFelder,
    });
    if (plan.ok === false) throw new Error(plan.error);
    // Erstes Teilen eines gewöhnlichen Dokuments: ungeteilt weiter (siehe Kopf).
    const teilen = plan.geteilt && !(plan.neuGeteilt && !teilung.istTabelle);
    if (!teilen) {
      await ersetzeDateiOderWirf(zielPfad, neu, { markSelfWriting: merkeLaufStand });
      return neu;
    }
    // Sicherheits-Review, Runde 1: Jede Datei, die gleich geschrieben wird, liegt
    // im geprüften Ordner und besteht die Prüfung eines Schritt-Pfads. Die
    // Prüfung steht vor dem Sicherungs-Eintrag darunter, damit ein Halt an der
    // Grenze auch die Begleitdatei unverändert lässt (Zweitblick des Epics).
    const ext = path.extname(zielPfad) || '.md';
    for (const teil of plan.teile) {
      const p = teil.pfad || path.join(path.dirname(zielPfad), `${teil.basename}${ext}`);
      const zulaessig =
        blankerName(path.basename(p)) &&
        gleicherOrdner(p, stand.ordner) &&
        (await imBereich(ctx.root, p));
      if (!zulaessig) throw Object.assign(new Error('outsideArea'), { grenze: true });
    }
    // Berührt das Schreiben mehr als eine Datei, liegt der alte Gesamt-Stand
    // vorher in der Historie, auch bei abgeschalteter Historisierung — wie in
    // `file:save`: Zwei Dateien lassen sich nicht in einem Zug schreiben.
    const mehrDateien = plan.teile.filter((t) => t.geaendert).length > 1;
    if (mehrDateien && !recordHistory) {
      await recordMddOnSave(owner, zielPfad, stand.text, stand.text);
    }
    const res = await writeDocumentParts(zielPfad, plan.teile, { markSelfWriting: merkeLaufStand });
    if (!res.ok) throw Object.assign(new Error(res.error), { code: res.code });
    return assembleParts(plan.teile.map((t) => ({ index: t.index, content: t.text }))).text;
  }

  /**
   * Wendet eine fertige Bearbeitung über die Platte auf ein Dokument an.
   *
   * @param {object} ctx Lauf-Kontext mit `owner`.
   * @param {{abs: string, rel?: string}} ziel geprüftes Ziel des Schritts.
   * @param {object} edit Bearbeitung für `applyContentEdit`.
   * @param {{pruefe?: (pfad: string, alt: string, neu: string) => Promise<object>}} [optionen]
   *   4T-002690: das Urteil der Datenbank, gerufen mit dem zusammengesetzten
   *   Stand vor und nach der Bearbeitung, bevor eine Datei geschrieben wird;
   *   ein Fehlschlag daraus beendet den Schritt ohne Schreiben.
   * @returns {Promise<object>} `{ ok: true, effect }` oder `{ ok: false, code, detail }`;
   *   eigene Codes `partsMissing`, `targetMissing`, `writeFailed`.
   */
  async function schreibeBearbeitung(ctx, ziel, edit, optionen = {}) {
    const stand = await liesStand(ctx.root, ziel);
    if (!stand.ok) return stand;
    const ergebnis = applyContentEdit(stand.text, edit);
    if (!ergebnis.ok) return fehlschlag(ergebnis.code);
    // Der Kopf-Pfad, nicht der genannte: Ein Folgeteil als Ziel meint das ganze
    // Dokument, wie beim Öffnen im Editor.
    const zielPfad = stand.headPath || ziel.abs;
    if (!ergebnis.changed) {
      return { ok: true, effect: { kind: 'unchanged', paths: [zielPfad], via: 'disk' } };
    }
    // Zeilenenden wie `file:save`: Der Stand ist bereits LF, ein eingesetzter
    // Text aus einer Quelle muss es nicht sein.
    const neu = ergebnis.text.replace(/\r\n/g, '\n');
    // 4T-002690: Das Urteil sieht genau den Stand, der geschrieben würde.
    if (typeof optionen.pruefe === 'function') {
      const urteil = await optionen.pruefe(zielPfad, stand.text, neu);
      if (!urteil.ok) return urteil;
    }
    try {
      const recordHistory = (await resolveHistoryFor(ctx.owner, zielPfad, neu)).effective;
      const geschrieben = await schreibe(ctx, stand, zielPfad, neu, recordHistory);
      if (recordHistory) await recordMddOnSave(ctx.owner, zielPfad, stand.text, geschrieben);
    } catch (err) {
      if (err && err.grenze) return fehlschlag('outsideArea', { path: ziel.rel || zielPfad });
      return fehlschlag('writeFailed', { fsCode: fehlerCode(err) });
    }
    return { ok: true, effect: { kind: 'edited', paths: [zielPfad], via: 'disk' } };
  }

  return { schreibeBearbeitung };
}

module.exports = { createPlattenSchreibweg, kopfPfadVon, liesDokument, liesQuelle };
