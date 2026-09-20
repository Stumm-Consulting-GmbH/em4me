// 4T-001599 (Epic 3E-000191, Story 4S-000906): My Extended Memory als
// System-Seite — die Darstellung der von Hand gepflegten Gefäß-Liste aus
// 4T-001598.
//
// Muster ist die Regal-Ansicht (books/shelf-view.js): pfadloser Reiter über
// die System-Seiten-Registry, Anzeige-Daten frisch vom Hauptprozess
// (memory:getViewData), DOM ausschließlich über die Hilfsfunktion `el` mit
// textContent, ein `zeichne()` mit `container.innerHTML = ''` und ein
// modul-lokaler Seiten-Zustand. Registriert wird explizit über
// initMemoryPage() aus app-init.js, nicht per Modul-Seiteneffekt.
//
// Der Hinweis am Kopf bleibt sichtbar, auch wenn die Liste gefüllt ist
// (AK5). Er ist keine Beschriftungs-Zierde: Die Seite zeigt den
// EINGETRAGENEN Bestand und durchsucht keine Laufwerke — gerade die gefüllte
// Liste könnte sonst wie ein Fund aussehen und eine Vollständigkeit
// versprechen, die niemand zugesagt hat.
//
// 4T-001601: Der Container `memory-row-detail` je Zeile trägt jetzt die
// Detail-Sicht. Ihr Inhalt liegt in memory-detail.js, die gemeinsamen
// Anzeige-Bausteine in memory-bausteine.js; hier bleiben allein der
// Aufklapp-Zustand (`pageState.offen`) und der Knopf, der ihn umlegt. Der
// Schnitt kam nicht aus Geschmack, sondern aus dem Datei-Größen-Budget: Die
// Seite stand mit der eingebauten Detail-Sicht bei 495 von 500 Code-Zeilen.
//
// 4T-001600: Die Zeile trägt jetzt den Stand ihrer Kennzahlen und eine kurze
// Auswahl daraus, dazu den Knopf «Neu erheben». Drei Regeln, die dabei
// durchgehalten sind: Eine fehlende Kennzahl erscheint **gar nicht**, nie als
// Null — eine Null behauptete eine gezählte Abwesenheit. Ein Stand ohne Zahlen
// erscheint als Vermerk statt als Zeitpunkt, weil er sonst ein Ergebnis
// verspräche, das es nicht gibt. Und ein Bereich ohne geöffneten Index sagt
// mit dem Kennzeichen «unvollständig», warum seine Tag- und Aufgaben-Zahlen
// fehlen; erhoben wird deswegen kein Index (Punkt 6 des Lösungsansatzes).
//
// 4T-001602: Der Container `memory-page-exchange` der Werkzeugleiste trägt
// den Zugang zum Ex- und Import. **Hier entsteht keine zweite Mechanik.** Die
// Grenze verläuft am IPC-Kanal: Auswahl-Dialog, Datei-Dialog, Vorschau,
// Übernahme und Bericht führen `exportSetup()` und `importSetup()` aus
// 3E-000160 selbst; diese Seite ruft sie auf und wertet allein die Rückgabe
// des Einlesens aus.
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from './app/system-pages.js';
import { el, knopf, zahl, bytes, zeitpunkt } from './memory-bausteine.js';
import { detailBlock, loeseSprungAus } from './memory-detail.js';
import { isExtensionActive } from './extensions/extension-lifecycle.js';
import { exportSetup } from './views/setup-export.js';
import { importSetup } from './views/setup-import.js';
import { showStatusbarHint } from './views/views.js';

export const MEMORY_PAGE_ID = 'memory';

// Abschnitts-Überschrift je Gefäß-Art; zugleich die Gruppen-Überschrift des
// Vorschlags, damit derselbe Begriff an beiden Stellen steht.
const SECTION_KEYS = {
  workspace: 'memory.section.workspaces',
  area: 'memory.section.areas',
  book: 'memory.section.books',
  shelf: 'memory.section.shelves',
};

// Anzeige-Reihenfolge der Arten (Vertrag von memory:getViewData). Der
// Hauptprozess sortiert bereits so; die Seite gruppiert lediglich nach.
const KIND_ORDER = ['workspace', 'area', 'book', 'shelf'];

// Erweiterung, an der der Ex- und Import hängt (3E-000160). Ist sie aus,
// entfällt der Zugang hier ebenso wie das Untermenü im Datei-Menü — ein
// Knopf, der auf einen abgeschalteten Weg führte, wäre ein Versprechen ohne
// Deckung.
const EXCHANGE_EXTENSION_ID = 'setup-exchange';

// Fehler-Kennungen des Eintragens auf ihre Meldung. `canceled` ist kein
// Fehler und bleibt stumm; jede andere Kennung bekommt einen Text, auch die
// hier nicht einzeln genannte (`invalid` entsteht nur bei einem Pfad, der
// sich nicht verwerten lässt — für den Anwender dieselbe Lage wie ein nicht
// erreichbarer Ordner). Eine stille Wirkungslosigkeit wäre schlechter als
// eine leicht zu grobe Meldung.
const ADD_MELDUNG = {
  duplicate: 'memory.add.duplicate',
  unreachable: 'memory.add.unreachable',
  'not-a-directory': 'memory.add.unreachable',
  'unknown-workspace': 'memory.add.unknownWorkspace',
};

// Seiten-Zustand: `entries === null` heißt „noch nicht geladen" und ist vom
// leeren Bestand zu unterscheiden — sonst blitzte der Leer-Zustand bei jedem
// Öffnen kurz auf, bevor die Liste eintrifft.
const pageState = {
  container: null,
  entries: null,
  laden: false,
  vorschlagOffen: false,
  vorschlag: null,
  // 4T-001601: Schlüssel der Zeilen mit aufgeklappter Detail-Sicht. Der
  // Zustand liegt hier und nicht am DOM, weil `zeichne()` den Aufbau bei jeder
  // Meldung vollständig ersetzt — am DOM gehaltene Aufklapp-Zustände fielen
  // dabei jedes Mal zu.
  offen: new Set(),
};

// Öffnet die Seite (Ansichtsmenü, Kommando-Palette, belegtes Kürzel). Ein
// bereits offener Reiter wird aktiviert statt ein zweiter angelegt — das
// leistet openSystemPage (AK3).
export function openMemoryPage() {
  openSystemPage(MEMORY_PAGE_ID);
  void ladeUndZeichne();
}

// --- Daten -------------------------------------------------------------------

async function ladeUndZeichne() {
  if (pageState.laden) return;
  pageState.laden = true;
  let ergebnis;
  try {
    ergebnis = await api.memory.getViewData();
  } catch {
    ergebnis = null;
  }
  // Der Kanal antwortet immer mit ok:true; ein ausgebliebenes Ergebnis kann
  // deshalb nur ein Abriss der Verbindung sein, und dann ist die leere Liste
  // die ehrlichste Anzeige: Die Seite behauptet nichts über einen Bestand,
  // den sie nicht gelesen hat.
  pageState.entries =
    ergebnis && ergebnis.ok && Array.isArray(ergebnis.entries) ? ergebnis.entries : [];
  if (pageState.vorschlagOffen) await ladeVorschlag();
  pageState.laden = false;
  zeichne();
}

async function ladeVorschlag() {
  let ergebnis;
  try {
    ergebnis = await api.memory.suggestions();
  } catch {
    ergebnis = null;
  }
  pageState.vorschlag = ergebnis && ergebnis.ok ? ergebnis.suggestions : null;
}

// Ergebnis eines Eintrage-Versuchs melden. Die Anzeige selbst zieht über
// memory:changed nach; hier steht allein die Rückmeldung an den Anwender.
function meldeEintrag(ergebnis) {
  if (!ergebnis) return;
  if (ergebnis.ok) {
    showStatusbarHint('memory.add.done');
    return;
  }
  if (ergebnis.error === 'canceled') return;
  showStatusbarHint(ADD_MELDUNG[ergebnis.error] || 'memory.add.unreachable', {
    error: true,
    duration: 4000,
  });
}

// --- Vorschlags-Block --------------------------------------------------------

function vorschlagsZeile(kind, eintrag) {
  const row = el('div', 'memory-suggest-row');
  const text = el('div', 'memory-suggest-text');
  text.appendChild(el('span', 'memory-suggest-name', eintrag.name));
  if (kind !== 'workspace' && eintrag.path) {
    text.appendChild(el('span', 'memory-suggest-path', eintrag.path));
  }
  row.appendChild(text);
  row.appendChild(
    knopf('memory-action', t('memory.suggest.add'), () => {
      const versprechen =
        kind === 'workspace'
          ? api.memory.addWorkspace(eintrag.workspaceId)
          : api.memory.addPath(eintrag.path);
      void Promise.resolve(versprechen).then(meldeEintrag);
    }),
  );
  return row;
}

function vorschlagsBlock() {
  const block = el('div', 'memory-suggest');
  const gruppen = pageState.vorschlag || {};
  const felder = [
    ['workspace', gruppen.workspaces],
    ['area', gruppen.areas],
    ['book', gruppen.books],
    ['shelf', gruppen.shelves],
  ];
  let gesehen = 0;
  for (const [kind, liste] of felder) {
    if (!Array.isArray(liste) || liste.length === 0) continue;
    gesehen += liste.length;
    block.appendChild(el('h4', 'memory-suggest-title', t(SECTION_KEYS[kind])));
    const wrap = el('div', 'memory-suggest-list');
    for (const eintrag of liste) wrap.appendChild(vorschlagsZeile(kind, eintrag));
    block.appendChild(wrap);
  }
  // Der Ordner-Weg steht immer da, auch ohne Vorschlag: Die Verlaufs-Listen
  // sind Bequemlichkeit, der Ordner-Dialog ist der vollständige Weg.
  if (gesehen === 0) block.appendChild(el('p', 'memory-suggest-empty', t('memory.suggest.empty')));
  block.appendChild(
    knopf('memory-action memory-suggest-folder', t('memory.suggest.chooseFolder'), () => {
      void api.memory.addFromDialog().then(meldeEintrag);
    }),
  );
  return block;
}

// --- Ex- und Import ----------------------------------------------------------

// Der Zugang zur Mechanik aus 3E-000160. Beide Knöpfe rufen nur auf; Dialoge
// und Meldungen gehören den gerufenen Funktionen und erscheinen über dieser
// Seite, also an der auslösenden Stelle (AK5).
//
// Nach einem Einlesen, bei dem etwas übernommen wurde, wird die Seite neu
// geladen (AK6). Heute ändert das die Gefäß-Liste nicht — sie ist keine
// Datenart des Austauschs, sondern steht als maschinengebunden in
// NEVER_EXPORTED —, und der Neuaufbau bleibt trotzdem: Er ist die Zusage der
// Seite, nach dem Einlesen den neuen Bestand zu zeigen, und gilt ohne
// Nacharbeit weiter, sobald eine Datenart die Liste einmal mitnimmt.
function austauschBlock() {
  const block = el('div', 'memory-page-exchange');
  const aktionen = el('div', 'memory-page-exchange-actions');
  aktionen.appendChild(
    knopf('memory-action memory-exchange-export', t('memory.exchange.export'), () => {
      void exportSetup();
    }),
  );
  aktionen.appendChild(
    knopf('memory-action memory-exchange-import', t('memory.exchange.import'), () => {
      void Promise.resolve(importSetup()).then((uebernommen) => {
        if (uebernommen === true) void ladeUndZeichne();
      });
    }),
  );
  block.appendChild(aktionen);
  block.appendChild(el('p', 'memory-page-exchange-note', t('memory.exchange.note')));
  return block;
}

// --- Zeilen ------------------------------------------------------------------

function oeffne(entry) {
  if (entry.kind === 'workspace') {
    void api.workspaceOpen(entry.workspaceId);
    return;
  }
  if (entry.kind === 'area') {
    void api.openAreaPath(entry.path);
    return;
  }
  if (entry.kind === 'book') {
    void api.books.openPath(entry.path);
    return;
  }
  void api.shelves.openPath(entry.path);
}

// Zweite Zeile eines Eintrags: bei einem Ordner-Gefäß der Pfad, bei einem
// Arbeitsbereich die Gefäße, die er trägt (der Arbeitsbereich hat keinen
// eigenen Ort, und der Pfad wäre hier die falsche Auskunft).
function metaBlock(entry) {
  const meta = el('div', 'memory-row-meta');
  if (entry.kind !== 'workspace') {
    meta.appendChild(el('span', 'memory-row-path', entry.path));
    return meta;
  }
  const ws = entry.workspace;
  if (!ws) return meta;
  const teile = [
    ['memory.workspace.area', ws.area],
    ['memory.workspace.book', ws.book],
    ['memory.workspace.shelf', ws.shelf],
  ];
  for (const [key, pfad] of teile) {
    if (!pfad) continue;
    meta.appendChild(el('span', 'memory-row-part', t(key).replace('{path}', pfad)));
  }
  // 4T-001739 (Epic 3E-000308), Befund der Abnahme vom 2026-09-19: Die beiden
  // Zahlen des Arbeitsbereichs stehen NEBENEINANDER in einer Reihe, zuerst die
  // geöffneten Dokumente, dann die Fenster — so, wie Bereich, Buch und
  // Bücherregal ihre Kurz-Kennzahlen in einer Reihe führen. Eine eigene Klasse
  // und nicht «memory-row-stats»: Jene Reihe trägt die Kennzahlen des
  // Beschleunigers, und die bekommt ein Arbeitsbereich nie (4T-001600). Die
  // Null steht da wie jede andere Zahl (AK6): Sie ist eine Auskunft und keine
  // fehlende Angabe.
  const zahlen = el('div', 'memory-row-counts');
  zahlen.appendChild(
    el(
      'span',
      'memory-row-count',
      t('memory.workspace.documents').replace('{count}', String(ws.documents || 0)),
    ),
  );
  zahlen.appendChild(
    el(
      'span',
      'memory-row-count',
      t('memory.workspace.windows').replace('{count}', String(ws.windows || 0)),
    ),
  );
  meta.appendChild(zahlen);
  return meta;
}

// Die Kurz-Kennzahlen einer Zeile, je Gefäß-Art zwei Angaben. Die vollständige
// Auffächerung ist Sache der Detail-Sicht (4T-001601); hier steht, was beim
// Überfliegen der Liste trägt. Eine Kennzahl, die es nicht gibt, erscheint
// nicht — `null` heißt «nicht erhoben» und nicht «keine».
function kurzKennzahlen(entry) {
  const werte = entry.stats && entry.stats.werte ? entry.stats.werte : null;
  if (werte === null) return [];
  const teile = [];
  if (entry.kind === 'area' && werte.markdown !== null && werte.markdown !== undefined) {
    teile.push(t('memory.stats.markdown').replace('{count}', zahl(werte.markdown)));
  }
  if (entry.kind === 'book' && werte.kapitel !== null && werte.kapitel !== undefined) {
    teile.push(t('memory.stats.chapters').replace('{count}', zahl(werte.kapitel)));
  }
  if (entry.kind === 'shelf' && werte.buecher !== null && werte.buecher !== undefined) {
    teile.push(t('memory.stats.books').replace('{count}', zahl(werte.buecher)));
  }
  if (werte.bytes !== null && werte.bytes !== undefined) {
    teile.push(t('memory.stats.bytes').replace('{size}', bytes(werte.bytes)));
  }
  return teile;
}

// Zeile der Kennzahlen samt Kennzeichen für den unvollständigen Bereich. Ohne
// eine einzige Angabe entfällt der ganze Block, damit keine leere Zeile
// stehen bleibt.
function kennzahlenBlock(entry) {
  const teile = kurzKennzahlen(entry);
  const unvollstaendig = entry.stats !== null && entry.stats.status === 'partial';
  if (teile.length === 0 && !unvollstaendig) return null;
  const block = el('div', 'memory-row-stats');
  for (const stueck of teile) block.appendChild(el('span', 'memory-row-stat', stueck));
  if (unvollstaendig) {
    block.appendChild(el('span', 'memory-row-partial', t('memory.stats.partial')));
  }
  return block;
}

function zeile(entry) {
  const row = el('div', 'memory-row');
  const text = el('div', 'memory-row-text');
  const kopf = el('div', 'memory-row-head');
  kopf.appendChild(el('span', 'memory-row-title', entry.name));
  if (entry.reachable === false) {
    kopf.appendChild(el('span', 'memory-row-unreachable', t('memory.unreachable')));
  }
  // Der Stand steht nur da, wenn es erhobene Kennzahlen gibt. Ein Stand ohne
  // Zahlen wäre ein Zeitpunkt ohne Gegenstand — das ist die Lage beim
  // Arbeitsbereich (er bekommt keinen Eintrag) und bei einem Gefäß, das seit
  // dem Eintragen nie erreichbar war.
  const stand = entry.stats && entry.stats.stand ? entry.stats.stand : null;
  kopf.appendChild(
    stand === null
      ? el('span', 'memory-row-stand', t('memory.stats.none'))
      : el('span', 'memory-row-stand', t('memory.stand').replace('{time}', zeitpunkt(stand))),
  );
  text.appendChild(kopf);
  text.appendChild(metaBlock(entry));
  const kennzahlen = kennzahlenBlock(entry);
  if (kennzahlen !== null) text.appendChild(kennzahlen);
  row.appendChild(text);

  const aktionen = el('div', 'memory-row-actions');
  aktionen.appendChild(
    knopf('memory-action memory-action-open', t('memory.action.open'), () => oeffne(entry), {
      disabled: entry.reachable === false,
    }),
  );
  // 4T-001601: Die Detail-Sicht klappt auf und zu; sie steht auch für ein
  // nicht erreichbares Gefäß offen, weil sie genau dann die zuletzt bekannten
  // Zahlen zeigt.
  aktionen.appendChild(
    knopf('memory-action memory-action-details', t('memory.action.details'), () => {
      if (pageState.offen.has(entry.key)) pageState.offen.delete(entry.key);
      else pageState.offen.add(entry.key);
      zeichne();
    }),
  );
  // Der Arbeitsbereich bekommt keinen Erhebungs-Knopf: Er hat keinen eigenen
  // Ort, seine Angaben stehen live in den Einstellungen, und ein Knopf ohne
  // Gegenstand wäre ein Versprechen ohne Deckung.
  if (entry.kind !== 'workspace') {
    aktionen.appendChild(
      knopf(
        'memory-action memory-action-refresh',
        t('memory.action.refresh'),
        () => {
          void api.memory.refresh(entry.key).then((ergebnis) => {
            if (ergebnis && ergebnis.ok) {
              showStatusbarHint('memory.refreshed');
              return;
            }
            showStatusbarHint('memory.refreshFailed', { error: true, duration: 4000 });
          });
        },
        { disabled: entry.reachable === false },
      ),
    );
  }
  aktionen.appendChild(
    knopf('memory-action memory-action-remove', t('memory.action.remove'), () => {
      void api.memory.remove(entry.key).then(() => showStatusbarHint('memory.removed'));
    }),
  );
  row.appendChild(aktionen);
  // 4T-001601: Andockpunkt der Detail-Sicht. Er bleibt leer, solange die Zeile
  // zugeklappt ist — die leere Fläche verschwindet über `:empty` ganz.
  const detail = el('div', 'memory-row-detail');
  if (pageState.offen.has(entry.key)) detail.appendChild(detailBlock(entry));
  row.appendChild(detail);
  return row;
}

// --- Seiten-Aufbau -----------------------------------------------------------

function werkzeugleiste() {
  const leiste = el('div', 'memory-page-toolbar');
  leiste.appendChild(
    knopf('memory-action memory-page-add', t('memory.addButton'), () => {
      pageState.vorschlagOffen = !pageState.vorschlagOffen;
      if (!pageState.vorschlagOffen) {
        zeichne();
        return;
      }
      void ladeVorschlag().then(zeichne);
    }),
  );
  if (isExtensionActive(EXCHANGE_EXTENSION_ID)) leiste.appendChild(austauschBlock());
  return leiste;
}

function zeichne() {
  const container = pageState.container;
  if (!container) return;
  container.innerHTML = '';
  const page = el('div', 'memory-page');
  container.appendChild(page);

  const kopf = el('div', 'memory-page-head');
  kopf.appendChild(el('h3', 'memory-page-heading', t('memory.pageTitle')));
  page.appendChild(kopf);
  // AK5: Der Hinweis steht dauerhaft, unabhängig vom Füllstand der Liste.
  page.appendChild(el('p', 'memory-page-note', t('memory.note')));
  page.appendChild(werkzeugleiste());
  if (pageState.vorschlagOffen) page.appendChild(vorschlagsBlock());

  const entries = pageState.entries;
  if (entries === null) return;
  if (entries.length === 0) {
    page.appendChild(el('div', 'memory-page-placeholder', t('memory.empty')));
    return;
  }
  for (const kind of KIND_ORDER) {
    const gruppe = entries.filter((e) => e.kind === kind);
    if (gruppe.length === 0) continue;
    const section = el('section', 'memory-section');
    section.appendChild(el('h4', 'memory-section-title', t(SECTION_KEYS[kind])));
    for (const entry of gruppe) section.appendChild(zeile(entry));
    page.appendChild(section);
  }
}

// --- Registrierung -----------------------------------------------------------

export function initMemoryPage() {
  registerSystemPage({
    id: MEMORY_PAGE_ID,
    titleKey: 'memory.pageTitle',
    onOpen() {
      // Frischer Seiten-Zustand pro Neu-Öffnen (Muster Bereichs-Statistik):
      // Die Liste wird neu geholt, der Vorschlags-Block ist zu.
      pageState.entries = null;
      pageState.vorschlagOffen = false;
      pageState.vorschlag = null;
      pageState.offen.clear();
    },
    mount(container) {
      pageState.container = container;
      zeichne();
      if (pageState.entries === null && !pageState.laden) void ladeUndZeichne();
    },
    onClose() {
      pageState.container = null;
    },
  });
  // Jede Änderung der Liste meldet der Hauptprozess an alle Fenster; nachgeladen
  // wird nur, solange die Seite in diesem Fenster offen ist (Muster
  // shelves.onStateChanged).
  api.memory.onChanged(() => {
    if (findSystemTabAcrossPanes(MEMORY_PAGE_ID)) void ladeUndZeichne();
  });
  // 4T-001601: Der gemerkte Sprung in die Bereichs-Statistik wartet auf die
  // Display-Info-Meldung, weil erst sie `state.areaPath` setzt. Registriert
  // wird nach registerAppBroadcasts (app-init.js:242 gegen 639), damit der
  // Zustand steht, wenn dieser Empfänger an der Reihe ist.
  api.onWindowDisplayInfo(() => loeseSprungAus());
  // 4T-001602: Der Schalt-Zustand von `setup-exchange` entscheidet über den
  // Austausch-Block. Der Mount-Guard der System-Seiten-Registry re-montiert
  // eine offene Seite nicht von allein (system-pages.js:160-182), sonst
  // stünden die Knöpfe nach dem Abschalten weiter da. Gezeichnet wird nur,
  // nicht geladen: Der Bestand hat sich nicht geändert.
  document.addEventListener('scg:extensions-changed', () => {
    if (pageState.container) zeichne();
  });
}

// Für Aufrufer, die prüfen wollen, ob die Seite offen ist (Tests/Debug).
export function memoryPageOpen() {
  return !!findSystemTabAcrossPanes(MEMORY_PAGE_ID);
}
