// Verschieben einer Kapitel-Datei (4T-0847, Story 4S-0756) und Reparatur eines
// deklarierten Kapitels ohne Datei (4T-0848, Story 4S-0757).
// 4T-0980 (Epic 3E-0196): aus modules/books/book-panel.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert). Beide Wege eint, dass sie
// am Bestand der Dateien ansetzen und nicht an der Baum-Ordnung; die
// Baum-Ordnung pflegt book-structure.js.
'use strict';

import { t } from '../../i18n.js';

import { getPaneEls } from '../app/app-state.js';
import { showStatusbarHint } from '../views/views.js';

import { pathKey } from './book-helpers.js';
import { activeBook, activeChapter, booksApi } from './book-state.js';

// --- Kapitel-Datei verschieben (4T-0847, Story 4S-0756) ------------------------

// Fehler-Kennungen des Verschiebe-Weges, die eine eigene Erklärung verdienen;
// alles Übrige fällt auf den allgemeinen Hinweis zurück. Übersetzt wird erst
// hier, die Kennungen aus dem Main bleiben maschinenlesbar.
const MOVE_ERROR_KEYS = {
  'outside-book': 'bookPanel.moveOutsideBook',
  exists: 'bookPanel.moveExists',
  'book-file': 'bookPanel.moveBookFile',
};

// Abgebrochener Ordner-Dialog und ein Ziel, das der aktuelle Ordner ist: kein
// Fehler, sondern eine folgenlose Bedienung — eine Meldung wäre nur Lärm.
const MOVE_ERRORS_SILENT = new Set(['unchanged']);

// Verschiebt die Datei eines Eintrags; der Ziel-Ordner kommt aus dem
// Ordner-Dialog des Main-Prozesses. Der neue Zustand kommt über den
// Zustands-Push zurück, hier wird nichts vorweggenommen.
export async function moveChapterFile(relPath) {
  const ns = booksApi();
  if (!ns || typeof ns.moveChapterFile !== 'function') return false;
  let result;
  try {
    result = await ns.moveChapterFile(relPath);
  } catch (err) {
    console.warn('Kapitel-Datei verschieben fehlgeschlagen:', relPath, err);
    result = null;
  }
  if (result && result.ok) return true;
  if (result && result.canceled) return false;
  const error = result ? result.error : undefined;
  if (MOVE_ERRORS_SILENT.has(error)) return false;
  showStatusbarHint(MOVE_ERROR_KEYS[error] || 'bookPanel.moveFailed', {
    duration: 3000,
    error: true,
  });
  return false;
}

// Kommando-Weg: wirkt auf die gerade gelesene Datei der Spalte, sofern sie im
// Buch-Ordner des aktiven Buches liegt. Sonst gibt es kein Ziel und damit
// einen Hinweis statt einer stillen Wirkungslosigkeit.
export function moveActiveChapterFile(paneIdx) {
  const relPath = activeBook() ? activeChapter(paneIdx) : null;
  if (relPath === null) {
    showStatusbarHint('bookPanel.moveNoChapter', { duration: 2500, error: true });
    return;
  }
  void moveChapterFile(relPath);
}

// --- Reparatur fehlender Kapitel (4T-0848, Story 4S-0757) ----------------------
//
// Ein Baum-Eintrag ohne Datei ist markiert (AK1) und trägt am Kontextmenü zwei
// Wege: „neu zuordnen" und „aushängen" (AK2). Nichts davon geschieht von
// selbst — auch ein einzelner namensgleicher Fund ist nur ein vorbelegter
// Vorschlag und braucht den Klick (AK3, Epic-Entscheidung 6). Repariert wird
// ausschließlich die Deklaration; die Zeile verliert ihre Fehl-Markierung über
// den Zustands-Push des Main-Prozesses (AK4), nicht durch eine Vorwegnahme
// hier.

// Fehler-Kennungen der Zuordnung, die eine eigene Erklärung verdienen; alles
// Übrige fällt auf den allgemeinen Hinweis zurück.
const REASSIGN_ERROR_KEYS = {
  'outside-book': 'bookPanel.reassignOutsideBook',
  'unknown-file': 'bookPanel.reassignUnknownFile',
  'duplicate-path': 'bookPanel.reassignDuplicate',
  'book-file': 'bookPanel.reassignBookFile',
};

// Die Wahl derselben Datei ist keine Fehlbedienung, sondern folgenlos.
const REASSIGN_ERRORS_SILENT = new Set(['unchanged']);

// Gemeinsamer Abschluss beider Wege (angenommener Vorschlag und Datei-Dialog).
function finishReassign(result) {
  if (result && result.ok) {
    // Der Zustands-Push baut die Zeilen ohnehin neu auf; das Schließen hier
    // lässt die Auswahl auch dann nicht stehen, wenn er ausbleibt.
    closeReassignChooser();
    return true;
  }
  if (result && result.canceled) return false;
  const error = result ? result.error : undefined;
  if (REASSIGN_ERRORS_SILENT.has(error)) return false;
  showStatusbarHint(REASSIGN_ERROR_KEYS[error] || 'bookPanel.reassignFailed', {
    duration: 3000,
    error: true,
  });
  return false;
}

// Zuordnung eines angenommenen Vorschlags (buch-relativer Pfad).
async function runReassign(missingPath, newPath) {
  const ns = booksApi();
  if (!ns || typeof ns.reassignChapter !== 'function') return false;
  let result;
  try {
    result = await ns.reassignChapter(missingPath, newPath);
  } catch (err) {
    console.warn('Kapitel neu zuordnen fehlgeschlagen:', missingPath, err);
    result = null;
  }
  return finishReassign(result);
}

// Zuordnung über den Datei-Dialog des Main-Prozesses. Die Grenze auf den
// Buch-Ordner prüft der Main-Prozess; der Dialog selbst ließe ein Ziel
// außerhalb zu.
async function reassignFromDialog(missingPath) {
  const ns = booksApi();
  if (!ns || typeof ns.reassignChapterDialog !== 'function') return false;
  let result;
  try {
    result = await ns.reassignChapterDialog(missingPath);
  } catch (err) {
    console.warn('Datei-Wahl für die Zuordnung fehlgeschlagen:', missingPath, err);
    result = null;
  }
  return finishReassign(result);
}

function closeReassignChooser() {
  document.querySelectorAll('.book-reassign').forEach((el) => el.remove());
}

// Auswahl-Block unter der fehlenden Zeile (Muster der Inline-Eingabe für
// „Neues Kapitel": kein Modal, weil die Wahl am Eintrag hängt). Genau ein
// namensgleicher Fund ist DER Vorschlag und wird vorbelegt — hervorgehoben und
// fokussiert, aber unausgeführt; bei mehreren Funden bleibt die Wahl offen.
function showReassignChooser(paneIdx, missingPath, suggestions) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookTree) return;
  closeReassignChooser();

  const box = document.createElement('div');
  box.className = 'book-reassign';
  box.dataset.pfad = missingPath;
  box.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    closeReassignChooser();
  });

  const title = document.createElement('div');
  title.className = 'book-reassign-title';
  title.textContent = t('bookPanel.reassignTitle');
  box.appendChild(title);

  const subject = document.createElement('div');
  subject.className = 'book-reassign-subject';
  subject.textContent = missingPath;
  box.appendChild(subject);

  const single = suggestions.length === 1;
  for (const candidate of suggestions) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'book-reassign-option';
    if (single) option.classList.add('suggested');
    option.dataset.pfad = candidate;
    option.textContent = candidate;
    option.title = candidate;
    option.addEventListener('click', () => {
      void runReassign(missingPath, candidate);
    });
    box.appendChild(option);
  }

  const actions = document.createElement('div');
  actions.className = 'book-reassign-actions';
  const browse = document.createElement('button');
  browse.type = 'button';
  browse.className = 'book-reassign-browse';
  browse.textContent = t('bookPanel.reassignChoose');
  browse.addEventListener('click', () => {
    closeReassignChooser();
    void reassignFromDialog(missingPath);
  });
  actions.appendChild(browse);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'book-reassign-cancel';
  cancel.textContent = t('dialog.cancel');
  cancel.addEventListener('click', () => closeReassignChooser());
  actions.appendChild(cancel);
  box.appendChild(actions);

  const row = [...els.bookTree.querySelectorAll('.book-entry-row')].find(
    (candidate) => pathKey(candidate.dataset.pfad) === pathKey(missingPath),
  );
  if (row) row.insertAdjacentElement('afterend', box);
  else els.bookTree.appendChild(box);
  const first = box.querySelector('.book-reassign-option');
  if (first && typeof first.focus === 'function') first.focus();
}

// Einstieg des Kontextmenüs: erst die Funde holen, dann die Auswahl zeigen.
// Ohne namensgleichen Fund gibt es nichts vorzuschlagen — dann führt der
// Datei-Dialog unmittelbar zur Wahl, statt eine leere Liste anzubieten.
export async function startReassign(paneIdx, missingPath) {
  const ns = booksApi();
  if (!ns || typeof ns.suggestMissing !== 'function') return;
  let result;
  try {
    result = await ns.suggestMissing(missingPath);
  } catch (err) {
    console.warn('Vorschläge für ein fehlendes Kapitel nicht ermittelbar:', missingPath, err);
    result = null;
  }
  const suggestions =
    result && result.ok && Array.isArray(result.suggestions)
      ? result.suggestions.filter((entry) => typeof entry === 'string' && entry !== '')
      : [];
  if (suggestions.length === 0) {
    await reassignFromDialog(missingPath);
    return;
  }
  showReassignChooser(paneIdx, missingPath, suggestions);
}
