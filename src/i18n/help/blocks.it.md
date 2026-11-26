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

Maiuscole e minuscole nel tipo non contano: `[!note]`, `[!Note]` e `[!NOTE]` producono lo stesso riquadro con la stessa icona, lo stesso colore d'accento e lo stesso titolo predefinito; `+`, `-` e un titolo personalizzato funzionano allo stesso modo. Il testo nel file resta come è stato scritto: le maiuscole riprese da altri programmi Markdown non vengono riscritte. L'elenco dei dieci tipi resta lo stesso: i nomi che non ne fanno parte, come `[!IMPORTANT]`, sono tipi sconosciuti in qualsiasi grafia.

```markdown
> [!WARNING]
> In maiuscolo — lo stesso riquadro di `[!warning]`.
```

> [!WARNING]
> In maiuscolo — lo stesso riquadro di `[!warning]`.

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

Maiuscole e minuscole nel nome non contano: `::: warning`, `::: Warning` e `::: WARNING` producono lo stesso riquadro, `::: Mio-Riquadro` lo stesso riquadro neutro di `::: mio-riquadro`, e `::: COLUMNS 2` distribuisce il contenuto su due colonne come `::: columns 2`. Il testo nel file resta come è stato scritto; un riquadro neutro mostra il nome come titolo così come compare. L'elenco dei dieci tipi di callout resta lo stesso.

```markdown
::: WARNING
In maiuscolo: lo stesso riquadro di `::: warning`.
:::
```

::: WARNING
In maiuscolo: lo stesso riquadro di `::: warning`.
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

## Blocco sommario

Un blocco di codice con l'identificatore `toc` mostra nella sua posizione i titoli del documento come elenco rientrato; ogni voce è un collegamento, e un clic porta al titolo. Una riga `depth: N` nel blocco limita il sommario ai livelli da 1 a N, con valori validi da 1 a 6; senza questa riga compaiono tutti i livelli. Le altre righe e i valori fuori da 1 a 6 restano senza effetto.

````markdown
```toc
depth: 2
```
````

Renderizzato, per questa pagina:

```toc
depth: 2
```

Il sommario segue da solo ogni modifica: i titoli nuovi, rinominati o eliminati vengono aggiornati subito, nella vista renderizzata come nella modalità Live. Le voci portano alle stesse ancore dei collegamenti ai titoli, anche con titoli dallo stesso testo e con ID propri tramite `{#id}`. Se la [numerazione automatica](markdown-basics.md) dei titoli è attiva, i numeri compaiono anche nel sommario. I titoli all'interno di blocchi di codice e nel frontmatter non compaiono. Se il documento non ha alcun titolo, il blocco mostra l'avviso «Questo documento non contiene titoli.». Più blocchi nello stesso documento mostrano lo stesso sommario.

Il blocco si inserisce dal [menu contestuale dell'editor](context-menu.md): **Inserisci → Blocco sommario** colloca un blocco `toc` senza riga `depth:` su una riga a sé; la profondità si aggiunge a mano se serve.

La stampa, l'esportazione PDF e l'esportazione HTML contengono il sommario così come lo mostra la vista renderizzata. L'esportazione portabile lo scrive come normale elenco Markdown con collegamenti ai titoli, senza numeri; un documento senza titoli riceve in quel punto una riga vuota. In una [presentazione](presentation.md) ogni diapositiva viene mostrata a sé; un blocco su una diapositiva elenca i titoli di quella diapositiva.

Il blocco fa parte dell'[estensione interna](extensions.md) «Blocco sommario», attiva a partire dalla modalità di lavoro **Principiante**. Se è disattivata, il blocco compare come un normale blocco di codice con il suo testo, e il menu contestuale non offre **Blocco sommario**; il documento resta invariato e, dopo la riattivazione, il sommario ricompare.

Il pannello «Sommario» della [barra laterale](sidebar.md) ne è indipendente: mostra i titoli del documento aperto accanto al testo e non fa parte del documento. Il blocco, invece, si trova nel documento stesso e compare quindi anche nella stampa e nell'esportazione.
