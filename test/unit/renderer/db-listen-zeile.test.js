// @vitest-environment jsdom
// 4T-002250 (Epic 3E-000262, F4 A, S3, S4, S5; AK1 bis AK4): Zeilen ändern in
// der Listen-Maske — Beginn mit Sperre und frischem Stand, Feld-Elemente in den
// bearbeitbaren Zellen, Speichern als ein Auftrag mit `erwartet`, Eingabetaste
// und Escape, Fokus-Verlust ohne Speichern, Befund an der Zelle, Fremd-Änderung
// mit «Neu laden» und «Trotzdem speichern», fremde Sperre, nicht änderbare
// Zeilen und das angehaltene Blättern.
//
// **Gemessen wird ohne Fenster-Zustand** (Muster `db-masken-sperre.test.js`):
// Das Zeilen-Modul nimmt Kanäle, Statuszeile, Neu-Befüllen und das Sperren des
// Blätterns als Nähte; das Gitter kommt aus `listen-maske.js` mit der
// Zeilen-Naht. Den Weg durch die laufende Anwendung prüfen die Ablauf-Fälle
// DB-LIS-03 und DB-LIS-04.
//
// 4T-002325: Der Konflikt einer fremden Sperre unter einer lesenden Zeile
// überdauert eine Neu-Befüllung, «Nur lesen» holt sie nach; die Wahl einer
// Fremd-Änderung war schon geschützt, weil ihre Zeile in Bearbeitung bleibt.
// Die Befüllung folgt dem Protokoll von `frontmatter-query-view.js`.
//
// **Der deutsche Katalog wird geladen**, weil die Feld-Elemente und die Sätze
// der Schreib-Schnittstelle über die Übersetzung des Fensters laufen.
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

const { zeichneListe, sperreBlaettern } =
  await import('../../../src/renderer/modules/database/listen-maske.js');
const { erzeugeZeilenBearbeitung, ZEILE_BEARBEITEN_KLASSE } =
  await import('../../../src/renderer/modules/database/listen-zeile.js');
const { LAGE_FREMD } = await import('../../../src/renderer/modules/database/masken-speichern.js');

const t = i18n.t;
const hat = (key) => Object.prototype.hasOwnProperty.call(de, key);
const LOANS = 'C:/Bereich/Loans.md';
const LIBRARY = 'C:/Bereich/Library.md';

afterEach(() => {
  document.body.innerHTML = '';
});

// --- Aufbau ------------------------------------------------------------------------------

const spalte = (source) => makeColumn({ name: source, label: source, source });
const kennung = (n) => `r-${String(n).padStart(5, '0')}`;
const name = (n) => `Person ${String(n).padStart(3, '0')}`;

function menge(anzahl) {
  return makeResultSet({
    scope: 'records',
    type: 'table',
    columns: [spalte('borrower'), spalte('book'), spalte('book.title')],
    rows: Array.from({ length: anzahl }, (_, i) =>
      makeRow([name(i + 1), 'r-00001', 'Zauberberg'], {
        ...recordOrigin('Loans', kennung(i + 1)),
        path: LOANS,
        display: name(i + 1),
      }),
    ),
    wishes: makeWishes(),
    state: makeState('ready', { area: { root: 'C:/Bereich', fileCount: 2 } }),
  });
}

function liste(zusatz = {}) {
  return {
    istListe: true,
    angaben: { editable: true, form: null, allow: ['update'] },
    tabelle: { path: LOANS, name: 'Loans' },
    maske: null,
    spalten: [
      { index: 0, feld: 'borrower' },
      { index: 1, feld: 'book' },
      { index: 2, feld: null },
    ],
    nichtAenderbar: [],
    hinweise: [],
    ...zusatz,
  };
}

const FELDER = [
  { name: 'book', type: 'record', options: { table: 'Library' } },
  { name: 'borrower', type: 'string' },
];

function stand(id, { editable = null, borrower } = {}) {
  const wer = borrower || name(Number(id.slice(2)));
  return {
    status: 'ready',
    kennung: id,
    fields: FELDER,
    editable,
    zellen: [
      { name: 'book', text: 'r-00001', value: 'r-00001', error: null },
      { name: 'borrower', text: wer, value: wer, error: null },
    ],
    erwartet: { book: 'r-00001', borrower: wer },
  };
}

// Die Antwort des Sperr-Kanals, wenn bert die Sperre hält; seit 4T-002325 von zwei Fällen genutzt.
const FREMDE_SPERRE = {
  status: 'ready',
  gehalten: false,
  stand: 's-fremd',
  fristMs: 4 * 60 * 60 * 1000,
  konflikt: {
    benutzer: 'bert',
    rechner: 'SC-099',
    zeitpunkt: '2026-10-11T08:00:00Z',
    halterUnbekannt: false,
    eigenerProzess: false,
    wege: ['lesen'],
    stand: 's-fremd',
  },
};

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

// Ein Gitter mit Zeilen-Bearbeitung und Attrappen für alle Nähte.
//
// 4T-002325: `befuelle()` befüllt den Block neu wie `fillOneQueryContainer`
// (Muster `db-listen-anlegen-loeschen.test.js`): Hält die Zeilen-Bearbeitung an,
// wird das vermerkt und nachgeholt, sobald die Naht `blaetternSperren(false)`
// es meldet; sonst entsteht das Gitter neu.
function aufbau({ anzahl = 3, zusatz = {}, sperre, datensatz, auftrag } = {}) {
  const aufrufe = [];
  const befuellung = { vermerkt: false, zahl: 0 };
  const befuelle = () => {
    if (zeile.inBearbeitung() || zeile.zeigtBlock()) return void (befuellung.vermerkt = true);
    befuellung.zahl += 1;
    const neu = zeichneListe(menge(anzahl), liste(zusatz), t, 0, zeile);
    container.replaceWith(neu);
    container = neu;
  };
  const n = {
    sperre: vi.fn(
      sperre ||
        (async (p) => {
          aufrufe.push(`sperre:${p.aktion}`);
          return p.aktion === 'nehmen'
            ? { status: 'ready', gehalten: true, stand: 's-1' }
            : { status: 'ready', freigegeben: true };
        }),
    ),
    datensatz: vi.fn(
      datensatz ||
        (async (p) => {
          aufrufe.push('datensatz');
          return stand(p.kennung);
        }),
    ),
    auftrag: vi.fn(auftrag || (async () => ({ ok: true }))),
    datensaetze: vi.fn(async () => ({
      status: 'ready',
      pfad: LIBRARY,
      tabelle: 'Library',
      keyEinteilig: false,
      datensaetze: [{ kennung: 'r-00001', anzeige: 'Zauberberg', schluessel: null }],
    })),
    t,
    hat,
    sprache: () => 'de',
    zeitpunkt: (iso) => `ZP(${iso})`,
    hinweis: vi.fn(),
    beiGeschrieben: vi.fn(),
    blaetternSperren: vi.fn((aktiv) => {
      sperreBlaettern(container, aktiv);
      if (aktiv || !befuellung.vermerkt) return;
      befuellung.vermerkt = false;
      befuelle();
    }),
  };
  const zeile = erzeugeZeilenBearbeitung(n);
  let container = zeichneListe(menge(anzahl), liste(zusatz), t, 0, zeile);
  document.body.appendChild(container);
  const zeilen = () => [...container.querySelectorAll('tbody tr.db-list-row')];
  return { n, zeile, container, zeilen, aufrufe, befuelle, befuellung };
}

const bearbeitbar = (tr) => [...tr.querySelectorAll('td[data-db-list-field]')];
const eingabe = (tr, feld) =>
  tr.querySelector(`.db-form-field[data-field="${feld}"] .db-form-input`);

function tippe(element, wert) {
  element.value = wert;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function taste(element, key, zusatz = {}) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...zusatz }));
}

async function beginne(tr) {
  tr.querySelector('.db-list-edit').click();
  await flush();
}

// --- AK1: Beginn ---------------------------------------------------------------------------

describe('Zeile bearbeiten: Beginn mit Sperre und frischem Stand (AK1)', () => {
  it('bietet «Bearbeiten» in einer Aktions-Zelle am Zeilen-Ende', () => {
    const { container, zeilen } = aufbau();
    const koepfe = container.querySelectorAll('thead th');
    expect(koepfe[koepfe.length - 1].className).toContain('db-list-col-actions');
    for (const tr of zeilen()) {
      const zelle = tr.lastElementChild;
      expect(zelle.className).toContain('db-list-actions');
      expect(zelle.querySelector('.db-list-edit').textContent).toBe(de['database.list.edit']);
    }
  });

  it('nimmt zuerst die Sperre, liest dann frisch und macht die Feld-Zellen zu Feld-Elementen', async () => {
    const { n, zeilen, aufrufe } = aufbau();
    const tr = zeilen()[1];
    await beginne(tr);
    expect(aufrufe.slice(0, 2)).toEqual(['sperre:nehmen', 'datensatz']);
    expect(n.sperre.mock.calls[0][0]).toEqual({
      aktion: 'nehmen',
      tabelle: LOANS,
      kennung: 'r-00002',
    });
    expect(n.datensatz.mock.calls[0][0]).toEqual({
      tabelle: LOANS,
      kennung: 'r-00002',
      sprache: 'de',
    });
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
    for (const td of bearbeitbar(tr)) expect(td.querySelector('.db-form-field')).not.toBeNull();
    expect(eingabe(tr, 'borrower').value).toBe('Person 002');
    expect(eingabe(tr, 'book').value).toBe('r-00001');
    // Die gerechnete Spalte und die Spalte des Datensatzes bleiben Text.
    const lesend = tr.querySelectorAll('td.db-list-col-readonly:not(.db-list-actions)');
    expect([...lesend].map((td) => td.textContent)).toEqual(['Person 002', 'Zauberberg']);
    // Fokus im ersten Feld der Zeile, Speichern und Abbrechen in der Aktions-Zelle.
    expect(document.activeElement).toBe(eingabe(tr, 'borrower'));
    expect(tr.querySelector('.db-list-save').textContent).toBe(de['database.list.save']);
    expect(tr.querySelector('.db-list-cancel').textContent).toBe(de['database.list.cancel']);
    expect(n.blaetternSperren).toHaveBeenCalledWith(true);
  });

  it('beginnt mit einem Doppelklick in eine bearbeitbare Zelle, nicht in eine lesende', async () => {
    const { n, zeilen } = aufbau();
    const tr = zeilen()[0];
    tr.querySelector('td.db-list-col-record').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true }),
    );
    await flush();
    expect(n.sperre).not.toHaveBeenCalled();
    bearbeitbar(tr)[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(n.sperre).toHaveBeenCalledTimes(1);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
  });

  it('hält eine nicht änderbare Zeile nach dem frischen Stand lesend und gibt die Sperre frei', async () => {
    const { n, zeilen, aufrufe } = aufbau({
      datensatz: async (p) =>
        stand(p.kennung, { editable: { erfuellt: false, grund: 'ausdruck', meldung: '' } }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
    expect(tr.querySelector('.db-list-row-note').textContent).toBe(
      de['database.list.rowNotEditable'],
    );
    expect(tr.querySelector('.db-list-edit')).toBeNull();
    expect(aufrufe).toEqual(['sperre:nehmen', 'sperre:freigeben']);
    expect(n.blaetternSperren).toHaveBeenLastCalledWith(false);
  });

  it('bleibt lesend, wenn der frische Stand nicht bereit ist', async () => {
    const { zeilen, aufrufe } = aufbau({
      datensatz: async () => ({ status: 'error', code: 'auftragDatensatzUnbekannt' }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
    expect(tr.querySelector('.db-list-row-note')).not.toBeNull();
    expect(aufrufe).toEqual(['sperre:nehmen', 'sperre:freigeben']);
  });
});

// --- AK1: Speichern, Eingabetaste, Escape, Fokus-Verlust --------------------------------------

describe('Zeile bearbeiten: Speichern und Verwerfen (AK1)', () => {
  it('speichert die Zeile als einen Auftrag mit erwartet aus dem frischen Stand', async () => {
    const { n, zeilen, aufrufe } = aufbau();
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Clara Neu');
    tr.querySelector('.db-list-save').click();
    await flush();
    expect(n.auftrag).toHaveBeenCalledTimes(1);
    expect(n.auftrag.mock.calls[0][0]).toEqual({
      auftrag: {
        anweisungen: [
          {
            tabelle: LOANS,
            art: 'update',
            id: 'r-00001',
            werte: { borrower: 'Clara Neu' },
            erwartet: { book: 'r-00001', borrower: 'Person 001' },
          },
        ],
      },
    });
    expect(aufrufe).toEqual(['sperre:nehmen', 'datensatz', 'sperre:freigeben']);
    expect(n.hinweis).toHaveBeenCalledWith('database.form.saved');
    expect(n.beiGeschrieben).toHaveBeenCalledTimes(1);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
    expect(tr.querySelector('.db-form-field')).toBeNull();
    expect(n.blaetternSperren).toHaveBeenLastCalledWith(false);
  });

  it('speichert mit der Eingabetaste in einem Feld', async () => {
    const { n, zeilen } = aufbau();
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Per Taste');
    taste(eingabe(tr, 'borrower'), 'Enter');
    await flush();
    expect(n.auftrag).toHaveBeenCalledTimes(1);
    expect(n.auftrag.mock.calls[0][0].auftrag.anweisungen[0].werte).toEqual({
      borrower: 'Per Taste',
    });
  });

  it('verwirft mit Escape und mit «Abbrechen», gibt die Sperre frei und zeigt den alten Text', async () => {
    for (const weg of ['escape', 'abbrechen']) {
      const { n, zeilen, aufrufe } = aufbau();
      const tr = zeilen()[0];
      await beginne(tr);
      tippe(eingabe(tr, 'borrower'), 'Verworfen');
      if (weg === 'escape') taste(eingabe(tr, 'borrower'), 'Escape');
      else tr.querySelector('.db-list-cancel').click();
      await flush();
      expect(n.auftrag, weg).not.toHaveBeenCalled();
      expect(aufrufe, weg).toEqual(['sperre:nehmen', 'datensatz', 'sperre:freigeben']);
      expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE), weg).toBe(false);
      expect(
        bearbeitbar(tr).map((td) => td.textContent),
        weg,
      ).toEqual(['Person 001', 'r-00001']);
      expect(n.beiGeschrieben, weg).not.toHaveBeenCalled();
      document.body.innerHTML = '';
    }
  });

  it('speichert nicht beim Fokus-Verlust', async () => {
    const { n, zeilen } = aufbau();
    const tr = zeilen()[0];
    await beginne(tr);
    const feld = eingabe(tr, 'borrower');
    tippe(feld, 'Nur getippt');
    feld.dispatchEvent(new FocusEvent('blur'));
    feld.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    feld.blur();
    await flush();
    expect(n.auftrag).not.toHaveBeenCalled();
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
  });

  it('meldet ohne Änderung, dass nichts zu speichern ist, und kehrt ins Lesen zurück', async () => {
    const { n, zeilen } = aufbau();
    const tr = zeilen()[0];
    await beginne(tr);
    tr.querySelector('.db-list-save').click();
    await flush();
    expect(n.auftrag).not.toHaveBeenCalled();
    expect(n.hinweis).toHaveBeenCalledWith('database.form.nothingChanged');
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
  });
});

// --- AK2: Befunde, Fremd-Änderung, fremde Sperre ------------------------------------------------

describe('Zeile bearbeiten: Abweisungen (AK2)', () => {
  it('steht mit einem Feld-Befund an der Zelle, die Zeile bleibt in Bearbeitung mit Sperre', async () => {
    const { n, zeilen, aufrufe } = aufbau({
      auftrag: async () => ({
        ok: false,
        lagen: [{ code: 'auftragTypVerletzt', position: 0, feld: 'borrower' }],
      }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Falsch');
    tr.querySelector('.db-list-save').click();
    await flush();
    const feld = tr.querySelector('.db-form-field[data-field="borrower"]');
    expect(feld.classList.contains('db-form-rejected')).toBe(true);
    expect(feld.querySelector('.db-form-message').textContent).toContain('borrower');
    expect(eingabe(tr, 'borrower').value).toBe('Falsch');
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
    expect(aufrufe).not.toContain('sperre:freigeben');
    expect(n.beiGeschrieben).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(eingabe(tr, 'borrower'));
  });

  it('zeigt einen Befund ohne Feld in der Aktions-Zelle', async () => {
    const { zeilen } = aufbau({
      auftrag: async () => ({ ok: false, status: 'unavailable' }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Anders');
    tr.querySelector('.db-list-save').click();
    await flush();
    const liste = tr.querySelector('td.db-list-actions .db-form-errors');
    expect(liste.textContent).toBe(de['database.form.noAccess']);
  });

  it('bietet bei einer Fremd-Änderung «Neu laden» unter der Zeile: Entwurf weg, Sperre frei, Block neu befüllt', async () => {
    const { n, zeilen, aufrufe } = aufbau({
      auftrag: async () => ({
        ok: false,
        lagen: [{ code: LAGE_FREMD, position: 0, tabelle: LOANS, id: 'r-00001' }],
      }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Meins');
    tr.querySelector('.db-list-save').click();
    await flush();
    const block = tr.nextElementSibling;
    expect(block.className).toBe('db-list-row-block');
    expect(block.cells).toHaveLength(1);
    expect(block.cells[0].colSpan).toBe(tr.cells.length);
    expect(block.querySelector('.db-form-stale')).not.toBeNull();
    expect(aufrufe).not.toContain('sperre:freigeben');
    block.querySelector('.db-form-stale-reload').click();
    await flush();
    expect(aufrufe).toContain('sperre:freigeben');
    expect(n.beiGeschrieben).toHaveBeenCalledTimes(1);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
    expect(tr.nextElementSibling.className).toBe('db-list-row');
  });

  it('schreibt mit «Trotzdem speichern» denselben Auftrag erzwungen', async () => {
    let erster = true;
    const { n, zeilen } = aufbau({
      auftrag: async () => {
        if (!erster) return { ok: true };
        erster = false;
        return {
          ok: false,
          lagen: [{ code: LAGE_FREMD, position: 0, tabelle: LOANS, id: 'r-00001' }],
        };
      },
    });
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Meins');
    tr.querySelector('.db-list-save').click();
    await flush();
    tr.nextElementSibling.querySelector('.db-form-stale-force').click();
    await flush();
    expect(n.auftrag).toHaveBeenCalledTimes(2);
    const zweite = n.auftrag.mock.calls[1][0].auftrag.anweisungen[0];
    expect(zweite.erzwingen).toBe(true);
    expect(zweite.werte).toEqual({ borrower: 'Meins' });
    expect(n.beiGeschrieben).toHaveBeenCalledTimes(1);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
  });

  it('zeigt eine fremde Sperre unter der Zeile; die Zeile bleibt lesend, «Nur lesen» schließt', async () => {
    const { n, zeilen } = aufbau({
      sperre: async () => FREMDE_SPERRE,
    });
    const tr = zeilen()[0];
    await beginne(tr);
    expect(n.datensatz).not.toHaveBeenCalled();
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
    const block = tr.nextElementSibling;
    expect(block.className).toBe('db-list-row-block');
    expect(block.querySelector('.db-form-lock-text').textContent).toContain('bert');
    expect(n.blaetternSperren).toHaveBeenLastCalledWith(false);
    block.querySelector('.db-form-lock-read').click();
    await flush();
    expect(tr.nextElementSibling.className).toBe('db-list-row');
  });

  // 4T-002325: dieselbe Lücke wie beim Befund eines abgewiesenen Löschens.
  it('behält den Konflikt einer fremden Sperre bei einer Neu-Befüllung und holt sie mit «Nur lesen» nach', async () => {
    const { zeile, zeilen, befuelle, befuellung } = aufbau({ sperre: async () => FREMDE_SPERRE });
    const tr = zeilen()[0];
    await beginne(tr);
    befuelle();
    expect(zeile.zeigtBlock()).toBe(true);
    expect(befuellung).toEqual({ vermerkt: true, zahl: 0 });
    expect(tr.nextElementSibling.querySelector('.db-form-lock-text')).not.toBeNull();
    tr.nextElementSibling.querySelector('.db-form-lock-read').click();
    await flush();
    expect(zeile.zeigtBlock()).toBe(false);
    expect(befuellung).toEqual({ vermerkt: false, zahl: 1 });
    expect(tr.isConnected).toBe(false);
    expect(document.querySelector('tr.db-list-row-block')).toBeNull();
  });

  it('hält die Wahl einer Fremd-Änderung bei einer Neu-Befüllung und holt sie mit «Neu laden» nach', async () => {
    const { n, zeilen, befuelle, befuellung } = aufbau({
      auftrag: async () => ({
        ok: false,
        lagen: [{ code: LAGE_FREMD, position: 0, tabelle: LOANS, id: 'r-00001' }],
      }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    tippe(eingabe(tr, 'borrower'), 'Meins');
    tr.querySelector('.db-list-save').click();
    await flush();
    befuelle();
    expect(befuellung).toEqual({ vermerkt: true, zahl: 0 });
    expect(tr.nextElementSibling.querySelector('.db-form-stale')).not.toBeNull();
    expect(eingabe(tr, 'borrower').value).toBe('Meins');
    tr.nextElementSibling.querySelector('.db-form-stale-reload').click();
    await flush();
    expect(befuellung).toEqual({ vermerkt: false, zahl: 1 });
    expect(n.beiGeschrieben).toHaveBeenCalledTimes(1);
  });
});

// --- AK3, AK4: lesende Zeilen, Blättern, eine Zeile zugleich ------------------------------------

describe('Zeile bearbeiten: lesende Zeilen und angehaltenes Blättern (AK3, AK4)', () => {
  it('bietet einer nicht änderbaren Zeile weder «Bearbeiten» noch den Doppelklick', async () => {
    const { n, zeilen } = aufbau({ zusatz: { nichtAenderbar: ['r-00002'] } });
    const tr = zeilen()[1];
    expect(tr.classList.contains('db-list-row-readonly')).toBe(true);
    expect(tr.title).toBe(de['database.list.rowNotEditable']);
    expect(tr.querySelector('.db-list-edit')).toBeNull();
    bearbeitbar(tr)[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(n.sperre).not.toHaveBeenCalled();
    expect(zeilen()[0].querySelector('.db-list-edit')).not.toBeNull();
  });

  it('zeigt ohne den Handgriff update keine Aktions-Spalte', () => {
    const { container } = aufbau({
      zusatz: { angaben: { editable: true, form: null, allow: [] } },
    });
    expect(container.querySelector('.db-list-col-actions')).toBeNull();
    expect(container.querySelector('.db-list-edit')).toBeNull();
  });

  it('sperrt Vor und «Bearbeiten» der übrigen Zeilen, solange eine Zeile bearbeitet wird', async () => {
    const { container, zeilen } = aufbau({ anzahl: 60 });
    const vor = () => container.querySelector('.db-list-next');
    const zurueck = () => container.querySelector('.db-list-prev');
    expect(vor().disabled).toBe(false);
    expect(zurueck().disabled).toBe(true);
    const tr = zeilen()[0];
    await beginne(tr);
    expect(vor().disabled).toBe(true);
    expect(zeilen()[1].querySelector('.db-list-edit').disabled).toBe(true);
    // Ein Doppelklick in eine andere Zeile beginnt keine zweite Bearbeitung.
    bearbeitbar(zeilen()[1])[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(zeilen()[1].classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(false);
    taste(eingabe(tr, 'borrower'), 'Escape');
    await flush();
    expect(vor().disabled).toBe(false);
    expect(zurueck().disabled).toBe(true);
    expect(zeilen()[1].querySelector('.db-list-edit').disabled).toBe(false);
  });

  it('hält Klicks einer Zeile in Bearbeitung und einer bearbeitbaren Zelle von den Treffer-Handlern fern', async () => {
    const { zeilen } = aufbau();
    const angekommen = vi.fn();
    document.body.addEventListener('click', angekommen);
    const [erste, zweite] = zeilen();
    // Die Spalte des Datensatzes öffnet weiterhin die Maske; die Feld-Zelle nicht.
    zweite.querySelector('td.db-list-col-record').click();
    expect(angekommen).toHaveBeenCalledTimes(1);
    bearbeitbar(zweite)[0].click();
    expect(angekommen).toHaveBeenCalledTimes(1);
    await beginne(erste);
    erste.querySelector('td.db-list-col-record').click();
    eingabe(erste, 'borrower').click();
    expect(angekommen).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('click', angekommen);
  });

  it('meldet die Bearbeitung und gibt eine Zeile frei, deren Liste neu gezeichnet wurde', async () => {
    const { zeile, zeilen, container, aufrufe } = aufbau();
    await beginne(zeilen()[0]);
    expect(zeile.inBearbeitung()).toBe(true);
    container.remove();
    expect(zeile.inBearbeitung()).toBe(false);
    await flush();
    expect(aufrufe).toContain('sperre:freigeben');
  });
});

// --- 4T-002312: gesperrte Felder in der Zeile ----------------------------------------------

describe('Zeile bearbeiten: gesperrtes Feld (4T-002312, AK1, AK3)', () => {
  it('4T-002312: zeigt das gesperrte Feld lesend mit Titel, es reist unverändert mit', async () => {
    let gesperrt = ['borrower'];
    const { n, zeilen } = aufbau({
      datensatz: async (p) => ({ ...stand(p.kennung), gesperrteFelder: gesperrt }),
    });
    const tr = zeilen()[0];
    await beginne(tr);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
    const feld = tr.querySelector('.db-form-field[data-field="borrower"]');
    expect(feld.classList.contains('db-form-locked')).toBe(true);
    expect(feld.title).toBe(de['database.form.feldNichtAenderbar']);
    expect(eingabe(tr, 'borrower')).toBeNull();
    expect(feld.querySelector('.db-form-value').textContent).toBe('Person 001');
    // Der Fokus geht an das erste Feld mit Eingabe, nicht an das gesperrte.
    expect(document.activeElement).toBe(eingabe(tr, 'book'));

    tippe(eingabe(tr, 'book'), 'r-00002');
    tr.querySelector('.db-list-save').click();
    await flush();
    const [anweisung] = n.auftrag.mock.calls[0][0].auftrag.anweisungen;
    expect(anweisung.werte).toEqual({ book: 'r-00002' });
    expect(anweisung.erwartet).toEqual({ book: 'r-00001', borrower: 'Person 001' });

    // AK3: Die nächste Antwort ohne Sperre gibt das Feld frei, ohne Sonderweg.
    gesperrt = [];
    await beginne(zeilen()[0]);
    expect(eingabe(zeilen()[0], 'borrower')).not.toBeNull();
  });
});
