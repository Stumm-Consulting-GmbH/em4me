// 4T-000632 (Epic 3E-000102): Unit-Tests für das Demo-Area-Erstell-Modul
// (src/main/area/demo-area.js). Geprüft werden ein Manifest-Wächter über die
// mitgelieferten Demo-Inhalte (src/demo — beide Richtungen), die reine
// Leer-Prüfung isEmptyDirListing und createDemoAreaAt gegen echte Temp-
// Ordner (Erfolg inklusive Binär-Inhalt, Ablehnung nicht-leerer bzw.
// fehlender Ziele). Stil-Muster benachbarter Main-Tests
// (test/unit/caption-color.test.js).
import { afterEach, describe, expect, it } from 'vitest';
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
  'Area_Settings.mdda',
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
  '12 Canvas.md',
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
  // 4T-001762 (Epic 3E-000253, Demo-Area-Prüfschritt): das Steckbrief-Dokument
  // der Demo-Datenbank, angelegt auf die Entscheidung des Product Owners vom
  // 2026-09-17, mit der die dort vorgelegte Ergänzungs-Frage beantwortet ist. Es
  // trägt allein den Behälter `db-database` im Frontmatter und macht die
  // Demo-Area damit zum Datenbank-Bereich; erst dadurch sind die Übersicht der
  // Datenbank-Objekte und der Einstellungs-Abschnitt «Datenbank» in der Sandbox
  // überhaupt sichtbar. Der Name folgt dem von `Library.md`: ohne
  // Nummern-Präfix, weil beide neben der Tour stehen und nicht in ihr.
  'Library Database.md',
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
