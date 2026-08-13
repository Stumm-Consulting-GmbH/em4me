// 4T-0758 (Epic 3E-0142): Handbuch als Lieferant durchsuchbarer Texte.
//
// Liefert für die aktuelle Oberflächen-Sprache alle Handbuch-Seiten als
// Eintrags-Liste im Format des Suchraum-Kerns (src/shared/search-scope.js),
// unabhängig davon, ob eine Seite gerade als Reiter offen ist. Genau das
// ist der Zweck: Wer im Handbuch etwas sucht, weiß in der Regel nicht, auf
// welcher Seite es steht.
//
// Zwei Herkünfte, ein Format:
//   gebündelte Seiten  Markdown-Dateien, über den Sammel-IPC
//                      help:getAllManualPages aus dem Main.
//   generierte Seiten  Funktions-Tabelle und Tastenkürzel, erzeugt über
//                      die vorhandenen Generatoren in manual.js.
//
// Vorrat: Gehalten wird nur der teure Teil, also die per IPC geholten
// Datei-Inhalte, und zwar gebunden an die Sprache, mit der sie geholt
// wurden. Die beiden generierten Seiten entstehen bei JEDEM Suchlauf neu.
// Das kostet zwei Markdown-Erzeugungen aus Registry-Daten und erspart im
// Gegenzug jede Invalidierung: Geänderte Tastenkürzel oder geschaltete
// Erweiterungen wirken sich sofort aus, ohne dass dieses Modul davon
// erfahren muss.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { MANUAL_PAGES } from '../../../shared/manual/manual-pages.js';
import { state } from '../app/app-state.js';
import { generateFunctionsPage, generateShortcutsPage } from '../manual.js';

const GENERATOREN = {
  functions: generateFunctionsPage,
  shortcuts: generateShortcutsPage,
};

// { sprache, seiten: Map<id, text> } oder null
let vorrat = null;

export function verwirfHandbuchVorrat() {
  vorrat = null;
}

function aktuelleSprache() {
  return state.language || 'en';
}

async function gebuendelteSeiten() {
  const sprache = aktuelleSprache();
  if (vorrat && vorrat.sprache === sprache) return vorrat.seiten;

  const seiten = new Map();
  try {
    const geladen = await api.getAllManualPages(sprache);
    for (const eintrag of Array.isArray(geladen) ? geladen : []) {
      if (eintrag && typeof eintrag.id === 'string' && typeof eintrag.text === 'string') {
        seiten.set(eintrag.id, eintrag.text);
      }
    }
  } catch {
    // Kein Vorrat bei Fehlschlag: Die Suche liefert dann die generierten
    // Seiten und beim nächsten Lauf wird erneut versucht. Ein leerer
    // Trefferraum ist besser als ein dauerhaft leerer Vorrat.
    return seiten;
  }

  vorrat = { sprache, seiten };
  return seiten;
}

// Eintrags-Liste für sucheInTexten, in der Reihenfolge der Seiten-Registry
// (das ist zugleich die Reihenfolge der Überblicksseite und damit die,
// die der Anwender kennt).
export async function handbuchEintraege() {
  const gebuendelt = await gebuendelteSeiten();
  const eintraege = [];
  for (const page of MANUAL_PAGES) {
    let text;
    if (page.source === 'generated') {
      const erzeuge = GENERATOREN[page.id];
      text = erzeuge ? erzeuge() : '';
    } else {
      text = gebuendelt.get(page.id) || '';
    }
    if (!text) continue;
    eintraege.push({
      gruppe: page.id,
      titel: t(page.titleKey),
      text,
      quelle: 'manual',
    });
  }
  return eintraege;
}
