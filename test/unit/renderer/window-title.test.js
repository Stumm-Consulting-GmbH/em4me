// 4T-0318 (Epic 3E-0057): Unit-Tests für den gestuften Titel-Suffix und die
// Fenster-Ziel-Labels (src/renderer/modules/window-title.js). Die gestufte
// Systematik ist eine PO-Entscheidung: App-Teil nur bei mehreren nummerierten
// Apps, Bereichsname immer, Fenster-Teil nur bei mehreren Fenstern der App.
import { describe, it, expect } from 'vitest';
import {
  buildTitleSuffix,
  buildWindowTargetLabel,
} from '../../../src/renderer/modules/window-title.js';

// Deutsche Werte der echten i18n-Keys als Fixture.
const DICT = {
  'window.title.suffix': 'Fenster {n}',
  'window.title.app': 'App {n}',
  'window.title.area': 'Bereich {name}',
  'window.title.workspace': 'Arbeitsbereich {name}',
  'tab.menu.targetWindowLabel': 'Fenster {n}',
};
const t = (key) => DICT[key] || key;

describe('buildTitleSuffix (4T-0318)', () => {
  it('ein Fenster, eine App: kein Suffix', () => {
    expect(
      buildTitleSuffix(
        {
          areaName: null,
          appNumber: 1,
          numberedAppCount: 1,
          displayNumber: 1,
          totalWindowCount: 1,
        },
        t,
      ),
    ).toBe('');
  });

  it('mehrere Fenster, eine App: nur Fenster-Teil', () => {
    expect(
      buildTitleSuffix(
        {
          areaName: null,
          appNumber: 1,
          numberedAppCount: 1,
          displayNumber: 2,
          totalWindowCount: 3,
        },
        t,
      ),
    ).toBe(' (Fenster 2)');
  });

  it('mehrere Apps, ein Fenster: nur App-Teil', () => {
    expect(
      buildTitleSuffix(
        {
          areaName: null,
          appNumber: 2,
          numberedAppCount: 2,
          displayNumber: 1,
          totalWindowCount: 1,
        },
        t,
      ),
    ).toBe(' (App 2)');
  });

  it('mehrere Apps und Fenster: kombinierter Suffix (PO-Beispiel)', () => {
    expect(
      buildTitleSuffix(
        {
          areaName: null,
          appNumber: 2,
          numberedAppCount: 2,
          displayNumber: 3,
          totalWindowCount: 3,
        },
        t,
      ),
    ).toBe(' (App 2, Fenster 3)');
  });

  it('Bereichs-App: Bereichsname immer, auch solo', () => {
    expect(
      buildTitleSuffix(
        {
          areaName: 'Notizen',
          appNumber: 0,
          numberedAppCount: 1,
          displayNumber: 1,
          totalWindowCount: 1,
        },
        t,
      ),
    ).toBe(' (Bereich Notizen)');
  });

  it('Bereichs-App mit mehreren Fenstern: Bereich plus Fenster-Teil', () => {
    expect(
      buildTitleSuffix(
        {
          areaName: 'Notizen',
          appNumber: 0,
          numberedAppCount: 2,
          displayNumber: 2,
          totalWindowCount: 2,
        },
        t,
      ),
    ).toBe(' (Bereich Notizen, Fenster 2)');
  });

  // 4T-0538 (Epic 3E-0098): der Arbeitsbereichs-Name tritt an die Stelle
  // der App-Nummer; bei gebundenem Bereich kombiniert; der Fenster-Teil
  // folgt der bestehenden Stufung.
  it('Arbeitsbereichs-App: Name statt App-Nummer, auch solo (4T-0538)', () => {
    expect(
      buildTitleSuffix(
        {
          workspaceName: 'Projekt Alpha',
          areaName: null,
          appNumber: 0,
          numberedAppCount: 2,
          displayNumber: 1,
          totalWindowCount: 1,
        },
        t,
      ),
    ).toBe(' (Arbeitsbereich Projekt Alpha)');
  });

  it('Arbeitsbereich mit Bereich und mehreren Fenstern: kombiniert (4T-0538)', () => {
    expect(
      buildTitleSuffix(
        {
          workspaceName: 'Projekt Alpha',
          areaName: 'Notizen',
          appNumber: 0,
          numberedAppCount: 1,
          displayNumber: 2,
          totalWindowCount: 2,
        },
        t,
      ),
    ).toBe(' (Arbeitsbereich Projekt Alpha, Bereich Notizen, Fenster 2)');
  });
});

describe('buildWindowTargetLabel (4T-0318)', () => {
  it('eine App: nur Fenster-Label wie bisher', () => {
    expect(buildWindowTargetLabel({ displayNumber: 2, appNumber: 1, appCount: 1 }, t)).toBe(
      'Fenster 2',
    );
  });

  it('mehrere Apps: App-Kontext vorangestellt', () => {
    expect(buildWindowTargetLabel({ displayNumber: 1, appNumber: 2, appCount: 2 }, t)).toBe(
      'App 2, Fenster 1',
    );
  });

  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-App als Ziel ist ueber ihren
  // Namen adressiert (analog Bereichs-Apps).
  it('Arbeitsbereichs-App als Ziel: Arbeitsbereichs-Name (4T-0538)', () => {
    expect(
      buildWindowTargetLabel(
        { displayNumber: 1, appNumber: 0, appCount: 2, workspaceName: 'Projekt Alpha' },
        t,
      ),
    ).toBe('Arbeitsbereich Projekt Alpha, Fenster 1');
  });

  it('Bereichs-App als Ziel: Bereichsname statt App-Nummer', () => {
    expect(
      buildWindowTargetLabel(
        { displayNumber: 2, appNumber: 0, appCount: 2, areaName: 'Notizen' },
        t,
      ),
    ).toBe('Bereich Notizen, Fenster 2');
  });
});
