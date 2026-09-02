// 4T-001288: Waechter ueber die Kosten und die Semantik der Pfad-Form der
// Wiki-Link-Aufloesung (resolveWikiLinkDetailed, src/main/index/resolve.js).
//
// Anlass: Die Pfad-Form ([[Ordner/Name]]) lief linear ueber alle Dateien des
// Index, je Aufruf — im migrierten Obsidian-Bestand (879 Pfad-Links, 6483
// Dateien) blockierte das den UI-Thread des Hauptprozesses je
// Backlinks-Anfrage sekundenlang (Analyse 4T-001287, CPU-Profil). Seit 4T-001288
// loest eine lazy gebaute Suffix-Map auf; dieser Test sichert beides:
//
// 1. KOSTEN: Die Datei-Menge wird hoechstens einmal je Map-Aufbau iteriert —
//    gemessen ueber einen Zaehl-Proxy auf entry.files (Aufruf-Schranke statt
//    Zeitmessung, damit der Test auf jeder Maschine stabil ist). Nach einer
//    Invalidierung (Pfad-Menge geaendert) ist genau ein weiterer Aufbau
//    erlaubt.
// 2. SEMANTIK: identisch zum frueheren fileKey.endsWith('/' + wanted) —
//    Segment-genau, case-insensitiv, NFC-normalisiert; der volle Pfad ohne
//    fuehrendes '/' matcht wie zuvor nicht; die Namens- und die
//    Unterseiten-Form bleiben unberuehrt.
import { describe, it, expect } from 'vitest';
import { resolveWikiLinkDetailed } from '../../src/main/index/resolve.js';

// Minimales entry-Objekt der Index-Struktur (lifecycle.js): fuer die
// Pfad-Form braucht der Resolver files, nameMap und pathSuffixMap.
function baueEntry(pfade) {
  const files = new Map(pfade.map((p) => [p, []]));
  return { files, nameMap: new Map(), pathSuffixMap: null };
}

// Zaehl-Proxy: registriert jeden Zugriff auf files.keys() — das ist die
// einzige Stelle, an der ein Voll-Scan beginnen kann.
function mitZaehler(entry) {
  const zaehler = { keys: 0 };
  const original = entry.files;
  entry.files = new Proxy(original, {
    get(ziel, eigenschaft) {
      if (eigenschaft === 'keys') zaehler.keys += 1;
      const wert = ziel[eigenschaft];
      return typeof wert === 'function' ? wert.bind(ziel) : wert;
    },
  });
  return zaehler;
}

describe('Pfad-Form der Wiki-Link-Aufloesung (4T-001288)', () => {
  const PFADE = [
    'C:\\wurzel\\62 CRM\\Stammdaten\\1 Firmen\\Familie.md',
    'C:\\wurzel\\99 Archiv\\1 Firmen\\Familie.md',
    'C:\\wurzel\\42 Wissen\\Familie.md',
    'C:\\wurzel\\11 Tagebuch\\2026\\2026-08-28.md',
  ];

  it('loest Segment-Suffixe wie das fruehere endsWith-Kriterium auf', () => {
    const entry = baueEntry(PFADE);
    const eins = resolveWikiLinkDetailed(entry, '1 Firmen/Familie');
    expect(eins.pathMatches.sort()).toEqual([PFADE[0], PFADE[1]].sort());
    const tief = resolveWikiLinkDetailed(entry, 'Stammdaten/1 Firmen/Familie');
    expect(tief.pathMatches).toEqual([PFADE[0]]);
    // Case-insensitiv wie normalizeNameKey.
    const gross = resolveWikiLinkDetailed(entry, 'stammdaten/1 firmen/familie');
    expect(gross.pathMatches).toEqual([PFADE[0]]);
    // Kein Segment-Bruch: 'irmen/Familie' ist kein Segment-Suffix.
    const bruch = resolveWikiLinkDetailed(entry, 'irmen/Familie');
    expect(bruch.pathMatches).toEqual([]);
  });

  it('matcht den vollen Pfad ohne fuehrendes Segment wie zuvor nicht', () => {
    const entry = baueEntry(PFADE);
    // Der komplette normalisierte Pfad hat kein fuehrendes '/', das
    // endsWith('/' + wanted) verlangte — die Suffix-Map enthaelt ihn deshalb
    // bewusst nicht.
    const voll = resolveWikiLinkDetailed(entry, 'c:/wurzel/42 wissen/familie');
    expect(voll.pathMatches).toEqual([]);
  });

  it('iteriert die Datei-Menge hoechstens einmal je Map-Aufbau (Kosten-Schranke)', () => {
    const entry = baueEntry(PFADE);
    const zaehler = mitZaehler(entry);

    resolveWikiLinkDetailed(entry, '1 Firmen/Familie');
    expect(zaehler.keys).toBe(1); // Lazy-Aufbau

    for (let i = 0; i < 50; i += 1) resolveWikiLinkDetailed(entry, '1 Firmen/Familie');
    resolveWikiLinkDetailed(entry, 'Stammdaten/1 Firmen/Familie');
    expect(zaehler.keys).toBe(1); // kein weiterer Scan, egal wie oft

    entry.pathSuffixMap = null; // Invalidierung wie in build.js
    resolveWikiLinkDetailed(entry, '1 Firmen/Familie');
    expect(zaehler.keys).toBe(2); // genau ein Neuaufbau
  });

  it('laesst die Namens-Form die Datei-Menge gar nicht anfassen', () => {
    const entry = baueEntry(PFADE);
    entry.nameMap.set('familie', new Set([PFADE[2]]));
    const zaehler = mitZaehler(entry);
    const d = resolveWikiLinkDetailed(entry, 'Familie');
    expect(d.nameMatches).toEqual([PFADE[2]]);
    expect(zaehler.keys).toBe(0);
  });
});
