# Segnalibri

I segnalibri tengono a portata di mano i file usati di frequente, indipendentemente dalla cartella aperta in quel momento. Vivono in un pannello laterale dedicato, come un albero di cartelle e voci di file. Ne esistono due tipi: i **segnalibri generali**, validi in tutta l'applicazione, e i **segnalibri dell'area**, che appartengono a un'[area](apps-windows.md) e viaggiano con essa.

## Il pannello dei segnalibri

Il pannello dei segnalibri si commuta come ogni pannello laterale: tramite la stella della barra di stato, il menu Visualizza → Barra laterale → Pannelli → Segnalibri (predefinito `Ctrl+Maiusc+L`) o una scorciatoia assegnata da te. La commutazione agisce sulla colonna attiva; lato, ordine e gruppi di schede seguono le regole della [barra laterale](sidebar.md). La stella della barra di stato indica inoltre se il file attivo è già tra i segnalibri.

Un clic su una voce apre il file. Se un file con segnalibro manca nella posizione attesa, la voce lo segnala invece di non portare da nessuna parte. Anche nello stato vuoto dell'applicazione, senza documento aperto, l'elenco resta utilizzabile, così i file con segnalibro possono essere aperti direttamente.

## Due sezioni: generale e legata all'area

Quando un'area è aperta, il pannello si divide in due sezioni con intestazioni proprie: **Segnalibri dell'area** e **Segnalibri**. Senza un'area aperta, il pannello mostra solo i segnalibri generali, senza intestazioni di sezione, cioè nella consueta presentazione a una sola sezione.

- I **segnalibri generali** vivono nelle impostazioni globali dell'applicazione e memorizzano percorsi assoluti. Sono sempre disponibili.
- I **segnalibri dell'area** appartengono all'area aperta e vivono nel suo file di area. Le loro destinazioni sono memorizzate in modo relativo alla radice dell'area; compaiono solo finché l'area è aperta e scompaiono dal pannello alla sua chiusura.

Quale sezione stia in alto lo determina l'opzione «Segnalibri dell'area in alto» (Impostazioni → Comportamento). Per impostazione predefinita i segnalibri dell'area stanno in alto; se l'opzione viene disattivata, stanno in alto quelli generali. Senza un'area aperta l'impostazione non ha effetto visibile.

## Perché percorsi relativi

Un segnalibro dell'area non ricorda la propria destinazione come percorso completo, ma in modo relativo alla radice dell'area, con barre in avanti. In questo modo i segnalibri restano validi quando l'intera cartella dell'area viene spostata o copiata su un altro computer: vengono risolti di nuovo rispetto alla radice attuale dell'area a ogni apertura. Perché questa relatività regga, un segnalibro dell'area può puntare solo a file all'interno dell'area. Una destinazione al di fuori dell'area non è possibile; l'applicazione la rifiuta.

## Creare segnalibri

### Segnalibri generali

Il file attivo viene messo tra i segnalibri tramite File → Altre funzioni file → Aggiungi il file attivo ai segnalibri (predefinito `Ctrl+D`) o la stella. Se nessuna area è aperta, oppure il file è al di fuori dell'area aperta, viene creato un segnalibro generale senza chiedere.

Se invece un'area è aperta e il file attivo si trova al suo interno, `Ctrl+D` apre un piccolo menu di scelta presso la stella, con le destinazioni «Segnalibro generale» e «Segnalibro dell'area». Così, a ogni creazione, è chiaro in quale sezione va il segnalibro.

### Segnalibri dell'area direttamente

Due menu contestuali creano un segnalibro dell'area senza il rimando alla scelta della destinazione:

- La **riga del file nel pannello dell'area** offre «Aggiungi come segnalibro dell'area» con il clic destro; lì i file sono comunque all'interno dell'area.
- Il **menu contestuale di una scheda di file** offre «Aggiungi come segnalibro generale» e, con un'area aperta e il file all'interno, in più «Aggiungi come segnalibro dell'area».

## Convertire tra le sezioni

Un segnalibro esistente può passare all'altro tipo tramite il suo menu contestuale: «Converti in segnalibro dell'area» o «Converti in segnalibro generale». Ciò vale anche per un'intera cartella con il suo sottoalbero, che viene allora ripreso con struttura e ordine.

Nella conversione in un segnalibro dell'area, l'applicazione verifica che tutte le destinazioni interessate siano all'interno dell'area. Se non è così, l'intera operazione viene rifiutata e segnala che la conversione contiene destinazioni al di fuori dell'area. In questo modo la regola dei percorsi relativi resta intatta.

## Organizzare e curare

Entrambe le sezioni condividono gli stessi strumenti. Il menu del clic destro di una voce crea nuove cartelle e sottocartelle; le voci possono essere rinominate, spostate in una cartella e rimosse. Le cartelle contengono a loro volta cartelle, così la raccolta può essere strutturata liberamente.

Il trascina e rilascia ordina all'interno di una sezione e sistema le voci nelle cartelle. Il trascinamento resta volutamente all'interno della propria sezione: una voce non viene trascinata oltre il confine tra segnalibri dell'area e generali. Per cambiare sezione si usa la conversione.

Quando un file con segnalibro viene rinominato all'interno dell'applicazione, o viene rinominata la sua cartella, i segnalibri seguono automaticamente, in entrambe le sezioni: il modello generale tramite i percorsi assoluti, l'albero dell'area tramite quelli relativi.

## Senza un'area aperta

Senza un'area aperta, è visibile solo la sezione generale, senza intestazione e senza sezione dell'area. I segnalibri dell'area non vanno allora perduti, ma attendono nel file di area; non appena l'area viene riaperta, ricompaiono nel pannello.
