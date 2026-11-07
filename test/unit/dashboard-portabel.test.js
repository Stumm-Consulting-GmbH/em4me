// @vitest-environment jsdom
// 4T-002518 (Epic 3E-000402): Das Dashboard im portablen Export (Story
// 4S-001187, AK3, AK4; Story 4S-001188, AK5). Geprüft werden der prozess-neutrale
// Kern src/shared/dashboard/dashboard-portabel.js (welches Markdown an die
// Stelle eines Blocks tritt) und der Schritt des Anzeige-Prozesses
// src/renderer/modules/dashboard/dashboard-export.js (wie eine Kachel mit der
// Vorbelegung ausgewertet wird, mit gestellter Brücke).
//
// Dass die Datei im laufenden Programm entsteht und im Browser lesbar ist,
// weist test/e2e/funktionen/dashboard-ansichten.spec.js nach.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './renderer/api-stub.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  dashboardPortabel,
  ersetzeDashboardBloecke,
  findeDashboardBloecke,
  kennzahlMarkdown,
  listeMarkdown,
  tabelleMarkdown,
  ueberschriftEbene,
  vorbelegungsWerte,
  vorbelegungsZeile,
  woertlich,
} from '../../src/shared/dashboard/dashboard-portabel.js';
import { dashboardSicht, parseDashboardFence } from '../../src/shared/dashboard/dashboard-core.js';
import { convertMarkdownPortable } from '../../src/shared/markdown/markdown.js';
import {
  blockOrigin,
  fileOrigin,
  makeColumn,
  makeGroup,
  makeResultSet,
  makeRow,
  makeState,
  makeWishes,
  recordOrigin,
  taskOrigin,
} from '../../src/shared/query/result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
// Bestands-Lesung im Modulkopf (test/README.md).
const de = JSON.parse(readFileSync(path.join(dir, '../../src/i18n/de.json'), 'utf8'));
const L = (key) => de[key] ?? key;

const Z = '`'.repeat(3);
const block = (...zeilen) => [`${Z}perspective-dashboard`, ...zeilen, Z].join('\n');
const sichtVon = (rumpf) => dashboardSicht(parseDashboardFence(rumpf));
const rumpf = (...zeilen) => zeilen.join('\n');

const spalte = (label) => makeColumn({ name: label, label, source: label });
const datei = (name) => fileOrigin(`/raum/${name}.md`, name);
const zeile = (name, values = []) => makeRow(values, datei(name));
function menge({
  scope = 'files',
  type = 'list',
  columns = [],
  rows = [],
  groups = null,
  groupColumns = null,
  wishes,
} = {}) {
  return makeResultSet({
    scope,
    type,
    columns,
    rows,
    groups,
    groupColumns,
    wishes: makeWishes(wishes),
    state: makeState('ready', { area: { root: '/raum', fileCount: 3 } }),
  });
}
function gruppe(value, rows, values) {
  const g = makeGroup(value, rows);
  if (values) g.values = values;
  return g;
}

// --- Stelle im Dokument ----------------------------------------------------------

describe('Blöcke finden und über Zeichen-Positionen ersetzen', () => {
  it('findet nur Blöcke der obersten Ebene, nicht den zitierten in einem äußeren Zaun', () => {
    const text = [
      'Vor',
      block('!kachel text', 'A'),
      '````md',
      block('!kachel text', 'B'),
      '````',
    ].join('\n');
    const bloecke = findeDashboardBloecke(text);
    expect(bloecke).toHaveLength(1);
    expect(bloecke[0].body).toBe('!kachel text\nA\n');
  });

  it('lässt alles außerhalb byte-gleich und setzt `$`-Folgen im Ersatz wörtlich ein (L7)', () => {
    const text = `Vorher $& und $1\n${block('!kachel text', 'A')}\nNachher $'`;
    const aus = ersetzeDashboardBloecke(text, () => 'ERSATZ $& $1 $$');
    expect(aus).toBe("Vorher $& und $1\n\nERSATZ $& $1 $$\n\nNachher $'");
  });

  it('setzt Leerzeilen nur, wo der Ersatz sonst einen Absatz fortsetzte', () => {
    const text = `A\n\n${block('!kachel text', 'x')}\n\nB`;
    expect(ersetzeDashboardBloecke(text, () => 'E')).toBe('A\n\nE\n\nB');
    expect(ersetzeDashboardBloecke(block('!kachel text'), () => 'E')).toBe('E');
  });

  it('lässt einen Block mit Ersatz null stehen und ersetzt die übrigen in Reihenfolge', () => {
    const text = [block('!kachel text', 'eins'), '', block('!kachel text', 'zwei')].join('\n');
    const aus = ersetzeDashboardBloecke(text, (b, nr) => (nr === 0 ? null : `Nr ${nr}`));
    expect(aus).toBe([block('!kachel text', 'eins'), '', 'Nr 1'].join('\n'));
  });

  it('reicht jeden Block an den Bauer durch und ordnet den Ersatz über seine Stelle zu, auch bei offenem Schluss-Block (Befund A6; Zähler und Stelle fallen hier zusammen, geprüft wird die Durchreichung)', () => {
    // Ein nicht geschlossener Zaun im Zitat ist kein Block; davor, dazwischen
    // und danach je ein Block, der letzte bis zum Textende offen.
    const offen = `> ${Z}perspective-dashboard\n> !kachel text\n> nie geschlossen`;
    const text = [
      block('!kachel text', 'eins'),
      '',
      offen,
      '',
      block('!kachel text', 'zwei'),
      '',
      `${Z}perspective-dashboard`,
      '!kachel text',
      'drei',
    ].join('\n');
    const gesehen = [];
    const aus = ersetzeDashboardBloecke(text, (b, nr) => {
      gesehen.push([nr, b.start, b.geschlossen, b.body]);
      return nr === 0 ? null : `Nr ${nr}`;
    });
    const zweiterStart = text.indexOf(block('!kachel text', 'zwei'));
    const dritterStart = text.lastIndexOf(`${Z}perspective-dashboard`);
    expect(gesehen).toEqual([
      [0, 0, true, '!kachel text\neins\n'],
      [1, zweiterStart, true, '!kachel text\nzwei\n'],
      [2, dritterStart, false, '!kachel text\ndrei'],
    ]);
    expect(aus).toBe([block('!kachel text', 'eins'), '', offen, '', 'Nr 1', '', 'Nr 2'].join('\n'));
  });

  it('behält die Einrückung eines Blocks unter einem Listenpunkt', () => {
    const text = `- Punkt\n\n  ${Z}perspective-dashboard\n  !kachel text\n  ${Z}\n`;
    const aus = ersetzeDashboardBloecke(text, () => 'Zeile 1\n\nZeile 2');
    expect(aus).toBe('- Punkt\n\n  Zeile 1\n\n  Zeile 2\n');
  });

  it('ordnet die Kachel-Überschriften eine Ebene unter die letzte Überschrift davor ein', () => {
    const text = `# T\n\n## Abschnitt\n\n${Z}js\n# kein Titel\n${Z}\n${block()}`;
    expect(ueberschriftEbene(text, text.indexOf(`${Z}perspective`))).toBe(3);
    expect(ueberschriftEbene('Text\n', 5)).toBe(2);
    expect(ueberschriftEbene('###### Tief\n', 12)).toBe(6);
  });
});

// --- Vorbelegung ----------------------------------------------------------------------

describe('Vorbelegung (AK4: die Vorbelegung steht als Beschriftung über den Kacheln)', () => {
  const sicht = sichtVon(
    rumpf(
      '!filter status titel="Status" vorbelegung=offen',
      '!filter prio titel="Priorität"',
      'hoch',
      'niedrig',
      '!filter art vorbelegung=fehlt',
      'a',
      '!kachel text',
      'x',
    ),
  );

  it('nennt die Filter in Block-Reihenfolge als «Titel: Wert», «alle» ohne Wert', () => {
    expect(vorbelegungsZeile(sicht, L)).toBe(
      '*Stand der Vorbelegung\\: Status\\: offen; Priorität\\: alle; art\\: alle*',
    );
    expect(vorbelegungsWerte(sicht)).toEqual({ status: 'offen', prio: null, art: null });
  });

  it('entfällt ohne Filter', () => {
    expect(vorbelegungsZeile(sichtVon('!kachel text\nx'), L)).toBe('');
  });

  it('übergibt höchstens zwanzig Filter und keinen Wert über 500 Zeichen', () => {
    const filter = Array.from(
      { length: 22 },
      (_, i) => `!filter f${i} vorbelegung=${i === 0 ? 'x'.repeat(501) : 'w'}`,
    );
    const werte = vorbelegungsWerte(sichtVon(rumpf(...filter)));
    expect(Object.keys(werte)).toHaveLength(20);
    expect(werte.f0).toBeNull();
    expect(werte.f1).toBe('w');
  });
});

// --- Kachel-Arten (AK3) -----------------------------------------------------------------

describe('Kachel-Arten als statischer Text (AK3)', () => {
  it('Kennzahl: ein Wert fett, mehrere als Aufzählung mit Beschriftung', () => {
    expect(kennzahlMarkdown([{ wert: '1.234' }])).toBe('**1\\.234**');
    expect(
      kennzahlMarkdown([
        { wert: '3', beschriftung: 'hoch' },
        { wert: '1', beschriftung: 'niedrig' },
      ]),
    ).toBe('- **3** hoch\n- **1** niedrig');
  });

  it('Liste: Treffer als Verweis, Zusatzfeld dahinter, Block mit Anker, Datensatz als Text', () => {
    const rs = menge({
      columns: [spalte('status')],
      rows: [
        zeile('Alpha', ['offen']),
        makeRow([null], blockOrigin('/raum/B.md', 'B', 'abc')),
        makeRow([null], recordOrigin('/raum/T.md', 'r1')),
        zeile('Gamma [x]', ['zu']),
      ],
    });
    expect(listeMarkdown(rs, L)).toBe(
      [
        '- [[Alpha]] — offen',
        '- [[B#^abc]]',
        `- ${woertlich(rs.rows[2].origin.display || rs.rows[2].origin.id || '')}`,
        '- Gamma \\[x\\] — zu',
      ].join('\n'),
    );
  });

  it('Liste: Aufgaben mit Zustand, Text und Datei', () => {
    const rs = menge({
      scope: 'tasks',
      rows: [
        makeRow([], taskOrigin('/raum/A.md', 'A', 3, '- [ ] Einkaufen #heute')),
        makeRow([], taskOrigin('/raum/A.md', 'A', 4, '  * [x] Fertig')),
      ],
    });
    expect(listeMarkdown(rs, L)).toBe('- [ ] Einkaufen \\#heute ([[A]])\n- [x] Fertig ([[A]])');
  });

  it('Liste mit Gruppen: Gruppe als Punkt, Treffer eingerückt, Gruppe ohne Wert benannt', () => {
    const rs = menge({
      rows: [zeile('a'), zeile('b'), zeile('c')],
      groups: [gruppe('offen', [0, 1]), gruppe(null, [2])],
    });
    expect(listeMarkdown(rs, L)).toBe(
      [
        '- **offen**',
        '  - [[a]]',
        '  - [[b]]',
        `- **${woertlich(L('query.group.none'))}**`,
        '  - [[c]]',
      ].join('\n'),
    );
  });

  it('Tabelle: Kopf mit «Datei», Verweise in Zellen, Trennstrich im Wert geschützt', () => {
    const link = { kind: 'link', path: '/raum/Ziel.md', name: 'Ziel' };
    const rs = menge({
      type: 'table',
      columns: [spalte('wert'), spalte('ziel')],
      rows: [zeile('A', ['x|y', link])],
    });
    expect(tabelleMarkdown(rs, L)).toBe(
      ['| Datei | wert | ziel |', '| --- | --- | --- |', '| [[A]] | x\\|y | [[Ziel]] |'].join('\n'),
    );
  });

  it('Tabelle ohne ID und mit Gruppen: Gruppen-Spalte vorn, Wert über der Gruppe', () => {
    const ohneId = menge({
      type: 'table',
      columns: [spalte('n')],
      rows: [zeile('A', [2])],
      wishes: { withoutId: true },
    });
    expect(tabelleMarkdown(ohneId, L)).toBe('| n |\n| --- |\n| 2 |');
    const gruppiert = menge({
      type: 'table',
      columns: [spalte('Anzahl')],
      rows: [zeile('a', [null]), zeile('b', [null])],
      groups: [gruppe('offen', [0], [1]), gruppe('zu', [1], [1])],
      groupColumns: [spalte('status')],
    });
    expect(tabelleMarkdown(gruppiert, L)).toBe(
      ['| status | Anzahl |', '| --- | --- |', '| offen | 1 |', '| zu | 1 |'].join('\n'),
    );
  });
});

// --- Der ganze Block -------------------------------------------------------------------------

describe('Der ganze Block im Export (AK3, AK4)', () => {
  const RUMPF = rumpf(
    '!filter status titel="Status" vorbelegung=offen',
    '!kachel kennzahl titel="Offen"',
    'LIST WHERE status = $status',
    '!kachel balken titel="Je Status"',
    'TABLE count() AS "n" GROUP BY status',
    '!zeile',
    '!kachel text',
    '## Notiz',
    'Siehe [[Regeln]].',
    '!kachel liste titel="Datei" abfrage="Abfragen/Fehlt"',
    '!kachel quatsch titel="Kaputt"',
    'LIST',
    '!kachel tabelle titel="Langsam"',
    'TABLE status',
  );
  const BILD = '<img alt="Je Status" src="data:image/svg+xml;base64,PHN2Zz4=">\n';

  function export_(ergebnisse) {
    return dashboardPortabel(sichtVon(RUMPF), new Map(ergebnisse), { L, ebene: 3 });
  }

  it('zeigt Vorbelegung, Überschriften, Werte, Bild, Text und Fehler untereinander', () => {
    const aus = export_([
      [1, { art: 'kennzahl', eintraege: [{ wert: '2' }] }],
      [2, { art: 'bild', bild: BILD, zeilen: ['1 Wert ausgelassen'] }],
      [5, { art: 'fehler', code: 'abfrageDateiFehlt', name: 'Abfragen/Fehlt' }],
    ]);
    expect(aus).toBe(
      [
        '*Stand der Vorbelegung\\: Status\\: offen*',
        '### Offen',
        '**2**',
        '### Je Status',
        BILD.trimEnd(),
        '*1 Wert ausgelassen*',
        '## Notiz\nSiehe [[Regeln]].',
        '### Datei',
        `*Zeile 10 ${woertlich(L('dashboard.hint.abfrageDateiFehlt').replace('{detail}', 'Abfragen/Fehlt'))}*`,
        '### Kaputt',
        `*Zeile 11 ${woertlich(L('dashboard.hint.artUnbekannt').replace('{detail}', 'quatsch'))}*`,
        '### Langsam',
        `*${woertlich(L('dashboard.hint.exportNichtAusgewertet'))}*`,
      ].join('\n\n'),
    );
  });

  it('die Kachel «Datei» trägt ihre Abfrage-Datei als Angabe, nicht als Inhalt (Befund A5)', () => {
    const kacheln = sichtVon(RUMPF).zeilen.flatMap((z) => z.kacheln);
    const k = kacheln.find((x) => x.titel === 'Datei');
    expect(k.index).toBe(5);
    expect(k.quelle).toEqual({ typ: 'datei', ziel: 'Abfragen/Fehlt' });
    const aus = export_([
      [5, { art: 'fehler', code: 'abfrageDateiFehlt', name: 'Abfragen/Fehlt' }],
    ]);
    expect(aus).toContain(
      `### Datei\n\n*Zeile 10 ${woertlich(L('dashboard.hint.abfrageDateiFehlt').replace('{detail}', 'Abfragen/Fehlt'))}*`,
    );
  });

  it('enthält keine Auswahlfelder, keinen Quelltext einer Kachel und keinen Hinweis auf fehlende Bedienung (AK4)', () => {
    const aus = export_([]);
    expect(aus).not.toMatch(/select|option|perspective-dashboard|!kachel|!filter/i);
    expect(aus).not.toContain('LIST WHERE');
    expect(aus).not.toContain('TABLE count');
  });

  it('setzt Hinweise der Abfrage als Absatz über das Ergebnis', () => {
    const rs = menge({ rows: [zeile('A')] });
    const aus = dashboardPortabel(
      sichtVon(rumpf('!kachel liste titel="L"', 'LIST')),
      new Map([[0, { art: 'liste', hinweise: ['Ein Hinweis.'], resultSet: rs }]]),
      { L },
    );
    expect(aus).toBe('## L\n\n*Ein Hinweis\\.*\n\n- [[A]]');
  });

  it('zeigt den leeren Block und sammelt die Befunde ohne Platz am Fuß', () => {
    const aus = dashboardPortabel(
      sichtVon(rumpf('!filter a vorbelegung=x', 'b', '!foo')),
      new Map(),
      { L },
    );
    expect(aus.split('\n\n')).toEqual([
      '*Stand der Vorbelegung\\: a\\: alle*',
      `*${woertlich(L('dashboard.hint.leer'))}*`,
      `*${woertlich(L('dashboard.hint.sammel'))}*`,
      `*Zeile 1 ${woertlich(L('dashboard.hint.vorbelegungUnbekannt').replace('{detail}', 'x'))}*`,
      `*Zeile 3 ${woertlich(L('dashboard.hint.markerUnbekannt').replace('{detail}', 'foo'))}*`,
    ]);
  });

  it('übersteht die Umwandlung: Werte bleiben wörtlich, Kommentare der Text-Kachel fallen weg', () => {
    const text = `# Doc\n\n${block('!kachel text', '%% privat %%', 'Text', '!kachel kennzahl titel="K"', 'LIST')}\n`;
    const ersetzt = ersetzeDashboardBloecke(text, (b) =>
      dashboardPortabel(
        sichtVon(b.body),
        new Map([[1, { art: 'kennzahl', eintraege: [{ wert: '%%5%% {=1+1}' }] }]]),
        {
          L,
          ebene: ueberschriftEbene(text, b.start),
        },
      ),
    );
    const portabel = convertMarkdownPortable(ersetzt, true, 'de');
    expect(portabel).not.toContain('privat');
    expect(portabel).toContain('Text');
    expect(portabel).toContain('## K');
    expect(portabel).toContain('**\\%\\%5\\%\\% \\{\\=1\\+1\\}**');
  });
});

// --- Schritt des Anzeige-Prozesses ---------------------------------------------------------

const antworten = new Map();
window.api.runFrontmatterQuery = vi.fn(async (basePath, query, _locale, werte) => {
  const f = antworten.get(query);
  return typeof f === 'function' ? f(basePath, werte) : f;
});
window.api.dashboardAbfrageDatei = vi.fn(async (_basePath, ziel) =>
  ziel === 'Gemeinsam'
    ? { ok: true, abfrage: 'LIST', pfad: '/raum/Gemeinsam.md' }
    : { ok: false, code: 'abfrageDateiFehlt', name: ziel },
);
window.api.buildChartFromInput = vi.fn(() => ({ status: 'drawn', svg: '<svg>bild</svg>' }));

const i18n = await import('../../src/renderer/i18n.js');
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
await i18n.loadTranslations('de');
const { applyExtensionsState } =
  await import('../../src/renderer/modules/extensions/extension-lifecycle.js');
const { VORGABE_FORM: BLOCK_FORMEN } = await import('../../src/shared/markdown/dashboard-block.js');
const { replaceDashboardFencesForExport, ergebnisAusAntwort, VORGABE_FORM } =
  await import('../../src/renderer/modules/dashboard/dashboard-export.js');

describe('Auswertung im Anzeige-Prozess', () => {
  it('wählt je Art dieselbe Vorgabe-Form wie das Markup des Blocks', () => {
    expect(VORGABE_FORM).toEqual(BLOCK_FORMEN);
  });

  beforeEach(() => {
    antworten.clear();
    window.api.runFrontmatterQuery.mockClear();
  });

  it('wertet mit der Vorbelegung aus und löst eine Abfrage-Datei mit ihrem Grundpfad auf', async () => {
    await applyExtensionsState([], { persist: false });
    antworten.set('LIST WHERE status = $status', {
      resultSet: menge({ rows: [zeile('A'), zeile('B')] }),
    });
    antworten.set('LIST', { resultSet: menge({ rows: [zeile('C')] }) });
    const text = `# D\n\n${block(
      '!filter status vorbelegung=offen',
      '!kachel kennzahl titel="Zahl"',
      'LIST WHERE status = $status',
      '!kachel liste titel="Geteilt" abfrage="Gemeinsam"',
      '!kachel liste titel="Weg" abfrage="Weg"',
    )}\n`;
    const aus = await replaceDashboardFencesForExport(text, '/raum/D.md');
    expect(window.api.runFrontmatterQuery).toHaveBeenCalledWith(
      '/raum/D.md',
      'LIST WHERE status = $status',
      expect.anything(),
      { status: 'offen' },
    );
    expect(window.api.runFrontmatterQuery).toHaveBeenCalledWith(
      '/raum/Gemeinsam.md',
      'LIST',
      expect.anything(),
      { status: 'offen' },
    );
    expect(aus).toContain('## Zahl\n\n**2**');
    expect(aus).toContain('## Geteilt\n\n- [[C]]');
    expect(aus).toContain(
      `## Weg\n\n*Zeile 5 ${woertlich(L('dashboard.hint.abfrageDateiFehlt').replace('{detail}', 'Weg'))}*`,
    );
  });

  it('zeichnet Balken hell als eingebettetes Bild und fällt bei unpassender Menge auf die Tabelle zurück', () => {
    const tabelle = menge({
      type: 'table',
      columns: [spalte('n')],
      rows: [zeile('a', [null]), zeile('b', [null])],
      groups: [gruppe('x', [0], [2]), gruppe('y', [1], [3])],
      groupColumns: [spalte('k')],
    });
    const bild = ergebnisAusAntwort({ resultSet: tabelle }, 'bar', { kennung: '0-1', titel: 'B' });
    expect(bild.art).toBe('bild');
    expect(bild.bild).toMatch(/^<img alt="B" src="data:image\/svg\+xml;base64,/);
    const angaben = window.api.buildChartFromInput.mock.calls.at(-1)[1];
    expect(angaben.idPrefix).toBe('dbx-0-1');
    expect(angaben.colors.background).toBeTruthy();
    const liste = ergebnisAusAntwort({ resultSet: menge({ rows: [zeile('a')] }) }, 'bar', {
      kennung: '0-2',
      titel: '',
    });
    expect(liste.art).toBe('liste');
    expect(liste.hinweise.length).toBe(1);
  });

  it('meldet Zustände ohne Treffer-Liste als Hinweis', () => {
    expect(
      ergebnisAusAntwort({ status: 'unavailable' }, 'liste', { kennung: 'x', titel: '' }),
    ).toEqual({
      art: 'hinweise',
      hinweise: [L('query.unavailable')],
    });
  });

  it('lässt im Aus-Zustand den Block als Code-Block stehen (Story 4S-001188, AK5)', async () => {
    await applyExtensionsState(['dashboard'], { persist: false });
    const text = `${block('!kachel kennzahl', 'LIST')}\n`;
    expect(await replaceDashboardFencesForExport(text, '/raum/D.md')).toBe(text);
    expect(window.api.runFrontmatterQuery).not.toHaveBeenCalled();
    await applyExtensionsState([], { persist: false });
  });

  it('ohne Pfad zeigt eine Kachel mit Abfrage-Datei den Hinweis eines ungespeicherten Dokuments (Befund B1)', async () => {
    await applyExtensionsState([], { persist: false });
    window.api.dashboardAbfrageDatei.mockClear();
    const text = `${block('!kachel liste titel="Geteilt" abfrage="Gemeinsam"')}\n`;
    const aus = await replaceDashboardFencesForExport(text, '');
    expect(aus).toBe(`## Geteilt\n\n*${woertlich(L('query.unavailable'))}*\n`);
    expect(window.api.dashboardAbfrageDatei).not.toHaveBeenCalled();
  });

  it('meldet eine nicht lesbare Abfrage-Datei mit ihrem eigenen Hinweis (Befund A2)', async () => {
    await applyExtensionsState([], { persist: false });
    window.api.dashboardAbfrageDatei.mockImplementationOnce(async (_b, ziel) => ({
      ok: false,
      code: 'abfrageDateiNichtLesbar',
      name: ziel,
    }));
    const text = `${block('!kachel liste titel="Gross" abfrage="Riesig"')}\n`;
    const aus = await replaceDashboardFencesForExport(text, '/raum/D.md');
    expect(aus).toContain(
      woertlich(L('dashboard.hint.abfrageDateiNichtLesbar').replace('{detail}', 'Riesig')),
    );
  });

  it('gibt eine nicht rechtzeitig ausgewertete Kachel mit Hinweis aus und läuft weiter', async () => {
    vi.useFakeTimers();
    try {
      antworten.set('LIST', () => new Promise(() => {}));
      const lauf = replaceDashboardFencesForExport(
        `${block('!kachel kennzahl titel="K"', 'LIST')}\n`,
        '/raum/D.md',
      );
      await vi.advanceTimersByTimeAsync(10000);
      const aus = await lauf;
      expect(aus).toBe(`## K\n\n*${woertlich(L('dashboard.hint.exportNichtAusgewertet'))}*\n`);
    } finally {
      vi.useRealTimers();
    }
  });
});
