// 4T-001547 (Epic 3E-000251, E3.7): Die Anzeige des Datensatz-Blocks —
// Tabellen-HTML aus dem geparsten Block und der Definition seiner Datei.
//
// **Warum dieses Modul hier liegt und nicht in `database/`.** Sein Gegenstand
// ist die Darstellung eines Markdown-Konstrukts, und die beiden Geschwister
// (`perspective-datatable-html.js`, `perspective-events.js`) liegen aus
// demselben Grund hier. Das **Format** der Ablage liegt getrennt davon in
// `src/shared/database/`; die Naht zwischen beidem ist E4, das den Format-Teil
// von T2 prozess-neutral verortet und die Anzeige davon trennt.
//
// **Die Anzeige-Grenze ist ein Fenster und keine Kappung** (E3.7). Der
// Unterschied ist nicht sprachlich: Eine Kappung schneidet ab und lässt den
// Anwender im Unklaren, ein Fenster zeigt einen Ausschnitt und **sagt, dass und
// wovon** es einer ist. Bei einer Tabelle, deren Zweck mehrere tausend
// Datensätze sind, wäre ein stilles Abschneiden kein Schutz, sondern ein
// Ausfall der Funktion.
//
// Prozess-neutral (kein Electron, kein DOM — reine String-Erzeugung), wie die
// beiden Geschwister-Bauer.
'use strict';

const { escapeHtml } = require('./slug.js');
const { parseRecordBlock } = require('../database/record-block.js');
const { hinweisSatz } = require('../database/table-hinweise.js');

// Obergrenze der gerenderten Datensätze.
//
// **Gemessen und nicht gesetzt** (E3.7; Weg A, Entscheidung des Product Owners
// vom 2026-09-07). Die beiden Nachbar-Konstrukte stehen bei je 1000 Zeilen,
// aber ihre Zahl ist eine **Schutz-Kappung** für Prosa-Konstrukte, die
// gelegentlich zu groß geraten, und kein Arbeits-Fenster eines Datenspeichers;
// sie wird deshalb ausdrücklich nicht übernommen.
//
// **Gemessen am 2026-09-07** an der gebauten Programmdatei mit abgeschaltetem
// Fenster, Aufbau nach dem Muster der Editor-Messung vom 2026-08-25: Dokumente
// mit 1000, 5000 und 10000 Datensätzen zu je fünfzehn Spalten, jedes in
// Lese-Ansicht und Änderungs-Modus.
//
//   1000  beide Ansichten sofort, nichts ruckelt
//   5000  beide Ansichten nach 2 bis 3 Sekunden, nichts ruckelt
//   10000 Lese-Ansicht nach rund 7, Änderungs-Modus nach rund 4 Sekunden
//
// **Die Grenze ist die Wartezeit und nicht die Stabilität:** Kein Bestand hat
// die Oberfläche verloren, auch der größte nicht. Der Wert liegt deshalb
// unterhalb der ersten spürbaren Verzögerung — 1000 ist sofort da, 5000 kostet
// zwei bis drei Sekunden bei jedem Öffnen, und die zahlt ein Anwender nicht für
// einen Ausschnitt, den er ohnehin nicht am Stück liest.
//
// **Nicht die 1000 der beiden Nachbar-Konstrukte.** Deren Zahl ist eine
// Schutz-Kappung für Prosa-Konstrukte, die gelegentlich zu groß geraten; hier
// ist Größe der Normalfall, und die Messung zeigt Luft. Der doppelte Wert nutzt
// sie, ohne die Wartezeit spürbar zu machen.
const MAX_RECORD_ROWS = 2000;

// Der Wahrheitswert erscheint als Haken statt als `x`: Die Ablage ist
// zeichen-sparsam, die Anzeige soll gelesen werden.
const BOOLEAN_MARK = '✓';

// Zahl mit den Nachkommastellen ihrer Spalte, wenn sie welche erklärt hat
// (E5.5). Ohne Angabe bleibt der geschriebene Wert stehen — ein Datenspeicher
// rundet nicht von sich aus, und `decimals` ist ausdrücklich ein
// Anzeige-Format und keine Rundung beim Schreiben.
function zahlAnzeige(feld, zelle) {
  const stellen = feld && feld.options ? feld.options.decimals : null;
  if (typeof stellen === 'number' && Number.isInteger(stellen) && stellen >= 0) {
    return zelle.value.toFixed(stellen);
  }
  return zelle.text.trim();
}

// Anzeige-Text einer Zelle. **Eine Zelle mit Befund zeigt ihren Rohtext**, denn
// er ist das, was in der Datei steht; die Klasse macht ihn kenntlich, statt ihn
// zu ersetzen (E3.7, kein stiller Verlust).
function zellInhalt(feld, zelle) {
  if (!zelle) return '';
  if (zelle.error) return escapeHtml(zelle.text);
  const typ = (feld && feld.type) || 'string';
  if (typ === 'boolean') return zelle.value === true ? BOOLEAN_MARK : '';
  if (typ === 'number') return zelle.value === null ? '' : escapeHtml(zahlAnzeige(feld, zelle));
  return escapeHtml(zelle.text);
}

// Beschriftung einer Spalte: der einfache Text der Beschriftung, sonst der
// Feld-Name.
//
// **Eine Sprach-Zuordnung wird hier ausdrücklich NICHT aufgelöst.** Die
// Auflösung über die Rückfall-Kette gehört zur Mehrsprachigkeit der
// Datenbank-Objekte (T24) und ist in der Abgrenzung von 4S-000885 eigens
// ausgenommen; eine halbe Auflösung an dieser Stelle wäre eine zweite,
// stillschweigende Kette neben der späteren richtigen.
function spaltenKopf(feld) {
  const label = feld && typeof feld.label === 'string' ? feld.label : '';
  return escapeHtml(label || (feld && feld.name) || '');
}

// Baut die Tabelle eines Datensatz-Blocks.
//
// `model` ist das Ergebnis von `parseRecordBlock`, `fields` die normalisierten
// Feld-Definitionen derselben Datei. `opts.labels` liefert die lokalisierten
// Texte, `opts.beschriftung` löst die Spalten-Beschriftung auf, `opts.max`
// überschreibt die Fenster-Größe (die Messung nutzt das, der Produktivpfad
// nicht).
//
// **Ohne Felder entsteht keine Tabelle**, sondern ein Hinweis: Eine Spalten-Zahl
// ist ohne Definition nicht bestimmt, und geratene Spalten wären schlechter als
// die ehrliche Auskunft, dass die Datei keine Tabelle beschreibt.
function buildRecordsHtml(model, fields, opts) {
  const o = opts || {};
  const L = (key) => (o.labels && typeof o.labels[key] === 'string' ? o.labels[key] : key);
  const felder = Array.isArray(fields) ? fields : [];
  const records = (model && model.records) || [];
  const hints = (model && model.hints) || [];

  if (felder.length === 0) {
    return (
      `<div class="prc-note prc-note-nodef">${escapeHtml(L('records.noDefinition'))}</div>` +
      hinweisHtml(hints, L)
    );
  }

  const grenze = typeof o.max === 'number' && o.max > 0 ? o.max : MAX_RECORD_ROWS;
  const sichtbar = records.slice(0, grenze);
  const out = ['<table class="prc-table">', '<thead><tr>'];
  for (const feld of felder) {
    out.push(
      `<th class="prc-head prc-type-${escapeHtml(feld.type || 'string')}">` +
        `${spaltenKopf(feld)}</th>`,
    );
  }
  out.push('</tr></thead>');

  if (records.length === 0) {
    out.push(
      `<tbody><tr><td class="prc-empty" colspan="${felder.length}">` +
        `${escapeHtml(L('records.empty'))}</td></tr></tbody>`,
    );
  } else {
    out.push('<tbody>');
    for (const record of sichtbar) {
      const kennung = record.id ? ` data-rec-id="${escapeHtml(record.id)}"` : '';
      out.push(`<tr class="prc-row"${kennung}>`);
      felder.forEach((feld, i) => {
        const zelle = record.cells[i];
        const klassen = ['prc-cell', `prc-type-${feld.type || 'string'}`];
        if (zelle && zelle.error) klassen.push('prc-error');
        const befund = zelle && zelle.error ? ` data-rec-err="${escapeHtml(zelle.error)}"` : '';
        out.push(
          `<td class="${escapeHtml(klassen.join(' '))}"${befund}>${zellInhalt(feld, zelle)}</td>`,
        );
      });
      out.push('</tr>');
    }
    out.push('</tbody>');
  }
  out.push('</table>');

  // **Das Fenster benennt sich selbst.** Ohne diese Zeile wäre die Anzeige eine
  // Kappung, und der Anwender sähe nicht, dass unten etwas fehlt.
  if (records.length > sichtbar.length) {
    const text = L('records.window')
      .replace('{shown}', String(sichtbar.length))
      .replace('{total}', String(records.length));
    out.push(
      `<div class="prc-window" data-rec-shown="${sichtbar.length}" ` +
        `data-rec-total="${records.length}">${escapeHtml(text)}</div>`,
    );
  }
  out.push(hinweisHtml(hints, L));
  return out.join('');
}

// Befund-Liste. **Jede Zeile ist ein Satz in der Sprache des Anwenders**
// (4T-001584) und nicht mehr der Code des Formats mit seiner Position in
// Klammern: Ein Codewort führt nur den, der das Format ohnehin kennt, und die
// Liste richtet sich an den Autor der Datei. Die Position steht deshalb im Satz
// statt hinter ihm; ein Befund am ganzen Block bekommt die Satzform ohne sie.
//
// **Der Code bleibt als Daten-Attribut am Punkt stehen**, weil Prüfung und
// Oberfläche ihn adressieren; sichtbar ist allein der Satz. Gebaut wird er von
// derselben Stelle wie der Satz der Übersichts-Seite, damit ein Code nicht an
// zwei Orten übersetzt wird.
function hinweisHtml(hints, L) {
  if (!hints || hints.length === 0) return '';
  const zeilen = hints.map(
    (h) =>
      `<li class="prc-hint" data-rec-code="${escapeHtml(h.code)}">` +
      `${escapeHtml(hinweisSatz(h, L))}</li>`,
  );
  return (
    `<div class="prc-hints"><span class="prc-hints-title">${escapeHtml(L('records.hints'))}</span>` +
    `<ul>${zeilen.join('')}</ul></div>`
  );
}

// Der vollständige Fence-Container samt Tabelle, wie ihn die Pipeline ausgibt.
//
// **Der Bau steht hier und nicht in der Pipeline**, anders als bei den beiden
// Geschwister-Konstrukten: Deren Zweige sind dort gewachsen, bis die
// Größen-Ratsche von `markdown.js` anschlug, und die Ausnahme-Liste bevorzugt
// ausdrücklich den Schnitt vor der Anhebung. Die Pipeline behält damit die
// Rolle, die ihr zusteht, nämlich die Fence zu erkennen und weiterzureichen.
//
// `model` und `fields` kommen aus dem Format-Modul, `opts` trägt Index,
// Zeilen-Lage, Rohtext und die lokalisierten Texte.
function renderRecordsFence(model, fields, opts) {
  const o = opts || {};
  const rumpf = String(o.body == null ? '' : o.body);
  return (
    `<div class="perspective-records" data-rec-index="${Number(o.index) || 0}" ` +
    `data-rec-line-start="${Number(o.lineStart) || 0}" ` +
    `data-rec-line-end="${Number(o.lineEnd) || 0}" ` +
    `data-source-line="${Number(o.lineStart) || 0}" ` +
    `data-rec-source="${escapeHtml(rumpf)}">` +
    `${buildRecordsHtml(model, fields, o)}</div>\n`
  );
}

// --- Portabler Export (4T-001548, E29.2) ----------------------------------------------
//
// **Der eine Unterschied zur Anzeige ist das fehlende Fenster.** In der
// Anwendung zeigt die Fence einen Ausschnitt, im Export steht die Tabelle
// vollständig. Ein stilles Weglassen von Datensätzen in einer Datei, die die
// Anwendung verlässt, wäre genau der Datenverlust, den E3.7 ausschließt: Der
// Empfänger hat die Anwendung nicht und merkt nichts.
//
// **Der zweite Unterschied ist die Form, nicht der Inhalt.** Das exportierte
// Dokument hat kein Stylesheet, deshalb trägt jede Zelle ihre Ausrichtung als
// Inline-Angabe — dasselbe Muster, mit dem Datentabelle und Ereignisse ihre
// statischen Tabellen bauen.

// Ausrichtung nach dem Typ der Spalte.
function ausrichtung(feld) {
  if (feld && feld.type === 'number') return 'text-align: right;';
  if (feld && feld.type === 'boolean') return 'text-align: center;';
  return '';
}

// Zeilenumbruch einer Zelle als `<br>` statt als rohes Zeichen. **Das ist keine
// Verschönerung, sondern die Paritäts-Bedingung und zugleich ein Schutz.** In
// der Anwendung hält `white-space: pre-wrap` die Umbrüche einer mehrzeiligen
// Zelle; der Export hat kein Stylesheet, und ohne diesen Schritt stünde
// derselbe Wert beim Empfänger als eine durchlaufende Zeile. Der Schutz liegt
// daneben: Ein roher Umbruch mit einer Leerzeile darin beendet den HTML-Block
// des Markdown-Parsers, und die halbe Tabelle erschiene als Text. Beide
// Geschwister-Konstrukte haben das Problem nicht, weil ihre Zellen einzeilig
// sind; dieses trägt den Typ `multiline`.
function mitUmbruechen(html) {
  return html.replace(/\r?\n/g, '<br>');
}

// Die Befunde, deren Vorliegen bedeutet: Der Block trägt Inhalt, den eine
// Tabelle nicht zeigt.
const VERLUST_CODES = new Set(['recordStrayContent', 'recordCellsExtra', 'recordNoDefinition']);

// **Wo der Export etwas verlöre, weicht er zurück** und lässt die Fence
// unverändert stehen (Muster der Datentabelle, die bei Struktur-Fehlern `null`
// liefert). Der Grund ist E3.7: Überzählige Zellen, loser Text und nicht
// ausgelegte Angaben am Datensatz-Marker bleiben in der Ablage unangetastet
// stehen, und eine Tabelle hat für sie keinen Platz. Im Roh-Zustand der Fence
// überlebt jedes Zeichen; in einer Tabelle, die sie weglässt, wäre der Verlust
// endgültig und für den Empfänger unsichtbar.
//
// **Weiche Befunde ohne verstecktes Zeichen führen dagegen nicht zum Rückzug.**
// Ein Datensatz mit zu wenigen Zellen zeigt leere Zellen, und eine gemeldete
// Kennung steht ohnehin nicht in der Tabelle; beides kostet nichts.
function traegtUngezeigtenInhalt(model, felder) {
  if (felder.length === 0) return true;
  const hints = (model && model.hints) || [];
  if (hints.some((h) => h && VERLUST_CODES.has(h.code))) return true;
  return ((model && model.records) || []).some((r) => r && r.attrsRest);
}

// Statische Tabelle für den portablen Export: **alle** Datensätze, ohne
// Fenster, ohne Befund-Liste. Die Befund-Codes sind Begriffe des Formats und
// eine Rückmeldung an den Autor; in der weitergegebenen Fassung wären sie für
// den Empfänger Rauschen, und die Fälle, in denen sie etwas verbergen, hat
// `traegtUngezeigtenInhalt` bereits abgefangen.
function buildPortableRecordsHtml(model, felder, opts) {
  const o = opts || {};
  const L = (key) => (o.labels && typeof o.labels[key] === 'string' ? o.labels[key] : key);
  const records = (model && model.records) || [];
  const out = ['<table>'];
  out.push('<thead><tr>');
  for (const feld of felder) {
    const stil = ausrichtung(feld);
    out.push(
      `<th scope="col"${stil ? ` style="${stil}"` : ''}>${mitUmbruechen(spaltenKopf(feld))}</th>`,
    );
  }
  out.push('</tr></thead>');
  if (records.length === 0) {
    out.push(
      `<tbody><tr><td colspan="${felder.length}" style="font-style: italic;">` +
        `${escapeHtml(L('records.empty'))}</td></tr></tbody>`,
    );
  } else {
    out.push('<tbody>');
    for (const record of records) {
      out.push('<tr>');
      felder.forEach((feld, i) => {
        const zelle = record.cells[i];
        const stile = [];
        const stil = ausrichtung(feld);
        if (stil) stile.push(stil);
        // Eine Zelle mit Befund zeigt ihren Rohtext und ist farblich kenntlich
        // (Farben der Datentabelle, damit beide Exporte gleich aussehen).
        if (zelle && zelle.error) stile.push('background-color: #ffebee; color: #b71c1c;');
        out.push(
          `<td${stile.length ? ` style="${stile.join(' ')}"` : ''}>` +
            `${mitUmbruechen(zellInhalt(feld, zelle))}</td>`,
        );
      });
      out.push('</tr>');
    }
    out.push('</tbody>');
  }
  out.push('</table>');
  return out.join('');
}

// Einstieg des Export-Wegs: Rumpf der Fence hinein, statische Tabelle heraus —
// oder `null`, wenn die Fence unverändert bleiben soll.
function convertPerspectiveRecordsBlockToHtml(content, opts) {
  const o = opts || {};
  const felder = Array.isArray(o.fields) ? o.fields : [];
  const model = parseRecordBlock(content, felder);
  if (traegtUngezeigtenInhalt(model, felder)) return null;
  return buildPortableRecordsHtml(model, felder, o);
}

// Die Schlüssel, die dieses Modul lokalisiert. Die Label-Auflösung der
// Pipeline reicht bewusst nur eine benannte Liste durch und nicht die ganze
// Sprachdatei; ohne diesen Eintrag stünden hier die Schlüssel-Namen.
// Die Sätze der Befund-Liste stehen unter dem Präfix der Datenbank-Hinweise und
// nicht unter `records.`: Es ist derselbe Diagnose-Katalog, den die
// Übersichts-Seite der Datenbank zeigt, und ein Code trägt dort und hier
// denselben Satz (4T-001584). Die beiden allgemeinen Schlüssel reisen mit, weil
// der gemeinsame Bauer auf sie zurückfällt.
const RECORD_LABEL_KEYS = [
  'records.window',
  'records.empty',
  'records.noDefinition',
  'records.hints',
  'database.hint.unknown',
  'database.hint.location',
  'database.hint.recordStrayContent',
  'database.hint.recordStrayContent.ohneOrt',
  'database.hint.recordCellsMissing',
  'database.hint.recordCellsExtra',
  'database.hint.recordNoDefinition',
  'database.hint.recordIdInvalid',
];

module.exports = {
  MAX_RECORD_ROWS,
  BOOLEAN_MARK,
  RECORD_LABEL_KEYS,
  buildRecordsHtml,
  renderRecordsFence,
  buildPortableRecordsHtml,
  convertPerspectiveRecordsBlockToHtml,
};
