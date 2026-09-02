// 4T-001291/4T-001292/4T-001293 (Epic 3E-000224): Tests der Datei-Ebene des
// SCHREIB-Wegs geteilter Dokumente
// (src/main/documents/document-parts-io.js): Vergleichsstand des
// Konflikt-Schutzes, Schreiben der Teile, Abbruch mittendrin, fehlender und
// von aussen geaenderter Teil, Umbenennen-Kaskade und Wiedervereinen. Geprüft wird am realen
// Dateisystem über eine Wegwerf-Wurzel, weil genau das Zusammenspiel von
// Verzeichnis-Durchlauf, Begleitdatei und Zusammensetzen der Gegenstand ist;
// die reine Logik prüft test/unit/document-split.test.js ohne Dateisystem.
//
// Geschnitten von document-parts-io.test.js am 2026-08-31 (4T-001293), als jene
// Datei ihr Zeilen-Budget erreichte. Der Schnitt folgt der Fachlichkeit: dort
// das Lesen, hier das Schreiben — dieselbe Grenze wie zwischen den Paketen 2
// und 3 des Epics.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readAssembledDocument,
  readStateForSave,
  writeDocumentParts,
  readCatalog,
  mddPathFor,
  scanOwnParts,
  rewritePartBase,
  rejoinDocument,
} from '../../src/main/documents/document-parts-io.js';
import {
  writePartLine,
  readPartLine,
  isPartBasename,
  PART_SEP,
  PART_INFIX,
} from '../../src/shared/document-parts.js';
import { SUBPAGE_SEP, childPrefix } from '../../src/shared/subpages.js';
import { emptyContainer, serializeContainer } from '../../src/main/documents/mdd-store.js';
import { planeZerlegung, schreibReihenfolge } from '../../src/shared/document-split.js';
import { assembleParts } from '../../src/shared/document-assembly.js';

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

// Kleine Schwelle für die Tests: Die echte liegt bei 1 MB, und ein Dokument
// dieser Größe je Prüffall aufzubauen kostete Laufzeit ohne Erkenntnis.
const KLEIN = 100;

// Baut einen Abschnitt mit eindeutigem Marker, an dem sich Verlust zeigt.
function abschnitt(marke, fuellung) {
  return `# ${marke}\n${marke.toLowerCase().repeat(fuellung)}\n`;
}

describe('document-parts-io: Vergleichsstand des Schreib-Wegs (B3)', () => {
  it('liefert bei einem ungeteilten Dokument seinen Inhalt', async () => {
    const w = wegwerfWurzel();
    const p = path.join(w, 'Einfach.md');
    fs.writeFileSync(p, '# Titel\nText\n', 'utf8');
    const stand = await readStateForSave(p);
    expect(stand.ok).toBe(true);
    expect(stand.geteilt).toBe(false);
    expect(stand.text).toBe('# Titel\nText\n');
    expect(stand.basisName).toBe('Einfach');
  });

  it('liefert bei einem geteilten Dokument den ZUSAMMENGESETZTEN Stand, nicht die Kopf-Datei', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const stand = await readStateForSave(kopfPfad);
    expect(stand.ok).toBe(true);
    expect(stand.geteilt).toBe(true);
    expect(stand.text).toContain('# Eins');
    expect(stand.text).toContain('# Zwei');
    expect(stand.teile).toHaveLength(2);
    // Genau das ist die Voraussetzung des Konflikt-Schutzes: Der Reiter haelt
    // den Gesamt-Text, und gegen die Kopf-Datei allein verglichen meldete jedes
    // Speichern einen Konflikt, den es nicht gibt.
    expect(stand.text).not.toBe(lies(kopfPfad));
  });

  it('meldet eine fehlende Datei als ENOENT statt als Fehler', async () => {
    const w = wegwerfWurzel();
    const stand = await readStateForSave(path.join(w, 'Fehlt.md'));
    expect(stand.ok).toBe(false);
    expect(stand.code).toBe('ENOENT');
  });

  it('legt beim Lesen fuer das Speichern keinen Katalog an', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const vorher = lies(mddPathFor(kopfPfad));
    await readStateForSave(kopfPfad);
    expect(lies(mddPathFor(kopfPfad))).toBe(vorher);
  });
});

describe('document-parts-io: Teile schreiben (B2, AK1)', () => {
  it('schreibt nur die geaenderten Teile und legt neue an', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const stand = await readStateForSave(kopfPfad);
    const zweiterPfad = path.join(w, `${teilName('Notizen', 2)}.md`);
    const vorherZwei = lies(zweiterPfad);
    const plan = planeZerlegung({
      text: stand.text.replace('# Eins\nA\n', '# Eins\nA geaendert\n'),
      base: 'Notizen',
      schwelle: KLEIN,
      bestand: stand.teile,
    });
    const res = await writeDocumentParts(kopfPfad, plan.teile);
    expect(res.ok).toBe(true);
    expect(res.geschrieben).toEqual([kopfPfad]);
    expect(lies(kopfPfad)).toContain('A geaendert');
    expect(lies(zweiterPfad)).toBe(vorherZwei);
  });

  it('meldet jeden Schreibvorgang als eigenen (kein fremder Watcher-Alarm)', async () => {
    const w = wegwerfWurzel();
    const kopfPfad = path.join(w, 'Gross.md');
    const text = abschnitt('Eins', 40) + abschnitt('Zwei', 40) + abschnitt('Drei', 40);
    fs.writeFileSync(kopfPfad, text, 'utf8');
    fs.writeFileSync(mddPathFor(kopfPfad), serializeContainer(emptyContainer()), 'utf8');
    const plan = planeZerlegung({ text, base: 'Gross', schwelle: KLEIN });
    const gemeldet = [];
    await writeDocumentParts(kopfPfad, plan.teile, {
      markSelfWriting: (p, inhalt) => gemeldet.push({ p, inhalt }),
    });
    // Jede geschriebene Datei ist gemeldet, dazu die Begleitdatei mit Katalog.
    const pfade = gemeldet.map((g) => g.p);
    for (const teil of plan.teile) {
      expect(pfade.some((p) => p.includes(teil.basename))).toBe(true);
    }
    expect(pfade).toContain(mddPathFor(kopfPfad));
  });

  it('schreibt den Katalog in die Begleitdatei des ersten Teils', async () => {
    const w = wegwerfWurzel();
    const kopfPfad = path.join(w, 'Gross.md');
    const text = abschnitt('Eins', 40) + abschnitt('Zwei', 40) + abschnitt('Drei', 40);
    fs.writeFileSync(kopfPfad, text, 'utf8');
    fs.writeFileSync(mddPathFor(kopfPfad), serializeContainer(emptyContainer()), 'utf8');
    const plan = planeZerlegung({ text, base: 'Gross', schwelle: KLEIN });
    await writeDocumentParts(kopfPfad, plan.teile);
    const katalog = await readCatalog(kopfPfad);
    expect(katalog).not.toBeNull();
    expect(katalog.parts.map((p) => p.index)).toEqual(plan.teile.map((t) => t.index));
  });

  it('ergibt nach dem Schreiben beim Lesen wieder genau den geschriebenen Stand', async () => {
    const w = wegwerfWurzel();
    const kopfPfad = path.join(w, 'Gross.md');
    const text = abschnitt('Eins', 40) + abschnitt('Zwei', 40) + abschnitt('Drei', 40);
    fs.writeFileSync(kopfPfad, text, 'utf8');
    fs.writeFileSync(mddPathFor(kopfPfad), serializeContainer(emptyContainer()), 'utf8');
    const plan = planeZerlegung({ text, base: 'Gross', schwelle: KLEIN });
    await writeDocumentParts(kopfPfad, plan.teile);
    const gelesen = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    const erwartet = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(gelesen.ok).toBe(true);
    expect(gelesen.geteilt).toBe(true);
    expect(gelesen.text).toBe(erwartet);
  });
});

describe('document-parts-io: Abbruch mitten im Schreiben (AK6)', () => {
  // Es gibt keine Reihenfolge, die zwei Dateien atomar schreibt. Die Zusage
  // ist deshalb schwaecher und dafuer haltbar: Ein Abbruch hinterlaesst nie
  // einen Zustand, in dem Inhalt verloren ist — schlimmstenfalls steht ein
  // Abschnitt doppelt da. Geprueft wird, indem der Abbruch nach JEDEM
  // einzelnen Schreibschritt gezielt herbeigefuehrt wird.
  //
  // Traegt die Kopf-Datei ihre Zuordnungs-Zeile noch nicht, gilt das Dokument
  // als ungeteilt und der Anwender sieht schlicht seinen alten vollstaendigen
  // Text. Das ist der Grund, warum die Kopf-Datei bei der Erstzerlegung
  // zuletzt geschrieben wird: Sie ist der Schalter, der die Teilung einlegt.
  async function pruefeJedenAbbruch(kopfPfad, plan) {
    const dir = path.dirname(kopfPfad);
    const pfadVon = (t) => t.pfad || path.join(dir, `${t.basename}.md`);
    // Ausgangszustand jeder beteiligten Datei merken; null heisst «gibt es noch
    // nicht». Damit laesst sich vor jedem Durchlauf exakt zuruecksetzen.
    const ausgang = new Map();
    for (const t of plan.teile) {
      const p = pfadVon(t);
      ausgang.set(p, fs.existsSync(p) ? lies(p) : null);
    }
    const altText = (await readAssembledDocument(kopfPfad, lies(kopfPfad))).text;
    const neuText = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    // Geprueft wird an den Abschnitts-Marken, die in BEIDEN Staenden vorkommen:
    // Was der Anwender geloescht hat, darf fehlen — alles andere nie.
    const marken = [...altText.matchAll(/^# (\w+)$/gm)]
      .map((m) => m[1])
      .filter((m) => neuText.includes(`# ${m}`));
    expect(marken.length).toBeGreaterThan(1);

    const zuSchreiben = schreibReihenfolge(plan.teile).filter((t) => t.geaendert);
    for (let k = 1; k <= zuSchreiben.length; k++) {
      for (const [p, inhalt] of ausgang) {
        if (inhalt === null) {
          if (fs.existsSync(p)) fs.rmSync(p);
        } else {
          fs.writeFileSync(p, inhalt, 'utf8');
        }
      }
      for (let i = 0; i < k; i++) {
        fs.writeFileSync(pfadVon(zuSchreiben[i]), zuSchreiben[i].text, 'utf8');
      }
      const gelesen = await readAssembledDocument(kopfPfad, lies(kopfPfad));
      expect(gelesen.ok).toBe(true);
      for (const marke of marken) {
        expect(gelesen.text).toContain(`# ${marke}`);
      }
    }
  }

  it('verliert bei der Erstzerlegung nach keinem Schritt Inhalt', async () => {
    const w = wegwerfWurzel();
    const kopfPfad = path.join(w, 'Gross.md');
    const text = abschnitt('Eins', 40) + abschnitt('Zwei', 40) + abschnitt('Drei', 40);
    fs.writeFileSync(kopfPfad, text, 'utf8');
    const plan = planeZerlegung({ text, base: 'Gross', schwelle: KLEIN });
    expect(plan.teile.filter((t) => t.geaendert).length).toBeGreaterThan(1);
    await pruefeJedenAbbruch(kopfPfad, plan);
  });

  it('verliert beim Anfuegen eines weiteren Teils nach keinem Schritt Inhalt', async () => {
    const w = wegwerfWurzel();
    const kopfPfad = path.join(w, 'Gross.md');
    const text = abschnitt('Eins', 40) + abschnitt('Zwei', 40) + abschnitt('Drei', 40);
    fs.writeFileSync(kopfPfad, text, 'utf8');
    const erst = planeZerlegung({ text, base: 'Gross', schwelle: KLEIN });
    await writeDocumentParts(kopfPfad, erst.teile);
    const stand = await readStateForSave(kopfPfad);
    const gewachsen = stand.text + abschnitt('Vier', 40) + abschnitt('Fuenf', 40);
    const plan = planeZerlegung({
      text: gewachsen,
      base: 'Gross',
      schwelle: KLEIN,
      bestand: stand.teile,
    });
    expect(plan.teile.filter((t) => t.geaendert).length).toBeGreaterThan(1);
    await pruefeJedenAbbruch(kopfPfad, plan);
  });
});

describe('document-parts-io: von aussen geaenderter Teil (4T-001292 AK2)', () => {
  it('sieht die Aenderung an einem FOLGETEIL im Vergleichsstand', async () => {
    // Der Konflikt-Schutz vergleicht den erwarteten Stand des Reiters gegen
    // den Platten-Stand. Weil dieser seit 4T-001291 der zusammengesetzte Stand
    // ALLER Teile ist, schlaegt er auch bei einer Aenderung an einem
    // Folgeteil an — die Ausweitung aus O8 faellt damit an der Stelle an, an
    // der der Vergleichsstand gebildet wird, und nicht als eigener Mechanismus.
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const vorher = await readStateForSave(kopfPfad);
    const zweiterPfad = path.join(w, `${teilName('Notizen', 2)}.md`);
    fs.writeFileSync(
      zweiterPfad,
      writePartLine('# Zwei\nB von aussen geaendert\n', { index: 2, base: 'Notizen' }).text,
      'utf8',
    );
    const nachher = await readStateForSave(kopfPfad);
    expect(nachher.text).not.toBe(vorher.text);
    expect(nachher.text).toContain('von aussen geaendert');
  });

  it('meldet einen fehlenden Teil in der MITTE beim Lesen fuer das Speichern', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Eins\nA\n',
      '# Zwei\nB\n',
      '# Drei\nC\n',
    ]);
    fs.rmSync(path.join(w, `${teilName('Notizen', 2)}.md`));
    const stand = await readStateForSave(kopfPfad);
    // Der Teil fehlt, das Lesen gelingt trotzdem — die Luecke wird erhoben,
    // ihre Behandlung entscheidet 4T-001292.
    expect(stand.ok).toBe(true);
    expect(stand.text).not.toContain('# Zwei');
  });
});

describe('document-parts-io: fehlender Teil (4T-001292 AK1, Option A)', () => {
  // Legt ein geteiltes Dokument an, schreibt seinen Katalog und entfernt
  // danach einen Teil. Genau so sieht es aus, wenn jemand ausserhalb der
  // Anwendung eine Datei loescht oder eine Synchronisation sie noch nicht
  // uebertragen hat.
  async function mitEntferntemTeil(anzahlTeile, entferne) {
    const rumpfe = [];
    for (let i = 1; i <= anzahlTeile; i++) rumpfe.push(`# Teil${i}\ninhalt${i}\n`);
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', rumpfe);
    // Katalog schreiben, wie es der Lese-Weg beim ersten Oeffnen tut.
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    fs.rmSync(path.join(w, `${teilName('Notizen', entferne)}.md`));
    return { w, kopfPfad };
  }

  it('erkennt einen fehlenden LETZTEN Teil am Katalog', async () => {
    const { kopfPfad } = await mitEntferntemTeil(3, 3);
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.ok).toBe(true);
    // Aus den Dateinamen allein waere nichts zu sehen: keine Luecke.
    expect(r.luecken).toEqual([]);
    // Der Katalog ist der Zeuge.
    expect(r.fehlend).toEqual([3]);
  });

  it('erkennt eine Luecke in der Mitte weiterhin ohne Katalog', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Eins\nA\n',
      '# Zwei\nB\n',
      '# Drei\nC\n',
    ]);
    fs.rmSync(path.join(w, `${teilName('Notizen', 2)}.md`));
    fs.rmSync(mddPathFor(kopfPfad));
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.fehlend).toEqual([2]);
  });

  it('ueberschreibt den Katalog NICHT, solange ein Teil vermisst wird', async () => {
    // Der kritische Punkt der Option A: Der Katalog ist der einzige Zeuge
    // dafuer, dass es den Teil je gab. Wuerde das Oeffnen ihn nachziehen,
    // saehe das Dokument beim ZWEITEN Oeffnen wieder vollstaendig aus, und
    // der Verlust waere endgueltig unsichtbar.
    const { kopfPfad } = await mitEntferntemTeil(3, 3);
    const katalogVorher = await readCatalog(kopfPfad);
    expect(katalogVorher.parts).toHaveLength(3);
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    const katalogNachher = await readCatalog(kopfPfad);
    expect(katalogNachher.parts).toHaveLength(3);
    // Und der Verdacht besteht auch beim zweiten Oeffnen fort.
    const zweitesMal = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(zweitesMal.fehlend).toEqual([3]);
  });

  it('sperrt das Speichern, solange ein Teil fehlt', async () => {
    const { kopfPfad } = await mitEntferntemTeil(3, 3);
    const stand = await readStateForSave(kopfPfad);
    expect(stand.ok).toBe(true);
    expect(stand.fehlend).toEqual([3]);
  });

  it('gibt den Reiter wieder frei, sobald der Teil zurueckliegt', async () => {
    const { w, kopfPfad } = await mitEntferntemTeil(3, 3);
    const wiederPfad = path.join(w, `${teilName('Notizen', 3)}.md`);
    fs.writeFileSync(
      wiederPfad,
      writePartLine('# Teil3\ninhalt3\n', { index: 3, base: 'Notizen' }).text,
      'utf8',
    );
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.fehlend).toEqual([]);
    expect(r.text).toContain('inhalt3');
  });

  it('meldet nichts, wenn der Katalog WENIGER Teile nennt als da sind', async () => {
    // Die Aussage geht nur in eine Richtung: Ein veralteter Katalog, dem ein
    // spaeter hinzugekommener Teil fehlt, ist kein Vermisstenfall, sondern
    // schlicht veraltet — und wird wie bisher verworfen und neu gebaut.
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    fs.writeFileSync(
      path.join(w, `${teilName('Notizen', 3)}.md`),
      writePartLine('# Drei\nC\n', { index: 3, base: 'Notizen' }).text,
      'utf8',
    );
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.fehlend).toEqual([]);
    expect(r.parts).toHaveLength(3);
    const katalog = await readCatalog(kopfPfad);
    expect(katalog.parts).toHaveLength(3);
  });

  it('meldet nichts bei einem ungeteilten Dokument', async () => {
    const w = wegwerfWurzel();
    const p = path.join(w, 'Schlicht.md');
    fs.writeFileSync(p, '# Schlicht\n', 'utf8');
    const r = await readAssembledDocument(p, '# Schlicht\n');
    expect(r.fehlend).toEqual([]);
  });
});

describe('document-parts-io: Umbenennen-Kaskade (4T-001292 AK3, AK4)', () => {
  it('findet die eigenen Folgeteile eines Dokuments', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Eins\nA\n',
      '# Zwei\nB\n',
      '# Drei\nC\n',
    ]);
    const teile = await scanOwnParts(kopfPfad);
    expect(teile).toHaveLength(2);
    expect(teile.every((p) => p.includes(PART_INFIX))).toBe(true);
    // Die Kopf-Datei selbst ist nicht dabei — der Aufrufer hat sie bereits.
    expect(teile.some((p) => p === kopfPfad)).toBe(false);
  });

  it('findet die Teile eines FREMDEN Dokuments im selben Ordner nicht', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    fs.writeFileSync(
      path.join(w, `${teilName('Anderes', 2)}.md`),
      writePartLine('# Fremd\n', { index: 2, base: 'Anderes' }).text,
      'utf8',
    );
    expect(await scanOwnParts(kopfPfad)).toHaveLength(1);
  });

  it('zieht die Zuordnungs-Zeile auf einen neuen Grundnamen nach, ohne die Position zu ruehren', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const teilPfad = path.join(w, `${teilName('Notizen', 2)}.md`);
    const res = await rewritePartBase([kopfPfad, teilPfad], 'Merkzettel');
    expect(res.ok).toBe(true);
    expect(res.geaendert).toBe(2);
    expect(readPartLine(lies(kopfPfad))).toEqual({
      schemaVersion: 1,
      index: 1,
      base: 'Merkzettel',
    });
    expect(readPartLine(lies(teilPfad))).toEqual({
      schemaVersion: 1,
      index: 2,
      base: 'Merkzettel',
    });
  });

  it('laesst eine Datei ohne Zuordnungs-Zeile unberuehrt', async () => {
    const w = wegwerfWurzel();
    const p = path.join(w, 'Gewoehnlich.md');
    const text = '# Gewoehnlich\n\nText\n';
    fs.writeFileSync(p, text, 'utf8');
    const res = await rewritePartBase([p], 'Egal');
    expect(res.ok).toBe(true);
    expect(res.geaendert).toBe(0);
    expect(lies(p)).toBe(text);
  });

  it('setzt ein umbenanntes Dokument danach wieder zusammen', async () => {
    // Die Probe aufs Ganze: umbenennen wie die Kaskade es tut, dann oeffnen.
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const neuerKopf = path.join(w, 'Merkzettel.md');
    const neuerTeil = path.join(w, `${teilName('Merkzettel', 2)}.md`);
    fs.renameSync(kopfPfad, neuerKopf);
    fs.renameSync(path.join(w, `${teilName('Notizen', 2)}.md`), neuerTeil);
    // Ueber die KOPF-DATEI oeffnet es schon ohne Nachzug vollstaendig: Sie
    // traegt Position 1 und gilt deshalb selbst als Kopf, und unter ihrem neuen
    // Namen findet sie ihre Teile.
    const ueberKopf = await readAssembledDocument(neuerKopf, lies(neuerKopf));
    expect(ueberKopf.ok).toBe(true);
    expect(ueberKopf.text).toContain('# Eins');
    expect(ueberKopf.text).toContain('# Zwei');
    // Ueber einen FOLGETEIL nicht: Seine Zuordnungs-Zeile nennt den alten
    // Grundnamen, und ein Folgeteil kann sich nicht selbst zum Kopf erklaeren.
    // Genau dafuer wird die Zeile nachgezogen — der Rueckfall ist ein Netz,
    // kein Ersatz.
    const ueberTeilVorher = await readAssembledDocument(neuerTeil, lies(neuerTeil));
    expect(ueberTeilVorher.ok).toBe(false);
    await rewritePartBase([neuerKopf, neuerTeil], 'Merkzettel');
    const ueberTeilNachher = await readAssembledDocument(neuerTeil, lies(neuerTeil));
    expect(ueberTeilNachher.ok).toBe(true);
    expect(ueberTeilNachher.path).toBe(neuerKopf);
    expect(ueberTeilNachher.text).toContain('# Eins');
    expect(ueberTeilNachher.text).toContain('# Zwei');
  });

  it('haelt einen Teil aus der Unterseiten-Anzeige heraus (AK4)', () => {
    // Der Filter der Anzeige greift am Namen. Der kritische Fall ist die
    // geteilte UNTERSEITE: Ihr Teil beginnt mit dem Unterseiten-Praefix der
    // Elternseite und faellt deshalb in deren Nachkommen-Liste, obwohl er kein
    // eigenes Dokument ist.
    const teilEinerUnterseite = `Prozess-A${SUBPAGE_SEP}Entwurf${PART_SEP}${PART_INFIX}00002`;
    const echteUnterseite = `Prozess-A${SUBPAGE_SEP}Entwurf`;
    expect(isPartBasename(teilEinerUnterseite)).toBe(true);
    expect(isPartBasename(echteUnterseite)).toBe(false);
    // Und die Elternseite wuerde ihn ohne Filter tatsaechlich einsammeln:
    const praefix = childPrefix('Prozess-A').normalize('NFC').toLowerCase();
    expect(teilEinerUnterseite.normalize('NFC').toLowerCase().startsWith(praefix)).toBe(true);
  });
});

describe('document-parts-io: von aussen umbenanntes Dokument (4T-001292)', () => {
  it('oeffnet die Kopf-Datei, auch wenn ihre Zuordnungs-Zeile auf den alten Namen zeigt', async () => {
    // Der Fall entsteht, wenn jemand ausserhalb der Anwendung umbenennt. Ohne
    // Rueckfall scheiterte das Oeffnen mit einem nackten Dateifehler auf einen
    // Namen, den der Anwender laengst geaendert hat.
    const w = wegwerfWurzel();
    const p = path.join(w, 'Neuer Name.md');
    fs.writeFileSync(
      p,
      writePartLine('# Inhalt\nText\n', { index: 1, base: 'Alter' }).text,
      'utf8',
    );
    const r = await readAssembledDocument(p, lies(p));
    expect(r.ok).toBe(true);
    expect(r.path).toBe(p);
    expect(r.text).toContain('# Inhalt');
  });

  it('findet die Teile wieder, sobald die Zuordnungs-Zeile nachgezogen ist', async () => {
    const w = wegwerfWurzel();
    const kopf = path.join(w, 'Neuer Name.md');
    const teil = path.join(w, `${teilName('Neuer Name', 2)}.md`);
    fs.writeFileSync(kopf, writePartLine('# Eins\nA\n', { index: 1, base: 'Alter' }).text, 'utf8');
    fs.writeFileSync(teil, writePartLine('# Zwei\nB\n', { index: 2, base: 'Alter' }).text, 'utf8');
    await rewritePartBase([kopf, teil], 'Neuer Name');
    const r = await readAssembledDocument(kopf, lies(kopf));
    expect(r.text).toContain('# Eins');
    expect(r.text).toContain('# Zwei');
  });

  it('bleibt bei einem FOLGETEIL ohne Kopf-Datei beim Fehler', async () => {
    // Hier hilft kein Rueckfall: Ein Folgeteil ist kein Dokument, und ohne
    // seine Kopf-Datei fehlt der Anfang des Textes. Das ist ein fehlender Teil
    // und wird als solcher gemeldet, statt ein Bruchstueck zu oeffnen.
    const w = wegwerfWurzel();
    const teil = path.join(w, `${teilName('Weg', 2)}.md`);
    fs.writeFileSync(teil, writePartLine('# Zwei\nB\n', { index: 2, base: 'Weg' }).text, 'utf8');
    const r = await readAssembledDocument(teil, lies(teil));
    expect(r.ok).toBe(false);
    expect(r.fehlenderTeil).toBe(1);
  });
});

describe('document-parts-io: Wiedervereinen (4T-001293 AK3, AK5)', () => {
  it('macht aus den Teilen wieder eine Datei und loescht die Folgeteile', async () => {
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Eins\nA\n',
      '# Zwei\nB\n',
      '# Drei\nC\n',
    ]);
    const res = await rejoinDocument(kopfPfad);
    expect(res.ok).toBe(true);
    expect(res.geloescht).toHaveLength(2);
    const text = lies(kopfPfad);
    expect(text).toContain('# Eins');
    expect(text).toContain('# Zwei');
    expect(text).toContain('# Drei');
    // Die Zuordnungs-Zeile ist fort: Das Dokument ist wieder ein gewoehnliches.
    expect(text).not.toContain('doc-part');
    expect(fs.existsSync(path.join(w, `${teilName('Notizen', 2)}.md`))).toBe(false);
    expect(fs.existsSync(path.join(w, `${teilName('Notizen', 3)}.md`))).toBe(false);
  });

  it('nimmt danach den Lese-Weg als ungeteiltes Dokument', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    await rejoinDocument(kopfPfad);
    const r = await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(r.geteilt).toBe(false);
    expect(r.text).toContain('# Zwei');
  });

  it('raeumt den Katalog aus der Begleitdatei', async () => {
    const { kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    expect(await readCatalog(kopfPfad)).not.toBeNull();
    await rejoinDocument(kopfPfad);
    expect(await readCatalog(kopfPfad)).toBeNull();
  });

  it('behaelt einen gewoehnlichen Frontmatter und entfernt nur die Zuordnung', async () => {
    const w = wegwerfWurzel();
    const kopfPfad = path.join(w, 'Mit Kopf.md');
    fs.writeFileSync(
      kopfPfad,
      writePartLine('---\ntitle: Mein Titel\n---\n# Eins\nA\n', {
        index: 1,
        base: 'Mit Kopf',
      }).text,
      'utf8',
    );
    fs.writeFileSync(
      path.join(w, `${teilName('Mit Kopf', 2)}.md`),
      writePartLine('# Zwei\nB\n', { index: 2, base: 'Mit Kopf' }).text,
      'utf8',
    );
    await rejoinDocument(kopfPfad);
    const text = lies(kopfPfad);
    expect(text).toContain('title: Mein Titel');
    expect(text).not.toContain('doc-part');
  });

  it('weist ein ungeteiltes Dokument ab', async () => {
    const w = wegwerfWurzel();
    const p = path.join(w, 'Schlicht.md');
    fs.writeFileSync(p, '# Schlicht\n', 'utf8');
    const res = await rejoinDocument(p);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('not-split');
  });

  it('verweigert das Vereinen, solange ein Teil fehlt', async () => {
    // Sonst loeschte der Befehl die uebrigen Teile und machte den Verlust des
    // fehlenden endgueltig.
    const { w, kopfPfad } = legeGeteiltesDokument('Notizen', [
      '# Eins\nA\n',
      '# Zwei\nB\n',
      '# Drei\nC\n',
    ]);
    await readAssembledDocument(kopfPfad, lies(kopfPfad));
    fs.rmSync(path.join(w, `${teilName('Notizen', 3)}.md`));
    const res = await rejoinDocument(kopfPfad);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('parts-missing');
    // Nichts wurde angefasst.
    expect(fs.existsSync(path.join(w, `${teilName('Notizen', 2)}.md`))).toBe(true);
    expect(lies(kopfPfad)).toContain('doc-part');
  });

  it('vereint niemals von selbst — allein dieser Weg tut es (AK5)', async () => {
    // Der Schreib-Weg bekommt denselben Text, den das Vereinen erzeugen wuerde,
    // und laesst das Dokument trotzdem geteilt: Es gibt keinen automatischen
    // Weg zurueck, nur diesen ausdruecklichen.
    const { kopfPfad } = legeGeteiltesDokument('Notizen', ['# Eins\nA\n', '# Zwei\nB\n']);
    const stand = await readStateForSave(kopfPfad);
    const plan = planeZerlegung({
      text: stand.text,
      base: stand.basisName,
      schwelle: KLEIN,
      bestand: stand.teile,
    });
    expect(plan.geteilt).toBe(true);
    expect(plan.teile.length).toBeGreaterThan(1);
    for (const t of plan.teile) expect(t.text).toContain('doc-part');
  });
});
