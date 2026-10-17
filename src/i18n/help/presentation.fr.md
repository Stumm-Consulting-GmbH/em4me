# Présentation

Une **présentation** est un document Markdown ordinaire dont le contenu est divisé en **diapositives**. L'application l'affiche diapositive par diapositive dans la vue **Diapositives**, la projette en plein écran ou dans une fenêtre séparée, offre à l'orateur un **mode présentateur** avec notes et minutage, et exporte les diapositives en PDF ou en pages HTML.

La présentation est une **autre vue du même document** et non un format de fichier propre. On écrit dans les vues Markdown ; la vue **Diapositives** ne fait qu'afficher et ne modifie jamais le texte. Seule exception : la boîte de dialogue **Mise en forme de cette présentation…**, qui écrit sur demande la mise en forme dans l'en-tête du fichier.

## À quoi se reconnaît une présentation

À l'**indicateur** `presentation: true` dans l'en-tête du document :

```markdown
---
presentation: true
---

# Titre de la première diapositive
```

La valeur doit être `true` ; `presentation: false`, un texte comme `"true"` ou une clé absente ne font pas un document de présentation. `marp: true` est reconnu de la même façon, afin que les présentations issues d'un autre outil de diapositives s'ouvrent ici sans transformation (voir « Compatibilité avec d'autres outils » plus bas). L'application n'écrit jamais cette clé elle-même.

Un document sans indicateur reste un document ordinaire : `---` y est une ligne horizontale comme partout.

## Créer une présentation

**Affichage → Présentation → Nouvelle présentation** crée un nouveau document, encore sans nom, et l'ouvre aussitôt dans la vue **Diapositives**. Il porte l'indicateur, le thème `light` et le numéro de page, ainsi que trois diapositives d'exemple : une diapositive de titre, une diapositive avec une liste et une note de l'orateur, et une diapositive qui montre l'écriture pour une image et un texte côte à côte. Il s'enregistre comme tout nouveau document, au premier enregistrement. La commande figure aussi dans la palette de commandes (`Ctrl+K` par défaut).

Pour faire d'un document existant une présentation, on ajoute soi-même l'indicateur dans son en-tête.

## Séparer les diapositives

Une ligne de trois tirets `---` sépare deux diapositives, exactement là où elle est une ligne horizontale selon CommonMark. Le plus sûr est de l'entourer d'une ligne vide avant et après :

```markdown
# Première diapositive

Texte de la première diapositive.

---

# Deuxième diapositive
```

**Ce qui ne sépare pas :**

- `---` directement sous une ligne de texte : c'est un soulignement de titre (Setext) et non une ligne.
- `---` dans un bloc de code, dans une citation, en retrait dans un élément de liste ou précédé de quatre espaces.
- `---` dans un commentaire.
- Les deux lignes qui encadrent l'en-tête.
- `***` et `___` : elles restent des lignes **sur** la diapositive, afin qu'une diapositive puisse porter elle-même une ligne de séparation.

La ligne de séparation n'appartient à aucune diapositive. Deux lignes de séparation à la suite donnent une diapositive vide, de même qu'une ligne de séparation juste après l'en-tête ou à la fin du document ; un document sans ligne de séparation est une seule diapositive.

### Séparer aux titres

Avec la clé `headingDivider` dans l'en-tête, une nouvelle diapositive commence en plus **avant chaque titre** jusqu'au niveau indiqué. La valeur est un nombre de 1 à 6 :

```markdown
---
presentation: true
headingDivider: 2
---

# Première partie

## Un sous-point

## Encore un sous-point
```

Ici, chaque titre des niveaux 1 et 2 donne sa propre diapositive, soit trois diapositives sans une seule ligne de séparation. Le titre se place en haut de sa nouvelle diapositive. Si rien d'autre que des lignes vides et des commentaires ne le précède sur la diapositive, aucune diapositive supplémentaire ne commence ; lignes de séparation et titres peuvent donc se mélanger sans créer de diapositives vides. Les titres dans les blocs de code, les citations et les listes ne séparent pas.

L'indication vaut pour toute la série de diapositives, même lorsqu'elle figure dans un commentaire plus bas (voir « Indications par diapositive ») ; s'il y en a plusieurs, la dernière s'applique. Une valeur non valide est ignorée, et la ligne d'indication la cite. L'écriture en liste, par exemple `[1, 3]`, reste sans effet.

## L'en-tête : les clés de pilotage

Outre l'indicateur, l'en-tête accepte six clés de pilotage, toutes facultatives :

| Clé | Effet | Par défaut |
| --- | ----- | ---------- |
| `theme` | apparence des diapositives : `light`, `dark`, `accent` ou le nom d'un thème propre, au choix avec des valeurs propres (voir plus bas) | `light` |
| `paginate` | `true` affiche le numéro de page en bas à droite de chaque diapositive | `false` |
| `header` | texte de l'en-tête de page sur chaque diapositive | aucun |
| `footer` | texte du pied de page sur chaque diapositive | aucun |
| `size` | format des diapositives : `16:9` ou `4:3` | `16:9` |
| `headingDivider` | nombre de 1 à 6 : chaque titre jusqu'à ce niveau commence une nouvelle diapositive (voir plus haut) | aucun |

Un en-tête complet :

```markdown
---
presentation: true
theme: dark
paginate: true
header: Rapport trimestriel
footer: "**Service commercial** · interne"
size: 4:3
---
```

Les autres clés de l'en-tête, comme `title` ou `tags`, restent intactes et agissent comme dans tout autre document. Si une valeur n'est pas valide, la valeur par défaut s'applique. Pour un thème inconnu ou non valide, pour un format inconnu et pour une valeur non valide de `headingDivider`, une **ligne d'indication** au-dessus de la diapositive en donne la raison. Thème, couleurs, en-tête, pied de page et numéro de page peuvent être indiqués autrement pour certaines diapositives (voir « Indications par diapositive »).

## Apparence

### Les trois thèmes

| Thème | Aspect |
| ----- | ------ |
| `light` | texte foncé sur blanc, accent en bleu |
| `dark` | texte clair sur presque noir, accent en bleu clair |
| `accent` | texte blanc sur bleu soutenu, accent en jaune |

Les diapositives ont le même aspect sous chaque jeu de couleurs de l'application : le thème appartient à la présentation, pas à l'interface. Qui a souvent besoin d'une même apparence la crée comme **thème propre** et la choisit par son nom (voir « Thèmes propres »).

### Remplacer des valeurs isolées

Au lieu d'un nom, `theme` porte un bloc. L'entrée `name` choisit le thème de base (sans `name`, c'est `light`) ; les autres entrées remplacent des valeurs isolées :

```yaml
theme:
  name: dark
  accent: "#ff6b6b"
  font: Georgia, serif
```

| Entrée | Effet |
| ------ | ----- |
| `background` | arrière-plan de la diapositive |
| `text` | couleur du texte courant |
| `heading` | couleur des titres |
| `accent` | couleur des liens et des barres de citation |
| `font` | police de la diapositive |
| `header-footer` | couleur de l'en-tête et du pied de page |
| `page-number` | couleur du numéro de page |

Sont permis les couleurs, les dégradés et les listes de polices dans l'écriture CSS. Une valeur qui chargerait un fichier ou une adresse n'est pas reprise. Une entrée inconnue est ignorée, une valeur non valide est remplacée par celle du thème ; la ligne d'indication signale les deux. Les blocs de code et les surlignages suivent la luminosité du thème de base ; si vous modifiez fortement l'arrière-plan, choisissez un thème de base clair ou sombre en conséquence.

### Image d'arrière-plan et partage en deux

Une image devient l'arrière-plan de la diapositive lorsque le premier mot de son texte alternatif est `bg` :

```markdown
![bg](images/paysage.jpg)
![bg contain](images/graphique.png)
![bg left:40%](images/portrait.jpg)
```

| Écriture | Effet |
| -------- | ----- |
| `bg` ou `bg cover` | remplit la diapositive ; ce qui dépasse est rogné |
| `bg contain` ou `bg fit` | montre l'image entière ; les zones libres montrent l'arrière-plan de la diapositive |
| `bg auto` | montre l'image à sa propre taille |
| `bg 50%` | montre l'image à la taille indiquée |
| `bg left`, `bg right` | **partage en deux** : l'image remplit la moitié gauche ou droite, le texte passe de l'autre côté |
| `bg left:40%`, `bg right:33%` | partage en deux avec une largeur propre du côté image |

Plusieurs images d'arrière-plan d'une même diapositive se placent côte à côte, avec `vertical` sur la première image l'une au-dessus de l'autre ; en partage en deux, elles se répartissent le côté image. L'en-tête, le pied de page et le numéro de page se trouvent alors du côté texte. Une image qui ne peut pas être chargée, par exemple parce que son fichier manque, est omise ; la diapositive apparaît sans elle. Les images d'arrière-plan se chargent par le même chemin que toute autre image du document et suivent les mêmes règles.

### Diapositives trop pleines

Chaque diapositive a un format fixe, 16:9 ou 4:3, et s'ajuste uniformément à la surface disponible ; le texte grandit et rétrécit avec elle. Si le contenu d'une diapositive ne tient pas, il est **réduit automatiquement** jusqu'à ce qu'il tienne, au plus jusqu'à la moitié de sa taille. L'en-tête, le pied de page et le numéro de page gardent leur taille, et la marge de la diapositive reste la même. La réduction agit partout de la même façon : dans la vue, dans le diaporama et le mode présentateur, dans la vue d'ensemble et dans les deux exports.

Seul ce qui ne tient pas même à demi-taille est coupé au bord, et une **barre hachurée** au bord inférieur signale la diapositive trop pleine. La barre n'apparaît ni dans le diaporama ni dans les exports. Le remède est une diapositive de plus.

## Thèmes propres

Un **thème propre** est une apparence nommée qui s'appuie sur l'un des trois thèmes fournis et définit autrement certaines des sept valeurs. Il vaut dans toute présentation qui le nomme dans l'en-tête :

```yaml
theme: Entreprise
```

Le nom est trouvé sans tenir compte des majuscules et des minuscules ; `theme: entreprise` choisit donc aussi le thème « Entreprise ». Comme tout autre thème, un thème propre peut servir de base à un bloc dont l'entrée `name` le nomme. Si le thème nommé n'existe pas, par exemple sur un autre ordinateur, les diapositives apparaissent dans le thème `light`, et la ligne d'indication cite le nom.

Les thèmes propres font partie des paramètres de l'application, pas du fichier. Ils valent dans toutes les fenêtres et voyagent avec le fichier de votre configuration (voir [Exporter et importer les paramètres](setup-exchange.md)).

### La section « Thèmes de diapositives » des paramètres

Sous **Fichier → Paramètres… → Thèmes de diapositives**, dans le bloc « Extensions (internes) », se gèrent les thèmes propres :

- **Nouveau** crée un thème qui s'appuie sur l'apparence `light`, `dark` ou `accent` choisie sous **Modèle** ; il s'appelle d'abord « Nouveau thème ».
- **Dupliquer** crée une copie du thème choisi, **Supprimer** l'enlève.
- Le champ **Nom** renomme le thème. Un nom ne doit pas être vide, ne doit pas appartenir à un thème fourni et ne doit pas être déjà pris, pas même avec d'autres majuscules et minuscules ; une infraction est signalée aussitôt, et Appliquer et OK restent bloqués tant qu'elle n'est pas corrigée.

En dessous figurent les sept valeurs du tableau « Remplacer des valeurs isolées », une ligne chacune : les couleurs ont un sélecteur de couleur et un champ de texte qui accepte toute écriture CSS, la police un champ de texte avec des suggestions. **Réinitialiser** ramène une ligne à la valeur du thème de base. Une valeur non valide est marquée et n'est pas reprise. Une **diapositive d'aperçu** montre l'apparence à chaque saisie. On enregistre avec **Appliquer** ou **OK** ; la modification agit aussitôt dans toutes les présentations ouvertes.

### Mise en forme de cette présentation

**Affichage → Présentation → Mise en forme de cette présentation…** règle l'apparence d'un seul fichier sans écrire l'en-tête à la main. La commande est proposée pour toute présentation modifiable, quelle que soit la vue dans laquelle elle est affichée, et figure dans la palette de commandes.

En haut, la boîte de dialogue indique le thème, choisi parmi les thèmes fournis et propres ; un nom inconnu venant de l'en-tête reste sélectionnable sous la forme « Nom (inconnu) ». En dessous, elle indique pour chaque valeur si elle vaut **comme le thème**, avec la valeur du thème entre parenthèses, ou comme **valeur propre**. Une saisie met la ligne sur « valeur propre », **Réinitialiser** la ramène à « comme le thème ».

**OK** écrit le choix dans l'en-tête du fichier : sans valeurs propres sous la forme `theme:` avec le nom, sinon sous la forme d'un bloc avec `name:` et les valeurs propres. L'étape s'annule d'un seul coup. Les autres entrées de l'en-tête restent inchangées, et qui n'a rien modifié ne modifie rien au fichier. Si le document a changé pendant que la boîte de dialogue était ouverte, rien n'est écrit, et la barre d'état le signale.

Deux autres boutons vont au-delà du fichier isolé :

- **Enregistrer comme thème…** demande un nom, crée un thème propre à partir du thème choisi et des valeurs propres, et n'écrit plus dans le fichier que `theme:` avec ce nom. Si l'on annule la saisie du nom, tout reste en l'état.
- **Copier les valeurs du thème dans le fichier** est proposé avec un thème propre. Il écrit les sept valeurs sous forme de bloc dans l'en-tête, en s'appuyant sur le thème fourni sous-jacent. Le fichier garde ainsi le même aspect même là où le thème propre n'existe pas, par exemple après l'avoir transmis à d'autres.

## Numéro de page, en-tête et pied de page

`paginate: true` affiche sur chaque diapositive son numéro en bas à droite. `header` et `footer` placent une ligne en haut ou en bas de chaque diapositive ; une mise en forme simple comme le gras, l'italique ou un lien apparaît mise en forme. Une valeur vide n'affiche aucune ligne, un texte trop long se termine par des points de suspension. Dans l'en-tête, ces indications valent de la même façon pour toutes les diapositives ; pour certaines diapositives, elles peuvent être définies autrement (voir « Indications par diapositive »).

## Indications par diapositive

Certaines diapositives peuvent avoir une autre apparence que les autres. Il suffit d'y placer un commentaire HTML avec une ou plusieurs clés :

```markdown
# Point d'étape

<!-- _backgroundColor: "#fff3bf" -->
<!-- _paginate: false -->
```

**La portée dépend du trait de soulignement :**

- Avec `_` devant la clé, l'indication vaut **pour cette diapositive seulement**.
- Sans `_`, elle vaut **à partir de cette diapositive** pour toutes les suivantes, jusqu'à une nouvelle indication de la même clé.
- Seule `headingDivider` vaut toujours pour toute la série de diapositives (voir « Séparer aux titres »).

**Ces clés sont interprétées :**

| Clé | Effet |
| --- | ----- |
| `theme` | change de thème, avec le nom d'un thème fourni ou propre |
| `backgroundColor`, `backgroundImage` | arrière-plan de la diapositive, par exemple une couleur ou un dégradé |
| `color` | couleur du texte courant |
| `header`, `footer` | texte de l'en-tête et du pied de page ; un texte vide masque la ligne |
| `paginate` | `true` affiche le numéro de page, `false` le masque et continue de compter, `hold` l'affiche sans continuer de compter, `skip` le masque sans continuer de compter |
| `background`, `text`, `heading`, `accent`, `font`, `header-footer`, `page-number` | les sept valeurs du tableau « Remplacer des valeurs isolées » |

Un changement de thème remplace le thème ainsi que les valeurs propres du bloc de l'en-tête ; couleurs et police définies par commentaire continuent de valoir au-delà du changement. Les valeurs qui chargeraient un fichier ou une adresse ne sont pas reprises, comme dans l'en-tête ; une image d'arrière-plan s'indique avec l'écriture `bg` (voir « Image d'arrière-plan et partage en deux »). Si une valeur n'est pas valide ou un thème inconnu, la valeur précédente continue de valoir, et la ligne d'indication en donne la raison sur cette diapositive.

De tels commentaires ne sont pas des notes de l'orateur. D'autres clés de la même écriture, comme `class` ou `style`, restent dans le document mais n'ont pas d'effet ici (voir « Compatibilité avec d'autres outils »).

## Notes de l'orateur

Les commentaires d'une diapositive sont ses **notes de l'orateur**. Les deux formes sont valables :

```markdown
# Résultats

- Chiffre d'affaires en hausse
- Coûts en baisse

%% Citer ici les chiffres de l'année précédente. %%

<!-- En cas de questions, renvoyer à l'annexe. -->
```

Les notes n'apparaissent ni sur la diapositive ni dans le diaporama. Le **mode présentateur** les montre à l'orateur, mises en forme comme du texte sur une diapositive, donc avec gras, italique, listes et liens ; du HTML dans une note y apparaît comme texte. Dans le PDF et les pages HTML, elles n'apparaissent que si elles sont activées (voir « Inclure les notes de l'orateur »). Dans l'éditeur, elles restent visibles. Si l'extension « Commentaires » est désactivée, `%%` est du texte ordinaire et apparaît sur la diapositive ; les commentaires HTML restent alors des notes. Les commentaires privés avec `%%` sont décrits sur la page [Constructions en ligne](inline.md).

## La vue « Diapositives »

La présentation est le huitième mode de vue, à côté de Rendu, Scindée, Source, Direct, Carte mentale, Canevas et Tableau : **Affichage → Diapositives**, le bouton **Diapositives** dans la barre d'état ou `Ctrl+8` par défaut. Comme pour les autres modes, le choix vaut par document ouvert et il est rétabli au démarrage suivant.

**Le mode dépend du document.** Il n'est sélectionnable que pour un document portant l'indicateur. Sinon, le bouton et l'entrée de menu restent visibles et atténués, et le titre du bouton en donne la raison : « Ce document n'est pas une présentation ». Un document affiché dans la vue **Diapositives**, ou qui y était ouvert à la fermeture, et qui ne porte plus l'indicateur apparaît dans la vue de lecture.

La vue montre une diapositive, au-dessus le compteur, par exemple « 3 / 12 », et les boutons **Précédente**, **Suivante** et **Lancer le diaporama**. Au passage dans la vue, c'est la diapositive où se trouve le curseur qui s'affiche. Ce qui est montré est toujours l'état actuel du document, y compris les modifications non enregistrées.

**Faire défiler** se fait avec les boutons, avec la **molette de la souris** au-dessus de la diapositive (vers le bas pour avancer, vers le haut pour reculer, une diapositive par mouvement de molette) et au clavier, dès que la surface des diapositives a le focus :

| Touche | Effet |
| ------ | ----- |
| `Flèche droite`, `Page suiv.`, `Espace` | diapositive suivante |
| `Flèche gauche`, `Page préc.`, `Maj+Espace` | diapositive précédente |
| `Origine`, `Fin` | première ou dernière diapositive |

À la première et à la dernière diapositive, le défilement s'arrête.

## Vue d'ensemble des diapositives

**Affichage → Présentation → Vue d’ensemble des diapositives** montre dans la vue **Diapositives** toutes les diapositives sous forme de **grille**, chacune en petite image avec son numéro. Au départ, la diapositive que la vue affiche est sélectionnée.

| Saisie | Effet |
| ------ | ----- |
| `Flèche gauche`, `Flèche droite` | une diapositive en arrière ou en avant |
| `Flèche haut`, `Flèche bas` | une ligne de la grille vers le haut ou vers le bas |
| `Origine`, `Fin` | première ou dernière diapositive |
| Clic, `Entrée`, `Espace` | passer à la diapositive choisie et fermer la vue d'ensemble |
| `Échap` | fermer la vue d'ensemble sans changer de diapositive |

La molette de la souris fait défiler la grille. Un second appel de la commande ferme aussi la vue d'ensemble, de même que le lancement d'un diaporama. La vue d'ensemble montre l'état au moment de l'ouverture ; une nouvelle ouverture montre les modifications du document. La commande figure aussi dans la palette de commandes.

## Diaporama

Le diaporama montre la présentation en **plein écran** : la fenêtre passe en plein écran, toutes les barres de l'application disparaissent et l'on ne voit plus que la diapositive, aussi grande que l'écran le permet. Il se lance dans la vue **Diapositives** :

- par **Affichage → Présentation → Lancer le diaporama**,
- avec `F5` par défaut,
- avec le bouton **Lancer le diaporama** au-dessus de la diapositive.

La palette de commandes propose aussi la commande. Le diaporama commence à la diapositive que la vue affiche à ce moment. On fait défiler avec les mêmes touches que dans la vue ; en plus, un **clic de souris** passe à la diapositive suivante, et la **molette de la souris** avance ou recule d'une diapositive par mouvement, vers le bas pour avancer et vers le haut pour reculer. Les listes dont les éléments doivent apparaître pas à pas sont décrites sous « Dévoiler les listes élément par élément ».

On le **quitte** avec `Échap`. Il se termine aussi lorsque le plein écran est quitté d'une autre manière, lorsqu'une autre fenêtre passe au premier plan ou lorsque le document ou la vue change. Ensuite, la vue reste sur la dernière diapositive affichée. La fenêtre quitte à nouveau le plein écran, sauf si elle y était déjà avant le diaporama.

Ce diaporama se déroule toujours dans la fenêtre de l'application, même lorsqu'un second écran est branché. Pour présenter avec un projecteur ou un second écran, il existe le diaporama dans une fenêtre séparée et le mode présentateur (voir « Présenter avec deux écrans »).

## Dévoiler les listes élément par élément

Les éléments d'une liste peuvent être **dévoilés un par un** dans le diaporama. Ce qui compte, c'est l'écriture de la liste :

```markdown
* apparaît à la première étape
* apparaît à la deuxième étape

1) les listes numérotées aussi
2) avec une parenthèse au lieu d'un point

- apparaît aussitôt
1. apparaît aussi aussitôt
```

Les éléments avec `*` et les éléments numérotés avec `)` sont dévoilés, les éléments avec `-` ou `+` et les éléments numérotés avec `.` sont là d'emblée. Chaque élément est une étape, un élément en retrait aussi ; un élément en retrait reste masqué tant que son élément parent l'est.

Dans le diaporama, en plein écran comme dans une fenêtre séparée, et dans le mode présentateur, « suivant » dévoile l'élément suivant, et ce n'est qu'après le dernier que vient la diapositive suivante ; « précédent » masque à nouveau le dernier élément dévoilé. Une diapositive atteinte en reculant apparaît complète, une diapositive atteinte en avançant avec ses éléments masqués. Les éléments masqués gardent leur place, si bien que la diapositive ne saute pas pendant le dévoilement.

Dans la vue **Diapositives**, dans la vue d'ensemble, dans l'aperçu de la diapositive suivante et dans les deux exports, tous les éléments apparaissent d'emblée.

## Présenter avec deux écrans

Pour un exposé avec un projecteur ou un second écran, une **fenêtre séparée** ne montre au public que la diapositive, tandis que la fenêtre de l'application reste utilisable. Les deux commandes sont proposées dans la vue **Diapositives**, dans le sous-menu **Affichage → Présentation** et dans la palette de commandes ; elles n'ont pas de raccourci par défaut, mais on peut leur en attribuer un sous Paramètres → Raccourcis clavier.

**L'écran :** si deux écrans ou plus sont branchés, la fenêtre s'ouvre en plein écran sur un écran où ne se trouve pas la fenêtre de l'application. Avec un seul écran, elle s'ouvre comme fenêtre ordinaire, que l'on peut déplacer et redimensionner. La fenêtre n'a ni menu ni onglets, ne compte pas parmi les fenêtres de l'application et ne revient pas après un redémarrage.

### Diaporama dans une fenêtre séparée

**Affichage → Présentation → Diaporama dans une fenêtre séparée** ouvre la fenêtre destinée au public et y montre la diapositive que la vue affiche. On fait défiler dans les deux fenêtres avec les mêmes touches que dans la vue ; dans la fenêtre du public, le clic et la molette de la souris font aussi défiler. Les deux fenêtres montrent toujours la même diapositive. Les modifications du document apparaissent aussitôt aussi pour le public.

On le **quitte** avec `Échap` dans l'une des deux fenêtres, avec **Affichage → Présentation → Quitter le diaporama** ou en fermant la fenêtre du public. Il se termine aussi lorsque le document n'est plus affiché dans la vue **Diapositives**. Un seul diaporama se déroule à la fois.

### Mode présentateur

**Affichage → Présentation → Mode présentateur** lance le diaporama dans une fenêtre séparée et fait de la fenêtre de l'application la place de l'orateur. On y trouve :

- à gauche la **diapositive actuelle**, telle que le public la voit ;
- en haut à droite la **diapositive suivante**, sur la dernière diapositive le mot « Fin » à la place ;
- en dessous, les **notes de l'orateur** de la diapositive actuelle, mises en forme et défilables pour les notes longues ; sans notes, une courte indication ;
- en dessous, le **temps écoulé** depuis le lancement et l'**heure**, avec les boutons **Pause** ou **Reprendre** et **Réinitialiser**.

Au-dessus des deux se trouvent comme d'habitude le compteur et les boutons **Précédente** et **Suivante**. Le temps démarre avec le lancement du mode présentateur ; **Réinitialiser** le remet à zéro, un temps qui court continue ensuite de courir, un temps en pause reste en pause.

On fait défiler comme dans le diaporama dans une fenêtre séparée, dans les deux fenêtres avec les mêmes touches ; les listes à dévoiler se dévoilent pas à pas avec « suivant ». Si le document est modifié pendant l'exposé, diapositive actuelle, diapositive suivante et notes suivent aussitôt ; si la diapositive affichée disparaît, la vue se place sur la dernière qui reste.

On **quitte** le mode présentateur par les mêmes moyens que le diaporama dans une fenêtre séparée. Ensuite, le temps disparaît, et la vue **Diapositives** reste sur la dernière diapositive affichée.

## Exporter les diapositives

Les deux exports se trouvent sous **Fichier → Autres fonctions de fichier → Exporter** et dans la palette de commandes. Ils sont proposés pour tout document de présentation, quelle que soit la vue dans laquelle il est affiché ; pour un document sans indicateur, ils restent atténués. Chaque diapositive y apparaît telle que la vue la montre, avec thème, indications par diapositive, images d'arrière-plan, numéro de page, en-tête et pied de page, diagrammes et formules, mais sans la barre des diapositives trop pleines. Les notes de l'orateur ne sont incluses que si elles sont activées (voir plus bas). Si l'on annule la boîte de dialogue, rien n'est créé. Après l'export, la barre d'état indique le nombre de diapositives et, si quelque chose a été omis, quoi.

### En PDF

**Exporter les diapositives en PDF…** demande la cible, en proposant le nom du document avec l'extension `.pdf` dans le même dossier, et écrit un fichier PDF avec **une diapositive par page**. La page a le format de la diapositive, 16:9 ou 4:3, et aucune marge. Les réglages de format de papier et de marges de l'export PDF ordinaire n'ont pas d'effet ici.

### En pages HTML

**Exporter les diapositives en HTML…** demande un dossier et y crée **une page HTML par diapositive** : `folie-001.html`, `folie-002.html` et ainsi de suite, plus `index.html` comme page de départ avec la première diapositive. Si le dossier choisi est vide ou contient un export antérieur, les pages y sont créées ; sinon un sous-dossier portant le nom du document et le suffixe `-diapositives` est créé, et les fichiers déjà présents restent intacts.

Tout navigateur ouvre les pages, sans l'application et sans connexion réseau. Chaque page est complète à elle seule : images, diagrammes et formules y sont intégrés, si bien que le dossier peut être déplacé ou transmis en entier. Sous la diapositive se trouvent **Précédente**, le compteur et **Suivante**, dans la langue qu'avait l'interface au moment de l'export ; on fait aussi défiler avec les mêmes touches que dans le diaporama, et la diapositive s'adapte à la taille de la fenêtre du navigateur. Les liens et les images suivent les règles de l'export HTML d'un document (voir [Outils](tools.md)) : un lien vers un autre document reste du texte, et une image qui ne peut pas être intégrée apparaît sous la forme de son texte ; une telle image d'arrière-plan est omise.

### Inclure les notes de l'orateur

L'interrupteur **Inclure les notes de l'orateur** sous **Fichier → Paramètres… → Export**, groupe **Diaporama**, décide si les notes vont dans l'export. Il est désactivé au départ, afin qu'une transmission n'emporte jamais de notes à votre insu, et vaut pour les deux exports.

- **Dans le PDF**, chaque diapositive avec notes est suivie d'une **page de notes** au format de la diapositive, intitulée « Diapositive N – Notes », et en dessous les notes mises en forme sur fond blanc. Les notes plus longues continuent sur d'autres pages du même format.
- **Dans les pages HTML**, chaque diapositive avec notes porte, entre la diapositive et la barre de défilement, une zone **Notes** repliée. Dépliée, elle se pose sur la diapositive, au plus jusqu'à la moitié de la hauteur de la fenêtre du navigateur, et peut défiler.

Les diapositives sans notes n'ont ni page ni zone de notes. Interrupteur activé, le message après l'export indique le nombre de notes incluses ; désactivé, il signale que les notes de l'orateur ne sont pas incluses.

## L'extension « Vue présentation »

La fonction fait partie des [extensions internes](extensions.md) (« Vue présentation », groupe « Rendu ») et du mode de travail **Avancé** : en mode **Débutant** elle est désactivée, en **Avancé** et **Complet** elle est activée.

Désactivée, la vue **Diapositives**, le sous-menu **Présentation** du menu **Affichage** avec toutes ses commandes, les deux commandes d'export, leurs entrées dans la palette de commandes et les raccourcis, ainsi que la section **Thèmes de diapositives** des paramètres disparaissent. L'indicateur n'a alors aucun effet : un document de présentation est un document Markdown ordinaire, et `---` y est une ligne horizontale. Un document ouvert dans la vue **Diapositives** apparaît dans la vue de lecture. Rien ne se perd, et la désactivation comme la réactivation n'écrivent jamais rien ; après la réactivation, la présentation et les thèmes propres sont là, inchangés.

## Compatibilité avec d'autres outils

L'indicateur, les clés de pilotage, les lignes de séparation, les indications par diapositive et l'écriture d'image avec `bg` suivent un outil répandu qui crée des diapositives à partir de Markdown et marque ses fichiers par `marp: true`. La compatibilité est un engagement explicite : une présentation écrite là-bas s'ouvre ici comme présentation, sans qu'il faille rien changer au fichier.

**Ce qui vaut ici comme là-bas :**

- l'indicateur `marp: true` et la séparation à `---` ;
- les clés `paginate`, `header`, `footer` et `size` dans l'en-tête et `headingDivider` avec un nombre ;
- les indications par diapositive dans la même écriture, avec `_` pour la seule diapositive concernée et sans `_` à partir de cette diapositive, pour `backgroundColor`, `backgroundImage`, `color`, `header`, `footer` et `paginate` ;
- l'écriture d'image `![bg …](…)` avec le partage en deux ;
- les listes avec `*` et avec `1)`, dont les éléments apparaissent un par un dans le diaporama ;
- les commentaires HTML comme notes de l'orateur. Les commentaires portant des indications par diapositive ne comptent comme notes ni ici ni là-bas.

**Où l'application diffère :**

- **`***` et `___` ne séparent pas de diapositives ici.** L'autre outil commence aussi une nouvelle diapositive à ces lignes. Qui veut un fichier découpé de la même façon dans les deux outils sépare uniquement avec `---` et n'écrit pas de ligne sur une diapositive avec `***` ou `___`.
- **L'autre outil ne connaît pas les notes `%%`** et les affiche comme texte sur la diapositive. Qui a besoin de notes dans les deux outils les écrit comme commentaire HTML `<!-- … -->` ; celles-ci valent dans les deux sens.
- **Les thèmes de l'autre outil n'existent pas ici.** `default`, `gaia` et `uncover` sont inconnus ici ; les diapositives apparaissent alors dans le thème `light`, et la ligne d'indication cite le nom. Un **thème propre** peut toutefois porter exactement ce nom et s'applique alors : qui crée un thème propre nommé `gaia` voit le fichier ici dans cette apparence, sans le modifier.
- **`theme` dans un commentaire vaut ici à partir de sa diapositive.** L'autre outil applique toujours un thème à toute la série de diapositives. Qui veut voir un fichier de la même façon dans les deux outils choisit le thème dans l'en-tête.
- **Certaines indications par diapositive restent sans effet :** `class`, `style`, `backgroundPosition`, `backgroundRepeat` et `backgroundSize`, ainsi que `lang` et `math`. Elles restent dans le document et ne sont pas exécutées, sans indication. Une image d'arrière-plan via `backgroundImage` avec un fichier ou une adresse n'est pas chargée ; pour cela existe l'écriture `bg`.
- **`headingDivider` sous forme de liste**, par exemple `[1, 3]`, reste sans effet ; un fichier qui l'utilise donne ici moins de diapositives.
- **Le commentaire `<!-- fit -->`**, par lequel l'autre outil amène un titre à la largeur de la diapositive, reste sans effet. Ici, une diapositive trop pleine est réduite dans son ensemble.

**À noter par ailleurs :**

- L'application n'écrit jamais `marp: true` elle-même. Qui veut projeter son fichier aussi dans l'autre outil l'ajoute en plus de `presentation: true`.
- Le bloc sous `theme:` avec des valeurs propres et les sept valeurs comme indication par diapositive, par exemple `<!-- accent: "#ff6b6b" -->`, sont une écriture de cette application.
- Le mot `bg` doit ici être le **premier** mot du texte alternatif. Les mots suivants, comme des filtres d'image, ne sont pas interprétés.

## Limites

- **Les exports sont le PDF et les pages HTML.** Aucun fichier au format pptx n'est créé.
- **L'apparence passe par les thèmes et leurs sept valeurs.** Des règles de style propres en CSS, des mises en page au-delà du partage en deux, ainsi que des animations et des transitions entre diapositives n'existent pas.
- **Seuls les éléments de liste se dévoilent**, aucune autre partie d'une diapositive.
- **La réduction va au plus jusqu'à la moitié.** Ce qui ne tient toujours pas est coupé.
- **On modifie dans les vues Markdown**, pas sur la diapositive.

L'export en fichier pptx est prévu pour une étape d'extension ultérieure.
