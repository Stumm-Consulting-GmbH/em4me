// 4T-001531 (Epic 3E-000175): Der Bedienweg der Tag-Umbenennung.
//
// **Vier Schritte, kein eigener Apparat.** Der Zugang liegt in der
// Tag-Übersicht, der Dialog nimmt den neuen Namen entgegen, die Vorschau ist
// die Trefferliste, und der Lauf geht über die Ersetzen-Strecke aus 3E-000169.
// Genau das ist der Zweck der Reihenfolge im Zug: Sicherung des Vor-Stands,
// atomares Schreiben, Puffer-Behandlung offener Reiter und Bericht werden
// benutzt und nicht nachgebaut.
//
// **Der eigene Anteil ist die Ermittlung der Fundstellen** (Entscheidung E7 des
// Epics). Sie läuft im Hauptprozess (`main/area/tag-rename.js`), weil sie jede
// Datei des Bereichs braucht; dieses Modul reicht den Auftrag hinüber und die
// Zusage des Anwenders zurück.
//
// **Warum das Muster ein Regex mit Rückverweis ist.** Die Schreib-Strecke
// ersetzt an Offsets, und ihre Ersetzung ist EINE Zeichenkette für den ganzen
// Lauf. Die Umbenennung braucht aber je Fundstelle ein anderes Ergebnis, weil
// der Teilbaum mitwandert: aus `projekt/alpha` wird `arbeit/alpha`, aus
// `projekt` wird `arbeit`. Der Rückverweis auf den Kind-Teil leistet genau das,
// ohne dass die Strecke einen zweiten Auftrags-Typ bekäme.
//
// Liegt in `search/`, weil es die Trefferliste und die Ersetzen-Strecke bedient;
// die Tag-Übersicht ruft es zur Laufzeit (`import()`) und bleibt damit ohne
// Kopplungs-Kante hierher.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { activeTab, state } from '../app/app-state.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
import { showStatusbarHint } from '../views/views.js';
import { istGueltigerTagName } from '../../../shared/tag-erkennung.js';
import { beendeUmbenennung, zeigeSuchPanel, zeigeUmbenennung } from './search-panel.js';

// Sonderzeichen eines regulären Ausdrucks im alten Namen. Tag-Namen tragen
// zwar nur Buchstaben, Ziffern, Unterstrich, Schrägstrich und Bindestrich —
// aber der Name kommt aus dem Index und damit aus fremdem Text, und ein Muster
// aus ungeprüfter Eingabe zu bauen ist die Gewohnheit, die man sich nicht
// leisten sollte.
function schuetze(text) {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * Muster, Flags und Ersetzung eines Umbenennungs-Laufs.
 *
 * Der Ausdruck beginnt beim NAMEN und nicht bei der Raute — die Offsets des
 * Ermittlers zeigen dorthin, weil die Raute stehen bleibt. Die Klammer fasst
 * den Kind-Teil; er wandert unverändert in die Ersetzung.
 *
 * `i` steht für Entscheidung E3: Alle Schreibweisen werden erfasst, geschrieben
 * wird einheitlich die neue.
 */
function laufOptionen(alt, neu) {
  return {
    muster: `${schuetze(alt)}((?:/[\\p{L}\\p{N}_-][\\p{L}\\p{N}_/-]*)?)`,
    flags: 'gui',
    ersetzung: `${neu}$1`,
    regexModus: true,
    tag: { alt, neu },
  };
}

// Der aktive Reiter mit seinem Editor-Stand, sofern er ein Dokument des
// Bereichs ist. Wie beim Suchlauf: Ungespeicherte Änderungen gehören zu den
// Fundstellen, sonst zeigten die Offsets im Puffer auf falsche Stellen.
function aktiveDatei() {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) return null;
  return typeof tab.content === 'string' ? { pfad: tab.path, text: tab.content } : null;
}

function hinweis(schluessel, ersetzungen = {}) {
  let text = t(schluessel);
  for (const [platz, wert] of Object.entries(ersetzungen)) text = text.replace(platz, wert);
  showStatusbarHint('', { text, duration: 2500 });
}

/**
 * Startet die Umbenennung eines Tags über alle seine Vorkommen im Bereich.
 *
 * @param {string} alt Der Tag, wie ihn die Übersicht zeigt (ohne Raute).
 */
export async function starteTagUmbenennung(alt) {
  if (typeof alt !== 'string' || !alt) return;
  if (!state.areaPath) {
    hinweis('tagRename.noArea');
    return;
  }

  // AK2: Der Dialog nennt den alten Namen — die eine Frage, auf die es beim
  // Umbenennen ankommt — und prüft den neuen, bevor irgendetwas gesucht wird.
  const eingabe = await showNameInputDialog({
    title: t('tagRename.title'),
    description: t('tagRename.description').replace('{alt}', alt),
    initialValue: alt,
    placeholder: t('tagRename.placeholder'),
    okLabel: t('tagRename.next'),
    validate: (wert) => {
      if (!istGueltigerTagName(wert)) return 'tagRename.invalid';
      if (wert.trim() === alt) return 'tagRename.unchanged';
      return null;
    },
  });
  if (eingabe === null) return; // AK8: Abbruch lässt den Bestand unverändert.
  const neu = String(eingabe).trim();

  const opts = laufOptionen(alt, neu);
  let antwort;
  try {
    antwort = await api.scanTagRename({ alt, neu, aktiv: aktiveDatei() });
  } catch {
    antwort = null;
  }
  if (!antwort) {
    hinweis('tagRename.failed');
    return;
  }
  // Oberhalb des Vorrats-Deckels hält die Suche keinen Text fest, und die
  // Schreib-Strecke wiese jede Datei ab. Das wird gesagt, statt eine leere
  // Vorschau zu zeigen, die wie «nichts gefunden» aussähe.
  if (antwort.vorratModus === 'direkt') {
    hinweis('tagRename.tooLarge');
    return;
  }
  const treffer = Array.isArray(antwort.treffer) ? antwort.treffer : [];
  if (treffer.length === 0) {
    hinweis('tagRename.none', { '{alt}': alt });
    return;
  }

  await zeigeSuchPanel(state.activePaneIndex);
  zeigeUmbenennung({
    alt,
    neu,
    kinder: antwort.kinder || 0,
    muster: opts.muster,
    flags: opts.flags,
    treffer,
    gruppen: Array.isArray(antwort.gruppen) ? antwort.gruppen : [],
    abgeschnitten: !!antwort.abgeschnitten,
    vorratModus: antwort.vorratModus || null,
    ausfuehren: () => fuehreAus(opts),
  });
}

// Der Lauf. Er geht durch dieselbe Tür wie das freie Ersetzen — samt Bericht,
// Puffer-Schnitt und Nachladen offener Reiter.
async function fuehreAus(opts) {
  // Zur Laufzeit geladen wie beim freien Ersetzen (4T-001526): Der Lauf ist ein
  // Knopfdruck und kein Ladevorgang, und der statische Import zöge das Modul in
  // die eingefrorene Zyklus-Komponente des Renderers.
  const { ersetzeAuswahlImBereich } = await import('./search-ersetzen.js');
  const ergebnis = await ersetzeAuswahlImBereich(opts);
  beendeUmbenennung();
  if (!ergebnis) {
    hinweis('areaReplace.nothingSelected');
    return;
  }
  // AK7: Tag-Übersicht, Vervollständigung und Abfragen ziehen über den
  // bestehenden Index-Weg nach; ein eigener Aktualisierungs-Pfad entsteht
  // nicht. Angestoßen wird er hier, weil die Übersicht sonst bis zum nächsten
  // Reiter-Wechsel den alten Namen zeigte.
  const { renderTags } = await import('../editor/autocomplete-help.js');
  for (let p = 0; p < state.panes.length; p++) void renderTags(p);

  const stellen = ergebnis.geaendert.reduce((summe, g) => summe + g.anzahl, 0);
  hinweis('tagRename.done', {
    '{n}': String(stellen),
    '{d}': String(ergebnis.geaendert.length),
  });
}
