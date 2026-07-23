# Perspective Datatable

La Perspective Datatable est une **table de données typée avec fonctions de calcul** : les colonnes ont des types de valeurs fixes, les cellules n'acceptent que des valeurs conformes au type, les lignes d'agrégats calculent en direct et les colonnes calculées évaluent des expressions par ligne. La modification se fait directement dans la grille rendue ; toutes les données restent en texte clair dans le document.

Délimitation : la [Perspective Table](perspective-table.md) vise des contenus textuels riches (cellules de bloc multilignes, spans, mise en évidence d'état). La Datatable vise des **données structurées et calculables** — de petits ensembles comme des dépenses, un suivi du temps ou des inventaires. La table de données fait partie des [extensions internes](extensions.md) et peut y être désactivée ; désactivé, le bloc reste un bloc de code ordinaire.

## Structure du bloc

Un bloc de code avec le tag de langue `perspective-datatable` contient des directives d'en-tête et des lignes de données :

````markdown
```perspective-datatable
columns: Nom:text, Date:date, Montant:number(2), Fait:boolean
aggregate: Montant:sum+avg, Fait:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```
````

Au rendu, la grille apparaît avec ligne d'en-tête, symboles de type et ligne d'agrégats :

```perspective-datatable
columns: Nom:text, Date:date, Montant:number(2), Fait:boolean
aggregate: Montant:sum+avg, Fait:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```

- **`columns:`** (obligatoire) déclare les colonnes sous la forme `Nom:type`, séparées par des virgules. Les noms de colonnes peuvent contenir des espaces.
- **`aggregate:`** (facultatif) associe des fonctions d'agrégat aux colonnes ; plusieurs par colonne se combinent avec `+`.
- **Les lignes de données** utilisent la notation à barres (`| … | … |`), une ligne par enregistrement. Un `|` dans le texte s'écrit `\|`.

## Types de colonnes et formats

| Type | Forme de stockage | Exemple |
|---|---|---|
| `text` | texte libre | `Anna` |
| `number` | décimal à point | `12.5`, `-3` |
| `date` | `AAAA-MM-JJ` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (vrai) ou vide (faux) | `x` |

`number` connaît un format d'affichage facultatif : `Montant:number(2)` affiche deux décimales. Affichage et forme de stockage restent volontairement lisibles à l'identique (pas de reformatage régional) ; les cellules vides sont valides pour tous les types. Une valeur qui ne correspond pas au type de colonne est marquée comme **cellule en erreur** — le texte est conservé, une infobulle explique le format attendu et la valeur n'entre pas dans les agrégats.

## Agrégats

Fonctions disponibles selon le type de colonne :

| Fonction | Signification | Autorisée sur |
|---|---|---|
| `sum` | somme | `number` |
| `avg` | moyenne (arrondie au format de la colonne) | `number` |
| `min` / `max` | valeur minimale/maximale | `number`, `date`, `time` |
| `count` | nombre de cellules non vides (pour `boolean` : nombre de vraies) | tous les types |

Les cellules vides ou en erreur sont exclues. La ligne d'agrégats apparaît sous les données et recalcule à chaque modification ; en vue filtrée, elle calcule sur les lignes visibles.

## Colonnes calculées

Une colonne avec `= expression` après le type calcule sa valeur par ligne à partir d'autres colonnes :

```perspective-datatable
columns: Article:text, Prix:number(2), Qte:number, Total:number(2) = Prix * Qte
aggregate: Total:sum
| Stylo | 1.20 | 10 |
| Bloc | 3.50 | 4 |
```

- Le langage d'expression est le même que dans la [Requête Perspective](frontmatter-query.md) : arithmétique, comparaisons, `choice(…)`, `default(…)`, fonctions de texte et plus.
- Les noms de colonnes dans l'expression désignent les valeurs de la ligne concernée ; d'autres colonnes calculées sont utilisables dans n'importe quel ordre de déclaration (l'évaluation résout les dépendances). Les références circulaires sont signalées comme erreurs de structure.
- Le résultat doit correspondre au type de colonne déclaré, sinon la cellule affiche une erreur.
- Les valeurs calculées ne sont **jamais stockées dans la source** — elles sont toujours recalculées et n'ont donc pas de cellule de données dans les lignes à barres. Les agrégats sur colonnes calculées se calculent sur les valeurs calculées.

## Modifier dans la grille

Dans la **vue partagée** et en **mode direct**, la grille est directement modifiable ; la vue lecture et les pages du manuel l'affichent en lecture seule. Chaque validation réécrit le bloc de code dans la source — le document devient non enregistré comme d'habitude, annuler/rétablir fonctionnent normalement.

- **Modifier une cellule** : un clic sur la cellule (ou `Entrée`/`F2` quand elle a le focus) ouvre un champ de saisie adapté au type. `Entrée` ou la perte de focus valide, `Échap` annule, `Tab`/`Maj+Tab` valide et passe à la cellule suivante ou précédente.
- **Contrainte de type** : une valeur non conforme au type de colonne est refusée (indication dans la barre d'état) ; la cellule reste ouverte pour correction.
- **Boolean** : un clic sur la cellule (ou la barre d'espace) bascule directement la valeur.
- **Lignes** : le bouton sous la table ajoute une ligne à la fin des données ; le symbole × en début de ligne la supprime.
- Les cellules des colonnes calculées ne sont pas modifiables ; les saisies dans leurs colonnes d'entrée les mettent à jour immédiatement.
- Une table avec des erreurs de structure (voir plus bas) n'est pas modifiable dans la grille tant que l'erreur n'est pas corrigée dans la source.

## Trier et filtrer (vue)

Le tri et le filtrage n'agissent **que sur la vue** — la source reste inchangée, rien n'est enregistré ni exporté ; après réouverture du fichier, la vue est neutre.

- **Trier** : un clic sur l'en-tête de colonne trie selon le type en ordre croissant, un deuxième clic en ordre décroissant, un troisième supprime le tri. Les valeurs manquantes se placent à la fin.
- **Filtrer** : le commutateur au bord droit de la table affiche la ligne de filtre : les colonnes de texte filtrent par recherche de contenu, les colonnes booléennes via un commutateur à trois états (tous/oui/non). Une mention affiche « n sur m lignes » ; la ligne d'agrégats calcule sur les lignes visibles.
- La modification reste possible en vue triée ou filtrée et atteint toujours la bonne ligne de la source.

## Erreurs

- **Les erreurs de structure** (type inconnu, noms de colonnes en double, nombre de cellules divergent, expressions invalides) apparaissent en liste au-dessus de la grille avec le numéro de ligne dans le bloc.
- **Les erreurs de cellule** (valeur non conforme au type) ne marquent que la cellule concernée ; le texte est conservé.

## Export

L'export portable et l'export PDF produisent la table sous forme de table statique dans l'ordre du document — avec toutes les lignes, les valeurs calculées des colonnes calculées et la ligne d'agrégats, sans interactivité.

## Limites

À partir de 1000 lignes de données, la grille n'affiche que l'en-tête et les agrégats avec une note ; les agrégats calculent toujours sur toutes les lignes. Les très grands ensembles de données relèvent d'un outil de données dédié.
