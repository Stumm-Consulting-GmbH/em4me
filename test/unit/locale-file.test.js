// 4T-001593 (Story 4S-000905, Epic 3E-000129): Wächter über die Prüfung einer
// eingespielten Sprachdatei (src/shared/locale-file.js).
//
// Eine eingespielte Datei ist fremde Eingabe, aus der nutzersichtbarer Text
// wird; die Prüfung ist die Sicherheits-Zusicherung des Epics, und dieser
// Wächter ist ihr Nachweis. Er misst deshalb je Verstoßart einen eigenen Fall
// UND die Gegenrichtung: dass eine gültige Übersetzung nicht abgewiesen wird.
// Ohne die zweite Hälfte wäre eine Prüfung, die alles ablehnt, grün.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pruefeSprachdatei,
  kennungAusMetadaten,
  buildLocaleTemplate,
  schreibeSprachdatei,
  konstrukteVon,
  zielErlaubt,
  META_LOCALE,
  META_NAME,
  MAX_NAME_LAENGE,
  MAX_BYTES,
} from '../../src/shared/locale-file.js';
import { LOCALE_CODES } from '../../src/shared/locales.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EN = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'src', 'i18n', 'en.json'), 'utf8'),
);

// Ein Schlüssel mit schlichtem Text, einer mit Platzhalter, einer mit Code-Span
// und einer mit Link — aus dem ECHTEN Bestand gesucht statt behauptet. Eine
// Vorbelegung, die eine Form behauptet, statt sie aus dem Gegenstand zu
// gewinnen, kann einen Fehler nicht finden, weil sie ihn teilt (Lehre aus
// 4T-001588, Fehlerklasse L10/U2).
const schlicht = Object.keys(EN).find(
  (k) => konstrukteVon(EN[k]).size === 0 && !/\{/.test(EN[k]) && EN[k].length > 5,
);
const mitPlatzhalter = Object.keys(EN).find((k) => /\{[a-zA-Z0-9_]+\}/.test(EN[k]));
const mitCode = Object.keys(EN).find((k) => konstrukteVon(EN[k]).has('code'));
const mitLink = Object.keys(EN).find((k) => konstrukteVon(EN[k]).has('link'));

// Jede gültige Prüf-Datei trägt ihre Identität in sich; die Fälle, die genau
// daran rütteln, bauen ihr Objekt selbst.
const datei = (werte) => schreibeSprachdatei('nds', 'Plattdüütsch', werte);
const pruefe = (text) => pruefeSprachdatei(text, EN, LOCALE_CODES);

describe('Prüfung eingespielter Sprachdateien (4T-001593)', () => {
  it('die Vorbelegung stammt aus dem echten Bestand', () => {
    expect(schlicht, 'kein schlichter Schlüssel gefunden').toBeTruthy();
    expect(mitPlatzhalter, 'kein Schlüssel mit Platzhalter gefunden').toBeTruthy();
    expect(mitCode, 'kein Schlüssel mit Code-Span gefunden').toBeTruthy();
    expect(mitLink, 'kein Schlüssel mit Link gefunden').toBeTruthy();
  });

  // --- Die Gegenrichtung zuerst: was durchgehen MUSS ------------------------

  it('nimmt eine gültige Übersetzung an und liefert ihre Identität mit', () => {
    const e = pruefe(
      datei({
        [schlicht]: 'Ein ganz gewöhnlicher übersetzter Satz.',
        [mitPlatzhalter]: EN[mitPlatzhalter].replace(/[A-Za-z]{4,}/, 'Oeversett'),
      }),
    );
    expect(e.ok).toBe(true);
    expect(e.code).toBe('nds');
    expect(e.name).toBe('Plattdüütsch');
    expect(e.id).toBe('custom:nds');
    expect(e.werte[schlicht]).toBe('Ein ganz gewöhnlicher übersetzter Satz.');
    // Die Metadaten sind keine Übersetzung: Sie stehen weder in den Werten
    // noch unter den unbekannten Schlüsseln.
    expect(e.werte[META_LOCALE]).toBeUndefined();
    expect(e.werte[META_NAME]).toBeUndefined();
    expect(e.uebersprungen).toEqual([]);
  });

  it('nimmt eine unvollständige Datei an — fehlende Schlüssel sind der Regelfall', () => {
    const e = pruefe(datei({ [schlicht]: 'Nur disse een.' }));
    expect(e.ok).toBe(true);
    expect(Object.keys(e.werte)).toEqual([schlicht]);
  });

  it('erlaubt eine Auszeichnung, die das Original an dieser Stelle führt', () => {
    // Mehr Code-Spans als das Original sind zulässig: geprüft wird die Art,
    // nicht die Anzahl.
    expect(pruefe(datei({ [mitCode]: 'Nimm `een` oder `twee`.' })).ok).toBe(true);
  });

  it('erlaubt einen Regions-Zusatz im Sprach-Code', () => {
    const e = pruefe(schreibeSprachdatei('nds-DE', 'Plattdüütsch', { [schlicht]: 'x y z' }));
    expect(e.ok).toBe(true);
    expect(e.code).toBe('nds-DE');
  });

  // --- Identität der Sprache (Anordnung des Product Owners, 2026-09-09) -----

  it('weist eine Datei ohne Sprach-Code ab', () => {
    const ohneCode = JSON.stringify({ [META_NAME]: 'Plattdüütsch', [schlicht]: 'x y z' });
    expect(pruefe(ohneCode)).toMatchObject({ ok: false, error: 'locale-fehlt' });
    // Die frisch ausgegebene Vorlage trägt beide Felder LEER — sie ist damit
    // absichtlich noch nicht einspielbar, und der Anwender erfährt genau das.
    expect(pruefe(buildLocaleTemplate(EN))).toMatchObject({ ok: false, error: 'locale-fehlt' });
  });

  it('weist eine Datei ohne Sprach-Namen ab', () => {
    const ohneName = JSON.stringify({ [META_LOCALE]: 'nds', [schlicht]: 'x y z' });
    expect(pruefe(ohneName)).toMatchObject({ ok: false, error: 'name-fehlt' });
  });

  it('weist einen ungültigen Sprach-Code ab', () => {
    for (const code of ['n', 'deutsch-plattdeutsch-nord-region', '../../etc', 'de_DE', '12']) {
      expect(
        pruefe(schreibeSprachdatei(code, 'Name', { [schlicht]: 'x y z' })),
        code,
      ).toMatchObject({ ok: false, error: 'locale-ungueltig' });
    }
  });

  it('weist einen Code ab, der einer mitgelieferten Sprache gehört', () => {
    // Eine eigene Sprache tritt NEBEN die mitgelieferten, sie ersetzt keine.
    for (const code of LOCALE_CODES) {
      expect(
        pruefe(schreibeSprachdatei(code, 'Meine Fassung', { [schlicht]: 'x y z' })),
        code,
      ).toMatchObject({ ok: false, error: 'locale-belegt' });
    }
  });

  it('weist einen überlangen Sprach-Namen ab', () => {
    const lang = 'N'.repeat(MAX_NAME_LAENGE + 1);
    expect(pruefe(schreibeSprachdatei('nds', lang, { [schlicht]: 'x y z' }))).toMatchObject({
      ok: false,
      error: 'name-zu-lang',
    });
  });

  it('kennungAusMetadaten liest Code und Namen aus dem Objekt', () => {
    const e = kennungAusMetadaten({ [META_LOCALE]: ' nds ', [META_NAME]: ' Plattdüütsch ' }, []);
    expect(e).toMatchObject({ ok: true, id: 'custom:nds', code: 'nds', name: 'Plattdüütsch' });
  });

  // --- Verstöße, je Art ein Fall -------------------------------------------

  it('weist ungültiges JSON ab', () => {
    expect(pruefe('{ kein json')).toMatchObject({ ok: false, error: 'kein-json' });
  });

  it('weist eine Liste oder null als Wurzel ab', () => {
    expect(pruefe('[]')).toMatchObject({ ok: false, error: 'kein-objekt' });
    expect(pruefe('null')).toMatchObject({ ok: false, error: 'kein-objekt' });
  });

  it('weist Nicht-Zeichenketten ab: Zahl, null, Wahrheitswert, Objekt', () => {
    for (const wert of [42, null, true, { tief: 'nein' }]) {
      expect(pruefe(datei({ [schlicht]: wert })), JSON.stringify(wert)).toMatchObject({
        ok: false,
        error: 'wert-kein-text',
        schluessel: schlicht,
      });
    }
  });

  it('weist einen fehlenden Platzhalter ab und nennt den Schlüssel', () => {
    expect(pruefe(datei({ [mitPlatzhalter]: 'Ahn jeden Platzholler.' }))).toMatchObject({
      ok: false,
      error: 'platzhalter',
      schluessel: mitPlatzhalter,
    });
  });

  it('weist einen erfundenen und einen umbenannten Platzhalter ab', () => {
    expect(pruefe(datei({ [mitPlatzhalter]: EN[mitPlatzhalter] + ' {zusatz}' }))).toMatchObject({
      ok: false,
      error: 'platzhalter',
    });
    const umbenannt = EN[mitPlatzhalter].replace(/\{([a-zA-Z0-9_]+)\}/, '{anders}');
    expect(pruefe(datei({ [mitPlatzhalter]: umbenannt }))).toMatchObject({
      ok: false,
      error: 'platzhalter',
    });
  });

  it('weist eine Auszeichnung ab, die das Original nicht führt', () => {
    // Der Kern der Sicherheits-Zusicherung: ein Link in einem Schlüssel, der
    // im Original schlichter Text ist, erschiene in der generierten
    // Handbuch-Seite als echter Link.
    const e = pruefe(datei({ [schlicht]: 'Kiek [hier](https://example.org).' }));
    expect(e).toMatchObject({ ok: false, error: 'auszeichnung', schluessel: schlicht });
    expect(e.detail).toContain('link');
  });

  it('weist Bild, Fettung, Überschrift, Liste, HTML und Wiki-Verweis ab', () => {
    const faelle = {
      bild: '![x](https://example.org/x.png)',
      fett: 'Ganz **wichtig** hier.',
      ueberschrift: '# Oeverschrift',
      liste: '- een Punkt',
      html: 'Text mit <b>Tag</b>.',
      wikiLink: 'Kiek [[Siet]].',
    };
    for (const [art, wert] of Object.entries(faelle)) {
      expect(pruefe(datei({ [schlicht]: wert })), `${art} kam durch`).toMatchObject({
        ok: false,
        error: 'auszeichnung',
      });
    }
  });

  it('weist ein javascript:-Ziel ab, auch wo das Original einen Link führt', () => {
    // Die Erlaubnis gilt der ART des Konstrukts, nie einem beliebigen Ziel.
    const e = pruefe(datei({ [mitLink]: 'Kiek [hier](javascript:alert(1)).' }));
    expect(e).toMatchObject({ ok: false, error: 'link-ziel', schluessel: mitLink });
  });

  it('weist eine Datei ohne einen einzigen bekannten Schlüssel ab', () => {
    expect(pruefe(datei({ 'gibt.es.nicht': 'x' }))).toMatchObject({
      ok: false,
      error: 'keine-bekannten-schluessel',
    });
  });

  it('überspringt unbekannte Schlüssel und meldet sie', () => {
    const e = pruefe(datei({ [schlicht]: 'Gellt.', 'alt.entfallen': 'Rest einer alten Fassung' }));
    expect(e.ok).toBe(true);
    expect(e.uebersprungen).toEqual(['alt.entfallen']);
    expect(e.werte['alt.entfallen']).toBeUndefined();
  });

  it('weist eine absurd große Datei ab, ohne sie zu parsen', () => {
    const gross = '{"a":"' + 'x'.repeat(MAX_BYTES + 10) + '"}';
    expect(pruefe(gross)).toMatchObject({ ok: false, error: 'zu-gross' });
  });

  // --- Link-Ziele einzeln ---------------------------------------------------

  it('zielErlaubt lässt die drei Schemata und schemalose Ziele zu', () => {
    for (const ziel of ['https://x.test/a', 'http://x.test', 'mailto:a@b.test', 'seite.md', '#a']) {
      expect(zielErlaubt(ziel), ziel).toBe(true);
    }
  });

  it('zielErlaubt weist Skript- und Daten-Ziele ab', () => {
    for (const ziel of [
      'javascript:alert(1)',
      'JavaScript:x',
      'data:text/html,x',
      'file:///x',
      '',
    ]) {
      expect(zielErlaubt(ziel), ziel).toBe(false);
    }
  });

  // --- Der Rundlauf: Vorlage ausfüllen, einspielen, ablegen ----------------

  it('eine ausgefüllte Vorlage kommt durch die Prüfung und wird identisch abgelegt', () => {
    // Der Weg des Anwenders in einem Fall: Vorlage holen, Metadaten eintragen,
    // einen Text übersetzen, einspielen. Was die Anwendung ablegt, muss die
    // Prüfung erneut bestehen — sonst wäre die abgelegte Datei nicht dieselbe
    // Art Datei wie die eingespielte.
    const vorlage = JSON.parse(buildLocaleTemplate(EN));
    vorlage[META_LOCALE] = 'nds';
    vorlage[META_NAME] = 'Plattdüütsch';
    vorlage[schlicht] = 'Oeversett.';

    const e = pruefe(JSON.stringify(vorlage));
    expect(e.ok).toBe(true);
    expect(e.uebersprungen).toEqual([]);

    const abgelegt = schreibeSprachdatei(e.code, e.name, e.werte);
    const zweiterLauf = pruefe(abgelegt);
    expect(zweiterLauf.ok).toBe(true);
    expect(zweiterLauf.code).toBe('nds');
    expect(zweiterLauf.werte[schlicht]).toBe('Oeversett.');
  });

  it('die Vorlage führt die beiden Metadaten-Felder als erste Einträge', () => {
    const zeilen = buildLocaleTemplate(EN).split('\n');
    expect(zeilen[1]).toContain(META_LOCALE);
    expect(zeilen[2]).toContain(META_NAME);
    // Leer, nicht vorbelegt: Ein Beispiel-Wert bliebe stehen, und dann hiesse
    // jede eingespielte Sprache gleich.
    const geparst = JSON.parse(buildLocaleTemplate(EN));
    expect(geparst[META_LOCALE]).toBe('');
    expect(geparst[META_NAME]).toBe('');
  });
});
