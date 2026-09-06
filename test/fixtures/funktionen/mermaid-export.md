# Diagramme im portablen Export

Ein Ablauf:

```mermaid
graph TD;
  A[Start] --> B[Ende];
```

Und noch einer:

```mermaid
graph LR;
  X --> Y;
```

Ein Diagramm mit fehlerhaftem Quelltext:

```mermaid
kaputtdiagramm
  A --> B
```

Ein fremder Code-Block, der unberuehrt bleibt:

```js
const a = 1;
```

Schluss.
