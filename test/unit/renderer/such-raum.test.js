// @vitest-environment jsdom
// 4T-001560 (Epic 3E-000280): Die Bestimmung des Suchraums.
//
// Geprüft wird die Rangfolge als Ganzes und nicht nur der neue Fall: Der
// Eingriff dieses Tasks ergänzt den Zustand OHNE Reiter, und die Zusicherung
// lautet, dass alles darunter unberührt bleibt. Ein Prüffall, der nur den
// neuen Fall misst, könnte eine Verschiebung der übrigen Rangfolge nicht von
// einem Erfolg unterscheiden.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const {
  bindSearchUi,
  determineSearchScope,
  nextMatch,
  performSearch,
  prevMatch,
  refreshSearchIfVisible,
  search,
  setCurrentMatch,
} = await import('../../../src/renderer/modules/search/search.js');
const {
  raumIndex,
  registriereLieferant,
  setzeRaumIndex,
  sprungVormerken,
  starteRaumLauf,
  stoppeEingabeDrossel,
  vorwaertsZiel,
} = await import('../../../src/renderer/modules/search/search-run.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const BEREICH = 'C:/Bereich';

function setzeReiter(tab) {
  state.panes[0].tabs = tab ? [tab] : [];
  state.panes[0].activeIndex = tab ? 0 : -1;
  state.activePaneIndex = 0;
}

function dokument(zusatz = {}) {
  return { path: `${BEREICH}/a.md`, content: 'Inhalt', viewMode: 'rendered', ...zusatz };
}

beforeEach(() => {
  state.areaPath = null;
  setzeReiter(null);
});

describe('Suchraum ohne offenen Reiter (AK1, AK5)', () => {
  it('nimmt den gebundenen Bereich, wenn kein Reiter offen ist', () => {
    // Der Fall des Tasks: Bereich gebunden, alle Dateien geschlossen.
    state.areaPath = BEREICH;
    expect(determineSearchScope()).toBe('area');
  });

  it('bleibt ohne Bereich und ohne Reiter beim bisherigen Verhalten', () => {
    expect(determineSearchScope()).toBe('rendered');
  });
});

describe('Rangfolge mit offenem Reiter bleibt unberuehrt (AK4)', () => {
  it('nimmt weiterhin den Bereich fuer eine Datei darin', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument());
    expect(determineSearchScope()).toBe('area');
  });

  it('laesst die Einstellungs-Seite vor dem Bereich stehen', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument({ systemPage: 'settings' }));
    expect(determineSearchScope()).toBe('settings');
  });

  it('laesst die Handbuch-Seite in der Lese-Ansicht vor dem Bereich stehen', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument({ manualPage: 'overview', viewMode: 'rendered' }));
    expect(determineSearchScope()).toBe('manual');
  });

  it('sucht in einer losen Datei weiterhin in ihr selbst', () => {
    setzeReiter(dokument({ viewMode: 'source' }));
    expect(determineSearchScope()).toBe('source');
  });

  it('nimmt fuer eine Datei AUSSERHALB des Bereichs nicht den Bereich', () => {
    // Die Grenz-Pruefung des Bestands bleibt maßgeblich: Ein loser Reiter
    // neben einem gebundenen Bereich sucht in sich selbst.
    state.areaPath = BEREICH;
    setzeReiter(dokument({ path: 'C:/woanders/b.md', viewMode: 'source' }));
    expect(determineSearchScope()).toBe('source');
  });
});

// 4T-001893 (Epic 3E-000324): Die Mindmap-Ansicht ist ein eigener Suchraum, in
// beiden Lagen des Dokuments (Entscheidung des Product Owners vom 2026-09-23,
// Weg A). Vorher fiel der Modus auf 'rendered' und zählte Treffer der dort
// ausgeblendeten Lese-Ansicht — der bestätigte Befund.
describe('Suchraum der Mindmap-Ansicht (4T-001893)', () => {
  it('eine lose Datei in der Mindmap-Ansicht sucht in der Karte', () => {
    setzeReiter(dokument({ path: 'C:/woanders/b.md', viewMode: 'mindmap' }));
    expect(determineSearchScope()).toBe('mindmap');
  });

  it('eine Datei im geöffneten Bereich sucht in der Mindmap-Ansicht ebenfalls in der Karte', () => {
    state.areaPath = BEREICH;
    setzeReiter(dokument({ viewMode: 'mindmap' }));
    expect(determineSearchScope()).toBe('mindmap');
  });

  it('die Einstellungs-Seite bleibt vor der Mindmap-Regel', () => {
    setzeReiter(dokument({ systemPage: 'settings', viewMode: 'mindmap' }));
    expect(determineSearchScope()).toBe('settings');
  });

  it('AK6: die übrigen Ansichts-Modi behalten ihren Suchraum, ohne und mit Bereich', () => {
    const lose = { path: 'C:/woanders/b.md' };
    const erwartet = {
      source: 'source',
      split: 'source',
      live: 'source',
      rendered: 'rendered',
      canvas: 'rendered',
      kanban: 'rendered',
    };
    for (const [modus, raum] of Object.entries(erwartet)) {
      state.areaPath = null;
      setzeReiter(dokument({ ...lose, viewMode: modus }));
      expect(determineSearchScope(), modus).toBe(raum);
      state.areaPath = BEREICH;
      setzeReiter(dokument({ viewMode: modus }));
      expect(determineSearchScope(), `${modus} im Bereich`).toBe('area');
    }
  });
});

// 4T-002107: Der erste Vorwärts-Sprung nach einer Neu-Ermittlung zeigt den als
// aktuell markierten Treffer, statt ihn zu überspringen (Entscheidung des
// Product Owners vom 2026-10-03). Die Neu-Ermittlung selbst bewegt weiterhin
// nichts (B-10, 4T-000904).
describe('4T-002107: erster Vorwärts-Sprung nach einer Neu-Ermittlung', () => {
  // Die Bedienelemente der Suchleiste, soweit search.js sie anfasst.
  function leiste() {
    if (document.querySelector('#search-count')) return;
    const ids = ['search-bar', 'search-count', 'search-scope', 'regex-help-popover'];
    const knoepfe = [
      'btn-search-replace',
      'btn-search-replace-all',
      'btn-search-case',
      'btn-search-regex',
      'btn-search-help',
      'btn-search-prev',
      'btn-search-next',
      'btn-search-close',
    ];
    document.body.insertAdjacentHTML(
      'beforeend',
      ids.map((id) => `<div id="${id}"></div>`).join('') +
        knoepfe.map((id) => `<button id="${id}"></button>`).join('') +
        '<input id="search-input"><input id="search-replace"><dl id="regex-help-list"></dl>',
    );
  }

  // Drei Treffer der Lese-Ansicht, wie highlightInContainer sie anlegt; der
  // erste ist nach der Neu-Ermittlung markiert, aber nicht angesprungen.
  let gerollt = [];
  function treffer() {
    leiste();
    gerollt = [];
    const marks = [1, 2, 3].map((n) => {
      const m = document.createElement('mark');
      m.className = 'mdv-match';
      m.textContent = `Treffer ${n}`;
      m.scrollIntoView = () => gerollt.push(n);
      document.body.appendChild(m);
      return m;
    });
    search.visible = true;
    search.query = 'Treffer';
    search.scope = 'rendered';
    search.matches = marks;
    search.currentIndex = 0;
    search.angesprungen = false;
    return marks;
  }
  const zaehler = () => document.querySelector('#search-count').textContent;

  it('4T-002107: vorwaertsZiel zeigt zuerst den markierten Treffer, danach den nächsten', () => {
    expect(vorwaertsZiel(0, 3, false)).toBe(0);
    expect(vorwaertsZiel(0, 3, true)).toBe(1);
    expect(vorwaertsZiel(1, 3, false)).toBe(1);
    expect(vorwaertsZiel(2, 3, true)).toBe(0);
    // Ohne gültigen aktuellen Treffer beginnt der Sprung beim ersten.
    expect(vorwaertsZiel(-1, 3, false)).toBe(0);
    expect(vorwaertsZiel(-1, 3, true)).toBe(0);
    expect(vorwaertsZiel(0, 0, false)).toBe(-1);
  });

  it('4T-002107: Eingabetaste bzw. F3 zeigt zuerst «1 / n» und geht erst dann zu «2 / n»', () => {
    const marks = treffer();
    nextMatch();
    expect(search.currentIndex).toBe(0);
    expect(zaehler()).toBe('1 / 3');
    expect(marks[0].classList.contains('mdv-match-current')).toBe(true);
    expect(gerollt).toEqual([1]);
    nextMatch();
    expect(zaehler()).toBe('2 / 3');
    expect(gerollt).toEqual([1, 2]);
  });

  it('4T-002107: der erste Rückwärts-Sprung geht unverändert zum letzten Treffer', () => {
    treffer();
    prevMatch();
    expect(zaehler()).toBe('3 / 3');
    expect(gerollt).toEqual([3]);
    // Danach ist der Treffer angesprungen: vorwärts geht es zum nächsten.
    nextMatch();
    expect(zaehler()).toBe('1 / 3');
  });

  it('4T-002107: ein schon angesprungener Treffer wird beim nächsten Sprung verlassen', () => {
    treffer();
    search.angesprungen = true;
    nextMatch();
    expect(zaehler()).toBe('2 / 3');
  });

  it('4T-002107: nur eine Neu-Ermittlung setzt «angesprungen» zurück, das Nachziehen nicht', () => {
    leiste();
    search.visible = true;
    search.query = '';
    search.angesprungen = true;
    // Nachziehen (Doc-Änderung, Reiter-Wechsel, Sprung über eine Reiter-Grenze).
    refreshSearchIfVisible();
    expect(search.angesprungen).toBe(true);
    performSearch({ keepCurrent: true });
    expect(search.angesprungen).toBe(true);
    // Options-Schalter: Index behalten, aber neue Treffermenge.
    performSearch({ keepCurrent: true, neuErmittlung: true });
    expect(search.angesprungen).toBe(false);
    // Tippen.
    search.angesprungen = true;
    performSearch();
    expect(search.angesprungen).toBe(false);
  });

  it('4T-002107: eine Neu-Ermittlung rollt nicht (B-10 bleibt gewahrt)', () => {
    treffer();
    setCurrentMatch(0, false);
    expect(gerollt).toEqual([]);
    expect(search.angesprungen).toBe(false);
  });
});

describe('4T-002129: eine gedrosselte Eingabe gilt vor dem Sprung, nicht danach', () => {
  // Dieselben Bedienelemente wie im Abschnitt darüber; angelegt, falls dieser
  // Abschnitt allein läuft.
  function leiste() {
    if (document.querySelector('#search-input')) return;
    const ids = ['search-bar', 'search-count', 'search-scope', 'regex-help-popover'];
    const knoepfe = ['replace', 'replace-all', 'case', 'regex', 'help', 'prev', 'next', 'close'];
    document.body.insertAdjacentHTML(
      'beforeend',
      ids.map((id) => `<div id="${id}"></div>`).join('') +
        knoepfe.map((k) => `<button id="btn-search-${k}"></button>`).join('') +
        '<input id="search-input"><input id="search-replace"><dl id="regex-help-list"></dl>',
    );
  }

  it('4T-002129: stoppeEingabeDrossel hält einen ausstehenden Lauf an und meldet ihn', () => {
    let gelaufen = false;
    const zustand = { debounceTimer: setTimeout(() => (gelaufen = true), 1) };
    expect(stoppeEingabeDrossel(zustand)).toBe(true);
    expect(zustand.debounceTimer).toBe(null);
    expect(stoppeEingabeDrossel(zustand)).toBe(false);
    return new Promise((fertig) => setTimeout(fertig, 20)).then(() => {
      expect(gelaufen).toBe(false);
    });
  });

  it('4T-002129: der Sprung holt den ausstehenden Lauf sofort nach, statt ihn danach laufen zu lassen', () => {
    leiste();
    search.visible = true;
    // Leerer Begriff: performSearch endet nach dem Rücksetzen von «angesprungen»
    // früh, ohne Ansicht; genau dieses Rücksetzen zeigt, dass der Lauf vor dem
    // Sprung stattgefunden hat.
    search.query = '';
    search.matches = [];
    search.angesprungen = true;
    let spaeter = false;
    search.debounceTimer = setTimeout(() => (spaeter = true), 1);
    nextMatch();
    expect(search.debounceTimer).toBe(null);
    expect(search.angesprungen).toBe(false);
    return new Promise((fertig) => setTimeout(fertig, 20)).then(() => {
      expect(spaeter).toBe(false);
    });
  });

  it('4T-002129: ein Eingabe-Ereignis ohne geänderten Begriff plant keinen neuen Lauf', () => {
    leiste();
    bindSearchUi();
    const feld = document.querySelector('#search-input');
    search.visible = true;
    search.query = 'Treffer';
    search.debounceTimer = null;
    feld.value = 'Treffer';
    feld.dispatchEvent(new Event('input'));
    expect(search.debounceTimer).toBe(null);
    feld.value = 'Treffe';
    feld.dispatchEvent(new Event('input'));
    expect(search.query).toBe('Treffe');
    expect(search.debounceTimer).not.toBe(null);
    stoppeEingabeDrossel(search);
  });
});

describe('4T-002129: Sprünge während des Laufs eines Raums werden vorgemerkt', () => {
  // Ein Lieferant, dessen Antwort der Fall selbst freigibt: So steht fest, dass
  // die Sprünge VOR dem Ergebnis kommen. Drei Treffer je Lauf.
  const TREFFER = ['a', 'b', 'c'].map((t) => ({ gruppe: 'g', titel: t }));
  function steuerbarerRaum(name) {
    const freigaben = [];
    registriereLieferant(name, () => new Promise((r) => freigaben.push(r)));
    return (i) => freigaben[i]({ treffer: TREFFER, gruppen: [], abgeschnitten: false });
  }
  const titel = (ziel) => (ziel ? ziel.titel : null);
  // Mit Treffern öffnet der Lauf die Trefferliste; deren Melde- und Speicher-
  // Kanäle fehlen im Stub (Muster sidebar-collapse.test.js).
  beforeEach(() => {
    window.api.reportMenuState = () => {};
    window.api.setSetting = async () => {};
  });

  it('4T-002129: zweimal vorwärts vor dem Ergebnis springt danach zum zweiten Treffer, einmal zum ersten', async () => {
    for (const [spruenge, erwartet] of [
      [[1, 1], 'b'],
      [[1], 'a'],
      [[1, 1, -1], 'a'],
    ]) {
      const raum = `pruefraum-${spruenge.join('')}`;
      const gib = steuerbarerRaum(raum);
      const zustand = { scope: raum, debounceTimer: null, angesprungen: true };
      const ziele = [];
      const lauf = starteRaumLauf(zustand, /x/g, false, true, (z) => ziele.push(titel(z)));
      for (const r of spruenge) expect(sprungVormerken(zustand, r, () => {})).toBe(true);
      gib(0);
      await lauf;
      // Genau EIN Sprung, zum Ziel aller vorgemerkten.
      expect(ziele).toEqual([erwartet]);
      // Danach ist nichts mehr offen: Ein Sprung geht unmittelbar.
      expect(sprungVormerken(zustand, 1, () => {})).toBe(false);
    }
  });

  it('4T-002129: ohne vorgemerkten Sprung bewegt das Ergebnis nichts', async () => {
    const gib = steuerbarerRaum('pruefraum-ruhe');
    const zustand = { scope: 'pruefraum-ruhe', debounceTimer: null, angesprungen: true };
    const ziele = [];
    const lauf = starteRaumLauf(zustand, /x/g, false, true, (z) => ziele.push(titel(z)));
    gib(0);
    await lauf;
    expect(ziele).toEqual([null]);
    expect(zustand.angesprungen).toBe(false);
  });

  it('4T-002129: ein neuer Begriff lässt die Sprünge des älteren Laufs verfallen', async () => {
    const gib = steuerbarerRaum('pruefraum-neu');
    const zustand = { scope: 'pruefraum-neu', debounceTimer: null, angesprungen: false };
    const ziele = [];
    const alt = starteRaumLauf(zustand, /a/g, false, true, (z) => ziele.push(['alt', titel(z)]));
    sprungVormerken(zustand, 1, () => {});
    sprungVormerken(zustand, 1, () => {});
    const neu = starteRaumLauf(zustand, /b/g, false, true, (z) => ziele.push(['neu', titel(z)]));
    sprungVormerken(zustand, 1, () => {});
    gib(0);
    gib(1);
    await Promise.all([alt, neu]);
    expect(ziele).toEqual([['neu', 'a']]);
  });

  it('4T-002129: ein Nachzieh-Lauf merkt nichts vor, und außerhalb eines Raums wird nie vorgemerkt', async () => {
    const gib = steuerbarerRaum('pruefraum-nach');
    const zustand = { scope: 'pruefraum-nach', debounceTimer: null, angesprungen: true };
    const lauf = starteRaumLauf(zustand, /x/g, true, false, () => {});
    expect(sprungVormerken(zustand, 1, () => {})).toBe(false);
    gib(0);
    await lauf;
    expect(zustand.angesprungen).toBe(true);
    const neu = starteRaumLauf(zustand, /y/g, false, true, () => {});
    expect(sprungVormerken({ ...zustand, scope: 'rendered' }, 1, () => {})).toBe(false);
    gib(1);
    await neu;
  });

  // 4T-002216: Ein Nachzieh-Lauf, der VOR einem Sprung beginnt und DANACH
  // ankommt, setzte den Zeiger auf den Stand bei seinem Beginn zurück. Im
  // Ablauf BS-12: Das Öffnen der Trefferliste zieht die Suche nach, die zwei
  // vorgemerkten Sprünge führen zum zweiten Treffer, und das späte Ergebnis
  // des Nachzieh-Laufs warf den Zähler auf «1 / 4» zurück.
  it('4T-002216: ein Nachzieh-Lauf behält den Treffer, der während des Laufs angesprungen wurde', async () => {
    const gib = steuerbarerRaum('pruefraum-zeiger');
    const zustand = { scope: 'pruefraum-zeiger', debounceTimer: null, angesprungen: true };
    const neu = starteRaumLauf(zustand, /x/g, false, true, () => {});
    gib(0);
    await neu;
    expect(raumIndex()).toBe(0);
    const nach = starteRaumLauf(zustand, /x/g, true, false, () => {});
    expect(setzeRaumIndex(1)).toMatchObject({ titel: 'b' });
    gib(1);
    await nach;
    expect(raumIndex()).toBe(1);
  });

  it('4T-002129: eine ausstehende Eingabe wird vor dem Vormerken nachgeholt', () => {
    let gesucht = 0;
    const zustand = { scope: 'rendered', debounceTimer: setTimeout(() => {}, 1000) };
    expect(sprungVormerken(zustand, 1, () => gesucht++)).toBe(false);
    expect(gesucht).toBe(1);
    expect(zustand.debounceTimer).toBe(null);
  });
});
