// 4T-002159 (Epic 3E-000149): Unit-Tests des Praesentations-Format-Kerns -
// Erkennung am Kopf-Kennzeichen, Trenn-Regel samt Grenzfaellen, Steuer-
// Schluessel des Kopfs, Sprecher-Notizen je Folie, Zeilen-Nummern, CRLF,
// Befunde, Paritaet mit der Render-Pipeline und Prozess-Neutralitaet.
//
// Die Beispiel-Dateien unter test/fixtures/presentation/ sind synthetische
// Nachbauten nach der Struktur der Marp-Dokumentation (Kopf mit `marp: true`
// und Steuer-Schluesseln, Notizen als HTML-Kommentar, Steuer-Anweisung je
// Folie, Hintergrund-Bilder) und der Grenzfaelle der Trenn-Regel; ihre Inhalte
// sind erfunden.
//
// Bestands-Lesung (gelesen am 2026-10-09): Marpit teilt in
// `src/markdown/slide.js` ueber `split()` aus `src/helpers/split.js` an jeder
// `hr` der obersten Ebene und beginnt mit einer leeren Gruppe; daraus folgen
// die leeren Folien bei aufeinanderfolgenden Trennern, direkt nach dem Kopf
// und am Dokument-Ende. Nicht als Notiz zaehlt Marpit einen Kommentar, dessen
// YAML-Inhalt einen bekannten Steuer-Schluessel traegt
// (`src/markdown/directives/parse.js`), sowie drei Werkzeug-Kommentare
// (`src/markdown/comment.js`).
//
// Die Trenn-Regel entscheidet die Markdown-Instanz der Anwendung (Entscheidung
// der Sitzung vom 2026-10-09: volle CommonMark-Lesart ueber die `hr`-Tokens);
// die Tests reichen sie herein wie der Preload, ueber `lesePraesentation`
// unten. Der Fall ohne Instanz steht im Block «Ohne Parser».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PRAESENTATION_KOPF_SCHLUESSEL,
  MARP_KOPF_SCHLUESSEL,
  STEUER_SCHLUESSEL,
  istPraesentationsDokument,
  lesePraesentation as lesePraesentationRoh,
} from '../../src/shared/presentation/presentation-core.js';
import { md } from '../../src/shared/markdown/markdown.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { stripPercentComments } from '../../src/shared/markdown/plugins/comments.js';
import {
  hintergrundBilderZiehen,
  hintergrundAnordnung,
} from '../../src/shared/presentation/presentation-darstellung.js';
import { themeAufloesen } from '../../src/shared/presentation/presentation-themes.js';

function fixture(name) {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/presentation/${name}`, import.meta.url)),
    'utf8',
  );
}

const MARP = fixture('marp-beispiel.md');
const GRENZ = fixture('grenzfaelle.md');
const OHNE = fixture('ohne-kennzeichen.md');
// 4T-002164: zwei weitere Nachbauten nach oeffentlichen Marp-Beispielen.
const MARP_VORTRAG = fixture('marp-vortrag.md');
const MARP_HINTERGRUENDE = fixture('marp-hintergruende.md');

const KOPF = '---\npresentation: true\n---\n';

function lesePraesentation(text, optionen = {}) {
  return lesePraesentationRoh(text, { md, ...optionen });
}

// Die Trenner-Zeilen (1-basiert) eines Modells: die Zeile nach jeder Folie
// ausser der letzten.
function trennerZeilen(model) {
  return model.folien.slice(0, -1).map((f) => f.bisZeile + 1);
}

// Die Texte der Notizen einer Folie (4T-002277: Notizen tragen Text und
// Herkunft).
function texte(notizen) {
  return notizen.map((n) => n.text);
}

function folienZahl(text, optionen) {
  return lesePraesentation(text, optionen).folien.length;
}

describe('presentation-core — Schnittstelle', () => {
  it('fuehrt die Schluessel-Namen wie vereinbart', () => {
    expect(PRAESENTATION_KOPF_SCHLUESSEL).toBe('presentation');
    expect(MARP_KOPF_SCHLUESSEL).toBe('marp');
    expect(STEUER_SCHLUESSEL).toEqual(['theme', 'paginate', 'header', 'footer', 'size']);
  });
});

describe('presentation-core — Erkennung am Kopf-Kennzeichen (AK1)', () => {
  it('erkennt `presentation: true`', () => {
    expect(istPraesentationsDokument(GRENZ)).toBe(true);
    const model = lesePraesentation(GRENZ);
    expect(model.istPraesentation).toBe(true);
    expect(model.kennzeichen).toBe('presentation');
    expect(model.befunde).toEqual([]);
  });

  it('erkennt `marp: true`', () => {
    expect(istPraesentationsDokument(MARP)).toBe(true);
    expect(lesePraesentation(MARP).kennzeichen).toBe('marp');
  });

  it('bevorzugt das eigene Kennzeichen, wenn beide gesetzt sind', () => {
    const text = '---\nmarp: true\npresentation: true\n---\n# A\n';
    expect(lesePraesentation(text).kennzeichen).toBe('presentation');
  });

  it('erkennt den String «true» und `false` nicht als Kennzeichen', () => {
    expect(istPraesentationsDokument(OHNE)).toBe(false);
    const model = lesePraesentation(OHNE);
    expect(model.istPraesentation).toBe(false);
    expect(model.kennzeichen).toBeNull();
    expect(model.befunde.map((b) => b.code)).toEqual(['keinKennzeichen']);
    // Der Kopf bleibt als Rohdaten lesbar, gedeutet wird er nicht.
    expect(model.kopf.roh.title).toBe('Gewöhnliches Dokument');
    expect(model.kopf.size).toBe('16:9');
  });

  it('erkennt ein Dokument ohne Kopf nicht und meldet es', () => {
    const model = lesePraesentation('# Titel\n\n---\n\nText\n');
    expect(istPraesentationsDokument('# Titel\n\npresentation: true\n')).toBe(false);
    expect(model.istPraesentation).toBe(false);
    expect(model.befunde.map((b) => b.code)).toEqual(['keinKopf']);
  });

  it('meldet einen unlesbaren Kopf als Befund statt abzustuerzen (AK6)', () => {
    const text = '---\npresentation: [unbalanciert\n---\n\n# A\n';
    expect(istPraesentationsDokument(text)).toBe(false);
    const model = lesePraesentation(text);
    expect(model.istPraesentation).toBe(false);
    expect(model.befunde.map((b) => b.code)).toEqual(['kopfUnlesbar']);
    // Die Zerlegung beginnt trotzdem hinter dem Kopf.
    expect(model.folien[0].vonZeile).toBe(4);
  });

  it('nimmt leere Zeichenkette, null und undefined ohne Absturz entgegen', () => {
    for (const eingabe of ['', null, undefined]) {
      expect(istPraesentationsDokument(eingabe)).toBe(false);
      const model = lesePraesentation(eingabe);
      expect(model.istPraesentation).toBe(false);
      expect(model.folien.length).toBe(1);
      expect(model.folien[0].quelltext).toBe('');
    }
  });
});

describe('presentation-core — Trenn-Regel (AK2, AK3)', () => {
  it('trennt an `---` nach einer Leerzeile', () => {
    const model = lesePraesentation(`${KOPF}# A\n\n---\n\n# B\n`);
    expect(model.folien.map((f) => f.quelltext)).toEqual(['# A\n', '\n# B\n']);
    expect(trennerZeilen(model)).toEqual([6]);
  });

  it('trennt nicht an einer Setext-Unterstreichung direkt unter Text', () => {
    const model = lesePraesentation(`${KOPF}Titel\n---\n\nText\n`);
    expect(model.folien.length).toBe(1);
    expect(model.folien[0].quelltext).toContain('Titel\n---');
  });

  it('trennt unmittelbar nach dem Kopf und ergibt eine leere erste Folie', () => {
    const model = lesePraesentation(`${KOPF}---\n# A\n`);
    expect(model.folien.length).toBe(2);
    expect(model.folien[0]).toMatchObject({ vonZeile: 4, bisZeile: 3, quelltext: '' });
    expect(model.folien[1]).toMatchObject({ vonZeile: 5, quelltext: '# A\n' });
  });

  it('trennt am Dokument-Anfang eines Dokuments ohne Kopf', () => {
    const model = lesePraesentation('---\n# A\n');
    expect(trennerZeilen(model)).toEqual([1]);
    expect(model.folien[0].quelltext).toBe('');
  });

  it('erzeugt aus zwei Trennern hintereinander eine leere Folie', () => {
    const model = lesePraesentation(`${KOPF}# A\n\n---\n\n---\n\n# B\n`);
    expect(model.folien.map((f) => f.quelltext)).toEqual(['# A\n', '', '\n# B\n']);
  });

  it('ergibt aus einem Trenner am Dokument-Ende eine leere letzte Folie', () => {
    const model = lesePraesentation(`${KOPF}# A\n\n---\n`);
    expect(model.folien.length).toBe(2);
    expect(model.folien[1].quelltext).toBe('');
  });

  it('ergibt aus einem Dokument ohne Trenner genau eine Folie', () => {
    expect(folienZahl(`${KOPF}# A\n\nText\n`)).toBe(1);
  });

  it('ergibt aus einer Praesentation nur aus dem Kopf eine leere Folie', () => {
    for (const text of [KOPF, KOPF.trimEnd()]) {
      const model = lesePraesentation(text);
      expect(model.istPraesentation).toBe(true);
      expect(model.folien.length).toBe(1);
      expect(model.folien[0].quelltext).toBe('');
      expect(model.befunde).toEqual([]);
    }
  });

  it('trennt nicht innerhalb eines Code-Zauns', () => {
    expect(folienZahl(`${KOPF}\`\`\`\n\n---\n\`\`\`\n`)).toBe(1);
    expect(folienZahl(`${KOPF}~~~~\n\n---\n~~~~\n`)).toBe(1);
    // Ein kuerzerer Schliesser schliesst nicht (Regel aus fence-level.js).
    expect(folienZahl(`${KOPF}\`\`\`\`\n\`\`\`\n\n---\n\`\`\`\`\n`)).toBe(1);
  });

  it('trennt nicht innerhalb eines `%%`-Kommentars', () => {
    expect(folienZahl(`${KOPF}%% Kommentar\n\n---\n\nEnde %%\n`)).toBe(1);
    // Ein offener Kommentar reicht bis zum Ende.
    expect(folienZahl(`${KOPF}%% offen\n\n---\n\n# B\n`)).toBe(1);
  });

  it('trennt bei abgeschalteter Kommentar-Erweiterung auch im `%%`-Bereich', () => {
    const text = `${KOPF}%% Kommentar\n\n---\n\nEnde %%\n`;
    expect(folienZahl(text, { kommentareAktiv: false })).toBe(2);
  });

  it('trennt nicht innerhalb eines mehrzeiligen HTML-Kommentars', () => {
    expect(folienZahl(`${KOPF}<!--\nNotiz\n\n---\n\n-->\n\n# A\n`)).toBe(1);
    // Ein offener Kommentar-Block reicht wie bei Marpit bis zum Ende.
    expect(folienZahl(`${KOPF}<!-- offen\n\n---\n\n# B\n`)).toBe(1);
  });

  it('trennt nie an `***` und `___`', () => {
    expect(folienZahl(`${KOPF}# A\n\n***\n\n# B\n\n___\n\n# C\n`)).toBe(1);
    expect(folienZahl(`${KOPF}# A\n\n* * *\n\n_ _ _\n`)).toBe(1);
  });

  it('trennt an der CommonMark-Form mit Leerraum und mehr Bindestrichen', () => {
    for (const linie of ['- - -', '-----', ' -  -  - ', '---\t']) {
      expect(folienZahl(`${KOPF}# A\n\n${linie}\n\n# B\n`), linie).toBe(2);
    }
    // Zu wenige Bindestriche oder fremde Zeichen sind keine Linie.
    for (const linie of ['--', '--- x', '-- -a']) {
      expect(folienZahl(`${KOPF}# A\n\n${linie}\n\n# B\n`), linie).toBe(1);
    }
  });

  it('trennt bei drei Leerzeichen Einrueckung, bei vier nicht', () => {
    expect(folienZahl(`${KOPF}# A\n\n   ---\n\n# B\n`)).toBe(2);
    expect(folienZahl(`${KOPF}# A\n\n    ---\n\n# B\n`)).toBe(1);
    expect(folienZahl(`${KOPF}# A\n\n\t---\n\n# B\n`)).toBe(1);
  });

  it('trennt direkt unter einer Ueberschrift, nach einem Zaun-Ende und nach einem Listenpunkt', () => {
    // Volle CommonMark-Lesart (Entscheidung vom 2026-10-09): Dort ist `---`
    // ohne Leerzeile davor eine thematische Linie, wie bei Marp.
    const ueberschrift = lesePraesentation(`${KOPF}# A\n---\n# B\n`);
    expect(trennerZeilen(ueberschrift)).toEqual([5]);
    expect(ueberschrift.folien.map((f) => f.quelltext)).toEqual(['# A', '# B\n']);
    expect(trennerZeilen(lesePraesentation(`${KOPF}\`\`\`\nx\n\`\`\`\n---\n# B\n`))).toEqual([7]);
    expect(trennerZeilen(lesePraesentation(`${KOPF}- Punkt\n---\n# B\n`))).toEqual([5]);
  });

  it('trennt nicht eingerueckt im Listenpunkt und nicht im Zitat', () => {
    // Eingerueckt gehoert die Linie zum Listenpunkt (tiefere Ebene).
    expect(folienZahl(`${KOPF}- Punkt\n\n  ---\n\n# B\n`)).toBe(1);
    // Im Zitat ist `---` unter Text eine Setext-Unterstreichung, allein eine
    // Linie innerhalb des Zitats; beides trennt nicht.
    expect(folienZahl(`${KOPF}> Zitat\n> ---\n`)).toBe(1);
    expect(folienZahl(`${KOPF}> ---\n`)).toBe(1);
  });

  it('liest eine Zeile nur aus Kommentaren vor der Linie wie die Pipeline als leer', () => {
    expect(folienZahl(`${KOPF}Text\n<!-- Notiz -->\n---\n# B\n`)).toBe(2);
    expect(folienZahl(`${KOPF}Text\n%% Notiz %%\n---\n# B\n`)).toBe(2);
    // Text neben dem Kommentar bleibt Text: Setext-Unterstreichung.
    expect(folienZahl(`${KOPF}Text <!-- Notiz -->\n---\n`)).toBe(1);
  });

  it('trennt unter einem Steuer-Kommentar direkt ueber der Linie wie Marp', () => {
    const model = lesePraesentation(`${KOPF}# A\n\n<!-- paginate: false -->\n---\n# B\n`);
    expect(trennerZeilen(model)).toEqual([7]);
    // Folie eins endet vor der Linie und traegt den Steuer-Kommentar als Rohdaten.
    expect(model.folien[0]).toMatchObject({ vonZeile: 4, bisZeile: 6, quelltext: '# A\n\n' });
    expect(model.folien[0].steuerKommentare).toEqual(['paginate: false']);
    expect(model.folien[1].quelltext).toBe('# B\n');
  });

  it('liest `%%` bei abgeschalteter Erweiterung als Text in der CommonMark-Lesart', () => {
    // Unter einer Text-Zeile aus `%%` ist `---` dann eine Unterstreichung.
    expect(folienZahl(`${KOPF}%% Text\n---\n%%\n`, { kommentareAktiv: false })).toBe(1);
    expect(folienZahl(`${KOPF}%% Text\n---\n%%\n`)).toBe(1);
  });

  it('zerlegt die Grenzfall-Beispieldatei in vier Folien', () => {
    const model = lesePraesentation(GRENZ);
    expect(model.folien.length).toBe(4);
    expect(model.folien.map((f) => f.quelltext.match(/^#+ .*$/m)[0])).toEqual([
      '# Erste Folie',
      '## Zweite Folie',
      '## Dritte Folie',
      '## Vierte Folie',
    ]);
    // `***` und `___` stehen als Linien auf der ersten Folie.
    expect(model.folien[0].quelltext).toContain('\n***\n');
    expect(model.folien[0].quelltext).toContain('\n___\n');
  });
});

describe('presentation-core — Zeilen-Nummern und CRLF', () => {
  it('fuehrt 1-basierte Zeilen im Gesamt-Dokument samt Leerzeilen der Folie', () => {
    const text = `${KOPF}\n# A\n\n---\n\n# B\n`;
    const model = lesePraesentation(text);
    expect(model.folien.map((f) => [f.vonZeile, f.bisZeile])).toEqual([
      [4, 6],
      [8, 10],
    ]);
    const zeilen = text.split('\n');
    for (const folie of model.folien) {
      expect(folie.quelltext).toBe(zeilen.slice(folie.vonZeile - 1, folie.bisZeile).join('\n'));
    }
  });

  it('liefert fuer eine CRLF-Datei dieselben Folien und Zeilen', () => {
    const lf = lesePraesentation(GRENZ);
    const crlf = lesePraesentation(GRENZ.replace(/\n/g, '\r\n'));
    expect(crlf.zeilenende).toBe('\r\n');
    expect(lf.zeilenende).toBe('\n');
    expect(crlf.folien).toEqual(lf.folien);
    const marpCrlf = lesePraesentation(MARP.replace(/\n/g, '\r\n'));
    expect(marpCrlf.folien).toEqual(lesePraesentation(MARP).folien);
    expect(marpCrlf.kopf).toEqual(lesePraesentation(MARP).kopf);
  });
});

describe('presentation-core — Steuer-Schluessel im Kopf (AK4, AK6)', () => {
  it('setzt ohne Angaben die Vorgaben', () => {
    expect(lesePraesentation(KOPF).kopf).toEqual({
      theme: null,
      paginate: false,
      header: null,
      footer: null,
      size: '16:9',
      roh: { presentation: true },
    });
  });

  it('liest die Steuer-Schluessel der Marp-Beispieldatei', () => {
    const { kopf, befunde } = lesePraesentation(MARP);
    expect(befunde).toEqual([]);
    expect(kopf).toMatchObject({
      theme: 'gaia',
      paginate: true,
      header: 'Beispiel-Vortrag',
      footer: 'Erfundene Firma',
      size: '4:3',
    });
    // Ein Schluessel, den die Anwendung nicht deutet, bleibt in `roh`.
    expect(kopf.roh.math).toBe('katex');
  });

  it('reicht ein Theme als Block aus Name und Uebersteuerungen unveraendert durch', () => {
    const text =
      '---\npresentation: true\ntheme:\n  name: dark\n  accent: "#c0392b"\n  font: Georgia\n---\n';
    const { kopf, befunde } = lesePraesentation(text);
    expect(befunde).toEqual([]);
    expect(kopf.theme).toEqual({ name: 'dark', accent: '#c0392b', font: 'Georgia' });
  });

  it('laesst unbekannte Schluessel unangetastet und ohne Befund', () => {
    const text = '---\npresentation: true\nauthor: Erfunden\nlang: de\nextra:\n  a: 1\n---\n';
    const { kopf, befunde } = lesePraesentation(text);
    expect(befunde).toEqual([]);
    expect(kopf.roh).toEqual({
      presentation: true,
      author: 'Erfunden',
      lang: 'de',
      extra: { a: 1 },
    });
  });

  it('faellt bei unbekannter Groesse auf 16:9 zurueck und meldet die Zeile', () => {
    const text = '---\npresentation: true\nsize: 3:2\n---\n# A\n';
    const model = lesePraesentation(text);
    expect(model.kopf.size).toBe('16:9');
    expect(model.befunde).toEqual([{ code: 'unbekannteGroesse', zeile: 3, detail: '"3:2"' }]);
    expect(model.folien.length).toBe(1);
  });

  it('meldet ein ungueltiges Theme und faellt auf kein Theme zurueck', () => {
    // Ein Block ohne `name:` ist seit 4T-002277 gueltig (AK6, eigener Fall).
    for (const wert of ['42', '[a, b]', '""']) {
      const model = lesePraesentation(`---\npresentation: true\ntheme: ${wert}\n---\n`);
      expect(model.kopf.theme, wert).toBeNull();
      expect(
        model.befunde.map((b) => b.code),
        wert,
      ).toEqual(['themeUngueltig']);
    }
  });

  it('meldet ungueltige Werte bei paginate, header und footer', () => {
    const text = '---\npresentation: true\npaginate: "ja"\nheader: 12\nfooter: [a]\n---\n';
    const model = lesePraesentation(text);
    expect(model.kopf).toMatchObject({ paginate: false, header: null, footer: null });
    expect(model.befunde.map((b) => [b.code, b.zeile])).toEqual([
      ['paginateUngueltig', 3],
      ['headerUngueltig', 4],
      ['footerUngueltig', 5],
    ]);
  });
});

describe('presentation-core — Sprecher-Notizen (AK5)', () => {
  it('liest einen einzeiligen `%%`-Kommentar als Notiz und entfernt ihn', () => {
    const [folie] = lesePraesentation(`${KOPF}# A %% kurz %%\n`).folien;
    expect(texte(folie.notizen)).toEqual(['kurz']);
    expect(folie.quelltext).toBe('# A \n');
  });

  it('liest einen mehrzeiligen `%%`-Kommentar zeilentreu', () => {
    const [folie] = lesePraesentation(`${KOPF}# A\n%% erste\nzweite %%\nText\n`).folien;
    expect(texte(folie.notizen)).toEqual(['erste\nzweite']);
    expect(folie.quelltext).toBe('# A\n\n\nText\n');
  });

  it('liest HTML-Kommentare als Notizen, als Block und im Text', () => {
    const [folie] = lesePraesentation(
      `${KOPF}# A\n<!--\nzwei\nZeilen\n-->\nText <!-- mittendrin --> weiter\n`,
    ).folien;
    expect(texte(folie.notizen)).toEqual(['zwei\nZeilen', 'mittendrin']);
    expect(folie.quelltext).toBe('# A\n\n\n\n\nText  weiter\n');
  });

  it('ordnet Notizen ihrer Folie in Dokument-Reihenfolge zu', () => {
    const text = `${KOPF}# A\n<!-- eins -->\n%% zwei %%\n\n---\n\n# B\n\n---\n\n%% drei %%\n`;
    const model = lesePraesentation(text);
    expect(model.folien.map((f) => texte(f.notizen))).toEqual([['eins', 'zwei'], [], ['drei']]);
  });

  it('haelt Steuer-Kommentare aus den Notizen und fuehrt sie als Rohdaten', () => {
    const text = `${KOPF}<!-- paginate: false -->\n<!-- _class: lead -->\n<!-- Hinweis: langsam sprechen -->\n# A\n`;
    const [folie] = lesePraesentation(text).folien;
    expect(folie.steuerKommentare).toEqual(['paginate: false', '_class: lead']);
    // Ein Wort mit Doppelpunkt, das kein Steuer-Schluessel ist, bleibt wie bei
    // Marp eine Notiz.
    expect(texte(folie.notizen)).toEqual(['Hinweis: langsam sprechen']);
    // Beide Formen erscheinen nicht im Quelltext der Folie.
    expect(folie.quelltext).toBe('\n\n\n# A\n');
  });

  it('erkennt die Steuer-Form auch mehrzeilig, locker und als Werkzeug-Kommentar', () => {
    const text = `${KOPF}<!--\ntheme: gaia\nbackgroundColor: #fff\n-->\n<!-- prettier-ignore -->\n<!-- size: 4:3 -->\n`;
    const [folie] = lesePraesentation(text).folien;
    expect(folie.steuerKommentare).toEqual([
      'theme: gaia\nbackgroundColor: #fff',
      'prettier-ignore',
      'size: 4:3',
    ]);
    expect(texte(folie.notizen)).toEqual([]);
  });

  it('behandelt `%%` bei abgeschalteter Erweiterung als Text', () => {
    const [folie] = lesePraesentation(`${KOPF}# A %% kurz %%\n`, {
      kommentareAktiv: false,
    }).folien;
    expect(texte(folie.notizen)).toEqual([]);
    expect(folie.quelltext).toBe('# A %% kurz %%\n');
  });

  it('liest Kommentare in Code und Code-Spannen nicht als Notiz', () => {
    const text = `${KOPF}\`<!-- kein -->\` und \`%% kein %%\`\n\n\`\`\`\n<!-- kein -->\n%% kein %%\n\`\`\`\n`;
    const [folie] = lesePraesentation(text).folien;
    expect(texte(folie.notizen)).toEqual([]);
    expect(folie.quelltext).toBe(text.slice(KOPF.length));
  });

  it('beachtet das Escape `\\%%` des Kommentar-Scanners', () => {
    const [folie] = lesePraesentation(`${KOPF}50 \\%% Rabatt\n`).folien;
    expect(texte(folie.notizen)).toEqual([]);
  });

  it('stuerzt bei einem offenen `%%`-Kommentar nicht ab und folgt der Bestands-Regel', () => {
    const model = lesePraesentation(`${KOPF}# A\n%% offen bis zum Ende\n\n---\n\n# B\n`);
    expect(model.folien.length).toBe(1);
    expect(texte(model.folien[0].notizen)).toEqual(['offen bis zum Ende\n\n---\n\n# B']);
  });

  it('liest die Notizen und Steuer-Kommentare der Marp-Beispieldatei', () => {
    const model = lesePraesentation(MARP);
    expect(model.folien.length).toBe(4);
    expect(model.folien.map((f) => texte(f.notizen))).toEqual([
      ['Begrüßen und das Thema nennen.'],
      ['Notiz über\nzwei Zeilen'],
      ['kurzer Notiz'],
      [],
    ]);
    expect(model.folien.map((f) => f.steuerKommentare)).toEqual([
      ['_class: lead'],
      [],
      ['paginate: false', 'backgroundColor: #123456'],
      ['prettier-ignore'],
    ]);
    // Hintergrund-Bilder sind gewoehnliche Bilder und bleiben im Quelltext.
    expect(model.folien[1].quelltext).toContain('![bg right:40%](bild-rechts.png)');
    expect(model.folien[2].quelltext).toContain('![bg](hintergrund.jpg)');
    for (const folie of model.folien) expect(folie.quelltext).not.toContain('<!--');
  });
});

describe('presentation-core — Paritaet mit der Render-Pipeline (AK8)', () => {
  // Die thematischen Linien aus Bindestrichen, die die Lese-Pipeline der
  // Anwendung auf der obersten Ebene erzeugt, als 1-basierte Dokument-Zeilen.
  // Die Pipeline entfernt `%%` vor dem Zerlegen und rendert den Rumpf ohne Kopf.
  function pipelineLinien(text) {
    const kopf = extractFrontmatter(text);
    const kopfZeilen = kopf.raw === null ? 0 : kopf.raw.split('\n').length - 1;
    return md
      .parse(stripPercentComments(kopf.body), {})
      .filter((t) => t.type === 'hr' && t.level === 0 && t.markup[0] === '-')
      .map((t) => t.map[0] + kopfZeilen + 1);
  }

  const KORPUS = [
    GRENZ,
    `${KOPF}# A\n\n---\n\n# B\n\n---\n\n---\n\n# D\n`,
    `${KOPF}---\n# A\n`,
    `${KOPF}Titel\n---\n\nText\n\n- - -\n\n   ---\n\n    ---\n`,
    `${KOPF}%% Kommentar\n\n---\n\nEnde %%\n\n---\n\nB\n`,
    `${KOPF}# A\n%% Notiz %%\n---\n# B\n`,
    `${KOPF}\`\`\`\n\n---\n\`\`\`\n\n---\n\n***\n\n___\n`,
    `${KOPF}# A\n---\n# B\n`,
    `${KOPF}\`\`\`\nx\n\`\`\`\n---\n`,
    `${KOPF}- Punkt\n---\n\n- Punkt\n\n  ---\n`,
    `${KOPF}> Zitat\n> ---\n\n> ---\n`,
  ];

  it('trennt genau an den Linien, die die Pipeline zeichnet', () => {
    for (const text of KORPUS) {
      expect(trennerZeilen(lesePraesentation(text)), text).toEqual(pipelineLinien(text));
    }
    // Der Korpus traegt Linien, sonst waere die Gleichheit leer.
    expect(KORPUS.map((t) => pipelineLinien(t).length).reduce((a, b) => a + b)).toBeGreaterThan(8);
  });
});

describe('presentation-core — Ohne Parser', () => {
  it('liefert ohne Markdown-Instanz eine Folie aus dem ganzen Rumpf und einen Befund', () => {
    for (const optionen of [{}, { md: null }, { md: {} }]) {
      const model = lesePraesentationRoh(`${KOPF}# A\n\n---\n\n# B %% n %%\n`, optionen);
      expect(model.istPraesentation).toBe(true);
      expect(model.folien.length).toBe(1);
      expect(model.folien[0]).toMatchObject({ vonZeile: 4, quelltext: '# A\n\n---\n\n# B \n' });
      expect(texte(model.folien[0].notizen)).toEqual(['n']);
      expect(model.befunde).toEqual([{ code: 'keinParser', zeile: 4, detail: '' }]);
    }
  });

  it('wirft nicht, wenn die Markdown-Instanz beim Zerlegen scheitert', () => {
    const kaputt = {
      parse() {
        throw new Error('defekt');
      },
    };
    const model = lesePraesentationRoh(`${KOPF}# A\n\n---\n`, { md: kaputt });
    expect(model.folien.length).toBe(1);
    expect(model.befunde).toEqual([{ code: 'keinParser', zeile: 4, detail: 'defekt' }]);
  });
});

describe('presentation-core — Prozess-Neutralitaet (AK7)', () => {
  it('laeuft in reiner Node-Umgebung ohne DOM und ohne Electron', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(lesePraesentation('').folien.length).toBe(1);
  });

  it('laedt weder Electron noch ein Renderer-Modul und greift nicht auf Dateien zu', () => {
    const quelle = readFileSync(
      fileURLToPath(new URL('../../src/shared/presentation/presentation-core.js', import.meta.url)),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual([
      '../markdown/frontmatter.js',
      '../markdown/plugins/comments.js',
      '../markdown/fence-level.js',
      '../markdown/link-scan.js',
      './presentation-folien-schluessel.js',
    ]);
  });

  // 4T-002277, AK9: die Schwester-Datei der Angaben je Folie ebenso.
  it('haelt die Deutung der Angaben je Folie prozess-neutral', () => {
    const quelle = readFileSync(
      fileURLToPath(
        new URL('../../src/shared/presentation/presentation-folien-schluessel.js', import.meta.url),
      ),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual(['js-yaml', './presentation-themes.js']);
    expect(quelle).not.toMatch(/\b(document|window|electron|require\(['"]fs['"]\))\b/);
  });
});

// 4T-002164 (Epic 3E-000149): Messung der nach oeffentlichen Marp-Beispielen
// nachgebauten Dateien gegen Format-Kern und Darstellung. Erwartet ist die
// Deutung durch Marp (Teilung an `---`, HTML-Kommentare als Notiz, Steuer-
// Kommentare nicht als Notiz, `bg`-Bilder als Hintergrund); die Abweichungen,
// die die Messung zeigt, stehen als eigene Faelle darunter und sind im
// Loesungs-Kapitel von 4T-002164 eingeordnet. Den Ablauf an der gestarteten
// Anwendung traegt PR-02 in test/e2e/funktionen/praesentation.spec.js.
describe('presentation-core — Nachgebaute Marp-Beispiele (4T-002164)', () => {
  function ersteUeberschrift(folie) {
    const treffer = folie.quelltext.match(/^#{1,6} (.*)$/m);
    return treffer ? treffer[1] : null;
  }

  function hintergruende(folie) {
    const bilder = hintergrundBilderZiehen(folie.quelltext).bilder;
    const anordnung = hintergrundAnordnung(bilder);
    return { zahl: bilder.length, seite: anordnung.seite, vertikal: anordnung.vertikal };
  }

  it('teilt den Vortrag wie Marp in sechs Folien mit ihren Ueberschriften', () => {
    const model = lesePraesentation(MARP_VORTRAG);
    expect(model.kennzeichen).toBe('marp');
    expect(model.befunde).toEqual([]);
    expect(model.folien.map(ersteUeberschrift)).toEqual([
      'Das erfundene Produkt',
      'Agenda',
      'Ausgangslage',
      'Vorschlag',
      'Beispiel-Code',
      'Danke',
    ]);
    expect(model.kopf).toMatchObject({
      theme: 'default',
      paginate: true,
      header: 'Erfundene Fachtagung',
      footer: 'Beispiel GmbH',
      size: '16:9',
    });
  });

  it('fuehrt im Vortrag Notizen und Steuer-Anweisungen getrennt, keine auf der Folie', () => {
    const model = lesePraesentation(MARP_VORTRAG);
    expect(model.folien.map((f) => texte(f.notizen))).toEqual([
      ['Begrüßung: kurz vorstellen, dann zur Agenda.'],
      ['Die Agenda nur vorlesen,\nnicht erklären.'],
      [],
      ['Hier eine Pause machen.'],
      [],
      [],
    ]);
    expect(model.folien.map((f) => f.steuerKommentare)).toEqual([
      ['_class: lead', '_paginate: false'],
      [],
      [],
      ["_backgroundColor: '#123456'", '_color: white'],
      [],
      ["_footer: ''"],
    ]);
    for (const folie of model.folien) expect(folie.quelltext).not.toContain('<!--');
  });

  it('erkennt im Vortrag Hintergrund und Zweiteilung wie Marp', () => {
    const model = lesePraesentation(MARP_VORTRAG);
    expect(model.folien.map(hintergruende)).toEqual([
      { zahl: 1, seite: 'left', vertikal: false },
      { zahl: 0, seite: null, vertikal: false },
      { zahl: 1, seite: null, vertikal: false },
      { zahl: 1, seite: 'right', vertikal: false },
      { zahl: 0, seite: null, vertikal: false },
      { zahl: 0, seite: null, vertikal: false },
    ]);
  });

  it('teilt die Hintergrund-Beispiele in fuenf Folien und deutet jede bg-Angabe', () => {
    const model = lesePraesentation(MARP_HINTERGRUENDE);
    expect(model.kennzeichen).toBe('marp');
    expect(model.kopf.size).toBe('4:3');
    expect(model.folien.map(ersteUeberschrift)).toEqual([
      'Hintergründe im Nachbau',
      'Übereinander',
      'Zweiteilung rechts',
      'Zweiteilung mit Breite',
      'Eingepasst',
    ]);
    expect(model.folien.map(hintergruende)).toEqual([
      { zahl: 2, seite: null, vertikal: false },
      { zahl: 3, seite: null, vertikal: true },
      { zahl: 1, seite: 'right', vertikal: false },
      { zahl: 1, seite: 'left', vertikal: false },
      { zahl: 1, seite: null, vertikal: false },
    ]);
    expect(model.folien.map((f) => f.notizen.length)).toEqual([1, 0, 0, 1, 0]);
  });

  // Abweichung, die die Messung zeigt: Die mitgelieferten Themes von Marp
  // (`default`, `gaia`, `uncover`) kennt die Anwendung nicht; sie fallen mit
  // dem Befund `themeUnbekannt` auf `light` zurueck (Entscheidung 3a: eigene
  // Themes als Daten).
  it('faellt bei den Theme-Namen von Marp auf light zurueck und benennt es', () => {
    for (const name of ['default', 'gaia', 'uncover']) {
      const theme = themeAufloesen(name);
      expect(theme.name).toBe('light');
      expect(theme.befunde).toEqual([{ code: 'themeUnbekannt', detail: name }]);
    }
  });

  // Seit 4T-002277 deutet der Kern `headingDivider` (Abweichung der Messung
  // aus 4T-002164 behoben): Er teilt an Ueberschriften wie Marp.
  it('teilt bei headingDivider an Ueberschriften wie Marp', () => {
    const text = '---\nmarp: true\nheadingDivider: 2\n---\n\n# A\n\n## B\n\n## C\n';
    expect(lesePraesentation(text).folien.length).toBe(3);
  });
});
