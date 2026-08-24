// Typ- und Wert-Hilfen der Eigenschafts-Felder: Typ-Ableitung aus einem Wert,
// Umwandlung zwischen Typen, Leer-Wert je Typ, der weiche Validierungs-Hinweis
// und das Auslesen eines Wertes aus der Feld-DOM.
//
// 4T-1172 (Epic 3E-0220): Auszug aus properties-types.js. Der Anlass war der
// Ordner-Import-Wächter: Sein Bestands-Zyklus über die Renderer-Ordner ist mit
// Ratsche eingefroren und darf technisch nicht wachsen, und properties-types.js
// gehört dazu (sie liest Sitzungs-Zustand und ruft die Auflösung über IPC). Ein
// neues Modul, das von dort etwas importiert, gerät damit selbst in die
// Komponente — auch dann, wenn es die verflochtenen Teile gar nicht braucht.
//
// Der Schnitt folgt der Fachlichkeit und nicht dem Wächter: Diese Funktionen
// sind ZUSTANDSFREI. Sie kennen weder Spalte noch Reiter noch Erweiterungs-Gate
// und beantworten allein Fragen über einen Wert und seinen Typ; die
// Profil-AUFLÖSUNG einer Spalte ist der andere Gegenstand und bleibt drüben.
// Dass die Trennung erst jetzt sichtbar wurde, liegt daran, dass bisher nur
// verflochtene Module sie gebraucht haben.
//
// Stellung im Ordner: Blatt. Nur i18n und die geteilte Profil-Fassade, keine
// ausgehende Kante in die Renderer-Komponente.
'use strict';

import { t } from '../../i18n.js';
import {
  // 4T-0491 (Epic 3E-0093): gemeinsame Leer-Wert-Quelle der Komplett-Übernahme.
  emptyValueForType,
  // 4T-1157 (Epic 3E-0219): Hinweis zur Quelle eines Wertevorrats.
  valueSourceHint,
} from '../../../shared/property-profiles.js';

// 4T-1156 (Epic 3E-0219): Uhrzeit im 24-Stunden-Format, Sekunden optional —
// dieselbe Regel wie im Format-Modul (`property-profiles-format.js`).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// 4T-1156: `link` und `time` werden bewusst NICHT inferiert. Ein Verweis ist
// als Wert ein gewöhnlicher Text, und eine Uhrzeit steht in Anführungszeichen
// wie jeder andere String; sie zu erraten hieße, jedes Textfeld mit `[[…]]`
// oder `09:30` still zum Verweis- bzw. Zeit-Feld zu machen. Beide Typen
// entstehen allein aus einer Definition oder aus der Wahl im Typ-Wechsler.
export function inferType(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (value.includes('\n')) return 'multiline';
    return 'string';
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) return 'multistring';
    return 'readonly';
  }
  if (typeof value === 'object') return 'readonly';
  return 'string';
}

// Konvertiert einen Wert von einem Typ in einen anderen, so robust wie
// moeglich. Bei nicht erfolgreicher Konvertierung wird ein typgerechter
// Default zurueckgegeben (leer string, leeres Array, 0, false, '').
export function coerceValue(value, fromType, toType) {
  if (fromType === toType) return value;
  if (toType === 'string') {
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value);
  }
  if (toType === 'multistring') {
    if (Array.isArray(value)) return value.map((v) => String(v));
    if (typeof value === 'string') {
      return value
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s);
    }
    return [];
  }
  if (toType === 'number') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (toType === 'boolean') {
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return !!value;
  }
  if (toType === 'date') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return '';
  }
  if (toType === 'multiline') {
    if (Array.isArray(value)) return value.join('\n');
    return String(value || '');
  }
  // 4T-1156 (Epic 3E-0219): Ein Verweis ist beim Wechsel schlicht sein Text —
  // die Wiki-Schreibweise bleibt erhalten, damit ein versehentlicher
  // Typ-Wechsel das Ziel nicht verliert. Eine Uhrzeit dagegen wird geprüft
  // wie ein Datum: Ein nicht darstellbarer Wert würde das Bedienelement
  // leeren, ohne dass jemand ihn zurückholen kann.
  if (toType === 'link') {
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    return value === null || value === undefined ? '' : String(value);
  }
  if (toType === 'time') {
    if (typeof value === 'string' && TIME_RE.test(value.trim())) return value.trim();
    return '';
  }
  return value;
}

// Liefert einen typgerechten Default-Wert fuer ein neu angelegtes Feld.
// 4T-0491 (Epic 3E-0093): die sechs Profil-Typen kommen aus der gemeinsamen
// Quelle (emptyValueForType); nur der DOM-interne 'readonly'-Fall bleibt hier.
export function defaultValueForType(type) {
  if (type === 'readonly') return null;
  return emptyValueForType(type);
}

// 4T-0448: Hinweis-Icon eines Felds setzen bzw. verbergen. code ist der
// Hinweis-Code aus fieldDefinitionHint (null = konform). Exportiert für
// das Block-Panel (4T-0449, gleiche Hinweis-Darstellung).
export function applyFieldHint(hintEl, def, code) {
  if (!hintEl) return;
  if (!def) {
    hintEl.hidden = true;
    hintEl.title = '';
    return;
  }
  // 4T-1157 (Epic 3E-0219, E12): Fehlt die Quelle eines Wertevorrats oder
  // liefert sie nichts, bleibt das Feld bedienbar, der Vorrat ist leer, und
  // ein Hinweis steht am Feld (E12, letzte Festlegung). Er greift, wenn kein
  // Wert-Hinweis vorliegt: Ein Wert-Problem ist das konkretere und geht vor.
  if (!code) {
    const quelle = valueSourceHint(def);
    hintEl.hidden = quelle === null;
    hintEl.title = quelle === null ? '' : t('properties.profileHint.' + quelle);
    return;
  }
  hintEl.hidden = false;
  hintEl.title =
    code === 'typeMismatch'
      ? t('properties.profileHint.typeMismatch').replace(
          '{type}',
          t('properties.type.' + def.type) || def.type,
        )
      : t('properties.profileHint.outsideValues');
}

export function extractFieldValue(fieldEl, type) {
  const valueEl = fieldEl.querySelector('.properties-field-value');
  if (!valueEl) return defaultValueForType(type);
  // 4T-0448: Auswahl-Liste eines Wertebereichs-Felds (Einfach-Auswahl).
  const select = valueEl.querySelector('select.properties-field-value-select');
  if (select) {
    if (type === 'number') {
      const n = parseFloat(select.value);
      return Number.isFinite(n) ? n : 0;
    }
    return select.value;
  }
  // 4T-1156 (Epic 3E-0219): Zyklus-Knopf und Chips-Leiste stehen vor der
  // Typ-Verzweigung, weil beide seit der Entkopplung (E11) an jedem Typ
  // hängen können — der Typ-Name verrät die Vielzahl nicht mehr, und der
  // Zyklus ist ein Bedienelement der Auswahl, kein Typ.
  const zyklus = valueEl.querySelector('button.properties-field-value-cycle');
  if (zyklus) return zyklus.dataset.value || '';
  const chipListe = valueEl.querySelector('.properties-field-multistring');
  if (chipListe) {
    const pills = chipListe.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  if (type === 'string' || type === 'date' || type === 'link' || type === 'time') {
    const input = valueEl.querySelector('input');
    return input ? input.value : '';
  }
  if (type === 'multiline') {
    const ta = valueEl.querySelector('textarea');
    return ta ? ta.value : '';
  }
  if (type === 'number') {
    const input = valueEl.querySelector('input');
    if (!input) return 0;
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') {
    const cb = valueEl.querySelector('input[type=checkbox]');
    return cb ? !!cb.checked : false;
  }
  if (type === 'multistring') {
    const container = valueEl.querySelector('.properties-field-multistring');
    if (!container) return [];
    const pills = container.querySelectorAll('.properties-field-multistring-pill');
    return Array.from(pills)
      .map((p) => p.dataset.value)
      .filter((v) => v != null && v !== '');
  }
  return defaultValueForType(type);
}
