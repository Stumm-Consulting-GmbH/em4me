// @vitest-environment jsdom
// 4T-0372 (Epic 3E-0069): Uhr-Panel im Renderer — Registrierung an der
// Panel-Registry, Aufbau der SVG- und Text-Bestandteile aus den Optionen,
// Toggle samt Persistenz und der Aus-Zustand der Erweiterung inklusive
// Timer-Disziplin (Muster test/unit/render/extensions-aus.test.js und
// test/unit/renderer/extension-lifecycle.test.js).
//
// 4T-0636: dazu die Modus-Umschaltleiste — Aufbau der vier Tasten, Wechsel
// des Panel-Inhalts, Persistenz je Spalte und die verschaerfte Timer-Regel
// (Takt nur im Uhr-Modus).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';

// Panel-Markup beider Spalten ergaenzen, BEVOR ein Modul getPaneEls
// aufruft — die Element-Referenzen werden dort pro Pane memoisiert.
for (const pane of document.querySelectorAll('.pane-group')) {
  pane.insertAdjacentHTML(
    'beforeend',
    '<section class="sidebar-section sidebar-clock" hidden>' +
      '<div class="clock-modes"></div>' +
      '<div class="sidebar-section-body"><div class="clock-body"></div></div>' +
      '</section>',
  );
}
document.body.insertAdjacentHTML('beforeend', '<button id="btn-clock"></button>');

const clock = await import('../../../src/renderer/modules/clock-panel.js');
const { sidebarPanelById } = await import('../../../src/renderer/modules/sidebar-layout.js');
const { createEmptyPane, state } = await import('../../../src/renderer/modules/app-state.js');
const lifecycle = await import('../../../src/renderer/modules/extension-lifecycle.js');
// 4T-0679: Erwartungswert des Schrift-Faktors aus derselben Quelle wie das
// Panel, damit eine spaetere Wert-Anpassung nicht doppelt zu pflegen ist.
const { clockScale } = await import('../../../src/shared/clock-options.js');

function body(paneIdx = 0) {
  return document.querySelectorAll('.pane-group')[paneIdx].querySelector('.clock-body');
}

// 4T-0636: Modus-Leiste der Spalte.
function modeBar(paneIdx = 0) {
  return document.querySelectorAll('.pane-group')[paneIdx].querySelector('.clock-modes');
}

// Sichtbarkeit direkt setzen (ohne Toggle-Persistenz) und anwenden.
async function show(paneIdx = 0) {
  state.clock.visibleByPane[paneIdx] = true;
  clock.applyClockVisibility(paneIdx);
}

// 4T-0636: Modus beider Spalten auf den Standard zuruecksetzen. Der Modus
// ueberlebt sonst zwischen Testfaellen (Modul- und State-Zustand).
function resetModes() {
  state.clock.modeByPane[0] = 'clock';
  state.clock.modeByPane[1] = 'clock';
}

// 4T-0636: Die zweite Spalte existiert erst nach dem Aufteilen (state.panes
// startet mit einer Pane). Wer sie im Test braucht, stellt sie her; das
// Panel-Markup beider Spalten liegt oben bereits im DOM.
function withSecondPane() {
  if (state.panes.length < 2) state.panes.push(createEmptyPane());
}

describe('Uhr-Panel: Registrierung und Zugang (4T-0372)', () => {
  it('ist an der Panel-Registry mit Button und Toggle angemeldet', () => {
    const def = sidebarPanelById('clock');
    expect(def).toBeTruthy();
    expect(def.buttonId).toBe('btn-clock');
    expect(def.sectionClass).toBe('sidebar-clock');
    expect(typeof def.toggle).toBe('function');
    expect(typeof def.applyVisibility).toBe('function');
    expect(typeof def.getVisible).toBe('function');
  });
});

describe('Uhr-Panel: Aufbau aus den Optionen (4T-0372)', () => {
  beforeEach(async () => {
    lifecycle.resetExtensionStateForTests();
    resetModes();
    state.clock.visibleByPane[0] = false;
    state.clock.visibleByPane[1] = false;
    clock.applyClockVisibility(0);
    clock.applyClockVisibility(1);
    await clock.setClockOptions(null, { persist: false });
  });

  it('zeigt im Standard analoge Uhr, digitale Zeit und Datum', async () => {
    await show(0);
    expect(body(0).querySelector('svg.clock-face')).toBeTruthy();
    expect(body(0).querySelector('.clock-digital')).toBeTruthy();
    expect(body(0).querySelector('.clock-date')).toBeTruthy();
    // Kalenderwoche ist im Standard aus.
    expect(body(0).querySelector('.clock-week')).toBeNull();
  });

  it('digitale Zeit und Datum tragen Inhalt', async () => {
    await show(0);
    expect(body(0).querySelector('.clock-digital').textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(body(0).querySelector('.clock-date').textContent.length).toBeGreaterThan(0);
  });

  it('abgeschaltete Bestandteile erscheinen nicht', async () => {
    await clock.setClockOptions(
      { showAnalog: false, showDigital: false, showDate: false, showWeek: true },
      { persist: false },
    );
    await show(0);
    expect(body(0).querySelector('svg.clock-face')).toBeNull();
    expect(body(0).querySelector('.clock-digital')).toBeNull();
    expect(body(0).querySelector('.clock-date')).toBeNull();
    // Die Kalenderwochen-Zeile entsteht; ihr Wortlaut haengt am i18n-Katalog
    // (in dieser Umgebung nicht geladen), die Wochen-Rechnung selbst deckt
    // clock-options.test.js ab.
    expect(body(0).querySelector('.clock-week')).toBeTruthy();
  });

  it('Sekundenzeiger folgt seiner Option', async () => {
    await show(0);
    expect(body(0).querySelector('.clock-hand-second')).toBeTruthy();
    await clock.setClockOptions({ secondHand: false }, { persist: false });
    expect(body(0).querySelector('.clock-hand-second')).toBeNull();
    // Stunden- und Minutenzeiger bleiben.
    expect(body(0).querySelector('.clock-hand-hour')).toBeTruthy();
    expect(body(0).querySelector('.clock-hand-minute')).toBeTruthy();
  });

  it('gleitende Bewegung markiert den Sekundenzeiger fuer die CSS-Transition', async () => {
    await clock.setClockOptions({ secondMotion: 'sweep' }, { persist: false });
    await show(0);
    expect(body(0).querySelector('.clock-hand-second').classList.contains('sweep')).toBe(true);
    await clock.setClockOptions({ secondMotion: 'step' }, { persist: false });
    expect(body(0).querySelector('.clock-hand-second').classList.contains('sweep')).toBe(false);
  });

  it('die vier Zifferblatt-Varianten erzeugen die erwarteten Markierungen', async () => {
    const zaehle = () => ({
      ziffern: body(0).querySelectorAll('.clock-number').length,
      striche: body(0).querySelectorAll('.clock-tick').length,
    });
    await clock.setClockOptions({ dial: 'numbers' }, { persist: false });
    await show(0);
    expect(zaehle()).toEqual({ ziffern: 12, striche: 0 });

    await clock.setClockOptions({ dial: 'quarters' }, { persist: false });
    expect(zaehle()).toEqual({ ziffern: 4, striche: 8 });

    await clock.setClockOptions({ dial: 'ticks' }, { persist: false });
    expect(zaehle()).toEqual({ ziffern: 0, striche: 12 });

    await clock.setClockOptions({ dial: 'plain' }, { persist: false });
    expect(zaehle()).toEqual({ ziffern: 0, striche: 0 });
  });

  it('die Groessen-Option steuert die Kantenlaenge der Zeichnung', async () => {
    await clock.setClockOptions({ analogSize: 'small' }, { persist: false });
    await show(0);
    const klein = Number(body(0).querySelector('svg.clock-face').getAttribute('width'));
    await clock.setClockOptions({ analogSize: 'large' }, { persist: false });
    const gross = Number(body(0).querySelector('svg.clock-face').getAttribute('width'));
    expect(gross).toBeGreaterThan(klein);
  });

  // 4T-0679 (Epic 3E-0139): Dieselbe Stufe bemisst auch die Schrift. Das
  // Panel setzt dafuer nur die Variable; die Pixelwerte leitet styles.css
  // daraus ab, die Faktoren selbst deckt clock-options.test.js ab.
  it('die Groessen-Option setzt den Schrift-Faktor am Panel-Koerper', async () => {
    for (const stufe of ['small', 'medium', 'large']) {
      await clock.setClockOptions({ analogSize: stufe }, { persist: false });
      await show(0);
      expect(body(0).style.getPropertyValue('--clock-scale')).toBe(
        String(clockScale({ analogSize: stufe })),
      );
    }
  });

  // Der Faktor steht vor den Modus-Verzweigungen und ist deshalb auch dann
  // aktuell, wenn das Panel gerade Wecker, Timer oder Stoppuhr zeigt.
  it('der Schrift-Faktor bleibt beim Modus-Wechsel gesetzt', async () => {
    await clock.setClockOptions({ analogSize: 'large' }, { persist: false });
    await show(0);
    const gross = body(0).style.getPropertyValue('--clock-scale');
    await clock.setClockMode(0, 'stopwatch');
    expect(body(0).style.getPropertyValue('--clock-scale')).toBe(gross);
  });

  it('beide Spalten werden unabhaengig aufgebaut', async () => {
    await show(0);
    await show(1);
    expect(body(0).querySelector('svg.clock-face')).toBeTruthy();
    expect(body(1).querySelector('svg.clock-face')).toBeTruthy();
  });
});

describe('Uhr-Panel: Toggle und Persistenz (4T-0372)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
    resetModes();
    state.clock.visibleByPane[0] = false;
    state.clock.visibleByPane[1] = false;
    clock.applyClockVisibility(0);
    clock.applyClockVisibility(1);
  });

  it('Toggle schaltet die Sektion um und schreibt beide Spalten-Keys', async () => {
    const writes = [];
    window.api.setSetting = async (key, value) => writes.push([key, value]);
    await clock.toggleClockPanel(0);
    expect(state.clock.visibleByPane[0]).toBe(true);
    expect(document.querySelector('.pane-group .sidebar-clock').hidden).toBe(false);
    expect(writes).toEqual([
      ['clockPanel.visibleColumn0', true],
      ['clockPanel.visibleColumn1', false],
    ]);
    await clock.toggleClockPanel(0);
    expect(state.clock.visibleByPane[0]).toBe(false);
    expect(document.querySelector('.pane-group .sidebar-clock').hidden).toBe(true);
  });

  it('der Statusbar-Button spiegelt den Zustand', async () => {
    window.api.setSetting = async () => {};
    await clock.toggleClockPanel(0);
    const btn = document.getElementById('btn-clock');
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    await clock.toggleClockPanel(0);
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('setClockOptions persistiert nur bei echter Aenderung', async () => {
    const writes = [];
    window.api.setSetting = async (key, value) => writes.push([key, value]);
    await clock.setClockOptions({ ...clock.getClockOptions(), showWeek: true });
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('clock.options');
    expect(writes[0][1].showWeek).toBe(true);
    // Derselbe Stand erneut: No-op ohne zweiten Schreibvorgang.
    await clock.setClockOptions(clock.getClockOptions());
    expect(writes).toHaveLength(1);
  });
});

describe('Uhr-Panel: Aus-Zustand der Erweiterung und Timer (4T-0372)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    lifecycle.resetExtensionStateForTests();
    resetModes();
    window.api.setSetting = async () => {};
    await clock.setClockOptions(null, { persist: false });
    state.clock.visibleByPane[0] = false;
    state.clock.visibleByPane[1] = false;
    clock.applyClockVisibility(0);
    clock.applyClockVisibility(1);
    clock.initClockPanel();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sichtbares Panel haelt genau einen laufenden Timer', async () => {
    expect(vi.getTimerCount()).toBe(0);
    await show(0);
    expect(vi.getTimerCount()).toBe(1);
    // Auch mit beiden Spalten bleibt es EIN gemeinsamer Timer.
    await show(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('der Timer laeuft weiter und aktualisiert die Anzeige', async () => {
    await show(0);
    const vorher = body(0).querySelector('.clock-digital').textContent;
    expect(vorher).toBeTruthy();
    vi.advanceTimersByTime(3000);
    // Nach dem Vorspulen laeuft immer noch genau ein Timer (Selbst-Neuplanung).
    expect(vi.getTimerCount()).toBe(1);
  });

  it('Ausblenden des Panels raeumt den Timer ab', async () => {
    await show(0);
    expect(vi.getTimerCount()).toBe(1);
    state.clock.visibleByPane[0] = false;
    clock.applyClockVisibility(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Deaktivieren der Erweiterung entfernt Panel und Timer rueckstandsfrei', async () => {
    await show(0);
    expect(vi.getTimerCount()).toBe(1);
    await lifecycle.applyExtensionsState(['clock'], { persist: false });
    expect(lifecycle.isExtensionActive('clock')).toBe(false);
    expect(sidebarPanelById('clock').getVisible(0)).toBe(false);
    expect(document.querySelector('.pane-group .sidebar-clock').hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    // Der Nutzer-Wunsch bleibt gespeichert und kehrt beim Einschalten zurueck.
    expect(state.clock.visibleByPane[0]).toBe(true);
    await lifecycle.applyExtensionsState([], { persist: false });
    expect(document.querySelector('.pane-group .sidebar-clock').hidden).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('ohne sekundengenaue Anzeige laeuft der Timer im Minuten-Takt', async () => {
    await clock.setClockOptions(
      { secondHand: false, showSeconds: false, showDigital: true, showAnalog: true },
      { persist: false },
    );
    await show(0);
    expect(vi.getTimerCount()).toBe(1);
    // Innerhalb einer Minute darf der Tick nicht feuern: nach 59 s ist es
    // weiterhin derselbe eine (noch nicht ausgeloeste) Timer.
    const digital = body(0).querySelector('.clock-digital');
    expect(digital.textContent).toMatch(/^\d{2}:\d{2}$/);
    vi.advanceTimersByTime(59_000);
    expect(vi.getTimerCount()).toBe(1);
  });

  // 4T-0636: Der Takt haengt jetzt zusaetzlich am Modus. Steht die einzige
  // sichtbare Spalte auf einem anderen Modus, laeuft kein Timer.
  it('ausserhalb des Uhr-Modus laeuft kein Timer', async () => {
    withSecondPane();
    await show(0);
    expect(vi.getTimerCount()).toBe(1);
    await clock.setClockMode(0, 'timer');
    expect(vi.getTimerCount()).toBe(0);
    // Zweite Spalte im Uhr-Modus haelt den gemeinsamen Timer wieder am Leben.
    await show(1);
    expect(vi.getTimerCount()).toBe(1);
    await clock.setClockMode(1, 'alarm');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Uhr-Panel: Modus-Umschaltung (4T-0636)', () => {
  beforeEach(async () => {
    lifecycle.resetExtensionStateForTests();
    resetModes();
    window.api.setSetting = async () => {};
    state.clock.visibleByPane[0] = false;
    state.clock.visibleByPane[1] = false;
    clock.applyClockVisibility(0);
    clock.applyClockVisibility(1);
    await clock.setClockOptions(null, { persist: false });
  });

  it('die Leiste traegt vier Tasten mit Icon, Beschriftung und Druck-Zustand', async () => {
    await show(0);
    const btns = [...modeBar(0).querySelectorAll('.clock-mode-btn')];
    expect(btns.map((b) => b.dataset.clockMode)).toEqual(['clock', 'alarm', 'timer', 'stopwatch']);
    // Ohne Text-Label sind Icon, Tooltip und Screenreader-Label Pflicht.
    for (const b of btns) {
      expect(b.querySelector('svg')).toBeTruthy();
      expect(b.textContent).toBe('');
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.getAttribute('aria-label').length).toBeGreaterThan(0);
    }
    expect(btns.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(modeBar(0).getAttribute('role')).toBe('group');
  });

  it('ein Klick wechselt Modus, Inhalt und Hervorhebung', async () => {
    await show(0);
    expect(body(0).querySelector('svg.clock-face')).toBeTruthy();
    modeBar(0).querySelector('[data-clock-mode="alarm"]').click();
    // Der Klick-Handler laeuft asynchron (Persistenz), der Neuaufbau davor.
    await Promise.resolve();
    expect(clock.getClockMode(0)).toBe('alarm');
    expect(body(0).querySelector('svg.clock-face')).toBeNull();
    expect(body(0).querySelector('.clock-placeholder')).toBeTruthy();
    const aktiv = modeBar(0).querySelector('.clock-mode-btn.active');
    expect(aktiv.dataset.clockMode).toBe('alarm');
    expect(aktiv.getAttribute('aria-pressed')).toBe('true');
  });

  it('der Modus gilt je Spalte getrennt und schreibt den eigenen Schluessel', async () => {
    withSecondPane();
    const writes = [];
    window.api.setSetting = async (key, value) => writes.push([key, value]);
    await show(0);
    await show(1);
    await clock.setClockMode(1, 'stopwatch');
    expect(clock.getClockMode(0)).toBe('clock');
    expect(clock.getClockMode(1)).toBe('stopwatch');
    expect(body(0).querySelector('svg.clock-face')).toBeTruthy();
    // 4T-0638: Spalte 1 zeigt die Stoppuhr, nicht mehr den Platzhalter.
    expect(body(1).querySelector('svg.clock-face')).toBeNull();
    expect(body(1).querySelector('.stopwatch-view')).toBeTruthy();
    expect(writes).toEqual([['clockPanel.modeColumn1', 'stopwatch']]);
    // Derselbe Modus erneut: No-op ohne zweiten Schreibvorgang.
    await clock.setClockMode(1, 'stopwatch');
    expect(writes).toHaveLength(1);
  });

  it('unbekannte Modus-Werte fallen auf die Uhr zurueck', async () => {
    await show(0);
    await clock.setClockMode(0, 'sanduhr');
    expect(clock.getClockMode(0)).toBe('clock');
    expect(body(0).querySelector('svg.clock-face')).toBeTruthy();
  });

  it('loadClockSettings holt den Modus je Spalte aus dem Speicher', async () => {
    const store = {
      'clockPanel.visibleColumn0': true,
      'clockPanel.visibleColumn1': false,
      'clockPanel.modeColumn0': 'timer',
      'clockPanel.modeColumn1': 'quatsch',
    };
    const original = window.api.getSetting;
    window.api.getSetting = async (key) => store[key];
    try {
      await clock.loadClockSettings();
    } finally {
      window.api.getSetting = original;
    }
    expect(clock.getClockMode(0)).toBe('timer');
    // Defekter Stand faellt auf den Standard zurueck.
    expect(clock.getClockMode(1)).toBe('clock');
    expect(state.clock.visibleByPane[0]).toBe(true);
  });
});
