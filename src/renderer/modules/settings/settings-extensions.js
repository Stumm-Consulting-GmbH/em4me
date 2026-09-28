// 4T-000295 (Epic 3E-000052) und 4T-000300 (Epic 3E-000053): die beiden
// Verwaltungs-Bereiche der Erweiterungen — Schalter der internen
// Erweiterungen und Vertrauens-Verwaltung der externen.
'use strict';

import {
  blockingDependentIds,
  disabledIdsForModeLevel,
  effectiveDisabledSet,
  modeLevelForDisabledIds,
} from '../../../shared/extensions/extensions-core.js';
import {
  EXTENSION_CATEGORIES,
  EXTENSION_MODE_LEVELS,
  allExtensions,
  extensionById,
} from '../../../shared/extensions/extensions.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  disableExternalExtension,
  enableExternalExtension,
  externalExtensionEntries,
  removeExternalExtension,
  rescanExternalExtensions,
} from '../extensions/extension-host.js';
import {
  applyExtensionsState,
  getDisabledExtensionIds,
} from '../extensions/extension-lifecycle.js';
// 4T-001882 (Epic 3E-000185): die eigenen Arbeitsmodi neben den drei festen.
import { frischeEigeneArbeitsmodi } from '../extensions/extension-modes.js';
import { showStatusbarHint } from '../views/views.js';
import { aktiverEigenerArbeitsmodus, renderEigeneArbeitsmodi } from './settings-extension-modes.js';
import { jsonEqual } from './settings-shared.js';

// Spiegelt applyExtensionsSection (sortierte id-Listen gegen den
// wirksamen Stand).
export function dirtyExtensionsSection(draft) {
  if (!Array.isArray(draft.extensionsDisabled)) return false;
  return !jsonEqual([...draft.extensionsDisabled].sort(), [...getDisabledExtensionIds()].sort());
}

// --- Bereich Erweiterungen (4T-000295, Epic 3E-000052) --------------------------------
// Liste der internen Erweiterungen, gruppiert nach Kategorie (Render,
// Vernetzung, Werkzeuge), je Zeile Schalter, Name und Kurzbeschreibung.
// Abhaengig mit-deaktivierte Erweiterungen zeigen einen Hinweis und einen
// gesperrten Schalter (ihr eigener Schalt-Zustand bleibt erhalten und
// kehrt mit der Abhaengigkeit zurueck). Wirkung erst bei Anwenden/OK.
//
// 4T-001877 (Epic 3E-000187): dazu der Abhaengigkeits-Schutz in der
// Gegenrichtung — solange eine Abhaengige wirksam ist, ist der Schalter ihrer
// Grundlage gesperrt. Die Zeile sagt das ohne Versuch (eigene Hinweis-Zeile
// mit den Namen der Abhaengigen), und der Versuch blendet denselben Sachverhalt
// als Statusleisten-Hinweis ein. Die Regel selbst liegt als reine Funktion im
// geteilten Kern (blockingDependentIds), damit der spaetere Profil-Wechsel der
// Arbeitsmodi dieselbe faehrt.
//
// 4T-001881 (Epic 3E-000185): darueber die Wahl der drei festen Arbeitsmodi —
// Einsteiger, Fortgeschritten, Voll. Sie setzt den Schalter-Satz ihres Modus
// gebuendelt in denselben Entwurf und zeigt an, welcher Modus dem Stand
// entspricht; entspricht er keinem, steht dort «Angepasst». Die Mengen kommen
// aus der Modus-Stufe der Registry (disabledIdsForModeLevel), eine eigene
// Liste je Modus gibt es nicht.
//
// 4T-001882 (Epic 3E-000185): darunter die EIGENEN Modi — beliebig viele
// benannte Schalter-Staende mit ihren fuenf Handgriffen. Sie liegen in einem
// eigenen Modul (settings-extension-modes.js); hier steht allein ihr Aufruf
// und die Anzeige-Zeile, die seither auch einen eigenen Modus erkennt.

// Anzeige-Namen einer Kennungs-Liste in der Sprache der Oberflaeche; eine
// nicht aufloesbare Kennung erscheint als Kennung (Muster der bestehenden
// Hinweis-Zeile). Mehrere Namen stehen in einer Aufzaehlung und damit
// gemeinsam in einem Satz.
function extensionNames(ids) {
  return ids
    .map((id) => {
      const manifest = extensionById(id);
      return manifest ? t(manifest.nameKey) : id;
    })
    .join(', ');
}

// 4T-001881 (Epic 3E-000185): Die drei festen Arbeitsmodi über der
// Schalter-Liste.
//
// Ein Klick setzt den Schalter-Satz seines Modus in den ENTWURF — wie jeder
// einzelne Schalter dieses Bereichs, und wie dort tritt die Wirkung erst bei
// «Anwenden» oder «OK» ein. Der Modus ist damit ein Ausgangspunkt und kein
// Zustand: Danach bleibt jeder Schalter einzeln nachjustierbar.
//
// Der angezeigte Modus wird aus dem Entwurf abgeleitet und nirgends gehalten
// (modeLevelForDisabledIds). Deshalb folgt die Anzeige einer Änderung am
// Einzel-Schalter sofort in BEIDE Richtungen: weg vom Modus auf «Angepasst»
// und wieder zurück, sobald der Stand wieder genau dem Satz eines Modus
// entspricht.
//
// Der Abhängigkeits-Schutz braucht hier keinen eigenen Zweig: Die Sätze der
// drei Modi verletzen keine deklarierte Abhängigkeit — in keinem ist eine
// Abhängige an, deren Grundlage aus wäre —, und ein Wächter hält das fest
// (test/unit/extensions.test.js). Ein Modus erzeugt damit keinen Stand, den
// das Abschalten eines einzelnen Schalters verböte.
function renderModusWahl(modesEl, listEl, draft) {
  modesEl.innerHTML = '';
  const titel = document.createElement('h4');
  // Eigene Klasse statt der Gruppen-Überschrift der Kategorien: Sie sieht
  // gleich aus, ist aber keine Kategorie — und der Wächter, der die drei
  // Kategorien zählt, soll weiter drei zählen.
  titel.className = 'settings-extensions-mode-title';
  titel.textContent = t('settings.extensions.mode.title');
  modesEl.appendChild(titel);

  const intro = document.createElement('p');
  intro.className = 'settings-extensions-mode-intro';
  intro.textContent = t('settings.extensions.mode.intro');
  modesEl.appendChild(intro);

  const aktiv = modeLevelForDisabledIds(draft.extensionsDisabled);
  const leiste = document.createElement('div');
  leiste.className = 'settings-extensions-mode-buttons';
  for (const level of EXTENSION_MODE_LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn settings-extension-mode';
    btn.id = `settings-extension-mode-${level}`;
    btn.dataset.modeLevel = level;
    const gewaehlt = level === aktiv;
    btn.setAttribute('aria-pressed', gewaehlt ? 'true' : 'false');
    btn.classList.toggle('is-active', gewaehlt);
    const name = document.createElement('span');
    name.className = 'settings-extension-mode-name';
    name.textContent = t(`settings.extensions.mode.name.${level}`);
    const desc = document.createElement('span');
    desc.className = 'settings-extension-mode-desc';
    desc.textContent = t(`settings.extensions.mode.desc.${level}`);
    btn.append(name, desc);
    btn.addEventListener('click', () => {
      draft.extensionsDisabled = disabledIdsForModeLevel(level);
      zeichneExtensionsBereich(modesEl, listEl, draft);
    });
    leiste.appendChild(btn);
  }
  modesEl.appendChild(leiste);

  // 4T-001882: Die Anzeige erkennt auch einen eigenen Modus. Ein fester Modus
  // geht vor, falls ein eigener denselben Satz traegt — er ist der Name, den
  // die Anwendung selbst vergibt, und er steht als Schaltflaeche darueber.
  const eigener = aktiv ? null : aktiverEigenerArbeitsmodus(draft);
  const stand = document.createElement('div');
  stand.className = 'settings-extensions-mode-state';
  stand.id = 'settings-extensions-mode-state';
  if (aktiv) {
    stand.textContent = t('settings.extensions.mode.active').replace(
      '{name}',
      t(`settings.extensions.mode.name.${aktiv}`),
    );
  } else if (eigener) {
    stand.textContent = t('settings.extensions.mode.active').replace('{name}', eigener.name);
  } else {
    stand.textContent = t('settings.extensions.mode.custom');
  }
  modesEl.appendChild(stand);

  // 4T-001882: die eigenen Modi darunter, im selben Abschnitt.
  renderEigeneArbeitsmodi(modesEl, draft, () => zeichneExtensionsBereich(modesEl, listEl, draft));
}

// Beide Teile des Bereichs gemeinsam neu zeichnen. Sie hängen aneinander: Ein
// Einzel-Schalter ändert die Modus-Anzeige, ein Modus die ganze Schalter-Liste.
function zeichneExtensionsBereich(modesEl, listEl, draft) {
  renderModusWahl(modesEl, listEl, draft);
  renderExtensionsEditor(listEl, modesEl, draft);
}

function renderExtensionsEditor(listEl, modesEl, draft) {
  listEl.innerHTML = '';
  const effective = effectiveDisabledSet(draft.extensionsDisabled);
  for (const category of EXTENSION_CATEGORIES) {
    const extensions = allExtensions().filter((m) => m.category === category);
    if (extensions.length === 0) continue;
    const heading = document.createElement('h4');
    heading.className = 'settings-extensions-group-title';
    heading.textContent = t(`settings.extensions.category.${category}`);
    listEl.appendChild(heading);
    for (const manifest of extensions) {
      const row = document.createElement('div');
      row.className = 'settings-extension-row';
      row.dataset.extensionId = manifest.id;

      const directlyDisabled = draft.extensionsDisabled.includes(manifest.id);
      const byDependency = effective.has(manifest.id) && !directlyDisabled;
      // 4T-001877: Gemessen wird gegen den ENTWURF, nicht gegen den
      // wirksamen Stand — wer die Abhaengige in derselben Sitzung abwaehlt,
      // bekommt die Grundlage sofort frei, ohne vorher anzuwenden.
      const blockers = blockingDependentIds(manifest.id, draft.extensionsDisabled);
      const locked = blockers.length > 0;
      if (locked) row.dataset.locked = '1';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'settings-extension-toggle';
      toggle.id = `settings-extension-${manifest.id}`;
      toggle.checked = !effective.has(manifest.id);
      toggle.disabled = byDependency || locked;
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          draft.extensionsDisabled = draft.extensionsDisabled.filter((id) => id !== manifest.id);
        } else if (!draft.extensionsDisabled.includes(manifest.id)) {
          draft.extensionsDisabled.push(manifest.id);
        }
        // Abhaengigkeits-Hinweise der uebrigen Zeilen und die Modus-Anzeige
        // darueber nachziehen (4T-001881).
        zeichneExtensionsBereich(modesEl, listEl, draft);
      });

      const text = document.createElement('div');
      text.className = 'settings-extension-text';
      const name = document.createElement('label');
      name.className = 'settings-extension-name';
      name.htmlFor = toggle.id;
      name.textContent = t(manifest.nameKey);
      text.appendChild(name);
      const desc = document.createElement('div');
      desc.className = 'settings-extension-desc';
      desc.textContent = t(manifest.descKey);
      text.appendChild(desc);
      if (byDependency) {
        const hint = document.createElement('div');
        hint.className = 'settings-extension-dependency-hint';
        const names = extensionNames(
          (manifest.dependencies || []).filter((dep) => effective.has(dep)),
        );
        hint.textContent = t('settings.extensions.dependencyHint').replace('{name}', names);
        text.appendChild(hint);
      }
      if (locked) {
        const hint = document.createElement('div');
        hint.className = 'settings-extension-dependency-hint settings-extension-required-hint';
        hint.textContent = t('settings.extensions.requiredHint').replace(
          '{names}',
          extensionNames(blockers),
        );
        text.appendChild(hint);
      }

      row.append(toggle, text);
      // 4T-001877: Der Versuch am gesperrten Schalter. Ein deaktiviertes
      // Formular-Element bekommt im Chromium kein Klick-Ereignis und gibt
      // auch keines nach oben weiter; das Stilblatt nimmt ihm deshalb die
      // Zeiger-Ereignisse, damit der Klick die Zeile erreicht. Der Hinweis
      // verschwindet von selbst und ruehrt den Schalter nicht an — ein
      // wiederholter Versuch blendet schlicht erneut ein.
      if (locked) {
        row.addEventListener('click', () => {
          showStatusbarHint(null, {
            duration: 3000,
            text: t('settings.extensions.requiredNotice')
              .replace('{name}', t(manifest.nameKey))
              .replace('{names}', extensionNames(blockers)),
          });
        });
      }
      listEl.appendChild(row);
    }
  }
}

export function renderExtensionsSection(container, draft) {
  const intro = document.createElement('p');
  intro.className = 'settings-extensions-intro';
  intro.textContent = t('settings.extensions.intro');
  container.appendChild(intro);
  // 4T-001881: Die Modus-Wahl steht ueber der Schalter-Liste — sie setzt den
  // ganzen Satz, die Liste justiert ihn nach.
  const modes = document.createElement('div');
  modes.id = 'settings-extensions-modes';
  modes.className = 'settings-extensions-modes';
  container.appendChild(modes);
  const list = document.createElement('div');
  list.id = 'settings-extensions-list';
  list.className = 'settings-extensions-list';
  container.appendChild(list);
  zeichneExtensionsBereich(modes, list, draft);
  // 4T-001882: Die Liste der eigenen Modi kommt bei jedem Oeffnen frisch aus
  // dem Speicher — so sieht dieses Fenster, was ein anderes angelegt hat, ohne
  // dass es dafuer einen zweiten Verteil-Weg braeuchte. Neu gezeichnet wird
  // nur bei einer echten Aenderung und nur, solange der Bereich noch haengt.
  void frischeEigeneArbeitsmodi().then((geaendert) => {
    if (geaendert && modes.isConnected) zeichneExtensionsBereich(modes, list, draft);
  });
}

export async function applyExtensionsSection(draft) {
  const next = [...draft.extensionsDisabled].sort();
  const current = [...getDisabledExtensionIds()].sort();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  // Wendet lokal an (Pipeline, UI-Hooks, Event) und persistiert; der
  // settings:set-Broadcast erreicht zusaetzlich alle Fenster inkl. diesem
  // (idempotent). Der Umschalt-Pfad in app-init rendert die Panes neu und
  // re-montiert damit auch diese Seite (Bereichsnavigation zieht nach).
  await applyExtensionsState(draft.extensionsDisabled);
}

// --- Bereich Erweiterungen (extern) (4T-000300, Epic 3E-000053) -----------------------
// Verwaltungs-Oberfläche des Vertrauensmodells. Die Liste kommt aus dem
// Host (Scan-Einträge plus Status); Aktionen laufen asynchron über den
// Host (Warn-Dialog und Entfernen-Bestätigung zeigt der Main lokalisiert).
// Zustands-Änderungen feuern scg:extensions-changed — der Modul-Listener
// unten re-rendert dann den aktiven Bereich; das manuelle Re-Render nach
// jeder Aktion deckt die No-op-Fälle ab (abgebrochener Dialog, Scan ohne
// Änderung).

const EXTERNAL_STATUS_KEYS = {
  active: 'settings.extensionsExternal.status.active',
  inactive: 'settings.extensionsExternal.status.inactive',
  confirm: 'settings.extensionsExternal.status.confirm',
  error: 'settings.extensionsExternal.status.error',
  invalid: 'settings.extensionsExternal.status.invalid',
  incompatible: 'settings.extensionsExternal.status.incompatible',
};

function buildExternalActionButton(labelKey, idSuffix, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn settings-extension-external-action';
  btn.id = `btn-ext-external-${idSuffix}`;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', async () => {
    // Doppel-Klick-Schutz während der asynchronen Aktion (Dialog, IPC).
    btn.disabled = true;
    try {
      await onClick();
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function renderExternalExtensionsList(listEl) {
  if (!listEl.isConnected && listEl.childNodes.length > 0) return;
  listEl.innerHTML = '';
  const rerender = () => {
    if (listEl.isConnected) renderExternalExtensionsList(listEl);
  };
  const entries = externalExtensionEntries();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-extensions-external-empty';
    empty.textContent = t('settings.extensionsExternal.empty');
    listEl.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'settings-extension-external-row';
    row.dataset.extensionId = entry.ok ? entry.manifest.id : entry.dirName;
    row.dataset.status = entry.status;

    const head = document.createElement('div');
    head.className = 'settings-extension-external-head';
    const name = document.createElement('span');
    name.className = 'settings-extension-name';
    name.textContent = entry.ok ? entry.manifest.name : entry.dirName;
    head.appendChild(name);
    if (entry.ok) {
      const version = document.createElement('span');
      version.className = 'settings-extension-external-version';
      version.textContent = entry.manifest.version;
      head.appendChild(version);
    }
    const status = document.createElement('span');
    status.className = 'settings-extension-external-status';
    status.dataset.status = entry.status;
    status.textContent =
      entry.status === 'incompatible'
        ? t(EXTERNAL_STATUS_KEYS.incompatible).replace('{version}', entry.manifest.apiVersion)
        : t(EXTERNAL_STATUS_KEYS[entry.status] || entry.status);
    head.appendChild(status);
    row.appendChild(head);

    if (entry.ok && entry.manifest.description) {
      const desc = document.createElement('div');
      desc.className = 'settings-extension-desc';
      desc.textContent = entry.manifest.description;
      row.appendChild(desc);
    }
    const dir = document.createElement('div');
    dir.className = 'settings-extension-external-path';
    dir.textContent = entry.dir;
    row.appendChild(dir);
    if (entry.lastError) {
      const error = document.createElement('div');
      error.className = 'settings-extension-external-error';
      error.textContent = entry.lastError;
      row.appendChild(error);
    }

    const actions = document.createElement('div');
    actions.className = 'settings-extension-external-actions';
    if (entry.ok) {
      const id = entry.manifest.id;
      if (entry.status === 'active') {
        actions.appendChild(
          buildExternalActionButton(
            'settings.extensionsExternal.action.disable',
            `disable-${id}`,
            async () => {
              await disableExternalExtension(id);
              rerender();
            },
          ),
        );
      } else if (entry.status !== 'incompatible') {
        // inactive/confirm/error: Aktivieren löst den Warn-Dialog aus,
        // wenn die installierte Version nicht bestätigt ist.
        actions.appendChild(
          buildExternalActionButton(
            'settings.extensionsExternal.action.enable',
            `enable-${id}`,
            async () => {
              await enableExternalExtension(id);
              rerender();
            },
          ),
        );
      }
      actions.appendChild(
        buildExternalActionButton(
          'settings.extensionsExternal.action.remove',
          `remove-${id}`,
          async () => {
            await removeExternalExtension(id);
            rerender();
          },
        ),
      );
    }
    if (actions.childNodes.length > 0) row.appendChild(actions);
    listEl.appendChild(row);
  }
}

export function renderExternalExtensionsSection(container) {
  const intro = document.createElement('p');
  intro.className = 'settings-extensions-intro';
  intro.textContent = t('settings.extensionsExternal.intro');
  container.appendChild(intro);

  const list = document.createElement('div');
  list.id = 'settings-extensions-external-list';
  list.className = 'settings-extensions-external-list';
  container.appendChild(list);
  renderExternalExtensionsList(list);

  const footer = document.createElement('div');
  footer.className = 'settings-extension-external-footer';
  footer.appendChild(
    buildExternalActionButton('settings.extensionsExternal.action.rescan', 'rescan', async () => {
      await rescanExternalExtensions();
      if (list.isConnected) renderExternalExtensionsList(list);
    }),
  );
  footer.appendChild(
    buildExternalActionButton(
      'settings.extensionsExternal.action.openDir',
      'open-dir',
      async () => {
        if (typeof api.openExternalExtensionsDir === 'function') {
          await api.openExternalExtensionsDir();
        }
      },
    ),
  );
  container.appendChild(footer);

  // 4T-000927 (Epic 3E-000016): Zugang zu den Entwickler-Werkzeugen, seit dem
  // Entfall des Menueeintrags samt F12 der einzige. Er steht bewusst am Ende
  // und abgesetzt in einem eigenen Block: Er betrifft kein einzelnes Paket,
  // sondern die Diagnose aller, und ist ein Werkzeug und keine Bedien-Funktion
  // der Anwendung. Der erklaerende Satz daneben sagt, wofuer er da ist —
  // ohne ihn waere die Schaltflaeche an dieser Stelle ein Raetsel.
  const diagnose = document.createElement('div');
  diagnose.className = 'settings-extension-external-diagnose';
  const hint = document.createElement('p');
  hint.className = 'settings-extension-external-diagnose-hint';
  hint.textContent = t('settings.extensionsExternal.diagnose.hint');
  diagnose.appendChild(hint);
  diagnose.appendChild(
    buildExternalActionButton(
      'settings.extensionsExternal.action.devTools',
      'devtools',
      async () => {
        if (typeof api.toggleDevTools === 'function') {
          await api.toggleDevTools();
        }
      },
    ),
  );
  container.appendChild(diagnose);
}
