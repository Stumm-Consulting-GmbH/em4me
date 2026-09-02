// 4T-001159 (Epic 3E-000219, E13): Unit-Tests der Zuordnung über Schlagwort und
// Ordner — die Bindungen der Bereichs-Sektion, der Ordner-Vergleich und die
// vierstufige Auflösungs-Folge.
//
// Eigene Datei seit dem Erreichen des Test-Budgets: Die Zuordnungs-WEGE sind
// ein eigener Gegenstand; Vererbung und Editor-Logik bleiben in
// `property-profiles-aufloesung.test.js`. Die drei Konstellationen aus
// Kapitel 6.13 des Konzepts haben je einen eigenen Prüffall, weil sie die
// Zusage tragen.
import { describe, it, expect } from 'vitest';
import {
  normalizeBindings,
  normalizeProfilesConfig,
  ordnerTrifft,
  parseProfileHeritage,
  resolveProfileFields,
} from '../../src/shared/property-profiles.js';

// --- 4T-001159 (Epic 3E-000219, E13): die vierstufige Auflösungs-Folge ---------
// Zuordnung über Schlagwort und Ordner. Die drei Konstellationen aus Kapitel
// 6.13 des Konzepts haben je einen eigenen Prüffall, weil sie die Zusage
// tragen: Die Folge bleibt EINE geordnete Folge, die Wege kumulieren, und
// ein Weg auf ein bereits erreichtes Profil fügt nichts hinzu.
describe('normalizeBindings (4T-001159)', () => {
  it('normalisiert Profil, Schlagworte und Ordner', () => {
    expect(
      normalizeBindings([
        { profile: ' Sitzung ', tags: ['sitzung', '#meeting'], folders: ['10 Projekte/'] },
      ]),
    ).toEqual([{ profile: 'Sitzung', tags: ['sitzung', 'meeting'], folders: ['10 Projekte'] }]);
  });

  it('nimmt Skalare wie Listen und wirft Doppelte weg', () => {
    expect(normalizeBindings([{ profile: 'P', tags: 'eins' }])).toEqual([
      { profile: 'P', tags: ['eins'], folders: [] },
    ]);
    expect(normalizeBindings([{ profile: 'P', tags: ['a', 'a', ' a '] }])[0].tags).toEqual(['a']);
  });

  it('normalisiert Ordner-Trenner und Randlagen', () => {
    const b = normalizeBindings([{ profile: 'P', folders: ['\\10 Projekte\\Alt\\', '/x/'] }]);
    expect(b[0].folders).toEqual(['10 Projekte/Alt', 'x']);
  });

  it('lässt unbrauchbare Einträge still entfallen, die übrigen bleiben', () => {
    const b = normalizeBindings([
      null,
      'kein-objekt',
      { tags: ['ohne-profil'] },
      { profile: 'Leer' }, // weder tags noch folders
      { profile: 'Gut', tags: ['x'] },
    ]);
    expect(b).toEqual([{ profile: 'Gut', tags: ['x'], folders: [] }]);
  });

  it('eine defekte Liste ergibt eine leere', () => {
    expect(normalizeBindings(null)).toEqual([]);
    expect(normalizeBindings('nope')).toEqual([]);
    expect(normalizeBindings({})).toEqual([]);
  });
});

describe('normalizeProfilesConfig mit Bindungen (4T-001159)', () => {
  it('führt bindings nur, wenn die Sektion sie trägt', () => {
    const ohne = normalizeProfilesConfig({ folder: 'P' });
    expect('bindings' in ohne).toBe(false);
    const mit = normalizeProfilesConfig({
      folder: 'P',
      bindings: [{ profile: 'S', tags: ['t'] }],
    });
    expect(mit.bindings).toEqual([{ profile: 'S', tags: ['t'], folders: [] }]);
  });

  it('eine Sektion mit nur einer Bindung ist eine Konfiguration', () => {
    const c = normalizeProfilesConfig({ bindings: [{ profile: 'S', folders: ['x'] }] });
    expect(c).not.toBeNull();
    expect(c.assignField).toBe('class');
  });

  it('bleibt idempotent (Roundtrip)', () => {
    const c = normalizeProfilesConfig({
      folder: 'P',
      bindings: [{ profile: 'S', tags: ['t'], folders: ['x'] }],
    });
    expect(normalizeProfilesConfig(c)).toEqual(c);
  });
});

describe('ordnerTrifft (4T-001159)', () => {
  it('trifft den Ordner und seine Unterordner', () => {
    expect(ordnerTrifft('10 Projekte', '10 Projekte')).toBe(true);
    expect(ordnerTrifft('10 Projekte', '10 Projekte/Alt')).toBe(true);
    expect(ordnerTrifft('10 Projekte', '10 Projekte/Alt/Tief')).toBe(true);
  });

  it('AK12: trifft nur ganze Ordner-Namen, keine Zeichenketten-Präfixe', () => {
    // Der Fall, an dem ein naives startsWith falsch läge.
    expect(ordnerTrifft('10 Projekte', '10 Projekte Archiv')).toBe(false);
    expect(ordnerTrifft('10 Pro', '10 Projekte')).toBe(false);
  });

  it('vergleicht ohne Rücksicht auf Groß-Kleinschreibung und Trenner', () => {
    expect(ordnerTrifft('10 PROJEKTE', '10 projekte/alt')).toBe(true);
    expect(ordnerTrifft('10 Projekte\\Alt', '10 Projekte/Alt')).toBe(true);
  });

  it('trifft nicht bei leerer Bindung oder fehlendem Ordner', () => {
    expect(ordnerTrifft('', 'x')).toBe(false);
    expect(ordnerTrifft('x', null)).toBe(false);
    expect(ordnerTrifft('x', undefined)).toBe(false);
  });

  it('die Wurzel selbst ist der leere Ordner und trifft keine Bindung', () => {
    expect(ordnerTrifft('10 Projekte', '')).toBe(false);
  });
});

describe('resolveProfileFields — vierstufige Folge (4T-001159)', () => {
  // Ein Bestand, an dem sich alle drei Konstellationen zeigen lassen.
  const profile = [
    { name: 'Artikel', fields: [{ name: 'autor' }], parent: 'Projekt' },
    { name: 'Projekt', fields: [{ name: 'budget' }, { name: 'status' }] },
    { name: 'Sitzung', fields: [{ name: 'status' }, { name: 'ort' }] },
    { name: 'Alle', fields: [{ name: 'titel' }] },
  ];
  const bindings = [
    { profile: 'Sitzung', tags: ['sitzung'], folders: [] },
    { profile: 'Projekt', tags: [], folders: ['10 Projekte'] },
  ];
  const namen = (r) => r.fields.map((f) => f.name);
  const quelle = (r, feld) => r.fields.find((f) => f.name === feld).profile;

  it('AK1: ein Schlagwort bindet ein Profil', () => {
    const r = resolveProfileFields(profile, { bindings, tags: ['sitzung'] });
    expect(namen(r)).toEqual(['status', 'ort']);
  });

  it('AK2: ein Ordner bindet ein Profil, Unterordner eingeschlossen', () => {
    expect(namen(resolveProfileFields(profile, { bindings, folder: '10 Projekte' }))).toEqual([
      'budget',
      'status',
    ]);
    expect(namen(resolveProfileFields(profile, { bindings, folder: '10 Projekte/Alt' }))).toEqual([
      'budget',
      'status',
    ]);
  });

  it('AK3: die Folge ist vierstufig — Feld vor Schlagwort vor Ordner vor Standard', () => {
    const r = resolveProfileFields(profile, {
      assigned: ['Artikel'],
      bindings,
      tags: ['sitzung'],
      folder: '10 Projekte',
      defaultProfile: 'Alle',
    });
    // Artikel (mit Kette Projekt), dann Sitzung, dann Alle. `status` kommt
    // aus Projekt, weil dessen Kette vor der Schlagwort-Stufe läuft.
    expect(namen(r)).toEqual(['autor', 'budget', 'status', 'ort', 'titel']);
    expect(quelle(r, 'status')).toBe('Projekt');
  });

  it('AK4: die Wege kumulieren — Feld UND Ordner tragen beide bei', () => {
    const r = resolveProfileFields(profile, {
      assigned: ['Sitzung'],
      bindings,
      folder: '10 Projekte',
    });
    expect(namen(r)).toEqual(['status', 'ort', 'budget']);
    // `status` gewinnt aus Sitzung: das Zuordnungs-Feld steht vor dem Ordner.
    expect(quelle(r, 'status')).toBe('Sitzung');
  });

  it('AK5: innerhalb einer Stufe gilt die Vererbung unverändert', () => {
    const geerbt = [
      { name: 'Kind', fields: [{ name: 'eigen' }], parent: 'Eltern' },
      { name: 'Eltern', fields: [{ name: 'geerbt' }] },
    ];
    const r = resolveProfileFields(geerbt, {
      bindings: [{ profile: 'Kind', tags: ['k'], folders: [] }],
      tags: ['k'],
    });
    expect(namen(r)).toEqual(['eigen', 'geerbt']);
  });

  it('AK6: erste Konstellation — ein Weg auf ein bereits erreichtes Profil fügt nichts hinzu', () => {
    // `Artikel` erbt von `Projekt`; der Ordner zeigt ebenfalls auf `Projekt`.
    const mitOrdner = resolveProfileFields(profile, {
      assigned: ['Artikel'],
      bindings,
      folder: '10 Projekte',
    });
    const ohneOrdner = resolveProfileFields(profile, { assigned: ['Artikel'] });
    expect(namen(mitOrdner)).toEqual(namen(ohneOrdner));
    expect(namen(mitOrdner)).toEqual(['autor', 'budget', 'status']);
  });

  it('AK7: zweite Konstellation — Schlagwort schlägt Ordner, die übrigen Felder kommen hinzu', () => {
    const r = resolveProfileFields(profile, {
      bindings,
      tags: ['sitzung'],
      folder: '10 Projekte',
    });
    expect(quelle(r, 'status')).toBe('Sitzung');
    expect(namen(r)).toEqual(['status', 'ort', 'budget']);
    // Kein Konflikt-Vermerk: der Widerspruch ist keiner, sobald die Ordnung
    // feststeht (Konzept 6.13).
    expect(r.missing).toEqual([]);
  });

  it('AK8: dritte Konstellation — ohne eigene Aussage tragen Ordner und Standard', () => {
    const r = resolveProfileFields(profile, {
      bindings,
      folder: '10 Projekte',
      defaultProfile: 'Alle',
    });
    expect(namen(r)).toEqual(['budget', 'status', 'titel']);
    expect(quelle(r, 'titel')).toBe('Alle');
    expect(r.fields.find((f) => f.name === 'titel').fromDefault).toBe(true);
    expect(r.fields.find((f) => f.name === 'budget').fromDefault).toBe(false);
  });

  it('AK9: ohne Bindungen ändert sich für kein Dokument etwas', () => {
    const mit = resolveProfileFields(profile, {
      assigned: ['Sitzung'],
      defaultProfile: 'Alle',
      bindings: [],
      tags: ['sitzung'],
      folder: '10 Projekte',
    });
    const ohne = resolveProfileFields(profile, {
      assigned: ['Sitzung'],
      defaultProfile: 'Alle',
    });
    expect(mit).toEqual(ohne);
  });

  it('AK10: eine Bindung auf ein nicht vorhandenes Profil meldet es als fehlend', () => {
    const r = resolveProfileFields(profile, {
      bindings: [{ profile: 'GibtsNicht', tags: ['x'], folders: [] }],
      tags: ['x'],
    });
    expect(r.fields).toEqual([]);
    expect(r.missing).toEqual(['GibtsNicht']);
  });

  it('AK11: Schlagworte vergleichen ohne Rücksicht auf Groß-Kleinschreibung', () => {
    const r = resolveProfileFields(profile, { bindings, tags: ['SITZUNG'] });
    expect(namen(r)).toEqual(['status', 'ort']);
  });

  it('mehrere Treffer derselben Stufe folgen der Bindungs-Reihenfolge', () => {
    const zwei = [
      { profile: 'Sitzung', tags: ['beides'], folders: [] },
      { profile: 'Projekt', tags: ['beides'], folders: [] },
    ];
    const r = resolveProfileFields(profile, { bindings: zwei, tags: ['beides'] });
    // Sitzung steht zuerst in der Liste, also gewinnt sein `status`.
    expect(quelle(r, 'status')).toBe('Sitzung');
    expect(namen(r)).toEqual(['status', 'ort', 'budget']);
  });
});

describe('AK7: Rückwärts-Verträglichkeit des Schreibwegs (4T-001160)', () => {
  it('eine Konfiguration ohne Bindungen bleibt ohne bindings-Angabe', () => {
    const ohne = normalizeProfilesConfig({
      folder: 'Profile',
      assignField: 'class',
      defaultProfile: 'Alle',
      bindings: [],
    });
    expect(ohne).toEqual({ folder: 'Profile', assignField: 'class', defaultProfile: 'Alle' });
    expect('bindings' in ohne).toBe(false);
  });

  it('eine Zeile ohne Profil oder ohne Bindung schreibt nichts', () => {
    // Genau der Zustand direkt nach «+ Zuordnung hinzufügen»: Die leere Zeile
    // steht im Entwurf, darf aber nicht in die Bereichsdatei wandern.
    const frisch = normalizeProfilesConfig({
      folder: 'Profile',
      bindings: [{ profile: '', tags: [], folders: [] }],
    });
    expect('bindings' in frisch).toBe(false);
  });

  it('der Dirty-Vergleich sieht eine geänderte Bindung', () => {
    const vorher = normalizeProfilesConfig({
      folder: 'P',
      bindings: [{ profile: 'S', tags: ['a'], folders: [] }],
    });
    const nachher = normalizeProfilesConfig({
      folder: 'P',
      bindings: [{ profile: 'S', tags: ['a', 'b'], folders: [] }],
    });
    expect(JSON.stringify(vorher)).not.toBe(JSON.stringify(nachher));
  });
});

// --- 4T-001161 (Epic 3E-000219, E5): Profil-Symbol am Dokument -----------------
// Das Symbol ist die Bedingung der neuen Zuordnungs-Wege und keine Zugabe:
// Ohne es hätte ein Dokument, das seine Felder aus Ordner-Regel und
// Standard-Profil bezieht, Felder ohne ablesbare Herkunft (Konzept 6.13,
// dritte Konstellation).
describe('Symbol-Angabe eines Profils (4T-001161)', () => {
  it('AK1: ein Profil kann ein Symbol führen', () => {
    expect(parseProfileHeritage({ icon: '📅' }).icon).toBe('📅');
    expect(parseProfileHeritage({ icon: ' 📅 ' }).icon).toBe('📅');
  });

  it('AK1: ein zusammengesetztes Emoji zählt als EIN Zeichen', () => {
    // Hautton- und Varianten-Selektoren machen aus einem Emoji mehrere
    // Code-Punkte; eine Längen-Prüfung über `length` läge hier falsch.
    expect(parseProfileHeritage({ icon: '👍🏽' }).icon).toBe('👍🏽');
    expect(parseProfileHeritage({ icon: '👩‍💻' }).icon).toBe('👩‍💻');
  });

  it('AK6: mehr als ein Zeichen entfällt mit Hinweis, das Profil bleibt', () => {
    const r = parseProfileHeritage({ icon: 'ab', extends: 'Eltern' });
    expect(r.icon).toBeNull();
    expect(r.parent).toBe('Eltern'); // das Profil bleibt wirksam
    expect(r.errors).toEqual([
      { code: 'icon', index: -1, name: null, key: 'icon', expected: 'single-grapheme' },
    ]);
  });

  it('AK6: eine leere oder fehlende Angabe ist kein Fehler', () => {
    expect(parseProfileHeritage({ icon: '   ' }).icon).toBeNull();
    expect(parseProfileHeritage({ icon: '   ' }).errors).toEqual([]);
    expect(parseProfileHeritage({}).icon).toBeNull();
    expect(parseProfileHeritage({}).errors).toEqual([]);
  });

  it('ein Nicht-Text entfällt wie ein zu langer Wert', () => {
    expect(parseProfileHeritage({ icon: 42 }).icon).toBeNull();
    expect(parseProfileHeritage({ icon: ['a'] }).icon).toBeNull();
  });
});

describe('resolveProfileFields — führendes Profil für das Symbol (4T-001161)', () => {
  const profile = [
    { name: 'Artikel', fields: [{ name: 'autor' }], parent: 'Projekt', icon: '📄' },
    { name: 'Projekt', fields: [{ name: 'budget' }], icon: '🏗' },
    { name: 'Sitzung', fields: [{ name: 'ort' }], icon: '📅' },
    { name: 'Alle', fields: [{ name: 'titel' }], icon: '🗂' },
  ];
  const bindings = [
    { profile: 'Sitzung', tags: ['sitzung'], folders: [] },
    { profile: 'Projekt', tags: [], folders: ['10 Projekte'] },
  ];

  it('AK2/AK3: das zuerst aufgelöste Profil trägt das Symbol', () => {
    const r = resolveProfileFields(profile, { assigned: ['Artikel'], defaultProfile: 'Alle' });
    expect(r.leading).toEqual({ profile: 'Artikel', icon: '📄', stufe: 'assigned' });
  });

  it('AK3: bei mehreren Wegen gewinnt der erste der Folge', () => {
    const r = resolveProfileFields(profile, {
      assigned: ['Artikel'],
      bindings,
      tags: ['sitzung'],
      folder: '10 Projekte',
      defaultProfile: 'Alle',
    });
    expect(r.leading.profile).toBe('Artikel');
  });

  it('die Stufe sagt, über welchen Weg das Profil gefunden wurde', () => {
    expect(resolveProfileFields(profile, { bindings, tags: ['sitzung'] }).leading).toEqual({
      profile: 'Sitzung',
      icon: '📅',
      stufe: 'tag',
    });
    expect(resolveProfileFields(profile, { bindings, folder: '10 Projekte' }).leading).toEqual({
      profile: 'Projekt',
      icon: '🏗',
      stufe: 'folder',
    });
    expect(resolveProfileFields(profile, { defaultProfile: 'Alle' }).leading).toEqual({
      profile: 'Alle',
      icon: '🗂',
      stufe: 'default',
    });
  });

  it('AK4: ohne Profil gibt es kein führendes und damit kein Symbol', () => {
    expect(resolveProfileFields(profile, {}).leading).toBeNull();
    expect(resolveProfileFields([], { assigned: ['X'] }).leading).toBeNull();
  });

  it('AK4: ein Profil ohne Symbol führt, trägt aber keins', () => {
    const ohne = [{ name: 'Schlicht', fields: [{ name: 'a' }] }];
    expect(resolveProfileFields(ohne, { assigned: ['Schlicht'] }).leading).toEqual({
      profile: 'Schlicht',
      icon: null,
      stufe: 'assigned',
    });
  });

  it('das führende Profil ist das erste der Folge, nicht das erste des Katalogs', () => {
    // Die dritte Konstellation aus Kapitel 6.13: keine eigene Aussage im
    // Dokument, die Felder kommen aus Ordner und Standard — und genau dann
    // muss das Symbol sagen, welches Profil gilt.
    const r = resolveProfileFields(profile, {
      bindings,
      folder: '10 Projekte',
      defaultProfile: 'Alle',
    });
    expect(r.leading.profile).toBe('Projekt');
    expect(r.leading.stufe).toBe('folder');
  });
});
