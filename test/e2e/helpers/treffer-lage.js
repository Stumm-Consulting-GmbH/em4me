// 4T-002217 (Epic 3E-000355): Gemeinsame Lage-Rechnung des aktuellen
// Suchtreffers für die Ablauf-Prüfungen der fünf Such-Wege.
//
// **Warum es sie gibt.** Die Prüffälle der Suche verlangten bis hierher nur,
// dass der aktuelle Treffer **im** sichtbaren Bereich liegt; ein Treffer am
// Rand bestand sie, und kein Fall hätte bemerkt, dass der Sprung nicht mehr
// zentriert. Die Zusage des Product Owners lautet «ungefähr in der Mitte»
// (Story 4S-001065). Die Rechnung stand bis dahin in jeder Prüfdatei neu und
// jedes Mal etwas anders; hier steht sie einmal.
//
// **Herkunft.** Übernommen aus den Mess-Prüfdateien vom 2026-10-10 und
// 2026-10-17 (unversioniert unter `Tests/3E-000355/messung-*/`), mit denen die
// heutige Lage an 112 Messpunkten erhoben ist: Treffer-Element je Ansicht,
// Rollen-Container als nächster rollender Vorfahre, Drittel, Abstand zur
// Mitte, Roll-Lage.
//
// **Die Zusicherung in einem Satz.** Der aktuelle Treffer steht im mittleren
// Drittel seines Rollen-Containers — außer dort, wo die Mitte aus der
// Geometrie nicht erreichbar ist: Steht die Roll-Lage am Anfang (am Ende),
// muss er vollständig sichtbar sein und darf nicht unterhalb (oberhalb) der
// Mitte liegen, denn sonst hätte der Container noch in seine Richtung rollen
// können. Rollt der Container gar nicht, genügt «vollständig sichtbar».
//
// **Was der Rollen-Container ist.** Nicht vorausgesetzt, sondern je Messung
// ermittelt; erwartet ist je Ansicht genau einer (Editor `.cm-scroller`,
// Lese-Ansicht `.pane-rendered`, Einstellungen `.settings-section-content`).
// Ein anderer ist ein Befund: Dann hat ein äußerer Rahmen gerollt, und die
// Mitte des inneren kommt nicht zustande — einer der Kandidaten, die der
// Vorgang am Code gelesen hat.
'use strict';

const { expect } = require('@playwright/test');

// Je Ansicht: das Treffer-Element und der erwartete Rollen-Container.
// Die hervorgehobene Einstellungs-Zeile verliert ihre Klasse nach 1,6 Sekunden
// (settings-search-harvest.js); gemessen wird deshalb im Poll unmittelbar
// nach dem Sprung, nicht danach.
const ARTEN = {
  editor: { ziel: '.pane-source .cm-search-match-current', container: 'cm-scroller' },
  gerendert: { ziel: '.pane-rendered mark.mdv-match-current', container: 'pane-rendered' },
  einstellungen: { ziel: '.settings-row-hervorgehoben', container: 'settings-section-content' },
};

/**
 * Misst die Lage des aktuellen Treffers in der Spalte `pane`.
 *
 * `art` ist `editor` (Quellcode, Geteilt, Live), `gerendert` (Lese-Ansicht,
 * Handbuch), `einstellungen` oder `auto` — dann entscheidet der aktive
 * Ansichts-Knopf, was die Bereichs-Suche braucht, weil ein dort erst
 * geöffnetes Dokument in seiner eigenen Ansicht erscheint.
 *
 * Im Editor kommt die Gegenprobe an der Selektion hinzu (`coordsAtPos` der
 * Schreibmarke über die CodeMirror-Sicht, Zugang wie `schreibmarkenZeile` in
 * `datenbank-tabelle.spec.js`): Die Dekoration allein könnte an einer anderen
 * Stelle stehen als der Sprung.
 */
async function messeTrefferLage(page, { art = 'auto', pane = 0 } = {}) {
  return page.evaluate(
    ({ paneSel, artWunsch, arten }) => {
      const p = document.querySelector(paneSel);
      let artIst = artWunsch;
      if (artIst === 'auto') {
        const knopf = document.querySelector('.view-toggle .view-btn.active');
        artIst = knopf && knopf.dataset.view === 'rendered' ? 'gerendert' : 'editor';
      }
      const def = arten[artIst];
      const alle = p ? [...p.querySelectorAll(def.ziel)] : [];
      const erg = { art: artIst, anzahlZiele: alle.length, ziel: alle.length === 1 };
      if (!erg.ziel) return erg;
      const ziel = alle[0];
      const zeile = ziel.closest(
        '.cm-line, p, li, td, th, pre, h1, h2, h3, h4, h5, h6, .settings-row',
      );
      erg.zeile = (zeile || ziel).textContent.replace(/\s+/g, ' ').trim().slice(0, 400);
      // Sichtbar laut Browser: Ein Treffer im eingeklappten Hinweis-Kasten
      // (geschlossenes `details`) hat ein Rechteck, das mitten im Container
      // liegen kann, ist aber nicht zu sehen (4T-002217, Rot-Probe von SH-11).
      erg.sichtbarLautBrowser = ziel.checkVisibility();
      // Rollen-Container: nächster Vorfahre, der rollen kann und es auch muss.
      let c = ziel.parentElement;
      while (c) {
        const s = getComputedStyle(c);
        if (/(auto|scroll)/.test(s.overflowY) && c.scrollHeight > c.clientHeight + 1) break;
        c = c.parentElement;
      }
      erg.containerRollt = !!c;
      if (!c) c = ziel.closest('.settings-section-content, .pane-rendered, .cm-scroller');
      if (!c) return { ...erg, container: null };
      erg.container = c.tagName.toLowerCase() + '.' + [...c.classList].join('.');
      erg.containerErwartet = c.classList.contains(def.container);
      const r = ziel.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const mitte = (r.top + r.bottom) / 2;
      const rel = (mitte - cr.top) / cr.height;
      erg.containerHoehe = Math.round(cr.height);
      erg.scrollTop = Math.round(c.scrollTop);
      erg.scrollMax = erg.containerRollt ? Math.round(c.scrollHeight - c.clientHeight) : 0;
      erg.rel = Math.round(rel * 1000) / 1000;
      erg.abstandMittePx = Math.round(mitte - (cr.top + cr.height / 2));
      erg.drittel =
        rel < 0 || rel > 1 ? 'außerhalb' : rel < 1 / 3 ? 'oben' : rel < 2 / 3 ? 'Mitte' : 'unten';
      erg.vollSichtbar = r.top >= cr.top - 0.5 && r.bottom <= cr.bottom + 0.5;
      if (erg.scrollMax <= 1) erg.amRand = 'rollt nicht';
      else if (erg.scrollTop <= 1) erg.amRand = 'Anfang';
      else if (erg.scrollTop >= erg.scrollMax - 1) erg.amRand = 'Ende';
      else erg.amRand = 'nein';
      if (artIst === 'editor') {
        const inhalt = p.querySelector('.pane-source .cm-content');
        let kachel = inhalt && (inhalt.cmTile || inhalt.cmView);
        while (kachel && kachel.parent) kachel = kachel.parent;
        const sicht = kachel && (kachel.view || (kachel.rootView && kachel.rootView.view));
        if (!sicht) {
          erg.selektion = 'CodeMirror-Sicht nicht erreichbar';
        } else {
          const k = sicht.coordsAtPos(sicht.state.selection.main.head);
          erg.selektion = k
            ? { abstandZumZielPx: Math.round((k.top + k.bottom) / 2 - mitte) }
            : 'Schreibmarke nicht gezeichnet';
        }
      }
      return erg;
    },
    { paneSel: `.pane-group[data-pane="${pane}"]`, artWunsch: art, arten: ARTEN },
  );
}

/**
 * Bewertet eine Messung gegen die Zusicherung; leer heißt erfüllt, sonst
 * der Grund in Worten (für die Fehlermeldung des Polls).
 *
 * `opts.rand`: erwartete Roll-Lage (`nein`, `Anfang`, `Ende`, `rollt nicht`)
 * — für Prüf-Dokumente, deren Lage der Fall selbst festlegt; bei fremdem
 * Inhalt (Handbuch, Einstellungen) bleibt sie offen.
 * `opts.zeileEnthaelt`: Text der Zeile des erwarteten Treffers. Er macht aus
 * dem Poll ein Warten auf den erwarteten Zustand statt auf irgendeinen
 * Treffer — beim Sprung über eine Datei-Grenze steht sonst für einen Takt
 * noch der alte im DOM, und der Poll bestünde an ihm.
 */
function befundZurLage(lage, opts = {}) {
  if (!lage.ziel) return `kein eindeutiger aktueller Treffer (${lage.anzahlZiele} gefunden)`;
  if (opts.zeileEnthaelt && !lage.zeile.includes(opts.zeileEnthaelt)) {
    return `Treffer in «${lage.zeile}», erwartet in einer Zeile mit «${opts.zeileEnthaelt}»`;
  }
  if (!lage.sichtbarLautBrowser) return 'Treffer laut Browser nicht sichtbar (eingeklappt?)';
  if (!lage.containerErwartet) return `falscher Rollen-Container ${lage.container}`;
  if (opts.rand && lage.amRand !== opts.rand) {
    return `Roll-Lage «${lage.amRand}», erwartet «${opts.rand}»`;
  }
  if (lage.amRand === 'nein' && lage.drittel !== 'Mitte') {
    return `Treffer im Drittel «${lage.drittel}» (rel ${lage.rel}, ${lage.abstandMittePx} px zur Mitte), obwohl der Container noch rollen könnte`;
  }
  if (lage.amRand !== 'nein' && !lage.vollSichtbar) {
    return `Treffer am Rand («${lage.amRand}») nicht vollständig sichtbar (rel ${lage.rel})`;
  }
  if (lage.amRand === 'Anfang' && lage.abstandMittePx > 1) {
    return `Roll-Lage am Anfang, aber Treffer ${lage.abstandMittePx} px unterhalb der Mitte`;
  }
  if (lage.amRand === 'Ende' && lage.abstandMittePx < -1) {
    return `Roll-Lage am Ende, aber Treffer ${-lage.abstandMittePx} px oberhalb der Mitte`;
  }
  if (lage.art === 'editor') {
    if (typeof lage.selektion === 'string') return `Gegenprobe Selektion: ${lage.selektion}`;
    // Eine Zeilenhöhe Spielraum: Die Schreibmarke steht am Ende des Treffers,
    // auf derselben Zeile wie die Dekoration.
    if (Math.abs(lage.selektion.abstandZumZielPx) > 24) {
      return `Selektion ${lage.selektion.abstandZumZielPx} px neben dem markierten Treffer`;
    }
  }
  return '';
}

// Zwei Bild-Takte: Eine nachträgliche Wiederherstellung der Roll-Lage kommt
// im nächsten Takt nach dem Aktivieren des Reiters (pane-render.js); genau
// diese Lage hat Zug 3 zweimal behoben. Gewartet wird auf die Takte selbst,
// nicht auf eine Zeit.
async function zweiBildTakte(page) {
  await page.evaluate(
    () => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))),
  );
}

/**
 * Wartet, bis der aktuelle Treffer die Zusicherung erfüllt, und wartet nach
 * zwei Bild-Takten noch einmal darauf. Gibt die letzte Messung zurück.
 *
 * Der zweite Durchgang ist wieder ein Warten auf den Zustand und keine
 * Einmal-Messung: Am 2026-10-17 war in einem von 24 Läufen der Bereichs-Fälle
 * (Live, zweite Datei erst zu öffnen, Sprung auf «6 / 6») die Marke zwei Takte
 * nach dem bestandenen ersten Durchgang kurz nicht im DOM — die Lese-Ansicht
 * der eben geöffneten Datei zeichnete neu und setzte die Marke danach wieder.
 * Eine Roll-Lage, die zurückgesetzt wird und so bleibt, fällt im zweiten
 * Durchgang unverändert auf.
 */
async function erwarteTrefferInDerMitte(page, opts = {}) {
  const { art = 'auto', pane = 0, timeout = 10000, schritt = '' } = opts;
  let letzte = null;
  const durchgang = async (wann) =>
    expect
      .poll(
        async () => {
          letzte = await messeTrefferLage(page, { art, pane });
          return befundZurLage(letzte, opts);
        },
        { timeout, message: `Lage des aktuellen Treffers ${wann} ${schritt}`.trim() },
      )
      .toBe('');
  await durchgang('');
  await zweiBildTakte(page);
  await durchgang('nach zwei Bild-Takten');
  return letzte;
}

/**
 * Einmalige Prüfung ohne Warten — für Fälle, die nach einem eigenen
 * Zeitfenster (Abwesenheits-Prüfung) noch einmal nachsehen.
 */
async function pruefeTrefferInDerMitte(page, opts = {}) {
  const lage = await messeTrefferLage(page, { art: opts.art || 'auto', pane: opts.pane || 0 });
  expect(befundZurLage(lage, opts), JSON.stringify(lage)).toBe('');
  return lage;
}

module.exports = {
  messeTrefferLage,
  befundZurLage,
  erwarteTrefferInDerMitte,
  pruefeTrefferInDerMitte,
  zweiBildTakte,
};
