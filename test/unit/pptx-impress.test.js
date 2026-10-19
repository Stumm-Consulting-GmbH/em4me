// 4T-002296 (Epic 3E-000349): Öffnungs-Probe der PowerPoint-Datei in
// LibreOffice Impress. Der Container-Test pptx-writer.test.js prüft Aufbau,
// Beziehungen und Wohlgeformtheit mit eigenen Lesern; ob ein fremdes
// Office-Programm die Datei tatsächlich öffnet, zeigt erst dieses Programm
// selbst. Der Fall erzeugt drei Folien 16:9 mit Notizen auf zwei davon,
// wandelt die Datei mit `soffice --headless --convert-to pdf` und verlangt ein
// PDF mit genau drei Seiten — eine Seite je Folie, die Notizen bleiben ohne
// eigene Seite, weil der PDF-Export sie in der Vorgabe nicht ausgibt.
//
// **Wo er läuft:** im Linux-Prüfstand, dessen Abbild `libreoffice-impress`
// mitbringt (scripts/pruefstand.Dockerfile). Liegt `soffice` nicht im Pfad,
// etwa auf der Haupt-Plattform ohne LibreOffice, wird der Fall nach dem Muster
// der plattformgebundenen Prüffälle mit `describe.skipIf` übersprungen; der
// Titel nennt die Bedingung. Gesucht wird ohne Kind-Prozess über die
// Verzeichnisse von PATH, damit die Erkennung selbst nichts startet.
//
// Das Profil von LibreOffice liegt in einem Wegwerf-Verzeichnis
// (`-env:UserInstallation`), damit der Lauf weder ein vorhandenes Profil noch
// eine laufende Instanz berührt und ohne beschreibbares Heimat-Verzeichnis
// auskommt.
import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';
import { erstellePptx } from '../../src/shared/presentation/pptx-writer.js';
import { AUFRAEUM_ZEITLIMIT, PROZESS_ZEITLIMIT } from '../zeitlimits.js';

// 4T-000944: Datei-weites Limit, weil der Fall einen realen Prozess startet;
// Werte und Begründung in test/zeitlimits.js. Dasselbe Limit begrenzt den
// Kind-Prozess, damit ein hängendes soffice mit eigener Meldung endet.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

/** Pfad zu `soffice` aus PATH oder `null`; unter Windows mit den Endungen der Konsole. */
function findeSoffice() {
  const namen = process.platform === 'win32' ? ['soffice.com', 'soffice.exe'] : ['soffice'];
  for (const verzeichnis of (process.env.PATH || '').split(path.delimiter)) {
    if (!verzeichnis) continue;
    for (const name of namen) {
      const kandidat = path.join(verzeichnis, name);
      try {
        if (fs.statSync(kandidat).isFile()) return kandidat;
      } catch {
        // nicht vorhanden: nächster Kandidat
      }
    }
  }
  return null;
}

const SOFFICE = findeSoffice();

/** Ein gültiges PNG aus einem Pixel (wie in pptx-writer.test.js); `farbe` unterscheidet die Bilder. */
function png(farbe) {
  const block = (typ, daten) => {
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(daten.length);
    const typDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
    const pruef = Buffer.alloc(4);
    pruef.writeUInt32BE(crc32(typDaten));
    return Buffer.concat([laenge, typDaten, pruef]);
  };
  const kopf = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const zeile = Buffer.from([0, farbe, 0x80, 0x40]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      block('IHDR', kopf),
      block('IDAT', deflateRawSync(zeile)),
      block('IEND', Buffer.alloc(0)),
    ]),
  );
}

/**
 * Seitenzahl eines PDF: die Seiten-Objekte (`/Type /Page`, nicht `/Pages`).
 * Die Inhalts-Ströme sind komprimiert und tragen deshalb keinen Fehltreffer.
 */
function pdfSeiten(pdf) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
}

const verzeichnisse = [];

afterAll(() => {
  for (const v of verzeichnisse) fs.rmSync(v, { recursive: true, force: true });
});

describe.skipIf(!SOFFICE)(
  'LibreOffice Impress öffnet die PowerPoint-Datei (nur mit soffice im Pfad)',
  () => {
    it('wandelt drei Folien 16:9 mit Notizen in ein PDF mit drei Seiten', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-impress-'));
      verzeichnisse.push(tmp);
      const profil = path.join(tmp, 'profil');
      const pptx = path.join(tmp, 'vortrag.pptx');
      fs.writeFileSync(
        pptx,
        erstellePptx({
          folien: [
            { bild: png(10), notizen: ['Begrüßung & Überblick'] },
            { bild: png(120), notizen: [] },
            { bild: png(230), notizen: ['Erste Zeile\nZweite Zeile', 'Nachtrag'] },
          ],
          format: '16:9',
          titel: 'Öffnungs-Probe',
          erzeuger: 'EM4me Prüfstand',
          erstellt: new Date(Date.UTC(2026, 9, 18, 9, 0, 0)),
          deflate: deflateRawSync,
        }),
      );

      // execFileSync wirft bei Rückgabe ungleich 0 samt stderr; der Fehler trägt den Befund.
      const ausgabe = execFileSync(
        SOFFICE,
        [
          `-env:UserInstallation=${pathToFileURL(profil).href}`,
          '--headless',
          '--norestore',
          '--convert-to',
          'pdf',
          '--outdir',
          tmp,
          pptx,
        ],
        { encoding: 'utf8', timeout: PROZESS_ZEITLIMIT, stdio: ['ignore', 'pipe', 'pipe'] },
      );

      // soffice meldet eine nicht ladbare Datei mit Rückgabe 0; erst das PDF belegt das Öffnen.
      const pdfPfad = path.join(tmp, 'vortrag.pdf');
      expect(fs.existsSync(pdfPfad), `kein PDF entstanden; soffice meldete: ${ausgabe}`).toBe(true);
      const pdf = fs.readFileSync(pdfPfad);
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdfSeiten(pdf)).toBe(3);
    });
  },
);
