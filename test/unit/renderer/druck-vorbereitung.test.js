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

vi.mock('../../../src/renderer/modules/views/pdf-source-print.js', () => ({
  buildPdfSourcePrintElement: () => {
    protokoll.push('sourcePrintBlock');
    const el = document.createElement('div');
    el.className = 'pdf-source-print';
    return el;
  },
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
  // 4T-001487 (Epic 3E-000199): die sechste, als letzte vor dem Reflow-Wait.
  'embedsIdle',
];

beforeEach(() => {
  protokoll.length = 0;
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
