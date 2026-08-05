// 4T-0868 (Epic 3E-0162, Story S-0761): Regal-Ansicht als read-only
// System-Seite im Reiter-System (Muster area-stats-page.js).
//
// Die Seite zeigt das aktive Bücherregal in zwei umschaltbaren Darstellungen:
// Kacheln (Buch-Bilder als Raster; ohne Bild-Verweis die Platzhalter-Kachel
// mit dem Buch-Titel, PO-Entscheidung vom 2026-08-04) und Zeilen
// (Bild-Miniatur, Name, Kapitel-Anzahl, Autor und Beschreibung aus dem
// Frontmatter, PO-Entscheidung vom 2026-08-04). Ein Klick öffnet das Buch
// über den dialog-freien Buch-Weg; der Abschnitt «nicht zugeordnet» trägt
// die Aufnahme-Aktion, zugeordnete Zeilen die Lösen-Aktion (Story S-0760,
// AK4). Der Umschalter-Zustand wird je Regal persistiert (Store-Schlüssel
// SHELF_VIEW_MODES_KEY, nur Abweichungen vom Kachel-Default).
//
// Alle Anzeige-Daten liefert der Main frisch von der Platte
// (shelves.getViewData); die Seite hält keinen eigenen Datei-Zustand. Ein
// shelves:stateChanged lädt nach, solange die Seite offen ist.
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import { state } from './app-state.js';
import { registerSystemPage, openSystemPage, findSystemTabAcrossPanes } from './system-pages.js';
// file:///-URL aus einem Windows-Pfad (R2-07): dieselbe Maskierung wie bei
// den übrigen lokalen Einbettungen, keine zweite Fassung.
import { fileUrlFor } from './render-mermaid.js';

export const SHELF_VIEW_PAGE_ID = 'shelf-view';

// Store-Schlüssel des Umschalter-Zustands: { [regal-ordner in Kleinschrift]:
// 'rows' }. Nur die Abweichung vom Default 'tiles' wird abgelegt.
const SHELF_VIEW_MODES_KEY = 'shelfViewModes';

const pageState = {
  container: null,
  view: null,
  laden: false,
  fehler: null,
  mode: 'tiles',
};

function modeKeyFor(view) {
  return view && view.shelfDir ? String(view.shelfDir).toLowerCase() : null;
}

async function ladeModus(view) {
  const key = modeKeyFor(view);
  if (!key) return 'tiles';
  let map;
  try {
    map = await api.getSetting(SHELF_VIEW_MODES_KEY);
  } catch {
    map = null;
  }
  return map && typeof map === 'object' && map[key] === 'rows' ? 'rows' : 'tiles';
}

async function persistiereModus(view, mode) {
  const key = modeKeyFor(view);
  if (!key) return;
  let map;
  try {
    map = await api.getSetting(SHELF_VIEW_MODES_KEY);
  } catch {
    map = null;
  }
  const next = map && typeof map === 'object' && !Array.isArray(map) ? { ...map } : {};
  if (mode === 'rows') next[key] = 'rows';
  else delete next[key];
  void api.setSetting(SHELF_VIEW_MODES_KEY, next);
}

// Öffnet die Regal-Ansicht (alle Regal-Öffnungswege des Main melden
// shelves:openPage hierher; erneutes Öffnen aktiviert den bestehenden Tab).
export function openShelfViewPage() {
  openSystemPage(SHELF_VIEW_PAGE_ID);
  void ladeUndZeichne();
}

async function ladeUndZeichne() {
  if (pageState.laden) return;
  pageState.laden = true;
  pageState.fehler = null;
  let ergebnis;
  try {
    ergebnis = await api.shelves.getViewData();
  } catch {
    ergebnis = null;
  }
  pageState.laden = false;
  if (!ergebnis || !ergebnis.ok) {
    // Ohne aktives Regal (geschlossen) zeigt die Seite den Hinweis; zuvor
    // geladene Daten verfallen, damit kein fremder Bestand stehen bleibt.
    pageState.view = null;
    pageState.fehler = ergebnis && ergebnis.error === 'no-shelf' ? 'no-shelf' : 'error';
  } else {
    pageState.view = ergebnis.view;
    pageState.mode = await ladeModus(ergebnis.view);
  }
  zeichne();
}

// --- Bausteine der Anzeige ---------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function oeffneBuch(entry) {
  if (!entry || entry.missing) return;
  void api.books.openPath(entry.bookDir);
}

// Bild oder Platzhalter-Kachel (PO-Entscheidung: Buch-Titel als Text auf
// neutralem Hintergrund, kein erzwungenes Bild, keine leere Kachel).
function bildElement(entry, className) {
  if (entry.imagePath) {
    const img = el('img', className);
    img.src = fileUrlFor(entry.imagePath);
    img.alt = entry.title;
    img.draggable = false;
    return img;
  }
  const platzhalter = el('div', `${className} shelf-view-placeholder`);
  platzhalter.appendChild(el('span', 'shelf-view-placeholder-title', entry.title));
  return platzhalter;
}

function aktionsKnopf(labelKey, onClick) {
  const knopf = el('button', 'shelf-view-action', t(labelKey));
  knopf.type = 'button';
  knopf.addEventListener('click', (ev) => {
    // Der Knopf liegt im klickbaren Eintrag; die Aktion soll das Buch nicht
    // zusätzlich öffnen.
    ev.stopPropagation();
    onClick();
  });
  return knopf;
}

function aufnehmenKnopf(entry) {
  return aktionsKnopf('shelfView.assignAction', () => {
    void api.shelves.assignBook(entry.dirName);
  });
}

function loesenKnopf(entry) {
  return aktionsKnopf('shelfView.unassignAction', () => {
    void api.shelves.unassignBook(entry.dirName);
  });
}

// Kachel eines Buches; klickbar (öffnet das Buch), bei fehlendem Ordner der
// Marker statt einer toten Aktion.
function kachel(entry, { aufnehmen = false } = {}) {
  const tile = el('div', 'shelf-view-tile');
  if (entry.missing) tile.classList.add('shelf-view-missing');
  else {
    tile.classList.add('shelf-view-clickable');
    tile.title = t('shelfView.openBook');
    tile.addEventListener('click', () => oeffneBuch(entry));
  }
  tile.appendChild(bildElement(entry, 'shelf-view-tile-image'));
  const caption = el('div', 'shelf-view-tile-caption');
  caption.appendChild(el('span', 'shelf-view-tile-title', entry.title));
  if (entry.missing) caption.appendChild(el('span', 'shelf-view-hint', t('shelfView.missingHint')));
  if (aufnehmen) caption.appendChild(aufnehmenKnopf(entry));
  else if (entry.missing) caption.appendChild(loesenKnopf(entry));
  tile.appendChild(caption);
  return tile;
}

// Zeile eines Buches: Miniatur, Name, Kapitel-Anzahl, Autor und Beschreibung
// (PO-Entscheidung; weitere Felder bewusst nicht).
function zeile(entry, { aufnehmen = false } = {}) {
  const row = el('div', 'shelf-view-row');
  if (entry.missing) row.classList.add('shelf-view-missing');
  else {
    row.classList.add('shelf-view-clickable');
    row.title = t('shelfView.openBook');
    row.addEventListener('click', () => oeffneBuch(entry));
  }
  row.appendChild(bildElement(entry, 'shelf-view-row-image'));
  const textBlock = el('div', 'shelf-view-row-text');
  const kopf = el('div', 'shelf-view-row-head');
  kopf.appendChild(el('span', 'shelf-view-row-title', entry.title));
  if (entry.missing) kopf.appendChild(el('span', 'shelf-view-hint', t('shelfView.missingHint')));
  else
    kopf.appendChild(
      el(
        'span',
        'shelf-view-row-meta',
        t('shelfView.chapters').replace(
          '{count}',
          Number(entry.chapters || 0).toLocaleString(state.language || undefined),
        ),
      ),
    );
  textBlock.appendChild(kopf);
  if (entry.author) textBlock.appendChild(el('div', 'shelf-view-row-author', entry.author));
  if (entry.description)
    textBlock.appendChild(el('div', 'shelf-view-row-description', entry.description));
  row.appendChild(textBlock);
  const aktionen = el('div', 'shelf-view-row-actions');
  if (aufnehmen) aktionen.appendChild(aufnehmenKnopf(entry));
  else aktionen.appendChild(loesenKnopf(entry));
  row.appendChild(aktionen);
  return row;
}

function eintragsListe(entries, { aufnehmen = false } = {}) {
  const tiles = pageState.mode !== 'rows';
  const wrap = el('div', tiles ? 'shelf-view-grid' : 'shelf-view-rows');
  for (const entry of entries) {
    wrap.appendChild(tiles ? kachel(entry, { aufnehmen }) : zeile(entry, { aufnehmen }));
  }
  return wrap;
}

function umschalter() {
  const gruppe = el('div', 'shelf-view-toggle');
  for (const mode of ['tiles', 'rows']) {
    const knopf = el(
      'button',
      'shelf-view-toggle-button',
      t(mode === 'tiles' ? 'shelfView.tiles' : 'shelfView.rows'),
    );
    knopf.type = 'button';
    if (pageState.mode === mode) knopf.classList.add('active');
    knopf.addEventListener('click', () => {
      if (pageState.mode === mode) return;
      pageState.mode = mode;
      void persistiereModus(pageState.view, mode);
      zeichne();
    });
    gruppe.appendChild(knopf);
  }
  return gruppe;
}

function zeichne() {
  const container = pageState.container;
  if (!container) return;
  container.innerHTML = '';
  const page = el('div', 'shelf-view-page');
  container.appendChild(page);
  if (!pageState.view) {
    if (pageState.laden) return;
    page.appendChild(
      el(
        'p',
        'shelf-view-note',
        t(pageState.fehler === 'no-shelf' ? 'shelfView.noShelf' : 'shelfView.loadError'),
      ),
    );
    return;
  }
  const view = pageState.view;
  const head = el('div', 'shelf-view-head');
  head.appendChild(el('h1', 'shelf-view-heading', view.shelfTitle));
  head.appendChild(umschalter());
  page.appendChild(head);
  if (view.books.length === 0) {
    page.appendChild(el('p', 'shelf-view-note', t('shelfView.empty')));
  } else {
    page.appendChild(eintragsListe(view.books));
  }
  if (view.unassigned.length > 0) {
    const section = el('div', 'shelf-view-section');
    section.appendChild(el('h2', 'shelf-view-section-title', t('shelfView.unassignedTitle')));
    section.appendChild(eintragsListe(view.unassigned, { aufnehmen: true }));
    page.appendChild(section);
  }
}

// --- Registrierung -----------------------------------------------------------

// 4T-0868: Der Main meldet das Öffnen der Seite bei jedem Regal-Öffnen-Weg
// (Menü, Neuanlage, Pfad-Einstieg, Datei-Erkennung). Electron-IPC puffert
// nicht — der Listener MUSS deshalb synchron beim Modul-Laden registriert
// sein (Muster onOpenExternal in app-init.js), sonst verfällt eine Meldung,
// die vor dem Ende von init() eintrifft. Bis die Seite registriert ist, wird
// das Öffnen gemerkt und in initShelfViewPage nachgeholt.
let seiteRegistriert = false;
let oeffnenGemerkt = false;
api.shelves.onOpenPage(() => {
  if (!seiteRegistriert) {
    oeffnenGemerkt = true;
    return;
  }
  openShelfViewPage();
});

export function initShelfViewPage() {
  registerSystemPage({
    id: SHELF_VIEW_PAGE_ID,
    titleKey: 'shelfView.pageTitle',
    // Dynamischer Tab-Titel „Bücherregal: <Regal-Titel>" (Muster Statistik).
    title() {
      return pageState.view
        ? `${t('shelfView.pageTitle')}: ${pageState.view.shelfTitle}`
        : t('shelfView.pageTitle');
    },
    onOpen() {
      pageState.view = null;
      pageState.fehler = null;
    },
    mount(container) {
      pageState.container = container;
      zeichne();
      if (!pageState.view && !pageState.laden) void ladeUndZeichne();
    },
    onClose() {
      pageState.container = null;
    },
  });
  // Zuordnungs-Änderungen und Regal-Wechsel: nachladen, solange die Seite
  // offen ist (der Main sendet den Zustand an alle Fenster der App).
  api.shelves.onStateChanged(() => {
    if (findSystemTabAcrossPanes(SHELF_VIEW_PAGE_ID)) void ladeUndZeichne();
  });
  // Jetzt ist die Seite registriert; ein vor der Registrierung gemeldetes
  // Öffnen wird nachgeholt.
  seiteRegistriert = true;
  if (oeffnenGemerkt) {
    oeffnenGemerkt = false;
    openShelfViewPage();
  }
  // 4T-0882, zweiter Anlauf (PO-Befund vom 2026-08-05 am realen Profil): Die
  // Öffnen-Meldung des Mains ist ein Push über Prozess- und Lade-Grenzen und
  // ging in einer großen Mehr-Fenster-Sitzung trotz sendWhenLoaded und
  // Merk-Puffer verloren — das wiederhergestellte Regal-Fenster blieb leer,
  // während der kleine Testfall grün lief. Der Init zieht den Zustand deshalb
  // zusätzlich selbst (Pull, Muster der Buch-Wiederherstellung): Trägt die
  // App eine aktive Regal-Bindung, öffnet die Seite. Deckungsgleich mit dem
  // Konzept, dass das Regal-Fenster die Regal-Ebene hält (R1); doppeltes
  // Öffnen ist unschädlich, weil openShelfViewPage den bestehenden Tab
  // aktiviert.
  void api.shelves
    .getState()
    .then((state) => {
      if (state && state.active) openShelfViewPage();
    })
    .catch(() => {});
}

// Für Aufrufer, die prüfen wollen, ob die Seite offen ist (Tests/Debug).
export function shelfViewPageOpen() {
  return !!findSystemTabAcrossPanes(SHELF_VIEW_PAGE_ID);
}
