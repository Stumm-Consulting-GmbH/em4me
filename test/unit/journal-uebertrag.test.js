// 4T-002737 (Epic 3E-000396): Unit-Tests des Kerns «Übertrag offener
// Aufgaben» — was offen ist, Wurzeln und Teilbäume, Abschnitt, Einsetzen
// unter der gleichnamigen Überschrift, Doppel-Schutz, Zeilenenden, beide
// Modi und die Erhaltung der Aufgaben über beide Texte.
import { describe, it, expect } from 'vitest';
import { planeUebertrag, zerlegeZeilen, codeMaske } from '../../src/shared/journal-uebertrag.js';
import { isTaskLine, parseTaskLine } from '../../src/shared/tasks/task-markers.js';

const TYPEN = {
  ' ': 'TODO',
  '/': 'IN_PROGRESS',
  h: 'ON_HOLD',
  x: 'DONE',
  X: 'DONE',
  '-': 'CANCELLED',
  '~': 'NON_TASK',
  '»': 'NON_TASK',
};
const statusTypeOf = (z) => TYPEN[z] || null;

const lauf = (quelle, ziel, extra = {}) =>
  planeUebertrag(quelle, ziel, {
    modus: 'mark',
    abschnitt: '',
    globalFilter: '',
    statusTypeOf,
    ...extra,
  });

// Aufgaben-Zeilen eines Textes ohne Einrückung, außerhalb von Zäunen; ohne
// die mit dem Zeichen «Übertragen» gekennzeichneten.
function aufgaben(text) {
  const { zeilen } = zerlegeZeilen(text);
  const maske = codeMaske(zeilen, 0);
  return zeilen
    .filter((z, i) => !maske[i] && isTaskLine(z, ''))
    .filter((z) => parseTaskLine(z).statusChar !== '»')
    .map((z) => z.replace(/^[ \t]+/, ''));
}

describe('was offen ist', () => {
  const quelle = [
    '- [ ] offen',
    '- [/] in Arbeit',
    '- [h] wartend',
    '- [x] erledigt',
    '- [-] abgebrochen',
    '- [~] keine Aufgabe',
    '- [?] ohne Bedeutung',
    '- [»] übertragen',
    '',
  ].join('\n');

  it('Offen, In Arbeit, Wartend und ein Zeichen ohne Bedeutung wandern, der Rest nicht', () => {
    const r = lauf(quelle, '');
    expect(r.ok).toBe(true);
    expect(r.anzahl).toBe(4);
    expect(r.zielNeu).toBe('- [ ] offen\n- [/] in Arbeit\n- [h] wartend\n- [?] ohne Bedeutung\n');
    expect(r.quelleNeu).toBe(
      [
        '- [»] offen',
        '- [»] in Arbeit',
        '- [»] wartend',
        '- [x] erledigt',
        '- [-] abgebrochen',
        '- [~] keine Aufgabe',
        '- [»] ohne Bedeutung',
        '- [»] übertragen',
        '',
      ].join('\n'),
    );
  });

  it('eine Zeile mit » ist nie offen, auch wenn die Auflösung null oder TODO liefert', () => {
    for (const aufloesung of [() => null, () => 'TODO']) {
      const r = lauf('- [»] schon übertragen\n', '', { statusTypeOf: aufloesung });
      expect(r).toEqual({ ok: false, grund: 'nichts-offen' });
    }
  });

  it('ein anderes Zeichen für «Übertragen» gilt ebenso fest', () => {
    const r = lauf('- [>] weiter\n- [ ] neu\n', '', { zeichen: '>', statusTypeOf: () => 'TODO' });
    expect(r.zielNeu).toBe('- [ ] neu\n');
    expect(r.quelleNeu).toBe('- [>] weiter\n- [>] neu\n');
  });

  it('mit gesetztem Global Filter wandert nur die Zeile mit dem Filter', () => {
    const r = lauf('- [ ] a #task\n- [ ] b\n', '', { globalFilter: '#task' });
    expect(r.zielNeu).toBe('- [ ] a #task\n');
    expect(r.quelleNeu).toBe('- [»] a #task\n- [ ] b\n');
  });

  it('Kästchen in Code-Zaun, Zitat und Tabelle sind keine Aufgaben', () => {
    const q = '```\n- [ ] im Zaun\n```\n> - [ ] im Zitat\n\n| - [ ] in Tabelle |\n\n- [ ] echt\n';
    const r = lauf(q, '');
    expect(r.anzahl).toBe(1);
    expect(r.zielNeu).toBe('- [ ] echt\n');
    expect(r.quelleNeu).toBe(q.replace('- [ ] echt', '- [»] echt'));
  });
});

describe('Wurzeln und Teilbäume', () => {
  it('offen / erledigt / offen: ein Block, alles wandert', () => {
    const q = '- [ ] a\n  - [x] b\n    - [ ] c\n';
    const r = lauf(q, '');
    expect(r.anzahl).toBe(1);
    expect(r.zielNeu).toBe(q);
    expect(r.quelleNeu).toBe('- [»] a\n  - [»] b\n    - [»] c\n');
  });

  it('erledigt / offen: die Unteraufgabe wandert allein und ausgerückt', () => {
    const r = lauf('- [x] a\n  - [ ] b\n    - [x] c\n', '');
    expect(r.zielNeu).toBe('- [ ] b\n  - [x] c\n');
    expect(r.quelleNeu).toBe('- [x] a\n  - [»] b\n    - [»] c\n');
  });

  it('erledigt / erledigt / offen: die unterste wandert allein', () => {
    const r = lauf('- [x] a\n  - [-] b\n    - [ ] c\n', '');
    expect(r.zielNeu).toBe('- [ ] c\n');
  });

  it('der Teilbaum endet an der Leerzeile; der eingerückte Rest dahinter bleibt', () => {
    const q = '- [ ] a\n  Notiz\n\n  Rest-Notiz\n  - [x] erledigt danach\n';
    const r = lauf(q, '');
    expect(r.zielNeu).toBe('- [ ] a\n  Notiz\n');
    expect(r.quelleNeu).toBe('- [»] a\n  Notiz\n\n  Rest-Notiz\n  - [x] erledigt danach\n');
    const weg = lauf(q, '', { modus: 'remove' });
    expect(weg.quelleNeu).toBe('\n  Rest-Notiz\n  - [x] erledigt danach\n');
  });

  it('eine offene Aufgabe hinter der Leerzeile ist eine eigene Wurzel', () => {
    const r = lauf('- [ ] a\n\n  - [ ] b\n', '');
    expect(r.anzahl).toBe(2);
    expect(r.zielNeu).toBe('- [ ] a\n- [ ] b\n');
  });

  it('eine nummerierte Liste behält ihre Nummern', () => {
    const r = lauf('1. [ ] eins\n2. [x] zwei\n3. [ ] drei\n', '');
    expect(r.zielNeu).toBe('1. [ ] eins\n3. [ ] drei\n');
  });

  it('Einrückung mit Tabulator und mit Leerzeichen', () => {
    expect(lauf('- [x] a\n\t- [ ] b\n\t\t- [ ] c\n', '').zielNeu).toBe('- [ ] b\n\t- [ ] c\n');
    expect(lauf('- [x] a\n    - [ ] b\n        - [ ] c\n', '').zielNeu).toBe(
      '- [ ] b\n    - [ ] c\n',
    );
  });

  it('Termine, Priorität, Wiederholung, Erinnerung und Kennung wandern unverändert', () => {
    const zeile = '- [ ] Bericht 📅 2026-11-20 ⏫ 🔁 every week ⏰ 2026-11-19 09:00 🆔 abc ⛔ xyz';
    const r = lauf(`${zeile}\n`, '');
    expect(r.zielNeu).toBe(`${zeile}\n`);
    expect(r.quelleNeu).toBe(`${zeile.replace('[ ]', '[»]')}\n`);
    expect(r.quelleNeu).not.toContain('✅');
  });
});

describe('Abschnitt', () => {
  const q = '# Arbeit\n- [ ] a\n## Unter\n- [ ] b\n# Privat\n- [ ] c\n';

  it('nur Wurzeln unter dem Abschnitt und seinen Unter-Überschriften', () => {
    const r = lauf(q, '', { abschnitt: 'Arbeit' });
    expect(r.anzahl).toBe(2);
    expect(r.zielNeu).toBe('# Arbeit\n\n- [ ] a\n\n## Unter\n\n- [ ] b\n');
    expect(r.quelleNeu).toBe('# Arbeit\n- [»] a\n## Unter\n- [»] b\n# Privat\n- [ ] c\n');
  });

  it('ohne Unterschied von Groß- und Kleinschreibung, mit Rand-Leerraum', () => {
    expect(lauf(q, '', { abschnitt: '  ARBEIT ' }).anzahl).toBe(2);
    expect(lauf(q, '', { abschnitt: 'unter' }).anzahl).toBe(1);
  });

  it('ein fehlender Abschnitt liefert abschnitt-fehlt', () => {
    expect(lauf(q, '', { abschnitt: 'Garten' })).toEqual({ ok: false, grund: 'abschnitt-fehlt' });
  });

  it('eine Überschrift im Code-Zaun zählt nicht als Abschnitt', () => {
    const r = lauf('```\n# Garten\n```\n- [ ] a\n', '', { abschnitt: 'Garten' });
    expect(r).toEqual({ ok: false, grund: 'abschnitt-fehlt' });
  });

  it('ein vorhandener Abschnitt ohne offene Aufgabe liefert nichts-offen', () => {
    expect(lauf(q + '# Leer\n', '', { abschnitt: 'Leer' })).toEqual({
      ok: false,
      grund: 'nichts-offen',
    });
  });
});

describe('Einsetzen ins Ziel', () => {
  it('unter der vorhandenen Überschrift, hinter der letzten nicht leeren Zeile', () => {
    const ziel = '# Heute\n\nText\n\n# Später\n';
    const r = lauf('## heute\n- [ ] a\n- [ ] b\n', ziel);
    expect(r.zielNeu).toBe('# Heute\n\nText\n\n- [ ] a\n- [ ] b\n\n# Später\n');
    expect(r.einfuegungen).toEqual([{ offset: 14, laenge: 17 }]);
  });

  it('hinter einem Listenpunkt ohne Leerzeile, vor einer folgenden Zeile mit Leerzeile', () => {
    const ziel = '# Aufgaben\n- [ ] x\n# Aufgaben\n- [ ] y\n';
    const r = lauf('# aufgaben\n- [ ] neu\n', ziel);
    expect(r.zielNeu).toBe('# Aufgaben\n- [ ] x\n- [ ] neu\n\n# Aufgaben\n- [ ] y\n');
  });

  it('hinter der Fortsetzung eines Listenpunkts ohne Leerzeile', () => {
    const r = lauf('# A\n- [ ] neu\n', '# A\n- [ ] alt\n  Notiz\n');
    expect(r.zielNeu).toBe('# A\n- [ ] alt\n  Notiz\n- [ ] neu\n');
  });

  it('eine fehlende Überschrift wird mit Ebene und Wortlaut am Ende angelegt', () => {
    const r = lauf('### Projekt X ###\n- [ ] a\n', 'Notiz\n');
    expect(r.zielNeu).toBe('Notiz\n\n### Projekt X ###\n\n- [ ] a\n');
  });

  it('eine Überschrift im Code-Zaun des Ziels zählt nicht', () => {
    const r = lauf('# Arbeit\n- [ ] a\n', '```\n# Arbeit\n```\n');
    expect(r.zielNeu).toBe('```\n# Arbeit\n```\n\n# Arbeit\n\n- [ ] a\n');
  });

  it('Aufgaben vor der ersten Überschrift kommen an das Ende des Ziels', () => {
    const r = lauf('- [ ] frei\n# A\n- [ ] a\n', '# A\n- [ ] alt\n');
    expect(r.zielNeu).toBe('# A\n- [ ] alt\n- [ ] a\n- [ ] frei\n');
    const r2 = lauf('- [ ] frei\n', '# B\nText\n');
    expect(r2.zielNeu).toBe('# B\nText\n\n- [ ] frei\n');
  });

  it('in ein leeres Ziel', () => {
    expect(lauf('# A\n- [ ] a\n', '').zielNeu).toBe('# A\n\n- [ ] a\n');
    expect(lauf('- [ ] a\n', '').einfuegungen).toEqual([{ offset: 0, laenge: 8 }]);
  });

  it('in ein Ziel nur aus Kopf-Block; der Kopf-Block bleibt unberührt', () => {
    const ziel = '---\ntitel: x\n---\n';
    const r = lauf('# A\n- [ ] a\n', ziel);
    expect(r.zielNeu).toBe('---\ntitel: x\n---\n\n# A\n\n- [ ] a\n');
    expect(r.zielNeu.startsWith(ziel)).toBe(true);
  });

  it('der Kopf-Block der Quelle bleibt unberührt', () => {
    const q = '---\nliste:\n  - [ ] kein\n---\n- [ ] a\n';
    const r = lauf(q, '');
    expect(r.anzahl).toBe(1);
    expect(r.quelleNeu).toBe('---\nliste:\n  - [ ] kein\n---\n- [»] a\n');
  });

  it('Reihenfolge der Quelle, neue Überschriften nach erstem Auftreten', () => {
    const q = '# B\n- [ ] b1\n# A\n- [ ] a1\n# B\n- [ ] b2\n# C\n- [ ] c1\n';
    const r = lauf(q, '# A\n- [ ] alt\n');
    expect(r.zielNeu).toBe(
      '# A\n- [ ] alt\n- [ ] a1\n\n# B\n\n- [ ] b1\n- [ ] b2\n\n# C\n\n- [ ] c1\n',
    );
  });

  it('einfuegungen verschieben jede alte Stelle um die Längen davor', () => {
    const ziel = '# A\n- [ ] alpha\n\n# B\nbeta\n\n# C\ngamma\n';
    const r = lauf('# A\n- [ ] a1\n# B\n- [ ] b1\n# D\n- [ ] d1\n', ziel);
    expect(r.zielNeu).toBe(
      '# A\n- [ ] alpha\n- [ ] a1\n\n# B\nbeta\n\n- [ ] b1\n\n# C\ngamma\n\n# D\n\n- [ ] d1\n',
    );
    expect(r.einfuegungen).toHaveLength(3);
    const neu = (p) =>
      p + r.einfuegungen.filter((e) => e.offset <= p).reduce((s, e) => s + e.laenge, 0);
    for (const marke of ['alpha', 'beta', 'gamma']) {
      const p = ziel.indexOf(marke);
      expect(r.zielNeu.slice(neu(p), neu(p) + marke.length)).toBe(marke);
    }
    for (let p = 0; p < ziel.length; p++) expect(r.zielNeu[neu(p)]).toBe(ziel[p]);
  });
});

describe('Doppel-Schutz', () => {
  it('eine Wurzel ohne Teilbaum, die schon im Ziel steht, wird nicht eingesetzt', () => {
    const r = lauf('# A\n- [ ] täglich\n- [ ] neu\n', '# a\n  - [ ] täglich\n');
    expect(r.anzahl).toBe(2);
    expect(r.eingesetzt).toBe(1);
    expect(r.zielNeu).toBe('# a\n  - [ ] täglich\n- [ ] neu\n');
    expect(r.quelleNeu).toBe('# A\n- [»] täglich\n- [»] neu\n');
  });

  it('eine Wurzel mit Teilbaum wird immer eingesetzt, kein Unterpunkt geht verloren', () => {
    const r = lauf('# A\n- [ ] täglich\n  - [ ] unter\n', '# A\n- [ ] täglich\n');
    expect(r.eingesetzt).toBe(1);
    expect(r.zielNeu).toBe('# A\n- [ ] täglich\n- [ ] täglich\n  - [ ] unter\n');
  });

  it('nur unter der gleichnamigen Überschrift; ohne Überschrift im Teil vor der ersten', () => {
    const r = lauf('# B\n- [ ] gleich\n', '# A\n- [ ] gleich\n');
    expect(r.eingesetzt).toBe(1);
    const r2 = lauf('- [ ] gleich\n', '- [ ] gleich\n# A\n');
    expect(r2.eingesetzt).toBe(0);
    expect(r2.zielNeu).toBe('- [ ] gleich\n# A\n');
    expect(r2.quelleNeu).toBe('- [»] gleich\n');
  });

  it('zwei gleichlautende Wurzeln unter verschiedenen Überschriften wandern beide', () => {
    const q = '# A\n- [ ] gleich\n# B\n- [ ] gleich\n';
    expect(lauf(q, '').zielNeu).toBe('# A\n\n- [ ] gleich\n\n# B\n\n- [ ] gleich\n');
    const r = lauf(q, '# A\n- [ ] gleich\n');
    expect(r.eingesetzt).toBe(1);
    expect(r.zielNeu).toBe('# A\n- [ ] gleich\n\n# B\n\n- [ ] gleich\n');
  });
});

describe('Zeilenenden, Byte-Order-Marke, Text-Ende', () => {
  it('CRLF in der Quelle, LF im Ziel', () => {
    const r = lauf('# A\r\n- [ ] a\r\n', '# A\n');
    expect(r.zielNeu).toBe('# A\n\n- [ ] a\n');
    expect(r.quelleNeu).toBe('# A\r\n- [»] a\r\n');
  });

  it('LF in der Quelle, CRLF im Ziel', () => {
    const r = lauf('# A\n- [ ] a\n  - [x] b\n', '# A\r\nx\r\n');
    expect(r.zielNeu).toBe('# A\r\nx\r\n\r\n- [ ] a\r\n  - [x] b\r\n');
    expect(r.quelleNeu).toBe('# A\n- [»] a\n  - [»] b\n');
  });

  it('die Byte-Order-Marke beider Texte bleibt, die Stelle zählt sie mit', () => {
    // Byte-Order-Marke in Escape-Form, kein unsichtbares Literal im Quelltext.
    const BOM = String.fromCharCode(0xfeff);
    const r = lauf(BOM + '- [ ] a\n', BOM + '# T\n');
    expect(r.zielNeu).toBe(BOM + '# T\n\n- [ ] a\n');
    expect(r.einfuegungen).toEqual([{ offset: 5, laenge: 9 }]);
    expect(r.quelleNeu).toBe(BOM + '- [»] a\n');
  });

  it('ein fehlendes Zeilenende am Text-Ende bleibt fehlend', () => {
    expect(lauf('- [ ] a\n', '# A\n- [ ] x').zielNeu).toBe('# A\n- [ ] x\n- [ ] a');
    expect(lauf('Text\n- [ ] a', '').quelleNeu).toBe('Text\n- [»] a');
    expect(lauf('Text\n- [ ] a', '', { modus: 'remove' }).quelleNeu).toBe('Text');
  });
});

describe('entfernen', () => {
  it('der Block fällt weg, von zwei Leerzeilen an der Stelle bleibt eine', () => {
    const r = lauf('# A\n\n- [ ] a\n  - [x] b\n\nText\n', '', { modus: 'remove' });
    expect(r.quelleNeu).toBe('# A\n\nText\n');
    expect(r.zielNeu).toBe('# A\n\n- [ ] a\n  - [x] b\n');
  });

  it('leere Überschriften bleiben stehen', () => {
    expect(lauf('# A\n- [ ] a\n# B\n', '', { modus: 'remove' }).quelleNeu).toBe('# A\n# B\n');
  });
});

describe('Grenzen und zweiter Lauf', () => {
  it('mehr Wurzeln als maxWurzeln liefert zu-gross', () => {
    const q = '- [ ] a\n- [ ] b\n- [ ] c\n';
    expect(lauf(q, '', { maxWurzeln: 2 })).toEqual({ ok: false, grund: 'zu-gross' });
    expect(lauf(q, '', { maxWurzeln: 3 }).ok).toBe(true);
  });

  it('ohne offene Aufgabe liefert nichts-offen', () => {
    expect(lauf('# A\n- [x] fertig\nText\n', '')).toEqual({ ok: false, grund: 'nichts-offen' });
  });

  it('ein zweiter Lauf auf den Ergebnis-Texten liefert nichts-offen', () => {
    const q = '# A\n- [ ] a\n  - [ ] b\n- [x] c\n  - [ ] d\n';
    for (const modus of ['mark', 'remove']) {
      const r = lauf(q, '# A\n', { modus });
      expect(lauf(r.quelleNeu, r.zielNeu, { modus })).toEqual({ ok: false, grund: 'nichts-offen' });
    }
  });
});

describe('Erhaltung der Aufgaben über Quelle und Ziel', () => {
  // ausgelassen: die Zeilen, die der Doppel-Schutz nicht einsetzt.
  const faelle = [
    { q: '- [ ] a\n- [x] b\n- [/] c\n', z: '' },
    { q: '# A\n- [ ] a\n  - [x] b\n    - [ ] c\n# B\n- [x] d\n  - [ ] e\n', z: '# B\n- [ ] alt\n' },
    { q: '```\n- [ ] zaun\n```\n> - [ ] zitat\n- [ ] echt\n\n  - [h] rest\n', z: 'Text\n' },
    { q: '# A\r\n1. [ ] eins\r\n2. [-] zwei\r\n\t- [ ] tief\r\n', z: '---\nx: 1\n---\n# a\n' },
    {
      q: '# A\n- [ ] täglich\n- [ ] neu\n',
      z: '# A\n- [ ] täglich\n',
      ausgelassen: ['- [ ] täglich'],
    },
    {
      q: '# A\n- [ ] gleich\n# B\n- [ ] gleich\n- [»] alt\n',
      z: '# B\n- [ ] gleich\n',
      ausgelassen: ['- [ ] gleich'],
    },
    { q: '- [ ] frei\n# A\n- [x] fertig\n  - [ ] offen\n    Notiz\n', z: '# A\n# B\n- [ ] b\n' },
  ];

  for (const modus of ['mark', 'remove']) {
    it(`keine Aufgabe geht verloren, keine verdoppelt sich (${modus})`, () => {
      for (const f of faelle) {
        const vorher = [...aufgaben(f.q), ...aufgaben(f.z)].sort();
        const r = lauf(f.q, f.z, { modus });
        expect(r.ok).toBe(true);
        const nachher = [
          ...aufgaben(r.quelleNeu),
          ...aufgaben(r.zielNeu),
          ...(f.ausgelassen || []),
        ];
        expect(nachher.sort()).toEqual(vorher);
      }
    });
  }
});
