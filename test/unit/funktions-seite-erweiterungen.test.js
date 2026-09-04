// 4T-000941 (Story 4S-000455): Die generierte Funktions-Seite kennzeichnet die
// Einträge abgeschalteter Erweiterungen, statt sie wegzulassen.
//
// Beide Richtungen stehen hier, weil eine einseitige Prüfung nichts wert wäre:
// Eine Marke, die immer erscheint, ist so falsch wie eine, die nie erscheint.
// Dazu die Zusage, dass der Aufruf ohne Zustand unverändert bleibt — daran
// hängt der Web-Bau, der keinen Erweiterungs-Zustand kennt.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  generateFunctionsPage,
  HELP_FEATURE_GROUPS,
} from '../../src/shared/manual/manual-generated.js';
import { allExtensions } from '../../src/shared/extensions/extensions.js';
import { disabledFeatureKeySet } from '../../src/shared/extensions/extensions-core.js';
// 4T-001181: Positivliste des Kerns und die reine Zuordnungs-Prüfung.
import { KERN_ZEILEN, zuordnungsBefunde } from './funktions-seite-kern.js';

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

  // 4T-001098: die Gegenrichtung. Ein Katalog-Schlüssel ohne Gruppe erscheint
  // nie auf der generierten Funktions-Seite — der Anwender sieht die Funktion
  // im Handbuch nicht, obwohl sie ausgeliefert ist, und kein Gate meldet es.
  // Die Prüfung als reine Funktion, damit die Gegenprobe darunter belegt, dass
  // sie einen fehlenden und einen doppelten Schlüssel wirklich findet (L11).
  function gruppenBefunde(schluessel, gruppen) {
    const zaehlung = new Map();
    for (const g of gruppen)
      for (const f of g.features) zaehlung.set(f, (zaehlung.get(f) || 0) + 1);
    return {
      ohne: schluessel.filter((k) => !zaehlung.has(k)),
      doppelt: [...zaehlung].filter(([, n]) => n > 1).map(([k]) => k),
    };
  }

  it('findet einen fehlenden und einen doppelten Schlüssel (Gegenprobe der Erkennung)', () => {
    const gruppen = [
      { features: ['help.feature.a', 'help.feature.b'] },
      { features: ['help.feature.b'] },
    ];
    const b = gruppenBefunde(['help.feature.a', 'help.feature.b', 'help.feature.c'], gruppen);
    expect(b.ohne).toEqual(['help.feature.c']);
    expect(b.doppelt).toEqual(['help.feature.b']);
  });

  it('jeder Katalog-Schlüssel des Wörterbuchs steht in genau einer Gruppe (4T-001098)', () => {
    const dict = JSON.parse(
      fs.readFileSync(new URL('../../src/i18n/de.json', import.meta.url), 'utf8'),
    );
    const schluessel = Object.keys(dict).filter((k) => k.startsWith('help.feature.'));
    expect(schluessel.length).toBeGreaterThan(100);
    const b = gruppenBefunde(schluessel, HELP_FEATURE_GROUPS);
    expect(
      b.ohne,
      `Katalog-Schlüssel ohne Gruppe — in HELP_FEATURE_GROUPS ` +
        `(src/shared/manual/manual-feature-groups.js) einer Gruppe zuordnen: ${b.ohne.join(', ')}`,
    ).toEqual([]);
    expect(
      b.doppelt,
      `Katalog-Schlüssel in mehr als einer Gruppe — jede Zeile genau einmal: ${b.doppelt.join(', ')}`,
    ).toEqual([]);
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

// 4T-001181: Die Gegenrichtung als allgemeine Regel. Der Wächter oben prüft,
// dass jede Erweiterung überhaupt eine Zeile nennt und jede genannte existiert;
// er schweigt, wenn eine Erweiterung um Katalog-Zeilen wächst, ohne sie zu
// nennen — genau so rutschten die vier Profil-Zeilen durch. Seither hat jede
// Katalog-Zeile genau eine Antwort: eine Erweiterung oder der Kern
// (Positivliste in funktions-seite-kern.js). Scharf ab dem ersten Lauf, weil
// die Erst-Zuordnung der 196 Zeilen mit diesem Vorgang vollständig ist; eine
// Grandfathering-Liste hätte nur das Vergessen vertagt.
describe('Funktions-Seite: jede Katalog-Zeile hat genau eine Zuordnung (4T-001181)', () => {
  const katalog = HELP_FEATURE_GROUPS.flatMap((g) => g.features);

  it('Gegenprobe der Erkennung: ohne Antwort, zwei Antworten, veralteter Kern-Eintrag', () => {
    const erweiterungen = [
      { id: 'a', descKey: 'help.feature.a' },
      { id: 'b', descKey: 'extension.b.description', featureKeys: ['help.feature.b'] },
      { id: 'c', descKey: 'help.feature.b' },
    ];
    const b = zuordnungsBefunde(
      ['help.feature.a', 'help.feature.b', 'help.feature.k', 'help.feature.x'],
      erweiterungen,
      ['help.feature.k', 'help.feature.b', 'help.feature.alt'],
    );
    expect(b.ohneAntwort).toEqual(['help.feature.x']);
    expect(b.zweiAntworten).toEqual(['help.feature.b']);
    expect(b.veraltet).toEqual(['help.feature.alt']);
    expect(b.doppeltGedeckt).toEqual(['help.feature.b']);
  });

  it('AK1/AK2: keine Katalog-Zeile ohne Antwort, keine mit zwei, kein veralteter Kern-Eintrag', () => {
    const b = zuordnungsBefunde(katalog, allExtensions(), KERN_ZEILEN);
    expect(
      b.ohneAntwort,
      `Katalog-Zeilen ohne Zuordnung — in der Registry (featureKeys) nennen oder in ` +
        `test/unit/funktions-seite-kern.js als Kern führen: ${b.ohneAntwort.join(', ')}`,
    ).toEqual([]);
    expect(
      b.zweiAntworten,
      `Katalog-Zeilen, die eine Erweiterung nennt UND die Kern-Liste führt: ${b.zweiAntworten.join(', ')}`,
    ).toEqual([]);
    expect(
      b.veraltet,
      `Kern-Einträge ohne Katalog-Zeile — aus funktions-seite-kern.js streichen: ${b.veraltet.join(', ')}`,
    ).toEqual([]);
    expect(b.doppeltGedeckt, 'eine Zeile gehört genau einer Erweiterung').toEqual([]);
  });

  it('die Kern-Liste ist dupliktfrei und trägt nur Katalog-Schlüssel', () => {
    expect(new Set(KERN_ZEILEN).size).toBe(KERN_ZEILEN.length);
    expect(KERN_ZEILEN.every((k) => k.startsWith('help.feature.'))).toBe(true);
  });
});
