// Modale Dialoge: Ueber-Dialog, Alias-Auswahl, Namens-Eingabe und die beiden
// Link-Update-Dialoge (Vorschau und Bericht).
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
// 4T-0978 (Epic 3E-0196): Tab- und Gruppen-Menues nach tabs/tab-context-menu.js
// und die generischen Menue-Helfer nach dialogs/context-menu-utils.js
// ausgezogen; hier bleiben die Modale (reiner Struktur-Schnitt).
'use strict';

import { t } from '../../i18n.js';

import { api, $ } from '../app/api.js';
import { aboutModal, aboutVersionEl, aliasModal } from '../app/app-state.js';

// --- About-Modal ------------------------------------------------------------
export async function showAbout() {
  if (!aboutVersionEl.textContent || aboutVersionEl.textContent.trim() === '—') {
    try {
      const v = await api.getVersion();
      aboutVersionEl.textContent = v;
    } catch {
      aboutVersionEl.textContent = '?';
    }
  }
  aboutModal.hidden = false;
  setTimeout(() => $('#btn-about-close').focus(), 0);
}

export function hideAbout() {
  aboutModal.hidden = true;
}

// --- Alias-Modal (4T-0050) --------------------------------------------------
// Promise-basiertes Modal. Aufrufer ruft showAliasDialog(alias, candidates)
// und wartet auf den ausgewaehlten Pfad oder null (Abbruch durch Esc,
// Backdrop oder Cancel-Button). Nur ein Dialog gleichzeitig aktiv;
// pendingAliasResolver speichert den Promise-Resolver fuer den aktuellen
// Aufruf.
// 4T-0978: Die Bindung bleibt mit ihren drei Funktionen in diesem Modul —
// kein Modul von aussen liest oder schreibt sie, sodass die Regel gegen
// beschreibbare Export-Bindings über Modul-Grenzen ohne Zugriffs-Funktionen
// eingehalten ist.
export let pendingAliasResolver = null;

export function showAliasDialog(alias, candidates) {
  return new Promise((resolve) => {
    // Falls ein vorheriger Dialog noch offen war: alten Promise mit null
    // abschliessen, damit Aufrufer nicht haengen.
    if (pendingAliasResolver) {
      const prev = pendingAliasResolver;
      pendingAliasResolver = null;
      prev(null);
    }
    pendingAliasResolver = resolve;

    const desc = aliasModal.querySelector('#alias-description');
    const list = aliasModal.querySelector('#alias-candidates');
    // Beschreibung lokalisieren: 'Mehrere Dateien fuehren den Alias "<alias>".'
    const tmpl = t('alias.dialogDescription');
    desc.textContent = tmpl.replace('{alias}', alias);

    // Kandidaten-Liste aufbauen. Buttons enthalten den Datei-Namen (fett)
    // und das Verzeichnis darunter (klein, gedaempft).
    list.innerHTML = '';
    for (const fullPath of candidates) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      const name = api.basename(fullPath);
      const dir = api.dirname(fullPath);
      const nameEl = document.createElement('span');
      nameEl.className = 'alias-candidate-name';
      nameEl.textContent = name;
      const dirEl = document.createElement('span');
      dirEl.className = 'alias-candidate-dir';
      dirEl.textContent = dir;
      btn.appendChild(nameEl);
      btn.appendChild(dirEl);
      btn.addEventListener('click', () => resolveAliasDialog(fullPath));
      li.appendChild(btn);
      list.appendChild(li);
    }

    aliasModal.hidden = false;
    // Fokus auf den ersten Kandidaten-Button setzen, damit Pfeil-Navigation
    // direkt funktioniert.
    setTimeout(() => {
      const firstBtn = list.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }, 0);
  });
}

export function resolveAliasDialog(chosenPath) {
  aliasModal.hidden = true;
  if (pendingAliasResolver) {
    const r = pendingAliasResolver;
    pendingAliasResolver = null;
    r(chosenPath);
  }
}

export function cancelAliasDialog() {
  resolveAliasDialog(null);
}

// --- Namens-Eingabe-Modal (4T-0338, Epic 3E-0061) ----------------------------
// Generischer Eingabe-Dialog fuer Unterseite-anlegen und Datei-umbenennen.
// Promise-basiert wie showAliasDialog: liefert den bestaetigten Namen oder
// null bei Abbruch (Esc, Backdrop, Abbrechen-Button). opts:
//   title        Dialog-Titel (bereits lokalisiert)
//   description  Beschreibungs-Zeile (bereits lokalisiert)
//   initialValue Vorbelegung des Eingabefelds
//   placeholder  Platzhalter-Text
//   okLabel      Beschriftung des Bestaetigen-Buttons (bereits lokalisiert)
//   validate     (value, checkboxes) => i18n-Key des Fehlers oder null
// 4T-0346 (Epic 3E-0062): opts.checkboxes ist eine optionale Liste
//   [{ id, label, checked, requires?, onChange? }]. Ohne die Option verhaelt
//   sich der Dialog wie bisher (Rueckgabe: String bzw. null). Mit der Option
//   zeigt er die Checkboxen und liefert bei OK ein Objekt
//   { value, checkboxes: { id: bool } }; `requires` deaktiviert eine Checkbox,
//   solange die referenzierte aus ist.
// 4T-0646 (Epic 3E-0128): `onChange(checked, input)` laesst eine Checkbox das
//   Eingabefeld umschalten (Vollname-Schalter des Umbenennen-Dialogs), und
//   `validate` bekommt die Checkbox-Werte als zweiten Parameter, damit die
//   Pruefung dem umgeschalteten Modus folgen kann.
export function showNameInputDialog(opts) {
  const modal = $('#name-input-modal');
  const titleEl = $('#name-input-title');
  const descEl = $('#name-input-description');
  const input = $('#name-input-field');
  const errorEl = $('#name-input-error');
  const btnOk = $('#btn-name-input-ok');
  const btnCancel = $('#btn-name-input-cancel');
  const checkboxContainer = $('#name-input-checkboxes');
  if (!modal || !input) return Promise.resolve(null);

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    descEl.textContent = (opts && opts.description) || '';
    descEl.hidden = !descEl.textContent;
    input.value = (opts && opts.initialValue) || '';
    input.placeholder = (opts && opts.placeholder) || '';
    errorEl.hidden = true;
    errorEl.textContent = '';
    btnOk.textContent = (opts && opts.okLabel) || t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');

    const checkboxDefs = opts && Array.isArray(opts.checkboxes) ? opts.checkboxes : [];
    const checkboxInputs = {};
    if (checkboxContainer) {
      checkboxContainer.innerHTML = '';
      checkboxContainer.hidden = checkboxDefs.length === 0;
      for (const def of checkboxDefs) {
        const label = document.createElement('label');
        label.className = 'name-input-checkbox';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `name-input-cb-${def.id}`;
        cb.checked = !!def.checked;
        const span = document.createElement('span');
        span.textContent = def.label || '';
        label.appendChild(cb);
        label.appendChild(span);
        checkboxContainer.appendChild(label);
        checkboxInputs[def.id] = cb;
      }
      const applyDeps = () => {
        for (const def of checkboxDefs) {
          if (!def.requires) continue;
          const master = checkboxInputs[def.requires];
          const dep = checkboxInputs[def.id];
          if (master && dep) dep.disabled = !master.checked;
        }
      };
      for (const def of checkboxDefs) {
        if (def.requires && checkboxInputs[def.requires]) {
          checkboxInputs[def.requires].addEventListener('change', applyDeps);
        }
        // 4T-0646 (Epic 3E-0128): Eine Checkbox darf das Eingabefeld
        // umschalten (Vollname-Schalter des Umbenennen-Dialogs). Der Aufrufer
        // bekommt den Zustand und das Feld; die Validierung liest die
        // Checkbox-Werte ueber den zweiten validate-Parameter.
        if (typeof def.onChange === 'function') {
          checkboxInputs[def.id].addEventListener('change', (ev) =>
            def.onChange(!!ev.target.checked, input),
          );
        }
      }
      applyDeps();
    }
    const readCheckboxes = () => {
      const out = {};
      for (const def of checkboxDefs) {
        const cb = checkboxInputs[def.id];
        out[def.id] = !!(cb && cb.checked && !cb.disabled);
      }
      return out;
    };

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onOk = () => {
      const value = input.value.trim();
      const errKey =
        opts && typeof opts.validate === 'function' ? opts.validate(value, readCheckboxes()) : null;
      if (errKey) {
        errorEl.textContent = t(errKey);
        errorEl.hidden = false;
        input.focus();
        return;
      }
      finish(checkboxDefs.length > 0 ? { value, checkboxes: readCheckboxes() } : value);
    };
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

// 4T-0346 (Epic 3E-0062): gemeinsamer Listen-Aufbau fuer Vorschau und Bericht.
// sections: Liste von { title?, emptyText?, rows: [{ text, detail? }] }. Leere
// Sektionen zeigen ihren emptyText (oder werden uebersprungen). Ein Dialog, zwei
// Betriebsarten (Architektur-Entscheidung des Epics).
function renderLinkUpdateSections(container, sections) {
  container.innerHTML = '';
  for (const section of sections) {
    if (section.title) {
      const h = document.createElement('h3');
      h.className = 'link-update-section-title';
      h.textContent = section.title;
      container.appendChild(h);
    }
    if (!section.rows || section.rows.length === 0) {
      if (section.emptyText) {
        const p = document.createElement('p');
        p.className = 'link-update-empty';
        p.textContent = section.emptyText;
        container.appendChild(p);
      }
      continue;
    }
    const ul = document.createElement('ul');
    ul.className = 'link-update-rows';
    for (const row of section.rows) {
      const li = document.createElement('li');
      const main = document.createElement('span');
      main.className = 'link-update-row-main';
      main.textContent = row.text;
      li.appendChild(main);
      if (row.detail) {
        const detail = document.createElement('span');
        detail.className = 'link-update-row-detail';
        detail.textContent = row.detail;
        li.appendChild(detail);
      }
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }
}

// 4T-0346 (Epic 3E-0062): Vorschau vor dem Link-Update. opts:
//   title, summary (lokalisiert), sections (fuer renderLinkUpdateSections),
//   continueLabel, cancelLabel. Liefert true (Fortfahren) oder false (Abbruch).
export function showLinkPreviewDialog(opts) {
  const modal = $('#link-preview-modal');
  const titleEl = $('#link-preview-title');
  const summaryEl = $('#link-preview-summary');
  const listEl = $('#link-preview-list');
  const btnContinue = $('#btn-link-preview-continue');
  const btnCancel = $('#btn-link-preview-cancel');
  if (!modal || !listEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    summaryEl.textContent = (opts && opts.summary) || '';
    summaryEl.hidden = !summaryEl.textContent;
    renderLinkUpdateSections(listEl, (opts && opts.sections) || []);
    btnContinue.textContent = (opts && opts.continueLabel) || t('dialog.ok');
    btnCancel.textContent = (opts && opts.cancelLabel) || t('dialog.cancel');

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnContinue.removeEventListener('click', onContinue);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onContinue = () => finish(true);
    const onCancel = () => finish(false);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onContinue();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnContinue.addEventListener('click', onContinue);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => btnContinue.focus(), 0);
  });
}

// 4T-0346 (Epic 3E-0062): Ergebnis-Bericht nach dem Link-Update. opts:
//   title, sections, okLabel. Liefert nichts (nur Bestaetigung).
export function showLinkReportDialog(opts) {
  const modal = $('#link-report-modal');
  const titleEl = $('#link-report-title');
  const bodyEl = $('#link-report-body');
  const btnOk = $('#btn-link-report-ok');
  if (!modal || !bodyEl) return Promise.resolve();

  return new Promise((resolve) => {
    titleEl.textContent = (opts && opts.title) || '';
    renderLinkUpdateSections(bodyEl, (opts && opts.sections) || []);
    btnOk.textContent = (opts && opts.okLabel) || t('dialog.ok');

    const finish = () => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', finish);
      backdrop.removeEventListener('click', finish);
      resolve();
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', finish);
    backdrop.addEventListener('click', finish);

    modal.hidden = false;
    setTimeout(() => btnOk.focus(), 0);
  });
}
