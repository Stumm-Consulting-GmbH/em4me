// 4T-000435 (Epic 3E-000081): Journal-Navigations-Block — Renderer-seitige
// Befüllung des perspective-journal-nav-Fence (Muster frontmatter-query-view).
//
// Der Fence rendert (markdown.js) als leerer Platzhalter
// <div class="perspective-journal-nav">. Dieses Modul ermittelt den Kontext
// aus dem Datei-Pfad des Eintrags (bereichsrelativer Pfad-Abgleich gegen die
// Schema-Auflösung des Perioden-Kerns über alle Journale des Bereichs,
// findPeriodForPath) und baut die Navigation: aktuelle Periode groß, eine
// Zusatz-Zeile („Diese Woche" bei aktueller Periode), darüber die
// übergeordneten Perioden desselben Regals (Monat, Quartal, Jahr — soweit
// als Journal vorhanden, Lücken werden ausgelassen) und Pfeile zu voriger/
// nächster Periode (an den Journal-Grenzen gekappt). Alle Klicks laufen
// über den gemeinsamen Öffnen-/Anlage-Pfad aus 4T-000433; fehlende Einträge
// werden angelegt.
//
// Modus-agnostisch: derselbe Füll-Lauf hängt an applyRenderPipeline
// (Render-Pane, Reading, Notizen-Vorschau) und am Live-Block-Widget
// (_enhance, Listener pro Mount). Außerhalb eines Journal-Eintrags (kein
// Bereich, kein Pfad-Treffer) rendert der Block den lokalisierten Hinweis.
// Für den PDF-Export stellt waitForJournalNavIdle die Idle-Barriere; der
// Portable-Export ersetzt den Fence über replaceJournalNavFencesForExport
// durch die statische Perioden-Beschriftung ohne Anlage-Links.
'use strict';

import { getLanguage, t } from '../../i18n.js';
import { api } from '../app/api.js';
// 4T-001326 (Epic 3E-000236): gemeinsame Plausibilitäts-Prüfung beider Journal-Blöcke.
import { pruefeBlockPfad, zeigeBlockFehler } from './journal-pfad-pruefung.js';
import {
  findPeriodForPath,
  nextPeriod,
  periodDistance,
  periodOf,
  prevPeriod,
  replaceJournalNavFences,
  resolveEntryPath,
} from '../../../shared/journal-core.js';

// --- Perioden-Beschriftung ---------------------------------------------------------

// Anzeige-Label einer Periode, lokalisiert: Tag und Monat über Intl in der
// App-Sprache, Woche/Quartal über i18n-Schablonen, Jahr als Zahl.
export function periodLabel(period) {
  const lang = getLanguage();
  const d = new Date(period.startMs);
  switch (period.granularity) {
    case 'day':
      return new Intl.DateTimeFormat(lang, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    case 'week': {
      const week = period.key.split('-W')[1] || '';
      return t('journalNav.weekLabel').replace('{week}', String(Number(week)));
    }
    case 'month':
      return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(d);
    case 'quarter': {
      const [year, q] = period.key.split('-Q');
      return t('journalNav.quarterLabel').replace('{quarter}', q).replace('{year}', year);
    }
    case 'year':
      return period.key;
    default:
      return period.key;
  }
}

// 4T-001489 (Epic 3E-000276): Zusatz-Zeile mit der zeitlichen Einordnung der
// Periode zur Gegenwart — „Heute", „gestern", „vor 3 Wochen", „in 2 Jahren".
//
// Bis dahin war sie ALLEIN bei der laufenden Periode belegt und sonst leer,
// also genau dort nicht, wo die Frage „wie weit ist das weg" ueberhaupt erst
// entsteht (Befund des Product Owners vom 2026-09-06).
//
// Gerechnet wird in der EINHEIT DER PERIODE und nicht in Tagen (Entscheidung E2
// des Epics): Ein Wochen-Eintrag sagt „letzte Woche" und nicht „vor sieben
// Tagen", weil der Block eine Perioden-Navigation ist und eine fremde Einheit
// zum Umrechnen zwaenge.
//
// Formuliert wird ueber die Standard-Funktion der Laufzeit-Umgebung statt ueber
// eigene Schluessel je Sprache und Abstand (Entscheidung E1). `numeric: 'auto'`
// liefert dabei die Sonderformen des unmittelbaren Nachbarn — „gestern" statt
// „vor 1 Tag". Die Granularitaeten des Journal-Kerns heissen bereits wie die
// Einheiten von `Intl.RelativeTimeFormat`, eine Uebersetzungs-Tabelle entfaellt.
//
// **Die Quartals-Einheit ist gemessen, nicht angenommen** (2026-09-07, im
// Renderer der Anwendung): Electron beherrscht sie in allen fuenf
// Oberflaechen-Sprachen. Der im Task vorgesehene Rueckfall auf eine eigene
// Schablone entfaellt damit. Zwei Prueffaelle halten die Zusicherung fest,
// je einer pro Umgebung: journal-nav-einordnung.test.js fuer den Unit-Lauf und
// journal-einordnung.spec.js fuer die Laufzeit der Anwendung — nur der zweite
// wuerde einen ICU-Wegfall bei einem Electron-Sprung sehen.
//
// Abstand null behaelt die bestehenden fuenf Schluessel: Sie sind kuerzer und
// vertrauter als „diese Woche" aus der Standard-Formulierung.
// Exportiert fuer den Unit-Prueffall (Muster buildQueryTaskListDom).
export function periodRelationLine(period) {
  const laufend = periodOf(Date.now(), period.granularity);
  const abstand = periodDistance(laufend, period);
  if (abstand === null) return null;
  if (abstand === 0) {
    const keys = {
      day: 'journalNav.today',
      week: 'journalNav.thisWeek',
      month: 'journalNav.thisMonth',
      quarter: 'journalNav.thisQuarter',
      year: 'journalNav.thisYear',
    };
    return t(keys[period.granularity]);
  }
  return new Intl.RelativeTimeFormat(getLanguage(), { numeric: 'auto' }).format(
    abstand,
    period.granularity,
  );
}

// --- Kontext-Ermittlung --------------------------------------------------------------

// Journal und Periode des Eintrags-Pfads: erster Treffer über alle Journale
// des Bereichs (Konfigurations-Reihenfolge). null = kein Journal-Eintrag.
function contextForPath(config, rootPath, basePath) {
  if (!config || !rootPath || !basePath) return null;
  const rel = api.relative(rootPath, basePath);
  if (!rel || rel.startsWith('..')) return null;
  const relPath = rel.replace(/\\/g, '/');
  for (const journal of config.journals) {
    const period = findPeriodForPath(journal, relPath);
    if (period) return { journal, period };
  }
  return null;
}

// Übergeordnete Journale desselben Regals: pro gröberer Granularität das
// erste Journal (Konfigurations-Reihenfolge) mit gleichem Regal-Wert;
// Lücken (keine solche Granularität im Regal) werden ausgelassen.
function parentTargets(config, journal, period) {
  const order = ['day', 'week', 'month', 'quarter', 'year'];
  const startIdx = order.indexOf(period.granularity);
  const out = [];
  for (const granularity of order.slice(startIdx + 1)) {
    const parent = config.journals.find(
      (j) => j.granularity === granularity && j.shelf === journal.shelf,
    );
    if (parent) out.push({ journal: parent, period: periodOf(period.startMs, granularity) });
  }
  return out;
}

// --- Befüllung -----------------------------------------------------------------------

// Klick-Ziel: gemeinsamer Öffnen-/Anlage-Pfad. Zur Laufzeit importiert
// (dynamic import), um den Modul-Zyklus views -> journal-nav-view ->
// journals -> templates -> views zur Lade-Zeit zu vermeiden.
async function openTarget(journal, period) {
  const { openJournalEntry } = await import('./journals.js');
  // 4T-000631 (Epic 3E-000102): der Navigations-Block liegt im Dokument-Inhalt —
  // der geöffnete Eintrag erbt die Tab-Gruppe des Quell-Dokuments.
  await openJournalEntry(journal, period, { inheritGroup: true });
}

// 4T-001311 (Epic 3E-000235): Blättern mit den Pfeilen. Der Nachbar-Eintrag löst
// den bisherigen im selben Reiter ab, statt einen weiteren zu öffnen; der
// Reiter behält dabei seinen Ansichts- und Änderungs-Modus.
//
// Entscheidung E1 des Product Owners vom 2026-08-30: Das gilt nur für die
// Pfeile. Die Verweise auf Monat, Quartal und Jahr öffnen weiterhin einen
// eigenen Reiter, weil sie die Ebene wechseln statt zu blättern — ein
// Ebenen-Wechsel, der den Ausgangs-Eintrag schließt, nähme dem Anwender die
// Stelle, zu der er zurückwill.
async function blaettereZu(journal, period, basePath) {
  const { openJournalEntry } = await import('./journals.js');
  await openJournalEntry(journal, period, {
    inheritGroup: true,
    imSelbenReiter: true,
    quellPfad: basePath,
  });
}

function buildLink(label, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'journal-nav-link';
  btn.textContent = label;
  if (title) btn.title = title;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// 4T-001491 (Epic 3E-000276): Markierung vorhandener Einträge.
//
// Der Zeitleisten-Block und der Kalender des Seitenbereichs setzen an jede
// Periode einen Punkt, deren Eintrag es schon gibt; der Navigations-Block tat
// das an keiner Stelle. Damit sah man einem Klick nicht an, ob er einen
// vorhandenen Eintrag öffnet oder einen neuen anlegt (Befund des Product Owners
// vom 2026-09-06).
//
// **Ein Aufruf je Block-Aufbau, kein Zwischenspeicher** (Entscheidung, gemessen
// statt vermutet — siehe Lösungs-Kapitel des Tasks). Der Block zeigt höchstens
// sechs Perioden: bis zu drei übergeordnete, die aktuelle und zwei Nachbarn.
// Der Zeitleisten-Block hält seinen Zwischenspeicher, weil er bis zu 366 Tage
// abfragt; hier wäre er Aufwand ohne Ertrag und müsste zusätzlich nach jeder
// Eintrags-Anlage verworfen werden, damit der Block nicht veraltet weiterzeigt.
//
// Schlüssel ist Journal UND Periode: Zwei Journale desselben Regals können
// dieselbe Periode führen und dabei auf verschiedene Dateien zeigen.
const eintragsSchluessel = (journal, period) => `${journal.id}|${period.key}`;

// Welche der übergebenen Ziele bereits eine Datei haben. Ein Fehlschlag der
// Abfrage liefert die leere Menge: Der Block erscheint dann ohne Markierungen
// statt mit falschen — ein Punkt, der eine Datei behauptet, die es nicht gibt,
// wäre schlimmer als gar keiner.
// Exportiert fuer den Unit-Prueffall: Die Zahl der Aufrufe und das Verhalten
// im Fehlschlag lassen sich am gebauten Programm nicht messen, weil
// `window.api` aus der contextBridge eingefroren ist und sich nicht umhuellen
// laesst (am 2026-09-07 gemessen).
export async function ladeVorhandene(ziele) {
  const pfadZuSchluessel = new Map();
  for (const { journal, period } of ziele) {
    const aufgeloest = resolveEntryPath(journal, period);
    if (!aufgeloest.ok) continue;
    const liste = pfadZuSchluessel.get(aufgeloest.relPath) || [];
    liste.push(eintragsSchluessel(journal, period));
    pfadZuSchluessel.set(aufgeloest.relPath, liste);
  }
  if (pfadZuSchluessel.size === 0) return new Set();
  let result;
  try {
    result = await api.journalsEntriesExist([...pfadZuSchluessel.keys()]);
  } catch {
    result = null;
  }
  const vorhanden = new Set();
  if (result && result.ok && result.exists) {
    for (const [relPath, schluessel] of pfadZuSchluessel) {
      if (result.exists[relPath]) for (const s of schluessel) vorhanden.add(s);
    }
  }
  return vorhanden;
}

// Punkt-Markierung an ein Element hängen. Die Klasse ist dieselbe wie im
// Kalender und im Zeitleisten-Block (`has-entry`), damit die drei Orte nicht
// auseinanderlaufen; die Formatvorlage setzt sie je Element-Art um.
function markiereVorhanden(element, journal, period, vorhanden) {
  if (vorhanden.has(eintragsSchluessel(journal, period))) element.classList.add('has-entry');
  return element;
}

// 4T-001490 (Epic 3E-000276): Beschriftung einer Nachbar-Periode neben ihrer
// Blaetter-Schaltflaeche. `seite` unterscheidet die beiden nur fuer die
// Formatvorlage; der Name selbst kommt aus derselben Quelle wie der
// Kurzhinweis der Schaltflaeche, damit beide nicht auseinanderlaufen koennen.
function neighborLabel(period, seite) {
  const span = document.createElement('span');
  span.className = `journal-nav-neighbor journal-nav-neighbor-${seite}`;
  span.textContent = periodLabel(period);
  return span;
}

async function fillJournalNav(el, basePath) {
  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  const config = result && result.ok && result.hasArea ? result.config : null;
  const context = config ? contextForPath(config, result.rootPath, basePath) : null;
  el.innerHTML = '';
  if (!context) {
    const hint = document.createElement('div');
    hint.className = 'journal-nav-hint';
    hint.textContent = t('journalNav.noEntry');
    el.appendChild(hint);
    return;
  }
  const { journal, period } = context;

  // 4T-001326 (Epic 3E-000236): Spricht der Block über den Eintrag, in dem er
  // steht? Erst danach wird gebaut — eine falsche Navigation ist schlimmer als
  // keine, weil sie plausibel aussieht und deshalb geglaubt wird.
  const rel = api.relative(result.rootPath, basePath);
  const pruefung = await pruefeBlockPfad(el, basePath, rel ? rel.replace(/\\/g, '/') : '');
  if (!pruefung.ok) {
    zeigeBlockFehler(el, pruefung.text);
    return;
  }

  // Übergeordnete Perioden desselben Regals (Lücken ausgelassen).
  const parents = parentTargets(config, journal, period);
  const prev = prevPeriod(journal, period);
  const next = nextPeriod(journal, period);

  // 4T-001491: Alle Perioden des Blocks in EINEM Aufruf erfragen. Die
  // Bestimmung steht vor dem Bauen, damit die Ziele vollständig sind — ein
  // Aufruf je Element wären bis zu sechs.
  const vorhanden = await ladeVorhandene([
    ...parents.map((t) => ({ journal: t.journal, period: t.period })),
    { journal, period },
    ...(prev ? [{ journal, period: prev }] : []),
    ...(next ? [{ journal, period: next }] : []),
  ]);

  if (parents.length > 0) {
    const row = document.createElement('div');
    row.className = 'journal-nav-parents';
    for (const target of parents) {
      const link = buildLink(periodLabel(target.period), target.period.key, () =>
        openTarget(target.journal, target.period),
      );
      row.appendChild(markiereVorhanden(link, target.journal, target.period, vorhanden));
    }
    el.appendChild(row);
  }

  // Aktuelle Periode mit Pfeilen zu voriger/nächster (an Grenzen gekappt).
  const row = document.createElement('div');
  row.className = 'journal-nav-current';
  if (prev) {
    const btn = buildLink('‹', periodLabel(prev), () => blaettereZu(journal, prev, basePath));
    btn.classList.add('journal-nav-arrow');
    // 4T-001490 (Epic 3E-000276): Der Name der Ziel-Periode steht AUSSEN neben
    // seiner Schaltflaeche — links vom Rueckwaerts-Pfeil, rechts vom
    // Vorwaerts-Pfeil. Das ergibt die Lese-Folge „voriger ‹ aktueller ›
    // naechster" und haelt die Zeile symmetrisch um die aktuelle Periode.
    //
    // Der Name bleibt AUSSERHALB der Schaltflaeche und ist nicht klickbar
    // (technische Entscheidung im Rahmen des Tasks): Das Bedienelement bleibt
    // damit genau ein Kasten mit einer Trefferflaeche, statt in Zeichen und
    // Beschriftung zu zerfallen. Der Kurzhinweis der Schaltflaeche bleibt
    // erhalten, weil er auch dort noch traegt, wo der Name aus Platzmangel
    // gekuerzt ist.
    row.appendChild(markiereVorhanden(neighborLabel(prev, 'prev'), journal, prev, vorhanden));
    row.appendChild(btn);
  }
  const title = document.createElement('div');
  title.className = 'journal-nav-title';
  // 4T-001491: Die Markierung der aktuellen Periode sitzt am Titel-Container
  // und nicht an seiner Beschriftung — sonst stuende der Punkt zwischen
  // Beschriftung und Zusatz-Zeile statt unter dem Element.
  markiereVorhanden(title, journal, period, vorhanden);
  const label = document.createElement('div');
  label.className = 'journal-nav-label';
  label.textContent = periodLabel(period);
  title.appendChild(label);
  const subText = periodRelationLine(period);
  if (subText) {
    const sub = document.createElement('div');
    sub.className = 'journal-nav-sub';
    sub.textContent = subText;
    title.appendChild(sub);
  }
  row.appendChild(title);
  if (next) {
    const btn = buildLink('›', periodLabel(next), () => blaettereZu(journal, next, basePath));
    btn.classList.add('journal-nav-arrow');
    row.appendChild(btn);
    row.appendChild(markiereVorhanden(neighborLabel(next, 'next'), journal, next, vorhanden));
  }
  el.appendChild(row);
}

// --- Einstiege -----------------------------------------------------------------------

// Laufende Füll-Läufe für die PDF-Idle-Barriere (Muster frontmatter-query-view).
const pendingFills = new Set();

export function applyJournalNavIfPresent(container, basePath) {
  const blocks = container.querySelectorAll('.perspective-journal-nav');
  if (blocks.length === 0) return;
  for (const el of blocks) {
    const run = fillJournalNav(el, basePath || '').catch(() => {});
    pendingFills.add(run);
    run.finally(() => pendingFills.delete(run));
  }
}

// Idle-Barriere: löst auf, sobald alle aktuell laufenden Füll-Läufe fertig
// sind (der PDF-Export druckt sonst den leeren Platzhalter).
export async function waitForJournalNavIdle() {
  while (pendingFills.size > 0) {
    await Promise.allSettled([...pendingFills]);
  }
}

// --- Portable-Export -----------------------------------------------------------------

// Ersetzt die journal-nav-Fences im exportierten Text durch die statische
// Perioden-Beschriftung ohne Anlage-Links (Task-Vorgabe Export-Verhalten;
// die Fence-Erkennung liegt rein und unit-getestet im Perioden-Kern).
// Außerhalb eines Journal-Eintrags bleibt der Fence unverändert (der
// Empfänger sieht den Quelltext-Block, keine irreführende Beschriftung).
export async function replaceJournalNavFencesForExport(text, basePath) {
  const source = String(text == null ? '' : text);
  if (replaceJournalNavFences(source, '') === source) return source;
  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  const config = result && result.ok && result.hasArea ? result.config : null;
  const context = config ? contextForPath(config, result.rootPath, basePath) : null;
  if (!context) return source;
  return replaceJournalNavFences(source, `**${periodLabel(context.period)}**`);
}
