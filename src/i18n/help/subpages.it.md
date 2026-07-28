# Sottopagine

Le pagine possono avere sottopagine a qualsiasi profondità, per esempio `Processo-A/Bozza` o `Processo-A/Realizzazione/Dettaglio`. La gerarchia è una struttura logica, indipendente dalle cartelle in cui si trovano i file. Questo consente anche sottopagine con lo stesso nome sotto pagine diverse, per esempio una `Bozza` per `Processo-A` e una per `Processo-B`.

## Convenzione dei nomi

Il nome del file porta la gerarchia: il **separatore delle sottopagine è `∕` (Unicode U+2215, «barra di divisione»)**. Assomiglia a una barra obliqua, ma è consentito nei nomi di file di Windows e non compare praticamente mai nei nomi normali — proprio questo rende inequivocabile che un file sia una sottopagina.

```text
Processo-A.md                        pagina
Processo-A∕Bozza.md                  sottopagina di Processo-A
Processo-A∕Realizzazione∕Dettaglio.md  secondo livello
```

Il carattere non va mai digitato: le nuove sottopagine si creano con **File → Nuova sottopagina…** (una finestra chiede il nome; il file viene creato nella cartella del file attivo e si apre come scheda). Per creare file manualmente nell'esplora risorse, copiare il carattere da questa pagina: `∕`

## Link alle sottopagine

Nei wiki link si scrive sempre la barra normale; l'applicazione la traduce nel nome del file. Le destinazioni relative puntano alla propria sottopagina o alla pagina padre e funzionano quindi indipendentemente dal nome della pagina attuale:

```markdown
[[Processo-A/Bozza]]     apre la sottopagina Bozza di Processo-A
[[/Bozza]]               sottopagina Bozza della pagina ATTUALE
[[..]]                   pagina padre della sottopagina attuale
![[Processo-A/Bozza]]    incorpora la sottopagina
```

La risoluzione cerca prima un percorso di cartella reale (`[[sottocartella/File]]` resta un link di percorso), poi il file della sottopagina — nella propria cartella e nell'intero ambito di ricerca. Se esistono entrambi, il [linter Markdown](tools.md) segna la destinazione come ambigua. Dopo `[[` il completamento automatico propone le sottopagine in notazione con barra; dopo `[[/` le sottopagine della pagina attuale.

## Navigazione

Quando una sottopagina è attiva, un **breadcrumb** sopra il documento (viste lettura, divisa e live) mostra la catena delle pagine padre con livelli cliccabili; i livelli intermedi inesistenti sono sottolineati a punti e non cliccabili. La sezione laterale **Sottopagine** (Visualizza → Pannelli → Sottopagine, oppure l'icona delle sottopagine nella barra di stato) elenca le sottopagine dirette del file attivo; un clic le apre.

## Rinominare

**File → Rinomina…** (anche nel menu contestuale della scheda) rinomina il file attivo. Le schede aperte, i segnalibri, l'elenco dei file recenti e il [file di cronologia](history.md) seguono il nuovo nome.

- Rinominare una pagina **con sottopagine** porta con sé l'intero albero delle sottopagine; la finestra ne indica prima il numero.
- Rinominare una **sottopagina** cambia solo il proprio segmento di nome; la catena padre resta invariata. Vale in entrambi i punti, anche nella [riga del titolo](tools.md) sopra il documento: lì la parte superiore precede il segmento modificabile, attenuata e non modificabile.
- **Cambia il nome completo:** L'opzione omonima nella finestra di rinomina libera anche le parti superiori del nome di una sottopagina. È disattivata per impostazione predefinita di proposito, perché una modifica lì colloca la pagina sotto un'altra pagina superiore e agisce su tutte le sue sottopagine.
- **Aggiornare i link:** La casella «Aggiorna i link negli altri file» riscrive i link wiki, gli incorporamenti e i link Markdown relativi in entrata al nuovo nome; nella cascata anche i riferimenti a ogni sottopagina rinominata. Una seconda casella mostra prima un'**anteprima** dei file interessati; dopo l'esecuzione, un **resoconto** riepiloga i file rinominati, aggiornati e non aggiornabili. I valori predefiniti si trovano in Impostazioni → Comportamento → «Link durante la rinomina».
- I documenti aperti seguono; un documento con **modifiche non salvate** riceve l'aggiornamento nell'editor come un proprio passo di annullamento, mentre sul disco viene aggiornato solo l'ultimo stato salvato.
- Con la [cronologia del documento](history.md) attiva, ogni aggiornamento è tracciabile come revisione e può essere annullato; senza cronologia non c'è ripristino.
- In un'applicazione di area, l'aggiornamento copre l'intera area; senza area, lo spazio di ricerca noto, e il linter resta la rete per il resto.

## Scollegare

**File → Scollega dalla pagina superiore…** (anche nel menu contestuale della scheda di una sottopagina) trasforma una sottopagina in una pagina autonoma: `Prozess-A/Entwurf` diventa `Entwurf`.

- La finestra indica prima la destinazione e il numero di **sottopagine proprie** che la seguono. `Prozess-A/Entwurf/Tief` diventa `Entwurf/Tief`: la gerarchia sottostante resta quindi invariata.
- **I link restano validi:** i link in entrata vengono aggiornati per la stessa via della rinomina, con le stesse caselle per anteprima e resoconto.
- Il **nome di destinazione è modificabile nella finestra**. Serve quando a quel livello esiste già un file con lo stesso nome: in quel caso non viene rinominato nulla, e un nome diverso va a segno al secondo tentativo.
- Una barra non è ammessa nel nome di destinazione, perché il risultato è una pagina autonoma. Spostare una pagina sotto un'**altra** pagina superiore non ne fa parte; chi ne ha bisogno cambia il nome completo nella finestra di rinomina.
