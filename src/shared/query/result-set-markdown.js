'use strict';

// 4T-002546 (Epic 3E-000368, Story 4S-001197): Eine Ergebnismenge als
// Markdown-Tabelle — der Baustein des Workflow-Befehls `db-query` (Db der
// Konzept-Runde 4T-002543).
//
// **Was die Ansicht zeigt, nicht was die Menge trägt.** Der Baustein liest
// allein über den Darstellungs-Kern (`result-display.js`): Spalten-Überschrift,
// Anzeige-Stücke eines Werts, Anzeige-Name eines Treffers, Gruppen-Beschriftung
// und Gruppen-Durchlauf. Er wählt die Form wie die Abfrage-Ansicht
// (`frontmatter-query-view.js`): Tabelle, gruppierte Tabelle mit einer Zeile je
// Gruppe, Liste, gruppierte Liste und Aufgaben-Liste. Das interne
// Ergebnis-Format legt er damit nicht nach außen fest (F5 vom 2026-09-28):
// Geschrieben wird die angezeigte Form, als Text.
//
// **Regeln der Markdown-Form:**
//   - Kopfzeile aus den Beschriftungen; vorn die Spalte des Treffers («Datei»,
//     auf der Datensatz-Ebene «Datensatz», bei Aufgaben «Aufgabe»), außer beim
//     Wunsch `WITHOUT ID`.
//   - Der Treffer als Verweis: eine Datei `[[Name]]`, ein Block `[[Name#^Anker]]`,
//     ein Datensatz `[[Tabelle#^Kennung|Anzeige-Form]]`; eine Aufgabe als ihr Text.
//   - Ein Wert in seinen Anzeige-Stücken: Text, ein Datei-Verweis `[[Name]]`, ein
//     Datensatz-Verweis `[[Tabelle#^Kennung|Anzeige-Form]]`, Hervorhebung als
//     `**…**`, die Meldung einer Formel als ihr Warnzeichen.
//   - Seit dem Nachtrag zu 4T-002546 vom 2026-11-10: Ein Datensatz-Verweis trägt
//     die Anzeige-Form als Anzeigetext, damit die geschriebene Tabelle in der
//     Live- und der gerenderten Ansicht den Namen zeigt wie die Abfrage-Ansicht;
//     der Verweis bleibt derselbe. In der Zelle steht der Trenner als `\|`, wie
//     ihn der Wiki-Link-Leser in Tabellen erwartet (`plugins/wiki.js`). Eine
//     Anzeige-Form mit `[`, `]`, `|` oder `\` könnte der Leser nicht als Verweis
//     lesen; dann und ohne Anzeige-Form bleibt der Verweis ohne Anzeigetext.
//   - Eine gruppierte Liste schreibt je Gruppe eine Zwischenzeile mit der
//     hervorgehobenen Beschriftung, Untergruppen mit `›` je Ebene davor.
//   - Ein senkrechter Strich im Text wird `\|`, ein Zeilenumbruch ein Leerzeichen.
//   - Ohne Treffer eine Tabelle ohne Zeilen und darunter der Satz der Ansicht.
//   - Die Darstellungsform `DISPLAY` übergeht der Baustein; er schreibt die Form
//     ohne Angabe.
//
// Prozess-neutral, ohne DOM und ohne Electron; die Texte kommen über `t` herein.

const {
  cellSegments,
  columnHeader,
  displayName,
  groupTitle,
  walkGroups,
} = require('./result-display.js');
const { INLINE_CALC_ERROR_GLYPH } = require('../markdown/inline-calc.js');

// Der Name einer Tabelle aus Pfad oder Name: ohne Ordner und ohne Endung.
function tabellenName(angabe) {
  const text = String(angabe == null ? '' : angabe);
  const teile = text.split(/[\\/]/);
  return teile[teile.length - 1].replace(/\.md$/i, '');
}

// Ein Text für eine Zelle: senkrechter Strich maskiert, Zeilenumbrüche als Leerzeichen.
function zelle(text) {
  return String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

// Der Anzeigetext eines Datensatz-Verweises: die Anzeige-Form auf einer Zeile,
// leer, wenn es keine gibt, sie der Kennung gleicht oder ein Zeichen trägt, das
// den Verweis zerbräche.
function anzeigetext(anzeige, kennung) {
  const text = String(anzeige == null ? '' : anzeige)
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();
  if (text === '' || text === kennung || /[[\]|\\]/.test(text)) return '';
  return text;
}

// Ein Verweis auf einen Datensatz, mit der Anzeige-Form als Anzeigetext.
function datensatzVerweis(tabelle, kennung, anzeige) {
  const ziel = `${tabellenName(tabelle)}#^${kennung}`;
  const text = anzeigetext(anzeige, kennung);
  return text === '' ? `[[${ziel}]]` : `[[${ziel}|${text}]]`;
}

// Ein Anzeige-Stück in Markdown.
function stueck(seg) {
  if (!seg || typeof seg !== 'object') return '';
  let text = '';
  if (seg.link && typeof seg.link.path === 'string') text = `[[${seg.link.name || seg.link.path}]]`;
  else if (seg.record && typeof seg.record.id === 'string') {
    text = datensatzVerweis(seg.record.table || seg.record.path, seg.record.id, seg.record.name);
  } else if (typeof seg.message === 'string') text = INLINE_CALC_ERROR_GLYPH;
  else if (typeof seg.text === 'string') text = seg.text;
  return seg.bold && text !== '' ? `**${text}**` : text;
}

function wertText(value) {
  return zelle(cellSegments(value).map(stueck).join(''));
}

// Der Text einer Aufgabe ohne Listen- und Status-Zeichen.
function aufgabenText(raw) {
  return String(raw || '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s*/, '')
    .trim();
}

// Der Treffer einer Zeile als Verweis, bei einer Aufgabe ihr Text.
function trefferText(origin) {
  if (!origin || typeof origin !== 'object') return '';
  if (origin.kind === 'record')
    return zelle(datensatzVerweis(origin.table, origin.id, origin.display));
  if (origin.kind === 'task') return zelle(aufgabenText(origin.raw));
  const name = displayName(origin);
  return name === '' ? '' : zelle(`[[${name}]]`);
}

function gruppenText(value, t) {
  const { label, segments } = groupTitle(value);
  if (label === null) return zelle(t('query.group.none'));
  return segments.length > 0 ? zelle(segments.map(stueck).join('')) : zelle(label);
}

function tabellenZeile(zellen) {
  return `| ${zellen.join(' | ')} |`;
}

function trefferKopf(rs, t) {
  if (rs.scope === 'records') return t('query.table.recordColumn');
  if (rs.scope === 'tasks') return t('workflow.dbQuery.taskColumn');
  return t('query.table.fileColumn');
}

// Eine Liste zeigt höchstens ein Zusatzfeld: die erste Spalte der Menge.
function listenSpalten(rs) {
  return Array.isArray(rs.columns) && rs.columns.length > 0 ? [rs.columns[0]] : [];
}

function listenZeile(row, spalten) {
  return [trefferText(row.origin), ...spalten.map((_, j) => wertText(row.values[j]))];
}

// Die gruppierte Tabelle: vorn je Stufe der Gruppen-Wert, dahinter die Werte der Gruppe.
function gruppierteTabelle(rs, t, mitTreffer) {
  let tiefe = 0;
  for (let liste = rs.groups; Array.isArray(liste) && liste.length > 0; tiefe++) {
    liste = liste[0].groups;
  }
  const gruppenSpalten = Array.isArray(rs.groupColumns) ? rs.groupColumns : [];
  const vorn = mitTreffer ? Array.from({ length: tiefe }, (_, k) => gruppenSpalten[k]) : [];
  const kopf = [...vorn, ...rs.columns].map((c) => zelle(columnHeader(c)));
  const zeilen = [];
  walkGroups(
    rs,
    (group, _level, kette) => {
      const pfad = [...kette, group.value];
      if (Array.isArray(group.groups)) return pfad;
      const werte = Array.isArray(group.values) ? group.values : [];
      zeilen.push([
        ...(mitTreffer ? pfad.map((v) => gruppenText(v, t)) : []),
        ...rs.columns.map((_, j) => wertText(werte[j] === undefined ? null : werte[j])),
      ]);
      return pfad;
    },
    [],
  );
  return { kopf, zeilen };
}

// Die gruppierte Liste: je Gruppe eine Zwischenzeile, darunter ihre Treffer.
function gruppierteListe(rs, t) {
  const spalten = listenSpalten(rs);
  const kopf = [trefferKopf(rs, t), ...spalten.map((c) => zelle(columnHeader(c)))];
  const zeilen = [];
  walkGroups(rs, (group, level) => {
    const titel = `${'› '.repeat(level)}**${gruppenText(group.value, t)}**`;
    zeilen.push([titel, ...spalten.map(() => '')]);
    if (!Array.isArray(group.groups)) {
      for (const i of group.rows) zeilen.push(listenZeile(rs.rows[i], spalten));
    }
  });
  return { kopf, zeilen };
}

function einfacheTabelle(rs, t, mitTreffer) {
  const kopf = [
    ...(mitTreffer ? [trefferKopf(rs, t)] : []),
    ...rs.columns.map((c) => zelle(columnHeader(c))),
  ];
  const zeilen = rs.rows.map((row) => [
    ...(mitTreffer ? [trefferText(row.origin)] : []),
    ...row.values.map(wertText),
  ]);
  return { kopf, zeilen };
}

function liste(rs, t) {
  const spalten = listenSpalten(rs);
  return {
    kopf: [trefferKopf(rs, t), ...spalten.map((c) => zelle(columnHeader(c)))],
    zeilen: rs.rows.map((row) => listenZeile(row, spalten)),
  };
}

/**
 * Schreibt eine Ergebnismenge als Markdown-Tabelle in der Form, die die
 * Abfrage-Ansicht zeigt.
 *
 * @param {import('./result-set.js').ResultSet} resultSet ausgewertete Menge
 *   (`state.status` «ready», ohne Abfrage-Fehler).
 * @param {{t: (key: string) => string}} umgebung Übersetzung in der Sprache des
 *   Fensters (Kopf der Treffer-Spalte, Gruppe ohne Wert, Satz ohne Treffer).
 * @returns {string} Markdown mit abschließendem Zeilenumbruch.
 */
function resultSetMarkdown(resultSet, umgebung) {
  const t = umgebung && typeof umgebung.t === 'function' ? umgebung.t : (key) => key;
  const rs = resultSet;
  const mitTreffer = !(rs.wishes && rs.wishes.withoutId);
  const gruppiert = Array.isArray(rs.groups) && rs.groups.length > 0;
  let form;
  if (rs.type === 'table' && gruppiert) form = gruppierteTabelle(rs, t, mitTreffer);
  else if (rs.type === 'table') form = einfacheTabelle(rs, t, mitTreffer);
  else if (gruppiert) form = gruppierteListe(rs, t);
  else form = liste(rs, t);
  // Leer wie in der Ansicht: ohne Zeilen, außer die gruppierte Tabelle trägt Gruppen.
  const leer = rs.rows.length === 0 && !(rs.type === 'table' && gruppiert);
  const zeilen = [tabellenZeile(form.kopf), tabellenZeile(form.kopf.map(() => '---'))];
  if (leer) {
    const satz = t(rs.scope === 'records' ? 'query.emptyRecords' : 'query.empty');
    return `${zeilen.join('\n')}\n\n${satz}\n`;
  }
  for (const z of form.zeilen) zeilen.push(tabellenZeile(z));
  return `${zeilen.join('\n')}\n`;
}

module.exports = { resultSetMarkdown };
