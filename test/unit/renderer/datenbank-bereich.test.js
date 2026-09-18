// @vitest-environment jsdom
// 4T-001758 (Epic 3E-000253, AK2): Unit-Tests des einen Helfers, über den der
// Anzeige-Prozess die Datenbank-Auskunft des Bereichs bezieht.
//
// Drei Zusagen hängen an ihm, und jede einzeln würde sonst erst dem Anwender
// auffallen: dass gleichzeitige Frager sich eine Anfrage teilen, dass eine
// bereite Antwort bis zum Bereichs-Wechsel gehalten wird, und dass ein noch
// nicht bereiter Stand eben NICHT gehalten wird — sonst führte die Anwendung
// einen Datenbank-Bereich, dessen Index beim Öffnen der Seite noch im Aufbau
// war, bis zum nächsten Bereichs-Wechsel als gewöhnlichen Bereich.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Der Kanal wird je Fall gestellt; der Zähler belegt die Anfrage-Ersparnis.
let antworten = [];
let rufe = 0;
window.api.databaseOverview = async () => {
  rufe += 1;
  return antworten.length > 1 ? antworten.shift() : antworten[0];
};
// Die Index-Meldung wird festgehalten, damit ein Fall sie auslösen kann.
let indexMeldung = null;
window.api.onBacklinksInvalidated = (cb) => {
  indexMeldung = cb;
};

const helfer = await import('../../../src/renderer/modules/database/datenbank-bereich.js');

function bereit(ueberschreibungen = {}) {
  return {
    status: 'ready',
    istDatenbankBereich: true,
    steckbrief: { name: 'Mini-CRM' },
    tabellen: [{ name: 'Personen', hints: [] }],
    hints: [],
    ...ueberschreibungen,
  };
}

beforeEach(() => {
  // 4T-001759: mit `bereichsWechsel`, weil seither auch die synchrone Antwort
  // zurückgesetzt werden muss — sie überlebt eine bloße Index-Meldung.
  helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
  rufe = 0;
  antworten = [bereit()];
});

describe('Datenbank-Auskunft des Bereichs (4T-001758)', () => {
  it('beantwortet die Frage nach der Bereichs-Art aus dem Kanal', async () => {
    expect(await helfer.istDatenbankBereich()).toBe(true);
    antworten = [bereit({ istDatenbankBereich: false, steckbrief: null })];
    helfer.verwirfDatenbankAuskunft();
    expect(await helfer.istDatenbankBereich()).toBe(false);
  });

  it('hält eine bereite Antwort und fragt nicht erneut', async () => {
    await helfer.datenbankAuskunft();
    await helfer.datenbankAuskunft();
    await helfer.istDatenbankBereich();
    expect(rufe).toBe(1);
  });

  it('teilt eine laufende Anfrage unter gleichzeitigen Fragern', async () => {
    const [a, b] = await Promise.all([helfer.datenbankAuskunft(), helfer.datenbankAuskunft()]);
    expect(rufe).toBe(1);
    expect(a).toBe(b);
  });

  it('hält einen noch nicht bereiten Stand NICHT', async () => {
    // Der Index einer eben geöffneten Wurzel ist noch im Aufbau: Die Antwort
    // «keine Datenbank» ist hier keine Aussage über den Bestand.
    antworten = [
      { status: 'indexing', istDatenbankBereich: false, steckbrief: null, tabellen: [], hints: [] },
      bereit(),
    ];
    expect(await helfer.istDatenbankBereich()).toBe(false);
    expect(await helfer.istDatenbankBereich()).toBe(true);
    expect(rufe).toBe(2);
  });

  it('macht aus einem gescheiterten Kanal-Aufruf die leere Auskunft', async () => {
    window.api.databaseOverview = async () => {
      rufe += 1;
      throw new Error('kein Kanal');
    };
    const ergebnis = await helfer.datenbankAuskunft();
    expect(ergebnis.istDatenbankBereich).toBe(false);
    expect(ergebnis.status).toBe('unavailable');
    expect(ergebnis.tabellen).toEqual([]);
    // Auch der Fehlerfall wird nicht gehalten.
    await helfer.datenbankAuskunft();
    expect(rufe).toBe(2);
    window.api.databaseOverview = async () => {
      rufe += 1;
      return antworten.length > 1 ? antworten.shift() : antworten[0];
    };
  });

  it('verwirft die Auskunft, wenn der Index sich meldet', async () => {
    // Die Meldung kommt beim Fertigwerden des Index und bei jeder Änderung des
    // Bestands: Wer einen Steckbrief schreibt, macht den Bereich zur Datenbank.
    expect(typeof indexMeldung).toBe('function');
    await helfer.datenbankAuskunft();
    expect(rufe).toBe(1);
    antworten = [bereit({ istDatenbankBereich: false, steckbrief: null })];
    indexMeldung();
    expect(await helfer.istDatenbankBereich()).toBe(false);
    expect(rufe).toBe(2);
  });

  it('verwirft die Auskunft auf Anforderung, etwa beim Bereichs-Wechsel', async () => {
    await helfer.datenbankAuskunft();
    helfer.verwirfDatenbankAuskunft();
    antworten = [bereit({ istDatenbankBereich: false })];
    expect(await helfer.istDatenbankBereich()).toBe(false);
    expect(rufe).toBe(2);
  });
});

// 4T-001759 (Epic 3E-000253): Die synchrone Antwort. Sie ist für die
// Verbraucher da, die im Moment des Klicks entscheiden müssen und nicht warten
// können — das Kontextmenü des Bereichs-Panels. Ihre Lebensdauer ist deshalb
// eine andere als die des Zwischenspeichers: Sie überlebt die Index-Meldung
// und fällt erst mit dem Bereich.
describe('Synchrone Antwort für Menüs (4T-001759)', () => {
  it('antwortet mit Nein, solange noch niemand gefragt hat', () => {
    expect(helfer.istDatenbankBereichSofort()).toBe(false);
  });

  it('übernimmt die erste bereite Antwort', async () => {
    await helfer.datenbankAuskunft();
    expect(helfer.istDatenbankBereichSofort()).toBe(true);
  });

  it('übernimmt einen noch nicht bereiten Stand nicht', async () => {
    antworten = [
      { status: 'indexing', istDatenbankBereich: false, steckbrief: null, tabellen: [], hints: [] },
    ];
    await helfer.datenbankAuskunft();
    expect(helfer.istDatenbankBereichSofort()).toBe(false);
  });

  it('überlebt eine Index-Meldung und fällt erst mit dem Bereichs-Wechsel', async () => {
    await helfer.datenbankAuskunft();
    indexMeldung();
    expect(helfer.istDatenbankBereichSofort()).toBe(true);
    helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
    expect(helfer.istDatenbankBereichSofort()).toBe(false);
  });
});
