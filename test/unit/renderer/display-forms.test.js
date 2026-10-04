// @vitest-environment jsdom
// 4T-002043 (Epic 3E-000258): Wahl der Darstellungsform (DISPLAY) und ihr
// Verteiler am Einstieg der Befüllung. Geprüft wird über `buildQueryListDom`
// mit Ergebnismengen aus den Aufbau-Funktionen des Format-Vertrags, dazu das
// Verzeichnis der Formen (`display-forms.js`) und die Kette vom Abfrage-Text bis
// zum Wunsch in der Menge.
//
// **Eigene Prüfdatei** statt einer Ergänzung von frontmatter-query-view.test.js,
// weil jene an ihrem Größen-Budget steht. Der Nachweis «ohne Angabe byte-gleich»
// ruht auf zwei Säulen: dem unveränderten Vergleichs-Prüffall
// ergebnismenge-vorher-nachher.test.js (Momentaufnahme aller bestehenden
// Ausgaben) und den Fällen unten, die den Rückfall byte-gleich gegen die
// Ausgabe ohne Angabe halten.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import {
  registerDisplayForm,
  drawDisplayForm,
} from '../../../src/renderer/modules/query/display-forms.js';
import {
  makeColumn,
  fileOrigin,
  taskOrigin,
  recordOrigin,
  makeTaskInfo,
  makeRow,
  makeWishes,
  makeState,
  makeResultSet,
  validateResultSet,
} from '../../../src/shared/query/result-set.js';
import { parseQuery } from '../../../src/shared/query/perspective-query.js';
import { buildResultSet } from '../../../src/main/index/query-result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sprache = (code) =>
  JSON.parse(readFileSync(path.join(dir, `../../../src/i18n/${code}.json`), 'utf8'));
const de = sprache('de');
const tStub = (key) => de[key] ?? key;

function html(resultSet, translate = tStub) {
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom({ resultSet }, translate));
  return host;
}

// Eine Menge im Zustand «ready»; `display` wird zum Wunsch der Menge.
function menge({ scope = 'files', type = 'list', columns = [], rows, wishes = {}, hint = null }) {
  return makeResultSet({
    scope,
    type,
    columns,
    rows,
    wishes: makeWishes(wishes),
    state: makeState('ready', { hint, area: { root: '/raum', fileCount: 3 } }),
  });
}

const spalte = (name) => makeColumn({ name, label: name, source: name });
const dateiZeile = (name, wert) => makeRow([wert], fileOrigin(`/raum/${name}.md`, name));
const aufgabe = (line) =>
  makeRow(
    [],
    taskOrigin('/raum/Aufgaben.md', 'Aufgaben', line, `- [ ] Eins ${line}`),
    makeTaskInfo({ urgency: 1, blocked: false, duplicateId: false }),
  );
const datensatz = (id, name) => ({
  ...recordOrigin('Team', id),
  path: '/raum/Team.md',
  display: name,
});

// Die vier Ausgaben ohne Angabe: Liste, Tabelle, Aufgaben-Liste, Datensätze.
const FAELLE = {
  liste: () => ({ columns: [spalte('status')], rows: [dateiZeile('Alpha', 'offen')] }),
  tabelle: () => ({
    type: 'table',
    columns: [spalte('prio')],
    rows: [dateiZeile('Alpha', 1), dateiZeile('Beta', 5)],
  }),
  aufgaben: () => ({ scope: 'tasks', rows: [aufgabe(3), aufgabe(7)] }),
  datensaetze: () => ({
    scope: 'records',
    type: 'table',
    rows: [makeRow([], datensatz('r-00001', 'Clara'))],
  }),
};

const hinweis = (host) => host.querySelector('.perspective-query-hint');
const ohneHinweis = (host) => {
  hinweis(host)?.remove();
  return host.innerHTML;
};

let abmelden = [];
afterEach(() => {
  for (const ab of abmelden) ab();
  abmelden = [];
  vi.restoreAllMocks();
});
function eintragen(name, form) {
  abmelden.push(registerDisplayForm(name, form));
}

describe('Ohne Angabe: alles wie bisher (AK1)', () => {
  it('der Verteiler liefert nichts, die Ausgabe hat keinen Hinweis', () => {
    for (const [fall, bau] of Object.entries(FAELLE)) {
      const rs = menge(bau());
      expect(drawDisplayForm(rs, { translate: tStub }), fall).toEqual({
        node: null,
        hint: null,
        name: null,
      });
      expect(hinweis(html(rs)), fall).toBeNull();
    }
  });

  it('der Abfrage-Text trägt die Angabe bis in die Menge, ohne sie fehlt der Wunsch', () => {
    const area = { root: '/raum', fileCount: 1 };
    const mit = buildResultSet([], parseQuery('TABLE a DISPLAY Sparkles BY x').ast, area);
    expect(mit.wishes.display).toEqual({ form: 'sparkles', by: 'x' });
    expect(validateResultSet(mit)).toEqual([]);
    const ohne = buildResultSet([], parseQuery('TABLE a').ast, area);
    expect(Object.hasOwn(ohne.wishes, 'display')).toBe(false);
  });
});

describe('Unbekannte Form: Ausgabe ohne Angabe mit Hinweis (AK3)', () => {
  it('Liste bleibt Liste, Tabelle bleibt Tabelle, auf allen vier Ebenen byte-gleich', () => {
    for (const [fall, bau] of Object.entries(FAELLE)) {
      const ohne = html(menge(bau())).innerHTML;
      const host = html(menge({ ...bau(), wishes: { display: { form: 'sparkles' } } }));
      expect(hinweis(host).textContent, fall).toBe(
        de['query.hint.displayFormUnknown'].replace('{name}', 'sparkles'),
      );
      // Der Hinweis steht zuerst, darunter genau die Ausgabe ohne Angabe.
      expect(host.firstElementChild, fall).toBe(hinweis(host));
      expect(ohneHinweis(host), fall).toBe(ohne);
    }
    const liste = html(menge({ ...FAELLE.liste(), wishes: { display: { form: 'x' } } }));
    expect(liste.querySelector('ul.perspective-query-list')).not.toBeNull();
    const tabelle = html(menge({ ...FAELLE.tabelle(), wishes: { display: { form: 'x' } } }));
    expect(tabelle.querySelector('table.perspective-query-table')).not.toBeNull();
  });

  it('der Hinweis steht in allen fünf Sprachen mit dem Namen der Form, nie als Fehler', () => {
    const rs = menge({ ...FAELLE.tabelle(), wishes: { display: { form: 'balken' } } });
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = sprache(code);
      const host = html(rs, (key) => texte[key] ?? key);
      const text = hinweis(host).textContent;
      expect(text, code).toContain("'balken'");
      expect(text, code).not.toContain('{name}');
      expect(text, code).toBe(texte['query.hint.displayFormUnknown'].replace('{name}', 'balken'));
      expect(host.querySelector('.perspective-query-error'), code).toBeNull();
    }
  });

  it('ein Hinweis des Zustands geht vor: dann bleibt die Ausgabe ganz unverändert', () => {
    const bau = { ...FAELLE.tabelle(), hint: 'columnsIgnored' };
    const ohne = html(menge(bau)).innerHTML;
    const mit = html(menge({ ...bau, wishes: { display: { form: 'sparkles' } } }));
    expect(hinweis(mit).textContent).toBe(de['query.hint.columnsIgnored']);
    expect(mit.innerHTML).toBe(ohne);
  });
});

describe('Unpassende Form: Ausgabe ohne Angabe mit Hinweis (AK3)', () => {
  it('die Eignungs-Prüfung sagt nein: nichts gezeichnet, Hinweis «passt nicht»', () => {
    const render = vi.fn();
    eintragen('baum', { isSuitable: (rs) => rs.scope === 'records', render });
    const bau = FAELLE.liste();
    const host = html(menge({ ...bau, wishes: { display: { form: 'baum', by: 'chef' } } }));
    expect(render).not.toHaveBeenCalled();
    expect(hinweis(host).textContent).toBe(
      de['query.hint.displayFormUnsuitable'].replace('{name}', 'baum'),
    );
    expect(ohneHinweis(host)).toBe(html(menge(bau)).innerHTML);
  });

  it('eine Form, die in Prüfung oder Zeichnung scheitert, fällt ebenso zurück', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kaputt = [
      {
        isSuitable: () => {
          throw new Error('Prüfung');
        },
        render: () => document.createElement('div'),
      },
      {
        isSuitable: () => true,
        render: () => {
          throw new Error('Zeichnung');
        },
      },
      { isSuitable: () => true, render: () => 'kein Knoten' },
    ];
    for (const form of kaputt) {
      const ab = registerDisplayForm('kaputt', form);
      const bau = FAELLE.tabelle();
      const host = html(menge({ ...bau, wishes: { display: { form: 'kaputt' } } }));
      expect(hinweis(host).textContent).toBe(
        de['query.hint.displayFormUnsuitable'].replace('{name}', 'kaputt'),
      );
      expect(ohneHinweis(host)).toBe(html(menge(bau)).innerHTML);
      ab();
    }
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe('Bekannte und passende Form zeichnet (AK2, AK4)', () => {
  it('statt Liste oder Tabelle erscheint die Form, mit Menge und Übersetzung im Kontext', () => {
    const render = vi.fn((rs, kontext) => {
      const el = document.createElement('div');
      el.className = 'form-probe';
      el.textContent = `${rs.rows.length} ${kontext.translate('query.table.recordColumn')}`;
      return el;
    });
    eintragen('Probe', { isSuitable: () => true, render });
    for (const [fall, bau] of Object.entries(FAELLE)) {
      const rs = menge({ ...bau(), wishes: { display: { form: 'probe', by: 'chef' } } });
      const host = html(rs);
      expect(host.children.length, fall).toBe(1);
      expect(host.querySelector('.form-probe').textContent, fall).toBe(
        `${rs.rows.length} Datensatz`,
      );
      expect(host.querySelector('ul, table'), fall).toBeNull();
      expect(render.mock.calls.at(-1)[0], fall).toBe(rs);
    }
  });

  it('Wünsche, die die Form nicht kennt, übergeht sie ohne Hinweis; der des Zustands bleibt', () => {
    eintragen('probe', {
      isSuitable: () => true,
      render: () => document.createElement('section'),
    });
    const wishes = { layoutColumns: 3, short: true, hide: ['due'], display: { form: 'probe' } };
    expect(hinweis(html(menge({ ...FAELLE.liste(), wishes })))).toBeNull();
    const mitZustand = html(menge({ ...FAELLE.datensaetze(), wishes, hint: 'recordHullCycle' }));
    expect(hinweis(mitZustand).textContent).toBe(de['query.hint.recordHullCycle']);
    expect(mitZustand.lastElementChild.tagName).toBe('SECTION');
  });

  it('ein leeres Ergebnis zeigt «keine Treffer» wie bisher, ohne Form und ohne Hinweis', () => {
    const render = vi.fn(() => document.createElement('div'));
    eintragen('probe', { isSuitable: () => true, render });
    for (const form of ['probe', 'sparkles']) {
      const host = html(menge({ rows: [], wishes: { display: { form } } }));
      expect(host.textContent).toBe(de['query.empty']);
      expect(hinweis(host)).toBeNull();
    }
    expect(render).not.toHaveBeenCalled();
  });
});

describe('Verzeichnis der Formen', () => {
  it('ein Name gilt einmal; Eintrag ohne Name oder Funktionen wirft', () => {
    const form = { isSuitable: () => true, render: () => document.createElement('div') };
    eintragen('doppelt', form);
    expect(() => registerDisplayForm('DOPPELT', form)).toThrow(/schon eingetragen/);
    expect(() => registerDisplayForm('', form)).toThrow(TypeError);
    expect(() => registerDisplayForm('ohne', { isSuitable: () => true })).toThrow(TypeError);
  });

  it('der Name gilt ohne Rücksicht auf die Schreibung; das Austragen macht die Form unbekannt', () => {
    const ab = registerDisplayForm('Weg', {
      isSuitable: () => true,
      render: () => document.createElement('div'),
    });
    // Eine Menge, die nicht aus dem Parser kommt, kann die Form groß schreiben.
    const rs = menge({ ...FAELLE.liste(), wishes: { display: { form: 'WEG' } } });
    expect(drawDisplayForm(rs, { translate: tStub }).node).not.toBeNull();
    ab();
    expect(drawDisplayForm(rs, { translate: tStub })).toEqual({
      node: null,
      hint: 'displayFormUnknown',
      name: 'WEG',
    });
  });

  // Die Ausgaben ohne Angabe sind keine Formen des Verzeichnisses, die Diagramme
  // kommen erst mit 3E-000337; bis dahin zeigen sie den Rückfall mit Hinweis.
  it('Diagramme, Tabelle und Liste sind (noch) keine wählbaren Formen', () => {
    for (const form of ['bar', 'line', 'table', 'list']) {
      const rs = menge({ ...FAELLE.datensaetze(), wishes: { display: { form } } });
      expect(drawDisplayForm(rs, { translate: tStub }).hint, form).toBe('displayFormUnknown');
    }
  });
});

describe('Syntax-Fehler der Angabe: lokalisierte Meldung', () => {
  it('DISPLAY ohne Form und BY ohne Feld', () => {
    for (const [text, key] of [
      ['LIST DISPLAY', 'query.syntax.displayForm'],
      ['LIST DISPLAY tree BY', 'query.syntax.displayBy'],
    ]) {
      const { error } = parseQuery(text);
      const rs = makeResultSet({ state: makeState('ready', { queryError: error }) });
      const fehler = html(rs).querySelector('.perspective-query-error');
      expect(fehler.textContent, text).toBe(de[key]);
    }
  });
});
