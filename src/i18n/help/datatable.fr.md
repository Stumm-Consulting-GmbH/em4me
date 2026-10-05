# Perspective Datatable

La Perspective Datatable est une **table de données typée avec fonctions de calcul** : les colonnes ont des types de valeurs fixes, les cellules n'acceptent que des valeurs conformes au type, les lignes d'agrégats calculent en direct et les colonnes calculées évaluent des expressions par ligne. La modification se fait directement dans la grille rendue ; toutes les données restent en texte clair dans le document.

Délimitation : la [Perspective Table](perspective-table.md) vise des contenus textuels riches (cellules de bloc multilignes, spans, mise en évidence d'état). La Datatable vise des **données structurées et calculables** — de petits ensembles comme des dépenses, un suivi du temps ou des inventaires. La table de données fait partie des [extensions internes](extensions.md) et peut y être désactivée ; désactivé, le bloc reste un bloc de code ordinaire.

Les valeurs d’une table de données peuvent s’afficher en graphique en courbes, en barres, en secteurs ou en anneau ; la page [Graphiques de tables](charts.md) décrit comment.

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

- **`table:`** (facultatif) donne un nom à la table, par exemple `table: Ventes` ; sous ce nom, un [graphique](charts.md) désigne la table, et les liens, les incorporations et les [propriétés de bloc](block-properties.md) l'atteignent.
- **`columns:`** (obligatoire) déclare les colonnes sous la forme `Nom:type`, séparées par des virgules. Les noms de colonnes peuvent contenir des espaces.
- **`aggregate:`** (facultatif) associe des fonctions d'agrégat aux colonnes ; plusieurs par colonne se combinent avec `+`.
- **`types:`** (facultatif) commute l'indication de type sous les en-têtes : `shown` ou `hidden`. Sans cette ligne, elle apparaît.
- **Les lignes de données** utilisent la notation à barres (`| … | … |`), une ligne par enregistrement. Un `|` dans le texte s'écrit `\|`.


### Un en-tête propre par colonne

L'identifiant de colonne sert aussi d'en-tête. Il doit rester court et sans séparateurs, car les agrégats et les colonnes calculées l'utilisent comme nom. Pour un en-tête lisible, placez-le entre guillemets doubles derrière l'identifiant :

```
columns: Montant:number(2), Total "Total (brut, en €)":number(2) = Montant * 2
```

Le libellé peut porter n'importe quels caractères, y compris espaces, virgules, deux-points et signes égal ; un guillemet à l'intérieur s'écrit deux fois. La colonne reste adressée uniquement par son identifiant, qui demeure accessible en infobulle sur l'en-tête.

### Le nom de la table

La ligne `table:` se place parmi les directives d'en-tête avant les lignes de données, au plus une fois dans le bloc ; lors de l'édition dans la grille, elle reste la première ligne. Le nom suit les règles des [ancres de bloc](linking.md) : lettres (y compris accentuées et ß), chiffres, trait d'union et trait de soulignement, sans espace ni point ; majuscules et minuscules comptent. `[[Document#^Ventes]]` mène à la table, `![[Document#^Ventes]]` l'incorpore. Si deux blocs du document portent le même nom, c'est la première occurrence qui compte ; la table ne le signale pas comme erreur, et le panneau [Propriétés de bloc](block-properties.md) indique le nom attribué plusieurs fois. Si la table de données est désactivée, la ligne figure comme texte dans le bloc de code, et le nom reste une cible de saut.

## Types de colonnes et formats

| Type | Forme de stockage | Exemple |
|---|---|---|
| `text` | texte libre | `Anna` |
| `number` | décimal à point | `12.5`, `-3` |
| `date` | `AAAA-MM-JJ` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (vrai) ou vide (faux) | `x` |

`number` connaît un format d'affichage facultatif : `Montant:number(2)` affiche deux décimales. Affichage et forme de stockage restent volontairement lisibles à l'identique (pas de reformatage régional) ; les cellules vides sont valides pour tous les types. Une valeur qui ne correspond pas au type de colonne est marquée comme **cellule en erreur** — le texte est conservé, une infobulle explique le format attendu et la valeur n'entre pas dans les agrégats.

## Liens et tags dans les cellules texte

Dans une colonne de type `text`, les liens et les tags agissent comme dans le reste du document :

````markdown
```perspective-datatable
columns: Poste:text, Montant:number(2)
| Loyer pour [[Appartement]] #fixe | 850 |
| Billet de train, voir [[Voyage 2026\|Plan de voyage]] | 120 |
| Frais de cours, [Inscription](https://example.org) | 60 |
```
````

- **Ce qui agit** : `[[Cible]]`, `[[Cible#Ancre]]` et le lien avec alias, qui s'écrit `[[Cible\|Alias]]` dans la cellule, car tout `|` dans une cellule s'écrit `\|` ; en outre le lien Markdown `[Texte](Cible)`, y compris avec une adresse web, et `#tag`. Une intégration `![[Cible]]` apparaît comme lien, non comme contenu intégré.
- **Affichage et clic** : dans la vue lecture, la vue partagée et le mode direct, ils apparaissent comme lien ou comme tag. Un clic sur un lien ouvre sa cible, un clic sur un tag filtre la barre latérale des tags comme dans le texte.
- **Réseau de liens** : la cible mentionne le document parmi ses **Rétroliens**, et les **Liens sortants** ainsi que la [Vue graphe](graph.md) montrent la connexion. Si la cible est renommée ou déplacée, le lien de la cellule suit ; l'alias et la table restent intacts.
- **Les tags comptent** : un tag issu d'une cellule compte dans la barre latérale des tags, dans l'ordre des suggestions et dans les requêtes, et le [renommage d'un tag](linking.md) couvre aussi les cellules.
- **Ce qui reste du texte** : gras, italique, formules et autres balisages apparaissent tels qu'ils sont écrits, car une cellule texte porte des valeurs et non de la prose. Placé entre accents graves, `[[…]]` reste lui aussi littéral et n'est pas un lien. Les colonnes nombre, date, heure et booléen, les colonnes calculées et les lignes d'en-tête du bloc ne forment pas de liens ; le tri, le filtre et les agrégats travaillent sur le texte écrit.
- **Désactivé** : si la table de données est désactivée, le bloc apparaît comme bloc de code sans liens cliquables ; les rétroliens et la mise à jour lors du renommage subsistent néanmoins. Si les liens wiki ou les tags sont désactivés, le texte de la cellule reste du texte simple.

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

- Le langage d'expression est le même que dans la [Requête Perspective](frontmatter-query.md) : arithmétique, comparaisons, `choice(…)`, `default(…)`, fonctions de texte et plus. Il comprend `count(x)` ; dans une formule, il compte les valeurs du champ nommé dans la seule ligne concernée et n'est pas la fonction d'agrégat `count` de la ligne d'agrégats, qui compte sur toutes les lignes.
- Les noms de colonnes dans l'expression désignent les valeurs de la ligne concernée ; d'autres colonnes calculées sont utilisables dans n'importe quel ordre de déclaration (l'évaluation résout les dépendances). Les références circulaires sont signalées comme erreurs de structure.
- Le résultat doit correspondre au type de colonne déclaré, sinon la cellule affiche une erreur.
- Les valeurs calculées ne sont **jamais stockées dans la source** — elles sont toujours recalculées et n'ont donc pas de cellule de données dans les lignes à barres. Les agrégats sur colonnes calculées se calculent sur les valeurs calculées.

## Modifier dans la grille

Dans la **vue partagée** et en **mode direct**, la grille est directement modifiable ; la vue lecture et les pages du manuel l'affichent en lecture seule. Chaque validation réécrit le bloc de code dans la source — le document devient non enregistré comme d'habitude, annuler/rétablir fonctionnent normalement.

- **Modifier une cellule** : un clic sur la cellule (ou `Entrée`/`F2` quand elle a le focus) ouvre un champ de saisie adapté au type. `Entrée` ou la perte de focus valide, `Échap` annule, `Tab`/`Maj+Tab` valide et passe à la cellule suivante ou précédente.
- **Liens dans la cellule** : un clic sur un lien ou un tag dans une cellule texte le suit et n'ouvre pas la cellule. Un clic dans la partie libre de la cellule, `Entrée` ou `F2` l'ouvrent avec le texte écrit. Si le lien lui-même a le focus clavier, `Entrée` le suit et `F2` ouvre la cellule.
- **Suggestions** : dans une cellule texte, la même [liste de suggestions](linking.md) que dans le texte apparaît après `[[` et `#`, y compris dans une cellule vide ; `Ctrl+Espace` l'ouvre explicitement. Tant qu'elle est ouverte, les flèches choisissent, `Entrée` reprend la suggestion dans le champ et `Échap` ferme seulement la liste ; un second `Entrée` valide la cellule. `Tab` ne reprend aucune suggestion : il ferme la liste, valide la cellule et passe à la suivante. Aucune liste n'apparaît dans les cellules nombre, date et heure, et elle n'y propose pas de marqueurs de tâche.
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

- **Les erreurs de structure** (type inconnu, noms de colonnes en double, nombre de cellules divergent, expressions invalides, nom vide ou invalide dans la ligne `table:`, deuxième ligne `table:` dans le bloc) apparaissent en liste au-dessus de la grille avec le numéro de ligne dans le bloc.
- **Les erreurs de cellule** (valeur non conforme au type) ne marquent que la cellule concernée ; le texte est conservé.

## Export

L'export portable et l'export PDF produisent la table sous forme de table statique dans l'ordre du document — avec toutes les lignes, les valeurs calculées des colonnes calculées et la ligne d'agrégats, sans interactivité. Les liens et les tags des cellules texte y apparaissent comme les liens et les tags du reste du document. Si la table porte un nom, une ligne `^Nom` la suit dans l'export portable, afin que les liens du document exporté gardent leur cible.

## Limites

À partir de 1000 lignes de données, la grille n'affiche que l'en-tête et les agrégats avec une note ; les agrégats calculent toujours sur toutes les lignes. Les très grands ensembles de données relèvent d'un outil de données dédié.
