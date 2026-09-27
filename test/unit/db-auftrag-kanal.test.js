// 4T-001825 (Epic 3E-000254, Bauplan B1 bis B5): Kanal und Brücke der
// Schreib-Schnittstelle — `database:auftrag` und `database:neuanlage`.
//
// **Gegenstand ist die Absperrung und die Weitergabe, nicht das Schreiben.** Was
// ein Auftrag in den Dateien bewirkt, prüfen `db-record-auftrag*.test.js`. Hier
// stehen drei Fragen: Ist der Kanal fail-closed (jede der vier Stufen einzeln
// verletzt, und eine Attrappe der Schnittstelle als Spion belegt, dass sie
// dann nicht gerufen wird)? Kommt ein gültiger Auftrag unverändert und mit der
// Bereichs-Wurzel des sendenden Fensters an, und geht das Ergebnis unverändert
// zurück? Trägt der Struktur-Klon des IPC ein echtes Ergebnis?
//
// Dazu kommen der Wächter über die Texte der Lagen (je Code ein Schlüssel in
// allen fünf Sprachfassungen, kein Schlüssel ohne Code) und der Struktur-Fall
// über die zwei Dateien, die dieser Vorgang nicht berühren darf.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
// 4T-001926 (Epic 3E-000256, B6): Die Regel-Lagen tragen ihre Texte unter
// demselben Präfix; der Wächter unten hält beide Kataloge.
import { REGEL_LAGEN } from '../../src/main/database/record-regeln.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const FRAGMENTE = SPRACHEN.map((code) => ({
  code,
  werte: JSON.parse(quelltext(`src/i18n/fragments/${code}/database.json`)),
}));

// Bauplan B5: die beiden Dateien, die der parallel laufende Einstellungs-Zug
// ändert und die dieser Vorgang deshalb nicht berührt.
const UNBERUEHRT = ['src/main/preload.js', 'src/renderer/modules/app-init.js'].map((rel) => ({
  rel,
  text: quelltext(rel),
}));

// --- Aufbau ------------------------------------------------------------------------------

const PRAEFIX = 'database.auftrag.';
const WURZEL = path.join(os.tmpdir(), 'em4me-auftrag-kanal-bereich');
const FREMD = path.join(os.tmpdir(), 'em4me-auftrag-kanal-fremd');

// Dieselbe Markdown-Erkennung, die main.js als `isMarkdownPath` hereinreicht
// (Muster `db-beleg-kanal.test.js`).
const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

// Eine Attrappe der Schnittstelle, deren beide Einstiege Spione sind.
function attrappe(antwort = { ok: true }) {
  return {
    fuehreAuftragAus: vi.fn(async () => antwort),
    eroeffneNeuanlage: vi.fn(async () => antwort),
  };
}

// Der echte Handler über die echte Registrier-Funktion. Die Bereichs-Wurzel
// kommt aus dem Ereignis, damit ein Fall zeigen kann, dass es die des
// SENDENDEN Fensters ist und keine festgehaltene.
function registriere(schreibSchnittstelle) {
  const kanaele = new Map();
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: () => {},
      datenbankSicht: () => ({ status: 'unavailable', meta: null, sicht: null }),
      bufferTextFor: () => null,
    },
    isMarkdownPath,
    schreibSchnittstelle,
  });
  return kanaele;
}

// 4T-001928 (Epic 3E-000256): Der Auftrags-Kanal stößt den Index mit dem Schlüssel
// des sendenden Fensters an, wie `lage()`; das Ereignis trägt deshalb einen Sender.
const IM_BEREICH = { wurzel: WURZEL, sender: { id: 1 } };
const OHNE_BEREICH = {};

function auftragMit(...tabellen) {
  return { anweisungen: tabellen.map((tabelle) => ({ tabelle, art: 'create', werte: {} })) };
}

// Die Gestalt der Abweisung ohne Zugriff, abgelesen am Vorbild-Kanal statt
// nachgeschrieben: Beide Kanäle antworten mit DERSELBEN Funktion.
async function gestaltOhneZugriff() {
  const kanaele = registriere(attrappe());
  return kanaele.get('database:changeLog')(OHNE_BEREICH, undefined);
}

// --- AK1, AK3: Registrierung und Brücke ----------------------------------------------

describe('database:auftrag und database:neuanlage: Registrierung und Brücke (4T-001825, AK1, AK3)', () => {
  it('registriert beide Kanäle neben den drei bestehenden', () => {
    const kanaele = registriere(attrappe());
    expect([...kanaele.keys()].sort()).toEqual([
      'database:auftrag',
      'database:changeLog',
      // 4T-001942 (Epic 3E-000257): die Wertehilfe der Verweis-Felder.
      'database:datensaetze',
      // 4T-001938 (Epic 3E-000257): der lesende Kanal der Einzel-Maske.
      'database:datensatz',
      // 4T-001944 (Epic 3E-000257): die Konsistenz-Prüfung über den Bestand.
      'database:konsistenz',
      // 4T-001943 (Epic 3E-000257): die Masken-Datei herausschreiben.
      'database:maskeSchreiben',
      'database:neuanlage',
      'database:overview',
      // 4T-001941 (Epic 3E-000257): die Sperre der Einzel-Maske.
      'database:sperre',
      'database:table',
      // 4T-001945 (Epic 3E-000257): der Verwendungsnachweis.
      'database:verwendung',
    ]);
  });

  it('bindet beide Brücken-Einträge an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (kanal) => ({ kanal }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const auftragsParameter = { auftrag: auftragMit('Kunden.md') };
    const neuanlageParameter = { tabelle: 'Kunden.md' };

    expect(await bruecke.databaseAuftrag(auftragsParameter)).toEqual({
      kanal: 'database:auftrag',
    });
    expect(await bruecke.databaseNeuanlage(neuanlageParameter)).toEqual({
      kanal: 'database:neuanlage',
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][0]).toBe('database:auftrag');
    expect(invoke.mock.calls[0][1]).toBe(auftragsParameter);
    expect(invoke.mock.calls[1][0]).toBe('database:neuanlage');
    expect(invoke.mock.calls[1][1]).toBe(neuanlageParameter);
  });

  it('verweigert die Registrierung laut, wenn die Schnittstelle fehlt oder unvollständig ist', () => {
    for (const schreibSchnittstelle of [
      undefined,
      null,
      {},
      { fuehreAuftragAus: () => {} },
      { eroeffneNeuanlage: () => {} },
    ]) {
      const handle = vi.fn();
      expect(() =>
        registerDatabaseIpc(handle, {
          areaRootForEvent: () => WURZEL,
          backlinks: {},
          isMarkdownPath,
          schreibSchnittstelle,
        }),
      ).toThrow(TypeError);
      // Kein Kanal bleibt halb registriert zurück.
      expect(handle).not.toHaveBeenCalled();
    }
  });
});

// --- AK2: die vier Stufen der Absperrung, jede einzeln --------------------------------

describe('database:auftrag: fail-closed vor jedem Aufruf der Schnittstelle (4T-001825, AK2, B2)', () => {
  async function pruefeAbweisung(event, liste) {
    const referenz = await gestaltOhneZugriff();
    const schnittstelle = attrappe();
    const kanal = registriere(schnittstelle).get('database:auftrag');
    for (const params of liste) {
      const antwort = await kanal(event, params);
      expect(antwort, JSON.stringify(params)).toEqual(referenz);
    }
    expect(schnittstelle.fuehreAuftragAus).not.toHaveBeenCalled();
    expect(schnittstelle.eroeffneNeuanlage).not.toHaveBeenCalled();
  }

  it('Stufe 1: weist eine unbrauchbare Form ab', async () => {
    await pruefeAbweisung(IM_BEREICH, [
      undefined,
      null,
      'Kunden.md',
      [],
      {},
      { auftrag: null },
      { auftrag: [] },
      { auftrag: 'Kunden.md' },
      { auftrag: {} },
      { auftrag: { anweisungen: 'Kunden.md' } },
      { auftrag: { anweisungen: {} } },
      // Leere Anweisungs-Liste.
      { auftrag: { anweisungen: [] } },
      { auftrag: { anweisungen: [null] } },
      { auftrag: { anweisungen: ['Kunden.md'] } },
      { auftrag: { anweisungen: [['Kunden.md']] } },
      // Anweisung ohne Tabellen-Angabe, mit leerer und mit einer Zahl.
      { auftrag: { anweisungen: [{ art: 'create', werte: {} }] } },
      { auftrag: { anweisungen: [{ tabelle: '', art: 'create' }] } },
      { auftrag: { anweisungen: [{ tabelle: 42, art: 'create' }] } },
      // Eine brauchbare und eine unbrauchbare Anweisung: Der Auftrag wirkt als
      // Ganzes, also weist schon eine einzige ihn ab.
      { auftrag: { anweisungen: [{ tabelle: 'Kunden.md', art: 'create' }, { art: 'create' }] } },
    ]);
  });

  it('Stufe 2: weist ein Fenster ohne gebundenen Bereich ab', async () => {
    await pruefeAbweisung(OHNE_BEREICH, [{ auftrag: auftragMit('Kunden.md') }]);
  });

  it('Stufe 3: weist eine Tabelle außerhalb des Bereichs ab, relativ wie absolut', async () => {
    await pruefeAbweisung(IM_BEREICH, [
      { auftrag: auftragMit('../fremd.md') },
      { auftrag: auftragMit('Unter/../../fremd.md') },
      { auftrag: auftragMit(path.join(FREMD, 'Kunden.md')) },
      // Ein Präfix-Nachbar des Bereichs ist nicht der Bereich.
      { auftrag: auftragMit(`${WURZEL}2${path.sep}Kunden.md`) },
      // Die zweite Tabelle eines sonst gültigen Auftrags genügt.
      { auftrag: auftragMit('Kunden.md', '../fremd.md') },
    ]);
  });

  it('Stufe 4: weist eine Tabelle ohne Markdown-Endung ab', async () => {
    await pruefeAbweisung(IM_BEREICH, [
      { auftrag: auftragMit('Kunden.txt') },
      { auftrag: auftragMit('Geheim.env') },
      { auftrag: auftragMit('Kunden.mddl') },
      // Die Bereichs-Wurzel selbst liegt «innerhalb», ist aber keine Tabelle.
      { auftrag: auftragMit('.') },
      { auftrag: auftragMit('Kunden.md', 'Kunden.md.bak') },
    ]);
  });

  it('ruft die Schnittstelle erst, wenn alle vier Stufen bestanden sind', async () => {
    // Die Gegenprobe zu den vier Fällen darüber: Ohne sie blieben alle grün,
    // auch wenn der Kanal die Schnittstelle überhaupt nie riefe.
    const schnittstelle = attrappe();
    const kanal = registriere(schnittstelle).get('database:auftrag');
    await kanal(IM_BEREICH, { auftrag: auftragMit('Kunden.md', 'Unter/../Orte.md') });
    expect(schnittstelle.fuehreAuftragAus).toHaveBeenCalledTimes(1);
  });
});

describe('database:neuanlage: fail-closed vor jedem Aufruf der Schnittstelle (4T-001825, AK2, B2)', () => {
  async function pruefeAbweisung(event, liste) {
    const referenz = await gestaltOhneZugriff();
    const schnittstelle = attrappe();
    const kanal = registriere(schnittstelle).get('database:neuanlage');
    for (const params of liste) {
      const antwort = await kanal(event, params);
      expect(antwort, JSON.stringify(params)).toEqual(referenz);
    }
    expect(schnittstelle.eroeffneNeuanlage).not.toHaveBeenCalled();
    expect(schnittstelle.fuehreAuftragAus).not.toHaveBeenCalled();
  }

  it('Stufe 1: weist eine unbrauchbare Form ab', async () => {
    await pruefeAbweisung(IM_BEREICH, [
      undefined,
      null,
      'Kunden.md',
      [],
      {},
      { tabelle: '' },
      { tabelle: 42 },
      { tabelle: ['Kunden.md'] },
      { tabelle: null },
    ]);
  });

  it('Stufe 2: weist ein Fenster ohne gebundenen Bereich ab', async () => {
    await pruefeAbweisung(OHNE_BEREICH, [{ tabelle: 'Kunden.md' }]);
  });

  it('Stufe 3: weist eine Tabelle außerhalb des Bereichs ab, relativ wie absolut', async () => {
    await pruefeAbweisung(IM_BEREICH, [
      { tabelle: '../fremd.md' },
      { tabelle: path.join(FREMD, 'Kunden.md') },
      { tabelle: `${WURZEL}2${path.sep}Kunden.md` },
    ]);
  });

  it('Stufe 4: weist eine Tabelle ohne Markdown-Endung ab', async () => {
    await pruefeAbweisung(IM_BEREICH, [
      { tabelle: 'Kunden.txt' },
      { tabelle: 'Geheim.env' },
      { tabelle: '.' },
    ]);
  });

  it('ruft die Schnittstelle erst, wenn alle vier Stufen bestanden sind', async () => {
    const schnittstelle = attrappe();
    const kanal = registriere(schnittstelle).get('database:neuanlage');
    await kanal(IM_BEREICH, { tabelle: 'Unter/Kunden.md' });
    expect(schnittstelle.eroeffneNeuanlage).toHaveBeenCalledTimes(1);
  });
});

// --- Durchlauf und AK5: unveränderte Weitergabe in beide Richtungen ---------------------

describe('Kanäle der Schreib-Schnittstelle: Durchlauf und Weitergabe (4T-001825, AK5, B3)', () => {
  it('reicht einen gültigen Auftrag unverändert mit der Wurzel des sendenden Fensters weiter', async () => {
    const schnittstelle = attrappe();
    const kanal = registriere(schnittstelle).get('database:auftrag');
    const auftrag = {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: {},
          werte: { Ort: 'Chur' },
        },
        { tabelle: 'Unter/Orte.md', art: 'create', werte: { Name: 'Chur' } },
      ],
    };
    const vorher = structuredClone(auftrag);
    const zweiteWurzel = path.join(os.tmpdir(), 'em4me-auftrag-kanal-zweiter-bereich');

    await kanal({ wurzel: WURZEL, sender: { id: 1 } }, { auftrag });
    await kanal({ wurzel: zweiteWurzel, sender: { id: 1 } }, { auftrag });

    expect(schnittstelle.fuehreAuftragAus).toHaveBeenCalledTimes(2);
    expect(schnittstelle.fuehreAuftragAus.mock.calls[0][0]).toBe(WURZEL);
    expect(schnittstelle.fuehreAuftragAus.mock.calls[1][0]).toBe(zweiteWurzel);
    expect(schnittstelle.fuehreAuftragAus.mock.calls[0][1]).toBe(auftrag);
    expect(auftrag).toEqual(vorher);
  });

  it('reicht die Tabellen-Angabe der Neuanlage unverändert mit der Wurzel weiter', async () => {
    const schnittstelle = attrappe();
    const kanal = registriere(schnittstelle).get('database:neuanlage');
    await kanal(IM_BEREICH, { tabelle: 'Unter/Kunden.md' });
    expect(schnittstelle.eroeffneNeuanlage).toHaveBeenCalledWith(WURZEL, 'Unter/Kunden.md');
  });

  it('gibt das gelungene und das abgewiesene Ergebnis unverändert zurück', async () => {
    const gelungen = {
      ok: true,
      vorgang: '7',
      ergebnisse: [{ position: 0, tabelle: 'Kunden.md', id: 'r-00001', art: 'update' }],
      dateien: [],
      belege: [],
      verdichtung: [],
    };
    const abgewiesen = {
      ok: false,
      code: LAGEN.typVerletzt,
      error: 'Entwickler-Text',
      lagen: [{ code: LAGEN.typVerletzt, position: 0, tabelle: 'Kunden.md', feld: 'Anzahl' }],
    };
    for (const antwort of [gelungen, abgewiesen]) {
      const kanaele = registriere(attrappe(antwort));
      expect(
        await kanaele.get('database:auftrag')(IM_BEREICH, {
          auftrag: auftragMit('Kunden.md'),
        }),
      ).toBe(antwort);
      expect(await kanaele.get('database:neuanlage')(IM_BEREICH, { tabelle: 'Kunden.md' })).toBe(
        antwort,
      );
    }
  });
});

// --- B3: der Struktur-Klon trägt ein echtes Ergebnis ----------------------------------

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Die echte Schnittstelle mit echter Sperr-Verwaltung, Klammer und
// Wiederanlauf, wie in der Verdrahtung (Aufbau aus `db-record-auftrag.test.js`).
function echteSchnittstelle() {
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-09-23T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
  });
}

function tabellenText() {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '      required: true',
    '    - name: Ort',
    '    - name: Anzahl',
    '      type: number',
    '  lastId: 1',
    '---',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Anna',
    '| Basel',
    '| 3',
    '```',
    '',
  ].join('\n');
}

// Ob ein Wert NUR aus dem besteht, was der Struktur-Klon des IPC unverändert
// trägt: einfache Objekte, Listen und Grundwerte. `structuredClone` allein
// genügte nicht als Beleg, weil es eine Map oder ein Set klaglos klont; auf
// der anderen Seite des IPC käme dann aber etwas anderes an, als ein
// JSON-artiger Aufrufer erwartet.
function fremdeWerte(wert, ort = 'ergebnis', funde = []) {
  if (wert === null || ['string', 'number', 'boolean'].includes(typeof wert)) return funde;
  if (Array.isArray(wert)) {
    wert.forEach((eintrag, i) => fremdeWerte(eintrag, `${ort}[${i}]`, funde));
    return funde;
  }
  if (typeof wert === 'object' && Object.getPrototypeOf(wert) === Object.prototype) {
    for (const [name, eintrag] of Object.entries(wert)) {
      if (eintrag !== undefined) fremdeWerte(eintrag, `${ort}.${name}`, funde);
    }
    return funde;
  }
  funde.push(`${ort}: ${Object.prototype.toString.call(wert)}`);
  return funde;
}

describe('Kanäle der Schreib-Schnittstelle: Struktur-Klon eines echten Ergebnisses (4T-001825, B3)', () => {
  it('trägt ein gelungenes und ein abgewiesenes Ergebnis unverändert durch den Struktur-Klon', async () => {
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-auftrag-kanal-'));
    tmpDirs.push(wurzel);
    fs.writeFileSync(path.join(wurzel, 'Kunden.md'), tabellenText(), 'utf8');
    const kanal = registriere(echteSchnittstelle()).get('database:auftrag');
    const erwartet = { Name: 'Anna', Ort: 'Basel', Anzahl: '3' };

    const gelungen = await kanal(
      { wurzel, sender: { id: 1 } },
      {
        auftrag: {
          anweisungen: [
            {
              tabelle: 'Kunden.md',
              art: 'update',
              id: 'r-00001',
              erwartet,
              werte: { Ort: 'Chur' },
            },
          ],
        },
      },
    );
    const abgewiesen = await kanal(
      { wurzel, sender: { id: 1 } },
      {
        auftrag: {
          anweisungen: [
            {
              tabelle: 'Kunden.md',
              art: 'update',
              id: 'r-00001',
              erwartet: { ...erwartet, Ort: 'Chur' },
              werte: { Anzahl: 'viele' },
            },
          ],
        },
      },
    );

    // Die Fälle haben wirklich den Weg durch die Schnittstelle genommen.
    expect(gelungen.ok, JSON.stringify(gelungen)).toBe(true);
    expect(Object.keys(gelungen).sort()).toEqual([
      'belege',
      'dateien',
      'ergebnisse',
      'ok',
      'verdichtung',
      'vorgang',
    ]);
    expect(abgewiesen.ok).toBe(false);
    expect(abgewiesen.code).toBe(LAGEN.typVerletzt);
    expect(abgewiesen.lagen[0]).toMatchObject({ code: LAGEN.typVerletzt, position: 0 });

    for (const ergebnis of [gelungen, abgewiesen]) {
      expect(fremdeWerte(ergebnis)).toEqual([]);
      expect(structuredClone(ergebnis)).toEqual(ergebnis);
    }
  });

  it('erkennt einen Wert, den der Struktur-Klon anders trüge (Gegenprobe)', () => {
    expect(fremdeWerte({ a: new Map(), b: [new Set()], c: () => {} })).toEqual([
      'ergebnis.a: [object Map]',
      'ergebnis.b[0]: [object Set]',
      'ergebnis.c: [object Function]',
    ]);
  });
});

// --- AK6, AK7, B4: je Lage ein Text, kein Text ohne Lage -------------------------------

// Die Texte, die die Lagen der Schreib-Schnittstelle in allen fünf Sprachen
// brauchen, gegen die Codes des Katalogs. Die Funktion nimmt Codes und
// Fragmente als Eingabe und liest selbst nichts; damit lässt sich ihre
// Gegenprobe an erfundenem Bestand führen.
function pruefeLageSchluessel(codes, fragmente) {
  const befunde = [];
  const erlaubt = new Set(
    [...codes, 'unbekannt', ...Object.keys(ZWEITE_FASSUNGEN)].map((code) => `${PRAEFIX}${code}`),
  );
  for (const { code: sprache, werte } of fragmente) {
    for (const schluessel of erlaubt) {
      if (typeof werte[schluessel] !== 'string' || werte[schluessel].trim() === '')
        befunde.push(`${sprache}: ${schluessel} fehlt`);
    }
    for (const schluessel of Object.keys(werte)) {
      if (schluessel.startsWith(PRAEFIX) && !erlaubt.has(schluessel))
        befunde.push(`${sprache}: ${schluessel} ohne Lage`);
    }
  }
  return befunde;
}

// Die Parameter, die eine Lage tragen kann und die ein Text einsetzen darf
// (Briefing zu B4); andere Angaben am Befund sind technisch und erreichen den
// Anwender nicht.
//
// 4T-001940 (Epic 3E-000257, B3): Die Position steht in keinem Text mehr; der
// Bedienort setzt sie bei mehreren Anweisungen selbst voran
// (`src/shared/database/auftrag-text.js`).
const PLATZHALTER = new Set(['tabelle', 'id', 'feld', 'tabellen', 'vorgang', 'grund']);

// 4T-001926 (Epic 3E-000256, B6): Ein Text einer Regel-Lage setzt die Angaben
// des Regel-Befunds ein, der unter `naht` der Hülle reist; sein Vorrat an
// Platzhaltern ist der des Bauplans und nicht der der Schnittstelle.
// 4T-001940: ohne `position`, dafür `positionen` (beide Anweisungen eines
// doppelten Schlüssels).
const REGEL_PLATZHALTER = new Set([
  'positionen',
  'feld',
  'felder',
  'wert',
  'tabelle',
  'id',
  'anzeige',
  'regel',
  'meldung',
  'zieltabelle',
  'anzahl',
  'grund',
]);
// 4T-001940 (Epic 3E-000257, B3): die zweiten Fassungen zweier Regel-Texte, die
// der Bedienort nach den Angaben des Befunds wählt (Einzahl beim Lösch-Schutz,
// fehlende Ziel-Tabelle beim Verweis). Sie gehören zu ihrem Code und tragen
// dessen Platzhalter-Vorrat.
const ZWEITE_FASSUNGEN = Object.freeze({
  regelLoeschenAbhaengigeEinzeln: REGEL_LAGEN.loeschenAbhaengige,
  regelVerweisTabelleFehlt: REGEL_LAGEN.verweisTabelleUnbekannt,
});
const REGEL_SCHLUESSEL = new Set(
  [...Object.values(REGEL_LAGEN), ...Object.keys(ZWEITE_FASSUNGEN)].map(
    (code) => `${PRAEFIX}${code}`,
  ),
);

describe('Texte der Lagen: je Code ein Schlüssel in allen fünf Sprachen (4T-001825, AK6, AK7, B4)', () => {
  // 4T-001926: beide Kataloge, die Lagen der Schnittstelle und die der Regeln.
  const codes = [...Object.values(LAGEN), ...Object.values(REGEL_LAGEN)];

  it('führt für jeden Code des Katalogs einen Text und keinen Text ohne Code', () => {
    expect(codes.length).toBeGreaterThanOrEqual(20);
    expect(pruefeLageSchluessel(codes, FRAGMENTE)).toEqual([]);
  });

  it('meldet einen Code ohne Text und einen Text ohne Code (Gegenprobe)', () => {
    expect(pruefeLageSchluessel([...codes, 'auftragErfunden'], FRAGMENTE)).toEqual(
      SPRACHEN.map((sprache) => `${sprache}: ${PRAEFIX}auftragErfunden fehlt`),
    );
    const erfunden = FRAGMENTE.map(({ code, werte }) => ({
      code,
      werte: code === 'fr' ? { ...werte, [`${PRAEFIX}auftragErfunden`]: 'x' } : werte,
    }));
    expect(pruefeLageSchluessel(codes, erfunden)).toEqual([
      `fr: ${PRAEFIX}auftragErfunden ohne Lage`,
    ]);
  });

  it('setzt nur Parameter ein, die eine Lage trägt', () => {
    const fremde = [];
    for (const { code: sprache, werte } of FRAGMENTE) {
      for (const [schluessel, text] of Object.entries(werte)) {
        if (!schluessel.startsWith(PRAEFIX)) continue;
        const vorrat = REGEL_SCHLUESSEL.has(schluessel) ? REGEL_PLATZHALTER : PLATZHALTER;
        for (const m of text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
          if (!vorrat.has(m[1])) fremde.push(`${sprache}: ${schluessel} {${m[1]}}`);
        }
      }
    }
    expect(fremde).toEqual([]);
  });
});

// --- AK4, B5: die beiden unberührten Dateien ------------------------------------------

describe('Kanäle der Schreib-Schnittstelle: zwei Dateien bleiben unberührt (4T-001825, AK4, B5)', () => {
  // Einen Diff kennt ein Prüffall nicht; das prüfbare Merkmal ist, dass keine
  // der beiden Dateien einen Namen des neuen Wegs nennt. Die Brücke erreicht die
  // Oberfläche über das Datenbank-Modul, ohne dass eine von ihnen es wissen muss.
  const NAMEN = ['databaseAuftrag', 'databaseNeuanlage', 'database:auftrag', 'database:neuanlage'];

  it.each(UNBERUEHRT.map((d) => [d.rel, d.text]))(
    '%s nennt keinen Namen des neuen Wegs',
    (_rel, text) => {
      expect(text.length).toBeGreaterThan(1000);
      expect(NAMEN.filter((name) => text.includes(name))).toEqual([]);
    },
  );
});
