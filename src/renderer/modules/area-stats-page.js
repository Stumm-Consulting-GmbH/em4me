// 4T-000620 (Epic 3E-000117): Bereichs-Statistik als read-only System-Seite.
//
// Muster Bereichs-Graph (graph-tab.js): eine Instanz pro Fenster, erneutes
// Öffnen aktiviert den bestehenden Tab und erhebt neu. Die Seite zeigt sechs
// Abschnitte über den geöffneten Bereich — Dateien und Speicher,
// Eigenschaften, Tags, Begleitdateien, Inhalte, Auffälligkeiten — jeweils
// aus dem Kennzahlen-Objekt des Hauptprozesses (4T-000619).
//
// Erhoben wird ausschließlich auf Anforderung (Epic-Entscheidung 3): Der
// Ordner-Scan läuft über den gesamten Bereichs-Baum, und die Zahlen einer
// Bestands-Übersicht altern langsam. Eine Kopplung an die Index-
// Invalidierung, wie sie der Graph fährt, gibt es hier bewusst nicht.
//
// Die Formatierung liegt vollständig hier: Der Hauptprozess liefert rohe
// Zahlen, Bytes und Millisekunden; Byte-Stufen, Tausender-Trennung und
// Zeitstempel entstehen erst in der Anzeige, in der Sprache der Oberfläche.
//
// Modul-Zyklen zu tabs/views sind Laufzeit-Zugriffe; Registrierung explizit
// über initAreaStatsPage aus app-init (kein Modul-Seiteneffekt, Muster
// history-page.js und graph-tab.js).
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
import { state } from './app/app-state.js';
import { openOrJumpToPath } from './bookmarks/bookmarks.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from './app/system-pages.js';
import { showStatusbarHint } from './views/views.js';

export const AREA_STATS_PAGE_ID = 'area-stats';

// Zeilen einer Häufigkeits-Tabelle vor dem Aufklappen. Bei hunderten Tags
// wäre die volle Liste eine Wand; die Sortierung macht den Kopf der Liste
// zur eigentlichen Aussage.
const KURZ_LISTE = 25;

// Seiten-Zustand: erhobene Kennzahlen, Lade-Kennzeichen und die reine
// Anzeige-Ordnung der beiden Häufigkeits-Tabellen (flüchtig, überlebt das
// Schließen nicht).
const pageState = {
  container: null,
  daten: null,
  laden: false,
  fehler: null,
  sortierung: {
    eigenschaften: { spalte: 'dateien', absteigend: true, alle: false },
    tags: { spalte: 'dateien', absteigend: true, alle: false },
  },
};

// Öffnet die Bereichs-Statistik (Ansichtsmenü, Kontextmenü des Bereichs-
// Panels, Kommando). Ohne Bereich lokalisierter Hinweis statt Seite — der
// Menü-Eintrag ist zusätzlich deaktiviert, der Guard deckt Kontextmenü- und
// Kürzel-Weg ab (Muster openAreaGraphTab).
export function openAreaStatsPage() {
  if (!state.areaPath) {
    showStatusbarHint('stats.noArea', { duration: 3000, error: true });
    return;
  }
  openSystemPage(AREA_STATS_PAGE_ID);
  void erhebeUndZeichne();
}

// --- Daten -------------------------------------------------------------------

async function erhebeUndZeichne() {
  if (pageState.laden) return;
  pageState.laden = true;
  pageState.fehler = null;
  zeichne();
  let ergebnis;
  try {
    ergebnis = await api.collectAreaStats();
  } catch {
    ergebnis = null;
  }
  pageState.laden = false;
  if (!ergebnis || ergebnis.status !== 'ready') {
    // Der Index-Aufbau ist ein Wartezustand, alles andere ein Fehler; in
    // beiden Fällen bleiben zuvor erhobene Zahlen stehen, damit ein
    // fehlgeschlagener Nachlauf die Seite nicht leert.
    pageState.fehler = ergebnis && ergebnis.status === 'indexing' ? 'indexing' : 'error';
  } else {
    pageState.daten = ergebnis;
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

function zahl(wert) {
  return Number(wert || 0).toLocaleString(state.language || undefined);
}

// Byte-Stufen bis Megabyte; darüber hinaus bleibt MB stehen, weil ein
// Bereich mit Gigabyte-Umfang in dieser Anzeige ohnehin ein Sonderfall ist.
function bytes(wert) {
  const n = Number(wert || 0);
  const lang = state.language || undefined;
  if (n < 1024) return `${n.toLocaleString(lang)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString(lang, { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`;
}

// Feste Stellenzahl wie in der Historien-Ansicht (PO-Befund 0.40.0):
// Reihenfolge und Trennzeichen folgen der Oberflächen-Sprache.
function zeitpunkt(wert) {
  try {
    return new Date(wert).toLocaleString(state.language || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(wert);
  }
}

function abschnitt(root, titelKey) {
  const section = el('section', 'area-stats-section');
  section.appendChild(el('h4', 'area-stats-section-title', t(titelKey)));
  root.appendChild(section);
  return section;
}

// Kennzahlen-Tabelle: Paare aus Bezeichnung und Wert. Eine Zeile mit
// eingerücktem Namen ist ein „davon"-Anteil ihrer Vorgänger-Zeile.
function kennzahlen(section, zeilen) {
  const table = el('table', 'area-stats-figures');
  const tbody = document.createElement('tbody');
  for (const [bezeichnung, wert, eingerueckt] of zeilen) {
    const tr = document.createElement('tr');
    const tdName = el('td', eingerueckt ? 'area-stats-sub' : null, bezeichnung);
    const tdWert = el('td', 'area-stats-value', wert);
    tr.appendChild(tdName);
    tr.appendChild(tdWert);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);
}

// Häufigkeits-Tabelle mit sortierbaren Spalten und Kurz-/Vollansicht.
// schluessel adressiert den Sortier-Zustand (eigenschaften | tags).
function haeufigkeit(section, schluessel, liste, nameSpalteKey) {
  const ordnung = pageState.sortierung[schluessel];
  if (!liste || liste.length === 0) {
    section.appendChild(el('p', 'area-stats-empty', t('stats.empty')));
    return;
  }
  const sortiert = [...liste].sort((a, b) => {
    const richtung = ordnung.absteigend ? -1 : 1;
    if (ordnung.spalte === 'name') return richtung * a.name.localeCompare(b.name);
    return richtung * (a.dateien - b.dateien) || a.name.localeCompare(b.name);
  });
  const sichtbar = ordnung.alle ? sortiert : sortiert.slice(0, KURZ_LISTE);

  const table = el('table', 'area-stats-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const [spalte, key] of [
    ['name', nameSpalteKey],
    ['dateien', 'stats.col.files'],
  ]) {
    const th = el('th', 'area-stats-sortable');
    const pfeil = ordnung.spalte === spalte ? (ordnung.absteigend ? ' ▾' : ' ▴') : '';
    th.textContent = `${t(key)}${pfeil}`;
    th.addEventListener('click', () => {
      if (ordnung.spalte === spalte) ordnung.absteigend = !ordnung.absteigend;
      else {
        ordnung.spalte = spalte;
        // Namen liest man aufsteigend, Anzahlen absteigend.
        ordnung.absteigend = spalte === 'dateien';
      }
      zeichne();
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const eintrag of sichtbar) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, eintrag.name));
    tr.appendChild(el('td', 'area-stats-value', zahl(eintrag.dateien)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);

  if (sortiert.length > KURZ_LISTE) {
    const schalter = el('button', 'area-stats-more');
    schalter.type = 'button';
    schalter.textContent = ordnung.alle
      ? t('stats.showLess')
      : t('stats.showAll').replace('{count}', zahl(sortiert.length));
    schalter.addEventListener('click', () => {
      ordnung.alle = !ordnung.alle;
      zeichne();
    });
    section.appendChild(schalter);
  }
}

// Top-Liste der Auffälligkeiten: Dateiname (klickbar, öffnet die Datei wie
// ein Knoten im Bereichs-Graph) und ein Wert.
function topListe(spalte, titelKey, wertSpalteKey, eintraege, wertVon) {
  const block = el('div', 'area-stats-top');
  block.appendChild(el('h5', 'area-stats-top-title', t(titelKey)));
  if (!eintraege || eintraege.length === 0) {
    block.appendChild(el('p', 'area-stats-empty', t('stats.empty')));
    spalte.appendChild(block);
    return;
  }
  const table = el('table', 'area-stats-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(el('th', null, t('stats.col.name')));
  headRow.appendChild(el('th', null, t(wertSpalteKey)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const eintrag of eintraege) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const link = el('button', 'area-stats-file', eintrag.name);
    link.type = 'button';
    link.title = eintrag.pfad;
    link.addEventListener('click', () => void openOrJumpToPath(eintrag.pfad));
    tdName.appendChild(link);
    tr.appendChild(tdName);
    tr.appendChild(el('td', 'area-stats-value', wertVon(eintrag)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  block.appendChild(table);
  spalte.appendChild(block);
}

// --- Seiten-Aufbau -----------------------------------------------------------

function zeichne() {
  const container = pageState.container;
  if (!container || !container.isConnected) return;
  container.innerHTML = '';
  const root = el('div', 'area-stats-page');

  const kopf = el('div', 'area-stats-head');
  const titel = state.areaName
    ? `${t('stats.pageTitle')} — ${state.areaName}`
    : t('stats.pageTitle');
  kopf.appendChild(el('h3', 'area-stats-heading', titel));
  const rechts = el('div', 'area-stats-head-right');
  if (pageState.daten) {
    rechts.appendChild(
      el(
        'span',
        'area-stats-stand',
        t('stats.stand').replace('{time}', zeitpunkt(pageState.daten.stand)),
      ),
    );
  }
  const knopf = el('button', 'area-stats-refresh', t('stats.refresh'));
  knopf.type = 'button';
  knopf.disabled = pageState.laden;
  knopf.addEventListener('click', () => void erhebeUndZeichne());
  rechts.appendChild(knopf);
  kopf.appendChild(rechts);
  root.appendChild(kopf);

  if (pageState.laden) root.appendChild(el('p', 'area-stats-note', t('stats.loading')));
  if (pageState.fehler) {
    const key = pageState.fehler === 'indexing' ? 'stats.indexing' : 'stats.loadError';
    root.appendChild(el('p', 'area-stats-note area-stats-error', t(key)));
  }

  const daten = pageState.daten;
  if (daten) {
    zeichneAbschnitte(root, daten);
    if (daten.hinweise && daten.hinweise.uebersprungeneOrdner > 0) {
      root.appendChild(
        el(
          'p',
          'area-stats-note',
          t('stats.skippedDirs').replace('{count}', zahl(daten.hinweise.uebersprungeneOrdner)),
        ),
      );
    }
  }

  container.appendChild(root);
}

function zeichneAbschnitte(root, daten) {
  const dateien = abschnitt(root, 'stats.section.files');
  kennzahlen(dateien, [
    [t('stats.files.markdown'), zahl(daten.dateien.markdown)],
    [t('stats.files.nonMarkdown'), zahl(daten.dateien.nichtMarkdown.gesamt)],
    [t('stats.files.images'), zahl(daten.dateien.nichtMarkdown.bilder), true],
    [t('stats.files.pdf'), zahl(daten.dateien.nichtMarkdown.pdf), true],
    [t('stats.files.other'), zahl(daten.dateien.nichtMarkdown.sonstige), true],
    [t('stats.files.folders'), zahl(daten.dateien.ordner)],
    [t('stats.storage.total'), bytes(daten.speicher.gesamt)],
    [t('stats.storage.markdown'), bytes(daten.speicher.markdown), true],
    [t('stats.storage.nonMarkdown'), bytes(daten.speicher.nichtMarkdown), true],
    [t('stats.storage.companions'), bytes(daten.speicher.begleit), true],
  ]);

  const eigenschaften = abschnitt(root, 'stats.section.properties');
  eigenschaften.appendChild(
    el(
      'p',
      'area-stats-count',
      t('stats.properties.distinct').replace('{count}', zahl(daten.eigenschaften.verschieden)),
    ),
  );
  haeufigkeit(eigenschaften, 'eigenschaften', daten.eigenschaften.liste, 'stats.col.property');

  const tags = abschnitt(root, 'stats.section.tags');
  tags.appendChild(
    el(
      'p',
      'area-stats-count',
      t('stats.tags.distinct').replace('{count}', zahl(daten.tags.verschieden)),
    ),
  );
  haeufigkeit(tags, 'tags', daten.tags.liste, 'stats.col.tag');

  const begleit = abschnitt(root, 'stats.section.companions');
  kennzahlen(begleit, [
    [
      t('stats.companions.withMdd'),
      t('stats.companions.ofFiles')
        .replace('{count}', zahl(daten.begleit.mitMdd))
        .replace('{total}', zahl(daten.begleit.vonMarkdown)),
    ],
    [
      t('stats.companions.mdd'),
      `${zahl(daten.begleit.mdd.anzahl)} / ${bytes(daten.begleit.mdd.bytes)}`,
    ],
    [
      t('stats.companions.mdda'),
      `${zahl(daten.begleit.mdda.anzahl)} / ${bytes(daten.begleit.mdda.bytes)}`,
    ],
  ]);

  const inhalte = abschnitt(root, 'stats.section.content');
  kennzahlen(inhalte, [
    [t('stats.content.tasks'), zahl(daten.inhalte.aufgaben.gesamt)],
    [t('stats.content.tasksOpen'), zahl(daten.inhalte.aufgaben.offen), true],
    [t('stats.content.tasksDone'), zahl(daten.inhalte.aufgaben.erledigt), true],
    [t('stats.content.tasksCancelled'), zahl(daten.inhalte.aufgaben.abgebrochen), true],
    [t('stats.content.wikiLinks'), zahl(daten.inhalte.verweise.wiki)],
    [t('stats.content.mdLinks'), zahl(daten.inhalte.verweise.markdown)],
    [t('stats.content.aliases'), zahl(daten.inhalte.aliase)],
    [t('stats.content.orphans'), zahl(daten.inhalte.verweise.ohneEingehende)],
  ]);

  const auffaellig = abschnitt(root, 'stats.section.highlights');
  const spalten = el('div', 'area-stats-tops');
  topListe(
    spalten,
    'stats.highlights.largest',
    'stats.col.size',
    daten.auffaelligkeiten.groesste,
    (e) => bytes(e.bytes),
  );
  topListe(
    spalten,
    'stats.highlights.recent',
    'stats.col.changed',
    daten.auffaelligkeiten.juengste,
    (e) => zeitpunkt(e.mtimeMs),
  );
  topListe(
    spalten,
    'stats.highlights.mostLinked',
    'stats.col.incoming',
    daten.auffaelligkeiten.meistverlinkt,
    (e) => zahl(e.eingehend),
  );
  auffaellig.appendChild(spalten);
}

// --- Registrierung -----------------------------------------------------------

export function initAreaStatsPage() {
  registerSystemPage({
    id: AREA_STATS_PAGE_ID,
    titleKey: 'stats.pageTitle',
    // Dynamischer Tab-Titel „Statistik: <Bereichs-Name>" (Muster Graph);
    // der titleKey bleibt Rückfall ohne Bereichs-Namen.
    title() {
      return state.areaName ? `${t('stats.pageTitle')}: ${state.areaName}` : t('stats.pageTitle');
    },
    onOpen() {
      // Frischer Seiten-Zustand pro Neu-Öffnen (Muster Einstellungs-Seite):
      // Sortierung und Kurzansicht zurück auf den Default.
      pageState.sortierung.eigenschaften = { spalte: 'dateien', absteigend: true, alle: false };
      pageState.sortierung.tags = { spalte: 'dateien', absteigend: true, alle: false };
      pageState.daten = null;
      pageState.fehler = null;
    },
    mount(container) {
      pageState.container = container;
      zeichne();
      // Erst-Mount ohne erhobene Zahlen (auch nach Sprach- oder
      // Spalten-Wechsel): nachladen.
      if (!pageState.daten && !pageState.laden) void erhebeUndZeichne();
    },
    onClose() {
      pageState.container = null;
    },
  });
}

// Für Aufrufer, die prüfen wollen, ob die Seite offen ist (Tests/Debug).
export function areaStatsPageOpen() {
  return !!findSystemTabAcrossPanes(AREA_STATS_PAGE_ID);
}
