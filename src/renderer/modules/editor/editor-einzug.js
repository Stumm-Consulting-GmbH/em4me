// 4T-001312 (Epic 3E-000235): Hängender Einzug umgebrochener Zeilen — die
// Darstellung.
//
// Die Rechnung, wie weit eine Fortsetzung eingerückt gehört, liegt
// prozessneutral in src/shared/haengender-einzug.js. Hier steht nur, wie das
// Ergebnis an die Zeile kommt: als Zeilen-Dekoration mit einer CSS-Variablen,
// die das Stilblatt in einen hängenden Einzug übersetzt.
//
// **Warum eine Variable und keine fertige Regel.** Der Einzug hängt vom Text
// der einzelnen Zeile ab und ist deshalb ein Wert und keine Klasse; die Regel
// selbst gehört ins Stilblatt, wo sie mit den übrigen Zeilen-Regeln zusammen
// steht und mit dem Theme mitgeht.
//
// **Warum rein darstellend.** Der Dokument-Text bleibt unangetastet, und die
// Zuordnung von Bildschirm-Position zu Text-Position rechnet der Editor
// unverändert selbst. Ein Eingriff in den Text hätte den Umbruch behoben und
// dafür den Inhalt verfälscht.
//
// **Warum nur der sichtbare Ausschnitt.** Die Dekorationen entstehen für die
// sichtbaren Bereiche und werden bei Änderung, Ausschnitts-Wechsel und
// Größen-Änderung neu gebaut — dasselbe Muster wie bei den übrigen
// Zeilen-Dekorationen des Live-Modus.
'use strict';

import { Decoration, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { haengenderEinzug } from '../../../shared/haengender-einzug.js';

// Eine Dekoration je vorkommender Einzugs-Breite. Der Zwischenspeicher hält
// die Zahl der erzeugten Objekte klein: In einem Dokument treten wenige
// verschiedene Breiten auf, und CodeMirror vergleicht Dekorationen über ihre
// Identität.
const einzugsDekorationen = new Map();

function dekorationFuer(breite) {
  let deko = einzugsDekorationen.get(breite);
  if (!deko) {
    deko = Decoration.line({
      class: 'cm-haengender-einzug',
      attributes: { style: `--haengender-einzug: ${breite}ch` },
    });
    einzugsDekorationen.set(breite, deko);
  }
  return deko;
}

function baueEinzuege(view) {
  const builder = new RangeSetBuilder();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const zeile = view.state.doc.lineAt(pos);
      const breite = haengenderEinzug(zeile.text);
      if (breite > 0) builder.add(zeile.from, zeile.from, dekorationFuer(breite));
      pos = zeile.to + 1;
    }
  }
  return builder.finish();
}

export const haengenderEinzugPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = baueEinzuege(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.decorations = baueEinzuege(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
