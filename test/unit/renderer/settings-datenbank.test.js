// @vitest-environment jsdom
// 4T-001758 (Epic 3E-000253, AK4 und AK5): Unit-Tests des Einstellungs-Bereichs
// «Datenbank» — Registrierung samt Gruppen-Zuordnung, die Sichtbarkeits-
// Bedingung und der Inhalt der Auskunft.
//
// Die Sichtbarkeit wird an der Navigation geprüft und nicht nur am Prädikat:
// Die Zusage von AK4 ist, dass der Abschnitt dort steht beziehungsweise dort
// fehlt, und ein Prädikat allein belegt das nicht.
import { describe, it, expect, afterEach } from 'vitest';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const settingsDb = await import('../../../src/renderer/modules/settings/settings-database.js');
const settingsShared = await import('../../../src/renderer/modules/settings/settings-shared.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { intlLocale } = await import('../../../src/renderer/i18n.js');

// Ein Entwurfs-Stand, wie ihn readDatabaseFromConfig in einem Bereich mit
// Datenbank liefert.
function datenbankEntwurf(ueberschreibungen = {}) {
  return {
    hasArea: true,
    istDatenbankBereich: true,
    steckbrief: { name: 'Mini-CRM', description: 'Kontakte und Firmen' },
    tabellenZahl: 2,
    fehlerZahl: 0,
    overviewOnOpen: false,
    ...ueberschreibungen,
  };
}

// Seite montieren und den Datenbank-Entwurf hineinsetzen, so wie es der
// asynchrone Nachzug tut; danach die Navigation neu aufbauen.
function mountMitEntwurf(database) {
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const pageState = settingsShared.settingsPageStateForTests();
  if (database !== undefined) {
    pageState.draft.database = database;
    pageState.draft.databaseSnapshot = { overviewOnOpen: database.overviewOnOpen === true };
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

function navIds(container, gruppe = 'area') {
  return [...container.querySelectorAll(`[data-nav-group="${gruppe}"] .settings-nav-entry`)].map(
    (b) => b.dataset.sectionId,
  );
}

afterEach(() => {
  state.areaPath = null;
  document.body.innerHTML = '';
});

describe('Einstellungs-Bereich Datenbank: Registrierung (AK4)', () => {
  it('steht in der Registry und gehört zur Gruppe «Aktueller Bereich»', () => {
    const section = settingsPage.allSettingsSections().find((s) => s.id === 'database');
    expect(section).toBeTruthy();
    expect(section.group).toBe('area');
    expect(section.titleKey).toBe('settings.database.title');
    // Die Kennung ist die, die der Erweiterungs-Schalter aufnimmt; sie muss
    // deshalb genau so heißen.
    expect(section.id).toBe('database');
  });
});

describe('Einstellungs-Bereich Datenbank: Sichtbarkeit (AK4)', () => {
  it('erscheint in einem Bereich mit Datenbank', () => {
    state.areaPath = 'C:/tmp/datenbank-bereich';
    const container = mountMitEntwurf(datenbankEntwurf());
    expect(navIds(container)).toContain('database');
  });

  it('fehlt in einem Bereich ohne Datenbank', () => {
    state.areaPath = 'C:/tmp/prosa-bereich';
    const container = mountMitEntwurf(datenbankEntwurf({ istDatenbankBereich: false }));
    expect(navIds(container)).not.toContain('database');
  });

  it('fehlt ohne gebundenen Bereich', () => {
    state.areaPath = null;
    const container = mountMitEntwurf(datenbankEntwurf({ hasArea: false }));
    // Ohne Bereich entfällt die ganze Gruppe; die Sektion erscheint in keiner.
    const alle = [...container.querySelectorAll('.settings-nav-entry')].map(
      (b) => b.dataset.sectionId,
    );
    expect(alle).not.toContain('database');
  });

  it('fehlt, solange die Auskunft noch aussteht', () => {
    // Ein Abschnitt, der erst erscheint und dann wieder verschwindet, wäre die
    // schlechtere Auskunft als einer, der später dazukommt.
    state.areaPath = 'C:/tmp/datenbank-bereich';
    const container = mountMitEntwurf(undefined);
    expect(navIds(container)).not.toContain('database');
    expect(settingsDb.sichtbarDatabaseSection({})).toBe(false);
  });
});

describe('Einstellungs-Bereich Datenbank: Inhalt (AK5, AK6)', () => {
  function zeichne(database) {
    const container = document.createElement('div');
    settingsDb.renderDatabaseSection(container, { database });
    return container;
  }

  it('zeigt Name, Beschreibung, Tabellenzahl und Fehlerlagen', () => {
    const container = zeichne(datenbankEntwurf({ tabellenZahl: 3, fehlerZahl: 2 }));
    const text = container.textContent;
    expect(text).toContain('Mini-CRM');
    expect(text).toContain('Kontakte und Firmen');
    const werte = [...container.querySelectorAll('.settings-row .settings-row-hint')].map(
      (el) => el.textContent,
    );
    expect(werte).toContain('3');
    expect(werte).toContain('2');
  });

  it('zeigt eine Sprach-Zuordnung in der aktiven Sprache', () => {
    // Die aktive Sprache kommt aus dem Modul, damit der Fall nicht an einer
    // angenommenen Voreinstellung hängt.
    const aktiv = intlLocale();
    const container = zeichne(
      datenbankEntwurf({
        steckbrief: { name: { [aktiv]: 'Aktive Fassung', zz: 'Fremde Fassung' } },
      }),
    );
    expect(container.textContent).toContain('Aktive Fassung');
    expect(container.textContent).not.toContain('Fremde Fassung');
  });

  it('fällt bei fehlender aktiver Sprache auf die erste geschriebene Fassung zurück', () => {
    // Stufe 3 der Rückfall-Kette: Der Autor hat auf Deutsch angefangen, die
    // Anwendung läuft in einer Sprache, die er nicht gepflegt hat.
    const container = zeichne(
      datenbankEntwurf({ steckbrief: { name: { zz: 'Erste Fassung', yy: 'Zweite Fassung' } } }),
    );
    expect(container.textContent).toContain('Erste Fassung');
  });

  it('trägt die Option als Kontrollkästchen und schreibt sie in den Entwurf', () => {
    const database = datenbankEntwurf();
    const container = zeichne(database);
    const schalter = container.querySelector('#settings-database-overview-on-open');
    expect(schalter).toBeTruthy();
    expect(schalter.type).toBe('checkbox');
    expect(schalter.checked).toBe(false);

    schalter.checked = true;
    schalter.dispatchEvent(new window.Event('change'));
    expect(database.overviewOnOpen).toBe(true);
  });

  it('meldet die Änderung der Option als ungesichert', () => {
    const draft = { database: datenbankEntwurf({ overviewOnOpen: true }) };
    draft.databaseSnapshot = { overviewOnOpen: false };
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(true);
    draft.databaseSnapshot = { overviewOnOpen: true };
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(false);
  });

  it('meldet ohne Datenbank-Bereich nie eine ungesicherte Änderung', () => {
    // Sonst schriebe ein Anwenden in einen Bereich, der die Option gar nicht
    // anbietet.
    const draft = {
      database: datenbankEntwurf({ istDatenbankBereich: false, overviewOnOpen: true }),
      databaseSnapshot: { overviewOnOpen: false },
    };
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(false);
  });
});
