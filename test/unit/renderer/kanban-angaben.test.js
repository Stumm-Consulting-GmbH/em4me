// @vitest-environment jsdom
// 4T-001957 (Epic 3E-000319, Story 4S-000985): Prüffälle der Darstellung der
// Angaben der verlinkten Notiz auf der Karte — Zeilen «Name: Wert», verborgener
// Name, Kürzung mit Hinweistext, Bild, Text statt Markup —, des Nachtragens
// nach der Zeichnung (eine gebündelte Anfrage, veraltete Antwort verworfen,
// kein Flackern) und der Einbettung in die Tafel-Ansicht (leere Feldwahl,
// Erweiterung aus, neuer Stand beim nächsten Zeichnen).
//
// Die Zeichnung läuft mit der echten Render-Kette wie in `kanban-tafel.test.js`;
// ersetzt ist allein der Lese-Kanal des Hauptprozesses, dessen eigene Prüffälle
// in `test/unit/kanban-angaben.test.js` an echten Dateien stehen. Ob die Zeilen
// in der gebauten Anwendung sichtbar sind, belegt erst die Prüfung an der
// Programmdatei (Ablauf-Tests mit 4T-001959).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import { feldwahlAus } from '../../../src/shared/kanban/kanban-angaben.js';
import { zeichneTafel } from '../../../src/renderer/modules/kanban/kanban-tafel.js';
import {
  ANGABEN_KLASSE,
  baueAngaben,
  ladeAngaben,
} from '../../../src/renderer/modules/kanban/kanban-angaben.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const t = (key) => de[key] ?? key;

const istAktiv = vi.fn(() => true);
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));

const lade = vi.fn();
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  kanbanNotizAngaben: (anfrage) => lade(anfrage),
};
const { initKanbanPane, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');

const PFAD = 'C:/Notizen/Tafel.md';
const FELDWAHL = feldwahlAus([
  { feld: 'status', bezeichnung: 'Stand', bezeichnungVerbergen: false },
  { feld: 'owner', bezeichnung: '', bezeichnungVerbergen: false },
  { feld: 'cover', bezeichnung: 'Titelbild', bezeichnungVerbergen: true },
]);

const BLOCK = [
  '%% kanban:settings',
  '```',
  '{"kanban-plugin":"board","metadata-keys":[{"metadataKey":"status","label":"Stand","shouldHideLabel":false,"containsMarkdown":false}]}',
  '```',
  '%%',
  '',
].join('\n');

const TAFEL = [
  '---',
  'kanban-plugin: board',
  '---',
  '',
  '## Offen',
  '',
  '- [ ] Erste [[Alpha]] #arbeit',
  '- [ ] Ohne Verweis',
  '- [ ] Zweite auch [[Alpha]]',
  '',
  '## Später',
  '',
  '- [ ] [[#Anker]] dann [[Beta]]',
  '',
].join('\n');

function zeichne(text = TAFEL, anzeige = {}) {
  const container = document.createElement('section');
  const model = leseTafel(text);
  zeichneTafel(container, model, {
    t,
    pfad: PFAD,
    renderMarkdown: (x) => renderMarkdown(x, 'de', { frontmatterBlock: false }),
    tagsAmFuss: true,
    ...anzeige,
  });
  return { container, model };
}

function antwort(ergebnisse) {
  return Promise.resolve({ ok: true, ergebnisse });
}

beforeEach(() => {
  lade.mockReset();
  istAktiv.mockReset();
  istAktiv.mockReturnValue(true);
});

describe('Angaben der verlinkten Notiz — Darstellung (AK1, AK3, AK8)', () => {
  it('zeigt je Angabe «Name: Wert», mit dem Schlüssel, wo kein Anzeige-Name gesetzt ist', () => {
    const block = baueAngaben(
      [
        { schluessel: 'status', text: 'in Arbeit' },
        { schluessel: 'owner', text: 'Anna' },
      ],
      FELDWAHL,
      t,
    );
    const zeilen = [...block.querySelectorAll('.kanban-angabe')];
    expect(zeilen.map((z) => z.textContent)).toEqual(['Stand: in Arbeit', 'owner: Anna']);
    expect(block.getAttribute('aria-label')).toBe(de['kanban.einstellungen.feldwahl']);
  });

  it('«Namen verbergen» zeigt nur den Wert, der Hinweistext trägt den vollen Wert', () => {
    const lang = 'x'.repeat(400);
    const feldwahl = feldwahlAus([{ feld: 'notiz', bezeichnung: 'N', bezeichnungVerbergen: true }]);
    const block = baueAngaben([{ schluessel: 'notiz', text: lang }], feldwahl, t);
    const zeile = block.querySelector('.kanban-angabe');
    expect(zeile.querySelector('.kanban-angabe-name')).toBeNull();
    expect(zeile.textContent).toBe(lang);
    expect(zeile.title).toBe(lang);
    const mitName = baueAngaben([{ schluessel: 'status', text: lang }], FELDWAHL, t);
    expect(mitName.querySelector('.kanban-angabe').title).toBe(`Stand: ${lang}`);
  });

  it('AK8: das Stilblatt begrenzt jede Angabe auf zwei Zeilen mit Auslassung und das Bild in der Höhe', () => {
    // jsdom kennt die Kaskade nicht; geprüft wird die Regel selbst. Sichtbar
    // wird sie an der gebauten Anwendung (manuelle Prüf-Zeile).
    const css = readFileSync(path.join(dir, '../../../src/renderer/styles/kanban.css'), 'utf8');
    const regel = (sel) => {
      const start = css.indexOf(`${sel} {`);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(regel('.kanban-angabe')).toMatch(/-webkit-line-clamp: 2/);
    expect(regel('.kanban-angabe')).toMatch(/overflow: hidden/);
    expect(regel('.kanban-angabe-bild')).toMatch(/width: 100%/);
    expect(regel('.kanban-angabe-bild')).toMatch(/max-height: \d+px/);
  });

  it('setzt jeden Wert als Text, nie als Markup', () => {
    const boese = '<img src=x onerror="window.__boese=1"><b>fett</b>';
    const block = baueAngaben([{ schluessel: 'status', text: boese }], FELDWAHL, t);
    expect(block.querySelector('img')).toBeNull();
    expect(block.querySelector('b')).toBeNull();
    expect(block.querySelector('.kanban-angabe-wert').textContent).toBe(boese);
    expect(window.__boese).toBeUndefined();
  });

  it('AK3: ein Bild-Wert erscheint als Bild; nur eine Bild-Daten-Adresse wird angenommen', () => {
    const png = 'data:image/png;base64,AAAA';
    const block = baueAngaben(
      [
        { schluessel: 'cover', text: '[[c.png]]', bild: png },
        { schluessel: 'status', text: 'x', bild: 'file:///C:/geheim.png' },
      ],
      FELDWAHL,
      t,
    );
    const bilder = block.querySelectorAll('img.kanban-angabe-bild');
    expect(bilder).toHaveLength(1);
    expect(bilder[0].getAttribute('src')).toBe(png);
    expect(bilder[0].alt).toBe('Titelbild');
    expect(bilder[0].draggable).toBe(false);
    // Die zweite Angabe fällt auf ihren Text zurück, die fremde Adresse nicht ins Bild.
    expect(block.querySelectorAll('.kanban-angabe')[1].textContent).toBe('Stand: x');
  });

  it('ohne Angabe mit Wert entsteht kein Block', () => {
    expect(baueAngaben([], FELDWAHL, t)).toBeNull();
    expect(baueAngaben([{ schluessel: 'unbekannt', text: 'x' }], FELDWAHL, t)).toBeNull();
  });
});

describe('Angaben der verlinkten Notiz — Nachtragen nach der Zeichnung (AK1, AK2, AK4, AK5)', () => {
  it('eine gebündelte Anfrage je Zeichnen; die Zeilen stehen unter dem Text und vor dem Kartenfuß', async () => {
    const { container, model } = zeichne();
    lade.mockReturnValueOnce(
      antwort([
        { werte: [{ schluessel: 'status', text: 'offen' }] },
        { werte: [{ schluessel: 'owner', text: 'Ben' }] },
      ]),
    );
    const ergebnis = await ladeAngaben(container, {
      model,
      feldwahl: FELDWAHL,
      pfad: PFAD,
      lade,
      t,
    });
    expect(ergebnis).toBe('eingetragen');
    expect(lade).toHaveBeenCalledTimes(1);
    expect(lade).toHaveBeenCalledWith({
      basePath: PFAD,
      schluessel: ['status', 'owner', 'cover'],
      ziele: ['Alpha', 'Beta'],
    });
    const karten = [...container.querySelectorAll('.kanban-karte')];
    // Beide Karten mit [[Alpha]] tragen die Angaben, die Karte ohne Verweis keine;
    // die Karte mit reinem Anker vorn nimmt den nächsten Verweis (AK4).
    expect(karten.map((k) => k.querySelector(`.${ANGABEN_KLASSE}`)?.textContent ?? null)).toEqual([
      'Stand: offen',
      null,
      'Stand: offen',
      'owner: Ben',
    ]);
    const kinder = [...karten[0].children].map((k) => k.className);
    const inhalt = kinder.indexOf('kanban-karte-inhalt markdown-body');
    expect(kinder[inhalt + 1]).toBe(ANGABEN_KLASSE);
    expect(kinder.indexOf('kanban-karte-tags')).toBeGreaterThan(inhalt + 1);
  });

  it('AK2: ohne Feldwahl geht keine Anfrage hinaus und die Karte zeigt keine Angaben', async () => {
    const { container, model } = zeichne();
    expect(await ladeAngaben(container, { model, feldwahl: [], pfad: PFAD, lade, t })).toBe('leer');
    expect(lade).not.toHaveBeenCalled();
    expect(container.querySelector(`.${ANGABEN_KLASSE}`)).toBeNull();
  });

  it('AK5: ein nicht auflösbares Ziel und ein gescheiterter Kanal zeigen nichts und melden nichts', async () => {
    const { container, model } = zeichne();
    lade.mockReturnValueOnce(antwort([null, null]));
    await ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t });
    expect(container.querySelector(`.${ANGABEN_KLASSE}`)).toBeNull();
    lade.mockReturnValueOnce(Promise.reject(new Error('kaputt')));
    expect(await ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t })).toBe(
      'unveraendert',
    );
    expect(container.querySelector('.kanban-befunde')).toBeNull();
  });

  it('eine veraltete Antwort wird verworfen, wenn inzwischen neu angefragt wurde', async () => {
    const { container, model } = zeichne();
    let ersteLoesen;
    lade.mockReturnValueOnce(new Promise((r) => (ersteLoesen = r)));
    lade.mockReturnValueOnce(antwort([{ werte: [{ schluessel: 'status', text: 'neu' }] }, null]));
    const erste = ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t });
    const zweite = ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t });
    expect(await zweite).toBe('eingetragen');
    ersteLoesen({
      ok: true,
      ergebnisse: [{ werte: [{ schluessel: 'status', text: 'alt' }] }, null],
    });
    expect(await erste).toBe('verworfen');
    expect(container.querySelector(`.${ANGABEN_KLASSE}`).textContent).toBe('Stand: neu');
  });

  it('nach einer Neu-Zeichnung steht der letzte Stand sofort wieder da; gleiche Antwort ändert nichts', async () => {
    const { container, model } = zeichne();
    const werte = [{ werte: [{ schluessel: 'status', text: 'offen' }] }, null];
    lade.mockReturnValue(antwort(werte));
    await ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t });
    const block = container.querySelector(`.${ANGABEN_KLASSE}`);
    // Dieselbe Tafel, dieselbe Antwort: Der Baum bleibt, wie er ist.
    expect(await ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t })).toBe(
      'unveraendert',
    );
    expect(container.querySelector(`.${ANGABEN_KLASSE}`)).toBe(block);
    // Neu gezeichnet: Die Angaben stehen vor der Antwort schon wieder da.
    zeichneTafel(container, model, { t, pfad: PFAD });
    let loesen;
    lade.mockReturnValueOnce(new Promise((r) => (loesen = r)));
    const laeuft = ladeAngaben(container, { model, feldwahl: FELDWAHL, pfad: PFAD, lade, t });
    expect(container.querySelector(`.${ANGABEN_KLASSE}`).textContent).toBe('Stand: offen');
    loesen({ ok: true, ergebnisse: werte });
    await laeuft;
  });
});

describe('Angaben der verlinkten Notiz — Einbettung in die Tafel-Ansicht (AK2, AK7, AK10)', () => {
  function spalte(tab) {
    const el = document.createElement('section');
    initKanbanPane({ getPaneEls: () => ({ kanbanEl: el }), aktivesDokument: () => tab });
    return el;
  }
  const warte = () => new Promise((r) => setTimeout(r, 0));

  it('AK7: beim nächsten Zeichnen zeigt die Karte den neuen Stand der Notiz, auch bei unveränderter Tafel', async () => {
    const tab = { content: `${TAFEL}\n${BLOCK}`, viewMode: 'kanban', path: PFAD };
    const el = spalte(tab);
    lade.mockReturnValueOnce(antwort([{ werte: [{ schluessel: 'status', text: 'alt' }] }, null]));
    renderKanban(0);
    expect(lade).toHaveBeenCalledTimes(1);
    expect(lade.mock.calls[0][0].schluessel).toEqual(['status']);
    await warte();
    expect(el.querySelector(`.${ANGABEN_KLASSE}`).textContent).toBe('Stand: alt');
    const karte = el.querySelector('.kanban-karte');
    lade.mockReturnValueOnce(antwort([{ werte: [{ schluessel: 'status', text: 'neu' }] }, null]));
    renderKanban(0);
    await warte();
    // Die Karte selbst ist dieselbe (Zeichnung übersprungen), die Angabe neu.
    expect(el.querySelector('.kanban-karte')).toBe(karte);
    expect(lade).toHaveBeenCalledTimes(2);
    expect(el.querySelector(`.${ANGABEN_KLASSE}`).textContent).toBe('Stand: neu');
  });

  it('AK2: eine Tafel ohne Feldwahl fragt nicht an', async () => {
    const el = spalte({ content: TAFEL, viewMode: 'kanban', path: PFAD });
    renderKanban(0);
    await warte();
    expect(lade).not.toHaveBeenCalled();
    expect(el.querySelector(`.${ANGABEN_KLASSE}`)).toBeNull();
  });

  it('AK10: mit ausgeschalteter Erweiterung erscheinen keine Angaben und es wird nichts gelesen', async () => {
    istAktiv.mockReturnValue(false);
    const el = spalte({ content: `${TAFEL}\n${BLOCK}`, viewMode: 'kanban', path: PFAD });
    renderKanban(0);
    await warte();
    expect(istAktiv).toHaveBeenCalledWith('kanban');
    expect(lade).not.toHaveBeenCalled();
    expect(el.querySelector(`.${ANGABEN_KLASSE}`)).toBeNull();
  });

  it('AK6: auch im nicht änderbaren Dokument erscheinen die Angaben, ohne Bedienelement', async () => {
    const tab = { content: `${TAFEL}\n${BLOCK}`, viewMode: 'kanban', path: PFAD };
    const el = document.createElement('section');
    initKanbanPane({
      getPaneEls: () => ({ kanbanEl: el }),
      aktivesDokument: () => tab,
      istAenderbar: () => false,
    });
    lade.mockReturnValueOnce(antwort([{ werte: [{ schluessel: 'status', text: 'da' }] }, null]));
    renderKanban(0);
    await warte();
    const block = el.querySelector(`.${ANGABEN_KLASSE}`);
    expect(block.textContent).toBe('Stand: da');
    expect(block.querySelectorAll('button, input, a, [tabindex]')).toHaveLength(0);
  });
});
