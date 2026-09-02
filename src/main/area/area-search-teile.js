// 4T-1293 (Epic 3E-0224): Geteilte Dokumente in der Bereichs-Suche.
//
// Die Suche arbeitet dateiweise. Ohne dieses Modul erschiene ein Treffer aus
// einem Folgeteil unter dem Namen der Teil-Datei — die Teilung wäre in der
// Trefferliste sichtbar und widerspräche der Zusage des Epics (O10).
//
// Zusammengeführt wird HIER und nicht im Lese-Weg (document-parts-io.js), weil
// die Suche ihre Texte bereits im Vorrat hält: Sie ein zweites Mal von der
// Platte zu holen, kostete bei genau den Dateien, um die es geht, das
// Mehrfache. Die Ordnung der Teile und das Abtrennen ihrer Frontmatter kommen
// dagegen aus denselben geteilten Modulen wie beim Öffnen — die Reihenfolge
// darf zwischen Suche und Öffnen nicht auseinanderlaufen.
'use strict';

const path = require('node:path');
const { parsePartBasename, baseBasenameOf } = require('../../shared/document-parts.js');
const { assembleParts } = require('../../shared/document-assembly.js');

// Endung eines wurzel-relativen Pfades ('a/b/Name•part-00002.md' -> '.md').
const EXT_RE = /\.[^./]+$/;

/**
 * Der Pfad der Kopf-Datei zu einem wurzel-relativen Pfad.
 *
 * Für eine Teil-Datei ist das ihr Dokument, für alles andere der Pfad selbst.
 * Rein auf dem Namen, ohne Datei-Zugriff und ohne Frontmatter — genau dafür
 * trägt die Namensform ein eigenes Trennzeichen (F3).
 */
function kopfRelPfad(rel) {
  const s = String(rel == null ? '' : rel);
  const ext = (s.match(EXT_RE) || [''])[0];
  const ohneExt = ext ? s.slice(0, -ext.length) : s;
  const schnitt = ohneExt.lastIndexOf('/');
  const ordner = schnitt >= 0 ? ohneExt.slice(0, schnitt + 1) : '';
  const basename = schnitt >= 0 ? ohneExt.slice(schnitt + 1) : ohneExt;
  if (!parsePartBasename(basename)) return s;
  return ordner + baseBasenameOf(basename) + ext;
}

/**
 * Führt die Teile geteilter Dokumente im Such-Vorrat zusammen.
 *
 * Eingabe ist der Vorrat, wie ihn die Suche hält: `texte` als Map von
 * wurzel-relativem Pfad auf { text, … } und `reihenfolge` als Liste dieser
 * Pfade. Ergebnis ist dieselbe Struktur, in der jedes geteilte Dokument nur
 * noch EINMAL vorkommt — unter dem Pfad seiner Kopf-Datei und mit dem
 * zusammengesetzten Text.
 *
 * Damit stimmen drei Dinge auf einen Schlag: der Name in der Trefferliste, die
 * Zahl der gefundenen Dateien, und die Lage der Fundstelle im Dokument, das
 * der Sprung öffnet.
 *
 * Ein Teil OHNE seine Kopf-Datei (sie liegt außerhalb des Bereichs oder fehlt)
 * bleibt als eigener Eintrag stehen: Seinen Text zu unterschlagen hieße,
 * Treffer verschwinden zu lassen, und das wäre schlimmer als ein technisch
 * anmutender Name in der Liste.
 */
function fasseTeileZusammen(vorrat) {
  if (!vorrat || !vorrat.texte || !Array.isArray(vorrat.reihenfolge)) return vorrat;
  // Erst sammeln: je Kopf-Pfad die Teile mit ihrer Position.
  const gruppen = new Map();
  let gefunden = false;
  for (const rel of vorrat.reihenfolge) {
    const kopf = kopfRelPfad(rel);
    if (kopf === rel) continue;
    if (!vorrat.texte.has(kopf)) continue; // Kopf-Datei nicht im Bereich
    gefunden = true;
    if (!gruppen.has(kopf)) gruppen.set(kopf, []);
    const basename = rel.slice(rel.lastIndexOf('/') + 1).replace(EXT_RE, '');
    gruppen.get(kopf).push({ rel, index: parsePartBasename(basename).index });
  }
  // Der Regelfall ist ein Bereich ganz ohne geteilte Dokumente. Er darf nichts
  // kosten: keine neue Map, keine Kopie der Reihenfolge.
  if (!gefunden) return vorrat;

  const texte = new Map(vorrat.texte);
  const entfallen = new Set();
  for (const [kopf, teile] of gruppen) {
    teile.sort((a, b) => a.index - b.index);
    const stuecke = [{ index: 1, content: (texte.get(kopf) || {}).text || '' }];
    for (const t of teile) {
      stuecke.push({ index: t.index, content: (texte.get(t.rel) || {}).text || '' });
      entfallen.add(t.rel);
    }
    const bisher = texte.get(kopf) || {};
    texte.set(kopf, { ...bisher, text: assembleParts(stuecke).text });
  }
  for (const rel of entfallen) texte.delete(rel);

  return {
    ...vorrat,
    texte,
    reihenfolge: vorrat.reihenfolge.filter((rel) => !entfallen.has(rel)),
  };
}

/**
 * Der absolute Pfad der Kopf-Datei zu einem absoluten Pfad (Direkt-Weg).
 *
 * Oberhalb des Speicher-Deckels hält die Suche keinen Vorrat und liest je
 * Lauf von der Platte; die Texte dort zusammenzusetzen hieße, die Teile über
 * die Lese-Wellen hinweg zusammenzuhalten. Dort wird deshalb nur der NAME auf
 * die Kopf-Datei gezogen: Der Treffer erscheint unter dem richtigen Dokument
 * und der Sprung öffnet es auch (der Lese-Weg setzt es zusammen, und die
 * Fundstelle wird im geöffneten Dokument neu markiert). Was dort fehlt, ist
 * allein die Zusammenfassung mehrerer Teile zu einer Gruppe.
 */
function kopfAbsPfad(abs) {
  const parsed = path.parse(abs);
  if (!parsePartBasename(parsed.name)) return abs;
  return path.join(parsed.dir, baseBasenameOf(parsed.name) + parsed.ext);
}

module.exports = { kopfRelPfad, kopfAbsPfad, fasseTeileZusammen };
