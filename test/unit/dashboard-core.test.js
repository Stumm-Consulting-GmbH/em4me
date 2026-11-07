// 4T-002509 (Epic 3E-000402): Unit-Tests des Dashboard-Kerns — Modell,
// Zurückschreiben mit Rohtext-Erhalt, Sicht samt Befund-Codes, Breiten-Rechnung
// und Fundstellen der Fence `perspective-dashboard`.
//
// Grundlage ist die Grammatik der Konzept-Stufe 4T-002506, Kapitel «Lösung»,
// Abschnitte 1 und 3.1. Die Rundlauf-Proben prüfen Byte-Gleichheit, nicht
// Modell-Gleichheit (Story 4S-001182, AK4), und zwar an Eingaben, die eine
// Normalform nicht trifft: Kommentar-Zeilen, Leerzeilen, `\r`, unbekannte
// Marker und Angaben, abweichende Abstände.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DASHBOARD_EXTENSION_ID,
  DASHBOARD_FENCE,
  KACHEL_ARTEN,
  istKommentarZeile,
  parseDashboardFence,
  serializeDashboardFence,
  dashboardSicht,
  findDashboardFences,
  dashboardFenceBlock,
  dashboardGeruest,
} from '../../src/shared/dashboard/dashboard-core.js';
import {
  BREITEN_WOERTER,
  leseBreite,
  kanonischeBreite,
  verteileBreiten,
} from '../../src/shared/dashboard/dashboard-breite.js';

// Das vollständige Beispiel aus Abschnitt 1.8 der Konzept-Stufe, ergänzt um
// einen unbekannten Marker samt Inhalt, eine unbekannte Angabe und einen
// geschützten Inhalt.
const BEISPIEL = [
  '%% Projekt-Überblick, Stand 2026-11 %%',
  '!filter status titel="Status" vorbelegung=offen',
  '!filter prio titel="Priorität"',
  'hoch',
  'mittel',
  'niedrig',
  '',
  '!kachel text breite=ganz',
  '## Projekt-Überblick',
  'Offene Arbeit nach Status und Priorität; Details in [[Projekt-Regeln]].',
  '',
  '!zeile',
  '!kachel kennzahl titel="Offene Aufgaben" breite=drittel',
  'LIST FROM "Aufgaben" WHERE status = $status AND prioritaet = $prio',
  '!kachel kennzahl titel="Aufwand gesamt" breite=drittel',
  'TABLE WITHOUT ID sum(aufwand) AS "Aufwand" FROM "Aufgaben" WHERE status = $status',
  '!kachel kennzahl titel="Je Priorität" breite=drittel',
  'TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE status = $status GROUP BY prioritaet',
  '',
  '!zeile',
  '!kachel balken titel="Aufgaben je Status" breite=halb',
  'TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE prioritaet = $prio GROUP BY status',
  '!kachel kreis titel="Anteil je Kategorie" breite=halb   farbe=rot',
  '%% nur die offenen Kategorien %%',
  'TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE status = $status GROUP BY kategorie',
  '',
  '!ampel a1 grenze="3 Tage"',
  'ein Inhalt, den diese Fassung nicht kennt',
  '!zeile',
  '!kachel tabelle titel="Die zehn ältesten" breite=8/12',
  'TABLE status, prioritaet FROM "Aufgaben" WHERE status = $status SORT file.ctime ASC LIMIT 10',
  '!kachel liste titel="Gemeinsame Abfrage" abfrage="Abfragen/Zuletzt geändert"',
].join('\n');

function rundlauf(text) {
  return serializeDashboardFence(parseDashboardFence(text));
}

function codes(model) {
  return model.errors.map((e) => e.code);
}

function kacheln(sicht) {
  return sicht.zeilen.flatMap((r) => r.kacheln);
}

describe('Dashboard-Kern — Rundlauf byte-gleich (4T-002509, AK1)', () => {
  it('schreibt das vollständige Beispiel unverändert zurück', () => {
    expect(rundlauf(BEISPIEL)).toBe(BEISPIEL);
  });

  it('erhält \\r\\n-Zeilenenden und gemischte Zeilenenden', () => {
    const crlf = BEISPIEL.split('\n').join('\r\n');
    expect(rundlauf(crlf)).toBe(crlf);
    expect(parseDashboardFence(crlf).zeilenende).toBe('\r\n');
    const gemischt = 'x\r\n!zeile\n!kachel text\r\nHallo\n\r\n';
    expect(rundlauf(gemischt)).toBe(gemischt);
  });

  it('erhält Präambel, Leerzeilen am Rand, Abstände und Schutz', () => {
    const texte = [
      '',
      '\n\n',
      'Freitext vor dem ersten Marker\n\n!zeile',
      '!kachel   kennzahl    titel="A"\n\\!= 3\nLIST\n\n\n',
      '!kachel text\n%% nur Kommentar %%\n```\ncode\n```',
      '!= 3\n!zeile ohne=bedeutung\nText',
      '!filter s\n  wert mit Rand  \n\n',
    ];
    for (const text of texte) expect(rundlauf(text)).toBe(text);
  });

  it('führt unbekannte Marker und Angaben im Modell mit', () => {
    const model = parseDashboardFence(BEISPIEL);
    const unbekannt = model.elemente.find((el) => el.art === 'unbekannt');
    expect(unbekannt.marker).toBe('ampel');
    expect(unbekannt.zeile).toBe(27);
    expect(unbekannt.roh.inhalt).toEqual(['ein Inhalt, den diese Fassung nicht kennt']);
    const kreis = model.elemente.find((el) => el.name === 'kreis');
    expect(kreis.attrs.farbe).toBe('rot');
    expect(kreis.attrFolge).toEqual(['titel', 'breite', 'farbe']);
  });

  it('liest das Modell in der Form der Konzept-Stufe (Abschnitt 3.1)', () => {
    const model = parseDashboardFence(BEISPIEL);
    expect(Object.keys(model).sort()).toEqual(['elemente', 'errors', 'praeambel', 'zeilenende']);
    expect(model.praeambel).toEqual(['%% Projekt-Überblick, Stand 2026-11 %%']);
    const el = model.elemente[1];
    expect(el).toMatchObject({
      art: 'filter',
      name: 'prio',
      attrs: { titel: 'Priorität' },
      attrFolge: ['titel'],
      inhalt: 'hoch\nmittel\nniedrig\n',
      geaendert: false,
      zeile: 3,
    });
    expect(el.roh.marker).toBe('!filter prio titel="Priorität"');
    // Der Schutz ist im Modell aufgelöst und im Rohtext erhalten.
    const geschuetzt = parseDashboardFence('!kachel liste\n\\!= 3');
    expect(geschuetzt.elemente[0].inhalt).toBe('!= 3');
    expect(geschuetzt.elemente[0].roh.inhalt).toEqual(['\\!= 3']);
  });

  it('wirft nie, auch nicht bei leerer oder fremder Eingabe', () => {
    for (const eingabe of [undefined, null, '', 42, '!', '!!', '"', '!kachel "offen']) {
      expect(() => rundlauf(eingabe)).not.toThrow();
      expect(() => dashboardSicht(parseDashboardFence(eingabe))).not.toThrow();
    }
    expect(() => dashboardSicht(undefined)).not.toThrow();
  });
});

describe('Dashboard-Kern — geändertes Element kanonisch (4T-002509, AK2)', () => {
  it('schreibt nur die geänderte Kachel neu, alles Übrige wörtlich', () => {
    const model = parseDashboardFence(BEISPIEL);
    const kachel = model.elemente.find((el) => el.attrs.titel === 'Aufwand gesamt');
    kachel.attrs.titel = 'Aufwand';
    kachel.geaendert = true;
    const alt = BEISPIEL.split('\n');
    const neu = serializeDashboardFence(model).split('\n');
    expect(neu).toHaveLength(alt.length);
    const unterschiede = alt.map((z, i) => (z === neu[i] ? null : i)).filter((i) => i !== null);
    expect(unterschiede).toEqual([14]);
    expect(neu[14]).toBe('!kachel kennzahl titel="Aufwand" breite=drittel');
  });

  it('schreibt kanonisch: Abstände, Anführungszeichen, Breite, unbekannte Angaben', () => {
    const model = parseDashboardFence(
      '!kachel   kreis titel=Anteil   breite=6 farbe="rot" abfrage=Ziel extra\nTABLE x',
    );
    model.elemente[0].geaendert = true;
    expect(serializeDashboardFence(model)).toBe(
      '!kachel kreis extra titel="Anteil" breite=6/12 farbe=rot abfrage="Ziel"\nTABLE x',
    );
  });

  it('übernimmt das Zeilenende des Bestands und schützt Inhalts-Zeilen', () => {
    const model = parseDashboardFence('!zeile\r\n!kachel liste\r\nLIST\r\n');
    const kachel = model.elemente[1];
    kachel.inhalt = '!= 3\nLIST';
    kachel.attrs.titel = 'Neu';
    kachel.geaendert = true;
    expect(serializeDashboardFence(model)).toBe(
      '!zeile\r\n!kachel liste titel="Neu"\r\n\\!= 3\r\nLIST\r',
    );
  });

  it('erhält beim Ändern einen Inhalt, der nur aus einer Leerzeile besteht (Befund A4)', () => {
    for (const [rumpf, erwartet] of [
      ['!kachel text titel="A"\n\n!kachel text\nB', '!kachel text titel="B"\n\n!kachel text\nB'],
      ['!zeile\r\n\r\n!kachel text\r\nB', '!zeile\r\n\r\n!kachel text\r\nB'],
      ['!kachel liste titel="A"\nLIST', '!kachel liste titel="B"\nLIST'],
      ['!kachel liste titel="A"', '!kachel liste titel="B"'],
    ]) {
      const model = parseDashboardFence(rumpf);
      const el = model.elemente[0];
      if (el.art === 'kachel') el.attrs.titel = 'B';
      el.geaendert = true;
      expect(serializeDashboardFence(model)).toBe(erwartet);
    }
  });

  it('lässt einen ungültigen Breiten-Wert beim Ändern als Rohtext stehen', () => {
    const model = parseDashboardFence('!kachel liste breite=breit\nLIST');
    model.elemente[0].geaendert = true;
    expect(serializeDashboardFence(model)).toBe('!kachel liste breite=breit\nLIST');
  });

  it('schreibt ein unbekanntes Element auch als geändert wörtlich', () => {
    const model = parseDashboardFence('!ampel   a1  grenze="3 Tage"\nx');
    model.elemente[0].geaendert = true;
    expect(serializeDashboardFence(model)).toBe('!ampel   a1  grenze="3 Tage"\nx');
  });

  it('schreibt ein neues Element ohne Rohtext kanonisch', () => {
    const model = parseDashboardFence('!zeile');
    model.elemente.push({
      art: 'kachel',
      name: 'kennzahl',
      attrs: { titel: 'Neu', breite: 'viertel' },
      attrFolge: [],
      inhalt: 'LIST',
      geaendert: true,
      zeile: null,
    });
    expect(serializeDashboardFence(model)).toBe(
      '!zeile\n!kachel kennzahl titel="Neu" breite=viertel\nLIST',
    );
  });
});

describe('Dashboard-Kern — Sicht (4T-002509, AK3)', () => {
  it('liefert das Beispiel ohne Befund mit Filtern, Zeilen und Kacheln', () => {
    const model = parseDashboardFence(BEISPIEL);
    // Einzig der unbekannte Marker ist ein Befund.
    expect(model.errors).toEqual([{ code: 'markerUnbekannt', zeile: 27, detail: 'ampel' }]);
    const sicht = dashboardSicht(model);
    expect(
      sicht.filter.map((f) => [f.name, f.titel, f.werte, f.eigenschaft, f.vorbelegung]),
    ).toEqual([
      ['status', 'Status', null, 'status', 'offen'],
      ['prio', 'Priorität', ['hoch', 'mittel', 'niedrig'], null, null],
    ]);
    expect(sicht.zeilen.map((r) => r.zeile)).toEqual([null, 12, 20, 29]);
    expect(sicht.zeilen.map((r) => r.kacheln.map((k) => k.art))).toEqual([
      ['text'],
      ['kennzahl', 'kennzahl', 'kennzahl'],
      ['balken', 'kreis'],
      ['tabelle', 'liste'],
    ]);
    expect(sicht.unbekannt).toEqual([{ marker: 'ampel', zeile: 27, index: 10 }]);
    expect(sicht.leer).toBe(false);
  });

  it('löst Titel, Breite und Quelle der Kacheln auf', () => {
    const alle = kacheln(dashboardSicht(parseDashboardFence(BEISPIEL)));
    expect(alle[0].quelle).toEqual({
      typ: 'text',
      text: '## Projekt-Überblick\nOffene Arbeit nach Status und Priorität; Details in [[Projekt-Regeln]].',
    });
    expect(alle[0].titel).toBe('');
    expect(alle[1]).toMatchObject({
      art: 'kennzahl',
      titel: 'Offene Aufgaben',
      breite: { zwoelftel: 4, fest: true },
      quelle: {
        typ: 'abfrage',
        text: 'LIST FROM "Aufgaben" WHERE status = $status AND prioritaet = $prio',
      },
      zeile: 13,
      fehler: [],
    });
    // Die Kommentar-Zeile ist aus der Abfrage entfernt und im Modell erhalten.
    expect(alle[5].quelle.text).toBe(
      'TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE status = $status GROUP BY kategorie',
    );
    expect(alle[6].breite).toEqual({ zwoelftel: 8, fest: true });
    expect(alle[7]).toMatchObject({
      quelle: { typ: 'datei', ziel: 'Abfragen/Zuletzt geändert' },
      breite: { zwoelftel: 4, fest: false },
    });
  });

  it('bildet eine stillschweigende erste Zeile und eine leere Zeile ohne Befund', () => {
    const model = parseDashboardFence('!kachel liste\nLIST\n!zeile\n!zeile\n!kachel text\nA');
    const sicht = dashboardSicht(model);
    expect(sicht.zeilen.map((r) => [r.zeile, r.kacheln.length])).toEqual([
      [null, 1],
      [3, 0],
      [4, 1],
    ]);
    expect(model.errors).toEqual([]);
  });

  it('lässt Text-Kacheln ihre Kommentar-Zeilen und nimmt sie aus Filter-Werten', () => {
    const sicht = dashboardSicht(
      parseDashboardFence('!filter s\na\n%% kein Wert %%\nb\n!kachel text\n%% bleibt %%\nText'),
    );
    expect(sicht.filter[0].werte).toEqual(['a', 'b']);
    expect(kacheln(sicht)[0].quelle.text).toBe('%% bleibt %%\nText');
  });

  it('erkennt Kommentar-Zeilen nur in ganzer Form ab Spalte 0', () => {
    expect(istKommentarZeile('%% a %%')).toBe(true);
    expect(istKommentarZeile('%%%%')).toBe(true);
    expect(istKommentarZeile('%% a %%\r')).toBe(true);
    expect(istKommentarZeile(' %% a %%')).toBe(false);
    expect(istKommentarZeile('%% a')).toBe(false);
    expect(istKommentarZeile('%%%')).toBe(false);
    expect(istKommentarZeile('LIST %% a %%')).toBe(false);
  });

  it('nimmt Vorgaben des Filters: Titel und Eigenschaft aus dem Namen, Umlaute erlaubt', () => {
    const sicht = dashboardSicht(
      parseDashboardFence('!filter Priorität\n!filter _x2 eigenschaft=kategorie vorbelegung=neu'),
    );
    expect(sicht.filter).toMatchObject([
      { name: 'Priorität', schluessel: 'priorität', titel: 'Priorität', eigenschaft: 'Priorität' },
      { name: '_x2', eigenschaft: 'kategorie', vorbelegung: 'neu', fehler: [] },
    ]);
  });

  it('nimmt die Schreibweise des aufgezählten Wertes für die Vorbelegung', () => {
    const sicht = dashboardSicht(parseDashboardFence('!filter p vorbelegung=HOCH\nhoch\nniedrig'));
    expect(sicht.filter[0].vorbelegung).toBe('hoch');
  });

  it('zeigt nach einer Änderung am Modell den neuen Stand', () => {
    const model = parseDashboardFence('!kachel liste\nLIST');
    model.elemente[0].name = 'tabelle';
    model.elemente[0].geaendert = true;
    expect(kacheln(dashboardSicht(model))[0].art).toBe('tabelle');
  });
});

describe('Dashboard-Kern — Befund-Codes mit Zeile, Element bleibt (4T-002509, AK3)', () => {
  // Je Fall: Rumpf, erwartete Befunde als [Code, Zeile, Detail].
  // Eine Text-Kachel am Ende, damit der Block nicht leer ist und nur der
  // geprüfte Befund erscheint.
  const K = '\n!kachel text\nA';
  const FAELLE = [
    ['inhaltVorMarker', 'Text\n\n%% ok %%' + K, [['inhaltVorMarker', 1, 'Text']]],
    ['markerUnbekannt (Wort)', '!ampel x' + K, [['markerUnbekannt', 1, 'ampel']]],
    ['markerUnbekannt (ohne Wort)', '!= 3' + K, [['markerUnbekannt', 1, '!= 3']]],
    ['markerUnbekannt (Großschreibung)', '!Kachel liste' + K, [['markerUnbekannt', 1, 'Kachel']]],
    ['leer', '!filter s\n!zeile', [['leer', null, '']]],
    [
      'leer (nur unbekannt)',
      '!ampel',
      [
        ['markerUnbekannt', 1, 'ampel'],
        ['leer', null, ''],
      ],
    ],
    ['filterOhneName (fehlt)', '!filter titel="A"' + K, [['filterOhneName', 1, '']]],
    ['filterOhneName (Bindestrich)', '!filter a-b' + K, [['filterOhneName', 1, 'a-b']]],
    ['filterOhneName (Punkt)', '!filter a.b' + K, [['filterOhneName', 1, 'a.b']]],
    ['filterOhneName (Ziffer vorn)', '!filter 1a' + K, [['filterOhneName', 1, '1a']]],
    ['filterDoppelt', '!filter Status\n!filter status' + K, [['filterDoppelt', 2, 'status']]],
    ['filterQuelleDoppelt', '!filter p eigenschaft=x\nhoch' + K, [['filterQuelleDoppelt', 1, 'p']]],
    // Review-Runde 1 von 3E-000402, Befund A3: Ein leeres eigenschaft="" ist
    // keine Angabe und damit keine zweite Quelle neben den aufgezählten Werten.
    [
      'filterQuelleDoppelt (leere Eigenschaft, kein Befund)',
      '!filter p eigenschaft=""\nhoch' + K,
      [],
    ],
    [
      'vorbelegungUnbekannt',
      '!filter p vorbelegung=mittel\nhoch' + K,
      [['vorbelegungUnbekannt', 1, 'mittel']],
    ],
    ['vorbelegung aus Bestand ohne Befund', '!filter p vorbelegung=mittel' + K, []],
    ['inhaltOhneBedeutung', '!zeile\n\n%% ok %%\nText' + K, [['inhaltOhneBedeutung', 1, 'Text']]],
    ['artUnbekannt', '!kachel tacho\nLIST', [['artUnbekannt', 1, 'tacho']]],
    ['artUnbekannt (fehlt)', '!kachel titel="A"\nLIST', [['artUnbekannt', 1, '']]],
    ['artUnbekannt (groß)', '!kachel Kennzahl\nLIST', [['artUnbekannt', 1, 'Kennzahl']]],
    ['quelleDoppelt', '!kachel liste abfrage="Q"\nLIST', [['quelleDoppelt', 1, 'Q']]],
    ['quelleFehlt', '!kachel balken\n\n%% nur Kommentar %%', [['quelleFehlt', 1, 'balken']]],
    ['quelleFehlt (leere Angabe)', '!kachel liste abfrage=""', [['quelleFehlt', 1, 'liste']]],
    ['textMitQuelle', '!kachel text abfrage="Q"\nA', [['textMitQuelle', 1, 'Q']]],
    ['breiteUnbekannt', '!kachel liste breite=13\nLIST', [['breiteUnbekannt', 1, '13']]],
    // 4T-002512: zusätzliche Wörter hinter Art bzw. Name (Entscheidung der
    // Sitzung vom 2026-11-03).
    [
      'zusatzUnbekannt (Kachel)',
      '!kachel kennzahl Offene Aufgaben\nLIST',
      [['zusatzUnbekannt', 1, 'Offene Aufgaben']],
    ],
    ['zusatzUnbekannt (Filter)', '!filter s extra' + K, [['zusatzUnbekannt', 1, 'extra']]],
  ];

  for (const [name, rumpf, erwartet] of FAELLE) {
    it(name, () => {
      const model = parseDashboardFence(rumpf);
      expect(model.errors.map((e) => [e.code, e.zeile, e.detail])).toEqual(erwartet);
      // Die Sicht trägt dieselben Befunde, und nichts geht beim Speichern verloren.
      expect(dashboardSicht(model).errors).toEqual(model.errors);
      expect(serializeDashboardFence(model)).toBe(rumpf);
    });
  }

  it('lässt einen Filter mit Befund entfallen und behält ihn im Modell', () => {
    const model = parseDashboardFence('!filter a\n!filter A\n!filter x-y\n!zeile');
    expect(model.elemente.filter((el) => el.art === 'filter')).toHaveLength(3);
    expect(dashboardSicht(model).filter.map((f) => f.name)).toEqual(['a']);
  });

  it('stellt eine Kachel mit Befund an ihren Platz, ohne Quelle', () => {
    const sicht = dashboardSicht(
      parseDashboardFence('!kachel liste\nLIST\n!kachel liste abfrage="Q"\nLIST\n!kachel tacho'),
    );
    const [ok, doppelt, unbekannt] = kacheln(sicht);
    expect(ok.fehler).toEqual([]);
    expect(doppelt.quelle).toBeNull();
    expect(doppelt.fehler).toEqual([{ code: 'quelleDoppelt', zeile: 3, detail: 'Q' }]);
    expect(unbekannt).toMatchObject({ art: null, quelle: null, zeile: 5 });
    expect(codes(parseDashboardFence('!kachel tacho'))).toEqual(['artUnbekannt']);
  });

  it('lässt Element mit zusätzlichen Wörtern gültig und übergeht die Wörter (4T-002512)', () => {
    const model = parseDashboardFence('!filter s Status\n!kachel kennzahl Offene\nLIST');
    const sicht = dashboardSicht(model);
    expect(sicht.filter.map((f) => [f.name, f.titel])).toEqual([['s', 's']]);
    const [k] = kacheln(sicht);
    expect(k).toMatchObject({
      art: 'kennzahl',
      titel: '',
      quelle: { typ: 'abfrage', text: 'LIST' },
    });
    expect(model.elemente[1].operanden).toEqual(['Offene']);
  });

  it('übergeht bei der Text-Kachel die Angabe abfrage= und zeigt den Text', () => {
    const [k] = kacheln(dashboardSicht(parseDashboardFence('!kachel text abfrage="Q"\nA')));
    expect(k.quelle).toEqual({ typ: 'text', text: 'A' });
  });

  it('lässt eine Kachel mit ungültiger Breite wie ohne Angabe wirken', () => {
    const sicht = dashboardSicht(
      parseDashboardFence('!kachel liste breite=halb\nL\n!kachel liste breite=x\nL'),
    );
    expect(kacheln(sicht).map((k) => k.breite)).toEqual([
      { zwoelftel: 6, fest: true },
      { zwoelftel: 6, fest: false },
    ]);
  });
});

describe('Dashboard-Kern — Breiten-Rechnung (4T-002509, AK4)', () => {
  it('liest die vier Wörter als Zwölftel', () => {
    expect(BREITEN_WOERTER).toEqual({ ganz: 12, halb: 6, drittel: 4, viertel: 3 });
    for (const [wort, n] of Object.entries(BREITEN_WOERTER)) {
      expect(leseBreite(wort)).toEqual({ zwoelftel: n, gueltig: true });
    }
  });

  it('liest n/12 und das nackte n mit n von 1 bis 12', () => {
    for (let n = 1; n <= 12; n++) {
      expect(leseBreite(`${n}/12`)).toEqual({ zwoelftel: n, gueltig: true });
      expect(leseBreite(String(n))).toEqual({ zwoelftel: n, gueltig: true });
    }
  });

  it('meldet ungültige Werte und unterscheidet sie von keiner Angabe', () => {
    expect(leseBreite(undefined)).toEqual({ zwoelftel: null, gueltig: true });
    for (const wert of [
      '0',
      '13',
      '0/12',
      '13/12',
      '5/10',
      'Halb',
      'breit',
      '',
      ' 6',
      '6 ',
      '-3',
      '100',
    ]) {
      expect(leseBreite(wert), wert).toEqual({ zwoelftel: null, gueltig: false });
    }
  });

  it('schreibt das nackte n kanonisch als n/12 und lässt alles Übrige stehen', () => {
    expect(kanonischeBreite('4')).toBe('4/12');
    expect(kanonischeBreite('12')).toBe('12/12');
    expect(kanonischeBreite('4/12')).toBe('4/12');
    expect(kanonischeBreite('halb')).toBe('halb');
    expect(kanonischeBreite('13')).toBe('13');
    expect(kanonischeBreite('breit')).toBe('breit');
  });

  it('verteilt den Rest gleich auf die Kacheln ohne Angabe', () => {
    expect(verteileBreiten([null, null, null])).toEqual([
      { zwoelftel: 4, fest: false },
      { zwoelftel: 4, fest: false },
      { zwoelftel: 4, fest: false },
    ]);
    expect(verteileBreiten([8, null])).toEqual([
      { zwoelftel: 8, fest: true },
      { zwoelftel: 4, fest: false },
    ]);
    expect(verteileBreiten([6, null, null]).map((b) => b.zwoelftel)).toEqual([6, 3, 3]);
    expect(verteileBreiten([null, null, null, null, null])[0].zwoelftel).toBeCloseTo(2.4);
    expect(verteileBreiten([4, 4])).toEqual([
      { zwoelftel: 4, fest: true },
      { zwoelftel: 4, fest: true },
    ]);
    expect(verteileBreiten([])).toEqual([]);
  });

  it('gibt Kacheln ohne Angabe eine neue Zeile, wenn die Angaben sie füllen', () => {
    expect(verteileBreiten([12, null, null]).map((b) => b.zwoelftel)).toEqual([12, 6, 6]);
    expect(verteileBreiten([8, 6, null]).map((b) => b.zwoelftel)).toEqual([8, 6, 12]);
  });
});

describe('Dashboard-Kern — Blöcke im Dokument (4T-002509, AK6)', () => {
  it('findet zwei Blöcke getrennt', () => {
    const text = [
      '# Titel',
      '```perspective-dashboard',
      '!kachel liste',
      'LIST',
      '```',
      'Zwischentext',
      '~~~perspective-dashboard',
      '!kachel text',
      '```',
      'Code in der Text-Kachel',
      '```',
      '~~~',
    ].join('\n');
    const bloecke = findDashboardFences(text);
    expect(bloecke).toEqual([
      { startZeile: 2, endeZeile: 5, rumpf: '!kachel liste\nLIST' },
      { startZeile: 7, endeZeile: 12, rumpf: '!kachel text\n```\nCode in der Text-Kachel\n```' },
    ]);
  });

  it('findet keinen Block innerhalb eines äußeren Vierer-Zauns', () => {
    const text = [
      '````markdown',
      '```perspective-dashboard',
      '!kachel liste',
      'LIST',
      '```',
      '````',
      '```perspective-dashboard',
      '!zeile',
      '```',
    ].join('\n');
    expect(findDashboardFences(text)).toEqual([{ startZeile: 7, endeZeile: 9, rumpf: '!zeile' }]);
  });

  it('lässt einen offenen Block bis zum Ende reichen und andere Blöcke liegen', () => {
    expect(findDashboardFences('```perspective-canvas\n!karte k1\n```')).toEqual([]);
    expect(findDashboardFences('a\r\n```perspective-dashboard\r\n!zeile\r\n')).toEqual([
      { startZeile: 2, endeZeile: 5, rumpf: '!zeile\n' },
    ]);
    expect(findDashboardFences('```perspective-dashboard titel=x\n!zeile\n```')).toHaveLength(1);
    expect(findDashboardFences(null)).toEqual([]);
  });
});

describe('Dashboard-Kern — Gerüst, Kennung, Prozess-Neutralität (4T-002509)', () => {
  it('liefert ein Gerüst mit einer Zeile und einer Kachel ohne Befund', () => {
    const geruest = dashboardGeruest();
    const [block] = findDashboardFences(geruest);
    const model = parseDashboardFence(block.rumpf);
    expect(model.errors).toEqual([]);
    const sicht = dashboardSicht(model);
    expect(sicht.zeilen).toHaveLength(1);
    expect(sicht.zeilen[0].kacheln).toHaveLength(1);
    expect(KACHEL_ARTEN).toContain(sicht.zeilen[0].kacheln[0].art);
  });

  // 4T-002513 (Entscheidung der Sitzung vom 2026-11-03): eine Zeile mit einer
  // Kennzahl-Kachel über alle Treffer; der Titel kommt vom Aufrufer.
  it('legt das Gerüst als Kennzahl über alle Treffer mit Titel des Aufrufers fest', () => {
    expect(dashboardGeruest('Anzahl')).toBe(
      '```perspective-dashboard\n!zeile\n!kachel kennzahl titel="Anzahl"\nLIST\n```',
    );
    const [block] = findDashboardFences(dashboardGeruest('Anzahl'));
    const [kachel] = dashboardSicht(parseDashboardFence(block.rumpf)).zeilen[0].kacheln;
    expect(kachel).toMatchObject({
      art: 'kennzahl',
      titel: 'Anzahl',
      quelle: { typ: 'abfrage', text: 'LIST' },
      fehler: [],
    });
    expect(dashboardGeruest()).toBe(
      '```perspective-dashboard\n!zeile\n!kachel kennzahl\nLIST\n```',
    );
  });

  it('verlängert den Zaun über die längste Backtick-Folge des Rumpfs', () => {
    expect(dashboardFenceBlock('!zeile')).toBe('```perspective-dashboard\n!zeile\n```');
    expect(dashboardFenceBlock('!kachel text\n````\nx\n````')).toMatch(
      /^`{5}perspective-dashboard\n/,
    );
  });

  it('nennt die Kennung der Erweiterung und die Info-Zeichenfolge', () => {
    expect(DASHBOARD_EXTENSION_ID).toBe('dashboard');
    expect(DASHBOARD_FENCE).toBe('perspective-dashboard');
    expect(KACHEL_ARTEN).toEqual(['kennzahl', 'liste', 'tabelle', 'balken', 'kreis', 'text']);
  });

  it('lädt nur prozessneutrale Module', () => {
    const lies = (rel) =>
      [
        ...readFileSync(new URL(rel, import.meta.url), 'utf8').matchAll(
          /require\(\s*['"]([^'"]+)['"]\s*\)/g,
        ),
      ].map((m) => m[1]);
    expect(lies('../../src/shared/dashboard/dashboard-core.js')).toEqual([
      '../canvas/marker-grammatik.js',
      '../markdown/fence-level.js',
      './dashboard-breite.js',
    ]);
    expect(lies('../../src/shared/dashboard/dashboard-breite.js')).toEqual([]);
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });
});
