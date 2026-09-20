// 4T-001738 (Epic 3E-000308): Der Fenster-Block des Datei-Menues — «Neues
// Fenster» und «Neue Applikation» als Paar.
//
// **Warum das Paar hier liegt und nicht in der Menue-Fabrik.** Die Reihenfolge
// der beiden Eintraege ist Gegenstand einer Entscheidung (E4 des Epics: das
// kleinere Werkzeug zuerst) und keine Nebensache: Wer eine zweite Flaeche fuer
// dasselbe Arbeiten sucht, soll sie finden, bevor er auf den Eintrag trifft,
// der einen eigenen Zusammenhang erzeugt — genau diese Verwechslung ist der
// Anlass des Vorgangs. Eine Entscheidung, die niemand messen kann, verfaellt
// beim naechsten Umbau; die Menue-Fabrik selbst laedt Electron und ist im
// Unit-Kontext nicht ladbar, ihre Reihenfolge waere also nur ueber einen
// Quelltext-Ausdruck pruefbar. Dieses Modul ist electron-frei und liefert die
// beiden Eintraege als Liste, an der die Reihenfolge gegenstaendlich gemessen
// wird (Muster menu-recent.js und menu-workspaces.js).
//
// Die vier Bausteine kommen wie dort von aussen herein (t, acc, avail, send),
// damit das Modul weder Uebersetzung noch Kommando-Registry noch den
// Fenster-Kanal selbst kennen muss.
'use strict';

/**
 * Die beiden Eintraege des Fenster-Blocks in ihrer festgelegten Reihenfolge.
 *
 * @param {object} deps Bausteine der Menue-Fabrik.
 * @param {(key: string) => string} deps.t Uebersetzung eines Katalog-Schluessels.
 * @param {(commandId: string) => string|undefined} deps.acc Wirksames Kuerzel eines Kommandos.
 * @param {(commandId: string) => boolean} deps.avail Freigabe aus dem Verfuegbarkeits-Modell.
 * @param {(channel: string) => Function} deps.send Klick-Weiterleitung an den Anzeige-Prozess.
 * @returns {object[]} Erst «Neues Fenster», dann «Neue Applikation».
 */
function windowMenuItems({ t, acc, avail, send }) {
  return [
    {
      // 4T-001738: Ein weiteres Fenster der laufenden Applikation, leer im
      // Start-Zustand OHNE Reiter — so, wie jedes frisch gestartete Fenster
      // ohne Dokument aussieht. Der Anzeige-Prozess ruft daraufhin den
      // bestehenden Kanal window:openNew ohne Panes und ohne Reiter-Nutzlast
      // (E6); ein zweiter Weg daneben entsteht nicht, und es wird ausdruecklich
      // kein Reiter angelegt (Entscheidung des Product Owners vom 2026-09-19:
      // der Menuepunkt soll ein Fenster nicht anders aufgehen lassen als jeder
      // andere Weg der Anwendung).
      label: t('menu.file.newWindow'),
      accelerator: acc('window.newWindow'),
      enabled: avail('window.newWindow'),
      click: send('menu:newWindow'),
    },
    {
      // 4T-000319 (Epic 3E-000057): neue logische Applikation (eigener
      // Fenster-Verbund mit eigener Nummerierung; entspricht dem
      // EXE-Zweitstart ohne Datei-Argument). Unveraendert aus menu.js
      // hierher gezogen, damit das Paar an einer Stelle steht.
      label: t('menu.file.newApp'),
      accelerator: acc('app.newApplication'),
      enabled: avail('app.newApplication'),
      click: send('menu:newApplication'),
    },
  ];
}

module.exports = { windowMenuItems };
