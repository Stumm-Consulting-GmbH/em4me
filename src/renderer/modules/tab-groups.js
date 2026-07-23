// 4T-0459 (Epic 3E-0085): Tab-Gruppen-Modell — reine Helfer ohne DOM/IPC.
//
// Gruppen sind Anzeige-Struktur des Tab-Streifens (Epic-Architektur-
// entscheidung 3): das Tab-Modell (Reihenfolge, aktiver Tab) bleibt
// fuehrend; Gruppen referenzieren Tabs ueber tab.groupId, nie umgekehrt.
// Eine Pane traegt pane.groups = [{ id, name, color, collapsed }];
// color ist ein Palette-SCHLUESSEL (TAB_GROUP_COLOR_KEYS), die konkreten
// Farbwerte liegen als CSS-Variablen in styles.css (4T-0460).
//
// Invarianten (von den Helfern hergestellt bzw. erhalten):
//   1. Mitglieder einer Gruppe liegen zusammenhaengend im Streifen.
//   2. Leere Gruppen existieren nicht (pruneEmptyGroups).
//   3. tab.groupId zeigt nur auf existierende Gruppen der eigenen Pane.
//
// Alle Funktionen arbeiten auf Pane-Objekten { tabs, activeIndex, groups }
// und sind damit direkt unit-testbar (test/unit/renderer/tab-groups.test.js).
'use strict';

// Feste Acht-Farben-Palette — seit 4T-0537 (Epic 3E-0098) als Shared-
// Konstante in src/shared/tab-group-colors.js (auch die Arbeitsbereichs-
// Ablage nutzt sie); hier re-exportiert, Bestands-Importe bleiben gueltig.
import { TAB_GROUP_COLOR_KEYS } from '../../shared/tab-group-colors.js';

export { TAB_GROUP_COLOR_KEYS };

// Defensive Initialisierung: Panes aus Fremd-Quellen (alte Snapshots,
// Tests) tragen noch kein groups-Feld.
export function ensurePaneGroups(pane) {
  if (!Array.isArray(pane.groups)) pane.groups = [];
  return pane.groups;
}

export function groupById(pane, groupId) {
  if (!groupId) return null;
  return ensurePaneGroups(pane).find((g) => g.id === groupId) || null;
}

// Indizes aller Mitglieder einer Gruppe in Streifen-Reihenfolge.
export function memberIndices(pane, groupId) {
  const out = [];
  pane.tabs.forEach((tab, i) => {
    if (tab.groupId === groupId) out.push(i);
  });
  return out;
}

// Block-Bereich einer Gruppe ({ start, end } inklusive) — setzt die
// Zusammenhangs-Invariante voraus; null bei leerer Gruppe.
export function groupRange(pane, groupId) {
  const members = memberIndices(pane, groupId);
  if (members.length === 0) return null;
  return { start: members[0], end: members[members.length - 1] };
}

// Naechste freie Gruppen-ID der Pane ('tg1', 'tg2', …). IDs sind pro
// Fenster-Lebensdauer eindeutig genug (pro Pane vergeben, bei der
// Sitzungs-Wiederherstellung frisch erzeugt).
export function nextGroupId(pane) {
  let max = 0;
  for (const g of ensurePaneGroups(pane)) {
    const m = /^tg(\d+)$/.exec(String(g.id || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `tg${max + 1}`;
}

// Naechste freie Palette-Farbe: erste noch unbenutzte; sind alle benutzt,
// die am seltensten benutzte (bei Gleichstand die Palette-Reihenfolge).
export function nextFreeColor(pane) {
  const counts = new Map(TAB_GROUP_COLOR_KEYS.map((k) => [k, 0]));
  for (const g of ensurePaneGroups(pane)) {
    if (counts.has(g.color)) counts.set(g.color, counts.get(g.color) + 1);
  }
  let best = TAB_GROUP_COLOR_KEYS[0];
  let bestCount = Infinity;
  for (const key of TAB_GROUP_COLOR_KEYS) {
    const c = counts.get(key);
    if (c < bestCount) {
      best = key;
      bestCount = c;
    }
  }
  return best;
}

// Verschiebt einen Tab innerhalb der Pane (Splice-Paar) und haelt den
// aktiven Tab ueber Objekt-Identitaet stabil.
function moveTabKeepActive(pane, fromIdx, toIdx) {
  const activeObj = pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const [tab] = pane.tabs.splice(fromIdx, 1);
  pane.tabs.splice(toIdx, 0, tab);
  if (activeObj) pane.activeIndex = pane.tabs.indexOf(activeObj);
}

// Neue Gruppe mit genau diesem Tab anlegen. Ein bestehende Mitgliedschaft
// des Tabs endet dabei (die alte Gruppe wird ggf. bereinigt).
export function createTabGroup(pane, tabIdx, { name = '', color } = {}) {
  const tab = pane.tabs[tabIdx];
  if (!tab) return null;
  ensurePaneGroups(pane);
  const group = {
    id: nextGroupId(pane),
    name: String(name || ''),
    color: TAB_GROUP_COLOR_KEYS.includes(color) ? color : nextFreeColor(pane),
    collapsed: false,
  };
  tab.groupId = group.id;
  pane.groups.push(group);
  pruneEmptyGroups(pane);
  return group;
}

// Tab in eine bestehende Gruppe aufnehmen: er wandert ans Ende des
// Gruppen-Blocks (Zusammenhangs-Invariante). Liefert true bei Erfolg.
export function addTabToGroup(pane, tabIdx, groupId) {
  const tab = pane.tabs[tabIdx];
  const group = groupById(pane, groupId);
  if (!tab || !group || tab.groupId === groupId) return false;
  tab.groupId = groupId;
  const members = memberIndices(pane, groupId).filter((i) => i !== tabIdx);
  if (members.length > 0) {
    const last = members[members.length - 1];
    // Ziel-Index im Post-Splice-Koordinatensystem: liegt der Tab vor dem
    // Block, rutscht der Block beim Entfernen um eins nach vorn.
    const target = tabIdx < last ? last : last + 1;
    moveTabKeepActive(pane, tabIdx, target);
  }
  pruneEmptyGroups(pane);
  return true;
}

// 4T-0648 (Epic 3E-0130): Ein Reiter, der aus einem anderen Reiter heraus
// entsteht (Klick im Dokument, dokument-gebundene Folge-Ansicht), liegt
// unmittelbar rechts neben diesem Herkunfts-Reiter. Beide Helfer setzen
// tab.groupId auf die Gruppe der Herkunft — ein fremder Reiter zwischen zwei
// Mitgliedern wuerde den Block sonst zerreissen (Invariante 1), und ein
// Reiter am Block-Rand landet so in der Gruppe SEINER Herkunft statt
// gruppenlos daneben. Die Zuordnung laeuft bewusst unabhaengig vom Zustand
// der Erweiterung tab-groups: beim Einfuegen mitten in den Streifen kann
// „nichts tun" die Invariante nicht halten.
//
// Sie loesen den Vorgaenger insertTabAtGroupEnd (4T-0631) ab, der neue Tabs
// ans Gruppen-Ende haengte: bei mehreren Mitgliedern lag das Ziel dort weit
// von seiner Herkunft entfernt. Die Gruppen-Vererbung von 4T-0631 bleibt
// erhalten, nur der Einfuege-Ort wandert an die Herkunft.

// Neuen (noch nicht eingehaengten) Reiter unmittelbar hinter refIdx
// einfuegen. Liefert den Einfuege-Index; -1, wenn refIdx auf keinen Reiter
// zeigt — der Aufrufer haengt dann regulaer ans Streifen-Ende an.
export function insertTabNextTo(pane, tab, refIdx) {
  const ref = pane.tabs[refIdx];
  if (!tab || !ref) return -1;
  tab.groupId = ref.groupId || null;
  const insertIdx = refIdx + 1;
  pane.tabs.splice(insertIdx, 0, tab);
  if (pane.activeIndex >= insertIdx) pane.activeIndex++;
  return insertIdx;
}

// Bestehenden Reiter unmittelbar hinter refIdx verschieben (Umbinden einer
// Folge-Ansicht auf eine andere Herkunft). Liefert den neuen Index;
// -1 bei ungueltigen Indizes. Steht der Reiter bereits dort, bleibt die
// Reihenfolge unberuehrt. Der aktive Reiter bleibt ueber Objekt-Identitaet
// stabil, eine leer gewordene Herkunfts-Gruppe entfaellt.
export function moveTabNextTo(pane, tabIdx, refIdx) {
  const tab = pane.tabs[tabIdx];
  const ref = pane.tabs[refIdx];
  if (!tab || !ref || tabIdx === refIdx) return -1;
  tab.groupId = ref.groupId || null;
  // Ziel-Index im Post-Splice-Koordinatensystem: liegt der Reiter links des
  // Bezugs, rutscht dieser beim Entfernen um eins nach vorn.
  const target = tabIdx < refIdx ? refIdx : refIdx + 1;
  if (target !== tabIdx) moveTabKeepActive(pane, tabIdx, target);
  pruneEmptyGroups(pane);
  return target;
}

// Tab aus seiner Gruppe entfernen: er verlaesst den Block und steht
// unmittelbar dahinter (Browser-Muster). Liefert true bei Erfolg.
export function removeTabFromGroup(pane, tabIdx) {
  const tab = pane.tabs[tabIdx];
  if (!tab || !tab.groupId) return false;
  const groupId = tab.groupId;
  tab.groupId = null;
  const members = memberIndices(pane, groupId);
  if (members.length > 0) {
    const last = members[members.length - 1];
    const target = tabIdx < last ? last : last + 1;
    if (target !== tabIdx) moveTabKeepActive(pane, tabIdx, target);
  }
  pruneEmptyGroups(pane);
  return true;
}

// Gruppe aufloesen: Tabs bleiben an Ort und Stelle offen, nur die
// Gruppen-Struktur entfaellt.
export function dissolveGroup(pane, groupId) {
  const group = groupById(pane, groupId);
  if (!group) return false;
  for (const tab of pane.tabs) {
    if (tab.groupId === groupId) tab.groupId = null;
  }
  pane.groups = pane.groups.filter((g) => g.id !== groupId);
  return true;
}

// Invariante 2: Gruppen ohne Mitglieder entfernen (nach Schliessen/
// Verschieben des letzten Mitglieds).
export function pruneEmptyGroups(pane) {
  const groups = ensurePaneGroups(pane);
  if (groups.length === 0) return;
  const used = new Set(pane.tabs.map((t) => t.groupId).filter(Boolean));
  pane.groups = groups.filter((g) => used.has(g.id));
}

// Gruppen-Zugehoerigkeit fuer einen Tab, der an insertIdx eingefuegt wird
// (Koordinaten NACH dem Entfernen an der Quelle): wer strikt zwischen zwei
// Mitgliedern derselben Gruppe landet, tritt ihr bei — an fremden
// Block-Raendern bleibt der Tab ungruppiert (sonst waere ein Ablegen
// direkt neben einer Gruppe nie gruppenfrei moeglich). Die EIGENE Gruppe
// (ownGroupId) haelt ihren Tab auch an den Block-Raendern: Ziehen
// innerhalb der Gruppe verschiebt, Austritt erfordert das vollstaendige
// Herausziehen aus dem Block (Browser-Muster, Epic-Umfang).
export function groupIdForInsertion(tabs, insertIdx, ownGroupId = null) {
  const prev = insertIdx > 0 ? tabs[insertIdx - 1] : null;
  const next = insertIdx < tabs.length ? tabs[insertIdx] : null;
  if (prev && next && prev.groupId && prev.groupId === next.groupId) return prev.groupId;
  if (
    ownGroupId &&
    ((prev && prev.groupId === ownGroupId) || (next && next.groupId === ownGroupId))
  ) {
    return ownGroupId;
  }
  return null;
}

// --- Klapp-Zustand -----------------------------------------------------------

export function isTabVisible(pane, tabIdx) {
  const tab = pane.tabs[tabIdx];
  if (!tab) return false;
  const group = groupById(pane, tab.groupId);
  return !group || !group.collapsed;
}

// Gruppe des Tabs aufklappen (z.B. Datei-Oeffnen in eine zugeklappte
// Gruppe). Liefert true, wenn sich der Zustand geaendert hat.
export function expandGroupOfTab(pane, tabIdx) {
  const tab = pane.tabs[tabIdx];
  const group = tab ? groupById(pane, tab.groupId) : null;
  if (!group || !group.collapsed) return false;
  group.collapsed = false;
  return true;
}

// Naechster sichtbarer Tab ausgehend von fromIdx: erst rechts suchen,
// dann links (Aktivierungs-Wechsel beim Zuklappen, 4T-0460).
export function nextVisibleTabIndex(pane, fromIdx, excludeGroupId = null) {
  const visible = (i) =>
    isTabVisible(pane, i) && (!excludeGroupId || pane.tabs[i].groupId !== excludeGroupId);
  for (let i = fromIdx + 1; i < pane.tabs.length; i++) {
    if (visible(i)) return i;
  }
  for (let i = fromIdx - 1; i >= 0; i--) {
    if (visible(i)) return i;
  }
  return -1;
}

// 4T-0460: Aktivierungs-Regel nach Tab-Operationen — zeigt der aktive
// Index auf einen durch eine zugeklappte Gruppe verborgenen Tab, wird der
// naechste sichtbare bevorzugt; gibt es keinen, klappt die Gruppe des
// aktiven Tabs auf (Kanten-Fall „Schliessen des letzten sichtbaren Tabs").
export function ensureActiveTabVisible(pane) {
  if (pane.activeIndex < 0) return;
  if (isTabVisible(pane, pane.activeIndex)) return;
  const alt = nextVisibleTabIndex(pane, pane.activeIndex);
  if (alt >= 0) pane.activeIndex = alt;
  else expandGroupOfTab(pane, pane.activeIndex);
}

// 4T-0460: Kopf-Ziehen verschiebt die ganze Gruppe. insertIdx ist der
// Einfuege-Index in Tab-Koordinaten VOR dem Entfernen des Blocks (wie bei
// den Tab-Drop-Zonen). Faellt der Zielpunkt strikt in einen fremden
// Gruppen-Block, schnappt der Block dahinter (fremde Gruppen werden nie
// gespalten). Der aktive Tab bleibt ueber Objekt-Identitaet stabil.
export function moveGroupWithinPane(pane, groupId, insertIdx) {
  const members = memberIndices(pane, groupId);
  if (members.length === 0) return false;
  const activeObj = pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const block = pane.tabs.filter((t) => t.groupId === groupId);
  const rest = pane.tabs.filter((t) => t.groupId !== groupId);
  // Voll- auf Rest-Koordinaten umrechnen: Mitglieder vor dem Zielpunkt
  // sind im Rest nicht mehr enthalten.
  let idx = insertIdx - members.filter((i) => i < insertIdx).length;
  idx = Math.max(0, Math.min(idx, rest.length));
  const foreign = groupIdForInsertion(rest, idx);
  if (foreign) {
    while (idx < rest.length && rest[idx].groupId === foreign) idx++;
  }
  pane.tabs = [...rest.slice(0, idx), ...block, ...rest.slice(idx)];
  if (activeObj) pane.activeIndex = pane.tabs.indexOf(activeObj);
  return true;
}

// --- Normalisierung ----------------------------------------------------------
// Voll-Reparatur der Invarianten (Sitzungs-Wiederherstellung, defensive
// Aufraeumarbeit): unbekannte groupIds kappen, Farben/Namen/Flags
// bereinigen, Zusammenhang durch stabile Umordnung herstellen (beim
// ersten Mitglied einer Gruppe folgen alle weiteren Mitglieder in ihrer
// relativen Reihenfolge), leere Gruppen entfernen.
export function normalizePaneGroups(pane) {
  const groups = ensurePaneGroups(pane);
  const known = new Set(groups.map((g) => g.id));
  for (const tab of pane.tabs) {
    if (tab.groupId === undefined) tab.groupId = null;
    if (tab.groupId && !known.has(tab.groupId)) tab.groupId = null;
  }
  for (const g of groups) {
    g.name = String(g.name || '');
    if (!TAB_GROUP_COLOR_KEYS.includes(g.color)) g.color = TAB_GROUP_COLOR_KEYS[0];
    g.collapsed = !!g.collapsed;
  }
  // Zusammenhang: stabile Umordnung ueber Objekt-Identitaet.
  const activeObj = pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const placed = new Set();
  const ordered = [];
  for (const tab of pane.tabs) {
    if (placed.has(tab)) continue;
    if (!tab.groupId) {
      ordered.push(tab);
      placed.add(tab);
      continue;
    }
    for (const member of pane.tabs) {
      if (member.groupId === tab.groupId && !placed.has(member)) {
        ordered.push(member);
        placed.add(member);
      }
    }
  }
  pane.tabs = ordered;
  if (activeObj) pane.activeIndex = pane.tabs.indexOf(activeObj);
  pruneEmptyGroups(pane);
  return pane;
}

// --- Sitzungs-Persistenz (4T-0459) --------------------------------------------
// Der Panes-Snapshot filtert pfadlose Tabs (System-Seiten, Handbuch,
// Unbenannt) heraus; die Gruppen-Struktur muss auf den GEFILTERTEN
// Indizes ausgedrueckt werden. Persistiert wird pro Pane additiv:
//   groups:  [{ name, color, collapsed }]   (nur Gruppen mit >= 1
//            persistiertem Mitglied, in Streifen-Reihenfolge)
//   tabSettings[j].group: <Index in groups> (nur bei gruppierten Tabs)
// Gruppen-freie Sitzungen erzeugen damit exakt das bisherige Schema;
// aeltere Snapshots ohne groups-Feld laden unveraendert.

// Liefert { groups, groupOf } fuer die per keptIndices gefilterten Tabs;
// groupOf[j] ist der Index in groups oder -1.
export function buildGroupsSnapshot(pane, keptIndices) {
  const groups = [];
  const idToIndex = new Map();
  const groupOf = keptIndices.map((i) => {
    const tab = pane.tabs[i];
    const group = tab ? groupById(pane, tab.groupId) : null;
    if (!group) return -1;
    if (!idToIndex.has(group.id)) {
      idToIndex.set(group.id, groups.length);
      groups.push({ name: group.name, color: group.color, collapsed: !!group.collapsed });
    }
    return idToIndex.get(group.id);
  });
  return { groups, groupOf };
}

// Stellt die Gruppen eines wiederhergestellten Pane-Eintrags her.
// rawGroups ist entry.groups (oder undefined bei Alt-Snapshots),
// rawGroupOf die group-Werte der tabSettings in Tab-Reihenfolge.
// Defensive Werte werden verworfen; am Ende laeuft die Voll-Reparatur.
export function restoreGroupsIntoPane(pane, rawGroups, rawGroupOf) {
  ensurePaneGroups(pane);
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return pane;
  const created = rawGroups.map((raw) => {
    const group = {
      id: nextGroupId(pane),
      name: raw && typeof raw.name === 'string' ? raw.name : '',
      color: raw && TAB_GROUP_COLOR_KEYS.includes(raw.color) ? raw.color : TAB_GROUP_COLOR_KEYS[0],
      collapsed: !!(raw && raw.collapsed),
    };
    pane.groups.push(group);
    return group;
  });
  const groupOf = Array.isArray(rawGroupOf) ? rawGroupOf : [];
  pane.tabs.forEach((tab, j) => {
    const gi = groupOf[j];
    if (Number.isInteger(gi) && gi >= 0 && gi < created.length) {
      tab.groupId = created[gi].id;
    }
  });
  return normalizePaneGroups(pane);
}
