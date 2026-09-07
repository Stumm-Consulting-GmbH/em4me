// @vitest-environment jsdom
// 4T-001455 (Epic 3E-000190): Prüf- und Änderungs-Logik des Einstellungs-
// Bereichs „Bereichs-Verknüpfungen".
//
// Geprüft wird der Teil, der eine eigene Regel trägt: was als Änderung gilt,
// was das Anwenden anhält und was still entfällt. Das Zeichnen selbst prüft
// der E2E-Fall BV-04 an der laufenden Anwendung.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const modul = await import('../../../src/renderer/modules/settings/settings-area-links.js');
const { validateAreaLinksSection, dirtyAreaLinksSection } = modul;

function entwurf(eintraege, snapshot) {
  return {
    areaLinks: { hasArea: true, areaName: 'Notizen', eintraege },
    areaLinksSnapshot: snapshot || [],
  };
}

const ORT = 'C:\\Zentral';

describe('validateAreaLinksSection — was das Anwenden anhaelt', () => {
  it('laesst einen vollstaendigen Eintrag durch', () => {
    expect(validateAreaLinksSection(entwurf([{ prefix: 'zt', path: ORT }]))).toBeNull();
  });

  it('haelt eine halb ausgefuellte Zeile an', () => {
    expect(validateAreaLinksSection(entwurf([{ prefix: 'zt', path: '' }]))).toBeTruthy();
    expect(validateAreaLinksSection(entwurf([{ prefix: '', path: ORT }]))).toBeTruthy();
  });

  it('laesst eine ganz leere Zeile still entfallen', () => {
    // Eine angefangene und wieder verworfene Zeile darf das Anwenden der
    // ganzen Seite nicht blockieren.
    expect(validateAreaLinksSection(entwurf([{ prefix: '', path: '' }]))).toBeNull();
    expect(validateAreaLinksSection(entwurf([{ prefix: '  ', path: '  ' }]))).toBeNull();
  });

  it('haelt ein unzulaessiges Kuerzel an', () => {
    for (const prefix of ['a:b', 'a/b', 'a b', 'a|b']) {
      expect(validateAreaLinksSection(entwurf([{ prefix, path: ORT }])), prefix).toBeTruthy();
    }
  });

  it('haelt ein doppelt vergebenes Kuerzel an, auch in anderer Schreibung', () => {
    const doppelt = entwurf([
      { prefix: 'zt', path: ORT },
      { prefix: 'ZT', path: 'C:\\Anders' },
    ]);
    expect(validateAreaLinksSection(doppelt)).toBeTruthy();
  });

  it('prueft nichts ohne Bereich', () => {
    expect(validateAreaLinksSection({ areaLinks: { hasArea: false, eintraege: [] } })).toBeNull();
    expect(validateAreaLinksSection({})).toBeNull();
  });

  it('prueft NICHT, ob der Ordner existiert', () => {
    // Ein verknuepfter Bereich darf auf einem getrennten Laufwerk liegen; das
    // Eintragen eines gerade nicht erreichbaren Pfades ist zulaessig (E4).
    const weg = entwurf([{ prefix: 'zt', path: 'Z:\\GibtEsGeradeNicht' }]);
    expect(validateAreaLinksSection(weg)).toBeNull();
  });
});

describe('dirtyAreaLinksSection — was als Aenderung gilt', () => {
  it('meldet keine Aenderung bei gleichem Stand', () => {
    const stand = [{ prefix: 'zt', path: ORT, templates: false }];
    expect(dirtyAreaLinksSection(entwurf([{ ...stand[0] }], stand))).toBe(false);
  });

  it('meldet die Aenderung von Pfad und Opt-in', () => {
    const stand = [{ prefix: 'zt', path: ORT, templates: false }];
    expect(dirtyAreaLinksSection(entwurf([{ prefix: 'zt', path: 'C:\\Neu' }], stand))).toBe(true);
    expect(
      dirtyAreaLinksSection(entwurf([{ prefix: 'zt', path: ORT, templates: true }], stand)),
    ).toBe(true);
  });

  it('meldet Anlegen und Entfernen', () => {
    const stand = [{ prefix: 'zt', path: ORT, templates: false }];
    expect(dirtyAreaLinksSection(entwurf([], stand))).toBe(true);
    expect(
      dirtyAreaLinksSection(
        entwurf([{ ...stand[0] }, { prefix: 'ar', path: 'C:\\Archiv' }], stand),
      ),
    ).toBe(true);
  });

  it('meldet eine leere Zeile NICHT als Aenderung', () => {
    const stand = [{ prefix: 'zt', path: ORT, templates: false }];
    const mitLeerzeile = entwurf([{ ...stand[0] }, { prefix: '', path: '' }], stand);
    expect(dirtyAreaLinksSection(mitLeerzeile)).toBe(false);
  });

  it('meldet nichts ohne Bereich', () => {
    expect(dirtyAreaLinksSection({ areaLinks: { hasArea: false, eintraege: [] } })).toBe(false);
    expect(dirtyAreaLinksSection({})).toBe(false);
  });
});
