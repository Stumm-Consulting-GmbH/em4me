// @vitest-environment jsdom
// 4T-001172 (Epic 3E-000220, E5): Feld-Formular des Dokuments — die Herkunft je
// Feld, der Ausklapp-Bereich mit den noch fehlenden Profil-Feldern und die
// Regel, die ein leeres Angebot aus dem Metadaten-Block heraushält.
// 4T-001173: dazu die Kette der beteiligten Profile und die Übernahme je Ebene.
//
// Geprüft wird das Verhalten am gebauten DOM, nicht der Quelltext als
// Zeichenkette. Das ist die Lehre aus dem Abnahme-Befund von 1.116.0: Vier
// Prüfungen des Profil-Symbols blieben grün, während das Symbol in jeder
// Reiter-Anordnung unsichtbar war, weil sie ausschließlich Verdrahtung lasen.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const {
  baueFeldFormular,
  baueHerkunftsZeichen,
  baueKette,
  bleibtAusDemDokument,
  fehlendeDefinitionen,
  fehlendeDefinitionenDerEbene,
  MARKE_NICHT_IM_DOKUMENT,
  markiereAngebot,
  zeigtFeldFormular,
} = await import('../../../src/renderer/modules/properties/properties-feld-formular.js');

// Kette, wie sie die Auflösung seit 4T-001171 liefert.
const KETTE = [
  { profile: 'Artikel', icon: '📄', stufe: 'assigned', tiefe: 0, fromDefault: false },
  { profile: 'Projekt', icon: '📁', stufe: 'assigned', tiefe: 1, fromDefault: false },
  { profile: 'Ordner-Profil', icon: null, stufe: 'folder', tiefe: 0, fromDefault: false },
];

function container() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// Minimale Feld-Zeile, wie sie buildPropertyFieldDom liefert — hier genügt
// die Klasse, an der der Schreibweg die Felder einsammelt.
function feldZeile(name) {
  const el = document.createElement('div');
  el.className = 'properties-field';
  el.dataset.originalKey = name;
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('AK3: Herkunft je Feld (4T-001172)', () => {
  it('zeigt das Symbol des Herkunfts-Profils und nennt den Weg im Tooltip', () => {
    const el = baueHerkunftsZeichen(
      { name: 'autor', profile: 'Artikel', stufe: 'assigned', tiefe: 0 },
      KETTE,
    );
    expect(el.textContent).toBe('📄');
    expect(el.title).toContain('Artikel');
    expect(el.title).toContain('Zuordnungs-Feld');
    expect(el.classList.contains('is-inherited')).toBe(false);
  });

  it('kennzeichnet ein geerbtes Feld und nennt seine Ebene', () => {
    const el = baueHerkunftsZeichen(
      { name: 'budget', profile: 'Projekt', stufe: 'assigned', tiefe: 1 },
      KETTE,
    );
    expect(el.textContent).toBe('📁');
    expect(el.classList.contains('is-inherited')).toBe(true);
    expect(el.title).toContain('Projekt');
    expect(el.title).toContain('1');
    expect(el.dataset.tiefe).toBe('1');
  });

  it('nennt jeden der vier Wege', () => {
    const wege = {
      assigned: 'Zuordnungs-Feld',
      tag: 'Schlagwort',
      folder: 'Ordner',
      default: 'Standard-Profil',
    };
    for (const [stufe, text] of Object.entries(wege)) {
      const el = baueHerkunftsZeichen({ name: 'f', profile: 'Artikel', stufe, tiefe: 0 }, KETTE);
      expect(el.title).toContain(text);
      expect(el.dataset.stufe).toBe(stufe);
    }
  });

  it('setzt ein Rückfall-Zeichen, wenn das Profil kein Symbol führt', () => {
    const el = baueHerkunftsZeichen(
      { name: 'x', profile: 'Ordner-Profil', stufe: 'folder', tiefe: 0 },
      KETTE,
    );
    expect(el.textContent).toBe('◆');
    expect(el.title).toContain('Ordner');
  });

  it('AK6: ein undefiniertes Feld trägt keine Herkunft', () => {
    expect(baueHerkunftsZeichen(null, KETTE)).toBeNull();
    expect(baueHerkunftsZeichen({ name: 'frei' }, KETTE)).toBeNull();
  });
});

describe('AK1/AK4: Feld-Menge des Formulars (4T-001172)', () => {
  const DEFS = [
    { name: 'autor', type: 'string', profile: 'Artikel' },
    { name: 'budget', type: 'number', profile: 'Projekt' },
    { name: 'status', type: 'string', profile: 'Projekt' },
  ];

  it('nennt genau die Definitionen, die das Dokument noch nicht trägt', () => {
    const fehlend = fehlendeDefinitionen(DEFS, { autor: 'Meier' });
    expect(fehlend.map((d) => d.name)).toEqual(['budget', 'status']);
  });

  it('vergleicht Feldnamen ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    const fehlend = fehlendeDefinitionen(DEFS, { Autor: 'Meier', BUDGET: 3 });
    expect(fehlend.map((d) => d.name)).toEqual(['status']);
  });

  it('behält die Reihenfolge der Auflösung bei', () => {
    const fehlend = fehlendeDefinitionen(DEFS, {});
    expect(fehlend.map((d) => d.name)).toEqual(['autor', 'budget', 'status']);
  });

  it('kommt mit leeren und defekten Eingaben zurecht', () => {
    expect(fehlendeDefinitionen(null, null)).toEqual([]);
    expect(fehlendeDefinitionen([], {})).toEqual([]);
    expect(fehlendeDefinitionen([null, { kein: 'name' }], {})).toEqual([]);
  });
});

describe('AK1/AK4: Ausklapp-Bereich (4T-001172)', () => {
  it('baut je fehlender Definition ein Feld und markiert es', () => {
    const c = container();
    const gebaut = [];
    baueFeldFormular(c, {
      fehlende: [
        { name: 'budget', type: 'number' },
        { name: 'status', type: 'string' },
      ],
      baueFeld: (def) => {
        gebaut.push(def.name);
        return feldZeile(def.name);
      },
    });
    expect(gebaut).toEqual(['budget', 'status']);
    const felder = c.querySelectorAll('.properties-field');
    expect(felder).toHaveLength(2);
    for (const f of felder) expect(f.classList.contains(MARKE_NICHT_IM_DOKUMENT)).toBe(true);
  });

  it('AK5: die Felder hängen im übergebenen Container, den der Schreibweg absucht', () => {
    // Der Schreibweg sammelt `.properties-field` UNTERHALB des Feld-Containers
    // ein. Läge der Bereich daneben, entstünde ein zweiter Schreibweg.
    const c = container();
    baueFeldFormular(c, {
      fehlende: [{ name: 'budget', type: 'number' }],
      baueFeld: (def) => feldZeile(def.name),
    });
    expect(c.querySelectorAll('.properties-field')).toHaveLength(1);
  });

  it('sagt es, wenn das Dokument bereits alle Felder trägt', () => {
    const c = container();
    baueFeldFormular(c, { fehlende: [], baueFeld: () => null });
    expect(c.querySelectorAll('.properties-field')).toHaveLength(0);
    expect(c.querySelector('.properties-all-fields-hint').textContent).toBe(
      de['properties.allFieldsComplete'],
    );
  });

  it('gibt den Bereich zurück, damit ein Kommando ihn öffnen kann', () => {
    const c = container();
    const bereich = baueFeldFormular(c, { fehlende: [], baueFeld: () => null });
    expect(bereich.tagName).toBe('DETAILS');
    expect(bereich.open).toBe(false);
    bereich.open = true;
    expect(c.querySelector('details').open).toBe(true);
  });
});

describe('AK6/AK9: wann es den Bereich überhaupt gibt (4T-001172)', () => {
  it('AK9: im Aus-Zustand der Erweiterung entsteht kein Bereich', () => {
    // Ohne aktive Erweiterung liefert refreshProfileResolution `null` — die
    // Sektion verhält sich dann exakt wie ohne Konfiguration.
    expect(zeigtFeldFormular(null)).toBe(false);
    expect(zeigtFeldFormular(undefined)).toBe(false);
  });

  it('AK6: ohne geltendes Profil entsteht kein leerer Bereich', () => {
    expect(zeigtFeldFormular({ fields: [], chain: [] })).toBe(false);
    expect(zeigtFeldFormular({ fields: [] })).toBe(false);
  });

  it('mit geltendem Profil entsteht er', () => {
    expect(zeigtFeldFormular({ fields: [], chain: KETTE })).toBe(true);
  });

  it('AK7: bei defektem Metadaten-Block entsteht kein Bereich', () => {
    // Sonst hielte das Formular jedes Profil-Feld für fehlend — der Block ist
    // ja unlesbar — und böte an, den ganzen Satz hineinzuschreiben.
    expect(zeigtFeldFormular({ fields: [], chain: KETTE }, { parseError: true })).toBe(false);
    expect(zeigtFeldFormular({ fields: [], chain: KETTE }, { parseError: false })).toBe(true);
  });
});

describe('AK5: ein leeres Angebot bleibt aus dem Dokument (4T-001172, 4T-001179)', () => {
  // 4T-001179 (Epic 3E-000220): Die Regel misst seit dem Befund der
  // Release-Abnahme 1.117.0 am BEDIENELEMENT und nicht mehr am typisierten
  // Wert. Über den Wert war sie für Zahlen und Ja/Nein-Felder falsch:
  // `extractFieldValue` liefert dort `0` bzw. `false`, und beides ist zu
  // Recht kein leerer Wert — die Angebote wurden dadurch ungefragt in das
  // Dokument geschrieben.
  function angebot(name, typ, wert) {
    const el = feldZeile(name);
    const wrap = document.createElement('div');
    wrap.className = 'properties-field-value';
    const eingabe = document.createElement('input');
    if (typ) eingabe.type = typ;
    if (typ === 'checkbox') eingabe.checked = !!wert;
    else eingabe.value = wert == null ? '' : String(wert);
    wrap.appendChild(eingabe);
    el.appendChild(wrap);
    el.classList.add(MARKE_NICHT_IM_DOKUMENT);
    markiereAngebot(el);
    return { el, eingabe };
  }

  it('hält ein unberührtes Textfeld draußen', () => {
    expect(bleibtAusDemDokument(angebot('autor', null, '').el)).toBe(true);
  });

  it('hält ein unberührtes Zahlenfeld draußen, obwohl es mit 0 vorbelegt ist', () => {
    // Der Kernfall des Befunds: emptyValueForType belegt ein Zahlen-Angebot
    // mit 0 vor, und über den Wert gemessen galt es damit als ausgefüllt.
    expect(bleibtAusDemDokument(angebot('budget', 'number', 0).el)).toBe(true);
  });

  it('hält ein unberührtes Ja/Nein-Feld draußen', () => {
    expect(bleibtAusDemDokument(angebot('aktiv', 'checkbox', false).el)).toBe(true);
  });

  it('lässt das Feld hinein, sobald der Anwender es berührt', () => {
    const { el, eingabe } = angebot('autor', null, '');
    eingabe.value = 'Meier';
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));
    expect(bleibtAusDemDokument(el)).toBe(false);
  });

  it('erkennt auch die Auswahl eines Ja/Nein-Feldes als Berührung', () => {
    // Ja/Nein und Auswahl-Listen melden `change` statt `input`.
    const { el, eingabe } = angebot('aktiv', 'checkbox', false);
    eingabe.checked = true;
    eingabe.dispatchEvent(new Event('change', { bubbles: true }));
    expect(bleibtAusDemDokument(el)).toBe(false);
  });

  it('unterscheidet die eingetragene Null von der vorbelegten', () => {
    // Genau diese Unterscheidung war über den Wert nicht möglich: Wer 0
    // bewusst einträgt, will das Feld im Dokument haben.
    const { el, eingabe } = angebot('budget', 'number', 0);
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));
    expect(bleibtAusDemDokument(el)).toBe(false);
  });

  it('rührt ein gewöhnliches Feld nicht an, auch wenn es leer ist', () => {
    // Ein Feld, das im Dokument steht, bleibt im Dokument — auch leer.
    const el = feldZeile('autor');
    expect(bleibtAusDemDokument(el)).toBe(false);
  });

  it('bleibt bei fehlendem Element stumm', () => {
    expect(bleibtAusDemDokument(null)).toBe(false);
  });
});

// --- 4T-001173 (Epic 3E-000220): Profil-Kette und Übernahme je Ebene -----------
// Die Kette macht die Vererbung sichtbar, die Übernahme macht sie benutzbar.
// Geprüft wird beides am gebauten DOM; die Übernahme selbst läuft über den
// vorhandenen Weg der Komplett-Übernahme und wird hier über den Callback
// nachgewiesen, den die Kette ruft.

const DEFS_KETTE = [
  { name: 'autor', type: 'string', profile: 'Artikel' },
  { name: 'budget', type: 'number', profile: 'Projekt' },
  { name: 'status', type: 'string', profile: 'Projekt' },
  { name: 'titel', type: 'string', profile: 'Ordner-Profil' },
];

describe('AK2: fehlende Felder einer Ebene (4T-001173)', () => {
  it('wählt genau die Felder des genannten Profils', () => {
    const fehlend = fehlendeDefinitionenDerEbene(DEFS_KETTE, {}, 'Projekt');
    expect(fehlend.map((d) => d.name)).toEqual(['budget', 'status']);
  });

  it('lässt aus, was das Dokument bereits trägt', () => {
    const fehlend = fehlendeDefinitionenDerEbene(DEFS_KETTE, { budget: 3 }, 'Projekt');
    expect(fehlend.map((d) => d.name)).toEqual(['status']);
  });

  it('vergleicht den Profil-Namen ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(fehlendeDefinitionenDerEbene(DEFS_KETTE, {}, 'projekt')).toHaveLength(2);
  });

  it('gibt bei leerem Profil-Namen nichts zurück', () => {
    expect(fehlendeDefinitionenDerEbene(DEFS_KETTE, {}, '')).toEqual([]);
    expect(fehlendeDefinitionenDerEbene(DEFS_KETTE, {}, null)).toEqual([]);
  });
});

describe('AK1: Kette der beteiligten Profile (4T-001173)', () => {
  const kette = (data = {}) =>
    baueKette(KETTE, {
      fehlendeJeEbene: (p) => fehlendeDefinitionenDerEbene(DEFS_KETTE, data, p),
      uebernehmen: () => {},
    });

  it('nennt jede Ebene mit Symbol, Profil und Weg', () => {
    const el = kette();
    const zeilen = el.querySelectorAll('.properties-chain-level');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0].querySelector('.properties-chain-name').textContent).toBe('Artikel');
    expect(zeilen[0].querySelector('.properties-chain-icon').textContent).toBe('📄');
    expect(zeilen[0].querySelector('.properties-chain-via').textContent).toContain(
      'Zuordnungs-Feld',
    );
    expect(zeilen[2].querySelector('.properties-chain-via').textContent).toContain('Ordner');
  });

  it('hält die Reihenfolge der Auflösung ein', () => {
    const namen = [...kette().querySelectorAll('.properties-chain-name')].map((e) => e.textContent);
    expect(namen).toEqual(['Artikel', 'Projekt', 'Ordner-Profil']);
  });

  it('kennzeichnet eine geerbte Ebene und rückt sie ein', () => {
    const zeilen = kette().querySelectorAll('.properties-chain-level');
    expect(zeilen[1].classList.contains('is-inherited')).toBe(true);
    expect(zeilen[1].dataset.tiefe).toBe('1');
    expect(zeilen[1].style.paddingLeft).toBe('10px');
    // Auf einer geerbten Ebene sagt «geerbt» mehr als der Weg des Kindes.
    expect(zeilen[1].querySelector('.properties-chain-via').textContent).toBe(
      de['properties.chainInherited'],
    );
    expect(zeilen[0].classList.contains('is-inherited')).toBe(false);
  });
});

describe('AK2/AK4/AK5: Übernahme je Ebene (4T-001173)', () => {
  it('bietet die Übernahme genau dort an, wo Felder fehlen', () => {
    const el = baueKette(KETTE, {
      // Nur auf der Ebene «Projekt» fehlt etwas.
      fehlendeJeEbene: (p) => (p === 'Projekt' ? [{ name: 'budget' }] : []),
      uebernehmen: () => {},
    });
    const zeilen = el.querySelectorAll('.properties-chain-level');
    expect(zeilen[0].querySelector('.properties-chain-fill')).toBeNull();
    expect(zeilen[1].querySelector('.properties-chain-fill')).not.toBeNull();
    expect(zeilen[2].querySelector('.properties-chain-fill')).toBeNull();
  });

  it('AK4: eine vollständige Ebene bietet keine Übernahme an', () => {
    const el = baueKette(KETTE, { fehlendeJeEbene: () => [], uebernehmen: () => {} });
    expect(el.querySelectorAll('.properties-chain-fill')).toHaveLength(0);
  });

  it('AK5: der Knopf übergibt genau seine Ebene an die Übernahme', () => {
    const gerufen = [];
    const el = baueKette(KETTE, {
      fehlendeJeEbene: () => [{ name: 'x' }],
      uebernehmen: (profil) => gerufen.push(profil),
    });
    const knoepfe = el.querySelectorAll('.properties-chain-fill');
    knoepfe[1].click();
    expect(gerufen).toEqual(['Projekt']);
    knoepfe[2].click();
    expect(gerufen).toEqual(['Projekt', 'Ordner-Profil']);
  });

  it('nennt die Zahl der fehlenden Felder am Knopf', () => {
    const el = baueKette(KETTE, {
      fehlendeJeEbene: (p) => (p === 'Projekt' ? [{ name: 'a' }, { name: 'b' }] : []),
      uebernehmen: () => {},
    });
    expect(el.querySelector('.properties-chain-fill').dataset.anzahl).toBe('2');
  });

  it('bleibt ohne Callbacks stumm, statt zu werfen', () => {
    const el = baueKette(KETTE, {});
    expect(el.querySelectorAll('.properties-chain-level')).toHaveLength(3);
    expect(el.querySelectorAll('.properties-chain-fill')).toHaveLength(0);
  });
});

describe('Kette im Formular-Bereich (4T-001173)', () => {
  it('steht über den fehlenden Feldern', () => {
    const c = container();
    baueFeldFormular(c, {
      fehlende: [{ name: 'budget', type: 'number' }],
      kette: KETTE,
      fehlendeJeEbene: () => [],
      uebernehmen: () => {},
      baueFeld: (def) => feldZeile(def.name),
    });
    const body = c.querySelector('.properties-all-fields-body');
    const kinder = [...body.children].map((e) => e.className.split(' ')[0]);
    expect(kinder[0]).toBe('properties-chain');
    expect(kinder).toContain('properties-field');
    expect(kinder.indexOf('properties-chain')).toBeLessThan(kinder.indexOf('properties-field'));
  });

  it('erscheint auch dann, wenn nichts fehlt — die Frage nach dem Warum bleibt', () => {
    const c = container();
    baueFeldFormular(c, {
      fehlende: [],
      kette: KETTE,
      fehlendeJeEbene: () => [],
      uebernehmen: () => {},
      baueFeld: () => null,
    });
    expect(c.querySelectorAll('.properties-chain-level')).toHaveLength(3);
    expect(c.querySelector('.properties-all-fields-hint')).not.toBeNull();
  });

  it('ohne Kette entsteht kein Ketten-Block', () => {
    const c = container();
    baueFeldFormular(c, { fehlende: [], baueFeld: () => null });
    expect(c.querySelector('.properties-chain')).toBeNull();
  });
});

// --- 4T-001173 (Epic 3E-000220): Der Auf-Zustand überlebt das Neu-Rendern -------
// Befund aus dem E2E-Lauf PP-14: Der Bereich wird bei jedem Render neu
// gebaut — beim Tab-Wechsel, bei jeder nachziehenden Auflösung und bei jedem
// Debounce-Save. Ohne einen Merker klappte er dabei zu, auch mitten in einer
// Eingabe. Der Zustand kommt deshalb von außen herein und wird beim Umschalten
// zurückgemeldet.
describe('Auf-Zustand des Formular-Bereichs (4T-001173)', () => {
  it('übernimmt den hereingereichten Zustand', () => {
    const c = container();
    const zu = baueFeldFormular(c, { fehlende: [], baueFeld: () => null });
    expect(zu.open).toBe(false);

    const c2 = container();
    const auf = baueFeldFormular(c2, { fehlende: [], baueFeld: () => null, offen: true });
    expect(auf.open).toBe(true);
  });

  it('meldet jedes Umschalten zurück', () => {
    const c = container();
    const gemeldet = [];
    const bereich = baueFeldFormular(c, {
      fehlende: [],
      baueFeld: () => null,
      merkeZustand: (auf) => gemeldet.push(auf),
    });
    bereich.open = true;
    bereich.dispatchEvent(new Event('toggle'));
    bereich.open = false;
    bereich.dispatchEvent(new Event('toggle'));
    expect(gemeldet).toEqual([true, false]);
  });

  it('kommt ohne Rückmeldung aus', () => {
    const c = container();
    const bereich = baueFeldFormular(c, { fehlende: [], baueFeld: () => null, offen: true });
    bereich.open = false;
    expect(() => bereich.dispatchEvent(new Event('toggle'))).not.toThrow();
  });
});
