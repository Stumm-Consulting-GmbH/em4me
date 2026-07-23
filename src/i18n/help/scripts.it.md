# Blocchi di script

Un blocco di codice con il tag di linguaggio `perspective-script` esegue **JavaScript** e incorpora il risultato nel documento renderizzato. Gli script leggono i dati dell'ambito di ricerca (file con campi di frontmatter e di file, proprietà dei blocchi) tramite l'**API pq** e producono elenchi, tabelle, elementi o Markdown. Ciò consente valutazioni libere oltre la [Query Perspective](frontmatter-query.md) dichiarativa, ad esempio strutture ricorsive o riepiloghi calcolati.

Gli esempi di questa pagina sono volutamente impostati come blocchi di codice; la pagina del manuale stessa non esegue alcuno script.

## Attivazione e modello di fiducia

L'esecuzione degli script è **disattivata per impostazione predefinita**. Senza attivazione, un blocco di script mostra il suo codice sorgente con un banner informativo; non viene creato alcun ambiente di esecuzione.

Si attiva in **Impostazioni → Comportamento → Esegui blocchi di script**. L'attivazione è una decisione di fiducia consapevole: gli script provengono dai documenti aperti. Attivare solo se i propri documenti sono affidabili. Il cambio ha effetto immediato in tutte le finestre, senza riavvio.

## Limiti di esecuzione

Gli script vengono eseguiti **confinati** in una sandbox isolata, mai nel contesto dell'applicazione:

- **Nessun accesso ai file, nessun accesso alla rete, nessuna importazione di moduli.** La sandbox non ha accesso al file system, alle interfacce dell'applicazione né a indirizzi esterni.
- **Nessun accesso al DOM del documento.** Gli script non scrivono mai direttamente nella vista; l'output viaggia come descrizione strutturata tramite l'API pq e viene tradotto in modo controllato (sono ammessi elementi strutturali e di testo, gli attributi `class`, `title` e `colspan`/`rowspan` sulle celle).
- **Sola lettura.** L'API pq fornisce un'istantanea dei dati; file e metadati non possono essere modificati dagli script.
- **Limite di tempo.** Un'esecuzione viene interrotta dopo 5 secondi; il blocco mostra quindi un avviso di interruzione. I blocchi di una finestra vengono eseguiti uno dopo l'altro: uno script di lunga durata ritarda i blocchi successivi solo fino alla sua interruzione, e l'applicazione resta utilizzabile nel frattempo.
- **Tetto di output.** Gli output molto grandi vengono troncati e contrassegnati con un avviso.

## Struttura di base

Lo script è il contenuto del blocco di codice; `pq` è l'unico oggetto predefinito. Viene mostrato ciò che riportano le funzioni di output; il valore di ritorno dello script non viene mostrato. Se lo script restituisce una promise, il blocco ne attende la conclusione.

````markdown
```perspective-script
pq.out('Risultato: ' + (6 * 7));
```
````

## Leggere i dati

Tutte le funzioni dati sono in sola lettura e lavorano su un'istantanea dell'indice presa all'avvio dell'esecuzione. Se l'insieme dei file cambia, il blocco viene rieseguito automaticamente.

- `pq.pages([fonte])` — tutti i file dell'ambito di ricerca come oggetti pagina, eventualmente filtrati per una fonte.
- `pq.current()` — l'oggetto pagina del documento corrente (o `null`).
- `pq.file(rif)` — una pagina per percorso assoluto, percorso relativo alla radice o nome logico (senza distinzione tra maiuscole e minuscole); `null` se nulla corrisponde.
- `pq.blocks([fonte])` — le proprietà dei blocchi dell'ambito di ricerca (vedi [Proprietà dei blocchi](block-properties.md)); contano solo le ancore attive.
- `pq.indexStatus` — stato della base dati (`ready`; `none` senza base interrogabile).
- `pq.version` — numero di versione dell'API pq (attualmente `1`).

### Oggetti pagina

Un oggetto pagina porta i **campi di frontmatter in piano** (nomi dei campi in minuscolo, ad es. `pagina.status`) più l'oggetto `file` con i campi di file impliciti:

| Campo | Contenuto |
|---|---|
| `file.name` | nome logico (nome del file senza estensione) |
| `file.folder` | cartella relativa alla radice dell'ambito di ricerca (`''` alla radice) |
| `file.path` | percorso relativo alla radice |
| `file.absPath` | percorso assoluto (identità per `pq.link` e `pq.file`) |
| `file.ext` | estensione del file (minuscola, senza punto) |
| `file.size` | dimensione in byte |
| `file.ctimeMs`, `file.mtimeMs` | data di creazione/modifica in millisecondi |
| `file.tags` | tag del file |
| `file.aliases` | alias dal frontmatter |
| `file.inlinks`, `file.outlinks` | riferimenti in entrata e in uscita, ciascuno `{ path, name }` |

### Fonti

Il parametro opzionale `fonte` filtra come la selezione delle fonti della query, in forma semplificata:

- `'#tag'` — file con il tag, gerarchia inclusa (`#progetto` copre anche `progetto/alpha`).
- `'[[Nome]]'` — file che fanno riferimento alla destinazione (link in uscita).
- `'Cartella'` o `'Cartella/Sottocartella'` — file sotto il percorso della cartella.

### Proprietà dei blocchi

`pq.blocks()` restituisce per voce `{ file: { path, absPath, name }, anchor, values, updatedMs }`; `values` sono i valori delle proprietà del blocco. Il filtro della fonte agisce tramite il file portante.

## Produrre output

Le funzioni di output riportano contenuto al blocco (in ordine di chiamata):

- `pq.out(...contenuti)` — emette valori, nodi costruttori o array di questi; i valori semplici diventano testo.
- `pq.list(voci)` — elenco puntato. Una voce è contenuto oppure `{ content, children }` per strutture ad albero (annidamento libero).
- `pq.table(intestazione, righe)` — tabella; `intestazione` è un array di contenuti di cella, `righe` un array di array di riga.

Le funzioni costruttrici creano nodi **senza** output proprio; si usano come contenuto in `pq.out`, nelle voci di elenco e nelle celle di tabella:

- `pq.el(tag, contenuto, attributi)` — un elemento dalla lista di elementi ammessi (ad es. `p`, `span`, `strong`, `code`, `ul`, `table`, `h1`–`h6`); elementi e attributi non ammessi vengono scartati.
- `pq.link(destinazione, etichetta, ancora)` — riferimento interno cliccabile. `destinazione` è un oggetto pagina, `file` o blocco, oppure un percorso/nome; le destinazioni di blocco saltano automaticamente alla loro ancora. Senza `etichetta` viene mostrato il nome logico.
- `pq.md(testo)` — Markdown tramite la normale pipeline di rendering (enfasi, elenchi, link ecc.); i blocchi di query e di script incorporati non vengono eseguiti lì.

## Funzioni di supporto

- `pq.date(valore)` — data da stringhe di tipo ISO (`2026-07-09`, `2026-07-09 14:30`), millisecondi od oggetti data; interpretata localmente, `null` se illeggibile.
- `pq.dur(testo)` — durata in millisecondi da espressioni di unità come `'7 days'` o `'1h 30min'` (unità come nel letterale `dur(…)` della query; mesi/anni come approssimazioni di 30/365 giorni).
- `pq.sort(elenco, selettore, decrescente)` — copia ordinata; `selettore` è una funzione o un percorso di campo come `'file.name'`. Confronto in base al tipo: date in ordine cronologico, numeri in ordine numerico, altrimenti testo senza distinzione tra maiuscole e minuscole.

## Esempio: albero di link ricorsivo

A partire dal documento corrente viene costruito un albero sui riferimenti in uscita; ogni destinazione è cliccabile, le pagine già visitate non vengono ripetute:

````markdown
```perspective-script
function albero(pagina, viste) {
  return {
    content: pq.link(pagina),
    children: pagina.file.outlinks
      .map(function (l) { return pq.file(l.path); })
      .filter(function (p) { return p && viste.indexOf(p.file.absPath) < 0; })
      .map(function (p) { return albero(p, viste.concat([p.file.absPath])); }),
  };
}
var inizio = pq.current();
pq.list([albero(inizio, [inizio.file.absPath])]);
```
````

## Esempio: tabella su una fonte di tag

````markdown
```perspective-script
var pagine = pq.sort(pq.pages('#progetto'), 'prio');
pq.table(['File', 'Prio'], pagine.map(function (p) {
  return [pq.link(p), p.prio];
}));
```
````

## Errori e interruzioni

Un errore di sintassi o di esecuzione appare localizzato al blocco, con il messaggio originale dello script e, quando determinabile, la riga dello script. Un'esecuzione oltre il limite di tempo viene interrotta e mostrata come tale. Gli script vengono eseguiti in modalità strict: le assegnazioni a variabili non dichiarate sono errori.

## Esportazione

L'esportazione PDF stampa lo stato visibile: con l'impostazione attiva il risultato dello script (l'esportazione attende gli script in corso), altrimenti la vista del codice sorgente. Nel condividere il file Markdown, il blocco di script resta codice sorgente invariato; se venga eseguito presso il destinatario lo decide la sua impostazione.
