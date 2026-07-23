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
