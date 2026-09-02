// 4T-1290 (Epic 3E-0224): Unit-Tests für das Zusammensetzen der Teile eines
// großen Dokuments (src/shared/document-assembly.js). Abgedeckt sind AK1
// (ein Dokument, richtige Reihenfolge, ohne sichtbare Naht), AK2 (Katalog
// gilt, solange er stimmt, sonst neu aus den Dateien) und AK3 (ohne Katalog
// allein aus den Dateien).
import { describe, it, expect } from 'vitest';
import {
  PARTS_CATALOG_SCHEMA_VERSION,
  orderPartFiles,
  assembleParts,
  buildCatalog,
  catalogAgrees,
  partInfoOf,
  getCatalog,
  setCatalog,
} from '../../src/shared/document-assembly.js';
import {
  parseContainer,
  serializeContainer,
  emptyContainer,
} from '../../src/main/documents/mdd-store.js';
import {
  PART_SEP,
  PART_INFIX,
  FIRST_PART_INDEX,
  writePartLine,
} from '../../src/shared/document-parts.js';

const SEP = PART_SEP;
const teil = (n) => `Notizen${SEP}${PART_INFIX}${String(n).padStart(5, '0')}`;

// Schlüssel-Funktion eines case-insensitiven Dateisystems (Windows, macOS).
const insensitiv = (s) => String(s).toLowerCase();

describe('document-assembly.js — Teile ordnen (AK1, AK3)', () => {
  it('führt die Kopf-Datei als Teil 1 und ordnet die Folgeteile aufsteigend', () => {
    const { parts, luecken, dubletten } = orderPartFiles('Notizen', [teil(3), teil(2), teil(4)]);
    expect(parts).toEqual([
      { index: 1, basename: 'Notizen' },
      { index: 2, basename: teil(2) },
      { index: 3, basename: teil(3) },
      { index: 4, basename: teil(4) },
    ]);
    expect(luecken).toEqual([]);
    expect(dubletten).toEqual([]);
  });

  it('kommt ohne Katalog aus — die Verzeichnis-Liste allein genügt (AK3)', () => {
    const { parts } = orderPartFiles('Notizen', [teil(2)]);
    expect(parts).toHaveLength(2);
    expect(parts[0].index).toBe(FIRST_PART_INDEX);
  });

  it('führt ein ungeteiltes Dokument als einzigen Teil', () => {
    const { parts, luecken } = orderPartFiles('Notizen', []);
    expect(parts).toEqual([{ index: 1, basename: 'Notizen' }]);
    expect(luecken).toEqual([]);
  });

  it('ignoriert fremde Dateien und Teile eines anderen Dokuments', () => {
    const { parts } = orderPartFiles('Notizen', [
      teil(2),
      `Anderes${SEP}${PART_INFIX}00002`,
      'Notizen-Entwurf',
      `Notizen${SEP}${PART_INFIX}0002`,
    ]);
    expect(parts.map((p) => p.index)).toEqual([1, 2]);
  });

  it('erhebt Lücken, ohne sie zu behandeln', () => {
    const { parts, luecken } = orderPartFiles('Notizen', [teil(2), teil(5)]);
    expect(parts.map((p) => p.index)).toEqual([1, 2, 5]);
    expect(luecken).toEqual([3, 4]);
  });

  it('erhebt Dubletten und nimmt den ersten Fund', () => {
    // Der reale Fall auf einem case-insensitiven Dateisystem: zwei Dateien,
    // deren Grundname sich nur in der Schreibweise unterscheidet, beide mit
    // derselben Position.
    const { parts, dubletten } = orderPartFiles(
      'Notizen',
      [teil(2), `notizen${SEP}${PART_INFIX}00002`],
      insensitiv,
    );
    expect(dubletten).toEqual([2]);
    expect(parts.map((p) => p.basename)).toEqual(['Notizen', teil(2)]);
  });

  it('prüft den Namensteil «part-» exakt, unabhängig vom Dateisystem', () => {
    // Die Schreibweise des Infix ist Teil der FORM des Namens, nicht der
    // Datei-Identität: Die Anwendung schreibt ihn immer klein. Eine Datei mit
    // abweichender Schreibweise ist ein Eingriff von außen und gilt als
    // gewöhnliches Dokument — behandelt wird das in Paket 4, nicht hier.
    const gross = `Notizen${SEP}PART-00002`;
    expect(orderPartFiles('Notizen', [gross]).parts).toHaveLength(1);
    expect(orderPartFiles('Notizen', [gross], insensitiv).parts).toHaveLength(1);
  });

  it('reicht die Namen unverändert durch, auch in abweichender Schreibweise', () => {
    // Auf einem case-insensitiven Dateisystem darf die reale Schreibweise von
    // der erwarteten abweichen; geöffnet werden muss die reale Datei.
    const real = `notizen${SEP}${PART_INFIX}00002`;
    const { parts } = orderPartFiles('Notizen', [real], insensitiv);
    expect(parts[1].basename).toBe(real);
  });

  it('folgt dem Dateisystem: case-sensitiv findet den fremd geschriebenen Teil nicht', () => {
    // Die Grenze zwischen Datei-Identität und logischem Namensraum (4T-1275,
    // Epic 3E-0232): Hier geht es um Datei-Identität, also entscheidet das
    // Dateisystem und nicht die Wiki-Faltung.
    const real = `notizen${SEP}${PART_INFIX}00002`;
    expect(orderPartFiles('Notizen', [real]).parts).toHaveLength(1);
    expect(orderPartFiles('Notizen', [real], insensitiv).parts).toHaveLength(2);
  });
});

describe('document-assembly.js — Teile zusammensetzen (AK1)', () => {
  it('hängt die Rümpfe ohne Naht aneinander und behält den Kopf vollständig', () => {
    const kopf = '---\ntitle: Notizen\ndoc-part: v1|1|Notizen\n---\n\n# Notizen\n\nAnfang.\n';
    const zwei = '---\ndoc-part: v1|2|Notizen\n---\n## Mitte\n\nText.\n';
    const drei = '---\ndoc-part: v1|3|Notizen\n---\n## Ende\n\nSchluss.\n';
    const { text } = assembleParts([
      { index: 1, content: kopf },
      { index: 2, content: zwei },
      { index: 3, content: drei },
    ]);
    expect(text).toBe(
      '---\ntitle: Notizen\ndoc-part: v1|1|Notizen\n---\n\n# Notizen\n\nAnfang.\n' +
        '## Mitte\n\nText.\n' +
        '## Ende\n\nSchluss.\n',
    );
  });

  it('lässt im Ergebnis keinen technischen Kopf der Folgeteile stehen', () => {
    const { text } = assembleParts([
      { index: 1, content: '# Notizen\n\nAnfang.\n' },
      { index: 2, content: '---\ndoc-part: v1|2|Notizen\n---\n## Mitte\n' },
    ]);
    expect(text).not.toContain('doc-part');
    expect(text).not.toContain('---');
  });

  it('behält die Zuordnungs-Zeile der Kopf-Datei als sichtbare Spur', () => {
    // Festlegung F6: Der Anwender soll erkennen können, dass sein Dokument
    // geteilt ist. Der Kopf geht deshalb unverändert ein.
    const kopf = writePartLine('# Notizen\n', { index: 1, base: 'Notizen' }).text;
    const { text } = assembleParts([{ index: 1, content: kopf }]);
    expect(text).toBe(kopf);
    expect(partInfoOf(text)).toEqual({ schemaVersion: 1, index: 1, base: 'Notizen' });
  });

  it('setzt ein ungeteiltes Dokument unverändert zusammen', () => {
    const nur = '# Notizen\n\nText.\n';
    expect(assembleParts([{ index: 1, content: nur }]).text).toBe(nur);
  });

  it('ist die Umkehrung des Zerlegens: Kopf plus Rümpfe ergeben den Ausgangstext', () => {
    // Die Eigenschaft, an der die Zerlegung (Paket 3) sich auszurichten hat.
    const original = '---\ntitle: N\n---\n\n# A\n\neins\n## B\n\nzwei\n## C\n\ndrei\n';
    const schnitt1 = original.indexOf('## B');
    const schnitt2 = original.indexOf('## C');
    const kopf = original.slice(0, schnitt1);
    const rumpf2 = original.slice(schnitt1, schnitt2);
    const rumpf3 = original.slice(schnitt2);
    const zwei = writePartLine(rumpf2, { index: 2, base: 'N' });
    const drei = writePartLine(rumpf3, { index: 3, base: 'N' });
    expect(zwei.ok && drei.ok).toBe(true);
    const { text } = assembleParts([
      { index: 1, content: kopf },
      { index: 2, content: zwei.text },
      { index: 3, content: drei.text },
    ]);
    expect(text).toBe(original);
  });

  it('verträgt fehlenden und leeren Inhalt, ohne zu werfen', () => {
    expect(assembleParts([]).text).toBe('');
    expect(assembleParts(null).text).toBe('');
    expect(assembleParts([{ index: 1, content: null }]).text).toBe('');
  });
});

describe('document-assembly.js — Katalog als Beschleuniger (AK2)', () => {
  const parts = [
    { index: 1, basename: 'Notizen' },
    { index: 2, basename: teil(2) },
  ];

  it('baut den Katalog aus den geordneten Teilen', () => {
    const katalog = buildCatalog('Notizen', parts);
    expect(katalog).toEqual({
      schemaVersion: PARTS_CATALOG_SCHEMA_VERSION,
      base: 'Notizen',
      parts: [
        { index: 1, basename: 'Notizen' },
        { index: 2, basename: teil(2) },
      ],
    });
  });

  it('trägt keine Inhalte — der Cache hält nie eine zweite Wahrheit', () => {
    const katalog = buildCatalog('Notizen', [{ index: 1, basename: 'Notizen', content: 'X' }]);
    expect(katalog.parts[0]).toEqual({ index: 1, basename: 'Notizen' });
    expect(JSON.stringify(katalog)).not.toContain('content');
  });

  it('gilt, solange er mit den Dateien übereinstimmt', () => {
    expect(catalogAgrees(buildCatalog('Notizen', parts), 'Notizen', parts)).toBe(true);
  });

  it('wird verworfen, wenn ein Teil hinzugekommen oder weggefallen ist', () => {
    const katalog = buildCatalog('Notizen', parts);
    const mehr = [...parts, { index: 3, basename: teil(3) }];
    expect(catalogAgrees(katalog, 'Notizen', mehr)).toBe(false);
    expect(catalogAgrees(katalog, 'Notizen', [parts[0]])).toBe(false);
  });

  it('wird verworfen, wenn Position oder Name abweichen', () => {
    const katalog = buildCatalog('Notizen', parts);
    expect(catalogAgrees(katalog, 'Notizen', [parts[0], { index: 5, basename: teil(2) }])).toBe(
      false,
    );
    expect(catalogAgrees(katalog, 'Notizen', [parts[0], { index: 2, basename: teil(9) }])).toBe(
      false,
    );
  });

  it('wird verworfen, wenn er zu einem anderen Dokument gehört', () => {
    expect(catalogAgrees(buildCatalog('Anderes', parts), 'Notizen', parts)).toBe(false);
  });

  it('wird bei fremder, fehlender oder defekter Schema-Version verworfen, nicht als Fehler behandelt', () => {
    const katalog = buildCatalog('Notizen', parts);
    expect(catalogAgrees({ ...katalog, schemaVersion: 99 }, 'Notizen', parts)).toBe(false);
    expect(catalogAgrees({ ...katalog, schemaVersion: undefined }, 'Notizen', parts)).toBe(false);
    expect(catalogAgrees({ ...katalog, parts: 'kaputt' }, 'Notizen', parts)).toBe(false);
    expect(catalogAgrees(null, 'Notizen', parts)).toBe(false);
    expect(catalogAgrees('kaputt', 'Notizen', parts)).toBe(false);
    expect(catalogAgrees([], 'Notizen', parts)).toBe(false);
  });

  it('folgt beim Namens-Vergleich dem Dateisystem', () => {
    const katalog = buildCatalog('Notizen', parts);
    const andersGeschrieben = [
      { index: 1, basename: 'notizen' },
      { index: 2, basename: teil(2).toLowerCase() },
    ];
    expect(catalogAgrees(katalog, 'Notizen', andersGeschrieben)).toBe(false);
    expect(catalogAgrees(katalog, 'Notizen', andersGeschrieben, insensitiv)).toBe(true);
  });
});

describe('document-assembly.js — Katalog in der Begleitdatei (AK2, AK3)', () => {
  const parts = [
    { index: 1, basename: 'Notizen' },
    { index: 2, basename: teil(2) },
  ];

  it('überlebt den Weg durch den Container der Begleitdatei', () => {
    // Der Container reicht ihm unbekannte Sektionen bauartbedingt durch; genau
    // darauf ruht die Entscheidung, den Katalog hier statt in mdd-store.js zu
    // führen. Der Test belegt die Zusicherung, statt sie zu glauben.
    const container = setCatalog(emptyContainer(), buildCatalog('Notizen', parts));
    const gelesen = parseContainer(serializeContainer(container));
    expect(gelesen.ok).toBe(true);
    expect(getCatalog(gelesen.container)).toEqual(buildCatalog('Notizen', parts));
    expect(gelesen.container.history).toBeTruthy();
  });

  it('entfernt die Sektion bei null und lässt den übrigen Container stehen', () => {
    const container = setCatalog(emptyContainer(), buildCatalog('Notizen', parts));
    setCatalog(container, null);
    expect(getCatalog(container)).toBeNull();
    expect('parts' in container).toBe(false);
    expect(parseContainer(serializeContainer(container)).ok).toBe(true);
  });

  it('setzt bei fehlender oder defekter Sektion nur den Katalog aus, nie den Container', () => {
    expect(getCatalog(emptyContainer())).toBeNull();
    expect(getCatalog(null)).toBeNull();
    expect(getCatalog({ parts: 'kaputt' })).toBeNull();
    expect(getCatalog({ parts: [] })).toBeNull();
    expect(getCatalog({ parts: { schemaVersion: 99, base: 'N', parts: [] } })).toBeNull();
    expect(getCatalog({ parts: { schemaVersion: 1, base: '', parts: [] } })).toBeNull();
    expect(getCatalog({ parts: { schemaVersion: 1, base: 'N' } })).toBeNull();
    const defekt = { ...emptyContainer(), parts: 'kaputt' };
    expect(parseContainer(serializeContainer(defekt)).ok).toBe(true);
  });
});
