// @vitest-environment jsdom
// 4T-002347 (Epic 3E-000184): `{{file}}` und `{{area}}` in der Vorlagen-Anwendung
// (AK3 von 4S-001101: «beide wirken ebenso in Vorlagen»; Entscheidung der
// Sitzung vom 2026-10-22, O5).
//
// Bestands-Lesung: `resolveFilledTemplate` in `src/renderer/modules/templates.js`
// ist der gemeinsame Füll-Weg für «Neue Datei aus Vorlage», «Vorlage einfügen»,
// die Ordner-Regel und «Notiz aus Karte erzeugen»; `{{folder}}` entsteht dort
// über `folderDisplayFor`. Die Fenster-Module sind nachgestellt (Muster
// `kanban-notiz-erzeugen.test.js`), weil sie am ganzen Fenster hängen.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const umgebung = vi.hoisted(() => ({
  state: { areaPath: null, areaName: null },
  tab: null,
  api: {},
}));

vi.mock('../../../src/renderer/i18n.js', () => ({ t: (k) => k, intlLocale: () => 'de-DE' }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({ api: umgebung.api }));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  activeTab: () => umgebung.tab,
  state: umgebung.state,
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [] }));
vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({ openInPane: vi.fn() }));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: vi.fn(),
  toggleEditMode: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showNameInputDialog: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/panels/notes-panel.js', () => ({
  activeNotesEditorView: () => null,
}));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  getDisabledExtensionIds: () => [],
}));

const { templateDocumentContext, resolveFilledTemplate } =
  await import('../../../src/renderer/modules/templates.js');

beforeEach(() => {
  umgebung.state.areaPath = 'C:/Bereich';
  umgebung.state.areaName = 'Mein Bereich';
  umgebung.tab = { path: 'C:/Bereich/Notizen/A.md' };
  Object.assign(umgebung.api, {
    relative: (von, nach) =>
      nach.startsWith(von + '/') ? nach.slice(von.length + 1) : '../' + nach,
    templatesRead: async () => ({ ok: true, content: '{{file}}|{{area}}|{{title}}' }),
    clipboardReadText: () => '',
  });
});

describe('Kontext des aktiven Dokuments für Vorlagen', () => {
  it('nennt den Pfad wurzel-relativ und den Namen des Bereichs', () => {
    expect(templateDocumentContext()).toEqual({ file: 'Notizen/A.md', area: 'Mein Bereich' });
  });

  it('nimmt außerhalb eines Bereichs den absoluten Pfad, wie {{folder}}', () => {
    umgebung.state.areaPath = null;
    umgebung.state.areaName = null;
    expect(templateDocumentContext()).toEqual({ file: 'C:/Bereich/Notizen/A.md', area: '' });
  });

  it('bleibt ohne aktives Dokument oder ohne Pfad leer', () => {
    umgebung.tab = null;
    expect(templateDocumentContext().file).toBe('');
    umgebung.tab = { path: null };
    expect(templateDocumentContext().file).toBe('');
  });
});

describe('resolveFilledTemplate füllt {{file}} und {{area}}', () => {
  it('in jeder Vorlage, neben dem Ziel-Kontext des Aufrufers', async () => {
    const r = await resolveFilledTemplate('T.md', { title: 'Ziel', folder: 'X' }, 'local');
    expect(r.text).toBe('Notizen/A.md|Mein Bereich|Ziel');
  });

  it('lässt einen ausdrücklichen Wert des Aufrufers gelten', async () => {
    const r = await resolveFilledTemplate('T.md', { title: 'Ziel', file: 'Anders.md' }, 'local');
    expect(r.text).toBe('Anders.md|Mein Bereich|Ziel');
  });
});
