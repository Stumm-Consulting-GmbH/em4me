// 4T-001434 (Story 4S-000868, Epic 3E-000248): Der Schreibweg, der ganz oder
// gar nicht wirkt.
//
// Geprueft wird die Zusicherung selbst und nicht nur der Erfolgsfall: Nach
// jedem denkbaren Abbruch muss am Zielnamen entweder der vollstaendige alte
// oder der vollstaendige neue Inhalt stehen. Ein halber Inhalt ist der eine
// Fehler, den ein Datenspeicher nicht machen darf.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  ersetzeDatei,
  ersetzeDateiOderWirf,
  istSchattenkopie,
  raeumeSchattenkopien,
  _drosselLeeren,
  WIEDERHOL_ABSTAENDE_MS,
  RESTE_MINDESTALTER_MS,
} from '../../src/main/documents/atomic-write.js';

let verzeichnis;
let ziel;

const ALT = '# Titel\n\nAlter Inhalt\n';
const NEU = '# Titel\n\nNeuer Inhalt\n';

beforeEach(async () => {
  verzeichnis = await fs.mkdtemp(path.join(os.tmpdir(), 'em4me-atomic-'));
  ziel = path.join(verzeichnis, 'dokument.md');
  await fs.writeFile(ziel, ALT, 'utf8');
  // Der Drossel-Speicher ist Modul-Zustand: Ohne Ruecksetzen truege ein Fall
  // den Stand seines Vorgaengers.
  _drosselLeeren();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(verzeichnis, { recursive: true, force: true });
});

async function eintraege() {
  return (await fs.readdir(verzeichnis)).sort();
}

describe('atomic-write: ersetzen ueber Schattenkopie und Umbenennen', () => {
  // AK1
  it('ersetzt den Inhalt und laesst keine Schattenkopie zurueck', async () => {
    const ergebnis = await ersetzeDatei(ziel, NEU);
    expect(ergebnis.ok).toBe(true);
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
    expect(await eintraege()).toEqual(['dokument.md']);
  });

  // AK1: Die Schattenkopie muss im selben Verzeichnis liegen, sonst liefe das
  // Umbenennen ueber Datentraeger-Grenzen und waere kein Vorgang in einem Zug.
  it('legt die Schattenkopie im Verzeichnis der Zieldatei an', async () => {
    let gesehen = null;
    const echtesRename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (von, nach) => {
      gesehen = von;
      return echtesRename(von, nach);
    });
    await ersetzeDatei(ziel, NEU);
    expect(path.dirname(gesehen)).toBe(verzeichnis);
  });

  it('legt eine noch nicht vorhandene Datei an', async () => {
    const neuerPfad = path.join(verzeichnis, 'neu.md');
    const ergebnis = await ersetzeDatei(neuerPfad, NEU);
    expect(ergebnis.ok).toBe(true);
    expect(await fs.readFile(neuerPfad, 'utf8')).toBe(NEU);
  });

  // AK2
  it('erkennt eigene Schattenkopien am Namensmuster', () => {
    expect(istSchattenkopie('.dokument.md.em4me-neu-1234-7')).toBe(true);
    expect(istSchattenkopie('dokument.md')).toBe(false);
    // Bewusst streng: Die Marke im Namen genuegt nicht. Eine fremde Datei darf
    // der Aufraeum-Task nie als eigene erkennen.
    expect(istSchattenkopie('em4me-neu-1234-7')).toBe(false);
    expect(istSchattenkopie('.notiz-em4me-neu.md')).toBe(false);
    expect(istSchattenkopie(undefined)).toBe(false);
  });

  // AK3: Der Absturz zwischen Schreiben und Umbenennen ist genau der Zustand,
  // in dem eine Schattenkopie daliegt und noch nichts gewirkt hat.
  it('laesst die Zieldatei unveraendert, wenn der Vorgang vor dem Umbenennen abbricht', async () => {
    const abbruch = new Error('Abbruch vor dem Umbenennen');
    abbruch.code = 'ENOSPC';
    vi.spyOn(fs, 'rename').mockRejectedValue(abbruch);

    const ergebnis = await ersetzeDatei(ziel, NEU);

    expect(ergebnis.ok).toBe(false);
    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
  });

  it('haelt am Zielnamen nie einen halben Inhalt, auch wenn das Schreiben scheitert', async () => {
    const abbruch = new Error('Schreiben abgebrochen');
    abbruch.code = 'ENOSPC';
    vi.spyOn(fs, 'writeFile').mockRejectedValue(abbruch);

    const ergebnis = await ersetzeDatei(ziel, NEU);

    expect(ergebnis.ok).toBe(false);
    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
  });

  // AK4: Der Vergleich ist moeglich, aber nicht erzwungen.
  it('weist die Ersetzung bei abweichendem Vergleichswert ab', async () => {
    const ergebnis = await ersetzeDatei(ziel, NEU, { expected: 'ein anderer Stand\n' });
    expect(ergebnis).toEqual({ ok: false, reason: 'conflict' });
    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
  });

  it('ersetzt bei uebereinstimmendem Vergleichswert', async () => {
    const ergebnis = await ersetzeDatei(ziel, NEU, { expected: ALT });
    expect(ergebnis.ok).toBe(true);
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
  });

  it('prueft ohne Vergleichswert nicht und ersetzt', async () => {
    const ergebnis = await ersetzeDatei(ziel, NEU);
    expect(ergebnis.ok).toBe(true);
  });

  // Eine fehlende Datei ist eine Neuanlage und kein Konflikt.
  it('meldet fuer eine fehlende Datei keinen Konflikt', async () => {
    const neuerPfad = path.join(verzeichnis, 'gibtsnicht.md');
    const ergebnis = await ersetzeDatei(neuerPfad, NEU, { expected: ALT });
    expect(ergebnis.ok).toBe(true);
  });

  // AK5
  it('meldet den Fehlschlag mit Grund, wenn das Verzeichnis fehlt', async () => {
    const unmoeglich = path.join(verzeichnis, 'fehlt', 'tief', 'datei.md');
    const ergebnis = await ersetzeDatei(unmoeglich, NEU);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('ENOENT');
    expect(typeof ergebnis.error).toBe('string');
    expect(ergebnis.error.length).toBeGreaterThan(0);
  });

  it('raeumt die Schattenkopie nach einem endgueltigen Fehlschlag weg', async () => {
    const abbruch = new Error('dauerhaft');
    abbruch.code = 'ENOSPC';
    vi.spyOn(fs, 'rename').mockRejectedValue(abbruch);

    await ersetzeDatei(ziel, NEU);

    expect(await eintraege()).toEqual(['dokument.md']);
  });
});

// Der Kern der Messung aus 4T-001433: Das Umbenennen wirkt in einem Zug, es
// gelingt nur nicht immer beim ersten Versuch. Ohne diese Schleife schluege
// das Speichern auf einer Netz-Freigabe regelmaessig fehl.
describe('atomic-write: Wiederholung des Umbenennens', () => {
  it('wiederholt bei EPERM und gelingt beim zweiten Versuch', async () => {
    const echtesRename = fs.rename.bind(fs);
    const fehler = new Error('vom Virenscanner gehalten');
    fehler.code = 'EPERM';
    let aufrufe = 0;
    vi.spyOn(fs, 'rename').mockImplementation(async (von, nach) => {
      aufrufe += 1;
      if (aufrufe === 1) throw fehler;
      return echtesRename(von, nach);
    });

    const ergebnis = await ersetzeDatei(ziel, NEU);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.versuche).toBe(2);
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
  });

  // Das voreingestellte Fenster dauert rund drei Sekunden. Ein Fall, der die
  // echte Zeit verwartet, laege zu nah am voreingestellten Zeitlimit von fuenf
  // Sekunden und riss es unter Fremdlast durch Verdraengung (Fehlerklasse L8,
  // sieben Vorfaelle laut test/README.md). Gefahren wird deshalb mit einem
  // kurzen Fenster ueber `abstaende`. Der zuvor versuchte Zeitgeber-Ersatz war
  // isoliert gruen und im Voll-Lauf rot: Er haengt an der Reihenfolge der
  // dazwischenliegenden Datei-Operationen und ist unter Last nicht
  // verlaesslich.
  it('gibt nach dem letzten Abstand auf und meldet den Code', async () => {
    const fehler = new Error('dauerhaft gehalten');
    fehler.code = 'EBUSY';
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(fehler);
    const kurz = [1, 1, 1];

    const ergebnis = await ersetzeDatei(ziel, NEU, { abstaende: kurz });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('EBUSY');
    // Ein Versuch mehr als Abstaende: Der letzte Abstand fuehrt zum letzten
    // Versuch, danach wird aufgegeben.
    expect(rename).toHaveBeenCalledTimes(kurz.length + 1);
    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
  });

  // Die voreingestellte Auslegung ist selbst Gegenstand der Pruefung: Sie
  // stammt aus der Messung in 4T-001433, und ein stilles Zusammenschrumpfen
  // waere die Ruecknahme genau dessen, was den Schreibweg auf Netz-Freigaben
  // erst tragfaehig macht.
  it('legt das voreingestellte Fenster auf rund drei Sekunden aus', () => {
    const summe = WIEDERHOL_ABSTAENDE_MS.reduce((a, b) => a + b, 0);
    expect(summe).toBeGreaterThanOrEqual(3000);
    expect(summe).toBeLessThanOrEqual(5000);
    // Wachsende Abstaende: kurz beginnen, damit der Regelfall sofort durch ist.
    expect(WIEDERHOL_ABSTAENDE_MS[0]).toBeLessThanOrEqual(10);
  });

  // Bei diesen Codes aendert Warten nichts; die Schleife wuerde den Fehler nur
  // um das volle Fenster verschleppen.
  it('wiederholt nicht bei einem Code, bei dem Warten nichts aendert', async () => {
    const fehler = new Error('kein Platz');
    fehler.code = 'ENOSPC';
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(fehler);

    await ersetzeDatei(ziel, NEU);

    expect(rename).toHaveBeenCalledTimes(1);
  });
});

describe('atomic-write: Anbindung an den Datei-Beobachter', () => {
  it('registriert den Schreibvorgang vor dem Umbenennen', async () => {
    const reihenfolge = [];
    const echtesRename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (von, nach) => {
      reihenfolge.push('rename');
      return echtesRename(von, nach);
    });
    const markSelfWriting = vi.fn(() => reihenfolge.push('merke'));

    await ersetzeDatei(ziel, NEU, { markSelfWriting });

    expect(markSelfWriting).toHaveBeenCalledWith(ziel, NEU);
    expect(reihenfolge).toEqual(['merke', 'rename']);
  });

  it('kommt ohne Rueckruf aus', async () => {
    const ergebnis = await ersetzeDatei(ziel, NEU);
    expect(ergebnis.ok).toBe(true);
  });

  // Entwicklungsrichtlinien Kapitel 3: der einmal gepruefte Vertrag, der laut
  // bricht, statt der Weiche, die den Irrtum plausibel weiterlaufen laesst.
  it('bricht laut, wenn der Rueckruf keine Funktion ist', async () => {
    await expect(ersetzeDatei(ziel, NEU, { markSelfWriting: 'ja bitte' })).rejects.toThrow(
      TypeError,
    );
  });

  it('bricht laut bei fehlendem Pfad oder falschem Inhalts-Typ', async () => {
    await expect(ersetzeDatei('', NEU)).rejects.toThrow(TypeError);
    await expect(ersetzeDatei(ziel, null)).rejects.toThrow(TypeError);
    await expect(ersetzeDatei(ziel, 42)).rejects.toThrow(TypeError);
  });
});

// 4T-001435: Der PDF-Export schreibt einen Puffer. Ein halb geschriebenes PDF
// ist genauso kaputt wie ein halbes Dokument, die Zusicherung gilt also auch
// dort.
describe('atomic-write: Binaerdaten', () => {
  it('ersetzt mit einem Puffer', async () => {
    const daten = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe]);
    const pfad = path.join(verzeichnis, 'ausgabe.pdf');

    const ergebnis = await ersetzeDatei(pfad, daten);

    expect(ergebnis.ok).toBe(true);
    expect(Buffer.compare(await fs.readFile(pfad), daten)).toBe(0);
  });

  it('laesst eine bestehende Datei unveraendert, wenn das Ersetzen scheitert', async () => {
    const fehler = new Error('gehalten');
    fehler.code = 'ENOSPC';
    vi.spyOn(fs, 'rename').mockRejectedValue(fehler);

    const ergebnis = await ersetzeDatei(ziel, Buffer.from(NEU, 'utf8'));

    expect(ergebnis.ok).toBe(false);
    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
  });
});

// 4T-001436: Ein Abbruch zwischen Schreiben und Umbenennen laesst eine
// Schattenkopie liegen. Die Zusicherung ist dann gehalten, aber ohne
// Aufraeumen sammeln sich diese Dateien im Ordner des Anwenders an.
describe('atomic-write: zurueckgebliebene Schattenkopien aufraeumen', () => {
  // Legt eine Schattenkopie an und datiert sie zurueck, damit sie als
  // zurueckgeblieben gilt.
  async function altenRestAnlegen(name, alterMs = RESTE_MINDESTALTER_MS + 60_000) {
    const voll = path.join(verzeichnis, name);
    await fs.writeFile(voll, 'halb geschriebener Stand\n', 'utf8');
    const zeit = new Date(Date.now() - alterMs);
    await fs.utimes(voll, zeit, zeit);
    return voll;
  }

  // AK1
  it('entfernt eine zurueckgebliebene Schattenkopie', async () => {
    const rest = await altenRestAnlegen('.dokument.md.em4me-neu-99999-1');

    const ergebnis = await raeumeSchattenkopien(verzeichnis, { ohneDrossel: true });

    expect(ergebnis.entfernt).toEqual([rest]);
    expect(await eintraege()).toEqual(['dokument.md']);
  });

  it('entfernt den Rest auch beim naechsten gewoehnlichen Schreibvorgang', async () => {
    await altenRestAnlegen('.dokument.md.em4me-neu-99999-2');

    await ersetzeDatei(ziel, NEU);

    expect(await eintraege()).toEqual(['dokument.md']);
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
  });

  // AK2 — die wichtigste Grenze: im Zweifel nicht loeschen.
  it('laesst eine fremde Datei stehen, die dem Muster nur aehnelt', async () => {
    const fremde = [
      'notizen-em4me-neu.md', // Marke im Namen, aber kein fuehrender Punkt
      '.em4me-neu-1-2', // fuehrender Punkt und Marke, aber kein Zielname davor
      '.dokument.md.em4me-neu-abc-1', // Prozess-Kennung keine Zahl
      '.dokument.md.em4me-alt-1-2', // andere Marke
      '.versteckt.md', // gewoehnliche versteckte Datei
    ];
    for (const n of fremde) await altenRestAnlegen(n);

    const ergebnis = await raeumeSchattenkopien(verzeichnis, { ohneDrossel: true });

    expect(ergebnis.entfernt).toEqual([]);
    expect(await eintraege()).toEqual(['dokument.md', ...fremde].sort());
  });

  // AK3
  it('beruehrt die Zieldatei unter keinen Umstaenden', async () => {
    await altenRestAnlegen('.dokument.md.em4me-neu-99999-3');
    const vorher = await fs.stat(ziel);

    await raeumeSchattenkopien(verzeichnis, { ohneDrossel: true });

    const nachher = await fs.stat(ziel);
    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
    expect(nachher.mtimeMs).toBe(vorher.mtimeMs);
  });

  // AK4
  it('bleibt folgenlos, wenn das Entfernen fehlschlaegt', async () => {
    await altenRestAnlegen('.dokument.md.em4me-neu-99999-4');
    const fehler = new Error('gehalten');
    fehler.code = 'EPERM';
    vi.spyOn(fs, 'unlink').mockRejectedValue(fehler);

    const ergebnis = await raeumeSchattenkopien(verzeichnis, { ohneDrossel: true });

    expect(ergebnis.entfernt).toEqual([]);
    expect(ergebnis.uebersprungen).toBe(1);
  });

  it('bricht das Speichern nicht ab, wenn das Aufraeumen scheitert', async () => {
    const fehler = new Error('Verzeichnis nicht lesbar');
    fehler.code = 'EACCES';
    vi.spyOn(fs, 'readdir').mockRejectedValue(fehler);

    const ergebnis = await ersetzeDatei(ziel, NEU);

    expect(ergebnis.ok).toBe(true);
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
  });

  // Die Alters-Schwelle schuetzt einen laufenden fremden Schreibvorgang, dessen
  // Zustand diese Anwendung nicht kennt.
  it('laesst eine frische Schattenkopie stehen', async () => {
    await altenRestAnlegen('.dokument.md.em4me-neu-99999-5', 1000);

    const ergebnis = await raeumeSchattenkopien(verzeichnis, { ohneDrossel: true });

    expect(ergebnis.entfernt).toEqual([]);
    expect(ergebnis.uebersprungen).toBe(1);
  });

  // Und die Menge der laufenden Vorgaenge schuetzt den eigenen: Ein zweiter
  // Schreibvorgang im selben Verzeichnis darf die Schattenkopie des ersten
  // nicht wegraeumen.
  it('ruehrt die Schattenkopie eines laufenden eigenen Vorgangs nicht an', async () => {
    const zweites = path.join(verzeichnis, 'zweites.md');
    await fs.writeFile(zweites, ALT, 'utf8');

    const echtesRename = fs.rename.bind(fs);
    let mitten = null;
    vi.spyOn(fs, 'rename').mockImplementation(async (von, nach) => {
      // Waehrend der erste Vorgang zwischen Schreiben und Umbenennen steht,
      // raeumt ein zweiter im selben Verzeichnis auf.
      if (mitten === null) {
        mitten = von;
        const zeit = new Date(Date.now() - RESTE_MINDESTALTER_MS - 60_000);
        await fs.utimes(von, zeit, zeit); // kuenstlich alt: nur die Menge schuetzt noch
        await raeumeSchattenkopien(verzeichnis, { ohneDrossel: true });
      }
      return echtesRename(von, nach);
    });

    const ergebnis = await ersetzeDatei(ziel, NEU);

    expect(ergebnis.ok).toBe(true);
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
  });

  it('sieht wegen der Drossel nicht bei jedem Schreibvorgang nach', async () => {
    const readdir = vi.spyOn(fs, 'readdir');

    await ersetzeDatei(ziel, NEU);
    await ersetzeDatei(ziel, ALT);
    await ersetzeDatei(ziel, NEU);

    expect(readdir).toHaveBeenCalledTimes(1);
  });
});

// 4T-001435: Die umzustellenden Schreibstellen stehen alle in einem try/catch,
// das den Wurf faengt. Diese Fassung haelt ihr Verhalten im Fehlerfall
// unveraendert, damit die Umstellung eine Zeile tauscht und nicht die
// Fehlerbehandlung jedes Aufrufers neu schreibt.
describe('atomic-write: werfende Fassung fuer die Umstellung', () => {
  it('ersetzt und liefert nichts zurueck', async () => {
    await expect(ersetzeDateiOderWirf(ziel, NEU)).resolves.toBeUndefined();
    expect(await fs.readFile(ziel, 'utf8')).toBe(NEU);
  });

  it('wirft mit demselben Code, den fs.writeFile geworfen haette', async () => {
    const unmoeglich = path.join(verzeichnis, 'fehlt', 'datei.md');
    await expect(ersetzeDateiOderWirf(unmoeglich, NEU)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('laesst die Zieldatei beim Wurf unveraendert', async () => {
    const fehler = new Error('gehalten');
    fehler.code = 'ENOSPC';
    vi.spyOn(fs, 'rename').mockRejectedValue(fehler);

    await expect(ersetzeDateiOderWirf(ziel, NEU)).rejects.toThrow();

    expect(await fs.readFile(ziel, 'utf8')).toBe(ALT);
  });

  // Die Konflikt-Pruefung kennt zwei Ausgaenge, von denen einer kein Fehler
  // ist; sie in einen Wurf zu uebersetzen verwischte den Unterschied.
  it('weist die Konflikt-Pruefung ab statt sie stillschweigend zu uebergehen', async () => {
    await expect(ersetzeDateiOderWirf(ziel, NEU, { expected: ALT })).rejects.toThrow(TypeError);
  });

  it('reicht den Rueckruf an den Datei-Beobachter durch', async () => {
    const markSelfWriting = vi.fn();
    await ersetzeDateiOderWirf(ziel, NEU, { markSelfWriting });
    expect(markSelfWriting).toHaveBeenCalledWith(ziel, NEU);
  });
});
