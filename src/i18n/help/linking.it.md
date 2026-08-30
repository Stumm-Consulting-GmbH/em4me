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

## Tag

`#tag` nel testo e il campo `tags:` del [frontmatter](frontmatter.md) vengono riconosciuti come tag; le barre creano gerarchie come `#progetto/markdown`. I tag sono cliccabili nella vista Lettura e nella modalità Live e filtrano la barra laterale dei tag. I codici colore esadecimali, i numeri puri e i collegamenti di àncora sono esclusi dal riconoscimento.

```markdown
Stato: #progetto/markdown #review
```

## Completamento automatico

Durante la digitazione in modalità modifica si apre un menu di suggerimenti:

- `[[` propone nomi di file e alias,
- `[[File#` ancore di intestazione, `[[File#^` ID di blocco,
- `#` nel testo tag conosciuti.

Le frecce navigano, Invio o Tab seleziona, Esc chiude.

Finché dopo `[[` non si digita nulla, i file dell'area modificati più di recente stanno in cima, il più recente per primo. Non appena si filtra, torna a guidare la qualità della corrispondenza; la data di modifica decide allora solo fra suggerimenti di pari rango.

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
