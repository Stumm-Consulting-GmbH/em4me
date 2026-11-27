// 4T-002863 (Epic 3E-000449): Der Such-Index liest Dokumente ohne private
// Kommentare. Geprüft werden die Kommentar-Erkennung des Index
// (src/main/index/index-kommentare.js), ihre Wirkung im Einlesen
// (src/main/index/parse.js über parseContent ohne Datei-Zugriff), der Schalter
// der Erweiterung «Kommentare», die Regel des gespeicherten Index
// (src/main/index/cache.js) und die Erinnerungen (src/shared/reminders.js).
//
// **Die rohen Fälle sind hier kein Beiwerk:** Jeder Schreibweg (Abhaken,
// Erinnerung erledigen, Workflow-Befehl) sucht die Zeile byte-genau in der
// Datei. Trüge der Index dort die bereinigte Zeile, fände der Schreibweg sie
// nicht oder schriebe den Kommentar weg. Den Treffer in der Anzeige prüft
// renderer/aufgaben-treffer-kommentare.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { parseContent } from '../../src/main/index/parse.js';
import { collectReminders } from '../../src/shared/reminders.js';
import { taskOrigin } from '../../src/shared/query/result-set.js';
import { taskHits, taskText } from '../../src/shared/query/result-display.js';

const require_ = createRequire(import.meta.url);
const { MDDA_CACHE_SCHEMA_VERSION } = require_('../../src/main/documents/mdd-store.js');
const { loadAreaCache } = require_('../../src/main/index/cache.js');
// Über `require` wie in parse.js: Ein `import` erzeugte unter vitest ein
// zweites Exemplar des Moduls, und der Schalter träfe das Einlesen nicht.
const { kommentareAusblenden, setzeKommentarRegel, zeilenOhneKommentare } = require_(
  '../../src/main/index/index-kommentare.js',
);

const QUELLE = 'C:/bereich/Quelle.md';
const lies = (...zeilen) => parseContent(QUELLE, zeilen.join('\n'));
const ziele = (parsed) => parsed.hits.map((h) => h.zielBasename);

afterEach(() => {
  // Jeder Fall beginnt im Normalzustand: Erweiterung «Kommentare» an.
  setzeKommentarRegel([]);
});

describe('Aufgabe mit privatem Kommentar', () => {
  it('trägt die rohe Zeile als Text und die bereinigte als sichtbaren Text', () => {
    const [aufgabe] = lies('- [ ] Angebot schicken %%Preis unter Liste%%').tasks;
    expect(aufgabe.text).toBe('- [ ] Angebot schicken %%Preis unter Liste%%');
    expect(aufgabe.sichtbar).not.toContain('Preis unter Liste');
    expect(aufgabe.sichtbar).toContain('Angebot schicken');
  });

  it('trägt ohne Kommentar keinen eigenen sichtbaren Text', () => {
    const [aufgabe] = lies('- [ ] Angebot schicken').tasks;
    expect(aufgabe.text).toBe('- [ ] Angebot schicken');
    expect(aufgabe).not.toHaveProperty('sichtbar');
  });

  it('erkennt den Kommentar auch in einer mit vier Leerzeichen eingerückten Liste', () => {
    const parsed = lies('- [ ] Oben', '    - [ ] Unten %%geheim%%');
    expect(parsed.tasks[1].text).toBe('    - [ ] Unten %%geheim%%');
    expect(parsed.tasks[1].sichtbar).not.toContain('geheim');
  });
});

describe('Schlagwort und Verweis im Kommentar', () => {
  it('zählen nicht, außerhalb schon', () => {
    const parsed = lies('Text #offen [[Sichtbar]] %% #geheim [[Versteckt]]%%');
    expect(parsed.tags).toContain('offen');
    expect(parsed.tags).not.toContain('geheim');
    expect(ziele(parsed)).toContain('Sichtbar');
    expect(ziele(parsed)).not.toContain('Versteckt');
  });

  it('zählen auch in einem Kommentar über mehrere Zeilen nicht', () => {
    const parsed = lies('Anfang', '%%', '#geheim [[Versteckt]]', '%%', '#danach');
    expect(parsed.tags).not.toContain('geheim');
    expect(parsed.tags).toContain('danach');
    expect(ziele(parsed)).not.toContain('Versteckt');
  });
});

describe('Kein Kommentar, wo der Zerleger keinen sieht', () => {
  it('Marker im Code-Block', () => {
    const parsed = lies('```', '%%', '```', '#danach');
    expect(parsed.tags).toContain('danach');
  });

  it('Marker im Inline-Code', () => {
    const parsed = lies('Text `%%` und #danach `%%`');
    expect(parsed.tags).toContain('danach');
  });

  it('maskierter Marker', () => {
    const parsed = lies('Text \\%% und #danach \\%%');
    expect(parsed.tags).toContain('danach');
  });
});

describe('Unpaariger Marker', () => {
  it('blendet wie die Anzeige bis zum Dokument-Ende aus', () => {
    const zeilen = ['#vorher', '%% offen', '#danach'];
    const bereinigt = zeilenOhneKommentare(zeilen, 0);
    expect(bereinigt).toHaveLength(3);
    expect(bereinigt[0]).toBe('#vorher');
    expect(bereinigt[2]).not.toContain('#danach');
  });
});

describe('Kopf-Block', () => {
  it('bleibt roh, auch wenn er die Marker trägt', () => {
    const parsed = lies('---', 'notiz: "a %%b%% c"', 'tags: [kopf]', '---', 'Text %% #geheim %%');
    expect(parsed.properties.notiz).toBe('a %%b%% c');
    expect(parsed.tags).toContain('kopf');
    expect(parsed.tags).not.toContain('geheim');
  });
});

describe('Dokument ohne Marker (Auflage 1 aus Antwort 16)', () => {
  it('durchläuft die Erkennung nicht: dieselbe Zeilen-Liste kommt zurück', () => {
    const zeilen = ['# Titel', '- [ ] Aufgabe #tag', '[[Ziel]]'];
    expect(zeilenOhneKommentare(zeilen, 0)).toBe(zeilen);
  });
});

describe('Schalter der Erweiterung «Kommentare»', () => {
  it('meldet eine Änderung der Regel und nur dann', () => {
    expect(kommentareAusblenden()).toBe(true);
    expect(setzeKommentarRegel(['comments'])).toBe(true);
    expect(setzeKommentarRegel(['comments'])).toBe(false);
    expect(kommentareAusblenden()).toBe(false);
    expect(setzeKommentarRegel([])).toBe(true);
    expect(kommentareAusblenden()).toBe(true);
  });

  it('liest im Aus-Zustand alles, wie die Anzeige es dann zeigt', () => {
    setzeKommentarRegel(['comments']);
    const zeilen = ['Text %% #geheim %%'];
    expect(zeilenOhneKommentare(zeilen, 0)).toBe(zeilen);
    const parsed = lies('- [ ] Aufgabe %% #geheim %%');
    expect(parsed.tags).toContain('geheim');
    expect(parsed.tasks[0]).not.toHaveProperty('sichtbar');
  });
});

describe('Gespeicherter Index', () => {
  const ordner = [];
  afterEach(() => {
    for (const o of ordner.splice(0)) fs.rmSync(o, { recursive: true, force: true });
  });
  async function speicher(ohneKommentare) {
    const o = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-index-kommentare-'));
    ordner.push(o);
    const datei = path.join(o, 'cache.json');
    const container = {
      schemaVersion: MDDA_CACHE_SCHEMA_VERSION,
      linkIndex: { files: { 'a.md': { mtimeMs: 1, size: 1, hash: 'h', parsed: { hits: [] } } } },
    };
    if (ohneKommentare !== undefined) container.ohneKommentare = ohneKommentare;
    fs.writeFileSync(datei, JSON.stringify(container));
    return datei;
  }

  it('trägt die Version 13', () => {
    expect(MDDA_CACHE_SCHEMA_VERSION).toBe(13);
  });

  it('übernimmt einen Speicher nach derselben Regel', async () => {
    expect((await loadAreaCache(await speicher(true), 'C:/bereich', true)).size).toBe(1);
    expect((await loadAreaCache(await speicher(false), 'C:/bereich', false)).size).toBe(1);
  });

  it('verwirft einen Speicher nach der anderen Regel', async () => {
    expect((await loadAreaCache(await speicher(false), 'C:/bereich', true)).size).toBe(0);
    expect((await loadAreaCache(await speicher(true), 'C:/bereich', false)).size).toBe(0);
  });
});

describe('Erinnerungen', () => {
  const env = { globalFilter: '', statusTypeOf: () => 'TODO', defaultTime: '09:00' };

  it('zeigen die Beschreibung ohne Kommentar und schreiben über die rohe Zeile', () => {
    const roh = '- [ ] Anrufen ⏰ 2026-11-25 10:00 %%Nummer 0123%%';
    const sichtbar = '- [ ] Anrufen ⏰ 2026-11-25 10:00 ';
    const [e] = collectReminders([{ path: QUELLE, zeile: 1, text: roh, sichtbar }], env);
    expect(e.description).not.toContain('Nummer');
    expect(e.taskText).toBe(roh);
    expect(e.key).toBe(`${QUELLE}\n${roh}`);
  });

  it('fallen bei leerer Beschreibung auf die sichtbare Zeile zurück, nie auf die rohe', () => {
    const roh = '- [ ] ⏰ 2026-11-25 10:00 %%Geheimnis%%';
    const sichtbar = '- [ ] ⏰ 2026-11-25 10:00 ';
    const [e] = collectReminders([{ path: QUELLE, zeile: 1, text: roh, sichtbar }], env);
    expect(e.description).toBe('');
    expect(e.sichtbarText).toBe(sichtbar);
    // So bilden Dialog, Seitenleiste und Benachrichtigung ihren Text; die
    // Oberfläche selbst prüft renderer/erinnerung-kommentare.test.js.
    expect(e.description || e.sichtbarText || e.taskText).not.toContain('Geheimnis');
  });

  it('entstehen nicht aus einem Marker, der nur im Kommentar steht', () => {
    const roh = '- [ ] Anrufen %%⏰ 2026-11-25 10:00%%';
    const out = collectReminders(
      [{ path: QUELLE, zeile: 1, text: roh, sichtbar: '- [ ] Anrufen ' }],
      env,
    );
    expect(out).toHaveLength(0);
  });
});

describe('Treffer einer Abfrage', () => {
  it('zeigen den sichtbaren Text und geben den Schreibwegen die rohe Zeile', () => {
    const roh = '- [ ] Angebot %%geheim%%';
    const origin = taskOrigin(QUELLE, 'Quelle', 3, roh, '- [ ] Angebot ');
    const menge = { state: { status: 'ready' }, rows: [{ origin }] };
    expect(taskHits(menge)).toEqual([
      { path: QUELLE, line: 3, taskText: roh, sichtbar: '- [ ] Angebot ' },
    ]);
    expect(taskText(origin.sichtbar ?? origin.raw, null, null)).toBe('Angebot');
  });

  it('tragen ohne Abweichung kein eigenes Feld', () => {
    expect(taskOrigin(QUELLE, 'Quelle', 3, '- [ ] Angebot', null)).not.toHaveProperty('sichtbar');
  });
});
