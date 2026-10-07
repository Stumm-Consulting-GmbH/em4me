// 4T-002068 (Epic 3E-000344): Wächter über die Bild-Regel der Inhalts-Regel des
// Anzeige-Fensters (`src/renderer/index.html`).
//
// **Was zugesichert wird.** Die Inhalts-Regel trägt genau eine Bild-Angabe
// `img-src`, und deren Wert ist genau `data:`. Bilder und Hintergründe lädt das
// Fenster damit allein aus Daten-Adressen; lokale Bilder kommen über einen
// geprüften Weg mit Grenze, Endungs-Liste und Größen-Grenze als Daten-Adresse
// an (src/main/preload-images.js, Kanal embed:readImage).
//
// **Warum der Wortlaut und nicht nur «kein file:».** Gemessen am 2026-10-01
// (4T-001920) und an der gebauten Programmdatei bestätigt: Mit `'self'` in der
// Bild-Angabe lud das Fenster jede Datei-Adresse, weil die Seite selbst von
// `file://` stammt, und damit auch Adressen auf eine Netz-Freigabe. Eine
// Erweiterung um eine beliebige weitere Quelle öffnet einen Weg, den die
// Ablauf-Prüfungen nicht vollständig abdecken; wer die Regel ändern will, ändert
// diesen Wächter bewusst mit und begründet es im Vorgang.
//
// Gelesen wird im Modulkopf (Bestands-Lesungen gehören in den Modulkopf,
// test/README.md).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'),
  'utf8',
);

// Alle Inhalts-Regeln der Seite als Meta-Angabe, je mit ihrem Wert.
function inhaltsRegeln(html) {
  const regeln = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/http-equiv\s*=\s*"Content-Security-Policy"/i.test(tag)) continue;
    const inhalt = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag);
    regeln.push(inhalt ? inhalt[1] : '');
  }
  return regeln;
}

// Die Angaben einer Regel: Name in Kleinschreibung und Liste der Quellen.
function angaben(regel) {
  return regel
    .split(';')
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '')
    .map((teil) => {
      const [name, ...quellen] = teil.split(/\s+/);
      return { name: name.toLowerCase(), quellen };
    });
}

describe('Inhalts-Regel des Anzeige-Fensters: Bild-Angabe', () => {
  it('die Seite trägt genau eine Inhalts-Regel', () => {
    expect(inhaltsRegeln(INDEX_HTML)).toHaveLength(1);
  });

  it('die Regel trägt genau eine Bild-Angabe, und deren Wert ist genau «data:»', () => {
    const [regel] = inhaltsRegeln(INDEX_HTML);
    const bild = angaben(regel).filter((a) => a.name === 'img-src');
    expect(bild).toHaveLength(1);
    expect(bild[0].quellen).toEqual(['data:']);
  });
});
