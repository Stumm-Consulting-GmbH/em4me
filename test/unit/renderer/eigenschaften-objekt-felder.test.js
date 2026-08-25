// @vitest-environment jsdom
// 4T-1187 (Epic 3E-0221, E11): Gestapelte Bedienung der Objekt-Typen — Bau der
// Kind-Zeilen, Verwaltung der Listen-Einträge und die Auslese zurück in einen
// Wert.
//
// **Der Schwerpunkt liegt auf dem Rundlauf.** Ein Bedienelement, das baut, aber
// nicht zurückliest, ist wertlos; eines, das zurückliest und dabei etwas
// hinzuerfindet, ist schlimmer als keines. Die Fälle unten bauen deshalb aus
// einem Wert und lesen ihn wieder aus — und prüfen dabei besonders, was NICHT
// entsteht: kein aufgefülltes Kind-Feld, kein verlorener Fremd-Wert.
import { describe, it, expect, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { kindDefinitionen, leseObjektWert, renderObjektFeld } =
  await import('../../../src/renderer/modules/properties/properties-objekt-felder.js');

// Die Definition aus dem durchgehenden Beispiel des Konzepts (Kapitel 6.12).
const kind = (name, type = 'string') => ({
  name,
  type,
  values: null,
  multiple: false,
  default: null,
});
const TEILNEHMER = {
  name: 'teilnehmer',
  type: 'objectlist',
  values: null,
  multiple: false,
  default: null,
  fields: [kind('person', 'link'), kind('rolle')],
};
const ADRESSE = { ...TEILNEHMER, name: 'adresse', type: 'object' };

function container() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// Ein einfacher Kind-Editor im Muster beider Panels: ein Eingabefeld je Kind.
function baueKindEditor(zelle, kindDef, kindWert) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'properties-field-value-input';
  input.value = kindWert === undefined || kindWert === null ? '' : String(kindWert);
  zelle.appendChild(input);
}

const leseKindWert = (zelle) => {
  const input = zelle.querySelector('input');
  return input ? input.value : undefined;
};

const rundlauf = (def, wert) => {
  const c = container();
  renderObjektFeld(c, def, wert, { baueKindEditor });
  return leseObjektWert(c, def, leseKindWert);
};

describe('AK1: Bau eines Objekt-Feldes', () => {
  it('zeigt die Kind-Felder gestapelt, jedes mit Beschriftung und Bedienelement', () => {
    const c = container();
    renderObjektFeld(c, ADRESSE, { person: '[[Anna]]', rolle: 'Leitung' }, { baueKindEditor });
    const zeilen = c.querySelectorAll('.properties-objekt-kind');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].dataset.kindFeld).toBe('person');
    expect(zeilen[0].querySelector('.properties-objekt-kind-label').textContent).toBe('person');
    expect(zeilen[0].querySelector('input').value).toBe('[[Anna]]');
    expect(zeilen[1].querySelector('input').value).toBe('Leitung');
  });

  it('ein Objekt hat genau einen Eintrag und keinen Hinzufügen-Knopf', () => {
    const c = container();
    renderObjektFeld(c, ADRESSE, {}, { baueKindEditor });
    expect(c.querySelectorAll('.properties-objekt-eintrag')).toHaveLength(1);
    expect(c.querySelector('.properties-objekt-add')).toBeNull();
    expect(c.querySelector('.properties-objekt-remove')).toBeNull();
  });

  it('AK1: jedes Kind bekommt den Editor SEINES Typs', () => {
    // Der Bau kommt als Parameter herein; geprüft wird, dass er je Kind mit
    // dessen Definition gerufen wird — daran hängt, dass ein Verweis-Kind die
    // Verweis-Vervollständigung bekommt, ohne dass hier etwas dafür entsteht.
    const gesehen = [];
    const c = container();
    renderObjektFeld(
      c,
      ADRESSE,
      {},
      {
        baueKindEditor: (zelle, kindDef) => gesehen.push(kindDef.type),
      },
    );
    expect(gesehen).toEqual(['link', 'string']);
  });

  it('kindDefinitionen liefert nur benannte Kinder', () => {
    expect(kindDefinitionen(ADRESSE).map((k) => k.name)).toEqual(['person', 'rolle']);
    expect(kindDefinitionen({ type: 'object' })).toEqual([]);
    expect(kindDefinitionen(null)).toEqual([]);
    expect(kindDefinitionen({ type: 'object', fields: [{ type: 'string' }] })).toEqual([]);
  });
});

describe('AK2: Einträge einer Objekt-Liste anlegen, ändern und entfernen', () => {
  it('zeigt jeden vorhandenen Eintrag als eigene Gruppe', () => {
    const c = container();
    renderObjektFeld(
      c,
      TEILNEHMER,
      [
        { person: '[[Anna]]', rolle: 'Leitung' },
        { person: '[[Bo]]', rolle: 'Gast' },
      ],
      { baueKindEditor },
    );
    expect(c.querySelectorAll('.properties-objekt-eintrag')).toHaveLength(2);
    expect(c.querySelectorAll('.properties-objekt-kind')).toHaveLength(4);
  });

  it('AK2: der Hinzufügen-Knopf legt einen leeren Eintrag an', () => {
    const c = container();
    let gerufen = 0;
    renderObjektFeld(c, TEILNEHMER, [], { baueKindEditor, onChange: () => (gerufen += 1) });
    c.querySelector('.properties-objekt-add').click();
    expect(c.querySelectorAll('.properties-objekt-eintrag')).toHaveLength(1);
    expect(gerufen).toBe(1);
    // Und er ist LEER — die Kind-Felder sind nicht vorbelegt.
    for (const zeile of c.querySelectorAll('.properties-objekt-kind')) {
      expect(zeile.classList.contains('is-fehlend')).toBe(true);
      expect(zeile.querySelector('input').value).toBe('');
    }
  });

  it('AK2: der Entfernen-Knopf nimmt genau seinen Eintrag weg', () => {
    const c = container();
    let gerufen = 0;
    renderObjektFeld(c, TEILNEHMER, [{ person: 'A' }, { person: 'B' }, { person: 'C' }], {
      baueKindEditor,
      onChange: () => (gerufen += 1),
    });
    c.querySelectorAll('.properties-objekt-remove')[1].click();
    expect(gerufen).toBe(1);
    expect(leseObjektWert(c, TEILNEHMER, leseKindWert)).toEqual([{ person: 'A' }, { person: 'C' }]);
  });

  it('im Lese-Zustand gibt es weder Hinzufügen noch Entfernen', () => {
    const c = container();
    renderObjektFeld(c, TEILNEHMER, [{ person: 'A' }], { baueKindEditor, readOnly: true });
    expect(c.querySelector('.properties-objekt-add')).toBeNull();
    expect(c.querySelector('.properties-objekt-remove')).toBeNull();
    // Die Werte bleiben sichtbar — Lesen heißt nicht Verbergen.
    expect(c.querySelectorAll('.properties-objekt-kind')).toHaveLength(2);
  });
});

describe('AK3: ein nicht gesetztes Kind-Feld bleibt als fehlend erkennbar', () => {
  it('die Zeile ist gekennzeichnet und ihre Beschriftung sagt es', () => {
    const c = container();
    renderObjektFeld(c, ADRESSE, { person: '[[Anna]]' }, { baueKindEditor });
    const zeilen = c.querySelectorAll('.properties-objekt-kind');
    expect(zeilen[0].classList.contains('is-fehlend')).toBe(false);
    expect(zeilen[1].classList.contains('is-fehlend')).toBe(true);
    expect(zeilen[1].querySelector('.properties-objekt-kind-label').title).toBe(
      de['properties.objectFieldMissing'],
    );
  });

  it('AK3: ein leeres Kind-Feld wird beim Auslesen NICHT geschrieben', () => {
    // Sonst füllte das bloße Anzeigen eines Objekts alle Kind-Felder auf, und
    // «fehlend» wäre nach dem ersten Speichern nicht mehr nachweisbar.
    expect(rundlauf(ADRESSE, { person: '[[Anna]]' })).toEqual({ person: '[[Anna]]' });
    expect(rundlauf(ADRESSE, {})).toEqual({});
    expect(rundlauf(TEILNEHMER, [{}])).toEqual([{}]);
  });

  it('ein Wert, der als leerer Text zurückkommt, zählt als nicht gesetzt', () => {
    const c = container();
    renderObjektFeld(c, ADRESSE, { person: '[[Anna]]', rolle: 'Gast' }, { baueKindEditor });
    c.querySelectorAll('input')[1].value = '';
    expect(leseObjektWert(c, ADRESSE, leseKindWert)).toEqual({ person: '[[Anna]]' });
  });
});

describe('Rundlauf: bauen und wieder auslesen', () => {
  it('ein Objekt kommt unverändert zurück', () => {
    const wert = { person: '[[Anna Beispiel]]', rolle: 'Leitung' };
    expect(rundlauf(ADRESSE, wert)).toEqual(wert);
  });

  it('eine Objekt-Liste kommt unverändert und in ihrer Reihenfolge zurück', () => {
    const wert = [
      { person: '[[Anna Beispiel]]', rolle: 'Leitung' },
      { person: '[[Bo Muster]]', rolle: 'Gast' },
    ];
    expect(rundlauf(TEILNEHMER, wert)).toEqual(wert);
  });

  it('eine geänderte Eingabe kommt geändert zurück', () => {
    const c = container();
    renderObjektFeld(c, ADRESSE, { person: '[[Anna]]', rolle: 'Gast' }, { baueKindEditor });
    c.querySelectorAll('input')[1].value = 'Leitung';
    expect(leseObjektWert(c, ADRESSE, leseKindWert)).toEqual({
      person: '[[Anna]]',
      rolle: 'Leitung',
    });
  });

  it('ein Kind-Wert ohne Definition geht nicht verloren', () => {
    // Die Definitions-Liste ist ein Angebot, kein Filter: Was der Anwender von
    // Hand eingetragen hat, gehört ihm — auch wenn kein Profil es erklärt.
    const wert = [{ person: '[[Anna]]', notiz: 'von Hand', tief: { drin: 1 } }];
    expect(rundlauf(TEILNEHMER, wert)).toEqual(wert);
  });

  it('ein Fremd-Wert überschreibt nie, was das Formular gesetzt hat', () => {
    const c = container();
    renderObjektFeld(c, ADRESSE, { person: 'alt' }, { baueKindEditor });
    // Ein Fremd-Wert mit demselben Namen wie ein Kind-Feld darf die Eingabe
    // nicht verdrängen (konstruierter Rand, aber ein stiller Datenverlust).
    c.querySelector('.properties-objekt-eintrag')._fremdeWerte = { person: 'fremd' };
    c.querySelector('input').value = 'neu';
    expect(leseObjektWert(c, ADRESSE, leseKindWert)).toEqual({ person: 'neu' });
  });

  it('keine Eingabe wirft je eine Ausnahme', () => {
    expect(() => rundlauf(ADRESSE, null)).not.toThrow();
    expect(() => rundlauf(ADRESSE, 'kein Objekt')).not.toThrow();
    expect(() => rundlauf(TEILNEHMER, { kein: 'Array' })).not.toThrow();
    expect(() => rundlauf(TEILNEHMER, ['kein Objekt'])).not.toThrow();
    // Ein Wert der falschen Gestalt ergibt den Leer-Fall, nicht Bruchstücke.
    expect(rundlauf(TEILNEHMER, { kein: 'Array' })).toEqual([]);
  });

  it('ohne gebautes Feld liefert die Auslese den typgerechten Leer-Wert', () => {
    const c = container();
    expect(leseObjektWert(c, ADRESSE, leseKindWert)).toEqual({});
    expect(leseObjektWert(c, TEILNEHMER, leseKindWert)).toEqual([]);
  });
});

describe('AK4: Parität beider Panels', () => {
  it('beide Panels bauen die Objekt-Felder aus derselben Quelle', async () => {
    const fs = await import('node:fs');
    const quellen = [
      'src/renderer/modules/properties/properties-wert-editor.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ].map((p) => fs.readFileSync(p, 'utf8'));
    for (const quelle of quellen) {
      expect(quelle).toContain("from './properties-objekt-felder.js'");
      expect(quelle).toContain('renderObjektFeld');
      expect(quelle).toContain('kindDefinitionen');
    }
  });

  it('beide Schreibwege lesen die Objekt-Felder über dieselbe Funktion', async () => {
    const fs = await import('node:fs');
    const quellen = [
      'src/renderer/modules/properties/properties-typ-werte.js',
      'src/renderer/modules/properties/block-props-save.js',
    ].map((p) => fs.readFileSync(p, 'utf8'));
    for (const quelle of quellen) {
      expect(quelle).toContain('leseObjektWert');
      expect(quelle).toContain('OBJECT_TYPES.includes(type)');
    }
  });

  it('das Bau-Modul bleibt außerhalb der Zyklus-Komponente der Renderer-Ordner', async () => {
    const fs = await import('node:fs');
    const quelle = fs.readFileSync(
      'src/renderer/modules/properties/properties-objekt-felder.js',
      'utf8',
    );
    expect(quelle).not.toContain("from '../views/");
    // Der Bau der Kind-Editoren kommt als Parameter herein; ein Import der
    // Panel-Module machte dieses Modul zum Teilnehmer der Ordner-Zyklen.
    expect(quelle).not.toContain("from './properties-wert-editor.js'");
    expect(quelle).not.toContain("from './block-props-fields.js'");
  });

  it('ein Objekt-Typ ohne erklärte Kinder bekommt keine gestapelte Bedienung', async () => {
    // Er fällt auf die vorhandene nur lesende Anzeige zurück — beide Panels
    // prüfen das mit derselben Bedingung.
    const fs = await import('node:fs');
    for (const p of [
      'src/renderer/modules/properties/properties-wert-editor.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ]) {
      expect(fs.readFileSync(p, 'utf8')).toContain('kindDefinitionen(def).length');
    }
  });
});
