# Graphiques de tables

Un **graphique de table** affiche les valeurs d’une [Perspective Datatable](datatable.md) sous forme de graphique en courbes, en barres, en secteurs ou en anneau. Le graphique est un **bloc de code distinct** dans le document, qui désigne sa table par son nom. Il ne contient **aucun nombre propre** : le bloc indique seulement quelle table et lesquelles de ses colonnes ou lignes sont affichées, et le graphique suit la table à chaque modification — dès la saisie, dans la source comme dans la grille, avant même l’enregistrement du document.

Le graphique se place où on le met : au-dessus de la table, en dessous ou à un tout autre endroit du document. Une table peut avoir plusieurs graphiques, par exemple deux points de vue sur les mêmes chiffres. Table et graphique sont visibles en même temps ; il n’y a pas de bascule sur la table. Les graphiques apparaissent dans la vue lecture, dans la vue partagée et en mode direct.

## Un exemple

Une table de données nommée `Ventes` et un graphique en barres qui s’y rapporte :

````markdown
```perspective-datatable
table: Ventes
columns: Mois:text, Recettes:number, Dépenses:number
aggregate: Recettes:sum, Dépenses:sum
| Janvier | 1200 | 800 |
| Février | 1350 | 900 |
| Mars | 1100 | 950 |
| Avril | 1500 | 1000 |
```

```perspective-chart
table: Ventes
type: bar
labels: Mois
values: Recettes, Dépenses
title: Recettes et dépenses
```
````

Rendus, la table et le graphique apparaissent :

```perspective-datatable
table: Ventes
columns: Mois:text, Recettes:number, Dépenses:number
aggregate: Recettes:sum, Dépenses:sum
| Janvier | 1200 | 800 |
| Février | 1350 | 900 |
| Mars | 1100 | 950 |
| Avril | 1500 | 1000 |
```

```perspective-chart
table: Ventes
type: bar
labels: Mois
values: Recettes, Dépenses
title: Recettes et dépenses
```

Chaque colonne de valeurs est une série de données, chaque mois une catégorie sur l’axe. La ligne d’agrégats avec les sommes n’en fait pas partie.

## Le nom de la table

Le nom d’une table de données figure dans la ligne `table:` de son bloc, parmi les directives d’en-tête avant les lignes de données, dans l’exemple en première ligne. Le graphique l’indique avec la même graphie dans son indication `table:`. Sont autorisés les lettres (y compris accentuées et ß), les chiffres, le trait d’union et le trait de soulignement, sans espace ni point ; majuscules et minuscules comptent, `Ventes` et `ventes` sont deux noms. Le nom est en même temps l’identifiant de la table en tant que bloc : un lien comme `[[Rapport#^Ventes]]` y mène, une incorporation l’affiche, et ses [propriétés de bloc](block-properties.md) y sont rattachées. Dans la vue rendue, à l’impression et dans le PDF, la ligne n’apparaît pas.

- Si un nom apparaît plusieurs fois, c’est la **première occurrence** dans le document qui compte.
- Un nom à l’intérieur d’un bloc de code ou dans le frontmatter ne nomme rien ; les exemples dans des blocs de code ne gênent donc pas.
- Si le nom enfreint la règle ou si la ligne figure deux fois dans le bloc, la table signale l’erreur avec son numéro de ligne ; ses valeurs restent visibles.
- Une ligne `^nom` placée juste sous la table, comme en portent des documents plus anciens, compte toujours comme son nom.
- Si le nom est renommé via le panneau [Propriétés de bloc](block-properties.md), les graphiques **du même document** suivent.

## Les indications du bloc

Le bloc `perspective-chart` porte une indication par ligne, sous la forme `clé: valeur` :

| Indication | Signification |
|---|---|
| `table:` | la table : son nom dans le même document, par exemple `Ventes`, ou `[[Fichier#^Ventes]]` pour une table d’un autre document |
| `type:` | le type : `line`, `bar`, `pie` ou `donut` |
| `series:` | d’où viennent les séries de données : `columns` (colonnes) ou `rows` (lignes) ; sans cette ligne, `columns` s’applique |
| `labels:` | la colonne des libellés |
| `values:` | les colonnes de valeurs, séparées par des virgules |
| `rows:` | les lignes, par leur entrée dans la colonne des libellés, séparées par des virgules (seulement avec `series: rows`) |
| `title:` | un titre sur le graphique ; sans cette ligne, aucun titre |

Les clés et les noms des types sont les mêmes dans toutes les langues de l’interface ; un document a donc partout le même sens. Les colonnes sont désignées par leur **identifiant**, comme dans les agrégats de la table de données, et non par un en-tête propre ; majuscules et minuscules n’y jouent aucun rôle. Si une indication figure deux fois, la première s’applique. Les lignes que le graphique ne connaît pas sont ignorées et restent inchangées.

## Les quatre types

- **Courbes** (`line`) et **barres** (`bar`) portent une ou plusieurs séries de données ; avec plusieurs séries, les barres d’une catégorie se tiennent côte à côte. Les valeurs négatives sont dessinées.
- **Secteurs** (`pie`) et **anneau** (`donut`) portent exactement une série de données ; chaque part est libellée avec le nom de sa catégorie. Avec un très grand nombre de parts, un diagramme en secteurs ou en anneau n’affiche que les libellés qui ont la place.

Les nombres de l’axe des valeurs s’écrivent comme dans la table de données, avec un point décimal et sans séparateur de milliers.

## Séries de données issues des colonnes ou des lignes

**Issues des colonnes** (`series: columns`, le cas habituel) : chaque colonne de valeurs est une série de données. Les catégories proviennent de la colonne des libellés, une entrée par ligne de la table — comme dans l’exemple ci-dessus.

**Issues des lignes** (`series: rows`) : chaque ligne désignée est une série de données et porte le nom de son entrée dans la colonne des libellés. Le graphique désigne une ligne par cette entrée, non par sa position dans la table ; l’entrée doit être écrite exactement comme la table l’affiche, majuscules et minuscules comprises. Si une entrée contient elle-même une virgule, on l’écrit `\,`. Les catégories sont les en-têtes des colonnes de valeurs ; sans indication `values:`, ce sont toutes les colonnes numériques sauf la colonne des libellés.

````markdown
```perspective-chart
table: Ventes
type: donut
series: rows
labels: Mois
rows: Avril
title: Avril
```
````

Rendu, sur la même table que ci-dessus :

```perspective-chart
table: Ventes
type: donut
series: rows
labels: Mois
rows: Avril
title: Avril
```

Pour les deux sens :

- **Les valeurs proviennent uniquement de colonnes numériques**, colonnes numériques calculées comprises, avec leurs valeurs calculées. La colonne des libellés peut être de n’importe quel type.
- Là où une série ou une catégorie est nommée d’après une colonne, elle porte l’**en-tête** que la table affiche dans sa tête de colonne.
- Séries et catégories suivent l’**ordre de la table**, non l’ordre dans lequel elles sont désignées.
- La **ligne d’agrégats** n’appartient ni aux séries de données ni aux catégories.
- C’est le contenu écrit de la table qui compte : **trier et filtrer** la table de données dans la vue ne modifient pas le graphique.

## Une table dans un autre document

Un graphique peut aussi désigner une table de données située dans un autre document, dans l’écriture d’un lien vers un bloc nommé :

```markdown
table: [[Rapport#^Ventes]]
```

On peut ainsi créer par exemple une page de synthèse avec des graphiques de tables issues de plusieurs notes. Tout ce qui vaut pour un graphique dans le même document vaut aussi pour un tel graphique. En outre :

- **L’autre document est recherché comme une incorporation** de la même cible (voir [Liens](linking.md)) : selon les mêmes règles et dans les mêmes limites de la zone. L’extension `.md` peut être omise.
- **Si l’autre document est ouvert**, le graphique affiche son état écrit, y compris les modifications non enregistrées, dès la saisie — qu’il soit ouvert dans la même fenêtre ou dans une autre. S’il n’est pas ouvert, c’est l’état enregistré qui s’applique.
- **Si le fichier est modifié de l’extérieur** et que l’application le remarque, le graphique est redessiné avec le nouvel état, sans rouvrir le document. Les incorporations de la même cible se rafraîchissent de même.
- **Si le fichier est renommé**, l’indication `table:` du graphique suit.
- **La référence est un lien** : dans les rétroliens, les liens sortants et le graphe, elle compte comme une incorporation.
- Le graphique ne fait que **lire** l’autre document ; il ne le modifie jamais.

## Quand un graphique ne peut pas être dessiné

Si une table ne convient pas pour le moment à un graphique, un avis intitulé **Le graphique ne peut pas être dessiné** et une phrase qui en nomme la raison prennent sa place. Les raisons, dans leur ordre fixe :

1. L’**autre document** désigné **est introuvable**.
2. **Le nom ne figure pas dans le document** — ou le graphique ne désigne aucune table.
3. Le nom **n’appartient pas à une table de données**, mais par exemple à un tableau ordinaire, à une Perspective Table ou à un autre bloc.
4. La table de données signale elle-même une **erreur de structure** — même si elle affiche encore des valeurs malgré ce message. Le graphique apparaît dès que l’erreur est corrigée dans la table.
5. Une **colonne** désignée **manque**, une entrée de ligne désignée ne correspond à **aucune ligne ou à plusieurs**, ou une indication nécessaire manque dans le graphique ou a une valeur inconnue.
6. Une colonne désignée comme valeurs n’est **pas une colonne numérique**.
7. Les séries de données choisies ne contiennent **aucun nombre**.
8. Le **type ne convient pas aux données** : un graphique en secteurs ou en anneau reçoit des valeurs négatives, ne contient que des zéros ou porte plus d’une série de données — ou le type manque ou est inconnu.

Si plusieurs raisons s’appliquent à la fois, l’avis nomme la première. Une fois la raison corrigée, le graphique remplace l’avis, dès la saisie. L’avis s’affiche dans la langue de l’interface et ne modifie pas le document.

### Valeurs omises

Si seules quelques cellules des séries choisies sont **vides** ou sont des **cellules en erreur** — des valeurs non conformes au type de la colonne —, le graphique est dessiné sans ces valeurs. Une ligne sous le graphique en indique le nombre, par exemple :

> 2 valeurs ont été omises, car leurs cellules sont vides ou illisibles.

Sans valeur omise, cette ligne n’apparaît pas ; quand une cellule est remplie ou corrigée, le nombre diminue. Une table en cours de remplissage apparaît ainsi comme graphique dès son premier nombre. Courbes et barres composées uniquement de zéros sont dessinées, car les zéros sont des nombres.

## Couleurs

Les séries de données portent les couleurs du [jeu de couleurs](color-schemes.md) actif : dans le groupe **Graphiques**, chaque jeu de couleurs compte dix couleurs, **Série de données 1** à **Série de données 10**. La première série porte la première couleur, la deuxième la deuxième, et ainsi de suite ; pour les secteurs et l’anneau, cela vaut pour chaque part. À partir de la onzième série, les couleurs recommencent à la première.

Si l’on modifie l’une de ces couleurs, change de jeu de couleurs ou passe du clair au sombre, le graphique suit aussitôt. Libellés et axes prennent les couleurs de texte du jeu de couleurs.

## Impression, PDF et export portable

**L’impression et l’export PDF** (voir [Outils](tools.md)) affichent le graphique lorsqu’ils sortent de la vue lecture, de la vue partagée ou du mode direct. Le graphique y est dessiné en **clair**, avec les couleurs de graphique du jeu de couleurs clair, même si l’application fonctionne en sombre ; ensuite l’application affiche de nouveau ses propres couleurs. Un graphique qui ne peut pas être dessiné apparaît avec son avis, comme à l’écran, et à un saut de page un graphique reste si possible groupé avec son avis et sa ligne de valeurs omises. Si la table se trouve dans un autre document, la sortie attend qu’elle ait été lue ; si cela n’aboutit pas à temps, l’avis « La table n’a pas pu être lue à temps. » prend la place du graphique. Depuis la vue source, l’impression et l’export PDF produisent le Markdown brut.

L’**export portable** écrit le graphique dans le fichier sous forme d’**image**, dessinée en clair, afin qu’un destinataire le voie sans cette application. La table reste une table dans l’export ; l’image prend uniquement la place du bloc du graphique. Si des valeurs ont dû être omises, la même ligne qu’à l’écran figure sous l’image. Un graphique qui ne peut pas être dessiné reste un bloc inchangé. L’image est incorporée dans le fichier ; la visionneuse du destinataire doit pouvoir afficher de telles images, comme pour les diagrammes Mermaid de la page [Mathématiques et diagrammes](math-diagrams.md).

Partout, la sortie contient les valeurs que le graphique affiche au moment de la sortie, y compris celles non enregistrées et celles d’un autre document. L’impression et l’export ne modifient pas le document.

## Insérer et modifier un graphique

Il n’est pas nécessaire d’écrire un graphique à la main. Deux commandes avec une boîte de dialogue commune l’insèrent à partir d’une table de données et le modifient ensuite, sans qu’il faille connaître les indications du bloc, le nom de la table ni les identifiants de ses colonnes : **Insérer un graphique pour cette table** et **Modifier le graphique**.

### Insérer

**Insérer un graphique pour cette table** se trouve à quatre endroits :

- dans le **menu contextuel de la table de données** : clic droit sur la grille en mode direct ou dans la moitié rendue de la vue partagée, sur une cellule, un en-tête de colonne ou la marge autour de la grille. La table reste affichée en grille, et le menu ne porte que cette seule entrée.
- dans le [menu contextuel de l’éditeur](context-menu.md), lorsque le curseur se trouve dans une table de données, par exemple après un clic droit dans sa source ;
- dans le menu **Affichage → Graphique** ;
- dans la **palette de commandes** (`Ctrl+K` par défaut).

La commande n’est disponible que si le document peut être modifié et que la table de données sur laquelle elle agit est établie : le curseur se trouve dans une table de données, ou la table a été cliquée — parce qu’on travaille dans l’une de ses cellules ou parce que le clic droit l’a atteinte. Tant qu’une cellule de la table de données est en cours de modification, la commande est donc aussi disponible dans le menu et dans la palette de commandes. Un tableau Markdown ordinaire ou une Perspective Table ne compte pas comme table de données. Un clic droit dans une saisie de cellule ouverte n’affiche aucun menu ; la saisie reste ouverte.

La commande ouvre la boîte de dialogue décrite plus bas. Après confirmation :

- **Le nom de la table.** Si la table n’a pas encore de nom, elle reçoit en première ligne de son bloc `table: tabelle-1`, avec le plus petit nombre encore libre dans le document : si `tabelle-1` est déjà pris, ce sera `tabelle-2`, et ainsi de suite. Rien n’est écrit sous la table. Si elle porte déjà un nom, elle reste inchangée, et le graphique indique ce nom.
- **L’emplacement.** Le bloc du graphique se place juste sous la table ; un graphique qui s’y trouve déjà descend d’un cran. Un autre graphique pour la même table indique le même nom.
- **L’affichage.** La table et le nouveau graphique apparaissent aussitôt dessinés ; en mode direct, le nouveau graphique est ensuite sélectionné.
- **Annuler.** Une seule étape d’annulation (`Ctrl+Z`) retire ensemble le graphique et un nom attribué au passage.

Annuler la boîte de dialogue ne change rien : ni graphique ni nom ne sont créés.

### La boîte de dialogue

La boîte de dialogue porte le titre de la commande, **Insérer un graphique pour cette table** à l’insertion, **Modifier le graphique** à la modification ; à la modification, elle nomme en dessous la table, par exemple **Table : Ventes**. Elle ne propose que ce que la table fournit, de sorte qu’aucune indication invalide ne peut apparaître. Les champs, de haut en bas :

| Champ | Ce qu’il propose |
|---|---|
| **Type de graphique** | Courbes, Barres, Secteurs ou Anneau |
| **Séries de données issues des** | Colonnes ou Lignes ; une direction qui ne laisserait aucune série de données n’est pas disponible |
| **Colonne des libellés** | chaque colonne de la table, avec son en-tête ; une colonne à côté de laquelle il ne resterait aucune série de données n’est pas disponible |
| **Séries de données (colonnes de valeurs)** | pour des séries issues des colonnes : les colonnes numériques sauf la colonne des libellés, colonnes calculées comprises et marquées « calculée » |
| **Séries de données (lignes)** | pour des séries issues des lignes : les lignes, chacune avec son entrée dans la colonne des libellés |
| **Titre (facultatif)** | un texte libre ; s’il reste vide, aucun titre n’apparaît |

En dessous se trouvent les boutons **Annuler** et **Insérer** ou **Appliquer**. En outre :

- Avec **Courbes** et **Barres**, plusieurs séries de données peuvent être cochées ; une reste toujours cochée. Avec **Secteurs** et **Anneau**, il faut en choisir exactement une, et la boîte de dialogue le dit : « Un graphique en secteurs ou en anneau affiche exactement une série de données. »
- Les lignes dont l’entrée dans la colonne des libellés est vide ou n’est pas univoque ne peuvent pas être choisies ; une phrase sous la liste en donne le nombre.
- À l’insertion, la boîte de dialogue est préremplie avec : Barres, séries issues des colonnes, comme libellés la première colonne qui n’est pas numérique (sinon la première disponible), et toutes les colonnes numériques disponibles.
- **Sans souris :** à l’ouverture, le focus est sur le type de graphique ; la tabulation parcourt les champs et reste dans la boîte de dialogue. `Entrée` confirme depuis un champ, `Échap` annule, de même qu’un clic à côté de la boîte de dialogue.
- Une seule boîte de dialogue est ouverte à la fois. Un nouvel appel de l’une des deux commandes, par exemple depuis la palette de commandes, ramène au premier plan la boîte de dialogue ouverte.

### Modifier

**Modifier le graphique** agit sur le graphique sélectionné. Un graphique est sélectionné lorsque le curseur se trouve dans son bloc, et en mode direct aussi lorsqu’il a été cliqué : un clic le met en évidence, il reste dessiné, et le curseur reste où il était. `Échap` ou un clic dans le texte à côté annule la sélection. La source du bloc reste accessible avec les touches fléchées.

La commande se trouve aux mêmes quatre endroits :

- dans le **menu contextuel du graphique** : clic droit sur le graphique dessiné en mode direct ou dans la moitié rendue de la vue partagée. Le graphique reste dessiné, et le menu ne porte que cette seule entrée.
- dans le [menu contextuel de l’éditeur](context-menu.md), lorsque le curseur se trouve dans le bloc du graphique ;
- dans le menu **Affichage → Graphique** ;
- dans la **palette de commandes**.

Elle n’est disponible que si un graphique est sélectionné et que le document peut être modifié. Elle ouvre la même boîte de dialogue que l’insertion, préremplie avec les indications du bloc ; elle propose les colonnes et les lignes de la table que le graphique désigne. Après confirmation, le bloc porte les indications modifiées, et le graphique apparaît aussitôt avec elles. Dans ce cas :

- Le nom que le graphique indique et la table elle-même restent inchangés ; seul le bloc du graphique est écrit.
- Les indications du bloc que la boîte de dialogue ne connaît pas sont conservées.
- Confirmer sans modification n’écrit rien, annuler ne change rien.
- Une seule étape d’annulation retire la modification.

**Une table dans un autre document.** Un graphique avec l’indication `table: [[Fichier#^nom]]` se modifie de la même façon. La boîte de dialogue lit les colonnes et les lignes dans l’autre document et le nomme sous le titre, par exemple **Table : Ventes dans le document « Rapport »**. Seul le bloc de son propre document est écrit ; l’autre document reste inchangé. Un tel graphique ne peut pas être inséré par la commande, car elle agit toujours sur la table à partir de laquelle elle est appelée ; un graphique pour une table d’un autre document se crée en l’écrivant (voir « Une table dans un autre document » plus haut).

### Quand un message apparaît à la place de la boîte de dialogue

Si aucun graphique ne peut être créé pour la table, aucune boîte de dialogue ne s’ouvre ; un message dans la barre d’état en donne la raison, par exemple « Impossible d’insérer un graphique pour cette table. La table n’a aucune colonne numérique. » C’est le cas :

- à l’insertion comme à la modification, si la table n’a **aucune colonne numérique**, si aucune de ses colonnes et lignes ne donne une série de données ou si elle signale une **erreur dans sa structure**, et si le bloc de la table ou du graphique n’est pas fermé ;
- à la modification en outre, si la table que le graphique désigne est **introuvable** — le nom n’apparaît pas, ou l’autre document manque — ou si le nom **n’appartient pas à une table de données**. Si l’autre document est encore en cours d’indexation, le message invite à réessayer dans un instant.

Si la table ou le graphique sont modifiés pendant que la boîte de dialogue est ouverte, la confirmation n’écrit rien, et un message le signale ; de même si le mode modification a été désactivé entre-temps ou si un autre document a pris la place du document.

### Où les commandes ne sont pas disponibles

- Dans la **vue lecture**, le document ne peut pas être modifié : un clic droit sur une table de données ou un graphique n’affiche aucun menu, et aucune des deux commandes n’est disponible.
- Si le **mode modification est désactivé** (Affichage → Modifier), il en va de même en mode direct et dans la vue partagée ; un clic ne sélectionne alors pas non plus de graphique.
- Une table de données ou un graphique dans une incorporation, dans la sortie d’un bloc de script ou sur une carte d’un canevas ne propose aucune de ces entrées au clic droit.

### Au clavier

En mode direct, la grille de la table de données n’est pas accessible au clavier. Le chemin sans souris passe par le curseur : avec les touches fléchées dans le bloc de la table ou du graphique, qui affiche alors sa source, puis la commande depuis la palette de commandes ou le menu **Affichage → Graphique**. Dans la moitié rendue de la vue partagée, la tabulation atteint les cellules de la table de données ; une cellule qui a le focus compte comme une cellule cliquée. La boîte de dialogue elle-même s’utilise entièrement sans souris.

## L’extension « Graphique d’une table de données »

Les graphiques font partie des [extensions internes](extensions.md) et sont activés dans le mode de travail **Complet**. Si l’extension est désactivée, le bloc apparaît comme un bloc de code ordinaire, y compris à l’impression, en PDF et dans l’export portable ; le document reste inchangé, et après la réactivation le graphique réapparaît. Les deux commandes n’existent alors pas, ni dans le menu, ni dans la palette de commandes, ni dans un menu contextuel.

Les graphiques reposent sur l’extension **Perspective Datatable** : tant qu’ils sont activés, la table de données ne peut pas être désactivée. Si la table de données est désactivée, les graphiques le sont aussi.

## Limites

- **La seule source est la table de données.** Un tableau Markdown ordinaire, une Perspective Table, les résultats d’une requête et les enregistrements de la base de données ne sont pas une source de graphique.
- **On modifie la table, pas le graphique.** Le graphique est une image ; on ne peut ni y modifier des valeurs ni les afficher au survol. Seules ses indications se modifient, avec « Modifier le graphique » ou dans la source.
- **Aucun calcul propre.** Le graphique ne forme ni sommes ni moyennes sur les séries ; pour les afficher, on les calcule dans une colonne calculée de la table.
- **Quatre types.** Les graphiques en aires, les barres empilées et d’autres types n’existent pas.
- **Les couleurs appartiennent au jeu de couleurs**, non au graphique individuel.
- **Les modifications extérieures d’un autre document** ne sont remarquées que si l’application surveille le fichier : si le document se trouve dans une zone, toute la racine de la zone, sinon le dossier du document jusqu’à deux niveaux de profondeur — et seulement après que l’application a lu entièrement ce dossier une première fois.
- **Un autre document dans une zone liée** (écrit `[[@zt:Fichier#^nom]]`) n’est pas trouvé ; l’avis du document introuvable prend la place du graphique, de même qu’une incorporation de la même cible n’apparaît pas.
- **Renommer le nom d’une table** ne met à jour que les graphiques du même document. Les graphiques d’autres documents ne suivent pas, pas plus qu’une indication qui désigne son propre document sous la forme `[[Fichier#^nom]]`.
- **Une table de données dans une citation** ou dans une liste plus profondément indentée ne porte aucun nom que le graphique, un lien ou une incorporation trouvent.
