// 4T-1184 (Epic 3E-0221, E1): Unit-Tests des Lookup-Feldes — die Dokumente,
// die über ein benanntes Feld auf das eigene verweisen.
//
// Zwei Schwerpunkte. Erstens die **Begrenzung**, aus demselben Grund wie beim
// Wertevorrat (4T-1158): Ein zu früh oder zu oft ausgewertetes Feld fällt in
// keinem Test auf, der mit zehn Dokumenten läuft, und schlägt im echten Bestand
// sofort durch. Gezählt werden deshalb die Auswertungen, nicht die Laufzeit.
//
// Zweitens die **Vergleichs-Regel**, weil sie der Grund ist, warum dieses Modul
// überhaupt existiert: Ein Verweis steht im Metadaten-Block in Wiki-Schreibweise,
// und der Vergleich der Abfrage-Sprache trifft diese Form nicht. Die drei
// Schreibweisen eines Verweises müssen deshalb hier zusammenfinden.
//
// Setup-/Teardown-Muster wie profil-wertevorrat.test.js: echter Index über ein
// Temp-Verzeichnis, Soft-Timer per Fake-Timer feuern.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  lookupTreffer,
  lookupAuswertungsZaehler,
  lookupZwischenspeicherLeeren,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { zielSchluessel } from '../../src/main/index/profil-lookup.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-lu-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, ownerKey, areaRoot) {
  let result = backlinksFor(activeFile, ownerKey, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, areaRoot);
  }
  return result;
}

beforeEach(() => {
  lookupZwischenspeicherLeeren();
});

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Ein Bestand, der die drei Schreibweisen eines Verweises, den Alias-Fall, den
// Mehrfach-Verweis, einen Fremd-Verweis und einen Treffer außerhalb der
// Eingrenzung nebeneinanderstellt.
async function bestand() {
  const root = makeRoot();
  const ziel = write(root, 'Start.md', '---\naliases:\n  - Auftakt\n---\nEinstieg.');
  write(root, 'Artikel/Eckig.md', '---\nprojekt: "[[Start]]"\n---\nText.');
  write(root, 'Artikel/MitLabel.md', '---\nprojekt: "[[Start|Anfang]]"\n---\nText.');
  write(root, 'Artikel/Blank.md', '---\nprojekt: Start\n---\nText.');
  write(root, 'Artikel/UeberAlias.md', '---\nprojekt: "[[Auftakt]]"\n---\nText.');
  write(
    root,
    'Artikel/Mehrfach.md',
    '---\nprojekt:\n  - "[[Anderes]]"\n  - "[[Start]]"\n---\nText.',
  );
  write(root, 'Artikel/Fremd.md', '---\nprojekt: "[[Anderes]]"\n---\nText.');
  write(root, 'Artikel/OhneFeld.md', '---\nart: notiz\n---\nText.');
  write(root, 'Sonstiges/Draussen.md', '---\nprojekt: "[[Start]]"\n---\nText.');
  await indexFor(ziel, 'test:lookup');
  return { root, ziel };
}

const opt = (o) => ({ from: 'FROM "Artikel"', relatedField: 'projekt', ...o });

describe('lookupTreffer — Sammeln der verweisenden Dokumente (4T-1184)', () => {
  it('AK1: sammelt die Dokumente, die über das benannte Feld verweisen', async () => {
    const { ziel } = await bestand();
    const { status, values } = lookupTreffer(ziel, null, opt());
    expect(status).toBe('ready');
    expect([...values].sort()).toEqual(['Blank', 'Eckig', 'Mehrfach', 'MitLabel', 'UeberAlias']);
  });

  it('AK1: ein Dokument mit anderem Verweis-Ziel ist kein Treffer', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt());
    expect(values).not.toContain('Fremd');
  });

  it('AK1: ein Dokument ohne das benannte Feld ist kein Treffer', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt());
    expect(values).not.toContain('OhneFeld');
  });

  it('AK2: `from` grenzt die befragte Menge ein', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt());
    expect(values).not.toContain('Draussen');
  });

  it('AK2: ohne `from` gilt der ganze Bereich', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, { relatedField: 'projekt' });
    expect(values).toContain('Draussen');
    expect(values).toContain('Eckig');
  });

  it('ein anderes Feld liefert andere Treffer', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt({ relatedField: 'art' }));
    expect(values).toEqual([]);
  });

  it('der Feldname ist case-insensitiv', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt({ relatedField: 'Projekt' }));
    expect(values).toContain('Eckig');
  });

  it('das eigene Dokument ist nie sein eigener Treffer', async () => {
    const root = makeRoot();
    const ziel = write(root, 'Start.md', '---\nprojekt: "[[Start]]"\n---\nText.');
    write(root, 'Artikel/A.md', '---\nprojekt: "[[Start]]"\n---\nText.');
    await indexFor(ziel, 'test:lookup');
    const { values } = lookupTreffer(ziel, null, { relatedField: 'projekt' });
    expect(values).toEqual(['A']);
  });
});

describe('Vergleichs-Regel der Verweis-Werte (4T-1184)', () => {
  // Die Regel als reine Funktion, unabhängig vom Index — sie ist der Grund für
  // dieses Modul und soll ohne Temp-Verzeichnis nachlesbar sein.
  it('die drei Schreibweisen eines Verweises meinen dasselbe Ziel', () => {
    expect(zielSchluessel('[[Halle 3]]')).toEqual(['halle 3']);
    expect(zielSchluessel('[[Halle 3|Kurzform]]')).toEqual(['halle 3']);
    expect(zielSchluessel('Halle 3')).toEqual(['halle 3']);
  });

  it('mehrere Verweise in einem Wert zählen alle', () => {
    expect(zielSchluessel('[[A]] und [[B]]')).toEqual(['a', 'b']);
  });

  it('Groß-/Kleinschreibung und Randleerraum spielen keine Rolle', () => {
    expect(zielSchluessel('  [[HALLE 3]]  ')).toEqual(['halle 3']);
  });

  it('nicht auswertbare Werte ergeben keinen Schlüssel', () => {
    expect(zielSchluessel('')).toEqual([]);
    expect(zielSchluessel('   ')).toEqual([]);
    expect(zielSchluessel(42)).toEqual([]);
    expect(zielSchluessel(null)).toEqual([]);
    // Eine angefangene Klammer ist kein blanker Name: sonst würde aus einem
    // kaputten Wert ein Treffer auf ein Ziel, das niemand gemeint hat.
    expect(zielSchluessel('[[unvollstaendig')).toEqual([]);
  });
});

describe('Begrenzung der Auswertung (4T-1184)', () => {
  it('AK3: die Profil-Auflösung allein wertet nichts aus', async () => {
    const vorher = lookupAuswertungsZaehler();
    await bestand();
    // Kein Aufruf von lookupTreffer: der Index-Aufbau allein rechnet nichts.
    expect(lookupAuswertungsZaehler()).toBe(vorher);
  });

  it('AK4: drei Anfragen bei unverändertem Index lösen eine Auswertung aus', async () => {
    const { ziel } = await bestand();
    const vorher = lookupAuswertungsZaehler();
    lookupTreffer(ziel, null, opt());
    lookupTreffer(ziel, null, opt());
    lookupTreffer(ziel, null, opt());
    expect(lookupAuswertungsZaehler() - vorher).toBe(1);
  });

  it('AK4: verschiedene Felder sind verschiedene Einträge', async () => {
    const { ziel } = await bestand();
    const vorher = lookupAuswertungsZaehler();
    lookupTreffer(ziel, null, opt());
    lookupTreffer(ziel, null, opt({ relatedField: 'art' }));
    expect(lookupAuswertungsZaehler() - vorher).toBe(2);
  });

  it('AK4: dasselbe Feld an verschiedenen Dokumenten sind verschiedene Einträge', async () => {
    // Der Unterschied zum Wertevorrat: Ein Lookup-Ergebnis gilt je Dokument.
    const { root, ziel } = await bestand();
    const zweites = path.join(root, 'Artikel', 'Eckig.md');
    const vorher = lookupAuswertungsZaehler();
    lookupTreffer(ziel, null, opt());
    lookupTreffer(zweites, null, opt());
    expect(lookupAuswertungsZaehler() - vorher).toBe(2);
  });

  it('ein Feld ohne relatedField wird gar nicht erst ausgewertet', async () => {
    const { ziel } = await bestand();
    const vorher = lookupAuswertungsZaehler();
    expect(lookupTreffer(ziel, null, { from: 'FROM "Artikel"' }).status).toBe('unavailable');
    expect(lookupTreffer(ziel, null, {}).status).toBe('unavailable');
    expect(lookupTreffer(ziel, null, null).status).toBe('unavailable');
    expect(lookupAuswertungsZaehler()).toBe(vorher);
  });
});

describe('Weiche Fehler-Fälle (4T-1184)', () => {
  it('AK6: eine fehlerhafte Quelle ergibt ein leeres Ergebnis, keinen Wurf', async () => {
    const { ziel } = await bestand();
    const { values } = lookupTreffer(ziel, null, opt({ from: 'FROM ((( kaputt' }));
    expect(values).toEqual([]);
  });

  it('AK6: eine Quelle ohne Treffer ist derselbe Fall und kein Fehler', async () => {
    const { ziel } = await bestand();
    const { status, values } = lookupTreffer(ziel, null, opt({ from: 'FROM "GibtsNicht"' }));
    expect(status).toBe('ready');
    expect(values).toEqual([]);
  });

  it('AK6: ohne erreichbaren Index meldet die Sicht unavailable', () => {
    expect(lookupTreffer(null, null, opt()).status).toBe('unavailable');
    const fremd = path.join(os.tmpdir(), 'nie-indexiert', 'x.md');
    expect(lookupTreffer(fremd, null, opt()).status).toBe('unavailable');
  });

  it('AK6: keine Eingabe wirft je eine Ausnahme', async () => {
    const { ziel } = await bestand();
    expect(() => lookupTreffer(ziel, null, opt({ relatedField: '   ' }))).not.toThrow();
    expect(() => lookupTreffer(ziel, null, opt({ from: '' }))).not.toThrow();
    expect(() => lookupTreffer(undefined, undefined, undefined)).not.toThrow();
  });
});

// Die Invalidierungs-Regel mit eingespeisten Abhängigkeiten. Sie ist die
// tragende Zusage dieses Tasks und lässt sich am echten Index NICHT prüfen:
// Der Watcher meldet im Unit-Umfeld keine zweite Index-Änderung, der Stand
// bliebe bei 1, und ein Test darüber wäre eine Behauptung statt eines
// Nachweises. Eingespeist werden deshalb `stand` und `auswerten` — dasselbe
// Mittel wie in 4T-1158. Die eingespeisten Treffer tragen ECHTE Pfade des
// Test-Bestands, weil der Verweis-Vergleich die Properties aus dem Index liest.
describe('Invalidierung gegen den Index-Stand (4T-1184)', () => {
  function umgebung(root, pfadeJeLauf) {
    let stand = 1;
    let laeufe = 0;
    return {
      deps: {
        stand: () => stand,
        auswerten: () => {
          const pfade = pfadeJeLauf[Math.min(laeufe, pfadeJeLauf.length - 1)];
          laeufe += 1;
          return {
            status: 'ready',
            files: pfade.map((rel) => ({
              name: path.basename(rel, '.md'),
              path: path.join(root, rel),
            })),
          };
        },
      },
      standBewegen: () => {
        stand += 1;
      },
      laeufe: () => laeufe,
    };
  }

  it('AK4: bei gleichem Stand wird genau einmal ausgewertet', async () => {
    const { root, ziel } = await bestand();
    const u = umgebung(root, [['Artikel/Eckig.md'], ['Artikel/Eckig.md', 'Artikel/Blank.md']]);
    const erst = lookupTreffer(ziel, null, opt(), u.deps);
    const zweit = lookupTreffer(ziel, null, opt(), u.deps);
    expect(erst.values).toEqual(['Eckig']);
    expect(zweit.values).toEqual(['Eckig']); // aus dem Zwischenspeicher
    expect(u.laeufe()).toBe(1);
  });

  it('AK5: bewegt sich der Stand, wertet die nächste Anfrage neu aus', async () => {
    const { root, ziel } = await bestand();
    const u = umgebung(root, [['Artikel/Eckig.md'], ['Artikel/Eckig.md', 'Artikel/Blank.md']]);
    expect(lookupTreffer(ziel, null, opt(), u.deps).values).toEqual(['Eckig']);
    u.standBewegen();
    expect(lookupTreffer(ziel, null, opt(), u.deps).values).toEqual(['Eckig', 'Blank']);
    expect(u.laeufe()).toBe(2);
    // Und danach greift der Zwischenspeicher wieder.
    lookupTreffer(ziel, null, opt(), u.deps);
    expect(u.laeufe()).toBe(2);
  });

  it('AK6: ein unfertiger Index wird nicht zwischengespeichert', async () => {
    const { ziel } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        return { status: 'indexing' };
      },
    };
    expect(lookupTreffer(ziel, null, opt(), deps).status).toBe('indexing');
    expect(lookupTreffer(ziel, null, opt(), deps).status).toBe('indexing');
    expect(laeufe).toBe(2);
  });
});
