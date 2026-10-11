# Presentazione

Una **presentazione** è un normale documento Markdown il cui contenuto è suddiviso in **diapositive**. L'applicazione lo mostra diapositiva per diapositiva nella vista **Diapositive**, lo proietta a schermo intero ed esporta le diapositive come PDF o come pagine HTML.

La presentazione è **un'ulteriore vista dello stesso documento** e non un formato di file proprio. Si scrive nelle viste Markdown; la vista **Diapositive** si limita a mostrare e non cambia mai nulla nel testo.

## Da che cosa si riconosce una presentazione

Dall'**indicatore** `presentation: true` nell'intestazione del documento:

```markdown
---
presentation: true
---

# Titolo della prima diapositiva
```

Il valore deve essere `true`; `presentation: false`, un testo come `"true"` o una chiave mancante non danno un documento di presentazione. Viene riconosciuto allo stesso modo `marp: true`, affinché le presentazioni di un altro strumento per diapositive si aprano qui senza modifiche (vedi «Compatibilità con altri strumenti» più sotto). L'applicazione non scrive mai questa chiave da sé.

Un documento senza indicatore resta un documento normale: `---` vi è una linea orizzontale come ovunque.

## Creare una presentazione

**Visualizza → Presentazione → Nuova presentazione** crea un nuovo documento, ancora senza nome, e lo apre subito nella vista **Diapositive**. Porta l'indicatore, il tema `light` e il numero di pagina, oltre a tre diapositive di esempio: una diapositiva del titolo, una diapositiva con un elenco e una nota del relatore e una diapositiva che mostra come si scrivono immagine e testo affiancati. Si salva come ogni nuovo documento, al primo salvataggio. Il comando si trova anche nella palette dei comandi (predefinito `Ctrl+K`).

Per fare di un documento esistente una presentazione, si aggiunge da sé l'indicatore nella sua intestazione.

## Separare le diapositive

Una riga di tre trattini `---` separa due diapositive, esattamente dove secondo CommonMark è una linea orizzontale. La cosa più sicura è lasciare una riga vuota prima e dopo:

```markdown
# Prima diapositiva

Testo della prima diapositiva.

---

# Seconda diapositiva
```

**Che cosa non separa:**

- `---` subito sotto una riga di testo: è una sottolineatura di titolo (Setext) e non una linea.
- `---` in un blocco di codice, in una citazione, rientrato in un elemento di elenco o preceduto da quattro spazi.
- `---` in un commento.
- Le due righe che racchiudono l'intestazione.
- `***` e `___`: restano linee **sulla** diapositiva, così che una diapositiva possa portare una propria linea di separazione.

La riga di separazione non appartiene a nessuna diapositiva. Due righe di separazione di seguito danno una diapositiva vuota, come pure una riga di separazione subito dopo l'intestazione o alla fine del documento; un documento senza riga di separazione è un'unica diapositiva.

## L'intestazione: le chiavi di controllo

Oltre all'indicatore, l'intestazione accoglie cinque chiavi di controllo, tutte facoltative:

| Chiave | Effetto | Predefinito |
| ------ | ------- | ----------- |
| `theme` | aspetto delle diapositive: `light`, `dark` o `accent`, a scelta con valori propri (vedi sotto) | `light` |
| `paginate` | `true` mostra il numero di pagina in basso a destra su ogni diapositiva | `false` |
| `header` | testo della riga di intestazione su ogni diapositiva | nessuno |
| `footer` | testo della riga a piè di pagina su ogni diapositiva | nessuno |
| `size` | formato delle diapositive: `16:9` o `4:3` | `16:9` |

Un'intestazione completa:

```markdown
---
presentation: true
theme: dark
paginate: true
header: Rapporto trimestrale
footer: "**Ufficio vendite** · interno"
size: 4:3
---
```

Le altre chiavi dell'intestazione, come `title` o `tags`, restano intatte e agiscono come in ogni altro documento. Se un valore non è valido, vale il predefinito. Per un tema sconosciuto o non valido e per un formato sconosciuto, una **riga di avviso** sopra la diapositiva ne indica il motivo.

## Aspetto

### I tre temi

| Tema | Aspetto |
| ---- | ------- |
| `light` | testo scuro su bianco, accento in blu |
| `dark` | testo chiaro su quasi nero, accento in azzurro |
| `accent` | testo bianco su blu intenso, accento in giallo |

Le diapositive appaiono uguali con ogni schema di colori dell'applicazione: il tema appartiene alla presentazione, non all'interfaccia.

### Sostituire singoli valori

Invece di un nome, `theme` porta un blocco. La voce `name` sceglie il tema di base (senza `name` è `light`); le altre voci sostituiscono singoli valori:

```yaml
theme:
  name: dark
  accent: "#ff6b6b"
  font: Georgia, serif
```

| Voce | Effetto |
| ---- | ------- |
| `background` | sfondo della diapositiva |
| `text` | colore del testo corrente |
| `heading` | colore dei titoli |
| `accent` | colore dei collegamenti e delle barre di citazione |
| `font` | carattere della diapositiva |
| `header-footer` | colore di intestazione e piè di pagina |
| `page-number` | colore del numero di pagina |

Sono ammessi colori, sfumature ed elenchi di caratteri nella notazione CSS. Un valore che caricherebbe un file o un indirizzo non viene adottato. Una voce sconosciuta non viene considerata, un valore non valido viene sostituito da quello del tema; la riga di avviso segnala entrambi. I blocchi di codice e le evidenziazioni seguono la luminosità del tema di base; se si modifica molto lo sfondo, scegliere un tema di base chiaro o scuro adatto.

### Immagine di sfondo e divisione in due

Un'immagine diventa lo sfondo della diapositiva se la prima parola del suo testo alternativo è `bg`:

```markdown
![bg](immagini/paesaggio.jpg)
![bg contain](immagini/grafico.png)
![bg left:40%](immagini/ritratto.jpg)
```

| Notazione | Effetto |
| --------- | ------- |
| `bg` o `bg cover` | riempie la diapositiva; ciò che sporge viene ritagliato |
| `bg contain` o `bg fit` | mostra l'immagine intera; le zone libere mostrano lo sfondo della diapositiva |
| `bg auto` | mostra l'immagine nella sua dimensione |
| `bg 50%` | mostra l'immagine nella dimensione indicata |
| `bg left`, `bg right` | **divisione in due**: l'immagine riempie la metà sinistra o destra, il testo passa dall'altra parte |
| `bg left:40%`, `bg right:33%` | divisione in due con una larghezza propria del lato immagine |

Più immagini di sfondo di una diapositiva stanno affiancate, con `vertical` sulla prima immagine una sopra l'altra; nella divisione in due si spartiscono il lato immagine. Intestazione, piè di pagina e numero di pagina stanno allora dal lato del testo. Un'immagine che non si può caricare, per esempio perché manca il suo file, viene omessa; la diapositiva appare senza di essa. Le immagini di sfondo si caricano per la stessa via di ogni altra immagine del documento e seguono le stesse regole.

### Diapositive troppo piene

Ogni diapositiva ha un formato fisso, 16:9 o 4:3, e si adatta in modo uniforme alla superficie disponibile; il testo cresce e si riduce con essa. Ciò che non entra nella diapositiva viene tagliato al bordo, e una **barra tratteggiata** sul bordo inferiore segnala la diapositiva troppo piena. La barra non compare nella proiezione né nelle esportazioni. Il rimedio è una diapositiva in più.

## Numero di pagina, intestazione e piè di pagina

`paginate: true` mostra su ogni diapositiva il suo numero in basso a destra. `header` e `footer` mettono una riga in alto o in basso su ogni diapositiva; una formattazione semplice come grassetto, corsivo o un collegamento appare formattata. Un valore vuoto non mostra alcuna riga, un testo troppo lungo termina con i puntini di sospensione. Queste indicazioni valgono allo stesso modo per tutte le diapositive.

## Note del relatore

I commenti di una diapositiva sono le sue **note del relatore**. Valgono entrambe le forme:

```markdown
# Risultati

- Fatturato in crescita
- Costi in calo

%% Citare qui i dati dell'anno precedente. %%

<!-- In caso di domande, rinviare all'allegato. -->
```

Le note stanno solo nella sorgente: non sulla diapositiva, non nella proiezione, non nel PDF e non nelle pagine HTML. Nell'editor restano visibili. Se l'estensione «Commenti» è disattivata, `%%` è testo normale e compare sulla diapositiva; i commenti HTML restano note anche in quel caso. I commenti privati con `%%` sono descritti nella pagina [Costrutti in linea](inline.md).

## La vista «Diapositive»

La presentazione è l'ottava modalità di vista, accanto a Renderizzato, Diviso, Sorgente, Live, Mappa mentale, Tela e Bacheca: **Visualizza → Diapositive**, il pulsante **Diapositive** nella barra di stato o predefinito `Ctrl+8`. Come per le altre modalità, la scelta vale per documento aperto e viene ripristinata al successivo avvio.

**La modalità dipende dal documento.** È selezionabile solo per un documento con indicatore. Altrimenti pulsante e voce di menu restano visibili e attenuati, e il titolo del pulsante ne indica il motivo: «Questo documento non è una presentazione». Un documento mostrato nella vista **Diapositive**, o che vi era aperto alla chiusura, e che non porta più l'indicatore appare nella vista di lettura.

La vista mostra una diapositiva, sopra di essa il contatore, per esempio «3 / 12», e i pulsanti **Precedente**, **Successiva** e **Avvia proiezione**. Al passaggio nella vista compare la diapositiva in cui si trova il cursore. Ciò che si vede è sempre lo stato attuale del documento, comprese le modifiche non salvate.

**Sfogliare** funziona con i pulsanti, con la **rotellina del mouse** sopra la diapositiva (verso il basso la successiva, verso l'alto la precedente, una diapositiva per movimento della rotellina) e con la tastiera non appena la superficie delle diapositive ha il focus:

| Tasto | Effetto |
| ----- | ------- |
| `Freccia destra`, `Pag giù`, `Spazio` | diapositiva successiva |
| `Freccia sinistra`, `Pag su`, `Maiusc+Spazio` | diapositiva precedente |
| `Home`, `Fine` | prima o ultima diapositiva |

Alla prima e all'ultima diapositiva lo sfogliare si ferma.

## Proiezione

La proiezione mostra la presentazione a **schermo intero**: la finestra passa a schermo intero, tutte le barre dell'applicazione scompaiono e si vede soltanto la diapositiva, grande quanto lo schermo la contiene. Si avvia nella vista **Diapositive**:

- con **Visualizza → Presentazione → Avvia proiezione**,
- con predefinito `F5`,
- con il pulsante **Avvia proiezione** sopra la diapositiva.

Anche la palette dei comandi offre il comando. La proiezione comincia dalla diapositiva che la vista sta mostrando. Si sfoglia con gli stessi tasti della vista; in più, un **clic del mouse** passa alla diapositiva successiva, e la **rotellina del mouse** sfoglia una diapositiva per movimento, verso il basso la successiva e verso l'alto la precedente.

Si **termina** con `Esc`. Termina anche quando si esce dallo schermo intero in altro modo, quando un'altra finestra passa in primo piano o quando cambiano il documento o la vista. In seguito la vista resta sull'ultima diapositiva mostrata. La finestra esce di nuovo dallo schermo intero, a meno che non vi fosse già prima della proiezione.

## Esportare le diapositive

Le due esportazioni si trovano in **File → Altre funzioni file → Esporta** e nella palette dei comandi. Sono disponibili per ogni documento di presentazione, qualunque sia la vista in cui è mostrato; per un documento senza indicatore restano attenuate. Ogni diapositiva vi appare come la mostra la vista, con tema, immagini di sfondo, numero di pagina, intestazione e piè di pagina, diagrammi e formule, ma senza note del relatore e senza la barra delle diapositive troppo piene. Se si annulla la finestra di dialogo, non nasce nulla. Dopo l'esportazione, la barra di stato indica il numero di diapositive e, se qualcosa è stato omesso, che cosa.

### Come PDF

**Esporta diapositive come PDF…** chiede la destinazione, proponendo il nome del documento con l'estensione `.pdf` nella stessa cartella, e scrive un file PDF con **una diapositiva per pagina**. La pagina ha il formato della diapositiva, 16:9 o 4:3, e nessun margine. Le impostazioni di formato carta e margini dell'esportazione PDF normale qui non hanno effetto.

### Come pagine HTML

**Esporta diapositive come HTML…** chiede una cartella e vi crea **una pagina HTML per diapositiva**: `folie-001.html`, `folie-002.html` e così via, oltre a `index.html` come pagina iniziale con la prima diapositiva. Se la cartella scelta è vuota o contiene un'esportazione precedente, le pagine nascono lì; altrimenti nasce una sottocartella con il nome del documento e il suffisso `-diapositive`, e i file già presenti restano intatti.

Qualsiasi browser apre le pagine, senza l'applicazione e senza connessione di rete. Ogni pagina è completa di per sé: immagini, diagrammi e formule vi sono incorporati, così la cartella si può spostare o consegnare per intero. Sotto la diapositiva stanno **Precedente**, il contatore e **Successiva**, nella lingua che l'interfaccia aveva al momento dell'esportazione; inoltre si sfoglia con gli stessi tasti della proiezione, e la diapositiva si adatta alla dimensione della finestra del browser. Collegamenti e immagini seguono le regole dell'esportazione HTML di un documento (vedi [Strumenti](tools.md)): un collegamento a un altro documento resta come testo, e un'immagine che non si può incorporare compare come il suo testo; un'immagine di sfondo di questo tipo viene omessa.

## L'estensione «Vista presentazione»

La funzione appartiene alle [estensioni interne](extensions.md) («Vista presentazione», gruppo «Rendering») e alla modalità di lavoro **Avanzata**: nella modalità **Principiante** è disattivata, in **Avanzata** e **Completa** è attiva.

Se è disattivata, vengono meno la vista **Diapositive**, il sottomenu **Presentazione** del menu **Visualizza**, i due comandi di esportazione e le loro voci nella palette dei comandi e nelle scorciatoie. L'indicatore non ha allora alcun effetto: un documento di presentazione è un normale documento Markdown, e `---` vi è una linea orizzontale. Un documento che era aperto nella vista **Diapositive** appare nella vista di lettura. Non si perde nulla, e disattivare e riattivare non scrive mai nulla; dopo la riattivazione la presentazione è lì, invariata.

## Compatibilità con altri strumenti

Indicatore, chiavi di controllo, righe di separazione e la notazione delle immagini con `bg` seguono uno strumento diffuso che crea diapositive a partire da Markdown e contrassegna i propri file con `marp: true`. La compatibilità è un impegno esplicito: una presentazione scritta là si apre qui come presentazione, senza che nel file si debba cambiare nulla.

**Che cosa vale qui come là:** l'indicatore `marp: true`, la separazione con `---`, le chiavi `paginate`, `header`, `footer` e `size`, la notazione delle immagini `![bg …](…)` con la divisione in due e i commenti HTML come note del relatore. I commenti con direttive dell'altro strumento non contano come note né qui né là.

**Dove l'applicazione si discosta:**

- **`***` e `___` qui non separano diapositive.** L'altro strumento comincia una nuova diapositiva anche lì. Chi vuole un file suddiviso allo stesso modo in entrambi gli strumenti separa solo con `---` e non scrive linee su una diapositiva con `***` o `___`.
- **L'altro strumento non conosce le note `%%`** e le mostra come testo sulla diapositiva. Chi ha bisogno di note in entrambi gli strumenti le scrive come commento HTML `<!-- … -->`; queste valgono in entrambe le direzioni.
- **Le direttive per singola diapositiva qui non hanno effetto.** Commenti come `<!-- _paginate: false -->` o `<!-- _class: lead -->`, con cui l'altro strumento dà un aspetto diverso a singole diapositive, restano nel documento ma non vengono eseguiti; per tutte le diapositive valgono le indicazioni dell'intestazione. Non ha effetto nemmeno la chiave d'intestazione `headingDivider`, con cui l'altro strumento inizia una nuova diapositiva ai titoli: un file che la usa qui dà meno diapositive. Entrambe le cose arriveranno con una fase di ampliamento successiva.

**Che cos'altro tenere presente:**

- L'applicazione non scrive mai `marp: true` da sé. Chi vuole proiettare il file anche nell'altro strumento lo aggiunge accanto a `presentation: true`.
- I nomi dei temi sono diversi. Un nome di tema dell'altro strumento qui è sconosciuto; le diapositive appaiono allora nel tema `light`, e la riga di avviso ne cita il nome. Il blocco sotto `theme:` con valori propri è una notazione di questa applicazione.
- La parola `bg` qui deve essere la **prima** parola del testo alternativo. Altre parole, come filtri per le immagini, non vengono interpretate.

## Limiti

- **Le note compaiono solo nella sorgente.** Non esiste una vista del relatore con note, diapositiva successiva e orologio, né note nel PDF o nelle pagine HTML.
- **Una panoramica** delle diapositive come griglia non esiste; si sfoglia da una diapositiva all'altra.
- **I temi propri** nascono solo dal blocco sotto `theme:` nell'intestazione; non c'è un editor dei temi nelle impostazioni.
- **Si esporta come PDF e come pagine HTML.** Non nasce alcun file nel formato pptx.
- **L'aspetto vale per l'intera serie di diapositive.** Un tema, uno sfondo o un'intestazione propri per una singola diapositiva non si possono indicare, e un titolo non comincia da sé una nuova diapositiva.
- **Si modifica nelle viste Markdown**, non sulla diapositiva.

La vista del relatore, la panoramica delle diapositive, l'editor dei temi, le indicazioni per singola diapositiva, la separazione ai titoli e l'esportazione come file pptx sono previsti per fasi di ampliamento successive.
