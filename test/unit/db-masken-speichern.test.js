// @vitest-environment jsdom
// 4T-001940 (Epic 3E-000257, Bauplan B4 bis B7, AK1, AK3 bis AK5): Speichern und
// Löschen aus der Einzel-Maske — der Auftrag je Art, die Zuordnung der Lagen zu
// Feld und Kopf, die Bausteine der Rückfrage und der Wahl und der Ablauf auf
// einem Zustands-Objekt.
//
// **Gemessen wird ohne Fenster-Zustand**: Das Modul nimmt Kanal, Zeichnen und
// Statuszeile als Rückrufe; die Seite um es herum prüft der Ablauf-Fall
// DB-MAS-02 und DB-MAS-03 an der laufenden Anwendung.
//
// **Der deutsche Katalog wird geladen** (Muster `db-masken-felder.test.js`),
// weil die Meldung am Feld ein Satz sein soll und kein Schlüssel-Name.
import { describe, it, expect, vi } from 'vitest';
import de from '../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const {
  ART_ANLEGEN,
  ART_AENDERN,
  ART_LOESCHEN,
  LAGE_FREMD,
  baueAuftrag,
  erzwungen,
  verarbeiteErgebnis,
  markiereFeld,
  baueKopfBefunde,
  baueFremdWahl,
  baueLoeschFrage,
  erzeugeSpeicherAblauf,
} = await import('../../src/renderer/modules/database/masken-speichern.js');
const { baueFeldElement, MODUS_BEARBEITEN } =
  await import('../../src/renderer/modules/database/masken-felder.js');

const TAB = 'C:/Bereich/Kunden.md';
const FELDER = ['Name', 'Menge', 'Aktiv'];
const ERWARTET = { Name: 'Anna', Menge: '12', Aktiv: 'x' };
const hat = (key) => Object.prototype.hasOwnProperty.call(de, key);
const UMGEBUNG = { t: i18n.t, hat, sprache: 'de', felder: FELDER };

describe('Der Auftrag je Art (B4)', () => {
  it('Anlegen nennt Kennung und alle nicht leeren Felder, keine Erwartung', () => {
    const auftrag = baueAuftrag({
      art: ART_ANLEGEN,
      tabellenPfad: TAB,
      kennung: 'r-00003',
      entwurf: { Name: 'Carla', Menge: '', Aktiv: 'x' },
      felderDesKoerpers: FELDER,
    });
    expect(auftrag).toEqual({
      anweisungen: [
        { tabelle: TAB, art: 'create', id: 'r-00003', werte: { Name: 'Carla', Aktiv: 'x' } },
      ],
    });
  });

  it('Ändern nennt nur geänderte Felder, ein geleertes als null, und die ganze Erwartung', () => {
    const auftrag = baueAuftrag({
      art: ART_AENDERN,
      tabellenPfad: TAB,
      kennung: 'r-00001',
      entwurf: { Name: 'Anna B.', Menge: '12', Aktiv: '' },
      erwartet: ERWARTET,
      felderDesKoerpers: FELDER,
    });
    expect(auftrag).toEqual({
      anweisungen: [
        {
          tabelle: TAB,
          art: 'update',
          id: 'r-00001',
          werte: { Name: 'Anna B.', Aktiv: null },
          erwartet: ERWARTET,
        },
      ],
    });
    // Die Erwartung ist eine Kopie, kein Verweis auf den Seiten-Zustand.
    expect(auftrag.anweisungen[0].erwartet).not.toBe(ERWARTET);
  });

  it('Ändern ohne Änderung ergibt keinen Auftrag', () => {
    expect(
      baueAuftrag({
        art: ART_AENDERN,
        tabellenPfad: TAB,
        kennung: 'r-00001',
        entwurf: { ...ERWARTET },
        erwartet: ERWARTET,
        felderDesKoerpers: FELDER,
      }),
    ).toBeNull();
  });

  it('Löschen nennt Kennung und Erwartung, keine Werte', () => {
    expect(
      baueAuftrag({ art: ART_LOESCHEN, tabellenPfad: TAB, kennung: 'r-00001', erwartet: ERWARTET }),
    ).toEqual({
      anweisungen: [{ tabelle: TAB, art: 'delete', id: 'r-00001', erwartet: ERWARTET }],
    });
  });

  it('Erzwingen steht an der Anweisung, und «erzwungen» setzt es an jede', () => {
    const auftrag = baueAuftrag({
      art: ART_LOESCHEN,
      tabellenPfad: TAB,
      kennung: 'r-00001',
      erwartet: ERWARTET,
      erzwingen: true,
    });
    expect(auftrag.anweisungen[0].erzwingen).toBe(true);
    const ohne = baueAuftrag({
      art: ART_LOESCHEN,
      tabellenPfad: TAB,
      kennung: 'r-1',
      erwartet: {},
    });
    expect(ohne.anweisungen[0]).not.toHaveProperty('erzwingen');
    expect(erzwungen(ohne).anweisungen[0].erzwingen).toBe(true);
    expect(ohne.anweisungen[0]).not.toHaveProperty('erzwingen');
  });

  it('eine unbekannte Art ergibt keinen Auftrag', () => {
    expect(baueAuftrag({ art: 'merge', tabellenPfad: TAB, kennung: 'r-1' })).toBeNull();
  });
});

describe('Zuordnung der Lagen zu Feld und Kopf (B5)', () => {
  it('Erfolg ist Erfolg', () => {
    expect(verarbeiteErgebnis({ ok: true }, UMGEBUNG).ok).toBe(true);
  });

  it('eine Lage mit Feld steht am Feld, unabhängig von der Schreibung; Fokus auf dem ersten in Masken-Reihenfolge', () => {
    const befunde = verarbeiteErgebnis(
      {
        ok: false,
        lagen: [
          { code: 'auftragTypVerletzt', position: 0, feld: 'Menge' },
          { code: 'auftragPflichtAngabeFehlt', position: 0, feld: 'name' },
        ],
      },
      UMGEBUNG,
    );
    expect(befunde.amFeld).toEqual({
      Menge: ['Der Wert im Feld «Menge» passt nicht zu dessen Art; bitte den Wert prüfen.'],
      Name: ['Das Feld «name» muss ausgefüllt sein.'],
    });
    expect(befunde.kopf).toEqual([]);
    expect(befunde.fokus).toBe('Name');
  });

  it('eine Datensatz-Regel markiert alle ihre Felder und steht am Kopf', () => {
    const befunde = verarbeiteErgebnis(
      {
        ok: false,
        lagen: [
          {
            code: 'auftragPruefBefund',
            position: 0,
            naht: {
              code: 'regelDatensatzregelVerletzt',
              id: 'r-00001',
              tabelle: TAB,
              felder: ['Menge', 'Aktiv'],
              regel: 'r',
              meldung: '',
            },
          },
        ],
      },
      UMGEBUNG,
    );
    expect(befunde.markiert).toEqual(['Menge', 'Aktiv']);
    expect(befunde.kopf).toHaveLength(1);
    expect(befunde.fokus).toBe('Menge');
  });

  it('eine Lage ohne Feld der Maske steht am Kopf, der Lösch-Schutz eingeschlossen', () => {
    const befunde = verarbeiteErgebnis(
      {
        ok: false,
        lagen: [
          { code: 'auftragFeldUnbekannt', position: 0, tabelle: TAB, feld: 'Farbe' },
          {
            code: 'auftragPruefBefund',
            naht: {
              code: 'regelLoeschenAbhaengige',
              id: 'r-00001',
              zieltabelle: 'Bestellungen',
              felder: ['Name'],
              anzahl: 2,
              anzeige: 'r-00009',
            },
          },
        ],
      },
      UMGEBUNG,
    );
    expect(befunde.amFeld).toEqual({});
    // Die Felder des Lösch-Schutzes gehören der abhängigen Tabelle.
    expect(befunde.markiert).toEqual([]);
    expect(befunde.kopf).toEqual([
      'Die Tabelle «Kunden» kennt kein Feld «Farbe».',
      'Der Datensatz r-00001 lässt sich nicht löschen, weil noch 2 Datensätze der Tabelle «Bestellungen» über «Name» auf ihn verweisen, zum Beispiel r-00009.',
    ]);
    expect(befunde.fokus).toBeNull();
  });

  it('die Fremd-Änderung öffnet die Wahl und steht nicht in der Kopf-Liste', () => {
    const befunde = verarbeiteErgebnis(
      {
        ok: false,
        lagen: [{ code: LAGE_FREMD, position: 0, tabelle: TAB, id: 'r-00001', felder: [] }],
      },
      UMGEBUNG,
    );
    expect(befunde.fremd).toContain('wurde inzwischen anderweitig geändert');
    expect(befunde.kopf).toEqual([]);
  });

  it('der Kanal ohne Zugriff ergibt den Satz des fehlenden Zugriffs im Kopf', () => {
    expect(verarbeiteErgebnis({ status: 'unavailable' }, UMGEBUNG).kopf).toEqual([
      de['database.form.noAccess'],
    ]);
  });

  it('bei mehreren Anweisungen steht das Präfix, ab 1 gezählt', () => {
    const befunde = verarbeiteErgebnis(
      {
        ok: false,
        lagen: [
          { code: 'auftragPflichtAngabeFehlt', position: 0, feld: 'Name' },
          { code: 'auftragPflichtAngabeFehlt', position: 1, feld: 'Name' },
        ],
      },
      UMGEBUNG,
    );
    expect(befunde.amFeld.Name).toEqual([
      'Anweisung 1: Das Feld «Name» muss ausgefüllt sein.',
      'Anweisung 2: Das Feld «Name» muss ausgefüllt sein.',
    ]);
  });
});

describe('DOM-Bausteine (B5, B6)', () => {
  function feldElement(name, zelle = null) {
    return baueFeldElement({
      feld: { name, type: 'string' },
      zelle,
      modus: MODUS_BEARBEITEN,
    });
  }

  it('die Meldung steht am Feld, das Feld ist markiert; ein anderes Feld bleibt unberührt', () => {
    const befunde = { amFeld: { Name: ['Satz A.', 'Satz B.'] }, markiert: [], kopf: [] };
    const name = feldElement('Name');
    const menge = feldElement('Menge');
    markiereFeld(name, befunde);
    markiereFeld(menge, befunde);
    expect(name.classList.contains('db-form-marked')).toBe(true);
    expect(name.querySelector('.db-form-message').textContent).toBe('Satz A. Satz B.');
    expect(menge.classList.contains('db-form-marked')).toBe(false);
    expect(menge.querySelector('.db-form-message').textContent).toBe('');
  });

  it('eine Meldung des Lesens bleibt vor der Meldung des Auftrags stehen', () => {
    const element = feldElement('Name', { name: 'Name', text: '', error: 'required' });
    markiereFeld(element, { amFeld: { Name: ['Neu.'] }, markiert: [], kopf: [] });
    expect(element.querySelector('.db-form-message').textContent).toBe(
      `${de['database.form.cellError.required']} Neu.`,
    );
  });

  it('ein nur markiertes Feld trägt die Markierung ohne Meldung', () => {
    const element = feldElement('Menge');
    markiereFeld(element, { amFeld: {}, markiert: ['Menge'], kopf: [] });
    expect(element.classList.contains('db-form-marked')).toBe(true);
    expect(element.querySelector('.db-form-message').textContent).toBe('');
  });

  it('die Kopf-Liste trägt je Lage einen Eintrag, und ohne Lage gibt es sie nicht', () => {
    const liste = baueKopfBefunde({ kopf: ['Eins.', 'Zwei.'] });
    expect(liste.className).toBe('db-form-errors');
    expect([...liste.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Eins.',
      'Zwei.',
    ]);
    expect(baueKopfBefunde({ kopf: [] })).toBeNull();
    expect(baueKopfBefunde(null)).toBeNull();
  });

  it('die Wahl der Fremd-Änderung ruft «neu laden» und «erzwingen»', () => {
    const neuLaden = vi.fn();
    const erzwingen = vi.fn();
    const block = baueFremdWahl({ text: 'Satz.', t: i18n.t, neuLaden, erzwingen });
    expect(block.querySelector('.db-form-stale-text').textContent).toBe('Satz.');
    expect(block.querySelector('.db-form-stale-reload').textContent).toBe(
      de['database.form.reload'],
    );
    block.querySelector('.db-form-stale-reload').click();
    block.querySelector('.db-form-stale-force').click();
    expect(neuLaden).toHaveBeenCalledTimes(1);
    expect(erzwingen).toHaveBeenCalledTimes(1);
  });

  it('die Rückfrage vor dem Löschen ruft «ja» und «nein»', () => {
    const ja = vi.fn();
    const nein = vi.fn();
    const block = baueLoeschFrage({ t: i18n.t, ja, nein });
    expect(block.querySelector('.db-form-confirm-text').textContent).toBe(
      de['database.form.confirmDelete'],
    );
    block.querySelector('.db-form-delete-yes').click();
    block.querySelector('.db-form-delete-no').click();
    expect(ja).toHaveBeenCalledTimes(1);
    expect(nein).toHaveBeenCalledTimes(1);
  });
});

describe('Der Ablauf auf dem Zustands-Objekt (B4 bis B6)', () => {
  function aufbau(antwort, seiteMehr = {}) {
    const seite = {
      tabellenPfad: TAB,
      kennung: 'r-00001',
      neu: false,
      entwurf: { ...ERWARTET },
      daten: { fields: FELDER.map((name) => ({ name })), erwartet: ERWARTET },
      befunde: null,
      auftrag: null,
      loeschFrage: false,
      sendet: false,
      fokus: null,
      ...seiteMehr,
    };
    const n = {
      seite,
      sende: vi.fn(async () => antwort),
      t: i18n.t,
      hat,
      sprache: () => 'de',
      schluessel: vi.fn(() => 'gegenstand'),
      zeichne: vi.fn(),
      hinweis: vi.fn(),
      gelungen: vi.fn(),
      neuLaden: vi.fn(),
    };
    return { seite, n, ablauf: erzeugeSpeicherAblauf(n) };
  }

  it('Speichern ohne Änderung schickt nichts und zeigt den Hinweis', () => {
    const { n, ablauf } = aufbau({ ok: true });
    ablauf.speichern();
    expect(n.sende).not.toHaveBeenCalled();
    expect(n.hinweis).toHaveBeenCalledWith('database.form.nothingChanged');
  });

  it('Speichern einer Änderung schickt den Auftrag und meldet Erfolg', async () => {
    const { seite, n, ablauf } = aufbau({ ok: true });
    seite.entwurf.Name = 'Anna B.';
    await ablauf.sende(
      baueAuftrag({
        art: ART_AENDERN,
        tabellenPfad: TAB,
        kennung: 'r-00001',
        entwurf: seite.entwurf,
        erwartet: ERWARTET,
        felderDesKoerpers: FELDER,
      }),
    );
    expect(n.sende.mock.calls[0][0].anweisungen[0].werte).toEqual({ Name: 'Anna B.' });
    expect(n.gelungen).toHaveBeenCalledWith('update');
    expect(seite.befunde).toBeNull();
    expect(seite.sendet).toBe(false);
  });

  it('eine Neuanlage schickt «create» mit der gezogenen Kennung', async () => {
    const { seite, n, ablauf } = aufbau(
      { ok: true },
      { neu: true, kennung: 'r-00003', entwurf: { Name: 'Carla', Menge: '', Aktiv: '' } },
    );
    ablauf.speichern();
    await vi.waitFor(() => expect(n.gelungen).toHaveBeenCalledWith('create'));
    expect(n.sende.mock.calls[0][0].anweisungen[0]).toMatchObject({
      art: 'create',
      id: 'r-00003',
      werte: { Name: 'Carla' },
    });
    expect(seite.neu).toBe(true);
  });

  it('eine Abweisung lässt die Eingabe stehen und ordnet die Lagen zu', async () => {
    const { seite, n, ablauf } = aufbau({
      ok: false,
      code: 'auftragPflichtAngabeFehlt',
      lagen: [{ code: 'auftragPflichtAngabeFehlt', position: 0, feld: 'Name' }],
    });
    seite.entwurf.Name = '';
    ablauf.speichern();
    await vi.waitFor(() => expect(seite.befunde).not.toBeNull());
    expect(seite.entwurf.Name).toBe('');
    expect(seite.befunde.amFeld.Name).toEqual(['Das Feld «Name» muss ausgefüllt sein.']);
    expect(seite.fokus).toBe('Name');
    expect(seite.auftrag.anweisungen[0].werte).toEqual({ Name: null });
    expect(n.gelungen).not.toHaveBeenCalled();
  });

  it('ein Ergebnis nach dem Umbinden auf einen anderen Datensatz wird verworfen', async () => {
    const { seite, n, ablauf } = aufbau({ ok: false, lagen: [{ code: 'auftragLeer' }] });
    n.schluessel.mockReturnValueOnce('vorher').mockReturnValue('nachher');
    await ablauf.sende({ anweisungen: [{ tabelle: TAB, art: 'update', id: 'r-00001' }] });
    expect(seite.befunde).toBeNull();
    expect(n.gelungen).not.toHaveBeenCalled();
  });

  it('Löschen fragt zurück, «ja» schickt «delete» mit Erwartung', async () => {
    const { seite, n, ablauf } = aufbau({ ok: true });
    ablauf.fragLoeschen();
    expect(seite.loeschFrage).toBe(true);
    const wurzel = document.createElement('div');
    ablauf.zeichneLage(wurzel);
    wurzel.querySelector('.db-form-delete-yes').click();
    await vi.waitFor(() => expect(n.gelungen).toHaveBeenCalledWith('delete'));
    expect(n.sende.mock.calls[0][0]).toEqual({
      anweisungen: [{ tabelle: TAB, art: 'delete', id: 'r-00001', erwartet: ERWARTET }],
    });
    expect(seite.loeschFrage).toBe(false);
  });

  it('eine Fremd-Änderung zeigt die Wahl; «erzwingen» schickt denselben Auftrag erzwungen', async () => {
    const { seite, n, ablauf } = aufbau({
      ok: false,
      lagen: [{ code: LAGE_FREMD, position: 0, tabelle: TAB, id: 'r-00001' }],
    });
    seite.entwurf.Menge = '13';
    ablauf.speichern();
    await vi.waitFor(() => expect(seite.befunde).not.toBeNull());
    const wurzel = document.createElement('div');
    ablauf.zeichneLage(wurzel);
    expect(wurzel.querySelector('.db-form-stale')).not.toBeNull();
    expect(wurzel.querySelector('.db-form-errors')).toBeNull();
    n.sende.mockResolvedValueOnce({ ok: true });
    wurzel.querySelector('.db-form-stale-force').click();
    await vi.waitFor(() => expect(n.gelungen).toHaveBeenCalledWith('update'));
    expect(n.sende.mock.calls[1][0].anweisungen[0]).toMatchObject({
      werte: { Menge: '13' },
      erzwingen: true,
    });
  });

  it('«neu laden» vergisst die Befunde und ruft die Seite', async () => {
    const { seite, n, ablauf } = aufbau({
      ok: false,
      lagen: [{ code: LAGE_FREMD, position: 0, tabelle: TAB, id: 'r-00001' }],
    });
    seite.entwurf.Menge = '13';
    ablauf.speichern();
    await vi.waitFor(() => expect(seite.befunde).not.toBeNull());
    const wurzel = document.createElement('div');
    ablauf.zeichneLage(wurzel);
    wurzel.querySelector('.db-form-stale-reload').click();
    expect(n.neuLaden).toHaveBeenCalledTimes(1);
    expect(seite.befunde).toBeNull();
    expect(seite.auftrag).toBeNull();
  });
});
