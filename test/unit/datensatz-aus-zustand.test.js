// 4T-001761 (Epic 3E-000253): Der Aus-Zustand der Datenbank auf der Seite des
// Index — ruhender Datensatz-Bestand, unberührte Verweise, unangetastete
// Dateien und die vollständige Rückkehr beim Wiedereinschalten.
//
// **Warum eine eigene Datei neben `datensatz-index.test.js`.** Jene misst die
// Erfassung des Bestands im An-Zustand; hier steht die Gegenrichtung, und sie
// braucht eine eigene Voraussetzung: Jeder Fall legt den Schalter um und baut
// die Indizes neu auf. Beides in einer Datei hieße, dass ein vergessenes
// Zurückstellen des Schalters die Fälle der Nachbarin kippt.
//
// **Die tragenden Zusagen dieser Datei sind zwei, und sie hängen zusammen.**
// Der Bestand ruht (Entscheidung E-A), und genau deshalb darf ein Verweis auf
// einen einzelnen Datensatz NICHT als gebrochen gelten (Entscheidung E-B): Ohne
// Bestand fände die Prüfung keine einzige Kennung, und der Anwender läse eine
// Fehler-Kennzeichnung, die ihm einen Datenverlust vortäuscht, den allein ein
// Anzeige-Schalter ausgelöst hat.
//
// Setup-Muster (Temp-Wurzeln, Index-Warteschleife, Aufräumen) aus
// `datensatz-verweis.test.js`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  alleIndizesNeuAufbauen,
  backlinksFor,
  datensatzNachKennung,
  existingWikiTargets,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require_('../../src/main/index/datensatz-zugriff.js');
const { datensatzErfassungAktiv, setzeDatensatzErfassung } = require_(
  '../../src/main/index/index-schalter.js',
);

// --- Fixtures ---------------------------------------------------------------

const SAETZE = ['|- id="r-00001"', '| K-1', '| Anna', '|- id="r-00002"', '| K-2', '| Bert'];

function tabelle() {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Titel',
    '  key: Kürzel',
    '---',
    '',
    '# Kundenliste',
    '',
    '```perspective-records',
    ...SAETZE,
    '```',
    '',
  ].join('\n');
}

// --- Setup/Teardown ---------------------------------------------------------

// Eigener Besitzer-Schlüssel: Der Neuaufbau fragt jede Wurzel für ihre
// Besitzer neu an, und eine Wurzel ohne Besitzer baut er bewusst nicht wieder
// auf (sie steht in ihrem Soft-Fenster). Ohne Schlüssel prüfte diese Datei
// also den Abbau statt des Neuaufbaus.
const BESITZER = 'test-aus-zustand:0';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dsaus-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function warteAufIndex(activeFile) {
  let result = backlinksFor(activeFile, BESITZER);
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    result = backlinksFor(activeFile, BESITZER);
  }
  return result;
}

async function indexFor(activeFile) {
  openRoots.add(rootForActiveFile(activeFile));
  return warteAufIndex(activeFile);
}

// Den Schalter umlegen und die Indizes neu aufbauen — genau die Abfolge, die
// die Verteilung der Einstellungs-Änderung fährt (settings-verteilung.js).
async function schalte(aktiv, activeFile) {
  setzeDatensatzErfassung(aktiv);
  alleIndizesNeuAufbauen();
  return warteAufIndex(activeFile);
}

function bestandVon(root, absPath) {
  const eintrag = indexes.get(root);
  return eintrag && eintrag.recordsPerFile.get(absPath);
}

// Wie führt die Ziel-Auflösung dieses eine Verweis-Ziel?
function urteil(quelle, ziel) {
  const r = existingWikiTargets(quelle, [ziel]);
  if (r.status !== 'ready') return r.status;
  if (r.existing.includes(ziel)) return 'gültig';
  if (r.brokenAnchor.includes(ziel)) return 'gebrochener Anker';
  return 'kein Treffer';
}

// Inhalts-Prüfsumme jeder Datei des Bereichs. Gemessen wird der INHALT und
// nicht die Änderungszeit: Eine Zeit könnte innerhalb ihrer Auflösung gleich
// bleiben, obwohl geschrieben wurde.
function abdruckAller(root) {
  const aus = {};
  for (const name of fs.readdirSync(root).sort()) {
    const p = path.join(root, name);
    if (!fs.statSync(p).isFile()) continue;
    aus[name] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
  return aus;
}

afterEach(() => {
  // Der Schalter ist Modul-Zustand und überlebt den Fall; ohne diese Zeile
  // liefen die Nachbar-Dateien im Aus-Zustand.
  setzeDatensatzErfassung(true);
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  zwischenspeicherLeeren();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root, BESITZER);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows haelt die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- Der Schalter selbst ----------------------------------------------------

describe('Schalter des Datensatz-Bestands (4T-001761)', () => {
  it('steht ab Werk auf «an» und meldet nur echte Änderungen', () => {
    expect(datensatzErfassungAktiv()).toBe(true);
    // Derselbe Stand noch einmal gesetzt ist keine Änderung — daran hängt, ob
    // die Verteilung einen Neuaufbau auslöst oder nicht.
    expect(setzeDatensatzErfassung(true)).toBe(false);
    expect(setzeDatensatzErfassung(false)).toBe(true);
    expect(datensatzErfassungAktiv()).toBe(false);
    expect(setzeDatensatzErfassung(false)).toBe(false);
    expect(setzeDatensatzErfassung(true)).toBe(true);
  });
});

// --- AK8: der ruhende Bestand -----------------------------------------------

describe('AK8: der Datensatz-Bestand ruht im Aus-Zustand', () => {
  it('trägt nach dem Abschalten keine Datensätze mehr, wohl aber die Marke', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle());
    await indexFor(datei);
    // Nicht-Vakuitäts-Probe: eingeschaltet steht der Bestand da.
    expect(bestandVon(root, datei).map((r) => r.id)).toEqual(['r-00001', 'r-00002']);

    await schalte(false, datei);
    expect(bestandVon(root, datei)).toBeUndefined();
    // Die Marke der Tabellen-Datei bleibt: Sie kostet einen Blick ins
    // Frontmatter und trägt den Suchraum-Schnitt und die Verweis-Regel
    // (Entscheidung E-C).
    expect(indexes.get(root).dbKindsPerFile.get(datei)).toContain('table');
  });

  it('gibt über den Zugriff keinen Datensatz mehr aus', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle());
    await indexFor(datei);
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00001').treffer).not.toBeNull();

    await schalte(false, datei);
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00001').treffer).toBeNull();
  });
});

// --- AK5: die Verweis-Auflösung ---------------------------------------------

describe('AK5: ein Verweis auf einen Datensatz erzeugt keine Fehler-Kennzeichnung', () => {
  it('führt den Verweis im Aus-Zustand unter «bestehend» statt unter «gebrochen»', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle());
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00002]].');
    await indexFor(quelle);
    expect(urteil(quelle, 'Kunden#^r-00002')).toBe('gültig');

    await schalte(false, quelle);
    // Ohne Bestand ist die Kennung keine geprüfte Anker-Herkunft mehr; der
    // Verweis gilt als nicht prüfbar und damit als bestehend (E-B).
    expect(urteil(quelle, 'Kunden#^r-00002')).toBe('gültig');
  });

  it('lässt auch eine FREMDE Kennung im Aus-Zustand unmarkiert', async () => {
    const root = makeRoot();
    write(root, 'Kunden.md', tabelle());
    const quelle = write(root, 'Notiz.md', 'Siehe [[Kunden#^r-09999]].');
    await indexFor(quelle);
    // Eingeschaltet ist sie ein gebrochener Anker — das ist die Aussage, die
    // der Aus-Zustand gerade NICHT treffen kann.
    expect(urteil(quelle, 'Kunden#^r-09999')).toBe('gebrochener Anker');

    await schalte(false, quelle);
    expect(urteil(quelle, 'Kunden#^r-09999')).toBe('gültig');
  });

  it('lässt die beiden anderen Anker-Herkünfte unberührt', async () => {
    const root = makeRoot();
    // Eine Notiz OHNE Tabellen-Marke: Ihre Anker hängen an keiner Erweiterung
    // und müssen im Aus-Zustand genau so urteilen wie zuvor.
    write(root, 'Notiz2.md', '# Notiz\n\nEin Absatz. ^frei\n');
    const quelle = write(root, 'Notiz.md', 'x');
    await indexFor(quelle);

    await schalte(false, quelle);
    expect(urteil(quelle, 'Notiz2#^frei')).toBe('gültig');
    expect(urteil(quelle, 'Notiz2#^gibtesnicht')).toBe('gebrochener Anker');
    expect(urteil(quelle, 'Notiz2#notiz')).toBe('gültig');
    expect(urteil(quelle, 'Notiz2#gibt-es-nicht')).toBe('gebrochener Anker');
  });
});

// --- AK6 und AK7: unveränderte Dateien und das Wiedereinschalten -------------

describe('AK6 und AK7: die Dateien bleiben, und das Wiedereinschalten stellt alles her', () => {
  it('schreibt beim Ab- und Wiedereinschalten an keiner Datei und bringt den Bestand zurück', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle());
    write(root, 'Notiz.md', 'Siehe [[Kunden#^r-00002]].');
    await indexFor(datei);
    const vorher = abdruckAller(root);
    expect(Object.keys(vorher)).toEqual(['Kunden.md', 'Notiz.md']);

    await schalte(false, datei);
    expect(bestandVon(root, datei)).toBeUndefined();
    // AK6: Das Abschalten hat keinen Schreibvorgang ausgelöst — weder an den
    // Dokumenten noch als zusätzliche Datei im Bereich.
    expect(abdruckAller(root)).toEqual(vorher);

    await schalte(true, datei);
    // AK7: ohne Zutun des Anwenders steht alles wieder da.
    expect(bestandVon(root, datei).map((r) => r.id)).toEqual(['r-00001', 'r-00002']);
    expect(datensatzNachKennung(datei, null, 'Kunden', 'r-00001').treffer).not.toBeNull();
    expect(urteil(datei, 'Kunden#^r-09999')).toBe('gebrochener Anker');
    expect(abdruckAller(root)).toEqual(vorher);
  });

  it('behält den Index samt seinem Besitzer über den Neuaufbau hinweg', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kunden.md', tabelle());
    await indexFor(datei);

    await schalte(false, datei);
    const eintrag = indexes.get(root);
    expect(eintrag).toBeDefined();
    expect(eintrag.status).toBe('ready');
    // Der Besitzer reist mit: Ohne ihn liefe der Index sofort in seinen
    // Soft-Timer und verschwände unter der offenen Ansicht weg.
    expect([...eintrag.ownerKeys]).toEqual([BESITZER]);
  });
});
