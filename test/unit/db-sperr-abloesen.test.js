// 4T-001788 (Epic 3E-000255, E9, Bauplan L6 und L6a): Das **Ablösen** einer
// Sperre samt Bruch-Anspruch — der Anspruch als exklusives Anlegen, der zweite
// Blick auf den Stand unter dem Anspruch, das Umbenennen als zweiter Schritt,
// der liegengebliebene Anspruch und das Zurückstellen als Rückfall aus L6.
//
// **Eigene Prüfdatei**, herausgeschnitten aus `db-sperr-lebenszyklus.test.js`:
// Mit dem Anspruch ist das Ablösen eine eigene Fachlichkeit mit eigenem Aufbau
// geworden, und jene Datei hätte ihr Größen-Budget gerissen.
//
// **Gearbeitet wird an echten Temp-Verzeichnissen**, weil der Gegenstand das
// exklusive Anlegen und das Umbenennen des Dateisystems IST. Eine Attrappe des
// Dateisystems entschiede selbst, wann sie EEXIST meldet, und damit wäre gerade
// die Eigenschaft nicht gemessen, auf der die ganze Sperre ruht.
//
// **Fremde Sperren und fremde Ansprüche entstehen von Hand und nicht über die
// geprüfte Funktion** (test/README): Der Aufbau eines Prüffalls darf nicht den
// Weg nehmen, den der Fall prüft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  LEBEN_CODES,
  SPERR_FRIST_MS,
  erzeugeSperrVerwaltung,
} from '../../src/main/database/lock-lifecycle.js';
import {
  ABGELOEST_MARKE,
  ABLOESE_GRUENDE,
  ANSPRUCH_MARKE,
  loeseSperreAb,
} from '../../src/main/database/lock-replace.js';
import {
  ART_DATENSATZ,
  SPERR_CODES,
  listeSperren,
  sperrDateiName,
  standVon,
} from '../../src/main/database/lock-store.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import { AUFRAEUM_ZEITLIMIT } from '../zeitlimits.js';

// Die Aufräum-Hooks löschen je Fall einen Wegwerf-Baum; unter Windows-Dateisperren
// brauchen sie mehr Luft als die Fälle selbst.
vi.setConfig({ hookTimeout: AUFRAEUM_ZEITLIMIT });

// --- Aufbau ------------------------------------------------------------------------------

const EIGENE_PID = 4711;
const FREMDE_PID = 9999;
const START_MS = Date.parse('2026-09-19T08:00:00Z');
// Der Augenblick, in dem eine um 08:00 Uhr angelegte fremde Sperre gerade
// abgelaufen ist und zum Bruch angeboten wird.
const ABLAUF_MS = START_MS + SPERR_FRIST_MS;

const DATENSATZ = { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00042' };
const NUR_KONFIG = { leseKonfig: async () => undefined };

function alsZeitpunkt(ms) {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-abloesen-'));
  tmpDirs.push(wurzel);
  fs.writeFileSync(path.join(wurzel, 'Kunden.md'), '# Kunden\n', 'utf8');
  return wurzel;
}

function sperrPfad(wurzel, gegenstand) {
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, sperrDateiName(wurzel, gegenstand).name);
}

// Der Anspruch hängt am Stand: derselbe Aufbau wie im Produkt, nur von außen.
function anspruchsPfad(wurzel, gegenstand, stand) {
  return `${sperrPfad(wurzel, gegenstand)}${ANSPRUCH_MARKE}${stand.slice(0, 16)}`;
}

function schreibe(pfad, text) {
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return { pfad, text, stand: standVon(text) };
}

// Eine fremde Sperre, von Hand geschrieben.
function fremdeSperre(wurzel, gegenstand, felder = {}) {
  const inhalt = {
    schemaVersion: 1,
    art: gegenstand.art,
    tabelle: gegenstand.tabelle,
    benutzer: 'bert',
    rechner: 'SC-027',
    zeitpunkt: alsZeitpunkt(START_MS),
    marke: 'fremdfremdfremd0',
    pid: FREMDE_PID,
    ...felder,
  };
  return schreibe(sperrPfad(wurzel, gegenstand), `${JSON.stringify(inhalt, null, 2)}\n`);
}

// Ein fremder Anspruch, von Hand geschrieben. Vorgabe ist der LEBENDE Fall:
// fremder Rechner, frischer Zeitpunkt.
function fremderAnspruch(wurzel, gegenstand, stand, felder = {}) {
  const inhalt = {
    schemaVersion: 1,
    benutzer: 'bert',
    rechner: 'SC-027',
    pid: FREMDE_PID,
    zeitpunkt: alsZeitpunkt(ABLAUF_MS),
    ...felder,
  };
  return schreibe(anspruchsPfad(wurzel, gegenstand, stand), `${JSON.stringify(inhalt, null, 2)}\n`);
}

function inhaltVon(pfad) {
  return JSON.parse(fs.readFileSync(pfad, 'utf8'));
}

function dateienImOrdner(wurzel) {
  const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
  return fs.existsSync(ordner) ? fs.readdirSync(ordner).sort() : [];
}

function anspruecheImOrdner(wurzel) {
  return dateienImOrdner(wurzel).filter((name) => name.includes(ANSPRUCH_MARKE));
}

// Eine Verwaltung mit fester Uhr, festem Rechner und einspritzbarer
// Lebend-Prüfung. `jetztMs` steht auf dem Augenblick, in dem eine um 08:00 Uhr
// angelegte fremde Sperre gerade abgelaufen ist.
function verwaltungFuer(pid, lebendig, benutzer = 'anna') {
  return erzeugeSperrVerwaltung({
    ...NUR_KONFIG,
    jetzt: () => alsZeitpunkt(ABLAUF_MS),
    herkunft: () => ({ benutzer, rechner: 'SC-026' }),
    uhr: () => ABLAUF_MS,
    prozess: { pid, lebt: (fremd) => lebendig.has(fremd) },
  });
}

// --- L6a: der Anspruch entsteht und verschwindet wieder ----------------------------------

describe('Bruch-Anspruch: exklusiv angelegt, in jedem Ausgang wieder fort (4T-001788, L6a)', () => {
  it('hält den Anspruch, während umbenannt wird, und räumt ihn danach weg', async () => {
    // Der tragende Nachweis der Reihenfolge: Das Umbenennen ist der ZWEITE
    // Schritt und läuft unter dem Anspruch, nicht an seiner Stelle.
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);
    let anspruchStandBeimUmbenennen = null;
    const deps = {
      ...NUR_KONFIG,
      benenneUm: async (von, nach) => {
        anspruchStandBeimUmbenennen = fs.existsSync(anspruchsPfad(wurzel, DATENSATZ, fremd.stand));
        await fsp.rename(von, nach);
      },
    };

    const ergebnis = await loeseSperreAb(wurzel, DATENSATZ, fremd.stand, deps);

    expect(ergebnis).toMatchObject({ ok: true, abgeloest: true });
    expect(anspruchStandBeimUmbenennen).toBe(true);
    expect(dateienImOrdner(wurzel)).toEqual([]);
  });

  it.each([
    ['abgelöst', (wurzel) => fremdeSperre(wurzel, DATENSATZ).stand, {}],
    ['abweichendem Stand', (wurzel) => (fremdeSperre(wurzel, DATENSATZ), standVon('alt')), {}],
    ['verschwundener Sperre', (wurzel) => (fremdeSperre(wurzel, DATENSATZ), null), {}],
    [
      'einem Fehlschlag beim Umbenennen',
      (wurzel) => fremdeSperre(wurzel, DATENSATZ).stand,
      {
        benenneUm: async () => {
          throw Object.assign(new Error('kein Zugriff'), { code: 'EACCES' });
        },
      },
    ],
  ])('lässt nach %s keinen Anspruch liegen', async (_lage, aufbau, abweichung) => {
    const wurzel = bereich();
    const stand = aufbau(wurzel);
    if (stand === null) fs.unlinkSync(sperrPfad(wurzel, DATENSATZ));

    const ergebnis = await loeseSperreAb(
      wurzel,
      DATENSATZ,
      stand === null ? standVon('alt') : stand,
      { ...NUR_KONFIG, ...abweichung },
    );

    expect(typeof ergebnis.ok).toBe('boolean');
    expect(anspruecheImOrdner(wurzel)).toEqual([]);
  });

  it('meldet den Fehlschlag des Umbenennens als solchen und nicht als folgenlosen Ausgang', async () => {
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);
    const deps = {
      ...NUR_KONFIG,
      benenneUm: async () => {
        throw Object.assign(new Error('kein Zugriff'), { code: 'EACCES' });
      },
    };

    expect(await loeseSperreAb(wurzel, DATENSATZ, fremd.stand, deps)).toMatchObject({
      ok: false,
      code: SPERR_CODES.abloesen,
    });
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });

  it('meldet einen fehlenden Sperr-Ordner als verschwunden und legt keinen an', async () => {
    const wurzel = bereich();

    expect(await loeseSperreAb(wurzel, DATENSATZ, standVon('alt'), NUR_KONFIG)).toMatchObject({
      ok: true,
      abgeloest: false,
      grund: ABLOESE_GRUENDE.verschwunden,
    });
    expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
  });
});

// --- L6a: ein bestehender fremder Anspruch ------------------------------------------------

describe('Fremder Anspruch: wer ihn nicht bekommt, löst nicht ab (4T-001788, L6a)', () => {
  it('meldet einen lebenden fremden Anspruch als «in Arbeit» und rührt die Sperre nicht an', async () => {
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: alsZeitpunkt(START_MS) });
    const anspruch = fremderAnspruch(wurzel, DATENSATZ, fremd.stand);
    const benenneUm = vi.fn(fsp.rename);
    const lebendig = new Set([FREMDE_PID]);
    const verwaltung = erzeugeSperrVerwaltung({
      ...NUR_KONFIG,
      jetzt: () => alsZeitpunkt(ABLAUF_MS),
      herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
      uhr: () => ABLAUF_MS,
      prozess: { pid: EIGENE_PID, lebt: (pid) => lebendig.has(pid) },
      benenneUm,
    });

    const versuch = await verwaltung.brich(wurzel, DATENSATZ, fremd.stand);

    expect(versuch).toMatchObject({ ok: true, gehalten: false, grund: LEBEN_CODES.inArbeit });
    expect(versuch.konflikt.benutzer).toBe('bert');
    // Kein Umbenennen, keine Änderung, kein Eigen-Register-Eintrag.
    expect(benenneUm).not.toHaveBeenCalled();
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
    expect(fs.readFileSync(anspruch.pfad, 'utf8')).toBe(anspruch.text);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('legt beim Nehmen eines Absturz-Rests nichts an, solange ein anderer ihn ablöst', async () => {
    // Der Übernahme-Zweig von `nimm`: Der Rest wäre übernehmbar, aber ein
    // anderer hat den Anspruch. Wer hier anlegte, machte genau den
    // Doppel-Halter, gegen den der Anspruch antritt.
    const wurzel = bereich();
    const rest = fremdeSperre(wurzel, DATENSATZ, { rechner: 'SC-026', pid: 5000 });
    fremderAnspruch(wurzel, DATENSATZ, rest.stand);
    const verwaltung = verwaltungFuer(EIGENE_PID, new Set([FREMDE_PID]));

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch).toMatchObject({ ok: true, gehalten: false });
    expect(versuch.konflikt.rechner).toBe('SC-026');
    expect(fs.readFileSync(rest.pfad, 'utf8')).toBe(rest.text);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it.each([
    ['ein Absturz-Rest desselben Rechners ist', { rechner: 'SC-026', pid: 5000 }],
    ['älter als die Frist ist', { zeitpunkt: alsZeitpunkt(START_MS - SPERR_FRIST_MS) }],
  ])('entfernt einen Anspruch, der %s, und bricht danach doch', async (_lage, felder) => {
    // Der Absturz im Fenster von Millisekunden zwischen Anlegen und Entfernen.
    // Beurteilt wird er nach denselben zwei Regeln wie eine Sperre; wiederholt
    // wird das Anlegen genau einmal.
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: alsZeitpunkt(START_MS) });
    const anspruch = fremderAnspruch(wurzel, DATENSATZ, fremd.stand, felder);
    const verwaltung = verwaltungFuer(EIGENE_PID, new Set([FREMDE_PID]));

    const gebrochen = await verwaltung.brich(wurzel, DATENSATZ, fremd.stand);

    expect(gebrochen).toMatchObject({ ok: true, gehalten: true, gebrochen: true });
    expect(inhaltVon(fremd.pfad)).toMatchObject({ benutzer: 'anna', pid: EIGENE_PID });
    expect(fs.existsSync(anspruch.pfad)).toBe(false);
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(fremd.pfad)]);
  });

  it('gilt ohne die Naht der Verwaltung nie als verwaist', async () => {
    // Der Speicher kennt weder Frist noch Lebend-Prüfung. Ein Aufrufer ohne die
    // Naht bekommt deshalb «in Arbeit» und nicht etwa eine eigene Auslegung.
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);
    fremderAnspruch(wurzel, DATENSATZ, fremd.stand, {
      rechner: 'SC-026',
      pid: 5000,
      zeitpunkt: alsZeitpunkt(START_MS - SPERR_FRIST_MS * 10),
    });

    expect(await loeseSperreAb(wurzel, DATENSATZ, fremd.stand, NUR_KONFIG)).toMatchObject({
      ok: true,
      abgeloest: false,
      grund: ABLOESE_GRUENDE.inArbeit,
    });
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });
});

// --- L6a: der zweite Blick auf den Stand -------------------------------------------------

describe('Unter dem Anspruch entscheidet der Stand (4T-001788, L6a)', () => {
  it('löst bei gleichem Stand ab und lässt keinen Rest liegen', async () => {
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);

    expect(await loeseSperreAb(wurzel, DATENSATZ, fremd.stand, NUR_KONFIG)).toMatchObject({
      ok: true,
      abgeloest: true,
    });
    expect(dateienImOrdner(wurzel)).toEqual([]);
  });

  it('benennt bei abweichendem Stand gar nicht erst um (tragender Fall)', async () => {
    // Genau hier entstanden die Doppel-Halter des Laufs vom 2026-09-19: Der
    // Brecher nahm die frische Sperre des Gewinners beiseite und stellte sie
    // zurück, und in diesem Fenster belegte ein dritter den Pfad. Mit dem
    // zweiten Blick wird sie nicht mehr angefasst.
    const wurzel = bereich();
    const frisch = fremdeSperre(wurzel, DATENSATZ, { benutzer: 'clara' });
    const benenneUm = vi.fn(fsp.rename);

    const ergebnis = await loeseSperreAb(wurzel, DATENSATZ, standVon('alter Stand'), {
      ...NUR_KONFIG,
      benenneUm,
    });

    expect(ergebnis).toMatchObject({
      ok: true,
      abgeloest: false,
      grund: ABLOESE_GRUENDE.geaendert,
    });
    expect(ergebnis.verdraengt).toBeUndefined();
    expect(benenneUm).not.toHaveBeenCalled();
    // Byte für Byte an ihrem Platz.
    expect(fs.readFileSync(frisch.pfad, 'utf8')).toBe(frisch.text);
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(frisch.pfad)]);
  });

  it('meldet eine unter dem Anspruch verschwundene Sperre als verschwunden', async () => {
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);
    fs.unlinkSync(fremd.pfad);

    expect(await loeseSperreAb(wurzel, DATENSATZ, fremd.stand, NUR_KONFIG)).toMatchObject({
      ok: true,
      abgeloest: false,
      grund: ABLOESE_GRUENDE.verschwunden,
    });
  });
});

// --- L6: das Zurückstellen als Rückfall --------------------------------------------------

describe('Zurückstellen: der Rückfall für das verbliebene Fenster (4T-001788, L6)', () => {
  // Das Fenster ist seit dem Anspruch schmal geworden: Es liegt zwischen dem
  // zweiten Blick und dem Umbenennen. Die Naht `benenneUm` stellt genau diesen
  // Augenblick nach, indem sie die Sperre vor dem Umbenennen ersetzt.
  function ersetztVorDemUmbenennen(wurzel, danach) {
    return async (von, nach) => {
      fremdeSperre(wurzel, DATENSATZ, { benutzer: 'clara' });
      await fsp.rename(von, nach);
      if (danach) danach();
    };
  }

  it('stellt eine weggenommene frische Sperre an ihren Platz zurück', async () => {
    const wurzel = bereich();
    const alt = fremdeSperre(wurzel, DATENSATZ);

    const ergebnis = await loeseSperreAb(wurzel, DATENSATZ, alt.stand, {
      ...NUR_KONFIG,
      benenneUm: ersetztVorDemUmbenennen(wurzel, null),
    });

    expect(ergebnis).toMatchObject({
      ok: true,
      abgeloest: false,
      grund: ABLOESE_GRUENDE.geaendert,
    });
    expect(ergebnis.verdraengt).toBeUndefined();
    expect(inhaltVon(sperrPfad(wurzel, DATENSATZ)).benutzer).toBe('clara');
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(alt.pfad)]);
  });

  it('meldet die Verdrängung, wenn der Platz beim Zurückstellen wieder belegt ist', async () => {
    // Das bewusst hingenommene Rest-Fenster: Genau dafür steht E9.2 — die
    // Sperre ist nie allein zuständig, der Schreibvorgang prüft immer.
    const wurzel = bereich();
    const alt = fremdeSperre(wurzel, DATENSATZ);
    let dritter = null;

    const ergebnis = await loeseSperreAb(wurzel, DATENSATZ, alt.stand, {
      ...NUR_KONFIG,
      benenneUm: ersetztVorDemUmbenennen(wurzel, () => {
        dritter = fremdeSperre(wurzel, DATENSATZ, { benutzer: 'dora' });
      }),
    });

    expect(ergebnis).toMatchObject({
      ok: true,
      abgeloest: false,
      grund: ABLOESE_GRUENDE.geaendert,
      verdraengt: true,
    });
    expect(fs.readFileSync(dritter.pfad, 'utf8')).toBe(dritter.text);
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(dritter.pfad)]);
  });
});

// --- L6, L6a: das Auflisten übergeht beides ----------------------------------------------

describe('Auflisten übergeht Anspruch und beiseite gelegte Datei (4T-001788, L6, L6a)', () => {
  it('nennt nur die Sperre selbst', async () => {
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);
    fremderAnspruch(wurzel, DATENSATZ, fremd.stand);
    schreibe(`${fremd.pfad}${ABGELOEST_MARKE}abc123`, fremd.text);

    const liste = await listeSperren(wurzel, NUR_KONFIG);

    expect(liste.sperren).toHaveLength(1);
    expect(liste.sperren[0].name).toBe(path.basename(fremd.pfad));
    expect(dateienImOrdner(wurzel)).toHaveLength(3);
  });
});

// --- L6a: der Wettlauf ------------------------------------------------------------------

describe('Gleichlauf: am Ende hält genau einer (4T-001788, L6a)', () => {
  it('lässt von zwölf gleichzeitigen Ablösern genau einen den Anspruch bekommen', async () => {
    const wurzel = bereich();
    const fremd = fremdeSperre(wurzel, DATENSATZ);
    let zaehler = 0;
    const deps = { ...NUR_KONFIG, zufall: () => `z${(zaehler += 1)}` };

    const ergebnisse = await Promise.all(
      Array.from({ length: 12 }, () => loeseSperreAb(wurzel, DATENSATZ, fremd.stand, deps)),
    );

    expect(ergebnisse.filter((e) => e.ok !== true)).toEqual([]);
    expect(ergebnisse.filter((e) => e.abgeloest === true)).toHaveLength(1);
    expect(ergebnisse.filter((e) => e.grund === ABLOESE_GRUENDE.inArbeit)).toHaveLength(11);
    expect(dateienImOrdner(wurzel)).toEqual([]);
  });

  it('lässt bei sechzehn gleichzeitigen Brüchen am Ende genau eine Verwaltung halten (tragender Fall)', async () => {
    // **Der Nachweis, für den es diesen Nachtrag gibt.** Der Zweirechner-Lauf
    // vom 2026-09-19 hat mit acht Brechern je Rechner in 61 von 200 Runden zwei
    // oder drei gleichzeitige Halter erzeugt. Gemessen wird hier dasselbe
    // Muster im selben Prozess: sechzehn EIGENE Verwaltungen mit eigenen
    // Prozess-Nummern, alle lebend, alle auf dieselbe abgelaufene fremde
    // Sperre. Gegenprobe: Ohne den Anspruch fällt dieser Fall.
    const wurzel = bereich();
    const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
    const pids = Array.from({ length: 16 }, (_, i) => EIGENE_PID + i);
    const lebendig = new Set(pids);

    for (let runde = 1; runde <= 25; runde += 1) {
      fs.rmSync(ordner, { recursive: true, force: true });
      const fremd = fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: alsZeitpunkt(START_MS) });
      const brecher = pids.map((pid) => ({
        pid,
        verwaltung: verwaltungFuer(pid, lebendig, `anna${pid}`),
      }));

      await Promise.all(brecher.map((b) => b.verwaltung.brich(wurzel, DATENSATZ, fremd.stand)));

      const halter = brecher.filter((b) => b.verwaltung.gehalteneSperren().length > 0);
      expect(
        halter.map((h) => h.pid),
        `Runde ${runde}`,
      ).toHaveLength(1);
      // Und die Datei nennt genau diesen Halter, statt bloß dazusein.
      expect(inhaltVon(sperrPfad(wurzel, DATENSATZ)).pid, `Runde ${runde}`).toBe(halter[0].pid);
      expect(dateienImOrdner(wurzel), `Runde ${runde}`).toEqual([
        path.basename(sperrPfad(wurzel, DATENSATZ)),
      ]);
    }
  });
});
