// Feld-Formular des Dokuments: die Herkunft eines Feldes und der Ausklapp-
// Bereich mit den Feldern, die die Profile definieren und das Dokument noch
// nicht trägt.
//
// 4T-001172 (Epic 3E-000220, E5): Das Eigenschaften-Panel zeigte bisher allein den
// Ist-Zustand — die Schlüssel des Metadaten-Blocks. Ein Feld, das ein
// zugeordnetes Profil definiert und das Dokument noch nicht ausgefüllt hat,
// erschien nirgends, und die Herkunft der sichtbaren Felder gar nicht. Beides
// zusammen ergibt erst die Frage, um die es geht: was trägt dieses Dokument,
// und warum.
//
// **Warum die fehlenden Felder unten stehen und die vorhandenen oben bleiben:**
// Die Story verlangt alle Felder auf einmal, nicht zwei Listen derselben
// Felder. Die Vereinigung wird deshalb aufgeteilt, nicht verdoppelt — oben,
// was im Dokument steht (unverändert wie bisher, nur um die Herkunft
// ergänzt), darunter im Ausklapp-Bereich, was gilt, aber noch fehlt. Eine
// zweite vollständige Liste hätte jedes vorhandene Feld zweimal gezeigt.
//
// **Kein zweiter Schreibweg** (Auflage des Epics): Die Feld-Elemente dieses
// Bereichs entstehen über dieselbe Bau-Funktion wie die übrigen und hängen im
// selben Container. Damit sammelt sie der vorhandene Save-Weg von selbst ein;
// es gibt hier keine Schreib-Logik. Die eine Ausnahme ist die Markierung
// `is-nicht-im-dokument`: Sie hält ein Feld, das noch leer ist, aus dem
// Metadaten-Block heraus, damit das bloße Aufklappen nicht das ganze Profil
// in das Dokument schreibt. Sobald ein Wert darin steht, greift der gewohnte
// Weg ohne Zutun.
//
// Stellung im Ordner: Blatt. Nur i18n; alles Übrige — die Bau-Funktion einer
// Feld-Zeile, der Sitzungs-Zustand — kommt als Parameter herein. Der
// Ordner-Import-Wächter friert die Bestands-Komponente der Renderer-Seite mit
// Ratsche ein; ein Modul mit ausgehender Kante dorthin dürfte gar nicht
// entstehen (Begründung ausführlich in properties-typ-werte.js).
'use strict';

import { t } from '../../i18n.js';

// Rückfall-Zeichen, wenn das Herkunfts-Profil kein eigenes Symbol führt. Ein
// Symbol steht immer, weil die Herkunfts-Angabe sonst je nach Profil da wäre
// oder nicht — und ein Feld ohne Zeichen läse sich wie ein Feld ohne Profil.
const HERKUNFT_RUECKFALL = '◆';

// Markierung eines Feldes, das ein Profil definiert und das Dokument noch
// nicht trägt. Sie steht hier und nicht als Zeichenkette im Schreibweg, damit
// Setzen und Auswerten dieselbe Quelle haben.
export const MARKE_NICHT_IM_DOKUMENT = 'is-nicht-im-dokument';

// 4T-001179 (Epic 3E-000220): Ist dieses Angebot unberührt, hat der Anwender also
// nichts eingetragen?
//
// Gemessen wird am **Bedienelement**, nicht am typisierten Wert. Der Grund ist
// ein belegter Fehler: `extractFieldValue` liefert für ein leeres Zahlenfeld
// `0` und für eine nicht angehakte Auswahl `false`, und beides hält
// `isEmptyPropertyValue` zu Recht nicht für leer — es sind gültige Werte.
// Damit galt jedes numerische und jedes boolesche Angebot als Feld des
// Dokuments: Es wurde ungefragt geschrieben (`budget: 0` in einem Dokument,
// in dem der Anwender ein ganz anderes Feld angelegt hatte) und löste
// zusätzlich die Duplikat-Sperre aus, sobald er dasselbe Feld über das
// Vorschlags-Menü anlegte. Am Bedienelement ist «nichts eingetragen»
// eindeutig, am Wert ist es das nicht.
//
// Gemessen wird die **Berührung** und nicht der angezeigte Wert. Der
// angezeigte Wert taugt nicht: `emptyValueForType` belegt ein Zahlen-Angebot
// mit `0` und ein Ja/Nein-Angebot mit `false` vor, und damit ist «vorbelegt»
// von «eingetippt» nicht zu unterscheiden — die bewusst eingetragene Null
// wäre sonst genauso unsichtbar wie die vorbelegte. Der Bau markiert deshalb
// jedes Angebot, und die erste Eingabe daran nimmt die Markierung weg
// (`markiereAngebot`).
//
// Mehrfach-Felder bauen ihr DOM um, statt ein Eingabe-Ereignis am Feld
// auszulösen; dort zählt zusätzlich der sichtbare Bestand.
const MARKE_UNBERUEHRT = 'angebotUnberuehrt';

function istAngebotUnberuehrt(fieldEl) {
  if (fieldEl.dataset[MARKE_UNBERUEHRT] !== '1') return false;
  const chipListe = fieldEl.querySelector('.properties-field-multistring');
  if (chipListe) {
    return chipListe.querySelectorAll('.properties-field-multistring-pill').length === 0;
  }
  return true;
}

// Ein Angebot als unberührt kennzeichnen und die Kennzeichnung bei der ersten
// Eingabe daran wieder aufheben. `input` und `change` decken Textfelder,
// Zahlenfelder, Auswahl-Listen und Ja/Nein-Felder gleichermaßen ab, weil
// beide Ereignisse aus dem Bedienelement heraus aufsteigen.
export function markiereAngebot(fieldEl) {
  if (!fieldEl) return;
  fieldEl.dataset[MARKE_UNBERUEHRT] = '1';
  const beruehrt = () => {
    delete fieldEl.dataset[MARKE_UNBERUEHRT];
  };
  fieldEl.addEventListener('input', beruehrt);
  fieldEl.addEventListener('change', beruehrt);
}

// 4T-001172 (AK5): Bleibt dieses Feld beim Speichern draußen?
//
// Die Regel gehört zur Fachlichkeit des Formulars und nicht zum Schreibweg:
// Ein nur definiertes Feld ist ein Angebot, kein Inhalt. Erst ein Wert macht
// es zum Feld des Dokuments — dann nimmt es denselben Weg wie jedes andere.
// Ohne diese Regel schriebe das bloße Aufklappen des Bereichs sämtliche
// Profil-Felder in den Metadaten-Block.
//
// 4T-001179: Die Entscheidung liegt jetzt bei `istAngebotUnberuehrt`; der
// frühere Weg über den typisierten Wert trug den Fehler, den die Begründung
// dort beschreibt.
export function bleibtAusDemDokument(fieldEl) {
  if (!fieldEl || !fieldEl.classList.contains(MARKE_NICHT_IM_DOKUMENT)) return false;
  return istAngebotUnberuehrt(fieldEl);
}

// Der Ketten-Eintrag zum Profil-Namen eines Feldes. Case-insensitiv wie jeder
// Profil-Vergleich der Auflösung.
function kettenEintrag(chain, profilName) {
  const gesucht = String(profilName == null ? '' : profilName)
    .trim()
    .toLowerCase();
  if (gesucht === '') return null;
  const liste = Array.isArray(chain) ? chain : [];
  return liste.find((e) => String(e.profile || '').toLowerCase() === gesucht) || null;
}

// 4T-001172 (AK3): Herkunfts-Zeichen eines definierten Feldes — Symbol des
// Profils mit dem vollständigen Satz im Tooltip.
//
// Kompakt und nicht als eigene Spalte: Die Sektion ist eine Sidebar-Spalte,
// in der Name, Typ, Hinweis und Löschen bereits nebeneinander liegen. Die
// Auflage aus dem Task lautet deshalb, die Herkunft an das Feld zu hängen und
// den Satz in den Tooltip zu legen.
export function baueHerkunftsZeichen(def, chain) {
  if (!def || !def.profile) return null;
  const eintrag = kettenEintrag(chain, def.profile);
  const el = document.createElement('span');
  el.className = 'properties-field-origin';
  el.textContent = (eintrag && eintrag.icon) || HERKUNFT_RUECKFALL;
  const weg = t('properties.profileVia.' + (def.stufe || 'assigned'));
  const tiefe = Number(def.tiefe) || 0;
  if (tiefe > 0) {
    el.classList.add('is-inherited');
    el.title = t('properties.fieldOriginInherited')
      .replace('{profile}', def.profile)
      .replace('{level}', String(tiefe))
      .replace('{via}', weg);
  } else {
    el.title = t('properties.fieldOrigin').replace('{profile}', def.profile).replace('{via}', weg);
  }
  el.dataset.stufe = def.stufe || 'assigned';
  el.dataset.tiefe = String(tiefe);
  return el;
}

// 4T-001172 (AK6, AK7 und AK9): Bekommt dieses Dokument überhaupt einen
// Formular-Bereich?
//
// Drei Nein-Fälle, und keiner davon ist ein Sonderfall:
//
// - **Kein Profil** (AK6): leere Kette — es gäbe nichts zu zeigen, und ein
//   Bereich mit einem Erklär-Satz wäre genau der leere Bereich, den AK6
//   ausschließt.
// - **Erweiterung aus** (AK9): Die Auflösung ist dann `null`, weil
//   `refreshProfileResolution` hinter dem Gate steht. Dieselbe Bedingung
//   trägt beide Fälle.
// - **Defektes Frontmatter** (AK7): Der Metadaten-Block ist unlesbar, also
//   ist `data` leer — das Formular hielte **jedes** Profil-Feld für fehlend
//   und böte an, den ganzen Satz in ein Dokument zu schreiben, dessen Block
//   sich nicht parsen lässt. Die vorhandene Sektion zeigt in diesem Fall den
//   Hinweis und sperrt „Feld hinzufügen"; das Formular verhält sich ebenso.
export function zeigtFeldFormular(aufloesung, { parseError = false } = {}) {
  if (parseError) return false;
  return !!(aufloesung && Array.isArray(aufloesung.chain) && aufloesung.chain.length > 0);
}

// 4T-001172 (AK1/AK4): Die Definitionen, die das Dokument noch nicht trägt — in
// der Reihenfolge der Auflösung, damit sie der Profil-Ordnung folgen und
// nicht der Zufalls-Ordnung des Metadaten-Blocks.
export function fehlendeDefinitionen(fields, data) {
  const vorhanden = new Set(Object.keys(data || {}).map((k) => k.toLowerCase()));
  return (Array.isArray(fields) ? fields : []).filter(
    (def) => def && def.name && !vorhanden.has(String(def.name).toLowerCase()),
  );
}

// 4T-001173 (AK2): Die fehlenden Felder EINER Ketten-Ebene.
//
// Eine Ebene ist ein Profil der Kette, und ihre Felder sind die, die aus
// diesem Profil stammen — die Auflösung hat sie seit 4T-001171 mit `profile`
// beschriftet. Gefiltert wird also nicht neu aufgelöst, sondern aus dem
// vorliegenden Ergebnis ausgewählt.
export function fehlendeDefinitionenDerEbene(fields, data, profilName) {
  const gesucht = String(profilName == null ? '' : profilName)
    .trim()
    .toLowerCase();
  if (gesucht === '') return [];
  return fehlendeDefinitionen(fields, data).filter(
    (def) => String(def.profile || '').toLowerCase() === gesucht,
  );
}

// 4T-001172 (AK1/AK4/AK6): Der Ausklapp-Bereich unter den vorhandenen Feldern.
//
// `baueFeld(def)` liefert die fertige Feld-Zeile — hereingereicht, weil sie in
// properties-fields.js liegt und dieses Modul ein Blatt bleiben soll.
// Rückgabe ist das Bereichs-Element, damit der Aufrufer es öffnen kann (das
// Kommando aus 4T-001174 tut genau das).
// **Kein Aufruf ohne Profil** (AK6 und AK9): Gilt für das Dokument kein
// Profil — sei es, weil keines zugeordnet ist, sei es, weil die Erweiterung
// aus ist —, entsteht der Bereich gar nicht erst. Die Prüfung liegt beim
// Aufrufer und nicht hier, weil sonst ein Bereich mit einem Erklär-Satz
// entstünde: genau der leere Bereich, den AK6 ausschließt.
// 4T-001173 (AK1 bis AK4): Die Kette der beteiligten Profile, je Ebene mit der
// Übernahme ihrer fehlenden Felder.
//
// `fehlendeJeEbene(profilName)` sagt, was auf dieser Ebene fehlt;
// `uebernehmen(profilName)` führt die Übernahme aus. Beide kommen von außen
// herein — die Übernahme läuft über denselben Weg wie die vorhandene
// Komplett-Übernahme, und dieses Modul bleibt ein Blatt.
export function baueKette(kette, { fehlendeJeEbene, uebernehmen }) {
  const wrap = document.createElement('div');
  wrap.className = 'properties-chain';

  const titel = document.createElement('div');
  titel.className = 'properties-chain-title';
  titel.textContent = t('properties.chainTitle');
  wrap.appendChild(titel);

  for (const eintrag of kette) {
    const zeile = document.createElement('div');
    zeile.className = 'properties-chain-level';
    const tiefe = Number(eintrag.tiefe) || 0;
    zeile.dataset.profil = eintrag.profile;
    zeile.dataset.tiefe = String(tiefe);
    // Die Vererbungs-Tiefe wird als Einrückung sichtbar: Eine Kette liest sich
    // dann als das, was sie ist, ohne dass eine Zahl dafür Platz braucht.
    if (tiefe > 0) zeile.classList.add('is-inherited');
    zeile.style.paddingLeft = `${tiefe * 10}px`;

    const zeichen = document.createElement('span');
    zeichen.className = 'properties-chain-icon';
    zeichen.textContent = eintrag.icon || HERKUNFT_RUECKFALL;
    zeile.appendChild(zeichen);

    const name = document.createElement('span');
    name.className = 'properties-chain-name';
    name.textContent = eintrag.profile;
    zeile.appendChild(name);

    const weg = document.createElement('span');
    weg.className = 'properties-chain-via';
    // Ein geerbtes Profil gilt über denselben Weg wie sein Kind; dort ist
    // «geerbt» die Aussage, die den Anwender weiterbringt, nicht der Weg.
    weg.textContent =
      tiefe > 0
        ? t('properties.chainInherited')
        : t('properties.profileVia.' + (eintrag.stufe || 'assigned'));
    zeile.appendChild(weg);

    // AK4: Eine Ebene ohne fehlende Felder bietet keine Übernahme an.
    const fehlend = typeof fehlendeJeEbene === 'function' ? fehlendeJeEbene(eintrag.profile) : [];
    if (fehlend && fehlend.length > 0) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'properties-chain-fill';
      knopf.textContent = '+';
      knopf.title = t('properties.chainFill');
      knopf.dataset.anzahl = String(fehlend.length);
      knopf.addEventListener('click', () => {
        if (typeof uebernehmen === 'function') uebernehmen(eintrag.profile);
      });
      zeile.appendChild(knopf);
    }

    wrap.appendChild(zeile);
  }

  return wrap;
}

export function baueFeldFormular(
  container,
  { fehlende, kette, baueFeld, fehlendeJeEbene, uebernehmen, offen = false, merkeZustand },
) {
  const details = document.createElement('details');
  details.className = 'properties-all-fields';
  // 4T-001173: Der Bereich wird bei jedem Render neu gebaut. Ohne den
  // hereingereichten Zustand klappte er dabei jedes Mal zu — auch mitten in
  // einer Eingabe, weil der Debounce-Save ein Render ausloest.
  details.open = !!offen;
  details.addEventListener('toggle', () => {
    if (typeof merkeZustand === 'function') merkeZustand(details.open);
  });

  const summary = document.createElement('summary');
  summary.className = 'properties-all-fields-summary';
  summary.textContent = t('properties.allFieldsTitle');
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'properties-all-fields-body';
  details.appendChild(body);

  // 4T-001173 (AK1): Die Kette steht ÜBER den fehlenden Feldern, weil sie die
  // Frage beantwortet, aus der die Felder folgen: welche Profile gelten hier
  // eigentlich, und warum.
  if (Array.isArray(kette) && kette.length > 0) {
    body.appendChild(baueKette(kette, { fehlendeJeEbene, uebernehmen }));
  }

  // Profile gelten, aber es fehlt nichts: Das ist eine Aussage und kein
  // leerer Bereich — der Anwender sieht, dass sein Dokument vollständig ist.
  if (!fehlende || fehlende.length === 0) {
    const hinweis = document.createElement('div');
    hinweis.className = 'properties-all-fields-hint';
    hinweis.textContent = t('properties.allFieldsComplete');
    body.appendChild(hinweis);
    container.appendChild(details);
    return details;
  }

  const gruppe = document.createElement('div');
  gruppe.className = 'properties-all-fields-group';
  gruppe.textContent = t('properties.allFieldsMissing');
  body.appendChild(gruppe);

  for (const def of fehlende) {
    const feldEl = baueFeld(def);
    if (!feldEl) continue;
    // Die Markierung hält das leere Feld aus dem Metadaten-Block heraus,
    // solange niemand einen Wert einträgt (Begründung im Kopf dieser Datei).
    feldEl.classList.add(MARKE_NICHT_IM_DOKUMENT);
    // 4T-001179: und die zweite Markierung hält fest, dass noch niemand etwas
    // eingetragen hat — am vorbelegten Wert allein wäre das nicht erkennbar.
    markiereAngebot(feldEl);
    body.appendChild(feldEl);
  }

  container.appendChild(details);
  return details;
}
