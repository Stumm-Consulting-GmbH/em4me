// 4T-000320 (Epic 3E-000057): Sitzungs-Schema ueber logische Applikationen.
//
// Persistiert wird der Store-Key 'apps' als Liste
//   [{ area: null | { rootPath }, windows: [{ bounds, maximized, panes }] }]
// statt der bisherigen flachen Fenster-Liste ('windows'-Key). Der Bereichsname
// wird NICHT persistiert, sondern beim Restore aus dem rootPath abgeleitet.
// Electron-frei (reine Funktionen), damit Migration und Normalisierung
// unit-testbar sind; main.js verdrahtet sie mit dem Store.
//
// 4T-000537 (Epic 3E-000098): dazu der Store-Key 'workspaces' — benannte
// Arbeitsbereiche als Liste
//   [{ id, name, color, open, lastOpenedAt, app: { area, windows } }]
// mit exakt dem App-Snapshot-Format des 'apps'-Keys im app-Feld. Additiv
// neben 'apps', keine Migration (Workshop-Punkt 6 in 4T-000536).
//
// 4T-000843 (Epic 3E-000147): der App-Snapshot trägt zusätzlich das aktive Buch
// als `book: { dir }`. Das Feld fehlt, solange kein Buch geöffnet ist, statt
// als `null` dazustehen: ein Bestands-Snapshot bleibt so unverändert, und
// die Ablage wächst nur, wo tatsächlich ein Buch offen war.
//
// 4T-000867 (Epic 3E-000162): nach demselben Muster das aktive Bücherregal als
// `shelf: { dir }` — nur vorhanden, solange ein Regal geöffnet ist.
'use strict';

const { TAB_GROUP_COLOR_KEYS } = require('../../shared/tab-group-colors');

// 4T-000843: Buch-Bindung eines persistierten App-Snapshots. Liefert das
// normalisierte Zusatz-Feld ({ book: { dir } }) oder ein leeres Objekt, das
// beim Spread nichts hinzufügt.
function bookField(entry) {
  const dir =
    entry && entry.book && typeof entry.book.dir === 'string' && entry.book.dir
      ? entry.book.dir
      : null;
  return dir ? { book: { dir } } : {};
}

// 4T-000867: Regal-Bindung eines persistierten App-Snapshots (Muster bookField).
function shelfField(entry) {
  const dir =
    entry && entry.shelf && typeof entry.shelf.dir === 'string' && entry.shelf.dir
      ? entry.shelf.dir
      : null;
  return dir ? { shelf: { dir } } : {};
}

// Einmalige Migration des flachen Bestands-Formats: alle Bestands-Fenster
// als EINE App ohne Bereich. Liefert null, wenn nichts zu migrieren ist
// (App-Schema bereits gefuellt oder kein Bestand). Der alte 'windows'-Key
// bleibt defensiv erhalten (Muster der Legacy-Settings-Migration).
function migrateWindowsToApps(existingApps, legacyWindows) {
  if (Array.isArray(existingApps) && existingApps.length > 0) return null;
  if (!Array.isArray(legacyWindows) || legacyWindows.length === 0) return null;
  return [{ area: null, windows: legacyWindows }];
}

// Defensive Normalisierung des persistierten Stands: nur Objekt-Eintraege
// mit nicht-leerer Fenster-Liste; area nur mit nicht-leerem string-rootPath.
function normalizeSavedApps(saved) {
  if (!Array.isArray(saved)) return [];
  const result = [];
  for (const entry of saved) {
    if (!entry || typeof entry !== 'object') continue;
    const windowsList = Array.isArray(entry.windows)
      ? entry.windows.filter((w) => w && typeof w === 'object')
      : [];
    if (windowsList.length === 0) continue;
    const rootPath =
      entry.area && typeof entry.area.rootPath === 'string' && entry.area.rootPath
        ? entry.area.rootPath
        : null;
    result.push({
      area: rootPath ? { rootPath } : null,
      ...bookField(entry),
      ...shelfField(entry),
      windows: windowsList,
    });
  }
  return result;
}

// Defensive Normalisierung der Arbeitsbereichs-Ablage: nur Objekt-Eintraege
// mit nicht-leerer string-id und nicht-leerem Namen (nach Trim); doppelte
// ids verlieren (erster Eintrag gewinnt). Farbe nur aus der Acht-Farben-
// Palette (sonst erste Paletten-Farbe), open strikt boolean, lastOpenedAt
// nur als string. Das app-Feld folgt derselben Fenster-/Bereichs-Filterung
// wie normalizeSavedApps, darf aber leer sein (das Oeffnen erzeugt dann ein
// leeres Standard-Fenster).
function normalizeSavedWorkspaces(saved) {
  if (!Array.isArray(saved)) return [];
  const result = [];
  const seenIds = new Set();
  for (const entry of saved) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    const appEntry = entry.app && typeof entry.app === 'object' ? entry.app : {};
    const windowsList = Array.isArray(appEntry.windows)
      ? appEntry.windows.filter((w) => w && typeof w === 'object')
      : [];
    const rootPath =
      appEntry.area && typeof appEntry.area.rootPath === 'string' && appEntry.area.rootPath
        ? appEntry.area.rootPath
        : null;
    result.push({
      id,
      name,
      color: TAB_GROUP_COLOR_KEYS.includes(entry.color) ? entry.color : TAB_GROUP_COLOR_KEYS[0],
      open: entry.open === true,
      lastOpenedAt: typeof entry.lastOpenedAt === 'string' ? entry.lastOpenedAt : null,
      app: {
        area: rootPath ? { rootPath } : null,
        ...bookField(appEntry),
        ...shelfField(appEntry),
        windows: windowsList,
      },
    });
  }
  return result;
}

// 4T-001364 (Epic 3E-000171): Hat eine wiederherzustellende Applikation ueberhaupt
// etwas wiederherzustellen? Die Frage traegt die Vorrang-Entscheidung aus
// 4T-001363 — die Start-Seite eines Bereichs greift NUR, wo die Antwort nein
// lautet, weil die Sitzungs-Wiederherstellung der ausdrueckliche Wunsch ist,
// dort weiterzumachen, wo der Anwender aufgehoert hat.
//
// Sie steht hier und nicht als Bedingung im Start-Ablauf, weil sie die
// Kern-Regel des Epics ist und ohne Electron pruefbar sein soll.
function sitzungHatPanes(windowsList) {
  if (!Array.isArray(windowsList)) return false;
  return windowsList.some((w) => Array.isArray(w?.panes) && w.panes.length > 0);
}

module.exports = {
  migrateWindowsToApps,
  normalizeSavedApps,
  normalizeSavedWorkspaces,
  sitzungHatPanes,
};
