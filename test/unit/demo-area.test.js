// 4T-000632 (Epic 3E-000102): Unit-Tests für das Demo-Area-Erstell-Modul
// (src/main/area/demo-area.js). Geprüft werden ein Manifest-Wächter über die
// mitgelieferten Demo-Inhalte (src/demo — beide Richtungen), die reine
// Leer-Prüfung isEmptyDirListing und createDemoAreaAt gegen echte Temp-
// Ordner (Erfolg inklusive Binär-Inhalt, Ablehnung nicht-leerer bzw.
// fehlender Ziele). Stil-Muster benachbarter Main-Tests
// (test/unit/caption-color.test.js).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEMO_SOURCE_DIR,
  isEmptyDirListing,
  createDemoAreaAt,
} from '../../src/main/area/demo-area.js';
// 4T-001826 (Epic 3E-000254): die Leser, über die die Anwendung Beleg-Datei,
// Tabelle und Zähler-Datei selbst liest, und die Prüfer, an denen Dateiliste
// und Bereichs-Watcher die Markdown-Data-Familie übergehen.
import { leseBelegDatei } from '../../src/main/database/change-log.js';
import { leseTabellenBestand } from '../../src/main/database/record-auftrag-bestand.js';
import { werteDes, zellText } from '../../src/main/database/record-auftrag-plan.js';
import { leseVorgangsDatei } from '../../src/main/database/vorgangs-kennung.js';
import { belegeZuDatensatz, pruefeVerkettung } from '../../src/shared/database/change-record.js';
import { isMarkdownDataPath } from '../../src/shared/markdown-data-family.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import { baueIgnorierRegel } from '../../src/main/area/area-watch-ignore.js';
import { collectMarkdownFiles } from '../../src/main/index/scan.js';
// 4T-002045 (Epic 3E-000258): der echte Erzeuger der Abfrage samt Index und der
// Prüfer des Format-Vertrags, für die Datensatz-Abfragen von „08 Queries.md".
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { validateResultSet } from '../../src/shared/query/result-set.js';
// 4T-002083 (Epic 3E-000259): Marke und Block-Zählung der Abfrage-Datei, über
// dieselben Leser wie der Katalog der Übersicht.
import { datenbankMarken } from '../../src/shared/database/behaelter.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import {
  zaehleAbfrageBloecke,
  trifftMaskenAngabe,
  waehleStandardMaske,
} from '../../src/main/database/table-catalog.js';
import { parseTableDefinition } from '../../src/shared/database/table-definition.js';
import { zerlegeMaskenKoerper, felderDesKoerpers } from '../../src/shared/database/form-body.js';
import { parseListAngaben } from '../../src/shared/database/list-angaben.js';
// 4T-002313 (Epic 3E-000263): Prüfung und Auflösung der Rollen, über dieselben
// Funktionen wie Katalog und Schreib-Schnittstelle.
import { pruefeSteckbriefRollen } from '../../src/shared/database/rollen-angaben.js';
import { loeseRechte } from '../../src/shared/database/rechte.js';
// 4T-002174 (Epic 3E-000337): die Datenregel des Abfrage-Diagramms, für die
// beiden Diagramm-Blöcke von „08 Queries.md".
import {
  queryChartSuitability,
  buildQueryChartInput,
} from '../../src/shared/query/result-chart.js';

// Ein Block mit einer Diagramm-Form; die beiden älteren Fälle der Seite
// lassen ihn aus, der Fall 4T-002174 prüft ihn.
const DIAGRAMM_FORM = /\bDISPLAY\s+(bar|line)\b/i;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');

// Hart kodierte Soll-Liste der mitgelieferten Demo-Dateien (relative Pfade
// unter src/demo, Forward-Slashes). Ein Zuwachs oder Wegfall im Bestand muss
// diese Liste bewusst nachziehen.
const EXPECTED_FILES = [
  // 4T-001366 (Epic 3E-000171): Bereichsdatei der Demo-Area. Sie traegt allein die
  // Start-Seiten-Festlegung auf „00 Welcome.md", damit die mitgelieferte Demo
  // die Funktion vorfuehrt statt sie nur zu beschreiben: Wer die Demo-Area
  // oeffnet, landet auf ihrer Willkommens-Seite.
  // 4T-001735 (Epic 3E-000307): dazu die Kalender-Sektion mit dem Block «Demo
  // calendars» (gregorianischer und japanischer Kalender aus den Vorlagen, in
  // englischer Sprache), auf die «14 Calendar Systems.md» sich stützt. Von Hand
  // wird an ihr nichts geschrieben: Sie entsteht allein durch
  // scripts/demo-kalender-erzeugen.js, und test/unit/demo-kalender.test.js hält
  // sie gegen die Vorlagen.
  'Area_Settings.mdda',
  // 4T-001826 (Epic 3E-000254): die Zähler-Datei der Vorgangs-Kennung des
  // Demo-Bereichs. Sie reist mit, weil sonst der erste eigene Schreibvorgang des
  // Anwenders eine Vorgangs-Kennung zöge, die in den mitgelieferten Belegen
  // schon vorkommt; ihr Stand passt zur höchsten Vorgangs-Kennung von
  // „Library.mddl". Von Hand wird an ihr nichts geschrieben: Sie entsteht allein
  // durch den Lauf von scripts/demo-belege-erzeugen.js.
  'Area_Database.mdda',
  '00 Welcome.md',
  '01 Markdown Basics.md',
  '02 Extended Syntax.md',
  '03 Tables.md',
  '04 Links and Structure.md',
  '05 Properties and Profiles.md',
  '06 Tasks and Reminders.md',
  '07 Events and Journals.md',
  '08 Queries.md',
  '09 Diagrams and Formulas.md',
  '10 Attachments.md',
  '11 Templates.md',
  // 4T-001657 (Epic 3E-000287): die Canvas-Seite der Fuehrung — eine Flaeche mit
  // vier Karten und zwei Verbindungen (eine farbig und beschriftet, eine
  // beidseitig gerichtet). Sie traegt wie die uebrigen Fuehrungs-Seiten das
  // Schlagwort #demo und erscheint damit in der ersten Abfrage von
  // „08 Queries.md"; deren Zeilen-Erwartung in der E2E-Spec ist mitgewachsen.
  // 4T-001703 (Epic 3E-000288): dazu eine Gruppe und zwei Formen.
  // 4T-001750 (Epic 3E-000289): dazu eine Verweis-Karte auf einen Abschnitt von
  // „04 Links and Structure.md" und eine Bild-Karte auf die vorhandene Anlage
  // „attachments/demo-image.png". Beide Ziele liegen INNERHALB der Sammlung —
  // die Demo-Area muss ohne den Bereich des Anwenders funktionieren —, und dass
  // sie dort auch bleiben, haelt der Verweis-Waechter demo-links.test.js fest.
  // Die Datei-Liste waechst dabei nicht: Das Bild ist das der Anlagen-Seite.
  // 4T-001772 (Epic 3E-000290): dazu ein Abschnitt, der zur Karten-Liste fuehrt
  // und ihre Tasten nennt (Zugang, Wanderung, Bearbeiten, Loeschen,
  // Kontextmenue-Taste, Ziel-Wahl der Verbindung und das Filter-Feld samt
  // Strg+F). Er kommt ohne den Bereich des Anwenders aus und ohne neue Datei —
  // die Soll-Liste bleibt unveraendert, und die E2E-Zaehlungen ebenso.
  // 4T-001778 (Epic 3E-000291): dazu ein Abschnitt zum portablen Export der
  // Flaeche — was aus Kopf, Gruppe, Karten, Verweis- und Bild-Karte, Formen und
  // Verbindungen wird, was nicht mitreist und dass Drucken und PDF-Export
  // unberuehrt bleiben. Wieder ohne neue Datei und ohne neues Verweis-Ziel:
  // Soll-Liste und E2E-Zaehlungen bleiben unveraendert.
  // 4T-001807 (Epic 3E-000292): dazu ein Abschnitt zum Austausch mit dem
  // offenen Format JSON Canvas — beide Menue-Wege an der Beispiel-Flaeche, was
  // dabei ersetzt wird und der Bericht am Ende. Bewusst OHNE Beispiel-Datei des
  // fremden Formats: Die Demo-Area muss ohne den Bereich des Anwenders
  // funktionieren, und eine Datei mit der Endung .canvas waere in ihr weder
  // Dokument noch Verweis-Ziel. Soll-Liste und E2E-Zaehlungen bleiben deshalb
  // auch hier unveraendert.
  '12 Canvas.md',
  // 4T-001854 (Epic 3E-000110): die Kanban-Station der Fuehrung — ein echtes
  // Tafel-Dokument mit dem Kopf-Kennzeichen `kanban-plugin`, drei Spalten,
  // Karten mit eingerueckten Folgezeilen, einer wiederholenden Aufgabe und
  // einer Erledigt-Spalte mit ihrem fett gesetzten Kennzeichen. Sie traegt wie
  // die uebrigen Fuehrungs-Seiten das Schlagwort #demo und erscheint damit in
  // der ersten Abfrage von „08 Queries.md"; deren Zeilen-Erwartung in der
  // E2E-Spec rechnet aus dem Bestand und waechst von selbst mit.
  //
  // Sie traegt als einzige Demo-Seite bewusst KEINE Titel-Ueberschrift: Der
  // Format-Kern liest jede Ueberschrift als Spalte, eine Titel-Zeile waere also
  // eine leere erste Spalte auf der Tafel. Der einfuehrende Text steht deshalb
  // vor der ersten Ueberschrift, wo er zu keiner Spalte gehoert.
  //
  // 4T-001909 (Epic 3E-000318): um die Angaben der Stufe 2 ergänzt — eine
  // Karte mit Termin und Uhrzeit in der Aufgaben-Schreibweise, eine Karte mit
  // Tag (#planning, das Schlagwort der Seite, damit die Tag-Menge der
  // Demo-Area gleich bleibt), eine Spalte mit Obergrenze (2) und drei Karten,
  // damit die Hervorhebung zu sehen ist, und ein Archiv-Abschnitt hinter der
  // Trennlinie mit einer archivierten Karte samt Zeitstempel. Die Datei-Liste
  // bleibt unverändert.
  //
  // 4T-001960 (Epic 3E-000319): um die Stufe 3 ergänzt — eine Karte mit
  // Verweis auf die Tour-Seite „07 Events and Journals" (vorhandenes
  // Verweis-Ziel) und ein Einstellungs-Block am Dateiende mit einer Feldwahl
  // aus `topic` und `chapter`, damit die Karte Angaben aus dem Kopf der
  // verlinkten Seite zeigt; dazu ein Absatz, der die Wege nennt. Keine neue
  // Datei, kein neues Verweis-Ziel: Datei-Liste und E2E-Zählungen bleiben.
  //
  // 4T-001735 (Epic 3E-000307): Die Tafel ist nicht mehr die letzte Station;
  // ihr Schluss-Satz führt weiter zu «14 Calendar Systems».
  '13 Kanban.md',
  // 4T-001735 (Epic 3E-000307): die Station der Kalender-Systeme — Werte im
  // gregorianischen und im japanischen Kalender, der Weg zur Eingabe-Hilfe mit
  // dem Tag im anderen Kalender, der Weg zum Aufklapp-Menü der Vorlagen samt
  // der neun mitgelieferten Kalender und der Hinweis auf den Arbeitsmodus
  // «Full». Die Kalender selbst trägt die Bereichsdatei (oben). Schlagwörter
  // demo und planning wie die Tafel, damit die Tag-Menge der Demo-Area gleich
  // bleibt; die Zeilen-Erwartung der ersten Abfrage von „08 Queries.md" in der
  // E2E-Spec rechnet aus dem Bestand und wächst von selbst mit.
  '14 Calendar Systems.md',
  // 4T-002165 (Epic 3E-000149): die Praesentations-Station der Fuehrung, ihre
  // letzte Seite - ein echtes Praesentations-Dokument mit dem Kennzeichen
  // `presentation: true`, Theme, Seitenzahl und Fusszeile im Kopf, fuenf Folien
  // an `---`, einer Linie `***` AUF einer Folie, je einer Sprecher-Notiz als
  // privater Kommentar und als HTML-Kommentar und einer Zweiteilung mit der
  // vorhandenen Anlage "attachments/demo-image.png" (kein neues Verweis-Ziel,
  // die Datei-Liste waechst allein um diese Seite). Sie traegt wie die
  // uebrigen Fuehrungs-Seiten das Schlagwort #demo und das vorhandene
  // Schlagwort #visual, damit die Tag-Menge der Demo-Area gleich bleibt; die
  // Zeilen-Erwartung der ersten Abfrage von "08 Queries.md" rechnet aus dem
  // Bestand und waechst von selbst mit. Bei der Zusammenfuehrung mit dem
  // Release 1.147.0 am 2026-10-11 von 14 auf 15 umnummeriert, hinter
  // "14 Calendar Systems", das ihr nun die Weiterleitung gibt.
  '15 Presentation.md',
  // 4T-000645 (Epic 3E-000127): astronomischer Themenbereich als vierstufige
  // Unterseiten-Hierarchie (Galaxie, Stern, Planet, Mond) plus drei
  // ergaenzende Themenseiten. Traeger der Hierarchie ist der Dateiname mit
  // dem Unterseiten-Trennzeichen U+2215 (Division Slash), NICHT die
  // Ordner-Lage: alle sechs Seiten liegen im Wurzelverzeichnis.
  'Ages.md',
  'Distances.md',
  // 4T-001551 (Epic 3E-000251): die Datenbank-Tabelle der Demo-Area. Sie steht
  // bewusst neben der Tour und nicht als Kapitel in ihr: Eine Tabellen-Datei
  // ist technische Ablage, die man ansieht, aber nicht durcharbeitet.
  'Library.md',
  // 4T-001826 (Epic 3E-000254): die Beleg-Datei der Demo-Tabelle mit drei
  // Belegen der Art «Geändert». Erst mit ihr zeigt die Beleg-Ansicht im
  // Demo-Bereich etwas, ohne dass der Anwender zuvor selbst Datensätze ändern
  // muss. Von Hand wird an ihr nichts geschrieben: Sie entsteht allein durch die
  // Schreib-Schnittstelle der Anwendung, gerufen von
  // scripts/demo-belege-erzeugen.js, das dabei auch die drei geänderten Zellen
  // von „Library.md" schreibt.
  'Library.mddl',
  // 4T-001762 (Epic 3E-000253, Demo-Area-Prüfschritt): das Steckbrief-Dokument
  // der Demo-Datenbank, angelegt auf die Entscheidung des Product Owners vom
  // 2026-09-17, mit der die dort vorgelegte Ergänzungs-Frage beantwortet ist. Es
  // trägt allein den Behälter `db-database` im Frontmatter und macht die
  // Demo-Area damit zum Datenbank-Bereich; erst dadurch sind die Übersicht der
  // Datenbank-Objekte und der Einstellungs-Abschnitt «Datenbank» in der Sandbox
  // überhaupt sichtbar. Der Name folgt dem von `Library.md`: ohne
  // Nummern-Präfix, weil beide neben der Tour stehen und nicht in ihr.
  'Library Database.md',
  // 4T-001946 (Epic 3E-000257, Demo-Area-Prüfschritt): die zweite Demo-Tabelle,
  // angelegt auf die Entscheidung des Product Owners vom 2026-09-24. Erst eine
  // Verweis-Spalte macht Wertehilfe, Anzeige-Form im Verweis-Feld,
  // Verwendungsnachweis und Lösch-Schutz im Demo-Bereich vorführbar; «Loans»
  // verweist mit der Spalte `book` auf «Library» und trägt dazu eine
  // Datensatz-Regel und eine Bearbeitbarkeits-Bedingung. Wie «Library.md» mit
  // den Schlagwörtern demo und data, damit die Tag-Menge der Demo-Area gleich
  // bleibt; ohne Beleg-Datei, weil scripts/demo-belege-erzeugen.js allein
  // «Library.md» bedient.
  'Loans.md',
  // 4T-002045 (Epic 3E-000258, Demo-Area-Prüfschritt): die dritte Demo-Tabelle,
  // die Mitarbeitenden der Bibliothek in drei Stufen. Ihr Verweis-Feld `manager`
  // zeigt auf dieselbe Tabelle; erst ein Selbstbezug macht die Hierarchie-Abfragen
  // und den Baum im Abschnitt «Records of the library database» von
  // „08 Queries.md" vorführbar. Wie «Library.md» und «Loans.md» mit den
  // Schlagwörtern demo und data, damit die Tag-Menge der Demo-Area gleich bleibt;
  // ohne Beleg-Datei. Dass jede Datensatz-Abfrage der Seite ein Ergebnis liefert,
  // hält der Block «Datensatz-Abfragen» am Ende dieser Datei fest.
  'Staff.md',
  // 4T-002083 (Epic 3E-000259, Demo-Area-Prüfschritt): die Abfrage-Datei der
  // Demo-Area, die Bücher der Bibliothek über einer Seitenzahl aus ihrem eigenen
  // Frontmatter. Sie trägt die Marke `db-query` und genau einen Abfrage-Block,
  // erscheint deshalb im Abschnitt «Abfragen» der Übersicht, und
  // „08 Queries.md" bettet sie ein. Wie die Tabellen mit den Schlagwörtern demo
  // und data, damit die Tag-Menge der Demo-Area gleich bleibt. Dass ihr Block
  // ein Ergebnis liefert und sich auf die Datei selbst bezieht, hält der Fall
  // «gruppierte Abfragen und Abfrage-Datei …» am Ende dieser Datei fest.
  'Long Books.md',
  // 4T-002187 (Epic 3E-000261, Demo-Area-Prüfschritt): die beiden Masken-Dateien
  // der Bibliothek. «Library Form» ist die Standard-Maske, die «Library.md» mit
  // `form` nennt, und zeigt Feld- und Wert-Platzhalter samt Link auf die zweite;
  // «Library Short Form» ist die knappe zweite Maske derselben Tabelle. Ohne
  // Schlagwörter, wie die erzeugte Fassung einer Masken-Datei, damit die
  // Abfragen über #demo unverändert bleiben. Dass beide ohne Hinweis zerlegen,
  // hält der Block «Masken-Dateien der Bibliothek» am Ende dieser Datei fest.
  'Library Form.md',
  'Library Short Form.md',
  // 4T-002254 (Epic 3E-000262, Demo-Area-Prüfschritt): die Listen-Maske über
  // «Loans» und die Masken-Datei, die sie mit `form` nennt und die «Loans.md» als
  // Standard-Maske führt. «Loans List» trägt wie «Long Books» die Schlagwörter
  // demo und data, «Loans Form» wie die Masken der Bibliothek keine; «Library
  // Form» bettet die Liste als Positions-Bereich ein. Dass alle drei wohlgeformt
  // sind, hält der Block «Listen-Maske der Ausleihen» am Ende dieser Datei fest.
  'Loans List.md',
  'Loans Form.md',
  'Light Speed.md',
  'Milky Way.md',
  'Milky Way∕Proxima Centauri.md',
  'Milky Way∕Sun.md',
  'Milky Way∕Sun∕Earth.md',
  'Milky Way∕Sun∕Earth∕Moon.md',
  'Milky Way∕Sun∕Mars.md',
  // 4T-000850 (Epic 3E-000147): das Demo-Buch (Buch-Ordner mit Begleitdatei,
  // Buch-Datei, vier Kapiteln über zwei Ordner und einer bewusst nicht
  // eingehängten Datei). Bewusst OHNE eigene Seite im Wurzelverzeichnis: die
  // E2E-Demo-Spec zählt dort die Markdown-Seiten und die #demo-Treffer der
  // ersten Abfrage; der Einstieg steht deshalb als Absatz in „00 Welcome".
  'Bookshelf/Bookshelf.md',
  'Bookshelf/Shelf_Settings.mdda',
  'Bookshelf/Demo Book/01 Setting Out.md',
  'Bookshelf/Demo Book/04 Homecoming.md',
  'Bookshelf/Demo Book/Book_Settings.mdda',
  'Bookshelf/Demo Book/Demo Book.md',
  'Bookshelf/Demo Book/Notes to Self.md',
  'Bookshelf/Demo Book/Parts/02 The Harbour.md',
  'Bookshelf/Demo Book/Parts/03 Storms and Detours.md',
  // 4T-000871 (Buch = Bereich): Das Cover liegt IM Buch-Ordner, weil die
  // Bereichs-Grenze der Buch-Applikation nichts ausserhalb laedt.
  'Bookshelf/Demo Book/cover.png',
  'Bookshelf/Field Notes/01 Observations.md',
  'Bookshelf/Field Notes/Book_Settings.mdda',
  'Bookshelf/Field Notes/Field Notes.md',
  'Bookshelf/Field Notes/cover.png',
  'Templates/Meeting Note.md',
  'attachments/demo-document.pdf',
  'attachments/demo-image.png',
];

// Rekursiver Scan eines Verzeichnisses: relative POSIX-Pfade aller Dateien.
function listFilesRecursive(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

describe('Demo-Area: Manifest-Wächter über src/demo (4T-000632)', () => {
  it('src/demo trägt exakt die erwarteten Dateien (beide Richtungen)', () => {
    const actual = listFilesRecursive(DEMO_DIR);
    const expected = [...EXPECTED_FILES].sort();
    const fehlend = expected.filter((f) => !actual.includes(f));
    const ueberzaehlig = actual.filter((f) => !expected.includes(f));
    expect(fehlend, `Fehlende Demo-Dateien: ${fehlend.join(', ')}`).toEqual([]);
    expect(ueberzaehlig, `Überzählige Demo-Dateien: ${ueberzaehlig.join(', ')}`).toEqual([]);
  });

  it('DEMO_SOURCE_DIR zeigt auf src/demo', () => {
    expect(path.resolve(DEMO_SOURCE_DIR)).toBe(DEMO_DIR);
  });
});

describe('isEmptyDirListing (4T-000632)', () => {
  it('leeres Array ist leer', () => {
    expect(isEmptyDirListing([])).toBe(true);
  });

  it('nicht-leeres Array und Nicht-Arrays sind nicht leer', () => {
    expect(isEmptyDirListing(['x'])).toBe(false);
    expect(isEmptyDirListing(['a', 'b'])).toBe(false);
    expect(isEmptyDirListing(null)).toBe(false);
    expect(isEmptyDirListing(undefined)).toBe(false);
    expect(isEmptyDirListing('nicht-array')).toBe(false);
  });
});

describe('createDemoAreaAt gegen echte Temp-Ordner (4T-000632)', () => {
  const temps = [];
  const mkTemp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-unit-'));
    temps.push(dir);
    return dir;
  };

  afterEach(async () => {
    while (temps.length) {
      const dir = temps.pop();
      await fsp
        .rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        .catch(() => {});
    }
  });

  // Kleine, injizierbare Test-Quelle: eine Datei im Wurzelverzeichnis, eine in
  // einem Unterordner und eine Binär-Datei mit Nicht-UTF8-Bytes (Buffer). So
  // sind rekursives Kopieren und Binär-Sicherheit unabhängig vom echten Demo-
  // Bestand prüfbar.
  async function makeTestSource() {
    const src = mkTemp();
    await fsp.writeFile(path.join(src, 'root.md'), '# Wurzel\n', 'utf8');
    await fsp.mkdir(path.join(src, 'sub'));
    await fsp.writeFile(path.join(src, 'sub', 'nested.md'), '# Verschachtelt\n', 'utf8');
    const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await fsp.writeFile(path.join(src, 'sub', 'blob.bin'), binary);
    return { src, binary };
  }

  it('Erfolg: kopiert rekursiv inklusive Binär-Inhalt in ein leeres Ziel', async () => {
    const { src, binary } = await makeTestSource();
    const dest = mkTemp();
    const result = await createDemoAreaAt(dest, src);
    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(dest, 'root.md'), 'utf8')).toBe('# Wurzel\n');
    expect(fs.readFileSync(path.join(dest, 'sub', 'nested.md'), 'utf8')).toBe('# Verschachtelt\n');
    // Binär-Datei bit-genau kopiert (Buffer-Vergleich).
    const copiedBin = fs.readFileSync(path.join(dest, 'sub', 'blob.bin'));
    expect(Buffer.compare(copiedBin, binary)).toBe(0);
  });

  it('nicht-leeres Ziel: not-empty, das Ziel bleibt unverändert', async () => {
    const { src } = await makeTestSource();
    const dest = mkTemp();
    await fsp.writeFile(path.join(dest, 'vorhanden.txt'), 'bereits da\n', 'utf8');
    const result = await createDemoAreaAt(dest, src);
    expect(result).toEqual({ ok: false, error: 'not-empty' });
    // Der vorhandene Eintrag ist danach exakt noch da; nichts hinzukopiert.
    expect(fs.readdirSync(dest)).toEqual(['vorhanden.txt']);
    expect(fs.readFileSync(path.join(dest, 'vorhanden.txt'), 'utf8')).toBe('bereits da\n');
  });

  it('nicht existierendes Ziel: not-found', async () => {
    const { src } = await makeTestSource();
    const dest = path.join(mkTemp(), 'gibt-es-nicht');
    const result = await createDemoAreaAt(dest, src);
    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});

// 4T-001826 (Epic 3E-000254): Die mitgelieferten Änderungsbelege des
// Demo-Bereichs. Die Soll-Werte stehen hier bewusst ein zweites Mal und nicht
// aus scripts/demo-belege-erzeugen.js übernommen: Der Fall prüft die
// ausgelieferten Dateien gegen die Entscheidung der Sitzung vom 2026-09-23, nicht
// gegen das Skript, das sie erzeugt hat.
const DEMO_BELEGE = [
  {
    id: 'r-00005',
    vorgang: '1',
    zeitpunkt: '2026-09-01T09:15:00Z',
    feld: { name: 'onLoan', alt: '', neu: 'x' },
  },
  {
    id: 'r-00001',
    vorgang: '2',
    zeitpunkt: '2026-09-08T14:30:00Z',
    feld: { name: 'onLoan', alt: 'x', neu: '' },
  },
  {
    id: 'r-00016',
    vorgang: '3',
    zeitpunkt: '2026-09-15T11:05:00Z',
    feld: { name: 'author', alt: 'Douglas Hofstadter', neu: 'Douglas R. Hofstadter' },
  },
];

describe('Demo-Area: Kopier-Weg nimmt Beleg- und Zähler-Datei mit (4T-001826)', () => {
  const temps = [];

  afterEach(async () => {
    while (temps.length) {
      const dir = temps.pop();
      await fsp
        .rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        .catch(() => {});
    }
  });

  // Nachgewiesen am echten Kopier-Weg und am echten Demo-Bestand, nicht aus dem
  // Quelltext geschlossen: Die Beleg-Datei gehört zur Markdown-Data-Familie, und
  // diese Familie wird an anderen Stellen der Anwendung ausgeschlossen.
  it('createDemoAreaAt legt Library.mddl und Area_Database.mdda byte-gleich ins Ziel', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-belege-'));
    temps.push(dest);
    const result = await createDemoAreaAt(dest);
    expect(result).toEqual({ ok: true });
    for (const name of ['Library.mddl', 'Area_Database.mdda', 'Library.md']) {
      const kopiert = fs.readFileSync(path.join(dest, name));
      expect(Buffer.compare(kopiert, fs.readFileSync(path.join(DEMO_DIR, name))), name).toBe(0);
    }
  });
});

describe('Demo-Area: die ausgelieferten Änderungsbelege (4T-001826)', () => {
  const tabelle = path.join(DEMO_DIR, 'Library.md');

  it('Library.mddl trägt drei intakte Belege der Art update mit fester Herkunft und festen Zeitpunkten', async () => {
    const gelesen = await leseBelegDatei(tabelle);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.befunde).toEqual([]);
    expect(gelesen.belege).toHaveLength(DEMO_BELEGE.length);
    DEMO_BELEGE.forEach((soll, i) => {
      const beleg = gelesen.belege[i];
      expect(beleg.beschaedigt, soll.id).toBe(false);
      expect(beleg.art).toBe('update');
      expect(beleg.id).toBe(soll.id);
      expect(String(beleg.vorgang)).toBe(soll.vorgang);
      expect(beleg.zeitpunkt).toBe(soll.zeitpunkt);
      expect(beleg.benutzer).toBe('demo');
      expect(beleg.rechner).toBe('demo-pc');
      expect(beleg.felder).toEqual([soll.feld]);
    });
  });

  it('je Datensatz lückenlos verkettet, und der letzte Beleg schließt an die Zelle von Library.md an', async () => {
    const gelesen = await leseBelegDatei(tabelle);
    const bestand = await leseTabellenBestand(fsp, tabelle, 'Library.md');
    expect(bestand.ok).toBe(true);
    expect(bestand.dateien).toHaveLength(1);
    for (const soll of DEMO_BELEGE) {
      const belege = belegeZuDatensatz(gelesen.belege, soll.id);
      expect(belege, soll.id).toHaveLength(1);
      expect(pruefeVerkettung(belege)).toEqual({ lueckenlos: true, luecken: [] });
      const record = bestand.dateien[0].records.get(soll.id);
      const treffer = bestand.karte.get(soll.feld.name.toLowerCase());
      expect(zellText(werteDes(record), treffer.index), soll.id).toBe(belege.at(-1).felder[0].neu);
    }
  });

  it('Area_Database.mdda trägt lastTx 3, passend zur höchsten Vorgangs-Kennung; lastId bleibt 24', async () => {
    const zaehler = await leseVorgangsDatei(DEMO_DIR);
    expect(zaehler.ok).toBe(true);
    expect(zaehler.vorhanden).toBe(true);
    expect(zaehler.letzter).toBe(3);
    const gelesen = await leseBelegDatei(tabelle);
    expect(Math.max(...gelesen.belege.map((b) => Number(b.vorgang)))).toBe(zaehler.letzter);
    const bestand = await leseTabellenBestand(fsp, tabelle, 'Library.md');
    expect(bestand.lastId).toBe(24);
  });
});

describe('Demo-Area: Dateiliste und Watcher übergehen Beleg- und Zähler-Datei (4T-001826)', () => {
  const namen = ['Library.mddl', 'Area_Database.mdda'];

  it('beide gehören zur Markdown-Data-Familie, die Dateiliste und Direkt-Öffnen ausschließen', () => {
    for (const name of namen)
      expect(isMarkdownDataPath(path.join(DEMO_DIR, name)), name).toBe(true);
    // Gegenprobe: Die Tabelle selbst ist ein Dokument.
    expect(isMarkdownDataPath(path.join(DEMO_DIR, 'Library.md'))).toBe(false);
  });

  it('die Ignorier-Regel des Bereichs-Watchers übergeht beide', () => {
    const regel = baueIgnorierRegel(
      { rootPath: DEMO_DIR, sperrOrdner: DEFAULT_LOCK_FOLDER_NAME },
      isMarkdownDataPath,
    );
    for (const name of namen) expect(regel(path.join(DEMO_DIR, name)), name).toBe(true);
    expect(regel(path.join(DEMO_DIR, 'Library.md'))).toBe(false);
  });

  it('der Verzeichnis-Scan des Index führt beide nicht als Dokument', async () => {
    const scan = await collectMarkdownFiles(DEMO_DIR, true);
    const dokumente = scan.files.map((f) => path.basename(f));
    for (const name of namen) expect(dokumente, name).not.toContain(name);
    expect(dokumente).toContain('Library.md');
  });
});

// 4T-002045 (Epic 3E-000258, Demo-Area-Prüfschritt): Die Datensatz-Abfragen der
// Seite „08 Queries.md" werden gegen eine Kopie des ausgelieferten Bestands
// ausgewertet, über denselben Kopier-Weg wie das Erstellen der Demo-Area und den
// echten Erzeuger der Abfrage. So hält der Fall fest, was die Seite verspricht:
// Jeder Block mit RECORDS liefert ohne Fehler genau die Datensätze, die sein
// Begleittext ankündigt. Die übrigen Blöcke der Seite pinnt DA-04 an der
// gestarteten Anwendung (kein Abfrage-Fehler auf der ganzen Seite).
describe('Demo-Area: Datensatz-Abfragen von «08 Queries» liefern Ergebnisse (4T-002045)', () => {
  const temps = [];
  let wurzel = null;

  afterEach(async () => {
    if (wurzel) {
      vi.useFakeTimers();
      releaseRoot(wurzel);
      vi.advanceTimersByTime(61_000);
      vi.useRealTimers();
      wurzel = null;
    }
    while (temps.length) {
      const dir = temps.pop();
      await fsp
        .rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        .catch(() => {});
    }
  });

  // Die Kopie als Bereich indexieren, wie es die Abfrage-Prüfdateien tun.
  async function indexiere(datei) {
    let stand = backlinksFor(datei);
    wurzel = rootForActiveFile(datei);
    for (let i = 0; i < 500 && stand.status === 'indexing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      stand = backlinksFor(datei);
    }
    expect(stand.status).toBe('ready');
  }

  const namen = (rs) => rs.rows.map((r) => r.origin.display);

  it('jeder Block mit RECORDS liefert ohne Fehler die angekündigten Datensätze', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-abfragen-'));
    temps.push(dest);
    expect(await createDemoAreaAt(dest)).toEqual({ ok: true });
    const seite = path.join(dest, '08 Queries.md');
    await indexiere(seite);

    const text = fs.readFileSync(seite, 'utf8');
    // 4T-002083: Die gruppierten Blöcke des Abschnitts «Groups and totals»
    // prüft der Block am Ende dieser Datei; hier bleiben die acht des Abschnitts
    // «Records of the library database».
    const bloecke = [...text.matchAll(/```perspective-query\r?\n([\s\S]*?)\r?\n```/g)]
      .map((m) => m[1])
      .filter((abfrage) => /\bRECORDS\b/.test(abfrage) && !/\bGROUP BY\b/.test(abfrage))
      // 4T-002174: Die Diagramm-Blöcke prüft der eigene Fall unten.
      .filter((abfrage) => !DIAGRAMM_FORM.test(abfrage));
    expect(bloecke).toHaveLength(8);
    const mengen = bloecke.map((abfrage) => {
      const rs = frontmatterQueryFor(seite, abfrage, undefined, undefined, 'en-US').resultSet;
      expect(validateResultSet(rs), abfrage).toEqual([]);
      expect(rs.state.queryError, abfrage).toBeFalsy();
      expect(rs.rows.length, abfrage).toBeGreaterThan(0);
      return rs;
    });
    const [langeBuecher, ausleihen, einBuch, unterAda, seit2015, nachOben, baum, unbekannt] =
      mengen;

    // Bücher mit mehr als 500 Seiten, nach Autor; Kopf «Author» und «Pages».
    expect(namen(langeBuecher)).toEqual([
      'Gödel, Escher, Bach',
      'The Glass Bead Game',
      'The Man Without Qualities',
      "Foucault's Pendulum",
      'The Name of the Rose',
    ]);
    expect(langeBuecher.columns.map((c) => c.label)).toEqual(['Author', 'Pages']);
    // Ausleihen mit Titel und Autor des Buches über den Verweis, nach Fälligkeit.
    expect(ausleihen.rows.map((r) => r.values.slice(0, 2))).toEqual([
      ['The Name of the Rose', 'Umberto Eco'],
      ['A Wizard of Earthsea', 'Ursula K. Le Guin'],
      ['The Cyberiad', 'Stanisław Lem'],
    ]);
    // Gegenrichtung über den Schlüssel-Wert des Buches.
    expect(namen(einBuch)).toEqual(['Tom Okafor']);
    // Hierarchie ohne die Direktorin, gefiltert und nach oben.
    expect(namen(unterAda)).toEqual([
      'Ben Okoro',
      'Chloe Martin',
      'Dev Patel',
      'Elena Rossi',
      'Finn Larsen',
      'Grace Liu',
    ]);
    expect(namen(seit2015)).toEqual(['Chloe Martin', 'Grace Liu', 'Dev Patel', 'Finn Larsen']);
    expect(namen(nachOben)).toEqual(['Ada Brennan', 'Chloe Martin']);
    for (const rs of [unterAda, seit2015, nachOben]) expect(rs.state.hint).toBeNull();
    // Der Baum: jede Zeile trägt ihren Eltern-Verweis, Ada ist die Wurzel.
    expect(baum.wishes.display).toEqual({ form: 'tree', by: 'manager' });
    const eltern = new Map(baum.rows.map((r) => [r.origin.display, r.parent && r.parent.id]));
    expect(Object.fromEntries(eltern)).toEqual({
      'Ada Brennan': null,
      'Ben Okoro': 'r-00001',
      'Chloe Martin': 'r-00001',
      'Dev Patel': 'r-00002',
      'Elena Rossi': 'r-00002',
      'Finn Larsen': 'r-00003',
      'Grace Liu': 'r-00003',
    });
    // Die unbekannte Form reist als Wunsch mit; den Hinweis setzt die Anzeige.
    expect(unbekannt.wishes.display).toEqual({ form: 'cards', by: null });
    expect(unbekannt.rows).toHaveLength(7);
  });

  // 4T-002083 (Epic 3E-000259, Demo-Area-Prüfschritt): die drei gruppierten
  // Blöcke des Abschnitts «Groups and totals» und die eingebettete Abfrage-Datei
  // «Long Books». Je eine Gegenprobe belegt, dass die Bedingung über die Gruppe
  // wirklich filtert und dass `this.` die Abfrage-Datei meint.
  it('gruppierte Abfragen und Abfrage-Datei liefern die angekündigten Ergebnisse (4T-002083)', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-gruppen-'));
    temps.push(dest);
    expect(await createDemoAreaAt(dest)).toEqual({ ok: true });
    const seite = path.join(dest, '08 Queries.md');
    await indexiere(seite);
    const abfrageDatei = path.join(dest, 'Long Books.md');

    const bloeckeVon = (text) =>
      [...text.matchAll(/```perspective-query\r?\n([\s\S]*?)\r?\n```/g)].map((m) => m[1]);
    const auswerten = (traeger, abfrage) => {
      const rs = frontmatterQueryFor(traeger, abfrage, undefined, undefined, 'en-US').resultSet;
      expect(validateResultSet(rs), abfrage).toEqual([]);
      expect(rs.state.queryError, abfrage).toBeFalsy();
      return rs;
    };
    const seitenText = fs.readFileSync(seite, 'utf8');
    const gruppiert = bloeckeVon(seitenText).filter(
      (abfrage) => /\bGROUP BY\b/.test(abfrage) && !DIAGRAMM_FORM.test(abfrage),
    );
    expect(gruppiert).toHaveLength(3);
    const [jeAutor, jeBuch, jeThema] = gruppiert.map((abfrage) => auswerten(seite, abfrage));

    // Bücher je Autor: nur die mit mehr als einem Buch, die meisten zuerst.
    expect(jeAutor.groupColumns.map((c) => c.label)).toEqual(['Author']);
    expect(jeAutor.columns.map((c) => c.label)).toEqual(['Books', 'Pages']);
    expect(jeAutor.groups.map((g) => [g.value, ...g.values])).toEqual([
      ['Ursula K. Le Guin', 3, 828],
      ['Hermann Hesse', 2, 795],
      ['Italo Calvino', 2, 425],
      ['Jorge Luis Borges', 2, 416],
      ['Stanisław Lem', 2, 519],
      ['Umberto Eco', 2, 1520],
      ['W. G. Sebald', 2, 594],
    ]);
    // Gegenprobe: Ohne HAVING stehen alle sechzehn Autoren da.
    const ohneBedingung = gruppiert[0].replace(/\r?\nHAVING[^\r\n]*/, '');
    expect(ohneBedingung).not.toMatch(/HAVING/);
    expect(auswerten(seite, ohneBedingung).groups).toHaveLength(16);

    // Ausleihen je Buch: das Buch als Datensatz-Verweis mit Klick-Ziel, dazu die
    // späteste Fälligkeit als Datum über der Gruppe.
    expect(jeBuch.groupColumns.map((c) => c.label)).toEqual(['Book']);
    expect(
      jeBuch.groups.map((g) => [g.value.kind, g.value.table, g.value.id, g.value.display]),
    ).toEqual([
      ['record', 'Library', 'r-00005', 'A Wizard of Earthsea'],
      ['record', 'Library', 'r-00004', 'The Cyberiad'],
      ['record', 'Library', 'r-00001', 'The Name of the Rose'],
    ]);
    expect(jeBuch.groups.map((g) => g.values[0])).toEqual([1, 1, 1]);
    expect(jeBuch.groups.map((g) => g.values[1].ms)).toEqual([
      new Date(2026, 8, 29).getTime(),
      new Date(2026, 9, 13).getTime(),
      new Date(2026, 8, 15).getTime(),
    ]);

    // Seiten je Thema: dieselbe Einteilung, die eine ungruppierte Liste ergibt,
    // ohne die Themen mit nur einer Seite; die Seiten je Gruppe nach Namen.
    const flach = auswerten(seite, 'LIST topic FROM #demo SORT file.name');
    const erwartet = new Map();
    for (const r of flach.rows) {
      const thema = r.values[0];
      if (!erwartet.has(thema)) erwartet.set(thema, []);
      erwartet.get(thema).push(r.origin.name);
    }
    const mehrere = [...erwartet].filter(([, namen]) => namen.length > 1);
    expect(mehrere.length).toBeGreaterThan(1);
    // Gegenprobe der Bedingung: Es gibt Themen mit nur einer Seite, die entfallen.
    expect(mehrere.length).toBeLessThan(erwartet.size);
    expect(
      jeThema.groups.map((g) => [g.value, g.rows.map((i) => jeThema.rows[i].origin.name)]),
    ).toEqual(
      mehrere.sort(([a], [b]) => (a === null) - (b === null) || String(a).localeCompare(String(b))),
    );
    expect(jeThema.groups.find((g) => g.value === 'data')).toBeTruthy();

    // Die Abfrage-Datei: Marke und genau ein Abfrage-Block, eingebettet auf der Seite.
    const dateiText = fs.readFileSync(abfrageDatei, 'utf8');
    const kopf = extractFrontmatter(dateiText);
    expect(datenbankMarken(kopf.data)).toEqual(['query']);
    expect(zaehleAbfrageBloecke(kopf.body)).toBe(1);
    expect(seitenText).toContain('![[Long Books]]');
    const [eigeneAbfrage] = bloeckeVon(dateiText);
    const langeBuecher = auswerten(abfrageDatei, eigeneAbfrage);
    expect(langeBuecher.rows.map((r) => r.origin.display)).toEqual([
      'The Man Without Qualities',
      "Foucault's Pendulum",
      'Gödel, Escher, Bach',
      'The Name of the Rose',
      'The Glass Bead Game',
    ]);
    // Gegenprobe: Mit der Seite als Träger fehlt `minpages`, und nichts bleibt;
    // die Treffer oben kommen also aus dem Frontmatter der Abfrage-Datei.
    expect(auswerten(seite, eigeneAbfrage).rows).toEqual([]);
  });

  // 4T-002174 (Epic 3E-000337, Demo-Area-Prüfschritt): die beiden Blöcke des
  // Abschnitts «A query as a chart». Geprüft wird über die echte Auswertung und
  // dieselbe Datenregel, aus der die Anzeige das Bild baut: Eignung, Art,
  // Beschriftungen und Werte, wie der Erklär-Text sie ankündigt.
  it('die Diagramm-Abfragen zeigen Balken je Autor und eine Linie je Buch (4T-002174)', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-demo-diagramme-'));
    temps.push(dest);
    expect(await createDemoAreaAt(dest)).toEqual({ ok: true });
    const seite = path.join(dest, '08 Queries.md');
    await indexiere(seite);

    const text = fs.readFileSync(seite, 'utf8');
    expect(text).toContain('## A query as a chart');
    const bloecke = [...text.matchAll(/```perspective-query\r?\n([\s\S]*?)\r?\n```/g)]
      .map((m) => m[1])
      .filter((abfrage) => DIAGRAMM_FORM.test(abfrage));
    expect(bloecke).toHaveLength(2);
    const [balken, linie] = bloecke.map((abfrage) => {
      const rs = frontmatterQueryFor(seite, abfrage, undefined, undefined, 'en-US').resultSet;
      expect(validateResultSet(rs), abfrage).toEqual([]);
      expect(rs.state.queryError, abfrage).toBeFalsy();
      expect(queryChartSuitability(rs), abfrage).toEqual({ suitable: true, reason: null });
      return rs;
    });

    // Balken: je Autor mit mehr als einem Buch eine Rubrik, die meisten Seiten zuerst.
    expect(balken.wishes.display).toEqual({ form: 'bar', by: null });
    const bild1 = buildQueryChartInput(balken, { type: 'bar', title: null, noneLabel: '(none)' });
    expect(bild1.drawable).toBe(true);
    expect(bild1.categories).toEqual([
      'Umberto Eco',
      'Ursula K. Le Guin',
      'Hermann Hesse',
      'W. G. Sebald',
      'Stanisław Lem',
      'Italo Calvino',
      'Jorge Luis Borges',
    ]);
    expect(bild1.series).toEqual([{ name: 'Pages', values: [1520, 828, 795, 594, 519, 425, 416] }]);
    expect(bild1.skippedColumns).toEqual([]);
    expect(bild1.omitted).toBe(0);

    // Linie: die ersten acht Bücher nach Eingang, beschriftet mit dem Titel.
    expect(linie.wishes.display).toEqual({ form: 'line', by: null });
    const bild2 = buildQueryChartInput(linie, { type: 'line', title: null, noneLabel: '(none)' });
    expect(bild2.drawable).toBe(true);
    expect(bild2.type).toBe('line');
    // Bücher vom selben Tag ordnet der Titel, die zweite Angabe von SORT.
    expect(bild2.categories).toEqual([
      "Foucault's Pendulum",
      'The Name of the Rose',
      'Solaris',
      'The Cyberiad',
      'A Wizard of Earthsea',
      'The Dispossessed',
      "If on a Winter's Night a Traveler",
      'Invisible Cities',
    ]);
    expect(bild2.series).toEqual([
      { name: 'Pages', values: [880, 640, 224, 295, 183, 341, 260, 165] },
    ]);
    expect(bild2.omitted).toBe(0);
  });
});

// 4T-002187 (Epic 3E-000261, Demo-Area-Prüfschritt): Die Masken-Dateien der
// Bibliothek sind wohlgeformt. «Library.md» nennt mit `form` die Standard-Maske,
// die Auswahl-Regel des Katalogs findet sie unter beiden Masken-Dateien, und
// beide Körper zerlegen sich gegen die echte Definition ohne Hinweis; der
// Wert-Platzhalter ist ein gültiger Ausdruck, und die Links führen wechselseitig
// auf die andere Maske derselben Tabelle.
describe('Demo-Area: Masken-Dateien der Bibliothek (4T-002187)', () => {
  const lies = (name) => fs.readFileSync(path.join(DEMO_DIR, name), 'utf8');
  const LIBRARY = parseTableDefinition(extractFrontmatter(lies('Library.md')).data);

  it('Library.md nennt «Library Form» als Standard-Maske, und die Auswahl-Regel trifft sie', () => {
    expect(LIBRARY.hints).toEqual([]);
    expect(LIBRARY.form).toBe('Library Form');
    // Pfade wie im Katalog, nach Pfad sortiert: Die Angabe muss die Wahl tragen,
    // auch wenn die Reihenfolge nach Pfad eine andere Datei vorn sähe.
    const eigene = ['Library Short Form.md', 'Library Form.md'];
    const wahl = waehleStandardMaske({ eigene, zugeordnet: [], angabe: LIBRARY.form });
    expect(wahl).toEqual({ pfad: 'Library Form.md', hinweis: null });
    expect(trifftMaskenAngabe('Library Short Form.md', LIBRARY.form)).toBe(false);
  });

  it('beide Masken-Dateien nennen die Tabelle Library und zerlegen ohne Hinweis', () => {
    for (const name of ['Library Form.md', 'Library Short Form.md']) {
      const kopf = extractFrontmatter(lies(name));
      expect(datenbankMarken(kopf.data), name).toEqual(['form']);
      expect(kopf.data['db-form']).toEqual({ table: 'Library' });
      const { hints } = zerlegeMaskenKoerper(kopf.body, LIBRARY.fields);
      expect(hints, name).toEqual([]);
    }
  });

  it('die Standard-Maske trägt Felder, einen gültigen Wert-Platzhalter und den Link auf die zweite', () => {
    const kopf = extractFrontmatter(lies('Library Form.md'));
    const { segmente } = zerlegeMaskenKoerper(kopf.body, LIBRARY.fields);
    expect(felderDesKoerpers(segmente)).toEqual(LIBRARY.fields.map((feld) => feld.name));
    const werte = segmente.filter((s) => s.art === 'wert');
    expect(werte.map((s) => s.ausdruck)).toEqual(['pages / 40']);
    expect(werte[0].ast).not.toBeNull();
    expect(kopf.body).toContain('[[Library Short Form]]');
    expect(extractFrontmatter(lies('Library Short Form.md')).body).toContain('[[Library Form]]');
  });
});

// 4T-002254 (Epic 3E-000262, Demo-Area-Prüfschritt): Listen-Maske, Masken-Datei
// und Positions-Bereich der Ausleihen sind wohlgeformt. «Loans List» ist eine
// Listen-Maske mit allen drei Handgriffen und nennt «Loans Form», die
// «Loans.md» als Standard-Maske führt; deren Körper liest Wert und Bereich über
// das Verweis-Feld «book», und «Library Form» bettet die Liste ohne BY ein,
// weil «Loans» genau ein Verweis-Feld auf «Library» hat.
describe('Demo-Area: Listen-Maske der Ausleihen (4T-002254)', () => {
  const lies = (name) => fs.readFileSync(path.join(DEMO_DIR, name), 'utf8');
  const LOANS = parseTableDefinition(extractFrontmatter(lies('Loans.md')).data);

  it('Loans List ist eine Listen-Maske mit drei Handgriffen und genau einem Abfrage-Block', () => {
    const kopf = extractFrontmatter(lies('Loans List.md'));
    expect(datenbankMarken(kopf.data)).toEqual(['query']);
    expect(zaehleAbfrageBloecke(kopf.body)).toBe(1);
    const angaben = parseListAngaben(kopf.data);
    expect(angaben.hints).toEqual([]);
    expect(angaben.istListe).toBe(true);
    expect(angaben.form).toBe('Loans Form');
    expect(angaben.allow).toEqual(['create', 'update', 'delete']);
  });

  it('Loans.md nennt «Loans Form», und deren Körper liest Wert und Bereich über book', () => {
    expect(LOANS.hints).toEqual([]);
    expect(LOANS.form).toBe('Loans Form');
    const kopf = extractFrontmatter(lies('Loans Form.md'));
    expect(kopf.data['db-form']).toEqual({ table: 'Loans' });
    const { segmente, hints } = zerlegeMaskenKoerper(kopf.body, LOANS.fields);
    expect(hints).toEqual([]);
    expect(felderDesKoerpers(segmente)).toEqual(LOANS.fields.map((feld) => feld.name));
    const wert = segmente.find((s) => s.art === 'wert');
    expect([wert.ausdruck, wert.pfad]).toEqual(['book.title', true]);
    const bereich = segmente.find((s) => s.art === 'bereich');
    expect([bereich.bedingung, bereich.pfad]).toEqual(['book.onloan', true]);
  });

  it('Library Form bettet Loans List als Positions-Bereich ohne BY ein', () => {
    const LIBRARY = parseTableDefinition(extractFrontmatter(lies('Library.md')).data);
    const kopf = extractFrontmatter(lies('Library Form.md'));
    const { segmente } = zerlegeMaskenKoerper(kopf.body, LIBRARY.fields);
    const listen = segmente.filter((s) => s.art === 'liste');
    expect(listen.map((s) => [s.datei, s.by])).toEqual([['Loans List', null]]);
    const verweise = LOANS.fields.filter((f) => f.type === 'record');
    expect(verweise.map((f) => [f.name, f.options.table])).toEqual([['book', 'Library']]);
  });
});

// 4T-002313 (Epic 3E-000263, Demo-Area-Prüfschritt): Rollen und Feld-Sperre der
// Bibliothek sind wohlgeformt. Der Steckbrief führt «librarian» mit `all` und
// «assistant» mit Erlaubnissen an allen drei Tabellen, ohne Hinweis; die
// Vorgabe-Rolle «librarian» lässt jeden Anwender der Demo uneingeschränkt, weil
// keine Zuordnung `users` mitgeliefert wird (die Demo-Belege tragen den Benutzer
// «demo», 4T-002308). Mit «assistant» als Vorgabe gilt, was der Erklär-Text
// der Seite zusagt. Das Feld `book` der Ausleihen ist fest gesperrt.
describe('Demo-Area: Rollen und Feld-Sperre der Bibliothek (4T-002313)', () => {
  const lies = (name) => fs.readFileSync(path.join(DEMO_DIR, name), 'utf8');
  const TABELLEN = ['Library', 'Loans', 'Staff'];
  const STECKBRIEF = extractFrontmatter(lies('Library Database.md')).data;

  it('der Steckbrief trägt zwei Rollen und die Vorgabe-Rolle librarian, ohne Hinweis und ohne users', () => {
    const geprueft = pruefeSteckbriefRollen(STECKBRIEF, TABELLEN);
    expect(geprueft.leseHinweise).toEqual([]);
    expect(geprueft.pruefHinweise).toEqual([]);
    expect(Object.keys(geprueft.rollen)).toEqual(['librarian', 'assistant']);
    expect(geprueft.defaultRole).toBe('librarian');
    expect(STECKBRIEF['db-database'].users).toBeUndefined();
    const { rolle, quelle, rechte } = loeseRechte({
      ...geprueft,
      anmeldename: 'jemand',
      tabellenNamen: TABELLEN,
    });
    expect([rolle, quelle]).toEqual(['librarian', 'vorgabe']);
    for (const name of TABELLEN)
      expect(rechte[name]).toEqual({ create: true, update: true, delete: true, define: true });
  });

  it('mit assistant als Vorgabe-Rolle gelten die Einschränkungen des Erklär-Texts', () => {
    const geprueft = pruefeSteckbriefRollen(STECKBRIEF, TABELLEN);
    const { rechte } = loeseRechte({
      ...geprueft,
      defaultRole: 'assistant',
      anmeldename: 'jemand',
      tabellenNamen: TABELLEN,
    });
    expect(rechte.Library).toEqual({ create: false, update: true, delete: false, define: false });
    expect(rechte.Loans).toEqual({ create: true, update: true, delete: true, define: false });
    expect(rechte.Staff).toEqual({ create: false, update: false, delete: false, define: false });
  });

  it('Loans.md sperrt das Feld book fest und lässt die übrigen Felder ohne Bedingung', () => {
    const LOANS = parseTableDefinition(extractFrontmatter(lies('Loans.md')).data);
    expect(LOANS.hints).toEqual([]);
    const gesperrt = LOANS.fields.filter((f) => f.editable);
    expect(gesperrt.map((f) => [f.name, f.editable.art])).toEqual([['book', 'fest']]);
  });
});
