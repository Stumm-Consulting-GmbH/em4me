// @vitest-environment jsdom
// 4T-1326 (Epic 3E-0236): Prüffälle der Plausibilitäts-Prüfung beider
// Journal-Blöcke.
//
// Der Gegenstand ist eine Schutz-Maßnahme, und die eigentliche Frage an sie
// lautet nicht «meldet sie?», sondern «meldet sie das Richtige und schweigt
// sie sonst?». Ein Wächter, der im Normalfall anschlägt, wird abgeschaltet
// oder überlesen und schützt danach nichts mehr. Die Fälle unten decken
// deshalb beide Richtungen ab, und der Fall «außerhalb einer Spalte» ist
// bewusst als Schweigen formuliert.
import { beforeEach, describe, expect, it } from 'vitest';
import './renderer/api-stub.js';

const { state } = await import('../../src/renderer/modules/app/app-state.js');
const { pfadDerSpalte, pruefeBlockPfad, zeigeBlockFehler } =
  await import('../../src/renderer/modules/calendar/journal-pfad-pruefung.js');

const EINTRAG = 'C:\\Bereich\\Tagebuch\\2026\\2026-08\\2026-08-30.md';
const FREMD = 'C:\\Bereich\\Tagebuch\\2026\\2026-08\\2026-08-31.md';

// Baut eine Spalte mit einem Block darin und meldet den Block.
function spalteMitBlock(pfadDesReiters, paneAttr = '0') {
  document.body.innerHTML = `
    <div class="pane-group" data-pane="${paneAttr}">
      <div class="perspective-journal-nav"></div>
    </div>`;
  state.panes = [{ activeIndex: 0, tabs: [{ path: pfadDesReiters }] }];
  return document.querySelector('.perspective-journal-nav');
}

beforeEach(() => {
  document.body.innerHTML = '';
  state.panes = [];
  // Voreinstellung: Der Eintrag existiert. Einzelne Fälle setzen das um.
  window.api.journalsStatEntry = async () => ({ ok: true, exists: true });
});

describe('pfadDerSpalte: die zweite, unabhängige Quelle', () => {
  it('meldet den Pfad des aktiven Reiters der umgebenden Spalte', async () => {
    const el = spalteMitBlock(EINTRAG);
    expect(await pfadDerSpalte(el)).toBe(EINTRAG);
  });

  it('meldet null außerhalb einer Spalte — dort gibt es keine zweite Quelle', async () => {
    document.body.innerHTML = '<div class="perspective-journal-nav"></div>';
    state.panes = [{ activeIndex: 0, tabs: [{ path: EINTRAG }] }];
    expect(await pfadDerSpalte(document.querySelector('.perspective-journal-nav'))).toBeNull();
  });

  it('meldet null, wenn die Spalte keinen aktiven Reiter hat', async () => {
    const el = spalteMitBlock(EINTRAG);
    state.panes[0].activeIndex = -1;
    expect(await pfadDerSpalte(el)).toBeNull();
  });
});

describe('pruefeBlockPfad: Übereinstimmung', () => {
  it('schweigt, wenn der Block über den Eintrag spricht, in dem er steht', async () => {
    const el = spalteMitBlock(EINTRAG);
    await expect(
      pruefeBlockPfad(el, EINTRAG, 'Tagebuch/2026/2026-08/2026-08-30.md'),
    ).resolves.toEqual({ ok: true });
  });

  it('meldet, wenn der Block den Pfad eines fremden Eintrags trägt', async () => {
    // Genau der Befund vom 2026-08-31: Der Reiter zeigt den 30., der Block
    // rechnet mit dem 31.
    const el = spalteMitBlock(EINTRAG);
    const urteil = await pruefeBlockPfad(el, FREMD, 'Tagebuch/2026/2026-08/2026-08-31.md');
    expect(urteil.ok).toBe(false);
    expect(String(urteil.text || '')).not.toBe('');
  });

  it('vergleicht über die Datei-Identitäts-Faltung der Plattform', async () => {
    // Ob Groß- und Kleinschreibung zählt, entscheidet das Dateisystem, nicht
    // die Anwendung (Lehre aus 1.121.3: Datei-Identität vs. logischer
    // Namensraum). Der Fall behauptet deshalb kein Windows-Verhalten, sondern
    // prüft die Kopplung an pathCompareKey: Faltet die Plattform die beiden
    // Schreibweisen zusammen, schweigt die Prüfung; hält sie sie auseinander
    // (Linux), sind es zwei verschiedene Dateien, und die Meldung ist richtig.
    const { pathCompareKey } = await import('../../src/shared/platform.js');
    const gefaltet = pathCompareKey(EINTRAG) === pathCompareKey(EINTRAG.toLowerCase());
    const el = spalteMitBlock(EINTRAG);
    const urteil = await pruefeBlockPfad(
      el,
      EINTRAG.toLowerCase(),
      'Tagebuch/2026/2026-08/2026-08-30.md',
    );
    expect(urteil.ok).toBe(gefaltet);
  });

  it('schweigt außerhalb einer Spalte, statt einen Fehlalarm zu erzeugen', async () => {
    // Vorschau-Fläche, Seitenausgabe, portabler Export: keine zweite Quelle.
    document.body.innerHTML = '<div class="perspective-journal-nav"></div>';
    state.panes = [{ activeIndex: 0, tabs: [{ path: EINTRAG }] }];
    const el = document.querySelector('.perspective-journal-nav');
    await expect(
      pruefeBlockPfad(el, FREMD, 'Tagebuch/2026/2026-08/2026-08-31.md'),
    ).resolves.toEqual({ ok: true });
  });
});

describe('pruefeBlockPfad: Existenz', () => {
  it('meldet einen Eintrag, der nicht mehr vorhanden ist', async () => {
    const el = spalteMitBlock(EINTRAG);
    window.api.journalsStatEntry = async () => ({ ok: true, exists: false });
    const urteil = await pruefeBlockPfad(el, EINTRAG, 'Tagebuch/2026/2026-08/2026-08-30.md');
    expect(urteil.ok).toBe(false);
    expect(String(urteil.text || '')).not.toBe('');
  });

  it('schweigt, wenn die Auskunft selbst scheitert — kein Beleg für Abwesenheit', async () => {
    const el = spalteMitBlock(EINTRAG);
    window.api.journalsStatEntry = async () => {
      throw new Error('IPC weg');
    };
    await expect(
      pruefeBlockPfad(el, EINTRAG, 'Tagebuch/2026/2026-08/2026-08-30.md'),
    ).resolves.toEqual({ ok: true });
  });
});

describe('zeigeBlockFehler', () => {
  it('ersetzt den Inhalt und macht die Meldung für Hilfsmittel als Warnung kenntlich', () => {
    const el = spalteMitBlock(EINTRAG);
    el.innerHTML = '<div class="journal-nav-current">alte Navigation</div>';
    zeigeBlockFehler(el, 'Meldungstext');
    expect(el.querySelector('.journal-nav-current')).toBeNull();
    const box = el.querySelector('.journal-block-fehler');
    expect(box).not.toBeNull();
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.textContent).toBe('Meldungstext');
  });
});
