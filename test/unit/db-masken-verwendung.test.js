// @vitest-environment jsdom
// 4T-002335 (Epic 3E-000264, Entscheidung F5 Option A): «Verwendet von» in der
// Einzel-Maske — die Aktion im Kopf, die Liste auf Anforderung und der Sprung
// zum verweisenden Datensatz, der sich in den Verlauf der Maske einreiht.
//
// **Gemessen wird am Modul und nicht an der Seite** (Muster
// `db-masken-navigation.test.js`): Öffnen und Neu-Zeichnen kommen als Ersatz
// herein, der Kanal `database:verwendung` über den API-Ersatz, das
// Zustands-Objekt der Seite wird hereingereicht. Dass die laufende Anwendung
// den Sprung samt «Zurück» zeigt, prüft der Ablauf-Fall DB-MAS-15.
//
// **Der deutsche Katalog wird geladen**, weil die Aktion als Text geprüft wird
// und nicht als Schlüssel-Name.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import './renderer/api-stub.js';
import de from '../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { erzeugeVerwendungsHilfe } =
  await import('../../src/renderer/modules/database/masken-verwendung.js');
const { VERLAUF_MERKEN } = await import('../../src/renderer/modules/database/masken-navigation.js');
const { MODUS_LESEN } = await import('../../src/renderer/modules/database/masken-felder.js');

const KUNDEN = '/raum/Kunden.md';
const BESTELLUNGEN = '/raum/Bestellungen.md';

const ANTWORT = {
  status: 'ready',
  datensaetze: [
    {
      tabelle: 'Bestellungen',
      feld: 'Kunde',
      pfad: BESTELLUNGEN,
      kennung: 'r-00001',
      anzeige: 'Erste Bestellung',
    },
  ],
};

// Eine Seite, die den Kunden r-00002 im Lesen zeigt.
function neueSeite(extra = {}) {
  return {
    tabellenPfad: KUNDEN,
    kennung: 'r-00002',
    neu: false,
    modus: MODUS_LESEN,
    daten: { status: 'ready' },
    ...extra,
  };
}

let seite;
let oeffne;
let kanal;
let hilfe;
let ansicht;

// Wie die Seite: Kopf mit Aktions-Leiste in der Wurzel, danach zeichnet die
// Hilfe Aktion und Liste hinein. Jedes Neu-Zeichnen baut die Ansicht neu auf.
function zeichneSeite() {
  const wurzel = document.createElement('div');
  const kopf = document.createElement('div');
  kopf.appendChild(document.createElement('div')).className = 'db-form-actions';
  wurzel.appendChild(kopf);
  hilfe.zeichne(kopf, wurzel, seite);
  ansicht = { kopf, wurzel };
  return ansicht;
}

beforeEach(() => {
  seite = neueSeite();
  oeffne = vi.fn();
  kanal = vi.fn(async () => ANTWORT);
  window.api.databaseVerwendung = kanal;
  hilfe = erzeugeVerwendungsHilfe({ oeffne, zeichneNeu: () => zeichneSeite() });
  ansicht = null;
});

// Klickt die Aktion und wartet, bis die Liste mit ihrer Zeile steht.
async function holeListe() {
  zeichneSeite().kopf.querySelector('.db-form-usage-action').click();
  await vi.waitFor(() =>
    expect(ansicht.wurzel.querySelectorAll('tr.db-form-usage-entry')).toHaveLength(1),
  );
  return ansicht.wurzel;
}

describe('«Verwendet von» in der Einzel-Maske (4T-002335)', () => {
  it('zeichnet die Aktion im Lesen und holt die Liste erst auf Anforderung', async () => {
    const { kopf } = zeichneSeite();
    const aktion = kopf.querySelector('.db-form-actions .db-form-usage-action');
    expect(aktion).not.toBe(null);
    expect(aktion.textContent).toBe(i18n.t('database.usage.actionRecord'));
    expect(kanal).not.toHaveBeenCalled();
    const wurzel = await holeListe();
    expect(kanal).toHaveBeenCalledWith({ tabelle: KUNDEN, kennung: 'r-00002' });
    const zeile = wurzel.querySelector('tr.db-form-usage-entry[data-table="Bestellungen"]');
    expect(zeile).not.toBe(null);
    expect(zeile.querySelector('.db-form-usage-open').textContent).toBe(
      'Erste Bestellung (r-00001)',
    );
  });

  it('der Sprung zum verweisenden Datensatz reiht sich in den Verlauf ein (AK1)', async () => {
    const wurzel = await holeListe();
    wurzel.querySelector('.db-form-usage-open').click();
    expect(oeffne).toHaveBeenCalledTimes(1);
    expect(oeffne).toHaveBeenCalledWith(BESTELLUNGEN, 'r-00001', { verlauf: VERLAUF_MERKEN });
  });

  it('bei einer Neuanlage fehlt die Aktion', () => {
    seite = neueSeite({ neu: true });
    const { kopf, wurzel } = zeichneSeite();
    expect(kopf.querySelector('.db-form-usage-action')).toBe(null);
    expect(wurzel.querySelector('.db-form-usage')).toBe(null);
    expect(kanal).not.toHaveBeenCalled();
  });
});
