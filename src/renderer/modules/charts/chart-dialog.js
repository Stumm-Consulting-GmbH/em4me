// 4T-002024 (Epic 3E-000192): Der Dialog «Diagramm zu dieser Tabelle einfügen»
// bzw. «Diagramm bearbeiten».
//
// **Was er zeigt:** Diagramm-Art, Datenreihen aus Spalten oder Zeilen,
// Beschriftungs-Spalte, die Auswahl der Datenreihen und einen optionalen Titel
// (Story 4S-001024, AK2, AK3, AK7). Alles, was zur Wahl steht, kommt aus dem
// Formular-Kern `src/shared/charts/chart-form.js`; jede Änderung eines Feldes
// geht über `updateChartForm`, und danach wird der Dialog aus dem neuen Stand
// neu belegt. Der Dialog trägt keine eigene Regel: Er zeigt, was der Kern
// anbietet, und den Stand, den der Kern daraus macht. Fehleingaben sind damit
// konstruktiv unmöglich (Entwicklungsrichtlinien, Kapitel 10); der
// Bestätigen-Knopf ist nie gesperrt.
//
// **Was er zurückgibt:** `{ ok: true, form }` mit dem Formular-Stand des Kerns
// oder `{ ok: false }` bei Abbruch. Geschrieben wird nicht hier, sondern vom
// Aufrufer über den Schreib-Kern `chart-edit.js`; der Dialog lädt auch keine
// Tabelle, Angebot und Vorbelegung bringt der Aufrufer mit.
//
// **Warum zur Laufzeit gebaut** (Vorbild: `kanban/kanban-einstellungs-dialog.js`):
// Die Zahl der Spalten und Zeilen wechselt mit der Tabelle; die Modale in
// `index.html` sind feste Bäume. Dieselben Klassen geben dasselbe Aussehen.
//
// **Tastatur** (AK26 des Tasks): Fokus beim Öffnen auf der Diagramm-Art; Tab
// bleibt im Dialog; Enter bestätigt, außer auf einem Knopf, der Enter selbst
// auslöst; Escape und ein Klick auf den Hintergrund brechen ab; beim Schließen
// geht der Fokus an den Anker oder an das Element, das ihn vorher hatte. Ein
// erneuter Aufruf eines der Kommandos bei offenem Dialog holt ihn nach vorn
// (`focusOpenChartDialog`).
//
// Text des Anwenders (Spalten-Überschriften, Zeilen-Einträge, Tabellen-Name)
// wird nur als Text-Inhalt eingesetzt, nie als HTML. Übersetzt wird über die
// mitgegebene Funktion `t`.
'use strict';

import { CHART_TYPES, SERIES_MODES } from '../../../shared/markdown/perspective-chart.js';
import {
  labelChoices,
  rowChoices,
  seriesModeChoices,
  singleSeries,
  updateChartForm,
  valueColumnChoices,
} from '../../../shared/charts/chart-form.js';

const ID = 'chart-dialog';

// Das erste Feld des offenen Dialogs, solange einer offen ist; sonst null.
// Es gibt höchstens einen (die Felder tragen feste Kennungen, und die
// Kommandos öffnen unter einer Sperre).
let offenesErstesFeld = null;

/**
 * Holt den offenen Dialog nach vorn: Fokus auf sein erstes Feld. Ein zweiter
 * Aufruf eines der beiden Kommandos bei offenem Dialog endet damit nicht still
 * (Entscheidung zu Ablauf-Fall DE-17 des Tasks).
 *
 * @returns {boolean} true, wenn ein Dialog offen war und den Fokus bekommen hat.
 */
export function focusOpenChartDialog() {
  if (!offenesErstesFeld || !offenesErstesFeld.isConnected) return false;
  offenesErstesFeld.focus();
  return true;
}

function element(tag, klasse, text) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (text != null) el.textContent = text;
  return el;
}

// Setzt alle Platzhalter in einem Durchgang über eine Ersetzungs-Funktion ein:
// Sie wertet keine Muster wie `$&` aus, und ein eingesetzter Wert wird nicht
// erneut nach Platzhaltern durchsucht (die Zeile zum anderen Dokument trägt
// zwei mit Anwender-Text; Muster `fuelle` in chart-hint.js).
function fuelle(vorlage, werte) {
  return String(vorlage).replace(/\{(\w+)\}/g, (platz, name) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : platz,
  );
}

// Die Datenreihen, die bei diesem Stand zur Wahl stehen, mit Text, Kennzeichen
// und Auswahl.
function reihenAngebot(offer, stand) {
  if (stand.series === 'rows') {
    const { rows, skipped } = rowChoices(offer, stand.labels);
    return {
      skipped,
      eintraege: rows.map((r) => ({
        wert: r.entry,
        text: r.entry,
        berechnet: false,
        gewaehlt: (stand.rows || []).includes(r.entry),
      })),
    };
  }
  const spalte = (name) => offer.columns.find((c) => c.name === name);
  return {
    skipped: 0,
    eintraege: valueColumnChoices(offer, stand.labels).map((name) => ({
      wert: name,
      text: spalte(name).heading,
      berechnet: spalte(name).computed,
      gewaehlt: (stand.values || []).includes(name),
    })),
  };
}

/**
 * Zeigt den Dialog.
 *
 * @param {object} ctx
 * @param {'insert'|'edit'} ctx.modus Einfügen oder Bearbeiten: Titel und
 *   Beschriftung des Bestätigen-Knopfs.
 * @param {object} ctx.offer Angebot aus `buildChartOffer`.
 * @param {object} ctx.form Vorbelegung aus `insertFormDefaults` bzw.
 *   `editFormFromSpec`; nie null — der Aufrufer prüft vorher
 *   `chartUnavailableReason` und öffnet sonst keinen Dialog.
 * @param {Function} ctx.t Übersetzungs-Funktion.
 * @param {string} [ctx.tabellenName] im Bearbeiten-Modus der Name der
 *   genannten Tabelle.
 * @param {string} [ctx.tabellenDokument] im Bearbeiten-Modus das andere
 *   Dokument, in dem die Tabelle steht, wie der Block es nennt; ohne Angabe
 *   steht sie im eigenen Dokument.
 * @param {HTMLElement} [ctx.anker] Ziel des Fokus nach dem Schließen.
 * @returns {Promise<{ok: true, form: object}|{ok: false}>}
 */
export function openChartDialog(ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;
  const { offer } = ctx;
  if (!offer || !ctx.form) {
    throw new TypeError('openChartDialog: Angebot und Formular-Stand fehlen');
  }
  const bearbeiten = ctx.modus === 'edit';
  let stand = ctx.form;
  const vorher = document.activeElement;

  const modal = element('div', 'bookmark-modal chart-dialog-modal');
  const hintergrund = element('div', 'bookmark-modal-backdrop');
  const inhalt = element('div', 'bookmark-modal-content chart-dialog-inhalt');
  inhalt.setAttribute('role', 'dialog');
  inhalt.setAttribute('aria-modal', 'true');
  inhalt.setAttribute('aria-labelledby', `${ID}-titel`);
  const titel = element(
    'h2',
    null,
    t(bearbeiten ? 'chart.dialog.titleEdit' : 'chart.dialog.titleInsert'),
  );
  titel.id = `${ID}-titel`;
  inhalt.appendChild(titel);
  if (bearbeiten && ctx.tabellenName) {
    const zeile = element('p', 'chart-dialog-tabelle');
    // Ein Satz je Fall, kein Text in einem anderen: Beim anderen Dokument
    // nennt die Zeile es in einem eigenen Satz mit zwei Platzhaltern.
    zeile.textContent = ctx.tabellenDokument
      ? fuelle(t('chart.dialog.tableInFile'), {
          name: ctx.tabellenName,
          file: ctx.tabellenDokument,
        })
      : fuelle(t('chart.dialog.table'), { name: ctx.tabellenName });
    inhalt.appendChild(zeile);
  }

  // Diagramm-Art: eine Auswahl aus den vier Arten des Format-Kerns.
  const art = element('select');
  art.id = `${ID}-type`;
  for (const typ of CHART_TYPES) {
    const option = element('option', null, t(`chart.dialog.type.${typ}`));
    option.value = typ;
    art.appendChild(option);
  }
  const artLabel = element('label', null, t('chart.dialog.type'));
  artLabel.htmlFor = art.id;
  const artZeile = element('div', 'settings-row chart-dialog-zeile');
  artZeile.append(artLabel, art);

  // Datenreihen aus Spalten oder Zeilen: zwei Radio-Knöpfe.
  const richtung = element('fieldset', 'chart-dialog-gruppe');
  richtung.appendChild(element('legend', null, t('chart.dialog.series')));
  const richtungKnoepfe = {};
  for (const mode of SERIES_MODES) {
    const knopf = element('input');
    knopf.type = 'radio';
    knopf.name = `${ID}-series`;
    knopf.value = mode;
    const label = element('label', 'chart-dialog-wahl');
    label.append(knopf, element('span', null, t(`chart.dialog.series.${mode}`)));
    richtung.appendChild(label);
    richtungKnoepfe[mode] = knopf;
  }

  // Beschriftungs-Spalte: jede Spalte mit ihrer Überschrift.
  const beschriftung = element('select');
  beschriftung.id = `${ID}-labels`;
  for (const spalte of offer.columns) {
    const option = element('option', null, spalte.heading);
    option.value = spalte.name;
    beschriftung.appendChild(option);
  }
  const beschriftungLabel = element('label', null, t('chart.dialog.labels'));
  beschriftungLabel.htmlFor = beschriftung.id;
  const beschriftungZeile = element('div', 'settings-row chart-dialog-zeile');
  beschriftungZeile.append(beschriftungLabel, beschriftung);

  // Datenreihen: Kästchen oder, bei genau einer Reihe, Radio-Knöpfe in einer
  // rollbaren Liste; darunter die Hinweise.
  const reihen = element('fieldset', 'chart-dialog-gruppe');
  const reihenLegende = element('legend');
  const liste = element('div', 'chart-dialog-liste');
  const hinweisAusgelassen = element('p', 'chart-dialog-hinweis');
  hinweisAusgelassen.dataset.hinweis = 'ausgelassen';
  const hinweisEinzeln = element('p', 'chart-dialog-hinweis', t('chart.dialog.singleSeries'));
  hinweisEinzeln.dataset.hinweis = 'einzeln';
  reihen.append(reihenLegende, liste, hinweisAusgelassen, hinweisEinzeln);

  // Titel: einzeilig, optional.
  const titelFeld = element('input');
  titelFeld.type = 'text';
  titelFeld.id = `${ID}-title`;
  titelFeld.value = stand.title;
  const titelLabel = element('label', null, t('chart.dialog.title'));
  titelLabel.htmlFor = titelFeld.id;
  const titelZeile = element('div', 'settings-row chart-dialog-zeile');
  titelZeile.append(titelLabel, titelFeld);

  const knoepfe = element('div', 'bookmark-modal-buttons');
  const abbrechen = element('button', 'btn', t('dialog.cancel'));
  abbrechen.type = 'button';
  abbrechen.dataset.aktion = 'abbrechen';
  const bestaetigen = element(
    'button',
    'btn btn-primary',
    t(bearbeiten ? 'chart.dialog.apply' : 'chart.dialog.insert'),
  );
  bestaetigen.type = 'button';
  bestaetigen.dataset.aktion = 'bestaetigen';
  knoepfe.append(abbrechen, bestaetigen);

  inhalt.append(artZeile, richtung, beschriftungZeile, reihen, titelZeile, knoepfe);
  modal.append(hintergrund, inhalt);

  // --- Belegen aus dem Stand ---------------------------------------------------

  let listenForm = null;

  function belegeListe() {
    const einzeln = singleSeries(stand.type);
    const { eintraege, skipped } = reihenAngebot(offer, stand);
    const form = JSON.stringify([stand.series, einzeln, eintraege.map((e) => e.wert)]);
    if (form !== listenForm) {
      // Neu gebaut wird nur, wenn sich das Angebot ändert — nach einer Änderung
      // von Art, Richtung oder Beschriftung, deren Fokus nicht in der Liste
      // steht. Ein Klick in der Liste setzt allein die Häkchen.
      listenForm = form;
      liste.textContent = '';
      for (const e of eintraege) {
        const eingabe = element('input');
        eingabe.type = einzeln ? 'radio' : 'checkbox';
        eingabe.name = `${ID}-reihe`;
        eingabe.value = e.wert;
        const label = element('label', 'chart-dialog-wahl');
        label.append(eingabe, element('span', null, e.text));
        if (e.berechnet) {
          label.appendChild(element('span', 'chart-dialog-berechnet', t('chart.dialog.computed')));
        }
        liste.appendChild(label);
      }
    }
    const gewaehlt = eintraege.filter((e) => e.gewaehlt).length;
    liste.querySelectorAll('input').forEach((eingabe, i) => {
      eingabe.checked = eintraege[i].gewaehlt;
      // Der Kern hält mindestens eine Reihe; das letzte angehakte Kästchen
      // steht deshalb fest, statt beim Abwählen ersetzt zu werden.
      eingabe.disabled = !einzeln && eingabe.checked && gewaehlt === 1;
    });
    reihenLegende.textContent = t(
      stand.series === 'rows' ? 'chart.dialog.rows' : 'chart.dialog.valueColumns',
    );
    liste.dataset.series = stand.series;
    const auslassText = t(
      skipped === 1 ? 'chart.dialog.rowsSkipped.one' : 'chart.dialog.rowsSkipped.other',
    );
    hinweisAusgelassen.hidden = skipped === 0;
    hinweisAusgelassen.textContent = skipped === 0 ? '' : fuelle(auslassText, { n: skipped });
    hinweisEinzeln.hidden = !einzeln;
  }

  function belege() {
    art.value = stand.type;
    for (const { mode, locked } of seriesModeChoices(offer)) {
      richtungKnoepfe[mode].disabled = locked;
      richtungKnoepfe[mode].checked = stand.series === mode;
    }
    const gesperrt = new Map(labelChoices(offer, stand.series).map((c) => [c.name, c.locked]));
    for (const option of beschriftung.options)
      option.disabled = gesperrt.get(option.value) === true;
    beschriftung.value = stand.labels;
    belegeListe();
  }

  function aendere(patch) {
    stand = updateChartForm(offer, stand, patch);
    belege();
  }

  art.addEventListener('change', () => aendere({ type: art.value }));
  for (const knopf of Object.values(richtungKnoepfe)) {
    knopf.addEventListener('change', () => {
      if (knopf.checked) aendere({ series: knopf.value });
    });
  }
  beschriftung.addEventListener('change', () => aendere({ labels: beschriftung.value }));
  liste.addEventListener('change', () => {
    const gewaehlt = [...liste.querySelectorAll('input')]
      .filter((el) => el.checked)
      .map((el) => el.value);
    aendere(stand.series === 'rows' ? { rows: gewaehlt } : { values: gewaehlt });
  });
  // Der Titel wird nicht zurückgeschrieben: Der Kern schneidet Leerraum am
  // Rand ab, und das Feld soll beim Tippen nicht springen.
  titelFeld.addEventListener('input', () => {
    stand = updateChartForm(offer, stand, { title: titelFeld.value });
  });

  belege();

  return new Promise((resolve) => {
    const schliesse = (ergebnis) => {
      document.removeEventListener('keydown', beiTaste, true);
      if (offenesErstesFeld === art) offenesErstesFeld = null;
      modal.remove();
      const ziel = ctx.anker && ctx.anker.isConnected ? ctx.anker : vorher;
      if (ziel && ziel.isConnected && typeof ziel.focus === 'function') ziel.focus();
      resolve(ergebnis);
    };
    const fokussierbar = () =>
      [...inhalt.querySelectorAll('select, input, button')].filter(
        (el) => !el.disabled && !el.closest('[hidden]'),
      );
    const beiTaste = (ereignis) => {
      // Nur Tasten, die dem Dialog gelten: aus dem Dialog selbst oder ohne
      // Fokus (Ziel ist die Seite). Eine andere Oberfläche, die über dem
      // offenen Dialog aufgeht (etwa die Kommando-Palette), behält ihre
      // Tasten; sonst bestätigte Enter dort den Dialog.
      const ziel = ereignis.target;
      if (ziel !== document.body && !(ziel instanceof Node && modal.contains(ziel))) return;
      if (ereignis.key === 'Escape') {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        schliesse({ ok: false });
      } else if (ereignis.key === 'Enter') {
        if (ereignis.isComposing || ereignis.target.tagName === 'BUTTON') return;
        ereignis.preventDefault();
        ereignis.stopPropagation();
        schliesse({ ok: true, form: stand });
      } else if (ereignis.key === 'Tab') {
        // Tab bleibt im Dialog: am Rand geht es zum anderen Ende.
        const ziele = fokussierbar();
        const erstes = ziele[0];
        const letztes = ziele[ziele.length - 1];
        const aktiv = document.activeElement;
        const drinnen = inhalt.contains(aktiv);
        if (ereignis.shiftKey && (!drinnen || aktiv === erstes)) {
          ereignis.preventDefault();
          letztes.focus();
        } else if (!ereignis.shiftKey && (!drinnen || aktiv === letztes)) {
          ereignis.preventDefault();
          erstes.focus();
        }
      }
    };
    abbrechen.addEventListener('click', () => schliesse({ ok: false }));
    hintergrund.addEventListener('click', () => schliesse({ ok: false }));
    bestaetigen.addEventListener('click', () => schliesse({ ok: true, form: stand }));
    // Am Dokument in der Capture-Phase (Muster `views/image-lightbox.js`):
    // Auch ein Tastendruck ohne Fokus im Dialog, etwa nach einem Klick auf
    // eine Überschrift, erreicht ihn; `beiTaste` lässt dabei jedes Ziel
    // außerhalb des Dialogs und der Seite durch.
    document.addEventListener('keydown', beiTaste, true);
    document.body.appendChild(modal);
    offenesErstesFeld = art;
    art.focus();
  });
}
