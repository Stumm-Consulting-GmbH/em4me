// @vitest-environment jsdom
// 4T-002120 (Story 4S-001041): Kann eine Einbettung ihr Ziel nicht zeigen,
// nennt der Hinweis das Ziel so, wie es im Dokument steht. Bis zu dieser
// Behebung trug ein Dokument-Ziel ohne Endung das '.md', das das Wiki-Plugin
// fuer die Aufloesung anhaengt («Fehlt.md» statt «Fehlt»).
//
// Geprueft wird die ganze Strecke: Das Plugin gibt den Namen als eigenes
// Attribut aus, und der Hinweis liest ihn. Die Aufloesung selbst bekommt
// weiter den Pfad mit Endung.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const aufgerufen = [];
window.api.readEmbedFile = async (basePath, embedPath) => {
  aufgerufen.push(embedPath);
  const grund = embedPath.startsWith('@') ? 'linked-area' : 'ENOENT: no such file or directory';
  return { ok: false, error: grund };
};
window.api.resolveEmbedTarget = async (basePath, embedPath) => {
  aufgerufen.push(embedPath);
  return { ok: false, error: 'linked-area' };
};
window.api.readEmbedImage = async (basePath, embedPath) => {
  aufgerufen.push(embedPath);
  return { ok: false, error: 'linked-area' };
};
window.api.fileExists = async () => false;

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { renderMarkdown } = await import('../../../src/shared/markdown/markdown.js');
const { applyWikiEmbedsIfPresent } =
  await import('../../../src/renderer/modules/render-mermaid.js');

async function hinweiseFuer(quelle) {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(quelle, 'de');
  document.body.appendChild(div);
  await applyWikiEmbedsIfPresent(div, 'C:/bereich/Aktiv.md');
  const texte = [...div.querySelectorAll('.wiki-embed-broken')].map((el) => el.textContent);
  div.remove();
  return texte;
}

describe('Hinweis bei fehlendem Ziel nennt den Namen wie im Dokument (4T-002120)', () => {
  beforeEach(() => {
    aufgerufen.length = 0;
  });

  it('Dokument-Ziel ohne Endung: Hinweis ohne angehaengtes .md, Aufloesung mit', async () => {
    const texte = await hinweiseFuer('![[Fehlt]]\n');
    expect(texte).toEqual(['Einbetten nicht möglich: «Fehlt» ist nicht zu finden']);
    expect(aufgerufen).toEqual(['Fehlt.md']);
  });

  it('Dokument-Ziel mit Anker: Hinweis nennt den Namen ohne Endung', async () => {
    const texte = await hinweiseFuer('![[Fehlt#Abschnitt]]\n');
    expect(texte).toEqual(['Einbetten nicht möglich: «Fehlt» ist nicht zu finden']);
  });

  it('Dokument-Ziel mit eigener Endung bleibt, wie es geschrieben ist', async () => {
    const texte = await hinweiseFuer('![[Fehlt.md]]\n');
    expect(texte).toEqual(['Einbetten nicht möglich: «Fehlt.md» ist nicht zu finden']);
  });

  it('Ziel in einem verknuepften Bereich: Kuerzel bleibt, Endung kommt nicht hinzu', async () => {
    const texte = await hinweiseFuer('![[@nachbar:Notiz]]\n\n![[@nachbar:bild.png]]\n');
    expect(texte).toEqual([
      'Einbetten nicht möglich: «@nachbar:Notiz» liegt in einem verknüpften Bereich, aus dem sich nichts einbetten lässt',
      'Einbetten nicht möglich: «@nachbar:bild.png» liegt in einem verknüpften Bereich, aus dem sich nichts einbetten lässt',
    ]);
  });

  it('Plugin: eigenes Attribut nur, wo die Aufloesung die Endung angehaengt hat', () => {
    const html = renderMarkdown('![[Notiz]]\n\n![[Notiz.md]]\n\n![[bild.png]]\n', 'de');
    expect(html).toContain('data-embed-path="Notiz.md" data-embed-name="Notiz"');
    expect(html.match(/data-embed-name=/g)).toHaveLength(1);
  });
});
