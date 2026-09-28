// 4T-001743 (Epic 3E-000309): Unit-Tests für die Nachfrage beim Öffnen eines
// laufenden Bereichs (src/main/area/area-nachfrage.js) — die Auswahl-Regel nach
// E1 und E10 und die Abbildung der drei Schaltflächen des Dialogs. Die
// Wirkung am laufenden Programm prüft test/e2e/funktionen/bereich-mehrfach.spec.js.
import { describe, it, expect } from 'vitest';
import { createAppRegistry } from '../../src/main/app/app-registry.js';
import {
  laufendeBereichsApp,
  frageNachLaufendemBereich,
} from '../../src/main/area/area-nachfrage.js';

const samePath = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const NOTIZEN = { rootPath: 'C:\\Notizen', name: 'Notizen' };

describe('laufendeBereichsApp (4T-001743)', () => {
  it('liefert null, wenn keine App den Ordner führt', () => {
    const reg = createAppRegistry();
    reg.createApp(null);
    reg.createApp({ rootPath: 'C:\\Archiv', name: 'Archiv' });
    expect(laufendeBereichsApp(reg, 'C:\\Notizen', samePath)).toBeNull();
  });

  it('springt ohne Nachfrage, wenn der Bereich ohne Arbeitsbereich läuft (E10)', () => {
    const reg = createAppRegistry();
    const a = reg.createApp(NOTIZEN);
    expect(laufendeBereichsApp(reg, 'c:\\notizen', samePath)).toEqual({
      appId: a,
      nachfragen: false,
    });
  });

  it('fragt nach, wenn am laufenden Bereich ein Arbeitsbereich hängt (E1)', () => {
    const reg = createAppRegistry();
    const w = reg.createApp(NOTIZEN);
    reg.setWorkspace(w, { id: 'ws-1', name: 'Alpha' });
    expect(laufendeBereichsApp(reg, 'C:\\Notizen', samePath)).toEqual({
      appId: w,
      nachfragen: true,
    });
  });

  it('läuft er zugleich ohne Arbeitsbereich, springt er dorthin ohne Nachfrage', () => {
    const reg = createAppRegistry();
    const w = reg.createApp(NOTIZEN);
    reg.setWorkspace(w, { id: 'ws-1', name: 'Alpha' });
    const frei = reg.createApp(NOTIZEN);
    expect(laufendeBereichsApp(reg, 'C:\\Notizen', samePath)).toEqual({
      appId: frei,
      nachfragen: false,
    });
  });

  it('springt ohne Nachfrage, wenn die Erweiterung «Arbeitsbereiche» aus ist (E10)', () => {
    const reg = createAppRegistry();
    const w = reg.createApp(NOTIZEN);
    reg.setWorkspace(w, { id: 'ws-1', name: 'Alpha' });
    expect(laufendeBereichsApp(reg, 'C:\\Notizen', samePath, false)).toEqual({
      appId: w,
      nachfragen: false,
    });
  });

  it('wählt unter mehreren Arbeitsbereichs-Apps die erste als Wechsel-Ziel', () => {
    const reg = createAppRegistry();
    const w1 = reg.createApp(NOTIZEN);
    reg.setWorkspace(w1, { id: 'ws-1', name: 'Alpha' });
    const w2 = reg.createApp(NOTIZEN);
    reg.setWorkspace(w2, { id: 'ws-2', name: 'Beta' });
    expect(laufendeBereichsApp(reg, 'C:\\Notizen', samePath)).toEqual({
      appId: w1,
      nachfragen: true,
    });
  });
});

describe('frageNachLaufendemBereich (4T-001743)', () => {
  function fakeDialog(response) {
    const aufrufe = [];
    return {
      aufrufe,
      showMessageBox: async (owner, opts) => {
        aufrufe.push({ owner, opts });
        return { response };
      },
    };
  }
  const tForWindow = (_win, key) => `[${key}]`;

  it('bietet zwei Wege und Abbrechen an; Abbrechen ist Escape-Ziel', async () => {
    const dialog = fakeDialog(0);
    await frageNachLaufendemBereich({
      dialog,
      tForWindow,
      owner: null,
      bereichName: 'Notizen',
      arbeitsbereichName: 'Alpha',
    });
    const { opts } = dialog.aufrufe[0];
    expect(opts.buttons).toEqual([
      '[area.alreadyOpen.switch]',
      '[area.alreadyOpen.openAdditional]',
      '[area.alreadyOpen.cancel]',
    ]);
    expect(opts.cancelId).toBe(2);
    expect(opts.defaultId).toBe(0);
    expect(opts.title).toBe('[area.alreadyOpen.title]');
  });

  it('bildet die drei Antworten ab', async () => {
    const antwort = async (r) =>
      frageNachLaufendemBereich({
        dialog: fakeDialog(r),
        tForWindow,
        owner: null,
        bereichName: 'Notizen',
        arbeitsbereichName: 'Alpha',
      });
    expect(await antwort(0)).toBe('wechseln');
    expect(await antwort(1)).toBe('zusaetzlich');
    expect(await antwort(2)).toBe('abbrechen');
    expect(await antwort(-1)).toBe('abbrechen');
  });

  it('setzt Bereichs- und Arbeitsbereichs-Namen in die Texte ein', async () => {
    const dialog = fakeDialog(2);
    await frageNachLaufendemBereich({
      dialog,
      tForWindow: (_w, key) =>
        key === 'area.alreadyOpen.message'
          ? 'Bereich {name}'
          : key === 'area.alreadyOpen.detail'
            ? 'mit {workspace}'
            : key,
      owner: null,
      bereichName: 'Notizen',
      arbeitsbereichName: 'Alpha',
    });
    expect(dialog.aufrufe[0].opts.message).toBe('Bereich Notizen');
    expect(dialog.aufrufe[0].opts.detail).toBe('mit Alpha');
  });
});
