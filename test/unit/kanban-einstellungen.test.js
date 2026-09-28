// 4T-001954 (Epic 3E-000319): Unit-Tests der Einstellungen je Tafel im
// Format-Kern — Lesen des Blocks `%% kanban:settings` in hiesige Einstellungen,
// Schreiben je Schlüssel mit Byte-Vergleich, Anlegen des Blocks, Zurücksetzen
// auf «wie Vorgabe» und der Rundlauf der Beispiel-Tafeln.
//
// Geprüft wird durchweg an Byte-Gleichheit, nicht an Modell-Gleichheit: Die
// Zusage ist, dass außer der Spanne des einen Schlüssels **kein** Zeichen der
// Datei sich ändert. Die CRLF-Fassungen entstehen im Prüffall aus den
// Beispiel-Tafeln, weil `.gitattributes` für Text-Dateien LF erzwingt.
//
// Die Beispiel-Tafel `tafel-stufe-3.md` trägt alle acht abgebildeten Schlüssel,
// dazu fremde, die der Kern nicht deutet (`list-collapse`, `hide-card-count`,
// `tag-colors`, `date-format`); ihre Inhalte sind erfunden.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TAFEL_EINSTELLUNGEN,
  ARCHIV_UNBEGRENZT,
  einstellungenAusModell,
  leseTafelEinstellungen,
  setzeTafelEinstellung,
} from '../../src/shared/kanban/kanban-einstellungen.js';
import { leseTafel, schreibeTafel } from '../../src/shared/kanban/kanban-core.js';

function fixture(name) {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/kanban/${name}`, import.meta.url)),
    'utf8',
  );
}

const TAFEL = fixture('beispiel-tafel.md');
const LEER = fixture('leere-tafel.md');
const OHNE_KENNZEICHEN = fixture('fremde-kopf-schlüssel.md');
const STUFE2 = fixture('tafel-stufe-2.md');
const STUFE3 = fixture('tafel-stufe-3.md');

const alsCrlf = (text) => text.replace(/\n/g, '\r\n');
// Alle Umbrüche am Ende fort, damit die Fassung wirklich ohne Schluss-Umbruch
// endet, auch wenn die Tafel mit einer Leerzeile schließt.
const ohneSchluss = (text) => text.replace(/(\r?\n)+$/, '');

// Die vier Fassungen einer Tafel, an denen eine Normalform-Ausgabe scheitert.
function fassungen(text) {
  return {
    lf: text,
    crlf: alsCrlf(text),
    'lf ohne Schluss-Umbruch': ohneSchluss(text),
    'crlf ohne Schluss-Umbruch': ohneSchluss(alsCrlf(text)),
  };
}

function jsonZeile(text) {
  return text.split('\n').find((z) => z.trimStart().startsWith('{"'));
}

// Alles vor und hinter der JSON-Zeile muss byte-gleich bleiben.
function ausserhalbDerJsonZeile(text) {
  const zeile = jsonZeile(text);
  const i = text.indexOf(zeile);
  return [text.slice(0, i), text.slice(i + zeile.length)];
}

describe('kanban-einstellungen — die Schlüssel-Abbildung', () => {
  it('bildet acht Einstellungen auf die Schlüssel des Vorbilds ab, ohne eigenen Schlüssel', () => {
    expect(TAFEL_EINSTELLUNGEN.map((e) => [e.name, e.schluessel])).toEqual([
      ['zielordner', 'new-note-folder'],
      ['vorlage', 'new-note-template'],
      ['archivMitZeitstempel', 'archive-with-date'],
      ['archivObergrenze', 'max-archive-size'],
      ['termineRelativ', 'show-relative-date'],
      ['feldwahl', 'metadata-keys'],
      ['datumZurTagesnotiz', 'link-date-to-daily-note'],
      ['tagsAmFuss', 'move-tags'],
    ]);
    expect(TAFEL_EINSTELLUNGEN.some((e) => e.schluessel.startsWith('em4me-'))).toBe(false);
    expect(ARCHIV_UNBEGRENZT).toBe(-1);
  });
});

describe('kanban-einstellungen — Lesen (AK1, AK4)', () => {
  it('liest jeden abgebildeten Schlüssel eines vollen Blocks in seine hiesige Einstellung', () => {
    const ergebnis = leseTafelEinstellungen(STUFE3);
    expect(ergebnis.block).toBe(true);
    expect(ergebnis.befunde).toEqual([]);
    expect(ergebnis.werte).toEqual({
      zielordner: 'Projekte/Notizen',
      vorlage: 'Vorlagen/Projekt.md',
      archivMitZeitstempel: true,
      archivObergrenze: 50,
      termineRelativ: false,
      feldwahl: [
        {
          feld: 'status',
          bezeichnung: 'Status',
          bezeichnungVerbergen: false,
          enthaeltMarkdown: false,
        },
        { feld: 'bild', bezeichnung: '', bezeichnungVerbergen: true, enthaeltMarkdown: true },
      ],
      datumZurTagesnotiz: true,
      tagsAmFuss: true,
    });
  });

  it('übergeht fremde Schlüssel beim Lesen, ohne Befund', () => {
    const { werte, befunde } = leseTafelEinstellungen(STUFE3);
    expect(Object.keys(werte).sort()).toEqual(TAFEL_EINSTELLUNGEN.map((e) => e.name).sort());
    expect(befunde).toEqual([]);
  });

  it('liest einen teilweise gefüllten Block: nur gesetzte Schlüssel kommen zurück', () => {
    expect(leseTafelEinstellungen(TAFEL)).toEqual({
      block: true,
      werte: { zielordner: 'Beispiel/Ablage' },
      befunde: [],
    });
    expect(leseTafelEinstellungen(STUFE2).werte).toEqual({ archivMitZeitstempel: true });
  });

  it('liefert ohne Block keine Einstellungen und keinen Befund', () => {
    expect(leseTafelEinstellungen(LEER)).toEqual({ block: false, werte: {}, befunde: [] });
  });

  it('liest in CRLF und ohne Schluss-Umbruch dieselben Werte', () => {
    const erwartet = leseTafelEinstellungen(STUFE3).werte;
    for (const [art, text] of Object.entries(fassungen(STUFE3))) {
      expect(leseTafelEinstellungen(text).werte, art).toEqual(erwartet);
    }
  });

  it('meldet ein Dokument, das keine Tafel ist', () => {
    expect(leseTafelEinstellungen(OHNE_KENNZEICHEN).befunde).toEqual([
      { code: 'keinTafelDokument', detail: '' },
    ]);
  });

  it('meldet einen Block ohne lesbare JSON-Zeile und liest nichts daraus', () => {
    const kaputt = STUFE3.replace(jsonZeile(STUFE3), '{"move-tags":true,');
    const ergebnis = leseTafelEinstellungen(kaputt);
    expect(ergebnis.block).toBe(true);
    expect(ergebnis.werte).toEqual({});
    expect(ergebnis.befunde.map((b) => b.code)).toEqual(['einstellungsBlockUnlesbar']);
  });

  it.each([
    ['new-note-folder', '""'],
    ['new-note-folder', '42'],
    ['new-note-template', 'null'],
    ['archive-with-date', '"ja"'],
    ['max-archive-size', '-2'],
    ['max-archive-size', '2.5'],
    ['max-archive-size', '"100"'],
    ['show-relative-date', '1'],
    ['metadata-keys', '{}'],
    ['metadata-keys', '[{"metadataKey":"status"}]'],
    [
      'metadata-keys',
      '[{"metadataKey":"","label":"","shouldHideLabel":false,"containsMarkdown":false}]',
    ],
    ['link-date-to-daily-note', '"true"'],
    ['move-tags', 'null'],
  ])(
    'ein ungültiger Wert von %s (%s) gilt als nicht gesetzt und ist benannt',
    (schluessel, roh) => {
      // Ein gültiger Zeuge daneben, nie derselbe Schlüssel ein zweites Mal.
      const zeuge = schluessel === 'move-tags' ? 'archive-with-date' : 'move-tags';
      const text =
        LEER + `%% kanban:settings\n\`\`\`\n{"${schluessel}":${roh},"${zeuge}":true}\n\`\`\`\n%%\n`;
      const ergebnis = leseTafelEinstellungen(text);
      const eintrag = TAFEL_EINSTELLUNGEN.find((e) => e.schluessel === schluessel);
      expect(ergebnis.werte[eintrag.name]).toBeUndefined();
      expect(ergebnis.befunde).toEqual([
        { code: 'einstellungUngueltig', zeile: 9, detail: schluessel },
      ]);
      // Die übrigen Werte bleiben lesbar — ein kaputter Wert kostet nur sich selbst.
      expect(Object.values(ergebnis.werte)).toEqual([true]);
    },
  );

  it('nimmt -1 und 0 als Archiv-Obergrenze an', () => {
    for (const zahl of [-1, 0]) {
      const text = LEER + `%% kanban:settings\n\`\`\`\n{"max-archive-size":${zahl}}\n\`\`\`\n%%\n`;
      expect(leseTafelEinstellungen(text).werte).toEqual({ archivObergrenze: zahl });
    }
  });

  it('liest aus einem bereits gelesenen Modell dasselbe wie aus dem Text', () => {
    expect(einstellungenAusModell(leseTafel(STUFE3))).toEqual(leseTafelEinstellungen(STUFE3));
    expect(einstellungenAusModell(null)).toEqual({ block: false, werte: {}, befunde: [] });
  });
});

describe('kanban-einstellungen — Schreiben je Schlüssel (AK2, AK4)', () => {
  it.each(Object.entries(fassungen(STUFE3)))(
    'ändert in der Fassung %s allein die Spanne des einen Werts',
    (_, text) => {
      const r = setzeTafelEinstellung(text, { name: 'tagsAmFuss', wert: false });
      expect(r.ok).toBe(true);
      expect(r.text).toBe(text.replace('"move-tags":true', '"move-tags":false'));
      expect(ausserhalbDerJsonZeile(r.text)).toEqual(ausserhalbDerJsonZeile(text));
    },
  );

  it('setzt jeden der acht Schlüssel an Ort und Stelle, ohne die Reihenfolge zu ändern', () => {
    const neu = {
      zielordner: ['new-note-folder', 'Neu/Ort', '"Neu/Ort"'],
      vorlage: ['new-note-template', 'Vorlagen/Neu.md', '"Vorlagen/Neu.md"'],
      archivMitZeitstempel: ['archive-with-date', false, 'false'],
      archivObergrenze: ['max-archive-size', -1, '-1'],
      termineRelativ: ['show-relative-date', true, 'true'],
      datumZurTagesnotiz: ['link-date-to-daily-note', false, 'false'],
      tagsAmFuss: ['move-tags', false, 'false'],
    };
    const vorher = JSON.parse(jsonZeile(STUFE3));
    for (const [name, [schluessel, wert, geschrieben]] of Object.entries(neu)) {
      const r = setzeTafelEinstellung(STUFE3, { name, wert });
      expect(r.ok, name).toBe(true);
      const alt = `"${schluessel}":${JSON.stringify(vorher[schluessel])}`;
      expect(r.text, name).toBe(STUFE3.replace(alt, `"${schluessel}":${geschrieben}`));
      expect(Object.keys(JSON.parse(jsonZeile(r.text))), name).toEqual(Object.keys(vorher));
    }
  });

  it('schreibt die Feldwahl als Liste von Objekten in der Schreibweise des Vorbilds', () => {
    const r = setzeTafelEinstellung(STUFE3, {
      name: 'feldwahl',
      wert: [{ feld: 'verantwortlich', bezeichnung: 'Wer' }],
    });
    expect(r.ok).toBe(true);
    expect(JSON.parse(jsonZeile(r.text))['metadata-keys']).toEqual([
      {
        metadataKey: 'verantwortlich',
        label: 'Wer',
        shouldHideLabel: false,
        containsMarkdown: false,
      },
    ]);
    expect(leseTafelEinstellungen(r.text).werte.feldwahl).toEqual([
      {
        feld: 'verantwortlich',
        bezeichnung: 'Wer',
        bezeichnungVerbergen: false,
        enthaeltMarkdown: false,
      },
    ]);
    expect(ausserhalbDerJsonZeile(r.text)).toEqual(ausserhalbDerJsonZeile(STUFE3));
  });

  it('hängt einen fehlenden Schlüssel ans Ende des Objekts, wie das Vorbild', () => {
    const r = setzeTafelEinstellung(TAFEL, { name: 'termineRelativ', wert: true });
    expect(r.text).toBe(
      TAFEL.replace(
        '"hide-card-count":false}',
        '"hide-card-count":false,"show-relative-date":true}',
      ),
    );
  });

  it('lässt fremde Schlüssel und ihre Schreibweise zeichengenau stehen', () => {
    // Abstände, die das Vorbild selbst nie schreibt: auch sie bleiben.
    const locker = TAFEL.replace(
      '"show-checkboxes":false,',
      '"show-checkboxes" :  false ,  "x-fremd":{"a":[1,"]}"]},',
    );
    const r = setzeTafelEinstellung(locker, { name: 'zielordner', wert: 'Anderswo' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(locker.replace('"Beispiel/Ablage"', '"Anderswo"'));
  });

  it('schreibt Umlaute und Anführungszeichen eines Werts wie JSON.stringify', () => {
    const r = setzeTafelEinstellung(TAFEL, { name: 'zielordner', wert: 'Böden — "neu"' });
    expect(JSON.parse(jsonZeile(r.text))['new-note-folder']).toBe('Böden — "neu"');
    expect(r.text).toContain('"new-note-folder":"Böden — \\"neu\\""');
  });

  it('weist einen ungültigen Wert ab und lässt die Tafel unberührt', () => {
    for (const [name, wert] of [
      ['tagsAmFuss', 'ja'],
      ['archivObergrenze', -5],
      ['archivObergrenze', 1.5],
      ['zielordner', '   '],
      ['feldwahl', [{ feld: '' }]],
      ['feldwahl', 'status'],
    ]) {
      const r = setzeTafelEinstellung(STUFE3, { name, wert });
      expect(r.ok, name).toBe(false);
      expect(r.befund.code, name).toBe('einstellungUngueltig');
    }
  });

  it('weist eine unbekannte Einstellung und ein Dokument ohne Tafel ab', () => {
    expect(setzeTafelEinstellung(STUFE3, { name: 'listCollapse', wert: true }).befund.code).toBe(
      'unbekannteEinstellung',
    );
    expect(
      setzeTafelEinstellung(OHNE_KENNZEICHEN, { name: 'tagsAmFuss', wert: true }).befund.code,
    ).toBe('keinTafelDokument');
  });

  it('schreibt nicht in eine JSON-Zeile, die es nicht versteht', () => {
    const kaputt = STUFE3.replace(jsonZeile(STUFE3), '{"move-tags":true,');
    expect(setzeTafelEinstellung(kaputt, { name: 'tagsAmFuss', wert: false }).befund.code).toBe(
      'einstellungsBlockUnlesbar',
    );
  });

  it('schreibt nicht, wenn derselbe Schlüssel zweimal im Block steht', () => {
    const doppelt = TAFEL.replace(
      '"hide-card-count":false}',
      '"hide-card-count":false,"new-note-folder":"B"}',
    );
    expect(setzeTafelEinstellung(doppelt, { name: 'zielordner', wert: 'C' }).befund.code).toBe(
      'schluesselDoppelt',
    );
  });

  it('schreibt nicht in einen Block ohne schließende Marke', () => {
    const offen = STUFE3.replace(/```\n%%\n$/, '```\n');
    expect(setzeTafelEinstellung(offen, { name: 'tagsAmFuss', wert: false }).befund.code).toBe(
      'einstellungsBlockOffen',
    );
  });
});

describe('kanban-einstellungen — Zurücksetzen auf «wie Vorgabe» (AK3)', () => {
  it.each(Object.entries(fassungen(STUFE3)))(
    'entfernt in der Fassung %s den Schlüssel samt Komma und lässt alles andere stehen',
    (_, text) => {
      const r = setzeTafelEinstellung(text, { name: 'tagsAmFuss', wert: null });
      expect(r.ok).toBe(true);
      expect(r.text).toBe(text.replace(',"move-tags":true', ''));
      expect(leseTafelEinstellungen(r.text).werte.tagsAmFuss).toBeUndefined();
    },
  );

  it('entfernt den ersten, einen mittleren, den letzten und den einzigen Schlüssel', () => {
    const block = (json) => LEER + `%% kanban:settings\n\`\`\`\n${json}\n\`\`\`\n%%\n`;
    const faelle = [
      ['{"move-tags":true,"a":1}', '{"a":1}'],
      ['{"a":1,"move-tags":true,"b":2}', '{"a":1,"b":2}'],
      ['{"a":1,"move-tags":true}', '{"a":1}'],
      ['{"move-tags":true}', '{}'],
    ];
    for (const [vorher, nachher] of faelle) {
      const r = setzeTafelEinstellung(block(vorher), { name: 'tagsAmFuss', wert: undefined });
      expect(r.text, vorher).toBe(block(nachher));
    }
  });

  it('ändert nichts, wenn der Schlüssel oder der Block fehlt', () => {
    expect(setzeTafelEinstellung(TAFEL, { name: 'tagsAmFuss', wert: null }).text).toBe(TAFEL);
    for (const text of Object.values(fassungen(LEER))) {
      expect(setzeTafelEinstellung(text, { name: 'tagsAmFuss', wert: null })).toEqual({
        ok: true,
        text,
      });
    }
  });

  it('Setzen und Zurücksetzen ergibt Byte für Byte die Ausgangsdatei', () => {
    for (const quelle of [TAFEL, STUFE2]) {
      for (const text of Object.values(fassungen(quelle))) {
        const gesetzt = setzeTafelEinstellung(text, { name: 'tagsAmFuss', wert: true });
        expect(setzeTafelEinstellung(gesetzt.text, { name: 'tagsAmFuss', wert: null }).text).toBe(
          text,
        );
      }
    }
  });
});

describe('kanban-einstellungen — Anlegen des Blocks (AK3)', () => {
  const erwarteterBlock = (eol) =>
    ['%% kanban:settings', '```', '{"move-tags":true}', '```', '%%'].join(eol);

  it('legt an einer Tafel ohne Block den Block am Dateiende an, in der Form des Vorbilds', () => {
    // Die leere Tafel endet schon mit einer Leerzeile; es kommt keine hinzu.
    const r = setzeTafelEinstellung(LEER, { name: 'tagsAmFuss', wert: true });
    expect(r.text).toBe(LEER + erwarteterBlock('\n') + '\n');
  });

  it('hält Zeilenenden und Schluss-Umbruch der Quelle', () => {
    const faelle = {
      lf: [LEER, LEER + erwarteterBlock('\n') + '\n'],
      crlf: [alsCrlf(LEER), alsCrlf(LEER) + erwarteterBlock('\r\n') + '\r\n'],
      'lf ohne Schluss-Umbruch': [
        ohneSchluss(LEER),
        ohneSchluss(LEER) + '\n\n' + erwarteterBlock('\n'),
      ],
      'crlf ohne Schluss-Umbruch': [
        ohneSchluss(alsCrlf(LEER)),
        ohneSchluss(alsCrlf(LEER)) + '\r\n\r\n' + erwarteterBlock('\r\n'),
      ],
    };
    for (const [art, [quelle, erwartet]] of Object.entries(faelle)) {
      const r = setzeTafelEinstellung(quelle, { name: 'tagsAmFuss', wert: true });
      expect(r.text, art).toBe(erwartet);
      expect(leseTafelEinstellungen(r.text).werte, art).toEqual({ tagsAmFuss: true });
    }
  });

  it('setzt hinter die letzte Zeile ohne Leerzeile genau eine Leerzeile', () => {
    const tafel = '---\nkanban-plugin: board\n---\n\n## Offen\n\n- [ ] Karte\n';
    const r = setzeTafelEinstellung(tafel, { name: 'tagsAmFuss', wert: true });
    expect(r.text).toBe(tafel + '\n' + erwarteterBlock('\n') + '\n');
  });

  it('legt den Block hinter dem Archiv an, ohne das Archiv zu berühren', () => {
    const ohneBlock = STUFE2.slice(0, STUFE2.indexOf('%% kanban:settings'));
    for (const [art, text] of Object.entries(fassungen(ohneBlock))) {
      const r = setzeTafelEinstellung(text, { name: 'zielordner', wert: 'Ablage' });
      expect(r.ok, art).toBe(true);
      expect(r.text.startsWith(text), art).toBe(true);
      const model = leseTafel(r.text);
      expect(model.archiv.karten.length, art).toBe(leseTafel(text).archiv.karten.length);
      expect(model.einstellungen.vonZeile, art).toBeGreaterThan(model.archiv.bisZeile);
      expect(leseTafelEinstellungen(r.text).werte, art).toEqual({ zielordner: 'Ablage' });
    }
  });

  it('Zurücksetzen nach dem Anlegen lässt den Block mit leerem Objekt stehen', () => {
    // Wer den Block angelegt hat, weiß der Kern nicht; er nimmt den Schlüssel
    // heraus, nicht den Block.
    const erst = setzeTafelEinstellung(LEER, { name: 'tagsAmFuss', wert: true }).text;
    const zurueck = setzeTafelEinstellung(erst, { name: 'tagsAmFuss', wert: null }).text;
    expect(zurueck).toBe(erst.replace('{"move-tags":true}', '{}'));
    expect(leseTafelEinstellungen(zurueck)).toEqual({ block: true, werte: {}, befunde: [] });
  });

  it('der angelegte Block lässt sich weiter je Schlüssel beschreiben', () => {
    const erst = setzeTafelEinstellung(LEER, { name: 'tagsAmFuss', wert: true }).text;
    const dann = setzeTafelEinstellung(erst, { name: 'archivObergrenze', wert: 25 }).text;
    expect(dann).toBe(
      erst.replace('{"move-tags":true}', '{"move-tags":true,"max-archive-size":25}'),
    );
  });
});

describe('kanban-einstellungen — Rundlauf der Beispiel-Tafeln (AK7)', () => {
  it('Lesen und unverändertes Zurückschreiben ist byte-gleich', () => {
    for (const quelle of [TAFEL, LEER, STUFE2, STUFE3]) {
      for (const [art, text] of Object.entries(fassungen(quelle))) {
        leseTafelEinstellungen(text);
        expect(schreibeTafel(leseTafel(text)), art).toBe(text);
      }
    }
  });

  it('jeden gelesenen Wert unverändert zurückzuschreiben ändert kein Byte', () => {
    for (const quelle of [TAFEL, STUFE2, STUFE3]) {
      for (const [art, text] of Object.entries(fassungen(quelle))) {
        let stand = text;
        for (const [name, wert] of Object.entries(leseTafelEinstellungen(text).werte)) {
          const r = setzeTafelEinstellung(stand, { name, wert });
          expect(r.ok, `${art} ${name}`).toBe(true);
          stand = r.text;
        }
        expect(stand, art).toBe(text);
      }
    }
  });
});
