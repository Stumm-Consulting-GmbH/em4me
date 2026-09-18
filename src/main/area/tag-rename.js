// 4T-001531 (Epic 3E-000175): Die Fundstellen einer Tag-Umbenennung über den
// ganzen Bereich.
//
// **Warum im Hauptprozess.** Der Ermittler braucht jede Datei des Bereichs,
// und Dateizugriff gehört hierher (Prozess-Schnitt der Entwicklungsrichtlinien).
// Der Anzeige-Prozess bekommt Fundstellen, nie Datei-Inhalte — bei tausend
// Dateien wäre alles andere unbezahlbar.
//
// **Warum die Texte aus dem Vorrat der Suche kommen** (`area-search.js`,
// `bereichsTexte`) und nicht aus einem eigenen Lesevorgang: Die Umbenennung
// schreibt anschließend über die Ersetzen-Strecke aus 3E-000169, und die misst
// jeden Offset gegen genau diesen Stand (`suchStandFuer`). Zwei Lesevorgänge
// wären zwei Wahrheiten, und die zweite fiele erst beim Schreiben auf.
//
// **Die Regel selbst steht nicht hier.** Was ein Tag ist, welche Schreibweisen
// zusammengehören und dass der Teilbaum mitwandert, beantwortet
// `shared/tag-erkennung.js` (4T-001529, 4T-001530) — dieselbe Antwort, die auch
// der Index gibt. Dieses Modul trägt sie über den Bereich und bringt sie in die
// Form der Trefferliste.
//
// Eigener Zustand: keiner.
'use strict';

const { ermittleFundstellen } = require('../../shared/tag-erkennung.js');
const {
  trefferAnStellen,
  MAX_TREFFER_GESAMT,
  MAX_TREFFER_JE_GRUPPE,
} = require('../../shared/search-scope.js');
const { bereichsTexte } = require('./area-search.js');
// 4T-001671: Die Texte des Suchraums koennen bereinigt sein; jeder Offset wird
// mit der mitgelieferten Karte in die Datei zurueckgerechnet.
const { mitDateiOffset } = require('./area-search-datensaetze.js');

/**
 * Die Fundstellen einer Umbenennung, in der Form der Trefferliste.
 *
 * Die beiden Notationen stehen in EINER Liste, jede Fundstelle mit ihrer Art:
 * Der Anwender sieht ein Schlagwort und nicht zwei Speicherorte, und die
 * Vorschau soll ihm zeigen, was sie ändert, nicht wie sie es tut. Getrennt
 * werden die Wege erst beim Schreiben (`area-replace.js`), wo der Unterschied
 * real ist.
 *
 * @param {string} wurzel Absoluter Pfad der Bereichs-Wurzel.
 * @param {object} auftrag
 * @param {string} auftrag.alt Alter Tag-Name (ohne Raute).
 * @param {string} auftrag.neu Neuer Tag-Name (ohne Raute).
 * @param {object|null} auftrag.aktiv { pfad, text } der offenen Datei.
 * @returns {Promise<{treffer: Array, gruppen: Array, abgeschnitten: boolean,
 *   vorratModus: string, kinder: number}>}
 */
async function ermittleUmbenennung(wurzel, auftrag = {}) {
  const alt = typeof auftrag.alt === 'string' ? auftrag.alt.trim() : '';
  const neu = typeof auftrag.neu === 'string' ? auftrag.neu.trim() : '';
  const leer = { treffer: [], gruppen: [], abgeschnitten: false, vorratModus: 'leer', kinder: 0 };
  if (!alt || !neu) return leer;

  const { modus, eintraege } = await bereichsTexte(wurzel, { aktiv: auftrag.aktiv || null });
  if (eintraege.length === 0) return { ...leer, vorratModus: modus };

  const treffer = [];
  const gruppen = [];
  const karten = new Map();
  let abgeschnitten = false;
  let kinder = 0;

  for (const eintrag of eintraege) {
    const restBudget = MAX_TREFFER_GESAMT - treffer.length;
    if (restBudget <= 0) {
      abgeschnitten = true;
      break;
    }
    // 4T-001671: Traegt der Eintrag eine Ruecknahme-Karte, wurde sein Text ohne
    // den Datensatz-Block einer Tabelle durchsucht. Die Offsets bleiben bis zum
    // Bau der Treffer im SUCHTEXT, denn Zeile, Spalte und Vorschau entstehen
    // dort; erst die fertige Trefferliste wird in Datei-Offsets umgerechnet.
    if (eintrag.karte) karten.set(eintrag.gruppe, eintrag.karte);
    const fund = ermittleFundstellen(eintrag.text, alt, neu);
    // Frontmatter zuerst: Seine Stellen liegen im Text vor dem Fließtext, und
    // die Trefferliste zeigt eine Datei von oben nach unten.
    const stellen = [
      ...fund.frontmatter.map((f) => ({
        offset: f.offset,
        laenge: f.laenge,
        art: 'frontmatter',
        index: f.index,
        alt: f.alt,
        neu: f.neu,
        kind: f.kind,
      })),
      ...fund.fliesstext.map((f) => ({
        offset: f.offset,
        laenge: f.laenge,
        art: 'text',
        alt: f.alt,
        neu: f.neu,
        kind: f.kind,
      })),
    ];
    if (stellen.length === 0) continue;

    const grenze = Math.min(MAX_TREFFER_JE_GRUPPE, restBudget);
    if (stellen.length > grenze) abgeschnitten = true;
    const genommen = stellen.slice(0, grenze);
    const gebaut = trefferAnStellen(eintrag, genommen);
    if (gebaut.length === 0) continue;

    for (const stelle of genommen) if (stelle.kind) kinder += 1;
    gruppen.push({ gruppe: eintrag.gruppe, titel: eintrag.titel || '', anzahl: gebaut.length });
    treffer.push(...gebaut);
  }

  return {
    treffer: mitDateiOffset(treffer, karten),
    gruppen,
    abgeschnitten,
    vorratModus: modus,
    kinder,
  };
}

module.exports = { ermittleUmbenennung };
