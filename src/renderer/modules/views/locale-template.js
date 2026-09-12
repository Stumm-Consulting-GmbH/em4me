// 4T-001592 und 4T-001593 (Story 4S-000905, Epic 3E-000129): Ausgabe der
// Sprach-Vorlage und Einspielen einer eigenen Sprachdatei im Anzeige-Prozess.
//
// Die Arbeit liegt im Hauptprozess (src/main/ipc/locales.js) — Katalog,
// Dialoge, Prüfung und Ablage. Hier bleibt allein die Rückmeldung an den
// Anwender, und zwar nach dem Muster des Einrichtungs-Exports
// (setup-export.js): Erfolg und Fehlschlag bekommen einen Statusleisten-
// Hinweis, ein Abbruch im Dialog bekommt keinen.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from './views.js';

/**
 * Gibt die Sprach-Vorlage aus.
 *
 * @returns {Promise<boolean>} true, wenn eine Datei geschrieben wurde.
 */
export async function exportLocaleTemplate() {
  const ergebnis = await api.localesSaveTemplate();
  if (ergebnis && ergebnis.ok) {
    showStatusbarHint('locales.template.done', { duration: 2500 });
    return true;
  }
  // Abbruch im Speichern-Dialog ist kein Fehler und bekommt keinen Hinweis —
  // der Anwender hat gerade selbst entschieden, dass nichts geschehen soll.
  if (ergebnis && ergebnis.canceled) return false;
  showStatusbarHint('locales.template.failed', { duration: 3000, error: true });
  return false;
}

// 4T-001593: Abbildung der Prüf-Befunde auf lesbare Sätze. Der Hauptprozess
// liefert eine Kennung und den betroffenen Schlüssel; der Anwender bekommt
// einen Satz, der ihm sagt, WAS in SEINER Datei zu ändern ist — eine
// technische Ausnahme hülfe ihm nicht weiter.
const MELDUNGEN = {
  'kein-json': 'locales.import.failed.noJson',
  'kein-objekt': 'locales.import.failed.noObject',
  'wert-kein-text': 'locales.import.failed.notText',
  platzhalter: 'locales.import.failed.placeholder',
  auszeichnung: 'locales.import.failed.markup',
  'link-ziel': 'locales.import.failed.linkTarget',
  'zu-gross': 'locales.import.failed.tooBig',
  'keine-bekannten-schluessel': 'locales.import.failed.noKnownKeys',
  'locale-fehlt': 'locales.import.failed.localeMissing',
  'locale-ungueltig': 'locales.import.failed.localeInvalid',
  'locale-belegt': 'locales.import.failed.localeTaken',
  'name-fehlt': 'locales.import.failed.nameMissing',
  'name-zu-lang': 'locales.import.failed.nameTooLong',
  'read-failed': 'locales.import.failed.read',
  'write-failed': 'locales.import.failed.write',
};

function meldeVerstoss(ergebnis) {
  const key = MELDUNGEN[ergebnis && ergebnis.error] || 'locales.import.failed.generic';
  // Der Schlüssel steht im Text, wo die Meldung ihn führt: Ohne ihn wüsste der
  // Anwender bei 3000 Einträgen nicht, welchen er ansehen soll.
  const text = t(key).replace('{key}', (ergebnis && ergebnis.schluessel) || '');
  showStatusbarHint(key, { duration: 6000, error: true, text });
}

/**
 * Spielt eine eigene Sprachdatei ein: wählen, prüfen, ablegen.
 *
 * @returns {Promise<boolean>} true, wenn eine Sprache übernommen wurde.
 */
export async function importLocale() {
  const gewaehlt = await api.localesOpenDialog();
  // Abbruch im Öffnen-Dialog ist kein Fehler.
  if (!gewaehlt || !gewaehlt.ok) {
    if (gewaehlt && !gewaehlt.canceled) meldeVerstoss(gewaehlt);
    return false;
  }

  let ergebnis = await api.localesImport(gewaehlt.path);

  // Ersetzen ist der erwartete Wiederhol-Fall: Der Anwender übersetzt weiter
  // und spielt dieselbe Datei erneut ein. Bestätigt statt still ausgeführt.
  if (ergebnis && !ergebnis.ok && ergebnis.error === 'existiert') {
    const ja = await api.localesConfirmReplace(ergebnis.name);
    if (!ja) return false;
    ergebnis = await api.localesImport(gewaehlt.path, { ersetzen: true });
  }

  if (!ergebnis || !ergebnis.ok) {
    meldeVerstoss(ergebnis);
    return false;
  }

  // Übersprungene Schlüssel werden gemeldet und nicht verschwiegen (Z3): Sie
  // sind der Hinweis darauf, dass die Datei aus einer anderen Programmfassung
  // stammt.
  // Der Name kommt aus `@@name` der Datei und steht in der Meldung: So sieht
  // der Anwender, dass die Anwendung die Sprache als die erkannt hat, die er
  // benannt hat.
  const text = (
    ergebnis.uebersprungen && ergebnis.uebersprungen.length > 0
      ? t('locales.import.doneWithSkipped').replace(
          '{skipped}',
          String(ergebnis.uebersprungen.length),
        )
      : t('locales.import.done')
  )
    .replace('{name}', ergebnis.name)
    .replace('{n}', String(ergebnis.keys));
  showStatusbarHint('locales.import.done', { duration: 5000, text });
  return true;
}

/**
 * 4T-001594 (Epic 3E-000129): Entfernt eine eingespielte Sprache.
 *
 * Der Auswahl-Dialog laeuft im Hauptprozess (Plan-Freigabe vom 2026-09-10,
 * Frage 4): Er stellt die eingespielten Sprachen mit Namen zur Wahl und traegt
 * Abbrechen als Vorgabe, nach dem Muster der Ersetzen-Rueckfrage. Hier bleibt
 * wie bei den beiden Wegen darueber allein die Rueckmeldung.
 *
 * **Den Sprachwechsel macht diese Funktion nicht.** War die entfernte Sprache
 * die eingestellte, faellt die Anwendung auf Englisch zurueck — ausgeloest vom
 * Empfang des Ereignisses `locales:changed` in app-broadcasts.js, und zwar in
 * ALLEN Fenstern. Ein Wechsel an dieser Stelle traefe nur das eine Fenster und
 * waere die zweite, halb richtige Strecke.
 *
 * @returns {Promise<boolean>} true, wenn eine Sprache entfernt wurde.
 */
export async function removeLocale() {
  const ergebnis = await api.localesRemoveDialog();
  if (!ergebnis || !ergebnis.ok) {
    showStatusbarHint('locales.remove.failed', { duration: 4000, error: true });
    return false;
  }
  // Kein Bestand: Der Anwender hat den Eintrag gewaehlt und bekommt eine
  // Antwort, statt auf einen Dialog zu warten, der nicht kommt.
  if (ergebnis.keine) {
    showStatusbarHint('locales.remove.none', { duration: 3000 });
    return false;
  }
  // Abbruch im Dialog ist kein Fehler und bekommt keinen Hinweis (Muster der
  // beiden Wege darueber).
  if (!ergebnis.entfernt) return false;
  const name = ergebnis.entfernt.name || ergebnis.entfernt.code || '';
  showStatusbarHint('locales.remove.done', {
    duration: 4000,
    text: t('locales.remove.done').replace('{name}', name),
  });
  return true;
}

/**
 * 4T-001596 (Epic 3E-000129): Gibt die eigene Sprachdatei auf dem Stand der
 * laufenden Programmfassung aus.
 *
 * Der Bedien-Weg, auf den der Alterungs-Hinweis zeigt (AK3). Ausgegeben wird
 * die VOLLSTAENDIGE Datei und keine Lueckenliste (Entscheidung des Product
 * Owners vom 2026-09-10): eigene Uebersetzungen erhalten, neue Eintraege auf
 * Englisch an ihrer Stelle. Der Anwender legt sie ueber seine bisherige Datei,
 * uebersetzt die englisch gebliebenen Zeilen und spielt sie wieder ein.
 *
 * **Welche Sprache, waehlt der Anwender im Dialog des Hauptprozesses** und
 * nicht die eingestellte: Wer zwei eigene Sprachen pflegt, will beide
 * aktualisieren koennen, ohne die Oberflaeche vorher umzustellen. Hier bleibt
 * wie bei den Wegen darueber allein die Rueckmeldung.
 *
 * @returns {Promise<boolean>} true, wenn eine Datei geschrieben wurde.
 */
export async function updateLocale() {
  const ergebnis = await api.localesUpdateDialog();
  if (!ergebnis || !ergebnis.ok) {
    // Abbruch im Speichern-Dialog ist kein Fehler (Muster der Wege darueber).
    if (ergebnis && ergebnis.canceled) return false;
    showStatusbarHint('locales.update.failed', { duration: 4000, error: true });
    return false;
  }
  // Kein Bestand: Der Anwender hat den Eintrag gewaehlt und bekommt eine
  // Antwort, statt auf einen Dialog zu warten, der nicht kommt.
  if (ergebnis.keine) {
    showStatusbarHint('locales.update.none', { duration: 3000 });
    return false;
  }
  // Abbruch im Auswahl-Dialog ist ebenso wenig ein Fehler.
  if (ergebnis.abgebrochen) return false;
  showStatusbarHint('locales.update.saved', {
    duration: 5000,
    text: t('locales.update.saved')
      .replace('{name}', ergebnis.name || '')
      .replace('{n}', String(ergebnis.fehlend)),
  });
  return true;
}
