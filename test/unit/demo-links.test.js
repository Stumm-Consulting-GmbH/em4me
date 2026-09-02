// 4T-000645 (Epic 3E-000127): Wächter über die Verweis-Ziele der mitgelieferten
// Beispiel-Sammlung (AK7 der Story 4S-000823: "Innerhalb der Sammlung fehlt kein
// Verweis-Ziel").
//
// Warum ein eigener Prüffall: Ein toter Wiki-Link in der Sammlung fällt sonst
// erst dem Anwender auf, und zwar in genau dem Bestand, der ihm die Anwendung
// erklären soll. Das wiegt schwerer als ein toter Link an anderer Stelle.
//
// Die Auflösung nutzt bewusst die Bestands-Helfer (subpages.js, link-scan.js)
// statt eigener Nachbauten: Ein zweiter Auflöser hier würde beim ersten
// Auseinanderlaufen einen grünen Test bei rotem Produkt liefern.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUBPAGE_SEP,
  toFileBasename,
  isRelativeTarget,
  expandRelativeTarget,
} from '../../src/shared/subpages.js';
import {
  createWikiLinkRegex,
  maskInlineCode,
  FENCE_RE,
} from '../../src/shared/markdown/link-scan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');

// Alle Markdown-Dateien der Sammlung, rekursiv, mit ihrem Basename ohne Endung.
function markdownDateien(dir, gesammelt = []) {
  for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
    const voll = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) markdownDateien(voll, gesammelt);
    else if (eintrag.name.toLowerCase().endsWith('.md'))
      gesammelt.push({ voll, basename: eintrag.name.slice(0, -3) });
  }
  return gesammelt;
}

const DATEIEN = markdownDateien(DEMO_DIR);
// Suchraum: Basename -> vorhanden. Die Sammlung wird als ein Bereich geöffnet,
// die Auflösung sucht darin unabhängig vom Ordner.
const VORHANDEN = new Set(DATEIEN.map((d) => d.basename));

// Alle Nicht-Markdown-Dateien der Sammlung nach Dateinamen, für die Prüfung
// eingebetteter Anlagen (Bilder, PDF).
function anlagenIndex(dir, gesammelt = new Map()) {
  for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
    const voll = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) anlagenIndex(voll, gesammelt);
    else if (!eintrag.name.toLowerCase().endsWith('.md')) gesammelt.set(eintrag.name, voll);
  }
  return gesammelt;
}

const ANLAGEN = anlagenIndex(DEMO_DIR);

// Ein Wiki-Ziel in den Dateinamen-Basename übersetzen. Relative Ziele ([[..]],
// [[/Name]]) werden gegen die Träger-Datei expandiert, absolute über die
// Schrägstrich-Schreibweise in die U+2215-Form.
function zielBasename(ziel, traegerBasename) {
  const t = String(ziel || '').trim();
  if (!t) return null;
  if (isRelativeTarget(t)) return expandRelativeTarget(traegerBasename, t);
  return toFileBasename(t);
}

describe('Verweis-Ziele der Beispiel-Sammlung', () => {
  it('findet überhaupt Markdown-Dateien und Wiki-Links', () => {
    expect(DATEIEN.length).toBeGreaterThan(10);
  });

  it('löst jeden Wiki-Link innerhalb der Sammlung auf', () => {
    const tot = [];
    for (const datei of DATEIEN) {
      const text = fs.readFileSync(datei.voll, 'utf8');
      let imCodeblock = false;
      for (const roh of text.split('\n')) {
        // Code-Blöcke überspringen: Die Sammlung erklärt die Link-Syntax und
        // zeigt dafür Beispiel-Ziele, die absichtlich nicht existieren
        // ("[[/Details]]"). Ein Beispiel ist kein Verweis.
        if (FENCE_RE.test(roh)) {
          imCodeblock = !imCodeblock;
          continue;
        }
        if (imCodeblock) continue;
        // Inline-Code ebenso ausblenden; dieselbe Maskierung nutzt der Bestand
        // beim Link-Scan.
        const zeile = maskInlineCode(roh);
        const re = createWikiLinkRegex();
        let m;
        while ((m = re.exec(zeile)) !== null) {
          // Anker abschneiden: "[[Seite#Abschnitt]]" verweist auf die Seite,
          // der Anker ist ein Sprungziel darin.
          const ziel = m[1].split('#')[0].trim();
          if (!ziel) continue;
          // Ziel mit Datei-Endung ist eine Anlage, kein Seiten-Verweis: gegen
          // das Dateisystem prüfen statt gegen den Satz der Seiten-Basenamen.
          if (/\.[a-z0-9]{2,5}$/i.test(ziel) && !/\.md$/i.test(ziel)) {
            const treffer = ANLAGEN.get(path.basename(ziel));
            if (!treffer) tot.push(`${datei.basename}: Anlage "${ziel}" existiert nicht`);
            continue;
          }
          const basename = zielBasename(ziel, datei.basename);
          if (!basename) {
            tot.push(`${datei.basename}: unaufloesbares Ziel "${ziel}"`);
            continue;
          }
          if (!VORHANDEN.has(basename)) {
            tot.push(`${datei.basename}: "${ziel}" -> "${basename}" existiert nicht`);
          }
        }
      }
    }
    expect(tot).toEqual([]);
  });

  it('hält die vierstufige Hierarchie des astronomischen Bereichs vollständig', () => {
    // Jede Ebene muss existieren: eine Unterseite ohne Elternseite zeigt im
    // Breadcrumb eine gepunktete, nicht klickbare Zwischenebene.
    const kette = [
      'Milky Way',
      `Milky Way${SUBPAGE_SEP}Sun`,
      `Milky Way${SUBPAGE_SEP}Sun${SUBPAGE_SEP}Earth`,
      `Milky Way${SUBPAGE_SEP}Sun${SUBPAGE_SEP}Earth${SUBPAGE_SEP}Moon`,
    ];
    for (const stufe of kette) expect(VORHANDEN.has(stufe)).toBe(true);
  });

  it('lässt keine Unterseite ohne ihre Elternseite zurück', () => {
    const verwaist = [];
    for (const basename of VORHANDEN) {
      if (!basename.includes(SUBPAGE_SEP)) continue;
      const eltern = basename.slice(0, basename.lastIndexOf(SUBPAGE_SEP));
      if (!VORHANDEN.has(eltern)) verwaist.push(basename);
    }
    expect(verwaist).toEqual([]);
  });
});
