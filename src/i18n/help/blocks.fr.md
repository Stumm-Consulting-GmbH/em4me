# Constructions de bloc

Extensions de bloc au-delà du cœur Markdown. Chaque chapitre montre la syntaxe en bloc de code et le résultat rendu juste en dessous ; la vue scindée les met côte à côte.

## Callouts

Encadrés : `> [!type]` comme première ligne d'une citation, avec un titre personnalisé en option. Dix types avec icône et couleur d'accent propres : `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `example`, `quote`. Les types inconnus sont signalés par le [linter Markdown](tools.md).

```markdown
> [!tip] Titre personnalisé
> Contenu de l'encadré, Markdown normal autorisé.
```

> [!tip] Titre personnalisé
> Contenu de l'encadré, Markdown normal autorisé.

Un `+` ou `-` après le type rend le callout pliable : `+` démarre ouvert, `-` replié — le pliage fonctionne aussi ici dans le manuel.

```markdown
> [!note]- Démarré replié
> Visible seulement après un clic sur le titre.
```

> [!note]- Démarré replié
> Visible seulement après un clic sur le titre.

La casse du type n'a pas d'importance : `[!note]`, `[!Note]` et `[!NOTE]` produisent le même encadré avec la même icône, la même couleur d'accent et le même titre par défaut ; `+`, `-` et un titre personnalisé fonctionnent de la même façon. Le texte du fichier reste tel qu'il a été écrit — les majuscules reprises d'autres programmes Markdown ne sont pas réécrites. La liste des dix types reste la même : les noms qui n'en font pas partie, comme `[!IMPORTANT]`, sont des types inconnus quelle que soit leur casse.

```markdown
> [!WARNING]
> En majuscules — le même encadré qu'avec `[!warning]`.
```

> [!WARNING]
> En majuscules — le même encadré qu'avec `[!warning]`.

## Conteneurs personnalisés

Blocs conteneurs entre `::: type` et `:::`. Les dix types de callout s'affichent en style callout, les noms inconnus en boîte neutre avec le nom comme titre.

```markdown
::: warning
Contenu en style callout.
:::
```

::: warning
Contenu en style callout.
:::

La casse du nom n'a pas d'importance : `::: warning`, `::: Warning` et `::: WARNING` produisent le même encadré, `::: Ma-Boite` la même boîte neutre que `::: ma-boite`, et `::: COLUMNS 2` répartit le contenu sur deux colonnes comme `::: columns 2`. Le texte du fichier reste tel qu'il a été écrit ; une boîte neutre affiche le nom comme titre, tel qu'il y figure. La liste des dix types de callout reste la même.

```markdown
::: WARNING
En majuscules — le même encadré qu'avec `::: warning`.
:::
```

::: WARNING
En majuscules — le même encadré qu'avec `::: warning`.
:::

## Bloc multicolonne

Un conteneur `::: columns <n>` affiche le contenu inclus sur plusieurs colonnes ; les valeurs valides vont de 2 à 5. Le texte se répartit automatiquement et de façon équilibrée sur les colonnes ; une ligne `+++` force le passage à la colonne suivante. Les nombres de colonnes invalides (absent, 1, plus de 5, non numérique) retombent sur la boîte neutre ; hors d'un bloc multicolonne, `+++` reste sans effet.

```markdown
::: columns 2
Première colonne avec du texte.

+++

La deuxième colonne commence ici.
:::
```

::: columns 2
Première colonne avec du texte.

+++

La deuxième colonne commence ici.
:::

Les contenus larges (tableaux, diagrammes, longues lignes de code) peuvent déborder d'une colonne ; sur les blocs très courts, l'équilibrage automatique peut paraître inégal. En mode Direct, le bloc apparaît comme conteneur neutre avec les lignes de marqueur visibles ; la mise en colonnes vaut pour la vue rendue et l'export PDF.

## Listes de définitions

Terme sur une ligne, définition en dessous introduite par `: ` ; `~` est aussi accepté comme marqueur. Plusieurs définitions par terme sont possibles.

```markdown
Cutover
: Bascule d'un système en exploitation productive.

Rollback
: Retour à l'état antérieur à la bascule.
```

Cutover
: Bascule d'un système en exploitation productive.

Rollback
: Retour à l'état antérieur à la bascule.

## Blocs de lignes

Les lignes commençant par `| ` conservent les retours à la ligne et les espaces de tête — pour les adresses et les poèmes.

```markdown
| Stumm-Consulting GmbH
|   4410 Liestal
|   Suisse
```

| Stumm-Consulting GmbH
|   4410 Liestal
|   Suisse

## Notes de bas de page

Trois formes : référence `[^id]` dans le texte avec une définition `[^id]: texte` (habituellement en fin de fichier), plus la forme en ligne `^[texte direct]` sans définition séparée. Le rendu affiche un chiffre en exposant ; les définitions se regroupent en bas de page avec des flèches de retour.

```markdown
Une affirmation avec source[^1] et une avec note en ligne^[notée directement].

[^1]: La définition se trouve en fin de fichier.
```

Une affirmation avec source[^1] et une avec note en ligne^[notée directement].

[^1]: La définition se trouve en fin de fichier.
