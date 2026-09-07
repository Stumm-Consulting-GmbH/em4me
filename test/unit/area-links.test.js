// 4T-001450 (Epic 3E-000190): Unit-Tests des Verknuepfungs-Modells der
// Bereiche — Normalisierung der Sektion `areaLinks`, ihre Ablage in der
// Bereichsdatei und die Fehler-Regeln.
//
// Gearbeitet wird an einem echten Temp-Verzeichnis (Muster
// area-start-page.test.js), weil die Modul-Funktionen ihr fs selbst requiren
// und der Test damit zugleich die reale Serialisierung des Containers prueft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import areaLinks from '../../src/main/area/area-links.js';
import mddStore from '../../src/main/documents/mdd-store.js';

const { normalizeAreaLinks, findAreaLink, isValidPrefix } = areaLinks;

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-arealinks-'));
  tmpDirs.push(dir);
  return dir;
}

function makeConfig() {
  return createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: vi.fn(),
    mddStore,
    attachmentPath: {},
    resolveTemplatesConfig: () => ({}),
  });
}

function mddaPath(root) {
  return path.join(root, mddStore.MDDA_FILENAME);
}

function gelesen(root) {
  return JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
}

// Absoluter Pfad in der Schreibweise der laufenden Plattform, damit die
// Faelle unter Windows wie unter POSIX dasselbe pruefen.
function abs(...teile) {
  return path.resolve(path.sep, ...teile);
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('normalizeAreaLinks — Modell und Verwerfungs-Regeln', () => {
  it('nimmt einen vollstaendigen Eintrag unveraendert an', () => {
    const ziel = abs('Zentral');
    expect(normalizeAreaLinks([{ prefix: 'zt', path: ziel, templates: true }])).toEqual([
      { prefix: 'zt', path: ziel, templates: true },
    ]);
  });

  it('faellt fuer Nicht-Listen und leere Listen auf die leere Liste', () => {
    expect(normalizeAreaLinks(undefined)).toEqual([]);
    expect(normalizeAreaLinks(null)).toEqual([]);
    expect(normalizeAreaLinks({ prefix: 'zt' })).toEqual([]);
    expect(normalizeAreaLinks('zt')).toEqual([]);
    expect(normalizeAreaLinks([])).toEqual([]);
  });

  it('verwirft defekte Eintraege, ohne die gueltigen mitzureissen', () => {
    const ziel = abs('Zentral');
    const zweitesZiel = abs('Archiv');
    const eintraege = normalizeAreaLinks([
      null,
      'kein Objekt',
      ['auch nicht'],
      { prefix: 'zt' }, // ohne Pfad
      { path: ziel }, // ohne Kuerzel
      { prefix: 'zt', path: ziel },
      { prefix: 'ar', path: zweitesZiel },
    ]);
    expect(eintraege).toEqual([
      { prefix: 'zt', path: ziel, templates: false },
      { prefix: 'ar', path: zweitesZiel, templates: false },
    ]);
  });

  it('verwirft Kuerzel mit Zeichen, die die Link-Syntax bereits belegt', () => {
    const ziel = abs('Zentral');
    for (const prefix of ['a:b', 'a#b', 'a|b', 'a/b', 'a]b', 'a b', '', 'x'.repeat(33)]) {
      expect(normalizeAreaLinks([{ prefix, path: ziel }])).toEqual([]);
    }
    expect(isValidPrefix('Zentral-2_alt')).toBe(true);
    expect(isValidPrefix('a:b')).toBe(false);
  });

  it('verwirft relative Pfade statt sie zu raten', () => {
    expect(normalizeAreaLinks([{ prefix: 'zt', path: 'Zentral' }])).toEqual([]);
    expect(normalizeAreaLinks([{ prefix: 'zt', path: './Zentral' }])).toEqual([]);
    expect(normalizeAreaLinks([{ prefix: 'zt', path: '   ' }])).toEqual([]);
  });

  it('laesst bei doppeltem Kuerzel den ersten Eintrag gewinnen, ohne Ruecksicht auf Schreibung', () => {
    const erst = abs('Erst');
    const zweit = abs('Zweit');
    const eintraege = normalizeAreaLinks([
      { prefix: 'zt', path: erst },
      { prefix: 'ZT', path: zweit },
    ]);
    expect(eintraege).toEqual([{ prefix: 'zt', path: erst, templates: false }]);
  });

  it('verwirft die Verknuepfung eines Bereichs mit sich selbst, wenn die eigene Wurzel bekannt ist', () => {
    const eigen = abs('Notizen');
    const fremd = abs('Zentral');
    const mitWurzel = normalizeAreaLinks(
      [
        { prefix: 'ich', path: eigen },
        { prefix: 'zt', path: fremd },
      ],
      { selfRoot: eigen },
    );
    expect(mitWurzel).toEqual([{ prefix: 'zt', path: fremd, templates: false }]);
    // Ohne selfRoot bleibt der Eintrag stehen: Das Modul kennt die eigene
    // Wurzel dann nicht und raet sie nicht.
    expect(normalizeAreaLinks([{ prefix: 'ich', path: eigen }])).toHaveLength(1);
  });

  it('behandelt das Vorlagen-Opt-in streng boolesch und faellt sonst auf aus', () => {
    const ziel = abs('Zentral');
    const faelle = [undefined, null, 0, 1, 'true', 'ja', {}];
    for (const wert of faelle) {
      expect(normalizeAreaLinks([{ prefix: 'zt', path: ziel, templates: wert }])[0].templates).toBe(
        false,
      );
    }
    expect(normalizeAreaLinks([{ prefix: 'zt', path: ziel, templates: true }])[0].templates).toBe(
      true,
    );
  });
});

describe('findAreaLink — Nachschlagen ohne Ruecksicht auf Schreibung', () => {
  const links = normalizeAreaLinks([
    { prefix: 'Zentral', path: abs('Zentral') },
    { prefix: 'ar', path: abs('Archiv'), templates: true },
  ]);

  it('findet den Eintrag in beliebiger Schreibung', () => {
    expect(findAreaLink(links, 'zentral').path).toBe(abs('Zentral'));
    expect(findAreaLink(links, 'ZENTRAL').path).toBe(abs('Zentral'));
    expect(findAreaLink(links, ' ar ').templates).toBe(true);
  });

  it('liefert null fuer Unbekanntes und fuer Nicht-Zeichenketten', () => {
    expect(findAreaLink(links, 'weg')).toBeNull();
    expect(findAreaLink(links, '')).toBeNull();
    expect(findAreaLink(links, null)).toBeNull();
    expect(findAreaLink(undefined, 'ar')).toBeNull();
  });
});

describe('Verknuepfungen: Ablage in der Bereichsdatei', () => {
  it('legt die Bereichsdatei erst beim ersten tatsaechlichen Setzen an', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    expect(fs.existsSync(mddaPath(root))).toBe(false);

    // Eine leere Liste legt nichts an.
    expect(await cfg.writeAreaLinks(root, [])).toEqual({ ok: true });
    expect(fs.existsSync(mddaPath(root))).toBe(false);

    expect(await cfg.writeAreaLinks(root, [{ prefix: 'zt', path: abs('Zentral') }])).toEqual({
      ok: true,
    });
    expect(fs.existsSync(mddaPath(root))).toBe(true);
  });

  it('schreibt den absoluten Pfad und das Kuerzel und liest sie zurueck', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const ziel = abs('Zentral', 'Bereich');

    await cfg.writeAreaLinks(root, [{ prefix: 'zt', path: ziel, templates: true }]);
    expect(gelesen(root).settings.areaLinks).toEqual([
      { prefix: 'zt', path: ziel, templates: true },
    ]);
    expect(await cfg.readAreaLinks(root)).toEqual([{ prefix: 'zt', path: ziel, templates: true }]);
  });

  it('fuehrt je Richtung ein eigenes Kuerzel; beide Richtungen duerfen verschieden lauten', async () => {
    const einer = makeRoot();
    const anderer = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaLinks(einer, [{ prefix: 'zt', path: anderer }]);
    await cfg.writeAreaLinks(anderer, [{ prefix: 'notizen', path: einer }]);

    expect(await cfg.readAreaLinks(einer)).toEqual([
      { prefix: 'zt', path: path.normalize(anderer), templates: false },
    ]);
    expect(await cfg.readAreaLinks(anderer)).toEqual([
      { prefix: 'notizen', path: path.normalize(einer), templates: false },
    ]);
  });

  it('haelt das Opt-in je Eintrag getrennt; ohne Angabe gilt aus', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaLinks(root, [
      { prefix: 'mit', path: abs('Mit'), templates: true },
      { prefix: 'ohne', path: abs('Ohne') },
    ]);
    const eintraege = await cfg.readAreaLinks(root);
    expect(eintraege.map((e) => [e.prefix, e.templates])).toEqual([
      ['mit', true],
      ['ohne', false],
    ]);
  });

  it('entfernt die Sektion, wenn die Liste leer wird, und laesst die Datei stehen', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaLinks(root, [{ prefix: 'zt', path: abs('Zentral') }]);
    expect(gelesen(root).settings.areaLinks).toHaveLength(1);

    expect(await cfg.writeAreaLinks(root, [])).toEqual({ ok: true });
    expect(fs.existsSync(mddaPath(root))).toBe(true);
    expect(gelesen(root).settings).not.toHaveProperty('areaLinks');
    expect(await cfg.readAreaLinks(root)).toEqual([]);
  });

  it('laesst fremde Sektionen beim Schreiben unberuehrt und die Schema-Version unveraendert', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaStartPage(root, 'Start.md');
    const vorher = gelesen(root);
    expect(vorher.schemaVersion).toBe(1);

    await cfg.writeAreaLinks(root, [{ prefix: 'zt', path: abs('Zentral') }]);
    const nachher = gelesen(root);
    expect(nachher.settings.startPage).toBe('Start.md');
    expect(nachher.schemaVersion).toBe(vorher.schemaVersion);
  });

  it('liest eine Bereichsdatei ohne die Sektion als "keine Verknuepfung"', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaStartPage(root, 'Start.md');
    expect(await cfg.readAreaLinks(root)).toEqual([]);
    // Die fremde Sektion bleibt lesbar — kein Migrations-Pfad noetig.
    expect(await cfg.readAreaStartPage(root)).toBe('Start.md');
  });

  it('liest einen fehlenden Bereich als "keine Verknuepfung"', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    expect(await cfg.readAreaLinks(root)).toEqual([]);
  });

  it('ueberschreibt eine defekte Bereichsdatei nicht und liest sie als "keine Verknuepfung"', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    const kaputt = '{ kein gueltiges JSON';
    fs.writeFileSync(mddaPath(root), kaputt, 'utf8');

    expect(await cfg.readAreaLinks(root)).toEqual([]);
    const ergebnis = await cfg.writeAreaLinks(root, [{ prefix: 'zt', path: abs('Zentral') }]);
    expect(ergebnis.ok).toBe(false);
    expect(fs.readFileSync(mddaPath(root), 'utf8')).toBe(kaputt);
  });

  it('verwirft beim Schreiben, was das Modell verwirft', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaLinks(root, [
      { prefix: 'gut', path: abs('Zentral') },
      { prefix: 'a:b', path: abs('Zentral') }, // unzulaessiges Kuerzel
      { prefix: 'rel', path: 'Zentral' }, // relativer Pfad
      { prefix: 'ich', path: root }, // Verknuepfung mit sich selbst
    ]);
    expect(await cfg.readAreaLinks(root)).toEqual([
      { prefix: 'gut', path: abs('Zentral'), templates: false },
    ]);
  });
});
