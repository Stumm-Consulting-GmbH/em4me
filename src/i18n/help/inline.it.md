# Costrutti in linea

Marcature all'interno di una riga, oltre grassetto/corsivo. Sintassi come blocco di codice, risultato sotto.

## Evidenziazione

```markdown
Evidenziare ==l'essenziale==; \== resta testo semplice.
```

Evidenziare ==l'essenziale==; \== resta testo semplice.

## Pedice e apice

Pedice con `~…~`, apice con `^^…^^` (doppio caret, perché il `^` singolo è occupato da note a piè di pagina e ancore di blocco).

```markdown
H~2~O e x^^2^^
```

H~2~O e x^^2^^

## Sottolineatura

```markdown
++testo sottolineato++
```

++testo sottolineato++

## Spoiler

Testo nascosto, rivelato al passaggio del mouse o con il focus da tastiera. Nelle celle delle tabelle pipe, escapare le barre come `\|`, altrimenti la separazione delle celle taglia lo spoiler.

```markdown
La risposta: ||42||
```

La risposta: ||42||

## Critic Markup

Tracciamento delle modifiche con cinque forme: inserimento, cancellazione, sostituzione, evidenziazione, commento.

```markdown
{++inserito++} {--cancellato--} {~~vecchio~>nuovo~~} {==evidenziato==} {>>commento<<}
```

{++inserito++} {--cancellato--} {~~vecchio~>nuovo~~} {==evidenziato==} {>>commento<<}

## Commenti

Il testo tra i marcatori `%%` è un commento privato: resta nel sorgente, ma non appare in nessuna vista renderizzata né in alcuna esportazione. I commenti funzionano all'interno di una riga e su più righe; un `%%` di apertura senza chiusura agisce fino alla fine del documento. Nei blocchi di codice e negli span di codice, `%%` resta testo ordinario; `\%%` produce un `%%` letterale nel testo corrente (ogni marcatore si escapa singolarmente). Nell'editor, le zone di commento sono colorate con discrezione (viste sorgente e live). Il commento Critic Markup visibile `{>>…<<}` della sezione precedente è indipendente da questo: serve alla concertazione e viene renderizzato, mentre il commento `%%` resta privato.

```markdown
Testo visibile %%commento privato%% e la frase continua.

%%
Commento su più righe: tutto fino al
marcatore di chiusura resta privato.
%%
```

Questa riga dimostra il comportamento dal vivo; tra «qui» e «là» c'è un commento: qui %%invisibile ai lettori%% là.

## Span e attributi di intestazione

Span in linea con attributi: `[testo]{.classe #id}`; sono ammessi solo `id` e `class`. Le intestazioni ricevono un'ancora propria con `{#mio-id}`, che prevale sull'ancora automatica (utile per collegamenti stabili quando i titoli cambiano, vedi [Collegamenti](linking.md)).

```markdown
Una [sezione marcata]{#span-demo} nel testo corrente.

### Titolo con ID fisso {#id-fisso}
```

Una [sezione marcata]{#span-demo} nel testo corrente.

### Titolo con ID fisso {#id-fisso}

## Abbreviazioni

Riga di definizione `*[sigla]: testo esteso`; ogni occorrenza della sigla riceve una sottolineatura punteggiata con il testo esteso come tooltip (passare il mouse sulla sigla).

```markdown
*[HTML]: Hyper Text Markup Language

L'app genera HTML durante il rendering.
```

*[HTML]: Hyper Text Markup Language

L'app genera HTML durante il rendering.

## Calcoli in linea

Espressioni di calcolo tra `{=` e `=}` in qualsiasi punto del testo corrente: la vista renderizzata, la modalità dal vivo e le esportazioni mostrano il **risultato**, il sorgente conserva l'espressione; l'espressione grezza appare come tooltip (passare il mouse sul risultato). In modalità dal vivo, la riga del cursore mostra l'espressione grezza per la modifica; un clic sul risultato vi colloca il cursore. Il calcolo usa il linguaggio di espressioni della [Query Perspective](frontmatter-query.md): numeri, parentesi, stringhe, valori di data e durata nonché il catalogo di funzioni. Gli accessi ai campi (ad es. `file.name`) non sono disponibili nei calcoli in linea.

```markdown
Somma {= 2+3*4 =}, Data {= date(2026-01-01) + dur(30d) =}, Testo {= upper('abc') =}
```

Somma {= 2+3*4 =}, Data {= date(2026-01-01) + dur(30d) =}, Testo {= upper('abc') =}

Regole e particolarità:

- **Operatori**: `+`, `-`, `*`, `/` con la precedenza consueta e parentesi; i confronti `=`, `!=`, `<`, `<=`, `>`, `>=` nonché `AND`, `OR`, `NOT` danno `true`/`false`. Tra numeri, il meno richiede uno spazio (`4 - 1`, non `4-1` — quest'ultimo viene letto dal linguaggio di espressioni come un nome di campo).
- **Data e durata**: `date(...)` e `dur(...)` come nel linguaggio della query; data ± durata dà una data, data − data una durata.
- **Funzioni**: il catalogo di funzioni del linguaggio della query (`number`, `string`, `lower`, `upper`, `length`, `startswith`, `endswith`, `contains`, `default`, `choice`, `dateformat`, `days`, `numberformat`, `currencyformat`, `sum`, `min`, `max`, `average`). Le funzioni che richiedono un riferimento a un file qui non hanno effetto: non c'è alcun documento a cui riferirsi.
- **Errore**: un'espressione non valutabile mostra un discreto ⚠︎ con l'avviso di errore nel tooltip; il sorgente resta invariato.
- **Escape**: `\{=` produce un `{=` letterale nel testo corrente.

```markdown
Confronto {= 10/4 >= 2 =}, Condizione {= choice(1 = 2, 'sì', 'no') =}, Errore {= 2+ =}
```

Confronto {= 10/4 >= 2 =}, Condizione {= choice(1 = 2, 'sì', 'no') =}, Errore {= 2+ =}
