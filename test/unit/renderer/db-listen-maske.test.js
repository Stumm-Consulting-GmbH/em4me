// @vitest-environment jsdom
// 4T-002249 (Epic 3E-000262, F2 A, F3 A, S2, S5; AK2, AK3, AK4): Die Listen-Maske
// als Gitter — Zähl-Zeile, Kopf und Zellen aus der Ergebnismenge, Kennzeichnung
// der bearbeitbaren Spalten, Angaben des Datensatz-Klicks samt benannter Maske,
// Blättern in Seiten zu 50 Zeilen und die Hinweise einer Liste, die lesend
// bleibt. Dazu das Einhängen in die Befüllung (`buildQueryListDom`): Trägt die
// Antwort die Auskunft einer Listen-Maske, tritt das Gitter an die Stelle der
// Ergebnis-Tabelle; ohne sie bleibt die Tabelle wie zuvor. Diese Fälle stehen
// hier und nicht in frontmatter-query-view.test.js, weil jene Datei genau auf
// ihrem Zeilen-Budget steht.
//
// Reine Bau-Funktionen mit injiziertem t; der t-Stub liest die zusammengesetzte
// de.json, damit Platzhalter-Ersetzung und Key-Existenz mitgeprüft werden.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  zeichneListe,
  zeichneListenGitter,
  listenSeite,
  LIST_SEITE,
  LIST_LESEND_KLASSE,
  sperreBlaettern,
} from '../../../src/renderer/modules/database/listen-maske.js';
import { recordHitOf } from '../../../src/renderer/modules/query/record-hit-click.js';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import {
  makeColumn,
  recordOrigin,
  makeRow,
  makeGroup,
  makeWishes,
  makeState,
  makeResultSet,
} from '../../../src/shared/query/result-set.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const LOANS = '/raum/Loans.md';
const LIBRARY = '/raum/Library.md';
const MASKE = '/raum/Loans Short Form.md';

const spalte = (source, label = source) => makeColumn({ name: source, label, source });

// Eine Ausleihe: Name, Buch als Verweis, Titel über den Pfad.
function ausleihe(n) {
  const id = `r-${String(n).padStart(5, '0')}`;
  const name = `Person ${String(n).padStart(3, '0')}`;
  return makeRow(
    [
      name,
      { kind: 'record', table: 'Library', id: 'r-00001', display: 'Zauberberg', path: LIBRARY },
      'Zauberberg',
    ],
    { ...recordOrigin('Loans', id), path: LOANS, display: name },
  );
}

function menge(anzahl, { wishes, groups = null, scope = 'records' } = {}) {
  return makeResultSet({
    scope,
    type: 'table',
    columns: [spalte('borrower', 'Name'), spalte('book'), spalte('book.title')],
    rows: Array.from({ length: anzahl }, (_, i) => ausleihe(i + 1)),
    groups,
    wishes: makeWishes(wishes),
    state: makeState('ready', { area: { root: '/raum', fileCount: 3 } }),
  });
}

const LISTE = {
  istListe: true,
  angaben: { editable: true, form: 'Loans Short Form', allow: ['update'] },
  tabelle: { path: LOANS, name: 'Loans' },
  maske: MASKE,
  spalten: [
    { index: 0, feld: 'borrower' },
    { index: 1, feld: 'book' },
    { index: 2, feld: null },
  ],
  hinweise: [],
};

const texte = (nodes) => [...nodes].map((n) => n.textContent);

describe('Listen-Maske: Gitter und Zähl-Zeile (4T-002249, AK2)', () => {
  it('zeichnet Zähl-Zeile, Kopf und Zeilen in der Reihenfolge der Menge', () => {
    const el = zeichneListe(menge(3), LISTE, tStub);
    expect(el.className).toBe('db-list');
    expect(el.querySelector('.db-list-count').textContent).toBe('Zeilen 1 bis 3 von 3');
    const table = el.querySelector('table');
    expect(table.className).toBe('db-overview-table db-list-table');
    expect(texte(table.querySelectorAll('thead th'))).toEqual([
      de['query.table.recordColumn'],
      'Name',
      'book',
      'book.title',
    ]);
    const zeilen = table.querySelectorAll('tbody tr.db-list-row');
    expect(zeilen).toHaveLength(3);
    expect(texte(zeilen[0].querySelectorAll('td'))).toEqual([
      'Person 001',
      'Person 001',
      'Zauberberg',
      'Zauberberg',
    ]);
    // Bis 50 Zeilen keine Navigation.
    expect(el.querySelector('.db-list-nav')).toBeNull();
  });

  it('kennzeichnet Feld-Spalten und lesende Spalten an Kopf und Zelle', () => {
    const el = zeichneListe(menge(1), LISTE, tStub);
    const koepfe = [...el.querySelectorAll('thead th')];
    const zellen = [...el.querySelectorAll('tbody td')];
    for (const reihe of [koepfe, zellen]) {
      expect(reihe[0].classList.contains('db-list-col-readonly')).toBe(true);
      expect(reihe[1].classList.contains('db-list-col-field')).toBe(true);
      expect(reihe[1].dataset.dbListField).toBe('borrower');
      expect(reihe[2].classList.contains('db-list-col-field')).toBe(true);
      expect(reihe[3].classList.contains('db-list-col-readonly')).toBe(true);
      expect(reihe[3].dataset.dbListField).toBeUndefined();
    }
  });

  it('gilt eine fehlende oder fremde Feld-Angabe als lesend', () => {
    const el = zeichneListe(
      menge(1),
      { ...LISTE, spalten: [{ index: 7, feld: 'x' }, null] },
      tStub,
    );
    const zellen = [...el.querySelectorAll('tbody td')].slice(1);
    expect(zellen.every((td) => td.classList.contains('db-list-col-readonly'))).toBe(true);
  });

  it('blendet mit WITHOUT ID die Datensatz-Spalte aus', () => {
    const el = zeichneListe(menge(1, { wishes: { withoutId: true } }), LISTE, tStub);
    expect(texte(el.querySelectorAll('thead th'))).toEqual(['Name', 'book', 'book.title']);
  });

  it('zeigt bei leerer Menge den Leer-Text und den Kopf ohne Zeilen', () => {
    const el = zeichneListe(menge(0), LISTE, tStub);
    expect(el.querySelector('.db-list-count').textContent).toBe(de['database.list.empty']);
    expect(el.querySelectorAll('thead th')).toHaveLength(4);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});

describe('Listen-Maske: Angaben des Klicks an der Zeile (4T-002249, AK4)', () => {
  it('trägt Tabelle, Kennung und benannte Maske an der Zeile', () => {
    const el = zeichneListe(menge(2), LISTE, tStub);
    const zeile = el.querySelectorAll('tbody tr')[1];
    expect(zeile.dataset.fmRecordTable).toBe(LOANS);
    expect(zeile.dataset.fmRecordId).toBe('r-00002');
    expect(zeile.dataset.fmRecordMaske).toBe(MASKE);
    expect(zeile.title).toBe('Loans#^r-00002');
    // Ein Klick in eine lesende Zelle trifft die Zeile samt Maske.
    expect(recordHitOf(zeile.querySelectorAll('td')[0])).toEqual({
      path: LOANS,
      id: 'r-00002',
      maske: MASKE,
    });
    // Der Datensatz-Verweis in einer Zelle bleibt sein eigener Treffer.
    const verweis = zeile.querySelector('td:nth-child(3) a.perspective-query-item');
    expect(recordHitOf(verweis)).toEqual({ path: LIBRARY, id: 'r-00001', maske: null });
  });

  it('nennt ohne Maske keine, damit die Standard-Maske öffnet', () => {
    const el = zeichneListe(menge(1), { ...LISTE, maske: null }, tStub);
    const zeile = el.querySelector('tbody tr');
    expect(zeile.dataset.fmRecordMaske).toBeUndefined();
    expect(recordHitOf(zeile).maske).toBeNull();
  });
});

describe('Listen-Maske: Blättern in Seiten zu 50 Zeilen (4T-002249, F3 A, S5, AK3)', () => {
  it('blättert über 120 Zeilen mit Vor und Zurück, gesperrt an den Rändern', () => {
    expect(LIST_SEITE).toBe(50);
    const el = zeichneListe(menge(120), LISTE, tStub);
    document.body.appendChild(el);
    const zaehlung = () => el.querySelector('.db-list-count').textContent;
    const erste = () => el.querySelector('tbody tr td').textContent;
    const prev = () => el.querySelector('button.db-list-prev');
    const next = () => el.querySelector('button.db-list-next');

    expect(zaehlung()).toBe('Zeilen 1 bis 50 von 120');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(prev().textContent).toBe(de['database.list.prev']);
    expect(next().textContent).toBe(de['database.list.next']);
    expect(prev().disabled).toBe(true);
    expect(next().disabled).toBe(false);
    expect(listenSeite(el)).toBe(0);

    next().click();
    expect(zaehlung()).toBe('Zeilen 51 bis 100 von 120');
    expect(erste()).toBe('Person 051');
    expect(listenSeite(el)).toBe(1);
    expect(prev().disabled).toBe(false);

    next().click();
    expect(zaehlung()).toBe('Zeilen 101 bis 120 von 120');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(next().disabled).toBe(true);

    prev().click();
    prev().click();
    expect(zaehlung()).toBe('Zeilen 1 bis 50 von 120');
    expect(prev().disabled).toBe(true);
    el.remove();
  });

  it('zeichnet beim Blättern nur die Liste neu, nicht ihre Umgebung', () => {
    const umgebung = document.createElement('div');
    const davor = document.createElement('p');
    davor.textContent = 'Beschreibung';
    const el = zeichneListe(menge(60), LISTE, tStub);
    umgebung.append(davor, el);
    el.querySelector('button.db-list-next').click();
    expect(umgebung.firstChild).toBe(davor);
    expect(umgebung.children[1]).toBe(el);
    expect(el.querySelector('.db-list-count').textContent).toBe('Zeilen 51 bis 60 von 60');
  });

  it('hält die Auswahl beim Drücken einer Schaltfläche auf und gibt den Fokus zurück', () => {
    const el = zeichneListe(menge(120), LISTE, tStub);
    document.body.appendChild(el);
    const druck = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    el.querySelector('button.db-list-next').dispatchEvent(druck);
    expect(druck.defaultPrevented).toBe(true);
    el.querySelector('button.db-list-next').focus();
    el.querySelector('button.db-list-next').click();
    expect(document.activeElement).toBe(el.querySelector('button.db-list-next'));
    el.remove();
  });

  it('beginnt auf der genannten Seite, sonst auf der ersten', () => {
    const el = zeichneListe(menge(120), LISTE, tStub, 1);
    expect(listenSeite(el)).toBe(1);
    expect(el.querySelector('.db-list-count').textContent).toBe('Zeilen 51 bis 100 von 120');
    expect(listenSeite(zeichneListe(menge(120), LISTE, tStub))).toBe(0);
    expect(listenSeite(document.createElement('div'))).toBe(0);
  });

  it('zieht eine Seite außerhalb der Menge auf die nächste gültige', () => {
    const el = document.createElement('div');
    zeichneListenGitter(el, menge(120), LISTE, tStub, 9);
    expect(listenSeite(el)).toBe(2);
    zeichneListenGitter(el, menge(120), LISTE, tStub, -3);
    expect(listenSeite(el)).toBe(0);
    zeichneListenGitter(el, menge(120), LISTE, tStub, 'x');
    expect(listenSeite(el)).toBe(0);
  });
});

describe('Listen-Maske: lesend mit Hinweis (4T-002249, S2)', () => {
  it('bleibt lesend bei einer Menge, die keine Datensätze trägt', () => {
    const el = zeichneListe(menge(2, { scope: 'files' }), LISTE, tStub);
    expect(el.classList.contains(LIST_LESEND_KLASSE)).toBe(true);
    expect(el.querySelector('.db-list-hint').textContent).toBe(
      de['database.list.readonly.keineDatensaetze'],
    );
    expect(el.querySelector('table')).toBeNull();
  });

  it('bleibt lesend bei einer gruppierten Menge', () => {
    const gruppen = [makeGroup('Zauberberg', [0, 1], null)];
    const el = zeichneListe(menge(2, { groups: gruppen }), LISTE, tStub);
    expect(el.classList.contains(LIST_LESEND_KLASSE)).toBe(true);
    expect(el.querySelector('.db-list-hint').textContent).toBe(
      de['database.list.readonly.gruppiert'],
    );
    expect(el.querySelector('table')).toBeNull();
  });

  it('bleibt lesend bei einer gewählten Darstellungsform', () => {
    const el = zeichneListe(
      menge(2, { wishes: { display: { form: 'tree', by: 'book' } } }),
      LISTE,
      tStub,
    );
    expect(el.classList.contains(LIST_LESEND_KLASSE)).toBe(true);
    expect(el.querySelector('.db-list-hint').textContent).toBe(
      de['database.list.readonly.darstellungsform'],
    );
  });
});

describe('Listen-Maske in der Befüllung: an der Stelle der Tabelle (4T-002249, F2 A, AK2)', () => {
  const zeichne = (payload, kontext) => {
    const host = document.createElement('div');
    host.appendChild(buildQueryListDom(payload, tStub, kontext));
    return host;
  };
  const antwort = (anzahl, optionen) => ({ resultSet: menge(anzahl, optionen) });

  it('zeigt mit Listen-Maske das Gitter statt der Ergebnis-Tabelle', () => {
    const host = zeichne({ ...antwort(2), liste: LISTE });
    expect(host.querySelector('table.perspective-query-table')).toBeNull();
    expect(host.querySelectorAll('.db-list table.db-list-table tbody tr.db-list-row')).toHaveLength(
      2,
    );
    expect(host.querySelector('.db-list-count').textContent).toBe('Zeilen 1 bis 2 von 2');
  });

  it('zeigt ohne Listen-Maske oder mit istListe false die Tabelle wie zuvor', () => {
    const ohne = zeichne(antwort(2));
    const nein = zeichne({ ...antwort(2), liste: { istListe: false } });
    for (const host of [ohne, nein]) {
      expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
      expect(host.querySelector('.db-list')).toBeNull();
    }
    expect(nein.innerHTML).toBe(ohne.innerHTML);
  });

  it('setzt den Hinweis des Zustands über das Gitter und zählt auch die leere Menge', () => {
    const mitHinweis = antwort(2);
    mitHinweis.resultSet.state = makeState('ready', { hint: 'recordRefAmbiguous' });
    const host = zeichne({ ...mitHinweis, liste: LISTE });
    expect(host.firstElementChild.className).toBe('perspective-query-hint');
    expect(host.children[1].className).toBe('db-list');
    const leer = zeichne({ ...antwort(0), liste: LISTE });
    expect(leer.querySelector('.db-list-count').textContent).toBe(de['database.list.empty']);
    expect(leer.querySelector('.perspective-query-status')).toBeNull();
  });

  it('zeigt bei einer gruppierten Menge den Lesend-Hinweis über der bisherigen Ausgabe', () => {
    const groups = [makeGroup('Zauberberg', [0, 1], null)];
    const host = zeichne({ ...antwort(2, { groups }), liste: LISTE });
    expect(host.firstElementChild.classList.contains(LIST_LESEND_KLASSE)).toBe(true);
    expect(host.querySelector('.db-list-hint').textContent).toBe(
      de['database.list.readonly.gruppiert'],
    );
    expect(host.querySelector('table.perspective-query-table')).not.toBeNull();
    expect(host.querySelector('table.db-list-table')).toBeNull();
  });

  it('zeigt die Seite, die der Block vor dem Neu-Befüllen zeigte', () => {
    const payload = { ...antwort(120), liste: LISTE };
    expect(zeichne(payload, { listenSeite: 2 }).querySelector('.db-list-count').textContent).toBe(
      'Zeilen 101 bis 120 von 120',
    );
    expect(zeichne(payload, {}).querySelector('.db-list-count').textContent).toBe(
      'Zeilen 1 bis 50 von 120',
    );
  });

  it('lässt einen Abfrage-Fehler vor der Listen-Maske stehen', () => {
    const fehler = { code: 'recordsSourceMissing', message: 'x', pos: -1 };
    const payload = {
      resultSet: makeResultSet({ state: makeState('ready', { queryError: fehler }) }),
    };
    const host = zeichne({ ...payload, liste: LISTE });
    expect(host.querySelector('.perspective-query-error')).not.toBeNull();
    expect(host.querySelector('.db-list')).toBeNull();
  });
});

// 4T-002251 (Epic 3E-000262, F1 A): «Neue Zeile» in der Zähl-Zeile und die
// Aktions-Spalte je nach den Handgriffen in `allow`. Die Zeilen-Naht ist eine
// Attrappe; die Abläufe selbst prüft `db-listen-anlegen-loeschen.test.js`.
describe('Listen-Maske: Handgriffe Anlegen und Löschen (4T-002251, AK1, AK3)', () => {
  const naht = () => ({
    anschliessen: vi.fn((tr, info) => {
      tr.dataset.info = JSON.stringify({ aendern: info.aendern, loeschen: info.loeschen });
    }),
    beginneNeu: vi.fn(),
  });
  const mit = (allow) => ({ ...LISTE, angaben: { ...LISTE.angaben, allow } });

  it('zeigt «Neue Zeile» mit create und Zeilen-Naht und eröffnet darüber die Neuanlage', () => {
    const zeile = naht();
    const el = zeichneListe(menge(2), mit(['create']), tStub, 0, zeile);
    const knopf = el.querySelector('.db-list-countbar button.db-list-new');
    expect(knopf.textContent).toBe(de['database.list.new']);
    expect(el.querySelector('.db-list-count').textContent).toBe('Zeilen 1 bis 2 von 2');
    knopf.click();
    expect(zeile.beginneNeu).toHaveBeenCalledWith(el, { tabellenPfad: LOANS });
    // Ohne update und delete schließt keine Zeile an, die Aktions-Spalte steht dennoch.
    expect(zeile.anschliessen).not.toHaveBeenCalled();
    expect(el.querySelector('thead th.db-list-col-actions')).not.toBeNull();
  });

  it('zeigt ohne create oder ohne Zeilen-Naht keine «Neue Zeile»', () => {
    expect(
      zeichneListe(menge(2), mit(['update']), tStub, 0, naht()).querySelector('.db-list-new'),
    ).toBeNull();
    expect(zeichneListe(menge(2), mit(['create']), tStub).querySelector('.db-list-new')).toBeNull();
  });

  it('trägt mit allow [delete] die Aktions-Spalte und schließt ohne «Bearbeiten» an', () => {
    const zeile = naht();
    const el = zeichneListe(menge(2), mit(['delete']), tStub, 0, zeile);
    expect(el.querySelector('thead th.db-list-col-actions')).not.toBeNull();
    expect(zeile.anschliessen).toHaveBeenCalledTimes(2);
    const info = JSON.parse(el.querySelector('tbody tr').dataset.info);
    expect(info).toEqual({ aendern: false, loeschen: true });
    expect(el.querySelector('.db-list-new')).toBeNull();
  });

  it('lässt ohne Handgriff die Aktions-Spalte weg', () => {
    const zeile = naht();
    const el = zeichneListe(menge(2), mit([]), tStub, 0, zeile);
    expect(el.querySelector('thead th.db-list-col-actions')).toBeNull();
    expect(zeile.anschliessen).not.toHaveBeenCalled();
  });

  it('sperrt «Neue Zeile» und «Löschen» mit dem Blättern', () => {
    const el = zeichneListe(menge(2), mit(['create', 'delete']), tStub, 0, naht());
    const loeschen = document.createElement('button');
    loeschen.className = 'db-list-delete';
    el.querySelector('tbody td.db-list-actions').appendChild(loeschen);
    sperreBlaettern(el, true);
    expect(el.querySelector('.db-list-new').disabled).toBe(true);
    expect(loeschen.disabled).toBe(true);
    sperreBlaettern(el, false);
    expect(el.querySelector('.db-list-new').disabled).toBe(false);
    expect(loeschen.disabled).toBe(false);
  });
});

// 4T-002311 (Epic 3E-000263, E12.4, Story AK3, AK4): Angeboten wird der Schnitt
// aus `allow` und der Erlaubnis-Menge der Rolle (`rechte` der Auskunft); ohne
// `update` der Rolle bleiben die Zeilen lesend und nennen die Rolle im Titel.
// Ohne Menge (null oder fehlend) gilt allein `allow`, wie ohne Rollen.
describe('Listen-Maske: Schnitt aus allow und Rolle (4T-002311)', () => {
  const naht = () => ({
    anschliessen: vi.fn((tr, info) => {
      tr.dataset.info = JSON.stringify({ aendern: info.aendern, loeschen: info.loeschen });
    }),
    beginneNeu: vi.fn(),
  });
  const ALLE = ['create', 'update', 'delete'];
  const R = (create, update, del) => ({ create, update, delete: del, define: false });
  const mit = (rechte, allow = ALLE) => ({
    ...LISTE,
    angaben: { ...LISTE.angaben, allow },
    rechte,
    rolle: 'assistant',
  });
  const info = (el) => JSON.parse(el.querySelector('tbody tr').dataset.info);

  it('bietet mit allow [create, update, delete] und Rolle nur update allein «Bearbeiten» an', () => {
    const el = zeichneListe(menge(2), mit(R(false, true, false)), tStub, 0, naht());
    expect(el.querySelector('.db-list-new')).toBeNull();
    expect(info(el)).toEqual({ aendern: true, loeschen: false });
    expect(el.querySelector('tbody tr').title).not.toContain('assistant');
  });

  it('lässt ohne update der Rolle die Zeilen lesend und nennt die Rolle im Titel', () => {
    const zeile = naht();
    const el = zeichneListe(menge(2), mit(R(true, false, false)), tStub, 0, zeile);
    expect(el.querySelector('.db-list-new')).not.toBeNull();
    expect(zeile.anschliessen).not.toHaveBeenCalled();
    const tr = el.querySelector('tbody tr');
    expect(tr.classList.contains('db-list-row-readonly')).toBe(true);
    expect(tr.title).toBe(
      'Die Rolle «assistant» darf Datensätze der Tabelle «Loans» nicht ändern.',
    );
    // Mit delete der Rolle bleibt «Löschen»; die Zeile ist dann nicht gedämpft.
    const loeschbar = zeichneListe(menge(2), mit(R(false, false, true)), tStub, 0, naht());
    expect(info(loeschbar)).toEqual({ aendern: false, loeschen: true });
    expect(loeschbar.querySelector('tbody tr').classList.contains('db-list-row-readonly')).toBe(
      false,
    );
  });

  it('nimmt keine Rolle als Grund, wo allow das Ändern gar nicht erlaubt', () => {
    const el = zeichneListe(menge(2), mit(R(false, false, false), ['create']), tStub, 0, naht());
    expect(el.querySelector('.db-list-new')).toBeNull();
    expect(el.querySelector('thead th.db-list-col-actions')).toBeNull();
    expect(el.querySelector('tbody tr').title).not.toContain('assistant');
  });

  it('gilt mit rechte null oder ohne rechte allein allow, wie ohne Rollen', () => {
    for (const rechte of [null, undefined]) {
      const el = zeichneListe(menge(2), mit(rechte), tStub, 0, naht());
      expect(el.querySelector('.db-list-new')).not.toBeNull();
      expect(info(el)).toEqual({ aendern: true, loeschen: true });
      expect(el.querySelector('tbody tr').title).not.toContain('assistant');
    }
  });
});
