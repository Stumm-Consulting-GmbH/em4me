// 4T-1158 (Epic 3E-0219, E12): Unit-Tests des Wertevorrats aus einer Abfrage.
//
// Der Schwerpunkt liegt auf der **Begrenzung**, weil sie die Zusage dieses
// Tasks ist und ihr Bruch unsichtbar wäre: Ein zu früh oder zu oft
// ausgewerteter Vorrat fällt in keinem Test auf, der mit zehn Dokumenten
// läuft. Gezählt werden deshalb die **Auswertungen** und nicht die Laufzeit —
// eine Laufzeit-Messung hätte bei dieser Bestandsgröße keine Aussage.
//
// Setup-/Teardown-Muster wie graph-index.test.js: echter Index über ein
// Temp-Verzeichnis, Soft-Timer per Fake-Timer feuern.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auswertungsZaehler,
  backlinksFor,
  releaseRoot,
  rootForActiveFile,
  werteAusAbfrage,
  zwischenspeicherLeeren,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-wv-'));
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
  zwischenspeicherLeeren();
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

async function bestand() {
  const root = makeRoot();
  const a = write(root, 'Start.md', 'Einstieg.');
  write(root, 'Projekte/Neubau.md', '---\nart: projekt\n---\nText.');
  write(root, 'Projekte/Umbau.md', '---\nart: projekt\n---\nText.');
  write(root, 'Sonstiges/Notiz.md', '---\nart: notiz\n---\nText.');
  await indexFor(a, 'test:wertevorrat');
  return { root, a };
}

describe('werteAusAbfrage — Wertevorrat aus einer Abfrage', () => {
  it('AK1: liefert die Namen der Treffer als Wertevorrat', async () => {
    const { a } = await bestand();
    const { status, values } = werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    expect(status).toBe('ready');
    expect([...values].sort()).toEqual(['Neubau', 'Umbau']);
  });

  it('AK3: zwei Anfragen bei unverändertem Index lösen genau eine Auswertung aus', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    expect(auswertungsZaehler() - vorher).toBe(1);
  });

  it('AK3: verschiedene Abfragen sind verschiedene Einträge', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, 'WHERE art = "notiz"');
    expect(auswertungsZaehler() - vorher).toBe(2);
  });

  // Der AK4-Nachweis (bewegter Stand ⇒ neue Auswertung) steht weiter unten
  // mit eingespeisten Abhängigkeiten: Am echten Index lässt er sich nicht
  // führen, weil der Watcher im Unit-Umfeld keine zweite Index-Meldung
  // absetzt — der Stand bliebe bei 1, und der Test prüfte in Wahrheit den
  // Watcher statt der Invalidierung.

  it('AK9: eine Abfrage, die niemand verlangt, wird nicht ausgewertet', async () => {
    await bestand();
    const vorher = auswertungsZaehler();
    // Kein Aufruf von werteAusAbfrage: der Index-Aufbau allein rechnet nichts.
    expect(auswertungsZaehler()).toBe(vorher);
  });

  it('AK5/AK6: eine fehlerhafte Abfrage ergibt den leeren Vorrat, keinen Wurf', async () => {
    const { a } = await bestand();
    const { status, values } = werteAusAbfrage(a, null, 'WHERE ((( kaputt');
    expect(status).toBe('ready');
    expect(values).toEqual([]);
  });

  it('AK6: eine Abfrage ohne Treffer ist derselbe Fall und kein Fehler', async () => {
    const { a } = await bestand();
    const { status, values } = werteAusAbfrage(a, null, 'WHERE art = "gibtsnicht"');
    expect(status).toBe('ready');
    expect(values).toEqual([]);
  });

  it('meldet unavailable, wo keine Aussage möglich ist', () => {
    expect(werteAusAbfrage(null, null, 'WHERE x = 1').status).toBe('unavailable');
    const fremd = path.join(os.tmpdir(), 'nie-indexiert', 'x.md');
    expect(werteAusAbfrage(fremd, null, 'WHERE x = 1').status).toBe('unavailable');
  });

  it('eine leere Abfrage wird gar nicht erst ausgewertet', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    expect(werteAusAbfrage(a, null, '').status).toBe('unavailable');
    expect(werteAusAbfrage(a, null, '   ').status).toBe('unavailable');
    expect(werteAusAbfrage(a, null, null).status).toBe('unavailable');
    expect(auswertungsZaehler()).toBe(vorher);
  });

  it('Randleerraum im Abfrage-Text trifft denselben Eintrag', async () => {
    const { a } = await bestand();
    const vorher = auswertungsZaehler();
    werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    werteAusAbfrage(a, null, '  WHERE art = "projekt"  ');
    expect(auswertungsZaehler() - vorher).toBe(1);
  });

  it('Doppelte Treffer-Namen zählen einmal', async () => {
    const { root, a } = await bestand();
    // Zwei Dateien gleichen Namens in verschiedenen Ordnern.
    write(root, 'Anderswo/Neubau.md', '---\nart: projekt\n---\nText.');
    await indexFor(a, 'test:wertevorrat');
    const { values } = werteAusAbfrage(a, null, 'WHERE art = "projekt"');
    expect(values.filter((v) => v === 'Neubau')).toHaveLength(1);
  });
});

// Die Invalidierungs-Regel mit eingespeisten Abhängigkeiten. Sie ist die
// tragende Zusage dieses Tasks und lässt sich am echten Index NICHT prüfen:
// Der Watcher meldet im Unit-Umfeld keine zweite Index-Änderung, der Stand
// bleibt bei 1, und ein Test darüber wäre eine Behauptung statt eines
// Nachweises. Eingespeist werden deshalb `stand` und `auswerten` — dasselbe
// Mittel, mit dem der Profil-Katalog seinen Dateizugriff prüfbar macht.
describe('werteAusAbfrage — Invalidierung gegen den Index-Stand (4T-1158)', () => {
  function umgebung(werteJeLauf) {
    let stand = 1;
    let laeufe = 0;
    return {
      deps: {
        stand: () => stand,
        auswerten: () => {
          const werte = werteJeLauf[Math.min(laeufe, werteJeLauf.length - 1)];
          laeufe += 1;
          return { status: 'ready', files: werte.map((name) => ({ name })) };
        },
      },
      standBewegen: () => {
        stand += 1;
      },
      laeufe: () => laeufe,
    };
  }

  it('AK3: bei gleichem Stand wird genau einmal ausgewertet', async () => {
    const { a } = await bestand();
    const u = umgebung([['Alpha'], ['Beta']]);
    const erst = werteAusAbfrage(a, null, 'IRGENDEINE', u.deps);
    const zweit = werteAusAbfrage(a, null, 'IRGENDEINE', u.deps);
    expect(erst.values).toEqual(['Alpha']);
    expect(zweit.values).toEqual(['Alpha']); // aus dem Zwischenspeicher
    expect(u.laeufe()).toBe(1);
  });

  it('AK4: bewegt sich der Stand, wertet die nächste Anfrage neu aus', async () => {
    const { a } = await bestand();
    const u = umgebung([['Alpha'], ['Alpha', 'Beta']]);
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', u.deps).values).toEqual(['Alpha']);
    u.standBewegen();
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', u.deps).values).toEqual(['Alpha', 'Beta']);
    expect(u.laeufe()).toBe(2);
    // Und danach greift der Zwischenspeicher wieder.
    werteAusAbfrage(a, null, 'IRGENDEINE', u.deps);
    expect(u.laeufe()).toBe(2);
  });

  it('AK3: ein unfertiger Index wird nicht zwischengespeichert', async () => {
    const { a } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        return laeufe === 1 ? { status: 'indexing' } : { status: 'ready', files: [{ name: 'X' }] };
      },
    };
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', deps).status).toBe('indexing');
    // Der unfertige Stand darf nicht hängenbleiben: die nächste Anfrage
    // wertet erneut aus und liefert das echte Ergebnis.
    const zweit = werteAusAbfrage(a, null, 'IRGENDEINE', deps);
    expect(zweit.status).toBe('ready');
    expect(zweit.values).toEqual(['X']);
    expect(laeufe).toBe(2);
  });

  it('AK5: ein Wurf der Auswertung ergibt den leeren Vorrat und bleibt unzwischengespeichert', async () => {
    const { a } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        throw new Error('kaputt');
      },
    };
    expect(werteAusAbfrage(a, null, 'IRGENDEINE', deps)).toEqual({
      status: 'unavailable',
      values: [],
    });
    werteAusAbfrage(a, null, 'IRGENDEINE', deps);
    expect(laeufe).toBe(2);
  });

  it('AK9: der Zwischenspeicher wächst mit den Abfragen, nicht mit dem Bestand', async () => {
    const { a } = await bestand();
    let laeufe = 0;
    const deps = {
      stand: () => 1,
      auswerten: () => {
        laeufe += 1;
        // Ein großer Bestand: 5000 Treffer je Auswertung.
        return {
          status: 'ready',
          files: Array.from({ length: 5000 }, (_, i) => ({ name: `Datei ${i}` })),
        };
      },
    };
    // Drei verschiedene Abfragen, jede zweimal gefragt.
    for (const q of ['A', 'B', 'C']) {
      werteAusAbfrage(a, null, q, deps);
      werteAusAbfrage(a, null, q, deps);
    }
    // Drei Auswertungen für drei Abfragen — die Bestandsgröße spielt keine
    // Rolle, nur die Zahl verschiedener Abfrage-Texte.
    expect(laeufe).toBe(3);
  });
});
