// @vitest-environment jsdom
// 4T-1156 (Epic 3E-0219, E11): Bedienelemente der neuen Feld-Typen und der
// typ-eigenen Optionen — Verweis, Uhrzeit, Zahl-Grenzen, Datums-Verschiebung
// und der Zyklus der Einfach-Auswahl.
//
// Geprüft wird das gemeinsame Modul `properties-neue-typen.js`, das beide
// Eigenschafts-Panels benutzen. Genau darin liegt der Paritäts-Nachweis
// dieses Tasks: Solange beide Panels dieselben Bau-Funktionen rufen, kann
// ihr Verhalten nicht auseinanderlaufen — geprüft wird das im
// Paritäts-Fall unten am Import-Graph beider Panels.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { api } = await import('../../../src/renderer/modules/app/api.js');
const {
  applyDateOptions,
  applyNumberOptions,
  renderCycleField,
  renderLinkField,
  renderTimeField,
  zielName,
} = await import('../../../src/renderer/modules/properties/properties-neue-typen.js');

function container() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// Die Ziel-Liste kommt aus dem Main; hier ein Stub, der den Aufruf mitschreibt.
function stubZiele(antwort) {
  const aufrufe = [];
  api.profilesLinkTargets = async (params) => {
    aufrufe.push(params);
    return antwort;
  };
  return aufrufe;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('zielName', () => {
  it('liest den Ziel-Namen aus der Wiki-Schreibweise', () => {
    expect(zielName('[[Meier 2024]]')).toBe('Meier 2024');
    expect(zielName('  [[Meier 2024]]  ')).toBe('Meier 2024');
    expect(zielName('[[Meier 2024|Werner]]')).toBe('Meier 2024');
    expect(zielName('[[Meier 2024#Kapitel]]')).toBe('Meier 2024');
  });

  it('nimmt einen blanken Namen ohne Klammern als Ziel an', () => {
    expect(zielName('Meier 2024')).toBe('Meier 2024');
  });

  it('liefert null, wo kein Ziel steht', () => {
    expect(zielName('')).toBeNull();
    expect(zielName('   ')).toBeNull();
    expect(zielName(null)).toBeNull();
    expect(zielName(42)).toBeNull();
    // Halb geschriebene Klammern sind kein Ziel, sondern Text im Werden.
    expect(zielName('[[Meier')).toBeNull();
  });
});

describe('AK3: Verweis-Feld', () => {
  it('zeigt den Roh-Wert und ändert ihn nicht still', async () => {
    stubZiele({ ok: true, status: 'ready', targets: [] });
    const c = container();
    const input = renderLinkField(c, '[[Meier 2024]]', {});
    expect(input.value).toBe('[[Meier 2024]]');
    expect(c.querySelector('.properties-field-link-open')).not.toBeNull();
  });

  it('reicht dem Öffnen-Knopf den Ziel-Namen, nicht den Roh-Wert', () => {
    stubZiele({ ok: true, status: 'ready', targets: [] });
    const geoeffnet = [];
    const c = container();
    renderLinkField(c, '[[Meier 2024|Werner]]', { onOpen: (n) => geoeffnet.push(n) });
    c.querySelector('.properties-field-link-open').click();
    expect(geoeffnet).toEqual(['Meier 2024']);
  });

  it('bleibt ohne Öffnen-Funktion still, statt zu werfen', () => {
    stubZiele({ ok: true, status: 'ready', targets: [] });
    const c = container();
    renderLinkField(c, '[[A]]', {});
    expect(() => c.querySelector('.properties-field-link-open').click()).not.toThrow();
  });

  it('öffnet nichts, wo kein Ziel steht', () => {
    stubZiele({ ok: true, status: 'ready', targets: [] });
    const geoeffnet = [];
    const c = container();
    renderLinkField(c, '   ', { onOpen: (n) => geoeffnet.push(n) });
    c.querySelector('.properties-field-link-open').click();
    expect(geoeffnet).toEqual([]);
  });

  it('reicht die typ-eigenen Optionen an die Ziel-Abfrage durch', async () => {
    const aufrufe = stubZiele({ ok: true, status: 'ready', targets: [] });
    const def = {
      name: 'quelle',
      type: 'link',
      options: { restrictTo: ['10 Projekte'], display: 'titel', sort: 'path' },
    };
    renderLinkField(container(), '', { def, filePath: 'C:/a/b.md' });
    await Promise.resolve();
    await Promise.resolve();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].path).toBe('C:/a/b.md');
    expect(aufrufe[0].options).toEqual(def.options);
  });

  it('bietet die Ziele als Vervollständigung an, mit dem Anzeige-Namen als Beschriftung', async () => {
    stubZiele({
      ok: true,
      status: 'ready',
      targets: [
        { name: 'Meier 2024', folder: 'Quellen', display: 'Werner Meier' },
        { name: 'Notiz', folder: '', display: null },
      ],
    });
    const c = container();
    const input = renderLinkField(c, '', {});
    await Promise.resolve();
    await Promise.resolve();
    const dl = c.querySelector('datalist');
    expect(dl).not.toBeNull();
    expect(input.getAttribute('list')).toBe(dl.id);
    const optionen = [...dl.querySelectorAll('option')];
    // Der Wert ist die Wiki-Schreibweise — das ist, was gespeichert wird.
    expect(optionen.map((o) => o.value)).toEqual(['[[Meier 2024]]', '[[Notiz]]']);
    expect(optionen[0].textContent).toBe('Werner Meier');
  });

  it('markiert ein fehlendes Ziel und lässt das Feld bedienbar', async () => {
    stubZiele({
      ok: true,
      status: 'ready',
      targets: [{ name: 'Meier 2024', folder: '', display: null }],
    });
    const c = container();
    const input = renderLinkField(c, '[[Gibt es nicht]]', {});
    await Promise.resolve();
    await Promise.resolve();
    const marker = c.querySelector('.properties-field-link-missing');
    expect(marker.hidden).toBe(false);
    expect(marker.title).toContain('Gibt es nicht');
    expect(input.disabled).toBe(false);
  });

  it('behauptet nichts, solange der Index nicht bereit ist', async () => {
    stubZiele({ ok: true, status: 'indexing', targets: [] });
    const c = container();
    renderLinkField(c, '[[Gibt es nicht]]', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(c.querySelector('.properties-field-link-missing').hidden).toBe(true);
  });

  it('bleibt bedienbar, wenn die Ziel-Abfrage scheitert', async () => {
    api.profilesLinkTargets = async () => {
      throw new Error('kein Kanal');
    };
    const c = container();
    const input = renderLinkField(c, '[[X]]', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(input.disabled).toBe(false);
    expect(c.querySelector('.properties-field-link-missing').hidden).toBe(true);
  });

  it('ist im Lese-Modus gesperrt und ohne Vervollständigung', async () => {
    stubZiele({
      ok: true,
      status: 'ready',
      targets: [{ name: 'A', folder: '', display: null }],
    });
    const c = container();
    const input = renderLinkField(c, '[[A]]', { readOnly: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(input.disabled).toBe(true);
    expect(c.querySelector('datalist')).toBeNull();
  });
});

describe('AK5: Uhrzeit-Feld', () => {
  it('nutzt das Zeit-Bedienelement und behält den Wert', () => {
    const input = renderTimeField(container(), '09:30', {});
    expect(input.type).toBe('time');
    expect(input.value).toBe('09:30');
    expect(input.step).toBe('');
  });

  it('zeigt Sekunden nur, wenn der Wert welche trägt', () => {
    expect(renderTimeField(container(), '23:59:59', {}).step).toBe('1');
  });

  it('ist im Lese-Modus gesperrt', () => {
    expect(renderTimeField(container(), '09:30', { readOnly: true }).disabled).toBe(true);
  });
});

describe('AK5: Optionen von Zahl und Datum', () => {
  it('legt step, min und max an das Zahlen-Feld', () => {
    const input = document.createElement('input');
    input.type = 'number';
    applyNumberOptions(input, { options: { step: 100, min: 0, max: 5000 } });
    expect(input.step).toBe('100');
    expect(input.min).toBe('0');
    expect(input.max).toBe('5000');
  });

  it('lässt ein Feld ohne Optionen unverändert', () => {
    const input = document.createElement('input');
    input.type = 'number';
    applyNumberOptions(input, null);
    applyNumberOptions(input, { options: {} });
    expect(input.step).toBe('');
    expect(input.min).toBe('');
    expect(input.max).toBe('');
  });

  it('schlägt beim Datum den verschobenen Tag vor, ohne einen Wert zu verrücken', () => {
    const leer = document.createElement('input');
    leer.type = 'date';
    applyDateOptions(leer, { options: { shift: 7 } });
    expect(leer.value).toBe(''); // Vorschlag, keine Vorbelegung ohne Zutun
    expect(leer.placeholder).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(leer.dataset.shiftSuggestion).toBe(leer.placeholder);

    // Ein gesetztes Datum bleibt unangetastet — sonst wäre es eine
    // Wert-Änderung ohne Zutun des Anwenders.
    const gesetzt = document.createElement('input');
    gesetzt.type = 'date';
    gesetzt.value = '2026-01-01';
    applyDateOptions(gesetzt, { options: { shift: 7 } });
    expect(gesetzt.value).toBe('2026-01-01');
    expect(gesetzt.dataset.shiftSuggestion).toBeUndefined();
  });

  it('belegt das leere Feld beim ersten Fokus mit dem Vorschlag', () => {
    const input = document.createElement('input');
    input.type = 'date';
    document.body.appendChild(input);
    applyDateOptions(input, { options: { shift: 7 } });
    const vorschlag = input.placeholder;
    input.dispatchEvent(new Event('focus'));
    expect(input.value).toBe(vorschlag);
  });
});

describe('AK6: Zyklus der Einfach-Auswahl', () => {
  const def = { name: 'status', type: 'string', values: ['offen', 'fertig'], multiple: false };

  it('schaltet durch den Vorrat und schließt den Leer-Wert ein', () => {
    const knopf = renderCycleField(container(), def, 'offen', {});
    expect(knopf.dataset.value).toBe('offen');
    knopf.click();
    expect(knopf.dataset.value).toBe('fertig');
    knopf.click();
    expect(knopf.dataset.value).toBe(''); // wieder leer werden können
    expect(knopf.textContent).toBe('—');
    knopf.click();
    expect(knopf.dataset.value).toBe('offen');
  });

  it('speichert denselben Wert wie ohne die Option', () => {
    const knopf = renderCycleField(container(), def, 'fertig', {});
    // Der gespeicherte Wert ist der Werte-String selbst, kein Index und kein
    // Sentinel — das ist die tragende Zusage der Bedien-Option.
    expect(knopf.dataset.value).toBe('fertig');
    expect(def.values).toContain(knopf.dataset.value);
  });

  it('meldet jede Schaltung an den Speicher-Weg', () => {
    const gemeldet = [];
    const knopf = renderCycleField(container(), def, '', { onChange: (v) => gemeldet.push(v) });
    knopf.click();
    knopf.click();
    expect(gemeldet).toEqual(['offen', 'fertig']);
  });

  it('ist im Lese-Modus gesperrt', () => {
    expect(renderCycleField(container(), def, 'offen', { readOnly: true }).disabled).toBe(true);
  });

  it('kommt mit einem Feld ohne Werte-Liste zurecht', () => {
    const knopf = renderCycleField(container(), { name: 'x', type: 'string' }, '', {});
    knopf.click();
    expect(knopf.dataset.value).toBe('');
  });
});

describe('AK2: Parität beider Eigenschafts-Panels', () => {
  it('beide Panels bauen die neuen Typen aus derselben Quelle', async () => {
    // Der Paritäts-Nachweis dieses Tasks: Statt zwei Umsetzungen zu
    // vergleichen, wird geprüft, dass beide Panels dieselben Bau-Funktionen
    // importieren. Ein Panel, das einen eigenen Zweig baute, fiele hier auf.
    const fs = await import('node:fs');
    const quellen = [
      'src/renderer/modules/properties/properties-fields.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ].map((p) => fs.readFileSync(p, 'utf8'));
    for (const quelle of quellen) {
      expect(quelle).toContain("from './properties-neue-typen.js'");
      for (const fn of [
        'renderLinkField',
        'renderTimeField',
        'renderCycleField',
        'applyNumberOptions',
        'applyDateOptions',
        'attachLinkSuggestions',
      ]) {
        expect(quelle).toContain(fn);
      }
    }
  });

  it('das Bau-Modul bleibt außerhalb der Zyklus-Komponente der Renderer-Ordner', async () => {
    // Der Import-Wächter friert eine bestehende Zyklus-Komponente ein und
    // verbietet neue Beitritte. Das Bau-Modul hält sich deshalb aus
    // `views/` heraus; das Öffnen eines Ziels kommt als Parameter herein.
    const fs = await import('node:fs');
    const quelle = fs.readFileSync(
      'src/renderer/modules/properties/properties-neue-typen.js',
      'utf8',
    );
    expect(quelle).not.toContain("from '../views/");
    expect(quelle).not.toContain("from './properties-");
    // Die beiden Panels liefern den Öffnen-Weg — dort ist der Import zulässig.
    for (const p of [
      'src/renderer/modules/properties/properties-fields.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ]) {
      expect(fs.readFileSync(p, 'utf8')).toContain('onOpen: (name) =>');
    }
  });

  it('beide Panels behandeln jedes Mehrfach-Feld über die Chips-Leiste', async () => {
    const fs = await import('node:fs');
    for (const p of [
      'src/renderer/modules/properties/properties-fields.js',
      'src/renderer/modules/properties/block-props-fields.js',
    ]) {
      const quelle = fs.readFileSync(p, 'utf8');
      // Seit der Entkopplung (E11) darf die Bedingung nicht mehr allein am
      // Typ-Namen 'multistring' hängen.
      expect(quelle).toContain("type === 'multistring' || (def && def.multiple === true)");
    }
  });
});

describe('AK13: Erweiterungs-Gate der Zuordnungs-Wege (4T-1159)', () => {
  it('die Auflösung läuft nur bei aktiver Erweiterung — auch die neuen Wege', async () => {
    // Schlagwort und Ordner bekommen kein eigenes Gate: Sie laufen über
    // dieselbe eine Auflösung, und die fragt der Renderer nur bei aktiver
    // Erweiterung. Geprüft wird deshalb, dass es bei genau EINEM Aufruf
    // hinter der Gate-Bedingung bleibt — ein zweiter Aufrufer wäre ein Weg
    // am Gate vorbei.
    const fs = await import('node:fs');
    const quelle = fs.readFileSync('src/renderer/modules/properties/properties-types.js', 'utf8');
    expect(quelle).toContain("isExtensionActive('property-profiles')");
    const aufrufe = quelle.match(/api\.profilesResolve\(/g) || [];
    expect(aufrufe).toHaveLength(1);
    // Und der Aufruf steht NACH der Gate-Bedingung.
    expect(quelle.indexOf("isExtensionActive('property-profiles')")).toBeLessThan(
      quelle.indexOf('api.profilesResolve('),
    );
  });

  it('kein anderes Renderer-Modul löst Profile auf', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const wurzel = 'src/renderer/modules';
    const treffer = [];
    const lauf = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) lauf(p);
        else if (
          e.name.endsWith('.js') &&
          fs.readFileSync(p, 'utf8').includes('profilesResolve(')
        ) {
          treffer.push(p.split(path.sep).join('/'));
        }
      }
    };
    lauf(wurzel);
    expect(treffer).toEqual(['src/renderer/modules/properties/properties-types.js']);
  });

  it('der Main-Handler prüft das Gate für die Ziel- und Wertevorrats-Kanäle selbst', async () => {
    // Die beiden Kanäle aus 4T-1156 und 4T-1158 sind eigene Eingänge und
    // tragen ihre Gate-Prüfung deshalb im Handler.
    const fs = await import('node:fs');
    const quelle = fs.readFileSync('src/main/ipc/profiles.js', 'utf8');
    const gates = quelle.match(/isExtensionEnabled\('property-profiles'/g) || [];
    expect(gates.length).toBeGreaterThanOrEqual(2);
  });
});

// 4T-1164: Diese Gruppe prüft ausschließlich die VERDRAHTUNG als Quelltext,
// nicht die Sichtbarkeit. Genau daran ist der Abnahme-Befund von 1.116.0
// vorbeigelaufen: Alle Fälle waren grün, während das Symbol in jeder
// Reiter-Anordnung unsichtbar war. Den Nachweis am Rendering führt seit
// 4T-1164 der E2E-Fall PP-12; er ist der eigentliche Wächter dieser Funktion.
describe('AK2/AK4/AK7: Profil-Symbol der Eigenschaften-Sektion (4T-1161)', () => {
  it('das Markup trägt das Symbol-Element in BEIDEN Sektions-Körpern', async () => {
    // Pro Spalte eine Instanz — ein Symbol nur in einer Spalte wäre je nach
    // Arbeitsweise unsichtbar.
    const fs = await import('node:fs');
    const html = fs.readFileSync('src/renderer/index.html', 'utf8');
    const treffer = html.match(/class="properties-profile-badge"/g) || [];
    expect(treffer).toHaveLength(2);
    // Es startet verborgen — ohne Profil erscheint nichts (AK4).
    expect(html).toContain('<span class="properties-profile-badge" hidden></span>');
  });

  it('4T-1164: das Symbol steht im Körper und nicht im Sektions-Kopf', async () => {
    // Der Kopf wird in einer Reiter-Gruppe per CSS ausgeblendet
    // (.sidebar-section.in-tab-group > .sidebar-section-header). Ein Symbol
    // darin ist dort unsichtbar — der Abnahme-Befund von 1.116.0.
    const fs = await import('node:fs');
    const html = fs.readFileSync('src/renderer/index.html', 'utf8');
    for (const abschnitt of html.split('class="sidebar-section sidebar-properties"').slice(1)) {
      const kopf = abschnitt.slice(
        abschnitt.indexOf('<header'),
        abschnitt.indexOf('</header>') + '</header>'.length,
      );
      expect(kopf).not.toContain('properties-profile-badge');
      const koerper = abschnitt.slice(abschnitt.indexOf('sidebar-section-body'));
      expect(koerper.slice(0, koerper.indexOf('</section>'))).toContain('properties-profile-badge');
    }
    // Und die CSS-Regel, die `hidden` gegen das eigene `display: block`
    // verteidigt: ohne sie erschiene das leere Symbol immer.
    const css = fs.readFileSync('src/renderer/styles/eigenschaften-und-notizen.css', 'utf8');
    expect(css).toContain('.properties-profile-badge[hidden]');
  });

  it('das Element-Handle ist je Spalte gebunden', async () => {
    const fs = await import('node:fs');
    const quelle = fs.readFileSync('src/renderer/modules/app/app-state.js', 'utf8');
    expect(quelle).toContain(
      "propertiesProfileBadge: root.querySelector('.sidebar-properties .properties-profile-badge')",
    );
  });

  it('AK7: das Symbol hängt an derselben Auflösung und damit am selben Gate', async () => {
    // Kein eigener Weg am Erweiterungs-Gate vorbei: Die Anzeige läuft in
    // refreshProfileResolution, also hinter isExtensionActive.
    const fs = await import('node:fs');
    const quelle = fs.readFileSync('src/renderer/modules/properties/properties-types.js', 'utf8');
    expect(quelle).toContain('applyProfileBadge(els, next)');
    expect(quelle.indexOf("isExtensionActive('property-profiles')")).toBeLessThan(
      quelle.indexOf('applyProfileBadge(els, next)'),
    );
    // Und es gibt genau EINEN Aufruf — ein zweiter wäre ein Weg am Gate vorbei.
    expect(quelle.match(/applyProfileBadge\(/g)).toHaveLength(2); // Definition + Aufruf
  });

  it('AK4: das Symbol bleibt in properties-fields.js unberührt', async () => {
    // PO-Entscheidung vom 2026-08-23: Das Symbol gehört in den Sektions-Kopf,
    // nicht in die Feld-Datei — auch, damit deren Datei-Budget nicht kippt.
    const fs = await import('node:fs');
    const quelle = fs.readFileSync('src/renderer/modules/properties/properties-fields.js', 'utf8');
    expect(quelle).not.toContain('profile-badge');
    expect(quelle).not.toContain('applyProfileBadge');
  });
});
