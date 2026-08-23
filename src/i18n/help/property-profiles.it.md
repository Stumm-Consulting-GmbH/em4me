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
| `type` | `string`, `multistring`, `number`, `boolean`, `date` o `multiline`; senza indicazione `string` |
| `values` | facoltativo: insieme di valori fisso come elenco di valori (per `string`, `multistring`, `number` e `date`) |
| `multiple` | facoltativo: scelta multipla — il valore è un elenco, il tipo `multistring`; un insieme di valori fisso non è più necessario |
| `default` | facoltativo: preimpostazione alla creazione del campo tramite l'editor |
| `valuesFrom` | facoltativo: fonte del repertorio di valori con `note` (percorso di una nota di valori) e/o `query` (interrogazione); insieme a `values` vale `values` |
| `options` | facoltativo: indicazioni proprie del tipo in un sotto-oggetto, previsto per tipi futuri |
| `fields` | facoltativo: definizioni figlie annidate secondo lo stesso schema, previsto per i tipi strutturati |

Un campo `multistring` con `values` è automaticamente una scelta multipla. **Il nome del campo è l'unica indicazione obbligatoria**: ogni altra indicazione è facoltativa e i file di profilo esistenti restano validi senza modifiche. `valuesFrom`, `options` e i `fields` annidati fanno già parte del formato, ma in questa versione non vengono ancora valutati (sezione «Limiti»). Le definizioni singole difettose (ad esempio un tipo sconosciuto o un nome di campo duplicato) sospendono solo sé stesse; le altre definizioni del profilo restano efficaci. L'elenco dei profili nelle impostazioni mostra gli avvisi per esteso sotto il profilo interessato — con la definizione coinvolta, l'indicazione errata e ciò che era atteso al suo posto, per le definizioni figlie con il percorso verso il campo genitore — e apre il file del profilo con un clic.

## Assegnazione e profilo standard

I documenti si assegnano tramite un campo del frontmatter; il nome del campo è configurabile per area (predefinito `class`). Il valore è un nome di profilo o un elenco di più nomi di profili:

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

Per un file vale l'unione di tutte le definizioni dei profili assegnati con le loro catene di genitori più il profilo standard con la sua catena. La risoluzione è **una** sequenza ordinata: per ogni profilo assegnato, nell'ordine di menzione, prima i suoi campi, poi quelli della sua catena di genitori dal basso verso l'alto, quindi lo stesso per il profilo standard; ogni profilo viene elaborato esattamente una volta. Se più di un profilo definisce lo stesso nome di campo, le regole sono deterministiche:

1. Un **profilo assegnato** vince sul **profilo standard**.
2. Tra più profili assegnati vince quello nominato **per primo** nell'elenco di assegnazione.
3. All'interno di una catena vince il **profilo erede** sui suoi genitori; un campo proprio sostituisce così quello ereditato con lo stesso nome.

Un esempio con quattro profili: `tutti` (campo `tags`), `progetto` (eredita da `tutti`; campi `fase`, `stato`), `articolo` (eredita da `progetto`, esclude `stato`; campi propri `fase`, `autore`) e `riunione` (campi `stato`, `luogo`). Un documento con `class: [articolo, riunione]` e il profilo standard `tutti` riceve `fase` e `autore` da `articolo`, `tags` attraverso la catena da `tutti`, `stato` e `luogo` da `riunione` — l'esclusione in `articolo` agisce solo nella sua catena; attraverso `riunione`, `stato` arriva comunque.

## Effetto negli editor

Le definizioni agiscono nell'editor delle proprietà e in modo identico nel pannello delle proprietà di blocco; i blocchi di un file ereditano la risoluzione del loro file.

- **Suggerimenti dei campi**: «Aggiungi proprietà» mostra prima i campi definiti non ancora presenti (con il nome del profilo come contrassegno), poi i suggerimenti abituali; «Campo personalizzato» alla fine resta la via libera. La selezione crea il campo con il tipo definito e il valore predefinito.
- **Liste di selezione**: i campi con insieme di valori offrono i valori definiti come lista di selezione (scelta singola) o come suggerimenti di inserimento della barra dei contrassegni (scelta multipla); «Valore personalizzato…» consente ancora inserimenti liberi.
- **Tipo impostato**: i campi definiti mostrano il tipo definito, il selettore del tipo è bloccato e nomina il profilo. Se il valore esistente si discosta dal tipo, il selettore resta libero affinché il valore possa essere convertito al tipo definito.
- I campi definiti portano un contrassegno discreto sul nome del campo; il suggerimento nomina il profilo.

## Inserimento di tutti i campi in una volta

Il menu dei suggerimenti «Aggiungi proprietà» è raggruppato per profilo: sotto ogni **nome del profilo** compaiono, rientrati, i suoi campi non ancora presenti, poi i suggerimenti standard senza profilo sotto «Altri campi». Un clic sul **nome del profilo** stesso aggiunge in un solo passaggio tutti i campi ancora mancanti di quel profilo; un clic su un singolo campo aggiunge ancora solo quello.

L'inserimento è volutamente additivo:

- Vengono creati solo i campi **mancanti**; i valori esistenti e l'ordine dei campi restano intatti e non nascono duplicati.
- Un campo con valore predefinito riceve quel valore; un campo senza valore predefinito viene creato vuoto secondo il tipo: testo, data ed elenco restano vuoti, un numero parte da `0`, un booleano da «falso». Il contenuto si modifica poi come di consueto.
- Nel frontmatter del documento, i campi vuoti compaiono come semplice chiave senza valore (`campo:`).

L'intero inserimento è un unico passaggio e può essere annullato completamente con un solo annulla. Vale nell'editor delle proprietà e nel pannello delle proprietà di blocco e scompare quando l'estensione «Profili di proprietà» è disattivata.

## Validazione leggera

Gli scostamenti non bloccano mai e non modificano mai il valore: un valore al di fuori dell'insieme di valori o un valore che non corrisponde al tipo definito produce soltanto un'icona di avviso sul campo; il suggerimento ne indica il motivo. Il Markdown e il frontmatter restano liberamente modificabili — anche direttamente nel sorgente.

## Limiti

- Il formato prevede già opzioni proprie del tipo (`options`), fonti del repertorio di valori (`valuesFrom`) e definizioni figlie annidate; in questa versione non vengono ancora valutate. Un'indicazione del genere non è un errore, resta semplicemente senza effetto fino all'ampliamento.
- Rinominare un file di profilo non cambia i valori di assegnazione nei documenti; questi puntano allora a un profilo inesistente (le impostazioni segnalano un profilo standard mancante).
- I profili si trovano direttamente nella cartella dei profili; le sottocartelle non sono incluse.
- Le definizioni agiscono nei due editor delle proprietà; i tipi di campo calcolati o derivati da altri file non fanno parte dei profili.
