// 4T-001496: Gemeinsamer E2E-Helfer für die Trefferliste der Suche.
//
// **Warum es ihn gibt.** Die Stabilitätsregel des Hauses lautet
// «Warte-Bedingungen liefern den Zustand, nicht die Zeit» und richtet sich gegen
// feste Pausen. Der Vorfall vom 2026-09-06 hat sie **dem Buchstaben nach
// befolgt** — kein Timeout, sondern ein Poll — und trotzdem gerissen: Gewartet
// wurde auf ein **Ereignis** («die Liste zeigt überhaupt etwas») statt auf den
// **Zustand** («die Liste zeigt das Erwartete»). Der geschriebene Stand erreicht
// den Hauptprozess verzögert; unter Last lag der erste Treffer noch davor, und
// der Fall maß den Stand von vorher.
//
// **Erhebung vom 2026-09-07** über den ganzen E2E-Bestand: 493 Poll-Bedingungen,
// davon 56 auf Nicht-Leere und 26 mit nachfolgender Inhaltsprüfung. Von Hand
// beurteilt blieben **zwei** echte Fundstellen — beide an einer Trefferliste,
// dieselbe Bauform wie der belegte Fall. Die übrigen sind Tasten-Retries
// («drücke Strg+, bis die Seite offen ist»), bei denen die Nicht-Leere der
// Zustand **ist**.
//
// **Deshalb dieser Helfer und kein Wächter.** Zwei Erhebungs-Anläufe haben
// gezeigt, dass sich das Muster im Quelltext nicht scharf fassen lässt: Der
// erste zählte 182 Kandidaten, der zweite 26, echte waren zwei. Ein Wächter mit
// dieser Trefferquote würde umgangen statt beachtet — die Erfahrung aus
// 4T-001084. Der Helfer hat den engen Wirkbereich und ist dort sicher.
'use strict';

const { expect } = require('@playwright/test');

// Die Status-Zeile des Panels nennt die Trefferzahl im Text
// (`searchResults.count` bzw. `countFiles`, beide mit `{n}` als erster Zahl).
// Sie ist damit die einzige Stelle, die den **abgeschlossenen** Stand einer
// Suche meldet; die Liste selbst wächst währenddessen.
// Pane-genau: Der Bestand haelt je Spalte ein eigenes Panel im DOM, und ein
// Selektor ohne die Spalte trifft beide (gemessen am 2026-09-07 als strict-mode-
// Verstoss mit zwei Treffern, davon einer leer).
const PANEL_VORGABE = '.pane-group[data-pane="0"] .sidebar-searchresults';
const STATUS = '.search-results-status';
const EINTRAG = '.search-results-item';

function trefferzahlAusStatus(text) {
  const m = /(\d+)/.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Wartet, bis die Trefferliste den Zustand zeigt, den ihre eigene Status-Zeile
 * meldet — und nicht bloß, bis sie überhaupt etwas zeigt.
 *
 * Geprüft werden **beide** Seiten gemeinsam: Die Status-Zeile nennt eine Zahl
 * von mindestens `mindestens`, und die Liste trägt genau so viele Einträge. Eine
 * der beiden allein genügt nicht — die Zahl allein sagt nichts über die
 * gerenderte Liste, und die Liste allein ist genau der Vorbote, der den Vorfall
 * ausgelöst hat.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{mindestens?: number, timeout?: number, panel?: string}} opts
 * @returns {Promise<number>} die gemeldete Trefferzahl
 */
async function warteAufTrefferliste(page, opts = {}) {
  const panel = page.locator(opts.panel || PANEL_VORGABE);
  const mindestens = Number.isInteger(opts.mindestens) ? opts.mindestens : 1;
  const timeout = Number.isInteger(opts.timeout) ? opts.timeout : 10000;
  await expect
    .poll(
      async () => {
        // Die Status-Zahl belegt, dass die Suche gelaufen ist.
        const gemeldet = trefferzahlAusStatus(await panel.locator(STATUS).innerText());
        if (gemeldet === null || gemeldet < mindestens) return false;
        // Sie ist aber NICHT die Zahl der sichtbaren Eintraege: Eine
        // eingeklappte Gruppe zeigt ihre Treffer nicht, und die Faelle klappen
        // Gruppen (am 2026-09-07 daran gemessen, dass dieser Vergleich in
        // suche-einstellungen.spec.js ins Zeitlimit lief, waehrend die Suche
        // laengst fertig war). Der Zustand lautet deshalb: Die Liste zeigt
        // genau die Treffer der AUFGEKLAPPTEN Gruppen — abgelesen an deren
        // eigenen Zaehlern, nicht geraten.
        const erwartet = await panel.evaluate((wurzel) => {
          let summe = 0;
          for (const gruppe of wurzel.querySelectorAll('.search-results-group')) {
            if (gruppe.getAttribute('aria-expanded') !== 'true') continue;
            summe += Number(gruppe.querySelector('.search-results-group-count')?.textContent || 0);
          }
          return summe;
        });
        return (await panel.locator(EINTRAG).count()) === erwartet;
      },
      { timeout },
    )
    .toBe(true);
  return trefferzahlAusStatus(await panel.locator(STATUS).innerText());
}

module.exports = { warteAufTrefferliste, trefferzahlAusStatus, PANEL_VORGABE, STATUS, EINTRAG };
