// 4T-001939 (Epic 3E-000257, Bauplan B5): Die Feld-Elemente der Einzel-Maske —
// ein Element je Feld, in der Eingabe-Form seines Typs, lesend oder
// bearbeitend.
//
// **Die Werte sind Zell-Texte**, wie sie die Schreib-Schnittstelle nimmt und
// wie sie in der Datei stehen. Ein Steuerelement liefert Text, und die
// Umwandlung zwischen Zell-Text und Eingabe steht je Typ an genau zwei
// Stellen: `eingabeAusZellText` (Datei → Steuerelement) und
// `zellTextAusEingabe` (Steuerelement → Datei). Welche Text-Form Datum,
// Uhrzeit, Zahl und Wahrheitswert haben, sagt `zellWert` in
// `src/shared/database/record-values.js`; die Formen dort sind dieselben, die
// die Steuerelemente des Browsers liefern (`JJJJ-MM-TT`, `HH:MM` mit
// optionalen Sekunden, Punkt-Dezimal), weshalb die Umwandlung kaum mehr als
// ein Beschneiden des Leerraums ist. Der Wahrheitswert ist `x` oder leer.
//
// **Der Wert-Editor der Eigenschafts-Profile wird bewusst nicht eingehängt**
// (Lösungsansatz des Vorgangs): Er arbeitet mit Profil-Werten statt mit
// Zell-Texten, kennt den Typ `record` nicht und hängt am Profil-Zustand.
//
// **Ohne Import des Fenster-Zustands** (Bauplan B1): Sprache und Rückfall-
// Sprache kommen als Parameter, damit das Modul in jsdom prüfbar bleibt und
// nicht in den eingefrorenen Datei-Zyklus des Anzeige-Prozesses gerät.
//
// **Die Wertehilfe der Verweis-Felder** (4T-001942, Bauplan B2): Das Element
// `record` ist eine Text-Eingabe mit einer eigenen Vorschlagsliste
// `.db-form-suggest`, keine `datalist`, weil jeder Eintrag Anzeige-Form UND
// Kennung zeigt und die Auswahl die Kennung einträgt, was eine `datalist` nicht
// trennt. Die Liste kommt über die injizierte Funktion `ladeZiele(feld)` (die
// Seite reicht den Kanal `database:datensaetze` herein); lesend zeigt das Element
// «Anzeige-Form (Kennung)» aus der Antwort `ziele`, die die Seite beim Aufbau
// geholt hat. Von Hand eingegebene Werte bleiben stehen: Kurzform der Kennung
// und Schlüssel-Wert prüft und ersetzt die Schreib-Schnittstelle (E5.4).
//
// **Eine markierte Zelle behält ihren Rohtext**, lesend wie bearbeitend. Ein
// Zell-Text, der zu seinem Typ nicht passt, käme in einer typisierten Eingabe
// nicht an — ein Zahlenfeld verwirft `12,5` stillschweigend —; bearbeitend
// bekommt ein solches Feld deshalb die einfache Text-Eingabe, damit der
// Anwender sieht und berichtigt, was in der Datei steht.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { loeseBeschriftung } from '../../../shared/database/beschriftung.js';
import { zellWert } from '../../../shared/database/record-values.js';
import { BOOLEAN_MARK } from '../../../shared/markdown/perspective-records-html.js';
import { VERWEIS_ARTEN, legeVerweisZelleAus } from '../../../shared/database/record-verweis.js';

export const MODUS_LESEN = 'lesen';
export const MODUS_BEARBEITEN = 'bearbeiten';

// Die Befund-Kennzeichnung einer fehlenden Zelle. Die übrigen Kennzeichnungen
// sind die Fehler-Codes der Zelle selbst (`invalid*`, `check`, `required`).
export const BEFUND_FEHLT = 'missing';

// 4T-001942 (B2): Höchstzahl der Einträge in der Vorschlagsliste; darüber steht
// ein Hinweis, dass weiteres Tippen eingrenzt.
export const VORSCHLAEGE_MAX = 50;

// Die Lagen einer Ziel-Tabelle, die das Feld lesend machen: Die Definition nennt
// keine, oder der Kanal findet die genannte nicht.
const ZIEL_UNBEKANNT = new Set(['auftragTabelleUnbekannt', 'auftragTabelleAusserhalbBereich']);

// Die Steuerelement-Art je Typ. Unbekannte Typen und `string`, `link`,
// `record` sind einzeilige Text-Eingaben; an `record` (Klasse `db-form-record`)
// hängt seit 4T-001942 die Wertehilfe.
const EINGABE_TYP = {
  number: 'number',
  date: 'date',
  time: 'time',
};

function typVon(feld) {
  return (feld && typeof feld.type === 'string' && feld.type) || 'string';
}

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

// Ein Schlüssel wird nur übersetzt, wenn es ihn gibt: `t()` meldet einen
// unbekannten Schlüssel als Fehler auf der Konsole, und ein Befund-Code, den
// dieses Modul nicht kennt, ist kein Programmfehler.
function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

/**
 * Der Befund einer Zelle, oder null: der Fehler-Code der Zelle, sonst
 * `missing` für eine fehlende Zelle.
 *
 * @param {object|null} zelle Zelle aus der Antwort des Kanals.
 * @returns {string|null}
 */
export function befundVon(zelle) {
  if (!zelle) return null;
  if (typeof zelle.error === 'string' && zelle.error !== '') return zelle.error;
  if (zelle.fehlt === true) return BEFUND_FEHLT;
  return null;
}

/**
 * Der Satz zu einem Befund in der Sprache der Oberfläche.
 *
 * @param {string} befund Fehler-Code oder `missing`.
 * @returns {string}
 */
export function befundText(befund) {
  const key = `database.form.cellError.${befund}`;
  if (hatSchluessel(key)) return t(key);
  const rueckfall = 'database.form.cellError.unknown';
  return hatSchluessel(rueckfall) ? t(rueckfall).replace('{code}', befund) : befund;
}

// Passt ein nicht leerer Zell-Text zu seinem Typ? Die Auslegung ist die eine
// aus `record-values.js`; ein leerer Text ist bei jedem Typ gültig.
function passtZumTyp(feld, text) {
  const typ = typVon(feld);
  if (String(text || '').trim() === '') return true;
  return zellWert(typ, String(text)).error === null;
}

/**
 * Welche Steuerelement-Art ein Feld für einen gegebenen Zell-Text bekommt.
 *
 * @param {object} feld Feld der Definition.
 * @param {string} text Zell-Text.
 * @returns {'checkbox'|'textarea'|'number'|'date'|'time'|'text'}
 */
export function steuerArt(feld, text) {
  const typ = typVon(feld);
  if (typ === 'multiline') return 'textarea';
  // Ein Text, der nicht zum Typ passt, bleibt als Text bearbeitbar; sonst ginge
  // er in der typisierten Eingabe verloren (Modul-Kopf).
  if (!passtZumTyp(feld, text)) return 'text';
  if (typ === 'boolean') return 'checkbox';
  return EINGABE_TYP[typ] || 'text';
}

/**
 * Datei → Steuerelement: der Wert, den ein Steuerelement für einen Zell-Text
 * zeigt. Ein Haken bekommt einen Wahrheitswert, jede andere Art Text.
 *
 * @param {object} feld Feld der Definition.
 * @param {string} text Zell-Text.
 * @returns {string|boolean}
 */
export function eingabeAusZellText(feld, text) {
  const roh = typeof text === 'string' ? text : '';
  const art = steuerArt(feld, roh);
  if (art === 'checkbox') return zellWert('boolean', roh).value === true;
  // Datum, Uhrzeit und Zahl werden für die Auslegung beschnitten
  // (`zellWert`); die Browser-Eingaben nehmen keinen Leerraum an.
  if (art === 'number' || art === 'date' || art === 'time') return roh.trim();
  return roh;
}

/**
 * Steuerelement → Datei: der Zell-Text, den ein Steuerelement liefert.
 *
 * @param {object} feld Feld der Definition.
 * @param {Element} element Das Steuerelement (oder das Feld-Element, das es trägt).
 * @returns {string}
 */
export function zellTextAusEingabe(feld, element) {
  const steuer =
    element && element.matches && element.matches('.db-form-input')
      ? element
      : element && element.querySelector
        ? element.querySelector('.db-form-input')
        : null;
  if (!steuer) return '';
  if (steuer.type === 'checkbox') return steuer.checked ? 'x' : '';
  const art = steuer.dataset ? steuer.dataset.formControl : '';
  const wert = String(steuer.value == null ? '' : steuer.value);
  if (art === 'number' || art === 'date' || art === 'time') return wert.trim();
  // Text-Typen behalten ihren Leerraum: Ein Datenspeicher beschneidet keine
  // Zeichenkette still (Linie aus `record-values.js`).
  return typVon(feld) === 'multiline' ? wert.replace(/\r\n?/g, '\n') : wert;
}

// Der lesende Anzeige-Text einer Zelle, nach der Regel der Tabellen-Anzeige:
// Haken statt `x`, Nachkommastellen der Spalte, sonst der Rohtext.
function leseText(feld, zelle) {
  if (!zelle) return '';
  const text = typeof zelle.text === 'string' ? zelle.text : '';
  if (zelle.error) return text;
  const typ = typVon(feld);
  if (typ === 'boolean') return zelle.value === true ? BOOLEAN_MARK : '';
  if (typ === 'number') {
    if (typeof zelle.value !== 'number') return text.trim();
    const stellen = feld && feld.options ? feld.options.decimals : null;
    if (typeof stellen === 'number' && Number.isInteger(stellen) && stellen >= 0)
      return zelle.value.toFixed(stellen);
    return text.trim();
  }
  return text;
}

function baueSteuerelement(feld, text, beschriftung) {
  const art = steuerArt(feld, text);
  let steuer;
  if (art === 'textarea') {
    steuer = el('textarea', 'db-form-input');
    steuer.rows = 3;
  } else {
    steuer = el('input', 'db-form-input');
    steuer.type = art;
  }
  steuer.dataset.formControl = art;
  steuer.name = feld.name;
  steuer.setAttribute('aria-label', beschriftung);
  const wert = eingabeAusZellText(feld, text);
  if (art === 'checkbox') steuer.checked = wert === true;
  else steuer.value = wert;
  if (art === 'number') {
    steuer.step = 'any';
    const stellen = feld.options ? feld.options.decimals : null;
    // `decimals` ist ein Anzeige-Format und keine Rundung beim Schreiben
    // (E5.5); in der Eingabe steht es allein als Hilfe im leeren Feld.
    if (typeof stellen === 'number' && Number.isInteger(stellen) && stellen >= 0) {
      steuer.dataset.decimals = String(stellen);
      steuer.placeholder = (0).toFixed(stellen);
    }
  }
  if (art === 'time' && /:\d{2}:\d{2}/.test(String(text))) steuer.step = '1';
  if (feld.required === true) {
    steuer.required = true;
    steuer.setAttribute('aria-required', 'true');
  }
  if (typVon(feld) === 'record') steuer.classList.add('db-form-record');
  return steuer;
}

/**
 * Baut das Feld-Element eines Feldes.
 *
 * Die sichtbare Beschriftung steht im Markdown-Segment des Masken-Körpers vor
 * dem Feld; das Element trägt sie deshalb nur als `aria-label` (Bauplan B5).
 *
 * @param {object} p
 * @param {object} p.feld Feld der Definition (`name`, `type`, `label`, `required`, `options`).
 * @param {object|null} p.zelle Zelle aus der Antwort des Kanals (`text`, `value`, `error`, `fehlt`).
 * @param {'lesen'|'bearbeiten'} [p.modus] Lesend oder bearbeitend.
 * @param {string} [p.text] Zell-Text des Entwurfs; ohne Angabe der Text der Zelle.
 * @param {string|null} [p.sprache] Aktive Sprache für die Beschriftung.
 * @param {string|null} [p.rueckfallSprache] Rückfall-Sprache der Datenbank.
 * @param {Function} [p.beiAenderung] (name, zellText) => void, bei jeder Eingabe.
 * @param {Function} [p.ladeZiele] Nur `record`: (feld) => Promise der Antwort des
 *   Kanals `database:datensaetze`, für die Vorschlagsliste im Bearbeiten.
 * @param {object} [p.ziele] Nur `record`: die bereits geholte Antwort desselben
 *   Kanals für die lesende Darstellung; fehlt sie, zeigt das Element den Rohtext.
 * @returns {HTMLElement} Das Element `.db-form-field`.
 */
export function baueFeldElement({
  feld,
  zelle,
  modus = MODUS_LESEN,
  text,
  sprache = null,
  rueckfallSprache = null,
  beiAenderung = null,
  ladeZiele = null,
  ziele,
}) {
  const name = String((feld && feld.name) || '');
  const typ = typVon(feld);
  const beschriftung = loeseBeschriftung(feld && feld.label, sprache, rueckfallSprache) || name;
  const wurzel = el('div', `db-form-field db-form-type-${typ}`);
  wurzel.dataset.field = name;
  wurzel.dataset.formMode = modus;
  wurzel.setAttribute('aria-label', beschriftung);

  if (feld && feld.required === true) {
    wurzel.classList.add('db-form-required');
    const marke = el('span', 'db-form-required-mark', '*');
    marke.title = hatSchluessel('database.form.required') ? t('database.form.required') : '';
    marke.setAttribute('aria-hidden', 'true');
    wurzel.appendChild(marke);
  }

  const befund = befundVon(zelle);
  if (befund) {
    wurzel.classList.add('db-form-marked');
    wurzel.dataset.formErr = befund;
  }

  const zellText = typeof text === 'string' ? text : zelle && zelle.text ? String(zelle.text) : '';
  const verweis = typ === 'record' ? verweisLage(feld, ziele) : null;
  if (verweis === 'ohneZiel') {
    // 4T-001942 (B2): Ohne auffindbare Ziel-Tabelle gibt es nichts, woraus die
    // Wertehilfe schöpfen könnte; das Feld ist lesend, auch im Bearbeiten, und
    // nennt den Grund. Der Wert bleibt im Entwurf unverändert stehen.
    wurzel.classList.add('db-form-ref-notable');
    wurzel.appendChild(el('div', 'db-form-value', zellText));
    wurzel.appendChild(el('div', 'db-form-ref-hint', t('database.form.refNoTable')));
  } else if (modus === MODUS_BEARBEITEN) {
    const steuer = baueSteuerelement(feld || { name }, zellText, beschriftung);
    if (typeof beiAenderung === 'function') {
      const melde = () => beiAenderung(name, zellTextAusEingabe(feld, steuer));
      steuer.addEventListener('input', melde);
      steuer.addEventListener('change', melde);
    }
    wurzel.appendChild(steuer);
    if (typ === 'record' && typeof ladeZiele === 'function') {
      haengeWertehilfeAn(wurzel, steuer, () => ladeZiele(feld));
    }
  } else if (verweis === 'bereit') {
    wurzel.appendChild(verweisAnzeige(zellText, ziele));
  } else {
    // Lesend: der Wert als Text, über `textContent` und nie als Auszeichnung —
    // der Inhalt einer Zelle ist Text des Anwenders.
    const anzeige =
      typeof text === 'string' && zelle && text !== zelle.text
        ? text
        : leseText(feld, zelle || { text: zellText, value: null, error: null });
    wurzel.appendChild(el('div', 'db-form-value', anzeige));
  }

  const meldung = el('div', 'db-form-message');
  if (befund) meldung.textContent = befundText(befund);
  wurzel.appendChild(meldung);
  return wurzel;
}

// --- Wertehilfe der Verweis-Felder (4T-001942, Bauplan B2) ---------------------

/**
 * Die Lage eines Verweis-Feldes: `ohneZiel`, wenn die Definition keine
 * Ziel-Tabelle nennt oder der Kanal die genannte nicht findet; `bereit`, wenn
 * die Liste der Ziele vorliegt; sonst `offen` (noch nicht geholt, kein Zugriff,
 * Lesefehler), und das Feld zeigt den Rohtext.
 *
 * @param {object} feld Feld der Definition.
 * @param {object} [ziele] Antwort des Kanals `database:datensaetze`.
 * @returns {'ohneZiel'|'bereit'|'offen'}
 */
export function verweisLage(feld, ziele) {
  const tabelle = feld && feld.options ? feld.options.table : null;
  if (typeof tabelle !== 'string' || tabelle.trim() === '') return 'ohneZiel';
  if (!ziele || typeof ziele !== 'object') return 'offen';
  if (ziele.status === 'error' && ZIEL_UNBEKANNT.has(ziele.code)) return 'ohneZiel';
  return ziele.status === 'ready' && Array.isArray(ziele.datensaetze) ? 'bereit' : 'offen';
}

/**
 * Der Datensatz, auf den ein Zell-Text zeigt, in der Auflösungs-Ordnung der
 * Schreib-Schnittstelle (E5.4): die Kennung, auch in Kurzform, sonst der Wert
 * des einteiligen Schlüssels, zeichengenau und genau einmal.
 *
 * @param {string} text Zell-Text.
 * @param {object} ziele Antwort des Kanals mit `status: 'ready'`.
 * @returns {object|null} Der Eintrag `{kennung, anzeige, schluessel}`, oder null.
 */
export function loeseVerweisAuf(text, ziele) {
  const liste = ziele && Array.isArray(ziele.datensaetze) ? ziele.datensaetze : [];
  const zelle = legeVerweisZelleAus(typeof text === 'string' ? text : '');
  if (zelle.art === VERWEIS_ARTEN.leer) return null;
  if (zelle.art === VERWEIS_ARTEN.kennung) {
    return liste.find((eintrag) => eintrag.kennung === zelle.wert) || null;
  }
  if (!ziele || !ziele.keyEinteilig) return null;
  const treffer = liste.filter((eintrag) => eintrag.schluessel === zelle.wert);
  return treffer.length === 1 ? treffer[0] : null;
}

/**
 * @param {{kennung: string, anzeige: string}} eintrag Ein Eintrag der Liste.
 * @returns {string} «Anzeige-Form (Kennung)», ohne Anzeige-Form die Kennung.
 */
export function verweisText(eintrag) {
  return eintrag.anzeige ? `${eintrag.anzeige} (${eintrag.kennung})` : eintrag.kennung;
}

/**
 * Die Einträge, die zu einem Suchtext passen: ohne Rücksicht auf Groß- und
 * Kleinschreibung über Anzeige-Form, Schlüssel und Kennung.
 *
 * @param {Array<object>} datensaetze Die Liste des Kanals.
 * @param {string} suchtext Der Text der Eingabe.
 * @returns {Array<object>} Alle Treffer in der Reihenfolge der Liste.
 */
export function filtereZiele(datensaetze, suchtext) {
  const liste = Array.isArray(datensaetze) ? datensaetze : [];
  const such = String(suchtext || '')
    .trim()
    .toLowerCase();
  if (such === '') return liste.slice();
  return liste.filter((eintrag) =>
    [eintrag.anzeige, eintrag.schluessel, eintrag.kennung].some(
      (teil) => typeof teil === 'string' && teil.toLowerCase().includes(such),
    ),
  );
}

// Lesend: aufgelöst «Anzeige-Form (Kennung)», sonst der Rohtext gekennzeichnet.
function verweisAnzeige(zellText, ziele) {
  if (zellText.trim() === '') return el('div', 'db-form-value', '');
  const eintrag = loeseVerweisAuf(zellText, ziele);
  if (eintrag) return el('div', 'db-form-value', verweisText(eintrag));
  const roh = el('div', 'db-form-value db-form-unresolved', zellText);
  roh.title = t('database.form.refUnresolved');
  return roh;
}

let listenZaehler = 0;

// Die Vorschlagsliste an einer Eingabe. Geholt wird beim ersten Fokus über
// `lade`; die Seite hält die Antwort für die Dauer der Bearbeitung (B3), hier
// wird allein gefiltert und gewählt.
function haengeWertehilfeAn(wurzel, eingabe, lade) {
  const liste = el('ul', 'db-form-suggest');
  liste.id = `db-form-suggest-${++listenZaehler}`;
  liste.setAttribute('role', 'listbox');
  liste.hidden = true;
  eingabe.setAttribute('role', 'combobox');
  eingabe.setAttribute('aria-autocomplete', 'list');
  eingabe.setAttribute('aria-controls', liste.id);
  eingabe.setAttribute('aria-expanded', 'false');
  eingabe.autocomplete = 'off';
  wurzel.appendChild(liste);

  const zustand = { ziele: null, treffer: [], aktiv: -1, suche: '' };

  function schliesse() {
    liste.hidden = true;
    liste.innerHTML = '';
    zustand.aktiv = -1;
    eingabe.setAttribute('aria-expanded', 'false');
    eingabe.removeAttribute('aria-activedescendant');
  }

  function waehle(eintrag) {
    eingabe.value = eintrag.kennung;
    schliesse();
    // `change` statt `input`: Der Aufrufer bekommt den Wert, die Liste filtert
    // nicht erneut und öffnet sich nicht wieder.
    eingabe.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function markiere(index) {
    const punkte = [...liste.querySelectorAll('.db-form-suggest-item')];
    zustand.aktiv = punkte.length === 0 ? -1 : (index + punkte.length) % punkte.length;
    punkte.forEach((punkt, i) => {
      punkt.classList.toggle('is-active', i === zustand.aktiv);
      punkt.setAttribute('aria-selected', i === zustand.aktiv ? 'true' : 'false');
    });
    const aktiv = punkte[zustand.aktiv];
    if (!aktiv) return;
    eingabe.setAttribute('aria-activedescendant', aktiv.id);
    if (typeof aktiv.scrollIntoView === 'function') aktiv.scrollIntoView({ block: 'nearest' });
  }

  function punktFuer(eintrag, index) {
    const punkt = el('li', 'db-form-suggest-item');
    punkt.id = `${liste.id}-${index}`;
    punkt.dataset.kennung = eintrag.kennung;
    punkt.setAttribute('role', 'option');
    punkt.setAttribute('aria-selected', 'false');
    punkt.appendChild(el('span', 'db-form-suggest-display', eintrag.anzeige || eintrag.kennung));
    punkt.appendChild(el('span', 'db-form-suggest-id', eintrag.kennung));
    // Der Fokus bleibt in der Eingabe; gewählt wird beim Klick.
    punkt.addEventListener('mousedown', (ev) => ev.preventDefault());
    punkt.addEventListener('click', () => waehle(eintrag));
    return punkt;
  }

  function zeichneListe() {
    if (!zustand.ziele || zustand.ziele.status !== 'ready') return schliesse();
    zustand.treffer = filtereZiele(zustand.ziele.datensaetze, zustand.suche);
    liste.innerHTML = '';
    zustand.aktiv = -1;
    if (zustand.treffer.length === 0) {
      liste.appendChild(el('li', 'db-form-suggest-empty', t('database.form.refEmpty')));
    }
    zustand.treffer
      .slice(0, VORSCHLAEGE_MAX)
      .forEach((eintrag, i) => liste.appendChild(punktFuer(eintrag, i)));
    const weitere = zustand.treffer.length - VORSCHLAEGE_MAX;
    if (weitere > 0) {
      const text = t('database.form.refMore').replace('{anzahl}', String(weitere));
      liste.appendChild(el('li', 'db-form-suggest-more', text));
    }
    liste.hidden = false;
    eingabe.setAttribute('aria-expanded', 'true');
  }

  async function oeffne(suche) {
    zustand.suche = suche;
    if (!zustand.ziele) {
      try {
        zustand.ziele = (await lade()) || { status: 'unavailable' };
      } catch {
        zustand.ziele = { status: 'unavailable' };
      }
    }
    // Hat die Eingabe den Fokus inzwischen verloren, bleibt die Liste zu.
    if (eingabe.isConnected && eingabe.ownerDocument.activeElement === eingabe) zeichneListe();
  }

  eingabe.addEventListener('focus', () => void oeffne(''));
  eingabe.addEventListener('input', () => void oeffne(eingabe.value));
  eingabe.addEventListener('blur', schliesse);
  eingabe.addEventListener('keydown', (ev) => {
    const offen = !liste.hidden;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!offen) {
        void oeffne(eingabe.value);
        return;
      }
      markiere(zustand.aktiv + (ev.key === 'ArrowDown' ? 1 : -1));
    } else if (ev.key === 'Enter' && offen && zustand.aktiv >= 0) {
      ev.preventDefault();
      waehle(zustand.treffer[zustand.aktiv]);
    } else if (ev.key === 'Escape' && offen) {
      ev.preventDefault();
      ev.stopPropagation();
      schliesse();
    }
  });
}
