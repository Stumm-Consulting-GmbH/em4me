// 4T-0299 (Epic 3E-0053): Manifest-Modell und API-Versionierung der
// externen Erweiterungen (src/shared/extensions-external.js) plus die
// dynamische Registrierung an der Erweiterungs-Registry
// (src/shared/extensions.js, Herkunfts-Kennzeichnung 'external').
import { describe, it, expect, afterEach } from 'vitest';
import {
  EXTENSION_API_VERSION,
  parseVersion,
  isApiVersionCompatible,
  validateExternalManifest,
  normalizeEnabledIds,
  normalizeTrustedMap,
  normalizeErrorMap,
  externalExtensionStatus,
} from '../../src/shared/extensions-external.js';
import {
  allExtensions,
  extensionById,
  internalExtensions,
  isExtensionEnabled,
  registerExternalExtension,
  unregisterExternalExtension,
} from '../../src/shared/extensions.js';

const VALID_MANIFEST = {
  id: 'beispiel',
  name: 'Beispiel-Erweiterung',
  version: '1.0.0',
  apiVersion: '1.0',
  entry: 'main.js',
  markdownPlugin: 'markdown.js',
};

describe('extensions-external: Versionierung (4T-0299)', () => {
  it('parseVersion akzeptiert major[.minor[.patch]]', () => {
    expect(parseVersion('1')).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('v1.0')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
    expect(parseVersion(1)).toBeNull();
  });

  it('Kompatibilität: gleiche Major, deklarierte Minor nicht neuer als die App', () => {
    expect(isApiVersionCompatible('1.0', '1.0.0')).toBe(true);
    expect(isApiVersionCompatible('1', '1.2.0')).toBe(true);
    expect(isApiVersionCompatible('1.2', '1.0.0')).toBe(false);
    expect(isApiVersionCompatible('2.0', '1.0.0')).toBe(false);
    expect(isApiVersionCompatible('0.9', '1.0.0')).toBe(false);
    expect(isApiVersionCompatible('quatsch', '1.0.0')).toBe(false);
  });

  it('die App-API-Version selbst ist gültig und mit sich kompatibel', () => {
    expect(parseVersion(EXTENSION_API_VERSION)).not.toBeNull();
    expect(isApiVersionCompatible(EXTENSION_API_VERSION)).toBe(true);
  });
});

describe('extensions-external: Manifest-Validierung (4T-0299)', () => {
  it('gültiges Manifest passiert ohne Fehler', () => {
    expect(validateExternalManifest(VALID_MANIFEST, 'beispiel')).toEqual([]);
  });

  it('ID muss dem Verzeichnisnamen entsprechen (Pfad-Bindung)', () => {
    const errors = validateExternalManifest(VALID_MANIFEST, 'anderes-verzeichnis');
    expect(errors.some((e) => e.includes('Verzeichnisnamen'))).toBe(true);
  });

  it('Pflichtfelder und Formate werden geprüft', () => {
    expect(validateExternalManifest(null)).toHaveLength(1);
    expect(validateExternalManifest({})).not.toEqual([]);
    expect(validateExternalManifest({ ...VALID_MANIFEST, id: 'Großes-ID' }, undefined)).not.toEqual(
      [],
    );
    expect(validateExternalManifest({ ...VALID_MANIFEST, version: 'neu' })).not.toEqual([]);
    expect(validateExternalManifest({ ...VALID_MANIFEST, apiVersion: '' })).not.toEqual([]);
  });

  it('Einstiegs-Dateien sind schlichte .js-Dateinamen (keine Pfade)', () => {
    expect(validateExternalManifest({ ...VALID_MANIFEST, entry: '../boese.js' })).not.toEqual([]);
    expect(validateExternalManifest({ ...VALID_MANIFEST, entry: 'unter/ordner.js' })).not.toEqual(
      [],
    );
    expect(validateExternalManifest({ ...VALID_MANIFEST, entry: 'haupt.txt' })).not.toEqual([]);
  });

  it('mindestens entry oder markdownPlugin ist Pflicht', () => {
    const nurRender = { ...VALID_MANIFEST };
    delete nurRender.entry;
    expect(validateExternalManifest(nurRender)).toEqual([]);
    const keins = { ...nurRender };
    delete keins.markdownPlugin;
    expect(validateExternalManifest(keins)).not.toEqual([]);
  });
});

describe('extensions-external: Zustands-Normalisierung und Status (4T-0299)', () => {
  it('normalizeEnabledIds verwirft Fremdes und Duplikate', () => {
    expect(normalizeEnabledIds(['a', 'a', 'B', 7, 'b-c'])).toEqual(['a', 'b-c']);
    expect(normalizeEnabledIds('quatsch')).toEqual([]);
  });

  it('normalizeTrustedMap und normalizeErrorMap prüfen Form', () => {
    expect(normalizeTrustedMap({ a: '1.0', b: 'x', C: '1.0' })).toEqual({ a: '1.0' });
    expect(normalizeErrorMap({ a: 'kaputt', b: '', c: 5 })).toEqual({ a: 'kaputt' });
  });

  it('externalExtensionStatus deckt alle Zustände ab', () => {
    const entry = { ok: true, manifest: VALID_MANIFEST };
    expect(externalExtensionStatus({ ok: false }, [], {})).toBe('invalid');
    expect(
      externalExtensionStatus(
        { ok: true, manifest: { ...VALID_MANIFEST, apiVersion: '2.0' } },
        ['beispiel'],
        {},
      ),
    ).toBe('incompatible');
    expect(externalExtensionStatus(entry, [], {})).toBe('inactive');
    expect(externalExtensionStatus(entry, ['beispiel'], {})).toBe('confirm');
    expect(externalExtensionStatus(entry, ['beispiel'], { beispiel: '0.9' })).toBe('confirm');
    expect(externalExtensionStatus(entry, ['beispiel'], { beispiel: '1.0.0' })).toBe('active');
    expect(
      externalExtensionStatus(entry, ['beispiel'], { beispiel: '1.0.0' }, { beispiel: 'kaputt' }),
    ).toBe('error');
  });
});

describe('Registry-Anbindung externer Erweiterungen (4T-0299)', () => {
  afterEach(() => {
    unregisterExternalExtension('beispiel');
  });

  it('registriert mit Herkunft external und eigener Kategorie', () => {
    const manifest = registerExternalExtension({
      id: 'beispiel',
      name: 'Beispiel-Erweiterung',
      description: 'Demo',
    });
    expect(manifest.origin).toBe('external');
    expect(manifest.category).toBe('external');
    expect(extensionById('beispiel')).toBe(manifest);
    expect(allExtensions()).toContain(manifest);
    // internalExtensions bleibt unberührt (Einstellungs-Bereich intern).
    expect(internalExtensions().some((m) => m.id === 'beispiel')).toBe(false);
    // Registrierte externe IDs sind keine Kern-IDs mehr: der interne
    // Disabled-Mechanismus kennt sie (isExtensionEnabled arbeitet einheitlich).
    expect(isExtensionEnabled('beispiel', [])).toBe(true);
  });

  it('ID-Kollision mit interner Erweiterung wirft (Lade-Fehler beim Host)', () => {
    expect(() => registerExternalExtension({ id: 'katex', name: 'Fremd-KaTeX' })).toThrow();
  });

  it('Re-Registrierung ersetzt, Abmeldung entfernt', () => {
    registerExternalExtension({ id: 'beispiel', name: 'Alt' });
    registerExternalExtension({ id: 'beispiel', name: 'Neu' });
    expect(allExtensions().filter((m) => m.id === 'beispiel')).toHaveLength(1);
    expect(extensionById('beispiel').name).toBe('Neu');
    expect(unregisterExternalExtension('beispiel')).toBe(true);
    expect(extensionById('beispiel')).toBeNull();
    expect(unregisterExternalExtension('beispiel')).toBe(false);
  });
});
