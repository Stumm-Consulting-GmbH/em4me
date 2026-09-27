// 4T-001791 (Epic 3E-000255, E10.9 bis E10.11): Unit-Tests des Einstiegs der
// Verdichtung — die Sperre als Pflicht-Naht (AK8), die Größe als Auslöser und
// die Drossel der ergebnislosen Prüfung (AK1), der Weg über den gemeinsamen
// atomaren Schreibweg samt durchgespieltem Abbruch (AK7) und die fremde
// Änderung zwischen Lesen und Ersetzen (AK13).
//
// Gearbeitet wird an echten Temp-Verzeichnissen und mit echten Belegen aus dem
// Schreibweg, weil der Gegenstand der Datei-Zugriff ist; eine Attrappe des
// Dateisystems prüfte die Attrappe. Die Auswahl und der Aufbau des verdichteten
// Belegs stehen in db-change-compaction.test.js.
//
// **Die tragende Zusage ist hier nicht, dass am Ende weniger Belege dastehen,
// sondern dass ohne Sperre nichts geschieht und ein Abbruch die Datei
// unverändert lässt.** Deshalb zählen die Fälle, welche Funktionen des
// Dateisystems überhaupt gerufen wurden, und vergleichen im Abbruch-Fall die
// Bytes.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOG_CODES,
  VERDICHTUNG_GRUENDE,
  DROSSEL_ZUWACHS,
  _drosselLeeren,
  belegPfadFuer,
  leseBelegDatei,
  schreibeBeleg,
  verdichteBeiBedarf,
} from '../../src/main/database/change-log.js';
import { belegeZuDatensatz, pruefeVerkettung } from '../../src/shared/database/change-record.js';
import { VORGABE_MAX_BYTES } from '../../src/shared/database/change-compaction.js';
import { SCHATTEN_MUSTER, ersetzeDatei } from '../../src/main/documents/atomic-write.js';
// 4T-001788 (Epic 3E-000255, AK12): die ECHTE Sperr-Verwaltung, nicht ihre
// Attrappe. Die Prüf-Zeile ist am 2026-09-18 aus 4T-001791 hierher übergeben
// worden; bis dahin blieb offen, ob die Verdichtung wirklich unter einer Sperre
// läuft oder nur unter einer Funktion, die so heißt.
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { ART_CHANGE_LOG, sperrDateiName } from '../../src/main/database/lock-store.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesung im Modulkopf, nicht im Prüffall (test/README).
const QUELLE = fs.readFileSync(path.join(ROOT, 'src', 'main', 'database', 'change-log.js'), 'utf8');

const HERKUNFT = () => ({ benutzer: 'anna', rechner: 'SC-026' });

// Die Sperre als Naht: Sie führt die Arbeit aus und hält fest, dass sie es tat.
// Die Bindung an die ECHTE Sperre in der festen Sperr-Ordnung ist als Prüf-Zeile
// an 4T-001788 übergeben (Bauplan V1).
function naht() {
  const gesehen = [];
  return {
    gesehen,
    mitSperre: async (gegenstand, arbeit) => {
      gesehen.push(gegenstand);
      return arbeit();
    },
  };
}

let tmpDirs = [];

beforeEach(() => {
  _drosselLeeren();
});

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

function tabelle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-verdichtung-'));
  tmpDirs.push(dir);
  const pfad = path.join(dir, 'Personen.md');
  fs.writeFileSync(pfad, '---\ndb-table:\n  fields: []\n---\n', 'utf8');
  return pfad;
}

function zeitpunkt(n) {
  const minute = String(Math.floor(n / 60)).padStart(2, '0');
  const sekunde = String(n % 60).padStart(2, '0');
  return `2026-09-18T12:${minute}:${sekunde}Z`;
}

// Baut die Beleg-Datei über den echten Anfüge-Weg: `anzahl` Belege eines
// Datensatzes, lückenlos verkettet.
async function baueBelege(pfad, id, anzahl) {
  for (let i = 0; i < anzahl; i++)
    await schreibeBeleg(
      pfad,
      {
        art: i === 0 ? 'create' : 'update',
        id,
        vorgang: String(i + 1),
        felder: [{ name: 'Ort', alt: i === 0 ? null : `w${i - 1}`, neu: `w${i}` }],
      },
      { jetzt: () => zeitpunkt(i), herkunft: HERKUNFT },
    );
}

// Ein Dateisystem, dessen Zugriffe gezählt werden; die echten Funktionen
// laufen dabei durch.
function beobachtet(abweichung = {}) {
  const sicht = {
    stat: fsp.stat,
    readFile: fsp.readFile,
    writeFile: fsp.writeFile,
    appendFile: fsp.appendFile,
    open: fsp.open,
    ...abweichung,
  };
  return {
    fsp: sicht,
    stattgeben: vi.spyOn(sicht, 'stat'),
    lesen: vi.spyOn(sicht, 'readFile'),
    schreiben: vi.spyOn(sicht, 'writeFile'),
    anfuegen: vi.spyOn(sicht, 'appendFile'),
    oeffnen: vi.spyOn(sicht, 'open'),
  };
}

const KLEINE_GRENZEN = { grenzen: { maxBytes: 200, maxPerRecord: 4 } };

describe('Verdichtung: die Sperre als Pflicht-Naht (4T-001791, AK8)', () => {
  it('verweigert ohne Naht und greift dabei auf nichts zu (tragender Fall)', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    const vorher = fs.readFileSync(belegPfadFuer(pfad));
    const sicht = beobachtet();

    for (const deps of [undefined, {}, { mitSperre: 'ja' }]) {
      const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, { ...deps, fsp: sicht.fsp });
      expect(erg.ok).toBe(false);
      expect(erg.code).toBe(LOG_CODES.ohneSperre);
      expect(erg.error).toMatch(/mitSperre/);
    }
    // Nicht einmal die Größe wird erfragt: Ein Umschreiben ohne Sperre ist
    // damit nicht möglich, und zwar bevor die Datei überhaupt berührt wird.
    for (const spion of [sicht.stattgeben, sicht.lesen, sicht.schreiben, sicht.oeffnen])
      expect(spion).not.toHaveBeenCalled();
    expect(fs.readFileSync(belegPfadFuer(pfad)).equals(vorher)).toBe(true);
  });

  it('führt Lesen und Ersetzen innerhalb der Naht aus', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    const innen = [];
    let drin = false;
    const sicht = beobachtet({
      readFile: async (...args) => {
        innen.push(drin);
        return fsp.readFile(...args);
      },
    });

    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      fsp: sicht.fsp,
      mitSperre: async (gegenstand, arbeit) => {
        expect(gegenstand).toBe(belegPfadFuer(pfad));
        drin = true;
        try {
          return await arbeit();
        } finally {
          drin = false;
        }
      },
      ersetzen: async (...args) => {
        innen.push(drin);
        return ersetzeDatei(...args);
      },
    });

    expect(erg).toMatchObject({ ok: true, verdichtet: true });
    expect(innen).toEqual([true, true]);
  });

  it('meldet einen Fehlschlag der Naht mit eigenem Code', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      mitSperre: async () => {
        throw new Error('Sperre nicht zu bekommen');
      },
    });
    expect(erg).toEqual({
      ok: false,
      code: LOG_CODES.sperre,
      error: 'Sperre nicht zu bekommen',
    });
  });
});

describe('Verdichtung: die Größe als Auslöser (4T-001791, AK1)', () => {
  it('liest die Datei unter der Größen-Schwelle nicht (tragender Fall)', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    const sicht = beobachtet();

    const erg = await verdichteBeiBedarf(pfad, {}, { ...naht(), fsp: sicht.fsp });
    expect(erg).toMatchObject({
      ok: true,
      verdichtet: false,
      grund: VERDICHTUNG_GRUENDE.unterGroesse,
    });
    // Allein die Größe wurde erfragt; gelesen und geschrieben wurde nichts.
    expect(sicht.stattgeben).toHaveBeenCalledTimes(1);
    expect(sicht.stattgeben.mock.calls[0][0]).toBe(belegPfadFuer(pfad));
    for (const spion of [sicht.lesen, sicht.schreiben, sicht.oeffnen])
      expect(spion).not.toHaveBeenCalled();
  });

  it('verdichtet über der Größe die Datensätze über der Zahl und lässt die Nachbarn stehen', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    await baueBelege(pfad, 'r-00099', 3);
    const vorher = await leseBelegDatei(pfad);

    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, naht());
    expect(erg.ok).toBe(true);
    expect(erg.verdichtet).toBe(true);
    expect(erg.auskunft).toEqual({
      datensaetze: [{ id: 'r-00042', spannen: 1, ersetzt: 8 }],
      spannen: 1,
      ersetzt: 8,
    });

    const nachher = await leseBelegDatei(pfad);
    expect(nachher.befunde).toEqual([]);
    expect(belegeZuDatensatz(nachher.belege, 'r-00042')).toHaveLength(3);
    expect(belegeZuDatensatz(nachher.belege, 'r-00099')).toHaveLength(3);
    expect(pruefeVerkettung(belegeZuDatensatz(nachher.belege, 'r-00042'))).toEqual({
      lueckenlos: true,
      luecken: [],
    });
    // Der Nachbar-Datensatz ist Zeichen für Zeichen derselbe.
    const felder = (gelesen, id) =>
      belegeZuDatensatz(gelesen.belege, id).map((b) => [b.art, b.vorgang, b.felder]);
    expect(felder(nachher, 'r-00099')).toEqual(felder(vorher, 'r-00099'));
  });

  it('tut über der Größe nichts, wenn kein Datensatz über der Zahl liegt', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 4);
    const vorher = fs.readFileSync(belegPfadFuer(pfad));

    const erg = await verdichteBeiBedarf(pfad, { grenzen: { maxBytes: 100 } }, naht());
    expect(erg).toMatchObject({
      ok: true,
      verdichtet: false,
      grund: VERDICHTUNG_GRUENDE.nichtsZuTun,
    });
    expect(fs.readFileSync(belegPfadFuer(pfad)).equals(vorher)).toBe(true);
  });

  it('prüft nach einer ergebnislosen Prüfung erst nach 64 KB Zuwachs erneut', async () => {
    const pfad = tabelle();
    const belegPfad = belegPfadFuer(pfad);
    await baueBelege(pfad, 'r-00042', 4);
    const optionen = { grenzen: { maxBytes: 100, maxPerRecord: 4 } };

    const erste = await verdichteBeiBedarf(pfad, optionen, naht());
    expect(erste.grund).toBe(VERDICHTUNG_GRUENDE.nichtsZuTun);

    const sicht = beobachtet();
    const zweite = await verdichteBeiBedarf(pfad, optionen, { ...naht(), fsp: sicht.fsp });
    expect(zweite.grund).toBe(VERDICHTUNG_GRUENDE.gedrosselt);
    expect(sicht.lesen).not.toHaveBeenCalled();

    // Nach dem Zuwachs wird wieder geprüft. Angefügt wird echter Beleg-Text,
    // damit die Datei lesbar bleibt; aufgefüllt wird mit Belegen eines fremden
    // Datensatzes, bis die Schwelle des Zuwachses überschritten ist.
    let i = 0;
    const ziel = fs.statSync(belegPfad).size + DROSSEL_ZUWACHS;
    while (fs.statSync(belegPfad).size <= ziel) {
      await baueBelege(pfad, `r-${String(1000 + i).padStart(5, '0')}`, 1);
      i += 1;
    }

    const dritte = beobachtet();
    const spaeter = await verdichteBeiBedarf(pfad, optionen, { ...naht(), fsp: dritte.fsp });
    expect(spaeter.grund).toBe(VERDICHTUNG_GRUENDE.nichtsZuTun);
    expect(dritte.lesen).toHaveBeenCalledTimes(1);
  });

  it('nimmt eine fehlende Beleg-Datei als «nichts zu tun»', async () => {
    const erg = await verdichteBeiBedarf(tabelle(), KLEINE_GRENZEN, naht());
    expect(erg).toMatchObject({
      ok: true,
      verdichtet: false,
      grund: VERDICHTUNG_GRUENDE.keineDatei,
    });
  });

  it('weist einen fehlenden Pfad der Tabellen-Datei ab', async () => {
    expect((await verdichteBeiBedarf('', KLEINE_GRENZEN, naht())).code).toBe(LOG_CODES.pfad);
  });
});

describe('Verdichtung: der atomare Schreibweg (4T-001791, AK7)', () => {
  it('ersetzt über ersetzeDatei mit Konflikt-Prüfung gegen den gelesenen Stand', async () => {
    const pfad = tabelle();
    const belegPfad = belegPfadFuer(pfad);
    await baueBelege(pfad, 'r-00042', 10);
    const gelesen = fs.readFileSync(belegPfad, 'utf8');

    const spion = vi.fn((...args) => ersetzeDatei(...args));
    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, { ...naht(), ersetzen: spion });

    expect(erg.verdichtet).toBe(true);
    expect(spion).toHaveBeenCalledTimes(1);
    const [ziel, inhalt, opts] = spion.mock.calls[0];
    expect(ziel).toBe(belegPfad);
    expect(opts.expected).toBe(gelesen);
    expect(inhalt).toContain('kind="merged"');
    expect(fs.readFileSync(belegPfad, 'utf8')).toBe(inhalt);
    // Keine Schattenkopie bleibt zurück: Umbenannt wurde im selben Verzeichnis.
    expect(fs.readdirSync(path.dirname(belegPfad)).filter((n) => SCHATTEN_MUSTER.test(n))).toEqual(
      [],
    );
  });

  it('nimmt im Regelfall den gemeinsamen atomaren Schreibweg', () => {
    expect(QUELLE).toMatch(/require\('\.\.\/documents\/atomic-write\.js'\)/);
    expect(QUELLE).toMatch(/ersetzen\(pfad, text, \{ expected: inhalt \}\)/);
    // Und er ist die Vorgabe, nicht bloß eine Möglichkeit: Ohne eigene Naht
    // läuft der echte Weg, und die Datei ist danach ersetzt.
    expect(QUELLE).toMatch(/typeof d\.ersetzen === 'function' \? d\.ersetzen : ersetzeDatei/);
  });

  it('lässt die Datei bei einem Abbruch byte-gleich (tragender Fall)', async () => {
    const pfad = tabelle();
    const belegPfad = belegPfadFuer(pfad);
    await baueBelege(pfad, 'r-00042', 10);
    const vorher = fs.readFileSync(belegPfad);

    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      ...naht(),
      ersetzen: async () => ({ ok: false, code: 'EPERM', error: 'kein Zugriff' }),
    });
    expect(erg).toEqual({
      ok: false,
      code: LOG_CODES.ersetzen,
      error: 'kein Zugriff',
    });
    // Ganz oder gar nicht: kein Zwischenstand, keine Schattenkopie.
    expect(fs.readFileSync(belegPfad).equals(vorher)).toBe(true);
    expect(fs.readdirSync(path.dirname(belegPfad)).filter((n) => SCHATTEN_MUSTER.test(n))).toEqual(
      [],
    );
  });
});

describe('Verdichtung: fremde Änderung zwischen Lesen und Ersetzen (4T-001791, AK13)', () => {
  it('ersetzt nicht und lässt den fremden Inhalt unversehrt (tragender Fall)', async () => {
    const pfad = tabelle();
    const belegPfad = belegPfadFuer(pfad);
    await baueBelege(pfad, 'r-00042', 10);
    const fremd =
      '\n|- id="r-00500" kind="create" at="2026-09-18T13:00:00Z" tx="99" n="1" noOld="1"\n| Ort\n|\n| Zug\n| bert\n| SC-027\n';

    // Die fremde Änderung fällt genau in das Fenster zwischen Lesen und
    // Ersetzen: ein zweiter Schreiber, der seinen Beleg anfügt.
    const sicht = beobachtet({
      readFile: async (...args) => {
        const inhalt = await fsp.readFile(...args);
        fs.appendFileSync(belegPfad, fremd, 'utf8');
        return inhalt;
      },
    });

    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, { ...naht(), fsp: sicht.fsp });
    expect(erg).toMatchObject({
      ok: true,
      verdichtet: false,
      grund: VERDICHTUNG_GRUENDE.konflikt,
    });

    const nachher = fs.readFileSync(belegPfad, 'utf8');
    expect(nachher.endsWith(fremd)).toBe(true);
    expect(nachher).not.toContain('kind="merged"');
    const gelesen = await leseBelegDatei(pfad);
    expect(gelesen.befunde).toEqual([]);
    expect(belegeZuDatensatz(gelesen.belege, 'r-00042')).toHaveLength(10);
    expect(belegeZuDatensatz(gelesen.belege, 'r-00500')).toHaveLength(1);
  });

  it('meldet einen Lesefehler statt blind zu schreiben', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    const sicht = beobachtet({
      readFile: async () => {
        throw Object.assign(new Error('kein Zugriff'), { code: 'EACCES' });
      },
    });
    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, { ...naht(), fsp: sicht.fsp });
    expect(erg).toEqual({ ok: false, code: LOG_CODES.lesen, error: 'kein Zugriff' });
  });
});

describe('Verdichtung: Wächter über Löschen, Auslagern und Takt (4T-001791, AK6, AK9)', () => {
  // Der Einstieg ist die zweite Hälfte des Verdichtungs-Codes; die erste, die
  // reine Funktion, trägt denselben Wächter in db-change-compaction.test.js.
  // `atomic-write.js` ist ausgenommen, denn dort gehören Schattenkopie,
  // Aufräumen und Wiederhol-Fenster hin.
  //
  // Gemessen wird der CODE und nicht die Prosa darüber: Der Kopf-Kommentar
  // nennt gerade das, was nicht entstehen soll, und ein Wächter, der darüber
  // stolperte, verböte die Begründung statt der Sache.
  const CODE = QUELLE.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
    .join('\n');

  it('löscht keinen Beleg und lagert keinen in eine Archiv-Datei aus (AK6)', () => {
    for (const muster of [/unlink/, /\brmSync\b/, /\brmdir/, /fs\.rm\b/, /archiv/i, /archive/i])
      expect(muster.test(CODE), String(muster)).toBe(false);
  });

  it('führt keinen Takt im Hintergrund (AK9)', () => {
    for (const muster of [/setInterval/, /setTimeout/, /setImmediate/])
      expect(muster.test(CODE), String(muster)).toBe(false);
  });
});

// --- 4T-001788, AK12: die ECHTE Sperre der Beleg-Datei ---------------------------------

describe('Verdichtung unter der echten Sperre der Beleg-Datei (4T-001788, AK12)', () => {
  // Der Bereich ist hier der Ordner der Tabelle: Der Sperr-Ordner entsteht in
  // der Bereichs-Wurzel, und genau dort wird er nachgesehen.
  // Feste Uhr, damit die Frist einer fremden Sperre nicht davon abhängt, an
  // welchem Tag der Lauf stattfindet.
  const JETZT_MS = Date.parse('2026-09-18T13:00:00Z');

  function verwaltungFuer() {
    const pfad = tabelle();
    const wurzel = path.dirname(pfad);
    const verwaltung = erzeugeSperrVerwaltung({
      leseKonfig: async () => undefined,
      uhr: () => JETZT_MS,
    });
    const sperrDatei = path.join(
      wurzel,
      DEFAULT_LOCK_FOLDER_NAME,
      sperrDateiName(wurzel, { art: ART_CHANGE_LOG, tabelle: pfad }).name,
    );
    return { pfad, wurzel, verwaltung, sperrDatei };
  }

  it('hält die Sperre WÄHREND des Ersetzens und gibt sie danach frei (tragender Fall)', async () => {
    const { pfad, wurzel, verwaltung, sperrDatei } = verwaltungFuer();
    await baueBelege(pfad, 'r-00042', 10);
    // Die Sperr-Datei trägt die Marke der Beleg-Datei und nicht die der
    // Definition: Wer die Definition bearbeitet, hielte sonst jede Verdichtung
    // an, und umgekehrt.
    expect(path.basename(sperrDatei).startsWith('l+')).toBe(true);

    let beimErsetzen = null;
    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      mitSperre: verwaltung.belegSperreFuer(wurzel, pfad),
      ersetzen: async (...args) => {
        beimErsetzen = fs.existsSync(sperrDatei);
        return ersetzeDatei(...args);
      },
    });

    expect(erg).toMatchObject({ ok: true, verdichtet: true });
    expect(beimErsetzen).toBe(true);
    // Danach ist sie fort, und niemand hält mehr etwas.
    expect(fs.existsSync(sperrDatei)).toBe(false);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('verdichtet nicht und schreibt nichts, wenn ein anderer die Beleg-Datei hält', async () => {
    const { pfad, wurzel, verwaltung, sperrDatei } = verwaltungFuer();
    await baueBelege(pfad, 'r-00042', 10);
    const vorher = fs.readFileSync(belegPfadFuer(pfad));

    // Eine fremde Sperre, von Hand geschrieben: Eine über die Verwaltung
    // genommene stünde in deren Eigen-Register und wäre gerade nicht fremd.
    fs.mkdirSync(path.dirname(sperrDatei), { recursive: true });
    const fremd = `${JSON.stringify(
      {
        schemaVersion: 1,
        art: ART_CHANGE_LOG,
        tabelle: path.basename(pfad),
        benutzer: 'bert',
        rechner: 'SC-027',
        zeitpunkt: '2026-09-18T12:00:00Z',
        pid: 9999,
      },
      null,
      2,
    )}\n`;
    fs.writeFileSync(sperrDatei, fremd, 'utf8');

    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      mitSperre: verwaltung.belegSperreFuer(wurzel, pfad),
    });

    expect(erg).toMatchObject({
      ok: true,
      verdichtet: false,
      grund: VERDICHTUNG_GRUENDE.gesperrt,
      abgelaufen: false,
    });
    // Nichts geschrieben, und die fremde Sperre steht unberührt: Sie wird auch
    // hier nie selbsttätig gebrochen.
    expect(fs.readFileSync(belegPfadFuer(pfad)).equals(vorher)).toBe(true);
    expect(fs.readFileSync(sperrDatei, 'utf8')).toBe(fremd);
  });

  it('nennt eine abgelaufene fremde Sperre als solche, ohne sie zu brechen', async () => {
    // Die Regel «nie selbsttätig» bleibt ohne Ausnahme, auch wo kein Mensch
    // arbeitet. Das Ergebnis nennt `abgelaufen`, damit die Schreib-Schnittstelle
    // es sichtbar machen kann.
    const { pfad, wurzel, sperrDatei } = verwaltungFuer();
    await baueBelege(pfad, 'r-00042', 10);
    const jetztMs = Date.parse('2026-09-19T08:00:00Z');
    const verwaltung = erzeugeSperrVerwaltung({
      leseKonfig: async () => undefined,
      uhr: () => jetztMs,
    });
    fs.mkdirSync(path.dirname(sperrDatei), { recursive: true });
    fs.writeFileSync(
      sperrDatei,
      `${JSON.stringify({ schemaVersion: 1, rechner: 'SC-027', pid: 9999, zeitpunkt: '2026-09-18T12:00:00Z' })}\n`,
      'utf8',
    );

    const erg = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      mitSperre: verwaltung.belegSperreFuer(wurzel, pfad),
    });

    expect(erg).toMatchObject({ grund: VERDICHTUNG_GRUENDE.gesperrt, abgelaufen: true });
    expect(fs.existsSync(sperrDatei)).toBe(true);
  });

  it('setzt die Drossel nicht, wenn die Sperre nicht zu bekommen war', async () => {
    // Gemessen hat die Verdichtung nichts; ein Drossel-Eintrag verschöbe die
    // nächste echte Prüfung ohne Grund um 64 KB.
    const { pfad, wurzel, verwaltung, sperrDatei } = verwaltungFuer();
    await baueBelege(pfad, 'r-00042', 10);
    fs.mkdirSync(path.dirname(sperrDatei), { recursive: true });
    fs.writeFileSync(sperrDatei, '{ abgerissen', 'utf8');

    const gesperrt = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      mitSperre: verwaltung.belegSperreFuer(wurzel, pfad),
    });
    expect(gesperrt.grund).toBe(VERDICHTUNG_GRUENDE.gesperrt);

    // Sperre fort, gleiche Datei, gleiche Grenzen: Jetzt wird verdichtet und
    // nicht «gedrosselt» gemeldet.
    fs.unlinkSync(sperrDatei);
    const zweite = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, {
      mitSperre: verwaltung.belegSperreFuer(wurzel, pfad),
    });
    expect(zweite).toMatchObject({ ok: true, verdichtet: true });
  });
});

describe('Verdichtung: die Vorgabe greift ohne Übersteuerung (4T-001791, AK4)', () => {
  it('misst gegen 0,7 MB, solange die Definition nichts anderes sagt', async () => {
    const pfad = tabelle();
    await baueBelege(pfad, 'r-00042', 10);
    const groesse = fs.statSync(belegPfadFuer(pfad)).size;
    expect(groesse).toBeLessThan(VORGABE_MAX_BYTES);

    const ohne = await verdichteBeiBedarf(pfad, undefined, naht());
    expect(ohne.grund).toBe(VERDICHTUNG_GRUENDE.unterGroesse);
    // Dieselbe Datei, dieselben Belege, nur eine übersteuerte Größen-Schwelle:
    // jetzt geschieht etwas.
    const mit = await verdichteBeiBedarf(pfad, KLEINE_GRENZEN, naht());
    expect(mit.verdichtet).toBe(true);
  });
});
