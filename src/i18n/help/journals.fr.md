# Journaux

Les journaux sont des séries de documents périodiques dans une zone : chaque journal a une **granularité** (jour, semaine, mois, trimestre ou année), un **schéma de dossier** et un **schéma de nom** à base d'espaces réservés de date, un modèle facultatif et des propriétés de date automatiques dans le frontmatter. Les **étagères** regroupent plusieurs journaux, par exemple du jour à l'année d'un carnet. Les entrées sont ouvertes ou créées au premier accès — via les commandes, le panneau calendrier ou le bloc de navigation.

Les journaux n'existent que dans une zone : la configuration se trouve dans le fichier de zone, tous les chemins sont relatifs à la racine de la zone. Sans zone, les commandes et le panneau affichent un indice. La fonctionnalité est commutable comme extension « Journaux » (Paramètres → Extensions).

## Définir journaux et étagères

Paramètres → Journaux montre les étagères de la zone ; « Ouvrir » sur une étagère mène à ses journaux, « Fermer l'étagère » ramène à la vue d'ensemble (la ligne « Sans étagère » regroupe les journaux non affectés). Par journal :

- **Nom** et, facultativement, une **étagère**.
- **Granularité** : jour, semaine, mois, trimestre ou année.
- **Schéma de dossier** et **schéma de nom** : littéraux plus les espaces réservés de date des modèles (`{{date::…}}`), évalués au début de la période. Un aperçu en direct montre le chemin d'exemple de la période actuelle.
- **Modèle** (facultatif) du dossier de modèles ; la création exécute l'évaluation complète des espaces réservés, dialogues compris.
- **Date de début/fin** (facultatif) : aucune entrée n'est créée avant ou après, la navigation s'y arrête.
- **Noms de champ** des propriétés de date automatiques.

Exemple d'un journal hebdomadaire avec sous-dossiers annuels :

| Champ | Valeur |
| --- | --- |
| Granularité | Semaine |
| Schéma de dossier | `Journal/{{date::yyyy}}` |
| Schéma de nom | `{{date::kkkk-KWww}}` |

L'entrée de la semaine 28 de 2026 se trouve alors sous `Journal/2026/2026-KW28.md`. Deux jetons de format supplémentaires existent pour les semaines : `ww` (semaine ISO, deux chiffres) et `kkkk` (année de semaine, qui peut différer de l'année civile au passage de l'année) ; les majuscules comme `KW` restent littérales. Pour les trimestres, le jeton `q` fournit le numéro du trimestre (1–4), par exemple `{{date::yyyy-Qq}}` → `2026-Q3`.

Un schéma modifié ne renomme pas les fichiers existants ; les points du calendrier et la détection des entrées suivent le nouveau schéma. Les fichiers périodiques existants correspondent automatiquement si les schémas de dossier et de nom sont configurés à l'identique.

## Ouvrir et créer des entrées

- **Entrée de journal du jour** (menu Fichier → Autres fonctions de fichier) : ouvre ou crée l'entrée du jour d'un journal quotidien ; avec sélection s'il existe plusieurs journaux quotidiens.
- **Entrée de journal pour une date…** (menu Fichier → Autres fonctions de fichier) : demande une date (AAAA-MM-JJ) et le journal ; la période est celle de la date dans la granularité du journal.
- **Reporter les tâches ouvertes dans l’entrée de journal actuelle** (menu Fichier → Autres fonctions de fichier) : ouvre ou crée l’entrée de la période en cours et y reporte les tâches ouvertes de la dernière entrée ; voir la section « Reporter les tâches ouvertes ».

La création produit la chaîne de dossiers, le contenu de modèle rempli (une entrée vide sans modèle) et les propriétés de journal dans le frontmatter. Une entrée porte **quatre** propriétés, quelle que soit sa granularité : le nom du journal (`journal`), la date de la période (`journal-date`), le début (`journal-start-date`) et la fin (`journal-end-date`). La date de la période est toujours son **début** ; pour les entrées quotidiennes, les trois dates coïncident donc. Les noms de champ sont configurables par journal et disponibles pour la requête Perspective — comme chaque entrée porte le même jeu, une requête n’a pas à distinguer selon la granularité. Les espaces réservés de date du modèle sont évalués au début de la période — `{{date}}` donne la date de la période, pas l’instant de création. L’annulation d’un dialogue de modèle interrompt la création ; aucun fichier n’est créé.

Une entrée **déjà existante** est complétée lorsque des propriétés manquent — par exemple parce qu’elle provient d’une autre application ou a été créée à la main. Cela se fait de deux manières. À l’**ouverture** via commande, calendrier ou bloc de navigation, les propriétés manquantes sont ajoutées en silence ; si l’entrée est déjà complète, le fichier reste intact. La commande **Compléter les propriétés du journal…** applique le même état à toutes les entrées existantes d’un journal en une fois ; elle indique au préalable le nombre d’entrées vérifiées et demande confirmation.

Créer et compléter se comportent volontairement différemment : à la **création**, l’application définit les propriétés et remplace les champs de même nom du modèle. Lors de la **complétion**, seul ce qui manque est ajouté ; une valeur existante demeure, même si elle diffère de la période — elle peut être une correction délibérée. Les champs étrangers et le reste du contenu restent intacts dans les deux cas, et un frontmatter endommagé n’est pas touché.

## Reporter les tâches ouvertes

L’application reporte les tâches ouvertes de la dernière entrée existante d’un journal dans l’entrée de la période en cours : pour un journal quotidien dans celle du jour, pour un journal hebdomadaire dans celle de la semaine en cours. Cela vaut pour les journaux de toute granularité, même si la dernière entrée remonte à plusieurs jours. La source est toujours l’entrée antérieure la plus récente du même journal ; les entrées futures ne comptent pas.

**Paramètres.** Dans l’éditeur d’un journal sous Paramètres → Journaux, le groupe « Reporter les tâches ouvertes » réunit trois paramètres :

- **Reporter automatiquement à la création de l’entrée** (désactivé par défaut) : si l’interrupteur est activé, le report a lieu dès que l’entrée de la période en cours est créée, quel que soit le chemin : par les commandes, le panneau calendrier, le bloc de navigation ou de frise, ou la date d’une carte d’un tableau Kanban. La simple ouverture d’une entrée existante et la création d’une entrée pour une autre période ne déclenchent rien.
- **Dans l’entrée précédente** : « marquer comme reportée » (par défaut) donne à la tâche reportée le statut « Reporté » (`- [»] …`, page [Listes de tâches](tasks.md)) ; « supprimer » l’y efface.
- **Uniquement depuis la section** (vide par défaut) : le texte d’un titre. Si le champ est rempli, seules les tâches sous ce titre et ses sous-titres sont reportées ; s’il est vide, toutes les tâches ouvertes de l’entrée.

**Commande manuelle.** **Reporter les tâches ouvertes dans l’entrée de journal actuelle** (menu Fichier → Autres fonctions de fichier, aussi dans la palette de commandes) reporte à tout moment dans l’entrée de la période en cours, même si l’interrupteur est désactivé, et aussi dans une entrée qui existe déjà ; si l’entrée manque, elle est créée. S’il y a plusieurs journaux, la commande demande lequel est visé. Un second lancement ne reporte rien en double, car les tâches reportées sont marquées ou supprimées dans l’entrée précédente.

**Où arrivent les tâches.** Chaque tâche arrive dans la nouvelle entrée sous le titre sous lequel elle se trouvait dans l’ancienne, à la fin de cette section. De même nom signifie même texte, sans tenir compte des majuscules et minuscules ni du niveau du titre ; si le titre figure plusieurs fois dans la nouvelle entrée, le premier vaut. S’il y manque, il est créé avec les tâches à la fin de l’entrée. Les tâches qui se trouvaient avant le premier titre de l’ancienne entrée vont à la fin de la nouvelle. L’ordre est conservé.

**Sous-éléments.** Une tâche part avec tout ce qui est en retrait directement sous elle, jusqu’à la prochaine ligne vide : sous-tâches ouvertes et terminées, leurs sous-éléments et lignes de note. Ce qui continue en retrait après une ligne vide n’en fait plus partie et reste dans l’ancienne entrée. Avec « marquer comme reportée », chaque ligne de tâche du bloc déplacé est marquée dans l’ancienne entrée, y compris une sous-tâche terminée ; avec « supprimer », tout le bloc disparaît. Une tâche ouverte sous une tâche terminée ou annulée, sans tâche ouverte au-dessus, part seule et se retrouve sans retrait dans la nouvelle entrée.

**Ce qui compte comme ouvert.** Les tâches dont le statut est de type Ouvert, En cours ou En attente (page [Listes de tâches](tasks.md), section « Statuts personnalisés, type et symbole suivant ») ; une case portant un caractère pour lequel aucun statut n’est configuré compte aussi comme ouverte. Les tâches terminées et annulées et les lignes de type Pas une tâche restent en place. Une ligne marquée « Reporté » n’est jamais reportée à nouveau, même si ce statut est désactivé. Les cases dans les blocs de code, les citations et les tableaux ne sont pas des tâches et restent en place. Un Filtre global défini s’applique ici aussi.

Exemple avec « marquer comme reportée ». L’ancienne entrée avant :

```markdown
## Travail
- [ ] Rédiger le devis
  - [x] Récupérer les chiffres
  - [ ] Rédiger le texte
- [x] Vérifier la facture

## Personnel
- [ ] Porter le vélo au garage
```

La nouvelle entrée, créée à partir du modèle :

```markdown
## Travail

## Personnel
```

La nouvelle entrée après le report :

```markdown
## Travail

- [ ] Rédiger le devis
  - [x] Récupérer les chiffres
  - [ ] Rédiger le texte

## Personnel

- [ ] Porter le vélo au garage
```

L’ancienne entrée après le report :

```markdown
## Travail
- [»] Rédiger le devis
  - [»] Récupérer les chiffres
  - [»] Rédiger le texte
- [x] Vérifier la facture

## Personnel
- [»] Porter le vélo au garage
```

Avec « supprimer », il ne resterait ensuite dans l’ancienne entrée que les deux titres et « Vérifier la facture ».

**Règles de détail.**

- **Modifications non enregistrées :** si l’ancienne ou la nouvelle entrée a des modifications non enregistrées dans une fenêtre quelconque, rien n’est reporté, et la barre d’état nomme l’entrée. Lors du report automatique, la nouvelle entrée est alors créée sans les tâches ; après l’enregistrement, la commande manuelle rattrape le report.
- **Fonctions désactivées :** si l’extension « Tâches » est désactivée, rien n’est reporté, car rien ne compte alors comme tâche ; la commande l’indique dans la barre d’état. Si l’extension « Journaux » est désactivée, la commande et les paramètres disparaissent, et rien n’est reporté.
- **Seulement la dernière entrée :** la source est exactement l’entrée antérieure la plus récente. Ce qui est resté ouvert dans des entrées plus anciennes y reste.
- **Tâche déjà présente :** si le modèle apporte une tâche chaque jour et que la même tâche est encore ouverte dans l’ancienne entrée, elle n’arrive pas une seconde fois dans la nouvelle ; dans l’ancienne, elle est tout de même marquée ou supprimée. Cela ne vaut que si la ligne est identique caractère pour caractère, se trouve sous le même titre et n’a rien sous elle dans l’ancienne entrée. Si elle y a reçu des sous-éléments, elle part avec eux et figure alors deux fois dans la nouvelle entrée.
- **Section introuvable :** si « Uniquement depuis la section » nomme un titre que l’ancienne entrée n’a pas, rien n’est reporté, et la barre d’état l’indique, y compris lors du report automatique.
- **Messages :** après un report, la barre d’état indique le nombre de tâches et l’entrée d’où elles viennent. L’absence d’entrée antérieure ou de tâche ouverte n’est signalée que par la commande manuelle.
- **Listes numérotées et titres vides :** une tâche issue d’une liste numérotée garde son numéro ; rien n’est renuméroté. Si un titre sans contenu reste dans l’ancienne entrée après « supprimer », il reste en place.
- **Limites :** au plus 500 tâches par report, des entrées jusqu’à 5 Mo et au plus 20 000 fichiers Markdown dans les dossiers du journal ; au-delà, rien n’est reporté, et la barre d’état l’indique.
- **Retour en arrière :** il n’existe pas de commande d’annulation propre. Les deux entrées reçoivent une entrée dans leur [Historique du document](history.md), là où il est activé pour le document ; avec « marquer comme reportée », un clic sur la case rouvre la tâche dans l’ancienne entrée.
- **Pas de lien :** la ligne marquée dans l’ancienne entrée ne reçoit pas de lien vers la nouvelle entrée.

## Panneau calendrier

Le panneau calendrier (symbole calendrier de la barre d'état) montre la vue mensuelle de la zone :

- En-tête des jours avec **début le lundi**, à gauche la **colonne des semaines ISO**.
- Des **points** marquent les jours ayant une entrée quotidienne ; **aujourd'hui** est mis en évidence.
- Un clic sur un **jour** ouvre ou crée l'entrée quotidienne, un clic sur la **cellule de semaine** l'entrée hebdomadaire ; avec plusieurs journaux correspondants, une sélection apparaît.
- Le filtre d'en-tête restreint à **tous les journaux**, une **étagère** ou un **seul journal** ; les flèches feuillettent les mois, le bouton Aujourd'hui revient au mois actuel.

## Bloc de navigation

Le bloc de navigation se place dans l'entrée comme bloc de code, typiquement via le modèle du journal :

````markdown
```perspective-journal-nav
```
````

Dans une entrée de journal, il montre la période actuelle en grand (en dessous, la situation temporelle : « Aujourd’hui » ou « Cette semaine » pour la période en cours, sinon son écart — « hier », « il y a 3 semaines », « dans 2 ans », toujours dans l’unité de la période), au-dessus les périodes parentes de la même étagère (mois, trimestre, année — si un journal existe ; les lacunes sont ignorées) et des flèches vers la période précédente et suivante. Les clics ouvrent les entrées et créent celles qui manquent ; la navigation s'arrête aux limites de dates du journal. **Les deux flèches feuillettent dans le même onglet :** l'entrée précédente cède la place à la nouvelle, et l'onglet conserve son mode d'affichage, son mode d'édition, son zoom, son groupe et sa position. S'il porte des modifications non enregistrées, la même question apparaît que lors d'une fermeture ; si l'entrée voisine est déjà ouverte, son onglet est activé. Les liens vers les périodes parentes ouvrent en revanche un onglet distinct, car ils changent de niveau au lieu de feuilleter. **Le nom de la période cible accompagne chaque flèche**, afin que sa destination soit visible ; si le bloc devient étroit, ce nom cède la place et le bouton demeure. **Un point sous une période signifie : cette entrée existe déjà** — le même repère que dans le panneau calendrier et la frise. Il figure sur toutes les périodes du bloc, y compris les périodes parentes et les deux voisines ; là où il manque, le clic crée l’entrée. Ici même, sur la page du manuel, le même bloc montre l'indice pour les documents hors journal :

```perspective-journal-nav
```

Les deux blocs de journal, celui-ci et la chronologie plus bas, vérifient en outre qu'ils se rapportent à l'entrée affichée. Si ce n'est pas le cas, ou si l'entrée n'existe plus, un message d'erreur remplace l'affichage : une période erronée ne serait pas reconnaissable comme telle et elle est donc supprimée.

Dans l'export PDF et portable, le bloc est remplacé par l'étiquette statique de la période, sans liens de création.

## Bloc de frise

Le bloc de frise affiche l'aperçu des périodes sous forme de calendrier dans l'entrée. Il connaît quatre modes :

````markdown
```perspective-journal-timeline
mode: month
```
````

| Mode | Affichage |
|---|---|
| `week` | la semaine de l'entrée sur une seule ligne |
| `month` | un calendrier mensuel |
| `quarter` | trois calendriers mensuels côte à côte |
| `year` | douze calendriers mensuels en grille annuelle |

`calendar` est l'écriture équivalente de `year` (elle provient de contenus repris). Sans indication `mode`, c'est `month` qui s'applique. Une valeur inconnue apparaît comme remarque dans le bloc, afin qu'une faute de frappe ne passe pas inaperçue.

**Structure.** La colonne des numéros de semaine est à gauche, l'en-tête des jours en haut, à partir du lundi. Les jours ayant déjà une entrée portent un point, le jour courant est mis en évidence. La ligne d'en-tête indique les périodes au-dessus du niveau du calendrier, et le niveau du mode y est mis en évidence : le mode semaine met en évidence la semaine, le mode mois le mois, le mode trimestre le trimestre, le mode année l'année.

**Clic.** Chaque élément ouvre sa période : le jour ouvre l'entrée quotidienne, la semaine l'entrée hebdomadaire, le nom du mois et les étiquettes d'en-tête leur période respective. Les entrées manquantes sont créées au passage. Ce sont les journaux de l'étagère à laquelle appartient l'entrée qui font foi ; là où cette étagère n'a pas de journal pour un niveau, l'étiquette est purement informative. Hors des limites de dates d'un journal, aucune entrée n'est créée.

La période affichée par le bloc suit l'entrée dans laquelle il se trouve, et non le jour courant : dans la note hebdomadaire d'une semaine passée, `month` affiche le mois de cette semaine.

Comme le bloc de navigation, ce bloc apparaît sous forme de remarque hors d'une entrée de journal :

```perspective-journal-timeline
mode: week
```

L'export PDF imprime le calendrier tel qu'il apparaît à l'écran. L'export portable le transforme en un tableau par mois, avec un point sur les jours ayant une entrée et sans liens de création.

## Règles de semaine

Les semaines suivent strictement ISO 8601 : la semaine commence le lundi et la première semaine d'une année est celle qui contient le premier jeudi. L'année de semaine (`kkkk`) peut donc différer de l'année civile (`yyyy`) au passage de l'année — le 1er janvier 2021, par exemple, appartient à la semaine 53 de l'année de semaine 2020.
