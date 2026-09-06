// @vitest-environment jsdom
// 4T-001344 (Epic 3E-000239): Die beiden DOM-nahen Stuecke des Klick-Pfades in
// der gerenderten Pipe-Tabelle. Der Pfad im Ganzen braucht einen laufenden
// Editor und wird deshalb im E2E-Fall geprueft; hier stehen die zwei
// Zuordnungen, die ohne Editor pruefbar sind und in denen ein Irrtum still
// bliebe: die logische Zelle aus dem gerenderten Baum und die Klick-Stelle
// im Zell-Text.
import { describe, it, expect, afterEach } from 'vitest';
// Das Klick-Modul zieht seit 4T-001345 den Zell-Editor mit; der Stub stellt
// den Preload-Namensraum bereit, den dessen Modulkette erwartet.
import './api-stub.js';

import {
  zellPosition,
  klickOffsetInZelle,
} from '../../../src/renderer/modules/live/live-table-klick.js';

// markdown-it erzeugt fuer eine Pipe-Tabelle genau diese Form.
const TABELLE = `
<table>
  <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
  <tbody>
    <tr><td>a1</td><td>b1</td><td>c1</td></tr>
    <tr><td>a2</td><td>b2</td><td>c2</td></tr>
  </tbody>
</table>`;

function baueTabelle() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = TABELLE.trim();
  return wrapper;
}

function zelleMitText(text) {
  const wrapper = baueTabelle();
  for (const z of wrapper.querySelectorAll('th, td')) {
    if (z.textContent === text) return z;
  }
  throw new Error(`Zelle "${text}" nicht gefunden`);
}

describe('zellPosition', () => {
  it('erkennt eine Kopf-Zelle mit ihrer Spalte (AK2)', () => {
    const zelle = zelleMitText('B');
    expect(zellPosition(zelle.closest('tr'), zelle)).toEqual({
      rowKind: 'header',
      rowIndex: 0,
      col: 1,
    });
  });

  it('erkennt eine Datenzelle mit Zeile und Spalte (AK1)', () => {
    const zelle = zelleMitText('c2');
    expect(zellPosition(zelle.closest('tr'), zelle)).toEqual({
      rowKind: 'body',
      rowIndex: 1,
      col: 2,
    });
  });

  it('zaehlt die Datenzeilen ab dem tbody, nicht ab der Kopfzeile', () => {
    const erste = zelleMitText('a1');
    expect(zellPosition(erste.closest('tr'), erste).rowIndex).toBe(0);
  });
});

describe('klickOffsetInZelle', () => {
  const ereignis = { clientX: 10, clientY: 10 };

  afterEach(() => {
    delete document.caretRangeFromPoint;
  });

  it('nimmt die angeklickte Stelle bei einfachem Zell-Text (AK3)', () => {
    const zelle = zelleMitText('a1');
    document.caretRangeFromPoint = () => ({
      startContainer: zelle.firstChild,
      startOffset: 1,
    });
    expect(klickOffsetInZelle(ereignis, zelle, 'a1')).toBe(1);
  });

  it('faellt bei ausgezeichnetem Zell-Inhalt auf den Zell-Anfang zurueck', () => {
    const zelle = zelleMitText('a1');
    zelle.innerHTML = '<strong>a1</strong>';
    document.caretRangeFromPoint = () => ({
      startContainer: zelle.firstChild.firstChild,
      startOffset: 1,
    });
    expect(klickOffsetInZelle(ereignis, zelle, '**a1**')).toBe(0);
  });

  it('faellt zurueck, wenn gerenderter Text und Quelltext auseinandergehen', () => {
    // Escaptes Pipe: der Quelltext traegt zwei Zeichen mehr als die Anzeige.
    const zelle = zelleMitText('a1');
    zelle.textContent = 'a|b';
    document.caretRangeFromPoint = () => ({
      startContainer: zelle.firstChild,
      startOffset: 2,
    });
    expect(klickOffsetInZelle(ereignis, zelle, 'a\\|b')).toBe(0);
  });

  it('bleibt ohne Treffer der Caret-Ermittlung beim Zell-Anfang', () => {
    const zelle = zelleMitText('a1');
    document.caretRangeFromPoint = () => null;
    expect(klickOffsetInZelle(ereignis, zelle, 'a1')).toBe(0);
  });

  it('klemmt einen Offset jenseits des Quelltextes', () => {
    const zelle = zelleMitText('a1');
    document.caretRangeFromPoint = () => ({
      startContainer: zelle.firstChild,
      startOffset: 99,
    });
    expect(klickOffsetInZelle(ereignis, zelle, 'a1')).toBe(2);
  });
});
