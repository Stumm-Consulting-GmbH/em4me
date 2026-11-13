// 4T-002547 (Epic 3E-000368): Die Ziele der `db-delete` für die eine
// Bestätigung vor dem ersten Schritt (`dbDeleteTargets` im Ablauf-Kern
// src/shared/workflows/workflow-runner.js), hier die Art eines erst im Lauf
// feststehenden Ziels. Aus `workflow-runner.test.js` ausgegliedert, damit
// beide Prüfdateien ihr Zeilen-Budget halten; Helfer nach demselben Muster.
import { describe, it, expect } from 'vitest';
import { dbDeleteTargets } from '../../src/shared/workflows/workflow-runner.js';

const s = (line, keyword, ...args) => ({
  line,
  blockLine: line,
  keyword,
  args,
  source: null,
  position: null,
});
const plan = (name, steps, children = {}) => ({ path: `C:/b/${name}.md`, name, steps, children });

// 4T-002547 (Nachzug nach der Entscheidung des Product Owners vom 2026-11-12):
// Steht der Datensatz erst im Lauf fest, nennt das Ziel seine Art, damit die
// eine Bestätigung in Worten sagt, was gelöscht wird.
describe('dbDeleteTargets: Art eines erst im Lauf feststehenden Ziels (4T-002547)', () => {
  const loeschen = (line, record, table = 'Library') => ({
    ...s(line, 'db-delete'),
    deferred: { step: { args: [{ raw: table }, { raw: record }] } },
  });
  const inSchleife = (...schritte) =>
    plan('A', [s(4, 'db-for-each', 'Listen/Offen.md'), ...schritte, s(9, 'end')]);

  it('die Kennung des Schleifen-Datensatzes: jeder Datensatz der Abfrage, mit Grenze', () => {
    expect(dbDeleteTargets(inSchleife(loeschen(5, '{{record:id}}')))).toEqual([
      {
        table: 'Library',
        record: '{{record:id}}',
        art: 'schleife',
        query: 'Listen/Offen.md',
        max: 500,
      },
    ]);
    // Schreibung und Leerraum um den Platzhalter zählen nicht.
    expect(dbDeleteTargets(inSchleife(loeschen(5, ' {{record:ID}} ')))[0].art).toBe('schleife');
  });

  it('ein Feld des Schleifen-Datensatzes: Feld und Abfrage', () => {
    expect(dbDeleteTargets(inSchleife(loeschen(5, '{{record:book}}')))).toEqual([
      {
        table: 'Library',
        record: '{{record:book}}',
        art: 'schleifenFeld',
        field: 'book',
        query: 'Listen/Offen.md',
        max: 500,
      },
    ]);
  });

  it('eine in diesem Lauf vergebene Kennung', () => {
    expect(dbDeleteTargets(plan('A', [loeschen(5, '{{created:neu}}')]))).toEqual([
      { table: 'Library', record: '{{created:neu}}', art: 'erstellt' },
    ]);
  });

  it('ein Feldwert eines Datensatzes, in einer Schleife mit der Abfrage', () => {
    const ziel = {
      table: 'Library',
      record: '{{db:Loans:r-00007:book}}',
      art: 'feld',
      field: 'book',
      source: 'r-00007',
      sourceTable: 'Loans',
    };
    expect(dbDeleteTargets(plan('A', [loeschen(5, '{{db:Loans:r-00007:book}}')]))).toEqual([ziel]);
    expect(dbDeleteTargets(inSchleife(loeschen(5, '{{db:Loans:r-00007:book}}')))).toEqual([
      { ...ziel, query: 'Listen/Offen.md', max: 500 },
    ]);
  });

  it('jede übrige Form ist offen: Mischform, record außerhalb einer Schleife, Datei-Schleife', () => {
    expect(dbDeleteTargets(inSchleife(loeschen(5, 'r-{{record:id}}')))[0].art).toBe('offen');
    expect(dbDeleteTargets(inSchleife(loeschen(5, '{{record:table}}')))[0].art).toBe('offen');
    expect(dbDeleteTargets(plan('A', [loeschen(5, '{{record:id}}')]))[0].art).toBe('offen');
    const dateiSchleife = plan('A', [
      s(4, 'for-each', '*.md'),
      loeschen(5, '{{record:id}}'),
      s(6, 'end'),
    ]);
    expect(dbDeleteTargets(dateiSchleife)[0].art).toBe('offen');
  });

  it('ein festes Ziel bleibt ohne Art, auch in einer Schleife', () => {
    expect(dbDeleteTargets(inSchleife(s(5, 'db-delete', 'Library', 'Solaris')))).toEqual([
      { table: 'Library', record: 'Solaris' },
    ]);
  });
});
