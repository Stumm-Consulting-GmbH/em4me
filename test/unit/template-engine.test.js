// 4T-000425 (Epic 3E-000080): Unit-Tests der Platzhalter-Engine — alle
// v1-Platzhalter, Escapes, Offsets/Formate (Datums-Kern der Query-Sprache),
// Fehler-Fälle, Mehrfach-Vorkommen und Cursor-Offsets über die reine
// Zwei-Phasen-Schnittstelle (analyzeTemplate/fillTemplate).
import { describe, it, expect } from 'vitest';
import { analyzeTemplate, fillTemplate, renderTemplate } from '../../src/shared/template-engine.js';

// Fester Bezugszeitpunkt (lokal konstruiert, symmetrisch zu formatDateMs —
// zeitzonen-unabhängig testbar): 2026-07-09 14:30:15.
const NOW = new Date(2026, 6, 9, 14, 30, 15).getTime();

function fill(text, context = {}) {
  return renderTemplate(text, { nowMs: NOW, ...context });
}

describe('analyzeTemplate — Zerlegung und Eingaben-Analyse', () => {
  it('reiner Literal-Text bleibt unverändert, keine Eingaben', () => {
    const analysis = analyzeTemplate('# Überschrift\n\nText.');
    expect(analysis.ok).toBe(true);
    expect(analysis.inputs).toEqual([]);
    expect(fillTemplate(analysis, {}).text).toBe('# Überschrift\n\nText.');
  });

  it('Escape \\{{ liefert literales {{ (kein Platzhalter)', () => {
    const result = fill('Syntax: \\{{date}} bleibt stehen.');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Syntax: {{date}} bleibt stehen.');
  });

  it('meldet interaktive Eingaben in Reihenfolge des ersten Vorkommens', () => {
    const analysis = analyzeTemplate(
      '{{prompt:Thema}} {{select:Status:Offen,Erledigt}} {{prompt:Thema}} {{prompt:Autor:Ich}}',
    );
    expect(analysis.ok).toBe(true);
    expect(analysis.inputs).toEqual([
      { key: 'prompt:Thema:', kind: 'prompt', question: 'Thema', defaultValue: '' },
      {
        key: 'select:Status:Offen,Erledigt',
        kind: 'select',
        question: 'Status',
        options: ['Offen', 'Erledigt'],
      },
      { key: 'prompt:Autor:Ich', kind: 'prompt', question: 'Autor', defaultValue: 'Ich' },
    ]);
  });

  it('unterschiedliche Defaults sind unterschiedliche Eingaben', () => {
    const analysis = analyzeTemplate('{{prompt:Frage:A}} {{prompt:Frage:B}}');
    expect(analysis.inputs).toHaveLength(2);
  });
});

describe('Zeit-Platzhalter — Offsets und Formate über den Query-Kern', () => {
  it('{{date}} nutzt das Default-Format yyyy-MM-dd', () => {
    expect(fill('{{date}}').text).toBe('2026-07-09');
  });

  it('{{time}} nutzt das Default-Format HH:mm', () => {
    expect(fill('{{time}}').text).toBe('14:30');
  });

  it('Offsets mit Dauer-Einheiten der Query-Sprache, Vorzeichen optional', () => {
    expect(fill('{{date:+7d}}').text).toBe('2026-07-16');
    expect(fill('{{date:-1w}}').text).toBe('2026-07-02');
    expect(fill('{{date:7d}}').text).toBe('2026-07-16');
    expect(fill('{{date:+1d 12h}}').text).toBe('2026-07-11'); // 14:30 + 36h
  });

  it("Formate dürfen ':' enthalten (dateformat-Token)", () => {
    expect(fill('{{time::HH:mm:ss}}').text).toBe('14:30:15');
    expect(fill('{{date:+1d:dd.MM.yyyy}}').text).toBe('10.07.2026');
    expect(fill('{{date::yyyy-MM-dd HH:mm}}').text).toBe('2026-07-09 14:30');
  });

  it('ungültiger Offset bricht strukturiert ab (Code und Position)', () => {
    const result = fill('Kopf\n{{date:+7 lichtjahre}}');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('invalidOffset');
    expect(result.error.pos).toBe(5);
    expect(result.error.name).toBe('date');
  });
});

describe('Kontext-Platzhalter', () => {
  it('title, folder und clipboard kommen aus dem Anwendungs-Kontext', () => {
    const result = fill('# {{title}}\n\nOrdner: {{folder}}\n\n{{clipboard}}', {
      title: 'Projekt/Notiz',
      folder: 'Notizen/GTD',
      clipboard: 'Eingefügt',
    });
    expect(result.text).toBe('# Projekt/Notiz\n\nOrdner: Notizen/GTD\n\nEingefügt');
  });

  it('fehlende Kontext-Werte werden zu leeren Strings', () => {
    expect(fill('[{{title}}|{{folder}}|{{clipboard}}]').text).toBe('[||]');
  });

  it('Parameter an parameterlosen Platzhaltern sind ein Fehler', () => {
    const result = fill('{{title:xyz}}');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('invalidParams');
  });
});

describe('prompt/select — Antworten und Mehrfach-Vorkommen', () => {
  it('setzt Antworten überall ein (identische Frage nur einmal erhoben)', () => {
    const analysis = analyzeTemplate('# {{prompt:Thema}}\n\nNochmal: {{prompt:Thema}}');
    expect(analysis.inputs).toHaveLength(1);
    const result = fillTemplate(analysis, { answers: { 'prompt:Thema:': 'Budget' } });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('# Budget\n\nNochmal: Budget');
  });

  it('select-Optionen: Kommas trennen, Defaults mit ":" bleiben erhalten', () => {
    const analysis = analyzeTemplate('{{select:Prio:Hoch, Mittel ,Niedrig}} {{prompt:Zeit:08:00}}');
    expect(analysis.inputs[0].options).toEqual(['Hoch', 'Mittel', 'Niedrig']);
    expect(analysis.inputs[1].defaultValue).toBe('08:00');
  });

  it('select ohne Optionen und prompt ohne Frage sind Fehler', () => {
    expect(analyzeTemplate('{{select:Frage}}').error.code).toBe('invalidParams');
    expect(analyzeTemplate('{{select:Frage:, ,}}').error.code).toBe('invalidParams');
    expect(analyzeTemplate('{{prompt}}').error.code).toBe('invalidParams');
    expect(analyzeTemplate('{{prompt: }}').error.code).toBe('invalidParams');
  });

  it('fehlende Antwort bricht strukturiert ab (missingAnswer)', () => {
    const analysis = analyzeTemplate('{{prompt:Frage}}');
    const result = fillTemplate(analysis, { answers: {} });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('missingAnswer');
    expect(result.error.key).toBe('prompt:Frage:');
  });
});

describe('cursor — Ziel-Marker und Offsets', () => {
  it('entfernt die Marker und liefert die Offsets im Ergebnis-Text', () => {
    const result = fill('# Kopf\n{{cursor}}Ende');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('# Kopf\nEnde');
    expect(result.cursorOffsets).toEqual([7]);
  });

  it('nummerierte Ziele sortieren nach Nummer, nicht nach Vorkommen', () => {
    const result = fill('A{{cursor:2}}B{{cursor}}C');
    expect(result.text).toBe('ABC');
    // {{cursor}} = Nummer 1 (Offset 2, nach 'AB'), {{cursor:2}} = Offset 1.
    expect(result.cursorOffsets).toEqual([2, 1]);
  });

  it('Offsets berücksichtigen gefüllte Platzhalter davor', () => {
    const result = fill('{{date}} {{cursor}}X');
    expect(result.text).toBe('2026-07-09 X');
    expect(result.cursorOffsets).toEqual([11]);
  });

  it('ungültige Cursor-Nummern sind ein Fehler', () => {
    expect(analyzeTemplate('{{cursor:0}}').error.code).toBe('invalidParams');
    expect(analyzeTemplate('{{cursor:abc}}').error.code).toBe('invalidParams');
  });
});

describe('Fehler-Fälle der Zerlegung', () => {
  it('unbekannter Platzhalter mit Name und Position', () => {
    const result = analyzeTemplate('Text {{unknown:x}}');
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ code: 'unknownPlaceholder', pos: 5, name: 'unknown' });
  });

  it('nicht geschlossener Platzhalter', () => {
    const result = analyzeTemplate('Text {{date');
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ code: 'unclosed', pos: 5 });
  });

  it('Platzhalter-Namen sind case-insensitiv notiert', () => {
    expect(fill('{{DATE}}').text).toBe('2026-07-09');
  });
});
