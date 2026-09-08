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

L'ancre ne se présente pas de la même façon selon la vue. La vue rendue ne l'affiche pas du tout — le bloc n'y est qu'une cible de saut. Le **mode direct** la remplace par un discret repère en fin de ligne : le survol indique l'identifiant, un clic place le curseur en fin de ligne et déplie le texte source pour l'édition. Si le curseur se trouve déjà dans la ligne, l'ancre reste visible comme d'habitude. Que le mode direct en montre plus que la vue rendue est voulu : une ancre est une adresse vers laquelle pointent d'autres documents, et lors d'une réorganisation il faut pouvoir voir qu'elle existe. Si le même bloc porte des [propriétés](block-properties.md), leur repère se place à côté.

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

**Où la cible est cherchée.** L'application cherche en trois étapes, de la même manière pour chaque type de fichier : d'abord le chemin relatif à votre propre fichier, puis l'écriture des sous-pages, enfin le simple **nom** dans tout l'espace. Ainsi `![[image.png]]` trouve le fichier même s'il se trouve dans un autre dossier — le chemin n'a pas besoin d'être exact. La recherche s'arrête à la racine de l'espace : ce qui est en dehors n'est pas incorporé. Sans espace lié, la limite reste le dossier de votre propre fichier.

Si un fichier Markdown porte le même nom qu'une pièce jointe, le fichier Markdown l'emporte ; écrit avec son extension (`![[image.png]]`), le cas est sans ambiguïté. Les images Markdown ordinaires `![](chemin.png)` ne sont pas concernées — leur écriture désigne un chemin et non un nom.
## Liens entre zones

Deux zones peuvent être liées afin qu'une référence franchisse la frontière de zone. Cela se configure sous **Paramètres → Zone actuelle → Liens entre zones** : on y indique le dossier de l'autre zone et un **préfixe** par lequel cette zone sera désignée.

Le préfixe ne vaut **que dans cette zone et que dans ce sens**. La façon dont l'autre zone désigne celle-ci se règle là-bas et peut différer. Lettres, chiffres, tiret et tiret bas sont autorisés ; la casse n'a pas d'importance.

Dans le texte, le préfixe précède la cible :

```markdown
[[@zt:Note]]             fichier « Note » dans la zone liée « zt »
[[@zt:Dossier/Note]]     cible par son chemin dans la zone liée
[[@zt:Note#Chapitre]]    avec une ancre, comme pour tout lien wiki
[[@zt:Note|Libellé]]     avec un texte affiché différent
```

La cible est d'abord cherchée au chemin indiqué puis, si rien ne s'y trouve, par son nom dans toute la zone liée — comme un lien wiki ordinaire dans votre propre zone. Un clic ouvre la cible dans la même fenêtre.

**Les modèles de la zone liée** peuvent être proposés à côté des vôtres ; un interrupteur existe par lien. La sélection de modèles montre alors les deux ensembles, et chaque entrée externe indique son origine. Sans cet interrupteur, un lien ne change pas l'ensemble des modèles.

### Lorsqu'une zone liée est introuvable

À l'ouverture, une zone vérifie ses liens, et un constat n'empêche jamais l'ouverture :

- **Le dossier a été déplacé** — son emplacement parent est accessible, le dossier lui-même non. Un message demande le nouveau chemin. Tant qu'il manque, les références utilisant ce préfixe sont considérées comme non valides et signalées dans l'éditeur.
- **L'emplacement de stockage est inaccessible**, par exemple parce qu'un lecteur est déconnecté. Seul un avis apparaît alors : le lien est conservé et **rien** n'est marqué comme non valide. Un lecteur déconnecté ne détruit jamais un lien.

Le nouveau chemin se saisit à l'endroit même où le lien est défini.

### Ce qui ne franchit pas la frontière

Un lien entre zones mène **là-bas**, pas en retour. Ne franchissent délibérément pas la frontière :

- les **rétroliens** — ils ne montrent que les références internes à votre zone,
- l'indicateur **« fichiers sans référence entrante »** des statistiques de zone,
- la **vue en graphe**,
- la **recherche à l'échelle de la zone**,
- et la **mise à jour des liens lors d'un renommage** : lorsqu'un fichier est renommé, les références venant d'une zone liée restent inchangées. L'éditeur les signale ensuite comme non valides — c'est le filet qui les rend visibles.

Les liens entre zones sont une [extension](extensions.md) et peuvent être désactivés. Une référence préfixée reste alors non résolue, la vérification à l'ouverture n'a pas lieu, et les liens saisis subsistent — ce qui est désactivé, c'est l'effet, pas la saisie.

## Tags

`#tag` dans le texte et le champ `tags:` du [frontmatter](frontmatter.md) sont reconnus comme tags ; les barres obliques créent des hiérarchies comme `#projet/markdown`. Les tags sont cliquables en vue Lecture et en mode Direct et filtrent la barre latérale des tags. Les codes couleur hexadécimaux, les nombres purs, les liens d'ancre et les dièses situés dans une adresse web sont exclus de la reconnaissance : dans `https://example.org/#chapitre`, `#chapitre` fait partie de l'adresse et n'est pas un tag.

```markdown
Statut : #projet/markdown #review
```

### Renommer un tag

Un clic droit sur une entrée de la barre latérale des tags renomme le tag dans toutes ses occurrences de la zone — dans le texte comme dans le champ `tags:`, dans tous les fichiers, y compris ceux qui ne sont pas ouverts.

**Les sous-tags suivent.** Si `#projet` devient `#travail`, alors `#projet/markdown` devient `#travail/markdown`. C'est voulu et non un effet de bord : les requêtes traitent un tag comme le préfixe de ses enfants, et un renommage sans eux briserait précisément ces requêtes. Un tag qui commence seulement par le même mot reste intact — `#projectile` n'est pas un enfant de `#projet`, la barre oblique manque.

**L'aperçu précède toute écriture.** Il liste chaque occurrence avec sa ligne, signale les sous-tags qui suivent et permet d'en désélectionner. Seule la confirmation dans le bandeau au-dessus de la liste écrit quoi que ce soit ; annuler laisse tout en l'état.

L'écriture reste dans les limites de la zone, et l'état précédent de chaque fichier modifié est déposé dans l'[historique de versions](history.md) — que l'historisation soit activée ou non. Un fichier avec des modifications non enregistrées reçoit le renommage dans son onglet plutôt que sur le disque ; un rapport final nomme chaque fichier et, le cas échéant, la raison de l'échec.

## Autocomplétion

Pendant la saisie en mode édition, un menu de suggestions s'ouvre :

- `[[` propose des noms de fichiers et des alias,
- `[[Fichier#` des ancres de titre, `[[Fichier#^` des identifiants de bloc,
- `#` dans le texte des tags connus.

Les flèches naviguent, Entrée ou Tab sélectionne, Échap ferme.

Tant que rien n'est saisi après `[[`, les fichiers de l'espace modifiés le plus récemment figurent en tête, le plus récent d'abord. Dès que l'on filtre, la qualité de correspondance reprend la tête ; la date de modification ne départage plus que les suggestions de même rang.

Après `#`, les tags les plus souvent attribués dans l’espace figurent en tête, le plus fréquent d’abord ; là aussi la qualité de correspondance prime dès que quelque chose est saisi, et la fréquence tranche alors entre égaux. Le nombre derrière chaque suggestion l’indique.

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
