// @vitest-environment jsdom
// 4T-001956 (Epic 3E-000319): Prüffälle «Notiz aus Karte erzeugen…», Bedien-Hälfte.
//
// Zwei Ebenen. **Der Ablauf** (`erzeugeNotizAusKarte`) läuft mit nachgestellten
// Werkzeugen, die jeden Aufruf protokollieren: So sind Reihenfolge (Datei vor
// Karte), Zielordner- und Vorlagen-Bestimmung samt Rückfällen, Namensgleichheit
// und die Fehl-Lagen ohne Fenster messbar. **Die Einbettung** läuft wie bei den
// übrigen Tafel-Prüffällen über `kanban-pane.js` mit einer Editor-Attrappe, die
// den Zeilen-Bereich wirklich anwendet und eine Historie führt; `templates.js`
// ist dort nachgestellt, weil seine Dialoge am ganzen Fenster hängen. Gemessen
// werden Kontextmenü-Eintrag, Kommando, ein Rückgängig-Schritt und das nicht
// änderbare Dokument.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import { leseTafelEinstellungen } from '../../../src/shared/kanban/kanban-einstellungen.js';
import { wirksameEinstellungen } from '../../../src/shared/kanban/kanban-wirksam.js';
import { notizPfad } from '../../../src/shared/kanban/kanban-notiz.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import { KARTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

const { showStatusbarHint, vorlagen } = vi.hoisted(() => ({
  showStatusbarHint: vi.fn(),
  vorlagen: {},
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({ showStatusbarHint }));
vi.mock('../../../src/renderer/modules/templates.js', () => vorlagen);

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
  dirname: (p) => p.slice(0, p.lastIndexOf('/')),
  fileExists: async () => false,
  templatesChooseFolder: async () => ({ ok: false }),
};
const { erzeugeNotizAusKarte, ersetzeUndSchreibeUm, notizMoeglich } =
  await import('../../../src/renderer/modules/kanban/kanban-notiz-erzeugen.js');
const { initKanbanPane, renderKanban, erzeugeKanbanNotiz } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');

const KOPF = '---\nkanban-plugin: board\n---\n';
const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Angebot #kunde schreiben 📅 2026-10-01',
  '\tFolgezeile',
  '- [ ] #nur ⏫',
  '',
].join('\n');
const NACHHER = TAFEL.replace(
  '- [ ] Angebot #kunde schreiben 📅 2026-10-01',
  '- [ ] [[Angebot schreiben]] #kunde 📅 2026-10-01',
);

// --- Ablauf mit nachgestellten Werkzeugen -------------------------------------------------

function lage(text, optionen = {}) {
  const stand = { text, geaendert: optionen.geaendert === true };
  const log = [];
  const model = leseTafel(text);
  const umfeld = {
    karte: model.spalten[0].karten[optionen.karte || 0],
    spalte: 0,
    karteNr: optionen.karte || 0,
    ausgangsstand: text,
    quelle: () => (stand.geaendert ? stand.text + 'x' : stand.text),
    aenderbar: () => true,
    wendeAn: (operation, angaben) => {
      const r = operation(stand.text, angaben);
      if (!r.ok) return false;
      log.push(['schreibe']);
      stand.text = r.text;
      return true;
    },
    tafelPfad: '/b/Projekte/Tafel.md',
    bereichsWurzel: optionen.ohneBereich ? null : '/b',
    einstellungen: wirksameEinstellungen(leseTafelEinstellungen(text).werte, {}),
  };
  return { stand, log, umfeld };
}

function werkzeuge(log, o = {}) {
  const namen = [...(o.namen || [])];
  const wahlen = [...(o.wahlen || [])];
  return {
    hinweis: (k) => log.push(['hinweis', k]),
    dirname: (p) => p.slice(0, p.lastIndexOf('/')),
    gibtEs: async (p) => (o.vorhanden || []).includes(p),
    waehleOrdner: async () => {
      log.push(['waehleOrdner']);
      return o.gewaehlterOrdner || null;
    },
    frageName: async (v) => {
      log.push(['frageName', v]);
      return namen.length ? namen.shift() : null;
    },
    waehleBeiVorhanden: async (n) => {
      log.push(['vorhanden', n]);
      return wahlen.length ? wahlen.shift() : null;
    },
    vorlagenAus: async () => o.vorlagenAus === true,
    vorlagenListe: async () => {
      log.push(['liste']);
      return o.liste || { ok: false, grund: 'noFolder' };
    },
    listenHinweis: (g) => log.push(['listenHinweis', g]),
    ordnerRegel: async (p) => {
      log.push(['regel', p]);
      return o.regel || null;
    },
    waehleVorlage: async (liste) => {
      log.push(['auswahl', liste.map((e) => e.name)]);
      return o.auswahl ? o.auswahl(liste) : null;
    },
    fuelle: async (e, k) => {
      log.push(['fuelle', e.relPath, k.title, k.ordner]);
      return o.fuellung || { text: `# ${k.title}\n`, cursorOffsets: [2] };
    },
    legeAn: async (ordner, name, text) => {
      log.push(['legeAn', ordner, name, text]);
      return o.anlage || { ok: true, path: notizPfad(ordner, name) };
    },
    anlageHinweis: (f) => log.push(['anlageHinweis', f]),
    oeffne: async (p, c) => log.push(['oeffne', p, c]),
  };
}

const mitEinstellungen = (json) => TAFEL + `\n%% kanban:settings\n\`\`\`\n${json}\n\`\`\`\n%%\n`;
const LISTE = {
  ok: true,
  templates: [
    { relPath: 'Karten\\Notiz.md', name: 'Notiz', group: 'Karten' },
    { relPath: 'Protokoll.md', name: 'Protokoll', group: '', sourceKey: 'team' },
  ],
};

describe('Ablauf: ohne Einstellungen der Tafel', () => {
  it('Datei im Ordner der Tafel, leer ohne Vorlagen, danach die Karte, dann Öffnen', async () => {
    const { stand, log, umfeld } = lage(TAFEL);
    expect(await erzeugeNotizAusKarte(umfeld, werkzeuge(log))).toBe(true);
    expect(log).toEqual([
      ['regel', '/b/Projekte/Angebot schreiben.md'],
      ['liste'],
      ['legeAn', '/b/Projekte', 'Angebot schreiben', ''],
      ['schreibe'],
      ['oeffne', '/b/Projekte/Angebot schreiben.md', []],
    ]);
    expect(stand.text).toBe(NACHHER);
  });

  it('greift eine Ordner-Regel, füllt sie die Notiz; die Auswahl erscheint nicht', async () => {
    const { log, umfeld } = lage(TAFEL);
    const regel = { relPath: 'Regel.md', sourceKey: undefined };
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { regel }));
    expect(log.map((e) => e[0])).toEqual(['regel', 'fuelle', 'legeAn', 'schreibe', 'oeffne']);
    expect(log[1]).toEqual(['fuelle', 'Regel.md', 'Angebot schreiben', '/b/Projekte']);
    expect(log[2][3]).toBe('# Angebot schreiben\n');
    expect(log[4][2]).toEqual([2]);
  });

  it('sonst die Auswahl mit «keine Vorlage» an erster Stelle; eine gewählte Vorlage wird gefüllt', async () => {
    const { log, umfeld } = lage(TAFEL);
    await erzeugeNotizAusKarte(
      umfeld,
      werkzeuge(log, { liste: LISTE, auswahl: (liste) => liste[2] }),
    );
    expect(log[2]).toEqual(['auswahl', ['kanban.notiz.keineVorlage', 'Notiz', 'Protokoll']]);
    expect(log[3]).toEqual(['fuelle', 'Protokoll.md', 'Angebot schreiben', '/b/Projekte']);
  });

  it('«keine Vorlage» legt eine leere Notiz an, ohne Ordner-Regel danach', async () => {
    const { log, umfeld } = lage(TAFEL);
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { liste: LISTE, auswahl: (l) => l[0] }));
    expect(log.filter((e) => e[0] === 'regel')).toHaveLength(1);
    expect(log.find((e) => e[0] === 'legeAn')[3]).toBe('');
    expect(log.some((e) => e[0] === 'fuelle')).toBe(false);
  });

  it('Abbruch der Auswahl oder einer Platzhalter-Frage: keine Datei, Karte unverändert', async () => {
    for (const o of [
      { liste: LISTE },
      { liste: LISTE, auswahl: (l) => l[1], fuellung: { cancelled: true } },
    ]) {
      const { stand, log, umfeld } = lage(TAFEL);
      expect(await erzeugeNotizAusKarte(umfeld, werkzeuge(log, o))).toBe(false);
      expect(log.some((e) => e[0] === 'legeAn' || e[0] === 'oeffne')).toBe(false);
      expect(stand.text).toBe(TAFEL);
    }
  });

  it('Vorlagen-Ordner fehlt oder Liste nicht lesbar: Hinweis, dann leere Notiz; nicht eingerichtet: still', async () => {
    for (const grund of ['missing', 'readFailed', 'noFolder', 'empty']) {
      const { log, umfeld } = lage(TAFEL);
      await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { liste: { ok: false, grund } }));
      const hinweis = log.filter((e) => e[0] === 'listenHinweis');
      expect(hinweis, grund).toEqual(
        grund === 'missing' || grund === 'readFailed' ? [['listenHinweis', grund]] : [],
      );
      expect(log.find((e) => e[0] === 'legeAn')[3]).toBe('');
    }
  });

  it('mit ausgeschalteter Vorlagen-Erweiterung weder Ordner-Regel noch Auswahl', async () => {
    const { log, umfeld } = lage(TAFEL);
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { vorlagenAus: true, liste: LISTE }));
    expect(log.map((e) => e[0])).toEqual(['legeAn', 'schreibe', 'oeffne']);
  });
});

describe('Ablauf: Zielordner und Vorlage aus den Einstellungen der Tafel', () => {
  it('Zielordner `/` ist die Bereichs-Wurzel, ein relativer Pfad liegt darunter', async () => {
    for (const [wert, ordner] of [
      ['/', '/b'],
      ['Notizen/Karten', '/b/Notizen/Karten'],
    ]) {
      const { log, umfeld } = lage(mitEinstellungen(`{"new-note-folder":"${wert}"}`));
      await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { vorhanden: [ordner] }));
      expect(log.find((e) => e[0] === 'legeAn')[1], wert).toBe(ordner);
    }
  });

  it('ohne Bereich relativ zum Ordner der Tafel', async () => {
    const { log, umfeld } = lage(mitEinstellungen('{"new-note-folder":"../Notizen"}'), {
      ohneBereich: true,
    });
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { vorhanden: ['/b/Notizen'] }));
    expect(log.find((e) => e[0] === 'legeAn')[1]).toBe('/b/Notizen');
  });

  it('fehlender eingestellter Ordner: Hinweis und Ordner-Wahl, nie stilles Anlegen; Abbruch dort bricht alles ab', async () => {
    const text = mitEinstellungen('{"new-note-folder":"Fehlt"}');
    const a = lage(text);
    await erzeugeNotizAusKarte(a.umfeld, werkzeuge(a.log, { gewaehlterOrdner: '/b/Anders' }));
    expect(a.log.slice(0, 2)).toEqual([['hinweis', 'kanban.notiz.ordnerFehlt'], ['waehleOrdner']]);
    expect(a.log.find((e) => e[0] === 'legeAn')[1]).toBe('/b/Anders');
    const b = lage(text);
    expect(await erzeugeNotizAusKarte(b.umfeld, werkzeuge(b.log))).toBe(false);
    expect(b.log.some((e) => e[0] === 'legeAn')).toBe(false);
    expect(b.stand.text).toBe(text);
  });

  it('ein Ordner außerhalb des Bereichs wird gesagt und gewählt', async () => {
    const { log, umfeld } = lage(mitEinstellungen('{"new-note-folder":"../x"}'));
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log));
    expect(log.slice(0, 2)).toEqual([
      ['hinweis', 'kanban.einstellungen.ordnerAusserhalb'],
      ['waehleOrdner'],
    ]);
  });

  it('eingestellte Vorlage aus eigener und verknüpfter Quelle, ohne Ordner-Regel und Auswahl', async () => {
    for (const [wert, relPath] of [
      ['Karten/Notiz.md', 'Karten\\Notiz.md'],
      ['@team:Protokoll.md', 'Protokoll.md'],
    ]) {
      const { log, umfeld } = lage(mitEinstellungen(`{"new-note-template":"${wert}"}`));
      await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { liste: LISTE }));
      expect(
        log.map((e) => e[0]),
        wert,
      ).toEqual(['liste', 'fuelle', 'legeAn', 'schreibe', 'oeffne']);
      expect(log[1][1]).toBe(relPath);
    }
  });

  it('eingestellte Vorlage nicht auffindbar: Hinweis und Rückfall auf die Auswahl', async () => {
    const { log, umfeld } = lage(mitEinstellungen('{"new-note-template":"Weg.md"}'));
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { liste: LISTE, auswahl: (l) => l[0] }));
    expect(log.slice(0, 3).map((e) => e[0])).toEqual(['liste', 'hinweis', 'auswahl']);
    expect(log[1][1]).toBe('kanban.notiz.vorlageFehlt');
  });
});

describe('Ablauf: Namensgleichheit (Story AK6)', () => {
  const vorhanden = ['/b/Projekte/Angebot schreiben.md'];

  it('anderer Name: erneute Abfrage mit dem Namen vorbelegt, nichts überschrieben', async () => {
    const { stand, log, umfeld } = lage(TAFEL);
    await erzeugeNotizAusKarte(
      umfeld,
      werkzeuge(log, { vorhanden, wahlen: ['anders'], namen: ['Angebot 2'] }),
    );
    expect(log.slice(0, 2)).toEqual([
      ['vorhanden', 'Angebot schreiben'],
      ['frageName', 'Angebot schreiben'],
    ]);
    expect(log.find((e) => e[0] === 'legeAn')[2]).toBe('Angebot 2');
    expect(stand.text).toContain('- [ ] [[Angebot 2]] #kunde 📅 2026-10-01');
  });

  it('Verweis auf das vorhandene Dokument: keine Datei, Karte mit Verweis, nichts geöffnet', async () => {
    const { stand, log, umfeld } = lage(TAFEL);
    expect(
      await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { vorhanden, wahlen: ['verweisen'] })),
    ).toBe(true);
    expect(log.map((e) => e[0])).toEqual(['vorhanden', 'schreibe']);
    expect(stand.text).toBe(NACHHER);
  });

  it('Abbruch der Wahl oder der Namens-Abfrage: nichts geschieht', async () => {
    for (const o of [{ vorhanden }, { vorhanden, wahlen: ['anders'] }]) {
      const { stand, log, umfeld } = lage(TAFEL);
      expect(await erzeugeNotizAusKarte(umfeld, werkzeuge(log, o))).toBe(false);
      expect(log.some((e) => ['legeAn', 'schreibe', 'oeffne'].includes(e[0]))).toBe(false);
      expect(stand.text).toBe(TAFEL);
    }
  });

  it('ein Titel, der als Dateiname nichts ergibt, wird erfragt', async () => {
    const text = TAFEL.replace('Angebot #kunde schreiben', '. . #kunde');
    const { log, umfeld } = lage(text);
    await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { namen: ['Eigener Name'] }));
    expect(log[0]).toEqual(['frageName', '']);
    expect(log.find((e) => e[0] === 'legeAn')[2]).toBe('Eigener Name');
  });
});

describe('Ablauf: Reihenfolge und Fehl-Lagen', () => {
  it('scheitert die Anlage, bleibt die Karte unverändert, und nichts öffnet sich', async () => {
    const { stand, log, umfeld } = lage(TAFEL);
    const anlage = { ok: false, error: 'exists' };
    expect(await erzeugeNotizAusKarte(umfeld, werkzeuge(log, { anlage }))).toBe(false);
    expect(log.slice(-1)).toEqual([['anlageHinweis', 'exists']]);
    expect(stand.text).toBe(TAFEL);
  });

  it('geändertes Dokument: eigener Hinweis, die Datei bleibt und öffnet sich, die Karte bleibt', async () => {
    const { stand, log, umfeld } = lage(TAFEL, { geaendert: true });
    expect(await erzeugeNotizAusKarte(umfeld, werkzeuge(log))).toBe(false);
    expect(log.map((e) => e[0])).toEqual(['regel', 'liste', 'legeAn', 'hinweis', 'oeffne']);
    expect(log[3][1]).toBe('kanban.notiz.verworfen');
    expect(stand.text).toBe(TAFEL);
  });

  it('eine Karte ohne Titel: Hinweis, nichts geschieht', async () => {
    const { log, umfeld } = lage(TAFEL, { karte: 1 });
    expect(await erzeugeNotizAusKarte(umfeld, werkzeuge(log))).toBe(false);
    expect(log).toEqual([['hinweis', 'kanban.notiz.leer']]);
    expect(notizMoeglich(umfeld.karte)).toBe(false);
  });

  it('ein Vorbild-Termin wird dabei umgeschrieben wie beim Bearbeiten', () => {
    const text = [KOPF, '## Offen', '', '- [ ] Plan @{2026-10-01} #x', ''].join('\n');
    const r = ersetzeUndSchreibeUm(text, { spalte: 0, karte: 0, verweis: '[[Plan]]' });
    expect(r.text).toBe([KOPF, '## Offen', '', '- [ ] [[Plan]] #x 📅 2026-10-01', ''].join('\n'));
  });
});

// --- Einbettung: Kontextmenü, Kommando, ein Rückgängig-Schritt -----------------------------

function baueSpalte(text, optionen = {}) {
  const tab = { content: text, viewMode: 'kanban', path: '/b/Projekte/Tafel.md', editMode: true };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], menues: [] };
  const zurueck = [];
  initKanbanPane({
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    bereichsWurzel: () => '/b',
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

function menue(protokoll, karteEl) {
  karteEl.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
  return protokoll.menues[protokoll.menues.length - 1].eintraege;
}

beforeEach(() => {
  document.body.innerHTML = '';
  showStatusbarHint.mockReset();
  Object.assign(vorlagen, {
    vorlagenErweiterungAus: () => false,
    ladeVorlagenListe: async () => ({ ok: false, grund: 'noFolder' }),
    zeigeListenHinweis: vi.fn(),
    ordnerRegelVorlage: async () => null,
    showTemplatePickerDialog: vi.fn(async () => null),
    showTemplateSelectDialog: vi.fn(async () => null),
    frageNeuenDateinamen: vi.fn(async () => null),
    resolveFilledTemplate: vi.fn(),
    folderDisplayFor: (d) => d,
    legeNeueDateiAn: vi.fn(async (d, n) => ({ ok: true, path: `${d}/${n}.md` })),
    zeigeAnlageHinweis: vi.fn(),
    oeffneNeueDatei: vi.fn(async () => {}),
  });
});

describe('Einbettung: Kontextmenü der Karte', () => {
  it('der Eintrag steht nach «Karte bearbeiten» und erzeugt Notiz und Verweis in einem Schritt', async () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    const eintraege = menue(protokoll, karten(container)[0]);
    expect(eintraege.map((e) => e.dataId).slice(0, 3)).toEqual([
      'kanban-card-edit',
      'kanban-card-note',
      'kanban-card-set-date',
    ]);
    expect(eintraege[1].label).toBe('kanban.notizAusKarte');
    expect(await eintraege[1].action()).toBe(true);
    expect(vorlagen.legeNeueDateiAn).toHaveBeenCalledWith('/b/Projekte', 'Angebot schreiben', '');
    expect(vorlagen.oeffneNeueDatei).toHaveBeenCalledWith('/b/Projekte/Angebot schreiben.md', []);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toBe(NACHHER);
  });

  it('ein Rückgängig-Schritt stellt den Kartentext wieder her; die Datei bleibt', async () => {
    const { tab, container, protokoll } = baueSpalte(TAFEL);
    await menue(protokoll, karten(container)[0])[1].action();
    container.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );
    expect(tab.content).toBe(TAFEL);
    expect(vorlagen.legeNeueDateiAn).toHaveBeenCalledTimes(1);
  });

  it('eine Karte nur aus Markern bietet den Eintrag nicht an', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    const ids = menue(protokoll, karten(container)[1]).map((e) => e.dataId);
    expect(ids).not.toContain('kanban-card-note');
  });

  it('im nicht änderbaren Dokument erscheint kein Kontextmenü', () => {
    const { container, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    karten(container)[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    expect(protokoll.menues).toHaveLength(0);
  });
});

describe('Einbettung: Kommando «Notiz aus Karte erzeugen…»', () => {
  it('wirkt auf die gewählte Karte; ohne Wahl geschieht nichts', async () => {
    const { tab, container } = baueSpalte(TAFEL);
    expect(erzeugeKanbanNotiz(0)).toBe(false);
    karten(container)[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(await erzeugeKanbanNotiz(0)).toBe(true);
    expect(tab.content).toBe(NACHHER);
  });

  it('im nicht änderbaren Dokument und außerhalb der Ansicht: Hinweis statt Handlung', async () => {
    const a = baueSpalte(TAFEL, { aenderbar: false });
    karten(a.container)[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(erzeugeKanbanNotiz(0)).toBe(false);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(showStatusbarHint).toHaveBeenCalledWith('kanban.nurLesbar', expect.any(Object));
    expect(vorlagen.legeNeueDateiAn).not.toHaveBeenCalled();
    a.tab.viewMode = 'preview';
    expect(erzeugeKanbanNotiz(0)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(showStatusbarHint).toHaveBeenCalledWith('kanban.nurInAnsicht', expect.any(Object));
  });

  it('Registry, Erweiterung, Dispatcher und Palette', () => {
    const eintrag = COMMANDS.find((c) => c.id === 'kanban.noteFromCard');
    expect(eintrag).toMatchObject({
      labelKey: 'command.kanban.noteFromCard',
      availability: 'tafelKarte',
      menu: false,
    });
    expect(extensionById('kanban').commands).toContain('kanban.noteFromCard');
    expect(disabledCommandIdSet(['kanban']).has('kanban.noteFromCard')).toBe(true);
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'kanban.noteFromCard': () => erzeugeKanbanNotiz(state.activePaneIndex)",
    );
  });

  it('die neuen Texte liegen in allen fünf Sprachen vor', () => {
    const schluessel = [
      'kanban.notizAusKarte',
      'kanban.notiz.keineVorlage',
      'kanban.notiz.vorhandenFrage',
      'kanban.notiz.andererName',
      'kanban.notiz.verweisen',
      'kanban.notiz.ordnerFehlt',
      'kanban.notiz.vorlageFehlt',
      'kanban.notiz.verworfen',
      'kanban.notiz.leer',
      'command.kanban.noteFromCard',
    ];
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const buch = JSON.parse(lies(`src/i18n/${code}.json`));
      for (const k of schluessel) expect(buch[k], `${code}: ${k}`).toBeTruthy();
      expect(buch['kanban.notizAusKarte'].endsWith('…'), code).toBe(true);
      expect(buch['kanban.notiz.vorhandenFrage']).toContain('{name}');
    }
  });
});
