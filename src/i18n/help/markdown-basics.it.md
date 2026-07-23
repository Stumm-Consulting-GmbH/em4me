# Basi di Markdown

L'app renderizza Markdown sulla base dello standard CommonMark, esteso con tabelle, elenchi di attività, barrato e collegamenti automatici. Questa pagina copre il nucleo; i costrutti speciali hanno pagine proprie ([Costrutti di blocco](blocks.md), [Costrutti in linea](inline.md), [Collegamenti](linking.md)).

## Titoli

Sei livelli con `#` fino a `######`; ogni titolo riceve automaticamente un'ancora per collegamenti e sommario.

```markdown
## Capitolo
### Sottocapitolo
```

In alternativa esiste la forma Setext per i livelli 1 e 2: una riga di testo sottolineata con `===` (H1) o `---` (H2).

```markdown
Capitolo in forma Setext
------------------------
```

### Numerazione automatica

I titoli possono essere numerati automaticamente con numeri gerarchici (1, poi 1.1, 1.2, e così via). I numeri appaiono nel riquadro di rendering, nella modalità dal vivo, nella struttura e nelle esportazioni; il testo sorgente resta invariato.

Il controllo avviene su tre livelli che si sostituiscono in questo ordine: il singolo titolo prima del documento, il documento prima dell'impostazione globale. A livello globale, l'impostazione «Numera i titoli» attiva la numerazione e fissa il livello iniziale (H1 o H2). Per documento, la chiave di frontmatter `numbered-headings` sostituisce l'impostazione globale:

```markdown
---
numbered-headings: true
---
```

Per titolo, agisce un marcatore a fine riga: `{-}` esclude un titolo, `{+}` lo include, ciascuno anche contro l'impostazione globale. Una barra rovesciata iniziale protegge il marcatore come testo letterale (`\{-}` appare come `{-}`).

```markdown
## Appendice {-}
## Importante {+}
```

I titoli esclusi non vengono conteggiati e non azzerano i sottocontatori; i loro sottotitoli continuano a contare sotto l'ultimo titolo numerato. Se un livello viene saltato, per esempio da H1 direttamente a H3, il livello intermedio mancante conta come uno.

## Enfasi

```markdown
**grassetto**, *corsivo*, ~~barrato~~, `codice in linea`
```

**grassetto**, *corsivo*, ~~barrato~~, `codice in linea`

## Elenchi

Elenchi non ordinati con `-`, `*` o `+`, ordinati con `1.`. Un sottoelemento appartiene all'elemento superiore quando inizia dove inizia il contenuto di quest'ultimo: due caratteri sotto `- `, tre sotto `1. `, quattro sotto `10. `.

```markdown
- Primo punto
  - Sottopunto
1. Primo passo
   1. Sottopasso
```

- Primo punto
  - Sottopunto

1. Primo passo
   1. Sottopasso

### Modificare la struttura

In modalità di modifica la struttura si cambia da tastiera. La profondità deriva sempre dall'elemento superiore, non devi contare gli spazi.

- `Alt+Freccia su` e `Alt+Freccia giù` spostano un elemento con tutti i suoi sottoelementi. Il salto attraversa l'intero ramo vicino e il livello resta uguale. Fuori dagli elenchi le scorciatoie spostano la singola riga.
- `Tab` e `Maiusc+Tab` aumentano e riducono il rientro dell'elemento con i suoi sottoelementi. Il rientro si applica solo dove esiste un elemento superiore sotto cui collocare quello corrente.
- Se sono selezionate più righe, entrambi i tasti agiscono esattamente sull'intervallo selezionato.
- Il comando «Seleziona il ramo» marca un elemento con tutto ciò che vi è appeso.

### Numerazione

Gli elenchi numerati si rinumerano da soli nel testo sorgente non appena ci lavori. Il numero iniziale viene mantenuto: un elenco che inizia con `3.` prosegue con `4.`.

Una riga vuota inizia un nuovo elenco. Se nasce dalla tua modifica, l'elenco successivo riparte da 1; se era già presente, il secondo elenco mantiene il proprio numero iniziale. Testo sorgente e visualizzazione mostrano gli stessi numeri.

```markdown
1. Primo elenco
2. Seconda riga

1. Nuovo elenco
2. Seconda riga
```

1. Primo elenco
2. Seconda riga

1. Nuovo elenco
2. Seconda riga

### Proseguire e terminare

Il tasto Invio prosegue un elenco e aggiunge un punto elenco, un numero consecutivo o una casella vuota. Su un sottoelemento vuoto riduce il rientro di un livello; al livello superiore termina l'elenco.

## Tabelle

Tabelle pipe con riga di intestazione e riga separatrice; i due punti nella riga separatrice controllano l'allineamento. Per celle-blocco multilinea c'è [Perspective Table](perspective-table.md), per il comfort di digitazione l'editor di tabelle (vedi [Strumenti](tools.md)). Per ristrutturare tabelle esistenti (spostare, inserire ed eliminare righe e colonne, allineamento, trasposizione), utilizzare il sottomenu **Tabella** nel [Menu contestuale dell'editor](context-menu.md).

```markdown
| Sinistra | Centrato | Destra |
|:---------|:--------:|-------:|
| a        | b        | 12     |
```

| Sinistra | Centrato | Destra |
|:---------|:--------:|-------:|
| a        | b        | 12     |

## Citazione e linea di separazione

```markdown
> Citazione su
> più righe

---
```

> Citazione su
> più righe

---

## Collegamenti e collegamenti automatici

Collegamenti Markdown con `[testo](destinazione)`; gli URL tra parentesi angolari diventano collegamenti automatici. Anche gli URL nudi nel testo vengono riconosciuti, ma il [linter Markdown](tools.md) vi raccomanda la forma esplicita.

```markdown
[Esempio](https://example.org) e <https://example.org>
```

[Esempio](https://example.org) e <https://example.org>

La forma per riferimento separa il punto del collegamento dalla definizione della destinazione:

```markdown
Vedi la [pagina di esempio][ref].

[ref]: https://example.org
```

Vedi la [pagina di esempio][ref].

[ref]: https://example.org

## Interruzioni di riga forzate

Due spazi a fine riga o una barra rovesciata forzano un'interruzione di riga all'interno di un paragrafo.

```markdown
Prima riga\
Seconda riga
```

Prima riga\
Seconda riga

## Codice

In linea con accenti gravi, in blocco con tre accenti gravi; un tag di lingua attiva l'evidenziazione della sintassi (vedi [Matematica e diagrammi](math-diagrams.md)). Vale anche la forma CommonMark «codice indentato»: le righe rientrate di quattro spazi diventano un blocco di codice.

## Tipografia

Il tipografo sostituisce sequenze di caratteri con caratteri tipografici: `--` diventa una lineetta (–), `...` puntini di sospensione (…), le virgolette dritte diventano tipografiche.

```markdown
Un pensiero -- e un altro ...
```

Un pensiero -- e un altro ...
