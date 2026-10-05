// @vitest-environment jsdom
// 4T-002024 (Epic 3E-000192): Prüffälle des Dialogs «Diagramm einfügen und
// bearbeiten» (src/renderer/modules/charts/chart-dialog.js) am Bedienweg:
// Auswahl, Klick, Tastendruck. Angebot und Vorbelegung kommen wie beim späteren
// Aufrufer aus dem Formular-Kern (src/shared/charts/chart-form.js); was der
// Dialog zurückgibt, wird gegen die Folge von `updateChartForm` mit denselben
// Schritten gehalten und über den Format-Kern als zeichenbarer Block
// gegengeprüft. Die Kriterien-Nummern sind die des Tasks.
//
// Die Texte kommen aus dem Fragment `chart` der fünf Sprachen, `dialog.cancel`
// aus `common`; gelesen wird im Modulkopf, wie in diagramm-hinweis.test.js.
// Sichtbar gerendert wird hier nichts: jsdom kennt die Stil-Kaskade nicht. Die
// Regel der rollbaren Liste wird deshalb in der Stil-Datei nachgesehen; den
// sichtbaren Dialog trägt der Ablauf-Fall der Bedien-Schicht.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  focusOpenChartDialog,
  openChartDialog,
} from '../../../src/renderer/modules/charts/chart-dialog.js';
import {
  buildChartOffer,
  insertFormDefaults,
  editFormFromSpec,
  updateChartForm,
  chartSpecFromForm,
  chartUnavailableReason,
} from '../../../src/shared/charts/chart-form.js';
import {
  parseChartSpec,
  serializeChartSpec,
  buildChartInputInDocument,
} from '../../../src/shared/markdown/perspective-chart.js';
import { parsePerspectiveDatatable } from '../../../src/shared/markdown/perspective-datatable.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..', '..');
const FRAGMENTE = path.join(WURZEL, 'src', 'i18n', 'fragments');
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const lies = (...teile) => fs.readFileSync(path.join(...teile), 'utf8');
const TEXTE = Object.fromEntries(
  SPRACHEN.map((code) => [
    code,
    {
      ...JSON.parse(lies(FRAGMENTE, code, 'common.json')),
      ...JSON.parse(lies(FRAGMENTE, code, 'chart.json')),
    },
  ]),
);
const DE = TEXTE.de;
const t = (key) => DE[key] ?? key;

// Zahl-, berechnete, Text-, Datums- und Wahrheits-Spalten (Muster
// chart-form.test.js).
const GEMISCHT = [
  'columns: Monat:text, Stichtag:date, Einnahmen "Einnahmen (netto)":number(2), Ausgaben:number, Saldo:number = Einnahmen - Ausgaben, Notiz:text = "x", Erledigt:boolean',
  '| Januar  | 2026-01-31 | 100 | 80 | x |',
  '| Februar | 2026-02-28 | 90  | 95 |   |',
  '| März    | 2026-03-31 | 120 | 70 | x |',
];
// Zwei gleiche und ein leerer Eintrag: drei Zeilen stehen nicht zur Wahl.
const DOPPELT = [
  'columns: Name:text, A:number, B:number',
  '| X | 1 | 2 |',
  '| X | 3 | 4 |',
  '| Y | 5 | 6 |',
  '|   | 7 | 8 |',
  '| Z | 9 | 1 |',
];

const angebotAus = (zeilen) => buildChartOffer(parsePerspectiveDatatable(zeilen.join('\n')));

// Öffnet den Dialog wie der spätere Aufrufer und liefert Zugriff auf ihn.
function oeffne(zeilen, optionen = {}) {
  const offer = angebotAus(zeilen);
  const form =
    optionen.body != null
      ? editFormFromSpec(offer, parseChartSpec(optionen.body))
      : insertFormDefaults(offer);
  const ergebnis = openChartDialog({
    modus: optionen.body != null ? 'edit' : 'insert',
    offer,
    form,
    t: optionen.t || t,
    tabellenName: optionen.tabellenName,
    tabellenDokument: optionen.tabellenDokument,
    anker: optionen.anker,
  });
  const modal = document.querySelector('.chart-dialog-modal');
  return { offer, form, ergebnis, modal, ...zugriff(modal) };
}

function zugriff(modal) {
  return {
    art: modal.querySelector('#chart-dialog-type'),
    beschriftung: modal.querySelector('#chart-dialog-labels'),
    titel: modal.querySelector('#chart-dialog-title'),
    richtung: (mode) => modal.querySelector(`input[name="chart-dialog-series"][value="${mode}"]`),
    reihen: () => [...modal.querySelectorAll('.chart-dialog-liste input')],
    knopf: (aktion) => modal.querySelector(`[data-aktion="${aktion}"]`),
  };
}

// Die Zeilen der Datenreihen-Liste: Text, Kennzeichen, Art und Auswahl.
function listenZeilen(modal) {
  return [...modal.querySelectorAll('.chart-dialog-liste label')].map((label) => {
    const eingabe = label.querySelector('input');
    return {
      text: label.querySelector('span').textContent,
      berechnet: label.querySelector('.chart-dialog-berechnet')?.textContent ?? null,
      typ: eingabe.type,
      an: eingabe.checked,
      fest: eingabe.disabled,
    };
  });
}

function setze(select, wert) {
  select.value = wert;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}
function taste(ziel, key, extra = {}) {
  const e = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  ziel.dispatchEvent(e);
  return e;
}
const reiheMit = (modal, text) =>
  [...modal.querySelectorAll('.chart-dialog-liste label')]
    .find((l) => l.querySelector('span').textContent === text)
    .querySelector('input');
const hinweis = (modal, art) => modal.querySelector(`[data-hinweis="${art}"]`);

// Gegenprobe am Format-Kern: der geschriebene Block ist zeichenbar.
function zeichenbar(zeilen, form, body) {
  const spec = chartSpecFromForm(form, body == null ? undefined : parseChartSpec(body));
  const block = serializeChartSpec({ ...spec, table: '^t' });
  const dokument = ['```perspective-datatable', ...zeilen, '```', '^t', ''].join('\n');
  return buildChartInputInDocument(parseChartSpec(block), dokument, 't');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// --- Angebot und Vorbelegung ---------------------------------------------------------

describe('Diagramm-Dialog: Felder, Angebot und Vorbelegung (AK2, AK3, AK7)', () => {
  it('Einfügen zeigt die fünf Felder mit der Vorbelegung des Kerns', async () => {
    const { modal, form, art, beschriftung, titel, richtung, knopf, ergebnis } = oeffne(GEMISCHT);
    expect(modal.querySelector('h2').textContent).toBe('Diagramm zu dieser Tabelle einfügen');
    expect(modal.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    expect(art.value).toBe(form.type);
    expect([...art.options].map((o) => o.textContent)).toEqual([
      'Linie',
      'Balken',
      'Kreis',
      'Donut',
    ]);
    expect(richtung('columns').checked).toBe(true);
    expect(richtung('rows').checked).toBe(false);
    expect(beschriftung.value).toBe('Monat');
    expect(titel.value).toBe('');
    expect(listenZeilen(modal).filter((z) => z.an).length).toBe(form.values.length);
    expect(knopf('bestaetigen').textContent).toBe('Einfügen');
    expect(knopf('abbrechen').textContent).toBe('Abbrechen');
    expect(modal.querySelector('.chart-dialog-tabelle')).toBeNull();
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('als Werte nur Zahl-Spalten, berechnete gekennzeichnet; als Beschriftung jede Spalte', async () => {
    const { modal, beschriftung, knopf, ergebnis } = oeffne(GEMISCHT);
    expect(listenZeilen(modal)).toEqual([
      { text: 'Einnahmen (netto)', berechnet: null, typ: 'checkbox', an: true, fest: false },
      { text: 'Ausgaben', berechnet: null, typ: 'checkbox', an: true, fest: false },
      { text: 'Saldo', berechnet: 'berechnet', typ: 'checkbox', an: true, fest: false },
    ]);
    expect([...beschriftung.options].map((o) => [o.textContent, o.disabled])).toEqual([
      ['Monat', false],
      ['Stichtag', false],
      ['Einnahmen (netto)', false],
      ['Ausgaben', false],
      ['Saldo', false],
      ['Notiz', false],
      ['Erledigt', false],
    ]);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('Kreis macht aus Kästchen Radio-Knöpfe mit genau einer Auswahl, mit Hinweis', async () => {
    const { modal, art, offer, form, knopf, ergebnis } = oeffne(GEMISCHT);
    expect(hinweis(modal, 'einzeln').hidden).toBe(true);
    setze(art, 'pie');
    const zeilen = listenZeilen(modal);
    expect(zeilen.map((z) => z.typ)).toEqual(['radio', 'radio', 'radio']);
    expect(zeilen.filter((z) => z.an)).toHaveLength(1);
    expect(hinweis(modal, 'einzeln').hidden).toBe(false);
    expect(hinweis(modal, 'einzeln').textContent).toBe(DE['chart.dialog.singleSeries']);
    // Eine andere Reihe wählen: die vorige fällt heraus.
    reiheMit(modal, 'Saldo').click();
    expect(listenZeilen(modal).map((z) => z.an)).toEqual([false, false, true]);
    // Zurück zu Balken: Kästchen, der Stand des Kerns.
    setze(art, 'bar');
    let kern = updateChartForm(offer, form, { type: 'pie' });
    kern = updateChartForm(offer, kern, { values: ['Saldo'] });
    kern = updateChartForm(offer, kern, { type: 'bar' });
    expect(listenZeilen(modal).map((z) => [z.typ, z.an])).toEqual([
      ['checkbox', false],
      ['checkbox', false],
      ['checkbox', kern.values.includes('Saldo')],
    ]);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('Zeilen zeigt die Zeilen mit ihrem Eintrag; ausgelassene werden gezählt', async () => {
    const { modal, richtung, knopf, ergebnis } = oeffne(DOPPELT);
    expect(hinweis(modal, 'ausgelassen').hidden).toBe(true);
    richtung('rows').click();
    expect(modal.querySelector('.chart-dialog-gruppe:nth-of-type(2) legend').textContent).toBe(
      'Datenreihen (Zeilen)',
    );
    expect(listenZeilen(modal).map((z) => [z.text, z.an])).toEqual([
      ['Y', true],
      ['Z', true],
    ]);
    expect(hinweis(modal, 'ausgelassen').hidden).toBe(false);
    expect(hinweis(modal, 'ausgelassen').textContent).toBe(
      '3 Zeilen stehen nicht zur Wahl, weil ihr Eintrag in der Beschriftungs-Spalte leer oder nicht eindeutig ist.',
    );
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('eine einzelne ausgelassene Zeile steht in der Einzahl', async () => {
    const { modal, richtung, knopf, ergebnis } = oeffne([
      'columns: Name:text, Wert:number',
      '| A | 1 |',
      '|   | 2 |',
    ]);
    richtung('rows').click();
    expect(hinweis(modal, 'ausgelassen').textContent).toBe(DE['chart.dialog.rowsSkipped.one']);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('der Wechsel der Beschriftungs-Spalte räumt sie aus den Datenreihen', async () => {
    const { modal, beschriftung, knopf, ergebnis } = oeffne(GEMISCHT);
    setze(beschriftung, 'Ausgaben');
    expect(beschriftung.value).toBe('Ausgaben');
    expect(listenZeilen(modal).map((z) => z.text)).toEqual(['Einnahmen (netto)', 'Saldo']);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('das letzte angehakte Kästchen bleibt angehakt', async () => {
    const { modal, knopf, ergebnis } = oeffne(GEMISCHT);
    reiheMit(modal, 'Einnahmen (netto)').click();
    reiheMit(modal, 'Ausgaben').click();
    expect(listenZeilen(modal).map((z) => [z.an, z.fest])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
    reiheMit(modal, 'Saldo').click();
    expect(reiheMit(modal, 'Saldo').checked).toBe(true);
    // Eine zweite Reihe gibt die erste wieder frei.
    reiheMit(modal, 'Ausgaben').click();
    expect(reiheMit(modal, 'Saldo').disabled).toBe(false);
    knopf('bestaetigen').click();
    expect((await ergebnis).form.values).toEqual(['Ausgaben', 'Saldo']);
  });

  it('eine Richtung und eine Beschriftung ohne verbleibende Datenreihe sind nicht wählbar', async () => {
    const { richtung, beschriftung, knopf, ergebnis } = oeffne([
      'columns: Name:text, Wert:number',
      '| A | 1 |',
      '| A | 2 |',
    ]);
    expect(richtung('rows').disabled).toBe(true);
    expect(richtung('columns').disabled).toBe(false);
    expect([...beschriftung.options].map((o) => [o.value, o.disabled])).toEqual([
      ['Name', false],
      ['Wert', true],
    ]);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('Bearbeiten ist mit den Angaben des Blocks vorbelegt und nennt die Tabelle (AK7)', async () => {
    const body =
      'table: ^umsatz\ntype: donut\nseries: rows\nlabels: Monat\nrows: Februar\ntitle: Umsatz\n';
    const { modal, art, richtung, beschriftung, titel, knopf, ergebnis } = oeffne(GEMISCHT, {
      body,
      tabellenName: '^umsatz',
    });
    expect(modal.querySelector('h2').textContent).toBe('Diagramm bearbeiten');
    expect(modal.querySelector('.chart-dialog-tabelle').textContent).toBe('Tabelle: ^umsatz');
    expect(art.value).toBe('donut');
    expect(richtung('rows').checked).toBe(true);
    expect(beschriftung.value).toBe('Monat');
    expect(listenZeilen(modal).map((z) => [z.text, z.typ, z.an])).toEqual([
      ['Januar', 'radio', false],
      ['Februar', 'radio', true],
      ['März', 'radio', false],
    ]);
    expect(titel.value).toBe('Umsatz');
    expect(knopf('bestaetigen').textContent).toBe('Übernehmen');
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('Tabelle in einem anderen Dokument: ein Satz mit beiden Namen (V3)', async () => {
    const body = 'table: [[Quelle#^umsatz]]\ntype: bar\nlabels: Monat\n';
    // Ein eingesetzter Name wird nicht erneut nach Platzhaltern durchsucht.
    const { modal, knopf, ergebnis } = oeffne(GEMISCHT, {
      body,
      tabellenName: 'umsatz {file}',
      tabellenDokument: 'Quelle',
    });
    expect(modal.querySelector('.chart-dialog-tabelle').textContent).toBe(
      'Tabelle: umsatz {file} im Dokument «Quelle»',
    );
    knopf('abbrechen').click();
    await ergebnis;
  });
});

// --- Bestätigen und Abbrechen ------------------------------------------------------

describe('Diagramm-Dialog: Bestätigen und Abbrechen (AK11, AK12, AK26)', () => {
  it('Bestätigen liefert den Stand des Kerns nach denselben Schritten; der Block ist zeichenbar', async () => {
    const { modal, offer, form, art, beschriftung, titel, knopf, ergebnis } = oeffne(GEMISCHT);
    setze(art, 'line');
    setze(beschriftung, 'Stichtag');
    reiheMit(modal, 'Ausgaben').click();
    titel.value = '  Umsatz 2026 ';
    titel.dispatchEvent(new window.Event('input', { bubbles: true }));
    knopf('bestaetigen').click();
    const erg = await ergebnis;
    let kern = updateChartForm(offer, form, { type: 'line' });
    kern = updateChartForm(offer, kern, { labels: 'Stichtag' });
    kern = updateChartForm(offer, kern, { values: ['Einnahmen', 'Saldo'] });
    kern = updateChartForm(offer, kern, { title: '  Umsatz 2026 ' });
    expect(erg).toEqual({ ok: true, form: kern });
    expect(erg.form.title).toBe('Umsatz 2026');
    expect(zeichenbar(GEMISCHT, erg.form).drawable).toBe(true);
  });

  it('an einer zweiten Tabelle mit Zeilen und Kreis: ebenso', async () => {
    const { modal, offer, form, art, richtung, knopf, ergebnis } = oeffne(DOPPELT);
    richtung('rows').click();
    setze(art, 'pie');
    reiheMit(modal, 'Z').click();
    knopf('bestaetigen').click();
    const erg = await ergebnis;
    let kern = updateChartForm(offer, form, { series: 'rows' });
    kern = updateChartForm(offer, kern, { type: 'pie' });
    kern = updateChartForm(offer, kern, { rows: ['Z'] });
    expect(erg).toEqual({ ok: true, form: kern });
    expect(erg.form).toMatchObject({ type: 'pie', series: 'rows', rows: ['Z'] });
    expect(zeichenbar(DOPPELT, erg.form).drawable).toBe(true);
  });

  it('unverändertes Bestätigen beim Bearbeiten liefert die Vorbelegung', async () => {
    const body = 'table: ^t\ntype: bar\nlabels: Monat\nvalues: Saldo, Einnahmen\n';
    const { form, knopf, ergebnis } = oeffne(GEMISCHT, { body });
    knopf('bestaetigen').click();
    const erg = await ergebnis;
    expect(erg).toEqual({ ok: true, form });
    expect(zeichenbar(GEMISCHT, erg.form, body).drawable).toBe(true);
  });

  for (const [weg, ausloesen] of [
    ['Knopf «Abbrechen»', (m) => zugriff(m).knopf('abbrechen').click()],
    ['Escape', (m) => taste(m.querySelector('#chart-dialog-type'), 'Escape')],
    ['Klick auf den Hintergrund', (m) => m.querySelector('.bookmark-modal-backdrop').click()],
  ]) {
    it(`Abbrechen über ${weg} liefert «abgebrochen» und ändert nichts`, async () => {
      const { modal, form, art, ergebnis } = oeffne(GEMISCHT);
      const vorher = JSON.stringify(form);
      setze(art, 'donut');
      ausloesen(modal);
      expect(await ergebnis).toEqual({ ok: false });
      expect(JSON.stringify(form)).toBe(vorher);
      expect(document.querySelector('.chart-dialog-modal')).toBeNull();
    });
  }
});

// --- Tastatur ------------------------------------------------------------------------

describe('Diagramm-Dialog: ohne Maus bedienbar (AK26)', () => {
  it('Fokus beim Öffnen auf der Diagramm-Art', async () => {
    const { art, knopf, ergebnis } = oeffne(GEMISCHT);
    expect(document.activeElement).toBe(art);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('die Felder stehen in der Reihenfolge des Dialogs, Tab bleibt im Dialog', async () => {
    const { modal, art, knopf, ergebnis } = oeffne(GEMISCHT);
    const folge = [...modal.querySelectorAll('select, input, button')].map(
      (el) => el.id || el.name || el.dataset.aktion,
    );
    expect(folge).toEqual([
      'chart-dialog-type',
      'chart-dialog-series',
      'chart-dialog-series',
      'chart-dialog-labels',
      'chart-dialog-reihe',
      'chart-dialog-reihe',
      'chart-dialog-reihe',
      'chart-dialog-title',
      'abbrechen',
      'bestaetigen',
    ]);
    knopf('bestaetigen').focus();
    expect(taste(knopf('bestaetigen'), 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(art);
    taste(art, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(knopf('bestaetigen'));
    // Mitten im Dialog bleibt Tab beim Browser.
    art.focus();
    expect(taste(art, 'Tab').defaultPrevented).toBe(false);
    // Ohne Fokus im Dialog holt Tab ihn zurück.
    document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);
    taste(document.body, 'Tab');
    expect(document.activeElement).toBe(art);
    knopf('abbrechen').click();
    await ergebnis;
  });

  it('Enter bestätigt aus einem Feld heraus, auf einem Knopf löst der Knopf aus', async () => {
    const { titel, knopf, ergebnis } = oeffne(GEMISCHT);
    expect(taste(knopf('abbrechen'), 'Enter').defaultPrevented).toBe(false);
    expect(document.querySelector('.chart-dialog-modal')).not.toBeNull();
    titel.focus();
    expect(taste(titel, 'Enter').defaultPrevented).toBe(true);
    expect((await ergebnis).ok).toBe(true);
  });

  it('Tasten einer anderen Oberfläche über dem Dialog bleiben dort (F3)', async () => {
    const { knopf, ergebnis } = oeffne(GEMISCHT);
    // Etwa das Filterfeld der Kommando-Palette, außerhalb des Dialogs.
    const fremd = document.createElement('input');
    document.body.appendChild(fremd);
    fremd.focus();
    try {
      for (const key of ['Enter', 'Escape', 'Tab']) {
        expect(taste(fremd, key).defaultPrevented, key).toBe(false);
      }
      expect(document.querySelector('.chart-dialog-modal')).not.toBeNull();
      expect(document.activeElement).toBe(fremd);
    } finally {
      fremd.remove();
    }
    // Ohne Fokus (Ziel ist die Seite) gilt die Taste weiter dem Dialog.
    document.activeElement.blur();
    expect(taste(document.body, 'Escape').defaultPrevented).toBe(true);
    expect((await ergebnis).ok).toBe(false);
    expect(knopf('abbrechen').isConnected).toBe(false);
  });

  it('Escape erreicht das Fenster darunter nicht', async () => {
    const gesehen = [];
    const hoerer = (e) => gesehen.push(e.key);
    document.body.addEventListener('keydown', hoerer);
    const { art, ergebnis } = oeffne(GEMISCHT);
    taste(art, 'Escape');
    await ergebnis;
    document.body.removeEventListener('keydown', hoerer);
    expect(gesehen).toEqual([]);
  });

  it('beim Schließen geht der Fokus zurück: an das vorige Element, sonst an den Anker', async () => {
    const vorher = document.createElement('button');
    document.body.appendChild(vorher);
    vorher.focus();
    const erster = oeffne(GEMISCHT);
    erster.knopf('abbrechen').click();
    await erster.ergebnis;
    expect(document.activeElement).toBe(vorher);

    const anker = document.createElement('textarea');
    document.body.appendChild(anker);
    vorher.focus();
    const zweiter = oeffne(GEMISCHT, { anker });
    zweiter.knopf('bestaetigen').click();
    await zweiter.ergebnis;
    expect(document.activeElement).toBe(anker);
  });

  it('focusOpenChartDialog holt den offenen Dialog nach vorn; ohne offenen Dialog nichts (DE-17)', async () => {
    const draussen = document.createElement('button');
    document.body.appendChild(draussen);
    const { art, knopf, ergebnis } = oeffne(GEMISCHT);
    draussen.focus();
    expect(focusOpenChartDialog()).toBe(true);
    expect(document.activeElement).toBe(art);
    knopf('abbrechen').click();
    await ergebnis;
    draussen.focus();
    expect(focusOpenChartDialog()).toBe(false);
    expect(document.activeElement).toBe(draussen);
  });
});

// --- Texte ---------------------------------------------------------------------------

describe('Diagramm-Dialog: Texte', () => {
  it('jeder sichtbare Text kommt aus t oder aus der Tabelle', async () => {
    const zeilen = DOPPELT.concat(['| Y | 2 | 2 |']);
    const schluessel = (key) => key;
    const body = 'table: ^t\ntype: pie\nseries: rows\nlabels: Name\nrows: Z\n';
    const { modal, knopf, ergebnis } = oeffne(zeilen, { body, t: schluessel, tabellenName: '^t' });
    const offer = angebotAus(zeilen);
    const ausTabelle = new Set([...offer.columns.map((c) => c.heading), ...offer.entries.flat()]);
    const walker = document.createTreeWalker(modal, window.NodeFilter.SHOW_TEXT);
    const texte = [];
    while (walker.nextNode())
      if (walker.currentNode.textContent.trim()) texte.push(walker.currentNode.textContent);
    expect(texte.length).toBeGreaterThan(10);
    const fremd = texte.filter(
      (s) => !ausTabelle.has(s) && !/^(chart\.dialog\.[\w.]+|dialog\.cancel)$/.test(s),
    );
    expect(fremd).toEqual([]);
    // Und die Gegenprobe: mit der deutschen Fassung steht kein Schlüssel da.
    knopf('abbrechen').click();
    await ergebnis;
    const de = oeffne(zeilen, { body, tabellenName: '^t' });
    expect(de.modal.textContent).not.toMatch(/chart\.dialog\./);
    de.knopf('abbrechen').click();
    await de.ergebnis;
  });

  it('die Texte des Dialogs liegen in allen fünf Sprachen vor, ohne ASCII-Anführungszeichen', () => {
    const quelle = lies(WURZEL, 'src', 'renderer', 'modules', 'charts', 'chart-dialog.js');
    const feste = [...quelle.matchAll(/'(chart\.dialog\.[A-Za-z.]+[A-Za-z])'/g)].map((m) => m[1]);
    const dynamisch = ['line', 'bar', 'pie', 'donut']
      .map((a) => `chart.dialog.type.${a}`)
      .concat(['columns', 'rows'].map((r) => `chart.dialog.series.${r}`));
    expect(feste.length).toBeGreaterThan(12);
    for (const code of SPRACHEN) {
      for (const key of [...feste, ...dynamisch, 'dialog.cancel']) {
        expect(TEXTE[code][key], `${key} fehlt in ${code}`).toBeTruthy();
        expect(TEXTE[code][key], `${key} in ${code}`).not.toContain('"');
      }
    }
  });
});

// --- Große Tabelle -------------------------------------------------------------------

describe('Diagramm-Dialog: große Tabelle', () => {
  it('2000 Zeilen: Öffnen und Wechsel auf Zeilen in vertretbarer Zeit, die Liste rollt', async () => {
    const zeilen = ['columns: Name:text, Wert:number, Plan:number'];
    for (let i = 1; i <= 2000; i++) zeilen.push(`| Zeile ${i} | ${i} | ${2 * i} |`);
    const offer = angebotAus(zeilen);
    expect(chartUnavailableReason(parsePerspectiveDatatable(zeilen.join('\n')), offer)).toBeNull();
    // Gemessen wird allein der Dialog; Angebot und Vorbelegung sind Arbeit des
    // Aufrufers. Die Schwelle ist großzügig, weil jsdom deutlich langsamer baut
    // als die Anzeige der Anwendung; sie fängt ein Wachstum im Quadrat der
    // Zeilen-Zahl, nicht eine Schwankung der Last.
    const start = performance.now();
    const ergebnis = openChartDialog({
      modus: 'insert',
      offer,
      form: insertFormDefaults(offer),
      t,
    });
    const modal = document.querySelector('.chart-dialog-modal');
    zugriff(modal).richtung('rows').click();
    const dauer = performance.now() - start;
    expect(zugriff(modal).reihen()).toHaveLength(2000);
    expect(dauer).toBeLessThan(3000);
    expect(modal.querySelector('.chart-dialog-liste').dataset.series).toBe('rows');
    zugriff(modal).knopf('abbrechen').click();
    await ergebnis;
    // Die Regel der Stil-Datei: feste Höchsthöhe und eigene Rollleiste.
    const stil = lies(WURZEL, 'src', 'renderer', 'styles', 'abfragen-und-ereignisse.css');
    const regel = /\.chart-dialog-liste\s*\{([^}]*)\}/.exec(stil);
    expect(regel).not.toBeNull();
    expect(regel[1]).toMatch(/max-height:\s*[\d.]+em/);
    expect(regel[1]).toMatch(/overflow-y:\s*auto/);
  });
});
