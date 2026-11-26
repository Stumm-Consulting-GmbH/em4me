// 4T-002558 (Epic 3E-000390): Inhaltsverzeichnis-Block in der Live-Ansicht.
//
// Das Block-Widget rendert seinen Zaun isoliert; das Verzeichnis braucht aber
// alle Überschriften des Dokuments (Entscheidung V5). Dieses Modul ermittelt sie
// aus dem Lezer-Baum über das gemeinsame Modul editor/ueberschriften.js, liefert
// den Zusatz-Kontext samt Schlüssel-Anteil für das Widget und die Liste, über die
// ein Klick auf einen Eintrag die Zeile seiner Überschrift findet
// (bindTocKlicks in live-interaction.js).
//
// Der Schlüssel trägt die Überschriften und den Stand der Nummerierung: Das
// Widget rendert neu, sobald sich eine Überschrift ändert, und sonst nicht.
'use strict';

import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  tocQuelleAus,
  ueberschriftenAusBaum,
  verweisDefinitionenAusBaum,
} from '../editor/ueberschriften.js';
import { headingNumberingStartLevel, isHeadingNumberingEnabled } from '../heading-numbering.js';
import { computeCommentRanges, detectFrontmatterLines } from './live-marker-fields.js';

function kontext(state) {
  const kopf = detectFrontmatterLines(state.doc);
  return {
    kopfEnde: kopf ? kopf.toLine : 0,
    kommentare: isExtensionActive('comments') ? computeCommentRanges(state.doc) : [],
  };
}

// Zusatz-Kontext und Schlüssel-Anteil eines Inhaltsverzeichnis-Widgets. Die
// Nummerierung gehört in den Schlüssel, weil ihr globaler Schalter das
// Verzeichnis ändert, ohne dass sich der Text des Dokuments ändert.
export function tocWidgetKontext(state, hash) {
  const ktx = kontext(state);
  const quelle = tocQuelleAus(
    ueberschriftenAusBaum(state, ktx),
    verweisDefinitionenAusBaum(state, ktx),
  );
  const nummern = isExtensionActive('heading-numbering')
    ? `${isHeadingNumberingEnabled() ? 1 : 0}${headingNumberingStartLevel()}`
    : '-';
  return { quelle, schluessel: `${hash(quelle)}:${nummern}` };
}

// Überschriften des Dokuments in der Reihenfolge der Einträge (data-toc-index).
export function tocUeberschriften(state) {
  return ueberschriftenAusBaum(state, kontext(state));
}
