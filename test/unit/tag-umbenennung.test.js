// 4T-001531 (Epic 3E-000175): Der Lauf der Tag-Umbenennung über die
// Ersetzen-Strecke.
//
// **Was hier auf dem Spiel steht.** Die Umbenennung schreibt viele fremde
// Dateien auf einmal, und sie schreibt an zwei Orten je Datei: im Fließtext über
// Offsets, im Frontmatter über das Feld. Ein Prüffall, der nur eine der beiden
// Notationen anfasst, ließe genau die Hälfte der Zusage offen — und die
// gefährlichere, weil ein falsch geschriebenes Frontmatter das Dokument für den
// Index unlesbar machte.
//
// **Geprüft wird an der realen Konstellation** (Muster area-replace.test.js aus
// demselben Zug): ein echter Bereichs-Ordner, die Fundstellen aus dem echten
// Ermittler statt aus der Hand, die echte Dokument-Historie statt eines
// Doppels. Der Grund ist derselbe wie dort: Eine Sicherung, die der Prüffall
// nur behauptet, statt sie in der .mdd nachzuschlagen, ist keine.
//
// Alle Module über createRequire aus EINEM Modul-Graphen: Der Vorrat der Suche
// ist Modul-Zustand, und über zwei Vitest-Instanzen fände die Ersetzen-Strecke
// ihren Bezugs-Stand nie.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { gibBereichsVorratFrei } = require('../../src/main/area/area-search.js');
const { ermittleUmbenennung } = require('../../src/main/area/tag-rename.js');
const { createAreaReplace } = require('../../src/main/area/area-replace.js');
const { createMddHistory } = require('../../src/main/documents/mdd-history.js');
const {
  istGueltigerTagName,
  benenneTagImFrontmatterUm,
} = require('../../src/shared/tag-erkennung.js');
const { writeFrontmatter } = require('../../src/shared/markdown/frontmatter.js');
const { setBufferOverlay, clearAllBufferOverlays } = require('../../src/main/backlinks.js');

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-tagumbenennung-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, inhalt) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inhalt, 'utf8');
  return p;
}

function lies(p) {
  return fs.readFileSync(p, 'utf8');
}

function mddPfad(p) {
  return p.replace(/\.md$/, '.mdd');
}

// Die echte Historie ohne Electron (Muster area-replace.test.js): Fenster als
// Argument, Einstellungs-Speicher als schlichter Getter. Ab Werk ist die
// Historisierung AUS — und genau dann muss die Zwangs-Sicherung greifen.
function streckeFuer(root, historieAn = false) {
  const store = {
    get: (schluessel, vorgabe) => (schluessel === 'historyEnabled' ? historieAn : vorgabe),
  };
  const historie = createMddHistory({
    getStore: () => store,
    areaOfWindow: () => ({ rootPath: root }),
    readAreaHistoryDefault: async () => undefined,
  });
  const { ersetzeImBereich } = createAreaReplace({
    resolveHistoryFor: historie.resolveHistoryFor,
    recordMddOnSave: historie.recordMddOnSave,
  });
  return ersetzeImBereich;
}

// Der Weg, den auch die Bedienung geht: Muster und Ersetzung mit Rückverweis
// auf den Kind-Teil, damit der Teilbaum mitwandert (Entscheidung E4). Die
// Fassung steht in renderer/modules/search/tag-umbenennen.js; hier steht sie
// als das, was der Kanal tatsächlich bekommt.
function laufOptionen(alt, neu) {
  const geschuetzt = alt.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  return {
    muster: `${geschuetzt}((?:/[\\p{L}\\p{N}_-][\\p{L}\\p{N}_/-]*)?)`,
    flags: 'gui',
    ersetzung: `${neu}$1`,
    regexModus: true,
    tag: { alt, neu },
  };
}

// Die Auswahl der Trefferliste, hier vollständig: jede gefundene Stelle. Der
// Schnitt zwischen Offset und Frontmatter-Index läuft über dieselbe Angabe wie
// im Anzeige-Prozess (`zusatz.art`).
function alleFundstellen(ergebnis) {
  const nachPfad = new Map();
  for (const treffer of ergebnis.treffer) {
    const pfad = treffer.sprung.kennung;
    if (!nachPfad.has(pfad)) nachPfad.set(pfad, { pfad, offsets: [], frontmatter: [] });
    const zusatz = treffer.zusatz || {};
    if (zusatz.art === 'frontmatter') nachPfad.get(pfad).frontmatter.push(zusatz.index);
    else nachPfad.get(pfad).offsets.push(treffer.sprung.offset);
  }
  return [...nachPfad.values()];
}

async function umbenenne(root, alt, neu, optionen = {}) {
  const gefunden = await ermittleUmbenennung(root, { alt, neu, aktiv: optionen.aktiv || null });
  const ersetzeImBereich = streckeFuer(root, !!optionen.historieAn);
  const dateien = optionen.dateien ? optionen.dateien(gefunden) : alleFundstellen(gefunden);
  const ergebnis = await ersetzeImBereich(root, { ...laufOptionen(alt, neu), dateien });
  return { gefunden, ergebnis };
}

afterEach(() => {
  clearAllBufferOverlays();
  gibBereichsVorratFrei();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Aufraeumen ist bestes Bemuehen */
    }
  }
  tmpDirs = [];
});

// --- AK2: die Namensprüfung -------------------------------------------------

describe('Tag-Umbenennung: Prüfung des neuen Namens (AK2)', () => {
  it('nimmt an, was die Erkennung als Tag lesen würde', () => {
    for (const name of ['arbeit', 'arbeit/alpha', 'a-b_c', 'arbeit/2026', 'Über']) {
      expect(istGueltigerTagName(name)).toBe(true);
    }
  });

  it('weist zurück, was danach kein Tag mehr wäre', () => {
    // Jeder Fall steht für einen eigenen Weg, die Ordnung zu zerstören: Die
    // Raute bräche das Tag in zwei, das Leerzeichen endete es vorzeitig, die
    // reine Zahl gilt der Erkennung als Fußnote, der Farbcode als CSS-Wert, und
    // ein Schrägstrich am Rand erzeugte eine leere Ebene.
    for (const name of ['#arbeit', 'arbeit tag', '2026', 'fff', '/arbeit', 'arbeit/', 'a//b', '']) {
      expect(istGueltigerTagName(name)).toBe(false);
    }
  });

  it('nimmt einen Namen mit Leerraum am Rand an und meint den getrimmten', () => {
    expect(istGueltigerTagName('  arbeit  ')).toBe(true);
  });
});

// --- AK5: der Frontmatter-Schreibweg ----------------------------------------

describe('Tag-Umbenennung: Frontmatter-Weg (AK5)', () => {
  const DOKUMENT = [
    '---',
    'titel: Probe',
    'tags:',
    '  - projekt',
    '  - projekt/alpha',
    '  - anderes',
    '---',
    '',
    'Text.',
    '',
  ].join('\n');

  it('schreibt genau die gewählten Einträge und lässt die übrigen stehen', () => {
    const ergebnis = benenneTagImFrontmatterUm(DOKUMENT, {
      alt: 'projekt',
      neu: 'arbeit',
      indizes: [0],
      schreibe: writeFrontmatter,
    });
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.anzahl).toBe(1);
    expect(ergebnis.text).toContain('- arbeit\n');
    expect(ergebnis.text).toContain('- projekt/alpha');
    expect(ergebnis.text).toContain('- anderes');
  });

  it('erhält die übrigen Felder des Blocks', () => {
    const ergebnis = benenneTagImFrontmatterUm(DOKUMENT, {
      alt: 'projekt',
      neu: 'arbeit',
      indizes: [0, 1],
      schreibe: writeFrontmatter,
    });
    expect(ergebnis.text).toContain('titel: Probe');
    expect(ergebnis.text).toContain('- arbeit/alpha');
    expect(ergebnis.text.endsWith('Text.\n')).toBe(true);
  });

  it('meldet statt zu raten, wenn der Text nicht mehr der Vorschau entspricht', () => {
    // Index 1 trägt in diesem Text kein Vorkommen des alten Namens mehr —
    // genau der Fall, den eine fremde Änderung zwischen Vorschau und Lauf
    // erzeugt.
    const anderer = ['---', 'tags:', '  - projekt', '  - fremd', '---', '', 'Text.', ''].join('\n');
    const ergebnis = benenneTagImFrontmatterUm(anderer, {
      alt: 'projekt',
      neu: 'arbeit',
      indizes: [0, 1],
      schreibe: writeFrontmatter,
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toBe('veraendert');
  });

  it('ist ohne Auswahl ein Nichts-Tun und kein Schreibvorgang', () => {
    const ergebnis = benenneTagImFrontmatterUm(DOKUMENT, {
      alt: 'projekt',
      neu: 'arbeit',
      indizes: [],
      schreibe: () => {
        throw new Error('darf nicht schreiben');
      },
    });
    expect(ergebnis).toEqual({ ok: true, text: DOKUMENT, anzahl: 0 });
  });
});

// --- AK4 und AK6: der Lauf über die Strecke ---------------------------------

describe('Tag-Umbenennung: Lauf über die Ersetzen-Strecke (AK4)', () => {
  it('benennt beide Notationen in einem Lauf und in einem Schreibvorgang um', async () => {
    const root = makeRoot();
    const ziel = write(
      root,
      'alpha.md',
      [
        '---',
        'tags:',
        '  - projekt',
        '  - projekt/alpha',
        '---',
        '',
        'Text mit #projekt und #projekt/beta.',
        '',
      ].join('\n'),
    );

    const { gefunden, ergebnis } = await umbenenne(root, 'projekt', 'arbeit');

    // Vier Fundstellen: zwei im Feld, zwei im Fließtext.
    expect(gefunden.treffer).toHaveLength(4);
    expect(ergebnis.geaendert).toEqual([{ pfad: ziel, anzahl: 4 }]);
    expect(ergebnis.fehlgeschlagen).toEqual([]);
    expect(lies(ziel)).toBe(
      [
        '---',
        'tags:',
        '  - arbeit',
        '  - arbeit/alpha',
        '---',
        '',
        'Text mit #arbeit und #arbeit/beta.',
        '',
      ].join('\n'),
    );
  });

  it('sichert den Vor-Stand auch bei abgeschalteter Historisierung (AK4)', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Text mit #projekt.\n');
    const vorher = lies(ziel);

    await umbenenne(root, 'projekt', 'arbeit');

    // Die Zusicherung wird nicht behauptet, sondern in der .mdd nachgeschlagen.
    const mdd = mddPfad(ziel);
    expect(fs.existsSync(mdd)).toBe(true);
    expect(lies(mdd)).toContain(vorher.trim());
  });

  it('nimmt den Teilbaum mit und lässt den Namensvetter stehen (E4)', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Hier #projekt, #projekt/alpha und #projektil.\n');

    const { gefunden } = await umbenenne(root, 'projekt', 'arbeit');

    expect(lies(ziel)).toBe('Hier #arbeit, #arbeit/alpha und #projektil.\n');
    // Die Vorschau weist das mitwandernde Kind aus, statt es stillschweigend
    // mitzunehmen — die Bedingung der Entscheidung E4.
    expect(gefunden.kinder).toBe(1);
    expect(gefunden.treffer.filter((tr) => tr.zusatz && tr.zusatz.kind)).toHaveLength(1);
  });

  it('vereinheitlicht die Schreibweise (E3)', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Erst #projekt, dann #Projekt, dann #PROJEKT/alpha.\n');

    await umbenenne(root, 'projekt', 'arbeit');

    expect(lies(ziel)).toBe('Erst #arbeit, dann #arbeit, dann #arbeit/alpha.\n');
  });

  it('rührt nicht an, was kein Tag ist', async () => {
    const root = makeRoot();
    const inhalt = [
      'Adresse https://beispiel.de/#projekt bleibt.',
      'Anker [[Ziel#projekt]] bleibt.',
      'Code `#projekt` bleibt.',
      '',
      '```',
      '#projekt im Fence bleibt.',
      '```',
      '',
      'Nur hier: #projekt.',
      '',
    ].join('\n');
    const ziel = write(root, 'alpha.md', inhalt);

    const { gefunden } = await umbenenne(root, 'projekt', 'arbeit');

    expect(gefunden.treffer).toHaveLength(1);
    expect(lies(ziel)).toBe(inhalt.replace('Nur hier: #projekt.', 'Nur hier: #arbeit.'));
  });

  it('schreibt nur die ausgewählten Fundstellen', async () => {
    const root = makeRoot();
    const ziel = write(
      root,
      'alpha.md',
      ['---', 'tags:', '  - projekt', '---', '', 'Text mit #projekt.', ''].join('\n'),
    );

    // Nur das Feld: Der Fließtext bleibt, was er war. Das ist der Beleg, dass
    // die Auswahl je Fundstelle bis zum Schreiben durchgereicht wird.
    const { ergebnis } = await umbenenne(root, 'projekt', 'arbeit', {
      dateien: (gefunden) => alleFundstellen(gefunden).map((z) => ({ ...z, offsets: [] })),
    });

    expect(ergebnis.geaendert).toEqual([{ pfad: ziel, anzahl: 1 }]);
    expect(lies(ziel)).toBe(
      ['---', 'tags:', '  - arbeit', '---', '', 'Text mit #projekt.', ''].join('\n'),
    );
  });

  it('lässt eine Datei ohne Fundstelle unberührt', async () => {
    const root = makeRoot();
    write(root, 'alpha.md', 'Text mit #projekt.\n');
    const ohne = write(root, 'ohne.md', 'Nichts hier.\n');

    const { gefunden } = await umbenenne(root, 'projekt', 'arbeit');

    expect(gefunden.gruppen).toHaveLength(1);
    expect(lies(ohne)).toBe('Nichts hier.\n');
    expect(fs.existsSync(mddPfad(ohne))).toBe(false);
  });
});

describe('Tag-Umbenennung: offene Reiter (AK6)', () => {
  it('weist eine Datei mit abweichendem Puffer ab, statt sie zu überschreiben', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Text mit #projekt.\n');
    // Ein offener Reiter mit ungespeicherten Änderungen: Der Ermittler sieht
    // den Puffer, die Platte trägt etwas anderes. Geschrieben wird nicht —
    // dieselbe Abweisung wie beim freien Ersetzen.
    setBufferOverlay(ziel, 'Text mit #projekt und mehr.\n');

    const { ergebnis } = await umbenenne(root, 'projekt', 'arbeit');

    expect(ergebnis.geaendert).toEqual([]);
    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: ziel, grund: 'offen' }]);
    expect(lies(ziel)).toBe('Text mit #projekt.\n');
  });

  it('ermittelt die Fundstellen auf dem Puffer-Stand, nicht auf dem der Platte', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Nichts hier.\n');
    setBufferOverlay(ziel, 'Jetzt doch: #projekt.\n');

    const gefunden = await ermittleUmbenennung(root, { alt: 'projekt', neu: 'arbeit' });

    // Die Fundstelle stammt aus dem Puffer; ihr Offset gilt dort und nirgends
    // sonst. Genau deshalb liest der Ermittler aus dem Vorrat der Suche und
    // nicht ein zweites Mal von der Platte.
    expect(gefunden.treffer).toHaveLength(1);
    expect(gefunden.treffer[0].sprung.kennung).toBe(ziel);
  });
});

// 4T-001671 (Epic 3E-000252): Die Naht zum Suchraum-Schnitt der Datenbank.
//
// **Warum diese Faelle hier stehen und nicht bei den Datensaetzen.** Gegenstand
// ist nicht die Bereinigung, sondern die SCHREIB-Strecke auf bereinigtem Text:
// Die Umbenennung holt ihre Texte ueber `bereichsTexte` aus demselben Vorrat wie
// die Suche, bildet ihre Offsets selbst und schreibt damit. Genau an dieser
// Naht ist der Fehler entstanden, den 4T-001671 behebt, und dort gehoert seine
// Bewachung hin.
//
// **Die Rot-Probe steckt im Fixture.** Das zweite Schlagwort steht HINTER dem
// Datensatz-Block: Ohne Ruecknahme-Karte laege sein Offset um die Laenge der
// entfernten Datensatz-Zeilen zu frueh, und die Ersetzung fiele mitten in den
// Datenblock. Ein Fixture mit dem Schlagwort NUR vor dem Block waere auch ohne
// die Behebung gruen und bewachte nichts.
describe('Tag-Umbenennung: Tabellen-Datei mit Datensatz-Block (4T-001671)', () => {
  const TABELLE = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Titel',
    'tags: kunde',
    '---',
    '',
    '# Kundenliste',
    '',
    'Die Liste der #kunde vor dem Block.',
    '',
    '```perspective-records',
    '|- id="r-00001"',
    '| Anna Meier mit viel Text, damit die Verschiebung gross genug ist',
    '|- id="r-00002"',
    '| Bert Huber mit ebenfalls reichlich Text in dieser Datensatz-Zeile',
    '```',
    '',
    'Ein Nachwort zu #kunde hinter dem Block.',
    '',
  ].join('\n');

  it('ersetzt beide Fundstellen an der richtigen Stelle und laesst den Datenblock unberuehrt', async () => {
    const root = makeRoot();
    const pfad = write(root, 'Kundenliste.md', TABELLE);

    const { gefunden, ergebnis } = await umbenenne(root, 'kunde', 'kundin');

    expect(ergebnis.fehler || []).toEqual([]);
    const nachher = lies(pfad);

    // Beide Fliesstext-Stellen sind umbenannt, an ihrer eigenen Stelle.
    expect(nachher).toContain('Die Liste der #kundin vor dem Block.');
    expect(nachher).toContain('Ein Nachwort zu #kundin hinter dem Block.');
    expect(nachher).not.toContain('#kunde ');
    // Der Datensatz-Block ist Zeichen fuer Zeichen derselbe geblieben. Das ist
    // die eigentliche Zusicherung: Ein zu frueher Offset haette hier
    // hineingeschrieben.
    expect(nachher).toContain('| Anna Meier mit viel Text, damit die Verschiebung gross genug ist');
    expect(nachher).toContain(
      '| Bert Huber mit ebenfalls reichlich Text in dieser Datensatz-Zeile',
    );
    // Und das Frontmatter-Feld, das ohne Offset geschrieben wird.
    expect(nachher).toContain('tags: kundin');

    // Der Ermittler hat die Stelle hinter dem Block in DATEI-Koordinaten
    // geliefert; ohne Karte waere sie kleiner als die Stelle im Original.
    const hinten = gefunden.treffer.find(
      (t) =>
        (t.zusatz || {}).art !== 'frontmatter' &&
        t.sprung.offset > TABELLE.indexOf('```perspective-records'),
    );
    expect(hinten).toBeTruthy();
    // Der Offset zeigt auf den NAMEN, nicht auf die Raute davor (Form der
    // Fundstellen aus `ermittleFundstellen`).
    expect(TABELLE.slice(hinten.sprung.offset, hinten.sprung.offset + 5)).toBe('kunde');
    expect(hinten.sprung.offset).toBe(TABELLE.lastIndexOf('kunde hinter dem Block'));
  });

  it('meldet eine tatsaechlich fremd geaenderte Tabellen-Datei weiterhin als veraendert', async () => {
    const root = makeRoot();
    const pfad = write(root, 'Kundenliste.md', TABELLE);

    const gefunden = await ermittleUmbenennung(root, { alt: 'kunde', neu: 'kundin', aktiv: null });
    // Zwischen Ermittlung und Schreiben aendert jemand den Datensatz-Block. Der
    // bereinigte Text bleibt dabei gleich, die Verschiebung nicht — genau
    // deshalb vergleicht die Strecke auch die Ruecknahme-Karte.
    fs.writeFileSync(
      pfad,
      TABELLE.replace(
        '| Anna Meier mit viel Text, damit die Verschiebung gross genug ist',
        '| Anna Meier kurz',
      ),
      'utf8',
    );

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, {
      ...laufOptionen('kunde', 'kundin'),
      dateien: alleFundstellen(gefunden),
    });

    expect(lies(pfad)).toContain('#kunde');
    const veraendert = (ergebnis.veraendert || []).length + (ergebnis.fehler || []).length;
    expect(veraendert).toBeGreaterThan(0);
  });
});
