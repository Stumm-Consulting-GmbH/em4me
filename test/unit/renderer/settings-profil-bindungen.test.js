// @vitest-environment jsdom
// 4T-001160 (Epic 3E-000219, E13): Die Bindungs-Liste des Einstellungs-Bereichs
// «Eigenschafts-Profile» — Zeilen anlegen und entfernen, Profil-Auswahl samt
// Kennzeichnung eines nicht gefundenen Profils, Komma-Listen für Schlagworte
// und Ordner.
//
// Die Übersetzungen kommen aus der echten de.json (fetch-Stub, Muster
// settings-profile-hinweise.test.js), damit die Texte am realen Wortlaut
// geprüft sind und nicht an einem Platzhalter.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { renderBindungen } =
  await import('../../../src/renderer/modules/settings/settings-profil-bindungen.js');

function rendern(values) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderBindungen(container, values);
  return container;
}

function zeilen(container) {
  return [
    ...container.querySelectorAll('.settings-profil-bindung:not(.settings-profil-bindung-kopf)'),
  ];
}

const liste = [{ name: 'Sitzung' }, { name: 'Projekt' }, { name: 'Ereignis', internal: true }];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('AK1: Zeilen anlegen und entfernen', () => {
  it('zeigt den Leer-Hinweis, solange keine Bindung besteht', () => {
    const c = rendern({ list: liste, bindings: [] });
    expect(zeilen(c)).toHaveLength(0);
    expect(c.textContent).toContain('Noch keine Zuordnung');
  });

  it('legt eine leere Zeile an und trägt sie in den Entwurf ein', () => {
    const values = { list: liste, bindings: [] };
    const c = rendern(values);
    c.querySelector('#settings-profiles-binding-add').click();
    expect(values.bindings).toEqual([{ profile: '', tags: [], folders: [] }]);
    expect(zeilen(c)).toHaveLength(1);
  });

  it('entfernt genau die geklickte Zeile', () => {
    const values = {
      list: liste,
      bindings: [
        { profile: 'Sitzung', tags: ['a'], folders: [] },
        { profile: 'Projekt', tags: [], folders: ['x'] },
      ],
    };
    const c = rendern(values);
    zeilen(c)[0].querySelector('.settings-profil-bindung-entfernen').click();
    expect(values.bindings).toEqual([{ profile: 'Projekt', tags: [], folders: ['x'] }]);
    expect(zeilen(c)).toHaveLength(1);
  });

  it('legt bindings an, wenn der Entwurf noch keine trägt', () => {
    const values = { list: liste };
    rendern(values);
    expect(values.bindings).toEqual([]);
  });
});

describe('AK1: Profil-Auswahl', () => {
  it('bietet die erkannten Profile an, ohne die internen', () => {
    const c = rendern({ list: liste, bindings: [{ profile: 'Sitzung', tags: [], folders: [] }] });
    const optionen = [...c.querySelector('.settings-profil-bindung-profil').options].map(
      (o) => o.value,
    );
    expect(optionen).toEqual(['Sitzung', 'Projekt']);
  });

  it('AK4: ein nicht gefundenes Profil bleibt als gekennzeichnete Option erhalten', () => {
    const c = rendern({
      list: liste,
      bindings: [{ profile: 'Verschwunden', tags: ['x'], folders: [] }],
    });
    const select = c.querySelector('.settings-profil-bindung-profil');
    expect(select.value).toBe('Verschwunden');
    const fehlend = [...select.options].find((o) => o.value === 'Verschwunden');
    expect(fehlend.textContent).toContain('nicht gefunden');
    expect(fehlend.className).toBe('is-missing');
  });

  it('eine Änderung der Auswahl geht in den Entwurf', () => {
    const values = { list: liste, bindings: [{ profile: 'Sitzung', tags: [], folders: [] }] };
    const c = rendern(values);
    const select = c.querySelector('.settings-profil-bindung-profil');
    select.value = 'Projekt';
    select.dispatchEvent(new Event('change'));
    expect(values.bindings[0].profile).toBe('Projekt');
  });
});

describe('AK1: Schlagworte und Ordner als Komma-Listen', () => {
  it('zeigt bestehende Listen als Komma-Text', () => {
    const c = rendern({
      list: liste,
      bindings: [{ profile: 'Sitzung', tags: ['a', 'b'], folders: ['10 P', '20 K'] }],
    });
    const felder = [...zeilen(c)[0].querySelectorAll('input[type=text]')];
    expect(felder[0].value).toBe('a, b');
    expect(felder[1].value).toBe('10 P, 20 K');
  });

  it('liest eine Eingabe in die Liste, getrimmt und ohne Leere', () => {
    const values = { list: liste, bindings: [{ profile: 'Sitzung', tags: [], folders: [] }] };
    const c = rendern(values);
    const felder = [...zeilen(c)[0].querySelectorAll('input[type=text]')];
    felder[0].value = ' sitzung , , protokoll ';
    felder[0].dispatchEvent(new Event('input'));
    expect(values.bindings[0].tags).toEqual(['sitzung', 'protokoll']);

    felder[1].value = '10 Projekte,20 Kunden/Aktiv';
    felder[1].dispatchEvent(new Event('input'));
    expect(values.bindings[0].folders).toEqual(['10 Projekte', '20 Kunden/Aktiv']);
  });

  it('eine geleerte Eingabe ergibt die leere Liste', () => {
    const values = { list: liste, bindings: [{ profile: 'Sitzung', tags: ['a'], folders: [] }] };
    const c = rendern(values);
    const feld = zeilen(c)[0].querySelectorAll('input[type=text]')[0];
    feld.value = '   ';
    feld.dispatchEvent(new Event('input'));
    expect(values.bindings[0].tags).toEqual([]);
  });
});

describe('AK1: Beschriftungen', () => {
  it('nennt die drei Spalten und die Auflösungs-Reihenfolge', () => {
    const c = rendern({ list: liste, bindings: [{ profile: 'Sitzung', tags: [], folders: [] }] });
    expect(c.textContent).toContain('Profil');
    expect(c.textContent).toContain('Schlagworte');
    expect(c.textContent).toContain('Ordner');
    // Der Hinweis erklärt die Ordnung — ohne ihn wäre die Liste nicht
    // bedienbar, weil die Vorrang-Regel nirgends stünde.
    expect(c.textContent).toContain('Zuordnungs-Feld, Schlagwort, Ordner, Standard-Profil');
    expect(c.textContent).toContain('Unterordner');
  });
});
