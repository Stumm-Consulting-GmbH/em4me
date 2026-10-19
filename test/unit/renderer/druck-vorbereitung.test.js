// @vitest-environment jsdom
// 4T-001478 (Epic 3E-000177): Die gemeinsame Druck-Vorbereitung von PDF-Ausgabe
// und Druck.
//
// Geprueft wird die Klammer und nur sie: dass der Endpunkt als Uebergabe
// wirkt, dass die Ruecknahme auf JEDEM Ausgang vollstaendig laeuft (Erfolg,
// Fehlschlag, geworfener Fehler, Abbruch im Vorbereitungs-Schritt) und dass
// der Reentranz-Schutz beide Endpunkte gemeinsam sperrt. Was die Klammer
// vorbereitet — Druckbild, Farben, Seitenumbruch — ist unveraenderter Bestand
// und in den E2E-Faellen des PDF-Exports abgesichert; hier stuende es ein
// zweites Mal.
//
// Die Umgebung des Renderers ist ersetzt, weil die Klammer sonst einen
// laufenden Editor, echte Mermaid-Renders und die vier Idle-Barrieren
// braeuchte. Was hier zaehlt, ist die REIHENFOLGE ihrer Aufrufe, nicht ihre
// Wirkung — deshalb schreibt jede Ersatz-Funktion ihren Namen in ein Protokoll.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const protokoll = [];

const paneEls = { content: null };
const state = { activePaneIndex: 0, panes: [{ activeIndex: 0, tabs: [] }] };

vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state,
  getPaneEls: () => paneEls,
}));

vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({
  syncEditorForPane: () => protokoll.push('syncEditor'),
}));

vi.mock('../../../src/renderer/modules/render-mermaid.js', () => ({
  waitForMermaidIdle: async () => protokoll.push('mermaidIdle'),
  rerenderAllMermaidBlocks: async () => protokoll.push('mermaidRerender'),
  // 4T-001487 (Epic 3E-000199): sechste Barriere — die Einbettungen.
  waitForWikiEmbedsIdle: async () => protokoll.push('embedsIdle'),
}));

// 4T-002025 (Epic 3E-000192): helles Neu-Zeichnen und Barriere der Diagramme,
// je mit der Spalte, die sie bekommen, und dem Versprechen des Neu-Zeichnens.
const diagrammAufrufe = [];
vi.mock('../../../src/renderer/modules/charts/chart-view.js', () => ({
  zeichneDiagrammeFuerAusgabe: (wurzel) => {
    protokoll.push('chartsRedraw');
    const gezeichnet = Promise.resolve();
    diagrammAufrufe.push({ art: 'zeichnen', wurzel, gezeichnet });
    return gezeichnet;
  },
  warteAufDiagrammeDerAusgabe: async (wurzel, gezeichnet) => {
    protokoll.push('chartsIdle');
    diagrammAufrufe.push({ art: 'warten', wurzel, gezeichnet });
  },
  // 4T-002294: Ohne Hell-Zwang wartet die Barriere auf die laufenden Lesungen.
  waitForChartsIdle: () => {
    protokoll.push('chartsReadsIdle');
    const gelesen = Promise.resolve();
    diagrammAufrufe.push({ art: 'lesungen', wurzel: null, gezeichnet: gelesen });
    return gelesen;
  },
}));

vi.mock('../../../src/renderer/modules/query/frontmatter-query-view.js', () => ({
  waitForFrontmatterQueriesIdle: async () => protokoll.push('frontmatterIdle'),
}));

vi.mock('../../../src/renderer/modules/calendar/journal-nav-view.js', () => ({
  waitForJournalNavIdle: async () => protokoll.push('journalNavIdle'),
}));

vi.mock('../../../src/renderer/modules/calendar/journal-timeline-view.js', () => ({
  waitForJournalTimelineIdle: async () => protokoll.push('journalTimelineIdle'),
}));

vi.mock('../../../src/renderer/modules/query/perspective-script-view.js', () => ({
  waitForPerspectiveScriptsIdle: async () => protokoll.push('scriptsIdle'),
}));

// 4T-002054: gekürzte Datentabellen für die Dauer der Ausgabe mit allen Zeilen,
// je mit der Spalte und dem Pfad, die sie bekommen; die Rücknahme protokolliert.
const datentabellenAufrufe = [];
vi.mock('../../../src/renderer/modules/query/perspective-datatable-view.js', () => ({
  zeichneGekuerzteDatentabellenVoll: (wurzel, pfad) => {
    protokoll.push('datatablesFull');
    datentabellenAufrufe.push({ wurzel, pfad });
    return () => protokoll.push('datatablesBack');
  },
}));

// 4T-002188 (Epic 3E-000347): Der Ersatz haelt den uebergebenen Text fest, damit
// die Faelle zu den privaten Kommentaren pruefen koennen, was in den Block geht.
const blockTexte = [];
vi.mock('../../../src/renderer/modules/views/pdf-source-print.js', () => ({
  buildPdfSourcePrintElement: (text) => {
    protokoll.push('sourcePrintBlock');
    blockTexte.push(text);
    const el = document.createElement('div');
    el.className = 'pdf-source-print';
    el.textContent = text;
    return el;
  },
}));

let kommentareAn = true;
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => (id === 'comments' ? kommentareAn : true),
}));

vi.mock('../../../src/renderer/modules/color-schemes.js', () => ({
  pdfColorOverrides: () => ({ '--bg': '#ffffff', '--fg': '#111111' }),
}));

vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  syncToolbarToActiveTab: () => protokoll.push('syncToolbar'),
}));

vi.mock('../../../src/renderer/modules/views/pane-render.js', () => ({
  renderPaneContent: () => protokoll.push('renderPane'),
}));

vi.mock('../../../src/renderer/modules/views/view-modes.js', () => ({
  applyContentViewClass: (_el, klasse) => protokoll.push(`viewClass:${klasse}`),
}));

// 4T-002162 (Nachbesserung vom 2026-10-11): Neu-Aufbau der Folien-Fläche und
// Fokus nach der Rücknahme, je mit der Spalte, die sie bekommen.
vi.mock('../../../src/renderer/modules/presentation/presentation-pane.js', () => ({
  renderPresentation: (paneIdx, optionen) =>
    protokoll.push(`renderPresentation:${paneIdx}:${JSON.stringify(optionen ?? null)}`),
  fokussierePraesentation: (paneIdx) => protokoll.push(`fokusFolien:${paneIdx}`),
}));

const { withPrintPreparation, isPrintPreparationRunning } =
  await import('../../../src/renderer/modules/views/print-preparation.js');

const root = document.documentElement;

function setzeTab(felder = {}) {
  const tab = { viewMode: 'rendered', content: '# Titel', path: 'C:\\A\\B.md', ...felder };
  state.panes[0].tabs = [tab];
  state.panes[0].activeIndex = 0;
  return tab;
}

// Die vier Barrieren, die nur im gerenderten Druck laufen, in der Reihenfolge
// des erhobenen Ablaufs (4T-001416, Schritt 4).
const BARRIEREN = [
  'mermaidIdle',
  'mermaidRerender',
  'frontmatterIdle',
  'journalNavIdle',
  'journalTimelineIdle',
  'scriptsIdle',
  // 4T-001487 (Epic 3E-000199): die sechste.
  'embedsIdle',
  // 4T-002025 (Epic 3E-000192): Diagramme hell neu zeichnen und ihre Lesungen
  // abwarten, als letzte vor dem Reflow-Wait.
  'chartsRedraw',
  'chartsIdle',
];

beforeEach(() => {
  protokoll.length = 0;
  diagrammAufrufe.length = 0;
  datentabellenAufrufe.length = 0;
  blockTexte.length = 0;
  kommentareAn = true;
  paneEls.content = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(paneEls.content);
  root.removeAttribute('data-theme');
  root.className = '';
  root.style.cssText = '';
  state.activePaneIndex = 0;
  setzeTab();
});

describe('withPrintPreparation — der Endpunkt als Uebergabe (AK1)', () => {
  it('ruft den Endpunkt mit dem Ergebnis des Vorbereitungs-Schritts', async () => {
    const gesehen = [];
    const ergebnis = await withPrintPreparation({
      prepare: async (tab) => ({ path: `${tab.path}.pdf` }),
      output: async (kontext) => {
        gesehen.push(kontext);
        return { ok: true };
      },
    });
    expect(ergebnis).toEqual({ ok: true });
    expect(gesehen).toEqual([{ path: 'C:\\A\\B.md.pdf' }]);
  });

  it('kommt ohne Vorbereitungs-Schritt aus — der Druck hat keinen', async () => {
    const ergebnis = await withPrintPreparation({ output: async () => ({ ok: true }) });
    expect(ergebnis).toEqual({ ok: true });
  });

  it('reicht den Fehler des Endpunkts weiter, statt ihn zu schlucken', async () => {
    const ergebnis = await withPrintPreparation({
      output: async () => ({ ok: false, error: 'Drucker nicht erreichbar' }),
    });
    expect(ergebnis).toEqual({ ok: false, error: 'Drucker nicht erreichbar' });
  });
});

describe('withPrintPreparation — Ruecknahme auf jedem Ausgang (AK3)', () => {
  async function pruefeVollstaendigeRuecknahme() {
    expect(root.classList.contains('printing')).toBe(false);
    expect(document.body.classList.contains('printing')).toBe(false);
    expect(document.body.classList.contains('printing-source')).toBe(false);
    expect(root.getAttribute('data-theme')).toBeNull();
    expect(root.style.getPropertyValue('--bg')).toBe('');
    expect(paneEls.content.querySelector('.pdf-source-print')).toBeNull();
    expect(isPrintPreparationRunning()).toBe(false);
  }

  it('nach dem Erfolg', async () => {
    await withPrintPreparation({ output: async () => ({ ok: true }) });
    await pruefeVollstaendigeRuecknahme();
  });

  it('nach einem gemeldeten Fehlschlag', async () => {
    await withPrintPreparation({ output: async () => ({ ok: false, error: 'x' }) });
    await pruefeVollstaendigeRuecknahme();
  });

  it('nach einem geworfenen Fehler — und der Fehler wird gemeldet, nicht geworfen', async () => {
    const ergebnis = await withPrintPreparation({
      output: async () => {
        throw new Error('Fenster weg');
      },
    });
    expect(ergebnis).toEqual({ ok: false, error: 'Fenster weg' });
    await pruefeVollstaendigeRuecknahme();
  });

  it('nach dem Abbruch im Vorbereitungs-Schritt — still, ohne Endpunkt', async () => {
    let gerufen = false;
    const ergebnis = await withPrintPreparation({
      prepare: async () => null,
      output: async () => {
        gerufen = true;
        return { ok: true };
      },
    });
    expect(ergebnis).toEqual({ ok: false, canceled: true });
    expect(gerufen).toBe(false);
    // Der Abbruch verlaesst die Klammer, bevor irgendein Print-Zustand steht.
    expect(protokoll).toEqual([]);
    await pruefeVollstaendigeRuecknahme();
  });

  it('stellt ein vorhandenes dunkles Theme wieder her', async () => {
    root.setAttribute('data-theme', 'dark');
    let themeImLauf = null;
    await withPrintPreparation({
      output: async () => {
        themeImLauf = root.getAttribute('data-theme');
        return { ok: true };
      },
    });
    expect(themeImLauf).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('stellt den Ansichts-Modus wieder her, den es fuer den Druck getauscht hat', async () => {
    const tab = setzeTab({ viewMode: 'split' });
    let modusImLauf = null;
    await withPrintPreparation({
      output: async () => {
        modusImLauf = tab.viewMode;
        return { ok: true };
      },
    });
    expect(modusImLauf).toBe('rendered');
    expect(tab.viewMode).toBe('split');
    expect(protokoll).toContain('viewClass:view-rendered');
    expect(protokoll).toContain('viewClass:view-split');
    expect(protokoll).toContain('syncEditor');
    expect(protokoll).toContain('syncToolbar');
  });
});

// 4T-002162 (Nachbesserung in der Release-Strecke vom 2026-10-11): Der
// Zwischenschritt über die Lese-Ansicht leert die Folien-Fläche
// (raeumePraesentationAuf in renderPaneContent). Ohne Neu-Aufbau fehlte sie nach
// jedem Export, Druck und PDF aus der Präsentation (Ablauf-Fälle PR-10, PR-11).
describe('withPrintPreparation — Rücknahme aus der Präsentation', () => {
  function folienEreignisse() {
    return protokoll.filter(
      (e) => e.startsWith('renderPresentation:') || e.startsWith('fokusFolien:'),
    );
  }

  it('baut die Folien-Fläche nach der Rücknahme genau einmal neu, ohne Wahl an der Schreibmarke', async () => {
    const tab = setzeTab({ viewMode: 'presentation' });
    await withPrintPreparation({
      output: async () => {
        protokoll.push('ENDPUNKT');
        return { ok: true };
      },
    });
    expect(tab.viewMode).toBe('presentation');
    expect(folienEreignisse()).toEqual(['renderPresentation:0:null']);
    // Nach dem Endpunkt, nach dem Editor-Abgleich der Rücknahme und vor dem
    // Leisten-Abgleich, der die Vorführung prüft.
    const ruecknahme = protokoll.slice(protokoll.indexOf('ENDPUNKT') + 1);
    expect(ruecknahme.indexOf('viewClass:view-presentation')).toBeGreaterThanOrEqual(0);
    expect(ruecknahme.indexOf('syncEditor')).toBeLessThan(
      ruecknahme.indexOf('renderPresentation:0:null'),
    );
    expect(ruecknahme.indexOf('renderPresentation:0:null')).toBeLessThan(
      ruecknahme.indexOf('syncToolbar'),
    );
  });

  it('auch nach einem geworfenen Fehler des Endpunkts', async () => {
    setzeTab({ viewMode: 'presentation' });
    await withPrintPreparation({
      output: async () => {
        throw new Error('Fenster weg');
      },
    });
    expect(folienEreignisse()).toEqual(['renderPresentation:0:null']);
  });

  it('gibt der Fläche den Fokus zurück, wenn sie ihn vor dem Lauf hatte', async () => {
    setzeTab({ viewMode: 'presentation' });
    paneEls.presentationEl = document.createElement('div');
    const flaeche = document.createElement('div');
    flaeche.tabIndex = 0;
    paneEls.presentationEl.appendChild(flaeche);
    document.body.appendChild(paneEls.presentationEl);
    flaeche.focus();
    try {
      await withPrintPreparation({ output: async () => ({ ok: true }) });
    } finally {
      delete paneEls.presentationEl;
    }
    expect(folienEreignisse()).toEqual(['renderPresentation:0:null', 'fokusFolien:0']);
  });

  it('lässt den Fokus, wo er war, wenn die Fläche ihn vor dem Lauf nicht hatte', async () => {
    setzeTab({ viewMode: 'presentation' });
    paneEls.presentationEl = document.createElement('div');
    document.body.appendChild(paneEls.presentationEl);
    try {
      await withPrintPreparation({ output: async () => ({ ok: true }) });
    } finally {
      delete paneEls.presentationEl;
    }
    expect(folienEreignisse()).toEqual(['renderPresentation:0:null']);
  });

  it('baut nichts, wenn die Spalte vorher in der Lese-Ansicht stand', async () => {
    setzeTab({ viewMode: 'rendered' });
    await withPrintPreparation({ output: async () => ({ ok: true }) });
    expect(folienEreignisse()).toEqual([]);
  });

  it('baut nichts aus der geteilten Ansicht', async () => {
    setzeTab({ viewMode: 'split' });
    await withPrintPreparation({ output: async () => ({ ok: true }) });
    expect(folienEreignisse()).toEqual([]);
  });
});

describe('withPrintPreparation — Reentranz ueber beide Endpunkte (AK4)', () => {
  it('sperrt einen zweiten Lauf, solange der erste laeuft', async () => {
    let zweites = null;
    const erstes = await withPrintPreparation({
      output: async () => {
        expect(isPrintPreparationRunning()).toBe(true);
        zweites = await withPrintPreparation({ output: async () => ({ ok: true }) });
        return { ok: true };
      },
    });
    expect(erstes).toEqual({ ok: true });
    expect(zweites).toEqual({ ok: false, canceled: true });
  });

  it('gibt nach einem geworfenen Fehler wieder frei', async () => {
    await withPrintPreparation({
      output: async () => {
        throw new Error('Bruch');
      },
    });
    const danach = await withPrintPreparation({ output: async () => ({ ok: true }) });
    expect(danach).toEqual({ ok: true });
  });
});

describe('withPrintPreparation — Barrieren und Ansichts-Regel (AK5)', () => {
  it('durchlaeuft die sechs Warte-Schritte in der erhobenen Reihenfolge', async () => {
    await withPrintPreparation({
      output: async () => {
        protokoll.push('ENDPUNKT');
        return { ok: true };
      },
    });
    const bisZumEndpunkt = protokoll.slice(0, protokoll.indexOf('ENDPUNKT'));
    expect(bisZumEndpunkt.filter((e) => BARRIEREN.includes(e))).toEqual(BARRIEREN);
  });

  // 4T-002025: Die Diagramme zeichnen hinter der Einbettungs-Barriere (sie
  // stehen auch in Einbettungen), dann wartet ihre Barriere, dann der Reflow.
  // Zurück geht es über ihren Farb-Beobachter, nicht über einen eigenen Aufruf.
  it('Diagramme: Einbettungs-Barriere, Neu-Zeichnen, Diagramm-Barriere, Reflow; kein Aufruf danach', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      if (!protokoll.includes('reflow')) protokoll.push('reflow');
      return setTimeout(cb, 0);
    });
    try {
      root.setAttribute('data-theme', 'dark');
      await withPrintPreparation({
        output: async () => {
          protokoll.push('ENDPUNKT');
          return { ok: true };
        },
      });
    } finally {
      raf.mockRestore();
    }
    const folge = protokoll.filter((e) =>
      ['embedsIdle', 'chartsRedraw', 'chartsIdle', 'reflow', 'ENDPUNKT'].includes(e),
    );
    expect(folge).toEqual(['embedsIdle', 'chartsRedraw', 'chartsIdle', 'reflow', 'ENDPUNKT']);
    const nachDemEndpunkt = protokoll.slice(protokoll.indexOf('ENDPUNKT') + 1);
    expect(nachDemEndpunkt).not.toContain('chartsRedraw');
  });

  // Durchsicht vom 2026-09-30 (D2): Gezeichnet und abgewartet wird allein in
  // der gedruckten Spalte, und die Barriere wartet auf das Neu-Zeichnen, das
  // unmittelbar davor begann.
  it('Diagramme: Neu-Zeichnen und Barriere bekommen die gedruckte Spalte, nicht das Fenster', async () => {
    await withPrintPreparation({ output: async () => ({ ok: true }) });
    expect(diagrammAufrufe.map((a) => a.art)).toEqual(['zeichnen', 'warten']);
    for (const a of diagrammAufrufe) expect(a.wurzel).toBe(paneEls.content);
    expect(diagrammAufrufe[1].gezeichnet).toBe(diagrammAufrufe[0].gezeichnet);
  });

  it('stellt Mermaid nach dem Lauf in das aktive Theme zurueck', async () => {
    // Bestandsverhalten: Das Zurueckstellen entfaellt nur, wenn das Theme
    // ohnehin hell WAR — hier ist keines gesetzt, also laeuft es.
    await withPrintPreparation({
      output: async () => {
        protokoll.push('ENDPUNKT');
        return { ok: true };
      },
    });
    const nachDemEndpunkt = protokoll.slice(protokoll.indexOf('ENDPUNKT') + 1);
    expect(nachDemEndpunkt).toContain('mermaidRerender');
  });

  it('stellt Mermaid nicht zurueck, wenn das Theme ohnehin hell war', async () => {
    root.setAttribute('data-theme', 'light');
    await withPrintPreparation({
      output: async () => {
        protokoll.push('ENDPUNKT');
        return { ok: true };
      },
    });
    const nachDemEndpunkt = protokoll.slice(protokoll.indexOf('ENDPUNKT') + 1);
    expect(nachDemEndpunkt).not.toContain('mermaidRerender');
  });

  it('die Quelltext-Ansicht baut den Print-Block und laesst Mermaid aus', async () => {
    setzeTab({ viewMode: 'source' });
    let blockImLauf = null;
    await withPrintPreparation({
      output: async () => {
        blockImLauf = paneEls.content.querySelector('.pdf-source-print');
        expect(document.body.classList.contains('printing-source')).toBe(true);
        return { ok: true };
      },
    });
    expect(blockImLauf).not.toBeNull();
    expect(protokoll).toContain('sourcePrintBlock');
    for (const barriere of BARRIEREN) expect(protokoll).not.toContain(barriere);
    expect(paneEls.content.querySelector('.pdf-source-print')).toBeNull();
  });
});

// 4T-002294 (Epic 3E-000349): Die PowerPoint-Datei des Foliensatzes zeigt,
// was der Beamer zeigt. Mit `hellErzwingen: false` bleiben Theme und
// Zeichnung der Ansicht stehen; Druck-Zustand, Barrieren und Rücknahme bleiben.
describe('withPrintPreparation — Option hellErzwingen', () => {
  async function lauf(steps = {}) {
    const imLauf = {};
    await withPrintPreparation({
      ...steps,
      output: async () => {
        imLauf.theme = root.getAttribute('data-theme');
        imLauf.bg = root.style.getPropertyValue('--bg');
        imLauf.printing = document.body.classList.contains('printing');
        protokoll.push('ENDPUNKT');
        return { ok: true };
      },
    });
    return imLauf;
  }

  it('Vorgabe: Hell wird erzwungen, Mermaid und Diagramme hell neu gezeichnet', async () => {
    root.setAttribute('data-theme', 'dark');
    const imLauf = await lauf();
    expect(imLauf.theme).toBe('light');
    expect(imLauf.bg).toBe('#ffffff');
    const vorher = protokoll.slice(0, protokoll.indexOf('ENDPUNKT'));
    expect(vorher).toContain('mermaidRerender');
    expect(vorher).toContain('chartsRedraw');
    expect(vorher).not.toContain('chartsReadsIdle');
    expect(protokoll.slice(protokoll.indexOf('ENDPUNKT') + 1)).toContain('mermaidRerender');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('hellErzwingen: true verhält sich wie die Vorgabe', async () => {
    root.setAttribute('data-theme', 'dark');
    const imLauf = await lauf({ hellErzwingen: true });
    expect(imLauf.theme).toBe('light');
    expect(protokoll).toContain('chartsRedraw');
  });

  it('false: data-theme und Farb-Variablen bleiben, nichts wird neu gezeichnet', async () => {
    root.setAttribute('data-theme', 'dark');
    const imLauf = await lauf({ hellErzwingen: false });
    expect(imLauf.theme).toBe('dark');
    expect(imLauf.bg).toBe('');
    expect(imLauf.printing).toBe(true);
    expect(protokoll).not.toContain('mermaidRerender');
    expect(protokoll).not.toContain('chartsRedraw');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--bg')).toBe('');
  });

  it('false: ohne gesetztes Theme wird keines gesetzt, auch nicht in der Rücknahme', async () => {
    const imLauf = await lauf({ hellErzwingen: false });
    expect(imLauf.theme).toBeNull();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('false: die Barrieren laufen; die Diagramm-Barriere wartet auf die Lesungen der Spalte', async () => {
    root.setAttribute('data-theme', 'dark');
    await lauf({ hellErzwingen: false });
    const vorher = protokoll.slice(0, protokoll.indexOf('ENDPUNKT'));
    const erwartet = BARRIEREN.filter((b) => b !== 'mermaidRerender' && b !== 'chartsRedraw');
    expect(vorher.filter((e) => erwartet.includes(e))).toEqual(erwartet);
    expect(vorher.indexOf('chartsReadsIdle')).toBeGreaterThan(vorher.indexOf('embedsIdle'));
    expect(vorher.indexOf('chartsReadsIdle')).toBeLessThan(vorher.indexOf('chartsIdle'));
    expect(diagrammAufrufe.map((a) => a.art)).toEqual(['lesungen', 'warten']);
    expect(diagrammAufrufe[1].wurzel).toBe(paneEls.content);
    expect(diagrammAufrufe[1].gezeichnet).toBe(diagrammAufrufe[0].gezeichnet);
  });

  it('false: vollständige Rücknahme des Druck-Zustands, auch nach einem Fehler', async () => {
    root.setAttribute('data-theme', 'dark');
    const ergebnis = await withPrintPreparation({
      hellErzwingen: false,
      output: async () => {
        throw new Error('Fenster weg');
      },
    });
    expect(ergebnis).toEqual({ ok: false, error: 'Fenster weg' });
    expect(root.classList.contains('printing')).toBe(false);
    expect(document.body.classList.contains('printing')).toBe(false);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(isPrintPreparationRunning()).toBe(false);
  });
});

// 4T-002054 (Story 4S-000163, AK10): Die Ausgabe zeigt alle Zeilen einer
// Datentabelle. Neu gezeichnet wird hinter der Einbettungs-Barriere in der
// gedruckten Spalte, zurückgestellt auf jedem Ausgang nach dem Endpunkt.
describe('withPrintPreparation — gekürzte Datentabellen mit allen Zeilen (4T-002054)', () => {
  async function laufMit(ausgang) {
    return withPrintPreparation({
      output: async () => {
        protokoll.push('ENDPUNKT');
        return ausgang();
      },
    });
  }

  it('zeichnet hinter der Einbettungs-Barriere in der gedruckten Spalte, vor dem Endpunkt', async () => {
    await laufMit(() => ({ ok: true }));
    const folge = protokoll.filter((e) =>
      ['embedsIdle', 'datatablesFull', 'chartsRedraw', 'ENDPUNKT', 'datatablesBack'].includes(e),
    );
    expect(folge).toEqual([
      'embedsIdle',
      'datatablesFull',
      'chartsRedraw',
      'ENDPUNKT',
      'datatablesBack',
    ]);
    expect(datentabellenAufrufe).toEqual([{ wurzel: paneEls.content, pfad: 'C:\\A\\B.md' }]);
  });

  it('stellt nach einem gemeldeten Fehlschlag und nach einem geworfenen Fehler zurück', async () => {
    await laufMit(() => ({ ok: false, error: 'x' }));
    expect(protokoll.filter((e) => e === 'datatablesBack')).toHaveLength(1);
    protokoll.length = 0;
    await laufMit(() => {
      throw new Error('Fenster weg');
    });
    expect(protokoll.filter((e) => e === 'datatablesBack')).toHaveLength(1);
  });

  it('läuft nicht beim Quelltext-Druck und nicht nach dem Abbruch im Vorbereitungs-Schritt', async () => {
    setzeTab({ viewMode: 'source' });
    await laufMit(() => ({ ok: true }));
    expect(protokoll).not.toContain('datatablesFull');
    expect(protokoll).not.toContain('datatablesBack');
    setzeTab();
    protokoll.length = 0;
    await withPrintPreparation({ prepare: async () => null, output: async () => ({ ok: true }) });
    expect(protokoll).toEqual([]);
  });
});

// 4T-002188 (Epic 3E-000347): PDF-Export und Druck aus der Quelltext-Ansicht
// lassen die privaten %%-Kommentare weg, wie der HTML-Export. Die Regel selbst
// (zeilentreu, Frontmatter und Code-Spannen unberuehrt) prueft html-export.test.js
// am gemeinsamen Helfer; hier zaehlt, dass die Klammer ihn nutzt.
describe('withPrintPreparation — private Kommentare im Quelltext-Block', () => {
  const TEXT =
    '# Kopf\nVorher %% privat eins %% nachher\n%% mehrzeilig\ngeheim zwei\nEnde %%\nSchluss';

  async function blockImLauf() {
    let text = null;
    await withPrintPreparation({
      output: async () => {
        text = paneEls.content.querySelector('.pdf-source-print').textContent;
        return { ok: true };
      },
    });
    return text;
  }

  it('bei aktiver Erweiterung enthält der Block den Kommentar-Text nicht', async () => {
    setzeTab({ viewMode: 'source', content: TEXT });
    const text = await blockImLauf();
    expect(text).not.toContain('privat eins');
    expect(text).not.toContain('geheim zwei');
    expect(text).toContain('Vorher  nachher');
    expect(text.split('\n')).toHaveLength(TEXT.split('\n').length);
    expect(blockTexte).toEqual([text]);
  });

  it('bei abgeschalteter Erweiterung bleibt der Kommentar-Text als gewöhnlicher Text', async () => {
    kommentareAn = false;
    setzeTab({ viewMode: 'source', content: TEXT });
    expect(await blockImLauf()).toBe(TEXT);
  });
});

describe('withPrintPreparation — wer ueberhaupt gedruckt wird', () => {
  it('der Einstellungs-Reiter ist ausgenommen', async () => {
    setzeTab({ systemPage: true });
    let gerufen = false;
    const ergebnis = await withPrintPreparation({
      output: async () => {
        gerufen = true;
        return { ok: true };
      },
    });
    expect(ergebnis).toEqual({ ok: false, canceled: true });
    expect(gerufen).toBe(false);
  });

  it('ohne aktiven Reiter geschieht nichts', async () => {
    state.panes[0].tabs = [];
    state.panes[0].activeIndex = -1;
    const ergebnis = await withPrintPreparation({ output: async () => ({ ok: true }) });
    expect(ergebnis).toEqual({ ok: false, canceled: true });
  });
});
