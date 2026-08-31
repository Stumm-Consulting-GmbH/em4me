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

La création produit la chaîne de dossiers, le contenu de modèle rempli (une entrée vide sans modèle) et les propriétés de date dans le frontmatter : les journaux quotidiens reçoivent la date (`journal-date`), les périodes de plusieurs jours le début et la fin (`journal-start-date`, `journal-end-date`) ; les noms de champ sont configurables par journal et disponibles pour la requête Perspective. Les espaces réservés de date du modèle sont évalués au début de la période — `{{date}}` donne la date de la période, pas l'instant de création. L'annulation d'un dialogue de modèle interrompt la création ; aucun fichier n'est créé.

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

Dans une entrée de journal, il montre la période actuelle en grand (avec une ligne supplémentaire comme « Cette semaine » pour la période actuelle), au-dessus les périodes parentes de la même étagère (mois, trimestre, année — si un journal existe ; les lacunes sont ignorées) et des flèches vers la période précédente et suivante. Les clics ouvrent les entrées et créent celles qui manquent ; la navigation s'arrête aux limites de dates du journal. **Les deux flèches feuillettent dans le même onglet :** l'entrée précédente cède la place à la nouvelle, et l'onglet conserve son mode d'affichage, son mode d'édition, son zoom, son groupe et sa position. S'il porte des modifications non enregistrées, la même question apparaît que lors d'une fermeture ; si l'entrée voisine est déjà ouverte, son onglet est activé. Les liens vers les périodes parentes ouvrent en revanche un onglet distinct, car ils changent de niveau au lieu de feuilleter. Ici même, sur la page du manuel, le même bloc montre l'indice pour les documents hors journal :

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
