// 4T-0375 (Epic 3E-0070): Unit-Tests der reinen Build-Nummer-Logik
// (Versions-Kopplung, Fallback, Env-Wert, Guard-Vergleich). Git-frei durch
// Injektion des Commit-Counts.
import { describe, it, expect } from 'vitest';
import {
  hasBuildNumberFor,
  computeFullVersion,
  nextBuildNumber,
  buildNumberEnvValue,
  buildNumberGuardError,
  temporaereKennzeichnung,
  zeitstempelFuerBau,
  bauAngaben,
} from '../../src/shared/build-version.js';

describe('hasBuildNumberFor', () => {
  it('true nur bei passender Version und positiver ganzer Nummer', () => {
    expect(hasBuildNumberFor('0.42.0', { version: '0.42.0', buildNumber: 268 })).toBe(true);
    expect(hasBuildNumberFor('0.42.0', { version: '0.41.0', buildNumber: 268 })).toBe(false);
    expect(hasBuildNumberFor('0.42.0', { version: '0.42.0', buildNumber: null })).toBe(false);
    expect(hasBuildNumberFor('0.42.0', { version: '0.42.0', buildNumber: 0 })).toBe(false);
    expect(hasBuildNumberFor('0.42.0', { version: '0.42.0', buildNumber: 1.5 })).toBe(false);
    expect(hasBuildNumberFor('0.42.0', null)).toBe(false);
  });
});

describe('computeFullVersion', () => {
  it('hängt die Nummer nur bei passender Build-Info an', () => {
    expect(computeFullVersion('0.42.0', { version: '0.42.0', buildNumber: 268 })).toBe(
      '0.42.0.268',
    );
  });
  it('fällt bei Versions-Mismatch auf die dreiteilige Version zurück', () => {
    expect(computeFullVersion('0.42.0', { version: '0.41.0', buildNumber: 268 })).toBe('0.42.0');
  });
  it('fällt bei fehlender oder defekter Build-Info auf dreiteilig zurück', () => {
    expect(computeFullVersion('0.42.0', { version: '0.41.0', buildNumber: null })).toBe('0.42.0');
    expect(computeFullVersion('0.42.0', null)).toBe('0.42.0');
    expect(computeFullVersion('0.42.0', {})).toBe('0.42.0');
  });
  // 4T-0921: Beim temporären Bau geht die Kennzeichnung vor. Die Build-Info
  // gehört dort stets zu einer anderen Version, ihre Nummer sagt nichts aus.
  it('zeigt beim temporären Bau die Kennzeichnung mit führendem T', () => {
    expect(
      computeFullVersion('0.105.0-T.202608071130', { version: '0.105.0', buildNumber: 1235 }),
    ).toBe('T-0.105.0-202608071130');
    expect(computeFullVersion('0.105.0-T.202608071130', null)).toBe('T-0.105.0-202608071130');
  });
});

describe('nextBuildNumber', () => {
  it('ist die Commit-Anzahl plus 1 (Release-Commit trägt seine eigene Nummer)', () => {
    expect(nextBuildNumber(267)).toBe(268);
    expect(nextBuildNumber(0)).toBe(1);
  });
});

describe('buildNumberEnvValue', () => {
  it('liefert die Nummer als String bei passender Build-Info', () => {
    expect(buildNumberEnvValue('0.42.0', { version: '0.42.0', buildNumber: 268 })).toBe('268');
  });
  it('liefert null bei Mismatch oder Fallback-Zustand', () => {
    expect(buildNumberEnvValue('0.42.0', { version: '0.41.0', buildNumber: 268 })).toBe(null);
    expect(buildNumberEnvValue('0.42.0', { version: '0.42.0', buildNumber: null })).toBe(null);
    expect(buildNumberEnvValue('0.42.0', null)).toBe(null);
  });
});

// 4T-0921: temporäre Kennzeichnung eines Baus zwischen zwei Releases. Der
// reale Fall vom 2026-08-07 ist der Prüf-Fall: package.json stand auf 0.105.0,
// die Marke v0.105.0 existierte bereits, und der Bau erzeugte trotzdem eine
// Datei mit genau dieser Nummer.
describe('temporaereKennzeichnung', () => {
  it('stellt die Marke T bei der Anzeige an die erste Stelle', () => {
    expect(temporaereKennzeichnung('0.105.0-T.202608071130')).toBe('T-0.105.0-202608071130');
  });
  it('liefert null für gewöhnliche Versions-Angaben', () => {
    expect(temporaereKennzeichnung('0.105.0')).toBe(null);
    expect(temporaereKennzeichnung('0.105.0-vorschau.1')).toBe(null);
    expect(temporaereKennzeichnung('0.105.0-T.2026')).toBe(null);
    expect(temporaereKennzeichnung(null)).toBe(null);
  });
});

describe('zeitstempelFuerBau', () => {
  it('ist zwölfstellig und in lokaler Zeit, mit führenden Nullen', () => {
    expect(zeitstempelFuerBau(new Date(2026, 7, 7, 11, 30))).toBe('202608071130');
    expect(zeitstempelFuerBau(new Date(2026, 0, 3, 4, 5))).toBe('202601030405');
  });
});

describe('bauAngaben', () => {
  const marken = ['v0.104.0', 'v0.105.0'];
  const datum = new Date(2026, 7, 7, 11, 30);

  it('kennzeichnet den Bau temporär, wenn die Versions-Angabe bereits veröffentlicht ist', () => {
    const angaben = bauAngaben('0.105.0', marken, datum);
    expect(angaben.temporaer).toBe(true);
    expect(angaben.version).toBe('0.105.0-T.202608071130');
    expect(angaben.kennzeichnung).toBe('T-0.105.0-202608071130');
    expect(angaben.basis).toBe('0.105.0');
    // Kern der Zusicherung: die veröffentlichte Nummer ist nicht mehr die
    // Identität der Datei, sondern nur noch die genannte Grundlage.
    expect(angaben.version).not.toBe('0.105.0');
  });

  it('nimmt keine nächste Release-Nummer vorweg', () => {
    const angaben = bauAngaben('0.105.0', marken, datum);
    for (const naechste of ['0.105.1', '0.106.0', '1.106.0']) {
      expect(angaben.kennzeichnung).not.toContain(naechste);
      expect(angaben.version).not.toContain(naechste);
    }
  });

  it('lässt den Release-Bau unverändert, solange die Nummer nicht veröffentlicht ist', () => {
    const angaben = bauAngaben('0.106.0', marken, datum);
    expect(angaben.temporaer).toBe(false);
    expect(angaben.version).toBe('0.106.0');
    expect(angaben.kennzeichnung).toBeUndefined();
  });

  it('behandelt das Erst-Release ohne jede Marke als gewöhnlichen Bau', () => {
    expect(bauAngaben('0.1.0', [], datum).temporaer).toBe(false);
  });

  it('bricht ab, wenn die Marken nicht zu ermitteln sind (fail closed)', () => {
    const angaben = bauAngaben('0.105.0', null, datum);
    expect(angaben.befund).toBeTruthy();
    expect(angaben.temporaer).toBeUndefined();
  });
});

describe('buildNumberGuardError', () => {
  it('ist still, wenn Nummer und Commit-Anzahl übereinstimmen (nach Release-Commit)', () => {
    expect(buildNumberGuardError({ version: '0.42.0', buildNumber: 268 }, '0.42.0', 268)).toBe(
      null,
    );
  });
  it('ist still vor dem Release-Commit (Nummer == Commit-Anzahl + 1)', () => {
    // 4T-0396: Die Nummer nimmt den kommenden Release-Commit vorweg, damit die
    // EXE schon vor dem Commit mit korrekter Nummer baubar und testbar ist.
    expect(buildNumberGuardError({ version: '0.42.0', buildNumber: 268 }, '0.42.0', 267)).toBe(
      null,
    );
  });
  it('meldet echte Nachzügler (Abstand größer als 1)', () => {
    const msg = buildNumberGuardError({ version: '0.42.0', buildNumber: 268 }, '0.42.0', 270);
    expect(msg).toBeTruthy();
    expect(msg).toContain('268');
    expect(msg).toContain('270');
  });
  it('bleibt bei Versions-Mismatch oder Fallback-Zustand still (Entwicklungs-Build)', () => {
    expect(buildNumberGuardError({ version: '0.41.0', buildNumber: 268 }, '0.42.0', 500)).toBe(
      null,
    );
    expect(buildNumberGuardError({ version: '0.42.0', buildNumber: null }, '0.42.0', 500)).toBe(
      null,
    );
    expect(buildNumberGuardError(null, '0.42.0', 500)).toBe(null);
  });
});
