// 4T-001940 (Epic 3E-000257, Bauplan B1, B4 bis B6): Speichern und Löschen aus
// der Einzel-Maske — der Auftrag an die Schreib-Schnittstelle und die Zuordnung
// ihres Ergebnisses zu Feld und Kopf.
//
// **Der Auftrag entsteht aus dem Zustand der Maske** (B4) und nirgends sonst:
// Anlegen nennt alle nicht leeren Felder, Ändern nur die geänderten und den
// zuletzt gelesenen Stand als Erwartung, Löschen allein Kennung und Erwartung.
// Ein Speichern ohne Änderung ergibt keinen Auftrag; die Schnittstelle bekäme
// sonst eine Anweisung ohne Wirkung, und ein Beleg ohne geändertes Feld weist
// das Format zu Recht ab.
//
// **Das Ergebnis wird zugeordnet, nicht gedeutet** (B5): Den Satz bildet
// `auftrag-text.js`; hier steht allein, wohin er gehört. Eine Lage mit Feld
// steht am Feld, eine Lage mit Feldern markiert alle und steht am Kopf, eine
// Lage ohne Feld der Maske steht am Kopf, und die Fremd-Änderung öffnet die
// Wahl zwischen «neu laden» und «erzwingen».
//
// **Ohne Import des Fenster-Zustands** (Muster `masken-felder.js`): Die
// Übersetzung kommt als Umgebung herein, damit das Modul in jsdom prüfbar
// bleibt; die DOM-Bausteine dieser Datei nehmen ihre Handlungen als Rückrufe.
//
// **Der Ablauf steht ebenfalls hier** (`erzeugeSpeicherAblauf`): Senden,
// Zuordnen, Rückfrage und Wahl arbeiten auf dem Zustands-Objekt der Seite, das
// sie hereingereicht bekommen, mit Kanal, Zeichnen und Statuszeile als
// Rückrufen. Die Seite bleibt damit in ihrem Größen-Budget und behält allein,
// was nach dem Ergebnis ihren Zustand setzt.
'use strict';

import { loeseErgebnisAuf } from '../../../shared/database/auftrag-text.js';
import { felderDesKoerpers } from '../../../shared/database/form-body.js';

export const ART_ANLEGEN = 'create';
export const ART_AENDERN = 'update';
export const ART_LOESCHEN = 'delete';

// Die Lage der Fremd-Änderung (`record-auftrag-pruefung.js`, LAGEN.standWeichtAb).
export const LAGE_FREMD = 'auftragStandWeichtAb';

function alsText(wert) {
  return typeof wert === 'string' ? wert : '';
}

/**
 * Baut den Auftrag der Maske (B4).
 *
 * @param {object} p
 * @param {'create'|'update'|'delete'} p.art Die Art der Anweisung.
 * @param {string} p.tabellenPfad Pfad der Tabellen-Datei.
 * @param {string|null} p.kennung Kennung des Datensatzes; beim Anlegen die
 *   beim Eröffnen gezogene.
 * @param {object|null} [p.entwurf] Feld-Name → Zell-Text der Bearbeitung.
 * @param {object|null} [p.erwartet] Feld-Name → Zell-Text des gelesenen Stands.
 * @param {Array<string>} [p.felderDesKoerpers] Die Feld-Namen der Maske.
 * @param {boolean} [p.erzwingen] Die Anweisung trotz Fremd-Änderung schreiben.
 * @returns {{anweisungen: Array<object>}|null} null, wenn es nichts zu
 *   schreiben gibt.
 */
export function baueAuftrag({
  art,
  tabellenPfad,
  kennung,
  entwurf = null,
  erwartet = null,
  felderDesKoerpers = [],
  erzwingen = false,
}) {
  const anweisung = { tabelle: tabellenPfad, art };
  if (typeof kennung === 'string' && kennung !== '') anweisung.id = kennung;
  const zuletzt = erwartet && typeof erwartet === 'object' ? erwartet : {};
  const namen = Array.isArray(felderDesKoerpers) ? felderDesKoerpers : [];
  const text = (name) => (entwurf ? entwurf[name] : undefined);

  if (art === ART_ANLEGEN) {
    const werte = {};
    for (const name of namen) {
      if (typeof text(name) === 'string' && text(name) !== '') werte[name] = text(name);
    }
    anweisung.werte = werte;
  } else if (art === ART_AENDERN) {
    const werte = {};
    for (const name of namen) {
      if (typeof text(name) !== 'string') continue;
      if (text(name) === alsText(zuletzt[name])) continue;
      // Ein geleertes Feld heißt «leeren» und reist als null (Vertrag der
      // Schnittstelle, `alsZellText`).
      werte[name] = text(name) === '' ? null : text(name);
    }
    if (Object.keys(werte).length === 0) return null;
    anweisung.werte = werte;
    anweisung.erwartet = { ...zuletzt };
  } else if (art === ART_LOESCHEN) {
    anweisung.erwartet = { ...zuletzt };
  } else {
    return null;
  }
  if (erzwingen === true) anweisung.erzwingen = true;
  return { anweisungen: [anweisung] };
}

/**
 * Derselbe Auftrag mit `erzwingen: true` an jeder Anweisung (B5).
 *
 * @param {{anweisungen: Array<object>}} auftrag
 * @returns {{anweisungen: Array<object>}}
 */
export function erzwungen(auftrag) {
  const anweisungen = auftrag && Array.isArray(auftrag.anweisungen) ? auftrag.anweisungen : [];
  return { anweisungen: anweisungen.map((a) => ({ ...a, erzwingen: true })) };
}

/**
 * Ordnet ein Ergebnis der Schnittstelle den Stellen der Maske zu (B5).
 *
 * @param {object} ergebnis Das Ergebnis des Kanals `database:auftrag`.
 * @param {object} umgebung `{ t, hat, sprache, rueckfallSprache, felder }`;
 *   `felder` sind die Feld-Namen der Maske in ihrer Reihenfolge.
 * @returns {{ok: boolean, amFeld: Object<string, Array<string>>,
 *   markiert: Array<string>, kopf: Array<string>, fremd: string|null,
 *   fokus: string|null}} `fremd` ist der Satz der Fremd-Änderung, wenn die
 *   Wahl zu öffnen ist; `fokus` das erste betroffene Feld in Masken-Reihenfolge.
 */
export function verarbeiteErgebnis(ergebnis, umgebung = {}) {
  const leer = { ok: false, amFeld: {}, markiert: [], kopf: [], fremd: null, fokus: null };
  if (ergebnis && ergebnis.ok === true) return { ...leer, ok: true };
  const t = typeof umgebung.t === 'function' ? umgebung.t : (key) => key;
  // Der Kanal weist fail-closed ohne Lage ab (kein Bereich, Tabelle außerhalb).
  if (ergebnis && ergebnis.status === 'unavailable')
    return { ...leer, kopf: [t('database.form.noAccess')] };

  const felder = Array.isArray(umgebung.felder) ? umgebung.felder : [];
  const bekannt = new Map(felder.map((name) => [name.toLowerCase(), name]));
  const anweisungen = ergebnis && Array.isArray(ergebnis.lagen) ? ergebnis.lagen : [];
  const positionen = new Set(anweisungen.map((l) => l && l.position).filter(Number.isInteger));
  const aufgeloest = loeseErgebnisAuf(ergebnis, {
    ...umgebung,
    t,
    mehrereAnweisungen: positionen.size > 1,
  });

  const amFeld = {};
  const markiert = new Set();
  const kopf = [];
  let fremd = null;
  for (const lage of aufgeloest) {
    if (lage.code === LAGE_FREMD) {
      fremd = fremd === null ? lage.text : `${fremd} ${lage.text}`;
      continue;
    }
    const feld = lage.feld ? bekannt.get(lage.feld.toLowerCase()) : undefined;
    if (feld) {
      (amFeld[feld] = amFeld[feld] || []).push(lage.text);
      continue;
    }
    for (const name of lage.felder || []) {
      const treffer = bekannt.get(String(name).toLowerCase());
      if (treffer) markiert.add(treffer);
    }
    kopf.push(lage.text);
  }
  const fokus =
    felder.find((name) => amFeld[name]) || felder.find((name) => markiert.has(name)) || null;
  return { ok: false, amFeld, markiert: [...markiert], kopf, fremd, fokus };
}

// --- DOM-Bausteine -----------------------------------------------------------------

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

function knopf(className, text, beiKlick) {
  const b = el('button', `db-form-btn ${className}`, text);
  b.type = 'button';
  b.addEventListener('click', beiKlick);
  return b;
}

/**
 * Trägt die Befunde an einem Feld-Element ein: Meldung am Meldungs-Platz und
 * Markierung (B5). Eine Meldung des Lesens am selben Feld bleibt davor stehen.
 *
 * @param {HTMLElement} element Das Element `.db-form-field`.
 * @param {object|null} befunde Das Ergebnis von `verarbeiteErgebnis`.
 */
export function markiereFeld(element, befunde) {
  if (!element || !befunde) return;
  const name = element.dataset.field;
  const saetze = befunde.amFeld[name] || [];
  if (saetze.length === 0 && !befunde.markiert.includes(name)) return;
  element.classList.add('db-form-marked', 'db-form-rejected');
  if (saetze.length === 0) return;
  const platz = element.querySelector('.db-form-message');
  if (!platz) return;
  const bisher = platz.textContent ? `${platz.textContent} ` : '';
  platz.textContent = `${bisher}${saetze.join(' ')}`;
  platz.setAttribute('role', 'alert');
}

/**
 * Die Liste der Befunde ohne Feld, als Element `.db-form-errors`, oder null.
 *
 * @param {object|null} befunde Das Ergebnis von `verarbeiteErgebnis`.
 * @returns {HTMLElement|null}
 */
export function baueKopfBefunde(befunde) {
  if (!befunde || befunde.kopf.length === 0) return null;
  const liste = el('ul', 'db-form-errors');
  liste.setAttribute('role', 'alert');
  for (const satz of befunde.kopf) liste.appendChild(el('li', 'db-form-error', satz));
  return liste;
}

/**
 * Der Wahl-Block der Fremd-Änderung (B5): «neu laden» oder «erzwingen».
 *
 * @param {object} p
 * @param {string} p.text Der Satz der Lage.
 * @param {Function} p.t Übersetzung.
 * @param {Function} p.neuLaden Rückruf «neu laden».
 * @param {Function} p.erzwingen Rückruf «erzwingen».
 * @returns {HTMLElement}
 */
export function baueFremdWahl({ text, t, neuLaden, erzwingen }) {
  const block = el('div', 'db-form-confirm db-form-stale');
  block.setAttribute('role', 'alert');
  block.appendChild(el('p', 'db-form-stale-title', t('database.form.staleTitle')));
  block.appendChild(el('p', 'db-form-confirm-text db-form-stale-text', text));
  const leiste = el('div', 'db-form-confirm-actions');
  leiste.appendChild(knopf('db-form-stale-reload', t('database.form.reload'), neuLaden));
  leiste.appendChild(knopf('db-form-stale-force', t('database.form.force'), erzwingen));
  block.appendChild(leiste);
  return block;
}

/**
 * Die Rückfrage vor dem Löschen (B6).
 *
 * @param {object} p
 * @param {Function} p.t Übersetzung.
 * @param {Function} p.ja Rückruf «Ja, löschen».
 * @param {Function} p.nein Rückruf «Nein».
 * @returns {HTMLElement}
 */
export function baueLoeschFrage({ t, ja, nein }) {
  const block = el('div', 'db-form-confirm db-form-confirm-delete');
  block.setAttribute('role', 'alert');
  block.appendChild(el('p', 'db-form-confirm-text', t('database.form.confirmDelete')));
  const leiste = el('div', 'db-form-confirm-actions');
  leiste.appendChild(knopf('db-form-delete-yes', t('database.form.yesDelete'), ja));
  leiste.appendChild(knopf('db-form-delete-no', t('database.form.no'), nein));
  block.appendChild(leiste);
  return block;
}

// --- Der Ablauf ----------------------------------------------------------------------

/**
 * Der Ablauf von Speichern und Löschen einer Maske (B4 bis B6).
 *
 * Er arbeitet auf dem Zustands-Objekt der Seite und setzt dort `befunde`
 * (Ergebnis von `verarbeiteErgebnis`), `auftrag` (der zuletzt abgewiesene, für
 * «erzwingen»), `loeschFrage`, `sendet` und `fokus`; `tabellenPfad`, `kennung`,
 * `neu`, `entwurf` und `daten` liest er.
 *
 * @param {object} n Nähte.
 * @param {object} n.seite Das Zustands-Objekt der Seite.
 * @param {(auftrag: object) => Promise<object>} n.sende Der Kanal `database:auftrag`.
 * @param {Function} n.t Übersetzung.
 * @param {Function} [n.hat] Gibt es einen Schlüssel?
 * @param {() => string|null} [n.sprache] Aktive Sprache.
 * @param {() => string} n.schluessel Der Gegenstand der Seite; ändert er sich
 *   während eines Auftrags, gilt dessen Ergebnis nicht mehr.
 * @param {Function} n.zeichne Die Seite neu zeichnen.
 * @param {(key: string) => void} n.hinweis Hinweis in der Statuszeile.
 * @param {(art: string) => void} n.gelungen Nach Erfolg.
 * @param {Function} n.neuLaden «Neu laden» bei einer Fremd-Änderung.
 * @param {Function} [n.loeschenAbgebrochen] «Nein» in der Lösch-Rückfrage
 *   (4T-001941: gibt die Sperre des Löschens frei).
 * @returns {{vergiss: Function, speichern: Function, fragLoeschen: Function,
 *   zeichneLage: Function, sende: Function}}
 */
export function erzeugeSpeicherAblauf(n) {
  const { seite, t } = n;
  // 4T-001943 (Bauplan B3): Die Felder der Maske sind die, die ihr Körper nennt.
  // Ein Feld, das eine Masken-Datei nicht nennt, bleibt im Auftrag unberührt,
  // und ein Befund an ihm steht am Kopf statt an einem Feld, das es nicht gibt.
  // Ohne Körper (ältere Antwort-Gestalt) gelten alle Felder der Definition.
  const felder = () => {
    const daten = seite.daten;
    if (daten && daten.koerper && Array.isArray(daten.koerper.segmente))
      return felderDesKoerpers(daten.koerper.segmente);
    return (daten && Array.isArray(daten.fields) ? daten.fields : []).map((f) => f.name);
  };

  function vergiss() {
    seite.befunde = null;
    seite.auftrag = null;
    seite.loeschFrage = false;
  }

  function auftragFuer(art) {
    return baueAuftrag({
      art,
      tabellenPfad: seite.tabellenPfad,
      kennung: seite.kennung,
      entwurf: seite.entwurf,
      erwartet: (seite.daten && seite.daten.erwartet) || {},
      felderDesKoerpers: felder(),
    });
  }

  async function sende(auftrag) {
    if (seite.sendet) return;
    const gegenstand = n.schluessel();
    seite.sendet = true;
    seite.loeschFrage = false;
    n.zeichne();
    let ergebnis;
    try {
      ergebnis = await n.sende(auftrag);
    } catch {
      ergebnis = null;
    }
    seite.sendet = false;
    // Inzwischen umgebunden: Das Ergebnis gehört nicht mehr zu dieser Anzeige.
    if (gegenstand !== n.schluessel()) return;
    if (ergebnis && ergebnis.ok === true) {
      vergiss();
      n.gelungen(auftrag.anweisungen[0].art);
      return;
    }
    // Die Eingabe bleibt stehen, der Modus auch (B5).
    seite.auftrag = auftrag;
    seite.befunde = verarbeiteErgebnis(ergebnis, {
      t,
      hat: n.hat,
      sprache: typeof n.sprache === 'function' ? n.sprache() : null,
      felder: felder(),
    });
    seite.fokus = seite.befunde.fokus;
    n.zeichne();
  }

  function speichern() {
    const auftrag = auftragFuer(seite.neu ? ART_ANLEGEN : ART_AENDERN);
    // Ohne Änderung kein Auftrag (B4); der Modus bleibt.
    if (auftrag === null) {
      n.hinweis('database.form.nothingChanged');
      return;
    }
    void sende(auftrag);
  }

  function fragLoeschen() {
    seite.befunde = null;
    seite.loeschFrage = true;
    n.zeichne();
  }

  // Rückfrage vor dem Löschen, Wahl bei Fremd-Änderung und die Befunde ohne
  // Feld, in dieser Reihenfolge unter dem Kopf.
  function zeichneLage(wurzel) {
    if (seite.loeschFrage) {
      const nein = () => {
        seite.loeschFrage = false;
        // 4T-001941 (B2): Die Sperre des Löschens endet mit der Rückfrage.
        if (typeof n.loeschenAbgebrochen === 'function') n.loeschenAbgebrochen();
        n.zeichne();
      };
      const ja = () => {
        const auftrag = auftragFuer(ART_LOESCHEN);
        if (auftrag) void sende(auftrag);
      };
      wurzel.appendChild(baueLoeschFrage({ t, ja, nein }));
    }
    const befunde = seite.befunde;
    if (befunde && befunde.fremd && seite.auftrag) {
      const auftrag = seite.auftrag;
      const neuLaden = () => {
        vergiss();
        n.neuLaden();
      };
      const erzwingen = () => void sende(erzwungen(auftrag));
      wurzel.appendChild(baueFremdWahl({ text: befunde.fremd, t, neuLaden, erzwingen }));
    }
    const kopf = baueKopfBefunde(befunde);
    if (kopf) wurzel.appendChild(kopf);
  }

  return { vergiss, speichern, fragLoeschen, zeichneLage, sende };
}
