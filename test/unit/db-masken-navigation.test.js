// @vitest-environment jsdom
// 4T-002185 (Epic 3E-000261, Entscheidung F4 Option A): Die Navigation zwischen
// Masken — Ziel-Klärung am Katalog, die drei Ziele eines Klicks im Körper und
// eines Verweis-Feldes, der Verlauf und «Zurück». Seit 4T-002335 (Epic
// 3E-000264) dazu Ziel 4, der Datensatz-Verweis im Körper.
//
// **Gemessen wird am Modul und nicht an der Seite** (Muster
// `db-masken-speichern.test.js`): Öffnen, Katalog, Link-Weg und Zeichnen kommen
// als Ersatz herein, das Zustands-Objekt der Seite wird hereingereicht. Den
// echten Link-Weg der Anwendung und die echte Masken-Seite samt Rückfrage bei
// ungespeicherter Bearbeitung prüft `renderer/datensatz-treffer-klick.test.js`,
// die laufende Anwendung der Ablauf-Fall DB-MAS-09.
//
// **Der deutsche Katalog wird geladen**, weil die Meldungen als Sätze geprüft
// werden und nicht als Schlüssel-Namen.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import de from '../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const {
  erzeugeNavigation,
  erzeugeVerlauf,
  klaereZiel,
  VERLAUF_MAX,
  VERLAUF_MERKEN,
  VERLAUF_ZURUECK,
  ZIEL_ANDERE_TABELLE,
  ZIEL_DOKUMENT,
  ZIEL_GLEICHE_TABELLE,
} = await import('../../src/renderer/modules/database/masken-navigation.js');

const LOANS = '/raum/Loans.md';
const LIBRARY = '/raum/Library.md';
const LOANS_FORM = '/raum/Loans Form.md';
const LOANS_KURZ = '/raum/Loans Kurz.md';
const LIBRARY_FORM = '/raum/Library Form.md';

const UEBERBLICK = {
  status: 'ready',
  tabellen: [
    { name: 'Loans', path: LOANS, maske: LOANS_FORM, maskenPfade: [LOANS_FORM, LOANS_KURZ] },
    { name: 'Library', path: LIBRARY, maske: LIBRARY_FORM, maskenPfade: [LIBRARY_FORM] },
    { name: 'Leer', path: '/raum/Leer.md', maske: null, maskenPfade: [] },
  ],
};

function satz(key, werte) {
  return Object.entries(werte).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), i18n.t(key));
}

// Eine Seite, die die Ausleihe r-00007 in ihrer Standard-Maske aus der Datei zeigt.
function neueSeite(extra = {}) {
  return {
    tabellenPfad: LOANS,
    kennung: 'r-00007',
    neu: false,
    maske: null,
    daten: { status: 'ready', koerper: { quelle: 'datei', pfad: LOANS_FORM, segmente: [] } },
    ...extra,
  };
}

let seite;
let oeffne;
let zeichne;
let aktiviereLink;
let ladeUeberblick;
let nav;

beforeEach(() => {
  seite = neueSeite();
  oeffne = vi.fn();
  zeichne = vi.fn();
  aktiviereLink = vi.fn(async () => {});
  ladeUeberblick = vi.fn(async () => UEBERBLICK);
  nav = erzeugeNavigation({ seite, oeffne, ladeUeberblick, aktiviereLink, zeichne });
});

// Ein Körper mit Links, wie ihn `masken-koerper.js` zeichnet, und der
// Klick-Hörer der Navigation daran.
function koerperMit(html) {
  const koerper = document.createElement('div');
  koerper.className = 'db-form-body';
  koerper.innerHTML = html;
  koerper.addEventListener('click', nav.beiLinkKlick);
  document.body.appendChild(koerper);
  return koerper;
}

function klick(el) {
  const ereignis = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ereignis);
  return ereignis;
}

// Klickt einen Link und reicht das aufgelöste Ziel an die Abfang-Funktion, die
// der Link-Weg der Anwendung bekommen hat; liefert deren Antwort.
async function klickeUndLoeseAuf(link, aufgeloest) {
  klick(link);
  expect(aktiviereLink).toHaveBeenCalledTimes(1);
  const optionen = aktiviereLink.mock.calls[0][3];
  return optionen.abfangen(aufgeloest);
}

function meldungIn() {
  const wurzel = document.createElement('div');
  nav.zeichneMeldung(wurzel);
  const p = wurzel.querySelector('.db-form-nav-note');
  return p ? p.textContent : null;
}

describe('Ziel-Klärung am Katalog (klaereZiel)', () => {
  it('erkennt die Masken-Datei derselben Tabelle, einer anderen und ein Dokument', () => {
    expect(klaereZiel(LOANS_KURZ, UEBERBLICK, LOANS)).toEqual({ art: ZIEL_GLEICHE_TABELLE });
    expect(klaereZiel(LIBRARY_FORM, UEBERBLICK, LOANS)).toEqual({
      art: ZIEL_ANDERE_TABELLE,
      tabelle: 'Library',
    });
    expect(klaereZiel('/raum/Notiz.md', UEBERBLICK, LOANS)).toEqual({ art: ZIEL_DOKUMENT });
    // Die Tabellen-Datei selbst ist keine Maske.
    expect(klaereZiel(LIBRARY, UEBERBLICK, LOANS)).toEqual({ art: ZIEL_DOKUMENT });
  });

  it('vergleicht unabhängig vom Trennzeichen des Pfads', () => {
    expect(klaereZiel('\\raum\\Loans Kurz.md', UEBERBLICK, '\\raum\\Loans.md')).toEqual({
      art: ZIEL_GLEICHE_TABELLE,
    });
  });

  it('ohne bereiten Katalog ist jedes Ziel ein Dokument', () => {
    for (const ueberblick of [null, {}, { status: 'unavailable', tabellen: [] }]) {
      expect(klaereZiel(LOANS_KURZ, ueberblick, LOANS)).toEqual({ art: ZIEL_DOKUMENT });
    }
  });
});

describe('Klick auf einen Link im Körper', () => {
  it('Ziel 1: eine andere Maske derselben Tabelle zeigt denselben Datensatz dort', async () => {
    const koerper = koerperMit('<p><a class="wikilink" href="Loans Kurz.md">Kurz</a></p>');
    const ereignis = new MouseEvent('click', { bubbles: true, cancelable: true });
    koerper.querySelector('a').dispatchEvent(ereignis);
    expect(ereignis.defaultPrevented).toBe(true);
    // Der Link-Weg der Anwendung löst gegen die Masken-Datei auf.
    expect(aktiviereLink.mock.calls[0].slice(0, 3)).toEqual(['Loans Kurz.md', true, LOANS_FORM]);
    expect(await aktiviereLink.mock.calls[0][3].abfangen(LOANS_KURZ)).toBe(true);
    expect(oeffne).toHaveBeenCalledWith(LOANS, 'r-00007', {
      neu: false,
      maske: LOANS_KURZ,
      verlauf: VERLAUF_MERKEN,
    });
    koerper.remove();
  });

  it('Ziel 1 bei einer Neuanlage: dieselbe Neuanlage in der anderen Maske', async () => {
    seite.neu = true;
    seite.kennung = 'r-00009';
    const koerper = koerperMit('<a class="wikilink" href="Loans Kurz.md">Kurz</a>');
    await klickeUndLoeseAuf(koerper.querySelector('a'), LOANS_KURZ);
    expect(oeffne).toHaveBeenCalledWith(LOANS, 'r-00009', {
      neu: true,
      maske: LOANS_KURZ,
      verlauf: VERLAUF_MERKEN,
    });
    koerper.remove();
  });

  it('ein Link auf die gezeigte Maske wechselt nichts', async () => {
    const koerper = koerperMit('<a class="wikilink" href="Loans Form.md">hier</a>');
    expect(await klickeUndLoeseAuf(koerper.querySelector('a'), LOANS_FORM)).toBe(true);
    expect(oeffne).not.toHaveBeenCalled();
    koerper.remove();
  });

  it('Ziel 2: die Maske einer anderen Tabelle meldet den fehlenden Datensatz, keine Neuanlage', async () => {
    const koerper = koerperMit('<a class="wikilink" href="Library Form.md">Buch</a>');
    expect(await klickeUndLoeseAuf(koerper.querySelector('a'), LIBRARY_FORM)).toBe(true);
    expect(oeffne).not.toHaveBeenCalled();
    expect(zeichne).toHaveBeenCalled();
    expect(meldungIn()).toBe(
      satz('database.form.nav.otherTable', { form: 'Library Form.md', table: 'Library' }),
    );
    koerper.remove();
  });

  it('jeder andere Link öffnet sein Dokument über den gewöhnlichen Weg', async () => {
    const koerper = koerperMit('<a class="wikilink" href="Notiz.md">Notiz</a>');
    expect(await klickeUndLoeseAuf(koerper.querySelector('a'), '/raum/Notiz.md')).toBe(false);
    expect(oeffne).not.toHaveBeenCalled();
    expect(meldungIn()).toBe(null);
    koerper.remove();
  });

  it('ein nicht erreichbarer Katalog lässt den Link sein Dokument öffnen', async () => {
    ladeUeberblick.mockImplementation(async () => {
      throw new Error('Kanal weg');
    });
    const koerper = koerperMit('<a class="wikilink" href="Loans Kurz.md">Kurz</a>');
    expect(await klickeUndLoeseAuf(koerper.querySelector('a'), LOANS_KURZ)).toBe(false);
    expect(oeffne).not.toHaveBeenCalled();
    koerper.remove();
  });

  it('Markdown-Link, eingebettete Notiz und erzeugte Maske: Wiki-Kennung und Basis', () => {
    seite.daten = { status: 'ready', koerper: { quelle: 'erzeugt', pfad: null, segmente: [] } };
    const koerper = koerperMit(
      '<a href="Notiz.md">md</a>' +
        '<div class="wiki-embed-md-body" data-embed-base="/raum/ab/Eingebettet.md">' +
        '<a class="wikilink" href="Tief.md">tief</a></div>',
    );
    const [md, tief] = koerper.querySelectorAll('a');
    klick(md);
    klick(tief);
    expect(aktiviereLink.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      ['Notiz.md', false, LOANS],
      ['Tief.md', true, '/raum/ab/Eingebettet.md'],
    ]);
    koerper.remove();
  });

  it('ein Anker im selben Dokument bleibt ohne Wirkung, ein Tag-Link geht weiter', () => {
    const koerper = koerperMit('<a href="#abschnitt">A</a><a href="#tag:buch">T</a><span>x</span>');
    const [anker, tag] = koerper.querySelectorAll('a');
    expect(klick(anker).defaultPrevented).toBe(true);
    expect(aktiviereLink).not.toHaveBeenCalled();
    klick(tag);
    expect(aktiviereLink.mock.calls[0][0]).toBe('#tag:buch');
    // Ein Klick neben einen Link wird nicht verbraucht.
    expect(klick(koerper.querySelector('span')).defaultPrevented).toBe(false);
    koerper.remove();
  });
});

describe('Klick auf ein Verweis-Feld (Ziel 3)', () => {
  it('öffnet den verwiesenen Datensatz in der Standard-Maske seiner Tabelle', () => {
    nav.beiVerweisKlick({
      tabelle: LIBRARY,
      tabellenName: 'Library',
      kennung: 'r-00001',
      wert: 'r-1',
    });
    expect(oeffne).toHaveBeenCalledWith(LIBRARY, 'r-00001', { verlauf: VERLAUF_MERKEN });
  });

  it('ein Verweis ins Leere meldet das und wechselt nicht', () => {
    nav.beiVerweisKlick({ tabelle: LIBRARY, tabellenName: 'Library', kennung: null, wert: 'X' });
    expect(oeffne).not.toHaveBeenCalled();
    expect(meldungIn()).toBe(
      satz('database.form.nav.refMissing', { value: 'X', table: 'Library' }),
    );
    // Das nächste Umbinden nimmt die Meldung weg.
    nav.beimBinden(VERLAUF_MERKEN, true);
    expect(meldungIn()).toBe(null);
  });
});

describe('Datensatz-Verweis im Körper (4T-002335)', () => {
  // Der Link-Weg der Anwendung reicht als zweites Argument die Hilfe mit;
  // `datensatz` steht für `datensatzZiel` in `views/link-navigation.js`.
  const VERWEIS = '<a class="wikilink" href="Kunden.md#^r-00002">Beat</a>';

  function abfangenNachKlick() {
    const koerper = koerperMit(VERWEIS);
    klick(koerper.querySelector('a'));
    koerper.remove();
    expect(aktiviereLink).toHaveBeenCalledTimes(1);
    return aktiviereLink.mock.calls[0][3].abfangen;
  }

  it('öffnet die Maske des Datensatzes und reiht den Sprung in den Verlauf ein', async () => {
    const abfangen = abfangenNachKlick();
    const datensatz = vi.fn(async () => ({ path: LIBRARY, id: 'r-00001' }));
    expect(await abfangen(LIBRARY, { anker: '^r-00001', datensatz })).toBe(true);
    expect(datensatz).toHaveBeenCalledTimes(1);
    expect(oeffne).toHaveBeenCalledWith(LIBRARY, 'r-00001', { verlauf: VERLAUF_MERKEN });
    expect(meldungIn()).toBe(null);
  });

  it('ohne Datensatz-Ziel öffnet das Dokument wie bisher', async () => {
    const abfangen = abfangenNachKlick();
    const hilfe = { anker: '^r-00001', datensatz: async () => null };
    expect(await abfangen(LIBRARY, hilfe)).toBe(false);
    expect(oeffne).not.toHaveBeenCalled();
  });

  it('die alte Aufruf-Form ohne Hilfe lässt das Dokument öffnen', async () => {
    const abfangen = abfangenNachKlick();
    expect(await abfangen(LIBRARY)).toBe(false);
    expect(oeffne).not.toHaveBeenCalled();
  });
});

describe('Verlauf und «Zurück»', () => {
  function kopf() {
    const k = document.createElement('div');
    k.appendChild(document.createElement('div')).className = 'db-form-titles';
    nav.zeichneZurueck(k);
    return k.querySelector('.db-form-back');
  }

  // Wie die Seite: erst der Verlauf, dann der neue Gegenstand.
  function binde(ziel, art) {
    const anderer =
      ziel.tabellenPfad !== seite.tabellenPfad ||
      ziel.kennung !== seite.kennung ||
      (ziel.maske || null) !== seite.maske;
    nav.beimBinden(art, anderer);
    Object.assign(seite, { neu: false, maske: null, ...ziel });
  }

  it('ohne vorigen Datensatz gibt es kein «Zurück»', () => {
    expect(nav.hatVorigen()).toBe(false);
    expect(kopf()).toBe(null);
  });

  it('merkt den alten Gegenstand und führt mit «Zurück» samt Maske dorthin', () => {
    binde({ tabellenPfad: LOANS, kennung: 'r-00007', maske: LOANS_KURZ }, VERLAUF_MERKEN);
    binde({ tabellenPfad: LIBRARY, kennung: 'r-00001' }, VERLAUF_MERKEN);
    expect(nav.hatVorigen()).toBe(true);
    const knopf = kopf();
    expect(knopf.textContent).toBe(i18n.t('database.form.action.back'));
    // Über der Überschrift, im Titel-Block des Kopfs.
    expect(knopf.parentElement.className).toBe('db-form-titles');
    expect(knopf.parentElement.firstChild).toBe(knopf);
    knopf.click();
    // Zuerst zur Ausleihe in der kurzen Maske, der letzte Wechsel davor.
    expect(oeffne).toHaveBeenLastCalledWith(LOANS, 'r-00007', {
      neu: false,
      maske: LOANS_KURZ,
      verlauf: VERLAUF_ZURUECK,
    });
    // Erst das Umbinden nimmt den Eintrag ab; danach steht die Standard-Maske oben.
    binde({ tabellenPfad: LOANS, kennung: 'r-00007', maske: LOANS_KURZ }, VERLAUF_ZURUECK);
    nav.zurueck();
    expect(oeffne).toHaveBeenLastCalledWith(LOANS, 'r-00007', {
      neu: false,
      maske: null,
      verlauf: VERLAUF_ZURUECK,
    });
    binde({ tabellenPfad: LOANS, kennung: 'r-00007', maske: null }, VERLAUF_ZURUECK);
    expect(nav.hatVorigen()).toBe(false);
  });

  it('eine abgebrochene Rückfrage lässt den Verlauf unverändert', () => {
    binde({ tabellenPfad: LIBRARY, kennung: 'r-00001' }, VERLAUF_MERKEN);
    nav.zurueck();
    nav.zurueck();
    // Ohne Umbinden ist nichts abgenommen.
    expect(nav.hatVorigen()).toBe(true);
    expect(oeffne).toHaveBeenCalledTimes(2);
  });

  it('kein Eintrag ohne Wechsel; ein Öffnen von außen und das Schließen leeren', () => {
    binde({ tabellenPfad: LOANS, kennung: 'r-00007' }, VERLAUF_MERKEN);
    expect(nav.hatVorigen()).toBe(false);
    binde({ tabellenPfad: LIBRARY, kennung: 'r-00001' }, VERLAUF_MERKEN);
    expect(nav.hatVorigen()).toBe(true);
    binde({ tabellenPfad: LOANS, kennung: 'r-00002' }, undefined);
    expect(nav.hatVorigen()).toBe(false);
    binde({ tabellenPfad: LIBRARY, kennung: 'r-00001' }, VERLAUF_MERKEN);
    nav.beimSchliessen();
    expect(nav.hatVorigen()).toBe(false);
  });

  it('der Verlauf ist klein: über der Höchstzahl fällt der älteste heraus', () => {
    const verlauf = erzeugeVerlauf();
    for (let i = 0; i < VERLAUF_MAX + 5; i++) verlauf.merke({ kennung: `r-${i}` });
    expect(verlauf.anzahl()).toBe(VERLAUF_MAX);
    expect(verlauf.oben()).toEqual({ kennung: `r-${VERLAUF_MAX + 4}` });
    expect(verlauf.entferne()).toEqual({ kennung: `r-${VERLAUF_MAX + 4}` });
    verlauf.leere();
    expect(verlauf.entferne()).toBe(null);
  });
});
