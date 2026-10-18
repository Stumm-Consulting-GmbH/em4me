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
// 4T-002037 (Epic 3E-000360): Seither kommt von dort die ganze Zaun-Regel —
// Öffnung und Schluss eines Blocks —, und die Ersetzungen führen keinen eigenen
// Zaun-Ausdruck mehr.
const { zaunOeffnung, schliesstZaun } = require('./fence-level.js');
// 4T-002072 (Epic 3E-000192), Nachbesserung F5: die Heimat der Block-Kennungen,
// für die Frage, ob unter einer Datentabelle schon die Zeile ihres Namens steht.
const { extractBlockAnchors } = require('../block-anchors.js');

// 4T-002037 (Epic 3E-000360): **Erkannt wird jedes Konstrukt nach der
// Zaun-Regel der Anwendung** (src/shared/markdown/fence-level.js), nicht mehr
// über einen eigenen Ausdruck je Konstrukt. Bis dahin verlangten Tabelle,
// Datentabelle, Ereignis-Liste und die Fläche einen Backtick-Zaun, das Info-Wort
// unmittelbar nach dem Zaun und einen Schluss-Zaun, der dem öffnenden genau
// glich; der Datensatz-Block (4T-001833) ließ kein Leerzeichen vor dem Info-Wort
// zu. Die Ansicht zeigt das Konstrukt in jeder dieser Formen, der Export ließ es
// in den übrigen als Code-Block stehen. Umgekehrt wandelte der Export ein
// Info-Wort um, das mit dem Namen nur beginnt (`perspective-tablex`), das die
// Ansicht als gewöhnlichen Code-Block zeigt. Seither gilt für alle fünf:
// Öffner ist eine Zaun-Zeile der obersten Ebene aus Backticks oder Tilden, deren
// Sprache (erstes Wort des Infostrings) der Name ist; Schluss ist die erste
// Zeile, die nach der Regel schließt — dasselbe Zeichen, mindestens so lang,
// ohne Infostring. Ein Block ohne Schluss bleibt wie bisher stehen.
//
// **Der Ausklang hinter dem Schluss-Zaun ist der bisherige** und je Konstrukt
// verschieden, damit die Ausgabe um den Block zeichengleich bleibt: Die vier
// HTML-Konstrukte nehmen wie bisher Leerraum bis vor die letzte
// Leerzeilen-Grenze mit (`\s*$`), weil sich ein HTML-Block vom folgenden Absatz
// von selbst trennt; die Fläche setzt Markdown ein und nimmt allein Leerzeichen
// und Tabulatoren der Schluss-Zeile mit (`[ \t]*$`, Begründung in markdown.js).
const AUSKLANG = Object.freeze({
  leerraum: /\s*$/my,
  zeile: /[ \t]*$/my,
});

// Ende des Treffers: hinter der Schluss-Sequenz der Ausklang, gemessen wie im
// bisherigen Ausdruck an derselben Stelle. Trägt er nicht (ein Leerraum-Zeichen,
// das der Ausklang `zeile` nicht kennt), endet der Treffer am Zeilenende vor
// einem `\r`.
function trefferEnde(src, zeilenStart, zeilenEnde, zeile, ausklang) {
  const eigene = zaunOeffnung(zeile);
  const einrueckung = zeile.length - zeile.trimStart().length;
  const sequenzEnde = zeilenStart + einrueckung + eigene.laenge;
  const re = AUSKLANG[ausklang] || AUSKLANG.leerraum;
  re.lastIndex = sequenzEnde;
  const m = re.exec(src);
  if (m) return sequenzEnde + m[0].length;
  return src.charAt(zeilenEnde - 1) === '\r' ? zeilenEnde - 1 : zeilenEnde;
}

// Ersetzt alle Blöcke der Sprache `sprache`, die auf der obersten Ebene stehen.
// Liefert den neuen Text und ob mindestens ein Block tatsächlich konvertiert
// hat. Ein Block in einem äußeren Zaun ist zitierter Text und bleibt stehen
// (4T-001803); ein Block ohne Schluss ebenso.
//
// Der Konverter bekommt den Rumpf (die Zeilen zwischen Öffner und Schluss, ohne
// den Zeilenumbruch vor dem Schluss) und den Offset der Öffner-Zeile; liefert
// er `null`, bleibt der Rohtext stehen (4T-002072, Nachbesserung F5: der
// Offset, damit ein Konverter die Umgebung des Blocks befragen kann).
// `optionen.ausklang` ist `leerraum` (Vorgabe) oder `zeile` (Kopf-Kommentar).
// Ein Block, dessen Schluss unmittelbar auf den Öffner folgt, hat keinen Rumpf
// und bleibt wie bisher stehen.
function ersetzeObersteEbene(text, sprache, konverter, optionen = {}) {
  const src = String(text == null ? '' : text);
  const ausklang = optionen.ausklang === 'zeile' ? 'zeile' : 'leerraum';
  let getroffen = false;
  let aus = '';
  let kopiertBis = 0;
  let offen = null;
  let pos = 0;
  for (;;) {
    const nl = src.indexOf('\n', pos);
    const ende = nl === -1 ? src.length : nl;
    const zeile = src.slice(pos, ende);
    if (offen) {
      if (schliesstZaun(zeile, offen.oeffnung)) {
        if (offen.passt && pos > offen.rumpfStart && offen.start >= kopiertBis) {
          const html = konverter(src.slice(offen.rumpfStart, pos - 1), offen.start);
          if (html !== null) {
            aus += src.slice(kopiertBis, offen.start) + html;
            kopiertBis = trefferEnde(src, pos, ende, zeile, ausklang);
            getroffen = true;
          }
        }
        offen = null;
      }
    } else {
      const oeffnung = zaunOeffnung(zeile);
      if (oeffnung) {
        offen = { oeffnung, start: pos, rumpfStart: ende + 1, passt: oeffnung.sprache === sprache };
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (!getroffen) return { text: src, getroffen };
  return { text: aus + src.slice(kopiertBis), getroffen };
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
    const r = ersetzeObersteEbene(aktuell, 'perspective-table', (content) =>
      convertPerspectiveTableBlockToHtml(content),
    );
    aktuell = r.text;
    stand.table = r.getroffen;
  }
  // 4T-000418 (Epic 3E-000079): perspective-datatable wird beim Export zur
  // statischen HTML-Tabelle (alle Zeilen, mit Aggregat-Zeile); bei
  // Struktur-Fehlern bleibt der Fence unveraendert. Wie perspective-table an die
  // eigene Erweiterung gebunden (PO-Festlegung 2026-07-09): deaktiviert wird
  // nicht konvertiert.
  if (o.datatableEnabled) {
    const r = ersetzeObersteEbene(
      aktuell,
      'perspective-datatable',
      datentabellenKonverter(aktuell, o.zellHtml),
    );
    aktuell = r.text;
    stand.datatable = r.getroffen;
  }
  // 4T-000512 (Epic 3E-000092): perspective-events (Art 1) wird zur statischen
  // Tabelle mit Staffelung zum Export-Stichtag; Art 2 (query-Direktive) und
  // Struktur-Fehler bleiben unveraendert (PO-Festlegung 2026-07-15).
  if (o.eventsEnabled) {
    const r = ersetzeObersteEbene(aktuell, 'perspective-events', (content) =>
      convertPerspectiveEventsBlockToHtml(content, { labels: o.labels }),
    );
    aktuell = r.text;
    stand.events = r.getroffen;
  }
  // 4T-001548 (Epic 3E-000251, E29.2): der Datensatz-Block der Datenbank,
  // vollständig und ohne das Anzeige-Fenster der Anwendung. Seit 4T-001833
  // (Epic 3E-000254) schloss er als erstes Konstrukt nach der Standard-Regel;
  // seit 4T-002037 gilt die ganze Zaun-Regel für alle fünf Ersetzungen.
  if (o.recordsEnabled) {
    const r = ersetzeObersteEbene(aktuell, RECORD_FENCE, (content) =>
      convertPerspectiveRecordsBlockToHtml(content, { fields: o.fields, labels: o.labels }),
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
