// @vitest-environment jsdom
// 4T-001765 (Epic 3E-000186): die gemeinsame Aktivierbarkeits-Funktion der
// Statusleiste, ihre Ziel-Liste und der Modus der Darstellung.
//
// Drei Dinge sind hier zu belegen, und sie sind genau die, die ohne Fenster
// entscheidbar sind:
//
//   1. **AK1 — eine Antwort je Schalter, und es ist die des Modells.** Die
//      Ziel-Liste ordnet jedem betroffenen Schalter sein Kommando zu; dessen
//      Bedingung entscheidet. Geprüft wird beides: dass die Zuordnung die
//      Bedingung trifft, die der Schalter VOR dem Umbau trug (Basislinie, aus
//      den drei abgelösten Stellen gelesen und nicht geschätzt), und dass die
//      Funktion über alle Kontext-Konstellationen der Anforderungs-Tabelle
//      dasselbe antwortet wie das Modell.
//   2. **AK3 — Werte-Bereich und Vorgabe** der Einstellung, samt Rückfall-Regel
//      und dem Verhalten des Setters (Persistenz, No-op, Broadcast-Empfang).
//   3. **AK4/AK5/AK7 — die Darstellung**, soweit sie am einzelnen Element
//      entscheidbar ist: bei «blass» keine Klasse, bei «ausblenden» die Klasse
//      genau am nicht aktivierbaren Schalter, und die Ausblend-Liste des
//      Anwenders bleibt davon unberührt.
//
// Die sichtbare Wirkung in der Leiste (Zonen, Mittigkeit, Pull-up-Menüs) hängt
// an der realen Anordnung und liegt in
// `test/e2e/funktionen/statusleisten-schalter-darstellung.spec.js`.
//
// Muster `statusleisten-faltung.test.js`: jsdom plus api-Stub vor dem
// dynamischen Modul-Import.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import { PANEL_ACCESS } from '../../../src/shared/panel-access.js';

const {
  ANSICHTS_KOMMANDOS,
  KLASSE_UNVERFUEGBAR_VERSTECKT,
  STATUSBAR_AVAILABILITY_TARGETS,
  STATUSBAR_UNAVAILABLE_HIDDEN,
  STATUSBAR_UNAVAILABLE_MODES,
  STATUSBAR_UNAVAILABLE_MODE_KEY,
  STATUSBAR_UNAVAILABLE_PALE,
  bedingungFuerKommando,
  getStatusbarUnavailableMode,
  initStatusbarUnavailableModeFromStore,
  istLeistenSchalterAktivierbar,
  normalisiereUnverfuegbarModus,
  setStatusbarUnavailableMode,
  setzeLeistenSchalter,
  wendeUnverfuegbarModusAn,
} = await import('../../../src/renderer/modules/statusbar-availability.js');

// Die Bedingung, die jeder Schalter VOR dem Umbau trug — gelesen aus den drei
// abgelösten Stellen und in die Sprache des Katalogs übersetzt:
//
//   tabs.js:            `!sourceVisible || !tab` mit
//                       `sourceVisible = !systemTab && (source|split|live)`
//                       → sourceToggle in seiner verschärften Fassung (E6)
//   tabs.js:            `systemTab` je Ansichts-Schalter → viewMode; für die
//                       Arbeitsfläche zusätzlich `!canvasVerfuegbar`
//                       → canvasAnsicht
//   tabs.js:            `!tab || manualTab || systemTab` am Stift → fileTab
//   scroll-sync.js:     `!tab` → anyTab
//   history-status.js:  `!tab || systemPage || manualPage` → fileTab
const BASISLINIE = new Map([
  ['btn-fold-gutter', 'sourceToggle'],
  ['btn-numbers', 'sourceToggle'],
  ['btn-wrap', 'sourceToggle'],
  ['view:live', 'viewMode'],
  ['view:source', 'viewMode'],
  ['view:split', 'viewMode'],
  ['view:rendered', 'viewMode'],
  ['view:mindmap', 'viewMode'],
  ['view:canvas', 'canvasAnsicht'],
  ['btn-edit', 'fileTab'],
  ['btn-scroll-sync', 'anyTab'],
  ['btn-history', 'fileTab'],
]);

// Kennung eines Ziel-Eintrags in derselben Schreibweise wie die Basislinie.
function kennung(ziel) {
  if (ziel.elementId) return ziel.elementId;
  const m = /data-view="([^"]+)"/.exec(ziel.selector);
  return `view:${m[1]}`;
}

function kontext(teil) {
  return availabilityContext(teil);
}

// Die Zustände der Anforderungs-Tabelle (Story 4S-000947), einmal benannt.
const OHNE_DOKUMENT = kontext({});
const SYSTEM_SEITE = kontext({ hasTab: true, systemTab: true, viewMode: 'source' });
const HANDBUCH_SEITE = kontext({ hasTab: true, manualTab: true, viewMode: 'source' });
const DOKUMENT_QUELLTEXT = kontext({ hasTab: true, viewMode: 'source' });
const DOKUMENT_LESEANSICHT = kontext({ hasTab: true, viewMode: 'rendered' });
const DOKUMENT_MIT_FLAECHE = kontext({ hasTab: true, viewMode: 'source', canvasTab: true });

// Leisten-Gerüst mit genau den Elementen der Ziel-Liste.
function baueLeiste() {
  const vorhandene = document.querySelector('footer.statusbar');
  if (vorhandene) vorhandene.remove();
  const leiste = document.createElement('footer');
  leiste.className = 'statusbar';
  leiste.innerHTML = `
    <div class="statusbar-center">
      <div class="editor-toggles">
        <button id="btn-fold-gutter"></button>
        <button id="btn-numbers"></button>
        <button id="btn-wrap"></button>
      </div>
      <div class="view-toggle">
        ${Object.keys(ANSICHTS_KOMMANDOS)
          .map((a) => `<button class="view-btn" data-view="${a}"></button>`)
          .join('')}
      </div>
    </div>
    <div class="statusbar-right">
      <button id="btn-edit"></button>
      <button id="btn-scroll-sync"></button>
      <button id="btn-history"></button>
    </div>`;
  document.body.appendChild(leiste);
  return leiste;
}

function el(kennung) {
  return kennung.startsWith('view:')
    ? document.querySelector(`.view-btn[data-view="${kennung.slice(5)}"]`)
    : document.getElementById(kennung);
}

describe('Ziel-Liste der Leisten-Schalter (4T-001765, AK1)', () => {
  it('führt genau die betroffenen Schalter der mittleren und der rechten Zone', () => {
    const kennungen = STATUSBAR_AVAILABILITY_TARGETS.map(kennung);
    expect(kennungen).toEqual([...BASISLINIE.keys()]);
    expect(new Set(kennungen).size).toBe(kennungen.length);
    expect(kennungen).toHaveLength(12);
  });

  it('nennt keinen Panel-Schalter — die kennen den Zustand nicht (E5)', () => {
    const panelKnoepfe = new Set(PANEL_ACCESS.map((p) => p.buttonId));
    const verletzt = STATUSBAR_AVAILABILITY_TARGETS.map(kennung).filter((k) => panelKnoepfe.has(k));
    expect(verletzt, 'Panel-Schalter in der Ziel-Liste').toEqual([]);
  });

  it('jedes Ziel nennt ein Kommando der Registry', () => {
    const ids = new Set(COMMANDS.map((c) => c.id));
    const fremd = STATUSBAR_AVAILABILITY_TARGETS.filter((z) => !ids.has(z.commandId));
    expect(
      fremd.map((z) => z.commandId),
      'Kommandos ausserhalb der Registry',
    ).toEqual([]);
  });

  it('jeder Schalter trägt die Bedingung, die er vor dem Umbau trug', () => {
    const befunde = [];
    for (const ziel of STATUSBAR_AVAILABILITY_TARGETS) {
      const soll = BASISLINIE.get(kennung(ziel));
      const ist = bedingungFuerKommando(ziel.commandId);
      if (ist !== soll) befunde.push(`${kennung(ziel)}: "${ist}" statt "${soll}"`);
    }
    expect(befunde, 'gegenüber dem Bestand veränderte Leisten-Regeln').toEqual([]);
  });
});

describe('Gemeinsame Antwort je Schalter-Art (4T-001765, AK1)', () => {
  it('antwortet für jeden Schalter wie das Modell — über alle Zustände', () => {
    const zustaende = [
      OHNE_DOKUMENT,
      SYSTEM_SEITE,
      HANDBUCH_SEITE,
      DOKUMENT_QUELLTEXT,
      DOKUMENT_LESEANSICHT,
      DOKUMENT_MIT_FLAECHE,
    ];
    for (const ziel of STATUSBAR_AVAILABILITY_TARGETS) {
      for (const ctx of zustaende) {
        expect(
          istLeistenSchalterAktivierbar(ziel.commandId, ctx),
          `${kennung(ziel)} weicht vom Modell ab`,
        ).toBe(isAvailable(bedingungFuerKommando(ziel.commandId), ctx));
      }
    }
  });

  // Die Tabelle der Story, Zeile für Zeile: Was in welchem Zustand nicht
  // aktivierbar ist. Das ist die fachliche Aussage; der Fall darüber sichert
  // nur, dass sie aus dem Modell kommt.
  it('ohne Dokument: Editor-Schalter und rechte Zone aus, Ansichts-Schalter an', () => {
    for (const k of ['btn-fold-gutter', 'btn-numbers', 'btn-wrap']) {
      expect(aktivierbar(k, OHNE_DOKUMENT), k).toBe(false);
    }
    for (const k of ['btn-edit', 'btn-scroll-sync', 'btn-history']) {
      expect(aktivierbar(k, OHNE_DOKUMENT), k).toBe(false);
    }
    // Die fünf dokument-unabhängigen Ansichten gibt es auch ohne Dokument;
    // die Arbeitsfläche braucht eine Fläche.
    for (const k of ['view:live', 'view:source', 'view:split', 'view:rendered', 'view:mindmap']) {
      expect(aktivierbar(k, OHNE_DOKUMENT), k).toBe(true);
    }
    expect(aktivierbar('view:canvas', OHNE_DOKUMENT)).toBe(false);
  });

  it('auf einer System-Seite: Ansichts- und Editor-Schalter aus, Stift und Historie aus', () => {
    for (const k of [...Object.keys(ANSICHTS_KOMMANDOS).map((a) => `view:${a}`)]) {
      expect(aktivierbar(k, SYSTEM_SEITE), k).toBe(false);
    }
    for (const k of ['btn-fold-gutter', 'btn-numbers', 'btn-wrap', 'btn-edit', 'btn-history']) {
      expect(aktivierbar(k, SYSTEM_SEITE), k).toBe(false);
    }
    // Der Bildlauf-Gleichlauf hängt allein an einem geöffneten Reiter
    // ('anyTab') — das ist der Bestand und bleibt unverändert.
    expect(aktivierbar('btn-scroll-sync', SYSTEM_SEITE)).toBe(true);
  });

  it('auf einer Handbuch-Seite: Stift und Historie aus, Quelltext-Schalter an', () => {
    expect(aktivierbar('btn-edit', HANDBUCH_SEITE)).toBe(false);
    expect(aktivierbar('btn-history', HANDBUCH_SEITE)).toBe(false);
    for (const k of ['btn-fold-gutter', 'btn-numbers', 'btn-wrap']) {
      expect(aktivierbar(k, HANDBUCH_SEITE), k).toBe(true);
    }
  });

  it('am Dokument: in der Leseansicht sind die Editor-Schalter aus', () => {
    for (const k of ['btn-fold-gutter', 'btn-numbers', 'btn-wrap']) {
      expect(aktivierbar(k, DOKUMENT_QUELLTEXT), k).toBe(true);
      expect(aktivierbar(k, DOKUMENT_LESEANSICHT), k).toBe(false);
    }
    for (const k of ['btn-edit', 'btn-scroll-sync', 'btn-history']) {
      expect(aktivierbar(k, DOKUMENT_QUELLTEXT), k).toBe(true);
    }
    expect(aktivierbar('view:canvas', DOKUMENT_QUELLTEXT)).toBe(false);
    expect(aktivierbar('view:canvas', DOKUMENT_MIT_FLAECHE)).toBe(true);
  });

  it('ein unbekanntes Kommando gilt als aktivierbar statt still gesperrt', () => {
    // Dieselbe Fehler-Richtung wie im Modell (Begründung bei isAvailable):
    // Ein Schalter, der im Bau verschwindet, ist ein Funktions-Verlust.
    expect(istLeistenSchalterAktivierbar('gibt.esNicht', OHNE_DOKUMENT)).toBe(true);
    expect(istLeistenSchalterAktivierbar(undefined, OHNE_DOKUMENT)).toBe(true);
  });
});

function aktivierbar(k, ctx) {
  const ziel = STATUSBAR_AVAILABILITY_TARGETS.find((z) => kennung(z) === k);
  return istLeistenSchalterAktivierbar(ziel.commandId, ctx);
}

describe('Modus der Darstellung (4T-001765, AK3)', () => {
  it('kennt genau die zwei Werte des Epics — kein «wie früher»', () => {
    expect(STATUSBAR_UNAVAILABLE_MODES).toEqual([
      STATUSBAR_UNAVAILABLE_PALE,
      STATUSBAR_UNAVAILABLE_HIDDEN,
    ]);
    expect(STATUSBAR_UNAVAILABLE_PALE).toBe('blass');
    expect(STATUSBAR_UNAVAILABLE_HIDDEN).toBe('ausgeblendet');
    expect(STATUSBAR_UNAVAILABLE_MODE_KEY).toBe('statusbar.unavailableMode');
  });

  it('gilt vor dem Laden des Speichers als «blass anzeigen»', () => {
    expect(getStatusbarUnavailableMode()).toBe(STATUSBAR_UNAVAILABLE_PALE);
  });

  it('bleibt bei leerem Speicher auf «blass anzeigen» (unberührter Auslieferungs-Zustand)', async () => {
    expect(await initStatusbarUnavailableModeFromStore()).toBe(STATUSBAR_UNAVAILABLE_PALE);
    expect(getStatusbarUnavailableMode()).toBe(STATUSBAR_UNAVAILABLE_PALE);
  });

  it('fällt für jeden Wert außer «ausgeblendet» auf die Vorgabe zurück', () => {
    expect(normalisiereUnverfuegbarModus('ausgeblendet')).toBe(STATUSBAR_UNAVAILABLE_HIDDEN);
    for (const wert of ['blass', 'hidden', 'wie-frueher', '', null, undefined, 0, 1, {}]) {
      expect(normalisiereUnverfuegbarModus(wert), `Wert ${JSON.stringify(wert)}`).toBe(
        STATUSBAR_UNAVAILABLE_PALE,
      );
    }
  });

  it('übernimmt einen gesetzten Wert, persistiert ihn, meldet ihn und normalisiert Unfug', async () => {
    const geschrieben = [];
    let meldungen = 0;
    const horcher = () => {
      meldungen += 1;
    };
    document.addEventListener('scg:statusbar-unavailable-mode-changed', horcher);
    const vorher = window.api.setSetting;
    window.api.setSetting = async (key, value) => {
      geschrieben.push([key, value]);
    };
    try {
      expect(await setStatusbarUnavailableMode('ausgeblendet')).toBe(STATUSBAR_UNAVAILABLE_HIDDEN);
      expect(geschrieben).toEqual([[STATUSBAR_UNAVAILABLE_MODE_KEY, STATUSBAR_UNAVAILABLE_HIDDEN]]);
      expect(meldungen).toBe(1);
      // Unveränderter Modus: No-op, kein zweites Schreiben, keine Meldung.
      await setStatusbarUnavailableMode('ausgeblendet');
      expect(geschrieben).toHaveLength(1);
      expect(meldungen).toBe(1);
      // Unbrauchbarer Wert landet auf der Vorgabe.
      expect(await setStatusbarUnavailableMode('wie-frueher')).toBe(STATUSBAR_UNAVAILABLE_PALE);
      expect(geschrieben[1]).toEqual([STATUSBAR_UNAVAILABLE_MODE_KEY, STATUSBAR_UNAVAILABLE_PALE]);
      // `persist: false` ist der Empfang des Fenster-Broadcasts.
      await setStatusbarUnavailableMode('ausgeblendet', { persist: false });
      expect(getStatusbarUnavailableMode()).toBe(STATUSBAR_UNAVAILABLE_HIDDEN);
      expect(geschrieben).toHaveLength(2);
    } finally {
      window.api.setSetting = vorher;
      document.removeEventListener('scg:statusbar-unavailable-mode-changed', horcher);
      await setStatusbarUnavailableMode(STATUSBAR_UNAVAILABLE_PALE, { persist: false });
    }
  });
});

describe('Darstellung am einzelnen Schalter (4T-001765, AK4/AK5/AK7)', () => {
  beforeEach(async () => {
    baueLeiste();
    await setStatusbarUnavailableMode(STATUSBAR_UNAVAILABLE_PALE, { persist: false });
  });

  it('bei «blass anzeigen» bleibt es beim heutigen Verhalten: disabled, keine Klasse', () => {
    for (const ziel of STATUSBAR_AVAILABILITY_TARGETS) {
      const knopf = el(kennung(ziel));
      const aktiv = setzeLeistenSchalter(knopf, ziel.commandId, OHNE_DOKUMENT);
      expect(knopf.disabled, kennung(ziel)).toBe(!aktiv);
      expect(knopf.classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT), kennung(ziel)).toBe(false);
    }
  });

  it('bei «ausblenden» trägt genau der nicht aktivierbare Schalter die Klasse', async () => {
    await setStatusbarUnavailableMode(STATUSBAR_UNAVAILABLE_HIDDEN, { persist: false });
    for (const ziel of STATUSBAR_AVAILABILITY_TARGETS) {
      const knopf = el(kennung(ziel));
      const aktiv = setzeLeistenSchalter(knopf, ziel.commandId, OHNE_DOKUMENT);
      expect(knopf.classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT), kennung(ziel)).toBe(!aktiv);
    }
    // Gegenprobe: Der Stift ist ohne Dokument aus, am Dokument an — und die
    // Klasse folgt ihm in beide Richtungen (AK5: Rückkehr an seinen Platz).
    const stift = el('btn-edit');
    expect(stift.classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT)).toBe(true);
    setzeLeistenSchalter(stift, 'view.toggleEdit', DOKUMENT_QUELLTEXT);
    expect(stift.classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT)).toBe(false);
    expect(stift.disabled).toBe(false);
  });

  it('der Modus-Wechsel zieht die Leiste nach, ohne den Zustand zu befragen', async () => {
    for (const ziel of STATUSBAR_AVAILABILITY_TARGETS) {
      setzeLeistenSchalter(el(kennung(ziel)), ziel.commandId, OHNE_DOKUMENT);
    }
    const aus = [...BASISLINIE.keys()].filter((k) => el(k).disabled);
    expect(aus.length, 'kein Schalter ist im Prüfzustand stillgelegt').toBeGreaterThan(0);

    await setStatusbarUnavailableMode(STATUSBAR_UNAVAILABLE_HIDDEN, { persist: false });
    for (const k of BASISLINIE.keys()) {
      expect(el(k).classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT), k).toBe(aus.includes(k));
    }
    // Und zurück: Die Klasse verschwindet vollständig, die Zustände bleiben.
    await setStatusbarUnavailableMode(STATUSBAR_UNAVAILABLE_PALE, { persist: false });
    for (const k of BASISLINIE.keys()) {
      expect(el(k).classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT), k).toBe(false);
      expect(el(k).disabled, k).toBe(aus.includes(k));
    }
  });

  it('die Ausblend-Liste des Anwenders bleibt unberührt und hat Vorrang (AK7)', async () => {
    // `sb-user-hidden` ist die Achse der Ausblend-Liste. Sie wird von dieser
    // Funktion weder gesetzt noch entfernt — in keinem der beiden Werte.
    const stift = el('btn-edit');
    stift.classList.add('sb-user-hidden');
    setzeLeistenSchalter(stift, 'view.toggleEdit', OHNE_DOKUMENT);
    expect(stift.classList.contains('sb-user-hidden')).toBe(true);
    await setStatusbarUnavailableMode(STATUSBAR_UNAVAILABLE_HIDDEN, { persist: false });
    setzeLeistenSchalter(stift, 'view.toggleEdit', DOKUMENT_QUELLTEXT);
    expect(stift.classList.contains('sb-user-hidden')).toBe(true);
    expect(stift.classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT)).toBe(false);
    wendeUnverfuegbarModusAn();
    expect(stift.classList.contains('sb-user-hidden')).toBe(true);
  });

  it('ein fehlendes Element ist kein Fehler, und die Antwort bleibt dieselbe', () => {
    // Die Leiste kann Elemente nicht führen (Erweiterungs-Gate, künftige
    // Umbauten); die Funktion antwortet trotzdem und wirft nicht.
    expect(setzeLeistenSchalter(null, 'view.toggleEdit', DOKUMENT_QUELLTEXT)).toBe(true);
    expect(setzeLeistenSchalter(null, 'view.toggleEdit', OHNE_DOKUMENT)).toBe(false);
  });
});
