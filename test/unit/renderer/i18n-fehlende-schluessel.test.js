// @vitest-environment jsdom
// 4T-000900 (Epic 3E-000016): Der Uebersetzungs-Zugriff meldet einen unbekannten
// Schluessel, statt ihn stillschweigend als Text zurueckzugeben.
//
// Hintergrund: t() endete mit `?? key`. Ein fehlender Schluessel erschien
// dadurch als roher Bezeichner, leeres Auswahlfeld oder deutsches Wort in der
// fremdsprachigen Oberflaeche, ohne dass ein Gate rot wurde. Der vorhandene
// i18n-Waechter kann das nicht sehen: Er vergleicht nur die fuenf
// Sprachdateien untereinander, nie den Code gegen sie. Belegte Faelle dieser
// Klasse: 4T-000850 (Tasten-Bezeichnungen), dazu die im Kopplungs-Audit
// gefundenen Stellen in Funktions-Katalog, Uhr-Optionen und Ereignis-
// Kategorien.
//
// Die Faelle unten pruefen die Melde-Logik selbst. Ihre Wirkung im laufenden
// Programm haengt daran, dass ein Konsolen-Fehler eine Spec rot macht — das
// leistet 4T-000901, und zwar erst mit einem Zuhoerer, der VOR dem Start steht:
// Der heutige Smoke-Fall setzt ihn danach und sieht Start-Meldungen nicht.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Frisches Modul je Fall: Sowohl das Woerterbuch als auch die Menge der
// bereits gemeldeten Schluessel sind Modul-Zustand.
async function ladeModul(woerterbuch) {
  vi.resetModules();
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => woerterbuch }));
  const modul = await import('../../../src/renderer/i18n.js');
  await modul.loadTranslations('de');
  return modul;
}

describe('Übersetzungs-Zugriff meldet fehlende Schlüssel (4T-000900)', () => {
  let fehlerAusgabe;

  beforeEach(() => {
    fehlerAusgabe = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fehlerAusgabe.mockRestore();
    delete global.fetch;
  });

  it('ein unbekannter Schlüssel wird gemeldet und weiterhin als Text geliefert', async () => {
    const { t } = await ladeModul({ 'menu.file': 'Datei' });
    expect(t('gibt.es.nicht')).toBe('gibt.es.nicht');
    expect(fehlerAusgabe).toHaveBeenCalledTimes(1);
    expect(fehlerAusgabe.mock.calls[0][0]).toContain('gibt.es.nicht');
  });

  it('ein bekannter Schlüssel wird nicht gemeldet', async () => {
    const { t } = await ladeModul({ 'menu.file': 'Datei' });
    expect(t('menu.file')).toBe('Datei');
    expect(fehlerAusgabe).not.toHaveBeenCalled();
  });

  // Ohne Entprellung meldete jeder Neuaufbau der Oberfläche denselben
  // Schlüssel erneut; die Flut würde den Wächter aus 4T-000901 entwerten.
  it('derselbe Schlüssel wird nur einmal gemeldet', async () => {
    const { t } = await ladeModul({ 'menu.file': 'Datei' });
    t('gibt.es.nicht');
    t('gibt.es.nicht');
    t('gibt.es.nicht');
    expect(fehlerAusgabe).toHaveBeenCalledTimes(1);
  });

  it('vor dem Laden des Wörterbuchs wird nichts gemeldet', async () => {
    vi.resetModules();
    const { t } = await import('../../../src/renderer/i18n.js');
    expect(t('irgendwas')).toBe('irgendwas');
    expect(fehlerAusgabe).not.toHaveBeenCalled();
  });
});
