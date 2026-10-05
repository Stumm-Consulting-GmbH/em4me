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
// 4T-002072 (Epic 3E-000192), Nachbesserung F5: Ein Konverter bekommt neben
// dem Rumpf den Offset seines Öffners. Der der Datentabelle fragt damit die
// Heimat der Block-Kennungen, ob unter der Tabelle schon die Zeile `^Name`
// ihres Kopf-Namens steht, und schreibt sie dann nicht ein zweites Mal.
//
// Prozess-neutral (kein Electron, kein DOM). Der Zugriff auf `markdown.js` aus
// `perspective-table.js` heraus bleibt lazy und unberührt.
'use strict';

const { convertPerspectiveTableBlockToHtml } = require('./perspective-table.js');
const { convertPerspectiveDatatableBlockToHtml } = require('./perspective-datatable.js');
const { convertPerspectiveEventsBlockToHtml } = require('./perspective-events.js');
const { convertPerspectiveRecordsBlockToHtml } = require('./perspective-records-html.js');
const { RECORD_FENCE } = require('../database/record-block.js');
// 4T-001803 (Epic 3E-000291): das gemeinsame Urteil «Öffner der obersten Ebene».
// Es liegt in einem abhängigkeitsfreien Nachbar-Modul, weil außer den vier
// Konstrukten hier auch die Fläche im Pipeline-Kern und die beiden
// Journal-Blöcke unter src/shared/ danach fragen.
const { fenceOeffnerOffsets } = require('./fence-level.js');
// 4T-002072 (Epic 3E-000192), Nachbesserung F5: die Heimat der Block-Kennungen,
// für die Frage, ob unter einer Datentabelle schon die Zeile ihres Namens steht.
const { extractBlockAnchors } = require('../block-anchors.js');

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
//
// 4T-001833 (Epic 3E-000254): **Der Datensatz-Block schließt nach der
// Standard-Regel** und nicht nur an einer Zeile, die dem öffnenden Zaun
// gleicht. Öffnend sind Backticks ODER Tilden (Gruppe 2 hält das Zeichen);
// schließend ist die erste Zeile mit bis zu drei Leerzeichen Einrückung, der
// öffnenden Sequenz, beliebig vielen weiteren Zeichen derselben Art und danach
// nur Leerraum. Eine kürzere innere Zeile oder eine mit Sprach-Angabe beendet
// den Block damit nicht. Der Rumpf steht in Gruppe 3. Der Schluss `\s*$` ist
// bewusst der bisherige: Er nimmt wie zuvor eine folgende Leerzeile mit in den
// Treffer, und die Ausgabe um den Block bleibt zeichengleich (Snapshot des
// portablen Exports). Die drei übrigen Arten
// bleiben bei ihrer bisherigen Erkennung; sie sind nicht Gegenstand des
// Vorgangs.
const RECORDS_RE = new RegExp(
  '^ {0,3}((`|~)\\2{2,})' + RECORD_FENCE + '[^\\n]*\\n([\\s\\S]*?)\\n {0,3}\\1\\2*\\s*$',
  'gm',
);
const RECORDS_INHALT_GRUPPE = 3;

// Ersetzt alle Fences einer Art, die auf der obersten Ebene stehen. Liefert den
// neuen Text und ob mindestens eine Fence tatsächlich konvertiert hat.
//
// Die Offsets werden je Durchgang am **übergebenen** Text berechnet, weil jede
// vorangegangene Ersetzung die folgenden verschiebt. Ein Treffer, der nicht
// selbst ein Block der obersten Ebene ist, bleibt als Rohtext stehen; das ist
// derselbe Ausgang wie beim `null` eines Konverters.
//
// 4T-001833 (Epic 3E-000254): `inhaltGruppe` nennt die Gruppe des Rumpfes; ohne
// Angabe ist es wie bisher die zweite. Der Datensatz-Block braucht eine
// zusätzliche Gruppe für das Zaun-Zeichen. Ausdrücke mit benannten Gruppen
// sind hier nicht vorgesehen, weil der Offset als vorletztes Argument gelesen
// wird.
//
// 4T-002072, Nachbesserung F5: Der Konverter bekommt als zweites Argument den
// Offset des Öffners im übergebenen Text, damit er dessen Umgebung befragen
// kann; die bisherigen Konverter lesen nur den Rumpf und bleiben unverändert.
function ersetzeObersteEbene(text, regex, konverter, inhaltGruppe = 2) {
  let getroffen = false;
  const offsets = fenceOeffnerOffsets(text);
  const neu = text.replace(regex, (match, ...args) => {
    const offset = args[args.length - 2];
    const content = args[inhaltGruppe - 1];
    if (!offsets.has(offset)) return match;
    const html = konverter(content, offset);
    if (html === null) return match;
    getroffen = true;
    return html;
  });
  return { text: neu, getroffen };
}

// 4T-002072, Nachbesserung F5: Der Konverter der Datentabelle für den Text
// `text`. Ob unter einer Tabelle schon die Zeile `^Name` ihres Kopf-Namens
// steht, sagt die Heimat der Kennungen (`ankerZeile`), einmal je Text erhoben;
// dann schreibt der Konverter sie nicht ein zweites Mal. Der Text ist der
// Körper ohne Frontmatter (markdown.js schneidet es vorher ab). `zellHtml` ist
// der Zell-Renderer der Text-Zellen (4T-002014), unverändert durchgereicht.
function datentabellenKonverter(text, zellHtml) {
  let anker = null;
  return (content, offset) => {
    if (!anker) anker = extractBlockAnchors(text, { frontmatter: false });
    const zaunVon = text.slice(0, offset).split('\n').length;
    const tabelle = anker.datentabellen.find((t) => t.zaunVon === zaunVon);
    return convertPerspectiveDatatableBlockToHtml(content, {
      zellHtml,
      ankerZeileFolgt: !!(tabelle && tabelle.ankerZeile),
    });
  };
}

// Konvertiert die vier Fence-Arten des portablen Exports.
//
// `opts` trägt je Art ihren Erweiterungs-Schalter, dazu die aufgelösten Labels
// und — allein für den Datensatz-Block — die Feld-Definition seiner Datei: Er
// ist das einzige Konstrukt, dessen Spalten außerhalb der Fence stehen (E3.2).
// 4T-002014 (Epic 3E-000332): `opts.zellHtml` ist der Zell-Renderer der
// Datentabelle für den Export; die Pipeline baut ihn mit ihrem Schalter-Stand.
//
// Liefert `{ text, table, datatable, events, records }`; die vier Schalter
// sagen, welche Art konvertiert hat.
function convertPortableFences(text, opts) {
  const o = opts || {};
  let aktuell = String(text == null ? '' : text);
  const stand = { table: false, datatable: false, events: false, records: false };

  if (o.tableEnabled) {
    const r = ersetzeObersteEbene(aktuell, TABLE_RE, (content) =>
      convertPerspectiveTableBlockToHtml(content),
    );
    aktuell = r.text;
    stand.table = r.getroffen;
  }
  if (o.datatableEnabled) {
    const r = ersetzeObersteEbene(
      aktuell,
      DATATABLE_RE,
      datentabellenKonverter(aktuell, o.zellHtml),
    );
    aktuell = r.text;
    stand.datatable = r.getroffen;
  }
  if (o.eventsEnabled) {
    const r = ersetzeObersteEbene(aktuell, EVENTS_RE, (content) =>
      convertPerspectiveEventsBlockToHtml(content, { labels: o.labels }),
    );
    aktuell = r.text;
    stand.events = r.getroffen;
  }
  if (o.recordsEnabled) {
    const r = ersetzeObersteEbene(
      aktuell,
      RECORDS_RE,
      (content) =>
        convertPerspectiveRecordsBlockToHtml(content, { fields: o.fields, labels: o.labels }),
      RECORDS_INHALT_GRUPPE,
    );
    aktuell = r.text;
    stand.records = r.getroffen;
  }

  return { text: aktuell, ...stand };
}

module.exports = {
  convertPortableFences,
  ersetzeObersteEbene,
};
