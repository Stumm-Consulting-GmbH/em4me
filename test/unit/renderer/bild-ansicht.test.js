// @vitest-environment jsdom
// 4T-001870 (Epic 3E-000322): vergrößerte Darstellung eines Bildes der
// gerenderten Ansicht (`src/renderer/modules/views/image-lightbox.js`).
//
// Geprüft sind hier die reine Logik — ob ein Bild angezeigt wird, welche Datei
// hinter ihm steht, welche Beschriftung es bekommt — und das Verhalten der
// Fläche: Öffnen, die drei Schließ-Wege, die Schaltfläche ins Standardprogramm,
// die Tastatur und die Rückkehr des Fokus.
//
// Was dieser Fall NICHT zeigt, weil jsdom keine Gestaltungs-Regeln anwendet:
// die Größe des Bildes im Fenster, die Abdunkelung als sichtbare Fläche und den
// Klick-Pfad der gerenderten Ansicht. Diese Wirkung weist die Ablauf-Prüfdatei
// `test/e2e/funktionen/bild-ansicht.spec.js` (VG-01 bis VG-05) nach.
import { describe, it, expect, afterEach } from 'vitest';
import {
  captionFor,
  closeImageLightbox,
  fileNameFromSource,
  imageFileSource,
  imageSourceBase,
  isImageDisplayed,
  isImageLightboxOpen,
  openImageLightbox,
} from '../../../src/renderer/modules/views/image-lightbox.js';
import { bildDoppelklickDurchlassen } from '../../../src/renderer/modules/live/live-shared.js';

// jsdom lädt keine Bilder; Ladezustand und eigene Größe werden deshalb am
// Element gesetzt, so wie der Browser sie nach dem Laden meldet.
function bild({ alt, quelle, src = 'data:image/png;base64,AAAA', breite = 40, hoehe = 30 } = {}) {
  const img = document.createElement('img');
  if (alt !== undefined) img.setAttribute('alt', alt);
  if (quelle !== undefined) img.setAttribute('data-src-original', quelle);
  img.setAttribute('src', src);
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  Object.defineProperty(img, 'naturalWidth', { value: breite, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: hoehe, configurable: true });
  document.body.appendChild(img);
  return img;
}

const flaeche = () => document.getElementById('image-lightbox');
const knopfStandard = () => flaeche().querySelector('.image-lightbox-open-external');
const knopfSchliessen = () => flaeche().querySelector('.image-lightbox-close');
const beschriftung = () => flaeche().querySelector('.image-lightbox-caption');
const taste = (key, extra = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });

afterEach(() => {
  closeImageLightbox();
  for (const img of document.querySelectorAll('body > img')) img.remove();
  for (const b of document.querySelectorAll('body > button')) b.remove();
});

describe('Bild-Vergrößerung: ob ein Bild angezeigt wird (E9)', () => {
  it('ein geladenes Bild mit eigener Größe gilt als angezeigt', () => {
    expect(isImageDisplayed(bild())).toBe(true);
  });

  it('ein Bild ohne geladene Daten (fehlende Datei, Netz-Quelle) gilt nicht als angezeigt', () => {
    expect(isImageDisplayed(bild({ breite: 0, hoehe: 0 }))).toBe(false);
  });

  it('ein noch nicht fertig geladenes Bild gilt nicht als angezeigt', () => {
    const img = bild();
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    expect(isImageDisplayed(img)).toBe(false);
  });

  it('ohne Element: nicht angezeigt', () => {
    expect(isImageDisplayed(null)).toBe(false);
  });
});

describe('Bild-Vergrößerung: Datei hinter dem Bild', () => {
  it('liest den geschriebenen Pfad aus dem Quelltext-Attribut', () => {
    expect(imageFileSource(bild({ quelle: 'Bilder/foto.png' }))).toBe('Bilder/foto.png');
  });

  it('eine Daten-Quelle und eine Netz-Quelle haben keine eigene Datei', () => {
    expect(imageFileSource(bild())).toBe('');
    expect(imageFileSource(bild({ quelle: 'data:image/png;base64,AAAA' }))).toBe('');
    expect(imageFileSource(bild({ quelle: 'https://example.org/a.png' }))).toBe('');
  });
});

describe('Bild-Vergrößerung: Beschriftung (E11)', () => {
  it('Dateiname: letztes Segment, Kodierung aufgelöst, Zusatz abgeschnitten', () => {
    expect(fileNameFromSource('Bilder/Mein%20Bild.png')).toBe('Mein Bild.png');
    expect(fileNameFromSource('C:\\Ablage\\Plan.jpg')).toBe('Plan.jpg');
    expect(fileNameFromSource('a/b/skizze.png?x=1#y')).toBe('skizze.png');
    expect(fileNameFromSource('100%.png')).toBe('100%.png');
    expect(fileNameFromSource('')).toBe('');
  });

  it('der Alternativtext hat Vorrang', () => {
    expect(captionFor(bild({ alt: 'Grundriss', quelle: 'plan.png' }))).toBe('Grundriss');
  });

  it('ohne Alternativtext steht der Dateiname da, auch bei nur Leerzeichen', () => {
    expect(captionFor(bild({ quelle: 'Anlagen/plan%20neu.png' }))).toBe('plan neu.png');
    expect(captionFor(bild({ alt: '   ', quelle: 'x/y.png' }))).toBe('y.png');
  });

  it('eine Daten-Quelle ohne Alternativtext bleibt ohne Beschriftung', () => {
    expect(captionFor(bild())).toBe('');
  });
});

describe('Bild-Vergrößerung: Öffnen', () => {
  it('ein angezeigtes Bild öffnet die Fläche mit Bild, Beschriftung und beiden Schaltflächen', () => {
    const img = bild({ alt: 'Grundriss', quelle: 'plan.png' });
    expect(openImageLightbox(img, { onOpenExternal: async () => true })).toBe(true);
    expect(isImageLightboxOpen()).toBe(true);
    expect(flaeche().querySelector('.image-lightbox-image').getAttribute('src')).toBe(
      img.getAttribute('src'),
    );
    expect(beschriftung().textContent).toBe('Grundriss');
    expect(beschriftung().hidden).toBe(false);
    expect(knopfStandard().hidden).toBe(false);
    expect(knopfSchliessen().hidden).toBe(false);
    // Die Texte kommen über Schlüssel, nie als fester Text.
    expect(knopfStandard().textContent).not.toBe('');
    expect(knopfSchliessen().textContent).not.toBe('');
    const dialog = flaeche().querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).not.toBe('');
    expect(document.body.classList.contains('image-lightbox-open')).toBe(true);
  });

  it('ein nicht angezeigtes Bild öffnet nichts, auch keine leere Fläche (AK11)', () => {
    const img = bild({ quelle: 'fehlt.png', breite: 0, hoehe: 0 });
    expect(openImageLightbox(img, { onOpenExternal: async () => true })).toBe(false);
    expect(isImageLightboxOpen()).toBe(false);
  });

  it('ohne eigene Datei fehlt die Schaltfläche ins Standardprogramm (AK14)', () => {
    openImageLightbox(bild(), { onOpenExternal: null });
    expect(knopfStandard().hidden).toBe(true);
    expect(beschriftung().hidden).toBe(true);
  });

  it('mehrere Bilder nacheinander: nichts von der vorigen Öffnung bleibt stehen (AK19)', () => {
    openImageLightbox(bild({ alt: 'Erstes', src: 'data:image/png;base64,AAAA' }), {
      onOpenExternal: async () => true,
    });
    closeImageLightbox();
    openImageLightbox(bild({ src: 'data:image/png;base64,BBBB' }), { onOpenExternal: null });
    expect(beschriftung().textContent).toBe('');
    expect(knopfStandard().hidden).toBe(true);
    expect(flaeche().querySelector('.image-lightbox-image').getAttribute('src')).toBe(
      'data:image/png;base64,BBBB',
    );
    expect(document.querySelectorAll('#image-lightbox')).toHaveLength(1);
  });
});

describe('Bild-Vergrößerung: die drei Schließ-Wege (E5)', () => {
  it('Klick auf die abgedunkelte Fläche schließt', () => {
    openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
    flaeche().querySelector('.image-lightbox-backdrop').click();
    expect(isImageLightboxOpen()).toBe(false);
    expect(document.body.classList.contains('image-lightbox-open')).toBe(false);
  });

  it('Escape schließt', () => {
    openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
    document.body.dispatchEvent(taste('Escape'));
    expect(isImageLightboxOpen()).toBe(false);
  });

  it('die Schließen-Schaltfläche schließt', () => {
    openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
    knopfSchliessen().click();
    expect(isImageLightboxOpen()).toBe(false);
  });

  it('ein Klick auf das Bild selbst schließt nicht', () => {
    openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
    flaeche().querySelector('.image-lightbox-image').click();
    expect(isImageLightboxOpen()).toBe(true);
  });
});

describe('Bild-Vergrößerung: Schaltfläche ins Standardprogramm (E16)', () => {
  it('ruft den Weg ins Standardprogramm und lässt die Fläche offen', async () => {
    const gerufen = [];
    openImageLightbox(bild({ quelle: 'a.png' }), {
      onOpenExternal: async () => {
        gerufen.push('ok');
        return true;
      },
    });
    knopfStandard().click();
    await Promise.resolve();
    expect(gerufen).toEqual(['ok']);
    expect(isImageLightboxOpen()).toBe(true);
  });

  it('bleibt auch offen, wenn das Öffnen misslingt', async () => {
    let gerufen = 0;
    openImageLightbox(bild({ quelle: 'a.png' }), {
      onOpenExternal: async () => {
        gerufen += 1;
        return false;
      },
    });
    knopfStandard().click();
    await Promise.resolve();
    expect(gerufen).toBe(1);
    expect(isImageLightboxOpen()).toBe(true);
  });
});

describe('Bild-Vergrößerung: Tastatur und Fokus (E12)', () => {
  it('der Fokus liegt nach dem Öffnen auf «Schließen» und kehrt beim Schließen zurück', () => {
    const vorher = document.createElement('button');
    document.body.appendChild(vorher);
    vorher.focus();
    openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
    expect(document.activeElement).toBe(knopfSchliessen());
    document.body.dispatchEvent(taste('Escape'));
    expect(document.activeElement).toBe(vorher);
  });

  it('der Tabulator wechselt zwischen den beiden Schaltflächen und bleibt in der Fläche', () => {
    openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
    const tab = taste('Tab');
    knopfSchliessen().dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(knopfStandard());
    knopfStandard().dispatchEvent(taste('Tab'));
    expect(document.activeElement).toBe(knopfSchliessen());
    knopfSchliessen().dispatchEvent(taste('Tab', { shiftKey: true }));
    expect(document.activeElement).toBe(knopfStandard());
  });

  it('ohne Schaltfläche ins Standardprogramm bleibt der Tabulator auf «Schließen»', () => {
    openImageLightbox(bild(), { onOpenExternal: null });
    knopfSchliessen().dispatchEvent(taste('Tab'));
    expect(document.activeElement).toBe(knopfSchliessen());
  });

  it('Tastendrücke erreichen das Fenster darunter nicht, solange die Fläche offen ist (AK3)', () => {
    const beimFenster = [];
    const zuhoerer = (e) => beimFenster.push(e.key);
    window.addEventListener('keydown', zuhoerer);
    try {
      openImageLightbox(bild({ quelle: 'a.png' }), { onOpenExternal: async () => true });
      document.body.dispatchEvent(taste('s', { ctrlKey: true }));
      document.body.dispatchEvent(taste('Escape'));
      // Nach dem Schließen läuft die Taste wieder durch.
      document.body.dispatchEvent(taste('s', { ctrlKey: true }));
    } finally {
      window.removeEventListener('keydown', zuhoerer);
    }
    expect(beimFenster).toEqual(['s']);
  });
});

// 4T-001925 (Epic 3E-000322): Doppelklick auf ein Bild der Live-Ansicht und die
// Bezugs-Datei eines Bildes in einer eingebetteten Notiz. Die Wirkung an der
// laufenden Anwendung weist test/e2e/regression/4t-001925-bild-doppelklick-live.spec.js
// nach; hier stehen die beiden Entscheidungs-Regeln.
describe('Live-Ansicht: welche Ereignisse die Bild-Elemente durchlassen (4T-001925)', () => {
  const ereignis = (type, target) => ({ type, target });

  it('der Doppelklick auf ein Bild geht an den Editor', () => {
    const img = document.createElement('img');
    expect(bildDoppelklickDurchlassen(ereignis('dblclick', img))).toBe(true);
  });

  it('der Doppelklick neben dem Bild bleibt ignoriert', () => {
    const span = document.createElement('span');
    expect(bildDoppelklickDurchlassen(ereignis('dblclick', span))).toBe(false);
  });

  it('Mausdruck, Klick und Auswahl am Bild bleiben ignoriert (Schreibmarke unverändert)', () => {
    const img = document.createElement('img');
    for (const type of ['mousedown', 'click', 'mouseup', 'selectionchange']) {
      expect(bildDoppelklickDurchlassen(ereignis(type, img))).toBe(false);
    }
  });

  it('ohne Ereignis: nichts durchlassen', () => {
    expect(bildDoppelklickDurchlassen(undefined)).toBe(false);
  });
});

describe('Bezugs-Datei eines Bildes (4T-001925, Nebenbefund)', () => {
  afterEach(() => {
    for (const d of document.querySelectorAll('body > div')) d.remove();
  });

  function koerper(basis) {
    const div = document.createElement('div');
    div.className = 'wiki-embed-md-body';
    if (basis !== undefined) div.setAttribute('data-embed-base', basis);
    return div;
  }

  it('ein Bild im offenen Dokument hat keine eigene Bezugs-Datei', () => {
    expect(imageSourceBase(bild({ quelle: 'bilder/a.png' }))).toBe('');
  });

  it('ein Bild in einer eingebetteten Notiz bezieht sich auf deren Datei', () => {
    const k = koerper('C:/ablage/notizen/Notiz.md');
    document.body.appendChild(k);
    const img = document.createElement('img');
    k.appendChild(img);
    expect(imageSourceBase(img)).toBe('C:/ablage/notizen/Notiz.md');
  });

  it('bei verschachtelten Einbettungen gilt die innerste', () => {
    const aussen = koerper('C:/ablage/A.md');
    const innen = koerper('C:/ablage/unter/B.md');
    aussen.appendChild(innen);
    document.body.appendChild(aussen);
    const img = document.createElement('img');
    innen.appendChild(img);
    expect(imageSourceBase(img)).toBe('C:/ablage/unter/B.md');
  });

  it('ohne Element: leer', () => {
    expect(imageSourceBase(null)).toBe('');
  });
});
