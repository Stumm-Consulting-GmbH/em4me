# Tableau Kanban

Un **tableau Kanban** dispose dans l'espace les tâches d'**un seul** document : chaque liste nommée du document se place côte à côte comme **colonne**, chaque ligne de tâche qu'elle contient comme **carte**. Faire glisser une carte d'une colonne à la suivante déplace sa ligne dans le document — le tableau est une surface de travail, pas une évaluation.

Le tableau est une **vue de plus sur le même document** et non un format de fichier à part. Tout ce qui s'y trouve est du Markdown ordinaire dans le fichier ; les autres vues montrent les mêmes titres et les mêmes listes de tâches qu'auparavant, et passer de l'une à l'autre ne change rien au texte.

## À quoi se reconnaît un tableau

À la **marque d'en-tête** `kanban-plugin` dans l'en-tête du document :

```markdown
---
kanban-plugin: board
---
```

Ce qui compte est la **présence** de la clé, non sa valeur : `board`, `list` ou autre chose — tout document portant cette clé est un tableau, et la valeur trouvée reste intacte. Un document sans cette clé n'est pas un tableau, même s'il porte des titres et des listes de tâches.

## L'extension « Kanban »

La fonction fait partie des [extensions internes](extensions.md) (« Vue tableau (Kanban) »). Désactivée, le mode de vue disparaît, les commandes pour la carte, la colonne et le tableau disparaissent, et avec elles le sous-menu **Tableau Kanban** du menu **Affichage**, qui ne reste pas vide. Le document reste lisible tel quel ; rien n'est jamais écrit à l'état désactivé, et colonnes et cartes restent dans le texte.

Le tableau suppose l'extension **Tâches**, car une carte **est** une ligne de tâche. Si celle-ci est désactivée, le tableau l'est aussi.

## Créer un tableau

Deux voies, toutes deux dans le menu **Affichage → Tableau Kanban** et dans la palette de commandes (`Ctrl+K` par défaut) :

| Voie | Effet |
| ---- | ----- |
| **Nouveau tableau Kanban** | crée un document neuf, encore sans nom, le remplit d'un tableau de départ et l'ouvre aussitôt en vue tableau |
| **Convertir le document vide en tableau Kanban** | écrit le même tableau de départ dans le document ouvert |

**Nouveau tableau Kanban** est toujours disponible — c'est la voie vers le premier tableau et elle n'en suppose aucun.

**La conversion**, elle, n'est disponible que pour un document **vide** qui n'est pas déjà un tableau ; sinon l'entrée reste visible et atténuée. La raison tient à la sécurité de vos fichiers : un document avec du contenu serait écrasé. L'entrée suit la frappe — au premier caractère elle perd son fondement, au dernier caractère effacé elle le retrouve. Elle suppose en outre un document modifiable ; si l'une des conditions manque, la barre d'état le dit au lieu de ne rien faire en silence.

Le tableau de départ porte trois colonnes — **À faire**, **En cours** et **Terminé** — et la dernière est réglée pour marquer comme terminées les cartes qu'on y dépose. Les titres sont dans la langue de l'interface ; ils se modifient comme n'importe quel autre titre de colonne.

## Ouvrir la vue tableau

Le tableau est le septième mode de vue, aux côtés de Source, Divisée, Rendu, Direct, Carte mentale et Canevas : **Affichage → Tableau**, le bouton de la barre d'état ou `Ctrl+7` par défaut. Comme pour les autres modes, le choix vaut par document ouvert et non pour toute l'application, et il est rétabli au démarrage suivant.

**Le mode dépend du document.** Il n'est sélectionnable que si le document ouvert est un tableau — une vue tableau sans tableau ne montrerait qu'un message. Sans la marque d'en-tête, le bouton et l'entrée de menu restent **visibles et atténués** ; la raison figure dans l'infobulle du bouton. Le chemin par le raccourci et la palette de commandes ne mène alors nulle part et ne vous éjecte pas non plus de votre vue actuelle. Dès que la marque apparaît dans le texte ou en disparaît, l'accès suit, et un document qui était ouvert en vue tableau à la fermeture et qui n'est plus un tableau s'ouvre en vue de lecture. La [surface Canvas](canvas.md) a la même propriété ; les cinq autres modes sont disponibles sur tout document.

## Ce que montre le tableau

- Les **colonnes** côte à côte, chacune avec son titre et le nombre de ses cartes ; si la colonne porte une limite, le compteur montre les deux, par exemple `2/3`. Si elles ne tiennent pas côte à côte, la bande de colonnes défile horizontalement ; une colonne longue défile verticalement pour elle-même.
- Les **cartes** les unes sous les autres, dans l'ordre de leurs lignes dans le document. Le texte de la carte est **rendu** : liens, tags, mises en valeur et images apparaissent comme en vue de lecture. Les tags figurent dans le texte là où ils sont écrits, ou au choix rassemblés en pied de carte.
- Les **lignes de suite indentées** d'une tâche figurent en complément sur sa carte.
- Les **indications de la tâche** — échéance et heure, priorité, récurrence et les autres marqueurs — figurent comme badges sous le texte de la carte.
- L'**état** de la tâche apparaît comme case à cocher sur la carte, avec le caractère qui figure dans le document — y compris un caractère d'état personnalisé.
- Une colonne qui marque comme terminées les cartes qu'on y dépose porte pour cela une marque à côté de son compteur de cartes.

Un tableau sans colonnes et une colonne sans cartes le disent à leur place au lieu de montrer une surface vide. Si une partie du tableau ne peut pas être lue, un encadré d'information figure au-dessus avec le numéro de ligne et une phrase par constat ; ce qui a pu être lu apparaît toujours en dessous.

## Cartes

| Action | Souris | Clavier | Menu contextuel | Commande |
| ------ | ------ | ------- | --------------- | -------- |
| Créer | bouton **Ajouter une carte** au pied de la colonne | — | — | **Ajouter une carte au tableau** |
| Sélectionner | clic sur la carte | — | — | — |
| Modifier | double-clic sur la carte | `Entrée` ou `F2` | **Modifier la carte** | — |
| Valider | clic hors de la carte | `Entrée` | — | — |
| Abandonner | — | `Échap` | — | — |
| Changer l'état | clic sur la case | `Espace` | — | — |
| Définir ou changer l'échéance | clic sur le badge d'échéance | — | **Définir la date…** | — |
| Retirer l'échéance | — | — | **Retirer la date** | — |
| Archiver | — | — | **Archiver la carte** | **Archiver la carte du tableau** |
| Supprimer | — | `Suppr` | **Supprimer la carte** | — |

**Une nouvelle carte est immédiatement saisissable** et naît au pied de la colonne où elle a été créée. Si son texte reste vide, aucune carte n'est créée — ni dans le document ni comme étape d'annulation.

**Ce qui se modifie est le texte brut de la carte**, sur une seule ligne. Qui écrit une carte écrit du Markdown et doit le voir. Les marqueurs de la ligne de tâche — échéance, heure, priorité et récurrence — appartiennent à la ligne et restent intacts pendant la modification ; les lignes de suite indentées également. Une échéance dans l'écriture de l'autre outil figure en revanche dans le texte et est réécrite à la validation (voir « Indications sur la carte »). Un texte inchangé n'écrit rien dans le document.

**Le changement d'état emprunte le même chemin qu'un clic sur la case en vue de lecture**, chaîne des états, dates automatiques et récurrence comprises. Il n'existe pas de seconde logique d'état.

**La suppression se fait sans confirmation.** L'action est à une seule étape d'annulation, et une question sur chaque carte serait un clic de trop. Ensuite la sélection passe à la carte suivante de la colonne, sinon à la précédente.

## Colonnes

| Action | Souris | Clavier | Menu contextuel | Commande |
| ------ | ------ | ------- | --------------- | -------- |
| Créer | bouton **Ajouter une colonne** au bout de la bande | — | — | **Ajouter une colonne au tableau** |
| Renommer | double-clic sur le titre de la colonne | — | **Renommer la colonne** | — |
| Valider | clic hors du champ | `Entrée` | — | — |
| Abandonner | — | `Échap` | — | — |
| Définir ou changer la limite | — | — | **Définir la limite…** | — |
| Supprimer la limite | — | — | **Supprimer la limite** | — |
| Supprimer | — | — | **Supprimer la colonne** | — |
| Activer ou désactiver le marquage | — | — | **Marque comme terminées les cartes qui y sont déplacées** (avec une coche) | — |

Le bouton **Ajouter une colonne** existe aussi sur un tableau sans aucune colonne ; sinon il n'y aurait aucune voie vers la première. Si le titre reste vide, aucune colonne n'est créée.

**Le renommage ne touche que la ligne de titre** — indentation, dièses et espacement restent, une limite reste dans l'écriture où elle a été trouvée, et les cartes de la colonne restent intactes.

**La suppression demande confirmation dès que la colonne porte des cartes.** Une colonne vide disparaît sans question ; une colonne remplie indique dans la question son titre et son nombre de cartes, et le bouton **Annuler** est présélectionné. La raison de cette différence : supprimer une colonne fait disparaître plus que l'action n'annonce, à savoir ses cartes aussi.

Les deux commandes de création — pour la carte et pour la colonne — et l'archivage de la carte sélectionnée figurent dans le menu **Affichage → Tableau Kanban** et dans la palette de commandes. Aucun raccourci clavier n'est prédéfini pour elles ; il s'attribue dans les paramètres.

## Déplacer à la souris

**Une carte se saisit par la carte, une colonne par sa tête.** Pendant le déplacement, l'élément déplacé s'efface et une marque montre où il sera déposé. Le pointeur près du bord, la surface sous lui continue de défiler — la bande de colonnes horizontalement, la liste des cartes verticalement.

Quelle colonne est visée, l'horizontale seule en décide : un pointeur sous la dernière carte vise toujours cette colonne.

Le déplacement se termine au relâchement. `Échap`, la perte de la fenêtre et le relâchement hors de toute colonne l'interrompent sans modifier le document ; il en va de même si la carte retombe à sa propre place. Après le dépôt, la carte déplacée est sélectionnée.

Tant qu'une carte ou un titre de colonne est en cours de modification, aucun déplacement ne commence ; dans un document non modifiable, pas davantage. **Sans souris, il n'est pas possible de déplacer** ; toutes les autres actions du tableau sont également accessibles au clavier et par les menus.

## Une colonne qui marque comme terminé

Chaque colonne porte le réglage **Marque comme terminées les cartes qui y sont déplacées**, commuté par son menu contextuel. Lorsqu'il est actif :

- Une carte déposée **dedans** et encore ouverte est marquée comme terminée.
- Une carte terminée sortie de cette colonne **vers** une colonne ordinaire est rouverte.
- Un réagencement entre deux colonnes ordinaires laisse l'état intact.

Déplacer et marquer forment ensemble **une** action, donc une seule étape d'annulation. Quel état est posé, la chaîne des états des tâches en décide, et la date d'achèvement apparaît et disparaît comme en vue de lecture.

**Si la carte porte une règle de récurrence**, le marquage crée la prochaine occurrence de la tâche, comme partout ailleurs. Sur le tableau, cette occurrence atterrit **dans la colonne d'où la carte a été tirée**, à la place de l'ancienne carte — et non dans la colonne des terminés. Une tâche ouverte dans la colonne des terminés serait exactement la contradiction qu'un tableau est là pour lever. Lors d'un réagencement dans la même colonne, l'occurrence y reste et prend l'ancienne place de la carte.

## Indications sur la carte

Sous le texte de la carte figure une rangée de **badges** avec les indications de la tâche : l'échéance avec son heure, les dates planifiée et de début, la priorité, la récurrence et les autres marqueurs de tâche. Ce sont les mêmes badges qu'en vue de lecture, avec le même signalement des indications en retard et invalides. Une carte sans indications ne porte pas une telle rangée.

**Définir et retirer l'échéance.** Le menu contextuel d'une carte propose **Définir la date…** et, dès que la carte porte une échéance, **Retirer la date** ; un clic sur le badge d'échéance mène également à la définir. Le choix se fait dans le sélecteur de date des tâches, avec une heure au choix et prérempli avec l'échéance existante. L'échéance s'écrit dans la ligne de la carte selon l'écriture des tâches de l'application :

```markdown
- [ ] Envoyer le devis 📅 2026-10-02 14:00
```

Elle apparaît donc aussi en vue de lecture et dans les requêtes de tâches. Chaque définition et chaque retrait est une étape d'annulation ; si le document change pendant que le sélecteur de date est ouvert, le choix est abandonné et la barre d'état le dit.

**Affichage relatif.** Avec le commutateur **Affichage → Tableau Kanban → Afficher les dates en relatif**, les dates d'échéance, planifiée et de début se lisent à partir d'aujourd'hui : « aujourd'hui », « demain », « dans 3 jours », « il y a 2 jours », dans la langue de l'interface et avec l'heure ajoutée. La date exacte figure alors dans l'infobulle du badge. Les dates de création, de fin et d'annulation restent absolues, car elles consignent le moment où quelque chose s'est produit. Le commutateur est désactivé par défaut, vaut pour tous les tableaux de toutes les fenêtres et ne change rien au document.

**Échéances dans l'écriture de l'autre outil.** L'outil de tableaux dont provient le format écrit une échéance sous la forme `@{…}` et une heure sous la forme `@@{…}` dans la ligne de la carte. Le tableau lit les deux et les montre comme badge d'échéance à bordure en pointillés ; son infobulle en indique l'origine. **À la première modification de la carte, une telle échéance est réécrite dans l'écriture des tâches** — à la validation d'un texte de carte modifié comme à la définition et au retrait de l'échéance. La première ligne devient la seconde :

```markdown
- [ ] Envoyer le devis @{2026-10-02} @@{14:00}
- [ ] Envoyer le devis 📅 2026-10-02 14:00
```

**Cela a un prix :** dans l'autre outil, l'échéance réécrite n'apparaît ensuite plus que comme texte de la tâche et non plus comme date de la carte. Qui tient un tableau dans les deux outils devrait le savoir avant de modifier ici une telle carte. Sans modification, rien n'est réécrit : ouvrir, changer l'état, déplacer et archiver laissent la ligne telle qu'elle est. Une échéance de cette écriture qui ne peut pas être lue — une date qui n'existe pas, ou une heure sans date — reste dans le texte de la carte et apparaît en plus comme badge invalide dont l'infobulle donne la raison. Une [valeur de calendrier](custom-calendars.md) de l'application sous la même forme entre accolades n'est pas une telle échéance et reste intacte.

## Tags en pied de carte

Sur la carte, les tags figurent d'abord là où ils sont écrits : dans le texte de la carte, rendus comme en vue de lecture. Avec le commutateur **Affichage → Tableau Kanban → Tags en pied de carte**, ils quittent le texte affiché et figurent rassemblés sur une rangée propre au pied de la carte — y compris les tags des lignes de suite indentées, chacun une fois et dans l'ordre de son apparition. Le commutateur est désactivé par défaut, vaut pour tous les tableaux de toutes les fenêtres et ne change rien au document : les tags restent dans la ligne où ils se trouvent.

Un clic sur un tag de la carte — en pied comme dans le texte — filtre la barre latérale des tags sur lui, comme en vue de lecture ; la sélection et la modification de la carte n'en sont pas affectées. Pendant qu'une carte est modifiée, sa rangée de tags est masquée, car la saisie montre le texte brut avec ses tags. Les deux commutateurs d'affichage ne sont sélectionnables que dans la vue tableau ouverte.

## Limite par colonne

Une colonne peut porter une **limite** : le nombre de cartes qu'elle doit contenir au plus. Dans le document, elle figure entre parenthèses à la fin du titre de la colonne, par exemple `## En cours (3)` ; sur le tableau, elle n'apparaît pas dans le titre mais dans le compteur : `2/3`.

Elle se définit et se modifie par **Définir la limite…** dans le menu contextuel de la tête de colonne. La saisie apparaît à la place du compteur et, comme un titre de colonne, se valide avec `Entrée` ou un clic à côté et s'abandonne avec `Échap`. Une saisie vide ou `0` supprime la limite, de même que l'entrée **Supprimer la limite**, que le menu propose dès qu'une limite est définie.

**La limite ne bloque pas.** Si la colonne porte plus de cartes qu'elle n'en prévoit, son compteur est mis en évidence et son infobulle indique « limite dépassée » ; on peut malgré tout y déposer et y créer des cartes. Le tableau montre ce qui est et vous laisse la décision. Un `(0)` écrit à la main ne compte pas comme limite et reste une partie du titre.

## Archive

**Archiver la carte** dans le menu contextuel d'une carte, ou la commande **Archiver la carte du tableau** pour la carte sélectionnée, retire la carte avec ses lignes de suite indentées de sa colonne et l'écrit à la fin de la **section d'archive** du même document. Un horodatage fait de la date et de l'heure se place devant son texte ; son état et ses autres indications restent tels quels :

```markdown
***

## Archive

- [x] 2026-09-23 14:05 Recueillir l'exigence
```

Si la section manque, elle naît derrière la dernière colonne, avec le titre que l'autre outil écrit lui aussi dans la langue de l'interface ; une section existante est poursuivie avec son titre et son contenu.

**L'archive conserve les 100 cartes les plus récentes.** Si une carte s'ajoute alors qu'elle est pleine, la plus ancienne en sort ; une archive laissée par un autre outil avec davantage de cartes est ramenée aux 100 plus récentes au premier archivage.

**Une carte archivée ne se récupère pas sur le tableau**, car l'archive n'y apparaît pas. L'archivage est toutefois exactement une étape d'annulation, et dans le document la carte figure toujours en clair. Ensuite la sélection passe, comme lors de la suppression, à la carte suivante de la colonne ; sans carte sélectionnée, la commande reste sans effet.

## Rechercher et filtrer les cartes

Dans la vue tableau, la commande de recherche (`Ctrl+F` par défaut) ouvre un **champ de filtre** au-dessus des colonnes au lieu de la recherche dans le texte. Dès la frappe, le tableau masque toute carte dont le texte ne contient pas le terme cherché ; les colonnes restent en place, et leur compteur montre les correspondances et le total, par exemple `1/3`. Si aucune carte ne correspond, un message sous le champ le dit.

Sont parcourus le texte de la carte et ses lignes de suite indentées, y compris les tags et les échéances qui s'y trouvent ; majuscules et minuscules ne jouent aucun rôle. Le terme est cherché comme une seule suite de caractères : `vérifier le devis` trouve « Vérifier le devis », `devis vérifier` non. C'est la même règle que dans le champ de filtre de la liste des cartes d'une [surface Canvas](canvas.md).

**Le document reste inchangé**, car le filtre ne fait que masquer ; il agit donc aussi dans un document non modifiable. Une carte masquée ne reste pas sélectionnée, afin qu'aucune touche n'agisse sur une carte invisible. La mise en évidence d'une limite dépassée reste pendant le filtre, car elle compte toutes les cartes de la colonne.

`Échap` dans le champ met fin au filtre et montre de nouveau toutes les cartes ; de même le passage à une autre vue ou à un autre document. Si le tableau se redessine entre-temps, le texte cherché et le focus de saisie sont conservés.

## Annuler

`Ctrl+Z` reprend la dernière action sur le tableau, `Ctrl+Y` et `Ctrl+Maj+Z` la rétablissent. Chaque action est exactement une étape : une carte créée, un texte modifié, un changement d'état, un déplacement avec son marquage, une colonne supprimée avec toutes ses cartes, une échéance définie ou retirée, une limite modifiée, une carte archivée. Tant que la saisie d'une carte ou d'un titre de colonne est ouverte, `Ctrl+Z` s'applique au texte frappé là.

Si le document change entre-temps ailleurs — parce que le même document est modifié à côté, par exemple —, l'action entamée est abandonnée au lieu d'être écrite à l'aveugle ; la barre d'état le dit, et le tableau se redessine.

## Consultation seule

Le tableau suit la modifiabilité de son document. Tant que le document est en simple affichage, sans mode d'édition activé, le tableau est **en consultation seule** : pas de boutons, pas de déplacement, pas de saisie, pas de case cliquable, et le menu contextuel reste sans entrées. Le chemin par la palette de commandes et les menus ne contourne pas cela ; l'échec est dit dans la barre d'état et non passé sous silence. Regarder, sélectionner, faire défiler et filtrer les cartes restent permis, car cela ne touche pas au document ; les deux commutateurs d'affichage également. Le badge d'échéance n'est ici qu'un affichage.

Le mode d'édition libère la manipulation — le crayon de la barre d'état, `Ctrl+E` par défaut ; les détails figurent sur la page [Vues et affichage](views-display.md).

## Tableau et requête de tâches

Le tableau et la [requête de tâches](tasks.md) montrent tous deux des tâches et désignent des choses différentes :

| Question | Requête de tâches | Tableau Kanban |
| -------- | ----------------- | -------------- |
| D'où viennent les lignes ? | de **tous** les fichiers de l'espace de recherche | d'**un seul** document |
| D'où vient l'ordre ? | du filtre, du tri et du regroupement de la requête | de l'endroit où la ligne se trouve dans le document |
| Que produit un réagencement ? | rien — la requête recalcule | la ligne se déplace dans le document |
| Quel est le résultat ? | une vue sur vos fichiers | une surface de travail avec son ordre propre |

En bref : la requête **collecte** sur l'ensemble des fichiers et ordonne selon des règles ; le tableau **range** à la main les lignes d'un document et retient ce rangement, parce qu'il figure dans le texte. Les deux ne s'excluent pas — les tâches d'un tableau apparaissent dans une requête comme toute autre ligne de tâche.

## Le format d'enregistrement

Un tableau se trouve en clair dans son document. Il est donc lisible sans cette application, et qui ouvre le fichier dans un outil de texte voit une liste de tâches ordinaire par colonne.

### Structure

| Partie | Comment elle figure dans le document |
| ------ | ------------------------------------ |
| Marque | la clé `kanban-plugin` dans l'en-tête |
| Colonne | un **titre** portant le nom de la colonne |
| Réglage « terminé » | juste sous le titre, une ligne composée de rien d'autre qu'un **groupe de mots en gras** |
| Limite | un nombre entre parenthèses à la fin du titre, par exemple `## En cours (3)` |
| Carte | une **ligne de tâche** sous ce titre |
| Échéance d'une carte | le marqueur d'échéance `📅` avec une date et, au choix, une heure dans la ligne de tâche |
| Complément d'une carte | les lignes **indentées** juste sous sa ligne de tâche |
| Archive | tout ce qui suit une ligne de séparation faite de trois astérisques : un titre, puis les cartes archivées avec leur horodatage |
| Réglages | un commentaire privé entre marqueurs `%%` en fin de fichier |

Un exemple :

```markdown
---
kanban-plugin: board
---

## À faire

- [ ] Vérifier le devis #achats
  La question aux achats est encore ouverte
- [ ] Confirmer le rendez-vous 📅 2026-10-02 14:00


## En cours (2)

- [/] Rédiger le chapitre du manuel


## Terminé

**Complete**

- [x] Recueillir l'exigence


***

## Archive

- [x] 2026-09-01 09:15 Esquisser le modèle
```

**Le niveau de titre n'est pas figé.** Deux dièses sont écrits ; tout niveau est lu, et une colonne nouvellement créée reprend le niveau de la première colonne existante. Un tableau écrit à la main n'est donc pas rejeté.

**La marque de fin est le texte en gras lui-même**, et non un mot précis : elle est reconnue à sa forme et reprise dans l'orthographe qui figure dans le fichier. Lorsque l'application crée elle-même une telle colonne, elle écrit d'abord le libellé déjà présent dans ce tableau, et sinon le libellé de la langue d'interface choisie.

**Les lignes vides font partie de la forme :** une ligne vide sous le titre ou sous la marque de fin, deux avant le titre suivant. Une colonne vide sans marque porte donc trois lignes vides d'affilée.

**L'archive** se trouve derrière la dernière colonne et commence par la ligne de séparation ; elle est reconnue à cette ligne, non au libellé de son titre. Chaque carte archivée porte devant son texte un horodatage de la forme `AAAA-MM-JJ HH:mm`.

### Ce qui reste intact

**La section d'archive et le bloc de réglages ne sont pas montrés sur le tableau.** Le bloc de réglages n'est jamais modifié, la section d'archive seulement lors de l'archivage d'une carte ; sinon tous deux restent tels quels dans le fichier, et qui ouvre un tableau et le referme sans modification récupère exactement le même fichier — y compris les fins de ligne, un saut de ligne final absent et toutes les indications que cette application ne connaît pas.

Une exception pour une bonne raison : si le bloc de réglages contient la liste des colonnes repliées, elle suit lors de la création, de la suppression et du déplacement d'une colonne. Si elle restait en l'état, l'autre outil aurait ensuite replié les mauvaises colonnes. Tout le reste du bloc demeure caractère pour caractère tel qu'il était.

Seule la plage de lignes qui change réellement est écrite — jamais le document entier. Le curseur et les replis de l'éditeur restent donc en place.

## Compatibilité avec d'autres outils

Le format vient d'un outil de tableaux très répandu pour les notes en Markdown, et la compatibilité avec lui est une promesse explicite : un tableau écrit là-bas s'ouvre et se modifie ici, et un tableau modifié ici se réutilise là-bas.

**Ce qui est lu et conservé :**

- la marque d'en-tête avec sa valeur, quelle qu'elle soit,
- les colonnes, les cartes et leurs lignes de suite indentées,
- la limite dans le titre de colonne, y compris dans l'écriture sans espace avant la parenthèse,
- les échéances et heures dans l'écriture de l'autre outil, jusqu'à la première modification de leur carte (voir plus bas),
- la marque de fin dans **sa** langue, même si ce n'est pas celle de l'interface,
- la section d'archive derrière la ligne de séparation, avec son titre et ses cartes,
- le bloc de réglages en fin de fichier avec toutes ses indications, y compris inconnues,
- tout le reste de ce qui figure dans le fichier : cela voyage sans changement.

**Ce qui change à la modification :** une échéance dans l'écriture de l'autre outil est réécrite dans l'écriture des tâches de l'application à la première modification de sa carte (voir « Indications sur la carte »). **Dans l'autre outil, elle n'apparaît ensuite plus que comme texte** et non plus comme date de la carte. Toutes les autres indications d'une tâche — marqueurs de date, priorité, récurrence, tags — restent dans leur ligne et continuent d'agir partout ailleurs, en vue de lecture et dans les requêtes de tâches.

**Ce qui se passe autrement ici :** l'archivage pose toujours un horodatage et maintient l'archive à 100 cartes ; l'autre outil ne fait l'un et l'autre que s'il est réglé ainsi. Les indications de son bloc de réglages, comme un autre format de date ou une autre limite d'archive, ne sont pas exploitées par le tableau.

## Limites

- **Un document porte un tableau.** Plusieurs tableaux dans un fichier n'existent pas ; les colonnes du document sont les colonnes de l'unique tableau.
- **Seul un document vide est converti.** Un document avec du contenu n'est pas déclaré tableau, car du texte serait perdu ; qui veut reprendre une liste existante crée un tableau et y transporte le texte lui-même.
- **Le déplacement se fait à la souris.** Il n'existe pas de geste clavier pour déplacer cartes et colonnes.
- **Une carte porte une ligne.** Ce qui se modifie est le texte de la ligne de tâche ; ses lignes de suite indentées apparaissent sur la carte mais se modifient dans le document et non sur elle.
- **Ce qui est lu, c'est l'écriture par défaut de l'autre outil :** une échéance de la forme `@{AAAA-MM-JJ}` et une heure de la forme `@@{HH:mm}`, chaque fois la première occurrence dans la ligne de la carte. Un format réglé autrement, une seconde occurrence et la forme de lien `@[[…]]` restent du texte.
- **Sur le tableau, aucun chemin ne ramène de l'archive.** Les cartes archivées n'y apparaissent pas et ne se récupèrent que dans le document lui-même ; l'archive conserve un nombre fixe des 100 cartes les plus récentes.
- **Il n'existe pas de réglages par tableau.** Les deux commutateurs d'affichage valent pour tous les tableaux ; le bloc de réglages est lu et conservé, mais ses indications n'agissent pas sur le tableau.
- **Une carte n'est pas une note.** Aucune note propre ne naît d'une carte, la carte ne montre ni champs ni images d'une note liée, et une date sur la carte n'ouvre pas de note journalière.
- **Une colonne sans titre n'existe pas.** Les lignes de tâche placées avant le premier titre n'appartiennent à aucune colonne et n'apparaissent donc pas sur le tableau ; dans le document, elles restent en place.
