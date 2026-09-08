// 4T-001529 (Epic 3E-000175): Der Adress-Schutz der Tag-Erkennung.
//
// **Der Befund** stammt aus der Konzept-Runde 4T-001523 und ist an der echten
// Regel gemessen worden: Ein Fragment-Bezeichner in einer Web-Adresse galt als
// Tag. Solange nur gelesen wird, steht ein Tag zu viel im Panel; sobald die
// Umbenennung dieses Epics schreibt, zerstoerte dieselbe Luecke eine Adresse im
// Text des Anwenders.
//
// **Zwei Ebenen, ein Begriff.** Geprueft wird die gemeinsame Funktion direkt
// UND ihre Wirkung in der Index-Erkennung. Die Render-Seite haelt derselbe
// Begriff; ihr Nachweis liegt im Snapshot der Fixture `render/tags.md`, weil
// dort das erzeugte HTML zaehlt und nicht die Zwischenfrage.
//
// **Die Gegenprobe ist kein Beiwerk.** Ein Schutz, der zu weit greift, ist der
// teurere Fehler: Er nimmt echte Tags aus Panel, Vervollstaendigung und
// Abfragen, ohne dass irgendwo eine Meldung erschiene. Deshalb steht neben
// jedem geschuetzten Fall ein Fall, der weiterhin erkannt werden muss.
import { describe, it, expect } from 'vitest';
import { istInAdresse } from '../../src/shared/tag-erkennung.js';
import parse from '../../src/main/index/parse.js';

const { parseContent } = parse;

// Tags, die die Index-Erkennung aus einem Text zieht — der Weg, den auch das
// Tag-Panel geht.
function tagsAus(text) {
  const ergebnis = parseContent('/bereich/notiz.md', text);
  return [...(ergebnis.tags || [])].sort();
}

// Position der ersten Raute; die Faelle tragen genau eine.
const rautePos = (text) => text.indexOf('#');

describe('istInAdresse — die geteilte Regel (4T-001529)', () => {
  it('erkennt die drei belegten Adress-Formen', () => {
    // Die Formen stammen aus der Erhebung der Konzept-Runde, nicht aus
    // allgemeiner Betrachtung.
    for (const text of [
      'Siehe https://beispiel.de/#abschnitt',
      'Siehe <https://beispiel.de/#kapitel>',
      'Siehe [Text](https://beispiel.de/#anker)',
    ]) {
      expect(istInAdresse(text, rautePos(text)), text).toBe(true);
    }
  });

  it('laesst echte Tags in Ruhe, auch neben einer Adresse', () => {
    for (const text of [
      '#einfach am Zeilenanfang',
      'Text mit #mitten drin',
      'https://beispiel.de und danach #echtertag',
      '(siehe #geklammert)',
      'Liste: - #inListe',
      '#projekt/unterprojekt mit Hierarchie',
    ]) {
      expect(istInAdresse(text, rautePos(text)), text).toBe(false);
    }
  });

  it('haengt am Schema und nicht an der Klammer', () => {
    // Die Klammer allein traegt nicht: Ein geklammertes Tag ist ein Tag. Das
    // ist der Grund, warum die Regel nach «://» sucht.
    const mitSchema = '[Text](https://beispiel.de/#anker)';
    const ohneSchema = '[Text](/pfad#anker)';
    expect(istInAdresse(mitSchema, rautePos(mitSchema))).toBe(true);
    // Bewusst NICHT erfasst (AK3 nennt das volle Schema): Ohne Schema fehlt
    // das Merkmal, das eine Adresse von einer Klammer unterscheidet. Der Fall
    // haelt die Grenze fest, statt sie offen zu lassen.
    expect(istInAdresse(ohneSchema, rautePos(ohneSchema))).toBe(false);
  });

  it('liest nur bis zum naechsten Weissraum zurueck', () => {
    // Sonst faerbte eine Adresse am Zeilenanfang jedes spaetere Tag derselben
    // Zeile mit ein.
    const text = 'https://beispiel.de/pfad #tag';
    expect(istInAdresse(text, text.lastIndexOf('#'))).toBe(false);
  });

  it('bleibt bei unsinnigen Eingaben stumm', () => {
    expect(istInAdresse(null, 0)).toBe(false);
    expect(istInAdresse('text', -1)).toBe(false);
    expect(istInAdresse('text', 1.5)).toBe(false);
  });
});

describe('Index-Erkennung mit Adress-Schutz (4T-001529)', () => {
  it('nimmt keinen Fragment-Bezeichner einer Adresse als Tag (AK1 bis AK3)', () => {
    expect(tagsAus('Siehe https://beispiel.de/#abschnitt im Netz.')).toEqual([]);
    expect(tagsAus('Siehe <https://beispiel.de/#kapitel> im Netz.')).toEqual([]);
    expect(tagsAus('Siehe [Text](https://beispiel.de/#anker) im Netz.')).toEqual([]);
  });

  it('erkennt ein echtes Tag im selben Absatz weiter (AK4)', () => {
    expect(tagsAus('https://beispiel.de und danach #echtertag.')).toEqual(['echtertag']);
    expect(tagsAus('Zeile eins: https://beispiel.de/#anker\nZeile zwei: #zweiter')).toEqual([
      'zweiter',
    ]);
  });

  it('laesst den gewachsenen Bestand unberuehrt', () => {
    // Gegen-Zusicherung: Der neue Schutz darf die bestehenden Regeln nicht
    // verschieben — Hierarchie, Unterstrich und die alte Link-Ziel-Form.
    expect(tagsAus('#einfach und #projekt/unterprojekt sowie #tag_mit_unterstrich')).toEqual([
      'einfach',
      'projekt/unterprojekt',
      'tag_mit_unterstrich',
    ]);
    expect(tagsAus('Kein Tag im Link-Ziel: [Text](#anker)')).toEqual([]);
    expect(tagsAus('Kein Tag in Hex-Farbe: #ff0044')).toEqual([]);
  });
});
