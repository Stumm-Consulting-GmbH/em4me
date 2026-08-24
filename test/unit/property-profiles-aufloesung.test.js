// 4T-0447 (Epic 3E-0083): Unit-Tests der Definitions-Auflösung — Auswertung
// des Zuordnungs-Felds und Vereinigung über mehrere Profile mit ihren
// Konflikt-Regeln. 4T-0448/4T-0491: gemeinsame Editor-Logik (weiche
// Hinweise, Vorschläge, Komplett-Übernahme) und die Registrierung als
// schaltbare Erweiterung.
// 4T-1142 (Epic 3E-0218): Vererbung zwischen Profilen — Profil-Ebene
// (extends/exclude), Ketten-Bildung in der Auflösungs-Folge und die
// Vererbungs-Hinweise der Profil-Liste.
//
// Gegenstück: `property-profiles.test.js` prüft das Datei-Format und das
// Definitions-Parsing (Schnitt in 4T-1145 entlang der Naht der beiden
// Module).
import { describe, it, expect } from 'vitest';
import {
  parseProfileHeritage,
  attachHeritageHints,
  assignedProfileNames,
  resolveProfileFields,
  fieldDefinitionHint,
  valueSourceHint,
  profileFieldSuggestions,
  emptyValueForType,
  emptyValueForDefinition,
  buildProfileFillMap,
  profileSuggestGroups,
} from '../../src/shared/property-profiles.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';

describe('assignedProfileNames', () => {
  it('liest String- und Listen-Werte des Zuordnungs-Felds', () => {
    expect(assignedProfileNames({ class: 'Projekt' }, 'class')).toEqual(['Projekt']);
    expect(assignedProfileNames({ class: ['Projekt', 'Person'] }, 'class')).toEqual([
      'Projekt',
      'Person',
    ]);
  });

  it('Feldname case-insensitiv, Default class, Werte getrimmt und dedupliziert', () => {
    expect(assignedProfileNames({ Class: ' Projekt ' }, undefined)).toEqual(['Projekt']);
    expect(assignedProfileNames({ TYP: ['A', 'A', '', null] }, 'typ')).toEqual(['A']);
  });

  it('fehlendes Feld, leere oder defekte Frontmatter-Daten ergeben leer', () => {
    expect(assignedProfileNames({}, 'class')).toEqual([]);
    expect(assignedProfileNames(null, 'class')).toEqual([]);
    expect(assignedProfileNames({ class: { verschachtelt: true } }, 'class')).toEqual([]);
    expect(assignedProfileNames({ class: [{ a: 1 }] }, 'class')).toEqual([]);
  });

  it('Reihenfolge der Zuordnung bleibt erhalten (Konflikt-Regel 4T-0447)', () => {
    expect(assignedProfileNames({ class: ['B', 'A', 'C'] }, 'class')).toEqual(['B', 'A', 'C']);
  });
});

// 4T-0447 (Epic 3E-0083): Definitions-Auflösung pro Datei.
describe('resolveProfileFields', () => {
  const field = (name, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });
  const CATALOG = [
    { name: 'All', fields: [field('status', { values: ['a', 'b'] }), field('thema')] },
    { name: 'Projekt', fields: [field('status', { type: 'date' }), field('budget')] },
    { name: 'Person', fields: [field('Status', { type: 'number' }), field('rolle')] },
  ];

  it('Vereinigung: Standard-Profil plus zugeordnete Profile', () => {
    const { fields, missing } = resolveProfileFields(CATALOG, {
      defaultProfile: 'All',
      assigned: ['Projekt'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => [f.name, f.profile, f.fromDefault])).toEqual([
      ['status', 'Projekt', false],
      ['budget', 'Projekt', false],
      ['thema', 'All', true],
    ]);
  });

  it('Konflikt: zugeordnetes Profil gewinnt vor dem Standard-Profil', () => {
    const { fields } = resolveProfileFields(CATALOG, {
      defaultProfile: 'All',
      assigned: ['Projekt'],
    });
    expect(fields.find((f) => f.name === 'status').type).toBe('date');
  });

  it('Konflikt unter Zugeordneten: das zuerst genannte Profil gewinnt (case-insensitiv)', () => {
    const { fields } = resolveProfileFields(CATALOG, {
      defaultProfile: null,
      assigned: ['Person', 'Projekt'],
    });
    const status = fields.find((f) => f.name.toLowerCase() === 'status');
    expect(status.type).toBe('number');
    expect(status.profile).toBe('Person');
    expect(fields.map((f) => f.name)).toEqual(['Status', 'rolle', 'budget']);
  });

  it('Profil-Namen matchen case-insensitiv (Windows-Dateisystem)', () => {
    const { fields, missing } = resolveProfileFields(CATALOG, {
      defaultProfile: null,
      assigned: ['projekt'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => f.name)).toEqual(['status', 'budget']);
  });

  it('nicht vorhandene Profile landen in missing, doppelte zählen einmal', () => {
    const { fields, missing } = resolveProfileFields(CATALOG, {
      defaultProfile: 'Fehlt',
      assigned: ['Projekt', 'projekt', 'Unbekannt'],
    });
    expect(missing).toEqual(['Unbekannt', 'Fehlt']);
    expect(fields.map((f) => f.name)).toEqual(['status', 'budget']);
  });

  it('Standard-Profil auch zugeordnet: Felder bleiben als zugeordnet gekennzeichnet', () => {
    const { fields } = resolveProfileFields(CATALOG, {
      defaultProfile: 'All',
      assigned: ['all'],
    });
    expect(fields.every((f) => f.fromDefault === false)).toBe(true);
  });

  it('leerer Katalog oder keine Zuordnung ergibt leer bzw. nur den Standard', () => {
    expect(resolveProfileFields([], { defaultProfile: null, assigned: [] })).toEqual({
      fields: [],
      missing: [],
      leading: null,
    });
    const { fields } = resolveProfileFields(CATALOG, { defaultProfile: 'All', assigned: [] });
    expect(fields.map((f) => [f.name, f.fromDefault])).toEqual([
      ['status', true],
      ['thema', true],
    ]);
  });
});

// 4T-1142 (Epic 3E-0218): Vererbung zwischen Profilen (E2) — Profil-Ebene
// (extends/exclude), Ketten-Bildung in der Auflösungs-Folge und die
// Vererbungs-Hinweise der Profil-Liste. Die drei Konstellationen aus
// Kapitel 6.2 des Konzepts sind die Vorlage der Prüffälle.
describe('parseProfileHeritage (4T-1142)', () => {
  it('liest extends als Skalar und exclude als Liste', () => {
    expect(parseProfileHeritage({ extends: ' Projekt ', exclude: ['status', 'ort'] })).toEqual({
      parent: 'Projekt',
      exclude: ['status', 'ort'],
      icon: null,
      errors: [],
    });
  });

  it('AK9: mehr als ein Eltern-Profil erzeugt einen Hinweis, das erste zählt', () => {
    const { parent, errors } = parseProfileHeritage({ extends: ['Projekt', 'Person'] });
    expect(parent).toBe('Projekt');
    expect(errors).toEqual([
      { code: 'extendsMultiple', index: -1, name: 'Projekt', key: 'extends', expected: 'single' },
    ]);
  });

  it('einelementige Liste, Skalar-exclude und leere Angaben sind tolerant', () => {
    expect(parseProfileHeritage({ extends: ['Projekt'] }).parent).toBe('Projekt');
    expect(parseProfileHeritage({ extends: ['Projekt'] }).errors).toEqual([]);
    expect(parseProfileHeritage({ exclude: 'status' }).exclude).toEqual(['status']);
    expect(parseProfileHeritage({})).toEqual({ parent: null, exclude: [], icon: null, errors: [] });
    expect(parseProfileHeritage(null)).toEqual({
      parent: null,
      exclude: [],
      icon: null,
      errors: [],
    });
    expect(parseProfileHeritage({ extends: '  ', exclude: [null, '', { a: 1 }] })).toEqual({
      parent: null,
      exclude: [],
      icon: null,
      errors: [],
    });
  });
});

describe('resolveProfileFields — Vererbung (4T-1142)', () => {
  const field = (name, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });
  // Das durchgespielte Beispiel aus Kapitel 6.2 des Konzepts.
  const KATALOG = [
    { name: 'Alle', fields: [field('tags')], parent: null, exclude: [] },
    { name: 'Projekt', fields: [field('phase'), field('status')], parent: 'Alle', exclude: [] },
    {
      name: 'Artikel',
      fields: [field('phase'), field('autor')],
      parent: 'Projekt',
      exclude: ['status'],
    },
    { name: 'Sitzung', fields: [field('status'), field('ort')], parent: null, exclude: [] },
  ];

  it('AK1: eine Kette über mehrere Ebenen wirkt (eigene Felder vor den geerbten)', () => {
    const { fields, missing } = resolveProfileFields(KATALOG, {
      defaultProfile: null,
      assigned: ['Artikel'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => [f.name, f.profile])).toEqual([
      ['phase', 'Artikel'],
      ['autor', 'Artikel'],
      ['tags', 'Alle'],
    ]);
  });

  it('AK2/AK3: exclude schließt ein geerbtes Feld aus, das eigene überschreibt das geerbte', () => {
    const { fields } = resolveProfileFields(KATALOG, {
      defaultProfile: null,
      assigned: ['Artikel'],
    });
    expect(fields.find((f) => f.name === 'status')).toBeUndefined();
    expect(fields.find((f) => f.name === 'phase').profile).toBe('Artikel');
  });

  it('AK4: die erste Konstellation löst genau zur Tabelle des Konzepts auf', () => {
    const { fields, missing } = resolveProfileFields(KATALOG, {
      defaultProfile: 'Alle',
      assigned: ['Artikel', 'Sitzung'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => [f.name, f.profile])).toEqual([
      ['phase', 'Artikel'],
      ['autor', 'Artikel'],
      ['tags', 'Alle'],
      ['status', 'Sitzung'],
      ['ort', 'Sitzung'],
    ]);
  });

  it('AK5: das Standard-Profil in einer Kette wird einmal verarbeitet und trägt die Ketten-Herkunft', () => {
    const { fields } = resolveProfileFields(KATALOG, {
      defaultProfile: 'Alle',
      assigned: ['Artikel', 'Sitzung'],
    });
    const tags = fields.find((f) => f.name === 'tags');
    expect(tags.profile).toBe('Alle');
    expect(tags.fromDefault).toBe(false);
  });

  it('AK6: ein Ausschluss wirkt nur in seiner Kette, über eine andere kommt das Feld an', () => {
    const { fields } = resolveProfileFields(KATALOG, {
      defaultProfile: 'Alle',
      assigned: ['Artikel', 'Sitzung'],
    });
    const status = fields.find((f) => f.name === 'status');
    expect(status.profile).toBe('Sitzung');
  });

  it('die Kette des Standard-Profils trägt fromDefault durchgehend', () => {
    const { fields } = resolveProfileFields(KATALOG, {
      defaultProfile: 'Projekt',
      assigned: [],
    });
    expect(fields.map((f) => [f.name, f.profile, f.fromDefault])).toEqual([
      ['phase', 'Projekt', true],
      ['status', 'Projekt', true],
      ['tags', 'Alle', true],
    ]);
  });

  it('Eltern-Namen matchen case-insensitiv, exclude ebenso', () => {
    const catalog = [
      { name: 'Basis', fields: [field('Tags'), field('ort')], parent: null, exclude: [] },
      { name: 'Kind', fields: [field('titel')], parent: 'basis', exclude: ['TAGS'] },
    ];
    const { fields } = resolveProfileFields(catalog, { defaultProfile: null, assigned: ['Kind'] });
    expect(fields.map((f) => f.name)).toEqual(['titel', 'ort']);
  });

  it('AK7: ein Zyklus bricht beim ersten Wiedersehen ab und verhindert die Auflösung nicht', () => {
    const catalog = [
      { name: 'A', fields: [field('a')], parent: 'B', exclude: [] },
      { name: 'B', fields: [field('b')], parent: 'A', exclude: [] },
    ];
    const { fields, missing } = resolveProfileFields(catalog, {
      defaultProfile: null,
      assigned: ['A'],
    });
    expect(missing).toEqual([]);
    expect(fields.map((f) => [f.name, f.profile])).toEqual([
      ['a', 'A'],
      ['b', 'B'],
    ]);
  });

  it('AK8: ein fehlendes Eltern-Profil beendet die Kette, gesammelte Felder bleiben, missing bleibt unberührt', () => {
    const catalog = [{ name: 'X', fields: [field('x')], parent: 'Fehlt', exclude: [] }];
    const { fields, missing } = resolveProfileFields(catalog, {
      defaultProfile: null,
      assigned: ['X'],
    });
    expect(fields.map((f) => f.name)).toEqual(['x']);
    expect(missing).toEqual([]);
  });

  it('AK10: Profile ohne Vererbungs-Angaben lösen exakt wie vor der Änderung auf', () => {
    const catalog = [
      { name: 'All', fields: [field('status'), field('thema')] },
      { name: 'Projekt', fields: [field('budget')] },
    ];
    const { fields, missing } = resolveProfileFields(catalog, {
      defaultProfile: 'All',
      assigned: ['Projekt', 'Unbekannt'],
    });
    expect(missing).toEqual(['Unbekannt']);
    expect(fields.map((f) => [f.name, f.profile, f.fromDefault])).toEqual([
      ['budget', 'Projekt', false],
      ['status', 'All', true],
      ['thema', 'All', true],
    ]);
  });
});

describe('attachHeritageHints (4T-1142)', () => {
  const profile = (name, extra = {}) => ({ name, fields: [], errors: [], ...extra });

  const cycleHint = (name) => ({
    code: 'extendsCycle',
    index: -1,
    name,
    key: 'extends',
    expected: null,
  });
  const missingHint = (name) => ({
    code: 'extendsMissing',
    index: -1,
    name,
    key: 'extends',
    expected: null,
  });

  it('AK7: beide Zyklus-Beteiligten erhalten einen Hinweis am Profil', () => {
    const out = attachHeritageHints([profile('A', { parent: 'B' }), profile('B', { parent: 'A' })]);
    expect(out[0].errors).toEqual([cycleHint('A')]);
    expect(out[1].errors).toEqual([cycleHint('B')]);
  });

  it('AK8: ein fehlendes Eltern-Profil wird am erbenden Profil benannt', () => {
    const out = attachHeritageHints([profile('X', { parent: 'Fehlt' })]);
    expect(out[0].errors).toEqual([missingHint('Fehlt')]);
  });

  it('der Fehlt-Hinweis einer tieferen Kette hängt an jedem betroffenen Profil', () => {
    const out = attachHeritageHints([
      profile('Kind', { parent: 'Mitte' }),
      profile('Mitte', { parent: 'Fehlt' }),
    ]);
    expect(out[0].errors).toEqual([missingHint('Fehlt')]);
    expect(out[1].errors).toEqual([missingHint('Fehlt')]);
  });

  it('Profile ohne Befund bleiben dasselbe Objekt, bestehende Hinweise bleiben vorn', () => {
    const sauber = profile('Basis');
    const defekt = profile('Kind', {
      parent: 'Fehlt',
      errors: [{ code: 'name', index: 0, name: null }],
    });
    const out = attachHeritageHints([sauber, defekt]);
    expect(out[0]).toBe(sauber);
    expect(out[1].errors.map((e) => e.code)).toEqual(['name', 'extendsMissing']);
  });
});

// 4T-0448 (Epic 3E-0083): gemeinsame Editor-Logik (Hinweise, Vorschläge)
// und Registrierung als schaltbare Erweiterung.
describe('fieldDefinitionHint', () => {
  const def = (extra) => ({
    name: 'f',
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });

  it('leere Werte erzeugen keinen Hinweis (weiche Haltung)', () => {
    expect(fieldDefinitionHint(def(), '')).toBeNull();
    expect(fieldDefinitionHint(def(), null)).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'multistring' }), [])).toBeNull();
    expect(fieldDefinitionHint(null, 'x')).toBeNull();
  });

  it('typ-konforme Werte sind hinweisfrei', () => {
    expect(fieldDefinitionHint(def(), 'Text')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'number' }), 5)).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'boolean' }), true)).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'date' }), '2026-07-09')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'multistring' }), ['a'])).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'multiline' }), 'a\nb')).toBeNull();
  });

  it('Typ-Abweichungen melden typeMismatch', () => {
    expect(fieldDefinitionHint(def({ type: 'number' }), 'fünf')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'date' }), 'morgen')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'boolean' }), 'ja')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def(), 42)).toBe('typeMismatch');
    expect(fieldDefinitionHint(def(), 'mehr\nzeilig')).toBe('typeMismatch');
  });

  it('Werte außerhalb des Wertebereichs melden outsideValues', () => {
    const single = def({ values: ['offen', 'erledigt'] });
    expect(fieldDefinitionHint(single, 'offen')).toBeNull();
    expect(fieldDefinitionHint(single, 'unklar')).toBe('outsideValues');
    const multi = def({ type: 'multistring', values: ['a', 'b'], multiple: true });
    expect(fieldDefinitionHint(multi, ['a', 'b'])).toBeNull();
    expect(fieldDefinitionHint(multi, ['a', 'c'])).toBe('outsideValues');
    // number-Wertebereich: Zahl und String-Repräsentation zählen als Treffer.
    const num = def({ type: 'number', values: [1, 2] });
    expect(fieldDefinitionHint(num, 2)).toBeNull();
    expect(fieldDefinitionHint(num, 3)).toBe('outsideValues');
  });

  // 4T-1155 (Epic 3E-0219): der Typ-Ausbau in der weichen Validierung.
  it('AK1: link und time werden als Typen erkannt', () => {
    expect(fieldDefinitionHint(def({ type: 'link' }), '[[Meier 2024]]')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'link' }), 'mehr\nzeilig')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'time' }), '09:30')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'time' }), '23:59:59')).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'time' }), '24:00')).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'time' }), 'morgens')).toBe('typeMismatch');
  });

  it('AK2: ein Mehrfach-Feld erwartet eine Liste, auch wenn sein Typ es nicht verrät', () => {
    const mehrfach = def({ type: 'link', multiple: true });
    expect(fieldDefinitionHint(mehrfach, ['[[A]]', '[[B]]'])).toBeNull();
    expect(fieldDefinitionHint(mehrfach, '[[A]]')).toBe('typeMismatch');
    expect(fieldDefinitionHint(mehrfach, ['[[A]]', 42])).toBe('typeMismatch');
    // Dasselbe für die übrigen mehrfach-fähigen Typen.
    expect(fieldDefinitionHint(def({ type: 'number', multiple: true }), [1, 2])).toBeNull();
    expect(fieldDefinitionHint(def({ type: 'number', multiple: true }), 1)).toBe('typeMismatch');
    expect(fieldDefinitionHint(def({ type: 'time', multiple: true }), ['09:30'])).toBeNull();
  });

  it('AK2: multistring prüft seine Liste weiterhin selbst — kein doppelter Durchlauf', () => {
    const alt = def({ type: 'multistring', multiple: true });
    expect(fieldDefinitionHint(alt, ['a', 'b'])).toBeNull();
    expect(fieldDefinitionHint(alt, 'a')).toBe('typeMismatch');
  });

  it('AK2: der Wertebereich eines Mehrfach-Feldes gilt je Eintrag', () => {
    const d = def({ type: 'link', multiple: true, values: ['[[A]]', '[[B]]'] });
    expect(fieldDefinitionHint(d, ['[[A]]'])).toBeNull();
    expect(fieldDefinitionHint(d, ['[[A]]', '[[C]]'])).toBe('outsideValues');
  });

  it('Typ-Abweichung hat Vorrang vor dem Wertebereichs-Hinweis', () => {
    const d = def({ type: 'number', values: [1, 2] });
    expect(fieldDefinitionHint(d, 'eins')).toBe('typeMismatch');
  });
});

describe('profileFieldSuggestions', () => {
  const FIELDS = [
    {
      name: 'status',
      type: 'string',
      values: ['a'],
      multiple: false,
      default: null,
      profile: 'All',
      fromDefault: true,
    },
    {
      name: 'budget',
      type: 'number',
      values: null,
      multiple: false,
      default: null,
      profile: 'Projekt',
      fromDefault: false,
    },
  ];
  const HEURISTICS = [
    { name: 'tags', type: 'multistring' },
    { name: 'status', type: 'string' },
  ];

  it('Definitions-Felder zuerst, danach Heuristik; gesetzte Namen entfallen', () => {
    const out = profileFieldSuggestions(FIELDS, ['Budget'], HEURISTICS);
    expect(out.map((s) => [s.source, s.name])).toEqual([
      ['profile', 'status'],
      ['heuristic', 'tags'],
    ]);
    // Definitions-Vorschläge tragen die volle Definition (Typ, Default, Profil).
    expect(out[0].def.profile).toBe('All');
    expect(out[1].def).toBeNull();
    expect(out[1].type).toBe('multistring');
  });

  it('Heuristik-Namen, die bereits definiert sind, erscheinen nicht doppelt', () => {
    const out = profileFieldSuggestions(FIELDS, [], HEURISTICS);
    expect(out.filter((s) => s.name === 'status')).toHaveLength(1);
    expect(out.find((s) => s.name === 'status').source).toBe('profile');
  });

  it('ohne Auflösung bleiben nur die Heuristik-Vorschläge', () => {
    const out = profileFieldSuggestions([], [], HEURISTICS);
    expect(out.map((s) => s.name)).toEqual(['tags', 'status']);
  });
});

describe('Erweiterungs-Registrierung property-profiles (4T-0448)', () => {
  it('ist als Werkzeug-Erweiterung mit Einstellungs-Bereich registriert', () => {
    const manifest = extensionById('property-profiles');
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.nameKey).toBe('help.featureName.propertyProfiles');
    expect(manifest.descKey).toBe('help.feature.propertyProfiles');
    expect(manifest.settingsSections).toEqual(['propertyProfiles']);
    expect(manifest.commands).toBeUndefined();
  });
});

// 4T-0491 (Epic 3E-0093): Komplett-Übernahme — Leer-Werte, Feld-Map, Ziele.
describe('emptyValueForType (4T-0491)', () => {
  it('liefert typgerechte Leer-Werte je Typ', () => {
    expect(emptyValueForType('multistring')).toEqual([]);
    expect(emptyValueForType('number')).toBe(0);
    expect(emptyValueForType('boolean')).toBe(false);
    expect(emptyValueForType('string')).toBe('');
    expect(emptyValueForType('multiline')).toBe('');
    expect(emptyValueForType('date')).toBe('');
    expect(emptyValueForType('unbekannt')).toBe('');
  });
});

describe('buildProfileFillMap (4T-0491)', () => {
  const field = (name, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    ...extra,
  });

  it('nur fehlende Felder, mit Default bzw. typgerechtem Leer-Wert', () => {
    const fields = [
      field('titel'),
      field('prio', { type: 'number', default: 3 }),
      field('anzahl', { type: 'number' }),
      field('aktiv', { type: 'boolean' }),
      field('themen', { type: 'multistring' }),
    ];
    // titel ist bereits vorhanden und entfällt.
    expect(buildProfileFillMap(fields, ['titel'])).toEqual({
      prio: 3,
      anzahl: 0,
      aktiv: false,
      themen: [],
    });
  });

  it('existingKeys case-insensitiv; Duplikat-Definitionen zählen einmal', () => {
    const fields = [field('Status'), field('status'), field('rolle')];
    expect(Object.keys(buildProfileFillMap(fields, ['STATUS']))).toEqual(['rolle']);
  });

  it('Einfüge-Reihenfolge = Definitions-Reihenfolge', () => {
    expect(Object.keys(buildProfileFillMap([field('a'), field('b'), field('c')], []))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('leere oder ungültige Eingaben ergeben eine leere Map', () => {
    expect(buildProfileFillMap([], [])).toEqual({});
    expect(buildProfileFillMap(null, [])).toEqual({});
    expect(buildProfileFillMap([field('')], [])).toEqual({});
  });
});

describe('profileSuggestGroups (4T-0491)', () => {
  const rf = (name, profile, extra = {}) => ({
    name,
    type: 'string',
    values: null,
    multiple: false,
    default: null,
    profile,
    fromDefault: false,
    ...extra,
  });
  const HEUR = [
    { name: 'tags', type: 'multistring' },
    { name: 'title', type: 'string' },
  ];

  it('gruppiert Definitions-Felder pro Profil (Reihenfolge = Auflösung), Heuristik als otherFields', () => {
    const fields = [
      rf('a', 'Projekt'),
      rf('b', 'Projekt', { type: 'number', default: 5 }),
      rf('c', 'All'),
    ];
    const { profileGroups, otherFields } = profileSuggestGroups(fields, [], HEUR);
    expect(profileGroups.map((g) => g.profile)).toEqual(['Projekt', 'All']);
    expect(profileGroups[0].fields.map((s) => s.name)).toEqual(['a', 'b']);
    expect(profileGroups[0].map).toEqual({ a: '', b: 5 });
    expect(profileGroups[1].fields.map((s) => s.name)).toEqual(['c']);
    expect(profileGroups[1].map).toEqual({ c: '' });
    expect(otherFields.map((s) => s.name)).toEqual(['tags', 'title']);
  });

  it('bereits gesetzte Felder entfallen; ein vollständiges Profil erhält keine Gruppe', () => {
    const { profileGroups } = profileSuggestGroups([rf('a', 'Projekt'), rf('b', 'All')], ['b'], []);
    expect(profileGroups.map((g) => g.profile)).toEqual(['Projekt']);
    expect(profileGroups[0].map).toEqual({ a: '' });
  });

  it('Heuristik, die schon als Profil-Feld existiert, erscheint nicht doppelt', () => {
    const { profileGroups, otherFields } = profileSuggestGroups(
      [rf('tags', 'Projekt', { type: 'multistring' })],
      [],
      HEUR,
    );
    expect(profileGroups[0].fields.map((s) => s.name)).toEqual(['tags']);
    expect(otherFields.map((s) => s.name)).toEqual(['title']);
  });

  it('ohne Auflösung nur otherFields (Heuristik), keine Profil-Gruppen', () => {
    const { profileGroups, otherFields } = profileSuggestGroups([], [], HEUR);
    expect(profileGroups).toEqual([]);
    expect(otherFields.map((s) => s.name)).toEqual(['tags', 'title']);
  });
});

// 4T-1156 (Epic 3E-0219): Leer-Wert einer ganzen Definition. Seit der
// Entkopplung des Mehrfach-Modus genügt der Typ nicht mehr.
describe('emptyValueForDefinition (4T-1156)', () => {
  const def = (extra) => ({ name: 'f', type: 'string', values: null, multiple: false, ...extra });

  it('folgt für Einzel-Felder dem Typ', () => {
    expect(emptyValueForDefinition(def())).toBe('');
    expect(emptyValueForDefinition(def({ type: 'number' }))).toBe(0);
    expect(emptyValueForDefinition(def({ type: 'boolean' }))).toBe(false);
    expect(emptyValueForDefinition(def({ type: 'link' }))).toBe('');
    expect(emptyValueForDefinition(def({ type: 'time' }))).toBe('');
  });

  it('AK7: ein Mehrfach-Feld bekommt die leere Liste, gleich welchen Typ es trägt', () => {
    expect(emptyValueForDefinition(def({ type: 'link', multiple: true }))).toEqual([]);
    expect(emptyValueForDefinition(def({ type: 'number', multiple: true }))).toEqual([]);
    expect(emptyValueForDefinition(def({ type: 'multistring', multiple: true }))).toEqual([]);
  });

  it('bleibt ohne Definition beim Leer-Text', () => {
    expect(emptyValueForDefinition(null)).toBe('');
  });
});

// 4T-1156: die Komplett-Übernahme nutzt denselben Leer-Wert.
describe('buildProfileFillMap mit Mehrfach-Feldern (4T-1156)', () => {
  it('legt für ein Verweis-Feld mit multiple die leere Liste an', () => {
    const map = buildProfileFillMap(
      [
        { name: 'quelle', type: 'link', values: null, multiple: false, default: null },
        { name: 'beteiligte', type: 'link', values: null, multiple: true, default: null },
        { name: 'beginn', type: 'time', values: null, multiple: false, default: null },
      ],
      [],
    );
    expect(map).toEqual({ quelle: '', beteiligte: [], beginn: '' });
  });

  it('ein Default gewinnt weiterhin über den Leer-Wert', () => {
    const map = buildProfileFillMap(
      [{ name: 'beginn', type: 'time', values: null, multiple: false, default: '09:30' }],
      [],
    );
    expect(map).toEqual({ beginn: '09:30' });
  });
});

// 4T-1157 (Epic 3E-0219, E12): Hinweis zur QUELLE eines Wertevorrats — im
// Unterschied zu fieldDefinitionHint, der den Wert betrifft.
describe('valueSourceHint (4T-1157)', () => {
  it('AK4: meldet emptySource, wenn eine Quelle gesetzt ist und der Vorrat leer bleibt', () => {
    expect(valueSourceHint({ name: 'ort', values: null, valuesFrom: { note: 'W.md' } })).toBe(
      'emptySource',
    );
    expect(valueSourceHint({ name: 'ort', values: [], valuesFrom: { query: 'FROM X' } })).toBe(
      'emptySource',
    );
  });

  it('schweigt, sobald die Quelle Werte geliefert hat', () => {
    expect(
      valueSourceHint({ name: 'ort', values: ['Berlin'], valuesFrom: { note: 'W.md' } }),
    ).toBeNull();
  });

  it('schweigt bei einem Feld ohne Quelle — auch bei leerem Wertebereich', () => {
    expect(valueSourceHint({ name: 'a', values: null })).toBeNull();
    expect(valueSourceHint({ name: 'a', values: ['x'] })).toBeNull();
    expect(valueSourceHint(null)).toBeNull();
  });
});
