---
title: Library
tags: [demo, data]
topic: data
db-table:
  name: Library
  fields:
    - name: title
      type: string
      label: Title
      required: true
    - name: author
      type: string
      label: Author
    - name: pages
      type: number
      label: Pages
      options:
        decimals: 0
    - name: acquired
      type: date
      label: Acquired
    - name: onLoan
      type: boolean
      label: On loan
  key: title
  display: title
  lastId: 24
---

# Library

This file is a **database table**. Its columns are declared in the frontmatter above, its records live in the block below, and the two together make the table complete in a single file.

Unlike the tables on [[03 Tables]], this one is not something you edit here. A table file is technical storage: it stays readable by hand, but in regular use you would work through masks and queries. Switch to source view to see what the block really looks like — and note that there is no header row, because the cells simply follow the order of the fields.

```perspective-records
|- id="r-00001"
| The Name of the Rose
| Umberto Eco
| 640
| 2019-03-14
| x
|- id="r-00002"
| Foucault's Pendulum
| Umberto Eco
| 880
| 2019-03-14
|
|- id="r-00003"
| Solaris
| Stanisław Lem
| 224
| 2019-08-02
|
|- id="r-00004"
| The Cyberiad
| Stanisław Lem
| 295
| 2020-01-19
| x
|- id="r-00005"
| A Wizard of Earthsea
| Ursula K. Le Guin
| 183
| 2020-02-08
|
|- id="r-00006"
| The Dispossessed
| Ursula K. Le Guin
| 341
| 2020-02-08
|
|- id="r-00007"
| Invisible Cities
| Italo Calvino
| 165
| 2020-05-23
|
|- id="r-00008"
| If on a Winter's Night a Traveler
| Italo Calvino
| 260
| 2020-05-23
| x
|- id="r-00009"
| The Left Hand of Darkness
| Ursula K. Le Guin
| 304
| 2020-09-11
|
|- id="r-00010"
| Labyrinths
| Jorge Luis Borges
| 288
| 2021-01-30
|
|- id="r-00011"
| The Book of Sand
| Jorge Luis Borges
| 128
| 2021-01-30
|
|- id="r-00012"
| Hard-Boiled Wonderland
| Haruki Murakami
| 400
| 2021-04-17
|
|- id="r-00013"
| The Master and Margarita
| Mikhail Bulgakov
| 412
| 2021-07-05
| x
|- id="r-00014"
| One Hundred Years of Solitude
| Gabriel García Márquez
| 417
| 2021-11-28
|
|- id="r-00015"
| The Third Policeman
| Flann O'Brien
| 200
| 2022-02-14
|
|- id="r-00016"
| Gödel, Escher, Bach
| Douglas Hofstadter
| 777
| 2022-06-01
|
|- id="r-00017"
| The Glass Bead Game
| Hermann Hesse
| 558
| 2022-09-19
|
|- id="r-00018"
| Steppenwolf
| Hermann Hesse
| 237
| 2022-09-19
|
|- id="r-00019"
| The Man Without Qualities
| Robert Musil
| 1130
| 2023-01-08
| x
|- id="r-00020"
| Austerlitz
| W. G. Sebald
| 298
| 2023-04-22
|
|- id="r-00021"
| The Rings of Saturn
| W. G. Sebald
| 296
| 2023-04-22
|
|- id="r-00022"
| Piranesi
| Susanna Clarke
| 245
| 2023-10-03
|
|- id="r-00023"
| The Employees
| Olga Ravn
| 136
| 2024-02-16
|
|- id="r-00024"
| Klara and the Sun
| Kazuo Ishiguro
| 303
| 2024-05-30
|
```

## See also

- [[03 Tables]] — the three kinds of table that live *inside* a document
- [[05 Properties and Profiles]] — the definition format the columns above are built on
