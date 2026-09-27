// 4T-001945 (Epic 3E-000257, Bauplan B3): «Verwendet von» in der Einzel-Maske —
// die Aktion im Kopf und die Liste der Datensätze, die auf den gezeigten
// Datensatz verweisen, je mit Tabelle, Feld und «Anzeige-Form (Kennung)»; ein
// Klick öffnet die Maske des verweisenden Datensatzes.
//
// **Ein eigenes Modul, weil die Masken-Seite ihr Budget ausschöpft** (Muster
// `masken-datei.js`): Die Seite erzeugt die Hilfe einmal, ruft ihr Zeichnen beim
// Aufbau des Kopfs und verwirft sie beim Umbinden. Das Öffnen einer Maske und
// das Neu-Zeichnen kommen als Rückrufe herein, damit dieses Modul die
// Masken-Seite nicht importiert und kein Ring entsteht.
//
// **Gelesen wird auf Anforderung**, über den Kanal `database:verwendung` mit der
// Kennung des Datensatzes, nie beim Öffnen der Maske: Die Auskunft liest alle
// verweisenden Tabellen und kostet nichts, solange niemand fragt. Das Ergebnis
// gilt allein dem Gegenstand, für den es geholt wurde; bei einem anderen
// Datensatz zeigt die Maske es nicht, auch bevor es verworfen ist. Bei der
// Neuanlage fehlt die Aktion, weil auf einen ungespeicherten Datensatz niemand
// verweisen kann.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { MODUS_LESEN } from './masken-felder.js';

const PRAEFIX = 'database.usage.';

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

// Der verweisende Datensatz als «Anzeige-Form (Kennung)», ohne Anzeige-Form die
// Kennung allein (Muster der Befund-Liste der Konsistenz-Prüfung).
function datensatzText(eintrag) {
  return eintrag.anzeige ? `${eintrag.anzeige} (${eintrag.kennung})` : eintrag.kennung;
}

/**
 * Erzeugt die Verwendungs-Hilfe der Masken-Seite.
 *
 * @param {{oeffne: (pfad: string, kennung: string) => void, zeichneNeu: Function}} p
 *   `oeffne` öffnet die Maske eines Datensatzes, `zeichneNeu` zeichnet die Seite.
 * @returns {{zeichne: Function, verwirf: Function}}
 */
export function erzeugeVerwendungsHilfe({ oeffne, zeichneNeu }) {
  // `anfrage` zählt die Anfragen, damit die Antwort einer überholten nichts
  // mehr zeichnet; `schluessel` nennt den Gegenstand des Ergebnisses.
  const zustand = { schluessel: null, ergebnis: null, laeuft: false, anfrage: 0 };

  const schluesselVon = (seite) => `${seite.tabellenPfad}\n${seite.kennung}`;
  const gilt = (seite) =>
    !!seite && !seite.neu && typeof seite.kennung === 'string' && seite.kennung !== '';

  function verwirf() {
    zustand.schluessel = null;
    zustand.ergebnis = null;
    zustand.laeuft = false;
    zustand.anfrage += 1;
  }

  async function hole(seite) {
    if (!gilt(seite)) return;
    zustand.anfrage += 1;
    const nummer = zustand.anfrage;
    zustand.schluessel = schluesselVon(seite);
    zustand.laeuft = true;
    zustand.ergebnis = null;
    zeichneNeu();
    let antwort;
    try {
      antwort = await api.databaseVerwendung({
        tabelle: seite.tabellenPfad,
        kennung: seite.kennung,
      });
    } catch {
      antwort = null;
    }
    if (nummer !== zustand.anfrage) return;
    zustand.laeuft = false;
    zustand.ergebnis = antwort && typeof antwort === 'object' ? antwort : { status: 'unavailable' };
    zeichneNeu();
  }

  function eintragZeile(eintrag) {
    const zeile = el('tr', 'db-form-usage-entry');
    zeile.dataset.table = String(eintrag.tabelle || '');
    zeile.dataset.field = String(eintrag.feld || '');
    zeile.appendChild(el('td', null, eintrag.tabelle || ''));
    zeile.appendChild(el('td', null, eintrag.feld || ''));
    const zelle = el('td');
    const knopf = el('button', 'db-form-usage-open', datensatzText(eintrag));
    knopf.type = 'button';
    knopf.title = t(PRAEFIX + 'open');
    knopf.addEventListener('click', () => oeffne(eintrag.pfad, eintrag.kennung));
    zelle.appendChild(knopf);
    zeile.appendChild(zelle);
    return zeile;
  }

  function liste(datensaetze) {
    const tabelle = el('table', 'db-overview-table db-form-usage-list');
    const thead = document.createElement('thead');
    const kopf = document.createElement('tr');
    for (const key of ['col.table', 'col.field', 'col.record'])
      kopf.appendChild(el('th', null, t(PRAEFIX + key)));
    thead.appendChild(kopf);
    tabelle.appendChild(thead);
    const koerper = document.createElement('tbody');
    for (const eintrag of datensaetze) koerper.appendChild(eintragZeile(eintrag));
    tabelle.appendChild(koerper);
    return tabelle;
  }

  function zeichneListe(wurzel) {
    const block = el('div', 'db-form-usage');
    block.appendChild(el('div', 'db-form-usage-title', t(PRAEFIX + 'headRecord')));
    wurzel.appendChild(block);
    if (zustand.laeuft) {
      block.appendChild(el('p', 'db-form-note', t(PRAEFIX + 'running')));
      return;
    }
    const ergebnis = zustand.ergebnis;
    if (ergebnis.status !== 'ready') {
      block.appendChild(el('p', 'db-form-note db-form-usage-failed', t(PRAEFIX + 'failed')));
      return;
    }
    const datensaetze = Array.isArray(ergebnis.datensaetze) ? ergebnis.datensaetze : [];
    if (datensaetze.length === 0) {
      block.appendChild(el('p', 'db-form-note db-form-usage-none', t(PRAEFIX + 'noneRecord')));
      return;
    }
    block.appendChild(liste(datensaetze));
  }

  /**
   * Zeichnet die Aktion in die Aktions-Leiste des Kopfs (nur im Lesen) und,
   * sobald für diesen Gegenstand eine Anfrage läuft oder ein Ergebnis vorliegt,
   * die Liste unter den Kopf.
   *
   * @param {HTMLElement} kopf Der Kopf der Maske samt Aktions-Leiste.
   * @param {HTMLElement} wurzel Die Seite; die Liste folgt dem Kopf.
   * @param {object} seite Der Zustand der Masken-Seite.
   */
  function zeichne(kopf, wurzel, seite) {
    const daten = seite && seite.daten;
    if (!gilt(seite) || !daten || daten.status !== 'ready') return;
    const leiste = kopf && kopf.querySelector('.db-form-actions');
    if (leiste && seite.modus === MODUS_LESEN) {
      const knopf = el('button', 'db-form-btn db-form-usage-action', t(PRAEFIX + 'actionRecord'));
      knopf.type = 'button';
      knopf.disabled = zustand.laeuft;
      knopf.addEventListener('click', () => void hole(seite));
      leiste.appendChild(knopf);
    }
    if (zustand.schluessel !== schluesselVon(seite)) return;
    if (zustand.laeuft || zustand.ergebnis) zeichneListe(wurzel);
  }

  return { zeichne, verwirf };
}
