// @vitest-environment jsdom
// 4T-0323/4T-0324 (Epic 3E-0058): Unit-Tests der Renderer-Bereichs-Logik
// (src/renderer/modules/area.js) — Innerhalb-Vorprüfung, lokaler
// Ziel-Resolver und der Außen-Link-Marker im gerenderten DOM.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import './api-stub.js';

const area = await import('../../../src/renderer/modules/area.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { setPlatformForTests } = await import('../../../src/shared/platform.js');

const DOC = 'C:\\Daten\\Notizen\\Sub\\doku.md';

// 4T-1225: Die Pfad-Funktionen sind plattformabhängig geworden; die
// Bestands-Erwartungen unten beschreiben das Windows-Verhalten und werden
// deshalb ausdrücklich auf win32 gepinnt, damit die Suite auch auf einer
// Linux-Maschine dieselben Fälle prüft.
beforeEach(() => {
  setPlatformForTests('win32');
});

afterEach(() => {
  state.areaPath = null;
  setPlatformForTests(undefined);
});

describe('isOutsideActiveArea (4T-0323)', () => {
  it('ohne aktiven Bereich liegt nichts außerhalb', () => {
    state.areaPath = null;
    expect(area.isOutsideActiveArea('D:\\woanders\\x.md')).toBe(false);
  });

  it('erkennt innen und außen, case-insensitiv und Trenner-tolerant', () => {
    state.areaPath = 'C:\\Daten\\Notizen';
    expect(area.isOutsideActiveArea('c:/daten/notizen/sub/a.md')).toBe(false);
    expect(area.isOutsideActiveArea('C:\\Daten\\Notizen2\\a.md')).toBe(true);
    expect(area.isOutsideActiveArea('D:\\Daten\\Notizen\\a.md')).toBe(true);
  });
});

describe('resolveLocalTarget (4T-0324)', () => {
  it('löst relative Ziele gegen den Dokument-Ordner auf', () => {
    expect(area.resolveLocalTarget(DOC, 'nachbar.md')).toBe('C:\\Daten\\Notizen\\Sub\\nachbar.md');
    expect(area.resolveLocalTarget(DOC, '../oben.md')).toBe('C:\\Daten\\Notizen\\oben.md');
    expect(area.resolveLocalTarget(DOC, '../../../raus.md')).toBe('C:\\raus.md');
    expect(area.resolveLocalTarget(DOC, './hier/tiefer.md')).toBe(
      'C:\\Daten\\Notizen\\Sub\\hier\\tiefer.md',
    );
  });

  it('behandelt absolute Pfade, Anker und URI-Encoding', () => {
    expect(area.resolveLocalTarget(DOC, 'D:/extern/x.md')).toBe('D:\\extern\\x.md');
    expect(area.resolveLocalTarget(DOC, 'ziel.md#abschnitt')).toBe(
      'C:\\Daten\\Notizen\\Sub\\ziel.md',
    );
    expect(area.resolveLocalTarget(DOC, 'mit%20leerzeichen.md')).toBe(
      'C:\\Daten\\Notizen\\Sub\\mit leerzeichen.md',
    );
  });

  it('liefert null für URLs, reine Anker und leere Ziele', () => {
    expect(area.resolveLocalTarget(DOC, 'https://example.org/x.md')).toBeNull();
    expect(area.resolveLocalTarget(DOC, 'mailto:a@example.org')).toBeNull();
    expect(area.resolveLocalTarget(DOC, '#nur-anker')).toBeNull();
    expect(area.resolveLocalTarget(DOC, '')).toBeNull();
    expect(area.resolveLocalTarget(null, 'x.md')).toBeNull();
  });
});

describe('markOutsideAreaLinks (4T-0324)', () => {
  it('markiert Außen-Links mit Klasse und Pfad-Tooltip, Innen-Links nicht', () => {
    state.areaPath = 'C:\\Daten\\Notizen';
    const container = document.createElement('div');
    container.innerHTML =
      '<a id="innen" href="nachbar.md">innen</a>' +
      '<a id="aussen" href="../../raus.md">außen</a>' +
      '<a id="web" href="https://example.org">web</a>' +
      '<a id="anker" href="#abschnitt">anker</a>' +
      '<a id="wiki" class="wikilink" href="../../WikiRaus">wiki</a>';
    area.markOutsideAreaLinks(container, DOC);
    expect(container.querySelector('#innen').classList.contains('outside-area-link')).toBe(false);
    const aussen = container.querySelector('#aussen');
    expect(aussen.classList.contains('outside-area-link')).toBe(true);
    // Ohne geladenes Woerterbuch liefert t() den Key — der Tooltip muss
    // gesetzt sein; der Pfad-Inhalt wird ueber resolveLocalTarget getestet.
    expect(aussen.title).toBeTruthy();
    expect(container.querySelector('#web').classList.contains('outside-area-link')).toBe(false);
    expect(container.querySelector('#anker').classList.contains('outside-area-link')).toBe(false);
    // Wiki-Link ohne Endung wird als .md aufgelöst.
    const wiki = container.querySelector('#wiki');
    expect(wiki.classList.contains('outside-area-link')).toBe(true);
  });

  it('ohne aktiven Bereich ein No-op', () => {
    state.areaPath = null;
    const container = document.createElement('div');
    container.innerHTML = '<a href="../../raus.md">außen</a>';
    area.markOutsideAreaLinks(container, DOC);
    expect(container.querySelector('a').classList.contains('outside-area-link')).toBe(false);
  });
});

// 4T-1225 (Epic 3E-0122, Befund F2 des Linux-Lauffaehigkeits-Nachweises):
// dieselben Funktionen unter Linux — Trenner ist der Schraegstrich, die
// Schreibweise unterscheidet, und unter Windows geschriebene Links
// funktionieren nach dem Umzug weiter (Migrations-Abwaegung im Modul).
describe('Pfad-Funktionen unter Linux (4T-1225)', () => {
  const DOC_LX = '/daten/notizen/sub/doku.md';

  beforeEach(() => {
    setPlatformForTests('linux');
  });

  it('normalizeForCompare laesst Schreibweise und Backslashes unangetastet', () => {
    expect(area.normalizeForCompare('/Daten/Notizen/')).toBe('/Daten/Notizen');
    expect(area.normalizeForCompare('/a/Mit\\Backslash')).toBe('/a/Mit\\Backslash');
  });

  it('isOutsideActiveArea entscheidet case-sensitiv', () => {
    state.areaPath = '/daten/notizen';
    expect(area.isOutsideActiveArea('/daten/notizen/sub/a.md')).toBe(false);
    // Nur in der Schreibweise verschieden: unter Linux ein anderer Ort.
    expect(area.isOutsideActiveArea('/daten/Notizen/a.md')).toBe(true);
    expect(area.isOutsideActiveArea('/daten/notizen2/a.md')).toBe(true);
  });

  it('resolveLocalTarget loest mit Schraegstrich auf, auch fuer Windows-Links', () => {
    expect(area.resolveLocalTarget(DOC_LX, 'nachbar.md')).toBe('/daten/notizen/sub/nachbar.md');
    expect(area.resolveLocalTarget(DOC_LX, '../oben.md')).toBe('/daten/notizen/oben.md');
    // Unter Windows geschriebener Link nach dem Umzug (Migrations-Fall).
    expect(area.resolveLocalTarget(DOC_LX, '..\\oben.md')).toBe('/daten/notizen/oben.md');
    expect(area.resolveLocalTarget(DOC_LX, '/etc/x.md')).toBe('/etc/x.md');
  });
});
