// 4T-002251 (Epic 3E-000262, F1 A, F4 A; Festlegung 1): Die Zeile einer
// Neuanlage in der Listen-Maske, gebaut nach dem Kopf des Gitters.
//
// **Die neue Zeile steht oben in der gezeigten Seite**, vor der ersten Zeile:
// Sie ist ohne Blättern sichtbar, und die Sortierung der Abfrage kennt den
// Datensatz noch nicht. In der Spalte des Datensatzes steht «Neu». Nach dem
// Speichern befüllt der Block neu, und der Datensatz steht dort, wo Abfrage
// und Sortierung ihn einordnen.
//
// **Die Zellen folgen den Kopf-Zellen**: Eine Spalte, die genau ein Feld nennt
// (`data-db-list-field` am Kopf, 4T-002249), wird eine bearbeitbare Zelle; die
// Aktions-Spalte wird die Aktions-Zelle; jede andere bleibt eine leere lesende
// Zelle, weil ein gerechneter Wert vor dem Speichern nicht feststeht.
//
// Eigenes Modul, damit das Zeilen-Modul (`listen-zeile.js`) unter seinem
// Budget bleibt; ohne Import des Fenster-Zustands, der Text kommt herein.
'use strict';

/** Klasse der Zeile einer Neuanlage. */
export const ZEILE_NEU_KLASSE = 'db-list-row-new';

/**
 * Baut die Zeile einer Neuanlage nach dem Kopf des Gitters und setzt sie oben
 * in dessen Körper.
 *
 * @param {HTMLTableElement} table Das Gitter `table.db-list-table`.
 * @param {string} beschriftung Der Text der Datensatz-Spalte («Neu»).
 * @returns {{tr: HTMLTableRowElement, aktionen: HTMLTableCellElement|null}|null}
 *   null, wenn das Gitter keinen Kopf oder Körper hat.
 */
export function baueNeueZeile(table, beschriftung) {
  const kopf = table && table.tHead ? table.tHead.rows[0] : null;
  const tbody = table && table.tBodies.length > 0 ? table.tBodies[0] : null;
  if (!kopf || !tbody) return null;
  const tr = document.createElement('tr');
  tr.className = `db-list-row ${ZEILE_NEU_KLASSE}`;
  let aktionen = null;
  for (const th of kopf.cells) {
    const td = document.createElement('td');
    if (th.classList.contains('db-list-col-actions')) {
      td.className = 'db-list-actions db-list-col-readonly';
      aktionen = td;
    } else if (th.classList.contains('db-list-col-record')) {
      td.className = 'db-list-col-record db-list-col-readonly';
      td.textContent = beschriftung;
    } else if (th.dataset.dbListField) {
      td.className = 'db-list-col-field';
      td.dataset.dbListField = th.dataset.dbListField;
    } else {
      td.className = 'db-list-col-readonly';
    }
    tr.appendChild(td);
  }
  tbody.prepend(tr);
  return { tr, aktionen };
}

/**
 * Entfernt die Zeile einer Neuanlage samt dem Block darunter.
 *
 * @param {HTMLTableRowElement} tr
 */
export function entferneNeueZeile(tr) {
  const block = tr.nextElementSibling;
  if (block && block.classList.contains('db-list-row-block')) block.remove();
  tr.remove();
}

/**
 * Der Ablauf einer Neuanlage (Festlegung 3): die Zeile oben im Gitter, die
 * Kennung über `database:neuanlage`, danach der leere Stand und die
 * Feld-Elemente über das Zeilen-Modul. Gezogen wird beim Eröffnen wie in der
 * Einzel-Maske (`neuerDatensatz`); eine nie gespeicherte Neuanlage lässt die
 * Kennung verbraucht (E5.1).
 *
 * @param {object} p
 * @param {HTMLElement} p.container Das Element `div.db-list`.
 * @param {string} p.tabellenPfad Pfad der Tabellen-Datei.
 * @param {Function} p.t Übersetzung.
 * @param {(params: object) => Promise<object>} [p.neuanlage] Kanal `database:neuanlage`.
 * @param {(key: string) => void} p.hinweis Hinweis in der Statuszeile.
 * @param {object} p.kern Der Kern des Zeilen-Moduls: `frei()` (keine Zeile in
 *   Bearbeitung, alter Block vergessen), `oeffne(tr, info)` (Zustand im Beginn),
 *   `gilt(zustand)`, `entferne(zustand)` und `lade(zustand)`.
 * @returns {Promise<void>}
 */
export async function eroeffneNeuanlage({ container, tabellenPfad, t, neuanlage, hinweis, kern }) {
  const table = container ? container.querySelector('table.db-list-table') : null;
  if (!table || !tabellenPfad || typeof neuanlage !== 'function' || !kern.frei()) return;
  const neu = baueNeueZeile(table, t('database.list.newRow'));
  if (!neu) return;
  // Ohne Aktions-Zelle hätten «Speichern» und «Abbrechen» keinen Ort.
  if (!neu.aktionen) {
    neu.tr.remove();
    return;
  }
  const zustand = kern.oeffne(neu.tr, {
    tabellenPfad,
    kennung: null,
    aktionen: neu.aktionen,
    neu: true,
  });
  let ergebnis;
  try {
    ergebnis = await neuanlage({ tabelle: tabellenPfad });
  } catch {
    ergebnis = null;
  }
  if (!kern.gilt(zustand)) return;
  if (!ergebnis || ergebnis.ok !== true || typeof ergebnis.kennung !== 'string') {
    hinweis('database.form.newFailed');
    kern.entferne(zustand);
    return;
  }
  zustand.kennung = ergebnis.kennung;
  await kern.lade(zustand);
}
