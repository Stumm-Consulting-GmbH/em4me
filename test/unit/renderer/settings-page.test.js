// @vitest-environment jsdom
// 4T-0278/4T-0279 (Epic 3E-0049): Unit-Tests der Einstellungs-Seite —
// Bereichs-Registry (feste Reihenfolge, Andockpunkt für dynamische
// Bereiche), Seiten-Layout (Navigation, Bereichs-Wechsel mit
// Entwurfs-Erhalt), seitenweite Validierungs-Blockade von Anwenden/OK
// und die migrierte Draft-Logik (Task-Status-Validierung,
// Hotkey-Overrides).
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/system-pages.js');
// 4T-0555 (Epic 3E-0100): state.areaPath steuert die Sichtbarkeit der
// Navigations-Gruppe „Aktueller Bereich".
const { state } = await import('../../../src/renderer/modules/app-state.js');

// Seiten-Lebenszyklus wie beim echten Öffnen: onOpen baut den frischen
// Entwurf (4T-0279), mount montiert das DOM.
function mountPage() {
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

describe('Bereichs-Registry (settings-page.js, 4T-0278)', () => {
  it('feste Bereiche erscheinen in definierter Reihenfolge', () => {
    // 4T-0304 (Epic 3E-0054): Bereich „Export" hinter „Verhalten".
    // 4T-0436 (Epic 3E-0081): Bereich „Journale" hinter „Vorlagen".
    // 4T-0450 (Epic 3E-0083): Bereich "Eigenschafts-Profile" hinter "Journale".
    // 4T-0498 (Epic 3E-0090): Bereich "Aufgaben" hinter "Task-Status".
    // 4T-0528 (Epic 3E-0095): Bereich "Erinnerungen" hinter "Aufgaben".
    // 4T-0471 (Epic 3E-0087): Bereich "Ueberschriften-Nummerierung" hinter "Erinnerungen".
    // 4T-0466 (Epic 3E-0086): Bereich "Farbschemas" direkt hinter "Darstellung".
    // 4T-0544 (Epic 3E-0097): Bereich "Kalender-Systeme" hinter "Journale".
    // 4T-0555 (Epic 3E-0100): abgespaltene Bereichs-Sektionen "historyArea"
    // hinter "Verhalten" und "templatesArea" hinter "Vorlagen".
    // 4T-0604 (Epic 3E-0113): Bereich „Zeitstempel" hinter „Verhalten"
    // (erweiterungs-eigener Bereich der Erweiterung frontmatter-timestamps).
    // 4T-0791 (Epic 3E-0125): Bereiche „Anlagen" und „attachmentsArea" hinter
    // „historyArea", also im Block der dokument-nahen Einstellungen.
    // 4T-0581 (Epic 3E-0107): Bereich „Rechtschreibprüfung" hinter
    // „Zeitstempel" (erweiterungs-eigener Bereich der Erweiterung spellcheck).
    const ids = settingsPage.settingsSections().map((s) => s.id);
    expect(ids.slice(0, 19)).toEqual([
      'appearance',
      'colorSchemes',
      'behavior',
      'frontmatterTimestamps',
      'spellcheck',
      'historyArea',
      'attachments',
      'attachmentsArea',
      'export',
      'templates',
      'templatesArea',
      'journals',
      'calendarSystems',
      'propertyProfiles',
      'taskStates',
      'tasks',
      'reminders',
      'headingNumbering',
      'hotkeys',
    ]);
  });

  it('dynamische Bereiche docken nach den festen an, in Registrierungs-Reihenfolge', () => {
    settingsPage.registerSettingsSection({
      id: 'test-b',
      titleKey: 'settings.title',
      render: () => {},
    });
    settingsPage.registerSettingsSection({
      id: 'test-a',
      titleKey: 'settings.title',
      render: () => {},
    });
    const ids = settingsPage.settingsSections().map((s) => s.id);
    expect(ids.indexOf('test-b')).toBeGreaterThan(ids.indexOf('hotkeys'));
    expect(ids.indexOf('test-a')).toBe(ids.indexOf('test-b') + 1);
  });

  it('Re-Registrierung derselben ID ersetzt statt zu duplizieren; feste IDs sind geschützt', () => {
    const marker = () => {};
    settingsPage.registerSettingsSection({
      id: 'test-b',
      titleKey: 'settings.title',
      render: marker,
    });
    const sections = settingsPage.settingsSections();
    expect(sections.filter((s) => s.id === 'test-b')).toHaveLength(1);
    expect(sections.find((s) => s.id === 'test-b').render).toBe(marker);
    settingsPage.registerSettingsSection({
      id: 'appearance',
      titleKey: 'settings.title',
      render: marker,
    });
    expect(sections.filter((s) => s.id === 'appearance')).toHaveLength(1);
    expect(settingsPage.settingsSections().find((s) => s.id === 'appearance').render).not.toBe(
      marker,
    );
  });
});

describe('Seiten-Layout und Bereichs-Wechsel (4T-0278)', () => {
  it('Mount baut Navigation, Bereichs-Inhalt und Button-Leiste', () => {
    const container = mountPage();
    const entries = container.querySelectorAll('.settings-nav-entry');
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries[0].dataset.sectionId).toBe('appearance');
    expect(container.querySelector('.settings-section-content')).not.toBeNull();
    expect(container.querySelectorAll('.settings-page-buttons .btn')).toHaveLength(3);
  });

  it('Bereichs-Wechsel hebt den aktiven Eintrag hervor und erhält den Entwurf', () => {
    const container = mountPage();
    const draft = settingsPage.settingsPageStateForTests().draft;
    draft.probe = 'bleibt';
    container.querySelector('.settings-nav-entry[data-section-id="behavior"]').click();
    expect(
      container
        .querySelector('.settings-nav-entry[data-section-id="behavior"]')
        .classList.contains('active'),
    ).toBe(true);
    expect(settingsPage.settingsPageStateForTests().draft.probe).toBe('bleibt');
  });
});

describe('Migrierte Draft-Logik (4T-0279)', () => {
  it('validateTaskStatesDraft: Ein-Zeichen-Pflicht, verbotene Zeichen, Duplikate', () => {
    const ok = [
      { char: '/', enabled: true },
      { char: '!', enabled: false },
    ];
    expect(settingsPage.validateTaskStatesDraft(ok)).toBe(true);
    expect(settingsPage.validateTaskStatesDraft([{ char: '' }])).toBe(false);
    expect(settingsPage.validateTaskStatesDraft([{ char: 'ab' }])).toBe(false);
    expect(settingsPage.validateTaskStatesDraft([{ char: '/' }, { char: '/' }])).toBe(false);
    // Verbotene Zeichen (Toggle-Semantik): Leerzeichen und x sind reserviert.
    expect(settingsPage.validateTaskStatesDraft([{ char: ' ' }])).toBe(false);
    expect(settingsPage.validateTaskStatesDraft([{ char: 'x' }])).toBe(false);
  });

  it('Entwurf startet mit eingeschalteter Frontmatter-Anzeige (Default an, 4T-0284)', () => {
    mountPage();
    const draft = settingsPage.settingsPageStateForTests().draft;
    expect(draft.showFrontmatter).toBe(true);
    // Checkbox ist im Bereich Darstellung montiert (initial aktiver Bereich).
    expect(document.getElementById('settings-show-frontmatter')).not.toBeNull();
    expect(document.getElementById('settings-show-frontmatter').checked).toBe(true);
  });

  it('hotkeysDraftToOverrides: nur Abweichungen vom Default landen im Store-Objekt', () => {
    const draft = settingsPage.buildHotkeysDraftFromState();
    expect(settingsPage.hotkeysDraftToOverrides(draft)).toEqual({});
    draft['search.open'] = 'Ctrl+Alt+F';
    draft['file.save'] = '';
    const overrides = settingsPage.hotkeysDraftToOverrides(draft);
    expect(overrides['search.open']).toBe('Ctrl+Alt+F');
    expect(overrides['file.save']).toBe('');
    expect(Object.keys(overrides)).toHaveLength(2);
  });

  it('Task-Status-Bereich validiert über die Seiten-Validierung (Fehlertext, Blockade)', async () => {
    mountPage();
    const draft = settingsPage.settingsPageStateForTests().draft;
    draft.taskStates.push({ char: '', builtin: false, color: '#888888', enabled: true, label: '' });
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(settingsPage.settingsPageStateForTests().errors.has('taskStates')).toBe(true);
    draft.taskStates.pop();
    expect(await settingsPage.applySettingsPage()).toBe(true);
  });

  // 4T-0497 (Epic 3E-0090): mehrfach belegte Zeichen der Warnung/Validierung.
  it('duplicateTaskStateChars: leer ohne Duplikate, erkennt Mehrfach-Belegung in Auftritts-Reihenfolge', () => {
    expect(settingsPage.duplicateTaskStateChars([{ char: '/' }, { char: '-' }])).toEqual([]);
    expect(
      settingsPage.duplicateTaskStateChars([{ char: '/' }, { char: '-' }, { char: '/' }]),
    ).toEqual(['/']);
    // Leere oder mehrzeichige Werte zaehlen nicht als Duplikat.
    expect(settingsPage.duplicateTaskStateChars([{ char: '' }, { char: '' }])).toEqual([]);
  });
});

// 4T-0383 (Epic 3E-0072): Inhalts-Breite in Prozent — Clamp-Matrix,
// CSS-Variable und montiertes Eingabefeld im Bereich Darstellung.
describe('Inhalts-Breite in Prozent (4T-0383, Epic 3E-0072)', () => {
  it('clampContentWidth klemmt auf 20 bis 100, rundet und fällt auf den Default zurück', () => {
    expect(settingsPage.clampContentWidth(50, 80)).toBe(50);
    expect(settingsPage.clampContentWidth(20, 80)).toBe(20);
    expect(settingsPage.clampContentWidth(100, 80)).toBe(100);
    expect(settingsPage.clampContentWidth(19, 80)).toBe(20);
    expect(settingsPage.clampContentWidth(150, 80)).toBe(100);
    expect(settingsPage.clampContentWidth(64.4, 80)).toBe(64);
    expect(settingsPage.clampContentWidth('55', 80)).toBe(55);
    expect(settingsPage.clampContentWidth('abc', 80)).toBe(80);
    expect(settingsPage.clampContentWidth(undefined, 80)).toBe(80);
    expect(settingsPage.APPEARANCE_DEFAULTS.contentWidth).toBe(80);
  });

  it('applyAppearanceVars setzt --content-width als Prozent-Wert auf :root', () => {
    settingsPage.applyAppearanceVars({ contentWidth: 60 });
    expect(document.documentElement.style.getPropertyValue('--content-width')).toBe('60%');
    // Ohne Wert (Alt-Profil, leerer Broadcast) greift der Default.
    settingsPage.applyAppearanceVars({});
    expect(document.documentElement.style.getPropertyValue('--content-width')).toBe('80%');
  });

  it('der Bereich Darstellung montiert das Breiten-Feld mit den Bereichs-Grenzen', () => {
    // Verwaiste Container früherer Mounts entfernen: bei ID-Duplikaten im
    // Dokument läuft der #id-Fast-Path der jsdom-Selektor-Engine (nwsapi)
    // auf das dokumentweit erste Vorkommen und verfehlt den frischen
    // Container (deshalb nicht per document.getElementById prüfbar).
    document.body.innerHTML = '';
    const container = mountPage();
    const input = container.querySelector('#settings-content-width');
    expect(input).not.toBeNull();
    expect(input.min).toBe('20');
    expect(input.max).toBe('100');
    expect(input.value).toBe('80');
  });
});

// 4T-0575 (Epic 3E-0106): abgerundete Tab-Ecken — Default, Root-Klasse und
// montierter Schalter im Bereich Darstellung.
describe('Abgerundete Tab-Ecken (4T-0575, Epic 3E-0106)', () => {
  it('Default ist aus; nur explizites true rundet', () => {
    expect(settingsPage.APPEARANCE_DEFAULTS.roundedTabs).toBe(false);
    settingsPage.applyAppearanceVars({ roundedTabs: true });
    expect(document.documentElement.classList.contains('rounded-tabs')).toBe(true);
    // Abschalten und Alt-Profil ohne Wert (leerer Broadcast) fallen beide
    // auf den eckigen Default zurück.
    settingsPage.applyAppearanceVars({ roundedTabs: false });
    expect(document.documentElement.classList.contains('rounded-tabs')).toBe(false);
    settingsPage.applyAppearanceVars({ roundedTabs: true });
    settingsPage.applyAppearanceVars({});
    expect(document.documentElement.classList.contains('rounded-tabs')).toBe(false);
  });

  it('der Bereich Darstellung montiert den Schalter, Änderung wirkt als Live-Vorschau', () => {
    // Verwaiste Container früherer Mounts entfernen (siehe Kommentar oben).
    document.body.innerHTML = '';
    const container = mountPage();
    const box = container.querySelector('#settings-rounded-tabs');
    expect(box).not.toBeNull();
    expect(box.checked).toBe(false);
    // Der Entwurf trägt die Darstellungs-Werte erst nach dem asynchronen
    // Store-Laden; ohne ihn bleibt das change-Ereignis folgenlos.
    const draft = settingsPage.settingsPageStateForTests().draft;
    draft.appearance = { ...settingsPage.APPEARANCE_DEFAULTS };
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(draft.appearance.roundedTabs).toBe(true);
    expect(document.documentElement.classList.contains('rounded-tabs')).toBe(true);
    settingsPage.applyAppearanceVars({});
  });
});

// 4T-0577 (Epic 3E-0106): Hervorhebung der aktiven Zeile — Default an,
// Root-Klasse und montierter Schalter im Bereich Darstellung.
describe('Hervorhebung der aktiven Zeile (4T-0577, Epic 3E-0106)', () => {
  it('Default ist an; nur explizites false schaltet ab', () => {
    expect(settingsPage.APPEARANCE_DEFAULTS.highlightActiveLine).toBe(true);
    settingsPage.applyAppearanceVars({ highlightActiveLine: false });
    expect(document.documentElement.classList.contains('highlight-active-line')).toBe(false);
    settingsPage.applyAppearanceVars({ highlightActiveLine: true });
    expect(document.documentElement.classList.contains('highlight-active-line')).toBe(true);
    // Alt-Profil ohne Wert (leerer Broadcast) landet auf dem Default an.
    settingsPage.applyAppearanceVars({ highlightActiveLine: false });
    settingsPage.applyAppearanceVars({});
    expect(document.documentElement.classList.contains('highlight-active-line')).toBe(true);
  });

  it('der Bereich Darstellung montiert den Schalter, Änderung wirkt als Live-Vorschau', () => {
    // Verwaiste Container früherer Mounts entfernen (siehe Kommentar oben).
    document.body.innerHTML = '';
    const container = mountPage();
    const box = container.querySelector('#settings-highlight-active-line');
    expect(box).not.toBeNull();
    expect(box.checked).toBe(true);
    const draft = settingsPage.settingsPageStateForTests().draft;
    draft.appearance = { ...settingsPage.APPEARANCE_DEFAULTS };
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(draft.appearance.highlightActiveLine).toBe(false);
    expect(document.documentElement.classList.contains('highlight-active-line')).toBe(false);
    settingsPage.applyAppearanceVars({});
  });
});

// 4T-0555 (Epic 3E-0100): zweigeteilte Navigation — Gruppe „Allgemein"
// immer, Gruppe „Aktueller Bereich" nur bei gebundenem Bereich
// (state.areaPath); bereichsgebundene Sektionen (group 'area') erscheinen
// ausschließlich dort, in Registry-Reihenfolge.
describe('Bereichs-Gliederung der Navigation (4T-0555, Epic 3E-0100)', () => {
  const AREA_SECTION_IDS = [
    'historyArea',
    // 4T-0791 (Epic 3E-0125): Bereichs-Uebersteuerung der Anlagen-Ablage.
    'attachmentsArea',
    'templatesArea',
    'journals',
    'calendarSystems',
    'propertyProfiles',
  ];

  it('ohne Bereich: nur die Gruppe „Allgemein", bereichsgebundene Sektionen fehlen', () => {
    document.body.innerHTML = '';
    state.areaPath = null;
    const container = mountPage();
    const groups = container.querySelectorAll('.settings-nav-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].dataset.navGroup).toBe('general');
    expect(groups[0].querySelector('.settings-nav-group-title').textContent).not.toBe('');
    const ids = [...container.querySelectorAll('.settings-nav-entry')].map(
      (b) => b.dataset.sectionId,
    );
    expect(ids[0]).toBe('appearance');
    for (const areaId of AREA_SECTION_IDS) expect(ids).not.toContain(areaId);
  });

  it('mit Bereich: zweite Gruppe „Aktueller Bereich" mit den Bereichs-Sektionen in Registry-Reihenfolge', () => {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/testbereich';
    try {
      const container = mountPage();
      const groups = container.querySelectorAll('.settings-nav-group');
      expect(groups).toHaveLength(2);
      expect(groups[0].dataset.navGroup).toBe('general');
      expect(groups[1].dataset.navGroup).toBe('area');
      const areaIds = [...groups[1].querySelectorAll('.settings-nav-entry')].map(
        (b) => b.dataset.sectionId,
      );
      expect(areaIds).toEqual(AREA_SECTION_IDS);
      // Gruppen-Überschriften sind keine Navigations-Einträge.
      expect(groups[1].querySelector('.settings-nav-group-title').dataset.sectionId).toBe(
        undefined,
      );
    } finally {
      state.areaPath = null;
    }
  });

  it('dynamische Sektionen: Default-Gruppe „Allgemein", explizites group area landet in der Bereichs-Gruppe', () => {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/testbereich';
    try {
      settingsPage.registerSettingsSection({
        id: 'test-area-dyn',
        titleKey: 'settings.title',
        group: 'area',
        render: () => {},
      });
      const container = mountPage();
      const areaIds = [
        ...container.querySelectorAll('[data-nav-group="area"] .settings-nav-entry'),
      ].map((b) => b.dataset.sectionId);
      expect(areaIds).toEqual([...AREA_SECTION_IDS, 'test-area-dyn']);
      // Die früher registrierten dynamischen Test-Sektionen ohne group
      // stehen in der Gruppe „Allgemein".
      const generalIds = [
        ...container.querySelectorAll('[data-nav-group="general"] .settings-nav-entry'),
      ].map((b) => b.dataset.sectionId);
      expect(generalIds).toContain('test-b');
      expect(generalIds).not.toContain('test-area-dyn');
    } finally {
      state.areaPath = null;
      settingsPage.unregisterSettingsSection('test-area-dyn');
    }
  });
});

// 4T-0554 (Epic 3E-0100): Speicher-Status der Schaltflächen — „Anwenden"
// und „OK" tragen die Primary-Hervorhebung nur bei ungesicherten
// Änderungen; „Anwenden" ist ohne Änderungen deaktiviert, „OK" bleibt
// immer klickbar. Die Erkennung ist bereichsübergreifend (dirty-Hooks der
// Registry spiegeln die Änderungs-Prüfung der apply-Hooks).
describe('Speicher-Status der Einstellungs-Buttons (4T-0554, Epic 3E-0100)', () => {
  it('ohne Änderungen: Anwenden deaktiviert und neutral, OK neutral und klickbar', () => {
    document.body.innerHTML = '';
    const container = mountPage();
    expect(settingsPage.isSettingsPageDirty()).toBe(false);
    const applyBtn = container.querySelector('#btn-settings-apply');
    const okBtn = container.querySelector('#btn-settings-ok');
    expect(applyBtn.disabled).toBe(true);
    expect(applyBtn.classList.contains('btn-primary')).toBe(false);
    expect(okBtn.disabled).toBe(false);
    expect(okBtn.classList.contains('btn-primary')).toBe(false);
  });

  it('eine Wert-Änderung schaltet beide Schaltflächen auf Primary und aktiviert Anwenden', () => {
    document.body.innerHTML = '';
    const container = mountPage();
    const checkbox = container.querySelector('#settings-show-frontmatter');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(settingsPage.isSettingsPageDirty()).toBe(true);
    const applyBtn = container.querySelector('#btn-settings-apply');
    const okBtn = container.querySelector('#btn-settings-ok');
    expect(applyBtn.disabled).toBe(false);
    expect(applyBtn.classList.contains('btn-primary')).toBe(true);
    expect(okBtn.classList.contains('btn-primary')).toBe(true);
    // Zurückstellen auf den Ausgangswert setzt den Status ohne Anwenden zurück.
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(settingsPage.isSettingsPageDirty()).toBe(false);
    expect(applyBtn.disabled).toBe(true);
    expect(applyBtn.classList.contains('btn-primary')).toBe(false);
    expect(okBtn.classList.contains('btn-primary')).toBe(false);
  });

  it('die Erkennung ist bereichsübergreifend (Änderung außerhalb des aktiven Bereichs)', () => {
    document.body.innerHTML = '';
    mountPage();
    // Aktiver Bereich ist „Darstellung"; die Änderung liegt im
    // Tastenkürzel-Entwurf (kein DOM-Kontakt, direkte Entwurfs-Mutation).
    const draft = settingsPage.settingsPageStateForTests().draft;
    draft.hotkeys['search.open'] = 'Ctrl+Alt+F';
    expect(settingsPage.isSettingsPageDirty()).toBe(true);
    draft.hotkeys = settingsPage.buildHotkeysDraftFromState();
    expect(settingsPage.isSettingsPageDirty()).toBe(false);
  });

  it('nach Anwenden sind die Schaltflächen wieder im Nicht-dirty-Zustand', async () => {
    document.body.innerHTML = '';
    const container = mountPage();
    const checkbox = container.querySelector('#settings-show-frontmatter');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(settingsPage.isSettingsPageDirty()).toBe(true);
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(settingsPage.isSettingsPageDirty()).toBe(false);
    const applyBtn = container.querySelector('#btn-settings-apply');
    const okBtn = container.querySelector('#btn-settings-ok');
    expect(applyBtn.disabled).toBe(true);
    expect(applyBtn.classList.contains('btn-primary')).toBe(false);
    expect(okBtn.classList.contains('btn-primary')).toBe(false);
    // Laufzeit-Zustand für Folge-Tests zurücksetzen (Live-Getter ist die
    // Vergleichs-Basis der Frontmatter-Schalter).
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await settingsPage.applySettingsPage();
  });
});

describe('Validierungs-Blockade von Anwenden/OK (4T-0278)', () => {
  it('ein Bereichs-Fehler blockiert seitenweit, markiert die Navigation und apply läuft nicht', async () => {
    let applied = 0;
    let valid = false;
    settingsPage.registerSettingsSection({
      id: 'test-validate',
      titleKey: 'settings.title',
      render: () => {},
      validate: () => (valid ? null : 'Fehlertext'),
      apply: () => {
        applied++;
      },
    });
    const container = mountPage();
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(applied).toBe(0);
    const entry = container.querySelector('.settings-nav-entry[data-section-id="test-validate"]');
    expect(entry.classList.contains('has-error')).toBe(true);
    // Nach Korrektur läuft apply und die Markierung verschwindet.
    valid = true;
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(applied).toBe(1);
    expect(entry.classList.contains('has-error')).toBe(false);
  });
});
