// @vitest-environment jsdom
// 4T-001906 (Epic 3E-000318): Prüffälle «Archiv der Tafel», Bedien-Hälfte —
// Archivieren über das Kontextmenü der Karte und über das Kommando, das erste
// Archiv mit der Überschrift der Sprache, ein fremdes Archiv weitergeführt, die
// Obergrenze, genau ein Rückgängig-Schritt, die Auswahl danach, keine Wirkung
// ohne Wahl und im nicht änderbaren Dokument, und das Kommando über alle
// Zugänge.
//
// **Gemessen wird an der Einbettung** (Muster kanban-termin.test.js): Die
// Zusage «eine Handlung, ein Rückgängig-Schritt» hängt am Zusammenspiel aus
// Bedienung, Zeichnung und Schreibweg. Der Editor der Spalte ist eine Attrappe,
// die den Zeilen-Bereich wirklich anwendet und eine Historie voller Stände
// führt. Die Übersetzung ist nachgestellt und liest die gebauten Sprachdateien,
// damit die Überschrift eines neuen Archivs je Sprache messbar ist; der Hinweis
// in der Statusleiste ist nachgestellt, weil er am ganzen Fenster hängt.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import { ARCHIV_OBERGRENZE } from '../../../src/shared/kanban/kanban-archiv.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import { KARTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';
import { archivAngaben } from '../../../src/renderer/modules/kanban/kanban-archivieren.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const cjs = createRequire(import.meta.url);
const STUFE2 = lies('test/fixtures/kanban/tafel-stufe-2.md');
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const WOERTERBUCH = Object.fromEntries(
  SPRACHEN.map((code) => [code, JSON.parse(lies(`src/i18n/${code}.json`))]),
);

const { sprache, showStatusbarHint } = vi.hoisted(() => ({
  sprache: { aktuell: null },
  showStatusbarHint: vi.fn(),
}));
// Ohne gewählte Sprache antwortet die Übersetzung mit dem Schlüssel — der Stand
// der übrigen Tafel-Prüffälle, in denen kein Wörterbuch geladen ist.
vi.mock('../../../src/renderer/i18n.js', async (original) => ({
  ...(await original()),
  t: (key) => (sprache.aktuell ? WOERTERBUCH[sprache.aktuell][key] : undefined) ?? key,
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({ showStatusbarHint }));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
};
const { initKanbanPane, renderKanban, archiviereKanbanKarte } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');

const KOPF = '---\nkanban-plugin: board\n---\n';
const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte',
  '\tEine eingerückte Folgezeile',
  '- [ ] Zweite Karte 📅 2099-01-01',
  '',
  '## Erledigt',
  '',
  '**Complete**',
  '- [x] Dritte Karte',
  '',
].join('\n');
// Der Zeitpunkt aller Archivierungen dieser Datei, in lokaler Zeit.
const JETZT = new Date(2026, 8, 23, 14, 5);
const STEMPEL = '2026-09-23 14:05';

function baueSpalte(text, optionen = {}) {
  const tab = { content: text, viewMode: 'kanban', path: 'C:/Notizen/Tafel.md', editMode: true };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], menues: [] };
  const zurueck = [];
  initKanbanPane({
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    schreibeDokument: (_i, { vonZeile, bisZeile, text: neu }) => {
      protokoll.schreibvorgaenge.push({ vonZeile, bisZeile, text: neu });
      zurueck.push(tab.content);
      const zeilen = tab.content.split('\n');
      tab.content = [
        ...zeilen.slice(0, vonZeile - 1),
        ...neu.split('\n'),
        ...zeilen.slice(bisZeile),
      ].join('\n');
      return true;
    },
    rueckgaengig: () => {
      if (zurueck.length === 0) return false;
      tab.content = zurueck.pop();
      renderKanban(0);
      return true;
    },
    zeigeKontextmenue: (_i, daten) => protokoll.menues.push(daten),
    schliesseKontextmenue: () => {},
  });
  renderKanban(0);
  return { tab, container, protokoll };
}

const karten = (c) => [...c.querySelectorAll(`.${KARTE_KLASSE}`)];
const gewaehlt = (c) => c.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);

function menue(container, protokoll, karteEl) {
  karteEl.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
  return protokoll.menues[protokoll.menues.length - 1].eintraege;
}

function archiviereUeberMenue(container, protokoll, karteEl) {
  const eintrag = menue(container, protokoll, karteEl).find(
    (e) => e.dataId === 'kanban-card-archive',
  );
  return eintrag.action();
}

function waehle(karteEl) {
  karteEl.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
}

function rueckgaengig(container) {
  container.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
  );
}

// Der Text hinter der Trennlinie des Archivs.
const archivTeil = (text) => text.slice(text.indexOf('\n***\n') + 1);

beforeEach(() => {
  document.body.innerHTML = '';
  sprache.aktuell = null;
  showStatusbarHint.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(JETZT);
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Archivieren über Kontextmenü und Kommando ----------------------------------------

describe('Karte archivieren über Kontextmenü und Kommando (4T-001906, AK1 bis AK3)', () => {
  const ERWARTET = [
    KOPF,
    '## Offen',
    '',
    '- [ ] Zweite Karte 📅 2099-01-01',
    '',
    '## Erledigt',
    '',
    '**Complete**',
    '- [x] Dritte Karte',
    '',
    '***',
    '',
    '## Archive',
    '',
    `- [ ] ${STEMPEL} Erste Karte`,
    '\tEine eingerückte Folgezeile',
    '',
  ].join('\n');

  it('der Eintrag steht hinter den Termin-Einträgen und vor «Karte löschen»', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    const eintraege = menue(container, protokoll, karten(container)[0]);
    const ids = eintraege.map((e) => e.dataId);
    expect(ids).toEqual([
      'kanban-card-edit',
      'kanban-card-set-date',
      'kanban-card-archive',
      'kanban-card-delete',
    ]);
    expect(eintraege[2].label).toBe('kanban.karteArchivieren');
  });

  it('AK1 bis AK3: über das Kontextmenü — Karte weg, im neuen Archiv mit Zeitstempel und Folgezeile', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    expect(archiviereUeberMenue(container, protokoll, karten(container)[0])).toBe(true);
    expect(tab.content).toBe(ERWARTET);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
  });

  it('AK1: über das Kommando wirkt es auf die gewählte Karte, mit demselben Ergebnis', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    waehle(karten(container)[0]);
    expect(archiviereKanbanKarte(0)).toBe(true);
    expect(tab.content).toBe(ERWARTET);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
  });

  it('AK1/AK8: die Karte verschwindet aus ihrer Spalte, das Archiv erscheint nicht auf der Tafel', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    archiviereUeberMenue(container, protokoll, karten(container)[0]);
    expect(container.querySelectorAll('.kanban-spalte')).toHaveLength(2);
    expect(karten(container)).toHaveLength(2);
    expect(container.textContent).not.toContain('Erste Karte');
    expect(container.textContent).not.toContain('Archive');
    // Der Zähler der Spalte zieht nach: von zwei auf eine Karte.
    expect(container.querySelector('.kanban-spalte-zaehler').textContent).toBe('1');
  });

  it('der Zeitstempel ist die lokale Zeit in der Form YYYY-MM-DD HH:mm', () => {
    expect(archivAngaben((k) => k, new Date(2026, 0, 5, 7, 3)).zeitstempel).toBe(
      '2026-01-05 07:03',
    );
    expect(archivAngaben((k) => k, new Date(2026, 11, 31, 23, 59)).zeitstempel).toBe(
      '2026-12-31 23:59',
    );
  });

  it('ein fremder Vorbild-Termin wandert unverändert mit ins Archiv', () => {
    const { tab, container, protokoll } = baueSpalte(STUFE2);
    const karte = container.querySelector('.kanban-spalte').querySelector(`.${KARTE_KLASSE}`);
    archiviereUeberMenue(container, protokoll, karte);
    expect(archivTeil(tab.content)).toContain(
      `- [ ] ${STEMPEL} Angebot prüfen #kunde @{2026-10-01} @@{14:00}`,
    );
    expect(tab.content).not.toContain('📅 2026-10-01 14:00');
  });
});

// --- Überschrift je Sprache ----------------------------------------------------------

describe('Überschrift eines neuen Archivs je Sprache (4T-001906, AK2)', () => {
  // Die Wörter, die das Vorbild-Werkzeug selbst schreibt und wiedererkennt;
  // Französisch und Spanisch fallen dort auf das englische Wort zurück.
  const WORT = { de: 'Archiv', en: 'Archive', fr: 'Archive', es: 'Archive', it: 'Archivio' };

  for (const code of SPRACHEN) {
    it(`${code}: «## ${WORT[code]}»`, () => {
      sprache.aktuell = code;
      expect(WOERTERBUCH[code]['kanban.archivUeberschrift']).toBe(WORT[code]);
      const { tab, container, protokoll } = baueSpalte(TAFEL);
      archiviereUeberMenue(container, protokoll, karten(container)[1]);
      expect(archivTeil(tab.content)).toBe(
        `***\n\n## ${WORT[code]}\n\n- [ ] ${STEMPEL} Zweite Karte 📅 2099-01-01\n`,
      );
    });
  }

  it('ohne geladenes Wörterbuch steht das Wort des Vorbilds, nie der Schlüssel', () => {
    expect(archivAngaben((k) => k, JETZT)).toEqual({ zeitstempel: STEMPEL });
    expect(archivAngaben(() => '', JETZT)).toEqual({ zeitstempel: STEMPEL });
    expect(archivAngaben((k) => WOERTERBUCH.de[k], JETZT)).toEqual({
      zeitstempel: STEMPEL,
      ueberschrift: 'Archiv',
    });
  });
});

// --- Vorhandenes Archiv und Obergrenze -------------------------------------------------

describe('Vorhandenes Archiv und Obergrenze (4T-001906, AK4/AK5)', () => {
  it('AK5: ein fremdes Archiv wird mit seiner Überschrift weitergeführt, der Einstellungs-Block bleibt byte-gleich', () => {
    sprache.aktuell = 'de';
    const { tab, container, protokoll } = baueSpalte(STUFE2);
    // Spalte «Fertig», Karte «Abgeschlossen» samt Folgezeile.
    const karte = container.querySelectorAll('.kanban-spalte')[3].querySelector(`.${KARTE_KLASSE}`);
    archiviereUeberMenue(container, protokoll, karte);
    const block = (text) => text.slice(text.indexOf('%% kanban:settings'));
    expect(block(tab.content)).toBe(block(STUFE2));
    expect(archivTeil(tab.content)).toBe(
      [
        '***',
        '',
        '## Archive',
        '',
        '- [x] 2026-09-20 09:00 Alte Karte #intern',
        '- [ ] Zweite alte Karte',
        '    mit Folgezeile',
        `- [x] ${STEMPEL} Abgeschlossen`,
        '    mit Folgezeile',
        '',
        'Eine Prosa-Zeile im Archiv.',
        '',
        '',
        block(STUFE2),
      ].join('\n'),
    );
    expect(tab.content).not.toContain('## Archiv\n');
    // AK8: Auch das vorhandene Archiv erscheint nicht auf der Tafel — vier
    // Spalten, keine Karte daraus.
    expect(container.querySelectorAll('.kanban-spalte')).toHaveLength(4);
    expect(container.textContent).not.toContain('Alte Karte');
    expect(container.textContent).not.toContain('Abgeschlossen');
  });

  it('AK4: an der Obergrenze fällt die älteste Karte samt Folgezeile heraus', () => {
    expect(ARCHIV_OBERGRENZE).toBe(100);
    const alt = [];
    for (let i = 1; i <= 100; i++) {
      alt.push(`- [x] 2026-01-01 08:00 Alt ${i}`);
      if (i === 1) alt.push('\tFolgezeile der ältesten');
    }
    const text = [TAFEL.trimEnd(), '', '***', '', '## Archiv', '', ...alt, ''].join('\n');
    const { tab, container, protokoll } = baueSpalte(text);
    archiviereUeberMenue(container, protokoll, karten(container)[1]);
    const archiv = leseTafel(tab.content).archiv;
    expect(archiv.karten).toHaveLength(100);
    expect(tab.content).not.toContain('Alt 1\n');
    expect(tab.content).not.toContain('Folgezeile der ältesten');
    expect(tab.content).toContain('- [x] 2026-01-01 08:00 Alt 2\n');
    expect(
      archivTeil(tab.content).trimEnd().endsWith(`- [ ] ${STEMPEL} Zweite Karte 📅 2099-01-01`),
    ).toBe(true);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
  });
});

// --- Rückgängig und Auswahl --------------------------------------------------------------

describe('Rückgängig und Auswahl danach (4T-001906, AK6)', () => {
  it('AK6: genau ein Schritt, Strg+Z stellt Karte und Archiv byte-gleich her', () => {
    const { tab, container, protokoll } = baueSpalte(STUFE2);
    const karte = container.querySelectorAll('.kanban-spalte')[3].querySelector(`.${KARTE_KLASSE}`);
    archiviereUeberMenue(container, protokoll, karte);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    rueckgaengig(container);
    expect(tab.content).toBe(STUFE2);
  });

  it('AK6: auch das erstmals angelegte Archiv verschwindet mit dem einen Schritt', () => {
    const { tab, container } = baueSpalte(TAFEL);
    waehle(karten(container)[0]);
    archiviereKanbanKarte(0);
    rueckgaengig(container);
    expect(tab.content).toBe(TAFEL);
    expect(karten(container)).toHaveLength(3);
  });

  it('die Auswahl rückt auf die nächste Karte der Spalte', () => {
    const { container } = baueSpalte(TAFEL);
    waehle(karten(container)[0]);
    archiviereKanbanKarte(0);
    expect(gewaehlt(container).textContent).toContain('Zweite Karte');
  });

  it('war sie die letzte der Spalte, wird die vorige gewählt', () => {
    const { container } = baueSpalte(TAFEL);
    waehle(karten(container)[1]);
    archiviereKanbanKarte(0);
    expect(gewaehlt(container).textContent).toContain('Erste Karte');
  });

  it('war sie die einzige der Spalte, bleibt die Tafel ohne Auswahl', () => {
    const { container } = baueSpalte(TAFEL);
    waehle(karten(container)[2]);
    archiviereKanbanKarte(0);
    expect(gewaehlt(container)).toBeNull();
  });
});

// --- Ohne Wahl und nicht änderbar ------------------------------------------------------

describe('Ohne Wahl und im nicht änderbaren Dokument (4T-001906, AK7)', () => {
  it('ohne gewählte Karte bleibt das Kommando ohne Wirkung', () => {
    const { tab, protokoll } = baueSpalte(TAFEL);
    expect(archiviereKanbanKarte(0)).toBe(false);
    expect(tab.content).toBe(TAFEL);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });

  it('AK7: im nicht änderbaren Dokument kein Menü, und das Kommando schreibt nicht', async () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    karten(container)[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    expect(protokoll.menues).toHaveLength(0);
    waehle(karten(container)[0]);
    expect(archiviereKanbanKarte(0)).toBe(false);
    expect(tab.content).toBe(TAFEL);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    await vi.waitFor(() =>
      expect(showStatusbarHint).toHaveBeenCalledWith('kanban.nurLesbar', expect.any(Object)),
    );
  });

  it('außerhalb der Tafel-Ansicht ein Hinweis statt einer Handlung', async () => {
    const { tab, container } = baueSpalte(TAFEL);
    waehle(karten(container)[0]);
    tab.viewMode = 'rendered';
    expect(archiviereKanbanKarte(0)).toBe(false);
    expect(tab.content).toBe(TAFEL);
    await vi.waitFor(() =>
      expect(showStatusbarHint).toHaveBeenCalledWith('kanban.nurInAnsicht', expect.any(Object)),
    );
  });
});

// --- Verdrahtung über alle Zugänge ------------------------------------------------------

describe('Kommando «Karte auf der Tafel archivieren» über alle Zugänge (4T-001906, AK9)', () => {
  it('steht in der Registry, ohne Vorgabe-Kürzel, verfügbar an der offenen Tafel', () => {
    const { COMMANDS } = cjs('../../../src/shared/commands/commands.js');
    const cmd = COMMANDS.find((c) => c.id === 'kanban.archiveCard');
    expect(cmd).toMatchObject({
      defaultBindings: [],
      labelKey: 'command.kanban.archiveCard',
      menu: true,
      editorScoped: false,
      availability: 'tafelKarte',
    });
  });

  it('Menü, Brücke, Bindung und Dispatcher tragen es durchgängig', () => {
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("unless('kanban.archiveCard', {");
    expect(menu).toContain("send('menu:kanbanArchiveCard')");
    expect(menu).toContain("acc('kanban.archiveCard')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:kanbanArchiveCard'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuKanbanArchiveCard(() => archiviereKanbanKarte(state.activePaneIndex))',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'kanban.archiveCard': () => archiviereKanbanKarte(state.activePaneIndex)",
    );
  });

  it('AK9: die Erweiterung «Kanban» nimmt es im Aus-Zustand mit', () => {
    expect(extensionById('kanban').commands).toContain('kanban.archiveCard');
    expect(disabledCommandIdSet(['kanban']).has('kanban.archiveCard')).toBe(true);
    expect(disabledCommandIdSet([]).has('kanban.archiveCard')).toBe(false);
  });

  it('AK9: die neuen Texte stehen in allen fünf Sprachen', () => {
    const schluessel = [
      'command.kanban.archiveCard',
      'kanban.karteArchivieren',
      'kanban.archivUeberschrift',
    ];
    for (const code of SPRACHEN) {
      for (const key of schluessel) {
        expect(WOERTERBUCH[code][key], `${key} fehlt in ${code}`).toBeTruthy();
      }
    }
  });

  it('das Bedien-Modul bleibt frei von Renderer-Zustand', () => {
    // Injektions-Bauweise wie die Nachbarn im Ordner: nur der prozessneutrale
    // Bestand, sonst zöge der Ordner in den eingefrorenen Datei-Zyklus.
    const quelle = lies('src/renderer/modules/kanban/kanban-archivieren.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege).toEqual([
      '../../../shared/kanban/kanban-archiv.js',
      '../../../shared/commands/command-bindings.js',
    ]);
  });
});
