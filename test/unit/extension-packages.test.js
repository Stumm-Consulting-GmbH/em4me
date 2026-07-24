// 4T-0298 (Epic 3E-0053): Verzeichnis-Scan der externen Erweiterungen —
// Erkennung, Manifest-Validierung, Fehler-Einträge, ID-Whitelist für
// Quelltext-Zugriff und Entfernen. Läuft gegen ein Temp-Wurzelverzeichnis
// mit Kopien der Fixtures plus zur Laufzeit erzeugten Defekt-Fällen
// (defektes JSON liegt bewusst NICHT als Fixture im Repo — Prettier
// würde es als Syntaxfehler melden).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scanExtensionsRoot,
  readMarkdownPluginSource,
  externalExtensionInfo,
  removeExtensionDirectory,
} from '../../src/main/extension-packages.js';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'extensions');

let root;

// 4T-0703 (Epic 3E-0101): Nicht fs.cpSync(..., { recursive: true }) verwenden —
// Node v22.18.0 stürzt unter Windows bei einem Nicht-ASCII-QUELLpfad hart und
// unfangbar im Fork-Worker ab ("Worker exited unexpectedly"). Der öffentliche
// Klon liegt im Umlaut-Verzeichnis 0012_EM4me_Veröffentlichung, wodurch FIXTURES
// den Umlaut trägt. Die eigene Rekursion aus mkdirSync + copyFileSync trifft
// Umlaut-Pfade korrekt.
function kopiereRekursiv(quelle, ziel) {
  if (fs.lstatSync(quelle).isDirectory()) {
    fs.mkdirSync(ziel, { recursive: true });
    for (const kind of fs.readdirSync(quelle))
      kopiereRekursiv(path.join(quelle, kind), path.join(ziel, kind));
  } else {
    fs.copyFileSync(quelle, ziel);
  }
}

function copyFixture(name) {
  kopiereRekursiv(path.join(FIXTURES, name), path.join(root, name));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-ext-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('extension-packages: Scan (4T-0298)', () => {
  it('legt das Wurzel-Verzeichnis bei Bedarf an und liefert leer', async () => {
    const sub = path.join(root, 'noch-nicht-da');
    expect(await scanExtensionsRoot(sub)).toEqual([]);
    expect(fs.existsSync(sub)).toBe(true);
  });

  it('erkennt die Referenz-Erweiterung mit entryUrl und Kompatibilität', async () => {
    copyFixture('beispiel');
    const entries = await scanExtensionsRoot(root);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.ok).toBe(true);
    expect(e.manifest.id).toBe('beispiel');
    expect(e.apiCompatible).toBe(true);
    expect(e.entryUrl.startsWith('file:///')).toBe(true);
    expect(e.entryUrl.endsWith('/main.js')).toBe(true);
  });

  it('listet defektes JSON und ID-Verzeichnis-Abweichung als Fehler-Einträge', async () => {
    copyFixture('beispiel');
    // Defektes JSON zur Laufzeit erzeugen.
    fs.mkdirSync(path.join(root, 'kaputt'));
    fs.writeFileSync(path.join(root, 'kaputt', 'manifest.json'), '{ "id": "kaputt", ');
    // Manifest-ID passt nicht zum Verzeichnisnamen.
    kopiereRekursiv(path.join(FIXTURES, 'beispiel'), path.join(root, 'anderer-name'));
    const entries = await scanExtensionsRoot(root);
    expect(entries).toHaveLength(3);
    const byDir = Object.fromEntries(entries.map((e) => [e.dirName, e]));
    expect(byDir['beispiel'].ok).toBe(true);
    expect(byDir['kaputt'].ok).toBe(false);
    expect(byDir['kaputt'].error).toContain('manifest.json');
    expect(byDir['anderer-name'].ok).toBe(false);
    expect(byDir['anderer-name'].error).toContain('Verzeichnisnamen');
  });

  it('fehlende Einstiegs-Dateien fallen beim Scan auf', async () => {
    copyFixture('beispiel');
    fs.rmSync(path.join(root, 'beispiel', 'markdown.js'));
    const entries = await scanExtensionsRoot(root);
    expect(entries[0].ok).toBe(false);
    expect(entries[0].error).toContain('markdownPlugin');
  });

  it('inkompatible apiVersion bleibt gültiger Eintrag mit apiCompatible=false', async () => {
    copyFixture('inkompatibel');
    const entries = await scanExtensionsRoot(root);
    expect(entries[0].ok).toBe(true);
    expect(entries[0].apiCompatible).toBe(false);
  });
});

describe('extension-packages: ID-Whitelist und Entfernen (4T-0298)', () => {
  it('Quelltext-Zugriff nur für gescannte IDs mit markdownPlugin', async () => {
    copyFixture('beispiel');
    copyFixture('defekt');
    await scanExtensionsRoot(root);
    const ok = await readMarkdownPluginSource(root, 'beispiel');
    expect(ok.ok).toBe(true);
    expect(ok.source).toContain('beispiel-smiley');
    expect(ok.version).toBe('1.0.0');
    // 'defekt' hat kein markdownPlugin, fremde IDs sind unbekannt.
    expect((await readMarkdownPluginSource(root, 'defekt')).ok).toBe(false);
    expect((await readMarkdownPluginSource(root, '../boese')).ok).toBe(false);
    expect((await readMarkdownPluginSource(root, 'nie-gescannt')).ok).toBe(false);
  });

  it('externalExtensionInfo liefert Anzeige-Daten nur für gescannte IDs', async () => {
    copyFixture('beispiel');
    await scanExtensionsRoot(root);
    expect(externalExtensionInfo(root, 'beispiel')).toEqual({
      name: 'Beispiel-Erweiterung',
      version: '1.0.0',
    });
    expect(externalExtensionInfo(root, 'fremd')).toBeNull();
  });

  it('removeExtensionDirectory löscht nur gescannte Verzeichnisse', async () => {
    copyFixture('beispiel');
    await scanExtensionsRoot(root);
    expect(await removeExtensionDirectory(root, 'nie-gescannt')).toBe(false);
    expect(await removeExtensionDirectory(root, 'beispiel')).toBe(true);
    expect(fs.existsSync(path.join(root, 'beispiel'))).toBe(false);
    // Nach dem Entfernen ist die ID aus der Whitelist verschwunden.
    expect(await removeExtensionDirectory(root, 'beispiel')).toBe(false);
  });
});
