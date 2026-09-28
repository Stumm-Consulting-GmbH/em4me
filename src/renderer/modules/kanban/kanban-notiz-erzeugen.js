// 4T-001956 (Epic 3E-000319): «Notiz aus Karte erzeugen…» — der Ablauf von der
// Karte zur neuen Notiz und zurück zum Verweis auf der Karte.
//
// **Die Bausteine sind die von «Neue Datei aus Vorlage…»** (`templates.js`):
// Vorlagen-Liste und -Auswahl, Ordner-Regel, Namens-Abfrage, Platzhalter-Kette,
// Anlage ohne Überschreiben und Öffnen. Sie werden hier nur in eine andere
// Reihenfolge gebracht; ein zweiter Anlage-Weg entsteht nicht. Was sich aus Text
// und Angaben allein ableiten lässt — Titel, Dateiname, Zielordner, Vorlagen-
// Angabe, neuer Kartentext —, steht im Format-Kern `src/shared/kanban/kanban-notiz.js`.
//
// **Reihenfolge: erst die Datei, dann die Karte.** Scheitert die Anlage, bleibt
// die Karte unverändert. Hat sich das Tafel-Dokument inzwischen geändert, bleibt
// die Datei stehen und die Karte unverändert, und der Hinweis sagt beides. Die
// Karte wird als **eine** Transaktion über den Schreibweg der Tafel geändert:
// Ein Rückgängig-Schritt stellt den Kartentext wieder her, die Datei bleibt.
//
// **Die Werkzeuge kommen herein** (`werkzeuge`), mit einer Standard-Belegung aus
// `templates.js` und der Prozess-Brücke. `templates.js` wird zur Laufzeit
// geladen, aus demselben Grund wie in `kanban-pane.js`: Ein statischer Bezug zöge
// diesen Ordner in den eingefrorenen Datei-Zyklus des Anzeige-Prozesses. Die
// Prüffälle belegen die Werkzeuge ohne Fenster.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  dateinameAusTitel,
  ersetzeKartentextDurchVerweis,
  findeVorlage,
  notizPfad,
  verweisAufNotiz,
  vorlageAus,
  zerlegeKartentext,
  zielordnerAus,
} from '../../../shared/kanban/kanban-notiz.js';
import { schreibeVorbildTerminNach } from './kanban-termin.js';

// Die Text-Operation des Schreibwegs: Kartentext durch den Verweis ersetzen und
// einen lesbaren Vorbild-Termin dabei umschreiben, wie beim Bearbeiten
// (Entscheidung der steuernden Sitzung vom 2026-09-27).
export function ersetzeUndSchreibeUm(text, angaben = {}) {
  return schreibeVorbildTerminNach(ersetzeKartentextDurchVerweis(text, angaben), angaben);
}

/** Lässt sich aus der Karte eine Notiz erzeugen? Nur, wenn ihr Titel nicht leer ist. */
export function notizMoeglich(karte) {
  return zerlegeKartentext(karte).titel !== '';
}

const KEINE_VORLAGE = Object.freeze({ keine: true });

// Bestimmt die Vorlage: (a) die wirksame Einstellung der Tafel, (b) sonst die
// Ordner-Regel des Zielordners, (c) sonst die Auswahl mit «keine Vorlage».
// Rückgabe: ein Listen-Eintrag, `KEINE_VORLAGE` oder null bei Abbruch.
async function bestimmeVorlage(w, einstellung, pfad) {
  if (await w.vorlagenAus()) return KEINE_VORLAGE;
  const angabe = vorlageAus(einstellung);
  let liste = null;
  if (angabe) {
    liste = await w.vorlagenListe();
    const eintrag = liste.ok ? findeVorlage(liste.templates, angabe) : null;
    if (eintrag) return eintrag;
    w.hinweis('kanban.notiz.vorlageFehlt');
  } else {
    const regel = await w.ordnerRegel(pfad);
    if (regel) return regel;
  }
  if (!liste) liste = await w.vorlagenListe();
  if (!liste.ok) {
    // Keine Vorlagen eingerichtet oder keine vorhanden: still eine leere
    // Notiz. Ordner fehlt oder Liste nicht lesbar: der vorhandene Hinweis,
    // danach dasselbe (Entscheidung der steuernden Sitzung vom 2026-09-27).
    if (liste.grund === 'missing' || liste.grund === 'readFailed') w.listenHinweis(liste.grund);
    return KEINE_VORLAGE;
  }
  const keine = { relPath: null, group: '', name: t('kanban.notiz.keineVorlage'), keine: true };
  const gewaehlt = await w.waehleVorlage([keine, ...liste.templates]);
  if (!gewaehlt) return null;
  return gewaehlt.keine ? KEINE_VORLAGE : gewaehlt;
}

// Der Zielordner: die Einstellung der Tafel, sonst der Ordner der Tafel. Fehlt
// der eingestellte Ordner oder liegt er außerhalb, wird er nicht angelegt,
// sondern gewählt. null = Abbruch.
async function bestimmeOrdner(w, umfeld) {
  const einstellung = umfeld.einstellungen && umfeld.einstellungen.zielordner;
  const aufgeloest = zielordnerAus(einstellung ? einstellung.wert : null, {
    bereichsWurzel: umfeld.bereichsWurzel,
    tafelOrdner: umfeld.tafelPfad ? w.dirname(umfeld.tafelPfad) : null,
  });
  if (aufgeloest.ordner && (!aufgeloest.eingestellt || (await w.gibtEs(aufgeloest.ordner)))) {
    return aufgeloest.ordner;
  }
  if (aufgeloest.eingestellt) {
    w.hinweis(
      aufgeloest.grund === 'ausserhalb'
        ? 'kanban.einstellungen.ordnerAusserhalb'
        : 'kanban.notiz.ordnerFehlt',
    );
  }
  return w.waehleOrdner();
}

// Der Name: der bereinigte Titel, sonst erfragt. Gibt es die Datei schon, wählt
// der Anwender einen anderen Namen oder den Verweis auf das vorhandene
// Dokument. Rückgabe `{ name, vorhanden }` oder null bei Abbruch.
async function bestimmeName(w, ordner, titel) {
  let name = dateinameAusTitel(titel);
  if (!name) name = await w.frageName('');
  for (;;) {
    if (!name) return null;
    if (!(await w.gibtEs(notizPfad(ordner, name)))) return { name, vorhanden: false };
    const wahl = await w.waehleBeiVorhanden(name);
    if (wahl === 'verweisen') return { name, vorhanden: true };
    if (wahl !== 'anders') return null;
    name = await w.frageName(name);
  }
}

/**
 * Erzeugt aus einer Karte eine Notiz und ersetzt den Kartentext durch den
 * Verweis auf sie.
 *
 * @param {object} umfeld
 * @param {object} umfeld.karte Karte aus `leseTafel` des Ausgangsstands.
 * @param {number} umfeld.spalte Nummer der Spalte.
 * @param {number} umfeld.karteNr Nummer der Karte in der Spalte.
 * @param {string} umfeld.ausgangsstand Text der Tafel beim Auslösen.
 * @param {Function} umfeld.quelle () => aktueller Text der gezeichneten Tafel.
 * @param {Function} umfeld.aenderbar () => boolean.
 * @param {Function} umfeld.wendeAn (operation, angaben) => boolean, der
 *   Schreibweg der Tafel (eine Transaktion).
 * @param {string|null} umfeld.tafelPfad Pfad des Tafel-Dokuments.
 * @param {string|null} umfeld.bereichsWurzel Wurzel des geöffneten Bereichs.
 * @param {object|null} umfeld.einstellungen wirksame Einstellungen der Tafel.
 * @param {object} [werkzeuge] siehe `standardWerkzeuge`.
 * @returns {Promise<boolean>} `true`, wenn die Karte den Verweis bekam.
 */
export async function erzeugeNotizAusKarte(umfeld, werkzeuge = standardWerkzeuge()) {
  const w = werkzeuge;
  const { titel } = zerlegeKartentext(umfeld.karte);
  if (!titel) {
    w.hinweis('kanban.notiz.leer');
    return false;
  }
  const ordner = await bestimmeOrdner(w, umfeld);
  if (!ordner) return false;
  const benannt = await bestimmeName(w, ordner, titel);
  if (!benannt) return false;
  let neu = null;
  if (!benannt.vorhanden) {
    const pfad = notizPfad(ordner, benannt.name);
    const einstellung = umfeld.einstellungen && umfeld.einstellungen.vorlage;
    const vorlage = await bestimmeVorlage(w, einstellung ? einstellung.wert : null, pfad);
    if (!vorlage) return false;
    let inhalt = '';
    let cursor = [];
    if (!vorlage.keine) {
      const gefuellt = await w.fuelle(vorlage, { title: benannt.name, ordner });
      if (!gefuellt || gefuellt.cancelled) return false;
      inhalt = gefuellt.text;
      cursor = gefuellt.cursorOffsets;
    }
    const angelegt = await w.legeAn(ordner, benannt.name, inhalt);
    if (!angelegt || !angelegt.ok) {
      w.anlageHinweis(angelegt ? angelegt.error : 'failed');
      return false;
    }
    neu = { pfad: angelegt.path, cursor };
  }
  // Die Karte erst jetzt, und nur auf dem Stand, auf dem die Handlung begann.
  let ok = false;
  if (umfeld.quelle() !== umfeld.ausgangsstand || !umfeld.aenderbar()) {
    w.hinweis(neu ? 'kanban.notiz.verworfen' : 'kanban.verworfen');
  } else {
    ok = umfeld.wendeAn(ersetzeUndSchreibeUm, {
      spalte: umfeld.spalte,
      karte: umfeld.karteNr,
      verweis: verweisAufNotiz(benannt.name),
    });
  }
  // Das vorhandene Dokument wird nicht geöffnet (Entscheidung der steuernden
  // Sitzung vom 2026-09-27); die neue Notiz öffnet sich in jedem Fall, auch
  // wenn die Karte unverändert blieb — die Datei gibt es.
  if (neu) await w.oeffne(neu.pfad, neu.cursor);
  return ok;
}

/**
 * Die Standard-Belegung der Werkzeuge: `templates.js` zur Laufzeit, die
 * Prozess-Brücke und der Hinweis der Tafel.
 *
 * @param {Function} [hinweis] (schluessel) => void.
 * @returns {object}
 */
export function standardWerkzeuge(hinweis) {
  const vorlagen = () => import('../templates.js');
  const anders = () => t('kanban.notiz.andererName');
  const verweisen = () => t('kanban.notiz.verweisen');
  return {
    hinweis: typeof hinweis === 'function' ? hinweis : () => {},
    dirname: (pfad) => api.dirname(pfad),
    gibtEs: async (pfad) => {
      try {
        return (await api.fileExists(pfad)) === true;
      } catch {
        return false;
      }
    },
    waehleOrdner: async () => {
      try {
        const antwort = await api.templatesChooseFolder('target');
        return antwort && antwort.ok && antwort.path ? antwort.path : null;
      } catch {
        return null;
      }
    },
    frageName: (vorbelegt) => vorlagen().then((m) => m.frageNeuenDateinamen(vorbelegt)),
    waehleBeiVorhanden: (name) =>
      vorlagen()
        .then((m) =>
          m.showTemplateSelectDialog(t('kanban.notiz.vorhandenFrage').replace('{name}', name), [
            anders(),
            verweisen(),
          ]),
        )
        .then((wahl) => (wahl === anders() ? 'anders' : wahl === verweisen() ? 'verweisen' : null)),
    vorlagenAus: () => vorlagen().then((m) => m.vorlagenErweiterungAus()),
    vorlagenListe: () => vorlagen().then((m) => m.ladeVorlagenListe()),
    listenHinweis: (grund) => {
      vorlagen().then((m) => m.zeigeListenHinweis(grund));
    },
    ordnerRegel: (pfad) => vorlagen().then((m) => m.ordnerRegelVorlage(pfad)),
    waehleVorlage: (liste) => vorlagen().then((m) => m.showTemplatePickerDialog(liste)),
    fuelle: (eintrag, { title, ordner }) =>
      vorlagen().then((m) =>
        m.resolveFilledTemplate(
          eintrag.relPath,
          { title, folder: m.folderDisplayFor(ordner) },
          eintrag.sourceKey,
        ),
      ),
    legeAn: (ordner, name, text) => vorlagen().then((m) => m.legeNeueDateiAn(ordner, name, text)),
    anlageHinweis: (fehler) => {
      vorlagen().then((m) => m.zeigeAnlageHinweis(fehler));
    },
    oeffne: (pfad, cursor) => vorlagen().then((m) => m.oeffneNeueDatei(pfad, cursor)),
  };
}
