// 4T-002355 (Epic 3E-000184): Das Untermenü «Workflows» im Menü «Datei» und der
// Eintrag «Workflow-Läufe» im Menü «Ansicht».
//
// **Aufbau nach dem freigegebenen Mockup** (Entscheidungs-Paket 3 der
// Konzept-Stufe, 3a und 3c, «Freigegeben. Mach weiter.», Empfehlungen pauschal
// übernommen): oben die Workflows des Workflow-Ordners, alphabetisch nach Name,
// Unterordner als Untermenüs; nach einem Trennstrich «Workflow-Läufe anzeigen»,
// «Neuer Workflow …» und «Workflow-Ordner festlegen …». Ohne festgelegten Ordner
// allein «Kein Workflow-Ordner festgelegt» und «Workflow-Ordner festlegen …»;
// bei leerem Ordner ein Hinweis anstelle der Liste, ebenso bei einem
// festgelegten, aber nicht lesbaren Ordner. Ist die Erweiterung «Workflows»
// abgeschaltet, erscheint das Untermenü nicht.
//
// **Die Liste kommt fertig herein.** Dynamisch registrierte Kommandos kennt der
// Hauptprozess nicht (Sachlage zu 3a); die Liste baut der Dienst des
// Workflow-Ordners, den Zwischenstand je Fenster hält
// `workflows/workflow-menu-lists.js`. Dieses Modul ordnet allein die Einträge.
//
// **Eine Meldung für alle Handgriffe.** Ein Klick schickt `workflow:menuAction`
// an das Fenster, mit der Art der Handlung (`start` samt Pfad, `runs`, `new`,
// `folder`); dort entscheidet `workflows/workflow-menue.js`, weil Start, Namens-
// Abfrage, Einstellungs-Seite und das Kommando der Seite «Workflow-Läufe» im
// Fenster leben.
//
// **Workflows verknüpfter Bereiche** (4T-002426, Epic 3E-000366, Entscheidung
// 2h): Nach den eigenen Workflows folgt je zugestimmter Quelle ein Block, durch
// einen Trennstrich abgesetzt; jeder Eintrag trägt das Kürzel der Quelle in der
// Form `workflow.verknuepft.eintrag` («Name (@kürzel)»), damit ein gleichnamiger
// eigener und fremder Workflow unterscheidbar bleiben. Der Klick startet ihn wie
// einen eigenen über den Pfad seiner Datei; er läuft in der eigenen Wurzel.
//
// Electron-frei (Muster `menu-workspaces.js`), damit der Aufbau ohne Electron
// prüfbar bleibt.
'use strict';

const MENU_ACTION_CHANNEL = 'workflow:menuAction';

// M-12 (4T-000173): Windows liest ein einzelnes '&' als Mnemonic-Markierung.
const maskiere = (text) => String(text).replace(/&/g, '&&');

// Bezeichnung eines Eintrags: der Name, bei einem fremden mit dem Kürzel.
function bezeichnung(t, item) {
  if (!item.sourceKey) return maskiere(item.name);
  const text = t('workflow.verknuepft.eintrag')
    .replace('{name}', item.name)
    .replace('{prefix}', item.sourceKey);
  return maskiere(text);
}

function listenEintraege(items, send, t) {
  return items.map((item) => {
    if (item.kind === 'group') {
      return { label: bezeichnung(t, item), submenu: listenEintraege(item.items || [], send, t) };
    }
    return {
      label: bezeichnung(t, item),
      toolTip: item.absPath,
      click: send(MENU_ACTION_CHANNEL, { kind: 'start', path: item.absPath }),
    };
  });
}

// 4T-002426: je Quelle ein Block hinter einem Trennstrich.
function fremdeEintraege(liste, send, t) {
  const quellen = Array.isArray(liste.linked) ? liste.linked : [];
  const bloecke = [];
  for (const quelle of quellen) {
    const items = Array.isArray(quelle.items) ? quelle.items : [];
    if (items.length === 0) continue;
    const markiert = items.map((item) => markiere(item, quelle.key));
    bloecke.push({ type: 'separator' }, ...listenEintraege(markiert, send, t));
  }
  return bloecke;
}

// Eine Gruppe der Quelle trägt das Kürzel wie ihre Workflows.
function markiere(item, key) {
  if (item.kind === 'group') {
    return {
      ...item,
      sourceKey: key,
      items: (item.items || []).map((kind) => markiere(kind, key)),
    };
  }
  return { ...item, sourceKey: item.sourceKey || key };
}

function sichtbar(liste) {
  return !!(liste && liste.ok && liste.enabled);
}

/**
 * Das Untermenü «Workflows» des Menüs «Datei».
 *
 * @param {{t: (k: string) => string, send: Function, liste: object|null}} p
 *   `liste` in der Form des Kanals `workflow:folderList` oder null, solange
 *   sie für dieses Fenster noch nicht gelesen ist.
 * @returns {object|null} Menü-Eintrag mit Untermenü oder null (ausgeblendet).
 */
function buildWorkflowsSubmenu({ t, send, liste }) {
  if (!sichtbar(liste)) return null;
  const festlegen = {
    label: t('workflow.menu.chooseFolder'),
    click: send(MENU_ACTION_CHANNEL, { kind: 'folder' }),
  };
  const fremde = fremdeEintraege(liste, send, t);
  if (liste.source === 'none' || !liste.folder) {
    // 4T-002426: Workflows einer Quelle hängen nicht am eigenen Ordner.
    const mitte = fremde.length > 0 ? [...fremde, { type: 'separator' }] : [];
    return {
      label: t('workflow.menu.title'),
      submenu: [{ label: t('workflow.menu.noFolder'), enabled: false }, ...mitte, festlegen],
    };
  }
  const items = Array.isArray(liste.items) ? liste.items : [];
  let oben;
  if (liste.missing) oben = [{ label: t('workflow.menu.folderMissing'), enabled: false }];
  else if (items.length === 0) oben = [{ label: t('workflow.menu.empty'), enabled: false }];
  else oben = listenEintraege(items, send, t);
  return {
    label: t('workflow.menu.title'),
    submenu: [
      ...oben,
      ...fremde,
      { type: 'separator' },
      { label: t('workflow.seite.kommando'), click: send(MENU_ACTION_CHANNEL, { kind: 'runs' }) },
      { label: t('workflow.menu.new'), click: send(MENU_ACTION_CHANNEL, { kind: 'new' }) },
      festlegen,
    ],
  };
}

/**
 * Der Eintrag «Workflow-Läufe anzeigen» im Menü «Ansicht» (4T-002350, AK1).
 *
 * Das Kommando der Seite ist dynamisch registriert (`ext.workflows.openRuns`);
 * deshalb läuft der Klick über dieselbe Meldung wie das Untermenü, und der
 * Eintrag folgt demselben Erweiterungs-Schalter.
 *
 * @param {{t: (k: string) => string, send: Function, liste: object|null}} p
 * @returns {object|null}
 */
function buildWorkflowRunsViewItem({ t, send, liste }) {
  if (!sichtbar(liste)) return null;
  return {
    label: t('workflow.seite.kommando'),
    click: send(MENU_ACTION_CHANNEL, { kind: 'runs' }),
  };
}

module.exports = { MENU_ACTION_CHANNEL, buildWorkflowRunsViewItem, buildWorkflowsSubmenu };
