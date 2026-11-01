// 4T-001351 (Epic 3E-000170): Eine Datei des Bereichs in den Papierkorb des
// Betriebssystems verschieben.
//
// Eigenes Modul und nicht in file-actions.js, aus zwei Gruenden. Der eine ist
// fachlich: Die uebrigen Datei-Aktionen benennen um oder haengen um und lassen
// den Bestand bestehen; diese hier nimmt ihn weg und traegt deshalb eine
// eigene Abfolge, eine eigene Rueckfrage und eine eigene Sorgfalt. Der andere
// ist das Groessen-Budget von file-actions.js (466 von 500 Zeilen), das den
// Zusatz nicht mehr getragen haette.
//
// Eigener Zustand: keiner.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { state, withDialog } from '../app/app-state.js';
import { closeTab } from '../tabs/tabs.js';

import { showStatusbarHint } from './views.js';
// 4T-002405 (Epic 3E-000266): Sichern statt Schließen vor dem Lösch-Auftrag.
import { sichereOffeneReiter } from './file-actions.js';
// 4T-002405 (Epic 3E-000266): der Grund einer Abweisung durch die Datenbank.
import { grundDerDatenbank } from './datenbank-abweisung.js';

/**
 * Verschiebt eine Datei des Bereichs in den Papierkorb.
 *
 * **Die Reihenfolge ist die eigentliche Entscheidung dieses Wegs** und steht
 * hier, damit sie beim naechsten Umbau nicht versehentlich gedreht wird:
 *
 *  1. **Rueckfrage** mit dem Namen der Datei. Zuerst, weil das die grosse Frage
 *     ist; wer hier abbricht, soll nicht vorher noch nach seinem ungesicherten
 *     Stand gefragt worden sein.
 *  2. **Offene Reiter schliessen**, ueber alle Panes. Dabei laeuft die
 *     BESTEHENDE Abfrage ueber ungesicherte Aenderungen (Sichern, Verwerfen,
 *     Abbrechen). Ein Abbruch dort bricht den ganzen Vorgang ab — es ist bis
 *     dahin nichts geloescht (AK6).
 *  3. **Erst dann loeschen.** Vor dem Schliessen zu loeschen waere der Fehler,
 *     der die Datei zurueckbraechte: Ein offener Reiter mit ungesichertem Stand
 *     kann sie nach dem Loeschen wieder schreiben.
 *
 * **Eine Karteikarte geht einen eigenen Weg** (4T-002405, F4 A). Ihr Löschen
 * ist ein Auftrag an die Datenbank, den der Lösch-Schutz abweisen kann; ein
 * Reiter, der vor der Abweisung geschlossen wurde, wäre ohne Grund zu. Für sie
 * gilt deshalb: Rückfrage, offene Reiter **sichern** (ein Abbruch stoppt alles),
 * Lösch-Auftrag, und erst nach seiner Annahme die Reiter schließen. Bei einer
 * Abweisung bleiben sie offen. Der Schluss nach der Annahme fragt nicht mehr
 * nach ungesichertem Stand: Gesichert ist vorher, und ein Speichern danach
 * legte die gelöschte Karteikarte am Datenbank-Weg vorbei neu an. Für jede
 * andere Datei bleibt die Reihenfolge oben, weil dort die Abfrage beim
 * Schließen das Verwerfen anbietet und ihr Abbruch das Löschen unterbindet
 * (Ablauf-Fall BP-08); einen Abweisungs-Grund gibt es dort nicht.
 *
 * Was der Fehlschlag in Schritt 3 hinterlaesst, ist ausdruecklich benannt: Die
 * Datei ist unangetastet — es gibt keinen halben Loesch-Zustand, weil der
 * Hauptprozess genau einen Aufruf kennt —, ihre Reiter sind aber geschlossen.
 * Das ist der Preis der Reihenfolge und die harmlosere Haelfte: Ein Klick im
 * Panel oeffnet sie wieder, waehrend die umgekehrte Reihenfolge Inhalte
 * kosten koennte.
 *
 * **Verweise werden nicht nachgefuehrt** (Entscheidung E4 des Epics). Anders
 * als beim Umbenennen gibt es kein Ersatz-Ziel; die Verweise werden zu
 * gebrochenen Verweisen und sind als solche erkennbar. Die Rueckfrage sagt das
 * zu, bevor der Anwender zustimmt.
 *
 * @param {string} absPath Absoluter Pfad der Datei im Bereich.
 * @param {string} anzeigeName Name, den die Rueckfrage nennt.
 */
export async function trashFileAtPath(absPath, anzeigeName) {
  if (typeof absPath !== 'string' || !absPath) return;
  // 4T-001800 (Epic 3E-000255): Der Pfad geht mit in die Rückfrage. Ob
  // Änderungsbelege daneben liegen, stellt der Haupt-Prozess an ihm selbst
  // fest; hier wird dafür nichts erhoben und nichts vorab gefragt.
  const bestaetigt = await withDialog(() =>
    api.areaConfirmTrashFile(anzeigeName || absPath, absPath),
  );
  if (!bestaetigt) return;
  const karteikarte = await istKarteikarte(absPath);
  if (karteikarte) {
    if (!(await sichereOffeneReiter(absPath))) return;
  } else if (!(await schliesseOffeneReiter(absPath))) return;
  let ergebnis;
  try {
    ergebnis = await api.areaTrashFile(absPath);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    // 4T-002405 (F4 A): Eine Karteikarte, die die Datenbank nicht löschen
    // lässt (etwa wegen eines Verweises aus einer anderen Tabelle), liegt
    // unverändert da; die Meldung nennt den Grund, länger sichtbar, weil er
    // gelesen werden muss.
    const grund = grundDerDatenbank(ergebnis);
    if (grund !== null) {
      showStatusbarHint('areaPanel.deleteRefused', {
        duration: 8000,
        error: true,
        text: t('areaPanel.deleteRefused')
          .replace('{name}', anzeigeName || dateiName(absPath))
          .replace('{grund}', grund),
      });
      return;
    }
    showStatusbarHint('areaPanel.deleteFailed', { duration: 5000, error: true });
    return;
  }
  // 4T-002405: Die Karteikarte ist fort; erst jetzt schließen ihre Reiter.
  if (karteikarte) await schliesseOffeneReiter(absPath, { skipDirtyCheck: true });
  // 4T-001800: Die Datei ist weg, ihre Änderungsbelege nicht. Das ist kein
  // Fehlschlag des Löschens und deshalb kein Grund zu schweigen: Der Anwender
  // erfährt statt der Erfolgs-Meldung, unter welchem Namen die Belege noch im
  // Ordner liegen, im Fehler-Stil und länger sichtbar, weil er den Namen
  // lesen muss.
  const liegenGeblieben = Array.isArray(ergebnis.companionLeft) ? ergebnis.companionLeft : [];
  if (liegenGeblieben.length > 0) {
    showStatusbarHint('areaPanel.deleteCompanionLeft', {
      duration: 8000,
      error: true,
      // Alle Namen, nicht der erste: Heute gibt es genau eine Pflicht-Art, und
      // eine zweite soll nicht stillschweigend aus der Meldung fallen.
      text: t('areaPanel.deleteCompanionLeft').replace(
        '{name}',
        liegenGeblieben.map(dateiName).join(', '),
      ),
    });
    return;
  }
  showStatusbarHint('areaPanel.deleteDone', { duration: 3000 });
}

// 4T-002405: Fragt den Haupt-Prozess, ob die Datei eine Karteikarte ist, die
// über die Datenbank gelöscht wird. Ohne Antwort gilt der bisherige Weg; der
// Haupt-Prozess leitet das Löschen dann trotzdem über die Datenbank.
async function istKarteikarte(absPath) {
  if (typeof api.areaIstKarteikarte !== 'function') return false;
  try {
    return (await api.areaIstKarteikarte(absPath)) === true;
  } catch {
    return false;
  }
}

// Der Name ohne Ordner. Die Meldung nennt bewusst nicht den ganzen Pfad: Sie
// steht in der Statusleiste, und der Ordner ist derselbe wie der der eben
// gelöschten Datei (Vorbild `baseName` in history-page.js).
function dateiName(pfad) {
  const wert = String(pfad || '');
  const schnitt = Math.max(wert.lastIndexOf('/'), wert.lastIndexOf('\\'));
  return schnitt >= 0 ? wert.slice(schnitt + 1) : wert;
}

// Schliesst jeden Reiter dieser Datei in jeder Pane, einen nach dem anderen und
// jedes Mal neu gesucht: Das Schliessen verkuerzt nicht nur die Reiter-Liste,
// es kann auch eine leer gewordene Pane einziehen — ein ueber die Runde
// gemerkter Index zeigte danach woandershin. Ein Abbruch der Speichern-Abfrage
// meldet sich als false und stoppt alles. Die Schleife endet, weil jeder
// erfolgreiche Durchgang genau einen Treffer entfernt.
async function schliesseOffeneReiter(absPath, optionen = {}) {
  for (;;) {
    let treffer = null;
    for (let p = 0; p < state.panes.length && !treffer; p++) {
      const idx = state.panes[p].tabs.findIndex((tab) => tab.path === absPath);
      if (idx >= 0) treffer = [p, idx];
    }
    if (!treffer) return true;
    if (!(await closeTab(treffer[0], treffer[1], optionen))) return false;
  }
}
