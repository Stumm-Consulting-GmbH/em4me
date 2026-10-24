// @vitest-environment jsdom
// 4T-002253 (Epic 3E-000262, F5 A, S6, S7; AK2 bis AK5): Der Positions-Bereich
// einer Einzel-Maske (`masken-positionen.js`) und der sammelnde Modus des
// Zeilen-Moduls (`listen-zeile.js`, `listen-sammeln.js`).
//
// **Gemessen wird ohne Fenster-Zustand** (Muster
// `db-listen-anlegen-loeschen.test.js`): Kanäle und Statuszeile sind Nähte, das
// Gitter kommt aus `listen-maske.js`. Geprüft wird: lesend im Lesen der Maske
// mit Öffnen der Position per Klick, der Hinweis bei nicht auflösbarem Bereich,
// im Bearbeiten das Sammeln statt Schreiben (Ändern, Anlegen mit gesetztem
// Verweis, Löschen, Ersetzen derselben Kennung), die vorgemerkte Zeile mit
// Entwurf und gehaltener Sperre, das Überdauern des Neuzeichnens und die
// Freigabe der Sperren. Den Weg durch die laufende Anwendung prüft DB-MAS-12.
import { describe, it, expect, vi, afterEach } from 'vitest';
import de from '../../../src/i18n/de.json';
import {
  makeColumn,
  recordOrigin,
  makeRow,
  makeWishes,
  makeState,
  makeResultSet,
} from '../../../src/shared/query/result-set.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { erzeugePositionsBereich } =
  await import('../../../src/renderer/modules/database/masken-positionen.js');
const { MODUS_BEARBEITEN, MODUS_LESEN } =
  await import('../../../src/renderer/modules/database/masken-felder.js');
const { ZEILE_VORGEMERKT_KLASSE, ZEILE_GELOESCHT_KLASSE } =
  await import('../../../src/renderer/modules/database/listen-sammeln.js');

const t = i18n.t;
const hat = (key) => Object.prototype.hasOwnProperty.call(de, key);
const LOANS = 'C:/Bereich/Loans.md';
const LIBRARY = 'C:/Bereich/Library.md';
const ABFRAGE = 'C:/Bereich/Ausleihen.md';
const QUERY = 'TABLE RECORDS borrower FROM "Loans" WHERE book = "r-00001"';
const NEUE_KENNUNG = 'r-00009';
const SEGMENT = { art: 'liste', datei: 'Ausleihen', by: null, zeile: 3 };

afterEach(() => {
  document.body.innerHTML = '';
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

const FELDER = [
  { name: 'book', type: 'record', options: { table: 'Library' } },
  { name: 'borrower', type: 'string' },
];

function menge() {
  return makeResultSet({
    scope: 'records',
    type: 'table',
    columns: [makeColumn({ name: 'borrower', label: 'borrower', source: 'borrower' })],
    rows: ['Clara', 'Ben'].map((wer, i) =>
      makeRow([wer], {
        ...recordOrigin('Loans', `r-0000${i + 1}`),
        path: LOANS,
        display: wer,
      }),
    ),
    wishes: makeWishes(),
    state: makeState('ready', { area: { root: 'C:/Bereich', fileCount: 3 } }),
  });
}

function stand(id) {
  const wer = id === null ? '' : { 'r-00001': 'Clara', 'r-00002': 'Ben' }[id];
  return {
    status: 'ready',
    kennung: id,
    fields: FELDER,
    editable: null,
    zellen: [
      { name: 'book', text: id === null ? '' : 'r-00001', value: null, error: null },
      { name: 'borrower', text: wer, value: wer, error: null },
    ],
    erwartet: id === null ? {} : { book: 'r-00001', borrower: wer },
  };
}

function aufbau({ auskunft } = {}) {
  const aufrufe = [];
  const n = {
    positionsliste: vi.fn(
      async () =>
        auskunft || {
          istListe: true,
          pfad: ABFRAGE,
          query: QUERY,
          beziehung: { feld: 'book' },
          tabelle: LOANS,
          hinweis: null,
        },
    ),
    abfrage: vi.fn(async () => ({ resultSet: menge() })),
    liste: vi.fn(async () => ({
      istListe: true,
      angaben: { editable: true, form: null, allow: ['create', 'update', 'delete'] },
      tabelle: { path: LOANS, name: 'Loans' },
      maske: null,
      spalten: [{ index: 0, feld: 'borrower' }],
      nichtAenderbar: [],
      hinweise: [],
    })),
    sperre: vi.fn(async (p) => {
      aufrufe.push(`sperre:${p.aktion}:${p.kennung}`);
      return p.aktion === 'nehmen'
        ? { status: 'ready', gehalten: true, stand: 's-1' }
        : { status: 'ready', freigegeben: true };
    }),
    datensatz: vi.fn(async (p) => stand(p.kennung)),
    datensaetze: vi.fn(async () => ({ status: 'ready', datensaetze: [] })),
    neuanlage: vi.fn(async () => ({ ok: true, kennung: NEUE_KENNUNG })),
    t,
    hat,
    sprache: () => 'de',
    zeitpunkt: (iso) => iso,
    hinweis: vi.fn(),
  };
  const bereich = erzeugePositionsBereich(n);
  const seite = { tabellenPfad: LIBRARY, kennung: 'r-00001', positionen: [] };
  const zeichne = (modus) => {
    const container = document.createElement('div');
    container.className = 'db-form-positions';
    document.body.replaceChildren(container);
    bereich.zeichneBereich(container, SEGMENT, { seite, modus });
    return container;
  };
  return { n, bereich, seite, zeichne, aufrufe };
}

const zeilen = (c) => [...c.querySelectorAll('tbody tr.db-list-row')];
const eingabe = (tr, feld) =>
  tr.querySelector(`.db-form-field[data-field="${feld}"] .db-form-input`);
function tippe(element, wert) {
  element.value = wert;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function aendere(c, tr, wert) {
  tr.querySelector('.db-list-edit').click();
  await flush();
  tippe(eingabe(tr, 'borrower'), wert);
  tr.querySelector('.db-list-save').click();
  await flush();
}

describe('Positions-Bereich: Lesen und Hinweis (4T-002253, AK2, AK5)', () => {
  it('fragt mit Kopf, wertet die gelieferte Abfrage aus und zeigt lesend', async () => {
    const { n, zeichne } = aufbau();
    const c = zeichne(MODUS_LESEN);
    await flush();
    expect(n.positionsliste).toHaveBeenCalledWith({
      datei: 'Ausleihen',
      by: null,
      kopf: { tabelle: LIBRARY, kennung: 'r-00001' },
    });
    expect(n.abfrage).toHaveBeenCalledWith(ABFRAGE, QUERY);
    expect(n.liste.mock.calls[0][0]).toMatchObject({ pfad: ABFRAGE, tabelle: LOANS });
    expect(zeilen(c).map((tr) => tr.cells[1].textContent)).toEqual(['Clara', 'Ben']);
    expect(c.querySelector('.db-list-edit, .db-list-new, .db-list-delete')).toBeNull();
  });

  it('öffnet im Lesen per Klick die Maske der Position', async () => {
    const { zeichne } = aufbau();
    const c = zeichne(MODUS_LESEN);
    await flush();
    const geoeffnet = vi.fn();
    document.addEventListener('scg:open-form', geoeffnet);
    zeilen(c)[1].cells[1].click();
    document.removeEventListener('scg:open-form', geoeffnet);
    expect(geoeffnet.mock.calls[0][0].detail).toEqual({ filePath: LOANS, recordId: 'r-00002' });
  });

  it('zeigt bei nicht auflösbarem Bereich den Hinweis mit Zeile und keine Liste', async () => {
    const { n, zeichne } = aufbau({ auskunft: { istListe: false, hinweis: 'listDateiUnbekannt' } });
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    const hinweis = c.querySelector('.db-form-hint[data-form-code="listDateiUnbekannt"]');
    expect(hinweis.textContent).toContain('Zeile 3');
    expect(hinweis.textContent).toContain('Ausleihen');
    expect(c.querySelector('.db-list')).toBeNull();
    expect(n.abfrage).not.toHaveBeenCalled();
  });

  it('zeigt eine Abfrage-Datei ohne editable lesend mit Hinweis', async () => {
    const { n, zeichne } = aufbau({
      auskunft: { istListe: false, hinweis: 'listNichtBearbeitbar', pfad: ABFRAGE, query: QUERY },
    });
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    expect(c.querySelector('[data-form-code="listNichtBearbeitbar"]')).not.toBeNull();
    expect(zeilen(c)).toHaveLength(2);
    expect(c.querySelector('.db-list-edit, .db-list-new')).toBeNull();
    expect(n.liste).not.toHaveBeenCalled();
  });
});

// 4T-002311 (E12.4, Story AK3): Der Bereich bietet im Bearbeiten den Schnitt aus
// `allow` der Abfrage-Datei und der Erlaubnis-Menge der Rolle an der
// Positions-Tabelle an; beides kommt mit der Auskunft der Liste.
describe('Positions-Bereich: Schnitt aus allow und Rolle (4T-002311)', () => {
  async function mitRechten(rechte) {
    const { n, zeichne } = aufbau();
    const auskunft = await n.liste();
    n.liste.mockResolvedValue({ ...auskunft, rechte, rolle: 'assistant' });
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    return c;
  }

  it('bietet mit Rolle nur update allein «Bearbeiten» an (4T-002311)', async () => {
    const c = await mitRechten({ create: false, update: true, delete: false, define: false });
    expect(zeilen(c)[0].querySelector('.db-list-edit')).not.toBeNull();
    expect(c.querySelector('.db-list-new, .db-list-delete')).toBeNull();
  });

  it('lässt ohne update der Rolle die Positionen lesend und nennt die Rolle (4T-002311)', async () => {
    const c = await mitRechten({ create: true, update: false, delete: false, define: false });
    expect(c.querySelector('.db-list-new')).not.toBeNull();
    expect(c.querySelector('.db-list-edit, .db-list-delete')).toBeNull();
    expect(zeilen(c)[0].title).toBe(
      'Die Rolle «assistant» darf Datensätze der Tabelle «Loans» nicht ändern.',
    );
  });
});

describe('Positions-Bereich: Sammeln im Bearbeiten (4T-002253, S7, AK3, AK4)', () => {
  it('ändert eine Zeile: Anweisung gesammelt, Entwurf gezeigt, Sperre gehalten', async () => {
    const { seite, zeichne, aufrufe } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    const tr = zeilen(c)[0];
    await aendere(c, tr, 'Clara B.');
    expect(seite.positionen).toEqual([
      {
        tabelle: LOANS,
        art: 'update',
        id: 'r-00001',
        werte: { borrower: 'Clara B.' },
        erwartet: { book: 'r-00001', borrower: 'Clara' },
      },
    ]);
    expect(tr.classList.contains(ZEILE_VORGEMERKT_KLASSE)).toBe(true);
    expect(tr.title).toBe(de['database.list.pending']);
    expect(tr.cells[1].textContent).toBe('Clara B.');
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001']);
    // Eine spätere Anweisung derselben Kennung ersetzt die frühere, ohne neue Sperre.
    await aendere(c, tr, 'Clara C.');
    expect(seite.positionen).toHaveLength(1);
    expect(seite.positionen[0].werte).toEqual({ borrower: 'Clara C.' });
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001']);
  });

  it('legt eine Zeile an: Verweis auf den Kopf gesetzt, Zeile bleibt vorgemerkt', async () => {
    const { seite, zeichne } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    c.querySelector('.db-list-new').click();
    await flush();
    const tr = c.querySelector('tbody tr.db-list-row-new');
    tippe(eingabe(tr, 'borrower'), 'Ina');
    tr.querySelector('.db-list-save').click();
    await flush();
    expect(seite.positionen).toEqual([
      {
        tabelle: LOANS,
        art: 'create',
        id: NEUE_KENNUNG,
        werte: { borrower: 'Ina', book: 'r-00001' },
      },
    ]);
    expect(tr.isConnected).toBe(true);
    expect(tr.classList.contains(ZEILE_VORGEMERKT_KLASSE)).toBe(true);
    expect(tr.querySelector('td[data-db-list-field="borrower"]').textContent).toBe('Ina');
  });

  it('löscht eine Zeile: Anweisung mit Erwartung, Zeile durchgestrichen und ohne Handgriff', async () => {
    const { seite, zeichne } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    const tr = zeilen(c)[1];
    tr.querySelector('.db-list-delete').click();
    await flush();
    tr.nextElementSibling.querySelector('.db-form-delete-yes').click();
    await flush();
    expect(seite.positionen).toEqual([
      {
        tabelle: LOANS,
        art: 'delete',
        id: 'r-00002',
        erwartet: { book: 'r-00001', borrower: 'Ben' },
      },
    ]);
    expect(tr.classList.contains(ZEILE_GELOESCHT_KLASSE)).toBe(true);
    expect(tr.cells[1].textContent).toBe('Ben');
    expect(tr.querySelector('.db-list-edit, .db-list-delete')).toBeNull();
  });

  it('überdauert das Neuzeichnen der Maske und gibt danach alle Sperren frei', async () => {
    const { n, bereich, seite, zeichne, aufrufe } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    await aendere(c, zeilen(c)[0], 'Clara B.');
    const neu = zeichne(MODUS_BEARBEITEN);
    await flush();
    expect(n.positionsliste).toHaveBeenCalledTimes(1);
    expect(zeilen(neu)[0].classList.contains(ZEILE_VORGEMERKT_KLASSE)).toBe(true);
    // Verwerfen der Maske: Sperren frei, Gesammeltes leert die Seite selbst.
    bereich.gebeSperrenFrei();
    seite.positionen = [];
    await flush();
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001', 'sperre:freigeben:r-00001']);
    zeichne(MODUS_BEARBEITEN);
    await flush();
    expect(n.positionsliste).toHaveBeenCalledTimes(2);
  });

  it('«Abbrechen» einer vorgemerkten Zeile kehrt zum vorgemerkten Stand zurück', async () => {
    const { seite, zeichne, aufrufe } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    const tr = zeilen(c)[0];
    await aendere(c, tr, 'Clara B.');
    tr.querySelector('.db-list-edit').click();
    await flush();
    tippe(eingabe(tr, 'borrower'), 'Verworfen');
    tr.querySelector('.db-list-cancel').click();
    await flush();
    expect(tr.cells[1].textContent).toBe('Clara B.');
    expect(seite.positionen[0].werte).toEqual({ borrower: 'Clara B.' });
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001']);
  });
});

// Nachtrag (Sitzungs-Entscheidung zu 4T-002253): offen bearbeitete Zeile vor
// dem Speichern der Maske, und das Zurücknehmen einer Vormerkung.
describe('Positions-Bereich: offene Zeile und zurückgenommene Vormerkung (4T-002253)', () => {
  it('merkt vor dem Speichern der Maske eine offen bearbeitete Zeile vor', async () => {
    const { bereich, seite, zeichne } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    expect(await bereich.uebernimmOffene()).toBe(true);
    const tr = zeilen(c)[0];
    tr.querySelector('.db-list-edit').click();
    await flush();
    tippe(eingabe(tr, 'borrower'), 'Clara offen');
    expect(await bereich.uebernimmOffene()).toBe(true);
    expect(seite.positionen.map((a) => a.werte)).toEqual([{ borrower: 'Clara offen' }]);
    expect(tr.classList.contains(ZEILE_VORGEMERKT_KLASSE)).toBe(true);
  });

  it('meldet false, wenn die offene Zeile abgewiesen bleibt; der Befund steht an der Zelle', async () => {
    const { zeichneListe } = await import('../../../src/renderer/modules/database/listen-maske.js');
    const { erzeugeZeilenBearbeitung } =
      await import('../../../src/renderer/modules/database/listen-zeile.js');
    const { n } = aufbau();
    const zeile = erzeugeZeilenBearbeitung({
      ...n,
      auftrag: async () => ({
        ok: false,
        lagen: [{ code: 'auftragTypVerletzt', position: 0, feld: 'borrower' }],
      }),
      beiGeschrieben: () => {},
      blaetternSperren: () => {},
      sammelnd: true,
    });
    const c = zeichneListe(menge(), await n.liste(), t, 0, zeile);
    document.body.replaceChildren(c);
    const tr = zeilen(c)[0];
    tr.querySelector('.db-list-edit').click();
    await flush();
    tippe(eingabe(tr, 'borrower'), 'Falsch');
    expect(await zeile.speichereOffene()).toBe(false);
    const feld = tr.querySelector('.db-form-field[data-field="borrower"]');
    expect(feld.classList.contains('db-form-rejected')).toBe(true);
    expect(eingabe(tr, 'borrower').value).toBe('Falsch');
  });

  it('nimmt die Vormerkung zurück, wenn die Zeile auf den gelesenen Stand zurückgeht; die Sperre bleibt', async () => {
    const { bereich, seite, zeichne, aufrufe } = aufbau();
    const c = zeichne(MODUS_BEARBEITEN);
    await flush();
    const tr = zeilen(c)[0];
    await aendere(c, tr, 'Clara B.');
    expect(seite.positionen).toHaveLength(1);
    await aendere(c, tr, 'Clara');
    expect(seite.positionen).toEqual([]);
    expect(tr.classList.contains(ZEILE_VORGEMERKT_KLASSE)).toBe(false);
    expect(tr.hasAttribute('title')).toBe(false);
    expect(tr.cells[1].textContent).toBe('Clara');
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001']);
    // Erneut bearbeitbar ohne neue Sperre; frei erst mit dem Ende der Maske.
    await aendere(c, tr, 'Clara C.');
    expect(seite.positionen.map((a) => a.werte)).toEqual([{ borrower: 'Clara C.' }]);
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001']);
    bereich.gebeSperrenFrei();
    await flush();
    expect(aufrufe).toEqual(['sperre:nehmen:r-00001', 'sperre:freigeben:r-00001']);
  });
});
