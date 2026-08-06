# Perspective Table

Perspective Table est une extension du standard Markdown propre à ce viewer. Elle permet **des tableaux avec des cellules-bloc multi-lignes** : listes imbriquées, plusieurs paragraphes, blocs de code et images dans une même cellule. Les tableaux Markdown standard (syntaxe pipe) sont basés sur la ligne et ne le permettent pas.

La syntaxe est une notation propre, basée sur les lignes. Elle est intégrée comme bloc de code clôturé avec l'étiquette de langue `perspective-table`. Dans les autres applications Markdown, le bloc reste visible comme bloc de code lisible — dégradation gracieuse plutôt que source cassée.

## Syntaxe de base

| Symbole | Signification                                          |
|---------|--------------------------------------------------------|
| `{\|`   | Début du tableau (première ligne dans le bloc de code) |
| `\|+`   | Légende optionnelle                                    |
| `\|-`   | Séparateur entre lignes du tableau                     |
| `!`     | Cellule d'en-tête                                      |
| `\|`    | Cellule de données                                     |
| `\|}`   | Fin du tableau                                         |

Une cellule commence en début de ligne source avec `|` ou `!`. Les lignes suivantes sans marqueur appartiennent à la cellule en cours. Cela produit des cellules multi-lignes sans balisage par ligne.

## Exemple minimal

Source :

````markdown
```perspective-table
{|
|+ Trois variantes comparées
|-
! Variante
! Prix
|-
| Base
| 10 EUR
|-
| Premium
| 50 EUR
|}
```
````

Résultat :

```perspective-table
{|
|+ Trois variantes comparées
|-
! Variante
! Prix
|-
| Base
| 10 EUR
|-
| Premium
| 50 EUR
|}
```

## Exemple étendu avec listes et bloc de code

Une cellule contient une liste imbriquée, une autre un bloc de code. La clôture extérieure utilise **quatre apostrophes inverses** pour que le bloc de code intérieur à trois apostrophes inverses reste valide.

Source :

`````markdown
````perspective-table
{|
|-
! Phase
! Tâches
|-
| Conception
| Collecte des exigences :

- Clarifier la structure principale
  - Champs obligatoires
  - Champs facultatifs
- Esquisse de la maquette
- Revue avec les parties prenantes
|-
| Réalisation
| Squelette du code :

```bash
mkdir src
npm init -y
```
|}
````
`````

Résultat :

````perspective-table
{|
|-
! Phase
! Tâches
|-
| Conception
| Collecte des exigences :

- Clarifier la structure principale
  - Champs obligatoires
  - Champs facultatifs
- Esquisse de la maquette
- Revue avec les parties prenantes
|-
| Réalisation
| Squelette du code :

```bash
mkdir src
npm init -y
```
|}
````

## Spans et alignement

Les cellules peuvent porter des attributs pour s'étendre sur plusieurs colonnes ou lignes et pour aligner leur contenu.

### Aperçu des attributs

| Attribut  | Valeurs autorisées             | Effet                                                       |
|-----------|--------------------------------|-------------------------------------------------------------|
| `colspan` | entier positif                 | La cellule s'étend sur plusieurs colonnes                   |
| `rowspan` | entier positif                 | La cellule s'étend sur plusieurs lignes                     |
| `align`   | `left` / `center` / `right`    | Alignement horizontal du contenu de la cellule              |
| `valign`  | `top` / `middle` / `bottom`    | Alignement vertical dans les cellules-bloc multilignes      |

Les attributs se placent entre deux barres verticales en début de cellule : `| attr="val" attr="val" | contenu`.

### Exemple avec colspan, rowspan et align

Source :

````markdown
```perspective-table
{|
|+ Estimation de charge
|-
! Domaine
! Tâche
! align="right" | Heures
|-
| rowspan="2" | Conception
| Collecter les exigences
| align="right" | 8
|-
| Esquisse du layout
| align="right" | 4
|-
| colspan="2" align="center" | Sous-total
| align="right" | 12
|}
```
````

Résultat :

```perspective-table
{|
|+ Estimation de charge
|-
! Domaine
! Tâche
! align="right" | Heures
|-
| rowspan="2" | Conception
| Collecter les exigences
| align="right" | 8
|-
| Esquisse du layout
| align="right" | 4
|-
| colspan="2" align="center" | Sous-total
| align="right" | 12
|}
```

### Astuces pour les spans et l'alignement

- Les attributs peuvent apparaître dans n'importe quel ordre : `| colspan="2" align="center" | contenu` et `| align="center" colspan="2" | contenu` sont équivalents.
- Les valeurs invalides sont ignorées silencieusement (par exemple `colspan="abc"`, `align="haut"`).
- Les cellules sans bloc d'attributs s'affichent comme des cellules normales.

### Accessibilité

Les cellules d'en-tête (`!`) reçoivent automatiquement l'attribut `scope` approprié : `scope="col"` pour les en-têtes de la ligne d'en-tête, `scope="row"` pour les en-têtes au sein des lignes de données. Cela permet aux lecteurs d'écran d'associer les cellules de données à leurs en-têtes.

## Tableaux imbriqués et export HTML

Les tableaux Perspective peuvent être imbriqués les uns dans les autres, et un fichier contenant des tableaux Perspective peut être exporté sous forme de « Markdown portable » avec des tableaux HTML en ligne, afin qu'il s'affiche aussi comme un véritable tableau dans d'autres applications Markdown.

### Tableaux imbriqués

Une cellule peut elle-même contenir un tableau Perspective — jusqu'à trois niveaux de profondeur. Important : chaque clôture de code extérieure doit avoir au moins une apostrophe inverse de plus que la suivante intérieure (standard CommonMark).

| Niveau | Clôture extérieure       | Contenu d'exemple                                                                                            |
|--------|--------------------------|--------------------------------------------------------------------------------------------------------------|
| 1      | trois apostrophes inv.   | uniquement le tableau, pas de bloc de code imbriqué                                                          |
| 2      | quatre apostrophes inv.  | tableau avec un tableau intérieur (trois apostrophes inv.)                                                   |
| 3      | cinq apostrophes inv.    | tableau avec un tableau intérieur (quatre apostrophes inv.) qui contient lui-même un tableau (trois apostrophes inv.) |

Un quatrième niveau ne s'affiche plus comme tableau mais comme bloc de code (protection contre les profondeurs pathologiques).

Exemple source avec deux niveaux :

`````markdown
````perspective-table
{|
|+ Tableau extérieur
|-
| Charge par poste
| ```perspective-table
{|
|-
! Position
! Heures
|-
| Exigences
| 8
|}
```
|}
````
`````

Résultat :

````perspective-table
{|
|+ Tableau extérieur
|-
| Charge par poste
| ```perspective-table
{|
|-
! Position
! Heures
|-
| Exigences
| 8
|}
```
|}
````

### Export HTML pour les rendus Markdown tiers

Les fichiers `.md` contenant des tableaux Perspective ne s'affichent comme tableaux que dans ce viewer. Dans les autres applications Markdown, le bloc de code `perspective-table` apparaît tel quel comme texte source.

Avec **Fichier → Autres fonctions de fichier → Exporter → Markdown portable…**, tu enregistres une variante du fichier dans laquelle les tableaux Perspective sont remplacés par des tableaux HTML en ligne. Ces tableaux HTML s'affichent comme de vrais tableaux dans pratiquement toute application Markdown.

- **Boîte de dialogue Enregistrer sous** avec valeur par défaut `<nomdebase>-portable.md` dans le répertoire du fichier source. Chemin et nom librement modifiables.
- **Les formules KaTeX** (`$...$`) dans les cellules restent sous forme de code source lors de l'export — du HTML KaTeX rendu apparaîtrait cassé chez un destinataire sans la feuille de style KaTeX.
- **Le fichier original** reste inchangé ; l'export écrit toujours dans un nouveau fichier.
- **Attributs de cellule** (`colspan`, `rowspan`, `align`, `valign`) sont traduits en attributs HTML standard et styles en ligne.
- **L'attribut `scope`** d'accessibilité sur les cellules d'en-tête est préservé.
- **Imbrication** : jusqu'à trois niveaux sont convertis récursivement.
- **Mise en forme en ligne dans les cellules** (gras, italique, code, liens) est convertie en HTML afin de s'afficher correctement aussi dans les rendus tiers.

#### Marqueur pour l'affichage dans le viewer

Pour que le fichier exporté s'affiche **aussi comme un tableau dans le viewer EM4me** (au lieu de texte source avec balises `<table>`), le convertisseur insère le marqueur `<!-- perspective-portable -->` au début du fichier. Le viewer reconnaît ce marqueur et passe le fichier dans un mode de rendu compatible HTML.

**Note de sécurité** : les fichiers `.md` réguliers s'ouvrent toujours sans rendu HTML — aucun HTML du Markdown n'est exécuté. Seul le marqueur déverrouille le rendu HTML. Pour un fichier `.md` tiers portant ce marqueur (cas limite), tu dois faire confiance à la source, car le contenu HTML qui s'y trouve serait exécuté.

## Tri, mise en évidence des statuts et alignement par défaut

Les tableaux Perspective peuvent être colorés avec des classes de statut par cellule ou ligne, recevoir un alignement par défaut par colonne, et être triés en cliquant sur l'en-tête de colonne.

### Mise en évidence des statuts

Avant le contenu d'une cellule ou directement après `|-`, une classe de statut peut apparaître en notation point :

| Classe     | Signification                       |
|------------|-------------------------------------|
| `.error`   | Erreur, critique                    |
| `.warn`    | Avertissement, attention            |
| `.ok`      | OK, terminé, positif                |
| `.info`    | Indication, neutre-informatif       |
| `.neutral` | Marquage sans évaluation            |

- **Cellule** : `|.error contenu`
- **Ligne** (s'applique à toutes les cellules de la ligne) : `|-.warn`
- **Le statut de cellule l'emporte** sur le statut de ligne.
- Les valeurs invalides sont ignorées silencieusement.

Exemple :

```perspective-table
{|
|-
! Service
! Statut
|-.warn
| Service mail
| Maintenance
|-
| Serveur web
|.error Panne
|-
| Base de données
|.ok En marche
|}
```

### Alignement par défaut par colonne

Dans la ligne d'en-tête du tableau, `cols="…"` définit un alignement par défaut par colonne :

- Syntaxe : `{|+cols="left right right"`
- Valeurs : `left`, `center` ou `right`.
- Une cellule avec un attribut `align` explicite (de l'étape 2) écrase le défaut.
- Pour `colspan` aucun défaut n'est appliqué (la cellule s'étend sur plusieurs colonnes).

Exemple :

```perspective-table
{|+cols="left right right"
|-
! Produit
! Prix
! Stock
|-
| Clavier
| 49
| 12
|-
| Souris
| 25
| 8
|-
| Écran
| 280
| 3
|}
```

### Tableaux triables

`+sortable` dans la ligne d'en-tête rend le tableau triable au clic :

- Syntaxe : `{|+sortable` (combinable avec `cols=` : `{|+sortable cols="left right"`)
- Clic sur un en-tête : tri ascendant, second clic : descendant, troisième clic : retour à l'ordre original.
- **Heuristique de tri** : numérique d'abord (`Number()` sur la première ligne de la cellule), sinon lexicographique avec la locale (`localeCompare`, accents triés correctement).
- **Cellules multilignes** : triées sur la première ligne.
- **Dates** : le format ISO (2026-05-19) se trie correctement lexicographiquement. Convertir les autres formats en ISO.
- **`colspan`/`rowspan` désactivent automatiquement le tri** (risque de mise en page trop élevé).
- **Dans l'export portable** le tri n'est pas inclus (pas de JavaScript dans les rendus Markdown tiers).

Exemple :

```perspective-table
{|+sortable
|-
! Nom
! Âge
! Ville
|-
| Mueller
| 42
| Berlin
|-
| Schmidt
| 28
| Hambourg
|-
| Becker
| 35
| Munich
|}
```

## Édition via le menu contextuel

Un clic droit dans le bloc ouvre le sous-menu **Tableau** dans le [Menu contextuel de l'éditeur](context-menu.md). Les opérations sur les lignes (déplacer, insérer, supprimer) travaillent sur les sections `|-` et conservent le texte brut des cellules inchangé, y compris les attributs, les classes de statut et les contenus multilignes ; elles sont toujours possibles, même en présence de spans.

Les opérations sur les colonnes et la transposition déplacent des blocs de cellules entiers (ligne de marqueur plus lignes suivantes) et ne sont disponibles que sans `colspan`/`rowspan` — avec des spans, l'affectation des colonnes serait ambiguë, l'opération est donc refusée avec un message dans la barre d'état. Lors de la transposition, la ligne d'en-tête devient la première colonne ; les marqueurs de cellule (`!` ou `|`) suivent leurs cellules.

Les entrées d'alignement définissent l'alignement par défaut de la colonne dans l'attribut `cols` de la ligne `{|` (voir la section « Alignement par défaut par colonne ») ; les colonnes sans valeur reçoivent le caractère de remplacement `-`, et les attributs `align` des cellules individuelles restent intacts.

## Astuces

**`|-` est obligatoire entre les lignes du tableau.** Sans `|-`, les cellules `|` suivantes sont interprétées comme des cellules supplémentaires de la même ligne, pas comme une nouvelle ligne. Piège le plus fréquent au début.

**Clôture extérieure à quatre apostrophes inverses** dès qu'une cellule contient un bloc de code à trois apostrophes inverses. Sinon, le bloc de code intérieur ferme prématurément la clôture extérieure.

**Une cellule par début de ligne source.** Les lignes suivantes sans `|`, `!`, `|-` ou `|}` en tête appartiennent à la cellule en cours.

**Les espaces** en début et en fin de cellule sont supprimés au rendu. L'indentation des listes à l'intérieur de la cellule est préservée.

**Le formatage en ligne, les liens wiki et les images** fonctionnent dans les cellules comme partout ailleurs (`**gras**`, `*italique*`, `` `code` ``, `[[Lien-wiki]]`, `![alt](image.png)`).

## Portabilité

Les fichiers `.md` avec des blocs `perspective-table` ne s'affichent comme tableaux que dans ce viewer. Dans les autres applications Markdown, le bloc apparaît comme un bloc de code régulier. C'est un choix de conception délibéré, pas un bug — le contenu reste lisible partout plutôt que d'apparaître comme une source syntaxiquement cassée.

## État des fonctions

L'ensemble de fonctions prévu pour les tableaux Perspective est désormais complet : syntaxe de base, spans et alignement, imbrication et export HTML, tri, mise en évidence des statuts et alignement par défaut, ainsi que les opérations d'édition via le menu contextuel.
