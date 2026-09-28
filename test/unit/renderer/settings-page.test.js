// @vitest-environment jsdom
// 4T-000278/4T-000279 (Epic 3E-000049): Unit-Tests der Einstellungs-Seite —
// Bereichs-Registry (feste Reihenfolge, Andockpunkt für dynamische
// Bereiche), Seiten-Layout (Navigation, Bereichs-Wechsel mit
// Entwurfs-Erhalt), seitenweite Validierungs-Blockade von Anwenden/OK
// und die migrierte Draft-Logik (Task-Status-Validierung,
// Hotkey-Overrides).
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
// 4T-000555 (Epic 3E-000100): state.areaPath steuert die Sichtbarkeit der
// Navigations-Gruppe „Aktueller Bereich".
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
// 4T-001885 (Epic 3E-000189): Bezug des bereichsgebundenen Blocks und die
// lokalisierten Block-Titel.
const { kontextSchluessel } =
  await import('../../../src/renderer/modules/settings/settings-kontext.js');
const { t } = await import('../../../src/renderer/i18n.js');

// Seiten-Lebenszyklus wie beim echten Öffnen: onOpen baut den frischen
// Entwurf (4T-000279), mount montiert das DOM.
function mountPage() {
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

describe('Bereichs-Registry (settings-page.js, 4T-000278)', () => {
  it('feste Bereiche erscheinen in definierter Reihenfolge', () => {
    // 4T-000304 (Epic 3E-000054): Bereich „Export" hinter „Verhalten".
    // 4T-000436 (Epic 3E-000081): Bereich „Journale" hinter „Vorlagen".
    // 4T-000450 (Epic 3E-000083): Bereich "Eigenschafts-Profile" hinter "Journale".
    // 4T-000498 (Epic 3E-000090): Bereich "Aufgaben" hinter "Task-Status".
    // 4T-000528 (Epic 3E-000095): Bereich "Erinnerungen" hinter "Aufgaben".
    // 4T-000471 (Epic 3E-000087): Bereich "Ueberschriften-Nummerierung" hinter "Erinnerungen".
    // 4T-000466 (Epic 3E-000086): Bereich "Farbschemas" direkt hinter "Darstellung".
    // 4T-000544 (Epic 3E-000097): Bereich "Kalender-Systeme" hinter "Journale".
    // 4T-000555 (Epic 3E-000100): abgespaltene Bereichs-Sektionen "historyArea"
    // hinter "Verhalten" und "templatesArea" hinter "Vorlagen".
    // 4T-000604 (Epic 3E-000113): Bereich „Zeitstempel" hinter „Verhalten"
    // (erweiterungs-eigener Bereich der Erweiterung frontmatter-timestamps).
    // 4T-000791 (Epic 3E-000125): Bereiche „Anlagen" und „attachmentsArea" hinter
    // „historyArea", also im Block der dokument-nahen Einstellungen.
    // 4T-000581 (Epic 3E-000107): Bereich „Rechtschreibprüfung" hinter
    // „Zeitstempel" (erweiterungs-eigener Bereich der Erweiterung spellcheck).
    // 4T-001455 (Epic 3E-000190): Bereich „Bereichs-Verknüpfungen" hinter
    // „templatesArea" — die Verknüpfung trägt das Opt-in für die Vorlagen-Kette.
    // 4T-001758 (Epic 3E-000253): Bereich „Datenbank" hinter „areaLinks" — beide
    // beschreiben den Bereich als Ganzes.
    // 4T-001885 (Epic 3E-000189): Bereich „Eigene Angaben" VOR „historyArea" —
    // er steht an erster Stelle des bereichsgebundenen Blocks.
    const ids = settingsPage.settingsSections().map((s) => s.id);
    expect(ids.slice(0, 22)).toEqual([
      'appearance',
      'colorSchemes',
      'behavior',
      'frontmatterTimestamps',
      'spellcheck',
      'bookInfo',
      'historyArea',
      'attachments',
      'attachmentsArea',
      'export',
      'templates',
      'templatesArea',
      'areaLinks',
      'database',
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

describe('Seiten-Layout und Bereichs-Wechsel (4T-000278)', () => {
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

describe('Migrierte Draft-Logik (4T-000279)', () => {
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

  it('Entwurf startet mit eingeschalteter Frontmatter-Anzeige (Default an, 4T-000284)', () => {
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

  // 4T-000497 (Epic 3E-000090): mehrfach belegte Zeichen der Warnung/Validierung.
  it('duplicateTaskStateChars: leer ohne Duplikate, erkennt Mehrfach-Belegung in Auftritts-Reihenfolge', () => {
    expect(settingsPage.duplicateTaskStateChars([{ char: '/' }, { char: '-' }])).toEqual([]);
    expect(
      settingsPage.duplicateTaskStateChars([{ char: '/' }, { char: '-' }, { char: '/' }]),
    ).toEqual(['/']);
    // Leere oder mehrzeichige Werte zaehlen nicht als Duplikat.
    expect(settingsPage.duplicateTaskStateChars([{ char: '' }, { char: '' }])).toEqual([]);
  });
});

// 4T-000383 (Epic 3E-000072): Inhalts-Breite in Prozent — Clamp-Matrix,
// CSS-Variable und montiertes Eingabefeld im Bereich Darstellung.
describe('Inhalts-Breite in Prozent (4T-000383, Epic 3E-000072)', () => {
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

// 4T-000575 (Epic 3E-000106): abgerundete Tab-Ecken — Default, Root-Klasse und
// montierter Schalter im Bereich Darstellung.
describe('Abgerundete Tab-Ecken (4T-000575, Epic 3E-000106)', () => {
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

// 4T-000577 (Epic 3E-000106): Hervorhebung der aktiven Zeile — Default an,
// Root-Klasse und montierter Schalter im Bereich Darstellung.
describe('Hervorhebung der aktiven Zeile (4T-000577, Epic 3E-000106)', () => {
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

// 4T-000555 (Epic 3E-000100): zweigeteilte Navigation — Gruppe „Allgemein"
// immer, Gruppe „Aktueller Bereich" nur bei gebundenem Bereich
// (state.areaPath); bereichsgebundene Sektionen (group 'area') erscheinen
// ausschließlich dort, in Registry-Reihenfolge.
describe('Bereichs-Gliederung der Navigation (4T-000555, Epic 3E-000100)', () => {
  const AREA_SECTION_IDS = [
    'historyArea',
    // 4T-000791 (Epic 3E-000125): Bereichs-Uebersteuerung der Anlagen-Ablage.
    'attachmentsArea',
    'templatesArea',
    // 4T-001455 (Epic 3E-000190): Verknuepfungen des Bereichs.
    'areaLinks',
    'journals',
    'calendarSystems',
    'propertyProfiles',
  ];

  it('ohne Bereich: keine Bereichs-Gruppe, bereichsgebundene Sektionen fehlen', () => {
    document.body.innerHTML = '';
    state.areaPath = null;
    const container = mountPage();
    const groups = [...container.querySelectorAll('.settings-nav-group')];
    // 4T-000889 (Epic 3E-000168): ohne Bereich bleiben „Allgemein" und der
    // interne Erweiterungs-Block; die Bereichs-Gruppe entfällt.
    expect(groups.map((g) => g.dataset.navGroup)).toEqual(['general', 'extensionsInternal']);
    expect(groups[0].querySelector('.settings-nav-group-title').textContent).not.toBe('');
    const ids = [...container.querySelectorAll('.settings-nav-entry')].map(
      (b) => b.dataset.sectionId,
    );
    expect(ids[0]).toBe('appearance');
    for (const areaId of AREA_SECTION_IDS) expect(ids).not.toContain(areaId);
  });

  it('mit Bereich: Gruppe „Aktueller Bereich" mit den Bereichs-Sektionen in Registry-Reihenfolge', () => {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/testbereich';
    try {
      const container = mountPage();
      const groups = container.querySelectorAll('.settings-nav-group');
      // 4T-000889: die Bereichs-Gruppe steht zwischen „Allgemein" und dem
      // internen Erweiterungs-Block.
      expect([...groups].map((g) => g.dataset.navGroup)).toEqual([
        'general',
        'area',
        'extensionsInternal',
      ]);
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

// 4T-000889 (Epic 3E-000168): Vier-Block-Gliederung der Navigation. Die
// Herkunft einer Sektion entscheidet über ihren Block: Kern-Sektionen
// stehen unter „Allgemein" (die beiden Verwaltungs-Sektionen dort am
// Ende), Sektionen interner Erweiterungen im eigenen Block (alphabetisch
// nach lokalisiertem Titel), Sektionen externer Erweiterungen in einem
// vierten Block, der ohne solche Erweiterungen gar nicht erscheint.
// Bereichsgebundene Sektionen bleiben unabhängig von ihrer Herkunft in der
// Bereichs-Gruppe.
describe('Vier-Block-Gliederung der Navigation (4T-000889, Epic 3E-000168)', () => {
  // Erweiterungs-gebundene Sektionen ohne Bereichs-Bindung, wie sie die
  // Registry (src/shared/extensions/extensions.js, Feld settingsSections) ausweist.
  const INTERNAL_EXTENSION_SECTION_IDS = [
    'frontmatterTimestamps',
    'spellcheck',
    'templates',
    'taskStates',
    'tasks',
    'reminders',
    'headingNumbering',
  ];

  function navIds(container, groupId) {
    return [...container.querySelectorAll(`[data-nav-group="${groupId}"] .settings-nav-entry`)].map(
      (b) => b.dataset.sectionId,
    );
  }

  it('Kern-Sektionen unter „Allgemein", Erweiterungs-Sektionen im eigenen Block', () => {
    document.body.innerHTML = '';
    state.areaPath = null;
    const container = mountPage();
    const generalIds = navIds(container, 'general');
    const internalIds = navIds(container, 'extensionsInternal');
    // Kern bleibt Kern (keine settingsSections-Kopplung in der Registry).
    for (const kernId of ['appearance', 'colorSchemes', 'behavior', 'export', 'hotkeys']) {
      expect(generalIds).toContain(kernId);
      expect(internalIds).not.toContain(kernId);
    }
    // Erweiterungs-gebundene Sektionen wechseln vollständig den Block.
    for (const extId of INTERNAL_EXTENSION_SECTION_IDS) {
      expect(internalIds).toContain(extId);
      expect(generalIds).not.toContain(extId);
    }
    expect(internalIds).toHaveLength(INTERNAL_EXTENSION_SECTION_IDS.length);
  });

  it('die beiden Verwaltungs-Sektionen stehen am Ende von „Allgemein"', () => {
    document.body.innerHTML = '';
    state.areaPath = null;
    const container = mountPage();
    const generalIds = navIds(container, 'general');
    expect(generalIds.slice(-2)).toEqual(['extensions', 'extensionsExternal']);
  });

  it('der interne Erweiterungs-Block ist alphabetisch nach lokalisiertem Titel sortiert', () => {
    document.body.innerHTML = '';
    state.areaPath = null;
    const container = mountPage();
    const titel = [
      ...container.querySelectorAll('[data-nav-group="extensionsInternal"] .settings-nav-entry'),
    ].map((b) => b.textContent);
    expect(titel).toEqual([...titel].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('Sektionen externer Erweiterungen bilden den vierten Block, sonst fehlt er', () => {
    document.body.innerHTML = '';
    state.areaPath = null;
    // Ohne externen Beitrag existiert der Block nicht.
    expect(mountPage().querySelectorAll('[data-nav-group="extensionsExternal"]')).toHaveLength(0);
    settingsPage.registerSettingsSection({
      id: 'ext-test-erweiterung-settings',
      titleKey: 'settings.title',
      // Herkunfts-Marke, die der Erweiterungs-Host beim Durchreichen setzt.
      origin: 'external',
      render: () => {},
    });
    try {
      document.body.innerHTML = '';
      const container = mountPage();
      expect(navIds(container, 'extensionsExternal')).toEqual(['ext-test-erweiterung-settings']);
      expect(navIds(container, 'general')).not.toContain('ext-test-erweiterung-settings');
      // Der Block steht hinter dem internen Erweiterungs-Block.
      const gruppen = [...container.querySelectorAll('.settings-nav-group')].map(
        (g) => g.dataset.navGroup,
      );
      expect(gruppen).toEqual(['general', 'extensionsInternal', 'extensionsExternal']);
    } finally {
      settingsPage.unregisterSettingsSection('ext-test-erweiterung-settings');
    }
  });

  it('bereichsgebundene Sektionen bleiben trotz Erweiterungs-Herkunft im Bereichs-Block', () => {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/testbereich';
    try {
      const container = mountPage();
      const areaIds = navIds(container, 'area');
      // „journals" gehört laut Registry zur Erweiterung journals, trägt aber
      // group 'area' — der Bereichs-Bezug ist die stärkere Klammer.
      expect(areaIds).toContain('journals');
      expect(navIds(container, 'extensionsInternal')).not.toContain('journals');
    } finally {
      state.areaPath = null;
    }
  });
});

// 4T-000554 (Epic 3E-000100): Speicher-Status der Schaltflächen — „Anwenden"
// und „OK" tragen die Primary-Hervorhebung nur bei ungesicherten
// Änderungen; „Anwenden" ist ohne Änderungen deaktiviert, „OK" bleibt
// immer klickbar. Die Erkennung ist bereichsübergreifend (dirty-Hooks der
// Registry spiegeln die Änderungs-Prüfung der apply-Hooks).
describe('Speicher-Status der Einstellungs-Buttons (4T-000554, Epic 3E-000100)', () => {
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

describe('Validierungs-Blockade von Anwenden/OK (4T-000278)', () => {
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

// 4T-001885 (Epic 3E-000189, Story 4S-000994): Der bereichsgebundene Block
// benennt den geöffneten Gegenstand, und an seiner ersten Stelle steht der
// Abschnitt mit dessen eigenen Angaben.
//
// Maßgeblich ist die Bindung des FENSTERS: state.bookName und state.shelfName
// kommen aus der Applikations-Bindung des Hauptprozesses und wechseln nicht mit
// dem Reiter im Vordergrund. Die Fälle stellen sie deshalb direkt.
describe('Buch- und Regal-Bezug des Bereichs-Blocks (4T-001885, Epic 3E-000189)', () => {
  function mitBindung({ buch = null, regal = null } = {}, fn) {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/Reise';
    state.bookName = buch;
    state.shelfName = regal;
    try {
      return fn();
    } finally {
      state.areaPath = null;
      state.bookName = null;
      state.shelfName = null;
    }
  }

  function gruppenTitel(container, gruppe) {
    const block = container.querySelector(`[data-nav-group="${gruppe}"]`);
    return block ? block.querySelector('.settings-nav-group-title').textContent : null;
  }

  function bereichsIds(container) {
    return [...container.querySelectorAll('[data-nav-group="area"] .settings-nav-entry')].map(
      (b) => b.dataset.sectionId,
    );
  }

  it('AK1: der Block heißt je nach Bindung Buch, Bücherregal oder Bereich', () => {
    mitBindung({ buch: 'Reise' }, () => {
      expect(gruppenTitel(mountPage(), 'area')).toBe(t('settings.navGroup.book'));
    });
    mitBindung({ regal: 'Bibliothek' }, () => {
      expect(gruppenTitel(mountPage(), 'area')).toBe(t('settings.navGroup.shelf'));
    });
    mitBindung({}, () => {
      expect(gruppenTitel(mountPage(), 'area')).toBe(t('settings.navGroup.area'));
    });
  });

  it('AK10: die Block-Liste bleibt vierteilig — kein zweiter Block neben dem Bereichs-Block', () => {
    mitBindung({ buch: 'Reise' }, () => {
      const gruppen = [...mountPage().querySelectorAll('.settings-nav-group')].map(
        (g) => g.dataset.navGroup,
      );
      expect(gruppen).toEqual(['general', 'area', 'extensionsInternal']);
    });
  });

  it('AK3 und AK9: der Abschnitt steht bei Buch und Regal vorn, im Bereich fehlt er', () => {
    mitBindung({ buch: 'Reise' }, () => {
      expect(bereichsIds(mountPage())[0]).toBe('bookInfo');
    });
    mitBindung({ regal: 'Bibliothek' }, () => {
      expect(bereichsIds(mountPage())[0]).toBe('bookInfo');
    });
    mitBindung({}, () => {
      expect(bereichsIds(mountPage())).not.toContain('bookInfo');
    });
  });

  it('AK8: die bereichsgebundenen Abschnitte bleiben unverändert darunter stehen', () => {
    // Ohne Buch stehen die festen Bereichs-Abschnitte (die Sidebar-Varianten
    // registrieren sich erst zur Laufzeit der Anwendung, die Datenbank-Sektion
    // nur in einem Datenbank-Bereich). Mit Buch ist die Liste dieselbe — vorne
    // kommt genau ein Abschnitt dazu, und keiner verschwindet.
    const ohne = mitBindung({}, () => bereichsIds(mountPage()));
    const mit = mitBindung({ buch: 'Reise' }, () => bereichsIds(mountPage()));
    expect(ohne.length).toBeGreaterThan(0);
    expect(mit).toEqual(['bookInfo', ...ohne]);
  });

  it('AK2 und AK14: die Beschriftungs-Schlüssel folgen dem Bezug, der Name bleibt außen vor', () => {
    const schluessel = {
      area: 'settings.templates.areaGroup',
      book: 'settings.templates.bookGroup',
      shelf: 'settings.templates.shelfGroup',
    };
    mitBindung({ buch: 'Reise' }, () => {
      expect(kontextSchluessel(schluessel)).toBe('settings.templates.bookGroup');
    });
    mitBindung({ regal: 'Bibliothek' }, () => {
      expect(kontextSchluessel(schluessel)).toBe('settings.templates.shelfGroup');
    });
    mitBindung({}, () => {
      expect(kontextSchluessel(schluessel)).toBe('settings.templates.areaGroup');
    });
  });

  it('AK11: fällt die Bindung weg, fällt der offene Abschnitt auf „Darstellung" zurück', () => {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/Reise';
    state.bookName = 'Reise';
    try {
      const container = mountPage();
      container.querySelector('.settings-nav-entry[data-section-id="bookInfo"]').click();
      expect(settingsPage.settingsPageStateForTests().activeSectionId).toBe('bookInfo');
      // Derselbe Weg wie im Betrieb: Der Bindungs-Wechsel meldet sich über den
      // Bereichs-Wechsel der offenen Seite.
      state.areaPath = null;
      state.bookName = null;
      settingsPage.refreshSettingsPageForAreaChange();
      expect(settingsPage.settingsPageStateForTests().activeSectionId).toBe('appearance');
      expect(container.querySelector('[data-nav-group="area"]')).toBeNull();
    } finally {
      state.areaPath = null;
      state.bookName = null;
    }
  });
});

// 4T-001885: Lesen, Ändern und Schreiben der eigenen Angaben. Gemessen wird die
// Strecke vom Formular bis an die Brücke; dass die Brücke an derselben Stelle
// liest und schreibt, misst test/unit/books-angaben.test.js am echten Ordner.
describe('Eigene Angaben lesen und schreiben (4T-001885, Epic 3E-000189)', () => {
  const ANGABEN = {
    ok: true,
    title: 'Reise nach Ithaka',
    author: 'K. P. Kavafis',
    description: 'Eine Heimkehr\nin Etappen.',
    cover: 'titel.png',
    coverGefunden: true,
  };

  // Gewartet wird auf den Zustand, nie auf eine Frist: Der Entwurf meldet
  // selbst, wann die nachgereichten Werte da sind.
  async function warteAufAngaben() {
    for (let i = 0; i < 100; i += 1) {
      const draft = settingsPage.settingsPageStateForTests().draft;
      if (draft && draft.bookInfo && draft.bookInfo.geladen) return;
      await Promise.resolve();
    }
    throw new Error('Die eigenen Angaben sind nicht im Entwurf angekommen.');
  }

  async function mountMitBuch(angaben = ANGABEN) {
    document.body.innerHTML = '';
    state.areaPath = 'C:/tmp/Reise';
    state.bookName = 'Reise';
    const alt = window.api.books;
    const geschrieben = [];
    window.api.books = {
      getInfo: async () => angaben,
      setInfo: async (werte) => {
        geschrieben.push(werte);
        return { ok: true };
      },
    };
    const container = mountPage();
    await warteAufAngaben();
    container.querySelector('.settings-nav-entry[data-section-id="bookInfo"]').click();
    return {
      container,
      geschrieben,
      aufraeumen() {
        window.api.books = alt;
        state.areaPath = null;
        state.bookName = null;
      },
    };
  }

  it('AK4 und AK19: die vier Angaben stehen in den Feldern, mehrzeilig und mit Sonderzeichen', async () => {
    const lauf = await mountMitBuch();
    try {
      expect(lauf.container.querySelector('#settings-book-info-title').value).toBe(
        'Reise nach Ithaka',
      );
      expect(lauf.container.querySelector('#settings-book-info-author').value).toBe(
        'K. P. Kavafis',
      );
      const beschreibung = lauf.container.querySelector('#settings-book-info-description');
      expect(beschreibung.tagName).toBe('TEXTAREA');
      expect(beschreibung.value).toBe('Eine Heimkehr\nin Etappen.');
      expect(lauf.container.querySelector('#settings-book-info-cover').value).toBe('titel.png');
      // Beim Buch gibt es keine Darstellungs-Wahl; die hat nur das Regal (AK5).
      expect(lauf.container.querySelector('#settings-book-info-view-mode')).toBeNull();
    } finally {
      lauf.aufraeumen();
    }
  });

  it('AK6: eine Änderung geht an dieselbe Stelle, aus der gelesen wurde', async () => {
    const lauf = await mountMitBuch();
    try {
      const titel = lauf.container.querySelector('#settings-book-info-title');
      titel.value = 'Ithaka';
      titel.dispatchEvent(new Event('input', { bubbles: true }));
      expect(settingsPage.isSettingsPageDirty()).toBe(true);
      expect(await settingsPage.applySettingsPage()).toBe(true);
      expect(lauf.geschrieben).toEqual([
        {
          title: 'Ithaka',
          author: 'K. P. Kavafis',
          description: 'Eine Heimkehr\nin Etappen.',
          cover: 'titel.png',
        },
      ]);
      expect(settingsPage.isSettingsPageDirty()).toBe(false);
    } finally {
      lauf.aufraeumen();
    }
  });

  it('AK16: fehlende Angaben sind leere Felder, ein ins Leere zeigendes Bild nur ein Hinweis', async () => {
    const lauf = await mountMitBuch({
      ok: true,
      title: '',
      author: '',
      description: '',
      cover: 'fehlt.png',
      coverGefunden: false,
    });
    try {
      expect(lauf.container.querySelector('#settings-book-info-title').value).toBe('');
      expect(lauf.container.querySelector('#settings-book-info-author').value).toBe('');
      expect(lauf.container.querySelector('#settings-book-info-cover-missing')).not.toBeNull();
      // Kein Fehler: Der Abschnitt trägt keine Fehler-Markierung.
      expect(
        lauf.container
          .querySelector('.settings-nav-entry[data-section-id="bookInfo"]')
          .classList.contains('has-error'),
      ).toBe(false);
    } finally {
      lauf.aufraeumen();
    }
  });

  it('eine unlesbare Datei meldet sich als Hinweis statt als leeres Formular', async () => {
    const lauf = await mountMitBuch({ ok: false, error: 'invalid' });
    try {
      expect(lauf.container.querySelector('#settings-book-info-title')).toBeNull();
      expect(lauf.container.querySelector('.settings-section-body').textContent).toBe(
        t('settings.bookInfo.unavailable'),
      );
      expect(settingsPage.isSettingsPageDirty()).toBe(false);
    } finally {
      lauf.aufraeumen();
    }
  });
});
