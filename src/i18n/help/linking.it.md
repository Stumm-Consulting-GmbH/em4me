# Collegamenti

Wiki link, ancore, incorporamenti e tag collegano i file Markdown in una rete. Gli esempi di questa pagina mostrano la sintassi; le loro destinazioni non esistono nel manuale, nei tuoi file i collegamenti aprono il file di destinazione come scheda.

## Wiki link

`[[Destinazione]]` collega un file tramite il nome, senza percorso e senza estensione; la ricerca copre la cartella del file e fino a due livelli di sottocartelle. L'estensione `.md` può essere omessa o scritta.

```markdown
[[Piano di progetto]] apre piano di progetto.md dall'ambito di ricerca.
[[Piano di progetto|il piano]] mostra un testo personalizzato.
```

Se il nome non trova direttamente un file, si applicano due ripieghi: il riscontro dell'indice sull'ambito di ricerca e la [risoluzione degli alias](frontmatter.md) tramite il campo frontmatter `aliases:`; con più candidati chiede una finestra di selezione. Nelle celle delle tabelle pipe, escapare la barra del testo visualizzato come `\|`.

## Ancore di intestazione e di blocco

I collegamenti possono puntare a un'intestazione o a un blocco nel file di destinazione:

```markdown
[[Piano di progetto#Milestone]]      salta all'intestazione
[[Piano di progetto#^decisione-1]]   salta all'ancora di blocco
[[#Wiki link]]                       ancora nello stesso documento
```

Le ancore di blocco si impostano con `^id` a fine riga e ancorano il blocco circostante (paragrafo, voce di elenco, tabella, blocco di codice):

```markdown
Questa decisione è vincolante. ^decisione-1
```

L'ancora si presenta in modo diverso a seconda della vista. La vista renderizzata non la mostra affatto: lì il blocco è soltanto una destinazione di salto. La **modalità dal vivo** la sostituisce con un segno discreto a fine riga: passando il puntatore viene indicato l'identificativo e, con un clic, il cursore si porta a fine riga e il testo originale si apre per la modifica. Se il cursore si trova già in quella riga, l'ancora resta visibile come di consueto. Che la modalità dal vivo mostri più della vista renderizzata è voluto: un'ancora è un indirizzo verso cui puntano altri documenti e, riorganizzando un documento, deve restare visibile che esiste. Se lo stesso blocco porta [proprietà](block-properties.md), il loro segno compare accanto.

Le destinazioni di ancora rotte vengono segnalate dal [linter Markdown](tools.md) nell'editor.

## Collegamenti Markdown a file

Anche i collegamenti Markdown classici aprono destinazioni `.md` come scheda; le ancore funzionano allo stesso modo. I collegamenti di àncora interni saltano dentro la pagina — dal vivo qui: [al capitolo Tag](#tag).

```markdown
[Piano](sottocartella/piano-di-progetto.md#milestone)
```

## Nomi di file con spazi

Se un nome di file contiene spazi, la notazione dipende dal tipo di collegamento. I wiki link portano lo spazio direttamente:

```markdown
[[La mia nota]]
```

I collegamenti Markdown e immagine mettono la destinazione tra parentesi angolari oppure codificano lo spazio come `%20`:

```markdown
[Testo](<La mia nota.md>)
![Alt](<Immagine 01.png>)
[Testo](La%20mia%20nota.md)
```

Uno spazio grezzo senza parentesi angolari termina la destinazione, per cui il collegamento non viene riconosciuto (CommonMark). Quando rinomini un file, l'aggiornamento dei collegamenti scrive le destinazioni con spazi nella forma `<…>`; le destinazioni già codificate con `%` mantengono la loro forma.

## Incorporamenti wiki

`![[Destinazione]]` incorpora contenuti invece di collegare:

```markdown
![[immagine.png]]          immagine, con larghezza opzionale: ![[immagine.png|300]]
![[note.md]]               file Markdown come blocco renderizzato
![[manuale.pdf]]           PDF nel visualizzatore interattivo
![[note.md#Capitolo]]      solo la sezione sotto l'intestazione
![[note.md#^blocco]]       solo il blocco ancorato
```

Con le ancore di blocco viene incorporato l'intero blocco circostante (voce di elenco con sotto-elenchi, blocco di codice, riga di tabella, citazione). Il Markdown incorporato si renderizza con la propria sorgente come base; i collegamenti al suo interno si risolvono rispetto al file incorporato.

**Dove viene cercata la destinazione.** L'applicazione cerca in tre passaggi, allo stesso modo per ogni tipo di file: prima il percorso relativo al proprio file, poi la scrittura delle sottopagine, infine il semplice **nome** nell'intera area. Così `![[immagine.png]]` trova il file anche se si trova in un'altra cartella: non occorre indovinare il percorso. La ricerca termina alla radice dell'area: ciò che sta fuori non viene incorporato. Senza un'area collegata il limite resta la cartella del proprio file.

Se un file Markdown porta lo stesso nome di un allegato, vince il file Markdown; scritto con la sua estensione (`![[immagine.png]]`) il caso è inequivocabile. Le immagini Markdown ordinarie `![](percorso.png)` non sono interessate: la loro scrittura indica un percorso e non un nome.
## Collegamenti tra aree

Due aree possono essere collegate affinché un riferimento superi il confine dell’area. Si imposta in **Impostazioni → Area corrente → Collegamenti tra aree**: vi si indicano la cartella dell’altra area e un **prefisso** con cui quell’area verrà richiamata.

Il prefisso vale **solo in quest’area e solo in questa direzione**. Il modo in cui l’altra area richiama questa si imposta lì e può essere diverso. Sono ammessi lettere, cifre, trattino e trattino basso; maiuscole e minuscole non contano.

Nel testo il prefisso precede la destinazione:

```markdown
[[@zt:Nota]]             file «Nota» nell’area collegata «zt»
[[@zt:Cartella/Nota]]    destinazione tramite il suo percorso
[[@zt:Nota#Capitolo]]    con ancora, come in ogni collegamento wiki
[[@zt:Nota|Etichetta]]   con un testo visualizzato diverso
```

La destinazione viene cercata prima al percorso indicato e, se lì non c’è nulla, per nome in tutta l’area collegata — come un normale collegamento wiki nella propria area. Il clic apre la destinazione nella stessa finestra.

**I modelli dell’area collegata** possono essere proposti accanto ai propri; esiste un interruttore per ciascun collegamento. La scelta dei modelli mostra allora entrambi gli insiemi, e ogni voce esterna indica la sua provenienza. Senza l’interruttore un collegamento non modifica l’insieme dei modelli.

### Quando un’area collegata non si trova

All’apertura un’area verifica i suoi collegamenti, e un esito non impedisce mai l’apertura:

- **La cartella è stata spostata**: la posizione superiore è raggiungibile, la cartella no. Un avviso chiede il nuovo percorso. Finché manca, i riferimenti con quel prefisso valgono come non validi e vengono segnalati nell’editor.
- **La posizione di archiviazione non è raggiungibile**, ad esempio perché un’unità è scollegata. Allora compare solo un avviso: il collegamento resta e **nulla** viene segnalato come non valido. Un’unità scollegata non distrugge mai un collegamento.

Il nuovo percorso si inserisce nello stesso punto in cui è definito il collegamento.

### Che cosa non supera il confine

Un collegamento tra aree porta **là**, non indietro. Non superano deliberatamente il confine:

- i **collegamenti in entrata**: mostrano solo riferimenti interni alla propria area,
- l’indicatore **«file senza riferimenti in entrata»** delle statistiche dell’area,
- la **vista a grafo**,
- la **ricerca sull’intera area**,
- e l’**aggiornamento dei collegamenti alla rinomina**: rinominando un file, i riferimenti provenienti da un’area collegata restano invariati. L’editor li segnala poi come non validi — è la rete che li rende visibili.

I collegamenti tra aree sono un’[estensione](extensions.md) e possono essere disattivati. Un riferimento con prefisso resta allora non risolto, la verifica all’apertura non avviene e i collegamenti inseriti rimangono: ciò che si disattiva è l’effetto, non l’indicazione.

## Tag

`#tag` nel testo e il campo `tags:` del [frontmatter](frontmatter.md) vengono riconosciuti come tag; le barre creano gerarchie come `#progetto/markdown`. I tag sono cliccabili nella vista Lettura e nella modalità Live e filtrano la barra laterale dei tag. I codici colore esadecimali, i numeri puri, i collegamenti di àncora e i cancelletti all’interno di un indirizzo web sono esclusi dal riconoscimento: in `https://example.org/#capitolo`, `#capitolo` fa parte dell’indirizzo e non è un tag.

```markdown
Stato: #progetto/markdown #review
```

### Rinominare un tag

Un clic destro su una voce della barra laterale dei tag rinomina il tag in tutte le sue occorrenze dell’area: sia nel testo sia nel campo `tags:`, in tutti i file, compresi quelli non aperti.

**I sottotag seguono.** Se `#progetto` diventa `#lavoro`, allora `#progetto/markdown` diventa `#lavoro/markdown`. È voluto e non un effetto collaterale: le interrogazioni trattano un tag come prefisso dei suoi figli, e una rinomina senza di essi spezzerebbe proprio quelle interrogazioni. Un tag che comincia soltanto con la stessa parola resta intatto: `#progettile` non è figlio di `#progetto`, manca la barra.

**L’anteprima precede ogni scrittura.** Elenca ogni occorrenza con la sua riga, segnala i sottotag che seguono e consente di deselezionarne alcune. Solo la conferma nella barra sopra l’elenco scrive qualcosa; annullare lascia tutto com’era.

La scrittura resta entro il confine dell’area e lo stato precedente di ogni file modificato finisce nella [cronologia delle versioni](history.md), che la cronologia sia attiva o meno. Un file con modifiche non salvate riceve la rinomina nella sua scheda anziché su disco; un resoconto finale nomina ogni file e, dove qualcosa non è riuscito, il motivo.

## Completamento automatico

Durante la digitazione in modalità modifica si apre un menu di suggerimenti:

- `[[` propone nomi di file e alias,
- `[[File#` ancore di intestazione, `[[File#^` ID di blocco,
- `#` nel testo tag conosciuti.

Le frecce navigano, Invio o Tab seleziona, Esc chiude.

Finché dopo `[[` non si digita nulla, i file dell'area modificati più di recente stanno in cima, il più recente per primo. Non appena si filtra, torna a guidare la qualità della corrispondenza; la data di modifica decide allora solo fra suggerimenti di pari rango.

Dopo `#`, i tag assegnati più spesso nell’area stanno in cima, il più frequente per primo; anche qui comanda la qualità della corrispondenza non appena si digita qualcosa, e la frequenza decide allora fra pari. Il numero dietro ogni suggerimento la indica.

Accettando un suggerimento di file o di secondo nome vengono scritte anche le parentesi di chiusura e il cursore resta dietro. Se ci sono già, non compare una seconda coppia.

## Barre laterali della rete

Tre sezioni della barra laterale mostrano la rete del file attivo: **Backlink** (collegamenti in entrata, incluso «via alias»), **Collegamenti in uscita** (tutti i riferimenti in uscita nell'ordine del documento) e **Tag** (tutti i tag dell'ambito di ricerca con la frequenza). Gli accessi sono elencati nella [tabella delle funzionalità](functions.md).

## Inserire un indirizzo in una selezione

Quando è selezionato del testo e gli appunti contengono un singolo indirizzo, incollando si crea un link da entrambi invece di sostituire la selezione. La selezione `Pagina del progetto` insieme all’indirizzo `https://example.org` diventa:

```markdown
[Pagina del progetto](https://example.org)
```

Se l’indirizzo contiene spazi o parentesi, la destinazione viene scritta tra parentesi angolari; un indirizzo `www.` riceve il prefisso `https://`:

```markdown
[Voce](<https://example.org/Titolo_(Extra)>)
```

Senza selezione, con un contenuto degli appunti non riconoscibile come singolo indirizzo e all’interno delle aree di codice sorgente si applica l’incollaggio normale. Un singolo passo di annullamento ripristina completamente lo stato precedente. L’accesso e l’interruttore sono riportati nella [tabella delle funzioni](functions.md).
