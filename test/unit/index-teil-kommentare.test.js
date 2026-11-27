// 4T-002863 (Epic 3E-000449), Sicherheits-Review Runde 2, Befund 1: Ein
// privater Kommentar, der über die Grenze eines geteilten Dokuments reicht.
//
// Ein großes Dokument liegt in Teil-Dateien, geschnitten vor einer
// Überschrift; ein Kommentar kann eine Überschrift umschließen und damit über
// die Grenze reichen. Die Anzeige setzt die Teile zusammen und blendet ihn
// aus; der Index las jeden Teil für sich, und im Folgeteil stand der Rest des
// Kommentars als sichtbarer Text. Geprüft wird der Index an echten
// Teil-Dateien: Einlesen auf beiden Wegen, Gleichlauf mit dem Lese-Weg der
// Anzeige, Nachlesen der Geschwister im Beobachter-Weg, Warmstart.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
// Der letzte Fall baut den Index eines Bereichs samt Speicher-Datei und wartet
// mehrfach auf ihn, wie der Fall zur Speicher-Datei in backlinks.test.js; Wert
// und Begründung: test/zeitlimits.js.
import { SCHWER_ZEITLIMIT } from '../zeitlimits.js';

const require_ = createRequire(import.meta.url);
// Über `require` wie in parse.js, damit Schalter und Gedächtnis dieselben
// Exemplare treffen wie das Einlesen.
const { parseFile, parseFileAsync } = require_('../../src/main/index/parse.js');
const { setzeKommentarRegel, textOhnePrivateKommentare } = require_(
  '../../src/main/index/index-kommentare.js',
);
const { bereinigeTeile, teilKontextSync, teilStandPasst, geschwisterNachLoeschung, vergissTeile } =
  require_('../../src/main/index/teil-kommentare.js');
const { readAssembledDocument } = require_('../../src/main/documents/document-parts-io.js');
const { frontmatterBodyStart } = require_('../../src/shared/markdown/link-scan.js');
const { MDDA_CACHE_SCHEMA_VERSION } = require_('../../src/main/documents/mdd-store.js');
const { loadAreaCache } = require_('../../src/main/index/cache.js');
const backlinks = require_('../../src/main/backlinks.js');
const store = require_('../../src/main/index/store.js');
const { onWatcherChange } = require_('../../src/main/index/build.js');

const SEP = '•';
const ordner = [];

function neuerOrdner() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-teil-kommentare-'));
  ordner.push(o);
  return o;
}

const kopfText = (rumpf) => `---\ndoc-part: v1|1|Notiz\n---\n${rumpf}`;
const folgeText = (rumpf, index = 2) => `---\ndoc-part: v1|${index}|Notiz\n---\n${rumpf}`;

// Kopf öffnet einen Kommentar, der über die Überschrift am Anfang des
// Folgeteils reicht und dort schließt.
const KOPF_RUMPF = 'Anfang\n- [ ] Offen im Kopf\n%%\nGeheim im Kopf\n';
const FOLGE_RUMPF =
  '# Abschnitt\n- [ ] Geheime Aufgabe #geheim [[Versteckt]]\n%%\n- [ ] Sichtbare Aufgabe #offen\n';

function dokument(o = neuerOrdner()) {
  const kopf = path.join(o, 'Notiz.md');
  const folge = path.join(o, `Notiz${SEP}part-00002.md`);
  fs.writeFileSync(kopf, kopfText(KOPF_RUMPF));
  fs.writeFileSync(folge, folgeText(FOLGE_RUMPF));
  return { o, kopf, folge };
}

const aufgabenIm = (eintrag, datei) =>
  (eintrag.tasksPerFile.get(datei) || []).map((t) => t.sichtbar || t.text);
const aufgaben = (parsed) => parsed.tasks.map((t) => t.sichtbar || t.text);

afterEach(() => {
  setzeKommentarRegel([]);
  vergissTeile();
  for (const o of ordner.splice(0)) {
    try {
      fs.rmSync(o, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
});

describe('Kommentar über die Grenze eines geteilten Dokuments', () => {
  it('der Folgeteil trägt nichts aus dem Kommentar, aber den Text danach (Aufbau, asynchron)', async () => {
    const { folge } = dokument();
    const parsed = await parseFileAsync(folge);
    expect(aufgaben(parsed)).toEqual(['- [ ] Sichtbare Aufgabe #offen']);
    expect(parsed.tags).toContain('offen');
    expect(parsed.tags).not.toContain('geheim');
    expect(parsed.hits.map((h) => h.zielBasename)).not.toContain('Versteckt');
    // Die rohe Zeile bleibt für die Schreibwege.
    expect(parsed.tasks[0].text).toBe('- [ ] Sichtbare Aufgabe #offen');
  });

  it('ebenso im Beobachter-Weg (synchron)', () => {
    const { folge } = dokument();
    const parsed = parseFile(folge);
    expect(aufgaben(parsed)).toEqual(['- [ ] Sichtbare Aufgabe #offen']);
    expect(parsed.tags).not.toContain('geheim');
  });

  it('der Kopf trägt nichts nach dem öffnenden Marker', async () => {
    const { kopf } = dokument();
    const parsed = await parseFileAsync(kopf);
    expect(aufgaben(parsed)).toEqual(['- [ ] Offen im Kopf']);
  });

  it('im Aus-Zustand liest jeder Teil alles, wie die Anzeige es dann zeigt', async () => {
    setzeKommentarRegel(['comments']);
    const { folge } = dokument();
    const parsed = await parseFileAsync(folge);
    expect(aufgaben(parsed)).toEqual([
      '- [ ] Geheime Aufgabe #geheim [[Versteckt]]',
      '- [ ] Sichtbare Aufgabe #offen',
    ]);
    expect(parsed).not.toHaveProperty('teilStand');
  });

  it('ein ungeteiltes Dokument liest wie bisher, ohne Stand der Teile', async () => {
    const o = neuerOrdner();
    const datei = path.join(o, 'Einzeln.md');
    fs.writeFileSync(datei, '%%\n- [ ] Geheim\n%%\n- [ ] Offen\n');
    const parsed = await parseFileAsync(datei);
    expect(aufgaben(parsed)).toEqual(['- [ ] Offen']);
    expect(parsed).not.toHaveProperty('teilStand');
  });
});

describe('Gleichlauf mit dem Lese-Weg der Anzeige', () => {
  it('die Teile zusammen ergeben die Bereinigung des geöffneten Dokuments', async () => {
    const { kopf, folge } = dokument();
    const geoeffnet = await readAssembledDocument(kopf, fs.readFileSync(kopf, 'utf8'), {
      ohneKatalog: true,
    });
    expect(geoeffnet.geteilt).toBe(true);
    const zeilen = geoeffnet.text.split('\n');
    const anzeige = textOhnePrivateKommentare(
      zeilen.slice(frontmatterBodyStart(zeilen)).join('\n'),
    ).split('\n');
    const teil = (p) => {
      const inhalt = fs.readFileSync(p, 'utf8');
      const roh = inhalt.split('\n');
      const ab = frontmatterBodyStart(roh);
      const k = teilKontextSync(p, inhalt);
      return k.zeilen || roh.slice(ab);
    };
    // Die letzte Zeile des Kopfs ist im zusammengesetzten Text die erste des
    // Folgeteils.
    const index = teil(kopf).slice(0, -1).concat(teil(folge));
    expect(index).toEqual(anzeige);
  });
});

describe('Rein: Bereinigung der Teile', () => {
  const echt = textOhnePrivateKommentare;

  it('ohne Marker bleibt jeder Teil unverändert', () => {
    expect(bereinigeTeile(['a\n', 'b\n'], echt)).toEqual([null, null]);
  });

  it('nach einem nicht lesbaren Teil fällt der Rumpf ganz aus (sichere Seite)', () => {
    expect(bereinigeTeile([null, '- [ ] x\nText\n'], echt)).toEqual([null, ['', '', '']]);
  });

  it('mehrere nicht lesbare Teile brechen die Bereinigung nicht ab', () => {
    expect(bereinigeTeile([null, '- [ ] x\n', null], echt)).toEqual([null, ['', ''], null]);
  });

  it('teilen sich zwei Teile eine Zeile, fällt sie bei beiden aus', () => {
    const [a, b] = bereinigeTeile(['vorne %%geheim', '%% hinten\nweiter\n'], echt);
    expect(a).toEqual(['']);
    expect(b).toEqual(['', 'weiter', '']);
  });

  it('weicht die Zeilenzahl ab, fällt alles aus (sichere Seite)', () => {
    const kaputt = () => 'nur eine Zeile';
    expect(bereinigeTeile(['%%\na\n', 'b\n'], kaputt)).toEqual([
      ['', '', ''],
      ['', ''],
    ]);
  });
});

describe('Geschwister und Stand der Teile', () => {
  it('ein neu gelesenes Dokument meldet die übrigen Teile, ein gemerktes keine', () => {
    const { kopf, folge } = dokument();
    expect(teilKontextSync(folge, fs.readFileSync(folge, 'utf8')).geschwister).toEqual([kopf]);
    expect(teilKontextSync(kopf, fs.readFileSync(kopf, 'utf8')).geschwister).toEqual([]);
  });

  it('verschiebt eine Änderung die Bereinigung eines Geschwisters, wird es gemeldet', () => {
    const { kopf, folge } = dokument();
    teilKontextSync(folge, fs.readFileSync(folge, 'utf8'));
    // Der Kopf öffnet keinen Kommentar mehr.
    const neu = kopfText('Anfang\n- [ ] Offen im Kopf\n');
    fs.writeFileSync(kopf, neu);
    expect(teilKontextSync(kopf, neu).geschwister).toEqual([folge]);
  });

  it('der Stand gilt nur, solange alle Teile unverändert sind', () => {
    const { kopf, folge } = dokument();
    const { stand } = teilKontextSync(folge, fs.readFileSync(folge, 'utf8'));
    const scan = { mtimes: new Map(), sizes: new Map() };
    for (const p of [kopf, folge]) {
      const st = fs.statSync(p);
      scan.mtimes.set(p, st.mtimeMs);
      scan.sizes.set(p, st.size);
    }
    expect(teilStandPasst(stand, folge, scan)).toBe(true);
    scan.sizes.set(kopf, scan.sizes.get(kopf) + 1);
    expect(teilStandPasst(stand, folge, scan)).toBe(false);
    expect(teilStandPasst(undefined, folge, scan)).toBe(true);
  });

  it('nach dem Löschen eines Teils sind die übrigen nachzulesen, auch ohne Gedächtnis', () => {
    const { kopf, folge } = dokument();
    fs.rmSync(kopf);
    expect(geschwisterNachLoeschung(kopf)).toEqual([folge]);
  });

  it('der Speicher trägt den Stand der Teile', async () => {
    const o = neuerOrdner();
    const datei = path.join(o, 'cache.json');
    const stand = [['Notiz.md', 1, 2]];
    fs.writeFileSync(
      datei,
      JSON.stringify({
        schemaVersion: MDDA_CACHE_SCHEMA_VERSION,
        ohneKommentare: true,
        linkIndex: {
          files: {
            'a.md': { mtimeMs: 1, size: 1, hash: 'h', teilStand: stand, parsed: { hits: [] } },
            'b.md': { mtimeMs: 1, size: 1, hash: 'h', parsed: { hits: [] } },
          },
        },
      }),
    );
    const geladen = await loadAreaCache(datei, o, true);
    expect(geladen.get('a.md').teilStand).toEqual(stand);
    expect(geladen.get('b.md')).not.toHaveProperty('teilStand');
  });
});

// Sicherheits-Review Runde 3, Befund 1: Fehlt ein mittlerer Teil, ist
// unbekannt, was aus ihm in den nächsten hineinreicht. Hier öffnet der
// fehlende Teil 2 einen Kommentar, den Teil 3 schließt.
describe('Lücke in der Folge der Teile', () => {
  const TEIL3_RUMPF = '- [ ] Rest geheim #geheim\n%%\n- [ ] Offen\n';

  function mitLuecke() {
    const o = neuerOrdner();
    const kopf = path.join(o, 'Notiz.md');
    const teil3 = path.join(o, `Notiz${SEP}part-00003.md`);
    fs.writeFileSync(kopf, kopfText('Anfang\n'));
    fs.writeFileSync(teil3, folgeText(TEIL3_RUMPF, 3));
    return { o, kopf, teil3 };
  }

  function scanVon(...pfade) {
    const scan = { mtimes: new Map(), sizes: new Map() };
    for (const p of pfade) {
      const st = fs.statSync(p);
      scan.mtimes.set(p, st.mtimeMs);
      scan.sizes.set(p, st.size);
    }
    return scan;
  }

  it('der Teil nach der Lücke fällt ganz aus (Beobachter-Weg und Aufbau)', async () => {
    const { teil3 } = mitLuecke();
    for (const parsed of [parseFile(teil3), await parseFileAsync(teil3)]) {
      expect(aufgaben(parsed)).toEqual([]);
      expect(parsed.tags).not.toContain('geheim');
      vergissTeile();
    }
  });

  it('beim Warmstart gilt der Stand nicht mehr, sobald die Lücke gefüllt ist', () => {
    const { o, kopf, teil3 } = mitLuecke();
    const { stand } = teilKontextSync(teil3, fs.readFileSync(teil3, 'utf8'));
    expect(teilStandPasst(stand, teil3, scanVon(kopf, teil3))).toBe(true);
    const teil2 = path.join(o, `Notiz${SEP}part-00002.md`);
    fs.writeFileSync(teil2, folgeText('%%\nGeheim\n'));
    expect(teilStandPasst(stand, teil3, scanVon(kopf, teil2, teil3))).toBe(false);
  });

  it('beim Warmstart gilt der Stand nicht mehr, wenn ein weiterer Teil hinzukommt', () => {
    const { kopf, folge, o } = dokument();
    const { stand } = teilKontextSync(folge, fs.readFileSync(folge, 'utf8'));
    const teil3 = path.join(o, `Notiz${SEP}part-00003.md`);
    fs.writeFileSync(teil3, folgeText('Weiter\n', 3));
    expect(teilStandPasst(stand, folge, scanVon(kopf, folge))).toBe(true);
    expect(teilStandPasst(stand, folge, scanVon(kopf, folge, teil3))).toBe(false);
  });

  it('ein Ordner mit Teil-Namen zählt nicht als Teil, wie beim Öffnen', () => {
    const { o, folge } = dokument();
    fs.mkdirSync(path.join(o, `Notiz${SEP}part-00003.md`));
    const { stand } = teilKontextSync(folge, fs.readFileSync(folge, 'utf8'));
    expect(stand.map((z) => z[0])).toEqual(['Notiz.md', `Notiz${SEP}part-00002.md`]);
  });
});

describe('Index eines Ordners mit geteiltem Dokument', () => {
  const OWNER = 'test:teil-kommentare';
  let wurzel = null;

  afterEach(() => {
    if (!wurzel) return;
    vi.useFakeTimers();
    backlinks.releaseRoot(wurzel, OWNER);
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    wurzel = null;
  });

  async function index(datei) {
    let r = backlinks.backlinksFor(datei, OWNER, null);
    wurzel = backlinks.rootForActiveFile(datei, null);
    for (let i = 0; i < 500 && r.status === 'indexing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      r = backlinks.backlinksFor(datei, OWNER, null);
    }
    return store.indexes.get(wurzel);
  }

  it('Aufbau, Änderung am Kopf und Löschen des Kopfs ziehen den Folgeteil nach', async () => {
    const { o, kopf, folge } = dokument();
    fs.writeFileSync(path.join(o, 'Start.md'), 'Start');
    const eintrag = await index(path.join(o, 'Start.md'));
    expect(aufgabenIm(eintrag, folge)).toEqual(['- [ ] Sichtbare Aufgabe #offen']);

    // Der Kopf öffnet keinen Kommentar mehr: Der schließende Marker im
    // Folgeteil öffnet jetzt einen, und der Folgeteil meldet sich nicht selbst.
    fs.writeFileSync(kopf, kopfText('Anfang\n- [ ] Offen im Kopf\n'));
    onWatcherChange(eintrag, kopf, 'change');
    expect(aufgabenIm(eintrag, folge)).toEqual(['- [ ] Geheime Aufgabe #geheim [[Versteckt]]']);

    // Ohne Kopf ist unbekannt, was in den Folgeteil hineinreicht.
    fs.rmSync(kopf);
    onWatcherChange(eintrag, kopf, 'unlink');
    expect(aufgabenIm(eintrag, folge)).toEqual([]);
  });
});

describe('Warmstart eines Bereichs', () => {
  const HALTER = 'test:teil-kommentare-bereich';

  async function bereit(wurzel) {
    for (let i = 0; i < 500; i++) {
      const eintrag = store.indexes.get(wurzel);
      if (eintrag && eintrag.status === 'ready') return eintrag;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Index nicht bereit');
  }

  function abbauen(wurzel) {
    vi.useFakeTimers();
    backlinks.releaseRoot(wurzel, HALTER);
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
  }

  it(
    'ein unveränderter Folgeteil wird neu gelesen, wenn sich sein Kopf geändert hat',
    async () => {
      const { o, kopf, folge } = dokument();
      const wurzel = path.resolve(o);
      const speicher = path.join(wurzel, 'Area_Cache.mdda');
      backlinks.ensureAreaIndex(wurzel, HALTER);
      let eintrag = await bereit(wurzel);
      expect(aufgabenIm(eintrag, folge)).toEqual(['- [ ] Sichtbare Aufgabe #offen']);
      for (let i = 0; i < 100 && !fs.existsSync(speicher); i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(fs.existsSync(speicher)).toBe(true);
      // Der Abbau schreibt den Speicher noch einmal (ersetzend); abwarten, bis
      // die neue Fassung liegt, statt einer festen Pause.
      const vorAbbau = fs.statSync(speicher).mtimeMs;
      abbauen(wurzel);
      for (let i = 0; i < 100 && fs.statSync(speicher).mtimeMs === vorAbbau; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(fs.statSync(speicher).mtimeMs).not.toBe(vorAbbau);

      // Bei geschlossenem Bereich öffnet der Kopf keinen Kommentar mehr; der
      // Folgeteil selbst bleibt unberührt.
      fs.writeFileSync(kopf, kopfText('Anfang\n- [ ] Offen im Kopf\n'));
      vergissTeile();
      backlinks.ensureAreaIndex(wurzel, HALTER);
      eintrag = await bereit(wurzel);
      try {
        expect(aufgabenIm(eintrag, folge)).toEqual(['- [ ] Geheime Aufgabe #geheim [[Versteckt]]']);
      } finally {
        abbauen(wurzel);
      }
    },
    SCHWER_ZEITLIMIT,
  );
});
