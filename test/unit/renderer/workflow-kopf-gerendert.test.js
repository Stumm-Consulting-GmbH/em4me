// @vitest-environment jsdom
// 4T-002351 (Epic 3E-000184): Die Kopfzeile über dem workflow-Block in der
// gerenderten Ansicht und der Vorschau der geteilten Ansicht
// (src/renderer/modules/workflows/workflow-kopf-gerendert.js), Nachzug auf die
// Entscheidung des Product Owners vom 2026-10-23.
//
// Geprüft wird an echtem Markup der Pipeline (renderMarkdown aus
// src/shared/markdown/markdown.js): Kopfzeile über jedem Block der obersten
// Ebene mit seiner Zaun-Zeile im Dokument, dieselbe Aussage wie in der
// Live-Ansicht, keine Kopfzeile in einer Einbettung, ohne Kennzeichen und im
// Aus-Zustand, Neu-Setzen nach dem Ersetzen des Inhalts über den Beobachter,
// der Kontext für den Knopf «Starten» und dass der Text unverändert bleibt.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
// Der Schalt-Zustand als Attrappe (Vorbild workflow-kopf.test.js).
const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
const starteWorkflow = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: () => {},
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { wendeKoepfeAn, beobachteGerendertenInhalt, KOPF_GERENDERT_KLASSE } =
  await import('../../../src/renderer/modules/workflows/workflow-kopf-gerendert.js');
const { registriereKopfAktion, kopfAktionenZuruecksetzen } =
  await import('../../../src/renderer/modules/workflows/workflow-kopfzeile.js');
const { baueStartKnopf } =
  await import('../../../src/renderer/modules/workflows/workflow-start-knopf.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const KOPF = ['---', 'workflow: true', 'name: Probe', '---', ''];
const datei = (...zeilen) => [...KOPF, ...zeilen, ''].join('\n');
const BLOCK_OK = ['```workflow', 'create "Neu.md"', 'notify "fertig"', '```'];

const offen = [];
function inhalt(text) {
  const container = document.createElement('div');
  container.className = 'markdown-body';
  container.innerHTML = renderMarkdown(text);
  document.body.appendChild(container);
  offen.push(container);
  return container;
}
const koepfe = (c) => [...c.querySelectorAll('.cm-wf-kopf')];
const aussage = (k) => k.querySelector('.cm-wf-pruefung').textContent;
const quelleVon =
  (text, path = 'C:/b/Probe.md') =>
  () => ({ path, text });

beforeEach(() => {
  state.areaPath = 'C:/b';
  starteWorkflow.mockClear();
});
afterEach(() => {
  for (const c of offen.splice(0)) c.remove();
  kopfAktionenZuruecksetzen();
  aus.clear();
});

describe('Kopfzeile in der gerenderten Ansicht', () => {
  it('steht vor dem Block mit der Zaun-Zeile im Dokument und sagt «bereit»', () => {
    const text = datei('Text davor.', '', ...BLOCK_OK);
    const c = inhalt(text);
    expect(wendeKoepfeAn(c, quelleVon(text))).toBe(1);
    const [kopf] = koepfe(c);
    expect(kopf.classList.contains(KOPF_GERENDERT_KLASSE)).toBe(true);
    expect(kopf.dataset.wfZeile).toBe('8');
    expect(kopf.dataset.wfOk).toBe('true');
    expect(aussage(kopf)).toBe('bereit');
    expect(kopf.nextElementSibling.tagName).toBe('PRE');
    expect(kopf.nextElementSibling.getAttribute('data-wf-zeile')).toBe('8');
  });

  it('zeigt rot Zeile und Grund wie die Live-Ansicht, bei mehreren mit «weitere»', () => {
    const text = datei('```workflow', 'fliege "a"', 'wait x', '```');
    const c = inhalt(text);
    wendeKoepfeAn(c, quelleVon(text));
    const [kopf] = koepfe(c);
    expect(kopf.dataset.wfOk).toBe('false');
    expect(aussage(kopf)).toMatch(/^Zeile 7: Unbekannter Befehl 'fliege' \(\+1 weitere\)$/);
    expect(kopf.querySelector('.cm-wf-pruefung').title).toContain('Zeile 8');
  });

  it('setzt bei zwei Blöcken über jeden seine Kopfzeile mit dem Hinweis', () => {
    const text = datei(...BLOCK_OK, '', ...BLOCK_OK);
    const c = inhalt(text);
    expect(wendeKoepfeAn(c, quelleVon(text))).toBe(2);
    const k = koepfe(c);
    expect(k.map((x) => x.dataset.wfZeile)).toEqual(['6', '11']);
    expect(aussage(k[0])).toContain('Zeile 6');
    expect(aussage(k[1])).toContain('Zeile 11');
  });

  it('steht auch vor der Hülle des Kopier-Knopfs', () => {
    const text = datei(...BLOCK_OK);
    const c = inhalt(text);
    const pre = c.querySelector('pre[data-wf-zeile]');
    const huelle = document.createElement('div');
    huelle.className = 'code-block-wrapper';
    pre.before(huelle);
    huelle.append(pre);
    wendeKoepfeAn(c, quelleVon(text));
    expect(koepfe(c)).toHaveLength(1);
    expect(koepfe(c)[0].nextElementSibling).toBe(huelle);
  });

  it('lässt einen Block in einer Einbettung ohne Kopfzeile', () => {
    const text = datei(...BLOCK_OK);
    const c = inhalt('# Andere Notiz\n');
    const einbettung = document.createElement('div');
    einbettung.className = 'wiki-embed-md-body';
    einbettung.innerHTML = renderMarkdown(text);
    c.append(einbettung);
    expect(wendeKoepfeAn(c, quelleVon(text))).toBe(0);
    expect(koepfe(c)).toHaveLength(0);
  });

  it('ohne Kennzeichen workflow: true keine Kopfzeile (E4)', () => {
    const text = ['---', 'name: Notiz', '---', '', ...BLOCK_OK, ''].join('\n');
    const c = inhalt(text);
    expect(wendeKoepfeAn(c, quelleVon(text))).toBe(0);
    const ohneKopf = ['Notiz', '', ...BLOCK_OK, ''].join('\n');
    const c2 = inhalt(ohneKopf);
    expect(wendeKoepfeAn(c2, quelleVon(ohneKopf))).toBe(0);
  });

  it('im Aus-Zustand der Erweiterung keine Kopfzeile', () => {
    const text = datei(...BLOCK_OK);
    const c = inhalt(text);
    aus.add('workflows');
    expect(wendeKoepfeAn(c, quelleVon(text))).toBe(0);
    expect(koepfe(c)).toHaveLength(0);
  });

  it('ersetzt vorhandene Kopfzeilen statt sie zu verdoppeln, Text bleibt unverändert', () => {
    const text = datei(...BLOCK_OK);
    const c = inhalt(text);
    const quelle = quelleVon(text);
    wendeKoepfeAn(c, quelle);
    wendeKoepfeAn(c, quelle);
    expect(koepfe(c)).toHaveLength(1);
    expect(quelle().text).toBe(text);
    expect(c.querySelector('pre[data-wf-zeile] code').textContent).toBe(
      BLOCK_OK.slice(1, 3).join('\n') + '\n',
    );
  });

  it('der Beobachter setzt die Kopfzeile nach jedem Ersetzen des Inhalts neu', async () => {
    let text = datei('```workflow', 'fliege "a"', '```');
    const c = inhalt(text);
    const beobachter = beobachteGerendertenInhalt(c, () => ({ path: 'C:/b/Probe.md', text }));
    expect(aussage(koepfe(c)[0])).toContain('fliege');
    // Berichtigen und neu rendern, wie die Vorschau der geteilten Ansicht.
    text = datei('```workflow', 'open "a.md"', '```');
    c.innerHTML = renderMarkdown(text);
    expect(koepfe(c)).toHaveLength(0);
    await Promise.resolve();
    expect(koepfe(c)).toHaveLength(1);
    expect(aussage(koepfe(c)[0])).toBe('bereit');
    // Die eigenen Änderungen lösen keinen weiteren Lauf aus.
    await Promise.resolve();
    expect(koepfe(c)).toHaveLength(1);
    beobachter.disconnect();
  });

  it('gibt den Aktionen Element, Analyse, Zaun-Zeile, view null und dokument()', () => {
    const aufrufe = [];
    registriereKopfAktion((ctx) => aufrufe.push(ctx));
    const text = datei(...BLOCK_OK);
    const c = inhalt(text);
    wendeKoepfeAn(c, quelleVon(text));
    expect(aufrufe).toHaveLength(1);
    const [ctx] = aufrufe;
    expect(ctx.element.classList.contains('cm-wf-aktionen')).toBe(true);
    expect(ctx.zaunZeile).toBe(6);
    expect(ctx.view).toBeNull();
    expect(ctx.analyse.ok).toBe(true);
    expect(ctx.dokument()).toEqual({ path: 'C:/b/Probe.md', text });
  });

  it('der Knopf «Starten» startet mit Pfad und Text des Dokuments', () => {
    registriereKopfAktion(baueStartKnopf);
    const text = datei('```workflow', 'notify "Hallo"', '```');
    const c = inhalt(text);
    wendeKoepfeAn(c, quelleVon(text));
    const knopf = c.querySelector('.cm-wf-kopf .cm-wf-aktionen .cm-wf-starten');
    expect(knopf.disabled).toBe(false);
    knopf.click();
    expect(starteWorkflow).toHaveBeenCalledWith({ path: 'C:/b/Probe.md', text });
  });

  it('der Knopf ist bei einem Befund gesperrt', () => {
    registriereKopfAktion(baueStartKnopf);
    const text = datei('```workflow', 'fliege "Mond.md"', '```');
    const c = inhalt(text);
    wendeKoepfeAn(c, quelleVon(text));
    const knopf = c.querySelector('.cm-wf-starten');
    expect(knopf.disabled).toBe(true);
    knopf.click();
    expect(starteWorkflow).not.toHaveBeenCalled();
  });
});
