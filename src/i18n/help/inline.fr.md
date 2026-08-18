# Constructions en ligne

Mises en forme à l'intérieur d'une ligne, au-delà du gras/italique. Syntaxe en bloc de code, résultat en dessous.

## Surlignage

```markdown
Mettre ==l'essentiel== en évidence ; \== reste du texte brut.
```

Mettre ==l'essentiel== en évidence ; \== reste du texte brut.

## Indice et exposant

Indice avec `~…~`, exposant avec `^^…^^` (double caret, car le `^` simple est pris par les notes de bas de page et les ancres de bloc).

```markdown
H~2~O et x^^2^^
```

H~2~O et x^^2^^

## Soulignement

```markdown
++texte souligné++
```

++texte souligné++

## Spoiler

Texte masqué, révélé au survol de la souris ou au focus clavier. Dans les cellules de tableaux pipe, échapper les barres avec `\|`, sinon la séparation des cellules coupe le spoiler.

```markdown
La réponse : ||42||
```

La réponse : ||42||

## Critic Markup

Suivi des modifications avec cinq formes : insertion, suppression, remplacement, surlignage, commentaire.

```markdown
{++inséré++} {--supprimé--} {~~ancien~>nouveau~~} {==surligné==} {>>commentaire<<}
```

{++inséré++} {--supprimé--} {~~ancien~>nouveau~~} {==surligné==} {>>commentaire<<}

## Commentaires

Le texte entre les marqueurs `%%` est un commentaire privé : il reste dans la source, mais n'apparaît dans aucune vue rendue ni aucun export. Les commentaires fonctionnent à l'intérieur d'une ligne et sur plusieurs lignes ; un `%%` ouvrant sans fermeture agit jusqu'à la fin du document. Dans les blocs de code et les spans de code, `%%` reste du texte ordinaire ; `\%%` donne un `%%` littéral dans le texte courant (chaque marqueur s'échappe séparément). Dans l'éditeur, les zones de commentaire sont discrètement colorées (vues source et direct). Le commentaire Critic Markup visible `{>>…<<}` de la section précédente en est indépendant : il sert à la concertation et est rendu, tandis que le commentaire `%%` reste privé.

```markdown
Texte visible %%commentaire privé%% et la suite de la phrase.

%%
Commentaire sur plusieurs lignes : tout jusqu'au
marqueur de fermeture reste privé.
%%
```

Cette ligne démontre le comportement en direct ; entre « ici » et « là » se trouve un commentaire : ici %%invisible pour les lecteurs%% là.

## Spans et attributs de titre

Spans en ligne avec attributs : `[texte]{.classe #id}` ; seuls `id` et `class` sont autorisés. Les titres reçoivent une ancre personnalisée avec `{#mon-id}`, prioritaire sur l'ancre automatique (utile pour des liens stables quand les titres changent, voir [Liens](linking.md)).

```markdown
Une [section marquée]{#span-demo} dans le texte courant.

### Titre avec ID fixe {#id-fixe}
```

Une [section marquée]{#span-demo} dans le texte courant.

### Titre avec ID fixe {#id-fixe}

## Abréviations

Ligne de définition `*[sigle]: texte long` ; chaque occurrence du sigle reçoit un soulignement pointillé avec le texte long en infobulle (survoler le sigle).

```markdown
*[HTML]: Hyper Text Markup Language

L'application produit du HTML au rendu.
```

*[HTML]: Hyper Text Markup Language

L'application produit du HTML au rendu.

## Calculs en ligne

Expressions de calcul entre `{=` et `=}` à n'importe quel endroit du texte courant : la vue rendue, le mode direct et les exports affichent le **résultat**, la source conserve l'expression ; l'expression brute apparaît en infobulle (survoler le résultat). En mode direct, la ligne du curseur affiche l'expression brute pour l'édition ; un clic sur le résultat y place le curseur. Le calcul utilise le langage d'expressions de la [Requête Perspective](frontmatter-query.md) : nombres, parenthèses, chaînes, valeurs de date et de durée ainsi que le catalogue de fonctions. Les accès aux champs (p. ex. `file.name`) ne sont pas disponibles dans les calculs en ligne.

```markdown
Somme {= 2+3*4 =}, Date {= date(2026-01-01) + dur(30d) =}, Texte {= upper('abc') =}
```

Somme {= 2+3*4 =}, Date {= date(2026-01-01) + dur(30d) =}, Texte {= upper('abc') =}

Règles et particularités :

- **Opérateurs** : `+`, `-`, `*`, `/` avec la précédence usuelle et des parenthèses ; les comparaisons `=`, `!=`, `<`, `<=`, `>`, `>=` ainsi que `AND`, `OR`, `NOT` donnent `true`/`false`. Entre des nombres, le moins exige un espace (`4 - 1`, pas `4-1` — ce dernier est lu par le langage d'expressions comme un nom de champ).
- **Date et durée** : `date(...)` et `dur(...)` comme dans le langage de requête ; date ± durée donne une date, date − date une durée.
- **Fonctions** : le catalogue de fonctions du langage de requête (`number`, `string`, `lower`, `upper`, `length`, `startswith`, `endswith`, `contains`, `default`, `choice`, `dateformat`, `days`, `numberformat`, `currencyformat`, `sum`, `min`, `max`, `average`). Les fonctions qui exigent une référence de fichier restent sans effet ici : aucun document ne leur sert de repère.
- **Erreur** : une expression non évaluable affiche un discret ⚠︎ avec l'avis d'erreur dans l'infobulle ; la source reste inchangée.
- **Échappement** : `\{=` donne un `{=` littéral dans le texte courant.

```markdown
Comparaison {= 10/4 >= 2 =}, Condition {= choice(1 = 2, 'oui', 'non') =}, Erreur {= 2+ =}
```

Comparaison {= 10/4 >= 2 =}, Condition {= choice(1 = 2, 'oui', 'non') =}, Erreur {= 2+ =}
