# Allegati

Un allegato è un file che appartiene a un documento: una schermata, una relazione, un foglio di calcolo. Incollarlo o trascinarlo nel documento evita di salvarlo e collegarlo a mano. Il file viene riposto e nel testo compare il riferimento corrispondente.

## Incollare un allegato

Un file o un'immagine dagli appunti si inserisce con `Ctrl+V`. Il file viene riposto nella posizione configurata e il riferimento compare al cursore.

Un'immagine diventa un riferimento di immagine, ogni altro file un collegamento normale:

```markdown
![Verbale_20260729-143022](Verbale/Verbale_20260729-143022.png)
[Relazione](Verbale/Relazione.pdf)
```

`Ctrl+Maiusc+V` resta un incollaggio semplice e non ripone nulla.

## Trascinare un allegato

Un file può anche essere trascinato dal gestore file. Il punto in cui viene rilasciato decide il risultato:

| Punto di rilascio | Risultato |
|---|---|
| Area dell'editor | Allegato, riferimento nella posizione del puntatore |
| Vista renderizzata | Allegato, riferimento alla fine del documento |
| Barra delle schede, pannello laterale, finestra vuota | Il file viene aperto |

Durante il trascinamento la sovrimpressione indica quale dei due risultati si applica. Così anche un file Markdown può essere allegato di proposito invece che aperto.

Più file trascinati insieme producono più riferimenti. Incollare o trascinare vale come **un** passo: `Ctrl+Z` toglie il riferimento. Il file riposto resta al suo posto e all'occorrenza si elimina dal gestore file.

## Dove viene riposto il file

La posizione si imposta in Impostazioni → Allegati e può inoltre essere definita per area (Impostazioni → Area corrente → Allegati). Con un libro aperto quel blocco si chiama **Libro corrente**, con una libreria aperta **Libreria corrente**.

| Posizione | Dove va il file |
|---|---|
| Cartella con il nome del documento | in una sottocartella che porta il nome del documento (predefinito) |
| Sottocartella fissa | in una sottocartella con il nome configurato |
| Accanto al documento | nella stessa cartella del documento |
| Cartella centrale dell'area | in una cartella direttamente nella radice dell'area |

La cartella centrale viene offerta solo con un'area aperta, perché altrimenti non avrebbe un punto di riferimento. Il nome della cartella vale per le due forme che ne hanno bisogno; è un nome singolo, senza segmenti di percorso.

Un nome di file già presente non viene mai sovrascritto. Il nuovo file riceve invece un contatore, per esempio `Immagine-2.png` accanto a `Immagine.png`. Gli allegati senza nome proprio, come una schermata dagli appunti, prendono il nome dal documento e dal momento.

Un documento mai salvato non offre alcuna posizione per un allegato. In quel caso compare un avviso nella barra di stato e non viene riposto nulla.

## Aprire un allegato

Un riferimento a un allegato lo apre nel programma che il sistema operativo gli assegna. Per un'immagine incorporata la via dipende dalla vista:

| Vista | Via verso il programma |
|---|---|
| «Renderizzato», anche la sua metà di «Diviso» | un clic sull'immagine apre l'[ingrandimento](images.md), lì il pulsante «Apri nel programma predefinito» |
| «Live», in lettura come in modifica | doppio clic sull'immagine |

Nella vista renderizzata il clic mostra quindi prima l'immagine in grande; chi vuole rielaborarla in un altro programma ci arriva con un clic in più. Nell'editor il clic singolo resta riservato al posizionamento del cursore; scrivere accanto a un'immagine non deve avviare un altro programma.

Un'immagine di una nota incorporata apre il file a cui rimanda la nota stessa, anche se si trova in una cartella diversa da quella del documento aperto.

Vengono aperte solo destinazioni all'interno dell'area oppure, senza area, all'interno della cartella del documento. Per i file che all'apertura possono eseguire codice compare prima una richiesta di conferma con nome e percorso completo.

## Allegati e confini dell'area

Con un'area aperta sono visibili le immagini di tutta l'area, anche al di sopra della cartella del documento. È questo che rende utilizzabile la cartella centrale degli allegati. Senza area il confine resta la cartella del documento con le sue sottocartelle; vedere anche la pagina [Immagini](images.md).
