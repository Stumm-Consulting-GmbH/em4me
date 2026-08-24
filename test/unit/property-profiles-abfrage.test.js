// 4T-1176 (Epic 3E-0220, E7): Unit-Tests der erzeugten Abfrage je Profil.
//
// Zwei Prüf-Arten stehen hier nebeneinander, und beide werden gebraucht. Die
// erste sieht sich den erzeugten TEXT an — sie hält fest, dass kein
// Zuordnungs-Weg fehlt und dass der konfigurierte Feldname genommen wird. Die
// zweite parst den Text und wertet ihn gegen erfundene Dateien aus: Nur sie
// zeigt, dass die Abfrage dieselben Dateien findet wie die Auflösung, aus der
// sie stammt. Ein Text-Vergleich allein hätte den Groß-/Kleinschreibungs-Fall
// von `startswith` nie gefangen — er sieht in beiden Fassungen richtig aus.
import { describe, it, expect } from 'vitest';
import {
  erzeugeProfilAbfrage,
  ordnerTrifft,
  normalizeBindings,
} from '../../src/shared/property-profiles.js';
import {
  HINWEIS_ZUORDNUNGS_FELD,
  alsTextLiteral,
  zuordnungsFeldAnsprechbar,
} from '../../src/shared/property-profiles-abfrage.js';
import { parseQuery } from '../../src/shared/query/perspective-query.js';
import { matchesQuery } from '../../src/shared/query/perspective-query-eval.js';

// Eine Datei, wie die Abfrage sie sieht: Frontmatter-Properties (Schlüssel
// klein, Werte Strings oder String-Listen — so liefert sie der Index) plus die
// impliziten Datei-Felder.
function datei({ props = {}, folder = '', tags = [] } = {}) {
  return { props, file: { name: 'X', folder, path: `${folder}/X.md`, tags }, now: Date.now() };
}

// Erzeugen, parsen und gegen eine Datei auswerten — der Weg, den auch die
// Anwendung nimmt.
function trifft(abfrage, ctx) {
  const geparst = parseQuery(abfrage.text);
  expect(geparst.ok, `Syntaxfehler in der erzeugten Abfrage:\n${abfrage.text}`).toBe(true);
  return matchesQuery(geparst.ast, ctx);
}

describe('erzeugeProfilAbfrage — Umfang der Wege (4T-1176, AK2/AK8)', () => {
  const bindings = normalizeBindings([
    { profile: 'Projekt', tags: ['projekt'], folders: ['10 Projekte'] },
  ]);

  it('erfasst Zuordnungs-Feld, Schlagwort- und Ordner-Bindung', () => {
    const { text } = erzeugeProfilAbfrage({ profil: 'Projekt', bindings });
    expect(text).toBe(
      'LIST\nWHERE class = "Projekt"\n' +
        '  OR icontains(file.tags, "projekt")\n' +
        '  OR (file.folder = "10 Projekte" OR startswith(lower(file.folder), "10 projekte/"))',
    );
  });

  it('nimmt den konfigurierten Namen des Zuordnungs-Feldes, nicht den Vorgabe-Namen (AK8)', () => {
    const { text } = erzeugeProfilAbfrage({ profil: 'Projekt', assignField: 'typ' });
    expect(text).toContain('typ = "Projekt"');
    expect(text).not.toContain('class');
  });

  it('macht aus jeder Bindung einen eigenen ODER-Zweig, ohne Doppelte', () => {
    const mehrfach = normalizeBindings([
      { profile: 'Projekt', tags: ['projekt'], folders: ['10 Projekte'] },
      { profile: 'Projekt', tags: ['projekt', 'vorhaben'], folders: ['20 Kunden/Aktiv'] },
      { profile: 'Anderes', tags: ['fremd'], folders: ['30 Fremd'] },
    ]);
    const { text } = erzeugeProfilAbfrage({ profil: 'Projekt', bindings: mehrfach });
    expect(text.match(/icontains/g)).toHaveLength(2);
    expect(text).toContain('"vorhaben"');
    expect(text).toContain('"20 Kunden/Aktiv"');
    // Die Bindungen eines anderen Profils gehen die Abfrage nichts an.
    expect(text).not.toContain('fremd');
    expect(text).not.toContain('30 Fremd');
  });

  it('kommt ohne Bindungen mit dem Zuordnungs-Feld allein aus', () => {
    const { text } = erzeugeProfilAbfrage({ profil: 'Projekt' });
    expect(text).toBe('LIST\nWHERE class = "Projekt"');
  });

  it('liefert null ohne Profil-Namen', () => {
    expect(erzeugeProfilAbfrage({ profil: '  ' })).toBeNull();
    expect(erzeugeProfilAbfrage({})).toBeNull();
  });
});

describe('erzeugte Abfrage findet dieselben Dateien wie die Auflösung (4T-1176, AK2)', () => {
  const bindings = normalizeBindings([
    { profile: 'Projekt', tags: ['projekt'], folders: ['10 Projekte'] },
  ]);
  const abfrage = erzeugeProfilAbfrage({ profil: 'Projekt', bindings });

  it('findet die Datei über das Zuordnungs-Feld — als Einzelwert wie als Liste', () => {
    expect(trifft(abfrage, datei({ props: { class: 'Projekt' } }))).toBe(true);
    expect(trifft(abfrage, datei({ props: { class: ['Notiz', 'Projekt'] } }))).toBe(true);
    // Die Auflösung vergleicht Profil-Namen ohne Rücksicht auf Groß- und
    // Kleinschreibung; die Abfrage tut es ebenso.
    expect(trifft(abfrage, datei({ props: { class: 'projekt' } }))).toBe(true);
  });

  it('findet die Datei über das Schlagwort', () => {
    expect(trifft(abfrage, datei({ tags: ['projekt'] }))).toBe(true);
    expect(trifft(abfrage, datei({ tags: ['Projekt'] }))).toBe(true);
  });

  it('lässt eine Datei ohne jeden Weg außen vor', () => {
    expect(trifft(abfrage, datei({ props: { class: 'Notiz' }, tags: ['notiz'] }))).toBe(false);
  });

  it('verwechselt einen Namens-Anfang nicht mit dem Profil', () => {
    // Ein `contains` auf dem Zuordnungs-Feld fände hier fälschlich einen
    // Treffer — der Grund, warum die Erzeugung Gleichheit nimmt.
    expect(trifft(abfrage, datei({ props: { class: 'Projektleiter' } }))).toBe(false);
    // Dasselbe auf der Schlagwort-Seite: ein Unter-Schlagwort ist ein anderes
    // Schlagwort, und die Bindung trifft es nicht.
    expect(trifft(abfrage, datei({ tags: ['projekt/intern'] }))).toBe(false);
  });
});

// AK3: die Ordner-Bedingung gegen ihren Maßstab. Geprüft wird nicht der Text,
// sondern die WIRKUNG — Fall für Fall dieselbe Antwort wie `ordnerTrifft`.
describe('Ordner-Bedingung ist gleichlautend mit ordnerTrifft (4T-1176, AK3)', () => {
  const bindung = '10 Projekte';
  const abfrage = erzeugeProfilAbfrage({
    profil: 'Projekt',
    bindings: normalizeBindings([{ profile: 'Projekt', folders: [bindung] }]),
  });

  const faelle = [
    ['der gebundene Ordner selbst', '10 Projekte'],
    ['ein Unterordner', '10 Projekte/Kunde A'],
    ['ein tiefer Unterordner', '10 Projekte/Kunde A/2026'],
    ['abweichende Groß-/Kleinschreibung', '10 projekte/kunde a'],
    ['ein Nachbar mit gemeinsamem Namens-Anfang', '10 Projekte Archiv'],
    ['ein Unterordner dieses Nachbarn', '10 Projekte Archiv/Alt'],
    ['ein fremder Ordner', '20 Kunden'],
    ['die Bereichs-Wurzel', ''],
  ];

  for (const [was, ordner] of faelle) {
    it(`urteilt gleich über ${was}`, () => {
      expect(trifft(abfrage, datei({ folder: ordner }))).toBe(ordnerTrifft(bindung, ordner));
    });
  }

  it('erfasst den Ordner und seine Unterordner, aber nicht den Namens-Nachbarn', () => {
    // Die Gegenprobe oben wäre auch dann grün, wenn beide Seiten gemeinsam
    // falsch lägen; deshalb steht das erwartete Urteil hier ausdrücklich.
    expect(ordnerTrifft(bindung, '10 Projekte/Kunde A')).toBe(true);
    expect(ordnerTrifft(bindung, '10 Projekte Archiv')).toBe(false);
  });
});

describe('Standard-Profil des Bereichs (4T-1176, AK4)', () => {
  it('fragt über alle Dokumente des Bereichs', () => {
    const { text } = erzeugeProfilAbfrage({
      profil: 'Notiz',
      defaultProfile: 'Notiz',
      bindings: normalizeBindings([{ profile: 'Notiz', tags: ['notiz'] }]),
    });
    expect(text).toBe('LIST');
  });

  it('erfasst damit auch eine Datei ohne jede Zuordnung', () => {
    const abfrage = erzeugeProfilAbfrage({ profil: 'Notiz', defaultProfile: 'Notiz' });
    expect(trifft(abfrage, datei({ folder: '99 Sonstiges' }))).toBe(true);
  });

  it('vergleicht den Namen ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(erzeugeProfilAbfrage({ profil: 'notiz', defaultProfile: 'Notiz' }).text).toBe('LIST');
  });

  it('lässt ein anderes Profil unberührt', () => {
    const { text } = erzeugeProfilAbfrage({ profil: 'Projekt', defaultProfile: 'Notiz' });
    expect(text).toBe('LIST\nWHERE class = "Projekt"');
  });
});

// AK7: Die Abfrage nennt die Dokumente, für die genau dieses Profil aufgelöst
// wird. Ein erbendes Profil trägt die Felder des Eltern-Profils, ist aber
// nicht dasselbe — seine Dokumente bleiben außen vor.
describe('Vererbung bleibt außen vor (4T-1176, AK7)', () => {
  const abfrage = erzeugeProfilAbfrage({
    profil: 'Projekt',
    bindings: normalizeBindings([
      { profile: 'Projekt', tags: ['projekt'] },
      { profile: 'Kunde', tags: ['kunde'] },
    ]),
  });

  it('nennt das Kind-Profil an keiner Stelle', () => {
    expect(abfrage.text).not.toContain('Kunde');
    expect(abfrage.text).not.toContain('kunde');
  });

  it('findet ein Dokument des Kind-Profils nicht', () => {
    expect(trifft(abfrage, datei({ props: { class: 'Kunde' }, tags: ['kunde'] }))).toBe(false);
  });
});

describe('Zuordnungs-Feldname, den die Sprache nicht ansprechen kann (4T-1176)', () => {
  it('erkennt die drei Ausschluss-Gründe', () => {
    expect(zuordnungsFeldAnsprechbar('class')).toBe(true);
    expect(zuordnungsFeldAnsprechbar('parent-categories')).toBe(true);
    expect(zuordnungsFeldAnsprechbar('Ärger')).toBe(true);
    // Leerzeichen: Syntaxfehler am Fence.
    expect(zuordnungsFeldAnsprechbar('meine Klasse')).toBe(false);
    // Reserviertes Wort der Ausdrucks-Ebene.
    expect(zuordnungsFeldAnsprechbar('in')).toBe(false);
    expect(zuordnungsFeldAnsprechbar('NOT')).toBe(false);
    // Reine Zahl: parst anstandslos, wird aber als Zahl ausgewertet und
    // trifft deshalb nie — der einzige der drei Fälle, den man dem
    // erzeugten Text nicht ansieht.
    expect(zuordnungsFeldAnsprechbar('2024')).toBe(false);
  });

  it('meldet den Fall als Hinweis, lässt den Zweig aber stehen', () => {
    const { text, hinweise } = erzeugeProfilAbfrage({
      profil: 'Projekt',
      assignField: 'meine Klasse',
    });
    expect(hinweise).toEqual([HINWEIS_ZUORDNUNGS_FELD]);
    // Ein sichtbar kaputter Text ist besser als ein still fehlender Zweig:
    // Wer die Meldung liest, sieht die Stelle und kann sie berichtigen.
    expect(text).toContain('meine Klasse = "Projekt"');
  });

  it('schweigt bei einem ansprechbaren Namen', () => {
    expect(erzeugeProfilAbfrage({ profil: 'Projekt', assignField: 'typ' }).hinweise).toEqual([]);
  });
});

describe('Text-Literale ohne Escape-Sequenzen (4T-1176)', () => {
  it('nimmt das doppelte Anführungszeichen als Regelfall', () => {
    expect(alsTextLiteral('Projekt')).toBe('"Projekt"');
  });

  it('weicht auf das einfache aus, sobald der Wert ein doppeltes trägt', () => {
    // Die Sprache kennt keine Escape-Sequenzen; ein Literal läuft bis zum
    // nächsten gleichen Anführungszeichen.
    expect(alsTextLiteral('Der "Fall"')).toBe('\'Der "Fall"\'');
  });

  it('bleibt bei einem Wert mit beiden Arten beim doppelten', () => {
    // Dafür gibt es keine gültige Darstellung. Der Fence zeigt dann einen
    // Syntaxfehler — sichtbar kaputt statt still unvollständig.
    expect(alsTextLiteral(`beides " und '`)).toBe(`"beides " und '"`);
  });

  it('bleibt auch bei einem Anführungszeichen im Ordner-Pfad parsbar', () => {
    const abfrage = erzeugeProfilAbfrage({
      profil: 'Projekt',
      bindings: normalizeBindings([{ profile: 'Projekt', folders: ['10 "Projekte"'] }]),
    });
    expect(parseQuery(abfrage.text).ok).toBe(true);
  });
});
