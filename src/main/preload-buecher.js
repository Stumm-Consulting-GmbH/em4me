// 4T-001505 (Zug 3E-000277): Der Buecher-Anteil der Preload-Bruecke.
//
// **Warum ein eigenes Modul.** Die Bruecke hat beim neunten Rebase-Lauf des
// Zuges ihr Datei-Budget von 500 Code-Zeilen gerissen (501), weil zwei Seiten
// sie im selben Zeitraum verlaengert haben, jede fuer sich innerhalb des
// Budgets. Geschnitten wird deshalb an einer fachlichen Naht, statt den
// Waechter ueber einen Eintrag in seiner Ausnahmeliste zu lockern; das ist
// dieselbe Entscheidung, die 4T-001758 fuer den Datenbank-Anteil getroffen hat.
//
// **Warum gerade die Buecher.** Der Block ist der groesste bereits benannte
// Themen-Raum der Bruecke: Er traegt seinen eigenen Namensraum, steht
// zusammenhaengend an einer Stelle und waechst mit seinem Funktions-Umfang
// weiter. Das Muster ist preload-datenbank.js, eine Bruecken-Funktion je
// Themen-Gruppe, per Spread in das Bruecken-Objekt eingebunden.
//
// Reine Kanal-Bindungen ohne eigenen Zustand. Das IPC-Objekt kommt als
// Parameter und nicht per Require, damit das Modul ohne Electron pruefbar
// bleibt.
'use strict';

/**
 * Die Kanal-Bindungen rund um Buecher.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses.
 * @returns {object} Eintraege fuer das Bruecken-Objekt.
 */
function buecherBruecke(ipcRenderer) {
  return {
    // 4T-000843 (Epic 3E-000147): Buecher. Eigener Namensraum statt flacher
    // book*-Namen, weil der Block als Ganzes zu einer schaltbaren Erweiterung
    // gehoert und der Renderer ihn an EINER Stelle greift.
    //
    // getState liefert { active: null | { bookDir, bookFileName, tree,
    // readingOrder, unlinked, missing, missingSuggestions } } fuer die
    // Applikation des Fensters; `missingSuggestions` bildet einen fehlenden
    // Kapitel-Pfad auf seine namensgleichen Funde ab (4T-000848, nur Eintraege
    // mit Fund). `tree` ist der Kapitel-Baum aus { path, children }-Knoten mit
    // buch-relativen Pfaden. onStateChanged meldet jedes Oeffnen, Schliessen,
    // Anlegen und die Sitzungs-Wiederherstellung an alle Fenster der App.
    books: {
      getState: () => ipcRenderer.invoke('books:getState'),
      openDialog: () => ipcRenderer.invoke('books:openDialog'),
      createDialog: () => ipcRenderer.invoke('books:createDialog'),
      close: () => ipcRenderer.invoke('books:close'),
      openChapter: (relPath) => ipcRenderer.invoke('books:openChapter', relPath),
      onStateChanged: (cb) => ipcRenderer.on('books:stateChanged', (_e, state) => cb(state)),
      // Dialog-freie Pfad-Einstiege beider Wege (Muster openAreaPath und
      // createDemoAreaAt): identische Strecke ab der Ordner-Wahl, damit
      // Oeffnen und Anlegen ohne den nativen Dialog automatisiert pruefbar
      // sind.
      openPath: (bookDir) => ipcRenderer.invoke('books:openPath', bookDir),
      createAt: (parentDir, name) => ipcRenderer.invoke('books:createAt', { parentDir, name }),
      // 4T-000845 (Story 4S-000754): Struktur-Pflege. EINE Baum-Operation je Aufruf;
      // waehrend eines Zuges wird nichts geschrieben, erst die Ablage loest
      // genau einen applyTreeOp aus. Op-Formen (`parentPath: null` = oberste
      // Ebene, `index: null` = ans Ende der Ziel-Ebene):
      //   { type: 'insert', path, parentPath, index }
      //   { type: 'remove', path }
      //   { type: 'moveWithinLevel', path, direction: 'up'|'down' }
      //   { type: 'move', path, parentPath, index }
      //   { type: 'indent', path }
      //   { type: 'outdent', path }
      // Ergebnis { ok } bzw. { ok: false, error }; eine abgelehnte Operation
      // schreibt nichts. createChapter legt genau eine leere Markdown-Datei an
      // (im Ordner der Eltern-Kapitel-Datei, auf oberster Ebene im Buch-Ordner)
      // und haengt sie unmittelbar ein.
      applyTreeOp: (op) => ipcRenderer.invoke('books:applyTreeOp', op),
      createChapter: (parentPath, name) =>
        ipcRenderer.invoke('books:createChapter', { parentPath, name }),
      // 4T-000847 (Story 4S-000756): Kapitel-Datei physisch innerhalb des
      // Buch-Ordners verschieben. Der Ordner-Dialog läuft im Main, das Ziel
      // MUSS im Buch-Ordner liegen; die Links des Bestands und der
      // Kapitel-Baum-Eintrag der Begleitdatei ziehen im selben Zug nach.
      // Ergebnis { ok: true, relPath, path, linkUpdate }, { ok: false,
      // canceled: true } beim Abbruch des Dialogs oder { ok: false, error }.
      // moveChapterFileTo ist der dialogfreie Pfad-Einstieg (Muster openPath).
      moveChapterFile: (relPath) => ipcRenderer.invoke('books:moveChapterFile', relPath),
      moveChapterFileTo: (relPath, targetDir) =>
        ipcRenderer.invoke('books:moveChapterFileTo', { relPath, targetDir }),
      // 4T-000848 (Story 4S-000757): Reparatur fehlender Kapitel. suggestMissing
      // liefert { ok: true, suggestions: [buch-relative Pfade] } — namensgleiche
      // Dateien an anderer Stelle des Buch-Ordners, nie automatisch uebernommen.
      // reassignChapter ordnet dem Baum-Eintrag eine andere Datei zu (`newPath`
      // buch-relativ oder absolut, immer im Buch-Ordner); die Baum-Position
      // bleibt. reassignChapterDialog ist derselbe Weg mit vorgeschaltetem
      // Datei-Dialog des Main-Prozesses (Muster moveChapterFile) und meldet den
      // Abbruch als { ok: false, canceled: true }.
      suggestMissing: (missingPath) => ipcRenderer.invoke('books:suggestMissing', missingPath),
      reassignChapter: (missingPath, newPath) =>
        ipcRenderer.invoke('books:reassignChapter', { missingPath, newPath }),
      reassignChapterDialog: (missingPath) =>
        ipcRenderer.invoke('books:reassignChapterDialog', missingPath),
    },
  };
}

module.exports = { buecherBruecke };
