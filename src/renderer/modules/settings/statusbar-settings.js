// 4T-001580 (Epic 3E-000283): Einstellungs-Bereich „Statusleiste".
//
// Der Bereich entsteht mit diesem Task und nicht erst mit `4T-001581`: Seine
// Existenz und seine Navigations-Gruppe sind mit E4 des Epics und der Story
// `4S-000902` entschieden; offen ist allein, welche BESTEHENDEN Einstellungen
// später in ihn umziehen. Ohne ihn hätte die Einstellung dieses Tasks
// zwischenzeitlich an einem Ort gestanden, den das Epic ausdrücklich verworfen
// hat („Kommando-Platzierung").
//
// 4T-001765 (Epic 3E-000186): Der Abschnitt trägt seit dem 2026-09-15 eine
// zweite Auswahl — wie die Leiste Schalter zeigt, die im aktuellen Zustand
// nicht aktivierbar sind («blass anzeigen» als Vorgabe oder «ausblenden», E3
// jenes Epics). Sie folgt dem Weg der ersten Zeile für Zeile; der gemeinsame
// Aufbau steht in `baueAuswahl`, ihr Laufzeit-Zustand in
// `../statusbar-availability.js`.
//
// **Kern-Abschnitt, keine Erweiterungs-Bindung** (E7 beider Epics): Das
// Zusammenklappen ist die Antwort der Leiste auf ihre eigene Breite, die
// Darstellung nicht aktivierbarer Schalter eine Wahl zwischen zwei Ansichten
// desselben Sachverhalts — keines von beiden ist ein abgrenzbares
// Funktions-Paket.
//
// **Position.** Der Bereich wird beim Import registriert und erscheint in der
// Gruppe „Allgemein" in Registrierungs-Reihenfolge; die Reihenfolge entsteht
// damit aus der Import-Reihenfolge in `app-init.js`. Dort steht dieses Modul
// zwischen „Sidebar" und „Panel-Reihenfolge". Das ist seit der Entscheidung des
// Product Owners vom 2026-09-14 (F2 der Vorlage von `4T-001581`, E4a des Epics)
// der ENDGÜLTIGE Platz und kein Vorläufiger mehr: „Sidebar", „Statusleiste" und
// „Panel-Reihenfolge" liegen damit untereinander.
//
// 4T-001581 (Epic 3E-000283, E4a): Der Bereich trägt seit dem 2026-09-14 drei
// Blöcke — die Falt-Einstellung dieses Tasks und die beiden aus dem Bereich
// „Kommando-Platzierung" umgezogenen Blöcke „Statusbar-Buttons" und
// „Standard-Buttons ausblenden". Wirkung, Beschriftung und Speicherung der
// beiden umgezogenen Blöcke sind unverändert: Sie arbeiten weiter auf dem
// Entwurfs-Feld `draft.commandPlacement`, ihre Editoren kommen aus
// `command-placement-editors.js`, und persistiert werden sie weiter vom
// apply-Hook des Bereichs `commandPlacement` — dieser Bereich bringt dafür
// bewusst keinen zweiten Hook mit (zwei Hooks auf einem Feld schrieben doppelt;
// Muster historyArea/templatesArea in `settings-page.js`).
//
// **Erweiterungs-Kopplung je Block statt je Bereich.** Bis zum Umzug blendete
// der Ab-Schalter der Erweiterung `command-placement` den ganzen Bereich
// „Kommando-Platzierung" über `settingsSections` aus. Das gilt für den
// Rest-Bereich unverändert weiter; die beiden umgezogenen Blöcke erscheinen
// hier nur bei aktiver Erweiterung, während der Bereich selbst mit seiner
// Falt-Einstellung immer sichtbar bleibt (E7: das Zusammenklappen ist keine
// Erweiterung). Geprüft wird gegen den LAUFZEIT-Zustand (`isExtensionActive`)
// und nicht gegen `draft.extensionsDisabled`, weil `settingsSections()` den
// Rest-Bereich nach derselben Quelle filtert — eine im Entwurf umgeschaltete
// Erweiterung wirkt in beiden Fällen erst mit dem Anwenden.
//
// Aufbau nach dem Muster von `mindmap-settings.js` (kleiner dynamischer
// Bereich mit Auswahl-Feld, `buildSettingsRow`, Entwurf-/Anwenden-Logik); die
// Broadcast-Nachführung des offenen Entwurfs folgt `panel-order-settings.js`.
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { registerSettingsSection } from './settings-page.js';
import { buildSettingsRow, pageState } from './settings-shared.js';
import {
  buildEntryListEditor,
  buildHideListEditor,
  ensureCommandPlacementDraft,
  hint as platzierungsHinweis,
  registriereCommandPlacementWurzel,
  subtitle as platzierungsUeberschrift,
} from './command-placement-editors.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  STATUSBAR_COLLAPSE_MODES,
  getStatusbarCollapseMode,
  normalisiereFaltModus,
  setStatusbarCollapseMode,
} from '../statusbar-overflow.js';
// 4T-001765 (Epic 3E-000186): die zweite Auswahl des Abschnitts — wie die
// Leiste Schalter zeigt, die im aktuellen Zustand nicht aktivierbar sind.
import {
  STATUSBAR_UNAVAILABLE_MODES,
  getStatusbarUnavailableMode,
  normalisiereUnverfuegbarModus,
  setStatusbarUnavailableMode,
} from '../statusbar-availability.js';

// Entwurf lazy anlegen (Muster ensureDraft in panel-order-settings.js).
function entwurf(draft) {
  if (typeof draft.statusbarCollapseMode !== 'string') {
    draft.statusbarCollapseMode = getStatusbarCollapseMode();
  }
  if (typeof draft.statusbarUnavailableMode !== 'string') {
    draft.statusbarUnavailableMode = getStatusbarUnavailableMode();
  }
  return draft.statusbarCollapseMode;
}

// Ein Auswahl-Feld des Abschnitts: Zeile mit Beschriftung, Werte-Liste aus der
// Konstanten-Liste des zuständigen Moduls und Kurz-Erläuterung darunter. Die
// zweite Auswahl (4T-001765) folgt derselben Form wie die erste, deshalb steht
// sie hier einmal statt zweimal.
//
// Zwei Klassen am Hinweis mit Absicht: `settings-hint` ist die Ernte-Klasse
// der Einstellungs-Suche (settings-search-harvest.js), `settings-row-hint`
// trägt die Darstellung des erklärenden Hinweises unter einer Zeile. Eine
// eigene Klasse für denselben Zweck wäre die dritte. Die Kennung des Hinweises
// gehört dazu, weil der Abschnitt seit 4T-001765 zwei davon trägt und ein
// Prüffall sonst nicht sagen könnte, welchen er meint.
function baueAuswahl(container, draft, { feldId, basisKey, werte, normalisiere, entwurfsFeld }) {
  const auswahl = document.createElement('select');
  auswahl.id = feldId;
  auswahl.className = 'settings-input';
  for (const wert of werte) {
    const option = document.createElement('option');
    option.value = wert;
    option.textContent = t(`${basisKey}.${wert}`);
    auswahl.appendChild(option);
  }
  auswahl.value = draft[entwurfsFeld];
  auswahl.addEventListener('change', () => {
    draft[entwurfsFeld] = normalisiere(auswahl.value);
    refreshSettingsButtons();
  });
  container.appendChild(buildSettingsRow(basisKey, auswahl));

  const hinweis = document.createElement('p');
  hinweis.id = `${feldId}-hint`;
  hinweis.className = 'settings-hint settings-row-hint';
  hinweis.textContent = t(`${basisKey}.hint`);
  container.appendChild(hinweis);
}

// Eine Modus-Änderung aus einem anderen Fenster (Broadcast) zieht den offenen
// Entwurf auf den neuen Ist-Stand nach; eine noch nicht angewendete Wahl wird
// dabei bewusst verworfen (Muster panel-order-settings.js).
//
// Bezug ist der Seiten-Entwurf selbst und nicht eine festgehaltene Referenz
// des letzten Render-Durchgangs: Die Einstellungs-Suche rendert jeden Bereich
// einmal in einen abgekoppelten Container mit einem Wegwerf-Entwurf
// (settings-search-harvest.js), und ein Merker hätte danach auf diesen gezeigt.
function zieheEntwurfNach(entwurfsFeld, feldId, istStand) {
  const draft = pageState.draft;
  if (!draft || typeof draft[entwurfsFeld] !== 'string') return;
  draft[entwurfsFeld] = istStand();
  const feld = document.getElementById(feldId);
  if (feld) feld.value = draft[entwurfsFeld];
  refreshSettingsButtons();
}

document.addEventListener('scg:statusbar-collapse-mode-changed', () => {
  zieheEntwurfNach(
    'statusbarCollapseMode',
    'settings-statusbar-collapse-mode',
    getStatusbarCollapseMode,
  );
});

// 4T-001765 (Epic 3E-000186): dasselbe für die zweite Auswahl.
document.addEventListener('scg:statusbar-unavailable-mode-changed', () => {
  zieheEntwurfNach(
    'statusbarUnavailableMode',
    'settings-statusbar-unavailable-mode',
    getStatusbarUnavailableMode,
  );
});

function renderStatusbarSection(container, draft) {
  entwurf(draft);

  baueAuswahl(container, draft, {
    feldId: 'settings-statusbar-collapse-mode',
    basisKey: 'settings.statusbar.collapseMode',
    werte: STATUSBAR_COLLAPSE_MODES,
    normalisiere: normalisiereFaltModus,
    entwurfsFeld: 'statusbarCollapseMode',
  });
  // 4T-001765 (Epic 3E-000186): die zweite Auswahl, neben dem
  // Zusammenklappen. Sie steht hinter ihm, weil das Zusammenklappen die
  // Antwort der Leiste auf ihre eigene BREITE ist und diese Wahl die auf den
  // Zustand des Dokuments — vom Allgemeinen zum Besonderen.
  baueAuswahl(container, draft, {
    feldId: 'settings-statusbar-unavailable-mode',
    basisKey: 'settings.statusbar.unavailableMode',
    werte: STATUSBAR_UNAVAILABLE_MODES,
    normalisiere: normalisiereUnverfuegbarModus,
    entwurfsFeld: 'statusbarUnavailableMode',
  });

  // 4T-001581: die beiden umgezogenen Blöcke der Kommando-Platzierung.
  if (isExtensionActive('command-placement')) baueKommandoBloecke(container, draft);
}

// 4T-001581: Aufbau der beiden umgezogenen Blöcke in eine eigene Wurzel. Die
// Wurzel trägt dieselbe Klasse wie im Herkunfts-Bereich, damit die Darstellung
// mit umzieht statt neu geschrieben zu werden; das Neu-Aufbauen (nach einer
// Listen-Änderung oder einem Broadcast) rührt nur diese Wurzel an und lässt die
// Falt-Zeile darüber unberührt.
function baueKommandoBloecke(container, draft) {
  ensureCommandPlacementDraft(draft);
  const wurzel = document.createElement('div');
  wurzel.className = 'command-placement-settings';
  container.appendChild(wurzel);
  const neuAufbauen = () => {
    wurzel.innerHTML = '';
    // Eigene Kommando-Schaltflächen der Leiste (4T-000520).
    wurzel.appendChild(platzierungsUeberschrift('settings.commandPlacement.statusbarTitle'));
    wurzel.appendChild(platzierungsHinweis('settings.commandPlacement.statusbarHint'));
    buildEntryListEditor(wurzel, draft, neuAufbauen, {
      listKey: 'statusbar',
      addTitleKey: 'commandPlacement.dialog.addStatusbarTitle',
      editTitleKey: 'commandPlacement.dialog.editStatusbarTitle',
      testId: 'statusbar',
    });
    // Ausblend-Liste der Standard-Schaltflächen (4T-000520).
    wurzel.appendChild(platzierungsUeberschrift('settings.commandPlacement.hideTitle'));
    wurzel.appendChild(platzierungsHinweis('settings.commandPlacement.hideHint'));
    buildHideListEditor(wurzel, draft, neuAufbauen);
  };
  registriereCommandPlacementWurzel(wurzel, neuAufbauen);
  neuAufbauen();
}

// Persistiert den Entwurf; setStatusbarCollapseMode normalisiert, faltet die
// Leiste neu und broadcastet über den Einstellungs-Weg an alle Fenster.
// Danach den Entwurf auf den wirksamen Stand ziehen (Muster
// applyPanelOrderSection).
async function applyStatusbarSection(draft) {
  if (typeof draft.statusbarCollapseMode === 'string') {
    await setStatusbarCollapseMode(draft.statusbarCollapseMode);
    draft.statusbarCollapseMode = getStatusbarCollapseMode();
  }
  // 4T-001765: zweite Auswahl desselben Abschnitts, derselbe Weg.
  if (typeof draft.statusbarUnavailableMode === 'string') {
    await setStatusbarUnavailableMode(draft.statusbarUnavailableMode);
    draft.statusbarUnavailableMode = getStatusbarUnavailableMode();
  }
}

// Spiegelt applyStatusbarSection: normalisierter Entwurf gegen den wirksamen
// Stand, je Auswahl.
function dirtyStatusbarSection(draft) {
  if (
    typeof draft.statusbarCollapseMode === 'string' &&
    normalisiereFaltModus(draft.statusbarCollapseMode) !== getStatusbarCollapseMode()
  ) {
    return true;
  }
  return (
    typeof draft.statusbarUnavailableMode === 'string' &&
    normalisiereUnverfuegbarModus(draft.statusbarUnavailableMode) !== getStatusbarUnavailableMode()
  );
}

registerSettingsSection({
  id: 'statusbar',
  titleKey: 'settings.statusbar.title',
  render: renderStatusbarSection,
  apply: applyStatusbarSection,
  dirty: dirtyStatusbarSection,
});
