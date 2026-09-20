// 4T-001731 (Epic 3E-000306): Der Kopier-Weg des Bereichs-Panels am ECHTEN
// Handler.
//
// Vorbild in Aufbau und Haltung ist area-loeschen.test.js daneben: Der Handler
// wird mit denselben Deps registriert, die main.js ihm gibt, und gemessen wird
// am Dateisystem — was liegt hinterher da, und was liegt NICHT da.
//
// **Die tragenden Fälle sind drei**, und sie messen je eine Entscheidung, die
// man auch anders hätte treffen können:
//
//   - Die **bereits nummerierte Vorlage** (E1): `Konzept-1.md` wird zu
//     `Konzept-1-1.md` und NICHT zu `Konzept-2.md`. Ein Test nur über die
//     erste Kopie wäre auch bei der falschen Bauart grün.
//   - Der **Wettlauf** (offener Punkt des Epics): Entsteht die Zieldatei
//     zwischen Namenswahl und Schreibversuch, fällt der Kanal auf die nächste
//     Nummer zurück. Der Fall ist über die hereingereichte Kopier-Handlung
//     gespielt, weil das echte Dateisystem ihn nicht verlässlich herstellt.
//   - Die **Begleitdaten** (E2, E3): Die Block-Eigenschaften reisen mit, die
//     Historie nicht. Geprüft wird an der geschriebenen Begleitdatei selbst,
//     nicht an einem Rückgabewert — sonst bliebe offen, was auf der Platte
//     steht.
import { afterEach, describe, expect, it } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerAreaCopyIpc, kopiereMitFreierNummer } = require('../../src/main/ipc/area-copy.js');
const mddStore = require('../../src/main/documents/mdd-store.js');

const tempOrdner = [];

afterEach(async () => {
  while (tempOrdner.length) {
    const dir = tempOrdner.pop();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function bereich() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'em4me-kopieren-'));
  tempOrdner.push(dir);
  const wurzel = path.join(dir, 'bereich');
  await fsp.mkdir(wurzel);
  await fsp.mkdir(path.join(dir, 'daneben'));
  await fsp.mkdir(path.join(wurzel, 'Unterordner.md'));
  await fsp.writeFile(path.join(wurzel, 'Konzept.md'), '# Konzept\n\nText\n', 'utf8');
  await fsp.writeFile(path.join(wurzel, 'Bild.png'), 'kein Dokument', 'utf8');
  await fsp.writeFile(path.join(dir, 'daneben', 'Fremd.md'), '# Fremd\n', 'utf8');
  return { dir, wurzel };
}

function registriere(rootPath) {
  const handler = new Map();
  registerAreaCopyIpc((kanal, fn) => handler.set(kanal, fn), {
    senderWindow: () => ({}),
    areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
  });
  return handler.get('area:copyFile');
}

// Begleitdatei der Vorlage mit Block-Eigenschaften, Dokument-Notiz UND
// Historie. Alle drei werden über die Schreib-Wege von mdd-store gesetzt, damit
// die Datei genau die Form trägt, die die Anwendung auch selbst schreibt.
async function schreibeBegleitdatei(
  dokument,
  { mitHistorie = true, mitBlockData = true, mitNotiz = true } = {},
) {
  let container = mddStore.emptyContainer();
  if (mitBlockData) {
    container = mddStore.setBlockData(
      container,
      'abc123',
      { Status: 'offen' },
      Date.UTC(2026, 0, 1),
    );
  }
  if (mitNotiz) {
    container = mddStore.setNote(container, 'Notiz zur Vorlage', Date.UTC(2026, 0, 3));
  }
  if (mitHistorie) {
    container.history.anchors.push({
      ts: '2026-01-01T00:00:00Z',
      baseSeq: 0,
      text: '# Konzept\n',
      hash: mddStore.hashText('# Konzept\n'),
    });
    container.history.packets.push({
      ts: '2026-01-02T00:00:00Z',
      tsEnd: '2026-01-02T00:00:00Z',
      trigger: 'edit',
      ops: [],
      hashAfter: mddStore.hashText('# Konzept\n\nText\n'),
    });
  }
  const mdd = dokument.replace(/\.md$/, '.mdd');
  await fsp.writeFile(mdd, mddStore.serializeContainer(container), 'utf8');
  return mdd;
}

describe('area:copyFile — Namensfindung (4T-001731, E1)', () => {
  it('nennt die erste Kopie Name-1 und behaelt die Endung', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(wurzel, 'Konzept.md'));

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.name).toBe('Konzept-1.md');
    expect(ergebnis.path).toBe(path.join(wurzel, 'Konzept-1.md'));
    // AK6: Der Inhalt ist derselbe, Byte fuer Byte.
    expect(await fsp.readFile(ergebnis.path, 'utf8')).toBe('# Konzept\n\nText\n');
    // Die Vorlage bleibt, wie sie war.
    expect(await fsp.readFile(path.join(wurzel, 'Konzept.md'), 'utf8')).toBe('# Konzept\n\nText\n');
  });

  it('zaehlt bei belegtem Namen weiter, ohne zu ueberschreiben', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const erste = await copyFile({}, path.join(wurzel, 'Konzept.md'));
    const zweite = await copyFile({}, path.join(wurzel, 'Konzept.md'));

    expect(erste.name).toBe('Konzept-1.md');
    expect(zweite.name).toBe('Konzept-2.md');
    // Die erste Kopie ist unberuehrt geblieben — kein Ueberschreiben.
    expect(await fsp.readFile(erste.path, 'utf8')).toBe('# Konzept\n\nText\n');
  });

  it('fuellt eine Luecke in der Nummernfolge (naechste FREIE, nicht hoechste plus eins)', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    // 1 und 3 belegt, 2 frei.
    await fsp.writeFile(path.join(wurzel, 'Konzept-1.md'), 'eins\n', 'utf8');
    await fsp.writeFile(path.join(wurzel, 'Konzept-3.md'), 'drei\n', 'utf8');

    const ergebnis = await copyFile({}, path.join(wurzel, 'Konzept.md'));

    expect(ergebnis.name).toBe('Konzept-2.md');
    expect(await fsp.readFile(path.join(wurzel, 'Konzept-1.md'), 'utf8')).toBe('eins\n');
    expect(await fsp.readFile(path.join(wurzel, 'Konzept-3.md'), 'utf8')).toBe('drei\n');
  });

  it('haengt an eine bereits nummerierte Vorlage an, statt hochzuzaehlen (AK5)', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    await fsp.writeFile(path.join(wurzel, 'Konzept-1.md'), '# Konzept 1\n', 'utf8');

    const ergebnis = await copyFile({}, path.join(wurzel, 'Konzept-1.md'));

    // Der entscheidende Punkt: NICHT 'Konzept-2.md'. Diese Kopie gehoert zu
    // 'Konzept-1.md' und nicht zu 'Konzept.md'.
    expect(ergebnis.name).toBe('Konzept-1-1.md');
    expect(fs.existsSync(path.join(wurzel, 'Konzept-2.md'))).toBe(false);
  });

  it('haelt die Endung auch bei .markdown vor der Nummer', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    await fsp.writeFile(path.join(wurzel, 'Notiz.markdown'), '# Notiz\n', 'utf8');

    const ergebnis = await copyFile({}, path.join(wurzel, 'Notiz.markdown'));

    expect(ergebnis.name).toBe('Notiz-1.markdown');
  });

  it('haelt eine Unterseite bei ihrer Elternseite', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const name = 'Prozess∕Schritt.md';
    await fsp.writeFile(path.join(wurzel, name), '# Schritt\n', 'utf8');

    const ergebnis = await copyFile({}, path.join(wurzel, name));

    expect(ergebnis.name).toBe('Prozess∕Schritt-1.md');
  });
});

describe('area:copyFile — Wettlauf zwischen Pruefung und Anlage (4T-001731)', () => {
  it('faellt auf die naechste Nummer zurueck, wenn das Ziel dazwischen entsteht', async () => {
    const versuche = [];
    // Die Attrappe spielt genau die Lage, die das Dateisystem hier nicht
    // verlaesslich herstellt: Der Name war frei, und im Moment des Schreibens
    // ist er belegt. COPYFILE_EXCL meldet das als EEXIST.
    const kopiere = async (ziel) => {
      versuche.push(path.basename(ziel));
      if (versuche.length === 1) {
        const err = new Error('EEXIST: file already exists');
        err.code = 'EEXIST';
        throw err;
      }
    };

    const ergebnis = await kopiereMitFreierNummer({
      dateiName: 'Konzept.md',
      ordner: path.join('C:', 'bereich'),
      kopiere,
      istImBereich: () => true,
    });

    expect(versuche).toEqual(['Konzept-1.md', 'Konzept-2.md']);
    expect(ergebnis).toMatchObject({ ok: true, name: 'Konzept-2.md', nummer: 2 });
  });

  it('meldet einen anderen Fehlschlag, statt auf die naechste Nummer auszuweichen', async () => {
    // Ein EACCES ist keine Namens-Kollision. Wuerde er wie EEXIST behandelt,
    // liefe der Kanal tausend Versuche und meldete am Ende den falschen Grund.
    const versuche = [];
    const kopiere = async (ziel) => {
      versuche.push(path.basename(ziel));
      const err = new Error('EACCES: permission denied');
      err.code = 'EACCES';
      throw err;
    };

    const ergebnis = await kopiereMitFreierNummer({
      dateiName: 'Konzept.md',
      ordner: path.join('C:', 'bereich'),
      kopiere,
      istImBereich: () => true,
    });

    expect(versuche).toEqual(['Konzept-1.md']);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toContain('EACCES');
  });

  it('weist ein Ziel ab, das die Bereichs-Grenze verlaesst, ohne zu kopieren', async () => {
    const versuche = [];
    const ergebnis = await kopiereMitFreierNummer({
      dateiName: 'Konzept.md',
      ordner: path.join('C:', 'bereich'),
      kopiere: async (ziel) => versuche.push(ziel),
      istImBereich: () => false,
    });

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(versuche).toEqual([]);
  });
});

describe('area:copyFile — Begleitdaten (4T-001731, E2, E3 und E9)', () => {
  it('nimmt Block-Eigenschaften und Notiz mit, die Historie NICHT', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const vorlage = path.join(wurzel, 'Konzept.md');
    const vorlageMdd = await schreibeBegleitdatei(vorlage);

    const ergebnis = await copyFile({}, vorlage);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.begleitdatei).toBe(true);
    const kopieMdd = path.join(wurzel, 'Konzept-1.mdd');
    const geparst = mddStore.parseContainer(await fsp.readFile(kopieMdd, 'utf8'));
    expect(geparst.ok).toBe(true);
    // E2: die Block-Eigenschaften sind da, mit Wert und Zeitstempel.
    expect(mddStore.getAllBlockData(geparst.container)).toEqual({
      abc123: { values: { Status: 'offen' }, updated: '2026-01-01T00:00:00Z' },
    });
    // E9: die Dokument-Notiz reist mit — Text UND Zeitstempel der Vorlage. Der
    // Zeitstempel wird nicht neu gesetzt, weil die Notiz mitgekommen und nicht
    // neu geschrieben ist.
    expect(mddStore.getNote(geparst.container)).toEqual({
      text: 'Notiz zur Vorlage',
      updated: '2026-01-03T00:00:00Z',
    });
    // E3: die Historie ist LEER und nicht die der Vorlage.
    expect(geparst.container.history).toEqual({ anchors: [], packets: [] });
    // Die Begleitdatei der Vorlage ist unveraendert.
    const vorlageGeparst = mddStore.parseContainer(await fsp.readFile(vorlageMdd, 'utf8'));
    expect(vorlageGeparst.container.history.packets).toHaveLength(1);
    expect(mddStore.getNote(vorlageGeparst.container).text).toBe('Notiz zur Vorlage');
  });

  it('nimmt die Notiz auch ohne Block-Eigenschaften mit (E9 haengt nicht an E2)', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const vorlage = path.join(wurzel, 'Konzept.md');
    // Nur die Notiz: Sie allein muss die Begleitdatei der Kopie entstehen
    // lassen. Ohne diesen Fall waere die Notiz auch dann gruen, wenn sie bloss
    // an der Block-Sektion mithinge.
    await schreibeBegleitdatei(vorlage, { mitBlockData: false, mitHistorie: false });

    const ergebnis = await copyFile({}, vorlage);

    expect(ergebnis.begleitdatei).toBe(true);
    const geparst = mddStore.parseContainer(
      await fsp.readFile(path.join(wurzel, 'Konzept-1.mdd'), 'utf8'),
    );
    expect(mddStore.getNote(geparst.container).text).toBe('Notiz zur Vorlage');
    expect(mddStore.getAllBlockData(geparst.container)).toEqual({});
    expect(geparst.container.history).toEqual({ anchors: [], packets: [] });
  });

  it('legt ohne Block-Eigenschaften und ohne Notiz gar keine Begleitdatei an', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const vorlage = path.join(wurzel, 'Konzept.md');
    // Vorlage mit Historie, aber ohne Block-Eigenschaften und ohne Notiz: Es
    // reist nichts mit, also entsteht auch keine leere Begleitdatei als Beifang.
    await schreibeBegleitdatei(vorlage, { mitBlockData: false, mitNotiz: false });

    const ergebnis = await copyFile({}, vorlage);

    expect(ergebnis.begleitdatei).toBe(false);
    expect(fs.existsSync(path.join(wurzel, 'Konzept-1.mdd'))).toBe(false);
  });

  it('kopiert auch ohne jede Begleitdatei der Vorlage', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(wurzel, 'Konzept.md'));

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.begleitdatei).toBe(false);
    expect(fs.existsSync(path.join(wurzel, 'Konzept-1.mdd'))).toBe(false);
  });

  it('laesst eine DEFEKTE Begleitdatei der Vorlage unberuehrt und kopiert trotzdem', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const defekt = path.join(wurzel, 'Konzept.mdd');
    await fsp.writeFile(defekt, '{ kein JSON', 'utf8');

    const ergebnis = await copyFile({}, path.join(wurzel, 'Konzept.md'));

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.begleitdatei).toBe(false);
    expect(fs.existsSync(path.join(wurzel, 'Konzept-1.mdd'))).toBe(false);
    // Die defekte Datei wird nie ueberschrieben (Bestands-Haltung mdd-store).
    expect(await fsp.readFile(defekt, 'utf8')).toBe('{ kein JSON');
  });

  it('raeumt die halbe Kopie weg, wenn die Begleitdatei scheitert (AK10)', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const vorlage = path.join(wurzel, 'Konzept.md');
    await schreibeBegleitdatei(vorlage);
    // Der Ziel-Name der Begleitdatei ist als ORDNER belegt: Das exklusive
    // Schreiben scheitert, die Datei-Kopie war aber schon erfolgreich. Genau
    // diese Teil-Kopie darf nicht liegen bleiben.
    await fsp.mkdir(path.join(wurzel, 'Konzept-1.mdd'));

    const ergebnis = await copyFile({}, vorlage);

    expect(ergebnis.ok).toBe(false);
    expect(fs.existsSync(path.join(wurzel, 'Konzept-1.md'))).toBe(false);
    // Die Vorlage und ihre Begleitdatei sind unangetastet.
    expect(fs.existsSync(vorlage)).toBe(true);
    expect(fs.existsSync(path.join(wurzel, 'Konzept.mdd'))).toBe(true);
  });
});

describe('area:copyFile — Grenzen und Abweisungen (4T-001731, E4 und E7)', () => {
  it('weist eine Vorlage ausserhalb des Bereichs ab', async () => {
    const { dir, wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(dir, 'daneben', 'Fremd.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(fs.existsSync(path.join(dir, 'daneben', 'Fremd-1.md'))).toBe(false);
  });

  it('weist einen Ausbruch ueber .. ab', async () => {
    const { dir, wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(wurzel, '..', 'daneben', 'Fremd.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(fs.existsSync(path.join(dir, 'daneben', 'Fremd-1.md'))).toBe(false);
  });

  it('weist einen ORDNER ab, auch wenn sein Name auf .md endet (E4)', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(wurzel, 'Unterordner.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'is-directory' });
    expect(fs.existsSync(path.join(wurzel, 'Unterordner-1.md'))).toBe(false);
  });

  it('weist eine Datei ab, die kein Dokument ist', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(wurzel, 'Bild.png'));

    expect(ergebnis).toEqual({ ok: false, error: 'not a document' });
    expect(fs.existsSync(path.join(wurzel, 'Bild-1.png'))).toBe(false);
  });

  it('meldet eine verschwundene Vorlage', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    const ergebnis = await copyFile({}, path.join(wurzel, 'Gibtesnicht.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'missing-source' });
  });

  it('kopiert ohne Bereich nichts', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(null);

    const ergebnis = await copyFile({}, path.join(wurzel, 'Konzept.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'no area' });
    expect(fs.existsSync(path.join(wurzel, 'Konzept-1.md'))).toBe(false);
  });

  it('weist leere und untypisierte Angaben ab', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);

    for (const eingabe of ['', null, undefined, 42]) {
      expect(await copyFile({}, eingabe)).toEqual({ ok: false, error: 'outside-area' });
    }
  });

  // Der Befund dieses Tasks, der nicht im Epic stand: Die Kopf-Datei eines
  // GETEILTEN Dokuments traegt eine Zuordnungs-Zeile mit dem Grundnamen der
  // Vorlage. Eine Kopie davon galte der Anwendung als Kopf DESSELBEN
  // Dokuments — das Oeffnen fuehrte auf die Vorlage, das Speichern schriebe in
  // deren Teile. Der Kanal sagt deshalb Nein, und der Prueffall haelt das
  // fest, damit die Grenze nicht bei der naechsten Aenderung still faellt.
  it('weist ein geteiltes Dokument ab, statt eine Kopie mit fremder Zuordnung zu bauen', async () => {
    const { wurzel } = await bereich();
    const copyFile = registriere(wurzel);
    const kopf = path.join(wurzel, 'Gross.md');
    // Zuordnungs-Zeile in der Form, die writePartLine schreibt
    // (shared/document-parts.js: Schluessel 'doc-part', Wert 'v1|<Pos>|<Grundname>').
    await fsp.writeFile(kopf, '---\ndoc-part: v1|1|Gross\n---\n\n# Gross\n', 'utf8');

    const ergebnis = await copyFile({}, kopf);

    expect(ergebnis).toEqual({ ok: false, error: 'split-document' });
    expect(fs.existsSync(path.join(wurzel, 'Gross-1.md'))).toBe(false);
  });
});
