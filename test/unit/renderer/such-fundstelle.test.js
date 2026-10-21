// @vitest-environment jsdom
// 4T-002217 (Epic 3E-000355): Der gemeinsame Weg, auf dem jede Suche eine
// Fundstelle der Lese-Ansicht zeigt (search-fundstelle.js).
//
// Geprüft wird die Reihenfolge und der Umfang des Öffnens, nicht das Rollen
// selbst: jsdom rechnet kein Layout. Ob der Treffer danach in der Mitte steht,
// prüfen die Ablauf-Fälle SD-06, BS-15 und SH-11 an der laufenden Anwendung.
// `scrollIntoView` gibt es in jsdom nicht; die Attrappe hält fest, mit welchen
// Optionen und in welchem Zustand der Kästen gerollt wurde.
import { describe, it, expect, beforeEach } from 'vitest';
import { zeigeFundstelleInDerLeseAnsicht } from '../../../src/renderer/modules/search/search-fundstelle.js';

let rollen;

function baue(html) {
  document.body.innerHTML = html;
  const ziel = document.querySelector('mark');
  ziel.scrollIntoView = (optionen) => {
    rollen.push({
      optionen,
      offen: [...document.querySelectorAll('details')].map((d) => d.open),
    });
  };
  return ziel;
}

describe('such-fundstelle (4T-002217)', () => {
  beforeEach(() => {
    rollen = [];
  });

  it('öffnet einen eingeklappten Kasten um den Treffer vor dem Rollen und rollt in die Mitte', () => {
    const ziel = baue(
      '<div class="markdown-body"><details class="callout"><summary>Titel</summary>' +
        '<div><p>Absatz mit <mark>Treffer</mark>.</p></div></details></div>',
    );
    zeigeFundstelleInDerLeseAnsicht(ziel);
    expect(rollen).toEqual([
      { optionen: { block: 'center', inline: 'nearest', behavior: 'auto' }, offen: [true] },
    ]);
  });

  it('öffnet jeden eingeklappten Vorfahren bei ineinander liegenden Kästen, aber keinen daneben', () => {
    const ziel = baue(
      '<details id="aussen"><summary>A</summary>' +
        '<details id="innen"><summary>B</summary><p><mark>Treffer</mark></p></details>' +
        '</details>' +
        '<details id="daneben"><summary>C</summary><p>ohne Treffer</p></details>',
    );
    zeigeFundstelleInDerLeseAnsicht(ziel);
    expect(document.getElementById('aussen').open).toBe(true);
    expect(document.getElementById('innen').open).toBe(true);
    expect(document.getElementById('daneben').open).toBe(false);
    // Beim Rollen waren beide Vorfahren schon offen.
    expect(rollen[0].offen).toEqual([true, true, false]);
  });

  it('lässt einen schon offenen Kasten offen und rollt einen Treffer ohne Kasten unverändert', () => {
    const imOffenen = baue(
      '<details open><summary>A</summary><p><mark>Treffer</mark></p></details>',
    );
    zeigeFundstelleInDerLeseAnsicht(imOffenen);
    expect(rollen[0].offen).toEqual([true]);

    rollen = [];
    const ohneKasten = baue('<p><mark>Treffer</mark></p>');
    zeigeFundstelleInDerLeseAnsicht(ohneKasten);
    expect(rollen).toHaveLength(1);
    expect(rollen[0].offen).toEqual([]);
  });

  it('tut nichts ohne Ziel oder ohne Roll-Fähigkeit', () => {
    expect(() => zeigeFundstelleInDerLeseAnsicht(null)).not.toThrow();
    expect(() => zeigeFundstelleInDerLeseAnsicht({ from: 3, to: 7 })).not.toThrow();
    expect(rollen).toEqual([]);
  });
});
