// @vitest-environment jsdom
// 4T-001758 (Epic 3E-000253, AK4 und AK5): Unit-Tests des Einstellungs-Bereichs
// «Datenbank» — Registrierung samt Gruppen-Zuordnung, die Sichtbarkeits-
// Bedingung und der Inhalt der Auskunft.
//
// Die Sichtbarkeit wird an der Navigation geprüft und nicht nur am Prädikat:
// Die Zusage von AK4 ist, dass der Abschnitt dort steht beziehungsweise dort
// fehlt, und ein Prädikat allein belegt das nicht.
//
// 4T-001795 (Epic 3E-000255, AK1 bis AK6 und AK12): dazu das Eingabefeld für
// den Namen des Sperr-Ordners — sein Entwurfs-Wert, seine Tastatur-Merkmale,
// die Meldung je Abweisungs-Grund und der Weg des Namens in den Kanal. Die
// Fälle stehen hier und nicht in einer zweiten Prüfdatei, weil ihr Gegenstand
// derselbe Einstellungs-Abschnitt ist; zwei Dateien über ein Modul hätten zwei
// Aufbauten desselben Entwurfs.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const settingsDb = await import('../../../src/renderer/modules/settings/settings-database.js');
const settingsShared = await import('../../../src/renderer/modules/settings/settings-shared.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { intlLocale } = await import('../../../src/renderer/i18n.js');
const { t } = await import('../../../src/renderer/i18n.js');
const { verwirfDatenbankAuskunft } =
  await import('../../../src/renderer/modules/database/datenbank-bereich.js');
const { DEFAULT_LOCK_FOLDER_NAME } =
  await import('../../../src/shared/database/lock-folder-name.js');

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
    // 4T-001795: Der Entwurf trägt seit dem Bedienweg den WIRKSAMEN Namen des
    // Sperr-Ordners; ohne eigene Angabe ist das der Vorgabe-Name.
    lockFolderName: DEFAULT_LOCK_FOLDER_NAME,
    ...ueberschreibungen,
  };
}

function schnappschussZu(database) {
  return {
    overviewOnOpen: database.overviewOnOpen === true,
    lockFolderName: database.lockFolderName,
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
    pageState.draft.databaseSnapshot = schnappschussZu(database);
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
    const database = datenbankEntwurf({ overviewOnOpen: true });
    const draft = { database };
    draft.databaseSnapshot = { ...schnappschussZu(database), overviewOnOpen: false };
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(true);
    draft.databaseSnapshot = schnappschussZu(database);
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(false);
  });

  it('meldet ohne Datenbank-Bereich nie eine ungesicherte Änderung', () => {
    // Sonst schriebe ein Anwenden in einen Bereich, der die Option gar nicht
    // anbietet.
    const database = datenbankEntwurf({ istDatenbankBereich: false, overviewOnOpen: true });
    const draft = {
      database,
      databaseSnapshot: { ...schnappschussZu(database), overviewOnOpen: false },
    };
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(false);
  });
});

// --- 4T-001795: Das Eingabefeld für den Namen des Sperr-Ordners ------------------------

// Der Kanal-Stub: Er hält fest, was die Oberfläche schickt, und liefert, was
// der Fall braucht. Ein echtes Anwenden gegen den Haupt-Prozess ist hier nicht
// der Gegenstand; geprüft wird der Bedienweg.
function stelleKanal(antwort) {
  const gesendet = [];
  window.api.setAreaDatabaseConfig = async (config) => {
    gesendet.push(config);
    return antwort;
  };
  return gesendet;
}

function zeichneAbschnitt(database) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  settingsDb.renderDatabaseSection(container, { database });
  return container;
}

function feldVon(container) {
  return container.querySelector('#settings-database-lock-folder');
}

function meldungVon(container) {
  return container.querySelector('#settings-database-lock-folder-message');
}

// Die zwölf Gründe, für die der Bedienort einen eigenen Text führt: die acht
// der geteilten Gültigkeits-Regel und die vier des Umbenennungs-Vorgangs.
const GRUENDE = [
  'leer',
  'zuLang',
  'reservierterName',
  'ohneFuehrendenPunkt',
  'nurPunkte',
  'pfadTrenner',
  'verbotenesZeichen',
  'endeUnzulaessig',
  'lockFolderTaken',
  'lockFolderBusy',
  'lockFolderRenameFailed',
  'lockFolderRollbackFailed',
];

// Bestands-Lesung im Modulkopf, nicht im Prüffall (test/README).
const DE_FRAGMENT = JSON.parse(
  fs.readFileSync(path.resolve('src/i18n/fragments/de/database.json'), 'utf8'),
);

function fuelle(text) {
  return text
    .replace('{max}', '64')
    .replace('{user}', 'bert')
    .replace('{machine}', 'SC-027')
    .replace('{old}', '.area-locks')
    .replace('{new}', '.neue-sperren');
}

function gefuellt(code) {
  return fuelle(t(`settings.database.lockFolderError.${code}`));
}

afterEach(() => {
  delete window.api.setAreaDatabaseConfig;
  delete window.api.getAreaDatabaseConfig;
  delete window.api.databaseOverview;
  verwirfDatenbankAuskunft({ bereichsWechsel: true });
});

describe('Sperr-Ordner: Entwurf und Anzeige (4T-001795, AK1, AK2)', () => {
  it('zeigt den wirksamen Namen im beschrifteten Eingabefeld', () => {
    const container = zeichneAbschnitt(datenbankEntwurf({ lockFolderName: '.eigene-sperren' }));
    const feld = feldVon(container);
    expect(feld).toBeTruthy();
    expect(feld.type).toBe('text');
    expect(feld.value).toBe('.eigene-sperren');
    expect(container.textContent).toContain(t('settings.database.lockFolder'));
    expect(container.textContent).toContain(t('settings.database.lockFolderHint'));
  });

  it('holt den wirksamen Namen über den bestehenden Kanal und fällt auf die Vorgabe', async () => {
    // Die Zusage von AK2: Der Entwurf zeigt den wirksamen Namen, und ohne
    // eigene Angabe ist das der Vorgabe-Name. Beide Lagen kommen über denselben
    // Kanal, ein neuer entsteht nicht.
    window.api.databaseOverview = async () => ({
      status: 'ready',
      istDatenbankBereich: true,
      steckbrief: { name: 'Mini-CRM' },
      tabellen: [],
      hints: [],
    });

    window.api.getAreaDatabaseConfig = async () => ({
      hasArea: true,
      overviewOnOpen: false,
      lockFolderName: '.eigene-sperren',
    });
    const mitAngabe = await settingsDb.readDatabaseFromConfig();
    expect(mitAngabe.draft.lockFolderName).toBe('.eigene-sperren');
    expect(mitAngabe.snapshot.lockFolderName).toBe('.eigene-sperren');

    verwirfDatenbankAuskunft({ bereichsWechsel: true });
    window.api.getAreaDatabaseConfig = async () => ({ hasArea: true, overviewOnOpen: false });
    const ohneAngabe = await settingsDb.readDatabaseFromConfig();
    expect(ohneAngabe.draft.lockFolderName).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('meldet einen geänderten Namen als ungesicherte Änderung', () => {
    const database = datenbankEntwurf({ lockFolderName: '.neue-sperren' });
    const draft = {
      database,
      databaseSnapshot: { overviewOnOpen: false, lockFolderName: DEFAULT_LOCK_FOLDER_NAME },
    };
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(true);

    // Ein LEERES Feld ist eine Änderung und keine Rückkehr zur Vorgabe: Der
    // leere Name wird abgewiesen, und der Anwender soll die Meldung dazu sehen.
    database.lockFolderName = '';
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(true);

    database.lockFolderName = DEFAULT_LOCK_FOLDER_NAME;
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(false);
  });
});

describe('Sperr-Ordner: Tastatur-Bedienbarkeit (4T-001795, AK12)', () => {
  it('trägt Beschriftung, Erklärung und Meldung am Feld selbst', () => {
    const container = zeichneAbschnitt(datenbankEntwurf());
    const feld = feldVon(container);
    const beschriftung = [...container.querySelectorAll('label')].find(
      (l) => l.htmlFor === feld.id,
    );

    // Ein gewöhnliches Textfeld mit Beschriftung: erreichbar mit der
    // Tabulator-Taste, bedienbar mit der Tastatur, und die Beschriftung zeigt
    // über `for` auf das Feld.
    expect(beschriftung).toBeTruthy();
    expect(beschriftung.textContent).toBe(t('settings.database.lockFolder'));
    expect(feld.disabled).toBe(false);
    expect(feld.hasAttribute('tabindex')).toBe(false);
    expect(feld.getAttribute('aria-describedby')).toBe(
      'settings-database-lock-folder-hint settings-database-lock-folder-message',
    );
    expect(feld.getAttribute('aria-invalid')).toBe('false');
  });

  it('markiert einen unzulässigen Namen schon bei der Eingabe', () => {
    const database = datenbankEntwurf();
    const container = zeichneAbschnitt(database);
    const feld = feldVon(container);

    feld.value = 'sperren';
    feld.dispatchEvent(new window.Event('input'));

    expect(database.lockFolderName).toBe('sperren');
    expect(feld.getAttribute('aria-invalid')).toBe('true');
    expect(meldungVon(container).textContent).toBe(gefuellt('ohneFuehrendenPunkt'));

    feld.value = '.sperren';
    feld.dispatchEvent(new window.Event('input'));
    expect(feld.getAttribute('aria-invalid')).toBe('false');
    expect(meldungVon(container).textContent).toBe('');
  });
});

describe('Sperr-Ordner: Anwenden und Meldungen (4T-001795, AK3, AK5, AK6, AK8, AK9)', () => {
  function entwurfMitNeuemNamen(name = '.neue-sperren') {
    const database = datenbankEntwurf({ lockFolderName: name });
    return {
      database,
      databaseSnapshot: { overviewOnOpen: false, lockFolderName: DEFAULT_LOCK_FOLDER_NAME },
    };
  }

  it('schickt den Namen über den bestehenden Kanal und zieht den Vergleichs-Stand nach', async () => {
    const gesendet = stelleKanal({ ok: true });
    const draft = entwurfMitNeuemNamen();

    await settingsDb.applyDatabaseSection(draft);

    expect(gesendet).toEqual([{ overviewOnOpen: false, lockFolderName: '.neue-sperren' }]);
    expect(draft.databaseSnapshot.lockFolderName).toBe('.neue-sperren');
    expect(settingsDb.dirtyDatabaseSection(draft)).toBe(false);
  });

  // Je Grund ein eigener Text: Ein Sammel-Fall über «irgendeine Meldung
  // erscheint» bliebe grün, wenn zwei Gründe denselben Text zeigten.
  //
  // Geprüft wird die Wahl des Schlüssels und das Füllen seiner Platzhalter. Der
  // Wortlaut selbst kommt aus dem Sprach-Fragment und wird im Fall darunter
  // gemessen; der Katalog der Anwendung ist in dieser Umgebung nicht geladen,
  // und ein Fall, der ihn voraussetzte, prüfte die Umgebung statt den Code.
  it.each([
    ['leer', {}],
    ['zuLang', {}],
    ['reservierterName', {}],
    ['ohneFuehrendenPunkt', {}],
    ['nurPunkte', {}],
    ['pfadTrenner', {}],
    ['verbotenesZeichen', {}],
    ['endeUnzulaessig', {}],
    ['lockFolderTaken', {}],
    ['lockFolderBusy', { benutzer: 'bert', rechner: 'SC-027' }],
    ['lockFolderRenameFailed', {}],
    ['lockFolderRollbackFailed', { alt: '.area-locks', neu: '.neue-sperren' }],
  ])('zeigt für den Grund %s eine eigene Meldung', async (code, felder) => {
    stelleKanal({ ok: false, code, error: 'roh', ...felder });
    const draft = entwurfMitNeuemNamen();

    await settingsDb.applyDatabaseSection(draft);

    expect(draft.database.lockFolderMeldung).toBe(gefuellt(code));
    // Kein Nachziehen des Vergleichs-Stands: Die Änderung ist nicht gespeichert
    // und bleibt deshalb als ungesichert stehen.
    expect(draft.databaseSnapshot.lockFolderName).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('nimmt einen unbekannten Grund nicht für einen eigenen und zeigt ihn als Ersatz', async () => {
    // Sonst stünde beim Anwender ein roher Schlüssel, sobald der Haupt-Prozess
    // einen Grund meldet, den dieser Bedienort nicht kennt.
    stelleKanal({ ok: false, code: 'einNeuerGrund', error: 'roh' });
    const draft = entwurfMitNeuemNamen();

    await settingsDb.applyDatabaseSection(draft);

    expect(draft.database.lockFolderMeldung).toBe(
      t('settings.database.lockFolderError.unknown').replace('{code}', 'einNeuerGrund'),
    );
  });

  it('führt im Sprach-Fragment zu jedem Grund einen eigenen, gefüllten Wortlaut', () => {
    // Der Wortlaut wird an der QUELLE gemessen, weil der Katalog der Anwendung
    // in dieser Umgebung nicht geladen ist. Gemessen wird dreierlei: Jeder Grund
    // hat einen Text, kein Text wiederholt einen anderen, und kein Platzhalter
    // bleibt nach dem Füllen stehen.
    const texte = new Map();
    for (const code of GRUENDE) {
      const wortlaut = DE_FRAGMENT[`settings.database.lockFolderError.${code}`];
      expect(wortlaut, `Grund ${code}`).toBeTypeOf('string');
      expect(wortlaut.trim(), `Grund ${code}`).not.toBe('');
      const gefuelltText = fuelle(wortlaut);
      expect(gefuelltText, `Grund ${code}`).not.toMatch(/\{[A-Za-z]+\}/);
      expect([...texte.values()], `Grund ${code}`).not.toContain(wortlaut);
      texte.set(code, wortlaut);
    }
    expect(texte.size).toBe(GRUENDE.length);
  });

  it('nennt niemanden, wo die lebende Sperre keinen Halter nennt', async () => {
    stelleKanal({ ok: false, code: 'lockFolderBusy', error: 'roh' });
    const draft = entwurfMitNeuemNamen();

    await settingsDb.applyDatabaseSection(draft);

    expect(draft.database.lockFolderMeldung).toBe(
      t('settings.database.lockFolderError.lockFolderBusyUnknown'),
    );
  });

  it('meldet einen Fehlschlag ohne Code als beschädigte Bereichsdatei (AK5)', async () => {
    // Die defekte Bereichsdatei wird nie überschrieben; sie kommt ohne Code
    // zurück und behält deshalb ihren bisherigen Text.
    stelleKanal({ ok: false, error: 'mdda defekt' });
    const draft = entwurfMitNeuemNamen();

    await settingsDb.applyDatabaseSection(draft);

    expect(draft.database.lockFolderMeldung).toBe(null);
    expect(draft.databaseSnapshot.lockFolderName).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('zeigt die Meldung des Anwendens am Feld und lässt sie bei der nächsten Eingabe fallen', async () => {
    stelleKanal({ ok: false, code: 'lockFolderTaken', error: 'roh' });
    const draft = entwurfMitNeuemNamen();
    await settingsDb.applyDatabaseSection(draft);

    const container = zeichneAbschnitt(draft.database);
    expect(meldungVon(container).textContent).toBe(gefuellt('lockFolderTaken'));

    const feld = feldVon(container);
    feld.value = '.noch-andere';
    feld.dispatchEvent(new window.Event('input'));
    expect(draft.database.lockFolderMeldung).toBe(null);
    expect(meldungVon(container).textContent).toBe('');
  });
});
