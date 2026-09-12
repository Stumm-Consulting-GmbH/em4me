// 4T-001587 (Story 4S-000904, Epic 3E-000160): Ausgabe der eigenen Einrichtung
// — Auswahl der Datenarten und Speichern.
//
// Der Anzeige-Prozess führt hier nur den Dialog und den Speichern-Weg. Was es
// an Datenarten gibt, wieviel sie enthalten und was in der Datei steht,
// beantwortet der Hauptprozess (`exchange:list`, `exchange:build`); die Werte
// selbst kommen nie hier an. Geschrieben wird über `file:saveAs`, denselben
// Weg wie der portable Markdown-Export — es gibt einen Speichern-Weg für
// Dateien des Anwenders und nicht zwei.
'use strict';

import { t } from '../../i18n.js';
import { api, $ } from '../app/api.js';
import { showStatusbarHint } from './views.js';

// Zahl der Einträge als Text. Eigener Schlüssel für den Einzelfall, wie beim
// Ersetzungs-Zähler der Suche (`search.replaceCountOne`).
//
// **Null ist hier kein Zahlenwert, sondern ein eigener Fall** (Befund der
// Test-Iteration vom 2026-09-08). In der Liste stehen ausschließlich
// Datenarten, die etwas enthalten; eine Zähl-Regel kann trotzdem null ergeben,
// wenn das Enthaltene nicht das Gezählte ist — bei den Farbschemas etwa das
// aktive Schema-Paar ohne ein einziges eigenes Schema. Die Zeile meldete dann
// «0 Einträge» und schrieb beim Export gleichwohl etwas: eine Falschaussage
// gegenüber dem Anwender, der nach dieser Zahl entscheidet.
//
// 4T-001590: Für eine EINZELNE Zeile innerhalb einer Datenart ist die Null
// dagegen eine gültige Auskunft und kein Sonderfall — ein Zeitrechnungs-Block
// ohne Zeitrechnung ist angelegt und leer, und genau das soll der Anwender
// sehen, bevor er ihn weitergibt.
function eintragsZahl(anzahl, nullAlsZahl) {
  if (anzahl === 0 && !nullAlsZahl) return t('exchange.entryCountPresent');
  return anzahl === 1
    ? t('exchange.entryCountOne')
    : t('exchange.entryCountMany').replace('{n}', String(anzahl));
}

// Vorschlag für den Dateinamen: sprechender Stamm und Tages-Datum. Bewusst
// ohne Uhrzeit — wer am selben Tag zweimal ausgibt, bekommt vom
// Speichern-Dialog des Betriebssystems die Rückfrage, und das ist die
// Stelle, an der über das Überschreiben entschieden gehört.
function dateiVorschlag(jetzt) {
  const tag = new Date(jetzt).toISOString().slice(0, 10);
  return `${t('exchange.export.fileStem')}-${tag}.md`;
}

// Eine Zeile der Auswahl-Liste: Schalter und Name links, die Zahl rechts.
// `eingerueckt` macht daraus die Unter-Zeile eines einzelnen Eintrags.
function zeichneZeile(name, anzahl, angehakt, beiWechsel, eingerueckt) {
  const li = document.createElement('li');
  if (eingerueckt) li.className = 'setup-export-entry';
  const label = document.createElement('label');
  label.className = 'setup-export-label';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = angehakt;
  box.addEventListener('change', () => beiWechsel(box.checked));
  const text = document.createElement('span');
  text.textContent = name;
  label.appendChild(box);
  label.appendChild(text);
  const zahl = document.createElement('span');
  zahl.className = 'setup-export-count';
  zahl.textContent = eintragsZahl(anzahl, eingerueckt);
  li.appendChild(label);
  li.appendChild(zahl);
  return { li, box };
}

// 4T-001590: Die Liste ist zweistufig, wo eine Datenart einzeln wählbare
// Einträge hat — heute die Zeitrechnungs-Blöcke der Kalender-Systeme. Beide
// Stufen halten denselben Zustand aktuell:
//
// Der Schalter der Datenart sagt «alles» oder «nichts» und schaltet seine
// Einträge mit; ein Zwischenstand entsteht allein aus den Schaltern darunter
// und zeigt sich als unbestimmter Zustand des Datenart-Schalters. Fällt der
// letzte Eintrag weg, ist die Datenart abgewählt — sonst stünde sie
// angehakt in der Liste und käme doch nicht in der Datei an.
function zeichneListe(container, kinds, gewaehlt, gewaehlteEintraege) {
  container.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'setup-export-rows';
  for (const kind of kinds) {
    const eintraege = Array.isArray(kind.entries) ? kind.entries : [];
    const gewaehlteIds = gewaehlteEintraege.get(kind.id) || null;
    const unterBoxen = [];

    const kopf = zeichneZeile(
      t(kind.labelKey),
      kind.count,
      gewaehlt.has(kind.id),
      (an) => {
        if (an) gewaehlt.add(kind.id);
        else gewaehlt.delete(kind.id);
        if (gewaehlteIds) {
          gewaehlteIds.clear();
          if (an) for (const e of eintraege) gewaehlteIds.add(e.id);
          for (const b of unterBoxen) b.checked = an;
        }
        kopf.box.indeterminate = false;
      },
      false,
    );
    ul.appendChild(kopf.li);
    if (!gewaehlteIds) continue;

    for (const eintrag of eintraege) {
      const unter = zeichneZeile(
        eintrag.name,
        eintrag.count,
        gewaehlteIds.has(eintrag.id),
        (an) => {
          if (an) gewaehlteIds.add(eintrag.id);
          else gewaehlteIds.delete(eintrag.id);
          if (gewaehlteIds.size > 0) gewaehlt.add(kind.id);
          else gewaehlt.delete(kind.id);
          kopf.box.checked = gewaehlteIds.size > 0;
          kopf.box.indeterminate = gewaehlteIds.size > 0 && gewaehlteIds.size < eintraege.length;
        },
        true,
      );
      unterBoxen.push(unter.box);
      ul.appendChild(unter.li);
    }
  }
  container.appendChild(ul);
}

// Aus den beiden Zuständen die Auswahl für `exchange:build`.
//
// **Die Kurzform bleibt der Regelfall:** Wer eine Datenart vollständig
// mitnimmt, schickt ihre Kennung und geht damit unverändert denselben Weg wie
// vor diesem Task. Die lange Form entsteht erst, wenn der Anwender innerhalb
// einer Datenart abwählt — der Fall, um den es hier geht: ein einzelnes
// Kalender-System weitergeben, statt alle zu sichern.
function baueAuswahl(kinds, gewaehlt, gewaehlteEintraege) {
  const auswahl = [];
  for (const kind of kinds) {
    if (!gewaehlt.has(kind.id)) continue;
    const eintraege = Array.isArray(kind.entries) ? kind.entries : [];
    const gewaehlteIds = gewaehlteEintraege.get(kind.id);
    if (!gewaehlteIds || gewaehlteIds.size === eintraege.length) auswahl.push(kind.id);
    else auswahl.push({ id: kind.id, entries: [...gewaehlteIds] });
  }
  return auswahl;
}

// Auswahl-Dialog. Liefert die gewählten Kennungen oder null bei Abbruch.
// Aufbau und Tasten-Verhalten folgen `showLinkPreviewDialog`
// (`src/renderer/modules/dialogs/dialogs.js`), damit beide Vorschau-Dialoge
// sich gleich bedienen lassen.
function zeigeAuswahl(kinds) {
  const modal = $('#setup-export-modal');
  const listEl = $('#setup-export-list');
  const btnConfirm = $('#btn-setup-export-confirm');
  const btnCancel = $('#btn-setup-export-cancel');
  if (!modal || !listEl) return Promise.resolve(null);

  // Vorbelegt ist alles: Der häufigste Fall ist die vollständige Sicherung,
  // und wer nur ein Kalender-System weitergeben will, hakt gezielt ab.
  const gewaehlt = new Set(kinds.map((k) => k.id));
  // 4T-001590: Je Datenart mit einzeln wählbaren Einträgen deren Auswahl,
  // ebenfalls vollständig vorbelegt. Eine Datenart ohne Einträge hat hier
  // keinen Eintrag — das unterscheidet «nicht untergliedert» von «alles
  // abgewählt».
  const gewaehlteEintraege = new Map();
  for (const kind of kinds) {
    if (Array.isArray(kind.entries) && kind.entries.length > 0) {
      gewaehlteEintraege.set(kind.id, new Set(kind.entries.map((e) => e.id)));
    }
  }

  return new Promise((resolve) => {
    $('#setup-export-title').textContent = t('exchange.export.title');
    $('#setup-export-intro').textContent = t('exchange.export.intro');
    zeichneListe(listEl, kinds, gewaehlt, gewaehlteEintraege);
    btnConfirm.textContent = t('exchange.export.confirm');
    btnCancel.textContent = t('dialog.cancel');

    const finish = (wert) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(wert);
    };
    const onConfirm = () => {
      // AK4: Ohne Auswahl entsteht keine Datei. Der Dialog bleibt offen und
      // sagt den Grund, statt still nichts zu tun.
      if (gewaehlt.size === 0) {
        showStatusbarHint('exchange.export.nothingSelected', { duration: 2500, error: true });
        return;
      }
      finish(baueAuswahl(kinds, gewaehlt, gewaehlteEintraege));
    };
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => btnConfirm.focus(), 0);
  });
}

/**
 * Baut die Datei zur gewählten Auswahl und führt den Speichern-Dialog.
 *
 * 4T-001588: Eigene Funktion, weil sie zwei Aufrufer hat — die Ausgabe hier
 * und die Sicherung des bisherigen Standes vor einem Einlesen. Die Sicherung
 * ist kein zweiter Ausgabe-Weg, sondern derselbe mit vorbelegter Auswahl.
 *
 * @param {string[]} auswahl Kennungen der Datenarten.
 * @returns {Promise<boolean>} true, wenn eine Datei geschrieben wurde.
 */
export async function speichereEinrichtung(auswahl) {
  const gebaut = await api.exchangeBuild(auswahl);
  if (!gebaut || !gebaut.ok) {
    showStatusbarHint('exchange.export.failed', { duration: 3000, error: true });
    return false;
  }
  const ergebnis = await api.saveFileAs(dateiVorschlag(Date.now()), gebaut.text);
  // Abbruch im Speichern-Dialog ist kein Fehler und bekommt keinen Hinweis.
  if (!ergebnis || !ergebnis.ok) {
    if (ergebnis && ergebnis.error) {
      showStatusbarHint('exchange.export.failed', { duration: 3000, error: true });
    }
    return false;
  }
  showStatusbarHint('exchange.export.done', { duration: 2500 });
  return true;
}

/**
 * Gibt die eigene Einrichtung aus: Auswahl, Datei bauen, speichern.
 *
 * @returns {Promise<boolean>} true, wenn eine Datei geschrieben wurde.
 */
export async function exportSetup() {
  const lage = await api.exchangeList();
  if (!lage || !lage.ok) {
    showStatusbarHint('exchange.export.failed', { duration: 3000, error: true });
    return false;
  }
  if (lage.kinds.length === 0) {
    showStatusbarHint('exchange.export.nothingAvailable', { duration: 3000, error: true });
    return false;
  }
  const auswahl = await zeigeAuswahl(lage.kinds);
  if (!auswahl) return false;
  return speichereEinrichtung(auswahl);
}
