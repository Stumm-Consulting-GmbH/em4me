// 4T-002185 (Epic 3E-000261, Entscheidung F4 Option A): Die Navigation zwischen
// Masken — wohin ein Link im Körper der Einzel-Maske führt, wohin ein
// Verweis-Feld führt, und der Weg zurück.
//
// **Drei Ziele und ein Rückweg** (Story 4S-001063):
//
//   1. Ein Link auf eine andere Masken-Datei DERSELBEN Tabelle zeigt denselben
//      Datensatz in dieser Maske (Datensatz-Abruf mit bestimmter Maske, 4T-002184).
//   2. Ein Link auf eine Masken-Datei einer ANDEREN Tabelle öffnet keine
//      Neuanlage, sondern meldet im Kopf, dass ein Datensatz zum Öffnen fehlt.
//   3. Ein Verweis-Feld öffnet im Lesen den verwiesenen Datensatz in der
//      Standard-Maske seiner Tabelle; ein Wert, der keinen Datensatz trifft,
//      meldet das und wechselt nicht.
//   4. Ein Datensatz-Verweis im Körper (Tabellen-Datei mit Anker) öffnet die
//      Maske des Datensatzes im Verlauf, wie ein Verweis-Feld (4T-002335).
//   Jeder andere Link öffnet wie überall sein Dokument. Auch der Sprung aus
//   «Verwendet von» (`masken-verwendung.js`) reiht sich in den Verlauf ein.
//
// **Die Auflösung eines Links ist die der Anwendung** (`activateLink` in
// `views/link-navigation.js`, hereingereicht als `aktiviereLink`): Sie löst das
// Ziel auf wie jeder andere Link-Klick und gibt jedes Markdown-Ziel vor dem
// Öffnen an `abfangen`. Erst dort fällt hier die Unterscheidung, und zwar am
// Katalog der Datenbank (`database:overview`, je Tabelle `maskenPfade`): Ist
// das Ziel keine Masken-Datei einer Tabelle, geht der Klick unverändert weiter.
//
// **Der Verlauf** ist ein kleiner Stapel aus Tabelle, Kennung, Neuanlage und
// gezeigter Maske, je Fenster und flüchtig wie der übrige Zustand der Seite. Er
// wächst nur bei einem Wechsel über die Navigation; jedes Öffnen von außen
// (Datensatz-Zeile, Übersicht, Abfrage-Ergebnis, Neuanlage) beginnt einen neuen
// Verlauf, und mit dem Schließen der Seite endet er. Gefüllt und abgebaut wird
// er erst, wenn die Seite tatsächlich umbindet (`beimBinden`): Bricht der
// Anwender die Rückfrage bei ungespeicherter Bearbeitung ab, bleibt er, wie er
// war. Die Rückfrage selbst ist die bestehende der Seite beim Umbinden.
//
// Ohne Fenster-Zustand: Seite, Öffnen, Katalog, Link-Weg und Zeichnen kommen
// herein, damit das Modul in jsdom prüfbar bleibt (Muster `masken-speichern.js`).
'use strict';

import { t } from '../../i18n.js';
import { pathCompareKey } from '../../../shared/platform.js';

export const VERLAUF_MERKEN = 'merken';
export const VERLAUF_ZURUECK = 'zurueck';
// Höchstzahl der Einträge; darüber fällt der älteste heraus.
export const VERLAUF_MAX = 50;

export const ZIEL_GLEICHE_TABELLE = 'gleicheTabelle';
export const ZIEL_ANDERE_TABELLE = 'andereTabelle';
export const ZIEL_DOKUMENT = 'dokument';

// Der Dateiname eines Pfads, mit beiden Trennzeichen (wie `dateiName` in
// `masken-datei.js`, dessen Import den Fenster-Zustand mitbrächte).
function dateiName(pfad) {
  const text = String(pfad || '');
  return text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1);
}

// Gleicher Pfad nach dem Vergleichs-Schlüssel der Plattform; die Trennzeichen
// werden vorher angeglichen, weil Katalog und Link-Auflösung aus verschiedenen
// Quellen kommen.
function gleicherPfad(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const schluessel = (p) => pathCompareKey(p.split('\\').join('/'));
  return schluessel(a) === schluessel(b);
}

/**
 * Wohin führt ein aufgelöstes Link-Ziel? Maßgeblich sind die Masken-Dateien,
 * die der Katalog je Tabelle führt; ohne bereiten Katalog ist jedes Ziel ein
 * gewöhnliches Dokument.
 *
 * @param {string} pfad Absoluter Pfad des Link-Ziels.
 * @param {object|null} ueberblick Antwort von `database:overview`.
 * @param {string|null} tabellenPfad Tabelle der gezeigten Maske.
 * @returns {{art: string, tabelle?: string}} `art` ist eine der ZIEL-Konstanten;
 *   bei einer fremden Tabelle steht deren Name in `tabelle`.
 */
export function klaereZiel(pfad, ueberblick, tabellenPfad) {
  const tabellen = ueberblick && Array.isArray(ueberblick.tabellen) ? ueberblick.tabellen : [];
  const eigner = tabellen.find(
    (tabelle) =>
      Array.isArray(tabelle.maskenPfade) && tabelle.maskenPfade.some((m) => gleicherPfad(m, pfad)),
  );
  if (!eigner) return { art: ZIEL_DOKUMENT };
  if (gleicherPfad(eigner.path, tabellenPfad)) return { art: ZIEL_GLEICHE_TABELLE };
  return { art: ZIEL_ANDERE_TABELLE, tabelle: String(eigner.name || dateiName(eigner.path)) };
}

/**
 * Der Stapel der zuvor gezeigten Datensätze.
 *
 * @returns {{merke: Function, oben: Function, entferne: Function, leere: Function, anzahl: Function}}
 */
export function erzeugeVerlauf() {
  let stapel = [];
  return {
    merke(eintrag) {
      stapel.push(eintrag);
      if (stapel.length > VERLAUF_MAX) stapel = stapel.slice(-VERLAUF_MAX);
    },
    oben: () => (stapel.length > 0 ? stapel[stapel.length - 1] : null),
    // Nicht «nimm»: Der Name gehört dem Sperr-Weg, und dessen Wächter
    // (db-sperren-belege-aus-zustand.test.js) meldet jeden Aufruf unter ihm.
    entferne: () => stapel.pop() || null,
    leere() {
      stapel = [];
    },
    anzahl: () => stapel.length,
  };
}

function satz(key, werte) {
  let text = t(key);
  for (const [name, wert] of Object.entries(werte)) text = text.split(`{${name}}`).join(wert);
  return text;
}

/**
 * Erzeugt die Navigation einer Masken-Seite.
 *
 * @param {object} p
 * @param {object} p.seite Das Zustands-Objekt der Seite.
 * @param {Function} p.oeffne (tabellenPfad, kennung, optionen) => void, der Weg
 *   `oeffneMaske` der Seite; `optionen.verlauf` ist VERLAUF_MERKEN oder
 *   VERLAUF_ZURUECK und reist bis zum Umbinden mit.
 * @param {Function} p.ladeUeberblick () => Promise der Antwort von `database:overview`.
 * @param {Function} p.aktiviereLink (href, istWikiLink, basis, optionen) => Promise,
 *   der Link-Weg der Anwendung für die Spalte der Seite; er ruft
 *   `optionen.abfangen(pfad, hilfe)` mit der Hilfe `{ anker, datensatz }`,
 *   worin `datensatz()` das Datensatz-Ziel eines Ankers liefert (Ziel 4).
 * @param {Function} p.zeichne Zeichnet die Seite neu.
 * @returns {object}
 */
export function erzeugeNavigation({ seite, oeffne, ladeUeberblick, aktiviereLink, zeichne }) {
  const verlauf = erzeugeVerlauf();
  // Die Meldung im Kopf, {key, werte}, bis zum nächsten Umbinden.
  let meldung = null;

  function melde(key, werte) {
    meldung = { key, werte };
    zeichne();
  }

  // Ziel 1, 2 und 4: ein aufgelöstes Markdown-Ziel; false lässt es öffnen.
  // Ziel 4 braucht die Hilfe des Link-Wegs; ohne sie bleibt es beim Dokument.
  async function abfangen(pfad, hilfe) {
    let ueberblick;
    try {
      ueberblick = await ladeUeberblick();
    } catch {
      ueberblick = null;
    }
    const ziel = klaereZiel(pfad, ueberblick, seite.tabellenPfad);
    if (ziel.art === ZIEL_DOKUMENT) {
      // 4T-002335: Ein Datensatz-Verweis im Körper (Tabellen-Datei mit Anker)
      // öffnet die Maske des Datensatzes im Verlauf, wie ein Verweis-Feld.
      if (hilfe && hilfe.anker && typeof hilfe.datensatz === 'function') {
        let datensatz;
        try {
          datensatz = await hilfe.datensatz();
        } catch {
          datensatz = null;
        }
        if (datensatz && datensatz.path && datensatz.id) {
          oeffne(datensatz.path, datensatz.id, { verlauf: VERLAUF_MERKEN });
          return true;
        }
      }
      return false;
    }
    if (ziel.art === ZIEL_ANDERE_TABELLE) {
      melde('database.form.nav.otherTable', { form: dateiName(pfad), table: ziel.tabelle });
      return true;
    }
    const gezeigt = seite.daten && seite.daten.koerper ? seite.daten.koerper.pfad : null;
    if (gleicherPfad(gezeigt, pfad)) return true;
    oeffne(seite.tabellenPfad, seite.kennung, {
      neu: seite.neu,
      maske: pfad,
      verlauf: VERLAUF_MERKEN,
    });
    return true;
  }

  // «Zurück»: zum obersten Eintrag; gilt erst, wenn die Seite umbindet.
  function zurueck() {
    const eintrag = verlauf.oben();
    if (!eintrag) return;
    oeffne(eintrag.tabellenPfad, eintrag.kennung, {
      neu: eintrag.neu,
      maske: eintrag.maske,
      verlauf: VERLAUF_ZURUECK,
    });
  }

  return {
    /** Gibt es einen zuvor gezeigten Datensatz? */
    hatVorigen: () => verlauf.anzahl() > 0,

    /**
     * Ruft die Seite beim Umbinden, BEVOR sie den neuen Gegenstand setzt.
     *
     * @param {string|null|undefined} art VERLAUF_MERKEN, VERLAUF_ZURUECK oder
     *   nichts für ein Öffnen von außen.
     * @param {boolean} anderer Wechselt der Gegenstand?
     */
    beimBinden(art, anderer) {
      meldung = null;
      if (art === VERLAUF_MERKEN) {
        if (anderer && seite.tabellenPfad) {
          verlauf.merke({
            tabellenPfad: seite.tabellenPfad,
            kennung: seite.kennung,
            neu: seite.neu,
            maske: seite.maske,
          });
        }
      } else if (art === VERLAUF_ZURUECK) verlauf.entferne();
      else verlauf.leere();
    },

    /** Mit dem Schließen der Seite endet der Verlauf. */
    beimSchliessen() {
      verlauf.leere();
      meldung = null;
    },

    zurueck,

    /**
     * Der Klick-Hörer am Körper der Maske. Er übernimmt jeden Link; ein Anker
     * im selben Dokument hat in der Maske kein Dokument und bleibt ohne Wirkung.
     *
     * @param {MouseEvent} ev
     */
    beiLinkKlick(ev) {
      const a = ev.target instanceof Element ? ev.target.closest('a') : null;
      if (!a || (ev.currentTarget instanceof Element && !ev.currentTarget.contains(a))) return;
      const href = a.getAttribute('href');
      if (!href) return;
      ev.preventDefault();
      if (href.startsWith('#') && !href.startsWith('#tag:')) return;
      // Wie im gerenderten Bereich: Links in einer eingebetteten Notiz lösen
      // gegen deren Datei auf, sonst gegen die Masken-Datei, ohne sie gegen
      // die Tabelle.
      const eingebettet = a.closest('.wiki-embed-md-body');
      const koerper = seite.daten && seite.daten.koerper;
      const basis =
        (eingebettet && eingebettet.dataset.embedBase) ||
        (koerper && koerper.pfad) ||
        seite.tabellenPfad;
      return aktiviereLink(href, a.classList.contains('wikilink'), basis, { abfangen });
    },

    /**
     * Ziel 3: der Klick auf ein Verweis-Feld im Lesen (`masken-felder.js`).
     *
     * @param {{tabelle: string, tabellenName: string, kennung: string|null, wert: string}} ziel
     */
    beiVerweisKlick({ tabelle, tabellenName, kennung, wert }) {
      if (!kennung) {
        melde('database.form.nav.refMissing', {
          value: String(wert || ''),
          table: String(tabellenName || dateiName(tabelle || '')),
        });
        return;
      }
      if (typeof tabelle !== 'string' || tabelle === '') return;
      oeffne(tabelle, kennung, { verlauf: VERLAUF_MERKEN });
    },

    /**
     * Die Schaltfläche «Zurück» über der Überschrift im Kopf, nur mit vorigem
     * Eintrag. Sie steht im Titel-Block und nicht als eigenes Glied des Kopfs,
     * damit dessen Verteilung (Titel links, Aktionen rechts) bleibt.
     *
     * @param {HTMLElement} kopf
     */
    zeichneZurueck(kopf) {
      if (verlauf.anzahl() === 0) return;
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'db-form-btn db-form-back';
      knopf.textContent = t('database.form.action.back');
      knopf.title = t('database.form.action.backTitle');
      knopf.addEventListener('click', zurueck);
      const ziel = kopf.querySelector('.db-form-titles') || kopf;
      ziel.insertBefore(knopf, ziel.firstChild);
    },

    /**
     * Die Meldung der Navigation unter dem Kopf, sofern eine ansteht.
     *
     * @param {HTMLElement} wurzel
     */
    zeichneMeldung(wurzel) {
      if (!meldung) return;
      const p = document.createElement('p');
      p.className = 'db-form-note db-form-nav-note';
      p.setAttribute('role', 'status');
      p.textContent = satz(meldung.key, meldung.werte);
      wurzel.appendChild(p);
    },
  };
}
