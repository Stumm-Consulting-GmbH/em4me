// @vitest-environment jsdom
// 4T-002312 (Epic 3E-000263, F4 A; Story AK1, AK3): Das nach seiner Bedingung
// gesperrte Feld in der Einzel-Maske — im Modus «bearbeiten» lesend mit Titel,
// die übrigen Felder als Eingabe, und beim Speichern reist das gesperrte Feld
// unverändert mit, also nicht unter den Werten des Auftrags.
//
// **Eigene Prüfdatei**, weil `db-masken-koerper.test.js` an der Grenze von 800
// Code-Zeilen steht; Aufbau, Nähte und Gestalt der Daten folgen ihr. Gemessen
// wird am Modul `masken-koerper.js` und am Auftrags-Bau aus `masken-speichern.js`;
// den Weg durch die laufende Anwendung prüft der Ablauf-Fall DB-MAS-14.
//
// **Der deutsche Katalog wird geladen**, weil der Titel ein Satz ist.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import de from '../../src/i18n/de.json';

vi.mock('../../src/renderer/modules/app/api.js', () => ({
  api: { renderMarkdown: (text) => `<p>${text}</p>` },
}));
vi.mock('../../src/renderer/modules/render-mermaid.js', () => ({
  applyTeilbaumSchritte: () => {},
}));

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { zeichneInhalt } = await import('../../src/renderer/modules/database/masken-koerper.js');
const { MODUS_BEARBEITEN, MODUS_LESEN } =
  await import('../../src/renderer/modules/database/masken-felder.js');
const { ART_AENDERN, baueAuftrag } =
  await import('../../src/renderer/modules/database/masken-speichern.js');

const TAB = 'C:/Bereich/Loans.md';
const verweise = { optionen: () => ({}) };

const FELDER = [
  { name: 'borrower', type: 'string' },
  { name: 'due', type: 'string' },
];

function zelle(name, text) {
  return { name, text, value: text, error: null, fehlt: false };
}

function daten(gesperrteFelder) {
  return {
    status: 'ready',
    fields: FELDER,
    zellen: [zelle('borrower', 'Anna'), zelle('due', '2026-10-30')],
    editable: null,
    gesperrteFelder,
    erwartet: { borrower: 'Anna', due: '2026-10-30' },
    koerper: {
      segmente: [
        { art: 'feld', name: 'borrower' },
        { art: 'feld', name: 'due' },
      ],
      hints: [],
    },
  };
}

function seite(modus, d) {
  return {
    tabellenPfad: TAB,
    modus,
    entwurf:
      modus === MODUS_BEARBEITEN
        ? Object.fromEntries(d.zellen.map((z) => [z.name, String(z.text)]))
        : null,
    befunde: null,
    fokus: null,
  };
}

const feldIn = (wurzel, name) => wurzel.querySelector(`.db-form-field[data-field="${name}"]`);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Einzel-Maske: gesperrtes Feld (4T-002312, AK1)', () => {
  it('4T-002312: zeigt das gesperrte Feld im Bearbeiten lesend mit Titel, das freie als Eingabe', () => {
    const d = daten(['borrower']);
    const s = seite(MODUS_BEARBEITEN, d);
    const wurzel = document.createElement('div');
    zeichneInhalt(wurzel, d, { seite: s, verweise, sprache: 'de' });

    const gesperrt = feldIn(wurzel, 'borrower');
    expect(gesperrt.classList.contains('db-form-locked')).toBe(true);
    expect(gesperrt.title).toBe(de['database.form.feldNichtAenderbar']);
    expect(gesperrt.querySelector('.db-form-input')).toBeNull();
    expect(gesperrt.querySelector('.db-form-value').textContent).toBe('Anna');
    expect(feldIn(wurzel, 'due').querySelector('.db-form-input')).not.toBeNull();
    // Kein Satz «nicht bearbeitbar»: Der Datensatz selbst ist frei.
    expect(wurzel.querySelector('.db-form-not-editable')).toBeNull();
  });

  it('4T-002312: das gesperrte Feld reist unverändert mit, nur das geänderte freie Feld zählt', () => {
    const d = daten(['borrower']);
    const s = seite(MODUS_BEARBEITEN, d);
    const wurzel = document.createElement('div');
    zeichneInhalt(wurzel, d, { seite: s, verweise, sprache: 'de' });
    const eingabe = feldIn(wurzel, 'due').querySelector('.db-form-input');
    eingabe.value = '2026-11-15';
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));

    expect(s.entwurf).toEqual({ borrower: 'Anna', due: '2026-11-15' });
    const auftrag = baueAuftrag({
      art: ART_AENDERN,
      tabellenPfad: TAB,
      kennung: 'r-00001',
      entwurf: s.entwurf,
      erwartet: d.erwartet,
      felderDesKoerpers: ['borrower', 'due'],
    });
    expect(auftrag.anweisungen[0].werte).toEqual({ due: '2026-11-15' });
  });

  it('4T-002312: im Lesen und ohne Sperre bleibt das Feld unmarkiert (AK3: nächste Antwort frei)', () => {
    const lesend = document.createElement('div');
    const d = daten(['borrower']);
    zeichneInhalt(lesend, d, { seite: seite(MODUS_LESEN, d), verweise, sprache: 'de' });
    expect(feldIn(lesend, 'borrower').classList.contains('db-form-locked')).toBe(false);

    const frei = document.createElement('div');
    const ohne = daten([]);
    zeichneInhalt(frei, ohne, { seite: seite(MODUS_BEARBEITEN, ohne), verweise, sprache: 'de' });
    expect(feldIn(frei, 'borrower').querySelector('.db-form-input')).not.toBeNull();
    expect(feldIn(frei, 'borrower').title).toBe('');

    const ohneAngabe = document.createElement('div');
    const alt = { ...daten([]), gesperrteFelder: undefined };
    zeichneInhalt(ohneAngabe, alt, { seite: seite(MODUS_BEARBEITEN, alt), verweise });
    expect(feldIn(ohneAngabe, 'borrower').querySelector('.db-form-input')).not.toBeNull();
  });
});
