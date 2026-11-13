// @vitest-environment jsdom
// 4T-002547 (Epic 3E-000368, Nachzug nach der Entscheidung des Product Owners
// vom 2026-11-12, Empfehlung pauschal übernommen): Die eine Bestätigung vor dem
// ersten Schritt sagt in Worten, was ein `db-delete` löscht, auch wenn sein
// Datensatz erst im Lauf feststeht, und zeigt nie einen rohen Platzhalter ohne
// Erklärung. Gemessen am deutschen Wortlaut: Die Ziele kommen echt aus
// `dbDeleteTargets` über einen vorbereiteten Plan, die Bestätigung echt aus
// `bestaetigeLoeschZiele`; ersetzt ist allein der Dialog, der mitschreibt.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const dialoge = [];
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showLinkPreviewDialog: async (opts) => {
    dialoge.push(opts);
    return true;
  },
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { bestaetigeLoeschZiele } =
  await import('../../../src/renderer/modules/workflows/workflow-window.js');
const { dbDeleteTargets } = await import('../../../src/shared/workflows/workflow-runner.js');

const s = (line, keyword, ...args) => ({ line, blockLine: line, keyword, args });
// Ein zurückgestellter Schritt, wie `prepareRun` ihn liefert: die Zeile ungefüllt.
const loeschen = (line, record, table = 'Library') => ({
  ...s(line, 'db-delete'),
  deferred: { step: { args: [{ raw: table }, { raw: record }] } },
});
const plan = (steps) => ({ path: 'C:/b/A.md', name: 'A', steps, children: {} });
const schleife = (...schritte) =>
  plan([s(4, 'db-for-each', 'Loans List.md'), ...schritte, s(9, 'end')]);

async function zeilen(p) {
  dialoge.length = 0;
  await bestaetigeLoeschZiele('A', [], dbDeleteTargets(p));
  return dialoge[0].sections[0].rows.map((r) => r.text);
}

beforeEach(() => {
  dialoge.length = 0;
});

describe('Bestätigung vor dem Löschen in Worten (4T-002547)', () => {
  it('ein festes Ziel bleibt wortgleich', async () => {
    expect(await zeilen(plan([s(5, 'db-delete', 'Library', 'Solaris')]))).toEqual([
      "Datensatz 'Solaris' der Tabelle 'Library'",
    ]);
  });

  it('der Datensatz der Schleife: jeder Datensatz der Abfrage, höchstens 500', async () => {
    expect(await zeilen(schleife(loeschen(5, '{{record:id}}')))).toEqual([
      "Jeden Datensatz der Abfrage 'Loans List.md' in der Tabelle 'Library', höchstens 500",
    ]);
  });

  it('eine in diesem Lauf vergebene Kennung', async () => {
    expect(await zeilen(plan([loeschen(5, '{{created:neu}}')]))).toEqual([
      "Den in diesem Lauf angelegten Datensatz der Tabelle 'Library'",
    ]);
  });

  it('ein Feldwert: aus welchem Feld welches Datensatzes, in einer Schleife je Durchgang neu gelesen', async () => {
    expect(await zeilen(plan([loeschen(5, '{{db:Loans:r-00007:book}}')]))).toEqual([
      "Den Datensatz der Tabelle 'Library', dessen Kennung im Feld 'book' des Datensatzes 'r-00007' der Tabelle 'Loans' steht",
    ]);
    // Die Quelle ist fest; in der Schleife wird nur die Kennung je Durchgang neu gelesen.
    expect(await zeilen(schleife(loeschen(5, '{{db:Loans:r-00007:book}}')))).toEqual([
      "Den Datensatz der Tabelle 'Library', dessen Kennung im Feld 'book' des Datensatzes 'r-00007' der Tabelle 'Loans' steht; die Kennung wird in jedem Durchgang der Schleife über die Abfrage 'Loans List.md' neu gelesen, höchstens 500 Durchgänge",
    ]);
    expect(await zeilen(schleife(loeschen(5, '{{record:book}}')))).toEqual([
      "Den Datensatz der Tabelle 'Library', dessen Kennung im Feld 'book' des jeweiligen Datensatzes der Schleife steht, je Datensatz der Abfrage 'Loans List.md', höchstens 500",
    ]);
  });

  it('jede übrige Mischform: allgemein, gefolgt von der Angabe als Zitat', async () => {
    expect(await zeilen(schleife(loeschen(5, 'R-{{record:id}}')))).toEqual([
      "Einen Datensatz der Tabelle 'Library', dessen Kennung erst im Lauf feststeht: «R-{{record:id}}»",
    ]);
  });

  it('kein Satz zeigt einen Platzhalter ohne Erklärung; Titel und Satz des Löschens', async () => {
    const texte = await zeilen(
      schleife(loeschen(5, '{{record:id}}'), loeschen(6, '{{created:neu}}', 'Loans')),
    );
    for (const text of texte) expect(text).not.toMatch(/\{\{/);
    expect(dialoge[0].title).toBe('Workflow ‹A›: löschen?');
  });
});
