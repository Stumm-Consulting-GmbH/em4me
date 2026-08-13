// 4T-0377 (Epic 3E-0071): Reine Zustandslogik für das Editor-Kontextmenü.
//
// Electron- und DOM-frei (CJS, wie src/shared/commands/commands.js), damit die
// Auswahl-Regeln des Klipboard-Blocks unit-testbar sind. Der Renderer
// (editor-context-menu.js) übersetzt die zurückgegebenen Zustände in konkrete
// Menü-Items mit i18n-Labels und Aktionen.
'use strict';

// Welche Klipboard-Einträge das Menü zeigt und ob sie aktiv sind.
// Parameter:
//   readOnly         Editor ist read-only -> nur Kopieren/Alles auswählen.
//   hasSelection     mindestens eine nicht-leere Selektions-Range.
//   hasClipboardText die Zwischenablage enthält Text (Einfügen aktiv).
//   docNotEmpty      das Dokument hat Inhalt (Alles auswählen aktiv).
// Rückgabe: geordnete Liste [{ id, enabled }] in Menü-Reihenfolge.
function computeClipboardMenuState({ readOnly, hasSelection, hasClipboardText, docNotEmpty } = {}) {
  if (readOnly) {
    // Read-only-Teilmenge (Epic-Entscheidung): kein Ausschneiden/Einfügen.
    return [
      { id: 'copy', enabled: !!hasSelection },
      { id: 'selectAll', enabled: !!docNotEmpty },
    ];
  }
  return [
    { id: 'cut', enabled: !!hasSelection },
    { id: 'copy', enabled: !!hasSelection },
    { id: 'paste', enabled: !!hasClipboardText },
    { id: 'selectAll', enabled: !!docNotEmpty },
  ];
}

module.exports = { computeClipboardMenuState };
