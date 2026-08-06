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

Dans une entrée de journal, il montre la période actuelle en grand (avec une ligne supplémentaire comme « Cette semaine » pour la période actuelle), au-dessus les périodes parentes de la même étagère (mois, trimestre, année — si un journal existe ; les lacunes sont ignorées) et des flèches vers la période précédente et suivante. Les clics ouvrent les entrées et créent celles qui manquent ; la navigation s'arrête aux limites de dates du journal. Ici même, sur la page du manuel, le même bloc montre l'indice pour les documents hors journal :

```perspective-journal-nav
```

Dans l'export PDF et portable, le bloc est remplacé par l'étiquette statique de la période, sans liens de création.

## Règles de semaine

Les semaines suivent strictement ISO 8601 : la semaine commence le lundi et la première semaine d'une année est celle qui contient le premier jeudi. L'année de semaine (`kkkk`) peut donc différer de l'année civile (`yyyy`) au passage de l'année — le 1er janvier 2021, par exemple, appartient à la semaine 53 de l'année de semaine 2020.
