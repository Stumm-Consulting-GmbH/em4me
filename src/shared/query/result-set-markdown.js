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
//   - Ein senkrechter Strich im Text wird `\|`, ein Zeilenumbruch ein Leerzeichen;
//     in Text aus Daten steht der Strich seit 4T-002734 als `&#124;`.
//   - Ohne Treffer eine Tabelle ohne Zeilen und darunter der Satz der Ansicht.
//   - Die Darstellungsform `DISPLAY` übergeht der Baustein; er schreibt die Form
//     ohne Angabe.
//   - Seit 4T-002734 (Epic 3E-000431): **Daten bleiben Text.** Jeder Text aus
//     Daten (Wert, Gruppen-Wert, Spalten-Überschrift, Aufgaben-Zeile) läuft
//     durch `datenText`, damit er in der gezeichneten Notiz als genau der Text
//     erscheint, den die Abfrage-Ansicht zeigt, statt Dokument-Text zu werden
//     (Einbettung, Verweis, Bild, Hervorhebung, privater Kommentar). Ein
//     Verweis, dessen Name die Schreibweise `[[…]]` aufbräche, wird als Text
//     geschrieben (`brichtVerweis`).
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

// --- Daten als Text (4T-002734) -------------------------------------------
//
// Die Zeichen-Liste ist aus der Erhebung der Regeln hergeleitet, die in einer
// Tabellen-Zelle aus Text Auszeichnung machen, und an den Kern-Regeln von
// markdown-it gegengelesen (replacements, smartquotes, linkify samt linkify-it,
// text_join, escape). Ein Rückstrich vor einem ASCII-Satzzeichen macht es zu
// einem eigenen Stück (`escape` → `text_special`), das die Inline-Regeln und die
// Kern-Regeln vor `text_join` nicht mehr als Auslöser sehen; vor Buchstaben,
// Ziffern und Zeichen außerhalb von ASCII bliebe er sichtbar, sie bleiben daher
// unmaskiert. Maskiert wird so eng, wie es ohne Lücke geht, damit der Quelltext
// der Notiz lesbar bleibt (Entscheidung des Arbeitsbereichs vom 2026-11-21):
// Zeichen, die nur in einer bestimmten Lage auslösen, nur in dieser Lage.

// Zeichen, die in jeder Lage eine Regel auslösen können: Hervorhebung,
// Verweise und Klammer-Formen, Roh-HTML und Autolink, Mail-Adresse und
// Kalender-Wert, Zeichen-Entität, Durchstreichung und Tiefgestellt,
// Hochgestellt und Fußnote, Einfügung und Plus-Minus, Markierung und
// Inline-Berechnung, Formel, typografische Anführungszeichen, Attribut-Block,
// Critic Markup, privater Kommentar. Raute und senkrechter Strich stehen nicht
// hier, sondern werden Entität (`datenText`).
const IMMER_MASKIERT = new Set('*_[]<>@&~^+=$"\'{}%');

// Leerraum nach Punkt oder Doppelpunkt: Dort beginnt keine Adresse, kein
// Schema und kein Emoji-Kürzel (linkify-it verlangt nach dem Punkt einen
// Bestandteil eines Namens, nach dem Doppelpunkt `//` oder einen Namen).
const LEERRAUM = new Set([' ', '\t', '\n']);

// Länge der Folge aus Zeichen von `satz`, in der die Stelle `i` steht.
function folgenLaenge(text, i, satz) {
  let anfang = i;
  while (anfang > 0 && satz.includes(text[anfang - 1])) anfang--;
  let ende = i + 1;
  while (ende < text.length && satz.includes(text[ende])) ende++;
  return ende - anfang;
}

// Ob das Zeichen an der Stelle `i` einen Rückstrich braucht. Die Lagen folgen
// den Mustern der Bibliothek: `replacements` ersetzt `--`, `---`, `..`, `+-`,
// vier und mehr Zeichen aus `?` und `!`, zwei und mehr Kommas und `(c)`,
// `(r)`, `(tm)`; linkify-it erkennt `//` als Schema.
function mussMaskieren(text, i, vorVerweis) {
  const zeichen = text[i];
  if (IMMER_MASKIERT.has(zeichen)) return true;
  const danach = i + 1 < text.length ? text[i + 1] : null;
  const endeOderLeer = danach === null || LEERRAUM.has(danach);
  switch (zeichen) {
    case '-':
      return folgenLaenge(text, i, '-') >= 2;
    case ',':
      return folgenLaenge(text, i, ',') >= 2;
    case '/':
      return folgenLaenge(text, i, '/') >= 2;
    case '?':
      return folgenLaenge(text, i, '?!') >= 4;
    case '!':
      // Vor einem folgenden Verweis-Stück würde `![[` eine Einbettung.
      return folgenLaenge(text, i, '?!') >= 4 || (vorVerweis && danach === null);
    case '.':
      return !endeOderLeer || folgenLaenge(text, i, '.') >= 2;
    case ':':
      return !endeOderLeer;
    case '(':
      return /^(?:c|r|tm)\)/i.test(text.slice(i + 1, i + 4));
    default:
      return false;
  }
}

/**
 * Macht einen Text aus Daten zu Markdown, das genau diesen Text zeigt.
 * Wagenrücklauf wird Zeilenumbruch (markdown-it bräche sonst die Tabellen-Zeile
 * an ihm), ein Rückstrich wird verdoppelt, ein Backtick wird `&#96;` (den
 * Rückstrich achtet der Abtaster der privaten Kommentare nicht, die Entität
 * schon), eine Raute wird `&#35;` (die Schlagwort-Erkennung des Index,
 * `TAG_RE` in `tag-erkennung.js`, achtet den Rückstrich nicht und läse aus
 * `\#geheim` ein Schlagwort der Ziel-Notiz; aus der Entität liest sie allein
 * den ungültigen Kandidaten `35`), ein senkrechter Strich wird `&#124;` (mit
 * Rückstrich davor stünde nach `zelle` `\\|` in der Zeile; die Tabellen-Werkzeuge
 * des Editors, `findUnescapedPipes` in `table-edit.js`, läsen den Strich nach
 * einer geraden Zahl Rückstriche als Spalten-Trenner; die Entität ist für
 * markdown-it und die Werkzeuge kein Trenner, und der Spoiler `||` entsteht
 * nicht), vor jedes auslösende Zeichen kommt ein Rückstrich. Ein Durchgang
 * ergibt dasselbe wie die drei Schritte des Lösungsansatzes nacheinander: Kein
 * eingefügter Rückstrich wird verdoppelt, kein Und-Zeichen einer eingefügten
 * Entität maskiert.
 *
 * @param {unknown} wert Text aus Daten.
 * @param {{ vorVerweis?: boolean }} [lage] `vorVerweis`: Ein Verweis folgt
 *   unmittelbar, ein Ausrufezeichen am Ende wird deshalb maskiert.
 * @returns {string}
 */
function datenText(wert, lage) {
  const text = String(wert == null ? '' : wert).replace(/\r\n?/g, '\n');
  const vorVerweis = Boolean(lage && lage.vorVerweis);
  let aus = '';
  for (let i = 0; i < text.length; i++) {
    const zeichen = text[i];
    if (zeichen === '\\') aus += '\\\\';
    else if (zeichen === '`') aus += '&#96;';
    else if (zeichen === '#') aus += '&#35;';
    else if (zeichen === '|') aus += '&#124;';
    else if (mussMaskieren(text, i, vorVerweis)) aus += `\\${zeichen}`;
    else aus += zeichen;
  }
  return aus;
}

// Ob ein Name die Verweis-Schreibweise `[[…]]` aufbräche oder umdeutete:
// eckige Klammer, senkrechter Strich und Zeilenumbruch zerbrechen sie, der
// Verweis-Leser schneidet einen Rückstrich am Ziel-Ende ab und trennt am
// ersten `#` einen Anker ab, der Abtaster der privaten Kommentare sieht `%%`
// und den Backtick auch im Verweis, ein `@` am Anfang mit Doppelpunkt ist das
// Kürzel einer Bereichs-Verknüpfung (`plugins/wiki.js`), und ein Ziel mit
// `javascript:`, `data:` oder `vbscript:` schreibt der Leser nicht als Verweis.
function brichtVerweis(name) {
  const text = String(name == null ? '' : name);
  if (/[[\]|\r\n\\#`]/.test(text) || text.includes('%%')) return true;
  if (/^\s*@/.test(text) && text.includes(':')) return true;
  return /^\s*(?:javascript|data|vbscript):/i.test(text);
}

// Der Anzeigetext eines Datensatz-Verweises: die Anzeige-Form auf einer Zeile,
// leer, wenn es keine gibt, sie der Kennung gleicht oder ein Zeichen trägt, das
// den Verweis zerbräche. Seit 4T-002734 auch bei Backtick und `%%`: Sie sähe der
// Abtaster der privaten Kommentare im Verweis.
function anzeigetext(anzeige, kennung) {
  const text = String(anzeige == null ? '' : anzeige)
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();
  if (text === '' || text === kennung || /[[\]|\\`]/.test(text) || text.includes('%%')) return '';
  return text;
}

// Ein Verweis auf einen Datensatz, mit der Anzeige-Form als Anzeigetext.
function datensatzVerweis(tabelle, kennung, anzeige) {
  const ziel = `${tabellenName(tabelle)}#^${kennung}`;
  const text = anzeigetext(anzeige, kennung);
  return text === '' ? `[[${ziel}]]` : `[[${ziel}|${text}]]`;
}

// Ein Anzeige-Stück als Baustein: `text` aus Daten (wird maskiert) oder fertiges
// Markdown `md`. Ein Verweis, dessen Name die Schreibweise aufbräche, wird der
// Text, den die Abfrage-Ansicht an seiner Stelle zeigt (4T-002734).
function baustein(seg) {
  if (!seg || typeof seg !== 'object') return null;
  const bold = Boolean(seg.bold);
  if (seg.link && typeof seg.link.path === 'string') {
    const name = seg.link.name || seg.link.path;
    return brichtVerweis(name) ? { text: name, bold } : { md: `[[${name}]]`, bold };
  }
  if (seg.record && typeof seg.record.id === 'string') {
    const tabelle = seg.record.table || seg.record.path;
    if (brichtVerweis(tabellenName(tabelle))) {
      return { text: seg.record.name || seg.record.id, bold };
    }
    return { md: datensatzVerweis(tabelle, seg.record.id, seg.record.name), bold };
  }
  if (typeof seg.message === 'string') return { md: INLINE_CALC_ERROR_GLYPH, bold };
  if (typeof seg.text === 'string') return { text: seg.text, bold };
  return null;
}

// Die Anzeige-Stücke eines Werts in Markdown. Aneinanderstoßende Text-Stücke
// ohne Hervorhebung werden vor dem Maskieren zusammengelegt, weil die Lagen
// (`a-` und `-b` ergäben `--`) über die Stück-Grenze reichen; hervorgehobene
// Stücke trennt ihr `**` in eigene Text-Stücke der Bibliothek.
function stueckeText(segments) {
  const bausteine = [];
  for (const seg of segments) {
    const b = baustein(seg);
    if (!b) continue;
    const letzter = bausteine[bausteine.length - 1];
    if (b.text !== undefined && !b.bold && letzter && letzter.text !== undefined && !letzter.bold) {
      letzter.text += b.text;
    } else bausteine.push(b);
  }
  return bausteine
    .map((b, k) => {
      const folgt = bausteine[k + 1];
      const vorVerweis =
        !b.bold &&
        Boolean(folgt) &&
        !folgt.bold &&
        folgt.md !== undefined &&
        folgt.md.startsWith('[');
      const text = b.md !== undefined ? b.md : datenText(b.text, { vorVerweis });
      return b.bold && text !== '' ? `**${text}**` : text;
    })
    .join('');
}

function wertText(value) {
  return zelle(stueckeText(cellSegments(value)));
}

// Der Text einer Aufgabe ohne Listen- und Status-Zeichen.
function aufgabenText(raw) {
  return String(raw || '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s*/, '')
    .trim();
}

// Der Treffer einer Zeile als Verweis, bei einer Aufgabe ihr Text. Ein Name,
// der die Verweis-Schreibweise aufbräche, wird der Anzeige-Name der Ansicht als
// Text (4T-002734); beim Block zählt der Datei-Name vor `#^`, der Anker trägt
// nur Buchstaben, Ziffern, Unterstrich und Bindestrich.
function trefferText(origin) {
  if (!origin || typeof origin !== 'object') return '';
  if (origin.kind === 'record') {
    if (brichtVerweis(tabellenName(origin.table))) return zelle(datenText(displayName(origin)));
    return zelle(datensatzVerweis(origin.table, origin.id, origin.display));
  }
  if (origin.kind === 'task') return zelle(datenText(aufgabenText(origin.raw)));
  const name = displayName(origin);
  if (name === '') return '';
  if (brichtVerweis(origin.name)) return zelle(datenText(name));
  return zelle(`[[${name}]]`);
}

function gruppenText(value, t) {
  const { label, segments } = groupTitle(value);
  if (label === null) return zelle(t('query.group.none'));
  return segments.length > 0 ? zelle(stueckeText(segments)) : zelle(datenText(label));
}

// Eine Spalten-Überschrift: Alias, Beschriftung der Feld-Definition oder
// Ausdrucks-Quelltext, also Text des Anwenders und der Daten (4T-002734).
function kopfText(column) {
  return zelle(datenText(columnHeader(column)));
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
  const kopf = [...vorn, ...rs.columns].map(kopfText);
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
  const kopf = [trefferKopf(rs, t), ...spalten.map(kopfText)];
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
  const kopf = [...(mitTreffer ? [trefferKopf(rs, t)] : []), ...rs.columns.map(kopfText)];
  const zeilen = rs.rows.map((row) => [
    ...(mitTreffer ? [trefferText(row.origin)] : []),
    ...row.values.map(wertText),
  ]);
  return { kopf, zeilen };
}

function liste(rs, t) {
  const spalten = listenSpalten(rs);
  return {
    kopf: [trefferKopf(rs, t), ...spalten.map(kopfText)],
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
