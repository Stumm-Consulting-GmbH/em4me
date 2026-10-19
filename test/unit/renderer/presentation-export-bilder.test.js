// @vitest-environment jsdom
// 4T-002295 (Epic 3E-000349): Die Bilder des Foliensatzes in der Seite
// (Story 4S-001085).
//
// Geprüft werden die Teile, die hier entschieden sind:
//   - der Ablauf nach dem Vorbild des PowerPoint-Exports: Ordner-Dialog mit
//     dem Ordner des Dokuments, Druck-Fläche unter der Vorbereitung ohne
//     Hell-Zwang, je Folie das eigenständige Dokument in Entwurfsgröße, ein
//     Auftrag an den Hauptprozess erst nach der Vorbereitung (AK2, AK3),
//   - keine Notizen im Auftrag und in der Meldung,
//   - die Meldung mit Zahl der Bilder und Ordner und die Fehler-Meldung mit
//     Folie und Grund (AK4),
//   - der Bedienweg (Registry, Menü-Ort im Untermenü «Exportieren», Brücke,
//     Dispatcher, Erweiterung; AK1).
//
// Die Druck-Vorbereitung ist ersetzt wie in presentation-export-pptx.test.js;
// der Format-Kern und die Render-Pipeline laufen echt hinter der Brücke. Die
// Kanäle des Hauptprozesses prüft praesentation-export-bilder-kanal.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');
const DE = JSON.parse(lies('src/i18n/de.json'));

let tabDerKlammer = null;
const hinweise = [];
const klammer = { laeuft: false, imZustandBeiAuftrag: null, optionen: [] };

vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  withPrintPreparation: async (steps) => {
    const tab = tabDerKlammer;
    klammer.optionen.push({ hellErzwingen: steps.hellErzwingen });
    klammer.laeuft = true;
    try {
      const kontext = steps.prepare ? await steps.prepare(tab) : null;
      if (steps.prepare && !kontext) return { ok: false, canceled: true };
      const res = await steps.output(kontext);
      return res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || '' };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      klammer.laeuft = false;
    }
  },
}));

vi.mock('../../../src/renderer/modules/render-mermaid.js', () => ({
  applyTeilbaumSchritte: () => {},
}));

vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (key, opts) =>
    hinweise.push({ key, error: !!(opts && opts.error), text: opts && opts.text }),
}));

vi.mock('../../../src/renderer/i18n.js', async () => {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const de = JSON.parse(fsMod.readFileSync(pathMod.resolve('src/i18n/de.json'), 'utf8'));
  return { t: (k) => (k in de ? de[k] : k), intlLocale: () => 'de' };
});

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));

const paneEls = { content: null };
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
  getPaneEls: () => paneEls,
  tabDisplayName: (tab) => (tab && tab.titel) || 'Vortrag',
  withDialog: (fn) => fn(),
}));

// Die Brücke, gestellt VOR dem Laden der Module, weil `api.js` `window.api`
// beim Laden bindet.
const aufrufe = { ordner: [], export: [], einstellung: 0 };
let ordnerWahl = { ok: true, path: 'C:\\A\\Bilder' };
let exportAntwort = null;
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: (text, opts) =>
    lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),
  getSetting: async () => {
    aufrufe.einstellung += 1;
    return true;
  },
  chooseFolienBilderOrdner: async (params) => {
    aufrufe.ordner.push(params);
    return ordnerWahl;
  },
  exportFolienBilder: async (auftrag) => {
    klammer.imZustandBeiAuftrag = klammer.laeuft;
    aufrufe.export.push(auftrag);
    return typeof exportAntwort === 'function' ? exportAntwort(auftrag) : exportAntwort;
  },
  readHtmlExportKatexStyles: async () => ({ ok: true, css: '.katex { } /* KATEX-MARKE */' }),
};

const { exportiereFoliensatzAlsBilder, bilderMeldung, bilderFehlerText } =
  await import('../../../src/renderer/modules/views/folien-export-bilder.js');
const { DRUCK_ZUSTAND } = await import('../../../src/renderer/modules/views/folien-export.js');

const DECK = [
  '---',
  'presentation: true',
  'theme: dark',
  '---',
  '',
  '# Erste Folie',
  '',
  '%% Erste Notiz %%',
  '',
  '---',
  '',
  '## Zweite Folie',
  '',
  'Formel $x^2$',
  '',
  '---',
  '',
  '## Dritte Folie',
  '',
].join('\n');

beforeEach(() => {
  hinweise.length = 0;
  aufrufe.ordner.length = 0;
  aufrufe.export.length = 0;
  aufrufe.einstellung = 0;
  ordnerWahl = { ok: true, path: 'C:\\A\\Bilder' };
  exportAntwort = (auftrag) => ({
    ok: true,
    ordner: `${auftrag.zielOrdner}\\Vortrag-Folien`,
    bilder: auftrag.folien.length,
  });
  klammer.imZustandBeiAuftrag = null;
  klammer.optionen.length = 0;
  paneEls.content = document.createElement('div');
  document.body.appendChild(paneEls.content);
  tabDerKlammer = { path: 'C:\\A\\Vortrag.md', content: DECK, viewMode: 'presentation' };
});

afterEach(() => {
  paneEls.content.remove();
  document.body.classList.remove(DRUCK_ZUSTAND);
});

describe('exportiereFoliensatzAlsBilder — Ablauf nach dem Vorbild des PowerPoint-Exports', () => {
  it('fragt den Ordner mit dem Ordner des Dokuments und übergibt einen Auftrag', async () => {
    expect(await exportiereFoliensatzAlsBilder()).toBe(true);
    expect(aufrufe.ordner).toEqual([{ suggestedDir: 'C:\\A' }]);
    expect(aufrufe.export).toHaveLength(1);
    const [auftrag] = aufrufe.export;
    expect(Object.keys(auftrag).sort()).toEqual(['folien', 'unterordner', 'zielOrdner']);
    expect(auftrag.zielOrdner).toBe('C:\\A\\Bilder');
    expect(auftrag.unterordner).toBe('Vortrag-Folien');
    expect(auftrag.folien).toHaveLength(3);
    for (const folie of auftrag.folien) {
      // Keine Notizen: nur Dokument und Entwurfsgröße.
      expect(Object.keys(folie).sort()).toEqual(['breite', 'hoehe', 'html']);
      expect(folie.breite).toBe(1280);
      expect(folie.hoehe).toBe(720);
      expect(folie.html).toMatch(/^<!doctype html>/i);
      expect(folie.html).toContain('presentation-slide');
      expect(folie.html).not.toMatch(/<script/i);
      expect(folie.html).not.toContain('Erste Notiz');
    }
    expect(auftrag.folien[0].html).toContain('Erste Folie');
    expect(auftrag.folien[1].html).toContain('KATEX-MARKE');
    // Der Schalter «Sprecher-Notizen mitgeben» wird nicht gelesen.
    expect(aufrufe.einstellung).toBe(0);
  });

  it('der Auftrag geht erst nach der Druck-Vorbereitung, die Fläche ist dann weg', async () => {
    await exportiereFoliensatzAlsBilder();
    expect(klammer.imZustandBeiAuftrag).toBe(false);
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
    expect(document.body.classList.contains(DRUCK_ZUSTAND)).toBe(false);
  });

  it('ruft die Druck-Vorbereitung ohne Hell-Zwang, genau einmal', async () => {
    await exportiereFoliensatzAlsBilder();
    expect(klammer.optionen).toEqual([{ hellErzwingen: false }]);
  });

  it('4:3 im Kopf ergibt die Entwurfsgröße 4:3', async () => {
    tabDerKlammer.content = DECK.replace('theme: dark', 'theme: dark\nsize: "4:3"');
    await exportiereFoliensatzAlsBilder();
    expect(aufrufe.export[0].folien[0].breite).toBe(960);
    expect(aufrufe.export[0].folien[0].hoehe).toBe(720);
  });

  it('pfadloses Dokument: Vorgabe ohne Ordner, Unterordner aus dem Anzeigenamen', async () => {
    tabDerKlammer = { path: null, content: DECK, titel: 'Unbenannt 2', viewMode: 'rendered' };
    await exportiereFoliensatzAlsBilder();
    expect(aufrufe.ordner).toEqual([{ suggestedDir: null }]);
    expect(aufrufe.export[0].unterordner).toBe('Unbenannt 2-Folien');
  });

  it('Abbruch des Dialogs: kein Auftrag, keine Fläche, keine Meldung', async () => {
    ordnerWahl = { ok: false, canceled: true };
    expect(await exportiereFoliensatzAlsBilder()).toBe(false);
    expect(aufrufe.export).toHaveLength(0);
    expect(paneEls.content.childElementCount).toBe(0);
    expect(hinweise).toHaveLength(0);
  });

  it('ein Dokument ohne Kennzeichen exportiert nichts und sagt es', async () => {
    tabDerKlammer = { path: 'C:\\A\\Text.md', content: '# Nur Text\n', viewMode: 'rendered' };
    expect(await exportiereFoliensatzAlsBilder()).toBe(false);
    expect(aufrufe.ordner).toHaveLength(0);
    expect(hinweise.map((h) => h.key)).toEqual(['presentation.keinePraesentation']);
  });

  it('ein zweiter Start während des Laufs bleibt ohne Wirkung', async () => {
    let freigeben;
    exportAntwort = () =>
      new Promise((ok) => {
        freigeben = () => ok({ ok: true, ordner: 'C:\\A\\Bilder', bilder: 3 });
      });
    const erster = exportiereFoliensatzAlsBilder();
    await vi.waitFor(() => expect(aufrufe.export).toHaveLength(1));
    expect(await exportiereFoliensatzAlsBilder()).toBe(false);
    freigeben();
    expect(await erster).toBe(true);
    expect(aufrufe.ordner).toHaveLength(1);
  });
});

describe('Meldungen (AK4)', () => {
  it('Erfolg: Zahl der Bilder und Name des Ordners, ohne Notizen', async () => {
    await exportiereFoliensatzAlsBilder();
    const ende = hinweise[hinweise.length - 1];
    expect(ende.key).toBe('presentation.export.bilderOk');
    expect(ende.error).toBe(false);
    expect(ende.text).toBe('Foliensatz als Bilder exportiert: 3 Bilder in „Vortrag-Folien“');
    expect(hinweise.some((h) => h.key === 'presentation.export.laeuft')).toBe(true);
    expect(hinweise.some((h) => /Notiz/.test(String(h.text)))).toBe(false);
  });

  it('bilderMeldung: Einzahl und ein Ordner mit Schrägstrichen', () => {
    const u = (k) => DE[k] || k;
    expect(bilderMeldung({ bilder: 1, ordner: '/home/a/Bilder/' }, u)).toBe(
      'Foliensatz als Bilder exportiert: 1 Bild in „Bilder“',
    );
  });

  it('Fehler mit Folie: nennt Folie und Grund', async () => {
    exportAntwort = { ok: false, fehler: { folie: 2, grund: 'zeitbudget' } };
    expect(await exportiereFoliensatzAlsBilder()).toBe(false);
    const ende = hinweise[hinweise.length - 1];
    expect(ende.error).toBe(true);
    expect(ende.text).toBe(
      'Bilder-Export des Foliensatzes bei Folie 2 fehlgeschlagen: die Folie wurde nicht rechtzeitig fertig gezeichnet',
    );
  });

  it('Fehler ohne Folie und unbekannter Grund', () => {
    const u = (k) => DE[k] || k;
    expect(bilderFehlerText({ folie: null, grund: 'schreiben' }, u)).toBe(
      'Bilder-Export des Foliensatzes fehlgeschlagen: die Datei ließ sich nicht schreiben',
    );
    expect(bilderFehlerText({ grund: 'gibtsnicht' }, u)).toBe(
      'Bilder-Export des Foliensatzes fehlgeschlagen: unbekannter Fehler',
    );
    expect(bilderFehlerText(null, u)).toBe(
      'Bilder-Export des Foliensatzes fehlgeschlagen: unbekannter Fehler',
    );
  });

  it('Brücke ohne Antwort: Fehler-Meldung, Fläche aufgeräumt', async () => {
    exportAntwort = null;
    expect(await exportiereFoliensatzAlsBilder()).toBe(false);
    expect(hinweise[hinweise.length - 1].error).toBe(true);
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
  });
});

describe('Bedienweg: Registry, Menü-Ort, Brücke und Dispatcher (AK1)', () => {
  const cmd = COMMANDS.find((c) => c.id === 'presentation.exportImages');

  it('Kommando im Menü, ohne Kürzel, eigener Katalog-Text, Bedingung der Präsentation', () => {
    expect(cmd).toBeTruthy();
    expect(cmd.menu).toBe(true);
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.editorScoped).toBe(false);
    expect(cmd.availability).toBe('praesentationsDokument');
    expect(cmd.labelKey).toBe('menu.file.exportPresentationImages');
    expect(cmd.descKey).toBe('help.shortcut.presentationExportImages');
    expect(cmd.categoryKey).toBe('help.group.file');
    expect(DE[cmd.labelKey]).toBe('Foliensatz als Bilder exportieren…');
    expect(DE[cmd.descKey]).toBeTruthy();
  });

  it('verfügbar bei einer Präsentation in jeder Ansicht; sonst sichtbar deaktiviert', () => {
    const faelle = [
      [{ praesentationTab: true, viewMode: 'presentation' }, true],
      [{ praesentationTab: true, viewMode: 'source' }, true],
      [{ praesentationTab: false, viewMode: 'rendered' }, false],
      [{ praesentationTab: true, viewMode: 'rendered', systemTab: true }, false],
    ];
    for (const [roh, soll] of faelle) {
      const ctx = availabilityContext({ hasTab: true, ...roh });
      expect(isAvailable(cmd.availability, ctx), JSON.stringify(roh)).toBe(soll);
    }
  });

  it('steht im Untermenü «Exportieren» unmittelbar nach der PowerPoint-Datei', () => {
    const menu = lies('src/main/menu/menu.js');
    const iPptx = menu.indexOf("label: t('menu.file.exportPresentationPptx')");
    const iBilder = menu.indexOf("label: t('menu.file.exportPresentationImages')");
    const iPortabel = menu.indexOf("label: t('menu.file.exportPortable')");
    expect(iPptx).toBeGreaterThan(-1);
    expect(iBilder).toBeGreaterThan(iPptx);
    expect(iPortabel).toBeGreaterThan(iBilder);
    expect(menu.slice(iPptx, iBilder).match(/label: t\(/g)).toHaveLength(1);
    const eintrag = menu.slice(iBilder - 200, iPortabel);
    expect(eintrag).toContain("unless('presentation.exportImages'");
    expect(eintrag).toContain("enabled: avail('presentation.exportImages')");
    expect(eintrag).toContain("click: send('menu:presentationExportImages')");
  });

  it('Brücke, Menü-Bindung und Dispatcher führen zum Endpunkt', () => {
    const preload = lies('src/main/preload.js');
    expect(preload).toContain("ipcRenderer.invoke('presentationImages:chooseFolder', p)");
    expect(preload).toContain("ipcRenderer.invoke('presentationImages:export', auftrag)");
    expect(preload).toContain("ipcRenderer.on('menu:presentationExportImages'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuPresentationExportImages(() => exportiereFoliensatzAlsBilder())',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toMatch(
      /'presentation\.exportImages': \(\) => \{\s*exportiereFoliensatzAlsBilder\(\);/,
    );
  });

  it('gehört zur Erweiterung presentation und entfällt in ihrem Aus-Zustand', () => {
    const manifest = extensionById('presentation');
    expect(manifest.commands).toContain('presentation.exportImages');
    expect(manifest.featureKeys).toContain('help.feature.presentationExportImages');
    expect(disabledCommandIdSet(['presentation']).has('presentation.exportImages')).toBe(true);
    expect(disabledCommandIdSet([]).has('presentation.exportImages')).toBe(false);
  });
});
