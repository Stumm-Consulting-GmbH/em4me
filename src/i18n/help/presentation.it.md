# Presentazione

Una **presentazione** è un normale documento Markdown il cui contenuto è suddiviso in **diapositive**. L'applicazione lo mostra diapositiva per diapositiva nella vista **Diapositive**, lo proietta a schermo intero o in una finestra separata, offre al relatore una **visualizzazione relatore** con note e tempo ed esporta le diapositive come PDF, come pagine HTML, come file PowerPoint o come immagini.

La presentazione è **un'ulteriore vista dello stesso documento** e non un formato di file proprio. Si scrive nelle viste Markdown; la vista **Diapositive** si limita a mostrare e non cambia mai nulla nel testo. Unica eccezione è la finestra di dialogo **Aspetto di questa presentazione…**, che su richiesta scrive l'aspetto nell'intestazione del file.

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

### Separare ai titoli

Con la chiave `headingDivider` nell'intestazione comincia inoltre una nuova diapositiva **prima di ogni titolo** fino al livello indicato. Il valore è un numero da 1 a 6:

```markdown
---
presentation: true
headingDivider: 2
---

# Prima parte

## Un sottopunto

## Un altro sottopunto
```

Qui ogni titolo dei livelli 1 e 2 dà una diapositiva propria, cioè tre diapositive senza una sola riga di separazione. Il titolo sta in cima alla sua nuova diapositiva. Se prima di esso sulla diapositiva non c'è altro che righe vuote e commenti, non comincia nessuna diapositiva in più; righe di separazione e titoli si possono quindi mescolare senza che nascano diapositive vuote. I titoli nei blocchi di codice, nelle citazioni e negli elenchi non separano.

L'indicazione vale per l'intera serie di diapositive, anche quando si trova in un commento più in basso (vedi «Indicazioni per singola diapositiva»); se ce ne sono più d'una, vale l'ultima. Un valore non valido non viene considerato, e la riga di avviso lo cita. La notazione come elenco, per esempio `[1, 3]`, resta senza effetto.

## L'intestazione: le chiavi di controllo

Oltre all'indicatore, l'intestazione accoglie sei chiavi di controllo, tutte facoltative:

| Chiave | Effetto | Predefinito |
| ------ | ------- | ----------- |
| `theme` | aspetto delle diapositive: `light`, `dark`, `accent` o il nome di un tema proprio, a scelta con valori propri (vedi sotto) | `light` |
| `paginate` | `true` mostra il numero di pagina in basso a destra su ogni diapositiva | `false` |
| `header` | testo della riga di intestazione su ogni diapositiva | nessuno |
| `footer` | testo della riga a piè di pagina su ogni diapositiva | nessuno |
| `size` | formato delle diapositive: `16:9` o `4:3` | `16:9` |
| `headingDivider` | numero da 1 a 6: ogni titolo fino a questo livello comincia una nuova diapositiva (vedi sopra) | nessuno |

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

Le altre chiavi dell'intestazione, come `title` o `tags`, restano intatte e agiscono come in ogni altro documento. Se un valore non è valido, vale il predefinito. Per un tema sconosciuto o non valido, per un formato sconosciuto e per un valore non valido di `headingDivider`, una **riga di avviso** sopra la diapositiva ne indica il motivo. Tema, colori, intestazione, piè di pagina e numero di pagina si possono indicare in modo diverso per singole diapositive (vedi «Indicazioni per singola diapositiva»).

## Aspetto

### I tre temi

| Tema | Aspetto |
| ---- | ------- |
| `light` | testo scuro su bianco, accento in blu |
| `dark` | testo chiaro su quasi nero, accento in azzurro |
| `accent` | testo bianco su blu intenso, accento in giallo |

Le diapositive appaiono uguali con ogni schema di colori dell'applicazione: il tema appartiene alla presentazione, non all'interfaccia.

Chi ha spesso bisogno di uno stesso aspetto lo crea come **tema proprio** e lo sceglie con il suo nome (vedi «Temi propri»).

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

Ogni diapositiva ha un formato fisso, 16:9 o 4:3, e viene adattata in modo uniforme alla superficie disponibile; il testo cresce e si riduce con essa. Se il contenuto di una diapositiva non ci sta, viene **ridotto automaticamente** finché ci sta, al massimo fino alla metà della sua grandezza. Intestazione, piè di pagina e numero di pagina mantengono la loro grandezza, e il margine della diapositiva resta uguale. La riduzione agisce ovunque allo stesso modo: nella vista, nella proiezione e nella visualizzazione relatore, nella panoramica e in entrambe le esportazioni.

Solo ciò che non ci sta nemmeno a metà grandezza viene tagliato al bordo, e una **barra tratteggiata** sul bordo inferiore segnala la diapositiva troppo piena. La barra non compare nella proiezione né nelle esportazioni. Il rimedio è una diapositiva in più.

## Temi propri

Un **tema proprio** è un aspetto con un nome che si basa su uno dei tre temi forniti e imposta in modo diverso alcuni dei sette valori. Vale in ogni presentazione che lo nomina nell'intestazione:

```yaml
theme: Azienda
```

Il nome viene trovato senza badare a maiuscole e minuscole; `theme: azienda` sceglie quindi anche il tema «Azienda». Come qualsiasi altro tema, un tema proprio può fare da base a un blocco la cui voce `name` lo nomina. Se il tema nominato non esiste, per esempio su un altro computer, le diapositive appaiono nel tema `light`, e la riga di avviso ne cita il nome.

I temi propri fanno parte delle impostazioni dell'applicazione, non del file. Valgono in tutte le finestre e viaggiano con il file della propria configurazione (vedi [Esportare e importare le impostazioni](setup-exchange.md)).

### La sezione «Temi delle diapositive» delle impostazioni

In **File → Impostazioni… → Temi delle diapositive**, nel blocco «Estensioni (interne)», si gestiscono i temi propri:

- **Nuovo** crea un tema che si basa sull'aspetto `light`, `dark` o `accent` scelto in **Modello**; all'inizio si chiama «Nuovo tema».
- **Duplica** crea una copia del tema scelto, **Elimina** lo rimuove.
- Nel campo **Nome** si rinomina il tema. Un nome non può essere vuoto, non può appartenere a un tema fornito e non può essere già assegnato, nemmeno con altre maiuscole e minuscole; una violazione viene segnalata subito, e Applica e OK restano bloccati finché non è corretta.

Sotto si trovano i sette valori della tabella «Sostituire singoli valori», ciascuno in una riga: i colori hanno un selettore di colore e un campo di testo che accetta qualsiasi notazione CSS, il carattere un campo di testo con suggerimenti. **Reimposta** riporta una riga al valore del tema di base. Un valore non valido viene segnato e non adottato. Una **diapositiva di anteprima** mostra l'aspetto a ogni immissione. Si salva con **Applica** o **OK**; la modifica agisce subito in tutte le presentazioni aperte.

### Aspetto di questa presentazione

**Visualizza → Presentazione → Aspetto di questa presentazione…** imposta l'aspetto di un singolo file senza scrivere l'intestazione a mano. Il comando è disponibile per ogni presentazione modificabile, qualunque sia la vista in cui è mostrata, e si trova nella palette dei comandi.

In alto la finestra di dialogo indica il tema, scelto tra i temi forniti e quelli propri; un nome sconosciuto dell'intestazione resta selezionabile come «Nome (sconosciuto)». Sotto indica per ogni valore se vale **come il tema**, con il valore del tema tra parentesi, o come **valore proprio**. Un'immissione porta la riga su «valore proprio», **Reimposta** la riporta a «come il tema».

**OK** scrive la scelta nell'intestazione del file: senza valori propri come `theme:` con il nome, altrimenti come blocco con `name:` e i valori propri. Il passo si annulla in un colpo solo. Le altre voci dell'intestazione restano invariate, e chi non ha cambiato nulla non cambia nulla nel file. Se il documento è cambiato mentre la finestra di dialogo era aperta, non viene scritto nulla, e la barra di stato lo segnala.

Due altri pulsanti vanno oltre il singolo file:

- **Salva come tema…** chiede un nome, crea un tema proprio dal tema scelto e dai valori propri e scrive nel file solo `theme:` con questo nome. Se si annulla il nome, tutto resta com'era.
- **Copia i valori del tema nel file** è disponibile con un tema proprio. Scrive tutti e sette i valori come blocco nell'intestazione, basato sul tema fornito sottostante. Così il file appare uguale anche dove il tema proprio non esiste, per esempio dopo averlo passato ad altri.

## Numero di pagina, intestazione e piè di pagina

`paginate: true` mostra su ogni diapositiva il suo numero in basso a destra. `header` e `footer` mettono una riga in alto o in basso su ogni diapositiva; una formattazione semplice come grassetto, corsivo o un collegamento appare formattata. Un valore vuoto non mostra alcuna riga, un testo troppo lungo termina con puntini di sospensione. Nell'intestazione queste indicazioni valgono allo stesso modo per tutte le diapositive; per singole diapositive si possono impostare diversamente (vedi «Indicazioni per singola diapositiva»).

## Indicazioni per singola diapositiva

Singole diapositive possono avere un aspetto diverso dal resto. Per questo sulla diapositiva sta un commento HTML con una o più chiavi:

```markdown
# Stato intermedio

<!-- _backgroundColor: "#fff3bf" -->
<!-- _paginate: false -->
```

**La validità dipende dal trattino basso:**

- Con `_` davanti alla chiave, l'indicazione vale **solo per questa diapositiva**.
- Senza `_`, vale **da questa diapositiva in poi** per tutte le successive, finché non arriva una nuova indicazione della stessa chiave.
- Solo `headingDivider` vale sempre per l'intera serie di diapositive (vedi «Separare ai titoli»).

**Vengono interpretate queste chiavi:**

| Chiave | Effetto |
| ------ | ------- |
| `theme` | cambia il tema, con il nome di un tema fornito o proprio |
| `backgroundColor`, `backgroundImage` | sfondo della diapositiva, per esempio un colore o una sfumatura |
| `color` | colore del testo corrente |
| `header`, `footer` | testo della riga di intestazione e di quella a piè di pagina; un testo vuoto nasconde la riga |
| `paginate` | `true` mostra il numero di pagina, `false` lo nasconde e continua a contare, `hold` lo mostra senza continuare a contare, `skip` lo nasconde senza continuare a contare |
| `background`, `text`, `heading`, `accent`, `font`, `header-footer`, `page-number` | i sette valori della tabella «Sostituire singoli valori» |

Un cambio di tema sostituisce il tema insieme ai valori propri del blocco nell'intestazione; colori e carattere impostati tramite commento continuano a valere oltre il cambio. I valori che caricherebbero un file o un indirizzo non vengono adottati, come nell'intestazione; un'immagine di sfondo si imposta con la notazione `bg` (vedi «Immagine di sfondo e divisione in due»). Se un valore non è valido o un tema è sconosciuto, continua a valere il valore precedente, e la riga di avviso ne indica il motivo su questa diapositiva.

Commenti di questo tipo non sono note del relatore. Altre chiavi della stessa notazione, come `class` o `style`, restano nel documento ma qui non hanno effetto (vedi «Compatibilità con altri strumenti»).

## Note del relatore

I commenti di una diapositiva sono le sue **note del relatore**. Valgono entrambe le forme:

```markdown
# Risultati

- Fatturato in crescita
- Costi in calo

%% Citare qui i dati dell'anno precedente. %%

<!-- In caso di domande, rinviare all'allegato. -->
```

Fanno eccezione i commenti con istruzioni per strumenti di formattazione, come `<!-- prettier-ignore -->` o `<!-- markdownlint-disable -->`: come i commenti con indicazioni per singola diapositiva, non sono note del relatore e non compaiono né sulla diapositiva, né nella visualizzazione relatore, né in alcuna esportazione.

Le note non compaiono sulla diapositiva né nella proiezione. La **visualizzazione relatore** le mostra a chi parla, formattate come il testo su una diapositiva, cioè con grassetto, corsivo, elenchi e collegamenti; l'HTML in una nota vi compare come testo. Nel PDF e nelle pagine HTML compaiono solo se sono attivate (vedi «Includere le note del relatore»). Nell'editor restano visibili. Se l'estensione «Commenti» è disattivata, `%%` è testo normale e compare sulla diapositiva; i commenti HTML restano note anche in quel caso. I commenti privati con `%%` sono descritti nella pagina [Costrutti in linea](inline.md).

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

## Panoramica delle diapositive

**Visualizza → Presentazione → Panoramica delle diapositive** mostra nella vista **Diapositive** tutte le diapositive come **griglia**, ciascuna come piccola immagine con il suo numero. All'inizio è selezionata la diapositiva che la vista sta mostrando.

| Immissione | Effetto |
| ---------- | ------- |
| `Freccia sinistra`, `Freccia destra` | una diapositiva indietro o avanti |
| `Freccia su`, `Freccia giù` | una riga della griglia su o giù |
| `Home`, `Fine` | prima o ultima diapositiva |
| Clic, `Invio`, `Spazio` | passare alla diapositiva scelta e chiudere la panoramica |
| `Esc` | chiudere la panoramica senza cambiare diapositiva |

La rotellina del mouse scorre la griglia. Una seconda chiamata del comando chiude anch'essa la panoramica, come l'avvio di una proiezione. La panoramica mostra lo stato al momento dell'apertura; una nuova apertura mostra le modifiche al documento. Il comando si trova anche nella palette dei comandi.

## Proiezione

La proiezione mostra la presentazione a **schermo intero**: la finestra passa a schermo intero, tutte le barre dell'applicazione scompaiono e si vede soltanto la diapositiva, grande quanto lo schermo la contiene. Si avvia nella vista **Diapositive**:

- con **Visualizza → Presentazione → Avvia proiezione**,
- con predefinito `F5`,
- con il pulsante **Avvia proiezione** sopra la diapositiva.

Anche la palette dei comandi offre il comando. La proiezione comincia dalla diapositiva che la vista sta mostrando. Si sfoglia con gli stessi tasti della vista; in più, un **clic del mouse** passa alla diapositiva successiva, e la **rotellina del mouse** sfoglia una diapositiva per movimento, verso il basso la successiva e verso l'alto la precedente. Gli elenchi le cui voci devono comparire passo per passo sono descritti in «Scoprire gli elenchi voce per voce».

Si **termina** con `Esc`. Termina anche quando si esce dallo schermo intero in altro modo, quando un'altra finestra passa in primo piano o quando cambiano il documento o la vista. In seguito la vista resta sull'ultima diapositiva mostrata. La finestra esce di nuovo dallo schermo intero, a meno che non vi fosse già prima della proiezione.

Questa proiezione si svolge sempre nella finestra dell'applicazione, anche quando è collegato un secondo schermo. Per presentare con un proiettore o un secondo schermo ci sono la proiezione in una finestra separata e la visualizzazione relatore (vedi «Presentare con due schermi»).

## Scoprire gli elenchi voce per voce

Le voci di un elenco si possono **scoprire una alla volta** nella proiezione. Conta come è scritto l'elenco:

```markdown
* compare con il primo passo
* compare con il secondo passo

1) anche gli elenchi numerati
2) con la parentesi invece del punto

- compare subito
1. compare anch'essa subito
```

Le voci con `*` e le voci numerate con `)` vengono scoperte, le voci con `-` o `+` e le voci numerate con `.` ci sono fin da subito. Ogni voce è un passo, anche una rientrata; una voce rientrata resta nascosta finché lo è la sua voce superiore.

Nella proiezione, sia a schermo intero sia in una finestra separata, e nella visualizzazione relatore, «avanti» scopre la voce successiva, e solo dopo l'ultima arriva la diapositiva successiva; «indietro» nasconde di nuovo l'ultima voce scoperta. Una diapositiva raggiunta all'indietro appare completa, una raggiunta in avanti con le voci nascoste. Le voci nascoste mantengono il loro spazio, così la diapositiva non salta durante lo scoprimento.

Nella vista **Diapositive**, nella panoramica, nell'anteprima della diapositiva successiva e in entrambe le esportazioni tutte le voci compaiono subito.

## Presentare con due schermi

Per un intervento con un proiettore o un secondo schermo, una **finestra separata** mostra al pubblico solo la diapositiva, mentre la finestra dell'applicazione resta utilizzabile. Entrambi i comandi sono disponibili nella vista **Diapositive**, nel sottomenu **Visualizza → Presentazione** e nella palette dei comandi; non hanno una scorciatoia predefinita, ma se ne può assegnare una in Impostazioni → Scorciatoie da tastiera.

**Lo schermo:** se sono collegati due o più schermi, la finestra si apre a schermo intero su uno schermo su cui non si trova la finestra dell'applicazione. Con un solo schermo si apre come finestra normale, che si può spostare e ridimensionare. La finestra non ha né menu né schede, non conta tra le finestre dell'applicazione e non ritorna dopo un riavvio.

### Proiezione in una finestra separata

**Visualizza → Presentazione → Proiezione in una finestra separata** apre la finestra per il pubblico e vi mostra la diapositiva che la vista sta mostrando. Si sfoglia in entrambe le finestre con gli stessi tasti della vista; nella finestra del pubblico sfogliano anche il clic e la rotellina del mouse. Le due finestre mostrano sempre la stessa diapositiva. Le modifiche al documento compaiono subito anche per il pubblico.

Si **termina** con `Esc` in una delle due finestre, con **Visualizza → Presentazione → Termina proiezione** o chiudendo la finestra del pubblico. Termina anche quando il documento non si trova più nella vista **Diapositive**. Si svolge sempre una sola proiezione alla volta.

### Visualizzazione relatore

**Visualizza → Presentazione → Visualizzazione relatore** avvia la proiezione in una finestra separata e trasforma la finestra dell'applicazione nel posto del relatore. Lì si trovano:

- a sinistra la **diapositiva attuale**, come la vede il pubblico;
- in alto a destra la **diapositiva successiva**, sull'ultima diapositiva al suo posto la parola «Fine»;
- sotto, le **note del relatore** della diapositiva attuale, formattate e scorrevoli se lunghe; senza note un breve avviso;
- sotto ancora il **tempo trascorso** dall'avvio e l'**ora**, con i pulsanti **Pausa** o **Riprendi** e **Azzera**.

Sopra entrambe stanno come di consueto il contatore e i pulsanti **Precedente** e **Successiva**. Il tempo parte con l'avvio della visualizzazione relatore; **Azzera** lo riporta a zero, un tempo in corso continua poi a scorrere, uno in pausa resta in pausa.

Si sfoglia come nella proiezione in una finestra separata, in entrambe le finestre con gli stessi tasti; gli elenchi con voci da scoprire si scoprono passo per passo con «avanti». Se il documento viene modificato durante l'intervento, diapositiva attuale, diapositiva successiva e note si aggiornano subito; se la diapositiva mostrata scompare, la vista si posiziona sull'ultima rimasta.

La visualizzazione relatore si **termina** negli stessi modi della proiezione in una finestra separata. In seguito il tempo scompare, e la vista **Diapositive** resta sull'ultima diapositiva mostrata.

## Esportare le diapositive

Le quattro esportazioni si trovano in **File → Altre funzioni file → Esporta** e nella palette dei comandi. Sono disponibili per ogni documento di presentazione, qualunque sia la vista in cui è mostrato; per un documento senza indicatore restano attenuate. Ogni diapositiva vi appare come la mostra la vista, con tema, indicazioni per singola diapositiva, immagini di sfondo, numero di pagina, intestazione e piè di pagina, diagrammi e formule, ma senza la barra delle diapositive troppo piene. Le note del relatore entrano nel PDF e nelle pagine HTML solo se sono attivate; il file PowerPoint le include sempre, le immagini mai (vedi sotto). Se si annulla la finestra di dialogo, non nasce nulla. Dopo l'esportazione, la barra di stato indica il numero di diapositive e, se qualcosa è stato omesso, che cosa.

### Come PDF

**Esporta diapositive come PDF…** chiede la destinazione, proponendo il nome del documento con l'estensione `.pdf` nella stessa cartella, e scrive un file PDF con **una diapositiva per pagina**. La pagina ha il formato della diapositiva, 16:9 o 4:3, e nessun margine. Le impostazioni di formato carta e margini dell'esportazione PDF normale qui non hanno effetto.

### Come pagine HTML

**Esporta diapositive come HTML…** chiede una cartella e vi crea **una pagina HTML per diapositiva**: `folie-001.html`, `folie-002.html` e così via, oltre a `index.html` come pagina iniziale con la prima diapositiva. Se la cartella scelta è vuota o contiene un'esportazione precedente, le pagine nascono lì; altrimenti nasce una sottocartella con il nome del documento e il suffisso `-diapositive`, e i file già presenti restano intatti.

Qualsiasi browser apre le pagine, senza l'applicazione e senza connessione di rete. Ogni pagina è completa di per sé: immagini, diagrammi e formule vi sono incorporati, così la cartella si può spostare o consegnare per intero. Sotto la diapositiva stanno **Precedente**, il contatore e **Successiva**, nella lingua che l'interfaccia aveva al momento dell'esportazione; inoltre si sfoglia con gli stessi tasti della proiezione, e la diapositiva si adatta alla dimensione della finestra del browser. Collegamenti e immagini seguono le regole dell'esportazione HTML di un documento (vedi [Strumenti](tools.md)): un collegamento a un altro documento resta come testo, e un'immagine che non si può incorporare compare come il suo testo; un'immagine di sfondo di questo tipo viene omessa.

### Come file PowerPoint

**Esporta diapositive come PowerPoint…** chiede la destinazione, proponendo il nome del documento con l'estensione `.pptx` nella stessa cartella, e scrive un file PowerPoint con **una diapositiva PowerPoint per diapositiva**. Ognuna porta un'unica immagine che mostra la diapositiva esattamente come la proiezione: con il tema o un tema proprio, le indicazioni per singola diapositiva, le immagini di sfondo, le formule, i diagrammi, le immagini e, per le diapositive troppo piene, la riduzione. L'immagine ha il doppio della risoluzione della diapositiva, perché resti nitida anche su schermi grandi e proiettori. Il file ha il formato della diapositiva, 16:9 o 4:3, secondo la chiave `size`.

Le **note del relatore** compaiono come testo nel campo delle note della diapositiva corrispondente, dove il programma di presentazione le mostra al relatore senza che il pubblico le veda. Vengono incluse **sempre**, indipendentemente dall'interruttore **Includi le note del relatore**, e appaiono così come sono scritte nel documento, senza formattazione; più note della stessa diapositiva sono separate da un paragrafo vuoto. Dopo l'esportazione, il messaggio indica il numero di diapositive e di note del relatore incluse.

Poiché ogni diapositiva è un'immagine, il suo testo non si può né modificare né cercare in PowerPoint; si modifica nel documento e poi si esporta di nuovo.

### Come immagini

**Esporta diapositive come immagini…** chiede una cartella e vi crea **un'immagine per diapositiva** in formato PNG: `folie-001.png`, `folie-002.png` e così via. Per la cartella vale la stessa regola delle pagine HTML: se la cartella scelta è vuota, appena creata o contiene un'esportazione di immagini precedente, le immagini nascono lì; altrimenti nasce una sottocartella con il nome del documento e il suffisso `-diapositive`, e i file già presenti restano intatti. Le immagini sono le stesse del file PowerPoint, a doppia risoluzione, e non contengono note del relatore. Dopo l'esportazione, il messaggio indica il numero di immagini e la cartella.

### Includere le note del relatore

Se le note entrano nell'esportazione lo decide l'interruttore **Includi le note del relatore** in **File → Impostazioni… → Esportazione**, gruppo **Presentazione**. All'inizio è disattivato, perché un file passato ad altri non contenga mai note senza che lo si noti, e vale per il PDF e le pagine HTML. Il file PowerPoint porta sempre le note nel suo campo delle note (vedi sopra); le immagini non ne portano.

- **Nel PDF**, a ogni diapositiva con note segue una **pagina di note** nel formato della diapositiva, intitolata «Diapositiva N – Note», e sotto le note formattate su fondo bianco. Le note più lunghe proseguono su altre pagine dello stesso formato.
- **Nelle pagine HTML**, ogni diapositiva con note ha, tra la diapositiva e la barra di navigazione, un'area **Note** chiusa. Aperta, si posa sulla diapositiva, al massimo fino a metà dell'altezza della finestra del browser, e si può scorrere.

Le diapositive senza note non ricevono né pagina né area di note. Con l'interruttore attivo, il messaggio dopo l'esportazione indica il numero di note incluse; disattivato, segnala che le note del relatore non sono incluse.

## L'estensione «Vista presentazione»

La funzione appartiene alle [estensioni interne](extensions.md) («Vista presentazione», gruppo «Rendering») e alla modalità di lavoro **Avanzata**: nella modalità **Principiante** è disattivata, in **Avanzata** e **Completa** è attiva.

Se è disattivata, vengono meno la vista **Diapositive**, il sottomenu **Presentazione** del menu **Visualizza** con tutti i suoi comandi, i quattro comandi di esportazione delle diapositive, le loro voci nella palette dei comandi e nelle scorciatoie e la sezione **Temi delle diapositive** delle impostazioni. L'indicatore non ha allora alcun effetto: un documento di presentazione è un normale documento Markdown, e `---` vi è una linea orizzontale. Un documento che era aperto nella vista **Diapositive** appare nella vista di lettura. Non si perde nulla, e disattivare e riattivare non scrive mai nulla; dopo la riattivazione la presentazione e i temi propri sono lì, invariati.

## Compatibilità con altri strumenti

Indicatore, chiavi di controllo, righe di separazione, le indicazioni per singola diapositiva e la notazione delle immagini con `bg` seguono uno strumento diffuso che crea diapositive a partire da Markdown e contrassegna i propri file con `marp: true`. La compatibilità è un impegno esplicito: una presentazione scritta là si apre qui come presentazione, senza che nel file si debba cambiare nulla.

**Che cosa vale qui come là:**

- l'indicatore `marp: true` e la separazione con `---`;
- le chiavi `paginate`, `header`, `footer` e `size` nell'intestazione e `headingDivider` con un numero;
- le indicazioni per singola diapositiva nella stessa notazione, con `_` solo per la propria diapositiva e senza `_` da questa diapositiva in poi, per `backgroundColor`, `backgroundImage`, `color`, `header`, `footer` e `paginate`;
- la notazione delle immagini `![bg …](…)` con la divisione in due;
- gli elenchi con `*` e con `1)`, le cui voci compaiono una alla volta nella proiezione;
- i commenti HTML come note del relatore. I commenti con indicazioni per singola diapositiva non contano come note né qui né là.

**Dove l'applicazione si discosta:**

- **`***` e `___` qui non separano diapositive.** L'altro strumento comincia una nuova diapositiva anche lì. Chi vuole un file suddiviso allo stesso modo in entrambi gli strumenti separa solo con `---` e non scrive linee su una diapositiva con `***` o `___`.
- **L'altro strumento non conosce le note `%%`** e le mostra come testo sulla diapositiva. Chi ha bisogno di note in entrambi gli strumenti le scrive come commento HTML `<!-- … -->`; queste valgono in entrambe le direzioni.
- **I temi dell'altro strumento qui non esistono.** `default`, `gaia` e `uncover` qui sono sconosciuti; le diapositive appaiono allora nel tema `light`, e la riga di avviso ne cita il nome. Un **tema proprio** può però portare esattamente questo nome e allora viene applicato: chi crea un tema proprio chiamato `gaia` vede qui il file con quell'aspetto, senza modificarlo.
- **`theme` in un commento qui vale dalla sua diapositiva in poi.** L'altro strumento applica un tema sempre all'intera serie di diapositive. Chi vuole vedere un file allo stesso modo in entrambi gli strumenti sceglie il tema nell'intestazione.
- **Alcune indicazioni per singola diapositiva restano senza effetto:** `class`, `style`, `backgroundPosition`, `backgroundRepeat` e `backgroundSize`, come pure `lang` e `math`. Restano nel documento e non vengono eseguite, senza avviso. Un'immagine di sfondo tramite `backgroundImage` con un file o un indirizzo non viene caricata; per questo c'è la notazione `bg`.
- **`headingDivider` come elenco**, per esempio `[1, 3]`, resta senza effetto; un file che lo usa qui dà meno diapositive.
- **Il commento `<!-- fit -->`**, con cui l'altro strumento porta un titolo alla larghezza della diapositiva, resta senza effetto. Qui invece una diapositiva troppo piena viene ridotta nel suo insieme.

**Che cos'altro tenere presente:**

- L'applicazione non scrive mai `marp: true` da sé. Chi vuole proiettare il file anche nell'altro strumento lo aggiunge accanto a `presentation: true`.
- Il blocco sotto `theme:` con valori propri e i sette valori come indicazione per singola diapositiva, per esempio `<!-- accent: "#ff6b6b" -->`, sono una notazione di questa applicazione.
- La parola `bg` qui deve essere la **prima** parola del testo alternativo. Altre parole, come filtri per le immagini, non vengono interpretate.

## Limiti

- **Si esporta come PDF, come pagine HTML, come file PowerPoint e come immagini.**
- **Nel file PowerPoint ogni diapositiva è un'immagine.** Il suo testo lì non si può né modificare né cercare. Non nasce alcun file PowerPoint con oggetti di testo modificabili, e i file PowerPoint non si possono importare.
- **Programmi verificati:** l'apertura del file è verificata in Microsoft PowerPoint su Windows. LibreOffice Impress viene verificato nel banco di prova automatico su Linux. Altri programmi, come Keynote o Google Slides, leggono il formato secondo lo standard, ma non sono verificati.
- **L'aspetto passa per i temi e i loro sette valori.** Regole di stile proprie in CSS, impaginazioni delle diapositive oltre la divisione in due, animazioni e transizioni tra le diapositive non esistono.
- **Si scoprono solo voci di elenco**, nessun'altra parte di una diapositiva.
- **La riduzione arriva al massimo alla metà.** Ciò che ancora non ci sta viene tagliato.
- **Si modifica nelle viste Markdown**, non sulla diapositiva.
