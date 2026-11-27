// @vitest-environment jsdom
// 4T-002863 (Epic 3E-000449): Ein privater Kommentar in einer Aufgaben-Zeile
// erscheint im Treffer einer Aufgaben-Abfrage nicht, weder als Text noch in
// einer Angabe am Treffer (HTML-Export, Druck). Der Weg ist der echte:
// Wegwerf-Bereich, Index über `frontmatterQueryFor`, Zeichnen über den
// Einstieg `buildQueryListDom` (Muster ergebnismenge-vorher-nachher.test.js).
// Am Stand vor der Behebung waren die Fälle rot (Beleg der Aufgabe).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', async (orig) => ({
  ...(await orig()),
  isExtensionActive: (id) => id === 'comments' || id === 'tasks' || id === 'query',
}));

import { rohZeileDesTreffers } from '../../../src/renderer/modules/query/display-tasks.js';
import { buildQueryListDom } from '../../../src/renderer/modules/query/frontmatter-query-view.js';
import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
} from '../../../src/main/backlinks.js';
import { createTaskStatusTypeResolver } from '../../../src/shared/markdown/plugins.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;
const BESITZER = 'beleg-aufgaben-treffer:0';
const GEHEIM = 'GEHEIMVERMERK';

let tmpDir;
let aktiv;
let root;

const taskEnv = () => ({
  enabled: true,
  globalFilter: '',
  statusTypeOf: createTaskStatusTypeResolver(null),
});

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beleg-treffer-'));
  fs.writeFileSync(path.join(tmpDir, 'Start.md'), '# Start\n', 'utf8');
  fs.writeFileSync(
    path.join(tmpDir, 'Aufgaben.md'),
    `# Aufgaben\n\n- [ ] Angebot schicken %%${GEHEIM}: Preis unter Liste%%\n- [ ] Termin legen\n`,
    'utf8',
  );
  aktiv = path.join(tmpDir, 'Start.md');
  root = rootForActiveFile(aktiv);
  let r = backlinksFor(aktiv, BESITZER);
  for (let i = 0; i < 500 && r.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    r = backlinksFor(aktiv, BESITZER);
  }
});

afterAll(() => {
  vi.useFakeTimers();
  releaseRoot(root, BESITZER);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
});

function zeichne(abfrage) {
  const payload = frontmatterQueryFor(aktiv, abfrage, undefined, taskEnv(), 'de-DE');
  const host = document.createElement('div');
  host.appendChild(buildQueryListDom(structuredClone(payload), tStub));
  return host;
}

describe('Privater Kommentar im Treffer einer Aufgaben-Abfrage (4T-002863)', () => {
  it('LIST TASKS: der sichtbare Text des Treffers trägt keinen Kommentar', () => {
    const host = zeichne('LIST TASKS');
    expect(host.textContent).toContain('Angebot schicken');
    expect(host.textContent).not.toContain(GEHEIM);
  });

  it('LIST TASKS: keine Angabe am Treffer trägt den Kommentar', () => {
    const host = zeichne('LIST TASKS');
    expect(host.innerHTML).toContain('Angebot schicken');
    expect(host.innerHTML).not.toContain(GEHEIM);
  });

  it('TABLE TASKS description: die Zelle der Beschreibung trägt keinen Kommentar', () => {
    const host = zeichne('TABLE TASKS description');
    expect(host.textContent).toContain('Angebot schicken');
    expect(host.textContent).not.toContain(GEHEIM);
  });

  it('Schreibweg: der Treffer liefert die rohe Zeile samt Kommentar, byte-genau', () => {
    const li = zeichne('LIST TASKS').querySelector('li.perspective-query-task');
    expect(rohZeileDesTreffers(li)).toBe(`- [ ] Angebot schicken %%${GEHEIM}: Preis unter Liste%%`);
  });
});
