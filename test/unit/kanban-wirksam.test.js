// 4T-001955 (Epic 3E-000319): Unit-Tests der Auflösungs-Kette der
// Tafel-Einstellungen — Tafel vor Vorgabe, mit Herkunft je Einstellung, für
// alle acht Einstellungen; die Obergrenze «0 und darunter heißt unbegrenzt»;
// und das Archivieren im Format-Kern mit der Obergrenze aus der Kette.
//
// Eigene Prüfdatei neben kanban-einstellungen.test.js, weil die Kette in ihrem
// eigenen Modul liegt (src/shared/kanban/kanban-wirksam.js).
import { describe, it, expect } from 'vitest';
import {
  wirksameEinstellungen,
  archivObergrenzeAus,
} from '../../src/shared/kanban/kanban-wirksam.js';
import {
  TAFEL_EINSTELLUNGEN,
  ARCHIV_UNBEGRENZT,
  leseTafelEinstellungen,
} from '../../src/shared/kanban/kanban-einstellungen.js';
import { KANBAN_VORGABEN, normalisiereKanbanAnzeige } from '../../src/shared/kanban-anzeige.js';
import { leseTafel } from '../../src/shared/kanban/kanban-core.js';
import { archiviereKarte, ARCHIV_OBERGRENZE } from '../../src/shared/kanban/kanban-archiv.js';

const GLOBAL_VORGABE = normalisiereKanbanAnzeige(null);

describe('kanban-wirksam — die Kette ohne Einstellung der Tafel (AK7)', () => {
  it('liefert je Einstellung die Vorgabe mit Herkunft «vorgabe»', () => {
    const w = wirksameEinstellungen({}, GLOBAL_VORGABE);
    expect(Object.keys(w).sort()).toEqual(TAFEL_EINSTELLUNGEN.map((e) => e.name).sort());
    expect(w).toEqual({
      zielordner: { wert: null, herkunft: 'vorgabe' },
      vorlage: { wert: null, herkunft: 'vorgabe' },
      archivMitZeitstempel: { wert: true, herkunft: 'vorgabe' },
      archivObergrenze: { wert: 100, herkunft: 'vorgabe' },
      termineRelativ: { wert: false, herkunft: 'vorgabe' },
      feldwahl: { wert: null, herkunft: 'vorgabe' },
      datumZurTagesnotiz: { wert: false, herkunft: 'vorgabe' },
      tagsAmFuss: { wert: false, herkunft: 'vorgabe' },
    });
  });

  it('fehlen auch die globalen Werte, gelten die Vorgaben der Liste', () => {
    expect(wirksameEinstellungen(null, null)).toEqual(wirksameEinstellungen({}, GLOBAL_VORGABE));
  });

  it('folgt den globalen Werten, wo die Tafel nichts setzt', () => {
    const w = wirksameEinstellungen(
      {},
      {
        'kanban.tagsAmFuss': true,
        'kanban.terminRelativ': true,
        'kanban.archivZeitstempel': false,
        'kanban.archivObergrenze': 0,
        'kanban.datumTagesnotiz': true,
      },
    );
    expect(w.tagsAmFuss).toEqual({ wert: true, herkunft: 'vorgabe' });
    expect(w.termineRelativ).toEqual({ wert: true, herkunft: 'vorgabe' });
    expect(w.archivMitZeitstempel).toEqual({ wert: false, herkunft: 'vorgabe' });
    expect(w.archivObergrenze).toEqual({ wert: 0, herkunft: 'vorgabe' });
    expect(w.datumZurTagesnotiz).toEqual({ wert: true, herkunft: 'vorgabe' });
  });

  it('jede globale Vorgabe gehört zu genau einer Einstellung je Tafel', () => {
    const namen = new Set(TAFEL_EINSTELLUNGEN.map((e) => e.name));
    for (const v of KANBAN_VORGABEN) expect(namen.has(v.tafel), v.schluessel).toBe(true);
    expect(new Set(KANBAN_VORGABEN.map((v) => v.tafel)).size).toBe(KANBAN_VORGABEN.length);
  });
});

describe('kanban-wirksam — Tafel vor Vorgabe (AK3, AK6)', () => {
  it('ein Wert der Tafel schlägt die Vorgabe, auch gegen sie', () => {
    const feld = {
      feld: 'status',
      bezeichnung: '',
      bezeichnungVerbergen: false,
      enthaeltMarkdown: false,
    };
    const w = wirksameEinstellungen(
      {
        tagsAmFuss: false,
        termineRelativ: true,
        archivMitZeitstempel: false,
        archivObergrenze: 5,
        datumZurTagesnotiz: true,
        zielordner: 'Notizen/Karten',
        vorlage: 'Karte.md',
        feldwahl: [feld],
      },
      { ...GLOBAL_VORGABE, 'kanban.tagsAmFuss': true },
    );
    for (const e of TAFEL_EINSTELLUNGEN) expect(w[e.name].herkunft, e.name).toBe('tafel');
    expect(w.tagsAmFuss.wert).toBe(false);
    expect(w.archivObergrenze.wert).toBe(5);
    expect(w.zielordner.wert).toBe('Notizen/Karten');
    expect(w.feldwahl.wert).toEqual([feld]);
  });

  it('liest die Werte der Tafel aus dem Einstellungs-Block', () => {
    const text = [
      '---',
      'kanban-plugin: board',
      '---',
      '',
      '## Offen',
      '',
      '- [ ] Karte',
      '',
      '%% kanban:settings',
      '```',
      '{"kanban-plugin":"board","move-tags":true,"max-archive-size":-1}',
      '```',
      '%%',
    ].join('\n');
    const w = wirksameEinstellungen(leseTafelEinstellungen(text).werte, GLOBAL_VORGABE);
    expect(w.tagsAmFuss).toEqual({ wert: true, herkunft: 'tafel' });
    expect(w.archivObergrenze).toEqual({ wert: ARCHIV_UNBEGRENZT, herkunft: 'tafel' });
    expect(w.termineRelativ).toEqual({ wert: false, herkunft: 'vorgabe' });
  });
});

describe('kanban-wirksam — Archiv-Obergrenze (0 und darunter unbegrenzt)', () => {
  it('eine Zahl über 0 ist die Obergrenze, alles andere unbegrenzt', () => {
    expect(archivObergrenzeAus(100)).toBe(100);
    expect(archivObergrenzeAus(1)).toBe(1);
    expect(archivObergrenzeAus(0)).toBeNull();
    expect(archivObergrenzeAus(-1)).toBeNull();
    expect(archivObergrenzeAus(-7)).toBeNull();
    expect(archivObergrenzeAus('5')).toBeNull();
    expect(archivObergrenzeAus(null)).toBeNull();
  });
});

describe('kanban-archiv — die Obergrenze aus der Kette (AK6)', () => {
  function tafelMitArchiv(anzahl, block = '') {
    const karten = [];
    for (let i = 1; i <= anzahl; i++) karten.push(`- [x] Alt ${i}`);
    return [
      '---',
      'kanban-plugin: board',
      '---',
      '',
      '## Offen',
      '',
      '- [ ] Neu',
      '',
      '***',
      '',
      '## Archive',
      '',
      ...karten,
      '',
      block,
    ].join('\n');
  }
  const archivZahl = (text) => leseTafel(text).archiv.karten.length;
  const angabenAus = (text, global = GLOBAL_VORGABE) => {
    const w = wirksameEinstellungen(leseTafelEinstellungen(text).werte, global);
    return { obergrenze: archivObergrenzeAus(w.archivObergrenze.wert) };
  };

  it('ohne Angabe gilt die Kern-Vorgabe von 100 wie in der Stufe 2', () => {
    const r = archiviereKarte(tafelMitArchiv(100), { spalte: 0, karte: 0 });
    expect(archivZahl(r.text)).toBe(ARCHIV_OBERGRENZE);
  });

  it('die Obergrenze der Tafel schlägt die Vorgabe', () => {
    const block = '%% kanban:settings\n```\n{"max-archive-size":3}\n```\n%%';
    const text = tafelMitArchiv(5, block);
    const r = archiviereKarte(text, { spalte: 0, karte: 0, ...angabenAus(text) });
    expect(archivZahl(r.text)).toBe(3);
    expect(leseTafel(r.text).archiv.karten.map((k) => k.text)).toEqual(['Alt 4', 'Alt 5', 'Neu']);
  });

  it('eine Obergrenze von 0 oder darunter schneidet nichts ab (Rot-Probe gegen 100)', () => {
    const r = archiviereKarte(tafelMitArchiv(100), {
      spalte: 0,
      karte: 0,
      ...angabenAus(tafelMitArchiv(100), { ...GLOBAL_VORGABE, 'kanban.archivObergrenze': 0 }),
    });
    expect(archivZahl(r.text)).toBe(101);
  });

  it('die globale Vorgabe gilt, wo die Tafel nichts setzt', () => {
    const text = tafelMitArchiv(5);
    const r = archiviereKarte(text, {
      spalte: 0,
      karte: 0,
      ...angabenAus(text, { ...GLOBAL_VORGABE, 'kanban.archivObergrenze': 2 }),
    });
    expect(archivZahl(r.text)).toBe(2);
  });
});
