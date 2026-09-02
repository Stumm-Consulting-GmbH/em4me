// 4T-001171 (Epic 3E-000220): Unit-Tests der Herkunft je Feld — der Weg, über den
// ein Profil erreicht wurde, die Vererbungs-Tiefe innerhalb seiner Kette und
// die geordnete Kette der beteiligten Profile.
//
// Eigene Datei nach dem Muster von 4T-001159: Die HERKUNFT ist ein eigener
// Gegenstand neben den Zuordnungs-Wegen und der Vererbung selbst, und
// `property-profiles-aufloesung.test.js` steht mit über 700 Zeilen dicht am
// Test-Budget. Was die Wege binden, prüft `property-profiles-zuordnung.test.js`;
// hier steht ausschließlich, was ein Feld über seine eigene Herkunft sagt.
import { describe, it, expect } from 'vitest';
import { resolveProfileFields } from '../../src/shared/property-profiles.js';

// Ein Bestand mit dreistufiger Vererbung, damit sich Tiefe 0, 1 und 2 zeigen
// lassen, und mit je einem Profil für die vier Wege der Folge.
const PROFILE = [
  { name: 'Artikel', fields: [{ name: 'autor' }], parent: 'Projekt' },
  { name: 'Projekt', fields: [{ name: 'budget' }, { name: 'status' }], parent: 'Basis' },
  { name: 'Basis', fields: [{ name: 'erstellt' }] },
  { name: 'Sitzung', fields: [{ name: 'ort' }] },
  { name: 'Alle', fields: [{ name: 'titel' }] },
];

const BINDINGS = [
  { profile: 'Sitzung', tags: ['sitzung'], folders: [] },
  { profile: 'Projekt', tags: [], folders: ['10 Projekte'] },
];

const feld = (r, name) => r.fields.find((f) => f.name === name);

describe('resolveProfileFields — Weg je Feld (4T-001171)', () => {
  it('AK1: das Zuordnungs-Feld ergibt den Weg "assigned"', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Sitzung'] });
    expect(feld(r, 'ort').stufe).toBe('assigned');
  });

  it('AK1: ein Schlagwort ergibt den Weg "tag"', () => {
    const r = resolveProfileFields(PROFILE, { bindings: BINDINGS, tags: ['sitzung'] });
    expect(feld(r, 'ort').stufe).toBe('tag');
  });

  it('AK1: ein Ordner ergibt den Weg "folder"', () => {
    const r = resolveProfileFields(PROFILE, { bindings: BINDINGS, folder: '10 Projekte' });
    expect(feld(r, 'budget').stufe).toBe('folder');
  });

  it('AK1: das Standard-Profil ergibt den Weg "default"', () => {
    const r = resolveProfileFields(PROFILE, { defaultProfile: 'Alle' });
    expect(feld(r, 'titel').stufe).toBe('default');
  });

  it('AK1: der Weg des Start-Profils gilt für seine ganze Eltern-Kette', () => {
    // Der Ordner bindet "Projekt"; "Basis" wird über dessen Kette erreicht und
    // trägt denselben Weg — geerbt wird innerhalb einer Stufe, nicht daneben.
    const r = resolveProfileFields(PROFILE, { bindings: BINDINGS, folder: '10 Projekte' });
    expect(feld(r, 'erstellt').stufe).toBe('folder');
  });
});

describe('resolveProfileFields — Vererbungs-Tiefe je Feld (4T-001171)', () => {
  it('AK2: zählt vom zugeordneten Profil aus über die ganze Kette', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Artikel'] });
    expect(feld(r, 'autor').tiefe).toBe(0);
    expect(feld(r, 'budget').tiefe).toBe(1);
    expect(feld(r, 'erstellt').tiefe).toBe(2);
  });

  it('AK2: jedes Start-Profil beginnt wieder bei 0', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Sitzung', 'Artikel'] });
    expect(feld(r, 'ort').tiefe).toBe(0);
    expect(feld(r, 'autor').tiefe).toBe(0);
    expect(feld(r, 'budget').tiefe).toBe(1);
  });

  it('AK2: ein Profil ohne Eltern liefert durchgehend Tiefe 0', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Sitzung'] });
    expect(r.fields.every((f) => f.tiefe === 0)).toBe(true);
  });
});

describe('resolveProfileFields — Kette der beteiligten Profile (4T-001171)', () => {
  it('AK3: nennt je Eintrag Profil, Weg, Tiefe und Standard-Kennzeichen', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Artikel'], defaultProfile: 'Alle' });
    expect(r.chain).toEqual([
      { profile: 'Artikel', icon: null, stufe: 'assigned', tiefe: 0, fromDefault: false },
      { profile: 'Projekt', icon: null, stufe: 'assigned', tiefe: 1, fromDefault: false },
      { profile: 'Basis', icon: null, stufe: 'assigned', tiefe: 2, fromDefault: false },
      { profile: 'Alle', icon: null, stufe: 'default', tiefe: 0, fromDefault: true },
    ]);
  });

  it('AK4: bildet dieselbe Ordnung ab, die auch die Felder bestimmt', () => {
    const r = resolveProfileFields(PROFILE, {
      assigned: ['Artikel'],
      bindings: BINDINGS,
      tags: ['sitzung'],
      defaultProfile: 'Alle',
    });
    // Erstes Ketten-Element ist das zuerst aufgelöste Profil, und die Felder
    // erscheinen in genau dieser Profil-Reihenfolge.
    expect(r.chain[0].profile).toBe('Artikel');
    expect(r.chain.map((e) => e.profile)).toEqual([
      'Artikel',
      'Projekt',
      'Basis',
      'Sitzung',
      'Alle',
    ]);
    expect(r.fields.map((f) => f.profile)).toEqual([
      'Artikel',
      'Projekt',
      'Projekt',
      'Basis',
      'Sitzung',
      'Alle',
    ]);
  });

  it('AK4: ein Profil erscheint genau einmal, auch wenn zwei Wege darauf zeigen', () => {
    // "Projekt" ist zugeordnet UND über den Ordner gebunden: Der zweite Weg
    // fügt nichts hinzu, und die Kette zeigt den ZUERST erreichten Weg.
    const r = resolveProfileFields(PROFILE, {
      assigned: ['Projekt'],
      bindings: BINDINGS,
      folder: '10 Projekte',
    });
    expect(r.chain.filter((e) => e.profile === 'Projekt')).toHaveLength(1);
    expect(r.chain[0].stufe).toBe('assigned');
  });

  it('AK3: ohne jedes Profil bleibt die Kette leer', () => {
    const r = resolveProfileFields(PROFILE, {});
    expect(r.chain).toEqual([]);
    expect(r.leading).toBeNull();
  });

  it('AK3: ein fehlendes Profil steht in "missing" und nicht in der Kette', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Gibtsnicht'] });
    expect(r.missing).toEqual(['Gibtsnicht']);
    expect(r.chain).toEqual([]);
  });
});

describe('resolveProfileFields — eine Folge, keine zweite Wahrheit (4T-001171)', () => {
  it('AK7: die Herkunft jedes Feldes deckt sich mit seinem Ketten-Eintrag', () => {
    const r = resolveProfileFields(PROFILE, {
      assigned: ['Artikel'],
      bindings: BINDINGS,
      tags: ['sitzung'],
      folder: '10 Projekte',
      defaultProfile: 'Alle',
    });
    for (const f of r.fields) {
      const eintrag = r.chain.find((e) => e.profile === f.profile);
      expect(eintrag).toBeDefined();
      expect(f.stufe).toBe(eintrag.stufe);
      expect(f.tiefe).toBe(eintrag.tiefe);
      expect(f.fromDefault).toBe(eintrag.fromDefault);
    }
  });

  it('AK5: fromDefault und leading behalten ihre Bedeutung', () => {
    const r = resolveProfileFields(PROFILE, { assigned: ['Sitzung'], defaultProfile: 'Alle' });
    expect(feld(r, 'ort').fromDefault).toBe(false);
    expect(feld(r, 'titel').fromDefault).toBe(true);
    expect(r.leading).toEqual({ profile: 'Sitzung', icon: null, stufe: 'assigned' });
    // leading ist inhaltlich chain[0], bleibt aber eine eigene Zusicherung.
    expect(r.leading.profile).toBe(r.chain[0].profile);
    expect(r.leading.stufe).toBe(r.chain[0].stufe);
  });

  it('AK6: ein ausgeschlossenes Feld erscheint auch mit den neuen Angaben nicht', () => {
    const profile = [
      { name: 'Kind', fields: [{ name: 'eigen' }], parent: 'Eltern', exclude: ['budget'] },
      { name: 'Eltern', fields: [{ name: 'budget' }, { name: 'status' }] },
    ];
    const r = resolveProfileFields(profile, { assigned: ['Kind'] });
    expect(r.fields.map((f) => f.name)).toEqual(['eigen', 'status']);
    expect(feld(r, 'status').tiefe).toBe(1);
  });

  it('AK6: bei gleichem Feldnamen gewinnt der erste Treffer samt seiner Herkunft', () => {
    const profile = [
      { name: 'Kind', fields: [{ name: 'status' }], parent: 'Eltern' },
      { name: 'Eltern', fields: [{ name: 'status' }, { name: 'budget' }] },
    ];
    const r = resolveProfileFields(profile, { assigned: ['Kind'] });
    expect(r.fields.map((f) => f.name)).toEqual(['status', 'budget']);
    expect(feld(r, 'status').profile).toBe('Kind');
    expect(feld(r, 'status').tiefe).toBe(0);
  });
});
