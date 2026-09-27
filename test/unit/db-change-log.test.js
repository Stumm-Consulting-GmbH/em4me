// 4T-001790 (Epic 3E-000255, E10.6, E10.7): Unit-Tests des Schreibwegs der
// Änderungsbelege — Ort und Anlage der Beleg-Datei (AK6), der anfügende
// Schreibweg (AK5), die Herkunft über das bestehende Modul (AK10) und der
// abgerissene Beleg am Dateiende (AK11).
//
// Gearbeitet wird an echten Temp-Verzeichnissen, weil der Gegenstand der
// Datei-Zugriff ist; eine Attrappe des Dateisystems prüfte die Attrappe. Die
// tragende Zusage ist nicht, dass am Ende alle Belege dastehen, sondern dass
// der vorhandene Anteil dabei **unberührt** bleibt: Deshalb vergleicht der
// Anfüge-Fall die Bytes des Präfixes und zählt zugleich, welche Funktionen des
// Dateisystems überhaupt gerufen wurden. Ein Prüffall, der nur das Ergebnis
// misst, wäre auch dann grün, wenn die Datei bei jedem Beleg neu geschrieben
// würde.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOG_CODES,
  belegPfadFuer,
  belegeDesDatensatzes,
  leseBelegDatei,
  schreibeBeleg,
} from '../../src/main/database/change-log.js';
import { MDDL_EXT } from '../../src/shared/markdown-data-family.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesung im Modulkopf, nicht im Prüffall (test/README).
const QUELLE = fs.readFileSync(path.join(ROOT, 'src', 'main', 'database', 'change-log.js'), 'utf8');

const HERKUNFT = () => ({ benutzer: 'anna', rechner: 'SC-026' });

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

function tabelle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beleg-'));
  tmpDirs.push(dir);
  const pfad = path.join(dir, 'Personen.md');
  fs.writeFileSync(pfad, '---\ndb-table:\n  fields: []\n---\n', 'utf8');
  return pfad;
}

// Ein Dateisystem, dessen Zugriffe gezählt werden. Es reicht die echten
// Funktionen durch; gemessen wird, WELCHE davon der Schreibweg ruft.
function beobachtet() {
  const sicht = {
    appendFile: fsp.appendFile,
    readFile: fsp.readFile,
    writeFile: fsp.writeFile,
    open: fsp.open,
    stat: fsp.stat,
    truncate: fsp.truncate,
  };
  return {
    fsp: sicht,
    anfuegen: vi.spyOn(sicht, 'appendFile'),
    lesen: vi.spyOn(sicht, 'readFile'),
    schreiben: vi.spyOn(sicht, 'writeFile'),
    oeffnen: vi.spyOn(sicht, 'open'),
    stattgeben: vi.spyOn(sicht, 'stat'),
    kuerzen: vi.spyOn(sicht, 'truncate'),
  };
}

function uhr(...zeitpunkte) {
  let i = 0;
  return () => zeitpunkte[Math.min(i++, zeitpunkte.length - 1)];
}

function angaben(abweichung) {
  return {
    art: 'update',
    id: 'r-00042',
    vorgang: '1',
    felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
    ...abweichung,
  };
}

describe('Beleg-Datei: Ort und Anlage (4T-001790, AK6)', () => {
  it('liegt neben der Tabellen-Datei und trägt die Endung der Markdown-Data-Familie', () => {
    expect(MDDL_EXT).toBe('.mddl');
    expect(belegPfadFuer('C:/Daten/Bereich/Personen.md')).toBe('C:/Daten/Bereich/Personen.mddl');
    expect(belegPfadFuer('/daten/Personen.md')).toBe('/daten/Personen.mddl');
  });

  it('legt die Datei mit dem ersten Beleg an', async () => {
    const pfad = tabelle();
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
    const erg = await schreibeBeleg(pfad, angaben(), {
      jetzt: uhr('2026-09-18T12:00:00Z'),
      herkunft: HERKUNFT,
    });
    expect(erg.ok).toBe(true);
    expect(erg.pfad).toBe(belegPfadFuer(pfad));
    expect(fs.existsSync(erg.pfad)).toBe(true);
  });

  it('trägt weder einen Kopf noch einen Abschluss', async () => {
    const pfad = tabelle();
    await schreibeBeleg(pfad, angaben(), {
      jetzt: uhr('2026-09-18T12:00:00Z'),
      herkunft: HERKUNFT,
    });
    const inhalt = fs.readFileSync(belegPfadFuer(pfad), 'utf8');
    expect(inhalt.startsWith('\n|- ')).toBe(true);
    expect(inhalt).not.toContain('---');
    expect(inhalt).not.toContain('```');
  });
});

describe('Beleg-Datei: der anfügende Schreibweg (4T-001790, AK5)', () => {
  it('lässt den vorhandenen Anteil byte-gleich stehen (tragender Fall)', async () => {
    const pfad = tabelle();
    const belegPfad = belegPfadFuer(pfad);
    const naht = { jetzt: uhr('2026-09-18T12:00:00Z'), herkunft: HERKUNFT };
    for (const feld of [
      { name: 'Ort', neu: 'Basel' },
      { name: 'Adresse', alt: 'Weg 1', neu: 'Weg 2\n4051 Basel' },
      { name: 'Ort', alt: 'Basel', neu: 'Bern' },
    ])
      await schreibeBeleg(pfad, angaben({ felder: [feld] }), naht);

    const vorher = fs.readFileSync(belegPfad);
    const erg = await schreibeBeleg(
      pfad,
      angaben({ felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }] }),
      naht,
    );
    expect(erg.ok).toBe(true);

    const nachher = fs.readFileSync(belegPfad);
    expect(nachher.length).toBeGreaterThan(vorher.length);
    expect(nachher.subarray(0, vorher.length).equals(vorher)).toBe(true);
  });

  it('ruft beim Anfügen weder readFile noch open noch stat auf die Beleg-Datei', async () => {
    const pfad = tabelle();
    const sicht = beobachtet();
    const naht = { fsp: sicht.fsp, jetzt: uhr('2026-09-18T12:00:00Z'), herkunft: HERKUNFT };
    await schreibeBeleg(pfad, angaben(), naht);
    await schreibeBeleg(
      pfad,
      angaben({ felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }] }),
      naht,
    );

    expect(sicht.anfuegen).toHaveBeenCalledTimes(2);
    // Genau ein Schreibaufruf je Beleg, und zwar im Anfüge-Modus.
    expect(sicht.anfuegen.mock.calls[0][0]).toBe(belegPfadFuer(pfad));
    expect(sicht.anfuegen.mock.calls[0][2]).toBe('utf8');
    for (const spion of [
      sicht.lesen,
      sicht.schreiben,
      sicht.oeffnen,
      sicht.stattgeben,
      sicht.kuerzen,
    ])
      expect(spion).not.toHaveBeenCalled();
  });

  it('meldet einen unbrauchbaren Beleg, statt eine halbe Zeile zu schreiben', async () => {
    const pfad = tabelle();
    const sicht = beobachtet();
    const erg = await schreibeBeleg(pfad, angaben({ art: 'insert' }), {
      fsp: sicht.fsp,
      jetzt: uhr('2026-09-18T12:00:00Z'),
      herkunft: HERKUNFT,
    });
    expect(erg.ok).toBe(false);
    expect(erg.code).toBe(LOG_CODES.ungueltig);
    expect(erg.error).toMatch(/unbekannte Art/);
    expect(sicht.anfuegen).not.toHaveBeenCalled();
    expect(fs.existsSync(belegPfadFuer(pfad))).toBe(false);
  });

  it('meldet einen nicht beschreibbaren Ort, statt still zu scheitern', async () => {
    const sicht = beobachtet();
    sicht.anfuegen.mockRejectedValueOnce(
      Object.assign(new Error('kein Zugriff'), { code: 'EACCES' }),
    );
    const erg = await schreibeBeleg('/nirgends/Personen.md', angaben(), {
      fsp: sicht.fsp,
      jetzt: uhr('2026-09-18T12:00:00Z'),
      herkunft: HERKUNFT,
    });
    expect(erg.ok).toBe(false);
    expect(erg.code).toBe(LOG_CODES.anfuegen);
    expect(erg.error).toBe('kein Zugriff');
  });

  it('weist einen fehlenden Pfad der Tabellen-Datei ab', async () => {
    expect((await schreibeBeleg('', angaben())).code).toBe(LOG_CODES.pfad);
    expect((await leseBelegDatei(null)).code).toBe(LOG_CODES.pfad);
  });
});

describe('Beleg-Datei: Lesen, Reihenfolge und Verkettung (4T-001790, AK7)', () => {
  it('liest eine fehlende Datei als «keine Belege» und nicht als Fehler', async () => {
    const erg = await leseBelegDatei(tabelle());
    expect(erg).toMatchObject({ ok: true, belege: [], befunde: [] });
  });

  it('liefert die Belege eines Datensatzes in Datei-Reihenfolge samt Verkettungs-Auskunft', async () => {
    const pfad = tabelle();
    const naht = { jetzt: uhr('2026-09-18T12:00:00Z'), herkunft: HERKUNFT };
    await schreibeBeleg(
      pfad,
      angaben({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }),
      naht,
    );
    await schreibeBeleg(
      pfad,
      angaben({ id: 'r-00099', felder: [{ name: 'Ort', alt: 'x', neu: 'y' }] }),
      naht,
    );
    await schreibeBeleg(
      pfad,
      angaben({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] }),
      naht,
    );

    const erg = await belegeDesDatensatzes(pfad, 'r-42');
    expect(erg.ok).toBe(true);
    expect(erg.belege.map((b) => b.art)).toEqual(['create', 'update']);
    expect(erg.verkettung).toEqual({ lueckenlos: true, luecken: [] });
  });

  it('meldet eine Lücke in der Kette mit Feld und Position', async () => {
    const pfad = tabelle();
    const naht = { jetzt: uhr('2026-09-18T12:00:00Z'), herkunft: HERKUNFT };
    await schreibeBeleg(
      pfad,
      angaben({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }),
      naht,
    );
    await schreibeBeleg(
      pfad,
      angaben({ felder: [{ name: 'Ort', alt: 'Chur', neu: 'Bern' }] }),
      naht,
    );

    const erg = await belegeDesDatensatzes(pfad, 'r-00042');
    expect(erg.verkettung).toEqual({
      lueckenlos: false,
      luecken: [{ grund: 'wert', feld: 'Ort', position: 1 }],
    });
  });
});

describe('Beleg-Datei: abgerissener Beleg am Dateiende (4T-001790, AK11)', () => {
  it('meldet den abgerissenen als beschädigt und liest den danach angefügten vollständig', async () => {
    const pfad = tabelle();
    const belegPfad = belegPfadFuer(pfad);
    const naht = { jetzt: uhr('2026-09-18T12:00:00Z'), herkunft: HERKUNFT };
    await schreibeBeleg(
      pfad,
      angaben({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }),
      naht,
    );
    await schreibeBeleg(
      pfad,
      angaben({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Musterstadt' }] }),
      naht,
    );

    // Der Abbruch mitten in einer Zell-Zeile, ohne Zeilenende: genau das, was
    // ein abgebrochener Schreibvorgang hinterlässt.
    const ganz = fs.readFileSync(belegPfad, 'utf8');
    const abgeschnitten = ganz.slice(0, ganz.lastIndexOf('| Musterstadt') + '| Muster'.length);
    fs.writeFileSync(belegPfad, abgeschnitten, 'utf8');

    const erg = await schreibeBeleg(
      pfad,
      angaben({ felder: [{ name: 'Ort', alt: 'Musterstadt', neu: 'Bern' }] }),
      naht,
    );
    expect(erg.ok).toBe(true);

    const gelesen = await leseBelegDatei(pfad);
    expect(gelesen.belege).toHaveLength(3);
    expect(gelesen.belege.map((b) => b.beschaedigt)).toEqual([false, true, false]);
    expect(gelesen.befunde).toEqual([{ code: 'belegZellenUnvollstaendig', position: 1 }]);
    // Der danach angefügte Beleg ist vollständig und unverfälscht lesbar.
    expect(gelesen.belege[2].felder).toEqual([{ name: 'Ort', alt: 'Musterstadt', neu: 'Bern' }]);
    expect(gelesen.belege[2].rechner).toBe('SC-026');
    // Der beschädigte Beleg unterbricht die Kette genau einmal, mit benanntem
    // Grund. Der danach angefügte wird nicht gegen den Stand vor dem Schaden
    // verglichen; eine zweite, unechte Wert-Lücke entsteht nicht.
    const kette = await belegeDesDatensatzes(pfad, 'r-00042');
    expect(kette.verkettung.lueckenlos).toBe(false);
    expect(kette.verkettung.luecken).toEqual([{ grund: 'beschaedigt', feld: null, position: 1 }]);
  });
});

describe('Beleg-Datei: Herkunft über das bestehende Modul (4T-001790, AK10)', () => {
  it('schreibt Benutzer und Rechner aus der eingereichten Ermittlung', async () => {
    const pfad = tabelle();
    const ermittelt = vi.fn(() => ({ benutzer: 'bert', rechner: 'SC-027' }));
    await schreibeBeleg(pfad, angaben(), {
      jetzt: uhr('2026-09-18T12:00:00Z'),
      herkunft: ermittelt,
    });
    const gelesen = await leseBelegDatei(pfad);
    expect(ermittelt).toHaveBeenCalledTimes(1);
    expect(gelesen.belege[0].benutzer).toBe('bert');
    expect(gelesen.belege[0].rechner).toBe('SC-027');
  });

  it('lässt eine nicht ermittelbare Angabe leer, statt einen Ersatzwert zu erfinden', async () => {
    const pfad = tabelle();
    await schreibeBeleg(pfad, angaben(), {
      jetzt: uhr('2026-09-18T12:00:00Z'),
      herkunft: () => ({ benutzer: null, rechner: null }),
    });
    const gelesen = await leseBelegDatei(pfad);
    expect(gelesen.belege[0].benutzer).toBeNull();
    expect(gelesen.belege[0].rechner).toBeNull();
  });

  it('bezieht die Herkunft aus den bestehenden Modulen und ermittelt sie nicht selbst', () => {
    expect(QUELLE).toMatch(/require\('\.\.\/herkunft\.js'\)/);
    expect(QUELLE).toMatch(/require\('\.\.\/documents\/mdd-herkunft\.js'\)/);
    for (const wort of ['node:os', 'userInfo', 'hostname', 'USERNAME'])
      expect(QUELLE.includes(wort), wort).toBe(false);
  });

  it('nimmt den Zeitpunkt aus der Uhr und die Vorgangs-Kennung als Wert (AK9)', async () => {
    const pfad = tabelle();
    await schreibeBeleg(pfad, angaben({ vorgang: 4711 }), {
      jetzt: uhr('2026-09-18T12:34:56Z'),
      herkunft: HERKUNFT,
    });
    const gelesen = await leseBelegDatei(pfad);
    expect(gelesen.belege[0].zeitpunkt).toBe('2026-09-18T12:34:56Z');
    expect(gelesen.belege[0].vorgang).toBe('4711');
    for (const wort of ['hochwasserstand', 'naechsteKennung'])
      expect(QUELLE.toLowerCase().includes(wort.toLowerCase()), wort).toBe(false);
  });
});
