// @vitest-environment jsdom
// 4T-001594 (Story 4S-000905, Epic 3E-000129): Der Lade-Weg des Anzeige-
// Prozesses versteht eine eingespielte eigene Sprache.
//
// **Warum diese Fälle hier und nicht am laufenden Programm:** Gemessen wird das
// Verhalten der Weiche in `loadTranslations` — welcher der beiden Wege genommen
// wird, was bei einer fehlenden oder unbrauchbaren Datei geschieht und was der
// Aufrufer daraufhin erfährt. Genau diese Rückgabe trägt den sichtbaren
// Rückfall (AK6), und ihre Fehl-Fälle sind am laufenden Programm nur mit
// erheblichem Aufwand herzustellen. Dass die Sprache im Fenster tatsächlich
// ankommt, prüfen SE-05 bis SE-08 der Ablauf-Suite.
//
// Der Modul-Zustand (Wörterbuch, aktive Kennung) lebt im Modul; jeder Fall lädt
// es deshalb frisch, nach dem Muster von i18n-fehlende-schluessel.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const EN = {
  'menu.file': 'File',
  'locales.fallback.missing': 'Missing {name}',
  // 4T-001595: Ziel des Rückfalls je Schlüssel — ein Schlüssel, den die eigenen
  // Kataloge der Fälle unten bewusst NICHT kennen, dazu einer mit Platzhalter.
  'menu.edit': 'Edit',
  'window.title.workspace': 'Workspace {name}',
};

// Der fetch-Weg der mitgelieferten Sprachen. Er merkt sich die angefragten
// Adressen, damit ein Fall belegen kann, WELCHE Datei geholt wurde — die
// Aussage «es wurde zurückgefallen» hängt genau daran.
function stelleFetch(kataloge) {
  const geholt = [];
  global.fetch = vi.fn(async (url) => {
    geholt.push(url);
    const code = String(url).replace(/^.*\/([^/]+)\.json$/, '$1');
    if (!(code in kataloge)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => kataloge[code] };
  });
  return geholt;
}

async function ladeModul() {
  vi.resetModules();
  return await import('../../../src/renderer/i18n.js');
}

describe('Lade-Weg des Anzeige-Prozesses für eigene Sprachen (4T-001594)', () => {
  let geholt;

  beforeEach(() => {
    geholt = stelleFetch({ en: EN, de: { 'menu.file': 'Datei' } });
  });

  afterEach(() => {
    delete global.fetch;
    delete window.api;
  });

  it('eine mitgelieferte Sprache nimmt unverändert den fetch-Weg', async () => {
    const modul = await ladeModul();
    const ergebnis = await modul.loadTranslations('de');
    expect(ergebnis).toEqual({ fallback: false });
    // 4T-001595: Dazu der englische Katalog — er trägt den Rückfall je
    // Schlüssel und kommt beim Übernehmen einer anderen Sprache einmal mit.
    expect(geholt).toEqual(['../i18n/de.json', '../i18n/en.json']);
    expect(modul.t('menu.file')).toBe('Datei');
    expect(modul.getLanguage()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('eine eigene Sprache kommt über die Brücke, nicht über fetch', async () => {
    window.api = {
      localesRead: vi.fn(async () => ({
        ok: true,
        id: 'custom:nds',
        code: 'nds',
        name: 'Plattdüütsch',
        werte: { 'menu.file': 'Datei op Platt' },
      })),
    };
    const modul = await ladeModul();
    const ergebnis = await modul.loadTranslations('custom:nds');

    expect(ergebnis).toEqual({ fallback: false });
    expect(window.api.localesRead).toHaveBeenCalledWith('custom:nds');
    // Kein fetch AUF DIE EIGENE DATEI: Eine Datei im Benutzerprofil ist über
    // einen bündel-relativen Pfad gar nicht erreichbar — ein Aufruf dorthin
    // wäre ein Fehlgriff. Geholt wird allein der englische Rückfall-Katalog
    // (4T-001595), und der liegt im eigenen Bündel.
    expect(geholt).toEqual(['../i18n/en.json']);
    expect(modul.t('menu.file')).toBe('Datei op Platt');
    // Die aktive Kennung ist die eigene, das Sprach-Attribut des Dokuments
    // dagegen der Code: 'custom:nds' ist kein gültiges Sprach-Etikett.
    expect(modul.getLanguage()).toBe('custom:nds');
    expect(document.documentElement.lang).toBe('nds');
  });

  it('der aktive Katalog ist über currentDictionary zu haben', async () => {
    window.api = {
      localesRead: async () => ({
        ok: true,
        code: 'nds',
        werte: { 'menu.file': 'Datei op Platt' },
      }),
    };
    const modul = await ladeModul();
    await modul.loadTranslations('custom:nds');
    expect(modul.currentDictionary()).toEqual({ 'menu.file': 'Datei op Platt' });
  });

  // AK6: Der Rückfall ist die Antwort auf eine fehlende Datei — und er wird
  // gemeldet, statt geworfen. Ein Wurf an dieser Stelle wäre kein sichtbarer
  // Rückfall, sondern ein abbrechender Start.
  it('eine fehlende Datei führt auf die Rückfall-Sprache und meldet das', async () => {
    window.api = { localesRead: async () => ({ ok: false, error: 'nicht-gefunden' }) };
    const modul = await ladeModul();
    const ergebnis = await modul.loadTranslations('custom:nds');

    expect(ergebnis).toEqual({ fallback: true, id: 'custom:nds' });
    expect(geholt).toEqual(['../i18n/en.json']);
    expect(modul.t('menu.file')).toBe('File');
    expect(modul.getLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('eine Antwort ohne brauchbare Werte gilt wie eine fehlende Datei', async () => {
    window.api = { localesRead: async () => ({ ok: true, code: 'nds', werte: null }) };
    const modul = await ladeModul();
    expect(await modul.loadTranslations('custom:nds')).toEqual({
      fallback: true,
      id: 'custom:nds',
    });
    expect(modul.getLanguage()).toBe('en');
  });

  it('eine geworfene Ausnahme der Brücke gilt wie eine fehlende Datei', async () => {
    window.api = {
      localesRead: async () => {
        throw new Error('IPC hin');
      },
    };
    const modul = await ladeModul();
    expect(await modul.loadTranslations('custom:nds')).toEqual({
      fallback: true,
      id: 'custom:nds',
    });
    expect(modul.getLanguage()).toBe('en');
  });

  // Ohne Brücke läuft der Code außerhalb des Anwendungsfensters (Prüf-Umgebung,
  // frühe Startphase). Auch dort ist der Rückfall die Antwort, nicht ein Wurf
  // auf eine Funktion von `undefined`.
  it('eine fehlende Brücke führt ebenfalls auf die Rückfall-Sprache', async () => {
    const modul = await ladeModul();
    expect(await modul.loadTranslations('custom:nds')).toEqual({
      fallback: true,
      id: 'custom:nds',
    });
    expect(modul.getLanguage()).toBe('en');
  });

  // Der zweite Zugang zur aktiven Sprache: dieselbe Sprache, andere Form.
  // `getLanguage()` liefert die Kennung für Einstellung, Katalog und Auswahl,
  // `intlLocale()` die BCP-47-Form für Intl und Verwandte. Gemessen wird hier
  // die Trennung selbst — dass `custom:nds` in `Intl.DateTimeFormat` einen
  // RangeError wirft und `nds` nicht, ist der Grund für sie.
  it('intlLocale liefert bei einer eigenen Sprache den Code hinter dem Präfix', async () => {
    window.api = {
      localesRead: async () => ({
        ok: true,
        code: 'nds',
        werte: { 'menu.file': 'Datei op Platt' },
      }),
    };
    const modul = await ladeModul();
    await modul.loadTranslations('custom:nds');

    expect(modul.getLanguage()).toBe('custom:nds');
    expect(modul.intlLocale()).toBe('nds');
    // Der gelieferte Wert ist der, den die Laufzeit-Umgebung annimmt.
    expect(() => new Intl.DateTimeFormat(modul.intlLocale())).not.toThrow();
    expect(() => new Intl.DateTimeFormat(modul.getLanguage())).toThrow(RangeError);
  });

  it('intlLocale lässt eine mitgelieferte Sprache unverändert', async () => {
    const modul = await ladeModul();
    await modul.loadTranslations('de');
    expect(modul.intlLocale()).toBe('de');
    expect(modul.intlLocale()).toBe(modul.getLanguage());
  });

  // Nach dem Rückfall steht die Rückfall-Sprache, nicht der Code der Sprache,
  // die gemeint war: Beide Zugänge folgen dem tatsächlich geladenen Katalog.
  it('intlLocale folgt dem Rückfall, nicht der gemeinten Kennung', async () => {
    window.api = { localesRead: async () => ({ ok: false, error: 'nicht-gefunden' }) };
    const modul = await ladeModul();
    await modul.loadTranslations('custom:nds');
    expect(modul.intlLocale()).toBe('en');
  });

  // Eine wirklich unbekannte Kennung ist keine eigene Sprache, sondern eine
  // Fehl-Angabe: Sie fällt weiterhin still zurück und meldet keinen Rückfall.
  it('eine unbekannte Kennung ohne Präfix fällt still zurück', async () => {
    const modul = await ladeModul();
    expect(await modul.loadTranslations('kl')).toEqual({ fallback: false });
    expect(geholt).toEqual(['../i18n/en.json']);
    expect(modul.getLanguage()).toBe('en');
  });
});

// 4T-001595 (Story 4S-000905, Epic 3E-000129): Rückfall je Schlüssel auf
// Englisch im Anzeige-Prozess.
//
// **Warum hier und nicht am laufenden Programm:** Gemessen wird die Kette
// selbst — eingestellte Sprache → Englisch → Schlüssel-Name — und dazu die
// Trennung der Meldung: still gesammelt bei einer eigenen Sprache, Konsolen-
// Fehler bei einer mitgelieferten. Beide Seiten brauchen einen bewusst
// unvollständigen Katalog, und den stellt man hier in einer Zeile. Dass die
// Wirkung im Fenster ankommt, prüft SE-09 der Ablauf-Suite.
describe('Rückfall je Schlüssel auf Englisch (4T-001595)', () => {
  // Der eigene Katalog kennt `menu.file`, nicht aber `menu.edit` und
  // `window.title.workspace` — genau die Lage einer unfertigen Übersetzung.
  const EIGEN = { 'menu.file': 'Datei op Platt' };

  let fehlerAusgabe;

  beforeEach(() => {
    stelleFetch({ en: EN, de: { 'menu.file': 'Datei' } });
    fehlerAusgabe = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fehlerAusgabe.mockRestore();
    delete global.fetch;
    delete window.api;
    document.body.innerHTML = '';
  });

  async function ladeEigene(werte = EIGEN) {
    window.api = { localesRead: async () => ({ ok: true, code: 'nds', werte }) };
    const modul = await ladeModul();
    await modul.loadTranslations('custom:nds');
    return modul;
  }

  // AK1: der Kern des Tasks.
  it('ein Schlüssel, den nur Englisch kennt, kommt englisch statt roh', async () => {
    const modul = await ladeEigene();
    expect(modul.t('menu.file')).toBe('Datei op Platt');
    expect(modul.t('menu.edit')).toBe(EN['menu.edit']);
  });

  // Dieselbe Kette im zweiten Auflösungs-Weg: `applyTranslations` geht über
  // `lookup`, nicht über `t`, und trägt damit jedes data-i18n-Element der
  // Oberfläche. Eine Kette in nur einem der beiden wäre die halbe Lösung.
  it('applyTranslations setzt den englischen Text in das data-i18n-Element', async () => {
    const modul = await ladeEigene();
    document.body.innerHTML =
      '<span id="eigen" data-i18n="menu.file"></span>' +
      '<span id="rueckfall" data-i18n="menu.edit"></span>';
    modul.applyTranslations(document.body);
    expect(document.getElementById('eigen').textContent).toBe('Datei op Platt');
    expect(document.getElementById('rueckfall').textContent).toBe(EN['menu.edit']);
  });

  // AK2: Der Schlüssel-Name bleibt der Notnagel — und er ist ein Programm-
  // fehler, also auch bei einer eigenen Sprache eine Konsolen-Meldung.
  it('ein Schlüssel, den auch Englisch nicht kennt, bleibt der Schlüssel-Name', async () => {
    const modul = await ladeEigene();
    expect(modul.t('gibt.es.nirgends')).toBe('gibt.es.nirgends');
    expect(fehlerAusgabe).toHaveBeenCalledTimes(1);
    expect(fehlerAusgabe.mock.calls[0][0]).toContain('gibt.es.nirgends');
  });

  // AK4: Die Ersetzung machen die Aufrufer NACH t(); der zurückgefallene Text
  // muss seinen Platzhalter deshalb unversehrt herausgeben. Ein hier bereits
  // ersetzter oder verlorener Platzhalter wäre nur eine andere Form der
  // Unbrauchbarkeit.
  it('ein Platzhalter im zurückgefallenen Text bleibt unversehrt', async () => {
    const modul = await ladeEigene();
    const text = modul.t('window.title.workspace');
    expect(text).toBe(EN['window.title.workspace']);
    expect(text).toContain('{name}');
    expect(text.replace('{name}', 'Notizen')).toBe('Workspace Notizen');
  });

  // Die Datenquelle für den Alterungs-Hinweis (4T-001596): gesammelt wird, was
  // wirklich gefehlt hat — nicht mehr und nicht weniger.
  it('die Sammel-Menge trägt den fehlenden Schlüssel, nicht den vorhandenen', async () => {
    const modul = await ladeEigene();
    modul.t('menu.file');
    modul.t('menu.edit');
    expect(modul.fehlendeSchluesselDerEigenenSprache()).toEqual(['menu.edit']);
    // Und kein Konsolen-Fehler: Eine unfertige Übersetzung ist der Regelfall
    // und darf keinen Ablauf-Fall über den Konsolen-Wächter rot machen.
    expect(fehlerAusgabe).not.toHaveBeenCalled();
  });

  it('die Sammel-Menge wird beim Sprach-Wechsel geleert', async () => {
    const modul = await ladeEigene();
    modul.t('menu.edit');
    expect(modul.fehlendeSchluesselDerEigenenSprache()).toEqual(['menu.edit']);
    await modul.loadTranslations('de');
    expect(modul.fehlendeSchluesselDerEigenenSprache()).toEqual([]);
  });

  // AK6, Gegenprobe: Bei einer MITGELIEFERTEN Fassung ist eine Lücke ein
  // Programmfehler geblieben. Der englische Text erscheint auch dort — die
  // Kette ist überall dieselbe —, aber die Meldung bleibt scharf.
  it('eine mitgelieferte Sprache meldet die Lücke weiterhin auf der Konsole', async () => {
    const modul = await ladeModul();
    await modul.loadTranslations('de');
    expect(modul.t('menu.edit')).toBe(EN['menu.edit']);
    expect(fehlerAusgabe).toHaveBeenCalledTimes(1);
    expect(fehlerAusgabe.mock.calls[0][0]).toContain('menu.edit');
    // Gesammelt wird dort nichts: Die Menge gilt der eigenen Sprache.
    expect(modul.fehlendeSchluesselDerEigenenSprache()).toEqual([]);
  });
});

// 4T-001596 (Story 4S-000905, Epic 3E-000129): Erhebung der Lücke für den
// Alterungs-Hinweis.
//
// **Warum hier und nicht am laufenden Programm:** Gemessen wird der Mengen-
// Vergleich selbst — dass er VOLLSTÄNDIG ist und nicht nur das kennt, was
// jemand aufgelöst hat, und dass er bei einer mitgelieferten Fassung gar nicht
// erst stattfindet (AK5). Ein Katalog mit genau einer Lücke steht hier in einer
// Zeile; am laufenden Programm wäre die Zahl aus dem Bestand zu errechnen, und
// genau das tut SE-10 der Ablauf-Suite für die sichtbare Wirkung.
describe('Erhebung der fehlenden Einträge (4T-001596)', () => {
  beforeEach(() => {
    stelleFetch({ en: EN, de: { 'menu.file': 'Datei' } });
  });

  afterEach(() => {
    delete global.fetch;
    delete window.api;
  });

  async function ladeEigene(werte) {
    window.api = { localesRead: async () => ({ ok: true, code: 'nds', werte }) };
    const modul = await ladeModul();
    await modul.loadTranslations('custom:nds');
    return modul;
  }

  // AK5, erster Teil: Eine vollständige Datei hat keine Lücke — und ohne Lücke
  // erscheint kein Hinweis.
  it('eine vollständige eigene Sprache hat keine fehlenden Einträge', async () => {
    const modul = await ladeEigene({ ...EN });
    expect(modul.fehlendeEintraegeGegenEnglisch()).toEqual([]);
  });

  // AK2: Genau die fehlenden Schlüssel, sortiert — nicht mehr und nicht
  // weniger. Der Umfang der Lücke ist die Zahl, die im Hinweis steht.
  it('eine eigene Sprache mit Lücken nennt genau diese Schlüssel, sortiert', async () => {
    const modul = await ladeEigene({ 'menu.file': 'Datei op Platt' });
    expect(modul.fehlendeEintraegeGegenEnglisch()).toEqual([
      'locales.fallback.missing',
      'menu.edit',
      'window.title.workspace',
    ]);
  });

  // Der Unterschied zur Laufzeit-Menge aus 4T-001595, an der Sache gemessen:
  // Jene kennt nur, was aufgelöst wurde, diese den ganzen Umfang. Wäre der
  // Hinweis an jene gehängt, nennte er beim ersten Start eine zu kleine Zahl.
  it('die Erhebung ist vollständig, die Laufzeit-Menge nur das Aufgelöste', async () => {
    const modul = await ladeEigene({ 'menu.file': 'Datei op Platt' });
    modul.t('menu.edit');
    expect(modul.fehlendeSchluesselDerEigenenSprache()).toEqual(['menu.edit']);
    expect(modul.fehlendeEintraegeGegenEnglisch().length).toBe(3);
  });

  // AK5, zweiter Teil: Bei einer mitgelieferten Fassung findet keine Erhebung
  // statt — der Wächter check-i18n.js hält die fünf schlüsselgleich, und ein
  // Hinweis dort wäre ein Programmfehler, kein Anwender-Hinweis.
  it('eine mitgelieferte Sprache liefert keine Erhebung', async () => {
    const modul = await ladeModul();
    await modul.loadTranslations('de');
    // Der deutsche Prüf-Katalog ist bewusst unvollständig; gemeldet wird
    // trotzdem nichts, weil die Erhebung allein der eigenen Sprache gilt.
    expect(modul.fehlendeEintraegeGegenEnglisch()).toEqual([]);
  });

  // Nach einem Rückfall steht eine mitgelieferte Fassung: Es gibt keine eigene
  // Sprache, deren Lücke zu messen wäre.
  it('nach dem Rückfall auf Englisch gibt es nichts zu erheben', async () => {
    window.api = { localesRead: async () => ({ ok: false, error: 'fehlt' }) };
    const modul = await ladeModul();
    await modul.loadTranslations('custom:nds');
    expect(modul.fehlendeEintraegeGegenEnglisch()).toEqual([]);
  });
});
