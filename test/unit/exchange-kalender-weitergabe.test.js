// 4T-001590 (Story 4S-000904, Epic 3E-000160): Prüffälle der Weitergabe eines
// einzelnen Kalender-Systems von Bereich zu Bereich.
//
// Geprüft wird der Weg als Ganzes und nicht seine Bausteine einzeln: In einem
// nachgestellten Quellbereich stehen mehrere Zeitrechnungs-Blöcke, einer davon
// wird gewählt, die Datei entsteht, und ein zweiter nachgestellter Bereich
// liest sie ein. Genau in dieser Kette liegen die Zusicherungen des Tasks —
// eine Prüfung der Filter-Funktion allein beliesse offen, ob das Gewählte am
// anderen Ende auch ankommt.
//
// **Der Block ist die Einheit der Weitergabe**, nicht die einzelne
// Zeitrechnung: Blöcke sind unabhängig, Zeitrechnungen desselben Blocks
// dagegen einander zuordenbar. Die Fälle unten messen deshalb Blöcke.
import { describe, it, expect } from 'vitest';
import {
  DATA_KINDS,
  dataKindById,
  entrySelectionOf,
  istVollstaendigerKalenderBlock,
} from '../../src/shared/exchange-data-kinds.js';
import { collectDataKinds, buildExchangeSections } from '../../src/shared/exchange-collect.js';
import { writeExchangeFile, readExchangeFile } from '../../src/shared/exchange-file.js';
import { planeUebernahme } from '../../src/shared/exchange-merge.js';
import { createGregorianTemplate } from '../../src/shared/calendar/calendar-template.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';

// Ein vollständiger Kalender aus der eingebauten Vorlage. Bewusst die echte
// Vorlage und keine erfundene Struktur: Die Vollständigkeits-Prüfung misst am
// wirklichen Definitions-Modell, und ein Fixture, das dieses Modell nur
// nachahmt, prüfte die eigene Nachahmung (Fehlerklasse L10/U2).
function kalender(id, name) {
  return createGregorianTemplate({ id, name });
}

function block(id, name, kalenderListe) {
  return { id, name, calendars: kalenderListe };
}

// Quellbereich: zwei unabhängige Blöcke.
function quelle() {
  return {
    blocks: [
      block('fiskal', 'Fiskaljahr', [kalender('fj', 'Fiskaljahr')]),
      block('mond', 'Mondkalender', [
        kalender('mond-a', 'Mondzyklus'),
        kalender('mond-b', 'Mondjahr'),
      ]),
    ],
  };
}

function sammle(kalenderSektion) {
  return collectDataKinds({
    readPath: () => undefined,
    readAreaSection: kalenderSektion
      ? (sektion) => (sektion === 'calendarSystems' ? kalenderSektion : undefined)
      : null,
  });
}

// Der ganze Weg: im Quellbereich auswählen, Datei schreiben, im Zielbereich
// lesen und planen. Geliefert wird der Plan-Eintrag der Datenart samt der
// Sektion, die daraus im Zielbereich entstünde.
async function gibWeiter(quellSektion, auswahl, zielSektion) {
  const gebaut = buildExchangeSections(await sammle(quellSektion), auswahl);
  expect(gebaut.ok, JSON.stringify(gebaut)).toBe(true);
  const datei = writeExchangeFile({ kind: 'setup', sections: gebaut.sections });
  expect(datei.ok).toBe(true);
  const gelesen = readExchangeFile(datei.text);
  expect(gelesen.ok).toBe(true);
  const plan = planeUebernahme(await sammle(zielSektion), gelesen.sections);
  const eintrag = plan.kinds.find((k) => k.id === 'calendarSystems') || null;
  return { text: datei.text, gelesen, plan, eintrag };
}

describe('Auswahl eines einzelnen Kalender-Systems (AK1, AK2)', () => {
  it('bietet die Blöcke des Bereichs einzeln zur Auswahl an', async () => {
    const eintrag = (await sammle(quelle())).find((k) => k.id === 'calendarSystems');
    expect(eintrag.entries).toEqual([
      { id: 'fiskal', name: 'Fiskaljahr', count: 1 },
      { id: 'mond', name: 'Mondkalender', count: 2 },
    ]);
    // Die Summe der Block-Zeilen ist die Zahl der Datenart-Zeile darüber.
    expect(eintrag.count).toBe(3);
  });

  it('schreibt genau den gewählten Block und keine weitere Datenart', async () => {
    const { gelesen } = await gibWeiter(quelle(), [{ id: 'calendarSystems', entries: ['mond'] }]);
    expect(gelesen.sections.map((s) => s.name)).toEqual(['calendarSystems']);
    const bloecke = gelesen.sections[0].value.calendarSystems.blocks;
    expect(bloecke).toHaveLength(1);
    expect(bloecke[0].id).toBe('mond');
    expect(bloecke[0].calendars.map((c) => c.id)).toEqual(['mond-a', 'mond-b']);
  });

  it('nimmt bei voller Auswahl unverändert den Weg der ganzen Datenart', async () => {
    const gesammelt = await sammle(quelle());
    const alles = buildExchangeSections(gesammelt, ['calendarSystems']);
    const einzeln = buildExchangeSections(gesammelt, [
      { id: 'calendarSystems', entries: ['fiskal', 'mond'] },
    ]);
    expect(einzeln.sections[0].value).toEqual(alles.sections[0].value);
  });

  it('weist eine Auswahl ohne einen einzigen Treffer ab, statt alles auszugeben', async () => {
    const gebaut = buildExchangeSections(await sammle(quelle()), [
      { id: 'calendarSystems', entries: ['gibt-es-nicht'] },
    ]);
    expect(gebaut.ok).toBe(false);
    expect(gebaut.error).toBe('empty-kind');
  });

  it('weist eine Eintrags-Auswahl auf einer Datenart ohne Einträge ab', async () => {
    const gesammelt = await collectDataKinds({
      readPath: (p) => (p === 'hotkeys' ? { 'file.save': 'Ctrl+S' } : undefined),
    });
    const gebaut = buildExchangeSections(gesammelt, [{ id: 'hotkeys', entries: ['file.save'] }]);
    expect(gebaut.ok).toBe(false);
    expect(gebaut.error).toBe('no-entry-selection');
  });
});

describe('Einlesen im Zielbereich (AK3, AK4)', () => {
  it('stellt den weitergegebenen Block im Zielbereich bereit', async () => {
    const ziel = { blocks: [block('eigen', 'Eigener', [kalender('e1', 'Eigen')])] };
    const { eintrag } = await gibWeiter(
      quelle(),
      [{ id: 'calendarSystems', entries: ['mond'] }],
      ziel,
    );
    expect(eintrag.action).toBe('append');
    expect(eintrag.hinzu).toBe(1);
    const bloecke = eintrag.values.calendarSystems.blocks;
    expect(bloecke.map((b) => b.id)).toEqual(['eigen', 'mond']);
    // Und er ist danach eine gültige Definition, nicht bloss ein Datenklumpen.
    const geprueft = normalizeCalendarConfig(eintrag.values.calendarSystems);
    expect(geprueft.blocks).toHaveLength(2);
    expect(geprueft.blocks[1].calendars).toHaveLength(2);
  });

  it('lässt den vorhandenen Bestand des Zielbereichs als Ganzes unberührt', async () => {
    const ziel = {
      blocks: [
        block('eigen', 'Eigener', [kalender('e1', 'Eigen')]),
        block('zweiter', 'Zweiter', [kalender('e2', 'Zwei')]),
      ],
    };
    const vorher = JSON.parse(JSON.stringify(ziel));
    const { eintrag } = await gibWeiter(
      quelle(),
      [{ id: 'calendarSystems', entries: ['fiskal'] }],
      ziel,
    );
    expect(ziel).toEqual(vorher);
    expect(eintrag.values.calendarSystems.blocks.slice(0, 2)).toEqual(vorher.blocks);
  });

  it('legt den Block auch in einem Zielbereich ohne jeden Block an', async () => {
    const { eintrag } = await gibWeiter(
      quelle(),
      [{ id: 'calendarSystems', entries: ['fiskal'] }],
      { blocks: [] },
    );
    expect(eintrag.hinzu).toBe(1);
    expect(eintrag.values.calendarSystems.blocks.map((b) => b.id)).toEqual(['fiskal']);
  });
});

describe('Gleichnamiger Block im Zielbereich (AK5)', () => {
  it('lässt den vorhandenen unverändert und gibt dem eingelesenen den Zusatz', async () => {
    // Der Normalfall der Weitergabe: derselbe Block, im Zielbereich
    // weiterentwickelt — gleicher Name, gleiche Kennung.
    const ziel = { blocks: [block('mond', 'Mondkalender', [kalender('anders', 'Anders')])] };
    const { eintrag } = await gibWeiter(
      quelle(),
      [{ id: 'calendarSystems', entries: ['mond'] }],
      ziel,
    );
    const bloecke = eintrag.values.calendarSystems.blocks;
    expect(bloecke).toHaveLength(2);
    expect(bloecke[0]).toEqual(ziel.blocks[0]);
    expect(bloecke[1].name).toBe('Mondkalender (2)');
    // Die Kennung weicht ebenfalls aus, sonst verlöre die Sektion einen der
    // beiden Blöcke bei der nächsten Normalisierung.
    expect(bloecke[1].id).not.toBe('mond');
    expect(normalizeCalendarConfig(eintrag.values.calendarSystems).blocks).toHaveLength(2);
    expect(eintrag.umbenannt).toEqual([{ von: 'Mondkalender', nach: 'Mondkalender (2)' }]);
  });

  it('zählt bei jedem weiteren Einlesen derselben Datei weiter', async () => {
    const ziel = {
      blocks: [
        block('mond', 'Mondkalender', [kalender('x', 'X')]),
        block('mond2', 'Mondkalender (2)', [kalender('y', 'Y')]),
      ],
    };
    const { eintrag } = await gibWeiter(
      quelle(),
      [{ id: 'calendarSystems', entries: ['mond'] }],
      ziel,
    );
    expect(eintrag.values.calendarSystems.blocks[2].name).toBe('Mondkalender (3)');
  });
});

describe('Unvollständige Definition (AK6)', () => {
  it('misst die Vollständigkeit an der bestehenden Prüfung des Modells', () => {
    expect(istVollstaendigerKalenderBlock(block('b', 'B', [kalender('k', 'K')]))).toBe(true);
    // Ein Kalender ohne Ebenen ist keine Definition.
    expect(istVollstaendigerKalenderBlock(block('b', 'B', [{ id: 'k', name: 'K' }]))).toBe(false);
    // Ein Block ohne Kennung überlebt die Normalisierung nicht.
    expect(istVollstaendigerKalenderBlock({ name: 'B', calendars: [] })).toBe(false);
    // Ein angelegter, aber leerer Block ist nicht unvollständig, sondern leer.
    expect(istVollstaendigerKalenderBlock(block('b', 'B', []))).toBe(true);
  });

  it('weist einen unvollständigen Block ab und benennt ihn', async () => {
    const kaputt = {
      blocks: [block('halb', 'Halbes System', [kalender('gut', 'Gut'), { id: 'kaputt' }])],
    };
    const ziel = { blocks: [block('eigen', 'Eigener', [kalender('e1', 'Eigen')])] };
    const { eintrag } = await gibWeiter(kaputt, ['calendarSystems'], ziel);
    expect(eintrag.hinzu).toBe(0);
    expect(eintrag.abgewiesen).toEqual(['Halbes System']);
    // Und die Sektion des Zielbereichs bleibt, wie sie war — kein halber Eintrag.
    expect(eintrag.values.calendarSystems.blocks).toEqual(ziel.blocks);
  });

  it('nimmt die vollständigen Blöcke derselben Datei gleichwohl mit', async () => {
    const gemischt = {
      blocks: [
        block('gut', 'Ganzes System', [kalender('g', 'G')]),
        block('halb', 'Halbes System', [{ id: 'kaputt' }]),
      ],
    };
    const { eintrag } = await gibWeiter(gemischt, ['calendarSystems'], { blocks: [] });
    expect(eintrag.hinzu).toBe(1);
    expect(eintrag.values.calendarSystems.blocks.map((b) => b.id)).toEqual(['gut']);
    expect(eintrag.abgewiesen).toEqual(['Halbes System']);
  });
});

describe('Der Quellbereich bleibt unverändert (AK7)', () => {
  it('rührt die Sektion des Quellbereichs bei der Ausgabe nicht an', async () => {
    const sektion = quelle();
    const vorher = JSON.parse(JSON.stringify(sektion));
    const gesammelt = await sammle(sektion);
    const gebaut = buildExchangeSections(gesammelt, [{ id: 'calendarSystems', entries: ['mond'] }]);
    // Auch ein Aufrufer, der das Ergebnis verändert, greift nicht zurück.
    gebaut.sections[0].value.calendarSystems.blocks[0].name = 'VERAENDERT';
    gebaut.sections[0].value.calendarSystems.blocks.length = 0;
    expect(sektion).toEqual(vorher);
  });
});

describe('Auswahl-Deklaration und Merge-Liste meinen dasselbe', () => {
  it('löst die Auswahl gegen die Merge-Liste auf, statt sie zu wiederholen', () => {
    const kind = dataKindById('calendarSystems');
    const auswahl = entrySelectionOf(kind);
    const liste = kind.merge.lists[kind.auswahl.liste];
    expect(auswahl.path).toBe(liste.path);
    expect(auswahl.at).toBe(liste.at);
    expect(auswahl.idKey).toBe(liste.idKey);
    expect(auswahl.nameKey).toBe(liste.nameKey);
  });

  it('gibt jeder Datenart mit Auswahl-Deklaration eine auflösbare Merge-Liste', () => {
    for (const kind of DATA_KINDS) {
      if (!kind.auswahl) continue;
      const auswahl = entrySelectionOf(kind);
      expect(auswahl, kind.id).not.toBeNull();
      expect(typeof auswahl.idKey, kind.id).toBe('string');
      expect(typeof auswahl.nameKey, kind.id).toBe('string');
    }
  });
});
