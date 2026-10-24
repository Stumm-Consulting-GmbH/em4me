'use strict';

// 4T-002249 (Epic 3E-000262, F2 A, F3 A, S1, S2, S5): Die Listen-Maske in der
// gerenderten Abfrage-Datei — Gitter, Zähl-Zeile und Blättern.
//
// **An der Stelle der Ergebnis-Tabelle, in jeder befüllten Ansicht** (F2 A):
// Die Befüllung der Abfrage-Blöcke (`query/frontmatter-query-view.js`) läuft in
// Lese-Ansicht, geteilter Ansicht und Live-Widget gleich; sie reicht die
// Auskunft des Kanals `database:liste` an der Antwort mit, und dieses Modul
// zeichnet daraus das Gitter. Keine neue Darstellungsform und keine eigene
// Seite: Die Datei bleibt ein Dokument mit Beschreibung über und unter der
// Liste.
//
// **Die Zeilen sind die der Ergebnismenge**, je Zeile mit ihrer Herkunft. Jede
// Zeile trägt deshalb die Angaben des Datensatz-Klicks (`record-hit-click.js`)
// und, wenn die Abfrage-Datei mit `form` eine Maske nennt, deren Pfad; der Klick
// öffnet dann diese Maske statt der Standard-Maske (F1 A, Story AK3). Den Klick
// selbst übernehmen wie bisher die zentralen Klick-Handler beider Ansichten.
//
// **Bearbeitbar ist eine Spalte, die genau ein Feld nennt** (S2); welches,
// sagt der Haupt-Prozess je Spalte, weil nur er die Definition kennt. Die
// Klassen der Spalten tragen die Zuordnung, und die Zeilen-Bearbeitung setzt an
// ihnen an (4T-002250).
//
// **Geblättert wird über die vollständige Menge im Anzeige-Prozess** (F3 A,
// S5), fest 50 Zeilen je Seite. `LIMIT` der Abfrage begrenzt wie bisher die
// Menge, nicht die Seite. Ein Blättern zeichnet allein Zähl-Zeile, Gitter und
// Schaltflächen der einen Liste neu, nicht die übrige Seite. Füllt die Befüllung
// denselben Block neu, etwa weil der Index des Bereichs sich geändert hat,
// bleibt die Seite stehen: Der Aufrufer liest sie vorher ab (`listenSeite`) und
// gibt sie mit. Ohne das spränge die Liste bei jeder Änderung irgendwo im
// Bereich auf die erste Seite zurück, am Ablauf-Fall gemessen binnen einer
// halben Sekunde nach dem Öffnen.
//
// **Lesend bleibt eine Liste, deren Zeilen keine Datensätze sind, die gruppiert
// ist oder eine Darstellungsform wählt** (S2): Eine Gruppe hat keine Herkunft,
// und eine gewählte Form zeichnet ihre eigene Gestalt. Dann entsteht kein
// Gitter, sondern ein Hinweis, und der Aufrufer zeichnet die Ausgabe wie
// bisher darunter.
//
// 4T-002250 (Epic 3E-000262, F4 A, S3, S5): **Zeilen ändern.** Erlaubt die
// Abfrage-Datei den Handgriff `update` (`allow`, ohne Angabe der Fall), trägt
// das Gitter am Zeilen-Ende eine Aktions-Spalte; jede änderbare Zeile schließt
// die Zeilen-Bearbeitung an (`listen-zeile.js`), die der Aufrufer als Naht
// hereinreicht. Eine Zeile, deren Datensatz nach `editable` der Definition
// nicht änderbar ist (`nichtAenderbar` der Auskunft), bleibt lesend: ohne
// «Bearbeiten», ohne Doppelklick, gedämpft und mit Titel. Solange eine Zeile
// bearbeitet wird, sperrt `sperreBlaettern` Vor, Zurück und «Bearbeiten» der
// übrigen Zeilen (S5); die Sperre gilt je Liste und überdauert kein Neuzeichnen.
//
// 4T-002251 (Epic 3E-000262, F1 A): **Anlegen und Löschen.** Mit `create` in
// `allow` trägt die Zähl-Zeile die Schaltfläche «Neue Zeile», die eine
// Neuanlage über die Zeilen-Naht eröffnet (`beginneNeu`); mit `delete` trägt
// jede änderbare Zeile «Löschen». Ohne `update` fehlen «Bearbeiten» und der
// Doppelklick, «Löschen» bleibt. Die Aktions-Spalte steht, sobald einer der drei
// Handgriffe erlaubt ist, weil auch die neue Zeile «Speichern» und «Abbrechen»
// braucht. `sperreBlaettern` sperrt «Neue Zeile» und «Löschen» mit.
//
// Bewusst nur der Darstellungs-Kern, die beiden Bau-Helfer der Ergebnis-Tabelle
// und die Übersetzung als Importe, keine Module mit Preload-Bezug, damit der
// jsdom-Unit-Test ohne Brücke läuft. Die Zeilen-Bearbeitung kommt deshalb als
// Naht und nicht als Import.

import { t } from '../../i18n.js';
import { columnHeader, cellSegments, displayName } from '../../../shared/query/result-display.js';
import { appendSegments } from '../query/display-list-table.js';
import { markRecordHit } from '../query/record-hit-click.js';

/** Zeilen je Seite (F3 A): fest, ohne Angabe in der Datei und ohne Einstellung. */
export const LIST_SEITE = 50;

/** Klasse einer Liste, die lesend bleibt und nur ihren Hinweis trägt. */
export const LIST_LESEND_KLASSE = 'db-list-lesend';

// Seiten-Stand je Liste. WeakMap, damit eine ersetzte Liste von selbst aus der
// Buchführung fällt.
const SEITEN = new WeakMap();
// 4T-002250: die Zeilen-Bearbeitung je Liste, für das Neuzeichnen beim Blättern.
const ZEILEN = new WeakMap();

// 4T-002250, 4T-002251: Welche Handgriffe bietet die Liste an? Nur mit
// Zeilen-Naht und je Handgriff mit seinem Eintrag in `allow`; die Angabe ohne
// `allow` hat der Haupt-Prozess bereits zu `update` ausgelegt.
//
// 4T-002311 (E12.4): angeboten wird der Schnitt aus `allow` und der
// Erlaubnis-Menge der eigenen Rolle (`rechte` der Auskunft). Fehlt die Menge
// oder ist sie null, gilt wie ohne Rollen allein `allow`; geschützt wird an der
// Schreib-Schnittstelle. `rolleOhneAendern` meldet, dass `allow` das Ändern
// erlaubt, die Rolle aber nicht: Die Zeilen bleiben dann lesend wie nach
// `editable` und nennen im Titel die Rolle.
function handgriffe(liste, zeile) {
  const naht = !!zeile && typeof zeile.anschliessen === 'function';
  const allow =
    liste && liste.angaben && Array.isArray(liste.angaben.allow) ? liste.angaben.allow : [];
  const rolle = liste && liste.rechte && typeof liste.rechte === 'object' ? liste.rechte : null;
  const rolleDarf = (wort) => !rolle || rolle[wort] === true;
  const darf = (wort) => naht && allow.includes(wort) && rolleDarf(wort);
  const rechte = { anlegen: darf('create'), aendern: darf('update'), loeschen: darf('delete') };
  rechte.anlegen = rechte.anlegen && typeof zeile.beginneNeu === 'function';
  rechte.spalte = rechte.anlegen || rechte.aendern || rechte.loeschen;
  rechte.rolleOhneAendern = naht && allow.includes('update') && !rolleDarf('update');
  return rechte;
}

// 4T-002311 (Story AK4): Eine Zeile, deren Ändern die Rolle verwehrt, nennt
// Rolle und Tabelle im Titel; gedämpft ist sie, wenn ihr kein Handgriff bleibt.
function rolleLesend(tr, liste, translate, rechte) {
  const rolle = typeof liste.rolle === 'string' && liste.rolle !== '' ? liste.rolle : '—';
  const tabelle = (liste.tabelle && liste.tabelle.name) || '';
  tr.title = translate('database.list.rolleKeinUpdate')
    .replace('{rolle}', () => rolle)
    .replace('{tabelle}', () => tabelle);
  if (!rechte.loeschen) tr.classList.add('db-list-row-readonly');
}

// Die Aktions-Zelle einer Zeile: «Bearbeiten» und «Löschen» über die
// Zeilen-Naht, je nach Handgriffen, oder bei einem nicht änderbaren Datensatz
// leer, mit gedämpfter Zeile und Titel.
function aktionsZelle(tr, origin, liste, zeile, nichtAenderbar, translate, rechte) {
  const td = document.createElement('td');
  td.className = 'db-list-actions db-list-col-readonly';
  tr.appendChild(td);
  if (nichtAenderbar.has(origin.id)) {
    tr.classList.add('db-list-row-readonly');
    tr.title = translate('database.list.rowNotEditable');
    return;
  }
  const tabellenPfad = origin.path || (liste.tabelle && liste.tabelle.path) || '';
  if (!tabellenPfad || !origin.id || !(rechte.aendern || rechte.loeschen)) return;
  zeile.anschliessen(tr, {
    tabellenPfad,
    kennung: origin.id,
    aktionen: td,
    aendern: rechte.aendern,
    loeschen: rechte.loeschen,
  });
}

// Warum eine Liste lesend bleibt, als Schlüssel des Hinweises, oder null.
function lesendGrund(rs) {
  if (!rs || rs.scope !== 'records') return 'database.list.readonly.keineDatensaetze';
  if (Array.isArray(rs.groups)) return 'database.list.readonly.gruppiert';
  if (rs.wishes && rs.wishes.display) return 'database.list.readonly.darstellungsform';
  return null;
}

// Das Feld je Spalte aus der Auskunft des Kanals; eine fehlende oder fremde
// Angabe gilt als lesend, nie als bearbeitbar.
function felderJeSpalte(liste, anzahl) {
  const felder = new Array(anzahl).fill(null);
  const spalten = liste && Array.isArray(liste.spalten) ? liste.spalten : [];
  for (const spalte of spalten) {
    if (!spalte || !Number.isInteger(spalte.index)) continue;
    if (spalte.index < 0 || spalte.index >= anzahl) continue;
    felder[spalte.index] = typeof spalte.feld === 'string' && spalte.feld ? spalte.feld : null;
  }
  return felder;
}

// Klasse und Feld-Angabe einer Zelle oder Überschrift nach ihrer Spalte.
function markiereSpalte(el, feld) {
  if (feld) {
    el.classList.add('db-list-col-field');
    el.dataset.dbListField = feld;
  } else {
    el.classList.add('db-list-col-readonly');
  }
}

function zaehlZeile(gesamt, von, anzahl, translate) {
  const div = document.createElement('div');
  div.className = 'db-list-count';
  div.textContent =
    gesamt === 0
      ? translate('database.list.empty')
      : translate('database.list.count')
          .replace('{von}', String(von + 1))
          .replace('{bis}', String(von + anzahl))
          .replace('{gesamt}', String(gesamt));
  return div;
}

// Das Gitter der Zeilen einer Seite. Vorn die Spalte des Datensatzes mit
// seinem Anzeige-Namen, wie in der Ergebnis-Tabelle und mit derselben
// Überschrift; der Wunsch `WITHOUT ID` blendet sie aus. Sie ist Text und kein
// Link, weil der Klick der ganzen Zeile gilt: Ein eigener Treffer-Link in ihr
// öffnete die Standard-Maske, auch wenn die Datei eine andere nennt.
function gitter(rs, liste, zeilen, translate, zeile, rechte) {
  const ohneKennung = !!(rs.wishes && rs.wishes.withoutId);
  const felder = felderJeSpalte(liste, rs.columns.length);
  const maske = liste && typeof liste.maske === 'string' && liste.maske ? liste.maske : null;
  const nichtAenderbar = new Set(
    liste && Array.isArray(liste.nichtAenderbar) ? liste.nichtAenderbar : [],
  );
  const table = document.createElement('table');
  table.className = 'db-overview-table db-list-table';

  const thead = document.createElement('thead');
  const kopf = document.createElement('tr');
  if (!ohneKennung) {
    const th = document.createElement('th');
    th.className = 'db-list-col-record db-list-col-readonly';
    th.textContent = translate('query.table.recordColumn');
    kopf.appendChild(th);
  }
  rs.columns.forEach((column, j) => {
    const th = document.createElement('th');
    th.textContent = columnHeader(column);
    markiereSpalte(th, felder[j]);
    kopf.appendChild(th);
  });
  if (rechte.spalte) {
    const th = document.createElement('th');
    th.className = 'db-list-col-actions db-list-col-readonly';
    th.setAttribute('aria-label', translate('database.list.actions'));
    kopf.appendChild(th);
  }
  thead.appendChild(kopf);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of zeilen) {
    const origin = (row && row.origin) || {};
    const tr = document.createElement('tr');
    tr.className = 'db-list-row';
    markRecordHit(tr, { path: origin.path, table: origin.table, id: origin.id });
    if (maske) tr.dataset.fmRecordMaske = maske;
    if (!ohneKennung) {
      const td = document.createElement('td');
      td.className = 'db-list-col-record db-list-col-readonly';
      td.textContent = displayName(origin);
      tr.appendChild(td);
    }
    rs.columns.forEach((_, j) => {
      const td = document.createElement('td');
      markiereSpalte(td, felder[j]);
      const value = Array.isArray(row.values) ? row.values[j] : null;
      appendSegments(td, cellSegments(value === undefined ? null : value));
      tr.appendChild(td);
    });
    if (rechte.spalte) aktionsZelle(tr, origin, liste, zeile, nichtAenderbar, translate, rechte);
    if (rechte.rolleOhneAendern) rolleLesend(tr, liste, translate, rechte);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// 4T-002251 (Festlegung 2): die Zähl-Zeile mit «Neue Zeile». `mousedown` hält
// die Auswahl des Browsers auf wie beim Blättern; die Zähl-Zeile selbst bleibt
// ein eigenes Element mit allein ihrem Text.
function neuLeiste(container, liste, zaehlung, translate, zeile) {
  const leiste = document.createElement('div');
  leiste.className = 'db-list-countbar';
  leiste.addEventListener('mousedown', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
  });
  const tabellenPfad = (liste.tabelle && liste.tabelle.path) || '';
  const neu = schaltflaeche('db-list-new', translate('database.list.new'), false, (event) => {
    event.preventDefault();
    void zeile.beginneNeu(container, { tabellenPfad });
  });
  leiste.append(zaehlung, neu);
  return leiste;
}

function schaltflaeche(klasse, text, gesperrt, beiKlick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = klasse;
  button.textContent = text;
  button.disabled = gesperrt;
  // 4T-002250: was die Seite sperrt, bleibt nach der Sperre einer Bearbeitung gesperrt.
  if (gesperrt) button.dataset.dbListSeiteAus = '1';
  button.addEventListener('click', beiKlick);
  return button;
}

// Vor und Zurück. `mousedown` hält allein die Auswahl des Browsers auf: Im
// Live-Widget setzte sie sonst die Schreibmarke in den Block und klappte ihn
// zum Quelltext auf, bevor der Klick ankommt (Muster der Datentabellen-Verweise
// in `live/live-interaction.js`). Geblättert wird auf `click`, damit die
// Eingabetaste auf einer fokussierten Schaltfläche denselben Weg nimmt; der
// Fokus kehrt danach an die gleichnamige Schaltfläche der neuen Seite zurück.
function navigation(container, rs, liste, translate, seite, seiten) {
  const nav = document.createElement('div');
  nav.className = 'db-list-nav';
  nav.addEventListener('mousedown', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
  });
  const blaettere = (ziel, klasse) => (event) => {
    event.preventDefault();
    const hatteFokus = event.currentTarget === document.activeElement;
    zeichneListenGitter(container, rs, liste, translate, ziel, ZEILEN.get(container));
    const nachher = container.querySelector(`.${klasse}`);
    if (hatteFokus && nachher && !nachher.disabled) nachher.focus();
  };
  nav.appendChild(
    schaltflaeche(
      'db-list-prev',
      translate('database.list.prev'),
      seite === 0,
      blaettere(seite - 1, 'db-list-prev'),
    ),
  );
  nav.appendChild(
    schaltflaeche(
      'db-list-next',
      translate('database.list.next'),
      seite >= seiten - 1,
      blaettere(seite + 1, 'db-list-next'),
    ),
  );
  return nav;
}

/**
 * Zeichnet Zähl-Zeile, Gitter und Blättern einer Seite in den Container der
 * Liste, an Stelle dessen, was er bisher trug. Eine Seite außerhalb der Menge
 * wird auf die nächste gültige gezogen. Den Stand merkt sich das Modul je
 * Container.
 *
 * @param {HTMLElement} container Das Element `div.db-list` der Liste.
 * @param {import('../../../shared/query/result-set.js').ResultSet} rs
 * @param {object} liste Auskunft des Kanals `database:liste`.
 * @param {(key: string) => string} translate
 * @param {number} seite Die Seite, ab 0 gezählt.
 * @param {object} [zeile] Die Zeilen-Bearbeitung (4T-002250, `listen-zeile.js`);
 *   ohne sie bleibt das Gitter lesend.
 * @returns {HTMLElement} Der Container.
 */
export function zeichneListenGitter(container, rs, liste, translate, seite, zeile = null) {
  const tr = typeof translate === 'function' ? translate : t;
  const gesamt = rs.rows.length;
  const seiten = Math.max(1, Math.ceil(gesamt / LIST_SEITE));
  const ganz = Number.isInteger(seite) ? seite : 0;
  const aktuell = Math.min(Math.max(0, ganz), seiten - 1);
  SEITEN.set(container, aktuell);
  if (zeile) ZEILEN.set(container, zeile);
  const von = aktuell * LIST_SEITE;
  const zeilen = rs.rows.slice(von, von + LIST_SEITE);
  const rechte = handgriffe(liste, zeile);
  container.textContent = '';
  const zaehlung = zaehlZeile(gesamt, von, zeilen.length, tr);
  container.appendChild(
    rechte.anlegen ? neuLeiste(container, liste, zaehlung, tr, zeile) : zaehlung,
  );
  container.appendChild(gitter(rs, liste, zeilen, tr, zeile, rechte));
  if (gesamt > LIST_SEITE) {
    container.appendChild(navigation(container, rs, liste, tr, aktuell, seiten));
  }
  return container;
}

/**
 * Die gezeigte Seite einer Liste, ab 0 gezählt (Prüffälle und Fehlersuche).
 *
 * @param {HTMLElement} container
 * @returns {number}
 */
export function listenSeite(container) {
  return SEITEN.get(container) ?? 0;
}

/**
 * Sperrt Vor, Zurück und «Bearbeiten» einer Liste, solange eine ihrer Zeilen
 * bearbeitet wird, oder gibt sie frei (4T-002250, S5); seit 4T-002251 ebenso
 * «Neue Zeile» und «Löschen». Beim Freigeben bleibt
 * gesperrt, was die Seite selbst sperrt (Zurück auf der ersten, Vor auf der
 * letzten Seite).
 *
 * @param {HTMLElement} container Das Element `div.db-list`.
 * @param {boolean} aktiv
 */
export function sperreBlaettern(container, aktiv) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  container.classList.toggle('db-list-busy', !!aktiv);
  for (const button of container.querySelectorAll('.db-list-prev, .db-list-next')) {
    button.disabled = !!aktiv || button.dataset.dbListSeiteAus === '1';
  }
  for (const button of container.querySelectorAll('.db-list-edit, .db-list-delete, .db-list-new'))
    button.disabled = !!aktiv;
}

/**
 * Die Listen-Maske einer Ergebnismenge: das Gitter mit Zähl-Zeile und
 * Blättern, oder, wenn die Liste lesend bleibt, allein ihr Hinweis; dann trägt
 * das Element die Klasse `LIST_LESEND_KLASSE`, und der Aufrufer zeichnet die
 * Ausgabe wie bisher darunter.
 *
 * @param {import('../../../shared/query/result-set.js').ResultSet} rs
 * @param {object} liste Auskunft des Kanals `database:liste` mit `istListe`.
 * @param {(key: string) => string} [translate]
 * @param {number} [seite] Die Seite, ab 0 gezählt; die Seite einer zuvor
 *   gezeigten Liste desselben Blocks, sonst die erste.
 * @param {object} [zeile] Die Zeilen-Bearbeitung (4T-002250); ohne sie lesend.
 * @returns {HTMLDivElement} `div.db-list`
 */
export function zeichneListe(rs, liste, translate, seite = 0, zeile = null) {
  const tr = typeof translate === 'function' ? translate : t;
  const wurzel = document.createElement('div');
  wurzel.className = 'db-list';
  const grund = lesendGrund(rs);
  if (grund) {
    wurzel.classList.add(LIST_LESEND_KLASSE);
    const hinweis = document.createElement('div');
    hinweis.className = 'db-list-hint';
    hinweis.textContent = tr(grund);
    wurzel.appendChild(hinweis);
    return wurzel;
  }
  return zeichneListenGitter(wurzel, rs, liste, tr, seite, zeile);
}
