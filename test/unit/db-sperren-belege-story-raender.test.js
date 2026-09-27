// 4T-001794 (Epic 3E-000255): Die Ränder der Stories, für die beim Abschluss
// des Epics kein Prüffall zu finden war, obwohl sie ohne Schreib-Schnittstelle
// und ohne erzeugte Maske prüfbar sind.
//
// Vier Kriterien aus drei Stories liegen hier, jedes mit der Story und seiner
// Nummer im Fall-Namen:
//
//   4S-000952 AK8  Ein Sperr-Vorgang erzeugt keinen Änderungsbeleg.
//   4S-000952 AK10 Der Sperr-Speicher überlebt einen Neustart der Anwendung,
//   4S-000953 AK8  und nach einem Neustart sind fremde Sperren unverändert
//                  wirksam (beide Halbsätze treffen dieselbe Lage und stehen
//                  deshalb in einem Kapitel).
//   4S-000952 AK13 Benutzer- und Rechnername mit Sonderzeichen bleiben
//                  eindeutig les- und zuordenbar, weil beide Angaben getrennt
//                  abgelegt sind.
//   4S-000954 AK10 Die Beleg-Datei lässt sich chronologisch segmentieren, ohne
//                  dass die Verkettung der Belege eines Datensatzes reißt.
//
// **Der Neustart ist ein zweites Objekt, kein zweiter Prozess.** Was eine
// Programm-Sitzung von der nächsten trennt, ist das Eigen-Register der
// Sperr-Verwaltung: Es liegt im Arbeitsspeicher und ist nach einem Neustart
// fort, während Ordner und Sperr-Datei im Bestand des Anwenders liegen
// bleiben. Eine frisch erzeugte Verwaltung über demselben Bereich stellt diese
// Lage vollständig dar; ein echter Neustart brächte keine Aussage hinzu, die
// diese Fälle nicht messen.
//
// **Es gibt im Produkt keine Segmentierung der Beleg-Datei**, und hier
// entsteht auch keine. Geprüft wird eine **Eigenschaft des Formats**: Der
// Schnitt geschieht im Prüffall selbst, auf Text-Ebene an einer Beleg-Grenze,
// gelesen und beurteilt wird ausschließlich mit den bestehenden Funktionen
// des Produkts.
//
// **Bewusst nicht hier**, weil jedes dieser Kriterien einen Vorgang
// voraussetzt, den dieses Epic nicht baut: 4S-000954 AK5 (eine tatsächliche
// Feld-Umbenennung) und AK9 (der Wechsel eines Datensatzes zwischen zwei
// Segmenten) hängen am Schreibweg der Definitions-Änderung, 4S-000957 AK7,
// zweite Hälfte (die Ansicht sagt, dass ein Datensatz gelöscht ist) am
// Lösch-Vorgang, und die Abnahme-Handgriffe aller Stories am Bedienweg, den
// erst die erzeugte Maske bringt.
//
// **Gearbeitet wird an echten Temp-Verzeichnissen**, wie in den
// Nachbar-Prüfdateien: Der Gegenstand ist das Dateisystem selbst, und eine
// Attrappe prüfte die Attrappe.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import {
  ART_CHANGE_LOG,
  ART_DATENSATZ,
  ART_DEFINITION,
  leseSperre,
  sperrDateiName,
  standVon,
} from '../../src/main/database/lock-store.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import {
  belegPfadFuer,
  leseBelegDatei,
  schreibeBeleg,
} from '../../src/main/database/change-log.js';
import { belegeZuDatensatz, pruefeVerkettung } from '../../src/shared/database/change-record.js';
import { MDDL_EXT } from '../../src/shared/markdown-data-family.js';

// --- Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README) ---------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

// Die drei Module, die eine Sperre nehmen, lesen, ablösen oder entfernen.
const SPERR_MODULE = [
  'src/main/database/lock-store.js',
  'src/main/database/lock-lifecycle.js',
  'src/main/database/lock-replace.js',
].map((rel) => ({ rel, quelle: quelltext(rel) }));

// --- Aufbau ------------------------------------------------------------------------------

const EIGENE_PID = 4711;
const FREMDE_PID = 9999;
const START_MS = Date.parse('2026-09-19T08:00:00Z');
const FRIST_MS = 4 * 60 * 60 * 1000;

const DATENSATZ = { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00042' };
const DEFINITION = { art: ART_DEFINITION, tabelle: 'Kunden.md' };
const BELEG_DATEI = { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' };

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich(vorsilbe) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), vorsilbe));
  tmpDirs.push(wurzel);
  fs.writeFileSync(path.join(wurzel, 'Kunden.md'), '# Kunden\n', 'utf8');
  return wurzel;
}

// Eine Sperr-Verwaltung über einem Bereich. Uhr, Herkunft und Prozess-Nummer
// sind Nähte, damit Frist und Halter ohne Wartezeit und ohne echten Absturz
// messbar sind; die Nähte gehen unverändert an den Speicher weiter.
function verwaltungFuer(abweichung = {}) {
  const zustand = {
    jetztMs: START_MS,
    benutzer: 'anna',
    rechner: 'SC-026',
    pid: EIGENE_PID,
    ...abweichung,
  };
  const deps = {
    leseKonfig: async () => undefined,
    jetzt: () => `${new Date(zustand.jetztMs).toISOString().slice(0, 19)}Z`,
    herkunft: () => ({ benutzer: zustand.benutzer, rechner: zustand.rechner }),
    uhr: () => zustand.jetztMs,
    prozess: { pid: zustand.pid, lebt: () => true },
  };
  return { zustand, deps, verwaltung: erzeugeSperrVerwaltung(deps) };
}

function sperrPfad(wurzel, gegenstand) {
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, sperrDateiName(wurzel, gegenstand).name);
}

// Eine fremde Sperre entsteht von Hand und nicht über die geprüfte Funktion:
// Eine mit `nimm` angelegte stünde im Eigen-Register und wäre gerade nicht
// fremd (test/README, Muster db-sperr-lebenszyklus.test.js).
function fremdeSperre(wurzel, gegenstand, felder = {}) {
  const inhalt = {
    schemaVersion: 1,
    art: gegenstand.art,
    tabelle: gegenstand.tabelle,
    benutzer: 'bert',
    rechner: 'SC-027',
    zeitpunkt: '2026-09-19T07:30:00Z',
    marke: 'fremdfremdfremd0',
    pid: FREMDE_PID,
    ...felder,
  };
  const text = `${JSON.stringify(inhalt, null, 2)}\n`;
  const pfad = sperrPfad(wurzel, gegenstand);
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return { pfad, text, stand: standVon(text) };
}

// Alle Dateien eines Baums, wurzel-relativ. Die Aussage «keine Datei mit der
// Beleg-Endung» braucht den ganzen Bereich und nicht nur den erwarteten Ort:
// Ein Beleg an einer unerwarteten Stelle wäre derselbe Verstoß.
function dateienImBaum(wurzel, unter = wurzel) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(unter, { withFileTypes: true })) {
    const voll = path.join(unter, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...dateienImBaum(wurzel, voll));
    else gefunden.push(path.relative(wurzel, voll).split(path.sep).join('/'));
  }
  return gefunden;
}

// Gemessen wird der CODE und nicht die Prosa darüber: Die Kopf-Kommentare der
// Sperr-Module nennen den Schreibweg der Belege gerade dort, wo sie seine
// Abwesenheit begründen (Muster db-sperr-lebenszyklus.test.js).
function ohneKommentare(quelle) {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
    .join('\n');
}

// --- 4S-000952 AK8: ein Sperr-Vorgang erzeugt keinen Änderungsbeleg ----------------------

describe('Sperre und Beleg bleiben getrennt (4S-000952, AK8)', () => {
  it('4S-000952 AK8: nehmen, freigeben und brechen hinterlassen keine Datei mit der Beleg-Endung', async () => {
    const wurzel = bereich('em4me-sperre-ohne-beleg-');
    const { zustand, verwaltung } = verwaltungFuer();

    // Alle drei Vorgänge der Story kommen vor, jeder an einem eigenen
    // Gegenstand: nehmen und freigeben am Datensatz, nehmen und freigeben an
    // der Beleg-Datei selbst, brechen an der Definition.
    const genommen = await verwaltung.nimm(wurzel, DATENSATZ);
    const freigegeben = await verwaltung.gibFrei(wurzel, DATENSATZ);
    const belegGenommen = await verwaltung.nimm(wurzel, BELEG_DATEI);
    const belegFrei = await verwaltung.gibFrei(wurzel, BELEG_DATEI);
    const fremd = fremdeSperre(wurzel, DEFINITION);
    zustand.jetztMs = START_MS + FRIST_MS;
    const gebrochen = await verwaltung.brich(wurzel, DEFINITION, fremd.stand);

    // Die Vorgänge haben wirklich stattgefunden, sonst wäre der Fall auch
    // dann grün, wenn keine einzige Sperre entstanden wäre.
    expect(genommen).toMatchObject({ ok: true, gehalten: true });
    expect(freigegeben).toMatchObject({ ok: true, freigegeben: true });
    expect(belegGenommen).toMatchObject({ ok: true, gehalten: true });
    expect(belegFrei).toMatchObject({ ok: true, freigegeben: true });
    expect(gebrochen).toMatchObject({ ok: true, gehalten: true, gebrochen: true });

    expect(MDDL_EXT).toBe('.mddl');
    const belege = dateienImBaum(wurzel).filter((rel) => rel.endsWith(MDDL_EXT));
    expect(belege, `Beleg-Dateien nach reinen Sperr-Vorgängen: ${belege.join(', ')}`).toEqual([]);
    expect(fs.existsSync(belegPfadFuer(path.join(wurzel, 'Kunden.md')))).toBe(false);
  });

  it('4S-000952 AK8: kein Sperr-Modul erreicht den Schreibweg der Belege', async () => {
    // Der Struktur-Nachweis zum Verhaltens-Fall darüber. Die Gegenrichtung
    // (der Schreibweg der Belege bindet die Sperr-Verwaltung nicht ein) steht
    // als eigener Fall in db-sperr-lebenszyklus.test.js; hier läuft die
    // Prüfung von der Sperre aus.
    for (const modul of SPERR_MODULE) {
      const code = ohneKommentare(modul.quelle);
      expect(/change-log/.test(code), modul.rel).toBe(false);
    }
  });

  it('4S-000952 AK8: die Gegenprobe des Struktur-Wächters', () => {
    // Ohne sie wäre ein Wächter, dessen Muster nicht greift, von einem
    // sauberen Bestand nicht zu unterscheiden.
    expect(/change-log/.test(ohneKommentare("require('./change-log.js');"))).toBe(true);
    expect(/change-log/.test(ohneKommentare('// spricht über change-log.js'))).toBe(false);
    // Das Format eines Belegs ist etwas anderes als sein Schreibweg: Der
    // Speicher nimmt die Zeitpunkt-Form aus change-record.js, und genau das
    // soll der Wächter nicht verbieten.
    expect(ohneKommentare(SPERR_MODULE[0].quelle)).toMatch(/change-record\.js/);
  });
});

// --- 4S-000952 AK10 und 4S-000953 AK8: der Neustart --------------------------------------

describe('Fremde Sperren nach einem Neustart (4S-000952 AK10, 4S-000953 AK8)', () => {
  // Verwaltung A hält die Sperre und wird verworfen, ohne freizugeben; B ist
  // die frisch erzeugte Verwaltung derselben Anwendung nach dem Neustart, auf
  // einem anderen Rechner als A.
  async function nachNeustart() {
    const wurzel = bereich('em4me-sperre-neustart-');
    const a = verwaltungFuer({ benutzer: 'bert', rechner: 'SC-027', pid: FREMDE_PID });
    const gehalten = await a.verwaltung.nimm(wurzel, DATENSATZ);
    expect(gehalten).toMatchObject({ ok: true, gehalten: true });
    const vorher = fs.readFileSync(gehalten.pfad);
    // A wird nicht freigegeben und nicht beendet, sondern schlicht nicht mehr
    // benutzt: Genau so hinterlässt eine beendete Programm-Sitzung ihre Sperre.
    const b = verwaltungFuer();
    return { wurzel, pfad: gehalten.pfad, vorher, b: b.verwaltung };
  }

  it('4S-000953 AK8: die neue Verwaltung bekommt «belegt» samt Halter-Auskunft der alten', async () => {
    const { wurzel, pfad, vorher, b } = await nachNeustart();

    const versuch = await b.nimm(wurzel, DATENSATZ);

    expect(versuch).toMatchObject({ ok: true, gehalten: false });
    expect(versuch.konflikt).toMatchObject({
      benutzer: 'bert',
      rechner: 'SC-027',
      zeitpunkt: '2026-09-19T08:00:00Z',
      halterUnbekannt: false,
      eigenerProzess: false,
      abgelaufen: false,
      wege: ['lesen'],
    });
    // Der Nehm-Versuch hat die fremde Sperre nicht angefasst.
    expect(fs.readFileSync(pfad).equals(vorher)).toBe(true);
    // Die Gegenprobe zur eigenen verwaisten Sperre wird hier NICHT gebaut: Sie
    // ist als Fall «übernimmt eine Sperre desselben Rechners ohne Rückfrage,
    // wenn ihr Prozess tot ist» in db-sperr-lebenszyklus.test.js nachgewiesen,
    // zusammen mit «übernimmt die eigene Prozess-Nummer, solange sie nicht im
    // Eigen-Register steht».
  });

  it('4S-000952 AK10: der Speicher steht der neuen Verwaltung unverändert zur Verfügung', async () => {
    const { wurzel, pfad, vorher, b } = await nachNeustart();

    const lebend = await b.lebendeSperren(wurzel);

    expect(lebend.ok).toBe(true);
    expect(lebend.ordner).toBe(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    expect(lebend.sperren).toHaveLength(1);
    expect(lebend.sperren[0].gegenstand).toEqual({
      art: ART_DATENSATZ,
      tabelle: 'kunden.md',
      id: 'r-00042',
    });
    expect(lebend.sperren[0].konflikt).toMatchObject({ benutzer: 'bert', rechner: 'SC-027' });
    // Das Eigen-Register dagegen überlebt den Neustart nicht, und das ist der
    // Unterschied zwischen Arbeitsspeicher und Bestand: B hält nichts, die
    // Datei liegt trotzdem da.
    expect(b.gehalteneSperren()).toEqual([]);
    expect(fs.readFileSync(pfad).equals(vorher)).toBe(true);
  });
});

// --- 4S-000952 AK13: Sonderzeichen in Benutzer- und Rechnername --------------------------

describe('Benutzer und Rechner bleiben getrennt und unverändert (4S-000952, AK13)', () => {
  // Trenn- und Sonderzeichen, an denen eine zusammengesetzte Ablage scheitern
  // müsste: Leerzeichen, Umlaute, das Klammeraffen-Zeichen, beide
  // Pfad-Trenner, Doppelpunkt, Anführungszeichen und ein Zeilenumbruch. Der
  // Umbruch steht in der Mitte und nicht am Rand, weil die Konflikt-Auskunft
  // ihre Werte an den Rändern beschneidet und der Fall sonst etwas anderes
  // messen würde als er behauptet.
  const BENUTZER = 'Anna "Änne" Müller@haus\\Domäne/Ost:1\nzweite Zeile';
  const RECHNER = 'SC 026 "Süd"@werk\\Halle/Nord:2';

  it('4S-000952 AK13: ein zweiter Zugriff liest beide Angaben getrennt und unverändert zurück', async () => {
    const wurzel = bereich('em4me-sperre-sonderzeichen-');
    const { deps, verwaltung } = verwaltungFuer({ benutzer: BENUTZER, rechner: RECHNER });

    const genommen = await verwaltung.nimm(wurzel, DATENSATZ);
    expect(genommen).toMatchObject({ ok: true, gehalten: true });

    const gelesen = await leseSperre(wurzel, DATENSATZ, deps);

    expect(gelesen).toMatchObject({ ok: true, vorhanden: true, halterUnbekannt: false });
    // Getrennt abgelegt heißt: zwei Felder, jedes für sich zurückzugewinnen.
    // Eine zusammengesetzte Angabe ließe sich nur mit einer Trennregel
    // zerlegen, und die scheiterte an jedem dieser Zeichen.
    expect(gelesen.halter.benutzer).toBe(BENUTZER);
    expect(gelesen.halter.rechner).toBe(RECHNER);
    // Der Dateiname kodiert den Gegenstand und trägt den Halter nicht; sonst
    // wäre ein Name mit Pfad-Trenner gar nicht ablegbar.
    expect(path.basename(genommen.pfad)).not.toContain('Änne');
    expect(path.basename(genommen.pfad)).not.toContain('Süd');
  });

  it('4S-000952 AK13: ein Benutzername wie ein Rechnername wird nicht vertauscht', async () => {
    const wurzel = bereich('em4me-sperre-vertauscht-');
    const erste = verwaltungFuer({ benutzer: 'SC-026', rechner: 'anna' });
    const zweite = verwaltungFuer();

    await erste.verwaltung.nimm(wurzel, DATENSATZ);
    const gelesen = await leseSperre(wurzel, DATENSATZ, erste.deps);
    const versuch = await zweite.verwaltung.nimm(wurzel, DATENSATZ);

    // Beide Wege zur Auskunft nennen dieselbe Zuordnung: der lesende Zugriff
    // auf den Inhalt und die Konflikt-Auskunft eines zweiten Nehm-Versuchs.
    expect(gelesen.halter.benutzer).toBe('SC-026');
    expect(gelesen.halter.rechner).toBe('anna');
    expect(versuch).toMatchObject({ ok: true, gehalten: false });
    expect(versuch.konflikt).toMatchObject({ benutzer: 'SC-026', rechner: 'anna' });
  });
});

// --- 4S-000954 AK10: die Beleg-Datei ist chronologisch segmentierbar ---------------------

describe('Beleg-Datei: chronologisch segmentierbar ohne Riss (4S-000954, AK10)', () => {
  const HERKUNFT = () => ({ benutzer: 'anna', rechner: 'SC-026' });

  function tabelle(vorsilbe) {
    const wurzel = bereich(vorsilbe);
    const pfad = path.join(wurzel, 'Personen.md');
    fs.writeFileSync(pfad, '---\ndb-table:\n  fields: []\n---\n', 'utf8');
    return pfad;
  }

  // Fünf Belege zweier Datensätze, verschränkt und mit aufsteigenden
  // Zeitpunkten. Die Kette von r-00042 trägt drei Belege und läuft damit über
  // jede mögliche Schnittstelle hinweg.
  const FOLGE = [
    { id: 'r-00042', art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }], at: '12:00:00' },
    { id: 'r-00007', art: 'create', felder: [{ name: 'Ort', neu: 'Chur' }], at: '12:05:00' },
    {
      id: 'r-00042',
      art: 'update',
      felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
      at: '12:10:00',
    },
    {
      id: 'r-00007',
      art: 'update',
      felder: [{ name: 'Ort', alt: 'Chur', neu: 'Thun' }],
      at: '12:15:00',
    },
    {
      id: 'r-00042',
      art: 'update',
      felder: [{ name: 'Ort', alt: 'Bern', neu: 'Genf' }],
      at: '12:20:00',
    },
  ];

  async function belegFolge() {
    const pfad = tabelle('em4me-beleg-segment-');
    let nummer = 0;
    for (const eintrag of FOLGE) {
      nummer += 1;
      const geschrieben = await schreibeBeleg(
        pfad,
        { art: eintrag.art, id: eintrag.id, vorgang: String(nummer), felder: eintrag.felder },
        { jetzt: () => `2026-09-18T${eintrag.at}Z`, herkunft: HERKUNFT },
      );
      expect(geschrieben.ok, `Beleg ${nummer}`).toBe(true);
    }
    return { pfad, text: fs.readFileSync(belegPfadFuer(pfad), 'utf8') };
  }

  // Die Grenzen zwischen zwei Belegen: jede Stelle, an der die Datei mit der
  // Leerzeile des Anfüge-Textes einen neuen Marker in Spalte 0 beginnt.
  function belegGrenzen(text) {
    const grenzen = [];
    let ab = 0;
    for (;;) {
      const treffer = text.indexOf('\n|- ', ab);
      if (treffer === -1) return grenzen;
      grenzen.push(treffer);
      ab = treffer + 1;
    }
  }

  // Ein Teil wird als eigene Beleg-Datei abgelegt und mit dem bestehenden
  // Leser des Produkts gelesen, nicht mit einem zweiten, den der Prüffall
  // mitbrächte.
  async function alsEigeneDatei(vorsilbe, inhalt) {
    const pfad = tabelle(vorsilbe);
    fs.writeFileSync(belegPfadFuer(pfad), inhalt, 'utf8');
    return leseBelegDatei(pfad);
  }

  it('4S-000954 AK10: beide Teile sind für sich gültig, und die Kette über beide ist lückenlos', async () => {
    const { text } = await belegFolge();
    const grenzen = belegGrenzen(text);
    expect(grenzen).toHaveLength(5);

    // Geschnitten wird vor dem dritten Beleg, also mitten in der Kette von
    // r-00042: Der Datensatz hat Belege auf beiden Seiten des Schnitts.
    const aelter = await alsEigeneDatei('em4me-beleg-teil-alt-', text.slice(0, grenzen[2]));
    const juenger = await alsEigeneDatei('em4me-beleg-teil-neu-', text.slice(grenzen[2]));

    // Jeder Teil für sich ist eine gültige Beleg-Datei: gelesen ohne Befund,
    // mit vollständigen Belegen. Ein Kopf, den der zweite Teil nicht hätte,
    // existiert im Format nicht.
    expect(aelter).toMatchObject({ ok: true, befunde: [] });
    expect(juenger).toMatchObject({ ok: true, befunde: [] });
    expect(aelter.belege).toHaveLength(2);
    expect(juenger.belege).toHaveLength(3);
    expect(aelter.belege.every((b) => b.beschaedigt === false)).toBe(true);
    expect(juenger.belege.every((b) => b.beschaedigt === false)).toBe(true);

    // Der Schnitt liegt wirklich mitten in der Kette von r-00042. Ohne diese
    // Probe wäre der Fall auch dann grün, wenn er eine unberührte Kette
    // gemessen hätte.
    expect(belegeZuDatensatz(aelter.belege, 'r-00042')).toHaveLength(1);
    expect(belegeZuDatensatz(juenger.belege, 'r-00042')).toHaveLength(2);

    // Der ältere Teil ist wirklich der ältere: sein letzter Zeitpunkt liegt
    // vor dem ersten des jüngeren.
    const letzterAlt = aelter.belege[aelter.belege.length - 1].zeitpunkt;
    expect(letzterAlt < juenger.belege[0].zeitpunkt).toBe(true);

    // Beide Teile in zeitlicher Reihenfolge hintereinander gelesen: Die Kette
    // jedes Datensatzes ist nach der bestehenden Lücken-Prüfung lückenlos.
    const alle = [...aelter.belege, ...juenger.belege];
    const geteilt = belegeZuDatensatz(alle, 'r-00042');
    expect(geteilt.map((b) => b.felder[0].neu)).toEqual(['Basel', 'Bern', 'Genf']);
    expect(pruefeVerkettung(geteilt)).toEqual({ lueckenlos: true, luecken: [] });
    // Der zweite Datensatz, dessen Belege beide im jüngeren Teil liegen, reißt
    // ebenso wenig.
    expect(pruefeVerkettung(belegeZuDatensatz(alle, 'r-00007'))).toEqual({
      lueckenlos: true,
      luecken: [],
    });
  });

  it('4S-000954 AK10: ein Schnitt neben der Beleg-Grenze ist dagegen keiner', async () => {
    // Die Gegenprobe zur Zusage: Sie hängt an der Beleg-Grenze und nicht
    // daran, dass jeder beliebige Schnitt gutginge. Geschnitten wird mitten in
    // einer Zell-Zeile des dritten Belegs.
    const { text } = await belegFolge();
    const mitten = text.indexOf('| Bern') + '| Be'.length;
    expect(mitten).toBeGreaterThan('| Be'.length);

    const aelter = await alsEigeneDatei('em4me-beleg-riss-alt-', text.slice(0, mitten));
    const juenger = await alsEigeneDatei('em4me-beleg-riss-neu-', text.slice(mitten));

    // Der ältere Teil endet mit einem abgerissenen Beleg und meldet ihn.
    expect(aelter.befunde.length).toBeGreaterThan(0);
    const alle = [...aelter.belege, ...juenger.belege];
    expect(pruefeVerkettung(belegeZuDatensatz(alle, 'r-00042')).lueckenlos).toBe(false);
  });
});
