// 4T-001609 (Epic 3E-000252): Der Datensatz-Block einer Datenbank-Tabelle im
// Volltext-Suchraum des Bereichs.
//
// Geprüft wird auf zwei Ebenen, weil der Task zwei Zusagen trägt: die reine
// Text-Bereinigung an ihrem Modul (welche Zeilen fallen weg, welche bleiben) und
// ihre Wirkung an der Bereichs-Suche (auf welchen Wegen sie greift). Setup-Muster
// und Puffer-Naht wie in area-search.test.js; die Erwartungswerte sind am
// Prüfstand nachgerechnet und nicht aus einem Lauf übernommen.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  konfiguriereBereichsSuche,
  sucheImBereich,
  gibBereichsVorratFrei,
} from '../../src/main/area/area-search.js';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { bereinigeSuchtext } = require_('../../src/main/area/area-search-datensaetze.js');
// 4T-001761 (Epic 3E-000253): Der Schalter des Datensatz-Bestands im Index —
// hier als Gegenprobe, dass der Suchraum-Schnitt NICHT an ihm hängt.
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { baueVorrat } = require_('../../src/main/area/area-search-vorrat.js');
const { ladeCache } = require_('../../src/main/area/area-search-cache.js');
// Dieselbe Modul-Instanz, die area-search.js benutzt (Begründung in
// area-search.test.js): Vitest führt für import und require getrennte Instanzen.
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/backlinks.js');

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbsuche-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Eine Tabellen-Datei: Prosa VOR und HINTER dem Datenblock, damit die
// Stellen-Treue an beiden Seiten messbar ist. Der Suchbegriff «Merkwort» steht
// dreimal, je einmal oben, im Datensatz und unten.
const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Titel',
  '---',
  '',
  '# Kundenliste',
  '',
  'Merkwort in der Beschreibung oben.',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Merkwort im ersten Datensatz',
  '|- id="r-00002"',
  '| Zweiter Datensatz ohne Fund',
  '```',
  '',
  'Merkwort im Nachwort unten.',
  '',
].join('\n');

// Ein Folge-Segment: keine Marke `db-table`, dafür die Zuordnungs-Zeile und ein
// Rumpf, der mit einem Datensatz-Marker beginnt.
const SEGMENT = [
  '---',
  'doc-part: 2/Kundenliste',
  'db-fields: Titel',
  '---',
  '|- id="r-00003"',
  '| Merkwort im Folge-Segment',
  '|- id="r-00004"',
  '| Noch ein Datensatz',
  '```',
  '',
].join('\n');

// Ein gewöhnliches Dokument, dessen Code-Block einer Datensatz-Fence NUR ÄHNELT.
// Ohne Marke im Frontmatter bleibt es unangetastet.
const AEHNLICH = [
  '---',
  'tags: notiz',
  '---',
  '',
  'Erklärung zum Format:',
  '',
  '```perspective-records',
  '|- id="r-09999"',
  '| Merkwort im Beispiel',
  '```',
  '',
].join('\n');

async function suche(root, muster = 'Merkwort', optionen = {}) {
  return sucheImBereich(root, { muster, flags: 'gm', generation: 1, ...optionen });
}

function gruppeVon(res, name) {
  return res.gruppen.find((g) => g.gruppe === name);
}

afterEach(() => {
  gibBereichsVorratFrei();
  clearAllBufferOverlays();
  konfiguriereBereichsSuche({});
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Aufräumen darf den Lauf nicht kippen */
    }
  }
  tmpDirs = [];
});

describe('Datensatz-Bereinigung: was fällt weg und was bleibt', () => {
  it('leert die Datensatz-Zeilen und lässt die Zaun-Zeilen stehen', () => {
    const b = bereinigeSuchtext(TABELLE);
    expect(b).toBeTruthy();
    const zeilen = b.text.split('\n');
    expect(zeilen).toContain('```perspective-records');
    expect(zeilen.filter((z) => z === '```').length).toBe(1);
    expect(b.text).not.toContain('r-00001');
    expect(b.text).not.toContain('im ersten Datensatz');
  });

  it('erhält Zeilenzahl und Zeilen-Reihenfolge', () => {
    const b = bereinigeSuchtext(TABELLE);
    expect(b.text.split('\n').length).toBe(TABELLE.split('\n').length);
    const zeilen = b.text.split('\n');
    expect(zeilen[8]).toBe('Merkwort in der Beschreibung oben.');
    expect(zeilen[17]).toBe('Merkwort im Nachwort unten.');
  });

  it('meldet die Zahl der entfernten Zeichen', () => {
    const b = bereinigeSuchtext(TABELLE);
    // Vier Datensatz-Zeilen des Fixtures, ihre Längen von Hand summiert.
    const erwartet = [
      '|- id="r-00001"',
      '| Merkwort im ersten Datensatz',
      '|- id="r-00002"',
      '| Zweiter Datensatz ohne Fund',
    ].reduce((s, z) => s + z.length, 0);
    expect(b.entfernt).toBe(erwartet);
  });

  it('behandelt ein Folge-Segment wie die Kopf-Datei, ohne eigene Definition', () => {
    const b = bereinigeSuchtext(SEGMENT);
    expect(b).toBeTruthy();
    expect(b.text).not.toContain('Merkwort');
    expect(b.text.split('\n').length).toBe(SEGMENT.split('\n').length);
    // Der schließende Zaun des letzten Segments bleibt stehen.
    expect(b.text.split('\n')).toContain('```');
  });

  it('lässt ein gewöhnliches Dokument unberührt, auch bei ähnlichem Code-Block', () => {
    expect(bereinigeSuchtext(AEHNLICH)).toBeNull();
  });

  it('lässt einen Text ohne jede Datensatz-Spur unberührt, ohne Frontmatter zu lesen', () => {
    expect(bereinigeSuchtext('# Titel\n\nGanz gewöhnlicher Text.\n')).toBeNull();
  });

  // 4T-001761 (Epic 3E-000253, AK9): Der Suchraum-Schnitt bleibt im
  // Aus-Zustand der Erweiterung «Datenbank» bestehen (Entscheidung E-C des
  // Product Owners vom 2026-09-15). Er hängt an der Marke der Tabellen-Datei
  // und nicht an der Erweiterung: Würde er mitschalten, wäre die Folge nicht
  // eine abgeschaltete Funktion, sondern ein langsamerer Bereich für jedes
  // Prosa-Dokument darin — ausgelöst durch einen Anzeige-Schalter.
  //
  // Gemessen wird gegen den Schalter des Index-Bestands, weil er der EINE
  // Schalter dieses Aus-Zustands auf der Seite des Hauptprozesses ist: Läge
  // die Bereinigung an ihm, fiele sie hier auf.
  it('bleibt im Aus-Zustand der Datenbank bestehen (AK9)', () => {
    const vorher = bereinigeSuchtext(TABELLE);
    setzeDatensatzErfassung(false);
    try {
      const nachher = bereinigeSuchtext(TABELLE);
      expect(nachher).toBeTruthy();
      expect(nachher.text).toBe(vorher.text);
      expect(nachher.entfernt).toBe(vorher.entfernt);
      expect(nachher.text).not.toContain('im ersten Datensatz');
      // Und dasselbe für das Folge-Segment, dessen Rumpf ganz aus
      // Datensätzen besteht.
      expect(bereinigeSuchtext(SEGMENT).text).not.toContain('Merkwort');
    } finally {
      setzeDatensatzErfassung(true);
    }
  });
});

describe('Bereichs-Suche: der Datensatz-Block ist draußen, das Dokument nicht', () => {
  it('findet die Prosa des Tabellen-Dokuments weiterhin (AK1)', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    const res = await suche(root);
    expect(gruppeVon(res, 'Kundenliste.md')).toBeTruthy();
  });

  it('findet einen Begriff nicht, der nur im Datensatz steht (AK2)', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    const res = await suche(root, 'ersten Datensatz');
    expect(res.treffer).toEqual([]);
  });

  it('lässt Zeile und Spalte des Treffers hinter dem Block unverändert (AK3)', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    const res = await suche(root);
    const zeilen = res.treffer.map((t) => t.sprung.zeile).sort((a, b) => a - b);
    // Am Fixture nachgezählt: Zeile 8 (Beschreibung) und Zeile 17 (Nachwort),
    // beide 0-basiert und beide in der DATEI, nicht im bereinigten Text.
    expect(zeilen).toEqual([8, 17]);
    for (const t of res.treffer) expect(t.sprung.spalte).toBe(0);
  });

  // 4T-001671 kehrt die Zusicherung von 4T-001609 um: Der Offset ist nicht mehr
  // `null`, sondern die Stelle in der DATEI. Gemessen wird gegen den Fixture-Text
  // selbst und nicht gegen eine notierte Zahl — eine Erwartung, die ihre eigene
  // Quelle liest, altert nicht mit ihr (4T-001541).
  it('gibt den Zeichen-Offset einer bereinigten Datei in Datei-Koordinaten (AK3)', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    const res = await suche(root);
    expect(res.treffer.length).toBe(2);
    const erwartet = [
      TABELLE.indexOf('Merkwort in der Beschreibung oben.'),
      TABELLE.indexOf('Merkwort im Nachwort unten.'),
    ];
    const gefunden = res.treffer.map((t) => t.sprung.offset).sort((a, b) => a - b);
    expect(gefunden).toEqual(erwartet);
    // Die Gegenprobe zur Rot-Probe: Ohne Ruecknahme-Karte laege der zweite
    // Treffer um die Laenge des Datensatz-Blocks zu frueh.
    for (const [i, offset] of gefunden.entries()) {
      expect(TABELLE.slice(offset, offset + 8)).toBe('Merkwort');
      expect(offset).toBe(erwartet[i]);
    }
  });

  it('lässt den Zeichen-Offset eines gewöhnlichen Dokuments unangetastet', async () => {
    const root = makeRoot();
    write(root, 'notiz.md', 'Zeile eins\nMerkwort in Zeile zwei\n');
    const res = await suche(root);
    expect(res.treffer[0].sprung.offset).toBe('Zeile eins\n'.length);
  });

  it('behandelt ein Folge-Segment wie die Kopf-Datei (AK6)', async () => {
    const root = makeRoot();
    write(root, 'Segment•part-00002.md', SEGMENT);
    const res = await suche(root);
    expect(res.treffer).toEqual([]);
  });

  it('lässt einen ähnlichen Code-Block in einer Nicht-Tabelle durchsuchbar (AK7)', async () => {
    const root = makeRoot();
    write(root, 'notiz.md', AEHNLICH);
    const res = await suche(root);
    expect(gruppeVon(res, 'notiz.md').anzahl).toBe(1);
  });
});

describe('Bereichs-Suche: die Grenze wirkt auf allen vier Wegen (AK4)', () => {
  it('erster Weg — Vorrat', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    const res = await suche(root);
    expect(res.vorratModus).toBe('vorrat');
    expect(gruppeVon(res, 'Kundenliste.md').anzahl).toBe(2);
  });

  it('zweiter Weg — Direkt-Suche oberhalb des Deckels', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    // Der Deckel kommt über dieselbe Naht herein wie das Cache-Verzeichnis;
    // damit läuft der Suchlauf wirklich über den Direkt-Weg und nicht nur ein
    // eigens gebauter Zustand daneben.
    konfiguriereBereichsSuche({ maxVorratBytes: 1 });
    const res = await suche(root, 'ersten Datensatz');
    expect(res.vorratModus).toBe('direkt');
    expect(res.treffer).toEqual([]);
  });

  it('zweiter Weg — die Prosa bleibt dort auffindbar', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    konfiguriereBereichsSuche({ maxVorratBytes: 1 });
    const res = await suche(root);
    expect(res.vorratModus).toBe('direkt');
    expect(gruppeVon(res, 'Kundenliste.md').anzahl).toBe(2);
  });

  it('dritter Weg — Datei oberhalb der Einzelgrenze', async () => {
    const root = makeRoot();
    // Knapp über MAX_DATEI_BYTES (10 MB), damit die Datei neben dem Vorrat
    // mitreist statt in ihm zu liegen; Muster aus area-search.test.js.
    const fuellung = 'Fuellmaterial ohne Fundstelle.\n'.repeat(360000);
    const gross = TABELLE.replace('# Kundenliste', '# Kundenliste\n' + fuellung);
    expect(Buffer.byteLength(gross, 'utf8')).toBeGreaterThan(10 * 1024 * 1024);
    write(root, 'Grosse.md', gross);
    // Sie fällt aus dem Speicher, nicht aus dem Trefferraum: Die Prosa wird
    // gefunden, der Datensatz nicht.
    const prosa = await suche(root);
    expect(prosa.vorratModus).toBe('vorrat');
    expect(gruppeVon(prosa, 'Grosse.md').anzahl).toBe(2);
    gibBereichsVorratFrei();
    const datensatz = await suche(root, 'ersten Datensatz');
    expect(datensatz.treffer).toEqual([]);
  });

  it('vierter Weg — Puffer-Stand eines geöffneten Dokuments', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', 'Noch ohne Tabelle.\n');
    setBufferOverlay(path.join(root, 'Kundenliste.md'), TABELLE);
    const res = await suche(root, 'ersten Datensatz');
    // Ohne die Bereinigung des Puffer-Weges wäre die Tabelle durchsuchbar,
    // solange sie geöffnet ist.
    expect(res.treffer).toEqual([]);
  });

  it('vierter Weg — Editor-Stand der aktiven Datei', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', 'Noch ohne Tabelle.\n');
    const res = await sucheImBereich(root, {
      muster: 'ersten Datensatz',
      flags: 'gm',
      generation: 1,
      aktiv: { pfad: path.join(root, 'Kundenliste.md'), text: TABELLE },
    });
    expect(res.treffer).toEqual([]);
  });
});

describe('Bereichs-Suche: der Zwischenspeicher trägt keine Datensätze (AK5)', () => {
  function cacheDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbsuche-cache-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('schreibt die Tabellen-Datei ohne ihren Datensatz-Text in den Cache', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    konfiguriereBereichsSuche({ cacheVerzeichnis: cacheDir() });
    await suche(root);
    const cache = await ladeCache(root);
    const eintrag = cache.get('Kundenliste.md');
    expect(eintrag).toBeTruthy();
    expect(eintrag.text).not.toContain('ersten Datensatz');
    expect(eintrag.bereinigt).toBe(true);
  });

  it('merkt sich beim gewöhnlichen Dokument, dass nichts bereinigt wurde', async () => {
    const root = makeRoot();
    write(root, 'notiz.md', AEHNLICH);
    konfiguriereBereichsSuche({ cacheVerzeichnis: cacheDir() });
    await suche(root);
    const cache = await ladeCache(root);
    expect(cache.get('notiz.md').bereinigt).toBe(false);
  });

  it('verwirft einen Cache der Vorgänger-Version, statt ihn weiterzuverwenden', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', TABELLE);
    const dir = cacheDir();
    konfiguriereBereichsSuche({ cacheVerzeichnis: dir });
    await suche(root);
    // Einen Cache der Version 1 unterschieben — er trüge die vollen Texte.
    const datei = fs.readdirSync(dir)[0];
    const pfad = path.join(dir, datei);
    const alt = JSON.parse(fs.readFileSync(pfad, 'utf8'));
    alt.v = 1;
    alt.dateien[0].text = TABELLE;
    fs.writeFileSync(pfad, JSON.stringify(alt), 'utf8');
    const cache = await ladeCache(root);
    expect(cache.size).toBe(0);
  });
});

describe('Bereichs-Suche: der Deckel misst den bereinigten Umfang (AK8)', () => {
  it('behält den Vorrat, wenn erst die Bereinigung unter den Deckel bringt', async () => {
    const root = makeRoot();
    // Roh über dem Deckel, bereinigt darunter: Die Datensatz-Zeilen tragen den
    // Überhang, die Prosa bleibt klein.
    const viele = [];
    for (let i = 0; i < 200; i++) {
      viele.push(`|- id="r-${String(i).padStart(5, '0')}"`);
      viele.push('| ' + 'Fuellwert '.repeat(20));
    }
    const gross = TABELLE.replace('|- id="r-00001"', viele.join('\n') + '\n|- id="r-00001"');
    write(root, 'Kundenliste.md', gross);
    const rohBytes = Buffer.byteLength(gross, 'utf8');
    const zustand = await baueVorrat(root, () => false, { deckel: rohBytes - 1000 });
    expect(zustand.modus).toBe('vorrat');
    expect(zustand.bytes).toBeLessThan(rohBytes);
  });

  it('fällt auf die Direkt-Suche, wenn auch der bereinigte Umfang den Deckel reißt', async () => {
    const root = makeRoot();
    write(root, 'prosa.md', 'Merkwort und viel Text.\n'.repeat(200));
    const zustand = await baueVorrat(root, () => false, { deckel: 100 });
    expect(zustand.modus).toBe('direkt');
  });

  it('schreibt oberhalb des Deckels keinen Cache', async () => {
    const root = makeRoot();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dbsuche-cache-'));
    tmpDirs.push(dir);
    konfiguriereBereichsSuche({ cacheVerzeichnis: dir });
    write(root, 'prosa.md', 'Merkwort und viel Text.\n'.repeat(200));
    await baueVorrat(root, () => false, { deckel: 100 });
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
