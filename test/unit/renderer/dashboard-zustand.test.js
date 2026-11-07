// @vitest-environment jsdom
// 4T-002516 (Epic 3E-000402): Filter am Kopf eines Dashboards. Geprüft wird am
// Anzeige-Prozess, was die Auswahl hält und was sie bewegt: der Zustand je
// geöffnetem Dokument und Block (`dashboard-zustand.js`) mit Schlüssel,
// Signatur, Vorbelegung und verschwundenem Wert, und die Auswahlfelder
// (`dashboard-filter.js`) am Markup des Blocks mit einer Attrappe der beiden
// Kanäle: Werte aus dem Bestand, Bündelung der Wechsel, Neu-Befüllung allein der
// betroffenen Kacheln (AK7) und Nachzug der Werte ohne erneutes Öffnen (AK5).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Attrappe der Brücke: Abfrage-Kanal und Werte-Kanal, dazu der Zuhörer der
// Index-Invalidierung, den das Modul beim ersten Block anmeldet.
const kanal = vi.hoisted(() => ({
  aufrufe: [],
  werte: new Map(),
  werteAufrufe: [],
  werteBeantwortet: 0,
  invalidierung: null,
}));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    runFrontmatterQuery: (basePath, query, locale, params) => {
      kanal.aufrufe.push({ basePath, query, params });
      return Promise.resolve(undefined);
    },
    dashboardFilterWerte: (filePath, eigenschaft) => {
      kanal.werteAufrufe.push({ filePath, eigenschaft });
      const values = kanal.werte.get(eigenschaft);
      const antwort = values ? { status: 'ready', values: values.slice() } : null;
      return Promise.resolve().then(() => {
        kanal.werteBeantwortet += 1;
        return antwort;
      });
    },
    onBacklinksInvalidated: (cb) => {
      kanal.invalidierung = cb;
    },
  },
  $: () => null,
}));

import {
  applyFrontmatterQueriesIfPresent,
  waitForFrontmatterQueriesIdle,
} from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import { bereiteDashboardKachelnVor } from '../../../src/renderer/modules/dashboard/dashboard-view.js';
import {
  richteDashboardFilterEin,
  PUFFER_EREIGNIS,
  BUENDEL_MS,
} from '../../../src/renderer/modules/dashboard/dashboard-filter.js';
import {
  schluesselDes,
  signaturDer,
  gemerkteWerte,
  merkeWerte,
  anfangsWerte,
  optionenDes,
  paramsDer,
  platzhalterNamen,
  istBetroffen,
} from '../../../src/renderer/modules/dashboard/dashboard-zustand.js';
import { renderDashboardBlock } from '../../../src/shared/markdown/dashboard-block.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PFAD = '/raum/Dashboard.md';

const BEIDE = 'LIST WHERE status = $status AND prio = $prio';
const NUR_STATUS = 'TABLE status WHERE status = $status';
const OHNE = 'LIST';

const BLOCK = [
  '!filter status titel="Status" vorbelegung=offen',
  '!filter prio titel="Priorität"',
  'hoch',
  'mittel',
  'niedrig',
  '!kachel kennzahl titel="Beide"',
  BEIDE,
  '!kachel tabelle titel="Nur Status"',
  NUR_STATUS,
  '!kachel liste titel="Ohne"',
  OHNE,
  '!kachel tabelle abfrage="Abfragen/Offen"',
].join('\n');

// Ein Block in einer Spalte; `fenster` ist der hereingereichte Fenster-Zustand.
function dashboardIn(rumpf = BLOCK, spalte = 0) {
  const gruppe = document.createElement('div');
  gruppe.className = 'pane-group';
  gruppe.dataset.pane = String(spalte);
  const host = document.createElement('div');
  host.innerHTML = renderDashboardBlock(rumpf, {
    lineStart: 1,
    lineEnd: 20,
    index: 0,
    L: (key) => key,
    enabled: () => true,
    env: { lang: 'de' },
  });
  gruppe.appendChild(host);
  document.body.appendChild(gruppe);
  return host;
}

function fensterMit(...tabs) {
  return { panes: tabs.map((tab) => ({ activeIndex: 0, tabs: [tab] })) };
}

function einrichten(host, fenster, pfad = PFAD) {
  bereiteDashboardKachelnVor(host);
  return richteDashboardFilterEin(host, pfad, fenster);
}

const auswahl = (host, name) => host.querySelector(`select[data-filter-name="${name}"]`);
const optionen = (select) => Array.from(select.options).map((o) => o.value);
const paramsAn = (host) =>
  Array.from(host.querySelectorAll('.dashboard-kachel-inhalt')).map((el) =>
    el.dataset.fmParams === undefined ? undefined : JSON.parse(el.dataset.fmParams),
  );

function waehle(select, wert) {
  select.value = wert;
  select.dispatchEvent(new Event('change'));
}

// Wartet auf die Bedingung statt auf eine feste Zahl von Mikro-Schritten
// (Review-Runde 1 von 3E-000402, Befund B3-8): Jede Anfrage an den Werte-Kanal
// ist beantwortet, ihre Verarbeitung ist durch (ein Makro-Schritt leert die
// Mikro-Schritte dahinter), und die Bedingung des Aufrufers gilt.
async function warteAufWerte(bedingung = () => true) {
  await vi.waitFor(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(kanal.werteBeantwortet).toBe(kanal.werteAufrufe.length);
    expect(bedingung()).toBe(true);
  });
}

afterEach(() => {
  document.body.textContent = '';
  kanal.aufrufe.length = 0;
  kanal.werteAufrufe.length = 0;
  kanal.werteBeantwortet = 0;
  kanal.werte.clear();
  vi.useRealTimers();
});

// --- Zustand ohne DOM ----------------------------------------------------------------

describe('dashboard-zustand: Schlüssel, Signatur und Gedächtnis', () => {
  it('Signatur folgt Namen und Reihenfolge, nicht der Schreibweise', () => {
    expect(signaturDer(['Status', 'prio'])).toBe(signaturDer(['status', 'PRIO']));
    expect(signaturDer(['status', 'prio'])).not.toBe(signaturDer(['prio', 'status']));
    expect(schluesselDes(0, PFAD, 1)).not.toBe(schluesselDes(1, PFAD, 1));
    expect(schluesselDes(0, PFAD, 1)).not.toBe(schluesselDes(0, PFAD, 2));
  });

  it('merkt je geöffnetem Dokument und verwirft eine unpassende Signatur', () => {
    const tab = {};
    const s = schluesselDes(0, PFAD, 0);
    expect(merkeWerte(tab, s, 'a', ['x', null])).toBe(true);
    expect(gemerkteWerte(tab, s, 'a')).toEqual(['x', null]);
    expect(gemerkteWerte({}, s, 'a')).toBeNull();
    expect(gemerkteWerte(tab, s, 'b')).toBeNull();
    // Die unpassende Erinnerung ist danach fort, auch für die alte Signatur.
    expect(gemerkteWerte(tab, s, 'a')).toBeNull();
  });

  it('ohne geöffnetes Dokument wird nichts gemerkt', () => {
    expect(merkeWerte(null, 'k', 's', ['x'])).toBe(false);
    expect(gemerkteWerte(null, 'k', 's')).toBeNull();
  });
});

describe('dashboard-zustand: Anfangs-Werte (AK3) und Optionen', () => {
  const status = { name: 'status', werte: null, vorbelegung: 'offen' };
  const prio = { name: 'prio', werte: ['hoch', 'mittel'], vorbelegung: null };

  it('ohne Gedächtnis gilt die Vorbelegung, ohne Vorbelegung «alle»', () => {
    expect(anfangsWerte([status, prio], null)).toEqual(['offen', null]);
  });

  it('gemerkter Wert aus dem Bestand gilt auch, wenn er gerade fehlt; «alle» bleibt «alle»', () => {
    expect(anfangsWerte([status, prio], ['verschwunden', 'mittel'])).toEqual([
      'verschwunden',
      'mittel',
    ]);
    expect(anfangsWerte([status, prio], [null, null])).toEqual([null, null]);
  });

  it('gemerkter Wert eines aufgezählten Filters, der nicht mehr aufgezählt ist, fällt auf die Vorbelegung', () => {
    expect(anfangsWerte([status, prio], ['zu', 'gestrichen'])).toEqual(['zu', null]);
  });

  it('ein Wert über 500 Zeichen wird nicht gebunden', () => {
    const lang = 'x'.repeat(501);
    expect(anfangsWerte([{ ...status, vorbelegung: lang }], null)).toEqual([null]);
    expect(optionenDes(status, ['a', lang], null)).toEqual(['a']);
  });

  it('aufgezählt in Reihenfolge; Bestand sortiert und um den gewählten Wert ergänzt', () => {
    expect(optionenDes(prio, ['zzz'], 'hoch')).toEqual(['hoch', 'mittel']);
    const vergleich = new Intl.Collator('de').compare;
    expect(optionenDes(status, ['zu', 'Äpfel', 'offen'], null, vergleich)).toEqual([
      'Äpfel',
      'offen',
      'zu',
    ]);
    expect(optionenDes(status, ['zu'], 'weg', vergleich)).toEqual(['weg', 'zu']);
    expect(optionenDes(status, null, null)).toEqual([]);
  });

  it('Werte an den Kacheln: Name -> Wert, «alle» als null, höchstens zwanzig Namen', () => {
    expect(JSON.parse(paramsDer([status, prio], ['offen', null]))).toEqual({
      status: 'offen',
      prio: null,
    });
    const viele = Array.from({ length: 25 }, (_, i) => ({ name: `f${i}` }));
    expect(Object.keys(JSON.parse(paramsDer(viele, [])))).toHaveLength(20);
  });

  it('Platzhalter einer Abfrage, ohne Rücksicht auf die Schreibweise', () => {
    expect([...platzhalterNamen(BEIDE)]).toEqual(['status', 'prio']);
    expect(platzhalterNamen(OHNE).size).toBe(0);
    expect(istBetroffen(NUR_STATUS, ['Status'])).toBe(true);
    expect(istBetroffen(NUR_STATUS, ['prio'])).toBe(false);
    expect(istBetroffen(OHNE, ['status', 'prio'])).toBe(false);
  });
});

// --- Auswahlfelder am Markup --------------------------------------------------------

describe('dashboard-filter: Auswahlfelder am Kopf (AK1, AK2, AK6)', () => {
  it('baut je Filter Beschriftung und Auswahlfeld, «alle» zuerst', async () => {
    kanal.werte.set('status', ['zu', 'offen', 'in Arbeit']);
    const host = dashboardIn();
    expect(einrichten(host, fensterMit({}))).toBe(1);
    const status = auswahl(host, 'status');
    expect(status.closest('label').querySelector('.dashboard-filter-titel').textContent).toBe(
      'Status',
    );
    expect(status.options[0].value).toBe('');
    expect(status.options[0].textContent).toMatch(/^(alle|dashboard\.hint\.filterAlle)$/);
    // Aufgezählt: genau diese Werte und «alle» (AK2).
    expect(optionen(auswahl(host, 'prio'))).toEqual(['', 'hoch', 'mittel', 'niedrig']);
    // Bestand: alphabetisch nach Ankunft der Werte, die Vorbelegung gewählt (AK1).
    await warteAufWerte(() => optionen(status).includes('in Arbeit'));
    expect(kanal.werteAufrufe).toEqual([{ filePath: PFAD, eigenschaft: 'status' }]);
    expect(optionen(status)).toEqual(['', 'in Arbeit', 'offen', 'zu']);
    expect(status.value).toBe('offen');
  });

  it('eine Eigenschaft ohne Vorkommen bietet nur «alle» (AK6)', async () => {
    kanal.werte.set('fehlt', []);
    const host = dashboardIn('!filter fehlt\n!kachel liste\nLIST WHERE fehlt = $fehlt');
    einrichten(host, fensterMit({}));
    await warteAufWerte();
    expect(optionen(auswahl(host, 'fehlt'))).toEqual(['']);
  });

  it('setzt die Werte an jede Daten-Kachel, auch an die mit Abfrage-Datei', () => {
    const host = dashboardIn();
    einrichten(host, fensterMit({}));
    const erwartet = { status: 'offen', prio: null };
    expect(paramsAn(host)).toEqual([erwartet, erwartet, erwartet, erwartet]);
  });

  it('übergeht einen Block ohne Filter und einen schon eingerichteten', () => {
    const host = dashboardIn('!kachel liste\nLIST');
    expect(einrichten(host, fensterMit({}))).toBe(0);
    const zweiter = dashboardIn();
    expect(einrichten(zweiter, fensterMit({}))).toBe(1);
    expect(richteDashboardFilterEin(zweiter, PFAD)).toBe(0);
    expect(richteDashboardFilterEin(null, PFAD)).toBe(0);
  });

  it('der Befund eines Filters steht an seinem Platz unter dem Feld, nicht im Sammel-Hinweis', () => {
    const host = dashboardIn(
      '!filter prio vorbelegung=dringend\nhoch\n!filter x-y\n!kachel liste\nLIST',
    );
    einrichten(host, fensterMit({}));
    const platz = host.querySelector('.dashboard-filter[data-filter-name="prio"]');
    expect(platz.firstElementChild.classList.contains('dashboard-filter-feld')).toBe(true);
    // Ohne Sprachdatei liefert der Beschriftungs-Leser des Prüffalls den Schlüssel.
    expect(platz.querySelector('.dashboard-hinweis').textContent).toBe(
      'dashboard.hint.zeile dashboard.hint.vorbelegungUnbekannt',
    );
    // Der Filter ohne gültigen Namen hat keinen Platz und bleibt im Sammel-Hinweis.
    const sammel = host.querySelector('.dashboard-sammel');
    expect(sammel.textContent).toContain('dashboard.hint.filterOhneName');
    expect(sammel.textContent).not.toContain('vorbelegungUnbekannt');
  });

  it('richtet einen geklonten Block neu ein, mit genau einem Feld je Filter', () => {
    const host = dashboardIn();
    einrichten(host, fensterMit({}));
    const klon = host.cloneNode(true);
    host.parentNode.appendChild(klon);
    expect(einrichten(klon, fensterMit({}))).toBe(1);
    expect(klon.querySelectorAll('select')).toHaveLength(2);
    waehle(auswahl(klon, 'prio'), 'mittel');
    expect(paramsAn(klon)[0]).toEqual({ status: 'offen', prio: 'mittel' });
  });
});

describe('dashboard-filter: Auswahl anwenden (AK7, Bündelung)', () => {
  async function befuellt(host) {
    applyFrontmatterQueriesIfPresent(host, PFAD);
    await waitForFrontmatterQueriesIdle();
    const erste = kanal.aufrufe.map((a) => a.query);
    kanal.aufrufe.length = 0;
    return erste;
  }

  async function nachBuendel() {
    vi.advanceTimersByTime(BUENDEL_MS);
    vi.useRealTimers();
    await waitForFrontmatterQueriesIdle();
  }

  it('befüllt nur die Kacheln neu, deren Abfrage den geänderten Platzhalter trägt (AK7)', async () => {
    const host = dashboardIn();
    einrichten(host, fensterMit({}));
    expect(await befuellt(host)).toEqual([BEIDE, NUR_STATUS, OHNE]);

    vi.useFakeTimers();
    waehle(auswahl(host, 'prio'), 'hoch');
    expect(kanal.aufrufe).toHaveLength(0);
    await nachBuendel();
    expect(kanal.aufrufe).toEqual([
      { basePath: PFAD, query: BEIDE, params: { status: 'offen', prio: 'hoch' } },
    ]);

    kanal.aufrufe.length = 0;
    vi.useFakeTimers();
    waehle(auswahl(host, 'status'), '');
    await nachBuendel();
    expect(kanal.aufrufe.map((a) => a.query)).toEqual([BEIDE, NUR_STATUS]);
    expect(kanal.aufrufe[1].params).toEqual({ status: null, prio: 'hoch' });
  });

  it('bündelt schnelle Wechsel zu einer Neu-Befüllung je Kachel; beide Filter wirken zugleich (AK6)', async () => {
    const host = dashboardIn();
    einrichten(host, fensterMit({}));
    await befuellt(host);

    vi.useFakeTimers();
    waehle(auswahl(host, 'prio'), 'hoch');
    vi.advanceTimersByTime(BUENDEL_MS - 50);
    waehle(auswahl(host, 'prio'), 'mittel');
    vi.advanceTimersByTime(BUENDEL_MS - 50);
    waehle(auswahl(host, 'status'), '');
    await nachBuendel();
    expect(kanal.aufrufe.map((a) => a.query)).toEqual([BEIDE, NUR_STATUS]);
    expect(kanal.aufrufe[0].params).toEqual({ status: null, prio: 'mittel' });
  });
});

describe('dashboard-filter: Zustand je geöffnetem Dokument und Block (AK3)', () => {
  it('ein neu gezeichneter Block beginnt mit der gemerkten Auswahl', () => {
    const tab = {};
    const fenster = fensterMit(tab);
    const erster = dashboardIn();
    einrichten(erster, fenster);
    waehle(auswahl(erster, 'prio'), 'niedrig');
    waehle(auswahl(erster, 'status'), '');

    const zweiter = dashboardIn();
    einrichten(zweiter, fenster);
    expect(auswahl(zweiter, 'prio').value).toBe('niedrig');
    expect(auswahl(zweiter, 'status').value).toBe('');
    // Die Werte stehen an den Kacheln, bevor die erste Abfrage läuft.
    expect(paramsAn(zweiter)[0]).toEqual({ status: null, prio: 'niedrig' });
  });

  it('nach Schließen und erneutem Öffnen gilt wieder die Vorbelegung', () => {
    const fenster = fensterMit({});
    const erster = dashboardIn();
    einrichten(erster, fenster);
    waehle(auswahl(erster, 'prio'), 'hoch');
    // Erneut geöffnet ist ein neues Dokument derselben Datei.
    fenster.panes[0].tabs[0] = {};
    const zweiter = dashboardIn();
    einrichten(zweiter, fenster);
    expect(auswahl(zweiter, 'prio').value).toBe('');
    expect(auswahl(zweiter, 'status').value).toBe('offen');
  });

  it('andere Filter-Namen am selben Platz verfallen auf die Vorbelegung', () => {
    const fenster = fensterMit({});
    const erster = dashboardIn();
    einrichten(erster, fenster);
    waehle(auswahl(erster, 'prio'), 'hoch');
    const zweiter = dashboardIn(BLOCK.replace('!filter prio', '!filter stufe'));
    einrichten(zweiter, fenster);
    expect(auswahl(zweiter, 'stufe').value).toBe('');
  });

  it('die geteilte Ansicht hält je Spalte eine eigene Auswahl', () => {
    const fenster = fensterMit({}, {});
    const links = dashboardIn(BLOCK, 0);
    const rechts = dashboardIn(BLOCK, 1);
    einrichten(links, fenster);
    einrichten(rechts, fenster);
    waehle(auswahl(links, 'prio'), 'hoch');
    const linksNeu = dashboardIn(BLOCK, 0);
    const rechtsNeu = dashboardIn(BLOCK, 1);
    einrichten(linksNeu, fenster);
    einrichten(rechtsNeu, fenster);
    expect(auswahl(linksNeu, 'prio').value).toBe('hoch');
    expect(auswahl(rechtsNeu, 'prio').value).toBe('');
  });

  it('ein Block einer Einbettung gehört zu deren Durchgang mit dem eingebetteten Pfad', () => {
    const host = dashboardIn('Text');
    const einbettung = document.createElement('div');
    einbettung.className = 'wiki-embed-md-body';
    einbettung.innerHTML = renderDashboardBlock(BLOCK, {
      lineStart: 1,
      lineEnd: 20,
      index: 0,
      L: (key) => key,
      enabled: () => true,
      env: { lang: 'de' },
    });
    host.appendChild(einbettung);
    expect(einrichten(host, fensterMit({}))).toBe(0);
    expect(einrichten(einbettung, fensterMit({}), '/raum/Eingebettet.md')).toBe(1);
  });
});

describe('dashboard-filter: Werte beim Index-Nachzug (AK5, verschwundener Wert)', () => {
  it('ein neuer Wert erscheint ohne erneutes Öffnen, die Auswahl bleibt', async () => {
    kanal.werte.set('status', ['offen', 'zu']);
    const host = dashboardIn();
    einrichten(host, fensterMit({}));
    await warteAufWerte();
    const status = auswahl(host, 'status');
    waehle(status, 'zu');

    kanal.werte.set('status', ['neu', 'offen', 'zu']);
    vi.useFakeTimers();
    document.dispatchEvent(new CustomEvent(PUFFER_EREIGNIS));
    vi.advanceTimersByTime(BUENDEL_MS);
    vi.useRealTimers();
    await warteAufWerte(() => optionen(status).includes('neu'));
    expect(optionen(status)).toEqual(['', 'neu', 'offen', 'zu']);
    expect(status.value).toBe('zu');
  });

  it('ein verschwundener Wert bleibt gewählt, bis eine neue Wahl ihn entfernt', async () => {
    kanal.werte.set('status', ['offen', 'zu']);
    const host = dashboardIn();
    einrichten(host, fensterMit({}));
    await warteAufWerte();
    const status = auswahl(host, 'status');
    waehle(status, 'zu');

    // Der zweite Anstoß: die Index-Invalidierung des Hauptprozesses.
    kanal.werte.set('status', ['offen']);
    vi.useFakeTimers();
    kanal.invalidierung();
    vi.advanceTimersByTime(BUENDEL_MS);
    vi.useRealTimers();
    await warteAufWerte();
    expect(optionen(status)).toEqual(['', 'offen', 'zu']);
    expect(status.value).toBe('zu');

    waehle(status, 'offen');
    expect(optionen(status)).toEqual(['', 'offen']);
  });

  it('das Puffer-Ereignis trägt denselben Namen wie seine Quelle im Editor', () => {
    const quelle = readFileSync(
      path.join(dir, '../../../src/renderer/modules/editor/editor.js'),
      'utf8',
    );
    expect(quelle).toContain(`export const INDEX_OVERLAY_EVENT = '${PUFFER_EREIGNIS}';`);
  });
});
