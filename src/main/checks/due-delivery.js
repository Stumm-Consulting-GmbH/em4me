// 4T-001727 (Epic 3E-000305): Zustellung fälliger Meldungen an alle Fenster
// und ihre einmalige Bearbeitung.
//
// Bis zu diesem Epic ging eine fällige Meldung an genau EIN Fenster (das
// fokussierte, sonst das erste der Bereichs-App). Wer in einem anderen Fenster
// arbeitete, sah sie unter Umständen erst Stunden später. Seither geht sie an
// alle Fenster (E1), und eine Bearbeitung in einem Fenster räumt sie in allen
// übrigen (E2).
//
// Die Mehrfach-Anzeige hat eine Falle: Jedes Fenster könnte dieselbe Meldung
// bearbeiten, und zwei fast gleichzeitige Bearbeitungen verschöben dieselbe
// Erinnerung zweimal. Die Entscheidung, WELCHE Bearbeitung wirkt, fällt deshalb
// hier im Hauptprozess (E6): Ein Fenster beansprucht eine Meldung, bevor es sie
// bearbeitet; der erste Anspruch gewinnt, jeder weitere läuft ohne Fehlermeldung
// ins Leere (E9). Der Hauptprozess führt Anfragen strikt nacheinander aus, der
// Anspruch ist damit ohne Sperre atomar.
//
// Das Register kennt die noch offenen Meldungen. Daraus holt ein Fenster, das
// erst nach dem Fälligwerden geöffnet wird, den Stand nach (E10); eine bereits
// bearbeitete Meldung steht dort nicht mehr. Das Schließen eines Fensters
// berührt das Register nicht (E14), weil der Zustand hier liegt und nicht im
// Fenster.
//
// Dasselbe Register tragen Erinnerungen, Wecker und Timer (4T-001728, E5);
// jede Art hat ihre eigene Instanz mit eigenen Kanälen.
'use strict';

/**
 * Baut das Zustell-Register einer Meldungs-Art.
 *
 * @param {object} deps Bezüge der Verdrahtung.
 * @param {(channel: string, payload: object) => void} deps.broadcast Meldung an alle Fenster.
 * @param {string} deps.dueChannel Kanal der Zustellung, etwa 'reminders:due'.
 * @param {string} deps.handledChannel Kanal des Räumens, etwa 'reminders:handled'.
 * @param {(item: object) => string} deps.keyOf Schlüssel eines Eintrags.
 * @param {() => boolean} deps.active Ist die zugehörige Erweiterung zugeschaltet?
 * @param {(item: object) => boolean} deps.stillOpen Gilt eine offene Meldung noch
 *   (Eintrag weiterhin vorhanden und fällig)? Gefragt nur beim Nachholen.
 * @returns {object} Register mit deliver, claim, release, openItems und claimNotification.
 */
function createDueDelivery(deps) {
  const { broadcast, dueChannel, handledChannel, keyOf, active, stillOpen } = deps;
  if (typeof broadcast !== 'function' || typeof keyOf !== 'function') {
    throw new TypeError('createDueDelivery: broadcast und keyOf sind Pflicht');
  }
  if (typeof active !== 'function' || typeof stillOpen !== 'function') {
    throw new TypeError('createDueDelivery: active und stillOpen sind Pflicht');
  }

  // Zugestellte und noch nicht bearbeitete Meldungen: Schlüssel -> { item, catchUp }.
  const open = new Map();
  // Bearbeitete Meldungen seit ihrer letzten Zustellung: Schlüssel -> Eintrag.
  // Eine erneute Zustellung (Wiederauslösung, Schlummer-Ende) löscht den
  // Vermerk; bis dahin läuft jede weitere Bearbeitung ins Leere.
  const handled = new Map();
  // Schlüssel, für die eine System-Benachrichtigung bereits angefordert ist
  // (E12: genau einmal je Meldung, nie je Fenster).
  const notified = new Set();

  function schluesselListe(keys) {
    const liste = Array.isArray(keys) ? keys : [keys];
    return [...new Set(liste.filter((k) => typeof k === 'string' && k !== ''))];
  }

  /**
   * Fällige Meldungen vermerken und an alle Fenster verteilen.
   *
   * @param {{ items: object[], catchUp?: boolean }} payload Nutzlast der Zustellung.
   */
  function deliver(payload) {
    const items = payload && Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) return;
    for (const item of items) {
      const key = keyOf(item);
      open.set(key, { item, catchUp: !!payload.catchUp });
      handled.delete(key);
      notified.delete(key);
    }
    broadcast(dueChannel, payload);
  }

  /**
   * Bearbeitung beanspruchen. Der erste Anspruch auf eine offene Meldung
   * gewinnt und räumt sie in allen Fenstern; ein Anspruch auf eine bereits
   * bearbeitete Meldung wird verweigert. Ein nie zugestellter Schlüssel (etwa
   * ein Eintrag der Erinnerungs-Liste vor seiner Fälligkeit) ist frei.
   *
   * @param {string|string[]} keys Schlüssel der zu bearbeitenden Meldungen.
   * @returns {string[]} Die Schlüssel, deren Bearbeitung wirken darf.
   */
  function claim(keys) {
    const granted = [];
    const cleared = [];
    for (const key of schluesselListe(keys)) {
      const entry = open.get(key);
      if (entry) {
        open.delete(key);
        handled.set(key, entry.item);
        granted.push(key);
        cleared.push(key);
      } else if (!handled.has(key)) {
        granted.push(key);
      }
    }
    if (cleared.length > 0) broadcast(handledChannel, { keys: cleared });
    return granted;
  }

  /**
   * Einen gewährten Anspruch zurückgeben, weil die Bearbeitung nicht wirken
   * konnte (Schreibkonflikt, ungesicherte Datei). Liefert den Eintrag, damit
   * der Aufrufer die Meldung erneut zustellen kann; null, wenn der Schlüssel
   * nicht aus einer offenen Meldung beansprucht war.
   *
   * @param {string} key Schlüssel der Meldung.
   * @returns {object|null} Der zuletzt zugestellte Eintrag oder null.
   */
  function release(key) {
    if (!handled.has(key)) return null;
    const item = handled.get(key);
    handled.delete(key);
    return item;
  }

  /**
   * Der offene Stand für ein nachträglich geöffnetes Fenster. Nicht mehr
   * gültige Meldungen (Eintrag inzwischen anders erledigt) fallen dabei aus
   * dem Register; die bereits offenen Fenster behalten ihre Anzeige wie bisher.
   *
   * @returns {{ catchUp: boolean, items: object[] }} Offene Meldungen.
   */
  function openItems() {
    if (!active()) return { catchUp: false, items: [] };
    const items = [];
    let catchUp = false;
    for (const [key, entry] of [...open.entries()]) {
      if (!stillOpen(entry.item)) {
        open.delete(key);
        continue;
      }
      items.push(entry.item);
      if (entry.catchUp) catchUp = true;
    }
    return { catchUp, items };
  }

  /**
   * Anforderung einer System-Benachrichtigung. Jedes Fenster darf sie
   * anfordern, gewährt wird sie je Meldung einmal und nur, solange die
   * Meldung offen ist.
   *
   * @param {string[]} keys Schlüssel der angezeigten Meldungen.
   * @returns {boolean} true, wenn mindestens eine Meldung noch nicht gemeldet war.
   */
  function claimNotification(keys) {
    let neu = false;
    for (const key of schluesselListe(keys)) {
      if (!open.has(key) || notified.has(key)) continue;
      notified.add(key);
      neu = true;
    }
    return neu;
  }

  return { deliver, claim, release, openItems, claimNotification };
}

module.exports = { createDueDelivery };
