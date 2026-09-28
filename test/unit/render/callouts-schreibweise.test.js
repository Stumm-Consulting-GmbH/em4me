// 4T-001864 (Epic 3E-000320): Hinweis-Kästen in jeder Schreibweise — die
// Stellen 1 und 2 der Bestands-Erhebung (Erkennung im Render-Weg und Abgleich
// gegen die Typ-Tafel) samt der gemeinsamen Nachschlage-Funktion.
//
// Geprüft wird die GLEICHWERTIGKEIT und nicht bloß ein Treffer: `[!NOTE]`,
// `[!Note]`, `[!note]` und `[!nOtE]` müssen dieselbe Ausgabe erzeugen, Zeichen
// für Zeichen. Ein Vergleich gegen die Kleinform fängt auch den Fall, in dem
// eine Großform zwar eine Box ergibt, aber mit falscher Klasse, fehlendem
// Symbol oder fremdem Standard-Titel.
//
// Beide markdown-it-Instanzen registrieren dasselbe Plugin (gesetzte Ansicht
// und PDF-Weg über `md`, portable Anzeige über `mdPortable`); beide Wege
// werden hier einzeln belegt, statt es anzunehmen.
//
// Die Stellen 3 bis 7 (Live-Ansicht, Marker-Hervorhebung, Linter) liegen in
// test/unit/renderer/callouts-schreibweise-live.test.js.
//
// 4T-001914 (Epic 3E-000320): Seit dieselbe Regel für die Container-Blöcke
// `::: name` gilt, stehen hier auch deren Container-Stellen 1 bis 3 samt dem
// Titel der neutralen Box (Abschnitte ab «containerKind» unten).
import { describe, it, expect, afterEach } from 'vitest';
import {
  CALLOUT_TYPES,
  calloutTypeKey,
  containerKind,
  containerNameKey,
} from '../../../src/shared/callouts.js';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';

afterEach(() => {
  configureExtensions([]);
});

const TYPEN = Object.keys(CALLOUT_TYPES);
const PORTABEL = '<!-- perspective-portable -->\n\n';

// Die vier Schreibweisen eines Typ-Namens: klein, groß, erster Buchstabe groß
// und im Wechsel gemischt.
function schreibweisen(typ) {
  const wechsel = [...typ].map((z, i) => (i % 2 ? z.toUpperCase() : z)).join('');
  return [typ, typ.toUpperCase(), typ[0].toUpperCase() + typ.slice(1), wechsel];
}

describe('calloutTypeKey — gemeinsame Nachschlage-Funktion', () => {
  it('führt jede Schreibweise der zehn Typen auf den kleingeschriebenen Schlüssel', () => {
    expect(TYPEN).toHaveLength(10);
    for (const typ of TYPEN) {
      for (const form of schreibweisen(typ)) expect(calloutTypeKey(form), form).toBe(typ);
    }
    expect(calloutTypeKey('nOtE')).toBe('note');
  });

  it('erweitert die Liste nicht: fremde Typ-Namen bleiben unbekannt (AK14)', () => {
    for (const name of ['UNBEKANNT', 'IMPORTANT', 'important', 'Caution', 'CAUTION', 'notes']) {
      expect(calloutTypeKey(name), name).toBeNull();
    }
  });

  it('hält geerbte Objekt-Namen und leere Eingaben draußen', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__', '']) {
      expect(calloutTypeKey(name), name).toBeNull();
    }
    expect(calloutTypeKey(null)).toBeNull();
    expect(calloutTypeKey(undefined)).toBeNull();
  });
});

describe('Render-Weg: dieselbe Box in jeder Schreibweise (Stellen 1 und 2)', () => {
  it('erzeugt für alle zehn Typen dieselbe Ausgabe wie die Kleinform (AK1, AK11)', () => {
    for (const typ of TYPEN) {
      const soll = renderMarkdown(`> [!${typ}]\n> Inhalt`, 'de');
      expect(soll, typ).toContain(`class="callout callout-${typ}"`);
      expect(soll, typ).toContain(`data-i18n="callout.${typ}.title"`);
      expect(soll, typ).toContain(CALLOUT_TYPES[typ].iconSvg);
      for (const form of schreibweisen(typ)) {
        expect(renderMarkdown(`> [!${form}]\n> Inhalt`, 'de'), form).toBe(soll);
      }
    }
  });

  it('zeigt die Kopfzeile nicht als Text, in keiner Schreibweise', () => {
    for (const form of ['NOTE', 'Note', 'nOtE']) {
      expect(renderMarkdown(`> [!${form}]\n> Inhalt`, 'de')).not.toContain(`[!${form}]`);
    }
  });

  it('übernimmt den eigenen Titel hinter einem großgeschriebenen Typ, wie er geschrieben ist (AK12)', () => {
    const gross = renderMarkdown('> [!NOTE] Eigener Titel\n> Inhalt', 'de');
    expect(gross).toBe(renderMarkdown('> [!note] Eigener Titel\n> Inhalt', 'de'));
    expect(gross).toContain('<span class="callout-title">Eigener Titel</span>');
    expect(gross).not.toContain('data-i18n="callout.note.title"');
    // Die Schreibweise des Titels bleibt, die des Typs spielt keine Rolle.
    const gemischt = renderMarkdown('> [!wArNiNg] GROSS und klein\n> x', 'de');
    expect(gemischt).toContain('class="callout callout-warning"');
    expect(gemischt).toContain('<span class="callout-title">GROSS und klein</span>');
  });

  it('klappt mit Plus und Minus in jeder Schreibweise gleich (AK6)', () => {
    const zu = renderMarkdown('> [!NOTE]- Titel\n> Inhalt', 'de');
    expect(zu).toBe(renderMarkdown('> [!note]- Titel\n> Inhalt', 'de'));
    expect(zu).toContain('<details class="callout callout-note">');
    const auf = renderMarkdown('> [!Tip]+ Titel\n> Inhalt', 'de');
    expect(auf).toBe(renderMarkdown('> [!tip]+ Titel\n> Inhalt', 'de'));
    expect(auf).toContain('<details class="callout callout-tip" open>');
  });

  it('erzeugt bei geschachteltem Zitat auch in Großform keine Box in der Box (AK13)', () => {
    const html = renderMarkdown('> > [!NOTE]\n> > Inhalt', 'de');
    expect(html).not.toContain('callout');
    expect(html).toContain('[!NOTE]');
    // Gegenprobe: Innerhalb einer echten Box bleibt ein inneres Zitat Zitat.
    const innen = renderMarkdown('> [!NOTE]\n> > [!WARNING]\n> > Innen', 'de');
    expect(innen).toContain('callout-note');
    expect(innen).not.toContain('callout-warning');
    expect(innen).toContain('[!WARNING]');
  });

  it('lässt einen unbekannten Typ in jeder Schreibweise gewöhnliches Zitat, wie geschrieben (AK4, AK14)', () => {
    for (const form of ['UNBEKANNT', 'unbekannt', 'IMPORTANT', 'important', 'Caution']) {
      const html = renderMarkdown(`> [!${form}]\n> Inhalt`, 'de');
      expect(html, form).not.toContain('callout');
      expect(html, form).toContain('<blockquote');
      expect(html, form).toContain(`[!${form}]`);
    }
  });
});

describe('Portable Anzeige: dieselbe Box mit Gestaltungs-Angaben (AK5)', () => {
  it('gibt der Großform dieselben Inline-Angaben und denselben Titel wie der Kleinform', () => {
    for (const typ of TYPEN) {
      const soll = renderMarkdown(`${PORTABEL}> [!${typ}]\n> Inhalt`, 'de');
      expect(soll, typ).toContain(`class="callout callout-${typ}" style="border-left:4px solid`);
      for (const form of schreibweisen(typ)) {
        expect(renderMarkdown(`${PORTABEL}> [!${form}]\n> Inhalt`, 'de'), form).toBe(soll);
      }
    }
    expect(renderMarkdown(`${PORTABEL}> [!WARNING]\n> x`, 'de')).toContain(
      '<span class="callout-title">Warnung</span>',
    );
  });

  it('schreibt die Typ-Angabe im portablen Export nicht um (AK7)', () => {
    const src = '> [!NOTE]\n> a\n\n> [!Note] Titel\n> b\n\n> [!nOtE]-\n> c\n';
    const export_ = convertMarkdownPortable(src, true, 'de');
    for (const zeile of ['> [!NOTE]', '> [!Note] Titel', '> [!nOtE]-']) {
      expect(export_).toContain(zeile);
    }
    expect(export_).not.toContain('[!note]');
  });
});

describe('Aus-Zustand der Erweiterung callouts (AK8)', () => {
  it('lässt die Zeile in jeder Schreibweise gewöhnlichen Zitat-Inhalt', () => {
    configureExtensions(['callouts']);
    for (const form of ['note', 'NOTE', 'Note', 'nOtE']) {
      const html = renderMarkdown(`> [!${form}] Titel\n> Inhalt`, 'de');
      expect(html, form).not.toContain('callout');
      expect(html, form).toContain('<blockquote');
      expect(html, form).toContain(`[!${form}] Titel`);
    }
  });
});

describe('Nachbar-Konstrukte: Container-Blöcke folgen seit 4T-001914 derselben Regel', () => {
  // 4T-001914 (Epic 3E-000320): Bis zu diesem Task hielt der Fall fest, dass die
  // Container-Blöcke den Typ nur in Kleinform erkennen, damit eine Änderung dort
  // eine bewusste sei. Sie ist es jetzt — der Product Owner hat am 2026-09-23
  // entschieden, dass die Container derselben Regel folgen —, und der Fall ist
  // bewusst umgekehrt; die Einzelfälle stehen im nächsten Abschnitt.
  it('Container-Blöcke erkennen den Typ in jeder Schreibweise wie die Hinweis-Kästen', () => {
    expect(renderMarkdown('::: warning\nBox\n:::', 'de')).toContain('callout-warning');
    expect(renderMarkdown('::: WARNING\nBox\n:::', 'de')).toContain('callout-warning');
  });
});

// 4T-001914 (Epic 3E-000320): Container-Blöcke `::: name` in jeder Schreibweise
// — die Container-Stellen 1 bis 3 der Bestands-Erhebung im Render-Weg:
//
//   Container-Stelle 1  Namens-Muster der Kopfzeile (CONTAINER_INFO_RE)
//   Container-Stelle 2  Nachschlagen in der Typ-Tafel (vorher blank, S3)
//   Container-Stelle 3  Vergleich mit `columns` (vorher in geschriebener Form)
//
// Dazu die Fehlerbehebung S4: Die neutrale Box zeigt den Namen als Titel, wie er
// geschrieben ist. Die Container-Stellen 4 bis 7 liegen in
// test/unit/renderer/callouts-schreibweise-live.test.js.
const box = (kopf, inhalt = 'Inhalt') => `${kopf}\n${inhalt}\n:::`;

describe('containerKind — gemeinsame Einordnung der Container-Blöcke', () => {
  it('führt jede Schreibweise der zehn Typen auf die Hinweis-Box mit dem Tafel-Schlüssel', () => {
    for (const typ of TYPEN) {
      for (const form of schreibweisen(typ)) {
        expect(containerKind(form), form).toEqual({ kind: 'callout', type: typ });
      }
    }
  });

  it('ordnet unbekannte und geerbte Namen als neutrale Box mit kleingeschriebenem Schlüssel ein (AK5, AK7)', () => {
    expect(containerKind('Meine-Box')).toEqual({ kind: 'plain', key: 'meine-box' });
    expect(containerKind('meine-box')).toEqual({ kind: 'plain', key: 'meine-box' });
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'Constructor']) {
      expect(containerKind(name), name).toEqual({ kind: 'plain', key: name.toLowerCase() });
    }
    expect(containerNameKey('WARNING')).toBe('warning');
    expect(containerNameKey(undefined)).toBe('');
  });

  it('erkennt den Mehrspalten-Namen in jeder Schreibweise, die Spaltenzahl bleibt Bedingung (AK6)', () => {
    for (const form of ['columns', 'COLUMNS', 'Columns', 'cOlUmNs']) {
      expect(containerKind(form, '2'), form).toEqual({ kind: 'columns', count: 2 });
      expect(containerKind(form, '7'), form).toEqual({ kind: 'plain', key: 'columns' });
    }
  });
});

describe('Render-Weg der Container: dieselbe Box in jeder Schreibweise (Container-Stellen 1 bis 3)', () => {
  it('öffnet den Block auch mit Großbuchstaben im Namen (Container-Stelle 1)', () => {
    for (const kopf of ['::: WARNING', '::: Meine-Box', '::: COLUMNS 2']) {
      const html = renderMarkdown(box(kopf), 'de');
      expect(html, kopf).not.toContain(':::');
      expect(html, kopf).toMatch(/^<div class="(callout|custom-container|md-columns)/);
    }
  });

  it('erzeugt für alle zehn Typen dieselbe Ausgabe wie die Kleinform (AK1, Container-Stelle 2)', () => {
    for (const typ of TYPEN) {
      const soll = renderMarkdown(box(`::: ${typ}`), 'de');
      expect(soll, typ).toContain(`class="callout callout-${typ}"`);
      expect(soll, typ).toContain(`data-i18n="callout.${typ}.title"`);
      expect(soll, typ).toContain(CALLOUT_TYPES[typ].iconSvg);
      for (const form of schreibweisen(typ)) {
        expect(renderMarkdown(box(`::: ${form}`), 'de'), form).toBe(soll);
      }
    }
  });

  it('übernimmt den eigenen Titel hinter einem gemischt geschriebenen Typ, wie er geschrieben ist (AK4)', () => {
    const html = renderMarkdown(box('::: wArNiNg Eigener TITEL'), 'de');
    expect(html).toBe(renderMarkdown(box('::: warning Eigener TITEL'), 'de'));
    expect(html).toContain('<span class="callout-title">Eigener TITEL</span>');
    expect(html).not.toContain('data-i18n="callout.warning.title"');
  });

  it('gibt `::: Meine-Box` dieselbe neutrale Box wie `::: meine-box`, Titel wie geschrieben (AK5, AK8)', () => {
    const gross = renderMarkdown(box('::: Meine-Box'), 'de');
    const klein = renderMarkdown(box('::: meine-box'), 'de');
    expect(gross).toContain(
      '<div class="custom-container container-meine-box"><div class="custom-container-title">Meine-Box</div>',
    );
    expect(klein).toContain(
      '<div class="custom-container container-meine-box"><div class="custom-container-title">meine-box</div>',
    );
    // Bis auf den Titel, der dem geschriebenen Namen folgt, ist die Ausgabe gleich.
    expect(gross.replace('>Meine-Box<', '>meine-box<')).toBe(klein);
  });

  it('lässt einen Text hinter einem unbekannten Namen unsichtbar, der Titel bleibt der Name (Auslegung S4)', () => {
    const html = renderMarkdown(box('::: Meine-Box Weiterer Text'), 'de');
    expect(html).toContain('<div class="custom-container-title">Meine-Box</div>');
    expect(html).not.toContain('Weiterer Text');
  });

  it('macht aus geerbten Namen eine neutrale Box mit Titel, ohne Symbol und ohne undefined (AK7, Container-Stelle 2)', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      const html = renderMarkdown(box(`::: ${name}`), 'de');
      expect(html, name).toContain(
        `<div class="custom-container container-${name.toLowerCase()}"><div class="custom-container-title">${name}</div>`,
      );
      expect(html, name).not.toContain('callout');
      expect(html, name).not.toContain('undefined');
    }
  });

  it('setzt `::: COLUMNS 2` und `::: Columns 2` zweispaltig wie die Kleinform (AK6, Container-Stelle 3)', () => {
    const soll = renderMarkdown(box('::: columns 2', 'A\n\n+++\n\nB'), 'de');
    expect(soll).toContain('<div class="md-columns md-columns-2">');
    for (const kopf of ['::: COLUMNS 2', '::: Columns 2']) {
      expect(renderMarkdown(box(kopf, 'A\n\n+++\n\nB'), 'de'), kopf).toBe(soll);
    }
  });

  it('lässt `::: COLUMNS 7` auf die neutrale Box mit dem Namen als Titel zurückfallen (AK6, AK8)', () => {
    const html = renderMarkdown(box('::: COLUMNS 7'), 'de');
    expect(html).not.toContain('md-columns');
    expect(html).toContain(
      '<div class="custom-container container-columns"><div class="custom-container-title">COLUMNS</div>',
    );
  });

  it('setzt einen verschachtelten, groß geschriebenen Container wie die Kleinform (AK9)', () => {
    const verschachtelt = (aussen, innen) =>
      `:::: ${aussen}\nAußen.\n\n::: ${innen}\nInnen.\n:::\n::::`;
    const soll = renderMarkdown(verschachtelt('note', 'warning'), 'de');
    expect(soll).toContain('callout-note');
    expect(soll).toContain('callout-warning');
    expect(renderMarkdown(verschachtelt('NOTE', 'WARNING'), 'de')).toBe(soll);
    expect(renderMarkdown(verschachtelt('note', 'Warning'), 'de')).toBe(soll);
  });
});

describe('Portable Anzeige der Container (AK3, AK8)', () => {
  it('gibt der Großform eines Typs dieselben Inline-Angaben und denselben Titel wie der Kleinform', () => {
    const soll = renderMarkdown(`${PORTABEL}${box('::: warning')}`, 'de');
    expect(soll).toContain('class="callout callout-warning" style="border-left:4px solid');
    expect(soll).toContain('<span class="callout-title">Warnung</span>');
    for (const form of schreibweisen('warning')) {
      expect(renderMarkdown(`${PORTABEL}${box(`::: ${form}`)}`, 'de'), form).toBe(soll);
    }
  });

  it('zeigt in der neutralen Box den Namen als Titel mit eigener Gestaltungs-Angabe', () => {
    const html = renderMarkdown(`${PORTABEL}${box('::: Meine-Box')}`, 'de');
    expect(html).toContain(
      'class="custom-container container-meine-box" style="border:1px solid #ccc;',
    );
    expect(html).toContain(
      '<div class="custom-container-title" style="font-weight:600;margin:0 0 0.4em 0;">Meine-Box</div>',
    );
  });

  it('schreibt den Namen im portablen Export nicht um (AK10)', () => {
    const src = '::: WARNING\na\n:::\n\n::: Meine-Box\nb\n:::\n\n::: COLUMNS 2\nc\n:::\n';
    const export_ = convertMarkdownPortable(src, true, 'de');
    for (const zeile of ['::: WARNING', '::: Meine-Box', '::: COLUMNS 2']) {
      expect(export_).toContain(zeile);
    }
    expect(export_).not.toContain('::: warning');
    expect(export_).not.toContain('::: meine-box');
  });
});

describe('Aus-Zustand der Erweiterung custom-containers (AK11)', () => {
  it('lässt den Block in jeder Schreibweise gewöhnlichen Text', () => {
    configureExtensions(['custom-containers']);
    for (const kopf of ['::: warning', '::: WARNING', '::: Meine-Box', '::: COLUMNS 2']) {
      const html = renderMarkdown(box(kopf), 'de');
      expect(html, kopf).not.toContain('custom-container');
      expect(html, kopf).not.toContain('callout');
      expect(html, kopf).not.toContain('md-columns');
      expect(html, kopf).toContain(kopf);
    }
  });
});
