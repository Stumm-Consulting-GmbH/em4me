// @vitest-environment jsdom
// 4T-000295 (Epic 3E-000052): Bereich „Erweiterungen" der Einstellungs-Seite —
// Bereichs-Registrierung, Schalter-Zeilen mit Abhängigkeits-Hinweis,
// Entwurfs-/Anwenden-Semantik, dynamisches Verschwinden erweiterungs-
// eigener Bereiche (Task-Status) und Rückfall auf den Bereich
// „Erweiterungen", wenn der offene Bereich wegfällt.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { allExtensions } from '../../../src/shared/extensions/extensions.js';
// 4T-001881 (Epic 3E-000185): der Schalter-Satz je Modus, gegen den die Wahl
// im Bereich gemessen wird.
import { disabledIdsForModeLevel } from '../../../src/shared/extensions/extensions-core.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
// 4T-001882 (Epic 3E-000185): der Lebenszyklus der eigenen Arbeitsmodi.
const modi = await import('../../../src/renderer/modules/extensions/extension-modes.js');

// Vorherige Mounts abraeumen: doppelte Element-IDs aus Vor-Tests lassen
// jsdom ID-Selektoren sonst am falschen (alten) Container aufloesen.
function removeStaleContainers() {
  document.querySelectorAll('[data-test-settings]').forEach((el) => el.remove());
}

function mountPage() {
  removeStaleContainers();
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  container.dataset.testSettings = '1';
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

function navIds(container) {
  return [...container.querySelectorAll('.settings-nav-entry')].map((b) => b.dataset.sectionId);
}

function activateSection(container, id) {
  const btn = container.querySelector(`.settings-nav-entry[data-section-id="${id}"]`);
  btn.click();
}

describe('Bereich Erweiterungen (4T-000295)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
  });

  it('Bereich ist registriert; Task-Status erscheint als erweiterungs-eigener Bereich', () => {
    const ids = settingsPage.settingsSections().map((s) => s.id);
    expect(ids).toContain('extensions');
    expect(ids).toContain('taskStates');
  });

  it('rendert eine Schalter-Zeile pro Erweiterung, gruppiert nach Kategorie', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const rows = container.querySelectorAll('.settings-extension-row');
    expect(rows.length).toBe(allExtensions().length);
    expect(container.querySelectorAll('.settings-extensions-group-title').length).toBe(3);
    const katexToggle = container.querySelector('#settings-extension-katex');
    expect(katexToggle.checked).toBe(true);
  });

  // 4T-001760 (Epic 3E-000253, AK7): Die Sichtprüfung an der gebauten
  // Programmdatei bleibt der Nachweis für den Anwender; dieser Fall hält die
  // Einordnung fest, damit die Zeile nicht unbemerkt in einen anderen Block
  // rutscht. Gemessen wird die Nachbarschaft im DOM, weil die Zeilen keine
  // eigene Kategorie-Marke tragen: Maßgeblich ist die letzte Gruppen-
  // Überschrift vor der Zeile.
  it('die Zeile der Datenbank steht in der Kategorie Werkzeuge', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const row = container.querySelector('.settings-extension-row[data-extension-id="database"]');
    expect(row).toBeTruthy();
    let el = row.previousElementSibling;
    while (el && !el.classList.contains('settings-extensions-group-title')) {
      el = el.previousElementSibling;
    }
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('settings.extensions.category.tools');
  });

  // 4T-001877 (Epic 3E-000187): Die Wirkungs-Richtung ist umgekehrt — wiki-links
  // laesst sich bei aktiven wiki-embeds und area-links gar nicht mehr abwaehlen.
  // Der Weg zum frueher geprueften Bild (Abhaengige gesperrt mit Hinweis) fuehrt
  // seither ueber einen mitgebrachten Stand; er steht als eigener Fall unten.
  it('Abwählen der Abhängigen bleibt frei und wirkt nur im Entwurf', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const embedsToggle = container.querySelector('#settings-extension-wiki-embeds');
    expect(embedsToggle.disabled).toBe(false);
    embedsToggle.checked = false;
    embedsToggle.dispatchEvent(new Event('change'));
    // Entwurfs-Semantik: noch nichts angewendet.
    expect(lifecycle.isExtensionActive('wiki-embeds')).toBe(true);
    expect(settingsPage.settingsPageStateForTests().draft.extensionsDisabled).toContain(
      'wiki-embeds',
    );
    // Die Grundlage bleibt gesperrt, solange die zweite Abhaengige laeuft.
    expect(container.querySelector('#settings-extension-wiki-links').disabled).toBe(true);
  });

  it('Anwenden schaltet um; deaktivierte task-states nimmt ihren Bereich mit', async () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const toggle = container.querySelector('#settings-extension-task-states');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(lifecycle.isExtensionActive('task-states')).toBe(false);
    expect(settingsPage.settingsSections().some((s) => s.id === 'taskStates')).toBe(false);
  });

  it('faellt auf den Bereich Erweiterungen zurueck, wenn der offene Bereich wegfaellt', async () => {
    const container = mountPage();
    activateSection(container, 'taskStates');
    expect(settingsPage.settingsPageStateForTests().activeSectionId).toBe('taskStates');
    // Deaktivierung von aussen (z.B. Broadcast eines anderen Fensters).
    await lifecycle.applyExtensionsState(['task-states'], { persist: false });
    // Re-Mount wie beim Pane-Re-Render einer System-Seite.
    container.remove();
    const remounted = mountPageWithoutReset();
    expect(settingsPage.settingsPageStateForTests().activeSectionId).toBe('extensions');
    expect(navIds(remounted)).not.toContain('taskStates');
  });
});

// 4T-001877 (Epic 3E-000187, Story 4S-000991): Abhaengigkeits-Schutz in der
// Zeile. Die Sperr-Regel selbst liegt als reine Funktion im geteilten Kern und
// ist dort geprueft (test/unit/extensions.test.js); hier steht, was der
// Anwender davon sieht — gesperrter Schalter, Hinweis-Zeile mit dem Grund,
// Einblendung beim Versuch und die wahrheitsgemaesse Anzeige eines
// mitgebrachten Stands.
//
// Der Text der Einblendung erscheint in dieser Umgebung als Schluessel: Der
// Uebersetzungs-Katalog wird per fetch geladen, das es in jsdom nicht gibt.
// Die Aufloesung der Namen in der Sprache der Oberflaeche weist deshalb der
// Ablauf-Fall EW-04 an der gestarteten Anwendung nach.
describe('Abhängigkeits-Schutz der Erweiterungs-Zeile (4T-001877)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
    const hint = document.getElementById('statusbar-hint');
    hint.textContent = '';
    hint.classList.remove('visible');
  });

  // AK1, AK16: Die Zeile ist ohne jeden Versuch als gesperrt erkennbar und
  // nennt den Grund.
  it('AK1/AK16: die Grundlage ist gesperrt und nennt den Grund', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const row = container.querySelector('.settings-extension-row[data-extension-id="tasks"]');
    const toggle = row.querySelector('.settings-extension-toggle');
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(true);
    expect(row.dataset.locked).toBe('1');
    expect(row.querySelector('.settings-extension-required-hint')).toBeTruthy();
  });

  // AK2, AK11: Der Versuch blendet ein; ein wiederholter Versuch blendet erneut
  // ein und aendert am Schalter-Stand nichts.
  it('AK2/AK11: der Versuch blendet ein und laesst den Schalter unberührt', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const row = container.querySelector('.settings-extension-row[data-extension-id="tasks"]');
    const statusHint = document.getElementById('statusbar-hint');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(statusHint.classList.contains('visible')).toBe(true);
    expect(statusHint.textContent).toContain('requiredNotice');
    // Wiederholter Versuch: erneute Einblendung, unveraenderter Entwurf.
    statusHint.classList.remove('visible');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(statusHint.classList.contains('visible')).toBe(true);
    expect(row.querySelector('.settings-extension-toggle').checked).toBe(true);
    expect(settingsPage.settingsPageStateForTests().draft.extensionsDisabled).not.toContain(
      'tasks',
    );
  });

  // AK4, AK11: Nach dem Abwaehlen der letzten Abhaengigen ist die Grundlage im
  // selben Entwurf frei — und der gebuendelte Wechsel beider Schalter laesst
  // sich danach in einem Zug anwenden.
  it('AK4/AK11: die Grundlage wird frei und beide Schalter wirken gebündelt', async () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const reminders = container.querySelector('#settings-extension-reminders');
    expect(reminders.disabled).toBe(false);
    reminders.checked = false;
    reminders.dispatchEvent(new Event('change'));
    // Seit der Zusammenführung mit dem Release 1.141.0 ist die Kanban-Tafel
    // die zweite Abhängige von «Aufgaben»; erst nach ihr ist die Grundlage frei.
    expect(container.querySelector('#settings-extension-tasks').disabled).toBe(true);
    const kanban = container.querySelector('#settings-extension-kanban');
    expect(kanban.disabled).toBe(false);
    kanban.checked = false;
    kanban.dispatchEvent(new Event('change'));
    const tasks = container.querySelector('#settings-extension-tasks');
    expect(tasks.disabled).toBe(false);
    tasks.checked = false;
    tasks.dispatchEvent(new Event('change'));
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(lifecycle.isExtensionActive('tasks')).toBe(false);
    expect(lifecycle.isExtensionActive('reminders')).toBe(false);
    expect(lifecycle.isExtensionActive('kanban')).toBe(false);
  });

  // AK5: Eine Grundlage ohne Abhaengige bleibt frei schaltbar.
  it('AK5: eine Erweiterung ohne Abhängige bleibt frei', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const row = container.querySelector('.settings-extension-row[data-extension-id="katex"]');
    expect(row.querySelector('.settings-extension-toggle').disabled).toBe(false);
    expect(row.dataset.locked).toBeUndefined();
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('statusbar-hint').classList.contains('visible')).toBe(false);
  });

  // AK12, AK15: Ein mitgebrachter Stand — Grundlage abgeschaltet, Abhaengige
  // als eingeschaltet gespeichert — bleibt unveraendert wirksam und wird
  // wahrheitsgemaess angezeigt: Die Zeile der Abhaengigen weist aus, dass sie
  // nicht wirkt, und die Grundlage laesst sich jederzeit wieder einschalten.
  it('AK12/AK15: ein mitgebrachter Stand bleibt wirksam und wird wahrheitsgemäß gezeigt', async () => {
    await lifecycle.applyExtensionsState(['property-profiles'], { persist: false });
    const container = mountPage();
    activateSection(container, 'extensions');
    const eventsRow = container.querySelector(
      '.settings-extension-row[data-extension-id="events"]',
    );
    const eventsToggle = eventsRow.querySelector('.settings-extension-toggle');
    expect(eventsToggle.checked).toBe(false);
    expect(eventsToggle.disabled).toBe(true);
    expect(eventsRow.querySelector('.settings-extension-dependency-hint')).toBeTruthy();
    // Nichts wurde selbsttaetig umgeschaltet: Die gespeicherte Liste nennt
    // allein die Grundlage.
    expect(settingsPage.settingsPageStateForTests().draft.extensionsDisabled).toEqual([
      'property-profiles',
    ]);
    // Die Grundlage ist NICHT gesperrt und laesst sich wieder einschalten.
    const baseToggle = container.querySelector('#settings-extension-property-profiles');
    expect(baseToggle.disabled).toBe(false);
    baseToggle.checked = true;
    baseToggle.dispatchEvent(new Event('change'));
    const wieder = container.querySelector('#settings-extension-events');
    expect(wieder.checked).toBe(true);
    // Und mit beiden zurueck ist die Grundlage wieder gesperrt.
    expect(wieder.disabled).toBe(false);
    expect(container.querySelector('#settings-extension-property-profiles').disabled).toBe(true);
  });
});

// 4T-001881 (Epic 3E-000185, Story 4S-000992): Die Wahl der drei festen
// Arbeitsmodi im Bereich «Erweiterungen». Die Mengen selbst und ihre
// Schachtelung sind reine Ableitungen und dort geprueft
// (test/unit/extensions.test.js); hier steht, was der Anwender davon hat —
// die drei Schaltflaechen, der gebuendelte Wechsel im Entwurf, die Anzeige des
// aktiven Modus samt «Angepasst» und die unveraenderte Nachjustierbarkeit.
//
// Die Beschriftungen erscheinen in dieser Umgebung als Schluessel (kein
// geladener Uebersetzungs-Katalog, Begruendung im Kopf des vorigen Blocks);
// gemessen wird deshalb am Zustand der Schaltflaechen, nicht am Satzbau.
describe('Wahl des Arbeitsmodus im Bereich Erweiterungen (4T-001881)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
  });

  const modusKnopf = (container, level) =>
    container.querySelector(`#settings-extension-mode-${level}`);
  const standZeile = (container) =>
    container.querySelector('#settings-extensions-mode-state').textContent;

  it('AK1/AK18: die drei Modi stehen zur Wahl, der volle ist als aktiv gezeigt', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    for (const level of ['beginner', 'advanced', 'full']) {
      expect(modusKnopf(container, level), `Modus ${level} fehlt`).toBeTruthy();
    }
    // Vorgabe-Zustand: nichts abgeschaltet, also der volle Modus.
    expect(modusKnopf(container, 'full').getAttribute('aria-pressed')).toBe('true');
    expect(modusKnopf(container, 'beginner').getAttribute('aria-pressed')).toBe('false');
    expect(standZeile(container)).toBe('settings.extensions.mode.active');
  });

  it('AK2/AK10: ein Klick setzt den ganzen Satz, Anwenden macht ihn in einem Zug wirksam', async () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    modusKnopf(container, 'beginner').click();
    const draft = settingsPage.settingsPageStateForTests().draft;
    expect([...draft.extensionsDisabled].sort()).toEqual(
      [...disabledIdsForModeLevel('beginner')].sort(),
    );
    // Die Schalter-Liste zieht sofort nach: katex ist im Einsteiger-Modus aus,
    // wiki-links bleibt an.
    expect(container.querySelector('#settings-extension-katex').checked).toBe(false);
    expect(container.querySelector('#settings-extension-wiki-links').checked).toBe(true);
    expect(modusKnopf(container, 'beginner').getAttribute('aria-pressed')).toBe('true');

    expect(await settingsPage.applySettingsPage()).toBe(true);
    // Ein Vorgang, kein halber Modus: Der wirksame Stand ist genau der Satz.
    expect([...lifecycle.getDisabledExtensionIds()].sort()).toEqual(
      [...disabledIdsForModeLevel('beginner')].sort(),
    );
    expect(lifecycle.isExtensionActive('katex')).toBe(false);
    expect(lifecycle.isExtensionActive('wiki-links')).toBe(true);
  });

  it('AK5/AK19: ein Einzel-Schalter danach fuehrt auf «Angepasst» und wieder zurueck', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    modusKnopf(container, 'beginner').click();
    expect(standZeile(container)).toBe('settings.extensions.mode.active');

    // Nachjustieren bleibt frei — katex wieder dazu.
    const katex = container.querySelector('#settings-extension-katex');
    expect(katex.disabled).toBe(false);
    katex.checked = true;
    katex.dispatchEvent(new Event('change'));
    expect(settingsPage.settingsPageStateForTests().draft.extensionsDisabled).not.toContain(
      'katex',
    );
    expect(standZeile(container)).toBe('settings.extensions.mode.custom');
    for (const level of ['beginner', 'advanced', 'full']) {
      expect(modusKnopf(container, level).getAttribute('aria-pressed')).toBe('false');
    }

    // Und zurueck: derselbe Stand, derselbe Modus.
    const zurueck = container.querySelector('#settings-extension-katex');
    zurueck.checked = false;
    zurueck.dispatchEvent(new Event('change'));
    expect(standZeile(container)).toBe('settings.extensions.mode.active');
    expect(modusKnopf(container, 'beginner').getAttribute('aria-pressed')).toBe('true');
  });

  it('AK12: die zweiten Aktiv-Schalter der Doppel-Schalter bleiben unberührt', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const draft = settingsPage.settingsPageStateForTests().draft;
    // Die beiden zweiten Schalter stehen NICHT in der Registry, sondern als
    // eigene Werte im Entwurf. Ein Modus fasst sie nicht an.
    draft.spellcheck = true;
    draft.headingNumbering = { enabled: true, startLevel: 2 };
    modusKnopf(container, 'beginner').click();
    expect(draft.spellcheck).toBe(true);
    expect(draft.headingNumbering).toEqual({ enabled: true, startLevel: 2 });
    // Der Erweiterungs-Schalter der beiden dagegen folgt dem Modus.
    expect(draft.extensionsDisabled).toContain('heading-numbering');
    expect(draft.extensionsDisabled).not.toContain('spellcheck');
  });

  it('AK9: kein Modus erzeugt einen Stand, den der Abhängigkeits-Schutz verböte', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    for (const level of ['beginner', 'advanced', 'full']) {
      modusKnopf(container, level).click();
      // Kein gesperrter Schalter steht auf «aus», und keine Zeile meldet eine
      // abhaengig mit-deaktivierte Erweiterung, deren Schalter noch an waere.
      for (const row of container.querySelectorAll('.settings-extension-row')) {
        const toggle = row.querySelector('.settings-extension-toggle');
        if (row.dataset.locked !== '1') continue;
        expect(toggle.checked, `${level}: gesperrte Zeile ${row.dataset.extensionId} ist aus`).toBe(
          true,
        );
      }
    }
  });
});

// 4T-001882 (Epic 3E-000185, Story 4S-000993): Die EIGENEN Arbeitsmodi im
// selben Abschnitt. Das Datenmodell dahinter — Säuberung, Schalter-Stand beim
// Anwenden, Abgleich gegen die Registry — prüft test/unit/eigene-arbeitsmodi.test.js;
// hier steht, was der Anwender davon hat: die Zeilen mit ihren Handgriffen, das
// Anwenden in den Entwurf, die Anzeige des aktiven eigenen Modus und die
// Unveränderlichkeit der drei festen Modi.
//
// Die beiden Dialoge (Speichern mit Rückfrage bei vergebenem Namen,
// Umbenennen) verlangen die Modal-Elemente der Anwendung, die es in dieser
// Umgebung nicht gibt; sie sind deshalb an der gestarteten Anwendung geprüft
// (AM-06 und AM-07). Gerufen werden hier die Handgriffe selbst.
describe('Eigene Arbeitsmodi im Bereich Erweiterungen (4T-001882)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
    modi.resetEigeneArbeitsmodiForTests();
  });

  const zeilen = (container) =>
    [...container.querySelectorAll('.settings-extension-own-mode-row')].map((r) => ({
      id: r.dataset.modeId,
      name: r.querySelector('.settings-extension-own-mode').textContent,
      aktiv: r.dataset.active === '1',
      knopf: r.querySelector('.settings-extension-own-mode'),
    }));
  const standZeile = (container) =>
    container.querySelector('#settings-extensions-mode-state').textContent;

  it('AK1/AK2: der gespeicherte Stand erscheint als eigene Zeile mit ihren Handgriffen', async () => {
    expect(await modi.speichereEigenenArbeitsmodus('Fokus', ['katex', 'mermaid'])).toBe(true);
    const container = mountPage();
    activateSection(container, 'extensions');
    const liste = zeilen(container);
    expect(liste).toHaveLength(1);
    expect(liste[0].name).toBe('Fokus');
    const zeile = container.querySelector('.settings-extension-own-mode-row');
    expect(zeile.querySelector('.settings-extension-own-mode-rename')).toBeTruthy();
    expect(zeile.querySelector('.settings-extension-own-mode-overwrite')).toBeTruthy();
    expect(zeile.querySelector('.settings-extension-own-mode-delete')).toBeTruthy();
    expect(container.querySelector('#btn-settings-extension-mode-save')).toBeTruthy();
  });

  it('AK1: ohne gespeicherten Modus steht der Leer-Hinweis, die Speichern-Schaltfläche bleibt', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    expect(zeilen(container)).toHaveLength(0);
    expect(container.querySelector('.settings-extensions-own-modes-empty')).toBeTruthy();
    expect(container.querySelector('#btn-settings-extension-mode-save')).toBeTruthy();
  });

  it('AK4: die drei festen Modi tragen keinen dieser Handgriffe', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex']);
    const container = mountPage();
    activateSection(container, 'extensions');
    for (const level of ['beginner', 'advanced', 'full']) {
      const knopf = container.querySelector(`#settings-extension-mode-${level}`);
      expect(knopf.closest('.settings-extension-own-mode-row')).toBeNull();
      expect(knopf.parentElement.querySelector('.settings-extension-own-mode-action')).toBeNull();
    }
  });

  it('AK2/AK11: ein Klick auf den Namen setzt den Satz in den Entwurf und wirkt beim Anwenden', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex', 'mermaid']);
    const container = mountPage();
    activateSection(container, 'extensions');
    zeilen(container)[0].knopf.click();
    const draft = settingsPage.settingsPageStateForTests().draft;
    expect([...draft.extensionsDisabled].sort()).toEqual(['katex', 'mermaid']);
    expect(container.querySelector('#settings-extension-katex').checked).toBe(false);
    // Die Zeile zeigt sich als aktiv, und die Stand-Zeile nennt den Namen.
    expect(zeilen(container)[0].aktiv).toBe(true);
    expect(standZeile(container)).toBe('settings.extensions.mode.active');
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect([...lifecycle.getDisabledExtensionIds()].sort()).toEqual(['katex', 'mermaid']);
  });

  it('AK19: zweimaliges Anwenden desselben Modus ändert den Stand nicht', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex', 'mermaid']);
    const container = mountPage();
    activateSection(container, 'extensions');
    zeilen(container)[0].knopf.click();
    const erst = [...settingsPage.settingsPageStateForTests().draft.extensionsDisabled];
    zeilen(container)[0].knopf.click();
    expect([...settingsPage.settingsPageStateForTests().draft.extensionsDisabled]).toEqual(erst);
  });

  it('AK13: ein Einzel-Schalter danach ändert den gespeicherten Modus nicht; Überschreiben ist der Rückweg', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex']);
    const container = mountPage();
    activateSection(container, 'extensions');
    zeilen(container)[0].knopf.click();
    const mermaid = container.querySelector('#settings-extension-mermaid');
    mermaid.checked = false;
    mermaid.dispatchEvent(new Event('change'));
    // Der gespeicherte Modus steht unverändert; die Anzeige ist «Angepasst».
    expect(modi.eigeneArbeitsmodi()[0].disabled).toEqual(['katex']);
    expect(standZeile(container)).toBe('settings.extensions.mode.custom');
    // Überschreiben holt den Stand des Augenblicks in den Modus.
    const draft = settingsPage.settingsPageStateForTests().draft;
    expect(await modi.ueberschreibeEigenenArbeitsmodus('nicht-vorhanden', [])).toBe(false);
    expect(
      await modi.ueberschreibeEigenenArbeitsmodus(
        modi.eigeneArbeitsmodi()[0].id,
        draft.extensionsDisabled,
      ),
    ).toBe(true);
    expect([...modi.eigeneArbeitsmodi()[0].disabled].sort()).toEqual(['katex', 'mermaid']);
  });

  it('AK14: Umbenennen und Löschen lassen den geltenden Schalter-Stand unberührt', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex']);
    await lifecycle.applyExtensionsState(['katex'], { persist: false });
    const id = modi.eigeneArbeitsmodi()[0].id;
    expect(await modi.benenneEigenenArbeitsmodusUm(id, '  Schreiben  ')).toBe(true);
    expect(modi.eigeneArbeitsmodi()[0].name).toBe('Schreiben');
    expect(lifecycle.getDisabledExtensionIds()).toEqual(['katex']);
    expect(await modi.loescheEigenenArbeitsmodus(id)).toBe(true);
    expect(modi.eigeneArbeitsmodi()).toEqual([]);
    expect(lifecycle.getDisabledExtensionIds()).toEqual(['katex']);
  });

  it('AK5/AK6: leere Namen werden abgewiesen, ein vergebener Name blockiert das Umbenennen', async () => {
    expect(await modi.speichereEigenenArbeitsmodus('   ', ['katex'])).toBe(false);
    expect(await modi.speichereEigenenArbeitsmodus('', [])).toBe(false);
    expect(modi.eigeneArbeitsmodi()).toHaveLength(0);
    await modi.speichereEigenenArbeitsmodus('Fokus', []);
    await modi.speichereEigenenArbeitsmodus('Ordnen', []);
    const fokus = modi.eigenerArbeitsmodusMitNamen('Fokus');
    expect(await modi.benenneEigenenArbeitsmodusUm(fokus.id, 'Ordnen')).toBe(false);
    expect(await modi.benenneEigenenArbeitsmodusUm(fokus.id, '  ')).toBe(false);
    expect(modi.eigenerArbeitsmodusMitNamen('Fokus')).toBeTruthy();
  });

  it('AK3: auch fünfzig gespeicherte Modi erscheinen vollständig in der Liste', async () => {
    for (let i = 0; i < 50; i++) await modi.speichereEigenenArbeitsmodus(`Modus ${i}`, ['katex']);
    const container = mountPage();
    activateSection(container, 'extensions');
    expect(zeilen(container)).toHaveLength(50);
  });

  it('AK15: das Anwenden eines eigenen Modus rührt die übrigen Entwurfs-Werte nicht an', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex']);
    const container = mountPage();
    activateSection(container, 'extensions');
    const draft = settingsPage.settingsPageStateForTests().draft;
    draft.spellcheck = true;
    draft.headingNumbering = { enabled: true, startLevel: 2 };
    zeilen(container)[0].knopf.click();
    expect(draft.spellcheck).toBe(true);
    expect(draft.headingNumbering).toEqual({ enabled: true, startLevel: 2 });
  });

  it('AK2: der Löschen-Handgriff der Zeile entfernt genau diesen Modus', async () => {
    await modi.speichereEigenenArbeitsmodus('Fokus', ['katex']);
    await modi.speichereEigenenArbeitsmodus('Ordnen', ['mermaid']);
    const container = mountPage();
    activateSection(container, 'extensions');
    const zeile = container.querySelector('.settings-extension-own-mode-row');
    zeile.querySelector('.settings-extension-own-mode-delete').click();
    // Der Handgriff ist asynchron (Speicher lesen, schreiben, neu zeichnen);
    // die Ereignis-Schleife einmal durchlassen.
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(modi.eigeneArbeitsmodi().map((m) => m.name)).toEqual(['Ordnen']);
    expect(zeilen(container).map((z) => z.name)).toEqual(['Ordnen']);
  });

  it('ein fester Modus geht in der Anzeige vor, wenn ein eigener denselben Satz trägt', async () => {
    await modi.speichereEigenenArbeitsmodus('Mein Voll', []);
    const container = mountPage();
    activateSection(container, 'extensions');
    // Vorgabe-Zustand: nichts abgeschaltet, also der feste Modus «Voll».
    expect(
      container.querySelector('#settings-extension-mode-full').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(standZeile(container)).toBe('settings.extensions.mode.active');
    // Die eigene Zeile bleibt daneben als aktiv erkennbar.
    expect(zeilen(container)[0].aktiv).toBe(true);
  });
});

// Re-Mount ohne onOpen (der Entwurf bleibt erhalten — Verhalten von
// renderSystemPane bei Sprachwechsel/Re-Render).
function mountPageWithoutReset() {
  removeStaleContainers();
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  const container = document.createElement('div');
  container.dataset.testSettings = '1';
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}
