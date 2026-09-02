// 4T-000941 (Story 4S-000455): Die generierte Funktions-Seite kennzeichnet die
// Einträge abgeschalteter Erweiterungen, statt sie wegzulassen.
//
// Beide Richtungen stehen hier, weil eine einseitige Prüfung nichts wert wäre:
// Eine Marke, die immer erscheint, ist so falsch wie eine, die nie erscheint.
// Dazu die Zusage, dass der Aufruf ohne Zustand unverändert bleibt — daran
// hängt der Web-Bau, der keinen Erweiterungs-Zustand kennt.
import { describe, it, expect } from 'vitest';
import {
  generateFunctionsPage,
  HELP_FEATURE_GROUPS,
} from '../../src/shared/manual/manual-generated.js';
import { allExtensions } from '../../src/shared/extensions/extensions.js';
import { disabledFeatureKeySet } from '../../src/shared/extensions/extensions-core.js';

// Übersetzung, die den Schlüssel zurückgibt: So bleibt der Fall unabhängig von
// den Texten und misst allein die Struktur.
const t = (k) => k;

function zeileZu(seite, featureKey) {
  const name = featureKey.replace('help.feature.', '');
  return seite.split('\n').find((z) => z.startsWith(`| **help.featureName.${name}**`));
}

describe('Funktions-Seite: Kennzeichnung abgeschalteter Erweiterungen', () => {
  it('kennzeichnet die Zeile einer abgeschalteten Erweiterung und behält sie', () => {
    const seite = generateFunctionsPage(t, {
      disabledFeatureKeys: new Set(['help.feature.callouts']),
    });
    const zeile = zeileZu(seite, 'help.feature.callouts');
    expect(zeile).toBeTruthy();
    expect(zeile).toContain('manual.functions.disabledMark');
    // Die Beschreibung bleibt stehen: Wer die Funktion sucht, soll sie lesen.
    expect(zeile).toContain('help.feature.callouts');
    expect(zeile).toContain('help.featureAccess.callouts');
  });

  it('lässt die Zeile einer eingeschalteten Erweiterung unverändert', () => {
    const seite = generateFunctionsPage(t, {
      disabledFeatureKeys: new Set(['help.feature.callouts']),
    });
    const zeile = zeileZu(seite, 'help.feature.highlight');
    expect(zeile).toBeTruthy();
    expect(zeile).not.toContain('manual.functions.disabledMark');
  });

  it('bleibt ohne übergebenen Zustand zeichengleich zum Aufruf mit leerer Menge', () => {
    expect(generateFunctionsPage(t)).toBe(
      generateFunctionsPage(t, { disabledFeatureKeys: new Set() }),
    );
    expect(generateFunctionsPage(t)).not.toContain('manual.functions.disabledMark');
  });
});

describe('Funktions-Seite: Zuordnung Erweiterung zu Katalog-Zeile', () => {
  const katalog = new Set(HELP_FEATURE_GROUPS.flatMap((g) => g.features));

  // Ohne diese Regel bliebe eine neue gebündelte Erweiterung still ohne
  // Zuordnung: Ihre Zeilen erschienen im Aus-Zustand unmarkiert, und niemand
  // merkte es. Der Wächter macht das Vergessen sichtbar.
  it('jede Erweiterung ist einer Katalog-Zeile zugeordnet', () => {
    const ohne = allExtensions()
      .filter((m) => !String(m.descKey || '').startsWith('help.feature.'))
      .filter((m) => !Array.isArray(m.featureKeys) || m.featureKeys.length === 0)
      .map((m) => m.id);
    expect(ohne).toEqual([]);
  });

  it('jeder zugeordnete Schlüssel steht wirklich im Katalog', () => {
    const unbekannt = [];
    for (const m of allExtensions()) {
      for (const k of m.featureKeys || []) {
        if (!katalog.has(k)) unbekannt.push(`${m.id}: ${k}`);
      }
    }
    expect(unbekannt).toEqual([]);
  });

  it('eine abgeschaltete Erweiterung liefert die Schlüssel ihrer Zeilen', () => {
    const keys = disabledFeatureKeySet(['figures']);
    expect(keys.has('help.feature.imageSize')).toBe(true);
    expect(keys.has('help.feature.implicitFigures')).toBe(true);
    expect(keys.has('help.feature.callouts')).toBe(false);
  });

  it('nimmt abhängige Erweiterungen mit, wie der Schalter selbst', () => {
    // Erinnerungen hängen an Aufgaben; wird jene abgeschaltet, sind auch die
    // Zeilen der abhängigen Erweiterung nicht mehr wirksam.
    const keys = disabledFeatureKeySet(['tasks']);
    expect(keys.has('help.feature.taskMarkers')).toBe(true);
    expect(keys.has('help.feature.reminders')).toBe(true);
  });

  // 4T-001180 (Epic 3E-000221): Die Erweiterung der Eigenschafts-Profile nennt
  // ihre Katalog-Zeilen **vollständig**.
  //
  // Der Fall steht hier namentlich und nicht als allgemeine Regel, weil genau
  // das der Befund war: Die Liste entstand in der Stufe 3 und nannte nur deren
  // beide Zeilen; vier ältere fehlten und blieben im Aus-Zustand
  // ungekennzeichnet — die Funktions-Seite behauptete dort vier Funktionen,
  // die es dann nicht gibt. Der Wächter darüber prüft nur, dass jeder
  // genannte Schlüssel **existiert**, nicht dass keiner **fehlt**; die
  // allgemeine Prüfung verlangt eine Durchsicht des ganzen Katalogs und läuft
  // als eigener Vorgang (4T-001181).
  const PROFIL_ZEILEN = [
    'help.feature.propertyProfiles',
    'help.feature.profileInheritance',
    'help.feature.profileBulkFill',
    'help.feature.profileValueSources',
    'help.feature.profileBindings',
    'help.feature.profileFieldForm',
    'help.feature.profileQuery',
  ];

  it('AK1: die Profil-Erweiterung nennt alle ihre Katalog-Zeilen', () => {
    const profil = allExtensions().find((m) => m.id === 'property-profiles');
    expect(profil).toBeTruthy();
    // Die Grundzeile trägt der descKey, die übrigen die featureKeys-Liste.
    const abgedeckt = new Set([profil.descKey, ...(profil.featureKeys || [])]);
    const fehlend = PROFIL_ZEILEN.filter((k) => !abgedeckt.has(k));
    expect(fehlend).toEqual([]);
  });

  it('AK2: im Aus-Zustand tragen alle Profil-Zeilen die Kennzeichnung', () => {
    const seite = generateFunctionsPage(t, {
      disabledFeatureKeys: disabledFeatureKeySet(['property-profiles']),
    });
    const ohneMarke = [];
    for (const key of PROFIL_ZEILEN) {
      const zeile = zeileZu(seite, key);
      // Fehlt die Zeile ganz, ist das ebenso ein Befund wie eine ohne Marke.
      if (!zeile || !zeile.includes('manual.functions.disabledMark')) ohneMarke.push(key);
    }
    expect(ohneMarke).toEqual([]);
  });

  it('AK2: im An-Zustand trägt keine von ihnen eine Kennzeichnung', () => {
    // Die Gegenprobe: Eine Marke, die immer erscheint, wäre so falsch wie
    // eine, die nie erscheint.
    const seite = generateFunctionsPage(t, { disabledFeatureKeys: new Set() });
    for (const key of PROFIL_ZEILEN) {
      expect(zeileZu(seite, key)).not.toContain('manual.functions.disabledMark');
    }
  });
});
