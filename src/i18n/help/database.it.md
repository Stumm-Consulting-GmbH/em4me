# Banca dati

Un file Markdown può dichiarare di essere una **tabella di banca dati** e indicare quali campi ha questa tabella. La definizione si trova nel frontmatter dello stesso file che porta anche i record; così la tabella è completa in un solo file e sopravvive a ogni operazione sul file, compresi la ridenominazione e lo spostamento al di fuori dell'applicazione.

Distinzione: la [Perspective Datatable](datatable.md) è una tabella tipizzata **all'interno di un documento**, pensata per insiemi piccoli e calcolabili, mentre la tabella di banca dati è una tabella con nome **e file proprio**, ai cui record si rimanda da altri file.

Il formato di definizione è lo stesso dei [Profili di proprietà](property-profiles.md): le stesse indicazioni per campo, la stessa linea morbida in caso di errore. Una definizione di tabella **non** è comunque un profilo di proprietà, e un file di tabella non compare nell'elenco dei profili nelle impostazioni.

## Il file della tabella

Il contenitore `db-table` nel frontmatter designa il file come tabella e porta sotto `fields` una voce per colonna:

```yaml
---
db-table:
  fields:
    - name: titolo
      type: string
      label: Titolo
      required: true
      options:
        maxLength: 120
    - name: pagine
      type: number
      options:
        decimals: 0
    - name: stato
      type: string
      values: [disponibile, in prestito, mancante]
      default: disponibile
    - name: autore
      type: record
      options:
        table: Autori
  key: titolo
  display: titolo
  lastId: 42
---
```

Già la sola **presenza** della chiave rende il file una tabella, indipendentemente dal fatto che il suo contenuto sia utilizzabile. Una tabella con un refuso nella definizione non scompare quindi in silenzio dalla banca dati, ma resta una tabella che segnala un errore.

## Indicazioni per colonna

| Indicazione | Significato |
| --- | --- |
| `name` | **Obbligatorio.** Il nome tecnico della colonna. Resta neutro rispetto alla lingua, perché figura nei rimandi e nell'ordine dei record |
| `type` | uno degli otto tipi di colonna qui sotto; senza indicazione vale `string` |
| `label` | l'etichetta per la visualizzazione, come testo o come corrispondenza da lingua a testo |
| `required` | `true` se la colonna esige un valore |
| `values` | insieme di valori fisso sotto forma di elenco |
| `default` | valore predefinito della colonna |
| `options` | indicazioni proprie del tipo, vedi sotto |

Il nome è l'**unica indicazione obbligatoria**; ogni altra indicazione si può omettere singolarmente.

## Tipi di colonna

| Tipo | Significato |
| --- | --- |
| `string` | testo, il tipo predefinito |
| `multiline` | testo su più righe |
| `number` | numero |
| `boolean` | vero/falso |
| `date` | data |
| `time` | ora |
| `link` | collegamento a un **file** |
| `record` | collegamento a un **record** di un'altra tabella |

Il collegamento a un record è il tipo con cui due tabelle entrano in relazione: un `link` punta a un file, ma un record non è un file, bensì una riga in una tabella.

**Uno stato intermedio vale per entrambi i tipi di collegamento.** La visualizzazione mostra il valore di una colonna di tipo `link` o `record` come testo e non risolve il collegamento; lì non è cliccabile. La risoluzione arriverà con una tappa successiva. Il collegamento a un singolo record non ne è toccato: si scrive nel testo corrente e più sotto ha una sezione propria.

**Tre cose sono escluse in una colonna di tabella**, e l'avviso indica ogni volta il motivo e non il solo fatto:

- **i campi calcolati** (`formula`, `lookup`) — una tabella non porta colonne calcolate; il calcolo avviene nelle query sui dati.
- **i valori strutturati** (`object`, `objectlist`) — ciò che un oggetto esprime in una cella si esprime altrimenti con una tabella dipendente attraverso una relazione.
- **le colonne a più valori** (`multistring` come tipo, `multiple: true` su un altro tipo) — una colonna multipla è una relazione travestita da colonna.

Come indicazioni di un **campo di documento** tutte e tre restano ammesse senza variazioni; sono escluse soltanto in una colonna di tabella.

## Indicazioni proprie del tipo

Il sotto-oggetto `options` porta le indicazioni che valgono solo per un determinato tipo. Sono le stesse dei [Profili di proprietà](property-profiles.md), ampliate di un'indicazione che esiste solo su una colonna:

| Tipo | Indicazione | Significato |
| --- | --- | --- |
| `string` | `maxLength` | lunghezza massima in caratteri. Un valore più lungo viene segnalato e **non troncato** |
| `number` | `decimals` | decimali attesi, da zero a dieci. Un valore con più decimali viene segnalato e **non arrotondato** |
| `record` | `table` | nome della tabella a cui punta il collegamento al record |

La lunghezza massima e i decimali fanno parte del fondo comune di indicazioni e valgono perciò allo stesso modo per le normali proprietà di un documento. Entrambe sono un **avviso sul campo** e non modificano mai il valore salvato.

## Etichette in più lingue

L'etichetta si trova alla chiave `label`, come testo semplice oppure come corrispondenza da lingua a testo:

```yaml
- name: titolo
  label:
    de: Titel
    en: Title
    fr: Titre
```

Il **nome** del campo non ne è toccato: se fosse traducibile, una banca dati trasmessa ad altri si sfalderebbe al primo cambio di lingua. Se una corrispondenza è difettosa in sé, decade l'etichetta intera e la visualizzazione ripiega sul nome tecnico, invece di mostrare alcune lingue e lasciarne sparire altre in silenzio.

## Identificatore di record, chiave funzionale e forma di visualizzazione

Ogni record porta un **identificatore interno** della forma `r-00042`: il contrassegno `r-` per record e un numero di almeno cinque cifre. La larghezza è una larghezza minima e non un limite; dopo `r-99999` viene `r-100000`. Vengono lette entrambe le scritture, `r-42` e `r-00042` indicano lo stesso record.

Un collegamento a un record indica la tabella e l'identificatore, scritto come un'ancora di blocco: `[[Personen#^r-00042]]`. Che cosa produce un collegamento del genere e quando vale è descritto più sotto, nella sezione sulla reperibilità.

Tre indicazioni della definizione ne fanno parte:

| Indicazione | Significato |
| --- | --- |
| `lastId` | livello di piena: il numero più alto mai assegnato dalla tabella. L'identificatore successivo nasce da esso e non dai record esistenti, affinché il numero di un record eliminato non venga assegnato una seconda volta |
| `key` | la chiave funzionale: un nome di campo o un elenco di nomi di campo. Facoltativa, perché una tabella di movimenti o di misure non ha una chiave leggibile dall'uomo che abbia senso |
| `display` | il campo con cui un record viene designato. Senza indicazione vale una chiave funzionale a un solo elemento, senza nessuna delle due l'identificatore interno |

Se la chiave funzionale indica un campo che la definizione non conosce, decade la chiave **intera**: mezza chiave sarebbe una falsa promessa di univocità.

## I record nel file

I record si trovano nel corpo dello stesso file, in un blocco proprio:

````markdown
```perspective-records
|- id="r-00001"
| Il nome della rosa
| 640
| disponibile
|- id="r-00002"
| Il pendolo di Foucault
| 880
| in prestito
```
````

Le regole sono volutamente brevi, perché il file è un archivio tecnico:

- Una riga che inizia con `|-` in **colonna 0** apre un record. Segue il suo identificatore interno.
- Una riga che inizia con `| ` in colonna 0 apre una cella. Ogni riga successiva appartiene alla cella corrente, quindi un valore può occupare più righe.
- Non esiste una **riga di intestazione**. Le celle corrispondono ai campi della definizione, nell'ordine; quell'ordine è il contratto.
- Conta solo la colonna 0. Una riga rientrata è sempre contenuto, anche se sembra un marcatore.
- Se una riga deve iniziare essa stessa con `|` oppure `!`, viene preceduta da una barra rovesciata: `\| così un valore inizia con una barra`.

**Non si perde mai un carattere.** Se un record ha troppe poche celle, i campi restanti rimangono vuoti; se ne ha troppe, quelle in eccesso restano intatte. Entrambi i casi vengono segnalati, ma nulla viene scritto via in silenzio — è l'unico errore che un archivio di dati non deve commettere.

## Visualizzazione dei record

Nella vista di lettura e nella modalità di modifica il blocco compare come tabella con le colonne della definizione. Ogni valore è rappresentato secondo il tipo della sua colonna: numeri allineati a destra e con i decimali dichiarati, valori di verità come segno di spunta, valori su più righe con le loro interruzioni. Se un valore non corrisponde al suo tipo, la cella mostra il testo originale ed è evidenziata a colori invece di essere sostituita.

Da **2000 record** in poi la vista mostra un estratto e indica sotto di che cosa è un estratto. È una finestra e non un troncamento silenzioso: si vede che c'è dell'altro. Il limite è stato misurato e non stabilito a tavolino — fino a quel punto la tabella compare senza attesa percepibile.

Nell'**esportazione portabile**, invece, la tabella è completa, senza finestra. Un file che si consegna non deve nascondere nulla: il destinatario non ha l'applicazione e non vedrebbe che manca qualcosa.

In questa vista i record non si modificano. Il file di tabella è un archivio tecnico — resta leggibile a mano e, in caso di necessità, correggibile a mano, ma nel funzionamento normale non ci si lavora dentro.

## Reperibilità: ricerca e collegamenti

La ricerca sull'**area** accoglie un documento di tabella senza i suoi record. Il testo esplicativo che precede il blocco di dati resta consultabile, una corrispondenza che segue il blocco porta ancora al punto giusto, e i record stessi non vengono trovati per questa via.

Il motivo sta nell'area e non nella tabella: lo spazio di ricerca tiene in memoria i testi di tutti i file Markdown e porta per questo un tetto sull'**intera** area. Bastano poche tabelle di qualche megabyte a romperlo, e da quel momento ogni ricerca torna a leggere dal disco, anche quella su un documento ordinario. I record nello spazio di ricerca costerebbero dunque la velocità non a se stessi, ma all'intera area.

**Questo è uno stato intermedio.** Finché i record non hanno un proprio tipo di corrispondenza, non sono reperibili tramite la ricerca sull'area. Due vie portano comunque a loro:

- **Cercare nel documento aperto.** Chi ha davanti il file di tabella e vi cerca dentro (predefinito `Ctrl+F`) cerca nel testo che ha davanti e ritrova i suoi record immutati. Il limite qui sopra riguarda soltanto la ricerca sull'area.
- **Rimandare direttamente a un record**, come descritto nella sezione seguente.

### Collegamento a un singolo record

Un collegamento indica la tabella e l'identificatore interno, scritto come un'ancora di blocco:

```markdown
[[Personen#^r-00042]]
```

Il collegamento **vale** se la tabella indicata porta quel record, ed è rotto se non lo porta. Si comporta così come ogni altro collegamento dell'applicazione. Vale anche quando il record non si trova nel primo file della tabella ma in uno dei suoi file successivi: per chi lo scrive la tabella è una sola, e la sua distribuzione su più file non lo riguarda.

La verifica avviene sullo stato **salvato** della tabella, come per ogni altra ancora. Un collegamento a un record appena creato e non ancora salvato non vale quindi ancora.

Se un collegamento vale lo mostra il [linter Markdown](tools.md): una destinazione rotta riceve una sottolineatura ondulata nell'editor, cioè nelle viste Sorgente, Divisa e Live. La sola vista di lettura non rappresenta la validità; lì i collegamenti validi e quelli rotti appaiono uguali.

Un clic apre il file della tabella. Al singolo record non porta ancora.

## Suddivisione di grandi insiemi di dati

Quando i dati superano circa **0,7 MB**, l'applicazione li distribuisce al salvataggio su più file affiancati e continua a trattarli come **una sola** tabella. Si apre il primo file e si vedono tutti i record; un collegamento a un record non nota la differenza.

Valgono quattro garanzie, e tre di esse dicono che cosa **non** accade:

- Il taglio avviene solo **tra due record**, mai all'interno di uno.
- Un record **non passa mai** a un altro file. I nuovi record vengono aggiunti in coda, nulla viene ridistribuito — così nessun collegamento a un record si spezza.
- Una **suddivisione esistente non viene mai ricostruita**, anche se è nata con una soglia diversa.
- Ogni file successivo indica i **nomi dei campi** nel proprio frontmatter per restare leggibile da solo. Quell'elenco è un aiuto alla lettura e non un contratto: se contraddice la definizione del primo file, prevale la definizione, e il salvataggio successivo rimette a posto l'elenco.

Il meccanismo alla base è lo stesso della [suddivisione di documenti grandi](document-parts.md); per i file di tabella cambiano solo la soglia e il punto di taglio.

## La scheda della banca dati

Una banca dati si descrive da sé nel contenitore `db-database`, nel frontmatter di un documento proprio:

```yaml
---
db-database:
  name: Biblioteca
  description: Fondo, prestiti e lettori della biblioteca di casa
  schemaVersion: '1.0'
  fallbackLocale: it
---
```

- **`name`** e **`description`** sono etichette e sono perciò possibili anch'esse come corrispondenza da lingua a testo.
- **`schemaVersion`** è testo e sta tra virgolette. Senza di esse YAML leggerebbe `1.0` come numero, e la versione `1.0` diventerebbe alla lettura la versione `1`.
- **`fallbackLocale`** è la lingua su cui ripiega un'etichetta quando non porta la lingua dell'interfaccia. Senza indicazione vale la prima lingua che compare nella scheda stessa.

Ognuna di queste indicazioni può mancare per conto proprio, e nessuna è presupposto per le tabelle: ogni tabella porta da sé la propria definizione e resta pienamente interpretabile anche senza scheda.

## L'area come banca dati

Non appena un documento contenuto in un'area porta la scheda della banca dati, l'applicazione tratta quell'area come **area di banca dati**. Non occorre dichiararla a parte: la scheda è la dichiarazione. L'affermazione sta così in un solo punto e non in due che potrebbero contraddirsi.

Un'area di banca dati riceve due cose che un'area ordinaria non ha.

**La panoramica degli oggetti della banca dati** risponde in un solo punto alla domanda su che cosa si trovi in quest'area: la scheda della banca dati con nome e descrizione, le tabelle ciascuna con il numero dei propri campi e le anomalie emerse nella lettura delle definizioni, in chiaro e non come codice. Si apre in una scheda a sé ed è una vista di sola lettura; al suo interno non si modifica nulla. Tre vie vi conducono:

- **Visualizza → Panoramica della banca dati**,
- il **menu contestuale del pannello dell'area**,
- la **palette dei comandi**.

In un'area senza banca dati nessuna di queste vie viene offerta.

**La sezione delle impostazioni «Banca dati»** si trova nel gruppo di navigazione «Area corrente» (File → Impostazioni… → Area corrente → Banca dati). Mostra la stessa informazione in forma breve, cioè nome e descrizione della banca dati, il numero delle sue tabelle e il numero delle anomalie, e porta un'opzione: **«Mostrare il riepilogo all'apertura dell'area»**. Se è attiva, la panoramica si apre da sé non appena l'area viene collegata. L'opzione risiede nel file dell'area e viaggia con la cartella dell'area.

## Indicazioni difettose

Per la definizione intera vale la linea morbida della casa: una **singola indicazione** difettosa decade e viene segnalata, la voce resta efficace; una **voce** difettosa decade, le altre colonne restano. L'avviso indica il punto, cioè la colonna interessata, l'indicazione errata e ciò che era atteso al suo posto.

L'unica eccezione è il **tipo**: un tipo al di fuori dell'insieme qui sopra fa decadere la voce intera, perché una colonna senza un tipo interpretabile non è una colonna.

Un'indicazione che l'applicazione non conosce decade singolarmente con un avviso e non causa alcun danno.

## Disattivare la banca dati

L'intera banca dati è un'[estensione interna](extensions.md) denominata «Banca dati», della categoria Strumenti, e si disattiva con un unico interruttore. Richiede i [Profili di proprietà](property-profiles.md), perché la forma di una definizione di tabella viene descritta e verificata tramite un profilo interno; se si disattiva questo prerequisito, la banca dati si disattiva con esso.

Da disattivata vale quanto segue:

- Il **blocco di record resta un normale blocco di codice**, nella vista di lettura, nella modalità di modifica e nell'esportazione portabile. Il suo contenuto resta leggibile; ciò che viene disattivato è la rappresentazione come tabella, non il dato.
- **La panoramica e la sezione delle impostazioni decadono**, insieme agli accessi nel menu Visualizza, nel menu contestuale del pannello dell'area e nella palette dei comandi. Una panoramica già aperta resta finché non la si chiude, come ogni altra pagina di sistema.
- Un **collegamento a un singolo record** non viene più segnalato come rotto. Senza definizioni non c'è nulla con cui confrontarlo, e un avviso senza verifica sarebbe soltanto un'affermazione.
- La **ricerca sull'area resta invariata**. I record restano esclusi dal testo integrale, perché quel limite appartiene al file di tabella e non all'interruttore; la sezione «Reperibilità» più sopra resta quindi valida.

**I file restano intatti.** La disattivazione toglie l'interpretazione, non i dati: non viene cambiato un solo carattere, e la riattivazione riporta tutto. L'indice dell'area viene allora ricostruito una volta; in fondi estesi ciò richiede un istante.
