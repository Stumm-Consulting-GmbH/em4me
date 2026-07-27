// 4T-0761 (Epic 3E-0142): Einstellungen als Lieferant durchsuchbarer Texte.
//
// Die Suche findet in den Einstellungen heute nichts: Die Seite montiert ihr
// Formular in den System-Container der Pane, während die Dokument-Suche im
// gerenderten Markup sucht. Erschwerend baut ein Bereich sein DOM erst beim
// Aktivieren, ein nie besuchter Bereich existiert also gar nicht.
//
// Genau das ist aber der Anlass des Epics: Wer den Namen einer Einstellung
// kennt, sucht ihren BEREICH. Die Ernte selbst liegt in settings-page.js
// (dort sind Bereichs-Registry und Entwurf zu Hause); dieses Modul bringt
// sie in das Format des Suchraum-Kerns, hält den Vorrat und führt den
// Sprung aus.
'use strict';

import { erntbareBereiche, springeZuBereich } from './settings-page.js';
import { state } from './app-state.js';
import { registriereLieferant } from './such-lauf.js';
import { registriereSprungWeg } from './such-sprung.js';

// { sprache, bereichOffen, eintraege } oder null. Der Vorrat hängt an der
// Sprache (Beschriftungen) und daran, ob ein Bereich geöffnet ist (die
// bereichsgebundenen Sektionen erscheinen nur dann).
let vorrat = null;

export function verwirfEinstellungsVorrat() {
  vorrat = null;
}

function vorratsSchluessel() {
  return { sprache: state.language || 'en', bereichOffen: !!state.areaPath };
}

export function einstellungsEintraege() {
  const schluessel = vorratsSchluessel();
  if (
    vorrat &&
    vorrat.sprache === schluessel.sprache &&
    vorrat.bereichOffen === schluessel.bereichOffen
  ) {
    return vorrat.eintraege;
  }

  const eintraege = erntbareBereiche().map((bereich) => ({
    gruppe: bereich.id,
    titel: bereich.titel,
    quelle: 'settings',
    // Zeile 0 ist der Bereichs-Titel, danach die erfassten Zeilen. Die
    // Zeilen-Nummer des Treffers ist damit unmittelbar die Sprung-Adresse
    // und braucht keine zusätzliche Kennung je Feld.
    text: [bereich.titel, ...bereich.zeilen].join('\n'),
  }));

  vorrat = { ...schluessel, eintraege };
  return eintraege;
}

// Bereichsgebundene Bereiche sind ohne geöffneten Bereich nicht erreichbar
// (die Navigations-Gruppe fehlt dann). Sie fallen deshalb schon bei der
// Ernte weg, statt in der Liste als toter Sprung zu erscheinen: Die Ernte
// nutzt settingsSections(), das ohne Bereich nur die allgemeinen Sektionen
// rendern kann — die übrigen liefern keine Zeilen und bleiben über ihren
// Titel auffindbar.
async function springeZuEinstellung(treffer) {
  const zeile = treffer && treffer.sprung ? treffer.sprung.zeile : 0;
  springeZuBereich(treffer.gruppe, zeile);
}

registriereLieferant('settings', () => einstellungsEintraege());
registriereSprungWeg('settings', springeZuEinstellung);

// Sprachwechsel und Erweiterungs-Schaltungen ändern Beschriftungen bzw. den
// Bestand der Bereiche; der Vorrat verfällt dann. Beide Ereignisse liegen
// bereits als Dokument-Ereignisse vor, ein eigener Kanal entfällt.
document.addEventListener('scg:extensions-changed', verwirfEinstellungsVorrat);
