// @vitest-environment jsdom
// 4T-002294 (Epic 3E-000349): Die PowerPoint-Datei des Foliensatzes in der
// Seite (Story 4S-001084).
//
// Geprüft werden die Teile, die hier entschieden sind:
//   - der Ablauf nach dem Vorbild des PDF-Exports: Speichern-Dialog mit
//     Vorschlag, Druck-Fläche unter der Vorbereitung, je Folie das
//     eigenständige Dokument in Entwurfsgröße, ein Auftrag an den
//     Hauptprozess erst nach der Vorbereitung,
//   - die Notizen: immer mit, als Klartext, unabhängig vom Schalter
//     «Sprecher-Notizen mitgeben» (AK4),
//   - die Meldung mit Folien- und Notizen-Zahl und die Fehler-Meldung mit
//     Folie und Grund (AK5),
//   - der Bedienweg (Registry, Menü-Ort im Untermenü «Exportieren», Brücke,
//     Dispatcher, Erweiterung; AK1).
//
// Die Druck-Vorbereitung ist ersetzt wie in presentation-export.test.js; der
// Format-Kern und die Render-Pipeline laufen echt hinter der Preload-Brücke.
// Den Kanal des Hauptprozesses prüft praesentation-export-pptx-kanal.test.js.
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
const aufrufe = { ziel: [], export: [], einstellung: 0 };
let zielWahl = { ok: true, path: 'C:\\A\\Vortrag.pptx' };
let exportAntwort = null;
let schalterNotizen = false;
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: (text, opts) =>
    lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),
  getSetting: async () => {
    aufrufe.einstellung += 1;
    return schalterNotizen;
  },
  choosePptxExportTarget: async (params) => {
    aufrufe.ziel.push(params);
    return zielWahl;
  },
  exportFolienPptx: async (auftrag) => {
    klammer.imZustandBeiAuftrag = klammer.laeuft;
    aufrufe.export.push(auftrag);
    return typeof exportAntwort === 'function' ? exportAntwort(auftrag) : exportAntwort;
  },
  readHtmlExportKatexStyles: async () => ({ ok: true, css: '.katex { } /* KATEX-MARKE */' }),
};

const {
  exportiereFoliensatzAlsPptx,
  folienDokumente,
  notizenKlartext,
  pptxFehlerText,
  pptxFormat,
} = await import('../../../src/renderer/modules/views/folien-export-pptx.js');
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
  '%% Zweite Notiz',
  'mit **Markdown** in zwei Zeilen %%',
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
  '%% Dritte Notiz %%',
  '',
].join('\n');

beforeEach(() => {
  hinweise.length = 0;
  aufrufe.ziel.length = 0;
  aufrufe.export.length = 0;
  aufrufe.einstellung = 0;
  zielWahl = { ok: true, path: 'C:\\A\\Vortrag.pptx' };
  exportAntwort = (auftrag) => ({
    ok: true,
    path: auftrag.zielPfad,
    folien: auftrag.folien.length,
    notizen: auftrag.folien.reduce((s, f) => s + f.notizen.length, 0),
  });
  schalterNotizen = false;
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

describe('exportiereFoliensatzAlsPptx — Ablauf nach dem Vorbild des PDF-Exports', () => {
  it('schlägt <Dokumentname>.pptx neben dem Dokument vor und übergibt einen Auftrag', async () => {
    expect(await exportiereFoliensatzAlsPptx()).toBe(true);
    expect(aufrufe.ziel).toEqual([{ suggestedPath: 'C:\\A\\Vortrag.pptx', suggestedName: null }]);
    expect(aufrufe.export).toHaveLength(1);
    const [auftrag] = aufrufe.export;
    expect(auftrag.zielPfad).toBe('C:\\A\\Vortrag.pptx');
    expect(auftrag.format).toBe('16:9');
    expect(auftrag.titel).toBe('Vortrag');
    expect(auftrag.folien).toHaveLength(3);
    for (const folie of auftrag.folien) {
      expect(Object.keys(folie).sort()).toEqual(['breite', 'hoehe', 'html', 'notizen']);
      expect(folie.breite).toBe(1280);
      expect(folie.hoehe).toBe(720);
      // Das eigenständige Dokument: Stile eingebettet, kein Skript.
      expect(folie.html).toMatch(/^<!doctype html>/i);
      expect(folie.html).toContain('presentation-slide');
      expect(folie.html).not.toMatch(/<script/i);
    }
    expect(auftrag.folien[0].html).toContain('Erste Folie');
    expect(auftrag.folien[2].html).toContain('Dritte Folie');
    // KaTeX nur, weil die zweite Folie eine Formel trägt.
    expect(auftrag.folien[1].html).toContain('KATEX-MARKE');
    // Die Notizen stehen in keinem Folien-Dokument.
    for (const folie of auftrag.folien) expect(folie.html).not.toContain('Erste Notiz');
  });

  it('der Auftrag geht erst nach der Druck-Vorbereitung, die Fläche ist dann weg', async () => {
    await exportiereFoliensatzAlsPptx();
    expect(klammer.imZustandBeiAuftrag).toBe(false);
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
    expect(document.body.classList.contains(DRUCK_ZUSTAND)).toBe(false);
  });

  // Nachbesserung vom 2026-10-17: Das Bild je Folie zeigt, was der Beamer
  // zeigt. Ohne die Option zeichnete die Klammer Mermaid hell auf die dunkle
  // Folie (Ausgabe «stets hell» gilt nur für PDF, Druck und HTML).
  it('ruft die Druck-Vorbereitung ohne Hell-Zwang, genau einmal', async () => {
    await exportiereFoliensatzAlsPptx();
    expect(klammer.optionen).toEqual([{ hellErzwingen: false }]);
  });

  it('4:3 im Kopf ergibt Format und Entwurfsgröße 4:3', async () => {
    tabDerKlammer.content = DECK.replace('theme: dark', 'theme: dark\nsize: "4:3"');
    await exportiereFoliensatzAlsPptx();
    const [auftrag] = aufrufe.export;
    expect(auftrag.format).toBe('4:3');
    expect(auftrag.folien[0].breite).toBe(960);
    expect(auftrag.folien[0].hoehe).toBe(720);
  });

  it('pfadloses Dokument: Vorschlag aus dem Anzeigenamen', async () => {
    tabDerKlammer = { path: null, content: DECK, titel: 'Unbenannt 2', viewMode: 'rendered' };
    await exportiereFoliensatzAlsPptx();
    expect(aufrufe.ziel).toEqual([{ suggestedPath: null, suggestedName: 'Unbenannt 2.pptx' }]);
  });

  it('Abbruch des Dialogs: kein Auftrag, keine Fläche, keine Meldung', async () => {
    zielWahl = { ok: false, canceled: true };
    expect(await exportiereFoliensatzAlsPptx()).toBe(false);
    expect(aufrufe.export).toHaveLength(0);
    expect(paneEls.content.childElementCount).toBe(0);
    expect(hinweise).toHaveLength(0);
  });

  it('ein Dokument ohne Kennzeichen exportiert nichts und sagt es', async () => {
    tabDerKlammer = { path: 'C:\\A\\Text.md', content: '# Nur Text\n', viewMode: 'rendered' };
    expect(await exportiereFoliensatzAlsPptx()).toBe(false);
    expect(aufrufe.ziel).toHaveLength(0);
    expect(hinweise.map((h) => h.key)).toEqual(['presentation.keinePraesentation']);
  });

  it('ein zweiter Start während des Laufs bleibt ohne Wirkung', async () => {
    let freigeben;
    exportAntwort = () =>
      new Promise((ok) => {
        freigeben = () => ok({ ok: true, folien: 3, notizen: 3 });
      });
    const erster = exportiereFoliensatzAlsPptx();
    await vi.waitFor(() => expect(aufrufe.export).toHaveLength(1));
    expect(await exportiereFoliensatzAlsPptx()).toBe(false);
    freigeben();
    expect(await erster).toBe(true);
    expect(aufrufe.ziel).toHaveLength(1);
  });
});

describe('Notizen gehen immer mit, als Klartext (AK4)', () => {
  for (const schalter of [false, true]) {
    it(`Schalter «Sprecher-Notizen mitgeben» ${schalter ? 'an' : 'aus'}: dieselben Notizen`, async () => {
      schalterNotizen = schalter;
      await exportiereFoliensatzAlsPptx();
      const [auftrag] = aufrufe.export;
      expect(auftrag.folien.map((f) => f.notizen)).toEqual([
        ['Erste Notiz', 'Zweite Notiz\nmit **Markdown** in zwei Zeilen'],
        [],
        ['Dritte Notiz'],
      ]);
      // Der Schalter wird gar nicht gelesen.
      expect(aufrufe.einstellung).toBe(0);
    });
  }

  it('notizenKlartext: nur Notizen mit Text, Zeilenenden vereinheitlicht, außen ohne Leerraum', () => {
    const folie = {
      notizen: [{ text: '  a\r\nb\rc  ' }, { text: '   ' }, { text: 'd' }, null, { text: 3 }],
    };
    expect(notizenKlartext(folie)).toEqual(['a\nb\nc', 'd']);
    expect(notizenKlartext({})).toEqual([]);
  });
});

describe('Meldungen (AK5)', () => {
  it('Erfolg: Zahl der Folien und der mitgegebenen Notizen; nie «nicht enthalten»', async () => {
    await exportiereFoliensatzAlsPptx();
    const ende = hinweise[hinweise.length - 1];
    expect(ende.key).toBe('presentation.export.pptxOk');
    expect(ende.error).toBe(false);
    expect(ende.text).toBe(
      'Foliensatz als PowerPoint exportiert: 3 Folien, 3 Sprecher-Notizen mitgegeben',
    );
    expect(hinweise.some((h) => h.key === 'presentation.export.laeuft')).toBe(true);
    expect(hinweise.some((h) => String(h.text).includes('nicht enthalten'))).toBe(false);
  });

  it('Erfolg ohne Notizen: nur die Zahl der Folien', async () => {
    tabDerKlammer.content = DECK.replace(/%%[^%]*%%/g, '');
    await exportiereFoliensatzAlsPptx();
    expect(hinweise[hinweise.length - 1].text).toBe(
      'Foliensatz als PowerPoint exportiert: 3 Folien',
    );
  });

  it('Fehler mit Folie: nennt Folie und Grund', async () => {
    exportAntwort = { ok: false, fehler: { folie: 2, grund: 'zeitbudget' } };
    expect(await exportiereFoliensatzAlsPptx()).toBe(false);
    const ende = hinweise[hinweise.length - 1];
    expect(ende.error).toBe(true);
    expect(ende.text).toBe(
      'PowerPoint-Export des Foliensatzes bei Folie 2 fehlgeschlagen: die Folie wurde nicht rechtzeitig fertig gezeichnet',
    );
  });

  it('Fehler ohne Folie und unbekannter Grund', () => {
    expect(pptxFehlerText({ folie: null, grund: 'schreiben' }, (k) => DE[k] || k)).toBe(
      'PowerPoint-Export des Foliensatzes fehlgeschlagen: die Datei ließ sich nicht schreiben',
    );
    expect(pptxFehlerText({ grund: 'gibtsnicht' }, (k) => DE[k] || k)).toBe(
      'PowerPoint-Export des Foliensatzes fehlgeschlagen: unbekannter Fehler',
    );
    expect(pptxFehlerText(null, (k) => DE[k] || k)).toBe(
      'PowerPoint-Export des Foliensatzes fehlgeschlagen: unbekannter Fehler',
    );
  });

  it('Brücke ohne Antwort: Fehler-Meldung, Fläche aufgeräumt', async () => {
    exportAntwort = null;
    expect(await exportiereFoliensatzAlsPptx()).toBe(false);
    expect(hinweise[hinweise.length - 1].error).toBe(true);
    expect(paneEls.content.querySelector('.presentation-druck')).toBeNull();
  });
});

describe('Bausteine', () => {
  it('pptxFormat: 4:3 bleibt, alles andere 16:9', () => {
    expect(pptxFormat({ size: '4:3' })).toBe('4:3');
    expect(pptxFormat({ size: '16:9' })).toBe('16:9');
    expect(pptxFormat({ size: '21:9' })).toBe('16:9');
    expect(pptxFormat(null)).toBe('16:9');
  });

  it('folienDokumente: Fehler bei einer Fläche ohne gezeichnete Folie', async () => {
    const flaeche = document.createElement('div');
    const huelle = document.createElement('div');
    huelle.className = 'presentation-slide-huelle';
    flaeche.appendChild(huelle);
    await expect(folienDokumente(flaeche, [{}])).rejects.toThrow('Folie 1 ohne Inhalt');
  });
});

describe('Bedienweg: Registry, Menü-Ort, Brücke und Dispatcher (AK1)', () => {
  const cmd = COMMANDS.find((c) => c.id === 'presentation.exportPptx');

  it('Kommando im Menü, ohne Kürzel, eigener Katalog-Text, Bedingung der Präsentation', () => {
    expect(cmd).toBeTruthy();
    expect(cmd.menu).toBe(true);
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.editorScoped).toBe(false);
    expect(cmd.availability).toBe('praesentationsDokument');
    expect(cmd.labelKey).toBe('menu.file.exportPresentationPptx');
    expect(cmd.descKey).toBe('help.shortcut.presentationExportPptx');
    expect(cmd.categoryKey).toBe('help.group.file');
    expect(DE[cmd.labelKey]).toBe('Foliensatz als PowerPoint exportieren…');
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

  it('steht im Untermenü «Exportieren» unmittelbar nach dem HTML-Export des Foliensatzes', () => {
    const menu = lies('src/main/menu/menu.js');
    const iHtml = menu.indexOf("label: t('menu.file.exportPresentationHtml')");
    const iPptx = menu.indexOf("label: t('menu.file.exportPresentationPptx')");
    const iPortabel = menu.indexOf("label: t('menu.file.exportPortable')");
    expect(iHtml).toBeGreaterThan(-1);
    expect(iPptx).toBeGreaterThan(iHtml);
    expect(iPortabel).toBeGreaterThan(iPptx);
    expect(menu.slice(iHtml, iPptx).match(/label: t\(/g)).toHaveLength(1);
    const eintrag = menu.slice(iPptx - 200, iPortabel);
    expect(eintrag).toContain("unless('presentation.exportPptx'");
    expect(eintrag).toContain("enabled: avail('presentation.exportPptx')");
    expect(eintrag).toContain("click: send('menu:presentationExportPptx')");
  });

  it('Brücke, Menü-Bindung und Dispatcher führen zum Endpunkt', () => {
    const preload = lies('src/main/preload.js');
    expect(preload).toContain("ipcRenderer.invoke('pptx:chooseTarget', params)");
    expect(preload).toContain("ipcRenderer.invoke('presentationPptx:export', auftrag)");
    expect(preload).toContain("ipcRenderer.on('menu:presentationExportPptx'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuPresentationExportPptx(() => exportiereFoliensatzAlsPptx())',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toMatch(
      /'presentation\.exportPptx': \(\) => \{\s*exportiereFoliensatzAlsPptx\(\);/,
    );
  });

  it('gehört zur Erweiterung presentation und entfällt in ihrem Aus-Zustand', () => {
    const manifest = extensionById('presentation');
    expect(manifest.commands).toContain('presentation.exportPptx');
    expect(manifest.featureKeys).toContain('help.feature.presentationExportPptx');
    expect(disabledCommandIdSet(['presentation']).has('presentation.exportPptx')).toBe(true);
    expect(disabledCommandIdSet([]).has('presentation.exportPptx')).toBe(false);
  });
});
