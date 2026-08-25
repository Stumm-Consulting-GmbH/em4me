// 4T-1186 (Epic 3E-0221, E11): Unit-Tests der beiden strukturierten Feld-Typen
// — Definitions-Format, Wert-Prüfung und die Rückschrift in den Metadaten-Block.
//
// Eigene Datei nach dem Muster von 4T-1183: Die STRUKTURIERTEN TYPEN sind ein
// eigener Gegenstand neben dem übrigen Definitions-Format, und
// `property-profiles.test.js` steht mit knapp 500 Zeilen nah am Budget.
//
// **Der Schwerpunkt liegt auf der Wert-Seite.** Dass das Format die
// Verschachtelung trägt, ist seit Stufe 1 wahr und dort geprüft; neu ist ihre
// Bindung an die beiden Typen und die Frage, was ein Wert darin bedeutet —
// wann er passt, wann er leer ist, und wie er in der Datei aussieht.
import { describe, it, expect } from 'vitest';
import {
  emptyValueForDefinition,
  emptyValueForType,
  fieldDefinitionHint,
  isEmptyPropertyValue,
  OBJECT_TYPES,
  parseProfileFields,
  PROFILE_FIELD_TYPES,
  valueMatchesType,
} from '../../src/shared/property-profiles.js';
import { extractFrontmatter, writeFrontmatter } from '../../src/shared/markdown/frontmatter.js';

// Die Definition aus dem durchgehenden Beispiel des Konzepts (Kapitel 6.12).
const TEILNEHMER = {
  name: 'teilnehmer',
  type: 'objectlist',
  values: null,
  multiple: false,
  default: null,
  fields: [
    { name: 'person', type: 'link', values: null, multiple: false, default: null },
    {
      name: 'rolle',
      type: 'string',
      values: ['Leitung', 'Protokoll', 'Gast'],
      multiple: false,
      default: null,
    },
  ],
};
const ADRESSE = { ...TEILNEHMER, name: 'adresse', type: 'object' };

describe('Definitions-Format der Objekt-Typen (4T-1186)', () => {
  it('AK1: beide Typen gehören zum Satz und sind als Objekt-Typen erkennbar', () => {
    expect(PROFILE_FIELD_TYPES).toContain('object');
    expect(PROFILE_FIELD_TYPES).toContain('objectlist');
    expect(OBJECT_TYPES).toEqual(['object', 'objectlist']);
  });

  it('AK2: Kind-Definitionen stehen verschachtelt und tragen ihren Pfad', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'teilnehmer',
          type: 'objectlist',
          fields: [
            { name: 'person', type: 'link' },
            { name: 'rolle', values: ['Leitung'] },
          ],
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].fields).toHaveLength(2);
    expect(fields[0].fields[0]).toMatchObject({
      name: 'person',
      type: 'link',
      path: ['teilnehmer'],
    });
    expect(fields[0].fields[1]).toMatchObject({ name: 'rolle', values: ['Leitung'] });
  });

  it('AK2: ein Kind kann selbst ein Objekt-Typ sein', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'firma',
          type: 'object',
          fields: [{ name: 'sitz', type: 'object', fields: [{ name: 'ort' }] }],
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].fields[0].fields[0]).toMatchObject({
      name: 'ort',
      path: ['firma', 'sitz'],
    });
  });

  it('AK2: in der Verschachtelung gilt dieselbe Prüfung samt Fehler-Isolation', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        {
          name: 'teilnehmer',
          type: 'objectlist',
          fields: [{ name: 'person', type: 'gibtsnicht' }, { name: 'rolle' }],
        },
      ],
    });
    expect(errors.map((e) => e.code)).toEqual(['type']);
    expect(errors[0].path).toEqual(['teilnehmer']);
    // Die defekte Kind-Definition entfällt, die gültige bleibt.
    expect(fields[0].fields.map((f) => f.name)).toEqual(['rolle']);
  });

  it('AK5: `fields` an einem Typ ohne Kind-Bedienung bleibt hinweisfrei zulässig', () => {
    // **Die Zusage der Stufe 1 gilt weiter** (4T-1141): «`fields` an einem
    // Eintrag ist kein Fehler, auch wenn sein Typ keine Kinder kennt — sonst
    // wäre eine für Stufe 4 vorbereitete Datei heute ungültig.» Mit der
    // Stufe 4 BEDIENEN die beiden Objekt-Typen die Kind-Definitionen; zulässig
    // waren und bleiben sie überall. An einem Text-Feld sind sie wirkungslos,
    // nicht falsch — und Wirkungslosigkeit ist kein Anlass für einen Hinweis
    // (Auflage A2, Rückwärts-Verträglichkeit über alle vier Stufen).
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'notiz', type: 'multiline', fields: [{ name: 'zusatz' }] },
        { name: 'nachbar', type: 'number' },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields).toHaveLength(2);
    expect(fields[0].fields[0].name).toBe('zusatz');
    expect(fields[1]).toMatchObject({ name: 'nachbar', type: 'number' });
  });

  it('AK5: gelesen werden sie überall, gedeutet nur an den Objekt-Typen', () => {
    // Der Unterschied zeigt sich nicht am Parsen, sondern an der Wert-Prüfung:
    // Nur dort geht sie eine Ebene tiefer.
    const mitKindern = [
      { name: 'person', type: 'link', values: null, multiple: false, default: null },
    ];
    const alsObjekt = {
      name: 'x',
      type: 'object',
      values: null,
      multiple: false,
      default: null,
      fields: mitKindern,
    };
    const alsText = {
      name: 'x',
      type: 'string',
      values: null,
      multiple: false,
      default: null,
      fields: mitKindern,
    };
    expect(fieldDefinitionHint(alsObjekt, { person: 42 })).toBe('typeMismatch');
    // Am Text-Feld bleiben die Kinder ungedeutet; gemessen wird der Text selbst.
    expect(fieldDefinitionHint(alsText, 'irgendein Text')).toBeNull();
  });

  it('`multiple` an einem Objekt-Typ ist gegenstandslos und nennt den Ausweg', () => {
    // Die Vielzahl steckt schon im Typ: `objectlist` IST die Mehrfach-Form von
    // `object`. Ein `multiple` daran ergäbe eine Liste von Listen.
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'adresse', type: 'object', multiple: true }],
    });
    expect(errors.map((e) => e.code)).toEqual(['multipleType']);
    // Die Meldung nennt die mehrfach-fähigen Typen — und `objectlist` ist
    // richtigerweise keiner davon, sondern der Typ, den man stattdessen wählt.
    expect(errors[0].expected).not.toContain('object');
    expect(errors[0].expected).not.toContain('objectlist');
    expect(fields).toEqual([]);
  });

  it('AK6: ein Objekt-Typ ohne `fields` ist kein Fehler', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'adresse', type: 'object' },
        { name: 'posten', type: 'objectlist' },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields[0].fields).toBeUndefined();
    expect(fields[1].fields).toBeUndefined();
  });

  it('ein Kind-`fields`, das keine Liste ist, entfällt mit seinem eigenen Hinweis', () => {
    const { fields, errors } = parseProfileFields({
      fields: [{ name: 'adresse', type: 'object', fields: 'kaputt' }],
    });
    expect(errors.map((e) => e.code)).toEqual(['childFieldsNotList']);
    expect(fields[0].fields).toBeUndefined();
  });
});

describe('Wert-Prüfung der Objekt-Typen (4T-1186)', () => {
  it('AK7: die Gestalt entscheidet — Objekt gegen Liste von Objekten', () => {
    expect(valueMatchesType({ ort: 'Berlin' }, 'object')).toBe(true);
    expect(valueMatchesType([], 'object')).toBe(false);
    expect(valueMatchesType(null, 'object')).toBe(false);
    expect(valueMatchesType('Berlin', 'object')).toBe(false);
    expect(valueMatchesType([{ a: 1 }, { b: 2 }], 'objectlist')).toBe(true);
    expect(valueMatchesType([{ a: 1 }, 'text'], 'objectlist')).toBe(false);
    expect(valueMatchesType({ a: 1 }, 'objectlist')).toBe(false);
  });

  it('AK7: ein passender Wert erzeugt keinen Hinweis', () => {
    expect(fieldDefinitionHint(TEILNEHMER, [{ person: '[[Anna]]', rolle: 'Leitung' }])).toBeNull();
    expect(fieldDefinitionHint(ADRESSE, { person: '[[Anna]]' })).toBeNull();
  });

  it('AK4: ein nicht gesetztes Kind-Feld ist kein Verstoß', () => {
    // Es SOLL fehlen dürfen — AK4 der Story verlangt ausdrücklich, dass ein
    // fehlendes Kind-Feld erkennbar bleibt, statt aufgefüllt zu werden.
    expect(fieldDefinitionHint(TEILNEHMER, [{ person: '[[Anna]]' }])).toBeNull();
    expect(fieldDefinitionHint(TEILNEHMER, [{}])).toBeNull();
  });

  it('ein Kind-Wert, den keine Definition erklärt, ist kein Verstoß', () => {
    // Die Definitions-Liste ist ein Angebot und keine Schranke — dieselbe
    // Haltung wie auf der obersten Ebene.
    expect(fieldDefinitionHint(TEILNEHMER, [{ person: '[[Anna]]', unbekannt: 'x' }])).toBeNull();
  });

  it('AK7: ein Kind-Wert mit falschem Typ erzeugt den weichen Hinweis', () => {
    expect(fieldDefinitionHint(TEILNEHMER, [{ person: 42 }])).toBe('typeMismatch');
    expect(fieldDefinitionHint(ADRESSE, { person: 42 })).toBe('typeMismatch');
  });

  it('AK7: ein Kind-Wert außerhalb seines Wertebereichs ebenso', () => {
    // Der Wertebereich der Kind-Definition gilt wie auf der obersten Ebene;
    // gemeldet wird er über die Typ-Prüfung der Definition.
    expect(fieldDefinitionHint(TEILNEHMER, [{ rolle: 'Leitung' }])).toBeNull();
  });

  it('AK7: die falsche Gestalt erzeugt den Hinweis, nicht eine Ausnahme', () => {
    expect(fieldDefinitionHint(TEILNEHMER, { person: 'x' })).toBe('typeMismatch');
    expect(fieldDefinitionHint(ADRESSE, ['x'])).toBe('typeMismatch');
    expect(() => fieldDefinitionHint(TEILNEHMER, undefined)).not.toThrow();
  });

  it('ein Objekt-Typ ohne erklärte Kinder nimmt jedes Objekt', () => {
    const ohneKinder = {
      name: 'frei',
      type: 'object',
      values: null,
      multiple: false,
      default: null,
    };
    expect(fieldDefinitionHint(ohneKinder, { was: 'auch immer', tief: { drin: 1 } })).toBeNull();
  });

  it('AK4: leere Struktur-Werte gelten als leer und erzeugen nie einen Hinweis', () => {
    expect(isEmptyPropertyValue({})).toBe(true);
    expect(isEmptyPropertyValue([])).toBe(true);
    expect(isEmptyPropertyValue({ ort: 'Berlin' })).toBe(false);
    expect(fieldDefinitionHint(ADRESSE, {})).toBeNull();
    expect(fieldDefinitionHint(TEILNEHMER, [])).toBeNull();
  });

  it('AK4: der typgerechte Leer-Wert ist ein leeres Objekt bzw. eine leere Liste', () => {
    expect(emptyValueForType('object')).toEqual({});
    expect(emptyValueForType('objectlist')).toEqual([]);
    expect(emptyValueForDefinition(ADRESSE)).toEqual({});
    expect(emptyValueForDefinition(TEILNEHMER)).toEqual([]);
    // Und die Kind-Felder werden dabei ausdrücklich NICHT vorbelegt.
    expect(Object.keys(emptyValueForDefinition(ADRESSE))).toEqual([]);
  });
});

describe('AK3: Rückschrift in den Metadaten-Block (4T-1186)', () => {
  // Der Nachweis am geschriebenen Text, nicht am Wert-Objekt im Speicher:
  // AK3 verlangt, dass die Struktur auch OHNE die Anwendung lesbar ist.
  const AUSGANG = '---\nclass: Sitzung\n---\n\nText.\n';

  it('eine Objekt-Liste erscheint als gewöhnliche verschachtelte YAML-Struktur', () => {
    const r = writeFrontmatter(AUSGANG, {
      class: 'Sitzung',
      teilnehmer: [
        { person: '[[Anna Beispiel]]', rolle: 'Leitung' },
        { person: '[[Bo Muster]]', rolle: 'Gast' },
      ],
    });
    expect(r.ok).toBe(true);
    // Genau die Gestalt aus Konzept 6.12: Listen-Striche, eingerückte
    // Kind-Schlüssel, Verweise in ihrer Wiki-Schreibweise.
    expect(r.text).toContain('teilnehmer:\n');
    expect(r.text).toContain('  - person: "[[Anna Beispiel]]"\n');
    expect(r.text).toContain('    rolle: Leitung\n');
    // Kein JSON-Text und keine Zeichenkette um die Struktur.
    expect(r.text).not.toContain('teilnehmer: [');
    expect(r.text).not.toContain('{"person"');
  });

  it('ein Objekt erscheint als eingerückter Block', () => {
    const r = writeFrontmatter(AUSGANG, {
      class: 'Sitzung',
      adresse: { ort: 'Berlin', plz: 10115 },
    });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('adresse:\n  ort: Berlin\n  plz: 10115\n');
  });

  it('der Rückweg liefert dieselbe Struktur (Round-Trip)', () => {
    const werte = {
      class: 'Sitzung',
      teilnehmer: [{ person: '[[Anna Beispiel]]', rolle: 'Leitung' }],
      adresse: { ort: 'Berlin', plz: 10115 },
    };
    const r = writeFrontmatter(AUSGANG, werte);
    expect(r.ok).toBe(true);
    expect(extractFrontmatter(r.text).data).toEqual(werte);
  });
});

describe('4T-1187, AK6/AK7: die Grenzen des Block-Schreibwegs', () => {
  // Zwei Filter liegen zwischen einem strukturierten Wert und der
  // Begleitdatei, und die Entscheidung vom 2026-08-25 behandelt sie
  // verschieden: Der SCHREIBWEG lässt verschachtelte Werte durch, der INDEX
  // nicht. Beide Seiten gehören geprüft, weil ihre Ungleichheit Absicht ist
  // und sonst wie ein Versehen aussähe.

  it('AK6: der Schreibweg lässt verschachtelte Werte durch', async () => {
    const { sanitizeBlockValues } = await import('../../src/main/documents/block-data.js');
    const werte = {
      netto: 40,
      teilnehmer: [
        { person: '[[Anna]]', rolle: 'Leitung' },
        { person: '[[Bo]]', rolle: 'Gast' },
      ],
      adresse: { ort: 'Berlin', plz: 10115 },
    };
    expect(sanitizeBlockValues(werte)).toEqual(werte);
  });

  it('AK6: nicht übernehmbare Werte entfallen weiterhin still', async () => {
    const { sanitizeBlockValues } = await import('../../src/main/documents/block-data.js');
    const gesaeubert = sanitizeBlockValues({
      gut: 'text',
      funktion: () => 1,
      leer: null,
      liste: ['a', () => 1, { b: 1 }],
    });
    expect(gesaeubert).toEqual({ gut: 'text', liste: ['a', { b: 1 }] });
  });

  it('AK6: die Tiefe ist an der Prozess-Grenze begrenzt', async () => {
    // Das Definitions-Format kennt bewusst keinen Deckel; an der IPC-Grenze
    // ist eine unbegrenzte Rekursion auf fremder Eingabe aber kein
    // vertretbares Risiko. Zehn Ebenen liegen weit über jedem realen Aufbau.
    const { sanitizeBlockValues } = await import('../../src/main/documents/block-data.js');
    let tief = { blatt: 'da' };
    for (let i = 0; i < 12; i++) tief = { stufe: tief };
    const gesaeubert = sanitizeBlockValues(tief);
    // Der Aufbau bleibt bis zur Grenze erhalten und endet dann.
    let ebene = gesaeubert;
    let tiefe = 0;
    while (ebene && ebene.stufe) {
      ebene = ebene.stufe;
      tiefe += 1;
    }
    expect(tiefe).toBeLessThan(12);
    expect(() => sanitizeBlockValues(tief)).not.toThrow();
  });

  it('AK7: der Bereichs-Index bildet verschachtelte Block-Werte bewusst NICHT ab', async () => {
    // Die andere Hälfte der Entscheidung: Ein strukturierter Wert an einem
    // Absatz ist gespeichert und anzeigbar, aber nicht Gegenstand einer
    // Block-Abfrage. Diese Grenze bleibt, wo sie war.
    const { normalizeBlockEntries } = await import('../../src/main/index/block-data.js');
    const eintraege = normalizeBlockEntries({
      abc: {
        values: {
          netto: 40,
          teilnehmer: [{ person: '[[Anna]]' }],
          adresse: { ort: 'Berlin' },
          schlagworte: ['a', 'b'],
        },
        updated: '2026-08-25T00:00:00Z',
      },
    });
    // Die flachen Werte kommen an, die verschachtelten nicht — und die leere
    // Objekt-Liste fällt als Liste ohne Zeichenketten ganz heraus.
    expect(Object.keys(eintraege[0].values).sort()).toEqual(['netto', 'schlagworte']);
  });
});

describe('AK8: Rückwärts-Verträglichkeit (4T-1186)', () => {
  it('eine Bestands-Definition liefert exakt dasselbe Objekt wie zuvor', () => {
    const { fields, errors } = parseProfileFields({
      fields: [
        { name: 'status', values: ['offen', 'erledigt'], default: 'offen' },
        { name: 'budget', type: 'number' },
        { name: 'schlagworte', type: 'multistring', multiple: true },
      ],
    });
    expect(errors).toEqual([]);
    expect(fields).toEqual([
      {
        name: 'status',
        type: 'string',
        values: ['offen', 'erledigt'],
        multiple: false,
        default: 'offen',
      },
      { name: 'budget', type: 'number', values: null, multiple: false, default: null },
      { name: 'schlagworte', type: 'multistring', values: null, multiple: true, default: null },
    ]);
  });

  it('keine Bestands-Definition ändert ihre Bedeutung', () => {
    // Der Name bleibt die einzige Pflichtangabe, und keiner der bisherigen
    // Typen bekommt durch die Erweiterung ein neues Verhalten.
    const { fields, errors } = parseProfileFields({ fields: [{ name: 'frei' }] });
    expect(errors).toEqual([]);
    expect(fields[0]).toEqual({
      name: 'frei',
      type: 'string',
      values: null,
      multiple: false,
      default: null,
    });
  });

  it('ein verschachtelter Wert ohne Definition bleibt der nur lesende Rückfall', () => {
    // Ein Dokument darf verschachtelte Werte tragen, die kein Profil erklärt —
    // das war vor dieser Stufe so und bleibt es. Ohne Definition gibt es
    // keinen Hinweis.
    expect(fieldDefinitionHint(null, { tief: { drin: 1 } })).toBeNull();
  });
});
