// @vitest-environment jsdom
// 4T-001955 (Epic 3E-000319): Prüffälle «Einstellungen dieser Tafel…» — der
// Dialog am Bedienweg der Einbettung: drei Zustände je Schalter samt
// Herkunfts-Anzeige, eigene Werte, Zurücksetzen auf «wie Vorgabe», die
// Feldwahl-Liste, ein Rückgängig-Schritt je Übernehmen, nichts geändert →
// nichts geschrieben, geändertes Dokument → Hinweis, nicht änderbares Dokument,
// Zielordner und Vorlage über die Auswahl der Anwendung, das Archivieren nach
// der Kette und die Zugänge.
//
// **Gemessen wird an der Einbettung** (Muster kanban-archivieren.test.js): Der
// Editor der Spalte ist eine Attrappe, die den Zeilen-Bereich wirklich
// anwendet und eine Historie führt. Die Übersetzung liest die gebauten
// Sprachdateien, damit der Vorgabe-Wert in der Klammer messbar ist.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import { leseTafelEinstellungen } from '../../../src/shared/kanban/kanban-einstellungen.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import { KANBAN_VORGABEN } from '../../../src/shared/kanban-anzeige.js';
import { KARTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const DE = JSON.parse(lies('src/i18n/de.json'));

const { showStatusbarHint, pickTemplateEntry } = vi.hoisted(() => ({
  showStatusbarHint: vi.fn(),
  pickTemplateEntry: vi.fn(),
}));
vi.mock('../../../src/renderer/i18n.js', async (original) => ({
  ...(await original()),
  t: (key) => DE[key] ?? key,
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({ showStatusbarHint }));
vi.mock('../../../src/renderer/modules/templates.js', () => ({ pickTemplateEntry }));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
  templatesChooseFolder: vi.fn(),
  relative: (von, nach) => path.posix.relative(von, nach),
  dirname: (p) => path.posix.dirname(p),
};
const { initKanbanPane, renderKanban, oeffneKanbanTafelEinstellungen, wendeTafelEinstellungenAn } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
// Nach dem Stub geladen: api.js bindet window.api beim ersten Import.
const { uebernimmKanbanAnzeige } =
  await import('../../../src/renderer/modules/kanban/kanban-anzeige-schalter.js');
const { geaenderteEinstellungen } =
  await import('../../../src/renderer/modules/kanban/kanban-einstellungs-dialog.js');

const TAFEL = [
  '---',
  'kanban-plugin: board',
  '---',
  '',
  '## Offen',
  '',
  '- [ ] Erste Karte #tag',
  '- [ ] Zweite Karte',
  '',
].join('\n');
const BLOCK = (json) => `\n%% kanban:settings\n\`\`\`\n${json}\n\`\`\`\n%%\n`;

function baueSpalte(text, optionen = {}) {
  const tab = {
    content: text,
    viewMode: 'kanban',
    path: '/Bereich/Tafeln/Tafel.md',
    editMode: true,
  };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], menues: [] };
  const zurueck = [];
  initKanbanPane({
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    bereichsWurzel: () => (optionen.ohneBereich ? null : '/Bereich'),
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
  return { tab, container, protokoll, zurueck };
}

// Öffnet den Dialog und liefert Zugriff auf ihn und auf das Ergebnis.
async function oeffne() {
  const ergebnis = oeffneKanbanTafelEinstellungen(0);
  await Promise.resolve();
  const modal = document.querySelector('.kanban-einstellungen-modal');
  return { ergebnis, modal };
}
const auswahl = (modal, name) => modal.querySelector(`#kanban-einstellung-${name}`);
function setze(el, wert) {
  el.value = wert;
  el.dispatchEvent(new window.Event('change'));
}
const knopf = (modal, aktion) => modal.querySelector(`[data-aktion="${aktion}"]`);
const warte = () => new Promise((r) => setTimeout(r, 0));
const werte = (text) => leseTafelEinstellungen(text).werte;

beforeEach(() => {
  document.body.innerHTML = '';
  showStatusbarHint.mockReset();
  pickTemplateEntry.mockReset();
  window.api.templatesChooseFolder.mockReset();
  for (const v of KANBAN_VORGABEN) uebernimmKanbanAnzeige(v.schluessel, v.vorgabe);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 9, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Drei Zustände und Herkunft ------------------------------------------------------

describe('Dialog: drei Zustände je Schalter und die Herkunft (AK2, AK3)', () => {
  it('ohne Einstellung der Tafel steht jeder Schalter auf «wie Vorgabe (…)» mit dem Vorgabe-Wert', async () => {
    uebernimmKanbanAnzeige('kanban.tagsAmFuss', true);
    baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    expect(modal).toBeTruthy();
    const tags = auswahl(modal, 'tagsAmFuss');
    expect(tags.value).toBe('vorgabe');
    expect([...tags.options].map((o) => o.textContent)).toEqual(['wie Vorgabe (an)', 'an', 'aus']);
    expect(auswahl(modal, 'termineRelativ').options[0].textContent).toBe('wie Vorgabe (aus)');
    expect(auswahl(modal, 'archivMitZeitstempel').options[0].textContent).toBe('wie Vorgabe (an)');
    expect(auswahl(modal, 'archivObergrenze').options[0].textContent).toBe('wie Vorgabe (100)');
    expect(auswahl(modal, 'zielordner').options[0].textContent).toBe(
      'wie Vorgabe (Ordner der Tafel)',
    );
    expect(auswahl(modal, 'vorlage').options[0].textContent).toBe(
      'wie Vorgabe (Auswahl beim Erzeugen)',
    );
    expect(auswahl(modal, 'feldwahl').options[0].textContent).toBe('wie Vorgabe (keine Angaben)');
    knopf(modal, 'abbrechen').click();
    expect(await ergebnis).toBe(false);
    expect(document.querySelector('.kanban-einstellungen-modal')).toBeNull();
  });

  it('eine gesetzte Einstellung zeigt ihren eigenen Wert, nicht die Vorgabe', async () => {
    baueSpalte(
      TAFEL + BLOCK('{"move-tags":false,"max-archive-size":7,"new-note-folder":"Karten"}'),
    );
    const { modal } = await oeffne();
    expect(auswahl(modal, 'tagsAmFuss').value).toBe('aus');
    expect(auswahl(modal, 'archivObergrenze').value).toBe('eigen');
    expect(modal.querySelector('.kanban-einstellungen-zahl').value).toBe('7');
    expect(auswahl(modal, 'zielordner').value).toBe('eigen');
    expect(modal.textContent).toContain('Karten');
    knopf(modal, 'abbrechen').click();
  });
});

// --- Übernehmen ------------------------------------------------------------------------

describe('Dialog: Übernehmen schreibt nur die Änderungen (AK2, AK4)', () => {
  it('«an» und «aus» legen den Block an und schreiben beide Schlüssel in einem Schritt', async () => {
    const { tab, protokoll } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    setze(auswahl(modal, 'tagsAmFuss'), 'an');
    setze(auswahl(modal, 'archivMitZeitstempel'), 'aus');
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(werte(tab.content)).toEqual({ tagsAmFuss: true, archivMitZeitstempel: false });
    // Ein Schreibvorgang = eine Transaktion = ein Rückgängig-Schritt.
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content.startsWith(TAFEL)).toBe(true);
  });

  it('«wie Vorgabe» entfernt den Schlüssel; die übrigen Angaben des Blocks bleiben', async () => {
    const vorher =
      TAFEL + BLOCK('{"kanban-plugin":"board","move-tags":true,"show-relative-date":true}');
    const { tab } = baueSpalte(vorher);
    const { modal, ergebnis } = await oeffne();
    setze(auswahl(modal, 'tagsAmFuss'), 'vorgabe');
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(tab.content).toContain('{"kanban-plugin":"board","show-relative-date":true}');
    expect(werte(tab.content)).toEqual({ termineRelativ: true });
  });

  it('eine eigene Obergrenze von 0 wird als «unbegrenzt» des Vorbilds geschrieben', async () => {
    const { tab } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    setze(auswahl(modal, 'archivObergrenze'), 'eigen');
    modal.querySelector('.kanban-einstellungen-zahl').value = '0';
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(tab.content).toContain('"max-archive-size":-1');
  });

  it('die Feldwahl schreibt die Liste in der Schreibweise des Vorbilds und erhält «containsMarkdown»', async () => {
    const vorhanden =
      '{"metadata-keys":[{"metadataKey":"status","label":"Status","shouldHideLabel":false,"containsMarkdown":true}]}';
    const { tab } = baueSpalte(TAFEL + BLOCK(vorhanden));
    const { modal, ergebnis } = await oeffne();
    expect(auswahl(modal, 'feldwahl').value).toBe('eigen');
    knopf(modal, 'feld-hinzufuegen').click();
    const zeilen = modal.querySelectorAll('.kanban-einstellungen-feld');
    expect(zeilen).toHaveLength(2);
    zeilen[1].querySelector('[data-teil="feld"]').value = 'priorität';
    zeilen[1].querySelector('[data-teil="verbergen"]').checked = true;
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    const daten = JSON.parse(tab.content.split('\n').find((z) => z.includes('metadata-keys')));
    expect(daten['metadata-keys']).toEqual([
      { metadataKey: 'status', label: 'Status', shouldHideLabel: false, containsMarkdown: true },
      { metadataKey: 'priorität', label: '', shouldHideLabel: true, containsMarkdown: false },
    ]);
  });

  it('eine Zeile ohne Schlüssel entfällt, «Entfernen» nimmt eine Zeile heraus', async () => {
    const { tab } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'feld-hinzufuegen').click();
    knopf(modal, 'feld-hinzufuegen').click();
    knopf(modal, 'feld-hinzufuegen').click();
    const zeilen = modal.querySelectorAll('.kanban-einstellungen-feld');
    zeilen[0].querySelector('[data-teil="feld"]').value = 'eins';
    zeilen[1].querySelector('[data-teil="feld"]').value = 'zwei';
    zeilen[1].querySelector('[data-aktion="feld-entfernen"]').click();
    expect(auswahl(modal, 'feldwahl').value).toBe('eigen');
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(werte(tab.content).feldwahl.map((f) => f.feld)).toEqual(['eins']);
  });

  it('der Dialog meldet nur geänderte Einstellungen, nicht jede', () => {
    // Die Zusage «nur geänderte Schlüssel» hängt am Dialog selbst und nicht
    // allein daran, dass ein gleicher Text beim Schreiben nichts ändert.
    const vorher = { tagsAmFuss: true, feldwahl: [{ feld: 'a' }] };
    expect(
      geaenderteEinstellungen(vorher, {
        tagsAmFuss: true,
        termineRelativ: null,
        feldwahl: [{ feld: 'a' }],
        archivObergrenze: 5,
      }),
    ).toEqual([{ name: 'archivObergrenze', wert: 5 }]);
    expect(geaenderteEinstellungen(vorher, { tagsAmFuss: null })).toEqual([
      { name: 'tagsAmFuss', wert: null },
    ]);
  });

  it('nichts geändert → nichts geschrieben', async () => {
    const { tab, protokoll } = baueSpalte(TAFEL + BLOCK('{"move-tags":true}'));
    const vorher = tab.content;
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(false);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('Rückgängig nimmt das ganze Übernehmen in einem Schritt zurück', async () => {
    const { tab, container, zurueck } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    setze(auswahl(modal, 'tagsAmFuss'), 'an');
    setze(auswahl(modal, 'termineRelativ'), 'an');
    knopf(modal, 'uebernehmen').click();
    await ergebnis;
    expect(zurueck).toHaveLength(1);
    // Strg+Z auf der Tafel: ein Schritt, und beide Einstellungen sind fort.
    container.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );
    expect(tab.content).toBe(TAFEL);
  });

  it('die gesetzte Einstellung wirkt sofort auf die Zeichnung (Tafel vor Vorgabe)', async () => {
    const { container } = baueSpalte(TAFEL);
    expect(container.querySelector('.kanban-karte-tags')).toBeNull();
    const { modal, ergebnis } = await oeffne();
    setze(auswahl(modal, 'tagsAmFuss'), 'an');
    knopf(modal, 'uebernehmen').click();
    await ergebnis;
    renderKanban(0);
    expect(container.querySelector('.kanban-karte-tags')).not.toBeNull();
  });
});

// --- Fehl-Lagen ---------------------------------------------------------------------------

describe('Dialog: Fehl-Lagen', () => {
  it('ein inzwischen geändertes Dokument wird nicht überschrieben — Hinweis wie beim Verwerfen', async () => {
    const { tab, protokoll } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    setze(auswahl(modal, 'tagsAmFuss'), 'an');
    tab.content = TAFEL + '- [ ] Von anderswo\n';
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(false);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    await warte();
    expect(showStatusbarHint).toHaveBeenCalledWith('kanban.verworfen', expect.anything());
  });

  it('im nicht änderbaren Dokument öffnet sich kein Dialog, der Hinweis sagt es', async () => {
    baueSpalte(TAFEL, { aenderbar: false });
    expect(await oeffneKanbanTafelEinstellungen(0)).toBe(false);
    expect(document.querySelector('.kanban-einstellungen-modal')).toBeNull();
    await warte();
    expect(showStatusbarHint).toHaveBeenCalledWith('kanban.nurLesbar', expect.anything());
  });

  it('außerhalb der Tafel-Ansicht öffnet sich kein Dialog', async () => {
    const { tab } = baueSpalte(TAFEL);
    tab.viewMode = 'rendered';
    expect(await oeffneKanbanTafelEinstellungen(0)).toBe(false);
    await warte();
    expect(showStatusbarHint).toHaveBeenCalledWith('kanban.nurInAnsicht', expect.anything());
  });

  it('ein nicht lesbarer Einstellungs-Block wird nicht angefasst', () => {
    const kaputt = TAFEL + '\n%% kanban:settings\n```\n{kaputt\n```\n%%\n';
    expect(wendeTafelEinstellungenAn(kaputt, [{ name: 'tagsAmFuss', wert: true }])).toBeNull();
  });
});

// --- Zielordner und Vorlage -----------------------------------------------------------------

describe('Dialog: Zielordner und Vorlage über die Auswahl der Anwendung', () => {
  it('der Zielordner wird relativ zur Bereichs-Wurzel gespeichert', async () => {
    window.api.templatesChooseFolder.mockResolvedValue({
      ok: true,
      path: '/Bereich/Notizen/Karten',
    });
    const { tab } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'zielordner-waehlen').click();
    await warte();
    expect(window.api.templatesChooseFolder).toHaveBeenCalledWith('target');
    expect(auswahl(modal, 'zielordner').value).toBe('eigen');
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(werte(tab.content).zielordner).toBe('Notizen/Karten');
  });

  it('ohne Bereich relativ zum Ordner der Tafel', async () => {
    window.api.templatesChooseFolder.mockResolvedValue({ ok: true, path: '/Bereich/Notizen' });
    const { tab } = baueSpalte(TAFEL, { ohneBereich: true });
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'zielordner-waehlen').click();
    await warte();
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(werte(tab.content).zielordner).toBe('../Notizen');
  });

  it('ein Ordner außerhalb des Bereichs wird abgewiesen', async () => {
    window.api.templatesChooseFolder.mockResolvedValue({ ok: true, path: '/Anderswo' });
    baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'zielordner-waehlen').click();
    await warte();
    await warte();
    expect(showStatusbarHint).toHaveBeenCalledWith(
      'kanban.einstellungen.ordnerAusserhalb',
      expect.anything(),
    );
    expect(auswahl(modal, 'zielordner').value).toBe('vorgabe');
    knopf(modal, 'abbrechen').click();
    await ergebnis;
  });

  it('die Vorlage kommt aus der Vorlagen-Auswahl; eine fremde Quelle trägt ihr Kürzel', async () => {
    pickTemplateEntry.mockResolvedValueOnce({ relPath: 'Karten\\Notiz.md', sourceKey: 'team' });
    const { tab } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'vorlage-waehlen').click();
    await warte();
    await warte();
    knopf(modal, 'uebernehmen').click();
    expect(await ergebnis).toBe(true);
    expect(werte(tab.content).vorlage).toBe('@team:Karten/Notiz.md');
  });

  it('eine Vorlage der eigenen Quelle steht ohne Kürzel', async () => {
    pickTemplateEntry.mockResolvedValueOnce({ relPath: 'Notiz.md', sourceKey: '' });
    const { tab } = baueSpalte(TAFEL);
    const { modal, ergebnis } = await oeffne();
    knopf(modal, 'vorlage-waehlen').click();
    await warte();
    await warte();
    knopf(modal, 'uebernehmen').click();
    await ergebnis;
    expect(werte(tab.content).vorlage).toBe('Notiz.md');
  });
});

// --- Archivieren nach der Kette ---------------------------------------------------------------

describe('Archivieren nach der Auflösungs-Kette (AK6, AK7)', () => {
  function archiviereErste(container, protokoll) {
    const karte = container.querySelector(`.${KARTE_KLASSE}`);
    karte.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    const eintraege = protokoll.menues[protokoll.menues.length - 1].eintraege;
    return eintraege.find((e) => e.dataId === 'kanban-card-archive').action();
  }

  it('ohne Einstellung der Tafel mit Zeitstempel wie in der Stufe 2', () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    expect(archiviereErste(container, protokoll)).toBe(true);
    expect(tab.content).toContain('- [ ] 2026-09-25 09:30 Erste Karte #tag');
  });

  it('Zeitstempel aus und Obergrenze der Tafel schlagen die Vorgabe', () => {
    const text =
      TAFEL.replace(
        '- [ ] Zweite Karte\n',
        '- [ ] Zweite Karte\n\n***\n\n## Archive\n\n- [x] Alt\n',
      ) + BLOCK('{"archive-with-date":false,"max-archive-size":1}');
    const { tab, container, protokoll } = baueSpalte(text);
    expect(archiviereErste(container, protokoll)).toBe(true);
    const archiv = leseTafel(tab.content).archiv;
    expect(archiv.karten.map((k) => k.text)).toEqual(['Erste Karte #tag']);
  });

  it('die globale Vorgabe «ohne Zeitstempel» gilt, wo die Tafel nichts setzt', () => {
    uebernimmKanbanAnzeige('kanban.archivZeitstempel', false);
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    archiviereErste(container, protokoll);
    expect(tab.content).toContain('\n- [ ] Erste Karte #tag\n');
  });
});

// --- Zugänge -------------------------------------------------------------------------------------

describe('Kommando «Einstellungen dieser Tafel…» über alle Zugänge (AK5)', () => {
  it('das Kontextmenü des Spalten-Kopfs öffnet den Dialog', async () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    container
      .querySelector('.kanban-spalte-kopf')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    const eintrag = protokoll.menues[0].eintraege.find((e) => e.dataId === 'kanban-board-settings');
    expect(eintrag.label).toBe(DE['command.kanban.boardSettings']);
    const ergebnis = eintrag.action();
    await Promise.resolve();
    const modal = document.querySelector('.kanban-einstellungen-modal');
    expect(modal).toBeTruthy();
    knopf(modal, 'abbrechen').click();
    expect(await ergebnis).toBe(false);
  });

  it('Registry, Menü, Brücke, Bindung, Dispatcher und Erweiterung nennen das Kommando', () => {
    const cmd = COMMANDS.find((c) => c.id === 'kanban.boardSettings');
    expect(cmd).toMatchObject({
      labelKey: 'command.kanban.boardSettings',
      menu: true,
      availability: 'tafelKarte',
      defaultBindings: [],
    });
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("unless('kanban.boardSettings', {");
    expect(menu).toContain("send('menu:kanbanBoardSettings')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:kanbanBoardSettings'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuKanbanBoardSettings(() => oeffneKanbanTafelEinstellungen(state.activePaneIndex))',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'kanban.boardSettings': () => oeffneKanbanTafelEinstellungen(state.activePaneIndex)",
    );
    expect(extensionById('kanban').commands).toContain('kanban.boardSettings');
    expect(disabledCommandIdSet(['kanban']).has('kanban.boardSettings')).toBe(true);
  });

  it('die Texte des Dialogs liegen in allen fünf Sprachen vor', () => {
    const quelle = lies('src/renderer/modules/kanban/kanban-einstellungs-dialog.js');
    const feste = [...quelle.matchAll(/'(kanban\.einstellungen\.[A-Za-z]+)'/g)].map((m) => m[1]);
    const dynamisch = ['tagsAmFuss', 'termineRelativ', 'archivMitZeitstempel', 'datumZurTagesnotiz']
      .concat(['archivObergrenze', 'zielordner', 'vorlage', 'feldwahl'])
      .map((n) => `kanban.einstellungen.${n}`)
      .concat(
        ['zielordner', 'vorlage'].flatMap((n) => [
          `kanban.einstellungen.${n}Vorgabe`,
          `kanban.einstellungen.${n}Waehlen`,
        ]),
      );
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const woerter = JSON.parse(lies(`src/i18n/${code}.json`));
      for (const key of [...feste, ...dynamisch, 'command.kanban.boardSettings']) {
        expect(woerter[key], `${key} fehlt in ${code}`).toBeTruthy();
      }
    }
  });
});
