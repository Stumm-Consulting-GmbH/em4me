# Profili di proprietà

I profili di proprietà definiscono i campi delle proprietà in modo centralizzato per un'area: per campo un nome, un tipo, opzionalmente un insieme di valori fisso (scelta singola o multipla) e un valore predefinito. L'editor delle proprietà e il pannello delle proprietà di blocco suggeriscono i campi definiti, offrono gli insiemi di valori come liste di selezione e riprendono il tipo dalla definizione. I profili esistono solo nel contesto di un'area: la configurazione vive nel file dell'area (Impostazioni → Profili di proprietà), i profili stessi sono normali file Markdown. La funzionalità è attivabile e disattivabile come estensione «Profili di proprietà» (Impostazioni → Estensioni); senza configurazione o con l'estensione disattivata entrambi gli editor si comportano come di consueto (inferenza del tipo e suggerimenti standard).

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
| `multiple` | facoltativo, solo con `values`: scelta multipla — il valore è un elenco, il tipo `multistring` |
| `default` | facoltativo: preimpostazione alla creazione del campo tramite l'editor |

Un campo `multistring` con `values` è automaticamente una scelta multipla. Le definizioni singole difettose (ad esempio un tipo sconosciuto, un nome di campo duplicato o `multiple` senza `values`) sospendono solo sé stesse; le altre definizioni del profilo restano efficaci. L'elenco dei profili nelle impostazioni mostra questi avvisi per profilo e apre il file del profilo con un clic.

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

## Profilo interno

Accanto ai file di profilo della cartella esiste il **profilo interno `Ereignis`** dell'estensione [Eventi](events.md). Fa parte automaticamente della risoluzione dei profili e dell'elenco dei profili nelle impostazioni (lì contrassegnato come profilo interno), definisce gli otto campi `event-*` e non può essere né modificato né eliminato; non è proposto come profilo standard. Agisce anche senza cartella dei profili configurata, con il campo di assegnazione standard `class`; se un file di profilo porta lo stesso nome, il profilo interno ha la precedenza. Con l'estensione Eventi disattivata scompare dalla risoluzione e dall'elenco.

## Regole di conflitto

Per un file vale l'unione di tutte le definizioni dei profili assegnati più il profilo standard. Se più di un profilo definisce lo stesso nome di campo, le regole sono deterministiche:

1. Un **profilo assegnato** vince sul **profilo standard**.
2. Tra più profili assegnati vince quello nominato **per primo** nell'elenco di assegnazione.

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

- Rinominare un file di profilo non cambia i valori di assegnazione nei documenti; questi puntano allora a un profilo inesistente (le impostazioni segnalano un profilo standard mancante).
- I profili si trovano direttamente nella cartella dei profili; le sottocartelle non sono incluse.
- Le definizioni agiscono nei due editor delle proprietà; i tipi di campo calcolati o derivati da altri file non fanno parte dei profili.
