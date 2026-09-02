# Frontmatter-Abfrage (perspective-query)

Einfache Wert-Abfrage:

```perspective-query
bereich = "Privat"
```

Boolescher Ausdruck mit Klammern, IN, NOT IN und NOT:

```perspective-query
(bereich = "Privat" AND tags IN ("rot", "rund")) OR NOT status = "erledigt"
```

Mehrzeiliger Body mit Ungleichheit und NOT IN:

```perspective-query
bereich != "Archiv"
AND tags NOT IN ("intern", "entwurf")
```

Ein Syntaxfehler bleibt ebenfalls ein Platzhalter (die Auswertung erfolgt erst im Renderer):

```perspective-query
bereich =
```

Klausel-Form mit Tabellen-Ausgabe, Quellen, Sortierung und Limit:

```perspective-query
TABLE status AS "Status", file.mtime
FROM "Projekte" AND #aktiv
WHERE file.mtime >= date(today) - dur(30 days)
SORT file.mtime DESC, file.name
LIMIT 20
```

Mehrspaltige Ergebnis-Liste:

```perspective-query
LIST FROM #lesezeichen COLUMNS 3
```

Block-Ebene (Scope-Zusatz BLOCKS, 3E-000077):

```perspective-query
LIST BLOCKS WHERE status = "offen" SORT updated DESC
```

```perspective-query
TABLE BLOCKS status AS "Status", updated
FROM "Projekte"
WHERE prio > 2
```
