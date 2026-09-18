// 4T-001611 (Epic 3E-000252): Wo liegt der Datensatz mit dieser Kennung?
//
// `4T-001610` hat die Vorwärts-Zuordnung angelegt, also je Datei ihre
// Datensätze. Damit ist die Frage «welche Datensätze hat diese Datei»
// beantwortet, die eigentliche aber noch nicht. Dieses Modul dreht sie um: von
// der internen Kennung und vom fachlichen Schlüssel auf den Fundort.
//
// **Abgeleitet, nicht getrennt gepflegt.** Die beiden umgekehrten Zuordnungen
// entstehen aus der Vorwärts-Zuordnung und werden nie neben ihr geführt; damit
// können sie nicht auseinanderlaufen. Dasselbe Verhältnis haben `tagsPerFile`
// und `tagMap` im Bestand.
//
// **Zwischenspeicher gegen den Stand statt gegen eine Uhr** (Muster aus
// `profil-wertevorrat.js`): Eine Uhr rechnete ohne Änderung neu und mit
// Änderung zu spät. Gezählt werden **zwei** Stände — der des Index und der der
// Puffer-Overlay-Schicht. Der zweite ist hier nicht Kür: Ein gerade angelegter,
// noch nicht gespeicherter Datensatz soll auffindbar sein (E25), und die Platte
// meldet sich beim Tippen nicht.
//
// **Der Geltungsbereich ist die Tabelle und nicht der Bereich.** Die interne
// Kennung ist tabellen-lokal eindeutig (`4S-000887`), der fachliche Schlüssel
// ebenso. Zwei Tabellen dürfen dieselbe Kennung führen, und die Zuordnung muss
// das aushalten, statt eine der beiden zu verlieren; jede Auskunft nennt
// deshalb ihre Tabelle mit. Welcher Tabelle eine Datei angehört, sagt ihr
// **Name**: die Kopf-Datei selbst, ein Folge-Segment über seinen Grundnamen —
// dieselbe Ableitung, die schon der Vorlauf der Erfassung benutzt, und
// derselbe Tabellen-Name, den der Katalog führt.
//
// **Uneindeutigkeit wird gemeldet und nicht unterdrückt.** Führt eine Tabelle
// denselben Schlüssel-Wert zweimal, ist das ein Fund und kein Absturz: Die
// Auskunft nennt alle Fundorte und sagt, dass sie mehrdeutig ist. Die
// **Durchsetzung** der Eindeutigkeit beim Schreiben gehört zur Pflege-Schicht
// einer späteren Stufe (T5, E22); hier entsteht die Auskunft, auf der sie ruhen
// wird. Ein stiller Erst-Treffer wäre die schlechteste der drei Möglichkeiten,
// weil er den Fehler verbirgt und trotzdem ein Ergebnis liefert.
//
// Read-only-Sicht ohne eigenen Scan wie die Nachbarn in diesem Ordner; der
// Index-Aufbau bleibt Sache des Aufrufers, der Status wird durchgereicht.

'use strict';

const path = require('node:path');
const { indexes, indexStand, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder, overlayStand } = require('./overlay.js');
const { kopfDateiFuer } = require('./datensatz-erfassung.js');

// Obergrenze des Zwischenspeichers. Er wächst mit der Zahl gleichzeitig
// benutzter **Wurzeln** und nicht mit der Bestandsgröße; ein Fenster arbeitet
// in einer. Die Grenze steht trotzdem, damit wechselnde Wurzeln ihn nicht
// unbegrenzt füllen — beim Überlauf fällt der älteste Eintrag heraus
// (Einfüge-Reihenfolge der Map), wie im Wertevorrat.
const MAX_EINTRAEGE = 20;

// Schluessel ist Wurzel PLUS Sicht-Art, denn dieselbe Wurzel wird auf zwei
// Arten gelesen: die Auskuenfte nach aussen rechnen mit dem Puffer-Overlay, die
// Anker-Pruefung der Ziel-Aufloesung am Platten-Stand (so, wie sie es fuer
// Ueberschriften- und Block-Anker seit jeher tut). Ein gemeinsamer Schluessel
// gaebe der einen Seite die Sicht der anderen; ein zweiter Mechanismus daneben
// waere die Doppelung, die dieses Projekt gerade vermeidet.
//
// wurzel + ' | ' + sichtArt -> { indexStand, overlayStand, tabellen }
const zwischenspeicher = new Map();

const SICHT_UEBERLAGERT = 'overlay';
const SICHT_PLATTE = 'platte';

// Nur diese Zähler-Funktion kennt der Test: wie oft die Zuordnung tatsächlich
// gebaut wurde. Der Nachweis der Ableitung zählt Bauvorgänge und nicht
// Laufzeit — eine Laufzeit-Messung wäre bei einer Handvoll Testdateien ohne
// Aussage. Die Messung über echte Größenordnungen steht im Lösungs-Kapitel.
let bauvorgaenge = 0;

function bauZaehler() {
  return bauvorgaenge;
}

/** Nur für Tests: Zwischenspeicher und Zähler zurücksetzen. */
function zwischenspeicherLeeren() {
  zwischenspeicher.clear();
  bauvorgaenge = 0;
}

/**
 * Name der Tabelle, zu der eine Datei gehört.
 *
 * Die Kopf-Datei trägt ihn selbst, ein Folge-Segment erbt ihn von seinem
 * Grundnamen. Es ist derselbe Name, den der Katalog führt (Dateiname ohne
 * Endung), damit ein Aufrufer nicht zwei Benennungen auseinanderhalten muss.
 */
function tabellenNameVon(absPath) {
  const kopf = kopfDateiFuer(absPath) || absPath;
  return path.basename(kopf).replace(/\.md$/i, '');
}

/**
 * Vergleichs-Schlüssel aus den Werten eines fachlichen Schlüssels.
 *
 * **Verglichen wird zeichengenau** (Festlegung dieses Tasks; das Konzept lässt
 * die Frage offen). Ein fachlicher Schlüssel ist ein **Datenwert**, kein Name:
 * Wo das Haus unabhängig von Gross- und Kleinschreibung vergleicht, tut es das
 * bei Datei-Namen, Schlagworten und Feld-Namen, weil dort das Dateisystem oder
 * die Bequemlichkeit es verlangt. `Müller` und `MÜLLER` als denselben Datensatz
 * zu führen wäre dagegen eine fachliche Aussage, die niemand getroffen hat, und
 * sie ließe sich später nicht ohne Bruch zurücknehmen. Aus demselben Grund wird
 * **nicht getrimmt**: Das Ablage-Format hält einen Wert mit führenden
 * Leerzeichen ausdrücklich für zulässig und beschneidet ihn nie.
 *
 * Der Trenner ist derselbe wie bei der Definitions-Signatur und aus demselben
 * Grund: Ohne ihn fielen die Schlüssel `['ab', 'c']` und `['a', 'bc']`
 * zusammen.
 */
const TEIL_TRENNER = '\u0000';

function schluesselKey(werte) {
  if (!Array.isArray(werte) || werte.length === 0) return null;
  return werte.map((w) => String(w == null ? '' : w)).join(TEIL_TRENNER);
}

// Baut die beiden umgekehrten Zuordnungen aus der Vorwärts-Zuordnung.
//
// Je Tabelle eine Map von Kennung auf Fundort und eine von Schlüssel auf eine
// **Liste** von Fundorten. Die Liste ist der Ort, an dem die Uneindeutigkeit
// sichtbar wird; eine Map auf den Einzel-Treffer verlöre sie beim Einfügen.
// Bei der Kennung genügt der Einzel-Wert, denn eine doppelte Kennung ist nach
// `4S-000887` ausgeschlossen und wäre ein Fall für die Konsistenz-Prüfung aus
// T13, nicht für den Zugriff.
function baueZuordnung(sicht) {
  bauvorgaenge += 1;
  const tabellen = new Map();
  for (const [absPath, records] of sicht.recordsPerFile) {
    if (!Array.isArray(records) || records.length === 0) continue;
    const name = tabellenNameVon(absPath).toLowerCase();
    let tabelle = tabellen.get(name);
    if (!tabelle) {
      tabelle = { nachKennung: new Map(), nachSchluessel: new Map() };
      tabellen.set(name, tabelle);
    }
    for (const record of records) {
      const fundort = { datei: absPath, zeile: record.zeile, id: record.id || null };
      if (record.id) tabelle.nachKennung.set(record.id, fundort);
      const key = schluesselKey(record.key);
      if (key === null) continue;
      const liste = tabelle.nachSchluessel.get(key);
      if (liste) liste.push(fundort);
      else tabelle.nachSchluessel.set(key, [fundort]);
    }
  }
  return tabellen;
}

// Die Zuordnung einer Wurzel, gebaut oder aus dem Zwischenspeicher.
//
// `sichtArt` sagt, gegen welchen Stand gerechnet wird. Beim Platten-Stand geht
// der Overlay-Zaehler trotzdem in den Vergleich ein — er kostet nichts und
// schadet nur um den Preis eines gelegentlich zu frueh verworfenen Eintrags,
// waehrend sein Weglassen einen veralteten stehen liesse.
function zuordnungFuer(root, entry, sichtArt) {
  const iStand = indexStand(root);
  const oStand = overlayStand();
  const schluessel = root + ' | ' + sichtArt;
  const bekannt = zwischenspeicher.get(schluessel);
  if (bekannt && bekannt.indexStand === iStand && bekannt.overlayStand === oStand) {
    return bekannt.tabellen;
  }
  const sicht =
    sichtArt === SICHT_UEBERLAGERT ? entryWithOverlay(entry, overlaysUnder(root)) : entry;
  const tabellen = baueZuordnung(sicht);
  zwischenspeicher.delete(schluessel);
  zwischenspeicher.set(schluessel, { indexStand: iStand, overlayStand: oStand, tabellen });
  if (zwischenspeicher.size > MAX_EINTRAEGE) {
    zwischenspeicher.delete(zwischenspeicher.keys().next().value);
  }
  return tabellen;
}

// Status-Semantik wie `datenbank-bestand.js`, damit ein Aufrufer nicht je
// Auskunft eine andere Fallunterscheidung braucht. «Noch nicht bereit» und
// «nicht gefunden» sind zwei Aussagen, und die zweite darf die erste nie
// vortäuschen.
function lage(filePath, areaRoot) {
  if (!filePath) return { status: 'unavailable', root: null, entry: null };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable', root: null, entry: null };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', root, entry: null };
  if (entry.status === 'oversized') return { status: 'oversized', root, entry: null };
  if (entry.status === 'indexing') return { status: 'indexing', root, entry: null };
  if (entry.status === 'error') return { status: 'error', root, entry: null };
  return { status: 'ready', root, entry };
}

function tabelleAus(filePath, areaRoot, tabelle) {
  const { status, root, entry } = lage(filePath, areaRoot);
  if (status !== 'ready') return { status, tabelle: null };
  const name = String(tabelle == null ? '' : tabelle)
    .trim()
    .toLowerCase();
  if (!name) return { status: 'ready', tabelle: null };
  const tabellen = zuordnungFuer(root, entry, SICHT_UEBERLAGERT);
  return { status: 'ready', tabelle: tabellen.get(name) || null };
}

/**
 * Fundort eines Datensatzes über seine interne Kennung.
 *
 * @param {string} filePath Datei, über die die Wurzel bestimmt wird.
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters, falls vorhanden.
 * @param {string} tabelle Name der Tabelle (Dateiname der Kopf-Datei ohne Endung).
 * @param {string} kennung Interne Kennung, etwa `r-00042`.
 * @returns {{status: string, treffer: object|null}} `treffer` ist
 *   `{ datei, zeile, id }` oder null. Eine unbekannte Kennung ist eine leere
 *   Auskunft und kein Fehler; ein nicht bereiter Index sagt im Status, warum er
 *   nichts liefert.
 */
function datensatzNachKennung(filePath, areaRoot, tabelle, kennung) {
  const { status, tabelle: eintrag } = tabelleAus(filePath, areaRoot, tabelle);
  if (status !== 'ready' || !eintrag) return { status, treffer: null };
  const gesucht = String(kennung == null ? '' : kennung).trim();
  return { status, treffer: eintrag.nachKennung.get(gesucht) || null };
}

/**
 * Fundort eines Datensatzes über seinen fachlichen Schlüssel.
 *
 * @param {string|string[]} schluessel Ein Wert oder die Werte eines
 *   mehrteiligen Schlüssels, in der Reihenfolge der Definition.
 * @returns {{status: string, treffer: object|null, uneindeutig: boolean, treffers: Array}}
 *   Bei einem eindeutigen Fund steht der Treffer da und `uneindeutig` ist
 *   falsch. Bei einer Dublette ist `uneindeutig` wahr, `treffer` bleibt **null**
 *   — ein Erst-Treffer verbärge den Fund —, und `treffers` nennt alle Fundorte,
 *   damit der Aufrufer sie zeigen kann.
 */
function datensatzNachSchluessel(filePath, areaRoot, tabelle, schluessel) {
  const leer = { treffer: null, uneindeutig: false, treffers: [] };
  const { status, tabelle: eintrag } = tabelleAus(filePath, areaRoot, tabelle);
  if (status !== 'ready' || !eintrag) return { status, ...leer };
  const key = schluesselKey(Array.isArray(schluessel) ? schluessel : [schluessel]);
  if (key === null) return { status, ...leer };
  const liste = eintrag.nachSchluessel.get(key);
  if (!liste || liste.length === 0) return { status, ...leer };
  if (liste.length > 1) return { status, treffer: null, uneindeutig: true, treffers: [...liste] };
  return { status, treffer: liste[0], uneindeutig: false, treffers: [...liste] };
}

/**
 * Trägt die Tabelle dieser Kopf-Datei eine Datensatz-Kennung?
 *
 * Für die Anker-Prüfung der Ziel-Auflösung (`4T-001612`). Sie arbeitet gegen den
 * **Platten-Stand**, weil der ganze Weg dort liegt: Überschriften- und
 * Block-Anker sehen den Puffer eines offenen Dokuments seit jeher nicht, und
 * eine dritte Anker-Art, die ihn sähe, wäre für den Anwender nicht erklärbar.
 *
 * Die Frage geht über die **Tabelle** und nicht über die Datei; ein Datensatz in
 * einem Folge-Segment ist damit ohne eigene Regel mit abgedeckt.
 *
 * @param {object} entry Index-Eintrag (Platten-Sicht).
 * @param {string} kopfPfad Datei, auf die der Verweis aufgelöst hat.
 * @param {string} kennung Interne Kennung ohne das `^` des Ankers.
 */
function kennungInTabelle(entry, kopfPfad, kennung) {
  if (!entry || !entry.wurzel || !entry.recordsPerFile) return false;
  const gesucht = String(kennung == null ? '' : kennung).trim();
  if (!gesucht) return false;
  const tabellen = zuordnungFuer(entry.wurzel, entry, SICHT_PLATTE);
  const tabelle = tabellen.get(tabellenNameVon(kopfPfad).toLowerCase());
  return Boolean(tabelle && tabelle.nachKennung.has(gesucht));
}

module.exports = {
  datensatzNachKennung,
  datensatzNachSchluessel,
  kennungInTabelle,
  tabellenNameVon,
  bauZaehler,
  zwischenspeicherLeeren,
};
