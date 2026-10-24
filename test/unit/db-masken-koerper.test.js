// @vitest-environment jsdom
// 4T-002182 (Epic 3E-000261, Sitzungs-Entscheidung S1): Der Inhalt der
// Einzel-Maske unter ihrem Kopf, ausgezogen aus der Masken-Seite ohne
// Verhaltensänderung — Satz «nicht bearbeitbar», Hinweise, Körper aus Markdown-
// und Feld-Segmenten und der Nachlauf mit Teilbaum-Schritten und Fokus.
//
// **Gemessen wird am Modul und nicht an der Seite** (Muster
// `db-masken-speichern.test.js`): Kanal und Schritt-Satz werden ersetzt, das
// Zustands-Objekt der Seite wird hereingereicht. Die Seite um das Modul herum
// prüfen die Ablauf-Fälle DB-MAS-01 bis DB-MAS-06 an der laufenden Anwendung.
//
// **Der deutsche Katalog wird geladen**, weil die Sätze geprüft werden und
// nicht die Schlüssel-Namen.
//
// 4T-002183 (Epic 3E-000261): dazu die Stelle eines Wert-Platzhalters — Wert in
// der Zell-Formatierung, keine Eingabe, Neu-Rechnen je Eingabe ohne Neuzeichnen,
// leere markierte Stelle bei fehlendem Wert und bei ungültigem Ausdruck.
//
// 4T-002186 (Epic 3E-000261, E7.8, F5 A, Entscheidung des Product Owners vom
// 2026-10-10): dazu die bedingten Bereiche — sichtbar nach ihrer Bedingung,
// verschachtelt, jeder Eingabe folgend ohne Neuzeichnen, mit der Liste der
// verborgenen Felder für das Speichern — und der Wert im Satz als Stelle im
// gerenderten Absatz samt Rückfall an das Ende des Blocks.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import de from '../../src/i18n/de.json';

const renderMarkdown = vi.fn((text) => `<p>${text}</p>`);
const applyTeilbaumSchritte = vi.fn();

vi.mock('../../src/renderer/modules/app/api.js', () => ({
  api: { renderMarkdown: (...args) => renderMarkdown(...args) },
}));
vi.mock('../../src/renderer/modules/render-mermaid.js', () => ({
  applyTeilbaumSchritte: (...args) => applyTeilbaumSchritte(...args),
}));

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const {
  istBearbeitbar,
  istLoeschbar,
  zeichneHinweise,
  zeichneKoerper,
  zeichneInhalt,
  zeichneNachlauf,
  fuelleWert,
  verborgeneFelder,
} = await import('../../src/renderer/modules/database/masken-koerper.js');
const { zerlegeMaskenKoerper } = await import('../../src/shared/database/form-body.js');
const { MODUS_BEARBEITEN, MODUS_LESEN } =
  await import('../../src/renderer/modules/database/masken-felder.js');

const TAB = 'C:/Bereich/Kunden.md';
const verweise = { optionen: () => ({}) };

function seiteMit(zusatz = {}) {
  return {
    tabellenPfad: TAB,
    modus: MODUS_LESEN,
    entwurf: null,
    befunde: null,
    fokus: null,
    ...zusatz,
  };
}

function datenMit(zusatz = {}) {
  return {
    status: 'ready',
    fields: [{ name: 'Name', type: 'string' }],
    zellen: [{ name: 'Name', text: 'Clara', value: 'Clara', error: null, fehlt: false }],
    editable: null,
    koerper: {
      segmente: [
        { art: 'markdown', text: '# Kunde' },
        { art: 'markdown', text: '   ' },
        { art: 'feld', name: 'Name' },
        { art: 'feld', name: 'Unbekannt' },
      ],
      hints: [],
    },
    ...zusatz,
  };
}

beforeEach(() => {
  renderMarkdown.mockClear();
  applyTeilbaumSchritte.mockClear();
  document.body.innerHTML = '';
});

describe('istBearbeitbar', () => {
  it('verneint allein eine ausdrücklich nicht erfüllte Bedingung', () => {
    expect(istBearbeitbar(null)).toBe(true);
    expect(istBearbeitbar({ editable: null })).toBe(true);
    expect(istBearbeitbar({ editable: { erfuellt: true } })).toBe(true);
    expect(istBearbeitbar({ editable: { erfuellt: false } })).toBe(false);
  });
});

// 4T-002311 (E12.4, Story AK1, AK2, AK4): Bedingung und Rolle schneiden sich
// zu [bearbeitbar, löschbar], bei einer Neuanlage zählt anlegen statt ändern;
// ohne Erlaubnis-Menge (null, und fehlend wie in allen Fällen oben) wie ohne Rollen.
describe('Berechtigung der Einzel-Maske (4T-002311)', () => {
  const R = (create, update, del) => ({ rechte: { create, update, delete: del, define: false } });
  const lage = (d, neu = false) => [istBearbeitbar(d, { neu }), istLoeschbar(d)];

  it('schneidet Bedingung und Rolle; mit rechte null wie heute (4T-002311)', () => {
    expect(lage(datenMit(R(false, true, false)))).toEqual([true, false]);
    expect(lage(datenMit(R(false, true, false)), true)).toEqual([false, false]);
    expect(lage(datenMit(R(true, false, true)), true)).toEqual([true, true]);
    expect(lage(datenMit(R(false, false, true)))).toEqual([false, true]);
    expect(lage(datenMit({ editable: { erfuellt: false } }))).toEqual([false, false]);
    expect(lage(datenMit({ rechte: null }), true)).toEqual([true, true]);
  });

  it('nennt die Rolle im Satz, wenn sie das Ändern verwehrt; Felder lesend (4T-002311)', () => {
    const wurzel = document.createElement('div');
    const daten = datenMit({ ...R(true, false, false), rolle: 'assistant' });
    zeichneInhalt(wurzel, daten, { seite: seiteMit(), verweise });
    const satz = 'Die Rolle «assistant» darf Datensätze der Tabelle «Kunden» nicht ändern.';
    expect(wurzel.querySelector('.db-form-not-editable.db-form-role').textContent).toBe(satz);
    expect(wurzel.querySelector('.db-form-input')).toBeNull();
  });
});

describe('zeichneHinweise', () => {
  it('ohne Hinweis entsteht kein Block', () => {
    const wurzel = document.createElement('div');
    zeichneHinweise(wurzel, []);
    expect(wurzel.children.length).toBe(0);
  });

  it('jeder Hinweis wird ein Satz mit seinem Code', () => {
    const wurzel = document.createElement('div');
    zeichneHinweise(wurzel, [{ code: 'formPlatzhalterUnbekannt', zeile: 3, name: 'wert:x' }]);
    expect(wurzel.querySelector('.db-form-hints-title').textContent).toBe(
      de['database.form.hints'],
    );
    const punkte = wurzel.querySelectorAll('.db-form-hints-list .db-form-hint');
    expect(punkte.length).toBe(1);
    expect(punkte[0].dataset.formCode).toBe('formPlatzhalterUnbekannt');
    expect(punkte[0].textContent).toContain('Zeile 3');
    expect(punkte[0].textContent).toContain('wert:x');
  });
});

describe('zeichneKoerper', () => {
  it('rendert Markdown-Segmente, überspringt leere und baut Feld-Elemente', () => {
    const wurzel = document.createElement('div');
    const bloecke = zeichneKoerper(wurzel, datenMit(), {
      seite: seiteMit(),
      verweise,
      sprache: 'de',
    });
    const koerper = wurzel.querySelector('.db-form-body');
    expect(koerper).not.toBeNull();
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    expect(renderMarkdown).toHaveBeenCalledWith('# Kunde', TAB);
    expect(koerper.querySelectorAll('.db-form-md.markdown-body').length).toBe(1);
    expect(bloecke).toHaveLength(1);
    expect(bloecke[0].text).toBe('# Kunde');
    const felder = [...koerper.querySelectorAll('.db-form-field')].map((f) => f.dataset.field);
    expect(felder).toEqual(['Name', 'Unbekannt']);
    // Ein Feld ohne Definition fällt auf den Text-Typ zurück.
    expect(koerper.querySelector('[data-field="Unbekannt"]').className).toContain(
      'db-form-type-string',
    );
  });

  it('im Bearbeiten zeigt das Feld den Entwurf und schreibt Änderungen zurück', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Name: 'Bert' } });
    zeichneKoerper(wurzel, datenMit(), { seite, verweise, sprache: 'de' });
    const eingabe = wurzel.querySelector('[data-field="Name"] .db-form-input');
    expect(eingabe.value).toBe('Bert');
    eingabe.value = 'Berta';
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seite.entwurf.Name).toBe('Berta');
  });

  it('markiert ein Feld mit Befund des letzten Auftrags', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ befunde: { amFeld: {}, markiert: ['Name'] } });
    zeichneKoerper(wurzel, datenMit(), { seite, verweise, sprache: 'de' });
    expect(wurzel.querySelector('[data-field="Name"]').classList).toContain('db-form-rejected');
  });
});

describe('zeichneInhalt', () => {
  it('zeichnet Satz «nicht bearbeitbar», Hinweise und Körper in dieser Reihenfolge', () => {
    const wurzel = document.createElement('div');
    const daten = datenMit({ editable: { erfuellt: false, meldung: 'Gesperrt.', grund: null } });
    daten.koerper.hints = [{ code: 'formPlatzhalterUnbekannt', zeile: 1, name: 'x' }];
    zeichneInhalt(wurzel, daten, { seite: seiteMit(), verweise, sprache: 'de' });
    expect([...wurzel.children].map((k) => k.className)).toEqual([
      'db-form-not-editable',
      'db-form-hints',
      'db-form-body',
    ]);
    expect(wurzel.firstChild.textContent).toBe(
      de['database.form.notEditable'].replace('{reason}', 'Gesperrt.'),
    );
  });

  it('ohne Meldung nennt der Satz den Grund der Auswertung oder den Rückfall', () => {
    const satz = (editable) => {
      const wurzel = document.createElement('div');
      zeichneInhalt(wurzel, datenMit({ editable }), { seite: seiteMit(), verweise, sprache: 'de' });
      return wurzel.querySelector('.db-form-not-editable').textContent;
    };
    expect(satz({ erfuellt: false, meldung: null, grund: 'nichtAuswertbar' })).toContain(
      de['database.form.notEditableReason.nichtAuswertbar'],
    );
    expect(satz({ erfuellt: false, meldung: null, grund: 'gibtEsNicht' })).toContain(
      de['database.form.notEditableReason.default'],
    );
  });

  it('ein bearbeitbarer Datensatz ohne Hinweis zeigt allein den Körper', () => {
    const wurzel = document.createElement('div');
    zeichneInhalt(wurzel, datenMit(), { seite: seiteMit(), verweise, sprache: 'de' });
    expect([...wurzel.children].map((k) => k.className)).toEqual(['db-form-body']);
  });
});

describe('zeichneNachlauf', () => {
  it('ruft den Teilbaum-Schritt-Satz je Block mit dem Text des Segments', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit();
    const bloecke = zeichneKoerper(wurzel, datenMit(), { seite, verweise, sprache: 'de' });
    document.body.appendChild(wurzel);
    zeichneNachlauf(wurzel, bloecke, seite);
    expect(applyTeilbaumSchritte).toHaveBeenCalledTimes(1);
    expect(applyTeilbaumSchritte).toHaveBeenCalledWith(bloecke[0].knoten, TAB, {
      dokumentText: '# Kunde',
    });
  });

  it('gibt dem gemerkten Feld einmal den Fokus und vergisst es danach', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Name: 'Clara' }, fokus: 'Name' });
    const bloecke = zeichneKoerper(wurzel, datenMit(), { seite, verweise, sprache: 'de' });
    document.body.appendChild(wurzel);
    zeichneNachlauf(wurzel, bloecke, seite);
    expect(document.activeElement).toBe(wurzel.querySelector('[data-field="Name"] .db-form-input'));
    expect(seite.fokus).toBeNull();
  });
});

// --- 4T-002183: der Wert-Platzhalter -----------------------------------------------------

describe('zeichneKoerper: die Stelle eines Wert-Platzhalters (S3, S4, AK2 bis AK5)', () => {
  const FELDER = [
    { name: 'Menge', type: 'number' },
    { name: 'Preis', type: 'number' },
    { name: 'Lent', type: 'date' },
  ];
  const ZELLEN = [
    { name: 'Menge', text: '3', value: 3, error: null, fehlt: false },
    { name: 'Preis', text: '2.5', value: 2.5, error: null, fehlt: false },
    { name: 'Lent', text: '2026-10-01', value: '2026-10-01', error: null, fehlt: false },
  ];
  // Der Körper kommt aus der echten Zerlegung, damit Segment und Baum dieselbe
  // Gestalt haben wie aus dem Kanal.
  const datenAus = (text) => ({
    ...datenMit(),
    fields: FELDER,
    zellen: ZELLEN,
    koerper: zerlegeMaskenKoerper(text, FELDER),
  });
  const stellen = (wurzel) => [...wurzel.querySelectorAll('.db-form-computed')];

  it('zeigt den Wert im Lesen formatiert wie eine Tabellen-Zelle, als Stelle ohne Eingabe', () => {
    const wurzel = document.createElement('div');
    zeichneKoerper(
      wurzel,
      datenAus('{{value:menge * preis}}\n{{value:lent + dur(14 days)}}\n{{value:menge > 2}}'),
      { seite: seiteMit(), verweise, sprache: 'de' },
    );
    const [summe, faellig, viel] = stellen(wurzel);
    expect(summe.textContent).toBe('7.5');
    expect(faellig.textContent).toBe('2026-10-15');
    expect(viel.textContent).toBe('true');
    expect(summe.dataset.formExpr).toBe('menge * preis');
    for (const stelle of [summe, faellig, viel]) {
      expect(stelle.classList).not.toContain('db-form-computed-empty');
      expect(stelle.classList).not.toContain('db-form-field');
      expect(stelle.querySelector('input, textarea, select')).toBeNull();
      expect(stelle.hasAttribute('title')).toBe(false);
    }
  });

  it('auch im Bearbeiten ist die Stelle kein Feld und kein Eingabe-Element', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Menge: '3', Preis: '2.5' } });
    zeichneKoerper(wurzel, datenAus('{{field:Menge}} {{value:menge * preis}}'), {
      seite,
      verweise,
      sprache: 'de',
    });
    expect(wurzel.querySelectorAll('.db-form-input').length).toBe(1);
    expect(stellen(wurzel)[0].querySelector('.db-form-input')).toBeNull();
    expect([...wurzel.querySelectorAll('.db-form-field')].map((f) => f.dataset.field)).toEqual([
      'Menge',
    ]);
  });

  it('folgt jeder Eingabe ohne Speichern, ohne Neuzeichnen und ohne den Fokus zu verlieren', () => {
    const wurzel = document.createElement('div');
    document.body.appendChild(wurzel);
    const seite = seiteMit({
      modus: MODUS_BEARBEITEN,
      entwurf: { Menge: '3', Preis: '2.5', Lent: '2026-10-01' },
    });
    zeichneKoerper(
      wurzel,
      datenAus(
        '{{field:Menge}}\n{{value:menge * preis}}\n{{field:Lent}} {{value:lent + dur(14 days)}}',
      ),
      { seite, verweise, sprache: 'de' },
    );
    const [summe, faellig] = stellen(wurzel);
    const menge = wurzel.querySelector('[data-field="Menge"] .db-form-input');
    menge.focus();
    menge.value = '4';
    menge.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seite.entwurf.Menge).toBe('4');
    expect(summe.textContent).toBe('10');
    // Dieselben Knoten: Die Maske ist nicht neu gezeichnet worden.
    expect(stellen(wurzel)[0]).toBe(summe);
    expect(wurzel.querySelector('[data-field="Menge"] .db-form-input')).toBe(menge);
    expect(document.activeElement).toBe(menge);
    expect(menge.value).toBe('4');
    const lent = wurzel.querySelector('[data-field="Lent"] .db-form-input');
    lent.value = '2026-12-25';
    lent.dispatchEvent(new Event('input', { bubbles: true }));
    expect(faellig.textContent).toBe('2027-01-08');
  });

  it('ohne Wert bleibt die Stelle leer und markiert, mit dem Satz «kein Wert» und ohne Hinweis', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Menge: '3', Preis: '2.5' } });
    const daten = datenAus('{{field:Menge}} {{value:menge * preis}} {{value:telefon}}');
    zeichneKoerper(wurzel, daten, { seite, verweise, sprache: 'de' });
    expect(daten.koerper.hints).toEqual([]);
    const [summe, telefon] = stellen(wurzel);
    expect(telefon.textContent).toBe('');
    expect(telefon.classList).toContain('db-form-computed-empty');
    expect(telefon.title).toBe(de['database.form.computedEmpty']);
    // Eine leere Eingabe macht die Stelle leer, eine neue Eingabe füllt sie wieder.
    const menge = wurzel.querySelector('[data-field="Menge"] .db-form-input');
    menge.value = '';
    menge.dispatchEvent(new Event('input', { bubbles: true }));
    expect(summe.textContent).toBe('');
    expect(summe.classList).toContain('db-form-computed-empty');
    menge.value = '2';
    menge.dispatchEvent(new Event('input', { bubbles: true }));
    expect(summe.textContent).toBe('5');
    expect(summe.classList).not.toContain('db-form-computed-empty');
    expect(summe.hasAttribute('title')).toBe(false);
  });

  it('ein ungültiger Ausdruck zeigt eine leere, markierte Stelle; die übrige Maske bleibt bedienbar', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Menge: '3' } });
    const daten = datenAus('{{value:menge *}}\n{{field:Menge}}');
    zeichneInhalt(wurzel, daten, { seite, verweise, sprache: 'de' });
    const hinweis = wurzel.querySelector('.db-form-hint');
    expect(hinweis.dataset.formCode).toBe('formAusdruckUngueltig');
    expect(hinweis.textContent).toContain('Zeile 1');
    expect(hinweis.textContent).toContain('menge *');
    const [stelle] = stellen(wurzel);
    expect(stelle.textContent).toBe('');
    expect(stelle.classList).toContain('db-form-computed-empty');
    expect(stelle.title).toBe(de['database.form.computedInvalid']);
    const menge = wurzel.querySelector('[data-field="Menge"] .db-form-input');
    menge.value = '9';
    menge.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seite.entwurf.Menge).toBe('9');
  });

  it('fuelleWert ersetzt den Inhalt einer Stelle und nimmt die Markierung zurück', () => {
    const knoten = document.createElement('div');
    knoten.className = 'db-form-computed';
    const { segmente } = zerlegeMaskenKoerper('{{value:menge}}', FELDER);
    fuelleWert(knoten, segmente[0], { menge: null });
    expect(knoten.classList).toContain('db-form-computed-empty');
    fuelleWert(knoten, segmente[0], { menge: 12 });
    expect(knoten.textContent).toBe('12');
    expect(knoten.classList).not.toContain('db-form-computed-empty');
    fuelleWert(knoten, segmente[0], { menge: 13 });
    expect(knoten.textContent).toBe('13');
  });
});

// 4T-002185 (Epic 3E-000261, F4 A): Reicht die Seite ihre Navigation herein,
// bekommt der Körper deren Klick-Hörer, und ein Verweis-Feld im Lesen deren
// Klick-Weg; ohne Navigation bleibt beides aus.
describe('zeichneKoerper: Anschluss der Navigation (4T-002185)', () => {
  const VERWEIS = { name: 'Buch', type: 'record', options: { table: 'Bücher' } };
  const ZIELE = {
    status: 'ready',
    tabelle: 'Bücher',
    pfad: 'C:/Bereich/Bücher.md',
    keyEinteilig: false,
    datensaetze: [{ kennung: 'r-00001', anzeige: 'Zauberberg', schluessel: null }],
  };
  const mitVerweis = { optionen: (feld) => (feld.type === 'record' ? { ziele: ZIELE } : {}) };

  function daten() {
    return datenMit({
      fields: [VERWEIS],
      zellen: [{ name: 'Buch', text: 'r-00001', value: 'r-00001', error: null, fehlt: false }],
      koerper: {
        segmente: [
          { art: 'markdown', text: '[[Andere Maske]]' },
          { art: 'feld', name: 'Buch' },
        ],
        hints: [],
      },
    });
  }

  it('Links gehen an den Klick-Hörer, das Verweis-Feld an den Verweis-Weg', () => {
    renderMarkdown.mockImplementationOnce(
      () => '<p><a class="wikilink" href="Andere Maske.md">Andere</a></p>',
    );
    const navigation = { beiLinkKlick: vi.fn(), beiVerweisKlick: vi.fn() };
    const wurzel = document.createElement('div');
    zeichneKoerper(wurzel, daten(), {
      seite: seiteMit(),
      verweise: mitVerweis,
      sprache: 'de',
      navigation,
    });
    wurzel.querySelector('a.wikilink').click();
    expect(navigation.beiLinkKlick).toHaveBeenCalledTimes(1);
    wurzel.querySelector('.db-form-ref-link').click();
    expect(navigation.beiVerweisKlick).toHaveBeenCalledWith({
      tabelle: 'C:/Bereich/Bücher.md',
      tabellenName: 'Bücher',
      kennung: 'r-00001',
      wert: 'r-00001',
    });
  });

  it('ohne Navigation ist das Verweis-Feld keine Schaltfläche', () => {
    const wurzel = document.createElement('div');
    zeichneKoerper(wurzel, daten(), { seite: seiteMit(), verweise: mitVerweis, sprache: 'de' });
    expect(wurzel.querySelector('.db-form-ref-link')).toBe(null);
    expect(wurzel.querySelector('.db-form-value').textContent).toBe('Zauberberg (r-00001)');
  });
});

// --- 4T-002186: bedingte Bereiche und Wert im Satz ---------------------------------------

describe('zeichneKoerper: bedingte Bereiche und Wert im Satz (4T-002186)', () => {
  const FELDER = [
    { name: 'Name', type: 'string' },
    { name: 'Menge', type: 'number' },
    { name: 'Aktiv', type: 'boolean' },
    { name: 'Notiz', type: 'string' },
  ];
  const zellenMit = ({ menge = '12', aktiv = 'x' } = {}) => [
    { name: 'Name', text: 'Anna', value: 'Anna', error: null, fehlt: false },
    { name: 'Menge', text: menge, value: Number(menge), error: null, fehlt: false },
    { name: 'Aktiv', text: aktiv, value: aktiv === 'x', error: null, fehlt: false },
    { name: 'Notiz', text: '', value: null, error: null, fehlt: false },
  ];
  // Der Körper kommt aus der echten Zerlegung, wie im Block zum Wert-Platzhalter.
  const datenAus = (text, stand) => ({
    ...datenMit(),
    fields: FELDER,
    zellen: zellenMit(stand),
    koerper: zerlegeMaskenKoerper(text, FELDER),
  });
  // Ein äußerer Bereich «aktiv» mit «Menge» und ein innerer «menge > 5» mit «Notiz»;
  // «Name» und «Aktiv» stehen außerhalb jedes Bereichs.
  const BEREICHE = [
    '{{field:Name}}',
    '{{field:Aktiv}}',
    '{{when:aktiv}}',
    '{{field:Menge}}',
    '{{when:menge > 5}}',
    '{{field:Notiz}}',
    'Viel.',
    '{{end}}',
    '{{end}}',
  ].join('\n');
  const bereich = (wurzel, bedingung) =>
    wurzel.querySelector(`.db-form-section[data-form-when="${bedingung}"]`);
  const eingabe = (wurzel, name) => wurzel.querySelector(`[data-field="${name}"] .db-form-input`);
  const tippe = (knoten, wert) => {
    knoten.value = wert;
    knoten.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('im Lesen ist ein Bereich mit wahrer Bedingung sichtbar, und seine Kinder liegen in ihm', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit();
    zeichneKoerper(wurzel, datenAus(BEREICHE), { seite, verweise, sprache: 'de' });
    const aussen = bereich(wurzel, 'aktiv');
    const innen = bereich(wurzel, 'menge > 5');
    expect(aussen.tagName).toBe('DIV');
    expect(aussen.hasAttribute('hidden')).toBe(false);
    expect(innen.hasAttribute('hidden')).toBe(false);
    expect(innen.parentNode).toBe(aussen);
    expect(aussen.querySelector('[data-field="Menge"]')).not.toBeNull();
    expect(innen.querySelector('[data-field="Notiz"]')).not.toBeNull();
    expect(innen.textContent).toContain('Viel.');
    // Ein Feld außerhalb jedes Bereichs steht nicht in einem Bereich.
    expect(wurzel.querySelector('[data-field="Name"]').closest('.db-form-section')).toBeNull();
    expect(wurzel.querySelector('[data-field="Aktiv"]').closest('.db-form-section')).toBeNull();
    expect(seite.verborgen).toEqual([]);
  });

  it('im Lesen trägt ein Bereich mit falscher Bedingung das Attribut hidden', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit();
    zeichneKoerper(wurzel, datenAus(BEREICHE, { menge: '3' }), { seite, verweise, sprache: 'de' });
    expect(bereich(wurzel, 'aktiv').hasAttribute('hidden')).toBe(false);
    expect(bereich(wurzel, 'menge > 5').hasAttribute('hidden')).toBe(true);
    expect(seite.verborgen).toEqual(['Notiz']);
  });

  it('ein innerer Bereich ist bei verborgenem äußeren im Dokument, aber unter einem verborgenen Vorfahren', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit();
    zeichneKoerper(wurzel, datenAus(BEREICHE, { aktiv: '' }), { seite, verweise, sprache: 'de' });
    const aussen = bereich(wurzel, 'aktiv');
    const innen = bereich(wurzel, 'menge > 5');
    expect(aussen.hidden).toBe(true);
    // Die eigene Bedingung des inneren ist wahr, sichtbar ist er trotzdem nicht.
    expect(innen.hidden).toBe(false);
    expect(innen.parentNode.closest('.db-form-section[hidden]')).toBe(aussen);
    expect(seite.verborgen).toEqual(['Menge', 'Notiz']);
  });

  it('im Bearbeiten folgen die Bereiche jeder Eingabe ohne Neuzeichnen; Fokus und Entwurf bleiben', () => {
    const wurzel = document.createElement('div');
    document.body.appendChild(wurzel);
    const seite = seiteMit({
      modus: MODUS_BEARBEITEN,
      entwurf: { Name: 'Anna', Menge: '12', Aktiv: 'x', Notiz: '' },
    });
    zeichneKoerper(wurzel, datenAus(BEREICHE), { seite, verweise, sprache: 'de' });
    const aussen = bereich(wurzel, 'aktiv');
    const innen = bereich(wurzel, 'menge > 5');
    const menge = eingabe(wurzel, 'Menge');
    const aufrufe = renderMarkdown.mock.calls.length;
    menge.focus();
    tippe(menge, '3');
    expect(innen.hidden).toBe(true);
    expect(aussen.hidden).toBe(false);
    expect(seite.verborgen).toEqual(['Notiz']);
    // Dieselben Knoten: Die Maske ist nicht neu gezeichnet worden.
    expect(bereich(wurzel, 'menge > 5')).toBe(innen);
    expect(eingabe(wurzel, 'Menge')).toBe(menge);
    expect(document.activeElement).toBe(menge);
    expect(renderMarkdown.mock.calls.length).toBe(aufrufe);
    tippe(menge, '8');
    expect(innen.hidden).toBe(false);
    // Das Abwählen des Wahrheitswerts verbirgt den äußeren Bereich.
    const aktiv = eingabe(wurzel, 'Aktiv');
    expect(aktiv.type).toBe('checkbox');
    aktiv.checked = false;
    aktiv.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seite.entwurf.Aktiv).toBe('');
    expect(aussen.hidden).toBe(true);
    expect(seite.verborgen).toEqual(['Menge', 'Notiz']);
    // Ein Feld im verborgenen Bereich behält Eingabe und Entwurf und nimmt weitere an.
    expect(eingabe(wurzel, 'Menge')).toBe(menge);
    expect(menge.value).toBe('8');
    expect(seite.entwurf.Menge).toBe('8');
    const notiz = eingabe(wurzel, 'Notiz');
    tippe(notiz, 'Vermerk');
    expect(seite.entwurf.Notiz).toBe('Vermerk');
    expect(notiz.value).toBe('Vermerk');
    // Wieder angewählt, erscheint der Bereich mit denselben Knoten.
    aktiv.checked = true;
    aktiv.dispatchEvent(new Event('change', { bubbles: true }));
    expect(aussen.hidden).toBe(false);
    expect(bereich(wurzel, 'aktiv')).toBe(aussen);
    expect(seite.verborgen).toEqual([]);
  });

  it('die Liste der verborgenen Felder nennt ein Feld nur einmal', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit();
    const text = [
      '{{when:aktiv}}',
      '{{field:Notiz}}',
      '{{when:menge > 5}}',
      '{{field:Notiz}}',
      '{{end}}',
      '{{end}}',
    ].join('\n');
    zeichneKoerper(wurzel, datenAus(text, { aktiv: '' }), { seite, verweise, sprache: 'de' });
    expect(wurzel.querySelectorAll('[data-field="Notiz"]').length).toBe(2);
    expect(seite.verborgen).toEqual(['Notiz']);
  });

  it('verborgeneFelder liest die Felder unter einem verborgenen Bereich, ohne Doppelte', () => {
    const koerper = document.createElement('div');
    koerper.innerHTML = [
      '<div class="db-form-field" data-field="Name"></div>',
      '<div class="db-form-section"><div class="db-form-field" data-field="Menge"></div></div>',
      '<div class="db-form-section" hidden>',
      '<div class="db-form-field" data-field="Aktiv"></div>',
      '<div class="db-form-section"><div class="db-form-field" data-field="Notiz"></div>',
      '<div class="db-form-field" data-field="Aktiv"></div></div>',
      '</div>',
    ].join('');
    expect(verborgeneFelder(koerper)).toEqual(['Aktiv', 'Notiz']);
    koerper.querySelector('[hidden]').hidden = false;
    expect(verborgeneFelder(koerper)).toEqual([]);
  });

  it('eine ungültige Bedingung steht mit Zeile im Kopf, ihr Bereich bleibt verborgen, die Maske bedienbar', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Menge: '12', Notiz: '' } });
    const daten = datenAus('{{when:menge +}}\n{{field:Notiz}}\n{{end}}\n{{field:Menge}}');
    zeichneInhalt(wurzel, daten, { seite, verweise, sprache: 'de' });
    const hinweis = wurzel.querySelector('.db-form-hint');
    expect(hinweis.dataset.formCode).toBe('formBedingungUngueltig');
    expect(hinweis.textContent).toBe(
      de['database.hint.formBedingungUngueltig']
        .replace('{zeile}', '1')
        .replace('{name}', 'menge +'),
    );
    const kaputt = bereich(wurzel, 'menge +');
    expect(kaputt.hidden).toBe(true);
    expect(seite.verborgen).toEqual(['Notiz']);
    const menge = eingabe(wurzel, 'Menge');
    tippe(menge, '9');
    expect(seite.entwurf.Menge).toBe('9');
    // Auch nach einer Eingabe bleibt ein Bereich ohne lesbare Bedingung verborgen.
    expect(kaputt.hidden).toBe(true);
  });

  it('ein Wert im Satz steht im gerenderten Absatz zwischen seinen Wörtern und folgt der Eingabe', () => {
    const wurzel = document.createElement('div');
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Menge: '12' } });
    const text = '{{field:Menge}}\nFällig am {{value:menge * 2}} Tage';
    const bloecke = zeichneKoerper(wurzel, datenAus(text), { seite, verweise, sprache: 'de' });
    // Ein Block, ein Aufruf des Renderers; im Text steht die Marke statt des Platzhalters.
    expect(wurzel.querySelectorAll('.db-form-md').length).toBe(1);
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    const [markdown, pfad] = renderMarkdown.mock.calls[0];
    expect(pfad).toBe(TAB);
    expect(markdown).toMatch(/^\nFällig am \d+ Tage$/);
    const absatz = wurzel.querySelector('.db-form-md p');
    const stelle = absatz.querySelector('span.db-form-computed.db-form-computed-inline');
    expect(stelle).not.toBeNull();
    expect(stelle.parentNode).toBe(absatz);
    expect(stelle.dataset.formExpr).toBe('menge * 2');
    expect(stelle.previousSibling.nodeValue.endsWith('Fällig am ')).toBe(true);
    expect(stelle.nextSibling.nodeValue).toBe(' Tage');
    expect(absatz.textContent).toBe('\nFällig am 24 Tage');
    expect(absatz.textContent).not.toMatch(/[]/);
    // Das Dokument des Blocks trägt den Platzhalter in seiner Schreibweise.
    expect(bloecke).toHaveLength(1);
    expect(bloecke[0].text).toBe('\nFällig am {{value:menge * 2}} Tage');
    tippe(eingabe(wurzel, 'Menge'), '5');
    expect(stelle.textContent).toBe('10');
    expect(absatz.textContent).toBe('\nFällig am 10 Tage');
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
  });

  it('ein Wert allein auf seiner Zeile bleibt eine Stelle auf eigener Zeile', () => {
    const wurzel = document.createElement('div');
    zeichneKoerper(wurzel, datenAus('Davor\n{{value:menge * 2}}\nDanach'), {
      seite: seiteMit(),
      verweise,
      sprache: 'de',
    });
    const stelle = wurzel.querySelector('.db-form-computed');
    expect(stelle.tagName).toBe('DIV');
    expect(stelle.classList).not.toContain('db-form-computed-inline');
    expect(stelle.parentNode).toBe(wurzel.querySelector('.db-form-body'));
    expect(stelle.textContent).toBe('24');
    // Ohne Wert im Satz bleibt jedes Text-Segment ein eigener Block.
    expect(wurzel.querySelectorAll('.db-form-md').length).toBe(2);
    expect(renderMarkdown).toHaveBeenCalledTimes(2);
  });

  it('eine leere Stelle im Satz trägt die Markierung und den Satz «kein Wert» bzw. «ungültig»', () => {
    const wurzel = document.createElement('div');
    zeichneKoerper(
      wurzel,
      datenAus('Telefon {{value:telefon}} heute\nFehler {{value:menge *}} hier'),
      { seite: seiteMit(), verweise, sprache: 'de' },
    );
    const [telefon, fehler] = wurzel.querySelectorAll('span.db-form-computed-inline');
    expect(telefon.textContent).toBe('');
    expect(telefon.classList).toContain('db-form-computed-empty');
    expect(telefon.title).toBe(de['database.form.computedEmpty']);
    expect(fehler.classList).toContain('db-form-computed-empty');
    expect(fehler.title).toBe(de['database.form.computedInvalid']);
    expect(wurzel.querySelectorAll('.db-form-md').length).toBe(1);
  });

  it('fehlt die Marke im gerenderten Text, hängt die Stelle am Ende des Blocks', () => {
    renderMarkdown.mockImplementationOnce(() => '<p>Ohne Marke</p>');
    const wurzel = document.createElement('div');
    zeichneKoerper(wurzel, datenAus('Doppelt: {{value:menge * 2}} Stück'), {
      seite: seiteMit(),
      verweise,
      sprache: 'de',
    });
    const block = wurzel.querySelector('.db-form-md');
    const stelle = block.querySelector('.db-form-computed-inline');
    expect(stelle).not.toBeNull();
    expect(block.lastChild).toBe(stelle);
    expect(stelle.textContent).toBe('24');
    expect(block.querySelector('p').textContent).toBe('Ohne Marke');
  });
});

// --- 4T-002252: Werte und Bedingungen über Verweis-Pfade ---------------------------------

describe('zeichneKoerper: Verweis-Pfade über die Naht pfade (4T-002252, Festlegung 4, 5)', () => {
  const FELDER = [
    { name: 'book', type: 'record', options: { table: 'Library' } },
    { name: 'borrower', type: 'string' },
  ];
  const KOERPER = [
    'Titel: {{value:book.title}}',
    '{{value:upper(borrower)}}',
    '{{when:book.onloan}}',
    'Ausgeliehen.',
    '{{end}}',
  ].join('\n');
  const datenAus = (text = KOERPER) => ({
    ...datenMit(),
    fields: FELDER,
    zellen: [
      { name: 'book', text: 'r-00001', value: null, error: null, fehlt: false },
      { name: 'borrower', text: 'Clara', value: 'Clara', error: null, fehlt: false },
    ],
    koerper: zerlegeMaskenKoerper(text, FELDER),
  });
  const stellen = (wurzel) => [...wurzel.querySelectorAll('.db-form-computed')];
  const bereich = (wurzel) => wurzel.querySelector('.db-form-section');
  // Eine Naht, die jede Anforderung festhält und auf Zuruf beantwortet.
  const naht = () => {
    const anforderungen = [];
    return { anforderungen, anfordern: (a) => anforderungen.push(a) };
  };

  it('ohne Naht bleiben Pfad-Stellen leer und markiert, Pfad-Bereiche verborgen; lokale rechnen', () => {
    const wurzel = document.createElement('div');
    zeichneKoerper(wurzel, datenAus(), { seite: seiteMit(), verweise, sprache: 'de' });
    const [titel, name] = stellen(wurzel);
    expect(titel.textContent).toBe('');
    expect(titel.classList).toContain('db-form-computed-empty');
    expect(titel.title).toBe(de['database.form.computedEmpty']);
    expect(name.textContent).toBe('CLARA');
    expect(bereich(wurzel).hidden).toBe(true);
  });

  it('mit Naht geht EINE Anforderung für alle Pfad-Stellen; die Antwort setzt Wert und Bereich', () => {
    const wurzel = document.createElement('div');
    const pfade = naht();
    const seite = seiteMit({ kennung: 'r-00001', neu: false });
    zeichneKoerper(wurzel, datenAus(), { seite, verweise, sprache: 'de', pfade });
    expect(pfade.anforderungen.length).toBe(1);
    const [anforderung] = pfade.anforderungen;
    expect(anforderung.tabellenPfad).toBe(TAB);
    expect(anforderung.kennung).toBe('r-00001');
    // Im Lesen ist der Entwurf der gelesene Stand.
    expect(anforderung.entwurf).toEqual({ book: 'r-00001', borrower: 'Clara' });
    expect(anforderung.stellen).toEqual([{ quelle: 'book.title' }, { quelle: 'book.onloan' }]);
    anforderung.uebernehmen([
      { id: '0', wert: 'Zauberberg', erfuellt: true, unbekannt: null },
      { id: '1', wert: true, erfuellt: true, unbekannt: null },
    ]);
    const [titel] = stellen(wurzel);
    expect(titel.textContent).toBe('Zauberberg');
    expect(titel.classList).not.toContain('db-form-computed-empty');
    expect(bereich(wurzel).hidden).toBe(false);
    // Ein leerer Verweis: die Stelle leer und markiert, der Bereich verborgen.
    anforderung.uebernehmen([
      { id: '0', wert: null, erfuellt: false, unbekannt: null },
      { id: '1', wert: null, erfuellt: false, unbekannt: null },
    ]);
    expect(titel.textContent).toBe('');
    expect(titel.classList).toContain('db-form-computed-empty');
    expect(bereich(wurzel).hidden).toBe(true);
    expect(wurzel.querySelector('.db-form-hint')).toBeNull();
  });

  it('im Bearbeiten fragt jede Eingabe mit dem Entwurf neu; die Neuanlage ohne Kennung', () => {
    const wurzel = document.createElement('div');
    const pfade = naht();
    const seite = seiteMit({
      modus: MODUS_BEARBEITEN,
      kennung: 'r-00009',
      neu: true,
      entwurf: { book: 'r-00001', borrower: 'Clara' },
    });
    const daten = datenAus(`${KOERPER}
{{field:borrower}}`);
    zeichneKoerper(wurzel, daten, { seite, verweise, sprache: 'de', pfade });
    const eingabe = wurzel.querySelector('[data-field="borrower"] .db-form-input');
    eingabe.value = 'Mia';
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));
    expect(pfade.anforderungen.length).toBe(2);
    expect(pfade.anforderungen[1].kennung).toBeNull();
    expect(pfade.anforderungen[1].entwurf.borrower).toBe('Mia');
    // Die lokale Stelle folgte sofort.
    expect(stellen(wurzel)[1].textContent).toBe('MIA');
  });

  it('ein unbekanntes Ziel-Feld kommt einmal je Pfad mit Zeile als Hinweis über den Körper', () => {
    const wurzel = document.createElement('div');
    const pfade = naht();
    const daten = { ...datenAus(), koerper: { ...datenAus().koerper, zeilenVersatz: 4 } };
    zeichneInhalt(wurzel, daten, { seite: seiteMit(), verweise, sprache: 'de', pfade });
    const antwort = [{ id: '0', wert: null, erfuellt: false, unbekannt: 'book.title' }];
    pfade.anforderungen[0].uebernehmen(antwort);
    pfade.anforderungen[0].uebernehmen(antwort);
    const hinweise = wurzel.querySelectorAll('.db-form-hint[data-form-code="formPfadUnbekannt"]');
    expect(hinweise.length).toBe(1);
    expect(hinweise[0].textContent).toContain('Zeile 5');
    expect(hinweise[0].textContent).toContain('book.title');
    // Der Block steht vor dem Körper.
    const block = wurzel.querySelector('.db-form-hints');
    expect(block.nextElementSibling).toBe(wurzel.querySelector('.db-form-body'));
  });
});

describe('erzeugePfadAuswertung: gebündelt und nur die jüngste Antwort (4T-002252, Festlegung 4)', () => {
  it('bündelt schnelle Anforderungen zu einem Aufruf und verwirft eine überholte Antwort', async () => {
    const { erzeugePfadAuswertung } =
      await import('../../src/renderer/modules/database/masken-pfade.js');
    vi.useFakeTimers();
    try {
      const antworten = [];
      const kanal = vi.fn(
        (p) =>
          new Promise((resolve) => {
            antworten.push(() =>
              resolve({ status: 'ready', werte: [{ id: '0', wert: p.kennung }] }),
            );
          }),
      );
      const pfade = erzeugePfadAuswertung({ kanal });
      const uebernommen = [];
      const anforderung = (kennung) => ({
        tabellenPfad: TAB,
        kennung,
        entwurf: { book: kennung },
        stellen: [{ quelle: 'book.title' }],
        uebernehmen: (werte) => uebernommen.push(werte[0].wert),
      });
      pfade.anfordern(anforderung('a'));
      pfade.anfordern(anforderung('b'));
      await vi.advanceTimersByTimeAsync(150);
      expect(kanal).toHaveBeenCalledTimes(1);
      expect(kanal.mock.calls[0][0]).toEqual({
        tabelle: TAB,
        kennung: 'b',
        entwurf: { book: 'b' },
        ausdruecke: [{ id: '0', quelle: 'book.title' }],
      });
      // Eine neue Anforderung vor der Antwort macht die alte Antwort ungültig.
      pfade.anfordern(anforderung('c'));
      antworten[0]();
      await vi.advanceTimersByTimeAsync(150);
      antworten[1]();
      await vi.advanceTimersByTimeAsync(0);
      expect(uebernommen).toEqual(['c']);
    } finally {
      vi.useRealTimers();
    }
  });
});

// 4T-002253 (Epic 3E-000262, S6): Der Container des Positions-Bereichs.
describe('Positions-Bereich im Körper (4T-002253)', () => {
  const daten = () =>
    datenMit({
      koerper: {
        segmente: [{ art: 'liste', datei: 'Ausleihen', by: null, zeile: 2 }],
        hints: [],
        zeilenVersatz: 4,
      },
    });

  it('zeichnet einen Container mit der Datei; ohne Naht bleibt er leer', () => {
    const wurzel = document.createElement('div');
    zeichneKoerper(wurzel, daten(), { seite: seiteMit(), verweise, sprache: 'de' });
    const knoten = wurzel.querySelector('.db-form-body > .db-form-positions');
    expect(knoten.dataset.formList).toBe('Ausleihen');
    expect(knoten.childNodes).toHaveLength(0);
  });

  it('reicht Segment mit Zeile ab Datei-Anfang, Seite und Modus an die Naht', () => {
    const wurzel = document.createElement('div');
    const positionen = { zeichneBereich: vi.fn() };
    const seite = seiteMit({ modus: MODUS_BEARBEITEN, entwurf: { Name: 'Clara' } });
    zeichneKoerper(wurzel, daten(), { seite, verweise, sprache: 'de', positionen });
    const [knoten, segment, lage] = positionen.zeichneBereich.mock.calls[0];
    expect(knoten.classList.contains('db-form-positions')).toBe(true);
    expect(segment).toEqual({ art: 'liste', datei: 'Ausleihen', by: null, zeile: 6 });
    expect(lage).toEqual({ seite, modus: MODUS_BEARBEITEN });
  });
});
