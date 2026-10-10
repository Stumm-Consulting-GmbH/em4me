// 4T-000946 (Story 4S-000005, Befund B-12): Erkennung von Pfaden auf Netz-Freigaben.
//
// Beide Zugangswege gehoeren geprueft: Der UNC-Pfad verraet sich am Praefix,
// das gemappte Laufwerk nur ueber seine Laufwerksart. Eine Erkennung, die
// allein den Pfad ansieht, deckte den halben Fall ab — und genau diese Haelfte
// ist die, die im Alltag benutzt wird.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  istUncPfad,
  laufwerkVon,
  istNetzPfad,
  watchOptionenFuer,
  ermittleNetzLaufwerke,
  beiErmittlung,
  NETZ_ABFRAGE_MS,
  DRIVE_REMOTE,
  _setNetzLaufwerkeFuerTest,
  _setLaufwerksKanalFuerTest,
  _setPlattformFuerTest,
} from '../../src/main/documents/network-paths.js';

// 4T-001250 (Epic 3E-000124): Das GEMAPPTE Netzlaufwerk ist ein Windows-Begriff —
// es hat einen Laufwerksbuchstaben, und den gibt es anderswo nicht. Die
// beiden Faelle darunter sind auf einer Plattform ohne Laufwerksbuchstaben
// deshalb GEGENSTANDSLOS und nicht etwa falsch geschrieben; die Anwendung
// selbst fuehrt dort dieselbe bewusste Luecke (Plattform-Gate in
// network-paths.js, PO-Entscheidung vom 2026-08-25 zur Plattform-Analyse Q5:
// eine Mount-Erkennung je Plattform entsteht erst bei Bedarf).
//
// Die UNC-Erkennung darunter bleibt ueberall scharf: Sie liest ein Praefix
// und braucht kein Dateisystem.
const istWindows = process.platform === 'win32';

afterEach(() => {
  _setNetzLaufwerkeFuerTest(null);
  _setLaufwerksKanalFuerTest(undefined);
  _setPlattformFuerTest(undefined);
  vi.restoreAllMocks();
});

describe('netz-pfade: UNC-Erkennung', () => {
  it('erkennt beide Schreibweisen des UNC-Praefixes', () => {
    expect(istUncPfad('\\\\DATEISERVER\\Firma\\Datei.md')).toBe(true);
    expect(istUncPfad('//DATEISERVER/Firma/Datei.md')).toBe(true);
  });

  it('haelt lokale Pfade auseinander', () => {
    expect(istUncPfad('C:\\Users\\test\\Datei.md')).toBe(false);
    expect(istUncPfad('')).toBe(false);
    expect(istUncPfad(null)).toBe(false);
  });

  it('erkennt den UNC-Pfad ohne jede Laufwerks-Liste', () => {
    _setNetzLaufwerkeFuerTest(null);
    expect(istNetzPfad('\\\\DATEISERVER\\Firma\\Datei.md')).toBe(true);
  });
});

describe('netz-pfade: Laufwerksbuchstabe', () => {
  it('liest den Buchstaben und normalisiert ihn', () => {
    expect(laufwerkVon('c:\\Users\\Datei.md')).toBe('C');
    expect(laufwerkVon('V:/Freigabe/Datei.md')).toBe('V');
  });

  it('liefert null, wo es keinen gibt', () => {
    expect(laufwerkVon('\\\\Server\\Freigabe\\Datei.md')).toBe(null);
    expect(laufwerkVon('')).toBe(null);
  });

  it.skipIf(!istWindows)('erkennt ein gemapptes Netzlaufwerk als Netz-Pfad', () => {
    _setNetzLaufwerkeFuerTest(['V', 'H']);
    expect(istNetzPfad('V:\\Freigabe\\Datei.md')).toBe(true);
    expect(istNetzPfad('h:/Freigabe/Datei.md')).toBe(true);
    expect(istNetzPfad('C:\\Users\\Datei.md')).toBe(false);
  });

  // Fail-safe zugunsten des heutigen Verhaltens: Solange die Liste fehlt,
  // laeuft die Beobachtung wie bisher; nachgezogen wird, sobald sie vorliegt.
  it('gilt ohne Laufwerks-Liste als nicht-Netz', () => {
    _setNetzLaufwerkeFuerTest(null);
    expect(istNetzPfad('V:\\Freigabe\\Datei.md')).toBe(false);
  });
});

describe('netz-pfade: Beobachtungs-Optionen', () => {
  it.skipIf(!istWindows)('schaltet den Abfrage-Betrieb nur auf Netz-Pfaden ein', () => {
    _setNetzLaufwerkeFuerTest(['V']);
    expect(watchOptionenFuer('C:\\Users\\Datei.md')).toEqual({});
    expect(watchOptionenFuer('V:\\Freigabe\\Datei.md')).toEqual({
      usePolling: true,
      interval: NETZ_ABFRAGE_MS,
      binaryInterval: NETZ_ABFRAGE_MS,
    });
    expect(watchOptionenFuer('\\\\Server\\Freigabe\\Datei.md').usePolling).toBe(true);
  });

  it('haelt den Abfrage-Abstand in der gemessenen Groessenordnung', () => {
    // Begruendung im Modul-Kopf: lokale Reaktionszeit rund 280 ms, gemessene
    // Reaktion auf der Freigabe 270 bis 700 ms, Last 0,4 Prozent bei 20 Dateien.
    expect(NETZ_ABFRAGE_MS).toBeGreaterThanOrEqual(500);
    expect(NETZ_ABFRAGE_MS).toBeLessThanOrEqual(2000);
  });
});

// 4T-001991 (Epic 3E-000188): Die Laufwerksart kommt direkt von Windows
// (GetLogicalDrives, GetDriveTypeW) statt aus einer PowerShell, die bei jedem
// Start Dateien ausserhalb des Daten-Ordners hinterliess. Geprueft wird mit
// eingeschobenem Aufruf-Kanal; die Plattform steht fest auf Windows, damit
// die Faelle auf jeder Plattform denselben Weg messen.
describe('netz-pfade: Laufwerks-Ermittlung ueber den Aufruf-Kanal', () => {
  // Maske mit gesetzten Bits je Laufwerksbuchstabe (A = Bit 0).
  const maskeFuer = (...buchstaben) =>
    buchstaben.reduce((m, b) => m | (1 << (b.charCodeAt(0) - 65)), 0);

  // Wartet, bis die nachgelagerte Ermittlung gelaufen ist.
  const ermittlungAbwarten = () => new Promise((fertig) => setImmediate(fertig));

  function kanal(maske, arten) {
    const gefragt = [];
    return {
      gefragt,
      logischeLaufwerke: () => maske,
      laufwerksArt: (wurzel) => {
        gefragt.push(wurzel);
        return arten[wurzel] ?? 3;
      },
    };
  }

  it('erkennt ein Netzlaufwerk an seiner Laufwerksart', async () => {
    _setPlattformFuerTest('win32');
    const k = kanal(maskeFuer('C', 'E', 'H'), { 'E:\\': DRIVE_REMOTE, 'H:\\': 2 });
    _setLaufwerksKanalFuerTest(k);
    const erhalten = [];
    beiErmittlung((liste) => erhalten.push([...liste].sort()));
    await ermittlungAbwarten();
    expect(erhalten).toEqual([['E']]);
    expect(k.gefragt).toEqual(['C:\\', 'E:\\', 'H:\\']);
  });

  it.skipIf(!istWindows)('stuetzt die Pfad-Erkennung auf das Ergebnis', async () => {
    _setPlattformFuerTest('win32');
    _setLaufwerksKanalFuerTest(kanal(maskeFuer('C', 'E'), { 'E:\\': DRIVE_REMOTE }));
    ermittleNetzLaufwerke();
    await ermittlungAbwarten();
    expect(istNetzPfad('E:\\Freigabe\\Datei.md')).toBe(true);
    expect(istNetzPfad('C:\\Users\\Datei.md')).toBe(false);
  });

  it('liefert die leere Menge, wenn kein Laufwerk ein Netzlaufwerk ist', async () => {
    _setPlattformFuerTest('win32');
    _setLaufwerksKanalFuerTest(kanal(maskeFuer('C', 'D'), {}));
    const erhalten = [];
    beiErmittlung((liste) => erhalten.push(liste.size));
    await ermittlungAbwarten();
    expect(erhalten).toEqual([0]);
  });

  it('warnt und bleibt bei der leeren Menge, wenn der Kanal wirft', async () => {
    _setPlattformFuerTest('win32');
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    _setLaufwerksKanalFuerTest({
      logischeLaufwerke: () => {
        throw new Error('kernel32 nicht erreichbar');
      },
      laufwerksArt: () => DRIVE_REMOTE,
    });
    const erhalten = [];
    beiErmittlung((liste) => erhalten.push(liste.size));
    await ermittlungAbwarten();
    expect(erhalten).toEqual([0]);
    expect(warnung).toHaveBeenCalledTimes(1);
    expect(String(warnung.mock.calls[0][1])).toContain('kernel32 nicht erreichbar');
  });

  it('wertet eine leere Maske als Scheitern der Abfrage', async () => {
    _setPlattformFuerTest('win32');
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    _setLaufwerksKanalFuerTest(kanal(0, {}));
    const erhalten = [];
    beiErmittlung((liste) => erhalten.push(liste.size));
    await ermittlungAbwarten();
    expect(erhalten).toEqual([0]);
    expect(warnung).toHaveBeenCalledTimes(1);
  });

  // Wer anmeldet, erwartet die spaetere Ausfuehrung: Der Beobachter meldet
  // seinen Rueckruf an, waehrend er selbst noch eingerichtet wird.
  it('ruft einen Rueckruf nie im Aufruf-Stapel seiner Anmeldung', async () => {
    _setPlattformFuerTest('win32');
    _setLaufwerksKanalFuerTest(kanal(maskeFuer('C', 'E'), { 'E:\\': DRIVE_REMOTE }));
    const reihenfolge = [];
    beiErmittlung(() => reihenfolge.push('rueckruf'));
    reihenfolge.push('nach der Anmeldung');
    expect(istNetzPfad('E:\\Freigabe\\Datei.md')).toBe(false);
    await ermittlungAbwarten();
    expect(reihenfolge).toEqual(['nach der Anmeldung', 'rueckruf']);
  });

  it('fragt nur einmal, auch bei mehreren Anstoessen', async () => {
    _setPlattformFuerTest('win32');
    const k = kanal(maskeFuer('C'), {});
    const abfragen = vi.spyOn(k, 'logischeLaufwerke');
    _setLaufwerksKanalFuerTest(k);
    ermittleNetzLaufwerke();
    ermittleNetzLaufwerke();
    beiErmittlung(() => {});
    await ermittlungAbwarten();
    ermittleNetzLaufwerke();
    await ermittlungAbwarten();
    expect(abfragen).toHaveBeenCalledTimes(1);
  });

  it('fragt auf anderen Plattformen nicht und liefert die leere Menge', async () => {
    _setPlattformFuerTest('linux');
    const k = kanal(maskeFuer('E'), { 'E:\\': DRIVE_REMOTE });
    const abfragen = vi.spyOn(k, 'logischeLaufwerke');
    _setLaufwerksKanalFuerTest(k);
    const erhalten = [];
    beiErmittlung((liste) => erhalten.push(liste.size));
    await ermittlungAbwarten();
    expect(erhalten).toEqual([0]);
    expect(abfragen).not.toHaveBeenCalled();
  });
});
