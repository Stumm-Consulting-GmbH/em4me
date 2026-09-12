# Canvas-Fläche als Block

Vor der Fläche steht gewöhnlicher Fließtext.

```perspective-canvas
!karte k1 x=-320 y=-140 b=260 h=120
## Ausgangslage

Der Import liest heute nur eine Quelle.
!karte k2 x=40 y=-140 b=260 h=120
Ohne Überschrift beginnt die Karte mit Fließtext.

Und trägt eine zweite Zeile.
!karte k3 x=400 y=-140 b=260 h=120
### Sehr langer Titel, der über die Grenze der Vorschau hinausreicht und deshalb gekürzt werden muss
Auch die zweite Zeile ist zu lang für die Vorschau und wird an derselben Grenze mit einem Auslassungszeichen abgeschnitten.
!karte k4 x=-320 y=60 b=260 h=120
#### Vierte
!karte k5 x=40 y=60 b=260 h=120
##### Fünfte
!karte k6 x=400 y=60 b=260 h=120
###### Sechste
!karte k7 x=-320 y=260 b=260 h=120
Siebte Karte, jenseits des Deckels
!karte k8 x=40 y=260 b=260 h=120
Achte Karte, ebenfalls jenseits des Deckels
!linie e1 k1 -> k2
!linie e2 k2 <-> k3 von=unten nach=oben
```

Zwischen den Flächen steht wieder Fließtext.

```perspective-canvas
!karte g1 x=0 y=0 b=200 h=100
Karte mit <script>alert(1)</script> und & im Text
!linie kaputt k1 -> nirgends
```

Und eine leere Fläche ohne jede Karte.

```perspective-canvas
```
