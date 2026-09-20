// @vitest-environment jsdom
// 4T-001722 (Epic 3E-000303): Der Buchführungs-Teil der Höhen-Meldung — ein
// Beobachter je Widget-DOM, sauberes Aufräumen, und kein Fehler, wenn kein
// Editor da ist.
//
// **Was hier NICHT geprüft wird und warum.** Ob der Versatz verschwindet, hängt
// an echtem Layout: an der Höhe, die eine Gestaltungs-Regel einem Kasten gibt,
// und an der Nachmessung eines laufenden Editors. jsdom hat weder einen
// Layout-Motor noch einen `ResizeObserver`; jede Zusicherung darüber wäre hier
// erfunden. Der Nachweis der Wirkung steht deshalb im E2E-Fall FM-04 gegen die
// gebaute Anwendung. Hier stehen die drei Lagen, in denen ein Irrtum still
// bliebe: ein doppelt hängender Beobachter, ein nach dem Entfernen des Widgets
// zurückbleibender Beobachter, und ein Rückruf ohne Editor.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Der Zugriff auf den Editor läuft ausschließlich über `EditorView.findFromDOM`.
// Ohne laufenden Editor liefert es null — genau die Lage, die das Modul
// aushalten muss.
vi.mock('@codemirror/view', () => ({ EditorView: { findFromDOM: () => null } }));

const { beobachteWidgetHoehe, loeseWidgetHoehenBeobachtung } =
  await import('../../../src/renderer/modules/live/live-widget-hoehe.js');

// Ersatz für den fehlenden ResizeObserver der Prüf-Umgebung. Er merkt sich, was
// beobachtet und was getrennt wurde, und lässt den Rückruf von Hand auslösen.
class BeobachterErsatz {
  constructor(rueckruf) {
    this.rueckruf = rueckruf;
    this.beobachtet = [];
    this.getrennt = 0;
    BeobachterErsatz.alle.push(this);
  }
  observe(el) {
    this.beobachtet.push(el);
  }
  disconnect() {
    this.getrennt++;
  }
  ausloesen() {
    this.rueckruf([], this);
  }
}
BeobachterErsatz.alle = [];

function widgetKasten(hoehe) {
  const editor = document.createElement('div');
  editor.className = 'cm-editor';
  const kasten = document.createElement('div');
  kasten.className = 'cm-live-frontmatter';
  // jsdom kennt kein Layout; die Höhe wird gestellt.
  kasten.getBoundingClientRect = () => ({ height: hoehe(), top: 0, left: 0, width: 100 });
  editor.appendChild(kasten);
  document.body.appendChild(editor);
  return kasten;
}

beforeEach(() => {
  BeobachterErsatz.alle = [];
  globalThis.ResizeObserver = BeobachterErsatz;
});

afterEach(() => {
  delete globalThis.ResizeObserver;
  document.body.innerHTML = '';
});

describe('beobachteWidgetHoehe', () => {
  it('beobachtet genau das übergebene Element', () => {
    const kasten = widgetKasten(() => 30);
    beobachteWidgetHoehe(kasten);
    expect(BeobachterErsatz.alle).toHaveLength(1);
    expect(BeobachterErsatz.alle[0].beobachtet).toEqual([kasten]);
  });

  it('hängt bei einem zweiten Aufruf keinen zweiten Beobachter an (AK3/AK4)', () => {
    // Die Lage entsteht im Bestand: CodeMirror verwendet das DOM eines
    // gleichen Widgets wieder, und ein zweiter Bau-Schritt darf nicht zu zwei
    // Beobachtern am selben Element führen.
    const kasten = widgetKasten(() => 30);
    const auf1 = beobachteWidgetHoehe(kasten);
    const auf2 = beobachteWidgetHoehe(kasten);
    expect(BeobachterErsatz.alle).toHaveLength(1);
    expect(auf2).toBe(auf1);
  });

  it('trennt den Beobachter über die zurückgegebene Aufräum-Funktion', () => {
    const kasten = widgetKasten(() => 30);
    beobachteWidgetHoehe(kasten)();
    expect(BeobachterErsatz.alle[0].getrennt).toBe(1);
  });

  it('erlaubt nach dem Aufräumen einen neuen Beobachter am selben Element', () => {
    const kasten = widgetKasten(() => 30);
    beobachteWidgetHoehe(kasten)();
    beobachteWidgetHoehe(kasten);
    expect(BeobachterErsatz.alle).toHaveLength(2);
    expect(BeobachterErsatz.alle[1].beobachtet).toEqual([kasten]);
  });

  it('läuft ohne Element und ohne ResizeObserver fehlerfrei durch', () => {
    expect(() => beobachteWidgetHoehe(null)()).not.toThrow();
    delete globalThis.ResizeObserver;
    const kasten = widgetKasten(() => 30);
    expect(() => beobachteWidgetHoehe(kasten)()).not.toThrow();
    expect(BeobachterErsatz.alle).toHaveLength(0);
  });

  it('wirft nicht, wenn zur Höhen-Änderung kein Editor zu finden ist', () => {
    // `findFromDOM` liefert hier immer null (Mock oben): das Widget kann gebaut
    // werden, bevor es im Editor hängt, und darf dann nichts tun.
    let hoehe = 30;
    const kasten = widgetKasten(() => hoehe);
    beobachteWidgetHoehe(kasten);
    hoehe = 143;
    expect(() => BeobachterErsatz.alle[0].ausloesen()).not.toThrow();
  });
});

describe('loeseWidgetHoehenBeobachtung', () => {
  it('trennt den Beobachter eines Elements (Aufräum-Weg aus destroy)', () => {
    const kasten = widgetKasten(() => 30);
    beobachteWidgetHoehe(kasten);
    loeseWidgetHoehenBeobachtung(kasten);
    expect(BeobachterErsatz.alle[0].getrennt).toBe(1);
  });

  it('bleibt ohne Beobachter und ohne Element wirkungslos statt fehlerhaft', () => {
    const kasten = widgetKasten(() => 30);
    expect(() => loeseWidgetHoehenBeobachtung(kasten)).not.toThrow();
    expect(() => loeseWidgetHoehenBeobachtung(null)).not.toThrow();
    expect(() => loeseWidgetHoehenBeobachtung(undefined)).not.toThrow();
  });

  it('trennt zweimal gerufen nur einmal', () => {
    const kasten = widgetKasten(() => 30);
    beobachteWidgetHoehe(kasten);
    loeseWidgetHoehenBeobachtung(kasten);
    loeseWidgetHoehenBeobachtung(kasten);
    expect(BeobachterErsatz.alle[0].getrennt).toBe(1);
  });
});
