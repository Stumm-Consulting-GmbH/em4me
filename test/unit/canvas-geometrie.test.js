// 4T-001653 (Epic 3E-000287): Prüffälle der reinen Canvas-Geometrie —
// Anschlusspunkte, Auflösung von `auto`, Verbindungs-Pfad, Pfeilspitze,
// Hülle, Einpassung und Zoom um einen Punkt.
//
// Das Modul ist prozessneutral; geprüft wird deshalb ohne DOM und ohne
// Umgebung, wie beim Kern (canvas-core.test.js). Was die Zeichnung daraus
// macht, prüft renderer/canvas-view.test.js.
import { describe, it, expect } from 'vitest';
import {
  MIN_BREITE,
  MIN_HOEHE,
  ZOOM_MAX,
  ZOOM_MIN,
  einpassung,
  huelle,
  kartenRechteck,
  pfeilSpitzePfad,
  seitenNormale,
  seitenPunkt,
  verbindungsMitte,
  verbindungsPfad,
  waehleSeiten,
  zielSeiteIm,
  zoomUmPunkt,
} from '../../src/shared/canvas/canvas-geometrie.js';

const karte = (x, y, b = 200, h = 100) => ({ x, y, b, h });

describe('Canvas-Geometrie: Rechteck und Anschlusspunkte (4T-001653)', () => {
  it('nimmt Lage und Größe unverändert, solange sie tragen', () => {
    expect(kartenRechteck(karte(-320, -140, 260, 120))).toEqual({
      x: -320,
      y: -140,
      b: 260,
      h: 120,
    });
  });

  it('hebt eine defekte Größe auf das Mindestmaß', () => {
    // Der Kern liest eine fehlende Zahl als 0 und meldet einen Befund; ohne
    // Untergrenze wäre die Karte unsichtbar und nicht mehr anfassbar.
    const r = kartenRechteck({ x: 0, y: 0, b: 0, h: 0 });
    expect(r.b).toBe(MIN_BREITE);
    expect(r.h).toBe(MIN_HOEHE);
  });

  it('verträgt fehlende Felder ohne zu werfen', () => {
    expect(() => kartenRechteck({})).not.toThrow();
    expect(() => kartenRechteck(null)).not.toThrow();
  });

  it('legt jeden Anschlusspunkt in die Mitte seiner Kante', () => {
    const k = karte(0, 0, 200, 100);
    expect(seitenPunkt(k, 'links')).toEqual({ x: 0, y: 50 });
    expect(seitenPunkt(k, 'rechts')).toEqual({ x: 200, y: 50 });
    expect(seitenPunkt(k, 'oben')).toEqual({ x: 100, y: 0 });
    expect(seitenPunkt(k, 'unten')).toEqual({ x: 100, y: 100 });
  });

  it('gibt jeder Seite eine nach außen zeigende Normale', () => {
    expect(seitenNormale('links')).toEqual({ x: -1, y: 0 });
    expect(seitenNormale('rechts')).toEqual({ x: 1, y: 0 });
    expect(seitenNormale('oben')).toEqual({ x: 0, y: -1 });
    expect(seitenNormale('unten')).toEqual({ x: 0, y: 1 });
  });
});

describe('Canvas-Geometrie: Wahl der Anschluss-Seiten (4T-001653)', () => {
  it('verbindet waagerecht, wenn die Karten nebeneinander liegen', () => {
    expect(waehleSeiten(karte(0, 0), karte(400, 0))).toEqual({ von: 'rechts', nach: 'links' });
    expect(waehleSeiten(karte(400, 0), karte(0, 0))).toEqual({ von: 'links', nach: 'rechts' });
  });

  it('verbindet senkrecht, wenn die Karten übereinander liegen', () => {
    expect(waehleSeiten(karte(0, 0), karte(0, 400))).toEqual({ von: 'unten', nach: 'oben' });
    expect(waehleSeiten(karte(0, 400), karte(0, 0))).toEqual({ von: 'oben', nach: 'unten' });
  });

  it('eine benannte Seite bleibt stehen, auch gegen die Lage', () => {
    // Die Angabe ist die Aussage des Anwenders; die Lage darf sie nicht
    // übersteuern, sonst wanderte ein bewusst gesetzter Anschluss beim
    // nächsten Verschieben davon.
    expect(waehleSeiten(karte(0, 0), karte(400, 0), 'oben', 'unten')).toEqual({
      von: 'oben',
      nach: 'unten',
    });
  });

  it('«auto» und jede unbekannte Angabe fallen auf die Lage zurück', () => {
    const erwartet = { von: 'rechts', nach: 'links' };
    expect(waehleSeiten(karte(0, 0), karte(400, 0), 'auto', 'auto')).toEqual(erwartet);
    expect(waehleSeiten(karte(0, 0), karte(400, 0), 'schräg', '')).toEqual(erwartet);
    expect(waehleSeiten(karte(0, 0), karte(400, 0), undefined, null)).toEqual(erwartet);
  });

  it('mischt eine benannte mit einer aufgelösten Seite', () => {
    expect(waehleSeiten(karte(0, 0), karte(400, 0), 'unten')).toEqual({
      von: 'unten',
      nach: 'links',
    });
  });
});

describe('Canvas-Geometrie: Pfade (4T-001653)', () => {
  it('beginnt und endet an den Anschlusspunkten der gewählten Seiten', () => {
    const d = verbindungsPfad(karte(0, 0), karte(400, 0), { von: 'rechts', nach: 'links' });
    expect(d.startsWith('M 200 50 ')).toBe(true);
    expect(d.endsWith(' 400 50')).toBe(true);
  });

  it('läuft an beiden Enden senkrecht aus seiner Seite heraus', () => {
    // Die beiden Kontrollpunkte liegen auf der Höhe ihres Anschlusspunktes
    // und seitlich versetzt — genau das macht den geraden Austritt aus.
    const d = verbindungsPfad(karte(0, 0), karte(400, 0), { von: 'rechts', nach: 'links' });
    const [c1x, c1y, c2x, c2y] = /C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+),/
      .exec(d)
      .slice(1)
      .map(Number);
    expect(c1y).toBe(50);
    expect(c2y).toBe(50);
    expect(c1x).toBeGreaterThan(200);
    expect(c2x).toBeLessThan(400);
  });

  it('legt den Mittelpunkt auf die Kurve, nicht zwischen die Karten (4T-001655)', () => {
    // Dort sitzen Beschriftung und Leiste der gewählten Verbindung. Bei zwei
    // Karten auf gleicher Höhe liegt er mittig zwischen den Anschlusspunkten.
    const mitte = verbindungsMitte(karte(0, 0), karte(400, 0), { von: 'rechts', nach: 'links' });
    expect(mitte).toEqual({ x: 300, y: 50 });
  });

  it('der Mittelpunkt wandert mit den Karten (4T-001655)', () => {
    const seiten = { von: 'rechts', nach: 'links' };
    const vorher = verbindungsMitte(karte(0, 0), karte(400, 0), seiten);
    const nachher = verbindungsMitte(karte(0, 0), karte(400, 200), seiten);
    expect(nachher.y).not.toBe(vorher.y);
    // Auf eine Nachkommastelle gerundet wie der Pfad, damit ein Vergleich
    // zweier Zeichnungen nicht zur Frage der letzten Bits wird.
    expect(Math.round(nachher.y * 10) / 10).toBe(nachher.y);
  });

  it('folgt seinen Karten: eine verschobene Karte ergibt einen anderen Pfad', () => {
    const seiten = { von: 'rechts', nach: 'links' };
    const vorher = verbindungsPfad(karte(0, 0), karte(400, 0), seiten);
    const nachher = verbindungsPfad(karte(0, 0), karte(400, 120), seiten);
    expect(nachher).not.toBe(vorher);
  });

  it('rundet auf eine Nachkommastelle, damit ein Vergleich stabil bleibt', () => {
    const d = verbindungsPfad(karte(0, 0, 201, 101), karte(333, 77), {
      von: 'rechts',
      nach: 'links',
    });
    for (const zahl of d.match(/-?\d+(\.\d+)?/g)) {
      expect(zahl).toMatch(/^-?\d+(\.\d)?$/);
    }
  });

  it('die Pfeilspitze sitzt am Anschlusspunkt und zeigt in die Karte hinein', () => {
    const d = pfeilSpitzePfad(karte(400, 0), 'links');
    // Erste Koordinate ist die Spitze: der linke Anschlusspunkt.
    expect(d.startsWith('M 400 50 ')).toBe(true);
    // Die beiden hinteren Ecken liegen links davon, also außerhalb der Karte.
    const punkte = [...d.matchAll(/L ([\d.-]+) ([\d.-]+)/g)].map((m) => Number(m[1]));
    expect(punkte).toHaveLength(2);
    for (const x of punkte) expect(x).toBeLessThan(400);
  });

  it('die Pfeilspitze ist ein geschlossenes Dreieck', () => {
    expect(pfeilSpitzePfad(karte(0, 400), 'oben').endsWith(' Z')).toBe(true);
  });

  it('dieselbe Rechnung trägt die zweite Spitze der beidseitigen Form', () => {
    // Befund 2 vom 2026-09-10: Die Spitze am **Anfang** zeigt in die
    // Quell-Karte hinein. Dafür genügt derselbe Aufruf mit dem anderen Ende —
    // eine eigene Rechnung mit umgekehrter Normale wäre dieselbe Rechnung.
    const d = pfeilSpitzePfad(karte(0, 0), 'rechts');
    expect(d.startsWith('M 200 50 ')).toBe(true);
    const punkte = [...d.matchAll(/L ([\d.-]+) ([\d.-]+)/g)].map((m) => Number(m[1]));
    for (const x of punkte) expect(x).toBeGreaterThan(200);
  });
});

// Befund 3 des Product Owners vom 2026-09-10: «Ich kann angeben, von welcher
// der vier Seiten eines Rechtecks die Linie startet, aber nicht, an welcher
// der vier Seiten des Ziels sie endet.»
describe('Canvas-Geometrie: Ziel-Zonen einer Karte (4T-001655)', () => {
  // 200 × 100 an (0, 0); die Zonen sind 24 tief, senkrecht auf 100/3 gedeckelt.
  const ziel = karte(0, 0);

  it('der Körper der Karte ergibt `auto`', () => {
    expect(zielSeiteIm(ziel, { x: 100, y: 50 })).toBe('auto');
  });

  it('jede der vier Randzonen ergibt ihre Seite', () => {
    expect(zielSeiteIm(ziel, { x: 3, y: 50 })).toBe('links');
    expect(zielSeiteIm(ziel, { x: 197, y: 50 })).toBe('rechts');
    expect(zielSeiteIm(ziel, { x: 100, y: 2 })).toBe('oben');
    expect(zielSeiteIm(ziel, { x: 100, y: 98 })).toBe('unten');
  });

  it('an einer Ecke gewinnt die nächstliegende Kante', () => {
    // Zwei Einheiten von oben, zehn von links: oben liegt näher.
    expect(zielSeiteIm(ziel, { x: 10, y: 2 })).toBe('oben');
    expect(zielSeiteIm(ziel, { x: 2, y: 10 })).toBe('links');
  });

  it('ein Punkt außerhalb der Karte ergibt `auto`', () => {
    expect(zielSeiteIm(ziel, { x: -5, y: 50 })).toBe('auto');
    expect(zielSeiteIm(ziel, { x: 100, y: 200 })).toBe('auto');
    expect(zielSeiteIm(ziel, {})).toBe('auto');
  });

  it('auch die kleinste Karte behält einen Körper', () => {
    // Ohne den Deckel auf ein Drittel der Kante wäre eine Karte von
    // MIN_BREITE × MIN_HOEHE ganz Zone, und `auto` nicht mehr treffbar.
    const klein = karte(0, 0, MIN_BREITE, MIN_HOEHE);
    expect(zielSeiteIm(klein, { x: MIN_BREITE / 2, y: MIN_HOEHE / 2 })).toBe('auto');
    expect(zielSeiteIm(klein, { x: 1, y: MIN_HOEHE / 2 })).toBe('links');
  });
});

describe('Canvas-Geometrie: Hülle und Einpassung (4T-001653)', () => {
  it('umschließt alle Karten', () => {
    expect(huelle([karte(-100, -50, 100, 50), karte(200, 300, 100, 50)])).toEqual({
      links: -100,
      oben: -50,
      rechts: 300,
      unten: 350,
    });
  });

  it('ohne Karte gibt es nichts einzupassen', () => {
    expect(huelle([])).toBeNull();
    expect(huelle(null)).toBeNull();
    expect(einpassung(null, 800, 600)).toBeNull();
  });

  it('legt die Hülle mittig in das Sichtfenster', () => {
    const rahmen = { links: -100, oben: -100, rechts: 100, unten: 100 };
    const lage = einpassung(rahmen, 800, 600);
    // Mittelpunkt der Hülle liegt nach der Abbildung in der Mitte der Sicht.
    expect(lage.tx + 0 * lage.scale).toBeCloseTo(400, 5);
    expect(lage.ty + 0 * lage.scale).toBeCloseTo(300, 5);
  });

  it('lässt Rand und bleibt in den Zoom-Grenzen', () => {
    const weit = einpassung({ links: -5000, oben: -5000, rechts: 5000, unten: 5000 }, 800, 600);
    expect(weit.scale).toBeGreaterThanOrEqual(ZOOM_MIN);
    // Eine winzige Fläche darf nicht über die Obergrenze hinaus vergrößert
    // werden, sonst füllte eine einzelne Karte das Fenster mit Pixelbrei.
    const winzig = einpassung({ links: -1, oben: -1, rechts: 1, unten: 1 }, 800, 600);
    expect(winzig.scale).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it('verträgt ein Sichtfenster ohne gemessene Größe', () => {
    // In jsdom liefert getBoundingClientRect Nullen; ohne Rückfall wäre die
    // Einpassung dort eine Division durch Null.
    const lage = einpassung({ links: 0, oben: 0, rechts: 100, unten: 100 }, 0, 0);
    expect(Number.isFinite(lage.scale)).toBe(true);
    expect(lage.scale).toBeGreaterThan(0);
  });
});

describe('Canvas-Geometrie: Zoom um einen Punkt (4T-001653)', () => {
  const start = { scale: 1, tx: 0, ty: 0 };

  it('hält den Punkt unter dem Zeiger fest', () => {
    const px = 300;
    const py = 200;
    const neu = zoomUmPunkt(start, px, py, 2);
    // Fläche-Koordinate unter dem Zeiger vorher und nachher.
    const vorher = (px - start.tx) / start.scale;
    const nachher = (px - neu.tx) / neu.scale;
    expect(nachher).toBeCloseTo(vorher, 6);
    expect((py - neu.ty) / neu.scale).toBeCloseTo((py - start.ty) / start.scale, 6);
  });

  it('klemmt an beiden Grenzen', () => {
    expect(zoomUmPunkt(start, 0, 0, 1000).scale).toBe(ZOOM_MAX);
    expect(zoomUmPunkt(start, 0, 0, 0.0001).scale).toBe(ZOOM_MIN);
  });

  it('lässt die Lage unverändert, wenn die Grenze schon erreicht ist', () => {
    // Sonst wanderte die Fläche bei jedem weiteren Radschub, obwohl sich
    // sichtbar nichts vergrößert.
    const anGrenze = { scale: ZOOM_MAX, tx: 42, ty: -17 };
    expect(zoomUmPunkt(anGrenze, 300, 200, 2)).toEqual(anGrenze);
  });

  it('verträgt einen unbrauchbaren Faktor und einen leeren Zustand', () => {
    expect(zoomUmPunkt(start, 0, 0, 0)).toEqual(start);
    expect(zoomUmPunkt(start, 0, 0, NaN)).toEqual(start);
    expect(zoomUmPunkt(null, 0, 0, 2).scale).toBe(2);
  });
});
