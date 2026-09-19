// 4T-001803 (Epic 3E-000291): Der portable Export lässt zitierte Beispiel-Blöcke
// unangetastet. Fund der Release-Abnahme von 1.138.0 an der Demo-Station
// «12 Canvas», Ursache in der gemeinsamen Fence-Erkennung.
//
// **Der Gegenstand.** Steht ein Konstrukt-Block innerhalb eines äußeren
// Code-Zauns, ist er nach Markdown-Semantik wörtlicher Text und keine Fence.
// Der Export wandelte ihn trotzdem um, weil seine Regexe zeilenweise nach dem
// Namen suchen und einen umschließenden Zaun nicht kennen. Der Altfehler
// betrifft **alle sieben** Ersetzungen des Exports an drei Orten: die vier
// Konstrukte des prozessneutralen Konverters, die Canvas-Fläche im
// Pipeline-Kern und die beiden Journal-Blöcke der nachgelagerten Kette.
//
// **Der Aufbau.** Je Art laufen fünf Fälle über den realen Nutzungspfad
// `convertMarkdownPortable`: zitiert im Backtick-Zaun, zitiert im Tilden-Zaun,
// dieselbe Art auf oberster Ebene als **Gegenprobe** (ohne sie verlöre die
// Datei still ihren Gegenstand), ein Dokument mit beidem und ein nicht
// geschlossener äußerer Zaun. Die beiden Journal-Blöcke haben einen anderen
// Aufruf-Pfad und stehen deshalb in einer eigenen Gruppe darunter. Dazu ein
// Bestands-Wächter über die mitgelieferte Demo, der die ganze Export-Kette
// fährt und damit genau den Fall misst, den der Product Owner gemeldet hat.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  convertMarkdownPortable,
  configureExtensions,
} from '../../src/shared/markdown/markdown.js';
import { replaceJournalNavFences } from '../../src/shared/journal-core.js';
import { replaceJournalTimelineFences } from '../../src/shared/journal-timeline-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');

// Die fünf Arten, die der Export umwandelt, je mit einem Rumpf, der
// tatsächlich konvertiert (die Gegenprobe hängt daran) und einem Merkmal, an
// dem die vollzogene Umwandlung erkennbar ist.
//
// Der Datensatz-Block ist das einzige Konstrukt, dessen Spalten außerhalb der
// Fence stehen; er bringt deshalb sein Frontmatter mit.
const ARTEN = [
  {
    name: 'perspective-canvas',
    zeilen: ['!karte k1 x=0 y=0 b=200 h=100', '## Zielbild', '', 'Was am Ende dasteht'],
    merkmal: 'Zielbild',
  },
  {
    name: 'perspective-table',
    zeilen: ['{|', '|-', '| eins || zwei', '|}'],
    merkmal: '<table',
  },
  {
    name: 'perspective-datatable',
    zeilen: ['columns: N:number', 'aggregate: N:sum', '| 7 |'],
    merkmal: '<table',
  },
  {
    name: 'perspective-events',
    zeilen: ['| 2020-01-01 | 2020-06-30 | Projektstart | projekt | Notiz | | | | |'],
    merkmal: '<table',
  },
  {
    name: 'perspective-records',
    kopf: ['---', 'db-table:', '  fields:', '    - name: name', '---', ''],
    zeilen: ['|-', '| Anna'],
    merkmal: '<table',
  },
];

function block(art, zaun) {
  return [`${zaun || '```'}${art.name}`, ...art.zeilen, zaun || '```'].join('\n');
}

// Das zitierte Beispiel: der Konstrukt-Block innerhalb eines äußeren Zauns.
function zitiert(art, aussen) {
  return [aussen + 'markdown', block(art), aussen].join('\n');
}

function dokument(art, koerper) {
  return [...(art.kopf || []), ...koerper, ''].join('\n');
}

describe('Portabler Export: zitierte Beispiel-Blöcke bleiben Quelltext (4T-001803)', () => {
  afterEach(() => {
    configureExtensions([]);
  });

  for (const art of ARTEN) {
    describe(art.name, () => {
      it('bleibt im äußeren Backtick-Zaun byte-gleich stehen', () => {
        const beispiel = zitiert(art, '````');
        const out = convertMarkdownPortable(dokument(art, [beispiel]), true, 'de');
        expect(out).toContain(beispiel);
      });

      it('bleibt im äußeren Tilden-Zaun byte-gleich stehen', () => {
        const beispiel = zitiert(art, '~~~~');
        const out = convertMarkdownPortable(dokument(art, [beispiel]), true, 'de');
        expect(out).toContain(beispiel);
      });

      // Die Gegenprobe: Ohne sie bliebe unbemerkt, wenn der Export die Art
      // gar nicht mehr umwandelt und die Fälle oben deshalb grün sind.
      it('wird auf oberster Ebene weiterhin umgewandelt', () => {
        const echt = block(art);
        const out = convertMarkdownPortable(dokument(art, [echt]), true, 'de');
        expect(out).not.toContain(echt);
        expect(out).toContain(art.merkmal);
      });

      it('wandelt in einem Dokument mit beidem allein den echten Block um', () => {
        const beispiel = zitiert(art, '````');
        const echt = block(art);
        const out = convertMarkdownPortable(
          dokument(art, [
            'So sieht es im Quelltext aus:',
            '',
            beispiel,
            '',
            'Und so wirkt es:',
            '',
            echt,
          ]),
          true,
          'de',
        );
        expect(out).toContain(beispiel);
        expect(out).toContain(art.merkmal);
        // Genau ein Vorkommen bleibt: das zitierte im äußeren Zaun.
        expect(out.split('```' + art.name)).toHaveLength(2);
      });

      it('lässt alles hinter einem nicht geschlossenen äußeren Zaun unangetastet', () => {
        const koerper = ['````markdown', block(art), '', 'Kein Zaun schließt das hier.'];
        const quelle = dokument(art, koerper);
        const out = convertMarkdownPortable(quelle, false, 'de');
        expect(out).toBe(quelle);
      });
    });
  }
});

// Die beiden Journal-Blöcke stehen getrennt, weil sie einen anderen Aufruf-Pfad
// haben: Sie laufen NICHT über `convertMarkdownPortable`, sondern werden im
// portablen Export nachgelagert ersetzt — die Speichern-Strecke des Renderers
// (`exportCurrentTabAsPortable` in `src/renderer/modules/views/save-export.js`)
// ruft nach dem prozessneutralen Konverter zuerst
// `replaceJournalNavFencesForExport` und danach
// `replaceJournalTimelineFencesForExport` auf, und diese beiden benutzen die
// hier geprüften reinen Kern-Funktionen. Geprüft wird deshalb an der Kern-
// Funktion: Sie trägt die Fence-Erkennung, die Renderer-Schicht darüber steuert
// nur den Ersatz-Text bei und braucht ein laufendes Programm.
const JOURNAL_ARTEN = [
  {
    name: 'perspective-journal-nav',
    zeilen: [],
    ersetze: (text) => replaceJournalNavFences(text, '**Januar 2026**'),
    merkmal: '**Januar 2026**',
  },
  {
    name: 'perspective-journal-timeline',
    zeilen: ['mode: month'],
    ersetze: (text) => replaceJournalTimelineFences(text, () => '**Zeitstrahl**'),
    merkmal: '**Zeitstrahl**',
  },
];

describe('Portabler Export: zitierte Journal-Blöcke bleiben Quelltext (4T-001803)', () => {
  for (const art of JOURNAL_ARTEN) {
    describe(art.name, () => {
      it('bleibt im äußeren Backtick-Zaun byte-gleich stehen', () => {
        const beispiel = zitiert(art, '````');
        expect(art.ersetze(beispiel + '\n')).toContain(beispiel);
      });

      it('bleibt im äußeren Tilden-Zaun byte-gleich stehen', () => {
        const beispiel = zitiert(art, '~~~~');
        expect(art.ersetze(beispiel + '\n')).toContain(beispiel);
      });

      // Die Gegenprobe: Ohne sie bliebe unbemerkt, wenn die Ersetzung gar
      // nicht mehr greift und die beiden Fälle oben deshalb grün sind.
      it('wird auf oberster Ebene weiterhin ersetzt', () => {
        const echt = block(art);
        const out = art.ersetze(echt + '\n');
        expect(out).not.toContain(echt);
        expect(out).toContain(art.merkmal);
      });

      it('ersetzt in einem Dokument mit beidem allein den echten Block', () => {
        const beispiel = zitiert(art, '````');
        const echt = block(art);
        const out = art.ersetze(
          [
            'So sieht es im Quelltext aus:',
            '',
            beispiel,
            '',
            'Und so wirkt es:',
            '',
            echt,
            '',
          ].join('\n'),
        );
        expect(out).toContain(beispiel);
        expect(out).toContain(art.merkmal);
        // Genau ein Vorkommen bleibt: das zitierte im äußeren Zaun.
        expect(out.split('```' + art.name)).toHaveLength(2);
      });
    });
  }
});

// Der Bestands-Wächter über die mitgelieferte Demo. Er misst den gemeldeten
// Fall an der realen Quelle statt an einem nachgebauten Dokument: Die Station
// «12 Canvas» zeigt ihren eigenen Quelltext in einem äußeren Vier-Backtick-Zaun
// und sagt im Satz davor, dass dort der Quelltext steht.
//
// **Der Zuschnitt ist eng gehalten und nicht weich gemacht.** Geprüft werden
// ausschließlich Code-Blöcke der obersten Ebene, deren Infostring NICHT mit
// `perspective-` beginnt: Ein Block einer Konstrukt-Art SOLL sich ändern, das
// ist der Zweck des Exports. Alles andere ist wörtlicher Text und muss den
// Export byte-gleich überstehen; die drei code-bewussten Vorverarbeitungen
// (private Kommentare, Gliederungs-Marker, Inline-Berechnung) lassen
// Fence-Inhalte ohnehin in Ruhe, und genau das hält dieser Wächter fest.
//
// **Gemessen wird die ganze Kette**, also der prozessneutrale Konverter und
// danach die beiden Journal-Ersetzungen in der Reihenfolge der Speichern-
// Strecke. Beide Kern-Funktionen laufen ohne Renderer; was die Renderer-Schicht
// darüber beisteuert, ist allein der Ersatz-Text, und der ist hier gestellt.
const ZAUN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

function exportKette(text) {
  const nachKonverter = convertMarkdownPortable(text, true, 'en');
  const nachNav = replaceJournalNavFences(nachKonverter, '**Januar 2026**');
  return replaceJournalTimelineFences(nachNav, () => '**Zeitstrahl**');
}

// Die Code-Blöcke der obersten Ebene eines Textes, je als vollständiger
// Block-Text von der Öffner- bis zur Schließ-Zeile.
function obersteBloecke(text) {
  const zeilen = String(text).split('\n');
  const bloecke = [];
  let offen = null;
  for (let i = 0; i < zeilen.length; i++) {
    const m = ZAUN_RE.exec(zeilen[i].replace(/\r$/, ''));
    if (!m) continue;
    const zeichen = m[2][0];
    const laenge = m[2].length;
    const info = m[3].trim();
    if (offen) {
      if (zeichen === offen.zeichen && laenge >= offen.laenge && info === '') {
        bloecke.push({ info: offen.info, text: zeilen.slice(offen.start, i + 1).join('\n') });
        offen = null;
      }
      continue;
    }
    if (zeichen === '`' && info.includes('`')) continue;
    offen = { zeichen, laenge, info: info.split(/\s+/)[0], start: i };
  }
  return bloecke;
}

describe('Portabler Export: Demo-Bestand (4T-001803)', () => {
  afterEach(() => {
    configureExtensions([]);
  });

  const dateien = fs
    .readdirSync(DEMO_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();

  it('findet die mitgelieferten Demo-Seiten', () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  for (const name of dateien) {
    it(`lässt in «${name}» jeden fremden Code-Block der obersten Ebene wörtlich stehen`, () => {
      const quelle = fs.readFileSync(path.join(DEMO_DIR, name), 'utf8');
      const bloecke = obersteBloecke(quelle).filter((b) => !b.info.startsWith('perspective-'));
      if (bloecke.length === 0) return;
      const out = exportKette(quelle);
      for (const b of bloecke) expect(out).toContain(b.text);
    });
  }
});
