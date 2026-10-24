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

## Relazioni tra tabelle

Una colonna di tipo `record` è una **colonna di collegamento**. La sua indicazione `table` indica la tabella di destinazione con il nome del suo file senza estensione, senza distinguere maiuscole e minuscole, e ogni cella della colonna punta a un record di quella tabella:

```yaml
- name: autore
  type: record
  options:
    table: Autori
```

Nella cella può stare una di due cose:

- l'**identificatore** del record di destinazione, anche nella forma breve: `r-00007` e `r-7` puntano allo stesso record;
- il **valore della chiave funzionale** del record di destinazione, se quella chiave è composta da un solo campo, per esempio `Umberto Eco`. Il confronto avviene carattere per carattere, come per la chiave stessa.

Un testo nella forma di un identificatore viene sempre letto come identificatore. La scrittura `[[Autori#^r-00007]]` di un collegamento nel testo corrente non va nella cella; lì vale come un normale valore di chiave. Una cella vuota non è un collegamento e non viene verificata; se debba essere compilata lo dice `required`.

**Nel salvataggio da parte dell'applicazione ogni collegamento viene verificato e scritto come identificatore.** La tabella di destinazione deve esistere nell'area, e il contenuto della cella deve colpire esattamente un record che esiste dopo la modifica; un record creato nella stessa modifica conta, uno eliminato in essa no. Se non ne colpisce nessuno o ne colpisce più di uno, la modifica viene respinta. La risoluzione tramite il valore di chiave funziona solo se la tabella di destinazione ha una chiave funzionale a un solo elemento; con una chiave a più elementi l'identificatore è l'unica via. Ciò che è stato risolto, l'applicazione lo scrive nella cella come identificatore completo, sia che vi fosse il valore di chiave sia la forma breve; se in seguito il valore di chiave del record di destinazione cambia, il collegamento resta valido. Un record può anche rimandare a se stesso.

**Un record a cui si rimanda ancora non si può eliminare.** Questo vale per ogni colonna di collegamento dell'area che punta alla sua tabella, anche per una della stessa tabella, e per i collegamenti tramite l'identificatore come tramite il valore di una chiave a un solo elemento. L'avviso indica la tabella che rimanda, le sue colonne di collegamento, il numero dei record che rimandano e il primo di essi. L'applicazione non elimina nulla insieme a esso e non svuota alcun collegamento. Chi vuole eliminare un'intestazione con le sue righe le elimina entrambe in **un'unica** modifica; allo stesso modo un collegamento non conta più se la stessa modifica lo rivolge a un'altra destinazione o lo svuota. Un collegamento nel testo corrente, per esempio `[[Autori#^r-00007]]`, invece non protegge: può rompersi come un collegamento a un file eliminato.

Entrambe le verifiche hanno bisogno della visione d'insieme delle tabelle dell'area. Se le tabelle non sono ancora state lette completamente, l'applicazione respinge una modifica che imposta un collegamento o elimina un record, e l'avviso chiede di riprovare tra un momento.

Le relazioni si valutano con una query sui record: un percorso come `autore.nome` legge il campo del record collegato, una condizione sul campo di riferimento trova la direzione opposta, e `ancestors(…)` e `descendants(…)` seguono i collegamenti su un numero qualsiasi di livelli. Quanti record puntano a un record lo conta una query raggruppata come `TABLE RECORDS count() FROM "Prestiti" GROUP BY libro`. La pagina [Query Perspective](frontmatter-query.md) descrive entrambe le cose nelle sezioni «Livello di record» e «Raggruppamento e aggregazione».

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
| `lastId` | livello di piena: il numero più alto mai assegnato dalla tabella. L'identificatore successivo sta sopra di esso e sopra l'identificatore più alto dei record esistenti, affinché il numero di un record eliminato non venga assegnato una seconda volta e nessun identificatore venga assegnato due volte, nemmeno senza livello di piena o con uno troppo basso |
| `key` | la chiave funzionale: un nome di campo o un elenco di nomi di campo. Facoltativa, perché una tabella di movimenti o di misure non ha una chiave leggibile dall'uomo che abbia senso |
| `display` | il campo con cui un record viene designato. Senza indicazione vale una chiave funzionale a un solo elemento, senza nessuna delle due l'identificatore interno |

Se la chiave funzionale indica un campo che la definizione non conosce, decade la chiave **intera**: mezza chiave sarebbe una falsa promessa di univocità.

**Nel salvataggio da parte dell'applicazione la chiave funzionale resta univoca.** L'applicazione la verifica rispetto a tutti i record della tabella, anche a quelli nei suoi file successivi, e respinge una modifica dopo la quale due record porterebbero la stessa chiave; in quel caso non viene scritto nulla. L'avviso distingue tre situazioni:

- La stessa chiave compare **due volte nella stessa modifica**.
- La chiave è **già assegnata a un record**. L'avviso lo indica con il suo identificatore e la sua forma di visualizzazione.
- La chiave è **già assegnata più volte nei record esistenti**. In tal caso occorre prima correggere i record esistenti; l'avviso indica i record che la portano.

Una chiave a più elementi conta come doppia solo se tutti i suoi elementi coincidono. Se un elemento è vuoto, la chiave non viene verificata; se il campo debba essere compilato lo dice l'indicazione `required`. Il confronto avviene carattere per carattere: `Müller` e `MÜLLER` sono due chiavi diverse, e uno spazio iniziale conta. Una modifica che lascia invariata la chiave di un record non la verifica; un record che fa parte di un doppione esistente resta così modificabile nei suoi altri campi. Eliminare e ricreare la stessa chiave in un'unica modifica è consentito, così come scambiare le chiavi di due record.

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

## Regole di verifica

Una regola di verifica stabilisce quali valori una tabella accetta. Si trova nella definizione, in uno di due punti a seconda della sua portata:

- **`check` sulla voce di una colonna** verifica il solo valore di quella colonna.
- **`checks` al livello superiore del contenitore** è un elenco di condizioni su più campi di un record.

```yaml
db-table:
  fields:
    - name: cap
      check: '/^\d{4}$/'
    - name: quantita
      type: number
      check:
        - value > 0
        - rule: value <= 100
          message: Al massimo 100 pezzi per riga.
    - name: inizio
      type: date
    - name: fine
      type: date
  checks:
    - rule: fine >= inizio
      message: La fine è anteriore all'inizio.
```

Una regola è un testo oppure un oggetto `{ rule, message }` con un messaggio proprio; su un campo è ammesso anche un elenco di entrambe le forme. Il testo di una regola di campo assume una di tre forme:

- Un'**espressione regolare** sta tra barre, seguita facoltativamente da flag, per esempio `/^\d{4}$/` oppure `/^[a-z]+$/i`. I flag `g` e `y` sono esclusi. Una barra nel modello non ha bisogno di una barra rovesciata, perché il modello arriva fino all'ultima barra.
- Una **singola parola** è il nome di una regola fornita con l'applicazione. L'applicazione non ne conosce ancora nessuna; un nome sconosciuto decade con un avviso.
- **Ogni altro testo** è una condizione del linguaggio di interrogazione in cui il valore proprio si chiama `value`, per esempio `value > 0 AND value <= 100`. Non deve indicare un altro campo; una condizione su più campi va sotto `checks`.

Una regola sotto `checks` è sempre una condizione del linguaggio di interrogazione. Indica i campi con il loro nome, senza distinguere maiuscole e minuscole.

Il confronto avviene come in ogni interrogazione: un numero come numero, una data e un'ora in ordine cronologico, anche rispetto a una data della forma `date(2026-01-01)`, un testo senza distinguere maiuscole e minuscole.

**C'è una trappola da conoscere.** Il linguaggio di interrogazione non conosce le parole `true`, `false` e `null`; le legge come nomi di campo, e la regola decade con un avviso. Un valore vero/falso si verifica con `value` da solo oppure con `NOT value`, sotto `checks` con il nome del campo da solo oppure preceduto da `NOT`. Se un campo è compilato lo dice `required`, non una regola di verifica.

**Nessuna regola di campo verifica un valore vuoto**, né un valore che non corrisponde al suo tipo; quello lo segnala già la verifica del tipo. L'eccezione è il valore vero/falso: la sua cella vuota significa «no», e `value` richiede perciò una casella spuntata. Una regola sotto `checks`, invece, viene sempre verificata; un confronto con un campo vuoto non è allora soddisfatto. Una regola che non si può valutare, per esempio a causa di una divisione per zero, conta come violata.

**Nel salvataggio da parte dell'applicazione le regole agiscono in modo rigoroso.** Viene verificato il record così come sarebbe dopo la modifica, con tutti i suoi campi e non solo quelli modificati. Se viola una regola, la modifica viene respinta. Per una regola di campo l'avviso indica il campo, il valore e la regola, per una regola sotto `checks` il record e la regola, e aggiunge il messaggio della regola se ne ha uno. L'eliminazione non verifica alcuna regola.

**In lettura agiscono in modo morbido.** Un valore che viola una regola di campo viene contrassegnato nella visualizzazione come un valore che non corrisponde al suo tipo; la cella mostra il suo testo invariato, il record resta visibile e nel file non cambia nulla. Allo stesso modo viene contrassegnata una cella vuota di un campo con `required`. Le regole sotto `checks` non agiscono in lettura, perché non hanno una singola cella che si possa contrassegnare.

## Modificabilità condizionata

L'indicazione `editable` al livello superiore del contenitore stabilisce a quale condizione un record può ancora essere modificato, per esempio perché una fattura registrata resti invariata:

```yaml
db-table:
  fields:
    - name: stato
      values: [aperta, registrata]
  editable:
    rule: stato != "registrata"
    message: Una fattura registrata non viene più modificata.
```

La condizione è un'espressione del linguaggio di interrogazione sui nomi di campo della tabella, come testo oppure come oggetto `{ rule, message }` con un messaggio proprio. Una tabella ha esattamente una condizione; chi ne ha bisogno di più le combina nell'espressione.

Nel salvataggio da parte dell'applicazione vale quanto segue:

- La condizione vale per la **modifica e l'eliminazione** di un record. La **creazione** resta sempre libera.
- Si misura sullo stato **salvato** del record prima della modifica, non sui nuovi valori. Chi riporta indietro lo stato nella stessa modifica resta perciò bloccato.
- Se la condizione non è soddisfatta, la modifica viene respinta. L'avviso indica il record e la condizione e aggiunge il messaggio.
- Una condizione che non si può valutare blocca.
- Un'indicazione inservibile decade con un avviso, e la tabella resta modificabile.

Senza questa indicazione ogni record è modificabile.

**La stessa indicazione su un campo.** Un singolo campo porta `editable` nella propria voce ed è allora modificabile solo a questa condizione; il record resta visibile e modificabile negli altri campi:

```yaml
db-table:
  fields:
    - name: libro
      type: record
      editable: false
    - name: scadenza
      type: date
      editable: NOT restituito
    - name: restituito
      type: boolean
```

- La condizione ha la stessa forma che sulla tabella, come testo o come oggetto `{ rule, message }`, e può nominare qualsiasi campo della tabella. `false` blocca il campo in modo fisso, `true` lo libera espressamente; entrambe le parole valgono solo su un campo, non sulla tabella.
- Vale solo per la **modifica**. Alla creazione ogni campo è libero, e l'eliminazione non ne è toccata. Come sulla tabella, si misura sullo stato salvato prima della modifica.
- Se un salvataggio cambia il valore di un campo bloccato, viene respinto; l'avviso indica campo, record e regola, per il blocco fisso la regola «false». Un valore invariato in un campo bloccato non è un errore. Se il record è già bloccato secondo la condizione della sua tabella, compare solo quel suo avviso.
- Durante la modifica nella maschera e in una riga della maschera elenco, un campo bloccato resta in lettura, e un suggerimento indica che secondo la condizione della definizione per il momento non è modificabile. Non appena la condizione è soddisfatta dopo un salvataggio, il campo è libero alla modifica successiva.
- Una condizione inservibile decade con un avviso, e il campo resta modificabile.

Modificabilità condizionata e permessi agiscono insieme e restano comunque due cose distinte: `editable` dipende dal record e vale per tutti, i permessi dipendono dal ruolo (sezione «Permessi»).

## Visualizzazione dei record

Nella vista di lettura e nella modalità di modifica il blocco compare come tabella con le colonne della definizione. Ogni valore è rappresentato secondo il tipo della sua colonna: numeri allineati a destra e con i decimali dichiarati, valori di verità come segno di spunta, valori su più righe con le loro interruzioni. Se un valore non corrisponde al suo tipo, la cella mostra il testo originale ed è evidenziata a colori invece di essere sostituita.

Da **2000 record** in poi la vista mostra un estratto e indica sotto di che cosa è un estratto. È una finestra e non un troncamento silenzioso: si vede che c'è dell'altro. Il limite è stato misurato e non stabilito a tavolino — fino a quel punto la tabella compare senza attesa percepibile.

Nell'**esportazione portabile**, invece, la tabella è completa, senza finestra. Un file che si consegna non deve nascondere nulla: il destinatario non ha l'applicazione e non vedrebbe che manca qualcosa.

In questa vista i record non si modificano: si modificano nella loro **maschera**, descritta nella sezione seguente; il pulsante all'inizio di ogni riga la apre. Il file di tabella è un archivio tecnico — resta leggibile a mano e, in caso di necessità, correggibile a mano, ma nel funzionamento normale non ci si lavora dentro.

## Modificare i record nella maschera

Ogni record ha una **maschera**: una pagina propria che mostra i suoi campi uno sotto l'altro, nell'ordine della definizione, ciascuno con la sua etichetta. L'applicazione la genera dalla definizione della tabella; non c'è nulla da costruire. Nella maschera si creano, si modificano e si eliminano i record.

### Aprire e creare

Un record esistente si apre con il pulsante **«Apri record»** all'inizio della sua riga, prima del pulsante dei giustificativi di modifica, sia nella vista di lettura sia nella modalità Live. Da tastiera vi porta il tasto freccia sinistra a partire dal pulsante dei giustificativi.

Dal risultato di una query sui record, un clic su un record o su un collegamento apre ugualmente la maschera (pagina [Query Perspective](frontmatter-query.md)). Essa mostra lo stato salvato, anche se la query ne mostra uno non salvato. In una maschera elenco il clic apre la maschera che l'elenco indica (sezione «Maschera elenco»). Allo stesso modo aprono la maschera un collegamento a un record nel testo di un documento (sezione «Collegamento a un singolo record») e un risultato di record della ricerca sull'area (sezione «Reperibilità: ricerca e collegamenti»).

Tre vie creano un nuovo record:

- il pulsante **«Nuovo record»** sotto ogni tabella, anche sotto una tabella vuota,
- il pulsante **«Nuovo record»** nella riga di ogni tabella nella panoramica della banca dati,
- il comando **«Nuovo record nella tabella attiva»** nella palette dei comandi. Agisce sul file di tabella della scheda attiva; se lì non ne è aperto nessuno, la barra di stato lo segnala.

La maschera si apre in una scheda a sé il cui titolo indica il file e il record. Ne esiste una per finestra: se si apre un altro record, la stessa scheda lo mostra. Se la modifica in corso non è ancora salvata, la maschera chiede prima se debba essere scartata.

Un nuovo record riceve il suo identificatore interno già all'apertura della maschera: compare nell'intestazione, e il livello di piena `lastId` della tabella è già aggiornato. I campi sono vuoti, e il record arriva nel file solo con il primo salvataggio.

### Leggere e modificare

La maschera si apre **in lettura**. I valori compaiono come testo, un valore di verità come segno di spunta, e un campo obbligatorio è contrassegnato come tale. L'intestazione porta le azioni **«Modifica»**, **«Elimina»** e **«Giustificativi»**; l'ultima apre i giustificativi di modifica del record.

Dopo di esse si trova l'azione **«Mostra nel documento di tabella»**. Apre il file di tabella e porta in vista la riga del record, anche quando il record si trova in un file successivo: nella vista di lettura la visualizzazione scorre fino alla sua riga, purché sia tra i 2000 record che mostra; nelle viste Live e Sorgente il cursore si posiziona su quella riga. Per un nuovo record l'azione manca, perché il record non è ancora nel file.

**«Modifica»** trasforma ogni campo in un inserimento nella forma del suo tipo:

| Tipo | Inserimento |
| --- | --- |
| `string`, `link`, `record` | inserimento di testo su una riga, per `record` con aiuto alla scelta |
| `multiline` | inserimento di testo su più righe |
| `number`, `date`, `time` | inserimento di un numero, di una data o di un'ora |
| `boolean` | casella di controllo |

Un valore che non corrisponde al suo tipo riceve invece il semplice inserimento di testo, perché si possa vedere e correggere ciò che sta nel file; un inserimento numerico lo scarterebbe altrimenti in silenzio.

**«Salva»** scrive la modifica e torna alla lettura, **«Scarta»** torna allo stato letto senza scrivere nulla. Vengono scritti solo i campi modificati. Se non si è modificato nulla, non c'è nulla da salvare, e la barra di stato lo segnala.

Se un record non è modificabile secondo la condizione della sua tabella, **«Modifica»** ed **«Elimina»** mancano, e una frase nella maschera ne indica il motivo, con il messaggio della condizione se ne ha uno. Se il ruolo proprio non consente la modifica, manca «Modifica» e la frase nomina il ruolo; se non consente l'eliminazione, manca «Elimina» (sezione «Permessi»).

### Campi di riferimento e aiuto alla scelta

Un campo di tipo `record` mostra in lettura la forma di visualizzazione del suo record di destinazione e il suo identificatore, per esempio `Umberto Eco (r-00007)`, anche quando nel file c'è la forma breve `r-7`. Se il valore non colpisce esattamente un record della tabella di destinazione, un avviso sul campo lo segnala.

In modifica il campo offre un **aiuto alla scelta**: un elenco dei record della tabella di destinazione, ciascuno con forma di visualizzazione e identificatore. Digitare restringe l'elenco, una scelta inserisce l'identificatore, e il tasto Esc chiude l'elenco. Se corrispondono più di cinquanta voci, l'elenco indica quante altre ce ne sono.

Scegliere non è obbligatorio. Una forma breve dell'identificatore o un valore della chiave funzionale a un solo elemento inserito a mano resta com'è, e al salvataggio l'applicazione scrive al suo posto l'identificatore completo, come descritto nella sezione «Relazioni tra tabelle». Se la definizione non indica alcuna tabella di destinazione o se questa non esiste, il campo è di sola lettura.

### Messaggi e modifiche altrui

Se l'applicazione respinge una modifica, non viene scritto nulla; la maschera resta in modifica, e quanto inserito resta com'è. Ogni messaggio sta dove deve stare. Se riguarda un campo, compare su quel campo, il campo è contrassegnato, e il primo campo interessato riceve il focus. Una regola violata sotto `checks` contrassegna tutti i suoi campi e compare nell'intestazione della maschera, come ogni messaggio che non appartiene ad alcun campo, per esempio quello della protezione dall'eliminazione.

Già in lettura la maschera contrassegna con un messaggio sul campo un valore che non corrisponde al suo tipo, che viola una regola di campo o che manca pur essendo obbligatorio.

Se qualcuno ha modificato il record da quando la maschera lo ha letto, per esempio a mano nel file di tabella, l'applicazione per il momento non salva. La maschera mostra allora il riquadro **«Il record è stato modificato nel frattempo»** con due vie:

- **«Ricarica»** scarta la modifica in corso e mostra lo stato trovato.
- **«Salva comunque»** scrive la propria versione. Un giustificativo del tipo **Modificato dall'esterno** fissa la differenza trovata, così che nulla scompaia senza che lo si noti.

Anche la seconda via verifica tutte le regole della tabella; con essa non si può aggirare alcuna regola.

### Eliminare

**«Elimina»** chiede prima conferma: **«Eliminare questo record?»** Con **«Sì, elimina»** il record viene eliminato e la maschera si chiude; **«No»** lascia tutto com'è. Un record a cui punta ancora una colonna di collegamento non si può eliminare nemmeno qui. Quali record rimandano a esso lo mostra in anticipo l'utilizzo descritto più avanti.

### La maschera come file

La maschera generata si può impaginare. Il comando **«Salva maschera come file»** nell'intestazione della maschera la scrive come documento ordinario accanto al file di tabella, con il nome di questo seguito da ` Form`, per `Clienti.md` quindi `Clienti Form.md`. Un file esistente con quel nome non viene mai sovrascritto. Il nuovo file comincia con la versione generata:

```markdown
---
title: Clienti Form
db-form:
  table: Clienti
---

# Clienti

**Nome:** {{field:nome}}

**Quantità:** {{field:quantita}}
```

Il contenitore `db-form` indica la tabella, e per ogni campo compare nel testo un **segnaposto di campo** `{{field:<nome>}}`. Intorno ai segnaposto tutto è normale Markdown: un titolo tra due campi o una frase esplicativa compare nella maschera così come sta nel file. Una barra rovesciata davanti alle parentesi graffe trasforma un segnaposto in testo normale.

**Due significati di `table`.** Nel frontmatter della banca dati, nel contenitore `db-form` come nell'indicazione `options.table` di una colonna di riferimento, `table` indica una tabella della banca dati. In un blocco della [Perspective Datatable](datatable.md), invece, la riga `table:` dà un nome a quella stessa datatable, con il quale la raggiungono i diagrammi e i collegamenti. Uguale è solo la parola: una datatable non è una tabella della banca dati.

Alla successiva apertura la maschera mostra il testo del file. L'intestazione indica allora da quale file proviene la maschera, e il comando non viene più offerto; la panoramica della banca dati indica il file nella colonna **«Maschera»**. Se il file viene eliminato, la maschera mostra di nuovo la versione generata.

**Viene mostrato ciò che il file indica.** Un campo che il file non indica non viene mostrato dalla maschera, e al salvataggio resta intatto; un nuovo record riempie solo i campi indicati. Un segnaposto che non è né di campo né di valore e un nome di campo che la tabella non conosce restano come testo e vengono segnalati, come descritto nella sezione «Indicazioni difettose».

Il **segnaposto di valore** `{{value:<espressione>}}` mostra un valore che la maschera calcola dai campi del record mostrato, per esempio `{{value:quantita * prezzo}}` per l'importo di una posizione o `{{value:lent + dur(14 days)}}` per la data quattordici giorni dopo il campo `lent`. L'espressione è del [linguaggio di interrogazione](frontmatter-query.md), come in una regola di verifica: indica i campi con il loro nome, un campo data conta come data, e valgono le stesse operazioni e funzioni. Il valore compare come in un'interrogazione a tabella, un numero per esempio come `7.5`, una data come `2026-10-15`, una durata come `10d` e un valore booleano come `true` o `false`. In modifica la maschera lo ricalcola a ogni inserimento, senza salvare. Il valore stesso non viene mai salvato; non è un campo del record.

Se l'espressione non dà alcun valore per un record, per esempio perché un campo è vuoto, il punto resta vuoto e contrassegnato; un suggerimento lo indica, e non viene segnalato nulla. Un'espressione non valida, per esempio con un errore di battitura, lascia anch'essa il punto vuoto e viene segnalata con la sua riga nell'intestazione della maschera; il resto della maschera resta utilizzabile.

**Il valore sta nella frase** quando il segnaposto si trova all'interno di una riga di testo: `Scade il {{value:lent + dur(14 days)}}` mostra «Scade il 2026-10-15» in una sola riga. Se il segnaposto sta da solo sulla sua riga, il valore riceve una riga propria. Un segnaposto di campo sta sempre su una riga propria.

**Sezioni condizionali.** Una sezione tra i marcatori `{{when:<condizione>}}` e `{{end}}` compare solo se la condizione è soddisfatta. Entrambi i marcatori stanno da soli sulla loro riga; una sezione comprende quindi paragrafi interi, titoli, tabelle, elenchi e i segnaposto in essi, mai mezze righe. La condizione è un'espressione del [linguaggio di interrogazione](frontmatter-query.md) sui campi del record mostrato, come in una regola di verifica: `{{when:onloan}}` mostra la sezione per un libro in prestito, `{{when:pages > 500}}` per uno voluminoso. Le sezioni possono essere annidate; una interna compare solo se compare anche quella esterna. In modifica una sezione compare e scompare a ogni inserimento, senza salvare; in lettura vale lo stato salvato.

```markdown
**On loan:** {{field:onLoan}}

{{when:onloan}}
## Out on loan

**Loan note:** {{field:loanNote}}
{{end}}
```

**La condizione agisce solo sulla visualizzazione, mai sul valore.** Un campo in una sezione nascosta conserva il suo contenuto e viene salvato insieme al resto; la condizione non lo esclude né dal salvataggio né dalle regole di verifica. Se una regola rifiuta un campo del genere, il messaggio compare nell'intestazione della maschera e indica il campo; la sezione resta nascosta. Non esistono un ramo «altrimenti» né cicli: un caso contrario si scrive come seconda sezione con la condizione negata, per esempio `{{when:NOT onloan}}`. Una barra rovesciata davanti alle parentesi graffe trasforma anche un marcatore in testo normale.

**Percorsi di riferimento.** I segnaposto di valore e le condizioni leggono, attraverso un campo di riferimento, anche i campi del record di destinazione: in una maschera dei prestiti, `{{value:book.title}}` mostra il titolo del libro prestato, e `{{when:book.onloan}}` mostra una sezione finché il libro è segnato come prestato. Prima del punto sta il campo di riferimento, dopo un campo della tabella di destinazione. L'applicazione calcola un tale percorso dopo un breve ritardo, e fino alla risposta resta il valore precedente; in modifica il percorso segue ogni inserimento, anche la scelta di un altro riferimento, senza salvare. Se il riferimento è vuoto o non corrisponde a nessun record, il punto resta vuoto e contrassegnato, senza messaggio, e una sezione resta nascosta. Se il percorso non indica nessun campo di riferimento della tabella o nessun campo della tabella di destinazione, il punto resta ugualmente vuoto, e la maschera lo segnala con la sua riga nell'intestazione.

**Posizioni.** Il segnaposto `{{list:<file di query>}}` mostra nella maschera i record di un'altra tabella che puntano al record mostrato, e li salva insieme a esso; la sezione «Posizioni nella maschera» lo descrive.

**File di maschera e modello.** Un file di maschera sembra un [modello](templates.md), perché entrambi scrivono i loro segnaposto tra doppie parentesi graffe, eppure fa un'altra cosa. Un modello viene applicato una volta: `{{date}}` viene sostituito dalla data alla creazione di un file, e dopo lì c'è testo. Un file di maschera non viene mai applicato: la maschera risolve `{{field:Name}}` e `{{value:quantita * prezzo}}` a ogni visualizzazione in base al record mostrato, e il file conserva i suoi segnaposto. Un file di maschera va quindi accanto alla sua tabella e non nella cartella dei modelli.

### Dopo il riavvio

Se il ripristino della sessione è attivato (Aiuto → Ripristina sessione) e la maschera è aperta alla chiusura, al successivo avvio torna: al suo posto tra i documenti aperti della sua colonna, con lo stesso record nello stesso file di maschera. Se era il documento mostrato nella sua colonna, lo torna a essere. Un nuovo record non ancora salvato non torna. Il percorso di «Indietro» ricomincia dopo il riavvio.

**Se il record non esiste più**, per esempio perché è stato eliminato tra la chiusura e il riavvio, la maschera non scompare. Mostra la nota che il record non esiste più nella sua tabella e che la maschera resta aperta finché non la chiude, e porta nell'intestazione l'azione **«Apri la tabella»**, che apre il file di tabella.

**Se la banca dati è disattivata all'avvio**, la maschera non torna, ma la sua voce non va persa: resta in sospeso e si conserva anche attraverso altri riavvii. Dopo l'attivazione, la maschera torna al suo posto al successivo avvio. Se la sua colonna conteneva soltanto la maschera, torna nella colonna rimanente, dopo i suoi documenti.

### Più maschere e la maschera predefinita

Una tabella può avere più file di maschera, per esempio uno dettagliato e uno sintetico. Quale compare all'apertura di un record, la **maschera predefinita**, lo stabilisce l'indicazione `form` nella definizione della tabella, con il nome del file di maschera senza estensione, come la destinazione di un collegamento wiki:

```yaml
db-table:
  form: Clienti Form
  fields:
    - name: Nome
      type: string
```

Senza l'indicazione vale il primo file di maschera della tabella secondo il percorso, e se non ce n'è nessuno, la maschera generata; un unico file di maschera funziona quindi senza alcuna indicazione. Gli altri file di maschera restano maschere della tabella: un collegamento da una maschera porta a essi, come descrive la sezione seguente.

Nella panoramica della banca dati la colonna **«Maschera»** indica la maschera predefinita di ogni tabella e dopo il numero degli altri file di maschera, per esempio «altre 1». Se la maschera predefinita viene eliminata o rinominata senza aggiornare l'indicazione, la panoramica lo segnala, e vale di nuovo la regola senza indicazione.

### Passare da una maschera all’altra

Un collegamento nel testo di un file di maschera, come collegamento wiki quale `[[Clienti Breve]]` o come collegamento Markdown, agisce nella maschera secondo la sua destinazione:

- Se la destinazione è **un altro file di maschera della stessa tabella**, la maschera mostra lo stesso record in quella maschera.
- Se la destinazione è **il file di maschera di un'altra tabella**, una frase sotto l'intestazione indica che per questo manca un record; non viene aperto né creato nulla.
- Se la destinazione è **un record**, come collegamento wiki quale `[[Clienti#^r-00002]]`, la maschera mostra quel record nella maschera predefinita della sua tabella. Se il collegamento non corrisponde ad alcun record in modo univoco, apre il file di tabella; un collegamento Markdown a un file di tabella lo apre come documento.
- **Ogni altro collegamento** apre il suo documento, come ovunque nell'applicazione.

Un **campo di riferimento** compilato è cliccabile in lettura: un clic apre il record di destinazione nella maschera predefinita della sua tabella. Se il valore non corrisponde ad alcun record, una frase sotto l'intestazione lo indica, e la maschera resta dov'è. Un campo di riferimento vuoto non è cliccabile, e in modifica il campo resta l'inserimento con aiuto alla scelta.

Ogni cambio tramite un collegamento, un campo di riferimento, un collegamento a un record nel testo o «Utilizzato da» ricorda il record da cui proviene. **«Indietro»** sopra il titolo nell'intestazione vi riporta, nella sua maschera, anche su più passi; senza passo precedente il pulsante non compare. Se apre un record dall'esterno, per esempio dalla sua riga o dalla panoramica, il percorso ricomincia, e la chiusura della maschera lo termina. Se la modifica non è salvata, la maschera chiede prima di ogni cambio, anche prima di «Indietro»: **«Scarta»** cambia, **«Continua a modificare»** resta con tutti gli inserimenti.

## Salvataggio da parte dell'applicazione

I record si creano, si modificano e si eliminano nella maschera descritta nella sezione precedente. Essa salva attraverso una via dell'applicazione che è la stessa per ogni modifica ai record; ciò che descrive questa sezione vale quindi per ciascuna di esse.

Ogni modifica passa per una via che la verifica prima della scrittura. Un valore che non corrisponde al tipo del suo campo viene respinto, così come un campo vuoto che richiede un valore. In entrambi i casi non viene scritto nulla.

A ciò si aggiungono le regole della definizione della tabella, descritte nelle sezioni precedenti. Una modifica viene respinta anche se

- il **ruolo** proprio non consente l'operazione sulla tabella (sezione «Permessi»),
- dopo di essa una **chiave funzionale** sarebbe assegnata due volte,
- un **collegamento** non colpisce alcun record o ne colpisce più di uno, oppure manca la sua tabella di destinazione,
- si vuole eliminare un record a cui si **rimanda** ancora,
- un valore o un record viola una **regola di verifica**,
- viene modificato un **campo** bloccato secondo la propria condizione,
- un record **non è modificabile** secondo la condizione della sua tabella, oppure
- le tabelle dell'area **non sono ancora state lette completamente** e la modifica imposta un collegamento o elimina un record.

L'applicazione segnala insieme i motivi che derivano da queste regole, non solo il primo.

**Un salvataggio ha effetto per intero o per niente**, anche quando tocca più tabelle e più file: dopo ci sono tutte le sue modifiche oppure nessuna. Scrive i suoi giustificativi di modifica nella stessa operazione, e tutti i giustificativi di un'operazione portano lo stesso **identificatore di operazione**.

Prima che le nuove versioni dei file abbiano effetto, l'applicazione le scrive in modo definitivo sul supporto di memoria. Un'interruzione di corrente o una connessione di rete che cade non lascia quindi alcuna operazione a metà. (Su Linux questo vale con una riserva: lì l'applicazione non scrive in modo definitivo le voci di cartella separatamente, per cui un'interruzione di corrente proprio nel momento del salvataggio può lasciare l'operazione incompiuta fino alla successiva apertura dell'area.) Questo richiede tempo: un salvataggio dura circa un decimo di secondo su un disco locale e da un quarto di secondo a mezzo secondo su un'unità di rete.

Chi legge contemporaneamente, mentre un salvataggio è in corso, può vedere uno stato intermedio, per esempio l'intestazione di una fattura senza le sue righe. È un caso noto e accettato deliberatamente.

Se un arresto anomalo lascia un salvataggio incompiuto, l'applicazione lo porta a termine al salvataggio successivo in quest'area o all'apertura dell'area. Fino ad allora le tabelle interessate non accettano modifiche e lo segnalano con un messaggio. Nulla va perduto.

## Giustificativi di modifica

Chi crea, modifica o elimina un record attraverso l'applicazione lascia una traccia: accanto al file della tabella l'applicazione tiene un secondo file in cui ognuna di queste modifiche compare come **giustificativo di modifica**. Esso risponde alla domanda su chi abbia modificato quale campo, quando e da quale valore a quale valore.

### Che cosa sono e dove si trovano

Al file di tabella `Clienti.md` corrisponde il file `Clienti.mddl` nella stessa cartella. L'applicazione lo crea e lo estende; non occorre fare nulla per questo, e su di esso non va fatto nulla.

Cinque proprietà sono da conoscere:

- **Non compare in alcun elenco di file** dell'applicazione e non si apre come documento. È un deposito tecnico accanto alla tabella.
- Viene **soltanto esteso** e mai riscritto. Un giustificativo già scritto resta al suo posto carattere per carattere; l'unica operazione che lo tocca è il raggruppamento descritto più sotto.
- **Segue** la tabella quando questa viene rinominata o spostata dentro l'applicazione, e finisce con essa nel cestino del sistema operativo quando la si elimina. Da lì si recuperano entrambi insieme.
- Chi lo **modifica o lo cancella a mano** perde la traccia in modo irrecuperabile. Non esiste un secondo deposito dal quale la si potrebbe ripristinare.
- Tutti i giustificativi di uno stesso salvataggio portano **lo stesso identificatore di operazione**. Così resta riconoscibile nel file che più modifiche vanno insieme, per esempio l'intestazione di una fattura e le sue righe.

### La vista sul record

Nella vista di lettura e nella modalità Live ogni riga di record porta al proprio inizio un pulsante **«Mostra i giustificativi di modifica»**. Un clic su di esso apre la pagina **«Giustificativi di modifica»** in una scheda a sé. Senza mouse il tabulatore porta nella tabella, i tasti freccia cambiano riga, i tasti Inizio e Fine portano alla prima e all'ultima, e il tasto Invio o la barra spaziatrice apre la pagina.

La pagina mostra i giustificativi del record, **il più recente per primo**. Ciascuno porta il momento nel fuso orario locale, il tipo (**Creato**, **Modificato**, **Eliminato**), l'utente, il computer e, per ogni campo toccato, il valore **Prima** e **Dopo**. Un valore mancante compare come «non presente», uno vuoto come «vuoto»; i due non sono la stessa cosa.

Due tipi sono contrassegnati a parte:

- **Modificato dall'esterno** significa che l'applicazione ha trovato, alla propria scrittura successiva, una differenza che non aveva causato essa stessa. Allora non è noto alcun autore, e il giustificativo lo dice.
- **Raggruppato** significa che il raggruppamento ha riunito in un solo giustificativo un periodo di più modifiche. Esso indica quante modifiche sostituisce, da quando si estende il periodo e quali tipi vi si trovavano.

Dove la traccia si rompe, la pagina lo dice nel punto in cui si nota. I casi sono due. Il valore precedente di un campo **è diverso**, allora il giustificativo non si collega a quello che lo precede. Oppure un giustificativo **non è leggibile**, allora non si sa che cosa abbia modificato, e la verifica riparte dopo di esso. Se l'intero file non è leggibile, la pagina dice anche questo e lascia intatto il suo contenuto.

La pagina **si limita a leggere**, in essa non si modifica nulla; il pulsante «Aggiorna» recupera di nuovo lo stato. Con moltissimi giustificativi mostra un estratto e scrive sopra di che cosa sia un estratto.

### Il raggruppamento

Un file di giustificativi cresce a ogni modifica. Perché non cresca senza fine, l'applicazione raggruppa, a partire da una doppia soglia, i giustificativi più vecchi dei record modificati di frequente invece di cancellarli. Senza un'indicazione propria valgono **0,7 MB** per l'intero file e **200 giustificativi per record**.

Entrambi i limiti si impostano per ogni tabella, nel frontmatter del file di tabella sotto l'indicazione `changeLog`:

```yaml
---
db-table:
  fields:
    - name: titolo
  changeLog:
    maxBytes: 2000000
    maxPerRecord: unlimited
---
```

`maxBytes` è la dimensione del file in byte, `maxPerRecord` il numero di giustificativi per record. La parola `unlimited` disattiva il limite corrispondente. Ogni indicazione vale per sé, un'indicazione omessa mantiene il proprio valore predefinito, e un'indicazione inutilizzabile viene segnalata come anomalia, dopo di che vale ugualmente il valore predefinito.

**Il raggruppamento ha un prezzo.** Un giustificativo raggruppato indica da quale valore a quale valore abbia portato un periodo, quante modifiche sostituisce e se al suo interno vi fosse una creazione o un'eliminazione. Non dice più chi abbia modificato che cosa e quando, singolarmente; quella parte della traccia è poi scomparsa. Una promessa vale senza eccezione: non si raggruppa mai al di là di un giustificativo del tipo **Modificato dall'esterno**. Esso chiude il periodo e resta invariato.

### Il limite, detto con onestà

Una modifica fatta a mano in un editor sul file di tabella non produce **alcun** giustificativo. L'applicazione non la vede nel momento in cui avviene.

Quello che fa invece: alla propria scrittura successiva confronta lo stato trovato con quello atteso. Se differiscono, per il momento non salva la nuova modifica, così che la versione attuale possa essere esaminata; se poi viene salvata comunque, un giustificativo del tipo **Modificato dall'esterno** fissa la differenza. Così non scompare nulla senza che lo si noti. Il giustificativo però non indica né il momento né l'autore di quella modifica, perché nessuno dei due è noto.

**Per questa via i permessi proteggono solo la definizione.** Se si salva una definizione modificata nell'editor dell'applicazione, l'applicazione controlla il ruolo proprio (sezione «Permessi»). Una modifica al blocco dei record, invece, lì non la controlla né rispetto al ruolo né rispetto alle regole della tabella, e con un altro editor non vale nessuno dei due controlli.

## Blocchi

Un blocco fa sì che un record non venga modificato in due punti contemporaneamente, per esempio in due finestre dell'applicazione. Blocchi e giustificativi di modifica sono concepiti per preparare l'accesso condiviso di più persone; tale accesso arriverà con EM4us, il futuro componente server. EM4me stesso è uno strumento per una persona che lavora da sola e in locale. L'uso di più computer in una stessa area su un'unità di rete non è garantito.

### Che cosa viene bloccato e quando

Viene bloccato il singolo **record**, e proprio nel momento in cui la sua modifica comincia. Viene rilasciato non appena la modifica finisce, tanto al salvataggio quanto all'abbandono. La semplice consultazione non blocca nulla: altrimenti un elenco con centinaia di record li bloccherebbe tutti in una volta a ogni sguardo.

Nella maschera la modifica comincia con **«Modifica»** oppure con **«Elimina»**, che prende il blocco già prima della sua richiesta di conferma. Finisce al salvataggio, con **«Scarta»**, con **«Ricarica»**, all'annullamento della richiesta di eliminazione, al passaggio a un altro record e alla chiusura della scheda della maschera. Se l'applicazione respinge un salvataggio, il blocco resta, perché la modifica continua. L'apertura della maschera e la creazione di un nuovo record non bloccano nulla. In una maschera elenco la modifica di una riga comincia con «Modifica», il doppio clic o «Elimina» e finisce con «Salva», «Annulla», la risposta alla richiesta di eliminazione e al più tardi quando il documento viene chiuso, la vista cambia o viene mostrato un altro documento aperto; una nuova riga non blocca nulla. Una riga della sezione delle posizioni di una maschera mantiene il suo blocco fino al salvataggio o all'annullamento della maschera.

Se viene modificata la **definizione di una tabella**, per quel tempo è bloccata la definizione, perché una modifica alle colonne tocca tutti i record della tabella.

### Quando un record è già bloccato

L'applicazione non sovrascrive mai in silenzio. Indica **chi** tiene il record, **su quale computer** e **da quando**, e lascia due vie: leggere il record in **sola lettura** oppure **forzare** il blocco.

Nella maschera questa indicazione compare come riquadro **«Il record è bloccato»**, e la maschera resta in lettura. **«Solo consultare»** chiude il riquadro. **«Forza il blocco»** compare solo quando il termine indicato sotto è scaduto, e dopo la forzatura porta direttamente alla modifica; se nel frattempo il blocco è cambiato, la forzatura viene respinta, e il riquadro mostra i dati riletti.

Un blocco altrui si può forzare solo quando è **più vecchio di quattro ore**. Il termine è volutamente grossolano: gli orologi di due computer possono discostarsi senza che una modifica in corso appaia abbandonata. Anche dopo la scadenza del termine l'applicazione non rimuove mai da sé un blocco altrui. Si limita a offrire la forzatura, e la decisione resta a chi lavora. Chi ha subito la forzatura del proprio blocco lo viene a sapere non appena la propria modifica finisce.

**Titolare sconosciuto.** Se esiste un blocco che non indica alcun titolare, per esempio perché al momento della creazione è stato scritto in modo incompleto, il riquadro lo dice esattamente così invece di inventare dati. Anche allora il record si può solo consultare, e il blocco si può forzare solo dopo la scadenza dello stesso termine.

Se un'**altra finestra** di questa applicazione sta modificando il record, il riquadro dice anche questo. Lì viene offerto solo «Solo consultare», perché il blocco di una propria finestra non si può forzare.

### Dopo un arresto anomalo

Se dopo un arresto anomalo dell'applicazione resta un blocco **proprio**, esso non è d'ostacolo: l'applicazione riconosce che il blocco proviene da questo computer e che il programma che lo teneva non è più in esecuzione, e lo rileva senza chiedere. Se invece è una seconda finestra dell'applicazione a tenere il record, lì esso vale come bloccato al pari che per chiunque altro.

### Che cosa il blocco non fa

Un blocco è un accordo fra le applicazioni che lavorano in quest'area, e non una proprietà del file. Chi modifica il file di tabella a mano in un editor non vede alcun blocco. Per questo l'applicazione verifica inoltre a **ogni** salvataggio se il record si presenta ancora come lo ha letto, anche quando tiene il blocco.

### La cartella dei blocchi

I blocchi si trovano come piccoli file in una cartella nella radice dell'area, in via predefinita `.area-locks`. Nasce con il primo blocco, e l'applicazione la tiene: non compare in alcun elenco di file, né nella ricerca né nelle statistiche. A differenza dei giustificativi di modifica non fissa nulla di duraturo. Se nessuno lavora, è vuota e può mancare. Durante un salvataggio l'applicazione vi deposita inoltre un piccolo protocollo dell'operazione, che scompare di nuovo quando questa finisce; se un arresto anomalo lascia l'operazione incompiuta, il protocollo resta finché l'applicazione non ha portato a termine l'operazione. Da essa non va cancellato nulla a mano finché qualcuno lavora o vi si trova un protocollo.

Il **nome della cartella** si cambia in **File → Impostazioni… → Area corrente → Banca dati**, nel campo **«Nome della cartella dei blocchi»**. Vale quanto segue:

- Il nome vale **per l'area** e quindi per tutte le persone che vi lavorano. Risiede nel file dell'area e viaggia con la cartella dell'area.
- Il nome **deve iniziare con un punto**, perché è proprio da questo che l'applicazione riconosce che una cartella non appartiene all'indice, alla ricerca e alle statistiche. Non sono inoltre ammessi i separatori di percorso, i caratteri vietati su Windows e i nomi di dispositivo riservati come `CON`, e sotto quel nome non deve trovarsi ancora nient'altro nella radice dell'area.
- La modifica rinomina la cartella esistente invece di crearne una seconda. Riesce soltanto **finché nessuno ha un record in modifica**. Altrimenti il messaggio indica chi sta lavorando, e tutto resta com'era.

## Permessi

**I permessi impediscono errori di utilizzo, non abusi.** Sono un accordo di lavoro come il blocco e non una garanzia di riservatezza. Non esiste un permesso di lettura: chi può leggere i file dell'area li legge con qualsiasi editor e lì può anche modificarli, senza che venga interpellato alcun ruolo. Si può imporre solo il limite del sistema operativo, cioè chi può accedere alla cartella.

All'interno dell'applicazione i permessi stabiliscono chi può modificare che cosa. La scheda porta a questo scopo dei **ruoli** con nome, e ogni ruolo dice per ogni tabella quali azioni sono permesse. La separazione più importante è quella tra la cura dei dati e la modifica della definizione: chi usa una banca dati consegnata per curarne i dati non deve modificarne lo schema per sbaglio. Questo aiuta già quando con la banca dati lavora una sola persona.

### Ruoli nella scheda

I ruoli stanno sotto `roles` nel contenitore `db-database`, accanto il ruolo predefinito e l'assegnazione dei nomi di accesso:

```yaml
db-database:
  name: Biblioteca
  roles:
    bibliotecario: all
    assistente:
      Libri: [update]
      Prestiti: [create, update, delete]
  defaultRole: assistente
  users:
    mstumm: bibliotecario
```

Ogni ruolo porta o la parola `all` o una corrispondenza da nomi di tabella a un elenco delle operazioni permesse:

| Operazione | Significato |
| --- | --- |
| `create` | creare record |
| `update` | modificare record |
| `delete` | eliminare record |
| `define` | modificare la definizione della tabella |

La parola `all` vale in tre posizioni: come valore di un ruolo per tutte e quattro le operazioni su tutte le tabelle, come nome di tabella per tutte le tabelle e come voce di un elenco per tutte e quattro le operazioni. Una tabella che un ruolo non nomina non gli permette nulla, così come un elenco vuoto. Le operazioni e i nomi di tabella valgono senza distinzione tra maiuscole e minuscole, i nomi dei ruoli così come sono scritti.

**Senza `roles` tutto è permesso**, come in una banca dati senza permessi. La panoramica della banca dati mostra nel blocco della scheda la sezione **«Ruoli»**, con una riga per ruolo e i suoi permessi per tabella. Se un ruolo nomina una tabella che non esiste o un'operazione sconosciuta, l'intero ruolo vale come non impostato; la panoramica indica ognuno dei suoi errori tra le anomalie.

### Quale ruolo vale

Sotto `users` la scheda assegna un ruolo ai nomi di accesso, e `defaultRole` nomina il **ruolo predefinito** per tutti gli altri. Conta il nome di accesso con cui si è collegati al sistema operativo, lo stesso che i giustificativi di modifica indicano come utente. Viene confrontato carattere per carattere: `MStumm` e `mstumm` sono due nomi. Non esiste un'interfaccia di gestione; l'assegnazione si cura a mano nella scheda, come la definizione.

Vale la prima regola che si applica:

1. Senza ruoli tutto è permesso.
2. Se il proprio nome di accesso sta sotto `users`, vale il ruolo assegnatogli.
3. Altrimenti vale il ruolo predefinito.
4. Senza ruolo predefinito tutto è permesso.

Quale ruolo vale per sé lo mostra la panoramica nella riga **«Ruolo proprio»**, con il nome di accesso così com'è: il ruolo assegnato, il ruolo predefinito o «tutto consentito (nessuna assegnazione)». Chi inserisce un'assegnazione riprende il nome nel modo più sicuro da lì. Se `users` o `defaultRole` nomina un ruolo che non esiste, quell'indicazione vale come non impostata e viene ugualmente segnalata.

### Controllo alla scrittura

Ogni modifica ai record passa per la via descritta nella sezione «Salvataggio da parte dell'applicazione», e lì l'applicazione controlla per primo il ruolo, per ogni record con tabella e operazione. Se il permesso manca, l'intera operazione viene respinta, e l'avviso nomina ruolo, tabella e azione. Anche l'inizio di un nuovo record richiede `create`: senza questo permesso l'applicazione respinge la creazione, per esempio con il comando «Nuovo record nella tabella attiva», e la barra di stato ne indica il motivo. Se i permessi non si possono determinare, perché le tabelle dell'area non sono ancora state lette per intero o la scheda non è leggibile, non si scrive nulla neanche in quel caso, e l'avviso invita a riprovare tra un momento.

### Controllo al salvataggio della definizione

La definizione è il contenitore `db-table` di un file di tabella e la scheda `db-database`. Se il salvataggio di un file ne cambia la definizione, l'applicazione richiede `define`: su quella tabella per un file di tabella, su tutte le tabelle per la scheda. Ciò vale nel salvataggio nell'editor, per **«Salva con nome…»** su un file esistente o nuovo e per la sostituzione nell'intera area. Se il permesso manca, non si scrive nulla. Al salvataggio compare la finestra di errore **«Errore di scrittura»** con una frase che nomina ruolo e tabella, e il testo resta non salvato nell'editor; la sostituzione nell'intera area riporta il file nel suo resoconto sotto **«Non sostituiti»**.

Ciò che non tocca la definizione resta libero: il blocco dei record e il resto del testo del file, così come i file di maschera e di query. Un'altra rientranza o un altro ordine delle indicazioni non conta come modifica, l'ordine dei campi invece sì, perché determina le colonne. Il livello di piena `lastId` lo aggiorna l'applicazione stessa; non conta mai come modifica.

### Nelle maschere e nella panoramica

Le maschere offrono solo ciò che il ruolo proprio permette; chi progetta una maschera non vi scrive nulla per questo.

- Nella **maschera**, senza `update` manca l'azione «Modifica», i campi restano in lettura, e una frase nomina il ruolo che non può modificare i record di questa tabella. Senza `delete` manca «Elimina».
- Senza `create` manca il pulsante **«Nuovo record»** sotto la tabella e nella riga della tabella nella panoramica.
- Una **maschera elenco** e una sezione delle posizioni offrono solo le azioni che `allow` e il ruolo permettono insieme. Se `allow` permette la modifica e il ruolo no, un suggerimento della riga nomina il ruolo; una riga a cui non resta alcuna azione appare attenuata.
- La **panoramica** indica sotto ogni tabella i permessi del ruolo proprio, per esempio «Permessi: creare, modificare», purché la scheda porti dei ruoli.

Le maschere mostrano, si decide alla scrittura: chi avvia un'azione per un'altra via viene respinto dal controllo descritto sopra.

### Non chiudersi fuori da soli

Chi modifica la scheda in modo che il ruolo proprio non abbia `define` su tutte le tabelle non può più modificarla in seguito nell'applicazione, nemmeno per tornare indietro. È la separazione voluta, ma nell'uso da parte di una sola persona colpisce chi la scrive. Tre vie riportano indietro: si apre il file della scheda con un altro editor e lì si eliminano o si correggono le indicazioni dei ruoli. Si disattiva l'estensione «Banca dati», si corregge la scheda nell'applicazione e la si riattiva; finché è disattivata, il salvataggio non controlla alcun ruolo (sezione «Disattivare la banca dati»). Oppure, prima di restringere i ruoli, si assegna sotto `users` il proprio nome di accesso a un ruolo con `define` su tutte le tabelle, per esempio un ruolo con `all`.

### Cessione e nomi di accesso nel file

I ruoli fanno parte della definizione e viaggiano con la scheda. L'assegnazione sotto `users` sta nello stesso file: lì i nomi di accesso sono leggibili per chiunque possa aprire il file, e una copia della cartella li porta con sé. L'applicazione non offre una cessione che tralasci l'assegnazione; chi cede un'area ne toglie prima l'assegnazione, se non deve andare con essa. Presso il destinatario un'assegnazione vale solo se il suo nome di accesso coincide esattamente; altrimenti per lui vale il ruolo predefinito o, senza di esso, tutto è permesso.

## Verifica di coerenza

Nel salvataggio da parte dell'applicazione ogni modifica viene verificata. Ciò che arriva nei file per un'altra via, per esempio a mano in un editor, nessuno lo verifica strada facendo, e alcune regole in lettura non agiscono affatto. La **verifica di coerenza** percorre quindi l'intero insieme dei dati e indica dove esso contraddice le regole della banca dati.

Si trova nella panoramica della banca dati: **«Verifica coerenza»** nell'intestazione verifica tutte le tabelle, **«Verifica»** nella riga di una tabella solo quella. Anche il comando **«Verifica la coerenza del database»** nella palette dei comandi verifica tutte le tabelle; per farlo apre la panoramica.

Il risultato compare nella sezione **«Verifica di coerenza»** della panoramica: la durata, per ogni tabella il numero dei suoi record e dei rilievi, e sotto i rilievi con tabella, record, campo e una frase in chiaro. Un clic sul record apre la sua maschera. L'elenco mostra al massimo i primi 500 rilievi e indica allora quanti sono in totale.

Vengono trovati:

- una chiave funzionale assegnata più volte, con un rilievo per ogni record coinvolto, e un identificatore che compare più di una volta nella tabella;
- un collegamento che non colpisce alcun record, che ne colpisce più di uno o che punta tramite un valore di chiave a una tabella con chiave a più elementi, e una colonna di collegamento la cui tabella di destinazione manca o non è indicata;
- un valore che non corrisponde al suo tipo, che viola una regola di campo o che manca pur essendo obbligatorio, e un record che viola una regola sotto `checks`;
- un record con più o meno celle di quanti campi abbia la tabella;
- in un file di maschera, un campo sconosciuto, un segnaposto sconosciuto, un'espressione non valida di un segnaposto di valore, un marcatore di sezione condizionale senza controparte, una condizione non valida o una tabella sconosciuta, e in una definizione di tabella un'indicazione `form` che non indica alcun file di maschera di questa tabella;
- in un file di maschera, inoltre, un percorso che non indica nessun campo di riferimento o nessun campo della tabella di destinazione, e una sezione delle posizioni il cui file di query manca o non porta `editable: true`, le cui posizioni non hanno nessun campo di riferimento o nessuno univoco verso la tabella della maschera, o la cui query non si può completare con la relazione;
- in un file di query, un'indicazione inutilizzabile nel contenitore `db-query`, un'azione sconosciuta in `allow` e un'indicazione `form` che non indica alcun file di maschera della banca dati; un tale rilievo indica nella colonna «Origine» il file invece di una tabella;
- nella verifica di tutte le tabelle, un'indicazione inservibile nella scheda sotto `roles`, `defaultRole` o `users`, per esempio un ruolo con una tabella o un'operazione sconosciuta o un'assegnazione a un ruolo che non esiste; la panoramica ne indica il motivo tra le anomalie;
- come avviso, una tabella che porta record ma nessun livello di piena `lastId` o uno troppo basso; la prossima creazione si colloca allora sopra l'identificatore più alto esistente e lo innalza;
- una tabella la cui definizione non si può leggere; i suoi record restano allora non verificati, e la verifica prosegue con le altre tabelle.

**La verifica non cambia nulla.** Si limita a leggere, e una funzione che ripulisca da sé i rilievi volutamente non esiste: quale di due record con la stessa chiave sia quello giusto si decide nella maschera. Il risultato resta visibile finché la panoramica è aperta; dopo una correzione si verifica di nuovo.

La verifica è rapida: con alcune migliaia di record dura alcune decine di millisecondi. Se l'indice dell'area è ancora in costruzione, lo segnala e chiede di riprovare tra poco.

## Utilizzo di tabelle e record

L'**utilizzo** indica chi usa una tabella o un record. Viene letto solo quando lo si chiede, e non viene cambiato nulla.

**Per una tabella** l'azione **«Utilizzo»** compare nella sua riga della panoramica. Sotto «Utilizzato da» indica le tabelle che puntano a questa tabella con una colonna di collegamento, ciascuna con i nomi di quelle colonne, e i file di maschera della tabella. Se nessuno la usa, indica «Non utilizzato».

**Per un record** l'azione **«Utilizzato da»** compare nell'intestazione della sua maschera finché questa è in lettura. Elenca i record che rimandano a esso, ciascuno con tabella, campo, forma di visualizzazione e identificatore; un clic apre la maschera del record che rimanda, e «Indietro» riporta al record mostrato. Per un nuovo record l'azione manca, perché nessuno può rimandare a un record non ancora salvato.

**L'elenco del record è l'anteprima della protezione dall'eliminazione.** Cerca esattamente come la verifica all'eliminazione, anche tramite la forma breve dell'identificatore, tramite il valore di una chiave a un solo elemento e nei file successivi di una tabella. Se un record vi compare, quello mostrato non si può eliminare. Un record che rimanda a se stesso non compare, perché non impedisce la propria eliminazione. Come per la protezione dall'eliminazione conta solo la colonna di collegamento; un collegamento nel testo corrente, per esempio `[[Clienti#^r-00001]]`, non è un utilizzo.

## Reperibilità: ricerca e collegamenti

La ricerca sull'**area** trova i record come risultati propri. Nel pannello «Risultati della ricerca», dopo i gruppi dei documenti, ogni tabella ha un gruppo proprio con il nome della tabella e l'aggiunta «Record». Ogni riga indica il record con la sua forma di visualizzazione e il campo che contiene il termine cercato, e ne mostra il valore con la corrispondenza evidenziata. Un clic apre il record nella maschera predefinita della sua tabella. Vengono cercati i valori dei campi in tutti i file di una tabella, compresi i suoi file successivi, e, per una tabella aperta, il suo stato non salvato. Il conteggio sopra l'elenco conta insieme le corrispondenze dei documenti e dei record. Con la riga di sostituzione aperta i gruppi di record vengono omessi, perché la sostituzione nell'area non scrive nei record.

Il blocco di record stesso, invece, non fa parte dello spazio di ricerca del testo completo: un termine che compare solo nei record di un file di tabella non dà alcuna corrispondenza per quel documento, ma soltanto i risultati di record. Il testo esplicativo che precede il blocco di dati resta consultabile come documento, e una corrispondenza che segue il blocco porta ancora al punto giusto. Il motivo sta nell'area e non nella tabella: lo spazio di ricerca tiene in memoria i testi di tutti i file Markdown e porta per questo un tetto sull'**intera** area. Bastano poche tabelle di qualche megabyte a romperlo, e da quel momento ogni ricerca torna a leggere dal disco, anche quella su un documento ordinario. I record nello spazio di ricerca costerebbero dunque la velocità non a se stessi, ma all'intera area.

Inoltre, tre vie portano ai record:

- **Cercare nel documento aperto.** Chi ha davanti il file di tabella e vi cerca dentro (predefinito `Ctrl+F`) cerca nel testo che ha davanti e ritrova i suoi record immutati. Il limite qui sopra riguarda soltanto la ricerca sull'area.
- **Porre una query sui record.** Un blocco `perspective-query` con `LIST RECORDS` o `TABLE RECORDS` trova i record in base ai loro campi, ad esempio tutti i libri di un autore; la pagina [Query Perspective](frontmatter-query.md) la descrive. Una query che serve spesso si può conservare come file di query (sezione «File di query»).
- **Rimandare direttamente a un record**, come descritto nella sezione seguente.

### Collegamento a un singolo record

Un collegamento indica la tabella e l'identificatore interno, scritto come un'ancora di blocco:

```markdown
[[Personen#^r-00042]]
```

**Altre due grafie** valgono ugualmente: la forma breve dell'identificatore, `[[Personen#^r-42]]`, e la forma di visualizzazione del record, `[[Personen#^Anna Muster]]`. Una forma di visualizzazione in un collegamento è composta da lettere, cifre, spazi e dai caratteri trattino basso, trattino, punto, apostrofo, virgola e parentesi tonde; con un altro carattere, per esempio `&`, non si risolve. Il confronto avviene senza spazi iniziali e finali, ma tenendo conto di maiuscole e minuscole. L'applicazione non riscrive il collegamento: viene salvato così come è scritto.

**La risoluzione segue un ordine fisso.** Se il file di tabella porta un'ancora di blocco con esattamente questo nome, il collegamento vale per essa, e il linter segnala che l'ancora di blocco nasconde un record; allo stesso modo il clic porta a un titolo con lo stesso nome. Altrimenti conta prima l'identificatore, lungo o breve, poi la forma di visualizzazione. Se più record portano la stessa forma di visualizzazione, il collegamento vale comunque, il linter lo segna come nome di record ambiguo, e il clic apre il file di tabella; l'identificatore lo rende univoco.

**L'elenco dei suggerimenti aiuta a scrivere.** Dopo `[[Tabella#^` propone, dopo le ancore di blocco del file, i record della tabella, ciascuno con la sua forma di visualizzazione e l'aggiunta «Record», al massimo 30 voci in tutto. Digitando si restringe l'elenco per forma di visualizzazione e identificatore, e la scelta scrive l'identificatore lungo, per esempio `[[Personen#^r-00042]]`.

Il collegamento **vale** se la tabella indicata porta quel record, ed è rotto se non lo porta. Si comporta così come ogni altro collegamento dell'applicazione. Vale anche quando il record non si trova nel primo file della tabella ma in uno dei suoi file successivi: per chi lo scrive la tabella è una sola, e la sua distribuzione su più file non lo riguarda.

La verifica avviene sullo stato **salvato** della tabella, come per ogni altra ancora. Un collegamento a un record appena creato e non ancora salvato non vale quindi ancora, e una forma di visualizzazione modificata si risolve solo dopo il salvataggio.

Se un collegamento vale lo mostra il [linter Markdown](tools.md): una destinazione rotta riceve una sottolineatura ondulata nell'editor, cioè nelle viste Sorgente, Divisa e Live. La sola vista di lettura non rappresenta la validità; lì i collegamenti validi e quelli rotti appaiono uguali.

**Un clic apre la maschera del record**, nella maschera predefinita della sua tabella. L'azione **«Mostra nel documento di tabella»** nell'intestazione della maschera porta alla riga nel file di tabella (sezione «Leggere e modificare»). Se un collegamento non corrisponde ad alcun record in modo univoco, il clic apre il file di tabella. Al di fuori di un'area aperta, il clic apre il file di tabella e porta in vista la riga del record. Nel risultato di una query sui record, un clic su un record apre ugualmente la sua maschera.

**Un collegamento nel testo non trattiene il record.** Se il record viene eliminato, il collegamento si rompe come ogni altro collegamento dell'applicazione, e il linter lo mostra. La protezione dall'eliminazione la porta soltanto la colonna di collegamento (sezione «Utilizzo di tabelle e record»).

## File di query

Una query che serve spesso riceve un documento proprio: se porta nel frontmatter la marca `db-query` e nel testo esattamente un blocco di query, è un **file di query**. Il resto del testo descrive la query e appare come in ogni documento.

````markdown
---
db-query:
paginemin: 500
---

# Libri lunghi

Libri con più di `paginemin` pagine, i più lunghi per primi.

```perspective-query
TABLE RECORDS autore, pagine FROM "Libri" WHERE pagine > this.paginemin SORT pagine DESC
```
````

- **La marca basta.** Il file si riconosce dalla sola marca, basta `db-query:` senza valore; la query indica essa stessa la propria tabella in `FROM`. La query può rivolgersi a qualsiasi livello, ai file come ai record. Con le indicazioni `editable`, `form` e `allow` nel contenitore il file diventa una maschera elenco, descritta nella sezione seguente.
- **Aprire e incorporare.** Aperto, il file mostra il suo risultato come ogni documento con un blocco di query. Un altro documento lo incorpora con `![[Libri lunghi]]` e mostra lo stesso risultato, perché `this.` indica allora il file di query e non il documento che lo incorpora. Una query che legge valori del documento che la incorpora quindi non esiste.
- **Creare.** Non esiste un comando apposito: un file di query si scrive a mano o a partire da un proprio [modello](templates.md).
- **Senza la marca** un documento con un blocco di query resta una query nel testo corrente e non compare nella panoramica.
- **Nella panoramica** della banca dati ogni file di query sta nella sezione «Query» (sezione «L'area come banca dati»); l'assenza di blocchi di query o la presenza di più blocchi viene segnalata tra le anomalie (sezione «Indicazioni difettose»).

**Due significati di `editable`.** Nella definizione di una tabella, nel contenitore `db-table`, `editable` è una condizione che dice per ogni record separatamente se può ancora essere modificato (sezione «Modificabilità condizionata»). Nel contenitore `db-query` di un file di query, `editable` è un sì o un no e fa del file una maschera elenco. I due agiscono insieme: una maschera elenco offre la modifica solo per le righe il cui record soddisfa la condizione della sua tabella.

## Maschera elenco

Un file di query diventa una **maschera elenco** quando il suo contenitore `db-query` porta l'indicazione `editable: true`. Mostra allora i suoi record come griglia, in cui le righe si aprono, si modificano, si creano e si eliminano; il resto del testo del file descrive l'elenco come in ogni file di query.

````markdown
---
db-query:
  editable: true
  form: Prestiti Form
  allow: [create, update, delete]
---

# Prestiti aperti

```perspective-query
TABLE RECORDS libro, lettore, uscita, scadenza FROM "Prestiti" WHERE NOT restituito SORT scadenza
```
````

| Indicazione | Significato |
| --- | --- |
| `editable` | `true` fa del file di query una maschera elenco. Senza l'indicazione o con `false` resta un normale file di query |
| `form` | il nome del file di maschera senza estensione che un clic su una riga apre. Senza l'indicazione vale la maschera predefinita della tabella |
| `allow` | le azioni consentite come elenco di `create` (creare), `update` (modificare) e `delete` (eliminare). Senza l'indicazione vale solo `update`; un elenco vuoto non ne consente nessuna |

`form` e `allow` agiscono solo insieme a `editable: true`.

### Vedere e aprire

In ogni vista che mostra il risultato, cioè nelle viste Renderizzato, Diviso e Live, la griglia sta al posto della tabella dei risultati: le stesse colonne, davanti la colonna «Record», sopra una riga di conteggio come «Righe da 1 a 50 di 120». Una pagina mostra 50 righe fisse; se le righe sono di più, **«Avanti»** e **«Indietro»** sfogliano le pagine.

Un clic su una riga apre il suo record nella maschera indicata da `form`, altrimenti nella maschera predefinita della sua tabella. Se `form` indica un file di maschera che non esiste o che appartiene a un'altra tabella, il clic apre ugualmente la maschera predefinita, e la panoramica mostra un avviso tra le anomalie del file di query. In una riga modificabile, un clic semplice su una cella modificabile non apre la maschera, perché lì il doppio clic avvia la modifica; la maschera la aprono allora la colonna «Record» e le celle in sola lettura. Se la query porta `WITHOUT ID`, la colonna «Record» manca, e in una tale riga solo una cella in sola lettura apre la maschera. Un collegamento in una cella apre, come ovunque, la maschera della sua destinazione.

**Guardare non blocca nulla.** Altrimenti un elenco con centinaia di record li bloccherebbe tutti a ogni occhiata; viene bloccata solo la riga di cui inizia la modifica.

Una maschera elenco legge esattamente una tabella. Sono modificabili solo le colonne che indicano esattamente un campo di questa tabella; una colonna calcolata, un percorso attraverso un campo di riferimento e `record.id` restano in sola lettura. L'intero elenco resta in sola lettura se è raggruppato o sceglie una forma di visualizzazione con `DISPLAY`: una frase lo dice, e sotto compare il risultato come in ogni query. Una query su file, blocchi o attività invece che su record e una query i cui risultati provengono da più tabelle mostrano la normale tabella dei risultati.

### Modificare le righe

Se `allow` consente la modifica, la griglia porta a fine riga la colonna **«Azioni»**. **«Modifica»** lì o un doppio clic nella riga avvia la modifica: l'applicazione blocca il record, ne legge lo stato attuale dal file e trasforma le celle modificabili in campi di inserimento nella forma del loro tipo, come nella maschera. **«Salva»** o il tasto Invio scrive, in un campo su più righe Maiusc+Invio va a capo; **«Annulla»** o il tasto Esc scarta. Lasciare semplicemente la riga non salva. Si scrive per la stessa via della maschera, con tutte le regole della tabella.

Si modifica una riga alla volta: finché è aperta, lo sfogliare e le azioni delle altre righe sono bloccati. Se il documento viene chiuso, la vista cambia o viene mostrato un altro documento aperto, la modifica finisce senza salvare, e il blocco viene rilasciato.

Se l'applicazione respinge la modifica, la riga resta in modifica. Se il messaggio riguarda un campo, compare sulla sua cella; una regola su più campi compare nella colonna «Azioni». Se qualcuno ha modificato il record da quando la riga lo ha letto, sotto la riga compare lo stesso riquadro della maschera, con **«Ricarica»** e **«Salva comunque»**. Se un altro punto tiene bloccato il record, sotto la riga compare l'avviso della sezione «Blocchi». Se non ha modificato nulla, non c'è niente da salvare, e la riga torna alla lettura.

Se un record può essere modificato lo dice l'indicazione `editable` della sua tabella **per ogni riga**: una riga il cui record secondo questa condizione non è modificabile appare attenuata, senza «Modifica» e senza «Elimina», e un suggerimento ne indica il motivo.

### Creare ed eliminare

Con `create` in `allow`, accanto alla riga di conteggio c'è il pulsante **«Nuova riga»**. Mette una riga vuota in cima alla pagina mostrata, che mostra «Nuovo» nella colonna «Record», e vi avvia la modifica. Il nuovo record riceve il suo identificatore già ora, come nella maschera; nel file arriva solo con **«Salva»**, e dopo sta dove lo colloca l'ordinamento della query, eventualmente su un'altra pagina. **«Annulla»** toglie di nuovo la riga.

Con `delete` in `allow`, ogni riga modificabile porta **«Elimina»**. L'applicazione blocca il record e chiede conferma sotto la riga, come la maschera: **«Sì, elimina»** elimina, e l'elenco mostra poi i record senza di esso; **«No»** lascia tutto com'è. Un record a cui punta ancora una colonna di riferimento non si può eliminare nemmeno qui: il messaggio compare sotto la riga, e la riga resta.

Senza `update` mancano «Modifica» e il doppio clic, e un clic su qualsiasi cella apre la maschera; «Nuova riga» ed «Elimina» restano nella misura in cui `allow` li consente.

## Posizioni nella maschera

Oltre ai campi del suo record, una maschera può mostrare i record di un'altra tabella che puntano a esso, per esempio le posizioni di una fattura o i prestiti di un libro. Per questo il file di maschera porta il segnaposto `{{list:<file di query>}}` da solo sulla sua riga, con il nome di una maschera elenco senza estensione:

```markdown
**Titolo:** {{field:titolo}}

## Prestiti

{{list:Prestiti aperti}}
```

La **sezione delle posizioni** mostra la griglia di questa maschera elenco, limitata ai record il cui campo di riferimento punta al record mostrato. Per questo l'applicazione completa la query con questa condizione; colonne, ordinamento e le altre condizioni del file di query restano valide. Se la tabella delle posizioni ha esattamente un campo di riferimento verso la tabella della maschera, è quello inteso; se ne ha più di uno, `{{list:<file di query> BY <campo di riferimento>}}` indica quello inteso. In mezzo a una riga di testo il segnaposto resta testo e viene segnalato.

**Mentre la maschera è in lettura, anche la sezione lo è:** un clic su una riga apre la posizione nella sua maschera. **In modifica** la sezione offre le azioni che `allow` del file di query consente, come l'elenco autonomo. Una riga salvata, però, viene solo **annotata**: mostra il suo nuovo stato, un suggerimento dice «Annotato; verrà salvato con la maschera.», e il suo blocco resta; una riga annotata per l'eliminazione resta al suo posto, contrassegnata. Una nuova posizione riceve il riferimento al record mostrato senza alcun inserimento, anche se quel record viene creato proprio in quel momento.

**Si salva con la maschera, tutto o niente.** **«Salva»** della maschera scrive l'intestazione e tutte le posizioni annotate in un'unica operazione. Se una riga della sezione è ancora in modifica, viene prima annotata; se in questo viene respinta, la maschera non salva e lo dice. Se l'applicazione respinge l'operazione, non viene scritto nulla, e tutto resta; il messaggio su una posizione compare nell'intestazione della maschera e comincia con «Posizione» e il suo numero tra le righe annotate. Dopo il salvataggio tutti i blocchi sono rilasciati.

**«Scarta»** scarta intestazione e posizioni insieme e rilascia tutti i blocchi. Una nuova riga annotata si può modificare di nuovo, ma non ritirare da sola; sparisce solo con «Scarta». Le posizioni annotate contano come modifica non salvata: prima del passaggio a un altro record la maschera chiede conferma.

Se la sezione non si può costruire, al suo posto compare un avviso con la riga del file di maschera; la sezione «Indicazioni difettose» indica i casi.

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
- **`roles`**, **`defaultRole`** e **`users`** portano i ruoli della banca dati, il ruolo predefinito e l'assegnazione dei nomi di accesso; la sezione «Permessi» li descrive. Senza di essi nella banca dati tutto è permesso.

Ognuna di queste indicazioni può mancare per conto proprio, e nessuna è presupposto per le tabelle: ogni tabella porta da sé la propria definizione e resta pienamente interpretabile anche senza scheda.

## L'area come banca dati

Non appena un documento contenuto in un'area porta la scheda della banca dati, l'applicazione tratta quell'area come **area di banca dati**. Non occorre dichiararla a parte: la scheda è la dichiarazione. L'affermazione sta così in un solo punto e non in due che potrebbero contraddirsi.

Un'area di banca dati riceve due cose che un'area ordinaria non ha.

**La panoramica degli oggetti della banca dati** risponde in un solo punto alla domanda su che cosa si trovi in quest'area: la scheda della banca dati con nome e descrizione, le tabelle ciascuna con il numero dei propri campi, i file di query e le anomalie emerse nella lettura delle definizioni, in chiaro e non come codice. Si apre in una scheda a sé, e nella panoramica stessa non si modifica nulla; le sue azioni portano alla maschera e alle verifiche. Tre vie vi conducono:

- **Visualizza → Panoramica della banca dati**,
- il **menu contestuale del pannello dell'area**,
- la **palette dei comandi**.

In un'area senza banca dati nessuna di queste vie viene offerta.

Nell'elenco delle tabelle la colonna **«Maschera»** indica il file di maschera di una tabella e resta vuota per la maschera generata. La panoramica porta inoltre quattro azioni: **«Verifica coerenza»** nell'intestazione per tutte le tabelle e, nella riga di ogni tabella, **«Nuovo record»**, **«Verifica»** e **«Utilizzo»**. Ciò che fanno lo descrivono le sezioni «Modificare i record nella maschera», «Verifica di coerenza» e «Utilizzo di tabelle e record». La sezione **«Query»** indica ogni file di query con il suo nome e la sua posizione, la cartella relativa alla radice dell'area, e **«Apri»** lo apre come ogni documento; se l'area non ne contiene, vi compare una frase esplicativa. Tra le anomalie compaiono anche gli avvisi sui file di maschera e di query, indicati con il nome del file. La colonna **«Tipo»** della sezione «Query» distingue una normale «Query» da una «Maschera elenco» e per questa indica le azioni consentite; se non ne consente nessuna, vi si legge «Maschera elenco, sola lettura». Nel blocco della scheda la panoramica indica inoltre il ruolo proprio e, se la scheda porta dei ruoli, anche questi con i loro permessi, e sotto ogni tabella i permessi del ruolo proprio (sezione «Permessi»).

**La sezione delle impostazioni «Banca dati»** si trova nel gruppo di navigazione «Area corrente» (File → Impostazioni… → Area corrente → Banca dati; con un libro aperto il gruppo si chiama **Libro corrente**, con una libreria aperta **Libreria corrente**). Mostra la stessa informazione in forma breve, cioè nome e descrizione della banca dati, il numero delle sue tabelle e il numero delle anomalie, e porta un'opzione: **«Mostrare il riepilogo all'apertura dell'area»**. Se è attiva, la panoramica si apre da sé non appena l'area viene collegata. L'opzione risiede nel file dell'area e viaggia con la cartella dell'area. Vi si aggiunge il campo **«Nome della cartella dei blocchi»**; è descritto nella sezione «Blocchi».

Inoltre l'applicazione tiene nella radice dell'area il piccolo file `Area_Database.mdda`. Contiene lo stato del contatore dei identificatori di operazione, non compare in alcun elenco di file e viaggia con la cartella dell'area; su di esso non va fatto nulla. Se manca, l'applicazione ricava di nuovo lo stato dai giustificativi di modifica.

## Indicazioni difettose

Per la definizione intera vale la linea morbida della casa: una **singola indicazione** difettosa decade e viene segnalata, la voce resta efficace; una **voce** difettosa decade, le altre colonne restano. L'avviso indica il punto, cioè la colonna interessata, l'indicazione errata e ciò che era atteso al suo posto.

L'unica eccezione è il **tipo**: un tipo al di fuori dell'insieme qui sopra fa decadere la voce intera, perché una colonna senza un tipo interpretabile non è una colonna.

Un'indicazione che l'applicazione non conosce decade singolarmente con un avviso e non causa alcun danno.

Per l'indicazione `changeLog` dei giustificativi di modifica valgono tre anomalie proprie. Se `changeLog` non è esso stesso un oggetto, questa tabella non conserva limiti propri, e valgono i valori predefiniti dell'applicazione. Se `maxBytes` oppure `maxPerRecord` non è un numero intero maggiore di zero né la parola `unlimited`, quella singola indicazione viene scartata, e vale il suo valore predefinito. Ognuna di queste situazioni viene segnalata; nessuna viene passata sotto silenzio.

La stessa linea morbida vale per le regole di verifica e per la condizione di modificabilità, regola per regola. Una regola inservibile sotto `check` oppure `checks` decade singolarmente, e le altre regole, il campo e la tabella restano; vengono segnalati una voce che non è né testo né un oggetto con `rule`, un'espressione regolare non valida, un'espressione non valida, una regola di campo con un riferimento diverso da `value`, un nome di regola sconosciuto e una regola sotto `checks` che indica un campo sconosciuto. Se `checks` non è un elenco, decadono tutte le regole sotto `checks`. Un'indicazione `editable` inservibile decade allo stesso modo, e la tabella resta modificabile. Un messaggio che non si può interpretare decade da solo; la sua regola o la sua condizione continua a verificare. Un'indicazione `editable` inservibile su un campo decade allo stesso modo, e il campo resta modificabile.

La stessa linea tollerante vale per i file di maschera. Se il contenitore `db-form` non indica alcuna tabella, o una che nella banca dati non esiste, il file resta un documento ordinario. Entrambi i casi compaiono tra le anomalie della panoramica; più file di maschera di una tabella, invece, non sono un'anomalia, ma il caso della sezione «Più maschere e la maschera predefinita». Un segnaposto che non è né di campo né di valore e un nome di campo che la tabella non conosce restano come testo, e un segnaposto di valore con un'espressione non valida lascia vuoto il suo punto; la maschera segnala tutti e tre con la loro riga nella propria intestazione, e la verifica di coerenza li elenca come rilievi. Un marcatore `{{end}}` senza sezione aperta viene ignorato, una sezione senza `{{end}}` mostra il suo contenuto come fuori dalla sezione, e una sezione con una condizione non valida resta nascosta; anche questi tre la maschera li segnala con la loro riga nella propria intestazione, e la verifica di coerenza li elenca come rilievi. Un marcatore che non sta da solo sulla sua riga non è un marcatore e resta testo come segnaposto sconosciuto. Se l'indicazione `form` della definizione di tabella non indica alcun file di maschera, uno che per questa tabella non esiste o il file di maschera di un'altra tabella, un avviso compare tra le anomalie della panoramica, e vale la maschera predefinita senza indicazione; la verifica di coerenza elenca inoltre gli ultimi due casi come rilievi sulla tabella. Un percorso che non indica nessun campo di riferimento della tabella o nessun campo della tabella di destinazione lascia vuoto il suo punto e viene segnalato allo stesso modo con la sua riga. Per la sezione delle posizioni ci sono cinque casi: il file di query indicato non esiste; non porta `editable: true`; le posizioni non hanno nessun campo di riferimento verso la tabella della maschera; ne hanno più di uno, e `BY` non ne indica nessuno; oppure la query non indica una singola tabella o non si può completare con la relazione. Nel secondo caso la sezione resta in sola lettura, altrimenti vuota; ogni caso compare come avviso con la sua riga al posto della sezione, e la verifica di coerenza lo riporta come rilievo del file di maschera.

La stessa linea tollerante vale per i file di query. Se un documento con la marca `db-query` non contiene alcun blocco di query o ne contiene più di uno, resta un documento ordinario, e ogni suo blocco viene valutato. La panoramica lo elenca comunque nella sezione «Query» e indica il caso tra le anomalie, con il nome del file. La stessa linea vale per le indicazioni di una maschera elenco, indicazione per indicazione: un `editable` che non è un valore di verità vale `false`; un `form` che non indica alcun nome decade; un `allow` che non è né un'azione né un elenco ripiega su `update`, e una parola sconosciuta al suo interno decade da sola. `form` o `allow` senza `editable: true` non hanno effetto, e ogni altra indicazione nel contenitore viene ignorata. Se `form` indica un file di maschera che non esiste nella banca dati o che appartiene a una tabella diversa da quella della query, un clic su una riga apre la maschera predefinita della tabella. Ognuno di questi casi compare come avviso tra le anomalie della panoramica.

La stessa linea morbida vale per i ruoli, il ruolo predefinito e l'assegnazione nella scheda. Un ruolo con una tabella sconosciuta, un'operazione sconosciuta o un'indicazione su una tabella che non è né `all` né un elenco vale come non impostato, e ognuno dei suoi errori viene segnalato. Un ruolo predefinito o un'assegnazione che non nomina alcun ruolo esistente vale allo stesso modo come non impostato, e vale la regola successiva della sezione «Permessi». Tutti questi casi compaiono tra le anomalie della panoramica.

Se una tabella porta record ma nessun livello di piena `lastId` o uno troppo basso, l'applicazione non assegna comunque nessun identificatore due volte: una creazione prende il numero successivo sopra l'identificatore più alto esistente e poi aggiorna il livello di piena. La verifica di coerenza segnala il caso come avviso.

## Disattivare la banca dati

L'intera banca dati è un'[estensione interna](extensions.md) denominata «Banca dati», della categoria Strumenti, e si disattiva con un unico interruttore. Richiede i [Profili di proprietà](property-profiles.md), perché la forma di una definizione di tabella viene descritta e verificata tramite un profilo interno; finché la banca dati è attiva, questo prerequisito non può quindi essere disattivato.

Da disattivata vale quanto segue:

- Il **blocco di record resta un normale blocco di codice**, nella vista di lettura, nella modalità di modifica e nell'esportazione portabile. Il suo contenuto resta leggibile; ciò che viene disattivato è la rappresentazione come tabella, non il dato.
- **La panoramica e la sezione delle impostazioni decadono**, insieme agli accessi nel menu Visualizza, nel menu contestuale del pannello dell'area e nella palette dei comandi. Una panoramica già aperta resta finché non la si chiude, come ogni altra pagina di sistema.
- Con il blocco di record decadono i suoi pulsanti **«Apri record»** e **«Nuovo record»**, con la panoramica le sue azioni **«Verifica coerenza»**, **«Verifica»** e **«Utilizzo»**, e i comandi **«Nuovo record nella tabella attiva»** e **«Verifica la coerenza del database»** spariscono dalla palette dei comandi. Così nemmeno la **maschera** è più raggiungibile, e l'applicazione non fornisce più dati né a essa, né alla verifica di coerenza, né all'utilizzo.
- Una **query sui record** non legge più alcuna tabella: mostra un elenco vuoto con la nota che l'estensione è disattivata, e nessun messaggio di errore. Lo stesso vale per i percorsi attraverso i campi di riferimento, per le gerarchie e per l'albero.
- Un **file di query** resta un documento ordinario: il suo blocco di query continua a essere valutato, sui record con l'elenco vuoto e la nota appena descritti, e la sua sezione «Query» scompare con la panoramica. Una maschera elenco non mostra allora alcuna griglia e non offre alcuna azione.
- Un **collegamento a un singolo record** non viene più segnalato come rotto. Senza definizioni non c'è nulla con cui confrontarlo, e un avviso senza verifica sarebbe soltanto un'affermazione. Un clic apre il file di tabella senza salto alla riga invece della maschera, e l'elenco dei suggerimenti non propone record.
- La **ricerca sull'area non dà risultati di record**. I record restano esclusi dal testo integrale, perché quel limite appartiene al file di tabella e non all'interruttore; tramite l'area i record non sono allora reperibili.
- Una **maschera** aperta alla chiusura non torna all'avvio. La sua voce nella sessione resta in sospeso e la riporta al successivo avvio dopo l'attivazione (sezione «Dopo il riavvio»).
- **Ruoli, ruolo predefinito e assegnazione** restano semplice frontmatter della scheda, come un'indicazione `editable` su un campo: non c'è né risoluzione né controllo, nemmeno al salvataggio di una definizione modificata.
- **Non si scrive nulla.** L'applicazione non crea, non modifica e non elimina record, non prende alcun blocco e non produce alcun giustificativo di modifica; finché è disattivata non porta a termine nemmeno un salvataggio rimasto incompiuto.

**I file restano intatti.** La disattivazione toglie l'interpretazione, non i dati: non viene cambiato un solo carattere, e la riattivazione riporta tutto. L'indice dell'area viene allora ricostruito una volta; in fondi estesi ciò richiede un istante.
