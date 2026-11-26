// 4T-002737 (Epic 3E-000396): Ablauf des Kanals `journals:uebertrageAufgaben`,
// der die offenen Aufgaben des jüngsten früheren Eintrags eines Journals in den
// Eintrag der Ziel-Periode überträgt.
//
// Die Logik liegt hier, getrennt von der Registrierung in area-journals.js,
// damit sie ohne Electron prüfbar ist: Jeder Zugriff auf Platte, Einstellungen,
// Puffer-Schicht und Dokument-Historie kommt als Abhängigkeit herein. Was
// übertragen wird, plant der Kern (src/shared/journal-uebertrag.js); hier
// stehen Quelle und Ziel (V1), die Prüfungen (V8, V16) und die Reihenfolge des
// Schreibens samt Rückweg (V9). Kein Zustand zwischen zwei Aufrufen, keine Uhr:
// Die Ziel-Periode kommt allein aus dem Zeitwert der Eingabe.
//
// Daneben die Auflistung der Markdown-Dateien unter einem Ordner des Bereichs,
// die auch der Kanal `journals:scanEintraege` benutzt.
'use strict';

const path = require('node:path');
const fsSync = require('node:fs');
const { isInsideArea } = require('../area/area-path');
const {
  normalizeJournalsConfig,
  periodOf,
  resolveEntryPath,
} = require('../../shared/journal-core');
const { ordneEintraegeZu, ordnerPraefix } = require('../../shared/journal-nachpflege');
const { planeUebertrag } = require('../../shared/journal-uebertrag');
const { TASK_STATE_DEFAULTS } = require('../../shared/markdown/plugins/tasks.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { buildTaskEnv } = require('../index/task-env.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { normalizeForCompare } = require('../documents/save-guard.js');

// Grenze je Eintrag (V16): 5 MB in Bytes.
const MAX_BYTES = 5 * 1024 * 1024;
// Höchstzahl der Pfade, die das Fenster als ungespeichert nennen darf.
const MAX_UNGESPEICHERT = 500;
// Kappung der Auflistung, wie bisher in `journals:scanEintraege`.
const MAX_DATEIEN = 20000;
// BOM-Strip wie file:read und task:applyLineEdit (Escape-Form, kein
// unsichtbares Literal).
const BOM_RE = new RegExp('^\\uFEFF');

// Zeichen des Status «Übertragen» aus den vorbelegten Status, über den Namen.
const ZEICHEN_UEBERTRAGEN = (TASK_STATE_DEFAULTS.find((s) => s.name === 'migrated') || {}).char;

/**
 * Alle Markdown-Dateien unterhalb eines bereichsrelativen Ordners, als
 * bereichsrelative Pfade mit '/'. '' ist die Bereichs-Wurzel. Liegt der Ordner
 * außerhalb des Bereichs, `{ ok: false, error: 'outside-area' }`; ein fehlender
 * oder unlesbarer Ordner liefert eine leere Liste.
 *
 * @param {string} rootPath Bereichs-Wurzel.
 * @param {string} ordner Bereichsrelativer Ordner.
 * @returns {{ok: true, relPaths: string[], gekappt: boolean}|{ok: false, error: string}}
 */
function listeMarkdownDateien(rootPath, ordner) {
  const rel = typeof ordner === 'string' ? ordner : '';
  const wurzel = rel === '' ? rootPath : path.resolve(rootPath, rel);
  if (!isInsideArea(rootPath, wurzel) && wurzel !== rootPath) {
    return { ok: false, error: 'outside-area' };
  }
  const gefunden = [];
  let gekappt = false;
  const lauf = (abs) => {
    if (gekappt) return;
    let eintraege;
    try {
      eintraege = fsSync.readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // fehlender oder unlesbarer Ordner: nichts zu holen
    }
    for (const e of eintraege) {
      if (gekappt) return;
      const kind = path.join(abs, e.name);
      if (e.isDirectory()) lauf(kind);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        // Abgeschnitten ist die Auflistung erst, wenn eine weitere
        // Markdown-Datei über die Grenze hinaus da ist.
        if (gefunden.length >= MAX_DATEIEN) {
          gekappt = true;
          return;
        }
        gefunden.push(path.relative(rootPath, kind).split(path.sep).join('/'));
      }
    }
  };
  lauf(wurzel);
  return { ok: true, relPaths: gefunden, gekappt };
}

function nameOhneEndung(abs) {
  return path.parse(abs).name;
}

// Weicht der Stand irgendeines Fensters vom Platten-Stand ab? Ohne Stände
// nein. Verglichen wird wie beim Speicher-Schutz ohne BOM und mit
// vereinheitlichten Zeilenenden, weil der Reiter seinen Text in dieser Form
// hält (save-guard.js). Eine Antwort, die keine Liste ist, gilt als
// abweichend: Eine fehlerhafte Auskunft darf den Kanal nicht weniger
// vorsichtig machen.
function pufferWeichtAb(staende, platte) {
  if (!Array.isArray(staende)) return true;
  const vergleich = normalizeForCompare(platte);
  return staende.some((s) => typeof s !== 'string' || normalizeForCompare(s) !== vergleich);
}

// Liste der vom Fenster genannten ungespeicherten Pfade als Vergleichs-Schlüssel.
// Fehlt das Feld, ist sie leer. Ein vorhandenes Feld, das keine Liste aus Texten
// ist, und mehr als 500 Einträge sind eine ungültige Eingabe (null): Eine
// fehlerhafte Liste darf den Kanal nicht weniger vorsichtig machen.
function ungespeichertListe(roh) {
  if (roh === undefined || roh === null) return new Set();
  if (!Array.isArray(roh) || roh.length > MAX_UNGESPEICHERT) return null;
  if (!roh.every((p) => typeof p === 'string')) return null;
  // AUSLEGUNG: Vor dem Vergleichs-Schlüssel wird der Pfad mit path.normalize in
  // die Form der Plattform gebracht, damit «/» und «\» unter Windows gleich
  // gelten; leere Texte entfallen.
  return new Set(roh.filter((p) => p !== '').map((p) => pathCompareKey(path.normalize(p))));
}

// Das Journal und sein roher Eintrag der Bereichsdatei. Modus und Abschnitt
// des Übertrags liest der Kanal aus dem rohen Eintrag; die Normalisierung
// (journal-model.js) führt dieselben Felder mit denselben Vorgaben.
function findeJournal(roheSektion, journalId) {
  const konfig = normalizeJournalsConfig(roheSektion);
  const journal = konfig ? konfig.journals.find((j) => j.id === journalId) : null;
  if (!journal) return null;
  const roheListe = roheSektion && Array.isArray(roheSektion.journals) ? roheSektion.journals : [];
  const roh =
    roheListe.find(
      (r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id.trim() === journalId,
    ) || {};
  return { journal, roh };
}

/**
 * Führt den Übertrag aus.
 *
 * @param {object} a Abhängigkeiten.
 * @param {{rootPath: string}|null} a.bereich Bereich des absendenden Fensters.
 * @param {object|null} a.fenster Absendendes Fenster (Besitzer der Historie).
 * @param {(rootPath: string) => Promise<object|undefined>} a.leseJournalsKonfig
 *   Rohe Journal-Sektion der Bereichsdatei.
 * @param {(rootPath: string, ordner: string) => object} a.listeEintraege
 *   Auflistung der Markdown-Dateien (Form von `listeMarkdownDateien`).
 * @param {(abs: string) => Promise<boolean>} a.istDatei Existiert die Datei?
 * @param {(abs: string) => Promise<number>} a.groesse Größe der Datei in Bytes,
 *   ohne sie zu lesen.
 * @param {(abs: string) => Promise<string>} a.leseDatei Datei als UTF-8-Text.
 * @param {(abs: string, text: string) => Promise<void>} a.schreibeDatei
 *   Atomares Schreiben ohne Self-Write-Merker.
 * @param {(abs: string) => string[]} a.pufferTexte Die Stände, die die Fenster
 *   der Puffer-Schicht für diese Datei gemeldet haben, je Fenster einer (leer,
 *   wenn keines einen hält). Darunter sind Stände, die dem Platten-Stand
 *   gleichen (jeder Reiter mit Editor meldet seinen Text, auch nach stillem
 *   Neuladen); ungespeichert ist erst ein abweichender Stand, gleich in
 *   welchem Fenster.
 * @param {() => object} a.einstellungen Werte für `buildTaskEnv`
 *   (`disabledExtensions`, `tasksConfig`, `taskStates`).
 * @param {object} [a.historie] `resolveHistoryFor`, `readPreviousTextFor`,
 *   `recordMddOnSave` der Dokument-Historie.
 * @param {(meldung: string, fehler?: unknown) => void} [a.protokoll] Warnung.
 * @param {object} eingabe `{ journalId, periodStartMs, ungespeichert }` vom Fenster.
 * @returns {Promise<object>} Antwort des Kanals.
 */
async function fuehreUebertragAus(a, eingabe) {
  const protokoll = typeof a.protokoll === 'function' ? a.protokoll : () => {};
  const e = eingabe && typeof eingabe === 'object' ? eingabe : {};
  const journalId = typeof e.journalId === 'string' ? e.journalId : '';
  if (
    journalId === '' ||
    typeof e.periodStartMs !== 'number' ||
    !Number.isFinite(e.periodStartMs)
  ) {
    return { ok: false, grund: 'ungueltig' };
  }
  const fensterUngespeichert = ungespeichertListe(e.ungespeichert);
  if (fensterUngespeichert === null) return { ok: false, grund: 'ungueltig' };
  // AUSLEGUNG: Ein Fenster ohne Bereich ist eine ungültige Eingabe.
  const bereich = a.bereich;
  if (!bereich || typeof bereich.rootPath !== 'string') return { ok: false, grund: 'ungueltig' };
  const root = bereich.rootPath;

  const gefunden = findeJournal(await a.leseJournalsKonfig(root), journalId);
  if (!gefunden) return { ok: false, grund: 'ungueltig' };
  const { journal, roh } = gefunden;
  const zielPeriode = periodOf(e.periodStartMs, journal.granularity);
  const zielRel = zielPeriode ? resolveEntryPath(journal, zielPeriode) : null;
  if (!zielRel || !zielRel.ok) return { ok: false, grund: 'ungueltig' };
  const zielAbs = path.resolve(root, zielRel.relPath);
  if (!isInsideArea(root, zielAbs)) return { ok: false, grund: 'ungueltig' };

  // (1) Erweiterungen «Journale» und «Aufgaben».
  const werte = (typeof a.einstellungen === 'function' && a.einstellungen()) || {};
  const aus = Array.isArray(werte.disabledExtensions) ? werte.disabledExtensions : [];
  const umgebung = buildTaskEnv(werte);
  if (!isExtensionEnabled('journals', aus) || !umgebung.enabled) {
    return { ok: false, grund: 'erweiterung-aus' };
  }

  // (2) Ziel muss existieren.
  if (!(await a.istDatei(zielAbs))) return { ok: false, grund: 'kein-ziel' };

  // (3) Quelle: jüngster vorhandener Eintrag mit Periode vor der des Ziels.
  const liste = a.listeEintraege(root, ordnerPraefix(journal));
  if (!liste || !liste.ok) return { ok: false, grund: 'ungueltig' };
  // Eine abgeschnittene Auflistung kann den jüngsten früheren Eintrag
  // verfehlen; dann wird nichts übertragen statt aus dem falschen Eintrag.
  if (liste.gekappt) return { ok: false, grund: 'zu-viele-dateien' };
  const { treffer } = ordneEintraegeZu(journal, liste.relPaths, { aroundMs: e.periodStartMs });
  const frueher = treffer.filter((t) => t.period.startMs < zielPeriode.startMs);
  if (frueher.length === 0) return { ok: false, grund: 'kein-frueherer-eintrag' };
  const quelleAbs = path.resolve(root, frueher[frueher.length - 1].relPath);
  if (!isInsideArea(root, quelleAbs)) return { ok: false, grund: 'ungueltig' };
  const quelle = nameOhneEndung(quelleAbs);

  // (4) Ungespeicherte Stände, erster Teil: Liste des Fensters. Der zweite
  // Teil, die Puffer-Schicht des Hauptprozesses, braucht den Platten-Text und
  // folgt deshalb nach dem Lesen (5).
  // AUSLEGUNG: Sind beide Einträge ungespeichert, nennt die Antwort die Quelle.
  const antwortUngespeichert = (abs) => ({
    ok: false,
    grund: 'ungespeichert',
    eintrag: nameOhneEndung(abs),
  });
  for (const abs of [quelleAbs, zielAbs]) {
    if (fensterUngespeichert.has(pathCompareKey(abs))) return antwortUngespeichert(abs);
  }

  // (5) Größe vor dem Lesen, dann lesen; die Prüfung am gelesenen Text
  // bleibt als zweite Linie.
  const zuGrossAufDerPlatte = async () =>
    (await a.groesse(quelleAbs)) > MAX_BYTES || (await a.groesse(zielAbs)) > MAX_BYTES;
  let quellText;
  let zielText;
  try {
    if (await zuGrossAufDerPlatte()) return { ok: false, grund: 'zu-gross' };
    quellText = await a.leseDatei(quelleAbs);
    zielText = await a.leseDatei(zielAbs);
  } catch (err) {
    // AUSLEGUNG: Ist eine der beiden Dateien zwischen Bestimmen und Lesen
    // verschwunden oder unlesbar geworden, gilt das als Änderung.
    protokoll('Übertrag offener Aufgaben: Eintrag nicht lesbar', err);
    return { ok: false, grund: 'geaendert' };
  }
  if (
    Buffer.byteLength(quellText, 'utf8') > MAX_BYTES ||
    Buffer.byteLength(zielText, 'utf8') > MAX_BYTES
  ) {
    return { ok: false, grund: 'zu-gross' };
  }

  // Ungespeicherte Stände, zweiter Teil: Irgendein Fenster hält für Quelle
  // oder Ziel einen Stand, der vom Platten-Stand abweicht.
  const pruefePuffer = () => {
    for (const [abs, platte] of [
      [quelleAbs, quellText],
      [zielAbs, zielText],
    ]) {
      if (pufferWeichtAb(a.pufferTexte(abs), platte)) return antwortUngespeichert(abs);
    }
    return null;
  };
  const vorab = pruefePuffer();
  if (vorab) return vorab;

  // (6) Planen.
  const plan = planeUebertrag(quellText, zielText, {
    modus: roh.carryOverMode === 'remove' ? 'remove' : 'mark',
    abschnitt: typeof roh.carryOverSection === 'string' ? roh.carryOverSection : '',
    globalFilter: umgebung.globalFilter,
    statusTypeOf: umgebung.statusTypeOf,
    zeichen: ZEICHEN_UEBERTRAGEN,
  });
  if (!plan.ok) {
    if (plan.grund === 'nichts-offen' || plan.grund === 'abschnitt-fehlt') {
      return { ok: false, grund: plan.grund, quelle };
    }
    return { ok: false, grund: plan.grund };
  }

  // AUSLEGUNG: Die Historie wird nach dem Vorbild von task:applyLineEdit vor
  // dem Schreiben vorbereitet (Schaltung auflösen, vorigen Stand lesen) und
  // nach dem Schreiben beider Dateien eingetragen; ein Fehler der Vorbereitung
  // lässt den Eintrag für diese Datei aus. Sie steht vor der letzten Prüfung,
  // damit zwischen Prüfung und Schreiben nichts Asynchrones mehr liegt.
  const historie = await bereiteHistorie(
    a,
    [
      { abs: zielAbs, neu: plan.zielNeu },
      { abs: quelleAbs, neu: plan.quelleNeu },
    ],
    protokoll,
  );

  // (7) Unmittelbar vor dem Schreiben erneut lesen und vergleichen.
  try {
    // Eine inzwischen über die Grenze gewachsene Datei gilt als geändert.
    if (await zuGrossAufDerPlatte()) return { ok: false, grund: 'geaendert' };
    if ((await a.leseDatei(quelleAbs)) !== quellText || (await a.leseDatei(zielAbs)) !== zielText) {
      return { ok: false, grund: 'geaendert' };
    }
  } catch (err) {
    protokoll('Übertrag offener Aufgaben: Eintrag vor dem Schreiben nicht lesbar', err);
    return { ok: false, grund: 'geaendert' };
  }
  // Die Platten-Texte sind unverändert; die Puffer-Schicht kann inzwischen
  // einen neuen Stand tragen.
  const nachher = pruefePuffer();
  if (nachher) return nachher;

  // (8) Ziel, dann Quelle; (9) Rückweg.
  try {
    await a.schreibeDatei(zielAbs, plan.zielNeu);
  } catch (err) {
    protokoll('Übertrag offener Aufgaben: Ziel nicht geschrieben', err);
    return { ok: false, grund: 'schreibfehler' };
  }
  try {
    await a.schreibeDatei(quelleAbs, plan.quelleNeu);
  } catch (err) {
    protokoll(
      'Übertrag offener Aufgaben: Quelle nicht geschrieben, Ziel wird zurückgeschrieben',
      err,
    );
    let zielZurueck = true;
    try {
      await a.schreibeDatei(zielAbs, zielText);
    } catch (err2) {
      protokoll('Übertrag offener Aufgaben: Ziel nicht zurückgeschrieben', err2);
      zielZurueck = false;
    }
    return { ok: false, grund: 'schreibfehler', zielZurueck };
  }

  // (10) Dokument-Historie beider Dateien.
  await trageHistorieEin(a, historie, protokoll);

  // (11) Antwort.
  return {
    ok: true,
    anzahl: plan.anzahl,
    eingesetzt: plan.eingesetzt,
    quelle,
    einfuegungen: plan.einfuegungen,
  };
}

async function bereiteHistorie(a, dateien, protokoll) {
  const h = a.historie;
  if (!h || typeof h.resolveHistoryFor !== 'function') return [];
  const out = [];
  for (const d of dateien) {
    try {
      const recordHistory = (await h.resolveHistoryFor(a.fenster, d.abs, d.neu)).effective;
      if (!recordHistory) continue;
      const previousText = await h.readPreviousTextFor(d.abs);
      out.push({ ...d, previousText });
    } catch (err) {
      protokoll('Übertrag offener Aufgaben: Historie nicht vorbereitet', err);
    }
  }
  return out;
}

async function trageHistorieEin(a, historie, protokoll) {
  for (const d of historie) {
    try {
      const newTextNorm = d.neu.replace(BOM_RE, '').replace(/\r\n/g, '\n');
      await a.historie.recordMddOnSave(a.fenster, d.abs, d.previousText, newTextNorm);
    } catch (err) {
      protokoll('Übertrag offener Aufgaben: Historie nicht eingetragen', err);
    }
  }
}

module.exports = {
  fuehreUebertragAus,
  listeMarkdownDateien,
  ZEICHEN_UEBERTRAGEN,
  MAX_BYTES,
  MAX_UNGESPEICHERT,
};
