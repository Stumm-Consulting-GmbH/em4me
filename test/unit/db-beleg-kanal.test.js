// 4T-001792 (Epic 3E-000255, Bauplan S1): Der Kanal `database:changeLog` — die
// Änderungsbelege eines Datensatzes auf dem Weg in die Oberfläche.
//
// **Gegenstand ist die Absperrung, nicht das Lesen.** Was in einer Beleg-Datei
// steht und wie ihre Verkettung zu deuten ist, prüfen `db-change-record` und
// `db-change-log`. Hier steht die Frage, ob der Kanal fail-closed ist: Jede der
// vier Stufen wird **einzeln** verletzt, und ein Spion auf dem Dateizugriff
// belegt, dass vor der bestandenen Prüfung nichts gelesen wird. Ohne diesen
// Spion wäre jeder Fall auch dann grün, wenn der Kanal erst liest und danach
// fragt — und genau das ist der Unterschied zwischen einer Absperrung und einem
// Hinweisschild.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Dasselbe Modul-Objekt, das `change-log.js` per require hält: Der Spion sitzt
// damit genau auf dem Weg, den der Kanal nimmt.
const fsp = require('node:fs/promises');
const { registerDatabaseIpc } = require('../../src/main/ipc/database.js');
const { schreibeBeleg } = require('../../src/main/database/change-log.js');

// Feste Uhr und feste Herkunft, damit die Belege vergleichbar sind.
function naht(takte) {
  let i = 0;
  return {
    jetzt: () => takte[Math.min(i++, takte.length - 1)],
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
  };
}

// Der echte Handler statt einer nachgebauten Prüf-Kette (Muster
// `beleg-datei-bereich.test.js`). Die Markdown-Erkennung ist dieselbe, die
// main.js als `isMarkdownPath` hereinreicht.
function registriere(bereichsWurzel) {
  const kanaele = new Map();
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), {
    areaRootForEvent: () => bereichsWurzel,
    backlinks: {
      ensureIndexForDemand: () => {},
      datenbankSicht: () => ({ status: 'unavailable', meta: null, sicht: null }),
      bufferTextFor: () => null,
    },
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    // 4T-001825: Die Schreib-Schnittstelle ist bei der Registrierung Pflicht
    // (das Modul wirft sonst laut, bevor ein Kanal entsteht). Hier genügt eine
    // Attrappe, weil allein der Beleg-Kanal geprüft wird.
    schreibSchnittstelle: {
      fuehreAuftragAus: async () => ({}),
      eroeffneNeuanlage: async () => ({}),
    },
  });
  return kanaele.get('database:changeLog');
}

let wurzel = null;
let tabelle = null;
let leser = null;

beforeEach(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beleg-kanal-'));
  tabelle = path.join(wurzel, 'Kunden.md');
  fs.writeFileSync(tabelle, '---\ndb-table:\n  fields: []\n---\n', 'utf8');
  // 4T-001964: Gelesen wird frisch, also über `open` mit Schreibrecht und nicht
  // mehr über `readFile`; der Spion sitzt deshalb auf dem Öffnen.
  leser = vi.spyOn(fsp, 'open');
});

afterEach(() => {
  if (leser) leser.mockRestore();
  leser = null;
  try {
    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
});

// --- Die vier Stufen der Absperrung, jede einzeln -----------------------------

describe('database:changeLog: fail-closed vor jedem Dateizugriff (Bauplan S1)', () => {
  it('weist eine fehlende Parameter-Form ab, ohne zu lesen', async () => {
    const kanal = registriere(wurzel);
    for (const params of [
      undefined,
      null,
      'Kunden.md',
      {},
      { filePath: tabelle },
      { recordId: 'r-00001' },
      { filePath: tabelle, recordId: '' },
      { filePath: '', recordId: 'r-00001' },
      { filePath: 42, recordId: 'r-00001' },
      { filePath: tabelle, recordId: 7 },
    ]) {
      const antwort = await kanal({}, params);
      expect(antwort.status, JSON.stringify(params)).toBe('unavailable');
    }
    expect(leser).not.toHaveBeenCalled();
  });

  it('weist ein Fenster ohne gebundenen Bereich ab, ohne zu lesen', async () => {
    const kanal = registriere(null);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });
    expect(antwort.status).toBe('unavailable');
    expect(leser).not.toHaveBeenCalled();
  });

  it('weist eine Datei außerhalb des Bereichs ab, ohne zu lesen', async () => {
    const fremd = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beleg-fremd-'));
    try {
      const fremdeTabelle = path.join(fremd, 'Kunden.md');
      fs.writeFileSync(fremdeTabelle, '# Kunden\n', 'utf8');
      const kanal = registriere(wurzel);
      const antwort = await kanal({}, { filePath: fremdeTabelle, recordId: 'r-00001' });
      expect(antwort.status).toBe('unavailable');
      expect(leser).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(fremd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  it('weist eine Datei ohne Markdown-Endung ab, ohne zu lesen', async () => {
    // Die Endung gehört zur Absperrung, weil der Pfad der Beleg-Datei aus dem
    // übergebenen gebildet wird: Ohne sie ließe sich die Bildung innerhalb des
    // Bereichs auf beliebige Nachbar-Dateien richten.
    const andere = path.join(wurzel, 'Geheim.env');
    fs.writeFileSync(andere, 'TOKEN=1\n', 'utf8');
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: andere, recordId: 'r-00001' });
    expect(antwort.status).toBe('unavailable');
    expect(leser).not.toHaveBeenCalled();
  });

  it('liest erst, wenn alle vier Stufen bestanden sind', async () => {
    // Die Gegenprobe zu den vier Fällen darüber: Ohne sie blieben alle grün,
    // auch wenn der Kanal überhaupt nie lesen würde.
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });
    expect(antwort.status).toBe('ready');
    expect(leser).toHaveBeenCalledTimes(1);
  });
});

// --- Die drei Lagen der Datei -------------------------------------------------

describe('database:changeLog: fehlende Datei, Lesefehler, Erfolg', () => {
  it('meldet die fehlende Beleg-Datei als bereit mit leerer Liste', async () => {
    // Vor dem ersten Beleg gibt es die Datei nicht; das heißt «noch keine
    // Änderung» und nicht «Fehler».
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });
    expect(antwort).toEqual({
      status: 'ready',
      belege: [],
      befunde: [],
      verkettung: { lueckenlos: true, luecken: [] },
    });
  });

  it('meldet einen echten Lesefehler als Fehler und nicht als leere Geschichte', async () => {
    // 4T-001964: `EACCES` beim Öffnen mit Schreibrecht fällt auf das gewöhnliche
    // Lesen zurück und ist damit kein Lesefehler mehr; ein echter ist `EIO`.
    leser.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'EIO' }));
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });
    expect(antwort.status).toBe('error');
    expect(antwort.belege).toEqual([]);
  });

  it('liefert die Belege in Datei-Reihenfolge samt Verkettungs-Auskunft', async () => {
    const takte = naht(['2026-09-18T10:00:00Z', '2026-09-18T10:05:00Z']);
    await schreibeBeleg(
      tabelle,
      { art: 'create', id: 'r-00001', vorgang: '1', felder: [{ name: 'Ort', neu: 'Basel' }] },
      takte,
    );
    await schreibeBeleg(
      tabelle,
      {
        art: 'update',
        id: 'r-00001',
        vorgang: '2',
        felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
      },
      takte,
    );
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });

    expect(antwort.status).toBe('ready');
    expect(antwort.belege.map((b) => b.art)).toEqual(['create', 'update']);
    expect(antwort.belege[0].felder).toEqual([{ name: 'Ort', alt: null, neu: 'Basel' }]);
    expect(antwort.belege[0].benutzer).toBe('anna');
    expect(antwort.belege[0].rechner).toBe('SC-026');
    expect(antwort.verkettung.lueckenlos).toBe(true);
  });

  it('trägt weder rohe Zellen noch einen Dateipfad noch die Vorgangs-Kennung nach außen', async () => {
    // Bauplan S1: Die Antwort trägt nur, was die Seite braucht. Der Pfad der
    // Beleg-Datei ist ein zweiter Dateipfad neben dem übergebenen, und die
    // rohen Zellen eines beschädigten Belegs sind Format-Innenleben.
    const takte = naht(['2026-09-18T10:00:00Z']);
    await schreibeBeleg(
      tabelle,
      { art: 'create', id: 'r-00001', vorgang: '1', felder: [{ name: 'Ort', neu: 'Basel' }] },
      takte,
    );
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });

    expect(Object.keys(antwort).sort()).toEqual(['befunde', 'belege', 'status', 'verkettung']);
    expect(Object.keys(antwort.belege[0]).sort()).toEqual([
      'art',
      'benutzer',
      'beschaedigt',
      'code',
      'felder',
      'rechner',
      'verdichtung',
      'zeitpunkt',
    ]);
  });

  it('nennt den Befund eines beschädigten Belegs ohne seine Position in der Datei', async () => {
    // Die Positionen der Befunde zählen in der ganzen DATEI; die Seite hat
    // dagegen nur die Belege DIESES Datensatzes. Eine Zahl, die auf eine
    // andere Liste zeigt, ist schlechter als keine.
    const takte = naht(['2026-09-18T10:00:00Z']);
    await schreibeBeleg(
      tabelle,
      { art: 'create', id: 'r-00001', vorgang: '1', felder: [{ name: 'Ort', neu: 'Basel' }] },
      takte,
    );
    const belegPfad = path.join(wurzel, 'Kunden.mddl');
    fs.appendFileSync(
      belegPfad,
      '\n|- id="r-00001" kind="update" at="2026-09-18T10:10:00Z" tx="2" n="1"\n| Ort\n',
      'utf8',
    );
    const kanal = registriere(wurzel);
    const antwort = await kanal({}, { filePath: tabelle, recordId: 'r-00001' });

    expect(antwort.befunde).toEqual([{ code: 'belegZellenUnvollstaendig' }]);
    expect(antwort.belege[1].beschaedigt).toBe(true);
    expect(antwort.belege[1].code).toBe('belegZellenUnvollstaendig');
  });
});
