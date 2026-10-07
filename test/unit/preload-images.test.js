// 4T-002068 (Epic 3E-000344): Unit-Tests der Bild-Umwandlung der Anzeige
// (`resolveImagesForBase`, src/main/preload-images.js) gegen echte Temp-Ordner.
//
// **Was zugesichert wird.** Ein Bild-Element verlässt die Umwandlung entweder
// mit einer Daten-Adresse, die aus einer Datei innerhalb der Grenze gelesen
// wurde, oder ohne Adresse. Eine Datei-Adresse, eine Freigabe-Adresse, ein
// Pfad außerhalb der Grenze, eine fremde Endung, eine zu große oder eine nicht
// lesbare Datei bleiben nicht stehen; das Fenster lädt sonst, was die
// Umwandlung abgelehnt hat. Grenze ist der gebundene Bereich, wenn er den
// Dokument-Ordner enthält, sonst der Dokument-Ordner. Unverändert bleiben
// allein `http:`/`https:` (weist die Inhalts-Regel des Fensters ab) und
// Daten-Adressen.
//
// **Warum zusätzlich die Datei-Zugriffe gezählt werden.** Die Umwandlung läuft
// im Vorlade-Skript mit Zugriff auf das Dateisystem. Ein Lese- oder
// Größen-Zugriff auf eine Freigabe-Adresse wäre selbst die Verbindung zum
// fremden Rechner, die der Vorgang verhindern soll — auch wenn das Bild danach
// nicht erschiene. Deshalb prüft jeder Fall außerhalb der Grenze, dass kein
// Zugriff auf das Ziel stattfand.
//
// Setup-Muster der benachbarten Main-Tests (test/unit/books-angaben.test.js).
// Die Freigabe-Adressen nennen einen Rechner unter `.invalid`, der nie
// aufgelöst wird.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mindmapBilderAufloesen, resolveImagesForBase } from '../../src/main/preload-images.js';

const BILD_INHALT = Buffer.from('PNG-Probe');
const BILD_BASE64 = BILD_INHALT.toString('base64');

let tmpDirs = [];
let wurzel;
let bereich;
let dokOrdner;
let dokPfad;
let aussen;
let zugriffe;

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-bilder-'));
  tmpDirs.push(dir);
  return dir;
}

function schreibe(datei, inhalt = BILD_INHALT) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, inhalt);
  return datei;
}

// Ein Bild-Element, wie es die Markdown-Pipeline ausgibt.
function bild(src) {
  return `<p><img src="${src}" alt="Probe"></p>`;
}

// Der Wert des `src`-Attributs oder null, wenn das Element keines trägt.
// `\s` davor, damit `data-src-original` nicht mitgezählt wird.
function quelleVon(html) {
  const m = /<img\b[^>]*\ssrc="([^"]*)"/.exec(html);
  return m ? m[1] : null;
}

// Hat die Umwandlung das Ziel außerhalb der Grenze angefasst?
function zugriffAusserhalb() {
  const aussenKey = path.resolve(aussen).toLowerCase();
  return zugriffe.filter((p) => {
    const s = String(p);
    return (
      s.startsWith('\\\\') ||
      s.startsWith('//') ||
      s.toLowerCase().includes('rechner.invalid') ||
      path.resolve(s).toLowerCase().startsWith(aussenKey)
    );
  });
}

beforeEach(() => {
  wurzel = makeDir();
  bereich = path.join(wurzel, 'bereich');
  dokOrdner = path.join(bereich, 'notizen');
  dokPfad = path.join(dokOrdner, 'notiz.md');
  aussen = path.join(wurzel, 'aussen');
  schreibe(dokPfad, '# Notiz\n');
  schreibe(path.join(dokOrdner, 'bild.png'));
  schreibe(path.join(dokOrdner, 'unter', 'tief.png'));
  schreibe(path.join(bereich, 'anlagen', 'anlage.png'));
  schreibe(path.join(dokOrdner, 'text.txt'), 'kein Bild');
  schreibe(path.join(aussen, 'fremd.png'));

  zugriffe = [];
  const statOriginal = fs.statSync;
  const readOriginal = fs.readFileSync;
  vi.spyOn(fs, 'statSync').mockImplementation((p, ...rest) => {
    zugriffe.push(p);
    return statOriginal.call(fs, p, ...rest);
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
    zugriffe.push(p);
    return readOriginal.call(fs, p, ...rest);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  tmpDirs = [];
});

describe('resolveImagesForBase: Bilder innerhalb der Grenze (Bestand)', () => {
  it('bettet ein Bild im Dokument-Ordner als Daten-Adresse ein und hält die Quelle fest', () => {
    const html = resolveImagesForBase(bild('bild.png'), dokPfad, null);
    expect(quelleVon(html)).toBe(`data:image/png;base64,${BILD_BASE64}`);
    expect(html).toContain('data-src-original="bild.png"');
    expect(html).toContain('alt="Probe"');
  });

  it('bettet ein Bild im Unterordner ein', () => {
    const html = resolveImagesForBase(bild('unter/tief.png'), dokPfad, null);
    expect(quelleVon(html)).toBe(`data:image/png;base64,${BILD_BASE64}`);
  });

  it('bettet bei gebundenem Bereich ein Bild außerhalb des Dokument-Ordners, aber im Bereich ein', () => {
    const html = resolveImagesForBase(bild('../anlagen/anlage.png'), dokPfad, bereich);
    expect(quelleVon(html)).toBe(`data:image/png;base64,${BILD_BASE64}`);
  });

  it('bettet einen absoluten Pfad innerhalb der Grenze ein', () => {
    const abs = path.join(dokOrdner, 'bild.png').split(path.sep).join('/');
    const html = resolveImagesForBase(bild(abs), dokPfad, null);
    expect(quelleVon(html)).toBe(`data:image/png;base64,${BILD_BASE64}`);
  });

  it('lässt http-, https- und Daten-Adressen unverändert', () => {
    for (const src of [
      'http://127.0.0.1:9/a.png',
      'https://127.0.0.1:9/a.png',
      `data:image/png;base64,${BILD_BASE64}`,
    ]) {
      expect(resolveImagesForBase(bild(src), dokPfad, null)).toBe(bild(src));
    }
  });
});

describe('resolveImagesForBase: Adressen, die nicht aufgelöst werden dürfen, verlieren ihre Quelle', () => {
  it('Datei-Adresse auf eine Datei außerhalb', () => {
    const src = pathToFileURL(path.join(aussen, 'fremd.png')).href;
    const html = resolveImagesForBase(bild(src), dokPfad, null);
    expect(quelleVon(html)).toBeNull();
    expect(html).toContain('alt="Probe"');
    expect(zugriffAusserhalb()).toEqual([]);
  });

  it('Datei-Adresse auch auf eine Datei innerhalb der Grenze', () => {
    const src = pathToFileURL(path.join(dokOrdner, 'bild.png')).href;
    const html = resolveImagesForBase(bild(src), dokPfad, null);
    expect(quelleVon(html)).toBeNull();
  });

  it('Datei-Adresse auf eine Freigabe', () => {
    const html = resolveImagesForBase(
      bild('file://rechner.invalid/freigabe/bild.png'),
      dokPfad,
      bereich,
    );
    expect(quelleVon(html)).toBeNull();
    expect(zugriffAusserhalb()).toEqual([]);
  });

  it('Freigabe-Adresse mit Schrägstrichen (//rechner)', () => {
    const html = resolveImagesForBase(
      bild('//rechner.invalid/freigabe/bild.png'),
      dokPfad,
      bereich,
    );
    expect(quelleVon(html)).toBeNull();
    expect(html).toContain('alt="Probe"');
    expect(zugriffAusserhalb()).toEqual([]);
  });

  // Die Schreibweise mit Rückstrichen ist allein unter Windows eine
  // Freigabe-Adresse (wie in der Ablauf-Prüfung der Freigabe-Adressen,
  // 4T-001920). Unter Linux ist dieselbe Zeichenkette ein Dateiname im Ordner
  // des Dokuments: Ein Lese-Versuch dort erreicht keine Freigabe und liegt
  // innerhalb der Grenze, darf also stattfinden (4T-002158).
  it('Freigabe-Adresse mit Rückstrichen (\\\\rechner)', () => {
    const html = resolveImagesForBase(
      bild('\\\\rechner.invalid\\freigabe\\bild.png'),
      dokPfad,
      bereich,
    );
    expect(quelleVon(html)).toBeNull();
    if (process.platform === 'win32') {
      expect(zugriffAusserhalb()).toEqual([]);
    } else {
      const grenze = path.resolve(bereich) + path.sep;
      expect(zugriffe.filter((p) => !path.resolve(String(p)).startsWith(grenze))).toEqual([]);
    }
  });

  it('relativer Pfad mit ../ aus der Grenze hinaus auf eine vorhandene Bilddatei', () => {
    const html = resolveImagesForBase(bild('../../aussen/fremd.png'), dokPfad, bereich);
    expect(quelleVon(html)).toBeNull();
    expect(zugriffAusserhalb()).toEqual([]);
  });

  it('relativer Pfad mit ../ aus dem Dokument-Ordner hinaus, wenn kein Bereich gebunden ist', () => {
    const html = resolveImagesForBase(bild('../anlagen/anlage.png'), dokPfad, null);
    expect(quelleVon(html)).toBeNull();
  });

  it('gebundener Bereich, der das Dokument nicht enthält, weitet die Grenze nicht', () => {
    const html = resolveImagesForBase(bild('../../aussen/fremd.png'), dokPfad, aussen);
    expect(quelleVon(html)).toBeNull();
    expect(zugriffAusserhalb()).toEqual([]);
  });

  it('absoluter Pfad außerhalb der Grenze, in beiden Schreibweisen', () => {
    const abs = path.join(aussen, 'fremd.png');
    for (const src of [abs, abs.split(path.sep).join('/')]) {
      const html = resolveImagesForBase(bild(src), dokPfad, bereich);
      expect(quelleVon(html)).toBeNull();
    }
    expect(zugriffAusserhalb()).toEqual([]);
  });

  it('Datei ohne Bild-Endung innerhalb der Grenze', () => {
    const html = resolveImagesForBase(bild('text.txt'), dokPfad, null);
    expect(quelleVon(html)).toBeNull();
  });

  it('Bilddatei über 20 MB wird nicht gelesen', () => {
    const gross = path.join(dokOrdner, 'gross.png');
    const fd = fs.openSync(gross, 'w');
    fs.ftruncateSync(fd, 20 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    const html = resolveImagesForBase(bild('gross.png'), dokPfad, null);
    expect(quelleVon(html)).toBeNull();
    expect(fs.readFileSync).not.toHaveBeenCalledWith(gross);
  });

  it('fehlende Bilddatei innerhalb der Grenze', () => {
    const html = resolveImagesForBase(bild('fehlt.png'), dokPfad, null);
    expect(quelleVon(html)).toBeNull();
  });

  it('nicht dekodierbare Adresse bricht die Umwandlung nicht ab', () => {
    const html = resolveImagesForBase(bild('bild%.png') + bild('bild.png'), dokPfad, null);
    const quellen = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => quelleVon(m[0]));
    expect(quellen).toEqual([null, `data:image/png;base64,${BILD_BASE64}`]);
  });

  it('weitere Attribute des Elements bleiben erhalten', () => {
    const html = resolveImagesForBase(
      '<img class="breit" src="//rechner.invalid/f/b.png" alt="Probe" width="20">',
      dokPfad,
      null,
    );
    expect(html).toBe('<img class="breit" alt="Probe" width="20">');
  });
});

// 4T-002068, Schritt 1: Ohne Dokument-Pfad (Handbuch-Seiten, unbenannte
// Dokumente, Karten ohne Pfad, Mindmap-Notizen) gilt die feste Wurzel der
// Bilder der Anwendung, src/assets; die geschriebene Adresse ist relativ zur
// Seite des Fensters (src/renderer). Geprüft gegen den echten Ordner der
// Anwendung, weil gerade er die Wurzel ist.
const ANWENDUNGS_BILDER = path.join(__dirname, '..', '..', 'src', 'assets');
const LOGO_BASE64 = fs
  .readFileSync(path.join(ANWENDUNGS_BILDER, 'em4me-logo.svg'))
  .toString('base64');

describe('resolveImagesForBase: ohne Dokument-Pfad gilt der Bild-Ordner der Anwendung', () => {
  it('bettet das Logo der Handbuch-Überblicksseite als Daten-Adresse ein', () => {
    for (const basis of [null, '', undefined]) {
      const html = resolveImagesForBase(
        '<p><img src="../assets/em4me-logo.svg" alt="EM4me"></p>',
        basis,
        null,
      );
      expect(quelleVon(html)).toBe(`data:image/svg+xml;base64,${LOGO_BASE64}`);
      expect(html).toContain('data-anwendungsbild="../assets/em4me-logo.svg"');
      // Kein Anlagen-Verweis: der Klick-Pfad öffnet sonst eine Datei des Dokuments.
      expect(html).not.toContain('data-src-original');
      expect(html).toContain('alt="EM4me"');
    }
  });

  it('ein gebundener Bereich weitet die Wurzel ohne Dokument-Pfad nicht', () => {
    const html = resolveImagesForBase(
      bild(path.join(bereich, 'anlagen', 'anlage.png')),
      null,
      bereich,
    );
    expect(quelleVon(html)).toBeNull();
    expect(zugriffe.filter((p) => String(p).toLowerCase().includes('anlage.png'))).toEqual([]);
  });

  it('jede andere Adresse verliert ihre Quelle, ohne dass außerhalb zugegriffen wird', () => {
    for (const src of [
      'bild.png',
      '../assets/../main/preload.js',
      '../assets/../renderer/index.html',
      '../assets/icon.ico',
      '../assets/fehlt.png',
      path.join(aussen, 'fremd.png'),
      path.join(aussen, 'fremd.png').split(path.sep).join('/'),
      '//rechner.invalid/freigabe/bild.png',
      '\\\\rechner.invalid\\freigabe\\bild.png',
      'file://rechner.invalid/freigabe/bild.png',
      pathToFileURL(path.join(ANWENDUNGS_BILDER, 'em4me-logo.svg')).href,
    ]) {
      const html = resolveImagesForBase(bild(src), null, null);
      expect(quelleVon(html), src).toBeNull();
      expect(html, src).toContain('alt="Probe"');
    }
    expect(zugriffAusserhalb()).toEqual([]);
    const ausserhalbDerAnwendung = zugriffe.filter(
      (p) => !path.resolve(String(p)).toLowerCase().startsWith(ANWENDUNGS_BILDER.toLowerCase()),
    );
    expect(ausserhalbDerAnwendung).toEqual([]);
  });

  it('lässt http-, https- und Daten-Adressen unverändert', () => {
    for (const src of ['http://127.0.0.1:9/a.png', `data:image/png;base64,${BILD_BASE64}`]) {
      expect(resolveImagesForBase(bild(src), null, null)).toBe(bild(src));
    }
  });
});

describe('mindmapBilderAufloesen: Notizen der Mindmap über denselben Weg', () => {
  it('nimmt Bildern in Notizen und Titeln jede Adresse außer den Bildern der Anwendung', () => {
    const ergebnis = {
      root: {
        titelHtml: '<img src="//rechner.invalid/f/t.png" alt="T">',
        notizen: [{ art: 'absatz', html: '<img src="bild.png" alt="N1">' }],
        kinder: [
          {
            titelHtml: 'ohne Bild',
            notizen: [
              { art: 'absatz', html: '<img src="../assets/em4me-logo.svg" alt="N2">' },
              { art: 'code', text: 'kein HTML' },
            ],
            kinder: [],
          },
        ],
      },
    };
    expect(mindmapBilderAufloesen(ergebnis)).toBe(ergebnis);
    expect(ergebnis.root.titelHtml).toBe('<img alt="T">');
    expect(ergebnis.root.notizen[0].html).toBe('<img alt="N1">');
    expect(ergebnis.root.kinder[0].titelHtml).toBe('ohne Bild');
    expect(quelleVon(ergebnis.root.kinder[0].notizen[0].html)).toBe(
      `data:image/svg+xml;base64,${LOGO_BASE64}`,
    );
    expect(ergebnis.root.kinder[0].notizen[1]).toEqual({ art: 'code', text: 'kein HTML' });
    expect(zugriffAusserhalb()).toEqual([]);
  });

  it('verträgt ein leeres Ergebnis', () => {
    expect(mindmapBilderAufloesen(null)).toBeNull();
    expect(mindmapBilderAufloesen({ root: null })).toEqual({ root: null });
  });
});
