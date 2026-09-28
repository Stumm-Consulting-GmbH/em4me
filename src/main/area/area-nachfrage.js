// 4T-001743 (Epic 3E-000309): Nachfrage beim Öffnen eines bereits laufenden
// Bereichs.
//
// Läuft der gewählte Ordner schon als Bereich, entscheidet nicht mehr die
// Anwendung still, sondern — wenn an der laufenden Applikation ein
// Arbeitsbereich hängt — der Anwender: in das laufende Fenster wechseln oder
// den Bereich zusätzlich in einer neuen Applikation öffnen (E1, E10). Ohne
// Arbeitsbereich bleibt es beim Sprung wie bisher; zwei Fenster desselben
// Bereichs ohne Arbeitsbereich wären am Titel nicht unterscheidbar.
//
// Eigenes Modul, damit der Eingriff in area-apps.js eng bleibt und die
// Auswahl-Regel ohne Electron prüfbar ist.
'use strict';

// Welche laufende Applikation betrifft das Öffnen, und wird nachgefragt?
//   - Keine Applikation führt den Ordner -> null (Öffnen wie bisher).
//   - Eine Applikation OHNE Arbeitsbereich führt ihn -> Sprung dorthin, ohne
//     Nachfrage. Das ist der Wortlaut von E10 («läuft der Bereich ohne
//     Arbeitsbereich, springt die Anwendung wie heute in dessen Fenster»), und
//     es verhindert, dass eine zweite gewöhnliche Applikation neben einer
//     ersten entsteht, von der sie am Titel nicht zu unterscheiden wäre.
//   - Sonst führen ihn nur Arbeitsbereichs-Applikationen -> Nachfrage; Ziel
//     des Wechsels ist die erste von ihnen in Erzeugungs-Reihenfolge.
//   - Ist die Erweiterung «Arbeitsbereiche» ausgeschaltet, gibt es keine
//     Nachfrage, sondern den Sprung: Ohne die Erweiterung entfällt der
//     Titel-Zusatz «Arbeitsbereich …», und beide Fenster trügen denselben
//     Titel. Anwendung von E10 (Unterscheidbarkeit), nicht neu entschieden.
// Buch- und Regal-Applikationen tragen ihren Ordner ebenfalls als Bereich
// (Befund Z2 aus 4T-001742) und werden hier wie jede andere Applikation mit
// diesem Ordner behandelt, wie schon vor der Nachfrage.
//
// @param {object} appRegistry App-Registry (appIds, getArea, getWorkspace).
// @param {string} rootPath Normalisierter Wurzel-Pfad des gewählten Ordners.
// @param {(a: string, b: string) => boolean} isSamePath Pfad-Vergleich.
// @param {boolean} [arbeitsbereicheAktiv=true] Erweiterung «Arbeitsbereiche» an.
// @returns {{ appId: number, nachfragen: boolean } | null}
function laufendeBereichsApp(appRegistry, rootPath, isSamePath, arbeitsbereicheAktiv = true) {
  const treffer = appRegistry.appIds().filter((id) => {
    const area = appRegistry.getArea(id);
    return !!(area && area.rootPath && isSamePath(area.rootPath, rootPath));
  });
  if (treffer.length === 0) return null;
  const ohneArbeitsbereich = treffer.find((id) => !appRegistry.getWorkspace(id));
  if (ohneArbeitsbereich != null) return { appId: ohneArbeitsbereich, nachfragen: false };
  return { appId: treffer[0], nachfragen: !!arbeitsbereicheAktiv };
}

// Die Nachfrage als Dialog des Haupt-Prozesses (T1 aus 4T-001742): zwei Wege
// und «Abbrechen». Abbrechen ist Escape-Ziel und hat keine Wirkung; Vorgabe ist
// der Wechsel, weil er das bisherige Verhalten fortsetzt.
//
// @param {object} opts
// @param {object} opts.dialog Electron-Dialog (injiziert, damit prüfbar).
// @param {Function} opts.tForWindow Lokalisierter Text in Fenster-Sprache.
// @param {object|null} opts.owner Auslösendes Fenster oder null.
// @param {string} opts.bereichName Name des Bereichs (Ordnername).
// @param {string} opts.arbeitsbereichName Name des laufenden Arbeitsbereichs.
// @returns {Promise<'wechseln'|'zusaetzlich'|'abbrechen'>}
async function frageNachLaufendemBereich({
  dialog,
  tForWindow,
  owner,
  bereichName,
  arbeitsbereichName,
}) {
  const t = (k) => tForWindow(owner, k);
  const ergebnis = await dialog.showMessageBox(owner || undefined, {
    type: 'question',
    title: t('area.alreadyOpen.title'),
    message: t('area.alreadyOpen.message').replace('{name}', String(bereichName || '')),
    detail: t('area.alreadyOpen.detail').replace('{workspace}', String(arbeitsbereichName || '')),
    buttons: [
      t('area.alreadyOpen.switch'),
      t('area.alreadyOpen.openAdditional'),
      t('area.alreadyOpen.cancel'),
    ],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (ergebnis.response === 0) return 'wechseln';
  if (ergebnis.response === 1) return 'zusaetzlich';
  return 'abbrechen';
}

module.exports = { laufendeBereichsApp, frageNachLaufendemBereich };
