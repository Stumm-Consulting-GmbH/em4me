// @vitest-environment jsdom
// 4T-001939 (Epic 3E-000257, Bauplan B5 und B10, AK3 und AK4): Die
// Feld-Elemente der Einzel-Maske — Umwandlung zwischen Zell-Text und Eingabe je
// Typ in beide Richtungen, Pflicht- und Befund-Kennzeichnung, lesend und
// bearbeitend.
//
// **Gemessen wird am Feld-Element und nicht an der Seite.** Das Modul
// importiert den Fenster-Zustand nicht (Bauplan B1) und ist damit in jsdom
// allein prüfbar; die Seite um es herum prüft der Ablauf-Fall DB-MAS-01 an der
// laufenden Anwendung.
//
// **Der deutsche Katalog wird geladen** (Muster der Prüfdatei der
// Übersichts-Seite), weil die Meldung am Feld ein Satz sein soll und kein
// Schlüssel-Name.
import { describe, it, expect, vi } from 'vitest';
import de from '../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const {
  baueFeldElement,
  filtereZiele,
  loeseVerweisAuf,
  verweisLage,
  VORSCHLAEGE_MAX,
  eingabeAusZellText,
  zellTextAusEingabe,
  steuerArt,
  befundVon,
  MODUS_LESEN,
  MODUS_BEARBEITEN,
  BEFUND_FEHLT,
} = await import('../../src/renderer/modules/database/masken-felder.js');
const { zellWert } = await import('../../src/shared/database/record-values.js');
const { erzeugeVerweisHilfe } =
  await import('../../src/renderer/modules/database/masken-verweise.js');

// Eine Zelle in der Gestalt der Kanal-Antwort, ausgelegt über dieselbe Funktion
// wie beim Lesen der Datei.
function zelle(feld, text, extra = {}) {
  const { value, error } = zellWert(feld.type || 'string', text);
  return { name: feld.name, text, value, error, fehlt: false, ...extra };
}

function steuerIn(element) {
  return element.querySelector('.db-form-input');
}

// Hin und zurück: der Zell-Text geht in das Steuerelement und kommt als
// derselbe Zell-Text wieder heraus.
function rundreise(feld, text) {
  const element = baueFeldElement({ feld, zelle: zelle(feld, text), modus: MODUS_BEARBEITEN });
  return zellTextAusEingabe(feld, element);
}

describe('Umwandlung Zell-Text und Eingabe je Typ (Bauplan B5)', () => {
  it('string: einzeilige Text-Eingabe, Leerraum bleibt erhalten', () => {
    const feld = { name: 'Name', type: 'string' };
    expect(steuerArt(feld, 'Anna')).toBe('text');
    expect(eingabeAusZellText(feld, ' Anna ')).toBe(' Anna ');
    expect(rundreise(feld, ' Anna ')).toBe(' Anna ');
  });

  it('multiline: Textbereich, Zeilenumbrüche kommen als \\n zurück', () => {
    const feld = { name: 'Notiz', type: 'multiline' };
    const element = baueFeldElement({
      feld,
      zelle: zelle(feld, 'a\nb'),
      modus: MODUS_BEARBEITEN,
    });
    expect(steuerIn(element).tagName).toBe('TEXTAREA');
    steuerIn(element).value = 'eins\r\nzwei';
    expect(zellTextAusEingabe(feld, element)).toBe('eins\nzwei');
  });

  it('number: Zahlen-Eingabe mit step any und Punkt-Dezimal', () => {
    const feld = { name: 'Menge', type: 'number', options: { decimals: 2 } };
    const element = baueFeldElement({ feld, zelle: zelle(feld, '12.5'), modus: MODUS_BEARBEITEN });
    const steuer = steuerIn(element);
    expect(steuer.type).toBe('number');
    expect(steuer.step).toBe('any');
    expect(steuer.dataset.decimals).toBe('2');
    expect(steuer.value).toBe('12.5');
    expect(zellTextAusEingabe(feld, element)).toBe('12.5');
    expect(eingabeAusZellText(feld, ' 3 ')).toBe('3');
  });

  it('boolean: Haken, Zell-Text x oder leer', () => {
    const feld = { name: 'Erledigt', type: 'boolean' };
    expect(steuerArt(feld, 'x')).toBe('checkbox');
    expect(eingabeAusZellText(feld, 'x')).toBe(true);
    expect(eingabeAusZellText(feld, 'X')).toBe(true);
    expect(eingabeAusZellText(feld, '')).toBe(false);
    const element = baueFeldElement({ feld, zelle: zelle(feld, ''), modus: MODUS_BEARBEITEN });
    const steuer = steuerIn(element);
    expect(steuer.type).toBe('checkbox');
    expect(zellTextAusEingabe(feld, element)).toBe('');
    steuer.checked = true;
    expect(zellTextAusEingabe(feld, element)).toBe('x');
  });

  it('date: Datums-Eingabe in der Form JJJJ-MM-TT', () => {
    const feld = { name: 'Termin', type: 'date' };
    const element = baueFeldElement({
      feld,
      zelle: zelle(feld, '2026-09-25'),
      modus: MODUS_BEARBEITEN,
    });
    expect(steuerIn(element).type).toBe('date');
    expect(steuerIn(element).value).toBe('2026-09-25');
    expect(zellTextAusEingabe(feld, element)).toBe('2026-09-25');
  });

  it('time: Uhrzeit-Eingabe, mit Sekunden-Schritt nur bei Sekunden im Text', () => {
    const feld = { name: 'Beginn', type: 'time' };
    const kurz = baueFeldElement({ feld, zelle: zelle(feld, '08:30'), modus: MODUS_BEARBEITEN });
    expect(steuerIn(kurz).type).toBe('time');
    expect(zellTextAusEingabe(feld, kurz)).toBe('08:30');
    const lang = baueFeldElement({
      feld,
      zelle: zelle(feld, '08:30:15'),
      modus: MODUS_BEARBEITEN,
    });
    expect(steuerIn(lang).step).toBe('1');
    expect(zellTextAusEingabe(feld, lang)).toBe('08:30:15');
  });

  it('link und record: Text-Eingabe; record trägt die Naht der Wertehilfe', () => {
    const link = { name: 'Quelle', type: 'link' };
    // 4T-001942: Ein Verweis-Feld ist nur mit Ziel-Tabelle bearbeitbar.
    const verweis = { name: 'Firma', type: 'record', options: { table: 'Firmen' } };
    expect(rundreise(link, '[[Notiz]]')).toBe('[[Notiz]]');
    expect(rundreise(verweis, 'r-00007')).toBe('r-00007');
    const element = baueFeldElement({
      feld: verweis,
      zelle: zelle(verweis, 'r-00007'),
      modus: MODUS_BEARBEITEN,
    });
    expect(steuerIn(element).classList.contains('db-form-record')).toBe(true);
  });

  it('ein Text, der nicht zum Typ passt, bleibt als Text bearbeitbar', () => {
    // Ein Zahlenfeld verwürfe «12,5» still; der Anwender soll sehen und
    // berichtigen, was in der Datei steht.
    const feld = { name: 'Menge', type: 'number' };
    expect(steuerArt(feld, '12,5')).toBe('text');
    const element = baueFeldElement({ feld, zelle: zelle(feld, '12,5'), modus: MODUS_BEARBEITEN });
    expect(steuerIn(element).type).toBe('text');
    expect(zellTextAusEingabe(feld, element)).toBe('12,5');
  });

  it('meldet jede Eingabe als Zell-Text an den Aufrufer', () => {
    const feld = { name: 'Erledigt', type: 'boolean' };
    const gemeldet = [];
    const element = baueFeldElement({
      feld,
      zelle: zelle(feld, ''),
      modus: MODUS_BEARBEITEN,
      beiAenderung: (name, text) => gemeldet.push([name, text]),
    });
    const steuer = steuerIn(element);
    steuer.checked = true;
    steuer.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(gemeldet).toEqual([['Erledigt', 'x']]);
  });
});

describe('Lesend und bearbeitend (Bauplan B5 und B6)', () => {
  it('zeigt lesend den Wert als Text: Haken, Nachkommastellen, Rohtext', () => {
    const haken = { name: 'Erledigt', type: 'boolean' };
    const zahl = { name: 'Menge', type: 'number', options: { decimals: 2 } };
    const text = { name: 'Name', type: 'string' };
    const lesen = (feld, t) =>
      baueFeldElement({ feld, zelle: zelle(feld, t), modus: MODUS_LESEN }).querySelector(
        '.db-form-value',
      ).textContent;
    expect(lesen(haken, 'x')).toBe('✓');
    expect(lesen(haken, '')).toBe('');
    expect(lesen(zahl, '3')).toBe('3.00');
    expect(lesen(text, 'Anna <b>')).toBe('Anna <b>');
  });

  it('hat lesend kein Steuerelement und bearbeitend genau eines', () => {
    const feld = { name: 'Name', type: 'string' };
    const lesend = baueFeldElement({ feld, zelle: zelle(feld, 'A'), modus: MODUS_LESEN });
    expect(lesend.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(lesend.dataset.formMode).toBe('lesen');
    const bearbeitend = baueFeldElement({ feld, zelle: zelle(feld, 'A'), modus: MODUS_BEARBEITEN });
    expect(bearbeitend.querySelectorAll('input, textarea')).toHaveLength(1);
    expect(bearbeitend.dataset.formMode).toBe('bearbeiten');
  });

  it('nimmt bearbeitend den Text des Entwurfs statt des gelesenen', () => {
    const feld = { name: 'Name', type: 'string' };
    const element = baueFeldElement({
      feld,
      zelle: zelle(feld, 'alt'),
      modus: MODUS_BEARBEITEN,
      text: 'neu',
    });
    expect(steuerIn(element).value).toBe('neu');
  });

  it('trägt die Beschriftung in der Sprache des Anwenders als aria-label', () => {
    const feld = { name: 'title', type: 'string', label: { en: 'Title', de: 'Titel' } };
    const element = baueFeldElement({
      feld,
      zelle: zelle(feld, 'Dune'),
      modus: MODUS_BEARBEITEN,
      sprache: 'de',
    });
    expect(element.getAttribute('aria-label')).toBe('Titel');
    expect(steuerIn(element).getAttribute('aria-label')).toBe('Titel');
    expect(element.dataset.field).toBe('title');
    // Ohne Beschriftung fällt sie auf den Feld-Namen zurück.
    const ohne = baueFeldElement({ feld: { name: 'x1' }, zelle: null, modus: MODUS_LESEN });
    expect(ohne.getAttribute('aria-label')).toBe('x1');
  });
});

describe('Pflicht- und Befund-Kennzeichnung (AK4)', () => {
  it('kennzeichnet ein Pflicht-Feld am Element und am Steuerelement', () => {
    const feld = { name: 'Name', type: 'string', required: true };
    const element = baueFeldElement({ feld, zelle: zelle(feld, 'A'), modus: MODUS_BEARBEITEN });
    expect(element.classList.contains('db-form-required')).toBe(true);
    expect(element.querySelector('.db-form-required-mark').textContent).toBe('*');
    expect(steuerIn(element).required).toBe(true);
    expect(steuerIn(element).getAttribute('aria-required')).toBe('true');
    const frei = baueFeldElement({
      feld: { name: 'Name', type: 'string' },
      zelle: null,
      modus: MODUS_LESEN,
    });
    expect(frei.classList.contains('db-form-required')).toBe(false);
  });

  for (const [code, feld, text] of [
    ['invalidNumber', { name: 'Menge', type: 'number' }, '12,5'],
    ['invalidDate', { name: 'Termin', type: 'date' }, '2026-02-31'],
    ['invalidTime', { name: 'Beginn', type: 'time' }, '25:00'],
    ['invalidBoolean', { name: 'Erledigt', type: 'boolean' }, 'ja'],
  ]) {
    it(`markiert eine Zelle mit Typ-Fehler ${code} und behält ihren Rohtext`, () => {
      const z = zelle(feld, text);
      expect(z.error).toBe(code);
      for (const modus of [MODUS_LESEN, MODUS_BEARBEITEN]) {
        const element = baueFeldElement({ feld, zelle: z, modus });
        expect(element.classList.contains('db-form-marked')).toBe(true);
        expect(element.dataset.formErr).toBe(code);
        const sichtbar =
          modus === MODUS_LESEN
            ? element.querySelector('.db-form-value').textContent
            : steuerIn(element).value;
        expect(sichtbar).toBe(text);
        const meldung = element.querySelector('.db-form-message').textContent;
        expect(meldung).toBe(de[`database.form.cellError.${code}`]);
      }
    });
  }

  it('markiert die verletzte Feld-Regel und die leere Pflicht-Zelle', () => {
    const feld = { name: 'plz', type: 'string', required: true };
    for (const code of ['check', 'required']) {
      const element = baueFeldElement({
        feld,
        zelle: zelle(feld, code === 'check' ? '40a' : '', { error: code }),
        modus: MODUS_LESEN,
      });
      expect(element.dataset.formErr).toBe(code);
      expect(element.querySelector('.db-form-message').textContent).toBe(
        de[`database.form.cellError.${code}`],
      );
    }
  });

  it('markiert eine fehlende Zelle als eigenen Befund', () => {
    const feld = { name: 'Ort', type: 'string' };
    const fehlt = { name: 'Ort', text: '', value: '', error: null, fehlt: true };
    expect(befundVon(fehlt)).toBe(BEFUND_FEHLT);
    const element = baueFeldElement({ feld, zelle: fehlt, modus: MODUS_LESEN });
    expect(element.dataset.formErr).toBe('missing');
    expect(element.querySelector('.db-form-message').textContent).toBe(
      de['database.form.cellError.missing'],
    );
  });

  it('nennt einen unbekannten Befund-Code im Rückfall-Satz statt eines Schlüssels', () => {
    const feld = { name: 'Ort', type: 'string' };
    const element = baueFeldElement({
      feld,
      zelle: { name: 'Ort', text: 'x', value: 'x', error: 'zukunftsCode', fehlt: false },
      modus: MODUS_LESEN,
    });
    const meldung = element.querySelector('.db-form-message').textContent;
    expect(meldung).toContain('zukunftsCode');
    expect(meldung).not.toContain('database.form');
  });

  it('lässt eine unauffällige Zelle ohne Markierung und ohne Meldung', () => {
    const feld = { name: 'Name', type: 'string' };
    const element = baueFeldElement({ feld, zelle: zelle(feld, 'A'), modus: MODUS_LESEN });
    expect(element.classList.contains('db-form-marked')).toBe(false);
    expect(element.dataset.formErr).toBeUndefined();
    expect(element.querySelector('.db-form-message').textContent).toBe('');
  });
});

// --- 4T-001942: Wertehilfe der Verweis-Felder (Bauplan B2, AK2 bis AK4) ---------------

// Eine Antwort des Kanals `database:datensaetze` in seiner Gestalt, sortiert
// nach Anzeige-Form wie der Kanal sie liefert.
function zielListe(datensaetze, extra = {}) {
  return {
    status: 'ready',
    tabelle: 'Kunden',
    pfad: '/bereich/Kunden.md',
    display: 'Name',
    keyEinteilig: true,
    datensaetze,
    ...extra,
  };
}

const KUNDEN = zielListe([
  { kennung: 'r-00003', anzeige: 'Alpha GmbH', schluessel: 'ALP' },
  { kennung: 'r-00001', anzeige: 'Anna Muster', schluessel: 'ANNA' },
  { kennung: 'r-00002', anzeige: 'Beat Beispiel', schluessel: 'BEAT' },
]);

const VERWEIS = { name: 'Kunde', type: 'record', options: { table: 'Kunden' } };

// Ein bearbeitendes Verweis-Feld im Dokument, damit Fokus und Tastatur wirken.
function verweisFeld({ ziele = KUNDEN, text = '', gemeldet = [] } = {}) {
  const ladeZiele = vi.fn(async () => ziele);
  const element = baueFeldElement({
    feld: VERWEIS,
    zelle: zelle(VERWEIS, text),
    modus: MODUS_BEARBEITEN,
    ladeZiele,
    beiAenderung: (name, wert) => gemeldet.push([name, wert]),
  });
  document.body.appendChild(element);
  return { element, eingabe: steuerIn(element), ladeZiele, gemeldet };
}

// Wartet, bis die Liste nach dem asynchronen Laden gezeichnet ist.
async function naechsterTakt() {
  await new Promise((r) => setTimeout(r, 0));
}

function eintraege(element) {
  return [...element.querySelectorAll('.db-form-suggest-item')].map((punkt) => [
    punkt.querySelector('.db-form-suggest-display').textContent,
    punkt.querySelector('.db-form-suggest-id').textContent,
  ]);
}

function taste(eingabe, key) {
  eingabe.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('Wertehilfe: Filter und Auflösung (4T-001942, B2)', () => {
  it('filtert ohne Groß-/Kleinschreibung über Anzeige-Form, Schlüssel und Kennung', () => {
    const liste = KUNDEN.datensaetze;
    expect(filtereZiele(liste, '').map((d) => d.kennung)).toEqual([
      'r-00003',
      'r-00001',
      'r-00002',
    ]);
    expect(filtereZiele(liste, 'anna').map((d) => d.kennung)).toEqual(['r-00001']);
    expect(filtereZiele(liste, 'beat').map((d) => d.kennung)).toEqual(['r-00002']);
    expect(filtereZiele(liste, 'alp').map((d) => d.kennung)).toEqual(['r-00003']);
    expect(filtereZiele(liste, 'R-00002').map((d) => d.kennung)).toEqual(['r-00002']);
    expect(filtereZiele(liste, 'xyz')).toEqual([]);
  });

  it('löst Kennung, Kurzform und einteiligen Schlüssel-Wert auf, sonst nichts', () => {
    expect(loeseVerweisAuf('r-00002', KUNDEN).kennung).toBe('r-00002');
    expect(loeseVerweisAuf('r-2', KUNDEN).kennung).toBe('r-00002');
    expect(loeseVerweisAuf('ANNA', KUNDEN).kennung).toBe('r-00001');
    // Der Schlüssel wird zeichengenau verglichen, wie in der Verweis-Regel.
    expect(loeseVerweisAuf('anna', KUNDEN)).toBe(null);
    expect(loeseVerweisAuf('r-00009', KUNDEN)).toBe(null);
    expect(loeseVerweisAuf('', KUNDEN)).toBe(null);
    // Ohne einteiligen Schlüssel trifft ein Schlüssel-Wert nichts.
    expect(loeseVerweisAuf('ANNA', { ...KUNDEN, keyEinteilig: false })).toBe(null);
    // Ein mehrdeutiger Schlüssel-Wert trifft nichts.
    const doppelt = zielListe([
      { kennung: 'r-00001', anzeige: 'A', schluessel: 'X' },
      { kennung: 'r-00002', anzeige: 'B', schluessel: 'X' },
    ]);
    expect(loeseVerweisAuf('X', doppelt)).toBe(null);
  });

  it('kennt die drei Lagen eines Verweis-Feldes', () => {
    expect(verweisLage({ name: 'K', type: 'record' }, KUNDEN)).toBe('ohneZiel');
    expect(verweisLage({ name: 'K', type: 'record', options: { table: ' ' } })).toBe('ohneZiel');
    expect(verweisLage(VERWEIS, { status: 'error', code: 'auftragTabelleUnbekannt' })).toBe(
      'ohneZiel',
    );
    expect(verweisLage(VERWEIS, KUNDEN)).toBe('bereit');
    expect(verweisLage(VERWEIS, undefined)).toBe('offen');
    expect(verweisLage(VERWEIS, { status: 'unavailable' })).toBe('offen');
    expect(verweisLage(VERWEIS, { status: 'error', code: 'auftragLesenFehlgeschlagen' })).toBe(
      'offen',
    );
  });
});

describe('Wertehilfe: Vorschlagsliste im Bearbeiten (4T-001942, B2)', () => {
  it('lädt beim Fokus einmal und zeigt Anzeige-Form und Kennung je Eintrag', async () => {
    const { element, eingabe, ladeZiele } = verweisFeld();
    expect(eingabe.classList.contains('db-form-record')).toBe(true);
    expect(eingabe.getAttribute('role')).toBe('combobox');
    const liste = element.querySelector('.db-form-suggest');
    expect(liste.hidden).toBe(true);
    eingabe.focus();
    await naechsterTakt();
    expect(ladeZiele).toHaveBeenCalledTimes(1);
    expect(ladeZiele).toHaveBeenCalledWith(VERWEIS);
    expect(liste.hidden).toBe(false);
    expect(eingabe.getAttribute('aria-expanded')).toBe('true');
    expect(eintraege(element)).toEqual([
      ['Alpha GmbH', 'r-00003'],
      ['Anna Muster', 'r-00001'],
      ['Beat Beispiel', 'r-00002'],
    ]);
    // Tippen grenzt ein, ohne neu zu laden.
    eingabe.value = 'bei';
    eingabe.dispatchEvent(new window.Event('input', { bubbles: true }));
    await naechsterTakt();
    expect(ladeZiele).toHaveBeenCalledTimes(1);
    expect(eintraege(element)).toEqual([['Beat Beispiel', 'r-00002']]);
    element.remove();
  });

  it('trägt beim Klick die Kennung ein und meldet sie dem Aufrufer', async () => {
    const { element, eingabe, gemeldet } = verweisFeld();
    eingabe.focus();
    await naechsterTakt();
    const punkt = element.querySelector('.db-form-suggest-item[data-kennung="r-00001"]');
    punkt.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    punkt.click();
    expect(eingabe.value).toBe('r-00001');
    expect(zellTextAusEingabe(VERWEIS, element)).toBe('r-00001');
    expect(gemeldet).toEqual([['Kunde', 'r-00001']]);
    expect(element.querySelector('.db-form-suggest').hidden).toBe(true);
    element.remove();
  });

  it('bewegt mit den Pfeiltasten, wählt mit der Eingabetaste und schließt mit Escape', async () => {
    const { element, eingabe, gemeldet } = verweisFeld();
    eingabe.focus();
    await naechsterTakt();
    taste(eingabe, 'ArrowDown');
    taste(eingabe, 'ArrowDown');
    const aktiv = element.querySelector('.db-form-suggest-item.is-active');
    expect(aktiv.dataset.kennung).toBe('r-00001');
    expect(eingabe.getAttribute('aria-activedescendant')).toBe(aktiv.id);
    taste(eingabe, 'ArrowUp');
    taste(eingabe, 'ArrowUp');
    // Oben angekommen, springt die Auswahl ans Ende.
    expect(element.querySelector('.db-form-suggest-item.is-active').dataset.kennung).toBe(
      'r-00002',
    );
    taste(eingabe, 'Enter');
    expect(eingabe.value).toBe('r-00002');
    expect(gemeldet).toEqual([['Kunde', 'r-00002']]);
    // Erneut öffnen und mit Escape schließen: nichts gewählt.
    taste(eingabe, 'ArrowDown');
    await naechsterTakt();
    expect(element.querySelector('.db-form-suggest').hidden).toBe(false);
    taste(eingabe, 'Escape');
    expect(element.querySelector('.db-form-suggest').hidden).toBe(true);
    expect(eingabe.value).toBe('r-00002');
    element.remove();
  });

  it('lässt einen von Hand eingegebenen Wert stehen', async () => {
    const { element, eingabe, gemeldet } = verweisFeld();
    eingabe.focus();
    await naechsterTakt();
    eingabe.value = 'BEAT';
    eingabe.dispatchEvent(new window.Event('input', { bubbles: true }));
    await naechsterTakt();
    eingabe.blur();
    expect(eingabe.value).toBe('BEAT');
    expect(gemeldet).toEqual([['Kunde', 'BEAT']]);
    expect(element.querySelector('.db-form-suggest').hidden).toBe(true);
    element.remove();
  });

  it('zeigt höchstens fünfzig Einträge und den Hinweis auf weitere', async () => {
    const viele = zielListe(
      Array.from({ length: 73 }, (_, i) => ({
        kennung: `r-${String(i + 1).padStart(5, '0')}`,
        anzeige: `Kunde ${i + 1}`,
        schluessel: `K${i + 1}`,
      })),
    );
    const { element, eingabe } = verweisFeld({ ziele: viele });
    eingabe.focus();
    await naechsterTakt();
    expect(element.querySelectorAll('.db-form-suggest-item')).toHaveLength(VORSCHLAEGE_MAX);
    const mehr = element.querySelector('.db-form-suggest-more');
    expect(mehr.textContent).toBe(i18n.t('database.form.refMore').replace('{anzahl}', '23'));
    expect(mehr.textContent).not.toContain('{');
    element.remove();
  });

  it('meldet eine leere Trefferliste mit einem Satz', async () => {
    const { element, eingabe } = verweisFeld();
    eingabe.focus();
    await naechsterTakt();
    eingabe.value = 'gibt es nicht';
    eingabe.dispatchEvent(new window.Event('input', { bubbles: true }));
    await naechsterTakt();
    expect(element.querySelectorAll('.db-form-suggest-item')).toHaveLength(0);
    expect(element.querySelector('.db-form-suggest-empty').textContent).toBe(
      i18n.t('database.form.refEmpty'),
    );
    element.remove();
  });
});

describe('Wertehilfe: lesende Darstellung (4T-001942, B2, AK4)', () => {
  function lesend(text, ziele, feld = VERWEIS) {
    return baueFeldElement({ feld, zelle: zelle(feld, text), modus: MODUS_LESEN, ziele });
  }

  it('zeigt «Anzeige-Form (Kennung)» für Kennung, Kurzform und Schlüssel-Wert', () => {
    for (const text of ['r-00001', 'r-1', 'ANNA']) {
      const wert = lesend(text, KUNDEN).querySelector('.db-form-value');
      expect(wert.textContent, text).toBe('Anna Muster (r-00001)');
      expect(wert.classList.contains('db-form-unresolved')).toBe(false);
    }
    // Ohne Anzeige-Form steht die Kennung allein.
    const ohne = zielListe([{ kennung: 'r-00004', anzeige: '', schluessel: null }], {
      keyEinteilig: false,
      display: null,
    });
    expect(lesend('r-4', ohne).querySelector('.db-form-value').textContent).toBe('r-00004');
  });

  it('kennzeichnet einen nicht auflösbaren Wert und zeigt ihn roh', () => {
    const wert = lesend('Niemand', KUNDEN).querySelector('.db-form-value');
    expect(wert.textContent).toBe('Niemand');
    expect(wert.classList.contains('db-form-unresolved')).toBe(true);
    expect(wert.title).toBe(i18n.t('database.form.refUnresolved'));
    // Ein leerer Verweis ist kein Befund.
    const leer = lesend('', KUNDEN).querySelector('.db-form-value');
    expect(leer.textContent).toBe('');
    expect(leer.classList.contains('db-form-unresolved')).toBe(false);
  });

  it('zeigt ohne vorliegende Liste den Rohtext ungekennzeichnet', () => {
    const wert = lesend('r-00001', undefined).querySelector('.db-form-value');
    expect(wert.textContent).toBe('r-00001');
    expect(wert.classList.contains('db-form-unresolved')).toBe(false);
  });

  it('ist ohne oder mit unbekannter Ziel-Tabelle auch im Bearbeiten lesend, mit Hinweis', () => {
    const ohneTabelle = { name: 'Kunde', type: 'record' };
    const unbekannt = { status: 'error', code: 'auftragTabelleUnbekannt' };
    for (const [feld, ziele] of [
      [ohneTabelle, undefined],
      [VERWEIS, unbekannt],
    ]) {
      for (const modus of [MODUS_LESEN, MODUS_BEARBEITEN]) {
        const element = baueFeldElement({
          feld,
          zelle: zelle(feld, 'r-00001'),
          modus,
          ziele,
          ladeZiele: vi.fn(),
        });
        expect(steuerIn(element)).toBe(null);
        expect(element.querySelector('.db-form-value').textContent).toBe('r-00001');
        expect(element.querySelector('.db-form-ref-hint').textContent).toBe(
          i18n.t('database.form.refNoTable'),
        );
      }
    }
  });
});

describe('Ziel-Listen der Seite (4T-001942, B3)', () => {
  const daten = {
    fields: [
      { name: 'Titel', type: 'string' },
      VERWEIS,
      { name: 'Zweitkunde', type: 'record', options: { table: 'Kunden' } },
      { name: 'Ohne', type: 'record' },
    ],
  };

  it('holt je Ziel-Tabelle einmal und reicht Liste und Lade-Funktion an das Feld', async () => {
    const lade = vi.fn(async () => KUNDEN);
    const hilfe = erzeugeVerweisHilfe(lade);
    await hilfe.aufloesen(daten);
    expect(lade).toHaveBeenCalledTimes(1);
    expect(lade).toHaveBeenCalledWith('Kunden');
    expect(hilfe.optionen({ name: 'Titel', type: 'string' })).toEqual({});
    const optionen = hilfe.optionen(VERWEIS);
    expect(optionen.ziele).toBe(KUNDEN);
    // Die Wertehilfe schöpft aus der gehaltenen Liste, ohne neu zu holen.
    expect(await optionen.ladeZiele(VERWEIS)).toBe(KUNDEN);
    expect(lade).toHaveBeenCalledTimes(1);
    expect(hilfe.optionen(daten.fields[3]).ziele).toBeUndefined();
  });

  it('verwirft die Listen mit jedem Lesen und holt frisch', async () => {
    const lade = vi.fn(async () => KUNDEN);
    const hilfe = erzeugeVerweisHilfe(lade);
    await hilfe.aufloesen(daten);
    await hilfe.aufloesen(daten);
    expect(lade).toHaveBeenCalledTimes(2);
    hilfe.vergiss();
    expect(hilfe.optionen(VERWEIS).ziele).toBeUndefined();
  });

  it('wirft nie: ein gescheiterter Abruf ergibt eine Lage ohne Liste', async () => {
    const hilfe = erzeugeVerweisHilfe(async () => {
      throw new Error('Kanal weg');
    });
    await expect(hilfe.aufloesen(daten)).resolves.toBeUndefined();
    expect(hilfe.optionen(VERWEIS).ziele).toEqual({ status: 'unavailable' });
    expect(verweisLage(VERWEIS, hilfe.optionen(VERWEIS).ziele)).toBe('offen');
  });
});
