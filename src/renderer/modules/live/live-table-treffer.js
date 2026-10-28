// 4T-002342 (Epic 3E-000365, Story 4S-001098): Treffer der Dokument-Suche in
// den Zellen einer gezeichneten Pipe-Tabelle der Live-Ansicht.
//
// **Warum die Tabelle ihre Treffer selbst zeichnet.** Die Suche zeichnet ihre
// Treffer als Dekoration über Textstellen des Editors (`searchHighlightField`,
// live-marker-fields.js). Eine Tabelle steht in der Live-Ansicht als Widget,
// das genau diesen Text ersetzt, und klappt bei Schreibmarke nicht zur Quelle
// auf (`blockKlapptAuf`, live-deco.js, Entscheidung E2 aus 3E-000239). Die
// Dekoration hat dort keinen Text, an den sie sich hängen könnte. Das Widget
// bekommt deshalb die Treffer, die in seinen Bereich fallen, aus demselben
// Feld und umhüllt die getroffenen Zeichen in den Zellen mit demselben Element
// und denselben Klassen wie der Editor im Fließtext (`span`, `cm-search-match`,
// beim aktuellen Treffer zusätzlich `cm-search-match-current`). Aufklappen
// schied aus: Es widerspräche der Zusage, dass der Treffer IN der Zelle
// hervorgehoben ist, und der Entscheidung, dass Tabellen nicht aufklappen.
//
// Drei Stufen, jede für sich prüfbar: die Treffer im Block aus dem Feld
// (`trefferImBlock`), die Zuordnung zu Zelle und Zeichen-Spanne über die
// Zellen-Grenzen des Tabellen-Lesers (`trefferInZellen`, ohne DOM) und das
// Umhüllen im gezeichneten Baum (`zeichneTabellenTreffer`).
'use strict';

import { parsePipeTable, parseTableCells } from '../../../shared/markdown/table-edit.js';
import {
  clearSearchDecorations,
  searchHighlightField,
  setSearchDecorations,
} from './live-marker-fields.js';
import { blockStelle } from './live-table-zell-kern.js';

const KLASSE = 'cm-search-match';
const KLASSE_AKTUELL = 'cm-search-match-current';

// Die Treffer der Suche im Dokument-Bereich [von, bis) — Stellen im Dokument,
// auf den Bereich beschnitten, samt der Angabe, ob es der aktuelle ist.
export function trefferImBereich(state, von, bis) {
  const deko = state.field(searchHighlightField, false);
  if (!deko || deko.size === 0) return [];
  const liste = [];
  deko.between(von, bis, (from, to, wert) => {
    if (to <= von || from >= bis) return;
    const klasse = (wert.spec && wert.spec.class) || '';
    liste.push({
      from: Math.max(from, von),
      to: Math.min(to, bis),
      aktuell: klasse.split(/\s+/).includes(KLASSE_AKTUELL),
    });
  });
  return liste;
}

// Dieselben Treffer als Stellen im Block-Text des Widgets. In einem Zitat ist
// der Block-Text ohne die Zitat-Präfixe (4T-002055); die Stellen rechnen über
// sie hinweg zurück.
export function trefferImBlock(state, von, bis, praefixe) {
  const liste = trefferImBereich(state, von, bis);
  if (liste.length === 0) return [];
  const dokText = praefixe ? state.doc.sliceString(von, bis) : '';
  return liste.map((t) => ({
    von: blockStelle(praefixe, dokText, t.from - von),
    bis: blockStelle(praefixe, dokText, t.to - von),
    aktuell: t.aktuell,
  }));
}

// Kurzform der Treffer für Vergleiche (Gleichheit des Widgets, Signatur des
// Feldes): Eine Änderung des aktuellen Treffers ändert sie ebenso wie eine
// Änderung der Stellen.
export function trefferSchluessel(treffer) {
  return (treffer || []).map((t) => `${t.von}-${t.bis}${t.aktuell ? '*' : ''}`).join(',');
}

// Signatur der Treffer über alle Tabellen eines Stands. Das Feld vergleicht sie,
// wenn die Suche ihre Treffer neu setzt, und baut nur bei einer Änderung neu —
// Tippen in der Suche ohne Treffer in einer Tabelle baut kein Widget neu.
export function tabellenTrefferSignatur(state, tabellen) {
  return (tabellen || [])
    .map((t) =>
      trefferImBereich(state, t.von, t.bis)
        .map((x) => `${x.from}-${x.to}${x.aktuell ? '*' : ''}`)
        .join(','),
    )
    .join('|');
}

// Setzt oder löscht diese Transaktion die Treffer der Suche?
export function sucheGeaendert(tr) {
  return tr.effects.some((e) => e.is(setSearchDecorations) || e.is(clearSearchDecorations));
}

// Die Treffer je Zelle: logische Zell-Position (wie `locatePipeCell`), die
// Spanne im Inhalt der Zelle und der Quelltext der Zelle. Ein Treffer über
// eine Zellen-Grenze zählt in jeder berührten Zelle mit dem Teil, der in ihrem
// Inhalt liegt; ein Treffer allein im Trenner `|`, im Polster oder in der
// Ausrichtungs-Zeile liegt in keiner Zelle, und eine leere Zelle hat keinen
// Inhalt, den ein Treffer treffen könnte.
export function trefferInZellen(zeilen, treffer) {
  if (!treffer || treffer.length === 0) return [];
  const modell = parsePipeTable(zeilen);
  if (!modell) return [];
  const datenAb = modell.hasSeparator ? 2 : 1;
  const ergebnis = [];
  let anfang = 0;
  zeilen.forEach((zeile, i) => {
    const istTrenner = modell.hasSeparator && i === 1;
    const zellen = istTrenner ? null : parseTableCells(zeile);
    (zellen || []).forEach((z, col) => {
      const a = anfang + z.contentStart;
      const e = anfang + z.contentEnd;
      const pos =
        i === 0
          ? { rowKind: 'header', rowIndex: 0, col }
          : { rowKind: 'body', rowIndex: i - datenAb, col };
      for (const t of treffer) {
        const von = Math.max(t.von, a);
        const bis = Math.min(t.bis, e);
        if (von >= bis) continue;
        ergebnis.push({
          pos,
          von: von - a,
          bis: bis - a,
          aktuell: !!t.aktuell,
          zellText: zeile.slice(z.contentStart, z.contentEnd),
        });
      }
    });
    anfang += zeile.length + 1;
  });
  return ergebnis;
}

// Die Spannen im gezeigten Text einer Zelle. Gleicht der gezeigte Text dem
// Quelltext der Zelle, gelten die Stellen unverändert. Sonst trägt die Zelle
// Auszeichnung (`**fett**`, ein Link, `\|`), und der Quelltext hat andere
// Stellen als die Anzeige; dann wird der getroffene Text gezeigt, wo er zum
// gleichen Mal vorkommt wie im Quelltext. Kommt er in der Anzeige nicht vor —
// der Treffer berührt die Auszeichnung selbst —, bleibt er ohne Hervorhebung.
export function spannenImGezeigtenText(gezeigt, zellText, eintraege) {
  if (gezeigt === zellText)
    return eintraege.map(({ von, bis, aktuell }) => ({ von, bis, aktuell }));
  const spannen = [];
  for (const { von, bis, aktuell } of eintraege) {
    const text = zellText.slice(von, bis);
    if (!text) continue;
    let mal = 0;
    for (let i = zellText.indexOf(text); i >= 0 && i < von; i = zellText.indexOf(text, i + 1)) {
      mal++;
    }
    let stelle = gezeigt.indexOf(text);
    for (let k = 0; k < mal && stelle >= 0; k++) stelle = gezeigt.indexOf(text, stelle + 1);
    if (stelle >= 0) spannen.push({ von: stelle, bis: stelle + text.length, aktuell });
  }
  return spannen;
}

function zelleIn(tabelle, pos) {
  if (pos.rowKind === 'header') return tabelle.querySelectorAll('thead th')[pos.col] || null;
  const zeile = tabelle.querySelectorAll('tbody tr')[pos.rowIndex];
  return zeile ? zeile.querySelectorAll('td')[pos.col] || null : null;
}

// Umhüllt die Spannen im Text eines Elements, über Textknoten hinweg.
function umhuelle(element, spannen) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const knoten = [];
  let anfang = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    knoten.push({ n, anfang });
    anfang += n.nodeValue.length;
  }
  for (const { n, anfang: start } of knoten) {
    const text = n.nodeValue;
    const teile = spannen
      .filter((s) => s.von < start + text.length && s.bis > start)
      .sort((a, b) => a.von - b.von);
    if (teile.length === 0 || !n.parentNode) continue;
    const frag = element.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const s of teile) {
      const a = Math.max(cursor, s.von - start);
      const b = Math.min(text.length, s.bis - start);
      if (a >= b) continue;
      if (a > cursor) frag.appendChild(element.ownerDocument.createTextNode(text.slice(cursor, a)));
      const span = element.ownerDocument.createElement('span');
      span.className = s.aktuell ? `${KLASSE} ${KLASSE_AKTUELL}` : KLASSE;
      // Kennzeichen für den Klick-Pfad (live-table-klick.js): Eine Zelle mit
      // Hervorhebung bleibt «einfacher Text», wenn sonst nichts darin steht.
      span.dataset.tabellenTreffer = '';
      span.textContent = text.slice(a, b);
      frag.appendChild(span);
      cursor = b;
    }
    if (cursor < text.length)
      frag.appendChild(element.ownerDocument.createTextNode(text.slice(cursor)));
    n.parentNode.replaceChild(frag, n);
  }
}

// Zeichnet die Treffer in die gerenderte Tabelle des Containers. `source` ist
// der Block-Text, mit dem das Widget gebaut wurde, `treffer` die Treffer darin.
// Läuft auf dem frisch eingehängten Baum des Widgets, nie auf dem Zwischen-
// speicher; ein neuer Stand der Treffer baut das Widget neu, eine veraltete
// Hervorhebung kann deshalb nicht stehen bleiben.
export function zeichneTabellenTreffer(container, source, treffer) {
  if (!treffer || treffer.length === 0) return;
  const tabelle = container.querySelector('table');
  if (!tabelle) return;
  const jeZelle = new Map();
  for (const eintrag of trefferInZellen(String(source).split('\n'), treffer)) {
    const schluessel = `${eintrag.pos.rowKind}:${eintrag.pos.rowIndex}:${eintrag.pos.col}`;
    if (!jeZelle.has(schluessel)) jeZelle.set(schluessel, []);
    jeZelle.get(schluessel).push(eintrag);
  }
  for (const eintraege of jeZelle.values()) {
    const zelle = zelleIn(tabelle, eintraege[0].pos);
    if (!zelle) continue;
    const spannen = spannenImGezeigtenText(zelle.textContent, eintraege[0].zellText, eintraege);
    if (spannen.length > 0) umhuelle(zelle, spannen);
  }
}
