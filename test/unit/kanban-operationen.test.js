// 4T-001846 (Epic 3E-000110): Unit-Tests der Text-Operationen der Tafel —
// Karten und Spalten anlegen, ändern, löschen und verschieben, dazu die
// Nachführung von `list-collapse` im fremden Einstellungs-Block.
//
// Der wiederkehrende Nachweis ist AK6: Nach jeder Operation ist **alles
// Unberührte** byte-gleich. Geprüft wird das nicht mit dem Auge, sondern mit
// `unberuehrt()` — es hält die Zeilen der Quelle gegen die Zeilen des
// Ergebnisses und lässt nur die benannten Zeilen abweichen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leseTafel } from '../../src/shared/kanban/kanban-core.js';
import {
  legeKarteAn,
  aendereKarte,
  setzeKartenStatus,
  loescheKarte,
  verschiebeKarte,
  legeSpalteAn,
  benenneSpalteUm,
  loescheSpalte,
  verschiebeSpalte,
  setzeSpaltenErledigt,
  setzeSpaltenLimit,
  schreibeVorbildTerminUm,
  setzeKartenTermin,
} from '../../src/shared/kanban/kanban-operationen.js';
import { parseTaskLine } from '../../src/shared/tasks/task-markers.js';

function fixture(name) {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/kanban/${name}`, import.meta.url)),
    'utf8',
  );
}

const TAFEL = fixture('beispiel-tafel.md');
const LEER = fixture('leere-tafel.md');
const STUFE2 = fixture('tafel-stufe-2.md');

// Der Archiv-Abschnitt und der Einstellungs-Block als Text. `REST` ist beides
// zusammen und gilt für jede Operation, die keine Spalte anlegt, löscht oder
// verschiebt; `ARCHIV` ist der Teil, den auch die drei unangetastet lassen —
// bei ihnen ändert sich im Block genau ein Wert (E-B), sonst nichts.
const ARCHIV = TAFEL.slice(TAFEL.indexOf('***'), TAFEL.indexOf('%% kanban:settings'));
const REST = TAFEL.slice(TAFEL.indexOf('***'));

function zeilenOhne(text, ausnahmen) {
  return text
    .split('\n')
    .filter((z) => !ausnahmen.some((a) => z.includes(a)))
    .join('\n');
}

// Alles außer den genannten Kennzeichnungen ist byte-gleich geblieben.
function unberuehrt(vorher, nachher, ausnahmen = []) {
  return zeilenOhne(vorher, ausnahmen) === zeilenOhne(nachher, ausnahmen);
}

function listCollapse(text) {
  return JSON.parse(text.split('\n').find((z) => z.includes('"list-collapse"')))['list-collapse'];
}

describe('kanban-operationen — Karten anlegen, ändern und löschen (AK7)', () => {
  it('legt eine Karte am Ende einer Spalte an und lässt alles andere stehen', () => {
    const r = legeKarteAn(TAFEL, { spalte: 0, kartenText: 'Neue Aufgabe' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain(
      '- [ ] [[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]]\n- [ ] Neue Aufgabe',
    );
    expect(unberuehrt(TAFEL, r.text, ['Neue Aufgabe'])).toBe(true);
    expect(r.text).toContain(REST);
  });

  it('legt eine Karte an einer Position und mit einem Status an', () => {
    const r = legeKarteAn(TAFEL, { spalte: 0, position: 0, kartenText: 'Zuerst', status: 'x' });
    expect(r.ok).toBe(true);
    expect(leseTafel(r.text).spalten[0].karten.map((k) => k.text)[0]).toBe('Zuerst');
    expect(r.text).toContain('- [x] Zuerst');
  });

  it('legt die erste Karte einer leeren Spalte hinter die Leerzeile der Überschrift', () => {
    const r = legeKarteAn(TAFEL, { spalte: 2, kartenText: 'Erste hier' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('## Leer\n\n- [ ] Erste hier\n\n\n## Fertig');
  });

  it('legt die erste Karte einer Erledigt-Spalte hinter das Kennzeichen', () => {
    const r = legeKarteAn(TAFEL, { spalte: 3, kartenText: 'Fertige Aufgabe', status: 'x' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('**Fertiggestellt**\n- [x] Fertige Aufgabe');
  });

  it('ändert den Text einer Karte, ohne ihre Angaben anzutasten', () => {
    const mitTermin = TAFEL.replace(
      '- [ ] Dritte Beispiel-Aufgabe',
      '- [ ] Dritte Beispiel-Aufgabe 📅 2026-02-03 ⏫',
    );
    const r = aendereKarte(mitTermin, { spalte: 1, karte: 0, kartenText: 'Anderer Text' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('- [ ] Anderer Text 📅 2026-02-03 ⏫');
  });

  it('löscht eine Karte samt ihren Folgezeilen', () => {
    const r = loescheKarte(TAFEL, { spalte: 1, karte: 0 });
    expect(r.ok).toBe(true);
    expect(r.text).not.toContain('Dritte Beispiel-Aufgabe');
    expect(r.text).not.toContain('Ein eingerueckter Zusatz');
    expect(r.text).toContain('- [/] Vierte Beispiel-Aufgabe');
    expect(r.text).toContain(REST);
  });

  it('verschiebt eine Karte samt Folgezeilen in eine andere Spalte', () => {
    const r = verschiebeKarte(TAFEL, { spalte: 1, karte: 0, zielSpalte: 0, position: 0 });
    expect(r.ok).toBe(true);
    const model = leseTafel(r.text);
    expect(model.spalten[0].karten.map((k) => k.text)[0]).toBe('Dritte Beispiel-Aufgabe');
    expect(model.spalten[0].karten[0].folgeZeilen.length).toBe(2);
    expect(model.spalten[1].karten.length).toBe(1);
    // Umgehängt, nicht neu geschrieben: dieselben Zeilen, andere Stelle.
    expect(r.text.split('\n').sort().join('\n')).toBe(TAFEL.split('\n').sort().join('\n'));
  });

  it('verschiebt eine Karte innerhalb ihrer Spalte', () => {
    const r = verschiebeKarte(TAFEL, { spalte: 0, karte: 1, zielSpalte: 0, position: 0 });
    expect(r.ok).toBe(true);
    expect(leseTafel(r.text).spalten[0].karten.map((k) => k.text)).toEqual([
      '[[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]]',
      '[[N1 🔄 2026-01-05 Erste Beispiel-Notiz]]',
    ]);
    expect(r.text).toContain(REST);
  });
});

describe('kanban-operationen — Statuswechsel mit Erledigt-Datum', () => {
  it('setzt Zeichen und Datum, ohne das Zeichen im Wiki-Verweis anzutasten', () => {
    // Pflicht-Testfall: Die Karte trägt ein Erledigt-Zeichen samt Datum
    // INNERHALB eines Verweises. Der Statuswechsel setzt ein ZWEITES Datum ans
    // Zeilenende, und der Verweis bleibt unberührt.
    const r = setzeKartenStatus(TAFEL, {
      spalte: 0,
      karte: 1,
      status: 'x',
      erledigtDatum: { date: '2026-02-14' },
    });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('- [x] [[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]] ✅ 2026-02-14');
    const karte = leseTafel(r.text).spalten[0].karten[1];
    expect(karte.aufgabe.done.date).toBe('2026-02-14');
    expect(karte.text).toBe('[[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]]');
    expect(unberuehrt(TAFEL, r.text, ['N2 ✅'])).toBe(true);
  });

  it('nimmt das Erledigt-Datum beim Zurückschalten wieder heraus', () => {
    const mit = setzeKartenStatus(TAFEL, {
      spalte: 0,
      karte: 1,
      status: 'x',
      erledigtDatum: { date: '2026-02-14' },
    }).text;
    const r = setzeKartenStatus(mit, { spalte: 0, karte: 1, status: ' ', erledigtDatum: null });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(TAFEL);
  });

  it('lässt das Datum unberührt, wenn keines angegeben ist', () => {
    const r = setzeKartenStatus(TAFEL, { spalte: 1, karte: 0, status: 'x' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('- [x] Dritte Beispiel-Aufgabe\n');
    expect(unberuehrt(TAFEL, r.text, ['Dritte Beispiel-Aufgabe'])).toBe(true);
  });
});

describe('kanban-operationen — Spalten anlegen, umbenennen, löschen, verschieben (AK7)', () => {
  it('legt eine Spalte in der Form des Vorbilds am Ende an', () => {
    const r = legeSpalteAn(TAFEL, { titel: 'Neue Spalte' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('**Fertiggestellt**\n\n\n## Neue Spalte\n\n\n\n***');
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual([
      'Planung',
      'Umsetzung',
      'Leer',
      'Fertig',
      'Neue Spalte',
    ]);
  });

  it('legt eine Spalte an einer Position mit Erledigt-Kennzeichen an', () => {
    const r = legeSpalteAn(TAFEL, { position: 0, titel: 'Zuerst', erledigtWortlaut: 'Erledigt' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('---\n\n## Zuerst\n\n**Erledigt**\n\n\n## Planung');
    expect(leseTafel(r.text).spalten[0].erledigtWortlaut).toBe('Erledigt');
  });

  it('legt die erste Spalte einer Tafel nur aus dem Kopf an', () => {
    const r = legeSpalteAn(LEER, { titel: 'Planung' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(LEER + '## Planung\n\n\n\n');
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual(['Planung']);
  });

  // Nachbesserung in 4T-001851: Der Einfüge-Griff für das Dateiende
  // (`endeEinfuegeIndex`) galt zunächst nur ab der ersten vorhandenen Spalte.
  // An einer Tafel **nur aus dem Kopf** (F3), deren Kopf unmittelbar bis ans
  // Dateiende reicht, entstand dadurch in einer CRLF-Quelle ein nackter LF
  // hinter dem Kopf, und das Dokument verlor seinen Schluss-Umbruch. Beide
  // Zeilenenden-Konventionen sind Pflicht-Fälle, weil sie **verschiedene**
  // Seiten desselben Fehlers zeigen: die CRLF-Quelle den falschen Umbruch und
  // den verlorenen Schluss-Umbruch, die LF-Quelle die fehlende Leerzeile vor
  // der Überschrift.
  const NUR_KOPF_LF = '---\nkanban-plugin: board\n---\n';
  const NUR_KOPF_CRLF = '---\r\nkanban-plugin: board\r\n---\r\n';

  it('legt an einer Tafel nur mit Kopf (LF) mit Leerzeile und Schluss-Umbruch an', () => {
    const r = legeSpalteAn(NUR_KOPF_LF, { titel: 'Planung' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(NUR_KOPF_LF + '\n## Planung\n\n\n\n');
    expect(r.text.endsWith('\n')).toBe(true);
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual(['Planung']);
  });

  it('legt an einer Tafel nur mit Kopf (CRLF) ohne nackten LF an', () => {
    const r = legeSpalteAn(NUR_KOPF_CRLF, { titel: 'Planung' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(NUR_KOPF_CRLF + '\r\n## Planung\r\n\r\n\r\n\r\n');
    // Jede Zeile bis auf den Rest hinter dem Schluss-Umbruch trägt ihr CR, und
    // der Schluss-Umbruch steht noch.
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
    expect(r.text.endsWith('\r\n')).toBe(true);
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual(['Planung']);
  });

  it('benennt eine Spalte um und lässt Einzug, Rauten und Abstand stehen', () => {
    const r = benenneSpalteUm(TAFEL, { spalte: 1, titel: 'In Arbeit' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('## In Arbeit\n');
    expect(unberuehrt(TAFEL, r.text, ['## Umsetzung', '## In Arbeit'])).toBe(true);
    expect(r.text).toContain(REST);
  });

  it('löscht eine Spalte samt ihren Karten', () => {
    const r = loescheSpalte(TAFEL, { spalte: 1 });
    expect(r.ok).toBe(true);
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual(['Planung', 'Leer', 'Fertig']);
    expect(r.text).not.toContain('Vierte Beispiel-Aufgabe');
    expect(r.text).toContain(ARCHIV);
  });

  it('verschiebt eine Spalte samt ihren Karten', () => {
    const r = verschiebeSpalte(TAFEL, { spalte: 0, position: 3 });
    expect(r.ok).toBe(true);
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual([
      'Umsetzung',
      'Leer',
      'Planung',
      'Fertig',
    ]);
    expect(r.text).toContain(ARCHIV);
    // Umgehängt, nicht neu geschrieben: dieselbe Zeilen-Menge, andere Folge.
    // Die eine Ausnahme ist der nachgeführte Wert im fremden Block (E-B).
    const ohneWert = (t) => zeilenOhne(t, ['"list-collapse"']).split('\n').sort().join('\n');
    expect(ohneWert(r.text)).toBe(ohneWert(TAFEL));
  });
});

describe('kanban-operationen — Erledigt-Einstellung einer Spalte', () => {
  it('schreibt den Wortlaut einer vorhandenen Erledigt-Spalte derselben Tafel', () => {
    // E-A: Der Kern kennt keine Sprache. Was die Tafel schon führt, hat Vorrang
    // vor der Angabe des Aufrufers — das Vorbild liest genau dieses Wort zurück.
    const r = setzeSpaltenErledigt(TAFEL, { spalte: 2, erledigt: true, wortlaut: 'Done' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('## Leer\n\n**Fertiggestellt**\n');
    expect(r.text).not.toContain('**Done**');
    expect(unberuehrt(TAFEL, r.text, ['**Fertiggestellt**'])).toBe(true);
  });

  it('nimmt den Wortlaut des Aufrufers, wenn die Tafel keinen führt', () => {
    const ohne = TAFEL.replace('**Fertiggestellt**\n', '');
    const r = setzeSpaltenErledigt(ohne, { spalte: 2, erledigt: true, wortlaut: 'Terminé' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('## Leer\n\n**Terminé**\n');
  });

  it('meldet einen Befund, wenn weder Tafel noch Aufrufer einen Wortlaut hat', () => {
    const ohne = TAFEL.replace('**Fertiggestellt**\n', '');
    const r = setzeSpaltenErledigt(ohne, { spalte: 2, erledigt: true });
    expect(r.ok).toBe(false);
    expect(r.befund.code).toBe('kennzeichenWortlautFehlt');
  });

  it('nimmt das Kennzeichen wieder heraus und lässt sonst alles stehen', () => {
    const r = setzeSpaltenErledigt(TAFEL, { spalte: 3, erledigt: false });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(TAFEL.replace('**Fertiggestellt**\n', ''));
  });

  it('lässt eine Tafel unverändert, wenn die Einstellung schon stimmt', () => {
    expect(setzeSpaltenErledigt(TAFEL, { spalte: 3, erledigt: true }).text).toBe(TAFEL);
    expect(setzeSpaltenErledigt(TAFEL, { spalte: 0, erledigt: false }).text).toBe(TAFEL);
  });
});

describe('kanban-operationen — Nachführung von list-collapse (E-B)', () => {
  it('setzt beim Anlegen einer Spalte einen nicht eingeklappten Eintrag ein', () => {
    expect(listCollapse(legeSpalteAn(TAFEL, { position: 0, titel: 'X' }).text)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(listCollapse(legeSpalteAn(TAFEL, { titel: 'X' }).text)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('entfernt beim Löschen einer Spalte genau ihren Eintrag', () => {
    expect(listCollapse(loescheSpalte(TAFEL, { spalte: 1 }).text)).toEqual([false, false, false]);
  });

  it('ordnet beim Verschieben einer Spalte die Einträge mit um', () => {
    expect(listCollapse(verschiebeSpalte(TAFEL, { spalte: 1, position: 0 }).text)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(listCollapse(verschiebeSpalte(TAFEL, { spalte: 0, position: 4 }).text)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('lässt den übrigen Block byte-gleich und schreibt kein JSON neu', () => {
    const r = legeSpalteAn(TAFEL, { titel: 'X' });
    const zeile = r.text.split('\n').find((z) => z.includes('"list-collapse"'));
    expect(zeile).toBe(
      '{"kanban-plugin":"list","list-collapse":[false,true,false,false,false],' +
        '"show-checkboxes":false,"new-note-folder":"Beispiel/Ablage",' +
        '"full-list-lane-width":true,"hide-card-count":false}',
    );
    expect(r.text).toContain('%% kanban:settings\n```\n');
    expect(r.text.endsWith('\n```\n%%')).toBe(true);
  });

  it('lässt eine Karten-Operation den Block unangetastet', () => {
    for (const r of [
      legeKarteAn(TAFEL, { spalte: 0, kartenText: 'X' }),
      loescheKarte(TAFEL, { spalte: 0, karte: 0 }),
      verschiebeKarte(TAFEL, { spalte: 0, karte: 0, zielSpalte: 1 }),
      benenneSpalteUm(TAFEL, { spalte: 0, titel: 'X' }),
    ]) {
      expect(r.ok).toBe(true);
      expect(r.text).toContain(REST);
    }
  });

  describe('die vier Unterlassungs-Lagen', () => {
    const ohneBlock = TAFEL.slice(0, TAFEL.indexOf('%% kanban:settings'));
    const ohneSchluessel = TAFEL.replace('"list-collapse":[false,true,false,false],', '');
    const falscheLaenge = TAFEL.replace(
      '"list-collapse":[false,true,false,false]',
      '"list-collapse":[false,true]',
    );
    const kaputtesJson = TAFEL.replace('"show-checkboxes":false', '"show-checkboxes":');

    it('lässt eine Tafel ohne Einstellungs-Block unberührt und legt keinen an', () => {
      const r = legeSpalteAn(ohneBlock, { titel: 'X' });
      expect(r.ok).toBe(true);
      expect(r.text).not.toContain('kanban:settings');
      expect(r.text).not.toContain('list-collapse');
    });

    it('lässt einen Block ohne den Schlüssel unberührt', () => {
      const r = legeSpalteAn(ohneSchluessel, { titel: 'X' });
      expect(r.ok).toBe(true);
      expect(r.text).toContain('{"kanban-plugin":"list","show-checkboxes":false');
      expect(r.text).not.toContain('list-collapse');
    });

    it('lässt eine Liste unberührt, deren Länge schon vorher nicht passt', () => {
      const r = loescheSpalte(falscheLaenge, { spalte: 1 });
      expect(r.ok).toBe(true);
      expect(listCollapse(r.text)).toEqual([false, true]);
    });

    it('lässt eine nicht lesbare JSON-Zeile unberührt', () => {
      const r = legeSpalteAn(kaputtesJson, { titel: 'X' });
      expect(r.ok).toBe(true);
      expect(r.text).toContain('"list-collapse":[false,true,false,false]');
      expect(r.text).toContain('"show-checkboxes":,');
    });
  });
});

describe('kanban-operationen — Befunde statt Ausnahmen (AK8)', () => {
  const faelle = [
    ['kein Tafel-Dokument', () => legeKarteAn('# Nur Text\n', { spalte: 0, kartenText: 'X' })],
    ['unbekannte Spalte', () => legeKarteAn(TAFEL, { spalte: 9, kartenText: 'X' })],
    ['unbekannte Karte', () => loescheKarte(TAFEL, { spalte: 0, karte: 9 })],
    ['leerer Karten-Text', () => legeKarteAn(TAFEL, { spalte: 0, kartenText: '   ' })],
    ['mehrzeiliger Karten-Text', () => legeKarteAn(TAFEL, { spalte: 0, kartenText: 'a\nb' })],
    ['leerer Titel', () => legeSpalteAn(TAFEL, { titel: '' })],
    ['unmögliche Position', () => legeKarteAn(TAFEL, { spalte: 0, position: 9, kartenText: 'X' })],
    ['leeres Status-Zeichen', () => setzeKartenStatus(TAFEL, { spalte: 0, karte: 0, status: '' })],
    [
      'unbrauchbares Datum',
      () =>
        setzeKartenStatus(TAFEL, {
          spalte: 0,
          karte: 0,
          status: 'x',
          erledigtDatum: { date: 'gestern' },
        }),
    ],
  ];
  for (const [name, lauf] of faelle) {
    it(`meldet ${name} als benannten Befund`, () => {
      const r = lauf();
      expect(r.ok).toBe(false);
      expect(typeof r.befund.code).toBe('string');
      expect(r.befund.code.length).toBeGreaterThan(3);
      expect(r.text).toBeUndefined();
    });
  }
});

describe('kanban-operationen — Byte-Treue über CRLF (AK6)', () => {
  const crlf = TAFEL.split('\n').join('\r\n');

  it('schreibt neue Zeilen in der Konvention der Quelle', () => {
    const r = legeKarteAn(crlf, { spalte: 0, kartenText: 'Neue Aufgabe' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('- [ ] Neue Aufgabe\r\n');
    expect(r.text.includes('Neue Aufgabe\n- ')).toBe(false);
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
  });

  it('legt eine Spalte mit CRLF-Zeilen an und führt list-collapse nach', () => {
    const r = legeSpalteAn(crlf, { titel: 'Neue Spalte' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('## Neue Spalte\r\n\r\n\r\n\r\n***');
    expect(listCollapse(r.text.split('\r\n').join('\n'))).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('ändert eine Karte ohne das Trenn-Artefakt in die Beschreibung zu ziehen', () => {
    const r = aendereKarte(crlf, { spalte: 1, karte: 0, kartenText: 'Anderer Text' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('- [ ] Anderer Text\r\n');
    expect(leseTafel(r.text).spalten[1].karten[0].text).toBe('Anderer Text');
  });

  // 4T-001850: Das Verschieben hängt Zeilen um und schreibt sie nicht neu; das
  // Zeilenende reist deshalb mit der Zeile. Ein Fall je Ebene, weil der
  // Zug-Weg der Tafel auf beiden aufsetzt.
  it('verschiebt eine Karte samt Folgezeilen, jede Zeile behält ihr CRLF', () => {
    const r = verschiebeKarte(crlf, { spalte: 1, karte: 0, zielSpalte: 0, position: 0 });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('- [ ] Dritte Beispiel-Aufgabe\r\n  Ein eingerueckter Zusatz');
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
    // Umgehängt, nicht neu geschrieben: dieselbe Zeilen-Menge, andere Folge.
    expect(r.text.split('\n').sort().join('\n')).toBe(crlf.split('\n').sort().join('\n'));
  });

  it('verschiebt eine Spalte samt ihren Karten über CRLF hinweg', () => {
    const r = verschiebeSpalte(crlf, { spalte: 0, position: 3 });
    expect(r.ok).toBe(true);
    expect(leseTafel(r.text).spalten.map((s) => s.titel)).toEqual([
      'Umsetzung',
      'Leer',
      'Planung',
      'Fertig',
    ]);
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
  });
});

// --- Stufe 2 (4T-001902): Limit und Vorbild-Termin ------------------------------

describe('kanban-operationen — Limit einer Spalte (4T-001902 AK5)', () => {
  const titelZeile = (text, anfang) => text.split('\n').find((z) => z.startsWith(anfang));

  it('setzt ein Limit in der Form des Vorbilds und lässt alles andere stehen', () => {
    const r = setzeSpaltenLimit(STUFE2, { spalte: 2, limit: 4 });
    expect(r.ok).toBe(true);
    expect(titelZeile(r.text, '## Später')).toBe('## Später (bald) (4)');
    expect(unberuehrt(STUFE2, r.text, ['## Später'])).toBe(true);
    expect(leseTafel(r.text).spalten[2]).toMatchObject({
      limit: 4,
      titelOhneLimit: 'Später (bald)',
    });
  });

  it('ändert ein fremdes Limit, auch eines ohne Leerzeichen vor der Klammer', () => {
    const r = setzeSpaltenLimit(STUFE2, { spalte: 1, limit: 5 });
    expect(r.ok).toBe(true);
    expect(titelZeile(r.text, '## In Arbeit')).toBe('## In Arbeit (5)');
    expect(unberuehrt(STUFE2, r.text, ['## In Arbeit'])).toBe(true);
  });

  it('entfernt ein Limit samt Leerraum und ebenso eine (0)', () => {
    expect(titelZeile(setzeSpaltenLimit(STUFE2, { spalte: 0, limit: null }).text, '## Pl')).toBe(
      '## Planung',
    );
    expect(titelZeile(setzeSpaltenLimit(STUFE2, { spalte: 3, limit: null }).text, '## Fe')).toBe(
      '## Fertig',
    );
  });

  it('lässt eine Spalte ohne Limit beim Entfernen unverändert', () => {
    expect(setzeSpaltenLimit(STUFE2, { spalte: 2, limit: null }).text).toBe(STUFE2);
  });

  it('erhält ein fremdes Limit, solange es nicht geändert wird', () => {
    const r = legeKarteAn(STUFE2, { spalte: 1, kartenText: 'Neu' });
    expect(titelZeile(r.text, '## In Arbeit')).toBe('## In Arbeit(2)');
    expect(setzeSpaltenLimit(STUFE2, { spalte: 1, limit: 2 }).ok).toBe(true);
  });

  it('erhält Präfix, Rauten und CRLF der Überschrift', () => {
    const crlf = STUFE2.replace('## Planung (3)', '  ### Planung (3)').split('\n').join('\r\n');
    const r = setzeSpaltenLimit(crlf, { spalte: 0, limit: 12 });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('\r\n  ### Planung (12)\r\n');
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
  });

  it('meldet ein ungültiges Limit als Befund und ändert nichts (Rot-Probe)', () => {
    for (const limit of [0, -1, 2.5, '3', undefined, Number.NaN]) {
      const r = setzeSpaltenLimit(STUFE2, { spalte: 0, limit });
      expect(r.ok, String(limit)).toBe(false);
      expect(r.befund.code).toBe('limitUngueltig');
    }
    expect(setzeSpaltenLimit(STUFE2, { spalte: 9, limit: 1 }).befund.code).toBe('unbekannteSpalte');
  });

  // 4T-001905 (AK6): Umbenennen erhält die Obergrenze in der Schreibweise des
  // Dokuments, auch die fremde ohne Leerzeichen vor der Klammer.
  it('benennt mit limitErhalten um und lässt die Obergrenze zeichengenau stehen', () => {
    const fremd = benenneSpalteUm(STUFE2, { spalte: 1, titel: 'Läuft', limitErhalten: true });
    expect(fremd.ok).toBe(true);
    expect(fremd.text).toBe(STUFE2.replace('## In Arbeit(2)', '## Läuft(2)'));
    const eigen = benenneSpalteUm(STUFE2, { spalte: 0, titel: 'Vorhaben', limitErhalten: true });
    expect(titelZeile(eigen.text, '## Vorhaben')).toBe('## Vorhaben (3)');
    expect(leseTafel(eigen.text).spalten[0]).toMatchObject({
      limit: 3,
      titelOhneLimit: 'Vorhaben',
    });
    // Ohne Obergrenze gibt es nichts zu erhalten; eine (0) ist Titel und wird
    // mit ihm ersetzt.
    expect(
      titelZeile(
        benenneSpalteUm(STUFE2, { spalte: 2, titel: 'X', limitErhalten: true }).text,
        '## X',
      ),
    ).toBe('## X');
    expect(
      titelZeile(
        benenneSpalteUm(STUFE2, { spalte: 3, titel: 'Y', limitErhalten: true }).text,
        '## Y',
      ),
    ).toBe('## Y');
  });

  it('ohne limitErhalten ersetzt Umbenennen den ganzen Titel wie bisher', () => {
    const r = benenneSpalteUm(STUFE2, { spalte: 0, titel: 'Planung' });
    expect(titelZeile(r.text, '## Pl')).toBe('## Planung');
  });
});

describe('kanban-operationen — Vorbild-Termin umschreiben (4T-001902 AK9, AK10)', () => {
  const zeileMit = (text, stueck) => text.split('\n').find((z) => z.includes(stueck));

  it('schreibt Datum und Uhrzeit in den Termin-Marker um', () => {
    const r = schreibeVorbildTerminUm(STUFE2, { spalte: 0, karte: 0 });
    expect(r.ok).toBe(true);
    expect(zeileMit(r.text, 'Angebot')).toBe('- [ ] Angebot prüfen #kunde 📅 2026-10-01 14:00');
    expect(unberuehrt(STUFE2, r.text, ['Angebot'])).toBe(true);
    const karte = leseTafel(r.text).spalten[0].karten[0];
    expect(karte.aufgabe.due).toMatchObject({ date: '2026-10-01', time: '14:00' });
    expect(karte.vorbildTermin).toBeNull();
  });

  it('schreibt ein Datum ohne Uhrzeit und eines am Anfang des Texts um', () => {
    const r1 = schreibeVorbildTerminUm(STUFE2, { spalte: 0, karte: 1 });
    expect(zeileMit(r1.text, 'Nur ein Tag')).toBe('- [ ] Nur ein Tag 📅 2026-10-02');
    const r2 = schreibeVorbildTerminUm(STUFE2, { spalte: 1, karte: 1 });
    expect(zeileMit(r2.text, 'Termin vorn')).toBe('- [ ] Termin vorn 📅 2026-10-08');
  });

  it('ersetzt einen vorhandenen Termin der Zeile', () => {
    const r = schreibeVorbildTerminUm(STUFE2, { spalte: 1, karte: 0 });
    expect(zeileMit(r.text, 'Laufende')).toBe('- [/] Laufende Aufgabe 📅 2026-10-06');
  });

  it('lässt den Kalender-Wert derselben Karte stehen', () => {
    const r = schreibeVorbildTerminUm(STUFE2, { spalte: 0, karte: 2 });
    expect(zeileMit(r.text, 'Termin und Kalender')).toBe(
      '- [ ] Termin und Kalender @{Termine: 2026-10-01} 📅 2026-10-01 14:00',
    );
  });

  it('trennt ein Wort hinter dem Termin nicht von dem davor', () => {
    const text = STUFE2.replace('Nur ein Tag @{2026-10-02}', 'Nur @{2026-10-02}ein Tag');
    const r = schreibeVorbildTerminUm(text, { spalte: 0, karte: 1 });
    expect(zeileMit(r.text, 'ein Tag')).toBe('- [ ] Nur ein Tag 📅 2026-10-02');
  });

  it('erhält das Zeilenende einer CRLF-Quelle', () => {
    const crlf = STUFE2.split('\n').join('\r\n');
    const r = schreibeVorbildTerminUm(crlf, { spalte: 0, karte: 0 });
    expect(r.text).toContain('- [ ] Angebot prüfen #kunde 📅 2026-10-01 14:00\r\n');
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
  });

  it('lässt einen unlesbaren Termin stehen und meldet ihn (Rot-Probe)', () => {
    const faelle = [
      [3, 'terminUnlesbar', '2026-13-40'],
      [4, 'terminUnlesbar', '01.10.2026'],
      [5, 'uhrzeitOhneDatum', '09:30'],
      [6, 'terminUnlesbar', '25:00'],
    ];
    for (const [karte, code, detail] of faelle) {
      const r = schreibeVorbildTerminUm(STUFE2, { spalte: 0, karte });
      expect(r.ok).toBe(false);
      expect(r.befund).toEqual({ code, detail });
      expect(r.text).toBeUndefined();
    }
  });

  it('meldet eine Karte ohne Vorbild-Termin, auch mit Verknüpfungs-Form', () => {
    for (const [spalte, karte] of [
      [0, 7],
      [2, 0],
    ]) {
      expect(schreibeVorbildTerminUm(STUFE2, { spalte, karte }).befund.code).toBe(
        'keinVorbildTermin',
      );
    }
  });
});

describe('kanban-operationen — Termin der Karte setzen (4T-001903 AK2, AK3, AK5, AK8)', () => {
  const zeileMit = (text, stueck) => text.split('\n').find((z) => z.includes(stueck));
  const TERMIN_TAFEL = [
    '---',
    'kanban-plugin: board',
    '---',
    '',
    '## Offen',
    '',
    '- [ ] Ohne Termin',
    '- [ ] Mit Termin 📅 2026-10-01 ⏫ 🔁 every week',
    '- [ ] Varianten-Symbol 📆2026-10-01',
    '',
  ].join('\n');

  it('AK3: setzt einen Termin mit Uhrzeit, den der Aufgaben-Kern als Fälligkeit liest', () => {
    const r = setzeKartenTermin(TERMIN_TAFEL, {
      spalte: 0,
      karte: 0,
      termin: { date: '2026-10-05', time: '09:30' },
    });
    expect(r.ok).toBe(true);
    expect(zeileMit(r.text, 'Ohne')).toBe('- [ ] Ohne Termin 📅 2026-10-05 09:30');
    expect(parseTaskLine(zeileMit(r.text, 'Ohne')).due).toEqual({
      date: '2026-10-05',
      time: '09:30',
      invalid: false,
    });
    expect(unberuehrt(TERMIN_TAFEL, r.text, ['Ohne'])).toBe(true);
  });

  it('ersetzt einen vorhandenen Termin an Ort und Stelle; die übrigen Angaben bleiben', () => {
    const r = setzeKartenTermin(TERMIN_TAFEL, {
      spalte: 0,
      karte: 1,
      termin: { date: '2026-12-24', time: null },
    });
    expect(zeileMit(r.text, 'Mit Termin')).toBe('- [ ] Mit Termin 📅 2026-12-24 ⏫ 🔁 every week');
    // Eine gelesene Symbol-Variante bleibt die des Dokuments.
    const v = setzeKartenTermin(TERMIN_TAFEL, {
      spalte: 0,
      karte: 2,
      termin: { date: '2026-10-02' },
    });
    expect(zeileMit(v.text, 'Varianten')).toBe('- [ ] Varianten-Symbol 📆 2026-10-02');
  });

  it('entfernt den Termin; die übrigen Angaben bleiben byte-gleich', () => {
    const r = setzeKartenTermin(TERMIN_TAFEL, { spalte: 0, karte: 1, termin: null });
    expect(zeileMit(r.text, 'Mit Termin')).toBe('- [ ] Mit Termin ⏫ 🔁 every week');
    // An einer Karte ohne Termin ist das Entfernen ohne Wirkung.
    const leer = setzeKartenTermin(TERMIN_TAFEL, { spalte: 0, karte: 0, termin: null });
    expect(leer.text).toBe(TERMIN_TAFEL);
  });

  it('AK5: ein lesbarer Vorbild-Termin geht beim Setzen auf, beim Entfernen mit', () => {
    const gesetzt = setzeKartenTermin(STUFE2, {
      spalte: 0,
      karte: 0,
      termin: { date: '2026-10-09', time: null },
    });
    expect(zeileMit(gesetzt.text, 'Angebot')).toBe('- [ ] Angebot prüfen #kunde 📅 2026-10-09');
    expect(unberuehrt(STUFE2, gesetzt.text, ['Angebot'])).toBe(true);
    const entfernt = setzeKartenTermin(STUFE2, { spalte: 1, karte: 0, termin: null });
    expect(zeileMit(entfernt.text, 'Laufende')).toBe('- [/] Laufende Aufgabe');
  });

  it('AK8: ein unlesbarer Vorbild-Termin bleibt als Text stehen', () => {
    const r = setzeKartenTermin(STUFE2, {
      spalte: 0,
      karte: 3,
      termin: { date: '2026-10-09', time: null },
    });
    expect(zeileMit(r.text, 'Ungültiges Datum')).toBe(
      '- [ ] Ungültiges Datum @{2026-13-40} 📅 2026-10-09',
    );
  });

  it('meldet ungültige Werte statt sie zu schreiben', () => {
    const faelle = [
      [{ date: '2026-02-30' }, 'ungueltigesDatum'],
      [{ date: '01.10.2026' }, 'ungueltigesDatum'],
      [{ date: '2026-10-01', time: '25:00' }, 'ungueltigeUhrzeit'],
      [{ date: '2026-10-01', time: '9:30' }, 'ungueltigeUhrzeit'],
      [undefined, 'ungueltigesDatum'],
    ];
    for (const [termin, code] of faelle) {
      const r = setzeKartenTermin(TERMIN_TAFEL, { spalte: 0, karte: 0, termin });
      expect(r.ok).toBe(false);
      expect(r.befund.code).toBe(code);
    }
    expect(setzeKartenTermin(TERMIN_TAFEL, { spalte: 0, karte: 9, termin: null }).befund.code).toBe(
      'unbekannteKarte',
    );
  });

  it('erhält das Zeilenende einer CRLF-Quelle', () => {
    const crlf = TERMIN_TAFEL.split('\n').join('\r\n');
    const r = setzeKartenTermin(crlf, { spalte: 0, karte: 0, termin: { date: '2026-10-05' } });
    expect(r.text).toContain('- [ ] Ohne Termin 📅 2026-10-05\r\n');
    expect(r.text.split('\n').every((z, i, a) => i === a.length - 1 || z.endsWith('\r'))).toBe(
      true,
    );
  });

  it('AK5: Verschieben lässt einen Vorbild-Termin byte-gleich stehen', () => {
    const r = verschiebeKarte(STUFE2, { spalte: 0, karte: 0, zielSpalte: 2 });
    expect(zeileMit(r.text, 'Angebot')).toBe('- [ ] Angebot prüfen #kunde @{2026-10-01} @@{14:00}');
  });
});
