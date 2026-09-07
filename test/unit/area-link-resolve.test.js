// 4T-001452 (Epic 3E-000190): Unit-Tests der Auflösung über die Bereichs-Grenze.
//
// Gearbeitet wird an ZWEI echten Temp-Wurzeln mit echten Dateien und echten
// Bereichsdateien — die Klasse K3 verlangt den Nachweis an der realen
// Konstellation zweier verknüpfter Bereiche statt am bequemeren Ersatz-Fall
// (AK5). Ein Test mit erfundenen Pfaden würde genau das verfehlen, worauf es
// hier ankommt: dass Ablage, Auflösung und Einschließung zusammenspielen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import aufloesung from '../../src/main/area/area-link-resolve.js';
import mddStore from '../../src/main/documents/mdd-store.js';
// 4T-001452: Der Index-Parser belegt, dass die eingehende Richtung draussen bleibt.
import { parseContent } from '../../src/main/index/parse.js';

const {
  pfadImVerknuepftenBereich,
  vergleichsName,
  sucheNachName,
  loeseVerknuepfungsLink,
  liegtInVerknuepftemBereich,
  pruefeVerknuepfungen,
  ungueltigeKuerzel,
  beurteileVerknuepfungsLinks,
} = aufloesung;

let tmpDirs = [];

function makeRoot(praefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  tmpDirs.push(dir);
  return dir;
}

function schreibe(root, rel, inhalt = '# Inhalt\n') {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

function makeConfig() {
  return createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: vi.fn(),
    mddStore,
    attachmentPath: {},
    resolveTemplatesConfig: () => ({}),
  });
}

// Die reale Konstellation: zwei Bereiche, der eine verknüpft den anderen unter
// dem Kürzel «zt», mit echter Bereichsdatei auf der Platte.
async function zweiVerknuepfteBereiche() {
  const eigen = makeRoot('em4me-al-eigen-');
  const fremd = makeRoot('em4me-al-fremd-');
  const cfg = makeConfig();
  await cfg.writeAreaLinks(eigen, [{ prefix: 'zt', path: fremd }]);
  const links = await cfg.readAreaLinks(eigen);
  return { eigen, fremd, cfg, links };
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('pfadImVerknuepftenBereich — die Pfad-Rechnung und ihre Einschliessung', () => {
  it('rechnet wurzel-relativ, auch ueber Unterordner', () => {
    const wurzel = path.resolve(path.sep, 'Zentral');
    expect(pfadImVerknuepftenBereich(wurzel, 'Datei.md')).toBe(path.join(wurzel, 'Datei.md'));
    expect(pfadImVerknuepftenBereich(wurzel, 'Ordner/Datei.md')).toBe(
      path.join(wurzel, 'Ordner', 'Datei.md'),
    );
  });

  it('weist den Ausbruch nach oben und die Wurzel selbst zurueck', () => {
    const wurzel = path.resolve(path.sep, 'Zentral');
    expect(pfadImVerknuepftenBereich(wurzel, '../geheim.md')).toBeNull();
    expect(pfadImVerknuepftenBereich(wurzel, '../../etc/passwd')).toBeNull();
    expect(pfadImVerknuepftenBereich(wurzel, '.')).toBeNull();
    expect(pfadImVerknuepftenBereich(wurzel, '')).toBeNull();
    expect(pfadImVerknuepftenBereich('', 'Datei.md')).toBeNull();
  });

  it('weist einen fremden absoluten Pfad zurueck', () => {
    const wurzel = path.resolve(path.sep, 'Zentral');
    const fremd = path.resolve(path.sep, 'Woanders', 'x.md');
    expect(pfadImVerknuepftenBereich(wurzel, fremd)).toBeNull();
  });
});

describe('vergleichsName — dieselbe Faltung wie der Index', () => {
  it('nimmt den Basisnamen ohne Endung und faltet die Schreibung', () => {
    expect(vergleichsName('Meine Datei.md')).toBe('meine datei');
    expect(vergleichsName('Ordner/Unter/NOTIZ.markdown')).toBe('notiz');
    expect(vergleichsName('Datei')).toBe('datei');
    expect(vergleichsName('')).toBe('');
  });
});

describe('Aufloesung an zwei tatsaechlich verknuepften Bereichen (AK1, AK5)', () => {
  it('findet ein wurzel-relatives Ziel ohne jede Suche', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    const ziel = schreibe(fremd, 'Datei.md');
    const suche = vi.fn();

    const erg = await loeseVerknuepfungsLink({ links, prefix: 'zt', target: 'Datei.md', suche });
    expect(erg.ok).toBe(true);
    expect(erg.path).toBe(ziel);
    // Die Pfad-Rechnung trifft: die Suche wird gar nicht erst angeworfen.
    expect(suche).not.toHaveBeenCalled();
  });

  it('findet ein Ziel im Unterordner ueber die Namens-Suche (Entscheidung P1)', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    const ziel = schreibe(fremd, path.join('Ordner', 'Tief', 'Notiz.md'));

    const erg = await loeseVerknuepfungsLink({ links, prefix: 'zt', target: 'Notiz.md' });
    expect(erg.ok).toBe(true);
    expect(erg.path).toBe(ziel);
  });

  it('findet das Kuerzel ohne Ruecksicht auf die Schreibung', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    const ziel = schreibe(fremd, 'Datei.md');
    for (const prefix of ['zt', 'ZT', 'Zt']) {
      const erg = await loeseVerknuepfungsLink({ links, prefix, target: 'Datei.md' });
      expect(erg.path, prefix).toBe(ziel);
    }
  });

  it('meldet mehrere gleichnamige Ziele und waehlt stabil dasselbe', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    schreibe(fremd, path.join('B', 'Doppelt.md'));
    schreibe(fremd, path.join('A', 'Doppelt.md'));

    const erste = await loeseVerknuepfungsLink({ links, prefix: 'zt', target: 'Doppelt.md' });
    const zweite = await loeseVerknuepfungsLink({ links, prefix: 'zt', target: 'Doppelt.md' });
    expect(erste.ok).toBe(true);
    expect(erste.mehrdeutig).toHaveLength(2);
    expect(erste.path).toBe(zweite.path);
  });
});

describe('Was nicht aufloest (AK3)', () => {
  it('ein Kuerzel ohne Eintrag loest nicht auf', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    schreibe(fremd, 'Datei.md');

    const erg = await loeseVerknuepfungsLink({ links, prefix: 'unbekannt', target: 'Datei.md' });
    expect(erg.ok).toBe(false);
    expect(erg.grund).toBe('kein-kuerzel');
    expect(erg.path).toBeUndefined();
  });

  it('ein nicht vorhandenes Ziel loest nicht auf', async () => {
    const { links } = await zweiVerknuepfteBereiche();
    const erg = await loeseVerknuepfungsLink({ links, prefix: 'zt', target: 'GibtEsNicht.md' });
    expect(erg.ok).toBe(false);
    expect(erg.grund).toBe('nicht-gefunden');
  });

  it('ein Ausbruch aus der verknuepften Wurzel loest nicht auf', async () => {
    const { eigen, links } = await zweiVerknuepfteBereiche();
    // Eine echte Datei ausserhalb der verknuepften Wurzel, damit der Fall
    // nicht schon an der Nicht-Existenz scheitert.
    schreibe(eigen, 'Geheim.md');
    const erg = await loeseVerknuepfungsLink({
      links,
      prefix: 'zt',
      target: '../' + path.basename(eigen) + '/Geheim.md',
    });
    expect(erg.ok).toBe(false);
    expect(erg.grund).toBe('ungueltiges-ziel');
  });

  it('unterscheidet den getrennten Ablage-Ort vom nicht gefundenen Ziel', async () => {
    const { eigen, fremd, cfg } = await zweiVerknuepfteBereiche();
    expect(eigen).toBeTruthy();
    // Den verknuepften Bereich entfernen: der Ablage-Ort ist danach nicht
    // erreichbar. Das ist ein anderer Fall als «Datei nicht gefunden» und
    // wird als eigener Grund gemeldet.
    fs.rmSync(fremd, { recursive: true, force: true });
    const links = await cfg.readAreaLinks(eigen);
    const erg = await loeseVerknuepfungsLink({ links, prefix: 'zt', target: 'Datei.md' });
    expect(erg.ok).toBe(false);
    expect(erg.grund).toBe('ziel-offline');
  });
});

describe('sucheNachName — Suchraum und Grenzen', () => {
  it('ueberspringt dieselben Ordner wie der Index-Scan', async () => {
    const wurzel = makeRoot('em4me-al-scan-');
    schreibe(wurzel, path.join('node_modules', 'Treffer.md'));
    schreibe(wurzel, path.join('.git', 'Treffer.md'));
    const echt = schreibe(wurzel, path.join('Echt', 'Treffer.md'));

    const { treffer } = await sucheNachName(wurzel, 'treffer');
    expect(treffer).toEqual([echt]);
  });

  it('bricht bei einem nicht lesbaren Ordner nicht ab', async () => {
    const wurzel = makeRoot('em4me-al-lesbar-');
    const ziel = schreibe(wurzel, 'Da.md');
    const { treffer } = await sucheNachName(path.join(wurzel), 'da');
    expect(treffer).toEqual([ziel]);
    // Eine Wurzel, die es nicht gibt, liefert leer statt zu werfen.
    await expect(sucheNachName(path.join(wurzel, 'gibtsnicht'), 'da')).resolves.toEqual({
      treffer: [],
      abgebrochen: false,
    });
  });

  it('sucht nicht ohne Namen', async () => {
    const wurzel = makeRoot('em4me-al-leer-');
    schreibe(wurzel, 'Da.md');
    expect(await sucheNachName(wurzel, '')).toEqual({ treffer: [], abgebrochen: false });
  });
});

describe('liegtInVerknuepftemBereich — die praezisierte Grenz-Zusicherung (P2)', () => {
  it('laesst ein Ziel im verknuepften Bereich zu', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    expect(liegtInVerknuepftemBereich(links, path.join(fremd, 'Datei.md'))).toBe(true);
    expect(liegtInVerknuepftemBereich(links, path.join(fremd, 'Tief', 'Datei.md'))).toBe(true);
  });

  it('laesst alles andere weiterhin nicht zu', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    expect(liegtInVerknuepftemBereich(links, path.join(path.dirname(fremd), 'Nachbar.md'))).toBe(
      false,
    );
    expect(liegtInVerknuepftemBereich(links, '')).toBe(false);
    expect(liegtInVerknuepftemBereich([], path.join(fremd, 'Datei.md'))).toBe(false);
    expect(liegtInVerknuepftemBereich(null, path.join(fremd, 'Datei.md'))).toBe(false);
  });

  it('ein Praefix-Nachbar der verknuepften Wurzel zaehlt nicht als innerhalb', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    // '<fremd>-anderer' beginnt mit demselben Text, liegt aber daneben.
    expect(liegtInVerknuepftemBereich(links, fremd + '-anderer' + path.sep + 'x.md')).toBe(false);
  });
});
describe('Die eingehende Richtung bleibt draussen (AK4, Ausschluss aus E3)', () => {
  it('ein Verknuepfungs-Link wird kein Index-Treffer — Backlinks, Waisen-Kennzahl und Graph sehen ihn nicht', () => {
    const datei = path.resolve(path.sep, 'Bereich', 'Quelle.md');
    const erg = parseContent(
      datei,
      'Text [[Lokal]] und [[@zt:Fremd]] und [[@zt:Fremd|Alias]] und [[@zt:Tief/Datei#Anker]].\n',
    );
    // Genau EIN Treffer: der lokale Link. Die drei Verknuepfungs-Links sind
    // uebersprungen, weil der Index genau eine Wurzel je Eintrag kennt und die
    // eingehende Richtung in Stufe 1 ausdruecklich draussen bleibt. Als lokale
    // Ziele gedeutet entstuenden hier Verweise auf Dateien namens
    // '@zt:Fremd', die es nie geben kann.
    expect(erg.hits).toHaveLength(1);
    expect(erg.hits[0].zielBasename).toBe('Lokal');
  });

  it('ein gewoehnlicher Link mit At-Zeichen im Namen bleibt ein Index-Treffer', () => {
    const datei = path.resolve(path.sep, 'Bereich', 'Quelle.md');
    // Kein Doppelpunkt, also keine Verknuepfungs-Form: der Link zaehlt normal.
    const erg = parseContent(datei, 'Text [[@Notiz]].\n');
    expect(erg.hits).toHaveLength(1);
    expect(erg.hits[0].zielBasename).toBe('@Notiz');
  });

  it('die vier Sichten der eingehenden Richtung kennen das Verknuepfungs-Modell nicht', () => {
    // Struktureller Waechter statt einer Verhaltens-Messung: Der Ausschluss aus
    // E3 ist eine ARCHITEKTUR-Aussage, und sie haelt nur, solange diese Module
    // das Verknuepfungs-Modell gar nicht erst erreichen. Ein spaeterer Griff
    // danach faellt hier auf, statt still einen Mehr-Wurzel-Index zu beginnen.
    const module = [
      'src/main/index/store.js',
      'src/main/index/resolve.js',
      'src/main/index/views.js',
      'src/main/index/link-graph.js',
      'src/main/area/area-search.js',
    ];
    for (const rel of module) {
      const quelle = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
      expect(quelle, rel).not.toContain('area-links');
      expect(quelle, rel).not.toContain('area-link-resolve');
    }
  });
});

describe('Pruef-Verhalten beim Oeffnen (4T-001453, Entscheidung E4)', () => {
  it('ordnet die drei Befunde an echten Ordnern zu', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    // 'ok': der Ordner ist da.
    expect(await pruefeVerknuepfungen(links)).toEqual([
      { prefix: 'zt', path: fremd, befund: 'ok' },
    ]);

    // 'verschoben': der Ziel-Ordner fehlt, sein Ablage-Ort ist erreichbar.
    // Das Temp-Verzeichnis ist der uebergeordnete Ort und existiert weiter.
    fs.rmSync(fremd, { recursive: true, force: true });
    expect(await pruefeVerknuepfungen(links)).toEqual([
      { prefix: 'zt', path: fremd, befund: 'verschoben' },
    ]);
  });

  it('meldet offline, wenn schon der Ablage-Ort fehlt', async () => {
    const wurzel = makeRoot('em4me-al-offline-');
    const tief = path.join(wurzel, 'Traeger', 'Bereich');
    const links = [{ prefix: 'zt', path: tief, templates: false }];
    // Weder der Bereich noch sein Traeger existieren: das ist der Offline-Fall,
    // denn ein nicht erreichbarer Ablage-Ort belegt keine Verschiebung.
    expect(await pruefeVerknuepfungen(links)).toEqual([
      { prefix: 'zt', path: tief, befund: 'offline' },
    ]);
  });

  it('nimmt einen Laufwerks-Stamm nie als verschoben an', async () => {
    // Bei einem Stamm ist der uebergeordnete Ort der Stamm selbst; die Frage
    // nach dem Uebergeordneten ist dann gegenstandslos.
    const stamm = path.resolve(path.sep);
    const links = [{ prefix: 'zt', path: stamm, templates: false }];
    const befunde = await pruefeVerknuepfungen(links, async () => false);
    expect(befunde[0].befund).toBe('offline');
  });

  it('prueft jede Verknuepfung einzeln und behaelt die Reihenfolge', async () => {
    const da = makeRoot('em4me-al-da-');
    const weg = makeRoot('em4me-al-weg-');
    fs.rmSync(weg, { recursive: true, force: true });
    const links = [
      { prefix: 'a', path: da, templates: false },
      { prefix: 'b', path: weg, templates: false },
      { prefix: 'c', path: da, templates: false },
    ];
    const befunde = await pruefeVerknuepfungen(links);
    expect(befunde.map((b) => [b.prefix, b.befund])).toEqual([
      ['a', 'ok'],
      ['b', 'verschoben'],
      ['c', 'ok'],
    ]);
  });

  it('nur der verschobene Fall macht Links ungueltig, der Offline-Fall nicht', async () => {
    const befunde = [
      { prefix: 'a', path: 'x', befund: 'ok' },
      { prefix: 'b', path: 'y', befund: 'verschoben' },
      { prefix: 'c', path: 'z', befund: 'offline' },
    ];
    // Das ist der Kern von E4: Ein getrenntes Laufwerk darf keine Verknuepfung
    // zerstoeren, ein verschobener Ordner schon.
    expect(ungueltigeKuerzel(befunde)).toEqual(['b']);
    expect(ungueltigeKuerzel([])).toEqual([]);
    expect(ungueltigeKuerzel(null)).toEqual([]);
  });

  it('wirft nie: leere Liste, defekte Eintraege und eine werfende Pruefung', async () => {
    expect(await pruefeVerknuepfungen([])).toEqual([]);
    expect(await pruefeVerknuepfungen(null)).toEqual([]);
    // Eintraege ohne Pfad entfallen, statt einen Befund zu erfinden.
    expect(await pruefeVerknuepfungen([{ prefix: 'a' }, null, { prefix: 'b', path: '' }])).toEqual(
      [],
    );
  });
});

describe('Beurteilung fuer den Linter (4T-001454)', () => {
  it('ok, wenn Kuerzel eingetragen und Ziel auffindbar ist', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    schreibe(fremd, path.join('Tief', 'Notiz.md'));
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'zt', target: 'Notiz.md' },
    ]);
    expect(urteile).toEqual([{ prefix: 'zt', target: 'Notiz.md', urteil: 'ok' }]);
  });

  it('unbekannt, wenn das Kuerzel nicht eingetragen ist', async () => {
    const { links } = await zweiVerknuepfteBereiche();
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'weg', target: 'Notiz.md' },
    ]);
    expect(urteile[0].urteil).toBe('unbekannt');
  });

  it('nicht-gefunden, wenn der Bereich steht, das Ziel aber fehlt', async () => {
    const { links } = await zweiVerknuepfteBereiche();
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'zt', target: 'GibtEsNicht.md' },
    ]);
    expect(urteile[0].urteil).toBe('nicht-gefunden');
  });

  it('verschoben schlaegt auf jeden Link des Bereichs durch', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    fs.rmSync(fremd, { recursive: true, force: true });
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'zt', target: 'A.md' },
      { prefix: 'zt', target: 'B.md' },
    ]);
    expect(urteile.map((u) => u.urteil)).toEqual(['verschoben', 'verschoben']);
  });

  it('offline bleibt offline — es wird spaeter NICHT markiert', async () => {
    const wurzel = makeRoot('em4me-al-lint-offline-');
    const tief = path.join(wurzel, 'Traeger', 'Bereich');
    const links = [{ prefix: 'zt', path: tief, templates: false }];
    const urteile = await beurteileVerknuepfungsLinks(links, [{ prefix: 'zt', target: 'A.md' }]);
    // Das ist der tragende Unterschied zu 'verschoben': derselbe fehlende
    // Ordner, aber ein nicht erreichbarer Ablage-Ort — und damit kein Mangel.
    expect(urteile[0].urteil).toBe('offline');
  });

  it('erhebt den Bereichs-Zustand einmal, nicht je Link', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    schreibe(fremd, 'A.md');
    schreibe(fremd, 'B.md');
    const pruefe = vi.fn(async () => true);
    await beurteileVerknuepfungsLinks(
      links,
      [
        { prefix: 'zt', target: 'A.md' },
        { prefix: 'zt', target: 'B.md' },
        { prefix: 'zt', target: 'C.md' },
      ],
      { pruefe },
    );
    // Eine Verknuepfung, ein Zustands-Aufruf — unabhaengig von der Zahl der Links.
    expect(pruefe).toHaveBeenCalledTimes(1);
  });

  it('trennt den Anker ab, bevor es aufloest (Befund der Abnahme am 2026-09-06)', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    schreibe(fremd, path.join('Tief', 'Zielnotiz.md'));

    // Der Klick-Weg trennt den Anker ab, bevor er aufloest; die Beurteilung
    // bekam den Ziel-Teil aber SAMT Anker und suchte eine Datei namens
    // «Zielnotiz#Kapitel Zwei». Ergebnis war eine Marke an einem Verweis, den
    // derselbe Klick oeffnete — der Linter widersprach der Anwendung.
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'zt', target: 'Zielnotiz#Kapitel Zwei' },
      { prefix: 'zt', target: 'Zielnotiz#^block-1' },
      { prefix: 'zt', target: 'Zielnotiz' },
    ]);
    expect(urteile.map((u) => u.urteil)).toEqual(['ok', 'ok', 'ok']);
    // Der Anker bleibt im gemeldeten Ziel stehen: Der Linter setzt seine
    // Marke auf den ganzen Verweis, nicht auf den Datei-Teil.
    expect(urteile[0].target).toBe('Zielnotiz#Kapitel Zwei');
  });

  it('meldet ein fehlendes Ziel auch mit Anker als nicht gefunden', async () => {
    const { links } = await zweiVerknuepfteBereiche();
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'zt', target: 'GibtEsNicht#Kapitel' },
    ]);
    expect(urteile[0].urteil).toBe('nicht-gefunden');
  });

  it('haelt die Reihenfolge und vertraegt leere Anfragen', async () => {
    const { fremd, links } = await zweiVerknuepfteBereiche();
    schreibe(fremd, 'Da.md');
    const urteile = await beurteileVerknuepfungsLinks(links, [
      { prefix: 'weg', target: 'X.md' },
      { prefix: 'zt', target: 'Da.md' },
      { prefix: 'zt', target: 'Fehlt.md' },
    ]);
    expect(urteile.map((u) => u.urteil)).toEqual(['unbekannt', 'ok', 'nicht-gefunden']);
    expect(await beurteileVerknuepfungsLinks(links, [])).toEqual([]);
    expect(await beurteileVerknuepfungsLinks(links, null)).toEqual([]);
  });
});
