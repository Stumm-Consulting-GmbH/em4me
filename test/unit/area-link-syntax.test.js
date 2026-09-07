// 4T-001451 (Epic 3E-000190): Unit-Tests der Kuerzel-Syntax `[[@kuerzel:Ziel]]`.
//
// Der Test prueft die Syntax-Regel selbst und ihre Ankunft an den beiden
// Parse-Stellen unter src/shared/ — Render-Pfad sowie Index und Rewrite. Die
// beiden Renderer-Stellen (Live-Modus und Linter) liegen in
// test/unit/renderer/area-link-syntax-parser.test.js, weil ihre Module den
// Renderer-Zustand voraussetzen und deshalb jsdom brauchen; zusammen decken
// beide Dateien die vier Stellen aus Erhebung 1 der Konzept-Stufe 4T-001368 ab.
import { describe, it, expect } from 'vitest';
import {
  splitAreaLink,
  joinAreaLink,
  isAreaLinkTarget,
  isValidAreaPrefix,
  normalizeAreaPrefix,
} from '../../src/shared/area-link-syntax.js';
import { renderMarkdown } from '../../src/shared/markdown/markdown.js';
import { createWikiLinkRegex } from '../../src/shared/markdown/link-scan.js';

// Die beiden Schema-Waechter des Oeffnen-Wegs im Wortlaut ihrer Fundstellen:
// src/renderer/modules/views/link-navigation.js und src/main/ipc/files.js.
// Sie werden hier NACHGEBILDET statt importiert, weil beide Module Electron
// bzw. den Renderer-Zustand brauchen; der Nachweis gilt dem Muster, und das
// ist an beiden Stellen genau dieses.
const WAECHTER_NAVIGATION = /^[a-z]+:/i;
const WAECHTER_FILES = /^[a-z]+:\/\//i;

describe('splitAreaLink — die Syntax-Regel', () => {
  it('trennt Kuerzel und Ziel der vollstaendigen Form', () => {
    expect(splitAreaLink('@zt:Datei')).toEqual({ prefix: 'zt', target: 'Datei' });
    expect(splitAreaLink('@Zentral-2_alt:Ordner/Datei')).toEqual({
      prefix: 'Zentral-2_alt',
      target: 'Ordner/Datei',
    });
  });

  it('laesst Anker und Unterseiten-Form im Ziel stehen, damit die naechsten Schritte sie sehen', () => {
    expect(splitAreaLink('@zt:Datei#Kapitel')).toEqual({ prefix: 'zt', target: 'Datei#Kapitel' });
    expect(splitAreaLink('@zt:Datei#^block-1')).toEqual({ prefix: 'zt', target: 'Datei#^block-1' });
    expect(splitAreaLink('@zt:..')).toEqual({ prefix: 'zt', target: '..' });
  });

  it('laesst jede unvollstaendige Form unveraendert — ein bestehender Link behaelt seine Bedeutung', () => {
    for (const roh of [
      'Datei', // gewoehnlicher Link
      '@Datei', // At-Zeichen ohne Doppelpunkt
      '@zt:', // leeres Ziel
      '@:Datei', // leeres Kuerzel
      '@zt x:Datei', // Leerzeichen im Kuerzel
      '@zt/2:Datei', // Schraegstrich im Kuerzel
      'zt:Datei', // ohne At-Zeichen
      '@' + 'x'.repeat(33) + ':Datei', // Kuerzel zu lang
    ]) {
      expect(splitAreaLink(roh)).toEqual({ prefix: null, target: roh });
      expect(isAreaLinkTarget(roh)).toBe(false);
    }
  });

  it('faengt Nicht-Zeichenketten ab', () => {
    expect(splitAreaLink(undefined)).toEqual({ prefix: null, target: '' });
    expect(splitAreaLink(null)).toEqual({ prefix: null, target: '' });
    expect(splitAreaLink(42)).toEqual({ prefix: null, target: '' });
  });

  it('joinAreaLink ist das Gegenstueck und ohne Kuerzel wirkungslos', () => {
    expect(joinAreaLink('zt', 'Datei.md')).toBe('@zt:Datei.md');
    expect(joinAreaLink(null, 'Datei.md')).toBe('Datei.md');
    const roh = '@zt:Datei#Kapitel';
    const { prefix, target } = splitAreaLink(roh);
    expect(joinAreaLink(prefix, target)).toBe(roh);
  });

  it('vergleicht Kuerzel ohne Ruecksicht auf die Schreibung', () => {
    expect(normalizeAreaPrefix('Zentral')).toBe('zentral');
    expect(normalizeAreaPrefix('  ZT  ')).toBe('zt');
    expect(normalizeAreaPrefix(null)).toBe('');
    expect(isValidAreaPrefix('zt')).toBe(true);
    expect(isValidAreaPrefix('a:b')).toBe(false);
  });
});

describe('Paritaet der vier Parse-Stellen', () => {
  // Ziel-Teil aus dem Treffer eines der drei Muster ziehen; die
  // Tabellen-Escape-Behandlung ist an allen drei Stellen dieselbe.
  function zielAusTreffer(m) {
    const inner = m[1] || '';
    const pipeIdx = inner.indexOf('|');
    return (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).replace(/\\$/, '').trim();
  }

  const FAELLE = [
    { link: '[[@zt:Datei]]', prefix: 'zt', target: 'Datei' },
    { link: '[[@zt:Datei#Kapitel]]', prefix: 'zt', target: 'Datei#Kapitel' },
    { link: '[[@zt:Datei|Anzeige]]', prefix: 'zt', target: 'Datei' },
    { link: '[[Datei]]', prefix: null, target: 'Datei' },
  ];

  it('das Muster fuer Index und Rewrite liefert dieselbe Trennung wie die Regel', () => {
    for (const fall of FAELLE) {
      const m = createWikiLinkRegex().exec(fall.link);
      expect(m, fall.link).not.toBeNull();
      expect(splitAreaLink(zielAusTreffer(m))).toEqual({
        prefix: fall.prefix,
        target: fall.target,
      });
    }
  });

  it('der Render-Pfad erkennt die Form und traegt das Kuerzel im href', () => {
    const html = renderMarkdown('[[@zt:Datei]]');
    expect(html).toContain('href="@zt:Datei.md"');
    expect(html).toContain('data-area-prefix="zt"');
    expect(html).toContain('arealink');
  });
});

describe('Render-Pfad: Alias, Anker, Eltern-Form und Einbettung', () => {
  it('haengt die Markdown-Endung an das blosse Ziel, nicht an das Kuerzel-Praefix', () => {
    expect(renderMarkdown('[[@zt:Datei]]')).toContain('href="@zt:Datei.md"');
    // Vorhandene Endung bleibt: das Kuerzel darf die Endungs-Erkennung nicht stoeren.
    expect(renderMarkdown('[[@zt:Bild.png]]')).toContain('href="@zt:Bild.png"');
  });

  it('behandelt den Alias wie bei einem gewoehnlichen Wiki-Link', () => {
    const html = renderMarkdown('[[@zt:Datei|Anzeige]]');
    expect(html).toContain('href="@zt:Datei.md"');
    expect(html).toContain('>Anzeige<');
  });

  it('normalisiert den Anker wie bei einem gewoehnlichen Wiki-Link', () => {
    expect(renderMarkdown('[[@zt:Datei#Mein Kapitel]]')).toContain(
      'href="@zt:Datei.md#mein-kapitel"',
    );
    expect(renderMarkdown('[[@zt:Datei#^block-1]]')).toContain('href="@zt:Datei.md#block-1"');
  });

  it('erhaelt die Eltern-Form, die ohne Vorab-Trennung verloren ginge', () => {
    // Ohne die Trennung waere der Pfad-Teil '@zt:..' und damit weder Eltern-Form
    // noch endungslos — er bekaeme faelschlich ein '.md' angehaengt.
    expect(renderMarkdown('[[@zt:..]]')).toContain('href="@zt:.."');
  });

  it('traegt das Kuerzel durch die Einbettung', () => {
    const html = renderMarkdown('![[@zt:Bild.png]]');
    expect(html).toMatch(/data-embed-path="@zt:Bild\.png"|src=/);
    const mdEmbed = renderMarkdown('![[@zt:Notiz]]');
    expect(mdEmbed).toContain('@zt:Notiz.md');
  });

  it('laesst einen gewoehnlichen Wiki-Link unveraendert', () => {
    const html = renderMarkdown('[[Datei]]');
    expect(html).toContain('href="Datei.md"');
    expect(html).not.toContain('data-area-prefix');
    expect(html).not.toContain('arealink');
  });

  it('haelt die Schema-Sperre des Render-Pfads aufrecht, jetzt auf dem blossen Ziel', () => {
    // Ohne die Vorab-Trennung haette das Kuerzel das gefaehrliche Schema
    // verdeckt; nach der Trennung sieht die Sperre es wieder.
    const html = renderMarkdown('[[@zt:javascript:alert(1)]]');
    expect(html).not.toContain('javascript:alert(1)"');
    expect(html).not.toContain('wikilink');
  });
});

describe('Die beiden Schema-Waechter bleiben unberuehrt (AK3)', () => {
  it('ein Kuerzel-href trifft ihr Muster nicht', () => {
    for (const href of ['@zt:Datei.md', '@zt:Datei.md#kapitel', '@Zentral-2:Ordner/Datei.md']) {
      expect(WAECHTER_NAVIGATION.test(href), href).toBe(false);
      expect(WAECHTER_FILES.test(href), href).toBe(false);
    }
  });

  it('die Waechter greifen unveraendert bei echten Schemata', () => {
    expect(WAECHTER_NAVIGATION.test('mailto:wer@wo.de')).toBe(true);
    expect(WAECHTER_NAVIGATION.test('https://example.org')).toBe(true);
    expect(WAECHTER_FILES.test('https://example.org')).toBe(true);
  });
});
