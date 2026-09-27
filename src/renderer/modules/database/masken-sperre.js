// 4T-001941 (Epic 3E-000257, Bauplan B2 bis B4): Die Sperre in der Einzel-Maske —
// nehmen beim Beginn der Bearbeitung, freigeben an ihrem Ende und im Konflikt
// die Erklärung mit den angebotenen Wegen.
//
// **Wann gesperrt ist, folgt einer einzigen Regel:** Eine Sperre steht genau
// dann, wenn die Maske einen bestehenden Datensatz bearbeitet oder die
// Lösch-Rückfrage offen ist. Lesen und Neuanlage nehmen keine (E9.2); eine
// Neuanlage hat vor dem ersten Speichern keinen Datensatz, den ein anderer
// bearbeiten könnte, und ihr Auftrag sperrt selbst.
//
// **Die Wege kommen aus der Sperr-Verwaltung und werden nicht nachgerechnet**
// (B3): «Nur lesen» steht immer da, «Sperre brechen» nur, wenn `konflikt.wege`
// ihn anbietet. Ein Bruch trägt den Stand der angezeigten Sperre; hat sie sich
// inzwischen geändert, weist die Verwaltung ab, und der Block zeigt den Grund
// und die frisch gelesenen Angaben.
//
// **Ohne Import des Fenster-Zustands** (Muster `masken-speichern.js`): Kanal,
// Übersetzung, Zeit-Formatierung, Zeichnen und Statuszeile kommen als Nähte
// herein, damit das Modul in jsdom prüfbar bleibt.
'use strict';

export const ZWECK_BEARBEITEN = 'bearbeiten';
export const ZWECK_LOESCHEN = 'loeschen';

const WEG_BRECHEN = 'brechen';
const ART_LOESCHEN = 'delete';
const STUNDE_MS = 60 * 60 * 1000;

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

function setze(text, werte) {
  let satz = String(text);
  for (const [name, wert] of Object.entries(werte)) satz = satz.split(`{${name}}`).join(wert);
  return satz;
}

/**
 * Die Frist der Sperr-Verwaltung als Text in Stunden (B4).
 *
 * @param {number|null|undefined} fristMs Frist in Millisekunden.
 * @param {Function} t Übersetzung.
 * @returns {string}
 */
export function fristText(fristMs, t) {
  const stunden = Number.isFinite(fristMs) && fristMs > 0 ? fristMs / STUNDE_MS : null;
  const anzahl = stunden === null ? '?' : String(Math.round(stunden * 10) / 10);
  return setze(t('database.sperre.stunden'), { anzahl });
}

/**
 * Die Art des Konflikt-Blocks: fremder Halter, Halter unbekannt, eigenes
 * Fenster oder ein Fehlschlag ohne Konflikt-Auskunft.
 *
 * @param {object|null} antwort Die Antwort des Kanals.
 * @returns {'fremd'|'unbekannt'|'eigenesFenster'|'fehler'}
 */
export function konfliktArt(antwort) {
  const k = antwort && antwort.status === 'ready' ? antwort.konflikt : null;
  if (!k) return 'fehler';
  if (k.eigenerProzess === true) return 'eigenesFenster';
  if (k.halterUnbekannt === true) return 'unbekannt';
  return 'fremd';
}

/**
 * Der Konflikt-Block `.db-form-lock` (B3, B4).
 *
 * @param {object} p
 * @param {object|null} p.antwort Die Antwort des Kanals (Nahme oder Bruch).
 * @param {string|null} [p.grund] Code eines abgewiesenen Bruchs oder Fehlschlags.
 * @param {Function} p.t Übersetzung.
 * @param {Function} [p.hat] Gibt es einen Schlüssel?
 * @param {(iso: string) => string} p.zeitpunkt Zeit-Formatierung der Oberfläche.
 * @param {Function} p.lesen Rückruf «Nur lesen».
 * @param {Function} p.brechen Rückruf «Sperre brechen».
 * @returns {HTMLElement}
 */
export function baueKonfliktBlock({ antwort, grund = null, t, hat, zeitpunkt, lesen, brechen }) {
  const art = konfliktArt(antwort);
  const k = art === 'fehler' ? null : antwort.konflikt;
  const block = el('div', 'db-form-confirm db-form-lock');
  block.setAttribute('role', 'alert');
  block.dataset.lockKind = art;
  block.appendChild(el('p', 'db-form-lock-title', t('database.sperre.title')));

  const unbekannt = t('database.sperre.unbekannt');
  let text;
  if (art === 'fehler') {
    text =
      antwort && antwort.status === 'unavailable'
        ? t('database.form.noAccess')
        : t('database.sperre.fehler');
  } else if (art === 'eigenesFenster') {
    text = t('database.sperre.eigenesFenster');
  } else if (art === 'unbekannt') {
    text = setze(t('database.sperre.halterUnbekannt'), {
      frist: fristText(antwort.fristMs, t),
    });
  } else {
    text = setze(t('database.sperre.belegt'), {
      benutzer: k.benutzer || unbekannt,
      rechner: k.rechner || unbekannt,
      zeitpunkt: k.zeitpunkt ? zeitpunkt(k.zeitpunkt) : unbekannt,
    });
  }
  block.appendChild(el('p', 'db-form-confirm-text db-form-lock-text', text));

  const bietetBruch = !!k && Array.isArray(k.wege) && k.wege.includes(WEG_BRECHEN);
  // Die Frist steht beim Halter unbekannt schon im Satz; bei einem bekannten
  // Halter erklärt dieser Satz, warum der Bruch angeboten ist.
  if (bietetBruch && art === 'fremd') {
    const frist = fristText(antwort.fristMs, t);
    block.appendChild(
      el('p', 'db-form-lock-expired', setze(t('database.sperre.abgelaufen'), { frist })),
    );
  }
  const grundKey = grund ? `database.sperre.bruch.${grund}` : null;
  if (grundKey && (typeof hat !== 'function' || hat(grundKey))) {
    const zeile = el('p', 'db-form-lock-reason', t(grundKey));
    zeile.dataset.lockReason = grund;
    block.appendChild(zeile);
  }

  const leiste = el('div', 'db-form-confirm-actions');
  leiste.appendChild(knopf('db-form-lock-read', t('database.sperre.lesen'), lesen));
  if (bietetBruch) {
    leiste.appendChild(knopf('db-form-lock-break', t('database.sperre.brechen'), brechen));
  }
  block.appendChild(leiste);
  return block;
}

/**
 * Der Sperr-Ablauf einer Maske (B2 bis B4).
 *
 * Er arbeitet auf dem Zustands-Objekt der Seite und setzt dort `sperre` (die
 * gehaltene Sperre: Tabelle, Kennung, Stand) und `sperrKonflikt` (Antwort,
 * Zweck und Grund des angezeigten Konflikts); `tabellenPfad`, `kennung` und
 * `neu` liest er.
 *
 * @param {object} n Nähte.
 * @param {object} n.seite Das Zustands-Objekt der Seite.
 * @param {(params: object) => Promise<object>} n.sende Der Kanal `database:sperre`.
 * @param {Function} n.t Übersetzung.
 * @param {Function} [n.hat] Gibt es einen Schlüssel?
 * @param {(iso: string) => string} n.zeitpunkt Zeit-Formatierung der Oberfläche.
 * @param {() => string} n.schluessel Der Gegenstand der Seite.
 * @param {Function} n.zeichne Die Seite neu zeichnen.
 * @param {(key: string) => void} n.hinweis Hinweis in der Statuszeile.
 * @param {{bearbeiten: Function, loeschen: Function}} n.weiter Was nach
 *   gehaltener Sperre je Zweck geschieht.
 * @returns {object}
 */
export function erzeugeSperrAblauf(n) {
  const { seite, t } = n;
  let laeuft = false;

  async function rufe(params) {
    try {
      return await n.sende(params);
    } catch {
      return null;
    }
  }

  function weiter(zweck) {
    if (zweck === ZWECK_LOESCHEN) n.weiter.loeschen();
    else n.weiter.bearbeiten();
  }

  function halte(antwort) {
    seite.sperre = {
      tabellenPfad: seite.tabellenPfad,
      kennung: seite.kennung,
      stand: antwort.stand,
    };
    seite.sperrKonflikt = null;
  }

  /**
   * Nimmt die Sperre für einen Zweck und fährt danach fort, oder zeigt den
   * Konflikt. Eine Neuanlage fährt ohne Sperre fort.
   *
   * @param {'bearbeiten'|'loeschen'} zweck
   * @returns {Promise<void>}
   */
  async function nehmen(zweck) {
    if (laeuft) return;
    if (seite.neu || !seite.kennung) {
      weiter(zweck);
      return;
    }
    if (seite.sperre) {
      weiter(zweck);
      return;
    }
    const gegenstand = n.schluessel();
    const ziel = { tabellenPfad: seite.tabellenPfad, kennung: seite.kennung };
    laeuft = true;
    const antwort = await rufe({
      aktion: 'nehmen',
      tabelle: ziel.tabellenPfad,
      kennung: ziel.kennung,
    });
    laeuft = false;
    // Inzwischen umgebunden: Die Antwort gehört nicht mehr zu dieser Anzeige.
    // Eine eben genommene Sperre wird zurückgegeben, statt liegen zu bleiben.
    if (gegenstand !== n.schluessel()) {
      if (antwort && antwort.gehalten === true) void freigebenFuer(ziel);
      return;
    }
    if (antwort && antwort.status === 'ready' && antwort.gehalten === true) {
      halte(antwort);
      weiter(zweck);
      return;
    }
    seite.sperrKonflikt = { antwort, zweck, grund: antwort && antwort.code ? antwort.code : null };
    n.zeichne();
  }

  async function freigebenFuer(sperre, { nachSchreiben = false } = {}) {
    if (!sperre) return;
    const antwort = await rufe({
      aktion: 'freigeben',
      tabelle: sperre.tabellenPfad,
      kennung: sperre.kennung,
    });
    if (nachSchreiben && antwort && antwort.verloren === true)
      n.hinweis('database.sperre.verloren');
  }

  /**
   * Gibt die gehaltene Sperre frei, sofern eine steht. Mehrfaches Rufen ist
   * folgenlos: Der Zustand wird vor dem Kanal-Aufruf geleert.
   *
   * @param {{nachSchreiben?: boolean}} [optionen] Nach einem gelungenen
   *   Speichern oder Löschen meldet ein Verlust der Sperre einen Hinweis.
   * @returns {Promise<void>}
   */
  function freigeben(optionen) {
    const sperre = seite.sperre;
    seite.sperre = null;
    return freigebenFuer(sperre, optionen);
  }

  /**
   * Nach dem Ergebnis eines Auftrags (B2): Gelungen gibt frei; ein abgewiesenes
   * Löschen gibt ebenfalls frei, weil die Maske dabei im Lesen bleibt. Ein
   * abgewiesenes Speichern behält die Sperre, denn die Bearbeitung läuft weiter.
   * Freigegeben wird nur die Sperre des Datensatzes, dem der Auftrag galt.
   *
   * @param {{anweisungen: Array<object>}} auftrag
   * @param {object|null} ergebnis
   * @returns {Promise<void>}
   */
  async function nachAuftrag(auftrag, ergebnis) {
    const anweisung = auftrag && Array.isArray(auftrag.anweisungen) ? auftrag.anweisungen[0] : null;
    const sperre = seite.sperre;
    if (!anweisung || !sperre) return;
    if (anweisung.tabelle !== sperre.tabellenPfad || anweisung.id !== sperre.kennung) return;
    const gelungen = !!(ergebnis && ergebnis.ok === true);
    if (!gelungen && anweisung.art !== ART_LOESCHEN) return;
    await freigeben({ nachSchreiben: gelungen });
  }

  /**
   * Schickt einen Auftrag und gibt danach nach `nachAuftrag` frei, bevor das
   * Ergebnis an den Speicher-Ablauf zurückgeht. Ein geworfener Kanal-Aufruf
   * zählt als Ergebnis null.
   *
   * @param {{anweisungen: Array<object>}} auftrag
   * @param {(auftrag: object) => Promise<object>} senden Der Kanal `database:auftrag`.
   * @returns {Promise<object|null>}
   */
  async function sendeAuftrag(auftrag, senden) {
    let ergebnis;
    try {
      ergebnis = await senden(auftrag);
    } catch {
      ergebnis = null;
    }
    await nachAuftrag(auftrag, ergebnis);
    return ergebnis;
  }

  async function brechen() {
    const offen = seite.sperrKonflikt;
    if (laeuft || !offen || !offen.antwort) return;
    const gegenstand = n.schluessel();
    const ziel = { tabellenPfad: seite.tabellenPfad, kennung: seite.kennung };
    laeuft = true;
    const antwort = await rufe({
      aktion: 'brechen',
      tabelle: ziel.tabellenPfad,
      kennung: ziel.kennung,
      stand: offen.antwort.stand,
    });
    laeuft = false;
    if (gegenstand !== n.schluessel()) {
      if (antwort && antwort.gehalten === true) void freigebenFuer(ziel);
      return;
    }
    if (antwort && antwort.status === 'ready' && antwort.gehalten === true) {
      halte(antwort);
      weiter(offen.zweck);
      return;
    }
    // Abgewiesen: Die frische Auskunft ersetzt die angezeigte, der Grund kommt dazu.
    const frisch =
      antwort && antwort.status === 'ready' && antwort.konflikt ? antwort : offen.antwort;
    const grund = antwort ? antwort.grund || antwort.code || null : null;
    seite.sperrKonflikt = { antwort: frisch, zweck: offen.zweck, grund };
    n.zeichne();
  }

  function schliesse() {
    seite.sperrKonflikt = null;
    n.zeichne();
  }

  function vergiss() {
    seite.sperrKonflikt = null;
  }

  function zeichneKonflikt(wurzel) {
    const offen = seite.sperrKonflikt;
    if (!offen) return;
    wurzel.appendChild(
      baueKonfliktBlock({
        antwort: offen.antwort,
        grund: offen.grund,
        t,
        hat: n.hat,
        zeitpunkt: n.zeitpunkt,
        lesen: schliesse,
        brechen: () => void brechen(),
      }),
    );
  }

  return {
    nehmen,
    freigeben,
    nachAuftrag,
    sendeAuftrag,
    brechen,
    schliesse,
    vergiss,
    zeichneKonflikt,
  };
}
