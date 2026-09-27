// @vitest-environment jsdom
// 4T-001941 (Epic 3E-000257, Bauplan B2 bis B5; AK1 bis AK5): Die Sperre in der
// Einzel-Maske — der Konflikt-Block mit Halter-Angaben, mit «Halter unbekannt»
// und mit eigenem Fenster, und der Sperr-Ablauf auf dem Zustands-Objekt der
// Seite: nehmen, brechen, freigeben und die Freigabe nach dem Auftrag.
//
// **Gemessen wird ohne Fenster-Zustand** (Muster `db-masken-speichern.test.js`):
// Das Modul nimmt Kanal, Zeichnen und Zeit-Formatierung als Nähte. Die Seite um
// es herum prüft der Ablauf-Fall DB-MAS-04 an der laufenden Anwendung; dass sie
// an jedem Übergang freigibt, hält der letzte Block am Quelltext der Seite fest.
//
// **Der deutsche Katalog wird geladen**, weil die Sätze mit ihren Einsetzungen
// geprüft werden und nicht die Schlüssel-Namen.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import de from '../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const {
  ZWECK_BEARBEITEN,
  ZWECK_LOESCHEN,
  baueKonfliktBlock,
  erzeugeSperrAblauf,
  fristText,
  konfliktArt,
} = await import('../../src/renderer/modules/database/masken-sperre.js');

// Bestands-Lesung im Modulkopf (test/README): der Quelltext der Seite.
const SEITE_QUELLTEXT = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'src/renderer/modules/database/masken-seite.js',
  ),
  'utf8',
);

const t = i18n.t;
const hat = (key) => Object.prototype.hasOwnProperty.call(de, key);
const FRIST = 4 * 60 * 60 * 1000;
const TAB = 'C:/Bereich/Kunden.md';
const zeitpunkt = (iso) => `ZP(${iso})`;

function konflikt(zusatz = {}) {
  return {
    benutzer: 'bert',
    rechner: 'SC-099',
    zeitpunkt: '2026-09-25T08:00:00Z',
    halterUnbekannt: false,
    eigenerProzess: false,
    abgelaufen: false,
    wege: ['lesen'],
    stand: 's-fremd',
    ...zusatz,
  };
}

function antwortMit(k) {
  return { status: 'ready', gehalten: false, konflikt: k, stand: k.stand, fristMs: FRIST };
}

function block(antwort, zusatz = {}) {
  const lesen = vi.fn();
  const brechen = vi.fn();
  const el = baueKonfliktBlock({ antwort, t, hat, zeitpunkt, lesen, brechen, ...zusatz });
  return { el, lesen, brechen, text: el.querySelector('.db-form-lock-text').textContent };
}

// --- Der Konflikt-Block (B3, B4) ---------------------------------------------------------

describe('Der Konflikt-Block (B3, B4)', () => {
  it('nennt Benutzer, Rechner und Zeitpunkt und bietet vor der Frist nur «Nur lesen»', () => {
    const { el, lesen, text } = block(antwortMit(konflikt()));
    expect(el.classList.contains('db-form-lock')).toBe(true);
    expect(el.dataset.lockKind).toBe('fremd');
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.db-form-lock-title').textContent).toBe(de['database.sperre.title']);
    expect(text).toBe(
      de['database.sperre.belegt']
        .replace('{benutzer}', 'bert')
        .replace('{rechner}', 'SC-099')
        .replace('{zeitpunkt}', 'ZP(2026-09-25T08:00:00Z)'),
    );
    expect(el.querySelectorAll('button')).toHaveLength(1);
    expect(el.querySelector('.db-form-lock-read').textContent).toBe(de['database.sperre.lesen']);
    expect(el.querySelector('.db-form-lock-break')).toBeNull();
    expect(el.querySelector('.db-form-lock-expired')).toBeNull();
    el.querySelector('.db-form-lock-read').click();
    expect(lesen).toHaveBeenCalledTimes(1);
  });

  it('bietet «Sperre brechen» nur, wenn die Verwaltung den Weg anbietet, und erklärt ihn', () => {
    const { el, brechen } = block(
      antwortMit(konflikt({ abgelaufen: true, wege: ['lesen', 'brechen'] })),
    );
    const knopf = el.querySelector('.db-form-lock-break');
    expect(knopf.textContent).toBe(de['database.sperre.brechen']);
    expect(el.querySelector('.db-form-lock-expired').textContent).toBe(
      de['database.sperre.abgelaufen'].replace('{frist}', '4 Stunden'),
    );
    knopf.click();
    expect(brechen).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei «Halter unbekannt» den eigenen Wortlaut mit der Frist und ohne Halter-Angaben', () => {
    const unbekannt = konflikt({
      benutzer: null,
      rechner: null,
      zeitpunkt: null,
      halterUnbekannt: true,
    });
    const { el, text } = block(antwortMit(unbekannt));
    expect(el.dataset.lockKind).toBe('unbekannt');
    expect(text).toBe(de['database.sperre.halterUnbekannt'].replace('{frist}', '4 Stunden'));
    expect(text).not.toMatch(/\{[a-z]+\}/);
    expect(el.querySelector('.db-form-lock-break')).toBeNull();
    // Nach der Frist steht der Bruch auch hier; der Satz nennt die Frist bereits.
    const alt = block(antwortMit({ ...unbekannt, abgelaufen: true, wege: ['lesen', 'brechen'] }));
    expect(alt.el.querySelector('.db-form-lock-break')).not.toBeNull();
    expect(alt.el.querySelector('.db-form-lock-expired')).toBeNull();
  });

  it('zeigt beim eigenen Fenster den eigenen Satz mit dem einen Weg «Nur lesen»', () => {
    const { el, text } = block(antwortMit(konflikt({ eigenerProzess: true, benutzer: 'anna' })));
    expect(el.dataset.lockKind).toBe('eigenesFenster');
    expect(text).toBe(de['database.sperre.eigenesFenster']);
    expect(el.querySelectorAll('button')).toHaveLength(1);
  });

  it('setzt «unbekannt» für eine fehlende Angabe eines bekannten Halters', () => {
    const { text } = block(antwortMit(konflikt({ benutzer: null, zeitpunkt: null })));
    expect(text).toContain(de['database.sperre.unbekannt']);
    expect(text).toContain('SC-099');
  });

  it('nennt den Grund eines abgewiesenen Bruchs', () => {
    const { el } = block(antwortMit(konflikt()), { grund: 'sperrBruchVorFrist' });
    const zeile = el.querySelector('.db-form-lock-reason');
    expect(zeile.textContent).toBe(de['database.sperre.bruch.sperrBruchVorFrist']);
    expect(zeile.dataset.lockReason).toBe('sperrBruchVorFrist');
    // Ein Code ohne eigenen Satz erscheint nicht als Schlüssel-Name.
    const ohne = block(antwortMit(konflikt()), { grund: 'sperrAnlegenFehlgeschlagen' });
    expect(ohne.el.querySelector('.db-form-lock-reason')).toBeNull();
  });

  it('hat für alle fünf Bruch-Gründe der Verwaltung einen Satz', () => {
    for (const code of [
      'sperrBruchVorFrist',
      'sperrBruchEigenerProzess',
      'sperrBruchStandAbweichend',
      'sperrBruchOhneStand',
      'sperrBruchInArbeit',
    ]) {
      expect(hat(`database.sperre.bruch.${code}`), code).toBe(true);
    }
  });

  it('zeigt einen Fehlschlag ohne Konflikt-Auskunft mit dem einen Weg', () => {
    const fehler = block({ status: 'error', code: 'sperrAnlegenFehlgeschlagen' });
    expect(fehler.el.dataset.lockKind).toBe('fehler');
    expect(fehler.text).toBe(de['database.sperre.fehler']);
    expect(fehler.el.querySelectorAll('button')).toHaveLength(1);
    const zu = block({ status: 'unavailable' });
    expect(zu.text).toBe(de['database.form.noAccess']);
    expect(block(null).el.dataset.lockKind).toBe('fehler');
  });

  it('ordnet die Arten und rechnet die Frist in Stunden', () => {
    expect(konfliktArt(antwortMit(konflikt()))).toBe('fremd');
    expect(konfliktArt({ status: 'ready', gehalten: true, konflikt: null })).toBe('fehler');
    expect(fristText(FRIST, t)).toBe('4 Stunden');
    expect(fristText(undefined, t)).toBe('? Stunden');
  });
});

// --- Der Sperr-Ablauf (B2 bis B4) --------------------------------------------------------

function aufbau({ antworten = [], neu = false } = {}) {
  const seite = { tabellenPfad: TAB, kennung: 'r-00001', neu, sperre: null, sperrKonflikt: null };
  const liste = [...antworten];
  const sende = vi.fn(async () => (liste.length > 0 ? liste.shift() : { status: 'ready' }));
  const weiter = { bearbeiten: vi.fn(), loeschen: vi.fn() };
  const zeichne = vi.fn();
  const hinweis = vi.fn();
  let schluessel = 'a';
  const ablauf = erzeugeSperrAblauf({
    seite,
    sende,
    t,
    hat,
    zeitpunkt,
    schluessel: () => schluessel,
    zeichne,
    hinweis,
    weiter,
  });
  return {
    seite,
    sende,
    weiter,
    zeichne,
    hinweis,
    ablauf,
    wechsle: (neuerSchluessel) => {
      schluessel = neuerSchluessel;
    },
  };
}

const GEHALTEN = {
  status: 'ready',
  gehalten: true,
  uebernommen: false,
  konflikt: null,
  stand: 's-eigen',
};

describe('Der Sperr-Ablauf (B2 bis B4)', () => {
  it('Bearbeiten nimmt die Sperre, merkt sich den Stand und fährt fort', async () => {
    const a = aufbau({ antworten: [GEHALTEN] });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    expect(a.sende).toHaveBeenCalledWith({ aktion: 'nehmen', tabelle: TAB, kennung: 'r-00001' });
    expect(a.seite.sperre).toEqual({ tabellenPfad: TAB, kennung: 'r-00001', stand: 's-eigen' });
    expect(a.weiter.bearbeiten).toHaveBeenCalledTimes(1);
    expect(a.weiter.loeschen).not.toHaveBeenCalled();
  });

  it('der Beginn des Löschens nimmt die Sperre vor der Rückfrage', async () => {
    const a = aufbau({ antworten: [GEHALTEN] });
    await a.ablauf.nehmen(ZWECK_LOESCHEN);
    expect(a.sende).toHaveBeenCalledTimes(1);
    expect(a.weiter.loeschen).toHaveBeenCalledTimes(1);
  });

  it('der Absturz-Rest wird ohne Dialog übernommen', async () => {
    const a = aufbau({ antworten: [{ ...GEHALTEN, uebernommen: true }] });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    expect(a.seite.sperrKonflikt).toBeNull();
    expect(a.weiter.bearbeiten).toHaveBeenCalledTimes(1);
  });

  it('eine Neuanlage nimmt keine Sperre', async () => {
    const a = aufbau({ neu: true });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    expect(a.sende).not.toHaveBeenCalled();
    expect(a.seite.sperre).toBeNull();
    expect(a.weiter.bearbeiten).toHaveBeenCalledTimes(1);
  });

  it('im Konflikt bleibt die Seite im Lesen und zeigt den Block; «Nur lesen» schließt ihn', async () => {
    const a = aufbau({ antworten: [antwortMit(konflikt())] });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    expect(a.weiter.bearbeiten).not.toHaveBeenCalled();
    expect(a.seite.sperre).toBeNull();
    expect(a.zeichne).toHaveBeenCalled();
    const wurzel = document.createElement('div');
    a.ablauf.zeichneKonflikt(wurzel);
    expect(wurzel.querySelector('.db-form-lock')).not.toBeNull();
    wurzel.querySelector('.db-form-lock-read').click();
    expect(a.seite.sperrKonflikt).toBeNull();
    const leer = document.createElement('div');
    a.ablauf.zeichneKonflikt(leer);
    expect(leer.children).toHaveLength(0);
  });

  it('«Sperre brechen» schickt den Stand des Konflikts und wechselt bei Erfolg in den Zweck', async () => {
    const angeboten = antwortMit(konflikt({ abgelaufen: true, wege: ['lesen', 'brechen'] }));
    const a = aufbau({ antworten: [angeboten, { ...GEHALTEN, gebrochen: true }] });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    await a.ablauf.brechen();
    expect(a.sende).toHaveBeenLastCalledWith({
      aktion: 'brechen',
      tabelle: TAB,
      kennung: 'r-00001',
      stand: 's-fremd',
    });
    expect(a.seite.sperrKonflikt).toBeNull();
    expect(a.seite.sperre).toMatchObject({ stand: 's-eigen' });
    expect(a.weiter.bearbeiten).toHaveBeenCalledTimes(1);
  });

  it('ein abgewiesener Bruch zeigt den Grund und die frische Auskunft', async () => {
    const angeboten = antwortMit(konflikt({ abgelaufen: true, wege: ['lesen', 'brechen'] }));
    const frisch = {
      ...antwortMit(konflikt({ benutzer: 'carla', stand: 's-neu' })),
      grund: 'sperrBruchStandAbweichend',
    };
    const a = aufbau({ antworten: [angeboten, frisch] });
    await a.ablauf.nehmen(ZWECK_LOESCHEN);
    await a.ablauf.brechen();
    expect(a.weiter.loeschen).not.toHaveBeenCalled();
    expect(a.seite.sperrKonflikt).toMatchObject({
      zweck: ZWECK_LOESCHEN,
      grund: 'sperrBruchStandAbweichend',
    });
    const wurzel = document.createElement('div');
    a.ablauf.zeichneKonflikt(wurzel);
    expect(wurzel.querySelector('.db-form-lock-text').textContent).toContain('carla');
    expect(wurzel.querySelector('.db-form-lock-reason').textContent).toBe(
      de['database.sperre.bruch.sperrBruchStandAbweichend'],
    );
  });

  it('Verwerfen und Schließen geben frei, und ein zweites Freigeben ist folgenlos', async () => {
    const a = aufbau({ antworten: [GEHALTEN] });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    await a.ablauf.freigeben();
    expect(a.sende).toHaveBeenLastCalledWith({
      aktion: 'freigeben',
      tabelle: TAB,
      kennung: 'r-00001',
    });
    expect(a.seite.sperre).toBeNull();
    await a.ablauf.freigeben();
    expect(a.sende).toHaveBeenCalledTimes(2);
    expect(a.hinweis).not.toHaveBeenCalled();
  });

  it('eine während des Nehmens verlassene Anzeige gibt die eben genommene Sperre zurück', async () => {
    const a = aufbau();
    let loese;
    a.sende.mockImplementationOnce(
      () =>
        new Promise((r) => {
          loese = r;
        }),
    );
    const laufend = a.ablauf.nehmen(ZWECK_BEARBEITEN);
    a.wechsle('b');
    loese(GEHALTEN);
    await laufend;
    await Promise.resolve();
    expect(a.weiter.bearbeiten).not.toHaveBeenCalled();
    expect(a.seite.sperre).toBeNull();
    expect(a.sende).toHaveBeenLastCalledWith({
      aktion: 'freigeben',
      tabelle: TAB,
      kennung: 'r-00001',
    });
  });

  it('ein zweiter Klick während des Nehmens schickt nichts', async () => {
    const a = aufbau({ antworten: [GEHALTEN] });
    const erster = a.ablauf.nehmen(ZWECK_BEARBEITEN);
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    await erster;
    expect(a.sende).toHaveBeenCalledTimes(1);
    expect(a.weiter.bearbeiten).toHaveBeenCalledTimes(1);
  });
});

describe('Die Freigabe nach dem Auftrag (B2)', () => {
  const aendern = { anweisungen: [{ tabelle: TAB, art: 'update', id: 'r-00001' }] };
  const loeschen = { anweisungen: [{ tabelle: TAB, art: 'delete', id: 'r-00001' }] };

  async function gehalten(antworten = []) {
    const a = aufbau({ antworten: [GEHALTEN, ...antworten] });
    await a.ablauf.nehmen(ZWECK_BEARBEITEN);
    return a;
  }

  it('ein gelungenes Speichern gibt frei; ein Verlust der Sperre erscheint als Hinweis', async () => {
    const a = await gehalten([{ status: 'ready', freigegeben: false, verloren: true }]);
    const senden = vi.fn(async () => ({ ok: true }));
    expect(await a.ablauf.sendeAuftrag(aendern, senden)).toEqual({ ok: true });
    expect(senden).toHaveBeenCalledWith(aendern);
    expect(a.sende).toHaveBeenLastCalledWith({
      aktion: 'freigeben',
      tabelle: TAB,
      kennung: 'r-00001',
    });
    expect(a.hinweis).toHaveBeenCalledWith('database.sperre.verloren');
  });

  it('ein abgewiesenes Speichern behält die Sperre, die Bearbeitung läuft weiter', async () => {
    const a = await gehalten();
    await a.ablauf.sendeAuftrag(aendern, async () => ({ ok: false, lagen: [] }));
    expect(a.sende).toHaveBeenCalledTimes(1);
    expect(a.seite.sperre).not.toBeNull();
  });

  it('ein abgewiesenes oder geworfenes Löschen gibt frei, weil die Maske im Lesen bleibt', async () => {
    const a = await gehalten();
    const ergebnis = await a.ablauf.sendeAuftrag(loeschen, async () => {
      throw new Error('Kanal');
    });
    expect(ergebnis).toBeNull();
    expect(a.seite.sperre).toBeNull();
    expect(a.sende).toHaveBeenCalledTimes(2);
    expect(a.hinweis).not.toHaveBeenCalled();
  });

  it('ein Auftrag an einen anderen Datensatz lässt die Sperre stehen', async () => {
    const a = await gehalten();
    const fremd = { anweisungen: [{ tabelle: TAB, art: 'update', id: 'r-00002' }] };
    await a.ablauf.nachAuftrag(fremd, { ok: true });
    expect(a.seite.sperre).not.toBeNull();
    expect(a.sende).toHaveBeenCalledTimes(1);
  });
});

// --- Die Übergänge der Seite (B2) --------------------------------------------------------

// Der Rumpf einer Funktion der Seite, vom Kopf bis zur schließenden Klammer am
// Zeilenanfang.
function rumpf(kopf) {
  const start = SEITE_QUELLTEXT.indexOf(kopf);
  expect(start, kopf).toBeGreaterThanOrEqual(0);
  const ende = SEITE_QUELLTEXT.indexOf('\n}', start);
  return SEITE_QUELLTEXT.slice(start, ende);
}

describe('Die Seite gibt an jedem Übergang frei (B2)', () => {
  it('Verwerfen, Neu laden und Umbinden geben die Sperre frei', () => {
    expect(rumpf('function verwerfen()')).toContain('sperrAblauf.freigeben()');
    expect(rumpf('function neuLaden()')).toContain('sperrAblauf.freigeben()');
    expect(rumpf('function binde(')).toContain('sperrAblauf.freigeben()');
  });

  it('das Schließen des Reiters und das Ende des Fensters geben frei', () => {
    const schliessen = SEITE_QUELLTEXT.slice(SEITE_QUELLTEXT.indexOf('  onClose() {'));
    expect(schliessen.slice(0, schliessen.indexOf('\n  },'))).toContain('sperrAblauf.freigeben()');
    const fenster = SEITE_QUELLTEXT.slice(
      SEITE_QUELLTEXT.indexOf("addEventListener('beforeunload'"),
    );
    expect(fenster.slice(0, fenster.indexOf('});'))).toContain('sperrAblauf.freigeben()');
  });

  it('Bearbeiten und Löschen nehmen die Sperre, der Auftrag gibt sie über den Ablauf frei', () => {
    expect(rumpf('function bearbeiten()')).toContain('sperrAblauf.nehmen(ZWECK_BEARBEITEN)');
    expect(SEITE_QUELLTEXT).toContain('sperrAblauf.nehmen(ZWECK_LOESCHEN)');
    expect(SEITE_QUELLTEXT).toContain('sperrAblauf.sendeAuftrag(');
    expect(SEITE_QUELLTEXT).toContain('loeschenAbgebrochen: () => void sperrAblauf.freigeben()');
  });
});
