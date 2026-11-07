// 4T-002503 (Epic 3E-000403): Wert-Zeilen und Rueckfall-Suche der Verweise im
// Kopf-Block, der Arbeitsteil von `kopfVerweisFunde` in link-scan.js. Dort steht
// die Regel und ihre Begruendung; hier die Zeilen-Arbeit: die Wert-Zeilen eines
// Schluessels aus der Struktur (kopfWertPlan, findeImWert), der Rueckfall im
// Zeilen-Bereich des Schluessels (rueckfallFund, Befunde C1 und D1 des Reviews)
// und das Lesen einer Wert-Zeile mit Anfuehrungszeichen, Klammer-Ebene und
// Kommentar-Ende (wertZeichen, Befund C2).
//
// **Warum ein eigenes Modul.** Schnitt nach Fachlichkeit, ausgeloest vom
// Zeilen-Budget von link-scan.js. Das Modul braucht nichts aus link-scan.js;
// link-scan.js importiert es, so entsteht kein Ring-Bezug. Electron-frei und
// rein string-basiert wie link-scan.js.
'use strict';

// Leer- oder Kommentar-Zeile (`#` als erstes Nicht-Leerzeichen).
function istLeerOderKommentar(line) {
  return /^\s*(#.*)?$/.test(line);
}

// Eine Zeile, die einen Eintrag `schluessel: …` einer verschachtelten Struktur
// beginnt, auch hinter `- ` (Liste aus Objekten). Im Rueckfall gehoert sie nie
// zum gesuchten Wert.
const VERSCHACHTELT_RE =
  /^\s*(?:-\s+)*(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"[\]{}|>-][^:#]*?)\s*:(?=\s|$)/;

// Kopf eines Block-Skalars (`|` oder `>`, mit Angaben und Kommentar) als Wert.
const BLOCK_KOPF_RE = /^[|>][+-]?\d*[+-]?\s*(#.*)?$/;

// Die Wert-Zeilen eines Schluessels der obersten Ebene (siehe kopfVerweisFunde).
// Ein Abschnitt ist { z, von, block, flow, einzeilig }: Zeile, Spalte des
// Wert-Anfangs, ob die Zeile Inhalt eines Block-Skalars ist (dort ist `#` Text,
// kein Kommentar), ob der Wert eine Flow-Sammlung ist (dann zaehlt nur die erste
// Klammer-Ebene) und ob ein Skalar ohne Anfuehrungszeichen dort in einer Zeile
// endet (nur dann darf der Umschreiber ihn in Anfuehrungszeichen einfassen).
function kopfWertPlan(lines, bereich, istListe) {
  const kopf = lines[bereich.von];
  const rest = kopf.slice(bereich.wertAb);
  const restStart = bereich.wertAb + (rest.length - rest.trimStart().length);
  const restText = rest.trim();
  const folgeZeilen = [];
  for (let z = bereich.von + 1; z < bereich.bis; z++) {
    if (!istLeerOderKommentar(lines[z])) folgeZeilen.push(z);
  }
  if (restText.startsWith('[') || restText.startsWith('{')) {
    return { art: 'abschnitte', abschnitte: [{ z: bereich.von, von: restStart, flow: true }] };
  }
  if (istListe) {
    // Block-Liste: die Eintrags-Zeilen auf der Einzugs-Ebene des ersten Eintrags.
    const eintragsZeilen = [];
    let einzug = null;
    for (let k = 0; k < folgeZeilen.length; k++) {
      const z = folgeZeilen[k];
      const m = lines[z].match(/^(\s*)-(?=\s|$)\s*/);
      if (!m) continue;
      if (einzug === null) einzug = m[1].length;
      if (m[1].length !== einzug) continue;
      // Einzeilig, wenn die naechste Inhalts-Zeile nicht tiefer eingerueckt ist.
      const naechste = folgeZeilen[k + 1];
      const einzeilig =
        naechste === undefined ||
        lines[naechste].length - lines[naechste].trimStart().length <= einzug;
      eintragsZeilen.push({ z, von: m[0].length, einzeilig });
    }
    return { art: 'block-liste', eintragsZeilen };
  }
  if (BLOCK_KOPF_RE.test(restText)) {
    const abschnitte = [];
    for (let z = bereich.von + 1; z < bereich.bis; z++) {
      abschnitte.push({ z, von: 0, block: true });
    }
    return { art: 'abschnitte', abschnitte };
  }
  if (restText === '' || restText.startsWith('#')) {
    if (!folgeZeilen.length) return { art: 'abschnitte', abschnitte: [] };
    const z = folgeZeilen[0];
    return {
      art: 'abschnitte',
      abschnitte: [
        {
          z,
          von: lines[z].length - lines[z].trimStart().length,
          einzeilig: folgeZeilen.length === 1,
        },
      ],
    };
  }
  return {
    art: 'abschnitte',
    abschnitte: [{ z: bereich.von, von: restStart, einzeilig: folgeZeilen.length === 0 }],
  };
}

// Sucht `text` in `line` innerhalb des Werts, der bei `abschnitt.von` beginnt,
// ab Spalte `ab`. Liefert { spalte, quote, block, flow, skalar } oder null.
function findeImWert(line, text, abschnitt, ab) {
  if (abschnitt.block) {
    const pos = line.indexOf(text, Math.max(abschnitt.von, ab));
    if (pos < 0) return null;
    return { spalte: pos, quote: null, block: true, flow: false, skalar: null };
  }
  const { info } = wertZeichen(line, abschnitt.von, Boolean(abschnitt.flow), null);
  return trefferInZeile(line, text, info, {
    ab: Math.max(abschnitt.von, ab),
    flow: Boolean(abschnitt.flow),
    einzeilig: Boolean(abschnitt.einzeilig),
    belegt: null,
  });
}

// Der Rueckfall (Befund C1): durchsucht den Zeilen-Bereich des Schluessels ab
// `zeiger` ({ z, spalte }) nach `text`. Ausgeschlossen sind Kommentar-Zeilen,
// Kommentar-Enden, verschachtelte Eintraege samt ihren Folgezeilen (Befund D1:
// `schluessel: …`, auch hinter `- `, mit Block-Skalar- und Fortsetzungs-Zeilen;
// Listen-Eintraege `- [`, `- {` bis zur schliessenden Klammer und `- - …`;
// in einer Flow-Sammlung schliesst die Klammer-Ebene sie aus) und die Stellen in
// `belegt` (`zeile:spalte`). Der Inhalt eines Block-Skalars (auch als
// Listen-Eintrag `- |`) wird als Text gelesen, ohne Anfuehrungszeichen und
// Kommentare. Eine Flow-Sammlung, die auf der Schluessel-Zeile oder der ersten
// Wert-Zeile mit `[` oder `{` beginnt, wird ueber die Zeilen hinweg mit ihrer
// Klammer-Ebene verfolgt. Liefert die Felder eines Fundes oder null.
function rueckfallFund(lines, bereich, text, zeiger, belegt) {
  const kopfRest = lines[bereich.von].slice(bereich.wertAb).trim();
  let flow = /^[[{]/.test(kopfRest);
  if (!flow && (kopfRest === '' || kopfRest.startsWith('#'))) {
    for (let z = bereich.von + 1; z < bereich.bis; z++) {
      if (istLeerOderKommentar(lines[z])) continue;
      flow = /^\s*[[{]/.test(lines[z]);
      break;
    }
  }
  let zustand = null;
  let blockEinzug = null;
  // Befund D1: Einzug einer ausgelassenen verschachtelten Struktur (alles tiefer
  // Eingerueckte gehoert zu ihr) und der Zustand einer noch offenen
  // verschachtelten Flow-Struktur (`- [` ohne schliessende Klammer).
  let ausgelassenEinzug = null;
  let offeneFlowAuslassung = null;
  for (let z = bereich.von; z < bereich.bis; z++) {
    const line = lines[z];
    const einzug = line.length - line.trimStart().length;
    const ab = z === zeiger.z ? zeiger.spalte : 0;
    if (z > bereich.von && offeneFlowAuslassung) {
      const { ende } = wertZeichen(line, 0, true, offeneFlowAuslassung);
      offeneFlowAuslassung = ende.ebene > 0 ? ende : null;
      continue;
    }
    if (z > bereich.von && ausgelassenEinzug !== null) {
      if (line.trim() === '' || einzug > ausgelassenEinzug) continue;
      ausgelassenEinzug = null;
    }
    if (z > bereich.von && blockEinzug !== null) {
      if (line.trim() === '') continue;
      if (einzug > blockEinzug) {
        if (z < zeiger.z) continue;
        let pos = line.indexOf(text, Math.max(ab, einzug));
        while (pos >= 0 && belegt.has(`${z}:${pos}`)) pos = line.indexOf(text, pos + 1);
        if (pos >= 0) {
          return {
            zeilenIndex: z,
            spalte: pos,
            quote: null,
            block: true,
            flow: false,
            skalar: null,
          };
        }
        continue;
      }
      blockEinzug = null;
    }
    let von;
    if (z === bereich.von) von = bereich.wertAb;
    else {
      if (istLeerOderKommentar(line)) continue;
      if (!flow) {
        // Verschachtelt ist ein Eintrag `schluessel: …` (auch hinter `- `) und
        // ein Listen-Eintrag, der selbst eine Flow-Struktur (`- [`, `- {`) oder
        // eine Liste (`- - …`) ist. Ausgelassen wird er samt allen tiefer
        // eingerueckten Folgezeilen und, bei einer Flow-Struktur, bis zu ihrer
        // schliessenden Klammer.
        const strich = line.match(/^\s*-(?:\s+|$)/);
        const inhalt = strich ? line.slice(strich[0].length) : '';
        const flowEintrag = Boolean(strich) && /^[[{]/.test(inhalt);
        if (VERSCHACHTELT_RE.test(line) || flowEintrag || (strich && /^-(\s|$)/.test(inhalt))) {
          ausgelassenEinzug = einzug;
          if (flowEintrag) {
            const { ende } = wertZeichen(line, strich[0].length, true, null);
            if (ende.ebene > 0) offeneFlowAuslassung = ende;
          }
          continue;
        }
      }
      von = flow ? 0 : line.match(/^\s*(?:-(?:\s+|$))?/)[0].length;
    }
    if (!flow && BLOCK_KOPF_RE.test(line.slice(von).trim())) {
      blockEinzug = z === bereich.von ? 0 : einzug;
      continue;
    }
    const { info, ende } = wertZeichen(line, von, flow, zustand);
    if (flow) zustand = ende;
    if (z < zeiger.z) continue;
    const treffer = trefferInZeile(line, text, info, {
      ab: Math.max(von, ab),
      flow,
      einzeilig: false,
      belegt: (p) => belegt.has(`${z}:${p}`),
    });
    if (treffer) return { zeilenIndex: z, ...treffer };
  }
  return null;
}

// Liest eine Wert-Zeile ab Spalte `von` und haelt je Zeichen im Wert fest, in
// welchen Anfuehrungszeichen (`quote`), auf welcher Klammer-Ebene (`ebene`) und
// in welchem Skalar (`skalarVon`, dessen Anfangs-Spalte) es steht; Zeichen nach
// einem Kommentar-Beginn (`#` am Wert-Anfang oder nach Leerraum, ausserhalb von
// Anfuehrungszeichen) bleiben null. Escapes: `\` in doppelten, `''` in einfachen
// Anfuehrungszeichen.
//
// 4T-002503 (Befund C2 des Reviews): Ein Anfuehrungszeichen oeffnet einen Skalar
// nur am Wert-Anfang, also als erstes Nicht-Leerzeichen ab `von` und in einer
// Flow-Sammlung nach `[`, `{` oder `,`; ueberall sonst ist es Text
// (`Peter's [[Alt]]` ist ein Skalar ohne Anfuehrungszeichen). `zustand` traegt
// Klammer-Ebene und Wert-Erwartung einer Flow-Sammlung ueber Zeilen hinweg.
function wertZeichen(line, von, flow, zustand) {
  const info = new Array(line.length).fill(null);
  let quote = null;
  let ebene = zustand ? zustand.ebene : 0;
  let erwarteWert = zustand ? zustand.erwarteWert : true;
  let skalarVon = null;
  for (let p = von; p < line.length; p++) {
    const c = line.charAt(p);
    if (quote !== null) {
      info[p] = { quote, ebene, skalarVon };
      const doppelt = quote === '"' && c === '\\';
      const einfachEscape = quote === "'" && c === "'" && line.charAt(p + 1) === "'";
      if ((doppelt || einfachEscape) && p + 1 < line.length) {
        p++;
        info[p] = { quote, ebene, skalarVon };
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '#' && (p === von || /\s/.test(line.charAt(p - 1)))) break; // Kommentar
    if (/\s/.test(c)) {
      info[p] = { quote: null, ebene, skalarVon };
      continue;
    }
    if (flow && '[]{},'.includes(c)) {
      if (c === '[' || c === '{') ebene++;
      else if (c === ']' || c === '}') ebene--;
      erwarteWert = c !== ']' && c !== '}';
      skalarVon = null;
      info[p] = { quote: null, ebene, skalarVon: null };
      continue;
    }
    if (erwarteWert) {
      erwarteWert = false;
      skalarVon = p;
      if (c === '"' || c === "'") {
        info[p] = { quote: null, ebene, skalarVon };
        quote = c;
        continue;
      }
    }
    info[p] = { quote: null, ebene, skalarVon };
  }
  return { info, ende: { ebene, erwarteWert } };
}

// Die erste Stelle von `text` ab `opt.ab`, die ganz in einem Skalar des Werts
// liegt, auf der richtigen Klammer-Ebene (1 in einer Flow-Sammlung, sonst 0) und
// nicht belegt ist. Bei einem Skalar ohne Anfuehrungszeichen, der in dieser Zeile
// endet, gehoert seine Spanne { von, bis } dazu.
function trefferInZeile(line, text, info, opt) {
  const soll = opt.flow ? 1 : 0;
  let pos = line.indexOf(text, opt.ab);
  while (pos >= 0) {
    const a = info[pos];
    const e = info[pos + text.length - 1];
    const passt = a && e && a.ebene === soll && a.skalarVon !== null && e.skalarVon === a.skalarVon;
    if (passt && !(opt.belegt && opt.belegt(pos))) {
      return {
        spalte: pos,
        quote: a.quote,
        block: false,
        flow: opt.flow,
        skalar: a.quote === null ? skalarSpanne(line, info, a.skalarVon, opt) : null,
      };
    }
    pos = line.indexOf(text, pos + 1);
  }
  return null;
}

// Spanne eines Skalars ohne Anfuehrungszeichen, wenn er sicher in dieser Zeile
// endet: ausserhalb einer Flow-Sammlung nur bei einem einzeiligen Wert, in einer
// Flow-Sammlung nur, wenn er an `,`, `]` oder `}` endet.
function skalarSpanne(line, info, von, opt) {
  if (!opt.flow && !opt.einzeilig) return null;
  let bis = von;
  while (bis < line.length && info[bis] && info[bis].skalarVon === von) bis++;
  if (opt.flow && !(bis < line.length && info[bis] && ',]}'.includes(line.charAt(bis)))) {
    return null;
  }
  while (bis > von && /\s/.test(line.charAt(bis - 1))) bis--;
  return { von, bis };
}

module.exports = { kopfWertPlan, findeImWert, rueckfallFund };
