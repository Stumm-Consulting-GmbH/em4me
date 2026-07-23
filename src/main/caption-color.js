// 4T-0630 (Epic 3E-0102): Titelleisten-Färbung nach Arbeitsbereichs-Farbe
// über die Windows-11-DWM-Fenster-Attribute DWMWA_CAPTION_COLOR und
// DWMWA_TEXT_COLOR (DwmSetWindowAttribute, dwmapi.dll) per FFI (koffi).
// Electron 33 bietet für die native Titelleiste keine Färbungs-API
// (Epic-Architekturentscheidung „Titelleisten-Färbung über direkten
// DWM-Aufruf").
//
// Das Modul ist zur Ladezeit electron- und koffi-frei (unit-testbar);
// koffi wird beim ersten Färbungs-Aufruf lazy geladen. Fehler-Pfad
// (Windows 10 ohne die Farb-Attribute, Lade- oder Aufruf-Fehler):
// einmaliges Log, danach stiller No-op — die App bleibt ohne Färbung
// voll funktionsfähig.
'use strict';

const {
  TAB_GROUP_COLOR_VALUES,
  TAB_GROUP_COLOR_VALUES_DARK,
  TAB_GROUP_COLOR_TEXT_VALUES,
  TAB_GROUP_COLOR_TEXT_VALUES_DARK,
} = require('../shared/tab-group-colors');

// Attribut-Codes aus dwmapi.h (ab Windows 11 Build 22000).
const DWMWA_CAPTION_COLOR = 35;
const DWMWA_TEXT_COLOR = 36;
// Sentinel-Wert: Attribut auf das System-Standard-Verhalten zurücksetzen.
const DWMWA_COLOR_DEFAULT = 0xffffffff;

// '#rrggbb' → COLORREF (0x00BBGGRR, little-endian Windows-Farbwort);
// null bei ungültigem Input.
function hexToColorref(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (b << 16) | (g << 8) | r;
}

// Theme-passende Titelleisten-Farben (COLORREF-Paar) für einen
// Paletten-Key; null bei unbekanntem Key.
function captionColorsFor(colorKey, dark) {
  const bg = (dark ? TAB_GROUP_COLOR_VALUES_DARK : TAB_GROUP_COLOR_VALUES)[colorKey];
  const fg = (dark ? TAB_GROUP_COLOR_TEXT_VALUES_DARK : TAB_GROUP_COLOR_TEXT_VALUES)[colorKey];
  const caption = hexToColorref(bg);
  const text = hexToColorref(fg);
  if (caption == null || text == null) return null;
  return { caption, text };
}

// Nativer Aufruf-Kanal: undefined = noch nicht geladen (lazy),
// null = dauerhaft deaktiviert (Lade- oder Aufruf-Fehler, Windows 10).
let dwmCall;

function loadDwmCall() {
  if (dwmCall !== undefined) return dwmCall;
  try {
    // Lazy-Require: die native koffi-Binärdatei wird erst beim ersten
    // Färbungs-Aufruf geladen.
    const koffi = require('koffi');
    const lib = koffi.load('dwmapi.dll');
    const fn = lib.func(
      'long __stdcall DwmSetWindowAttribute(intptr_t hwnd, uint32 attr, void* pv, uint32 cb)',
    );
    dwmCall = (hwnd, attr, value) => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(value >>> 0, 0);
      return fn(hwnd, attr, buf, 4);
    };
  } catch (err) {
    console.warn(
      '[caption-color] DWM-Zugriff nicht verfügbar:',
      err && err.message ? err.message : err,
    );
    dwmCall = null;
  }
  return dwmCall;
}

// Ein Attribut setzen; bei Fehl-HRESULT (z.B. E_INVALIDARG auf Windows 10,
// das die Farb-Attribute nicht kennt) oder Exception: einmaliges Log und
// dauerhafter No-op (keine Folge-Aufrufe mehr).
function callDwm(hwnd, attr, value) {
  const fn = loadDwmCall();
  if (!fn) return false;
  let hr;
  try {
    hr = fn(hwnd, attr, value);
  } catch (err) {
    console.warn(
      '[caption-color] DwmSetWindowAttribute fehlgeschlagen:',
      err && err.message ? err.message : err,
    );
    dwmCall = null;
    return false;
  }
  if (hr !== 0) {
    console.warn('[caption-color] DwmSetWindowAttribute abgelehnt, HRESULT:', hr);
    dwmCall = null;
    return false;
  }
  return true;
}

// HWND-Wert aus dem Handle-Buffer von win.getNativeWindowHandle()
// (x64: 8 Byte little-endian); null bei unbrauchbarem Input.
function hwndFromHandle(handleBuffer) {
  if (!Buffer.isBuffer(handleBuffer) || handleBuffer.length < 8) return null;
  return handleBuffer.readBigInt64LE(0);
}

// Färbt die Titelleiste des Fensters nach Paletten-Key und Theme;
// colorKey null/unbekannt setzt auf die Standard-Titelleiste zurück.
// handleBuffer ist das native Fenster-Handle (win.getNativeWindowHandle()).
// Liefert true, wenn beide DWM-Aufrufe durchgingen.
function applyCaptionColor(handleBuffer, colorKey, dark) {
  const hwnd = hwndFromHandle(handleBuffer);
  if (hwnd == null) return false;
  const colors = colorKey ? captionColorsFor(colorKey, !!dark) : null;
  const caption = colors ? colors.caption : DWMWA_COLOR_DEFAULT;
  const text = colors ? colors.text : DWMWA_COLOR_DEFAULT;
  const okCaption = callDwm(hwnd, DWMWA_CAPTION_COLOR, caption);
  const okText = callDwm(hwnd, DWMWA_TEXT_COLOR, text);
  return okCaption && okText;
}

// Nur für Tests: nativen Aufruf-Kanal injizieren bzw. mit undefined auf
// den Lazy-Ausgangszustand zurücksetzen (Muster guardBuildNumber in
// scripts/archive-build.js).
function setDwmCallForTests(fn) {
  dwmCall = fn;
}

module.exports = {
  DWMWA_CAPTION_COLOR,
  DWMWA_TEXT_COLOR,
  DWMWA_COLOR_DEFAULT,
  hexToColorref,
  captionColorsFor,
  applyCaptionColor,
  setDwmCallForTests,
};
