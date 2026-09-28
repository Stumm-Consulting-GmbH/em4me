// 4T-001955 (Epic 3E-000319): Der Dialog «Einstellungen dieser Tafel…».
//
// **Was er zeigt:** je Einstellung der Tafel, ob sie der Vorgabe folgt oder
// für diese Tafel gesetzt ist (Story 4S-000987, AK4 und AK5). Jeder Schalter
// hat drei Zustände — «wie Vorgabe (an/aus)», «an», «aus» —, wobei die Klammer
// den geltenden Vorgabe-Wert nennt; Archiv-Obergrenze, Zielordner, Vorlage und
// Feldwahl haben «wie Vorgabe» und einen eigenen Wert. Die Wahl selbst ist die
// Herkunfts-Anzeige: Wer «wie Vorgabe» sieht, sieht die Vorgabe.
//
// **Was er zurückgibt:** allein die geänderten Einstellungen, als Liste
// `{ name, wert }` — `wert` `null` heißt «wie Vorgabe» und entfernt den
// Schlüssel. Geschrieben wird nicht hier, sondern von der Einbettung über den
// konflikt-geschützten Schreibweg der Tafel (`kanban-pane.js`), als **eine**
// Transaktion und damit als ein Rückgängig-Schritt.
//
// **Warum ein eigenes Modul und ein dynamisch gebauter Dialog.** Die Modale des
// Bestands (`bookmark-modal` in `index.html`) sind feste Bäume mit festen
// Kennungen für feste Felder; dieser Dialog hat eine Zeile je Einstellung und
// eine Liste veränderlicher Länge (Feldwahl). Gebaut wird er deshalb zur
// Laufzeit, mit denselben Klassen und damit demselben Aussehen und
// Schließ-Verhalten (Escape, Hintergrund, Abbrechen). Ordner- und
// Vorlagen-Wahl kommen als Rückrufe herein: Beide hängen an der Prozess-Brücke
// bzw. am Fenster-Zustand, die dieser Ordner nicht importiert.
'use strict';

import { ARCHIV_UNBEGRENZT } from '../../../shared/kanban/kanban-einstellungen.js';

// Die vier Schalter in der Reihenfolge des Dialogs: erst die Anzeige, dann das
// Archiv, dann der Verweis des Datums.
const SCHALTER = Object.freeze([
  'tagsAmFuss',
  'termineRelativ',
  'archivMitZeitstempel',
  'datumZurTagesnotiz',
]);

const VORGABE = 'vorgabe';
const EIGEN = 'eigen';

function element(tag, klasse, text) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (text != null) el.textContent = text;
  return el;
}

function auswahl(id, optionen, wert) {
  const el = document.createElement('select');
  el.id = id;
  for (const [value, text] of optionen) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    el.appendChild(option);
  }
  el.value = wert;
  return el;
}

function zeile(t, schluessel, id, ...inhalt) {
  const el = element('div', 'settings-row kanban-einstellungen-zeile');
  el.dataset.einstellung = schluessel;
  const label = element('label', null, t(`kanban.einstellungen.${schluessel}`));
  label.htmlFor = id;
  el.append(label, ...inhalt);
  return el;
}

/**
 * Die Liste der geänderten Einstellungen: Stand des Dialogs gegen den Stand
 * der Tafel, je Einstellung verglichen über die JSON-Form.
 *
 * @param {object} vorher `werte` der Tafel (nur gesetzte Einstellungen).
 * @param {object} nachher je Einstellung der gewählte Wert, `null` = Vorgabe.
 * @returns {Array<{name: string, wert: *}>}
 */
export function geaenderteEinstellungen(vorher, nachher) {
  const liste = [];
  for (const [name, wert] of Object.entries(nachher)) {
    const alt = vorher && vorher[name] != null ? vorher[name] : null;
    if (JSON.stringify(alt) !== JSON.stringify(wert)) liste.push({ name, wert });
  }
  return liste;
}

/**
 * Zeigt den Dialog.
 *
 * @param {object} ctx
 * @param {Function} ctx.t Übersetzungs-Funktion.
 * @param {object} ctx.werte die Einstellungen der Tafel (`werte` aus
 *   `einstellungenAusModell`).
 * @param {object} ctx.vorgaben die Vorgaben je Einstellung, Ergebnis von
 *   `wirksameEinstellungen({}, globaleWerte)`.
 * @param {Function} [ctx.waehleOrdner] () => Promise<string|null>, der
 *   gespeicherte Pfad (relativ) oder null bei Abbruch.
 * @param {Function} [ctx.waehleVorlage] () => Promise<string|null>.
 * @returns {Promise<Array<{name: string, wert: *}>|null>} die geänderten
 *   Einstellungen, eine leere Liste, wenn nichts geändert wurde, oder null bei
 *   Abbruch.
 */
export function zeigeTafelEinstellungsDialog(ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;
  const werte = ctx.werte || {};
  const vorgaben = ctx.vorgaben || {};
  const anAus = (wert) => t(wert ? 'kanban.einstellungen.an' : 'kanban.einstellungen.aus');
  const wieVorgabe = (text) => t('kanban.einstellungen.wieVorgabe').replace('{wert}', text);

  const modal = element('div', 'bookmark-modal kanban-einstellungen-modal');
  const hintergrund = element('div', 'bookmark-modal-backdrop');
  const inhalt = element('div', 'bookmark-modal-content kanban-einstellungen-inhalt');
  inhalt.setAttribute('role', 'dialog');
  inhalt.setAttribute('aria-modal', 'true');
  inhalt.setAttribute('aria-labelledby', 'kanban-einstellungen-titel');
  const titel = element('h2', null, t('kanban.einstellungen.titel'));
  titel.id = 'kanban-einstellungen-titel';
  inhalt.append(titel, element('p', 'settings-hint', t('kanban.einstellungen.hinweis')));

  // Je Einstellung eine Funktion, die den gewählten Wert liefert (null = Vorgabe).
  const leser = {};

  for (const name of SCHALTER) {
    const id = `kanban-einstellung-${name}`;
    const vorgabe = vorgaben[name] ? vorgaben[name].wert === true : false;
    const stand = typeof werte[name] === 'boolean' ? (werte[name] ? 'an' : 'aus') : VORGABE;
    const el = auswahl(
      id,
      [
        [VORGABE, wieVorgabe(anAus(vorgabe))],
        ['an', anAus(true)],
        ['aus', anAus(false)],
      ],
      stand,
    );
    leser[name] = () => (el.value === VORGABE ? null : el.value === 'an');
    inhalt.appendChild(zeile(t, name, id, el));
  }

  // Archiv-Obergrenze: «wie Vorgabe (100)» oder eine eigene Zahl.
  {
    const id = 'kanban-einstellung-archivObergrenze';
    const vorgabe = vorgaben.archivObergrenze ? vorgaben.archivObergrenze.wert : null;
    const vorgabeText =
      Number.isSafeInteger(vorgabe) && vorgabe > 0
        ? String(vorgabe)
        : t('kanban.einstellungen.unbegrenzt');
    const eigen = Number.isSafeInteger(werte.archivObergrenze);
    const wahl = auswahl(
      id,
      [
        [VORGABE, wieVorgabe(vorgabeText)],
        [EIGEN, t('kanban.einstellungen.eigenerWert')],
      ],
      eigen ? EIGEN : VORGABE,
    );
    const zahl = document.createElement('input');
    zahl.type = 'number';
    zahl.step = '1';
    zahl.className = 'kanban-einstellungen-zahl';
    zahl.setAttribute('aria-label', t('kanban.einstellungen.archivObergrenze'));
    zahl.value = eigen ? String(werte.archivObergrenze) : String(vorgabe > 0 ? vorgabe : 100);
    const nachWahl = () => {
      zahl.disabled = wahl.value !== EIGEN;
    };
    wahl.addEventListener('change', nachWahl);
    nachWahl();
    leser.archivObergrenze = () => {
      if (wahl.value !== EIGEN) return null;
      const n = Number.parseInt(zahl.value, 10);
      if (Number.isNaN(n)) return null;
      // 0 und darunter heißt unbegrenzt; geschrieben wird der Wert, den das
      // Vorbild dafür kennt, damit der Block für beide Werkzeuge dasselbe sagt.
      return n > 0 ? n : ARCHIV_UNBEGRENZT;
    };
    inhalt.appendChild(zeile(t, 'archivObergrenze', id, wahl, zahl));
  }

  // Zielordner und Vorlage: «wie Vorgabe (…)» oder ein gewählter Wert.
  for (const [name, waehle] of [
    ['zielordner', ctx.waehleOrdner],
    ['vorlage', ctx.waehleVorlage],
  ]) {
    const id = `kanban-einstellung-${name}`;
    let eigenerWert = typeof werte[name] === 'string' ? werte[name] : '';
    const wahl = auswahl(
      id,
      [
        [VORGABE, wieVorgabe(t(`kanban.einstellungen.${name}Vorgabe`))],
        [EIGEN, t('kanban.einstellungen.eigenerWert')],
      ],
      eigenerWert ? EIGEN : VORGABE,
    );
    const anzeige = element('span', 'kanban-einstellungen-wert', eigenerWert);
    const knopf = element('button', 'btn', t(`kanban.einstellungen.${name}Waehlen`));
    knopf.type = 'button';
    knopf.dataset.aktion = `${name}-waehlen`;
    knopf.addEventListener('click', async () => {
      if (typeof waehle !== 'function') return;
      const gewaehlt = await waehle();
      if (typeof gewaehlt !== 'string' || gewaehlt === '') return;
      eigenerWert = gewaehlt;
      anzeige.textContent = gewaehlt;
      wahl.value = EIGEN;
    });
    leser[name] = () => (wahl.value === EIGEN && eigenerWert !== '' ? eigenerWert : null);
    inhalt.appendChild(zeile(t, name, id, wahl, anzeige, knopf));
  }

  // Feldwahl: eine Zeile je Kopf-Schlüssel mit optionalem Anzeige-Namen und
  // dem Kästchen «Namen verbergen». `enthaeltMarkdown` bleibt beim Lesen
  // erhalten und ist für neue Zeilen aus.
  {
    const id = 'kanban-einstellung-feldwahl';
    const vorhanden = Array.isArray(werte.feldwahl) ? werte.feldwahl : null;
    const wahl = auswahl(
      id,
      [
        [VORGABE, wieVorgabe(t('kanban.einstellungen.feldwahlVorgabe'))],
        [EIGEN, t('kanban.einstellungen.eigenerWert')],
      ],
      vorhanden ? EIGEN : VORGABE,
    );
    const liste = element('div', 'kanban-einstellungen-felder');
    const zeilen = [];
    const neueZeile = (feld = {}) => {
      const el = element('div', 'kanban-einstellungen-feld');
      const schluessel = document.createElement('input');
      schluessel.type = 'text';
      schluessel.dataset.teil = 'feld';
      schluessel.placeholder = t('kanban.einstellungen.feldSchluessel');
      schluessel.setAttribute('aria-label', t('kanban.einstellungen.feldSchluessel'));
      schluessel.value = feld.feld || '';
      const bezeichnung = document.createElement('input');
      bezeichnung.type = 'text';
      bezeichnung.dataset.teil = 'bezeichnung';
      bezeichnung.placeholder = t('kanban.einstellungen.feldBezeichnung');
      bezeichnung.setAttribute('aria-label', t('kanban.einstellungen.feldBezeichnung'));
      bezeichnung.value = feld.bezeichnung || '';
      const verbergen = document.createElement('input');
      verbergen.type = 'checkbox';
      verbergen.dataset.teil = 'verbergen';
      verbergen.checked = feld.bezeichnungVerbergen === true;
      const verbergenLabel = element('label', null);
      verbergenLabel.append(verbergen, ` ${t('kanban.einstellungen.feldVerbergen')}`);
      const entfernen = element('button', 'btn', t('kanban.einstellungen.feldEntfernen'));
      entfernen.type = 'button';
      entfernen.dataset.aktion = 'feld-entfernen';
      const eintrag = {
        el,
        schluessel,
        bezeichnung,
        verbergen,
        md: feld.enthaeltMarkdown === true,
      };
      entfernen.addEventListener('click', () => {
        zeilen.splice(zeilen.indexOf(eintrag), 1);
        el.remove();
      });
      el.append(schluessel, bezeichnung, verbergenLabel, entfernen);
      zeilen.push(eintrag);
      liste.appendChild(el);
    };
    for (const feld of vorhanden || []) neueZeile(feld);
    const hinzu = element('button', 'btn', t('kanban.einstellungen.feldHinzufuegen'));
    hinzu.type = 'button';
    hinzu.dataset.aktion = 'feld-hinzufuegen';
    hinzu.addEventListener('click', () => {
      neueZeile();
      wahl.value = EIGEN;
    });
    leser.feldwahl = () => {
      if (wahl.value !== EIGEN) return null;
      return zeilen
        .filter((z) => z.schluessel.value.trim() !== '')
        .map((z) => ({
          feld: z.schluessel.value.trim(),
          bezeichnung: z.bezeichnung.value,
          bezeichnungVerbergen: z.verbergen.checked,
          enthaeltMarkdown: z.md,
        }));
    };
    inhalt.appendChild(zeile(t, 'feldwahl', id, wahl));
    inhalt.append(liste, hinzu);
  }

  const knoepfe = element('div', 'bookmark-modal-buttons');
  const abbrechen = element('button', 'btn', t('dialog.cancel'));
  abbrechen.dataset.aktion = 'abbrechen';
  const uebernehmen = element('button', 'btn btn-primary', t('kanban.einstellungen.uebernehmen'));
  uebernehmen.dataset.aktion = 'uebernehmen';
  knoepfe.append(abbrechen, uebernehmen);
  inhalt.appendChild(knoepfe);
  modal.append(hintergrund, inhalt);

  return new Promise((resolve) => {
    const schliesse = (ergebnis) => {
      modal.removeEventListener('keydown', beiTaste, true);
      modal.remove();
      resolve(ergebnis);
    };
    const beiTaste = (ereignis) => {
      if (ereignis.key !== 'Escape') return;
      ereignis.preventDefault();
      ereignis.stopPropagation();
      schliesse(null);
    };
    abbrechen.addEventListener('click', () => schliesse(null));
    hintergrund.addEventListener('click', () => schliesse(null));
    uebernehmen.addEventListener('click', () => {
      const nachher = {};
      for (const [name, lies] of Object.entries(leser)) nachher[name] = lies();
      schliesse(geaenderteEinstellungen(werte, nachher));
    });
    modal.addEventListener('keydown', beiTaste, true);
    document.body.appendChild(modal);
    const erstes = inhalt.querySelector('select');
    if (erstes) setTimeout(() => erstes.focus(), 0);
  });
}
