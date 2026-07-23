# Skript-Block (perspective-script)

Fence rendert als Platzhalter-Container mit dem Quelltext im data-Attribut;
Escaping-kritische Zeichen (`<`, `&`, `"`) müssen maskiert sein.

```perspective-script
const x = 1 < 2 && "text";
pq.out('Wert: ' + x);
```

Danach normaler Fließtext.
