// 4T-002642 (Epic 3E-000397): Grund-Belegung der beiden Editoren (Haupt- und
// Notiz-Editor) ohne Alt+Pfeil links und rechts. Die beiden Tasten gehören
// «Zurück» und «Vor» im Verlauf des Fensters; die Standard-Belegung von
// CodeMirror sprang mit ihnen über Syntax-Knoten (mit Umschalt: Auswahl, am
// selben Eintrag). Ohne den Filter bewegte ein Druck im Bearbeiten-Modus die
// Schreibmarke und wechselte zugleich den Ort (Nachweis in Schritt 1a).
//
// Gefiltert wird nach der Taste für Windows und Linux (`key`); die Einträge,
// die die Tasten nur unter macOS tragen (`mac`), bleiben unverändert.
'use strict';

import { defaultKeymap } from '@codemirror/commands';

/** Tasten, die der Editor an «Zurück» und «Vor» abgibt. */
export const VERLAUF_TASTEN = ['Alt-ArrowLeft', 'Alt-ArrowRight'];

/** `defaultKeymap` ohne die Einträge der beiden Tasten. */
export const editorGrundBelegung = defaultKeymap.filter((b) => !VERLAUF_TASTEN.includes(b.key));
