// 4T-002227 (Epic 3E-000356, Story 4S-000028): Die Seite «Arbeitsbereiche» —
// die Verwaltung der Arbeitsbereiche als System-Seite statt als Pop-up.
//
// **Muster sind die System-Seiten**, allen voran My Extended Memory
// (memory-page.js): pfadloser Reiter über die Registry in system-pages.js,
// höchstens eine Seite je Fenster, keine Sitzungs-Wiederherstellung, kein
// Bearbeiten und kein Speichern. Die Daten kommen frisch vom Hauptprozess
// (`workspace:list`), gebaut wird ausschließlich über textContent, und ein
// `zeichne()` ersetzt den Aufbau vollständig.
//
// **Die Bausteine der Zeilen sind aus dem Pop-up übernommen**, nicht
// nachgebaut: die Verschiebe-Knöpfe (4T-001753), die Fokus-Wiederherstellung
// nach dem Neuaufbau und die drei Aktionen in ihrer Reihenfolge. Geändert hat
// sich allein die Gestalt (Variante B «Zeilen», Entscheidung des Product
// Owners vom 2026-10-17, Empfehlung pauschal übernommen): Der Name steht
// fett und ungekürzt über der Pfad-Zeile, darunter Zustand und letztes
// Öffnen, die Schaltflächen-Gruppe rechts daneben oder, wenn die Seite zu
// schmal ist, darunter. Diese Regel steckt allein im Stil (reiter-und-panes.css)
// und hängt an der Breite der Seite, nicht des Fensters.
//
// **Keine Schaltflächen-Leiste** (M2): Jede Aktion wirkt sofort über den
// Kanal, den schon das Pop-up rief, und die Seite zeichnet sich über die
// Änderungs-Meldung des Hauptprozesses nach. Einen eigenen Nachzug-Weg gibt es
// nicht; so bleibt die Ablage die eine Quelle (Eintrag zur Reihenfolge in
// «Erkenntnisse und Entscheidungen»).
//
// **Aus-Zustand der Erweiterung «Arbeitsbereiche»** (M4): Der Öffner ist das
// Tor, durch das Menüpunkt, Kommando und zugewiesenes Kürzel gemeinsam laufen
// (Vorbild oeffneDatenbankUebersicht). Eine schon offene Seite bleibt stehen
// und zeigt statt der Liste den Hinweis; die Anzeige trägt die ganze Last,
// weil der Hauptprozess Öffnen, Umbenennen, Löschen und Verschieben nicht am
// Schalter prüft.
'use strict';

import { t } from '../../i18n.js';
import { api } from './api.js';
import { registerSystemPage, openSystemPage, findSystemTabAcrossPanes } from './system-pages.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { showWorkspaceDialog } from './workspaces.js';

export const WORKSPACES_PAGE_ID = 'workspaces';

// Die Erweiterung, an der die Verwaltung hängt (extensions.js, Eintrag
// `workspaces`, Kommando `workspace.manage`).
const EXTENSION_ID = 'workspaces';

// Seiten-Zustand. `liste === null` heißt «noch nicht geladen» und ist von der
// leeren Ablage zu unterscheiden — sonst blitzte der Hinweis der leeren Liste
// bei jedem Öffnen kurz auf.
const seite = {
  container: null,
  liste: null,
  laden: false,
  erneut: false,
};

// 4T-001753: Der Fokus, der nach dem nächsten Neuaufbau wiederhergestellt
// werden soll — { id, direction } nach einer Verschiebung. Ohne diesen Merker
// wäre die Reihenfolge mit der Tastatur nur EINEN Schritt weit bedienbar: Die
// Liste baut sich nach jeder Verschiebung neu auf, der gedrückte Knopf
// verschwindet mitsamt seinem Fokus.
let fokusNachAufbau = null;

/**
 * Öffnet die Seite (Menüpunkt, Kommando, zugewiesenes Kürzel). Ein bereits
 * offener Reiter wird aktiviert statt ein zweiter angelegt — das leistet
 * openSystemPage. Im Aus-Zustand der Erweiterung geschieht nichts: Eine
 * abgeschaltete Funktion meldet sich nicht, sie ist nicht da (Story AK28).
 */
export function openWorkspacesPage() {
  if (!isExtensionActive(EXTENSION_ID)) return;
  openSystemPage(WORKSPACES_PAGE_ID);
}

/**
 * Ist die Seite in diesem Fenster offen? (Prüffälle und Fehlersuche.)
 *
 * @returns {boolean} true, wenn ein Reiter der Seite steht.
 */
export function workspacesPageOpen() {
  return !!findSystemTabAcrossPanes(WORKSPACES_PAGE_ID);
}

// --- Daten -------------------------------------------------------------------

// Holt die Liste und zeichnet. Trifft eine Änderungs-Meldung während eines
// laufenden Abrufs ein, wird danach ein weiterer Abruf nachgeschoben: Ein
// verworfener zweiter Aufruf ließe sonst den Stand vor der Änderung stehen.
async function ladeUndZeichne() {
  if (seite.laden) {
    seite.erneut = true;
    return;
  }
  seite.laden = true;
  try {
    do {
      seite.erneut = false;
      let liste;
      try {
        liste = await api.workspacesList();
      } catch {
        liste = null;
      }
      // Ein ausgebliebenes Ergebnis kann nur ein Abriss der Verbindung sein;
      // die leere Liste behauptet dann nichts über einen nicht gelesenen Bestand.
      seite.liste = Array.isArray(liste) ? liste : [];
    } while (seite.erneut);
  } finally {
    seite.laden = false;
  }
  zeichne();
}

// --- Bausteine ---------------------------------------------------------------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

function formatLastOpened(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function textKnopf(text, aktion, beiKlick) {
  const btn = el('button', 'btn', text);
  btn.type = 'button';
  // Adresse des Knopfs für die Fokus-Wiederherstellung nach einem Neuaufbau.
  btn.dataset.workspaceAction = aktion;
  btn.addEventListener('click', beiKlick);
  return btn;
}

// 4T-001753: Eine der beiden Verschiebe-Schaltflächen einer Zeile.
//
// **Am Rand abgeblendet statt weggelassen.** Ein fehlender Knopf ließe die
// übrigen nachrücken, und ein Klick nach dem Neuaufbau träfe die falsche
// Richtung. Ein abgeblendeter Knopf hält die Zeilen deckungsgleich und sagt
// zugleich, dass es diese Richtung gibt, nur eben nicht jetzt.
//
// 4T-002227: Der zugängliche Name nennt neben der Richtung den Arbeitsbereich
// (`aria-labelledby` auf den Knopf selbst und den Namen der Zeile). Auf einer
// Seite mit vielen gleichen Pfeilen sagte «Nach oben schieben» allein einem
// Bildschirmleser nicht, WAS geschoben wird; zusammengesetzt wird ohne eigenen
// Text-Baustein, damit keine Sprache eine fremde Satzstellung erbt.
function verschiebeKnopf(w, richtung, aus, nameId) {
  const btn = el('button', 'btn workspace-move', richtung === 'up' ? '▲' : '▼');
  btn.type = 'button';
  btn.id = `${nameId}-${richtung}`;
  btn.dataset.workspaceMove = richtung;
  const label = richtung === 'up' ? t('workspace.manager.moveUp') : t('workspace.manager.moveDown');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-labelledby', `${btn.id} ${nameId}`);
  btn.disabled = aus;
  btn.addEventListener('click', async () => {
    fokusNachAufbau = { id: w.id, direction: richtung };
    await api.workspaceReorder({ id: w.id, direction: richtung });
  });
  return btn;
}

// Wo der Fokus vor dem Neuaufbau stand, als Adresse statt als Element: Das
// Element verschwindet mit dem Neuaufbau. So hält die Seite den Fokus auch dann,
// wenn ein anderes Fenster die Liste ändert (Story AK26).
function merkeFokus(container) {
  const aktiv = document.activeElement;
  if (!aktiv || !container.contains(aktiv)) return null;
  const zeile = aktiv.closest('.workspace-row');
  if (!zeile) return null;
  return {
    id: zeile.dataset.workspaceId,
    direction: aktiv.dataset.workspaceMove || null,
    action: aktiv.dataset.workspaceAction || null,
  };
}

// 4T-001753: Fokus nach dem Neuaufbau auf denselben Knopf zurückholen. Ist ein
// Verschiebe-Knopf am neuen Ort abgeblendet (der Eintrag steht jetzt am Rand),
// übernimmt die Gegenrichtung derselben Zeile — der Anwender bleibt an seinem
// Eintrag und nicht am Anfang der Seite.
function stelleFokusHer(wurzel, ziel) {
  if (!ziel) return;
  const zeile = wurzel.querySelector(`.workspace-row[data-workspace-id="${CSS.escape(ziel.id)}"]`);
  if (!zeile) return;
  if (ziel.action) {
    const knopf = zeile.querySelector(`[data-workspace-action="${ziel.action}"]`);
    if (knopf) knopf.focus();
    return;
  }
  if (!ziel.direction) return;
  const gewuenscht = zeile.querySelector(`[data-workspace-move="${ziel.direction}"]`);
  const ersatz = zeile.querySelector(
    `[data-workspace-move="${ziel.direction === 'up' ? 'down' : 'up'}"]`,
  );
  const knopf = gewuenscht && !gewuenscht.disabled ? gewuenscht : ersatz;
  if (knopf && !knopf.disabled) knopf.focus();
}

// --- Zeilen ------------------------------------------------------------------

function textBlock(w, nameId) {
  const text = el('div', 'workspace-row-text');
  const name = el('div', 'workspace-row-name', w.name);
  name.id = nameId;
  text.appendChild(name);
  // 4T-001737: Bereichs-Zuordnung mit dem VOLLSTÄNDIGEN Pfad; ohne Bindung
  // gibt es die Zeile nicht (kein Platzhalter), geändert wird sie hier nicht.
  if (w.areaPath) {
    text.appendChild(
      el('div', 'workspace-row-path', t('workspace.manager.area').replace('{path}', w.areaPath)),
    );
  }
  const zustand = w.open ? t('workspace.manager.stateOpen') : t('workspace.manager.stateClosed');
  const zuletzt = formatLastOpened(w.lastOpenedAt);
  text.appendChild(
    el(
      'div',
      'workspace-row-meta',
      zuletzt
        ? `${zustand} · ${t('workspace.manager.lastOpened').replace('{date}', zuletzt)}`
        : zustand,
    ),
  );
  return text;
}

function aktionen(w, index, anzahl, nameId) {
  const gruppe = el('div', 'workspace-row-actions');
  gruppe.appendChild(
    textKnopf(t('workspace.manager.open'), 'open', () => {
      void api.workspaceOpen(w.id);
    }),
  );
  gruppe.appendChild(
    textKnopf(t('workspace.manager.rename'), 'rename', async () => {
      const ergebnis = await showWorkspaceDialog({
        title: t('workspace.dialog.renameTitle'),
        name: w.name,
        color: w.color,
      });
      if (!ergebnis) return;
      if (ergebnis.name !== w.name) await api.workspaceRename({ id: w.id, name: ergebnis.name });
      if (ergebnis.color !== w.color) {
        await api.workspaceSetColor({ id: w.id, color: ergebnis.color });
      }
    }),
  );
  gruppe.appendChild(
    textKnopf(t('workspace.manager.delete'), 'delete', async () => {
      // Die Rückfrage stellt der Hauptprozess; ihre Vorbelegung ist der Abbruch.
      const antwort = await api.workspaceConfirmDelete(w.name);
      if (antwort && antwort.confirmed) await api.workspaceDelete(w.id);
    }),
  );
  // 4T-001753: Die Verschiebe-Knöpfe stehen als Paar am Ende, hinter den drei
  // Aktionen — der Bestands-Prüffall WS-06 adressiert «Umbenennen und Farbe»
  // als zweiten Knopf der Zeile.
  gruppe.appendChild(verschiebeKnopf(w, 'up', index === 0, nameId));
  gruppe.appendChild(verschiebeKnopf(w, 'down', index === anzahl - 1, nameId));
  return gruppe;
}

function zeile(w, index, anzahl) {
  const row = el('div', 'workspace-row');
  row.dataset.workspaceId = w.id;
  const nameId = `workspaces-page-name-${index}`;
  const dot = el('span', 'workspace-dot' + (w.open ? ' open' : ''));
  dot.style.setProperty('--workspace-color', `var(--tab-group-${w.color})`);
  dot.title = w.open ? t('workspace.manager.stateOpen') : t('workspace.manager.stateClosed');
  // Farbpunkt und Text-Block bilden einen Kopf, damit der Punkt auch in der
  // schmalen Seite neben dem Namen bleibt; umgebrochen wird allein zwischen
  // Kopf und Schaltflächen-Gruppe.
  const kopf = el('div', 'workspace-row-head');
  kopf.appendChild(dot);
  kopf.appendChild(textBlock(w, nameId));
  row.appendChild(kopf);
  row.appendChild(aktionen(w, index, anzahl, nameId));
  return row;
}

// --- Seiten-Aufbau -----------------------------------------------------------

function zeichne() {
  const container = seite.container;
  if (!container) return;
  // Mehrere System-Seiten einer Spalte teilen sich einen Container; gezeichnet
  // wird nur, solange er dieser Seite gehört (Besitz-Merker aus
  // renderSystemPane). Sonst überschriebe eine Meldung die gerade sichtbare
  // fremde Seite.
  if (container.dataset.systemPage !== WORKSPACES_PAGE_ID) return;
  const ziel = fokusNachAufbau || merkeFokus(container);
  fokusNachAufbau = null;
  container.innerHTML = '';
  const page = el('div', 'workspaces-page');
  container.appendChild(page);
  page.appendChild(el('h3', 'workspaces-page-heading', t('workspace.page.title')));
  page.appendChild(el('p', 'workspaces-page-note', t('workspace.page.note')));

  // M4: Im Aus-Zustand Kopf und Hinweis, keine einzige Schaltfläche.
  if (!isExtensionActive(EXTENSION_ID)) {
    page.appendChild(el('div', 'workspaces-page-off', t('workspace.page.extensionOff')));
    return;
  }
  const liste = seite.liste;
  if (liste === null) return;
  if (liste.length === 0) {
    page.appendChild(el('div', 'workspaces-page-placeholder', t('workspace.manager.empty')));
    return;
  }
  for (const [index, w] of liste.entries()) page.appendChild(zeile(w, index, liste.length));
  stelleFokusHer(page, ziel);
}

// --- Registrierung -----------------------------------------------------------

// **Registriert wird beim Laden des Moduls**, nicht über eine init-Funktion aus
// app-init.js (Vorbild datenbank-uebersicht-seite.js und settings-page.js). Die
// Registrierung legt einen Eintrag in die Karte der System-Seiten, und das
// Modul wird von beiden Zugängen ohnehin geladen (app-commands.js,
// app-menu-bindings.js). Die Verdrahtungs-Stelle app-init.js steht an ihrem
// eingefrorenen Datei-Größen-Budget; eine weitere Zeile dort hätte die Ratsche
// gerissen, ohne dass die Seite sie braucht.
registerSystemPage({
  id: WORKSPACES_PAGE_ID,
  titleKey: 'workspace.page.title',
  onOpen() {
    // Frischer Seiten-Zustand je Neu-Öffnen, auch beim Verschieben des
    // Reiters in ein neues Fenster: Die Liste wird neu geholt.
    seite.liste = null;
    fokusNachAufbau = null;
  },
  mount(container) {
    seite.container = container;
    abonniereAenderungen();
    zeichne();
    if (seite.liste === null && !seite.laden) void ladeUndZeichne();
  },
  onClose() {
    // Das Abo der Änderungs-Meldung endet hier: Ohne Container zeichnet es
    // nichts mehr (der Preload bietet kein Abmelden an).
    seite.container = null;
    seite.liste = null;
    fokusNachAufbau = null;
  },
});
// Jede Ablage-Änderung meldet der Hauptprozess an alle Fenster; nachgeladen
// wird nur, solange die Seite in diesem Fenster offen ist (Story AK26).
// Das Abo entsteht beim ersten Montieren und genau einmal, nicht beim Laden
// des Moduls: Das Modul wird über app-commands.js von jedem Zugang geladen,
// auch von Unit-Prüfungen anderer Seiten, die den Preload nur mit den Kanälen
// ihres Gegenstands nachbilden — beim Laden gab es dort keinen Kanal
// `onWorkspacesChanged`, und der Epic-Abschluss-Test fiel rot (4T-002227,
// 2026-10-17). Ein Abmelden bietet der Preload nicht; der Rückruf prüft
// deshalb den Container.
let aenderungenAbonniert = false;
function abonniereAenderungen() {
  if (aenderungenAbonniert || typeof api.onWorkspacesChanged !== 'function') return;
  aenderungenAbonniert = true;
  api.onWorkspacesChanged(() => {
    if (seite.container) void ladeUndZeichne();
  });
}
// M4: Der Mount-Guard der Registry montiert eine offene Seite beim Umschalten
// nicht von allein neu (Vorbild memory-page.js). Beim Wiedereinschalten wird
// neu geladen statt nur gezeichnet, weil die Liste im Aus-Zustand nicht
// nachgezogen wurde.
document.addEventListener('scg:extensions-changed', () => {
  if (!seite.container) return;
  if (isExtensionActive(EXTENSION_ID)) void ladeUndZeichne();
  else zeichne();
});
