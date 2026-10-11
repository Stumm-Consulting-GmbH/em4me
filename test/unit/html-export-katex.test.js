// 4T-002167 (Epic 3E-000347): Das KaTeX-Stilblatt des HTML-Exports.
//
// Der Hauptprozess liefert ueber den Kanal html:katexStyles das Stilblatt mit
// eingesetzten Schriften. Geprueft wird, dass danach kein Verweis auf eine
// Schrift-Datei uebrig ist — sonst erschienen die Formeln beim Empfaenger der
// Datei ohne ihre Schrift — und dass ein fehlender Verweis-Ersatz laut wird.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  katexStilMitSchriften,
  KATEX_ORDNER,
} = require('../../src/main/documents/katex-export-stil.js');

beforeAll(() => {
  // Das Stilblatt ist ein Erzeugnis des Renderer-Baus (nicht versioniert);
  // ohne vorherigen Bau erzeugt es dasselbe Werkzeug.
  if (!fs.existsSync(path.join(KATEX_ORDNER, 'katex.css'))) {
    require('../../scripts/build-katex-assets.js').buildKatexAssets();
  }
});

describe('katexStilMitSchriften', () => {
  it('setzt jede Schrift als Daten-Adresse ein und laesst keinen Datei-Verweis uebrig', async () => {
    const css = await katexStilMitSchriften();
    expect(css).not.toMatch(/url\((["']?)fonts\//);
    const adressen = css.match(/url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/g) || [];
    const schriften = fs
      .readdirSync(path.join(KATEX_ORDNER, 'fonts'))
      .filter((n) => n.endsWith('.woff2'));
    expect(adressen.length).toBeGreaterThanOrEqual(schriften.length);
    expect(css).toContain('.katex');
  });

  it('wirft, wenn ein Schrift-Verweis nicht ersetzt werden kann', async () => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'katex-export-'));
    try {
      fs.mkdirSync(path.join(ordner, 'fonts'));
      fs.writeFileSync(path.join(ordner, 'fonts', 'A.woff2'), Buffer.from([1, 2, 3]));
      fs.writeFileSync(
        path.join(ordner, 'katex.css'),
        '@font-face{src:url(fonts/A.woff2) format("woff2")}' +
          '@font-face{src:url(fonts/B.woff) format("woff")}',
      );
      await expect(katexStilMitSchriften(ordner)).rejects.toThrow(/Schrift-Verweis/);

      fs.writeFileSync(
        path.join(ordner, 'katex.css'),
        '@font-face{src:url(fonts/A.woff2) format("woff2")}',
      );
      const css = await katexStilMitSchriften(ordner);
      expect(css).toBe('@font-face{src:url(data:font/woff2;base64,AQID) format("woff2")}');
    } finally {
      fs.rmSync(ordner, { recursive: true, force: true });
    }
  });
});
