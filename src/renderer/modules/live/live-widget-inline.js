// Leichte Inline-Widgets des Live-Modus: Callout-Icon und -Titel, Task-Marker-
// und Kalender-Badge, Inline-Berechnung, Emoji.
// 4T-0982 (Epic 3E-0196): aus live-deco.js herausgelöst. Alle Widgets hier
// bauen ihr DOM ohne die Render-Pipeline; sie brauchen deshalb weder api noch
// die Nachverarbeitung des Render-Panes (Abgrenzung zu live-widget-render.js).
'use strict';

import { WidgetType } from '@codemirror/view';

import { CALLOUT_TYPES } from '../../../shared/callouts.js';
import { t } from '../../i18n.js';

// 4T-0087: Inline-WidgetType fuer das Callout-Icon. Setzt das SVG aus
// CALLOUT_TYPES[type].iconSvg als HTML in einen Wrapper-Span. eq()
// vergleicht nur den Typ — Icon ist statisch pro Typ, kein Cache noetig.
// ignoreEvent verhindert, dass Klicks auf das Icon den CodeMirror-Cursor
// ins Widget setzen (Widgets haben keine Cursor-Positionen).
export class CalloutIconWidget extends WidgetType {
  constructor(type) {
    super();
    this.type = type;
  }
  eq(other) {
    return other instanceof CalloutIconWidget && other.type === this.type;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-callout-icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = CALLOUT_TYPES[this.type].iconSvg;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0087: Inline-WidgetType fuer den lokalisierten Default-Titel. Wird
// nur eingesetzt, wenn der Callout-Header keinen Override-Titel traegt.
// eq() vergleicht zusaetzlich die aktuelle Sprache — das Widget wird bei
// Sprach-Wechsel neu gebaut, sobald der i18n-Refresh-Hook den Plugin-
// Re-Compute triggert (currentLanguage aus i18n.getLanguage).
export class CalloutDefaultTitleWidget extends WidgetType {
  constructor(type, language) {
    super();
    this.type = type;
    this.language = language;
  }
  eq(other) {
    return (
      other instanceof CalloutDefaultTitleWidget &&
      other.type === this.type &&
      other.language === this.language
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-callout-title';
    const key = CALLOUT_TYPES[this.type].titleKey;
    span.setAttribute('data-i18n', key);
    span.textContent = t(key);
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0498 (Epic 3E-0090): Task-Marker-Badge. Inline-Replace eines
// Marker-Segments (Termin, Prioritaet, Wiederholung, ID) durch die
// Badge-Darstellung — Klassen und Inhalt kommen aus taskMarkerBadgeSpec
// (plugins.js), derselben Quelle wie der Render-Pane (Paritaet). Cursor
// auf der Zeile zeigt den Roh-Text (activeLines-Guard beim Aufbau).
//
// 4T-0528 (Epic 3E-0095): optionaler clickRange { from, to } (Doc-Bereich
// des ⏰-Werts) macht das Badge klickbar: die data-live-date-Attribute
// sprechen den bestehenden mousedown-Handler des dateValuePlugin an
// (date-picker.js), der den vorbelegten Picker fuer exakt diesen Bereich
// oeffnet — kein zweiter Klick-Pfad.
export class TaskMarkerBadgeWidget extends WidgetType {
  constructor(cls, title, text, clickRange = null) {
    super();
    this.cls = cls;
    this.title = title;
    this.text = text;
    this.clickRange = clickRange;
  }
  eq(other) {
    return (
      other instanceof TaskMarkerBadgeWidget &&
      other.cls === this.cls &&
      other.title === this.title &&
      other.text === this.text &&
      (other.clickRange ? other.clickRange.from : -1) ===
        (this.clickRange ? this.clickRange.from : -1) &&
      (other.clickRange ? other.clickRange.to : -1) === (this.clickRange ? this.clickRange.to : -1)
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-live-task-marker-badge ${this.cls}`;
    if (this.title) span.title = this.title;
    span.textContent = this.text;
    if (this.clickRange) {
      span.classList.add('task-marker-click');
      span.setAttribute('data-live-date-from', String(this.clickRange.from));
      span.setAttribute('data-live-date-to', String(this.clickRange.to));
    }
    return span;
  }
  ignoreEvent(event) {
    // 4T-0528: mousedown auf einem klickbaren Badge gehoert dem Editor
    // (der dateValuePlugin-Handler verbraucht ihn); alles andere bleibt
    // widget-intern ignoriert.
    if (this.clickRange && event && event.type === 'mousedown') return false;
    return true;
  }
}

// 4T-0546 (Epic 3E-0097): Kalender-Wert-Badge. Inline-Replace eines
// @{Kalendername: Wert}-Vorkommens durch die Badge-Darstellung — Klassen
// und Inhalt kommen aus calendarValueBadgeSpec (plugins.js), derselben
// Quelle wie der Render-Pane (Paritaet). Cursor auf der Zeile zeigt den
// Roh-Text (activeLines-Guard beim Aufbau). clickRange traegt den
// Doc-Bereich des Vorkommens: die data-live-calvalue-Attribute sprechen
// den mousedown-Handler des calendarValuePlugin an (calendar-picker.js),
// der den vorbelegten Picker fuer exakt diesen Bereich oeffnet.
export class CalendarValueBadgeWidget extends WidgetType {
  constructor(cls, title, text, clickRange = null) {
    super();
    this.cls = cls;
    this.title = title;
    this.text = text;
    this.clickRange = clickRange;
  }
  eq(other) {
    return (
      other instanceof CalendarValueBadgeWidget &&
      other.cls === this.cls &&
      other.title === this.title &&
      other.text === this.text &&
      (other.clickRange ? other.clickRange.from : -1) ===
        (this.clickRange ? this.clickRange.from : -1) &&
      (other.clickRange ? other.clickRange.to : -1) === (this.clickRange ? this.clickRange.to : -1)
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-live-calendar-badge ${this.cls}`;
    if (this.title) span.title = this.title;
    span.textContent = this.text;
    if (this.clickRange) {
      span.setAttribute('data-live-calvalue-from', String(this.clickRange.from));
      span.setAttribute('data-live-calvalue-to', String(this.clickRange.to));
    }
    return span;
  }
  ignoreEvent(event) {
    // mousedown gehoert dem Editor (der calendarValuePlugin-Handler
    // verbraucht ihn); alles andere bleibt widget-intern ignoriert.
    if (this.clickRange && event && event.type === 'mousedown') return false;
    return true;
  }
}

// 4T-0596 (Epic 3E-0111): Inline-Berechnungs-Widget. Inline-Replace des
// {= … =}-Konstrukts durch das Ergebnis bzw. das Fehler-Zeichen mit Tooltip —
// Spec-Quelle wie der Render-Pane (Paritaet). Cursor auf der Zeile zeigt den
// Roh-Ausdruck (activeLines-Guard beim Aufbau); ein Klick setzt den Cursor
// IN das Konstrukt (posAtDOM + 2, hinter `{=`) und deckt die Zeile damit
// auf — eigener mousedown-Handler nach dem Muster des FrontmatterBlockWidget;
// ignoreEvent haelt die zentralen CM-Handler fern, weil das Widget selbst
// bindet.
export class InlineCalcWidget extends WidgetType {
  constructor(cls, title, text) {
    super();
    this.cls = cls;
    this.title = title;
    this.text = text;
  }
  eq(other) {
    return (
      other instanceof InlineCalcWidget &&
      other.cls === this.cls &&
      other.title === this.title &&
      other.text === this.text
    );
  }
  toDOM(view) {
    const span = document.createElement('span');
    span.className = this.cls;
    if (this.title) span.title = this.title;
    span.textContent = this.text;
    span.addEventListener('mousedown', (event) => {
      event.preventDefault();
      try {
        const base = view.posAtDOM(span);
        view.dispatch({ selection: { anchor: base + 2 }, scrollIntoView: true });
        view.focus();
      } catch {
        // Widget bereits abgeloest — kein Cursor-Sprung moeglich.
      }
    });
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0197 (Epic 3E-0017): Emoji-Widget. Inline-Replace eines `:code:`-
// Shortcode-Ranges durch das Unicode-Zeichen. Kein Markdown-Render-
// Roundtrip noetig — das Zeichen kommt direkt aus der Lookup-Map des
// markdown-it-emoji-Pakets (Single Source of Truth, Import in
// live-widgets.js).
export class EmojiWidget extends WidgetType {
  constructor(char) {
    super();
    this.char = char;
  }
  eq(other) {
    return other instanceof EmojiWidget && other.char === this.char;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-emoji';
    span.textContent = this.char;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}
