# Bases de Markdown

L'application rend du Markdown sur la base du standard CommonMark, étendu par les tableaux, les listes de tâches, le texte barré et les liens automatiques. Cette page présente le cœur ; les constructions spéciales ont leurs propres pages ([Constructions de bloc](blocks.md), [Constructions en ligne](inline.md), [Liens](linking.md)).

## Titres

Six niveaux avec `#` à `######` ; chaque titre reçoit automatiquement une ancre pour les liens et la table des matières.

```markdown
## Chapitre
### Sous-chapitre
```

Il existe aussi la forme Setext pour les niveaux 1 et 2 : une ligne de texte soulignée par `===` (H1) ou `---` (H2).

```markdown
Chapitre en forme Setext
------------------------
```

### Numérotation automatique

Les titres peuvent être numérotés automatiquement avec des numéros hiérarchiques (1, puis 1.1, 1.2, et ainsi de suite). Les numéros apparaissent dans le volet de rendu, le mode direct, le plan et les exports ; le texte source reste inchangé.

Le contrôle se fait sur trois niveaux qui se substituent dans cet ordre : le titre individuel avant le document, le document avant le réglage global. Globalement, le réglage « Numéroter les titres » active la numérotation et fixe le niveau de départ (H1 ou H2). Par document, la clé de frontmatter `numbered-headings` remplace le réglage global :

```markdown
---
numbered-headings: true
---
```

Par titre, un marqueur en fin de ligne agit : `{-}` exclut un titre, `{+}` l'inclut, chacun aussi à l'encontre du réglage global. Une barre oblique inverse en tête protège le marqueur comme texte littéral (`\{-}` apparaît comme `{-}`).

```markdown
## Annexe {-}
## Important {+}
```

Les titres exclus ne sont pas comptés et ne réinitialisent pas les sous-compteurs ; leurs sous-titres continuent de compter sous le dernier titre numéroté. Si un niveau est sauté, par exemple de H1 directement à H3, le niveau intermédiaire manquant compte comme un.

## Emphase

```markdown
**gras**, *italique*, ~~barré~~, `code en ligne`
```

**gras**, *italique*, ~~barré~~, `code en ligne`

## Listes

Listes non ordonnées avec `-`, `*` ou `+`, ordonnées avec `1.`. Un sous-élément appartient à l'élément du dessus lorsqu'il commence là où commence le contenu de celui-ci : deux caractères sous `- `, trois sous `1. `, quatre sous `10. `.

```markdown
- Premier point
  - Sous-point
1. Première étape
   1. Sous-étape
```

- Premier point
  - Sous-point

1. Première étape
   1. Sous-étape

### Modifier la structure

En mode édition, le plan se modifie au clavier. La profondeur découle toujours de l'élément du dessus, vous n'avez pas à compter les espaces.

- `Alt+Flèche haut` et `Alt+Flèche bas` déplacent un élément avec tous ses sous-éléments. Le saut couvre la branche voisine entière et le niveau reste identique. Hors des listes, les raccourcis déplacent la seule ligne.
- `Tab` et `Maj+Tab` indentent et désindentent l'élément avec ses sous-éléments. L'indentation ne fonctionne que là où un élément situé au-dessus peut accueillir l'élément courant.
- Si plusieurs lignes sont sélectionnées, les deux touches agissent exactement sur la plage sélectionnée.
- La commande « Sélectionner la branche » marque un élément avec tout ce qui en dépend.

### Numérotation

Les listes numérotées se renumérotent d'elles-mêmes dans le texte source dès que vous y travaillez. Le numéro de départ est conservé : une liste commençant à `3.` continue avec `4.`.

Une ligne vide commence une nouvelle liste. Si elle naît de votre modification, la liste suivante repart à 1 ; si elle était déjà là, la seconde liste garde son propre numéro de départ. Le texte source et l'affichage montrent les mêmes numéros.

```markdown
1. Première liste
2. Deuxième ligne

1. Nouvelle liste
2. Deuxième ligne
```

1. Première liste
2. Deuxième ligne

1. Nouvelle liste
2. Deuxième ligne

### Poursuivre et terminer

La touche Entrée poursuit une liste et ajoute une puce, un numéro consécutif ou une case à cocher vide. Sur un sous-élément vide, elle désindente d'un niveau ; au niveau supérieur, elle termine la liste.

### Le curseur au changement de ligne

Lorsque le curseur se trouve en fin de ligne et que `Flèche droite` le fait passer à la ligne suivante, il se place à la position d'écriture, à condition que la ligne cible soit une ligne de liste : après l'indentation et le marqueur, et après la case d'état sur une ligne de tâche. Qui écrit en plan économise ainsi de deux à six frappes à chaque changement de ligne.

Le marqueur reste accessible : depuis la position d'écriture, `Flèche gauche` continue caractère par caractère vers la gauche, d'abord dans le marqueur, puis dans l'indentation et enfin à la fin de la ligne précédente. `Maj+Flèche droite` sélectionne également caractère par caractère comme auparavant. Si la ligne cible ne porte pas de marqueur — une ligne de continuation d'un élément de liste, par exemple —, le curseur reste au début de la ligne comme auparavant.

Le comportement s'applique dans les vues Source, Scindée et Live. Le paramètre « Le curseur saute après le marqueur de liste » (Fichier → Paramètres… → Comportement) le désactive ; il est actif d'origine, et lorsqu'il est désactivé, le curseur se déplace comme dans un éditeur de texte habituel.

## Tableaux

Tableaux pipe avec ligne d'en-tête et ligne de séparation ; les deux-points dans la ligne de séparation contrôlent l'alignement. Pour des cellules-bloc multilignes, voir [Perspective Table](perspective-table.md) ; pour le confort de saisie, l'éditeur de tableaux (voir [Outils](tools.md)). Pour remanier des tableaux existants (déplacer, insérer et supprimer des lignes et des colonnes, alignement, transposition), utilisez le sous-menu **Tableau** dans le [Menu contextuel de l'éditeur](context-menu.md).

```markdown
| Gauche | Centré | Droite |
|:-------|:------:|-------:|
| a      | b      | 12     |
```

| Gauche | Centré | Droite |
|:-------|:------:|-------:|
| a      | b      | 12     |

## Citation et ligne de séparation

```markdown
> Citation sur
> plusieurs lignes

---
```

> Citation sur
> plusieurs lignes

---

## Liens et liens automatiques

Liens Markdown avec `[texte](cible)` ; les URL entre chevrons deviennent des liens automatiques. Les URL nues dans le texte courant sont aussi reconnues, mais le [linter Markdown](tools.md) y recommande la forme explicite.

```markdown
[Exemple](https://example.org) et <https://example.org>
```

[Exemple](https://example.org) et <https://example.org>

La forme par référence sépare l'emplacement du lien de la définition de la cible :

```markdown
Voir la [page d'exemple][ref].

[ref]: https://example.org
```

Voir la [page d'exemple][ref].

[ref]: https://example.org

## Sauts de ligne forcés

Deux espaces en fin de ligne ou une barre oblique inverse forcent un saut de ligne dans un paragraphe.

```markdown
Première ligne\
Deuxième ligne
```

Première ligne\
Deuxième ligne

## Code

En ligne avec des accents graves, en bloc avec trois accents graves ; une balise de langue active la coloration syntaxique (voir [Mathématiques et diagrammes](math-diagrams.md)). La forme CommonMark « code indenté » s'applique aussi : les lignes indentées de quatre espaces deviennent un bloc de code.

## Typographie

Le typographe remplace des séquences de caractères par des caractères typographiques : `--` devient un tiret (–), `...` des points de suspension (…), les guillemets droits deviennent typographiques.

```markdown
Une pensée -- et une autre ...
```

Une pensée -- et une autre ...
