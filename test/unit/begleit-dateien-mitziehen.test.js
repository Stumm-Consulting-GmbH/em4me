// 4T-001789 (Epic 3E-000255): Das Mitziehen der Begleit-Dateien beim
// Umbenennen und Verschieben (AK5 bis AK9, AK11, AK13, AK15).
//
// Der tragende Teil ist nicht der Erfolgsfall, sondern die Trennung der beiden
// Fälle, die bis zu diesem Vorgang dasselbe Schweigen teilten: «es gibt keine
// Begleit-Datei» und «es gibt eine, sie lässt sich aber nicht bewegen». Nach
// der Entscheidung des Product Owners vom 2026-09-18 scheitert das Umbenennen
// im zweiten Fall als Ganzes, mit Meldung und Rücknahme. Ein Prüffall, der nur
// den Erfolg misst, wäre auch dann grün, wenn die Rücknahme gar nicht liefe.
//
// Gearbeitet wird an echten Temp-Verzeichnissen, weil der Gegenstand
// Datei-Bewegung ist; eine Attrappe des Dateisystems prüfte die Attrappe. Der
// Fall «vorhanden und nicht bewegbar» entsteht über einen gezielten Ersatz von
// fs.rename für genau einen Pfad — ein gehaltenes Datei-Handle verhielte sich
// je nach Plattform anders und wäre kein verlässlicher Prüffall.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  benenneUmMitWiederholung,
  WIEDERHOL_ABSTAENDE_MS,
} from '../../src/main/documents/atomic-write.js';
import {
  BEGLEIT_ARTEN,
  BEGLEIT_CODES,
  bewegeMitBegleitDateien,
  pruefeBegleitZiele,
} from '../../src/main/documents/companion-files.js';
import { createLinkUpdate } from '../../src/main/documents/link-update.js';
import { createFileWatching } from '../../src/main/documents/file-watching.js';

// Kurzes Wiederhol-Fenster für die Prüffälle: Der Ausschöpfungs-Fall soll
// nicht drei Sekunden echte Zeit verwarten (dieselbe Begründung wie in
// atomic-write.test.js, wo der Zeitgeber-Ersatz unter Last unzuverlässig war).
const KURZ = [1, 1];

let tmpDirs = [];

function makeRoot() {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'em4me-begleit-'));
  tmpDirs.push(dir);
  return dir;
}

function schreibe(root, rel, inhalt) {
  const p = path.join(root, rel);
  fsSync.mkdirSync(path.dirname(p), { recursive: true });
  fsSync.writeFileSync(p, inhalt, 'utf8');
  return p;
}

function liegtDa(p) {
  return fsSync.existsSync(p);
}

function inhalt(p) {
  return fsSync.readFileSync(p, 'utf8');
}

// Lässt fs.rename für genau einen Pfad (als Quelle ODER als Ziel) mit dem
// angegebenen Code scheitern und reicht alles Übrige an das echte Umbenennen
// durch.
function haltePfad(pfad, code = 'EPERM') {
  const echtesRename = fs.rename.bind(fs);
  const fehler = new Error(`Pfad gehalten: ${pfad}`);
  fehler.code = code;
  return vi.spyOn(fs, 'rename').mockImplementation(async (von, nach) => {
    if (von === pfad || nach === pfad) throw fehler;
    return echtesRename(von, nach);
  });
}

// renameSingleFile mit den Bezügen, die es wirklich braucht. Die Beobachtung
// kommt als ECHTES moveWatchEntry herein: Die Rücknahme läuft in seinem
// Rückruf, und ein nachgebauter Rückruf prüfte genau diese Annahme nicht mit.
function baueUmbenennen() {
  const meldungen = [];
  const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
  const lu = createLinkUpdate({
    moveWatchEntry,
    mddKeyOf: (p) => p.toLowerCase(),
    mddOpenPackets: new Map(),
    mddSuspendedPaths: new Set(),
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    broadcast: (kanal, daten) => meldungen.push({ kanal, daten }),
    books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
    followAreaStartPage: async () => {},
  });
  return { renameSingleFile: lu.renameSingleFile, meldungen };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// --- AK15: die eine Wiederhol-Schleife ----------------------------------------

describe('benenneUmMitWiederholung — die eine Schleife (AK15)', () => {
  it('wiederholt bei einem wiederholbaren Fehler und gelingt danach', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Quelle.md', 'Inhalt\n');
    const nach = path.join(root, 'Ziel.md');
    const echtesRename = fs.rename.bind(fs);
    const fehler = new Error('vom Virenscanner gehalten');
    fehler.code = 'EPERM';
    let aufrufe = 0;
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      aufrufe += 1;
      if (aufrufe === 1) throw fehler;
      return echtesRename(a, b);
    });

    const ergebnis = await benenneUmMitWiederholung(von, nach, { abstaende: KURZ });

    expect(ergebnis.versuche).toBe(2);
    expect(liegtDa(nach)).toBe(true);
    expect(liegtDa(von)).toBe(false);
  });

  it('wirft nach dem letzten Abstand den letzten Fehler samt Code', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Quelle.md', 'Inhalt\n');
    const nach = path.join(root, 'Ziel.md');
    const fehler = new Error('dauerhaft gehalten');
    fehler.code = 'EBUSY';
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(fehler);

    await expect(benenneUmMitWiederholung(von, nach, { abstaende: KURZ })).rejects.toMatchObject({
      code: 'EBUSY',
    });
    // Ein Versuch mehr als Abstände: Der letzte Abstand führt zum letzten
    // Versuch, danach wird aufgegeben.
    expect(rename).toHaveBeenCalledTimes(KURZ.length + 1);
    expect(inhalt(von)).toBe('Inhalt\n');
  });

  it('wiederholt nicht, wo Warten nichts ändert', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Quelle.md', 'Inhalt\n');
    const fehler = new Error('kein Platz');
    fehler.code = 'ENOSPC';
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(fehler);

    await expect(
      benenneUmMitWiederholung(von, path.join(root, 'Ziel.md'), { abstaende: KURZ }),
    ).rejects.toThrow();

    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('nutzt ohne Angabe das gemessene Fenster des gemeinsamen Schreibwegs (AK6)', async () => {
    // Das Fenster ist der Grund der Schleife: Auf einer Netz-Freigabe
    // scheiterte das Umbenennen in bis zu 39 Prozent der Fälle mit EPERM.
    const summe = WIEDERHOL_ABSTAENDE_MS.reduce((a, b) => a + b, 0);
    expect(summe).toBeGreaterThanOrEqual(3000);

    // Und ohne Angabe gilt genau dieses Fenster: Ein einzelner EPERM wird
    // überstanden, ohne dass der Aufrufer etwas mitgibt.
    const root = makeRoot();
    const von = schreibe(root, 'Quelle.md', 'Inhalt\n');
    const nach = path.join(root, 'Ziel.md');
    const echtesRename = fs.rename.bind(fs);
    const fehler = new Error('kurz gehalten');
    fehler.code = 'EPERM';
    let aufrufe = 0;
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      aufrufe += 1;
      if (aufrufe === 1) throw fehler;
      return echtesRename(a, b);
    });

    const ergebnis = await benenneUmMitWiederholung(von, nach);

    expect(ergebnis.versuche).toBe(2);
    expect(liegtDa(nach)).toBe(true);
  });
});

// --- AK5: Mechanik über eine Liste --------------------------------------------

describe('Begleit-Datei-Arten als Liste (AK5)', () => {
  it('führt die Dokument-Begleitdatei und die Beleg-Datei mit ihrem Pflicht-Merkmal', () => {
    expect(BEGLEIT_ARTEN.map((a) => a.endung)).toEqual(['.mdd', '.mddl']);
    expect(BEGLEIT_ARTEN.find((a) => a.endung === '.mdd').pflicht).toBe(false);
    expect(BEGLEIT_ARTEN.find((a) => a.endung === '.mddl').pflicht).toBe(true);
  });

  it('benennt die drei Fehlschlag-Kennungen an einer Stelle', () => {
    expect(BEGLEIT_CODES).toEqual(['companion', 'companion-exists', 'companion-rollback']);
  });

  it('bewegt die Pflicht-Art vor der Dokument-Begleitdatei', async () => {
    // Die Reihenfolge ist kein Zufall: Scheitert die Pflicht-Art, ist bis dahin
    // so wenig bewegt wie möglich, und die Rücknahme bleibt entsprechend kurz.
    const root = makeRoot();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mdd', 'begleit\n');
    schreibe(root, 'Kunden.mddl', 'beleg\n');
    const nach = path.join(root, 'Kundschaft.md');
    const folge = [];
    const echtesRename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      folge.push(path.extname(a));
      return echtesRename(a, b);
    });

    await bewegeMitBegleitDateien(von, nach, { abstaende: KURZ });

    expect(folge).toEqual(['.md', '.mddl', '.mdd']);
  });

  it('bewegt jede Art der Liste, ohne die Art der Hauptdatei zu kennen', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mdd', 'begleit\n');
    schreibe(root, 'Kunden.mddl', 'beleg\n');
    const nach = path.join(root, 'Kundschaft.md');

    const ergebnis = await bewegeMitBegleitDateien(von, nach, { abstaende: KURZ });

    expect(ergebnis).toEqual({ ok: true });
    expect(liegtDa(path.join(root, 'Kundschaft.mdd'))).toBe(true);
    expect(liegtDa(path.join(root, 'Kundschaft.mddl'))).toBe(true);
    expect(liegtDa(path.join(root, 'Kunden.mdd'))).toBe(false);
    expect(liegtDa(path.join(root, 'Kunden.mddl'))).toBe(false);
  });
});

// --- AK7, AK9: vorhanden, nicht vorhanden, anderer Ordner ---------------------

describe('Mitziehen beim Umbenennen und Verschieben (AK7, AK9)', () => {
  it('zieht die Beleg-Datei beim Umbenennen mit', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');
    const nach = path.join(root, 'Kundschaft.md');

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(true);
    expect(inhalt(path.join(root, 'Kundschaft.mddl'))).toBe('beleg-eins\n');
    expect(liegtDa(path.join(root, 'Kunden.mddl'))).toBe(false);
  });

  it('zieht die Beleg-Datei beim Verschieben in einen anderen Ordner mit', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');
    fsSync.mkdirSync(path.join(root, 'Archiv'));
    const nach = path.join(root, 'Archiv', 'Kunden.md');

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(true);
    expect(inhalt(path.join(root, 'Archiv', 'Kunden.mddl'))).toBe('beleg-eins\n');
    expect(liegtDa(path.join(root, 'Kunden.mddl'))).toBe(false);
  });

  it('ist ohne Begleit-Datei kein Fehler', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Notiz.md', '# Notiz\n');
    const nach = path.join(root, 'Merkzettel.md');

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(true);
    expect(liegtDa(nach)).toBe(true);
    expect(liegtDa(path.join(root, 'Merkzettel.mddl'))).toBe(false);
  });

  it('meldet «vorhanden und nicht bewegbar» statt still zu schweigen', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');
    haltePfad(path.join(root, 'Kunden.mddl'));

    const ergebnis = await renameSingleFile(von, path.join(root, 'Kundschaft.md'), {
      abstaende: KURZ,
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('companion');
    expect(typeof ergebnis.error).toBe('string');
    expect(ergebnis.error.length).toBeGreaterThan(0);
  });
});

// --- AK8a: Rücknahme -----------------------------------------------------------

describe('Rücknahme nach einem gescheiterten Mitziehen (AK8a)', () => {
  it('setzt den gesamten bewegten Bestand auf seine alten Namen zurück', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mdd', 'begleit\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');
    const nach = path.join(root, 'Kundschaft.md');
    haltePfad(path.join(root, 'Kunden.mddl'));

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.code).toBe('companion');
    // Der eigentliche Nachweis: Danach steht der Bestand wie vorher, mit
    // Inhalt, und am neuen Namen liegt nichts.
    expect(inhalt(von)).toBe('# Kunden\n');
    expect(inhalt(path.join(root, 'Kunden.mdd'))).toBe('begleit\n');
    expect(inhalt(path.join(root, 'Kunden.mddl'))).toBe('beleg-eins\n');
    expect(liegtDa(nach)).toBe(false);
    expect(liegtDa(path.join(root, 'Kundschaft.mdd'))).toBe(false);
  });

  it('nennt bei endgültig gescheiterter Rücknahme beide Pfade der Hauptdatei', async () => {
    const root = makeRoot();
    const { renameSingleFile, meldungen } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');
    const nach = path.join(root, 'Kundschaft.md');
    // Die Protokoll-Zeile der gescheiterten Rücknahme gehört zum geprüften
    // Verhalten; sie wird abgefangen, damit sie den Lauf nicht zurauscht.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Beides gehalten: das Mitziehen der Beleg-Datei UND die Rücknahme der
    // Hauptdatei, die auf ihren alten Pfad zurück müsste.
    const echtesRename = fs.rename.bind(fs);
    const fehler = new Error('gehalten');
    fehler.code = 'EPERM';
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      if (a === path.join(root, 'Kunden.mddl')) throw fehler;
      if (b === von) throw fehler;
      return echtesRename(a, b);
    });

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('companion-rollback');
    expect(ergebnis.from).toBe(von);
    expect(ergebnis.to).toBe(nach);
    // Der Zustand, den die Meldung beschreibt: Die Datei heißt neu, ihre
    // Belege liegen noch unter dem alten Namen.
    expect(liegtDa(nach)).toBe(true);
    expect(liegtDa(path.join(root, 'Kunden.mddl'))).toBe(true);
    // Die Anwendung folgt der Wirklichkeit: Die Datei liegt am neuen Pfad, also
    // geht der Rundruf hinaus. Bliebe er aus, hielte die Oberfläche die Datei
    // weiter unter dem alten Namen für geöffnet, und das nächste Speichern
    // legte dort eine zweite an.
    expect(meldungen).toEqual([{ kanal: 'file:renamed', daten: { oldPath: von, newPath: nach } }]);
  });

  it('meldet bei gelungener Rücknahme keine Umbenennung an die Fenster', async () => {
    const root = makeRoot();
    const { renameSingleFile, meldungen } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    const beleg = schreibe(root, 'Kunden.mddl', 'beleg-eins\n');
    haltePfad(beleg);

    const ergebnis = await renameSingleFile(von, path.join(root, 'Kundschaft.md'), {
      abstaende: KURZ,
    });

    expect(ergebnis.code).toBe('companion');
    expect(meldungen).toEqual([]);
  });
});

// --- AK11: die Dokument-Begleitdatei bleibt, wie sie war ----------------------

describe('Dokument-Begleitdatei unverändert (AK11)', () => {
  it('zieht sie beim Umbenennen mit', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Notiz.md', '# Notiz\n');
    schreibe(root, 'Notiz.mdd', 'begleit\n');
    const nach = path.join(root, 'Merkzettel.md');

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(true);
    expect(inhalt(path.join(root, 'Merkzettel.mdd'))).toBe('begleit\n');
  });

  it('lässt das Umbenennen nicht scheitern, wenn sie nicht bewegbar ist', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Notiz.md', '# Notiz\n');
    schreibe(root, 'Notiz.mdd', 'begleit\n');
    const nach = path.join(root, 'Merkzettel.md');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    haltePfad(path.join(root, 'Notiz.mdd'));

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    // Unverändertes Verhalten: Das Umbenennen gelingt, die Begleitdatei bleibt
    // liegen. Neu ist allein der Protokoll-Eintrag.
    expect(ergebnis.ok).toBe(true);
    expect(liegtDa(nach)).toBe(true);
    expect(liegtDa(path.join(root, 'Notiz.mdd'))).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('überschreibt ein vorhandenes Ziel wie bisher', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Notiz.md', '# Notiz\n');
    schreibe(root, 'Notiz.mdd', 'neue Begleitdatei\n');
    schreibe(root, 'Merkzettel.mdd', 'alte Begleitdatei\n');
    const nach = path.join(root, 'Merkzettel.md');

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(true);
    expect(inhalt(path.join(root, 'Merkzettel.mdd'))).toBe('neue Begleitdatei\n');
  });
});

// --- AK13: Vorab-Prüfung -------------------------------------------------------

describe('Beleg-Datei an Quelle und Ziel (AK13)', () => {
  it('weist vor jeder Bewegung ab und lässt alle drei Dateien unberührt', async () => {
    const root = makeRoot();
    const { renameSingleFile } = baueUmbenennen();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-neu\n');
    const zielBeleg = schreibe(root, 'Kundschaft.mddl', 'beleg-alt\n');
    const nach = path.join(root, 'Kundschaft.md');

    const ergebnis = await renameSingleFile(von, nach, { abstaende: KURZ });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('companion-exists');
    expect(ergebnis.companionPath).toBe(zielBeleg);
    // Nichts bewegt, nichts überschrieben — der Inhalt beider Belege steht
    // unverändert, und das ist der Punkt: fs.rename hätte den alten Beleg
    // kommentarlos vernichtet.
    expect(inhalt(von)).toBe('# Kunden\n');
    expect(inhalt(path.join(root, 'Kunden.mddl'))).toBe('beleg-neu\n');
    expect(inhalt(zielBeleg)).toBe('beleg-alt\n');
    expect(liegtDa(nach)).toBe(false);
  });

  it('lässt eine reine Änderung der Groß-Klein-Schreibung zu', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');

    const ergebnis = await pruefeBegleitZiele(von, path.join(root, 'KUNDEN.md'));

    expect(ergebnis).toEqual({ ok: true });
  });

  it('greift nicht, wo am Ziel nichts liegt', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Kunden.md', '# Kunden\n');
    schreibe(root, 'Kunden.mddl', 'beleg-eins\n');

    const ergebnis = await pruefeBegleitZiele(von, path.join(root, 'Kundschaft.md'));

    expect(ergebnis).toEqual({ ok: true });
  });

  it('greift nicht für die Dokument-Begleitdatei, die überschrieben werden darf', async () => {
    const root = makeRoot();
    const von = schreibe(root, 'Notiz.md', '# Notiz\n');
    schreibe(root, 'Notiz.mdd', 'neue Begleitdatei\n');
    schreibe(root, 'Merkzettel.mdd', 'alte Begleitdatei\n');

    const ergebnis = await pruefeBegleitZiele(von, path.join(root, 'Merkzettel.md'));

    expect(ergebnis).toEqual({ ok: true });
  });
});
