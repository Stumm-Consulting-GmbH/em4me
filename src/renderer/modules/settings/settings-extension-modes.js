// 4T-001882 (Epic 3E-000185, Story 4S-000993): Der Bedien-Ort der eigenen
// Arbeitsmodi — im Abschnitt «Arbeitsmodus» des Einstellungs-Bereichs
// «Erweiterungen», unmittelbar unter den drei festen Modi.
//
// **Fünf Handgriffe nach dem Vorbild der benannten Sidebar-Varianten**
// (src/renderer/modules/settings/sidebar-settings.js, Verwaltungs-Block):
// speichern, anwenden, umbenennen, überschreiben, löschen. Die drei festen Modi
// stehen daneben und tragen keine dieser Schaltflächen — sie sind
// unveränderlich (AK4).
//
// **Zwei Wirkungs-Zeitpunkte, und das ist Absicht.** Das Anwenden setzt den
// Schalter-Satz in den ENTWURF der Einstellungs-Seite, genau wie ein fester
// Modus und wie jeder einzelne Schalter; wirksam wird er mit «Anwenden» oder
// «OK». Die Verwaltung der Liste dagegen wirkt sofort: Ein gespeicherter Modus
// ist Bestand des Anwenders und keine Einstellung, und ein «Abbrechen» der
// Seite, das ihm den eben angelegten Modus wieder wegnähme, wäre eine
// Überraschung. Denselben Schnitt fährt der Nachbar-Bereich der externen
// Erweiterungen.
'use strict';

import {
  disabledIdsForExtensionMode,
  matchingExtensionMode,
} from '../../../shared/extensions/extension-modes.js';
import { t } from '../../i18n.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
import {
  benenneEigenenArbeitsmodusUm,
  eigeneArbeitsmodi,
  eigenerArbeitsmodusMitNamen,
  loescheEigenenArbeitsmodus,
  speichereEigenenArbeitsmodus,
  ueberschreibeEigenenArbeitsmodus,
} from '../extensions/extension-modes.js';

// Der eigene Modus, dem der Entwurfs-Stand entspricht, oder null.
export function aktiverEigenerArbeitsmodus(draft) {
  return matchingExtensionMode(draft.extensionsDisabled, eigeneArbeitsmodi());
}

function knopf(labelKey, klasse, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn settings-extension-own-mode-action ${klasse}`;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', onClick);
  return btn;
}

// Namens-Dialog für das Speichern. Ein bereits vergebener Name führt NICHT zum
// stillen Überschreiben, sondern zu einer Rückfrage (AK5): Derselbe Dialog
// kommt ein zweites Mal, nennt den vorhandenen Modus und lässt die Wahl —
// Bestätigen überschreibt ihn, ein anderer Name legt einen zusätzlichen Modus
// an, Abbrechen tut nichts.
async function zeigeSpeichernDialog(draft, neuZeichnen) {
  const name = await showNameInputDialog({
    title: t('settings.extensions.mode.own.saveDialogTitle'),
    placeholder: t('settings.extensions.mode.own.namePlaceholder'),
    validate: (wert) => (wert === '' ? 'settings.extensions.mode.own.errorEmptyName' : null),
  });
  if (name == null) return;
  const vorhanden = eigenerArbeitsmodusMitNamen(name);
  if (!vorhanden) {
    await speichereEigenenArbeitsmodus(name, draft.extensionsDisabled);
    neuZeichnen();
    return;
  }
  const antwort = await showNameInputDialog({
    title: t('settings.extensions.mode.own.saveDialogTitle'),
    description: t('settings.extensions.mode.own.overwriteQuestion').replace(
      '{name}',
      vorhanden.name,
    ),
    initialValue: vorhanden.name,
    placeholder: t('settings.extensions.mode.own.namePlaceholder'),
    okLabel: t('settings.extensions.mode.own.overwriteConfirm'),
    validate: (wert) => (wert === '' ? 'settings.extensions.mode.own.errorEmptyName' : null),
  });
  if (antwort == null) return;
  const nochVorhanden = eigenerArbeitsmodusMitNamen(antwort);
  if (nochVorhanden) {
    await ueberschreibeEigenenArbeitsmodus(nochVorhanden.id, draft.extensionsDisabled);
  } else {
    await speichereEigenenArbeitsmodus(antwort, draft.extensionsDisabled);
  }
  neuZeichnen();
}

// Umbenennen-Dialog: lehnt den leeren und den im Bestand bereits vergebenen
// Namen ab (das stille Zusammenlegen zweier Modi wäre hier ein wahrscheinliches
// Versehen — Muster showRenameVariantDialog).
async function zeigeUmbenennenDialog(modus, neuZeichnen) {
  const name = await showNameInputDialog({
    title: t('settings.extensions.mode.own.renameDialogTitle'),
    initialValue: modus.name,
    placeholder: t('settings.extensions.mode.own.namePlaceholder'),
    validate: (wert) => {
      if (wert === '') return 'settings.extensions.mode.own.errorEmptyName';
      const anderer = eigenerArbeitsmodusMitNamen(wert);
      return anderer && anderer.id !== modus.id
        ? 'settings.extensions.mode.own.errorDuplicateName'
        : null;
    },
  });
  if (name == null) return;
  await benenneEigenenArbeitsmodusUm(modus.id, name);
  neuZeichnen();
}

function baueZeile(modus, draft, neuZeichnen, aktiv) {
  const zeile = document.createElement('div');
  zeile.className = 'settings-extension-own-mode-row';
  zeile.dataset.modeId = modus.id;
  if (aktiv) zeile.dataset.active = '1';

  // Der Name IST die Anwenden-Schaltfläche, wie bei den drei festen Modi der
  // Modus-Name die seine ist; die Verwaltungs-Schaltflächen stehen daneben.
  const anwenden = document.createElement('button');
  anwenden.type = 'button';
  anwenden.className = 'btn settings-extension-own-mode';
  anwenden.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
  anwenden.classList.toggle('is-active', aktiv);
  anwenden.textContent = modus.name;
  anwenden.title = t('settings.extensions.mode.own.apply');
  anwenden.addEventListener('click', () => {
    draft.extensionsDisabled = disabledIdsForExtensionMode(modus);
    neuZeichnen();
  });
  zeile.appendChild(anwenden);

  const aktionen = document.createElement('span');
  aktionen.className = 'settings-extension-own-mode-actions';
  aktionen.appendChild(
    knopf('settings.extensions.mode.own.rename', 'settings-extension-own-mode-rename', () => {
      void zeigeUmbenennenDialog(modus, neuZeichnen);
    }),
  );
  aktionen.appendChild(
    knopf('settings.extensions.mode.own.overwrite', 'settings-extension-own-mode-overwrite', () => {
      void ueberschreibeEigenenArbeitsmodus(modus.id, draft.extensionsDisabled).then(neuZeichnen);
    }),
  );
  aktionen.appendChild(
    knopf('settings.extensions.mode.own.delete', 'settings-extension-own-mode-delete', () => {
      void loescheEigenenArbeitsmodus(modus.id).then(neuZeichnen);
    }),
  );
  zeile.appendChild(aktionen);
  return zeile;
}

/**
 * Den Block der eigenen Modi in den Abschnitt «Arbeitsmodus» zeichnen.
 *
 * @param {HTMLElement} ziel Container des Abschnitts.
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @param {() => void} neuZeichnen Neu-Zeichnen des ganzen Bereichs.
 */
export function renderEigeneArbeitsmodi(ziel, draft, neuZeichnen) {
  const block = document.createElement('div');
  block.className = 'settings-extensions-own-modes';
  block.id = 'settings-extensions-own-modes';

  const titel = document.createElement('h4');
  titel.className = 'settings-extensions-mode-title';
  titel.textContent = t('settings.extensions.mode.own.title');
  block.appendChild(titel);

  const hinweis = document.createElement('p');
  hinweis.className = 'settings-extensions-mode-intro';
  hinweis.textContent = t('settings.extensions.mode.own.hint');
  block.appendChild(hinweis);

  const liste = document.createElement('div');
  liste.className = 'settings-extension-own-mode-list';
  const modi = eigeneArbeitsmodi();
  const aktiv = matchingExtensionMode(draft.extensionsDisabled, modi);
  if (modi.length === 0) {
    const leer = document.createElement('div');
    leer.className = 'settings-extensions-own-modes-empty';
    leer.textContent = t('settings.extensions.mode.own.empty');
    liste.appendChild(leer);
  } else {
    for (const modus of modi) {
      liste.appendChild(baueZeile(modus, draft, neuZeichnen, !!aktiv && aktiv.id === modus.id));
    }
  }
  block.appendChild(liste);

  const speichern = document.createElement('button');
  speichern.type = 'button';
  speichern.id = 'btn-settings-extension-mode-save';
  speichern.className = 'btn settings-extension-own-mode-save';
  speichern.textContent = t('settings.extensions.mode.own.save');
  speichern.addEventListener('click', () => {
    void zeigeSpeichernDialog(draft, neuZeichnen);
  });
  block.appendChild(speichern);

  ziel.appendChild(block);
}
