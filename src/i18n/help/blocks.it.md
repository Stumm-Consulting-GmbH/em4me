# Costrutti di blocco

Estensioni di blocco oltre il nucleo Markdown. Ogni capitolo mostra la sintassi come blocco di codice e il risultato renderizzato subito sotto; la vista divisa li affianca.

## Callout

Riquadri di avviso: `> [!tipo]` come prima riga di una citazione, con titolo personalizzato opzionale. Dieci tipi con icona e colore d'accento propri: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `example`, `quote`. I tipi sconosciuti vengono segnalati dal [linter Markdown](tools.md).

```markdown
> [!tip] Titolo personalizzato
> Contenuto del riquadro, Markdown normale consentito.
```

> [!tip] Titolo personalizzato
> Contenuto del riquadro, Markdown normale consentito.

Un `+` o `-` dopo il tipo rende il callout richiudibile: `+` parte aperto, `-` compresso — l'apertura e chiusura funziona anche qui nel manuale.

```markdown
> [!note]- Parte compresso
> Visibile solo dopo un clic sul titolo.
```

> [!note]- Parte compresso
> Visibile solo dopo un clic sul titolo.

## Contenitori personalizzati

Blocchi contenitore tra `::: tipo` e `:::`. I dieci tipi di callout appaiono in stile callout, i nomi sconosciuti come riquadro neutro con il nome come titolo.

```markdown
::: warning
Contenuto in stile callout.
:::
```

::: warning
Contenuto in stile callout.
:::

## Blocco multicolonna

Un contenitore `::: columns <n>` mostra il contenuto racchiuso su più colonne; sono validi valori da 2 a 5. Il testo scorre in modo automatico ed equilibrato sulle colonne; una riga `+++` forza il passaggio alla colonna successiva. Numeri di colonne non validi (assente, 1, più di 5, non numerico) ricadono sul riquadro neutro; fuori da un blocco multicolonna `+++` non ha effetto.

```markdown
::: columns 2
Prima colonna con testo scorrevole.

+++

La seconda colonna inizia qui.
:::
```

::: columns 2
Prima colonna con testo scorrevole.

+++

La seconda colonna inizia qui.
:::

I contenuti larghi (tabelle, diagrammi, righe di codice lunghe) possono debordare da una colonna; nei blocchi molto corti il bilanciamento automatico può apparire disuguale. Nella modalità Live il blocco appare come contenitore neutro con le righe marcatore visibili; la disposizione multicolonna vale per la vista renderizzata e l'esportazione PDF.

## Liste di definizioni

Termine su una riga, definizione sotto introdotta da `: `; anche `~` vale come marcatore. Sono possibili più definizioni per termine.

```markdown
Cutover
: Passaggio di un sistema all'esercizio produttivo.

Rollback
: Ritorno allo stato precedente al passaggio.
```

Cutover
: Passaggio di un sistema all'esercizio produttivo.

Rollback
: Ritorno allo stato precedente al passaggio.

## Line block

Le righe che iniziano con `| ` mantengono interruzioni di riga e spazi iniziali — pensato per indirizzi e poesie.

```markdown
| Stumm-Consulting GmbH
|   4410 Liestal
|   Svizzera
```

| Stumm-Consulting GmbH
|   4410 Liestal
|   Svizzera

## Note a piè di pagina

Tre forme: riferimento `[^id]` nel testo con definizione `[^id]: testo` (di solito a fine file), più la forma in linea `^[testo diretto]` senza definizione separata. Il rendering mostra un numero in apice; le definizioni si raccolgono a fine pagina con frecce di ritorno.

```markdown
Un'affermazione con fonte[^1] e una con nota in linea^[annotata direttamente].

[^1]: La definizione vive alla fine del file.
```

Un'affermazione con fonte[^1] e una con nota in linea^[annotata direttamente].

[^1]: La definizione vive alla fine del file.
