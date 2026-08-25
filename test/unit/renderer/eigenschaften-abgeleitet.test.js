// @vitest-environment jsdom
// 4T-1185 (Epic 3E-0221, E1): Abgeleitete Felder in beiden Eigenschafts-Panels
// — Anzeige, Sperre und der Negativ-Nachweis, dass nichts geschrieben wird.
//
// **Der Schwerpunkt liegt auf dem Negativ-Nachweis.** Die Anzeige eines
// gerechneten Wertes ist die sichtbare, aber die harmlose Hälfte; die Zusage
// aus E1 ist die andere: Das Öffnen eines Dokuments verändert es nicht. Ein
// abgeleitetes Feld hängt in derselben Feld-Liste, aus der heraus gespeichert
// wird — die Regel «geht nie ins Dokument» ist damit die einzige Sperre
// zwischen einem gerechneten Wert und der Datei des Anwenders. Genau dieses
// Muster hat in Stufe 3 einen Fehler getragen (4T-1179), deshalb prüfen die
// Fälle unten das GESCHRIEBENE Ergebnis und nicht das DOM.
import { describe, it, expect, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { api } = await import('../../../src/renderer/modules/app/api.js');
const {
  MARKE_ABGELEITET,
  istAbgeleitetesFeld,
  renderAbgeleitetesFeld,
  setzeAbgeleitetenWert,
  sperreAbgeleitetesFeld,
  attachLookupWerte,
} = await import('../../../src/renderer/modules/properties/properties-neue-typen.js');
const { abgeleiteteDefinitionen, aktualisiereAbgeleiteteFelder, baueAbgeleiteteFelder } =
  await import('../../../src/renderer/modules/properties/properties-abgeleitet.js');
const { DERIVED_TYPES, buildProfileFillMap, profileFieldSuggestions } =
  await import('../../../src/shared/property-profiles.js');

// `properties-types.js` und `block-props-context.js` werden bewusst NICHT als
// Modul geladen, sondern als Quelltext gelesen: Beide hängen über
// `link-navigation` am Panel-Geflecht und sind in einem Unit-Umfeld nicht
// isoliert ladbar. Dasselbe Mittel nutzt `eigenschaften-neue-typen.test.js`
// seit 4T-1156 für dieselben Dateien.
const fsMod = await import('node:fs');
const quelleVon = (p) => fsMod.readFileSync(p, 'utf8');

function container() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const formel = (name, expression) => ({
  name,
  type: 'formula',
  values: null,
  multiple: false,
  default: null,
  profile: 'Sitzung',
  options: expression === null ? {} : { expression },
});

const lookup = (name) => ({
  name,
  type: 'lookup',
  values: null,
  multiple: false,
  default: null,
  profile: 'Sitzung',
  options: { from: 'FROM "Artikel"', relatedField: 'projekt' },
});

// Eine Feld-Zeile im Muster beider Panels: gleiche Klassen, verschiedener Bau.
function baueZeileStub(def, wert, hinweis) {
  const wrap = document.createElement('div');
  wrap.className = 'properties-field';
  wrap.dataset.currentType = def.type;
  const key = document.createElement('input');
  key.className = 'properties-field-key';
  key.value = def.name;
  const typ = document.createElement('select');
  typ.className = 'properties-field-type';
  const del = document.createElement('button');
  del.className = 'properties-field-delete';
  wrap.append(key, typ, del);
  const valueWrap = document.createElement('div');
  valueWrap.className = 'properties-field-value';
  renderAbgeleitetesFeld(valueWrap, wert, { hinweis });
  wrap.appendChild(valueWrap);
  return wrap;
}

describe('AK1/AK3: Anzeige eines abgeleiteten Wertes', () => {
  it('zeigt den errechneten Wert', () => {
    const c = container();
    renderAbgeleitetesFeld(c, 3000, { hinweis: null });
    expect(c.querySelector('.properties-field-abgeleitet').textContent).toBe('3000');
  });

  it('eine Liste erscheint kommagetrennt', () => {
    const c = container();
    renderAbgeleitetesFeld(c, ['Alpha', 'Beta'], {});
    expect(c.querySelector('.properties-field-abgeleitet').textContent).toBe('Alpha, Beta');
  });

  it('ein leerer Wert bleibt sichtbar und ist als leer markiert', () => {
    const c = container();
    renderAbgeleitetesFeld(c, null, {});
    const el = c.querySelector('.properties-field-abgeleitet');
    expect(el.textContent).toBe('');
    expect(el.classList.contains('is-leer')).toBe(true);
  });

  it('AK3: die Erläuterung nennt, dass gerechnet und nicht gespeichert wird', () => {
    const c = container();
    renderAbgeleitetesFeld(c, 42, {});
    expect(c.querySelector('.properties-field-abgeleitet').title).toBe(
      de['properties.derivedComputed'],
    );
  });

  it('AK8: ein Hinweis begleitet den leeren Wert, statt ihn zu ersetzen', () => {
    const c = container();
    renderAbgeleitetesFeld(c, null, { hinweis: 'derivedCycle' });
    const el = c.querySelector('.properties-field-abgeleitet');
    expect(el.dataset.hinweis).toBe('derivedCycle');
    expect(el.title).toBe(de['properties.derivedHint.derivedCycle']);
    expect(el.classList.contains('is-leer')).toBe(true);
  });

  it('jeder Hinweis-Code hat seinen Text in allen fünf Sprachen', async () => {
    const codes = [
      'derivedNoRule',
      'derivedBadExpr',
      'derivedBadRef',
      'derivedCycle',
      'derivedUnavailable',
    ];
    const sprachen = ['de', 'en', 'fr', 'es', 'it'];
    for (const sprache of sprachen) {
      const datei = await import(`../../../src/i18n/${sprache}.json`);
      for (const code of codes) {
        expect(datei.default['properties.derivedHint.' + code]).toBeTruthy();
      }
      expect(datei.default['properties.type.formula']).toBeTruthy();
      expect(datei.default['properties.type.lookup']).toBeTruthy();
    }
  });

  it('ein nachgereichter Wert ersetzt Wert und Hinweis am selben Element', () => {
    const c = container();
    const el = renderAbgeleitetesFeld(c, null, { hinweis: 'derivedNoRule' });
    setzeAbgeleitetenWert(el, ['Treffer'], null);
    expect(el.textContent).toBe('Treffer');
    expect(el.dataset.hinweis).toBeUndefined();
    expect(el.classList.contains('is-leer')).toBe(false);
  });
});

describe('AK4: ein abgeleitetes Feld ist nicht bearbeitbar', () => {
  it('Schlüssel und Typ-Wechsler sind gesperrt', () => {
    const wrap = baueZeileStub(formel('gesamt', '1 + 1'), 2, null);
    sperreAbgeleitetesFeld(wrap);
    expect(wrap.querySelector('.properties-field-key').disabled).toBe(true);
    expect(wrap.querySelector('.properties-field-type').disabled).toBe(true);
  });

  it('der Löschen-Knopf verschwindet ganz', () => {
    // Ein gesperrter Knopf verspräche eine Handlung, die es nicht gibt: In der
    // Datei steht nichts, was zu löschen wäre.
    const wrap = baueZeileStub(formel('gesamt', '1 + 1'), 2, null);
    sperreAbgeleitetesFeld(wrap);
    expect(wrap.querySelector('.properties-field-delete')).toBeNull();
  });

  it('die Zeile trägt die Marke, an der die Schreibwege sie erkennen', () => {
    const wrap = baueZeileStub(formel('gesamt', '1 + 1'), 2, null);
    expect(istAbgeleitetesFeld(wrap)).toBe(false);
    sperreAbgeleitetesFeld(wrap);
    expect(wrap.classList.contains(MARKE_ABGELEITET)).toBe(true);
    expect(istAbgeleitetesFeld(wrap)).toBe(true);
  });

  it('kein Bedienelement entsteht in der Wert-Zelle', () => {
    const wrap = baueZeileStub(formel('gesamt', '1 + 1'), 2, null);
    const zelle = wrap.querySelector('.properties-field-value');
    expect(zelle.querySelector('input, select, textarea, button')).toBeNull();
  });

  it('AK4: die abgeleiteten Typen erscheinen in keinem Typ-Wechsler zur Auswahl', () => {
    // Sie stehen im Typ-Satz des Editors, damit ein Feld seinen Typ zeigen
    // kann; wählbar sind sie in keinem der beiden Panels.
    const typen = quelleVon('src/renderer/modules/properties/properties-types.js');
    for (const typ of DERIVED_TYPES) {
      expect(typen).toContain(`'${typ}'`);
    }
    // Die nicht wählbaren Typen: beide abgeleiteten plus der readonly-Rückfall.
    const liste = /NICHT_WAEHLBARE_TYPEN = \[([^\]]*)\]/.exec(typen);
    expect(liste).not.toBeNull();
    for (const typ of [...DERIVED_TYPES, 'readonly']) {
      expect(liste[1]).toContain(`'${typ}'`);
    }
    // Das Dokument-Panel überspringt sie im Wechsler, das Block-Panel nimmt
    // sie gar nicht erst in seinen Satz auf.
    expect(quelleVon('src/renderer/modules/properties/properties-fields.js')).toContain(
      'NICHT_WAEHLBARE_TYPEN.includes(tname)',
    );
    const blockKontext = quelleVon('src/renderer/modules/properties/block-props-context.js');
    expect(blockKontext).toContain('BLOCK_PROP_TYPES = PROPERTY_TYPES.filter');
    expect(blockKontext).toContain('NICHT_WAEHLBARE_TYPEN.includes(ty)');
  });
});

describe('AK5/AK6: der Negativ-Nachweis der Schreibwege', () => {
  // Beide Schreibwege lesen ihre Werte aus dem DOM. Geprüft wird deshalb
  // genau das: was sie aus einer Feld-Liste mit abgeleiteten Zeilen bauen.
  it('der Dokument-Schreibweg lässt abgeleitete Felder aus', async () => {
    const quelle = await import('node:fs').then((fs) =>
      fs.readFileSync('src/renderer/modules/properties/properties-save.js', 'utf8'),
    );
    // Die Regel steht VOR dem readonly-Zweig; sonst schriebe dieser den
    // Ursprungs-Wert eines gleichnamigen Feldes zurück.
    const idxAbgeleitet = quelle.indexOf('istAbgeleitetesFeld(fieldEl)');
    const idxReadonly = quelle.indexOf("type === 'readonly'");
    expect(idxAbgeleitet).toBeGreaterThan(0);
    expect(idxAbgeleitet).toBeLessThan(idxReadonly);
  });

  it('der Block-Schreibweg lässt abgeleitete Felder aus', async () => {
    const quelle = await import('node:fs').then((fs) =>
      fs.readFileSync('src/renderer/modules/properties/block-props-save.js', 'utf8'),
    );
    expect(quelle).toContain('istAbgeleitetesFeld(row)');
    expect(quelle).toContain("from './properties-neue-typen.js'");
  });

  it('AK7: ein abgeleitetes Feld wird nie zur Übernahme angeboten', () => {
    const felder = [
      { name: 'titel', type: 'string' },
      formel('gesamt', 'budget + reserve'),
      lookup('artikel'),
    ];
    const vorschlaege = profileFieldSuggestions(felder, [], []);
    expect(vorschlaege.map((v) => v.name)).toEqual(['titel']);
  });

  it('AK7: die Komplett-Übernahme legt kein abgeleitetes Feld an', () => {
    const felder = [
      { name: 'titel', type: 'string' },
      formel('gesamt', 'budget + reserve'),
      lookup('artikel'),
    ];
    expect(Object.keys(buildProfileFillMap(felder, []))).toEqual(['titel']);
  });
});

describe('Bau der abgeleiteten Zeilen', () => {
  it('nur abgeleitete Definitionen ergeben Zeilen', () => {
    const aufloesung = {
      fields: [{ name: 'budget', type: 'number' }, formel('gesamt', 'budget * 2')],
    };
    const c = container();
    const gebaut = baueAbgeleiteteFelder(c, {
      aufloesung,
      werte: { budget: 21 },
      baueZeile: baueZeileStub,
    });
    expect(gebaut).toBe(1);
    expect(c.querySelectorAll('.properties-field')).toHaveLength(1);
    expect(c.querySelector('.properties-field-abgeleitet').textContent).toBe('42');
  });

  it('ohne abgeleitete Definitionen entsteht nichts', () => {
    const c = container();
    const gebaut = baueAbgeleiteteFelder(c, {
      aufloesung: { fields: [{ name: 'titel', type: 'string' }] },
      werte: {},
      baueZeile: baueZeileStub,
    });
    expect(gebaut).toBe(0);
    expect(c.children).toHaveLength(0);
  });

  it('AK9: ohne Auflösung entsteht nichts (Erweiterungs-Gate)', () => {
    // Im Aus-Zustand von property-profiles liefert die Auflösung nichts —
    // damit entfallen die abgeleiteten Felder von selbst, ohne eigene Abfrage.
    const c = container();
    expect(baueAbgeleiteteFelder(c, { aufloesung: null, baueZeile: baueZeileStub })).toBe(0);
    expect(baueAbgeleiteteFelder(c, { aufloesung: { fields: [] }, baueZeile: baueZeileStub })).toBe(
      0,
    );
    expect(abgeleiteteDefinitionen(null)).toEqual([]);
  });

  it('jede gebaute Zeile ist gesperrt und markiert', () => {
    const c = container();
    baueAbgeleiteteFelder(c, {
      aufloesung: { fields: [formel('gesamt', '1 + 1')] },
      werte: {},
      baueZeile: baueZeileStub,
    });
    const zeile = c.querySelector('.properties-field');
    expect(istAbgeleitetesFeld(zeile)).toBe(true);
    expect(zeile.querySelector('.properties-field-delete')).toBeNull();
  });

  it('AK8: ein Kreis-Bezug erscheint leer mit Hinweis, statt zu fehlen', () => {
    const c = container();
    baueAbgeleiteteFelder(c, {
      aufloesung: { fields: [formel('a', 'b + 1'), formel('b', 'a + 1')] },
      werte: {},
      baueZeile: baueZeileStub,
    });
    const anzeigen = c.querySelectorAll('.properties-field-abgeleitet');
    expect(anzeigen).toHaveLength(2);
    for (const el of anzeigen) expect(el.dataset.hinweis).toBe('derivedCycle');
  });

  it('ein Lookup bekommt keinen Hinweis der lokalen Auswertung', () => {
    // Es rechnet nicht lokal; «keine Rechenvorschrift» gälte fälschlich, denn
    // seine Vorschrift ist die Abfrage, und die läuft im Main.
    const c = container();
    baueAbgeleiteteFelder(c, {
      aufloesung: { fields: [lookup('artikel')] },
      werte: {},
      baueZeile: baueZeileStub,
    });
    expect(c.querySelector('.properties-field-abgeleitet').dataset.hinweis).toBeUndefined();
  });
});

describe('Nachzug der Werte nach einer Änderung', () => {
  // Der Block-Weg baut seine Feld-Zeilen beim Speichern bewusst NICHT neu
  // (Fokus-Erhalt der laufenden Eingabe). Ohne einen eigenen Nachzug bliebe
  // ein gerechneter Wert dort nach jeder Änderung veraltet stehen — belegt im
  // E2E-Fall PP-13, der genau daran zuerst gescheitert ist.
  function bauen(aufloesung, werte) {
    const c = container();
    baueAbgeleiteteFelder(c, { aufloesung, werte, baueZeile: baueZeileStub });
    return c;
  }

  it('trägt den neuen Wert in die vorhandene Zeile ein, ohne sie zu ersetzen', () => {
    const aufloesung = {
      fields: [{ name: 'netto', type: 'number' }, formel('brutto', 'netto * 2')],
    };
    const c = bauen(aufloesung, { netto: 21 });
    const zeile = c.querySelector('.properties-field');
    expect(zeile.querySelector('.properties-field-abgeleitet').textContent).toBe('42');
    const getroffen = aktualisiereAbgeleiteteFelder(c, { aufloesung, werte: { netto: 25 } });
    expect(getroffen).toBe(1);
    expect(c.querySelector('.properties-field')).toBe(zeile); // dieselbe Zeile
    expect(zeile.querySelector('.properties-field-abgeleitet').textContent).toBe('50');
  });

  it('zieht auch den Hinweis nach', () => {
    const aufloesung = { fields: [formel('a', 'gibtsnicht + 1')] };
    const c = bauen(aufloesung, {});
    const anzeige = c.querySelector('.properties-field-abgeleitet');
    expect(anzeige.dataset.hinweis).toBe('derivedBadRef');
    // Sobald das Feld existiert, ist der Bezug auflösbar.
    aktualisiereAbgeleiteteFelder(c, { aufloesung, werte: { gibtsnicht: 41 } });
    expect(anzeige.dataset.hinweis).toBeUndefined();
    expect(anzeige.textContent).toBe('42');
  });

  it('lässt Lookup-Zeilen unberührt', () => {
    // Sie hängen am Bereichs-Index, nicht an den Feldern dieses Dokuments;
    // ein Nachzug hier überschriebe ihren geholten Wert mit einem leeren.
    const aufloesung = { fields: [lookup('artikel')] };
    const c = bauen(aufloesung, {});
    const anzeige = c.querySelector('.properties-field-abgeleitet');
    setzeAbgeleitetenWert(anzeige, ['Eckig'], null);
    expect(aktualisiereAbgeleiteteFelder(c, { aufloesung, werte: {} })).toBe(0);
    expect(anzeige.textContent).toBe('Eckig');
  });

  it('ohne abgeleitete Felder passiert nichts', () => {
    const c = container();
    expect(aktualisiereAbgeleiteteFelder(c, { aufloesung: null, werte: {} })).toBe(0);
    expect(aktualisiereAbgeleiteteFelder(null, { aufloesung: { fields: [] } })).toBe(0);
  });

  it('der Block-Schreibweg ruft den Nachzug', async () => {
    const quelle = quelleVon('src/renderer/modules/properties/block-props-save.js');
    expect(quelle).toContain('aktualisiereAbgeleiteteFelder');
    expect(quelle).toContain("from './properties-abgeleitet.js'");
  });
});

describe('AK1: Lookup-Werte kommen auf Verlangen nach', () => {
  it('holt die Treffer und trägt sie ein', async () => {
    const aufrufe = [];
    api.profilesLookup = async (params) => {
      aufrufe.push(params);
      return { ok: true, status: 'ready', values: ['Eckig', 'Blank'] };
    };
    const c = container();
    const el = renderAbgeleitetesFeld(c, null, {});
    await attachLookupWerte(el, { def: lookup('artikel'), filePath: '/x/Start.md' });
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].path).toBe('/x/Start.md');
    expect(aufrufe[0].options.relatedField).toBe('projekt');
    expect(el.textContent).toBe('Eckig, Blank');
  });

  it('ohne relatedField wird gar nicht erst gefragt', async () => {
    let gefragt = 0;
    api.profilesLookup = async () => {
      gefragt += 1;
      return { ok: true, status: 'ready', values: [] };
    };
    const c = container();
    const el = renderAbgeleitetesFeld(c, null, {});
    await attachLookupWerte(el, { def: { type: 'lookup', options: {} }, filePath: '/x/Start.md' });
    expect(gefragt).toBe(0);
  });

  it('ein nicht bereiter Index ergibt leer mit Hinweis, keine falsche Aussage', async () => {
    // «Keine Treffer» und «konnte nicht ermitteln» sind für den Anwender
    // verschiedene Aussagen; die zweite darf nicht als die erste erscheinen.
    api.profilesLookup = async () => ({ ok: true, status: 'indexing', values: [] });
    const c = container();
    const el = renderAbgeleitetesFeld(c, null, {});
    await attachLookupWerte(el, { def: lookup('artikel'), filePath: '/x/Start.md' });
    expect(el.dataset.hinweis).toBe('derivedUnavailable');
  });

  it('eine leere Treffer-Liste ist kein Hinweis-Fall', async () => {
    api.profilesLookup = async () => ({ ok: true, status: 'ready', values: [] });
    const c = container();
    const el = renderAbgeleitetesFeld(c, null, {});
    await attachLookupWerte(el, { def: lookup('artikel'), filePath: '/x/Start.md' });
    expect(el.dataset.hinweis).toBeUndefined();
    expect(el.classList.contains('is-leer')).toBe(true);
  });

  it('ein Fehler im Kanal wirft nicht', async () => {
    api.profilesLookup = async () => {
      throw new Error('kaputt');
    };
    const c = container();
    const el = renderAbgeleitetesFeld(c, null, {});
    await expect(
      attachLookupWerte(el, { def: lookup('artikel'), filePath: '/x/Start.md' }),
    ).resolves.toBeNull();
    expect(el.dataset.hinweis).toBe('derivedUnavailable');
  });
});

describe('AK2: Parität beider Panels', () => {
  it('beide Panels bauen abgeleitete Felder aus derselben Quelle', async () => {
    // Derselbe Nachweis wie bei den Typen der Stufe 2: Statt zwei Umsetzungen
    // zu vergleichen, wird geprüft, dass beide Panels dieselben Funktionen
    // rufen. Ein Panel mit eigenem Zweig fiele hier auf.
    const fs = await import('node:fs');
    const quellen = [
      'src/renderer/modules/properties/properties-wert-editor.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ].map((p) => fs.readFileSync(p, 'utf8'));
    for (const quelle of quellen) {
      expect(quelle).toContain("from './properties-neue-typen.js'");
      expect(quelle).toContain('renderAbgeleitetesFeld');
      expect(quelle).toContain('attachLookupWerte');
    }
  });

  it('beide Panels hängen die abgeleiteten Felder über dieselbe Funktion an', async () => {
    const fs = await import('node:fs');
    const quellen = [
      'src/renderer/modules/properties/properties-fields.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ].map((p) => fs.readFileSync(p, 'utf8'));
    for (const quelle of quellen) {
      expect(quelle).toContain("from './properties-abgeleitet.js'");
      expect(quelle).toContain('baueAbgeleiteteFelder');
    }
  });

  it('das Bau-Modul bleibt außerhalb der Zyklus-Komponente der Renderer-Ordner', async () => {
    const fs = await import('node:fs');
    const quelle = fs.readFileSync(
      'src/renderer/modules/properties/properties-abgeleitet.js',
      'utf8',
    );
    expect(quelle).not.toContain("from '../views/");
    // Der Zeilen-Bau kommt als Parameter herein; ein Import der Panel-Module
    // machte dieses Modul zum Teilnehmer der Ordner-Zyklen.
    expect(quelle).not.toContain("from './properties-fields.js'");
    expect(quelle).not.toContain("from './block-props-fields.js'");
  });
});
