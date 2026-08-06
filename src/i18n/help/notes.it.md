# Note del documento

Ogni documento può avere **una** nota, separata dal contenuto del documento. Raccoglie il sapere di lavoro e le meta-informazioni sul documento (punti aperti, contesto, promemoria) che non appartengono al testo stesso. La nota si scrive in un pannello della barra laterale dedicato e si salva nel **file di accompagnamento** del documento, lo stesso file `.mdd` accanto al documento che contiene anche la cronologia.

## Il pannello Note

Il pannello «Note» si commuta come ogni pannello della barra laterale: dal menu Visualizza → Barra laterale → Pannelli → Note, dall'icona a blocco note nella barra di stato, o da una scorciatoia che assegni tu stesso (di fabbrica non ne è impostata alcuna; l'assegnazione avviene nelle impostazioni). L'interruttore agisce sulla colonna attiva; lato, ordine e gruppi di schede seguono le regole della [Barra laterale](sidebar.md).

Una nota appartiene sempre al documento attivo. Un documento ancora **senza nome** (mai salvato) non ha un posto per il file di accompagnamento; il pannello mostra allora un'indicazione invece di un campo di immissione; dopo il primo salvataggio la nota è disponibile.

## Scrivere e anteprima

Il campo di immissione accetta il Markdown. Un interruttore nell'intestazione del pannello alterna tra **modifica** e un'**anteprima renderizzata** del testo della nota. L'anteprima è attiva all'inizio; se un pannello si apre in modifica o in anteprima è stabilito da «Mostra l'anteprima delle note per impostazione predefinita» (Impostazioni → Aspetto). L'interruttore vale per colonna e per la sessione in corso.

Ecco come può apparire una nota:

```markdown
- [ ] Chiarire il capitolo tre
- [x] Fonti verificate

Contesto: **bozza**, non ancora approvata.
```

- [ ] Chiarire il capitolo tre
- [x] Fonti verificate

Contesto: **bozza**, non ancora approvata.

## Formattare come nell'editor

Il campo di modifica offre gli stessi aiuti di formattazione dell'editor principale: il **menu contestuale del clic destro** con le sezioni Formato, Paragrafo, Inserisci e Appunti, oltre alle scorciatoie corrispondenti (per esempio `Ctrl+B` per il grassetto, `Ctrl+I` per il corsivo, o l'inserimento di una marca temporale). Il [Menu contestuale dell'editor](context-menu.md) descrive queste funzioni in dettaglio; agiscono nel campo della nota esattamente come nel documento.

## Salvataggio automatico

La nota viene salvata **automaticamente**, senza pulsante di salvataggio: poco dopo la digitazione, così come all'uscita dal campo, al cambio di documento e alla chiusura della finestra. La nota non fa parte del contenuto del documento; perciò **non** contrassegna la scheda del documento come modificata, e il salvataggio del documento ne è indipendente.

## Posizione e distinzione dalla cronologia

La nota si trova nel file di accompagnamento `.mdd`, in una sezione propria accanto alla [Cronologia del documento](history.md). Entrambe viaggiano con il file di accompagnamento quando il documento e il `.mdd` vengono copiati o spostati insieme; la **rinomina all'interno dell'applicazione** porta con sé il file di accompagnamento, e con esso la nota, automaticamente.

A differenza della cronologia, la nota non ha **né revisioni né ripristino**: conta solo lo stato attuale, un testo precedente non viene conservato. Se il file di accompagnamento è danneggiato, la nota viene sospesa e il pannello lo segnala invece di sovrascrivere uno stato incerto.

## Più finestre

Se lo stesso documento è aperto in più finestre, una nota salvata altrove viene adottata qui finché il campo è invariato. Se una modifica esterna incontra il tuo **stato non ancora salvato**, il pannello segnala che la nota è stata modificata in un'altra finestra, e il tuo testo viene conservato affinché nulla venga sovrascritto a tua insaputa.
