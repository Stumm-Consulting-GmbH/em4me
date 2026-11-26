// 4T-002782 (Epic 3E-000392, Story 4S-001162): Verweise ohne Ziel eines
// Bereichs, erhoben am gespeicherten Stand des Index.
//
// Zweck: Die Bereichs-Statistik listet jeden Verweis, dessen Dokument,
// Überschrift oder Block-Anker es nicht gibt, mit Dokument, Zeile, Wortlaut und
// einer Grund-Kennung. Dieses Modul ist der Kern des Urteils (V1 bis V3 des
// Epics); die Verweise in verknüpfte Bereiche beurteilt es nicht selbst,
// sondern gibt sie gesammelt zurück, weil ihr Urteil den anderen Bereich lesen
// muss und asynchron läuft (area-stats.js, V8).
//
// **Ein Urteil, kein zweiter Auflösungs-Weg.** Wiki-Verweise, Einbettungen und
// die Treffer aus Canvas-Karten, Diagramm-Angaben und Dashboard-Kacheln laufen
// über urteileWikiZiele, den Kern der Editor-Prüfung (resolve.js), mit dem Ziel
// in der Form, die der Editor bildet (Ziel samt Anker). Was der Kern als
// vorhanden führt, hat ein Ziel, auch ein mehrdeutiger Name (L2) und ein
// mehrdeutiger oder verdeckter Datensatz-Anker (L6 Punkt 7, Nachweis 1a). Die
// Grenzprüfung «außerhalb des Bereichs» rechnet wie die Editor-Regel: Ziel ohne
// Endung mit `.md`, vom Ordner des Dokuments aus; die relativen
// Unterseiten-Formen verlassen den Bereich bauartbedingt nicht.
//
// **Nicht beurteilt** werden:
//
// - Ziele mit einem Vorlagen-Platzhalter in doppelten geschweiften Klammern
//   (L6 Punkt 3, Nachweis 1b).
// - Ziele auf Anlagen (L1 = A, L6 Punkt 9): Sie gehören der Anlagen-Pflege.
//   Als Anlage gilt ein Ziel, dessen Endung die Wiki-Einbettung als Anlagen-Art
//   führt (Bild oder PDF) oder die im Bereich an mindestens einer
//   Nicht-Markdown-Datei vorkommt. Ein Ziel mit einer anderen Endung, etwa
//   `[[Version 1.2]]`, wird wie im Editor als Dokument beurteilt. Für Verweise
//   in verknüpfte Bereiche gilt jede Endung, die keine Markdown-Endung ist, als
//   Anlage, weil die Auflösung dort nur Markdown-Dateien sucht.
//   Markdown-Verweise auf Anlagen führt der Index nicht.
// - Bei ausgeschalteter Erweiterung die Treffer, die ohne sie gewöhnlicher Text
//   oder Code sind (L6 Punkt 5, Nachweis 1e, und seine Folge-Festlegung aus
//   dem Zweitblick zu 4T-002782): die Wiki-Verweise ohne «Wiki-Verweise»,
//   Canvas-Karten ohne «Canvas», Dashboard-Kacheln ohne «Dashboard»,
//   Diagramm-Angaben ohne «Diagramme» und Verweise jeder Art in Text-Zellen
//   einer Datentabelle ohne «Datentabelle». Der Index führt sie unabhängig vom
//   Schalter, also lässt die Erhebung sie selbst aus. Markdown-Verweise hängen
//   an keinem Schalter. Web-Adressen und Verweise in Code führt der Index nicht.
//
// **Geteilte Dokumente** urteilt die Erhebung wie die Editor-Prüfung, die das
// Dokument zusammengesetzt unter dem Pfad der Kopf-Datei prüft: Bezugs-Datei
// eines Folgeteils ist seine Kopf-Datei, für Anker im selben Dokument wie für
// die relativen Unterseiten-Formen.
//
// Gespeichert und geschrieben wird nichts (L6 Punkt 8).
'use strict';

const path = require('node:path');
const { SUBPAGE_SEP, isRelativeTarget, expandRelativeTarget } = require('../../shared/subpages.js');
const {
  MD_EXT_RE,
  createWikiLinkRegex,
  createMdLinkRegex,
  mdLinkTargetFromMatch,
} = require('../../shared/markdown/link-scan.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { isInsideArea } = require('../area/area-path.js');
const { urteileWikiZiele, anchorExistsInFile } = require('./resolve.js');
const { logicalNameFor } = require('./link-graph.js');
const { kopfDateiFuer } = require('./part-files.js');
const { BILD_ENDUNGEN, bildEndungVon } = require('../../shared/bild-endungen.js');

// Grund-Kennungen eines Eintrags. Die Texte dazu entstehen in der Anzeige
// (4T-002783, V10); die Kennungen sind die Schnittstelle.
const GRUND = Object.freeze({
  DOKUMENT_FEHLT: 'dokument-fehlt',
  UEBERSCHRIFT_FEHLT: 'ueberschrift-fehlt',
  BLOCK_ANKER_FEHLT: 'block-anker-fehlt',
  AUSSERHALB: 'ausserhalb-bereich',
  VERKNUEPFT_NICHT_GEFUNDEN: 'verknuepft-nicht-gefunden',
  VERKNUEPFUNG_NICHT_NUTZBAR: 'verknuepfung-nicht-nutzbar',
});

const PLATZHALTER_RE = /\{\{[^{}]*\}\}/;
const ABFRAGE_RE = /abfrage=(?:"[^"]*"|\S+)/;
// Endung eines Ziels wie in der Editor-Regel (outsideAreaLink) und der
// Bild-Erkennung (`bildEndungVon`, src/shared/bild-endungen.js).
const ENDUNG_RE = /\.[a-z0-9]+$/i;

function hatPlatzhalter(...teile) {
  return teile.some((t) => typeof t === 'string' && PLATZHALTER_RE.test(t));
}

// Endungen, die die Wiki-Einbettung als eigene Anlagen-Art führt: Bild und PDF
// (src/shared/markdown/plugins/wiki.js). Kleinschreibung ohne Punkt.
const EINBETTUNGS_ANLAGEN = new Set([...BILD_ENDUNGEN, 'pdf']);

// Die Anlagen-Endungen einer Erhebung (Zweitblick Runde 2, Befund 3): die der
// Wiki-Einbettung, vereinigt mit jeder Endung, die im Bereich an einer
// Nicht-Markdown-Datei vorkommt. Das ist die Anlagen-Trennung des Index
// (scan.js, MD_EXT_RE), angewandt auf die vorhandenen Dateien; eine fehlende
// Anlage steht selbst nicht in der Zuordnung, wohl aber ihre Art.
function anlagenEndungen(entry) {
  const endungen = new Set(EINBETTUNGS_ANLAGEN);
  for (const set of entry.assetNameMap ? entry.assetNameMap.values() : []) {
    for (const datei of set) {
      const endung = bildEndungVon(path.basename(datei));
      if (endung) endungen.add(endung);
    }
  }
  return endungen;
}

// Zielt der Verweis auf eine Anlage? Seine Endung gehört zu den
// Anlagen-Endungen der Erhebung. Ein Ziel mit einer anderen Endung, etwa
// `[[Version 1.2]]`, beurteilt die Erhebung wie der Editor als Dokument.
function istAnlagenZiel(ziel, endungen) {
  if (typeof ziel !== 'string' || MD_EXT_RE.test(ziel)) return false;
  const endung = bildEndungVon(ziel);
  return endung !== '' && endungen.has(endung);
}

// Zielt ein Verweis in einen verknüpften Bereich auf eine Anlage? Dort gilt
// jede Endung, die keine Markdown-Endung ist (Zweitblick Runde 3, Befund 2):
// Die Auflösung im verknüpften Bereich findet über die Namens-Suche nur
// Markdown-Dateien (`sucheNachName`, src/main/area/area-link-resolve.js), und
// die Endungen des eigenen Bereichs sagen über den anderen nichts. Ein
// vorhandener Anhang dort stünde sonst als «nicht gefunden» in der Liste.
function istVerknuepftesAnlagenZiel(ziel) {
  return typeof ziel === 'string' && ENDUNG_RE.test(ziel) && !MD_EXT_RE.test(ziel);
}

function ankerGrund(anker) {
  return String(anker).startsWith('^') ? GRUND.BLOCK_ANKER_FEHLT : GRUND.UEBERSCHRIFT_FEHLT;
}

// Der Anker eines Markdown-Verweises kann prozent-kodiert sein; ungültige
// Kodierung bleibt roh.
function dekodiert(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// Ein Pfad-Ziel dekodiert wie der Parser (Markdown-Treffer) und die
// Editor-Regel (`resolveLocalTarget`): mit decodeURI, ungültig bleibt roh.
function dekodierterPfad(text) {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

// Herkunft eines Verweises aus einem schaltbaren Block, nach der Zeile (Feld
// `blockVerweise` des Parsers): 'kachel', 'diagramm', 'datentabelle' oder
// undefined. Die Canvas-Karte trägt ihre Herkunft im eigenen Treffer-Typ.
function blockHerkunft(blockZeilen, verweis) {
  return verweis.linkTyp === 'canvas' ? undefined : blockZeilen.get(verweis.zeile);
}

// Ist die Block-Erweiterung, aus der der Verweis stammt, eingeschaltet? Ohne
// Block-Herkunft hängt er an keiner von ihnen.
function blockAktiv(herkunft, schalter) {
  if (herkunft === 'kachel') return schalter.dashboard;
  if (herkunft === 'diagramm') return schalter.diagramme;
  if (herkunft === 'datentabelle') return schalter.datentabelle;
  return true;
}

// Steht der Treffer in doppelten eckigen Klammern? Alle Wiki-Treffer außer der
// Kachel (die Diagramm-Angabe `table: [[…]]` steht darin); die Canvas-Karte
// trägt ihren eigenen Typ.
function inWikiKlammern(treffer, herkunft) {
  return treffer.linkTyp === 'wiki' && herkunft !== 'kachel';
}

// Ist die Erweiterung, ohne die der Treffer gewöhnlicher Text oder Code ist,
// eingeschaltet?
function trefferAktiv(treffer, herkunft, schalter) {
  if (treffer.linkTyp === 'canvas') return schalter.canvas;
  if (!blockAktiv(herkunft, schalter)) return false;
  return schalter.wiki || !inWikiKlammern(treffer, herkunft);
}

function zielMitAnker(ziel, anker) {
  return anker ? `${ziel}#${anker}` : ziel;
}

// Wortlaut eines Wiki-Treffers: im Ausschnitt gesucht, sonst aus Ziel und
// Anker zurückgebildet (der Ausschnitt ist auf 120 Zeichen gekürzt, und die
// Canvas-Karte zeigt ihre Beschriftung). `rang` wählt unter mehreren passenden
// Stellen derselben Zeile die so vielte (ab 0).
function wikiWortlaut(treffer, pfad, herkunft, rang = 0) {
  const snippet = treffer.snippet || '';
  if (treffer.linkTyp === 'canvas')
    return `doc="${zielMitAnker(treffer.zielBasename, treffer.anker)}"`;
  if (herkunft === 'kachel') {
    const m = ABFRAGE_RE.exec(snippet);
    return m ? m[0] : `abfrage="${zielMitAnker(treffer.zielBasename, treffer.anker)}"`;
  }
  const eigenerName = path.basename(pfad).replace(MD_EXT_RE, '');
  const re = createWikiLinkRegex();
  let gefunden = 0;
  let m;
  while ((m = re.exec(snippet)) !== null) {
    const roh = m[1].trim().replace(/\\$/, '');
    const idx = roh.indexOf('#');
    const ziel = (idx >= 0 ? roh.slice(0, idx) : roh).trim();
    const anker = idx >= 0 ? roh.slice(idx + 1).trim() || null : null;
    if (anker !== treffer.anker) continue;
    const passt =
      ziel === treffer.zielBasename ||
      (isRelativeTarget(ziel) && expandRelativeTarget(eigenerName, ziel) === treffer.zielBasename);
    if (passt && gefunden++ === rang) return (snippet[m.index - 1] === '!' ? '!' : '') + m[0];
  }
  return `[[${zielMitAnker(treffer.zielBasename, treffer.anker)}]]`;
}

function mdWortlaut(treffer, pfad, rang = 0) {
  const snippet = treffer.snippet || '';
  const ordner = path.dirname(pfad);
  const gesucht = pathCompareKey(treffer.zielAbsolut);
  const re = createMdLinkRegex();
  let gefunden = 0;
  let m;
  while ((m = re.exec(snippet)) !== null) {
    const { target, anchor } = mdLinkTargetFromMatch(m);
    if ((anchor || null) !== (treffer.anker || null)) continue;
    let absolut;
    try {
      absolut = path.resolve(ordner, dekodierterPfad(target));
    } catch {
      continue;
    }
    if (pathCompareKey(absolut) === gesucht && gefunden++ === rang) return m[0];
  }
  const rel = path.relative(ordner, treffer.zielAbsolut).split(path.sep).join('/');
  return `[…](${zielMitAnker(rel, treffer.anker)})`;
}

// Grenzprüfung eines Wiki-Ziels wie die Editor-Regel outsideAreaLink
// (Endung wie dort, Dekodierung wie `resolveLocalTarget`).
function wikiAusserhalb(wurzel, pfad, ziel) {
  if (!ziel || isRelativeTarget(ziel)) return false;
  const mitEndung = ENDUNG_RE.test(ziel) ? ziel : `${ziel}.md`;
  let absolut;
  try {
    absolut = path.resolve(path.dirname(pfad), dekodierterPfad(mitEndung));
  } catch {
    return false;
  }
  return !isInsideArea(wurzel, absolut);
}

// Ziel eines Wiki-Treffers, wie die Editor-Prüfung es für das Dokument bildet.
// Ein Folgeteil eines geteilten Dokuments hat die relative Unterseiten-Form
// `[[/Name]]` im Parser gegen den eigenen Dateinamen aufgelöst; der Editor
// löst sie gegen die Kopf-Datei auf, unter deren Pfad er das Dokument prüft.
// Die Eltern-Form `[[..]]` ergibt für beide dasselbe.
function zielFuerUrteil(treffer, teilPraefix, kopfPraefix) {
  const ziel = treffer.zielBasename;
  if (teilPraefix && typeof ziel === 'string' && ziel.startsWith(teilPraefix)) {
    return kopfPraefix + ziel.slice(teilPraefix.length);
  }
  return ziel;
}

// Urteil über die Wiki-Treffer eines Dokuments: ein Aufruf des Kerns je
// Dokument mit allen Zielen. `bezug` ist die Datei, für die der Editor urteilt
// (bei einem Folgeteil die Kopf-Datei). Liefert je Treffer eine Grund-Kennung
// oder null.
function urteileWikiTreffer(entry, wurzel, pfad, bezug, treffer) {
  let teilPraefix = null;
  let kopfPraefix = null;
  if (bezug !== pfad) {
    teilPraefix = path.basename(pfad).replace(MD_EXT_RE, '') + SUBPAGE_SEP;
    kopfPraefix = path.basename(bezug).replace(MD_EXT_RE, '') + SUBPAGE_SEP;
  }
  const zielVon = (t) => zielMitAnker(zielFuerUrteil(t, teilPraefix, kopfPraefix), t.anker);
  const ziele = [...new Set(treffer.map(zielVon))];
  const r = urteileWikiZiele(entry, bezug, ziele);
  const vorhanden = new Set([...r.existing, ...r.ambiguous]);
  const ankerFehlt = new Set(r.brokenAnchor);
  return treffer.map((t) => {
    if (wikiAusserhalb(wurzel, bezug, t.zielBasename)) return GRUND.AUSSERHALB;
    const ziel = zielVon(t);
    if (vorhanden.has(ziel)) return null;
    if (ankerFehlt.has(ziel)) return ankerGrund(t.anker);
    return GRUND.DOKUMENT_FEHLT;
  });
}

// Urteil über einen Markdown-Treffer: über den absoluten Pfad wie der Klick.
function urteileMdTreffer(entry, wurzel, indexPfade, treffer) {
  if (!isInsideArea(wurzel, treffer.zielAbsolut)) return GRUND.AUSSERHALB;
  const zielPfad = indexPfade.get(pathCompareKey(treffer.zielAbsolut));
  if (!zielPfad) return GRUND.DOKUMENT_FEHLT;
  if (!treffer.anker) return null;
  const anker = dekodiert(treffer.anker);
  return anchorExistsInFile(entry, zielPfad, anker) ? null : ankerGrund(anker);
}

/**
 * Erhebt die Verweise ohne Ziel eines Index-Eintrags (synchron, Index-Anteil).
 *
 * @param {object} entry Index-Eintrag einer Wurzel im Status 'ready'.
 * @param {object} [optionen]
 * @param {boolean} [optionen.wikiVerweiseAktiv=true] Schalter der Erweiterung
 *   der Wiki-Verweise; aus, werden deren Schreibweisen nicht beurteilt.
 * @param {boolean} [optionen.canvasAktiv=true] Schalter der Erweiterung
 *   «Canvas»; aus, werden Canvas-Karten nicht beurteilt.
 * @param {boolean} [optionen.dashboardAktiv=true] Schalter der Erweiterung
 *   «Dashboard»; aus, werden Dashboard-Kacheln nicht beurteilt.
 * @param {boolean} [optionen.diagrammeAktiv=true] Schalter der Erweiterung der
 *   Diagramme zu einer Datentabelle; aus, werden ihre Angaben `table:` nicht
 *   beurteilt.
 * @param {boolean} [optionen.datentabelleAktiv=true] Schalter der Erweiterung
 *   der Datentabelle; aus, werden Verweise in ihren Text-Zellen nicht
 *   beurteilt.
 * @returns {{eintraege: Array, verknuepfungen: Array}} `eintraege` je Verweis
 *   ohne Ziel `{pfad, name, zeile, verweis, grund}`, unsortiert;
 *   `verknuepfungen` je Verweis in einen verknüpften Bereich
 *   `{pfad, name, zeile, verweis, prefix, ziel}` zur Beurteilung durch den
 *   Aufrufer.
 */
function erhebeVerweiseOhneZiel(entry, optionen = {}) {
  const schalter = {
    wiki: optionen.wikiVerweiseAktiv !== false,
    canvas: optionen.canvasAktiv !== false,
    dashboard: optionen.dashboardAktiv !== false,
    diagramme: optionen.diagrammeAktiv !== false,
    datentabelle: optionen.datentabelleAktiv !== false,
  };
  const wurzel = entry.wurzel;
  const pruef = entry.pruefVerweisePerFile || new Map();
  const anlagen = anlagenEndungen(entry);
  const eintraege = [];
  const verknuepfungen = [];
  const indexPfade = new Map();
  for (const p of entry.files.keys()) indexPfade.set(pathCompareKey(p), p);

  for (const [pfad, alle] of entry.files) {
    const kopf = { pfad, name: logicalNameFor(pfad) };
    const bezug = kopfDateiFuer(pfad) || pfad;
    const felder = pruef.get(pfad);
    const blockZeilen = new Map(((felder && felder.block) || []).map((b) => [b.zeile, b.art]));
    // Erst die Wiki-Treffer gesammelt beurteilen (ein Aufruf des Kerns je
    // Dokument), dann alle Treffer in ihrer Reihenfolge im Dokument ausgeben.
    const wiki = alle.filter(
      (t) =>
        t.linkTyp !== 'md' &&
        trefferAktiv(t, blockHerkunft(blockZeilen, t), schalter) &&
        !istAnlagenZiel(t.zielBasename, anlagen) &&
        !hatPlatzhalter(t.zielBasename, t.anker),
    );
    const wikiGruende = new Map();
    if (wiki.length > 0) {
      const gruende = urteileWikiTreffer(entry, wurzel, pfad, bezug, wiki);
      wiki.forEach((t, i) => wikiGruende.set(t, gruende[i]));
    }
    // Rang eines Treffers unter den gleichen Zielen seiner Zeile: Stehen etwa
    // `[[X]]` und `![[X]]` in einer Zeile, gehört zum zweiten Treffer der
    // zweite passende Wortlaut im Ausschnitt, nicht der erste. Das Ziel steht
    // im Schlüssel so, wie die Wortlaut-Suche vergleicht (Markdown-Ziele über
    // `pathCompareKey`, Wiki-Ziele genau).
    const raenge = new Map();
    for (const t of alle) {
      const istMd = t.linkTyp === 'md';
      const zielSchluessel = istMd
        ? pathCompareKey(t.zielAbsolut || '')
        : t.zielBasename || t.zielAbsolut;
      const schluessel = [t.linkTyp, t.zeile, zielSchluessel, t.anker].join('|');
      const rang = raenge.get(schluessel) || 0;
      raenge.set(schluessel, rang + 1);
      if (istMd && hatPlatzhalter(t.zielAbsolut, t.anker)) continue;
      if (istMd && !blockAktiv(blockHerkunft(blockZeilen, t), schalter)) continue;
      const grund = istMd
        ? urteileMdTreffer(entry, wurzel, indexPfade, t)
        : wikiGruende.get(t) || null;
      if (!grund) continue;
      const verweis = istMd
        ? mdWortlaut(t, pfad, rang)
        : wikiWortlaut(t, pfad, blockHerkunft(blockZeilen, t), rang);
      eintraege.push({ ...kopf, zeile: t.zeile, verweis, grund });
    }
  }

  // Die zwei eigenen Felder des Parsers: Anker im selben Dokument und Verweise
  // in verknüpfte Bereiche (nur Dateien mit Einträgen). Ein Anker im selben
  // Dokument gilt bei einem Folgeteil für die Kopf-Datei, wie im Editor.
  for (const [pfad, felder] of pruef) {
    if (!entry.files.has(pfad)) continue;
    const kopf = { pfad, name: logicalNameFor(pfad) };
    const bezug = kopfDateiFuer(pfad) || pfad;
    const blockZeilen = new Map((felder.block || []).map((b) => [b.zeile, b.art]));
    const ausBlock = (v) => !blockAktiv(blockHerkunft(blockZeilen, v), schalter);
    for (const v of felder.eigenAnker || []) {
      if (!schalter.wiki && v.art === 'wiki') continue;
      if (ausBlock(v)) continue;
      if (hatPlatzhalter(v.anker)) continue;
      const anker = v.art === 'md' ? dekodiert(v.anker) : v.anker;
      if (anchorExistsInFile(entry, bezug, anker)) continue;
      eintraege.push({ ...kopf, zeile: v.zeile, verweis: v.wortlaut, grund: ankerGrund(anker) });
    }
    if (!schalter.wiki) continue;
    for (const v of felder.verknuepft || []) {
      if (hatPlatzhalter(v.ziel)) continue;
      if (istVerknuepftesAnlagenZiel(String(v.ziel).split('#')[0].trim())) continue;
      if (ausBlock(v)) continue;
      verknuepfungen.push({
        ...kopf,
        zeile: v.zeile,
        verweis: v.wortlaut,
        prefix: v.prefix,
        ziel: v.ziel,
      });
    }
  }
  return { eintraege, verknuepfungen };
}

// Sortierung der Liste: nach Dokument (Name), dann Pfad, dann Zeile; die
// Reihenfolge innerhalb einer Zeile bleibt die der Erhebung (stabil).
function sortiereVerweiseOhneZiel(eintraege) {
  return eintraege.sort(
    (a, b) => a.name.localeCompare(b.name) || a.pfad.localeCompare(b.pfad) || a.zeile - b.zeile,
  );
}

module.exports = { GRUND, erhebeVerweiseOhneZiel, sortiereVerweiseOhneZiel };
