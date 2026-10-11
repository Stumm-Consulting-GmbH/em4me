# Présentation

Une **présentation** est un document Markdown ordinaire dont le contenu est divisé en **diapositives**. L'application l'affiche diapositive par diapositive dans la vue **Diapositives**, la projette en plein écran et exporte les diapositives en PDF ou en pages HTML.

La présentation est une **autre vue du même document** et non un format de fichier propre. On écrit dans les vues Markdown ; la vue **Diapositives** ne fait qu'afficher et ne modifie jamais le texte.

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

## L'en-tête : les clés de pilotage

Outre l'indicateur, l'en-tête accepte cinq clés de pilotage, toutes facultatives :

| Clé | Effet | Par défaut |
| --- | ----- | ---------- |
| `theme` | apparence des diapositives : `light`, `dark` ou `accent`, au choix avec des valeurs propres (voir plus bas) | `light` |
| `paginate` | `true` affiche le numéro de page en bas à droite de chaque diapositive | `false` |
| `header` | texte de l'en-tête de page sur chaque diapositive | aucun |
| `footer` | texte du pied de page sur chaque diapositive | aucun |
| `size` | format des diapositives : `16:9` ou `4:3` | `16:9` |

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

Les autres clés de l'en-tête, comme `title` ou `tags`, restent intactes et agissent comme dans tout autre document. Si une valeur n'est pas valide, la valeur par défaut s'applique. Pour un thème inconnu ou non valide et pour un format inconnu, une **ligne d'indication** au-dessus de la diapositive en donne la raison.

## Apparence

### Les trois thèmes

| Thème | Aspect |
| ----- | ------ |
| `light` | texte foncé sur blanc, accent en bleu |
| `dark` | texte clair sur presque noir, accent en bleu clair |
| `accent` | texte blanc sur bleu soutenu, accent en jaune |

Les diapositives ont le même aspect sous chaque jeu de couleurs de l'application : le thème appartient à la présentation, pas à l'interface.

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

Chaque diapositive a un format fixe, 16:9 ou 4:3, et s'ajuste uniformément à la surface disponible ; le texte grandit et rétrécit avec elle. Ce qui ne tient pas sur la diapositive est coupé au bord, et une **barre hachurée** au bord inférieur signale la diapositive trop pleine. La barre n'apparaît ni dans le diaporama ni dans les exports. Le remède est une diapositive de plus.

## Numéro de page, en-tête et pied de page

`paginate: true` affiche sur chaque diapositive son numéro en bas à droite. `header` et `footer` placent une ligne en haut ou en bas de chaque diapositive ; une mise en forme simple comme le gras, l'italique ou un lien apparaît mise en forme. Une valeur vide n'affiche aucune ligne, un texte trop long se termine par des points de suspension. Ces indications valent de la même façon pour toutes les diapositives.

## Notes de l'orateur

Les commentaires d'une diapositive sont ses **notes de l'orateur**. Les deux formes sont valables :

```markdown
# Résultats

- Chiffre d'affaires en hausse
- Coûts en baisse

%% Citer ici les chiffres de l'année précédente. %%

<!-- En cas de questions, renvoyer à l'annexe. -->
```

Les notes ne se trouvent que dans la source : ni sur la diapositive, ni dans le diaporama, ni dans le PDF, ni dans les pages HTML. Dans l'éditeur, elles restent visibles. Si l'extension « Commentaires » est désactivée, `%%` est du texte ordinaire et apparaît sur la diapositive ; les commentaires HTML restent alors des notes. Les commentaires privés avec `%%` sont décrits sur la page [Constructions en ligne](inline.md).

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

## Diaporama

Le diaporama montre la présentation en **plein écran** : la fenêtre passe en plein écran, toutes les barres de l'application disparaissent et l'on ne voit plus que la diapositive, aussi grande que l'écran le permet. Il se lance dans la vue **Diapositives** :

- par **Affichage → Présentation → Lancer le diaporama**,
- avec `F5` par défaut,
- avec le bouton **Lancer le diaporama** au-dessus de la diapositive.

La palette de commandes propose aussi la commande. Le diaporama commence à la diapositive que la vue affiche à ce moment. On fait défiler avec les mêmes touches que dans la vue ; en plus, un **clic de souris** passe à la diapositive suivante, et la **molette de la souris** avance ou recule d'une diapositive par mouvement, vers le bas pour avancer et vers le haut pour reculer.

On le **quitte** avec `Échap`. Il se termine aussi lorsque le plein écran est quitté d'une autre manière, lorsqu'une autre fenêtre passe au premier plan ou lorsque le document ou la vue change. Ensuite, la vue reste sur la dernière diapositive affichée. La fenêtre quitte à nouveau le plein écran, sauf si elle y était déjà avant le diaporama.

## Exporter les diapositives

Les deux exports se trouvent sous **Fichier → Autres fonctions de fichier → Exporter** et dans la palette de commandes. Ils sont proposés pour tout document de présentation, quelle que soit la vue dans laquelle il est affiché ; pour un document sans indicateur, ils restent atténués. Chaque diapositive y apparaît telle que la vue la montre, avec thème, images d'arrière-plan, numéro de page, en-tête et pied de page, diagrammes et formules, mais sans notes de l'orateur et sans la barre des diapositives trop pleines. Si l'on annule la boîte de dialogue, rien n'est créé. Après l'export, la barre d'état indique le nombre de diapositives et, si quelque chose a été omis, quoi.

### En PDF

**Exporter les diapositives en PDF…** demande la cible, en proposant le nom du document avec l'extension `.pdf` dans le même dossier, et écrit un fichier PDF avec **une diapositive par page**. La page a le format de la diapositive, 16:9 ou 4:3, et aucune marge. Les réglages de format de papier et de marges de l'export PDF ordinaire n'ont pas d'effet ici.

### En pages HTML

**Exporter les diapositives en HTML…** demande un dossier et y crée **une page HTML par diapositive** : `folie-001.html`, `folie-002.html` et ainsi de suite, plus `index.html` comme page de départ avec la première diapositive. Si le dossier choisi est vide ou contient un export antérieur, les pages y sont créées ; sinon un sous-dossier portant le nom du document et le suffixe `-diapositives` est créé, et les fichiers déjà présents restent intacts.

Tout navigateur ouvre les pages, sans l'application et sans connexion réseau. Chaque page est complète à elle seule : images, diagrammes et formules y sont intégrés, si bien que le dossier peut être déplacé ou transmis en entier. Sous la diapositive se trouvent **Précédente**, le compteur et **Suivante**, dans la langue qu'avait l'interface au moment de l'export ; on fait aussi défiler avec les mêmes touches que dans le diaporama, et la diapositive s'adapte à la taille de la fenêtre du navigateur. Les liens et les images suivent les règles de l'export HTML d'un document (voir [Outils](tools.md)) : un lien vers un autre document reste du texte, et une image qui ne peut pas être intégrée apparaît sous la forme de son texte ; une telle image d'arrière-plan est omise.

## L'extension « Vue présentation »

La fonction fait partie des [extensions internes](extensions.md) (« Vue présentation », groupe « Rendu ») et du mode de travail **Avancé** : en mode **Débutant** elle est désactivée, en **Avancé** et **Complet** elle est activée.

Désactivée, la vue **Diapositives**, le sous-menu **Présentation** du menu **Affichage**, les deux commandes d'export et leurs entrées dans la palette de commandes et les raccourcis disparaissent. L'indicateur n'a alors aucun effet : un document de présentation est un document Markdown ordinaire, et `---` y est une ligne horizontale. Un document ouvert dans la vue **Diapositives** apparaît dans la vue de lecture. Rien ne se perd, et la désactivation comme la réactivation n'écrivent jamais rien ; après la réactivation, la présentation est là, inchangée.

## Compatibilité avec d'autres outils

L'indicateur, les clés de pilotage, les lignes de séparation et l'écriture d'image avec `bg` suivent un outil répandu qui crée des diapositives à partir de Markdown et marque ses fichiers par `marp: true`. La compatibilité est un engagement explicite : une présentation écrite là-bas s'ouvre ici comme présentation, sans qu'il faille rien changer au fichier.

**Ce qui vaut ici comme là-bas :** l'indicateur `marp: true`, la séparation à `---`, les clés `paginate`, `header`, `footer` et `size`, l'écriture d'image `![bg …](…)` avec le partage en deux, et les commentaires HTML comme notes de l'orateur. Les commentaires portant des directives de l'autre outil ne comptent comme notes ni ici ni là-bas.

**Où l'application diffère :**

- **`***` et `___` ne séparent pas de diapositives ici.** L'autre outil commence aussi une nouvelle diapositive à ces lignes. Qui veut un fichier découpé de la même façon dans les deux outils sépare uniquement avec `---` et n'écrit pas de ligne sur une diapositive avec `***` ou `___`.
- **L'autre outil ne connaît pas les notes `%%`** et les affiche comme texte sur la diapositive. Qui a besoin de notes dans les deux outils les écrit comme commentaire HTML `<!-- … -->` ; celles-ci valent dans les deux sens.
- **Les directives par diapositive n'ont pas d'effet ici.** Des commentaires comme `<!-- _paginate: false -->` ou `<!-- _class: lead -->`, par lesquels l'autre outil met en forme différemment certaines diapositives, restent dans le document mais ne sont pas exécutés ; les indications de l'en-tête valent pour toutes les diapositives. La clé d'en-tête `headingDivider`, avec laquelle l'autre outil commence une nouvelle diapositive aux titres, n'a pas non plus d'effet : un fichier qui l'utilise donne ici moins de diapositives. Les deux arriveront avec une étape d'extension ultérieure.

**À noter par ailleurs :**

- L'application n'écrit jamais `marp: true` elle-même. Qui veut projeter son fichier aussi dans l'autre outil l'ajoute en plus de `presentation: true`.
- Les noms de thème diffèrent. Un nom de thème de l'autre outil est inconnu ici ; les diapositives apparaissent alors dans le thème `light`, et la ligne d'indication cite le nom. Le bloc sous `theme:` avec des valeurs propres est une écriture de cette application.
- Le mot `bg` doit ici être le **premier** mot du texte alternatif. Les mots suivants, comme des filtres d'image, ne sont pas interprétés.

## Limites

- **Les notes n'apparaissent que dans la source.** Il n'existe pas de vue de l'orateur avec notes, diapositive suivante et horloge, ni de notes dans le PDF ou dans les pages HTML.
- **Une vue d'ensemble** des diapositives sous forme de grille n'existe pas ; on fait défiler les diapositives.
- **Les thèmes propres** ne naissent que par le bloc sous `theme:` dans l'en-tête ; il n'y a pas d'éditeur de thèmes dans les paramètres.
- **Les exports sont le PDF et les pages HTML.** Aucun fichier au format pptx n'est créé.
- **L'apparence vaut pour toute la série de diapositives.** Un thème, un arrière-plan ou un en-tête propre à une seule diapositive ne peut pas être indiqué, et un titre ne commence pas de lui-même une nouvelle diapositive.
- **On modifie dans les vues Markdown**, pas sur la diapositive.

La vue de l'orateur, la vue d'ensemble des diapositives, l'éditeur de thèmes, les indications par diapositive, la séparation aux titres et l'export en fichier pptx sont prévus pour des étapes d'extension ultérieures.
