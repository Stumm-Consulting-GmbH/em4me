// @vitest-environment jsdom
// 4T-001143 (Epic 3E-000218, E4): Darstellung der Profil-Hinweise im
// Einstellungs-Bereich «Eigenschafts-Profile» — die Hinweise stehen
// ausgeschrieben unter ihrem Profil, ortsbezogen (Definition, Angabe,
// Erwartung), Kind-Definitionen mit ihrem Pfad zum Eltern-Feld; ein Profil
// ohne Hinweise zeigt keinen Hinweis-Bereich. Die Übersetzungen kommen aus
// der echten de.json (fetch-Stub, Muster i18n-fehlende-schluessel.test.js),
// damit die Orts- und Erwartungs-Einsetzung am realen Melde-Satz geprüft ist.
import { describe, it, expect, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { renderProfilesSection } =
  await import('../../../src/renderer/modules/settings/settings-profiles.js');

function renderList(list) {
  const container = document.createElement('div');
  renderProfilesSection(container, {
    profiles: {
      hasArea: true,
      areaName: 'Test',
      folder: 'Profile',
      assignField: '',
      defaultProfile: '',
      folderMissing: false,
      list,
    },
  });
  return container;
}

const profil = (name, errors = []) => ({
  name,
  fileName: `${name}.md`,
  path: `C:/Bereich/Profile/${name}.md`,
  internal: false,
  fieldCount: 1,
  errors,
});

describe('Hinweis-Darstellung der Profil-Liste (4T-001143)', () => {
  it('AK1/AK2: Hinweise stehen ausgeschrieben unter dem Profil und nennen Ort, Angabe und Erwartung', () => {
    const container = renderList([
      profil('Projekt', [
        { code: 'type', index: 1, name: 'prio', key: 'type', expected: ['string', 'number'] },
      ]),
    ]);
    const hints = container.querySelectorAll('.settings-profiles-item-hints li');
    expect(hints).toHaveLength(1);
    expect(hints[0].textContent).toBe(
      'Definition 2 (prio): unbekannter Typ; erwartet wird einer von string, number.',
    );
  });

  it('AK3: Kind-Hinweise nennen den Pfad zum Eltern-Feld', () => {
    const container = renderList([
      profil('Projekt', [
        {
          code: 'valuesFrom',
          index: 0,
          name: 'rolle',
          key: 'valuesFrom',
          expected: ['note', 'query'],
          path: ['teilnehmer', 'adresse'],
        },
      ]),
    ]);
    expect(container.querySelector('.settings-profiles-item-hints li').textContent).toBe(
      'Definition 1 (rolle) unter teilnehmer › adresse: valuesFrom braucht note oder query.',
    );
  });

  it('AK4/AK5: Widerspruchs- und Vererbungs-Hinweise erscheinen mit ihrer Aussage', () => {
    const container = renderList([
      profil('Artikel', [
        {
          code: 'valuesFromConflict',
          index: 0,
          name: 'status',
          key: 'valuesFrom',
          expected: 'values',
        },
        { code: 'extendsMissing', index: -1, name: 'Fehlt', key: 'extends', expected: null },
        { code: 'extendsCycle', index: -1, name: 'Artikel', key: 'extends', expected: null },
      ]),
    ]);
    const texte = [...container.querySelectorAll('.settings-profiles-item-hints li')].map(
      (li) => li.textContent,
    );
    expect(texte).toEqual([
      'Definition 1 (status): values und valuesFrom zugleich; values gilt, valuesFrom entfällt.',
      'extends nennt ein nicht vorhandenes Profil (Fehlt); die Kette endet dort.',
      'extends bildet einen Zyklus (Wiedersehen bei Artikel); die Kette endet dort.',
    ]);
  });

  it('AK8: ein Profil ohne Hinweise zeigt keinen Hinweis-Bereich, Zähler und Hervorhebung bleiben beim betroffenen', () => {
    const container = renderList([
      profil('Sauber'),
      profil('Defekt', [{ code: 'name', index: 0, name: null, key: 'name', expected: null }]),
    ]);
    expect(container.querySelectorAll('.settings-profiles-item-hints')).toHaveLength(1);
    const metas = [...container.querySelectorAll('.settings-profiles-item-meta')];
    expect(metas[0].classList.contains('has-errors')).toBe(false);
    expect(metas[1].classList.contains('has-errors')).toBe(true);
    expect(metas[1].textContent).toContain(
      de['settings.profiles.hintCount'].replace('{count}', '1'),
    );
  });
});
