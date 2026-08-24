// @vitest-environment jsdom
// 4T-1176 (Epic 3E-0220, E7): Was das Kommando in das Dokument schreibt —
// geprüft am echten CodeMirror-State, nicht am Quelltext als Zeichenkette.
//
// Drei Zusagen der Story hängen hier: Der Block landet an der Cursor-Position
// (AK1), er ist ein gewöhnlicher `perspective-query`-Fence und danach änderbar
// wie jeder andere Inhalt (AK5), und er läuft über die vorhandene
// Ergebnis-Ausgabe statt über eine eigene Ansicht (AK6). Die letzten beiden
// sind dieselbe Tatsache von zwei Seiten: Wenn das Eingefügte nichts anderes
// ist als der Fence, den die Anwendung ohnehin kennt, gibt es weder ein
// eigenes Konstrukt noch eine zweite Ausgabe.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { parseQuery } from '../../../src/shared/query/perspective-query.js';
import { erzeugeProfilAbfrage } from '../../../src/shared/property-profiles.js';

const { baueAbfrageEinfuegung } =
  await import('../../../src/renderer/modules/properties/properties-profil-abfrage.js');

function stand(doc, cursor) {
  return EditorState.create({ doc, selection: { anchor: cursor } });
}

const ABFRAGE = erzeugeProfilAbfrage({ profil: 'Projekt' });

describe('Einfügung an der Cursor-Position (4T-1176, AK1)', () => {
  it('fügt ohne führenden Umbruch ein, wenn der Cursor am Zeilenanfang steht', () => {
    const text = baueAbfrageEinfuegung(ABFRAGE.text, stand('Absatz\n\nEnde', 7));
    expect(text.startsWith('```perspective-query')).toBe(true);
  });

  it('fügt ohne führenden Umbruch in eine leere Zeile ein', () => {
    // Leere Zeile mitten im Dokument: Der Cursor steht zugleich am Anfang
    // und am Ende, und ein Vorsatz erzeugte eine überflüssige Leerzeile.
    const text = baueAbfrageEinfuegung(ABFRAGE.text, stand('Absatz\n\nEnde', 7));
    expect(text).not.toContain('\n```perspective-query');
  });

  it('setzt einen Umbruch davor, wenn der Cursor mitten in einer Zeile steht', () => {
    // Sonst risse der Fence die Zeile auf, in der er beginnt, und wäre kein
    // Fence mehr — der Block braucht seine eigene Zeile.
    const text = baueAbfrageEinfuegung(ABFRAGE.text, stand('Text davor', 5));
    expect(text.startsWith('\n```perspective-query')).toBe(true);
  });

  it('setzt einen Umbruch davor, wenn der Cursor am Ende einer gefüllten Zeile steht', () => {
    const text = baueAbfrageEinfuegung(ABFRAGE.text, stand('Text davor', 10));
    expect(text.startsWith('\n```perspective-query')).toBe(true);
  });
});

describe('Das Eingefügte ist gewöhnlicher Inhalt (4T-1176, AK5/AK6)', () => {
  const text = baueAbfrageEinfuegung(ABFRAGE.text, stand('', 0));

  it('ist ein geschlossener perspective-query-Fence und nichts sonst', () => {
    expect(text).toBe('```perspective-query\nLIST\nWHERE class = "Projekt"\n```\n');
  });

  it('trägt keine Markierung, die den Block an sein Profil bindet', () => {
    // Kein Anker, keine Kennung, kein Kommentar: Der Block weiß nach dem
    // Einfügen nichts mehr von dem Kommando, das ihn geschrieben hat. Genau
    // das macht ihn frei änderbar (AK5) — und genau deshalb ist er eine
    // Momentaufnahme und kein lebender Bezug.
    const rumpf = text.replace(/^```perspective-query\n|\n```\n$/g, '');
    expect(rumpf).toBe(ABFRAGE.text);
  });

  it('enthält eine Abfrage, welche die Sprache annimmt', () => {
    const rumpf = text.replace(/^```perspective-query\n|\n```\n$/g, '');
    expect(parseQuery(rumpf).ok).toBe(true);
  });

  it('bleibt auch mit allen Bindungen ein einziger Fence', () => {
    const voll = erzeugeProfilAbfrage({
      profil: 'Projekt',
      bindings: [{ profile: 'Projekt', tags: ['projekt'], folders: ['10 Projekte'] }],
    });
    const eingefuegt = baueAbfrageEinfuegung(voll.text, stand('', 0));
    expect(eingefuegt.match(/```/g)).toHaveLength(2);
  });
});
