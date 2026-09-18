// 4T-001548 (Epic 3E-000251): aus src/shared/markdown/markdown.js geschnitten.
// Die Fence-Konvertierung des portablen Exports — jedes Konstrukt, das beim
// Export zu statischem HTML wird, mit seiner Fence-Erkennung an einer Stelle.
//
// **Warum der Schnitt.** Der Datensatz-Block ist das vierte Konstrukt dieser
// Art, und `markdown.js` steht an seiner eingefrorenen Größen-Grenze; die
// Ausnahme-Liste des Budgets zieht den Schnitt der Anhebung ausdrücklich vor.
// Der Zuschnitt folgt der Fachlichkeit und nicht dem Platzbedarf: Alle vier
// Zweige tun dasselbe — eine Fence erkennen, ihren Rumpf an einen Konverter
// geben und bei `null` den Rohtext stehen lassen —, und keiner von ihnen
// braucht den Pipeline-Kern. Was im Kern bleibt, ist die Klammer darum: die
// Abschaltung von KaTeX für die Dauer der Konvertierung und der Marker an der
// Datei-Spitze.
//
// **Der Vertrag ist unverändert.** Jeder Konverter liefert `null`, wenn die
// Fence unangetastet bleiben soll (Struktur-Fehler, eine Art, die es im Export
// nicht gibt, oder Inhalt, den eine statische Tabelle verlöre); der Aufrufer
// setzt dann den Rohtext zurück. Die zurückgemeldeten Schalter sagen, welche
// Arten tatsächlich konvertiert haben — daran hängt der Portable-Marker.
//
// Prozess-neutral (kein Electron, kein DOM). Der Zugriff auf `markdown.js` aus
// `perspective-table.js` heraus bleibt lazy und unberührt.
'use strict';

const { convertPerspectiveTableBlockToHtml } = require('./perspective-table.js');
const { convertPerspectiveDatatableBlockToHtml } = require('./perspective-datatable.js');
const { convertPerspectiveEventsBlockToHtml } = require('./perspective-events.js');
const { convertPerspectiveRecordsBlockToHtml } = require('./perspective-records-html.js');
const { RECORD_FENCE } = require('../database/record-block.js');

// Fence-Erkennung: öffnender Zaun in Spalte 0 bis 3, Infostring bis zum
// Zeilenende, Rumpf bis zum gleich langen schließenden Zaun. Der Name steht als
// Parameter, damit der Datensatz-Block seine Kennung aus dem Format-Modul
// nimmt statt sie hier ein zweites Mal zu führen.
function fenceRegexFuer(name) {
  return new RegExp('^( {0,3}`{3,})' + name + '[^\\n]*\\n([\\s\\S]*?)\\n\\1\\s*$', 'gm');
}

const TABLE_RE = fenceRegexFuer('perspective-table');
// 4T-000418 (Epic 3E-000079): perspective-datatable wird beim Export zur
// statischen HTML-Tabelle (alle Zeilen, mit Aggregat-Zeile); bei
// Struktur-Fehlern bleibt der Fence unveraendert. Wie perspective-table an die
// eigene Erweiterung gebunden (PO-Festlegung 2026-07-09): deaktiviert wird
// nicht konvertiert.
const DATATABLE_RE = fenceRegexFuer('perspective-datatable');
// 4T-000512 (Epic 3E-000092): perspective-events (Art 1) wird zur statischen
// Tabelle mit Staffelung zum Export-Stichtag; Art 2 (query-Direktive) und
// Struktur-Fehler bleiben unveraendert (PO-Festlegung 2026-07-15).
const EVENTS_RE = fenceRegexFuer('perspective-events');
// 4T-001548 (Epic 3E-000251, E29.2): der Datensatz-Block der Datenbank,
// vollständig und ohne das Anzeige-Fenster der Anwendung.
const RECORDS_RE = fenceRegexFuer(RECORD_FENCE);

// Ersetzt alle Fences einer Art. Liefert den neuen Text und ob mindestens eine
// Fence tatsächlich konvertiert hat.
function ersetze(text, regex, konverter) {
  let getroffen = false;
  const neu = text.replace(regex, (match, fence, content) => {
    const html = konverter(content);
    if (html === null) return match;
    getroffen = true;
    return html;
  });
  return { text: neu, getroffen };
}

// Konvertiert die vier Fence-Arten des portablen Exports.
//
// `opts` trägt je Art ihren Erweiterungs-Schalter, dazu die aufgelösten Labels
// und — allein für den Datensatz-Block — die Feld-Definition seiner Datei: Er
// ist das einzige Konstrukt, dessen Spalten außerhalb der Fence stehen (E3.2).
//
// Liefert `{ text, table, datatable, events, records }`; die vier Schalter
// sagen, welche Art konvertiert hat.
function convertPortableFences(text, opts) {
  const o = opts || {};
  let aktuell = String(text == null ? '' : text);
  const stand = { table: false, datatable: false, events: false, records: false };

  if (o.tableEnabled) {
    const r = ersetze(aktuell, TABLE_RE, (content) => convertPerspectiveTableBlockToHtml(content));
    aktuell = r.text;
    stand.table = r.getroffen;
  }
  if (o.datatableEnabled) {
    const r = ersetze(aktuell, DATATABLE_RE, (content) =>
      convertPerspectiveDatatableBlockToHtml(content),
    );
    aktuell = r.text;
    stand.datatable = r.getroffen;
  }
  if (o.eventsEnabled) {
    const r = ersetze(aktuell, EVENTS_RE, (content) =>
      convertPerspectiveEventsBlockToHtml(content, { labels: o.labels }),
    );
    aktuell = r.text;
    stand.events = r.getroffen;
  }
  if (o.recordsEnabled) {
    const r = ersetze(aktuell, RECORDS_RE, (content) =>
      convertPerspectiveRecordsBlockToHtml(content, { fields: o.fields, labels: o.labels }),
    );
    aktuell = r.text;
    stand.records = r.getroffen;
  }

  return { text: aktuell, ...stand };
}

module.exports = {
  convertPortableFences,
};
