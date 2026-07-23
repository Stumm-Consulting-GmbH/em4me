// 4T-0318 (Epic 3E-0057): Aufbau des Fenstertitel-Suffixes und der
// Fenster-Ziel-Labels als reine Funktionen (unit-testbar, ohne DOM/State).
//
// Gestufte Titel-Systematik (PO-Entscheidung 2026-07-03):
//   - App-Teil nur, wenn mehr als eine NUMMERIERTE Applikation laeuft
//     (Bereichs-Apps tragen keine Nummer, sondern immer den Bereichsnamen).
//   - Fenster-Teil nur, wenn die eigene Applikation mehr als ein Fenster hat.
//   - Kombination komma-getrennt in einer Klammer: "(App 2, Fenster 3)",
//     "(Bereich Notizen, Fenster 2)"; ohne Teile kein Suffix.
'use strict';

// info: { workspaceName, areaName, appNumber, numberedAppCount, displayNumber,
//         totalWindowCount }
// t: Uebersetzungsfunktion (key) -> string mit {n}/{name}-Platzhaltern.
// 4T-0538 (Epic 3E-0098): der Arbeitsbereichs-Name tritt an die Stelle der
// App-Nummer; bei gebundenem Bereich kombiniert mit dem Bereichsnamen,
// z.B. "(Arbeitsbereich Alpha, Bereich Notizen, Fenster 2)".
export function buildTitleSuffixParts(info, t) {
  const parts = [];
  if (info.workspaceName) {
    parts.push(t('window.title.workspace').replace('{name}', String(info.workspaceName)));
    if (info.areaName) {
      parts.push(t('window.title.area').replace('{name}', String(info.areaName)));
    }
  } else if (info.areaName) {
    parts.push(t('window.title.area').replace('{name}', String(info.areaName)));
  } else if ((info.numberedAppCount || 1) > 1) {
    parts.push(t('window.title.app').replace('{n}', String(info.appNumber || 1)));
  }
  if ((info.totalWindowCount || 1) > 1) {
    parts.push(t('window.title.suffix').replace('{n}', String(info.displayNumber || 1)));
  }
  return parts;
}

export function buildTitleSuffix(info, t) {
  const parts = buildTitleSuffixParts(info, t);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

// Label eines Ziel-Fensters im Tab-Kontextmenue ("Verschieben/Kopieren in").
// w: Eintrag aus window:list ({ displayNumber, appNumber, appCount, areaName }).
// Der App-Teil erscheint, sobald mehr als eine Applikation laeuft (auch
// Bereichs-Apps zaehlen — das Ziel muss eindeutig benannt sein); der
// Fenster-Teil steht immer, weil die Liste Fenster adressiert.
export function buildWindowTargetLabel(w, t) {
  const windowPart = t('tab.menu.targetWindowLabel').replace(
    '{n}',
    String((w && w.displayNumber) || 1),
  );
  if (!w) return windowPart;
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Apps sind ueber ihren Namen
  // eindeutig adressiert (analog Bereichs-Apps).
  if (w.workspaceName) {
    return `${t('window.title.workspace').replace('{name}', String(w.workspaceName))}, ${windowPart}`;
  }
  if (w.areaName) {
    return `${t('window.title.area').replace('{name}', String(w.areaName))}, ${windowPart}`;
  }
  if ((w.appCount || 1) > 1) {
    return `${t('window.title.app').replace('{n}', String(w.appNumber || 1))}, ${windowPart}`;
  }
  return windowPart;
}
