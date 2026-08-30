# Liens

Liens wiki, ancres, incorporations et tags relient les fichiers Markdown en réseau. Les exemples de cette page montrent la syntaxe ; leurs cibles n'existent pas dans le manuel, dans vos propres fichiers les liens ouvrent le fichier cible dans un onglet.

## Liens wiki

`[[Cible]]` lie un fichier par son nom, sans chemin ni extension ; la recherche couvre le dossier du fichier et jusqu'à deux niveaux de sous-dossiers. L'extension `.md` peut être omise ou écrite.

```markdown
[[Plan projet]] ouvre plan projet.md depuis la portée de recherche.
[[Plan projet|le plan]] affiche un texte personnalisé.
```

Si le nom ne touche pas directement un fichier, deux replis s'appliquent : le résultat de l'index sur la portée de recherche et la [résolution d'alias](frontmatter.md) via le champ de frontmatter `aliases:` ; avec plusieurs candidats, un dialogue de sélection demande. Dans les cellules de tableaux pipe, échapper la barre du texte affiché avec `\|`.

## Ancres de titre et de bloc

Les liens peuvent pointer vers un titre ou un bloc du fichier cible :

```markdown
[[Plan projet#Jalons]]        saute au titre
[[Plan projet#^decision-1]]   saute à l'ancre de bloc
[[#Liens wiki]]               ancre dans le même document
```

Les ancres de bloc se posent avec `^id` en fin de ligne et ancrent le bloc englobant (paragraphe, élément de liste, tableau, bloc de code) :

```markdown
Cette décision est contraignante. ^decision-1
```

Les cibles d'ancres cassées sont signalées par le [linter Markdown](tools.md) dans l'éditeur.

## Liens Markdown vers des fichiers

Les liens Markdown classiques ouvrent aussi les cibles `.md` en onglet ; les ancres fonctionnent pareil. Les liens d'ancre internes au document sautent dans la page — en direct ici : [vers le chapitre Tags](#tags).

```markdown
[Plan](sous-dossier/plan-projet.md#jalons)
```

## Noms de fichiers avec espaces

Si un nom de fichier contient des espaces, la notation dépend du type de lien. Les liens wiki portent l'espace directement :

```markdown
[[Ma note]]
```

Les liens Markdown et image placent la cible entre chevrons ou encodent l'espace en `%20` :

```markdown
[Texte](<Ma note.md>)
![Alt](<Image 01.png>)
[Texte](Ma%20note.md)
```

Un espace brut sans chevrons met fin à la cible, de sorte que le lien n'est pas reconnu (CommonMark). Lors du renommage d'un fichier, la mise à jour des liens écrit les cibles avec espaces sous la forme `<…>` ; les cibles déjà encodées en `%` gardent leur forme.

## Incorporations wiki

`![[Cible]]` incorpore du contenu au lieu de lier :

```markdown
![[image.png]]           image, avec largeur en option : ![[image.png|300]]
![[notes.md]]            fichier Markdown en bloc rendu
![[manuel.pdf]]          PDF dans la visionneuse interactive
![[notes.md#Chapitre]]   seulement la section sous le titre
![[notes.md#^bloc]]      seulement le bloc ancré
```

Pour les ancres de bloc, le bloc englobant complet est incorporé (élément de liste avec sous-listes, bloc de code, ligne de tableau, citation). Le Markdown incorporé se rend avec sa propre source comme base ; les liens à l'intérieur se résolvent contre le fichier incorporé.

## Tags

`#tag` dans le texte et le champ `tags:` du [frontmatter](frontmatter.md) sont reconnus comme tags ; les barres obliques créent des hiérarchies comme `#projet/markdown`. Les tags sont cliquables en vue Lecture et en mode Direct et filtrent la barre latérale des tags. Les codes couleur hexadécimaux, les nombres purs et les liens d'ancre sont exclus de la reconnaissance.

```markdown
Statut : #projet/markdown #review
```

## Autocomplétion

Pendant la saisie en mode édition, un menu de suggestions s'ouvre :

- `[[` propose des noms de fichiers et des alias,
- `[[Fichier#` des ancres de titre, `[[Fichier#^` des identifiants de bloc,
- `#` dans le texte des tags connus.

Les flèches naviguent, Entrée ou Tab sélectionne, Échap ferme.

Tant que rien n'est saisi après `[[`, les fichiers de l'espace modifiés le plus récemment figurent en tête, le plus récent d'abord. Dès que l'on filtre, la qualité de correspondance reprend la tête ; la date de modification ne départage plus que les suggestions de même rang.

La validation d'une suggestion de fichier ou d'alias écrit aussi les crochets fermants et place le curseur derrière. S'ils sont déjà présents, aucune seconde paire n'apparaît.

## Barres latérales du réseau

Trois sections de barre latérale montrent le réseau du fichier actif : **Rétroliens** (liens entrants, y compris « via alias »), **Liens sortants** (toutes les références sortantes dans l'ordre du document) et **Tags** (tous les tags de la portée de recherche avec leur fréquence). Les accès figurent dans le [tableau des fonctionnalités](functions.md).

## Insérer une adresse dans une sélection

Lorsqu'un texte est sélectionné et que le presse-papiers contient une seule adresse, le collage crée un lien à partir des deux au lieu de remplacer la sélection. La sélection `Page du projet` et l'adresse `https://example.org` donnent :

```markdown
[Page du projet](https://example.org)
```

Si l'adresse contient des espaces ou des parenthèses, la cible est écrite entre chevrons ; une adresse `www.` reçoit le préfixe `https://` :

```markdown
[Entrée](<https://example.org/Titre_(Complement)>)
```

Sans sélection, avec un contenu du presse-papiers qui n'est pas reconnaissable comme une adresse unique, et à l'intérieur des zones de code source, le collage normal s'applique. Une seule annulation rétablit entièrement l'état précédent. L'accès et l'interrupteur figurent dans le [tableau des fonctions](functions.md).
