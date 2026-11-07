'use strict';

// 4T-002515 (Epic 3E-000402): Die internen Formen der Kacheln eines Dashboards,
// `kennzahl`, `liste` und `tabelle`. Das Modul beantwortet eine Frage: was eine
// Kachel dieser drei Arten aus der Ergebnismenge ihrer Abfrage zeichnet
// (Konzept-Stufe 4T-002506, Abschnitt 1.6). Balken und Kreis brauchen keine
// eigene Form; ihre Kacheln wählen die öffentlichen Formen `bar` und `pie` der
// Abfrage (`display-chart.js`).
//
// **Angemeldet über die Vorgabe-Naht** (`registriereVorgabeForm` in
// `frontmatter-query-view.js`), nicht im Verzeichnis der Darstellungsformen:
// Über `DISPLAY` sind die drei Formen nicht erreichbar, allein ein Container mit
// `data-fm-form` wählt sie. Die Art bestimmt die Darstellung; ein `DISPLAY` der
// Abfrage übergeht die Vorgabe ohne Hinweis. Passt die Art nicht, fällt die
// Befüllung auf die Ausgabe ohne Angabe zurück und nennt den Hinweis der
// Darstellungs-Wahl, wie bei jeder Form.
//
// **Kennzahl** (V9 für den Gesamt-Wert):
//   - ohne Treffer `0`, auf jeder Ebene und bei jeder Gruppierung;
//   - ungruppiert die Zahl der Zeilen, also der Treffer nach `LIMIT`;
//   - Tabelle des Gesamt-Werts (`TABLE WITHOUT ID` aus lauter Aggregaten, eine
//     Gruppe ohne Gruppen-Spalte): ihr erster messbarer Wert;
//   - gruppierte Tabelle: je Gruppe der untersten Stufe der Wert der ersten
//     Spalte, die in irgendeiner Gruppe einen messbaren Wert trägt; die
//     Gruppen-Ausdrücke selbst stehen nicht unter den Spalten;
//   - gruppierte Liste: je Gruppe der untersten Stufe die Zahl ihrer Treffer.
// Messbar ist eine Zahl, ein Text, den die Abfrage als Zahl liest, ein Datum
// oder eine Dauer (Story 4S-001184: Anzahl, Summe, Mittelwert, kleinster und
// größter Wert). Trägt eine Tabelle mit Gruppen keinen messbaren Wert, passt
// die Kennzahl nicht (Grund `kennzahlOhneZahl`), und die Tabelle erscheint.
// Eine Gruppe ergibt eine große Zahl, mehrere ergeben je Gruppe Zahl und
// Beschriftung; die Beschriftung ist der Gruppen-Wert, bei mehreren Stufen mit
// « › » verbunden wie die Rubrik eines Diagramms.
//
// **Liste** erwartet `LIST` auf jeder Ebene, auch `LIST TASKS`; **Tabelle**
// erwartet `TABLE`, die Listen-Maske einer Datensatz-Abfrage tritt wie im
// Fließtext an ihre Stelle. Beide zeichnen mit denselben Bau-Funktionen wie die
// Ausgabe ohne Angabe, damit eine Kachel dasselbe zeigt wie dieselbe Abfrage im
// Fließtext, mit Klick-Pfad.
//
// Zahl, Datum und Dauer folgen der Oberflächen-Sprache (`context.locale`).
// Jeder Wert kommt als Text in den Baum (Render-Sicherheit). Das Modul hat
// keinen Bezug zur Brücke; der jsdom-Prüffall läuft ohne Preload.

import { registriereVorgabeForm } from '../query/frontmatter-query-view.js';
import {
  buildListDom,
  buildGroupedListDom,
  buildTableDom,
  buildGroupedTableDom,
} from '../query/display-list-table.js';
import { buildTaskListDom } from '../query/display-tasks.js';
import { walkGroups } from '../../../shared/query/result-display.js';
import { valueTypeOf } from '../../../shared/query/result-set.js';
import {
  coerceNumber,
  durToString,
  formatNumberMs,
  formatValue,
} from '../../../shared/query/query-format.js';
import { GROUP_LEVEL_SEPARATOR } from '../../../shared/query/result-chart.js';

/** Grund-Code einer Kennzahl ohne messbaren Wert (Text in `dashboard.json`). */
export const KENNZAHL_OHNE_ZAHL = 'kennzahlOhneZahl';

/** Zeichen eines fehlenden Werts in einer Kennzahl je Gruppe. */
const OHNE_WERT = '–';

// --- Kennzahl: Auswertung --------------------------------------------------------

// Die Gruppen der untersten Stufe samt der Gruppen-Werte aller Stufen, in der
// Reihenfolge der Menge (Durchlauf wie in `buildGroupedTableDom`).
function blattGruppen(rs) {
  const blaetter = [];
  walkGroups(
    rs,
    (group, _level, pfad) => {
      const kette = [...pfad, group.value];
      if (!Array.isArray(group.groups)) blaetter.push({ group, kette });
      return kette;
    },
    [],
  );
  return blaetter;
}

function istMessbar(v) {
  const art = valueTypeOf(v);
  if (art === 'number') return Number.isFinite(v);
  if (art === 'string') return coerceNumber(v) !== null;
  return art === 'date' || art === 'dur';
}

function wertAn(group, j) {
  const v = Array.isArray(group.values) ? group.values[j] : undefined;
  return v === undefined ? null : v;
}

// Die Tabelle des Gesamt-Werts (4T-002511, V9): eine Gruppe ohne Gruppen-Wert
// und ohne Gruppen-Spalte, weil `GROUP BY` fehlt.
function istGesamtTabelle(rs) {
  return (
    rs.type === 'table' &&
    rs.groups.length === 1 &&
    rs.groups[0].value === null &&
    !Array.isArray(rs.groups[0].groups) &&
    !(Array.isArray(rs.groupColumns) && rs.groupColumns.length > 0)
  );
}

/**
 * Was eine Kennzahl aus der Menge macht: die Einträge mit Wert und Gruppen-Kette
 * oder der Grund, aus dem sie nicht passt.
 * @param {import('../../../shared/query/result-set.js').ResultSet} rs
 * @returns {{ eintraege: Array<{ wert: unknown, kette: unknown[]|null }> }
 *   | { grund: string }}
 */
export function kennzahlAuswertung(rs) {
  if (rs.rows.length === 0) return { eintraege: [{ wert: 0, kette: null }] };
  if (!Array.isArray(rs.groups)) return { eintraege: [{ wert: rs.rows.length, kette: null }] };
  const blaetter = blattGruppen(rs);
  if (blaetter.length === 0) return { eintraege: [{ wert: 0, kette: null }] };
  if (rs.type !== 'table') {
    return { eintraege: blaetter.map((b) => ({ wert: b.group.rows.length, kette: b.kette })) };
  }
  const j = rs.columns.findIndex((_, k) => blaetter.some((b) => istMessbar(wertAn(b.group, k))));
  if (j < 0) return { grund: KENNZAHL_OHNE_ZAHL };
  const gesamt = istGesamtTabelle(rs);
  return {
    eintraege: blaetter.map((b) => ({ wert: wertAn(b.group, j), kette: gesamt ? null : b.kette })),
  };
}

// --- Kennzahl: Formatierung -------------------------------------------------------

function datumText(ms, locale) {
  const d = new Date(ms);
  const mitZeit = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  const optionen = mitZeit ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
  try {
    return new Intl.DateTimeFormat(locale || undefined, optionen).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, optionen).format(d);
  }
}

// Eine Dauer in den Wörtern der Oberflächen-Sprache, wo die Laufzeit sie kennt
// (`Intl.DurationFormat`); sonst die kompakte Form der Abfrage («1d 2h»).
function dauerText(ms, locale) {
  const DurationFormat = typeof Intl !== 'undefined' ? Intl.DurationFormat : undefined;
  if (typeof DurationFormat !== 'function' || ms < 0) return durToString(ms);
  let rest = Math.round(ms / 1000);
  const teile = {};
  for (const [einheit, sekunden] of [
    ['days', 86400],
    ['hours', 3600],
    ['minutes', 60],
    ['seconds', 1],
  ]) {
    teile[einheit] = Math.floor(rest / sekunden);
    rest -= teile[einheit] * sekunden;
  }
  try {
    return new DurationFormat(locale || undefined, { style: 'short' }).format(teile);
  } catch {
    return durToString(ms);
  }
}

/**
 * Der Text eines Kennzahl-Werts in der Oberflächen-Sprache: Zahl mit
 * Tausender-Trennung, Datum und Dauer in der Form der Sprache, jeder andere
 * Wert in der Text-Form der Abfrage; ein fehlender Wert als Strich.
 * @param {unknown} wert
 * @param {string} [locale]
 * @returns {string}
 */
export function kennzahlText(wert, locale) {
  const art = valueTypeOf(wert);
  if (art === null) return OHNE_WERT;
  if (art === 'number') return formatNumberMs(wert, locale) ?? String(wert);
  if (art === 'string' && coerceNumber(wert) !== null) {
    return formatNumberMs(coerceNumber(wert), locale) ?? wert;
  }
  if (art === 'date') return datumText(wert.ms, locale);
  if (art === 'dur') return dauerText(wert.ms, locale);
  return formatValue(wert);
}

function beschriftung(kette, translate) {
  return kette
    .map((v) => (v === null || v === undefined ? translate('query.group.none') : formatValue(v)))
    .join(GROUP_LEVEL_SEPARATOR);
}

function element(klasse, text) {
  const el = document.createElement('div');
  el.className = klasse;
  if (text !== undefined) el.textContent = text;
  return el;
}

function zeichneKennzahl(rs, context) {
  const ctx = context || {};
  const translate = typeof ctx.translate === 'function' ? ctx.translate : (key) => key;
  const auswertung = kennzahlAuswertung(rs);
  if (!auswertung.eintraege) throw new Error(`dashboard-formen: ${auswertung.grund}`);
  const { eintraege } = auswertung;
  const einzeln = eintraege.length === 1;
  const wurzel = element(
    `dashboard-kennzahl ${einzeln ? 'dashboard-kennzahl-einzeln' : 'dashboard-kennzahl-gruppen'}`,
  );
  for (const eintrag of eintraege) {
    const wert = element('dashboard-kennzahl-wert', kennzahlText(eintrag.wert, ctx.locale));
    if (einzeln) {
      wurzel.appendChild(wert);
      continue;
    }
    const gruppe = element('dashboard-kennzahl-gruppe');
    gruppe.appendChild(wert);
    gruppe.appendChild(
      element('dashboard-kennzahl-beschriftung', beschriftung(eintrag.kette || [], translate)),
    );
    wurzel.appendChild(gruppe);
  }
  return wurzel;
}

/** Interne Form `kennzahl`. */
export const kennzahlForm = {
  // Die Listen-Maske einer Datensatz-Abfrage zeigte Zeilen statt einer Zahl.
  listenMaske: false,
  // Ohne Treffer steht 0 statt «keine Treffer».
  auchOhneTreffer: true,
  isSuitable: (rs) => !!kennzahlAuswertung(rs).eintraege,
  unsuitableReason: (rs) => kennzahlAuswertung(rs).grund || null,
  render: zeichneKennzahl,
};

// --- Liste und Tabelle --------------------------------------------------------------

function translateDes(context) {
  return context && typeof context.translate === 'function' ? context.translate : (key) => key;
}

/** Interne Form `liste`: die Listen- oder Aufgaben-Ausgabe der Abfrage. */
export const listeForm = {
  isSuitable: (rs) => rs.type === 'list',
  render: (rs, context) => {
    const translate = translateDes(context);
    if (rs.scope === 'tasks') return buildTaskListDom(rs, translate);
    if (Array.isArray(rs.groups)) return buildGroupedListDom(rs, translate);
    return buildListDom(rs);
  },
};

/** Interne Form `tabelle`: die Tabellen-Ausgabe der Abfrage. */
export const tabelleForm = {
  isSuitable: (rs) => rs.type === 'table',
  render: (rs, context) => {
    const translate = translateDes(context);
    if (Array.isArray(rs.groups)) return buildGroupedTableDom(rs, translate);
    return buildTableDom(rs, translate);
  },
};

// Angemeldet beim Laden des Moduls, wie die eingebauten Formen in
// `display-forms.js`, damit keine Lade-Reihenfolge entscheidet, ob es sie gibt.
registriereVorgabeForm('kennzahl', kennzahlForm);
registriereVorgabeForm('liste', listeForm);
registriereVorgabeForm('tabelle', tabelleForm);
