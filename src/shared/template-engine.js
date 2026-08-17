// 4T-0425 (Epic 3E-0080): Platzhalter-Engine der Vorlagen.
//
// Kuratierter Platzhalter-Satz statt freiem JavaScript (Architektur-
// entscheidung 1 des Epics): Syntax `{{…}}`, Escape `\{{…}}`, Namen englisch
// und stabil. Prozess-neutral (kein Electron, kein DOM, kein eval) und in
// zwei Phasen geschnitten, damit das Modul rein und vollständig unit-testbar
// bleibt: `analyzeTemplate` zerlegt den Vorlagen-Text in Literale und
// Platzhalter und meldet die benötigten interaktiven Eingaben; der Aufrufer
// (4T-0426) erhebt die Antworten per Dialog und übergibt sie an
// `fillTemplate` für den Füll-Lauf. Interaktive Platzhalter werden im Modul
// selbst nie beantwortet.
//
// Platzhalter-Satz v1:
//   {{date}} / {{time}}       Zeitpunkt des Anwendens; optionaler Offset und
//                             optionales Format: {{date:+7d}}, {{date::yyyy-MM-dd}},
//                             {{time:-30min:HH:mm:ss}}. Offsets nutzen den
//                             Dauer-Einheiten-Katalog der Query-Sprache
//                             (parseDurationContent), Formate deren
//                             dateformat-Token (formatDateMs) — Architektur-
//                             entscheidung 5: keine zweite Datums-Bibliothek.
//   {{title}} / {{folder}}    Titel und Ordner der Zieldatei (Werte liefert
//                             der Anwendungs-Kontext).
//   {{prompt:Frage}} /        Eingabe-Dialog, optionaler Default nach der
//   {{prompt:Frage:Default}}  zweiten Trenn-Stelle (Default darf ':' tragen).
//   {{select:Frage:a,b,c}}    Auswahl-Liste (mindestens eine Option).
//   {{clipboard}}             Zwischenablage (Wert liefert der Aufrufer).
//   {{cursor}} / {{cursor:2}} nummerierte Cursor-Ziele; die Marker werden
//                             entfernt, die Offsets im Ergebnis-Text geliefert.
//
// Fehlerbild: unbekannte Platzhalter und defekte Parameter erzeugen einen
// strukturierten Fehler { code, pos, … } (Position im Vorlagen-Text); der
// Aufrufer zeigt ihn lokalisiert und bricht das Anwenden ab (keine halb
// gefüllte Datei). Identische prompt-/select-Platzhalter werden nur einmal
// erhoben (Schlüssel = kanonischer Spec-String) und überall eingesetzt.
'use strict';

// 4T-0987 (Epic 3E-0196): Abfrage-Sprache im Feature-Ordner src/shared/query/.
const { parseDurationContent } = require('./query/perspective-query.js');
const { formatDateMs } = require('./query/query-format.js');

// Default-Formate der Zeit-Platzhalter (dateformat-Token).
const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
const DEFAULT_TIME_FORMAT = 'HH:mm';

function makeError(code, pos, extra) {
  return { ok: false, error: { code, pos, ...(extra || {}) } };
}

// Offset-Angabe ('+7d', '-30min', '7d', '') → Millisekunden oder null.
// Leerer Offset ist 0; das Vorzeichen ist optional (ohne = plus).
function parseOffsetMs(text) {
  const t = String(text || '').trim();
  if (t === '') return 0;
  const sign = t[0] === '-' ? -1 : 1;
  const body = t[0] === '+' || t[0] === '-' ? t.slice(1) : t;
  const ms = parseDurationContent(body);
  return ms === null ? null : sign * ms;
}

// Zerlegt den Inhalt eines Platzhalters in Name und Parameter-Teile.
// Getrennt wird an ':'; wie die Teile zusammengehören (z.B. Formate mit ':'
// im Token-Text), entscheidet die Platzhalter-Auswertung selbst.
function splitPlaceholder(inner) {
  const parts = String(inner).split(':');
  return { name: parts[0].trim().toLowerCase(), params: parts.slice(1) };
}

// Baut den Platzhalter-Knoten aus dem Inhalt zwischen den Klammern.
// Liefert { ok: true, node } oder { ok: false, error }.
function parsePlaceholder(inner, pos) {
  const { name, params } = splitPlaceholder(inner);
  switch (name) {
    case 'date':
    case 'time': {
      // params[0] = Offset, alles Weitere ist das Format (darf ':' tragen).
      const offsetMs = parseOffsetMs(params[0]);
      if (offsetMs === null) {
        return makeError('invalidOffset', pos, { name, offset: String(params[0]).trim() });
      }
      const format = params.slice(1).join(':').trim();
      return {
        ok: true,
        node: {
          type: 'datetime',
          name,
          offsetMs,
          format: format || (name === 'date' ? DEFAULT_DATE_FORMAT : DEFAULT_TIME_FORMAT),
        },
      };
    }
    case 'title':
    case 'folder':
    case 'clipboard': {
      if (params.length > 0) return makeError('invalidParams', pos, { name });
      return { ok: true, node: { type: 'context', name } };
    }
    case 'prompt': {
      const question = (params[0] || '').trim();
      if (question === '') return makeError('invalidParams', pos, { name });
      const defaultValue = params.length > 1 ? params.slice(1).join(':').trim() : '';
      const key = `prompt:${question}:${defaultValue}`;
      return { ok: true, node: { type: 'input', kind: 'prompt', question, defaultValue, key } };
    }
    case 'select': {
      const question = (params[0] || '').trim();
      const options = params
        .slice(1)
        .join(':')
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
      if (question === '' || options.length === 0) {
        return makeError('invalidParams', pos, { name });
      }
      const key = `select:${question}:${options.join(',')}`;
      return { ok: true, node: { type: 'input', kind: 'select', question, options, key } };
    }
    case 'cursor': {
      let number = 1;
      if (params.length > 0) {
        const raw = params.join(':').trim();
        if (!/^[1-9]\d*$/.test(raw)) return makeError('invalidParams', pos, { name });
        number = parseInt(raw, 10);
      }
      return { ok: true, node: { type: 'cursor', number } };
    }
    default:
      return makeError('unknownPlaceholder', pos, { name });
  }
}

// Analyse-Phase: zerlegt den Vorlagen-Text in Segmente (Literale und
// Platzhalter-Knoten) und sammelt die benötigten interaktiven Eingaben.
// Liefert { ok: true, segments, inputs } oder { ok: false, error }.
// inputs: [{ key, kind: 'prompt'|'select', question, defaultValue?, options? }]
// — identische Platzhalter (gleicher key) erscheinen nur einmal, in der
// Reihenfolge ihres ersten Vorkommens (Dialog-Reihenfolge in 4T-0426).
function analyzeTemplate(text) {
  const src = String(text == null ? '' : text);
  const segments = [];
  const inputs = [];
  const seenInputs = new Set();
  let literal = '';
  let i = 0;
  while (i < src.length) {
    // Escape: '\{{' wird zum literalen '{{'.
    if (src[i] === '\\' && src.startsWith('{{', i + 1)) {
      literal += '{{';
      i += 3;
      continue;
    }
    if (src.startsWith('{{', i)) {
      const close = src.indexOf('}}', i + 2);
      if (close < 0) return makeError('unclosed', i);
      const inner = src.slice(i + 2, close);
      const parsed = parsePlaceholder(inner, i);
      if (!parsed.ok) return parsed;
      if (literal !== '') {
        segments.push({ type: 'lit', text: literal });
        literal = '';
      }
      segments.push(parsed.node);
      if (parsed.node.type === 'input' && !seenInputs.has(parsed.node.key)) {
        seenInputs.add(parsed.node.key);
        const { key, kind, question, defaultValue, options } = parsed.node;
        inputs.push(
          kind === 'prompt'
            ? { key, kind, question, defaultValue }
            : { key, kind, question, options },
        );
      }
      i = close + 2;
      continue;
    }
    literal += src[i];
    i++;
  }
  if (literal !== '') segments.push({ type: 'lit', text: literal });
  return { ok: true, segments, inputs };
}

// Füll-Phase: setzt Kontext-Werte und Dialog-Antworten in die analysierten
// Segmente ein. context:
//   title, folder   Strings der Zieldatei (fehlend = leer)
//   nowMs           Bezugszeitpunkt der Zeit-Platzhalter (fehlend = jetzt)
//   clipboard       Zwischenablage-Text (fehlend = leer)
//   answers         { [input.key]: string } — Antworten der Dialog-Kette
// Liefert { ok: true, text, cursorOffsets } oder { ok: false, error }.
// cursorOffsets sind Offsets im Ergebnis-Text, sortiert nach Cursor-Nummer
// (bei gleicher Nummer nach Vorkommen); die Marker selbst sind entfernt.
// Eine fehlende Antwort ist ein Aufrufer-Fehler und bricht strukturiert ab
// (code 'missingAnswer') — konsistent zur Abbruch-Semantik des Epics.
function fillTemplate(analysis, context) {
  if (!analysis || analysis.ok !== true || !Array.isArray(analysis.segments)) {
    return makeError('invalidAnalysis', -1);
  }
  const ctx = context || {};
  const answers = ctx.answers || {};
  const nowMs = typeof ctx.nowMs === 'number' ? ctx.nowMs : Date.now();
  let text = '';
  const cursorMarks = [];
  for (const seg of analysis.segments) {
    switch (seg.type) {
      case 'lit':
        text += seg.text;
        break;
      case 'datetime':
        // 4T-1057 (Epic 3E-0210): Sprach-Zufuhr über den Vorlagen-Kontext —
        // die sprachabhängigen Namens-Token (MMMM, EEEE …) folgen der
        // Oberflächen-Sprache; ohne ctx.locale bleibt die Laufzeit-Locale.
        text += formatDateMs(nowMs + seg.offsetMs, seg.format, ctx.locale);
        break;
      case 'context': {
        const value =
          seg.name === 'title' ? ctx.title : seg.name === 'folder' ? ctx.folder : ctx.clipboard;
        text += value == null ? '' : String(value);
        break;
      }
      case 'input': {
        const answer = answers[seg.key];
        if (answer === undefined || answer === null) {
          return makeError('missingAnswer', -1, { key: seg.key });
        }
        text += String(answer);
        break;
      }
      case 'cursor':
        cursorMarks.push({ number: seg.number, offset: text.length, order: cursorMarks.length });
        break;
      default:
        return makeError('invalidAnalysis', -1);
    }
  }
  cursorMarks.sort((a, b) => a.number - b.number || a.order - b.order);
  return { ok: true, text, cursorOffsets: cursorMarks.map((m) => m.offset) };
}

// Bequemlichkeits-Einstieg für Vorlagen ohne interaktive Platzhalter bzw.
// mit bereits erhobenen Antworten: analysieren und füllen in einem Zug.
function renderTemplate(text, context) {
  const analysis = analyzeTemplate(text);
  if (!analysis.ok) return analysis;
  return fillTemplate(analysis, context);
}

module.exports = {
  analyzeTemplate,
  fillTemplate,
  renderTemplate,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
};
