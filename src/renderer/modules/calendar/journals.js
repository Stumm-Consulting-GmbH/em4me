// 4T-000433 (Epic 3E-000081): Journal-Kommandos und der gemeinsame Anlage-Pfad.
//
// Der EINE Öffnen-/Anlage-Weg der Journal-Einträge (Task-Vorgabe): Pfad über
// den Perioden-Kern auflösen → existiert die Datei, öffnen (Tab-Mechanik) →
// sonst anlegen: Vorlage des Journals anwenden (volle Platzhalter-Engine aus
// 3E-000080 inklusive Dialog-Kette; ohne Vorlage leerer Inhalt), Frontmatter-
// Datums-Properties setzen, Datei mit Ordner-Kette schreiben, öffnen.
// Kalender-Panel (4T-000434) und Navigations-Block (4T-000435) rufen denselben
// openJournalEntry-Pfad auf.
//
// Abbruch-Semantik wie bei den Vorlagen (3E-000080): der Abbruch irgendeines
// Platzhalter-Dialogs bricht das GESAMTE Anlegen ab — es entsteht keine
// Datei. Die Journal-Vorlage übersteuert eine gegebenenfalls greifende
// Ordner-Regel: der Anlage-Weg läuft über journals:createEntry und damit
// bewusst NICHT durch den Ordner-Regel-Trigger (Vorrang-Regel).
//
// Zeit-Bezug der Vorlage: die Datums-Platzhalter ({{date}}/{{time}}) werden
// am PERIODEN-START ausgewertet (nowMs = period.startMs) — {{date}} liefert
// im Journal-Eintrag das Perioden-Datum, nicht den Anwendungs-Zeitpunkt.
'use strict';

import { t, getLanguage } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { openInPane } from '../tabs/tabs.js';
import { showStatusbarHint } from '../views/views.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
import {
  collectAnswers,
  jumpToOffsetInActiveTab,
  showTemplateError,
  showTemplateSelectDialog,
} from '../templates.js';
import { analyzeTemplate, fillTemplate } from '../../../shared/template-engine.js';
// 4T-001407 (Epic 3E-000244): Zuordnung des Datei-Bestands zu den Perioden.
import { ordneEintraegeZu, ordnerPraefix } from '../../../shared/journal-nachpflege.js';
import {
  applyJournalProperties,
  isoDateToMs,
  journalProperties,
  msToIsoDate,
  periodAllowed,
  periodOf,
  resolveEntryPath,
} from '../../../shared/journal-core.js';

// --- Konfigurations-Zugriff ------------------------------------------------------

// Journal-Konfiguration des Bereichs, frisch pro Kommando (kein Cache; die
// Kommandos sind selten und der Stand damit immer aktuell). null = kein
// nutzbarer Zustand, der lokalisierte Hinweis ist dann bereits gezeigt.
async function journalsConfigOrHint() {
  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    showStatusbarHint('journal.readFailed', { duration: 3000, error: true });
    return null;
  }
  if (!result.hasArea) {
    showStatusbarHint('journal.noArea', { duration: 3500, error: true });
    return null;
  }
  if (!result.config || result.config.journals.length === 0) {
    showStatusbarHint('journal.noJournals', { duration: 3500, error: true });
    return null;
  }
  return result.config;
}

// Auswahl-Popup über Journale (Muster der select-Platzhalter-Liste).
// Anzeige-Label: Name, bei gesetztem Regal mit Regal-Zusatz; Duplikate
// werden über die id eindeutig gemacht (die Auswahl mappt über den Index
// des Labels). null = Abbruch. 4T-000434: exportiert — der Kalender-Klick
// nutzt dieselbe Auswahl bei mehreren Treffern.
export async function pickJournal(journals, title) {
  if (journals.length === 1) return journals[0];
  const labels = [];
  for (const journal of journals) {
    let label = journal.shelf ? `${journal.name} — ${journal.shelf}` : journal.name;
    if (labels.includes(label)) label = `${label} (${journal.id})`;
    labels.push(label);
  }
  const chosen = await showTemplateSelectDialog(title, labels);
  if (chosen === null || chosen === undefined) return null;
  const idx = labels.indexOf(chosen);
  return idx >= 0 ? journals[idx] : null;
}

// --- Anlage-Inhalt -----------------------------------------------------------------

// Inhalt eines neuen Eintrags: Journal-Vorlage lesen, analysieren, Dialog-
// Kette erheben und am Perioden-Start füllen; danach die Frontmatter-
// Datums-Properties setzen. relPath dient den {{title}}/{{folder}}-Werten.
// null = Abbruch oder Fehler (Hinweis ist gezeigt), sonst
// { text, cursorOffset } (Offset bereits um die Property-Injektion bereinigt).
async function buildEntryContent(journal, period, relPath) {
  let text = '';
  let cursorOffsets = [];
  if (journal.template) {
    let read;
    try {
      read = await api.templatesRead(journal.template);
    } catch {
      read = null;
    }
    if (!read || !read.ok) {
      showStatusbarHint('journal.templateFailed', { duration: 3500, error: true });
      return null;
    }
    const analysis = analyzeTemplate(read.content);
    if (!analysis.ok) {
      showTemplateError(analysis.error);
      return null;
    }
    const answers = await collectAnswers(analysis.inputs);
    if (answers === null) return null; // Dialog-Abbruch: keine Datei
    const slash = relPath.lastIndexOf('/');
    const filled = fillTemplate(analysis, {
      title: relPath.slice(slash + 1).replace(/\.md$/i, ''),
      folder: slash >= 0 ? relPath.slice(0, slash) : '',
      nowMs: period.startMs,
      // 4T-001057: Namens-Token (MMMM, EEEE …) folgen der Oberflächen-Sprache;
      // der Datums-Kontext bleibt der Perioden-Start des Eintrags.
      locale: getLanguage(),
      clipboard: typeof api.clipboardReadText === 'function' ? api.clipboardReadText() : '',
      answers,
    });
    if (!filled.ok) {
      showTemplateError(filled.error);
      return null;
    }
    text = filled.text;
    cursorOffsets = filled.cursorOffsets;
  }
  const withProps = applyJournalProperties(text, journal, period);
  // Die Property-Injektion ändert nur den Frontmatter-Kopf; Cursor-Ziele im
  // Body verschieben sich um die Längen-Differenz.
  const delta = withProps.length - text.length;
  const cursorOffset =
    cursorOffsets.length > 0
      ? Math.max(0, Math.min(cursorOffsets[0] + delta, withProps.length))
      : null;
  return { text: withProps, cursorOffset };
}

// 4T-001406 (Epic 3E-000244): Nachpflege beim Öffnen. Ein bestehender Eintrag
// bekommt fehlende Journal-Eigenschaften ergänzt; vorhandene bleiben unberührt
// (Architekturentscheidung AE2 des Epics). Der Weg ist bewusst still: Er meldet
// weder Erfolg noch Misserfolg, weil der Anwender einen Eintrag öffnen wollte
// und keine Pflege-Aktion angestoßen hat.
//
// ZWEI Schutz-Bedingungen, beide aus der Vorsicht gegenüber fremden Dateien:
// Erstens läuft die Pflege NUR, wenn die Datei in keinem Reiter offen ist —
// sonst schriebe sie unter einem womöglich ungespeicherten Editor-Stand weg.
// Zweitens läuft sie VOR dem Öffnen, damit der Anwender den fertigen Stand
// sieht und keine Änderung unter seiner Schreibmarke erlebt.
async function pflegeEigenschaftenNach(journal, period, relPath, absPath) {
  try {
    const { reiterFuerPfad } = await import('../tabs/tab-ersetzen.js');
    if (reiterFuerPfad(absPath)) return;
    if (typeof api.journalsErgaenzeProperties !== 'function') return;
    await api.journalsErgaenzeProperties(relPath, journalProperties(journal, period));
  } catch {
    // Die Pflege ist eine Zugabe zum Öffnen; ihr Fehlschlag darf das Öffnen
    // nicht verhindern und den Anwender nicht behelligen.
  }
}

// --- Der gemeinsame Öffnen-/Anlage-Pfad ----------------------------------------------

// Öffnet den Eintrag eines Journals für eine Periode bzw. legt ihn an.
// Liefert true, wenn ein Tab geöffnet wurde. Alle Journal-Einstiege
// (Kommandos, Kalender-Klick, Navigations-Block) laufen hier durch.
// 4T-000631 (Epic 3E-000102): inheritGroup setzen NUR die Dokument-Klick-
// Aufrufer (Navigations-Block); Kalender-Panel und Kommandos bleiben
// ungruppiert — ein Flag am Wrapper selbst würde sie falsch eingruppieren.
// 4T-001311 (Epic 3E-000235): `imSelbenReiter` zeigt den Eintrag im Reiter von
// `quellPfad`, statt einen weiteren zu oeffnen — das Blaettern mit den Pfeilen
// des Navigations-Blocks. Ohne einen passenden Quell-Reiter (etwa aus einer
// Vorschau-Flaeche heraus) faellt der Weg auf das gewohnte Oeffnen zurueck.
export async function openJournalEntry(
  journal,
  period,
  { inheritGroup = false, imSelbenReiter = false, quellPfad = null } = {},
) {
  // Zeigt den Eintrag: im vorhandenen Reiter oder in einem neuen. Liefert
  // false, wenn der Nutzer den Wechsel abgebrochen hat.
  const zeige = async (pfad) => {
    if (imSelbenReiter) {
      const { ersetzeTabDurchDatei, reiterFuerPfad } = await import('../tabs/tab-ersetzen.js');
      const stelle = reiterFuerPfad(quellPfad);
      if (stelle) return await ersetzeTabDurchDatei(stelle.paneIdx, stelle.tabIdx, pfad);
    }
    await openInPane(state.activePaneIndex, [pfad], { inheritGroup });
    return true;
  };
  if (!period || !periodAllowed(journal, period)) {
    showStatusbarHint('journal.outOfRange', { duration: 3500, error: true });
    return false;
  }
  const resolved = resolveEntryPath(journal, period);
  if (!resolved.ok) {
    showStatusbarHint('journal.badPattern', { duration: 3500, error: true });
    return false;
  }
  let stat;
  try {
    stat = await api.journalsStatEntry(resolved.relPath);
  } catch {
    stat = null;
  }
  if (!stat || !stat.ok) {
    showStatusbarHint('journal.createFailed', { duration: 3500, error: true });
    return false;
  }
  if (stat.exists) {
    await pflegeEigenschaftenNach(journal, period, resolved.relPath, stat.path);
    return await zeige(stat.path);
  }
  const content = await buildEntryContent(journal, period, resolved.relPath);
  if (content === null) return false;
  let created;
  try {
    created = await api.journalsCreateEntry(resolved.relPath, content.text);
  } catch {
    created = null;
  }
  if (!created || !created.ok) {
    showStatusbarHint('journal.createFailed', { duration: 3500, error: true });
    return false;
  }
  if (!(await zeige(created.path))) return false;
  // Race (existed): Datei war inzwischen da — nur öffnen, kein Cursor-Sprung.
  if (!created.existed && content.cursorOffset !== null) {
    jumpToOffsetInActiveTab(content.cursorOffset);
  }
  return true;
}

// --- 4T-001407 (Epic 3E-000244): Massen-Nachpflege eines ganzen Journals ------------

// „Journal-Eigenschaften nachtragen": alle vorhandenen Einträge EINES Journals
// auf den vollständigen Eigenschaften-Satz bringen. Der Ablauf ist dreistufig —
// Journal wählen, Vorschau mit Zahlen bestätigen, ausführen und melden —, weil
// der Lauf viele Dateien des Anwenders auf einmal ändert und nicht
// zurückgenommen werden kann. Es gilt dieselbe Ergänzungs-Regel wie beim Öffnen
// (AE2 des Epics): vorhandene Werte bleiben stehen.
export async function trageJournalEigenschaftenNach() {
  const config = await journalsConfigOrHint();
  if (!config) return;
  if (config.journals.length === 0) {
    showStatusbarHint('journal.noJournals', { duration: 3500, error: true });
    return;
  }
  const journal = await pickJournal(config.journals, t('journal.nachtragen.pick'));
  if (!journal) return;

  // Schritt 1: den Datei-Bestand unter dem statischen Ordner-Präfix holen und
  // den Perioden des Journals zuordnen. Fremde Dateien im selben Ordner bleiben
  // dabei liegen und zählen nicht mit.
  let scan;
  try {
    scan = await api.journalsScanEintraege(ordnerPraefix(journal));
  } catch {
    scan = null;
  }
  if (!scan || !scan.ok) {
    showStatusbarHint('journal.nachtragen.failed', { duration: 3500, error: true });
    return;
  }
  const { treffer } = ordneEintraegeZu(journal, scan.relPaths);
  if (treffer.length === 0) {
    showStatusbarHint('journal.nachtragen.keine', { duration: 3500 });
    return;
  }
  const eintraege = treffer.map((t2) => ({
    relPath: t2.relPath,
    properties: journalProperties(journal, t2.period),
  }));

  // Schritt 2: Vorschau und Bestätigung. Die Zahl der wirklich zu ändernden
  // Einträge steht erst nach dem Lesen fest; genannt wird deshalb die Zahl der
  // geprüften Einträge und, als Obergrenze, dieselbe Zahl als „zu ändern".
  let bestaetigt;
  try {
    bestaetigt = await api.journalsConfirmNachtragen({
      journal: journal.name || journal.id,
      geprueft: eintraege.length,
      zuAendern: eintraege.length,
    });
  } catch {
    bestaetigt = false;
  }
  if (!bestaetigt) return;

  // Schritt 3: ausführen und das Ergebnis melden.
  let ergebnis;
  try {
    ergebnis = await api.journalsErgaenzePropertiesBatch(eintraege);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    showStatusbarHint('journal.nachtragen.failed', { duration: 3500, error: true });
    return;
  }
  // showStatusbarHint kennt keine Platzhalter, aber einen fertigen Text; die
  // Ersetzung läuft deshalb hier.
  const meldung = t('journal.nachtragen.fertig')
    .replace('{geaendert}', String(ergebnis.geaendert))
    .replace('{unveraendert}', String(ergebnis.unveraendert))
    .replace('{fehler}', String(ergebnis.fehler));
  showStatusbarHint('journal.nachtragen.fertig', {
    duration: 6000,
    error: ergebnis.fehler > 0,
    text: meldung,
  });
}

// --- Kommandos ---------------------------------------------------------------------

// „Heutiger Journal-Eintrag": Tages-Journale des Bereichs; bei mehreren
// Auswahl-Popup (Task-Vorgabe).
export async function openTodayJournalEntry() {
  const config = await journalsConfigOrHint();
  if (!config) return;
  const dayJournals = config.journals.filter((j) => j.granularity === 'day');
  if (dayJournals.length === 0) {
    showStatusbarHint('journal.noDayJournals', { duration: 3500, error: true });
    return;
  }
  const journal = await pickJournal(dayJournals, t('journal.pick.title'));
  if (!journal) return;
  await openJournalEntry(journal, periodOf(Date.now(), 'day'));
}

// „Journal-Eintrag für Datum…": Datums-Dialog (ISO-Form), dann Journal-
// Auswahl über alle Journale des Bereichs; die Periode ist die des
// gewählten Datums in der Granularität des Journals.
export async function openJournalEntryForDate() {
  const config = await journalsConfigOrHint();
  if (!config) return;
  const value = await showNameInputDialog({
    title: t('journal.datePicker.title'),
    description: t('journal.datePicker.description'),
    initialValue: msToIsoDate(Date.now()),
    okLabel: t('dialog.ok'),
    validate: (v) =>
      isoDateToMs(String(v || '').trim()) === null ? 'journal.datePicker.invalid' : null,
  });
  if (!value) return;
  const dateMs = isoDateToMs(String(value).trim());
  if (dateMs === null) return;
  const journal = await pickJournal(config.journals, t('journal.pick.title'));
  if (!journal) return;
  await openJournalEntry(journal, periodOf(dateMs, journal.granularity));
}
