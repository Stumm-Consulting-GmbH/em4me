// @vitest-environment jsdom
// 4T-001792 (Epic 3E-000255, AK2 bis AK5 und AK7 bis AK10): Die lesende
// Beleg-Ansicht am Datensatz — was sie aus einer gegebenen Beleg-Lage macht.
//
// Gemessen wird die ANZEIGE und nicht das Lesen: Aufbau, Reihenfolge und
// Verkettungs-Auskunft der Beleg-Datei prüfen `db-change-record` und
// `db-change-log`, die Absperrung des Kanals prüft `db-beleg-kanal`. Hier steht
// die Frage, ob der Anwender die Geschichte seines Datensatzes lesen kann.
//
// **Der deutsche Katalog wird geladen**, wie bei der Nachbar-Seite der
// Datenbank-Übersicht. Grund ist AK10: Ein Prüffall gegen den Schlüssel-Namen
// zeigte gerade nicht, dass aus einem Befund-Code ein ganzer Satz wird und dass
// der fehlende Wert anders benannt ist als der leere.
//
// **Die Bestands-Lesungen stehen im Modulkopf** (Regel «Bestands-Lesungen
// gehören in den Modulkopf»): Der Quelltext der Seite wird einmal gelesen, die
// Wächter-Fälle darunter arbeiten auf dem gelesenen Text.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import enDict from '../../../src/i18n/en.json';
import frDict from '../../../src/i18n/fr.json';
import esDict from '../../../src/i18n/es.json';
import itDict from '../../../src/i18n/it.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SEITEN_DATEI = path.resolve(
  HIER,
  '..',
  '..',
  '..',
  'src',
  'renderer',
  'modules',
  'database',
  'beleg-ansicht-seite.js',
);
const QUELLTEXT = fs.readFileSync(SEITEN_DATEI, 'utf8');
// Ohne Kommentare: Sonst zählte jede Erwähnung eines Kanals in einer
// Begründung als Aufruf, und der Wächter wäre nicht zu schreiben, ohne die
// Begründungen zu verstümmeln.
const OHNE_KOMMENTARE = QUELLTEXT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '');
// Zusätzlich ohne die Import-Quellen: Der Pfad `../app/api.js` sähe für den
// Kanal-Wächter sonst wie ein Aufruf `api.js` aus.
const RUMPF = OHNE_KOMMENTARE.replace(/from '[^']*'/g, '');

// Bestands-Markup, so weit `openSystemPage` es anfasst (Muster
// `datenbank-uebersicht-beim-binden.test.js`).
for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
      <section class="pane pane-mindmap"></section>
    </div>
  `;
}
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);

let antwort = null;
const aufrufe = [];
window.api.databaseChangeLog = async (params) => {
  aufrufe.push(params);
  return antwort;
};
window.api.databaseOverview = async () => null;
window.api.onBacklinksInvalidated = () => {};
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const seite = await import('../../../src/renderer/modules/database/beleg-ansicht-seite.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { BELEG_ARTEN, BELEG_CODES } = await import('../../../src/shared/database/change-record.js');

const TABELLE = 'C:\\Ablage\\Kunden\\Kunden.md';
const KENNUNG = 'r-00042';

// --- Bausteine der Fälle ------------------------------------------------------

function beleg(werte = {}) {
  return {
    art: 'update',
    zeitpunkt: '2026-09-18T10:00:00Z',
    benutzer: 'anna',
    rechner: 'SC-026',
    felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
    verdichtung: null,
    beschaedigt: false,
    code: null,
    ...werte,
  };
}

function bereit(belege, { luecken = [], befunde = [] } = {}) {
  return {
    status: 'ready',
    belege,
    befunde,
    verkettung: { lueckenlos: luecken.length === 0, luecken },
  };
}

async function raeumeAuf() {
  for (let p = state.panes.length - 1; p >= 0; p--) {
    for (let i = state.panes[p].tabs.length - 1; i >= 0; i--) {
      await closeTab(p, i, { skipDirtyCheck: true });
    }
  }
}

// Der Lebenszyklus wie beim echten Öffnen: Der Zugang bindet den Gegenstand und
// stößt das Holen an, danach montiert die Seite ihr DOM. Gewartet wird über
// einen Makrotask, weil eine feste Zahl von Mikrotask-Runden daran hinge, wie
// viele `await` unterwegs liegen.
async function baue(tabellenPfad = TABELLE, kennung = KENNUNG) {
  seite.oeffneBelegAnsicht(tabellenPfad, kennung);
  const def = systemPages.systemPageById(seite.BELEG_ANSICHT_PAGE_ID);
  const container = document.createElement('div');
  document.body.appendChild(container);
  def.mount(container);
  await new Promise((fertig) => setTimeout(fertig, 0));
  return container;
}

function texte(container, selektor) {
  return [...container.querySelectorAll(selektor)].map((e) => e.textContent);
}

beforeEach(async () => {
  await raeumeAuf();
  lebenszyklus.resetExtensionStateForTests();
  state.areaPath = 'C:\\Ablage\\Kunden';
  aufrufe.length = 0;
  antwort = bereit([beleg()]);
});

// --- AK2: die Belege eines Datensatzes ----------------------------------------

describe('Beleg-Ansicht: was je Beleg erscheint (AK2)', () => {
  it('fragt mit Tabellen-Pfad und Datensatz-Kennung', async () => {
    await baue();
    expect(aufrufe).toEqual([{ filePath: TABELLE, recordId: KENNUNG }]);
  });

  it('nennt Zeitpunkt, Art, Benutzer, Rechner und je Feld den alten und neuen Wert', async () => {
    const container = await baue();
    expect(texte(container, '.db-changelog-kind')).toEqual(['Geändert']);
    expect(texte(container, '.db-changelog-user')).toEqual(['anna']);
    expect(texte(container, '.db-changelog-machine')).toEqual(['SC-026']);
    expect(texte(container, '.db-changelog-field-name')).toEqual(['Ort']);
    expect(texte(container, '.db-changelog-value-text')).toEqual(['Basel', 'Bern']);
    // Der Zeitpunkt erscheint lokal und nicht als gespeicherte UTC-Form.
    const zeit = container.querySelector('.db-changelog-time').textContent;
    expect(zeit).not.toContain('Z');
    expect(zeit).toContain('2026');
  });

  it('nennt Datensatz und Tabellen-Datei im Kopf und im Reiter-Titel', async () => {
    const container = await baue();
    const kopf = container.querySelector('.db-changelog-heading').textContent;
    expect(kopf).toContain(KENNUNG);
    expect(kopf).toContain('Kunden.md');
    const titel = systemPages.systemPageById(seite.BELEG_ANSICHT_PAGE_ID).title();
    expect(titel).toContain(KENNUNG);
    expect(titel).toContain('Kunden.md');
  });

  it('zeigt den jüngsten Beleg zuerst, in umgekehrter Datei-Reihenfolge', async () => {
    // Die Zeitpunkte laufen absichtlich GEGEN die Datei-Reihenfolge: Sortiert
    // wird nach der Datei und nicht nach der Uhr, weil zwei Rechner-Uhren
    // auseinanderlaufen dürfen (Bauplan S3). Ohne diese Vertauschung wäre der
    // Fall auch bei einer Zeit-Sortierung grün.
    antwort = bereit([
      beleg({ zeitpunkt: '2026-09-18T12:00:00Z', felder: [{ name: 'A', alt: '1', neu: '2' }] }),
      beleg({ zeitpunkt: '2026-09-18T09:00:00Z', felder: [{ name: 'B', alt: '3', neu: '4' }] }),
      beleg({ zeitpunkt: '2026-09-18T11:00:00Z', felder: [{ name: 'C', alt: '5', neu: '6' }] }),
    ]);
    const container = await baue();
    expect(texte(container, '.db-changelog-field-name')).toEqual(['C', 'B', 'A']);
  });

  it('bindet auf einen anderen Datensatz um, statt eine zweite Seite zu öffnen', async () => {
    await baue();
    antwort = bereit([beleg({ felder: [{ name: 'Land', alt: 'CH', neu: 'DE' }] })]);
    const container = await baue(TABELLE, 'r-00099');
    expect(aufrufe[1]).toEqual({ filePath: TABELLE, recordId: 'r-00099' });
    expect(container.querySelector('.db-changelog-heading').textContent).toContain('r-00099');
    expect(texte(container, '.db-changelog-field-name')).toEqual(['Land']);
    // Eine Instanz je Fenster: Der Reiter wird umgebunden und nicht verdoppelt.
    let reiter = 0;
    for (const pane of state.panes)
      reiter += pane.tabs.filter((t) => t.systemPage === seite.BELEG_ANSICHT_PAGE_ID).length;
    expect(reiter).toBe(1);
  });
});

// --- AK3: verdichtete Belege und Belege über Fremd-Änderungen -----------------

describe('Beleg-Ansicht: Verdichtung und Änderung von außen (AK3)', () => {
  it('nennt am verdichteten Beleg die Zahl der ersetzten Änderungen, den Beginn und die Arten', async () => {
    antwort = bereit([
      beleg({
        art: 'merged',
        benutzer: null,
        rechner: null,
        verdichtung: {
          anzahl: 120,
          seit: '2026-05-01T08:00:00Z',
          arten: ['create', 'update'],
        },
      }),
    ]);
    const container = await baue();
    expect(container.querySelector('.db-changelog-kind').textContent).toBe('Zusammengefasst');
    expect(container.querySelector('.db-changelog-merged-count').textContent).toContain('120');
    expect(container.querySelector('.db-changelog-merged-since').textContent).toContain('2026');
    const arten = container.querySelector('.db-changelog-merged-kinds').textContent;
    expect(arten).toContain('Angelegt');
    expect(arten).toContain('Geändert');
    // Kein Urheber: Eine Spanne hat viele, und einen zu nennen wäre eine
    // Behauptung.
    expect(container.querySelectorAll('.db-changelog-user')).toHaveLength(0);
    expect(container.querySelectorAll('.db-changelog-machine')).toHaveLength(0);
  });

  it('kennzeichnet die Änderung von außen, zeigt keinen Urheber und beschriftet beide Werte eigens', async () => {
    antwort = bereit([
      beleg({
        art: 'external',
        benutzer: 'anna',
        rechner: 'SC-026',
        felder: [{ name: 'Ort', alt: 'Bern', neu: 'Zürich' }],
      }),
    ]);
    const container = await baue();
    expect(container.querySelector('.db-changelog-kind').textContent).toBe('Von außen geändert');
    expect(container.querySelector('.db-changelog-external')).not.toBeNull();
    // Auch eine mitgelieferte Herkunft erscheint nicht: Wer die Datei von Hand
    // geändert hat, weiß die Anwendung nicht.
    expect(container.querySelectorAll('.db-changelog-user')).toHaveLength(0);
    expect(texte(container, '.db-changelog-value-label')).toEqual(['Erwartet', 'Vorgefunden']);
  });

  it('beschriftet die Werte eines gewöhnlichen Belegs als vorher und nachher', async () => {
    // Gegenprobe zum Fall darüber: Ohne sie bliebe er grün, wenn die Seite
    // IMMER «erwartet» und «vorgefunden» schriebe.
    const container = await baue();
    expect(texte(container, '.db-changelog-value-label')).toEqual(['Vorher', 'Nachher']);
  });
});

// --- AK4 und AK5: nur lesend, und nichts Neues daneben ------------------------

describe('Beleg-Ansicht: nur lesend (AK4, Bauplan S10)', () => {
  it('ruft im Quelltext außer dem Beleg-Kanal keinen weiteren Kanal', () => {
    const kanaele = [...RUMPF.matchAll(/\bapi\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(kanaele.length).toBeGreaterThan(0);
    expect([...new Set(kanaele)]).toEqual(['databaseChangeLog']);
  });

  it('erzeugt kein Bedien-Element außer der Schaltfläche zum Aktualisieren', async () => {
    const container = await baue();
    const knoepfe = [...container.querySelectorAll('button')];
    expect(knoepfe).toHaveLength(1);
    expect(knoepfe[0].className).toBe('db-changelog-refresh');
    expect(knoepfe[0].textContent).toBe('Aktualisieren');
    for (const tag of ['input', 'select', 'textarea', 'form', '[contenteditable]']) {
      expect(container.querySelectorAll(tag), tag).toHaveLength(0);
    }
  });

  it('setzt Werte über textContent und nie als Auszeichnung', () => {
    // Der Inhalt einer Zelle ist der Text des Anwenders und kein Markup. Ein
    // einziges innerHTML mit Daten wäre eine Lücke, die kein Anzeige-Fall
    // findet, weil jsdom das Markup brav rendert.
    const stellen = [...OHNE_KOMMENTARE.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    expect(stellen).toEqual(["''"]);
  });

  it('bindet weder eine Auswertung der Abfrage-Sprache noch ein Leserecht ein (AK5)', () => {
    const quellen = [...OHNE_KOMMENTARE.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(quellen).toEqual([
      '../../i18n.js',
      '../app/api.js',
      '../app/system-pages.js',
      '../extensions/extension-lifecycle.js',
      '../time-format.js',
      '../../../shared/database/change-record.js',
    ]);
  });
});

// --- AK7 und AK8: leere Lagen, gestörte Lagen, Fenster ------------------------

describe('Beleg-Ansicht: leere und gestörte Lagen (AK7)', () => {
  it('sagt es, wenn es zu diesem Datensatz noch keine Belege gibt', async () => {
    antwort = bereit([]);
    const container = await baue();
    expect(container.querySelector('.db-changelog-empty').textContent).toContain(
      'noch keine Änderungsbelege',
    );
    expect(container.querySelectorAll('.db-changelog-entry')).toHaveLength(0);
  });

  it('meldet die nicht lesbare Beleg-Datei, ohne auszufallen', async () => {
    antwort = { status: 'error', belege: [], befunde: [], verkettung: null };
    const container = await baue();
    expect(container.querySelector('.db-changelog-empty').textContent).toContain('nicht lesbar');
    expect(container.querySelector('.db-changelog-heading')).not.toBeNull();
  });

  it('meldet den fehlenden Zugriff mit eigenem Satz', async () => {
    antwort = { status: 'unavailable', belege: [], befunde: [], verkettung: null };
    const container = await baue();
    const satz = container.querySelector('.db-changelog-empty').textContent;
    expect(satz).toContain('kein Zugriff');
    expect(satz).not.toContain('noch keine Änderungsbelege');
  });

  it('übersteht eine ausgefallene Anfrage als gestörte Lage', async () => {
    window.api.databaseChangeLog = async () => {
      throw new Error('kaputt');
    };
    const container = await baue();
    expect(container.querySelector('.db-changelog-empty').textContent).toContain('nicht lesbar');
    window.api.databaseChangeLog = async (params) => {
      aufrufe.push(params);
      return antwort;
    };
  });

  it('zeigt einen unlesbaren Beleg als Zeile mit seinem Befund', async () => {
    antwort = bereit([
      beleg(),
      beleg({
        art: null,
        zeitpunkt: null,
        felder: [],
        beschaedigt: true,
        code: BELEG_CODES.zellen,
      }),
    ]);
    const container = await baue();
    expect(container.querySelectorAll('.db-changelog-entry')).toHaveLength(2);
    const befund = container.querySelector('.db-changelog-issue').textContent;
    expect(befund).toContain('unvollständig');
    expect(befund).not.toContain(BELEG_CODES.zellen);
  });

  it('fällt bei einem unbekannten Befund-Code auf einen allgemeinen Satz mit dem Code zurück', async () => {
    antwort = bereit([beleg({ beschaedigt: true, code: 'nochNichtBeschrieben' })]);
    const container = await baue();
    expect(container.querySelector('.db-changelog-issue').textContent).toBe(
      'Dieser Änderungsbeleg ist nicht lesbar (nochNichtBeschrieben).',
    );
  });

  it('nennt Befunde des Lesens, die zu keinem gezeigten Beleg gehören', async () => {
    antwort = bereit([beleg()], { befunde: [{ code: BELEG_CODES.kennung }] });
    const container = await baue();
    expect(container.querySelector('.db-changelog-other-issues').textContent).toContain('1');
  });

  it('schweigt über fremde Befunde, wenn jeder Befund an einem gezeigten Beleg hängt', async () => {
    antwort = bereit([beleg({ beschaedigt: true, code: BELEG_CODES.zellen })], {
      befunde: [{ code: BELEG_CODES.zellen }],
    });
    const container = await baue();
    expect(container.querySelector('.db-changelog-other-issues')).toBeNull();
  });
});

describe('Beleg-Ansicht: das Fenster und seine Angabe (AK8)', () => {
  it('zeigt die jüngsten 500 Belege und benennt den Ausschnitt', async () => {
    const belege = [];
    for (let i = 0; i < seite.MAX_BELEGE + 7; i++) {
      belege.push(beleg({ felder: [{ name: `F${i}`, alt: 'a', neu: 'b' }] }));
    }
    antwort = bereit(belege);
    const container = await baue();
    expect(container.querySelectorAll('.db-changelog-entry')).toHaveLength(seite.MAX_BELEGE);
    const angabe = container.querySelector('.db-changelog-window').textContent;
    expect(angabe).toContain(String(seite.MAX_BELEGE));
    expect(angabe).toContain(String(seite.MAX_BELEGE + 7));
    // Gezeigt werden die JÜNGSTEN, also die am Ende der Datei; der erste
    // gezeigte Eintrag trägt das letzte Feld.
    expect(container.querySelector('.db-changelog-field-name').textContent).toBe(
      `F${seite.MAX_BELEGE + 6}`,
    );
  });

  it('nennt keinen Ausschnitt, solange alles gezeigt wird', async () => {
    const container = await baue();
    expect(container.querySelector('.db-changelog-window')).toBeNull();
  });

  it('hält eine Unterbrechung am Rand des Fensters fest', async () => {
    // Das Fenster schneidet NACH der Auswertung der Verkettung (Bauplan S7).
    // Die Unterbrechung sitzt am ältesten noch gezeigten Beleg; wer zuerst
    // schneidet, verliert sie, weil dieser Beleg dann keinen Vorgänger mehr
    // hätte, an dem er scheitern könnte.
    const belege = [];
    for (let i = 0; i < seite.MAX_BELEGE + 3; i++) {
      belege.push(beleg({ felder: [{ name: `F${i}`, alt: 'a', neu: 'b' }] }));
    }
    const randPosition = belege.length - seite.MAX_BELEGE;
    antwort = bereit(belege, {
      luecken: [{ grund: 'wert', feld: `F${randPosition}`, position: randPosition }],
    });
    const container = await baue();
    const bruch = container.querySelector('.db-changelog-break');
    expect(bruch).not.toBeNull();
    expect(bruch.textContent).toContain(`F${randPosition}`);
  });
});

// --- AK9: Werte unverfälscht --------------------------------------------------

describe('Beleg-Ansicht: Werte unverfälscht (AK9)', () => {
  it('erhält Zeilenumbrüche und Sonderzeichen im Wert', async () => {
    const wert = 'Beispielweg 3\n4051 Basel <&> «zitiert» | Zelle';
    antwort = bereit([beleg({ felder: [{ name: 'Adresse', alt: null, neu: wert }] })]);
    const container = await baue();
    const knoten = container.querySelectorAll('.db-changelog-value-text');
    expect(knoten).toHaveLength(1);
    expect(knoten[0].textContent).toBe(wert);
    // Der Wert ist Text und kein Markup: Sonderzeichen bleiben Zeichen.
    expect(knoten[0].innerHTML).not.toContain('<');
    expect(knoten[0].innerHTML).toContain('&lt;&amp;&gt;');
    // Dass der Zeilenumbruch in der Anzeige auch WIRKT, hängt an der
    // Stil-Regel `white-space: pre-wrap`; jsdom lädt kein Stilblatt, und der
    // Nachweis liegt deshalb beim End-zu-End-Fall.
  });

  it('unterscheidet den fehlenden Wert vom leeren, in Text und Gestalt', async () => {
    antwort = bereit([beleg({ felder: [{ name: 'Ort', alt: null, neu: '' }] })]);
    const container = await baue();
    const fehlt = container.querySelector('.db-changelog-value-missing');
    const leer = container.querySelector('.db-changelog-value-empty');
    expect(fehlt).not.toBeNull();
    expect(leer).not.toBeNull();
    expect(fehlt.textContent).toBe('nicht vorhanden');
    expect(leer.textContent).toBe('leer');
    expect(fehlt.textContent).not.toBe(leer.textContent);
    // Und keiner von beiden erscheint als Wert-Text, der ein leeres Feld wäre.
    expect(container.querySelectorAll('.db-changelog-value-text')).toHaveLength(0);
  });
});

// --- Unterbrechungen der Spur -------------------------------------------------

describe('Beleg-Ansicht: Unterbrechungen der Spur (Bauplan S5)', () => {
  it('setzt die Unterbrechung an die Stelle, an der sie auffällt', async () => {
    // Die Positionen der Auskunft zählen in DATEI-Reihenfolge. Die Lücke an
    // Position 1 fällt zwischen Beleg 0 und Beleg 1 auf; in der umgekehrten
    // Anzeige liegt diese Stelle unmittelbar UNTER Beleg 1.
    //
    // **VIER Belege und die Lücke an Position 1**, nicht drei mit der Lücke in
    // der Mitte: Bei drei Belegen ist Position 1 der Fixpunkt der Spiegelung,
    // und eine verdrehte Umrechnung `gesamt - 1 - position` träfe dieselbe
    // Stelle. Die Mutationsprobe hat genau das gezeigt — der Fall war grün,
    // obwohl die Umrechnung falsch war.
    antwort = bereit(
      [
        beleg({ felder: [{ name: 'F0', alt: '1', neu: '2' }] }),
        beleg({ felder: [{ name: 'F1', alt: '9', neu: '3' }] }),
        beleg({ felder: [{ name: 'F2', alt: '3', neu: '4' }] }),
        beleg({ felder: [{ name: 'F3', alt: '4', neu: '5' }] }),
      ],
      { luecken: [{ grund: 'wert', feld: 'F1', position: 1 }] },
    );
    const container = await baue();
    const kinder = [...container.querySelector('.db-changelog-list').children];
    const klassen = kinder.map((k) => (k.classList.contains('db-changelog-break') ? 'bruch' : 'b'));
    expect(klassen).toEqual(['b', 'b', 'b', 'bruch', 'b']);
    // Die Zeile über der Unterbrechung ist Beleg 1, die darunter Beleg 0.
    expect(kinder[2].querySelector('.db-changelog-field-name').textContent).toBe('F1');
    expect(kinder[3].textContent).toContain('F1');
    expect(kinder[4].querySelector('.db-changelog-field-name').textContent).toBe('F0');
  });

  it('gestaltet die beiden Gründe verschieden und nennt das Feld nur beim Wert', async () => {
    antwort = bereit(
      [
        beleg({ felder: [{ name: 'Ort', alt: '1', neu: '2' }] }),
        beleg({ beschaedigt: true, code: BELEG_CODES.zellen, felder: [] }),
      ],
      {
        luecken: [
          { grund: 'wert', feld: 'Ort', position: 0 },
          { grund: 'beschaedigt', feld: null, position: 1 },
        ],
      },
    );
    const container = await baue();
    const bruecke = [...container.querySelectorAll('.db-changelog-break')];
    expect(bruecke).toHaveLength(2);
    const beschaedigt = container.querySelector('.db-changelog-break-damaged');
    const wert = container.querySelector('.db-changelog-break-value');
    expect(beschaedigt.textContent).toContain('nicht lesbar');
    expect(wert.textContent).toContain('Ort');
    expect(beschaedigt.className).not.toBe(wert.className);
  });
});

// --- AK10 und Bauplan S6: die Texte in fünf Sprachen --------------------------

describe('Beleg-Ansicht: Texte in allen fünf Sprachfassungen (AK10, Bauplan S6)', () => {
  const SPRACHEN = { de, en: enDict, fr: frDict, es: esDict, it: itDict };

  it('führt zu jedem Befund-Code des Formats einen Satz, in allen fünf Sprachen', () => {
    // Der Vorrat wird ABGELEITET und nicht abgeschrieben: Ein künftiger Code
    // des Beleg-Formats fällt hier auf und nicht erst beim Anwender.
    const codes = Object.values(BELEG_CODES);
    expect(codes.length).toBeGreaterThan(0);
    const fehlend = [];
    for (const [sprache, dict] of Object.entries(SPRACHEN)) {
      for (const code of [...codes, 'unknown']) {
        const key = `database.changeLog.issue.${code}`;
        if (!dict[key]) fehlend.push(`${sprache}: ${key}`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  it('führt zu jeder Art des Formats ein Wort, in allen fünf Sprachen', () => {
    const fehlend = [];
    for (const [sprache, dict] of Object.entries(SPRACHEN)) {
      for (const art of [...BELEG_ARTEN, 'unknown']) {
        const key = `database.changeLog.kind.${art}`;
        if (!dict[key]) fehlend.push(`${sprache}: ${key}`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  it('führt jeden Schlüssel, den der Quelltext nennt, in allen fünf Sprachen', () => {
    const schluessel = [
      ...new Set([...QUELLTEXT.matchAll(/'(database\.changeLog\.[A-Za-z.]+)'/g)].map((m) => m[1])),
    ];
    expect(schluessel.length).toBeGreaterThan(10);
    const fehlend = [];
    for (const [sprache, dict] of Object.entries(SPRACHEN)) {
      for (const key of schluessel) if (!dict[key]) fehlend.push(`${sprache}: ${key}`);
    }
    expect(fehlend).toEqual([]);
  });

  it('nennt im Quelltext keinen nutzer-sichtbaren Text ohne Schlüssel', () => {
    // Jeder Text läuft über `t()`. Gemessen wird am Quelltext, weil ein
    // Anzeige-Fall einen hartkodierten deutschen Satz nicht von einem
    // übersetzten unterscheiden kann, solange die Oberfläche deutsch ist.
    const gesetzt = [...OHNE_KOMMENTARE.matchAll(/textContent\s*=\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    for (const stelle of gesetzt) {
      expect(stelle, stelle).not.toMatch(/^'[^']*[A-Za-zÄÖÜäöüß]/);
    }
  });
});

// --- Das Tor der Erweiterung --------------------------------------------------

describe('Beleg-Ansicht im Aus-Zustand der Erweiterung «Datenbank»', () => {
  it('öffnet nichts und fragt nichts, ohne Meldung', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    seite.oeffneBelegAnsicht(TABELLE, KENNUNG);
    expect(seite.belegAnsichtOffen()).toBe(false);
    expect(aufrufe).toEqual([]);
  });

  it('entfällt auch transitiv über die Eigenschafts-Profile', async () => {
    await lebenszyklus.applyExtensionsState(['property-profiles'], { persist: false });
    seite.oeffneBelegAnsicht(TABELLE, KENNUNG);
    expect(seite.belegAnsichtOffen()).toBe(false);
  });

  it('wirkt nach dem Wiedereinschalten unverändert', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    seite.oeffneBelegAnsicht(TABELLE, KENNUNG);
    await lebenszyklus.applyExtensionsState([], { persist: false });
    await baue();
    expect(seite.belegAnsichtOffen()).toBe(true);
  });

  it('öffnet nichts ohne Gegenstand', async () => {
    seite.oeffneBelegAnsicht('', KENNUNG);
    seite.oeffneBelegAnsicht(TABELLE, '');
    expect(seite.belegAnsichtOffen()).toBe(false);
    expect(aufrufe).toEqual([]);
  });
});

// --- Der Einstieg der End-zu-End-Suite ----------------------------------------

describe('Beleg-Ansicht: Verdrahtungs-Ereignis für die End-zu-End-Suite', () => {
  it('öffnet die Seite über scg:open-change-log mit Pfad und Kennung', async () => {
    document.dispatchEvent(
      new CustomEvent('scg:open-change-log', {
        detail: { filePath: TABELLE, recordId: KENNUNG },
      }),
    );
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(seite.belegAnsichtOffen()).toBe(true);
    expect(aufrufe).toEqual([{ filePath: TABELLE, recordId: KENNUNG }]);
  });
});
