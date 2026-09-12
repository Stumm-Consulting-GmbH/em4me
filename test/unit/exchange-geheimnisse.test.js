// 4T-001589 (Story 4S-000904, Epic 3E-000160): Wächter des Geheimnis-
// Ausschlusses.
//
// **Eigene Prüfdatei, obwohl der Gegenstand auf der Ausgabe-Seite liegt.** Das
// Epic sagt zu, dass Zugangs-Geheimnisse jeder Art die Anwendung nicht
// verlassen, auch nicht verschlüsselt. Eine Zusicherung dieser Art soll unter
// ihrem eigenen Namen auffindbar sein und nicht als Absatz in einer Datei über
// das Sammeln stehen; wer sie ändern will, soll die Datei sehen, die sie hält.
//
// **Warum überhaupt ein Wächter, wo die Ausgabe schon fail closed ist.** Heute
// gilt der Ausschluss bereits als Folge einer ABWESENHEIT: Keine Datenart
// nennt den Ablage-Raum der Erweiterungen, also verlässt er den Rechner nicht.
// Diese Lage hält bis zur nächsten eingetragenen Datenart. Die Fälle unten
// prüfen deshalb nicht, dass heute nichts durchkommt, sondern dass auch dann
// nichts durchkommt, wenn jemand später eine Datenart mit weiterem Zuschnitt
// einträgt (AK6).
//
// Geprüft wird an der FERTIGEN DATEI per Text-Suche und nicht an einzelnen
// Feldern: Ein Feld-Vergleich prüft die Stellen, an die man denkt — eine
// Text-Suche über das Ergebnis auch die, an die man nicht denkt.
import { describe, it, expect } from 'vitest';
import {
  collectDataKinds,
  buildExchangeSections,
  ohneErweiterungsDaten,
} from '../../src/shared/exchange-collect.js';
import { writeExchangeFile } from '../../src/shared/exchange-file.js';
import {
  DATA_KINDS,
  DATA_KIND_IDS,
  EXCHANGE_KIND,
  NEVER_EXPORTED,
  allExportedPaths,
} from '../../src/shared/exchange-data-kinds.js';
import {
  EXTENSION_DATA_PREFIX,
  extensionDataKey,
  isExtensionDataPath,
} from '../../src/shared/extensions/extensions-external.js';

// Die Kennung und der Wert, nach denen anschließend gesucht wird. Beide sind
// so gewählt, dass sie in keiner anderen Zeichenkette der Datei zufällig
// vorkommen können.
const FREMDE_ERWEITERUNG = 'fremde-erweiterung-xyz';
const GEHEIMNIS = 'GEHEIM-SOLL-NIE-RAUS-4711';

// Eine eingerichtete Installation, in deren Speicher eine externe Erweiterung
// ihren Ablage-Raum belegt hat — genau die Konstellation aus Befund B5.
const EINGERICHTET = {
  language: 'de',
  themePref: 'dark',
  hotkeys: { 'file.save': 'Ctrl+S' },
  colorSchemes: { custom: [{ id: 'nacht', name: 'Nacht' }], activeDark: 'nacht' },
  // Der Schalt-Zustand: bleibt ausdrücklich IM Umfang (AK4).
  extensions: { disabled: ['mermaid'] },
  extensionsExternal: {
    enabled: [FREMDE_ERWEITERUNG],
    trusted: { [FREMDE_ERWEITERUNG]: '1.0.0' },
  },
  // Der Ablage-Raum: bleibt ausdrücklich DRAUSSEN.
  extensionData: {
    [FREMDE_ERWEITERUNG]: { apiKey: GEHEIMNIS, endpunkt: 'https://irgendwo.example' },
  },
};

function storeDouble(inhalt) {
  return {
    get(pfad) {
      return pfad.split('.').reduce((k, teil) => (k == null ? undefined : k[teil]), inhalt);
    },
  };
}

async function sammle(inhalt = EINGERICHTET, kinds = DATA_KINDS) {
  const store = storeDouble(inhalt);
  return collectDataKinds({ readPath: (pfad) => store.get(pfad) }, kinds);
}

// Die vollständige Ausgabe über alles, was tatsächlich etwas enthält.
async function ganzeDatei(inhalt = EINGERICHTET, kinds = DATA_KINDS) {
  const gesammelt = await sammle(inhalt, kinds);
  const auswahl = gesammelt.filter((k) => k.hasValues).map((k) => k.id);
  const abschnitte = buildExchangeSections(gesammelt, auswahl);
  expect(abschnitte.ok, 'Abschnitte nicht baubar: ' + abschnitte.error).toBe(true);
  const datei = writeExchangeFile({ kind: EXCHANGE_KIND, sections: abschnitte.sections });
  expect(datei.ok, 'Datei nicht baubar: ' + datei.error).toBe(true);
  return datei.text;
}

// Eine Registry, die den Ablage-Raum ausdrücklich NENNT. Sie ist die Grundlage
// der Fälle, die den Filter wirklich messen.
//
// **Warum das nötig ist, ergab die Rot-Probe** (2026-09-08): Mit
// ausgeschaltetem Filter blieben neun von vierzehn Fällen grün — nicht weil
// der Filter unnötig wäre, sondern weil die Registry den Raum heute nicht
// nennt und die Ausgabe deshalb schon fail closed ist. Ein Fall, der gegen die
// unveränderte Registry läuft, misst also die ALTE Zusicherung und nicht die
// neue. Wer den Filter prüfen will, muss ihm etwas zu tun geben.
const REGISTRY_MIT_RAUM = [
  ...DATA_KINDS,
  {
    id: 'kuenftigeDatenart',
    labelKey: 'exchange.kind.settings',
    paths: [extensionDataKey(FREMDE_ERWEITERUNG), EXTENSION_DATA_PREFIX],
    zaehle: () => 1,
    merge: { mode: 'replace' },
  },
];

describe('AK1/AK5 — der Ablage-Raum der Erweiterungen verlässt den Rechner nicht', () => {
  it('weder Kennung noch Wert stehen in der fertigen Datei', async () => {
    const text = await ganzeDatei();
    expect(text).not.toContain(GEHEIMNIS);
    expect(text).not.toContain(EXTENSION_DATA_PREFIX);
    expect(text).not.toContain('https://irgendwo.example');
  });

  it('auch dann nicht, wenn eine Datenart den Raum ausdrücklich nennt', async () => {
    // Derselbe Nachweis an der fertigen Datei, aber gegen eine Registry, die
    // den Raum zu exportieren VERSUCHT. Ohne den Filter stünde das Geheimnis
    // hier im Klartext (Rot-Probe belegt).
    const text = await ganzeDatei(EINGERICHTET, REGISTRY_MIT_RAUM);
    expect(text).not.toContain(GEHEIMNIS);
    expect(text).not.toContain(EXTENSION_DATA_PREFIX);
    expect(text).not.toContain('https://irgendwo.example');
  });

  it('gilt unabhängig von der Erweiterungs-Kennung', async () => {
    // Drei Erweiterungen mit verschiedenen Kennungen, darunter eine, die wie
    // ein harmloser Einstellungs-Schlüssel aussieht. Gegen die Registry MIT
    // Raum, damit der Fall den Filter misst.
    const inhalt = {
      language: 'de',
      extensionData: {
        a: { wert: 'GEHEIM-A' },
        'lange-kennung-mit-strichen': { wert: 'GEHEIM-B' },
        appearance: { wert: 'GEHEIM-C' },
      },
    };
    const text = await ganzeDatei(inhalt, REGISTRY_MIT_RAUM);
    for (const geheim of ['GEHEIM-A', 'GEHEIM-B', 'GEHEIM-C']) {
      expect(text).not.toContain(geheim);
    }
  });
});

describe('AK2 — die Regel greift über den Namensraum, nicht über Namen', () => {
  it('erkennt den Raum selbst und alles darunter, ohne eine Kennung zu kennen', () => {
    expect(isExtensionDataPath('extensionData')).toBe(true);
    expect(isExtensionDataPath('extensionData.was-auch-immer')).toBe(true);
    expect(isExtensionDataPath(extensionDataKey('irgendwas'))).toBe(true);
    // Und trifft nicht, was bloß ähnlich heißt.
    expect(isExtensionDataPath('extensionDataAndere')).toBe(false);
    expect(isExtensionDataPath('extensions.disabled')).toBe(false);
    expect(isExtensionDataPath('extensionsExternal.enabled')).toBe(false);
    expect(isExtensionDataPath(undefined)).toBe(false);
  });

  it('kennt keine Liste von Geheimnis-Namen', () => {
    // Der Filter darf nicht an Wort-Listen hängen: Der riskante Bestand ist
    // gerade der, den die Anwendung nicht kennt (Befund B5). Ein erfundener
    // Schlüssel mit unauffälligem Namen geht deshalb genauso wenig mit.
    const inhalt = {
      language: 'de',
      extensionData: { harmlos: { notiz: 'UNAUFFAELLIG-ABER-DRAUSSEN' } },
    };
    return ganzeDatei(inhalt, REGISTRY_MIT_RAUM).then((text) => {
      expect(text).not.toContain('UNAUFFAELLIG-ABER-DRAUSSEN');
    });
  });
});

describe('AK3 — jede Sammel-Funktion läuft durch den Filter', () => {
  it('keine Datenart bringt den Namensraum in ihre Werte', async () => {
    const gesammelt = await sammle();
    for (const eintrag of gesammelt) {
      const alsText = JSON.stringify(eintrag.values);
      expect(alsText, `Datenart ${eintrag.id}`).not.toContain(EXTENSION_DATA_PREFIX);
      expect(alsText, `Datenart ${eintrag.id}`).not.toContain(GEHEIMNIS);
    }
  });

  it('die Registry nennt keinen Pfad im Namensraum', () => {
    // Der Filter garantiert das Ergebnis; dieser Fall sorgt dafür, dass ein
    // solcher Eintrag als Befund sichtbar wird, statt still weggefiltert zu
    // werden. Beides zusammen — sichtbarer Versuch und wirkungsloser Versuch.
    for (const pfad of allExportedPaths()) {
      expect(isExtensionDataPath(pfad), `Registry nennt ${pfad}`).toBe(false);
    }
  });

  it('der Namensraum steht mit Begründung in der Ausschluss-Liste', () => {
    expect(Object.keys(NEVER_EXPORTED)).toContain(EXTENSION_DATA_PREFIX);
    expect(NEVER_EXPORTED[EXTENSION_DATA_PREFIX]).toMatch(/\S/);
  });
});

describe('AK4 — der Schalt-Zustand bleibt im Umfang, nur die Daten gehen nicht mit', () => {
  it('gibt die Freigabe-Liste aus und die Daten derselben Erweiterung nicht', async () => {
    // Gegen die Registry MIT Raum, damit der Fall die Grenze misst und nicht
    // bloß die Abwesenheit eines Eintrags: Der Filter muss zwischen den beiden
    // Nachbarn unterscheiden, nicht alles Erweiterungs-nahe wegnehmen.
    const text = await ganzeDatei(EINGERICHTET, REGISTRY_MIT_RAUM);
    // Die Kennung der Erweiterung steht in der Datei — als freigegebene
    // Erweiterung. Das ist gewollt: Der Anwender soll drüben dieselbe
    // Erweiterung eingeschaltet vorfinden.
    expect(text).toContain(FREMDE_ERWEITERUNG);
    expect(text).toContain('extensionsExternal.enabled');
    expect(text).toContain('extensions.disabled');
    // Ihr Ablage-Raum aber nicht.
    expect(text).not.toContain(GEHEIMNIS);
    expect(text).not.toContain('apiKey');
  });

  it('nimmt auch die Vertrauens-Entscheidung nicht mit', async () => {
    // Sie ist je Rechner zu treffen (Zuschnitt der Datenart «Einstellungen»),
    // steht deshalb in der Ausschluss-Liste und darf nicht über den
    // Geheimnis-Filter hinein zurückkehren.
    const text = await ganzeDatei();
    expect(text).not.toContain('extensionsExternal.trusted');
  });
});

describe('AK6 — der Ausschluss hängt nicht an der Datenart-Liste', () => {
  it('greift für eine nachträglich hinzugefügte Datenart', async () => {
    // Genau der Fall, für den dieser Task von der Ausgabe getrennt geführt ist:
    // Jemand trägt später eine Datenart ein, die den Ablage-Raum nennt.
    const boeswillig = [
      ...DATA_KINDS,
      {
        id: 'kuenftigeDatenart',
        labelKey: 'exchange.kind.settings',
        paths: [extensionDataKey(FREMDE_ERWEITERUNG), 'extensionData'],
        zaehle: () => 1,
      },
    ];
    const gesammelt = await sammle(EINGERICHTET, boeswillig);
    const neue = gesammelt.find((k) => k.id === 'kuenftigeDatenart');
    // Die Datenart existiert, trägt aber nichts: Beide Pfade sind gar nicht
    // gelesen worden.
    expect(neue).toBeTruthy();
    expect(neue.hasValues).toBe(false);
    expect(JSON.stringify(gesammelt)).not.toContain(GEHEIMNIS);
  });

  it('greift auch, wenn der Namensraum im WERT einer fremden Datenart steckt', async () => {
    // Das Netz unter der Pfad-Prüfung: Ein Pfad, der selbst harmlos heißt,
    // dessen Wert den Raum aber mitführt.
    const inhalt = {
      language: 'de',
      irgendeinKuenftigerSchluessel: {
        harmlos: true,
        extensionData: { [FREMDE_ERWEITERUNG]: { apiKey: GEHEIMNIS } },
      },
    };
    const boeswillig = [
      {
        id: 'kuenftigeDatenart',
        labelKey: 'exchange.kind.settings',
        paths: ['irgendeinKuenftigerSchluessel'],
        zaehle: () => 1,
      },
    ];
    const gesammelt = await sammle(inhalt, boeswillig);
    const neue = gesammelt.find((k) => k.id === 'kuenftigeDatenart');
    expect(neue.hasValues).toBe(true); // der harmlose Anteil kommt mit
    expect(neue.values.irgendeinKuenftigerSchluessel.harmlos).toBe(true);
    expect(JSON.stringify(neue.values)).not.toContain(GEHEIMNIS);
    expect(JSON.stringify(neue.values)).not.toContain(EXTENSION_DATA_PREFIX);
  });

  it('entfernt den Raum in beliebiger Tiefe und lässt alles andere unberührt', () => {
    const eingabe = {
      a: 1,
      liste: [{ extensionData: { x: GEHEIMNIS }, bleibt: 'ja' }],
      tief: { tiefer: { extensionData: { x: GEHEIMNIS }, auchDa: 2 } },
    };
    const aus = ohneErweiterungsDaten(eingabe);
    expect(JSON.stringify(aus)).not.toContain(GEHEIMNIS);
    expect(aus.a).toBe(1);
    expect(aus.liste[0].bleibt).toBe('ja');
    expect(aus.tief.tiefer.auchDa).toBe(2);
  });
});

describe('Der Ausschluss ändert an der übrigen Ausgabe nichts', () => {
  it('gibt ohne Erweiterungs-Daten dasselbe aus wie vorher', async () => {
    const ohneRaum = { ...EINGERICHTET };
    delete ohneRaum.extensionData;
    const mit = await ganzeDatei(EINGERICHTET);
    const ohne = await ganzeDatei(ohneRaum);
    // Bis auf den Zeitstempel der Kopfdaten identisch: Der Filter nimmt nur
    // den Namensraum und sonst nichts.
    const ohneZeit = (t) => t.replace(/^created: .*$/m, 'created: —');
    expect(ohneZeit(mit)).toBe(ohneZeit(ohne));
  });

  it('lässt die Datenart-Liste unverändert', async () => {
    const gesammelt = await sammle();
    expect(gesammelt.map((k) => k.id)).toEqual(
      DATA_KIND_IDS.filter((id) => id !== 'calendarSystems'),
    );
  });
});
