// Beispiel-Erweiterung „Notiz-Merker" (4T-0826, Epic 3E-0103):
// UI-Einstiegspunkt.
//
// ES-Modul; die Anwendung laedt es und ruft activate(ctx) mit der
// API-Fassade. Die Erweiterung nutzt ausschliesslich die dokumentierte
// API v1.1 — keine Modul-Importe aus der Anwendung, keine Selektoren auf
// deren Oberflaeche. Der einzige Beruehrungspunkt mit dem Dokument ist
// ctx.getRenderRoot(), und darin wird nur nach der eigenen Marken-Klasse
// gesucht, die der Render-Beitrag in markdown.js erzeugt hat.
//
// Zusammenspiel der Teile:
//   markdown.js  macht aus >>Text<< eine Marke im gerenderten Dokument
//   Panel        sammelt die Marken der eigenen Spalte und springt hin
//   Kommando     springt zyklisch von Marke zu Marke
//   Einstellungen  Farbe der Marke und Sortierung der Liste
//   Speicher     Notiztext, Farbe, Sortierung
//   Theme        Farbe kommt aus einer Theme-Variablen, mit Rueckfall

const MARKEN_KLASSE = 'ext-notiz-merker-marke';
const AKTIV_KLASSE = 'ext-notiz-merker-aktiv';
const STYLE_ID = 'ext-notiz-merker-style';

// Drei Vorgaben. Der Wert ist der NAME einer Theme-Variablen plus ein
// Rueckfall: Variablen-Namen sind keine zugesagte Schnittstelle, deshalb
// gehoert zu jedem Lesezugriff ein Wert, der auch ohne sie traegt.
const FARBEN = {
  akzent: { variable: '--accent', rueckfall: '#3b82f6' },
  dezent: { variable: '--bg-muted', rueckfall: '#94a3b8' },
  warnung: { variable: '--linter-warn', rueckfall: '#f59e0b' },
};
const FARBE_STANDARD = 'akzent';

let context = null;
let styleEl = null;
// Je Spalte ein Panel-Zustand; der Index ist die Spalten-Nummer, die
// render() und onRenderUpdated() liefern.
const panels = new Map();
const sprungZeiger = new Map();
let einstellungen = { farbe: FARBE_STANDARD, alphabetisch: false };

// --- Marken finden ---------------------------------------------------------

// Alle Marken einer Spalte, in Dokument-Reihenfolge. Leer, solange die
// Spalte keine gerenderte Ansicht zeigt (Quelltext- oder Live-Ansicht) —
// getRenderRoot liefert dann null, und das ist kein Fehlerfall.
function markenIn(paneIdx) {
  const root = context.getRenderRoot(paneIdx);
  if (!root) return [];
  return [...root.querySelectorAll('.' + MARKEN_KLASSE)];
}

function textVon(el) {
  return el.getAttribute('data-merker') || el.textContent || '';
}

// --- Darstellung -----------------------------------------------------------

function farbwert() {
  const gewaehlt = FARBEN[einstellungen.farbe] || FARBEN[FARBE_STANDARD];
  return context.getThemeVariable(gewaehlt.variable) || gewaehlt.rueckfall;
}

// Eigenes Style-Element statt Inline-Stilen an jeder Marke: Die Marken
// entstehen beim Rendern immer wieder neu, eine Regel gilt fuer alle.
function styleAktualisieren() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const farbe = farbwert();
  const dunkel = context.getTheme() === 'dark';
  styleEl.textContent = `
.${MARKEN_KLASSE} {
  border-bottom: 2px solid ${farbe};
  background: ${dunkel ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
  padding: 0 2px;
  border-radius: 2px;
}
.${MARKEN_KLASSE}.${AKTIV_KLASSE} {
  background: ${farbe};
  color: ${dunkel ? '#0b1220' : '#ffffff'};
}
.ext-notiz-merker-panel { display: flex; flex-direction: column; gap: 8px; }
.ext-notiz-merker-liste { list-style: none; margin: 0; padding: 0; }
.ext-notiz-merker-liste li { margin: 0; }
.ext-notiz-merker-eintrag {
  display: block; width: 100%; text-align: left; cursor: pointer;
  background: none; border: none; border-left: 3px solid ${farbe};
  padding: 2px 6px; font: inherit; color: inherit;
}
.ext-notiz-merker-eintrag:hover { background: rgba(127,127,127,0.15); }
.ext-notiz-merker-leer { opacity: 0.7; font-style: italic; }
.ext-notiz-merker-notiz { width: 100%; min-height: 70px; font: inherit; resize: vertical; }
`;
}

// Die angesprungene Marke bleibt hervorgehoben, bis eine andere an die
// Reihe kommt. Eine Hervorhebung, die nach kurzer Zeit von selbst
// verschwindet, waere hier die schlechtere Wahl: Beim Durchgehen mit dem
// Kuerzel soll sichtbar bleiben, wo man gerade steht.
function anspringen(el) {
  for (const andere of document.querySelectorAll('.' + AKTIV_KLASSE)) {
    andere.classList.remove(AKTIV_KLASSE);
  }
  el.classList.add(AKTIV_KLASSE);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// --- Panel -----------------------------------------------------------------

function listeZeichnen(paneIdx) {
  const panel = panels.get(paneIdx);
  if (!panel) return;
  const marken = markenIn(paneIdx);
  panel.liste.textContent = '';

  if (marken.length === 0) {
    panel.leer.hidden = false;
    return;
  }
  panel.leer.hidden = true;

  const eintraege = marken.map((el, position) => ({ el, position, text: textVon(el) }));
  if (einstellungen.alphabetisch) {
    eintraege.sort((a, b) => a.text.localeCompare(b.text, context.getLanguage()));
  }

  for (const eintrag of eintraege) {
    const li = document.createElement('li');
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'ext-notiz-merker-eintrag';
    knopf.textContent = eintrag.text;
    knopf.addEventListener('click', () => {
      sprungZeiger.set(paneIdx, eintrag.position);
      anspringen(eintrag.el);
    });
    li.appendChild(knopf);
    panel.liste.appendChild(li);
  }
}

function panelZeichnen(body, paneIdx) {
  const wurzel = document.createElement('div');
  wurzel.className = 'ext-notiz-merker-panel';

  const liste = document.createElement('ul');
  liste.className = 'ext-notiz-merker-liste';

  const leer = document.createElement('p');
  leer.className = 'ext-notiz-merker-leer';
  leer.setAttribute('data-i18n', 'ext.notiz-merker.panel.empty');
  leer.textContent = context.t('panel.empty');

  const notizTitel = document.createElement('label');
  notizTitel.setAttribute('for', `ext-notiz-merker-notiz-${paneIdx}`);
  notizTitel.textContent = context.t('panel.noteLabel');

  const notiz = document.createElement('textarea');
  notiz.className = 'ext-notiz-merker-notiz';
  notiz.id = `ext-notiz-merker-notiz-${paneIdx}`;
  notiz.addEventListener('input', () => {
    // Die Notiz gilt global, nicht je Dokument: Die API fuehrt keine
    // Dokument-Kennung. Deshalb ziehen alle Spalten mit.
    context.storage.set('notiz', notiz.value);
    for (const [anderePane, panel] of panels) {
      if (anderePane !== paneIdx) panel.notiz.value = notiz.value;
    }
  });

  wurzel.append(liste, leer, notizTitel, notiz);
  body.appendChild(wurzel);
  panels.set(paneIdx, { liste, leer, notiz });

  context.storage.get('notiz').then((wert) => {
    if (typeof wert === 'string') notiz.value = wert;
  });
  listeZeichnen(paneIdx);
}

// --- Kommando --------------------------------------------------------------

// Die erste Spalte, die gerade eine gerenderte Ansicht zeigt. Die API
// nennt keine „aktive" Spalte; fuer ein Beispiel ist die erste sichtbare
// die nachvollziehbare Wahl.
function ersteSpalteMitMarken() {
  for (const paneIdx of [...panels.keys()].sort((a, b) => a - b)) {
    if (markenIn(paneIdx).length > 0) return paneIdx;
  }
  return null;
}

function naechstenMerkerAnspringen() {
  const paneIdx = ersteSpalteMitMarken();
  if (paneIdx === null) return;
  const marken = markenIn(paneIdx);
  const vorher = sprungZeiger.has(paneIdx) ? sprungZeiger.get(paneIdx) : -1;
  const naechster = (vorher + 1) % marken.length;
  sprungZeiger.set(paneIdx, naechster);
  anspringen(marken[naechster]);
}

// --- Einstellungs-Bereich ---------------------------------------------------

function einstellungenZeichnen(container) {
  const farbZeile = document.createElement('p');
  const farbTitel = document.createElement('label');
  farbTitel.setAttribute('for', 'ext-notiz-merker-farbe');
  farbTitel.textContent = `${context.t('settings.colorLabel')}: `;
  const auswahl = document.createElement('select');
  auswahl.id = 'ext-notiz-merker-farbe';
  for (const schluessel of Object.keys(FARBEN)) {
    const option = document.createElement('option');
    option.value = schluessel;
    option.textContent = context.t(`settings.color.${schluessel}`);
    auswahl.appendChild(option);
  }
  auswahl.value = einstellungen.farbe;
  auswahl.addEventListener('change', () => {
    einstellungen.farbe = auswahl.value;
    context.storage.set('farbe', auswahl.value);
    styleAktualisieren();
  });
  farbZeile.append(farbTitel, auswahl);

  const sortZeile = document.createElement('p');
  const schalter = document.createElement('input');
  schalter.type = 'checkbox';
  schalter.id = 'ext-notiz-merker-sortierung';
  schalter.checked = einstellungen.alphabetisch;
  schalter.addEventListener('change', () => {
    einstellungen.alphabetisch = schalter.checked;
    context.storage.set('alphabetisch', schalter.checked);
    for (const paneIdx of panels.keys()) listeZeichnen(paneIdx);
  });
  const sortTitel = document.createElement('label');
  sortTitel.setAttribute('for', 'ext-notiz-merker-sortierung');
  sortTitel.textContent = ` ${context.t('settings.sortLabel')}`;
  sortZeile.append(schalter, sortTitel);

  container.append(farbZeile, sortZeile);
}

// --- Lebenszyklus -----------------------------------------------------------

export default {
  async activate(ctx) {
    context = ctx;

    // Deutsch und Englisch, Standard-Sprache Englisch. Laeuft die
    // Anwendung auf Franzoesisch, Spanisch oder Italienisch, greift
    // sichtbar der Rueckfall auf Englisch — genau dieses Verhalten soll
    // das Beispiel zeigen.
    ctx.addTranslations(
      {
        de: {
          'panel.title': 'Notiz-Merker',
          'panel.empty': 'Keine Merker in diesem Dokument. Schreibe >>Text<< im Dokument.',
          'panel.noteLabel': 'Notiz',
          'command.next': 'Notiz-Merker: nächsten Merker anspringen',
          'settings.title': 'Notiz-Merker',
          'settings.colorLabel': 'Farbe der Marke',
          'settings.color.akzent': 'Akzent',
          'settings.color.dezent': 'Dezent',
          'settings.color.warnung': 'Auffällig',
          'settings.sortLabel': 'Liste alphabetisch statt in Dokument-Reihenfolge',
        },
        en: {
          'panel.title': 'Note markers',
          'panel.empty': 'No markers in this document. Write >>text<< in the document.',
          'panel.noteLabel': 'Note',
          'command.next': 'Note markers: jump to next marker',
          'settings.title': 'Note markers',
          'settings.colorLabel': 'Marker colour',
          'settings.color.akzent': 'Accent',
          'settings.color.dezent': 'Subtle',
          'settings.color.warnung': 'Prominent',
          'settings.sortLabel': 'Sort list alphabetically instead of document order',
        },
      },
      'en',
    );

    // Gespeicherte Werte VOR dem ersten Zeichnen holen, sonst blitzt die
    // Voreinstellung kurz auf.
    const farbe = await ctx.storage.get('farbe');
    const alphabetisch = await ctx.storage.get('alphabetisch');
    einstellungen = {
      farbe: typeof farbe === 'string' && FARBEN[farbe] ? farbe : FARBE_STANDARD,
      alphabetisch: alphabetisch === true,
    };
    styleAktualisieren();

    ctx.registerSidebarPanel({
      id: 'merker',
      titleKey: 'panel.title',
      render(body, paneIdx) {
        panelZeichnen(body, paneIdx);
      },
    });

    ctx.registerCommand({
      id: 'naechster',
      titleKey: 'command.next',
      defaultBinding: 'CmdOrCtrl+Alt+M',
      run: naechstenMerkerAnspringen,
    });

    ctx.registerSettingsSection({
      id: 'einstellungen',
      titleKey: 'settings.title',
      render: einstellungenZeichnen,
    });

    // Der Andockpunkt der API v1.1: Er meldet sich nach jedem Neuaufbau
    // der gerenderten Ansicht UND beim Wechsel der Ansicht. Ohne ihn
    // bliebe die Liste auf dem Stand des ersten Zeichnens stehen.
    ctx.onRenderUpdated((paneIdx) => {
      sprungZeiger.delete(paneIdx);
      listeZeichnen(paneIdx);
    });
  },

  deactivate() {
    // Registrierte Beitraege nimmt die Anwendung selbst zurueck; eigenes
    // Aufraeumen betrifft alles daneben — hier das Style-Element und den
    // Zustand.
    if (styleEl) styleEl.remove();
    styleEl = null;
    panels.clear();
    sprungZeiger.clear();
    context = null;
  },
};
