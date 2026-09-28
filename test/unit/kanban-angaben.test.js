// 4T-001957 (Epic 3E-000319, Story 4S-000985): Prüffälle der Angaben der
// verlinkten Notiz — der erste Verweis mit Ziel im Format-Kern, die Auswahl und
// Umwandlung der Kopf-Werte im geteilten Modul und der Lese-Kanal
// `kanban:notizAngaben` des Hauptprozesses an Wegwerf-Dateien.
//
// Der Kanal wird über seine Registrier-Funktion mit echten Dateien geprüft
// (Muster `canvas-austausch-ausgabe.test.js`): Auflöser, Grenze, Kopf-Leser und
// Bild-Lesen laufen wie im Programm; ersetzt ist allein die Namens-Suche des
// Bereichs-Index, die in ihren eigenen Prüfdateien steht.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  leseTafel,
  ersterVerweis,
  ersterVerweisMitZiel,
  ersterVerweisMitZielDerKarte,
} = require('../../src/shared/kanban/kanban-core.js');
const { einstellungenAusModell } = require('../../src/shared/kanban/kanban-einstellungen.js');
const {
  feldwahlAus,
  angabenName,
  angabeAlsText,
  bildVerweisAus,
  angabenAusKopf,
  angabenAnfrage,
} = require('../../src/shared/kanban/kanban-angaben.js');
const { registerEmbedsIpc } = require('../../src/main/ipc/embeds.js');
const { KOPF_BYTES } = require('../../src/main/database/frontmatter-kopf.js');

const FIXTURE = fileURLToPath(new URL('../fixtures/kanban/tafel-stufe-3.md', import.meta.url));

// --- 1. Format-Kern: der erste Verweis mit Ziel ---------------------------------

describe('kanban-core — erster Verweis mit Ziel (4T-001957)', () => {
  it('überspringt einen reinen Anker und nimmt den nächsten Verweis mit Ziel', () => {
    const text = 'Siehe [[#Abschnitt]] und dann [[Projekt]]';
    // Gegenprobe: `ersterVerweis` bleibt unverändert und liefert den Anker.
    expect(ersterVerweis(text).ziel).toBe('');
    expect(ersterVerweisMitZiel(text).ziel).toBe('Projekt');
  });

  it('überspringt eine Einbettung auf eine Bilddatei, zählt aber eine auf ein Dokument', () => {
    expect(ersterVerweisMitZiel('![[titel.png|200]] vor [[Notiz]]').ziel).toBe('Notiz');
    expect(ersterVerweisMitZiel('![[Foto.JPG]] ![[Protokoll]] [[Notiz]]')).toMatchObject({
      ziel: 'Protokoll',
      einbettung: true,
    });
    expect(ersterVerweisMitZiel('![[bild.webp]]')).toBeNull();
  });

  it('nimmt den ersten Verweis, nicht den letzten wie das Vorbild-Werkzeug', () => {
    expect(ersterVerweisMitZiel('[[Erste]] und [[Zweite]]').ziel).toBe('Erste');
  });

  it('sucht in den Folgezeilen und überspringt Inline-Code und Termin-Verweise', () => {
    expect(ersterVerweisMitZiel('Text `[[im Code]]`\nFolge [[Echt]]')).toMatchObject({
      ziel: 'Echt',
      zeile: 1,
    });
    expect(ersterVerweisMitZiel('@[[2026-10-04]] vor [[Notiz#Stand]]')).toMatchObject({
      ziel: 'Notiz',
      anker: 'Stand',
    });
    expect(ersterVerweisMitZiel('kein Verweis')).toBeNull();
    expect(ersterVerweisMitZiel('[[#nur Anker]]')).toBeNull();
  });

  it('findet je Karte der Beispiel-Tafel das maßgebliche Ziel', () => {
    const model = leseTafel(fs.readFileSync(FIXTURE, 'utf8'));
    const ziele = model.spalten.flatMap((s) =>
      s.karten.map((k) => {
        const v = ersterVerweisMitZielDerKarte(model, k);
        return v ? v.ziel : null;
      }),
    );
    expect(ziele).toEqual([
      'Projekt Alpha',
      'Projekt Beta',
      'Projekt Delta',
      'Projekt Epsilon',
      null,
      'Projekt Zeta',
    ]);
  });
});

// --- 2. Geteiltes Modul: Feldwahl, Werte, Bilder, Anfrage ------------------------

describe('kanban-angaben — Feldwahl und Kopf-Werte (4T-001957)', () => {
  it('bereinigt die Feldwahl und nennt den Anzeige-Namen', () => {
    expect(feldwahlAus(null)).toEqual([]);
    const liste = feldwahlAus([
      { feld: 'status', bezeichnung: 'Stand', bezeichnungVerbergen: false },
      { feld: ' ', bezeichnung: 'leer' },
      { feld: 'status', bezeichnung: 'doppelt' },
      { feld: 'owner', bezeichnung: '', bezeichnungVerbergen: true, enthaeltMarkdown: true },
    ]);
    expect(liste.map((e) => e.feld)).toEqual(['status', 'owner']);
    expect(angabenName(liste[0])).toBe('Stand');
    expect(angabenName(liste[1])).toBe('owner');
  });

  it('macht aus jedem Wert eine Zeichenkette: Text, Zahl, Liste mit Komma, Verschachteltes als JSON', () => {
    expect(angabeAlsText('in Arbeit')).toBe('in Arbeit');
    expect(angabeAlsText(3)).toBe('3');
    expect(angabeAlsText(false)).toBe('false');
    expect(angabeAlsText(['a', 'b', 2])).toBe('a, b, 2');
    expect(angabeAlsText([{ x: 1 }, 'b'])).toBe('{"x":1}, b');
    expect(angabeAlsText({ von: 'A', bis: ['B'] })).toBe('{"von":"A","bis":["B"]}');
    for (const leer of [null, undefined, '', '  ', [], [''], {}]) {
      expect(angabeAlsText(leer)).toBeNull();
    }
  });

  it('erkennt Bild-Werte an der Endung und an Wiki-Verweisen, nie an Adressen', () => {
    expect(bildVerweisAus('bilder/cover.png')).toBe('bilder/cover.png');
    expect(bildVerweisAus('[[cover.JPG]]')).toBe('cover.JPG');
    expect(bildVerweisAus('![[Anlagen/cover.webp|200]]')).toBe('Anlagen/cover.webp');
    expect(bildVerweisAus('C:\\Bilder\\cover.png')).toBe('C:\\Bilder\\cover.png');
    expect(bildVerweisAus('https://example.org/cover.png')).toBeNull();
    expect(bildVerweisAus('data:image/png;base64,AAAA.png')).toBeNull();
    expect(bildVerweisAus('[[Notiz]]')).toBeNull();
    expect(bildVerweisAus('Protokoll.md')).toBeNull();
    expect(bildVerweisAus('zwei\nZeilen.png')).toBeNull();
    expect(bildVerweisAus(['cover.png'])).toBeNull();
  });

  it('wählt nur die gewählten Schlüssel mit Wert aus, in der Reihenfolge der Feldwahl', () => {
    const daten = { status: 'offen', owner: '', tags: ['a', 'b'], cover: '[[c.png]]', geheim: 'x' };
    expect(angabenAusKopf(daten, ['cover', 'status', 'owner', 'fehlt', 'tags'])).toEqual([
      { schluessel: 'cover', text: '[[c.png]]', bild: 'c.png' },
      { schluessel: 'status', text: 'offen', bild: null },
      { schluessel: 'tags', text: 'a, b', bild: null },
    ]);
    expect(angabenAusKopf(null, ['status'])).toEqual([]);
    expect(angabenAusKopf(['liste'], ['0'])).toEqual([]);
  });

  it('bündelt die Anfrage einer Tafel: jedes Ziel einmal, Karten ohne Ziel fehlen', () => {
    const model = leseTafel(fs.readFileSync(FIXTURE, 'utf8'));
    const feldwahl = feldwahlAus(einstellungenAusModell(model).werte.feldwahl);
    const anfrage = angabenAnfrage(model, feldwahl);
    expect(anfrage.schluessel).toEqual(['status', 'bild']);
    expect(anfrage.ziele).toEqual([
      'Projekt Alpha',
      'Projekt Beta',
      'Projekt Delta',
      'Projekt Epsilon',
      'Projekt Zeta',
    ]);
    expect(anfrage.karten).toHaveLength(5);
    expect(anfrage.karten[4]).toEqual({ spalte: 1, karte: 0, ziel: 'Projekt Zeta' });
  });

  it('fragt ohne Feldwahl nichts an (Entscheidung C2), ebenso ohne Karte mit Ziel', () => {
    const model = leseTafel(fs.readFileSync(FIXTURE, 'utf8'));
    expect(angabenAnfrage(model, [])).toBeNull();
    const ohne = leseTafel('---\nkanban-plugin: board\n---\n\n## A\n\n- [ ] Karte\n');
    expect(angabenAnfrage(ohne, feldwahlAus([{ feld: 'status' }]))).toBeNull();
    const doppelt = leseTafel(
      '---\nkanban-plugin: board\n---\n\n## A\n\n- [ ] [[N]]\n- [ ] auch [[N]]\n- [ ] [[@team:Fremd]]\n',
    );
    const anfrage = angabenAnfrage(doppelt, feldwahlAus([{ feld: 'status' }]));
    // Das Ziel steht einmal in der Anfrage und gilt für beide Karten; der
    // Verweis über die Bereichs-Grenze ist nicht angeschlossen.
    expect(anfrage.ziele).toEqual(['N']);
    expect(anfrage.karten.map((k) => k.karte)).toEqual([0, 1]);
  });
});

// --- 3. Hauptprozess: der Lese-Kanal an Wegwerf-Dateien --------------------------

const EREIGNIS = { sender: { id: 1 } };
const wurzeln = [];

function wegwerfWurzel() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-angaben-'));
  wurzeln.push(w);
  return w;
}

function schreibe(wurzel, rel, inhalt) {
  const abs = path.join(wurzel, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, inhalt);
  return abs;
}

afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

// Ein Bild, das es gibt: die kleinste gültige PNG-Datei.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function kanal(areaRoot, { puffer = () => null, index = () => null } = {}) {
  const handlers = new Map();
  registerEmbedsIpc((name, fn) => handlers.set(name, fn), {
    areaRootForEvent: () => areaRoot,
    backlinks: {
      ensureIndexForDemand: () => {},
      resolveWikiTargetInIndex: index,
      bufferTextFor: puffer,
    },
    subpages: {
      isRelativeTarget: () => false,
      expandRelativeTarget: () => null,
      toFileBasename: (s) => s,
    },
    embedInhalt: { liesEmbedInhalt: async () => ({ ok: false }) },
    MAX_EMBED_BYTES: 5 * 1024 * 1024,
  });
  return handlers.get('kanban:notizAngaben');
}

describe('kanban:notizAngaben — Kopf-Auszug der verlinkten Notizen (AK1, AK3, AK5, AK6, AK9)', () => {
  it('liefert nur die gewählten Schlüssel, Listen mit Komma, je Ziel in der Reihenfolge der Anfrage', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafeln/Tafel.md', '# Tafel');
    schreibe(
      w,
      'Tafeln/Alpha.md',
      '---\nstatus: in Arbeit\ntags:\n  - rot\n  - blau\ngeheim: nicht zeigen\n---\n# Alpha\n',
    );
    schreibe(w, 'Tafeln/Ohne Kopf.md', '# Nur Text\n');
    const antwort = await kanal(w)(EREIGNIS, {
      basePath: tafel,
      schluessel: ['tags', 'status', 'fehlt'],
      ziele: ['Alpha', 'Ohne Kopf', 'Gibt es nicht'],
    });
    expect(antwort).toEqual({
      ok: true,
      ergebnisse: [
        {
          werte: [
            { schluessel: 'tags', text: 'rot, blau' },
            { schluessel: 'status', text: 'in Arbeit' },
          ],
        },
        { werte: [] },
        null,
      ],
    });
  });

  it('AK3: ein Bild-Wert wird relativ zur verlinkten Notiz aufgelöst und als Daten-Adresse geliefert', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafel.md', '# Tafel');
    schreibe(w, 'Projekte/Anlagen/cover.png', PNG);
    schreibe(
      w,
      'Projekte/Beta.md',
      '---\ncover: "[[Anlagen/cover.png]]"\nfoto: Anlagen/fehlt.png\nstatus: offen\n---\n',
    );
    const antwort = await kanal(w)(EREIGNIS, {
      basePath: tafel,
      schluessel: ['cover', 'foto', 'status'],
      ziele: ['Projekte/Beta'],
    });
    const [ergebnis] = antwort.ergebnisse;
    expect(ergebnis.werte[0].schluessel).toBe('cover');
    expect(ergebnis.werte[0].bild).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
    // Ein fehlendes Bild erscheint nicht, auch nicht als Platzhalter.
    expect(ergebnis.werte.map((x) => x.schluessel)).toEqual(['cover', 'status']);
  });

  it('folgt keinem Pfad über die Grenze hinaus — weder für die Notiz noch für ihr Bild', async () => {
    const w = wegwerfWurzel();
    const bereich = path.join(w, 'Bereich');
    const tafel = schreibe(w, 'Bereich/Tafel.md', '# Tafel');
    schreibe(w, 'Draussen.md', '---\nstatus: fremd\n---\n');
    schreibe(w, 'draussen.png', PNG);
    schreibe(w, 'Bereich/Innen.md', '---\ncover: ../draussen.png\nstatus: da\n---\n');
    schreibe(w, 'Bereich/Absolut.md', `---\ncover: ${path.join(w, 'draussen.png')}\n---\n`);
    const antwort = await kanal(bereich)(EREIGNIS, {
      basePath: tafel,
      schluessel: ['cover', 'status'],
      ziele: ['../Draussen', 'Innen', 'Absolut'],
    });
    expect(antwort.ergebnisse[0]).toBeNull();
    expect(antwort.ergebnisse[1].werte).toEqual([{ schluessel: 'status', text: 'da' }]);
    expect(antwort.ergebnisse[2].werte).toEqual([]);
  });

  it('AK9: außerhalb eines Bereichs wird relativ zum Ordner der Tafel aufgelöst', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Ordner/Tafel.md', '# Tafel');
    schreibe(w, 'Ordner/Unter/Gamma.md', '---\nstatus: lose\n---\n');
    const antwort = await kanal(null)(EREIGNIS, {
      basePath: tafel,
      schluessel: ['status'],
      ziele: ['Unter/Gamma'],
    });
    expect(antwort.ergebnisse).toEqual([{ werte: [{ schluessel: 'status', text: 'lose' }] }]);
  });

  it('findet ein Ziel über die Namens-Suche des Bereichs, wie die Verweis-Navigation', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafel.md', '# Tafel');
    const ziel = schreibe(w, 'tief/drin/Delta.md', '---\nstatus: gefunden\n---\n');
    const index = (_basis, logisch) =>
      logisch === 'Delta' ? { status: 'ready', candidates: [ziel] } : null;
    const antwort = await kanal(w, { index })(EREIGNIS, {
      basePath: tafel,
      schluessel: ['status'],
      ziele: ['Delta'],
    });
    expect(antwort.ergebnisse[0].werte).toEqual([{ schluessel: 'status', text: 'gefunden' }]);
  });

  it('der geschriebene Stand einer offenen Notiz geht der Platte vor', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafel.md', '# Tafel');
    const notiz = schreibe(w, 'Eps.md', '---\nstatus: gespeichert\n---\n');
    const puffer = (abs) => (abs === notiz ? '---\nstatus: ungespeichert\n---\n' : null);
    const antwort = await kanal(w, { puffer })(EREIGNIS, {
      basePath: tafel,
      schluessel: ['status'],
      ziele: ['Eps'],
    });
    expect(antwort.ergebnisse[0].werte[0].text).toBe('ungespeichert');
  });

  it('liest bei einer großen Datei nur den Kopf, und ein übergroßer Kopf liefert keine Angaben', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafel.md', '# Tafel');
    schreibe(w, 'Gross.md', `---\nstatus: gross\n---\n${'x'.repeat(KOPF_BYTES * 4)}\n`);
    // Ein Kopf ohne Ende, größer als die Grenze einer Markdown-Einbettung.
    schreibe(w, 'Riesig.md', `---\nstatus: nie\n${'y: 1\n'.repeat(1100000)}`);
    const antwort = await kanal(w)(EREIGNIS, {
      basePath: tafel,
      schluessel: ['status'],
      ziele: ['Gross', 'Riesig'],
    });
    expect(antwort.ergebnisse[0].werte).toEqual([{ schluessel: 'status', text: 'gross' }]);
    expect(antwort.ergebnisse[1]).toBeNull();
  });

  it('AK6: liest nur — Inhalt und Zeitstempel der Notiz bleiben unverändert', async () => {
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafel.md', '# Tafel');
    const inhalt = '---\nstatus: fest\n---\n# Notiz\n';
    const notiz = schreibe(w, 'Fest.md', inhalt);
    const vorher = fs.statSync(notiz).mtimeMs;
    await kanal(w)(EREIGNIS, { basePath: tafel, schluessel: ['status'], ziele: ['Fest'] });
    expect(fs.readFileSync(notiz, 'utf8')).toBe(inhalt);
    expect(fs.statSync(notiz).mtimeMs).toBe(vorher);
  });

  it('prüft seine Parameter und liefert bei fehlerhaftem Aufruf ein Ergebnis-Objekt statt einer Ausnahme', async () => {
    const f = kanal(null);
    expect(await f(EREIGNIS, null)).toEqual({ ok: false, error: 'missing params' });
    expect(await f(EREIGNIS, { basePath: 'x', ziele: 'a', schluessel: [] })).toEqual({
      ok: false,
      error: 'missing params',
    });
    const w = wegwerfWurzel();
    const tafel = schreibe(w, 'Tafel.md', '# Tafel');
    const antwort = await f(EREIGNIS, { basePath: tafel, schluessel: [3], ziele: [7, ''] });
    expect(antwort).toEqual({ ok: true, ergebnisse: [null, null] });
  });
});
