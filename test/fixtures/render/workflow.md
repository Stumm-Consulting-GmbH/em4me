---
workflow: true
name: Neues Projekt
---

# Workflow-Block

Der Block färbt Schlüsselwort, Text und Platzhalter; Kommentar und fehlerhafte
Zeilen bleiben ungefärbt, HTML im Text bleibt geschützt.

```workflow
# Projekt anlegen
mkdir "Projekte/{{prompt:Name}}"
create "Projekte/{{prompt:Name}}/Start.md" from-template "Vorlagen/Projekt.md"
append "{{file}}" from-section "Notiz"
set-property "{{file}}" status "aktiv"
notify "Projekt \"{{prompt:Name}}\" angelegt <b>fertig</b>"
move "a.md""b.md"
wait 2
```

Ein gewöhnlicher Code-Block bleibt unverändert:

```js
create("x");
```
