// 4T-001594 (Story 4S-000905, Epic 3E-000129): Wächter über das Lesen der
// eingespielten eigenen Sprachen (src/main/app/custom-locales.js).
//
// Der Lese-Weg ist die Stelle, an der fremder Text zum zweiten Mal in die
// Anwendung kommt: Die Datei liegt in einem Ordner, den der Anwender mit jedem
// Editor erreicht, und was von dort gelesen wird, steht anschliessend in den
// Menüs, in den Dialogen des Betriebssystems und in den generierten
// Handbuch-Seiten. Gemessen wird deshalb beides — dass eine gültige Datei
// ankommt UND dass jeder Fehl-Zustand als solcher gemeldet wird statt als
// halber Katalog durchzurutschen. Ein Leser, der alles annimmt, wäre grün.
//
// Gemessen wird am ECHTEN Dateisystem in einem Temp-Ordner, nicht an einem
// gestellten `fs`: Der Pfad-Guard ist die Sicherheits-Zusicherung dieses
// Moduls, und ein gestelltes Dateisystem prüfte die Zusicherung gegen sich
// selbst.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  leseEigeneSprache,
  listeEigeneSprachen,
  localeDateiIn,
  fehlendeGegenReferenz,
  aktualisierteFassung,
  lueckenMerkerFaellig,
  LUECKEN_MERKER,
} from '../../src/main/app/custom-locales.js';
import { schreibeSprachdatei, pruefeSprachdatei } from '../../src/shared/locale-file.js';
import { customLocaleId } from '../../src/shared/locales.js';

// Bezugsgrösse der Prüfung ist im Betrieb die englische Fassung. Hier steht
// ein kleiner, selbst gebauter Katalog: Der Fall misst den LESE-Weg, und ein
// Bestands-Katalog machte jeden Fall von einer Sprachdatei abhängig, die
// dieser Task gar nicht anfasst (die Prüfung selbst hat ihren eigenen Wächter
// in locale-file.test.js).
const REFERENZ = {
  'menu.file.title': 'File',
  'menu.file.removeLocale': 'Remove…',
  'locales.import.done': "Language '{name}' loaded: {n} entries",
};
const MITGELIEFERT = ['de', 'en'];

let wurzel;

beforeEach(() => {
  wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-locales-'));
});

afterEach(() => {
  try {
    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
  }
});

/** Legt eine Sprachdatei im Temp-Ordner ab, wie das Einspielen es tut. */
function lege(code, name, werte) {
  fs.writeFileSync(path.join(wurzel, `${code}.json`), schreibeSprachdatei(code, name, werte));
}

const lies = (id) => leseEigeneSprache(wurzel, id, REFERENZ, MITGELIEFERT);

describe('Lesen einer eingespielten Sprache (4T-001594)', () => {
  // --- Die Gegenrichtung zuerst: was ankommen MUSS -------------------------

  it('liefert Kennung, Code, Namen und die Werte ohne die Metadaten-Felder', () => {
    lege('nds', 'Plattdüütsch', {
      'menu.file.title': 'Datei',
      'menu.file.removeLocale': 'Wegdoon…',
    });
    const e = lies('custom:nds');
    expect(e.ok).toBe(true);
    expect(e.id).toBe('custom:nds');
    expect(e.code).toBe('nds');
    expect(e.name).toBe('Plattdüütsch');
    expect(e.werte).toEqual({
      'menu.file.title': 'Datei',
      'menu.file.removeLocale': 'Wegdoon…',
    });
    // Die Kennung der Datei benennt sich selbst — die @@-Felder sind keine
    // Übersetzung und dürfen nicht als Katalog-Schlüssel auftauchen.
    expect(Object.keys(e.werte).some((k) => k.startsWith('@@'))).toBe(false);
  });

  it('kommt mit einem UTF-8-BOM zurecht', () => {
    // Im Editor unsichtbar, für den JSON-Parser tödlich: Die Datei ist nicht
    // falsch, nur anders gespeichert.
    fs.writeFileSync(
      path.join(wurzel, 'nds.json'),
      '\uFEFF' + schreibeSprachdatei('nds', 'Plattdüütsch', { 'menu.file.title': 'Datei' }),
    );
    expect(lies('custom:nds').ok).toBe(true);
  });

  // --- Und was NICHT durchgehen darf --------------------------------------

  it('weist eine Angabe zurück, die gar keine Kennung einer eigenen Sprache ist', () => {
    lege('nds', 'Plattdüütsch', { 'menu.file.title': 'Datei' });
    expect(lies('nds')).toEqual({ ok: false, error: 'unbekannt' });
    expect(lies('de')).toEqual({ ok: false, error: 'unbekannt' });
    expect(lies('')).toEqual({ ok: false, error: 'unbekannt' });
    expect(lies(null)).toEqual({ ok: false, error: 'unbekannt' });
  });

  it('meldet die fehlende Datei als fehlend — der Fall der entfernten Sprache', () => {
    expect(lies('custom:nds')).toEqual({ ok: false, error: 'fehlt' });
  });

  it('weist eine nachträglich unbrauchbar gemachte Datei ab, statt sie zu zeigen', () => {
    // Der Anwender hat die abgelegte Datei im Editor geöffnet und zerschossen.
    fs.writeFileSync(path.join(wurzel, 'nds.json'), '{ kein JSON');
    const e = lies('custom:nds');
    expect(e.ok).toBe(false);
    expect(e.error).toBe('ungueltig');
    expect(e.detail).toBe('kein-json');
  });

  it('weist einen Wert ab, der eine Auszeichnung führt, die das Original nicht hat', () => {
    // Die Sicherheits-Zusicherung gilt beim LESEN und nicht nur beim
    // Einspielen: Diese Datei hätte das Einspielen nie passiert.
    lege('nds', 'Plattdüütsch', { 'menu.file.title': '[Datei](javascript:alert(1))' });
    const e = lies('custom:nds');
    expect(e.ok).toBe(false);
    expect(e.error).toBe('ungueltig');
  });

  it('weist eine Datei ohne einen einzigen bekannten Schlüssel ab', () => {
    lege('nds', 'Plattdüütsch', { 'gibt.es.nicht': 'Datei' });
    expect(lies('custom:nds')).toEqual({
      ok: false,
      error: 'ungueltig',
      detail: 'keine-bekannten-schluessel',
    });
  });

  // --- Der Pfad-Guard ------------------------------------------------------

  it('lässt eine Kennung mit Pfad-Anteil nicht aus der Wurzel heraus', () => {
    // Eine Datei ausserhalb, die es wirklich gibt: Ohne Guard läse der Weg
    // sie, denn `custom:../fremd` ist eine formal gültige Kennung.
    const drueber = path.dirname(wurzel);
    const fremd = path.join(drueber, `fremd-${path.basename(wurzel)}.json`);
    fs.writeFileSync(fremd, schreibeSprachdatei('nds', 'Fremd', { 'menu.file.title': 'X' }));
    try {
      const relativ = `../${path.basename(fremd, '.json')}`;
      expect(lies(customLocaleId(relativ)).ok).toBe(false);
      expect(lies(customLocaleId('../x')).error).toBe('unbekannt');
      expect(lies(customLocaleId('..\\x')).error).toBe('unbekannt');
      expect(lies(customLocaleId('C:/Windows/win')).error).toBe('unbekannt');
    } finally {
      fs.rmSync(fremd, { force: true });
    }
  });

  it('localeDateiIn liefert den Pfad in der Wurzel und sonst null', () => {
    expect(localeDateiIn(wurzel, 'nds')).toBe(path.join(wurzel, 'nds.json'));
    expect(localeDateiIn(wurzel, 'nds-DE')).toBe(path.join(wurzel, 'nds-DE.json'));
    expect(localeDateiIn(wurzel, '../x')).toBeNull();
    expect(localeDateiIn(wurzel, 'a/b')).toBeNull();
    expect(localeDateiIn(wurzel, '')).toBeNull();
    // Gegenprobe der Erkennung: Ein zulässiger Code MUSS einen Pfad ergeben,
    // sonst wäre der Guard nur deshalb dicht, weil er alles ablehnt.
    expect(localeDateiIn(wurzel, 'nds')).not.toBeNull();
  });
});

describe('Liste der eingespielten Sprachen (4T-001594)', () => {
  it('nennt Kennung, Code, Anzeige-Name und Umfang aus den Metadaten', () => {
    lege('nds', 'Plattdüütsch', { 'menu.file.title': 'Datei', 'gibt.es.nicht': 'X' });
    const liste = listeEigeneSprachen(wurzel, MITGELIEFERT);
    expect(liste).toEqual([{ id: 'custom:nds', code: 'nds', name: 'Plattdüütsch', keys: 2 }]);
  });

  it('übergeht, was keine Sprachdatei ist, statt daran zu scheitern', () => {
    lege('nds', 'Plattdüütsch', { 'menu.file.title': 'Datei' });
    fs.writeFileSync(path.join(wurzel, 'kaputt.json'), '{ kein JSON');
    fs.writeFileSync(path.join(wurzel, 'ohne-metadaten.json'), '{"menu.file.title":"Datei"}');
    fs.writeFileSync(path.join(wurzel, 'notizen.txt'), 'kein Katalog');
    // Ein mitgelieferter Code ist belegt und tritt hier nicht neben sich selbst.
    fs.writeFileSync(
      path.join(wurzel, 'de.json'),
      schreibeSprachdatei('de', 'Deutsch', { a: 'b' }),
    );
    expect(listeEigeneSprachen(wurzel, MITGELIEFERT).map((s) => s.id)).toEqual(['custom:nds']);
  });

  it('ist leer, solange nichts eingespielt ist — auch ohne den Ordner', () => {
    expect(listeEigeneSprachen(wurzel, MITGELIEFERT)).toEqual([]);
    expect(listeEigeneSprachen(path.join(wurzel, 'gibt-es-nicht'), MITGELIEFERT)).toEqual([]);
  });
});

// 4T-001596 (Story 4S-000905, Epic 3E-000129): Die beiden electron-freien
// Bausteine des Alterungs-Hinweises.
describe('fehlende Einträge gegen die Bezugs-Fassung (4T-001596)', () => {
  it('nennt die fehlenden Schlüssel in der Reihenfolge der Bezugs-Fassung', () => {
    const werte = { 'menu.file.removeLocale': 'Wegdoon…' };
    // Nicht alphabetisch: Wer die ausgegebene Datei neben die Vorlage legt,
    // findet dieselben Einträge an denselben Stellen wieder.
    expect(fehlendeGegenReferenz(werte, REFERENZ)).toEqual([
      'menu.file.title',
      'locales.import.done',
    ]);
  });

  it('ist leer, wenn die eigene Sprache vollständig ist', () => {
    expect(fehlendeGegenReferenz({ ...REFERENZ }, REFERENZ)).toEqual([]);
  });

  it('zählt einen Eintrag der eigenen Sprache, den die Bezugs-Fassung nicht kennt, nicht mit', () => {
    // Der Gegen-Fall gehört zu 4T-001593 (unbekannte Schlüssel beim
    // Einspielen); hier darf er die Zahl der Lücke nicht verfälschen.
    const werte = { ...REFERENZ, 'aus.alter.fassung': 'Rest' };
    expect(fehlendeGegenReferenz(werte, REFERENZ)).toEqual([]);
  });
});

// Entscheidung des Product Owners vom 2026-09-10: Der Bedien-Weg gibt nicht
// die Lueckenliste aus, sondern die VOLLSTAENDIGE eigene Sprachdatei auf dem
// Stand der laufenden Programmfassung. Gemessen wird genau das, was der
// Anwender danach vor sich hat.
describe('aktualisierte Fassung der eigenen Sprachdatei (4T-001596)', () => {
  const EIGENE = {
    'menu.file.removeLocale': 'Wegdoon…',
  };

  it('stellt die beiden Metadaten-Felder voran und folgt sonst der Bezugs-Fassung', () => {
    const fassung = aktualisierteFassung('nds', 'Plattdüütsch', EIGENE, REFERENZ);
    // Nicht alphabetisch und nicht in der Reihenfolge der eigenen Datei: Wer
    // die neue Fassung neben die Vorlage legt, findet dieselben Einträge an
    // denselben Stellen.
    expect(Object.keys(fassung)).toEqual(['@@locale', '@@name', ...Object.keys(REFERENZ)]);
    expect(fassung['@@locale']).toBe('nds');
    expect(fassung['@@name']).toBe('Plattdüütsch');
  });

  it('erhält die eigenen Übersetzungen und füllt die Lücken englisch auf', () => {
    const fassung = aktualisierteFassung('nds', 'Plattdüütsch', EIGENE, REFERENZ);
    // Der Kern des Weges: Die Arbeit des Übersetzers bleibt stehen …
    expect(fassung['menu.file.removeLocale']).toBe('Wegdoon…');
    // … und was diese Programmfassung hinzugefügt hat, steht auf Englisch an
    // seiner Stelle — zu übersetzen, nicht zu suchen.
    expect(fassung['menu.file.title']).toBe(REFERENZ['menu.file.title']);
    expect(fassung['locales.import.done']).toBe(REFERENZ['locales.import.done']);
  });

  it('lässt einen eigenen Eintrag weg, den die Bezugs-Fassung nicht kennt', () => {
    // Der Rest aus einer älteren Vorlage: Beim Einspielen wird er ohnehin
    // übersprungen (4T-001593), und in der neuen Fassung hat er nichts
    // verloren — sonst wüchse die Datei mit jedem Durchgang um Karteileichen.
    const fassung = aktualisierteFassung(
      'nds',
      'Plattdüütsch',
      { ...EIGENE, 'aus.alter.fassung': 'Rest' },
      REFERENZ,
    );
    expect('aus.alter.fassung' in fassung).toBe(false);
    expect(Object.keys(fassung)).toHaveLength(Object.keys(REFERENZ).length + 2);
  });

  it('ergibt im Rundlauf eine gültige und vollständige Sprachdatei', () => {
    // Die schärfste Probe: Was der Anwender speichert, muss sich ohne weitere
    // Hand wieder einspielen lassen — und danach keine Lücke mehr aufweisen.
    const fassung = aktualisierteFassung('nds', 'Plattdüütsch', EIGENE, REFERENZ);
    const text = schreibeSprachdatei('nds', 'Plattdüütsch', fassung);
    const geprueft = pruefeSprachdatei(text, REFERENZ, MITGELIEFERT);
    expect(geprueft.ok).toBe(true);
    expect(geprueft.name).toBe('Plattdüütsch');
    expect(geprueft.uebersprungen).toEqual([]);
    expect(fehlendeGegenReferenz(geprueft.werte, REFERENZ)).toEqual([]);
    expect(geprueft.werte['menu.file.removeLocale']).toBe('Wegdoon…');
  });
});

describe('Wiederholungs-Sperre des Alterungs-Hinweises (4T-001596)', () => {
  // Ein Speicher wie der der Anwendung: get, set, delete über eine Map. Der
  // echte electron-store hängt an Electron, und gemessen wird hier die
  // Entscheidung, nicht die Ablage.
  function stelleSpeicher(anfang = {}) {
    const werte = new Map(Object.entries(anfang));
    return {
      get: (key) => werte.get(key),
      set: (key, value) => werte.set(key, value),
      delete: (key) => werte.delete(key),
      hat: (key) => werte.has(key),
    };
  }

  it('meldet den ersten Stand und schreibt ihn als Tripel fort', () => {
    const store = stelleSpeicher();
    expect(lueckenMerkerFaellig(store, 'custom:nds', 7, '1.2.3')).toBe(true);
    expect(store.get(LUECKEN_MERKER)).toEqual({ id: 'custom:nds', count: 7, version: '1.2.3' });
  });

  // AK6, erster Teil: Derselbe Stand meldet sich nicht bei jedem Start erneut.
  it('meldet denselben Stand nicht erneut', () => {
    const store = stelleSpeicher();
    expect(lueckenMerkerFaellig(store, 'custom:nds', 7, '1.2.3')).toBe(true);
    expect(lueckenMerkerFaellig(store, 'custom:nds', 7, '1.2.3')).toBe(false);
    expect(lueckenMerkerFaellig(store, 'custom:nds', 7, '1.2.3')).toBe(false);
  });

  // AK6, zweiter Teil: Eine geänderte Zahl ist ein neuer Stand — der Anwender
  // hat eine andere Fassung seiner Datei eingespielt.
  it('meldet eine geänderte Zahl wieder', () => {
    const store = stelleSpeicher({
      [LUECKEN_MERKER]: { id: 'custom:nds', count: 7, version: '1.2.3' },
    });
    expect(lueckenMerkerFaellig(store, 'custom:nds', 5, '1.2.3')).toBe(true);
    expect(store.get(LUECKEN_MERKER).count).toBe(5);
  });

  // AK6, dritter Teil und der eigentliche Zweck des Tasks: Eine neue
  // Programmfassung bringt neue Schlüssel mit, ohne dass sich an der Datei
  // etwas geändert hätte.
  it('meldet eine geänderte Programm-Version wieder', () => {
    const store = stelleSpeicher({
      [LUECKEN_MERKER]: { id: 'custom:nds', count: 7, version: '1.2.3' },
    });
    expect(lueckenMerkerFaellig(store, 'custom:nds', 7, '1.3.0')).toBe(true);
    expect(store.get(LUECKEN_MERKER).version).toBe('1.3.0');
  });

  it('meldet eine andere eigene Sprache wieder', () => {
    const store = stelleSpeicher({
      [LUECKEN_MERKER]: { id: 'custom:nds', count: 7, version: '1.2.3' },
    });
    expect(lueckenMerkerFaellig(store, 'custom:frr', 7, '1.2.3')).toBe(true);
    expect(store.get(LUECKEN_MERKER).id).toBe('custom:frr');
  });

  // AK5: Ohne Lücke kein Hinweis — und der Merker verschwindet, damit die
  // nächste Lücke wieder eine neue ist.
  it('löscht den Merker, wenn keine Lücke mehr besteht', () => {
    const store = stelleSpeicher({
      [LUECKEN_MERKER]: { id: 'custom:nds', count: 7, version: '1.2.3' },
    });
    expect(lueckenMerkerFaellig(store, 'custom:nds', 0, '1.2.3')).toBe(false);
    expect(store.hat(LUECKEN_MERKER)).toBe(false);
    // Und die nächste Lücke meldet sich wieder, statt am alten Tripel zu
    // scheitern.
    expect(lueckenMerkerFaellig(store, 'custom:nds', 7, '1.2.3')).toBe(true);
  });

  it('lässt den Merker einer anderen Sprache stehen', () => {
    const store = stelleSpeicher({
      [LUECKEN_MERKER]: { id: 'custom:nds', count: 7, version: '1.2.3' },
    });
    expect(lueckenMerkerFaellig(store, 'custom:frr', 0, '1.2.3')).toBe(false);
    expect(store.get(LUECKEN_MERKER).id).toBe('custom:nds');
  });

  it('ohne Speicher meldet nichts, statt zu werfen', () => {
    expect(lueckenMerkerFaellig(null, 'custom:nds', 7, '1.2.3')).toBe(false);
  });
});
