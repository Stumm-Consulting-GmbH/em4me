# Profili di proprietà

I profili di proprietà definiscono i campi delle proprietà in modo centralizzato per un'area: per campo un nome, un tipo, opzionalmente un insieme di valori fisso (scelta singola o multipla) e un valore predefinito. I profili possono ereditare l'uno dall'altro (sezione «Ereditarietà»). L'editor delle proprietà e il pannello delle proprietà di blocco suggeriscono i campi definiti, offrono gli insiemi di valori come liste di selezione e riprendono il tipo dalla definizione. I profili esistono solo nel contesto di un'area: la configurazione vive nel file dell'area (Impostazioni → Profili di proprietà), i profili stessi sono normali file Markdown. La funzionalità è attivabile e disattivabile come estensione «Profili di proprietà» (Impostazioni → Estensioni); senza configurazione o con l'estensione disattivata entrambi gli editor si comportano come di consueto (inferenza del tipo e suggerimenti standard).

## File di profilo e formato delle definizioni

Un profilo è un file Markdown nella cartella dei profili configurata; il nome del profilo è il nome del file senza estensione. Le definizioni dei campi stanno nel frontmatter sotto la chiave `fields`; il contenuto del file sottostante è una descrizione libera:

```yaml
---
fields:
  - name: stato
    values: [aperto, in corso, concluso]
    default: aperto
  - name: budget
    type: number
  - name: temi
    type: multistring
    values: [progetto, persona, luogo]
  - name: scadenza
    type: date
---
```

Attributi per definizione:

| Attributo | Significato |
| --- | --- |
| `name` | nome del campo (obbligatorio, univoco per profilo) |
| `type` | `string`, `multistring`, `number`, `boolean`, `date`, `multiline`, `link` (collegamento a un file) o `time` (ora); senza indicazione `string` |
| `values` | facoltativo: insieme di valori fisso come elenco di valori (per `string`, `multistring`, `number` e `date`) |
| `multiple` | facoltativo: più valori — il valore è un elenco. Vale per ogni tipo tranne `boolean` e `multiline`; solo nel campo di testo il tipo passa allora a `multistring`, altrimenti il nome del tipo resta (un campo di collegamento con più destinazioni è `link` con `multiple`) |
| `default` | facoltativo: preimpostazione alla creazione del campo tramite l'editor |
| `valuesFrom` | facoltativo: fonte del repertorio di valori con `note` (percorso di una nota di valori) e/o `query` (interrogazione); insieme a `values` vale `values` |
| `options` | facoltativo: indicazioni proprie del tipo in un sotto-oggetto, vedi la tabella seguente |
| `fields` | facoltativo: definizioni figlie annidate secondo lo stesso schema, previsto per i tipi strutturati |

Un campo `multistring` con `values` è automaticamente una scelta multipla. **Il nome del campo è l'unica indicazione obbligatoria**: ogni altra indicazione è facoltativa e i file di profilo esistenti restano validi senza modifiche. `valuesFrom`, `options` e i `fields` annidati fanno già parte del formato, ma in questa versione non vengono ancora valutati (sezione «Limiti»). Le definizioni singole difettose (ad esempio un tipo sconosciuto o un nome di campo duplicato) sospendono solo sé stesse; le altre definizioni del profilo restano efficaci. L'elenco dei profili nelle impostazioni mostra gli avvisi per esteso sotto il profilo interessato — con la definizione coinvolta, l'indicazione errata e ciò che era atteso al suo posto, per le definizioni figlie con il percorso verso il campo genitore — e apre il file del profilo con un clic.

### Opzioni proprie del tipo

Il sotto-oggetto `options` porta le indicazioni che valgono solo per un determinato tipo:

| Tipo | Indicazione | Significato |
| --- | --- | --- |
| `number` | `step`, `min`, `max` | passo e limiti del campo numerico |
| `date` | `shift` | spostamento in giorni; precompila un campo **vuoto** al primo clic, una data esistente resta intatta |
| `link` | `restrictTo`, `display`, `sort` | percorso di cartella (o elenco) a cui i suggerimenti sono limitati; campo di metadati della destinazione come nome visualizzato; ordine `name` o `path` |
| campo a scelta | `control: cycle` | la scelta singola diventa un pulsante che passa al valore successivo al clic; il valore salvato resta lo stesso che senza l'opzione |

Un'indicazione sconosciuta o mal compilata decade singolarmente con un avviso; il campo e le altre indicazioni restano efficaci. Un'opzione prevista per un tipo successivo può quindi già figurare senza causare danno.

## Repertori di valori

Il repertorio di valori ammesso di un campo a scelta ha tre fonti possibili: l'elenco fisso `values`, una **nota di valori** oppure una **query**. `values` e `valuesFrom` si escludono a vicenda; se figurano entrambi vale `values`, e l'elenco dei profili nelle impostazioni segnala la contraddizione.

```yaml
---
fields:
  - name: luogo
    valuesFrom:
      note: 90 Organizzazione/Valori/Luoghi.md
  - name: progetto
    type: link
    valuesFrom:
      query: WHERE genere = "progetto"
---
```

Una **nota di valori** è una nota ordinaria con un valore per riga; il suo percorso è relativo all'area. Righe vuote e spazi di bordo decadono, un blocco di metadati della nota non fa parte del repertorio. Viene aggiornata come un file di profilo: una modifica ha effetto senza riavvio, anche se proviene dall'esterno. Il repertorio diventa così contenuto ordinario che si può collegare, commentare e condividere.

Una **query** fornisce i valori dall'archivio: i nomi dei suoi risultati. Viene valutata solo quando un campo ha davvero bisogno dei suoi valori, e resta memorizzata fino alla successiva modifica dell'archivio; nulla viene calcolato in anticipo sull'intero fondo. Un documento senza campo query non costa quindi alcuna valutazione.

Se una fonte manca, è vuota o non è valutabile, il **campo resta utilizzabile**: il repertorio è vuoto, un'indicazione compare accanto al campo, e valori propri restano possibili come ovunque.

## Assegnazione e profilo standard

I documenti si assegnano tramite un campo del frontmatter; il nome del campo è configurabile per area (predefinito `class`). Il valore è un nome di profilo o un elenco di più nomi di profili:

Un documento trova inoltre il suo profilo tramite un'**etichetta** o la sua **cartella**, senza che vi debba figurare un campo di assegnazione. Queste assegnazioni appartengono all'area e si impostano in Impostazioni → Profili delle proprietà: una riga per profilo, con le sue etichette e i suoi percorsi di cartella.

- **Etichetta**: conta allo stesso modo dal blocco di metadati (`tags`) e dal testo (`#etichetta`) — per l'assegnazione un'etichetta è un'etichetta. Anche una modifica non salvata ha effetto immediato.
- **Cartella**: un percorso collegato include le sue sottocartelle, così che una successiva suddivisione non debba essere mantenuta. Il percorso relativo all'area viene confrontato su nomi di cartella interi; «10 Progetti Archivio» non ricade quindi sotto «10 Progetti».

```yaml
---
class:
  - progetto
  - persona
---
```

In aggiunta si può scegliere un **profilo standard**: le sue definizioni valgono per tutti i file dell'area, anche senza campo di assegnazione. I nomi dei profili corrispondono indipendentemente da maiuscole e minuscole.

## Ereditarietà

Un profilo può ereditare le definizioni di un altro. A questo scopo il frontmatter del file di profilo indica, accanto a `fields`, al massimo un profilo genitore e, facoltativamente, nomi di campi da escludere:

```yaml
---
extends: progetto
exclude: [stato]
fields:
  - name: fase
  - name: autore
---
```

- `extends` indica il profilo genitore; sono possibili catene su più livelli, non esiste più di un profilo genitore.
- `exclude` esclude campi ereditati. L'esclusione agisce nella catena di ereditarietà in cui si trova, non per l'intero documento.
- Un campo proprio con lo stesso nome sostituisce completamente quello ereditato.

Un ciclo nella relazione dei genitori o un profilo genitore inesistente termina soltanto la catena interessata e produce un avviso nell'elenco dei profili delle impostazioni; la risoluzione prosegue.

## Profilo interno

Accanto ai file di profilo della cartella esiste il **profilo interno `Ereignis`** dell'estensione [Eventi](events.md). Fa parte automaticamente della risoluzione dei profili e dell'elenco dei profili nelle impostazioni (lì contrassegnato come profilo interno), definisce gli otto campi `event-*` e non può essere né modificato né eliminato; non è proposto come profilo standard. Agisce anche senza cartella dei profili configurata, con il campo di assegnazione standard `class`; se un file di profilo porta lo stesso nome, il profilo interno ha la precedenza. Con l'estensione Eventi disattivata scompare dalla risoluzione e dall'elenco.

## Regole di conflitto

Per un file vale l'unione di tutte le definizioni di tutti i profili che lo raggiungono. La risoluzione è **un'unica** sequenza ordinata in quattro passi, dall'enunciato più esplicito al più generale:

1. il **campo di assegnazione** del documento, nell'ordine di menzione
2. un'**etichetta** del documento
3. la **cartella** del documento
4. il **profilo standard** dell'area

Per ogni profilo raggiunto vengono prima i suoi campi propri, poi quelli della sua catena ereditaria dal basso verso l'alto; ogni profilo viene elaborato esattamente una volta, su tutti i passi. Se più profili definiscono lo stesso nome di campo, le regole sono deterministiche:

1. Vince la **prima corrispondenza della sequenza**: una via più in alto batte ogni via più in basso.
2. Tra più profili dello stesso passo vince quello **menzionato per primo** (elenco di assegnazione oppure ordine delle assegnazioni).
3. All'interno di una catena vince il **profilo erede** sui suoi genitori; un campo proprio sostituisce così quello ereditato con lo stesso nome.

Le vie **si completano, non si sostituiscono**: un documento con campo di assegnazione e cartella corrispondente porta i campi di entrambi. Una via che punta a un profilo già raggiunto non aggiunge nulla: discende da «ogni profilo esattamente una volta» e non richiede una regola propria. E una contraddizione tra etichetta e cartella non è tale: decide l'ordine, non c'è né domanda né avvertimento.

Un esempio con quattro profili: `tutti` (campo `tags`), `progetto` (eredita da `tutti`; campi `fase`, `stato`), `articolo` (eredita da `progetto`, esclude `stato`; campi propri `fase`, `autore`) e `riunione` (campi `stato`, `luogo`). Un documento con `class: [articolo, riunione]` e il profilo standard `tutti` riceve `fase` e `autore` da `articolo`, `tags` attraverso la catena da `tutti`, `stato` e `luogo` da `riunione` — l'esclusione in `articolo` agisce solo nella sua catena; attraverso `riunione`, `stato` arriva comunque.

## Simbolo del profilo sul documento

Un profilo può portare un **simbolo**: un singolo carattere, di norma un’emoji, nel blocco di metadati del file di profilo:

```yaml
---
icon: 📅
fields:
  - name: luogo
---
```

L'intestazione della sezione Proprietà mostra il simbolo del profilo risolto per **primo** per il documento; il suggerimento ne indica il nome e il passo tramite cui è stato trovato. È questo lo scopo vero: non appena etichetta e cartella hanno voce in capitolo, un documento può portare campi di cui in esso non è detto nulla — il simbolo risponde allora al perché.

Senza profilo o senza simbolo non compare nulla; non nasce alcun segnaposto. Un'indicazione di più di un carattere decade con un avviso, il profilo resta efficace.

## Effetto negli editor

Le definizioni agiscono nell'editor delle proprietà e in modo identico nel pannello delle proprietà di blocco; i blocchi di un file ereditano la risoluzione del loro file.

- **Suggerimenti dei campi**: «Aggiungi proprietà» mostra prima i campi definiti non ancora presenti (con il nome del profilo come contrassegno), poi i suggerimenti abituali; «Campo personalizzato» alla fine resta la via libera. La selezione crea il campo con il tipo definito e il valore predefinito.
- **Liste di selezione**: i campi con insieme di valori offrono i valori definiti come lista di selezione (scelta singola) o come suggerimenti di inserimento della barra dei contrassegni (scelta multipla); «Valore personalizzato…» consente ancora inserimenti liberi.
- **Tipo impostato**: i campi definiti mostrano il tipo definito, il selettore del tipo è bloccato e nomina il profilo. Se il valore esistente si discosta dal tipo, il selettore resta libero affinché il valore possa essere convertito al tipo definito.
- I **campi di collegamento** offrono le destinazioni dell'area come completamento, segnalano una destinazione inesistente e la aprono tramite la freccia — lo stesso percorso di un clic su un collegamento wiki. Con `multiple` portano più destinazioni nella barra dei chip.
- I **campi ora** usano il controllo dell'ora; il valore figura tra virgolette nel blocco di metadati, perché `09:30` verrebbe altrimenti letto come numero.
- I campi definiti portano un contrassegno discreto sul nome del campo; il suggerimento nomina il profilo.

## Inserimento di tutti i campi in una volta

Il menu dei suggerimenti «Aggiungi proprietà» è raggruppato per profilo: sotto ogni **nome del profilo** compaiono, rientrati, i suoi campi non ancora presenti, poi i suggerimenti standard senza profilo sotto «Altri campi». Un clic sul **nome del profilo** stesso aggiunge in un solo passaggio tutti i campi ancora mancanti di quel profilo; un clic su un singolo campo aggiunge ancora solo quello.

L'inserimento è volutamente additivo:

- Vengono creati solo i campi **mancanti**; i valori esistenti e l'ordine dei campi restano intatti e non nascono duplicati.
- Un campo con valore predefinito riceve quel valore; un campo senza valore predefinito viene creato vuoto secondo il tipo: testo, data ed elenco restano vuoti, un numero parte da `0`, un booleano da «falso». Il contenuto si modifica poi come di consueto.
- Nel frontmatter del documento, i campi vuoti compaiono come semplice chiave senza valore (`campo:`).

L'intero inserimento è un unico passaggio e può essere annullato completamente con un solo annulla. Vale nell'editor delle proprietà e nel pannello delle proprietà di blocco e scompare quando l'estensione «Profili di proprietà» è disattivata.

## Modulo dei campi del documento

In alto la sezione mostra i campi presenti nel documento; sotto, l'area espandibile **«Tutti i campi di questo documento»** raccoglie i campi che i profili vigenti definiscono e che il documento non porta ancora. I due insieme rispondono per intero alla domanda su che cosa questo documento possa portare; l'unione viene ripartita e non duplicata, così nessun campo compare due volte.

**Provenienza di ogni campo.** Ogni campo porta il simbolo del profilo da cui proviene la sua definizione; il suggerimento nomina il profilo e la via. In una definizione ereditata si tratta del profilo in cui essa sta davvero — non di quello assegnato.

**La catena dei profili vigenti** sta sopra i campi mancanti, perché risponde alla domanda da cui i campi discendono. Ogni livello mostra il simbolo, il nome del profilo e la via per cui il profilo vale; la profondità di ereditarietà è resa come **rientro**. Dal primo livello ereditato in poi la riga indica «ereditato» invece della via — un profilo ereditato vale per la stessa via del suo figlio, e lì è l'ereditarietà l'informazione utile.

**Acquisizione per livello.** Accanto a un livello con campi mancanti si trova un pulsante che crea esattamente quei campi in un solo passo: con un valore vuoto adatto al tipo, senza toccare i valori esistenti e come un unico passo di annullamento — la stessa via dell'inserimento di tutti i campi. Un livello senza campi mancanti non porta alcun pulsante; prometterebbe un'azione che non fa nulla.

**Un campo che il documento non porta ancora resta fuori finché è vuoto.** La semplice espansione non scrive dunque nulla nel blocco di metadati; solo un valore inserito o l'acquisizione rende il campo un campo del documento.

Con un blocco di metadati difettoso l'area non compare — lì vale lo stesso avviso che per «Aggiungi proprietà». Non compare nemmeno senza un profilo vigente né con l'estensione «Profili delle proprietà» disattivata; un'area vuota o un segnaposto non compaiono mai.

**Tre accessi** portano al modulo: l'area espandibile stessa, il comando «Aprire il modulo dei campi del documento» e la voce «Aprire il modulo dei campi» nel menu contestuale della scheda. Gli ultimi due rendono visibile la sezione se è nascosta, espandono l'area e la portano nella parte visibile; la voce del menu contestuale riguarda la scheda su cui si è fatto clic e la attiva prima.

## Vista per profilo come query

La domanda «quali documenti appartengono a questo profilo» è una query, e il comando **«Inserisci query di profilo»** la scrive per intero: chiede il profilo quando ne entrano in gioco più d'uno e inserisce un blocco di query ordinario alla posizione del cursore. Non nasce alcuna vista propria — l'output passa per la restituzione dei risultati già esistente del linguaggio di query.

La query generata comprende tutte e tre le vie di assegnazione esplicite del profilo — il campo di assegnazione, ogni collegamento per etichetta e ogni collegamento per cartella. Una condizione di cartella include le sottocartelle, esattamente come il collegamento stesso:

````markdown
```perspective-query
LIST
WHERE class = "progetto"
  OR icontains(file.tags, "progetto")
  OR (file.folder = "10 Progetti" OR startswith(lower(file.folder), "10 progetti/"))
```
````

Due casi fanno eccezione:

- **Il profilo standard dell'area** vale per tutto ciò che non ha un'altra assegnazione. Per esso il comando produce quindi una query su tutti i documenti dell'area invece della negazione di tutti i collegamenti — sarebbe lunga, opaca e diventerebbe silenziosamente falsa non appena si aggiungesse un collegamento.
- **I profili eredi restano fuori.** Se `cliente` eredita da `progetto`, i documenti cliente non compaiono nella query su `progetto`: portano i suoi campi, ma non sono progetti.

Da quel momento il blocco inserito è contenuto ordinario — si può modificare, ampliare con colonne, ordinamento o limite, spostare ed eliminare come ogni altra query. Un documento che lo contiene è così anche una vista salvata: si può denominare, collegare e segnalibrare. Per contro: la query rispecchia l'assegnazione **al momento della generazione**. Se in seguito si aggiunge un collegamento, il blocco già scritto non lo segue; allora lo si genera di nuovo o lo si completa a mano.

Il comando scompare con l'estensione «Profili delle proprietà» disattivata.

## Validazione leggera

Gli scostamenti non bloccano mai e non modificano mai il valore: un valore al di fuori dell'insieme di valori o un valore che non corrisponde al tipo definito produce soltanto un'icona di avviso sul campo; il suggerimento ne indica il motivo. Il Markdown e il frontmatter restano liberamente modificabili — anche direttamente nel sorgente.

## Limiti

- Il formato prevede già opzioni proprie del tipo (`options`), fonti del repertorio di valori (`valuesFrom`) e definizioni figlie annidate; in questa versione non vengono ancora valutate. Un'indicazione del genere non è un errore, resta semplicemente senza effetto fino all'ampliamento.
- Rinominare un file di profilo non cambia i valori di assegnazione nei documenti; questi puntano allora a un profilo inesistente (le impostazioni segnalano un profilo standard mancante).
- I profili si trovano direttamente nella cartella dei profili; le sottocartelle non sono incluse.
- Le definizioni agiscono nei due editor delle proprietà; i tipi di campo calcolati o derivati da altri file non fanno parte dei profili.
- Il collegamento di un profilo a un gruppo di segnalibri e l'assegnazione tramite una query sono deliberatamente rinviati; etichetta e cartella coprono i casi documentati e restano spiegabili.
