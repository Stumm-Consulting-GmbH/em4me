// 4T-002003 (Epic 3E-000307): Schutz gespeicherter Kalender-Werte beim
// Nachtragen einer jüngsten Epoche — der Teil in den Einstellungen.
//
// **Warum hier.** Ein Wert der jüngsten Epoche steht ohne Kürzel im Dokument
// und wird ohne Kürzel als Wert der LETZTEN Epoche gelesen. Trägt der Anwender
// eine neue jüngste Epoche ein, bezeichnet jeder so gespeicherte Wert danach
// still einen anderen Tag, und ein Wert mit dem Kürzel der bisherigen Epoche
// ab dem Beginn der neuen wird ungültig. Die Einstellungen sind der einzige
// Weg, auf dem eine bestehende Zeitrechnung eine Epoche bekommt; deshalb fragt
// `applyCalendarSection` vor dem Speichern hier nach (`pruefeEpochenSchutz`)
// und lässt danach sichern (`sichereEpochenWerte`).
//
// **Gesichert wird jeder Wert, der seine Bedeutung verlöre** (Entscheidung des
// Product Owners vom 2026-10-01, «alle umschreiben»): vor dem Beginn der neuen
// Epoche mit dem Kürzel der bisherigen, ab ihrem Beginn in der Jahreszählung
// der neuen. Den neuen Text jeder Stelle rechnet das geteilte Modul
// (calendar-epoch-guard.js); hier wird er nur geschrieben.
//
// **Reihenfolge: zählen, fragen, speichern, neu zählen, schreiben, berichten.**
// Erst die Einstellungen, weil der umgeschriebene Wert nur in der neuen
// Definition sicher lesbar ist (der Anwender kann ein Kürzel im selben Zug erst
// vergeben haben) und weil bei einem Fehlschlag des Speicherns kein Dokument
// angefasst sein darf. Das Speichern selbst bleibt beim Aufrufer.
//
// **Geschrieben wird über die Ersetzen-Strecke aus 3E-000169**
// (`ersetzeZieleImBereich`), in EINEM Lauf über alle betroffenen
// Zeitrechnungen, mit je Fundstelle eigenem Ersetzungs-Text: Grenz-Prüfung,
// Sicherung des Vor-Stands in der Dokument-Historie, atomares Schreiben,
// Puffer-Schnitt offener Reiter und Nachladen werden benutzt, nicht
// nachgebaut. Die Notizen der Dokumente liegen nicht im Text der Strecke und
// gehen über die bestehenden Notiz-Wege (`readNote`/`writeNote`); offene
// Notiz-Felder ziehen über deren Meldung nach.
//
// **Laufzeit-Import** für die Ersetzen-Strecke und den Bericht-Dialog: Der
// statische Import zöge dieses Modul in die eingefrorene Zyklus-Komponente des
// Renderers (Begründung wie in search/tag-umbenennen.js). Die Einstellungen
// sind dabei ein System-Reiter; die Strecke greift über den Zustand der Spalten
// auf Reiter und Editoren zu und braucht die sichtbare Fläche nicht.
'use strict';

import { normalizeCalendarConfig } from '../../../shared/calendar/calendar-config.js';
import {
  epochenNachtraege,
  findeUngesicherte,
  laufOptionen,
} from '../../../shared/calendar/calendar-epoch-guard.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { activeTab } from '../app/app-state.js';

// Der aktive Reiter mit seinem Editor-Stand, wie bei der Tag-Umbenennung: Die
// Zählung soll ungespeicherte Änderungen dieses Dokuments sehen, sonst zeigten
// die Offsets in seinem Puffer auf falsche Stellen. Steht der Einstellungs-
// Reiter vorn, ist das kein Dokument, und die Zählung liest die Platte.
function aktiveDatei() {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) return null;
  return typeof tab.content === 'string' ? { pfad: tab.path, text: tab.content } : null;
}

function normalisiert(konfig) {
  try {
    return normalizeCalendarConfig(konfig);
  } catch {
    return null;
  }
}

// Nachträge, im Anzeige-Prozess aus denselben Definitionen gerechnet wie im
// Hauptprozess (geteiltes Modul). null, wenn die Rechnung scheitert.
function lokaleNachtraege(alt, neu) {
  try {
    return epochenNachtraege(normalizeCalendarConfig(alt), normalizeCalendarConfig(neu));
  } catch {
    return null;
  }
}

const liste = (wert) => (Array.isArray(wert) ? wert : []);

async function zaehle(alt, neu) {
  const antwort = await api.calendarEpochScan({ alt, neu, aktiv: aktiveDatei() });
  if (!antwort || !Array.isArray(antwort.nachtraege)) throw new Error('Zählung ohne Ergebnis');
  return {
    zaehlbar: antwort.vorratModus === 'vorrat',
    nachtraege: antwort.nachtraege,
    dateien: liste(antwort.dateien),
    notizen: liste(antwort.notizen),
  };
}

/**
 * Stellt fest, ob das Anwenden gespeicherte Werte verschieben würde, und
 * fragt den Anwender.
 *
 * Ohne Nachtrag einer Epoche wird nichts gezählt und nichts gefragt — die
 * Rechnung ist dieselbe wie im Hauptprozess, ein Lauf über den Bereich bei
 * jedem Anwenden wäre Aufwand ohne Ergebnis. Scheitert die Zählung, läuft das
 * Anwenden nicht still weiter, als gäbe es nichts zu sichern: Die Rückfrage
 * kommt dann wie bei einem zu großen Bereich, ohne Zahl. Scheitert auch die
 * eigene Rechnung, lässt sich weder Zahl noch Name nennen; dann meldet
 * `fehler: true` dem Aufrufer, dass nicht angewendet wird.
 *
 * @param {object|null} alt Gespeicherte Definition (Ablage-Form).
 * @param {object} neu Anzuwendende Definition (Ablage-Form).
 * @returns {Promise<{antwort: 'keine'|'sichern'|'ohne'|'abbrechen', fehler?: true,
 *   erste?: {dateien: Array, notizen: Array}}>} `erste` trägt beim Sichern die
 *   Ziele der ersten Zählung; was davon bei der zweiten fehlt, nennt der
 *   Bericht als «seit der Zählung geändert».
 */
export async function pruefeEpochenSchutz(alt, neu) {
  const lokal = lokaleNachtraege(alt, neu);
  if (lokal !== null && lokal.length === 0) return { antwort: 'keine' };

  let zaehlung;
  try {
    zaehlung = await zaehle(alt, neu);
  } catch {
    if (lokal === null) return { antwort: 'abbrechen', fehler: true };
    zaehlung = { zaehlbar: false, nachtraege: lokal, dateien: [], notizen: [] };
  }
  const { zaehlbar } = zaehlung;
  const betroffen = zaehlbar
    ? zaehlung.nachtraege.filter((n) => Number(n.werte) > 0)
    : zaehlung.nachtraege;
  if (betroffen.length === 0) return { antwort: 'keine' };

  const eintraege = betroffen.map((n) =>
    zaehlbar ? { name: n.name, werte: n.werte, dokumente: n.dokumente } : { name: n.name },
  );
  let antwort;
  try {
    antwort = await api.calendarConfirmEpochGuard({ eintraege, zaehlbar });
  } catch {
    antwort = 'abbrechen';
  }
  // Nur eine angebotene Antwort zählt; alles andere ist ein Abbruch.
  const angeboten = zaehlbar ? ['sichern', 'ohne'] : ['ohne'];
  if (!angeboten.includes(antwort)) antwort = 'abbrechen';
  if (antwort !== 'sichern') return { antwort };
  return { antwort, erste: { dateien: zaehlung.dateien, notizen: zaehlung.notizen } };
}

// Eine Dokument-Notiz fortschreiben. Gelesen wird frisch und gegen die ALTE
// Definition geprüft, wie im Hauptprozess; jede Stelle `[offset, offset +
// laenge)` bekommt ihren vollständigen neuen Text `ersatz`, von hinten nach
// vorn, damit die Offsets der vorderen Stellen gültig bleiben.
async function sichereNotiz(pfad, altKonfig, nachtraege) {
  let gelesen;
  try {
    gelesen = await api.readNote(pfad);
  } catch {
    gelesen = null;
  }
  if (!gelesen || !gelesen.ok) return { grund: 'lesen' };
  const text = gelesen.note && typeof gelesen.note.text === 'string' ? gelesen.note.text : '';
  const stellen = findeUngesicherte(text, altKonfig, nachtraege).filter(
    (s) => typeof s.ersatz === 'string',
  );
  if (stellen.length === 0) return { veraendert: true };
  let neuerText = text;
  for (const s of [...stellen].sort((a, b) => b.offset - a.offset)) {
    neuerText = neuerText.slice(0, s.offset) + s.ersatz + neuerText.slice(s.offset + s.laenge);
  }
  let geschrieben;
  try {
    geschrieben = await api.writeNote(pfad, neuerText);
  } catch {
    geschrieben = null;
  }
  if (!geschrieben || !geschrieben.ok) return { grund: 'schreiben' };
  return { anzahl: stellen.length };
}

// Der eine Schreib-Lauf über die Strecke. Was sie dennoch nicht abfängt,
// erscheint im Bericht, statt den Bericht zu verhindern.
async function schreibeDateien(dateien) {
  if (dateien.length === 0) return { geaendert: [], fehlgeschlagen: [], veraendert: [] };
  try {
    const { ersetzeZieleImBereich } = await import('../search/search-ersetzen.js');
    return await ersetzeZieleImBereich(dateien, laufOptionen(), { zeigen: false });
  } catch {
    return {
      geaendert: [],
      fehlgeschlagen: dateien.map((d) => ({ pfad: d.pfad, grund: 'kanal' })),
      veraendert: [],
    };
  }
}

function berichtZeile(eintrag, grundText) {
  const teile = [];
  if (eintrag.notiz) teile.push(t('settings.calendar.epochGuard.report.note'));
  if (eintrag.anzahl) {
    teile.push(
      eintrag.anzahl === 1
        ? t('settings.calendar.epochGuard.report.values.one')
        : t('settings.calendar.epochGuard.report.values.other').replace(
            '{n}',
            String(eintrag.anzahl),
          ),
    );
  }
  if (eintrag.imPuffer) teile.push(t('areaReplace.inBuffer'));
  if (eintrag.grund) teile.push(grundText(eintrag.grund));
  const zeile = { text: api.basename(eintrag.pfad) };
  if (teile.length > 0) zeile.detail = teile.join(' · ');
  return zeile;
}

async function zeigeSchutzBericht(sammel) {
  const { showLinkReportDialog } = await import('../dialogs/dialogs.js');
  const { grundText } = await import('../search/search-ersetzen.js');
  const abschnitt = (titel, eintraege) => ({
    title: t(titel),
    rows: eintraege.map((e) => berichtZeile(e, grundText)),
    emptyText: t('areaReplace.report.empty'),
  });
  const offen = sammel.fehlgeschlagen.length > 0 || sammel.veraendert.length > 0;
  await showLinkReportDialog({
    title: t('settings.calendar.epochGuard.report.title'),
    sections: [
      abschnitt('settings.calendar.epochGuard.report.saved', sammel.gesichert),
      abschnitt('settings.calendar.epochGuard.report.failed', sammel.fehlgeschlagen),
      abschnitt('settings.calendar.epochGuard.report.stale', sammel.veraendert),
    ],
    notes: offen ? [t('settings.calendar.epochGuard.report.manualHint')] : [],
    okLabel: t('dialog.ok'),
  });
}

/**
 * Sichert nach dem Speichern der Einstellungen die betroffenen Werte: EINMAL
 * neu zählen (die Offsets der ersten Zählung gelten nach dem Speichern nicht
 * sicher weiter), in EINEM Lauf über die Strecke schreiben, danach die
 * Notizen. Am Ende steht EIN Bericht.
 *
 * Ist der Bereich bei der zweiten Zählung nicht mehr zählbar oder scheitert
 * sie, wird nichts geschrieben; der Bericht nennt dann jedes Ziel der ersten
 * Zählung mit Grund unter «Nicht geändert».
 *
 * @param {object|null} alt Die vorher gespeicherte Definition (Ablage-Form).
 * @param {object} neu Die soeben gespeicherte Definition (Ablage-Form).
 * @param {{dateien: Array, notizen: Array}} erste Ziele der ersten Zählung.
 * @returns {Promise<{gesichert: Array, fehlgeschlagen: Array, veraendert: Array}>}
 */
export async function sichereEpochenWerte(alt, neu, erste) {
  const vorher = { dateien: liste(erste && erste.dateien), notizen: liste(erste && erste.notizen) };
  const sammel = { gesichert: [], fehlgeschlagen: [], veraendert: [] };

  let zaehlung = null;
  let grund = 'kanal';
  try {
    zaehlung = await zaehle(alt, neu);
    if (!zaehlung.zaehlbar) {
      zaehlung = null;
      grund = 'keinVorrat';
    }
  } catch {
    /* Brücke gescheitert: keine Zählung, der Grund bleibt «kanal». */
  }
  if (!zaehlung) {
    for (const d of vorher.dateien) sammel.fehlgeschlagen.push({ pfad: d.pfad, grund });
    for (const n of vorher.notizen)
      sammel.fehlgeschlagen.push({ pfad: n.pfad, grund, notiz: true });
    await zeigeSchutzBericht(sammel);
    return sammel;
  }

  // Was bei der ersten Zählung betroffen war und jetzt nicht mehr, hat sich
  // seitdem geändert; ob es noch stimmt, weiß das Programm nicht.
  const nochDa = (eintraege, pfad) => eintraege.some((e) => e.pfad === pfad);
  for (const d of vorher.dateien) {
    if (!nochDa(zaehlung.dateien, d.pfad)) sammel.veraendert.push({ pfad: d.pfad });
  }
  for (const n of vorher.notizen) {
    if (!nochDa(zaehlung.notizen, n.pfad)) sammel.veraendert.push({ pfad: n.pfad, notiz: true });
  }

  const lauf = await schreibeDateien(zaehlung.dateien);
  sammel.gesichert.push(...lauf.geaendert);
  sammel.fehlgeschlagen.push(...lauf.fehlgeschlagen);
  sammel.veraendert.push(...lauf.veraendert.map((pfad) => ({ pfad })));

  const altKonfig = normalisiert(alt);
  const nachtraege = lokaleNachtraege(alt, neu);
  for (const n of zaehlung.notizen) {
    const ergebnis =
      altKonfig && nachtraege
        ? await sichereNotiz(n.pfad, altKonfig, nachtraege)
        : { veraendert: true };
    if (ergebnis.anzahl) {
      sammel.gesichert.push({ pfad: n.pfad, anzahl: ergebnis.anzahl, notiz: true });
    } else if (ergebnis.grund) {
      sammel.fehlgeschlagen.push({ pfad: n.pfad, grund: ergebnis.grund, notiz: true });
    } else {
      sammel.veraendert.push({ pfad: n.pfad, notiz: true });
    }
  }
  await zeigeSchutzBericht(sammel);
  return sammel;
}
