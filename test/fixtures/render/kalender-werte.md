# Kalender-Werte

Ein gültiger Wert @{Dreimond: 500-2-09 ZZ} im Fließtext.

Namens-Anzeige mitten im Satz: @{Dreimond: 1-2-13} und danach geht es weiter.

Unbekannter Kalender: @{Nirgendwo: 1-1-1} bleibt sichtbar markiert.

Ungültiger Wert: @{Dreimond: 500-9-99} bleibt unverändert erhalten.

Code bleibt literal: `@{Dreimond: 1-1-1}` und im Block:

    @{Dreimond: 2-2-2}

Keine Werte (Form passt nicht): @{ohne Doppelpunkt} und @{} und @{Dreimond: }.

## Abgeleitete Zeitrechnungen

Zaehlung ab dem Nullpunkt: @{Projekt: 0-1-18} und rueckwaerts
@{Projekt: 0-0-15 vor Start}; der Nullpunkt selbst ist @{Projekt: 0-0-1}.

Auf einem Fantasie-Kalender: @{Mondzählung: 0-1-12} und @{Mondzählung: 1-0-3 davor}.
