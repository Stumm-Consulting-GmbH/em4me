// @vitest-environment jsdom
// 4T-002098 (Epic 3E-000323): Zahlen-Grenze der Pflege «Kalender-Systeme» und
// die Führung der Einstellungs-Seite zu einem ungültigen Bereich.
//
// Befund am gebauten Programm: Ein Kalender mit sechzehnstelligem Maßstab
// (Zähler 1000000000000000) lud der Kern und rechnete damit, die Pflege las
// höchstens fünfzehn Ziffern und hielt den Kalender für ungültig. Weil die
// Einstellungs-Seite vor dem Anwenden jeden Bereich prüft, wirkten «OK» und
// «Anwenden» danach auf JEDER Seite nicht — sichtbar war allein die rote
// Markierung an «Kalender-Systeme» in der Navigation.
//
// 4T-002107: Die beim Anwenden ermittelte Fehler-Auskunft folgt danach dem
// Entwurf, statt bis zum nächsten Anwenden stehen zu bleiben.
import { describe, it, expect, vi, afterEach } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
// Die geteilten Module brauchen kein window.api und stehen deshalb statisch da.
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { CALENDAR_TEMPLATES } from '../../../src/shared/calendar/calendar-templates.js';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { t } = i18n;

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { calSysInt, calendarPersistForm, dirtyCalendarSection, readCalendarFromConfig } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection, validateCalendarSection, renderCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');

const GROESSTER_SICHERER = Number.MAX_SAFE_INTEGER; // 9007199254740991, sechzehn Ziffern
const SECHZEHN_ZIFFERN = 1000000000000000;

// Gregorianische Vorlage der Sammlung, ergänzt um die Angaben eines Falls.
function gregorianisch(extra = {}) {
  const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(t);
  return { id: 'gregor', ...definition, name: 'Gregor', ...extra };
}

// Konfiguration so, wie sie der Hauptprozess liefert: vom Kern normalisiert.
function bereichsKonfiguration(definition) {
  return normalizeCalendarConfig({
    blocks: [{ id: 'welt', name: 'Welt', calendars: [definition] }],
  });
}

// Der Weg der Einstellungs-Seite beim Öffnen: Konfiguration lesen, Entwurf
// und Schnappschuss bilden.
async function geladenerEntwurf(definition) {
  const config = bereichsKonfiguration(definition);
  window.api.calendarGetConfig = vi.fn(async () => ({ hasArea: true, areaName: 'Welt', config }));
  const { draft, snapshot } = await readCalendarFromConfig();
  return { config, entwurf: { calendar: draft, calendarSnapshot: snapshot } };
}

afterEach(() => {
  delete window.api.calendarGetConfig;
  delete window.api.calendarSetAreaConfig;
});

describe('4T-002098: Pflege und Kern lesen ganze Zahlen mit derselben Grenze', () => {
  it('4T-002098: sechzehn Ziffern und der größte sichere Wert gelten als Zahl', () => {
    expect(calSysInt('1000000000000000')).toBe(SECHZEHN_ZIFFERN);
    expect(calSysInt('9007199254740991')).toBe(GROESSTER_SICHERER);
    expect(calSysInt('-9007199254740991')).toBe(-GROESSTER_SICHERER);
    expect(calSysInt(' 42 ')).toBe(42);
  });

  it('4T-002098: jenseits der sicheren Grenze und Nicht-Zahlen bleiben ungültig', () => {
    expect(calSysInt('9007199254740992')).toBeNull();
    expect(calSysInt('-9007199254740992')).toBeNull();
    expect(calSysInt('12345678901234567890')).toBeNull();
    expect(calSysInt('')).toBeNull();
    expect(calSysInt('1.5')).toBeNull();
    expect(calSysInt('1e3')).toBeNull();
    expect(calSysInt('+7')).toBeNull();
  });
});

describe('4T-002098: Laden, Entwurf und Anwenden ohne Änderung', () => {
  const faelle = [
    ['Maßstab mit sechzehn Ziffern', { blockScale: { num: SECHZEHN_ZIFFERN, den: 1 } }],
    ['Maßstab mit dem größten sicheren Wert', { blockScale: { num: 7, den: GROESSTER_SICHERER } }],
    ['Anker-Jahr mit sechzehn Ziffern', { blockAnchor: [SECHZEHN_ZIFFERN, 1, 1, 0, 0, 0] }],
  ];

  it.each(faelle)(
    '4T-002098: %s — vom Kern angenommen, in der Pflege gültig',
    async (_f, extra) => {
      const { config, entwurf } = await geladenerEntwurf(gregorianisch(extra));
      // Vorbedingung: Der Kern nimmt die Definition an.
      expect(config.blocks[0].calendars).toHaveLength(1);
      expect(validateCalendarSection(entwurf)).toBeNull();
    },
  );

  it.each(faelle)('4T-002098: %s — übersteht den Rundlauf unverändert', async (_f, extra) => {
    const { config, entwurf } = await geladenerEntwurf(gregorianisch(extra));
    const geladen = config.blocks[0].calendars[0];
    const ablage = calendarPersistForm(entwurf.calendar.blocks[0].calendars[0]);
    const zurueck = bereichsKonfiguration(ablage).blocks[0].calendars[0];
    expect(zurueck).toStrictEqual(geladen);
    // Ohne Änderung meldet die Pflege nichts Ungesichertes und schreibt nichts.
    expect(dirtyCalendarSection(entwurf)).toBe(false);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    await applyCalendarSection(entwurf);
    expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });
});

describe('4T-002098: Eingabe jenseits der sicheren Grenze', () => {
  it('4T-002098: ein zu großer Maßstab wird in der Pflege mit Meldung abgewiesen', async () => {
    const { entwurf } = await geladenerEntwurf(
      gregorianisch({ blockScale: { num: SECHZEHN_ZIFFERN, den: 1 } }),
    );
    entwurf.calendar.openBlock = 0;
    document.body.innerHTML = '';
    renderCalendarSection(document.body, entwurf);
    const zaehler = document.getElementById('settings-calsys-scale-num-0');
    const hinweis = document.getElementById('settings-calsys-cal-invalid-0');
    expect(hinweis.hidden).toBe(true);
    zaehler.value = '9007199254740992';
    zaehler.dispatchEvent(new Event('input'));
    // Weich im Entwurf: Hinweis-Zeile am Kalender.
    expect(hinweis.hidden).toBe(false);
    expect(hinweis.textContent).toBe(t('settings.calendar.invalidHint'));
    // Hart beim Anwenden: Fehlertext des Bereichs mit Kalender und Block.
    expect(validateCalendarSection(entwurf)).toBe(
      t('settings.calendar.error.calInvalid')
        .replace('{name}', 'Gregor')
        .replace('{block}', 'Welt'),
    );
  });
});

// Seiten-Lebenszyklus wie beim echten Öffnen: onOpen baut den frischen
// Entwurf, mount montiert das DOM.
function mountPage() {
  document.body.innerHTML = '';
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

const seitenStand = () => settingsPage.settingsPageStateForTests();

function fehlerZeile(container) {
  return container.querySelector('.settings-section-error');
}

describe('4T-002098: «OK» und «Anwenden» wirken nie still nicht', () => {
  afterEach(() => {
    settingsPage.unregisterSettingsSection('test-fehler-2098');
  });

  function registriereFehlerBereich(fehler) {
    settingsPage.registerSettingsSection({
      id: 'test-fehler-2098',
      titleKey: 'settings.title',
      render: (body) => {
        body.textContent = 'Inhalt des Bereichs mit Fehler';
      },
      validate: () => fehler.text,
    });
  }

  it('4T-002098: «Anwenden» führt vom aktiven Bereich zum Bereich mit Fehler und zeigt die Meldung', async () => {
    const fehler = { text: 'Fehlertext des Bereichs' };
    registriereFehlerBereich(fehler);
    const container = mountPage();
    expect(seitenStand().activeSectionId).toBe('appearance');
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(seitenStand().activeSectionId).toBe('test-fehler-2098');
    expect(container.querySelector('.settings-section-body').textContent).toBe(
      'Inhalt des Bereichs mit Fehler',
    );
    expect(fehlerZeile(container).hidden).toBe(false);
    expect(fehlerZeile(container).textContent).toBe('Fehlertext des Bereichs');
    const eintrag = container.querySelector(
      '.settings-nav-entry[data-section-id="test-fehler-2098"]',
    );
    expect(eintrag.classList.contains('active')).toBe(true);
    expect(eintrag.classList.contains('has-error')).toBe(true);
  });

  it('4T-002098: «OK» bleibt auf der Seite und zeigt den Bereich mit Fehler', async () => {
    registriereFehlerBereich({ text: 'Fehlertext des Bereichs' });
    const container = mountPage();
    await settingsPage.okSettingsPage();
    expect(seitenStand().activeSectionId).toBe('test-fehler-2098');
    expect(fehlerZeile(container).textContent).toBe('Fehlertext des Bereichs');
  });

  it('4T-002098: hat der aktive Bereich selbst einen Fehler, bleibt die Seite dort', async () => {
    registriereFehlerBereich({ text: 'Fehlertext des Bereichs' });
    const container = mountPage();
    const draft = seitenStand().draft;
    draft.taskStates.push({ char: '', builtin: false, color: '#888888', enabled: true, label: '' });
    container.querySelector('.settings-nav-entry[data-section-id="taskStates"]').click();
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(seitenStand().activeSectionId).toBe('taskStates');
    expect(fehlerZeile(container).hidden).toBe(false);
    expect(fehlerZeile(container).textContent).toBe(seitenStand().errors.get('taskStates'));
  });
});

describe('4T-002098: Kalender-Systeme auf der Einstellungs-Seite', () => {
  // Gewartet wird auf den Zustand, nie auf eine Frist: Der Entwurf meldet
  // selbst, wann die Kalender-Konfiguration da ist.
  async function warteAufKalender() {
    for (let i = 0; i < 100; i += 1) {
      const draft = seitenStand().draft;
      if (draft && draft.calendar) return draft;
      await Promise.resolve();
    }
    throw new Error('Die Kalender-Konfiguration ist nicht im Entwurf angekommen.');
  }

  // Eine Definition oder eine Liste von Definitionen im Block «Welt».
  async function mountMitKalender(definition) {
    state.areaPath = 'C:/tmp/Welt';
    const config = normalizeCalendarConfig({
      blocks: [{ id: 'welt', name: 'Welt', calendars: [].concat(definition) }],
    });
    window.api.calendarGetConfig = vi.fn(async () => ({ hasArea: true, areaName: 'Welt', config }));
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    const container = mountPage();
    const draft = await warteAufKalender();
    return { container, draft };
  }

  afterEach(() => {
    state.areaPath = null;
  });

  it('4T-002098: mit sechzehnstelligem Maßstab wirkt «Anwenden», ohne die Kalender anzurühren', async () => {
    const { draft } = await mountMitKalender(
      gregorianisch({ blockScale: { num: SECHZEHN_ZIFFERN, den: 1 } }),
    );
    expect(draft.calendar.hasArea).toBe(true);
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(seitenStand().errors.size).toBe(0);
    expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });

  it('4T-002098: ein ungültiger Kalender führt zu «Kalender-Systeme» und zeigt dessen Fehlertext', async () => {
    const { container, draft } = await mountMitKalender(gregorianisch());
    draft.calendar.blocks[0].calendars[0].scaleNum = '9007199254740992';
    expect(seitenStand().activeSectionId).toBe('appearance');
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(seitenStand().activeSectionId).toBe('calendarSystems');
    expect(fehlerZeile(container).hidden).toBe(false);
    expect(fehlerZeile(container).textContent).toBe(
      t('settings.calendar.error.calInvalid')
        .replace('{name}', 'Gregor')
        .replace('{block}', 'Welt'),
    );
    expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });

  // 4T-002098 (E3): Ein Bestand, den der Kern annimmt und die Pflege ablehnt —
  // zwei Kalender, deren Namen sich nur in der Groß-/Kleinschreibung
  // unterscheiden, unter verschiedenen Kennungen.
  const gleichBenannt = () => [
    gregorianisch({ id: 'gregor-1', name: 'Gregor' }),
    gregorianisch({ id: 'gregor-2', name: 'gregor' }),
  ];

  // Eine Änderung in einem anderen Bereich: ein Bereich mit Änderungs-
  // Erkennung, der eine Änderung meldet und sie beim Anwenden zählt.
  function registriereGeaendertenBereich() {
    const lauf = { angewendet: 0 };
    settingsPage.registerSettingsSection({
      id: 'test-aenderung-2098',
      titleKey: 'settings.title',
      render: () => {},
      dirty: () => true,
      apply: () => {
        lauf.angewendet += 1;
      },
    });
    return lauf;
  }

  afterEach(() => {
    settingsPage.unregisterSettingsSection('test-aenderung-2098');
    settingsPage.unregisterSettingsSection('test-ohne-erkennung-2098');
  });

  it('4T-002098: ein unveränderter, von der Pflege abgelehnter Kalender-Bestand hält eine Änderung anderswo nicht auf', async () => {
    const lauf = registriereGeaendertenBereich();
    const { container, draft } = await mountMitKalender(gleichBenannt());
    // Vorbedingung: Der Kern hat beide geladen, die Pflege lehnt den Stand ab.
    expect(draft.calendar.blocks[0].calendars).toHaveLength(2);
    expect(validateCalendarSection(draft)).not.toBeNull();
    const vorher = structuredClone(draft.calendar);
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(lauf.angewendet).toBe(1);
    expect(seitenStand().errors.size).toBe(0);
    expect(seitenStand().activeSectionId).toBe('appearance');
    // Die Kalender-Systeme sind weder markiert noch geschrieben noch verändert.
    expect(
      container
        .querySelector('.settings-nav-entry[data-section-id="calendarSystems"]')
        .classList.contains('has-error'),
    ).toBe(false);
    expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
    expect(draft.calendar).toStrictEqual(vorher);
  });

  it('4T-002098: derselbe Bestand mit einer Änderung in den Kalender-Systemen blockiert mit Hinführen und Meldung', async () => {
    const { container, draft } = await mountMitKalender(gleichBenannt());
    draft.calendar.blocks[0].name = 'Weltenlauf';
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(seitenStand().activeSectionId).toBe('calendarSystems');
    expect(fehlerZeile(container).hidden).toBe(false);
    expect(fehlerZeile(container).textContent).toBe(
      t('settings.calendar.error.duplicateName').replace('{name}', 'gregor'),
    );
    expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });

  it('4T-002098: ein Bereich ohne Änderungs-Erkennung wird weiter immer geprüft', async () => {
    const lauf = registriereGeaendertenBereich();
    settingsPage.registerSettingsSection({
      id: 'test-ohne-erkennung-2098',
      titleKey: 'settings.title',
      render: () => {},
      validate: () => 'Fehler ohne Änderungs-Erkennung',
    });
    const { container } = await mountMitKalender(gregorianisch());
    expect(await settingsPage.applySettingsPage()).toBe(false);
    expect(lauf.angewendet).toBe(0);
    expect(seitenStand().activeSectionId).toBe('test-ohne-erkennung-2098');
    expect(fehlerZeile(container).textContent).toBe('Fehler ohne Änderungs-Erkennung');
  });

  // 4T-002107 (Epic 3E-000323): Befund am gebauten Programm — nach einem
  // abgewiesenen «Anwenden» blieben Meldungs-Zeile und rote Markierung stehen,
  // obwohl der Anwender den Wert korrigiert hatte und der Hinweis am Kalender
  // schon verschwunden war. Die Fälle geben ein wie der Anwender: Eingabe ins
  // Feld, das Ereignis steigt bis zum Dokument auf.
  describe('4T-002107: Fehler-Auskunft nach «Anwenden» folgt dem Entwurf', () => {
    const ZU_GROSS = '9007199254740992';

    function eingeben(feld, wert) {
      feld.value = wert;
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const navEintrag = (container, id = 'calendarSystems') =>
      container.querySelector(`.settings-nav-entry[data-section-id="${id}"]`);

    // Ein Kalender mit zu großem Maßstab, angewendet und abgewiesen.
    async function abgewiesenerKalender() {
      const { container, draft } = await mountMitKalender(gregorianisch());
      draft.calendar.openBlock = 0;
      const kalender = draft.calendar.blocks[0].calendars[0];
      const geladen = kalender.scaleNum;
      kalender.scaleNum = ZU_GROSS;
      expect(await settingsPage.applySettingsPage()).toBe(false);
      // Vorbedingung: Die Seite steht auf dem Bereich, Meldung und Markierung da.
      expect(seitenStand().activeSectionId).toBe('calendarSystems');
      expect(fehlerZeile(container).hidden).toBe(false);
      expect(navEintrag(container).classList.contains('has-error')).toBe(true);
      const zaehler = container.querySelector('#settings-calsys-scale-num-0');
      expect(zaehler.value).toBe(ZU_GROSS);
      return { container, draft, geladen, zaehler };
    }

    function ohneAuskunft(container) {
      expect(seitenStand().errors.size).toBe(0);
      expect(fehlerZeile(container).hidden).toBe(true);
      expect(fehlerZeile(container).textContent).toBe('');
      expect(navEintrag(container).classList.contains('has-error')).toBe(false);
    }

    it('4T-002107: korrigierter Wert nimmt Meldung und Markierung ohne erneutes Anwenden weg', async () => {
      const { container, draft, zaehler } = await abgewiesenerKalender();
      eingeben(zaehler, '2');
      // Vorbedingung: Der Bereich ist geändert und gültig.
      expect(dirtyCalendarSection(draft)).toBe(true);
      expect(validateCalendarSection(draft)).toBeNull();
      ohneAuskunft(container);
      expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
    });

    it('4T-002107: weiter ungültiger Wert lässt Meldung und Markierung stehen', async () => {
      const { container, zaehler } = await abgewiesenerKalender();
      eingeben(zaehler, '12345678901234567890');
      expect(fehlerZeile(container).hidden).toBe(false);
      expect(fehlerZeile(container).textContent).toBe(
        t('settings.calendar.error.calInvalid')
          .replace('{name}', 'Gregor')
          .replace('{block}', 'Welt'),
      );
      expect(navEintrag(container).classList.contains('has-error')).toBe(true);
    });

    it('4T-002107: auf den geladenen Stand zurückgestellter Entwurf nimmt die Meldung weg', async () => {
      const { container, draft, geladen, zaehler } = await abgewiesenerKalender();
      eingeben(zaehler, geladen);
      // Vorbedingung: Nichts mehr anzuwenden.
      expect(dirtyCalendarSection(draft)).toBe(false);
      ohneAuskunft(container);
    });

    it('4T-002107: vor dem ersten Anwenden erzeugt eine ungültige Eingabe weder Meldung noch Markierung', async () => {
      const { container, draft } = await mountMitKalender(gregorianisch());
      draft.calendar.openBlock = 0;
      navEintrag(container).click();
      eingeben(container.querySelector('#settings-calsys-scale-num-0'), ZU_GROSS);
      // Weich im Entwurf: der Hinweis am Kalender, sonst nichts.
      expect(container.querySelector('#settings-calsys-cal-invalid-0').hidden).toBe(false);
      expect(validateCalendarSection(draft)).not.toBeNull();
      ohneAuskunft(container);
    });

    // Die Neubewertung sitzt an der gemeinsamen Stelle und gilt für jeden
    // Bereich mit eigener Prüfung, auch für einen ohne Änderungs-Erkennung.
    it('4T-002107: ein anderer Bereich zeigt den jetzigen Fehler und verliert ihn, sobald er gültig ist', async () => {
      const fehler = { text: 'Erster Fehler' };
      settingsPage.registerSettingsSection({
        id: 'test-ohne-erkennung-2098',
        titleKey: 'settings.title',
        render: () => {},
        validate: () => fehler.text,
      });
      const { container } = await mountMitKalender(gregorianisch());
      expect(await settingsPage.applySettingsPage()).toBe(false);
      const eintrag = () => navEintrag(container, 'test-ohne-erkennung-2098');
      expect(fehlerZeile(container).textContent).toBe('Erster Fehler');
      fehler.text = 'Jetziger Fehler';
      document.dispatchEvent(new Event('input'));
      expect(fehlerZeile(container).textContent).toBe('Jetziger Fehler');
      expect(eintrag().classList.contains('has-error')).toBe(true);
      fehler.text = null;
      document.dispatchEvent(new Event('change'));
      expect(fehlerZeile(container).hidden).toBe(true);
      expect(eintrag().classList.contains('has-error')).toBe(false);
    });
  });
});
