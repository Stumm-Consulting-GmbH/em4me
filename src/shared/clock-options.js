// 4T-0372 (Epic 3E-0069): Optionen-Modell und Rechen-Kern der Uhr-Erweiterung.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein DOM, kein
// Electron) und damit unit-testbar ohne jsdom — Muster src/shared/
// panel-access.js. Das Panel (clock-panel.js) zeichnet nur noch, was hier
// gerechnet wird; der Einstellungs-Bereich (clock-settings.js) normalisiert
// ueber dieselbe Quelle.
//
// Bewusst OHNE Abhaengigkeit zu den Markdown-Modulen: die vorhandenen
// Datums-Helfer (formatDateMs/isoWeekOf in perspective-query-eval.js)
// haengen transitiv an shared/markdown/link-scan.js, das im Preload-Kontext
// lebt und im Renderer-Bundle nichts zu suchen hat. Die ISO-Kalenderwoche
// steht deshalb als geschlossene Kurz-Funktion hier (isoWeekNumber) statt
// als Import. Einzige Ausnahme seit 4T-0636/4T-0637: das ebenso
// prozessneutrale und abhaengigkeitsfreie Wecker-Modul liefert die
// Klemmung der Schlummer-Dauer (eine Quelle statt zweier Grenzwert-Paare).
'use strict';

const { normalizeSnoozeMinutes, DEFAULT_SNOOZE_MINUTES } = require('./clock-alarms.js');

// Store-Schluessel des Optionen-Objekts (electron-store nestet den Punkt-Pfad
// zu { clock: { options: {...} } }). Die Panel-Sichtbarkeit haengt wie bei
// allen Panels an eigenen Keys (clockPanel.visibleColumn0/1).
const CLOCK_OPTIONS_KEY = 'clock.options';

// 4T-0636 (Epic 3E-0069): Anzeige-Modus des Panels. Bedien- und nicht
// Konfigurations-Zustand, deshalb bewusst NEBEN dem Optionen-Objekt und
// pro Sidebar-Spalte persistiert (PO-Festlegung 2026-07-20) — Muster der
// Sichtbarkeits-Keys clockPanel.visibleColumn0/1.
const CLOCK_MODES = ['clock', 'alarm', 'timer', 'stopwatch'];
const CLOCK_MODE_KEYS = ['clockPanel.modeColumn0', 'clockPanel.modeColumn1'];

// Erlaubte Werte der Auswahl-Optionen; erste Position ist zugleich der
// Default und der Rueckfall bei defekten Store-Staenden.
const ANALOG_SIZES = ['medium', 'small', 'large'];
const DIAL_STYLES = ['quarters', 'numbers', 'ticks', 'plain'];
const SECOND_MOTIONS = ['step', 'sweep'];
const HOUR_FORMATS = [24, 12];
const DATE_FORMATS = ['long', 'medium', 'short', 'iso'];

// Pixel-Kantenlaenge der analogen Uhr je Groessen-Stufe. Das Panel klemmt
// zusaetzlich auf die verfuegbare Breite, damit eine schmale Sidebar die
// Uhr nicht abschneidet.
const ANALOG_SIZE_PX = { small: 88, medium: 128, large: 176 };

// 4T-0679 (Epic 3E-0139): Schrift-Faktor der digitalen Anzeige je Stufe.
// Die Stufe bemisst damit Zifferblatt UND Schrift; zuvor wirkte sie nur auf
// das Zifferblatt, waehrend die Textzeilen feste Pixelwerte trugen.
//
// Ein Faktor statt dreier Einzelwerte je Stufe: So bleiben die Verhaeltnisse
// zwischen Zeit, Datum und Kalenderwoche in jeder Stufe erhalten, und eine
// spaetere vierte Stufe kostet einen Wert statt drei Regeln. Die Basiswerte
// (17 / 12 / 11,5 px) stehen in styles.css, hier steht nur der Faktor.
//
// PO-Festlegung 2026-07-22: 'small' traegt das bisherige Schriftbild
// (Faktor 1), 'medium' und 'large' kommen darueber. Weil der Default der
// Einstellung 'medium' ist, bekommt ein Bestandsnutzer bewusst eine
// groessere Uhr als zuvor. 'large' ist fuer die breit gezogene Sidebar
// gedacht und richtet sich ausdruecklich NICHT nach der Mindestbreite von
// 180 px; dort wird die Anzeige beidseitig beschnitten (styles.css).
const CLOCK_SCALE = { small: 1, medium: 1.4, large: 2.35 };

const DEFAULT_CLOCK_OPTIONS = {
  showAnalog: true,
  showDigital: true,
  showDate: true,
  showWeek: false,
  analogSize: 'medium',
  dial: 'quarters',
  secondHand: true,
  secondMotion: 'step',
  hourFormat: 24,
  showSeconds: true,
  dateFormat: 'long',
  // 4T-0637: Schlummer-Dauer des Weckers in Minuten. Konfiguration und
  // damit hier statt im Bedien-Zustand.
  snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
};

function pickBool(raw, fallback) {
  return typeof raw === 'boolean' ? raw : fallback;
}

function pickFrom(raw, allowed) {
  return allowed.includes(raw) ? raw : allowed[0];
}

// Bereinigt einen (auch defekten oder fehlenden) Store-Wert zu einem
// vollstaendigen Optionen-Objekt: unbekannte Auswahl-Werte und
// Nicht-Booleans fallen auf den Default zurueck, fremde Felder entfallen.
// Robust gegen kuenftige Zu- und Abgaenge von Optionen (Muster
// normalizeDisabledIds/normalizePanelToggleOrder).
function normalizeClockOptions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  // Zahl-Toleranz beim Stundenformat: aeltere bzw. per Hand editierte
  // Staende koennen '12'/'24' als String tragen.
  const hourRaw = typeof src.hourFormat === 'string' ? Number(src.hourFormat) : src.hourFormat;
  return {
    showAnalog: pickBool(src.showAnalog, DEFAULT_CLOCK_OPTIONS.showAnalog),
    showDigital: pickBool(src.showDigital, DEFAULT_CLOCK_OPTIONS.showDigital),
    showDate: pickBool(src.showDate, DEFAULT_CLOCK_OPTIONS.showDate),
    showWeek: pickBool(src.showWeek, DEFAULT_CLOCK_OPTIONS.showWeek),
    analogSize: pickFrom(src.analogSize, ANALOG_SIZES),
    dial: pickFrom(src.dial, DIAL_STYLES),
    secondHand: pickBool(src.secondHand, DEFAULT_CLOCK_OPTIONS.secondHand),
    secondMotion: pickFrom(src.secondMotion, SECOND_MOTIONS),
    hourFormat: pickFrom(hourRaw, HOUR_FORMATS),
    showSeconds: pickBool(src.showSeconds, DEFAULT_CLOCK_OPTIONS.showSeconds),
    dateFormat: pickFrom(src.dateFormat, DATE_FORMATS),
    snoozeMinutes: normalizeSnoozeMinutes(src.snoozeMinutes),
  };
}

// 4T-0636: Modus-Wert bereinigen. Unbekannte, fehlende oder defekte Staende
// fallen auf 'clock' zurueck (erste Position, wie bei den Auswahl-Optionen).
function normalizeClockMode(raw) {
  return pickFrom(raw, CLOCK_MODES);
}

// 4T-0636: Store-Schluessel des Modus einer Spalte. Ausserhalb des gueltigen
// Bereichs liefert die Funktion null, damit Aufrufer nicht versehentlich in
// einen erfundenen Key schreiben.
function clockModeKey(paneIdx) {
  return CLOCK_MODE_KEYS[paneIdx] ?? null;
}

// Timer-Disziplin: Sekunden-Takt nur, wenn ein sichtbares Element auch
// wirklich sekundengenau ist. Sonst genuegt der Minuten-Takt (Energie-
// Ruecksicht, Akzeptanzkriterium des Tasks).
function needsSecondTick(options) {
  const o = normalizeClockOptions(options);
  const analogSeconds = o.showAnalog && o.secondHand;
  const digitalSeconds = o.showDigital && o.showSeconds;
  return analogSeconds || digitalSeconds;
}

// Kantenlaenge der analogen Uhr in Pixeln.
function analogSizePx(options) {
  return ANALOG_SIZE_PX[normalizeClockOptions(options).analogSize];
}

// 4T-0679: Schrift-Faktor der digitalen Anzeige. Das Panel setzt ihn als
// CSS-Variable am Panel-Koerper, die drei Textzeilen leiten ihre Groesse
// daraus ab.
function clockScale(options) {
  return CLOCK_SCALE[normalizeClockOptions(options).analogSize];
}

// Zeiger-Winkel in Grad, 0 = 12 Uhr, im Uhrzeigersinn. Stunden- und
// Minutenzeiger laufen bewusst gleitend mit (sonst wirkt die Uhr bei 59
// Minuten noch auf der vollen Stunde); der Sekundenzeiger springt bzw.
// gleitet je nach Option.
function handAngles(date, options) {
  const o = normalizeClockOptions(options);
  const h = date.getHours() % 12;
  const m = date.getMinutes();
  const s = date.getSeconds();
  const ms = date.getMilliseconds();
  const secondFraction = o.secondMotion === 'sweep' ? s + ms / 1000 : s;
  return {
    hour: h * 30 + m * 0.5 + s * (0.5 / 60),
    minute: m * 6 + s * 0.1,
    second: secondFraction * 6,
  };
}

// Digitale Zeit. meridiem liefert die lokalisierten AM/PM-Kuerzel
// ({ am, pm }) — die Funktion bleibt damit i18n-frei und trotzdem
// vollstaendig testbar.
function formatClockTime(date, options, meridiem = { am: 'AM', pm: 'PM' }) {
  const o = normalizeClockOptions(options);
  const h24 = date.getHours();
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const tail = o.showSeconds ? `:${ss}` : '';
  if (o.hourFormat === 12) {
    // 0 Uhr und 12 Uhr zeigen beide die 12 (12 AM bzw. 12 PM).
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = h24 < 12 ? meridiem.am : meridiem.pm;
    return `${h12}:${mm}${tail} ${suffix}`;
  }
  return `${String(h24).padStart(2, '0')}:${mm}${tail}`;
}

// ISO-8601-Kalenderwoche (Woche 1 enthaelt den ersten Donnerstag des
// Jahres). Bewusst lokale Kurz-Fassung, Begruendung im Kopf-Kommentar.
function isoWeekNumber(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Auf den Donnerstag derselben ISO-Woche schieben (Montag = 0).
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  // Math.round faengt Sommerzeit-bedingte Stunden-Abweichungen ab.
  return 1 + Math.round((d - firstThursday) / (7 * 86400000));
}

// Datumszeile. Die drei sprachabhaengigen Formate laufen ueber
// Intl.DateTimeFormat (in Node und im Renderer verfuegbar), ISO bleibt
// bewusst sprachneutral.
function formatClockDate(date, options, lang = 'de') {
  const o = normalizeClockOptions(options);
  if (o.dateFormat === 'iso') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const opts =
    o.dateFormat === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : o.dateFormat === 'medium'
        ? { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(lang, opts).format(date);
  } catch {
    // Unbekanntes Sprach-Tag: Standard-Locale der Laufzeit statt Absturz.
    return new Intl.DateTimeFormat(undefined, opts).format(date);
  }
}

module.exports = {
  CLOCK_OPTIONS_KEY,
  CLOCK_MODES,
  CLOCK_MODE_KEYS,
  normalizeClockMode,
  clockModeKey,
  DEFAULT_CLOCK_OPTIONS,
  ANALOG_SIZES,
  DIAL_STYLES,
  SECOND_MOTIONS,
  HOUR_FORMATS,
  DATE_FORMATS,
  ANALOG_SIZE_PX,
  CLOCK_SCALE,
  normalizeClockOptions,
  needsSecondTick,
  analogSizePx,
  clockScale,
  handAngles,
  formatClockTime,
  isoWeekNumber,
  formatClockDate,
};
