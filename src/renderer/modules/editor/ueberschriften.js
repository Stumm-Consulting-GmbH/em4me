// 4T-002558 (Epic 3E-000390): Ermittlung der Überschriften aus dem Lezer-Baum,
// gemeinsam genutzt vom Falt-Aufbau (folding.js), vom Inhaltsverzeichnis-Panel
// (panels/panel-outline.js) und vom Inhaltsverzeichnis-Block der Live-Ansicht
// (live/live-toc.js). Aus folding.js und panel-outline.js herausgezogen, statt
// die Erkennung ein drittes Mal zu schreiben; das Verhalten von Panel und
// Faltung ändert sich dadurch nicht.
//
// Für den Block liefert das Modul die Quellzeilen der Überschriften, nicht
// ihren Text: Der Paritäts-Nachweis im Task 4T-002558 hat gezeigt, dass der
// bereinigte Zeilentext des Panels bei Inline-Auszeichnung (Fett, Code-Span,
// Verweis) und bei einem expliziten `{#id}` andere Anker ergibt als die
// gerenderte Ansicht. Die Pipeline zerlegt die Quellzeilen deshalb selbst
// (src/shared/markdown/plugins/toc.js), mit denselben Regeln wie das Dokument.
'use strict';

import { syntaxTree } from '@codemirror/language';

const UEBERSCHRIFT_KNOTEN = /^(?:ATX|Setext)Heading([1-6])$/;

// Ebene eines Knotens im Lezer-Baum, 0 für alles, was keine Überschrift ist.
export function ueberschriftEbene(nodeName) {
  const m = UEBERSCHRIFT_KNOTEN.exec(nodeName);
  return m ? parseInt(m[1], 10) : 0;
}

// Extrahiert den Text einer Heading-Zeile aus dem Doc, mit ATX- bzw. Setext-
// Bereinigung. Trailing '#' bei ATX werden mit entfernt. (Aus panel-outline.js
// übernommen, dort weiter exportiert.)
export function extractHeadingText(doc, lineNumber) {
  if (lineNumber < 1 || lineNumber > doc.lines) return '';
  const lineObj = doc.line(lineNumber);
  let raw = lineObj.text;
  // 4T-000202: trailing Attribut-Block ({#id}/{.klasse}, markdown-it-attrs)
  // gehoert nicht in den Outline-Titel — der Render strippt ihn ebenso.
  raw = raw.replace(/\{[^\s{}][^{}]*\}[ \t]*$/, '');
  const atx = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
  if (atx) return atx[1].trim();
  return raw.trim();
}

// Quelltext eines Bereichs ohne die Kommentar-Bereiche darin (die Pipeline
// entfernt `%%…%%` vor dem Rendern ebenso).
function ohneKommentare(doc, from, to, kommentare) {
  let text = '';
  let pos = from;
  for (const k of kommentare) {
    if (k.to <= pos || k.from >= to) continue;
    if (k.from > pos) text += doc.sliceString(pos, k.from);
    pos = Math.max(pos, k.to);
  }
  if (pos < to) text += doc.sliceString(pos, to);
  return text;
}

// Gemeinsamer Lauf über die Knoten der obersten Art `art(name)`: übergeht den
// Kopf-Block bis `kopfEnde` (Lezer liest `schlüssel: wert` vor `---` als
// Setext-Überschrift, die Pipeline schneidet den Kopf-Block vorher ab) und jeden
// Knoten, der in einem `%%`-Kommentar beginnt (`kommentare`, die Bereiche bei
// aktiver Erweiterung); Inline-Kommentare schneidet er aus dem Quelltext heraus.
function knotenAusBaum(state, { kopfEnde = 0, kommentare = [] }, art) {
  const doc = state.doc;
  const liste = [];
  syntaxTree(state).iterate({
    enter(node) {
      const wert = art(node.name);
      if (!wert) return;
      const zeile = doc.lineAt(node.from).number;
      if (zeile <= kopfEnde) return false;
      if (kommentare.some((k) => k.from <= node.from && k.to > node.from)) return false;
      liste.push({ wert, zeile, quelle: ohneKommentare(doc, node.from, node.to, kommentare) });
      return false;
    },
  });
  return liste;
}

// Überschriften des Dokuments in Dokument-Reihenfolge als `{ ebene, zeile,
// quelle }`, ohne Kopf-Block und ohne Überschriften in Kommentaren, wie in der
// gerenderten Ansicht.
export function ueberschriftenAusBaum(state, opts = {}) {
  return knotenAusBaum(state, opts, ueberschriftEbene).map(({ wert, zeile, quelle }) => ({
    ebene: wert,
    zeile,
    quelle,
  }));
}

// Quelltext der Verweis-Definitionen `[name]: ziel` des Dokuments. Eine
// Überschrift mit einem Verweis über eine Definition (`[Text][name]`) ergibt nur
// mit ihr denselben Text und Anker wie in der gerenderten Ansicht
// (Paritäts-Nachweis im Task 4T-002558).
export function verweisDefinitionenAusBaum(state, opts = {}) {
  return knotenAusBaum(state, opts, (name) => name === 'LinkReference').map((d) => d.quelle);
}

// Der Text, den der Inhaltsverzeichnis-Block als `tocQuelle` an die Pipeline
// reicht: die Quellzeilen der Überschriften, getrennt durch Leerzeilen, damit
// jede für sich als Überschrift zerlegt wird, dahinter die Verweis-Definitionen.
export function tocQuelleAus(liste, definitionen = []) {
  return [...liste.map((u) => u.quelle), ...definitionen].join('\n\n');
}
