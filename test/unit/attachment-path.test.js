// 4T-0787 (Epic 3E-0125): Unit-Tests für den Ablage-Kern der Anlagen
// (src/main/attachment-path.js). Geprüft sind die vier Ablage-Formen, die
// Grenz-Abweisungen, die Namensvergabe samt Kollisions-Zähler und der
// dokumentrelative Verweis-Pfad.
import { describe, it, expect } from 'vitest';
import {
  ABLAGE_FORMEN,
  STANDARD_FORM,
  STANDARD_ORDNERNAME,
  istAusfuehrbareEndung,
  normalisiereAnlagenKonfig,
  istGueltigerOrdnername,
  ordnernameAusDokument,
  loeseAblageOrt,
  erzeugeAnlagenNamen,
  bereinigeDateinamen,
  freierDateiname,
  verweisPfad,
} from '../../src/main/attachment-path.js';

const WURZEL = 'C:\\Daten\\Notizen';
const DOK = 'C:\\Daten\\Notizen\\Projekte\\Protokoll.md';
const DOK_ORDNER = 'C:\\Daten\\Notizen\\Projekte';

describe('normalisiereAnlagenKonfig (4T-0787)', () => {
  it('ohne Konfiguration gilt die Voreinstellung', () => {
    expect(normalisiereAnlagenKonfig(undefined)).toEqual({
      form: STANDARD_FORM,
      ordnername: STANDARD_ORDNERNAME,
    });
    expect(STANDARD_FORM).toBe('dokument');
  });

  it('unbekannte Form fällt auf die Voreinstellung zurück, statt zu werfen', () => {
    expect(normalisiereAnlagenKonfig({ form: 'quatsch' }).form).toBe(STANDARD_FORM);
  });

  it('alle vier Formen werden übernommen', () => {
    for (const form of ABLAGE_FORMEN) {
      expect(normalisiereAnlagenKonfig({ form }).form).toBe(form);
    }
  });

  it('leerer Ordnername fällt auf den Standardwert zurück', () => {
    expect(normalisiereAnlagenKonfig({ ordnername: '   ' }).ordnername).toBe(STANDARD_ORDNERNAME);
  });
});

describe('istGueltigerOrdnername (4T-0787)', () => {
  it('einfache Namen sind gültig', () => {
    expect(istGueltigerOrdnername('Anlagen')).toBe(true);
    expect(istGueltigerOrdnername('_Anlagen 2')).toBe(true);
  });

  it('Pfad-Segmente und Aufstiege werden abgewiesen', () => {
    expect(istGueltigerOrdnername('..')).toBe(false);
    expect(istGueltigerOrdnername('../Anlagen')).toBe(false);
    expect(istGueltigerOrdnername('Unter/Anlagen')).toBe(false);
    expect(istGueltigerOrdnername('Unter\\Anlagen')).toBe(false);
  });

  it('leere und reine Punkt-Namen werden abgewiesen', () => {
    expect(istGueltigerOrdnername('')).toBe(false);
    expect(istGueltigerOrdnername('   ')).toBe(false);
    expect(istGueltigerOrdnername('.')).toBe(false);
    expect(istGueltigerOrdnername('...')).toBe(false);
  });
});

describe('loeseAblageOrt — die vier Formen (4T-0787)', () => {
  it('neben dem Dokument liefert dessen Ordner', () => {
    const r = loeseAblageOrt({ dokumentPfad: DOK, konfig: { form: 'neben' } });
    expect(r.ok).toBe(true);
    expect(r.verzeichnis).toBe(DOK_ORDNER);
  });

  it('fester Unterordner hängt den Ordnernamen an', () => {
    const r = loeseAblageOrt({
      dokumentPfad: DOK,
      konfig: { form: 'fest', ordnername: 'Anlagen' },
    });
    expect(r.ok).toBe(true);
    expect(r.verzeichnis).toBe('C:\\Daten\\Notizen\\Projekte\\Anlagen');
  });

  it('Ordner mit dem Namen des Dokuments nutzt dessen Basisnamen ohne Endung', () => {
    const r = loeseAblageOrt({ dokumentPfad: DOK, konfig: { form: 'dokument' } });
    expect(r.ok).toBe(true);
    expect(r.verzeichnis).toBe('C:\\Daten\\Notizen\\Projekte\\Protokoll');
  });

  it('zentraler Bereichs-Ordner hängt am Bereich, nicht am Dokument', () => {
    const r = loeseAblageOrt({
      dokumentPfad: DOK,
      bereichsWurzel: WURZEL,
      konfig: { form: 'bereich', ordnername: 'Anlagen' },
    });
    expect(r.ok).toBe(true);
    expect(r.verzeichnis).toBe('C:\\Daten\\Notizen\\Anlagen');
  });

  it('die drei dokumentnahen Formen verhalten sich mit und ohne Bereich gleich', () => {
    for (const form of ['neben', 'fest', 'dokument']) {
      const ohne = loeseAblageOrt({ dokumentPfad: DOK, konfig: { form } });
      const mit = loeseAblageOrt({ dokumentPfad: DOK, bereichsWurzel: WURZEL, konfig: { form } });
      expect(ohne.verzeichnis).toBe(mit.verzeichnis);
    }
  });
});

describe('loeseAblageOrt — Abweisungen (4T-0787)', () => {
  it('ohne gespeichertes Dokument gibt es keinen Ablage-Ort', () => {
    const r = loeseAblageOrt({ dokumentPfad: '', konfig: { form: 'dokument' } });
    expect(r.ok).toBe(false);
    expect(r.grund).toBe('kein-dokument');
  });

  it('auch bei gebundenem Bereich braucht der Verweis ein gespeichertes Dokument', () => {
    const r = loeseAblageOrt({
      dokumentPfad: null,
      bereichsWurzel: WURZEL,
      konfig: { form: 'bereich' },
    });
    expect(r.ok).toBe(false);
    expect(r.grund).toBe('kein-dokument');
  });

  it('der zentrale Bereichs-Ordner ist ohne Bereich nicht auflösbar', () => {
    const r = loeseAblageOrt({ dokumentPfad: DOK, konfig: { form: 'bereich' } });
    expect(r.ok).toBe(false);
    expect(r.grund).toBe('kein-bereich');
  });

  it('ein Ordnername mit Pfad-Segmenten wird abgewiesen', () => {
    for (const ordnername of ['../raus', 'a/b', 'a\\b', '..']) {
      const r = loeseAblageOrt({ dokumentPfad: DOK, konfig: { form: 'fest', ordnername } });
      expect(r.ok).toBe(false);
      expect(r.grund).toBe('ungueltiger-ordnername');
    }
  });

  it('ein Ordnername mit Pfad-Segmenten wird auch im Bereich abgewiesen', () => {
    const r = loeseAblageOrt({
      dokumentPfad: DOK,
      bereichsWurzel: WURZEL,
      konfig: { form: 'bereich', ordnername: '../ausserhalb' },
    });
    expect(r.ok).toBe(false);
    expect(r.grund).toBe('ungueltiger-ordnername');
  });
});

describe('ordnernameAusDokument (4T-0787)', () => {
  it('liefert den Basisnamen ohne Endung', () => {
    expect(ordnernameAusDokument(DOK)).toBe('Protokoll');
    expect(ordnernameAusDokument('C:\\a\\Mein Text.markdown')).toBe('Mein Text');
  });

  it('liefert null, wenn nach der Bereinigung nichts übrig bleibt', () => {
    expect(ordnernameAusDokument('')).toBe(null);
    expect(ordnernameAusDokument(null)).toBe(null);
  });

  it('ein unbrauchbarer Dokumentname fällt in der Auflösung auf den Ordnernamen zurück', () => {
    // Basisname besteht nur aus Punkten: als Ordnername unbrauchbar.
    const r = loeseAblageOrt({
      dokumentPfad: 'C:\\Daten\\Notizen\\...md',
      konfig: { form: 'dokument', ordnername: 'Anlagen' },
    });
    expect(r.ok).toBe(true);
    expect(r.verzeichnis).toBe('C:\\Daten\\Notizen\\Anlagen');
  });
});

describe('erzeugeAnlagenNamen (4T-0787)', () => {
  const ZEIT = new Date(2026, 6, 29, 14, 30, 22); // 2026-07-29 14:30:22 lokal

  it('setzt Dokumentname, Unterstrich und Datum-Uhrzeit zusammen', () => {
    expect(erzeugeAnlagenNamen({ dokumentPfad: DOK, endung: 'png', zeitpunkt: ZEIT })).toBe(
      'Protokoll_20260729-143022.png',
    );
  });

  it('führende Punkte der Endung werden nicht verdoppelt', () => {
    expect(erzeugeAnlagenNamen({ dokumentPfad: DOK, endung: '.jpg', zeitpunkt: ZEIT })).toBe(
      'Protokoll_20260729-143022.jpg',
    );
  });

  it('ohne brauchbaren Dokumentnamen bleibt der Zeitstempel allein', () => {
    expect(erzeugeAnlagenNamen({ dokumentPfad: '', endung: 'png', zeitpunkt: ZEIT })).toBe(
      '20260729-143022.png',
    );
  });
});

describe('bereinigeDateinamen (4T-0787)', () => {
  it('behält die eigene Endung und ergänzt keine', () => {
    expect(bereinigeDateinamen('Bericht.pdf')).toBe('Bericht.pdf');
    expect(bereinigeDateinamen('Ohne-Endung')).toBe('Ohne-Endung');
  });

  it('reduziert einen Pfad auf den nackten Dateinamen', () => {
    expect(bereinigeDateinamen('C:\\Quelle\\Bericht.pdf')).toBe('Bericht.pdf');
  });

  it('entfernt verbotene Zeichen und weist Unbrauchbares ab', () => {
    expect(bereinigeDateinamen('Be?ri*cht.pdf')).toBe('Bericht.pdf');
    expect(bereinigeDateinamen('..')).toBe(null);
    expect(bereinigeDateinamen('   ')).toBe(null);
  });
});

describe('freierDateiname (4T-0787)', () => {
  const VZ = 'C:\\Ziel';
  const machExistiert = (vorhanden) => (p) => vorhanden.includes(p);

  it('ein freier Name bleibt unverändert', () => {
    const name = freierDateiname({ verzeichnis: VZ, name: 'Bild.png', existiert: () => false });
    expect(name).toBe('Bild.png');
  });

  it('bei Kollision wird ein Zähler angehängt, nie überschrieben', () => {
    const name = freierDateiname({
      verzeichnis: VZ,
      name: 'Bild.png',
      existiert: machExistiert(['C:\\Ziel\\Bild.png']),
    });
    expect(name).toBe('Bild-2.png');
  });

  it('der Zähler zählt weiter, solange Namen belegt sind', () => {
    const name = freierDateiname({
      verzeichnis: VZ,
      name: 'Bild.png',
      existiert: machExistiert([
        'C:\\Ziel\\Bild.png',
        'C:\\Ziel\\Bild-2.png',
        'C:\\Ziel\\Bild-3.png',
      ]),
    });
    expect(name).toBe('Bild-4.png');
  });

  it('der Zähler steht vor der Endung, nicht dahinter', () => {
    const name = freierDateiname({
      verzeichnis: VZ,
      name: 'Bericht.tar.gz',
      existiert: machExistiert(['C:\\Ziel\\Bericht.tar.gz']),
    });
    expect(name).toBe('Bericht.tar-2.gz');
  });

  it('eine dauerhaft belegte Namensmenge endet an der Obergrenze statt in einer Schleife', () => {
    expect(freierDateiname({ verzeichnis: VZ, name: 'Bild.png', existiert: () => true })).toBe(
      null,
    );
  });
});

describe('istAusfuehrbareEndung (4T-0790)', () => {
  it('erkennt die Endungen, die beim Öffnen Code ausführen', () => {
    for (const name of [
      'setup.exe',
      'start.bat',
      'lauf.cmd',
      'skript.ps1',
      'verweis.lnk',
      'paket.msi',
      'makro.vbs',
      'seite.hta',
      'schluessel.reg',
    ]) {
      expect(istAusfuehrbareEndung(`C:\\Ziel\\${name}`)).toBe(true);
    }
  });

  it('lässt gewöhnliche Anlagen unbehelligt', () => {
    for (const name of ['bild.png', 'bericht.pdf', 'tabelle.xlsx', 'notiz.md', 'archiv.zip']) {
      expect(istAusfuehrbareEndung(`C:\\Ziel\\${name}`)).toBe(false);
    }
  });

  it('die Groß-/Kleinschreibung der Endung ist egal', () => {
    expect(istAusfuehrbareEndung('C:\\Ziel\\Setup.EXE')).toBe(true);
    expect(istAusfuehrbareEndung('C:\\Ziel\\Start.Bat')).toBe(true);
  });

  it('ohne Endung und bei ungültiger Eingabe gilt nicht-ausführbar', () => {
    expect(istAusfuehrbareEndung('C:\\Ziel\\ohneEndung')).toBe(false);
    expect(istAusfuehrbareEndung('')).toBe(false);
    expect(istAusfuehrbareEndung(null)).toBe(false);
  });
});

describe('verweisPfad (4T-0787)', () => {
  it('liefert den Pfad relativ zum Dokument mit Vorwärts-Schrägstrichen', () => {
    expect(
      verweisPfad({
        dokumentPfad: DOK,
        zielPfad: 'C:\\Daten\\Notizen\\Projekte\\Protokoll\\a.png',
      }),
    ).toBe('Protokoll/a.png');
  });

  it('ein Ziel oberhalb des Dokument-Ordners bekommt den Aufstieg', () => {
    expect(verweisPfad({ dokumentPfad: DOK, zielPfad: 'C:\\Daten\\Notizen\\Anlagen\\a.png' })).toBe(
      '../Anlagen/a.png',
    );
  });

  it('eine Anlage neben dem Dokument braucht kein Verzeichnis im Verweis', () => {
    expect(
      verweisPfad({ dokumentPfad: DOK, zielPfad: 'C:\\Daten\\Notizen\\Projekte\\a.png' }),
    ).toBe('a.png');
  });
});
