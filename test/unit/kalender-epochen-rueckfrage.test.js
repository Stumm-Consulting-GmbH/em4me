// 4T-002003 (Epic 3E-000307): Die Rückfrage vor dem Nachtragen einer jüngsten
// Epoche am ECHTEN Handler (`calendar:confirmEpochGuard` in
// src/main/ipc/dialogs.js).
//
// Gemessen wird, was der Anwender sieht und was der Anzeige-Prozess
// zurückbekommt: Schaltflächen in ihrer Reihenfolge samt Vorbelegung und
// Escape-Ziel, die Sätze mit eingesetzten Zahlen in Einzahl und Mehrzahl, und
// die Zusage, dass jede ungültige Eingabe und jeder Fehler als Abbruch zählt —
// ohne Zusage wird nichts gespeichert. Das Meldungs-Fenster des Systems ist
// eine Attrappe; die Texte kommen aus dem deutschen Katalog, damit ein
// vertauschter Schlüssel oder ein stehen gebliebener Platzhalter auffällt.
// 4T-002065 (Epic 3E-000307): Am Ende Einzahl und Mehrzahl der beiden
// Meldungen zu abgeleiteten Zeitrechnungen derselben Dialog-Gruppe.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import de from '../../src/i18n/de.json';

const require = createRequire(import.meta.url);
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');

// Registriert die Dialog-Gruppe mit einer Attrappe des Meldungs-Fensters, die
// die gezeigten Optionen festhält und die vorgegebene Schaltfläche «drückt».
function registriere(antwort) {
  const handler = new Map();
  const gezeigt = [];
  registerDialogsIpc((kanal, fn) => handler.set(kanal, fn), {
    app: { getPath: () => '' },
    dialog: {
      showMessageBox: async (_owner, optionen) => {
        gezeigt.push(optionen);
        if (antwort instanceof Error) throw antwort;
        return { response: antwort };
      },
    },
    shell: {},
    session: {},
    senderWindow: () => ({}),
    tForWindow: (_w, key) => (key in de ? de[key] : key),
    getStore: () => null,
    areaOfWindow: () => null,
    isMarkdownPath: () => false,
    portablerBetrieb: { portabel: false },
  });
  return {
    frage: (daten) => handler.get('calendar:confirmEpochGuard')({}, daten),
    gezeigt,
    // 4T-002065: die beiden Meldungen zu den abgeleiteten Zeitrechnungen.
    kanal: (name, ...args) => handler.get(name)({}, ...args),
  };
}

const EINTRAG = { name: 'Herrscher', werte: 5, dokumente: 3 };

describe('Zählbarer Bereich: drei Wege (4T-002003)', () => {
  it('zeigt drei Schaltflächen in fester Reihenfolge, Sichern vorbelegt, Escape bricht ab', async () => {
    const { frage, gezeigt } = registriere(0);
    await frage({ eintraege: [EINTRAG], zaehlbar: true });
    expect(gezeigt).toHaveLength(1);
    const o = gezeigt[0];
    expect(o.type).toBe('warning');
    expect(o.noLink).toBe(true);
    expect(o.title).toBe('Gespeicherte Datums-Werte sichern?');
    expect(o.buttons).toEqual(['Werte sichern und anwenden', 'Ohne Sichern anwenden', 'Abbrechen']);
    expect(o.defaultId).toBe(0);
    expect(o.cancelId).toBe(2);
  });

  it.each([
    [0, 'sichern'],
    [1, 'ohne'],
    [2, 'abbrechen'],
  ])('Schaltfläche %i liefert %s', async (knopf, erwartet) => {
    const { frage } = registriere(knopf);
    expect(await frage({ eintraege: [EINTRAG], zaehlbar: true })).toBe(erwartet);
  });

  it('nennt je Zeitrechnung einen Absatz in der Mehrzahl und darunter einmal die Erklärung', async () => {
    const { frage, gezeigt } = registriere(2);
    await frage({
      eintraege: [EINTRAG, { name: 'Ära', werte: 2, dokumente: 2 }],
      zaehlbar: true,
    });
    const absaetze = gezeigt[0].message.split('\n\n');
    expect(absaetze).toEqual([
      'Die Zeitrechnung «Herrscher» bekommt eine neue jüngste Epoche. 5 gespeicherte Werte in 3 Dokumenten sind davon betroffen: Sie würden danach einen anderen Tag bezeichnen oder ungültig werden.',
      'Die Zeitrechnung «Ära» bekommt eine neue jüngste Epoche. 2 gespeicherte Werte in 2 Dokumenten sind davon betroffen: Sie würden danach einen anderen Tag bezeichnen oder ungültig werden.',
    ]);
    expect(gezeigt[0].detail).toBe(
      'Beim Sichern schreibt das Programm diese Werte so um, dass sie denselben Tag bezeichnen wie bisher: Ein Wert vor dem Beginn der neuen Epoche bekommt das Kürzel der bisherigen, ein Wert ab ihrem Beginn die Jahreszahl der neuen. Der bisherige Stand jedes geänderten Dokuments bleibt in der Dokument-Historie erhalten.',
    );
  });

  it('löst die Einzahl sauber: ein Wert in einem Dokument', async () => {
    const { frage, gezeigt } = registriere(2);
    await frage({ eintraege: [{ name: 'Herrscher', werte: 1, dokumente: 1 }], zaehlbar: true });
    expect(gezeigt[0].message).toBe(
      'Die Zeitrechnung «Herrscher» bekommt eine neue jüngste Epoche. 1 gespeicherter Wert in 1 Dokument ist davon betroffen: Er würde danach einen anderen Tag bezeichnen oder ungültig werden.',
    );
  });

  it('löst die Einzahl sauber: mehrere Werte in einem Dokument', async () => {
    const { frage, gezeigt } = registriere(2);
    await frage({ eintraege: [{ name: 'Herrscher', werte: 4, dokumente: 1 }], zaehlbar: true });
    expect(gezeigt[0].message).toContain('4 gespeicherte Werte in 1 Dokument sind davon betroffen');
    expect(gezeigt[0].message).toContain(
      'Sie würden danach einen anderen Tag bezeichnen oder ungültig werden.',
    );
  });

  it('lässt keinen Platzhalter stehen', async () => {
    const { frage, gezeigt } = registriere(2);
    for (const e of [
      EINTRAG,
      { name: 'X', werte: 1, dokumente: 1 },
      { name: 'Y', werte: 3, dokumente: 1 },
    ]) {
      await frage({ eintraege: [e], zaehlbar: true });
    }
    for (const o of gezeigt) expect(`${o.message}${o.detail}`).not.toMatch(/[{}]/);
  });
});

describe('Zu großer Bereich: zwei Wege (4T-002003)', () => {
  it('zeigt Anwenden und Abbrechen, Abbrechen vorbelegt und Escape-Ziel, ohne Zahl und ohne Erklärung', async () => {
    const { frage, gezeigt } = registriere(1);
    await frage({ eintraege: [{ name: 'Herrscher' }], zaehlbar: false });
    const o = gezeigt[0];
    expect(o.buttons).toEqual(['Anwenden', 'Abbrechen']);
    expect(o.defaultId).toBe(1);
    expect(o.cancelId).toBe(1);
    expect(o.message).toBe(
      'Die Zeitrechnung «Herrscher» bekommt eine neue jüngste Epoche. Der Bereich ist zu groß, um die betroffenen Werte zu zählen und zu sichern. Werte der bisher jüngsten Epoche würden danach einen anderen Tag bezeichnen oder ungültig werden.',
    );
    expect(o.detail).toBeUndefined();
  });

  it.each([
    [0, 'ohne'],
    [1, 'abbrechen'],
  ])('Schaltfläche %i liefert %s — nie sichern', async (knopf, erwartet) => {
    const { frage } = registriere(knopf);
    expect(await frage({ eintraege: [{ name: 'Herrscher' }], zaehlbar: false })).toBe(erwartet);
  });
});

describe('Ungültige Eingabe und Fehler zählen als Abbruch (4T-002003)', () => {
  it.each([
    ['ohne Daten', undefined],
    ['ohne Kennzeichen zaehlbar', { eintraege: [EINTRAG] }],
    ['leere Liste', { eintraege: [], zaehlbar: true }],
    ['Liste fehlt', { zaehlbar: true }],
    ['Eintrag ohne Namen', { eintraege: [{ werte: 1, dokumente: 1 }], zaehlbar: true }],
    ['zählbar ohne Zahl', { eintraege: [{ name: 'Herrscher' }], zaehlbar: true }],
    [
      'zählbar mit null Werten',
      { eintraege: [{ name: 'H', werte: 0, dokumente: 0 }], zaehlbar: true },
    ],
  ])('%s: kein Fenster, Antwort abbrechen', async (_fall, daten) => {
    const { frage, gezeigt } = registriere(0);
    expect(await frage(daten)).toBe('abbrechen');
    expect(gezeigt).toHaveLength(0);
  });

  it('ein Fehler des Meldungs-Fensters liefert abbrechen statt zu werfen', async () => {
    const { frage } = registriere(new Error('kein Fenster'));
    expect(await frage({ eintraege: [EINTRAG], zaehlbar: true })).toBe('abbrechen');
  });

  it('eine unbekannte Antwort des Fensters liefert abbrechen', async () => {
    const { frage } = registriere(7);
    expect(await frage({ eintraege: [EINTRAG], zaehlbar: true })).toBe('abbrechen');
  });
});

// 4T-002065 (Epic 3E-000307): Rückfrage vor einer wirksamen Änderung
// (`calendar:confirmDependents`) und Lösch-Sperre (`calendar:blockedDelete`)
// haben eine eigene Einzahl-Fassung für genau eine abgeleitete Zeitrechnung.
describe('Einzahl und Mehrzahl der Meldungen zu abgeleiteten Zeitrechnungen (4T-002065)', () => {
  it('Rückfrage, genau eine Ableitung: Einzahl-Fassung', async () => {
    const { kanal, gezeigt } = registriere(1);
    await kanal('calendar:confirmDependents', ['Projekt']);
    expect(gezeigt[0].message).toBe(
      'Die Änderung verschiebt auch die Werte der abgeleiteten Zeitrechnung Projekt. Werte in Dokumenten behalten ihre Koordinaten und meinen damit einen anderen Zeitpunkt.',
    );
  });

  it('Rückfrage, zwei Ableitungen: Mehrzahl-Fassung', async () => {
    const { kanal, gezeigt } = registriere(1);
    await kanal('calendar:confirmDependents', ['Projekt', 'Reise']);
    expect(gezeigt[0].message).toBe(
      'Die Änderung verschiebt auch die Werte von 2 abgeleiteten Zeitrechnungen: Projekt, Reise. Werte in Dokumenten behalten ihre Koordinaten und meinen damit einen anderen Zeitpunkt.',
    );
  });

  it('Lösch-Sperre, genau eine Ableitung: Einzahl-Fassung', async () => {
    const { kanal, gezeigt } = registriere(0);
    await kanal('calendar:blockedDelete', ['Projekt']);
    expect(gezeigt[0].message).toBe(
      'Auf dieser Zeitrechnung steht eine abgeleitete Zeitrechnung: Projekt. Zuerst diese entfernen oder auf eine andere Zeitrechnung stützen.',
    );
  });

  it('Lösch-Sperre, zwei Ableitungen: Mehrzahl-Fassung', async () => {
    const { kanal, gezeigt } = registriere(0);
    await kanal('calendar:blockedDelete', ['Projekt', 'Reise']);
    expect(gezeigt[0].message).toBe(
      'Auf dieser Zeitrechnung stehen 2 abgeleitete Zeitrechnungen: Projekt, Reise. Zuerst diese entfernen oder auf eine andere Zeitrechnung stützen.',
    );
  });
});
