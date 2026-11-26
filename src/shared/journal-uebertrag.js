// 4T-002737 (Epic 3E-000396): Kern des Übertrags offener Aufgaben aus dem
// jüngsten früheren Journal-Eintrag in den Eintrag der Ziel-Periode.
//
// Reine Text-Operation auf zwei Texten, ohne Datei-Zugriff, ohne Uhr, ohne
// Electron und ohne DOM (CJS, Muster src/shared/journal-nachpflege.js):
// dieselbe Eingabe ergibt dieselbe Ausgabe. Der Kanal im Hauptprozess liest
// und schreibt die beiden Dateien; hier wird allein geplant, was in beiden
// Texten danach steht.
//
// Die Regeln stehen im Epic (V2 offen, V3 Einheit, V5 Einsetzen, V10
// Doppel-Schutz, V11 Marker, V16 Grenzen, J7 die zwölf Festlegungen):
// - Wurzel ist jede offene Aufgabe, über der in ihrer Liste keine offene
//   Aufgabe steht; sie wandert mit ihrem ganzen Teilbaum nach `subtreeRange`.
// - Eingesetzt wird unter der gleichnamigen Überschrift des Ziels (erste bei
//   mehreren), sonst unter einer am Ende angelegten Überschrift; Aufgaben ohne
//   Überschrift kommen an das Ende.
// - In der Quelle wird der Block gekennzeichnet (Status-Zeichen «Übertragen»)
//   oder entfernt.
// - Zeilenenden, Byte-Order-Marke, Text-Ende und Kopf-Block bleiben.
//
// Es gibt keinen zweiten Aufgaben- oder Listen-Leser: Aufgaben erkennt
// task-markers.js, Teilbäume und Listen-Blöcke list-outline.js, Zäune
// fence-level.js nach der Regel des Bereichs-Index (src/main/index/parse.js),
// Überschriften das Muster aus heading-sections.js, den Kopf-Block
// link-scan.js.
'use strict';

const {
  isTaskLine,
  parseTaskLine,
  setStatusChar,
  serializeTaskLine,
} = require('./tasks/task-markers.js');
const {
  parseListLine,
  scanListBlock,
  subtreeRange,
  fencedLines,
} = require('./markdown/list-outline.js');
const { zaunOeffnung, schliesstZaun } = require('./markdown/fence-level.js');
const { HEADING_RE } = require('./markdown/heading-sections.js');
const { frontmatterBodyStart } = require('./markdown/link-scan.js');

const BOM = String.fromCharCode(0xfeff);
const OFFENE_TYPEN = new Set(['TODO', 'IN_PROGRESS', 'ON_HOLD']);
const VORGABE_ZEICHEN = '»';
const VORGABE_MAX_WURZELN = 500;

// --- Zeilen ------------------------------------------------------------------

// Zerlegt einen Text in Byte-Order-Marke, Zeilen ohne Zeilenende und das
// Zeilenende jeder Zeile ('\n', '\r\n' oder '' bei der letzten Zeile eines
// Textes ohne Schluss-Umbruch). Ein leerer Text hat keine Zeile.
function zerlegeZeilen(text) {
  let rest = String(text == null ? '' : text);
  const bom = rest.startsWith(BOM) ? BOM : '';
  if (bom) rest = rest.slice(1);
  const zeilen = [];
  const enden = [];
  const umbruch = /\r\n|\n/g;
  let pos = 0;
  let m;
  while ((m = umbruch.exec(rest)) !== null) {
    zeilen.push(rest.slice(pos, m.index));
    enden.push(m[0]);
    pos = umbruch.lastIndex;
  }
  if (pos < rest.length) {
    zeilen.push(rest.slice(pos));
    enden.push('');
  }
  return { bom, zeilen, enden };
}

function setzeZusammen(teile) {
  let out = teile.bom;
  for (let i = 0; i < teile.zeilen.length; i++) out += teile.zeilen[i] + teile.enden[i];
  return out;
}

function istLeer(zeile) {
  return String(zeile).trim() === '';
}

function fuehrenderLeerraum(zeile) {
  return /^[ \t]*/.exec(zeile)[0];
}

// --- Zäune, Kopf-Block, Überschriften ----------------------------------------

// Maske der Zeilen in Code-Zäunen. Zwei Quellen, vereinigt: die Zaun-Regel des
// Bereichs-Index (fence-level.js, bis drei Leerzeichen Einrückung, gelesen ab
// dem Ende des Kopf-Blocks wie in parse.js) und die eingerückten Zäune unter
// einem Listenpunkt aus list-outline.js (`fencedLines`), die der Index bei
// mehr als drei Leerzeichen nicht sieht. Was eine der beiden für Code hält,
// ist weder Aufgabe noch Überschrift.
function codeMaske(zeilen, ab) {
  const maske = fencedLines(zeilen).map(Boolean);
  let offen = null;
  for (let i = ab; i < zeilen.length; i++) {
    const zaun = zaunOeffnung(zeilen[i]);
    if (offen) {
      maske[i] = true;
      if (zaun && schliesstZaun(zeilen[i], offen)) offen = null;
      continue;
    }
    if (zaun) {
      offen = zaun;
      maske[i] = true;
    }
  }
  return maske;
}

// Vergleichs-Form eines Überschriften-Texts: ohne Rand-Leerraum, ohne
// Unterschied von Groß- und Kleinschreibung.
function normiereUeberschrift(text) {
  return String(text == null ? '' : text)
    .trim()
    .toLowerCase();
}

// Alle ATX-Überschriften ab `ab` außerhalb von Zäunen: Zeilen-Index, Ebene,
// Vergleichs-Name und Roh-Zeile. Das Muster ist das des Bereichs-Index
// (HEADING_RE: Rauten am Zeilenanfang, schließende Rauten fallen weg).
function sammleUeberschriften(zeilen, ab, maske) {
  const liste = [];
  for (let i = ab; i < zeilen.length; i++) {
    if (maske[i]) continue;
    const m = HEADING_RE.exec(zeilen[i]);
    if (!m) continue;
    liste.push({
      index: i,
      ebene: /^#+/.exec(zeilen[i])[0].length,
      name: normiereUeberschrift(m[1]),
      zeile: zeilen[i],
    });
  }
  return liste;
}

// Aufbereiteter Text: Zeilen, Kopf-Block-Ende, Code-Maske, Überschriften.
function bereite(text) {
  const teile = zerlegeZeilen(text);
  const ab = frontmatterBodyStart(teile.zeilen);
  const maske = codeMaske(teile.zeilen, ab);
  return { ...teile, ab, maske, ueberschriften: sammleUeberschriften(teile.zeilen, ab, maske) };
}

// --- Offene Aufgaben und Wurzeln ---------------------------------------------

// Ist die Zeile eine offene Aufgabe? Aufgabe nach dem Global Filter; offen bei
// Typ TODO, IN_PROGRESS oder ON_HOLD oder bei einem Zeichen ohne Status-
// Bedeutung (Typ null). Das Zeichen des Status «Übertragen» ist nie offen,
// gleich welchen Typ die Einstellungen ihm geben.
function istOffen(zeile, umgebung) {
  if (!isTaskLine(zeile, umgebung.globalFilter)) return false;
  const zeichen = parseTaskLine(zeile).statusChar;
  if (zeichen === umgebung.zeichen) return false;
  const typ = umgebung.statusTypeOf(zeichen);
  return typ == null || OFFENE_TYPEN.has(typ);
}

// Wurzeln der Quelle von oben nach unten: die erste offene Aufgabe außerhalb
// eines schon erfassten Blocks, ihr Block ist ihr Teilbaum. Jede Wurzel trägt
// ihren Block (von, bis) und die nächste Überschrift über ihr (oder null).
function sammleWurzeln(quelle, umgebung) {
  const { zeilen, ab, maske } = quelle;
  const opts = { isCode: (i) => !!maske[i] };
  const wurzeln = [];
  let ueberschrift = null;
  let naechste = 0;
  for (let i = ab; i < zeilen.length; i++) {
    while (naechste < quelle.ueberschriften.length && quelle.ueberschriften[naechste].index <= i) {
      ueberschrift = quelle.ueberschriften[naechste];
      naechste++;
    }
    if (maske[i] || !istOffen(zeilen[i], umgebung)) continue;
    // AUSLEGUNG: Eine Aufgaben-Zeile, die list-outline.js nicht als
    // Listenpunkt kennt (Trenner «1)»), hat keinen Teilbaum; ihr Block ist
    // allein sie selbst.
    const bereich = subtreeRange(zeilen, i, opts) || { from: i, to: i };
    wurzeln.push({ von: i, bis: bereich.to, ueberschrift });
    i = bereich.to;
  }
  return wurzeln;
}

// Liegt die Überschrift im gewählten Abschnitt? Abschnitt ist jede
// Überschrift des Namens samt ihren Unter-Überschriften (tiefere Ebene, bevor
// eine Überschrift gleicher oder höherer Ebene folgt).
function ueberschriftenImAbschnitt(ueberschriften, name) {
  const drin = new Set();
  let ebene = null;
  for (const u of ueberschriften) {
    if (ebene !== null && u.ebene <= ebene) ebene = null;
    if (ebene === null && u.name === name) ebene = u.ebene;
    if (ebene !== null) drin.add(u.index);
  }
  return drin;
}

// --- Block-Form im Ziel ------------------------------------------------------

// Die Zeilen eines Blocks ohne die Einrückung der Wurzel.
function blockZeilen(zeilen, wurzel) {
  const einzug = fuehrenderLeerraum(zeilen[wurzel.von]);
  const out = [];
  for (let i = wurzel.von; i <= wurzel.bis; i++) {
    const zeile = zeilen[i];
    if (zeile.startsWith(einzug)) {
      out.push(zeile.slice(einzug.length));
    } else {
      // AUSLEGUNG: Beginnt eine Folgezeile nicht mit genau der Einrückung der
      // Wurzel (Mischung aus Tabulator und Leerzeichen oder weniger
      // eingerückt), verliert sie so viele führende Leerraum-Zeichen, wie die
      // Wurzel hat, höchstens ihre eigenen.
      const weg = Math.min(einzug.length, fuehrenderLeerraum(zeile).length);
      out.push(zeile.slice(weg));
    }
  }
  return out;
}

// --- Einsetzen ins Ziel ------------------------------------------------------

// Ist Zeile j des Ziels ein Listenpunkt oder die Fortsetzung eines solchen?
function istListeOderFortsetzung(ziel, j) {
  const { zeilen, maske, ab } = ziel;
  const opts = { isCode: (i) => !!maske[i] };
  for (let i = j; i >= ab; i--) {
    const zeile = zeilen[i];
    if (!maske[i] && parseListLine(zeile)) {
      const block = scanListBlock(zeilen, i, opts);
      return !!block && block.to >= j;
    }
    if (maske[i]) continue;
    if (istLeer(zeile) || fuehrenderLeerraum(zeile) === '') return false;
  }
  return false;
}

// Letzte nicht leere Zeile in [von, bis], sonst -1.
function letzteNichtLeere(zeilen, von, bis) {
  for (let i = bis; i >= von; i--) if (!istLeer(zeilen[i])) return i;
  return -1;
}

// Zeilen des Ziels ohne führenden Leerraum in [von, bis), außerhalb von Zäunen.
function zeilenMenge(ziel, von, bis) {
  const menge = new Set();
  for (let i = von; i < bis; i++) {
    if (!ziel.maske[i]) menge.add(ziel.zeilen[i].replace(/^[ \t]+/, ''));
  }
  return menge;
}

// Abschnitt einer Ziel-Überschrift: von ihr bis vor die nächste Überschrift.
function abschnittEnde(ziel, u) {
  const naechste = ziel.ueberschriften.find((x) => x.index > u.index);
  return naechste ? naechste.index : ziel.zeilen.length;
}

// Gruppiert die Wurzeln nach dem Namen ihrer Überschrift (null: ohne) in der
// Reihenfolge des ersten Auftretens und wendet den Doppel-Schutz an.
function bildeGruppen(quelle, ziel, wurzeln) {
  const gruppen = new Map();
  const vorErster = ziel.ueberschriften.length ? ziel.ueberschriften[0].index : ziel.zeilen.length;
  let eingesetzt = 0;
  for (const w of wurzeln) {
    const name = w.ueberschrift ? w.ueberschrift.name : null;
    if (!gruppen.has(name)) {
      const imZiel = name === null ? null : ziel.ueberschriften.find((u) => u.name === name);
      // AUSLEGUNG: Der Doppel-Schutz vergleicht nur mit dem Abschnitt der
      // ersten gleichnamigen Ziel-Überschrift (dort wird auch eingesetzt) und
      // nur mit Zeilen außerhalb von Zäunen; im Zweifel wird eingesetzt.
      let vorhanden = null;
      if (name === null) vorhanden = zeilenMenge(ziel, ziel.ab, vorErster);
      else if (imZiel) vorhanden = zeilenMenge(ziel, imZiel.index + 1, abschnittEnde(ziel, imZiel));
      gruppen.set(name, { ueberschrift: w.ueberschrift, imZiel, vorhanden, bloecke: [] });
    }
    const gruppe = gruppen.get(name);
    const zeilen = blockZeilen(quelle.zeilen, w);
    const doppelt = w.von === w.bis && gruppe.vorhanden !== null && gruppe.vorhanden.has(zeilen[0]);
    if (doppelt) continue;
    gruppe.bloecke.push(zeilen);
    eingesetzt++;
  }
  return { gruppen: [...gruppen.values()], eingesetzt };
}

// Die einzufügenden Zeilen an einer Stelle hinter Ziel-Zeile j (-1: am Anfang
// eines Ziels ohne nicht leere Zeile). `vorhandene` sind Gruppen, deren
// Überschrift im Ziel steht, `amEnde` die am Ende anzulegenden.
function einzufuegendeZeilen(ziel, j, vorhandene, amEnde) {
  const out = [];
  const leerDavor = () => {
    if (out.length === 0 && j >= 0 && !istListeOderFortsetzung(ziel, j)) out.push('');
  };
  for (const g of vorhandene) {
    if (!g.bloecke.length) continue;
    leerDavor();
    for (const b of g.bloecke) out.push(...b);
  }
  for (const g of amEnde) {
    if (!g.bloecke.length) continue;
    if (g.ueberschrift === null) {
      leerDavor();
    } else {
      // AUSLEGUNG: Am Anfang eines leeren Ziels steht vor der neuen
      // Überschrift keine Leerzeile.
      if (out.length > 0 || j >= 0) out.push('');
      out.push(g.ueberschrift.zeile, '');
    }
    for (const b of g.bloecke) out.push(...b);
  }
  if (out.length && j + 1 < ziel.zeilen.length && !istLeer(ziel.zeilen[j + 1])) out.push('');
  return out;
}

// Zeilenende der eingefügten Zeilen: das erste des Ziels.
// AUSLEGUNG: Hat das Ziel kein Zeilenende (leer oder eine Zeile ohne
// Umbruch), gilt das erste der Quelle, sonst '\n'.
function zeilenendeFuer(ziel, quelle) {
  return ziel.enden.find((e) => e !== '') || quelle.enden.find((e) => e !== '') || '\n';
}

// Fügt die Zeilen ein und liefert den neuen Text samt den Einfügungen.
function setzeEin(zielText, ziel, stellen, eol) {
  const anfang = [];
  let pos = ziel.bom.length;
  for (let i = 0; i < ziel.zeilen.length; i++) {
    anfang.push(pos);
    pos += ziel.zeilen[i].length + ziel.enden[i].length;
  }
  const text = String(zielText == null ? '' : zielText);
  const einfuegungen = [];
  for (const { j, zeilen } of stellen) {
    let offset;
    let stueck;
    if (j < 0) {
      // AUSLEGUNG: Im leeren Ziel endet die Einfügung mit einem Zeilenende.
      offset = ziel.bom.length;
      stueck = zeilen.map((z) => z + eol).join('');
    } else if (ziel.enden[j] !== '') {
      offset = anfang[j] + ziel.zeilen[j].length + ziel.enden[j].length;
      stueck = zeilen.map((z) => z + eol).join('');
    } else {
      offset = anfang[j] + ziel.zeilen[j].length;
      stueck = eol + zeilen.join(eol);
    }
    einfuegungen.push({ offset, laenge: stueck.length, stueck });
  }
  einfuegungen.sort((a, b) => a.offset - b.offset);
  let neu = '';
  let bisher = 0;
  for (const e of einfuegungen) {
    neu += text.slice(bisher, e.offset) + e.stueck;
    bisher = e.offset;
  }
  neu += text.slice(bisher);
  return {
    zielNeu: neu,
    einfuegungen: einfuegungen.map(({ offset, laenge }) => ({ offset, laenge })),
  };
}

function plantZiel(zielText, ziel, quelle, gruppen) {
  const endeJ = letzteNichtLeere(ziel.zeilen, Math.max(0, ziel.ab - 1), ziel.zeilen.length - 1);
  const proStelle = new Map();
  const stelle = (j) => {
    if (!proStelle.has(j)) proStelle.set(j, { vorhandene: [], amEnde: [] });
    return proStelle.get(j);
  };
  for (const g of gruppen) {
    if (g.imZiel) {
      const j = letzteNichtLeere(ziel.zeilen, g.imZiel.index, abschnittEnde(ziel, g.imZiel) - 1);
      stelle(j).vorhandene.push(g);
    }
  }
  // Ohne Überschrift zuerst, dann neue Überschriften nach erstem Auftreten.
  const ohne = gruppen.filter((g) => !g.imZiel && g.ueberschrift === null);
  const neue = gruppen.filter((g) => !g.imZiel && g.ueberschrift !== null);
  if (ohne.length || neue.length) stelle(endeJ).amEnde.push(...ohne, ...neue);
  const stellen = [];
  for (const [j, s] of proStelle) {
    const zeilen = einzufuegendeZeilen(ziel, j, s.vorhandene, s.amEnde);
    if (zeilen.length) stellen.push({ j, zeilen });
  }
  return setzeEin(zielText, ziel, stellen, zeilenendeFuer(ziel, quelle));
}

// --- Quelle kennzeichnen oder entfernen --------------------------------------

function kennzeichne(quelle, wurzeln, umgebung) {
  const zeilen = quelle.zeilen.slice();
  for (const w of wurzeln) {
    for (let i = w.von; i <= w.bis; i++) {
      if (quelle.maske[i] || !isTaskLine(zeilen[i], umgebung.globalFilter)) continue;
      const modell = parseTaskLine(zeilen[i]);
      setStatusChar(modell, umgebung.zeichen);
      zeilen[i] = serializeTaskLine(modell);
    }
  }
  return setzeZusammen({ bom: quelle.bom, zeilen, enden: quelle.enden });
}

// Entfernt die Blöcke. Stehen an einer Lücke danach zwei Leerzeilen
// hintereinander, fällt die hintere weg. Ob der Text mit einem Zeilenende
// endet, bleibt, wie es war.
function entferne(quelle, wurzeln) {
  const weg = new Array(quelle.zeilen.length).fill(false);
  for (const w of wurzeln) for (let i = w.von; i <= w.bis; i++) weg[i] = true;
  const zeilen = [];
  const enden = [];
  let lueckeDavor = false;
  for (let i = 0; i < quelle.zeilen.length; i++) {
    if (weg[i]) {
      lueckeDavor = true;
      continue;
    }
    const zeile = quelle.zeilen[i];
    const doppelLeer = lueckeDavor && zeilen.length && istLeer(zeilen[zeilen.length - 1]);
    lueckeDavor = false;
    if (doppelLeer && istLeer(zeile)) continue;
    zeilen.push(zeile);
    enden.push(quelle.enden[i]);
  }
  const ohneSchluss = quelle.enden.length > 0 && quelle.enden[quelle.enden.length - 1] === '';
  if (ohneSchluss && enden.length) enden[enden.length - 1] = '';
  return setzeZusammen({ bom: quelle.bom, zeilen, enden });
}

// --- Einstieg ----------------------------------------------------------------

// Plant den Übertrag. Liefert { ok: true, zielNeu, quelleNeu, anzahl,
// eingesetzt, einfuegungen } oder { ok: false, grund } mit grund aus
// 'abschnitt-fehlt', 'nichts-offen', 'zu-gross'.
function planeUebertrag(quellText, zielText, optionen) {
  const o = optionen || {};
  const umgebung = {
    globalFilter: o.globalFilter || '',
    statusTypeOf: typeof o.statusTypeOf === 'function' ? o.statusTypeOf : () => null,
    zeichen: typeof o.zeichen === 'string' && o.zeichen !== '' ? o.zeichen : VORGABE_ZEICHEN,
  };
  const maxWurzeln = Number.isFinite(o.maxWurzeln) ? o.maxWurzeln : VORGABE_MAX_WURZELN;
  const quelle = bereite(quellText);
  let wurzeln = sammleWurzeln(quelle, umgebung);
  const abschnitt = normiereUeberschrift(o.abschnitt);
  if (abschnitt !== '') {
    if (!quelle.ueberschriften.some((u) => u.name === abschnitt)) {
      return { ok: false, grund: 'abschnitt-fehlt' };
    }
    const drin = ueberschriftenImAbschnitt(quelle.ueberschriften, abschnitt);
    wurzeln = wurzeln.filter((w) => w.ueberschrift && drin.has(w.ueberschrift.index));
  }
  if (wurzeln.length === 0) return { ok: false, grund: 'nichts-offen' };
  if (wurzeln.length > maxWurzeln) return { ok: false, grund: 'zu-gross' };

  const ziel = bereite(zielText);
  const { gruppen, eingesetzt } = bildeGruppen(quelle, ziel, wurzeln);
  const { zielNeu, einfuegungen } = plantZiel(zielText, ziel, quelle, gruppen);
  // AUSLEGUNG: Jeder andere Modus als 'remove' kennzeichnet (in der Quelle
  // wird im Zweifel nichts entfernt).
  const quelleNeu =
    o.modus === 'remove' ? entferne(quelle, wurzeln) : kennzeichne(quelle, wurzeln, umgebung);
  return { ok: true, zielNeu, quelleNeu, anzahl: wurzeln.length, eingesetzt, einfuegungen };
}

module.exports = {
  planeUebertrag,
  zerlegeZeilen,
  codeMaske,
  istOffen,
  sammleWurzeln,
  normiereUeberschrift,
  VORGABE_ZEICHEN,
  VORGABE_MAX_WURZELN,
};
