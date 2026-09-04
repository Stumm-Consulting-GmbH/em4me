// 4T-000436 (Epic 3E-000081): Bereich „Journale" — Regal- und Journal-
// Verwaltung der journals-Sektion der Bereichsdatei (Übersicht, Detail,
// Validierung, Persistenz). Der Journal-Editor liegt im Nachbar-Modul
// settings-journals-editor.js.
'use strict';

import {
  DEFAULT_DATE_PROP,
  DEFAULT_END_PROP,
  DEFAULT_NAME_PROP,
  DEFAULT_START_PROP,
  isoDateToMs,
  periodOf,
  resolveEntryPath,
} from '../../../shared/journal-core.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { buildJournalEditor, journalIdFromName } from './settings-journals-editor.js';
import { renderActiveSection } from './settings-mount.js';
import { jsonEqual } from './settings-shared.js';

// Spiegelt applyJournalsSection (Persistenz-Form gegen den Snapshot; die
// id-Vergabe neuer Journale entfällt hier — ein neues Journal ist so oder
// so eine Änderung, die Prüfung bleibt frei von Draft-Mutationen).
export function dirtyJournalsSection(draft) {
  const values = draft.journals;
  if (!values || !values.hasArea) return false;
  return !jsonEqual(journalsPersistForm(values), draft.journalsSnapshot);
}

// --- Bereich Journale (4T-000436, Epic 3E-000081) ------------------------------------
// Regale und Journal-Definitionen der journals-Sektion der Bereichsdatei
// (Datenpfad aus 4T-000431); nur bei Fenstern mit Bereich (Architektur-
// entscheidung 2 des Epics). Entwurfs-Semantik der Seite: persistiert wird
// erst bei Anwenden/OK; der Schreib-Pfad broadcastet journals:changed,
// Kalender-Panel und Kommandos ziehen ohne Neustart nach.

// Konfigurations-Stand in die Entwurfs-Form bringen (bearbeitbare Kopien;
// Property-Namen ausgefüllt mit den Defaults). Zusätzlich wird die
// Vorlagen-Liste des aufgelösten Vorlagen-Ordners geladen (Auswahl-Feld
// "Vorlage"; leer bei unkonfiguriertem Ordner).
export async function readJournalsFromConfig() {
  let config;
  try {
    config = await api.journalsGetConfig();
  } catch {
    config = null;
  }
  let templates = [];
  try {
    const list = await api.templatesList();
    if (list && list.ok && Array.isArray(list.templates)) {
      templates = list.templates.map((e) => e.relPath);
    }
  } catch {
    templates = [];
  }
  const cfg = config && config.config ? config.config : { shelves: [], journals: [] };
  const journals = (cfg.journals || []).map((j) => ({ ...j }));
  const draft = {
    hasArea: !!(config && config.hasArea),
    areaName: (config && config.areaName) || '',
    shelves: [...(cfg.shelves || [])],
    journals,
    templatesList: templates,
    // Ansichts-Zustand der zweistufigen Navigation: null = Regal-Übersicht,
    // '' = Journale ohne Regal, sonst der geöffnete Regal-Name.
    openShelf: null,
  };
  return { draft, snapshot: journalsPersistForm(draft) };
}

// Persistenz-Form des Entwurfs: leere Journale entfallen nicht (Validierung
// verhindert sie), name fällt auf id zurück; null bei komplett leerem Stand.
function journalsPersistForm(values) {
  const shelves = values.shelves.map((s) => String(s || '').trim()).filter((s) => s !== '');
  const journals = values.journals.map((j) => ({
    id: String(j.id || '').trim(),
    name: String(j.name || '').trim() || String(j.id || '').trim(),
    shelf: String(j.shelf || '').trim() || null,
    granularity: j.granularity,
    folderPattern: String(j.folderPattern || '').trim(),
    namePattern: String(j.namePattern || '').trim(),
    template: String(j.template || '').trim() || null,
    startDate: String(j.startDate || '').trim() || null,
    endDate: String(j.endDate || '').trim() || null,
    nameProp: String(j.nameProp || '').trim() || DEFAULT_NAME_PROP,
    dateProp: String(j.dateProp || '').trim() || DEFAULT_DATE_PROP,
    startProp: String(j.startProp || '').trim() || DEFAULT_START_PROP,
    endProp: String(j.endProp || '').trim() || DEFAULT_END_PROP,
  }));
  if (shelves.length === 0 && journals.length === 0) return null;
  return { shelves, journals };
}

export function renderJournalsSection(container, draft) {
  const values = draft.journals;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.journals.loading');
    container.appendChild(loading);
    return;
  }
  if (!values.hasArea) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.id = 'settings-journals-no-area';
    hint.textContent = t('settings.journals.noArea');
    container.appendChild(hint);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.journals.intro').replace('{name}', values.areaName);
  container.appendChild(intro);

  // Zweistufige Navigation (PO-Befund der Release-Test-Iteration 0.55.0):
  // die Übersicht zeigt nur die Regale; „Öffnen" wechselt in die Detail-
  // ansicht mit den Journalen genau dieses Regals, „Regal schließen" führt
  // zurück. openShelf: null = Übersicht, '' = Journale ohne Regal,
  // sonst der Regal-Name (flüchtiger Ansichts-Zustand des Entwurfs).
  if (values.openShelf === null || values.openShelf === undefined) {
    renderJournalsShelfOverview(container, values);
  } else {
    renderJournalsShelfDetail(container, draft, values);
  }
}

// Übersicht: Regal-Zeilen (öffnen, umbenennen mit Nachzug der Journal-
// Zuordnung, löschen — referenzierende Journale verlieren nur die
// Zuordnung) plus die feste Zeile „Ohne Regal" für unzugeordnete Journale.
function renderJournalsShelfOverview(container, values) {
  const shelvesHeading = document.createElement('h4');
  shelvesHeading.className = 'settings-export-group-title';
  shelvesHeading.textContent = t('settings.journals.shelvesGroup');
  container.appendChild(shelvesHeading);

  const journalCount = (shelf) => values.journals.filter((j) => (j.shelf || '') === shelf).length;
  const buildOpenBtn = (idPart, shelfKey) => {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.id = `settings-journals-shelf-open-${idPart}`;
    openBtn.className = 'btn settings-journals-shelf-open';
    openBtn.textContent = t('settings.journals.shelfOpen');
    openBtn.addEventListener('click', () => {
      values.openShelf = shelfKey;
      renderActiveSection();
    });
    return openBtn;
  };

  values.shelves.forEach((shelf, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-journals-shelf';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `settings-journals-shelf-name-${idx}`;
    input.className = 'settings-input';
    input.placeholder = t('settings.journals.shelfPlaceholder');
    input.value = shelf;
    let previous = shelf;
    input.addEventListener('change', () => {
      const next = input.value.trim();
      for (const journal of values.journals) {
        if (journal.shelf === previous) journal.shelf = next || null;
      }
      values.shelves[idx] = next;
      previous = next;
      renderActiveSection();
    });
    const count = document.createElement('span');
    count.className = 'settings-journals-shelf-count';
    count.textContent = t('settings.journals.shelfCount').replace(
      '{count}',
      String(journalCount(shelf)),
    );
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = `settings-journals-shelf-remove-${idx}`;
    removeBtn.className = 'btn settings-journals-shelf-remove';
    removeBtn.textContent = t('settings.journals.shelfRemove');
    removeBtn.addEventListener('click', () => {
      for (const journal of values.journals) {
        if (journal.shelf === values.shelves[idx]) journal.shelf = null;
      }
      values.shelves.splice(idx, 1);
      renderActiveSection();
    });
    const openBtn = buildOpenBtn(String(idx), shelf);
    // Ein frisch angelegtes Regal ohne Namen ist noch nicht öffenbar
    // (der leere Schlüssel gehört der Zeile „Ohne Regal").
    if (shelf === '') openBtn.disabled = true;
    row.append(input, count, openBtn, removeBtn);
    container.appendChild(row);
  });

  // Feste Zeile für Journale ohne Regal-Zuordnung (immer erreichbar).
  {
    const row = document.createElement('div');
    row.className = 'settings-journals-shelf settings-journals-shelf-none';
    const label = document.createElement('span');
    label.className = 'settings-journals-shelf-none-label';
    label.textContent = t('settings.journals.shelfNoneGroup');
    const count = document.createElement('span');
    count.className = 'settings-journals-shelf-count';
    count.textContent = t('settings.journals.shelfCount').replace(
      '{count}',
      String(journalCount('')),
    );
    row.append(label, count, buildOpenBtn('none', ''));
    container.appendChild(row);
  }

  const shelfAddBtn = document.createElement('button');
  shelfAddBtn.type = 'button';
  shelfAddBtn.id = 'settings-journals-shelf-add';
  shelfAddBtn.className = 'btn settings-journals-shelf-add';
  shelfAddBtn.textContent = t('settings.journals.shelfAdd');
  shelfAddBtn.addEventListener('click', () => {
    values.shelves.push('');
    renderActiveSection();
  });
  container.appendChild(shelfAddBtn);
}

// Detailansicht eines Regals: nur dessen Journale (Editor-Formulare mit
// den ORIGINAL-Indizes der Gesamtliste — stabile Feld-IDs und korrektes
// Entfernen), „Journal hinzufügen" mit vorbelegtem Regal und „Regal
// schließen" zurück zur Übersicht. Ein nicht mehr existentes offenes Regal
// (z.B. nach Umbenennen) fällt beim nächsten Aufbau auf die Übersicht
// zurück (renderJournalsSection prüft openShelf nicht erneut — der Wechsel
// passiert ausschließlich über die Buttons, die neu rendern).
function renderJournalsShelfDetail(container, draft, values) {
  const shelfKey = values.openShelf;
  const head = document.createElement('div');
  head.className = 'settings-journals-detail-head';
  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title settings-journals-detail-title';
  heading.textContent =
    shelfKey === ''
      ? t('settings.journals.shelfNoneGroup')
      : t('settings.journals.shelfDetailTitle').replace('{name}', shelfKey);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'settings-journals-shelf-close';
  closeBtn.className = 'btn settings-journals-shelf-close';
  closeBtn.textContent = t('settings.journals.shelfClose');
  closeBtn.addEventListener('click', () => {
    values.openShelf = null;
    renderActiveSection();
  });
  head.append(heading, closeBtn);
  container.appendChild(head);

  const snapshot = draft.journalsSnapshot;
  const snapshotById = new Map(((snapshot && snapshot.journals) || []).map((j) => [j.id, j]));
  let shown = 0;
  values.journals.forEach((journal, idx) => {
    if ((journal.shelf || '') !== shelfKey) return;
    buildJournalEditor(container, values, journal, idx, snapshotById);
    shown++;
  });
  if (shown === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-row-hint';
    empty.textContent = t('settings.journals.shelfEmpty');
    container.appendChild(empty);
  }

  const journalAddBtn = document.createElement('button');
  journalAddBtn.type = 'button';
  journalAddBtn.id = 'settings-journals-add';
  journalAddBtn.className = 'btn settings-journals-add';
  journalAddBtn.textContent = t('settings.journals.journalAdd');
  journalAddBtn.addEventListener('click', () => {
    values.journals.push({
      id: '',
      name: '',
      shelf: shelfKey === '' ? null : shelfKey,
      granularity: 'day',
      folderPattern: '',
      namePattern: '{{date}}',
      template: null,
      startDate: '',
      endDate: '',
      nameProp: DEFAULT_NAME_PROP,
      dateProp: DEFAULT_DATE_PROP,
      startProp: DEFAULT_START_PROP,
      endProp: DEFAULT_END_PROP,
    });
    renderActiveSection();
  });
  container.appendChild(journalAddBtn);
}

// Pflichtfelder und Format-Prüfung: Name, Namens-Schema, Schema-Auflösung
// über die Vorlagen-Engine (heutige Beispiel-Periode), Datums-Grenzen.
export function validateJournalsSection(draft) {
  const values = draft.journals;
  if (!values || !values.hasArea) return null;
  for (const journal of values.journals) {
    const name = String(journal.name || '').trim();
    if (name === '') return t('settings.journals.error.name');
    if (String(journal.namePattern || '').trim() === '') {
      return t('settings.journals.error.namePattern').replace('{name}', name);
    }
    const probe = {
      ...journal,
      folderPattern: String(journal.folderPattern || '').trim(),
      namePattern: String(journal.namePattern || '').trim(),
    };
    const resolved = resolveEntryPath(probe, periodOf(Date.now(), journal.granularity));
    if (!resolved.ok) {
      return t('settings.journals.error.pattern').replace('{name}', name);
    }
    const start = String(journal.startDate || '').trim();
    const end = String(journal.endDate || '').trim();
    if (start !== '' && isoDateToMs(start) === null) {
      return t('settings.journals.error.date').replace('{name}', name);
    }
    if (end !== '' && isoDateToMs(end) === null) {
      return t('settings.journals.error.date').replace('{name}', name);
    }
    if (start !== '' && end !== '' && isoDateToMs(start) > isoDateToMs(end)) {
      return t('settings.journals.error.dateOrder').replace('{name}', name);
    }
  }
  return null;
}

export async function applyJournalsSection(draft) {
  const values = draft.journals;
  if (!values || !values.hasArea) return;
  // Neue Journale erhalten ihre stabile id erst jetzt (Slug aus dem Namen).
  const taken = new Set(values.journals.map((j) => j.id).filter(Boolean));
  for (const journal of values.journals) {
    if (!String(journal.id || '').trim()) {
      journal.id = journalIdFromName(journal.name, taken);
      taken.add(journal.id);
    }
  }
  const out = journalsPersistForm(values);
  if (JSON.stringify(out) === JSON.stringify(draft.journalsSnapshot)) return;
  let result;
  try {
    result = await api.journalsSetAreaConfig(out);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
    showStatusbarHint(null, {
      text: t('settings.journals.areaWriteFailed'),
      error: true,
      duration: 4000,
    });
    return;
  }
  draft.journalsSnapshot = out;
}
