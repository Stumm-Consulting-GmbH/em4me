// 4T-001820 (Epic 3E-000254, E10.5): Der Erzeuger der Vorgangs-Kennung — die
// Datei in der Bereichs-Wurzel (AK1), ihr Ausschluss aus Dateiliste, Watcher und
// Direkt-Öffnen (AK2), der Erhalt unbekannter Sektionen (AK3), die monotone,
// nicht lückenlose Folge (AK4, AK5), die eigene Sperr-Art und die Zusage, dass
// unter ihr keine weitere genommen wird (AK6), der eine Schreibweg (AK8) und die
// Wiedergewinnung aus dem Bestand (AK9).
//
// **Gearbeitet wird an echten Temp-Verzeichnissen.** Der Gegenstand ist ein
// Lesen-Rechnen-Schreiben auf einer Datei samt Konflikt-Prüfung gegen den
// gelesenen Stand; eine Attrappe des Dateisystems entschiede selbst, wann sie
// einen Konflikt meldet, und prüfte damit sich selbst.
//
// **Die Sperre ist in den meisten Fällen eine durchreichende Naht**, weil sie
// dort nicht der Gegenstand ist. Wo sie es IST — die Verweigerung ohne Naht, die
// belegte Sperre und die Zusage «keine zweite Nahme darunter» —, läuft der Fall
// gegen die ECHTE Sperr-Verwaltung; eine Attrappe könnte gerade diese Zusagen
// nicht belegen.
//
// **Der Wettlauf zweier Rechner gegen dieselbe Netz-Freigabe (AK10) und die
// Kosten-Messung (AK11) stehen nicht hier**, sondern im unversionierten
// Messprogramm unter `Tests/4T-001820/`: Ein Prüffall, der den Wettlauf
// simuliert, misst seine eigene Simulation.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  ANGABE_LETZTER,
  SEKTION_VORGAENGE,
  VORGANGS_DATEI_NAME,
  VORGANGS_SCHEMA_VERSION,
  VORGANG_CODES,
  gewinneStandWieder,
  leseVorgangsDatei,
  vorgangsDateiPfad,
  zieheVorgang,
} from '../../src/main/database/vorgangs-kennung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { ART_COUNTER, sperrDateiName } from '../../src/main/database/lock-store.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import { schreibeBeleg } from '../../src/main/database/change-log.js';
import { isMarkdownDataPath } from '../../src/shared/markdown-data-family.js';
import { createMddHistory } from '../../src/main/documents/mdd-history.js';
import { baueIgnorierRegel } from '../../src/main/area/area-watch-ignore.js';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');
const { normalisiereDatenbankKonfig } = require('../../src/main/area/area-config.js');

// --- Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README) ---------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

const ZAEHLER_QUELLE = quelltext('src/main/database/vorgangs-kennung.js');
// Der Lese-Kanal des Haupt-Prozesses, der das Direkt-Öffnen abweist (AK2).
const DATEI_KANAL_QUELLE = quelltext('src/main/ipc/files.js');

// Die Erkennung des Haupt-Prozesses, wie main.js sie baut (Muster
// db-sperren-belege-aus-zustand.test.js).
const { isMddPath } = createMddHistory({
  getStore: () => null,
  areaOfWindow: () => null,
  readAreaHistoryDefault: async () => undefined,
});

// --- Aufbau ------------------------------------------------------------------------------

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-vorgang-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

// Die durchreichende Sperr-Naht für alle Fälle, in denen die Sperre nicht der
// Gegenstand ist. Sie ist bewusst kein Nachbau der Verwaltung: Was sie belegen
// soll, ist allein, dass der Zähler seine Arbeit UNTER einer Naht ausführt.
const durchreichend = (arbeit) => arbeit();

// Der Mess-Bereich hat keine Bereichsdatei; der Leser liefert «nicht gesetzt»,
// und der Sperr-Speicher fällt auf den Vorgabe-Namen des Ordners zurück.
function echteVerwaltung() {
  return erzeugeSperrVerwaltung({ leseKonfig: async () => undefined });
}

function inhaltDer(wurzel) {
  return JSON.parse(fs.readFileSync(vorgangsDateiPfad(wurzel), 'utf8'));
}

function schreibeZaehlerDatei(wurzel, behaelter) {
  fs.writeFileSync(vorgangsDateiPfad(wurzel), `${JSON.stringify(behaelter, null, 2)}\n`, 'utf8');
}

const BELEG_NAEHTE = {
  jetzt: () => '2026-09-20T08:00:00Z',
  herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
};

// Legt eine Tabelle samt einem Beleg mit der angegebenen Vorgangs-Kennung an.
async function belegMit(wurzel, relativerPfad, vorgang) {
  const tabelle = path.join(wurzel, relativerPfad);
  fs.mkdirSync(path.dirname(tabelle), { recursive: true });
  fs.writeFileSync(tabelle, '# Tabelle\n', 'utf8');
  const geschrieben = await schreibeBeleg(
    tabelle,
    { art: 'update', id: 'r-00001', vorgang, felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] },
    BELEG_NAEHTE,
  );
  expect(geschrieben.ok).toBe(true);
  return geschrieben.pfad;
}

// --- AK1, AK4, AK5: ziehen ---------------------------------------------------------------

describe('Vorgangs-Kennung: das Ziehen (4T-001820, AK1, AK4, AK5)', () => {
  it('AK1 legt die Zähler-Datei in der Bereichs-Wurzel an und zieht die erste Kennung', async () => {
    const wurzel = bereich();

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 1, wiedergewonnen: true });
    expect(fs.existsSync(path.join(wurzel, VORGANGS_DATEI_NAME))).toBe(true);
    expect(inhaltDer(wurzel)).toEqual({
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 1 },
    });
  });

  it('AK4 zieht fortlaufend und wächst monoton', async () => {
    const wurzel = bereich();
    const gezogen = [];
    for (let i = 0; i < 5; i += 1) {
      gezogen.push((await zieheVorgang(wurzel, { mitSperre: durchreichend })).vorgang);
    }

    expect(gezogen).toEqual([1, 2, 3, 4, 5]);
    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE][ANGABE_LETZTER]).toBe(5);
  });

  it('AK4 nimmt den Stand nach einem Neustart aus der Datei und nicht aus dem Speicher', async () => {
    const wurzel = bereich();
    await zieheVorgang(wurzel, { mitSperre: durchreichend });
    await zieheVorgang(wurzel, { mitSperre: durchreichend });

    // Eine frische Modul-Instanz ist der Neustart: Hätte der Zähler
    // Arbeitsspeicher-Zustand, begänne sie hier wieder von vorn.
    vi.resetModules();
    const neu = await import('../../src/main/database/vorgangs-kennung.js');
    const gezogen = await neu.zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 3, wiedergewonnen: false });
  });

  it('AK5 vergibt nach einem abgebrochenen Auftrag die Lücke nicht erneut', async () => {
    const wurzel = bereich();
    const erste = await zieheVorgang(wurzel, { mitSperre: durchreichend });
    // Der Auftrag bricht nach dem Ziehen ab: Es entsteht kein Beleg, und die
    // Nummer bleibt ungenutzt. Genau das ist die gewollte Lücke.
    const zweite = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect([erste.vorgang, zweite.vorgang]).toEqual([1, 2]);
    // Und sie wird nie nachgereicht: Der nächste Zug geht weiter, nicht zurück.
    expect((await zieheVorgang(wurzel, { mitSperre: durchreichend })).vorgang).toBe(3);
  });

  it('meldet die fehlende Bereichs-Wurzel mit eigenem Code', async () => {
    expect(await zieheVorgang('', { mitSperre: durchreichend })).toMatchObject({
      ok: false,
      code: VORGANG_CODES.wurzel,
    });
  });
});

// --- AK3: der Container ------------------------------------------------------------------

describe('Vorgangs-Kennung: unbekannte Sektionen überleben (4T-001820, AK3)', () => {
  it('AK3 lässt eine unbekannte Sektion unverändert stehen', async () => {
    const wurzel = bereich();
    schreibeZaehlerDatei(wurzel, {
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 41 },
      spaetereSektion: { wert: 'bleibt', liste: [1, 2, 3] },
    });

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen.vorgang).toBe(42);
    expect(inhaltDer(wurzel).spaetereSektion).toEqual({ wert: 'bleibt', liste: [1, 2, 3] });
  });

  it('AK3 lässt auch eine unbekannte Angabe DERSELBEN Sektion stehen', async () => {
    // Der schärfere Fall: Eine neuere Programmfassung führt in `transactions`
    // eine zweite Angabe. Wer die Sektion neu baut statt die eine Angabe zu
    // setzen, schriebe sie weg, ohne dass es jemand merkte.
    const wurzel = bereich();
    schreibeZaehlerDatei(wurzel, {
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 7, spaetereAngabe: 'bleibt' },
    });

    await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE]).toEqual({
      [ANGABE_LETZTER]: 8,
      spaetereAngabe: 'bleibt',
    });
  });

  it('schreibt eine Datei aus einer neueren Fassung nicht zurück', async () => {
    // Entwicklungsrichtlinien, Kapitel 12: Was eine ältere Fassung nicht
    // vollständig kennt, überschreibt sie nie — es könnte gerade der Zähler sein.
    const wurzel = bereich();
    const spaeter = { schemaVersion: VORGANGS_SCHEMA_VERSION + 1, irgendwas: true };
    schreibeZaehlerDatei(wurzel, spaeter);

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.schemaVersion });
    expect(inhaltDer(wurzel)).toEqual(spaeter);
  });

  it('gewinnt den Stand wieder, wenn die Datei unlesbar ist', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 12);
    fs.writeFileSync(vorgangsDateiPfad(wurzel), '{ kein json', 'utf8');

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 13, wiedergewonnen: true });
  });

  it('gewinnt den Stand wieder, wenn die Angabe fehlt, und erhält dabei die Sektionen', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 5);
    schreibeZaehlerDatei(wurzel, {
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      fremdeSektion: { a: 1 },
    });

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 6, wiedergewonnen: true });
    expect(inhaltDer(wurzel).fremdeSektion).toEqual({ a: 1 });
  });
});

// --- AK6, B2, B5: die Sperre -------------------------------------------------------------

describe('Vorgangs-Kennung: die Sperre als Pflicht-Naht (4T-001820, AK6, B2)', () => {
  it('B2 verweigert ohne Sperr-Naht und fasst die Datei nicht an', async () => {
    const wurzel = bereich();

    const gezogen = await zieheVorgang(wurzel, {});

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.ohneSperre });
    // Verweigert wird VOR jedem Zugriff: Es entsteht nicht einmal die Datei.
    expect(fs.existsSync(path.join(wurzel, VORGANGS_DATEI_NAME))).toBe(false);
  });

  it('B5 meldet die belegte Sperre mit eigenem Code und zieht nichts', async () => {
    const wurzel = bereich();
    // Eine FREMDE Sperre entsteht von Hand und nicht über die Verwaltung: Eine
    // selbst genommene stünde im Eigen-Register und wäre gerade nicht fremd.
    const benannt = sperrDateiName(wurzel, { art: ART_COUNTER });
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    fs.writeFileSync(
      path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, benannt.name),
      JSON.stringify({ schemaVersion: 1, art: ART_COUNTER, rechner: 'SC-099', pid: 4242 }),
      'utf8',
    );
    const verwaltung = echteVerwaltung();

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: verwaltung.zaehlerSperreFuer(wurzel),
    });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.gesperrt });
    expect(gezogen.konflikt).not.toBeNull();
    expect(fs.existsSync(path.join(wurzel, VORGANGS_DATEI_NAME))).toBe(false);
  });

  it('AK6 nimmt unter der Zähler-Sperre keine weitere Sperre', async () => {
    const wurzel = bereich();
    const verwaltung = echteVerwaltung();
    const naht = verwaltung.zaehlerSperreFuer(wurzel);
    const waehrendDerArbeit = [];

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: (arbeit) =>
        naht(async () => {
          // Gemessen an der echten Verwaltung, nicht behauptet: Während der
          // Arbeit hält dieser Prozess GENAU die Zähler-Sperre.
          waehrendDerArbeit.push(verwaltung.gehalteneSperren());
          return arbeit();
        }),
    });

    expect(gezogen.ok).toBe(true);
    expect(waehrendDerArbeit).toHaveLength(1);
    expect(waehrendDerArbeit[0].map((s) => s.gegenstand.art)).toEqual([ART_COUNTER]);
    // Und danach hält er keine mehr.
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('reicht einen Wurf der Naht als eigenen Code weiter', async () => {
    const wurzel = bereich();

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: () => {
        throw new Error('Sperr-Ordner unerreichbar');
      },
    });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.sperre });
    expect(gezogen.error).toContain('unerreichbar');
  });
});

// --- B5: die Fehlschläge des Schreibens ---------------------------------------------------

describe('Vorgangs-Kennung: Fehlschläge des Ziehens (4T-001820, B5)', () => {
  it('B5 meldet die nicht beschreibbare Datei mit eigenem Code', async () => {
    const wurzel = bereich();

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: durchreichend,
      ersetzen: async () => ({ ok: false, code: 'EACCES', error: 'kein Zugriff' }),
    });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.schreiben });
    expect(gezogen.error).toContain('kein Zugriff');
  });

  it('B5 meldet sie auch am echten Dateisystem, wenn am Ort ein Ordner liegt', async () => {
    // Die Gegenprobe zum Fall darüber an der realen Konstellation: Ein Ordner
    // unter dem Namen der Datei ist weder lesbar noch ersetzbar.
    const wurzel = bereich();
    fs.mkdirSync(vorgangsDateiPfad(wurzel));

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });

    expect(gezogen.ok).toBe(false);
    expect(gezogen.code).toBe(VORGANG_CODES.schreiben);
  });

  it('meldet die fremde Änderung zwischen Lesen und Schreiben', async () => {
    const wurzel = bereich();
    schreibeZaehlerDatei(wurzel, {
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 10 },
    });
    const { ersetzeDatei } = require('../../src/main/documents/atomic-write.js');

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: durchreichend,
      // Ein anderer schreibt zwischen Lesen und Schreiben. Danach läuft der
      // ECHTE Schreibweg samt seiner Konflikt-Prüfung.
      ersetzen: async (pfad, text, opts) => {
        schreibeZaehlerDatei(wurzel, {
          schemaVersion: VORGANGS_SCHEMA_VERSION,
          [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 99 },
        });
        return ersetzeDatei(pfad, text, opts);
      },
    });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.konflikt });
    // Der fremde Stand bleibt unberührt: Die eigene Kennung wird nicht vergeben.
    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE][ANGABE_LETZTER]).toBe(99);
  });

  it('meldet auch eine fremde NEUANLAGE zwischen Lesen und Schreiben', async () => {
    const wurzel = bereich();
    const { ersetzeDatei } = require('../../src/main/documents/atomic-write.js');

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: durchreichend,
      ersetzen: async (pfad, text, opts) => {
        schreibeZaehlerDatei(wurzel, {
          schemaVersion: VORGANGS_SCHEMA_VERSION,
          [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 500 },
        });
        return ersetzeDatei(pfad, text, opts);
      },
    });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.konflikt });
  });
});

// --- AK9: die Wiedergewinnung -------------------------------------------------------------

describe('Vorgangs-Kennung: Wiedergewinnung aus dem Bestand (4T-001820, AK9, B4)', () => {
  it('AK9 nimmt das höchste tx aus mehreren Beleg-Dateien, auch aus Unterordnern', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 3);
    await belegMit(wurzel, path.join('Stammdaten', 'Artikel.md'), 17);
    await belegMit(wurzel, path.join('Stammdaten', 'tiefer', 'Preise.md'), 9);

    const wieder = await gewinneStandWieder(wurzel);

    expect(wieder).toMatchObject({ ok: true, hoechster: 17, dateien: 3 });
  });

  it('AK9 lässt sich von beschädigten Belegen nicht aufhalten', async () => {
    const wurzel = bereich();
    const belegPfad = await belegMit(wurzel, 'Kunden.md', 4);
    // Ein abgerissener Beleg: Die Zahl der Zellen passt nicht zur Angabe `n`.
    // Sein tx ist trotzdem eine Tatsache über den Bestand und zählt mit — der
    // Zähler darf nie unter einen Wert fallen, der in der Datei steht.
    fs.appendFileSync(
      belegPfad,
      '\n|- id="r-00009" kind="update" at="2026-09-20T08:00:00Z" tx="21" n="1"\n| Ort\n',
      'utf8',
    );
    await belegMit(wurzel, 'Artikel.md', 7);

    const wieder = await gewinneStandWieder(wurzel);

    expect(wieder.hoechster).toBe(21);
  });

  it('AK9 übergeht nicht auslegbare tx-Werte und zählt sie', async () => {
    const wurzel = bereich();
    const belegPfad = await belegMit(wurzel, 'Kunden.md', 6);
    fs.appendFileSync(
      belegPfad,
      '\n|- id="r-00010" kind="update" at="2026-09-20T08:00:00Z" tx="abc" n="0"\n| anna\n| SC-026\n',
      'utf8',
    );

    const wieder = await gewinneStandWieder(wurzel);

    expect(wieder.hoechster).toBe(6);
    expect(wieder.uebergangen).toBe(1);
  });

  it('AK9 übergeht den Sperr-Ordner und jeden Punkt-Ordner', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 2);
    // Zwei Beleg-Dateien an Orten, die die Anwendung nie liest. Würden sie
    // mitgelesen, stünde der Zähler danach bei 1000.
    await belegMit(wurzel, path.join(DEFAULT_LOCK_FOLDER_NAME, 'Alt.md'), 1000);
    await belegMit(wurzel, path.join('.abgelegt', 'Alt.md'), 900);

    const wieder = await gewinneStandWieder(wurzel);

    expect(wieder).toMatchObject({ hoechster: 2, dateien: 1 });
  });

  it('AK9 beginnt ohne jede Beleg-Datei bei eins', async () => {
    const wurzel = bereich();
    fs.writeFileSync(path.join(wurzel, 'Notiz.md'), '# Notiz\n', 'utf8');

    const wieder = await gewinneStandWieder(wurzel);
    expect(wieder).toMatchObject({ ok: true, hoechster: 0, dateien: 0 });

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend });
    expect(gezogen).toMatchObject({ ok: true, vorgang: 1, wiedergewonnen: true });
  });

  it('B4 gewinnt beim ERSTEN Ziehen wieder und danach nicht mehr', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 30);
    const gelesen = [];

    const naehte = {
      mitSperre: durchreichend,
      leseBelege: async (pfad, deps) => {
        gelesen.push(pfad);
        const { leseBelegDatei } = require('../../src/main/database/change-log.js');
        return leseBelegDatei(pfad, deps);
      },
    };

    expect(await zieheVorgang(wurzel, naehte)).toMatchObject({ vorgang: 31, wiedergewonnen: true });
    expect(gelesen).toHaveLength(1);

    // Der zweite Zug liest keine einzige Beleg-Datei mehr: Die Wiedergewinnung
    // ist der Ausnahmefall und kostet den laufenden Betrieb nichts.
    expect(await zieheVorgang(wurzel, naehte)).toMatchObject({
      vorgang: 32,
      wiedergewonnen: false,
    });
    expect(gelesen).toHaveLength(1);
  });

  it('liest den Stand auch ohne Sperre, ohne etwas zu schreiben', async () => {
    const wurzel = bereich();
    await zieheVorgang(wurzel, { mitSperre: durchreichend });

    const gelesen = await leseVorgangsDatei(wurzel);

    expect(gelesen).toMatchObject({ ok: true, vorhanden: true, letzter: 1 });
    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE][ANGABE_LETZTER]).toBe(1);
  });
});

// --- 4T-001964: das «nicht gefunden» aus dem Zwischenspeicher -----------------------------

// Der echte Dateizugriff, dessen Lesen der Zähler-Datei die ersten `mal` Male
// fälschlich «nicht gefunden» meldet, wie der Netzwerk-Client nach einem
// gemerkten Fehlen. Alles andere läuft gegen das echte Temp-Verzeichnis.
function mitGemerktemFehlen(wurzel, mal) {
  const aufrufe = { lesen: 0, oeffnen: [] };
  const fsp = {
    ...fs.promises,
    readFile: async (pfad, opts) => {
      if (pfad === vorgangsDateiPfad(wurzel)) {
        aufrufe.lesen += 1;
        if (aufrufe.lesen <= mal) {
          throw Object.assign(new Error('nicht gefunden'), { code: 'ENOENT' });
        }
      }
      return fs.promises.readFile(pfad, opts);
    },
    open: async (pfad, flags) => {
      aufrufe.oeffnen.push(flags);
      return fs.promises.open(pfad, flags);
    },
  };
  return { fsp, aufrufe };
}

describe('Vorgangs-Kennung: gemerktes Fehlen der Zähler-Datei (4T-001964)', () => {
  it('zählt weiter, wenn die vorhandene Datei einmal als fehlend gelesen wird', async () => {
    const wurzel = bereich();
    schreibeZaehlerDatei(wurzel, {
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 41 },
    });
    const { fsp, aufrufe } = mitGemerktemFehlen(wurzel, 1);

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: durchreichend,
      fsp,
      abstaendeUnsichtbar: [1, 1, 1],
    });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 42, wiedergewonnen: false });
    expect(aufrufe.oeffnen).toEqual(['wx']);
    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE][ANGABE_LETZTER]).toBe(42);
  });

  it('gewinnt wieder wie bisher, wenn die Datei wirklich fehlt', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 12);
    const { fsp, aufrufe } = mitGemerktemFehlen(wurzel, 0);

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend, fsp });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 13, wiedergewonnen: true });
    // Das exklusive Anlegen ist gelungen; die leere Datei hat der Schreibweg
    // danach ohne Konflikt ersetzt.
    expect(aufrufe.oeffnen).toEqual(['wx']);
    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE][ANGABE_LETZTER]).toBe(13);
  });

  it('zieht keine Kennung, solange die vorhandene Datei unsichtbar bleibt', async () => {
    const wurzel = bereich();
    const vorher = {
      schemaVersion: VORGANGS_SCHEMA_VERSION,
      [SEKTION_VORGAENGE]: { [ANGABE_LETZTER]: 41 },
    };
    schreibeZaehlerDatei(wurzel, vorher);
    const { fsp, aufrufe } = mitGemerktemFehlen(wurzel, Infinity);
    const ersetzen = vi.fn(async () => ({ ok: true }));

    const gezogen = await zieheVorgang(wurzel, {
      mitSperre: durchreichend,
      fsp,
      ersetzen,
      abstaendeUnsichtbar: [1, 1, 1],
    });

    expect(gezogen).toMatchObject({ ok: false, code: VORGANG_CODES.unsichtbar });
    // Erstes Lesen und je Abstand ein weiteres.
    expect(aufrufe.lesen).toBe(4);
    expect(ersetzen).not.toHaveBeenCalled();
    expect(inhaltDer(wurzel)).toEqual(vorher);
  });

  it('bleibt beim bisherigen Weg, wenn das exklusive Anlegen verweigert wird', async () => {
    const wurzel = bereich();
    await belegMit(wurzel, 'Kunden.md', 12);
    const fsp = {
      ...fs.promises,
      open: async (pfad, flags) => {
        if (flags === 'wx') throw Object.assign(new Error('kein Zugriff'), { code: 'EACCES' });
        return fs.promises.open(pfad, flags);
      },
    };

    const gezogen = await zieheVorgang(wurzel, { mitSperre: durchreichend, fsp });

    expect(gezogen).toMatchObject({ ok: true, vorgang: 13, wiedergewonnen: true });
    expect(inhaltDer(wurzel)[SEKTION_VORGAENGE][ANGABE_LETZTER]).toBe(13);
  });
});

// --- AK2: die Datei bleibt draußen --------------------------------------------------------

// Der echte Handler-Satz mit dem echten Leser der Bereichsdatei (Muster
// beleg-datei-bereich.test.js): So misst der Fall die Kette vom Datei-Inhalt bis
// zur Liste und nicht eine nachgebaute Filter-Bedingung.
function registriere(rootPath) {
  const handler = new Map();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: {},
    shell: {},
    senderWindow: () => ({}),
    areaOfWindow: () => ({ rootPath, name: path.basename(rootPath) }),
    tForWindow: (_w, key) => key,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
    readAreaDatabaseConfig: async () => undefined,
    normalisiereDatenbankKonfig,
    sperrOrdnerNeuBeziehen: async () => {},
  });
  return handler;
}

describe('Vorgangs-Kennung: die Datei erscheint nirgends (4T-001820, AK2)', () => {
  it('AK2 gilt beiden Erkennungen als Datei der Markdown-Data-Familie', () => {
    const pfad = vorgangsDateiPfad(path.resolve('/bereich'));

    expect(isMarkdownDataPath(pfad)).toBe(true);
    expect(isMddPath(pfad)).toBe(true);
  });

  it('AK2 erscheint nicht in der Ordner-Liste des Bereichs', async () => {
    const wurzel = bereich();
    await zieheVorgang(wurzel, { mitSperre: durchreichend });
    fs.writeFileSync(path.join(wurzel, 'Kunden.md'), '# Kunden\n', 'utf8');

    const ergebnis = await registriere(wurzel).get('area:listDir')({}, wurzel);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.files).toEqual(['Kunden.md']);
  });

  it('AK2 weckt den Bereichs-Watcher nicht', () => {
    const wurzel = path.resolve('/bereich');
    const eintrag = { rootPath: wurzel, sperrOrdner: DEFAULT_LOCK_FOLDER_NAME };
    const ignoriert = baueIgnorierRegel(eintrag, isMarkdownDataPath);

    expect(ignoriert(vorgangsDateiPfad(wurzel))).toBe(true);
    // Die Gegenprobe: Ein gewöhnliches Dokument bleibt beobachtet.
    expect(ignoriert(path.join(wurzel, 'Kunden.md'))).toBe(false);
  });

  it('AK2 wird vom Lese-Kanal des Haupt-Prozesses abgewiesen', () => {
    // Der Kanal weist über genau die Erkennung ab, die den Fall darüber trägt;
    // geprüft wird beides zusammen, damit die Aussage nicht an einer
    // umbenannten Bedingung vorbeiläuft.
    expect(DATEI_KANAL_QUELLE).toMatch(/if \(isMddPath\(filePath\)\) \{/);
    expect(DATEI_KANAL_QUELLE).toContain("error: 'mdd-file'");
    expect(isMddPath(vorgangsDateiPfad(path.resolve('/bereich')))).toBe(true);
  });
});

// --- AK8: der eine Schreibweg -------------------------------------------------------------

// Sucht die Schreib-Aufrufe am gemeinsamen Weg vorbei. Die Funktion nimmt den
// Quelltext als Eingabe und liest selbst nichts, damit ihre Gegenprobe an einem
// erfundenen Quelltext laufen kann (Muster atomares-schreiben-aufrufer.test.js).
export function findeFremdeSchreibwege(quelltext) {
  const gefunden = [];
  for (const m of quelltext.matchAll(
    /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rename|renameSync)\s*\(/g,
  )) {
    const zeilenAnfang = quelltext.lastIndexOf('\n', m.index) + 1;
    const vorText = quelltext.slice(zeilenAnfang, m.index);
    if (/(^|\s)(\/\/|\*)/.test(vorText)) continue;
    gefunden.push(m[1]);
  }
  return gefunden;
}

describe('Vorgangs-Kennung: geschrieben wird allein über den gemeinsamen Weg (4T-001820, AK8)', () => {
  it('AK8 kennt keinen zweiten Schreibweg', () => {
    expect(findeFremdeSchreibwege(ZAEHLER_QUELLE)).toEqual([]);
    // Die untere Schranke: Ohne sie wäre der Fall auch dann grün, wenn die
    // Datei gar nicht gelesen worden wäre.
    expect(ZAEHLER_QUELLE.length).toBeGreaterThan(2000);
    expect(ZAEHLER_QUELLE).toContain("require('../documents/atomic-write.js')");
  });

  it('meldet einen eingefügten Verstoß', () => {
    // Ein Wächter ohne Gegenprobe ist ein Wächter, von dem niemand weiß, ob er
    // schläft (Fehlerklasse L11).
    const verstoss = "async function s(p, t) {\n  await fsp.writeFile(p, t, 'utf8');\n}\n";

    expect(findeFremdeSchreibwege(verstoss)).toEqual(['writeFile']);
  });

  it('meldet ein Vorkommen im Kommentar nicht', () => {
    const prosa = '// Früher stand hier writeFile(pfad, text);\n/**\n * Auch rename(a, b).\n */\n';

    expect(findeFremdeSchreibwege(prosa)).toEqual([]);
  });

  it('bindet die Sperr-Verwaltung nicht ein (B2)', () => {
    // Die Kehrseite der Naht-Form: Dieses Modul kennt die Verwaltung des
    // Prozesses nicht und ist damit kein zweiter Aufrufer im Sinne des
    // Aufrufer-Wächters.
    expect(ZAEHLER_QUELLE).not.toContain('lock-lifecycle');
    expect(ZAEHLER_QUELLE).not.toContain('erzeugeSperrVerwaltung');
  });
});
