// @vitest-environment jsdom
// 4T-002251 (Epic 3E-000262, F1 A, F4 A, S3; AK1 bis AK3): Anlegen und Löschen
// in der Listen-Maske — «Neue Zeile» nur mit `create`, die Neuanlage oben im
// Gitter mit gezogener Kennung und leerem Stand, Speichern als Auftrag der Art
// Anlegen ohne Sperre, Verwerfen ohne Spur, Abweisung an der Zelle; «Löschen»
// nur mit `delete` und nie an einer nicht änderbaren Zeile, mit Sperre,
// frischem Stand und Rückfrage unter der Zeile, «Ja, löschen» als Auftrag mit
// `erwartet`, der Lösch-Schutz als Befund unter der Zeile, «Nein» und die
// Freigabe verwaister Sperren.
//
// 4T-002325: Der Befund eines abgewiesenen Löschens überdauert eine
// Neu-Befüllung des Blocks, und die zurückgestellte Befüllung kommt nach, sobald
// der Block endet. Die Befüllung folgt dabei dem Protokoll von
// `frontmatter-query-view.js` (`bearbeitungHaeltAn`, Naht `blaetternSperren`);
// den Weg durch die laufende Anwendung samt Index-Aktualisierung prüft DB-LIS-05.
//
// **Gemessen wird ohne Fenster-Zustand** (Muster `db-listen-zeile.test.js`):
// Kanäle, Statuszeile, Neu-Befüllen und das Sperren des Blätterns sind Nähte;
// das Gitter kommt aus `listen-maske.js` mit der Zeilen-Naht. Den Weg durch die
// laufende Anwendung prüft der Ablauf-Fall DB-LIS-05.
//
// **Der deutsche Katalog wird geladen**, weil Feld-Elemente, Rückfrage und die
// Sätze der Schreib-Schnittstelle über die Übersetzung des Fensters laufen.
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
const { erzeugeZeilenBearbeitung, raeumeVerwaisteSperren, ZEILE_BEARBEITEN_KLASSE } =
  await import('../../../src/renderer/modules/database/listen-zeile.js');

const t = i18n.t;
const hat = (key) => Object.prototype.hasOwnProperty.call(de, key);
const LOANS = 'C:/Bereich/Loans.md';
const LIBRARY = 'C:/Bereich/Library.md';
const NEUE_KENNUNG = 'r-00009';

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

function liste(allow, zusatz = {}) {
  return {
    istListe: true,
    angaben: { editable: true, form: null, allow },
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

// Der Stand eines Datensatzes; ohne Kennung der leere Stand einer Neuanlage.
function stand(id) {
  if (id === null) {
    return {
      status: 'ready',
      kennung: null,
      fields: FELDER,
      editable: null,
      zellen: [
        { name: 'book', text: '', value: null, error: null },
        { name: 'borrower', text: '', value: null, error: null },
      ],
      erwartet: {},
    };
  }
  const wer = name(Number(id.slice(2)));
  return {
    status: 'ready',
    kennung: id,
    fields: FELDER,
    editable: null,
    zellen: [
      { name: 'book', text: 'r-00001', value: 'r-00001', error: null },
      { name: 'borrower', text: wer, value: wer, error: null },
    ],
    erwartet: { book: 'r-00001', borrower: wer },
  };
}

// 4T-002325: Die Antwort des Lösch-Schutzes auf «Ja, löschen».
const SCHUTZ = {
  ok: false,
  lagen: [
    {
      code: 'auftragPruefBefund',
      naht: {
        code: 'regelLoeschenAbhaengige',
        id: 'r-00001',
        zieltabelle: 'Loans',
        felder: ['book'],
        anzahl: 2,
        anzeige: 'r-00003',
      },
    },
  ],
};

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

// Ein Gitter mit Zeilen-Bearbeitung und Attrappen für alle Nähte.
//
// 4T-002325: `befuelle()` befüllt den Block neu wie `fillOneQueryContainer`: Hält
// die Zeilen-Bearbeitung an (Zeile in Bearbeitung oder Block unter einer Zeile),
// wird das vermerkt; sonst entsteht das Gitter neu. Meldet die Naht
// `blaetternSperren(false)`, wird das Vermerkte nachgeholt.
function aufbau({ allow = ['create', 'update', 'delete'], zusatz = {}, auftrag, anzahl = 3 } = {}) {
  const aufrufe = [];
  const befuellung = { vermerkt: false, zahl: 0 };
  const befuelle = () => {
    if (zeile.inBearbeitung() || zeile.zeigtBlock()) return void (befuellung.vermerkt = true);
    befuellung.zahl += 1;
    const neu = zeichneListe(menge(anzahl), liste(allow, zusatz), t, 0, zeile);
    container.replaceWith(neu);
    container = neu;
  };
  const n = {
    sperre: vi.fn(async (p) => {
      aufrufe.push(`sperre:${p.aktion}`);
      return p.aktion === 'nehmen'
        ? { status: 'ready', gehalten: true, stand: 's-1' }
        : { status: 'ready', freigegeben: true };
    }),
    datensatz: vi.fn(async (p) => {
      aufrufe.push('datensatz');
      return stand(p.kennung);
    }),
    auftrag: vi.fn(auftrag || (async () => ({ ok: true }))),
    neuanlage: vi.fn(async () => {
      aufrufe.push('neuanlage');
      return { ok: true, kennung: NEUE_KENNUNG };
    }),
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
  let container = zeichneListe(menge(anzahl), liste(allow, zusatz), t, 0, zeile);
  document.body.appendChild(container);
  const zeilen = () => [...container.querySelectorAll('tbody tr.db-list-row')];
  return { n, zeile, container, zeilen, aufrufe, befuelle, befuellung };
}

const eingabe = (tr, feld) =>
  tr.querySelector(`.db-form-field[data-field="${feld}"] .db-form-input`);
const block = (tr) =>
  tr.nextElementSibling && tr.nextElementSibling.classList.contains('db-list-row-block')
    ? tr.nextElementSibling
    : null;

function tippe(element, wert) {
  element.value = wert;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function taste(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

async function neueZeile(container) {
  container.querySelector('.db-list-new').click();
  await flush();
  return container.querySelector('tbody tr.db-list-row-new');
}

async function loeschen(tr) {
  tr.querySelector('.db-list-delete').click();
  await flush();
}

// --- Anlegen (AK1) -------------------------------------------------------------------------

describe('Listen-Maske: Anlegen mit «Neue Zeile» (4T-002251, AK1, AK3)', () => {
  it('zeigt «Neue Zeile» nur mit create in allow, neben der unveränderten Zähl-Zeile', () => {
    const ohne = aufbau({ allow: ['update'] });
    expect(ohne.container.querySelector('.db-list-new')).toBeNull();
    ohne.container.remove();
    const mit = aufbau({ allow: ['create'] });
    const knopf = mit.container.querySelector('.db-list-countbar .db-list-new');
    expect(knopf.textContent).toBe(de['database.list.new']);
    expect(mit.container.querySelector('.db-list-count').textContent).toBe('Zeilen 1 bis 3 von 3');
    // Auch allein mit create steht die Aktions-Spalte, für «Speichern» der neuen Zeile.
    const koepfe = mit.container.querySelectorAll('thead th');
    expect(koepfe[koepfe.length - 1].className).toContain('db-list-col-actions');
    expect(mit.container.querySelector('.db-list-edit')).toBeNull();
  });

  it('zieht die Kennung, liest den leeren Stand und zeigt die Zeile oben mit Feld-Elementen, ohne Sperre', async () => {
    const { n, container, aufrufe } = aufbau();
    const tr = await neueZeile(container);
    expect(aufrufe.slice(0, 2)).toEqual(['neuanlage', 'datensatz']);
    expect(n.neuanlage).toHaveBeenCalledWith({ tabelle: LOANS });
    expect(n.datensatz.mock.calls[0][0]).toEqual({ tabelle: LOANS, kennung: null, sprache: 'de' });
    expect(n.sperre).not.toHaveBeenCalled();
    expect(container.querySelector('tbody').firstElementChild).toBe(tr);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
    expect(tr.querySelector('td.db-list-col-record').textContent).toBe(de['database.list.newRow']);
    expect(eingabe(tr, 'borrower').value).toBe('');
    expect(tr.querySelector('.db-form-field[data-field="book"]')).not.toBeNull();
    expect(tr.querySelector('.db-list-save').textContent).toBe(de['database.list.save']);
    expect(document.activeElement).toBe(eingabe(tr, 'borrower'));
    // Bestehende Zeilen bleiben, wie sie waren.
    expect(container.querySelectorAll('tbody tr.db-list-row')).toHaveLength(4);
  });

  it('schreibt mit «Speichern» einen Auftrag der Art Anlegen mit Kennung und den nicht leeren Werten', async () => {
    const { n, container } = aufbau();
    const tr = await neueZeile(container);
    tippe(eingabe(tr, 'borrower'), 'Neue Person');
    tr.querySelector('.db-list-save').click();
    await flush();
    expect(n.auftrag).toHaveBeenCalledTimes(1);
    expect(n.auftrag.mock.calls[0][0]).toEqual({
      auftrag: {
        anweisungen: [
          { tabelle: LOANS, art: 'create', id: NEUE_KENNUNG, werte: { borrower: 'Neue Person' } },
        ],
      },
    });
    expect(n.sperre).not.toHaveBeenCalled();
    expect(tr.isConnected).toBe(false);
    expect(n.hinweis).toHaveBeenCalledWith('database.form.saved');
    expect(n.beiGeschrieben).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.db-list-new').disabled).toBe(false);
  });

  it('speichert auch mit der Eingabetaste', async () => {
    const { n, container } = aufbau();
    const tr = await neueZeile(container);
    tippe(eingabe(tr, 'borrower'), 'Eingabe');
    taste(eingabe(tr, 'borrower'), 'Enter');
    await flush();
    expect(n.auftrag.mock.calls[0][0].auftrag.anweisungen[0].art).toBe('create');
  });

  it('entfernt die Zeile mit «Abbrechen» und mit Escape ohne Auftrag', async () => {
    const { n, container, zeilen } = aufbau();
    const erste = await neueZeile(container);
    erste.querySelector('.db-list-cancel').click();
    await flush();
    expect(erste.isConnected).toBe(false);
    const zweite = await neueZeile(container);
    tippe(eingabe(zweite, 'borrower'), 'Verworfen');
    taste(eingabe(zweite, 'borrower'), 'Escape');
    await flush();
    expect(zweite.isConnected).toBe(false);
    expect(n.auftrag).not.toHaveBeenCalled();
    expect(zeilen()).toHaveLength(3);
    expect(container.querySelector('.db-list-new').disabled).toBe(false);
  });

  it('steht mit einer Abweisung an der Zelle, die neue Zeile bleibt in Bearbeitung', async () => {
    const { n, container } = aufbau({
      auftrag: async () => ({
        ok: false,
        lagen: [{ code: 'auftragTypVerletzt', position: 0, feld: 'borrower' }],
      }),
    });
    const tr = await neueZeile(container);
    tippe(eingabe(tr, 'borrower'), 'Falsch');
    tr.querySelector('.db-list-save').click();
    await flush();
    const feld = tr.querySelector('.db-form-field[data-field="borrower"]');
    expect(feld.classList.contains('db-form-rejected')).toBe(true);
    expect(eingabe(tr, 'borrower').value).toBe('Falsch');
    expect(tr.isConnected).toBe(true);
    expect(tr.classList.contains(ZEILE_BEARBEITEN_KLASSE)).toBe(true);
    expect(n.beiGeschrieben).not.toHaveBeenCalled();
    expect(block(tr)).toBeNull();
  });

  it('meldet eine gescheiterte Neuanlage und zeigt keine Zeile', async () => {
    const { n, container } = aufbau();
    n.neuanlage.mockImplementation(async () => ({ ok: false, code: 'auftragTabelleUnbekannt' }));
    const tr = await neueZeile(container);
    expect(tr).toBeNull();
    expect(n.hinweis).toHaveBeenCalledWith('database.form.newFailed');
    expect(container.querySelector('.db-list-new').disabled).toBe(false);
  });
});

// --- Löschen (AK2, AK3) --------------------------------------------------------------------

describe('Listen-Maske: Löschen mit Rückfrage (4T-002251, AK2, AK3)', () => {
  it('bietet «Löschen» nur mit delete in allow und nie an einer nicht änderbaren Zeile', async () => {
    const ohne = aufbau({ allow: ['update'] });
    expect(ohne.container.querySelector('.db-list-delete')).toBeNull();
    ohne.container.remove();
    const { container, zeilen, n } = aufbau({
      allow: ['delete'],
      zusatz: { nichtAenderbar: ['r-00002'] },
    });
    expect(container.querySelector('.db-list-edit')).toBeNull();
    expect(zeilen()[0].querySelector('.db-list-delete').textContent).toBe(
      de['database.list.delete'],
    );
    expect(zeilen()[1].querySelector('.db-list-delete')).toBeNull();
    expect(zeilen()[2].querySelector('.db-list-delete')).not.toBeNull();
    // Ohne update beginnt auch der Doppelklick keine Bearbeitung.
    const zelle = zeilen()[0].querySelector('td[data-db-list-field="borrower"]');
    zelle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(n.sperre).not.toHaveBeenCalled();
  });

  it('nimmt die Sperre zum Löschen, liest frisch und fragt unter der Zeile zurück', async () => {
    const { n, zeilen, aufrufe, container } = aufbau();
    const tr = zeilen()[1];
    await loeschen(tr);
    expect(aufrufe.slice(0, 2)).toEqual(['sperre:nehmen', 'datensatz']);
    expect(n.sperre.mock.calls[0][0]).toEqual({
      aktion: 'nehmen',
      tabelle: LOANS,
      kennung: 'r-00002',
    });
    const frage = block(tr).querySelector('.db-form-confirm-delete');
    expect(frage.querySelector('.db-form-confirm-text').textContent).toBe(
      de['database.form.confirmDelete'],
    );
    expect(frage.querySelector('.db-form-delete-yes').textContent).toBe(
      de['database.form.yesDelete'],
    );
    expect(frage.querySelector('.db-form-delete-no').textContent).toBe(de['database.form.no']);
    // Solange die Rückfrage offen ist, sind «Neue Zeile» und die übrigen Knöpfe gesperrt.
    expect(container.querySelector('.db-list-new').disabled).toBe(true);
    expect(zeilen()[0].querySelector('.db-list-delete').disabled).toBe(true);
  });

  it('schreibt mit «Ja, löschen» einen Auftrag der Art Löschen mit erwartet und befüllt neu', async () => {
    const { n, zeilen, aufrufe } = aufbau();
    const tr = zeilen()[0];
    await loeschen(tr);
    block(tr).querySelector('.db-form-delete-yes').click();
    await flush();
    expect(n.auftrag.mock.calls[0][0]).toEqual({
      auftrag: {
        anweisungen: [
          {
            tabelle: LOANS,
            art: 'delete',
            id: 'r-00001',
            erwartet: { book: 'r-00001', borrower: 'Person 001' },
          },
        ],
      },
    });
    expect(aufrufe).toContain('sperre:freigeben');
    expect(n.hinweis).toHaveBeenCalledWith('database.form.deleted');
    expect(n.beiGeschrieben).toHaveBeenCalledTimes(1);
    expect(block(tr)).toBeNull();
  });

  it('zeigt den Lösch-Schutz als Befund unter der Zeile, die Zeile bleibt, die Sperre ist frei', async () => {
    const { n, zeilen, aufrufe, container } = aufbau({
      auftrag: async () => ({
        ok: false,
        lagen: [
          {
            code: 'auftragPruefBefund',
            naht: {
              code: 'regelLoeschenAbhaengige',
              id: 'r-00001',
              zieltabelle: 'Loans',
              felder: ['book'],
              anzahl: 2,
              anzeige: 'r-00003',
            },
          },
        ],
      }),
    });
    const tr = zeilen()[0];
    await loeschen(tr);
    block(tr).querySelector('.db-form-delete-yes').click();
    await flush();
    const befund = block(tr).querySelector('.db-form-errors');
    expect(befund.textContent).toContain('Loans');
    expect(befund.textContent).toContain('r-00001');
    expect(block(tr).querySelector('.db-form-confirm-delete')).toBeNull();
    expect(tr.isConnected).toBe(true);
    expect(aufrufe.filter((a) => a === 'sperre:freigeben')).toHaveLength(1);
    expect(n.beiGeschrieben).not.toHaveBeenCalled();
    expect(container.querySelector('.db-list-new').disabled).toBe(false);
    expect(tr.querySelector('.db-list-delete').disabled).toBe(false);
    // Die nächste Handlung nimmt den Befund weg.
    await loeschen(zeilen()[2]);
    expect(block(tr)).toBeNull();
  });

  // 4T-002325: Die Index-Aktualisierung kurz nach «Ja, löschen» befüllte den
  // Block neu und nahm den Befund nach 100 bis 250 ms wieder weg.
  it('behält den Befund des Lösch-Schutzes, wenn der Block zwischen Abweisung und Prüfung neu befüllt wird', async () => {
    const { zeile, zeilen, befuelle, befuellung } = aufbau({ auftrag: async () => SCHUTZ });
    const tr = zeilen()[0];
    await loeschen(tr);
    block(tr).querySelector('.db-form-delete-yes').click();
    // Die Aktualisierung trifft ein, während der Auftrag noch unterwegs ist ...
    befuelle();
    await flush();
    // ... und nach der Abweisung ein zweites Mal.
    befuelle();
    await flush();
    expect(zeile.inBearbeitung()).toBe(false);
    expect(zeile.zeigtBlock()).toBe(true);
    expect(befuellung).toEqual({ vermerkt: true, zahl: 0 });
    expect(tr.isConnected).toBe(true);
    expect(block(tr).querySelector('.db-form-errors').textContent).toContain('Loans');
  });

  it('holt die zurückgestellte Befüllung nach, sobald der Block des Befunds endet', async () => {
    const { zeilen, befuelle, befuellung } = aufbau({ auftrag: async () => SCHUTZ });
    const tr = zeilen()[0];
    await loeschen(tr);
    block(tr).querySelector('.db-form-delete-yes').click();
    await flush();
    befuelle();
    expect(befuellung.zahl).toBe(0);
    // Eine andere Handlung beendet den Block; solange sie läuft, bleibt es angehalten.
    const andere = zeilen()[2];
    await loeschen(andere);
    expect(block(tr)).toBeNull();
    expect(befuellung).toEqual({ vermerkt: true, zahl: 0 });
    block(andere).querySelector('.db-form-delete-no').click();
    await flush();
    // Ihr Ende holt die Befüllung nach: Das Gitter ist neu, ohne Block.
    expect(befuellung).toEqual({ vermerkt: false, zahl: 1 });
    expect(tr.isConnected).toBe(false);
    expect(zeilen()).toHaveLength(3);
    expect(document.querySelector('tr.db-list-row-block')).toBeNull();
  });

  it('gibt mit «Nein» die Sperre frei, ohne Auftrag', async () => {
    const { n, zeilen, aufrufe, container } = aufbau();
    const tr = zeilen()[2];
    await loeschen(tr);
    block(tr).querySelector('.db-form-delete-no').click();
    await flush();
    expect(aufrufe).toContain('sperre:freigeben');
    expect(n.auftrag).not.toHaveBeenCalled();
    expect(block(tr)).toBeNull();
    expect(container.querySelector('.db-list-new').disabled).toBe(false);
  });
});

// --- Sperren: verwaiste Zeile und angehaltenes Blättern ------------------------------------

describe('Listen-Maske: Sperren beim Anlegen und Löschen (4T-002251, S5, Festlegung 5)', () => {
  it('gibt die Sperre einer Zeile frei, die den Baum verlassen hat', async () => {
    const { n, zeilen, container } = aufbau();
    zeilen()[0].querySelector('.db-list-edit').click();
    await flush();
    expect(n.sperre.mock.calls.map((c) => c[0].aktion)).toEqual(['nehmen']);
    container.remove();
    raeumeVerwaisteSperren();
    await flush();
    expect(n.sperre.mock.calls.map((c) => c[0].aktion)).toEqual(['nehmen', 'freigeben']);
    // Ein zweiter Aufruf ist folgenlos.
    raeumeVerwaisteSperren();
    await flush();
    expect(n.sperre).toHaveBeenCalledTimes(2);
  });

  it('sperrt Blättern, «Neue Zeile» und «Löschen», solange eine Zeile bearbeitet wird', async () => {
    const { container, zeilen } = aufbau({ anzahl: 60 });
    const tr = zeilen()[0];
    tr.querySelector('.db-list-edit').click();
    await flush();
    expect(container.querySelector('.db-list-next').disabled).toBe(true);
    expect(container.querySelector('.db-list-new').disabled).toBe(true);
    expect(zeilen()[1].querySelector('.db-list-delete').disabled).toBe(true);
    tr.querySelector('.db-list-cancel').click();
    await flush();
    expect(container.querySelector('.db-list-next').disabled).toBe(false);
    expect(container.querySelector('.db-list-new').disabled).toBe(false);
    expect(zeilen()[1].querySelector('.db-list-delete').disabled).toBe(false);
    // Während einer Neuanlage ebenso.
    await neueZeile(container);
    expect(container.querySelector('.db-list-next').disabled).toBe(true);
    expect(container.querySelector('.db-list-new').disabled).toBe(true);
  });
});
