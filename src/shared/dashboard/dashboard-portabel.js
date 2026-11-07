// 4T-002518 (Epic 3E-000402): Der statische Ersatz eines Dashboard-Blocks im
// portablen Export (Story 4S-001187, AK3, AK4 und AK7; Konzept-Stufe 4T-002506,
// Abschnitt 3.5). Das Modul beantwortet eine Frage: welches Markdown an die
// Stelle eines Blocks `perspective-dashboard` tritt, wenn seine Kacheln mit der
// Vorbelegung ausgewertet sind.
//
// **Das Bild des Exports** (Abschnitt 3.5): oben eine Zeile mit dem Stand der
// Vorbelegung, danach je Kachel eine Überschrift mit ihrem Titel; die Kennzahl
// als Text, die Liste als Aufzählung, die Tabelle als Markdown-Tabelle, Balken
// und Kreis als helles Bild, die Text-Kachel als ihr Markdown. Die Kacheln
// stehen untereinander, weil das portable Markdown kein Raster kennt; es gibt
// weder Auswahlfelder noch einen Hinweis auf fehlende Bedienung (AK4).
//
// **Entscheidungen der Sitzung vom 2026-11-03:** Die Vorbelegungs-Zeile nennt
// die Filter in Block-Reihenfolge als «Titel: Wert», durch Semikolon getrennt,
// «alle» für einen Filter ohne Wert; ohne Filter entfällt sie. Eine
// Fehler-Kachel erscheint als Überschrift mit ihrem Hinweis samt Zeile darunter
// als Absatz, wie in der Anzeige, ohne Quelltext. Eine Kachel, die in der
// Wartezeit nicht ausgewertet wurde, trägt den Hinweis `exportNichtAusgewertet`.
//
// **Wer was tut:** Ausgewertet wird im Anzeige-Prozess
// (`src/renderer/modules/dashboard/dashboard-export.js`), über die Brücke wie in
// der Ansicht; dieses Modul bekommt je Kachel das fertige Ergebnis und rechnet
// allein Text. Prozess-neutral (CJS, kein DOM, kein Electron), damit der
// rechnende Teil ohne laufendes Programm prüfbar ist (Muster
// `src/shared/markdown/perspective-chart-export.js`).
//
// **Ersetzung über Zeichen-Positionen** (Fehlerklasse L7): Die Blöcke findet
// dieselbe Zaun-Erkennung wie die der Diagramme (`findeDiagrammBloecke` mit dem
// Namen des Dashboard-Blocks); der Text wird aus Stücken neu zusammengesetzt,
// nie über `String.replace` mit einem Ersetzungs-Text. Alles außerhalb der
// ersetzten Blöcke bleibt byte-gleich.
//
// **Text des Bestands wird wörtlich gesetzt:** Werte, Titel und Hinweise
// bekommen vor jedem ASCII-Satzzeichen außer Komma und Semikolon einen
// Rückstrich, nach der Regel von `kursiveZeile`. So löst ein Wert nichts aus,
// auch nicht im Umwandlungs-Schritt danach (Kommentar `%%`, Inline-Berechnung).
// Verweise auf Treffer und verwiesene Dokumente stehen als `[[Name]]` wie im
// übrigen Text des Exports.
'use strict';

const { schliesstZaun, zaunOeffnung } = require('../markdown/fence-level.js');
const {
  ersetzeDiagrammBloecke,
  findeDiagrammBloecke,
  kursiveZeile,
} = require('../markdown/perspective-chart-export.js');
const { DASHBOARD_FENCE } = require('./dashboard-core.js');
const {
  cellSegments,
  columnHeader,
  displayName,
  groupTitle,
  walkGroups,
} = require('../query/result-display.js');

const HINWEIS = 'dashboard.hint.';

// Der Kanal der Abfrage nimmt höchstens zwanzig Namen und Werte bis 500
// Zeichen (src/main/ipc/index-views.js); die Auswahl am Kopf hält dieselbe
// Grenze (`dashboard-zustand.js`).
const HOECHSTENS_FILTER = 20;
const HOECHSTE_WERT_LAENGE = 500;

function leser(L) {
  return typeof L === 'function' ? L : (key) => key;
}

// Ersatz eines Platzhalters über eine Funktion, damit ein `$` im Wert kein
// Ersetzungs-Muster ist.
function fuelle(vorlage, platz, wert) {
  return String(vorlage).replace(platz, () => String(wert));
}

// --- Wörtlicher Text und Verweise -----------------------------------------------

/**
 * Ein Text als wörtliches Markdown einer Zeile: Zeilenumbrüche werden zu
 * Leerzeichen, jedes ASCII-Satzzeichen außer Komma und Semikolon bekommt einen
 * Rückstrich (Regel von `kursiveZeile`).
 *
 * @param {string} text
 * @returns {string}
 */
function woertlich(text) {
  let aus = '';
  for (const zeichen of String(text == null ? '' : text).replace(/[\r\n]+/g, ' ')) {
    const deutbar = /[!-/:-@[-`{-~]/.test(zeichen) && zeichen !== ',' && zeichen !== ';';
    aus += deutbar ? `\\${zeichen}` : zeichen;
  }
  return aus;
}

// Ein Verweis in der Wiki-Form des Dokuments. Ein Name, der die Form brechen
// würde (Klammer, Trennstrich, Anker-Zeichen, Umbruch), bleibt wörtlicher Text.
function verweis(name, anker) {
  const n = String(name == null ? '' : name);
  const a = anker ? String(anker) : '';
  if (n === '' || /[[\]|#^\r\n]/.test(n) || /[[\]|#^\r\n]/.test(a)) {
    return woertlich(a ? `${n}#^${a}` : n);
  }
  return a ? `[[${n}#^${a}]]` : `[[${n}]]`;
}

// Der Treffer einer Zeile: Datei und Aufgabe als Verweis auf die Datei, Block
// mit Anker; ein Datensatz hat im Export kein Ziel und bleibt Text.
function trefferVerweis(origin) {
  if (!origin) return '';
  if (origin.kind === 'file' || origin.kind === 'task') return verweis(origin.name);
  if (origin.kind === 'block') return verweis(origin.name, origin.anchor);
  return woertlich(displayName(origin));
}

// Anzeige-Stücke eines Werts (`cellSegments`) als Markdown.
function stueckeMarkdown(segmente) {
  return (segmente || [])
    .map((seg) => {
      let text = '';
      if (seg && seg.link && typeof seg.link.path === 'string') {
        text = verweis(seg.link.name || seg.link.path);
      } else if (seg && seg.record) {
        text = woertlich(seg.record.name || seg.record.id || '');
      } else if (seg && typeof seg.text === 'string') {
        text = woertlich(seg.text);
      }
      return seg && seg.bold && text.trim() !== '' ? `**${text}**` : text;
    })
    .join('');
}

function wertMarkdown(wert) {
  return stueckeMarkdown(cellSegments(wert === undefined ? null : wert));
}

function gruppenWert(value, L) {
  const { label, segments } = groupTitle(value);
  if (label !== null && segments.length > 0) return stueckeMarkdown(segments);
  return woertlich(label === null ? L('query.group.none') : label);
}

// --- Liste, Tabelle, Kennzahl -----------------------------------------------------

// Eine Aufgabe als Aufgaben-Zeile mit ihrem Zustand und Text aus der Roh-Zeile,
// dahinter der Verweis auf ihre Datei.
function aufgabenZeile(origin) {
  const roh = String((origin && origin.raw) || '').trim();
  const m = /^(?:[-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/.exec(roh);
  const zustand = m ? m[1] : ' ';
  const text = m ? m[2] : roh;
  return `[${zustand === ' ' ? ' ' : zustand}] ${woertlich(text)} (${trefferVerweis(origin)})`;
}

function listenPunkt(rs, row) {
  if (rs.scope === 'tasks') return aufgabenZeile(row.origin);
  const extra =
    Array.isArray(rs.columns) && rs.columns.length > 0 ? wertMarkdown(row.values[0]) : '';
  const treffer = trefferVerweis(row.origin);
  return extra.trim() === '' ? treffer : `${treffer} — ${extra}`;
}

/**
 * Die Liste einer Ergebnismenge als Aufzählung; Gruppen als Punkte mit
 * eingerückten Treffern darunter, in der Reihenfolge der Menge.
 *
 * @param {object} rs Ergebnismenge (`result-set.js`).
 * @param {(key: string) => string} [L] Beschriftungs-Leser.
 * @returns {string} Zeilen ohne abschließenden Umbruch.
 */
function listeMarkdown(rs, L) {
  const lies = leser(L);
  const zeilen = [];
  const punkt = (tiefe, text) => zeilen.push(`${'  '.repeat(tiefe)}- ${text}`);
  if (!Array.isArray(rs.groups)) {
    for (const row of rs.rows) punkt(0, listenPunkt(rs, row));
    return zeilen.join('\n');
  }
  walkGroups(rs, (group, level) => {
    punkt(level, `**${gruppenWert(group.value, lies)}**`);
    if (!Array.isArray(group.groups)) {
      for (const i of group.rows) punkt(level + 1, listenPunkt(rs, rs.rows[i]));
    }
  });
  return zeilen.join('\n');
}

function tabellenZeile(zellen) {
  return `| ${zellen.map((z) => (z.trim() === '' ? ' ' : z)).join(' | ')} |`;
}

// Tiefe der Gruppen-Stufen (wie `buildGroupedTableDom`).
function gruppenTiefe(rs) {
  let tiefe = 0;
  for (let list = rs.groups; Array.isArray(list) && list.length > 0; tiefe++) {
    list = list[0].groups;
  }
  return tiefe;
}

/**
 * Die Tabelle einer Ergebnismenge als Markdown-Tabelle: ohne Gruppen je Zeile
 * ein Treffer (erste Spalte entfällt bei `WITHOUT ID`), mit Gruppen je Gruppe
 * der untersten Stufe eine Zeile, vorn die Gruppen-Werte.
 *
 * @param {object} rs Ergebnismenge.
 * @param {(key: string) => string} [L]
 * @returns {string}
 */
function tabelleMarkdown(rs, L) {
  const lies = leser(L);
  const ohneId = !!(rs.wishes && rs.wishes.withoutId);
  const kopf = [];
  const zeilen = [];
  if (Array.isArray(rs.groups)) {
    const gruppenSpalten = Array.isArray(rs.groupColumns) ? rs.groupColumns : [];
    if (!ohneId) {
      for (let k = 0; k < gruppenTiefe(rs); k++) kopf.push(columnHeader(gruppenSpalten[k]));
    }
    walkGroups(
      rs,
      (group, _level, pfad) => {
        const kette = [...pfad, group.value];
        if (Array.isArray(group.groups)) return kette;
        const werte = Array.isArray(group.values) ? group.values : [];
        zeilen.push([
          ...(ohneId ? [] : kette.map((v) => gruppenWert(v, lies))),
          ...rs.columns.map((_, j) => wertMarkdown(werte[j])),
        ]);
        return kette;
      },
      [],
    );
  } else {
    if (!ohneId) {
      kopf.push(
        lies(rs.scope === 'records' ? 'query.table.recordColumn' : 'query.table.fileColumn'),
      );
    }
    for (const row of rs.rows) {
      zeilen.push([
        ...(ohneId ? [] : [trefferVerweis(row.origin)]),
        ...row.values.map((v) => wertMarkdown(v)),
      ]);
    }
  }
  const koepfe = [
    ...kopf.map((k) => woertlich(k)),
    ...rs.columns.map((c) => woertlich(columnHeader(c))),
  ];
  if (koepfe.length === 0) return '';
  return [
    tabellenZeile(koepfe),
    tabellenZeile(koepfe.map(() => '---')),
    ...zeilen.map((z) => tabellenZeile(z)),
  ].join('\n');
}

/**
 * Die Kennzahl als Text: ein Wert fett, mehrere Werte als Aufzählung mit ihrer
 * Beschriftung. Die Texte kommen fertig formatiert aus der Anzeige.
 *
 * @param {Array<{wert: string, beschriftung?: string|null}>} eintraege
 * @returns {string}
 */
function kennzahlMarkdown(eintraege) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  if (liste.length === 1 && !liste[0].beschriftung) return `**${woertlich(liste[0].wert)}**`;
  return liste
    .map((e) => {
      const b = e.beschriftung ? ` ${woertlich(e.beschriftung)}` : '';
      return `- **${woertlich(e.wert)}**${b}`;
    })
    .join('\n');
}

// --- Der Block ----------------------------------------------------------------------

function tauglich(wert) {
  return typeof wert === 'string' && wert !== '' && wert.length <= HOECHSTE_WERT_LAENGE;
}

/**
 * Die Werte der Filter mit ihrer Vorbelegung, wie die Anzeige sie beim ersten
 * Zeichnen setzt: Name -> Vorbelegung, `null` für «alle».
 *
 * @param {{filter: Array<{name: string, vorbelegung: string|null}>}} sicht
 * @returns {Record<string, string|null>}
 */
function vorbelegungsWerte(sicht) {
  const werte = {};
  for (const f of sicht.filter.slice(0, HOECHSTENS_FILTER)) {
    werte[f.name] = tauglich(f.vorbelegung) ? f.vorbelegung : null;
  }
  return werte;
}

/**
 * Die Zeile mit dem Stand der Vorbelegung (Entscheidung der Sitzung vom
 * 2026-11-03); ohne Filter leer.
 *
 * @param {object} sicht Sicht des Blocks (`dashboardSicht`).
 * @param {(key: string) => string} [L]
 * @returns {string}
 */
function vorbelegungsZeile(sicht, L) {
  const lies = leser(L);
  const filter = sicht.filter.slice(0, HOECHSTENS_FILTER);
  if (filter.length === 0) return '';
  const teile = filter.map((f) => {
    const wert = tauglich(f.vorbelegung) ? f.vorbelegung : lies(HINWEIS + 'filterAlle');
    return `${f.titel}: ${wert}`;
  });
  return kursiveZeile(fuelle(lies(HINWEIS + 'exportVorbelegung'), '{auswahl}', teile.join('; ')));
}

// Ein Befund als Absatz: Zeile im Block und Text, wie in der Anzeige.
function befundZeile(befund, L) {
  const text = fuelle(L(HINWEIS + befund.code), '{detail}', befund.detail || '');
  if (befund.zeile == null) return kursiveZeile(text);
  return kursiveZeile(`${fuelle(L(HINWEIS + 'zeile'), '{zeile}', befund.zeile)} ${text}`);
}

// Der Inhalt einer Daten-Kachel aus ihrem Ergebnis.
function ergebnisTeile(erg, kachel, L) {
  if (!erg) return [kursiveZeile(L(HINWEIS + 'exportNichtAusgewertet'))];
  if (erg.art === 'fehler') {
    return [befundZeile({ code: erg.code, zeile: kachel.zeile, detail: erg.name }, L)];
  }
  const teile = (erg.hinweise || []).map((h) => kursiveZeile(h)).filter((z) => z !== '');
  if (erg.art === 'kennzahl') teile.push(kennzahlMarkdown(erg.eintraege));
  else if (erg.art === 'liste') teile.push(listeMarkdown(erg.resultSet, L));
  else if (erg.art === 'tabelle') teile.push(tabelleMarkdown(erg.resultSet, L));
  else if (erg.art === 'bild') {
    teile.push(String(erg.bild || '').replace(/\n+$/, ''));
    for (const z of erg.zeilen || []) teile.push(kursiveZeile(z));
  }
  return teile.filter((t) => t !== '');
}

function kachelTeile(kachel, ergebnisse, kontext) {
  const { L, ebene } = kontext;
  const teile = [];
  if (kachel.titel !== '') teile.push(`${'#'.repeat(ebene)} ${woertlich(kachel.titel)}`);
  for (const b of kachel.fehler) teile.push(befundZeile(b, L));
  const fehlerKachel = kachel.art === null || (kachel.art !== 'text' && kachel.quelle === null);
  if (fehlerKachel) return teile;
  if (kachel.quelle.typ === 'text') {
    if (kachel.quelle.text.trim() !== '') teile.push(kachel.quelle.text);
    return teile;
  }
  return teile.concat(ergebnisTeile(ergebnisse.get(kachel.index), kachel, L));
}

/**
 * Das Markdown eines Dashboard-Blocks im portablen Export.
 *
 * @param {object} sicht Sicht des Blocks (`dashboardSicht`).
 * @param {Map<number, object>} ergebnisse Ergebnis je Kachel (Schlüssel:
 *   `kachel.index`). Ein Ergebnis hat die Art `kennzahl` (`eintraege`), `liste`
 *   oder `tabelle` (`resultSet`), `bild` (`bild`, `zeilen`), `hinweise` oder
 *   `fehler` (`code`, `name`), dazu wahlfrei `hinweise` als fertige Texte. Eine
 *   Daten-Kachel ohne Ergebnis gilt als nicht ausgewertet.
 * @param {{L?: (key: string) => string, ebene?: number}} [kontext] `ebene` ist
 *   die Ebene der Kachel-Überschriften, 1 bis 6.
 * @returns {string} Markdown ohne Leerzeilen am Rand.
 */
function dashboardPortabel(sicht, ergebnisse, kontext = {}) {
  const L = leser(kontext.L);
  const ebene = Math.min(6, Math.max(1, Number(kontext.ebene) || 2));
  const map = ergebnisse instanceof Map ? ergebnisse : new Map();
  const teile = [];
  const zeile = vorbelegungsZeile(sicht, L);
  if (zeile) teile.push(zeile);
  if (sicht.leer) teile.push(kursiveZeile(L(HINWEIS + 'leer')));
  const amPlatz = new Set();
  for (const reihe of sicht.zeilen) {
    for (const k of reihe.kacheln) {
      k.fehler.forEach((b) => amPlatz.add(b));
      teile.push(...kachelTeile(k, map, { L, ebene }));
    }
  }
  // Die Befunde der Filter und alle übrigen sammelt der Fuß wie in der Anzeige;
  // die Filter haben im Export kein Auswahlfeld, an dem sie stehen könnten.
  const gesammelt = sicht.errors.filter((b) => b.code !== 'leer' && !amPlatz.has(b));
  if (gesammelt.length > 0) {
    teile.push(kursiveZeile(L(HINWEIS + 'sammel')));
    for (const b of gesammelt) teile.push(befundZeile(b, L));
  }
  return teile.join('\n\n');
}

// --- Stelle im Dokument ----------------------------------------------------------------

/**
 * Die Dashboard-Blöcke der obersten Ebene in Textreihenfolge (Zaun-Regel aus
 * `fence-level.js` über `findeDiagrammBloecke`).
 *
 * @param {string} text
 * @returns {Array<{start: number, ende: number, body: string, zeile: number,
 *   einzug: number, geschlossen: boolean}>}
 */
function findeDashboardBloecke(text) {
  return findeDiagrammBloecke(text, DASHBOARD_FENCE);
}

/**
 * Ebene der Kachel-Überschriften eines Blocks: eine unter der letzten
 * Überschrift davor, außerhalb von Code-Zäunen; ohne Überschrift davor 2,
 * höchstens 6. So ordnen sich die Kacheln in die Gliederung des Dokuments ein.
 *
 * @param {string} text Dokument-Text.
 * @param {number} start Stelle des Blocks.
 * @returns {number}
 */
function ueberschriftEbene(text, start) {
  const zeilen = String(text == null ? '' : text)
    .slice(0, Math.max(0, start))
    .split('\n');
  let offen = null;
  let ebene = 1;
  for (const roh of zeilen) {
    const zeile = roh.endsWith('\r') ? roh.slice(0, -1) : roh;
    if (offen) {
      if (schliesstZaun(zeile, offen)) offen = null;
      continue;
    }
    const oeffnung = zaunOeffnung(zeile);
    if (oeffnung) {
      offen = oeffnung;
      continue;
    }
    const m = /^ {0,3}(#{1,6})(?:[ \t]|$)/.exec(zeile);
    if (m) ebene = m[1].length;
  }
  return Math.min(6, ebene + 1);
}

/**
 * Ersetzt jeden Dashboard-Block durch das, was `build(block, nr)` liefert;
 * `null` lässt den Block byte-gleich stehen. Der Ersatz bekommt Leerzeilen zum
 * Text davor und danach, damit er keinen Absatz fortsetzt, und die Einrückung
 * des Zauns (Liste).
 *
 * @param {string} text
 * @param {function(object, number): (string|null)} build
 * @returns {string}
 */
function ersetzeDashboardBloecke(text, build) {
  const src = String(text == null ? '' : text);
  // Die Nummer eines Blocks ist seine Stelle in `findeDashboardBloecke`; die
  // Ersetzung selbst läuft über den Kern der Diagramme, der den Block mitgibt.
  // Zugeordnet wird über die Zeichen-Position des Blocks, nicht über einen
  // mitlaufenden Zähler, damit eine abweichende Reihenfolge oder ein
  // übersprungener Block die Nummern nicht verschiebt (Review-Runde 1 von
  // 3E-000402, Befund A6).
  const nummer = new Map(findeDashboardBloecke(src).map((b, i) => [b.start, { block: b, nr: i }]));
  return ersetzeDiagrammBloecke(
    src,
    (_body, gefunden) => {
      const treffer = gefunden ? nummer.get(gefunden.start) : undefined;
      if (!treffer) return null;
      const { block, nr } = treffer;
      const ersatz = build(block, nr);
      if (ersatz == null) return null;
      const vorher = src.slice(0, block.start).replace(/[ \t]*$/, '');
      const nachher = src.slice(block.ende);
      const davor = vorher === '' || /\n[ \t]*\n$/.test(vorher) || !/\n$/.test(vorher) ? '' : '\n';
      const danach = /^\r?\n[ \t]*(\r?\n|$)/.test(nachher) || nachher === '' ? '' : '\n';
      return `${davor}${String(ersatz).replace(/^\n+|\n+$/g, '')}${danach}`;
    },
    DASHBOARD_FENCE,
  );
}

module.exports = {
  dashboardPortabel,
  ersetzeDashboardBloecke,
  findeDashboardBloecke,
  kennzahlMarkdown,
  listeMarkdown,
  tabelleMarkdown,
  ueberschriftEbene,
  vorbelegungsWerte,
  vorbelegungsZeile,
  woertlich,
};
