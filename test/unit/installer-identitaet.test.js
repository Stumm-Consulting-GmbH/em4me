// 4T-1005: Wächter der Installer-Identität. Der Windows-Installer leitet
// seine Registrierungs-Identität per UUIDv5 aus der appId ab; eine geänderte
// appId installiert parallel statt zu aktualisieren (realer Vorfall beim
// Hauptrelease 1: appId-Wechsel in 4T-0905, die 0.105.0-Installation blieb
// als zweiter Eintrag stehen). appId und Produktname sind deshalb
// eingefroren; eine bewusste Änderung braucht eine Product-Owner-Entscheidung
// und einen Migrations-Pfad im Installer (Entwicklungsrichtlinien,
// Abschnitt 12). Der dritte Fall hält den Aufräum-Anker für den Alt-Eintrag
// der früheren appId im Installer-Skript fest.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const wurzel = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(wurzel, 'package.json'), 'utf8'));

describe('Installer-Identität (4T-1005)', () => {
  it('appId ist eingefroren', () => {
    expect(pkg.build.appId).toBe('net.stumm.em4me');
  });

  it('Produktname ist eingefroren', () => {
    expect(pkg.build.productName).toBe('EM4me');
  });

  it('der Installer räumt den Alt-Eintrag der früheren appId auf', () => {
    const nsh = readFileSync(path.join(wurzel, 'build', 'installer.nsh'), 'utf8');
    // UUIDv5 von net.stumm.perspective-markdown im Namensraum des Bau-Werkzeugs
    expect(nsh).toContain('ad498cc2-6de3-53e6-b6c0-7fba67d55371');
  });
});
