// 4T-001290 (Epic 3E-000224): Tests der Datei-Ebene des Lese-Wegs geteilter
// Dokumente (src/main/documents/document-parts-io.js). Geprüft wird am realen
// Dateisystem über eine Wegwerf-Wurzel, weil genau das Zusammenspiel von
// Verzeichnis-Durchlauf, Begleitdatei und Zusammensetzen der Gegenstand ist;
// die reine Logik prüft test/unit/document-assembly.test.js ohne Dateisystem.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readAssembledDocument,
  readCatalog,
  mddPathFor,
} from '../../src/main/documents/document-parts-io.js';
import { writePartLine, PART_SEP, PART_INFIX } from '../../src/shared/document-parts.js';
import { emptyContainer, serializeContainer } from '../../src/main/documents/mdd-store.js';

const wurzeln = [];

function wegwerfWurzel() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'teile-'));
  wurzeln.push(w);
  return w;
}

afterAll(() => {
  for (const w of wurzeln) fs.rmSync(w, { recursive: true, force: true });
});

const teilName = (grund, n) => `${grund}${PART_SEP}${PART_INFIX}${String(n).padStart(5, '0')}`;

// Legt ein geteiltes Dokument an und liefert Wurzel und Kopf-Pfad.
// `rumpfe[0]` ist der Kopf-Inhalt, die weiteren sind die Rümpfe der Folgeteile.
function legeGeteiltesDokument(grund, rumpfe, { mitBegleitdatei = true } = {}) {
  const w = wegwerfWurzel();
  const kopfPfad = path.join(w, `${grund}.md`);
  fs.writeFileSync(kopfPfad, writePartLine(rumpfe[0], { index: 1, base: grund }).text, 'utf8');
  for (let i = 1; i < rumpfe.length; i++) {
    fs.writeFileSync(
      path.join(w, `${teilName(grund, i + 1)}.md`),
      writePartLine(rumpfe[i], { index: i + 1, base: grund }).text,
      'utf8',
    );
  }
  if (mitBegleitdatei) {
    fs.writeFileSync(mddPathFor(kopfPfad), serializeContainer(emptyContainer()), 'utf8');
  }
  return { w, kopfPfad };
}

const lies = (p) => fs.readFileSync(p, 'utf8');

describe('document-parts-io: ungeteiltes Dokument', () => {
  it('reicht den Inhalt unverändert durch', async () => {
    const w = wegwerfWurzel();
    const p = path.join(w, 'Schlicht.md');
    const text = '# Schlicht\n\nNur ein Dokument.\n';
    fs.writeFileSync(p, text, 'utf8');
    const r = await readAssembledDocument(p, text);
    expect(r.ok).toBe(true);
    expect(r.geteilt).toBe(false);
    expect(r.text).toBe(text);
    expect(r.path).toBe(p);
  });

  it('legt für ein ungeteiltes Dokument keine Begleitdatei an', async () => {
    // Der Regelfall darf nichts kosten: kein Verzeichnis-Durchlauf, kein
    // Schreiben. Prüfbar am ausbleibenden Nebeneffekt.
    const w = wegwerfWurzel();
    const p = path.join(w, 'Schlicht.md');
    fs.writeFileSync(p, '# Schlicht\n', 'utf8');
    await readAssembledDocument(p, '# Schlicht\n');
    expect(fs.existsSync(mddPathFor(p))).toBe(false);
  });

  it('behandelt ein Dokument mit gewöhnlichem Frontmatter als ungeteilt', async () => {
    const w = wegwerfWurzel();
    const p = path.join(w, 'Mit-Kopf.md');
    const text = '---\ntitle: Mit Kopf\n---\n\n# Mit Kopf\n';
    fs.writeFileSync(p, text, 'utf8');
    const r = await readAssembledDocument(p, text);
    expect(r.geteilt).toBe(false);
    expect(r.text).toBe(text);
  });
});

describe('document-parts-io: geteiltes Dokument zusammensetzen (AK1)', () => {
  it('öffnet drei Teile als ein Dokument in der richtigen Reihenfolge', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
      '## Drei\n\ndrei\n',
    ]);
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.ok).toBe(true);
    expect(r.geteilt).toBe(true);
    expect(r.parts.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(r.text).toContain('eins');
    expect(r.text.indexOf('eins')).toBeLessThan(r.text.indexOf('zwei'));
    expect(r.text.indexOf('zwei')).toBeLessThan(r.text.indexOf('drei'));
  });

  it('lässt keinen technischen Kopf der Folgeteile im Ergebnis stehen', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    // Genau eine Zuordnungs-Zeile im ganzen Dokument: die des Kopfes.
    expect(r.text.match(/doc-part/g)).toHaveLength(1);
    expect(r.text.indexOf('doc-part')).toBeLessThan(r.text.indexOf('eins'));
  });

  it('liefert beim Öffnen eines Folgeteils das Gesamt-Dokument und den Pfad des Kopfes', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    const teilPfad = path.join(w, `${teilName('Notizen', 2)}.md`);
    const r = await readAssembledDocument(teilPfad, lies(teilPfad));
    expect(r.ok).toBe(true);
    expect(r.path).toBe(kopfPfad);
    expect(r.text).toContain('eins');
    expect(r.text).toContain('zwei');
  });

  it('erhebt eine Lücke in der Mitte und öffnet trotzdem', async () => {
    // Erhoben, nicht behandelt: Was bei einem fehlenden Teil geschieht
    // (nur-lesend öffnen mit Angabe des fehlenden Teils), entscheidet Paket 4.
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
      '## Drei\n\ndrei\n',
    ]);
    const inhalt = lies(kopfPfad);
    fs.rmSync(path.join(w, `${teilName('Notizen', 2)}.md`));
    const r = await readAssembledDocument(kopfPfad, inhalt);
    expect(r.ok).toBe(true);
    expect(r.luecken).toEqual([2]);
    expect(r.text).toContain('drei');
    expect(r.text).not.toContain('zwei');
  });

  it('erkennt einen fehlenden LETZTEN Teil nicht — belegte Grenze für Paket 4', async () => {
    // Aus dem Verzeichnis allein ist dieser Fall nicht erkennbar: Keine Datei
    // kennt die Soll-Anzahl der Teile, und die Zuordnungs-Zeile trägt sie
    // bewusst nicht — sie müsste sonst bei jedem neuen Teil in allen
    // bestehenden Teilen nachgezogen werden, also genau das Rebalancing, das
    // die Ablage-Regeln ausschließen. Der einzige Anhaltspunkt ist der
    // Katalog, der hier aber Cache ist und bei Widerspruch verworfen wird.
    // Der Test hält die Grenze fest, statt sie zu verdecken; ihre Auflösung
    // gehört zu 4T-001292 und braucht eine Entscheidung des Product Owners.
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    const inhalt = lies(kopfPfad);
    fs.rmSync(path.join(w, `${teilName('Notizen', 2)}.md`));
    const r = await readAssembledDocument(kopfPfad, inhalt);
    expect(r.ok).toBe(true);
    expect(r.luecken).toEqual([]);
    expect(r.parts).toHaveLength(1);
  });

  it('nimmt einen gleichnamigen Ordner nicht für einen Teil', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    const teilPfad = path.join(w, `${teilName('Notizen', 2)}.md`);
    fs.rmSync(teilPfad);
    fs.mkdirSync(teilPfad);
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.ok).toBe(true);
    expect(r.parts).toHaveLength(1);
  });

  it('ignoriert Teile eines anderen Dokuments im selben Ordner', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    fs.writeFileSync(
      path.join(w, `${teilName('Anderes', 2)}.md`),
      writePartLine('## Fremd\n\nfremd\n', { index: 2, base: 'Anderes' }).text,
      'utf8',
    );
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.parts.map((p) => p.index)).toEqual([1, 2]);
    expect(r.text).not.toContain('fremd');
  });
});

describe('document-parts-io: Katalog als Beschleuniger (AK2, AK3)', () => {
  it('baut den Katalog beim ersten Öffnen auf und schreibt ihn in die Begleitdatei', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    expect(await readCatalog(kopfPfad)).toBeNull();
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.katalogGenutzt).toBe(false);
    const katalog = await readCatalog(kopfPfad);
    expect(katalog.base).toBe('Notizen');
    expect(katalog.parts.map((p) => p.index)).toEqual([1, 2]);
  });

  it('nutzt den Katalog beim zweiten Öffnen unverändert', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    const zweite = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(zweite.katalogGenutzt).toBe(true);
    expect(zweite.text).toBe((await readAssembledDocument(kopfPfad, lies(kopfPfad))).text);
  });

  it('verwirft einen widersprechenden Katalog und baut ihn neu (AK2)', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    // Ein dritter Teil kommt von außen dazu: der Katalog stimmt nicht mehr.
    fs.writeFileSync(
      path.join(w, `${teilName('Notizen', 3)}.md`),
      writePartLine('## Drei\n\ndrei\n', { index: 3, base: 'Notizen' }).text,
      'utf8',
    );
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.katalogGenutzt).toBe(false);
    expect(r.text).toContain('drei');
    expect((await readCatalog(kopfPfad)).parts.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it('setzt das Dokument ohne Begleitdatei allein aus den Dateien zusammen (AK3)', async () => {
    const { kopfPfad } = legeGeteiltesDokument(
      'Notizen',
      ['# Notizen\n\neins\n', '## Zwei\n\nzwei\n'],
      { mitBegleitdatei: false },
    );
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.ok).toBe(true);
    expect(r.text).toContain('eins');
    expect(r.text).toContain('zwei');
    // Für einen reinen Cache wird keine Begleitdatei angelegt.
    expect(fs.existsSync(mddPathFor(kopfPfad))).toBe(false);
  });

  it('überschreibt eine defekte Begleitdatei nicht', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    const kaputt = '{ das ist kein JSON';
    fs.writeFileSync(mddPathFor(kopfPfad), kaputt, 'utf8');
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.ok).toBe(true);
    expect(r.text).toContain('zwei');
    expect(lies(mddPathFor(kopfPfad))).toBe(kaputt);
  });

  it('lässt die Historie der Begleitdatei unangetastet', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    const vorher = JSON.parse(lies(mddPathFor(kopfPfad)));
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    const nachher = JSON.parse(lies(mddPathFor(kopfPfad)));
    expect(nachher.history).toEqual(vorher.history);
    expect(nachher.schemaVersion).toBe(vorher.schemaVersion);
    expect(nachher.parts).toBeTruthy();
  });

  it('meldet dem Selbstschreib-Schutz, dass die Begleitdatei von uns kommt', async () => {
    const gemeldet = [];
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Notizen\n\neins\n',
      '## Zwei\n\nzwei\n',
    ]);
    await readAssembledDocument(kopfPfad, lies(kopfPfad), {
      markSelfWriting: (p, inhalt) => gemeldet.push({ p, inhalt }),
    });
    expect(gemeldet).toHaveLength(1);
    expect(gemeldet[0].p).toBe(mddPathFor(kopfPfad));
    expect(gemeldet[0].inhalt).toBe(lies(mddPathFor(kopfPfad)));
  });
});
