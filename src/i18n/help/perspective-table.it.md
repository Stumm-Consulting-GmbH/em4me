# Perspective Table

Perspective Table è un'estensione dello standard Markdown disponibile in questo viewer. Permette **tabelle con celle-blocco multilinea**: elenchi annidati, più paragrafi, blocchi di codice e immagini all'interno di una singola cella. Le tabelle Markdown standard (sintassi pipe) sono basate sulla riga e non lo consentono.

La sintassi è una notazione propria basata su righe. È integrata come blocco di codice delimitato con il tag di linguaggio `perspective-table`. In altre applicazioni Markdown il blocco rimane visibile come blocco di codice leggibile — degradazione elegante invece di sorgente rotta.

## Sintassi di base

| Simbolo | Significato                                         |
|---------|-----------------------------------------------------|
| `{\|`   | Inizio tabella (prima riga del blocco di codice)    |
| `\|+`   | Didascalia opzionale della tabella                  |
| `\|-`   | Separatore tra le righe della tabella               |
| `!`     | Cella di intestazione                               |
| `\|`    | Cella dati                                          |
| `\|}`   | Fine tabella                                        |

Una cella inizia all'inizio di una riga sorgente con `|` o `!`. Le righe successive senza marcatori appartengono alla cella corrente. Si ottengono così celle multilinea senza marcatura per riga.

## Esempio minimo

Sorgente:

````markdown
```perspective-table
{|
|+ Tre varianti a confronto
|-
! Variante
! Prezzo
|-
| Base
| 10 EUR
|-
| Premium
| 50 EUR
|}
```
````

Risultato:

```perspective-table
{|
|+ Tre varianti a confronto
|-
! Variante
! Prezzo
|-
| Base
| 10 EUR
|-
| Premium
| 50 EUR
|}
```

## Esempio esteso con elenchi e blocco di codice

Una cella contiene un elenco annidato, un'altra un blocco di codice. La recinzione esterna usa **quattro apici inversi** affinché il blocco di codice interno a tre apici inversi resti valido.

Sorgente:

`````markdown
````perspective-table
{|
|-
! Fase
! Attività
|-
| Progettazione
| Raccolta dei requisiti:

- Chiarire la struttura principale
  - Campi obbligatori
  - Campi opzionali
- Schizzo del layout
- Revisione con gli stakeholder
|-
| Realizzazione
| Scheletro del codice:

```bash
mkdir src
npm init -y
```
|}
````
`````

Risultato:

````perspective-table
{|
|-
! Fase
! Attività
|-
| Progettazione
| Raccolta dei requisiti:

- Chiarire la struttura principale
  - Campi obbligatori
  - Campi opzionali
- Schizzo del layout
- Revisione con gli stakeholder
|-
| Realizzazione
| Scheletro del codice:

```bash
mkdir src
npm init -y
```
|}
````

## Span e allineamento

Le celle possono avere attributi per estendersi su più colonne o righe e per allineare il contenuto della cella.

### Panoramica degli attributi

| Attributo | Valori consentiti              | Effetto                                                       |
|-----------|--------------------------------|---------------------------------------------------------------|
| `colspan` | intero positivo                | La cella si estende su più colonne                            |
| `rowspan` | intero positivo                | La cella si estende su più righe                              |
| `align`   | `left` / `center` / `right`    | Allineamento orizzontale del contenuto della cella            |
| `valign`  | `top` / `middle` / `bottom`    | Allineamento verticale in celle-blocco multilinea             |

Gli attributi si trovano tra due barre verticali all'inizio della cella: `| attr="val" attr="val" | contenuto`.

### Esempio con colspan, rowspan e align

Sorgente:

````markdown
```perspective-table
{|
|+ Stima dell'impegno
|-
! Area
! Attività
! align="right" | Ore
|-
| rowspan="2" | Progettazione
| Raccolta dei requisiti
| align="right" | 8
|-
| Bozza del layout
| align="right" | 4
|-
| colspan="2" align="center" | Subtotale
| align="right" | 12
|}
```
````

Risultato:

```perspective-table
{|
|+ Stima dell'impegno
|-
! Area
! Attività
! align="right" | Ore
|-
| rowspan="2" | Progettazione
| Raccolta dei requisiti
| align="right" | 8
|-
| Bozza del layout
| align="right" | 4
|-
| colspan="2" align="center" | Subtotale
| align="right" | 12
|}
```

### Suggerimenti su span e allineamento

- Gli attributi possono apparire in qualsiasi ordine: `| colspan="2" align="center" | contenuto` e `| align="center" colspan="2" | contenuto` sono equivalenti.
- I valori non validi vengono ignorati silenziosamente (ad esempio `colspan="abc"`, `align="sopra"`).
- Le celle senza blocco di attributi vengono renderizzate come celle normali.

### Accessibilità

Le celle di intestazione (`!`) ricevono automaticamente l'attributo `scope` appropriato: `scope="col"` per le intestazioni nella riga di intestazione, `scope="row"` per le intestazioni all'interno delle righe di dati. Questo permette ai lettori di schermo di associare le celle di dati con le loro intestazioni.

## Tabelle annidate ed esportazione HTML

Le tabelle Perspective possono essere annidate l'una nell'altra, e un file con tabelle Perspective può essere esportato come «Markdown portabile» con tabelle HTML inline, in modo che venga visualizzato come una vera tabella anche in altre applicazioni Markdown.

### Tabelle annidate

Una cella può a sua volta contenere una tabella Perspective — fino a tre livelli di profondità. Importante: ogni recinzione di codice esterna deve avere almeno un apice inverso in più rispetto alla successiva interna (standard CommonMark).

| Livello | Recinzione esterna       | Contenuto di esempio                                                                                  |
|---------|--------------------------|-------------------------------------------------------------------------------------------------------|
| 1       | tre apici inversi        | solo la tabella, senza blocco di codice annidato                                                      |
| 2       | quattro apici inversi    | tabella con una tabella interna (tre apici inversi)                                                   |
| 3       | cinque apici inversi     | tabella con una tabella interna (quattro apici inversi) che a sua volta contiene una tabella (tre apici inversi) |

Un quarto livello non viene più reso come tabella ma come blocco di codice (protezione tramite limite di profondità).

Esempio sorgente con due livelli:

`````markdown
````perspective-table
{|
|+ Tabella esterna
|-
| Impegno per posizione
| ```perspective-table
{|
|-
! Posizione
! Ore
|-
| Requisiti
| 8
|}
```
|}
````
`````

Risultato:

````perspective-table
{|
|+ Tabella esterna
|-
| Impegno per posizione
| ```perspective-table
{|
|-
! Posizione
! Ore
|-
| Requisiti
| 8
|}
```
|}
````

### Esportazione HTML per renderer Markdown di terze parti

I file `.md` con tabelle Perspective vengono visualizzati come tabelle solo in questo viewer. In altre applicazioni Markdown il blocco di codice `perspective-table` appare invariato come testo sorgente.

Con **File → Esporta → Markdown portabile…** salvi una variante del file in cui le tabelle Perspective sono sostituite da tabelle HTML inline. Queste tabelle HTML vengono visualizzate come tabelle reali in praticamente qualsiasi applicazione Markdown.

- **Finestra di dialogo Salva con nome** con preimpostazione `<nomebase>-portable.md` nella directory del file sorgente. Percorso e nome sono liberamente modificabili.
- **Il file originale** rimane invariato; l'esportazione scrive sempre in un nuovo file.
- **Le formule KaTeX** (`$...$`) nelle celle restano come codice sorgente all'esportazione — l'HTML KaTeX renderizzato apparirebbe rotto senza il foglio di stile KaTeX.
- **Attributi di cella** (`colspan`, `rowspan`, `align`, `valign`) vengono tradotti in attributi HTML standard e stili inline.
- **L'attributo `scope`** di accessibilità sulle celle di intestazione viene preservato.
- **Annidamento**: fino a tre livelli vengono convertiti ricorsivamente.
- **Formattazione inline nelle celle** (grassetto, corsivo, codice, link) viene convertita in HTML per apparire correttamente anche nei renderer di terze parti.

#### Marcatore per la visualizzazione nel viewer

Affinché il file esportato venga visualizzato **anche come tabella nel viewer EM4me** (invece di come testo sorgente con tag `<table>`), il convertitore inserisce il marcatore `<!-- perspective-portable -->` all'inizio del file. Il viewer riconosce questo marcatore e passa il file in una modalità di rendering compatibile con HTML.

**Nota di sicurezza**: i file `.md` regolari continuano ad aprirsi senza rendering HTML — nessun HTML dal Markdown viene eseguito. Solo il marcatore sblocca il rendering HTML. Per un file `.md` di terze parti che porta questo marcatore (caso limite), devi fidarti della fonte, perché il contenuto HTML lì verrebbe eseguito.

## Ordinamento, evidenziazione dello stato e allineamento predefinito

Le tabelle Perspective possono essere colorate con classi di stato per cella o riga, ricevere un allineamento predefinito per colonna e essere ordinate cliccando sull'intestazione della colonna.

### Evidenziazione dello stato

Prima del contenuto di una cella o direttamente dopo `|-`, può apparire una classe di stato in notazione punto:

| Classe     | Significato                         |
|------------|-------------------------------------|
| `.error`   | Errore, critico                     |
| `.warn`    | Avviso, attenzione                  |
| `.ok`      | OK, fatto, positivo                 |
| `.info`    | Indicazione, neutro-informativo     |
| `.neutral` | Contrassegno senza valutazione      |

- **Cella**: `|.error contenuto`
- **Riga** (si applica a tutte le celle della riga): `|-.warn`
- **Lo stato della cella prevale** su quello della riga.
- I valori non validi vengono ignorati silenziosamente.

Esempio:

```perspective-table
{|
|-
! Servizio
! Stato
|-.warn
| Servizio mail
| Manutenzione
|-
| Server web
|.error Down
|-
| Database
|.ok In esecuzione
|}
```

### Allineamento predefinito per colonna

Nella riga di intestazione della tabella, `cols="…"` imposta un allineamento predefinito per colonna:

- Sintassi: `{|+cols="left right right"`
- Valori: `left`, `center` o `right`.
- Una cella con un attributo `align` esplicito (dalla fase 2) sovrascrive il valore predefinito.
- Per `colspan` non si applica alcun valore predefinito (la cella si estende su più colonne).

Esempio:

```perspective-table
{|+cols="left right right"
|-
! Prodotto
! Prezzo
! Stock
|-
| Tastiera
| 49
| 12
|-
| Mouse
| 25
| 8
|-
| Monitor
| 280
| 3
|}
```

### Tabelle ordinabili

`+sortable` nella riga di intestazione rende la tabella ordinabile al clic:

- Sintassi: `{|+sortable` (combinabile con `cols=`: `{|+sortable cols="left right"`)
- Clic su un'intestazione: ordina crescente, secondo clic: decrescente, terzo clic: ripristina l'ordine originale.
- **Euristica di ordinamento**: prima numerica (`Number()` sulla prima riga della cella), altrimenti lessicografica con locale (`localeCompare`, accenti ordinati correttamente).
- **Celle multilinea**: ordinate sulla prima riga.
- **Date**: il formato ISO (2026-05-19) si ordina correttamente in modo lessicografico. Convertire altri formati di data in ISO.
- **`colspan`/`rowspan` disattivano automaticamente l'ordinamento** (rischio di layout troppo alto).
- **Nell'esportazione portabile** l'ordinamento non è incluso (nessun JavaScript nei renderer Markdown di terze parti).

Esempio:

```perspective-table
{|+sortable
|-
! Nome
! Età
! Città
|-
| Mueller
| 42
| Berlino
|-
| Schmidt
| 28
| Amburgo
|-
| Becker
| 35
| Monaco
|}
```

## Modifica tramite il menu contestuale

Un clic destro nel blocco apre il sottomenu **Tabella** nel [Menu contestuale dell'editor](context-menu.md). Le operazioni sulle righe (spostare, inserire, eliminare) lavorano sulle sezioni `|-` e conservano invariato il testo grezzo delle celle, inclusi gli attributi, le classi di stato e i contenuti multilinea; sono sempre possibili, anche in presenza di span.

Le operazioni sulle colonne e la trasposizione spostano interi blocchi di celle (riga di marcatore più righe successive) e sono disponibili solo senza `colspan`/`rowspan` — con gli span l'assegnazione delle colonne sarebbe ambigua, quindi l'operazione viene rifiutata con un avviso nella barra di stato. Durante la trasposizione, la riga di intestazione diventa la prima colonna; i marcatori di cella (`!` o `|`) si spostano con le loro celle.

Le voci di allineamento impostano l'allineamento predefinito della colonna nell'attributo `cols` della riga `{|` (vedi la sezione «Allineamento predefinito per colonna»); le colonne senza valore ricevono il carattere segnaposto `-`, e gli attributi `align` delle singole celle rimangono intatti.

## Suggerimenti

**`|-` è obbligatorio tra le righe della tabella.** Senza `|-`, le celle `|` successive vengono interpretate come ulteriori celle della stessa riga, non come una nuova riga. Inciampo più frequente all'inizio.

**Recinzione esterna a quattro apici inversi** quando una cella contiene un blocco di codice a tre apici inversi. Altrimenti il blocco di codice interno chiude prematuramente la recinzione esterna.

**Una cella per inizio di riga sorgente.** Le righe successive senza `|`, `!`, `|-` o `|}` iniziali appartengono alla cella corrente.

**Lo spazio bianco** all'inizio e alla fine di una cella viene rimosso al rendering. L'indentazione degli elenchi all'interno della cella viene preservata.

**Formattazione inline, link wiki e immagini** funzionano nelle celle come ovunque altrove (`**grassetto**`, `*corsivo*`, `` `codice` ``, `[[Link-wiki]]`, `![alt](immagine.png)`).

## Portabilità

I file `.md` con blocchi `perspective-table` si visualizzano come tabelle solo in questo viewer. In altre applicazioni Markdown il blocco appare come un normale blocco di codice. È una scelta di progettazione deliberata, non un bug — il contenuto resta leggibile ovunque invece di apparire come sorgente sintatticamente rotta.

## Stato delle funzioni

L'insieme di funzioni previsto per le tabelle Perspective è ora completo: sintassi di base, span e allineamento, annidamento ed esportazione HTML, ordinamento, evidenziazione dello stato e allineamento predefinito, nonché le operazioni di modifica tramite il menu contestuale.
