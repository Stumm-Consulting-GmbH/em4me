// 4T-001500 (Epic 3E-000174): Der Datei-Modus des Auswahl-Overlays — eine Datei
// ueber die Eingabe eines Teils ihres Namens finden und oeffnen.
//
// 4T-001538 (Epic 3E-000173): Derselbe Modus traegt seither eine ZWEITE
// Wirkung — dieselbe Datei als Wurzel des Verweis-Baums setzen (Entscheidung
// V3 des Product Owners vom 2026-09-06). Geteilt sind Quelle, Filterung,
// Zeilen-Bau und die Namens-Aufloesung; verschieden sind allein Titel und
// Wirkung. Genau dafuer ist das Overlay in 4T-001500 mehr-modig gebaut worden.
//
// Eigenes Modul und nicht Teil von command-palette.js (Entscheidung E1 des
// Product Owners vom 2026-09-06): Die Oberflaeche ist geteilt, der Code ist es
// nicht. Die Palette traegt die Overlay-Mechanik und ihren eigenen Modus; hier
// stehen Beschaffung, Zeilen-Bau und Oeffnen des Datei-Modus.
//
// Der Ablauf spiegelt den der Kommando-Palette: Die Datenmenge wird **einmal
// beim Oeffnen** geholt, danach filtert jeder Tastendruck oertlich. Der einzige
// IPC-Aufruf der Eingabe-Schleife ist damit keiner.
'use strict';

import { zeigeAuswahlOverlay } from './command-palette.js';
import { trefferlage, holeQuellAntwort, ZUSTAND } from '../../shared/datei-oeffnen-auswahl.js';
import { t } from '../i18n.js';
import { state, activeTab } from './app/app-state.js';
import { openInPane } from './tabs/tabs.js';
import { showAliasDialog } from './dialogs/dialogs.js';

// Baut eine Trefferzeile: Name links, Herkunft rechts. Die rechte Spalte sagt
// bei einer Datei ihren Ordner und bei einem Zweitnamen die Datei, auf die er
// zeigt — ohne sie waeren zwei gleich aussehende Zeilen nicht auseinander zu
// halten, und genau das ist bei Zweitnamen der Regelfall.
function baueTrefferZeile(eintrag, btn) {
  const name = document.createElement('span');
  name.className = 'command-palette-name';
  name.textContent = eintrag.name;
  btn.appendChild(name);
  const detail = document.createElement('span');
  detail.className = 'command-palette-detail';
  detail.textContent =
    eintrag.kind === 'alias'
      ? t('autocomplete.detail.alias') + (eintrag.detail ? ' → ' + eintrag.detail : '')
      : eintrag.detail || '';
  btn.appendChild(detail);
}

// Loest einen gewaehlten Eintrag auf den Datei-Pfad auf und oeffnet ihn.
//
// Die Trefferliste traegt Namen, keine Pfade — `openInPane` braucht Pfade. Die
// Aufloesung laeuft deshalb ueber dieselben beiden Kanaele wie der Klick auf
// einen Wiki-Link (`link-navigation.js:184` und `:409`), nur ohne dessen
// Raterei: Welcher der beiden zustaendig ist, sagt hier `kind`.
//
// **Mehrdeutige Namen.** Die Quelle fuehrt jeden Namen genau einmal, auch wenn
// zwei Ordner eine Datei gleichen Namens enthalten; die Aufloesung liefert dann
// mehrere Kandidaten. Gewaehlt wird ueber denselben Dialog, den der Wiki-Link-
// Klick dafuer schon hat — ein vierter Aufrufer derselben Auswahl, keine
// fuenfte Mechanik.
// 4T-001538: Die Aufloesung steht fuer sich, weil sie zwei Wirkungen bedient
// — Oeffnen und Wurzel-Setzen. Rueckgabe ist der Pfad oder null; wer null
// bekommt, hat nichts zu tun und nichts zu melden.
async function loeseEintragAuf(eintrag) {
  // 4T-001514: Der Bezug ist die aktive Datei, und ohne sie der geoeffnete
  // Bereich; `null` fuer beides bedeutet, dass es nichts aufzuloesen gibt.
  const tab = activeTab();
  const bezug = tab && tab.path ? tab.path : null;
  if (!bezug && !state.areaPath) return null;
  const api = window.api;
  let kandidaten;
  try {
    if (eintrag.kind === 'alias') {
      const per = await api.resolveWikiTargetByAlias(bezug, eintrag.name);
      kandidaten = (per && per.candidates) || [];
    } else {
      const idx = await api.resolveWikiTargetInIndex(bezug, eintrag.name);
      kandidaten = idx && idx.status === 'ready' ? idx.candidates || [] : [];
    }
  } catch {
    // Index waehrend der Auswahl weggefallen: Es gibt nichts zu oeffnen und
    // nichts zu melden, was der Anwender nicht schon saehe.
    return null;
  }
  if (kandidaten.length === 0) return null;
  return kandidaten.length === 1 ? kandidaten[0] : await showAliasDialog(eintrag.name, kandidaten);
}

async function oeffneEintrag(eintrag) {
  const ziel = await loeseEintragAuf(eintrag);
  if (ziel) await openInPane(state.activePaneIndex, [ziel], { inheritGroup: true });
}

// Oeffnet das Overlay im Datei-Modus.
//
// 4T-001514: Der Bezugspunkt des Suchraums ist die aktive Datei ODER der
// geoeffnete Bereich. Die erste Fassung verlangte eine Datei und sperrte damit
// genau die Lage, in der der Zugang am meisten wert ist: ein gerade geoeffneter
// Bereich, in dem noch nichts offen ist. Erst wenn beides fehlt, gibt es keinen
// Namensraum; der Zugang ist dann ueber seine Verfuegbarkeits-Regel gesperrt,
// und dieser Zweig ist die zweite Linie dahinter.
export async function zeigeDateiOeffnen() {
  return zeigeAuswahlOverlay(await baueNamensModus('quickOpen.title', oeffneEintrag));
}

// 4T-001538: Derselbe Namensraum, andere Wirkung — die gewaehlte Datei wird
// Wurzel des Verweis-Baums. `uebernehmen` bekommt den aufgeloesten Pfad;
// wurde nichts aufgeloest (kein Treffer, mehrdeutig und abgebrochen), bleibt
// sie ungerufen und die Wurzel unveraendert.
export async function zeigeWurzelWahl(uebernehmen) {
  return zeigeAuswahlOverlay(
    await baueNamensModus('graph.tree.chooseRootTitle', async (eintrag) => {
      const ziel = await loeseEintragAuf(eintrag);
      if (ziel) await uebernehmen(ziel);
    }),
  );
}

async function baueNamensModus(titelKey, fuehreAus) {
  const tab = activeTab();
  const bezug = tab && tab.path ? tab.path : null;
  const antwort = await holeQuellAntwort(window.api, bezug);
  // Der Zustand der Quelle steht mit der Antwort fest und aendert sich waehrend
  // der Eingabe nicht mehr; die Trefferzahl schon.
  const zustand = trefferlage(antwort, '').zustand;
  return {
    titel: t(titelKey),
    platzhalter: t('quickOpen.filterPlaceholder'),
    // Die Datenmenge ist hier die Antwort der Quelle; `filtere` rechnet daraus
    // je Tastendruck die Liste.
    eintraege: antwort,
    filtere: (quelle, eingabe) => trefferlage(quelle, eingabe).treffer,
    gruppeVon: () => '',
    istVerfuegbar: () => true,
    baueInhalt: baueTrefferZeile,
    // Zwei verschiedene Auskuenfte, die ohne diese Unterscheidung beide als
    // «nichts gefunden» erschienen — der Index baut beim ersten Oeffnen eines
    // grossen Bereichs spuerbar lange.
    leerText: () =>
      zustand === ZUSTAND.aufbau
        ? t('quickOpen.indexing')
        : zustand === ZUSTAND.nichtVerfuegbar
          ? t('quickOpen.unavailable')
          : t('quickOpen.noMatch'),
    fuehreAus,
  };
}
