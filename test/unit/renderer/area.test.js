// @vitest-environment jsdom
// 4T-0323/4T-0324 (Epic 3E-0058): Unit-Tests der Renderer-Bereichs-Logik
// (src/renderer/modules/area.js) — Innerhalb-Vorprüfung, lokaler
// Ziel-Resolver und der Außen-Link-Marker im gerenderten DOM.
import { describe, it, expect, afterEach } from 'vitest';
import './api-stub.js';

const area = await import('../../../src/renderer/modules/area.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const DOC = 'C:\\Daten\\Notizen\\Sub\\doku.md';

afterEach(() => {
  state.areaPath = null;
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
